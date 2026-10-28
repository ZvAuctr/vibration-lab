/* UI only. All physical values come from physics.js, independent of rendering FPS. */
(function () {
  'use strict';
  const V = SDOF, $ = id => document.getElementById(id);
  const info = {
    free: ['实验 01', '无阻尼自由振动', 'm ẍ + k x = 0', '质量加倍后，周期会加倍吗？', '先保留当前曲线，再将质量 m 加倍。用时间轴比较相邻波峰：Tₙ = 2π√(m/k)，周期变为原来的 √2 倍。'],
    damped: ['实验 02', '有阻尼自由振动', 'm ẍ + c ẋ + k x = 0', '阻尼越大，回到平衡就一定越快吗？', '将 ζ 依次设为 0.08、1 和 2，并保留曲线比较。欠阻尼存在振荡；临界与过阻尼没有周期振荡。注意：有初速度时，非振荡响应也可能穿过零点一次。'],
    forced: ['实验 03', '简谐受迫振动', 'm ẍ + c ẋ + k x = F₀ sin(ωt)', '共振时，曲线会一直长大吗？', '选择“无阻尼共振”，观察增长的包络；再增大 ζ，比较稳态振幅。无阻尼非共振时自由振动分量不会消失，近频可出现拍振。'],
    unbalance: ['实验 04', '旋转不平衡质量激励', 'm ẍ + c ẋ + k x = mₑ e ω² sin(ωt + θ)', '转速加倍，激励力会变成几倍？', '总支承质量 m 包括不平衡质量 mₑ。保持质量比 μ 和偏心距 e，改变 r。激励力幅按 ω² 改变；高频位移幅趋向 μe。'],
    periodic: ['实验 06', '周期激励', 'm ẍ + c ẋ + k x = Σ Fₙ sin(nωt + nθ)', '基频没有共振，高阶谐波会共振吗？', '选择方波并令 r = 1/3、ζ = 0。第三阶谐波位于固有频率，即使基频远离共振，也会产生持续增长。增大最高阶数比较傅里叶截断效果。'],
    arbitrary: ['实验 07', '任意激励', 'm ẍ + c ẋ + k x = F(t)', '荷载停止以后，系统为什么还在振动？', '比较阶跃、矩形脉冲、半正弦脉冲和瞬时冲量。切换激励图观察输入，荷载撤去后系统以结束时的位移和速度继续自由振动。自定义 CSV 支持任意分段线性力时程。'],
    base: ['实验 05', '基础运动激励', 'm ü + c u̇ + k u = −m ÿ', '什么时候运动能被隔离？', '选择基础隔振情景，切换幅频图。对于绝对位移传递率 X/Y，r > √2 时小于 1；高频区增大阻尼可能增加传递。u = x − y，绝对位移 x 与弹簧变形 u 不相同。']
  };
  const defs = {
    m: ['质量 m', 'kg', 0.1], k: ['刚度 k', 'N/m', 1], zeta: ['阻尼比 ζ', '—', 0.01],
    x0: ['初位移 x₀', 'm', 0.005], v0: ['初速度 v₀', 'm/s', 0.05], F: ['力幅 F₀', 'N', 0.1], Y: ['基础幅 Y', 'm', 0.001], r: ['频率比 r', '—', 0.01], duration: ['观察时长', 's', 1], phi: ['激励初相位 θ', '°', 1], mu: ['质量比 μ=mₑ/m', '—', .01], eccentricity: ['偏心距 e', 'm', .001], harmonics: ['最高谐波阶数 N', '—', 1], tau: ['持续/上升时间 τ', 's', .01], delay: ['开始时间 t₀', 's', .05], J: ['冲量 J', 'N·s', .05], Ag: ['基础加速度幅 Aᵍ', 'm/s²', .1]
  };
  let p = { ...V.DEFAULTS }, sys, points, visualPeak = .1, visualForcePeak = 1, comparison = null, t = 0, running = false, last = 0, chartType = 'time', frame = 0, toastTimer;
  const fmt = (n, digits = 4) => !Number.isFinite(n) ? (n === Infinity ? '∞' : '—') : Math.abs(n) > 9999 ? n.toExponential(2) : (Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n).toFixed(digits);
  function notify(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); }
  function setRunning(value) { running = value; last = 0; $('play').textContent = value ? 'Ⅱ 暂停实验' : t >= p.duration ? '↺ 再做一次' : '▶ 开始实验'; }
  function buildFields() {
    const harmonic = ['forced','unbalance','base','periodic'].includes(p.mode);
    const keys = ['m','k', ...(p.mode === 'free' ? [] : ['zeta']), 'x0','v0',
      ...(p.mode === 'forced' ? ['F','r','phi'] : p.mode === 'unbalance' ? ['mu','eccentricity','r','phi'] : p.mode === 'base' ? [p.baseInput === 'displacement' ? 'Y' : 'Ag','r','phi'] : p.mode === 'periodic' ? ['F','r','phi','harmonics'] : p.mode === 'arbitrary' ? [...(p.load === 'impulse' ? ['J'] : p.load === 'csv' ? [] : ['F']), ...(p.load === 'csv' ? [] : ['delay']), ...(['ramp','rectangle','triangle','halfSine'].includes(p.load) ? ['tau'] : []), ...(p.load === 'chirp' ? ['r'] : [])] : []), 'duration'];
    const select = (id,label,options,value) => '<label for="'+id+'">'+label+'<select id="'+id+'">'+options.map(([v,text])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+text+'</option>').join('')+'</select></label>';
    $('loadOptions').innerHTML = p.mode === 'periodic' ? select('wave','周期波形',[['square','方波（零均值）'],['triangle','三角波'],['sawtooth','锯齿波'],['mix','三频叠加']],p.wave) : p.mode === 'arbitrary' ? select('load','荷载形式',[['step','阶跃力'],['ramp','有限上升时间斜坡'],['rectangle','矩形脉冲'],['triangle','三角脉冲'],['halfSine','半正弦脉冲'],['impulse','理想瞬时冲量'],['chirp','线性扫频力'],['csv','自定义 CSV 时程']],p.load) : p.mode === 'base' ? select('baseInput','基础输入',[['displacement','指定基础位移 y(t)'],['acceleration','指定基础加速度 ÿ(t)']],p.baseInput) : '';
    for(const key of ['wave','load','baseInput']) if($(key)) $(key).addEventListener('change',e=>{p[key]=e.target.value;buildFields();rebuild();});
    $('customLoad').hidden = !(p.mode === 'arbitrary' && p.load === 'csv');
    $('loadCSV').value=p.csv;
    $('responseBar').hidden = !harmonic;
    $('fields').innerHTML = keys.map(key => {
      const [label, unit, step] = defs[key], [min, max] = V.LIMITS[key];
      return `<div class="field"><div class="field-head"><label for="n-${key}">${label}</label><div class="number-wrap"><input id="n-${key}" type="number" min="${min}" max="${max}" step="${step}" value="${p[key]}" inputmode="decimal"><span class="unit">${unit}</span></div></div><input id="s-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${p[key]}" aria-label="${label}滑块"><div class="range-ends"><span>${min}</span><span>${max}</span></div></div>`;
    }).join('');
    for (const key of keys) {
      $('s-' + key).addEventListener('input', e => { p[key] = Number(e.target.value); $('n-' + key).value = p[key]; rebuild(); });
      $('n-' + key).addEventListener('input', e => {
        const n = Number(e.target.value), [lo, hi] = V.LIMITS[key];
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= lo && n <= hi && (key !== 'harmonics' || Number.isInteger(n))) {
          p[key] = n; $('s-' + key).value = n; rebuild();
        }
      });
      $('n-' + key).addEventListener('change', e => {
        const n = Number(e.target.value), [lo, hi] = V.LIMITS[key];
        if (e.target.value.trim() === '' || !Number.isFinite(n) || n < lo || n > hi || (key === 'harmonics' && !Number.isInteger(n))) { e.target.value = p[key]; notify(`请输入 ${lo} 至 ${hi} 之间的${key === 'harmonics' ? '整数' : '数值'}`); return; }
        if (p[key] !== n) { p[key] = n; $('s-' + key).value = n; rebuild(); }
      });
    }
  }
  function rebuild() {
    setRunning(false); t = 0; sys = V.system(p); p = sys.p;
    // Aim for 100 samples per fastest oscillation; cap the display/export grid
    // at 24000 intervals. Direct readouts remain independent of this grid.
    points = sys.trajectory(Math.min(16000, Math.max(1800, Math.ceil(p.duration * Math.max(sys.d.wn, sys.d.omega * (p.mode === 'periodic' ? p.harmonics : 1)) * 16))));
    visualPeak = points.reduce((peak, a) => Math.max(peak, Math.abs(a.x)), Math.max(.04, p.mode === 'base' ? p.Y * 1.6 : 0));
    visualForcePeak = points.reduce((peak, a) => Math.max(peak, Math.abs(a.force)), 1e-12);
    $('scrub').max = p.duration; $('scrub').value = 0; $('endTime').textContent = p.duration + ' s';
    document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active', b.dataset.mode === p.mode); b.setAttribute('aria-pressed', b.dataset.mode === p.mode); });
    const data = info[p.mode]; $('experimentId').textContent = data[0]; $('experimentTitle').textContent = data[1]; $('equation').textContent = data[2]; $('taskTitle').textContent = data[3]; $('taskText').textContent = data[4];
    $('regime').textContent = sys.d.regime;
    const base = p.mode === 'base', baseAcc=base && p.baseInput==='acceleration', harmonic=sys.supportsSteady;
    $('damperGroup').style.opacity = p.zeta === 0 ? '0.22' : '1';
    $('fourthLabel').innerHTML = base ? '相对位移 u <small>m</small>' : '机械能 E <small>J</small>';
    $('coordinateNote').textContent = baseAcc ? '输入 ÿ = Aᵍ sin(ωt+θ)，u=x−y；基础初始位移和速度为零。稳态指相对位移 u；绝对位移 x 可包含基础运动的漂移。' : base ? '输入 y=Y sin(ωt+θ)，u=x−y；初位移、初速度均为绝对 x₀、v₀，内部按实际 y₀、ẏ₀ 转换。' : '位移 x 从静平衡位置量起；初始条件在 t=0 定义，向右为正。传递力 Fₜ=kx+cv。';
    for(const type of ['frequency','phaseFrequency']) document.querySelector('[data-chart="'+type+'"]').disabled=!harmonic;
    if(!harmonic && ['frequency','phaseFrequency'].includes(chartType)) chartType='time';
    $('response').value=p.response;
    $('response').querySelector('[value="steady"]').disabled=!sys.hasSteady;
    $('components').disabled=!sys.hasSteady || p.response!=='full';
    if($('components').disabled) $('components').checked=false;
    let note = sys.responseWarning || (harmonic ? p.response==='steady' ? '稳态模式不使用 x₀、v₀。ζ>0 时，全响应的瞬态分量衰减后趋于此解。' : '全响应 = 稳态特解 + 初始条件对应的瞬态分量。ζ=0 时自由分量不会衰减。' : '');
    if(harmonic && !sys.hasSteady) note='存在无阻尼共振谐波，无有界稳态；当前显示全响应。';
    if(p.mode==='periodic') note+=' 输入及响应均按最高阶数 N='+p.harmonics+' 的傅里叶级数计算；不连续波形附近存在 Gibbs 现象。';
    if(p.mode==='arbitrary') note=p.load==='impulse' ? '冲量在 t₀ 使速度瞬时改变 Δv=J/m；位移连续。图中读数取冲量后的右极限，冲量能量跳变不包含在普通功率积分中。' : p.load==='halfSine' ? '半正弦在 600 个等长区间内线性近似；每个区间进行精确状态推进。' : p.load==='csv' ? '分段线性力时程；末点以后保持末值，填 0 可结束荷载。' : p.load==='chirp' ? '从 ω 起按线性规律扫频，观察时长结束时达到 2ω（从 t₀ 起计算）。激励以分段线性采样近似。' : '阶跃/脉冲边界取右极限；分段线性荷载区间采用矩阵指数精确推进。';
    if(baseAcc) note+=' 稳态与相频以相对坐标和等效惯性力 −mÿ 为基准。';
    $('responseNote').textContent=note;
    const d=sys.d, f=V.frequency(p), forceAmp=p.mode==='unbalance'?p.m*p.mu*p.eccentricity*d.omega*d.omega:p.F;
    const metrics=[['固有圆频率 ωₙ',fmt(d.wn,3),'rad/s'],['固有周期 Tₙ',fmt(d.Tn,3),'s'],['阻尼系数 c',fmt(d.c,3),'N·s/m'],...(harmonic?[['激励圆频率 ω',fmt(d.omega,3),'rad/s'],[p.mode==='periodic'?'有效谐波数':base?'当前传递函数幅值比':p.mode==='unbalance'?'不平衡力幅 F₀':'谐波位移幅 X',p.mode==='periodic'?String(sys.harmonics.length):fmt(p.mode==='unbalance'?forceAmp:base?f.gain:f.amplitude,4),p.mode==='unbalance'?'N':base||p.mode==='periodic'?'':'m']]:[['阻尼圆频率 ωd',d.wd===null?'无':fmt(d.wd,3),'rad/s'],['临界阻尼 cc',fmt(d.cc,3),'N·s/m']])];
    $('metrics').innerHTML=metrics.map(([a,b,c])=>'<div><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></div>').join('');
    if(baseAcc) $('equation').textContent='m ü + c u̇ + k u = −m Aᵍ sin(ωt + θ)';
    const common='<p class="theory-math">ωₙ=√(k/m)，Tₙ=2π/ωₙ，c=2ζ√(km)，r=ω/ωₙ。</p><p>质量集中、刚度线性、黏性阻尼、参数恒定；不包括干摩擦、非线性刚度、碰撞和随机振动统计。</p>';
    const D='√[(1−r²)²+(2ζr)²]';
    const theories={
      free:'<p>x=x₀ cos(ωₙt)+(v₀/ωₙ)sin(ωₙt)，E=½mv²+½kx²。</p>',
      damped:'<p>欠阻尼 ωd=ωₙ√(1−ζ²)，x=e<sup>−ζωₙt</sup>[x₀ cos(ωdt)+(v₀+ζωₙx₀)sin(ωdt)/ωd]。临界阻尼为指数乘一次多项式，过阻尼为两个实指数之和。ζ≥1 不存在周期振荡。</p>',
      forced:'<p>X=(F₀/k)/'+D+'，φ=atan2(2ζr,1−r²)。稳态特解 xₛ=X sin(ωt+θ−φ)。全响应 x=xₛ+xₜ。力传递率 |Fₜ|/F₀=√[1+(2ζr)²]/'+D+'。</p>',
      unbalance:'<p>mₑ=μm，F₀=mₑeω²；m 为总支承质量（含 mₑ）。X/(μe)=r²/'+D+'。高转速下 X→μe。该模型是一维投影、匀速旋转，不计启停转速变化。</p>',
      base:'<p>指定基础位移时 X/Y=√[1+(2ζr)²]/'+D+'，U/Y=r²/'+D+'；X/Y&lt;1 的阈值 r&gt;√2。指定基础加速度时相对位移幅 U=(Aᵍ/ωₙ²)/'+D+'。</p><p>基础加速度积分采用 y(0)=ẏ(0)=0，可能产生位移漂移。不能把相对位移 u 与绝对位移 x 混用。</p>',
      periodic:'<p>方波：奇数阶 bₙ=4F/(πn)；三角波：奇数阶 bₙ=8F(−1)<sup>(n−1)/2</sup>/(π²n²)；锯齿波：bₙ=2F(−1)<sup>n+1</sup>/(πn)。三频叠加系数为 F、0.35F、0.2F。相位为 nθ。</p><p>分别求各谐波的全响应/稳态后叠加。任一非零谐波 nω=ωₙ 且 ζ=0 时没有有界周期稳态。幅频/相频显示系统对单个单位谐波的频响，不是整个非正弦波的单一幅值。</p>',
      arbitrary:'<p>全响应 x(t)=x<sub>自由</sub>(t)+∫₀ᵗh(t−τ)F(τ)dτ。欠阻尼 h(t)=e<sup>−ζωₙt</sup>sin(ωdt)/(mωd)；临界 h(t)=t e<sup>−ωₙt</sup>/m。计算以等价状态空间推进实现卷积。</p><p>阶跃 F·H(t−t₀)；斜坡在 τ 内从 0 升到 F 并保持；矩形/三角/半正弦脉冲在 τ 后归零。理想冲量令 x 连续，v(t₀⁺)=v(t₀⁻)+J/m。无阻尼零初始条件阶跃最大位移为 2F/k。</p>'
    };
    $('theory').innerHTML=common+theories[p.mode]+'<p>无阻尼精确共振且激励非零时没有有界稳态；r=0 表示零频率，正弦与初相位共同决定是否成为常值输入。频响端点表示低频极限。</p>';
    $('dampingValues').textContent=sys.damping.delta===null?'当前参数不满足 0<ζ<1 的对数减量法条件。':'当前模型理论值：δ='+fmt(sys.damping.delta,4)+'，Td='+fmt(sys.damping.Td,4)+' s。';
    updateComparison(); updateChartTabs(); render();
  }
  function updateComparison() {
    $('clearCompare').hidden = !comparison;
    $('compare').textContent = comparison ? '↻ 用当前参数替换对照' : '＋ 保留当前曲线作对照';
    $('compareInfo').textContent = comparison ? `对照：${info[comparison.p.mode][0].split(' · ')[0]}，m=${comparison.p.m}，k=${comparison.p.k}，ζ=${comparison.p.zeta}；${comparison.p.duration} s。` : '';
  }
  function changeMode(mode, extra = {}) { p = { ...p, mode, ...extra }; buildFields(); rebuild(); }
  function updateChartTabs() {
    document.querySelectorAll('[data-chart]').forEach(b => b.setAttribute('aria-selected', b.dataset.chart === chartType));
    $('quantity').hidden = chartType !== 'time';
    $('freqKind').hidden = !['frequency','phaseFrequency'].includes(chartType);
  }
  function stage(s) {
    const scale = 150 / visualPeak, offset = s.x * scale, left = 420 + offset, by = s.y * scale, anchor = 118 + by;
    $('mass').setAttribute('transform', `translate(${offset},0)`); $('baseGroup').setAttribute('transform', `translate(${by},0)`);
    const start = anchor + 26, end = left - 22, gap = (end - start) / 16;
    let path = `M${anchor} 90H${start}`;
    for (let i = 0; i <= 16; i++) path += `L${start + i * gap} ${i === 0 || i === 16 ? 90 : i % 2 ? 78 : 102}`;
    path += `H${left}`; $('spring').setAttribute('d', path);
    const center = anchor + (left - anchor) * 0.52;
    $('damper').setAttribute('d', `M${anchor} 135H${center - 20}M${center + 22} 122H${center - 20}V148H${center + 22}M${center + 7} 125V145M${center + 7} 135H${left}`);
    const showForce = p.mode !== 'base' && Math.abs(s.force) > 0.001;
    $('forceArrow').setAttribute('d', showForce ? `M${s.force >= 0 ? left + 100 : left} 113h${Math.sign(s.force) * (12 + Math.min(1, Math.abs(s.force) / visualForcePeak) * 55)}` : '');
    $('forceLabel').setAttribute('x',s.force >= 0 ? left + 110 : left - 80); $('forceLabel').setAttribute('y',55);
    $('forceLabel').style.display = ['forced','unbalance','periodic','arbitrary'].includes(p.mode) ? '' : 'none';
    $('rotor').toggleAttribute('hidden',p.mode!=='unbalance'); $('massText').style.display=p.mode==='unbalance'?'none':'';
    $('rotorArm').setAttribute('transform','rotate('+((sys.d.omega*s.t+p.phi*Math.PI/180)*180/Math.PI-90)+' 470 115)');
    $('baseLabel').textContent = p.mode === 'base' ? '移动支座 y(t)' : '固定支座';
    $('scaleNote').textContent = '运动示意 · 100 px ≈ ' + fmt(100 / scale, 3) + ' m（自动缩放）';
  }
  function render() {
    if (!running) $('play').textContent = t >= p.duration ? '↺ 再做一次' : '▶ 开始实验';
    const s = sys.at(t); $('timeValue').textContent = fmt(t, 3); $('scrub').value = t;
    $('readX').textContent = fmt(s.x); $('readV').textContent = fmt(s.v); $('readA').textContent = fmt(s.a); $('readE').textContent = fmt(p.mode === 'base' ? s.u : s.energy);
    stage(s); drawChart(s);
  }
  const colors = { teal: '#287f7d', orange: '#bf7937', blue: '#6176a6', pale: '#d2e3d9', grid: '#e6eae2', text: '#70827b' };
  function drawChart(current) {
    const canvas = $('chart'), rect = canvas.getBoundingClientRect(), w = rect.width, h = rect.height, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const box = { l: w < 450 ? 48 : 57, r: 15, t: 18, b: 31 }, pw = w - box.l - box.r, ph = h - box.t - box.b;
    let xmin = 0, xmax = p.duration, ymin, ymax, series = [], xLabel = 't / s', yLabel, marker, clipNotice = '';
    const quantity = $('quantity').value, comp = comparison;
    function range(values, zero = true) {
      let min = zero ? 0 : Infinity, max = zero ? 0 : -Infinity;
      for (const v of values) if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
      if (!Number.isFinite(min) || max - min < 1e-12) return [-0.1, 0.1];
      const pad = (max - min) * .12; return [min - pad, max + pad];
    }
    const point = (a, x, y) => a.map(s => [s[x], s[y]]);
    if (chartType === 'time') {
      const names = { x: ['绝对位移时程','x / m'], v:['速度时程','v / (m/s)'], a:['加速度时程','a / (m/s²)'], u:['相对位移时程','u / m'], Ft:['传递力时程','Fₜ / N'] };
      $('chartTitle').textContent = names[quantity][0]; yLabel = names[quantity][1];
      series.push({ pts: point(points, 't', quantity), color: colors.teal, live: true });
      let legend = '<span>'+ (p.response==='steady'?'稳态响应':'全响应') +'</span>';
      if($('components').checked && sys.hasSteady && ['x','v','a'].includes(quantity)) { const sk={x:'steadyX',v:'steadyV',a:'steadyA'}[quantity],tk={x:'transientX',v:'transientV',a:'transientA'}[quantity]; series.push({pts:point(points,'t',sk),color:colors.orange,dashed:true}); series.push({pts:point(points,'t',tk),color:colors.blue,dashed:true});legend+='<span class="orange">稳态</span><span class="blue">瞬态</span>'; }
      if (p.mode === 'base' && quantity === 'x') { series.push({ pts: point(points, 't', 'y'), color: colors.orange, dashed: true }); legend += '<span class="orange">基础 y</span>'; }
      if (comp) { series.push({ pts: point(comp.points.filter(a => a.t <= p.duration), 't', quantity), color: colors.blue, dashed: true }); legend += '<span class="blue">保留对照</span>'; }
      [ymin, ymax] = range(series.flatMap(s => s.pts.map(a => a[1]))); marker = [t, current[quantity]];
      $('legend').innerHTML = legend; $('chartNote').textContent = '淡线预览整个实验；深线为已播放部分。全响应包含初始条件；稳态模式显示谐波特解。' + (p.duration * Math.max(sys.d.wn, sys.d.omega * (p.mode === 'periodic' ? p.harmonics : 1)) / (2 * Math.PI) > pw / 5 ? '波形密集，缩短观察时长可看清细节。' : '');
    } else if (chartType === 'phase') {
      $('chartTitle').textContent = '相平面 · 绝对位移与速度'; yLabel = 'v / (m/s)'; xLabel = 'x / m';
      series.push({ pts: point(points, 'x', 'v'), color: colors.teal, live: true });
      if (comp) series.push({ pts: point(comp.points, 'x', 'v'), color: colors.blue, dashed: true });
      [xmin, xmax] = range(series.flatMap(s => s.pts.map(a => a[0]))); [ymin, ymax] = range(series.flatMap(s => s.pts.map(a => a[1]))); marker = [current.x, current.v];
      $('legend').innerHTML = '<span>当前实验</span>' + (comp ? '<span class="blue">保留对照</span>' : '');
      $('chartNote').textContent = '无阻尼自由振动形成闭合椭圆；阻尼自由振动逐渐趋向原点。相图横轴不是时间。';
    } else if (chartType === 'energy') {
      $('chartTitle').textContent = '能量随时间的变化'; yLabel = 'E / J';
      series = [['energy', colors.teal], ['kinetic', colors.orange], ['potential', colors.blue]].map(([key, color]) => ({ pts: point(points, 't', key), color, live: true }));
      [ymin, ymax] = range(points.map(a => a.energy)); ymin = 0;
      $('legend').innerHTML = '<span>机械能 E</span><span class="orange">动能 K</span><span class="blue">势能 V</span>';
      $('chartNote').textContent = p.mode === 'base' ? 'K = ½mẋ²，V = ½ku²。移动支座会输入或带走能量；本图不叠加对照。' : 'K = ½mv²，V = ½kx²，E = K + V。有阻尼自由振动满足 dE/dt = −cv²；本图不叠加对照。';
    } else if(chartType==='input') {
      const base=p.mode==='base', acc=base&&p.baseInput==='acceleration', impulse=p.mode==='arbitrary'&&p.load==='impulse';
      const key=base?(acc?'ya':'y'):'force'; yLabel=impulse?'J / (N·s)':base?(acc?'ÿ / (m/s²)':'y / m'):'F / N';
      $('chartTitle').textContent=impulse?'冲量与作用时刻':base?'基础输入时程':'激励力时程';
      const pts=impulse?[[0,0],[p.delay,0],[p.delay,p.J],[p.delay,0],[p.duration,0]]:point(points,'t',key);
      series.push({pts,color:colors.orange}); [ymin,ymax]=range(pts.map(a=>a[1]));
      $('legend').innerHTML='<span class="orange">输入</span>';
      $('chartNote').textContent=impulse?'竖线表示冲量大小，不表示有限的力峰值；速度在作用时刻跳变。':p.mode==='periodic'?'实际施加的是 N 阶傅里叶截断波形；提高 N 观察逼近与 Gibbs 现象。':'阶跃和脉冲边界采用右侧值。初始条件不属于外部激励。';
    } else {
      const isPhase=chartType==='phaseFrequency', kind=$('freqKind').value, base=p.mode==='base', baseAcc=base&&p.baseInput==='acceleration';
      const name=kind==='transmission'?(base?'基础绝对位移/加速度传递率':'力传递率 |Fₜ|/F₀'):base?(baseAcc?'相对位移放大率 U/(Aᵍ/ωₙ²)':'绝对位移传递率 X/Y'):p.mode==='unbalance'?'不平衡位移比 X/(μe)':'位移放大系数 X/(F₀/k)';
      $('chartTitle').textContent=(isPhase?'相频 · ':'幅频 · ')+name; xLabel='r = ω/ωₙ'; yLabel=isPhase?'滞后 / °':'幅值比'; xmin=0;xmax=4;
      function freqSeries(params){return Array.from({length:1001},(_,i)=>{const r=i*.004,f=V.frequency(params,r,kind);return[r,isPhase?(f.phase===null?NaN:f.phase*180/Math.PI):f.gain];});}
      series.push({pts:freqSeries(p),color:colors.teal});
      const comparable=comp&&comp.p.mode===p.mode&&(p.mode!=='base'||comp.p.baseInput===p.baseInput);
      if(comparable)series.push({pts:freqSeries(comp.p),color:colors.blue,dashed:true});
      const finite=series.flatMap(s=>s.pts.map(a=>a[1])).filter(Number.isFinite);
      ymin=0;ymax=isPhase?180:Math.min(30,Math.max(2,...finite)*1.1);
      const f=V.frequency(p,p.r,kind),value=isPhase?(f.phase===null?NaN:f.phase*180/Math.PI):f.gain;
      marker=Number.isFinite(value)&&value<=ymax?[p.r,value]:null;
      $('legend').innerHTML='<span>单位谐波频响</span>'+(comparable?'<span class="blue">保留对照</span>':'');
      $('chartNote').textContent='当前幅值比 '+fmt(f.gain,3)+'；滞后 '+(f.phase===null?'无定义':fmt(f.phase*180/Math.PI,1)+'°')+'。'+(p.mode==='periodic'?'此图为单一谐波的系统频响。':'')+(baseAcc?(kind==='transmission'?'绝对加速度相位以基础加速度 ÿ 为基准。':'相对响应相位以等效惯性力 −mÿ 为基准。'):'')+(!isPhase?'超出纵轴上限 '+fmt(ymax,1)+' 的峰值不显示。':'')+'无阻尼 r=1 为奇点。';
      if(!isPhase&&(base||kind==='transmission'))series.push({pts:[[0,1],[4,1]],color:'#aab6aa',dashed:true});
    }
    const xp = x => box.l + (x - xmin) / (xmax - xmin) * pw, yp = y => box.t + ph - (y - ymin) / (ymax - ymin) * ph;
    const tick = n => Math.abs(n) >= 1000 || (Math.abs(n) > 0 && Math.abs(n) < .001) ? n.toExponential(1) : Number(n.toPrecision(3)).toString();
    ctx.font = '10px Consolas, monospace'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = box.t + i * ph / 4, val = ymax - i * (ymax - ymin) / 4;
      ctx.strokeStyle = colors.grid; ctx.beginPath(); ctx.moveTo(box.l, y); ctx.lineTo(w - box.r, y); ctx.stroke();
      ctx.fillStyle = colors.text; ctx.textAlign = 'right'; ctx.fillText(tick(val), box.l - 7, y + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const x = box.l + i * pw / 4; ctx.strokeStyle = colors.grid; ctx.beginPath(); ctx.moveTo(x, box.t); ctx.lineTo(x, h - box.b); ctx.stroke();
      ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.fillText(tick(xmin + i * (xmax - xmin) / 4), x, h - box.b + 15);
    }
    ctx.fillStyle = colors.text; ctx.textAlign = 'left'; ctx.fillText(yLabel, 3, 10); ctx.textAlign = 'right'; ctx.fillText(xLabel, w - box.r, h - 2);
    ctx.save(); ctx.beginPath(); ctx.rect(box.l, box.t, pw, ph); ctx.clip();
    if (ymin < 0 && ymax > 0) { ctx.strokeStyle = '#b9c8bd'; ctx.beginPath(); ctx.moveTo(box.l, yp(0)); ctx.lineTo(w - box.r, yp(0)); ctx.stroke(); }
    function line(pts, color, dash, alpha, limit = pts.length) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.7; ctx.globalAlpha = alpha; ctx.setLineDash(dash ? [5, 4] : []); ctx.beginPath(); let open = false;
      for (let i = 0; i < Math.min(pts.length, limit); i++) { const [x, y] = pts[i]; if (!Number.isFinite(y) || (['frequency','phaseFrequency'].includes(chartType) && y > ymax)) { open = false; continue; } const xx = xp(x), yy = yp(y); if (open) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); open = true; }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    let lo=0,hi=points.length; while(lo<hi){const mid=Math.floor((lo+hi)/2);if(points[mid].t<=t)lo=mid+1;else hi=mid;}
    for (const s of series) { if (s.live) { line(s.pts, s.color, false, .18); line(s.pts, s.color, false, 1, lo); } else line(s.pts, s.color, s.dashed, .85); }
    if (['time','energy','input'].includes(chartType)) { ctx.strokeStyle = '#7d9d8d'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(xp(t), box.t); ctx.lineTo(xp(t), h - box.b); ctx.stroke(); ctx.setLineDash([]); }
    if (marker) { ctx.fillStyle = colors.teal; ctx.beginPath(); ctx.arc(xp(marker[0]), yp(marker[1]), 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fffefa'; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.restore();
  }
  function download(name, text, type) {
    try { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000); $('exportNote').textContent = '已生成文件；请查看浏览器下载'; }
    catch (e) { notify('此预览器不支持下载，请使用浏览器打开'); }
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => changeMode(b.dataset.mode, b.dataset.mode === 'free' ? { zeta: 0 } : p.zeta === 0 ? { zeta: .08 } : {})));
  document.querySelectorAll('[data-chart]').forEach(b => b.addEventListener('click', () => { chartType = b.dataset.chart; updateChartTabs(); render(); }));
  $('quantity').addEventListener('change', render);
  $('freqKind').addEventListener('change',render);
  $('components').addEventListener('change',render);
  $('response').addEventListener('change',e=>{p.response=e.target.value;rebuild();});
  $('play').addEventListener('click', () => { if (t >= p.duration) t = 0; setRunning(!running); render(); });
  $('restart').addEventListener('click', () => { t = 0; setRunning(false); render(); });
  $('step').addEventListener('click', () => { setRunning(false); t = Math.min(p.duration, t + .02); render(); });
  $('scrub').addEventListener('input', e => { setRunning(false); t = Number(e.target.value); render(); });
  $('resetParams').addEventListener('click', () => { p = { ...V.DEFAULTS, mode: p.mode }; buildFields(); rebuild(); });
  $('compare').addEventListener('click', () => { comparison = { p: { ...p }, points: points.map(s => ({ ...s })) }; updateComparison(); render(); notify('已保留当前参数的完整曲线，试着改变一个参数'); });
  $('clearCompare').addEventListener('click', () => { comparison = null; updateComparison(); render(); });
  $('preset').addEventListener('change', e => {
    const presets = {
      period: { mode: 'free', m: 2, k: 100, zeta: 0, x0: .08, v0: 0 }, critical: { mode: 'damped', zeta: 1, x0: .08, v0: 0 }, over: { mode: 'damped', zeta: 2, x0: .08, v0: 0 },
      resonance: { mode: 'forced', zeta: 0, r: 1, x0: 0, v0: 0, F: 4, duration: 12 }, beats: { mode: 'forced', zeta: 0, r: .9, x0: 0, v0: 0, F: 4, duration: 20 }, rotor:{mode:'unbalance',mu:.1,eccentricity:.02,r:2,x0:0,v0:0}, harmonicResonance:{mode:'periodic',wave:'square',harmonics:9,r:1/3,zeta:0,x0:0,v0:0,duration:20}, stepLoad:{mode:'arbitrary',load:'step',delay:.5,x0:0,v0:0,zeta:0}, pulseLoad:{mode:'arbitrary',load:'halfSine',tau:.3,delay:.5,x0:0,v0:0}, impulseLoad:{mode:'arbitrary',load:'impulse',J:.4,delay:.5,x0:0,v0:0}, custom:{mode:'arbitrary',load:'csv',x0:0,v0:0}, isolation: { mode: 'base', zeta: .1, r: 3, Y: .02, x0: 0, v0: 0, duration: 12 }
    };
    if (presets[e.target.value]) { p = { ...V.DEFAULTS, ...presets[e.target.value] }; buildFields(); rebuild(); notify('已载入课堂情景，点击开始实验'); }
    e.target.value = '';
  });
  $('exportCSV').addEventListener('click', () => {
    const keys = ['t','x','v','a','u','uv','ua','y','yv','ya','force','effectiveForce','Ft','kinetic','potential','energy','dampingPower','inputPower','steadyX','steadyV','steadyA','transientX','transientV','transientA'];
    const metadata = '# Vibration Lab v1.0.1; SI units; ' + JSON.stringify(p) + '\r\n';
    const header = 't_s,x_m,v_m_s,a_m_s2,u_m,uv_m_s,ua_m_s2,y_m,yv_m_s,ya_m_s2,external_force_N,effective_force_N,transmitted_force_N,kinetic_J,potential_J,energy_J,damping_power_W,input_power_W,steady_x_m,steady_v_m_s,steady_a_m_s2,transient_x_m,transient_v_m_s,transient_a_m_s2';
    download('vibration-' + p.mode + '.csv', '\uFEFF' + metadata + header + '\r\n' + points.map(s => keys.map(k => s[k]===null?'':s[k].toPrecision(12)).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  });
  $('exportConfig').addEventListener('click', () => download('vibration-parameters.json', JSON.stringify({ version: 1, parameters: p }, null, 2), 'application/json'));
  $('importConfig').addEventListener('click', () => $('configFile').click());
  $('configFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { if (file.size > 180000) throw Error('文件过大'); const data = JSON.parse(await file.text()); if (data.version !== 1 || !data.parameters || Object.keys(Vibration.DEFAULTS).some(k => !(k in data.parameters))) throw Error('格式或版本不匹配'); const clean = Object.fromEntries(Object.keys(V.DEFAULTS).map(k => [k, data.parameters[k]===undefined?V.DEFAULTS[k]:data.parameters[k]])); p = V.validate(clean); buildFields(); rebuild(); notify('参数已载入'); }
    catch (err) { notify('无法载入参数：' + err.message); } finally { e.target.value = ''; }
  });
  $('applyLoad').addEventListener('click',()=>{try{V.parseLoad($('loadCSV').value);p.csv=$('loadCSV').value;rebuild();$('loadFeedback').textContent='时程已应用';}catch(err){$('loadFeedback').textContent=err.message;notify(err.message);}});
  $('importLoad').addEventListener('click',()=>$('loadFile').click());
  $('loadFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>150000)throw Error('文件过大');const text=(await file.text()).replace(/^\uFEFF/,'');V.parseLoad(text);p.csv=text;buildFields();rebuild();$('loadFeedback').textContent='已载入 '+file.name;}catch(err){notify('时程载入失败：'+err.message);}finally{e.target.value='';}});
  $('sampleLoad').addEventListener('click',()=>download('load-example.csv','t_s,F_N\r\n0,0\r\n0.5,0\r\n1,4\r\n1.5,-2\r\n2,0\r\n12,0','text/csv;charset=utf-8'));
  $('identify').addEventListener('click',()=>{try{const z=V.identify(Number($('peak1').value),Number($('peak2').value),Number($('peakTime').value),Number($('peakCycles').value));$('identifyResult').textContent='δ='+fmt(z.delta,4)+'，ζ='+fmt(z.zeta,4)+'，ωd='+fmt(z.wd,3)+' rad/s，ωₙ='+fmt(z.wn,3)+' rad/s';}catch(err){$('identifyResult').textContent=err.message;}});
  for (const [button, dialog] of [['helpBtn', 'helpDialog'], ['aboutBtn', 'aboutDialog']]) $(button).addEventListener('click', () => { setRunning(false); $(dialog).showModal(); });
  document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setRunning(false); });
  window.addEventListener('resize', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); });
  function loop(now) { if (running) { if (last) t = Math.min(p.duration, t + Math.min((now - last) / 1000, .1) * Number($('speed').value)); last = now; if (t >= p.duration) setRunning(false); render(); } requestAnimationFrame(loop); }
  buildFields(); rebuild();
  const check = V.selfCheck(); $('checkStatus').textContent = check.pass ? '计算内核自检通过 · '+check.checks+' 项基准' : '计算自检异常，请停止使用';
  $('selfCheckDetail').textContent = `启动自检：${check.checks} 项解析基准，最大位移绝对误差 ${check.maxError.toExponential(2)} m。完整独立数值测试见源码包的验证报告。`;
  if (!check.pass) { $('play').disabled = true; notify('计算自检未通过，请检查文件完整性'); }
  requestAnimationFrame(loop);
})();
