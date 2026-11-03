'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const MAX_BYTES = 192 * 1024, MAX_EVENTS = 200, MAX_RUNS = 20;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const id = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const states = ['running', 'stopping', 'stopped', 'completed', 'awaiting-user', 'error', 'interrupted'];
const kinds = ['started', 'planning', 'reviewing', 'checking', 'principle-checked', 'evidence-verified', 'proposal-saved', 'workspace-edited', 'workspace-skipped', 'completed', 'stopping', 'stopped', 'awaiting-user', 'error', 'interrupted'];

function validateRequest(action, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  if (['status', 'stop'].includes(action)) return keys.length === 0;
  return action === 'start' && keys.length === 3 && keys.every(key => ['goal', 'maxCycles', 'confirmed'].includes(key))
    && text(payload.goal, 600) && Number.isSafeInteger(payload.maxCycles) && payload.maxCycles >= 1 && payload.maxCycles <= 3
    && payload.confirmed === true;
}

function eventBody(event) {
  const { hash: ignored, ...body } = event;
  return body;
}

function validateJournal(doc) {
  if (!doc || doc.version !== 1 || !Array.isArray(doc.events) || !Array.isArray(doc.runs)
    || doc.events.length > MAX_EVENTS || doc.runs.length > MAX_RUNS) throw new Error('Orchestrator history is invalid; it was not overwritten.');
  let prev = doc.events[0]?.prev || 'genesis', sequence = (doc.events[0]?.seq || 1) - 1;
  for (const event of doc.events) {
    if (!id(event.id) || !id(event.runId) || !Number.isSafeInteger(event.seq) || event.seq < 1 || event.seq !== sequence + 1
      || !Number.isSafeInteger(event.at) || event.at < 0 || !kinds.includes(event.kind) || !text(event.message, 700)
      || event.prev !== prev || event.hash !== hash(eventBody(event)) || (event.proposalId && !id(event.proposalId))) {
      throw new Error('Orchestrator event history failed validation; it was not overwritten.');
    }
    prev = event.hash; sequence = event.seq;
  }
  if (new Set(doc.events.map(event => event.id)).size !== doc.events.length || new Set(doc.runs.map(run => run.id)).size !== doc.runs.length
    || doc.runs.some(run => !id(run.id) || !text(run.goal, 600) || !text(run.modelId, 80) || !digest(run.sourceHash)
      || !states.includes(run.state) || !Number.isSafeInteger(run.startedAt) || run.startedAt < 0
      || !Number.isSafeInteger(run.updatedAt) || run.updatedAt < run.startedAt || !Number.isSafeInteger(run.maxCycles)
      || run.maxCycles < 1 || run.maxCycles > 3 || !Number.isSafeInteger(run.cycle) || run.cycle < 0 || run.cycle > run.maxCycles)) {
    throw new Error('Orchestrator run history is invalid; it was not overwritten.');
  }
  return doc;
}

class Orchestrator {
  constructor({ file, context, generate, saveProposal, applyDraft = async () => ({ changed: false }), now = Date.now }) {
    this.file = file; this.context = context; this.generate = generate; this.saveProposal = saveProposal; this.now = now;
    this.current = null; this.task = null; this.launching = false; this.cancelled = false; this.queue = Promise.resolve();
    this.applyDraft = applyDraft;
  }

