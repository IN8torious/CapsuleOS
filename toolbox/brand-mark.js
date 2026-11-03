import * as THREE from 'three';

export function mountBrandMark(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'brand-3d';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(40, 40, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  camera.position.set(0, 0, 4.2);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xff8a99, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6a7cff, 0.9);
  rim.position.set(-3, -2, -2);
  scene.add(rim);

  const geometry = new THREE.IcosahedronGeometry(1.25, 0);
  const solid = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xe72a43, flatShading: true, roughness: 0.35, metalness: 0.25 })
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xffd3d9, transparent: true, opacity: 0.75 })
  );
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x40131f, flatShading: true, emissive: 0xff5465, emissiveIntensity: 0.55 })
  );
  const group = new THREE.Group();
  group.add(solid, edges, core);
  group.rotation.set(0.5, 0.4, 0);
  scene.add(group);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  let boost = 0;
  let tiltX = 0;
  let tiltY = 0;
  const link = host.closest('a, button') || host;
  link.addEventListener('pointerenter', () => { boost = 1; });
  link.addEventListener('pointerleave', () => { boost = 0; tiltX = 0; tiltY = 0; });
  link.addEventListener('pointermove', (event) => {
    const r = host.getBoundingClientRect();
    tiltY = ((event.clientX - r.left) / r.width - 0.5) * 1.2;
    tiltX = ((event.clientY - r.top) / r.height - 0.5) * 1.2;
  });
  link.addEventListener('pointerdown', () => { group.scale.setScalar(0.85); });
  link.addEventListener('pointerup', () => { group.scale.setScalar(1); });
  function frame(now) {
    const dt = now - last;
    if (!still && !document.hidden) {
      group.rotation.y += dt * (0.0006 + boost * 0.004);
      core.rotation.x -= dt * (0.0009 + boost * 0.005);
      group.rotation.x += (0.5 + tiltX - group.rotation.x) * 0.08;
      group.scale.setScalar(group.scale.x + ((boost ? 1.12 : 1) - group.scale.x) * 0.12);
    }
    last = now;
    renderer.render(scene, camera);
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  host.querySelector('svg')?.setAttribute('hidden', '');
  host.append(canvas);
}
