// Internet privacy plan: DNS provider choices plus the network hardening tweaks.
// Data only. Nothing here changes DNS or Windows; it produces a reviewable plan.
import { TWEAKS, buildPlaybook } from './playbook.js';

export const DNS_PROVIDERS = Object.freeze([
  { id: 'system', name: 'Windows default', blurb: 'Keep the DNS your router or ISP hands out.', ipv4: [], ipv6: [], doh: null, filters: [], logs: 'Your ISP sees every lookup' },
  { id: 'cloudflare', name: 'Cloudflare 1.1.1.1', blurb: 'Fast, short-lived logs.', ipv4: ['1.1.1.1', '1.0.0.1'], ipv6: ['2606:4700:4700::1111', '2606:4700:4700::1001'], doh: 'https://cloudflare-dns.com/dns-query', filters: [], logs: 'Purged within 25 hours' },
  { id: 'cloudflare-family', name: 'Cloudflare Family', blurb: 'Blocks malware and adult content.', ipv4: ['1.1.1.3', '1.0.0.3'], ipv6: ['2606:4700:4700::1113', '2606:4700:4700::1003'], doh: 'https://family.cloudflare-dns.com/dns-query', filters: ['malware', 'adult'], logs: 'Purged within 25 hours' },
  { id: 'quad9', name: 'Quad9', blurb: 'Blocks known malicious domains.', ipv4: ['9.9.9.9', '149.112.112.112'], ipv6: ['2620:fe::fe', '2620:fe::9'], doh: 'https://dns.quad9.net/dns-query', filters: ['malware'], logs: 'No personal data stored' },
  { id: 'adguard', name: 'AdGuard DNS', blurb: 'Blocks ads and trackers for every app.', ipv4: ['94.140.14.14', '94.140.15.15'], ipv6: ['2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'], doh: 'https://dns.adguard-dns.com/dns-query', filters: ['ads', 'trackers'], logs: 'Anonymous statistics only' },
  { id: 'mullvad', name: 'Mullvad DNS', blurb: 'No logging, optional tracker blocking.', ipv4: ['194.242.2.2', '194.242.2.3'], ipv6: ['2a07:e340::2', '2a07:e340::3'], doh: 'https://dns.mullvad.net/dns-query', filters: ['ads', 'trackers'], logs: 'No logs' },
  { id: 'google', name: 'Google Public DNS', blurb: 'Fast and reliable, but tied to a data company.', ipv4: ['8.8.8.8', '8.8.4.4'], ipv6: ['2001:4860:4860::8888', '2001:4860:4860::8844'], doh: 'https://dns.google/dns-query', filters: [], logs: 'Temporary and permanent logs' },
]);

export const INTERNET_TWEAK_IDS = Object.freeze(TWEAKS.filter((entry) => entry.category === 'network').map((entry) => entry.id));

export function dnsProvider(id) {
  const found = DNS_PROVIDERS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown DNS provider "${id}".`);
  return found;
}

// Plain-language steps for the user to follow themselves in Windows Settings.
export function dnsSteps(id) {
  const provider = dnsProvider(id);
  if (!provider.ipv4.length) return ['Set the adapter back to "Automatic (DHCP)" for DNS server assignment.'];
  return [
    'Open Settings > Network & internet > your connection > Hardware properties > DNS server assignment > Edit.',
    'Choose Manual and turn IPv4 on.',
    `Preferred DNS: ${provider.ipv4[0]}. Alternate DNS: ${provider.ipv4[1]}.`,
    `Set "Preferred DNS encryption" to "Encrypted only (DNS over HTTPS)" and confirm the template is ${provider.doh}.`,
    `Optional IPv6: ${provider.ipv6.join(' and ')}, with the same encryption setting.`,
    'Save, then visit a site to confirm it loads. To undo, return to Automatic (DHCP).',
  ];
}

export function buildInternetPlan({ providerId = 'system', tweakIds = INTERNET_TWEAK_IDS } = {}) {
  const provider = dnsProvider(providerId);
  const ids = tweakIds.filter((id) => INTERNET_TWEAK_IDS.includes(id));
  const plan = {
    provider: provider.id,
    dns: provider.ipv4.length ? { ipv4: provider.ipv4, ipv6: provider.ipv6, doh: provider.doh } : null,
    steps: dnsSteps(provider.id),
    tweaks: ids,
    applied: false,
  };
  const files = ids.length ? buildPlaybook({ tweakIds: ids }).files : {};
  files['dns-plan.json'] = `${JSON.stringify(plan, null, 2)}\n`;
  files['DNS-STEPS.txt'] = `${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n`;
  return { plan, files };
}
