const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'alchemedies.js')).href);

test('buoyancy: lighter than the medium rises, denser sinks', async () => {
  const { buoyancy } = await load();
  assert.ok(buoyancy(1, 0.4, 2) > 0);
  assert.ok(buoyancy(1, 1.6, 2) < 0);
  assert.equal(buoyancy(1, 1, 5), 0);
});

test('resonance: 1 when tuned, 0.5 at the half-width, falls with detuning', async () => {
  const { resonance } = await load();
  assert.equal(resonance(515, 515, 8), 1);
  assert.ok(Math.abs(resonance(515 * (1 + 1 / 16), 515, 8) - 0.5) < 1e-9);
  assert.ok(resonance(650, 515, 8) < 0.06);
});

test('kuramoto: strong coupling locks scattered phases; zero coupling does not', async () => {
  const { kuramotoStep, coherence } = await load();
  const seed = () => Float64Array.from({ length: 12 }, (_, i) => i * 0.52);
  const omega = Float64Array.from({ length: 12 }, (_, i) => 0.6 + (i % 3) * 0.02);
  const locked = seed();
  const free = seed();
  const before = coherence(locked);
  for (let t = 0; t < 2000; t += 1) {
    kuramotoStep(locked, omega, 2.5, 0.02);
    kuramotoStep(free, omega, 0, 0.02);
  }
  assert.ok(coherence(locked) > 0.97 && coherence(locked) > before);
  assert.ok(coherence(free) < 0.9);
});

test('leaky integrator stays bounded and settles on tanh(input)', async () => {
  const { leakyStep } = await load();
  let x = 0;
  for (let t = 0; t < 4000; t += 1) x = leakyStep(x, 50, 0.8, 0.01);
  assert.ok(x <= 1 && Math.abs(x - 1) < 1e-6);
});
