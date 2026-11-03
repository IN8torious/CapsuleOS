const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');

test('native tweak catalog matches every shared catalog setting exactly', async () => {
  const { TWEAKS } = await import(pathToFileURL(path.join(root, 'app', 'playbook.js')).href);
  const native = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tweak-catalog.json'), 'utf8'));
  assert.deepEqual(native, TWEAKS);
  const locations = new Set();
  for (const tweak of native) {
    for (const value of tweak.values) {
      const location = `${value.root}\\${value.path}\\${value.name}`.toLowerCase();
      assert.ok(!locations.has(location), `overlapping catalog target: ${location}`);
      locations.add(location);
    }
  }
});

test('appearance approvals use the same elevated, confirmed batch rather than direct registry setters', () => {
  const actions = fs.readFileSync(path.join(root, 'toolbox', 'tweak-actions.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'toolbox', 'main.js'), 'utf8');
  assert.match(actions, /invokeCommand\('preview_appearance_settings', \{ settings \}\)/);
  assert.match(main, /reviewAndApplyAppearance\(settings\)/);
  assert.doesNotMatch(main, /invoke\('set_visual_tweak'|invoke\('apply_theme_change'/);
  const elevation = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'elevation.rs'), 'utf8');
  assert.match(elevation, /wide\("runas"\)/);
  assert.match(elevation, /GetNamedPipeClientProcessId/);
  assert.match(elevation, /GetNamedPipeServerProcessId/);
  assert.match(elevation, /user_sid\(\)\?/);
  assert.match(elevation, /reject_remote_clients\(true\)/);
  assert.doesNotMatch(elevation, /powershell|cmd\.exe/);
});

test('Apply actions are wired through native preview and confirmation, not arbitrary paths', () => {
  const actions = fs.readFileSync(path.join(root, 'toolbox', 'tweak-actions.js'), 'utf8');
  assert.match(actions, /invokeCommand\('preview_catalog_tweaks', \{ ids \}\)/);
  assert.match(actions, /dialog\.showModal\(\)/);
  assert.match(actions, /if \(!confirmed\) return/);
  assert.match(actions, /invokeCommand\('apply_catalog_tweaks', \{ previewId: preview\.id, confirmed: true \}\)/);
  for (const page of ['playbook-view.js', 'internet-view.js']) {
    assert.match(fs.readFileSync(path.join(root, 'toolbox', page), 'utf8'), /attachTweakActions\(bar, status/);
  }
});
