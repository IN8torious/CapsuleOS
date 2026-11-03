// Turns a static Mod Forge report into a data-only voxel district. Nothing here
// touches files or runs code: it only returns coloured cells to place.
// Palette indices: 0 red 1 orange 2 yellow 3 green 4 blue 5 purple 6 white 7 dark.
// Shape indices: 4 cube 5 pyramid 6 cylinder 7 prism 8 orb 9 ring.

const RED = 0, ORANGE = 1, YELLOW = 2, GREEN = 3, BLUE = 4, PURPLE = 5, WHITE = 6, DARK = 7;
const CUBE = 4, PYRAMID = 5, CYLINDER = 6, PRISM = 7, ORB = 8, RING = 9;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const count = (report, ...names) => (report.inventory || [])
  .filter((item) => names.includes(item.category))
  .reduce((sum, item) => sum + item.count, 0);

// Cells keyed by position so later parts (windows, doors, roofs) override earlier ones.
function canvas() {
  const map = new Map();
  return {
    set(x, y, z, color, shape = CUBE) { map.set(`${x},${y},${z}`, [x, y, z, color, shape]); },
    clear(x, y, z) { map.delete(`${x},${y},${z}`); },
    cells() { return [...map.values()]; }
  };
}

// Hollow walls from y0 to y1 (inclusive); the interior is never visible so it stays empty.
function walls(c, w, d, y0, y1, color, shape = CUBE) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = 0; x < w; x += 1) {
      for (let z = 0; z < d; z += 1) {
        if (x === 0 || z === 0 || x === w - 1 || z === d - 1) c.set(x, y, z, color, shape);
      }
    }
  }
}

function slab(c, w, d, y, color, inset = 0, shape = CUBE) {
  for (let x = inset; x < w - inset; x += 1) for (let z = inset; z < d - inset; z += 1) c.set(x, y, z, color, shape);
}

function warehouse(report) {
  const items = count(report, 'textures', 'models', 'sounds', 'shaders', 'languages');
  const w = clamp(6 + Math.floor(Math.sqrt(items) / 2), 6, 10);
  const d = 5;
  const h = clamp(3 + Math.floor(items / 60), 3, 5);
  const c = canvas();
  walls(c, w, d, 0, h - 1, ORANGE);
  for (let y = 0; y < h; y += 1) for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) c.set(x, y, z, DARK, CUBE);
  for (let x = 0; x < w; x += 1) { c.set(x, 0, 0, DARK); c.set(x, 0, d - 1, DARK); }
  const door = Math.floor(w / 2);
  c.clear(door, 0, d - 1); c.clear(door, 1, d - 1);
  c.set(door, 2, d - 1, YELLOW);
  for (let x = 2; x < w - 1; x += 2) {
    if (x === door) continue;
    c.set(x, 1, d - 1, BLUE); c.set(x, 1, 0, BLUE);
  }
  for (let z = 2; z < d - 1; z += 2) { c.set(0, 1, z, BLUE); c.set(w - 1, 1, z, BLUE); }
  slab(c, w, d, h, DARK);
  slab(c, w, d, h + 1, WHITE, 1);
  for (let x = 1; x < w - 1; x += 1) c.set(x, h + 2, Math.floor(d / 2), RED, PYRAMID);
  return { kind: 'assets', label: 'Asset warehouse', detail: `${items} art/sound files`, w, d, cells: c.cells() };
}

