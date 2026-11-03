const assert = require('node:assert/strict');
const test = require('node:test');

function documentFixture() {
  const element = () => ({
    children: [], attributes: {}, handlers: {},
    append(...children) { this.children.push(...children); },
    prepend(child) { this.children.unshift(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.handlers[name] = callback; }
  });
  const shell = { inert: false };
  const doc = {
    body: element(), documentElement: { dataset: {} }, createElement: element,
    querySelector: () => shell,
    defaultView: { location: { reload() { doc.reloaded = true; } } }
  };
  return { doc, shell };
}

test('startup reports module failures, blocks half-wired controls and exposes reload', async t => {
  const { initializeToolbox } = await import('../toolbox/startup.js');
  const { doc, shell } = documentFixture();
  t.mock.method(console, 'error', () => {});
  assert.equal(await initializeToolbox(async () => { throw new SyntaxError('module failed to parse'); }, doc), false);
  assert.equal(doc.documentElement.dataset.toolboxState, 'failed');
  assert.equal(shell.inert, true);
  const notice = doc.body.children[0];
  assert.equal(notice.attributes.role, 'alert');
  assert.match(notice.children[1].textContent, /failed to parse/);
  notice.children[2].handlers.click();
  assert.equal(doc.reloaded, true);
});

test('startup becomes ready only after initialization and read-only deadlines settle honestly', async () => {
  const { initializeToolbox } = await import('../toolbox/startup.js');
  const { readWithDeadline, invoke } = await import('../toolbox/bridge.js');
  const { doc, shell } = documentFixture();
  let release;
  const started = initializeToolbox(() => new Promise(resolve => { release = resolve; }), doc);
  assert.equal(doc.documentElement.dataset.toolboxState, 'loading');
  release();
  assert.equal(await started, true);
  assert.equal(doc.documentElement.dataset.toolboxState, 'ready');
  assert.equal(shell.inert, false);
  assert.equal(await readWithDeadline(Promise.resolve(42), 100), 42);
  await assert.rejects(readWithDeadline(new Promise(() => {}), 5, 'Sampling'), /Sampling timed out/);
  await assert.rejects(readWithDeadline(Promise.reject(new Error('native failed')), 100), /native failed/);
  await assert.rejects(invoke('inspect_performance_telemetry'), error => String(error).includes('desktop app'));
});
