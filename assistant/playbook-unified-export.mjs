// usage: npm run export:playbook -- [output.apbx] [--msi installer.msi --msi-sha256 SHA256]
// Lean CapsuleOS playbook: safety session, every catalog setting (Balanced checked), browser choice,
// Environment Capsule app packs, manager setup and repair toolkit; optional verified Toolbox MSI, no models.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPlaybook, PRESETS, TWEAKS, BROWSERS, PLAYBOOK_SCRIPTS } from '../app/playbook.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const output = path.resolve(args[0] && !args[0].startsWith('--') ? args.shift() : path.join(root, 'pre-release', 'CapsuleOSv2.apbx'));
let msiPath, expectedMsiHash;
while (args.length) {
  const flag = args.shift(), value = args.shift();
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  if (flag === '--msi' && !msiPath) msiPath = path.resolve(value);
  else if (flag === '--msi-sha256' && !expectedMsiHash) expectedMsiHash = value;
  else throw new Error(`Unsupported or duplicate argument: ${flag}.`);
}
if (Boolean(msiPath) !== Boolean(expectedMsiHash)
  || (msiPath && (path.extname(msiPath).toLowerCase() !== '.msi' || !/^[a-f0-9]{64}$/.test(expectedMsiHash)))) {
  throw new Error('MSI delivery requires --msi installer.msi and --msi-sha256 with the verified artifact SHA-256.');
}
function fileHash(file) {
  const digest = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
  const descriptor = fs.openSync(file, 'r');
  try {
    let bytes;
    while ((bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, bytes));
    return digest.digest('hex');
  } finally { fs.closeSync(descriptor); }
}
if (msiPath && fileHash(msiPath) !== expectedMsiHash) throw new Error('MSI artifact SHA-256 mismatch; delivery was not changed.');
if (path.extname(output).toLowerCase() !== '.apbx') throw new Error('The output file must end in .apbx.');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const packCatalog = JSON.parse(fs.readFileSync(path.join(root, 'playbook', 'packs.catalog.json'), 'utf8'));
const { files, manifest } = buildPlaybook({
  version: /^\d+\.\d+\.\d+$/.test(version) ? version : '0.1.0',
  tweakIds: TWEAKS.map((entry) => entry.id),
  defaultTweakIds: PRESETS[0].tweakIds,
  unified: true,
  includeToolboxInstaller: Boolean(msiPath),
  toolboxInstallerFormat: 'msi',
  packCatalog,
});

const hash = (content) => crypto.createHash('sha256').update(content).digest('hex');
for (const script of PLAYBOOK_SCRIPTS) {
  const content = fs.readFileSync(path.join(root, 'playbook', 'scripts', ...script.split('/')));
  files[`Executables/${script}`] = content;
}
const catalog = fs.readFileSync(path.join(root, 'playbook', 'packs.catalog.json'));
files['Executables/packs.catalog.json'] = catalog;
for (const browser of BROWSERS) {
  files[`Images/${browser.id}.png`] = fs.readFileSync(path.join(root, 'playbook', 'Images', `${browser.id}.png`));
}
files['playbook.png'] = fs.readFileSync(path.join(root, 'assets', 'capsule-playbook-icon.png'));
if (msiPath) {
  files['Executables/Install-CapsuleToolbox.ps1'] = fs.readFileSync(path.join(root, 'assistant', 'Install-CapsuleToolboxMsi.ps1'));
  files['Executables/CapsuleToolboxMsi.json'] = JSON.stringify({ version: 1, sha256: expectedMsiHash }) + '\n';
  manifest.toolboxInstaller = { format: 'msi', file: 'Executables/CapsuleToolbox.msi', sha256: expectedMsiHash,
    modelsIncluded: false, linuxRuntimeIncluded: false };
}
manifest.files = Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'manifest.json')
  .map(([name, content]) => [name, hash(content)]));
