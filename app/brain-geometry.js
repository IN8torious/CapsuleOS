// Parametric brain lattice. The right hemisphere is a lat/long grid on an ellipsoid whose radius is modulated by
// sinusoidal gyri harmonics, a temporal-lobe Gaussian bulge and a flattened medial wall. The left hemisphere is its
// exact mirror, so the lattice is bilateral. Edges follow the grid (rings, meridians, one diagonal per quad).

const RINGS = 9;
const AZIMUTHS = 14;
const AXES = { a: 0.66, b: 0.6, c: 1.1, gap: 0.08 };
const GOLDEN = 0.6180339887498949;
const INNER_SCALE = 0.55;

function hemisphereVertex(theta, phi) {
  const lateral = Math.cos(phi);
  const sinT = Math.sin(theta);
  const gyri = 0.04 * Math.sin(6 * theta) * Math.cos(3 * phi + 0.8)
    + 0.025 * Math.sin(11 * theta + phi) * Math.cos(5 * phi);
  const temporal = 0.2 * Math.exp(-(((theta - 0.62 * Math.PI) / 0.32) ** 2) - (((phi + Math.PI / 4) / 0.6) ** 2));
  const taper = 0.8 + 0.2 * Math.sin(theta * 0.5 + 0.9);
  const r = (1 + gyri + temporal) * taper;
  const medialFlatten = lateral < 0 ? 0.08 : 1;
  const vertical = Math.sin(phi) < 0 ? 0.75 : 1;
  return [
    AXES.gap + AXES.a * sinT * lateral * medialFlatten * r,
    AXES.b * sinT * Math.sin(phi) * vertical * r,
    AXES.c * Math.cos(theta) * r,
  ];
}

// Appends a pole-capped lat/long grid to nodes/edges and returns the global [start, end) index range.
function addGrid(sample, rings, azimuths, nodes, edges) {
  const base = nodes.length;
  const at = (k, m) => {
    if (k === 0) return base;
    if (k === rings) return base + 1;
    return base + 2 + (k - 1) * azimuths + (((m % azimuths) + azimuths) % azimuths);
  };
  nodes.push(sample(0, 0), sample(Math.PI, 0));
  for (let k = 1; k < rings; k += 1) {
    for (let m = 0; m < azimuths; m += 1) {
      nodes.push(sample((k / rings) * Math.PI, (m / azimuths) * Math.PI * 2 - Math.PI));
    }
  }
  for (let m = 0; m < azimuths; m += 1) {
    edges.push([at(0, 0), at(1, m)], [at(rings - 1, m), at(rings, 0)]);
  }
  for (let k = 1; k < rings; k += 1) {
    for (let m = 0; m < azimuths; m += 1) {
      edges.push([at(k, m), at(k, m + 1)]);
      if (k < rings - 1) edges.push([at(k, m), at(k + 1, m)], [at(k, m), at(k + 1, m + 1)]);
    }
  }
  return [base, nodes.length];
}

// Dense cortex surface for shading. It follows the lattice's base ellipsoid and adds fine folds:
// ridged sine gyri (1 - 2|sin|) warped by a second harmonic, plus a Gaussian lateral (Sylvian) groove.
function foldDepth(theta, phi) {
  const warp = 2 * Math.cos(7 * phi) + 3 * Math.sin(5 * theta);
  const ridge = 1 - 2 * Math.abs(Math.sin(16 * theta + warp * 0.35));
  const cross = 1 - 2 * Math.abs(Math.sin(12 * phi + 2 * Math.sin(4 * theta)));
  const sylvian = Math.exp(-(((phi + 0.35) / 0.1) ** 2) - (((theta - 0.55 * Math.PI) / 0.45) ** 2));
  return 0.016 * (0.6 * ridge + 0.4 * cross) - 0.07 * sylvian;
}

