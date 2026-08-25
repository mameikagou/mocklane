import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['src', 'bin', 'scripts'];
const files = [];

async function collect(directory) {
  const entries = await fs.readdir(path.join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(relative);
    else if (/\.(mjs|js|cjs)$/.test(entry.name)) files.push(relative);
  }
}

for (const directory of sourceRoots) await collect(directory);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `syntax error: ${file}\n`);
    process.exit(result.status || 1);
  }
}
console.log(`lint: checked ${files.length} JavaScript files`);
