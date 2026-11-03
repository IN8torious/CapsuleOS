const test = require('node:test');
const assert = require('node:assert/strict');

function fixture() {
  const values = new Map(), styles = new Map();
  return {
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    root: { dataset: {}, style: { setProperty: (key, value) => styles.set(key, value) } },
    styles
  };
}

test('Toolbox defaults to light and persists only valid explicit theme choices', async () => {
  const { readTheme, saveTheme, applyTheme } = await import('../toolbox/theme.js');
  const { storage, root } = fixture();
  assert.equal(readTheme(storage), 'light');
  assert.equal(saveTheme('dark', storage, root), 'dark');
  assert.equal(readTheme(storage), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.throws(() => saveTheme('unknown', storage, root), /Choose/);
  assert.equal(readTheme(storage), 'dark');
  assert.equal(applyTheme('system', root, false), 'light');
  assert.equal(root.dataset.themePreference, 'system');
  assert.equal(applyTheme('system', root, true), 'dark');
  assert.equal(applyTheme('light', root, true), 'light');
});

test('unavailable theme storage is reported without changing the current theme', async () => {
  const { saveTheme } = await import('../toolbox/theme.js');
  const { root } = fixture();
  root.dataset.theme = 'light';
  assert.throws(() => saveTheme('dark', { setItem() { throw new Error('Storage unavailable'); } }, root), /Storage unavailable/);
  assert.equal(root.dataset.theme, 'light');
});

test('dark mode keeps all accent highlights readable and restores their light shades', async () => {
  const { COLOR_PROFILES, applyColorProfile } = await import('../toolbox/ui-profiles.js');
  const { applyTheme } = await import('../toolbox/theme.js');
  const { root, styles } = fixture();
  for (const id of [...COLOR_PROFILES.map(p => p.id), '#000000', '#ffffff', '#123456']) {
    applyTheme('light', root);
    applyColorProfile(id, root);
    const lightShade = styles.get('--accent-bright');
    applyTheme('dark', root);
    const channels = styles.get('--accent-bright').slice(1).match(/../g).map(c => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    assert.ok((luminance + 0.05) / (0.03 + 0.05) >= 4.5, id);
    assert.equal(root.dataset.colorProfile, id);
    applyTheme('light', root);
    assert.equal(styles.get('--accent-bright'), lightShade);
  }
});