export function buildCortexSurface(rings = 56, azimuths = 88) {
  const half = [];
  const index = [];
  const row = azimuths + 1;
  for (let k = 0; k <= rings; k += 1) {
    const theta = (k / rings) * Math.PI;
    for (let m = 0; m <= azimuths; m += 1) {
      const phi = (m / azimuths) * Math.PI * 2 - Math.PI;
      const [x, y, z] = hemisphereVertex(theta, phi);
      const d = 1 + foldDepth(theta, phi);
      half.push([AXES.gap + (x - AXES.gap) * d, y * d, z * d]);
    }
  }
  for (let k = 0; k < rings; k += 1) {
    for (let m = 0; m < azimuths; m += 1) {
      const a = k * row + m;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const mirrored = half.map(([x, y, z]) => [-x, y, z]);
  const left = [];
  for (let i = 0; i < index.length; i += 3) left.push(index[i] + half.length, index[i + 2] + half.length, index[i + 1] + half.length);
  return { vertices: [...half, ...mirrored], indices: [...index, ...left] };
}

export function buildBrain() {
  const nodes = [];
  const edges = [];

  const [, half] = addGrid(hemisphereVertex, RINGS, AZIMUTHS, nodes, edges);
  const halfEdges = edges.length;
  for (let i = 0; i < half; i += 1) nodes.push([-nodes[i][0], nodes[i][1], nodes[i][2]]);
  for (let e = 0; e < halfEdges; e += 1) edges.push([edges[e][0] + half, edges[e][1] + half]);
  const cortexEdgeCount = edges.length;

  const isMedial = (i) => Math.abs(nodes[i][0]) < AXES.gap - 1e-9;

  const cerebellumRange = addGrid((t, p) => [
    0.46 * Math.sin(t) * Math.cos(p) * (1 + 0.06 * Math.sin(12 * t)),
    -0.52 + 0.2 * Math.sin(t) * Math.sin(p),
    -0.8 + 0.34 * Math.cos(t),
  ], 5, 10, nodes, edges);

  const stemRange = addGrid((t, p) => [
    0.12 * Math.sin(t) * Math.cos(p) * (1 - 0.35 * (t / Math.PI)),
    -0.62 - 0.55 * (t / Math.PI),
    -0.28 - 0.08 * (t / Math.PI) + 0.12 * Math.sin(t) * Math.sin(p),
  ], 4, 6, nodes, edges);

  // Corpus callosum: link medial nodes to their mirror twins across the fissure.
  const callosumNodes = [];
  for (let i = 2; i < half; i += 3) {
    if (isMedial(i)) {
      edges.push([i, i + half]);
      callosumNodes.push(i, i + half);
    }
  }

  // Deep layer: each hemisphere shrunk towards its own centroid, joined to the cortex by radial spokes.
  const innerBase = nodes.length;
  for (let h = 0; h < 2; h += 1) {
    const start = h * half;
    const c = [0, 0, 0];
    for (let i = start; i < start + half; i += 1) for (let k = 0; k < 3; k += 1) c[k] += nodes[i][k] / half;
    for (let i = start; i < start + half; i += 1) {
      nodes.push(nodes[i].map((v, k) => c[k] + (v - c[k]) * INNER_SCALE));
    }
  }
  for (let e = 0; e < cortexEdgeCount; e += 1) edges.push([edges[e][0] + innerBase, edges[e][1] + innerBase]);
  for (let i = 0; i < half * 2; i += 2) edges.push([i, i + innerBase]);

  // Lobes by position: +z is the front, -z the back, low and lateral is temporal. Positive x is the brain's left.
  const lobeOf = (n) => {
    if (n[1] < -0.12 && n[2] > -0.55 && n[2] < 0.55) return 'temporal';
    if (n[2] >= 0.38) return 'frontal';
    if (n[2] <= -0.42) return 'occipital';
    return 'parietal';
  };
  const LOBES = {
    frontal: 'Planning and decisions',
    parietal: 'Sensing and coordination',
    temporal: 'Memory and language',
    occipital: 'Vision and pattern spotting',
  };
  const regionMap = new Map();
  const nodeRegion = new Array(nodes.length).fill('');
  const assign = (id, name, role, index) => {
    if (!regionMap.has(id)) regionMap.set(id, { id, name, role, nodes: [] });
    regionMap.get(id).nodes.push(index);
    nodeRegion[index] = id;
  };
  for (let h = 0; h < 2; h += 1) {
    const side = h === 0 ? 'left' : 'right';
    for (let i = h * half; i < (h + 1) * half; i += 1) {
      const lobe = lobeOf(nodes[i]);
      assign(`${lobe}-${side}`, `${lobe[0].toUpperCase()}${lobe.slice(1)} lobe · ${side}`, LOBES[lobe], i);
      assign(`deep-${side}`, `Deep layer · ${side}`, 'Inner relay layer that links the outer cortex', innerBase + i);
    }
  }
  for (let i = cerebellumRange[0]; i < cerebellumRange[1]; i += 1) assign('cerebellum', 'Cerebellum', 'Timing and fine-tuning', i);
  for (let i = stemRange[0]; i < stemRange[1]; i += 1) assign('stem', 'Brain stem', 'Carries core signals in and out', i);
  callosumNodes.forEach((i) => assign('callosum', 'Corpus callosum', 'Links the two halves', i));
  const regions = [...regionMap.values()].map((region) => {
    const center = [0, 0, 0];
    for (const index of region.nodes) for (let k = 0; k < 3; k += 1) center[k] += nodes[index][k] / region.nodes.length;
    return { ...region, center };
  });

  // Pin sites are lateral/dorsal cortex only, golden-ratio shuffled and interleaved left/right for even spread.
  const pool = (start) => {
    const list = [];
    for (let i = start; i < start + half; i += 1) if (!isMedial(i) && nodes[i][1] > -0.45) list.push(i);
    return list
      .map((i, order) => [i, (order * GOLDEN) % 1])
      .sort((x, y) => x[1] - y[1])
      .map(([i]) => i);
  };
  const right = pool(0);
  const left = pool(half);
  const pins = [];
  for (let i = 0; i < Math.max(right.length, left.length); i += 1) {
    if (i < right.length) pins.push(right[i]);
    if (i < left.length) pins.push(left[i]);
  }

  return { nodes, edges, pins, half, regions, nodeRegion };
}
