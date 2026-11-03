const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Settings security guidance distinguishes consent from Windows enforcement without an override control', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'toolbox', 'index.html'), 'utf8');
  const guidance = html.match(/<details id="windows-security-guidance"[\s\S]*?<\/details>/)?.[0];
  assert.ok(guidance);
  for (const term of ['Windows UAC', 'Application Control', '4551', '3077', 'CodeIntegrity', 'administrator', 'Some protections do not offer a per-file exception']) {
    assert.ok(guidance.includes(term), term);
  }
  assert.match(guidance, /Capsule cannot grant a Windows security exception/);
  assert.doesNotMatch(guidance, /<button|<script|onclick|href=/i);
});
