const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const chrome = fs.readFileSync(path.join(root, 'app', 'styles.css'), 'utf8');

test('browser chrome and 3D homepage use the crimson, white, and black theme', () => {
  assert.match(homepage, /--accent:\s*#df243c/i);
  assert.match(homepage, /const SI_PALETTE = Object\.freeze/);
  assert.match(chrome, /--accent:\s*#df243c/i);
  assert.match(chrome, /background:\s*#070609/i);
  assert.doesNotMatch(
    `${homepage}\n${chrome}`,
    /#(?:b6ff5e|65cfad|82d8c0)|0x(?:57e6ff|b6ff5e|ffb454|c792ff|ffe9a8|ff5a1e|ff69b4|6bffb8)/i
  );
});
