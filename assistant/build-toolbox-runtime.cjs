'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function buildRuntime() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build the Toolbox runtime on Windows x64.');
  await require('./build-model-installer.cjs').buildModelInstaller();
  const root = path.join(__dirname, '..');
  const destination = path.join(root, 'src-tauri', 'runtime');
  const staging = await fs.mkdtemp(path.join(root, 'src-tauri', '.runtime-build-'));
  try {
    const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const listing = spawnSync(process.execPath, [npm, 'ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' });
    if (listing.error || listing.status !== 0) throw new Error(`Production dependency inventory failed: ${listing.stderr || listing.error}`);
    const modules = path.join(root, 'node_modules');
    const dependencies = listing.stdout.trim().split(/\r?\n/).filter(file => file.startsWith(modules + path.sep));
    if (!dependencies.some(file => file.endsWith(path.join('@huggingface', 'transformers')))) throw new Error('Transformers dependency was not found.');
    await fs.copyFile(process.execPath, path.join(staging, 'node.exe'));
    await fs.copyFile(path.join(path.dirname(process.execPath), 'LICENSE'), path.join(staging, 'NODE-LICENSE.txt'));
    await fs.writeFile(path.join(staging, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    await fs.mkdir(path.join(staging, 'assistant'));
    for (const file of await fs.readdir(__dirname)) {
      if (/\.(cjs|mjs|json)$/.test(file) && !/^(?:build-|prepare-|package-|playbook-export)/.test(file)) {
        await fs.copyFile(path.join(__dirname, file), path.join(staging, 'assistant', file));
      }
    }
    await fs.mkdir(path.join(staging, 'capsule'));
    await fs.copyFile(path.join(root, 'capsule', 'companion-bridge.cjs'), path.join(staging, 'capsule', 'companion-bridge.cjs'));
    await fs.mkdir(path.join(staging, 'app'));
    await fs.copyFile(path.join(root, 'app', 'scene-html-edit.js'), path.join(staging, 'app', 'scene-html-edit.js'));
    await fs.copyFile(path.join(root, 'app', 'bible.js'), path.join(staging, 'app', 'bible.js'));
    const top = dependencies.filter(file => !dependencies.some(parent => file !== parent && file.startsWith(parent + path.sep)));
    for (const file of top) {
      const target = path.join(staging, path.relative(root, file));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(file, target, { recursive: true, dereference: true });
    }
    const smoke = spawnSync(path.join(staging, 'node.exe'), ['--input-type=module', '-e',
      "await import('@huggingface/transformers'); await import('./assistant/toolbox-runtime.cjs'); console.log('Bundled runtime imports ready');"],
    { cwd: staging, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } });
    if (smoke.status !== 0) throw new Error(`Bundled dependency check failed: ${smoke.stderr}`);
    const backup = destination + '.previous';
    try { await fs.access(backup); throw new Error('Previous runtime backup exists; inspect it before rebuilding.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let replaced = false;
    try { await fs.rename(destination, backup); replaced = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.rename(staging, destination); }
    catch (error) { if (replaced) await fs.rename(backup, destination); throw error; }
    if (replaced) await fs.rm(backup, { recursive: true });
    console.log(`Bundled Windows Node ${process.version} and ${dependencies.length} production dependency directories.`);
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

if (require.main === module) buildRuntime().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildRuntime };
