// usage: npm run export:apbx -- <output.apbx> [preset:<id>] [tweak-id ...]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildPlaybook, PRESETS, TWEAKS } from '../app/playbook.js';

const require = createRequire(import.meta.url);
const { verifyDistributionModels } = require('./verify-distribution-models.cjs');
const { copyVerifiedModel } = require('./model-store.cjs');
const { getPublicModelCatalog, getModelById } = require('./model-catalog.cjs');
const { sha256 } = require('./package-offline.cjs');
const { assertDesignGate } = require('./design-audit.cjs');
await assertDesignGate();
const [output = 'dist/CapsuleOS.apbx', ...rest] = process.argv.slice(2);
if (path.extname(output).toLowerCase() !== '.apbx') throw new Error('The output file must end in .apbx.');
const presetArg = rest.find((arg) => arg.startsWith('preset:'));
const tweakIds = rest.filter((arg) => !arg.startsWith('preset:'));
const allTweaksRequested = !presetArg && tweakIds.length === 0;
const { files, manifest } = buildPlaybook({
  preset: presetArg ? presetArg.slice(7) : undefined,
  tweakIds: allTweaksRequested ? TWEAKS.map((entry) => entry.id) : tweakIds,
  defaultTweakIds: allTweaksRequested ? PRESETS[0].tweakIds : undefined,
  includeToolboxInstaller: true,
});
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const offline = path.join(repositoryRoot, 'pre-release', 'Capsule Toolbox Offline');
const toolboxInstaller = path.join(offline, 'Install Capsule Toolbox.exe');
if (!fs.existsSync(toolboxInstaller)) {
  throw new Error(`The complete model-containing Toolbox distribution is missing: ${offline}. Run npm run toolbox:build first.`);
}
const bundleManifest = JSON.parse(fs.readFileSync(path.join(offline, 'BUNDLE-MANIFEST.json'), 'utf8'));
const auditFile = path.join(offline, 'design-audit.json');
if (bundleManifest.designAudit?.file !== 'design-audit.json'
    || bundleManifest.designAudit.sha256 !== await sha256(auditFile)
    || await sha256(auditFile) !== await sha256(path.join(repositoryRoot, 'dist', 'toolbox', 'design-audit.json'))) {
  throw new Error('Offline distribution design audit is missing, stale or not the currently verified build. Rebuild the Toolbox distribution.');
}
if (bundleManifest.version !== 1 || bundleManifest.installer?.file !== 'Install Capsule Toolbox.exe'
    || bundleManifest.installer.sha256 !== await sha256(toolboxInstaller)) throw new Error('The offline setup does not match its verified bundle manifest.');
await verifyDistributionModels(path.join(offline, 'models'));
manifest.toolboxModelsIncluded = getPublicModelCatalog().map(model => ({ id: model.id, revision: model.revision }));
files['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
files['Executables/CapsuleToolboxSetup.exe'] = fs.readFileSync(toolboxInstaller);
files['Executables/design-audit.json'] = fs.readFileSync(auditFile);
files['Executables/Install-CapsuleToolbox.ps1'] = fs.readFileSync(path.join(repositoryRoot, 'assistant', 'Install-CapsuleToolbox.ps1'));
files['playbook.png'] = fs.readFileSync(path.join(repositoryRoot, 'assets', 'capsule-playbook-icon.png'));
const target = path.resolve(output);
fs.mkdirSync(path.dirname(target), { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'apbx-'));
const candidate = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.apbx`);
try {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(stage, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  for (const model of getPublicModelCatalog()) {
    await copyVerifiedModel(path.join(offline, 'models', model.id), path.join(stage, 'Executables', 'models', model.id), getModelById(model.id));
  }
  const linuxManifest = JSON.parse(fs.readFileSync(path.join(offline, 'linux-runtime', 'manifest.json'), 'utf8'));
  if (await sha256(path.join(offline, 'linux-runtime', 'linux-runtime.tar')) !== linuxManifest.sha256) throw new Error('Bundled Linux runtime failed verification.');
  fs.mkdirSync(path.join(stage, 'Executables', 'linux-runtime'));
  for (const file of ['manifest.json', 'linux-runtime.tar']) fs.copyFileSync(path.join(offline, 'linux-runtime', file), path.join(stage, 'Executables', 'linux-runtime', file));
  // AME Wizard wants a 7z archive encrypted with the password "malte".
  const run = spawnSync('7z', ['a', '-t7z', '-pmalte', '-mhe=off', '-mx=3', '-mmt=2', '-bso0', '-bsp0', candidate, '*'], { cwd: stage, encoding: 'utf8' });
  if (run.error || run.status !== 0) throw new Error(`7z failed (is 7-Zip on PATH?): ${run.error?.message || run.stdout}`);
  const check = spawnSync('7z', ['t', '-pmalte', '-bso0', '-bsp0', candidate], { encoding: 'utf8' });
  if (check.error || check.status !== 0) throw new Error(`Archive verification failed: ${check.error?.message || check.stdout || check.stderr}`);
  fs.renameSync(candidate, target);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(candidate, { force: true });
}
console.log(`Wrote ${output}: ${manifest.tweaks.length} selectable tweaks, ${manifest.defaultTweaks.length} checked by default, optional Toolbox installer and both verified local models included${manifest.needsAdmin ? ' (some tweaks need admin)' : ''}`);
