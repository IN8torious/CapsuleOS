import { invoke } from './bridge.js';
import { mountHtmlComponents } from './html-components-view.js';
import { includedModelCatalog } from './model-catalog.js';
import { applyHtmlEdit, htmlEditInstructions, MAX_AI_HTML_CHARS, MAX_HTML_BYTES } from '../app/scene-html-edit.js';
import three from 'three?raw';
import orbit from 'three/addons/controls/OrbitControls.js?raw';
import gltf from 'three/addons/loaders/GLTFLoader.js?raw';
import buffers from 'three/addons/utils/BufferGeometryUtils.js?raw';
import frameDocument from './scene-frame.html?raw';

const libraries = { three, orbit, gltf, buffers };
const extensions = new Set(['glb', 'gltf', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg']);
const starter = model => `<!doctype html>
<html><head><meta charset="utf-8"><title>Capsule model scene</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#101018}canvas{display:block}</style></head>
<body><script>
(async () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(4, 3, 5);
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(innerWidth, innerHeight);
  document.body.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 5, 4); scene.add(light);
  const object = ${model ? `(await CapsuleScene.loadModel(${JSON.stringify(model).replace(/</g, '\\u003c')})).scene` : 'new THREE.Mesh(new THREE.TorusKnotGeometry(1, .3, 96, 12), new THREE.MeshStandardMaterial({color:0xdb657b, roughness:.35, metalness:.3}))'};
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 3 / Math.max(size.x, size.y, size.z, .001);
  object.position.sub(center); object.scale.multiplyScalar(scale); object.position.multiplyScalar(scale);
  scene.add(object);
  addEventListener('resize', () => { camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
  function frame(){ requestAnimationFrame(frame); controls.update(); renderer.render(scene,camera); }
  frame();
})();
</script></body></html>`;

export function mountHtmlStudio(root, invokeCommand = invoke) {
  root.innerHTML = `
    <article class="panel glass-bezel html-scene-toolbar">
      <div class="scene-actions"><button type="button" data-html-open>Open HTML</button><button type="button" data-html-run>Run isolated scene</button><button type="button" data-html-stop>Stop</button><button type="button" data-html-save>Save HTML copy</button></div>
      <input type="file" data-html-file accept=".html,.htm,text/html" hidden><input type="file" data-asset-files multiple accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg" hidden><input type="file" data-asset-folder webkitdirectory multiple hidden>
      <p>Opening HTML never runs it. Run starts an isolated preview without host tools or network access; scripts can still consume CPU. Stop or leave this tab to end execution.</p>
      <details><summary>3D assets &amp; starter viewer</summary>
      <div class="scene-actions"><button type="button" data-assets-open>Add model assets</button><button type="button" data-folder-open>Asset folder</button><button type="button" data-html-starter>New viewer</button></div>
      <p data-assets-status>No model assets selected. GLB is the simplest format; glTF needs its referenced buffers and textures. Maximum 128 files, 32 MiB each, 64 MiB total.</p>
      </details>
      <p data-html-status role="status" aria-live="polite">Start with the included viewer or open an HTML file. Originals are never overwritten automatically.</p>
    </article>
    <div class="html-scene-layout"><article class="panel glass-bezel html-scene-source">
      <label>HTML source <textarea data-html-source spellcheck="false" aria-label="HTML scene source"></textarea></label>
      <details><summary>Supported HTML &amp; model APIs</summary><small>Offline Three.js r160, OrbitControls and GLTFLoader are provided. Use CapsuleScene.loadModel(name) or CapsuleScene.asset(name). Known Three.js imports are mapped locally; other external libraries, nested frames and inline event attributes are not supported.</small></details>
    </article><div class="html-scene-preview glass-bezel" data-html-preview><p>Preview stopped. Review the source, then choose Run isolated scene.</p></div></div>
    <article class="panel glass-bezel" data-html-components></article>
    <details class="panel glass-bezel html-scene-ai">
      <summary>Edit HTML with local AI</summary>
      <div class="scene-actions"><button type="button" data-html-model-settings>Model settings</button></div>
      <div class="scene-actions"><select data-html-model aria-label="Approved local scene model"></select><button type="button" data-html-load-model>Load selected model</button></div>
      <label>Your edit <textarea data-html-goal rows="2" maxlength="600" placeholder="Describe the change to this HTML scene" aria-label="HTML editing goal"></textarea></label>
      <div class="scene-actions"><button type="button" data-html-ask>Draft with local model</button><button type="button" data-html-copy>Copy instructions for any AI</button></div>
      <p>Uses the Toolbox's bundled runtime and an approved ONNX model. Source stays local; the model has no file or tool access. Full-source editing is limited to 8,000 characters, never silently truncated.</p>
      <details><summary>Paste an edit from another AI</summary><textarea data-html-reply rows="5" spellcheck="false" aria-label="HTML edit JSON reply"></textarea><button type="button" data-html-review>Review pasted edit</button></details>
      <div data-html-diff hidden></div><div class="scene-actions"><button type="button" data-html-accept hidden>Accept edits into draft</button><button type="button" data-html-reject hidden>Reject</button><button type="button" data-html-undo>Undo HTML edit</button></div>
    </details>`;
  const $ = selector => root.querySelector(selector);
  const source = $('[data-html-source]'), status = $('[data-html-status]'), preview = $('[data-html-preview]');
  source.value = starter();
  let sourceName = 'scene-draft.html';
  const componentView = mountHtmlComponents($('[data-html-components]'), {
    getSource: () => ({ source: source.value, name: sourceName }), invokeCommand
  });
  componentView.refresh();
  let assets = [], frame = null, pending = null, busy = false, assetsRequest = 0, sent = false, previewTimer;
  const history = [];
  const message = (value, error = false) => { status.textContent = value; status.dataset.error = String(error); };
  function stop() {
    clearTimeout(previewTimer);
    frame?.remove();
    frame = null;
    root.dataset.previewState = 'stopped';
    preview.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Preview stopped. Choose Run isolated scene to resume.' }));
  }
  function clearProposal() {
    pending = null;
    $('[data-html-diff]').replaceChildren();
    $('[data-html-diff]').hidden = $('[data-html-accept]').hidden = $('[data-html-reject]').hidden = true;
  }
  function remember() { history.push(source.value); if (history.length > 30) history.shift(); }
  function replaceSource(value) { remember(); source.value = value; componentView.invalidate(); clearProposal(); stop(); }
  source.addEventListener('input', () => { componentView.invalidate(); clearProposal(); stop(); });
  $('[data-html-starter]').addEventListener('click', () => {
    if (source.value !== starter() && !window.confirm('Replace the current HTML draft with a model viewer? Undo is available.')) return;
    replaceSource(starter(assets.find(asset => /\.(glb|gltf)$/i.test(asset.name))?.name));
    message('Viewer draft created. Select Run to preview it.');
  });
  $('[data-html-undo]').addEventListener('click', () => {
    if (!history.length) return message('No accepted or replaced HTML draft to undo.');
    source.value = history.pop(); componentView.invalidate(); clearProposal(); stop(); message('Previous HTML draft restored. Nothing was written to disk.');
  });
  $('[data-html-open]').addEventListener('click', () => $('[data-html-file]').click());
  $('[data-html-file]').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_HTML_BYTES) throw new Error('HTML scenes must be at most 256 KiB.');
      if (file.name.length > 120 || /[\\/\x00-\x1f]/.test(file.name)) throw new Error('Use an HTML filename of at most 120 characters without control characters.');
      const before = source.value, text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (source.value !== before) throw new Error('The draft changed while opening the file. Open it again when ready.');
      if (!window.confirm(`Load "${file.name}" into the HTML editor? The current draft remains available through Undo; nothing will execute yet.`)) return;
      sourceName = file.name;
      replaceSource(text); message(`Loaded ${file.name}. Edit, deconstruct or review it here; nothing runs until you choose Run isolated scene.`);
    } catch (error) { message(error.message, true); }
  });
  for (const [button, input] of [['data-assets-open', 'data-asset-files'], ['data-folder-open', 'data-asset-folder']]) $(`[${button}]`).addEventListener('click', () => $(`[${input}]`).click());
  async function selectAssets(event) {
    const files = [...event.target.files]; event.target.value = '';
    const request = ++assetsRequest;
    try {
      const selected = files.filter(file => extensions.has(file.name.split('.').at(-1).toLowerCase()));
      if (!selected.length) throw new Error('Choose GLB/glTF model files, buffers or supported image textures.');
      if (selected.length > 128 || selected.some(file => file.size > 32 * 1024 * 1024) ||
          selected.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) throw new Error('Asset selection exceeds the 128-file, 32-MiB-per-file or 64-MiB-total limit.');
      const next = await Promise.all(selected.map(async file => ({ name: file.webkitRelativePath || file.name, type: file.type || 'application/octet-stream', bytes: await file.arrayBuffer() })));
      if (request !== assetsRequest) return;
      if (new Set(next.map(file => file.name)).size !== next.length) throw new Error('Asset names must be unique.');
      assets = next; clearProposal(); stop();
      $('[data-assets-status]').textContent = `${assets.length} selected assets: ${assets.map(asset => asset.name).join(', ')}. Add model assets replaces this selection.`;
      message('Assets are held in memory only. New viewer builds an HTML scene around the first selected GLB/glTF model.');
    } catch (error) { message(error.message, true); }
  }
  $('[data-asset-files]').addEventListener('change', selectAssets);
  $('[data-asset-folder]').addEventListener('change', selectAssets);
  $('[data-html-run]').addEventListener('click', () => {
    stop();
    sent = false;
    if (new TextEncoder().encode(source.value).length > MAX_HTML_BYTES) return message('HTML exceeds 256 KiB. Preview was not started.', true);
    frame = document.createElement('iframe');
    frame.title = 'Isolated HTML scene preview';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; hid 'none'; payment 'none'");
    frame.referrerPolicy = 'no-referrer';
    frame.srcdoc = frameDocument;
    preview.replaceChildren(frame);
    root.dataset.previewState = 'loading';
    message('Starting the isolated scene. No original file will be changed.');
    previewTimer = setTimeout(() => { stop(); root.dataset.previewState = 'error'; message('The isolated preview did not start within 30 seconds. Check the source and selected assets, then retry.', true); }, 30000);
  });
  const onMessage = event => {
    if (!frame || event.source !== frame.contentWindow || event.data?.type !== 'capsule-scene-status') return;
    if (event.data.state === 'waiting' && !sent) {
      sent = true;
      const selected = assets.map(asset => ({ ...asset, bytes: asset.bytes.slice(0) }));
      frame.contentWindow.postMessage({ type: 'capsule-scene-project', source: source.value, assets: selected, libraries }, '*', selected.map(asset => asset.bytes));
    } else if (['ready', 'error'].includes(event.data.state) && typeof event.data.message === 'string') {
      clearTimeout(previewTimer);
      if (event.data.state === 'error') stop();
      root.dataset.previewState = event.data.state;
      message(event.data.message.slice(0, 600), event.data.state === 'error');
    }
  };
  window.addEventListener('message', onMessage);
  $('[data-html-stop]').addEventListener('click', () => { stop(); message('Scene stopped. The HTML draft and selected assets remain in memory.'); });
  const onView = event => { if (event.detail !== 'scene-studio') stop(); };
  const onMode = event => { if (!event.detail) stop(); };
  window.addEventListener('capsule-view', onView);
  root.addEventListener('capsule-scene-mode', onMode);
  const onVisibility = () => { if (document.hidden) stop(); };
  document.addEventListener('visibilitychange', onVisibility);
  $('[data-html-save]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([source.value], { type: 'text/html' }));
    const link = document.createElement('a'); link.href = url; link.download = 'capsule-scene.html'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('HTML copy exported for Capsule Scene Studio. Keep model assets with it. Opening HTML outside Capsule does not provide this sandbox or its bundled runtime.');
  });
  function review(output, original) {
    if (source.value !== original) throw new Error('The source changed while drafting. Request a fresh edit; nothing was applied.');
    const edit = applyHtmlEdit(original, output);
    pending = { ...edit, original };
    const diff = $('[data-html-diff]'); diff.replaceChildren(); diff.hidden = false;
    const summary = document.createElement('p'); summary.textContent = edit.summary; diff.append(summary);
    for (const item of edit.edits) {
      const before = document.createElement('pre'), after = document.createElement('pre');
      before.textContent = `REMOVE:\n${item.find}`; after.textContent = `REPLACE WITH:\n${item.replace}`; diff.append(before, after);
    }
    $('[data-html-accept]').hidden = $('[data-html-reject]').hidden = false;
    message('Review every replacement. Accept changes only the draft; Run and Save remain separate decisions.');
  }
  $('[data-html-review]').addEventListener('click', () => {
    clearProposal();
    try { review($('[data-html-reply]').value, source.value); } catch (error) { message(error.message, true); }
  });
  $('[data-html-accept]').addEventListener('click', () => {
    if (!pending) return;
    if (source.value !== pending.original) { clearProposal(); return message('Source changed; review a fresh edit.', true); }
    const next = pending.html; replaceSource(next); message('Reviewed edits accepted into the HTML draft. Preview is stopped; save a copy when ready.');
  });
  $('[data-html-reject]').addEventListener('click', () => { clearProposal(); message('Edit rejected. The source and disk files are unchanged.'); });
  const modelSelect = $('[data-html-model]');
  for (const model of includedModelCatalog()) {
    const option = document.createElement('option'); option.value = model.id; option.textContent = model.name; modelSelect.append(option);
  }
  $('[data-html-model-settings]').addEventListener('click', () => document.querySelector('[data-shortcut-view="settings"]').click());
  async function runAI(action) {
    if (busy) return;
    busy = true;
    const buttons = [$('[data-html-ask]'), $('[data-html-load-model]')];
    buttons.forEach(button => { button.disabled = true; });
    try { await action(); } catch (error) { message(typeof error === 'string' ? error : error.message, true); }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); }
  }
  $('[data-html-load-model]').addEventListener('click', () => void runAI(async () => {
    message('Loading the approved offline model through the bundled Toolbox runtime. File verification and CPU initialization can take time.');
    const modelId = modelSelect.value;
    const result = await invokeCommand('load_assistant_model', { modelId });
    if (!result.ok) throw new Error(result.message || 'The selected model could not be loaded.');
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const { status: actual } = await invokeCommand('get_assistant_status');
      if (actual?.state === 'model-error') throw new Error(actual.message || 'Model initialization failed.');
      if (actual?.modelReady && actual.modelId === modelId) {
        message(`Approved local model ready (${actual.runtime?.backend === 'wsl2' ? 'WSL2' : 'Windows'}). Describe an HTML edit to draft.`);
        return;
      }
      if (actual?.modelId && actual.modelId !== modelId) throw new Error('Another model replaced this load. Check Model settings.');
      message(actual?.runtime?.message || 'Model initialization is still in progress.');
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    throw new Error('Model readiness was not confirmed within 150 seconds. Check Model settings; use Unload to stop it before retrying.');
  }));
  $('[data-html-ask]').addEventListener('click', () => void runAI(async () => {
    clearProposal();
    const original = source.value, goal = $('[data-html-goal]').value.trim();
    if (!goal || original.length > MAX_AI_HTML_CHARS) throw new Error('Provide an edit goal and HTML of at most 8,000 characters. Larger sources are never truncated.');
    message('The local ONNX model is drafting exact HTML edits. No source or disk file has changed.');
    const result = await invokeCommand('propose_scene_html_edit', { source: original, goal });
    if (!result.ok) throw new Error(result.message || 'Local HTML editing failed.');
    review(JSON.stringify(result.proposal), original);
  }));
  $('[data-html-copy]').addEventListener('click', async () => {
    try {
      if (source.value.length > MAX_AI_HTML_CHARS) throw new Error('Any-AI edit instructions are limited to 8,000 source characters; no source is truncated.');
      await navigator.clipboard.writeText(htmlEditInstructions(source.value, $('[data-html-goal]').value));
      message('Instructions copied for your chosen AI. Sharing them is your decision; pasted edits still require review.');
    } catch (error) { message(`Could not copy instructions: ${error.message}`, true); }
  });
  return () => { stop(); window.removeEventListener('message', onMessage); window.removeEventListener('capsule-view', onView); document.removeEventListener('visibilitychange', onVisibility); root.removeEventListener('capsule-scene-mode', onMode); };
}
