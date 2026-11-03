const assert = require('node:assert/strict');
const test = require('node:test');

test('color profiles persist only explicit allowlisted interface preferences', async () => {
  const { COLOR_PROFILES, readColorProfile, saveColorProfile } = await import('../toolbox/ui-profiles.js');
  const values = new Map(), css = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const root = { dataset: {}, style: { setProperty: (key, value) => css.set(key, value) } };
  assert.equal(readColorProfile(storage), 'parchment');
  for (const profile of COLOR_PROFILES) {
    saveColorProfile(profile.id, storage, root);
    assert.equal(readColorProfile(storage), profile.id);
    assert.equal(root.dataset.colorProfile, profile.id);
    assert.equal(css.get('--accent-bright'), profile.bright);
  }
  assert.throws(() => saveColorProfile('url(untrusted)', storage, root), /supported/);
  assert.equal(values.size, 1);
  assert.throws(() => saveColorProfile('capsule', { setItem() { throw new Error('storage blocked'); } }, root), /blocked/);
});

test('full-spectrum accents validate, normalize and preserve readable highlights', async () => {
  const { getColorProfile, readColorProfile, saveColorProfile } = await import('../toolbox/ui-profiles.js');
  const values = new Map(), css = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const root = { dataset: {}, style: { setProperty: (key, value) => css.set(key, value) } };
  for (const color of ['#000000', '#FFFFFF', '#ff0000', '#00ff00', '#0000ff', '#123AbC']) {
    saveColorProfile(color, storage, root);
    assert.equal(readColorProfile(storage), color.toLowerCase());
    assert.equal(css.get('--accent'), color.toLowerCase());
    assert.match(css.get('--accent-bright'), /^#[0-9a-f]{6}$/);
    const linear = css.get('--accent-bright').slice(1).match(/../g).map(hex => {
      const channel = Number.parseInt(hex, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    assert.ok(luminance <= 0.15, `Accent text must stay readable on light surfaces for ${color}`);
  }
  assert.equal(css.get('--accent-ink'), '#fff7fb');
  for (const invalid of ['', '#fff', '#abcdef\n', '#gggggg', '#12345678', 'red', 'url(x)', null, 123456]) {
    assert.throws(() => getColorProfile(invalid), /supported/);
  }
  saveColorProfile('#ffffff', storage, root);
  assert.equal(css.get('--accent-ink'), '#100d14');
  values.set('capsule-ui-color-profile-v1', 'invalid');
  assert.throws(() => readColorProfile(storage), /supported/);
});
