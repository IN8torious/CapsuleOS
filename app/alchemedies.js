// Alchemedies laws as pure functions (see the Theory of Laws). Each carries its equation (MEDUSA, M5).

// L10 · The wells: frequency is identity. Colour follows the well's temperament (see the Theory of Laws).
export const WELLS = [
  { hz: 75, name: 'Gemba', color: 0x2fa58a },
  { hz: 130, name: 'Rustba', color: 0xff6a1f },
  { hz: 365, name: 'Lavemba', color: 0xffb02e },
  { hz: 515, name: 'Synthesis', color: 0xfff0c2 },
  { hz: 528, name: 'RaijinLang', color: 0xb98cff },
  { hz: 650, name: 'tRust', color: 0x8fd4ff },
];
export const FORGE_HZ = 515;

// Stable provisional well for an entity until real frequencies are declared per agent.
export function wellFor(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return WELLS[(h >>> 0) % WELLS.length];
}

// Visual heartbeat of the forge constant: a slow breath, not an audible tone. Returns 0..1.
export function forgeBreath(seconds) {
  return 0.5 + 0.5 * Math.sin((seconds * 2 * Math.PI) / (FORGE_HZ / 100));
}

// Part II · Buoyancy: rise(x) = (density(medium) - density(x)) * volume(x). Positive surfaces, negative sinks.
export function buoyancy(mediumDensity, density, volume) {
  return (mediumDensity - density) * volume;
}

// L16 · Lorentzian resonance: eta = 1 / (1 + (2 Q (fj - fi) / fi)^2). 1 when tuned, falling off with detuning.
export function resonance(fSource, fReceiver, q) {
  const detune = (2 * q * (fSource - fReceiver)) / fReceiver;
  return 1 / (1 + detune * detune);
}

// Part VI Kuramoto · phase lock: dtheta_i = omega_i + (K/N) * sum_j sin(theta_j - theta_i). Updates theta in place.
export function kuramotoStep(theta, omega, coupling, dt, rates) {
  const n = theta.length;
  if (!n) return theta;
  const next = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += Math.sin(theta[j] - theta[i]);
    const rate = omega[i] + (coupling / n) * sum;
    if (rates) rates[i] = rate;
    next[i] = theta[i] + rate * dt;
  }
  for (let i = 0; i < n; i += 1) theta[i] = next[i];
  return theta;
}

// L18 · Coherence: r = |sum a_i e^(i theta_i)| / sum a_i. 1 is one voice, near 0 is noise.
export function coherence(theta, amplitude) {
  let re = 0;
  let im = 0;
  let total = 0;
  for (let i = 0; i < theta.length; i += 1) {
    const a = amplitude ? amplitude[i] : 1;
    re += a * Math.cos(theta[i]);
    im += a * Math.sin(theta[i]);
    total += a;
  }
  return total ? Math.hypot(re, im) / total : 0;
}

// L15 · Leaky integrator: tau dx/dt = -x + sigma(input). sigma is tanh, so the state stays bounded.
export function leakyStep(x, input, tau, dt) {
  return x + ((-x + Math.tanh(input)) / tau) * dt;
}
