/* 时间轴：传输控制、图层列表（显示 / 锁定 / 展开属性）、入出点拖动、关键帧多选（点选 / Shift 加选 / 框选）、
 * 整组移动、Alt 拖动按比例拉伸、删除与复制粘贴、标尺与播放头。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = AE.UI;
  const Model = AE.Model;
  const Anim = AE.Anim;
  const App = AE.App;
  const E = UI.el;
  const TL = (UI.timeline = {});

  const ROW_H = 26;
  const LEFT_W = 300;
  let root, toolbar, leftCol, rightCol, playhead, scrollEl;
  // 选中的关键帧：{ layerId, propId, index }，propId 唯一标识属性
  let selKeys = [];
  let boxEl = null;

  TL.selectedKeys = () => selKeys.slice();
  TL.clearKeys = () => {
    selKeys = [];
  };
  const keyIs = (k, layerId, propId, index) => k.layerId === layerId && k.propId === propId && k.index === index;
  const keySelected = (layerId, propId, index) => selKeys.some((k) => keyIs(k, layerId, propId, index));

  // 收集图层中所有属性（用于展开显示关键帧）
  function layerProps(layer) {
    const out = [];
    const add = (label, prop) => {
      if (prop && prop.kind && prop.id) out.push({ label, prop });
    };
    add('锚点', layer.tr.anchor);
    add('位置', layer.tr.position);
    add('缩放', layer.tr.scale);
    add('旋转', layer.tr.rotation);
    if (layer.is3D) {
      add('X 旋转', layer.tr.rotationX);
      add('Y 旋转', layer.tr.rotationY);
    }
    add('不透明度', layer.tr.opacity);
    if (layer.type === 'camera') {
      add('目标点', layer.cam.poi);
      add('缩放', layer.cam.zoom);
      add('光圈', layer.cam.aperture);
      add('对焦距离', layer.cam.focus);
    }
    if (layer.type === 'light') {
      add('颜色', layer.light.color);
      add('强度', layer.light.intensity);
    }
    if (layer.extrude) {
      add('挤出深度', layer.extrude.depth);
      add('倒角', layer.extrude.bevel);
    }
    const m = layer.mat || (layer.geo && layer.geo.mat);
    if (m) ['color', 'metal', 'rough', 'emit', 'alpha'].forEach((k) => add('材质 ' + k, m[k]));
    if (layer.type === 'text') {
      add('字号', layer.text.size);
      add('字距', layer.text.tracking);
      add('填充颜色', layer.fill.color);
    }
    (layer.masks || []).forEach((mk, i) => {
      add('蒙版' + (i + 1) + ' 形状', mk.path);
      add('蒙版' + (i + 1) + ' 羽化', mk.feather);
    });
    (layer.effects || []).forEach((fx, i) => {
      Object.keys(fx.params).forEach((k) => add('效果' + (i + 1) + ' ' + k, fx.params[k]));
    });
    if (layer.type === 'precomp' && layer.pre.remap) add('时间重映射', layer.pre.remap);
    if (layer.type === 'particles') {
      add('重力', layer.particles.gravity);
      (layer.particles.emitters || []).forEach((e, i) => {
        add('发射器' + (i + 1) + ' 速率', e.rate);
        add('发射器' + (i + 1) + ' 位置', e.pos);
      });
    }
    if (layer.type === 'sound') add('音量', layer.sound.volume);
    return out;
  }

  // 展开的图层显示有关键帧的属性；快捷键 P/S/R/T/A 另外显示对应的属性（即使没有关键帧）
  function sortedRows(comp) {
    const rows = [];
    const focus = App.state.propFocus;
    comp.layers.forEach((layer, idx) => {
      rows.push({ kind: 'layer', layer, idx });
      if (App.state.expandedLayers[layer.id]) {
        layerProps(layer).forEach((pp) => {
          const shown = pp.prop.animated || (focus && focus.layerId === layer.id && focus.labels.includes(pp.label));
          if (shown) rows.push({ kind: 'prop', layer, label: pp.label, prop: pp.prop });
        });
      }
    });
    return rows;
  }

  // ---------- 传输 ----------
  function transport() {
    const c = App.comp();
    const btn = (label, title, fn, cls) => E('button', { class: 'tbtn ' + (cls || ''), title, onclick: fn }, label);
    const timeEl = E('span', { class: 'tc', id: 'tcText' });
    const frameEl = E('span', { class: 'tcf', id: 'tcFrame' });
    const zoom = E('input', { type: 'range', min: 20, max: 400, value: App.state.timelineZoom, class: 'zoom', title: '时间缩放' });
    zoom.addEventListener('input', () => {
      App.state.timelineZoom = +zoom.value;
      TL.full();
    });
    const playBtn = btn(App.state.playing ? UI.ICON.pause : UI.ICON.play, '播放 / 暂停 (空格)', () => App.play(), 'play' + (App.state.playing ? ' on' : ''));
    const loopOn = E('label', { class: 'chk', title: '循环工作区' }, [
      E('input', {
        type: 'checkbox',
        checked: App.state.loopWork !== false,
        onchange: (e) => {
          App.state.loopWork = e.target.checked;
        },
      }),
      E('span', { text: '循环' }),
    ]);
    const crumb = E('span', { class: 'muted', text: c.name + ' · ' + c.width + '×' + c.height + ' · ' + c.fps + 'fps · ' + c.duration + 's' });
    const hint = E('span', { class: 'muted small', text: selKeys.length ? '已选 ' + selKeys.length + ' 个关键帧（Delete 删除 · Alt 拖末尾拉伸）' : '' });
    return E('div', { class: 'tl-toolbar' }, [
      btn(UI.ICON.prev, '回到开头 (Home)', () => App.setTime(c.workStart)),
      btn(UI.ICON.stepB, '上一帧 (,)', () => App.setTime(App.state.time - 1 / c.fps)),
      playBtn,
      btn(UI.ICON.stepF, '下一帧 (.)', () => App.setTime(App.state.time + 1 / c.fps)),
      btn(UI.ICON.next, '到结尾 (End)', () => App.setTime(c.workEnd)),
      E('div', { class: 'tcbox' }, [timeEl, frameEl]),
      loopOn,
      hint,
      E('span', { class: 'grow' }),
      crumb,
      E('span', { class: 'muted small', text: '缩放' }),
      zoom,
    ]);
  }

  // ---------- 标尺 ----------
  function ruler(c, width) {
    const pps = App.state.timelineZoom;
    const el = E('div', { class: 'ruler', style: { width: width + 'px' } });
    const step = pickStep(pps);
    for (let t = 0; t <= c.duration + 1e-6; t += step) {
      el.append(E('div', { class: 'tick', style: { left: t * pps + 'px' } }, [E('span', { text: UI.tc(t, c.fps) })]));
    }
    el.append(E('div', { class: 'wa', style: { left: c.workStart * pps + 'px', width: (c.workEnd - c.workStart) * pps + 'px' } }));
    el.addEventListener('mousedown', (e) => {
      seekFrom(e);
      const move = (ev) => seekFrom(ev);
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    function seekFrom(e) {
      const r = el.getBoundingClientRect();
      App.setTime((e.clientX - r.left) / pps);
    }
    return el;
  }
  function pickStep(pps) {
    for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10]) if (s * pps >= 70) return s;
    return 10;
  }

  // ---------- 图层行 ----------
  function selectLayer(id, additive) {
    const st = App.state;
    if (additive) st.selected = st.selected.includes(id) ? st.selected.filter((x) => x !== id) : st.selected.concat([id]);
    else st.selected = [id];
    st.selProp = null;
    App.notify();
    App.requestRender();
  }
  TL.selectLayer = selectLayer;

  function layerRowLeft(comp, layer) {
    const sel = App.state.selected.includes(layer.id);
    const expanded = !!App.state.expandedLayers[layer.id];
    const hasKeys = layerProps(layer).some((p) => p.prop.animated);
    const eye = E('button', { class: 'tbtn small' + (layer.enabled ? ' on' : ''), title: '显示 / 隐藏', onclick: (e) => { e.stopPropagation(); App.mutate('显示开关', () => (App.layer(layer.id).enabled = !layer.enabled)); } }, layer.enabled ? UI.ICON.eye : '○');
    const lock = E('button', { class: 'tbtn small' + (layer.locked ? ' on' : ''), title: '锁定', onclick: (e) => { e.stopPropagation(); App.mutate('锁定', () => (App.layer(layer.id).locked = !layer.locked)); } }, layer.locked ? '🔒' : '·');
    const twirl = E('button', { class: 'tbtn small twirl', title: '展开属性（关键帧）', onclick: (e) => { e.stopPropagation(); App.state.expandedLayers[layer.id] = !expanded; TL.full(); } }, expanded ? '▾' : '▸');
    const chip = E('span', { class: 'chip', style: { background: UI.typeColor[layer.type] || '#888' } });
    const name = E('span', {
      class: 'lname',
      text: layer.name,
      ondblclick: (e) => {
        e.stopPropagation();
        const inp = UI.textInput(layer.name, (v) => App.mutate('重命名', () => (App.layer(layer.id).name = v || layer.name)));
        name.replaceWith(inp);
        inp.focus();
        inp.select();
        inp.addEventListener('blur', () => TL.full());
      },
    });
    const parentName = layer.parent ? (comp.layers.find((l) => l.id === layer.parent) || { name: '?' }).name : '';
    const row = E('div', {
      class: 'lrow-left' + (sel ? ' sel' : '') + (layer.enabled ? '' : ' off') + (layer.locked ? ' locked' : ''),
      style: { height: ROW_H + 'px' },
      data: { layer: layer.id },
      onclick: (e) => selectLayer(layer.id, e.shiftKey || e.ctrlKey),
      ondblclick: () => {
        App.state.expandedLayers[layer.id] = !expanded;
        TL.full();
      },
      onmousedown: (e) => reorderDrag(e, layer.id),
    }, [
      E('span', { class: 'lnum', text: String(comp.layers.indexOf(layer) + 1) }),
      eye,
      lock,
      chip,
      E('span', { class: 'ticon', text: UI.typeIcon[layer.type] || '?' }),
      name,
      twirl,
      parentName ? E('span', { class: 'parentTag', text: '→ ' + parentName }) : null,
      hasKeys ? E('span', { class: 'kdot', title: '有关键帧' }) : null,
    ]);
    return row;
  }

  // 拖动图层行上下移动，松开时插入到目标行所在的位置（层序）
  function reorderDrag(e, layerId) {
    if (e.button !== 0 || (e.target.closest && e.target.closest('button, input'))) return;
    const sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (Math.abs(ev.clientY - sy) > 6) moved = true;
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest ? el.closest('.lrow-left[data-layer]') : null;
      const targetId = target && target.dataset.layer;
      if (!targetId || targetId === layerId) return;
      App.mutate('调整图层顺序', () => {
        const cc = App.comp();
        const from = cc.layers.findIndex((l) => l.id === layerId);
        const to = cc.layers.findIndex((l) => l.id === targetId);
        if (from < 0 || to < 0) return;
        const item = cc.layers.splice(from, 1)[0];
        cc.layers.splice(to, 0, item);
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // 图层时间条：入出点（可拖动整体或两端）
  function layerBar(comp, layer) {
    const pps = App.state.timelineZoom;
    const x0 = layer.inPoint * pps, w = Math.max(4, (layer.outPoint - layer.inPoint) * pps);
    const bar = E('div', { class: 'bar', style: { left: x0 + 'px', width: w + 'px', background: UI.typeColor[layer.type] || '#888' }, title: layer.name + '  入 ' + layer.inPoint.toFixed(2) + 's  出 ' + layer.outPoint.toFixed(2) + 's' });
    const hl = E('div', { class: 'edge l' });
    const hr = E('div', { class: 'edge r' });
    bar.append(hl, hr);
    const drag = (mode) => (e) => {
      e.stopPropagation();
      e.preventDefault();
      App.beginAction();
      const startX = e.clientX;
      const i0 = layer.inPoint, o0 = layer.outPoint, s0 = layer.startTime;
      const fps = comp.fps;
      const move = (ev) => {
        const d = Math.round(((ev.clientX - startX) / pps) * fps) / fps;
        const lay = App.layer(layer.id);
        if (mode === 'move') {
          lay.inPoint = i0 + d;
          lay.outPoint = o0 + d;
          lay.startTime = s0 + d;
        } else if (mode === 'in') {
          lay.inPoint = Math.max(0, Math.min(i0 + d, o0 - 1 / fps));
        } else if (mode === 'out') {
          lay.outPoint = Math.min(comp.duration, Math.max(o0 + d, i0 + 1 / fps));
        }
        App.liveChange();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        App.endAction('调整图层时间');
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
    bar.addEventListener('mousedown', (e) => {
      selectLayer(layer.id, false);
      drag('move')(e);
    });
    hl.addEventListener('mousedown', drag('in'));
    hr.addEventListener('mousedown', drag('out'));
    return bar;
  }

  // ---------- 关键帧 ----------
  // 关键帧菱形：点选 / Shift 加选 / 拖动（选中的整组一起移动）/ Alt 拖动末尾关键帧按比例拉伸
  function keyDiamonds(layer, prop, rowEl) {
    const pps = App.state.timelineZoom;
    if (!prop || !prop.animated) return;
    prop.keys.forEach((k, idx) => {
      const x = (k.t + (layer.startTime || 0)) * pps;
      const d = E('div', {
        class: 'key' + (keySelected(layer.id, prop.id, idx) ? ' sel' : ''),
        style: { left: x + 'px' },
        title: '关键帧 ' + (k.t + (layer.startTime || 0)).toFixed(2) + 's · 拖动 / Shift 加选 / Alt 拖拉伸 / 双击跳转',
        data: { layer: layer.id, prop: prop.id, index: idx },
      });
      d.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        keyPress(e, layer, prop, idx);
      });
      d.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        App.setTime(k.t + (layer.startTime || 0));
      });
      rowEl.appendChild(d);
    });
  }
  function keyPress(e, layer, prop, idx) {
    const already = keySelected(layer.id, prop.id, idx);
    if (e.shiftKey) {
      selKeys = already ? selKeys.filter((k) => !keyIs(k, layer.id, prop.id, idx)) : selKeys.concat([{ layerId: layer.id, propId: prop.id, index: idx }]);
    } else if (!already) {
      selKeys = [{ layerId: layer.id, propId: prop.id, index: idx }];
    }
    App.state.selProp = { layer: layer.id, prop: prop.id, label: prop.kind };
    App.state.graphSel = { prop: prop.id, index: idx };
    if (!keySelected(layer.id, prop.id, idx)) return TL.time();
    startKeyDrag(e, e.altKey && selKeys.length > 1 ? 'stretch' : 'move', idx, layer, prop);
    TL.full();
  }

  // 拖动：记录所有选中关键帧的初始时间，按同一偏移或同一比例更新
  function startKeyDrag(e, mode, idx, layer, prop) {
    const pps = App.state.timelineZoom;
    const fps = App.comp().fps;
    const sx = e.clientX;
    const snap = selKeys.map((s) => {
      const L = App.layer(s.layerId);
      const p = L && UI.findProp(L, s.propId);
      return { s, t0: p && p.keys[s.index] ? p.keys[s.index].t : 0 };
    });
    // 拉伸：以选中关键帧中最早的时间为锚点，末尾关键帧的位置决定比例
    const anchorT = Math.min(...snap.map((x) => x.t0));
    const lastT = Math.max(...snap.map((x) => x.t0));
    App.beginAction();
    const move = (ev) => {
      const dt = (ev.clientX - sx) / pps;
      if (mode === 'move') {
        const d = Math.round(dt * fps) / fps;
        snap.forEach(({ s, t0 }) => {
          const L = App.layer(s.layerId);
          const p = L && UI.findProp(L, s.propId);
          if (!p || !p.keys[s.index]) return;
          p.keys[s.index].t = Math.max(0, t0 + d);
          p.keys.sort((a, b) => a.t - b.t);
        });
      } else {
        const span0 = Math.max(1e-3, lastT - anchorT);
        const k = Math.max(0.05, (span0 + dt) / span0);
        snap.forEach(({ s, t0 }) => {
          const L = App.layer(s.layerId);
          const p = L && UI.findProp(L, s.propId);
          if (!p || !p.keys[s.index]) return;
          p.keys[s.index].t = Math.max(0, anchorT + (t0 - anchorT) * k);
          p.keys.sort((a, b) => a.t - b.t);
        });
      }
      App.liveChange();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      App.endAction(mode === 'move' ? '移动关键帧' : '拉伸关键帧');
      // 关键帧位置变化后，选中索引需与排序后的位置一致
      selKeys = snap.map(({ s }) => s);
      TL.full();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    void idx;
    void layer;
    void prop;
  }

  // 框选：在行区域空白处拖拽，选中矩形内的关键帧
  function startBoxSelect(e, host) {
    const r0 = host.getBoundingClientRect();
    const x0 = e.clientX - r0.left + host.scrollLeft, y0 = e.clientY - r0.top + host.scrollTop;
    boxEl = E('div', { class: 'boxsel' });
    host.appendChild(boxEl);
    const move = (ev) => {
      const x1 = ev.clientX - r0.left + host.scrollLeft, y1 = ev.clientY - r0.top + host.scrollTop;
      boxEl.style.left = Math.min(x0, x1) + 'px';
      boxEl.style.top = Math.min(y0, y1) + 'px';
      boxEl.style.width = Math.abs(x1 - x0) + 'px';
      boxEl.style.height = Math.abs(y1 - y0) + 'px';
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const bx = boxEl.getBoundingClientRect();
      boxEl.remove();
      boxEl = null;
      const found = [];
      host.querySelectorAll('.key').forEach((el) => {
        const kr = el.getBoundingClientRect();
        const cx = (kr.left + kr.right) / 2, cy = (kr.top + kr.bottom) / 2;
        if (cx >= bx.left && cx <= bx.right && cy >= bx.top && cy <= bx.bottom) {
          found.push({ layerId: el.dataset.layer, propId: el.dataset.prop, index: +el.dataset.index });
        }
      });
      if (!ev.shiftKey) selKeys = found;
      else selKeys = selKeys.concat(found.filter((f) => !selKeys.some((s) => keyIs(s, f.layerId, f.propId, f.index))));
      TL.full();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // 每个图层行：时间条 + 关键帧
  function rowRight(comp, row, width) {
    const el = E('div', { class: 'lrow-right' + (row.kind === 'prop' ? ' prop' : ''), style: { height: ROW_H + 'px', width: width + 'px' } });
    if (row.kind === 'layer') {
      el.appendChild(layerBar(comp, row.layer));
      layerProps(row.layer).forEach((pp) => keyDiamonds(row.layer, pp.prop, el));
    } else {
      keyDiamonds(row.layer, row.prop, el);
    }
    return el;
  }

  // 选中关键帧的删除 / 复制 / 粘贴（供快捷键与菜单使用）
  TL.deleteKeys = () => {
    if (!selKeys.length) return false;
    App.mutate('删除关键帧', () => {
      selKeys.forEach((s) => {
        const L = App.layer(s.layerId);
        const p = L && UI.findProp(L, s.propId);
        if (p) p.keys = p.keys.filter((_, i) => i !== s.index);
      });
      App.comp().layers.forEach((l) => {
        // 无关键帧的属性恢复为静态
        const visit = (o) => {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) return o.forEach(visit);
          if (o.kind && o.id && 'v' in o) {
            if (o.animated && !o.keys.length) o.animated = false;
            return;
          }
          Object.keys(o).forEach((k) => visit(o[k]));
        };
        visit(l);
      });
    });
    selKeys = [];
    return true;
  };
  TL.copyKeys = () => {
    if (!selKeys.length) return false;
    const items = selKeys.map((s) => {
      const L = App.layer(s.layerId);
      const p = L && UI.findProp(L, s.propId);
      const k = p && p.keys[s.index];
      return k ? { layerId: s.layerId, propId: s.propId, key: JSON.parse(JSON.stringify(k)), lt: k.t + (L.startTime || 0) } : null;
    }).filter(Boolean);
    const t0 = Math.min(...items.map((i) => i.lt));
    TL.clip = items.map((i) => ({ propId: i.propId, layerId: i.layerId, key: i.key, dt: i.lt - t0 }));
    App.toast('已复制 ' + items.length + ' 个关键帧');
    return true;
  };
  TL.pasteKeys = () => {
    if (!TL.clip || !TL.clip.length) return false;
    const now = App.state.time;
    App.mutate('粘贴关键帧', () => {
      TL.clip.forEach((c) => {
        const L = App.layer(c.layerId) || App.selectedLayer();
        const p = L && UI.findProp(L, c.propId);
        if (!p) return;
        const lt = now - (L.startTime || 0) + c.dt;
        if (!p.animated) Anim.enable(p, lt, p.v);
        Anim.setKey(p, lt, JSON.parse(JSON.stringify(c.key.v)));
        const nk = p.keys.find((x) => Math.abs(x.t - lt) < 1e-4);
        if (nk) Object.assign(nk, { inT: c.key.inT, outT: c.key.outT, inI: c.key.inI, inS: c.key.inS, outI: c.key.outI, outS: c.key.outS });
      });
    });
    return true;
  };

  // ---------- 整体 ----------
  TL.full = () => {
    if (!root || !App.comp()) return;
    const c = App.comp();
    UI.clear(toolbar).appendChild(transport());
    const width = Math.ceil(c.duration * App.state.timelineZoom + 200);
    const rows = sortedRows(c);
    UI.clear(leftCol);
    UI.clear(rightCol);
    leftCol.appendChild(E('div', { class: 'lhead', style: { height: ROW_H + 'px' } }, [E('span', { class: 'muted', text: '图层 (' + c.layers.length + ')' })]));
    rightCol.appendChild(ruler(c, width));
    const rowsWrap = E('div', { class: 'rows' });
    rows.forEach((r) => {
      if (r.kind === 'layer') leftCol.appendChild(layerRowLeft(c, r.layer));
      else leftCol.appendChild(E('div', { class: 'lrow-left prop-label', style: { height: ROW_H + 'px' } }, [E('span', { class: 'indent' }), E('span', { class: 'plabel2', text: r.label })]));
      rowsWrap.appendChild(rowRight(c, r, width));
    });
    rightCol.appendChild(rowsWrap);
    playhead = E('div', { class: 'playhead' });
    rightCol.appendChild(playhead);
    // 空白区域：拖拽为框选，单击为取消选择
    rightCol.addEventListener('mousedown', (e) => {
      if (e.target.closest('.key, .bar, .ruler')) return;
      if (e.target.closest('.lrow-right') || e.target === rightCol || e.target === rowsWrap) {
        if (!e.shiftKey) selKeys = [];
        startBoxSelect(e, rightCol);
      }
    });
    TL.time();
  };
  TL.time = () => {
    if (!root) return;
    const c = App.comp();
    if (!c) return;
    const pps = App.state.timelineZoom;
    if (playhead) playhead.style.left = App.state.time * pps + 'px';
    const tcText = document.getElementById('tcText');
    const tcFrame = document.getElementById('tcFrame');
    if (tcText) tcText.textContent = UI.tc(App.state.time, c.fps);
    if (tcFrame) tcFrame.textContent = '帧 ' + UI.frameOf(App.state.time, c.fps);
    if (App.state.playing && scrollEl) {
      const x = App.state.time * pps;
      if (x < scrollEl.scrollLeft || x > scrollEl.scrollLeft + scrollEl.clientWidth - 40) scrollEl.scrollLeft = x - 80;
    }
  };
  TL.values = () => {};

  TL.init = () => {
    const host = document.getElementById('bottomBody');
    root = E('div', { class: 'timeline' });
    toolbar = E('div', { class: 'tl-toolbar-wrap' });
    const main = E('div', { class: 'tl-main' });
    leftCol = E('div', { class: 'tl-left', style: { width: LEFT_W + 'px' } });
    rightCol = E('div', { class: 'tl-right' });
    scrollEl = rightCol;
    main.append(leftCol, rightCol);
    // 左列（图层名）与右列（时间条）纵向同步滚动
    rightCol.addEventListener('scroll', () => {
      leftCol.scrollTop = rightCol.scrollTop;
    });
    root.append(toolbar, main);
    host.appendChild(root);
    UI.register({ full: () => TL.full(), time: () => TL.time(), values: () => {} });
  };
})();
