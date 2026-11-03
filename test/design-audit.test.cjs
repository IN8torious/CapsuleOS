const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PAGES, VIEWPORTS, BIBLE_STATES, DIRECTORY_STATES, requiredCaseIds, typographyChecks, summarize, gateEvidenceValid } = require('../assistant/design-audit-policy.cjs');
const { measureDesign } = require('../assistant/design-audit-browser.cjs');
const { CDP, treeFingerprint, closeAuditBrowser, prepareDirectory } = require('../assistant/design-audit.cjs');
const root = path.resolve(__dirname, '..');
const sample = overrides => ({ role: 'prose', fontSize: 13, letterSpacing: 'normal', fontStretch: '100%', fontFamily: '"Segoe UI", sans-serif', ...overrides });

test('named typography roles reject condensed fonts and excessive spacing without flattening scripture', () => {
  assert.ok(typographyChecks(sample()).every(check => check.pass));
  assert.equal(typographyChecks(sample({ fontStretch: 'semi-condensed' }))[0].pass, false);
  assert.equal(typographyChecks(sample({ fontStretch: '75%' }))[0].pass, false);
  assert.equal(typographyChecks(sample({ letterSpacing: '1.3px' }))[1].pass, false);
  assert.equal(typographyChecks(sample({ role: 'heading', fontSize: 32, letterSpacing: '-0.8px' }))[1].pass, true);
  assert.equal(typographyChecks(sample({ role: 'control', letterSpacing: '-1px' }))[1].pass, false);
  assert.equal(typographyChecks(sample({ role: 'metadata', letterSpacing: '2.34px' }))[1].pass, true);
  assert.equal(typographyChecks(sample({ role: 'metadata', letterSpacing: '4px' }))[1].pass, false);
  assert.equal(typographyChecks(sample({ letterSpacing: 'NaN' }))[1].pass, false);
  assert.ok(typographyChecks(sample({ role: 'scripture', fontFamily: 'Georgia, serif' })).every(check => check.pass));
  assert.equal(typographyChecks(sample({ role: 'scripture' })).at(-1).pass, false);
  assert.equal(typographyChecks(sample({ bibleUI: true, fontFamily: 'Georgia, serif' })).at(-1).pass, false);
  assert.throws(() => typographyChecks(sample({ role: 'anything' })), /Unknown typography role/);
});

test('100% requires every required case and check; missing, duplicate and failed evidence fail', () => {
  const entry = { id: 'one', complete: true, textNodes: 1, checks: [{ check: 'computed', pass: true }] };
  assert.equal(summarize(['one'], [entry]).score, 100);
  assert.equal(summarize(['one'], [entry]).pass, true);
  const missing = summarize(['one', 'two'], [entry]);
  assert.equal(missing.pass, false); assert.equal(missing.complete, false);
  assert.equal(missing.passed, 2); assert.equal(missing.required, 3);
  assert.equal(summarize(['one'], [entry, entry]).pass, false);
  assert.equal(summarize(['one'], [{ ...entry, textNodes: 0 }]).pass, false);
  assert.equal(summarize(['one'], [{ ...entry, complete: false }]).pass, false);
  const failed = summarize(['one'], [entry], Array.from({ length: 300 }, () => ({ pass: false })));
  assert.equal(failed.violations.length, 250);
  assert.equal(failed.violationCount, 300);
  assert.equal(failed.pass, false);
});

test('inventory covers twenty real pages and meaningful Bible states at desktop and mobile', () => {
  assert.equal(PAGES.length, 20); assert.equal(new Set(PAGES).size, 20);
  assert.deepEqual(VIEWPORTS.map(viewport => viewport.width).sort((a, b) => a - b), [320, 390, 620, 768, 1024, 1440, 1920]);
  assert.deepEqual(DIRECTORY_STATES, ['open', 'caption-search']);
  assert.equal(requiredCaseIds().length, 224);
  for (const viewport of VIEWPORTS) for (const state of DIRECTORY_STATES) {
    assert.ok(requiredCaseIds().includes(`directory/${state}/${viewport.width}x${viewport.height}`));
  }
  for (const state of ['books', 'chapters', 'read', 'selection', 'reader-options', 'search-results', 'principles']) assert.ok(BIBLE_STATES.includes(state));
});

