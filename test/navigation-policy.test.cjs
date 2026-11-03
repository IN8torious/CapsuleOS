const test = require('node:test');
const assert = require('node:assert/strict');
const { HOME_DEMO_URL, isAllowedContentUrl, normalizeNavigationInput } = require('../browser-policy.cjs');

test('adds HTTPS to a bare website address', () => {
  assert.equal(normalizeNavigationInput('example.com'), 'https://example.com/');
  assert.equal(normalizeNavigationInput('localhost:3000/path'), 'https://localhost:3000/path');
});

test('preserves explicit HTTP and HTTPS URLs', () => {
  assert.equal(normalizeNavigationInput('http://example.com/path'), 'http://example.com/path');
  assert.equal(normalizeNavigationInput('https://example.com/path'), 'https://example.com/path');
});

test('rejects non-web schemes and invalid addresses', () => {
  for (const value of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'data:text/html,hello', 'ftp://example.com', '']) {
    assert.throws(() => normalizeNavigationInput(value));
  }
});

test('allows only HTTP and HTTPS URLs in the website content view', () => {
  assert.equal(isAllowedContentUrl('https://example.com/'), true);
  assert.equal(isAllowedContentUrl('http://example.com/'), true);
  assert.equal(isAllowedContentUrl(HOME_DEMO_URL), false);
  assert.equal(isAllowedContentUrl('file:///C:/Windows/win.ini'), false);
  assert.equal(isAllowedContentUrl('si-core-demo://prototype/other.html'), false);
});
