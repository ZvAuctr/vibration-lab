(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const palette = ['#287f7d', '#ad651e', '#505da4', '#9c4270', '#647726', '#914133', '#223b40'];
  let model, time = 0, running = false, last = 0, frame = 0, chartRows = [], chartLabels = [];
  let fields = {}, trajectory;
  let chartState;
  const futureLayer = document.createElement('canvas');
  const pastLayer = document.createElement('canvas');

  function options(select, values, previous = select.value) {
    select.replaceChildren(...values.map(([value, label]) => new Option(label, value)));
    if (values.some(([value]) => String(value) === previous)) select.value = previous;
  }
  function buildFields(values) {
    const count = values.masses.length;
    const blocks = values.masses.map((_, i) => [i, '质量块 ' + (i + 1)]);
    const container = $('multiFields');
    const openGroups = new Set(Array.from(container.querySelectorAll('details[open]'), group => group.dataset.group));
    container.replaceChildren();
    fields = {};
    function group(name) {
      const details = document.createElement('details');
      details.className = 'mdof-parameter-group';
      details.dataset.group = name;
      details.open = openGroups.has(name);
      const summary = document.createElement('summary');
      summary.textContent = name;
      details.append(summary);
      container.append(details);
      return details;
    }
    function number(parent, key, label, unit, value, [min, max], step) {
      const wrapper = document.createElement('div');
      wrapper.className = 'field';
      wrapper.innerHTML = `<div class="field-head"><label for="multi-n-${key}">${label}</label>
        <div class="number-wrap"><input id="multi-n-${key}" type="number" min="${min}" max="${max}" step="any" inputmode="decimal" required><span class="unit">${unit}</span></div></div>
        <input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}滑块">
        <div class="range-ends"><span>${min}</span><span>${max}</span></div>`;
      const [input, slider] = wrapper.querySelectorAll('input');
      let committed = value;
      const setValue = next => { committed = next; input.value = next; slider.value = next; };
      setValue(value);
      slider.oninput = () => { input.value = slider.value; };
      input.oninput = () => { if (input.validity.valid) slider.value = input.value; };
      input.onkeydown = event => { if (event.key === 'Enter') input.blur(); };
      const commit = () => {
        const entered = input.valueAsNumber;
        const next = Number.isFinite(entered) ? Math.max(Number(input.min), Math.min(max, entered)) : committed;
        const changed = next !== committed;
        setValue(next);
        if (changed) rebuild();
      };
      input.onblur = input.onchange = slider.onchange = commit;
      const setMinimum = minimum => {
        input.min = slider.min = minimum;
        wrapper.querySelector('.range-ends span').textContent = minimum;
        slider.value = committed;
      };
      fields[key] = { input, setValue, setMinimum };
      parent.append(wrapper);
    }
    const limits = MDOF.LIMITS;
    for (const [name, prefix, unit, entries, range, step] of [
      ['质量', 'm', 'kg', values.masses, limits.mass, .1],
      ['弹簧刚度', 'k', 'N/m', values.springs, limits.spring, 1],
      ['初位移', 'x', 'm', values.displacements, limits.displacement, .005],
      ['初速度', 'v', 'm/s', values.velocities, limits.velocity, .05]
    ]) {
      const parent = group(name);
      entries.forEach((value, i) => {
        const spring = prefix === 'k';
        const internal = spring && i > 0 && i < count;
        const label = spring ? i === 0 ? '左端弹簧' : i === count ? '右端弹簧' : '弹簧 ' + i + '–' + (i + 1) : name + ' ' + (i + 1);
        number(parent, prefix + i, label, unit, value, internal ? [1, range[1]] : range, step);
      });
    }
    for (const [key, label, unit, step] of [
      ['zeta', '模态阻尼比 ζ', '—', .01], ['force', '力幅', 'N', .1],
      ['hz', '激励频率', 'Hz', .001], ['duration', '观察时长', 's', .1]
    ]) {
      number(container, key, label, unit, values[key], limits[key], step);
    }
    options($('multiDrive'),blocks,String(values.drive));
    options($('multiRelease'),blocks);
    options($('multiMeasure'),[['all','全部质量块'],...blocks]);
    options($('multiView'),[['response','实际响应'],...blocks.map(([i])=>[i,'第 '+(i+1)+' 阶振型'])]);
  }

  function stop() {
    cancelAnimationFrame(frame);
    running = false;
    last = 0;
    $('multiPlay').textContent = '开始';
  }
  function setLab(multi) {
    if (multi && !model) preset('');
    if (multi) document.dispatchEvent(new Event('pause-single-lab'));
    stop();
    $('singleWorkspace').hidden = multi;
    $('multiWorkspace').hidden = !multi;
    $('singleLab').setAttribute('aria-pressed', !multi);
    $('multiLab').setAttribute('aria-pressed', multi);
    if (multi) { cacheChart(); drawMotion(); }
  }
  function preset(name) {
    const count = Number($('multiCount').value);
    const values = { ...MDOF.DEFAULTS, masses: Array(count).fill(1), springs: Array(count+1).fill(100),
      displacements: Array(count).fill(0), velocities: Array(count).fill(0) };
    if (!name || name === 'free') {
      const released = name === 'free' ? Number($('multiRelease').value) : 0;
      values.displacements[released] = MDOF.DEFAULTS.x1;
    }
    if (name === 'first' || name === 'second') {
      const shape = MDOF.system(values).modes[name === 'first' ? 0 : 1].shape;
      const max = Math.max(...shape.map(Math.abs));
      values.displacements = shape.map(value => 0.08 * value / max);
    }
    if (name === 'forced' || name === 'anti') {
      values.force = 5;
      values.zeta = name === 'forced' ? 0.03 : 0;
      if (name === 'anti') values.hz = MDOF.system(values).antiHz;
    }
    buildFields(values);
    if (!name) $('multiRelease').value = '0';
    $('multiView').value = 'response';
    $('multiChartType').value = name === 'anti' ? 'frequency' : 'time';
    rebuild();
  }
  function rebuild() {
    stop();
    const values = Object.fromEntries(Object.entries(fields).map(([key, { input }]) => [key, input.valueAsNumber]));
    const count = Number($('multiCount').value);
    const array = (prefix, length) => Array.from({length}, (_, i) => values[prefix+i]);
    const springs = array('k', count + 1);
    // Round the bound up to avoid a sum just below 1 from floating-point subtraction.
    const endMinimum = opposite => Math.ceil(Math.max(0, 1 - opposite) * 1e6) / 1e6;
    fields.k0.setMinimum(Math.min(springs[0], endMinimum(springs[count])));
    fields['k' + count].setMinimum(Math.min(springs[count], endMinimum(springs[0])));
    model = MDOF.system({ ...values, masses: array('m',count), springs,
      displacements: array('x',count), velocities: array('v',count), drive: Number($('multiDrive').value) });
    time = 0;
    trajectory = null;
    $('multiSeek').max = model.p.duration;
    updateModeFacts();
    prepareChart();
    drawMotion();
  }
  function updateModeFacts() {
    const { zeta } = model.p;
    const dampingFactor = zeta < 1 ? Math.sqrt((1 - zeta) * (1 + zeta)) : null;
    const format = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 4 });
    const rows = [], shapes = [];
    model.modes.forEach((mode, i) => {
      const row = document.createElement('tr');
      const order = document.createElement('th');
      order.scope = 'row';
      order.textContent = i + 1;
      row.append(order);
      for (const value of [mode.hz, 1 / mode.hz, dampingFactor === null ? null : mode.hz * dampingFactor]) {
        row.insertCell().textContent = value === null ? '—' : format.format(value);
      }
      rows.push(row);
      const scale = Math.max(...mode.shape.map(Math.abs));
      const shape = document.createElement('li');
      shape.textContent = `第 ${i + 1} 阶 [${mode.shape.map(x => (x / scale).toFixed(3)).join(', ')}]`;
      shapes.push(shape);
    });
    $('multiModeMetrics').replaceChildren(...rows);
    $('multiModes').replaceChildren(...shapes);
    const regime = zeta === 0 ? '无阻尼' : zeta < 1 ? '欠阻尼' : zeta === 1 ? '临界阻尼' : '过阻尼';
    $('multiDamping').textContent = `模态阻尼比 ζ = ${zeta} · ${regime}`;
  }
  function canvas(id, height) {
    const element = $(id), width = element.clientWidth;
    if (!width) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    return { context: resizeCanvas(element, width, height, ratio), width, height, ratio };
  }
  function resizeCanvas(element, width, height, ratio) {
    const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
    if (element.width !== pixelWidth) element.width = pixelWidth;
    if (element.height !== pixelHeight) element.height = pixelHeight;
    const ctx = element.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return ctx;
  }
  function drawMotion() {
    const surface = canvas('multiMotion', 145);
    if (!surface) return;
    const { context: ctx, width } = surface;
    const state = model.at(time);
    const selection = $('multiView').value;
    let offsets = state.x;
    let scale = Math.max(0.1, ...offsets.map(Math.abs));
    if (selection !== 'response') {
      const mode = model.modes[Number(selection)];
      offsets = mode.shape.map(value => value * Math.cos(mode.w * time));
      scale = Math.max(...mode.shape.map(Math.abs));
    }
    const count = offsets.length;
    const spacing = width / (count + 1);
    const centers = offsets.map((value, i) => spacing * (i + 1 + 0.22 * value / scale));
    const half = Math.min(25, spacing * .23), y = 69;
    function spring(left, right) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      for (let i = 1; i < 12; i++) ctx.lineTo(left + (right-left)*i/12, y + (i % 2 ? -7 : 7));
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#45605e';
    ctx.lineWidth = 2;
    model.p.springs.forEach((value,i) => {
      if (value > 0) spring(i === 0 ? 14 : centers[i-1]+half, i === count ? width-14 : centers[i]-half);
    });
    ctx.fillStyle = '#45605e';
    ctx.fillRect(10, y-24, 4, 48);
    ctx.fillRect(width-14, y-24, 4, 48);
    centers.forEach((x,i) => {
      ctx.fillStyle = palette[i];
      ctx.fillRect(x-half, y-23, half*2, 46);
      ctx.fillStyle = 'white';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i+1), x, y+4);
    });
    drawChart(state);
    $('multiSeek').value = time;
    $('multiTime').textContent = time.toFixed(2) + ' s';
    $('multiReadout').textContent = selection === 'response'
      ? `x₁ = ${state.x.map((value,i)=>'x'+(i+1)+' = '+value.toPrecision(4)+' m').join('　')}　 E = ${state.energy.toPrecision(4)} J`
      : '振型示意 · 按该阶固有频率播放';
  }
  function prepareChart() {
    const type = $('multiChartType').value;
    const frequency = type === 'frequency';
    const modal = type === 'modal';
    const selected = $('multiMeasure').value;
    const blocks = selected === 'all' ? model.p.masses.map((_,i)=>i) : [Number(selected)];
    const measured = blocks[0];
    if (modal && selected === 'all') $('multiMeasure').value = '0';
    const highest = Math.max(model.modes.at(-1).hz, model.p.force ? model.p.hz : 0);
    let limited = false;
    if (frequency) {
      const requested = Number($('multiFreqLimit').value);
      const end = requested > 0 ? Math.min(10000, requested) : 1.5 * Math.max(model.modes.at(-1).hz, model.p.force ? model.p.hz : 0);
      const samples = Array.from({length:1001}, (_,i)=>i*end/1000);
      for (const mode of model.modes) if (mode.hz <= end) samples.push(mode.hz);
      if (model.antiHz !== null && model.antiHz <= end) samples.push(model.antiHz);
      chartRows = [...new Set(samples)].sort((a,b)=>a-b).map(hz => {
        const response = model.frequency(hz);
        return [hz,...blocks.map(i=>response[i])];
      });
    } else {
      const requested = Math.max(800, Math.ceil(model.p.duration * 16 * highest));
      limited = requested > 16000;
      if (!trajectory) trajectory = model.trajectory(Math.min(16000, requested));
      chartRows = trajectory.map(point => modal
        ? [point.t, ...point.contributions.map(values=>values[measured]), point.x[measured]]
        : [point.t, ...blocks.map(i=>point.x[i])]);
    }
    chartLabels = modal ? [...model.modes.map((_,i)=>'第 '+(i+1)+' 阶'), '合计']
      : blocks.map(i=>'质量块 '+(i+1));
    $('multiLegend').replaceChildren(...chartLabels.map((label,i)=>{
      const item = document.createElement('span');
      item.style.color = palette[i];
      item.textContent = label;
      return item;
    }));
    $('multiFreqRange').hidden = !frequency;
    $('multiMeasure').querySelector('[value=all]').disabled = modal;
    $('multiChartTitle').textContent = frequency ? '位移幅频响应' : modal ? '模态叠加' : '位移时程';
    const anti = model.antiHz === null ? '' : ' · 无阻尼同点反共振 '+model.antiHz.toFixed(3)+' Hz';
    $('multiChartNote').textContent = frequency
      ? '单位力稳态频响 · 共用 0 dB 参考 · CSV 为 m/N'+anti
      : (modal ? '质量块 '+(measured+1)+' 的各阶位移贡献及其合计。' : '位移全响应包含初始条件。')
        + (limited ? ' 图表采样达到上限，缩短观察时长可查看高频细节。' : '');
    cacheChart();
    drawChart(model.at(time));
  }
  function cacheChart() {
    const surface = canvas('multiChart', 250);
    chartState = null;
    if (!surface || !chartRows.length) return;
    const { width, height, ratio } = surface;
    const type = $('multiChartType').value;
    const frequency = type === 'frequency';
    const ctx = resizeCanvas(futureLayer, width, height, ratio);
    const maxX = chartRows.at(-1)[0];
    let maxY = 0;
    for (const row of chartRows) for (const value of row.slice(1)) {
      if (Number.isFinite(value)) maxY = Math.max(maxY, Math.abs(value));
    }
    maxY = maxY * 1.08 || 1;
    const reference = maxY / 1.08;
    if (frequency) maxY = 0;
    const minY = frequency ? -100 : -maxY;
    const x = value => 64 + Math.min(1, value / maxX) * (width - 80);
    const y = value => 28 + (maxY - value) / (maxY - minY) * (height - 63);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#45605e';
    ctx.fillText(frequency ? '相对幅值 / dB' : '位移 / m', 7, 14);
    for (let i = 0; i <= 4; i++) {
      const vertical = minY + (maxY - minY) * i / 4, horizontal = maxX * i / 4;
      ctx.strokeStyle = '#dbe5df';
      ctx.beginPath();
      ctx.moveTo(x(0), y(vertical));
      ctx.lineTo(x(maxX), y(vertical));
      ctx.moveTo(x(horizontal), y(minY));
      ctx.lineTo(x(horizontal), y(maxY));
      ctx.stroke();
      ctx.fillText(vertical.toPrecision(3), 5, y(vertical) + 4);
      ctx.fillText(horizontal.toPrecision(3), x(horizontal) - 10, height - 18);
    }
    ctx.fillText(frequency ? 'Hz' : 's', width - 19, height - 3);
    const lines = frequency ? ctx : resizeCanvas(pastLayer, width, height, ratio);
    lines.lineWidth = 1.7;
    chartLabels.forEach((_, i) => {
      lines.strokeStyle = palette[i];
      lines.beginPath();
      let connected = false;
      for (const row of chartRows) {
        let value = row[i + 1];
        if (!Number.isFinite(value)) { connected = false; continue; }
        if (frequency) value = Math.max(minY, 20 * Math.log10(value / reference));
        if (connected) lines.lineTo(x(row[0]), y(value));
        else lines.moveTo(x(row[0]), y(value));
        connected = true;
      }
      lines.stroke();
    });
    if (!frequency) {
      ctx.globalAlpha = .2;
      ctx.drawImage(pastLayer, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    chartState = { ...surface, type, x, y, top: y(maxY), bottom: y(minY) };
  }
  function drawChart(state) {
    if (!chartState) return;
    const { context: ctx, width, height, type, x, y, top, bottom } = chartState;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(futureLayer, 0, 0, width, height);
    if (type === 'frequency') return;
    const cursorX = x(time);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cursorX, height);
    ctx.clip();
    ctx.drawImage(pastLayer, 0, 0, width, height);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#7d9d8d';
    ctx.moveTo(cursorX, top);
    ctx.lineTo(cursorX, bottom);
    ctx.stroke();
    ctx.restore();

    const selection = $('multiMeasure').value;
    const index = Number(selection);
    const values = type === 'modal' ? [...state.contributions.map(mode => mode[index]), state.x[index]]
      : selection === 'all' ? state.x : [state.x[index]];
    values.forEach((value, i) => {
      const position = Math.max(top, Math.min(bottom, y(value)));
      ctx.beginPath();
      ctx.arc(cursorX, position, 4, 0, 2 * Math.PI);
      ctx.fillStyle = palette[i];
      ctx.fill();
      ctx.strokeStyle = '#fdfcf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.lineWidth = 1;
  }
  $('singleLab').onclick = () => setLab(false);
  $('multiLab').onclick = () => setLab(true);
  $('multiPreset').onchange = event => preset(event.target.value);
  function resetParameters() {
    $('multiPreset').value = '';
    preset('');
  }
  $('multiResetParams').onclick = resetParameters;
  $('multiDrive').onchange = rebuild;
  $('multiMeasure').onchange = prepareChart;
  $('multiFreqLimit').onchange = event => {
    const input = event.target;
    if (Number.isFinite(input.valueAsNumber)) {
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), input.valueAsNumber));
    }
    prepareChart();
  };
  $('multiCount').onchange = () => {
    const two = Number($('multiCount').value) === 2;
    $('multiPreset').querySelector('[value="anti"]').disabled = !two;
    resetParameters();
  };
  $('multiRelease').onchange = () => {
    for (const [key, field] of Object.entries(fields)) {
      if (key.startsWith('x')) field.setValue(Number(key.slice(1)) === Number($('multiRelease').value) ? MDOF.DEFAULTS.x1 : 0);
      if (key.startsWith('v') || key === 'force') field.setValue(0);
    }
    $('multiPreset').value = 'free';
    $('multiView').value = 'response';
    $('multiChartType').value = 'modal';
    rebuild();
  };
  $('multiChartType').onchange = prepareChart;
  $('multiView').onchange = drawMotion;
  $('multiReset').onclick = () => { stop(); time = 0; drawMotion(); };
  $('multiSeek').oninput = event => { stop(); time = Number(event.target.value); drawMotion(); };
  $('multiPlay').onclick = () => {
    if (running) return stop();
    if (time >= model.p.duration) time = 0;
    running = true;
    $('multiPlay').textContent = '暂停';
    frame = requestAnimationFrame(tick);
  };
  function tick(now) {
    if (!running) return;
    if (last) time = Math.min(model.p.duration, time + (now - last) / 1000);
    last = now;
    drawMotion();
    if (time >= model.p.duration) stop();
    else frame = requestAnimationFrame(tick);
  }
  $('multiExport').onclick = () => {
    const frequency = $('multiChartType').value === 'frequency';
    const header = [frequency ? 'frequency_Hz' : 'time_s', ...chartLabels.map(label=>label+(frequency?' (m/N)':' (m)'))].join(',');
    const csv = [header, ...chartRows.map(row => row.map(value => Number.isFinite(value) ? value : '').join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF',csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = frequency ? 'mdof-frf.csv' : 'mdof-displacement.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener('resize', () => {
    if (!$('multiWorkspace').hidden) { cacheChart(); drawMotion(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();
