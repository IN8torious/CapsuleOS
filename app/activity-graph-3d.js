import * as THREE from 'three';
import { buildBrain, buildCortexSurface } from './brain-geometry.js';
import { growNeuron, loadNeurons, saveNeurons, dueGrowths, MAX_NEURONS } from './neurogenesis.js';
import { stepContained, clampInside, WALL } from './containment.js';
import { buoyancy, kuramotoStep, coherence, wellFor, forgeBreath } from './alchemedies.js';
import { createFluid } from './fluid.js';
import { consolidate } from './consolidation.js';
import { agentActivityState, isAudioReady, isMuted, playAgentMotif, setMuted, stopAgentMotif, unlockAudio } from './musicode.js';
import { createGraphDiscussion } from './graph-discussion.js';
import { formatAgentMath } from './agent-math.js';

const KIND_HELP = {
  agent: 'A worker that proposes actions. Nothing runs without your approval.',
  workflow: 'A saved series of steps an agent can follow.',
  kernel: 'A kernel the core grew from what you use most. Dismiss-safe: it only organizes, it never runs anything.',
};
const COLORS = [
  0xffb85c, 0xf4743b, 0xec4938, 0xe7a342, 0x8ac3df,
  0xe8c78b, 0xdf5948, 0xb9c7d8, 0xf18a46, 0x9c5e74,
];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function createRadialGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,160,79,.9)');
  gradient.addColorStop(0.52, 'rgba(255,93,35,.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function addOrbit(radius, color, opacity, inclination, rotation) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.0025, 3, 144),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  ring.scale.set(radius, radius * 0.61, 1);
  ring.rotation.set(Math.PI / 2 + inclination, 0, rotation);
  return ring;
}

function disposeObject(object, preservedTexture) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map && material.map !== preservedTexture) material.map.dispose();
        material.dispose();
      });
    }
  });
}

