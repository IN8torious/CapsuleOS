const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'toolbox', 'world-motion.js')).href);

test('SI Core motion is reproducible per seed and bounded', async () => {
  const { createMotion } = await load();
  const a = createMotion(42);
  const b = createMotion(42);
  for (let i = 0; i < 200; i++) {
    a.step(0.05);
    b.step(0.05);
  }
  assert.equal(a.waveHeight(3, 4), b.waveHeight(3, 4));
  for (let x = 0; x < 40; x++) assert.ok(Math.abs(a.waveHeight(x, x * 2)) < 0.4);
  assert.ok(a.coherence >= 0 && a.coherence <= 1);
});

test('swells vary over time and wind only moves foliage above its base', async () => {
  const { createMotion } = await load();
  const m = createMotion(7);
  const before = m.waveHeight(5, 5);
  for (let i = 0; i < 40; i++) m.step(0.05);
  assert.notEqual(before, m.waveHeight(5, 5));
  assert.deepEqual(m.windSway(1, 1, 0), { x: 0, z: 0 });
  const low = Math.hypot(m.windSway(1, 1, 1).x, m.windSway(1, 1, 1).z);
  const high = Math.hypot(m.windSway(1, 1, 4).x, m.windSway(1, 1, 4).z);
  assert.ok(high > low);
});
