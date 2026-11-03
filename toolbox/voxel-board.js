import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CHUNK, MATERIAL_COLORS, MATERIALS, d120 } from './terrain.js';
import { generateGlobe, NEIGHBORS, surfaceCell, traceVoxelGrid } from './voxel-globe.js';

const MAT_WATER = MATERIALS.indexOf('water');

const PALETTE = ['#e72a43', '#ff9a3c', '#ffd34d', '#4ade80', '#38bdf8', '#7c6cff', '#f4eff1', '#3a3340'];
const LIBRARY_KEY = 'capsule.voxel.assets';
const MAX_ASSETS = 20;
const MAX_VOXELS = 12000;
const MIN_CHUNKS = 3;
const DEFAULT_CHUNKS = 5;
const MAX_CHUNKS = 5;

function cleanName(raw) {
  const name = String(raw || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 40);
  return name || 'Untitled asset';
}

function readLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((a) => a && Array.isArray(a.voxels)) : [];
  } catch {
    return [];
  }
}

function randomSeed() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % 1000000;
}

export function mountVoxelBoard(host, { onInspect, structureOptions = [], onAddStructure, onAddDistrict } = {}) {
  host.innerHTML = `
    <div class="vx">
      <div class="vx-stage">
        <div class="vx-canvas">
          <div class="vx-hud">
            <span class="vx-count">0 VOXELS</span>
            <span class="vx-motion"></span>
          </div>
          <div class="vx-bar">
            ${onInspect ? '<button data-tool="inspect" class="active" title="Inspect a station or district building">Inspect</button>' : ''}
            <button data-tool="place" class="${onInspect ? '' : 'active'}" title="Place (left click)">✚ Place</button>
            <button data-tool="erase" title="Erase">✖ Erase</button>
            <button data-tool="reshape" title="Reshape: swap a piece to the selected shape and colour">◇ Reshape</button>
            <button data-tool="turn" title="Turn a piece 90°">⟳ Turn</button>
            <i></i>
            <button data-act="undo" title="Undo" aria-label="Undo">↶</button>
            <button data-act="zoom-out" title="Zoom out (−)" aria-label="Zoom out">－</button>
            <button data-act="zoom-in" title="Zoom in (+)" aria-label="Zoom in">＋</button>
            <i></i>
            <button data-act="walk" title="Orbit controls: drag to rotate, scroll to zoom. Walking is not available on the globe." disabled>Orbit</button>
            <button data-act="expand" title="Fill window (E)" aria-pressed="false">⛶</button>
            <button data-act="bar" title="Hide toolbar" aria-label="Hide toolbar">⌄</button>
          </div>
          <button class="vx-handle vx-handle-bar" data-act="bar" title="Show toolbar" aria-label="Show toolbar" hidden>⌃</button>
          <button class="vx-handle vx-handle-dock" data-act="dock-show" title="Show dock" aria-label="Show dock" hidden>☰</button>
          <span class="vx-msg"></span>
        </div>
      </div>
      <aside class="vx-dock" data-open="true">
        <nav class="vx-rail">
          <button data-tab="build" class="active" title="Build" aria-label="Build">▦</button>
          <button data-tab="world" title="World" aria-label="World">◍</button>
          <button data-tab="assets" title="Assets" aria-label="Assets">▣</button>
          <button data-act="dock" title="Collapse dock" aria-label="Collapse dock">⇥</button>
        </nav>
        <div class="vx-panels">
          <section data-panel="build">
            <h4>Colour</h4>
            <span class="vx-palette"></span>
            <h4>Shape</h4>
            <select class="vx-shape-select vx-wide" aria-label="Piece shape"></select>
            <details class="vx-structures" ${onAddStructure ? '' : 'hidden'}>
              <summary>Add a structure</summary>
              <select data-structure-choice class="vx-wide" aria-label="Structure to generate"></select>
              <button data-act="add-structure" class="vx-wide">Generate selected structure</button>
              <button data-act="add-district" class="vx-wide">Add reviewed package district</button>
              <p>Generated only when you choose. Source code never runs.</p>
            </details>
            <button data-act="clear" class="vx-wide">Reset my edits</button>
          </section>
          <section data-panel="world" hidden>
            <h4>Seed</h4>
            <input class="vx-seed" type="number" min="0" max="999999" step="1" aria-label="World seed" />
            <button data-act="roll" class="vx-wide">Roll a new planet</button>
            <button data-act="grow" class="vx-wide">Change planet size</button>
            <button data-act="borders" class="vx-wide" aria-pressed="true">Orbit guides</button>
            <span class="vx-world-info"></span>
          </section>
          <section data-panel="assets" hidden>
            <h4>Deploy</h4>
            <input class="vx-name" type="text" maxlength="40" placeholder="Asset name" aria-label="Asset name" />
            <button data-act="deploy" class="vx-deploy vx-wide">⬆ Deploy asset</button>
            <h4>Library</h4>
            <div class="vx-library"></div>
          </section>
        </div>
      </aside>
    </div>`;

  const canvasHost = host.querySelector('.vx-canvas');
  const countEl = host.querySelector('.vx-count');
  const msg = host.querySelector('.vx-msg');
  const nameInput = host.querySelector('.vx-name');
  const seedInput = host.querySelector('.vx-seed');
  const infoEl = host.querySelector('.vx-world-info');
  const motionEl = host.querySelector('.vx-motion');
  const libraryEl = host.querySelector('.vx-library');
  const structureChoice = host.querySelector('[data-structure-choice]');
  for (const structure of structureOptions) {
    const option = document.createElement('option');
    option.value = structure.route; option.textContent = structure.label;
    structureChoice.append(option);
  }
  host.querySelector('[data-act="add-structure"]').addEventListener('click', () => {
    try { onAddStructure(structureChoice.value, seed); }
    catch (error) { msg.textContent = `Structure not placed: ${error.message}`; }
  });
  host.querySelector('[data-act="add-district"]').addEventListener('click', () => onAddDistrict());

  const dock = host.querySelector('.vx-dock');
  const openTab = (name) => {
    dock.dataset.open = 'true';
    host.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    host.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  };
  host.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    if (dock.dataset.open === 'true' && b.classList.contains('active')) dock.dataset.open = 'false';
    else openTab(b.dataset.tab);
  }));
  host.querySelector('[data-act="dock"]').addEventListener('click', () => {
    dock.dataset.open = 'hidden';
    syncHandles();
  });
  host.querySelector('[data-act="dock-show"]').addEventListener('click', () => {
    dock.dataset.open = 'false';
    syncHandles();
  });
  const bar = host.querySelector('.vx-bar');
  const barHandle = host.querySelector('.vx-handle-bar');
  const dockHandle = host.querySelector('.vx-handle-dock');
  const hud = host.querySelector('.vx-hud');
  let uiHidden = false;
  function syncHandles() {
    barHandle.hidden = !bar.hidden || uiHidden;
    dockHandle.hidden = dock.dataset.open !== 'hidden' || uiHidden;
    dock.hidden = uiHidden;
    hud.hidden = uiHidden;
    bar.hidden = bar.hidden || uiHidden;
  }
  host.querySelectorAll('[data-act="bar"]').forEach((b) => b.addEventListener('click', () => {
    bar.hidden = !bar.hidden && !uiHidden;
    syncHandles();
  }));
  // H hides every overlay for an unobstructed view; press again to restore.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'h' && e.key !== 'H') return;
    if (e.target instanceof HTMLInputElement || host.offsetParent === null) return;
    uiHidden = !uiHidden;
    if (!uiHidden) bar.hidden = false;
    syncHandles();
    msg.textContent = uiHidden ? 'UI hidden · H to restore' : 'UI restored';
  });
  dock.dataset.open = 'hidden';
  bar.hidden = false;
  syncHandles();
  // Messages show as a short toast, then fade.
  let toastTimer = 0;
  new MutationObserver(() => {
    msg.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => msg.classList.remove('show'), 3500);
  }).observe(msg, { childList: true, characterData: true, subtree: true });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  canvasHost.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI - 0.01;
  controls.minPolarAngle = 0.01;
  controls.enablePan = false;
  controls.minDistance = 8;
  controls.maxDistance = 260;
  controls.addEventListener('start', () => { glide = null; });

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const skyTexture = (dark) => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, dark ? '#151c29' : '#e8eef0');
    grad.addColorStop(0.55, dark ? '#202731' : '#f4f3ed');
    grad.addColorStop(0.85, dark ? '#262a30' : '#eee9dc');
    grad.addColorStop(1, dark ? '#302e2b' : '#e3dac6');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  let darkSky = document.documentElement.dataset.theme === 'dark';
  scene.background = skyTexture(darkSky);

  scene.add(new THREE.HemisphereLight(0xfff9ef, 0xb6c4ce, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(16, 30, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00005;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  const composer = new EffectComposer(renderer);
  const ambientOcclusion = new SSAOPass(scene, camera, 1, 1, 16);
  ambientOcclusion.kernelRadius = 1.4;
  ambientOcclusion.minDistance = 0.00015;
  ambientOcclusion.maxDistance = 0.004;
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(ambientOcclusion);
  composer.addPass(new OutputPass());
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    console.error('Globe shader compilation failed.', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
    host.dataset.worldLighting = 'unavailable';
    msg.textContent = 'Globe lighting could not compile on this graphics driver. Rendering stopped; reload after checking graphics support.';
    running = false;
  };

  // User pieces retain their polyhedral shapes; generated terrain uses aligned cubes.
  const SHAPES = [
    { id: 'd4', geo: new THREE.TetrahedronGeometry(0.72) },
    { id: 'd8', geo: new THREE.OctahedronGeometry(0.66) },
    { id: 'd12', geo: new THREE.DodecahedronGeometry(0.62) },
    { id: 'd20', geo: new THREE.IcosahedronGeometry(0.6) },
    { id: 'cube', geo: new THREE.BoxGeometry(1.005, 1.005, 1.005) },
    { id: 'pyramid', geo: new THREE.ConeGeometry(0.72, 1.0, 4).rotateY(Math.PI / 4) },
    { id: 'cylinder', geo: new THREE.CylinderGeometry(0.5, 0.5, 0.98, 14) },
    { id: 'prism', geo: new THREE.CylinderGeometry(0.62, 0.62, 0.98, 6) },
    { id: 'orb', geo: new THREE.SphereGeometry(0.52, 16, 12) },
    { id: 'ring', geo: new THREE.TorusGeometry(0.34, 0.16, 8, 18).rotateX(Math.PI / 2) }
  ];
  const facetMaterial = (hex, roughness, metalness) => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, flatShading: true });
  const globeColors = ['#4b94a7', '#d2bd8e', '#809867', '#b0aa9d', '#eeeede', '#927554', '#6f8b58'];
  const terrainMaterials = MATERIAL_COLORS.map((hex, index) => facetMaterial(globeColors[index] || hex, 0.95, 0));
  const userMaterials = PALETTE.map((hex) => facetMaterial(hex, 0.55, 0.1));
  const ghost = new THREE.Mesh(
    SHAPES[2].geo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, wireframe: true })
  );
  ghost.visible = false;
  scene.add(ghost);
  const spin = (roll, a, b) => new THREE.Quaternion().setFromEuler(new THREE.Euler(roll * 0.131 + a, roll * 0.217 + b, roll * 0.071));

  let seed = randomSeed();
  let chunkCount = DEFAULT_CHUNKS;
  let world = DEFAULT_CHUNKS * CHUNK;
  let terrainMeshes = [];
  let terrainCells = new Set();
  let waterCols = new Set();
  let decor = [];
  let borders = null;
  let showBorders = true;

  const voxels = new Map();
  const history = [];
  let tool = onInspect ? 'inspect' : 'place';
  const districtRegions = [];
  let color = 0;
  let shape = 4;

  const keyOf = (x, y, z) => `${x},${y},${z}`;
  const inBounds = (x, y, z) => x >= 0 && x < world && y >= 0 && y < world && z >= 0 && z < world;
  const toWorld = (x, y, z) => new THREE.Vector3(x - world / 2 + 0.5, y - world / 2 + 0.5, z - world / 2 + 0.5);
  const terrainInstances = new Map();
  const removedTerrain = new Set();
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  function refreshTerrainCell(x, y, z) {
    const key = keyOf(x, y, z), entry = terrainInstances.get(key);
    if (!entry) return;
    const visible = terrainCells.has(key) && surfaceCell(x, y, z, terrainCells);
    const matrix = visible ? new THREE.Matrix4().makeTranslation(...toWorld(x, y, z).toArray()) : hiddenMatrix;
    entry.mesh.setMatrixAt(entry.index, matrix);
    entry.mesh.instanceMatrix.needsUpdate = true;
  }
  function refreshTerrainNeighborhood(x, y, z) {
    refreshTerrainCell(x, y, z);
    for (const [dx, dy, dz] of NEIGHBORS) refreshTerrainCell(x + dx, y + dy, z + dz);
    renderer.shadowMap.needsUpdate = true;
  }
  function eraseTerrain(x, y, z, record = true) {
    const key = keyOf(x, y, z);
    if (!terrainCells.has(key)) return false;
    if (removedTerrain.size >= MAX_VOXELS) { msg.textContent = 'Terrain edit limit reached. Reset edits or start a new seed.'; return false; }
    terrainCells.delete(key); removedTerrain.add(key);
    refreshTerrainNeighborhood(x, y, z);
    if (record) {
      history.push({ terrain: true, x, y, z });
      if (history.length > 200) history.shift();
    }
    updateCount();
    return true;
  }

  function disposeTerrain() {
    for (const mesh of terrainMeshes) {
      scene.remove(mesh);
      mesh.dispose();
    }
    terrainMeshes = [];
    for (const object of decor) {
      scene.remove(object);
      object.geometry?.dispose();
      object.material?.dispose();
    }
    decor = [];
    borders = null;
  }

  function buildTerrain() {
    disposeTerrain();
    world = chunkCount * CHUNK;
    const globe = generateGlobe(seed, world);
    const cells = globe.cells;
    terrainInstances.clear();
    removedTerrain.clear();
    terrainCells = new Set(cells.map(([x, y, z]) => keyOf(x, y, z)));
    waterCols = new Set(cells.filter((c) => c[3] === MAT_WATER).map((c) => `${c[0]},${c[2]}`));
    const groups = new Map();
    for (const cell of cells) {
      if (!groups.has(cell[3])) groups.set(cell[3], []);
      groups.get(cell[3]).push(cell);
    }
    const matrix = new THREE.Matrix4();
    const tint = new THREE.Color();
    for (const [materialIndex, list] of groups) {
      const mesh = new THREE.InstancedMesh(SHAPES[4].geo, terrainMaterials[materialIndex], list.length);
      list.forEach(([x, y, z], i) => {
        matrix.makeTranslation(...toWorld(x, y, z).toArray());
        mesh.setMatrixAt(i, surfaceCell(x, y, z, terrainCells) ? matrix : hiddenMatrix);
        const v = 0.9 + (d120(seed, x, z, y + 50) % 12) / 100;
        mesh.setColorAt(i, tint.setRGB(v, v, v));
        terrainInstances.set(keyOf(x, y, z), { mesh, index: i });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = materialIndex !== MAT_WATER;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      terrainMeshes.push(mesh);
    }

    const reach = world * 0.75;
    const sc = sun.shadow.camera;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach;
    sc.bottom = -reach;
    sc.near = 1;
    sc.far = world * 3 + 80;
    sun.position.set(-world * 0.7, world, world * 0.65);
    sun.target.position.set(0, 0, 0);
    sc.updateProjectionMatrix();
    // Three closed great circles replace the flat grid and chunk-border plane.
    const points = [];
    const radius = world * 0.43;
    for (let axis = 0; axis < 3; axis++) for (let i = 0; i < 128; i++) {
      for (const angle of [i * Math.PI / 64, (i + 1) * Math.PI / 64]) {
        const point = [0, 0, 0];
        point[(axis + 1) % 3] = Math.cos(angle) * radius;
        point[(axis + 2) % 3] = Math.sin(angle) * radius;
        points.push(...point);
      }
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    borders = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xa89876, transparent: true, opacity: 0.20 }));
    borders.visible = showBorders;
    scene.add(borders);
    decor.push(borders);

    controls.target.set(0, 0, 0);
    controls.minDistance = world * 0.51;
    camera.position.set(world * 0.85, world * 0.47, world * 0.95);
    controls.update();
    seedInput.value = String(seed);
    infoEl.textContent = `${world}-cell diameter · ${globe.trees} radial trees · Seed ${seed} · Orbit mode`;
    motionEl.textContent = 'Drag to orbit · Scroll to zoom · Build / erase / Undo';
    host.dataset.worldGeometry = 'voxel-globe';
    host.dataset.worldDiameter = String(world);
    host.dataset.worldLighting = 'soft-shadows-ssao';
    renderer.shadowMap.needsUpdate = true;
    ghost.visible = false;
  }

  function updateCount() {
    countEl.textContent = `${voxels.size} PLACED · ${removedTerrain.size} TERRAIN EDITS`;
  }

  function setVoxel(x, y, z, colorIndex, record = true, shapeIndex = shape, turn = 0, aligned = shapeIndex >= 4) {
    if (!inBounds(x, y, z)) return false;
    if (terrainCells.has(keyOf(x, y, z))) return colorIndex === null ? eraseTerrain(x, y, z, record) : false;
    const key = keyOf(x, y, z);
    const existing = voxels.get(key);
    if (colorIndex === null) {
      if (!existing) return false;
      scene.remove(existing.mesh);
      voxels.delete(key);
      if (record) history.push({ x, y, z, before: existing.color, beforeShape: existing.shape, beforeTurn: existing.turn, beforeAligned: existing.aligned, after: null });
    } else {
      if (!existing && voxels.size >= MAX_VOXELS) return false;
      if (existing && existing.color === colorIndex && existing.shape === shapeIndex && existing.turn === turn && existing.aligned === aligned) return false;
      if (existing) scene.remove(existing.mesh);
      const roll = d120(seed, x, z, y + 90);
      const mesh = new THREE.Mesh(SHAPES[shapeIndex].geo, userMaterials[colorIndex]);
      mesh.position.copy(toWorld(x, y, z));
      mesh.quaternion.copy(aligned ? new THREE.Quaternion() : spin(roll, x * 0.37, z * 0.29));
      if (turn) mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn * Math.PI / 2));
      mesh.userData.cell = [x, y, z];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      voxels.set(key, { mesh, color: colorIndex, shape: shapeIndex, turn, aligned });
      if (record) history.push({ x, y, z, before: existing ? existing.color : null, beforeShape: existing ? existing.shape : shapeIndex, beforeTurn: existing ? existing.turn : 0, beforeAligned: existing?.aligned, after: colorIndex });
    }
    if (history.length > 200) history.shift();
    renderer.shadowMap.needsUpdate = true;
    updateCount();
    return true;
  }

  function clearAll() {
    for (const { mesh } of voxels.values()) scene.remove(mesh);
    voxels.clear();
    for (const key of removedTerrain) terrainCells.add(key);
    for (const key of removedTerrain) refreshTerrainNeighborhood(...key.split(',').map(Number));
    removedTerrain.clear();
    districtRegions.length = 0;
    history.length = 0;
    renderer.shadowMap.needsUpdate = true;
    updateCount();
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pickAt(nx, ny, maxDistance = Infinity) {
    pointer.set(nx, ny);
    raycaster.setFromCamera(pointer, camera);
    return traceVoxelGrid(raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(),
      world, key => terrainCells.has(key) || voxels.has(key), maxDistance);
  }

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    return pickAt(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  }

  let glide = null;
  function zoom(direction) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * (direction > 0 ? 0.75 : 1.33)));
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
  }
  host.querySelector('[data-act="zoom-in"]').addEventListener('click', () => zoom(1));
  host.querySelector('[data-act="zoom-out"]').addEventListener('click', () => zoom(-1));
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select') || host.offsetParent === null) return;
    if (e.key === '+' || e.key === '=') zoom(1);
    else if (e.key === '-' || e.key === '_') zoom(-1);
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const expandButton = host.querySelector('[data-act="expand"]');
  function toggleExpand() {
    const on = host.classList.toggle('vx-expanded');
    expandButton.setAttribute('aria-pressed', String(on));
    expandButton.textContent = on ? '⛶ Shrink' : '⛶';
    requestAnimationFrame(resize);
  }
  expandButton.addEventListener('click', toggleExpand);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host.classList.contains('vx-expanded')) toggleExpand();
  });

  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 4) return;
    const target = pick(e);
    if (!target) return;
    if (tool === 'inspect') {
      const cell = target.erase;
      const region = cell && [...districtRegions].reverse().find(item => cell[0] >= item.x && cell[0] < item.x + item.w
        && cell[2] >= item.z && cell[2] < item.z + item.d && cell[1] >= item.floor && cell[1] <= item.top);
      if (region) onInspect(region.building);
      else msg.textContent = 'Select a station or generated district building to inspect it.';
      return;
    }
    if (tool === 'erase' || e.shiftKey) {
      if (target.erase) setVoxel(...target.erase, null);
    } else if (tool === 'reshape' || tool === 'turn') {
      const cell = target.erase;
      const piece = cell && voxels.get(keyOf(...cell));
      if (!piece) { msg.textContent = 'Click one of your own pieces'; return; }
      if (tool === 'reshape') setVoxel(...cell, color, true, shape, piece.turn, piece.aligned);
      else setVoxel(...cell, piece.color, true, piece.shape, (piece.turn + 1) % 4, piece.aligned);
    } else {
      if (target.place) setVoxel(...target.place, color);
    }
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const target = pick(e);
    const picking = tool === 'erase' || tool === 'reshape' || tool === 'turn';
    const cell = target && (picking ? target.erase : target.place);
    if (cell && inBounds(...cell) && (tool === 'place' || voxels.has(keyOf(...cell)) || tool === 'erase')) {
      ghost.position.copy(toWorld(...cell));
      ghost.material.color.set(tool === 'erase' ? 0xff3b3b : tool === 'turn' ? 0xffd166 : PALETTE[color]);
      ghost.visible = true;
    } else {
      ghost.visible = false;
    }
  });
  renderer.domElement.addEventListener('pointerleave', () => { ghost.visible = false; });

  const paletteEl = host.querySelector('.vx-palette');
  PALETTE.forEach((hex, index) => {
    const swatch = document.createElement('button');
    swatch.className = 'vx-swatch';
    swatch.style.background = hex;
    swatch.setAttribute('aria-label', `Color ${index + 1}`);
    if (index === color) swatch.classList.add('active');
    swatch.addEventListener('click', () => {
      color = index;
      paletteEl.querySelectorAll('.vx-swatch').forEach((s) => s.classList.toggle('active', s === swatch));
      if (tool !== 'reshape') setTool('place');
    });
    paletteEl.append(swatch);
  });

  const shapeSelect = host.querySelector('.vx-shape-select');
  function selectShape(index, chooseTool = true) {
    shape = (index + SHAPES.length) % SHAPES.length;
    ghost.geometry = SHAPES[shape].geo;
    shapeSelect.value = String(shape);
    if (chooseTool && tool !== 'reshape') setTool('place');
  }
  SHAPES.forEach((s, index) => {
    const option = document.createElement('option');
    option.textContent = s.id; option.value = String(index);
    shapeSelect.append(option);
  });
  shapeSelect.addEventListener('change', () => selectShape(Number(shapeSelect.value)));
  selectShape(shape, false);

  function setTool(next) {
    tool = next;
    host.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === next));
  }
  host.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  host.querySelector('[data-act="undo"]').addEventListener('click', () => {
    const last = history.pop();
    if (last?.terrain) {
      const key = keyOf(last.x, last.y, last.z);
      removedTerrain.delete(key); terrainCells.add(key);
      refreshTerrainNeighborhood(last.x, last.y, last.z);
      updateCount();
    } else if (last) setVoxel(last.x, last.y, last.z, last.before, false, last.beforeShape, last.beforeTurn || 0, last.beforeAligned);
  });
  host.querySelector('[data-act="clear"]').addEventListener('click', clearAll);

  // Rebuilding terrain keeps your voxels only where the new ground leaves the cell free.
  function rebuild() {
    districtRegions.length = 0;
    buildTerrain();
    updateCount();
    for (const [key, v] of [...voxels.entries()]) {
      const [x, y, z] = key.split(',').map(Number);
      if (!inBounds(x, y, z) || terrainCells.has(key)) {
        scene.remove(v.mesh);
        voxels.delete(key);
      } else {
        v.mesh.position.copy(toWorld(x, y, z));
      }
    }
    history.length = 0;
    updateCount();
  }

  host.querySelector('[data-act="roll"]').addEventListener('click', () => {
    seed = randomSeed();
    rebuild();
    msg.textContent = `Seed ${seed} rolled.`;
  });
  seedInput.addEventListener('change', () => {
    const next = Number.parseInt(seedInput.value, 10);
    if (!Number.isInteger(next) || next < 0 || next > 999999) {
      seedInput.value = String(seed);
      return;
    }
    seed = next;
    rebuild();
  });
  host.querySelector('[data-act="grow"]').addEventListener('click', () => {
    chunkCount = chunkCount >= MAX_CHUNKS ? MIN_CHUNKS : chunkCount + 1;
    rebuild();
    msg.textContent = `Planet diameter: ${world} cells.`;
  });
  const bordersButton = host.querySelector('[data-act="borders"]');
  bordersButton.addEventListener('click', () => {
    showBorders = !showBorders;
    if (borders) borders.visible = showBorders;
    bordersButton.setAttribute('aria-pressed', String(showBorders));
  });

  function toAsset(name) {
    return {
      format: 'capsule-voxel-asset',
      version: 7,
      name,
      world: { generator: 'voxel-globe/1', seed, chunks: chunkCount, chunkSize: CHUNK },
      palette: PALETTE,
      shapes: SHAPES.map((s) => s.id),
      voxels: [...voxels.entries()].map(([key, v]) => [...key.split(',').map(Number), v.color, v.shape, v.turn, v.aligned]),
      removedTerrain: [...removedTerrain].map(key => key.split(',').map(Number)),
      createdAt: new Date().toISOString()
    };
  }

  function loadAsset(asset) {
    if (asset.version !== 7 || asset.world?.generator !== 'voxel-globe/1') {
      msg.textContent = 'This is a legacy flat-world asset. Its saved data is preserved; it cannot be automatically mapped onto a globe.';
      return;
    }
    clearAll();
    nameInput.value = cleanName(asset.name);
    const w = asset.world;
    if (asset.version >= 3 && w && Number.isInteger(w.seed) && w.seed >= 0 && w.seed <= 999999 && Number.isInteger(w.chunks)) {
      seed = w.seed;
      chunkCount = Math.min(MAX_CHUNKS, Math.max(MIN_CHUNKS, w.chunks));
    }
    buildTerrain();
    for (const cell of (Array.isArray(asset.removedTerrain) ? asset.removedTerrain : []).slice(0, MAX_VOXELS)) {
      if (Array.isArray(cell) && cell.length === 3 && cell.every(Number.isInteger) && inBounds(...cell)) eraseTerrain(...cell, false);
    }
    for (const entry of asset.voxels.slice(0, MAX_VOXELS)) {
      if (!Array.isArray(entry) || entry.length < 4 || entry.length > 7) continue;
      const [x, y, z, c, s = 2, t = 0, aligned = s >= 4] = entry;
      if ([x, y, z, c, s, t].every(Number.isInteger) && typeof aligned === 'boolean' && c >= 0 && c < PALETTE.length && s >= 0 && s < SHAPES.length && t >= 0 && t < 4) setVoxel(x, y, z, c, false, s, t, aligned);
    }
  }

  function renderLibrary() {
    libraryEl.replaceChildren();
    const assets = readLibrary();
    if (!assets.length) {
      const empty = document.createElement('span');
      empty.textContent = 'Nothing deployed yet';
      libraryEl.append(empty);
      return;
    }
    assets.slice(-8).reverse().forEach((asset) => {
      const b = document.createElement('button');
      b.textContent = `${asset.name} · ${asset.voxels.length}`;
      b.addEventListener('click', () => loadAsset(asset));
      libraryEl.append(b);
    });
  }

  host.querySelector('[data-act="deploy"]').addEventListener('click', () => {
    if (!voxels.size && !removedTerrain.size) {
      msg.textContent = 'Place or erase at least one voxel before deploying.';
      return;
    }
    const name = cleanName(nameInput.value);
    nameInput.value = name;
    const asset = toAsset(name);
    const library = readLibrary().filter((a) => a.name !== name);
    library.push(asset);
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library.slice(-MAX_ASSETS)));
    } catch {
      msg.textContent = 'Could not save to the library (storage unavailable).';
      return;
    }
    const blob = new Blob([JSON.stringify(asset, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${name.replace(/\s+/g, '-')}.capsule-asset.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    msg.textContent = `Deployed "${name}" · ${asset.voxels.length} pieces. Saved as data only.`;
    renderLibrary();
  });

  function resize() {
    const w = Math.max(canvasHost.clientWidth, 1);
    const h = Math.max(canvasHost.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }
  new ResizeObserver(resize).observe(canvasHost);

  let running = true;
  let last = performance.now();
  function frame(now = performance.now()) {
    if (!running) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    if (dark !== darkSky) {
      darkSky = dark;
      scene.background.dispose();
      scene.background = skyTexture(dark);
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (glide) {
      const k = 1 - Math.exp(-dt * 3.5);
      camera.position.lerp(glide.pos, k);
      controls.target.lerp(glide.target, k);
      if (camera.position.distanceTo(glide.pos) < 0.3) glide = null;
    }
    controls.update();
    composer.render(dt);
    requestAnimationFrame(frame);
  }
  buildTerrain();
  renderLibrary();
  updateCount();
  resize();
  requestAnimationFrame(frame);

  return {
    placeDistrict(district) {
      const colTop = (gx, gz) => {
        for (let y = world - 1; y >= 0; y -= 1) if (terrainCells.has(keyOf(gx, y, gz))) return y + 1;
        return 0;
      };
      // Pick the flattest dry patch big enough for the village, nearest the middle.
      const maxX = world - district.width - 1;
      const maxZ = world - district.depth - 1;
      let best = null;
      for (let sx = 1; sx <= maxX; sx += 1) {
        for (let sz = 1; sz <= maxZ; sz += 1) {
          let wet = 0;
          let lo = world;
          let hi = 0;
          let sum = 0;
          let n = 0;
          for (let x = 0; x < district.width; x += 2) {
            for (let z = 0; z < district.depth; z += 2) {
              if (waterCols.has(`${sx + x},${sz + z}`)) wet += 1;
              const h = colTop(sx + x, sz + z);
              if (!h) wet += 100;
              lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n += 1;
            }
          }
          const centre = Math.abs(sx + district.width / 2 - world / 2) + Math.abs(sz + district.depth / 2 - world / 2);
          const score = wet * 40 + (hi - lo) * 6 + centre * 0.2;
          if (!best || score < best.score) best = { sx, sz, score };
        }
      }
      const ox = best ? best.sx : Math.max(1, Math.floor((world - district.width) / 2));
      const oz = best ? best.sz : Math.max(1, Math.floor((world - district.depth) / 2));
      let placed = 0;
      let base = 0;
      const put = (x, y, z, color, shapeIndex) => {
        if (setVoxel(x, y, z, color, false, shapeIndex, 0, true)) placed += 1;
      };
      // Each building gets its own footing, sunk into whatever land is under it.
      for (const b of district.buildings) {
        let floor = 0;
        for (let x = 0; x < b.w; x += 1) for (let z = 0; z < b.d; z += 1) floor = Math.max(floor, colTop(ox + b.x + x, oz + b.z + z));
        for (let x = -1; x <= b.w; x += 1) {
          for (let z = -1; z <= b.d; z += 1) {
            const gx = ox + b.x + x;
            const gz = oz + b.z + z;
            const rim = x < 0 || z < 0 || x >= b.w || z >= b.d;
            const top = colTop(gx, gz);
            const to = rim ? Math.min(floor, top + 1) : floor;
            for (let y = top; y < to; y += 1) put(gx, y, gz, rim ? 1 : (gx + y + gz) % 3 === 0 ? 6 : 7, 4);
          }
        }
        b.cells.forEach(([dx, dy, dz, color, shapeIndex]) => put(ox + b.x + dx, floor + dy, oz + b.z + dz, color, shapeIndex));
        districtRegions.push({ building: b, x: ox + b.x, z: oz + b.z, w: b.w, d: b.d,
          floor, top: floor + Math.max(0, ...b.cells.map(cell => cell[1])) });
        if (b.door !== null) {
          const gx = ox + b.door;
          const gz = oz + b.z + b.d;
          for (let y = colTop(gx, gz); y < floor; y += 1) put(gx, y, gz, 7, 4);
        }
        base = Math.max(base, floor);
      }
      // Paths and lamps follow the ground instead of floating above it.
      for (const [dx, dz, color] of district.paths) {
        const gx = ox + dx;
        const gz = oz + dz;
        put(gx, colTop(gx, gz), gz, color, 4);
      }
      for (const [dx, dy, dz, color, shapeIndex] of district.lamps) {
        const gx = ox + dx;
        const gz = oz + dz;
        put(gx, colTop(gx, gz) + dy, gz, color, shapeIndex);
      }
      const target = toWorld(ox + district.width / 2, base + 3, oz + district.depth / 2);
      glide = {
        pos: target.clone().normalize().multiplyScalar(world * 1.2).add(new THREE.Vector3(world * 0.35, 0, world * 0.4)),
        target: new THREE.Vector3(0, 0, 0)
      };
      msg.textContent = `District “${district.name}” built: ${district.buildings.map((b) => b.label).join(' · ')}.`;
      return placed;
    },
    roll() {
      seed = randomSeed();
      rebuild();
      msg.textContent = `Seed ${seed} rolled.`;
    },
    pause() {
      running = false;
    },
    resume() {
      if (running) return;
      running = true;
      resize();
      requestAnimationFrame(frame);
    }
  };
}
