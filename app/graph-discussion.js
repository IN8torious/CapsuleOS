import { PERFORMANCE_GOALS } from './performance-advisor.js';

const el = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
};

export function createGraphDiscussion(host, closeRoster, controls) {
  const toggle = el('button', 'graph-discussion-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Open agent discussion and decisions');
  toggle.title = 'Discussion & decisions';
  const bubble = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  bubble.setAttribute('viewBox', '0 0 24 24');
  bubble.setAttribute('width', '18');
  bubble.setAttribute('height', '18');
  bubble.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.setAttribute('d', 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z');
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'currentColor');
  outline.setAttribute('stroke-width', '1.7');
  outline.setAttribute('stroke-linejoin', 'round');
  bubble.append(outline);
  toggle.append(bubble);
  toggle.setAttribute('aria-expanded', 'false');
  const panel = el('section', 'graph-discussion');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Agent task discussion and user direction');
  panel.id = `${host.id}-discussion`;
  toggle.setAttribute('aria-controls', panel.id);
  const heading = el('div', 'graph-discussion-heading');
  const close = el('button', '', 'Close');
  close.type = 'button';
  const closePanel = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  close.addEventListener('click', () => { closePanel(); toggle.focus(); });
  heading.append(el('strong', '', 'Agent discussion & decisions'), close);
  const note = el('p', '', 'Rule-based deliberation from inspected proposals and actual routed-task events. Not invented model chat. Gains below are potential benefits; no speed-up or loss has been measured.');
  const direction = el('select', '');
  direction.setAttribute('aria-label', 'Next task direction');
  for (const [id, label] of Object.entries(PERFORMANCE_GOALS)) {
    const option = el('option', '', label);
    option.value = id;
    direction.append(option);
  }
  const choose = el('button', '', 'Inspect this direction');
  choose.type = 'button';
  choose.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('capsule-graph-direction', { detail: { goal: direction.value } }));
  });
  const directions = el('div', 'graph-discussion-actions');
  directions.append(direction, choose);
  const threads = el('div', 'graph-discussion-threads');
  const proposalForm = el('form', 'graph-proposal-form');
  const proposalLabel = el('label', '', 'Propose a change to the agents');
  const proposalInput = el('textarea');
  proposalInput.rows = 2;
  proposalInput.maxLength = 240;
  proposalInput.required = true;
  proposalInput.placeholder = 'For example: make my laptop more responsive on battery';
  proposalLabel.append(proposalInput);
  const send = el('button', '', 'Propose change');
  send.type = 'submit';
  const proposalStatus = el('p', 'graph-proposal-status', 'Your proposal is discussion, not permission to change Windows.');
  proposalStatus.setAttribute('role', 'status');
  proposalForm.append(proposalLabel, send, proposalStatus);
  proposalForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = proposalInput.value.trim();
    if (!text || text.length > 240) { proposalStatus.textContent = 'Use 1-240 characters.'; return; }
    send.disabled = true;
    proposalStatus.textContent = 'The agents are checking the supported scope and reading Windows evidence.';
    window.dispatchEvent(new CustomEvent('capsule-user-proposal', { detail: {
      text,
      reply(message) { proposalStatus.textContent = message; send.disabled = false; },
    } }));
  });
  panel.append(heading, note, proposalForm, directions, threads);
  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    closeRoster();
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closePanel(); toggle.focus(); }
  });
  controls.prepend(toggle);
  host.append(panel);
  let signature = '';
  return {
    close: closePanel,
    update(receipts, discussions) {
      const recentReceipts = receipts.slice(-8).reverse();
      const recentDiscussions = discussions.slice(-4).reverse();
      const next = JSON.stringify([recentReceipts, recentDiscussions]);
      if (next === signature) return;
      signature = next;
      const scrollTop = panel.scrollTop;
      threads.replaceChildren();
      toggle.title = `Discussion & decisions (${recentDiscussions.length + recentReceipts.length})`;
      if (!recentDiscussions.length && !recentReceipts.length) {
        threads.append(el('p', '', 'No discussion or task events recorded in this app session. Choose a direction to inspect real Windows settings and start a proposal thread.'));
      }
      for (const thread of recentDiscussions) {
        const card = el('article', 'graph-discussion-thread');
        card.append(el('strong', '', `${thread.topic} / ${thread.decision.toUpperCase()}`),
          el('small', '', `${thread.goal ? 'Inspected' : 'Recorded'} ${new Date(thread.createdAt).toLocaleTimeString()} / local rule-based agents`));
        if (!thread.messages.length) card.append(el('p', '', 'No setting changes proposed for the inspected state. No performance gain has been measured.'));
        for (const message of thread.messages) {
          const item = el('div', 'graph-discussion-message');
          item.append(el('strong', '', `${message.speaker} / ${message.role}`), el('p', '', message.text));
          if (message.gain) item.append(el('p', 'graph-potential-gain', `Potential gain: ${message.gain}`));
          if (message.loss) item.append(el('p', 'graph-potential-loss', `Possible loss: ${message.loss}`));
          if (message.check) item.append(el('small', '', `Verify: ${message.check}`));
          card.append(item);
        }
        const actions = el('div', 'graph-discussion-actions');
        for (const [decision, label] of [['review', 'Review settings'], ['defer', 'Defer'], ['dismiss', 'Dismiss']]) {
          const button = el('button', '', label);
          button.type = 'button';
          button.disabled = thread.decision !== 'pending';
          button.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('capsule-graph-decision', { detail: { id: thread.id, decision } }));
          });
          actions.append(button);
        }
        if (thread.goal) card.append(actions);
        threads.append(card);
      }
      for (const receipt of recentReceipts) {
        const event = el('article', 'graph-discussion-thread');
        event.append(el('strong', '', `${receipt.agent} / recorded task event`),
          el('p', '', receipt.event), el('small', '', `Receipt #${receipt.seq} / ${receipt.hash}`));
        threads.append(event);
      }
      panel.scrollTop = scrollTop;
    },
  };
}
