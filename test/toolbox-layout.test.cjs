const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Toolbox HTML closes containers in order and every page stays directly inside the workspace', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'toolbox', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  const pages = [];
  const ids = new Set();
  let directoryGrids = 0, directoryCards = 0;
  for (const match of html.matchAll(/<\/?([A-Za-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/g)) {
    const tag = match[1].toLowerCase();
    const raw = match[0];
    if (raw.startsWith('</')) {
      const current = stack.pop();
      assert.equal(current?.tag, tag, `Mismatched ${raw} near line ${html.slice(0, match.index).split('\n').length}; expected </${current?.tag}>`);
      continue;
    }
    const id = /\bid="([^"]+)"/.exec(raw)?.[1];
    if (id) {
      assert.ok(!ids.has(id), `Duplicate id: ${id}`);
      ids.add(id);
    }
    const classes = /\bclass="([^"]*)"/.exec(raw)?.[1].split(/\s+/) || [];
    if (classes.includes('nav-apps')) {
      directoryGrids++;
      assert.equal(stack.at(-1)?.tag, 'details');
      assert.ok(stack.at(-1)?.classes.includes('nav-group'));
    }
    if (classes.includes('nav-item')) {
      directoryCards++;
      assert.ok(stack.at(-1)?.classes.includes('nav-apps'), 'Directory cards require an explicit inner grid, not a grid on details.');
    }
    if (tag === 'section' && classes.includes('view')) {
      assert.equal(stack.at(-1)?.tag, 'main', 'Every page must be a direct child of main, not a sibling below the shell.');
      assert.ok(stack.at(-1)?.classes.includes('workspace'));
      pages.push(/\bdata-view="([^"]+)"/.exec(raw)?.[1]);
    }
    if (!voidTags.has(tag) && !raw.endsWith('/>')) stack.push({ tag, classes });
  }
  assert.equal(stack.length, 0);
  assert.equal(pages.length, 20);
  assert.ok(pages.includes('bible'));
  assert.ok(pages.includes('world'));
  assert.ok(pages.includes('wsl'));
  assert.equal(new Set(pages).size, pages.length);
  assert.equal(directoryGrids, 4);
  assert.equal(directoryCards, pages.length);
  for (const match of html.matchAll(/<(?:button)[^>]+data-(?:shortcut-view|settings-view)="([^"]+)"/g)) {
    assert.ok(pages.includes(match[1]), `Navigation points to missing page: ${match[1]}`);
  }
});

test('lazy page loading is serialized, reports failures and supports retry', async () => {
  const { createViewLoader } = await import('../toolbox/view-loader.js');
  const makeNode = () => ({
    children: [], attrs: {}, dataset: {}, isConnected: false,
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    prepend(node) { node.isConnected = true; this.children.unshift(node); },
    append(node) { this.children.push(node); },
    remove() { this.isConnected = false; },
    addEventListener(type, handler) { this[type] = handler; }
  });
  const root = makeNode();
  root.ownerDocument = { createElement: makeNode };
  const loadView = createViewLoader();
  let attempts = 0, mounts = 0;
  const loader = async () => { if (++attempts === 1) throw new Error('test module unavailable'); return {}; };
  const mount = () => { mounts++; };
  const first = loadView(root, loader, mount);
  assert.equal(first, loadView(root, loader, mount));
  assert.equal(await first, false);
  assert.equal(root.dataset.loadState, 'error');
  assert.match(root.children[0].textContent, /test module unavailable/);
  assert.equal(root.children[0].attrs.role, 'alert');
  assert.equal(await loadView(root, loader, mount), true);
  assert.equal(root.dataset.loadState, 'ready');
  assert.equal(mounts, 1);
  await loadView(root, loader, mount);
  assert.equal(mounts, 1);
});
