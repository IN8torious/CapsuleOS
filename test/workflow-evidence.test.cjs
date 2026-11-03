const test = require('node:test');
const assert = require('node:assert/strict');
const { hashContent } = require('../assistant/css-proposals.cjs');
const { verifyEvidenceClaims } = require('../assistant/workflow-evidence.cjs');
const content = '<h1>Title</h1>\n<p>Evidence</p>';
const source = { path: 'index.html', content, sha256: hashContent(content) };
const claim = { path: source.path, sha256: source.sha256, lineStart: 2, lineEnd: 2, text: '<p>Evidence</p>' };
test('RingFlow-inspired checks require non-empty exact evidence and a full current source hash', () => {
  assert.deepEqual(verifyEvidenceClaims([claim], [source]), { ok: true, count: 1 });
  assert.equal(verifyEvidenceClaims([], [source]).ok, false);
  assert.equal(verifyEvidenceClaims(null, [source]).ok, false);
  for (const change of [
    { path: 'other.html' }, { sha256: 'a'.repeat(64) }, { text: '<p>Invented</p>' },
    { lineStart: 1 }, { lineEnd: 999 }, { text: '' }, { approved: true }
  ]) assert.equal(verifyEvidenceClaims([{ ...claim, ...change }], [source]).ok, false);
  assert.equal(verifyEvidenceClaims([claim], [{ ...source, content: content.replace('Title', 'Other') }]).ok, false);
});
test('one mismatched claim refuses the whole evidence set; quotation matching is not semantic proof', () => {
  assert.equal(verifyEvidenceClaims([claim, { ...claim, text: 'wrong' }], [source]).ok, false);
  assert.equal(verifyEvidenceClaims([claim], [source]).approved, undefined);
  assert.equal(verifyEvidenceClaims([claim], [source]).modelCorrect, undefined);
});
