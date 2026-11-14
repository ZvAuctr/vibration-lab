const assert = require('node:assert/strict');
const { system } = require('../src/mdof.js');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, a+' vs '+b);
const free = system({});
near(free.modes[0].w,10);
near(free.modes[1].w,Math.sqrt(300));
for(const t of [0,.1,1,12]) {
  const state=free.at(t);
  const q1=.04*Math.cos(10*t),q2=.04*Math.cos(Math.sqrt(300)*t);
  near(state.x[0],q1+q2);
  near(state.x[1],q1-q2);
  near(state.energy,free.at(0).energy);
}
const unequal=system({m1:2,m2:3,k1:90,kc:40,k2:0,x2:-.03,v2:.4});
near(unequal.at(0).x[1],-.03);
near(unequal.at(0).v[1],.4);
for(const {shape:[x,y],w} of unequal.modes){
  near(130*x-40*y,2*w*w*x);
  near(40*(y-x),3*w*w*y);
}
near(free.frequency(0)[0],1/150);
near(free.frequency(free.antiHz)[0],0);
near(free.frequency(free.antiHz)[1],.01);
assert.equal(free.frequency(free.modes[0].hz)[0],Infinity);
assert.ok(system({force:5,hz:free.modes[0].hz}).at(12).x.every(Number.isFinite));
assert.ok(system({zeta:.04}).at(5).energy<free.at(0).energy);
console.log('PASS two-DOF modes, response, energy, resonance and antiresonance');
for (let n = 2; n <= 6; n++) {
  const chain = system({masses: Array(n).fill(1), springs: Array(n + 1).fill(100), drive: n - 1});
  chain.modes.forEach((mode, j) => {
    near(mode.w, 20 * Math.sin((j + 1) * Math.PI / (2 * (n + 1))));
    for (const [k, other] of chain.modes.entries()) {
      near(mode.shape.reduce((sum, value, i) => sum + value * other.shape[i], 0), Number(j === k));
    }
  });
  const point = chain.trajectory(700)[613];
  const direct = chain.at(point.t);
  for (let i = 0; i < n; i++) {
    near(point.x[i], direct.x[i]);
    near(point.x[i], point.contributions.reduce((sum, row) => sum + row[i], 0));
  }
  near(point.energy, chain.at(0).energy);
}
const extreme = system({masses:[.1,200,.1,200,.1,200],springs:[1,20000,1,20000,1,20000,0],drive:5,force:3000,hz:200,duration:120,zeta:10});
assert.ok(extreme.at(120).x.every(Number.isFinite));
const SDOF = require('../src/sdof.js');
const wide = SDOF.system({mode:'arbitrary',load:'halfSine',m:.1,k:20000,F:3000,delay:60,tau:60,duration:120,zeta:10});
for (const time of [0,60,90,120]) assert.ok(Number.isFinite(wide.at(time).x));
assert.equal(SDOF.parseLoad('0,0\n120,1000000').at(-1)[1], 1000000);
console.log('PASS two through six masses, modal reconstruction and expanded limits');
assert.equal(SDOF.LIMITS.duration[1], 1200);
assert.equal(SDOF.LIMITS.harmonics[1], 1010);
const longPulse = SDOF.system({mode:'arbitrary',load:'halfSine',m:.1,k:200000,F:30000,delay:600,tau:600,duration:1200,zeta:100});
assert.equal(longPulse.at(900).force,30000);
assert.ok(Number.isFinite(longPulse.at(1200).x));
const largeChain = system({masses:[.1,2000,.1,2000,.1,2000],springs:[1,200000,1,200000,1,200000,0],drive:5,force:30000,hz:2000,duration:1200,zeta:100});
assert.ok(largeChain.at(1200).x.every(Number.isFinite));