function tower(report) {
  const sources = report.sourceCount || 0;
  const h = clamp(7 + sources, 8, 15);
  const c = canvas();
  walls(c, 4, 4, 0, 1, DARK);
  c.clear(1, 0, 3); c.clear(1, 1, 3);
  c.set(1, 2, 3, YELLOW);
  walls(c, 4, 4, 2, h - 1, PURPLE);
  for (let y = 2; y < h; y += 1) {
    if (y % 4 === 1) { for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]]) c.set(x, y, z, WHITE, CYLINDER); }
    if (y % 3 === 0) { c.set(1, y, 0, YELLOW); c.set(2, y, 3, YELLOW); c.set(0, y, 2, YELLOW); c.set(3, y, 1, YELLOW); }
  }
  for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]]) for (let y = 0; y < h; y += 1) c.set(x, y, z, y < 2 ? DARK : PURPLE, CYLINDER);
  slab(c, 4, 4, h, DARK);
  for (let x = 0; x < 4; x += 1) for (let z = 0; z < 4; z += 1) {
    const rim = x === 0 || z === 0 || x === 3 || z === 3;
    if (rim && (x + z) % 2 === 0) c.set(x, h + 1, z, PURPLE, CUBE);
  }
  for (const [x, z] of [[1, 1], [2, 1], [1, 2], [2, 2]]) c.set(x, h + 1, z, WHITE, PYRAMID);
  c.set(1, h + 2, 1, DARK, CYLINDER);
  const flags = report.signals || [];
  const worst = flags.some((s) => s.level === 'high') ? RED : flags.length ? YELLOW : GREEN;
  c.set(1, h + 3, 1, worst, ORB);
  return { kind: 'code', label: 'Code tower', detail: `${sources} readable source file(s)`, w: 4, d: 4, cells: c.cells() };
}

function gate(report) {
  const deps = clamp((report.metadata?.dependencies || []).length, 1, 8);
  const w = deps * 3 + 1;
  const d = 2;
  const c = canvas();
  for (let i = 0; i <= deps; i += 1) {
    const x = i * 3;
    for (let z = 0; z < d; z += 1) {
      c.set(x, 0, z, DARK);
      for (let y = 1; y <= 4; y += 1) c.set(x, y, z, y % 2 ? BLUE : WHITE, y === 4 ? CYLINDER : CUBE);
      c.set(x, 5, z, DARK, PYRAMID);
    }
  }
  for (let i = 0; i < deps; i += 1) {
    for (let z = 0; z < d; z += 1) {
      for (const x of [i * 3 + 1, i * 3 + 2]) {
        c.set(x, 4, z, WHITE);
        c.set(x, 3, z, BLUE, RING);
      }
      c.set(i * 3 + 1, 5, z, YELLOW, PRISM);
      c.set(i * 3 + 2, 5, z, YELLOW, PRISM);
    }
  }
  return { kind: 'dependencies', label: 'Dependency gate', detail: `${(report.metadata?.dependencies || []).length} dependencies`, w, d, cells: c.cells() };
}

function house(report) {
  const w = 5, d = 5;
  const c = canvas();
  walls(c, w, d, 0, 2, WHITE);
  for (let y = 0; y < 3; y += 1) for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) c.set(x, y, z, ORANGE, CUBE);
  for (let x = 0; x < w; x += 1) { c.set(x, 0, 0, DARK); c.set(x, 0, d - 1, DARK); }
  c.clear(2, 0, d - 1); c.clear(2, 1, d - 1);
  c.set(2, 2, d - 1, ORANGE);
  for (const x of [1, 3]) { c.set(x, 1, d - 1, BLUE); c.set(x, 1, 0, BLUE); }
  for (const z of [2]) { c.set(0, 1, z, BLUE); c.set(w - 1, 1, z, BLUE); }
  slab(c, w, d, 3, RED);
  slab(c, w, d, 4, RED, 1);
  c.set(2, 5, 2, RED, PYRAMID);
  c.set(3, 4, 1, DARK, CYLINDER); c.set(3, 5, 1, DARK, CYLINDER);
  return { kind: 'docs', label: 'Docs & license house', detail: report.metadata?.license || 'license unknown', w, d, cells: c.cells() };
}

