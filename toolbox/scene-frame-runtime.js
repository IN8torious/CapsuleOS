(async () => {
  const report = (state, message) => parent.postMessage({ type: 'capsule-scene-status', state, message: String(message).slice(0, 600) }, '*');
  const applyStyle = css => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  };
  applyStyle('html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0b0b12;color:#eee}canvas{display:block}#scene-root{width:100%;height:100%}');
  // The srcdoc's opaque origin has no native capability; also remove direct host/network interfaces.
  for (const key of ['chrome', 'external', 'webkit', 'require', 'process', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'Worker', 'SharedWorker', 'WebSocket', 'WebTransport', 'XMLHttpRequest']) {
    try {
      Object.defineProperty(window, key, { value: undefined, writable: false, configurable: false });
    } catch {
      report('error', `This WebView cannot isolate ${key}. The scene was not executed.`);
      return;
    }
  }
  window.addEventListener('error', event => report('error', event.message));
  window.addEventListener('unhandledrejection', event => report('error', event.reason?.message || event.reason));
  document.addEventListener('securitypolicyviolation', event => report('error', `Blocked ${event.violatedDirective}: ${event.blockedURI || 'inline content'}. Only selected assets and bundled libraries are available.`));
  let started = false;
  window.addEventListener('message', async event => {
    if (event.source !== parent || started || event.data?.type !== 'capsule-scene-project') return;
    started = true;
    try {
      const { source, assets, libraries } = event.data;
      const blob = (text, type = 'text/javascript') => URL.createObjectURL(new Blob([text], { type }));
      const files = new Map(assets.map(file => [file.name, blob(file.bytes, file.type)]));
      const aliases = new Map();
      const threeUrl = blob(libraries.three);
      aliases.set('three', threeUrl);
      const substitute = code => code.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])([^'"]+)\2/g, (match, prefix, quote, specifier) => {
        const mapped = library(specifier);
        return mapped ? prefix + JSON.stringify(mapped) : match;
      });
      function library(name) {
        if (aliases.has(name)) return aliases.get(name);
        if (/^https:\/\/(?:unpkg\.com\/three(?:@[\d.]+)?|cdn\.jsdelivr\.net\/npm\/three(?:@[\d.]+)?)\/build\/three(?:\.module)?(?:\.min)?\.js$/.test(name) ||
            /^https:\/\/esm\.sh\/three(?:@[\d.]+)?$/.test(name)) return threeUrl;
        const addon = /(?:^three\/(?:addons|examples\/jsm)\/|^https:\/\/(?:unpkg\.com\/three(?:@[\d.]+)?|cdn\.jsdelivr\.net\/npm\/three(?:@[\d.]+)?)\/examples\/jsm\/)(.*)$/.exec(name);
        return addon ? aliases.get(`three/addons/${addon[1]}`) : null;
      }
      const buffers = blob(substitute(libraries.buffers));
      aliases.set('../utils/BufferGeometryUtils.js', buffers);
      aliases.set('three/addons/utils/BufferGeometryUtils.js', buffers);
      const orbit = blob(substitute(libraries.orbit));
      const gltf = blob(substitute(libraries.gltf));
      aliases.set('three/addons/controls/OrbitControls.js', orbit);
      aliases.set('three/examples/jsm/controls/OrbitControls.js', orbit);
      aliases.set('three/addons/loaders/GLTFLoader.js', gltf);
      aliases.set('three/examples/jsm/loaders/GLTFLoader.js', gltf);
      const [three, controls, loaders] = await Promise.all([import(threeUrl), import(orbit), import(gltf)]);
      function resolveAsset(value) {
        if (value.startsWith('data:') || [...files.values()].includes(value)) return value;
        const path = decodeURIComponent(value.split(/[?#]/)[0]).replace(/\\/g, '/').replace(/^\.\//, '');
        if (files.has(path)) return files.get(path);
        const matches = [...files].filter(([name]) => name.split('/').at(-1) === path.split('/').at(-1));
        if (matches.length === 1) return matches[0][1];
        if (!matches.length && value.startsWith('blob:')) return value;
        throw new Error(`Select the local asset "${path}". Remote, missing or ambiguous files are not loaded.`);
      }
      three.DefaultLoadingManager.setURLModifier(resolveAsset);
      Object.defineProperty(window, 'THREE', { value: Object.freeze({ ...three, OrbitControls: controls.OrbitControls, GLTFLoader: loaders.GLTFLoader }) });
      Object.defineProperty(window, 'OrbitControls', { value: controls.OrbitControls });
      Object.defineProperty(window, 'GLTFLoader', { value: loaders.GLTFLoader });
      Object.defineProperty(window, 'CapsuleScene', { value: Object.freeze({
        assets: Object.freeze([...files.keys()]), asset: resolveAsset,
        loadModel: name => {
          const url = resolveAsset(name);
          const selected = [...files].find(([, value]) => value === url)?.[0] || '';
          const directory = selected.slice(0, selected.lastIndexOf('/') + 1);
          return new loaders.GLTFLoader().setResourcePath(directory || './').loadAsync(url);
        }
      }) });
      // The template's inert document prevents CSP violations while parsing styles for CSSOM adoption.
      const template = document.createElement('template');
      const parsed = template.content.ownerDocument.createElement('html');
      parsed.innerHTML = source;
      const scripts = [...parsed.querySelectorAll('script')].filter(script => !script.type || ['module', 'text/javascript', 'application/javascript'].includes(script.type));
      for (const script of scripts) {
        if (script.src && !library(script.getAttribute('src'))) throw new Error(`External script not bundled: ${script.getAttribute('src')}. Inline your own scene code; only the supplied Three.js libraries are available.`);
        script.remove();
      }
      parsed.querySelectorAll('iframe,frame,frameset,object,embed,base,meta,link,script[type="importmap"]').forEach(element => element.remove());
      for (const element of parsed.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
        for (const attribute of ['src', 'poster']) {
          if (element.hasAttribute(attribute) && !element.getAttribute(attribute).startsWith('data:')) element.setAttribute(attribute, resolveAsset(element.getAttribute(attribute)));
        }
        element.removeAttribute('srcset');
      }
      for (const style of parsed.querySelectorAll('style')) {
        applyStyle(style.textContent);
        style.remove();
      }
      const body = parsed.querySelector('body');
      document.body.className = body.className;
      document.body.style.cssText = body.style.cssText;
      document.querySelector('#scene-root').replaceChildren(...body.childNodes);
      for (const script of scripts) {
        if (script.src) continue;
        await new Promise((resolve, reject) => {
          const executable = document.createElement('script');
          if (script.type === 'module') executable.type = 'module';
          executable.src = blob(substitute(script.textContent));
          executable.onload = resolve;
          executable.onerror = () => reject(new Error('Scene script failed. Check the source and supported offline imports.'));
          document.body.append(executable);
        });
      }
      window.dispatchEvent(new Event('resize'));
      report('ready', 'Isolated scene running. Only selected assets and the bundled Three.js runtime are available.');
    } catch (error) { report('error', error.message || error); }
  });
  report('waiting', 'Isolated preview ready for the selected project.');
})();
