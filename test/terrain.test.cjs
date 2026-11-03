const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'toolbox', 'terrain.js')).href);

test('d120 rolls are reproducible and stay in 1..120', async () => {
  const { d120 } = await load();
  for (let i = 0; i < 500; i++) {
    const roll = d120(777, i, -i, 3);
    assert.ok(Number.isInteger(roll) && roll >= 1 && roll <= 120);
    assert.equal(roll, d120(777, i, -i, 3));
  }
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(d120(5, i, 0, 0));
  assert.ok(seen.size > 100, 'rolls should cover most of the die');
});

test('a chunk is identical whatever the world size', async () => {
  const { generateWorld } = await load();
  const small = generateWorld(42, 3).find((c) => c.cx === 1 && c.cz === 1);
  const large = generateWorld(42, 5).find((c) => c.cx === 1 && c.cz === 1);
  assert.deepEqual(small, large);
});

test('entities stay inside their chunk, off the border, and never overlap', async () => {
  const { generateWorld, CHUNK, WATER } = await load();
  let count = 0;
  for (const seed of [1, 42, 9001, 123456]) {
    for (const chunk of generateWorld(seed, 4)) {
      const minX = chunk.cx * CHUNK;
      const minZ = chunk.cz * CHUNK;
      chunk.entities.forEach((e, i) => {
        count++;
        assert.ok(e.x0 >= minX + 1 && e.x0 + e.w <= minX + CHUNK - 1, 'x inside border margin');
        assert.ok(e.z0 >= minZ + 1 && e.z0 + e.w <= minZ + CHUNK - 1, 'z inside border margin');
        assert.ok(e.base >= WATER);
        for (const other of chunk.entities.slice(i + 1)) {
          const apart = e.x0 + e.w < other.x0 || other.x0 + other.w < e.x0 || e.z0 + e.w < other.z0 || other.z0 + other.w < e.z0;
          assert.ok(apart, 'entities keep one cell of clearance');
        }
      });
    }
  }
  assert.ok(count > 0, 'some entities should be generated');
});

test('terrain is continuous across chunk borders', async () => {
  const { generateWorld, heightAt, CHUNK } = await load();
  const chunks = generateWorld(31337, 3);
  const heights = new Map();
  for (const chunk of chunks) for (const c of chunk.columns) heights.set(`${c.x},${c.z}`, c.h);
  let maxStep = 0;
  for (let z = 0; z < CHUNK * 3; z++) {
    for (let x = 0; x < CHUNK * 3 - 1; x++) {
      assert.equal(heightAt(31337, x, z) >= 1, true);
      maxStep = Math.max(maxStep, Math.abs(heights.get(`${x},${z}`) - heights.get(`${x + 1},${z}`)));
    }
  }
  assert.ok(maxStep <= 7, `neighbouring columns should not cliff wildly (max ${maxStep})`);
});
