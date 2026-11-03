import { PERFORMANCE_GOALS } from './performance-advisor.js';

export function routePerformanceIntent(text) {
  const value = String(text).trim();
  if (!value || value.length > 240) throw new Error('Describe the proposed change in 1-240 characters.');
  if (/(?:disable|remove|turn off).*(?:defender|firewall|uac|smartscreen|secure boot)|overclock|undervolt/i.test(value)) return null;
  if (/\bunplugged\b|\bon battery\b|\bbattery life\b|\bsave battery\b/i.test(value)) return 'laptop-battery';
  if (/\bplugged[ -]?in\b|\bac power\b|\bcharging\b/i.test(value)) return 'laptop-ac';
  if (/\bbattery\b|\blaptop\b/i.test(value)) return 'laptop-battery';
  if (/\bgam(?:e|es|ing)\b|\bfps\b|\bcapture\b/i.test(value)) return 'gaming';
  if (/\bbackground\b|\bidle\b|\bmemory\b|\bram\b/i.test(value)) return 'background';
  if (/responsiv|desktop|animation|transparen|menus?|slow|faster|performance/i.test(value)) return 'responsiveness';
  return null;
}

export function createUserDiscussion(text, response, now = Date.now()) {
  const proposal = String(text).trim();
  if (!proposal || proposal.length > 240) throw new Error('Describe the proposed change in 1-240 characters.');
  return {
    id: `user-${now}`, goal: null, topic: 'Your proposed change', createdAt: now, decision: 'needs-scope',
    messages: [
      { speaker: 'You', role: 'User proposal', text: proposal },
      { speaker: 'Vera', role: 'Rule-based routing', text: response },
    ],
  };
}

export function createPerformanceDiscussion(goal, proposals, now = Date.now(), userText = '') {
  if (!Object.hasOwn(PERFORMANCE_GOALS, goal) || !Array.isArray(proposals)) {
    throw new Error('A discussion requires a supported goal and inspected proposals.');
  }
  return {
    id: `performance-${now}-${goal}`,
    goal,
    topic: PERFORMANCE_GOALS[goal],
    createdAt: now,
    decision: 'pending',
    messages: [
      ...(userText ? [{ speaker: 'You', role: 'User proposal', text: String(userText).slice(0, 240) }] : []),
      ...(!proposals.length ? [{
        speaker: 'Corvus', role: 'Rule-based proposal',
        text: 'No setting changes are proposed for this inspected state. No performance gain has been measured.',
      }] : []),
      ...proposals.flatMap((proposal) => [
      {
        speaker: 'Corvus', role: 'Rule-based proposal', tweakId: proposal.tweakId,
        text: proposal.title, gain: proposal.benefit, loss: proposal.tradeoff,
      },
      {
        speaker: 'Veda', role: 'Evidence check', tweakId: proposal.tweakId,
        text: `${proposal.evidence.length} registry values inspected. ${proposal.unsetValues ? 'Some values are not configured; active Windows defaults remain unknown. ' : ''}Registry state is not a measured performance result.`,
        check: proposal.measure,
      },
      {
        speaker: 'Gaven', role: 'Approval boundary', tweakId: proposal.tweakId,
        text: `${proposal.risk.toUpperCase()} risk. No change has been approved. A fresh exact-value preview, your confirmation and administrator approval are required.`,
      },
      ]),
    ],
  };
}

export function decideDiscussion(discussion, decision) {
  if (!['review', 'defer', 'dismiss'].includes(decision)) throw new Error('Unsupported discussion decision.');
  return { ...discussion, decision };
}
