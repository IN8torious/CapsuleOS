import catalog from '../assistant/model-catalog.json' with { type: 'json' };
import { readWithDeadline } from './bridge.js';

export function includedModelCatalog() {
  return catalog.map(({ files, dtype, ...model }) => ({
    ...model, downloadBytes: files.reduce((total, file) => total + file.size, 0), installed: null
  }));
}

export async function inspectModelAvailability(invoke, timeoutMs = 20000) {
  return readWithDeadline(Promise.all([invoke('get_assistant_catalog'), invoke('get_assistant_status')]), timeoutMs, 'Model status');
}
