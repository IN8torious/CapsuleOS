const assert = require('node:assert/strict');
const test = require('node:test');

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
}

test('Tweak+ saves supported approvals without applying and unknown ideas stay review-only', async () => {
  const { addApprovedTweak, readTweakLibrary, removeApprovedTweak } = await import('../toolbox/tweak-library.js');
  const store = storage();
  assert.throws(() => addApprovedTweak({ tweakId: 'fast-menus', reason: 'Reduce menu delay.' }, store), /Explicit approval/);
  addApprovedTweak({ tweakId: 'fast-menus', reason: 'Reduce menu delay.', confirmed: true, registryPath: 'ignored' }, store);
  const first = readTweakLibrary(store)[0];
  assert.equal(first.tweakId, 'fast-menus');
  assert.equal(first.registryPath, undefined);
  assert.throws(() => addApprovedTweak({ tweakId: 'arbitrary-registry', reason: 'Unverified', confirmed: true }, store), /review-only/);
  addApprovedTweak({ title: 'Investigate a new idea', reason: 'Evidence still needs verification.', confirmed: true }, store);
  const restored = readTweakLibrary(store);
  assert.equal(restored.length, 2);
  assert.equal(restored[1].tweakId, null);
  assert.throws(() => addApprovedTweak({ tweakId: 'fast-menus', reason: 'Duplicate', confirmed: true }, store), /already/);
  assert.equal(removeApprovedTweak(first.id, store).length, 1);
});

test('Tweak+ does not silently overwrite malformed or unsupported persistent libraries', async () => {
  const { readTweakLibrary, addApprovedTweak } = await import('../toolbox/tweak-library.js');
  const store = storage();
  store.setItem('capsule-approved-tweaks-v1', '{"version":99,"entries":[]}');
  assert.throws(() => readTweakLibrary(store), /unsupported/);
  assert.throws(() => addApprovedTweak({ tweakId: 'fast-menus', reason: 'Example', confirmed: true }, store), /unsupported/);
});
