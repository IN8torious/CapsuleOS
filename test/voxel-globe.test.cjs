const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('default globe uses the densest supported grid without changing saved globe generation', () => {
  const board = fs.readFileSync(path.join(__dirname, '..', 'toolbox', 'voxel-board.js'), 'utf8');
  assert.match(board, /const DEFAULT_CHUNKS = 5;/);
  assert.match(board, /generator: 'voxel-globe\/1'/);
});

test('denser grid increases surface detail while preserving the apparent planet scale', async () => {
  const { generateGlobe, voxelKey, surfaceCell } = await import('../toolbox/voxel-globe.js');
  const surfaceCounts = [64, 80].map(size => {
    const globe = generateGlobe(515, size);
    const occupied = new Set(globe.cells.map(cell => voxelKey(...cell)));
    assert.equal(globe.seaRadius / size, 0.30);
    return globe.cells.filter(cell => surfaceCell(...cell.slice(0, 3), occupied)).length;
  });
  assert.ok(surfaceCounts[1] > surfaceCounts[0] * 1.4, `Visible surface cells: ${surfaceCounts}`);
});

test('globe is deterministic, filled and spherical in all three axes, not a slab', async () => {
  const { generateGlobe, voxelKey } = await import('../toolbox/voxel-globe.js');
  const { MATERIALS } = await import('../toolbox/terrain.js');
  for (const [seed, size] of [[1, 48], [515, 64], [9001, 80]]) {
    const globe = generateGlobe(seed, size);
    assert.deepEqual(globe, generateGlobe(seed, size));
    const occupied = new Set(globe.cells.map(cell => voxelKey(...cell)));
    assert.equal(occupied.size, globe.cells.length);
    assert.ok(globe.cells.every(cell => cell.slice(0, 3).every(value => Number.isInteger(value) && value >= 0 && value < size)));
    const ground = globe.cells.filter(cell => !['wood', 'leaf'].includes(MATERIALS[cell[3]]));
    const spans = [0, 1, 2].map(axis => {
      const positions = ground.map(cell => cell[axis]);
      return Math.max(...positions) - Math.min(...positions) + 1;
    });
    assert.ok(Math.max(...spans) / Math.min(...spans) < 1.15, `Spherical extents: ${spans}`);
    for (const cell of ground) {
      const radius = Math.hypot(...cell.slice(0, 3).map(value => value - size / 2 + 0.5));
      assert.ok(radius <= size * 0.34, 'Relief cannot turn the planet into a jagged asteroid');
    }
    // A filled inner sphere rules out a latitude sheet or six disconnected surface patches.
    for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) for (let z = 0; z < size; z++) {
      if (Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5, z - size / 2 + 0.5) < size * 0.27) {
        assert.ok(occupied.has(voxelKey(x, y, z)), `Missing interior: ${x},${y},${z}`);
      }
    }
    assert.ok(globe.cells.some(cell => MATERIALS[cell[3]] === 'water'));
    assert.ok(globe.cells.some(cell => MATERIALS[cell[3]] === 'grass'));
    assert.ok(globe.cells.every(cell => MATERIALS[cell[3]] !== 'roof'));
  }
});

test('globe picking traverses every side and exposes the next solid cell after terrain removal', async () => {
  const { generateGlobe, voxelKey, traceVoxelGrid, surfaceCell } = await import('../toolbox/voxel-globe.js');
  const size = 48, cells = new Set(generateGlobe(515, size).cells.map(cell => voxelKey(...cell)));
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const origin = [0.2, 0.2, 0.2], direction = [0, 0, 0];
    origin[axis] = size * sign; direction[axis] = -sign;
    const hit = traceVoxelGrid(origin, direction, size, key => cells.has(key));
    assert.ok(hit && hit.place);
    assert.ok(surfaceCell(...hit.erase, cells));
    cells.delete(voxelKey(...hit.erase));
    const next = traceVoxelGrid(origin, direction, size, key => cells.has(key));
    assert.ok(next.distance > hit.distance);
    cells.add(voxelKey(...hit.erase));
    assert.deepEqual(traceVoxelGrid(origin, direction, size, key => cells.has(key)), hit);
  }
  assert.equal(traceVoxelGrid([40, 40, 0], [1, 0, 0], size, key => cells.has(key)), null);
  assert.equal(traceVoxelGrid([0, 0, 80], [0, 0, -1], size, key => cells.has(key), 10), null);
  assert.equal(traceVoxelGrid([80, 0, 0], [0, 0, 1], size, key => cells.has(key)), null);
});
