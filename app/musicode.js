// Agents as notes: sound only on direct interaction, never a loop or soundtrack.
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const ROOT = 82.41;
const STEPS = SCALE.length * 6;
const TIMBRES = ['sine', 'triangle', 'square', 'sawtooth'];
const NAMES = ['E', 'F♯', 'G', 'A', 'B', 'C', 'D'];
const MAX_GAIN = 0.16;
let context = null;
let muted = false;
let motifVoices = [];
let lastMotif = { key: '', time: -Infinity };

export const NOTE_STEPS = STEPS;

function stepOf(index) {
  return ((Math.trunc(index) % STEPS) + STEPS) % STEPS;
}

export function noteFrequency(index) {
  const step = stepOf(index);
  const semitone = SCALE[step % SCALE.length] + Math.floor(step / SCALE.length) * 12;
  return ROOT * 2 ** (semitone / 12);
}

export function noteName(index) {
  const step = stepOf(index);
  return `${NAMES[step % SCALE.length]}${2 + Math.floor(step / SCALE.length)} · ${Math.round(noteFrequency(step))} Hz`;
}

export function noteTimbre(index) {
  return TIMBRES[stepOf(index) % TIMBRES.length];
}

export async function unlockAudio() {
  if (!context) {
    const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtor) throw new Error('Web Audio is unavailable on this device.');
    context = new AudioCtor();
  }
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') throw new Error('Audio is suspended. Click Enable agent sound and try again.');
  notifyAudioState();
  return context;
}

export const isAudioReady = () => context?.state === 'running';
function notifyAudioState() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('capsule-audio-state'));
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  if (muted) stopAgentMotif();
  notifyAudioState();
}

export function playNote(index) {
  if (muted || !isAudioReady()) return false;
  const start = context.currentTime;
  const frequency = noteFrequency(index);
  const timbre = noteTimbre(index);
  const body = timbre === 'square' || timbre === 'sawtooth' ? MAX_GAIN * 0.35 : MAX_GAIN;
  for (const [type, ratio, level, length] of [[timbre, 1, body, 0.7], ['triangle', 2, MAX_GAIN * 0.3, 0.35]]) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    gain.connect(context.destination);
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency * ratio;
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + length + 0.05);
  }
  return true;
}

export function agentActivityState(receipts, busy = false) {
  const last = receipts.at(-1);
  if (!last) return 'idle';
  if (last.cls === 'veto' || ['sentinel', 'denied', 'veto'].includes(last.kind)) return 'blocked';
  if (['tool', 'archivist', 'completed', 'sealed'].includes(last.kind)) return 'completed';
  return busy && ['intake', 'gate', 'running'].includes(last.kind) ? 'busy' : 'idle';
}

export function agentMotif(agentId, state = 'idle') {
  const patterns = { idle: [0, 2, 4], busy: [0, 1, 3, 2], completed: [0, 2, 4, 7], blocked: [3, 1, 0] };
  if (!Object.hasOwn(patterns, state)) throw new Error('Unsupported agent activity state.');
  let seed = 2166136261;
  for (const char of String(agentId)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const root = 7 + seed % 14;
  const interval = state === 'busy' ? 0.13 : state === 'blocked' ? 0.23 : 0.2;
  return {
    state,
    notes: patterns[state].map((offset, index) => ({
      step: root + offset, at: index * interval,
      duration: state === 'idle' ? 0.36 : 0.25,
      type: seed % 2 ? 'triangle' : 'sine',
      gain: state === 'blocked' ? 0.06 : 0.09,
    })),
  };
}

export function stopAgentMotif() {
  for (const { oscillator, gain } of motifVoices) {
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    oscillator.stop(context.currentTime + 0.01);
  }
  motifVoices = [];
}

export function playAgentMotif(agentId, state = 'idle') {
  if (muted || !isAudioReady()) return false;
  const key = `${agentId}:${state}`;
  if (lastMotif.key === key && context.currentTime - lastMotif.time < 0.6) return false;
  stopAgentMotif();
  lastMotif = { key, time: context.currentTime };
  for (const note of agentMotif(agentId, state).notes) {
    const start = context.currentTime + note.at;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.gain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    gain.connect(context.destination);
    const oscillator = context.createOscillator();
    oscillator.type = note.type;
    oscillator.frequency.value = noteFrequency(note.step);
    oscillator.connect(gain);
    const voice = { oscillator, gain };
    motifVoices.push(voice);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      motifVoices = motifVoices.filter((item) => item !== voice);
    };
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.02);
  }
  return true;
}
