export function formatAgentMath(math) {
  const f = value => Number.isFinite(value) ? value.toFixed(5) : 'unavailable';
  return [
    `simulation t=${f(math.time)} s; dt=${f(math.dt)} s`,
    `theta before=${f(math.before)} rad; after=${f(math.after)} rad`,
    `omega=${f(math.omega)} rad/s; K=${f(math.coupling)}; N=${math.count}`,
    `dtheta/dt=${f(math.rate)} rad/s`,
    'dtheta/dt = omega + (K/N) * sum sin(theta_j - theta_i)',
    'theta_after = theta_before + (dtheta/dt) * dt',
    `density=${f(math.density)}; buoyancy=${f(math.rise)}`,
    'buoyancy = (1 - density) * 1; vertical offset = buoyancy * 0.12',
    `position [scene units]=(${math.position.map(f).join(', ')})`,
    `coherence r=${f(math.coherence)}; r=abs(mean(exp(i*theta)))`,
    `roughness=${f(math.roughness)}; metalness=${f(math.metalness)}`,
    `emissive intensity=${f(math.emissive)}; receipt count=${math.receipts}`,
    `texture map=${math.hasTexture ? 'mesh texture' : 'none; actual colored material'}`,
    'Source: app/alchemedies.js and the graph render step.',
    'Graph simulation math, not neural activations, model reasoning or Windows performance.'
  ].join('\n');
}
