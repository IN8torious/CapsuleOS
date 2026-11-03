const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'brain-geometry.js')).href);

test('cortex surface is finite, indexed in range and mirrored', async () => {
  const { buildCortexSurface } = await load();
  const { vertices, indices } = buildCortexSurface(12, 16);
  assert.ok(vertices.every((v) => v.length === 3 && v.every(Number.isFinite)));
  assert.ok(indices.every((i) => i >= 0 && i < vertices.length));
  assert.equal(indices.length % 3, 0);
  const half = vertices.length / 2;
  assert.deepEqual(vertices[half + 5], [-vertices[5][0], vertices[5][1], vertices[5][2]]);
});

test('brain lattice is finite, indexed correctly and bilaterally symmetric', async () => {
  const { buildBrain } = await load();
  const brain = buildBrain();
  for (const node of brain.nodes) {
    assert.equal(node.length, 3);
    assert.ok(node.every(Number.isFinite));
  }
  for (const [a, b] of brain.edges) {
    assert.ok(Number.isInteger(a) && a >= 0 && a < brain.nodes.length);
    assert.ok(Number.isInteger(b) && b >= 0 && b < brain.nodes.length);
    assert.notEqual(a, b);
  }
  for (let i = 0; i < brain.half; i += 1) {
    const [x, y, z] = brain.nodes[i];
    const [mx, my, mz] = brain.nodes[i + brain.half];
    assert.ok(Math.abs(x + mx) < 1e-12 && y === my && z === mz);
  }
  assert.ok(brain.nodes.slice(0, brain.half).every((node) => node[0] >= 0));
  assert.ok(brain.nodes.slice(brain.half, brain.half * 2).every((node) => node[0] <= 0));
});

test('every lattice node belongs to a named region and each region has a centre', async () => {
  const { buildBrain } = await load();
  const brain = buildBrain();
  assert.ok(brain.nodeRegion.every((id) => id), 'unassigned node');
  const ids = brain.regions.map((region) => region.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['frontal-left', 'frontal-right', 'occipital-left', 'temporal-right', 'parietal-left', 'cerebellum', 'stem', 'callosum', 'deep-left', 'deep-right']) {
    assert.ok(ids.includes(id), id);
  }
  for (const region of brain.regions) {
    assert.ok(region.nodes.length >= 2, region.id);
    assert.ok(region.center.every(Number.isFinite));
    assert.ok(region.name && region.role);
  }
  const frontal = brain.regions.find((region) => region.id === 'frontal-left');
  const occipital = brain.regions.find((region) => region.id === 'occipital-left');
  assert.ok(frontal.center[2] > occipital.center[2]);
});

test('pin sites are unique, outside the medial wall and split across both hemispheres', async () => {
  const { buildBrain } = await load();
  const { pins, half } = buildBrain();
  assert.equal(new Set(pins).size, pins.length);
  assert.ok(pins.length >= 60);
  assert.ok(pins.some((i) => i < half) && pins.some((i) => i >= half && i < half * 2));
  assert.ok(pins[0] < half && pins[1] >= half);
});
