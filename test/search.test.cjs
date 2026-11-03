const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'search.js')).href);

test('classifies urls and searches', async () => {
  const { classifyQuery } = await load();
  assert.equal(classifyQuery('').kind, 'empty');
  assert.equal(classifyQuery('example.com').value, 'https://example.com');
  assert.equal(classifyQuery('best privacy browser').kind, 'search');
  assert.equal(classifyQuery('https://a.dev/x').kind, 'url');
});

test('hardens addresses', async () => {
  const { hardenUrl } = await load();
  const r = hardenUrl('http://example.com/p?id=4&utm_source=x&fbclid=1');
  assert.equal(r.url, 'https://example.com/p?id=4');
  assert.deepEqual(r.removed, ['utm_source', 'fbclid']);
  assert.equal(r.upgraded, true);
  assert.equal(hardenUrl('http://localhost:3000/').url, 'http://localhost:3000/');
});

test('legacy standalone search retains its fixed tracker parameter list without a Toolbox browser', async () => {
  const { TRACKING_PARAMS, isTracking } = await load();
  assert.ok(isTracking('utm_source'));
  assert.ok(TRACKING_PARAMS.includes('fbclid'));
  assert.equal(new Set(TRACKING_PARAMS).size, TRACKING_PARAMS.length);
  const lib = fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'src', 'lib.rs'), 'utf8');
  assert.doesNotMatch(lib, /browser_open|browser_visible|mod browser;/);
});
