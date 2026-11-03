const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'neurogenesis.js')).href);

const agents = [
  { key: 'a', home: [0.4, 0.2, 0.3] },
  { key: 'b', home: [-0.4, 0.2, -0.3] },
];

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('neurons grow inside the brain, spaced apart, balanced across agents', async () => {
  const { emptyNeurons, growNeuron, insideBrain, MAX_NEURONS, MIN_GAP } = await load();
  const state = emptyNeurons();
  const rand = seeded(7);
  for (let i = 0; i < 400; i += 1) growNeuron(state, agents, i, rand);
  assert.ok(state.neurons.length > 40 && state.neurons.length <= MAX_NEURONS);
  assert.ok(state.neurons.every((n) => insideBrain(n.p)));
  const ids = new Set(state.neurons.map((n) => n.id));
  assert.equal(ids.size, state.neurons.length);
  assert.ok(state.neurons.every((n) => n.parent === null || ids.has(n.parent)));
  for (let i = 0; i < state.neurons.length; i += 1) {
    for (let j = i + 1; j < state.neurons.length; j += 1) {
      const a = state.neurons[i].p;
      const b = state.neurons[j].p;
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= MIN_GAP - 1e-9);
    }
  }
  const a = state.neurons.filter((n) => n.agent === 'a').length;
  const b = state.neurons.filter((n) => n.agent === 'b').length;
  assert.ok(Math.abs(a - b) <= 2);
});

test('wall-clock schedule: due growths, capped catch-up, backwards clock re-anchors', async () => {
  const { emptyNeurons, dueGrowths, GROW_EVERY_MS, MAX_CATCH_UP } = await load();
  const state = emptyNeurons();
  assert.equal(dueGrowths(state, 1000), 0);
  assert.equal(dueGrowths(state, 1000 + GROW_EVERY_MS * 3 + 5), 3);
  assert.equal(dueGrowths(state, 1000 + GROW_EVERY_MS * 3 + 6), 0);
  assert.equal(dueGrowths(state, 1000 + GROW_EVERY_MS * 1000), MAX_CATCH_UP);
  const anchored = state.last;
  assert.equal(dueGrowths(state, anchored - 5000), 0);
  assert.equal(state.last, anchored - 5000);
});

test('no agents means no growth, and storage round-trips safely', async () => {
  const { emptyNeurons, growNeuron, saveNeurons, loadNeurons, resetNeurons } = await load();
  assert.equal(growNeuron(emptyNeurons(), []), null);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const state = emptyNeurons();
  growNeuron(state, agents, 1, seeded(3));
  saveNeurons(state, storage);
  assert.equal(loadNeurons(storage).neurons.length, 1);
  store.set('capsule.neurogenesis.v1', '{bad');
  assert.equal(loadNeurons(storage).neurons.length, 0);
  assert.equal(resetNeurons(storage).neurons.length, 0);
});
