export const WORLD_STATIONS = Object.freeze([
  { route: 'mod-forge', label: 'Mod Forge', detail: 'Inspect a package and turn its report into a district.', color: 1 },
  { route: 'scene-studio', label: 'Scene Studio', detail: 'Open HTML, review reusable components, or build a scene.', color: 5 },
  { route: 'browser', label: 'Browser', detail: 'Open the isolated browser without giving pages Toolbox access.', color: 4 },
  { route: 'agents', label: 'Crew & knowledge', detail: 'Explore the agent graph, workflows and approved learning.', color: 3 },
  { route: 'cockpit', label: 'Engine diagnostics', detail: 'Inspect performance, activity and execution receipts.', color: 0 },
  { route: 'wsl', label: 'WSL hosts', detail: 'Review Linux hosts, runtime setup and workload routing.', color: 2 }
].map(Object.freeze));

export function buildStationDistrict(route, seed) {
  const index = WORLD_STATIONS.findIndex(station => station.route === route);
  if (index < 0 || !Number.isSafeInteger(seed) || seed < 0) throw new Error('Choose a known structure and a valid world seed.');
  const station = WORLD_STATIONS[index];
  const w = 6 + d120(seed, index, 0, 61) % 2, d = 5 + d120(seed, index, 0, 62) % 3;
  const h = 3 + d120(seed, index, 0, 63) % 2;
  const door = Math.floor(w / 2);
  const cells = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    cells.push([x, 0, z, 7, CUBE]);
    const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
    if (edge) for (let y = 1; y <= h; y++) {
      if (z === d - 1 && x === door && y < 3) continue;
      const window = y === 2 && ((z === 0 || z === d - 1) ? x === 1 || x === w - 2 : z === 2);
      cells.push([x, y, z, window ? 4 : station.color, CUBE]);
    }
    const roof = h + 1 + Math.min(x, w - 1 - x);
    if (z === 0 || z === d - 1) for (let y = h + 1; y < roof; y++) cells.push([x, y, z, station.color, CUBE]);
    cells.push([x, roof, z, 7, CUBE]);
  }
  const building = { kind: 'station', ...station, x: 0, z: 0, w, d, cells, door };
  return { name: station.label, width: w, depth: d, buildings: [building], paths: [], lamps: [], cellCount: cells.length };
}
import { d120 } from '../toolbox/terrain.js';

const CUBE = 4;
