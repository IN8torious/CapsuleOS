import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TWEAKS } from '../app/playbook.js';

const target = fileURLToPath(new URL('../src-tauri/tweak-catalog.json', import.meta.url));
fs.writeFileSync(target, `${JSON.stringify(TWEAKS, null, 2)}\n`);
console.log(`Built native allowlist: ${TWEAKS.length} fixed tweaks.`);
