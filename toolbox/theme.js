import { applyColorProfile } from './ui-profiles.js';

const KEY = 'capsule-ui-theme-v1';
const choices = ['light', 'dark', 'system'];

function validateTheme(value) {
  if (!choices.includes(value)) throw new Error('Choose Light, Dark or Follow Windows.');
  return value;
}

export function readTheme(storage) {
  return validateTheme(storage.getItem(KEY) || 'light');
}

export function applyTheme(value, root, systemDark = false) {
  validateTheme(value);
  const resolved = value === 'system' ? (systemDark ? 'dark' : 'light') : value;
  root.dataset.themePreference = value;
  root.dataset.theme = resolved;
  applyColorProfile(root.dataset.colorProfile || 'parchment', root);
  return resolved;
}

export function saveTheme(value, storage, root, systemDark = false) {
  validateTheme(value);
  storage.setItem(KEY, value);
  return applyTheme(value, root, systemDark);
}
