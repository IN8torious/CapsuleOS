import { invoke } from './bridge.js';
import { DNS_PROVIDERS, INTERNET_TWEAK_IDS, buildInternetPlan, dnsProvider, dnsSteps } from '../app/internet.js';
import { TWEAKS, needsAdmin } from '../app/playbook.js';
import { createZip } from '../app/zip.js';
import { attachTweakActions } from './tweak-actions.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountInternet(root) {
  let providerId = 'quad9';
  const selected = new Set(INTERNET_TWEAK_IDS.filter((id) => TWEAKS.find((t) => t.id === id).risk === 'low'));

  root.replaceChildren();
  const heading = el('div', 'page-heading');
  const text = el('div');
  text.append(el('div', 'eyebrow', 'CAPSULE OS / INTERNET'), el('h1', '', 'Private internet.'),
    el('p', '', 'Choose a DNS provider and review fixed network-hardening settings before applying. DNS and hardening are separate changes, each requiring confirmation.'));
  heading.append(text, el('span', 'chip-safe', 'CONFIRM BEFORE CHANGE'));

  const dnsPanel = el('section', 'panel net-panel');
  const dnsGrid = el('div', 'net-providers');
  const detail = el('div', 'net-detail');
  const dnsLive = el('div', 'net-live', 'Current DNS: checking…');
  const switchRow = el('div', 'net-switch');
  const switchButton = el('button', 'primary-button', 'Apply DNS settings');
  const switchNote = el('small', '', 'Needs the desktop app run as administrator. Asks you to confirm first; "Windows default" resets it.');
  switchRow.append(switchButton, switchNote);
  dnsPanel.append(el('div', 'eyebrow', 'DNS PROVIDER'), dnsLive, dnsGrid, detail, switchRow);

  const hardPanel = el('section', 'panel net-panel');
  const hardList = el('div', 'net-hard');
  hardPanel.append(el('div', 'eyebrow', 'PRIVACY HARDENING'), hardList);

  const bar = el('div', 'pb-bar glass-bezel');
  const counter = el('span', 'pb-count');
  const status = el('span', 'inline-status');
  status.setAttribute('role', 'status');
  const exportButton = el('button', 'primary-button', 'Export plan');
  bar.append(counter, status, exportButton);
  attachTweakActions(bar, status, () => [...selected]);

  function renderProviders() {
    dnsGrid.replaceChildren();
    for (const provider of DNS_PROVIDERS) {
      const card = el('button', `net-card${provider.id === providerId ? ' on' : ''}`);
      card.type = 'button';
      card.append(el('strong', '', provider.name), el('small', '', provider.blurb));
      if (provider.filters.length) card.append(el('span', 'net-tags', provider.filters.join(' · ').toUpperCase()));
      card.addEventListener('click', () => { providerId = provider.id; render(); });
      dnsGrid.append(card);
    }
    const provider = dnsProvider(providerId);
    detail.replaceChildren();
    const facts = el('div', 'net-facts');
    facts.append(el('span', '', `Logging: ${provider.logs}`));
    if (provider.ipv4.length) facts.append(el('span', '', `IPv4 ${provider.ipv4.join(', ')}`), el('span', '', `DoH ${provider.doh}`));
    const steps = el('ol', 'net-steps');
    for (const step of dnsSteps(providerId)) steps.append(el('li', '', step));
    detail.append(facts, steps);
  }

  function renderHardening() {
    hardList.replaceChildren();
    for (const id of INTERNET_TWEAK_IDS) {
      const entry = TWEAKS.find((t) => t.id === id);
      const row = el('label', `net-row${selected.has(id) ? ' on' : ''}`);
      const box = el('input');
      box.type = 'checkbox';
      box.checked = selected.has(id);
      box.addEventListener('change', () => { if (box.checked) selected.add(id); else selected.delete(id); render(); });
      const body = el('div');
      const badges = el('div', 'pb-badges');
      badges.append(el('span', `risk-${entry.risk}`, entry.risk.toUpperCase()));
      if (needsAdmin(entry)) badges.append(el('span', '', 'ADMIN'));
      body.append(el('strong', '', entry.title), el('small', '', entry.description), badges);
      row.append(box, body);
      hardList.append(row);
    }
  }

  function render() {
    renderProviders();
    renderHardening();
    counter.textContent = `${dnsProvider(providerId).name} · ${selected.size} of ${INTERNET_TWEAK_IDS.length} hardening`;
  }

  exportButton.addEventListener('click', () => {
    try {
      const { files, plan } = buildInternetPlan({ providerId, tweakIds: [...selected] });
      const url = URL.createObjectURL(new Blob([createZip(files)], { type: 'application/zip' }));
      const link = el('a');
      link.href = url;
      link.download = 'CapsuleInternetPlan.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `Exported ${plan.tweaks.length} hardening tweaks and DNS steps. Nothing was applied.`;
    } catch (error) {
      status.textContent = error.message;
    }
  });

  async function refreshLive() {
    try {
      const { adapters } = await invoke('inspect_dns');
      dnsLive.textContent = adapters.length
        ? `Current DNS: ${adapters.map((a) => `${a.InterfaceAlias} → ${[].concat(a.ServerAddresses).join(', ') || 'automatic'}`).join(' · ')}`
        : 'Current DNS: no active adapter found.';
    } catch {
      dnsLive.textContent = 'Current DNS: only readable in the Capsule desktop app.';
    }
  }

  switchButton.addEventListener('click', async () => {
    const provider = dnsProvider(providerId);
    if (!window.confirm(`Switch DNS on your active network adapters to ${provider.name}? You can switch back to Windows default at any time.`)) return;
    switchButton.disabled = true;
    try {
      const result = await invoke('set_dns_provider', { providerId, confirmed: true });
      status.textContent = result.message;
    } catch (error) {
      status.textContent = typeof error === 'string' ? error : 'DNS switching is only available in the Capsule desktop app.';
    } finally {
      switchButton.disabled = false;
      refreshLive();
    }
  });

  root.append(heading, dnsPanel, hardPanel, bar);
  render();
  refreshLive();
}
