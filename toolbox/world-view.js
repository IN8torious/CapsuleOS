import { mountVoxelBoard } from './voxel-board.js';
import { buildStationDistrict, WORLD_STATIONS } from '../app/world-hub.js';

export function mountWorld(root) {
  root.innerHTML = `
    <div class="page-heading"><div><div class="eyebrow">CAPSULE / CREATOR WORKSPACE</div>
      <h1>Voxel Globe<span class="heading-period">.</span></h1>
      <p>A finely detailed voxel planet with soft shadows and ambient-occlusion lighting. Drag to orbit its oceans, continents and polar caps. Build, erase terrain and Undo.</p></div></div>
    <div class="world-board glass-bezel" aria-label="Capsule voxel creator world"></div>
    <article class="panel glass-bezel world-inspector" hidden>
      <h2 data-world-title></h2><p data-world-description></p>
      <button class="button secondary" type="button" data-world-open>OPEN WORKSPACE</button>
    </article>
    <p class="inline-status" data-world-status role="status">No structures are added automatically. World edits are session-only; Deploy saves creations separately.</p>`;
  const $ = selector => root.querySelector(selector);
  let destination = null;
  const inspectBuilding = building => {
    $('.world-inspector').hidden = false;
    $('[data-world-title]').textContent = building.label;
    $('[data-world-description]').textContent = building.detail;
    destination = WORLD_STATIONS.some(station => station.route === building.route) ? building.route : 'mod-forge';
    $('[data-world-open]').textContent = building.route ? `OPEN ${building.label.toUpperCase()}` : 'REVIEW PACKAGE FINDINGS';
  };
  const board = mountVoxelBoard($('.world-board'), {
    onInspect: inspectBuilding,
    structureOptions: WORLD_STATIONS,
    onAddStructure: (route, seed) => showDistrict(buildStationDistrict(route, seed)),
    onAddDistrict: consumeDistrict
  });
  $('[data-world-open]').addEventListener('click', () => {
    if (destination) window.dispatchEvent(new CustomEvent('capsule-navigate', { detail: destination }));
  });
  function showDistrict(district) {
    const placed = board.placeDistrict(district);
    if (!placed) throw new Error('No structure blocks could be placed. Free space or create another world, then try again.');
    $('[data-world-status]').textContent = `${district.name}: ${placed} blocks placed by your request. Select Inspect to examine a building. Session-only world.`;
  }
  function consumeDistrict() {
    try {
      const raw = sessionStorage.getItem('capsule-district-pending');
      if (!raw) throw new Error('Review a package in Mod Forge and choose Prepare district first.');
      showDistrict(JSON.parse(raw));
      sessionStorage.removeItem('capsule-district-pending');
    } catch (error) { $('[data-world-status]').textContent = `District not consumed: ${error.message}`; }
  }
  // Loading an old queued district is also an explicit dock action, never a startup side effect.
  const districtReady = () => {
    $('[data-world-status]').textContent = 'A package district is ready. Choose Add reviewed package district in the Build dock to place it.';
  };
  window.addEventListener('capsule:district', districtReady);
  const syncVisibility = () => {
    if (root.classList.contains('active') && !document.hidden) board.resume();
    else board.pause();
  };
  window.addEventListener('capsule-view', syncVisibility);
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
  return () => {
    board.pause();
    window.removeEventListener('capsule:district', districtReady);
    window.removeEventListener('capsule-view', syncVisibility);
    document.removeEventListener('visibilitychange', syncVisibility);
  };
}
