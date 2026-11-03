import { WELLS, coherence, forgeBreath, kuramotoStep } from '../app/alchemedies.js';
import { d120 } from './terrain.js';

const OSCILLATORS = 6;
const COUPLING = 0.9;

// Water and wind are driven by SI Core's Kuramoto law: coupled phases lock into swells,
// and the coherence r sets how orderly the sea and gusts are. Pure maths, no authority.
export function createMotion(seed) {
  const theta = new Float64Array(OSCILLATORS);
  const omega = new Float64Array(OSCILLATORS);
  const angle = new Float64Array(OSCILLATORS);
  const wavenumber = new Float64Array(OSCILLATORS);
  const amplitude = new Float64Array(OSCILLATORS);
  for (let i = 0; i < OSCILLATORS; i += 1) {
    const roll = d120(seed, i, 0, 77);
    const well = WELLS[i % WELLS.length];
    theta[i] = (roll / 120) * Math.PI * 2;
    omega[i] = 0.6 + (well.hz % 97) / 90;
    angle[i] = (d120(seed, i, 1, 78) / 120) * Math.PI * 2;
    wavenumber[i] = 0.35 + (d120(seed, i, 2, 79) / 120) * 0.6;
    amplitude[i] = 0.09 / (1 + i * 0.5);
  }
  const windAngle = (d120(seed, 9, 9, 80) / 120) * Math.PI * 2;
  const wind = { x: Math.cos(windAngle), z: Math.sin(windAngle) };
  let time = 0;
  let r = coherence(theta);
  let gust = 0.5;

  function step(dt) {
    time += dt;
    kuramotoStep(theta, omega, COUPLING, dt);
    r = coherence(theta);
    gust = 0.35 + 0.65 * forgeBreath(time * 0.4) * (0.5 + 0.5 * Math.sin(theta[0] - theta[1]));
  }

  function waveHeight(x, z) {
    let h = 0;
    for (let i = 0; i < OSCILLATORS; i += 1) {
      const along = x * Math.cos(angle[i]) + z * Math.sin(angle[i]);
      h += amplitude[i] * Math.sin(wavenumber[i] * along + theta[i]);
    }
    return h;
  }

  // Sway in world units for foliage `height` cells above its base. Grows with height squared.
  function windSway(x, z, height) {
    if (height <= 0) return { x: 0, z: 0 };
    const lean = gust * 0.09 * height * height / (1 + height * 0.35);
    const flutter = Math.sin(theta[2] + (x + z) * 0.45) * 0.05 * height;
    return { x: wind.x * lean + wind.z * flutter, z: wind.z * lean - wind.x * flutter };
  }

  return {
    step,
    waveHeight,
    windSway,
    get coherence() { return r; },
    get gust() { return gust; },
    get time() { return time; },
    wind
  };
}
