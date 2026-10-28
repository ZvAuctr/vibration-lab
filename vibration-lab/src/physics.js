/* Vibration Lab — SI units throughout. No DOM or third-party dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Vibration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = { mode: 'damped', m: 1, k: 100, zeta: 0.08, x0: 0.08, v0: 0, F: 4, Y: 0.02, r: 0.8, duration: 12 };
  const LIMITS = { m: [0.1, 20], k: [1, 1000], zeta: [0, 3], x0: [-0.3, 0.3], v0: [-3, 3], F: [0, 30], Y: [0, 0.1], r: [0, 4], duration: [2, 60] };
  function validate(input) {
    const p = Object.assign({}, DEFAULTS, input);
    if (!['free', 'damped', 'forced', 'base'].includes(p.mode)) throw Error('未知实验类型');
    for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
      if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) throw Error(key + ' 超出允许范围 [' + lo + ', ' + hi + ']');
    }
    if (p.mode === 'free') p.zeta = 0;
    return p;
  }
  function derived(p) {
    const wn = Math.sqrt(p.k / p.m), z = p.mode === 'free' ? 0 : p.zeta;
    return { wn, fn: wn / (2 * Math.PI), Tn: 2 * Math.PI / wn, c: 2 * z * Math.sqrt(p.k * p.m), cc: 2 * Math.sqrt(p.k * p.m), omega: p.r * wn,
      wd: z < 1 ? wn * Math.sqrt(1 - z * z) : null, regime: z === 0 ? '无阻尼' : z < 1 ? '欠阻尼' : z === 1 ? '临界阻尼' : '过阻尼' };
  }
  const eye = () => Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 1 : 0);
  function mul(a, b) {
    const c = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) c[4 * i + j] += a[4 * i + k] * b[4 * k + j];
    return c;
  }
  function mv(a, v) { return [0, 1, 2, 3].map(i => a[4 * i] * v[0] + a[4 * i + 1] * v[1] + a[4 * i + 2] * v[2] + a[4 * i + 3] * v[3]); }
  // exp(A t), scaling/squaring with a converged Taylor series on ||At||inf <= 0.5.
  // The augmented sin/cos state avoids divisions by (1-r²) and handles exact resonance.
  function expm(a, t) {
    let norm = 0;
    for (let i = 0; i < 4; i++) norm = Math.max(norm, a.slice(i * 4, i * 4 + 4).reduce((s, v) => s + Math.abs(v * t), 0));
    const s = Math.max(0, Math.ceil(Math.log2(norm / 0.5)) || 0), b = a.map(v => v * t / Math.pow(2, s));
    let result = eye(), term = eye();
    for (let n = 1; n <= 40; n++) {
      term = mul(term, b).map(v => v / n);
      result = result.map((v, i) => v + term[i]);
      if (Math.max(...term.map(Math.abs)) < 2e-17) break;
    }
    for (let i = 0; i < s; i++) result = mul(result, result);
    return result;
  }
  function system(input) {
    const p = validate(input), d = derived(p), base = p.mode === 'base';
    const drive = p.mode === 'forced' ? p.F / p.m : base ? p.Y * d.omega * d.omega : 0;
    // Base mode internal coordinate u=x-y, with ABSOLUTE initial x0,v0.
    const A = [0, 1, 0, 0, -d.wn * d.wn, -d.c / p.m, drive, 0, 0, 0, 0, d.omega, 0, 0, -d.omega, 0];
    const initial = [p.x0, p.v0 - (base ? p.Y * d.omega : 0), 0, 1];
    function unpack(t, state) {
      // Evaluate excitation analytically, eliminating sin/cos recurrence drift in outputs.
      const sin = Math.sin(d.omega * t), cos = Math.cos(d.omega * t);
      const y = base ? p.Y * sin : 0, yv = base ? p.Y * d.omega * cos : 0, ya = base ? -p.Y * d.omega ** 2 * sin : 0;
      const u = state[0], uv = state[1], ua = -(d.wn ** 2) * u - d.c / p.m * uv + drive * sin;
      const x = u + y, v = uv + yv, a = ua + ya, force = p.mode === 'forced' ? p.F * sin : 0;
      const kinetic = 0.5 * p.m * v * v, potential = 0.5 * p.k * u * u;
      return { t, x, v, a, u, uv, ua, y, yv, force, kinetic, potential, energy: kinetic + potential, dampingPower: d.c * uv * uv,
        inputPower: base ? -p.k * u * yv - d.c * uv * yv : force * v };
    }
    function at(t) {
      if (!Number.isFinite(t) || t < 0 || t > 60) throw Error('时间应在 0–60 s');
      return unpack(t, mv(expm(A, t), initial));
    }
    function trajectory(count = 2400) {
      count = Math.max(2, Math.ceil(count));
      const dt = p.duration / count, transition = expm(A, dt), points = [];
      let state = initial.slice();
      for (let i = 0; i <= count; i++) {
        const t = i * dt;
        // Re-anchor every 200 samples to bound cumulative roundoff.
        if (i && i % 200 === 0) state = mv(expm(A, t), initial);
        points.push(unpack(t, state));
        state = mv(transition, state);
      }
      return points;
    }
    return { p, d, at, trajectory };
  }
  function frequency(input, r = input.r) {
    const p = validate(input), z = p.zeta, den = Math.hypot(1 - r * r, 2 * z * r), singular = den < 1e-14;
    if (singular) return { gain: Infinity, relativeGain: Infinity, amplitude: (p.mode === 'base' ? p.Y : p.F) === 0 ? 0 : Infinity, phase: null };
    const base = p.mode === 'base', gain = (base ? Math.hypot(1, 2 * z * r) : 1) / den;
    let phase = Math.atan2(2 * z * r, 1 - r * r) - (base ? Math.atan2(2 * z * r, 1) : 0);
    return { gain, relativeGain: r * r / den, amplitude: gain * (base ? p.Y : p.F / p.k), phase };
  }
  function selfCheck() {
    const a = system({ mode: 'free', m: 1, k: 100, x0: 0.08, v0: 0 }).at(2);
    const b = system({ mode: 'damped', zeta: 1 }).at(0.5);
    const c = system({ mode: 'forced', zeta: 0, r: 1, x0: 0, v0: 0 }).at(2);
    const expected = DEFAULTS.F / 100 / 2 * (Math.sin(20) - 20 * Math.cos(20));
    const errors = [Math.abs(a.x - 0.08 * Math.cos(20)), Math.abs(b.x - 0.08 * 6 * Math.exp(-5)), Math.abs(c.x - expected)];
    return { pass: errors.every(e => e < 1e-9), maxError: Math.max(...errors), checks: 3 };
  }
  return { DEFAULTS, LIMITS, validate, derived, system, frequency, selfCheck, matrix: { expm, mv } };
});
