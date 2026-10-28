/* v1.0.1: linear SDOF loading, harmonic decomposition and exact linear-load steps.
 * Harmonic response: augmented matrix exponentials, including exact resonance.
 * Arbitrary response: exact propagation of each piecewise-linear load interval.
 * No formulas supplied by the user are evaluated as code. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics.js'));
  else root.SDOF = factory(root.Vibration);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Core) {
  'use strict';
  const VERSION = '1.0.1', { expm, mv } = Core.matrix;
  const MODES = ['free', 'damped', 'forced', 'unbalance', 'base', 'periodic', 'arbitrary'];
  const DEFAULTS = { ...Core.DEFAULTS, phi: 0, mu: .1, eccentricity: .02, wave: 'square', harmonics: 9, load: 'step', tau: .4, delay: .5, J: .4, response: 'full', baseInput: 'displacement', Ag: 1, csv: '0,0\n0.5,0\n1,4\n1.5,-2\n2,0\n12,0' };
  const LIMITS = { ...Core.LIMITS, phi: [-180, 180], mu: [0, .5], eccentricity: [0, .1], harmonics: [1, 21], tau: [.02, 20], delay: [0, 20], J: [-5, 5], Ag: [0, 10] };
  function parseLoad(text) {
    if (typeof text !== 'string' || text.length > 150000) throw Error('时程文本过大');
    const rows = text.trim().split(/\r?\n/).filter(s => s.trim() && !s.trim().startsWith('#'));
    if (rows.length && /^[a-zA-Z\uFEFF]/.test(rows[0])) rows.shift();
    if (rows.length < 2 || rows.length > 2000) throw Error('时程需要 2–2000 行时间、荷载数据');
    const pairs = rows.map((row, i) => {
      const values = row.trim().split(/[,;\s]+/);
      if (values.length !== 2) throw Error('第 ' + (i + 1) + ' 行需要两列：时间(s)、力(N)');
      const [t, F] = values.map(Number);
      if (!Number.isFinite(t) || !Number.isFinite(F) || t < 0 || t > 60 || Math.abs(F) > 100000) throw Error('时程时间范围 0–60 s，力范围 ±100000 N');
      return [t, F];
    });
    if (pairs[0][0] !== 0) throw Error('时程第一行时间须为 0');
    for (let i = 1; i < pairs.length; i++) if (pairs[i][0] <= pairs[i - 1][0]) throw Error('时间必须严格递增，不可重复');
    return pairs;
  }
  function validate(input) {
    const p = { ...DEFAULTS, ...input };
    if (!MODES.includes(p.mode)) throw Error('未知实验类型');
    for (const [key, [lo, hi]] of Object.entries(LIMITS)) if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) throw Error(key + ' 超出范围 [' + lo + ', ' + hi + ']');
    if (!Number.isInteger(p.harmonics)) throw Error('谐波最高阶数须为整数');
    if (!['square', 'triangle', 'sawtooth', 'mix'].includes(p.wave)) throw Error('未知周期波形');
    if (!['step', 'ramp', 'rectangle', 'triangle', 'halfSine', 'impulse', 'csv', 'chirp'].includes(p.load)) throw Error('未知时程类型');
    if (!['full', 'steady'].includes(p.response)) throw Error('未知响应类型');
    if (!['displacement', 'acceleration'].includes(p.baseInput)) throw Error('未知基础输入');
    if (p.mode === 'free') p.zeta = 0;
    if (p.mode === 'arbitrary' && p.load === 'csv') parseLoad(p.csv);
    return p;
  }
  const derived = p => Core.derived(p);
  function coefficients(p) {
    const d = derived(p), ph = p.phi * Math.PI / 180, w = d.omega;
    const result = [];
    const addSin = (n, b) => { if (b) result.push({ n, w: n * w, a: b * Math.sin(n * ph), b: b * Math.cos(n * ph) }); };
    if (p.mode === 'forced') addSin(1, p.F);
    if (p.mode === 'unbalance') addSin(1, p.m * p.mu * p.eccentricity * w * w);
    if (p.mode === 'base') {
      if (p.baseInput === 'displacement') {
        // Absolute equation m x'' + c x' + k x = k y + c y'.
        result.push({ n: 1, w, a: p.k * p.Y * Math.sin(ph) + d.c * p.Y * w * Math.cos(ph), b: p.k * p.Y * Math.cos(ph) - d.c * p.Y * w * Math.sin(ph) });
      } else addSin(1, -p.m * p.Ag); // Relative equation; ground acceleration is specified.
    }
    if (p.mode === 'periodic') for (let n = 1; n <= p.harmonics; n++) {
      if (p.wave === 'square' && n % 2) addSin(n, p.F * 4 / (Math.PI * n));
      if (p.wave === 'triangle' && n % 2) addSin(n, p.F * 8 / (Math.PI ** 2 * n ** 2) * (-1) ** ((n - 1) / 2));
      if (p.wave === 'sawtooth') addSin(n, p.F * 2 / (Math.PI * n) * (-1) ** (n + 1));
      if (p.wave === 'mix' && n <= 3) addSin(n, p.F * [0, 1, .35, .2][n]);
    }
    return result;
  }
  function frequency(input, r = input.r, kind = 'displacement') {
    const p = validate(input), d = derived(p), z = p.zeta, den = Math.hypot(1 - r * r, 2 * z * r), num = Math.hypot(1, 2 * z * r);
    const baseDisp = p.mode === 'base' && p.baseInput === 'displacement';
    let numerator = kind === 'transmission' || baseDisp ? num : p.mode === 'unbalance' ? r * r : 1;
    if (p.mode === 'base' && p.baseInput === 'acceleration' && kind !== 'transmission') numerator = 1;
    const gain = den < 1e-14 ? Infinity : numerator / den;
    const phase = den < 1e-14 ? null : Math.atan2(2 * z * r, 1 - r * r) - (kind === 'transmission' || baseDisp ? Math.atan2(2 * z * r, 1) : 0);
    let factor = baseDisp ? p.Y : p.mode === 'unbalance' ? p.mu * p.eccentricity : p.mode === 'base' ? p.Ag / d.wn ** 2 : p.F / p.k;
    return { gain, phase, amplitude: factor === 0 ? 0 : gain * factor, relativeGain: den < 1e-14 ? Infinity : r * r / den };
  }
  function harmonicPart(p, harmonic) {
    const d = derived(p), { w, a, b } = harmonic;
    const A = [0, 1, 0, 0, -p.k / p.m, -d.c / p.m, b / p.m, a / p.m, 0, 0, 0, w, 0, 0, -w, 0];
    const D = p.k - p.m * w * w, C = d.c * w, norm = D * D + C * C;
    const resonant = Math.abs(D) < 1e-12 * p.k && C === 0 && Math.hypot(a, b) > 0;
    const ca = resonant || norm === 0 ? 0 : (D * a - C * b) / norm, cb = resonant || norm === 0 ? 0 : (C * a + D * b) / norm;
    function steady(t) { const co = Math.cos(w * t), si = Math.sin(w * t); return [ca * co + cb * si, w * (-ca * si + cb * co)]; }
    return { A, initial: [0, 0, 0, 1], resonant, steady };
  }
  function loadSegments(p) {
    const end = 60, start = p.delay, stop = Math.min(end, start + p.tau), list = [];
    const push = (t0, t1, f0, slope = 0) => { if (t1 > t0) list.push({ t0, t1, f0, slope }); };
    if (p.load === 'csv') {
      const rows = parseLoad(p.csv);
      for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; push(a[0], b[0], a[1], (b[1] - a[1]) / (b[0] - a[0])); }
      push(rows.at(-1)[0], end, rows.at(-1)[1]);
      return list;
    }
    push(0, start, 0);
    if (p.load === 'step') push(start, end, p.F);
    if (p.load === 'ramp') { push(start, stop, 0, p.F / p.tau); push(stop, end, p.F); }
    if (p.load === 'rectangle') { push(start, stop, p.F); push(stop, end, 0); }
    if (p.load === 'triangle') { const mid = start + p.tau / 2; push(start, mid, 0, 2 * p.F / p.tau); push(mid, stop, p.F, -2 * p.F / p.tau); push(stop, end, 0); }
    if (p.load === 'halfSine') {
      const N = 600;
      for (let i = 0; i < N; i++) { const ta = start + i * p.tau / N, tb = start + (i + 1) * p.tau / N, fa = p.F * Math.sin(Math.PI * i / N), fb = p.F * Math.sin(Math.PI * (i + 1) / N); push(ta, tb, fa, (fb - fa) / (tb - ta)); }
      push(stop, end, 0);
    }
    if (p.load === 'chirp') {
      const d = derived(p), sweepEnd = Math.max(start, p.duration), n = Math.min(120000, Math.max(1000, Math.ceil((sweepEnd - start) * Math.max(d.omega, .1) * 400)));
      const value = t => { const q = t - start; return p.F * Math.sin(d.omega * (q + q * q / (2 * Math.max(p.duration - start, .1)))); };
      for (let i = 0; i < n; i++) { const ta = start + i * (sweepEnd - start) / n, tb = start + (i + 1) * (sweepEnd - start) / n; if(tb>ta)push(ta, tb, value(ta), (value(tb) - value(ta)) / (tb - ta)); }
      push(sweepEnd, end, value(sweepEnd));
    }
    if (p.load === 'impulse') push(start, end, 0);
    if (!list.length) push(0, end, 0);
    return list;
  }
  function system(input) {
    const p = validate(input), d = derived(p), base = p.mode === 'base', baseAcc = base && p.baseInput === 'acceleration', harmonics = coefficients(p), parts = harmonics.map(h => harmonicPart(p, h));
    const arbitrary = p.mode === 'arbitrary', supportsSteady = !['free', 'damped', 'arbitrary'].includes(p.mode), hasSteady = supportsSteady && parts.every(h => !h.resonant);
    let responseWarning = '';
    if (p.response === 'steady' && !hasSteady) { p.response = 'full'; responseWarning = supportsSteady ? '存在无阻尼共振谐波，无有界稳态；已显示全响应。' : '该实验显示初始条件与荷载共同产生的全响应。'; }
    const ph = p.phi * Math.PI / 180;
    const ground = t => {
      const w = d.omega, si = Math.sin(w * t + ph), co = Math.cos(w * t + ph);
      if (!base) return { y: 0, yv: 0, ya: 0 };
      if (!baseAcc) return { y: p.Y * si, yv: p.Y * w * co, ya: -p.Y * w * w * si };
      // Acceleration input; integration constants fix y(0)=y'(0)=0.
      if (w === 0) { const ag = p.Ag * Math.sin(ph); return { y: ag * t * t / 2, yv: ag * t, ya: ag }; }
      return { y: p.Ag / w * (t * Math.cos(ph) - (Math.sin(w * t + ph) - Math.sin(ph)) / w), yv: p.Ag / w * (Math.cos(ph) - co), ya: p.Ag * si };
    };
    const g0 = ground(0), initial = [p.x0 - (baseAcc ? g0.y : 0), p.v0 - (baseAcc ? g0.yv : 0), 0, 0];
    const H = [0, 1, 0, 0, -p.k / p.m, -d.c / p.m, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const intervals = arbitrary ? loadSegments(p) : [];
    const P = [0, 1, 0, 0, -p.k / p.m, -d.c / p.m, 1 / p.m, 0, 0, 0, 0, 1, 0, 0, 0, 0];
    if (arbitrary) {
      let state = initial.slice();
      for (const seg of intervals) {
        if (p.load === 'impulse' && Math.abs(seg.t0 - p.delay) < 1e-12) state[1] += p.J / p.m;
        seg.state = [state[0], state[1], seg.f0, seg.slope];
        state = mv(expm(P, seg.t1 - seg.t0), seg.state);
      }
    }
    function findSegment(t) {
      let lo = 0, hi = intervals.length - 1;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (intervals[mid].t0 <= t + 1e-13) lo = mid; else hi = mid - 1; }
      return intervals[lo];
    }
    function rawLoad(t) {
      if (arbitrary) { const seg = findSegment(t); return seg.f0 + seg.slope * (t - seg.t0); }
      return harmonics.reduce((s, h) => s + h.a * Math.cos(h.w * t) + h.b * Math.sin(h.w * t), 0);
    }
    function steadyState(t) { return parts.reduce((s, h) => { const q = h.steady(t); return [s[0] + q[0], s[1] + q[1]]; }, [0, 0]); }
    function unpack(t, full) {
      const g = ground(t), load = rawLoad(t), ss = hasSteady ? steadyState(t) : null;
      let q = p.response === 'steady' && ss ? ss[0] : full[0], qv = p.response === 'steady' && ss ? ss[1] : full[1];
      const x = q + (baseAcc ? g.y : 0), v = qv + (baseAcc ? g.yv : 0), u = x - g.y, uv = v - g.yv;
      const force = base ? 0 : load, a = (force - d.c * uv - p.k * u) / p.m, ua = a - g.ya;
      const kinetic = .5 * p.m * v * v, potential = .5 * p.k * u * u, Ft = p.k * u + d.c * uv;
      const sx = ss ? ss[0] + (baseAcc ? g.y : 0) : null, sv = ss ? ss[1] + (baseAcc ? g.yv : 0) : null;
      const sa = ss ? ((base ? 0 : load) - d.c * (sv - g.yv) - p.k * (sx - g.y)) / p.m : null;
      const fullA = (force - d.c * (full[1] + (baseAcc ? g.yv : 0) - g.yv) - p.k * (full[0] + (baseAcc ? g.y : 0) - g.y)) / p.m;
      return { t, x, v, a, u, uv, ua, ...g, force, effectiveForce: load, Ft, kinetic, potential, energy: kinetic + potential, dampingPower: d.c * uv * uv,
        inputPower: base ? -p.k * u * g.yv - d.c * uv * g.yv : force * v, steadyX: sx, steadyV: sv, steadyA: sa,
        transientX: ss ? full[0] + (baseAcc ? g.y : 0) - sx : null, transientV: ss ? full[1] + (baseAcc ? g.yv : 0) - sv : null, transientA: ss ? fullA - sa : null };
    }
    function at(t) {
      if (!Number.isFinite(t) || t < 0 || t > 60) throw Error('时间应在 0–60 s');
      let state;
      if (arbitrary) { const seg = findSegment(t); state = mv(expm(P, Math.max(0, t - seg.t0)), seg.state); }
      else { state = mv(expm(H, t), initial); for (const h of parts) { const s = mv(expm(h.A, t), h.initial); state[0] += s[0]; state[1] += s[1]; } }
      return unpack(t, state);
    }
    function trajectory(count = 2400) {
      count = Math.max(2, Math.ceil(count));
      const dt = p.duration / count, out = [], homogeneous = expm(H, dt), transitions = parts.map(h => expm(h.A, dt));
      let hstate = initial.slice(), states = parts.map(h => h.initial.slice());
      for (let i = 0; i <= count; i++) {
        const t = Math.min(p.duration, i * dt);
        if (arbitrary) out.push(at(t));
        else {
          if (i && i % 200 === 0) { hstate = mv(expm(H, t), initial); states = parts.map(h => mv(expm(h.A, t), h.initial)); }
          const total = hstate.slice(); for (const s of states) { total[0] += s[0]; total[1] += s[1]; }
          out.push(unpack(t, total)); hstate = mv(homogeneous, hstate); states = states.map((s, j) => mv(transitions[j], s));
        }
      }
      if (arbitrary) {
        const events = p.load === 'halfSine' ? [p.delay, p.delay + p.tau / 2, p.delay + p.tau] : p.load === 'chirp' ? [p.delay, p.duration] : intervals.map(s => s.t0);
        for (const event of events) if (event >= 0 && event <= p.duration) {
          out.push(at(event));
          if (event > 1e-8 && ['step', 'rectangle', 'impulse'].includes(p.load)) out.push(at(event - 1e-9));
        }
        out.sort((a, b) => a.t - b.t);
        return out.filter((point, i) => i === 0 || point.t - out[i - 1].t > 1e-13);
      }
      return out;
    }
    const damping = { delta: p.zeta > 0 && p.zeta < 1 ? 2 * Math.PI * p.zeta / Math.sqrt(1 - p.zeta ** 2) : null,
      Td: d.wd ? 2 * Math.PI / d.wd : null, impulseJump: p.load === 'impulse' && arbitrary ? p.J / p.m : 0 };
    return { p, d, at, trajectory, hasSteady, supportsSteady, responseWarning, harmonics, rawLoad, intervals, damping, ground };
  }
  function identify(a1, a2, timeBetween, cycles = 1) {
    if (![a1, a2, timeBetween, cycles].every(Number.isFinite) || a1 <= 0 || a2 <= 0 || a2 >= a1 || timeBetween <= 0 || cycles < 1 || !Number.isInteger(cycles)) throw Error('输入同向衰减峰值 A₁>A₂>0、正时间间隔和整数周期数');
    const delta = Math.log(a1 / a2) / cycles, zeta = delta / Math.hypot(2 * Math.PI, delta), wd = 2 * Math.PI * cycles / timeBetween;
    return { delta, zeta, wd, wn: wd / Math.sqrt(1 - zeta * zeta) };
  }
  function selfCheck() {
    const old = Core.selfCheck(), step = system({ mode: 'arbitrary', load: 'step', delay: 0, zeta: 0, x0: 0, v0: 0 }).at(.3);
    const error = Math.abs(step.x - .04 * (1 - Math.cos(3)));
    return { pass: old.pass && error < 1e-9, checks: old.checks + 1, maxError: Math.max(old.maxError, error) };
  }
  return { VERSION, MODES, DEFAULTS, LIMITS, validate, derived, system, frequency, coefficients, parseLoad, identify, selfCheck };
});
