const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ReviewCache, MAX_CACHE_BYTES, EXPIRY_MS } = require('../assistant/review-cache.cjs');

async function fixture(t, options) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-cache-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, cache: new ReviewCache(path.join(root, 'review-cache'), options) };
}

test('review cache defaults to exactly 2 GiB and persists without preallocating space', async t => {
  const { root, cache } = await fixture(t);
  assert.equal(MAX_CACHE_BYTES, 2147483648);
  assert.equal(EXPIRY_MS, 604800000);
  assert.equal((await cache.status()).usedBytes, 0);
  await cache.put('report', { source: '<main>inert</main>' });
  const restored = new ReviewCache(path.join(root, 'review-cache'));
  assert.equal((await restored.get('report')).value.source, '<main>inert</main>');
  assert.ok((await restored.status()).usedBytes < 1024);
});

test('cache evicts least-recently-used entries and expires after seven inactive days', async t => {
  let now = Date.now();
  const { cache } = await fixture(t, { maxBytes: 245, now: () => now });
  await cache.put('a', 'x'.repeat(25));
  now += 1000;
  await cache.put('b', 'x'.repeat(25));
  now += 1000;
  assert.ok(await cache.get('a'));
  now += 1000;
  await cache.put('c', 'x'.repeat(25));
  assert.equal(await cache.get('b'), null);
  assert.ok(await cache.get('a'));
  assert.ok((await cache.status()).usedBytes <= 245);
  now += EXPIRY_MS;
  assert.equal((await cache.status()).usedBytes, 0);
});

test('cache clear preserves approved lessons, workflows, models, and originals outside its root', async t => {
  const { root, cache } = await fixture(t);
  for (const name of ['approved-learning.json', 'workflows.json', 'model.bin', 'original.html']) {
    await fs.writeFile(path.join(root, name), 'preserve');
  }
  await cache.put('review', { result: 'disposable' });
  assert.equal((await cache.clear()).itemCount, 0);
  for (const name of ['approved-learning.json', 'workflows.json', 'model.bin', 'original.html']) {
    assert.equal(await fs.readFile(path.join(root, name), 'utf8'), 'preserve');
  }
  assert.equal(await cache.get('review'), null);
});
