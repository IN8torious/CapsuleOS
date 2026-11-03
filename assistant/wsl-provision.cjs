'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { inspectDistributions, validateSettings } = require('./wsl-runtime.cjs');
const { verifyModelFiles } = require('./model-store.cjs');
const { getModelById, getPublicModelCatalog } = require('./model-catalog.cjs');
const run = promisify(execFile);
const wsl = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');
const BOOTSTRAP = `
set -eu
root="$HOME/.local/share/capsule-agent"
test "$(uname -m)" = x86_64 || { echo "The bundled Linux runtime requires x86_64." >&2; exit 1; }
test "$(id -u)" != 0 || { echo "Use the distribution's non-root default user." >&2; exit 1; }
test ! -L "$HOME/.local" && test ! -L "$HOME/.local/share" && test ! -L "$root" || { echo "Runtime paths must not be symlinks." >&2; exit 1; }
mkdir -p "$root"
test "$(stat -f -c %T "$root")" = ext2/ext3 || { echo "Runtime destination must reside on ext4." >&2; exit 1; }
test ! -e "$root/provision.lock" || { echo "A provisioning lock already exists. Inspect the previous receipt first." >&2; exit 1; }
mkdir "$root/provision.lock"
trap 'rmdir "$root/provision.lock"' EXIT
if test ! -e "$root/node-v22.23.4-linux-x64"; then
  test ! -e "$root/node_modules" && test ! -e "$root/package.json" || { echo "An incomplete existing runtime needs manual review; nothing will be overwritten." >&2; exit 1; }
  tar -xf "$1" -C "$root"
fi
"$root/node-v22.23.4-linux-x64/bin/node" --input-type=module -e "$2" "$root" "$3"
`;
const COPY_MODELS = `
import fs from 'node:fs/promises';import {createReadStream} from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const [root,encoded]=process.argv.slice(1), config=JSON.parse(encoded);
const require=createRequire(path.join(root,'package.json'));
const resolved=require.resolve('@huggingface/transformers');
if(JSON.parse(await fs.readFile(path.join(path.dirname(resolved),'..','package.json'),'utf8')).version!=='4.3.2')throw Error('Linux Transformers version mismatch');
const modules=await fs.realpath(path.join(root,'node_modules'));if(modules!==path.join(root,'node_modules'))throw Error('Linux dependencies must not be symlinks');
async function verify(directory,model){for(const file of model.files){const target=path.join(directory,file.path);if(await fs.realpath(target)!==target)throw Error('Model symlinks are forbidden');const stat=await fs.stat(target);if(!stat.isFile()||stat.size!==file.size)throw Error('Wrong model size: '+file.path);const hash=crypto.createHash(file.sha256?'sha256':'sha1');if(!file.sha256)hash.update('blob '+file.size+'\\0');for await(const chunk of createReadStream(target))hash.update(chunk);if(hash.digest('hex')!==(file.sha256||file.sha1))throw Error('Model hash mismatch: '+file.path)}}
const models=path.join(root,'models');await fs.mkdir(models,{recursive:true});if(await fs.realpath(models)!==models)throw Error('Models directory must not be a symlink');
for(const item of config){const model=item.model,dest=path.join(models,model.id);try{await fs.access(dest);await verify(dest,model);console.log(model.id+': existing verified files retained');continue}catch(error){if(error.code!=='ENOENT')throw error}
const stage=await fs.mkdtemp(path.join(models,'.provision-'));try{for(const file of model.files){const target=path.join(stage,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(item.source,file.path),target,1)}await verify(stage,model);await fs.writeFile(path.join(stage,'si-model-install.json'),JSON.stringify({id:model.id,revision:model.revision,license:model.license,verifiedAt:new Date().toISOString()}));await fs.rename(stage,dest);console.log(model.id+': copied and hash-verified on ext4')}catch(error){await fs.rm(stage,{recursive:true,force:true});throw error}}
console.log('Offline WSL runtime and both models are ready. No Windows administration, Linux root, downloads or services were used.');
`;

