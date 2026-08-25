import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/extension/manifest.json'), 'utf8'));
if (packageJson.type !== 'module') throw new Error('package must use ESM');
if (manifest.manifest_version !== 3) throw new Error('extension must use Manifest V3');
if (manifest.background?.service_worker !== 'background.js') throw new Error('unexpected service worker');
if (!manifest.content_scripts?.some((script) => script.world === 'MAIN' && script.js.includes('interceptor.js'))) throw new Error('MAIN interceptor missing');
console.log('typecheck: package and MV3 manifest shape valid (JavaScript project; no TypeScript compiler configured)');
