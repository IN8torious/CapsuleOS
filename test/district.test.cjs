const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'district.js')).href);
const report = {
  metadata: { name: 'Dragons', dependencies: ['fabricloader', 'fabric-api'], license: 'MIT' },
  inventory: [{ category: 'textures', count: 90 }, { category: 'models', count: 10 }],
  signals: [{ level: 'high' }, { level: 'medium' }],
  notes: [],
  sourceCount: 3
};

test('a report becomes a bounded, non-overlapping district of coloured cells', async () => {
  const { buildDistrict } = await load();
  const d = buildDistrict(report, 'dragons.jar');
  assert.deepEqual(d.buildings.map((b) => b.kind), ['assets', 'code', 'dependencies', 'docs', 'flags']);
  assert.ok(d.cellCount > 50 && d.cellCount < 3000);
  for (const b of d.buildings) {
    assert.ok(b.cells.every(([x, y, z, c, s]) => x >= 0 && x < b.w && z >= 0 && z < b.d && y >= 0 && c >= 0 && c < 8 && s >= 0 && s < 10));
  }
  for (const [i, a] of d.buildings.entries()) {
    assert.ok(a.x >= 0 && a.z >= 0 && a.x + a.w <= d.width && a.z + a.d <= d.depth);
    for (const b of d.buildings.slice(i + 1)) {
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.z + a.d <= b.z || b.z + b.d <= a.z;
      assert.ok(apart, `${a.kind} overlaps ${b.kind}`);
    }
  }
  for (const [x, z] of d.paths) assert.ok(!d.buildings.some((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d));
  assert.ok(d.paths.length > 20);
});

test('a clean mod has no beacons and tolerates empty input', async () => {
  const { buildDistrict } = await load();
  const d = buildDistrict({ metadata: { dependencies: [] }, inventory: [], signals: [], notes: [] });
  assert.equal(d.buildings.some((b) => b.kind === 'flags'), false);
  assert.throws(() => buildDistrict(null));
});