class WslProvisioner {
  constructor({ directory, payloadRoot, modelLocations }) {
    Object.assign(this, { directory, payloadRoot, modelLocations });
    this.preview = null;
    this.busy = false;
  }
  async plan(distro) {
    validateSettings({ policy: 'prefer-wsl', distro });
    if (!(await inspectDistributions()).includes(distro)) throw new Error('Choose a registered WSL2 distribution.');
    const manifest = JSON.parse(await fs.readFile(path.join(this.payloadRoot, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || manifest.file !== 'linux-runtime.tar' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('The bundled Linux runtime manifest is invalid.');
    const locations = await this.modelLocations();
    const models = getPublicModelCatalog().map(model => {
      const location = locations.get(model.id);
      if (!location) throw new Error(`Bundled Windows model missing: ${model.id}`);
      return { id: model.id, source: location.directory };
    });
    this.preview = { id: randomUUID(), distro, createdAt: Date.now(), manifest, models,
      changes: ['Start only the selected existing distribution as its default non-root user.',
        'Create ~/.local/share/capsule-agent on ext4; extract the bundled Linux Node 22.23.4 / Transformers 4.3.2 runtime only if missing.',
        'Copy both bundled pinned models into its models directory and verify every file; preserve existing valid files and refuse to overwrite invalid/incomplete existing content.',
        'No network downloads, root/sudo, Windows admin changes, services, distro installation, global Node installation or automatic runtime-policy switch.',
        'Allow at least 6 GiB free Linux disk space. Partial failure may leave runtime files; inspect the receipt before retrying. No automatic rollback of existing files.'] };
    return this.preview;
  }
  async execute({ approvalId, distro, confirmed }) {
    if (this.busy) throw new Error('WSL setup is already running.');
    const preview = this.preview;
    if (!confirmed || !preview || preview.id !== approvalId || preview.distro !== distro || Date.now() - preview.createdAt > 300000) throw new Error('Review and explicitly approve the current WSL setup plan.');
    this.preview = null;
    this.busy = true;
    const file = path.join(this.directory, 'wsl-setup-receipt.json');
    let started = false;
    const receipt = { id: preview.id, distro, changes: preview.changes, status: 'running', startedAt: new Date().toISOString() };
    const save = async () => { await fs.mkdir(this.directory, { recursive: true }); await fs.writeFile(file, JSON.stringify(receipt, null, 2)); };
    try {
      try {
        const previous = JSON.parse(await fs.readFile(file, 'utf8'));
        if (['running', 'uncertain'].includes(previous.status)) throw new Error('Previous WSL setup is unresolved. Inspect wsl-setup-receipt.json and the Linux runtime lock before retrying.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await save();
      started = true;
      if (!(await inspectDistributions()).includes(distro)) throw new Error('The approved distribution is no longer available.');
      const archive = path.join(this.payloadRoot, 'linux-runtime.tar');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(archive)) hash.update(chunk);
      if (hash.digest('hex') !== preview.manifest.sha256) throw new Error('Bundled Linux runtime failed SHA-256 verification.');
      const linuxPath = async file => (await run(wsl, ['--distribution', distro, '--exec', 'wslpath', '-a', '-u', file], { timeout: 15000, windowsHide: true })).stdout.trim();
      const config = [];
      for (const item of preview.models) {
        const model = getModelById(item.id);
        await verifyModelFiles(item.source, model);
        config.push({ model, source: await linuxPath(item.source) });
      }
      const result = await run(wsl, ['--distribution', distro, '--cd', '~', '--exec', '/bin/sh', '-c', BOOTSTRAP, 'capsule-offline-setup',
        await linuxPath(archive), COPY_MODELS, JSON.stringify(config)], { timeout: 600000, maxBuffer: 128 * 1024, windowsHide: true, env: { ...process.env, WSLENV: '' } });
      receipt.status = 'completed'; receipt.output = result.stdout.trim();
      return { ok: true, receipt };
    } catch (error) {
      receipt.status = error.killed ? 'uncertain' : 'failed';
      receipt.output = [error.message, error.stderr].filter(Boolean).join('\n').slice(-6000);
      throw new Error(`WSL setup ${receipt.status}: ${receipt.output}`);
    } finally { this.busy = false; receipt.finishedAt = new Date().toISOString(); if (started) await save(); }
  }
}
module.exports = { WslProvisioner, BOOTSTRAP, COPY_MODELS };
