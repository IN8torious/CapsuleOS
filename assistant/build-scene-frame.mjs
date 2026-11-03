import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../toolbox/scene-frame-runtime.js', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const hash = crypto.createHash('sha256').update(source).digest('base64');
const policy = `default-src 'none'; script-src 'sha256-${hash}' blob:; style-src 'unsafe-inline'; img-src blob: data:; connect-src blob: data:; font-src blob: data:; media-src blob:; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
fs.writeFileSync(new URL('../toolbox/scene-frame.html', import.meta.url), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"></head><body><div id="scene-root"></div><script>${source}</script></body></html>`);
const scriptPolicy = `script-src 'self' blob: 'sha256-${hash}';`;
const synchronize = policy => policy.replace(/script-src[^;]*;/, scriptPolicy)
  .replace(/style-src 'self';(?: style-src-attr 'unsafe-inline';)?/, "style-src 'self'; style-src-attr 'unsafe-inline';");
const htmlPath = new URL('../toolbox/index.html', import.meta.url);
fs.writeFileSync(htmlPath, synchronize(fs.readFileSync(htmlPath, 'utf8')));
const configPath = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.app.security.csp = synchronize(config.app.security.csp);
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('Built isolated scene document with pinned bootstrap CSP hashes.');
