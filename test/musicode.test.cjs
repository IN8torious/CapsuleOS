const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'musicode.js')).href);

test('every note signal has a unique pitch', async () => {
  const M = await load();
  const pitches = new Set(Array.from({ length: M.NOTE_STEPS }, (_, i) => M.noteFrequency(i).toFixed(3)));
  assert.equal(pitches.size, M.NOTE_STEPS);
  assert.ok(M.NOTE_STEPS >= 24 + 14);
  assert.ok(M.noteFrequency(M.NOTE_STEPS - 1) < 8000);
});

test('note names are unique and playback is silent without a user gesture', async () => {
  const M = await load();
  const names = new Set(Array.from({ length: M.NOTE_STEPS }, (_, i) => M.noteName(i)));
  assert.equal(names.size, M.NOTE_STEPS);
  assert.equal(M.playNote(0), false);
});

test('agent motifs have stable character, distinct activity patterns and bounded volume/duration', async () => {
  const M = await load();
  assert.deepEqual(M.agentMotif('crew-corvus', 'idle'), M.agentMotif('crew-corvus', 'idle'));
  assert.notDeepEqual(M.agentMotif('crew-corvus', 'idle'), M.agentMotif('crew-genki', 'idle'));
  assert.notDeepEqual(M.agentMotif('crew-corvus', 'idle'), M.agentMotif('crew-corvus', 'blocked'));
  for (const state of ['idle', 'busy', 'completed', 'blocked']) {
    const motif = M.agentMotif('crew-corvus', state);
    assert.ok(motif.notes.length >= 3 && motif.notes.length <= 4);
    assert.ok(motif.notes.every((note) => note.gain <= 0.1 && note.at + note.duration < 1.5));
  }
  assert.throws(() => M.agentMotif('crew-corvus', 'real-emotion'), /Unsupported agent activity/);
});

test('agent activity reflects recorded task evidence rather than invented mood', async () => {
  const M = await load();
  assert.equal(M.agentActivityState([], true), 'idle', 'global activity does not make every agent busy');
  assert.equal(M.agentActivityState([{ kind: 'intake' }], true), 'busy');
  assert.equal(M.agentActivityState([{ kind: 'intake' }], false), 'idle');
  assert.equal(M.agentActivityState([{ kind: 'tool' }]), 'completed');
  assert.equal(M.agentActivityState([{ cls: 'veto' }]), 'blocked');
});

test('agent playback requires audio unlock, replaces old motifs and respects mute', async () => {
  const M = await load();
  const previous = globalThis.AudioContext;
  const oscillators = [];
  globalThis.AudioContext = class {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    async resume() { this.state = 'running'; }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} };
    }
    createOscillator() {
      const oscillator = { frequency: {}, connect() {}, disconnect() {}, start() {}, stops: [], stop(time) { this.stops.push(time); } };
      oscillators.push(oscillator);
      return oscillator;
    }
  };
  try {
    assert.equal(M.playAgentMotif('crew-corvus'), false);
    await M.unlockAudio();
    assert.equal(M.playAgentMotif('crew-corvus'), true);
    assert.equal(M.playAgentMotif('crew-corvus'), false, 'rapid repeated highlight must not stack songs');
    assert.equal(M.playAgentMotif('crew-genki', 'busy'), true);
    assert.ok(oscillators.slice(0, 3).every((oscillator) => oscillator.stops.length === 2));
    M.setMuted(true);
    assert.equal(M.playAgentMotif('crew-veda'), false);
    assert.ok(oscillators.every((oscillator) => oscillator.stops.length === 2));
  } finally { globalThis.AudioContext = previous; M.setMuted(false); }
});
