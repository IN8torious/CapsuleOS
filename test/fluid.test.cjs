const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'fluid.js')).href);

test('a heat source drives a rising plume (Boussinesq: hot is light)', async () => {
  const { createFluid } = await load();
  const fluid = createFluid(24);
  for (let t = 0; t < 60; t += 1) {
    fluid.addHeat(0.5, 0.8, 0.6);
    fluid.step(0.09);
  }
  const above = fluid.sample(fluid.v, 0.5, 0.6);
  assert.ok(above < -0.01, `expected upward (negative v) flow above the source, got ${above}`);
});

test('projection keeps the flow nearly divergence-free', async () => {
  const { createFluid } = await load();
  const fluid = createFluid(24, { iterations: 40 });
  for (let t = 0; t < 40; t += 1) {
    fluid.addHeat(0.4, 0.85, 0.8);
    fluid.addVelocity(0.6, 0.5, 1.5, -1);
    fluid.step(0.09);
  }
  assert.ok(fluid.maxDivergence() < 0.02, `divergence ${fluid.maxDivergence()}`);
});

test('still fluid stays still, and heat cools without a source', async () => {
  const { createFluid } = await load();
  const fluid = createFluid(16);
  for (let t = 0; t < 20; t += 1) fluid.step(0.09);
  assert.equal(fluid.meanSpeed(), 0);
  fluid.addHeat(0.5, 0.5, 1);
  const hot = fluid.sample(fluid.heat, 0.5, 0.5);
  for (let t = 0; t < 200; t += 1) fluid.step(0.09);
  assert.ok(fluid.sample(fluid.heat, 0.5, 0.5) < hot * 0.5);
});

test('convection curls: a driven plume produces vorticity (memory)', async () => {
  const { createFluid } = await load();
  const fluid = createFluid(24);
  for (let t = 0; t < 80; t += 1) {
    fluid.addHeat(0.5, 0.85, 0.7);
    fluid.step(0.09);
  }
  let peak = 0;
  for (let j = 2; j < 24; j += 1) for (let i = 2; i < 24; i += 1) peak = Math.max(peak, Math.abs(fluid.curl(i, j)));
  assert.ok(peak > 0.05, `peak curl ${peak}`);
});
