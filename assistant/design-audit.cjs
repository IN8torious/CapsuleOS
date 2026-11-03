const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { PAGES, VIEWPORTS, BIBLE_STATES, DIRECTORY_STATES, requiredCaseIds, typographyChecks, summarize, gateEvidenceValid } = require('./design-audit-policy.cjs');
const { measureDesign } = require('./design-audit-browser.cjs');
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'toolbox');
const REPORT = path.join(DIST, 'design-audit.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => createHash('sha256').update(value).digest('hex');

async function treeFingerprint(directory, ignoreReport = false) {
  const hash = createHash('sha256');
  async function visit(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(dir, entry.name);
      if (ignoreReport && file === REPORT) continue;
      if (entry.isSymbolicLink()) throw new Error(`Audit refuses linked input: ${file}`);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) hash.update(path.relative(directory, file).split(path.sep).join('/')).update('\0').update(await fs.readFile(file)).update('\0');
    }
  }
  await visit(directory);
  return hash.digest('hex');
}
async function fingerprints() {
  return {
    frontend: await treeFingerprint(DIST, true),
    source: digest(`${await treeFingerprint(path.join(ROOT, 'toolbox'))}${await treeFingerprint(path.join(ROOT, 'app'))}`),
    policy: digest((await Promise.all(['design-audit.cjs', 'design-audit-policy.cjs', 'design-audit-browser.cjs'].map(file => fs.readFile(path.join(__dirname, file))))).map(buffer => digest(buffer)).join('')),
  };
}
async function newestSourceTime() {
  let newest = 0;
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) newest = Math.max(newest, (await fs.stat(file)).mtimeMs);
    }
  }
  await visit(path.join(ROOT, 'toolbox')); await visit(path.join(ROOT, 'app'));
  return newest;
}
async function assertDesignGate() {
  const report = JSON.parse(await fs.readFile(REPORT, 'utf8'));
  const live = await fingerprints();
  if (!gateEvidenceValid(report, live)) {
    throw new Error('Design coherence gate is missing, failed, incomplete or stale. Build the Toolbox then run npm run audit:design; inspect dist\\toolbox\\design-audit.json.');
  }
  return report;
}

class CDP {
  constructor(socket) {
    this.socket = socket; this.next = 0; this.pending = new Map(); this.events = () => {};
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id); clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
      } else this.events(message);
    });
    socket.addEventListener('close', () => {
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Audit browser disconnected')); }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('CDP connection timeout')); }, 8000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
    });
    return new CDP(socket);
  }
  call(method, params = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async wait(expression) {
    const deadline = Date.now() + 12000;
    do { if (await this.evaluate(expression)) return; await delay(100); } while (Date.now() < deadline);
    throw new Error(`Readiness timeout: ${expression}`);
  }
}

