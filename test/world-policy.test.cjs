const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('procedural nature never automatically creates huts or stations', async () => {
  const { generateWorld } = await import('../toolbox/terrain.js');
  for (const seed of [1, 42, 515, 9001]) {
    const entities = generateWorld(seed, 3).flatMap(chunk => chunk.entities);
    assert.ok(entities.length);
    assert.ok(entities.every(entity => ['tree', 'rock'].includes(entity.type)));
  }
  const view = read('toolbox\\world-view.js');
  assert.match(view, /onAddStructure:.*showDistrict/);
  assert.equal((view.match(/buildStationDistrict\(/g) || []).length, 1, 'generation is bound only to the explicit dock callback');
  assert.doesNotMatch(view, /^\s{2}(?:showDistrict|consumeDistrict)\(/m);
  assert.match(view, /onAddDistrict: consumeDistrict/);
});

test('explicit station generation is seeded, bounded and uses aligned structural shapes', async () => {
  const { buildStationDistrict, WORLD_STATIONS } = await import('../app/world-hub.js');
  const footprints = new Set();
  for (const station of WORLD_STATIONS) for (const seed of [1, 42, 515, 9001]) {
    const district = buildStationDistrict(station.route, seed);
    assert.deepEqual(district, buildStationDistrict(station.route, seed));
    assert.equal(district.buildings.length, 1);
    const building = district.buildings[0];
    footprints.add(`${building.w}:${building.d}:${Math.max(...building.cells.map(cell => cell[1]))}`);
    assert.equal(new Set(building.cells.map(cell => cell.slice(0, 3).join(','))).size, building.cells.length);
    assert.ok(building.cells.every(([x, y, z, color, shape]) =>
      x >= 0 && x < building.w && z >= 0 && z < building.d && y >= 0 && y <= 9 && color >= 0 && color < 8 && shape === 4));
  }
  assert.ok(footprints.size > 1, 'seeded generation must change dimensions, not just labels');
  assert.throws(() => buildStationDistrict('arbitrary-route', 515), /known structure/);
});

test('Toolbox has no embedded browser; branding opens externally from Settings About', () => {
  const html = read('toolbox\\index.html'), main = read('toolbox\\main.js');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'toolbox', 'browser-view.js')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'src-tauri', 'src', 'browser.rs')), false);
  assert.doesNotMatch(html, /data-view="browser"/);
  assert.doesNotMatch(read('src-tauri\\src\\lib.rs'), /mod browser|browser_open|browser_bounds|browser_visible/);
  assert.doesNotMatch(main, /capsule-browser-request|import\('\.\/browser-view/);
  assert.match(main, /open_agent_host_page', \{ choice: 'project' \}/);
  assert.doesNotMatch(read('toolbox\\world-view.js'), /MUSE|muse/i);
  const settings = html.match(/<section class="view" data-view="settings">([\s\S]*?)<\/section>/)[1];
  assert.match(settings, /About Capsule Toolbox/);
  assert.match(settings, /href="https:\/\/www\.n8toriousai\.com\/"/);
  const shortcuts = html.match(/<nav class="header-shortcuts"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...shortcuts.matchAll(/data-shortcut-view="([^"]+)"/g)].map(match => match[1]), ['world', 'scene-studio', 'bible', 'settings']);
  assert.match(html, /data-shortcut-view="bible" aria-label="Toolbox Bible"/);
});
