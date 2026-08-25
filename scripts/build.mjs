import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rspackBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'rspack.cmd' : 'rspack');

const dashboardBuild = spawnSync(rspackBin, ['--config', 'rspack.config.cjs'], { cwd: root, stdio: 'inherit' });
if (dashboardBuild.status !== 0) process.exit(dashboardBuild.status || 1);

const extensionBuild = spawnSync(process.execPath, ['scripts/build-extension.mjs'], { cwd: root, stdio: 'inherit' });
if (extensionBuild.status !== 0) process.exit(extensionBuild.status || 1);

const extensionDir = path.join(root, 'dist/extension');
const zipPath = path.join(root, 'dist/mocklane-extension.zip');
await fs.rm(zipPath, { force: true });
const zip = spawnSync('zip', ['-qr', zipPath, '.'], { cwd: extensionDir, stdio: 'inherit' });
if (zip.status !== 0) {
  console.error('build: zip command failed; install a zip utility to produce the extension archive');
  process.exit(zip.status || 1);
}
console.log(`dashboard: ${path.join(root, 'dist/dashboard')}`);
console.log(`extension zip: ${zipPath}`);
