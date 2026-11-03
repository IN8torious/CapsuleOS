const HOME_DEMO_URL = 'si-core-demo://prototype/index.html';

function normalizeNavigationInput(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Enter a website address.');
  }

  const value = input.trim();
  const explicitWebScheme = /^https?:\/\//i.test(value);
  const unsupportedScheme = /^[a-z][a-z\d+.-]*:(?!\d+(?:\/|$))/i.test(value);
  if (unsupportedScheme && !explicitWebScheme) {
    throw new Error('Only HTTP and HTTPS websites can be opened.');
  }

  const candidate = explicitWebScheme ? value : `https://${value}`;
  let url;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error('That address is not valid.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Only HTTP and HTTPS websites can be opened.');
  }

  return url.toString();
}

function isAllowedContentUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === 'http:' || url.protocol === 'https:';
}

module.exports = { HOME_DEMO_URL, isAllowedContentUrl, normalizeNavigationInput };
