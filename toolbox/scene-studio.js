import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAX_FILE_BYTES, MAX_OBJECTS, SHAPES, emptyScene, parseSceneFile, validateScene } from './scene-format.js';
import { aiInstructions, applyEdit, parseEditFile } from './scene-ops.js';
import { createViewLoader } from './view-loader.js';

const box = (name, color, position, scale) => ({ type: 'box', name, color, position, rotation: [0, 0, 0], scale });
const ball = (name, color, position, size) => ({ type: 'sphere', name, color, position, rotation: [0, 0, 0], scale: [size, size, size] });
const TEMPLATES = {
  tower: ['Tower', [0, 1, 2, 3].map((i) => box(`Block ${i + 1}`, ['#e72a43', '#f5b83d', '#46c28e', '#5b8def'][i], [0, 0.5 + i, 0], [2 - i * 0.3, 1, 2 - i * 0.3]))],
  snowman: ['Snowman', [
    ball('Base', '#f4f7fb', [0, 0.9, 0], 1.5), ball('Middle', '#f4f7fb', [0, 2.1, 0], 1.1), ball('Head', '#f4f7fb', [0, 3, 0], 0.8),
    { type: 'cone', name: 'Nose', color: '#f5883d', position: [0, 3, 0.6], rotation: [90, 0, 0], scale: [0.2, 0.4, 0.2] }
  ]],
  steps: ['Steps', [0, 1, 2, 3].map((i) => box(`Step ${i + 1}`, '#8f98a8', [i * 1.2 - 1.8, 0.25 + i * 0.5, 0], [1.2, 0.5 + i * 0.5, 2]))]
};

const GEOMETRIES = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.6, 32, 20),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: () => new THREE.ConeGeometry(0.6, 1.2, 32),
  torus: () => new THREE.TorusGeometry(0.6, 0.2, 16, 48)
};