test('cleanup closes the owned browser gracefully before closing CDP', async () => {
  const calls = [], browser = { exitCode: null, signalCode: null };
  await closeAuditBrowser(browser, {
    call: async (method, params, timeout) => { calls.push([method, timeout]); browser.exitCode = 0; },
    socket: { close: () => calls.push('socket closed') },
  });
  assert.deepEqual(calls, [['Browser.close', 2000], 'socket closed']);
});

test('release verifier rejects stale hashes, counterfeit 100% summaries and missing case evidence', () => {
  const live = { frontend: 'front', source: 'source', policy: 'policy' };
  const valid = {
    version: 1, fingerprints: live, requiredCases: requiredCaseIds(),
    summary: { pass: true, complete: true, failed: 0, score: 100, passed: 120, required: 120 },
    coverage: requiredCaseIds().map(id => ({ id, complete: true, textNodes: 1, required: 1, passed: 1 })),
  };
  assert.equal(gateEvidenceValid(valid, live), true);
  assert.equal(gateEvidenceValid(valid, { ...live, frontend: 'changed' }), false);
  assert.equal(gateEvidenceValid(valid, { ...live, source: 'changed' }), false);
  assert.equal(gateEvidenceValid(valid, { ...live, policy: 'changed' }), false);
  assert.equal(gateEvidenceValid({ ...valid, coverage: valid.coverage.slice(1) }, live), false);
  assert.equal(gateEvidenceValid({ ...valid, summary: { ...valid.summary, failed: 1 } }, live), false);
  assert.equal(gateEvidenceValid({ ...valid, summary: { ...valid.summary, passed: 119 } }, live), false);
  assert.equal(gateEvidenceValid({ ...valid, requiredCases: ['pretend'] }, live), false);
});

