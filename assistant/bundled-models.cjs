const fs = require('node:fs/promises');
const path = require('node:path');
const { getInstalledModelIds, modelDirectory } = require('./model-store.cjs');

async function findModelLocations({ modelRoot, workspacePath, userDataPath, resourcesPath }) {
  const roots = [{ root: modelRoot, bundled: false }, { root: path.join(workspacePath, 'bundled-models'), bundled: true }];
  if (resourcesPath) roots.push({ root: path.join(resourcesPath, 'models'), bundled: true });
  const registration = path.join(path.dirname(userDataPath), 'toolbox-models.json');
  let content = null;
  try {
    const stat = await fs.lstat(registration);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Toolbox model registration must be a regular file no larger than 4 KiB.');
    content = await fs.readFile(registration, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (content !== null) {
    const record = JSON.parse(content);
    if (record.version !== 1 || typeof record.root !== 'string' || !path.isAbsolute(record.root)) throw new Error('Toolbox model registration is invalid.');
    roots.push({ root: record.root, bundled: true });
  }
  const locations = new Map();
  for (const { root, bundled } of roots) {
    for (const id of await getInstalledModelIds(root)) {
      if (!locations.has(id)) locations.set(id, { directory: modelDirectory(root, id), bundled });
    }
  }
  return locations;
}

module.exports = { findModelLocations };
