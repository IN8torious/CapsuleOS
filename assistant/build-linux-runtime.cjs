'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { sha256 } = require('./package-offline.cjs');
const run = promisify(execFile);

async function buildLinuxRuntime() {
  const root = path.join(__dirname, '..', 'bundled-linux-runtime');
  await fs.mkdir(root, { recursive: true });
  const archive = path.join(root, 'linux-runtime.tar');
  const wsl = path.join(process.env.SystemRoot, 'System32', 'wsl.exe');
  const { stdout } = await run(wsl, ['--distribution', 'Pengwin', '--exec', 'wslpath', '-a', '-u', archive], { encoding: 'utf8' });
  await run(wsl, ['--distribution', 'Pengwin', '--cd', '~', '--exec', '/bin/tar', '-cf', stdout.trim(),
    '--exclude=node_modules/.bin', '-C', '.local/share/capsule-agent',
    'node-v22.23.4-linux-x64/bin/node', 'node-v22.23.4-linux-x64/LICENSE', 'node_modules', 'package.json'], { timeout: 120000 });
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    version: 1, architecture: 'x64', nodeVersion: '22.23.4', transformersVersion: '4.3.2',
    file: 'linux-runtime.tar', sha256: await sha256(archive), bytes: (await fs.stat(archive)).size,
    provenance: 'Packaged from the explicitly prepared Pengwin runtime. Linux native dependencies only; no models, caches, user ledgers or agent source included.'
  }, null, 2) + '\n');
  console.log('Prepared offline Linux Node/ONNX runtime payload with licenses; no distro or system settings changed.');
}
if (require.main === module) buildLinuxRuntime().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildLinuxRuntime };
