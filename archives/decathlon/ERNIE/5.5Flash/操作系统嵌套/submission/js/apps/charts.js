// 图表工作台：跨层实时数据连接、分组柱状图 / 折线图、投送
import { h, clear, icon, iconSvg, clamp } from '../util.js';
import { basename as kbasename } from '../kernel.js';

const PALETTE = ['#6f8dff', '#ffb454', '#34d399', '#f472b6', '#22d3ee'];

function colNum(s) { return s.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1; }
function colStr(n) { return String.fromCharCode(65 + n); }
function parseRange(r) {
  const m = /^\s*([A-Za-z]+)(\d+)\s*:\s*([A-Za-z]+)(\d+)\s*$/.exec(r || '');
  if (!m) return null;
  return { c1: colNum(m[1].toUpperCase()), r1: parseInt(m[2], 10) - 1, c2: colNum(m[3].toUpperCase()), r2: parseInt(m[4], 10) - 1 };
}
function addr(c, r) { return colStr(c) + (r + 1); }

// 轻量公式求值（不依赖已打开的工作表窗口）
export function calcCells(cells) {
  const values = {}, errors = {};
  const visiting = new Set(), done = new Set();
  const evalCell = a => {
    if (done.has(a)) return values[a];
    if (visiting.has(a)) { errors[a] = '#CYCLE!'; return '#CYCLE!'; }
    const raw = cells[a];
    if (raw == null || raw === '') return '';
    visiting.add(a);
    let v;
    if (typeof raw === 'string' && raw.startsWith('=')) {
      try { v = evalFormula(raw.slice(1)); } catch (e) { v = e.message.startsWith('#') ? e.message : '#VALUE!'; }
    } else if (typeof raw === 'string' && raw.trim() !== '' && !isNaN(Number(raw))) v = Number(raw);
    else v = raw;
    visiting.delete(a); done.add(a);
    if (typeof v === 'string' && v.startsWith('#')) errors[a] = v;
    values[a] = v;
    return v;
  };
  const val = a => {
    const m = /^([A-Z]+)(\d+)$/.exec(a);
    if (!m) throw new Error('#REF!');
    return evalCell(a);
  };
  const range = (a, b) => {
    const p1 = /^([A-Z]+)(\d+)$/.exec(a.toUpperCase()), p2 = /^([A-Z]+)(\d+)$/.exec(b.toUpperCase());
    if (!p1 || !p2) throw new Error('#REF!');
    const c1 = colNum(p1[1]), c2 = colNum(p2[1]), r1 = +p1[2] - 1, r2 = +p2[2] - 1;
    const out = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(evalCell(addr(c, r)));
    return out;
  };
  function evalFormula(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ') { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; toks.push(['num', Number(src.slice(i, j))]); i = j; continue; }
      if (/[A-Za-z]/.test(c)) {
        let j = i; while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++;
        const w = src.slice(i, j).toUpperCase(); i = j;
        if (['SUM', 'MIN', 'MAX', 'AVERAGE'].includes(w)) toks.push(['func', w]);
        else if (/^[A-Z]+\d+$/.test(w)) toks.push(['ref', w]);
        else throw new Error('#NAME?');
        continue;
      }
      if ('+-*/():,&'.includes(c)) { toks.push(['op', c]); i++; continue; }
      throw new Error('#VALUE!');
    }
    let k = 0;
    const peek = () => toks[k];
    const eat = v => { if (toks[k] && (v == null || toks[k][1] === v)) return toks[k++]; return null; };
    const atom = () => {
      const t = toks[k];
      if (!t) throw new Error('#VALUE!');
      if (t[0] === 'num') { k++; return t[1]; }
      if (t[0] === 'ref') {
        k++;
        if (toks[k] && toks[k][1] === ':') { k++; const t2 = toks[k]; if (!t2 || t2[0] !== 'ref') throw new Error('#REF!'); k++; return range(t[1], t2[1]); }
        return val(t[1]);
      }
      if (t[0] === 'func') {
        k++; if (!eat('(')) throw new Error('#VALUE!');
        const args = [];
        if (!eat(')')) {
          do {
            const save = k;
            const t2 = toks[k];
            if (t2 && t2[0] === 'ref' && toks[k + 1] && toks[k + 1][1] === ':') {
              k += 2; const t3 = toks[k]; if (t3 && t3[0] === 'ref') { k++; args.push(range(t2[1], t3[1])); continue; }
              k = save;
            }
            args.push(expr());
          } while (eat(','));
          if (!eat(')')) throw new Error('#VALUE!');
        }
        const arr = args.flat().filter(v => typeof v === 'number');
        if (t[1] === 'SUM') return arr.reduce((a, b) => a + b, 0);
        if (t[1] === 'AVERAGE') { if (!arr.length) throw new Error('#DIV/0!'); return arr.reduce((a, b) => a + b, 0) / arr.length; }
        if (t[1] === 'MIN') return arr.length ? Math.min(...arr) : 0;
        return arr.length ? Math.max(...arr) : 0;
      }
      if (t[1] === '(') { k++; const v = expr(); if (!eat(')')) throw new Error('#VALUE!'); return v; }
      if (t[1] === '-') { k++; return -atom(); }
      throw new Error('#VALUE!');
    };
    const mul = () => { let v = atom(); while (toks[k] && ['*', '/'].includes(toks[k][1])) { const op = toks[k++][1]; const r = atom(); if (op === '/' && r === 0) throw new Error('#DIV/0!'); v = op === '*' ? v * r : v / r; } return v; };
    const add = () => { let v = mul(); while (toks[k] && ['+', '-', '&'].includes(toks[k][1])) { const op = toks[k++][1]; const r = mul(); v = op === '+' ? Number(v) + Number(r) : op === '-' ? Number(v) - Number(r) : String(v) + String(r); } return v; };
    const expr = () => add();
    const v = expr();
    if (k < toks.length) throw new Error('#VALUE!');
    if (Array.isArray(v)) throw new Error('#VALUE!');
    return v;
  }
  for (const a of Object.keys(cells)) evalCell(a);
  return { values, errors };
}

export class ChartsApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.chart = {
      sourceDocId: state.sourceDocId || '',
      sourceTitle: state.sourceTitle || '',
      range: state.range || 'A1:D4',
      labelCol: state.labelCol || 'A',
      series: state.series || ['D'],
      type: state.type || 'bar',
      connection: 'disconnected',
      data: state.data || { labels: [], series: [] },
      version: state.version || 0,
      title: state.title || '实时数据图表',
      transition: 1,
      prevData: null
    };
    this.hover = -1;
  }
  mount(body) {
    const wrap = h('div', { class: 'charts-wrap' });
    const tb = h('div', { class: 'toolbar', style: { gap: '5px', padding: '5px 8px' } });
    this.srcEl = h('select', { class: 'select', 'data-testid': 'chart-source', style: { maxWidth: '220px' } });
    tb.append(h('span', { class: 'muted', style: { fontSize: '11px' } }, '工作簿'), this.srcEl);
    this.rangeEl = h('input', { class: 'input', value: this.chart.range, style: { width: '80px' }, 'data-testid': 'chart-range' });
    tb.append(this.rangeEl);
    this.labelEl = h('select', { class: 'select', 'data-testid': 'chart-label-column', style: { width: '58px' } });
    for (let c = 0; c < 10; c++) this.labelEl.append(h('option', { value: colStr(c) }, colStr(c)));
    this.labelEl.value = this.chart.labelCol;
    tb.append(this.labelEl);
    this.seriesEl = h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' }, 'data-testid': 'chart-series' });
    tb.append(this.seriesEl);
    const connect = h('button', { class: 'btn primary small', 'data-testid': 'chart-connect' }, iconSvg('link'), '连接');
    connect.addEventListener('click', () => this.connect());
    const disc = h('button', { class: 'btn small', 'data-testid': 'chart-disconnect' }, iconSvg('unlink'), '断开');
    disc.addEventListener('click', () => this.disconnect());
    tb.append(connect, disc);
    const type = h('select', { class: 'select', 'data-testid': 'chart-type', style: { width: '76px' } });
    type.append(h('option', { value: 'bar' }, '柱状图'), h('option', { value: 'line' }, '折线图'));
    type.value = this.chart.type;
    type.addEventListener('change', () => { this.chart.type = type.value; this.render(); });
    tb.append(type);
    tb.append(h('div', { class: 'spacer' }));
    this.statePill = h('span', { class: 'pill' }, '未连接');
    tb.append(this.statePill);
    const proj = h('button', { class: 'btn small', 'data-testid': 'window-project' }, iconSvg('projection'), '投送');
    proj.addEventListener('click', e => { e.stopPropagation(); this.projectMenu(proj); });
    tb.append(proj);
    wrap.append(tb);
    const stage = h('div', { class: 'chart-stage', 'data-testid': 'chart-canvas-wrap' });
    this.canvas = h('canvas', {});
    stage.append(this.canvas);
    this.tip = h('div', { class: 'chart-tip' });
    stage.append(this.tip);
    this.emptyEl = h('div', { class: 'chart-empty' }, '尚未连接数据源');
    stage.append(this.emptyEl);
    const legend = h('div', { class: 'chart-legend' });
    this.legendEl = legend;
    wrap.append(stage, legend);
    body.append(wrap);
    this.ctx = this.canvas.getContext('2d');
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(stage);
    this.canvas.addEventListener('mousemove', e => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => { this.hover = -1; this.tip.style.display = 'none'; this.render(); });
    this.refreshSourceList();
    this.refreshSeries();
    this.resize();
    this.updateState();
    this.render();
  }
  refreshSourceList() {
    clear(this.srcEl);
    const docs = this.os.rootWorkbooks ? [...this.os.rootWorkbooks.values()] : [];
    if (!docs.length) this.srcEl.append(h('option', { value: '' }, '（没有打开的工作簿）'));
    for (const { doc } of docs) {
      const o = h('option', { value: doc.id }, `${doc.title} (${kbasename(doc.path || '')})`);
      if (doc.id === this.chart.sourceDocId) o.selected = true;
      this.srcEl.append(o);
    }
  }
  refreshSeries() {
    clear(this.seriesEl);
    const range = parseRange(this.chart.range);
    if (!range) { this.seriesEl.append(h('span', { class: 'faint', style: { fontSize: '10px' } }, '区域无效')); return; }
    const cols = [];
    for (let c = Math.min(range.c1, range.c2); c <= Math.max(range.c1, range.c2); c++) cols.push(colStr(c));
    for (const c of cols) {
      const lab = h('label', { style: { display: 'flex', gap: '3px', alignItems: 'center', fontSize: '10.5px', color: 'var(--muted)' } });
      const cb = h('input', { type: 'checkbox', value: c, 'data-testid': 'chart-series-col' });
      cb.checked = this.chart.series.includes(c);
      cb.addEventListener('change', () => {
        if (cb.checked) { if (!this.chart.series.includes(c)) this.chart.series.push(c); }
        else this.chart.series = this.chart.series.filter(x => x !== c);
        if (this.chart.connection === 'connected') this.refreshData();
      });
      lab.append(cb, c);
      this.seriesEl.append(lab);
    }
  }
  currentDoc() {
    const e = this.os.rootWorkbooks?.get(this.chart.sourceDocId);
    return e?.doc || null;
  }
  buildRangePayload(doc) {
    if (!doc) return null;
    const range = parseRange(this.chart.range);
    if (!range) return null;
    const cells = doc.data.cells || {};
    const sheetWin = [...this.os.windows.values()].find(w => w.appId === 'spreadsheet' && w.app?.doc?.id === doc.id);
    const values = sheetWin?.app?.values || calcCells(cells).values;
    const r1 = Math.min(range.r1, range.r2), r2 = Math.max(range.r1, range.r2);
    const c1 = Math.min(range.c1, range.c2), c2 = Math.max(range.c1, range.c2);
    const labelCol = colNum((this.chart.labelCol || 'A').toUpperCase());
    const labels = [];
    for (let r = r1 + 1; r <= r2; r++) labels.push(String(values[addr(labelCol, r)] ?? ''));
    const series = [];
    const cols = this.chart.series.length ? this.chart.series : [colStr(c2)];
    cols.forEach((c, i) => {
      const cn = colNum(c.toUpperCase());
      if (cn < c1 || cn > c2 || cn === labelCol) return;
      const header = String(values[addr(cn, r1)] ?? c);
      const vals = [];
      for (let r = r1 + 1; r <= r2; r++) {
        const v = values[addr(cn, r)];
        vals.push(typeof v === 'number' ? v : (v && !isNaN(Number(v)) ? Number(v) : 0));
      }
      series.push({ name: header, values: vals, color: PALETTE[i % PALETTE.length] });
    });
    return {
      version: (doc.version || 1), labels, series,
      title: `${doc.title} · ${this.chart.range}`,
      range: this.chart.range, labelCol: this.chart.labelCol, type: this.chart.type,
      sourceTitle: doc.title
    };
  }
  connect() {
    this.refreshSourceList();
    const doc = this.currentDoc();
    if (!doc) { this.os.toast(this.sys, '连接失败', '没有选择已打开的工作簿', 'err'); return; }
    const payload = this.buildRangePayload(doc);
    if (!payload) { this.os.toast(this.sys, '连接失败', '区域格式应为 A1:D4', 'err'); return; }
    this.chart.sourceTitle = doc.title;
    this.chart.connection = 'connected';
    this.os.chartSubs.set(this.win.id, { docId: doc.id, range: this.chart.range, labelCol: this.chart.labelCol, series: [...this.chart.series], version: payload.version });
    this.chart.data = { labels: payload.labels, series: payload.series };
    this.chart.version = payload.version;
    this.chart.prevData = null;
    this.chart.transition = 1;
    this.chart.title = payload.title;
    this.os.notify(this.sys, '数据连接已建立', `${doc.title} ${this.chart.range} · 版本 ${payload.version}`, 'ok', true);
    this.updateState(); this.render();
    if (this.os.saveSoon) this.os.saveSoon();
  }
  refreshData() {
    const doc = this.currentDoc();
    if (!doc) return;
    const payload = this.buildRangePayload(doc);
    if (payload) this.handleData(payload);
  }
  disconnect() {
    this.os.chartSubs.delete(this.win.id);
    this.chart.connection = 'disconnected';
    this.os.notify(this.sys, '数据连接已断开', '保留最后的图表与数据', 'info', true);
    this.updateState(); this.render();
  }
  onSourceClosed() {
    this.chart.connection = 'source-closed';
    this.os.notify(this.sys, '数据源已关闭', '保留已接收数据，重新打开后可重新连接', 'warn', true);
    this.updateState();
  }
  handleData(payload) {
    if (!payload) return;
    if (this.chart.connection !== 'connected') return;
    this.chart.prevData = this.chart.data;
    this.chart.data = { labels: payload.labels || [], series: payload.series || [] };
    this.chart.version = payload.version || this.chart.version;
    this.chart.title = payload.title || this.chart.title;
    this.chart.transition = 0;
    this.chart.connection = 'connected';
    this.os.charge(this.sys, 8 + Math.round(JSON.stringify(payload).length / 200));
    this.updateState(); this.render();
  }
  chartPid() {
    const p = this.sys.processes.find(p => (p.name === 'charts') && p.state !== 'finished');
    return p ? p.id : null;
  }
  tick(dt, sys) {
    if (!sys) return;
    if (this.chart.transition < 1) {
      this.chart.transition = Math.min(1, this.chart.transition + (dt || 16) / 420);
      this.render();
    }
  }
  updateState() {
    if (!this.statePill) return;
    const c = this.chart;
    const txt = c.connection === 'connected' ? `已连接 · v${c.version}` : c.connection === 'disconnected' ? '未连接' : c.connection === 'restored' ? '已恢复，待重新连接' : '数据源已关闭';
    this.statePill.textContent = txt;
    this.statePill.className = 'pill ' + (c.connection === 'connected' ? 'ok' : c.connection === 'disconnected' ? '' : 'warn');
    const pid = this.chartPid();
    if (!pid) this.statePill.textContent += ' · 图表进程未运行';
    this.emptyEl.style.display = (c.data.labels?.length || c.data.series?.length) ? 'none' : 'flex';
    this.emptyEl.textContent = c.connection === 'source-closed' ? '数据源已关闭 · 显示最后接收的数据' : c.connection === 'restored' ? '已恢复 · 请点击连接重新订阅' : '尚未连接数据源';
  }
  resize() {
    const wrap = this.canvas?.parentElement;
    if (!wrap) return;
    const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.render();
  }
  onMove(e) {
    if (!this.chart.data.labels?.length) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const w = this.canvas.width;
    const left = 54, right = w - 20;
    const n = this.chart.data.labels.length;
    const idx = clamp(Math.round((x - left) / ((right - left) / Math.max(1, n - 1 || 1))), 0, n - 1);
    if (idx !== this.hover) { this.hover = idx; this.render(); }
    this.tip.style.display = 'block';
    this.tip.style.left = Math.min(w - 120, x + 10) + 'px';
    this.tip.style.top = '12px';
    const vals = this.chart.data.series.map(s => `${s.name}: ${s.values[idx] ?? 0}`).join(' · ');
    this.tip.textContent = `${this.chart.data.labels[idx]} · ${vals}`;
  }

  drawChart(ctx, W, H, opts = {}) {
    const c = this.chart;
    if (W < 40 || H < 30) return;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1424'); bg.addColorStop(1, '#0a0f1b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const data = c.data || { labels: [], series: [] };
    if (!data.labels?.length || !data.series?.length) return;
    const left = 56, right = W - 22, top = 34, bottom = H - 42;
    const n = data.labels.length;
    const all = data.series.flatMap(s => s.values).filter(v => typeof v === 'number');
    let max = Math.max(1, ...all), min = Math.min(0, ...all);
    if (max === min) max = min + 1;
    const y = v => bottom - ((v - min) / (max - min)) * (bottom - top);
    const groupW = (right - left) / Math.max(1, n);
    ctx.font = '11px "Microsoft YaHei UI", sans-serif';
    ctx.textBaseline = 'middle';
    // 网格与 Y 轴
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const val = min + (max - min) * i / ticks;
      const yy = y(val);
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
      ctx.fillStyle = '#6d7897';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(val * 100) / 100, left - 8, yy);
    }
    // X 轴
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const cx = left + groupW * (i + 0.5);
      ctx.fillStyle = i === this.hover ? '#ffffff' : '#9aa6c4';
      const label = String(data.labels[i] ?? '');
      ctx.fillText(label.length > 6 ? label.slice(0, 6) + '…' : label, cx, bottom + 16);
    }
    const t = c.transition ?? 1;
    const prev = c.prevData;
    if (c.type === 'bar') {
      const series = data.series;
      const bw = Math.max(2, Math.min(26, (groupW - 12) / Math.max(1, series.length)));
      for (let si = 0; si < series.length; si++) {
        const s = series[si];
        const totalW = bw * series.length;
        for (let i = 0; i < n; i++) {
          const v = s.values[i] || 0;
          const pv = prev?.series?.[si]?.values?.[i] ?? 0;
          const vv = pv + (v - pv) * t;
          const x = left + groupW * (i + 0.5) - totalW / 2 + si * bw;
          const yy = y(vv);
          const grad = ctx.createLinearGradient(0, yy, 0, bottom);
          grad.addColorStop(0, s.color || PALETTE[si % PALETTE.length]);
          grad.addColorStop(1, alphaColor(s.color || PALETTE[si % PALETTE.length], 0.33));
          ctx.fillStyle = grad;
          const bx = x + 1, by = Math.min(yy, y(0)), bh = Math.max(1, Math.abs(y(0) - yy));
          roundRect(ctx, bx, by, bw - 2, bh, 3); ctx.fill();
          if (i === this.hover) {
            ctx.fillStyle = 'rgba(255,255,255,.9)';
            ctx.font = '10px "Microsoft YaHei UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(Math.round(v * 100) / 100), bx + bw / 2, by - 7);
          }
        }
      }
    } else {
      ctx.lineWidth = 2.2;
      for (let si = 0; si < data.series.length; si++) {
        const s = data.series[si];
        const color = s.color || PALETTE[si % PALETTE.length];
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const v = s.values[i] || 0;
          const pv = prev?.series?.[si]?.values?.[i] ?? v;
          const vv = pv + (v - pv) * t;
          const x = left + groupW * (i + 0.5);
          const yy = y(vv);
          if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
        for (let i = 0; i < n; i++) {
          const v = s.values[i] || 0;
          const pv = prev?.series?.[si]?.values?.[i] ?? v;
          const vv = pv + (v - pv) * t;
          const x = left + groupW * (i + 0.5), yy = y(vv);
          ctx.beginPath(); ctx.arc(x, yy, i === this.hover ? 5 : 3.4, 0, Math.PI * 2); ctx.fill();
          if (i === this.hover) {
            ctx.fillStyle = '#fff'; ctx.font = '10px "Microsoft YaHei UI", sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(String(Math.round(v * 100) / 100), x, yy - 10);
          }
        }
      }
    }
    // 标题
    ctx.fillStyle = '#e8eefc';
    ctx.font = '600 13px "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(c.title || '实时数据图表', left, 18);
    ctx.fillStyle = '#6d7897';
    ctx.font = '10px "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`版本 ${c.version} · ${c.range || ''}`, right, 18);
    // 图例
    let lx = left;
    ctx.textAlign = 'left';
    ctx.font = '10.5px "Microsoft YaHei UI", sans-serif';
    for (let si = 0; si < data.series.length; si++) {
      const s = data.series[si];
      ctx.fillStyle = s.color || PALETTE[si % PALETTE.length];
      ctx.fillRect(lx, H - 18, 9, 9);
      ctx.fillStyle = '#9aa6c4';
      const name = String(s.name || '系列');
      ctx.fillText(name.length > 8 ? name.slice(0, 8) : name, lx + 13, H - 13);
      lx += 26 + ctx.measureText(name).width;
    }
  }
  render() {
    if (!this.ctx) return;
    this.drawChart(this.ctx, this.canvas.width, this.canvas.height, { interactive: true });
    this.updateLegend();
  }
  updateLegend() {
    if (!this.legendEl) return;
    clear(this.legendEl);
    for (const s of this.chart.data.series || []) {
      const lg = h('span', { class: 'lg' }, h('i', { style: { background: s.color || PALETTE[0] } }), h('span', {}, s.name || '系列'));
      this.legendEl.append(lg);
    }
  }
  reset() {
    this.os.chartSubs.delete(this.win.id);
    this.chart.connection = 'disconnected';
    this.chart.data = { labels: [], series: [] };
    this.chart.prevData = null;
    this.chart.version = 0;
    this.updateState();
    this.render();
  }
  projectMenu(anchor) {
    const ancestors = [];
    let p = this.sys.parent;
    while (p) { ancestors.unshift(p); p = p.parent; }
    if (!ancestors.length) { this.os.toast(this.sys, '投送', '当前系统没有祖先桌面', 'warn'); return; }
    const r = anchor.getBoundingClientRect();
    this.win.desktop.showContextMenu(r.left, r.bottom + 4, ancestors.map(a => ({ icon: 'projection', label: `投送到 ${a.id}`, testid: 'project-target', targetSystemId: a.id, act: () => this.os.project(this.win, a) })));
  }
  applyProjectionAction(action) {
    if (action?.type === 'chart-type') {
      this.chart.type = this.chart.type === 'bar' ? 'line' : 'bar';
      this.render();
    }
  }
  inspect(win) {
    return {
      windowId: win.id, systemId: this.sys.id,
      sourceTitle: this.chart.sourceTitle || '',
      range: this.chart.range,
      chartType: this.chart.type,
      connectionState: this.chart.connection
    };
  }
  serialize() { return { ...this.chart }; }
  restore(st) {
    if (!st) return;
    Object.assign(this.chart, st);
    this.chart.connection = st.connection === 'connected' ? 'restored' : (st.connection || 'disconnected');
    this.os.chartSubs.delete(this.win.id);
    if (this.srcEl) this.refreshSourceList();
    if (this.rangeEl) this.rangeEl.value = this.chart.range;
    if (this.labelEl) this.labelEl.value = this.chart.labelCol;
    if (this.seriesEl) this.refreshSeries();
    this.updateState();
    this.render();
  }
  beforeClose() { this.os.chartSubs.delete(this.win.id); return true; }
  dispose() { this.ro?.disconnect(); this.os.chartSubs.delete(this.win.id); }
}

function alphaColor(hex, a) {
  let h = String(hex || '#6f8dff').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  if (h.length !== 6) return 'rgba(111,141,255,' + a + ')';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}