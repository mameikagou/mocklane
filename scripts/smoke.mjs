import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { startDaemon } from '../src/daemon/server.mjs';

const help = spawnSync(process.execPath, ['bin/mocklane.js', '--help'], { encoding: 'utf8' });
if (help.status !== 0 || !help.stdout.includes('apply')) throw new Error('CLI help smoke test failed');

const daemon = await startDaemon({ port: 0 });
const port = daemon.address.port;
try {
  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
  if (!health.ok || health.extensionConnected) throw new Error('daemon health smoke test failed');
  const status = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: { name: 'status' } }),
  }).then((response) => response.json());
  if (status.ok || status.error?.code !== 'extension_not_connected') throw new Error('CLI/daemon RPC smoke test failed');
} finally {
  await daemon.close();
}

const reserve = net.createServer();
await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
const backgroundPort = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const background = spawnSync(process.execPath, ['bin/mocklane.js', 'daemon', '--background', '--port', String(backgroundPort)], { encoding: 'utf8' });
if (background.status !== 0) throw new Error(`background daemon CLI failed: ${background.stderr}`);
const backgroundResult = JSON.parse(background.stdout);
if (!backgroundResult.ok || !backgroundResult.data.pid || backgroundResult.data.port !== backgroundPort) throw new Error('background daemon output is incomplete');
let backgroundHealthy = false;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    const health = await fetch(`http://127.0.0.1:${backgroundPort}/health`).then((response) => response.json());
    if (health.ok) { backgroundHealthy = true; break; }
  } catch { /* detached daemon is still binding */ }
  await new Promise((resolve) => setTimeout(resolve, 25));
}
try { process.kill(backgroundResult.data.pid, 'SIGTERM'); } catch { /* already exited */ }
if (!backgroundHealthy) throw new Error('background daemon did not become healthy');
console.log('smoke: CLI help, daemon health, no-extension RPC, and --background passed');
