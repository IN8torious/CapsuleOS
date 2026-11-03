export const SCENE_FORMAT = 'capsule-scene';
export const SCENE_VERSION = 1;
export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus'];
export const MAX_OBJECTS = 200;
export const MAX_FILE_BYTES = 256 * 1024;

const COORD_LIMIT = 1000;
const SCALE_MIN = 0.01;
const SCALE_MAX = 100;
const SCENE_KEYS = ['format', 'version', 'name', 'background', 'objects'];
const OBJECT_KEYS = ['id', 'type', 'name', 'color', 'position', 'rotation', 'scale'];
const COLOR = /^#[0-9a-fA-F]{6}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  const own = Object.keys(value);
  return own.length === keys.length && own.every((key) => keys.includes(key));
}

function vector(value, min, max) {
  return Array.isArray(value) && value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
}

function text(value, max) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

export function validateScene(input) {
  const fail = (message) => ({ ok: false, message });
  if (!isPlainObject(input) || !hasExactKeys(input, SCENE_KEYS)) return fail('Scene has missing or unknown fields.');
  if (input.format !== SCENE_FORMAT || input.version !== SCENE_VERSION) return fail('Not a Capsule scene (version 1).');
  if (!text(input.name, 60)) return fail('Scene name must be 1–60 characters.');
  if (typeof input.background !== 'string' || !COLOR.test(input.background)) return fail('Background must be a #rrggbb color.');
  if (!Array.isArray(input.objects) || input.objects.length > MAX_OBJECTS) {
    return fail(`A scene holds at most ${MAX_OBJECTS} objects.`);
  }
  const ids = new Set();
  const objects = [];
  for (const item of input.objects) {
    if (!isPlainObject(item) || !hasExactKeys(item, OBJECT_KEYS)) return fail('An object has missing or unknown fields.');
    if (!text(item.id, 40) || ids.has(item.id)) return fail('Object ids must be unique.');
    ids.add(item.id);
    if (!SHAPES.includes(item.type)) return fail('Unsupported shape type.');
    if (!text(item.name, 60)) return fail('Object names must be 1–60 characters.');
    if (typeof item.color !== 'string' || !COLOR.test(item.color)) return fail('Object colors must be #rrggbb.');
    if (!vector(item.position, -COORD_LIMIT, COORD_LIMIT)) return fail('Object position is out of range.');
    if (!vector(item.rotation, -360, 360)) return fail('Object rotation is out of range.');
    if (!vector(item.scale, SCALE_MIN, SCALE_MAX)) return fail('Object scale is out of range.');
    objects.push({
      id: item.id,
      type: item.type,
      name: item.name,
      color: item.color.toLowerCase(),
      position: [...item.position],
      rotation: [...item.rotation],
      scale: [...item.scale]
    });
  }
  return {
    ok: true,
    scene: {
      format: SCENE_FORMAT,
      version: SCENE_VERSION,
      name: input.name,
      background: input.background.toLowerCase(),
      objects
    }
  };
}

export function parseSceneFile(source) {
  if (typeof source !== 'string' || source.length > MAX_FILE_BYTES) {
    return { ok: false, message: 'Scene file is too large.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, message: 'Scene file is not valid JSON.' };
  }
  return validateScene(parsed);
}

export function emptyScene(name = 'Untitled scene') {
  return { format: SCENE_FORMAT, version: SCENE_VERSION, name, background: '#0b1220', objects: [] };
}
