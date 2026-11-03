import { d120, MATERIALS } from './terrain.js';

const M = Object.fromEntries(MATERIALS.map((name, index) => [name, index]));
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;
export const voxelKey = (x, y, z) => `${x},${y},${z}`;
export const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function noise3(seed, x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const tx = smooth(x - ix), ty = smooth(y - iy), tz = smooth(z - iz);
  const value = (dx, dy, dz) => (d120(seed, ix + dx, iy + dy, iz + dz + 367) - 1) / 119;
  return mix(
    mix(mix(value(0, 0, 0), value(1, 0, 0), tx), mix(value(0, 1, 0), value(1, 1, 0), tx), ty),
    mix(mix(value(0, 0, 1), value(1, 0, 1), tx), mix(value(0, 1, 1), value(1, 1, 1), tx), ty), tz);
}

export function generateGlobe(seed, size = 48) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 999999 ||
      ![48, 64, 80].includes(size)) throw new Error('Invalid globe seed or diameter.');
  const cells = new Map(), half = size / 2, seaRadius = size * 0.30;
  const landRadius = (nx, ny, nz) => seaRadius +
    (noise3(seed, nx * 2.4 + 8, ny * 2.4 + 8, nz * 2.4 + 8) - 0.49) * size * 0.065 +
    (noise3(seed + 31, nx * 7 + 12, ny * 7 + 12, nz * 7 + 12) - 0.5) * size * 0.008;
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) for (let z = 0; z < size; z++) {
    const dx = x - half + 0.5, dy = y - half + 0.5, dz = z - half + 0.5;
    const radius = Math.hypot(dx, dy, dz);
    if (radius > size * 0.43) continue;
    if (radius < seaRadius - size * 0.12) {
      cells.set(voxelKey(x, y, z), [x, y, z, M.rock]);
      continue;
    }
    const land = landRadius(dx / radius, dy / radius, dz / radius);
    if (radius > Math.max(land, seaRadius)) continue;
    let material = M.rock;
    if (land < seaRadius && radius > land) material = M.water;
    else if (radius > land - 1.8) {
      material = Math.abs(dy / radius) > 0.88 ? M.snow
        : land > seaRadius + size * 0.019 ? M.rock : land < seaRadius + 0.18 ? M.sand : M.grass;
    }
    cells.set(voxelKey(x, y, z), [x, y, z, material]);
  }
  const trees = [];
  const put = (x, y, z, material) => {
    if ([x, y, z].some(value => value < 1 || value >= size - 1)) return;
    const key = voxelKey(x, y, z);
    if (!cells.has(key)) cells.set(key, [x, y, z, material]);
  };
  for (const [x, y, z, material] of [...cells.values()]) {
    if (material !== M.grass || d120(seed, x, z, y + 841) !== 1) continue;
    const direction = [x - half + 0.5, y - half + 0.5, z - half + 0.5];
    const length = Math.hypot(...direction);
    const up = direction.map(value => value / length);
    const outward = [x, y, z].map((value, axis) => Math.round(value + up[axis]));
    if (cells.has(voxelKey(...outward)) || trees.some(tree => Math.hypot(x - tree[0], y - tree[1], z - tree[2]) < 5)) continue;
    trees.push([x, y, z]);
    for (let height = 1; height <= 2; height++) {
      put(...[x, y, z].map((value, axis) => Math.round(value + up[axis] * height)), M.wood);
    }
    const crown = [x, y, z].map((value, axis) => Math.round(value + up[axis] * 2.8));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (dx * dx + dy * dy + dz * dz <= 2) put(crown[0] + dx, crown[1] + dy, crown[2] + dz, M.leaf);
    }
  }
  return { cells: [...cells.values()], seaRadius, trees: trees.length };
}

export function surfaceCell(x, y, z, occupied) {
  return NEIGHBORS.some(([dx, dy, dz]) => !occupied.has(voxelKey(x + dx, y + dy, z + dz)));
}

// Grid traversal visits the next crossed face exactly; picking does not scan every instance.
export function traceVoxelGrid(origin, direction, size, occupied, maxDistance = Infinity) {
  let enter = 0, exit = maxDistance, entryAxis = -1;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(direction[axis]) < 1e-10) {
      if (origin[axis] < -size / 2 || origin[axis] >= size / 2) return null;
      continue;
    }
    const a = (-size / 2 - origin[axis]) / direction[axis];
    const b = (size / 2 - origin[axis]) / direction[axis];
    const near = Math.min(a, b);
    if (near > enter) { enter = near; entryAxis = axis; }
    exit = Math.min(exit, Math.max(a, b));
  }
  if (enter > exit || exit < 0) return null;
  const start = enter + 1e-7;
  const cell = origin.map((value, axis) => Math.floor(value + direction[axis] * start + size / 2));
  const step = direction.map(Math.sign);
  const delta = direction.map(value => value === 0 ? Infinity : Math.abs(1 / value));
  const next = cell.map((value, axis) => direction[axis] === 0 ? Infinity
    : ((value + (step[axis] > 0 ? 1 : 0) - size / 2) - origin[axis]) / direction[axis]);
  let previous = entryAxis < 0 ? null : cell.map((value, axis) => value - (axis === entryAxis ? step[axis] : 0));
  let distance = enter;
  while (cell.every(value => value >= 0 && value < size) && distance <= exit) {
    if (occupied(voxelKey(...cell))) return { erase: [...cell], place: previous, distance };
    previous = [...cell];
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    distance = next[axis]; next[axis] += delta[axis]; cell[axis] += step[axis];
  }
  return null;
}