function beacons(report) {
  const high = (report.signals || []).filter((s) => s.level === 'high').length + (report.notes || []).filter((n) => n.level === 'high').length;
  const medium = (report.signals || []).filter((s) => s.level === 'medium').length + (report.notes || []).filter((n) => n.level === 'medium').length;
  const total = clamp(high + medium, 0, 6);
  if (!total) return null;
  const c = canvas();
  for (let i = 0; i < total; i += 1) {
    const color = i < high ? RED : YELLOW;
    const x = i * 2;
    c.set(x, 0, 0, DARK, CUBE);
    c.set(x, 1, 0, DARK, CYLINDER);
    c.set(x, 2, 0, DARK, CYLINDER);
    c.set(x, 3, 0, color, RING);
    c.set(x, 4, 0, color, ORB);
  }
  return { kind: 'flags', label: 'Review beacons', detail: `${high} high · ${medium} medium`, w: total * 2, d: 1, cells: c.cells() };
}

export function buildDistrict(report, packageName = 'mod') {
  if (!report || typeof report !== 'object') throw new Error('A static report is required.');
  const input = { ...report, sourceCount: report.sourceCount ?? 0 };
  const buildings = [warehouse(input), tower(input), gate(input), house(input), beacons(input)].filter(Boolean);
  const by = Object.fromEntries(buildings.map((b) => [b.kind, b]));
  const { code, assets, docs, dependencies, flags } = by;
  // A small village: tower at the back, a plaza in the middle with the warehouse and
  // house either side, the dependency gate at the front, one path spine through all.
  const cx = assets.w + 4;
  const rowW = assets.w + 8 + docs.w;
  code.x = cx - 2; code.z = 0;
  assets.x = 0; assets.z = 10;
  docs.x = rowW - docs.w; docs.z = 10;
  const opening = Math.floor((dependencies.w - 1) / 3 / 2) * 3 + 1;
  dependencies.x = cx - opening; dependencies.z = 19;
  if (flags) { flags.x = Math.max(cx + 3, rowW - flags.w); flags.z = 6; }
  const minX = Math.min(...buildings.map((b) => b.x));
  for (const b of buildings) b.x -= minX;
  const spine = cx - minX;
  const width = Math.max(...buildings.map((b) => b.x + b.w));
  const depth = Math.max(...buildings.map((b) => b.z + b.d));

  const inside = (x, z) => buildings.some((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d);
  const seen = new Set();
  const paths = [];
  const lay = (x, z) => {
    if (x < 0 || z < 0 || x >= width || z >= depth || inside(x, z) || seen.has(`${x},${z}`)) return;
    seen.add(`${x},${z}`);
    paths.push([x, z, (x * 7 + z * 3) % 5 === 0 ? WHITE : DARK]);
  };
  for (let z = code.z + code.d; z < dependencies.z + dependencies.d; z += 1) lay(spine, z);
  for (let x = spine - 2; x <= spine + 2; x += 1) for (let z = 7; z <= 9; z += 1) lay(x, z);
  const doors = [
    { b: assets, at: Math.floor(assets.w / 2) },
    { b: docs, at: 2 },
    { b: code, at: 1 }
  ];
  for (const { b, at } of doors) {
    b.door = b.x + at;
    const frontZ = b.z + b.d;
    const lo = Math.min(b.door, spine);
    const hi = Math.max(b.door, spine);
    for (let x = lo; x <= hi; x += 1) lay(x, frontZ);
  }
  const lamps = [[spine - 3, 7], [spine + 3, 7], [spine - 3, 9], [spine + 3, 9]]
    .filter(([x, z]) => !inside(x, z) && x >= 0 && x < width)
    .flatMap(([x, z]) => [[x, 0, z, DARK, CYLINDER], [x, 1, z, DARK, CYLINDER], [x, 2, z, YELLOW, ORB]]);

  return {
    name: String(report.metadata?.name || packageName).slice(0, 60),
    width,
    depth,
    buildings: buildings.map(({ kind, label, detail, x, z, w, d, cells, door }) => ({ kind, label, detail, x, z, w, d, cells, door: door ?? null })),
    paths,
    lamps,
    cellCount: buildings.reduce((n, b) => n + b.cells.length, 0) + paths.length + lamps.length
  };
}
