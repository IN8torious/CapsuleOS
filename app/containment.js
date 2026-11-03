// Containment physics for the nebula. Particles feel a soft elastic wall on an ellipsoid (a harmonic spring that
// grows with penetration), viscous damping, and a gentle swirling flow so the cloud stays alive. A hard clamp at
// HARD_LIMIT guarantees nothing can ever escape, whatever the frame time.

export const WALL = { x: 1.1, y: 0.85, z: 1.5 };
export const HARD_LIMIT = 1.08;
// Nodes may never leave this fraction of the wall, so every node sits inside the nebula.
export const NODE_LIMIT = 0.8;
const SPRING = 14;
const DAMPING = 1.6;
const FLOW = 0.05;

const radius = (x, y, z) => Math.sqrt((x / WALL.x) ** 2 + (y / WALL.y) ** 2 + (z / WALL.z) ** 2);

// Pulls any {x, y, z} point back inside NODE_LIMIT of the wall ellipsoid, in place.
export function clampInside(point, limit = NODE_LIMIT) {
  const r = radius(point.x, point.y, point.z);
  if (r > limit) {
    const s = limit / r;
    point.x *= s;
    point.y *= s;
    point.z *= s;
  }
  return point;
}

// positions/velocities are flat xyz arrays, updated in place. Returns the largest normalised radius after the step.
// With a rest array, each particle is also tethered to its own rest site by a soft spring (a soft lattice), so
// the cloud keeps its shape and only breathes around the sites.
const LATTICE = 3.2;
// An optional drive(x, y, z, out) writes an extra acceleration into out[0..2] (the fluid medium's pull).
export function stepContained(positions, velocities, dt, time, rest, drive) {
  const pull = [0, 0, 0];
  const h = Math.min(Math.max(dt, 0), 0.05);
  let worst = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    let ax = FLOW * Math.sin(1.9 * y + 0.35 * time + z) - DAMPING * velocities[i];
    let ay = FLOW * Math.sin(1.7 * z + 0.3 * time + x) - DAMPING * velocities[i + 1];
    let az = FLOW * Math.sin(1.8 * x + 0.4 * time + y) - DAMPING * velocities[i + 2];
    if (rest) {
      ax += LATTICE * (rest[i] - x);
      ay += LATTICE * (rest[i + 1] - y);
      az += LATTICE * (rest[i + 2] - z);
    }
    if (drive) {
      pull[0] = 0;
      pull[1] = 0;
      pull[2] = 0;
      drive(x, y, z, pull);
      ax += pull[0];
      ay += pull[1];
      az += pull[2];
    }
    const r = radius(x, y, z);
    if (r > 0.85) {
      // Push along the ellipsoid's inward gradient, proportional to how far past the soft shell the point is.
      const push = (SPRING * (r - 0.85)) / (r || 1);
      ax -= push * (x / WALL.x ** 2) * WALL.x;
      ay -= push * (y / WALL.y ** 2) * WALL.y;
      az -= push * (z / WALL.z ** 2) * WALL.z;
    }
    velocities[i] += ax * h;
    velocities[i + 1] += ay * h;
    velocities[i + 2] += az * h;
    let nx = x + velocities[i] * h;
    let ny = y + velocities[i + 1] * h;
    let nz = z + velocities[i + 2] * h;
    const nr = radius(nx, ny, nz);
    if (nr > HARD_LIMIT) {
      const s = HARD_LIMIT / nr;
      nx *= s;
      ny *= s;
      nz *= s;
      velocities[i] *= 0.3;
      velocities[i + 1] *= 0.3;
      velocities[i + 2] *= 0.3;
    }
    positions[i] = nx;
    positions[i + 1] = ny;
    positions[i + 2] = nz;
    worst = Math.max(worst, radius(nx, ny, nz));
  }
  return worst;
}
