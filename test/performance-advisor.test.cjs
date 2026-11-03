const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const load = (file) => import(pathToFileURL(path.join(root, 'app', file)).href);

async function fixture() {
  const { TWEAKS } = await load('playbook.js');
  const { performanceSettingIds } = await load('performance-advisor.js');
  return {
    changes: performanceSettingIds().flatMap((id) => TWEAKS.find((t) => t.id === id).values.map((value, index) => {
      const bytes = value.type === 'REG_DWORD' ? Buffer.alloc(4) : Buffer.from(`${value.apply}\0`, 'utf16le');
      if (value.type === 'REG_DWORD') bytes.writeUInt32LE(Number(value.apply));
      return {
        tweakId: id, index, location: `${value.root}\\${value.path}\\${value.name}`,
        before: null, after: { kind: value.type, bytes: [...bytes] }, desired: value.apply,
      };
    })),
  };
}

test('performance advisor proposes only bounded catalog settings relevant to the chosen goal', async () => {
  const { proposePerformanceSettings } = await load('performance-advisor.js');
  const snapshot = await fixture();
  const before = structuredClone(snapshot);
  assert.deepEqual(proposePerformanceSettings('responsiveness', snapshot).map((p) => p.tweakId),
    ['no-transparency', 'no-window-animations', 'fast-menus']);
  assert.deepEqual(proposePerformanceSettings('gaming', snapshot).map((p) => p.tweakId),
    ['no-transparency', 'no-game-dvr']);
  assert.deepEqual(proposePerformanceSettings('background', snapshot).map((p) => p.tweakId),
    ['no-game-dvr', 'no-background-apps']);
  assert.deepEqual(snapshot, before, 'proposing must not mutate evidence');
  for (const proposal of proposePerformanceSettings('background', snapshot)) {
    assert.ok(proposal.benefit && proposal.tradeoff && proposal.measure);
    assert.ok(proposal.unsetValues > 0, 'unconfigured does not imply the feature is active');
  }
});

test('advisor skips settings already configured but includes partially configured settings', async () => {
  const { proposePerformanceSettings } = await load('performance-advisor.js');
  const snapshot = await fixture();
  for (const change of snapshot.changes) change.before = structuredClone(change.after);
  assert.deepEqual(proposePerformanceSettings('gaming', snapshot), []);
  snapshot.changes.find((c) => c.tweakId === 'no-game-dvr').before = null;
  assert.deepEqual(proposePerformanceSettings('gaming', snapshot).map((p) => p.tweakId), ['no-game-dvr']);
});

test('advisor fails explicitly on unsupported goals and incomplete inspection', async () => {
  const { proposePerformanceSettings } = await load('performance-advisor.js');
  assert.throws(() => proposePerformanceSettings('disable-security', { changes: [] }), /supported performance goal/);
  assert.throws(() => proposePerformanceSettings('gaming', null), /inspection is missing/);
  const snapshot = await fixture();
  snapshot.changes = snapshot.changes.filter((c) => c.tweakId !== 'no-game-dvr');
  assert.throws(() => proposePerformanceSettings('gaming', snapshot), /Incomplete Windows evidence/);
});

test('laptop directions preserve battery safety and require inspected AC status', async () => {
  const { proposePerformanceSettings } = await load('performance-advisor.js');
  const snapshot = await fixture();
  assert.throws(() => proposePerformanceSettings('laptop-ac', snapshot), /status is unavailable/);
  assert.throws(() => proposePerformanceSettings('laptop-ac', snapshot, { onAc: false }), /on battery/);
  assert.ok(!proposePerformanceSettings('laptop-battery', snapshot, { onAc: false })
    .some((p) => p.tweakId === 'no-power-throttling'));
  assert.ok(proposePerformanceSettings('laptop-ac', snapshot, { onAc: true, energySaver: false })
    .some((p) => p.tweakId === 'no-power-throttling'));
  assert.ok(!proposePerformanceSettings('laptop-ac', snapshot, { onAc: true, energySaver: true })
    .some((p) => p.tweakId === 'no-power-throttling'));
});

test('advisor UI inspects read-only, leaves proposals unchecked and reuses confirmed native review', () => {
  const ui = fs.readFileSync(path.join(root, 'toolbox', 'performance-view.js'), 'utf8');
  assert.match(ui, /invokeCommand\('inspect_catalog_tweaks', \{ ids: performanceSettingIds\(\) \}\)/);
  assert.match(ui, /const selected = new Set\(\)/);
  assert.doesNotMatch(ui, /\.checked\s*=\s*true|apply_catalog_tweaks/);
  assert.match(ui, /reviewAndApplyTweaks\(\[\.\.\.selected\], invokeCommand\)/);
});

test('header and favicon use the bundled Capsule image URL, not a broken outside-root HTML path', () => {
  const main = fs.readFileSync(path.join(root, 'toolbox', 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'toolbox', 'index.html'), 'utf8');
  assert.match(main, /import capsuleIconUrl from '\.\.\/assets\/capsule-playbook-icon\.png\?url'/);
  assert.match(main, /querySelector\('#capsule-brand-icon'\)\.src = capsuleIconUrl/);
  assert.match(main, /querySelector\('#capsule-favicon'\)\.href = capsuleIconUrl/);
  assert.doesNotMatch(html, /src="\.\.\/assets\/capsule-playbook-icon\.png"/);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.equal(config.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
  assert.equal(config.bundle.windows.nsis.uninstallerIcon, 'icons/icon.ico');
});
