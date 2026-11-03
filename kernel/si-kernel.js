/* ============================================================================
   SI KERNEL — the shared constitutional runtime.
   One source of law for every lens (Onion, Rose, and any future shell).

   The kernel answers two questions only: CAN this happen? DID it happen?
   It does not plan, write, estimate, render, or know what Gemba means.
   Agents, worlds, languages, sensors and personalities are host concerns,
   injected as data (manifests, intents, legal transitions) at construction.

   Five services over five primitives:
     Identity Service    — who an actor is (manifest registry)
     Capability Service  — what an actor may do (grants, checked, fail-closed)
     Proposal Service    — the router (Vera's function): schema or rejection
     State Service       — which transitions are legal (the graph, as data)
     Receipt Service     — the ledger: hash-chained, tamper-evident

   The proposal moves. The constitution stays.
   Forces govern the trajectory; law governs the outcome.
   ========================================================================== */

export function fnv1a(s){ let h = 0x811c9dc5; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8,'0'); }

export const RISK_ORDER = { READ_ONLY:0, INTERNAL_REVERSIBLE:2, FINANCIAL:5, DESTRUCTIVE_IRREVERSIBLE:8, UNGRANTED:9 };
export const APPROVAL_RISKS = new Set(['FINANCIAL','DESTRUCTIVE_IRREVERSIBLE']);

/* ---------------- Receipt Service — the ledger ----------------
   Canonical entry format (the one two verification suites already prove):
   { seq, agent, kind, event, cls, prev, hash } with
   hash = fnv1a(prev | agent | event), genesis prev = 'genesis0'.
   `kind` is the kernel's semantic class; `cls` is its display class. */
export class Ledger {
  constructor(){ this.entries = []; }
  seal(actor, kind, msg){ const prev = this.entries.length ? this.entries[this.entries.length-1].hash : 'genesis0';
    const cls = kind === 'sentinel' || (kind === 'operator' && /^DENIED/.test(msg)) ? 'veto'
      : (kind === 'tool' || kind === 'archivist' || kind === 'operator') ? 'ok' : '';
    const e = { seq: this.entries.length+1, agent: actor, kind, event: msg, cls, prev, hash:'' };
    e.hash = fnv1a(prev+'|'+actor+'|'+msg);
    this.entries.push(e); return e; }
  verify(){ let prev = 'genesis0'; for(const e of this.entries){
    if(e.prev !== prev) return false;
    if(e.hash !== fnv1a(prev+'|'+e.agent+'|'+e.event)) return false;
    prev = e.hash; } return true; }
  get length(){ return this.entries.length; }
}

/* ---------------- The Kernel ---------------- */
const PROPOSAL_KEYS = ['actor','capability','transition','evidence','risk','text','kind'];
const PROPOSAL_KINDS = new Set(['observation','recommendation','change']);
let proposalSeq = 0;

export class Kernel {
  /* config: { agents: [{id, name, capabilities[]}], legal: [[from,to],...] } */
  constructor(config){
    this.agents = new Map((config.agents||[]).map(a => [a.id, a]));
    this.legal = new Set((config.legal||[]).map(([f,t]) => f+'>'+t));
    this.ledger = new Ledger();
    this.stats = { executed:0, vetoed:0, stripped:0, approvals:0, denials:0, consumed:0 };
    this.counters = { idRefs:0, idOk:0, capChecks:0, capPass:0, propTotal:0, propMalformed:0, stateAttempts:0, stateLegal:0 };
    this.capReceipts = {};   // capability -> sealed execution count (a force source)
    this.proposals = new Map();
  }

  /* ----- Identity Service ----- */
  resolveActor(id){ return this.agents.get(id) || null; }

  /* ----- Capability Service ----- */
  grants(id){ const a = this.agents.get(id); return a ? a.capabilities : []; }
  checkCapability(actorId, capability){ return this.grants(actorId).includes(capability); }

  /* ----- State Service ----- */
  isLegal(from, to){ return this.legal.has(from+'>'+to) || /no transition/.test(to||''); }

  /* ----- Forces — every term countable, published in the roadmap (P2.8) -----
     P2.8-A FIELD NOTES (Nathan's amendment, 2026-10-31): the host counts
     field notes within radius of the live proposal — the η pattern: host
     counts, kernel adds. fieldPush joins momentum, fieldDrag joins
     opposition; both are trajectory only, never outcome. No field
     argument = the law exactly as it was before the amendment. */
  forcesFor(p, eta, field){ const evidenceForce = (p.evidence||[]).length * 2;
    const worldForce = Math.round((eta||0) * 4);
    const priorForce = Math.min(3, this.capReceipts[p.capability] || 0);
    const fieldPush = field ? (field.push|0) : 0, fieldDrag = field ? (field.drag|0) : 0;
    const momentum = evidenceForce + worldForce + priorForce + fieldPush;
    const opposition = (RISK_ORDER[p.risk] ?? 3) + fieldDrag;   /* + conflict drag: 0 until P3 detects conflicts */
    return { momentum, opposition, net: momentum - opposition,
             barrier: p.kind === 'change' || APPROVAL_RISKS.has(p.risk),
             parts: { evidence: evidenceForce, worlds: worldForce, priorReceipts: priorForce, fieldPush, fieldDrag, risk: (RISK_ORDER[p.risk] ?? 3), conflicts: 0 } }; }

