const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packCatalog = JSON.parse(fs.readFileSync(path.join(root, 'playbook', 'packs.catalog.json'), 'utf8'));

async function unified(options = {}) {
  const { buildPlaybook, TWEAKS, PRESETS, BROWSERS, PLAYBOOK_SCRIPTS } = await import('../app/playbook.js');
  const result = buildPlaybook({ tweakIds: TWEAKS.map((entry) => entry.id), defaultTweakIds: PRESETS[0].tweakIds,
    unified: true, packCatalog, ...options });
  return { ...result, TWEAKS, BROWSERS, PLAYBOOK_SCRIPTS };
}

test('unified playbook runs the safety session first and halts on failure', async () => {
  const { files, manifest } = await unified();
  assert.match(files['playbook.conf'], /<Name>CapsuleOSv2<\/Name>/);
  assert.match(files['README.md'], /^# CapsuleOSv2 playbook/);
  assert.equal(manifest.releaseName, 'CapsuleOSv2');
  const apply = files['Configuration/Tasks/apply.yml'];
  const first = apply.indexOf('!powerShell:');
  const firstRegistry = apply.indexOf('!registryValue:');
  assert.ok(first > 0 && first < firstRegistry, 'session must precede every registry action');
  const block = apply.slice(first, apply.indexOf('weight:', first));
  assert.match(block, /Start-CapsuleSession\.ps1/);
  assert.match(block, /errorAction: Halt/);
  assert.doesNotMatch(block, /option:/, 'the safety session is not optional');
});

test('browser page offers Edge first and default, three alternatives and keep-current', async () => {
  const { files, BROWSERS } = await unified();
  const conf = files['playbook.conf'];
  const page = conf.match(/<RadioImagePage[\s\S]*?<\/RadioImagePage>/)[0];
  assert.match(page, /DefaultOption="browser-edge"/);
  assert.match(page, /CheckDefaultBrowser="false"/);
  assert.match(page, /<RadioImageOption None="true"\/>/);
  assert.deepEqual([...page.matchAll(/<Name>(browser-[a-z]+)<\/Name>/g)].map((m) => m[1]),
    ['browser-edge', 'browser-firefox', 'browser-brave', 'browser-librewolf']);
  for (const browser of BROWSERS) {
    assert.ok(fs.existsSync(path.join(root, 'playbook', 'Images', `${browser.id}.png`)), `${browser.id} icon`);
    assert.match(files['Configuration/Tasks/apply.yml'], new RegExp(`-Browser ${browser.id};[\\s\\S]*?option: 'browser-${browser.id}'`));
  }
});

test('every page option has actions and every action option has a page', async () => {
  const { files } = await unified();
  const conf = files['playbook.conf'];
  const apply = files['Configuration/Tasks/apply.yml'];
  const pageOptions = new Set([...conf.matchAll(/<Name>((?:capsule|browser|pack)-[^<]+)<\/Name>/g)].map((m) => m[1]));
  const actionOptions = new Set([...apply.matchAll(/option: '([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...pageOptions].sort(), [...actionOptions].sort());
  for (const pack of packCatalog.packs) assert.ok(pageOptions.has(`pack-${pack.id}`), pack.id);
  assert.ok(pageOptions.has('capsule-repair-toolkit'));
  for (const page of conf.match(/<CheckboxPage[\s\S]*?<\/CheckboxPage>/g)) {
    assert.ok((page.match(/<CheckboxOption/g) || []).length <= 4);
  }
  assert.doesNotMatch(conf, /<Name>pack-[^<]+<\/Name>[\s\S]*IsChecked="true"[\s\S]*<Name>pack-/);
});

test('app packs are unchecked and only run fixed scripts with validated ids', async () => {
  const { files, PLAYBOOK_SCRIPTS } = await unified();
  const conf = files['playbook.conf'];
  for (const match of conf.matchAll(/<CheckboxOption IsChecked="(true|false)">\s*<Text>[^<]*<\/Text>\s*<Name>pack-/g)) {
    assert.equal(match[1], 'false');
  }
  const apply = files['Configuration/Tasks/apply.yml'];
  const scripts = [...apply.matchAll(/-File "\.\\([^"]+)"/g)].map((m) => m[1].replace(/\\/g, '/'));
  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    assert.ok(PLAYBOOK_SCRIPTS.includes(script), `${script} must be a listed fixed script`);
    assert.ok(fs.existsSync(path.join(root, 'playbook', 'scripts', ...script.split('/'))), script);
  }
  for (const script of PLAYBOOK_SCRIPTS) assert.ok(fs.existsSync(path.join(root, 'playbook', 'scripts', ...script.split('/'))), script);
  assert.doesNotMatch(apply, /HKU\\|Invoke-Expression|iex |DownloadString|Invoke-WebRequest/);
});

test('capsule targets cover every registry value in the playbook', async () => {
  const { files, TWEAKS } = await unified();
  const targets = JSON.parse(files['Executables/capsule-targets.json']);
  assert.equal(targets.length, TWEAKS.reduce((sum, entry) => sum + entry.values.length, 0) + 2);
  for (const target of targets) {
    assert.match(target.option, /^(capsule-[a-z0-9-]+|browser-edge)$/);
    assert.ok(['HKCU', 'HKLM'].includes(target.root));
  }
});

test('unified HKCU edits and rollback share the captured account scope', async () => {
  const { files, TWEAKS } = await unified();
  const hkcu = files['Configuration/Tasks/apply.yml'].split('\n').filter((line) => /path: 'HKCU\\/.test(line));
  assert.ok(hkcu.length > 0);
  assert.ok(hkcu.every((line) => line.includes('scope: currentUser')));
  const revert = files['Configuration/Tasks/revert.yml'];
  assert.doesNotMatch(revert, /!registryValue/);
  for (const tweak of TWEAKS) assert.ok(revert.includes(`-Option capsule-${tweak.id} -Confirm:$false`));
  assert.match(revert, /-Option browser-edge/);
  assert.match(files['Configuration/Tasks/apply.yml'], /errorAction: Notify/);
});

test('unified options reject duplicates and malformed catalogs', async () => {
  await assert.rejects(unified({ browsers: ['edge', 'edge'] }), /unique browser/);
  await assert.rejects(unified({ packCatalog: { ...packCatalog, packs: [...packCatalog.packs, packCatalog.packs[0]] } }), /Duplicate pack/);
  await assert.rejects(unified({ packCatalog: { ...packCatalog, packs: {} } }), /Packs must be an array/);
  const { files } = await unified({ browsers: [], includeRepairToolkit: false });
  assert.doesNotMatch(files['playbook.conf'], /RadioImagePage|capsule-repair-toolkit/);
  assert.ok(JSON.parse(files['Executables/capsule-targets.json']).every((target) => target.option !== 'browser-edge'));
});

test('unknown browsers and malformed packs are rejected; legacy export is unchanged', async () => {
  await assert.rejects(unified({ browsers: ['chrome-beta'] }), /Unknown browser/);
  await assert.rejects(unified({ packCatalog: { format: 'capsule-packs/1', packs: [{ id: 'x', apps: [{ name: 'a', winget: 'bad id;rm' }] }] } }), /invalid package id/);
  const { buildPlaybook } = await import('../app/playbook.js');
  const legacy = buildPlaybook({ preset: 'balanced' });
  assert.doesNotMatch(legacy.files['playbook.conf'], /RadioImagePage|pack-/);
  assert.doesNotMatch(legacy.files['Configuration/Tasks/apply.yml'], /Start-CapsuleSession/);
  assert.equal(legacy.files['Executables/capsule-targets.json'], undefined);
});

test('balanced preset keeps the Photo Viewer association opt-in', async () => {
  const { PRESETS } = await import('../app/playbook.js');
  assert.ok(!PRESETS[0].tweakIds.includes('classic-photo-viewer'));
});