function createEngine(element, { immersive = false, decisionTools = false, calm = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    element.classList.add('graph-unavailable');
    const message = document.createElement('p');
    message.className = 'graph-fallback';
    message.textContent = '3D engine preview unavailable: WebGL is not available.';
    element.replaceChildren(message);
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, immersive ? 2 : 1.5));
  renderer.setClearColor(0x030304, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(0, 3, 7.2);
  camera.lookAt(0, 0.05, 0);
  scene.add(new THREE.AmbientLight(0xffc98d, 0.45));

  const sunLight = new THREE.PointLight(0xff6a23, 3.8, 9);
  sunLight.position.set(0, 0.4, 0);
  scene.add(sunLight);
  const rimLight = new THREE.PointLight(0x78a9dc, 0.7, 10);
  rimLight.position.set(3.2, 2.4, -3.2);
  scene.add(rimLight);

  const cosmos = new THREE.Group();
  scene.add(cosmos);
  let learningStars = null;
  const learningLabel = document.createElement('span');
  learningLabel.className = 'graph-learning-label';
  learningLabel.hidden = true;
  function setLearningProfile(profile) {
    if (learningStars) {
      cosmos.remove(learningStars);
      learningStars.geometry.dispose();
      learningStars.material.dispose();
      learningStars = null;
    }
    learningLabel.hidden = !profile.count;
    learningLabel.textContent = `LEARNING · ${profile.label}`;
    learningLabel.title = 'Approved reference lessons; visual memory stars, not autonomous agents or trained model weights.';
    if (!profile.count) {
      element.style.removeProperty('--learning-accent');
      return;
    }
    element.style.setProperty('--learning-accent', profile.accent);
    const positions = profile.stars.flatMap(star => star.position);
    const colors = profile.stars.flatMap(star => new THREE.Color(star.color).toArray());
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    learningStars = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: .06, vertexColors: true, transparent: true, opacity: .8, depthWrite: false
    }));
    cosmos.add(learningStars);
  }
  const glowTexture = createRadialGlow();

  const sun = new THREE.Group();
  cosmos.add(sun);
  // Lava core: dark rock with glowing crack veins from a 3D Voronoi edge field (F2 - F1), plus a Fresnel rim.
  const lavaMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vPos = position;
        vNormalView = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPos;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      float hash1(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vnoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = mix(mix(hash1(i), hash1(i + vec3(1,0,0)), f.x), mix(hash1(i + vec3(0,1,0)), hash1(i + vec3(1,1,0)), f.x), f.y);
        float b = mix(mix(hash1(i + vec3(0,0,1)), hash1(i + vec3(1,0,1)), f.x), mix(hash1(i + vec3(0,1,1)), hash1(i + vec3(1,1,1)), f.x), f.y);
        return mix(a, b, f.z);
      }
      float fbm(vec3 p) {
        float s = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 n = normalize(vPos);
        float t = uTime * 0.12;
        vec3 warp = vec3(fbm(n * 2.0 + t), fbm(n * 2.0 - t + 5.0), fbm(n * 2.0 + 9.0));
        float cells = fbm(n * 5.0 + warp * 1.6 + vec3(0.0, t * 2.0, 0.0));
        float fine = fbm(n * 14.0 - warp + t * 3.0);
        float heat = clamp(0.35 + cells * 0.9 + fine * 0.25, 0.0, 1.4);
        float spots = smoothstep(0.62, 0.78, fbm(n * 2.4 + 3.0 + t * 0.3));
        heat *= 1.0 - 0.45 * spots;
        vec3 deep = vec3(1.0, 0.36, 0.04);
        vec3 mid = vec3(1.0, 0.68, 0.14);
        vec3 hot = vec3(1.0, 0.96, 0.7);
        vec3 color = mix(deep, mid, smoothstep(0.25, 0.75, heat));
        color = mix(color, hot, smoothstep(0.7, 1.15, heat));
        float facing = max(dot(normalize(vNormalView), normalize(vViewDir)), 0.0);
        color *= 0.62 + 0.55 * pow(facing, 0.6);
        float limb = pow(1.0 - facing, 3.0);
        color += vec3(1.0, 0.45, 0.08) * limb * 0.9;
        gl_FragColor = vec4(color * 1.25, 1.0);
      }`,
  });
  const sunHotspot = new THREE.Mesh(new THREE.SphereGeometry(0.43, 64, 48), calm
    ? new THREE.MeshStandardMaterial({ color: 0xc5ac78, roughness: 0.65, metalness: 0.2 })
    : lavaMaterial);
  sun.add(sunHotspot);

  // Crystal spikes: Fibonacci-sphere sites, kept where a smooth field is high so they cluster like the reference.
  const spikeSites = [];
  const SPIKE_CANDIDATES = 260;
  for (let i = 0; i < SPIKE_CANDIDATES; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / SPIKE_CANDIDATES;
    const ring = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    const n = new THREE.Vector3(Math.cos(phi) * ring, y, Math.sin(phi) * ring);
    const cluster = Math.sin(4.1 * n.x + 1.2) * Math.cos(3.3 * n.y - 0.4) + 0.6 * Math.sin(5.7 * n.z + 2.0);
    if (cluster > 0.35) spikeSites.push({ n, length: 0.07 + 0.13 * Math.abs(Math.sin(i * 12.9898)), width: 0.018 + 0.016 * Math.abs(Math.sin(i * 78.233)) });
  }
  const spikeMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0xff3a58, emissive: 0x7a0c1c, emissiveIntensity: 1.1, roughness: 0.3, flatShading: true }),
    spikeSites.length,
  );
  const spikeMatrix = new THREE.Matrix4();
  spikeSites.forEach((site, index) => {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), site.n);
    const position = site.n.clone().multiplyScalar(0.43 + site.length * 0.35);
    spikeMatrix.compose(position, quaternion, new THREE.Vector3(site.width, site.length, site.width));
    spikeMesh.setMatrixAt(index, spikeMatrix);
  });
  const coreSpikes = new THREE.Group();
  coreSpikes.visible = false;
  coreSpikes.add(spikeMesh);
  sun.add(coreSpikes);

  // Floating shards around the core.
  const shardMesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.02),
    new THREE.MeshStandardMaterial({ color: 0xc86a5a, emissive: 0x3a1008, roughness: 0.5, flatShading: true }),
    18,
  );
  for (let i = 0; i < 18; i += 1) {
    const a = i * 2.399963;
    const radius = 0.62 + 0.18 * Math.abs(Math.sin(i * 3.1));
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(i, i * 1.7, i * 0.6));
    spikeMatrix.compose(
      new THREE.Vector3(Math.cos(a) * radius, Math.sin(i * 1.9) * 0.42, Math.sin(a) * radius),
      orientation,
      new THREE.Vector3().setScalar(0.7 + (i % 4) * 0.35),
    );
    shardMesh.setMatrixAt(i, spikeMatrix);
  }
  coreSpikes.add(shardMesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xff9a47,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  glow.scale.set(2.2, 2.2, 1);
  glow.material.color.set(0xffb347);
  sun.add(glow);
  glow.visible = !calm;

  const sunRings = [];
  const RING_STYLE = [
    { radius: 0.74, color: 0xd9a63a, tilt: [1.25, 0.2, 0.3] },
    { radius: 0.8, color: 0x2a1210, tilt: [0.7, 0.5, 2.2] },
  ];
  for (const style of RING_STYLE) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(style.radius, 0.009, 6, 120),
      new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.set(...style.tilt);
    sun.add(ring);
    sunRings.push(ring);
  }

  // L18 coherence ring: perfect and bright when phases lock, wobbling and faint when they scatter.
  const coherenceRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.006, 6, 180),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  coherenceRing.rotation.x = Math.PI / 2;
  sun.add(coherenceRing);

  const crystalGeometry = new THREE.IcosahedronGeometry(0.72, 1);
  const crystal = new THREE.Mesh(
    crystalGeometry,
    new THREE.MeshPhysicalMaterial({
      color: 0xff8a52,
      emissive: 0x5a1405,
      roughness: 0.12,
      metalness: 0,
      transmission: 0,
      transparent: true,
      opacity: 0.2,
      flatShading: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const lattice = new THREE.LineSegments(
    new THREE.EdgesGeometry(crystalGeometry),
    new THREE.LineBasicMaterial({ color: 0xffc89a, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  const innerLattice = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.5, 0)),
    new THREE.LineBasicMaterial({ color: 0xffe6c4, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff6a2c,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.55, 96, 1),
    new THREE.MeshBasicMaterial({
      color: 0xff7a3a,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disc.rotation.x = Math.PI / 2 - 0.12;
  sun.add(crystal, lattice, innerLattice, atmosphere, disc);
  for (const part of [lattice, innerLattice, atmosphere, disc]) part.visible = false;
  crystal.scale.setScalar(0.88);
  crystal.material.opacity = 0.2;
  sun.scale.setScalar(0.75);
  const BRAIN_SCALE = 1.8;
  // Brain space has the frontal lobe at +z (toward the camera) and the cerebellum at -z; lift centres the whole form.
  const BRAIN_LIFT = 0.55;
  const BRAIN_TILT = 0.16;
  sun.position.y = BRAIN_LIFT;
  cosmos.rotation.x = BRAIN_TILT;
  scene.fog = new THREE.FogExp2(0x030304, 0.028);

  const starPositions = [];
  let seed = 0x51c0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < (immersive ? 1800 : 420); index += 1) {
    starPositions.push((random() - 0.5) * 10, (random() - 0.5) * 5.2, (random() - 0.5) * 8 - 1.2);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0x9c7050, size: immersive ? 0.014 : 0.018, transparent: true, opacity: 0.54, depthWrite: false }),
  ));
  const farPositions = [];
  for (let index = 0; index < (immersive ? 900 : 260); index += 1) {
    farPositions.push((random() - 0.5) * 26, (random() - 0.5) * 14, -7 - random() * 14);
  }
  const farGeometry = new THREE.BufferGeometry();
  farGeometry.setAttribute('position', new THREE.Float32BufferAttribute(farPositions, 3));
  const farStars = new THREE.Points(
    farGeometry,
    new THREE.PointsMaterial({ color: 0x8ac3df, size: 0.03, transparent: true, opacity: 0.35, depthWrite: false, fog: false }),
  );
  scene.add(farStars);
  if (immersive) {
    const dustPositions = [];
    const dustColors = [];
    for (let index = 0; index < 2600; index += 1) {
      const radius = 0.35 + random() * 4.1;
      const arm = Math.floor(random() * 3);
      const angle = radius * 1.55 + arm * (Math.PI * 2 / 3) + (random() - 0.5) * 1.15;
      dustPositions.push(
        Math.cos(angle) * radius + (random() - 0.5) * 0.18,
        (random() - 0.5) * 0.14,
        Math.sin(angle) * radius * 0.61 + (random() - 0.5) * 0.18,
      );
      const warmth = random();
      dustColors.push(
        0.36 + warmth * 0.5,
        0.28 + warmth * 0.28,
        0.5 + (1 - warmth) * 0.34,
      );
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('color', new THREE.Float32BufferAttribute(dustColors, 3));
    scene.add(new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        size: 0.016,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ));
  }

  const caption = document.createElement('div');
  caption.className = 'mandala-caption';
  const title = document.createElement('strong');
  title.textContent = 'CAPSULE SYSTEM';
  const subtitle = document.createElement('small');
  const hud = document.createElement('small');
  hud.className = 'mandala-hud';
  caption.append(title, subtitle, hud, learningLabel);

  const hoverLabel = document.createElement('div');
  hoverLabel.className = 'mandala-hover';
  hoverLabel.hidden = true;
  hoverLabel.setAttribute('aria-hidden', 'true');

  const selection = document.createElement('div');
  selection.className = 'mandala-selection';
  selection.hidden = true;
  selection.setAttribute('role', 'status');
  selection.setAttribute('aria-live', 'polite');
  const selectionTitle = document.createElement('strong');
  const selectionDetail = document.createElement('small');
  const selectionClose = document.createElement('button');
  selectionClose.className = 'mandala-selection-close';
  selectionClose.type = 'button';
  selectionClose.setAttribute('aria-label', 'Clear selected engine item');
  selectionClose.textContent = '×';
  selection.append(selectionTitle, selectionDetail, selectionClose);

  const canvas = renderer.domElement;
  canvas.className = 'mandala-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Interactive Capsule OS engine scene. Use arrow keys to select an agent or workflow.');
  element.replaceChildren(canvas, caption, hoverLabel, selection);
  const eyeSpy = document.createElement('aside');
  eyeSpy.className = 'agent-eye-spy';
  eyeSpy.hidden = true;
  eyeSpy.setAttribute('aria-label', 'Eye Spy live agent texture and simulation math');
  const eyeHead = document.createElement('div');
  eyeHead.className = 'agent-eye-head';
  const eyeTitle = document.createElement('strong');
  const eyeClose = document.createElement('button');
  eyeClose.type = 'button';
  eyeClose.textContent = '×';
  eyeClose.setAttribute('aria-label', 'Close Eye Spy and clear selected agent');
  eyeClose.addEventListener('click', () => renderSelection(null));
  eyeHead.append(eyeTitle, eyeClose);
  const eyePreview = document.createElement('canvas');
  eyePreview.width = eyePreview.height = 160;
  eyePreview.className = 'agent-eye-preview';
  eyePreview.setAttribute('role', 'img');
  eyePreview.setAttribute('aria-label', 'Live close-up copied from the selected agent in this graph');
  const eyeContext = eyePreview.getContext('2d');
  const eyeStatus = document.createElement('small');
  const eyeMath = document.createElement('pre');
  eyeSpy.append(eyeHead, eyePreview, eyeStatus, eyeMath);
  element.append(eyeSpy);
  let eyeClock = 0;
  let previewFailed = false;

  const indexBar = document.createElement('div');
  indexBar.className = 'mandala-index';
  indexBar.hidden = true;
  indexBar.id = `${element.id}-roster`;
  indexBar.setAttribute('aria-label', 'Jump to an item in the engine');
  const soundToggle = document.createElement('button');
  soundToggle.type = 'button';
  soundToggle.className = 'mandala-sound';
  const syncSound = () => {
    const enabled = isAudioReady() && !isMuted();
    soundToggle.textContent = '♪';
    soundToggle.setAttribute('aria-pressed', String(enabled));
    soundToggle.setAttribute('aria-label', enabled ? 'Mute agent activity motifs' : 'Enable agent activity motifs');
    soundToggle.title = enabled ? 'Mute agent sound' : 'Enable agent sound';
  };
  syncSound();
  window.addEventListener('capsule-audio-state', syncSound);
  soundToggle.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      if (isAudioReady() && !isMuted()) setMuted(true);
      else { await unlockAudio(); setMuted(false); }
      syncSound();
    } catch (error) {
      soundToggle.title = `Sound unavailable: ${error.message}`;
    }
  });
  const drawerToggle = document.createElement('button');
  drawerToggle.type = 'button';
  drawerToggle.className = 'mandala-drawer-toggle';
  drawerToggle.setAttribute('aria-expanded', 'false');
  drawerToggle.setAttribute('aria-controls', indexBar.id);
  drawerToggle.setAttribute('aria-label', 'Open agent roster');
  drawerToggle.title = 'Agent roster';
  const playerIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  playerIcon.setAttribute('viewBox', '0 0 24 24');
  playerIcon.setAttribute('width', '18');
  playerIcon.setAttribute('height', '18');
  playerIcon.setAttribute('aria-hidden', 'true');
  playerIcon.setAttribute('fill', 'none');
  playerIcon.setAttribute('stroke', 'currentColor');
  playerIcon.setAttribute('stroke-width', '1.7');
  playerIcon.setAttribute('stroke-linecap', 'round');
  const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  head.setAttribute('cx', '12');
  head.setAttribute('cy', '7');
  head.setAttribute('r', '3.5');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  body.setAttribute('d', 'M5 21v-2a7 7 0 0 1 14 0v2Z');
  playerIcon.append(head, body);
  drawerToggle.append(playerIcon);
  const drawerCount = document.createElement('span');
  drawerCount.hidden = true;
  drawerToggle.append(drawerCount);
  let discussion = null;
  drawerToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = element.classList.toggle('drawer-open');
    discussion?.close();
    indexBar.hidden = !open;
    drawerToggle.setAttribute('aria-expanded', String(open));
  });
  const graphControls = document.createElement('div');
  graphControls.className = 'graph-decision-controls';
  graphControls.append(drawerToggle);
  element.append(indexBar, graphControls, soundToggle);
  let motionPaused = false;
  const viewControls = document.createElement('div');
  viewControls.className = 'graph-view-controls';
  const reset = document.createElement('button');
  reset.type = 'button'; reset.textContent = 'Reset view';
  reset.addEventListener('click', () => { renderSelection(null); resetView(); });
  const pause = document.createElement('button');
  pause.type = 'button'; pause.textContent = 'Pause motion'; pause.setAttribute('aria-pressed', 'false');
  pause.addEventListener('click', () => {
    motionPaused = !motionPaused;
    pause.textContent = motionPaused ? 'Resume motion' : 'Pause motion';
    pause.setAttribute('aria-pressed', String(motionPaused));
  });
  viewControls.append(reset, pause); element.append(viewControls);
  if (decisionTools) {
    discussion = createGraphDiscussion(element, () => {
      element.classList.remove('drawer-open');
      indexBar.hidden = true;
      drawerToggle.setAttribute('aria-expanded', 'false');
    }, graphControls);
  }

  const resizeObserver = new ResizeObserver(() => {
    const width = Math.max(element.clientWidth, 1);
    const height = Math.max(element.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(element);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let entities = [];
  let orbitGroups = [];
  let worldObjects = [];
  let pathEdges = [];
  let pathLines = null;
  let entitySignature = '';
  let activityCounts = new Map();
  let agentStates = new Map();
  let selectedKey = '';
  let hoveredKey = '';
  let followKey = '';
  let busy = false;
  let disposed = false;
  let visible = !document.hidden;
  let active = true;
  let animationFrame = 0;
  let elapsed = 0;
  let previousTime = 0;

  function renderSelection(entry) {
    if (!entry) {
      selectedKey = '';
      followKey = '';
      eyeSpy.hidden = true;
      element.classList.remove('has-eye-spy');
      selection.hidden = true;
      for (const world of worldObjects) world.planet.scale.setScalar(1);
      for (const chip of indexBar.children) chip.classList.remove('is-active');
      return;
    }
    selectedKey = entry.key;
    eyeSpy.hidden = entry.kind !== 'agent';
    element.classList.toggle('has-eye-spy', entry.kind === 'agent');
    eyeTitle.textContent = `EYE SPY · ${entry.name}`;
    selection.hidden = false;
    selectionTitle.textContent = `${entry.kind.toUpperCase()} · ${entry.name}`;
    const receiptCount = entry.agentId ? activityCounts.get(entry.agentId) || 0 : 0;
    const receiptSummary = entry.agentId ? `${receiptCount} receipt${receiptCount === 1 ? '' : 's'}` : '';
    selectionDetail.textContent = [KIND_HELP[entry.kind], entry.detail, receiptSummary].filter(Boolean).join(' · ');
    for (const world of worldObjects) {
      world.planet.scale.setScalar(world.entry.key === selectedKey ? 1.3 : 1);
    }
    for (const chip of indexBar.children) chip.classList.toggle('is-active', chip.dataset.key === selectedKey);
  }

  function flyTo(entry) {
    followKey = entry.key;
    setZoom(0.5);
  }

  function regionPoint(region) {
    const [x, y, z] = region.center;
    return new THREE.Vector3(x * BRAIN_SCALE, y * BRAIN_SCALE + BRAIN_LIFT, z * BRAIN_SCALE);
  }

  function regionAgents(region) {
    return worldObjects.filter((world) => world.region === region.id).map((world) => world.entry.name);
  }

  function focusRegion(region) {
    const agents = regionAgents(region);
    selectedKey = `region:${region.id}`;
    followKey = selectedKey;
    eyeSpy.hidden = true;
    element.classList.remove('has-eye-spy');
    selection.hidden = false;
    selectionTitle.textContent = `REGION · ${region.name}`;
    selectionDetail.textContent = [
      region.role,
      `${region.nodes.length} lattice nodes`,
      agents.length ? `Agents here: ${agents.join(', ')}` : 'No agents pinned here',
    ].join(' · ');
    for (const chip of indexBar.children) chip.classList.toggle('is-active', chip.dataset.key === selectedKey);
    setZoom(region.id.startsWith('deep') || region.id === 'callosum' ? 0.1 : 0.17);
  }

  function followSelected() {
    if (!followKey) return;
    const region = followKey.startsWith('region:') ? brain.regions.find((item) => `region:${item.id}` === followKey) : null;
    const world = region ? null : worldObjects.find((item) => item.entry.key === followKey);
    if (!region && !world) return;
    cosmos.updateMatrixWorld(true);
    const point = region ? cosmos.localToWorld(regionPoint(region)) : world.planet.getWorldPosition(new THREE.Vector3());
    const local = point.sub(cosmos.position);
    cosmos.position.x += (THREE.MathUtils.clamp(-local.x, -REACH, REACH) - cosmos.position.x) * 0.08;
    cosmos.position.y += (THREE.MathUtils.clamp(-local.y, -REACH, REACH) - cosmos.position.y) * 0.08;
    cosmos.position.z += (THREE.MathUtils.clamp(-local.z, -REACH, REACH) - cosmos.position.z) * 0.08;
  }

  function focusEntry(entry) {
    renderSelection(entry);
    element.dispatchEvent(new CustomEvent('graph-select', { bubbles: true, detail: { key: entry.key, name: entry.name, kind: entry.kind } }));
    flyTo(entry);
    void soundAgent(entry, true);
  }

  async function soundAgent(entry, directGesture = false) {
    if (entry.kind !== 'agent' || isMuted()) return;
    try {
      if (directGesture) await unlockAudio();
      playAgentMotif(entry.agentId, agentStates.get(entry.agentId) || 'idle');
    } catch (error) {
      soundToggle.title = `Sound unavailable: ${error.message}`;
    }
  }

  selectionClose.addEventListener('click', () => renderSelection(null));

  // Brain lattice from app/brain-geometry.js: parametric hemispheres, cerebellum and stem.
  const brain = (() => {
    const model = buildBrain();
    const nodes = model.nodes.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const positions = [];
    for (const [a, b] of model.edges) positions.push(nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z);
    const spots = model.pins.map((index) => nodes[index]);
    const group = new THREE.Group();
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)),
      new THREE.LineBasicMaterial({ color: 0xe8a070, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const dots = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(nodes),
      new THREE.PointsMaterial({ color: 0xffd7b0, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    group.add(lines, dots);
    // Nebula: a volumetric cloud, not a shell. Gaussian-distributed particles are warped by layered sine noise
    // so the edges dissolve; colour drifts between ember, rose and violet by the same noise field.
    const cloud = [];
    let seed = 20260;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const field = (x, y, z) => (
      Math.sin(2.1 * x + 1.3 * y) * Math.cos(1.7 * z - 0.6 * x)
      + 0.5 * Math.sin(4.3 * y + 2.2 * z + 1.1) * Math.cos(3.9 * x - 1.4 * y)
    );
    for (let i = 0; i < 2400; i += 1) {
      let x;
      let y;
      let z;
      if (i % 20 < 11) {
        // Fill the whole containment ellipsoid so every node sits inside the cloud.
        const r = 0.9 * Math.cbrt(rnd());
        const cosT = rnd() * 2 - 1;
        const sinT = Math.sqrt(1 - cosT * cosT);
        const az = rnd() * Math.PI * 2;
        x = r * sinT * Math.cos(az) * WALL.x;
        y = r * cosT * WALL.y;
        z = r * sinT * Math.sin(az) * WALL.z;
      } else {
        x = gauss() * 0.42;
        y = gauss() * 0.3;
        z = gauss() * 0.62;
      }
      const wx = 0.22 * field(y, z, x);
      const wy = 0.18 * field(z, x + 2, y);
      const wz = 0.24 * field(x + 4, y, z);
      x += wx;
      y += wy;
      z += wz;
      cloud.push([x, y, z]);
    }
    const cloudColors = [];
    const ember = new THREE.Color(0xff7a3c);
    const rose = new THREE.Color(0xff5f8a);
    const violet = new THREE.Color(0x8f7bff);
    const mixed = new THREE.Color();
    for (const [x, y, z] of cloud) {
      const n = THREE.MathUtils.clamp(0.5 + 0.35 * field(x * 1.4, y * 1.4, z * 1.4), 0, 1);
      if (n < 0.5) mixed.copy(ember).lerp(rose, n * 2);
      else mixed.copy(rose).lerp(violet, (n - 0.5) * 2);
      cloudColors.push(mixed.r, mixed.g, mixed.b);
    }
    const nebulaGeometry = new THREE.BufferGeometry().setFromPoints(cloud.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    nebulaGeometry.setAttribute('color', new THREE.Float32BufferAttribute(cloudColors, 3));
    const nebula = new THREE.Points(
      nebulaGeometry,
      new THREE.PointsMaterial({
        map: glowTexture, size: 0.26, vertexColors: true, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    nebula.renderOrder = -2;
    const nebulaVelocity = new Float32Array(cloud.length * 3);
    const nebulaRest = Float32Array.from(nebula.geometry.getAttribute('position').array);
    group.add(nebula);
    const surface = buildCortexSurface();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.vertices.flat(), 3));
    geometry.setIndex(surface.indices);
    geometry.computeVertexNormals();
    const cortex = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: 0xd9a0a0,
        roughness: 0.55,
        clearcoat: 0.6,
        clearcoatRoughness: 0.35,
        sheen: 0.6,
        sheenColor: new THREE.Color(0xffb0a0),
        emissive: 0x3a1010,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    cortex.renderOrder = -1;
    group.add(cortex);
    return {
      group,
      lines,
      dots,
      cortex,
      nebula,
      nebulaVelocity,
      nebulaRest,
      spots,
      regions: model.regions,
      nodes: model.nodes,
      vectors: nodes,
      nodeRegion: model.nodeRegion,
      spotRegion: model.pins.map((index) => model.nodeRegion[index]),
    };
  })();
  brain.group.scale.setScalar(BRAIN_SCALE);
  brain.group.position.y = BRAIN_LIFT;
  cosmos.add(brain.group);

  const probe = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
  );
  probe.renderOrder = 10;
  probe.visible = false;
  brain.group.add(probe);

  const probeWorld = new THREE.Vector3();
  // Nearest lattice node to the pointer in screen space (eye-spy hover).
  function latticeAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    const py = event.clientY - bounds.top;
    let best = null;
    let bestDist = 14;
    brain.group.updateWorldMatrix(true, false);
    for (let index = 0; index < brain.vectors.length; index += 1) {
      probeWorld.copy(brain.vectors[index]).applyMatrix4(brain.group.matrixWorld).project(camera);
      if (probeWorld.z < -1 || probeWorld.z > 1) continue;
      const dist = Math.hypot(((probeWorld.x + 1) / 2) * bounds.width - px, ((1 - probeWorld.y) / 2) * bounds.height - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    for (const neuron of neuronState.neurons) {
      probeWorld.set(...neuron.p).applyMatrix4(brain.group.matrixWorld).project(camera);
      if (probeWorld.z < -1 || probeWorld.z > 1) continue;
      const dist = Math.hypot(((probeWorld.x + 1) / 2) * bounds.width - px, ((1 - probeWorld.y) / 2) * bounds.height - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = neuron;
      }
    }
    if (best === null) return null;
    if (typeof best === 'object') return { neuron: best, local: neuronVector.set(...best.p) };
    return { index: best, region: brain.nodeRegion[best], local: brain.vectors[best] };
  }

  // Neurogenesis: agents grow neurons inside the lattice on their own. Visual, in-capsule data only.
  const neuronVector = new THREE.Vector3();
  let neuronState = loadNeurons();
  let arrivals = 0;
  let birthAge = 99;
  const neuronPositions = new Float32Array(MAX_NEURONS * 3);
  const neuronColors = new Float32Array(MAX_NEURONS * 3);
  const neuronLines = new Float32Array(MAX_NEURONS * 6);
  const neuronDotGeometry = new THREE.BufferGeometry();
  neuronDotGeometry.setAttribute('position', new THREE.BufferAttribute(neuronPositions, 3));
  neuronDotGeometry.setAttribute('color', new THREE.BufferAttribute(neuronColors, 3));
  const neuronDots = new THREE.Points(
    neuronDotGeometry,
    new THREE.PointsMaterial({ size: 0.024, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const neuronLineGeometry = new THREE.BufferGeometry();
  neuronLineGeometry.setAttribute('position', new THREE.BufferAttribute(neuronLines, 3));
  const neuronLinks = new THREE.LineSegments(
    neuronLineGeometry,
    new THREE.LineBasicMaterial({ color: 0xffc9a0, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const birthGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  for (const object of [neuronDots, neuronLinks, birthGlow]) {
    object.frustumCulled = false;
    brain.group.add(object);
  }

  function updateNeuronLabel() {
    subtitle.textContent = `${subtitle.textContent.replace(/ · \d+ NEURONS GROWN$/, '')}${neuronState.neurons.length ? ` · ${neuronState.neurons.length} NEURONS GROWN` : ''}`;
  }

  function syncNeurons() {
    const byId = new Map(neuronState.neurons.map((neuron) => [neuron.id, neuron]));
    neuronState.neurons.forEach((neuron, index) => {
      const world = worldObjects.find((item) => item.entry.key === neuron.agent);
      const color = new THREE.Color(world ? world.color : 0xffd7b0);
      neuronPositions.set(neuron.p, index * 3);
      neuronColors.set([color.r, color.g, color.b], index * 3);
      const parent = byId.get(neuron.parent);
      const anchor = parent ? parent.p : world ? [world.home.x, world.home.y, world.home.z] : neuron.p;
      neuronLines.set([...anchor, ...neuron.p], index * 6);
    });
    const count = neuronState.neurons.length;
    neuronDotGeometry.setDrawRange(0, count);
    neuronLineGeometry.setDrawRange(0, count * 2);
    neuronDotGeometry.attributes.position.needsUpdate = true;
    neuronDotGeometry.attributes.color.needsUpdate = true;
    neuronLineGeometry.attributes.position.needsUpdate = true;
  }

  function growFor(key) {
    const world = worldObjects.find((item) => item.entry.key === key);
    if (!world) return;
    const neuron = growNeuron(neuronState, [{ key, home: [world.home.x, world.home.y, world.home.z] }]);
    if (!neuron) return;
    saveNeurons(neuronState);
    syncNeurons();
    updateNeuronLabel();
    birthGlow.position.set(...neuron.p);
    birthGlow.material.color.set(world.color);
    birthAge = 0;
  }

  function growAny() {
    const agents = worldObjects
      .filter((item) => item.entry.kind === 'agent')
      .map((item) => ({ key: item.entry.key, home: [item.home.x, item.home.y, item.home.z] }));
    if (!agents.length) return;
    const neuron = growNeuron(neuronState, agents);
    if (!neuron) return;
    saveNeurons(neuronState);
    syncNeurons();
    updateNeuronLabel();
    const world = worldObjects.find((item) => item.entry.key === neuron.agent);
    birthGlow.position.set(...neuron.p);
    if (world) birthGlow.material.color.set(world.color);
    birthAge = 0;
  }

  function tickGrowth() {
    if (disposed || !worldObjects.length) return;
    const due = dueGrowths(neuronState);
    for (let i = 0; i < due; i += 1) growAny();
    if (due) saveNeurons(neuronState);
  }

  // Wall-clock timer: keeps growing while the view is hidden, and catches up after the app was closed.
  const growthTimer = window.setInterval(tickGrowth, 1000);
  const onGrowthResume = () => tickGrowth();
  document.addEventListener('visibilitychange', onGrowthResume);

  function animateGrowth(delta) {
    if (birthAge < 3) {
      birthAge += delta;
      const fade = Math.max(0, 1 - birthAge / 3);
      birthGlow.material.opacity = fade * 0.9;
      const size = 0.05 + (1 - fade) * 0.28;
      birthGlow.scale.set(size, size, 1);
    } else {
      birthGlow.material.opacity = 0;
    }
  }

  function rebuildEntities(nextEntities) {
    const nextSignature = JSON.stringify(nextEntities.map(({ key, name, kind, detail }) => [key, name, kind, detail]));
    if (nextSignature === entitySignature) return;

    for (const orbit of orbitGroups) {
      cosmos.remove(orbit.group);
      disposeObject(orbit.group, glowTexture);
    }
    orbitGroups = [];
    worldObjects = [];
    entities = nextEntities;
    entitySignature = nextSignature;

    if (selectedKey && !entities.some((entry) => entry.key === selectedKey)) renderSelection(null);
    if (!entities.length) {
      subtitle.textContent = 'YOUR AGENTS · YOUR WORKFLOWS';
      return;
    }

    const nodeGroup = new THREE.Group();
    nodeGroup.scale.setScalar(BRAIN_SCALE);
    nodeGroup.position.y = BRAIN_LIFT;
    cosmos.add(nodeGroup);
    orbitGroups.push({ group: nodeGroup });
    const stride = brain.spots.length / entities.length;
    entities.forEach((entry, index) => {
      const orbit = orbitGroups[0];
      const spotIndex = Math.min(brain.spots.length - 1, Math.floor(index * stride));
      const home = brain.spots[spotIndex].clone();
      const region = brain.spotRegion[spotIndex];
      const well = wellFor(entry.key);
      const color = well.color;
      const size = entry.kind === 'agent' ? 0.017 : 0.02;
      const planet = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(size, 14, 10),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color).multiplyScalar(0.34),
          emissive: color,
          emissiveIntensity: 0.85,
          roughness: 0.44,
          metalness: 0.24,
        }),
      );
      body.userData.entityKey = entry.key;
      planet.add(body);
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(size * 2.6, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.userData.entityKey = entry.key;
      planet.add(hit);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      halo.scale.set(size * 6, size * 6, 1);
      planet.add(halo);
      planet.userData.entityKey = entry.key;
      planet.userData.entity = entry;
      orbit.group.add(planet);
      worldObjects.push({ entry, body, hit, planet, home, region, phase: index * 1.3, color, well });
    });

    subtitle.textContent = `${entities.filter((entry) => entry.kind === 'agent').length} AGENTS · ${entities.filter((entry) => entry.kind === 'workflow').length} WORKFLOWS · ${entities.filter((entry) => entry.kind === 'kernel').length} KERNELS`;
    buildPaths();
    syncNeurons();
    updateNeuronLabel();
    tickGrowth();
    const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    drawerCount.textContent = String(sorted.length);
    drawerToggle.title = `Agent roster (${sorted.length})`;
    drawerToggle.setAttribute('aria-label', `Open agent roster, ${sorted.length} items`);
    indexBar.replaceChildren(...sorted.map((entry) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.key = entry.key;
      chip.title = KIND_HELP[entry.kind];
      chip.textContent = entry.name;
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        focusEntry(entry);
      });
      return chip;
    }));
  }

  function update(agents, workflows, receipts, isBusy, discussions = []) {
    const { active: allAgents, absorbed, redirect } = consolidate(Array.isArray(agents) ? agents : []);
    const currentAgents = allAgents;
    const currentWorkflows = Array.isArray(workflows) ? workflows : [];
    const currentReceipts = Array.isArray(receipts) ? receipts : [];
    discussion?.update(currentReceipts, discussions);
    const nextEntities = [
      ...currentAgents.map((agent) => {
        const folded = absorbed.get(agent.id) || [];
        const base = agent.purpose || (agent.capabilities?.length
          ? `Capabilities: ${agent.capabilities.join(' · ')}`
          : 'No capabilities declared.');
        return {
          key: `agent:${agent.id}`,
          kind: 'agent',
          id: agent.id,
          name: agent.name || agent.id || 'Unnamed agent',
          detail: folded.length ? `${base} · Absorbs ${folded.map((old) => old.name || old.id).join(', ')}` : base,
          agentId: agent.id,
        };
      }),
      ...currentWorkflows.map((workflow) => {
        const owner = workflow.agent || workflow.agentId
          || currentAgents.find((agent) => agent.name === workflow.agentName)?.id;
        return {
          key: `workflow:${workflow.id}`,
          kind: workflow.kind === 'kernel' ? 'kernel' : 'workflow',
          id: workflow.id,
          name: workflow.name || workflow.text || workflow.id || 'Untitled workflow',
          detail: [
            workflow.description,
            Array.isArray(workflow.steps) ? `${workflow.steps.length} steps` : '',
            workflow.agentName,
            workflow.capability,
            workflow.risk,
          ].filter(Boolean).join(' · '),
          agentId: redirect.get(owner) || owner,
        };
      }),
    ];
    activityCounts = new Map(currentAgents.map((agent) => [agent.id, 0]));
    for (const receipt of currentReceipts) {
      const receiptAgent = redirect.get(receipt.agent) || receipt.agent;
      if (activityCounts.has(receiptAgent)) {
        activityCounts.set(receiptAgent, activityCounts.get(receiptAgent) + 1);
      }
    }
    busy = Boolean(isBusy);
    agentStates = new Map(currentAgents.map((agent) => [
      agent.id, agentActivityState(currentReceipts.filter((receipt) => (redirect.get(receipt.agent) || receipt.agent) === agent.id), busy),
    ]));
    rebuildEntities(nextEntities);
    element.setAttribute(
      'aria-label',
      `Interactive Capsule OS engine: ${nextEntities.length} user items, ${currentAgents.length} agents, ${currentWorkflows.length} workflows, ${currentReceipts.length} receipts.`,
    );
    for (const world of worldObjects) {
      const count = activityCounts.get(world.entry.agentId) || 0;
      world.body.material.emissiveIntensity = count ? 1.3 + Math.min(count, 4) * 0.25 : 0.8;
      world.planet.scale.setScalar(world.entry.key === selectedKey ? 1.3 : count ? 1.14 : 1);
    }
    if (selectedKey) {
      const selected = entities.find((entry) => entry.key === selectedKey);
      if (selected) renderSelection(selected);
    }
  }

  function entityAt(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const bodies = worldObjects.map((world) => world.hit);
    const hit = raycaster.intersectObjects(bodies, false)[0];
    return hit ? entities.find((entry) => entry.key === hit.object.userData.entityKey) || null : null;
  }

  const touches = new Map();
  let pinchDistance = 0;
  let drag = null;
  let dragged = false;
  const lookTarget = new THREE.Vector3(0, 0.05, 0);
  const viewDirection = camera.position.clone().sub(lookTarget).normalize();
  const baseDistance = camera.position.distanceTo(lookTarget);
  let zoom = 1;
  const MIN_ZOOM = 0.03;
  const MAX_ZOOM = 1.9;
  const REACH = 6;

  const spinVelocity = new THREE.Vector3();
  let kuramotoTheta = new Float64Array(0);
  let hudClock = 0;
  let kuramotoOmega = new Float64Array(0);
  const spinAxisX = new THREE.Vector3(1, 0, 0);
  const spinAxisY = new THREE.Vector3(0, 1, 0);
  const spinStep = new THREE.Quaternion();
  const SPIN_FRICTION = 1.1;
  function applySpin(pitch, yaw) {
    spinStep.setFromAxisAngle(spinAxisY, yaw);
    cosmos.quaternion.premultiply(spinStep);
    spinStep.setFromAxisAngle(spinAxisX, pitch);
    cosmos.quaternion.premultiply(spinStep);
  }

  function setZoom(next) {
    zoom = THREE.MathUtils.clamp(next, MIN_ZOOM, MAX_ZOOM);
    camera.position.copy(lookTarget).addScaledVector(viewDirection, baseDistance * zoom);
  }

  function resetView() {
    followKey = '';
    cosmos.quaternion.setFromEuler(new THREE.Euler(BRAIN_TILT, 0, 0));
    spinVelocity.set(0, 0, 0);
    cosmos.position.set(0, 0, 0);
    setZoom(1);
  }

  canvas.addEventListener('wheel', (event) => {
    if (calm && document.activeElement !== canvas && !event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom * Math.exp(event.deltaY * 0.0012));
  }, { passive: false });
  canvas.addEventListener('dblclick', resetView);

  canvas.addEventListener('pointermove', (event) => {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance) setZoom(zoom * (pinchDistance / distance));
      pinchDistance = distance;
      dragged = true;
      return;
    }
    if (drag && (event.buttons === 1 || event.buttons === 2)) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
      if (drag.pan) {
        const reach = REACH;
        const scale = 0.0035 * zoom * baseDistance / 7;
        cosmos.position.x = THREE.MathUtils.clamp(cosmos.position.x + dx * scale, -reach, reach);
        cosmos.position.y = THREE.MathUtils.clamp(cosmos.position.y - dy * scale, -reach, reach);
      } else {
        // Free trackball spin about screen axes; the release velocity is kept as angular momentum.
        spinVelocity.set(dy * 0.003, dx * 0.004, 0);
        applySpin(spinVelocity.x, spinVelocity.y);
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      element.classList.add('is-dragging');
      return;
    }
    const entry = entityAt(event);
    const previousHover = hoveredKey;
    hoveredKey = entry?.key || '';
    if (hoveredKey !== previousHover) {
      if (entry?.kind === 'agent') void soundAgent(entry);
      else stopAgentMotif();
    }
    const spot = entry ? null : latticeAt(event);
    probe.visible = Boolean(spot);
    latticeHover = Boolean(spot);
    if (spot) probe.position.copy(spot.local);
    element.classList.toggle('has-hover', Boolean(entry || spot));
    if (entry) {
      const soundHint = entry.kind === 'agent' ? ` · ${agentStates.get(entry.agentId) || 'idle'} activity motif${isAudioReady() ? '' : ' · click the agent to enable sound'}` : '';
      hoverLabel.textContent = `${entry.kind.toUpperCase()} · ${entry.name}${soundHint} — ${KIND_HELP[entry.kind]}`;
      hoverLabel.hidden = false;
    } else if (spot && spot.neuron) {
      const owner = entities.find((item) => item.key === spot.neuron.agent);
      const minutes = Math.max(0, Math.round((Date.now() - spot.neuron.born) / 60000));
      hoverLabel.textContent = `NEURON #${spot.neuron.id} · grown by ${owner ? owner.name : 'an agent'} ${minutes}m ago — self-grown inside the capsule · click to follow the agent`;
      hoverLabel.hidden = false;
    } else if (spot) {
      const region = brain.regions.find((item) => item.id === spot.region);
      const [x, y, z] = brain.nodes[spot.index].map((value) => value.toFixed(2));
      hoverLabel.textContent = `LATTICE POINT #${spot.index} · ${region ? `${region.name} — ${region.role}` : 'Unmapped'} · (${x}, ${y}, ${z}) · click to fly in`;
      hoverLabel.hidden = false;
    } else {
      hoverLabel.hidden = true;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    stopAgentMotif();
    hoveredKey = '';
    probe.visible = false;
    latticeHover = false;
    hoverLabel.hidden = true;
    element.classList.remove('has-hover');
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinchDistance = 0;
    drag = { x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey };
    canvas.focus({ preventScroll: true });
    followKey = '';
    dragged = false;
    canvas.setPointerCapture(event.pointerId);
  });
  function endPointer(event) {
    touches.delete(event.pointerId);
    pinchDistance = 0;
    drag = null;
    element.classList.remove('is-dragging');
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    const entry = entityAt(event);
    if (entry) {
      focusEntry(entry);
      return;
    }
    const spot = latticeAt(event);
    if (spot && spot.neuron) {
      const owner = entities.find((item) => item.key === spot.neuron.agent);
      if (owner) focusEntry(owner);
      return;
    }
    const region = spot ? brain.regions.find((item) => item.id === spot.region) : null;
    if (region) focusRegion(region);
    else element.dispatchEvent(new CustomEvent('graph-empty-click'));
  });
  canvas.addEventListener('keydown', (event) => {
    if (!entities.length) {
      if (event.key === '+' || event.key === '=') setZoom(zoom * 0.88);
      else if (event.key === '-') setZoom(zoom / 0.88);
      else if (event.key === '0') resetView();
      return;
    }
    if (event.key === '+' || event.key === '=') return setZoom(zoom * 0.88);
    if (event.key === '-') return setZoom(zoom / 0.88);
    if (event.key === '0') return resetView();
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const index = entities.findIndex((entry) => entry.key === selectedKey);
      renderSelection(entities[(index + 1) % entities.length]);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = entities.findIndex((entry) => entry.key === selectedKey);
      renderSelection(entities[(index + entities.length - 1) % entities.length]);
    } else if (event.key === 'Enter' && hoveredKey) {
      const entry = entities.find((item) => item.key === hoveredKey);
      if (entry) renderSelection(entry);
    } else if (event.key === 'Escape') {
      renderSelection(null);
    }
  });

  const NOTE_GLYPHS = ['♩', '♪', '♫', '♬'];
  const glyphTextures = NOTE_GLYPHS.map((symbol) => {
    const glyph = document.createElement('canvas');
    glyph.width = glyph.height = 64;
    const gc = glyph.getContext('2d');
    gc.fillStyle = '#fff';
    gc.font = '48px serif';
    gc.textAlign = 'center';
    gc.textBaseline = 'middle';
    gc.fillText(symbol, 32, 34);
    return new THREE.CanvasTexture(glyph);
  });
  const NOTE_COUNT = 24;
  const musicNotes = Array.from({ length: NOTE_COUNT }, (_, index) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glyphTextures[index % NOTE_GLYPHS.length],
      color: new THREE.Color().setHSL(index / NOTE_COUNT, 0.75, 0.62),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sprite.userData.noteIndex = index;
    cosmos.add(sprite);
    return {
      sprite,
      index,
      angle: (index / NOTE_COUNT) * Math.PI * 2,
      radius: 1.25 + index * 0.045 + (index % 3) * 0.12,
      speed: (index % 2 ? -1 : 1) * (0.04 + index * 0.0021),
      phase: index * 1.7,
      pop: 0,
      hops: 0,
      edge: null,
    };
  });

  // Nebula at overview; the lattice and pathways sharpen as you fly in or hover a point.
  let detail = 0;
  let latticeHover = false;
  let physicsDebt = 0;
  // L1-L3 · the medium: a stable-fluid field in the x-y plane. The forge heats it, buoyancy lifts it, and the
  // nebula particles are advected by it, so the cloud's motion is the fluid's, not decoration.
  const medium = createFluid(24);
  const MEDIUM_PULL = 0.9;
  let fluidDebt = 0;
  const mediumDrive = (x, y, z, out) => {
    const fx = 0.5 + x / (2 * WALL.x);
    const fy = 0.5 - y / (2 * WALL.y);
    const cu = medium.sample(medium.u, fx, fy);
    const cv = medium.sample(medium.v, fx, fy);
    out[0] = MEDIUM_PULL * cu;
    out[1] = -MEDIUM_PULL * cv;
    out[2] = MEDIUM_PULL * 0.25 * (cu - cv) * Math.sin(2 * x + y);
  };
  function stepMedium(delta, busy) {
    fluidDebt += delta;
    if (fluidDebt < 1 / 15) return;
    fluidDebt = 0;
    medium.addHeat(0.5, 0.5, 0.18 + 0.12 * Math.sin(elapsed * 0.515 * 2.2) + (busy ? 0.15 : 0), 2);
    medium.step(0.09);
  }
  function updateDetail(delta) {
    physicsDebt += delta;
    if (!reducedMotion.matches && physicsDebt >= 1 / 30) {
      stepMedium(physicsDebt, false);
      const attribute = brain.nebula.geometry.getAttribute('position');
      stepContained(attribute.array, brain.nebulaVelocity, physicsDebt, elapsed, brain.nebulaRest, mediumDrive);
      attribute.needsUpdate = true;
      physicsDebt = 0;
    }
    const t = THREE.MathUtils.clamp((0.9 - zoom) / 0.55, 0, 1);
    const target = Math.max(t * t * (3 - 2 * t), latticeHover ? 0.65 : 0);
    detail += (target - detail) * Math.min(1, delta * 5);
    brain.lines.material.opacity = 0.012 + detail * 0.2;
    brain.dots.material.opacity = 0.1 + detail * 0.6;
    brain.cortex.material.opacity = detail * 0.34;
    brain.nebula.material.opacity = 0.11 * (1 - detail * 0.8) + 0.025;
    pathLines.material.opacity = 0.06 + detail * 0.16;
  }

  // Pathways: node -1 is the core; other nodes are worldObjects indexes. Notes hop edge to edge like signals.
  pathLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xf4743b, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pathLines.frustumCulled = false;
  cosmos.add(pathLines);
  const nodeVectors = [];
  const nodePoint = (node, target) => {
    if (node < 0 || !worldObjects[node]) return target.set(0, BRAIN_LIFT, 0);
    worldObjects[node].planet.getWorldPosition(target);
    return cosmos.worldToLocal(target);
  };

  function buildPaths() {
    if (!pathLines) return;
    const count = worldObjects.length;
    const seen = new Set();
    pathEdges = [];
    const link = (a, b) => {
      const id = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (a === b || seen.has(id)) return;
      seen.add(id);
      pathEdges.push([a, b]);
    };
    for (let i = 0; i < count; i += 1) {
      if (i % 3 === 0) link(-1, i);
      const near = worldObjects
        .map((other, j) => [j, worldObjects[i].home.distanceToSquared(other.home)])
        .filter(([j]) => j !== i)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);
      near.forEach(([j]) => link(i, j));
    }
    pathLines.geometry.dispose();
    pathLines.geometry = new THREE.BufferGeometry();
    pathLines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(pathEdges.length, 1) * 6), 3));
    pathLines.visible = pathEdges.length > 0;
    for (const note of musicNotes) note.edge = null;
  }

  function pickEdge(note, from) {
    const options = pathEdges.filter(([a, b]) => a === from || b === from);
    if (!options.length) return null;
    const choice = options[Math.floor(Math.abs(Math.sin(note.index * 12.9898 + elapsed * 78.233 + note.hops)) * 43758.5453 % 1 * options.length)];
    note.hops += 1;
    return { from, to: choice[0] === from ? choice[1] : choice[0], t: 0 };
  }

  function updatePaths() {
    if (!pathEdges.length) return;
    const attr = pathLines.geometry.getAttribute('position');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    pathEdges.forEach(([from, to], i) => {
      nodePoint(from, a);
      nodePoint(to, b);
      attr.setXYZ(i * 2, a.x, a.y, a.z);
      attr.setXYZ(i * 2 + 1, b.x, b.y, b.z);
    });
    attr.needsUpdate = true;
  }

  function animateNotes(delta) {
    if (!pathEdges.length && worldObjects.length) buildPaths();
    updatePaths();
    for (const note of musicNotes) {
      note.pop = Math.max(0, note.pop - delta * 1.6);
      if (pathEdges.length) {
        if (!note.edge) note.edge = pickEdge(note, note.index % 3 === 0 ? -1 : (note.index % worldObjects.length));
        const edge = note.edge;
        if (!edge) continue;
        if (!reducedMotion.matches) edge.t += delta * (0.22 + (note.index % 5) * 0.03);
        if (edge.t >= 1) {
          const target = worldObjects[edge.to];
          if (target) {
            target.glow = 1;
            arrivals += 1;
            if (arrivals % 12 === 0) growFor(target.entry.key);
          }
          note.edge = pickEdge(note, edge.to);
        }
        const current = note.edge || edge;
        const from = nodePoint(current.from, new THREE.Vector3());
        const to = nodePoint(current.to, new THREE.Vector3());
        const t = Math.min(current.t, 1);
        note.sprite.position.lerpVectors(from, to, t * t * (3 - 2 * t));
        note.sprite.position.y += Math.sin(t * Math.PI) * 0.12;
      } else {
        if (!reducedMotion.matches) note.angle += delta * note.speed;
        note.sprite.position.set(
          Math.cos(note.angle) * note.radius,
          Math.sin(elapsed * 0.5 + note.phase) * 0.45,
          Math.sin(note.angle) * note.radius * 0.7,
        );
      }
      const size = 0.075 + note.pop * 0.12;
      note.sprite.scale.set(size, size, 1);
      note.sprite.material.opacity = 0.5 + note.pop * 0.5;
    }
    for (const world of worldObjects) {
      if (world.glow) {
        world.glow = Math.max(0, world.glow - delta * 1.8);
        world.planet.scale.setScalar((world.entry.key === selectedKey ? 1.3 : 1) + world.glow * 0.35);
      }
    }
  }

  function render(now) {
    animationFrame = 0;
    if (disposed || !visible || !active) return;
    const delta = motionPaused ? 0 : Math.min((now - previousTime) / 1000 || 0, 0.05);
    previousTime = now;
    elapsed += delta;
    if (!reducedMotion.matches) {
      if (!drag) {
        // Momentum from the last grab decays with friction, then the slow idle orbit takes over.
        const decay = Math.exp(-delta * SPIN_FRICTION);
        spinVelocity.multiplyScalar(decay);
        applySpin(spinVelocity.x * delta * 60, spinVelocity.y * delta * 60 + delta * (busy ? 0.05 : 0.025));
      }
      sun.rotation.y += delta * 0.08;
      sun.rotation.z += delta * 0.025;
      sunRings.forEach((ring, index) => {
        ring.rotation.y += delta * (index % 2 ? -0.12 : 0.1);
      });
      lattice.rotation.y -= delta * 0.14;
      innerLattice.rotation.x += delta * 0.22;
      innerLattice.rotation.y += delta * 0.17;
      disc.rotation.z += delta * 0.05;
      farStars.rotation.y -= delta * 0.004;
    }
    if (kuramotoTheta.length !== worldObjects.length) {
      kuramotoTheta = Float64Array.from(worldObjects, (world) => world.phase);
      kuramotoOmega = Float64Array.from(worldObjects, (world, i) => 0.5 + (i % 5) * 0.03);
    }
    const beforePhases = eyeSpy.hidden ? null : Float64Array.from(kuramotoTheta);
    const rates = eyeSpy.hidden ? undefined : new Float64Array(worldObjects.length);
    const stepDelta = reducedMotion.matches ? 0 : delta;
    const coupling = busy ? 1.6 : 0.8;
    kuramotoStep(kuramotoTheta, kuramotoOmega, coupling, stepDelta, rates);
    worldObjects.forEach((world, i) => {
      const theta = kuramotoTheta[i];
      const count = activityCounts.get(world.entry.agentId) || 0;
      // Active agents are less dense than the medium, so they rise (Part II buoyancy).
      const rise = buoyancy(1, 1 - Math.min(count, 4) * 0.12 + (i % 3) * 0.02, 1);
      world.planet.position.set(
        world.home.x + Math.sin(theta + world.home.y * 5) * 0.14,
        world.home.y + Math.sin(theta * 1.3 + world.home.x * 5) * 0.06 + rise * 0.12,
        world.home.z + Math.cos(theta + world.home.z * 5) * 0.14,
      );
      clampInside(world.planet.position);
      if (beforePhases && world.entry.key === selectedKey) world.math = {
        time: elapsed, dt: stepDelta, before: beforePhases[i], after: theta,
        omega: kuramotoOmega[i], coupling, rate: rates[i], count: worldObjects.length,
        density: 1 - Math.min(count, 4) * 0.12 + (i % 3) * 0.02, rise,
        position: world.planet.position.toArray(), receipts: count,
        roughness: world.body.material.roughness, metalness: world.body.material.metalness,
        emissive: world.body.material.emissiveIntensity, hasTexture: Boolean(world.body.material.map)
      };
    });
    const order = worldObjects.length ? coherence(kuramotoTheta) : 0;
    const breath = forgeBreath(elapsed);
    const wobble = (1 - order) * 0.1 * Math.sin(elapsed * 3.1);
    coherenceRing.scale.set(1 + wobble, 1 - wobble * 0.7, 1 + wobble * 0.4);
    coherenceRing.material.opacity = 0.12 + 0.6 * order;
    hudClock += delta;
    if (hudClock > 0.3) {
      hudClock = 0;
      const regime = busy ? 'TURBULENT' : 'LAMINAR';
      hud.textContent = `COHERENCE ${order.toFixed(2)} · ${regime} · FORGE 515`;
    }
    const pulse = 0.92 + Math.sin(elapsed * (busy ? 4.1 : 1.4)) * (busy ? 0.08 : 0.025);
    lavaMaterial.uniforms.uTime.value = elapsed;
    followSelected();
    updateDetail(delta);
    animateNotes(delta);
    animateGrowth(delta);
    sunHotspot.scale.setScalar(1 + breath * 0.05);
    crystal.material.opacity = calm ? 0.035 : 0.16 + (pulse - 0.9) * 0.9;
    atmosphere.material.opacity = calm ? 0.015 : busy ? 0.11 : 0.07;
    sunLight.intensity = calm ? 0.5 : busy ? 4.4 : 3.2;
    renderer.render(scene, camera);
    if (!eyeSpy.hidden && now - eyeClock >= 150) {
      eyeClock = now;
      const world = worldObjects.find(item => item.entry.key === selectedKey);
      if (world?.math) {
        eyeMath.textContent = formatAgentMath({ ...world.math, coherence: order });
        if (eyeContext && !previewFailed) {
          const center = world.body.getWorldPosition(new THREE.Vector3());
          const projected = center.clone().project(camera);
          if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) {
            eyeContext.clearRect(0, 0, 160, 160);
            eyeStatus.textContent = 'Selected agent is outside the camera view. Refocus it from the roster.';
          } else {
            const radius = world.body.geometry.parameters.radius * world.body.getWorldScale(new THREE.Vector3()).x;
            const pixels = radius / Math.max(center.distanceTo(camera.position), camera.near) * canvas.height / (2 * Math.tan(camera.fov * Math.PI / 360));
            const size = Math.min(canvas.width, canvas.height, Math.max(24, pixels * 4));
            const x = THREE.MathUtils.clamp((projected.x + 1) * canvas.width / 2 - size / 2, 0, canvas.width - size);
            const y = THREE.MathUtils.clamp((1 - projected.y) * canvas.height / 2 - size / 2, 0, canvas.height - size);
            try {
              eyeContext.drawImage(canvas, x, y, size, size, 0, 0, 160, 160);
              eyeStatus.textContent = reducedMotion.matches ? 'Live material preview · phase integration paused for reduced motion' : 'Live scene crop · actual agent material · updates while this graph is visible';
            } catch (error) {
              previewFailed = true;
              eyeStatus.textContent = `Live preview unavailable: ${error.message}. Simulation values remain visible.`;
            }
          }
        } else if (!eyeContext) eyeStatus.textContent = '2D preview is unavailable. Simulation values remain visible.';
      }
    }
    scheduleRender();
  }

  function scheduleRender() {
    if (!disposed && visible && active && !animationFrame) {
      animationFrame = requestAnimationFrame(render);
    }
  }

  const onVisibilityChange = () => {
    if (document.hidden) stopAgentMotif();
    visible = !document.hidden;
    previousTime = 0;
    if (!visible && animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    scheduleRender();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  scheduleRender();

  return {
    update,
    focus(key) { const entry = entities.find(item => item.key === key); if (entry) focusEntry(entry); },
    setLearningProfile,
    setActive(value) {
      active = Boolean(value);
      if (!active) stopAgentMotif();
      previousTime = 0;
      if (!active && animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      scheduleRender();
    },
    destroy() {
      if (learningStars) {
        learningStars.geometry.dispose();
        learningStars.material.dispose();
      }
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('visibilitychange', onGrowthResume);
      window.clearInterval(growthTimer);
      for (const orbit of orbitGroups) disposeObject(orbit.group, glowTexture);
      renderer.dispose();
      stopAgentMotif();
      window.removeEventListener('capsule-audio-state', syncSound);
      element.replaceChildren();
    },
  };
}

export function createActivityGraph(element, options) {
  if (!element) throw new TypeError('An activity graph host element is required.');
  const engine = createEngine(element, options);
  return {
    update: (...args) => engine?.update(...args),
    focus: key => engine?.focus(key),
    setLearningProfile: (profile) => engine?.setLearningProfile(profile),
    setActive: (active) => engine?.setActive(active),
    destroy: () => engine?.destroy(),
  };
}
