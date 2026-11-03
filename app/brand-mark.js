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
  function frame(now) {
    if (!still && !document.hidden) {
      group.rotation.y += (now - last) * 0.0006;
      core.rotation.x -= (now - last) * 0.0009;
    }
    last = now;
    renderer.render(scene, camera);
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  host.querySelector('svg')?.setAttribute('hidden', '');
  host.append(canvas);
}
