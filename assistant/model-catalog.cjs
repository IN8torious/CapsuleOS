const catalog = require('./model-catalog.json');

function getModelById(id) {
  return catalog.find((model) => model.id === id) || null;
}

function getModelDownloadBytes(model) {
  return model.files.reduce((total, file) => total + file.size, 0);
}

function getPublicModelCatalog(installedIds = []) {
  const installed = new Set(installedIds);
  return catalog.map((model) => ({
    id: model.id,
    name: model.name,
    family: model.family,
    description: model.description,
    repository: model.repository,
    revision: model.revision,
    license: model.license,
    downloadBytes: getModelDownloadBytes(model),
    weightsBytes: model.weightsBytes,
    installed: installed.has(model.id)
  }));
}

module.exports = { getModelById, getModelDownloadBytes, getPublicModelCatalog };