test('normal release paths require the audit without recursion, installs or implicit installer tests', async () => {
  const pkg = require('../package.json');
  const config = require('../src-tauri/tauri.conf.json');
  assert.equal(pkg.scripts['audit:design'], 'node assistant/design-audit.cjs');
  assert.match(config.build.beforeBuildCommand, /build:toolbox && npm run audit:design$/);
  assert.doesNotMatch(pkg.scripts['audit:design'], /build|install/);
  assert.doesNotMatch(pkg.scripts['test:design-audit'], /build|tauri|install/);
  const offline = await fs.readFile(path.join(root, 'assistant', 'package-offline.cjs'), 'utf8');
  const exporter = await fs.readFile(path.join(root, 'assistant', 'playbook-export.mjs'), 'utf8');
  assert.match(offline, /async function main\(\) \{\s+await assertDesignGate\(\)/);
  assert.match(offline, /Setup predates the verified design audit/);
  assert.match(exporter, /await assertDesignGate\(\)/);
  assert.match(exporter, /bundleManifest\.designAudit\.sha256 !== await sha256\(auditFile\)/);
  const agent = require('../agents/crew-manifest.json').crew.find(entry => entry.id === 'design_coherence_auditor');
  assert.deepEqual(agent.capabilities, []); assert.match(agent.purpose, /Read-only/);
});

test('fingerprints change when actual audited input bytes change', async t => {
  const work = path.join(root, '.design-audit');
  await fs.mkdir(work, { recursive: true });
  const directory = await fs.mkdtemp(path.join(work, 'fingerprint-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'style.css'), 'body{letter-spacing:normal}');
  const first = await treeFingerprint(directory);
  assert.equal(await treeFingerprint(directory), first);
  await fs.writeFile(path.join(directory, 'style.css'), 'body{letter-spacing:5px}');
  assert.notEqual(await treeFingerprint(directory), first);
});

test('real computed-browser fixture detects hidden text, condensation, clipping, overflow and serif roles', { timeout: 40000 }, async t => {
  const candidates = [process.env.DESIGN_AUDIT_BROWSER, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  let executable;
  for (const candidate of candidates) { try { await fs.access(candidate); executable = candidate; break; } catch {} }
  if (!executable) { t.skip('Local Chromium is unavailable; production audit fails closed rather than skipping.'); return; }
  const work = path.join(root, '.design-audit');
  await fs.mkdir(work, { recursive: true });
  const profile = await fs.mkdtemp(path.join(work, 'fixture-profile-'));
  const browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let cdp;
  t.after(async () => {
    await closeAuditBrowser(browser, cdp);
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  let port;
  const deadline = Date.now() + 15000;
  while (!port && Date.now() < deadline) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
    if (!port) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(port, 'private browser started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  cdp = await CDP.connect(targets.find(entry => entry.type === 'page').webSocketDebuggerUrl);
  await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  const fixture = `<style>body{font-family:"Segoe UI",sans-serif;font-size:13px;font-stretch:normal;letter-spacing:normal}.clip{width:24px;overflow:hidden;white-space:nowrap}button{width:24px;overflow:hidden}.wide{width:700px}.bad{font-stretch:condensed;letter-spacing:4px}.bible-scripture{font-family:Georgia,serif}.bible-prayer-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;width:80px}</style>
    <main class="workspace"><section class="view active" data-view="fixture"><p>Visible prose</p><p hidden>Do not inspect hidden prose</p><p class="bad">Condensed prose</p><p class="clip">A very long clipped label</p><button>Long control label</button><div class="wide">Wide content</div><div class="bible-shell"><p class="bible-scripture">Scripture is serif</p><nav class="bible-nav"><button style="width:auto;font-family:Arial,sans-serif">Books</button></nav><p class="bible-prayer-preview">A long preview deliberately clamped to two lines with its entire prayer separately inspected.</p></div></section></main>`;
  await cdp.call('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(fixture) });
  await cdp.wait(`document.readyState === 'complete' && document.querySelector('.bad') !== null`);
  const measured = await cdp.evaluate(`(${measureDesign.toString()})()`);
  assert.ok(measured.textNodes > 0);
  assert.ok(measured.excluded.hiddenTextNodes > 0);
  assert.ok(measured.samples.some(entry => entry.role === 'scripture' && /Georgia/.test(entry.fontFamily)));
  assert.ok(measured.samples.some(entry => entry.bibleUI && /sans-serif/.test(entry.fontFamily)));
  const rules = measured.samples.flatMap(typographyChecks);
  assert.ok(rules.some(entry => entry.check === 'font-stretch-normal' && !entry.pass));
  assert.ok(rules.some(entry => entry.check === 'letter-spacing-by-role' && !entry.pass));
  assert.ok(measured.geometry.some(entry => entry.check === 'document-no-horizontal-overflow' && !entry.pass));
  assert.ok(measured.geometry.some(entry => entry.check === 'control-not-clipped' && !entry.pass));
  assert.ok(measured.geometry.some(entry => entry.check === 'text-not-clipped' && !entry.pass));
  assert.ok(measured.geometry.some(entry => entry.check === 'prayer-preview-two-line-clamp' && entry.pass));
  const directoryFixture = `<style>body{font:13px Arial,sans-serif;letter-spacing:normal;font-stretch:normal}.nav-item{display:block;width:250px;white-space:normal}.nav-item::after{display:block;content:attr(data-caption);font:11px Arial,sans-serif;letter-spacing:normal}.nav-item[hidden]{display:none}</style>
    <button id="directory-toggle">Directory</button><main class="workspace"><section class="view active" data-view="fixture">Workspace</section></main>
    <aside id="page-directory" hidden><input id="nav-search"><details class="nav-group"><summary>Apps</summary>
    ${PAGES.map(page => `<button class="nav-item" data-view="${page}" data-caption="${page === 'world' ? 'Build spatial workspaces' : `Caption for ${page}`}">${page}</button>`).join('')}</details></aside>
    <script>document.querySelector('#directory-toggle').onclick=()=>document.querySelector('#page-directory').hidden=false;
    document.querySelector('#nav-search').oninput=e=>{for(const item of document.querySelectorAll('.nav-item'))item.hidden=!(item.textContent+' '+item.dataset.caption).toLowerCase().includes(e.target.value.toLowerCase())};</script>`;
  await cdp.call('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(directoryFixture) });
  await cdp.wait(`document.readyState === 'complete' && document.querySelector('#page-directory') !== null`);
  for (const state of DIRECTORY_STATES) {
    await prepareDirectory(cdp, state);
    const directory = await cdp.evaluate(`(${measureDesign.toString()})()`);
    assert.equal(directory.directoryCaptions, state === 'open' ? 20 : 1);
    assert.ok(directory.samples.some(entry => entry.selector.endsWith('::after')));
    assert.ok(directory.geometry.filter(entry => entry.check === 'directory-caption-rendered').every(entry => entry.pass));
  }
  await cdp.evaluate(`document.querySelector('#page-directory .nav-item[data-view="world"]').dataset.caption=''`);
  await assert.rejects(prepareDirectory(cdp, 'caption-search'), /Caption-only search fixture/);
});