  /* ----- Proposal Service — the router. Schema or rejection. -----
     input: { actor, capability, transition:{from,to}, evidence[], risk, text, ...anything }
     Unknown keys are stripped and reported; a proposal is a typed object or it is nothing. */
  propose(input){
    this.counters.propTotal++;
    const stripped = Object.keys(input).filter(k => !PROPOSAL_KEYS.includes(k));
    if(stripped.length){ this.counters.propMalformed++; this.stats.stripped++; }
    const p = { id: 'P-' + (++proposalSeq) + '-' + Math.floor(100 + Math.random()*900),
      actor: input.actor, capability: input.capability,
      transition: input.transition || { from:'—', to:'—' },
      evidence: Array.isArray(input.evidence) ? input.evidence : [],
      risk: input.risk || 'INTERNAL_REVERSIBLE', text: input.text || '',
      kind: input.kind || 'recommendation',
      stripped, step: 0, status: 'in-flight', approved: false };
    this.proposals.set(p.id, p);
    this.ledger.seal(p.actor, 'intake', 'proposes — ' + (p.text || p.capability));
    if(stripped.length) this.ledger.seal('vera_router', 'waist', 'stripped unknown field(s) ' + stripped.join(', ') + ' — the schema names what may cross');
    return p;
  }

  /* ----- The decision machine -----
     next(p, eta) advances one constitutional decision and returns its event.
     The lens animates events; the kernel decides them. Event types:
       identity · schema · capability · veto · state · held · executed · sealed · denied */
  next(p, eta){
    if(p.status !== 'in-flight') return { type:'done', proposal:p };
    const steps = ['identity','schema','capability','state','execute','seal'];
    const step = steps[p.step];
    if(step === 'identity'){ p.step++;
      this.counters.idRefs++; const ok = !!this.resolveActor(p.actor); if(ok) this.counters.idOk++;
      return { type:'identity', ok, proposal:p }; }
    if(step === 'schema'){ p.step++;
      if(!PROPOSAL_KINDS.has(p.kind)){ p.status = 'refused'; this.stats.vetoed++; this.stats.consumed++;
        this.ledger.seal('sentinel', 'sentinel', `REFUSED — unknown proposal kind "${p.kind}"`);
        return { type:'veto', reason:'invalid-proposal-kind', proposal:p }; }
      return { type:'schema', stripped: p.stripped, proposal:p }; }
    if(step === 'capability'){ this.counters.capChecks++;
      if(!this.checkCapability(p.actor, p.capability)){ p.status = 'vetoed'; this.stats.vetoed++; this.stats.consumed++;
        this.ledger.seal('sentinel', 'sentinel', `VETO — "${p.capability}" is not in ${p.actor}'s grant set — capability disposes`);
        return { type:'veto', proposal:p }; }
      this.counters.capPass++; p.step++;
      return { type:'capability', ok:true, proposal:p }; }
    if(step === 'state'){ p.step++; this.counters.stateAttempts++;
      const legal = this.isLegal(p.transition.from, p.transition.to); if(legal) this.counters.stateLegal++;
      if(!legal){ p.status = 'refused'; this.stats.vetoed++; this.stats.consumed++;
        this.ledger.seal('sentinel', 'sentinel', `REFUSED — no legal vein ${p.transition.from} → ${p.transition.to}`);
        return { type:'veto', reason:'illegal-transition', proposal:p }; }
      return { type:'state', legal, proposal:p }; }
    if(step === 'execute'){
      if((p.kind === 'change' || APPROVAL_RISKS.has(p.risk)) && !p.approved){ p.status = 'held';
        this.ledger.seal('sentinel', 'gate', `HELD — ${p.capability} waits for the operator (risk ${p.risk})`);
        return { type:'held', proposal:p, forces: this.forcesFor(p, eta) }; }
      p.step++; this.stats.executed++; this.capReceipts[p.capability] = (this.capReceipts[p.capability]||0) + 1;
      this.ledger.seal(p.actor, 'tool', `${p.capability} executed — ${p.transition.from} → ${p.transition.to}`);
      return { type:'executed', proposal:p }; }
    /* seal */
    p.status = 'sealed';
    const receipt = this.ledger.seal('archivist', 'archivist', 'run sealed — receipt ' + p.id);
    return { type:'sealed', receipt, proposal:p };
  }

  /* ----- Operator acts — the only source of authority in the system ----- */
  approve(id){ const p = this.proposals.get(id); if(!p || p.status !== 'held') return null;
    p.approved = true; p.status = 'in-flight'; this.stats.approvals++;
    this.ledger.seal('operator', 'operator', 'EXACT APPROVAL given — one use, this run only');
    return p; }
  deny(id){ const p = this.proposals.get(id); if(!p || p.status !== 'held') return null;
    p.status = 'denied'; this.stats.denials++; this.stats.consumed++;
    this.ledger.seal('operator', 'operator', 'DENIED by the operator — the refusal seals its own receipt');
    return p; }

  /* ----- Constitutional health — one real ratio per primitive ----- */
  health(){ const pct = (a,b) => b ? Math.round(100*a/b) : 100;
    return { Identity: pct(this.counters.idOk, this.counters.idRefs),
      Capability: pct(this.counters.capPass, this.counters.capChecks),
      Proposal: pct(this.counters.propTotal - this.counters.propMalformed, this.counters.propTotal),
      State: pct(this.counters.stateLegal, this.counters.stateAttempts),
      Receipt: this.ledger.verify() ? 100 : 0 }; }
}
