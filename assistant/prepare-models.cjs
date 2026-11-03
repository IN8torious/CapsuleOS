const fs = require('node:fs/promises');
const path = require('node:path');
const { getModelById, getPublicModelCatalog } = require('./model-catalog.cjs');
const { downloadModel, getInstalledModelIds, verifyModelFiles, copyVerifiedModel } = require('./model-store.cjs');

async function main() {
  const root = path.join(__dirname, '..', 'bundled-models');
  const verifyOnly = process.argv.includes('--verify');
  const previous = process.env.APPDATA ? path.join(process.env.APPDATA, 'Capsule OS', 'Browser', 'models') : null;
  const available = previous ? await getInstalledModelIds(previous) : [];
  await fs.mkdir(root, { recursive: true });
  for (const publicModel of getPublicModelCatalog()) {
    const model = getModelById(publicModel.id);
    const destination = path.join(root, model.id);
    const installed = await getInstalledModelIds(root);
    if (!installed.includes(model.id)) {
      if (verifyOnly) throw new Error(`Offline model is missing: ${model.name}. Run npm run prepare:models.`);
      if (available.includes(model.id)) {
        console.log(`Verifying existing ${model.name} before copying into the offline bundle.`);
        const source = path.join(previous, model.id);
        const staging = await fs.mkdtemp(path.join(root, `.copy-${model.id}-`));
        try {
          await copyVerifiedModel(source, staging, model);
          await fs.rename(staging, destination);
        } catch (error) {
          await fs.rm(staging, { recursive: true, force: true });
          throw error;
        }
      } else {
        console.log(`Downloading pinned ${model.name} for the offline bundle.`);
        await downloadModel({
          root, modelId: model.id, signal: AbortSignal.timeout(30 * 60 * 1000),
          onProgress: progress => console.log(`${model.id}: ${progress.percent}% · ${progress.currentFile}`)
        });
      }
    }
    await verifyModelFiles(destination, model);
    console.log(`Verified ${model.name}: all ${model.files.length} files, including license and pinned weights.`);
  }
  console.log('Both approved models are ready in bundled-models. No installer was built or released.');
}

main().catch(error => { console.error(`Offline model preparation failed: ${error.message}`); process.exitCode = 1; });
