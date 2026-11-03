const hexColor = /^#[0-9a-f]{6}$/i;
const luminance = channels => channels.reduce((sum, channel, index) => {
  const c = channel / 255;
  return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
}, 0);
const toHex = channels => `#${channels.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

function customProfile(color) {
  const channels = color.slice(1).match(/../g).map(c => Number.parseInt(c, 16));
  let bright = channels;
  for (let mix = 0.1; luminance(bright) > 0.15 && mix <= 1; mix += 0.1) bright = channels.map(c => c * (1 - mix));
  return { accent: color.toLowerCase(), bright: toHex(bright), dim: toHex(channels.map(c => c * 0.6)), rgb: channels.join(',') };
}

export const COLOR_PROFILES = [
  { id: 'parchment', name: 'Capsule gold', accent: '#846324', bright: '#846324', dim: '#594318', rgb: '132,99,36' },
  { id: 'capsule', name: 'Capsule crimson', accent: '#e72a43', bright: '#b92136', dim: '#9c1931', rgb: '231,42,67' },
  ...[['#f06a30', 'Orange'], ['#edb827', 'Gold'], ['#b2cc35', 'Lime'], ['#35a75a', 'Green']].map(([id, name]) => ({ id, name, ...customProfile(id) })),
  { id: 'forest', name: 'Forest teal', accent: '#218878', bright: '#1d7a6c', dim: '#175b51', rgb: '33,136,120' },
  { id: '#26c6da', name: 'Cyan', ...customProfile('#26c6da') },
  { id: 'ocean', name: 'Ocean blue', accent: '#357bbd', bright: '#306faa', dim: '#245581', rgb: '53,123,189' },
  { id: '#5c6bdd', name: 'Indigo', ...customProfile('#5c6bdd') },
  { id: 'violet', name: 'Midnight violet', accent: '#8860bd', bright: '#7a56aa', dim: '#5d4084', rgb: '136,96,189' },
  ...[['#cb4cce', 'Magenta'], ['#ed76ad', 'Pink'], ['#f0eef4', 'White'], ['#8c8a96', 'Gray'], ['#292633', 'Charcoal']].map(([id, name]) => ({ id, name, ...customProfile(id) }))
];
const KEY = 'capsule-ui-color-profile-v1';

export function getColorProfile(id) {
  const preset = COLOR_PROFILES.find(profile => profile.id === id);
  if (preset) return preset;
  if (typeof id === 'string' && id.length === 7 && hexColor.test(id)) return { id: id.toLowerCase(), ...customProfile(id) };
  throw new Error('Choose a supported profile or a six-digit hex color.');
}

export function readColorProfile(storage) {
  const id = storage.getItem(KEY) || 'parchment';
  return getColorProfile(id).id;
}

export function applyColorProfile(id, root) {
  const profile = getColorProfile(id);
  let highlight = profile.bright;
  if (root.dataset.theme === 'dark') {
    const channels = profile.accent.slice(1).match(/../g).map(c => Number.parseInt(c, 16));
    let readable = channels;
    for (let mix = 0.1; luminance(readable) < 0.5 && mix <= 1; mix += 0.1) readable = channels.map(c => c + (255 - c) * mix);
    highlight = toHex(readable);
  }
  root.dataset.colorProfile = profile.id;
  for (const [key, value] of Object.entries({
    '--accent': profile.accent, '--accent-bright': highlight,
    '--accent-dim': profile.dim, '--accent-rgb': profile.rgb,
    '--accent-ink': luminance(profile.rgb.split(',').map(Number)) > 0.179 ? '#100d14' : '#fff7fb'
  })) root.style.setProperty(key, value);
}

export function saveColorProfile(id, storage, root) {
  const profile = getColorProfile(id);
  storage.setItem(KEY, profile.id);
  applyColorProfile(profile.id, root);
}