  async read() {
    let bytes;
    try { bytes = await fs.readFile(this.file); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, events: [], runs: [] }; throw error; }
    if (bytes.length > MAX_BYTES) throw new Error('Orchestrator history exceeds its storage limit.');
    return validateJournal(JSON.parse(bytes.toString('utf8')));
  }

  async append(kind, message, proposalId) {
    const operation = this.queue.then(async () => {
      const doc = await this.read(), at = this.now(), run = { ...this.current, updatedAt: at };
      const previous = doc.events.at(-1);
      const body = { id: randomUUID(), seq: (previous?.seq || 0) + 1, runId: run.id, at, kind, message,
        prev: previous?.hash || 'genesis', ...(proposalId ? { proposalId } : {}) };
      doc.events = [...doc.events, { ...body, hash: hash(body) }].slice(-MAX_EVENTS);
      doc.runs = [...doc.runs.filter(item => item.id !== run.id), run].slice(-MAX_RUNS);
      validateJournal(doc);
      const content = Buffer.from(JSON.stringify(doc));
      if (content.length > MAX_BYTES) throw new Error('Orchestrator history is full. No history was overwritten.');
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, content, { flag: 'wx' }); await fs.rename(temporary, this.file); }
      finally { await fs.rm(temporary, { force: true }); }
    });
    this.queue = operation.catch(() => {});
    await operation;
  }

  async status() {
    const journal = await this.read();
    const runs = journal.runs.map(run => {
      if (['running', 'stopping'].includes(run.state) && (!this.task || run.id !== this.current?.id)) {
        return { ...run, state: 'interrupted' };
      }
      return run;
    });
    return { ok: true, active: Boolean(this.task || this.launching), run: this.current ? { ...this.current } : runs.at(-1) || null,
      events: journal.events, runs, limits: { maxCycles: 3, maxModelCalls: 6, maxMinutes: 10, autoApply: 'authorized-workspace-documents-only', adminAuthority: false },
      error: this.lastError || null };
  }

  async start(payload) {
    if (!validateRequest('start', payload)) throw new Error('Confirm a goal and one to three proposal-refinement cycles.');
    if (this.task || this.launching) throw new Error('An orchestrator run is already active.');
    this.launching = true;
    try {
      await this.read();
      const source = await this.context();
      if (!source.modelReady) throw new Error('Load an approved local model before starting the orchestrator.');
      if (!digest(source.fingerprint) || !text(source.modelId, 80)) throw new Error('The review context is invalid.');
      this.cancelled = false; this.lastError = null;
      this.current = { id: randomUUID(), goal: payload.goal.trim(), maxCycles: payload.maxCycles, cycle: 0,
        modelId: source.modelId, sourceHash: source.fingerprint, state: 'running', startedAt: this.now(), updatedAt: this.now() };
      await this.append('started', 'Bounded local run started under balanced autonomy. Document edits need an existing named workspace grant and checkpoints. No destructive, external-data or administrator authority.');
      this.task = this.run(source).catch(error => {
        this.lastError = error.message;
        this.current.state = 'error';
      }).finally(() => { this.task = null; });
      return { ok: true, run: { ...this.current } };
    } finally { this.launching = false; }
  }

  checkBudget(source) {
    if (this.cancelled) throw new Error('Run stopped. Already-started inference or storage may finish; no subsequent work will start.');
    if (this.now() - this.current.startedAt >= 10 * 60 * 1000) throw new Error('The ten-minute run budget was reached.');
    if (!source.modelReady || source.modelId !== this.current.modelId || source.fingerprint !== this.current.sourceHash) {
      throw new Error('The model, selected source or approved knowledge changed. Review the new context and start a fresh run.');
    }
  }

  async run(source) {
    let previous = '';
    try {
      for (let cycle = 1; cycle <= this.current.maxCycles; cycle++) {
        this.checkBudget(await this.context());
        this.current.cycle = cycle;
        await this.append('planning', `Genki Builder: drafting refinement ${cycle}/${this.current.maxCycles}.`);
        const draft = await this.generate({ role: 'genki_builder', goal: this.current.goal, source, previous, phase: 'plan' });
        if (!text(draft, 6000)) throw new Error('The builder did not return a bounded proposal.');
        this.checkBudget(await this.context());
        await this.append('reviewing', `Sentinel: reviewing evidence and standing workspace limits for refinement ${cycle}.`);
        const review = await this.generate({ role: 'sentinel', goal: this.current.goal, source, previous: draft, phase: 'review' });
        if (!text(review, 6000)) throw new Error('The review did not return a bounded result.');
        this.checkBudget(await this.context());
        const proposalId = await this.saveProposal({ run: { ...this.current }, source, draft, review });
        await this.append('proposal-saved', `Refinement ${cycle} saved. A saved draft or model review is not an applied change or a passed test.`, proposalId);
        this.checkBudget(await this.context());
        await this.append('checking', 'Checking exact source evidence and the current standing workspace grant. A model verdict cannot substitute for either.');
        this.checkBudget(await this.context());
        const application = await this.applyDraft({ source, draft, review });
        if (application.principleReceipt) {
          await this.append('principle-checked', `${application.principleReceipt.principle} · ${application.principleReceipt.citation}: exact Toolbox Bible quotation checked. Technical evidence and permissions remain separate.`, proposalId);
        }
        if (application.verifiedClaims) {
          await this.append('evidence-verified', `Discernment: ${application.verifiedClaims} exact source claims matched full-hash document snapshots. This is not a passed software test.`, proposalId);
        }
        if (application.changed) {
          await this.append('workspace-edited', `Stewardship: updated ${application.file}; checkpoint ${application.checkpointId}. Undo is available.`, proposalId);
          const next = await this.context();
          if (next.authorityFingerprint !== source.authorityFingerprint || next.modelId !== source.modelId) {
            throw new Error('The model or permission context changed after the edit. The checkpoint remains available.');
          }
          source = next;
          this.current.sourceHash = next.fingerprint;
        } else if (application.message) {
          await this.append('workspace-skipped', application.message.slice(0, 700), proposalId);
        }
        previous = `Builder proposal:\n${draft}\n\nReview:\n${review}\n\nHost outcome:\n${application.changed ? `Checkpointed edit to ${application.file}.` : application.message || 'No document changed.'}`.slice(0, 10000);
      }
      this.current.state = this.cancelled ? 'stopped' : 'completed';
      await this.append(this.cancelled ? 'stopped' : 'completed', 'Run finished. Saved drafts and checkpointed edits are listed here; no routine acknowledgement is needed. Destructive, external-data and administrator actions were not executed.');
    } catch (error) {
      this.current.state = this.cancelled ? 'stopped' : 'error';
      this.lastError = this.cancelled ? null : error.message;
      await this.append(this.cancelled ? 'stopped' : 'error', error.message.slice(0, 700));
    }
  }

  async stop() {
    if (this.launching) throw new Error('The run is starting. Retry Stop when its startup response arrives.');
    if (this.task) {
      this.cancelled = true;
      this.current.state = 'stopping';
      await this.append('stopping', 'User requested Stop. Waiting for the current model response; no new model calls or proposals will be started.');
    }
    return this.status();
  }
}

module.exports = { Orchestrator, validateRequest, validateJournal };