async function closeAuditBrowser(browser, cdp) {
  if (!browser) return;
  const exited = () => browser.exitCode !== null || browser.signalCode !== null;
  const wait = async milliseconds => {
    const deadline = Date.now() + milliseconds;
    while (!exited() && Date.now() < deadline) await delay(50);
    return exited();
  };
  if (!exited() && cdp) {
    try { await cdp.call('Browser.close', {}, 2000); } catch {}
  }
  if (!await wait(3000)) {
    if (!Number.isSafeInteger(browser.pid) || browser.pid <= 0) throw new Error('Invalid audit browser PID; cleanup refused');
    if (process.platform === 'win32') {
      await new Promise((resolve, reject) => {
        const killer = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${browser.pid} -Force -ErrorAction SilentlyContinue`], { stdio: 'ignore', windowsHide: true });
        const timer = setTimeout(() => { killer.kill(); reject(new Error('Exact-PID browser cleanup timed out')); }, 10000);
        killer.once('exit', () => { clearTimeout(timer); resolve(); });
        killer.once('error', error => { clearTimeout(timer); reject(error); });
      });
    } else browser.kill();
    if (!await wait(10000)) throw new Error(`Audit browser PID ${browser.pid} did not exit`);
  }
  cdp?.socket.close();
}

async function browserExecutable() {
  const candidates = [
    process.env.DESIGN_AUDIT_BROWSER,
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const file of candidates) { try { await fs.access(file); return file; } catch {} }
  throw new Error('Local Edge/Chromium not found; set DESIGN_AUDIT_BROWSER to its executable. Nothing is downloaded.');
}

async function runAudit({ theme = 'light' } = {}) {
  if (!['light', 'dark'].includes(theme)) throw new Error('Unsupported audit theme');
  const reportFile = theme === 'light' ? REPORT : path.join(ROOT, '.design-audit', 'dark-theme.json');
  const cases = [], extraChecks = [], requiredCases = requiredCaseIds();
  let browser, server, cdp, profile, watchdog, auditedInputs;
  const check = (name, pass, value, context = {}) => ({ check: name, selector: ':audit', pass, value, ...context });
  let context = {};
  const errors = [];
  try {
    await fs.access(path.join(DIST, 'index.html'));
    if (await newestSourceTime() > (await fs.stat(path.join(DIST, 'index.html'))).mtimeMs) {
      throw new Error('Frontend build predates source changes. Run npm run build:toolbox before auditing.');
    }
    const before = await fingerprints();
    auditedInputs = before;
    server = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url, 'http://127.0.0.1');
        const file = path.resolve(DIST, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(DIST + path.sep)) throw new Error('Outside frontend');
        const content = await fs.readFile(file);
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(content);
      } catch {
        // Chrome may request an optional favicon even though the app doesn't declare one.
        if (request.url !== '/favicon.ico') errors.push(`Missing asset: ${request.url}`);
        response.writeHead(request.url === '/favicon.ico' ? 204 : 404); response.end();
      }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const work = path.join(ROOT, '.design-audit');
    await fs.mkdir(work, { recursive: true });
    profile = await fs.mkdtemp(path.join(work, 'profile-'));
    browser = spawn(await browserExecutable(), ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-default-apps', '--disable-features=OptimizationHints,MediaRouter', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore', windowsHide: true });
    browser.on('error', error => errors.push(`Browser: ${error.message}`));
    // Hard upper bound even if a page never becomes ready.
    watchdog = setTimeout(() => {
      errors.push('Audit exceeded the 240-second run deadline');
      void closeAuditBrowser(browser, cdp).catch(error => errors.push(error.message));
    }, 240000);
    let port;
    const startupDeadline = Date.now() + 15000;
    while (!port && Date.now() < startupDeadline) {
      try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
      if (!port) await delay(100);
    }
    if (!port) throw new Error('Browser startup timeout');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    const target = targets.find(entry => entry.type === 'page');
    if (!target) throw new Error('No audit browser target');
    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    cdp.events = message => {
      if (message.method === 'Fetch.requestPaused') {
        const { requestId, request } = message.params;
        const local = request.url.startsWith(`${origin}/`) || /^(data:|blob:|about:)/.test(request.url);
        if (!local) errors.push(`Blocked external request: ${request.url}`);
        void cdp.call(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(error => errors.push(error.message));
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Network.loadingFailed' && !message.params.canceled) errors.push(`Asset load failed: ${message.params.errorText}`);
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push(`HTTP ${message.params.response.status}: ${message.params.response.url}`);
    };
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable'); await cdp.call('Network.enable');
    await cdp.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    for (const viewport of VIEWPORTS) {
      await cdp.call('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 600 });
      await cdp.call('Page.navigate', { url: origin });
      await cdp.wait(`document.readyState === 'complete' && document.documentElement.dataset.toolboxState === 'ready' && document.querySelectorAll('.workspace > .view').length === 20 && !!document.querySelector('.nav-item[data-view="bible"]')`);
      await cdp.evaluate(`(()=>{const select=document.querySelector('#toolbox-theme');select.value=${JSON.stringify(theme)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      extraChecks.push(check('requested-theme-active', await cdp.evaluate(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`), theme, { viewport }));
      const pageIds = await cdp.evaluate(`[...document.querySelectorAll('.workspace > .view')].map(e=>e.dataset.view).sort()`);
      extraChecks.push(check('exact-page-inventory', JSON.stringify(pageIds) === JSON.stringify([...PAGES].sort()), pageIds, { viewport }));
      for (const page of PAGES) {
        context = { page, viewport };
        await cdp.evaluate(`document.querySelector('.nav-item[data-view="${page}"]').click()`);
        const root = `document.querySelector('.workspace > .view[data-view="${page}"]')`;
        const lazy = ['bible', 'world', 'scene-studio', 'apps', 'playbook', 'internet', 'repair'].includes(page);
        await cdp.wait(`${root}?.classList.contains('active') && ${lazy ? `${root}.dataset.loadState === 'ready'` : `${root}.innerText.trim().length > 0`}`);
        if (page === 'windows') await cdp.wait(`document.querySelector('#windows-tweak-groups')?.dataset.loadState === 'ready'`);
        if (page === 'bible') await cdp.wait(`document.querySelector('[data-bible-books] button') && document.querySelector('[data-bible-votd-text]')?.textContent.trim().length > 0`);
        const states = page === 'bible' ? BIBLE_STATES : ['default'];
        for (const state of states) {
          context = { page, state, viewport };
          if (page === 'bible') await prepareBible(cdp, state);
          await cdp.evaluate(`document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))`);
          const measurement = await cdp.evaluate(`(${measureDesign.toString()})()`);
          const checks = measurement.geometry.map(item => ({ ...item, ...context }));
          const roles = {};
          for (const sample of measurement.samples) {
            roles[sample.role] = (roles[sample.role] || 0) + 1;
            checks.push(...typographyChecks(sample).map(item => ({ ...item, selector: sample.selector, role: sample.role, ...context })));
          }
          cases.push({ id: `${page}/${state}/${viewport.width}x${viewport.height}`, complete: true, textNodes: measurement.textNodes, samples: measurement.samples.length, roles, excluded: measurement.excluded, checks });
        }
      }
      for (const state of DIRECTORY_STATES) {
        context = { page: 'directory', state, viewport };
        await prepareDirectory(cdp, state);
        await cdp.evaluate(`document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))`);
        const measurement = await cdp.evaluate(`(${measureDesign.toString()})()`);
        const checks = measurement.geometry.map(item => ({ ...item, ...context }));
        checks.push(check('directory-caption-coverage', measurement.directoryCaptions === (state === 'open' ? PAGES.length : 1), measurement.directoryCaptions, context));
        const roles = {};
        for (const sample of measurement.samples) {
          roles[sample.role] = (roles[sample.role] || 0) + 1;
          checks.push(...typographyChecks(sample).map(item => ({ ...item, selector: sample.selector, role: sample.role, ...context })));
        }
        cases.push({ id: `directory/${state}/${viewport.width}x${viewport.height}`, complete: true, textNodes: measurement.textNodes, samples: measurement.samples.length, directoryCaptions: measurement.directoryCaptions, roles, excluded: measurement.excluded, checks });
      }
    }
    const after = await fingerprints();
    extraChecks.push(check('inputs-unchanged-during-audit', JSON.stringify(before) === JSON.stringify(after), after));
  } catch (error) {
    extraChecks.push(check('audit-execution', false, error.message, context));
  } finally {
    extraChecks.push(check('assets-and-runtime', errors.length === 0, errors.slice(0, 30)));
    if (watchdog) clearTimeout(watchdog);
    try { await closeAuditBrowser(browser, cdp); }
    catch (error) { extraChecks.push(check('browser-cleanup', false, error.message)); }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (profile) {
      try { await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
      catch (error) { extraChecks.push(check('private-profile-cleanup', false, error.message)); }
    }
  }
  const summary = summarize(requiredCases, cases, extraChecks);
  const report = {
    version: 1, agent: 'design_coherence_auditor', generatedAt: new Date().toISOString(), theme,
    scope: 'Rendered DOM typography and measurable geometry at the declared viewports/states; not universal UX, accessibility, native WebView, visual/canvas or all-data correctness.',
    browser: 'Local headless Chromium; private disposable profile; loopback-only app requests',
    requiredCases, fingerprints: auditedInputs, summary,
    coverage: cases.map(({ checks, ...entry }) => ({ ...entry, required: checks.length, passed: checks.filter(item => item.pass).length })),
  };
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(`Design audit (${theme}): ${summary.pass ? 'PASS' : 'FAIL'}; ${summary.passed}/${summary.required} checks, ${summary.score.toFixed(2)}%; ${cases.length}/${requiredCases.length} cases. Report: ${path.relative(ROOT, reportFile)}`);
  if (!summary.pass) process.exitCode = 1;
  return report;
}

async function prepareDirectory(cdp, state) {
  await cdp.evaluate(`(()=>{
    const directory=document.querySelector('#page-directory'), search=document.querySelector('#nav-search');
    if(!directory || !search) throw new Error('Missing Directory audit targets');
    if(directory.hidden) document.querySelector('#directory-toggle').click();
    search.value=''; search.dispatchEvent(new Event('input',{bubbles:true}));
    for(const group of directory.querySelectorAll('.nav-group')) group.open=true;
    if(${JSON.stringify(state)}==='caption-search') {
      const item=directory.querySelector('.nav-item[data-view="world"]');
      const query=item?.dataset.caption?.trim();
      if(!query || item.textContent.toLowerCase().includes(query.toLowerCase())) throw new Error('Caption-only search fixture is missing or also matches the title');
      search.value=query; search.dispatchEvent(new Event('input',{bubbles:true}));
    }
  })()`);
  await cdp.wait(`(()=>{
    const directory=document.querySelector('#page-directory');
    if(!directory || directory.hidden || !directory.checkVisibility({checkVisibilityCSS:true})) return false;
    const visible=[...directory.querySelectorAll('.nav-item')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
    return ${state === 'open' ? `visible.length===${PAGES.length}` : `visible.length===1 && visible[0].dataset.view==='world'`};
  })()`);
}

async function prepareBible(cdp, state) {
  const click = selector => cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing Bible audit target: '+${JSON.stringify(selector)});e.click()})()`);
  const pane = name => cdp.wait(`(()=>{const e=document.querySelector('[data-bible-pane="${name}"]');return !!e && !e.hidden && e.checkVisibility({checkVisibilityCSS:true}) && e.innerText.trim().length>0})()`);
  if (['home', 'books', 'saved', 'search'].includes(state)) { await click(`[data-bible-tab="${state}"]`); await pane(state); }
  if (state === 'chapters') { await click('[data-bible-books] button'); await pane('chapters'); }
  if (state === 'read') { await click('[data-bible-chapters] button'); await pane('read'); await cdp.wait(`document.querySelectorAll('.bible-verse').length > 0`); }
  if (state === 'selection') { await click('.bible-verse'); await cdp.wait(`!document.querySelector('[data-bible-selection]').hidden`); }
  if (state === 'reader-options') { await click('[data-bible-done]'); await cdp.evaluate(`document.querySelector('.bible-go-to').open=true`); }
  if (state === 'prayer') { await click('[data-bible-open-prayer]'); await pane('prayer'); }
  if (state === 'search-results') {
    await cdp.evaluate(`document.querySelector('#bible-query').value='John 3:16';document.querySelector('.bible-search').requestSubmit()`);
    await cdp.wait(`document.querySelector('[data-bible-results] button')?.textContent.length > 0`);
  }
  if (state === 'principles') {
    await click('[data-bible-tab="home"]'); await pane('home');
    await cdp.evaluate(`document.querySelector('.bible-principles').open=true`);
    await cdp.wait(`document.querySelector('[data-bible-principles]')?.textContent.trim().length > 0`);
  }
}
if (require.main === module) {
  const operation = process.argv.includes('--verify') ? assertDesignGate : () => runAudit({ theme: process.argv.includes('--dark') ? 'dark' : 'light' });
  operation().catch(error => { console.error(`Design audit failed: ${error.message}`); process.exitCode = 1; });
}
module.exports = { assertDesignGate, runAudit, fingerprints, treeFingerprint, CDP, closeAuditBrowser, prepareDirectory };
