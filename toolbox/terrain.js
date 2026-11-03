// Seeded d120 terrain. Every value comes from a documented roll: d120(seed, a, b, salt).
// Terrain height is a global function of (x, z), so chunk borders always meet.
// Entities are placed whole inside one chunk and never touch a chunk border.

export const CHUNK = 16;
export const MAX_H = 28;
export const WATER = 8;

export const MATERIALS = ['water', 'sand', 'grass', 'rock', 'snow', 'wood', 'leaf', 'roof'];
export const MATERIAL_COLORS = ['#2b6cb0', '#d9c27a', '#4a9d4f', '#7b7480', '#f1f5f9', '#7a5230', '#2f7d3a', '#b3302f'];
const M = Object.fromEntries(MATERIALS.map((name, index) => [name, index]));

function hash32(a, b, c) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

export function d120(seed, a = 0, b = 0, salt = 0) {
  return (hash32((seed | 0) ^ Math.imul(salt | 0, 0x45d9f3b), a | 0, b | 0) % 120) + 1;
}

const smooth = (t) => t * t * (3 - 2 * t);

function octave(seed, x, z, period, salt) {
  const fx = x / period;
  const fz = z / period;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const v = (i, j) => (d120(seed, i, j, salt) - 1) / 119;
  const top = v(ix, iz) * (1 - tx) + v(ix + 1, iz) * tx;
  const bottom = v(ix, iz + 1) * (1 - tx) + v(ix + 1, iz + 1) * tx;
  return top * (1 - tz) + bottom * tz;
}

// World Gen V2 recipe (FrozenBlock, Hytale node graph), rescaled to voxels:
// a gradient-warped, jittered Voronoi cell map picks land biomes; a ridged river map
// (1 - |sum of low-frequency noise|) mixes cells toward the River range; an ocean mask
// pushes the value into Shore/Ocean. Biome ranges are the V2 NoiseRange table.
// Hytale's simplex noise is replaced by seeded d120 lattice noise.
const CELL = 28;
const BIOME_RANGES = [
  ['oak', -1, -0.82],
  ['gorges', -0.82, -0.66],
  ['deeproot', -0.66, -0.5],
  ['river', -0.5, 0],
  ['shore', 0, 0.15],
  ['ocean', 0.15, 2]
];
const HEIGHT_CURVE = [[-0.91, 14], [-0.74, 20], [-0.58, 16], [-0.3, 6], [0.075, 9], [0.5, 4]];

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

function cellValue(seed, x, z) {
  const wx = x + (octave(seed, x, z, 20, 30) - 0.5) * 12;
  const wz = z + (octave(seed, x, z, 20, 31) - 0.5) * 12;
  const ci = Math.floor(wx / CELL);
  const cj = Math.floor(wz / CELL);
  let best = Infinity;
  let second = Infinity;
  let value = 0;
  let secondValue = 0;
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      const px = (i + 0.5 + 0.2 * ((d120(seed, i, j, 40) - 60.5) / 60)) * CELL;
      const pz = (j + 0.5 + 0.2 * ((d120(seed, i, j, 41) - 60.5) / 60)) * CELL;
      const d = Math.hypot(px - wx, pz - wz);
      const v = -1 + 0.5 * ((d120(seed, i, j, 43) - 1) / 119);
      if (d < best) {
        second = best;
        secondValue = value;
        best = d;
        value = v;
      } else if (d < second) {
        second = d;
        secondValue = v;
      }
    }
  }
  const t = smooth(clamp01((second - best) / 9));
  return lerp((value + secondValue) / 2, value, t);
}

function riverFields(seed, x, z) {
  const ridge = (octave(seed, x, z, 96, 20) * 2 - 1) * 0.85 + (octave(seed, x, z, 24, 21) * 2 - 1) * 0.1;
  const river = smooth(clamp01(1 - Math.abs(ridge) / 0.09));
  const ocean = smooth(clamp01((octave(seed, x, z, 80, 22) - 0.74) / 0.08));
  return { river, ocean };
}

export function noiseValueAt(seed, x, z) {
  const { river, ocean } = riverFields(seed, x, z);
  const v = lerp(cellValue(seed, x, z), -0.3, river);
  return lerp(v, 0.5, ocean);
}

