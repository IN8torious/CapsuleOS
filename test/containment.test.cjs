const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'containment.js')).href);

test('particles launched far outside are pulled back and never exceed the hard limit', async () => {
  const { stepContained, HARD_LIMIT } = await load();
  const n = 300;
  const positions = new Float32Array(n * 3);
  const velocities = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const a = i * 2.399963;
    positions[i * 3] = Math.cos(a) * 3;
    positions[i * 3 + 1] = Math.sin(a * 1.3) * 2;
    positions[i * 3 + 2] = Math.sin(a) * 4;
    velocities[i * 3] = Math.cos(a) * 5;
  }
  let worst = 0;
  for (let step = 0; step < 600; step += 1) worst = stepContained(positions, velocities, 1 / 60, step / 60);
  assert.ok(worst <= HARD_LIMIT + 1e-6);
  assert.ok(positions.every(Number.isFinite));
});

test('a soft lattice keeps particles near their rest sites', async () => {
  const { stepContained } = await load();
  const rest = Float32Array.from([0.2, 0.1, 0.3, -0.4, 0, 0.5]);
  const pos = Float32Array.from(rest);
  const vel = new Float32Array(6);
  for (let t = 0; t < 600; t += 1) stepContained(pos, vel, 1 / 30, t / 30, rest);
  for (let i = 0; i < 6; i += 1) assert.ok(Math.abs(pos[i] - rest[i]) < 0.1);
});

test('nodes are clamped inside the wall', async () => {
  const { clampInside, NODE_LIMIT, WALL } = await load();
  const p = clampInside({ x: 5, y: 3, z: -6 });
  assert.ok(Math.sqrt((p.x / WALL.x) ** 2 + (p.y / WALL.y) ** 2 + (p.z / WALL.z) ** 2) <= NODE_LIMIT + 1e-9);
  const inside = clampInside({ x: 0.1, y: 0, z: 0.1 });
  assert.deepEqual(inside, { x: 0.1, y: 0, z: 0.1 });
});

test('huge or negative frame times are clamped and stay finite', async () => {
  const { stepContained, HARD_LIMIT } = await load();
  const positions = new Float32Array([0.9, 0.1, 1.2, -0.5, 0.2, 0.1]);
  const velocities = new Float32Array([40, 40, 40, -40, 0, 0]);
  for (const dt of [10, -3, 0.5, 0]) assert.ok(stepContained(positions, velocities, dt, 1) <= HARD_LIMIT + 1e-6);
  assert.ok(positions.every(Number.isFinite));
});
