/* Independent references: scalar closed forms, RK4 in absolute coordinates,
 * finite-difference kinematics, and integrated work/energy. No test dependency. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../src/physics.js');
let checks = 0, assertions = 0;
const results = [];
function near(actual, expected, tol, label) {
  assertions++;
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tol, `${label}: got ${actual}, expected ${expected}; tolerance ${tol}`);
}
function test(name, run) { const start = performance.now(); run(); checks++; results.push({ name, status: 'PASS', ms: Math.round(performance.now() - start) }); console.log('PASS ' + name); }
function freeReference(p, t) {
  const w = Math.sqrt(p.k / p.m), z = p.mode === 'free' ? 0 : p.zeta;
  if (z < 1) { const wd = w * Math.sqrt(1 - z * z); return Math.exp(-z * w * t) * (p.x0 * Math.cos(wd * t) + (p.v0 + z * w * p.x0) / wd * Math.sin(wd * t)); }
  if (z === 1) return (p.x0 + (p.v0 + w * p.x0) * t) * Math.exp(-w * t);
  const ra = -w / (z + Math.sqrt(z * z - 1)), rb = -w * (z + Math.sqrt(z * z - 1));
  const ca = (p.v0 - rb * p.x0) / (ra - rb), cb = p.x0 - ca;
  return ca * Math.exp(ra * t) + cb * Math.exp(rb * t);
}
// Deliberately uses x,v in ground coordinates rather than engine's augmented u state.
function rhs(p, t, state) {
  const w = Math.sqrt(p.k / p.m), c = 2 * (p.mode === 'free' ? 0 : p.zeta) * Math.sqrt(p.k * p.m), om = p.r * w;
  const y = p.mode === 'base' ? p.Y * Math.sin(om * t) : 0;
  const yv = p.mode === 'base' ? p.Y * om * Math.cos(om * t) : 0;
  const F = p.mode === 'forced' ? p.F * Math.sin(om * t) : 0;
  return [state[1], (F - c * (state[1] - yv) - p.k * (state[0] - y)) / p.m];
}
function rk4(p, end, dt) {
  let x = [p.x0, p.v0], n = Math.ceil(end / dt), h = end / n;
  const add = (v, k, a) => v.map((b, i) => b + a * k[i]);
  for (let i = 0; i < n; i++) {
    const t = i * h, a = rhs(p, t, x), b = rhs(p, t + h / 2, add(x, a, h / 2)), c = rhs(p, t + h / 2, add(x, b, h / 2)), d = rhs(p, t + h, add(x, c, h));
    x = x.map((v, j) => v + h * (a[j] + 2 * b[j] + 2 * c[j] + d[j]) / 6);
  }
  return x;
}
test('All modes preserve absolute initial displacement and velocity', () => {
  for (const mode of ['free', 'damped', 'forced', 'base']) for (const zeta of [0, .1, 1, 2]) {
    const s = V.system({ mode, zeta, x0: -.13, v0: .71 }).at(0);
    near(s.x, -.13, 1e-14, mode + ' x0'); near(s.v, .71, 1e-14, mode + ' v0');
  }
});
test('Closed-form free response across all damping regimes and near criticality', () => {
  for (const zeta of [0, .001, .08, .7, .999999, 1, 1.000001, 2, 3]) {
    const sys = V.system({ mode: 'damped', zeta, x0: .1, v0: -.3 });
    for (const t of [0, .001, .1, .5, 2, 12, 60]) near(sys.at(t).x, freeReference(sys.p, t), 2e-10, `z=${zeta},t=${t}`);
  }
});
test('Undamped period, velocity, acceleration and conserved energy', () => {
  const s = V.system({ mode: 'free', m: 2, k: 83, x0: .07, v0: .24 }), p = s.p, w = s.d.wn, E = .5 * p.m * p.v0 ** 2 + .5 * p.k * p.x0 ** 2;
  for (let t = 0; t <= 60; t += .13) {
    const a = s.at(t), x = p.x0 * Math.cos(w * t) + p.v0 / w * Math.sin(w * t), v = -p.x0 * w * Math.sin(w * t) + p.v0 * Math.cos(w * t);
    near(a.x, x, 3e-10, 'x'); near(a.v, v, 3e-9, 'v'); near(a.a, -w * w * x, 3e-8, 'a'); near(a.energy, E, 3e-9, 'E');
  }
  near(s.at(s.d.Tn).x, p.x0, 1e-12, 'period');
});
test('Exact and near resonance agree with independent undamped closed form', () => {
  for (const r of [.2, .9, .999, 1, 1.001, 1.7, 4]) {
    const sys = V.system({ mode: 'forced', m: 1, k: 100, zeta: 0, r, x0: 0, v0: 0, F: 4 });
    for (const t of [.01, .7, 4, 12, 60]) {
      const expected = r === 1 ? .02 * (Math.sin(10 * t) - 10 * t * Math.cos(10 * t)) : .04 / (1 - r * r) * (Math.sin(r * 10 * t) - r * Math.sin(10 * t));
      near(sys.at(t).x, expected, 1e-8, 'resonance ' + r);
    }
  }
});
test('Independent RK4 cross-check in absolute coordinates, deterministic parameter grid', () => {
  let worst = 0;
  for (const mode of ['free', 'damped', 'forced', 'base']) for (const zeta of [0, .07, 1, 2.5]) for (const r of [0, .97, 1, 2.8]) {
    const sys = V.system({ mode, zeta, r, m: 1.3, k: 137, x0: -.04, v0: .3, F: 7, Y: .025 });
    const ref = rk4(sys.p, 2.37, .0005), a = sys.at(2.37);
    worst = Math.max(worst, Math.abs(a.x - ref[0]), Math.abs(a.v - ref[1]));
    near(a.x, ref[0], 1e-8, mode + ' RK4 x'); near(a.v, ref[1], 1e-7, mode + ' RK4 v');
  }
  results.push({ metric: 'worst RK4 absolute x/v difference', value: worst });
});
test('RK4 fourth-order convergence toward the engine', () => {
  const sys = V.system({ mode: 'base', r: 1.8, zeta: .13, x0: .06, v0: -.4 });
  const exact = sys.at(1.31).x, errors = [.02, .01, .005].map(h => Math.abs(rk4(sys.p, 1.31, h)[0] - exact));
  assert.ok(errors[0] / errors[1] > 10 && errors[1] / errors[2] > 10, JSON.stringify(errors)); assertions++;
  results.push({ metric: 'RK4 halved-step x errors (m)', value: errors });
});
test('Finite-difference kinematics and equation residual in ground coordinates', () => {
  for (const mode of ['free', 'damped', 'forced', 'base']) {
    const sys = V.system({ mode, r: 1.3, zeta: .14 });
    for (const t of [.2, 1.7, 5.3]) {
      const h = 1e-5, a = sys.at(t), lo = sys.at(t - h), hi = sys.at(t + h);
      near((hi.x - lo.x) / (2 * h), a.v, 3e-7, 'dx/dt'); near((hi.v - lo.v) / (2 * h), a.a, 3e-6, 'dv/dt');
      near(sys.p.m * a.a + sys.d.c * (a.v - a.yv) + sys.p.k * (a.x - a.y), a.force, 1e-11, 'equilibrium');
    }
  }
});
test('Trajectory recurrence agrees with direct matrix exponential', () => {
  for (const mode of ['free', 'damped', 'forced', 'base']) {
    const sys = V.system({ mode, zeta: .03, r: 1, duration: 60 }), pts = sys.trajectory(5000);
    for (const i of [0, 199, 200, 201, 1249, 4999, 5000]) {
      const exact = sys.at(pts[i].t); near(pts[i].x, exact.x, 1e-9, 'trajectory x'); near(pts[i].v, exact.v, 1e-8, 'trajectory v');
    }
  }
});
test('Energy balance including viscous loss, external work and moving-support work', () => {
  for (const mode of ['free', 'damped', 'forced', 'base']) {
    const sys = V.system({ mode, zeta: .15, r: 1.3, duration: 4 }), pts = sys.trajectory(30000), dt = 4 / 30000;
    let work = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; work += .5 * dt * (a.inputPower - a.dampingPower + b.inputPower - b.dampingPower);
      if (mode === 'damped') { assert.ok(b.energy <= a.energy + 1e-12); assertions++; }
    }
    near(pts.at(-1).energy - pts[0].energy, work, 2e-6, mode + ' energy balance');
  }
});
test('Frequency response matches initialized harmonic particular solution', () => {
  for (const mode of ['forced', 'base']) for (const zeta of [0, .05, 1, 2]) for (const r of [.2, .8, 1, 2, 3]) {
    if (zeta === 0 && r === 1) continue;
    const p = { ...V.DEFAULTS, mode, zeta, r, F: .1, Y: .001 }, f = V.frequency(p), w = Math.sqrt(p.k / p.m) * r;
    const sys = V.system({ ...p, x0: -f.amplitude * Math.sin(f.phase), v0: f.amplitude * w * Math.cos(f.phase) });
    for (const t of [0, .1, .7, 2.1]) near(sys.at(t).x, f.amplitude * Math.sin(w * t - f.phase), 3e-10, mode + ' frequency');
  }
});
test('Base isolation threshold r=sqrt(2) and relative/absolute response distinction', () => {
  for (const zeta of [0, .1, .8, 3]) {
    near(V.frequency({ mode: 'base', zeta }, Math.SQRT2).gain, 1, 1e-14, 'isolation threshold');
    assert.ok(V.frequency({ mode: 'base', zeta }, 3).gain < 1); assertions++;
  }
  const sys = V.system({ mode: 'base', r: 2.3 });
  for (const t of [.07, .8, 3]) { const s = sys.at(t); near(s.x - s.y, s.u, 1e-14, 'u=x-y'); near(s.v - s.yv, s.uv, 1e-14, 'uv=v-yv'); }
});
test('Zero forcing and zero-frequency sine excitation do not generate motion', () => {
  for (const mode of ['forced', 'base']) for (const extra of [{ F: 0, Y: 0, r: 1 }, { r: 0 }]) {
    const sys = V.system({ mode, ...extra, x0: 0, v0: 0 });
    for (const t of [0, 1, 12, 60]) near(sys.at(t).x, 0, 1e-14, 'zero motion');
  }
  assert.equal(V.frequency({ mode: 'forced', zeta: 0, F: 0, r: 1 }).amplitude, 0); assertions++;
});
test('UI parameter extremes remain finite and agree with RK4 at high frequency', () => {
  for (const zeta of [0, .999999, 1, 1.000001, 3]) for (const mode of ['damped', 'forced', 'base']) {
    const sys = V.system({ mode, m: .1, k: 1000, zeta, r: 4, x0: .3, v0: 3, Y: .1, F: 30, duration: 60 });
    for (const t of [0, .1, 12, 60]) for (const val of Object.values(sys.at(t))) { assert.ok(Number.isFinite(val)); assertions++; }
    const a = sys.at(.15), ref = rk4(sys.p, .15, .00001);
    near(a.x, ref[0], 2e-8, 'extreme x'); near(a.v, ref[1], 2e-6, 'extreme v');
  }
});
test('Validation rejects invalid input and executable strings', () => {
  for (const bad of [{ m: 0 }, { k: -1 }, { zeta: -1 }, { r: 5 }, { duration: Infinity }, { m: '1' }, { mode: '<script>' }, { x0: NaN }]) { assert.throws(() => V.system(bad)); assertions++; }
  assert.throws(() => V.system({}).at(-1)); assert.throws(() => V.system({}).at(61)); assertions += 2;
});
test('Standalone build contains no external executable or asset dependency', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=|@import|fetch\(|XMLHttpRequest|https?:\/\/[^\s"']+\.(?:js|css)/i.test(html));
  assert.ok(!/<!-- (STYLE|PHYSICS|APP) -->/.test(html)); assertions += 2;
});
const report = { version: '1.0.1', runUTC: new Date().toISOString(), node: process.version, suiteCount: checks, assertions, results, status: 'PASS' };
fs.writeFileSync(path.join(__dirname, '../VERIFICATION-core.json'), JSON.stringify(report, null, 2));
console.log(`\n${checks} suites, ${assertions} assertions passed.`);
