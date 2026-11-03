const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'app', file)).href);

test('catalog is well formed and avoids security features', async () => {
  const { TWEAKS, CATEGORIES } = await load('playbook.js');
  assert.ok(TWEAKS.length >= 40);
  const ids = new Set();
  const guard = /Defender|SmartScreen|WindowsUpdate|FirewallPolicy|\\Services\\|powershell|cmd\.exe|\.exe/i;
  for (const entry of TWEAKS) {
    assert.ok(!ids.has(entry.id), `duplicate ${entry.id}`);
    ids.add(entry.id);
    assert.ok(CATEGORIES[entry.category], entry.id);
    assert.ok(['low', 'medium'].includes(entry.risk));
    for (const value of entry.values) {
      assert.ok(['HKCU', 'HKLM'].includes(value.root));
      assert.ok(!guard.test(`${entry.description} ${value.path} ${value.name}`), entry.id);
    }
  }
});

test('presets reference real tweaks and emit matching apply/revert', async () => {
  const { PRESETS, buildPlaybook } = await load('playbook.js');
  for (const preset of PRESETS) {
    const { files, manifest } = buildPlaybook({ preset: preset.id });
    assert.ok(manifest.tweaks.length > 0, preset.id);
    assert.match(files['playbook.conf'], /<FeaturePages>/);
    assert.match(files['playbook.conf'], new RegExp(`<Name>capsule-${preset.tweakIds[0]}</Name>`));
    const optionCounts = [...files['playbook.conf'].matchAll(/<CheckboxPage\b[\s\S]*?<\/CheckboxPage>/g)]
      .map(([page]) => (page.match(/<CheckboxOption\b/g) || []).length);
    assert.ok(optionCounts.every((count) => count <= 4), `${preset.id} has a page with more than four options`);
    assert.match(files['Configuration/main.yml'], /Tasks\\apply\.yml/);
    const count = (text) => (text.match(/!registryValue/g) || []).length;
    const applyYaml = files['Configuration/Tasks/apply.yml'];
    assert.equal(count(applyYaml), count(files['Configuration/revert.yml']));
    assert.equal(applyYaml, files['Configuration/apply.yml']);
    assert.equal(count(applyYaml), (applyYaml.match(/option: 'capsule-/g) || []).length);
  }
});

test('default AME export offers all settings with balanced defaults and optional Toolbox install', async () => {
  const { PRESETS, TWEAKS, buildPlaybook } = await load('playbook.js');
  const { files, manifest } = buildPlaybook({
    tweakIds: TWEAKS.map((entry) => entry.id),
    defaultTweakIds: PRESETS[0].tweakIds,
    includeToolboxInstaller: true,
  });
  assert.equal(manifest.tweaks.length, TWEAKS.length);
  assert.deepEqual(manifest.defaultTweaks, PRESETS[0].tweakIds);
  const optionCounts = [...files['playbook.conf'].matchAll(/<CheckboxPage\b[\s\S]*?<\/CheckboxPage>/g)]
    .map(([page]) => (page.match(/<CheckboxOption\b/g) || []).length);
  assert.ok(optionCounts.every((count) => count <= 4));
  assert.match(files['playbook.conf'], /<Name>install-capsule-toolbox<\/Name>/);
  assert.match(files['playbook.conf'], /<CheckboxOption IsChecked="false">[\s\S]*?<Name>install-capsule-toolbox<\/Name>/);
  assert.match(files['Configuration/Tasks/apply.yml'], /option: "install-capsule-toolbox"/);
  assert.match(files['Configuration/Tasks/apply.yml'], /-NoProfile -ExecutionPolicy Bypass -File "\.\\Install-CapsuleToolbox\.ps1"/);
  assert.match(files['Configuration/Tasks/apply.yml'], /if \(\$LASTEXITCODE -ne 0\) \{ throw/);
  assert.match(files['Configuration/Tasks/apply.yml'], /runas: currentUserElevated/);
  assert.match(files['Configuration/Tasks/apply.yml'], /errorAction: Halt/);
  assert.match(files['README.md'], /installer and both approved local models are bundled/);
  assert.match(files['README.md'], /pinned model hashes/);
  assert.match(files['playbook.conf'], /both approved offline models/);
});

test('delete operations and admin flag', async () => {
  const { buildPlaybook } = await load('playbook.js');
  const { files, manifest } = buildPlaybook({ tweakIds: ['no-copilot'] });
  assert.match(files['Configuration/Tasks/revert.yml'], /operation: delete/);
  assert.equal(manifest.needsAdmin, false);
  assert.equal(buildPlaybook({ tweakIds: ['minimum-telemetry'] }).manifest.needsAdmin, true);
});

test('rejects unknown input', async () => {
  const { buildPlaybook } = await load('playbook.js');
  assert.throws(() => buildPlaybook({ tweakIds: ['rm-rf'] }));
  assert.throws(() => buildPlaybook({ preset: 'nope' }));
  assert.throws(() => buildPlaybook({ version: '1.x' }));
});

test('zip is readable and crc matches', async () => {
  const { createZip, crc32 } = await load('zip.js');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(Buffer.from(createZip({ 'a/b.txt': 'hello', 'c.txt': 'world' })));
  assert.equal(zip.readAsText('a/b.txt'), 'hello');
  assert.equal(zip.readAsText('c.txt'), 'world');
});
