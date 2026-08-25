import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist/extension');
const rspackBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'rspack.cmd' : 'rspack');

const bundle = spawnSync(rspackBin, ['--config', 'rspack.extension.config.cjs'], { cwd: root, stdio: 'inherit' });
if (bundle.status !== 0) process.exit(bundle.status || 1);
await fs.cp(path.join(root, 'src/extension/manifest.json'), path.join(output, 'manifest.json'));
await fs.cp(path.join(root, 'src/extension/content.js'), path.join(output, 'content.js'));
console.log(`extension: ${output}`);
