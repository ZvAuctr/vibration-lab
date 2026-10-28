const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../src/sdof.js'), Core = require('../src/physics.js');
let assertions = 0, suites = 0; const results=[];
function near(a,b,tol,label) { assertions++; assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol, `${label}: ${a} vs ${b}, tolerance ${tol}`); }
function ok(condition,label) { assertions++; assert.ok(condition,label); }
function test(name,run){const start=performance.now();run();suites++;results.push({name,status:'PASS',ms:Math.round(performance.now()-start)});console.log('PASS '+name);}
function rk(p,force,end,h=.0003,coordinate='absolute') {
  const steps=Math.ceil(end/h),dt=end/steps,c=2*p.zeta*Math.sqrt(p.k*p.m); let s=[p.x0,p.v0];
  const rhs=(t,q)=>[q[1],(force(t)-c*q[1]-p.k*q[0])/p.m];
  const plus=(q,k,h)=>q.map((v,j)=>v+k[j]*h);
  for(let i=0;i<steps;i++){const t=i*dt,a=rhs(t,s),b=rhs(t+dt/2,plus(s,a,dt/2)),cc=rhs(t+dt/2,plus(s,b,dt/2)),d=rhs(t+dt,plus(s,cc,dt));s=s.map((v,j)=>v+dt*(a[j]+2*b[j]+2*cc[j]+d[j])/6);}
  return s;
}
test('v1.0.0 behavior preserved for all original experiments',()=>{
  for(const mode of ['free','damped','forced','base'])for(const zeta of [0,.08,1,2]){
    const a=V.system({mode,zeta,x0:.06,v0:-.2}),b=Core.system({mode,zeta,x0:.06,v0:-.2});
    for(const t of [0,.1,1.7,12,60])for(const key of ['x','v','a','u','uv','energy']) near(a.at(t)[key],b.at(t)[key],1e-8,mode+' '+key);
  }
});
test('Phase and base coordinate conversion preserve absolute initial conditions',()=>{
  for(const mode of ['forced','unbalance','base','periodic'])for(const phi of [-180,-45,0,90,180])for(const baseInput of ['displacement','acceleration']){
    const sys=V.system({mode,phi,baseInput,x0:.1,v0:-.3});const a=sys.at(0);
    near(a.x,.1,1e-13,'x0');near(a.v,-.3,1e-13,'v0');near(a.x-a.y,a.u,1e-13,'u0');
  }
});
test('Rotating unbalance force scales with speed squared and total supported mass',()=>{
  for(const r of [.3,.6,1,2,4]){
    const s=V.system({mode:'unbalance',m:3,mu:.2,eccentricity:.03,r,x0:0,v0:0});
    const w=s.d.omega,F=3*.2*.03*w*w;
    near(s.rawLoad(Math.PI/(2*w)),F,1e-10,'unbalance peak');
    const b=V.system({mode:'forced',m:3,F:Math.min(F,30),r,x0:0,v0:0});
    if(F<=30)near(s.at(.81).x,b.at(.81).x,1e-10,'equivalent force');
  }
  near(V.frequency({mode:'unbalance',r:4},10000).gain,1,2e-8,'high speed limit');
});
test('Harmonic full and steady responses agree with independent RK4 and phase relations',()=>{
  for(const mode of ['forced','unbalance'])for(const zeta of [0,.13,1,2])for(const r of [.7,1,1.8]){
    const s=V.system({mode,zeta,r,phi:37,x0:.03,v0:-.2,F:2});
    const amp=mode==='forced'?s.p.F:s.p.m*s.p.mu*s.p.eccentricity*s.d.omega**2;
    const ref=rk(s.p,t=>amp*Math.sin(s.d.omega*t+37*Math.PI/180),1.37);
    near(s.at(1.37).x,ref[0],2e-9,'RK x');near(s.at(1.37).v,ref[1],3e-8,'RK v');
    if(s.hasSteady){const f=V.frequency(s.p);const ss=V.system({...s.p,response:'steady'});for(const t of [.1,.4,1])near(ss.at(t).x,f.amplitude*Math.sin(s.d.omega*t+37*Math.PI/180-f.phase),2e-10,'steady phase');}
  }
});
test('Transient component solves homogeneous equation; full equals steady plus transient',()=>{
  for(const mode of ['forced','unbalance','periodic','base']){
    const s=V.system({mode,phi:20,zeta:.12});const initial=s.at(0), trans=Core.system({mode:'damped',zeta:.12,x0:initial.transientX,v0:initial.transientV});
    for(const t of [.03,.7,2.1]){const a=s.at(t);near(a.x,a.steadyX+a.transientX,1e-12,'sum');near(a.a,a.steadyA+a.transientA,1e-11,'acceleration sum');near(a.transientX,trans.at(t).x,2e-10,'homogeneous');near(a.transientA,trans.at(t).a,2e-8,'homogeneous acceleration');}
  }
});
test('Base displacement and acceleration equations verified independently',()=>{
  for(const baseInput of ['displacement','acceleration'])for(const phi of [0,60]){
    const p={...V.DEFAULTS,mode:'base',baseInput,phi,r:1.2,zeta:.2,x0:.04,v0:-.1},s=V.system(p),w=s.d.omega,ph=phi*Math.PI/180,c=s.d.c;
    const force=baseInput==='displacement'?t=>p.k*p.Y*Math.sin(w*t+ph)+c*p.Y*w*Math.cos(w*t+ph):t=>-p.m*p.Ag*Math.sin(w*t+ph);
    const q=rk(p,force,1.23),a=s.at(1.23);
    near(baseInput==='displacement'?a.x:a.u,q[0],2e-9,'base x/u');near(baseInput==='displacement'?a.v:a.uv,q[1],3e-8,'base v/uv');
    near(p.m*a.a+c*a.uv+p.k*a.u,0,1e-10,'ground equilibrium');
    const h=1e-5,lo=s.at(.8-h),hi=s.at(.8+h),mid=s.at(.8);
    near((hi.y-lo.y)/(2*h),mid.yv,1e-8,'ground dy');near((hi.yv-lo.yv)/(2*h),mid.ya,1e-7,'ground ddy');
  }
  const s=V.system({mode:'base',baseInput:'acceleration',r:0,phi:90,Ag:2,x0:0,v0:0});near(s.at(1).y,1,1e-13,'constant ground acceleration');near(s.at(1).ya,2,1e-13,'constant ya');
});
test('Periodic coefficients, finite Fourier loads and RK4 cross-check',()=>{
  for(const wave of ['square','triangle','sawtooth','mix']){
    const p={...V.DEFAULTS,mode:'periodic',wave,harmonics:7,r:.6,zeta:.1,phi:0,x0:.02,v0:.1},s=V.system(p);
    const f=t=>{let F=0;for(let n=1;n<=7;n++){let b=0;if(wave==='square'&&n%2)b=4*p.F/(Math.PI*n);if(wave==='triangle'&&n%2)b=8*p.F*(-1)**((n-1)/2)/(Math.PI**2*n*n);if(wave==='sawtooth')b=2*p.F*(-1)**(n+1)/(Math.PI*n);if(wave==='mix'&&n<=3)b=p.F*[0,1,.35,.2][n];F+=b*Math.sin(n*s.d.omega*t);}return F;};
    for(const t of [.01,.2,1.1])near(s.rawLoad(t),f(t),1e-12,'Fourier load');
    const ref=rk(p,f,1.29,.0001),a=s.at(1.29);near(a.x,ref[0],2e-9,'periodic RK x');near(a.v,ref[1],3e-8,'periodic RK v');
    const ss=V.system({...p,response:'steady'});const T=2*Math.PI/s.d.omega;for(const t of [.1,.7])near(ss.at(t).x,ss.at(t+T).x,2e-12,'periodicity');
  }
  const s=V.system({mode:'periodic',wave:'square',r:1/3,zeta:0,x0:0,v0:0});ok(!s.hasSteady,'third harmonic resonant');
  const disabled=V.system({...s.p,response:'steady'});ok(disabled.p.response==='full'&&disabled.responseWarning.length>0,'no fictitious steady state');
});
test('Fourier truncation converges in damped response',()=>{
  const params={mode:'periodic',wave:'triangle',r:.4,zeta:.15,response:'steady',x0:0,v0:0};
  const ref=V.system({...params,harmonics:21}).at(.38).x;
  const e3=Math.abs(V.system({...params,harmonics:3}).at(.38).x-ref),e11=Math.abs(V.system({...params,harmonics:11}).at(.38).x-ref);
  ok(e11<e3,'higher truncation order reduces displacement error');results.push({metric:'triangle Fourier displacement errors vs N=21',value:{N3:e3,N11:e11}});
});
test('Step, finite ramp, rectangular and triangular pulse closed forms',()=>{
  const w=10,F=4,k=100,tau=.4,delay=.5;
  const H=t=>t<0?0:F/k*(1-Math.cos(w*t));const R=t=>t<0?0:F/(k*tau)*(t-Math.sin(w*t)/w);
  const expected={step:t=>H(t-delay),ramp:t=>R(t-delay)-R(t-delay-tau),rectangle:t=>H(t-delay)-H(t-delay-tau),triangle:t=>2*R(t-delay)-4*R(t-delay-tau/2)+2*R(t-delay-tau)};
  for(const load of Object.keys(expected)){const s=V.system({mode:'arbitrary',load,zeta:0,x0:0,v0:0,F,tau,delay});for(const t of [0,.3,.5,.6,.7,.9,1.3,4,12,60])near(s.at(t).x,expected[load](t),3e-9,load+' at '+t);}
});
test('Ideal impulse has exact velocity and energy jump, including at t=0',()=>{
  for(const delay of [0,.5]){
    const s=V.system({mode:'arbitrary',load:'impulse',delay,J:.6,m:2,x0:.05,v0:.1,zeta:.1});
    const free=Core.system({mode:'damped',m:2,x0:.05,v0:.1,zeta:.1}),before=free.at(delay),after=s.at(delay);
    near(after.x,before.x,1e-12,'continuous x');near(after.v-before.v,.3,1e-12,'J/m');near(after.energy-before.energy,.6*before.v+.6**2/(2*2),1e-12,'impulse work');
    const post=Core.system({mode:'damped',m:2,zeta:.1,x0:after.x,v0:after.v});near(s.at(delay+.7).x,post.at(.7).x,2e-10,'post-impulse free');
  }
});
test('Half-sine pulse agrees with exact harmonic segment then free vibration',()=>{
  const p={mode:'arbitrary',load:'halfSine',delay:.5,tau:.4,F:2,x0:0,v0:0,zeta:.12},s=V.system(p),r=Math.PI/(p.tau*10),during=Core.system({mode:'forced',r,F:2,zeta:.12,x0:0,v0:0});
  for(const t of [.51,.6,.8,.9])near(s.at(t).x,during.at(t-.5).x,1e-7,'half sine');
  const stop=during.at(.4),after=Core.system({mode:'damped',zeta:.12,x0:stop.x,v0:stop.v});for(const t of [1,2,6])near(s.at(t).x,after.at(t-.9).x,2e-7,'after half sine');
});
test('Non-grid impulse and pulse events are retained in exported trajectory',()=>{
  const s=V.system({mode:'arbitrary',load:'impulse',delay:.513,J:.4,x0:0,v0:0,duration:2}),pts=s.trajectory(100);
  const event=pts.find(a=>a.t===.513),left=pts.find(a=>Math.abs(a.t-(.513-1e-9))<1e-13);
  ok(!!event&&!!left,'both sides of event retained');near(event.v,.4,1e-12,'right limit impulse');near(left.v,0,1e-12,'left limit');
  for(let i=1;i<pts.length;i++)ok(pts[i].t>pts[i-1].t,'strictly increasing output times');
  const pulse=V.system({mode:'arbitrary',load:'rectangle',delay:.513,tau:.02,duration:2,x0:0,v0:0}).trajectory(100);
  near(pulse.find(a=>a.t===.513).force,4,1e-12,'pulse beginning');
  near(pulse.find(a=>a.t===.513+.02).force,0,1e-12,'pulse end');
});
test('CSV piecewise-linear load matches independent Duhamel quadrature',()=>{
  const s=V.system({mode:'arbitrary',load:'csv',csv:'t_s,F_N\n0,0\n0.3,2\n0.7,-1\n1,3\n1.5,0\n3,0',x0:0,v0:0,zeta:.13});
  const F=t=>t<=.3?2*t/.3:t<=.7?2-3*(t-.3)/.4:t<=1?-1+4*(t-.7)/.3:t<=1.5?3-6*(t-1):0;
  function integral(end,N){const h=end/N,w=10,wd=w*Math.sqrt(1-.13**2);let total=0;for(let i=0;i<=N;i++){const t=i*h,lag=end-t,kernel=Math.exp(-.13*w*lag)*Math.sin(wd*lag)/wd;total+=(i===0||i===N?1:i%2?4:2)*kernel*F(t);}return total*h/3;}
  for(const t of [.3,.7,1,1.5,3])near(s.at(t).x,integral(t,30000),2e-8,'Duhamel');
  near(s.rawLoad(5),0,1e-12,'hold last value');
});
test('Linear chirp sampled load matches independent analytic-drive RK4',()=>{
  const s=V.system({mode:'arbitrary',load:'chirp',delay:.2,duration:3,r:.8,x0:0,v0:0,zeta:.1});
  const force=t=>t<.2?0:4*Math.sin(8*((t-.2)+(t-.2)**2/(2*2.8)));
  const ref=rk(s.p,force,2.87,.0001);near(s.at(2.87).x,ref[0],1e-6,'chirp x');near(s.at(2.87).v,ref[1],1e-5,'chirp v');
});
test('Energy balance for periodic, rotating and arbitrary loads; moving support work',()=>{
  for(const params of [{mode:'unbalance'},{mode:'periodic',wave:'square',harmonics:7},{mode:'arbitrary',load:'csv'},{mode:'base',baseInput:'acceleration',phi:20}]){
    const s=V.system({...params,duration:3,x0:0,v0:0,zeta:.15}),pts=s.trajectory(12000),dt=3/12000;let work=0;
    for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];work+=(b.t-a.t)/2*(a.inputPower-a.dampingPower+b.inputPower-b.dampingPower);}
    near(pts.at(-1).energy-pts[0].energy,work,3e-6,params.mode+' work-energy');
  }
});
test('Frequency transmission amplitude/phase and isolation threshold',()=>{
  for(const mode of ['forced','unbalance','base'])for(const zeta of [0,.1,1,3]){
    near(V.frequency({mode,zeta},Math.SQRT2,'transmission').gain,1,1e-14,'isolation');
    const s=V.system({mode,zeta,r:2,response:'steady'}),f=V.frequency(s.p,2,'transmission'),F0=mode==='unbalance'?s.p.m*s.p.mu*s.p.eccentricity*s.d.omega**2:s.p.F;
    if(mode!=='base')for(const t of [.1,.3,.7])near(s.at(t).Ft,F0*f.gain*Math.sin(s.d.omega*t-f.phase),2e-10,'transmitted phase');
  }
});
test('Logarithmic decrement identification recovers exact damping ratio and frequency',()=>{
  for(const zeta of [.01,.08,.3,.7])for(const cycles of [1,2,4]){
    const delta=2*Math.PI*zeta/Math.sqrt(1-zeta*zeta),Td=2*Math.PI/(10*Math.sqrt(1-zeta*zeta));
    const a=V.identify(.1,.1*Math.exp(-delta*cycles),Td*cycles,cycles);near(a.zeta,zeta,1e-13,'identified zeta');near(a.wn,10,1e-12,'identified wn');
  }
});
test('Zero forcing, exact resonance and parameter extremes remain finite',()=>{
  for(const mode of ['forced','unbalance','base','periodic']){
    const s=V.system({mode,zeta:0,r:1,F:0,Y:0,mu:0,Ag:0,response:'steady'});ok(s.hasSteady,'zero drive steady exists');for(const val of Object.values(s.at(12)))if(val!==null)ok(Number.isFinite(val),'finite zero');
  }
  for(const mode of V.MODES){const s=V.system({mode,m:.1,k:1000,zeta:3,r:4,harmonics:21,wave:'sawtooth',load:'rectangle',x0:.3,v0:3,duration:60});for(const t of [0,.03,2,60])for(const val of Object.values(s.at(t)))if(val!==null)ok(Number.isFinite(val),'finite extreme '+mode);}
});
test('Input parser rejects code, duplicate times, malformed data and unsupported models',()=>{
  for(const text of ['0,0\n0,1','1,0\n2,1','0,0\n1,NaN','0,0\n61,1','0,0\n1,eval(1)','0,0,0\n1,1']){assert.throws(()=>V.parseLoad(text));assertions++;}
  for(const params of [{harmonics:2.5},{mode:'nonlinear'},{phi:181},{response:'eval()'},{baseInput:'random'},{load:'unknown'}]){assert.throws(()=>V.system(params));assertions++;}
  assert.throws(()=>V.identify(.1,.2,1));assertions++;
});
test('Final file includes new engine, correct version and no slogan or chapter references',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');ok(html.includes('v1.0.1'),'version');ok(html.includes('root.SDOF'),'bundled engine');ok(!/振动之间|教材|课本|让每一次/.test(html),'clean wording');
});
const core=JSON.parse(fs.readFileSync(path.join(__dirname,'../VERIFICATION-core.json'),'utf8'));
const report={version:V.VERSION,runUTC:new Date().toISOString(),node:process.version,coreSuites:core.suiteCount,extendedSuites:suites,totalSuites:core.suiteCount+suites,assertions:assertions+core.assertions,status:'PASS',coreResults:core.results,extendedResults:results};
fs.writeFileSync(path.join(__dirname,'../VERIFICATION.json'),JSON.stringify(report,null,2));
console.log(`\n${suites} extended suites, ${assertions} assertions. Total ${report.totalSuites} suites / ${report.assertions} assertions.`);
