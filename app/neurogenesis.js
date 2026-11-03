// Neurogenesis: agents grow new neurons inside the contained brain lattice on their own.
// This is visual, in-capsule data only (positions and parent links, kept in localStorage). It never touches the
// system, so no approval is needed. Anything that would need admin rights must still go through a proposal.

export const STORAGE_KEY = 'capsule.neurogenesis.v1';
export const MAX_NEURONS = 180;
export const STEP = 0.11;
export const MIN_GAP = 0.045;
// Growth must stay inside the cortex shell: a scaled copy of the brain's ellipsoid bounds.
const BOUNDS = { x: 0.78, y: 0.62, z: 1.12, fill: 0.78 };

export function emptyNeurons() {
  return { neurons: [], next: 1, last: 0 };
}

export const GROW_EVERY_MS = 14000;
export const MAX_CATCH_UP = 24;

// Wall-clock schedule (the system's real time clock): how many growths are due since the last one.
// A clock that moves backwards re-anchors instead of growing. Catch-up is capped so reopening is bounded.
export function dueGrowths(state, now = Date.now(), every = GROW_EVERY_MS) {
  if (!state.last || now < state.last) {
    state.last = now;
    return 0;
  }
  const due = Math.min(MAX_CATCH_UP, Math.floor((now - state.last) / every));
  state.last = due >= MAX_CATCH_UP ? now : state.last + due * every;
  return due;
}

export function insideBrain([x, y, z]) {
  return (x / BOUNDS.x) ** 2 + (y / BOUNDS.y) ** 2 + (z / BOUNDS.z) ** 2 <= BOUNDS.fill;
}

function unitVector(rand) {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(phi), u, s * Math.sin(phi)];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// agents: [{ key, home: [x, y, z] }]. Returns the new neuron, or null if growth is capped or blocked.
export function growNeuron(state, agents, now = Date.now(), rand = Math.random) {
  if (!agents.length || state.neurons.length >= MAX_NEURONS) return null;
  const counts = new Map(agents.map((agent) => [agent.key, 0]));
  for (const neuron of state.neurons) if (counts.has(neuron.agent)) counts.set(neuron.agent, counts.get(neuron.agent) + 1);
  const least = Math.min(...counts.values());
  const pool = agents.filter((agent) => counts.get(agent.key) <= least + 1);
  const agent = pool[Math.floor(rand() * pool.length)];
  const own = state.neurons.filter((neuron) => neuron.agent === agent.key);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const parent = own.length && rand() < 0.75 ? own[Math.floor(rand() * own.length)] : null;
    const origin = parent ? parent.p : agent.home;
    const direction = unitVector(rand);
    const p = origin.map((value, k) => value + direction[k] * STEP * (0.6 + rand() * 0.8));
    if (!insideBrain(p) || state.neurons.some((neuron) => dist(neuron.p, p) < MIN_GAP)) continue;
    const neuron = { id: state.next, agent: agent.key, p, parent: parent ? parent.id : null, born: now };
    state.next += 1;
    state.neurons.push(neuron);
    return neuron;
  }
  return null;
}

export function loadNeurons(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!parsed || !Array.isArray(parsed.neurons)) return emptyNeurons();
    const neurons = parsed.neurons
      .filter((n) => n && Array.isArray(n.p) && n.p.length === 3 && n.p.every(Number.isFinite) && typeof n.agent === 'string')
      .slice(0, MAX_NEURONS);
    return { neurons, next: Math.max(1, ...neurons.map((n) => n.id + 1)), last: Number.isFinite(parsed.last) ? parsed.last : 0 };
  } catch {
    return emptyNeurons();
  }
}

export function saveNeurons(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable or full; growth simply stays in memory.
  }
}

export function resetNeurons(storage = globalThis.localStorage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  return emptyNeurons();
}