// Rivers run in terraces: each reach holds a level 2 voxels above the next, so water spills over the step and falls.
export function riverAt(seed, x, z) {
  const { river, ocean } = riverFields(seed, x, z);
  const strength = river * (1 - ocean);
  const level = WATER + 2 * Math.floor(octave(seed, x, z, 120, 23) * 2);
  return { strength, level, channel: strength > 0.6, bank: strength > 0.02 && strength <= 0.6 };
}

export function biomeAt(seed, x, z) {
  const v = noiseValueAt(seed, x, z);
  return (BIOME_RANGES.find(([, lo, hi]) => v >= lo && v < hi) || BIOME_RANGES[5])[0];
}

export function heightAt(seed, x, z) {
  const v = noiseValueAt(seed, x, z);
  let base = HEIGHT_CURVE[HEIGHT_CURVE.length - 1][1];
  if (v <= HEIGHT_CURVE[0][0]) base = HEIGHT_CURVE[0][1];
  for (let k = 1; k < HEIGHT_CURVE.length; k++) {
    if (v <= HEIGHT_CURVE[k][0]) {
      const [a, ha] = HEIGHT_CURVE[k - 1];
      const [b, hb] = HEIGHT_CURVE[k];
      base = lerp(ha, hb, (v - a) / (b - a));
      break;
    }
  }
  const relief = (octave(seed, x, z, CHUNK, 1) - 0.5) * 2 + (octave(seed, x, z, CHUNK / 2, 2) - 0.5);
  const land = clamp01((base - WATER) / 8);
  const h = Math.min(MAX_H, Math.max(1, Math.round(base + relief * 3.2 * land)));
  const river = riverAt(seed, x, z);
  if (river.channel) return river.level;
  if (river.bank) return Math.round(lerp(h, river.level + 1, clamp01((river.strength - 0.02) / 0.58)));
  return h;
}

export function isWaterAt(seed, x, z, h) {
  return h < WATER || riverAt(seed, x, z).channel;
}

function surfaceMaterial(h, biome) {
  if (h < WATER) return M.water;
  if (h <= WATER + 2 || biome === 'shore') return M.sand;
  if (biome === 'gorges') return h <= 18 ? M.rock : M.snow;
  if (h <= 18) return M.grass;
  if (h <= 24) return M.rock;
  return M.snow;
}

const ENTITY_TYPES = [
  { type: 'tree', upTo: 60, w: 3 },
  { type: 'rock', upTo: 120, w: 4 }
];

function entityVoxels(type, x0, z0, base) {
  const out = [];
  if (type === 'tree') {
    for (let y = 0; y < 4; y++) out.push([x0 + 1, base + y, z0 + 1, M.wood]);
    for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) for (let y = 4; y < 6; y++) out.push([x0 + dx, base + y, z0 + dz, M.leaf]);
    out.push([x0 + 1, base + 6, z0 + 1, M.leaf]);
  } else if (type === 'rock') {
    for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) for (let y = 0; y < 2; y++) out.push([x0 + dx, base + y, z0 + dz, M.rock]);
    for (let dx = 1; dx < 3; dx++) for (let dz = 1; dz < 3; dz++) out.push([x0 + dx, base + 2, z0 + dz, M.rock]);
  } else {
    for (let dx = 0; dx < 6; dx++) {
      for (let dz = 0; dz < 6; dz++) {
        const edge = dx === 0 || dz === 0 || dx === 5 || dz === 5;
        if (edge) {
          for (let y = 0; y < 4; y++) {
            const door = dz === 0 && (dx === 2 || dx === 3) && y < 2;
            if (!door) out.push([x0 + dx, base + y, z0 + dz, M.wood]);
          }
        }
        out.push([x0 + dx, base + 4, z0 + dz, M.roof]);
        if (dx >= 1 && dx <= 4 && dz >= 1 && dz <= 4) out.push([x0 + dx, base + 5, z0 + dz, M.roof]);
      }
    }
  }
  return out;
}
const overlaps = (a, b) =>
  a.x0 - 1 < b.x0 + b.w && b.x0 - 1 < a.x0 + a.w && a.z0 - 1 < b.z0 + b.w && b.z0 - 1 < a.z0 + a.w;

