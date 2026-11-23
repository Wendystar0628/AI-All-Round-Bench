/* 曲线视图：值曲线与速度曲线（位置的速度为沿运动路径的实际速度），关键帧与贝塞尔手柄可拖动。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = AE.UI;
  const U = AE.U;
  const Anim = AE.Anim;
  const App = AE.App;
  const E = UI.el;
  const GV = (UI.graph = {});

  let root, cv, info, ctx2, dpr = 1;
  let drag = null;
  let view = { t0: 0, t1: 1, v0: 0, v1: 1 };
  let comp = null;

  function target() {
    const sp = App.state.selProp;
    if (!sp) return null;
    const layer = App.layer(sp.layer);
    if (!layer) return null;
    const prop = UI.findProp(layer, sp.prop);
    if (!prop) return null;
    return { layer, prop };
  }

  // 数值分量（向量属性取第 comp 个分量；速度为合成速度）
  function scalarOf(v, dim) {
    return Array.isArray(v) ? v[dim] : v;
  }

  GV.draw = () => {
    if (!cv) return;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = ctx2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#16161b';
    g.fillRect(0, 0, W, H);
    const c = App.comp();
    const tg = target();
    const pad = { l: 46, r: 14, t: 14, b: 22 };
    // 时间范围：整个合成时长
    view.t0 = 0;
    view.t1 = c.duration;
    const x = (t) => pad.l + ((t - view.t0) / (view.t1 - view.t0)) * (W - pad.l - pad.r);
    if (!tg) {
      g.fillStyle = '#6d6c75';
      g.font = '13px sans-serif';
      g.fillText('在属性行右侧点击 fx 以外的属性（或时间轴关键帧）选择属性以查看曲线。', 20, 40);
      info.textContent = '未选择属性';
      return;
    }
    const { layer, prop } = tg;
    const dims = prop.kind === 'vec' || prop.kind === 'color' ? (Array.isArray(prop.v) ? prop.v.length : 3) : 1;
    const dim = Math.min(dims - 1, GV.dim || 0);
    const mode = App.state.graphMode;
    const start = layer.startTime || 0;
    const N = 240;
    // 采样
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = view.t0 + ((view.t1 - view.t0) * i) / N;
      const lt = t;
      let v;
      if (mode === 'speed') v = Anim.speedAt(c, layer, prop, t);
      else v = scalarOf(Anim.value(c, layer, prop, t), dim);
      pts.push([t, v]);
    }
    let vmin = Infinity, vmax = -Infinity;
    pts.forEach(([, v]) => {
      if (Number.isFinite(v)) {
        vmin = Math.min(vmin, v);
        vmax = Math.max(vmax, v);
      }
    });
    if (!isFinite(vmin)) {
      vmin = 0;
      vmax = 1;
    }
    if (vmax - vmin < 1e-6) {
      vmin -= 1;
      vmax += 1;
    }
    const padV = (vmax - vmin) * 0.12;
    vmin -= padV;
    vmax += padV;
    const y = (v) => pad.t + (1 - (v - vmin) / (vmax - vmin)) * (H - pad.t - pad.b);
    view.v0 = vmin;
    view.v1 = vmax;
    // 网格
    g.strokeStyle = '#26262e';
    g.lineWidth = 1;
    g.beginPath();
    for (let tt = 0; tt <= c.duration; tt += 1) {
      g.moveTo(x(tt) + 0.5, pad.t);
      g.lineTo(x(tt) + 0.5, H - pad.b);
    }
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + ((H - pad.t - pad.b) * i) / 4;
      g.moveTo(pad.l, yy + 0.5);
      g.lineTo(W - pad.r, yy + 0.5);
    }
    g.stroke();
    g.fillStyle = '#7f7e88';
    g.font = '11px sans-serif';
    for (let tt = 0; tt <= c.duration; tt += 1) g.fillText(tt + 's', x(tt) - 6, H - 6);
    for (let i = 0; i <= 4; i++) {
      const v = vmin + ((vmax - vmin) * (4 - i)) / 4;
      g.fillText(v.toFixed(Math.abs(v) < 10 ? 2 : 0), 6, pad.t + ((H - pad.t - pad.b) * i) / 4 + 4);
    }
    // 工作区与图层入出点
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.fillRect(x(layer.inPoint), pad.t, x(layer.outPoint) - x(layer.inPoint), H - pad.t - pad.b);
    // 曲线
    g.strokeStyle = mode === 'speed' ? '#7fd7f0' : '#ffb36b';
    g.lineWidth = 2;
    g.beginPath();
    pts.forEach(([t, v], i) => {
      if (!Number.isFinite(v)) return;
      if (i === 0) g.moveTo(x(t), y(v));
      else g.lineTo(x(t), y(v));
    });
    g.stroke();
    // 关键帧与手柄（仅值模式）
    if (prop.animated) {
      const keyX = (k) => k.t + start;
      const kv = (k) => scalarOf(k.v, dim);
      prop.keys.forEach((k, i) => {
        const kx = x(keyX(k)), ky = y(kv(k));
        const sel = App.state.graphSel && App.state.graphSel.prop === prop.id && App.state.graphSel.index === i;
        g.fillStyle = sel ? '#ffe07a' : '#ffc24a';
        g.fillRect(kx - 4, ky - 4, 8, 8);
        if (sel && mode === 'value') {
          const next = prop.keys[i + 1], prev = prop.keys[i - 1];
          const drawHandle = (hx, hy) => {
            g.strokeStyle = '#ffffff55';
            g.beginPath();
            g.moveTo(kx, ky);
            g.lineTo(hx, hy);
            g.stroke();
            g.fillStyle = '#ffffff';
            g.beginPath();
            g.arc(hx, hy, 4, 0, Math.PI * 2);
            g.fill();
          };
          if (next && k.outT !== 'hold' && !(prop.kind === 'bool' || prop.kind === 'enum')) {
            const dt = next.t - k.t;
            const hx = x(keyX(k) + k.outI * dt);
            const hy = y(kv(k) + k.outS * k.outI * (kv(next) - kv(k)));
            drawHandle(hx, hy);
            GV.handles = GV.handles || [];
          }
          if (prev && k.inT !== 'hold' && prev) {
            const dt = k.t - prev.t;
            const hx = x(keyX(k) - k.inI * dt);
            const hy = y(kv(k) - k.inS * k.inI * (kv(k) - kv(prev)));
            drawHandle(hx, hy);
          }
        }
      });
    }
    // 当前时间
    g.strokeStyle = '#ff8a3d';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x(App.state.time) + 0.5, pad.t);
    g.lineTo(x(App.state.time) + 0.5, H - pad.b);
    g.stroke();
    info.textContent = (mode === 'speed' ? '速度' : '数值') + ' · ' + layer.name + ' · ' + (tg.label || prop.kind) + (dims > 1 ? ' [' + ['X', 'Y', 'Z'][dim] + ']' : '') + (prop.spatial ? ' · 空间路径' : '');
    GV.geom = { x, y, pad, W, H, vmin, vmax, dim, layer, prop, mode };
  };

  // 命中测试：关键帧或手柄
  function hit(e) {
    const g = GV.geom;
    if (!g) return null;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const { layer, prop } = g;
    if (!prop.animated || g.mode !== 'value') return null;
    const start = layer.startTime || 0;
    const dim = g.dim;
    const kv = (k) => (Array.isArray(k.v) ? k.v[dim] : k.v);
    const hits = [];
    prop.keys.forEach((k, i) => {
      const kx = g.x(k.t + start), ky = g.y(kv(k));
      hits.push({ type: 'key', index: i, d: Math.hypot(mx - kx, my - ky) });
      const next = prop.keys[i + 1], prev = prop.keys[i - 1];
      if (next && k.outT !== 'hold') {
        const dt = next.t - k.t;
        const hx = g.x(k.t + start + k.outI * dt), hy = g.y(kv(k) + k.outS * k.outI * (kv(next) - kv(k)));
        hits.push({ type: 'out', index: i, d: Math.hypot(mx - hx, my - hy) + 0.5 });
      }
      if (prev && k.inT !== 'hold') {
        const dt = k.t - prev.t;
        const hx = g.x(k.t + start - k.inI * dt), hy = g.y(kv(k) - k.inS * k.inI * (kv(k) - kv(prev)));
        hits.push({ type: 'in', index: i, d: Math.hypot(mx - hx, my - hy) + 0.5 });
      }
    });
    hits.sort((a, b) => a.d - b.d);
    return hits[0] && hits[0].d < 9 ? hits[0] : null;
  }

  function onDown(e) {
    const h = hit(e);
    if (!h) {
      drag = null;
      return;
    }
    const sp = App.state.selProp;
    App.state.graphSel = { prop: sp.prop, index: h.index };
    e.preventDefault();
    App.beginAction();
    drag = { hit: h, startX: e.clientX, startY: e.clientY };
    const move = (ev) => onMove(ev);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      drag = null;
      App.endAction('曲线编辑');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    GV.draw();
  }
  function onMove(e) {
    if (!drag || !GV.geom) return;
    const g = GV.geom;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const pr = UI.findProp(App.layer(g.layer.id), g.prop.id);
    if (!pr) return;
    const k = pr.keys[drag.hit.index];
    if (!k) return;
    const start = g.layer.startTime || 0;
    const tAt = (px) => view.t0 + ((px - g.pad.l) / (g.W - g.pad.l - g.pad.r)) * (view.t1 - view.t0);
    const vAt = (py) => g.vmin + (1 - (py - g.pad.t) / (g.H - g.pad.t - g.pad.b)) * (g.vmax - g.vmin);
    const dim = g.dim;
    const kv = (kk) => (Array.isArray(kk.v) ? kk.v[dim] : kk.v);
    const setV = (val) => {
      if (Array.isArray(k.v)) {
        k.v = k.v.slice();
        k.v[dim] = val;
      } else k.v = val;
    };
    if (drag.hit.type === 'key') {
      const fps = App.comp().fps;
      let nt = Math.round((tAt(mx) - start) * fps) / fps;
      const idx = drag.hit.index;
      const prevT = pr.keys[idx - 1] ? pr.keys[idx - 1].t + 1e-3 : 0;
      const nextT = pr.keys[idx + 1] ? pr.keys[idx + 1].t - 1e-3 : Infinity;
      k.t = U.clamp(nt, prevT, nextT);
      setV(vAt(my));
    } else {
      const next = pr.keys[drag.hit.index + 1], prev = pr.keys[drag.hit.index - 1];
      if (drag.hit.type === 'out' && next) {
        const dt = next.t - k.t;
        k.outI = U.clamp((tAt(mx) - start - k.t) / dt, 0.01, 1);
        const dv = kv(next) - kv(k);
        const vv = vAt(my) - kv(k);
        k.outS = Math.abs(dv) > 1e-9 ? vv / (dv * Math.max(k.outI, 0.01)) : 0;
        k.outT = 'bezier';
        if (k.inT === 'linear') k.inT = 'bezier';
      } else if (drag.hit.type === 'in' && prev) {
        const dt = k.t - prev.t;
        k.inI = U.clamp((k.t - (tAt(mx) - start)) / dt, 0.01, 1);
        const dv = kv(k) - kv(prev);
        const vv = kv(k) - vAt(my);
        k.inS = Math.abs(dv) > 1e-9 ? vv / (dv * Math.max(k.inI, 0.01)) : 0;
        k.inT = 'bezier';
        if (k.outT === 'linear') k.outT = 'bezier';
      }
    }
    pr.keys.sort((a, b) => a.t - b.t);
    App.liveChange();
    GV.draw();
  }

  // 选中关键帧的插值操作
  GV.setInterp = (kind) => {
    const sp = App.state.selProp;
    const gs = App.state.graphSel;
    if (!sp || !gs) return App.toast('先在曲线中选中一个关键帧');
    App.mutate('插值', () => {
      const l = App.layer(sp.layer);
      const p = UI.findProp(l, sp.prop);
      const k = p && p.keys[gs.index];
      if (!k) return;
      if (kind === 'ease') {
        Object.assign(k, { inT: 'bezier', outT: 'bezier', inI: 0.33, outI: 0.33, inS: 0, outS: 0 });
      } else if (kind === 'linear') Object.assign(k, { inT: 'linear', outT: 'linear' });
      else if (kind === 'hold') Object.assign(k, { outT: 'hold' });
      else if (kind === 'bezier') Object.assign(k, { inT: 'bezier', outT: 'bezier' });
    });
  };

  // 进入 / 离开分别设置插值（线性、贝塞尔、定格）；定格的进入侧即前一段的离开侧
  GV.setSide = (side, kind) => {
    const sp = App.state.selProp;
    const gs = App.state.graphSel;
    if (!sp || !gs) return App.toast('先在曲线中选中一个关键帧');
    App.mutate('进入 / 离开插值', () => {
      const l = App.layer(sp.layer);
      const p = UI.findProp(l, sp.prop);
      const k = p && p.keys[gs.index];
      if (!k) return;
      const prev = p.keys[gs.index - 1];
      if (side === 'in') {
        if (kind === 'hold') {
          if (prev) prev.outT = 'hold';
        } else {
          k.inT = kind;
          if (prev && prev.outT === 'hold') prev.outT = 'bezier';
        }
      } else if (kind === 'hold') k.outT = 'hold';
      else k.outT = kind;
    });
  };

  GV.full = () => {
    if (!root || !App.comp()) return;
    comp = App.comp();
    GV.draw();
  };

  GV.init = () => {
    const host = document.getElementById('bottomBody');
    root = E('div', { class: 'graph' });
    const bar = E('div', { class: 'graph-bar' }, [
      E('button', { class: 'btn small' + (App.state.graphMode === 'value' ? ' on' : ''), onclick: () => { App.state.graphMode = 'value'; GV.full(); } }, '值曲线'),
      E('button', { class: 'btn small' + (App.state.graphMode === 'speed' ? ' on' : ''), onclick: () => { App.state.graphMode = 'speed'; GV.full(); } }, '速度曲线'),
      E('button', { class: 'btn small', onclick: () => GV.setInterp('ease'), title: 'F9 缓入缓出' }, '缓入缓出 F9'),
      E('button', { class: 'btn small', onclick: () => GV.setInterp('linear') }, '线性'),
      E('button', { class: 'btn small', onclick: () => GV.setInterp('bezier') }, '贝塞尔'),
      E('button', { class: 'btn small', onclick: () => GV.setInterp('hold') }, '定格'),
      E('span', { class: 'muted small', text: '进入' }),
      UI.select([['bezier', '贝塞尔'], ['linear', '线性'], ['hold', '定格']], 'bezier', (v) => GV.setSide('in', v)),
      E('span', { class: 'muted small', text: '离开' }),
      UI.select([['bezier', '贝塞尔'], ['linear', '线性'], ['hold', '定格']], 'bezier', (v) => GV.setSide('out', v)),
      // 向量属性的分量切换
      ...['X', 'Y', 'Z'].map((axis, i) => E('button', { class: 'btn small' + ((GV.dim || 0) === i ? ' on' : ''), title: '显示 ' + axis + ' 分量', onclick: () => { GV.dim = i; GV.full(); } }, axis)),
      info = E('span', { class: 'muted small', style: { marginLeft: '10px' } }),
    ]);
    cv = E('canvas', { class: 'gcanvas' });
    root.append(bar, E('div', { class: 'gwrap' }, [cv]));
    host.appendChild(root);
    ctx2 = cv.getContext('2d');
    dpr = window.devicePixelRatio || 1;
    cv.addEventListener('mousedown', onDown);
    UI.register({ full: () => GV.full(), time: () => { if (App.state.bottomTab === 'graph') GV.draw(); }, values: () => { if (App.state.bottomTab === 'graph') GV.draw(); } });
    window.addEventListener('resize', () => GV.draw());
  };
  void comp;
})();
