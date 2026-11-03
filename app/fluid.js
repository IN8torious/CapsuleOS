// Stable-fluid solver (Jos Stam) on an N x N grid, ported from the Altiminac instrument.
// Diffusion, semi-Lagrangian advection and pressure projection; temperature obeys Boussinesq (hot = light = rises).
// Field coordinates are 0..1 with +y pointing DOWN (screen convention), so rising fluid has negative v.

export function createFluid(N = 32, { viscosity = 0.00008, diffusion = 0.00012, buoyancy = 2.6, cooling = 0.996, iterations = 14 } = {}) {
  const size = (N + 2) * (N + 2);
  const IX = (i, j) => i + (N + 2) * j;
  const u = new Float32Array(size);
  const v = new Float32Array(size);
  const u0 = new Float32Array(size);
  const v0 = new Float32Array(size);
  const heat = new Float32Array(size);
  const heat0 = new Float32Array(size);

  function setBnd(b, x) {
    for (let i = 1; i <= N; i += 1) {
      x[IX(0, i)] = b === 1 ? -x[IX(1, i)] : x[IX(1, i)];
      x[IX(N + 1, i)] = b === 1 ? -x[IX(N, i)] : x[IX(N, i)];
      x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
      x[IX(i, N + 1)] = b === 2 ? -x[IX(i, N)] : x[IX(i, N)];
    }
    x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
    x[IX(0, N + 1)] = 0.5 * (x[IX(1, N + 1)] + x[IX(0, N)]);
    x[IX(N + 1, 0)] = 0.5 * (x[IX(N, 0)] + x[IX(N + 1, 1)]);
    x[IX(N + 1, N + 1)] = 0.5 * (x[IX(N, N + 1)] + x[IX(N + 1, N)]);
  }

  function linSolve(b, x, x0_, a, c) {
    for (let k = 0; k < iterations; k += 1) {
      for (let j = 1; j <= N; j += 1) {
        for (let i = 1; i <= N; i += 1) {
          x[IX(i, j)] = (x0_[IX(i, j)] + a * (x[IX(i - 1, j)] + x[IX(i + 1, j)] + x[IX(i, j - 1)] + x[IX(i, j + 1)])) / c;
        }
      }
      setBnd(b, x);
    }
  }

  function diffuse(b, x, x0_, diff, dt) {
    const a = dt * diff * N * N;
    linSolve(b, x, x0_, a, 1 + 4 * a);
  }

  function advect(b, d, d0, uu, vv, dt) {
    const dt0 = dt * N;
    for (let j = 1; j <= N; j += 1) {
      for (let i = 1; i <= N; i += 1) {
        const x = Math.max(0.5, Math.min(N + 0.5, i - dt0 * uu[IX(i, j)]));
        const y = Math.max(0.5, Math.min(N + 0.5, j - dt0 * vv[IX(i, j)]));
        const i0 = Math.floor(x);
        const j0 = Math.floor(y);
        const s1 = x - i0;
        const t1 = y - j0;
        d[IX(i, j)] = (1 - s1) * ((1 - t1) * d0[IX(i0, j0)] + t1 * d0[IX(i0, j0 + 1)])
          + s1 * ((1 - t1) * d0[IX(i0 + 1, j0)] + t1 * d0[IX(i0 + 1, j0 + 1)]);
      }
    }
    setBnd(b, d);
  }

  function project(uu, vv, p, div) {
    const h = 1 / N;
    for (let j = 1; j <= N; j += 1) {
      for (let i = 1; i <= N; i += 1) {
        div[IX(i, j)] = -0.5 * h * (uu[IX(i + 1, j)] - uu[IX(i - 1, j)] + vv[IX(i, j + 1)] - vv[IX(i, j - 1)]);
        p[IX(i, j)] = 0;
      }
    }
    setBnd(0, div);
    setBnd(0, p);
    linSolve(0, p, div, 1, 4);
    for (let j = 1; j <= N; j += 1) {
      for (let i = 1; i <= N; i += 1) {
        uu[IX(i, j)] -= (0.5 * (p[IX(i + 1, j)] - p[IX(i - 1, j)])) / h;
        vv[IX(i, j)] -= (0.5 * (p[IX(i, j + 1)] - p[IX(i, j - 1)])) / h;
      }
    }
    setBnd(1, uu);
    setBnd(2, vv);
  }

  function step(dt) {
    for (let k = 0; k < size; k += 1) v[k] -= heat[k] * buoyancy * dt;
    u0.set(u);
    diffuse(1, u, u0, viscosity, dt);
    v0.set(v);
    diffuse(2, v, v0, viscosity, dt);
    project(u, v, u0, v0);
    u0.set(u);
    v0.set(v);
    advect(1, u, u0, u0, v0, dt);
    advect(2, v, v0, u0, v0, dt);
    project(u, v, u0, v0);
    heat0.set(heat);
    diffuse(0, heat, heat0, diffusion, dt);
    heat0.set(heat);
    advect(0, heat, heat0, u, v, dt);
    for (let k = 0; k < size; k += 1) heat[k] *= cooling;
  }

  // Bilinear sample of a field at 0..1 coordinates.
  function sample(field, fx, fy) {
    const i = Math.max(1, Math.min(N, 1 + fx * N));
    const j = Math.max(1, Math.min(N, 1 + fy * N));
    const i0 = Math.min(N, Math.floor(i));
    const j0 = Math.min(N, Math.floor(j));
    const s = i - i0;
    const t = j - j0;
    return field[IX(i0, j0)] * (1 - s) * (1 - t) + field[IX(i0 + 1, j0)] * s * (1 - t)
      + field[IX(i0, j0 + 1)] * (1 - s) * t + field[IX(i0 + 1, j0 + 1)] * s * t;
  }

  // L3 · vorticity omega = dv/dx - du/dy at a cell: where the flow curls, memory persists.
  function curl(i, j) {
    return (v[IX(i + 1, j)] - v[IX(i - 1, j)]) - (u[IX(i, j + 1)] - u[IX(i, j - 1)]);
  }

  // Heat source: a gaussian blob at 0..1 coordinates.
  function addHeat(fx, fy, strength, radius = 2) {
    const gx = 1 + fx * N;
    const gy = 1 + fy * N;
    const span = Math.ceil(radius * 2);
    for (let j = -span; j <= span; j += 1) {
      for (let i = -span; i <= span; i += 1) {
        const ci = Math.max(1, Math.min(N, Math.round(gx + i)));
        const cj = Math.max(1, Math.min(N, Math.round(gy + j)));
        const k = IX(ci, cj);
        heat[k] = Math.min(2.4, heat[k] + strength * Math.exp(-(i * i + j * j) / (radius * radius)));
      }
    }
  }

  function addVelocity(fx, fy, du, dv) {
    const k = IX(Math.max(1, Math.min(N, 1 + Math.floor(fx * N))), Math.max(1, Math.min(N, 1 + Math.floor(fy * N))));
    u[k] += du;
    v[k] += dv;
  }

  // Largest absolute divergence over the interior (should be ~0 after projection).
  function maxDivergence() {
    let worst = 0;
    for (let j = 1; j <= N; j += 1) {
      for (let i = 1; i <= N; i += 1) {
        worst = Math.max(worst, Math.abs(u[IX(i + 1, j)] - u[IX(i - 1, j)] + v[IX(i, j + 1)] - v[IX(i, j - 1)]) / (2 * N));
      }
    }
    return worst;
  }

  function meanSpeed() {
    let total = 0;
    for (let j = 1; j <= N; j += 1) for (let i = 1; i <= N; i += 1) total += Math.hypot(u[IX(i, j)], v[IX(i, j)]);
    return total / (N * N);
  }

  return { N, u, v, heat, IX, step, sample, curl, addHeat, addVelocity, maxDivergence, meanSpeed };
}