export function generateChunk(seed, cx, cz) {
  const originX = cx * CHUNK;
  const originZ = cz * CHUNK;
  const roll = d120(seed, cx, cz, 3);
  const heights = new Map();
  const wetCells = new Set();
  const key = (x, z) => `${x},${z}`;
  for (let dx = 0; dx < CHUNK; dx++) {
    for (let dz = 0; dz < CHUNK; dz++) {
      const x = originX + dx;
      const z = originZ + dz;
      const h = heightAt(seed, x, z);
      heights.set(key(x, z), h);
      if (isWaterAt(seed, x, z, h)) wetCells.add(key(x, z));
    }
  }

  const entities = [];
  const attempts = Math.floor(roll / 12);
  for (let k = 0; k < attempts; k++) {
    const typeRoll = d120(seed, cx, cz, 10 + k * 4);
    const kind = ENTITY_TYPES.find((t) => typeRoll <= t.upTo);
    const span = CHUNK - 1 - kind.w;
    const x0 = originX + 1 + ((d120(seed, cx, cz, 11 + k * 4) - 1) % span);
    const z0 = originZ + 1 + ((d120(seed, cx, cz, 12 + k * 4) - 1) % span);
    const candidate = { type: kind.type, x0, z0, w: kind.w, roll: typeRoll };
    if (entities.some((e) => overlaps(e, candidate))) continue;
    let base = 0;
    let low = Infinity;
    let wet = false;
    for (let dx = 0; dx < kind.w; dx++) {
      for (let dz = 0; dz < kind.w; dz++) {
        const h = heights.get(key(x0 + dx, z0 + dz));
        base = Math.max(base, h);
        low = Math.min(low, h);
        if (wetCells.has(key(x0 + dx, z0 + dz))) wet = true;
      }
    }
    if (wet || base - low > 2) continue;
    for (let dx = 0; dx < kind.w; dx++) for (let dz = 0; dz < kind.w; dz++) heights.set(key(x0 + dx, z0 + dz), base);
    entities.push({ ...candidate, base, voxels: entityVoxels(kind.type, x0, z0, base) });
  }

  const columns = [];
  for (let dx = 0; dx < CHUNK; dx++) {
    for (let dz = 0; dz < CHUNK; dz++) {
      const x = originX + dx;
      const z = originZ + dz;
      const h = heights.get(key(x, z));
      const biome = biomeAt(seed, x, z);
      columns.push({ x, z, h: Math.max(h, WATER), mat: wetCells.has(key(x, z)) ? M.water : surfaceMaterial(h, biome), biome });
    }
  }
  return { cx, cz, roll, columns, entities };
}

export function generateWorld(seed, size) {
  const chunks = [];
  for (let cz = 0; cz < size; cz++) for (let cx = 0; cx < size; cx++) chunks.push(generateChunk(seed, cx, cz));
  return chunks;
}

// Voxels to draw: each column's top plus any exposed side down to its lowest neighbour.
export function worldVoxels(chunks) {
  const heights = new Map();
  const wetKeys = new Set();
  for (const chunk of chunks) {
    for (const c of chunk.columns) {
      heights.set(`${c.x},${c.z}`, c.h);
      if (c.mat === M.water) wetKeys.add(`${c.x},${c.z}`);
    }
  }
  const out = [];
  for (const chunk of chunks) {
    for (const c of chunk.columns) {
      // Walls reach one voxel below any neighbouring water so waves never expose a gap.
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => {
        const key = `${c.x + dx},${c.z + dz}`;
        const h = heights.get(key) ?? 0;
        return wetKeys.has(key) ? h - 1 : h;
      });
      const floor = Math.max(0, Math.min(c.h - 1, ...neighbours));
      const side = c.mat === M.water || c.mat === M.sand ? c.mat : M.rock;
      for (let y = floor; y < c.h; y++) out.push([c.x, y, c.z, y === c.h - 1 ? c.mat : side]);
    }
    for (const e of chunk.entities) out.push(...e.voxels);
  }
  return out;
}
