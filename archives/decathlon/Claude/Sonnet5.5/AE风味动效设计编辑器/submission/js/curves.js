/* curves.js — 曲线编辑器：值曲线 / 速度曲线（表达式属性显示最终求值曲线），关键帧与贝塞尔手柄可拖动 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, Model = AE.Model, App = AE.App, UI = AE.UI, Actions = AE.Actions;
  const h = UI.h;
  const Cv = AE.Curves = {};
  let host, cv, ctx, W = 400, H = 240, mode = 'value', view = { t0: 0, t1: 10, v0: 0, v1: 100 }, hits = [], curves = [], drag = null, hover = null, info;
  const PAD = { l: 52, r: 10, t: 20, b: 20 };
  const PAL = ['#ff6a5a', '#6fcf7f', '#5aa0ff', '#ffb066', '#c07bff', '#4fd8d0', '#ffd95a', '#ff7bb8'];
  const AXC = ['#ff6a5a', '#6fcf7f', '#5aa0ff'];

  Cv.init = (el) => {
    host = el; host.innerHTML = '';
    const bar = h('div', { class: 'cv-bar' },
      h('button', { class: 'btn sm on', id: 'cvModeV', text: '值曲线', onclick: () => setMode('value') }), h('button', { class: 'btn sm', id: 'cvModeS', text: '速度曲线', onclick: () => setMode('speed') }), h('div', { class: 'sep' }),
      h('button', { class: 'btn sm', text: '适合', title: '适合显示全部曲线', onclick: () => { fit(true); } }),
      h('button', { class: 'btn sm', text: '缓入缓出', title: 'F9', onclick: () => Actions.easyEase('both') }), h('button', { class: 'btn sm', text: '线性', onclick: () => Actions.setInterp('both', 'linear') }), h('button', { class: 'btn sm', text: '贝塞尔', onclick: () => Actions.setInterp('both', 'bezier') }), h('button', { class: 'btn sm', text: '定格', onclick: () => Actions.setInterp('both', 'hold') }),
      h('div', { style: { flex: 1 } }), info = h('span', { class: 'muted', style: { fontSize: '11px' } }));
    cv = h('canvas'); const wrap = h('div', { class: 'curve-wrap' }, cv); host.append(bar, wrap); ctx = cv.getContext('2d');
    new ResizeObserver(() => { resize(wrap); Cv.draw(); }).observe(wrap);
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('contextmenu', onMenu);
    cv.addEventListener('wheel', onWheel, { passive: false });
    for (const ev of ['select', 'selprop', 'keysel', 'time', 'struct']) App.on(ev, () => { if (host.offsetParent !== null) Cv.draw(); });
    App.on('change', () => { if (host.offsetParent !== null) Cv.draw(); });
    App.on('comp', () => { view.t0 = 0; view.t1 = App.comp.dur; });
    view.t1 = App.comp.dur;
  };
  const setMode = m => { mode = m; document.getElementById('cvModeV').classList.toggle('on', m === 'value'); document.getElementById('cvModeS').classList.toggle('on', m === 'speed'); fit(); Cv.draw(); };
  const resize = (wrap) => { const r = wrap.getBoundingClientRect(); W = Math.max(100, r.width); H = Math.max(80, r.height); const dp = Math.min(window.devicePixelRatio || 1, 2); cv.width = W * dp; cv.height = H * dp; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dp, 0, 0, dp, 0, 0); };
  Cv.refresh = () => { const wrap = host.querySelector('.curve-wrap'); resize(wrap); fit(); Cv.draw(); };
  const X = t => PAD.l + (t - view.t0) / (view.t1 - view.t0) * (W - PAD.l - PAD.r), Y = v => PAD.t + (1 - (v - view.v0) / (view.v1 - view.v0)) * (H - PAD.t - PAD.b);
  const tOf = x => view.t0 + (x - PAD.l) / (W - PAD.l - PAD.r) * (view.t1 - view.t0), vOf = y => view.v0 + (1 - (y - PAD.t) / (H - PAD.t - PAD.b)) * (view.v1 - view.v0);

  function gather() {
    const out = []; const sel = App.sel.props.length ? App.sel.props.map(s => ({ L: App.layer(s.layer), key: s.key })).filter(s => s.L) : [];
    let list = sel; if (!list.length) { for (const L of App.selLayers()) for (const k of Model.allPropKeys(L)) { const p = L.props[k]; if (p && (Model.isAnimated(p) || Model.hasExpr(p))) list.push({ L, key: k }); } }
    let pi = 0;
    for (const { L, key } of list) {
      const p = L.props[key]; if (!p) continue; const infoP = Model.propInfo(L, key); if (infoP.type === 'path' || infoP.type === 'color' && false) continue; if (!Model.isAnimated(p) && !Model.hasExpr(p)) continue;
      const v0 = App.ev.value(App.comp, L, key, App.time); const dim = Array.isArray(v0) ? (infoP.type === 'color' ? 3 : Math.min(v0.length, infoP.dim || v0.length)) : 1;
      if (mode === 'speed') out.push({ L, key, c: -1, color: PAL[pi % PAL.length], p, info: infoP, label: `${L.name}.${infoP.label || key}`, dim });
      else for (let c = 0; c < dim; c++) out.push({ L, key, c, color: dim > 1 ? (infoP.type === 'color' ? ['#ff6a5a', '#6fcf7f', '#5aa0ff'][c] : AXC[c % 3]) : PAL[pi % PAL.length], p, info: infoP, label: `${L.name}.${infoP.label || key}` + (dim > 1 ? '.' + 'XYZW'[c] : ''), dim });
      pi++;
    }
    return out;
  }
  const evalAt = (cu, t) => { const v = App.ev.value(App.comp, cu.L, cu.key, t); return Array.isArray(v) ? v : [v]; };
  const speedAt = (cu, t) => { const dt = 1 / (App.fps() * 6); const a = evalAt(cu, Math.max(0, t - dt)), b = evalAt(cu, t + dt); let s = 0; for (let i = 0; i < Math.min(cu.dim, a.length); i++) s += ((b[i] - a[i])) ** 2; return Math.sqrt(s) / (2 * dt); };
  function fit(full) {
    curves = gather(); if (full) { view.t0 = 0; view.t1 = App.comp.dur; }
    let lo = Infinity, hi = -Infinity; const N = 60;
    for (const cu of curves) for (let i = 0; i <= N; i++) { const t = view.t0 + (view.t1 - view.t0) * i / N; const v = mode === 'speed' ? speedAt(cu, t) : evalAt(cu, t)[cu.c]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo === Infinity) { lo = 0; hi = 100; } if (mode === 'speed') lo = Math.min(lo, 0); if (hi - lo < 1e-6) { hi = lo + 1; } const pad = (hi - lo) * 0.12; view.v0 = lo - pad; view.v1 = hi + pad;
  }
  Cv.draw = () => {
    if (!ctx) return; curves = gather(); hits = []; ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#101217'; ctx.fillRect(0, 0, W, H);
    // 网格
    ctx.font = '10px Consolas, monospace'; ctx.lineWidth = 1;
    const nice = (span, n) => { const raw = span / n; const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
    const vs = nice(view.v1 - view.v0, Math.max(3, (H - PAD.t - PAD.b) / 40)); ctx.strokeStyle = '#1f2430'; ctx.fillStyle = '#6b7285';
    for (let v = Math.ceil(view.v0 / vs) * vs; v <= view.v1; v += vs) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke(); ctx.fillText(UI.fmt(v, vs < 1 ? 2 : vs < 10 ? 1 : 0), 4, y + 3); }
    const ts = nice(view.t1 - view.t0, Math.max(3, (W - PAD.l) / 70)); for (let t = Math.ceil(view.t0 / ts) * ts; t <= view.t1; t += ts) { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke(); ctx.fillText(UI.fmt(t, 2) + 's', x + 2, H - 6); }
    ctx.fillStyle = '#6b7285'; ctx.fillText(mode === 'speed' ? '速度 (单位/秒)' : '值', PAD.l + 4, 12);
    // 工作区外变暗
    const c = App.comp; ctx.fillStyle = '#00000044'; if (X(c.dur) < W) ctx.fillRect(X(c.dur), PAD.t, W - X(c.dur), H - PAD.t - PAD.b);
    ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t - 2, W - PAD.l - PAD.r, H - PAD.t - PAD.b + 4); ctx.clip();
    if (!curves.length) { ctx.restore(); ctx.fillStyle = '#6b7285'; ctx.font = '12px sans-serif'; ctx.fillText('选择含动画或表达式的属性以显示曲线', PAD.l + 20, H / 2); drawPlayhead(); if (info) info.textContent = ''; return; }
    const N = Math.min(Math.floor(W - PAD.l - PAD.r), 360);
    for (const cu of curves) {
      const hasExpr = Model.hasExpr(cu.p); ctx.strokeStyle = cu.color; ctx.lineWidth = 1.6;
      // 关键帧曲线（表达式时作为淡色参考）
      if (hasExpr && Model.isAnimated(cu.p)) { ctx.globalAlpha = 0.28; ctx.setLineDash([4, 4]); ctx.beginPath(); for (let i = 0; i <= N; i++) { const t = view.t0 + (view.t1 - view.t0) * i / N; const v0 = Model.evalKeys(cu.p, t, cu.info); const v = Array.isArray(v0) ? v0[Math.max(0, cu.c)] : v0; const y = mode === 'speed' ? 0 : Y(v); if (mode === 'speed') break; i ? ctx.lineTo(X(t), y) : ctx.moveTo(X(t), y); } ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      ctx.beginPath(); for (let i = 0; i <= N; i++) { const t = view.t0 + (view.t1 - view.t0) * i / N; const v = mode === 'speed' ? speedAt(cu, t) : evalAt(cu, t)[cu.c]; i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v)); } ctx.stroke();
      if (hasExpr) { ctx.fillStyle = cu.color; ctx.font = '10px sans-serif'; ctx.fillText('ƒ 表达式最终曲线', PAD.l + 6, 24 + curves.indexOf(cu) * 12); }
      // 关键帧点与手柄
      if (!Model.isAnimated(cu.p)) continue; const ks = cu.p.k;
      ks.forEach((k, i) => {
        const sel = App.sel.keys.some(s => s.layer === cu.L.id && s.key === cu.key && Math.abs(s.t - k.t) < 1e-4);
        const val = mode === 'speed' ? speedAt(cu, k.t) : (Array.isArray(k.v) ? k.v[cu.c] : k.v); const x = X(k.t), y = Y(val);
        if (sel || true) { // 手柄
          const nxt = ks[i + 1], prv = ks[i - 1];
          if (k.oi === 'bezier' && nxt) { const dt = nxt.t - k.t; const hx = k.t + k.oe.x * dt; let hv; if (mode === 'speed') hv = val; else { const a = Array.isArray(k.v) ? k.v[cu.c] : k.v, b = Array.isArray(nxt.v) ? nxt.v[cu.c] : nxt.v; hv = a + k.oe.y * (b - a); } if (sel || ks.length < 8) { ctx.strokeStyle = cu.color + 'aa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(X(hx), Y(hv)); ctx.stroke(); ctx.fillStyle = cu.color; ctx.beginPath(); ctx.arc(X(hx), Y(hv), 3.5, 0, 7); ctx.fill(); hits.push({ type: 'hout', x: X(hx), y: Y(hv), cu, k, i, nxt }); } }
          if (k.ii === 'bezier' && prv) { const dt = k.t - prv.t; const hx = k.t - k.ie.x * dt; let hv; if (mode === 'speed') hv = val; else { const a = Array.isArray(prv.v) ? prv.v[cu.c] : prv.v, b = Array.isArray(k.v) ? k.v[cu.c] : k.v; hv = b - k.ie.y * (b - a); } if (sel || ks.length < 8) { ctx.strokeStyle = cu.color + 'aa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(X(hx), Y(hv)); ctx.stroke(); ctx.fillStyle = cu.color; ctx.beginPath(); ctx.arc(X(hx), Y(hv), 3.5, 0, 7); ctx.fill(); hits.push({ type: 'hin', x: X(hx), y: Y(hv), cu, k, i, prv }); } }
        }
        ctx.fillStyle = sel ? '#ff8a3d' : '#16181d'; ctx.strokeStyle = sel ? '#fff' : cu.color; ctx.lineWidth = 1.5; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeRect(x - 4, y - 4, 8, 8);
        hits.push({ type: 'key', x, y, cu, k, i });
      });
    }
    ctx.restore(); drawPlayhead();
    if (info) info.textContent = curves.slice(0, 3).map(c => c.label).join(' · ') + (curves.length > 3 ? ' …' : '');
  };
  function drawPlayhead() { const x = X(App.time); if (x < PAD.l || x > W - PAD.r) return; ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - PAD.b); ctx.stroke(); ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 8); ctx.fill(); }

  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hitAt = (x, y) => { let best = null, bd = 9; for (const hh of hits) { const d = Math.hypot(hh.x - x, hh.y - y); if (d < bd) { bd = d; best = hh; } } return best; };
  function onDown(e) {
    const [x, y] = pos(e); cv.setPointerCapture(e.pointerId); App.stopPlay();
    if (e.button === 1 || e.altKey && false) { drag = { kind: 'pan', x, y, v: { ...view } }; return; }
    if (e.button !== 0) return;
    if (y < PAD.t - 2) { drag = { kind: 'scrub' }; App.setTime(tOf(x)); return; }
    const hh = hitAt(x, y);
    if (hh) {
      const k = hh.k, L = hh.cu.L, key = hh.cu.key;
      if (hh.type === 'key') {
        const isSel = App.sel.keys.some(s => s.layer === L.id && s.key === key && Math.abs(s.t - k.t) < 1e-4);
        if (e.shiftKey) { if (isSel) App.sel.keys = App.sel.keys.filter(s => !(s.layer === L.id && s.key === key && Math.abs(s.t - k.t) < 1e-4)); else Actions.setKeySel([{ layer: L.id, key, t: k.t }], true); App.emit('keysel'); return; }
        if (!isSel) Actions.setKeySel([{ layer: L.id, key, t: k.t }], false);
        const list = Actions.selKeys(); list.forEach(en => { en.k.t0 = en.k.t; en.k.v0 = Array.isArray(en.k.v) ? en.k.v.slice() : en.k.v; });
        drag = { kind: 'key', hh, list, x0: x, y0: y, c: hh.cu.c, moved: false }; return;
      }
      drag = { kind: hh.type, hh, moved: false, x0: x, y0: y }; return;
    }
    drag = { kind: 'scrubOrDeselect', x, y }; App.setTime(tOf(x)); if (!e.shiftKey) { App.sel.keys = []; App.emit('keysel'); }
  }
  function onMove(e) {
    const [x, y] = pos(e);
    if (!drag) { const hh = hitAt(x, y); cv.style.cursor = hh ? 'pointer' : 'default'; return; }
    if (drag.kind === 'pan') { const dt = (x - drag.x) / (W - PAD.l - PAD.r) * (drag.v.t1 - drag.v.t0), dv = (y - drag.y) / (H - PAD.t - PAD.b) * (drag.v.v1 - drag.v.v0); view.t0 = drag.v.t0 - dt; view.t1 = drag.v.t1 - dt; view.v0 = drag.v.v0 + dv; view.v1 = drag.v.v1 + dv; Cv.draw(); return; }
    if (drag.kind === 'scrub' || drag.kind === 'scrubOrDeselect') { App.setTime(tOf(x)); return; }
    if (drag.kind === 'key') {
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < 3) return; drag.moved = true;
      let dt = tOf(x) - tOf(drag.x0); const k0 = drag.hh.k.t0; dt = App.snap(k0 + dt) - k0; const dv = mode === 'value' && !e.shiftKey ? vOf(y) - vOf(drag.y0) : 0;
      for (const en of drag.list) { en.k.t = Math.max(0, en.k.t0 + dt); if (dv) { if (Array.isArray(en.k.v)) { const c = Math.max(0, drag.c); const nv = en.k.v0.slice(); nv[c] = en.k.v0[c] + dv; en.k.v = nv; } else en.k.v = en.k.v0 + dv; } }
      const seen = new Set(); for (const en of drag.list) { const id = en.L.id + en.key; if (seen.has(id)) continue; seen.add(id); Model.normalizeProp(en.p, en.info); }
      App.changed('values'); return;
    }
    if (drag.kind === 'hout' || drag.kind === 'hin') {
      drag.moved = true; const { cu, k } = drag.hh; const isOut = drag.kind === 'hout'; const other = isOut ? drag.hh.nxt : drag.hh.prv; const dt = Math.abs(other.t - k.t) || 1e-6;
      const t = tOf(x); let infl = U.clamp(isOut ? (t - k.t) / dt : (k.t - t) / dt, 0.01, 1);
      let ey;
      const a = Array.isArray(isOut ? k.v : other.v) ? (isOut ? k.v : other.v)[Math.max(0, cu.c)] : (isOut ? k.v : other.v), b = Array.isArray(isOut ? other.v : k.v) ? (isOut ? other.v : k.v)[Math.max(0, cu.c)] : (isOut ? other.v : k.v);
      if (mode === 'speed') { // y 为速度：ey = speed * infl * dt / |Δ|
        const spd = Math.max(0, vOf(y)); let mag = 0; if (Array.isArray(k.v)) { for (let i = 0; i < Math.min(cu.dim, k.v.length); i++) mag += (other.v[i] - k.v[i]) ** 2; mag = Math.sqrt(mag); } else mag = Math.abs(other.v - k.v); ey = mag > 1e-9 ? spd * infl * dt / mag : 0;
      } else { const v = vOf(y); ey = Math.abs(b - a) > 1e-9 ? (isOut ? (v - a) / (b - a) : (b - v) / (b - a)) : 0; }
      if (isOut) k.oe = { x: infl, y: ey }; else k.ie = { x: infl, y: ey }; App.changed('values'); return;
    }
  }
  function onUp(e) {
    if (!drag) return; const d = drag; drag = null;
    if (d.kind === 'key' && d.moved) { App.sel.keys = d.list.map(en => ({ layer: en.L.id, key: en.key, t: en.k.t })); App.changed('struct'); App.commit('曲线编辑关键帧'); }
    else if ((d.kind === 'hout' || d.kind === 'hin') && d.moved) { App.changed('struct'); App.commit('曲线编辑缓动手柄'); }
  }
  function onMenu(e) {
    e.preventDefault(); const [x, y] = pos(e); const hh = hitAt(x, y); if (hh && hh.type === 'key') { if (!App.sel.keys.some(s => s.layer === hh.cu.L.id && s.key === hh.cu.key && Math.abs(s.t - hh.k.t) < 1e-4)) Actions.setKeySel([{ layer: hh.cu.L.id, key: hh.cu.key, t: hh.k.t }]); }
    UI.menu([{ label: '缓入缓出', key: 'F9', fn: () => Actions.easyEase('both') }, { label: '进入/离开：线性', fn: () => Actions.setInterp('both', 'linear') }, { label: '进入/离开：贝塞尔', fn: () => Actions.setInterp('both', 'bezier') }, { label: '定格', fn: () => Actions.setInterp('both', 'hold') }, { sep: true }, { label: '删除所选关键帧', fn: () => Actions.deleteKeys() }, { label: '适合', fn: () => { fit(true); Cv.draw(); } }], e.clientX, e.clientY);
  }
  function onWheel(e) {
    e.preventDefault(); const [x, y] = pos(e); const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    if (e.shiftKey || e.altKey) { const v = vOf(y); view.v0 = v - (v - view.v0) * f; view.v1 = v + (view.v1 - v) * f; }
    else { const t = tOf(x); view.t0 = t - (t - view.t0) * f; view.t1 = t + (view.t1 - t) * f; }
    Cv.draw();
  }
})();