if (msiPath) manifest.files['Executables/CapsuleToolbox.msi'] = expectedMsiHash;
files['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`;

fs.mkdirSync(path.dirname(output), { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-playbook-'));
const candidate = path.join(path.dirname(output), `.${path.basename(output)}.${crypto.randomUUID()}.apbx`);
const zipOutput = output.slice(0, -5) + '.zip';
const zipCandidate = path.join(path.dirname(output), `.${path.basename(zipOutput)}.${crypto.randomUUID()}.zip`);
const delivery = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-playbook-delivery-'));
try {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(stage, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  if (msiPath) {
    const stagedMsi = path.join(stage, 'Executables', 'CapsuleToolbox.msi');
    fs.copyFileSync(msiPath, stagedMsi);
    if (fileHash(stagedMsi) !== expectedMsiHash) throw new Error('Staged MSI hash changed; delivery was not changed.');
  }
  // AME Wizard wants a 7z archive encrypted with the password "malte".
  const run = spawnSync('7z', ['a', '-t7z', '-pmalte', '-mhe=off', '-mx=7', '-bso0', '-bsp0', candidate, '*'], { cwd: stage, encoding: 'utf8' });
  if (run.error || run.status !== 0) throw new Error(`7z failed (is 7-Zip on PATH?): ${run.error?.message || run.stdout || run.stderr}`);
  const check = spawnSync('7z', ['t', '-pmalte', '-bso0', '-bsp0', candidate], { encoding: 'utf8' });
  if (check.error || check.status !== 0) throw new Error(`Archive verification failed: ${check.error?.message || check.stdout || check.stderr}`);
  const archiveName = path.basename(output);
  fs.copyFileSync(candidate, path.join(delivery, archiveName));
  fs.writeFileSync(path.join(delivery, 'README.md'), files['README.md']);
  fs.writeFileSync(path.join(delivery, 'manifest.json'), files['manifest.json']);
  const managerFiles = ['Install-WinGet.cmd', 'Install-Chocolatey.cmd', 'Install-CapsulePackageManager.ps1', 'Capsule.Common.psm1'];
  fs.mkdirSync(path.join(delivery, 'Package-Managers'));
  for (const name of managerFiles) fs.copyFileSync(path.join(stage, 'Executables', name), path.join(delivery, 'Package-Managers', name));
  const checksums = [archiveName, 'README.md', 'manifest.json', ...managerFiles.map(name => `Package-Managers/${name}`)]
    .map(name => `${hash(fs.readFileSync(path.join(delivery, name)))}  ${name}`).join('\n') + '\n';
  fs.writeFileSync(path.join(delivery, 'SHA256SUMS.txt'), checksums);
  const zip = spawnSync('7z', ['a', '-tzip', '-mx=7', '-bso0', '-bsp0', zipCandidate, '*'], { cwd: delivery, encoding: 'utf8' });
  if (zip.error || zip.status !== 0) throw new Error(`ZIP creation failed: ${zip.error?.message || zip.stdout || zip.stderr}`);
  const zipCheck = spawnSync('7z', ['t', '-bso0', '-bsp0', zipCandidate], { encoding: 'utf8' });
  if (zipCheck.error || zipCheck.status !== 0) throw new Error(`ZIP verification failed: ${zipCheck.error?.message || zipCheck.stdout || zipCheck.stderr}`);
  fs.renameSync(candidate, output);
  fs.renameSync(zipCandidate, zipOutput);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(delivery, { recursive: true, force: true });
  fs.rmSync(candidate, { force: true });
  fs.rmSync(zipCandidate, { force: true });
}
const size = fs.statSync(output).size;
console.log(`Wrote ${output} (${(size / 1024).toFixed(0)} KB): ${manifest.tweaks.length} settings (${manifest.defaultTweaks.length} checked), `
  + `${manifest.browsers.length} browsers + keep current, ${manifest.packs.length} app packs, repair toolkit, ${msiPath ? 'Toolbox MSI, ' : ''}restore point and baseline first.`);
console.log(`Wrote ${zipOutput}: playbook, README, payload manifest and SHA256SUMS.txt (no models).`);