export function mountSceneStudio(root) {
  const $ = (selector) => root.querySelector(selector);
  const canvas = $('#scene-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const three = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(5, 4, 7);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  three.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(4, 8, 5);
  three.add(sun);
  three.add(new THREE.GridHelper(20, 20, 0x3b4a66, 0x1f2a40));

  let scene = emptyScene();
  let selectedId = null;
  const meshes = new Map();
  const history = [];
  let counter = 0, activeMode = 'shapes';
  const loadHtmlView = createViewLoader();
  root.querySelectorAll('[data-scene-tab]').forEach(button => button.addEventListener('click', () => {
    activeMode = button.dataset.sceneTab;
    root.querySelectorAll('[data-scene-tab]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.sceneTab === activeMode)));
    root.querySelectorAll('[data-scene-mode]').forEach(panel => { panel.hidden = panel.dataset.sceneMode !== activeMode; });
    const html = $('#scene-html-studio');
    html.dispatchEvent(new CustomEvent('capsule-scene-mode', { detail: activeMode === 'html' }));
    syncVisibility();
    if (activeMode === 'html') void loadHtmlView(html, () => import('./scene-html-studio.js'), (module, host) => module.mountHtmlStudio(host));
  }));

  function snapshot() {
    if (pendingScene) {
      clearPending();
      setStatus('Scene changed. Review the AI edit again before accepting it.');
    }
    history.push(JSON.stringify(scene));
    if (history.length > 50) history.shift();
  }

  function setStatus(message, isError = false) {
    const status = $('#scene-status');
    status.textContent = message;
    status.dataset.error = isError ? 'true' : 'false';
  }

  function nextId() {
    counter += 1;
    return `obj-${Date.now().toString(36)}-${counter}`;
  }

  function syncMeshes() {
    const live = new Set(scene.objects.map((object) => object.id));
    for (const [id, mesh] of meshes) {
      if (!live.has(id)) {
        three.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        meshes.delete(id);
      }
    }
    for (const object of scene.objects) {
      let mesh = meshes.get(object.id);
      if (!mesh || mesh.userData.type !== object.type) {
        if (mesh) {
          three.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
        mesh = new THREE.Mesh(GEOMETRIES[object.type](), new THREE.MeshStandardMaterial());
        mesh.userData = { id: object.id, type: object.type };
        three.add(mesh);
        meshes.set(object.id, mesh);
      }
      mesh.material.color.set(object.color);
      mesh.material.emissive.set(object.id === selectedId ? 0x1a3a66 : 0x000000);
      mesh.position.set(...object.position);
      mesh.rotation.set(...object.rotation.map((degrees) => THREE.MathUtils.degToRad(degrees)));
      mesh.scale.set(...object.scale);
    }
    three.background = new THREE.Color(scene.background);
  }

  function selected() {
    return scene.objects.find((object) => object.id === selectedId) ?? null;
  }

  function renderList() {
    const list = $('#scene-list');
    list.replaceChildren();
    for (const object of scene.objects) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'scene-item';
      item.setAttribute('aria-pressed', String(object.id === selectedId));
      item.textContent = object.name;
      item.addEventListener('click', () => select(object.id));
      list.append(item);
    }
    $('#scene-count').textContent = `${scene.objects.length} / ${MAX_OBJECTS}`;
  }

  function renderInspector() {
    const object = selected();
    $('#scene-inspector').hidden = !object;
    $('#scene-inspector-empty').hidden = Boolean(object);
    if (!object) return;
    $('#scene-obj-name').value = object.name;
    $('#scene-obj-color').value = object.color;
    root.querySelectorAll('[data-vec]').forEach((input) => {
      input.value = String(object[input.dataset.vec][Number(input.dataset.axis)]);
    });
  }

  function refresh() {
    syncMeshes();
    renderList();
    renderInspector();
    $('#scene-name').value = scene.name;
    $('#scene-bg').value = scene.background;
  }

  function select(id) {
    selectedId = id;
    refresh();
  }

  function addShape(type) {
    if (scene.objects.length >= MAX_OBJECTS) return setStatus(`Limit of ${MAX_OBJECTS} objects reached.`, true);
    snapshot();
    const object = {
      id: nextId(),
      type,
      name: `${type[0].toUpperCase()}${type.slice(1)} ${scene.objects.length + 1}`,
      color: '#5b8def',
      position: [0, type === 'box' ? 0.5 : 0.6, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    };
    scene.objects.push(object);
    select(object.id);
    setStatus('Shape added.');
  }

  function update(mutator) {
    const object = selected();
    if (!object) return;
    snapshot();
    mutator(object);
    refresh();
  }

  function clampVector(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
  }

  root.querySelectorAll('[data-shape]').forEach((button) => {
    if (SHAPES.includes(button.dataset.shape)) button.addEventListener('click', () => addShape(button.dataset.shape));
  });
  $('#scene-obj-name').addEventListener('change', (event) => {
    const value = event.target.value.trim().slice(0, 60);
    if (value) update((object) => { object.name = value; });
  });
  $('#scene-obj-color').addEventListener('input', (event) => {
    update((object) => { object.color = event.target.value.toLowerCase(); });
  });
  root.querySelectorAll('[data-vec]').forEach((input) => {
    input.addEventListener('change', () => {
      const vec = input.dataset.vec;
      const bounds = vec === 'position' ? [-1000, 1000] : vec === 'rotation' ? [-360, 360] : [0.01, 100];
      update((object) => {
        const value = clampVector(input.value, ...bounds);
        object[vec][Number(input.dataset.axis)] = vec === 'scale' ? Math.max(0.01, value) : value;
      });
    });
  });
  $('#scene-duplicate').addEventListener('click', () => {
    const object = selected();
    if (!object) return;
    if (scene.objects.length >= MAX_OBJECTS) return setStatus(`Limit of ${MAX_OBJECTS} objects reached.`, true);
    snapshot();
    const copy = {
      ...object,
      id: nextId(),
      name: `${object.name} copy`.slice(0, 60),
      position: [Math.min(1000, object.position[0] + 1), object.position[1], object.position[2]],
      rotation: [...object.rotation],
      scale: [...object.scale]
    };
    scene.objects.push(copy);
    select(copy.id);
  });
  $('#scene-delete').addEventListener('click', () => {
    if (!selected()) return;
    snapshot();
    scene.objects = scene.objects.filter((object) => object.id !== selectedId);
    selectedId = null;
    refresh();
  });
  $('#scene-undo').addEventListener('click', () => {
    const previous = history.pop();
    if (!previous) return setStatus('Nothing to undo.');
    clearPending();
    scene = JSON.parse(previous);
    if (!selected()) selectedId = null;
    refresh();
  });
  $('#scene-name').addEventListener('change', (event) => {
    const value = event.target.value.trim().slice(0, 60);
    if (value) {
      snapshot();
      scene.name = value;
    }
    refresh();
  });
  $('#scene-bg').addEventListener('input', (event) => {
    snapshot();
    scene.background = event.target.value.toLowerCase();
    syncMeshes();
  });
  $('#scene-new').addEventListener('click', () => {
    snapshot();
    scene = emptyScene();
    selectedId = null;
    refresh();
    setStatus('New scene.');
  });
  $('#scene-save').addEventListener('click', () => {
    const checked = validateScene(scene);
    if (!checked.ok) return setStatus(checked.message, true);
    const blob = new Blob([JSON.stringify(checked.scene, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const safeName = scene.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'scene';
    link.href = URL.createObjectURL(blob);
    link.download = `${safeName}.capsule-scene.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus('Scene saved as plain data. It contains no code.');
  });
  $('#scene-open').addEventListener('click', () => $('#scene-load').click());
  $('#scene-load').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setStatus('Scene files must be no larger than 256 KiB.', true);
    try {
      const result = parseSceneFile(await file.text());
      if (!result.ok) return setStatus(result.message, true);
      snapshot();
      scene = result.scene;
      selectedId = null;
      refresh();
      setStatus(`Loaded "${scene.name}" (${scene.objects.length} objects). Imported files are data only.`);
    } catch (error) {
      setStatus(`Unable to read scene: ${error.message || String(error)}`, true);
    }
  });

  root.querySelectorAll('[data-template]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = TEMPLATES[button.dataset.template];
      if (!template) return;
      snapshot();
      scene = { ...emptyScene(template[0]), objects: template[1].map((object) => ({ id: nextId(), ...object })) };
      selectedId = null;
      refresh();
      setStatus(`Started from "${template[0]}".`);
    });
  });

  let pendingScene = null;
  function clearPending() {
    pendingScene = null;
    $('#scene-ai-summary').replaceChildren();
    $('#scene-ai-accept').hidden = true;
    $('#scene-ai-reject').hidden = true;
  }
  $('#scene-ai-copy').addEventListener('click', async () => {
    const manual = $('#scene-ai-manual');
    manual.value = aiInstructions(scene);
    try {
      await navigator.clipboard.writeText(manual.value);
      manual.hidden = true;
      setStatus('AI instructions copied. Paste them into any AI.');
    } catch {
      manual.hidden = false;
      manual.focus();
      manual.select();
      setStatus('Clipboard access was blocked. The instructions are selected below for manual copying.', true);
    }
  });
  $('#scene-ai-preview').addEventListener('click', () => {
    clearPending();
    const parsed = parseEditFile($('#scene-ai-input').value);
    const result = parsed.ok ? applyEdit(scene, parsed.edit, nextId) : parsed;
    if (!result.ok) return setStatus(result.message, true);
    pendingScene = result.scene;
    for (const line of result.summary) {
      const item = document.createElement('li');
      item.textContent = line;
      $('#scene-ai-summary').append(item);
    }
    $('#scene-ai-accept').hidden = false;
    $('#scene-ai-reject').hidden = false;
    setStatus('Review the changes, then accept or reject.');
  });
  $('#scene-ai-accept').addEventListener('click', () => {
    if (!pendingScene) return;
    const accepted = pendingScene;
    snapshot();
    scene = accepted;
    if (!selected()) selectedId = null;
    clearPending();
    $('#scene-ai-input').value = '';
    refresh();
    setStatus('AI edit applied. Undo is available.');
  });
  $('#scene-ai-reject').addEventListener('click', () => {
    clearPending();
    setStatus('AI edit rejected. Nothing changed.');
  });

  root.addEventListener('keydown', (event) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    const object = selected();
    const step = event.shiftKey ? 1 : 0.25;
    const move = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [2, -step], ArrowDown: [2, step], PageUp: [1, step], PageDown: [1, -step] }[event.key];
    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      $('#scene-undo').click();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'd' && object) {
      event.preventDefault();
      $('#scene-duplicate').click();
    } else if (event.key === 'Delete' && object) {
      $('#scene-delete').click();
    } else if (move && object) {
      event.preventDefault();
      update((target) => { target.position[move[0]] = Math.max(-1000, Math.min(1000, target.position[move[0]] + move[1])); });
    }
  });
  canvas.tabIndex = 0;

  const raycaster = new THREE.Raycaster();
  canvas.addEventListener('pointerdown', (event) => {
    canvas.dataset.down = `${event.clientX},${event.clientY}`;
  });
  canvas.addEventListener('pointerup', (event) => {
    const [x, y] = (canvas.dataset.down ?? '').split(',').map(Number);
    if (Math.hypot(event.clientX - x, event.clientY - y) > 4) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1),
      camera
    );
    const hit = raycaster.intersectObjects([...meshes.values()])[0];
    select(hit ? hit.object.userData.id : null);
  });

  function resize() {
    const { clientWidth, clientHeight } = canvas.parentElement;
    if (!clientWidth || !clientHeight) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);

  let animationFrame = 0;
  const visible = () => root.classList.contains('active') && activeMode === 'shapes' && !document.hidden;
  function frame() {
    animationFrame = 0;
    if (!visible()) return;
    controls.update();
    renderer.render(three, camera);
    animationFrame = requestAnimationFrame(frame);
  }
  function syncVisibility() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = visible() ? requestAnimationFrame(frame) : 0;
  }
  window.addEventListener('capsule-view', syncVisibility);
  document.addEventListener('visibilitychange', syncVisibility);
  resize();
  refresh();
  syncVisibility();
  return () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    observer.disconnect();
    window.removeEventListener('capsule-view', syncVisibility);
    document.removeEventListener('visibilitychange', syncVisibility);
    controls.dispose();
    three.traverse(object => {
      object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
    });
    renderer.dispose();
  };
}
