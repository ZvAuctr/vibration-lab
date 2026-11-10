const assert = require('node:assert/strict');
const spectrum = require('../src/spectrum.js');
const V = require('../src/sdof.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

const bins = spectrum(t => 1.25 + 3 * Math.sin(2 * Math.PI * 7 * t), 2);
near(bins[0][1], 1.25);
near(bins[14][0], 7);
near(bins[14][1], 3);
const nyquist = spectrum(t => 2 * Math.cos(2 * Math.PI * 128 * t), 1, 256);
near(nyquist[128][1], 2);

const system = V.system({ mode: 'arbitrary', load: 'impulse', delay: 1, duration: 2, J: 0.4 });
const impulse = spectrum(t => system.at(t).force, 2, 8192, { time: 1, area: 0.4 });
near(impulse[0][1], 0.4);
near(impulse[37][1], 0.8);

const free = V.system({ mode: 'arbitrary', F: 0, x0: 0.08, zeta: 0, m: 1, k: (2 * Math.PI * 3) ** 2 });
const response = spectrum(t => free.at(t).x, 2);
near(response[6][1], 0.08);
console.log('PASS FFT frequency, amplitude, DC, Nyquist, impulse and dynamic response');
