const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildAppendDiff,
  extractCssProposal,
  validateCssAddition
} = require('../assistant/css-proposals.cjs');

test('CSS proposal must be a summary followed by a single CSS fence', () => {
  const proposal = extractCssProposal(
    'Increase contrast in the toolbox controls.\n```css\n.toolbox-tab { color: #fff; }\n```'
  );
  assert.equal(proposal.summary, 'Increase contrast in the toolbox controls.');
  assert.equal(proposal.css, '.toolbox-tab { color: #fff; }');
  assert.throws(() => extractCssProposal('```text\nbody { color: red; }\n```'), /fenced CSS/);
  assert.throws(() => extractCssProposal('A summary.\n```css\nbody { color: red; }\n```\nExtra text'), /extra content/);
});

test('CSS proposal rejects external loads, executable behavior, and escapes', () => {
  for (const css of [
    '@import "https://example.invalid/style.css";',
    '.x { background: url(https://example.invalid/pixel); }',
    '.x { color: e\\78pression(alert(1)); }',
    '.x { behavior: url(#default#VML); }'
  ]) {
    assert.throws(() => validateCssAddition(css));
  }
});

test('CSS proposal rejects incomplete rules and emits an append-only review diff', () => {
  assert.throws(() => validateCssAddition('.x { color: red;'), /incomplete/);
  const diff = buildAppendDiff('C:\\project\\app\\styles.css', 'a { color: white; }\n', '.x { color: red; }');
  assert.match(diff, /^--- styles\.css\n\+\+\+ styles\.css \(proposed\)/);
  assert.match(diff, /^\+\.x \{ color: red; \}$/m);
});
