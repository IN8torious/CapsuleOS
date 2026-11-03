const test = require('node:test');
const assert = require('node:assert/strict');

test('one bounded release history distinguishes current source from historical delivery', async () => {
  const { RELEASE_NOTES } = await import('../toolbox/release-notes.js');
  assert.equal(RELEASE_NOTES.filter(release => release.current).length, 1);
  assert.equal(new Set(RELEASE_NOTES.map(release => release.id)).size, RELEASE_NOTES.length);
  for (const release of RELEASE_NOTES) {
    assert.ok(release.title && release.state && release.changes.length);
    assert.equal(new Set(release.changes.map(change => change.id)).size, release.changes.length);
    for (const change of release.changes) assert.ok(change.title && change.detail);
  }
  assert.match(RELEASE_NOTES[0].state, /Source.*pending/);
  assert.match(RELEASE_NOTES.at(-1).state, /Historical.*superseded/);
  assert.match(JSON.stringify(RELEASE_NOTES), /claim was withdrawn/);
});

test('notifications render current updates and complete history with accessible local tab switching', async t => {
  const { RELEASE_NOTES, mountReleaseNotes } = await import('../toolbox/release-notes.js');
  const make = tag => ({
    tag, children: [], attrs: {}, dataset: {}, listeners: {},
    append(...children) { this.children.push(...children); },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    focus() { this.focused = true; }
  });
  const previousDocument = global.document, previousEvent = global.CustomEvent;
  t.after(() => {
    if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
    if (previousEvent === undefined) delete global.CustomEvent; else global.CustomEvent = previousEvent;
  });
  global.document = { createElement: make };
  global.CustomEvent = class { constructor(type, options) { this.type = type; Object.assign(this, options); } };
  const activity = make('div'), notes = make('div');
  const buttons = ['activity', 'releases'].map(name => Object.assign(make('button'), { dataset: { notificationTab: name } }));
  const panels = ['activity', 'releases'].map(name => Object.assign(make('div'), { dataset: { notificationPanel: name } }));
  const events = [];
  mountReleaseNotes({
    querySelector: selector => selector === '[data-development-updates]' ? activity : notes,
    querySelectorAll: selector => selector === '[data-notification-tab]' ? buttons : panels,
    dispatchEvent: event => events.push(event.type)
  });
  assert.equal(activity.children.length, 4);
  assert.equal(notes.children.length, RELEASE_NOTES.length);
  assert.equal(notes.children.reduce((count, item) => count + item.children.length - 1, 0), RELEASE_NOTES.reduce((count, item) => count + item.changes.length, 0));
  assert.equal(notes.children[0].open, true);
  assert.equal(panels[0].hidden, false);
  buttons[1].listeners.click();
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
  assert.equal(buttons[1].attrs['aria-selected'], 'true');
  assert.equal(buttons[1].tabIndex, 0);
  let prevented = false;
  buttons[1].listeners.keydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(buttons[0].focused, true);
  assert.equal(panels[0].hidden, false);
  assert.ok(events.every(type => type === 'capsule-notification-tab'));
});
