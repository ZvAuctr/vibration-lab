/* UI only. All physical values come from physics.js, independent of rendering FPS. */
(function () {
  'use strict';
  const V = Vibration, $ = id => document.getElementById(id);
  const info = {
    free: ['实验 01', '无阻尼自由振动', 'm ẍ + k x = 0', '质量加倍后，周期会加倍吗？', '先保留当前曲线，再将质量 m 加倍。用时间轴比较相邻波峰：Tₙ = 2π√(m/k)，周期变为原来的 √2 倍。'],
    damped: ['实验 02', '有阻尼自由振动', 'm ẍ + c ẋ + k x = 0', '阻尼越大，回到平衡就一定越快吗？', '将 ζ 依次设为 0.08、1 和 2，并保留曲线比较。欠阻尼存在振荡；临界与过阻尼没有周期振荡。注意：有初速度时，非振荡响应也可能穿过零点一次。'],
    forced: ['实验 03', '简谐受迫振动', 'm ẍ + c ẋ + k x = F₀ sin(ωt)', '共振时，曲线会一直长大吗？', '选择“无阻尼共振”，观察增长的包络；再增大 ζ，比较稳态振幅。无阻尼非共振时自由振动分量不会消失，近频可出现拍振。'],
    base: ['实验 04', '基础简谐激励', 'm ü + c u̇ + k u = −m ÿ', '什么时候运动能被隔离？', '选择基础隔振情景，切换幅频图。对于绝对位移传递率 X/Y，r > √2 时小于 1；高频区增大阻尼可能增加传递。u = x − y，绝对位移 x 与弹簧变形 u 不相同。']
  };
  const defs = {
    m: ['质量 m', 'kg', 0.1], k: ['刚度 k', 'N/m', 1], zeta: ['阻尼比 ζ', '—', 0.01],
    x0: ['初位移 x₀', 'm', 0.005], v0: ['初速度 v₀', 'm/s', 0.05], F: ['力幅 F₀', 'N', 0.1], Y: ['基础幅 Y', 'm', 0.001], r: ['频率比 r', '—', 0.01], duration: ['观察时长', 's', 1]
  };
  let p = { ...V.DEFAULTS }, sys, points, visualPeak = .1, comparison = null, t = 0, running = false, last = 0, chartType = 'time', frame = 0, toastTimer;
  const fmt = (n, digits = 4) => !Number.isFinite(n) ? (n === Infinity ? '∞' : '—') : Math.abs(n) > 9999 ? n.toExponential(2) : (Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n).toFixed(digits);
  function notify(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); }
  function setRunning(value) { running = value; last = 0; $('play').textContent = value ? 'Ⅱ 暂停实验' : t >= p.duration ? '↺ 再做一次' : '▶ 开始实验'; }
  function buildFields() {
    const keys = ['m', 'k', ...(p.mode === 'free' ? [] : ['zeta']), 'x0', 'v0', ...(p.mode === 'forced' ? ['F', 'r'] : p.mode === 'base' ? ['Y', 'r'] : []), 'duration'];
    $('fields').innerHTML = keys.map(key => {
      const [label, unit, step] = defs[key], [min, max] = V.LIMITS[key];
      return `<div class="field"><div class="field-head"><label for="n-${key}">${label}</label><div class="number-wrap"><input id="n-${key}" type="number" min="${min}" max="${max}" step="${step}" value="${p[key]}" inputmode="decimal"><span class="unit">${unit}</span></div></div><input id="s-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${p[key]}" aria-label="${label}滑块"><div class="range-ends"><span>${min}</span><span>${max}</span></div></div>`;
    }).join('');
    for (const key of keys) {
      $('s-' + key).addEventListener('input', e => { p[key] = Number(e.target.value); $('n-' + key).value = p[key]; rebuild(); });
      $('n-' + key).addEventListener('input', e => {
        const n = Number(e.target.value), [lo, hi] = V.LIMITS[key];
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= lo && n <= hi) {
          p[key] = n; $('s-' + key).value = n; rebuild();
        }
      });
      $('n-' + key).addEventListener('change', e => {
        const n = Number(e.target.value), [lo, hi] = V.LIMITS[key];
        if (e.target.value.trim() === '' || !Number.isFinite(n) || n < lo || n > hi) { e.target.value = p[key]; notify(`请输入 ${lo} 至 ${hi} 之间的数值`); return; }
        if (p[key] !== n) { p[key] = n; $('s-' + key).value = n; rebuild(); }
      });
    }
  }
  function rebuild() {
    setRunning(false); t = 0; sys = V.system(p); p = sys.p;
    // Aim for 100 samples per fastest oscillation; cap the display/export grid
    // at 24000 intervals. Direct readouts remain independent of this grid.
    points = sys.trajectory(Math.min(24000, Math.max(1800, Math.ceil(p.duration * Math.max(sys.d.wn, sys.d.omega) * 16))));
    visualPeak = points.reduce((peak, a) => Math.max(peak, Math.abs(a.x)), Math.max(.04, p.mode === 'base' ? p.Y * 1.6 : 0));
    $('scrub').max = p.duration; $('scrub').value = 0; $('endTime').textContent = p.duration + ' s';
    document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active', b.dataset.mode === p.mode); b.setAttribute('aria-pressed', b.dataset.mode === p.mode); });
    const data = info[p.mode]; $('experimentId').textContent = data[0]; $('experimentTitle').textContent = data[1]; $('equation').textContent = data[2]; $('taskTitle').textContent = data[3]; $('taskText').textContent = data[4];
    $('regime').textContent = sys.d.regime;
    const base = p.mode === 'base', forced = base || p.mode === 'forced';
    $('damperGroup').style.opacity = p.zeta === 0 ? '0.22' : '1';
    $('fourthLabel').innerHTML = base ? '相对位移 u <small>m</small>' : '机械能 E <small>J</small>';
    $('coordinateNote').textContent = base ? 'y = Y sin(ωt)；u = x − y。初始条件输入为绝对 x₀、v₀；内部自动转换 u̇₀ = v₀ − Yω。' : 'x 从静平衡位置量起，向右为正；v = ẋ，a = ẍ。激励从 t = 0 起按正弦变化。';
    const freqTab = document.querySelector('[data-chart="frequency"]'); freqTab.disabled = !forced;
    if (!forced && chartType === 'frequency') chartType = 'time';
    const d = sys.d, f = V.frequency(p);
    const metrics = [['固有圆频率 ωₙ', fmt(d.wn, 3), 'rad/s'], ['固有周期 Tₙ', fmt(d.Tn, 3), 's'], ['阻尼系数 c', fmt(d.c, 3), 'N·s/m'], ...(forced ? [['激励圆频率 ω', fmt(d.omega, 3), 'rad/s'], [base ? '谐波幅值比 X/Y' : '谐波幅值比 X/(F₀/k)', fmt(f.gain, 3), '']] : [['阻尼圆频率 ωd', d.wd === null ? '无' : fmt(d.wd, 3), 'rad/s'], ['临界阻尼 cc', fmt(d.cc, 3), 'N·s/m']])];
    $('metrics').innerHTML = metrics.map(([a, b, c]) => `<div><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');
    const common = '<p class="theory-math">ωₙ = √(k/m)，Tₙ = 2π/ωₙ，ζ = c/(2√(km))，r = ω/ωₙ。</p>';
    $('theory').innerHTML = common + (base ? '<p class="theory-math">X/Y = √[1 + (2ζr)²] / √[(1 − r²)² + (2ζr)²]<br>U/Y = r² / √[(1 − r²)² + (2ζr)²]</p><p>本实验的输入是基础位移，不是指定地震加速度。弹簧势能为 ½ku²，动能为 ½mẋ²；基础通过支座做功，机械能不守恒。</p>' : p.mode === 'forced' ? '<p class="theory-math">X = (F₀/k) / √[(1 − r²)² + (2ζr)²]<br>φ = atan2(2ζr, 1 − r²)，xₚ = X sin(ωt − φ)</p><p>ζ = 0 且 r = 1、F₀ ≠ 0 时无有界谐波特解；零初始条件下 x = F₀/(2k) [sin(ωₙt) − ωₙt cos(ωₙt)]。r = 0 时正弦输入恒为零，幅频图端点仅表示 r → 0⁺ 的极限。</p>' : '<p class="theory-math">ζ &lt; 1：ωd = ωₙ√(1 − ζ²)<br>x = e<sup>−ζωₙt</sup>[x₀ cos(ωdt) + (v₀ + ζωₙx₀) sin(ωdt)/ωd]</p><p>ζ = 1 时 x = [x₀ + (v₀ + ωₙx₀)t]e<sup>−ωₙt</sup>。ζ &gt; 1 时是两个衰减指数的组合。仅欠阻尼存在阻尼振动周期；非零初始振幅下，对数减量 δ = 2πζ/√(1 − ζ²)（0 &lt; ζ &lt; 1）。</p>');
    if (forced) $('theory').innerHTML += '<p>零激励幅值时，实际激励为零；共振点的传递函数仍为奇点，但零输入不会凭空产生共振增长。频响相位以输入正弦为基准，输出滞后为正。</p>';
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
    const showForce = p.mode === 'forced' && Math.abs(s.force) > 0.001;
    $('forceArrow').setAttribute('d', showForce ? `M${left + 100} 113h${Math.sign(s.force) * (12 + Math.abs(s.force) / Math.max(p.F, 0.001) * 55)}` : '');
    $('forceLabel').style.display = p.mode === 'forced' ? '' : 'none';
    $('baseLabel').textContent = p.mode === 'base' ? '移动支座 y(t)' : '固定支座';
    $('scaleNote').textContent = '运动示意 · 100 px ≈ ' + fmt(100 / scale, 3) + ' m（自动缩放）';
  }
  function render() {
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
      const names = { x: ['位移时程', 'x / m'], v: ['速度时程', 'v / (m/s)'], a: ['加速度时程', 'a / (m/s²)'] };
      $('chartTitle').textContent = names[quantity][0]; yLabel = names[quantity][1];
      series.push({ pts: point(points, 't', quantity), color: colors.teal, live: true });
      let legend = '<span>当前实验</span>';
      if (p.mode === 'base' && quantity === 'x') { series.push({ pts: point(points, 't', 'y'), color: colors.orange, dashed: true }); legend += '<span class="orange">基础 y</span>'; }
      if (comp) { series.push({ pts: point(comp.points.filter(a => a.t <= p.duration), 't', quantity), color: colors.blue, dashed: true }); legend += '<span class="blue">保留对照</span>'; }
      [ymin, ymax] = range(series.flatMap(s => s.pts.map(a => a[1]))); marker = [t, current[quantity]];
      $('legend').innerHTML = legend; $('chartNote').textContent = '淡线预览整个实验；深线为已播放部分。曲线和读数均包含初始条件引起的响应。' + (p.duration * Math.max(sys.d.wn, sys.d.omega) / (2 * Math.PI) > pw / 5 ? '波形密集，缩短观察时长可看清细节。' : '');
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
    } else {
      $('chartTitle').textContent = p.mode === 'base' ? '绝对位移传递率 X/Y' : '位移放大系数 X/(F₀/k)'; xLabel = 'r = ω/ωₙ'; yLabel = '幅值比'; xmin = 0; xmax = 4; ymin = 0;
      function freqSeries(params) { return Array.from({ length: 1001 }, (_, i) => { const r = i * .004; return [r, V.frequency(params, r).gain]; }); }
      const mainPts = freqSeries(p); series.push({ pts: mainPts, color: colors.teal });
      const comparable = comp && comp.p.mode === p.mode;
      if (comparable) series.push({ pts: freqSeries(comp.p), color: colors.blue, dashed: true });
      const finite = series.flatMap(s => s.pts.map(a => a[1])).filter(Number.isFinite);
      ymax = Math.min(30, Math.max(2, ...finite) * 1.1);
      const f = V.frequency(p); marker = Number.isFinite(f.gain) && f.gain <= ymax ? [p.r, f.gain] : null;
      if (finite.some(v => v > ymax) || !Number.isFinite(f.gain) || p.zeta === 0) clipNotice = ` 纵轴上限 ${fmt(ymax, 1)}，超界峰值未显示；无阻尼 r = 1 为奇点。`;
      $('legend').innerHTML = '<span>谐波特解幅值比</span>' + (comparable ? '<span class="blue">保留对照</span>' : '');
      $('chartNote').textContent = `当前比值 ${fmt(f.gain, 3)}，幅值 X = ${fmt(f.amplitude)} m，滞后 φ = ${f.phase === null ? '无定义' : fmt(f.phase * 180 / Math.PI, 1) + '°'}。` + (p.r === 0 ? 'r=0 时正弦输入恒为零，曲线端点为低频极限。' : '') + clipNotice;
      if (p.mode === 'base') series.push({ pts: [[0, 1], [4, 1]], color: '#aab6aa', dashed: true });
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
      for (let i = 0; i < Math.min(pts.length, limit); i++) { const [x, y] = pts[i]; if (!Number.isFinite(y) || (chartType === 'frequency' && y > ymax)) { open = false; continue; } const xx = xp(x), yy = yp(y); if (open) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); open = true; }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    for (const s of series) { if (s.live) { line(s.pts, s.color, false, .18); line(s.pts, s.color, false, 1, Math.floor(t / p.duration * (points.length - 1)) + 1); } else line(s.pts, s.color, s.dashed, .85); }
    if (chartType === 'time' || chartType === 'energy') { ctx.strokeStyle = '#7d9d8d'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(xp(t), box.t); ctx.lineTo(xp(t), h - box.b); ctx.stroke(); ctx.setLineDash([]); }
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
      resonance: { mode: 'forced', zeta: 0, r: 1, x0: 0, v0: 0, F: 4, duration: 12 }, beats: { mode: 'forced', zeta: 0, r: .9, x0: 0, v0: 0, F: 4, duration: 20 }, isolation: { mode: 'base', zeta: .1, r: 3, Y: .02, x0: 0, v0: 0, duration: 12 }
    };
    if (presets[e.target.value]) { p = { ...V.DEFAULTS, ...presets[e.target.value] }; buildFields(); rebuild(); notify('已载入课堂情景，点击开始实验'); }
    e.target.value = '';
  });
  $('exportCSV').addEventListener('click', () => {
    const keys = ['t', 'x', 'v', 'a', 'u', 'uv', 'ua', 'y', 'yv', 'force', 'kinetic', 'potential', 'energy', 'dampingPower', 'inputPower'];
    const metadata = '# Vibration Lab v1.0.0; SI units; ' + JSON.stringify(p) + '\r\n';
    const header = 't_s,x_m,v_m_s,a_m_s2,u_m,uv_m_s,ua_m_s2,y_m,yv_m_s,external_force_N,kinetic_J,potential_J,energy_J,damping_power_W,input_power_W';
    download('vibration-' + p.mode + '.csv', '\uFEFF' + metadata + header + '\r\n' + points.map(s => keys.map(k => s[k].toPrecision(12)).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  });
  $('exportConfig').addEventListener('click', () => download('vibration-parameters.json', JSON.stringify({ version: 1, parameters: p }, null, 2), 'application/json'));
  $('importConfig').addEventListener('click', () => $('configFile').click());
  $('configFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { if (file.size > 20000) throw Error('文件过大'); const data = JSON.parse(await file.text()); if (data.version !== 1 || !data.parameters || Object.keys(V.DEFAULTS).some(k => !(k in data.parameters))) throw Error('格式或版本不匹配'); const clean = Object.fromEntries(Object.keys(V.DEFAULTS).map(k => [k, data.parameters[k]])); p = V.validate(clean); buildFields(); rebuild(); notify('参数已载入'); }
    catch (err) { notify('无法载入参数：' + err.message); } finally { e.target.value = ''; }
  });
  for (const [button, dialog] of [['helpBtn', 'helpDialog'], ['aboutBtn', 'aboutDialog']]) $(button).addEventListener('click', () => { setRunning(false); $(dialog).showModal(); });
  document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setRunning(false); });
  window.addEventListener('resize', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); });
  function loop(now) { if (running) { if (last) t = Math.min(p.duration, t + Math.min((now - last) / 1000, .1) * Number($('speed').value)); last = now; if (t >= p.duration) setRunning(false); render(); } requestAnimationFrame(loop); }
  buildFields(); rebuild();
  const check = V.selfCheck(); $('checkStatus').textContent = check.pass ? '计算内核自检通过 · 3 项基准' : '计算自检异常，请停止使用';
  $('selfCheckDetail').textContent = `启动自检：${check.checks} 项解析基准，最大位移绝对误差 ${check.maxError.toExponential(2)} m。完整独立数值测试见源码包的验证报告。`;
  if (!check.pass) { $('play').disabled = true; notify('计算自检未通过，请检查文件完整性'); }
  requestAnimationFrame(loop);
})();
