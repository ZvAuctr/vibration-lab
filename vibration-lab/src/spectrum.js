/* Single-sided amplitude spectrum of a uniformly sampled, Hann-windowed record. */
(function (root) {
  'use strict';
  function spectrum(sample, duration, size = 8192, impulse) {
    const real = new Float64Array(size);
    const imag = new Float64Array(size);
    const dt = duration / size;
    const hann = fraction => 0.5 * (1 - Math.cos(2 * Math.PI * fraction));
    for (let i = 0; i < size; i++) real[i] = sample(i * dt) * hann(i / size);

    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) [real[i], real[j]] = [real[j], real[i]];
    }
    for (let width = 2; width <= size; width *= 2) {
      const half = width / 2;
      for (let j = 0; j < half; j++) {
        const angle = -2 * Math.PI * j / width;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        for (let i = j; i < size; i += width) {
          const k = i + half;
          const re = cos * real[k] - sin * imag[k];
          const im = sin * real[k] + cos * imag[k];
          real[k] = real[i] - re;
          imag[k] = imag[i] - im;
          real[i] += re;
          imag[i] += im;
        }
      }
    }
    // A Dirac term contributes its area times the window at the event.
    const eventArea = impulse && impulse.time >= 0 && impulse.time < duration
      ? impulse.area * hann(impulse.time / duration) / dt : 0;
    return Array.from({ length: size / 2 + 1 }, (_, k) => {
      const frequency = k / duration;
      const angle = eventArea ? -2 * Math.PI * frequency * impulse.time : 0;
      const amplitude = Math.hypot(real[k] + eventArea * Math.cos(angle), imag[k] + eventArea * Math.sin(angle));
      return [frequency, amplitude * (k === 0 || k === size / 2 ? 2 : 4) / size];
    });
  }
  if (typeof module === 'object' && module.exports) module.exports = spectrum;
  else root.amplitudeSpectrum = spectrum;
})(globalThis);
