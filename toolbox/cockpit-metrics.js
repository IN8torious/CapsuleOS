export function createReceiptTickets() {
  const seen = new Set();
  let count = 0;
  return {
    update(receipts) {
      for (const receipt of receipts) {
        if (typeof receipt.hash !== 'string' || !receipt.hash || seen.has(receipt.hash)) continue;
        seen.add(receipt.hash);
        count++;
      }
      if (seen.size > 4096) {
        const recent = [...seen].slice(-4096);
        seen.clear();
        recent.forEach(hash => seen.add(hash));
      }
      return count;
    },
    reset() { count = 0; return count; },
    get count() { return count; }
  };
}

export function cockpitMetrics(snapshot, referenceAgents, workflows) {
  const connected = Boolean(snapshot);
  const healthValues = Object.values(snapshot?.health || {}).filter(value => Number.isFinite(value) && value >= 0 && value <= 100);
  return {
    agents: connected ? (snapshot.agents || []).length : referenceAgents.length,
    workflows: (snapshot?.tasks || []).length + workflows.length,
    agentLabel: connected ? 'Agents in the connected workspace' : 'Bundled reference crew; no live activity claimed',
    workflowLabel: connected ? 'Starter routes plus saved workflows' : 'Saved data-only workflows on this device',
    health: connected && healthValues.length ? `${Math.min(...healthValues)}%` : connected ? 'UNKNOWN' : 'OFFLINE',
    healthLabel: !connected ? 'Connect Capsule OS Browser for live kernel health' : !healthValues.length ? 'No valid kernel health measurement supplied' :
      snapshot.ledgerValid ? 'Reported kernel health; receipt chain verified' : 'Reported kernel health; receipt chain is not verified'
  };
}
