import { Kernel, fnv1a } from './si-kernel.js';

let fails = 0;
const check = (name, cond, extra='') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if(!cond) fails++; };

const AGENTS = [
  { id:'n8_supervisor', name:'N8', capabilities:['proposal.draft','editor.emacs.guide'] },
  { id:'vera_router', name:'Vera', capabilities:['operations.read'] },
  { id:'corvus_planner', name:'Corvus', capabilities:['estimate.calculate','documents.ingest','math.algebra.solve','math.calculus.analyze'] },
  { id:'archivist', name:'Archivist', capabilities:[] },
  { id:'zenki_guardian', name:'Zenki', capabilities:['health.read','recovery.propose'] },
  { id:'kami_communicator', name:'Kami', capabilities:['safety.draft'] },
  { id:'genki_builder', name:'Genki', capabilities:['production.plan','release.request','code.haskell.review','workspace.change.preview'] },
  { id:'sentinel', name:'Sentinel', capabilities:[] },
];
const LEGAL = [['observation','recommendation'],['recommendation','approval'],['approval','change'],['change','receipt']];
const K = new Kernel({ agents: AGENTS, legal: LEGAL });
K.ledger.seal('archivist','archivist','genesis');

function drive(p, eta = .5){ const evs = []; let e;
  do { e = K.next(p, eta); evs.push(e.type); if(e.type === 'held') return { evs, held:true }; } while(!['sealed','veto','done'].includes(e.type) && evs.length < 12);
  return { evs, held:false }; }

/* good run */
let p = K.propose({ actor:'corvus_planner', capability:'estimate.calculate', transition:{from:'observation',to:'recommendation'}, evidence:['scope','reference'], risk:'INTERNAL_REVERSIBLE', text:'Draft a project outline' });
let r = drive(p);
check('good run seals', p.status === 'sealed', r.evs.join('>'));
check('good run executed once', K.stats.executed === 1);
check('event order is constitutional', JSON.stringify(r.evs) === JSON.stringify(['identity','schema','capability','state','executed','sealed']), r.evs.join('>'));

/* ungranted capability -> veto, nothing executed */
p = K.propose({ actor:'corvus_planner', capability:'shell.exec', transition:{from:'—',to:'—'}, evidence:[], risk:'UNGRANTED', text:'raw shell' });
r = drive(p);
check('ungranted vetoes', p.status === 'vetoed' && r.evs.includes('veto'));
check('veto executed nothing', K.stats.executed === 1 && K.stats.vetoed === 1 && K.stats.consumed === 1);

/* smuggled field is stripped + counted */
p = K.propose({ actor:'corvus_planner', capability:'documents.ingest', transition:{from:'observation',to:'recommendation'}, evidence:['a','b','c'], risk:'INTERNAL_REVERSIBLE', text:'organize reference material', scopes:['admin'] });
check('smuggle stripped at the router', JSON.stringify(p.stripped) === '["scopes"]' && !('scopes' in p));
r = drive(p);
check('stripped run still seals (schema, not suspicion)', p.status === 'sealed');

/* illegal transition refused by the State service */
p = K.propose({ actor:'genki_builder', capability:'production.plan', transition:{from:'recommendation',to:'unlisted-state'}, evidence:[], risk:'INTERNAL_REVERSIBLE', text:'jump the graph' });
r = drive(p);
check('unlisted workflow state has no legal transition', p.status === 'refused', r.evs.join('>'));

/* Every change holds for exact operator approval, even when reversible */
p = K.propose({ kind:'change', actor:'genki_builder', capability:'workspace.change.preview', transition:{from:'approval',to:'change'}, evidence:['preview','scope','impact'], risk:'INTERNAL_REVERSIBLE', text:'Apply the selected workspace change' });
r = drive(p);
check('every change holds for the operator, regardless of risk', r.held && p.status === 'held');
const f = K.forcesFor(p, .5);
check('change approval barrier is independent of risk', f.momentum === 3*2 + 2 + 0 && f.opposition === 2 && f.barrier === true, JSON.stringify(f));
K.approve(p.id);
r = drive(p);
check('approval releases exactly that change proposal', p.status === 'sealed' && K.stats.approvals === 1);

