const assert = require('node:assert/strict');
const test = require('node:test');

test('Eye Spy rates are the numerical derivatives used by the actual phase integrator', async () => {
  const { kuramotoStep, buoyancy, coherence } = await import('../app/alchemedies.js');
  const { formatAgentMath } = await import('../app/agent-math.js');
  const theta = Float64Array.from([0.3, 0.9, 1.4]);
  const omega = Float64Array.from([0.5, 0.53, 0.56]);
  const before = [...theta], rates = new Float64Array(3), coupling = 0.8, dt = 0.02;
  kuramotoStep(theta, omega, coupling, dt, rates);
  for (let i = 0; i < theta.length; i++) {
    const expected = omega[i] + coupling / 3 * before.reduce((sum, angle) => sum + Math.sin(angle - before[i]), 0);
    assert.ok(Math.abs(rates[i] - expected) < 1e-12);
    assert.ok(Math.abs(theta[i] - (before[i] + rates[i] * dt)) < 1e-12);
  }
  const output = formatAgentMath({
    time: 4, dt, before: before[0], after: theta[0], omega: omega[0], coupling, rate: rates[0], count: 3,
    density: .88, rise: buoyancy(1, .88, 1), position: [1, 2, 3], coherence: coherence(theta),
    roughness: .44, metalness: .24, emissive: .8, receipts: 1, hasTexture: false
  });
  assert.match(output, /omega=0.50000/);
  assert.match(output, /buoyancy=0.12000/);
  assert.match(output, /none; actual colored material/);
  assert.match(output, /not neural activations/);
});
