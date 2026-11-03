const KEY = 'capsule-performance-history-v1';
const validPercent = value => Number.isFinite(value) && value >= 0 && value <= 100;
const validIds = ids => ids === undefined || Array.isArray(ids) && ids.length <= 51 &&
  ids.every(id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id));
const states = new Set(['sampling', 'complete', 'interrupted', 'insufficient']);
const average = samples => ({
  cpu: samples.reduce((sum, s) => sum + s.cpuPercent, 0) / samples.length,
  memory: samples.reduce((sum, s) => sum + s.memoryPercent, 0) / samples.length,
  samples: samples.length
});

export function validResourceSample(sample) {
  return sample && Number.isSafeInteger(sample.timestamp) && sample.timestamp > 0 &&
    (sample.cpuPercent === null || validPercent(sample.cpuPercent)) && validPercent(sample.memoryPercent);
}

export function createPerformanceHistory(stored = { version: 1, minutes: [], changes: [] }) {
  if (stored?.version !== 1 || !Array.isArray(stored.minutes) || stored.minutes.length > 1440 ||
      !Array.isArray(stored.changes) || stored.changes.length > 20 ||
      stored.minutes.some(m => !Number.isSafeInteger(m.minute) || !validPercent(m.cpu) || !validPercent(m.memory) || !Number.isSafeInteger(m.samples) || m.samples < 1 || m.samples > 60) ||
      stored.changes.some(c => !['apply', 'rollback'].includes(c.kind) || typeof c.id !== 'string' || c.id.length > 120 || !Number.isSafeInteger(c.at) ||
        !validIds(c.ids) || c.state !== undefined && !states.has(c.state) ||
        [c.before, c.after].some(v => v !== null && (!v || !validPercent(v.cpu) || !validPercent(v.memory) || !Number.isSafeInteger(v.samples) || v.samples < 1)))) {
    throw new Error('Saved performance history is invalid; it was not overwritten.');
  }
  const minutes = stored.minutes.map(m => ({ ...m }));
  const changes = stored.changes.map(c => ({
    ...c, ids: [...(c.ids || [])],
    state: c.state === 'sampling' ? 'interrupted' : c.state || (c.after ? 'complete' : 'insufficient'),
    before: c.before && { ...c.before }, after: c.after && { ...c.after }
  }));
  const recent = [];
  let pending = null, afterSamples = [];
  return {
    add(sample) {
      if (!validResourceSample(sample)) throw new Error('Windows returned an invalid resource reading.');
      if (sample.cpuPercent === null) return;
      if (recent.length && sample.timestamp <= recent.at(-1).timestamp) return;
      recent.push({ ...sample });
      while (recent.length && sample.timestamp - recent[0].timestamp > 60000) recent.shift();
      const minute = Math.floor(sample.timestamp / 60000) * 60000;
      let bucket = minutes.at(-1);
      if (!bucket || bucket.minute !== minute) {
        bucket = { minute, cpu: sample.cpuPercent, memory: sample.memoryPercent, samples: 1 };
        minutes.push(bucket);
      } else {
        const weight = Math.min(bucket.samples, 59);
        bucket.cpu = (bucket.cpu * weight + sample.cpuPercent) / (weight + 1);
        bucket.memory = (bucket.memory * weight + sample.memoryPercent) / (weight + 1);
        bucket.samples = weight + 1;
      }
      while (minutes.length > 1440 || minutes.length && minute - minutes[0].minute >= 24 * 60 * 60000) minutes.shift();
      if (pending) {
        if (sample.timestamp > pending.at && sample.timestamp <= pending.at + 60000) afterSamples.push(sample);
        if (afterSamples.length >= 5) pending.after = average(afterSamples);
        if (sample.timestamp - pending.at >= 60000) {
          pending.state = pending.after && pending.before ? 'complete' : 'insufficient';
          pending = null;
          afterSamples = [];
        }
      }
    },
    mark({ kind, id, at, ids = [] }) {
      if (!['apply', 'rollback'].includes(kind) || typeof id !== 'string' || !id || id.length > 120 || !Number.isSafeInteger(at) || !validIds(ids)) throw new Error('Invalid settings comparison marker.');
      if (changes.some(change => change.id === id && change.kind === kind)) return;
      if (pending) pending.state = 'interrupted';
      const before = recent.filter(s => s.timestamp <= at && at - s.timestamp <= 60000);
      pending = { kind, id, at, ids: [...new Set(ids)], state: 'sampling', before: before.length >= 5 ? average(before) : null, after: null };
      afterSamples = [];
      changes.push(pending);
      if (changes.length > 20) changes.shift();
    },
    snapshot() { return JSON.parse(JSON.stringify({ version: 1, minutes, changes })); },
    recent() { return recent.map(s => ({ ...s })); }
  };
}

export function comparisonDeltas(change) {
  if (!change.before || !change.after || change.before.samples < 5 || change.after.samples < 5) return null;
  return Object.fromEntries(['cpu', 'memory'].map(key => [key, {
    before: change.before[key], after: change.after[key], delta: change.after[key] - change.before[key]
  }]));
}

export function readPerformanceHistory(storage) {
  const value = storage.getItem(KEY);
  return createPerformanceHistory(value ? JSON.parse(value) : undefined);
}

export function savePerformanceHistory(history, storage) {
  storage.setItem(KEY, JSON.stringify(history.snapshot()));
}