/* denied change is sealed and never executes */
const e0 = K.stats.executed;
p = K.propose({ kind:'change', actor:'genki_builder', capability:'workspace.change.preview', transition:{from:'approval',to:'change'}, evidence:['preview'], risk:'INTERNAL_REVERSIBLE', text:'Apply another workspace change' });
drive(p); K.deny(p.id);
check('denial seals the refusal and executes nothing', p.status === 'denied' && K.stats.executed === e0 && K.stats.denials === 1);

p = K.propose({ kind:'autonomous-change', actor:'genki_builder', capability:'workspace.change.preview', transition:{from:'approval',to:'change'}, evidence:[], risk:'INTERNAL_REVERSIBLE', text:'invalid kind' });
r = drive(p);
check('unknown proposal kinds fail closed', p.status === 'refused' && r.evs.includes('veto'));

/* unknown actor: identity fails, capability fails closed */
p = K.propose({ actor:'mallory', capability:'estimate.calculate', transition:{from:'observation',to:'recommendation'}, evidence:[], risk:'INTERNAL_REVERSIBLE', text:'intruder' });
r = drive(p);
check('unknown actor cannot execute (fail-closed)', p.status === 'vetoed');

/* health: real ratios, receipt binary */
const H = K.health();
check('health has the five primitives', JSON.stringify(Object.keys(H)) === JSON.stringify(['Identity','Capability','Proposal','State','Receipt']), JSON.stringify(H));
check('receipt health is chain truth', H.Receipt === 100 && K.ledger.verify());

/* tamper: state cannot rewrite receipt (I4) */
const saved = K.ledger.entries[2].event; K.ledger.entries[2].event = 'forged';
check('tampered ledger fails verification', !K.ledger.verify());
K.ledger.entries[2].event = saved;
check('restored ledger verifies', K.ledger.verify());

/* determinism of the hash */
check('fnv stable', fnv1a('GENESIS|1|a|b|c') === fnv1a('GENESIS|1|a|b|c'));

/* P2.8-A: field notes — host-counted push/drag enter the formula exactly */
{ const fp = K.propose({ kind:'observation', actor:'vera_router', capability:'operations.read', transition:{from:'observation',to:'observation · read — no transition'}, evidence:['workspace'], risk:'READ_ONLY', text:'field probe' });
  const base = K.forcesFor(fp, .5), withField = K.forcesFor(fp, .5, { push: 2, drag: 1 });
  check('no field argument = pre-amendment law (regression)', base.parts.fieldPush === 0 && base.parts.fieldDrag === 0 && base.net === base.momentum - base.opposition);
  check('field push adds exactly to momentum', withField.momentum === base.momentum + 2, `${base.momentum} -> ${withField.momentum}`);
  check('field drag adds exactly to opposition', withField.opposition === base.opposition + 1, `${base.opposition} -> ${withField.opposition}`);
  check('net still = momentum - opposition under field', withField.net === withField.momentum - withField.opposition);
  check('conflicts stays an honest 0 (field drag is not a conflict)', withField.parts.conflicts === 0 && withField.parts.risk === 0);
  const r2 = drive(fp); check('field probe run still seals (force is not outcome)', fp.status === 'sealed', r2.evs.join('>')); }

check('math, Haskell, and Emacs guidance are explicitly granted', [
  K.checkCapability('corvus_planner', 'math.algebra.solve'),
  K.checkCapability('corvus_planner', 'math.calculus.analyze'),
  K.checkCapability('genki_builder', 'code.haskell.review'),
  K.checkCapability('n8_supervisor', 'editor.emacs.guide'),
].every(Boolean));
{ const p = K.propose({ kind:'observation', actor:'corvus_planner', capability:'math.algebra.solve',
    transition:{from:'—',to:'— · read — no transition'}, evidence:['equation'], risk:'READ_ONLY', text:'Solve a sample equation' });
  const r = drive(p);
  check('algebra task routes through the read-only proposal path', p.status === 'sealed' && r.evs.includes('executed'), r.evs.join('>')); }

console.log(fails ? `KERNEL TESTS: ${fails} FAILURES` : 'KERNEL TESTS: ALL PASS');
process.exit(fails ? 1 : 0);
