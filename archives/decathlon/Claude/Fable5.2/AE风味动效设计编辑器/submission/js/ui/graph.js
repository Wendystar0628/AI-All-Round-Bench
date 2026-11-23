// 曲线视图：值曲线与速度曲线。位置的速度曲线是沿运动路径的实际速率；表达式属性显示最终求值曲线
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, h = MF.h, W = MF.W, A = MF.Anim, Model = MF.Model, C = MF.Cmd;
  const COLS = ['#ff7676', '#7fd17f', '#6aa8ff', '#d9a6ff'], PADL = 46, PADT = 18, PADB = 6, PADR = 10;

  const G = (MF.Graph = {
    mode: 'value', view: { t0: 0, t1: 10, v0: -1, v1: 1 }, auto: true, hits: [], marquee: null,
    init(panel) {
      G.panel = panel; const body = panel._body; body.style.overflow = 'hidden'; G.cv = h('canvas', { style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' } }); body.appendChild(G.cv); G.ctx = G.cv.getContext('2d');
      G.empty = h('div', { class: 'empty' }); body.appendChild(G.empty);
      const chip = (label, mode) => { const c = h('span', { class: 'chip' + (G.mode === mode ? ' on' : ''), onclick: () => { G.mode = mode; G.auto = true; for (const x of chips) x.el.classList.toggle('on', x.mode === G.mode); G.draw(); } }, label); return { el: c, mode }; };
      const chips = [chip('值', 'value'), chip('速度', 'speed')];
      const fit = h('button', { class: 'tbtn sm', onclick: () => { G.auto = true; G.draw(); } }, W.icon('fit')); W.tip(fit, '自动适合（双击曲线区）');
      G.legend = h('span', { class: 'hint', style: { marginLeft: '6px' } });
      panel._head.append(G.legend, h('span', { class: 'sp' }), chips[0].el, chips[1].el, fit);
      new ResizeObserver(() => G.resize()).observe(body);
      App.on('time', () => G.draw()); App.on('project', () => G.draw()); App.on('selection', () => { G.auto = true; G.draw(); }); App.on('layout', () => G.resize());
      G.cv.addEventListener('pointerdown', (e) => G.down(e)); G.cv.addEventListener('dblclick', (e) => { const m = G.pos(e); const hk = G.hit(m); if (hk && hk.kind === 'key') { App.selectKeys([{ pid: hk.pid, i: hk.i }]); C.ease(hk.key.it === 'b' && hk.key.ot === 'b' ? 'linear' : 'ease'); } else { G.auto = true; G.draw(); } });
      G.cv.addEventListener('wheel', (e) => { e.preventDefault(); const m = G.pos(e); const v = G.view; G.auto = false; if (e.ctrlKey || e.altKey) { const f = Math.exp(e.deltaY * 0.002), y = G.y2v(m[1]); v.v0 = y + (v.v0 - y) * f; v.v1 = y + (v.v1 - y) * f; } else if (e.shiftKey) { const d = (e.deltaY / G.pw()) * (v.t1 - v.t0); v.t0 += d; v.t1 += d; } else { const f = Math.exp(e.deltaY * 0.002), t = G.x2t(m[0]); v.t0 = t + (v.t0 - t) * f; v.t1 = t + (v.t1 - t) * f; } G.draw(); }, { passive: false });
      G.cv.addEventListener('pointermove', (e) => { if (G._drag) return; const hk = G.hit(G.pos(e)); G.cv.style.cursor = hk ? (hk.kind === 'key' ? 'move' : 'crosshair') : 'default'; });
      G.cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const hk = G.hit(G.pos(e)); if (hk && hk.kind === 'key') { if (!App.isKeySel(hk.pid, hk.i)) App.selectKeys([{ pid: hk.pid, i: hk.i }]); W.menu(e.clientX, e.clientY, [{ label: '线性', run: () => C.ease('linear') }, { label: '缓动', key: 'F9', run: () => C.ease('ease') }, { label: '缓入', run: () => C.ease('easeIn') }, { label: '缓出', run: () => C.ease('easeOut') }, { label: '定格', run: () => C.ease('hold') }, '-', { label: '删除关键帧', run: () => C.deleteKeys() }]); } });
      G.resize();
    },
    resize() { const r = G.cv.parentNode.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; G.w = Math.max(20, r.width); G.h = Math.max(20, r.height); G.cv.width = Math.round(G.w * dpr); G.cv.height = Math.round(G.h * dpr); G.dpr = dpr; G.draw(); },
    pw() { return G.w - PADL - PADR; }, ph() { return G.h - PADT - PADB; },
    t2x(t) { return PADL + ((t - G.view.t0) / (G.view.t1 - G.view.t0)) * G.pw(); }, x2t(x) { return G.view.t0 + ((x - PADL) / G.pw()) * (G.view.t1 - G.view.t0); },
    v2y(v) { return PADT + (1 - (v - G.view.v0) / (G.view.v1 - G.view.v0)) * G.ph(); }, y2v(y) { return G.view.v0 + (1 - (y - PADT) / G.ph()) * (G.view.v1 - G.view.v0); },
    pos(e) { const r = G.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
    // 当前显示的属性
    shown() {
      const out = []; const seen = new Set(); const add = (pid) => { if (seen.has(pid)) return; const r = App.resolve(pid); if (!r) return; if (r.meta.type === 'path') return; seen.add(pid); out.push(r); };
      for (const pid of App.sel.props) add(pid); for (const k of App.sel.keys) add(k.pid);
      return out.slice(0, 6);
    },
    chans(r) { const n = r.meta.type === 'num' ? 1 : (r.meta.type === 'color' ? 3 : Model.dims(r.meta, r.prop)); return Math.max(1, n); },
    val(r, t, d, raw) { const v = raw ? A.value(r.prop, t, r.meta) : MF.Eval.val(r.prop, t); return Array.isArray(v) ? v[d] || 0 : v; },
    speedAt(r, t, d) { const hh = 1 / 600; const a = MF.Eval.val(r.prop, t - hh), b = MF.Eval.val(r.prop, t + hh); if (Array.isArray(a)) { if (r.meta.spatial) { let s = 0; for (let i = 0; i < a.length; i++) s += (b[i] - a[i]) * (b[i] - a[i]); return Math.sqrt(s) / (2 * hh); } return (b[d] - a[d]) / (2 * hh); } return (b - a) / (2 * hh); },
    draw() {
      const ctx = G.ctx; if (!ctx || !G.w) return; const dpr = G.dpr || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, G.w, G.h); ctx.fillStyle = '#141312'; ctx.fillRect(0, 0, G.w, G.h);
      const c = App.comp(); const rs = c ? G.shown() : []; G.hits = [];
      G.empty.style.display = rs.length ? 'none' : ''; if (!rs.length) { G.empty.innerHTML = c ? '<b>曲线视图</b>在时间轴或属性面板中点选属性名<br>即可查看并编辑它的值曲线与速度曲线' : '<b>曲线视图</b>没有打开的合成'; G.legend.textContent = ''; return; }
      const v = G.view; const speed = G.mode === 'speed'; const N = Math.max(40, Math.round(G.pw() / 2));
      // 取样
      const series = [];
      if (G.auto) { v.t0 = 0; v.t1 = c.duration; }
      for (const r of rs) { const nch = speed && r.meta.spatial ? 1 : G.chans(r); for (let d = 0; d < nch; d++) { const pts = new Float64Array(N + 1); for (let i = 0; i <= N; i++) { const t = v.t0 + ((v.t1 - v.t0) * i) / N; pts[i] = speed ? G.speedAt(r, t, d) : G.val(r, t, d); } let raw = null; if (!speed && r.prop.x !== undefined && r.prop.xOn !== false && r.prop.k) { raw = new Float64Array(N + 1); for (let i = 0; i <= N; i++) raw[i] = G.val(r, v.t0 + ((v.t1 - v.t0) * i) / N, d, true); } series.push({ r, d, pts, raw, col: speed && r.meta.spatial ? '#ffb347' : COLS[d % 4] }); } }
      if (G.auto) { let mn = Infinity, mx = -Infinity; for (const s of series) { for (const y of s.pts) { if (y < mn) mn = y; if (y > mx) mx = y; } if (s.raw) for (const y of s.raw) { if (y < mn) mn = y; if (y > mx) mx = y; } const k = s.r.prop.k; if (k && !speed) for (const key of k) { const y = Array.isArray(key.v) ? key.v[s.d] || 0 : key.v; if (typeof y === 'number') { if (y < mn) mn = y; if (y > mx) mx = y; } } } if (!isFinite(mn)) { mn = 0; mx = 1; } if (speed) mn = Math.min(mn, 0); let pad = (mx - mn) * 0.14; if (pad < 1e-6) pad = Math.max(1, Math.abs(mx) * 0.2); v.v0 = mn - pad; v.v1 = mx + pad; }
      // 网格
      ctx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--mono'); ctx.textBaseline = 'middle';
      const nice = (span, n) => { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
      const vs = nice(v.v1 - v.v0, Math.max(2, G.ph() / 34)); for (let y = Math.ceil(v.v0 / vs) * vs; y <= v.v1; y += vs) { const py = Math.round(G.v2y(y)) + 0.5; ctx.strokeStyle = Math.abs(y) < vs * 1e-6 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(PADL, py); ctx.lineTo(G.w - PADR, py); ctx.stroke(); ctx.fillStyle = '#6e675f'; ctx.textAlign = 'right'; ctx.fillText(MF.fmt(Math.abs(y) < vs * 1e-6 ? 0 : y, 2), PADL - 5, py); }
      const ts = nice(v.t1 - v.t0, Math.max(2, G.pw() / 60)); ctx.textAlign = 'left'; for (let t = Math.ceil(v.t0 / ts) * ts; t <= v.t1; t += ts) { const px = Math.round(G.t2x(t)) + 0.5; ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(px, PADT); ctx.lineTo(px, G.h - PADB); ctx.stroke(); ctx.fillStyle = '#6e675f'; ctx.fillText(MF.fmt(t, 2) + 's', px + 3, 9); }
      ctx.save(); ctx.beginPath(); ctx.rect(PADL, PADT - 4, G.pw() + 4, G.ph() + 8); ctx.clip();
      // 曲线
      for (const s of series) {
        if (s.raw) { ctx.strokeStyle = s.col; ctx.globalAlpha = 0.35; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= N; i++) { const x = PADL + (i / N) * G.pw(), y = G.v2y(s.raw[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
        ctx.strokeStyle = s.col; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i <= N; i++) { const x = PADL + (i / N) * G.pw(), y = G.v2y(s.pts[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
      }
      // 关键帧与手柄
      for (const s of series) {
        const r = s.r, k = r.prop.k; if (!k) continue; const spatial = !!r.meta.spatial; const pid = r.pid;
        k.forEach((key, i) => {
          const sel = App.isKeySel(pid, i); const nx = k[i + 1], pv = k[i - 1]; const kx = G.t2x(key.t);
          const kv = Array.isArray(key.v) ? key.v[s.d] || 0 : key.v; const dOf = (sp) => (Array.isArray(sp) ? sp[s.d] || 0 : sp || 0);
          if (!speed) {
            const ky = G.v2y(spatial || typeof kv !== 'number' ? G.val(r, key.t, s.d, true) : kv);
            if (!spatial && sel) {
              if (nx && key.ot === 'b') { const dt = nx.t - key.t, oi = (key.oi === undefined ? 33.333 : key.oi) / 100; const hx = G.t2x(key.t + oi * dt), hy = G.v2y(kv + dOf(key.os) * oi * dt); G.handle(ctx, kx, ky, hx, hy, s.col); G.hits.push({ kind: 'h', side: 'o', x: hx, y: hy, pid, i, d: s.d, key, r, dt, mode: 'value', kv }); }
              if (pv && key.it === 'b') { const dt = key.t - pv.t, ii = (key.ii === undefined ? 33.333 : key.ii) / 100; const hx = G.t2x(key.t - ii * dt), hy = G.v2y(kv - dOf(key.is) * ii * dt); G.handle(ctx, kx, ky, hx, hy, s.col); G.hits.push({ kind: 'h', side: 'i', x: hx, y: hy, pid, i, d: s.d, key, r, dt, mode: 'value', kv }); }
            }
            G.keyDot(ctx, kx, ky, sel, s.col, key); G.hits.push({ kind: 'key', x: kx, y: ky, pid, i, d: s.d, key, r, spatial });
          } else {
            const eps = 1e-4; const so = nx ? G.speedAt(r, key.t + eps + 1 / 600, s.d) : 0, si = pv ? G.speedAt(r, key.t - eps - 1 / 600, s.d) : so;
            const yo = G.v2y(nx ? so : si), yi = G.v2y(pv ? si : so);
            if (sel) {
              if (nx && key.ot === 'b') { const dt = nx.t - key.t, oi = (key.oi === undefined ? 33.333 : key.oi) / 100; const sv = spatial ? (Array.isArray(key.os) ? key.os[0] : key.os || 0) : dOf(key.os); const hx = G.t2x(key.t + oi * dt), hy = G.v2y(sv); G.handle(ctx, kx, G.v2y(sv), hx, hy, s.col); G.hits.push({ kind: 'h', side: 'o', x: hx, y: hy, pid, i, d: s.d, key, r, dt, mode: 'speed', spatial }); }
              if (pv && key.it === 'b') { const dt = key.t - pv.t, ii = (key.ii === undefined ? 33.333 : key.ii) / 100; const sv = spatial ? (Array.isArray(key.is) ? key.is[0] : key.is || 0) : dOf(key.is); const hx = G.t2x(key.t - ii * dt), hy = G.v2y(sv); G.handle(ctx, kx, G.v2y(sv), hx, hy, s.col); G.hits.push({ kind: 'h', side: 'i', x: hx, y: hy, pid, i, d: s.d, key, r, dt, mode: 'speed', spatial }); }
            }
            G.keyDot(ctx, kx, yo, sel, s.col, key); if (Math.abs(yo - yi) > 3) G.keyDot(ctx, kx, yi, sel, s.col, key); G.hits.push({ kind: 'key', x: kx, y: yo, pid, i, d: s.d, key, r, spatial, speed: true });
          }
        });
      }
      ctx.restore();
      if (G.marquee) { const m = G.marquee; ctx.fillStyle = 'rgba(88,199,224,.12)'; ctx.strokeStyle = '#58c7e0'; ctx.setLineDash([4, 3]); ctx.fillRect(m[0], m[1], m[2] - m[0], m[3] - m[1]); ctx.strokeRect(m[0] + 0.5, m[1] + 0.5, m[2] - m[0], m[3] - m[1]); ctx.setLineDash([]); }
      const px = Math.round(G.t2x(App.time)) + 0.5; if (px >= PADL - 1) { ctx.strokeStyle = '#ff6a2b'; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, G.h); ctx.stroke(); ctx.fillStyle = '#ff6a2b'; ctx.fillRect(px - 4, 0, 8, 5);
        // 当前值读数
        let yy = PADT + 8; ctx.textAlign = 'left'; for (const s of series) { const val = speed ? G.speedAt(s.r, App.time, s.d) : G.val(s.r, App.time, s.d); ctx.fillStyle = s.col; const tx = px + 6 + 70 > G.w ? px - 70 : px + 6; ctx.fillText(MF.fmt(val, 2), tx, yy); yy += 12; const py = G.v2y(val); ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 6.2832); ctx.fill(); } }
      G.legend.innerHTML = rs.map((r) => (r.layer ? r.layer.name + ' · ' : '') + r.desc.label + (r.prop.x !== undefined && r.prop.xOn !== false ? '（表达式结果）' : '')).join('　') + (speed ? '　单位/秒' : '');
    },
    handle(ctx, kx, ky, hx, hy, col) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(hx, hy); ctx.stroke(); ctx.fillStyle = '#141312'; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, 6.2832); ctx.fill(); ctx.stroke(); },
    keyDot(ctx, x, y, sel, col, key) { ctx.fillStyle = sel ? '#fff' : '#141312'; ctx.strokeStyle = sel ? '#ff6a2b' : col; ctx.lineWidth = 1.5; ctx.beginPath(); if (key.ot === 'h') ctx.rect(x - 3.5, y - 3.5, 7, 7); else { ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4.5, y); ctx.lineTo(x, y + 4.5); ctx.lineTo(x - 4.5, y); ctx.closePath(); } ctx.fill(); ctx.stroke(); },
    hit(m) { let best = null, bd = 8; for (const hk of G.hits) { const d = Math.hypot(hk.x - m[0], hk.y - m[1]) - (hk.kind === 'h' ? 1.5 : 0); if (d < bd) { bd = d; best = hk; } } return best; },
    down(e) {
      const c = App.comp(); if (!c) return; const m = G.pos(e); if (e.button === 2) return;
      const dragWith = (mv, end) => { G._drag = true; W.drag(e, (ev) => mv(G.pos(ev), ev), (ev) => { G._drag = false; if (end) end(G.pos(ev), ev); G.draw(); }); };
      if (e.button === 1) { const v0 = Object.assign({}, G.view); G.auto = false; dragWith((p) => { const dt = ((p[0] - m[0]) / G.pw()) * (v0.t1 - v0.t0), dv = ((p[1] - m[1]) / G.ph()) * (v0.v1 - v0.v0); G.view.t0 = v0.t0 - dt; G.view.t1 = v0.t1 - dt; G.view.v0 = v0.v0 + dv; G.view.v1 = v0.v1 + dv; G.draw(); }); return; }
      const hk = G.hit(m);
      if (hk && hk.kind === 'h') { // 贝塞尔手柄：横向=影响，纵向=速度
        const key = hk.key, dims = hk.r.meta.spatial ? 1 : Math.max(1, Model.dims(hk.r.meta, hk.r.prop)); G.auto = false; App.beginDrag('调整缓动手柄');
        const ens = (name) => { if (hk.r.meta.spatial) { if (Array.isArray(key[name])) key[name] = key[name][0] || 0; if (key[name] === undefined) key[name] = 0; } else if (dims > 1) { if (!Array.isArray(key[name])) key[name] = new Array(dims).fill(key[name] || 0); } else if (key[name] === undefined) key[name] = 0; };
        dragWith((p, ev) => { const t = G.x2t(p[0]), y = G.y2v(p[1]); const inf = MF.clamp(((hk.side === 'o' ? t - key.t : key.t - t) / hk.dt) * 100, 0.5, 100); const name = hk.side === 'o' ? 'os' : 'is';
          if (hk.side === 'o') key.oi = inf; else key.ii = inf; ens(name);
          let sp; if (hk.mode === 'speed') sp = hk.r.meta.spatial ? Math.max(0, y) : y; else sp = hk.side === 'o' ? (y - hk.kv) / ((inf / 100) * hk.dt) : (hk.kv - y) / ((inf / 100) * hk.dt);
          if (ev.shiftKey) sp = 0;
          if (Array.isArray(key[name])) { if (ev.ctrlKey) key[name] = key[name].map(() => sp); else key[name][hk.d] = sp; } else key[name] = sp;
          App.changed(); }, () => App.endDrag());
        return;
      }
      if (hk && hk.kind === 'key') {
        const already = App.isKeySel(hk.pid, hk.i); if (e.shiftKey) App.selectKeys([{ pid: hk.pid, i: hk.i }], true); else if (!already) App.selectKeys([{ pid: hk.pid, i: hk.i }]);
        const refs = C.selectedKeyRefs(); const orig = new Map(); for (const x of refs) orig.set(x.key, { t: x.key.t, v: MF.clone(x.key.v) }); let started = false; G.auto = false;
        const resel = () => { const sel = []; for (const x of refs) { const i = x.r.prop.k.indexOf(x.key); if (i >= 0) sel.push({ pid: x.pid, i }); } App.sel.keys = sel; };
        dragWith((p, ev) => { if (!started) { if (Math.hypot(p[0] - m[0], p[1] - m[1]) < 3) return; started = true; App.beginDrag('在曲线上移动关键帧'); }
          let dt = G.x2t(p[0]) - G.x2t(m[0]), dv = hk.speed ? 0 : G.y2v(p[1]) - G.y2v(m[1]); if (ev.shiftKey) { if (Math.abs(p[0] - m[0]) > Math.abs(p[1] - m[1])) dv = 0; else dt = 0; }
          const g0 = orig.get(hk.key).t; dt = App.snapT(g0 + dt) - g0;
          for (const x of refs) { const o = orig.get(x.key); x.key.t = Math.max(0, o.t + dt); if (dv && x.r.meta.type !== 'path') { if (Array.isArray(o.v)) { const nv = o.v.slice(); const d = x.pid === hk.pid ? hk.d : 0; nv[d] = (nv[d] || 0) + dv; x.key.v = nv; } else if (typeof o.v === 'number') { let nv = o.v + dv; if (x.r.meta.min !== undefined) nv = Math.max(x.r.meta.min, nv); if (x.r.meta.max !== undefined) nv = Math.min(x.r.meta.max, nv); x.key.v = nv; } } }
          for (const x of refs) A.sort(x.r.prop); resel(); App.changed(); }, () => { if (started) { App.endDrag(); App.emit('selection', { keys: true }); G.auto = false; } });
        return;
      }
      if (m[1] < PADT) { App.pause(); const sc = (p) => App.setTime(G.x2t(p[0])); sc(m); dragWith(sc); return; }
      if (!e.shiftKey) App.selectKeys([]);
      G.marquee = [m[0], m[1], m[0], m[1]];
      dragWith((p) => { G.marquee[2] = p[0]; G.marquee[3] = p[1]; G.draw(); }, () => { const q = G.marquee; G.marquee = null; const x0 = Math.min(q[0], q[2]), x1 = Math.max(q[0], q[2]), y0 = Math.min(q[1], q[3]), y1 = Math.max(q[1], q[3]); if (x1 - x0 > 3 || y1 - y0 > 3) { const ks = []; for (const k of G.hits) if (k.kind === 'key' && k.x >= x0 && k.x <= x1 && k.y >= y0 && k.y <= y1 && !ks.some((o) => o.pid === k.pid && o.i === k.i)) ks.push({ pid: k.pid, i: k.i }); const keepProps = App.sel.props.slice(); App.selectKeys(ks); App.sel.props = keepProps; } });
    },
  });
})();
