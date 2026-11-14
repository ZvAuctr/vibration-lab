(function (root) {
  'use strict';
  const matrix = typeof module === 'object' && module.exports
    ? require('./physics.js').matrix : root.Vibration.matrix;
  const DEFAULTS = Object.freeze({
    m1: 1, m2: 1, k1: 100, kc: 100, k2: 100, zeta: 0,
    x1: 0.08, x2: 0, v1: 0, v2: 0, force: 0, hz: 2, drive: 0, duration: 12
  });
  const LIMITS = {
    count: [2, 6], mass: [0.1, 2000], spring: [0, 200000],
    zeta: [0, 100], displacement: [-50, 50], velocity: [-1000, 1000],
    force: [0, 30000], hz: [0.001, 2000], duration: [2, 1200]
  };
  function eigenpairs(stiffness) {
    const n = stiffness.length;
    const a = stiffness.map(row => row.slice());
    const vectors = a.map((row, i) => row.map((_, j) => Number(i === j)));
    const tolerance = Math.max(...a.map((row, i) => row[i])) * 1e-14;
    // Jacobi rotations preserve symmetry and the orthogonality of eigenvectors.
    for (let iteration = 0; iteration < 50 * n * n; iteration++) {
      let p = 0, q = 1;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p = i; q = j; }
      }
      if (Math.abs(a[p][q]) <= tolerance) {
        return a.map((row, i) => ({ lambda: row[i], vector: vectors.map(v => v[i]) }))
          .sort((left, right) => left.lambda - right.lambda);
      }
      const angle = Math.atan2(2 * a[p][q], a[q][q] - a[p][p]) / 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      const app = a[p][p], aqq = a[q][q], apq = a[p][q];
      for (let i = 0; i < n; i++) {
        if (i !== p && i !== q) {
          const first = a[i][p], second = a[i][q];
          a[i][p] = a[p][i] = c * first - s * second;
          a[i][q] = a[q][i] = s * first + c * second;
        }
        const first = vectors[i][p], second = vectors[i][q];
        vectors[i][p] = c * first - s * second;
        vectors[i][q] = s * first + c * second;
      }
      a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      a[p][q] = a[q][p] = 0;
    }
    throw Error('振型求解未收敛');
  }
  function system(input) {
    const p = { ...DEFAULTS, ...input };
    p.masses = p.masses ?? [p.m1, p.m2];
    p.springs = p.springs ?? [p.k1, p.kc, p.k2];
    const n = p.masses.length;
    p.displacements = p.displacements ?? (n === 2 ? [p.x1, p.x2] : p.masses.map((_, i) => i === 0 ? p.x1 : 0));
    p.velocities = p.velocities ?? (n === 2 ? [p.v1, p.v2] : p.masses.map(() => 0));
    function check(values, length, [min, max]) {
      if (!Array.isArray(values) || values.length !== length ||
          values.some(value => !Number.isFinite(value) || value < min || value > max)) throw Error('参数超出范围');
    }
    check([n], 1, LIMITS.count);
    check(p.masses, n, LIMITS.mass);
    check(p.springs, n + 1, LIMITS.spring);
    check(p.springs.slice(1, -1), n - 1, [1, LIMITS.spring[1]]);
    if (p.springs[0] + p.springs[n] < 1) throw Error('至少保留一个端部支承，端部总刚度须达到 1 N/m');
    check(p.displacements, n, LIMITS.displacement);
    check(p.velocities, n, LIMITS.velocity);
    for (const key of ['zeta', 'force', 'hz', 'duration']) check([p[key]], 1, LIMITS[key]);
    if (!Number.isInteger(p.drive) || p.drive < 0 || p.drive >= n) throw Error('请选择受力质量块');
    const stiffness = p.masses.map((mass, i) => p.masses.map((other, j) => {
      if (i === j) return (p.springs[i] + p.springs[i + 1]) / mass;
      return Math.abs(i - j) === 1 ? -p.springs[Math.max(i, j)] / Math.sqrt(mass * other) : 0;
    }));
    const omega = 2 * Math.PI * p.hz;
    const modes = eigenpairs(stiffness).map(({ lambda, vector }) => {
      const w = Math.sqrt(lambda);
      const sign = vector.find(value => Math.abs(value) > 1e-12) < 0 ? -1 : 1;
      const shape = vector.map((value, i) => sign * value / Math.sqrt(p.masses[i]));
      const projection = values => values.reduce((sum, value, i) => sum + p.masses[i] * shape[i] * value, 0);
      const initial = [projection(p.displacements), projection(p.velocities), 0, 1];
      const damping = 2 * p.zeta * w;
      const dynamics = [0, 1, 0, 0, -lambda, -damping, p.force * shape[p.drive], 0, 0, 0, 0, omega, 0, 0, -omega, 0];
      return { w, hz: w / (2 * Math.PI), shape, initial, damping, dynamics };
    });
    function unpack(t, states) {
      const x = Array(n).fill(0), v = Array(n).fill(0);
      let energy = 0;
      const contributions = states.map(([q, velocity], index) => {
        const { w, shape } = modes[index];
        energy += (velocity ** 2 + (w * q) ** 2) / 2;
        return shape.map((value, i) => {
          x[i] += value * q;
          v[i] += value * velocity;
          return value * q;
        });
      });
      return { t, x, v, energy, contributions };
    }
    const statesAt = t => modes.map(mode => matrix.mv(matrix.expm(mode.dynamics, t), mode.initial));
    const at = t => unpack(t, statesAt(t));
    function trajectory(count) {
      const dt = p.duration / count;
      const transitions = modes.map(mode => matrix.expm(mode.dynamics, dt));
      let states = statesAt(0);
      return Array.from({ length: count + 1 }, (_, i) => {
        const time = i * dt;
        if (i && i % 128 === 0) states = statesAt(time);
        const point = unpack(time, states);
        states = states.map((state, j) => matrix.mv(transitions[j], state));
        return point;
      });
    }
    function frequency(hz) {
      const w = 2 * Math.PI * hz;
      const real = Array(n).fill(0), imag = Array(n).fill(0);
      const poles = Array(n).fill(false);
      for (const mode of modes) {
        const delta = (mode.w - w) * (mode.w + w), loss = mode.damping * w;
        const denominator = delta ** 2 + loss ** 2;
        const singular = loss === 0 && Math.abs(delta) <= mode.w ** 2 * 1e-12;
        const maxShape = Math.max(...mode.shape.map(Math.abs));
        for (let i = 0; i < n; i++) {
          const numerator = mode.shape[i] * mode.shape[p.drive];
          if (singular) {
            if (Math.abs(numerator) > maxShape ** 2 * 1e-12) poles[i] = true;
          } else {
            real[i] += numerator * delta / denominator;
            imag[i] -= numerator * loss / denominator;
          }
        }
      }
      return real.map((value, i) => poles[i] ? Infinity : Math.hypot(value, imag[i]));
    }
    const antiHz = n === 2 ? Math.sqrt(stiffness[1 - p.drive][1 - p.drive]) / (2 * Math.PI) : null;
    return { p, modes, at, trajectory, frequency, antiHz };
  }
  const api = { DEFAULTS, LIMITS, system };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MDOF = api;
})(globalThis);
