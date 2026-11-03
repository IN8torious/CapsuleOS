export function proposalSummary(proposals) {
  const pending = proposals.filter(item => item.status === 'pending').length;
  return {
    pending,
    badge: pending > 99 ? '99+' : String(pending),
    label: `${pending} pending agent proposal${pending === 1 ? '' : 's'}`
  };
}

export function proposalHistory(proposals, status = 'all') {
  if (!['all', 'pending', 'reviewed', 'dismissed'].includes(status)) throw new Error('Choose a supported proposal filter.');
  return proposals.filter(item => status === 'all' || item.status === status)
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export function syncProposalNotifications(document, proposals, unavailable = false) {
  const summary = proposalSummary(proposals);
  const message = unavailable ? 'Proposal history unavailable; open notifications to refresh' : summary.label;
  for (const id of ['directory-proposal-count', 'header-proposal-count', 'agent-proposal-nav-count']) {
    const badge = document.getElementById(id);
    badge.textContent = unavailable ? '!' : summary.badge;
    badge.hidden = !unavailable && !summary.pending;
    badge.title = message;
  }
  const bell = document.querySelector('#proposal-notifications');
  bell.setAttribute('aria-label', `Notifications & changes · ${message}`);
  bell.title = `Notifications & changes · ${message}`;
  const apps = document.querySelector('#directory-toggle');
  apps.setAttribute('aria-label', `Open app directory · ${message}`);
  apps.title = `App directory (/) · ${message}`;
}
