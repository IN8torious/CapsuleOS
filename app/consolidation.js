// Consolidation: older agents are folded into the newer agent that supersedes them, so the graph stays small while
// new agents are added over time. An agent declares `supersededBy: <agent id>` (or the successor lists `replaces`).
// This only changes how agents are drawn; it never deletes or approves anything.

export function consolidate(agents) {
  const list = Array.isArray(agents) ? agents : [];
  const byId = new Map(list.map((agent) => [agent.id, agent]));
  const successorOf = new Map();
  for (const agent of list) {
    if (agent.supersededBy && byId.has(agent.supersededBy) && agent.supersededBy !== agent.id) {
      successorOf.set(agent.id, agent.supersededBy);
    }
    for (const oldId of Array.isArray(agent.replaces) ? agent.replaces : []) {
      if (byId.has(oldId) && oldId !== agent.id && !successorOf.has(oldId)) successorOf.set(oldId, agent.id);
    }
  }

  // Follow chains to the final successor; a cycle leaves everyone in it active.
  const finalOf = (id) => {
    const seen = new Set([id]);
    let current = id;
    while (successorOf.has(current)) {
      current = successorOf.get(current);
      if (seen.has(current)) return null;
      seen.add(current);
    }
    return current;
  };

  const active = [];
  const absorbed = new Map();
  const redirect = new Map();
  for (const agent of list) {
    const target = successorOf.has(agent.id) ? finalOf(agent.id) : agent.id;
    if (target === null || target === agent.id) {
      active.push(agent);
    } else {
      redirect.set(agent.id, target);
      if (!absorbed.has(target)) absorbed.set(target, []);
      absorbed.get(target).push(agent);
    }
  }
  return { active, absorbed, redirect };
}
