import { MAX_OBJECTS, validateScene } from './scene-format.js';

export const EDIT_FORMAT = 'capsule-scene-edit';
export const EDIT_VERSION = 1;
export const MAX_OPS = 50;
export const MAX_EDIT_BYTES = 64 * 1024;

const OBJECT_FIELDS = ['type', 'name', 'color', 'position', 'rotation', 'scale'];
const SET_FIELDS = ['name', 'color', 'position', 'rotation', 'scale'];
const SCENE_FIELDS = ['name', 'background'];

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, allowed, required = []) => {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key));
};

export function parseEditFile(source) {
  if (typeof source !== 'string' || source.length > MAX_EDIT_BYTES) {
    return { ok: false, message: 'Edit file is too large.' };
  }
  try {
    return { ok: true, edit: JSON.parse(source) };
  } catch {
    return { ok: false, message: 'Edit file is not valid JSON.' };
  }
}

export function applyEdit(scene, edit, makeId) {
  const fail = (message) => ({ ok: false, message });
  if (!isPlain(edit) || !onlyKeys(edit, ['format', 'version', 'ops'], ['format', 'version', 'ops'])) {
    return fail('Edit has missing or unknown fields.');
  }
  if (edit.format !== EDIT_FORMAT || edit.version !== EDIT_VERSION) return fail('Not a Capsule scene edit (version 1).');
  if (!Array.isArray(edit.ops) || edit.ops.length === 0 || edit.ops.length > MAX_OPS) {
    return fail(`An edit holds 1–${MAX_OPS} operations.`);
  }

  const draft = JSON.parse(JSON.stringify(scene));
  const summary = [];
  for (const [index, op] of edit.ops.entries()) {
    const at = `Operation ${index + 1}`;
    if (!isPlain(op) || typeof op.op !== 'string') return fail(`${at} is malformed.`);
    if (op.op === 'add') {
      if (!onlyKeys(op, ['op', 'object'], ['op', 'object']) || !isPlain(op.object) ||
        !onlyKeys(op.object, OBJECT_FIELDS, OBJECT_FIELDS)) return fail(`${at}: add needs a complete object.`);
      if (draft.objects.length >= MAX_OBJECTS) return fail(`A scene holds at most ${MAX_OBJECTS} objects.`);
      draft.objects.push({ id: makeId(), ...op.object });
      summary.push(`Add ${op.object.type} "${op.object.name}"`);
    } else if (op.op === 'update') {
      if (!onlyKeys(op, ['op', 'id', 'set'], ['op', 'id', 'set']) || !isPlain(op.set) ||
        !onlyKeys(op.set, SET_FIELDS) || Object.keys(op.set).length === 0) return fail(`${at}: update needs an id and fields to set.`);
      const target = draft.objects.find((object) => object.id === op.id);
      if (!target) return fail(`${at}: no object with that id.`);
      Object.assign(target, op.set);
      summary.push(`Change "${target.name}": ${Object.keys(op.set).join(', ')}`);
    } else if (op.op === 'remove') {
      if (!onlyKeys(op, ['op', 'id'], ['op', 'id'])) return fail(`${at}: remove needs only an id.`);
      const target = draft.objects.find((object) => object.id === op.id);
      if (!target) return fail(`${at}: no object with that id.`);
      draft.objects = draft.objects.filter((object) => object.id !== op.id);
      summary.push(`Remove "${target.name}"`);
    } else if (op.op === 'scene') {
      if (!onlyKeys(op, ['op', 'set'], ['op', 'set']) || !isPlain(op.set) ||
        !onlyKeys(op.set, SCENE_FIELDS) || Object.keys(op.set).length === 0) return fail(`${at}: scene needs name or background.`);
      Object.assign(draft, op.set);
      summary.push(`Scene: ${Object.keys(op.set).join(', ')}`);
    } else {
      return fail(`${at}: unknown operation.`);
    }
  }

  const checked = validateScene(draft);
  if (!checked.ok) return fail(checked.message);
  return { ok: true, scene: checked.scene, summary };
}

export function aiInstructions(scene) {
  return [
    'You are editing a Capsule 3D scene. Reply with ONLY one JSON object, no prose.',
    `Shape: {"format":"${EDIT_FORMAT}","version":${EDIT_VERSION},"ops":[...]} with 1-${MAX_OPS} ops.`,
    'Ops: {"op":"add","object":{"type","name","color","position","rotation","scale"}} | {"op":"update","id","set":{...fields}} | {"op":"remove","id"} | {"op":"scene","set":{"name"?,"background"?}}.',
    'type: box|sphere|cylinder|cone|torus. color: #rrggbb. position: [x,y,z] within ±1000. rotation: degrees [x,y,z] within ±360. scale: [x,y,z] between 0.01 and 100. Names 1-60 chars. Max 200 objects.',
    'No scripts, URLs, or other fields. The user reviews your edit before anything changes.',
    'Current scene:',
    JSON.stringify(scene)
  ].join('\n');
}
