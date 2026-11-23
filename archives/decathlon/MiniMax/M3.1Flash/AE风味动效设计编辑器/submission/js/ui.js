/* ============================================================
   ui.js — 界面：项目面板 / 属性 / 时间轴 / 曲线 / 节点 / 画布叠加层
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const UI = AE.ui = {};
  const App = () => AE.app;

  let overlay, octx;
  let dragging = null;      // 画布拖拽状态
  let exprOpen = {};        // 展开表达式的属性
  let expandedLayers = {};
  let activeRightTab = 'prop';
  let activeBottomTab = 'timeline';
  let curveProp = null;
  let curveMode = 'value';

  /* ---------------- 工具 ---------------- */
  function el(tag, cls, txt) { return U.dom(tag, cls, txt); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  UI.toast = function (msg, type) {
    const box = document.getElementById('toast');
    const t = el('div', 'toast-item' + (type ? ' ' + type : ''), msg);
    box.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s'; t.style.opacity = '0';
      setTimeout(() => t.remove(), 320);
    }, 2200);
  };

  /* ---------------- 初始化 ---------------- */
  UI.init = function () {
    overlay = document.getElementById('overlayCanvas');
    octx = overlay.getContext('2d');
    resizeOverlay();

    // 顶栏
    document.querySelectorAll('#topbar [data-act]').forEach(b => {
      b.addEventListener('click', () => topAction(b.dataset.act));
    });
    document.getElementById('projName').addEventListener('change', e => {
      App().pushUndo('重命名工程');
      App().project.name = e.target.value;
    });
    document.getElementById('compSelect').addEventListener('change', e => App().setComp(e.target.value));
    document.querySelectorAll('#viewModes .seg-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#viewModes .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        App().viewMode = b.dataset.view;
      });
    });
    document.querySelectorAll('#stageBar [data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'toggleGrid') { App().showGrid = !App().showGrid; document.getElementById('viewport').classList.toggle('grid-on', App().showGrid); }
        else if (a === 'togglePath') { App().showPath = !App().showPath; b.classList.toggle('on'); }
        else if (a === 'toggle3d') { App().show3d = !App().show3d; b.classList.toggle('on'); }
        else if (a === 'zoomIn') { App().zoom = 'manual'; App().zoomFactor = Math.min(4, App().zoomFactor * 1.25); }
        else if (a === 'zoomOut') { App().zoom = 'manual'; App().zoomFactor = Math.max(0.2, App().zoomFactor / 1.25); }
      });
    });
    // 左侧标签
    document.querySelectorAll('#leftTabs .tab').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#leftTabs .tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      UI.leftTab = b.dataset.tab;
      UI.buildLeft();
    }));
    document.querySelectorAll('#rightTabs .tab').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#rightTabs .tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      activeRightTab = b.dataset.tab;
      UI.buildRight();
    }));
    document.querySelectorAll('#bottomTabs .tab').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#bottomTabs .tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      activeBottomTab = b.dataset.btab;
      document.querySelectorAll('.btab-pane').forEach(p => p.classList.remove('active'));
      const map = { timeline: 'timelinePane', curve: 'curvePane', audio: 'audioPane' };
      document.getElementById(map[b.dataset.btab]).classList.add('active');
      if (b.dataset.btab === 'curve') UI.buildCurve();
      if (b.dataset.btab === 'audio') UI.buildAudio();
    }));
    // 底部曲线模式
    document.getElementById('curveModeValue').addEventListener('click', () => { curveMode = 'value'; UI.buildCurve(); });
    document.getElementById('curveModeSpeed').addEventListener('click', () => { curveMode = 'speed'; UI.buildCurve(); });
    document.getElementById('curvePropSelect').addEventListener('change', e => { curveProp = e.target.value; UI.buildCurve(); });

    // 工程文件
    document.getElementById('projectFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => App().openProject(r.result);
      r.readAsText(f);
    });

    setupCanvasInteraction();
    window.addEventListener('resize', resizeOverlay);
    UI.leftTab = 'layers';
  };

  function resizeOverlay() {
    const v = document.getElementById('viewport');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.max(2, Math.round(v.clientWidth * dpr));
    overlay.height = Math.max(2, Math.round(v.clientHeight * dpr));
    overlay.style.width = v.clientWidth + 'px';
    overlay.style.height = v.clientHeight + 'px';
  }

  function topAction(act) {
    const A = App();
    switch (act) {
      case 'newProject': UI.confirm('新建工程', '当前工程将被清空，确定继续？', () => A.newProject()); break;
      case 'openProject': document.getElementById('projectFile').click(); break;
      case 'saveProject': A.saveProject(); break;
      case 'addComp': A.addComp(); break;
      case 'undo': A.undo(); break;
      case 'redo': A.redo(); break;
      case 'play': A.togglePlay(); break;
      case 'toggleLeft': document.getElementById('leftPanel').classList.toggle('hidden'); resizeOverlay(); break;
      case 'toggleRight': document.getElementById('rightPanel').classList.toggle('hidden'); resizeOverlay(); break;
      case 'toggleBottom': document.getElementById('bottomPanel').classList.toggle('hidden'); resizeOverlay(); break;
    }
  }

  UI.confirm = function (title, text, onOk) {
    const bd = document.getElementById('modalBackdrop');
    const box = document.getElementById('modalBox');
    clear(box);
    box.appendChild(el('h3', '', title));
    box.appendChild(el('div', 'mb-body', text));
    const act = el('div', 'mb-actions');
    const cancel = el('button', 'tb-btn', '取消');
    const ok = el('button', 'tb-btn accent', '确定');
    cancel.onclick = () => bd.classList.add('hidden');
    ok.onclick = () => { bd.classList.add('hidden'); onOk(); };
    act.appendChild(cancel); act.appendChild(ok);
    box.appendChild(act);
    bd.classList.remove('hidden');
  };

  UI.modal = function (title, bodyNode, actions) {
    const bd = document.getElementById('modalBackdrop');
    const box = document.getElementById('modalBox');
    clear(box);
    box.appendChild(el('h3', '', title));
    box.appendChild(bodyNode);
    const act = el('div', 'mb-actions');
    for (const a of (actions || [{ label: '关闭' }])) {
      const b = el('button', 'tb-btn' + (a.primary ? ' accent' : ''), a.label);
      b.onclick = () => { if (a.fn) a.fn(); if (a.close !== false) bd.classList.add('hidden'); };
      act.appendChild(b);
    }
    box.appendChild(act);
    bd.classList.remove('hidden');
  };

  /* ---------------- 刷新 ---------------- */
  UI.refreshAll = function () {
    const A = App();
    UI.buildCompSelect();
    UI.buildLeft();
    UI.buildRight();
    UI.buildTimeline();
    UI.buildCurve();
    UI.buildAudio();
    UI.updateFrame();
    document.getElementById('projName').value = A.project ? A.project.name : '';
  };

  UI.updateFrame = function () {
    const A = App();
    const comp = A.comp;
    if (!comp) return;
    document.getElementById('timeReadout').textContent = U.timecode(A.time, comp.fps);
    document.getElementById('zoomLabel').textContent = A.zoom === 'fit' ? '适应' : Math.round(A.zoomFactor * 100) + '%';
    // 时间轴播放头
    const ph = document.getElementById('playhead');
    if (ph) {
      const track = document.getElementById('tlTrackArea');
      const left = A.time * UI.pxPerSec();
      ph.style.left = left + 'px';
    }
    // 标尺工作区
    const wa = document.getElementById('tlWorkArea');
    if (wa) {
      wa.style.left = (comp.workStart * UI.pxPerSec()) + 'px';
      wa.style.width = ((comp.workEnd - comp.workStart) * UI.pxPerSec()) + 'px';
    }
    UI.updateInspectorValues();
  };

  UI.pxPerSec = function () {
    const A = App();
    const track = document.getElementById('tlTrackArea');
    const w = track ? track.clientWidth : 800;
    return w / Math.max(0.5, (A.comp ? A.comp.duration : 10));
  };

  /* ---------------- 合成选择 ---------------- */
  UI.buildCompSelect = function () {
    const A = App();
    const sel = document.getElementById('compSelect');
    clear(sel);
    for (const c of A.project.comps) {
      const o = el('option', '', `${c.name}  ${c.w}×${c.h}`);
      o.value = c.id;
      if (c.id === A.comp.id) o.selected = true;
      sel.appendChild(o);
    }
  };

  /* ---------------- 左侧面板 ---------------- */
  UI.buildLeft = function () {
    const body = document.getElementById('leftBody');
    clear(body);
    const A = App();
    if (UI.leftTab === 'layers') {
      // 合成列表
      const comps = el('div', 'comp-list');
      for (const c of A.project.comps) {
        const item = el('div', 'comp-item' + (c.id === A.comp.id ? ' active' : ''));
        item.appendChild(el('span', 'ci-name', '▣ ' + c.name));
        item.appendChild(el('span', 'ci-meta', `${c.w}×${c.h} ${c.fps}fps`));
        item.onclick = () => A.setComp(c.id);
        comps.appendChild(item);
      }
      body.appendChild(comps);
      // 图层树
      const tree = el('div', 'layer-list');
      for (const layer of A.comp.layers) {
        tree.appendChild(layerRow(layer));
      }
      body.appendChild(tree);
      // 添加图层按钮
      const add = el('div', 'hintline');
      add.innerHTML = '点击 <span class="kbd">＋</span> 新建图层：形状 / 文字 / 空对象 / 三维 / 粒子 / 灯光 / 摄像机';
      body.appendChild(add);
    } else if (UI.leftTab === 'assets') {
      body.appendChild(el('div', 'hintline', '资源库：工程内可复用的素材。当前版本内置：'));
      const list = el('div', 'mdl-list');
      const items = [['形状图层', 'shape'], ['文字图层', 'text'], ['三维实体', 'solid3d'], ['粒子系统', 'particle'], ['灯光', 'light'], ['摄像机', 'camera'], ['调整层', 'adjustment'], ['音色', 'audio']];
      for (const [label, type] of items) {
        const it = el('div', 'mdl-item', label);
        it.onclick = () => { A.pushUndo('新建图层'); const l = AE.model.createLayer(type, label, A.comp); A.comp.layers.unshift(l); A.selection = [l.id]; UI.refreshAll(); };
        list.appendChild(it);
      }
      body.appendChild(list);
      body.appendChild(el('div', 'hintline', '字体支持范围：系统已安装的中英文字体（微软雅黑 / 黑体 / 宋体 / 楷体等）。字形轮廓由本机字体光栅化后矢量化得到，可参与填充、布尔、形变与三维挤出。'));
    } else {
      body.appendChild(el('div', 'hintline', '锻字工坊 · AE 风味动效设计编辑器'));
      const lines = [
        '· 空格 播放/暂停，F9 缓入缓出，Ctrl+Shift+C 预合成，Ctrl+Z 撤销',
        '· 时间轴、属性、曲线、节点是同一工程的不同视图',
        '· 示例工程《锻字》15 秒：写成 → 成块 → 锻打 → 冷却',
        '· 所有几何、材质、模拟均由工程数据实时生成'
      ];
      for (const l of lines) body.appendChild(el('div', 'hintline', l));
    }
  };

  function layerRow(layer) {
    const A = App();
    const info = AE.model.typeInfo(layer.type);
    const row = el('div', 'layer-row' + (A.selection.includes(layer.id) ? ' sel' : '') + (layer.locked ? ' locked' : ''));
    const eye = el('span', 'lr-eye' + (layer.enabled ? '' : ' off'), layer.enabled ? '◉' : '○');
    eye.onclick = e => { e.stopPropagation(); A.pushUndo('显隐'); layer.enabled = !layer.enabled; UI.refreshAll(); };
    row.appendChild(eye);
    const badge = el('span', 'lr-type', info.icon);
    badge.style.color = info.color;
    badge.title = info.label;
    row.appendChild(badge);
    const name = el('span', 'lr-name', layer.name);
    name.ondblclick = () => {
      A.pushUndo('重命名');
      const inp = el('input');
      inp.value = layer.name;
      name.textContent = '';
      name.appendChild(inp);
      inp.focus(); inp.select();
      inp.onblur = () => { layer.name = inp.value || layer.name; UI.refreshAll(); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
    };
    row.appendChild(name);
    if (layer.threeD) row.appendChild(el('span', 'lr-badge', '3D'));
    if (layer.parent) row.appendChild(el('span', 'lr-tag', '↳'));
    row.onclick = e => { A.select(layer.id, e.ctrlKey || e.metaKey); };
    row.ondblclick = () => { expandedLayers[layer.id] = !expandedLayers[layer.id]; UI.buildTimeline(); };
    return row;
  }

  /* ---------------- 属性面板 ---------------- */
  function propRow(label, ctl, opts) {
    opts = opts || {};
    const row = el('div', 'row');
    row.appendChild(el('label', '', label));
    const c = el('div', 'ctl');
    c.appendChild(ctl);
    row.appendChild(c);
    if (opts.stopwatch !== false) {
      const sw = el('button', 'stopwatch' + (opts.animated ? ' anim' : '') + (opts.expr ? ' expr' : ''), opts.expr ? 'fx' : '◷');
      sw.title = opts.expr ? '表达式（点击编辑）' : (opts.animated ? '停止动画' : '添加关键帧');
      sw.onclick = opts.onStopwatch;
      row.appendChild(sw);
    }
    return row;
  }

  function numInput(value, onChange, opts) {
    opts = opts || {};
    const inp = el('input', 'num');
    inp.value = opts.fmt ? opts.fmt(value) : U.round(value, 3);
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v)) onChange(v);
    });
    U.makeNumeric(inp, () => parseFloat(inp.value) || 0, v => { inp.value = opts.fmt ? opts.fmt(v) : U.round(v, 3); }, {
      step: opts.step || 1, min: opts.min, max: opts.max,
      commit: opts.commit
    });
    return inp;
  }

  /* 属性面板数值随时间轴刷新 */
  UI._updaters = [];
  UI.updateInspectorValues = function () {
    const A = App();
    for (const fn of UI._updaters) {
      try { fn(A.time); } catch (e) { }
    }
  };

  UI.buildRight = function () {
    const body = document.getElementById('rightBody');
    clear(body);
    UI._updaters = [];
    const A = App();
    const tools = document.getElementById('rightTools');
    clear(tools);
    if (activeRightTab === 'node') { UI.buildNodeEditor(body); return; }
    if (activeRightTab === 'effect') { UI.buildEffects(body); return; }
    if (activeRightTab === 'anim') { UI.buildAnimTab(body); return; }

    const sel = A.selectedLayers();
    if (!sel.length) {
      body.appendChild(el('div', 'hintline', '未选择图层。\n在左侧项目面板或画布中选择一个图层以查看属性。'));
      const comp = A.comp;
      body.appendChild(el('div', 'prop-group open', ''));
      const g = body.lastChild;
      const h = el('header', '', '<span class="tw">▶</span>合成设置');
      const b = el('div', 'pg-body');
      g.appendChild(h); g.appendChild(b);
      b.appendChild(propRow('尺寸', textCtl(`${comp.w} × ${comp.h}`, () => { }, false)));
      b.appendChild(propRow('帧率', textCtl(comp.fps + ' fps', () => { }, false)));
      b.appendChild(propRow('时长', numInput(comp.duration, v => { A.pushUndo('时长'); comp.duration = Math.max(0.5, v); UI.refreshAll(); }, { step: 0.1, min: 0.5 })));
      b.appendChild(propRow('工作区', textCtl(`${U.round(comp.workStart, 2)}s → ${U.round(comp.workEnd, 2)}s`, () => { }, false)));
      b.appendChild(propRow('背景色', colorCtl(comp.bgColor, v => { A.pushUndo('背景色'); comp.bgColor = v; })));
      const mb = comp.motionBlur || (comp.motionBlur = { enabled: false, shutter: 180, phase: 50 });
      b.appendChild(propRow('运动模糊', toggleCtl(mb.enabled, v => { A.pushUndo('运动模糊'); mb.enabled = v; UI.refreshAll(); })));
      b.appendChild(propRow('快门角度', numInput(mb.shutter, v => { A.pushUndo('快门'); mb.shutter = v; }, { step: 5, min: 0, max: 360 })));
      b.appendChild(propRow('快门相位', numInput(mb.phase, v => { A.pushUndo('相位'); mb.phase = v; }, { step: 5, min: 0, max: 100 })));
      return;
    }
    const layer = sel[0];
    // 头部
    const head = el('div', 'prop-group open');
    const h = el('header', '', `<span class="tw">▶</span>${AE.model.typeInfo(layer.type).label} · ${layer.name}`);
    const b = el('div', 'pg-body');
    head.appendChild(h); head.appendChild(b);
    b.appendChild(propRow('名称', textCtl(layer.name, v => { A.pushUndo('重命名'); layer.name = v; UI.refreshAll(); }, true)));
    b.appendChild(propRow('混合模式', selectCtl(AE.model.BLEND_MODES.map(m => [m.id, m.label]), layer.blendMode, v => { A.pushUndo('混合模式'); layer.blendMode = v; UI.refreshAll(); })));
    b.appendChild(propRow('三维图层', toggleCtl(layer.threeD, v => { A.pushUndo('三维'); layer.threeD = v; UI.refreshAll(); })));
    b.appendChild(propRow('入点', numInput(layer.inPoint, v => { A.pushUndo('入点'); layer.inPoint = v; }, { step: 1 / 30 })));
    b.appendChild(propRow('出点', numInput(layer.outPoint, v => { A.pushUndo('出点'); layer.outPoint = v; }, { step: 1 / 30 })));
    const parentOpts = [['', '无']].concat(A.comp.layers.filter(l => l.id !== layer.id).map(l => [l.id, l.name]));
    b.appendChild(propRow('父级', selectCtl(parentOpts, layer.parent || '', v => { A.pushUndo('父级'); layer.parent = v || null; UI.refreshAll(); })));
    body.appendChild(head);

    // 变换
    const tg = group('变换', true);
    const defs = AE.model.DEFS.__transform || [];
    for (const d of defs) {
      if (d.three && !layer.threeD) continue;
      tg.body.appendChild(buildPropRow(layer, d));
    }
    body.appendChild(tg.el);

    // 类型专属
    const tdefs = (AE.model.DEFS[layer.type] || []).filter(d => d.key !== 'mat3d');
    if (tdefs.length) {
      const g2 = group(layer.type === 'shape' ? '几何与材质' : AE.model.typeInfo(layer.type).label, true);
      for (const d of tdefs) g2.body.appendChild(buildPropRow(layer, d));
      body.appendChild(g2.el);
    }

    // 蒙版
    const mg = group('蒙版 (' + (layer.masks || []).length + ')', false);
    const addMask = el('button', 'pill', '＋ 添加蒙版');
    addMask.onclick = () => {
      A.pushUndo('添加蒙版');
      layer.masks = layer.masks || [];
      layer.masks.push({
        id: AE.model.newId('mask'), type: 'rect',
        x: -200, y: -120, w: 400, h: 240, r: 0,
        mode: 'add', inverted: false, opacity: 100, feather: 0
      });
      UI.refreshAll();
    };
    mg.body.appendChild(addMask);
    (layer.masks || []).forEach((m, i) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', '蒙版 ' + (i + 1)));
      const c = el('div', 'ctl');
      c.appendChild(selectCtl([['add', '相加'], ['subtract', '相减'], ['intersect', '相交'], ['none', '无']], m.mode, v => { A.pushUndo('蒙版模式'); m.mode = v; UI.refreshAll(); }));
      row.appendChild(c);
      const del = el('button', 'mini', '×');
      del.onclick = () => { A.pushUndo('删除蒙版'); layer.masks.splice(i, 1); UI.refreshAll(); };
      row.appendChild(del);
      mg.body.appendChild(row);
      const row2 = el('div', 'row');
      row2.appendChild(el('label', '', '反转'));
      row2.appendChild(el('div', 'ctl')).appendChild(toggleCtl(!!m.inverted, v => { A.pushUndo('反转'); m.inverted = v; UI.refreshAll(); }));
      mg.body.appendChild(row2);
    });
    body.appendChild(mg.el);

    // 效果入口
    const eg = group('效果 (' + (layer.effects || []).length + ')', false);
    const addFx = el('button', 'pill', '＋ 添加效果');
    addFx.onclick = () => UI.effectPicker(layer);
    eg.body.appendChild(addFx);
    (layer.effects || []).forEach((fx, i) => {
      const r = el('div', 'row');
      r.appendChild(el('label', '', fx.type));
      const c = el('div', 'ctl');
      c.appendChild(el('span', 'hintline', fx.enabled === false ? '（已停用）' : ''));
      r.appendChild(c);
      const up = el('button', 'mini', '↑'); up.onclick = () => { A.pushUndo('效果排序'); const t = layer.effects[i - 1]; layer.effects[i - 1] = fx; layer.effects[i] = t; UI.refreshAll(); };
      const dn = el('button', 'mini', '↓'); dn.onclick = () => { A.pushUndo('效果排序'); const t = layer.effects[i + 1]; layer.effects[i + 1] = fx; layer.effects[i] = t; UI.refreshAll(); };
      const del = el('button', 'mini', '×'); del.onclick = () => { A.pushUndo('删除效果'); layer.effects.splice(i, 1); UI.refreshAll(); };
      r.appendChild(up); r.appendChild(dn); r.appendChild(del);
      eg.body.appendChild(r);
    });
    body.appendChild(eg.el);

    // 错误提示
    if (A.errors && A.errors.length) {
      const err = el('div', 'err', '表达式错误：' + A.errors.map(e => `${e.layer}.${e.prop} — ${e.message}`).join('\n'));
      body.appendChild(err);
    }
  }

  function group(title, open) {
    const g = el('div', 'prop-group' + (open ? ' open' : ''));
    const h = el('header', '', `<span class="tw">▶</span>${title}`);
    const b = el('div', 'pg-body');
    h.onclick = () => g.classList.toggle('open');
    g.appendChild(h); g.appendChild(b);
    return { el: g, body: b };
  }

  function textCtl(value, onChange, editable) {
    const inp = el('input', 'txt');
    inp.value = value;
    if (!editable) { inp.readOnly = true; inp.style.opacity = .7; }
    inp.onchange = () => onChange(inp.value);
    inp.onkeydown = e => e.stopPropagation();
    return inp;
  }
  function selectCtl(options, value, onChange) {
    const s = el('select', 'pill');
    for (const [v, label] of options) {
      const o = el('option', '', label); o.value = v;
      if (v === value) o.selected = true;
      s.appendChild(o);
    }
    s.onchange = () => onChange(s.value);
    s.onkeydown = e => e.stopPropagation();
    return s;
  }
  function toggleCtl(value, onChange) {
    const b = el('button', 'pill' + (value ? ' on' : ''), value ? '开' : '关');
    b.onclick = () => { onChange(!value); };
    return b;
  }
  function colorCtl(value, onChange) {
    const wrap = el('div', 'vecbox');
    const sw = el('input', 'swatch');
    sw.type = 'color'; sw.value = value;
    sw.oninput = () => onChange(sw.value);
    const txt = el('input', 'num');
    txt.value = value;
    txt.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) { sw.value = txt.value; onChange(txt.value); } };
    wrap.appendChild(sw); wrap.appendChild(txt);
    return wrap;
  }

  /** 属性行（含关键帧开关与表达式） */
  function buildPropRow(layer, def) {
    const A = App();
    const p = layer.props[def.key] || (layer.props[def.key] = { v: def.def, tr: null, ex: null });
    const animated = !!(p.tr && p.tr.keys.length);
    let ctl;
    const commit = () => { UI.refreshTimeline(); UI.buildCurve(); };
    const setVal = v => {
      A.pushUndo('修改 ' + def.label);
      if (animated) {
        const tr = p.tr;
        const k = AE.anim.getKey(tr, A.time);
        if (k) { k.v = v; AE.anim.refreshHandles(tr); }
        else AE.anim.addKey(tr, A.time, v);
      } else {
        p.v = v;
      }
      commit();
    };
    const inputs = [];
    if (def.type === 'num' || def.type === 'angle' || def.type === 'percent') {
      const inp = numInput(typeof p.v === 'number' ? p.v : 0, setVal, { step: def.step || 1, min: def.min, max: def.max, commit });
      inputs.push(inp);
      ctl = inp;
    } else if (def.type === 'vec2' || def.type === 'vec3') {
      const box = el('div', 'vecbox');
      const n = def.type === 'vec2' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const inp = numInput(p.v[i], v => {
          const nv = p.v.slice(); nv[i] = v; setVal(nv);
        }, { step: def.step || 1, commit });
        inputs.push(inp);
        box.appendChild(inp);
      }
      ctl = box;
    } else if (def.type === 'color') {
      ctl = colorCtl(p.v, setVal);
    } else if (def.type === 'bool') {
      ctl = toggleCtl(!!p.v, setVal);
    } else if (def.type === 'select') {
      ctl = selectCtl(def.options || [], p.v, setVal);
    } else if (def.type === 'text') {
      const inp = el('input', 'txt');
      inp.value = p.v || '';
      inp.onchange = () => setVal(inp.value);
      inp.onkeydown = e => e.stopPropagation();
      ctl = inp;
    } else {
      ctl = textCtl(String(p.v), () => { });
    }
    const row = propRow(def.label, ctl, {
      animated, expr: !!p.ex,
      onStopwatch: () => {
        A.pushUndo('关键帧');
        if (animated && !p.ex) {
          // 关闭动画
          p.tr = null;
        } else if (animated) {
          p.tr.keys = p.tr.keys.filter(k => Math.abs(k.t - A.time) > 1e-4);
          if (!p.tr.keys.length) p.tr = null;
        } else {
          p.tr = { keys: [], spatial: def.key === 'position' };
          AE.anim.addKey(p.tr, A.time, p.v);
        }
        UI.refreshAll();
      }
    });
    row.dataset.prop = def.key;
    row.dataset.layer = layer.id;
    // 随时间刷新数值
    if (inputs.length) {
      UI._updaters.push(t => {
        const cur = AE.scene.evalProp(layer, def.key, t, { comp: A.comp, project: A.project, errors: [] });
        if (cur === undefined || cur === null) return;
        if (Array.isArray(cur)) {
          inputs.forEach((inp, i) => { if (cur[i] !== undefined && document.activeElement !== inp) inp.value = U.round(cur[i], 3); });
        } else if (typeof cur === 'number') {
          if (document.activeElement !== inputs[0]) inputs[0].value = U.round(cur, 3);
        }
      });
    }
    // 表达式展开
    if (p.ex || exprOpen[def.key]) {
      const box = el('div', 'expr-line');
      const ta = el('textarea', 'txt');
      ta.value = p.ex || '';
      ta.placeholder = '例如：wiggle(2, 20)  或  thisComp.layer("控制器").transform.rotation';
      ta.onkeydown = e => e.stopPropagation();
      ta.onchange = () => {
        A.pushUndo('表达式');
        p.ex = ta.value.trim() ? ta.value.trim() : null;
        UI.refreshAll();
      };
      box.appendChild(ta);
      box.appendChild(el('span', 'badge', 'EXPR'));
      const wrap = el('div', 'row');
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = 'stretch';
      wrap.appendChild(box);
      const errs = (App().errors || []).filter(e => e.prop === def.key && e.layer === layer.name);
      if (errs.length) wrap.appendChild(el('div', 'err', errs[0].message));
      row.parentNode ? null : null;
      row.appendChild(wrap);
    } else {
      const fx = el('button', 'mini', 'fx');
      fx.title = '添加表达式';
      fx.onclick = () => { exprOpen[def.key] = true; UI.buildRight(); };
      row.appendChild(fx);
    }
    return row;
  }

  /* ---------------- 效果面板 ---------------- */
  const EFFECT_DEFS = {
    gaussianBlur: { label: '高斯模糊', props: [['blurRadius', '半径', 10]] },
    glow: { label: '发光', props: [['glowRadius', '半径', 24], ['glowThreshold', '阈值', 0.55]] },
    dropShadow: { label: '投影', props: [['shadowDistance', '距离', 12], ['shadowBlur', '柔化', 8], ['shadowOpacity', '不透明度', 0.65], ['shadowColor', '颜色', '#000000']] },
    hsl: { label: '色相/饱和度/亮度', props: [['hue', '色相', 0], ['saturation', '饱和度', 0], ['lightness', '亮度', 0]] }
  };
  UI.effectPicker = function (layer) {
    const body = el('div', '');
    body.appendChild(el('div', 'hintline', '选择要添加的效果：'));
    const list = el('div', 'mdl-list');
    for (const k in EFFECT_DEFS) {
      const it = el('div', 'mdl-item', EFFECT_DEFS[k].label);
      it.onclick = () => {
        App().pushUndo('添加效果');
        const fx = { id: AE.model.newId('fx'), type: k, enabled: true, props: {} };
        for (const [pk, pl, pv] of EFFECT_DEFS[k].props) fx.props[pk] = { v: pv, tr: null, ex: null };
        layer.effects = layer.effects || [];
        layer.effects.push(fx);
        document.getElementById('modalBackdrop').classList.add('hidden');
        UI.refreshAll();
      };
      list.appendChild(it);
    }
    body.appendChild(list);
    UI.modal('添加效果', body, [{ label: '关闭' }]);
  };

  UI.buildEffects = function (body) {
    const A = App();
    const sel = A.selectedLayers();
    if (!sel.length) { body.appendChild(el('div', 'hintline', '选择图层后在此编辑效果。')); return; }
    const layer = sel[0];
    const g = group('效果 (' + (layer.effects || []).length + ')', true);
    const add = el('button', 'pill', '＋ 添加效果');
    add.onclick = () => UI.effectPicker(layer);
    g.body.appendChild(add);
    (layer.effects || []).forEach((fx, i) => {
      const def = EFFECT_DEFS[fx.type] || { label: fx.type, props: [] };
      const sub = el('div', 'prop-group open');
      sub.style.margin = '4px 0';
      const h = el('header', '', `<span class="tw">▶</span>${def.label}`);
      const b = el('div', 'pg-body');
      h.onclick = () => sub.classList.toggle('open');
      sub.appendChild(h); sub.appendChild(b);
      for (const [pk, pl, pv] of def.props) {
        const p = fx.props[pk] || (fx.props[pk] = { v: pv, tr: null, ex: null });
        const row = el('div', 'row');
        row.appendChild(el('label', '', pl));
        const c = el('div', 'ctl');
        if (pk === 'shadowColor') c.appendChild(colorCtl(p.v, v => { A.pushUndo('效果参数'); p.v = v; }));
        else c.appendChild(numInput(p.v, v => { A.pushUndo('效果参数'); p.v = v; }, { step: 0.5 }));
        row.appendChild(c);
        b.appendChild(row);
      }
      const row2 = el('div', 'row');
      row2.appendChild(el('label', '', '启用'));
      row2.appendChild(el('div', 'ctl')).appendChild(toggleCtl(fx.enabled !== false, v => { A.pushUndo('效果开关'); fx.enabled = v; }));
      b.appendChild(row2);
      g.body.appendChild(sub);
    });
    body.appendChild(g.el);
  };

  /* ---------------- 动画面板 ---------------- */
  UI.buildAnimTab = function (body) {
    const A = App();
    const sel = A.selectedLayers();
    if (!sel.length) { body.appendChild(el('div', 'hintline', '选择图层后查看其动画属性。')); return; }
    const layer = sel[0];
    const g = group('已动画化的属性', true);
    let any = false;
    for (const key in layer.props) {
      const p = layer.props[key];
      if (!p.tr || !p.tr.keys.length) continue;
      any = true;
      const def = AE.model.findDef(layer, key) || { label: key, type: 'num' };
      const row = el('div', 'row');
      row.appendChild(el('label', '', def.label));
      const c = el('div', 'ctl');
      c.appendChild(el('span', 'hintline', `${p.tr.keys.length} 个关键帧${p.ex ? ' · 表达式' : ''}`));
      row.appendChild(c);
      const del = el('button', 'mini', '×');
      del.onclick = () => { A.pushUndo('删除动画'); p.tr = null; UI.refreshAll(); };
      row.appendChild(del);
      g.body.appendChild(row);
      // 关键帧列表
      const kr = el('div', 'row');
      kr.appendChild(el('label', '', '关键帧'));
      const kc = el('div', 'ctl');
      const chips = el('div', 'mdl-list');
      for (const k of p.tr.keys) {
        const chip = el('div', 'mdl-item' + (App().selectedKeys.some(s => s.prop === key && Math.abs(s.t - k.t) < 1e-4) ? ' on' : ''), U.round(k.t, 2) + 's');
        chip.onclick = e => {
          App().selectedKeys = [{ layerId: layer.id, prop: key, t: k.t }];
          A.setTime(k.t);
          UI.refreshAll();
        };
        chips.appendChild(chip);
      }
      kc.appendChild(chips);
      kr.appendChild(kc);
      g.body.appendChild(kr);
    }
    if (!any) g.body.appendChild(el('div', 'hintline', '该图层尚无关键帧。点击属性右侧的秒表按钮即可在当前时间添加关键帧。'));
    body.appendChild(g.el);

    const g2 = group('表达式', true);
    const list = el('div', 'mdl-list');
    for (const key in layer.props) {
      if (!layer.props[key].ex) continue;
      const def = AE.model.findDef(layer, key) || { label: key };
      const it = el('div', 'mdl-item', def.label);
      it.onclick = () => { exprOpen[key] = true; UI.buildRight(); };
      list.appendChild(it);
    }
    g2.body.appendChild(list);
    if (!g2.body.children.length) g2.body.appendChild(el('div', 'hintline', '在属性面板中点击 fx 可为属性编写表达式。'));
    body.appendChild(g2.el);
  };

  /* ---------------- 时间轴 ---------------- */
  UI.refreshTimeline = function () { UI.buildTimeline(); };

  UI.buildTimeline = function () {
    const A = App();
    const list = document.getElementById('tlLayerList');
    const area = document.getElementById('tlTrackArea');
    if (!list || !area) return;
    clear(list); clear(area);
    const pps = UI.pxPerSec();
    // 标尺
    const marks = document.getElementById('tlRulerMarks');
    clear(marks);
    const comp = A.comp;
    const dur = comp.duration;
    const step = dur > 12 ? 1 : (dur > 4 ? 0.5 : 0.25);
    for (let t = 0; t <= dur + 1e-6; t += step) {
      const m = el('div', '');
      m.style.position = 'absolute';
      m.style.left = (t * pps) + 'px';
      m.style.top = '0px';
      m.style.width = '1px';
      m.style.height = (t % 1 === 0) ? '11px' : '6px';
      m.style.background = t % 1 === 0 ? '#5b6a7c' : '#39434f';
      m.style.bottom = 'auto';
      marks.appendChild(m);
      if (t % 1 === 0) {
        const lb = el('div', '', t + 's');
        lb.style.position = 'absolute';
        lb.style.left = (t * pps + 3) + 'px';
        lb.style.top = '0px';
        lb.style.fontSize = '9px';
        lb.style.color = '#5f6d7e';
        marks.appendChild(lb);
      }
    }
    // 图层行
    const head = el('div', 'tl-row tl-row-head');
    head.appendChild(el('span', 't-expand', ''));
    head.appendChild(el('span', 't-name', '图层'));
    list.appendChild(head);
    area.appendChild(head.cloneNode(true));
    for (const layer of comp.layers) {
      const row = el('div', 'tl-row' + (A.selection.includes(layer.id) ? ' sel' : ''));
      const eye = el('span', 't-eye' + (layer.enabled ? '' : ' off'), layer.enabled ? '◉' : '○');
      eye.onclick = e => { e.stopPropagation(); A.pushUndo('显隐'); layer.enabled = !layer.enabled; UI.refreshAll(); };
      row.appendChild(el('span', 't-expand', expandedLayers[layer.id] ? '▾' : '▸'));
      row.appendChild(eye);
      row.appendChild(el('span', 't-name', layer.name));
      row.onclick = e => { A.select(layer.id, e.ctrlKey); };
      list.appendChild(row);
      const arow = el('div', 'tl-row');
      arow.appendChild(el('span', 't-expand', ''));
      const clip = el('div', 'tl-clip');
      clip.style.left = (layer.inPoint * pps) + 'px';
      clip.style.width = Math.max(2, (layer.outPoint - layer.inPoint) * pps) + 'px';
      arow.appendChild(clip);
      area.appendChild(arow);
      // 关键帧（所有图层）
      for (const key in layer.props) {
        const p = layer.props[key];
        if (!p.tr || !p.tr.keys.length) continue;
        const def = AE.model.findDef(layer, key) || { label: key };
        const krow = el('div', 'tl-row');
        krow.appendChild(el('span', 't-expand', ''));
        krow.appendChild(el('span', 't-name', '  ' + def.label));
        krow.style.color = '#8d9bad';
        area.appendChild(krow);
        for (const k of p.tr.keys) {
          const kf = el('div', 'kf' + (p.ex ? ' expr' : '') + (A.selectedKeys.some(s => s.layerId === layer.id && s.prop === key && Math.abs(s.t - k.t) < 1e-4) ? ' sel' : ''));
          kf.style.left = (k.t * pps) + 'px';
          kf.title = `${layer.name} · ${def.label} · ${U.round(k.t, 3)}s`;
          kf.onmousedown = e => startKeyDrag(e, layer, key, k);
          krow.appendChild(kf);
        }
      }
    }
    // 播放头
    const ph = el('div', 'playhead');
    ph.id = 'playhead';
    ph.style.left = (A.time * pps) + 'px';
    area.appendChild(ph);
    // 标尺擦洗
    const ruler = document.getElementById('tlRuler');
    ruler.onmousedown = e => {
      const scrub = ev => {
        const rect = document.getElementById('tlTrackArea').getBoundingClientRect();
        const x = ev.clientX - rect.left + document.getElementById('tlTrackArea').scrollLeft;
        A.setTime(x / UI.pxPerSec());
      };
      scrub(e);
      const mv = ev => scrub(ev);
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };
  };

  function startKeyDrag(e, layer, key, k) {
    e.stopPropagation();
    const A = App();
    A.pushUndo('移动关键帧');
    A.selectedKeys = [{ layerId: layer.id, prop: key, t: k.t }];
    const tr = layer.props[key].tr;
    const startX = e.clientX, startT = k.t;
    const pps = UI.pxPerSec();
    const mv = ev => {
      const dt = (ev.clientX - startX) / pps;
      k.t = Math.max(0, Math.round((startT + dt) * A.comp.fps) / A.comp.fps);
      tr.keys.sort((a, b) => a.t - b.t);
      AE.anim.refreshHandles(tr);
      A.setTime(k.t);
      UI.buildTimeline();
    };
    const up = () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      UI.refreshAll();
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }

  /* ---------------- 曲线编辑器 ---------------- */
  UI.buildCurve = function () {
    const A = App();
    const sel = document.getElementById('curvePropSelect');
    const wrap = document.getElementById('curveCanvasWrap');
    const info = document.getElementById('curveInfo');
    if (!sel) return;
    clear(sel); clear(info);
    const layer = A.selectedLayers()[0];
    if (!layer) { info.appendChild(el('div', 'hintline', '选择图层以编辑曲线。')); return; }
    const props = [];
    for (const key in layer.props) {
      const p = layer.props[key];
      if (p.tr && p.tr.keys.length) props.push(key);
    }
    if (!props.length) { info.appendChild(el('div', 'hintline', '该图层没有关键帧。')); UI.drawCurve(null); return; }
    if (!curveProp || !props.includes(curveProp)) curveProp = props[0];
    for (const key of props) {
      const def = AE.model.findDef(layer, key) || { label: key };
      const o = el('option', '', def.label);
      o.value = key;
      if (key === curveProp) o.selected = true;
      sel.appendChild(o);
    }
    const p = layer.props[curveProp];
    const def = AE.model.findDef(layer, curveProp) || { label: curveProp };
    info.appendChild(el('div', 'hintline', `<b>${layer.name}</b> · ${def.label}`));
    const stat = el('div', 'hintline');
    stat.id = 'curveStat';
    info.appendChild(stat);
    // 插值设置
    const interp = el('div', 'mdl-list');
    [['bezier', '贝塞尔'], ['linear', '线性'], ['hold', '定格']].forEach(([v, label]) => {
      const it = el('div', 'mdl-item', label);
      it.onclick = () => {
        A.pushUndo('插值');
        const times = A.selectedKeys.filter(s => s.layerId === layer.id && s.prop === curveProp).map(s => s.t);
        AE.anim.setInterpolation(p.tr, times.length ? times : null, v, null);
        UI.buildCurve();
      };
      interp.appendChild(it);
    });
    info.appendChild(el('div', 'hintline', '插值：'));
    info.appendChild(interp);
    const ease = el('div', 'mdl-list');
    U.easeNames.forEach(n => {
      const it = el('div', 'mdl-item', n);
      it.onclick = () => {
        A.pushUndo('缓动');
        const times = A.selectedKeys.filter(s => s.layerId === layer.id && s.prop === curveProp).map(s => s.t);
        for (const k of p.tr.keys) {
          if (!times.length || times.some(t => Math.abs(t - k.t) < 1e-4)) { k.inEase = n; k.outEase = n; }
        }
        UI.buildCurve();
      };
      ease.appendChild(it);
    });
    info.appendChild(el('div', 'hintline', '缓动：'));
    info.appendChild(ease);
    const sp = el('button', 'pill' + (p.tr.spatial ? ' on' : ''), '空间路径');
    sp.onclick = () => {
      A.pushUndo('空间路径');
      p.tr.spatial = !p.tr.spatial;
      if (p.tr.spatial) AE.anim.autoSpatial(p.tr);
      UI.buildCurve();
    };
    info.appendChild(sp);
    UI.drawCurve({ layer, prop: curveProp, track: p.tr, mode: curveMode });
  };

  UI.drawCurve = function (ctxInfo) {
    const cv = document.getElementById('curveCanvas');
    if (!cv) return;
    const wrap = cv.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(2, wrap.clientWidth * dpr);
    cv.height = Math.max(2, wrap.clientHeight * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#101620'; g.fillRect(0, 0, W, H);
    if (!ctxInfo) return;
    const A = App();
    const track = ctxInfo.track;
    const t0 = 0, t1 = Math.max(0.5, A.comp.duration);
    const samples = AE.anim.sampleCurve(track, t0, t1, 200, ctxInfo.mode);
    let vmin = Infinity, vmax = -Infinity;
    for (const s of samples) { vmin = Math.min(vmin, s[1]); vmax = Math.max(vmax, s[1]); }
    if (!isFinite(vmin)) { vmin = 0; vmax = 1; }
    if (vmax - vmin < 1e-6) { vmax = vmin + 1; }
    const pad = (vmax - vmin) * 0.15;
    vmin -= pad; vmax += pad;
    const X = t => (t - t0) / (t1 - t0) * (W - 40) + 30;
    const Y = v => H - 30 - (v - vmin) / (vmax - vmin) * (H - 50);
    // 网格
    g.strokeStyle = '#1e2732'; g.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = 30 + (W - 40) * i / 8;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H - 20); g.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const y = 10 + (H - 50) * i / 5;
      g.beginPath(); g.moveTo(30, y); g.lineTo(W - 10, y); g.stroke();
    }
    // 曲线
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 1.8;
    g.beginPath();
    samples.forEach((s, i) => { const x = X(s[0]), y = Y(s[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    // 关键帧
    for (const k of track.keys) {
      const x = X(k.t);
      const v = ctxInfo.mode === 'speed' ? AE.anim.speedAt(track, k.t) : (Array.isArray(k.v) ? k.v[0] : k.v);
      const y = Y(v);
      g.fillStyle = A.selectedKeys.some(s => s.layerId === ctxInfo.layer.id && s.prop === ctxInfo.prop && Math.abs(s.t - k.t) < 1e-4) ? '#ff8a3d' : '#f2c14e';
      g.strokeStyle = '#3a3a20'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y);
      g.closePath(); g.fill(); g.stroke();
    }
    // 播放头
    const px = X(A.time);
    g.strokeStyle = 'rgba(255,138,61,.8)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H - 20); g.stroke();
    // 坐标
    g.fillStyle = '#5f6d7e'; g.font = '10px monospace';
    g.fillText(U.round(vmin, 2), 4, Y(vmin) + 3);
    g.fillText(U.round(vmax, 2), 4, Y(vmax) - 3);
    g.fillText(t0 + 's', 30, H - 6);
    g.fillText(t1 + 's', W - 34, H - 6);
    // 曲线信息
    const stat = document.getElementById('curveStat');
    if (stat) {
      const cur = ctxInfo.mode === 'speed' ? AE.anim.speedAt(track, A.time) : AE.anim.evalTrack(track, A.time);
      stat.textContent = `当前值：${Array.isArray(cur) ? cur.map(v => U.round(v, 2)).join(', ') : U.round(cur, 3)}`;
    }
  };

  /* ---------------- 音频面板 ---------------- */
  UI.buildAudio = function () {
    const A = App();
    const list = document.getElementById('audioList');
    const detail = document.getElementById('audioDetail');
    clear(list); clear(detail);
    const audioLayers = A.comp.layers.filter(l => l.type === 'audio');
    list.appendChild(el('div', 'hintline', `音色图层 ${audioLayers.length} 个`));
    for (const l of audioLayers) {
      const item = el('div', 'audio-item');
      item.appendChild(el('span', 'lr-type', '声'));
      item.appendChild(el('span', 'ai-name', l.name));
      item.onclick = () => { A.selection = [l.id]; UI.buildRight(); UI.buildAudio(); };
      list.appendChild(item);
    }
    const l = audioLayers[0];
    if (!l) { detail.appendChild(el('div', 'hintline', '当前合成没有音色图层。音色图层用内置合成器生成配乐与音效。')); return; }
    const g = group('音色 · ' + l.name, true);
    const wave = selectCtl([['sine', '正弦'], ['saw', '锯齿'], ['square', '方波'], ['noise', '噪声'], ['metal', '金属撞击']], l.props.sndWave.v, v => { A.pushUndo('音色'); l.props.sndWave.v = v; });
    g.body.appendChild(propRow('波形', wave));
    g.body.appendChild(propRow('频率', numInput(l.props.sndFreq.v, v => { A.pushUndo('频率'); l.props.sndFreq.v = v; }, { step: 1 })));
    g.body.appendChild(propRow('结束频率', numInput(l.props.sndFreqEnd.v, v => { A.pushUndo('频率'); l.props.sndFreqEnd.v = v; }, { step: 1 })));
    g.body.appendChild(propRow('音量', numInput(l.props.sndVol.v, v => { A.pushUndo('音量'); l.props.sndVol.v = v; }, { step: 1 })));
    g.body.appendChild(propRow('音符序列', (() => {
      const inp = el('input', 'txt');
      inp.value = l.props.sndNotes.v;
      inp.onchange = () => { A.pushUndo('音符'); l.props.sndNotes.v = inp.value; };
      inp.onkeydown = e => e.stopPropagation();
      return inp;
    })()));
    detail.appendChild(g.el);
    // 事件列表
    const ev = group('事件 (' + ((l.sound && l.sound.events) || []).length + ')', true);
    ((l.sound && l.sound.events) || []).forEach((e, i) => {
      const r = el('div', 'row');
      r.appendChild(el('label', '', e.wave + ' ' + U.round(e.freq) + 'Hz'));
      r.appendChild(el('div', 'ctl')).appendChild(el('span', 'hintline', U.round(e.time, 2) + 's'));
      ev.body.appendChild(r);
    });
    detail.appendChild(ev.el);
  };

  /* ---------------- 节点编辑器 ---------------- */
  UI.buildNodeEditor = function (body) {
    const A = App();
    const layer = A.selectedLayers()[0];
    if (!layer) { body.appendChild(el('div', 'hintline', '选择图层后可在节点面板中以程序方式生成几何。')); return; }
    if (!layer.nodes) layer.nodes = AE.nodes.createGraph();
    const graph = layer.nodes;
    const wrap = el('div', '');
    wrap.style.position = 'relative';
    wrap.style.height = '320px';
    wrap.style.overflow = 'hidden';
    wrap.style.border = '1px solid #2a3440';
    wrap.style.borderRadius = '4px';
    wrap.style.background = '#0f141b';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none');
    wrap.appendChild(svg);

    const addBar = el('div', 'mdl-list');
    addBar.style.position = 'absolute';
    addBar.style.left = '4px'; addBar.style.top = '4px'; addBar.style.zIndex = '5';
    const seen = new Set();
    for (const k in AE.nodes.DEFS) {
      const def = AE.nodes.DEFS[k];
      if (seen.has(def.cat)) continue;
      seen.add(def.cat);
    }
    const sel = el('select', 'pill');
    for (const k in AE.nodes.DEFS) {
      const o = el('option', '', AE.nodes.DEFS[k].label);
      o.value = k;
      sel.appendChild(o);
    }
    const addBtn = el('button', 'pill', '＋ 添加');
    addBtn.onclick = () => {
      A.pushUndo('添加节点');
      const n = AE.nodes.create(sel.value, 40 + Math.random() * 160, 40 + Math.random() * 160);
      graph.nodes.push(n);
      if (n.type === 'output') graph.output = n.id;
      UI.buildNodeEditor(document.getElementById('rightBody'));
    };
    addBar.appendChild(sel); addBar.appendChild(addBtn);
    wrap.appendChild(addBar);

    // 节点
    const nodeEls = new Map();
    for (const node of graph.nodes) {
      const def = AE.nodes.DEFS[node.type];
      const nEl = el('div', 'node-body');
      nEl.style.left = node.x + 'px';
      nEl.style.top = node.y + 'px';
      const head = el('div', 'node-head', def.label);
      head.appendChild(el('span', 'nh-type', def.cat));
      nEl.appendChild(head);
      // 参数
      for (const p of (def.params || [])) {
        const r = el('div', 'nb-row');
        r.appendChild(el('label', '', p.label));
        let input;
        if (p.type === 'select') {
          input = el('select', 'pill');
          for (const [v, l] of p.options) { const o = el('option', '', l); o.value = v; input.appendChild(o); }
          input.value = node.params[p.key];
        } else if (p.type === 'text') {
          input = el('input', 'num'); input.style.textAlign = 'left';
          input.value = node.params[p.key];
        } else {
          input = el('input', 'num');
          input.value = node.params[p.key];
        }
        input.onchange = () => {
          A.pushUndo('节点参数');
          node.params[p.key] = p.type === 'select' || p.type === 'text' ? input.value : (parseFloat(input.value) || 0);
          UI.buildRight();
        };
        r.appendChild(input);
        nEl.appendChild(r);
      }
      // 输入端口
      for (const inp of (def.in || [])) {
        const r = el('div', 'nb-row');
        r.appendChild(el('label', '', inp.name));
        const port = el('div', 'node-port p-in');
        port.style.position = 'relative';
        port.style.display = 'inline-block';
        port.style.background = AE.nodes.PORT_TYPES[inp.type].color;
        port.dataset.node = node.id;
        port.dataset.port = inp.name;
        port.dataset.type = inp.type;
        port.title = '输入：' + AE.nodes.PORT_TYPES[inp.type].label;
        r.appendChild(port);
        nEl.appendChild(r);
      }
      // 输出端口
      if (def.out) {
        const r = el('div', 'nb-row');
        const port = el('div', 'node-port p-out');
        port.style.position = 'relative';
        port.style.display = 'inline-block';
        port.style.background = AE.nodes.PORT_TYPES[def.out.type].color;
        port.dataset.node = node.id;
        port.dataset.port = 'out';
        port.dataset.type = def.out.type;
        port.title = '输出：' + AE.nodes.PORT_TYPES[def.out.type].label;
        r.appendChild(el('label', '', '输出'));
        r.appendChild(port);
        nEl.appendChild(r);
      }
      // 拖动
      head.onmousedown = ev => {
        ev.preventDefault();
        const sx = ev.clientX, sy = ev.clientY;
        const ox = node.x, oy = node.y;
        const mv = e2 => {
          node.x = Math.max(0, ox + e2.clientX - sx);
          node.y = Math.max(0, oy + e2.clientY - sy);
          nEl.style.left = node.x + 'px';
          nEl.style.top = node.y + 'px';
          drawWires();
        };
        const up = () => {
          window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      };
      // 连线
      wrap.addEventListener('mousedown', ev => {
        const port = ev.target.closest('.node-port');
        if (!port) return;
        ev.preventDefault();
        const isIn = port.classList.contains('p-in');
        const startNode = port.dataset.node, startPort = port.dataset.port;
        const temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        temp.setAttribute('stroke', '#ff8a3d'); temp.setAttribute('fill', 'none'); temp.setAttribute('stroke-width', '1.5');
        svg.appendChild(temp);
        const mv = e2 => {
          const rect = wrap.getBoundingClientRect();
          const a = portCenter(port, rect);
          const b = [e2.clientX - rect.left, e2.clientY - rect.top];
          temp.setAttribute('d', bezPath(a, b));
        };
        const up = e2 => {
          window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
          temp.remove();
          const target = document.elementFromPoint(e2.clientX, e2.clientY);
          const tp = target && target.closest ? target.closest('.node-port') : null;
          if (!tp) return;
          const isIn2 = tp.classList.contains('p-in');
          if (isIn === isIn2) return;
          const fromId = isIn ? tp.dataset.node : startNode;
          const toId = isIn ? startNode : tp.dataset.node;
          const toPort = isIn ? startPort : tp.dataset.port;
          if (AE.nodes.canConnect(graph, fromId, 'out', toId, toPort)) {
            A.pushUndo('连线');
            AE.nodes.connect(graph, fromId, toId, toPort);
            UI.buildNodeEditor(document.getElementById('rightBody'));
          } else {
            UI.toast('无法连接：请检查端口类型与环路', 'bad');
          }
        };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
      wrap.appendChild(nEl);
      nodeEls.set(node.id, nEl);
    }
    function portCenter(port, rect) {
      const r = port.getBoundingClientRect();
      return [r.left - rect.left + r.width / 2, r.top - rect.top + r.height / 2];
    }
    function bezPath(a, b) {
      const dx = Math.max(30, Math.abs(b[0] - a[0]) * 0.5);
      return `M ${a[0]} ${a[1]} C ${a[0] + dx} ${a[1]}, ${b[0] - dx} ${b[1]}, ${b[0]} ${b[1]}`;
    }
    function drawWires() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      for (const e of graph.edges) {
        const from = graph.nodes.find(n => n.id === e.from);
        const to = graph.nodes.find(n => n.id === e.to);
        if (!from || !to) continue;
        const rect = wrap.getBoundingClientRect();
        const fEl = nodeEls.get(e.from), tEl = nodeEls.get(e.to);
        if (!fEl || !tEl) continue;
        const fp = fEl.querySelector('.p-out');
        const tp = tEl.querySelectorAll('.p-in');
        let t = null;
        for (const p of tp) if (p.dataset.port === e.toPort) t = p;
        if (!fp || !t) continue;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', bezPath(portCenter(fp, rect), portCenter(t, rect)));
        path.setAttribute('stroke', '#6f7f92'); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1.4');
        svg.appendChild(path);
      }
    }
    body.appendChild(wrap);
    setTimeout(drawWires, 0);
    // 求值结果
    const res = AE.nodes.evaluate(graph, {
      getLayer: name => A.comp.layers.find(l => l.name === name || l.label === name),
      time: A.time
    });
    const info = el('div', 'hintline');
    info.innerHTML = `输出：${res.contours.length ? res.contours.length + ' 条轮廓' : (res.mesh ? '三维实体' : '无')}<br>端口类型：标量 / 向量 / 颜色 / 路径 / 实体 / 场`;
    body.appendChild(info);
    const delBtn = el('button', 'pill danger', '删除全部节点');
    delBtn.onclick = () => { A.pushUndo('清空节点'); layer.nodes = AE.nodes.createGraph(); UI.buildRight(); };
    body.appendChild(delBtn);
  };

  /* ---------------- 画布叠加层与交互 ---------------- */
  function layerLocalBounds(layer) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    if (layer.type === 'shape' && layer.shape) {
      for (const g of layer.shape.groups) for (const p of g.paths) {
        for (const q of AE.path.flatten(p.path, 2)) add(q[0], q[1]);
      }
    } else if (layer.type === 'text' && layer.text) {
      const size = layer.props.fontSize ? layer.props.fontSize.v : 120;
      const lay = AE.text.layout({
        text: layer.text.content, size,
        leading: layer.props.leading ? layer.props.leading.v : 1.25,
        tracking: layer.props.tracking ? layer.props.tracking.v : 0,
        align: 'center',
        family: layer.props.fontFamily ? layer.props.fontFamily.v : undefined
      });
      for (const line of lay.lines) for (const ch of line.chars) {
        for (const ct of ch.contours) for (const q of ct.pts) add(q[0] * size + ch.x, q[1] * size + ch.y);
      }
    } else if (layer.type === 'solid3d' && layer.solid) {
      for (const p of layer.solid.paths) for (const q of p.pts) add(q[0], q[1]);
    }
    if (!isFinite(x0)) return { x0: -100, y0: -100, x1: 100, y1: 100 };
    return { x0, y0, x1, y1 };
  }
  UI.layerLocalBounds = layerLocalBounds;

  function layerCorners(layer) {
    const b = layerLocalBounds(layer);
    const A = App();
    const m = AE.scene.worldMatrix(layer, A.comp, A.time, { comp: A.comp, project: A.project, errors: [] });
    const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
    if (layer.threeD) {
      // 三维：投影到屏幕
      const scene = A.lastScene;
      if (scene) {
        const vp = scene.camera.vp;
        return pts.map(p => {
          const q = U.mat4.xformPoint(vp, [p[0], p[1], 0]);
          return App().compToScreen((q[0] / q[3] * 0.5 + 0.5) * A.comp.w, (1 - (q[1] / q[3] * 0.5 + 0.5)) * A.comp.h);
        });
      }
    }
    return pts.map(p => {
      const q = U.mat4.xformPoint(m, [p[0], p[1], 0]);
      return App().compToScreen(q[0], q[1]);
    });
  }
  UI.layerCorners = layerCorners;

  UI.drawOverlay = function () {
    if (!overlay) return;
    const A = App();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    g2ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = overlay.width / dpr, H = overlay.height / dpr;
    g2ctx.clearRect(0, 0, W, H);
    if (!A.comp) return;
    // 合成边框
    const tl = A.compToScreen(0, 0), br = A.compToScreen(A.comp.w, A.comp.h);
    g2ctx.strokeStyle = 'rgba(120,160,200,.25)';
    g2ctx.lineWidth = 1;
    g2ctx.strokeRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
    // 场范围
    if (A.viewMode === 'fields') {
      for (const f of (A.comp.fields || [])) {
        const pos = AE.scene.evalProp(f, 'position', A.time, { comp: A.comp }) || [0, 0, 0];
        const r = AE.scene.evalProp(f, 'radius', A.time, { comp: A.comp }) || 300;
        const c = A.compToScreen(pos[0], pos[1]);
        g2ctx.strokeStyle = '#43c8c0';
        g2ctx.setLineDash([4, 4]);
        g2ctx.beginPath(); g2ctx.arc(c[0], c[1], r * A.view.scale, 0, Math.PI * 2); g2ctx.stroke();
        g2ctx.setLineDash([]);
      }
    }
    // 灯光与摄像机
    for (const l of A.comp.layers) {
      if (l.type === 'light' && l.enabled) {
        const p = AE.scene.evalProp(l, 'lightPos', A.time, { comp: A.comp }) || [0, 0, 0];
        const c = A.compToScreen(p[0], p[1]);
        g2ctx.strokeStyle = 'rgba(255,224,102,.9)';
        g2ctx.beginPath(); g2ctx.arc(c[0], c[1], 9, 0, Math.PI * 2); g2ctx.stroke();
        g2ctx.beginPath(); g2ctx.moveTo(c[0] - 13, c[1]); g2ctx.lineTo(c[0] + 13, c[1]);
        g2ctx.moveTo(c[0], c[1] - 13); g2ctx.lineTo(c[0], c[1] + 13); g2ctx.stroke();
      }
      if (l.type === 'camera' && l.enabled) {
        const p = AE.scene.evalProp(l, 'camPosition', A.time, { comp: A.comp }) || [0, 0, 0];
        const c = A.compToScreen(p[0], p[1]);
        g2ctx.strokeStyle = 'rgba(224,179,65,.9)';
        g2ctx.beginPath(); g2ctx.moveTo(c[0], c[1] - 12); g2ctx.lineTo(c[0] + 10, c[1] + 8);
        g2ctx.lineTo(c[0] - 10, c[1] + 8); g2ctx.closePath(); g2ctx.stroke();
      }
    }
    // 运动路径
    if (A.showPath) {
      for (const layer of A.selectedLayers()) {
        const tr = layer.props.position && layer.props.position.tr;
        if (!tr || tr.keys.length < 2) continue;
        const pts = AE.anim.samplePath(tr, tr.keys[0].t, tr.keys[tr.keys.length - 1].t, 80);
        g2ctx.strokeStyle = 'rgba(255,138,61,.75)';
        g2ctx.setLineDash([5, 4]);
        g2ctx.beginPath();
        pts.forEach((p, i) => {
          const s = A.compToScreen(p[0], p[1]);
          i ? g2ctx.lineTo(s[0], s[1]) : g2ctx.moveTo(s[0], s[1]);
        });
        g2ctx.stroke();
        g2ctx.setLineDash([]);
        for (const k of tr.keys) {
          const s = A.compToScreen(k.v[0], k.v[1]);
          g2ctx.fillStyle = '#ff8a3d';
          g2ctx.beginPath(); g2ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); g2ctx.fill();
        }
      }
    }
    // 选择框
    const sel = A.selectedLayers();
    if (sel.length) {
      const layer = sel[0];
      const corners = layerCorners(layer);
      g2ctx.strokeStyle = '#ff8a3d';
      g2ctx.lineWidth = 1.4;
      g2ctx.beginPath();
      corners.forEach((c, i) => i ? g2ctx.lineTo(c[0], c[1]) : g2ctx.moveTo(c[0], c[1]));
      g2ctx.closePath(); g2ctx.stroke();
      // 手柄
      g2ctx.fillStyle = '#1b222c';
      g2ctx.strokeStyle = '#ff8a3d';
      for (const c of corners) {
        g2ctx.beginPath(); g2ctx.rect(c[0] - 4, c[1] - 4, 8, 8); g2ctx.fill(); g2ctx.stroke();
      }
      // 锚点
      const anc = AE.scene.evalProp(layer, 'anchor', A.time, { comp: A.comp }) || [0, 0];
      const m = AE.scene.worldMatrix(layer, A.comp, A.time, { comp: A.comp });
      const ap = U.mat4.xformPoint(m, [anc[0], anc[1], 0]);
      const as = A.compToScreen(ap[0], ap[1]);
      g2ctx.strokeStyle = '#4ea8de';
      g2ctx.beginPath(); g2ctx.arc(as[0], as[1], 5, 0, Math.PI * 2); g2ctx.stroke();
      // 旋转手柄
      const top = corners[0], top2 = corners[1];
      const mid = [(top[0] + top2[0]) / 2, (top[1] + top2[1]) / 2];
      const rot = [(mid[0]), (mid[1] - 26)];
      g2ctx.strokeStyle = 'rgba(255,138,61,.6)';
      g2ctx.beginPath(); g2ctx.moveTo(mid[0], mid[1]); g2ctx.lineTo(rot[0], rot[1]); g2ctx.stroke();
      g2ctx.fillStyle = '#1b222c';
      g2ctx.beginPath(); g2ctx.arc(rot[0], rot[1], 5, 0, Math.PI * 2); g2ctx.fill(); g2ctx.stroke();
    }
    // 提示
    const hint = document.getElementById('viewportHint');
    if (hint) {
      hint.textContent = sel.length ? `${sel.length} 个图层已选中 · 拖动移动 · 角点缩放 · 顶部手柄旋转` :
        (A.comp ? `合成 ${A.comp.w}×${A.comp.h} · ${A.comp.fps}fps · ${U.round(A.comp.duration, 1)}s` : '');
    }
  };
  let g2ctx = null;
  const origInit = UI.init;
  UI.init = function () {
    origInit();
    g2ctx = overlay.getContext('2d');
  };

  /* ---------------- 画布交互 ---------------- */
  function setupCanvasInteraction() {
    const cv = document.getElementById('glCanvas');
    const A = App();

    cv.addEventListener('mousedown', e => {
      const rect = cv.getBoundingClientRect();
      const comp = A.screenToComp(e.clientX - rect.left, e.clientY - rect.top);
      const sel = A.selectedLayers();
      // 命中测试
      let hit = null;
      for (const layer of A.comp.layers.slice().reverse()) {
        if (!layer.enabled || layer.locked) continue;
        if (layer.type === 'shape' || layer.type === 'text' || layer.type === 'solid3d') {
          const b = layerLocalBounds(layer);
          if (comp[0] >= b.x0 - 6 && comp[0] <= b.x1 + 6 && comp[1] >= b.y0 - 6 && comp[1] <= b.y1 + 6) {
            const m = AE.scene.worldMatrix(layer, A.comp, A.time, { comp: A.comp });
            const inv = U.mat4.invert(m);
            const local = U.mat4.xformPoint(inv, [comp[0], comp[1], 0]);
            let inside = false;
            if (layer.type === 'shape' && layer.shape) {
              for (const g of layer.shape.groups) for (const p of g.paths) {
                if (AE.path.pointInPath(p.path, local[0], local[1])) { inside = true; break; }
              }
            } else inside = true;
            if (inside) { hit = layer; break; }
          }
        }
      }
      if (!hit) {
        if (!e.ctrlKey) { A.select(null); }
        return;
      }
      if (!A.selection.includes(hit.id)) A.select(hit.id, e.ctrlKey);
      // 手柄命中
      const corners = layerCorners(hit);
      let handle = null;
      for (let i = 0; i < corners.length; i++) {
        if (Math.hypot(corners[i][0] - (e.clientX - rect.left), corners[i][1] - (e.clientY - rect.top)) < 8) { handle = i; break; }
      }
      A.pushUndo('变换图层');
      dragging = {
        mode: handle === null ? 'move' : 'scale',
        layer: hit, handle,
        startComp: comp, corners
      };
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const cv2 = document.getElementById('glCanvas');
      const rect = cv2.getBoundingClientRect();
      const comp = A.screenToComp(e.clientX - rect.left, e.clientY - rect.top);
      const layer = dragging.layer;
      const p = layer.props.position;
      const animated = p.tr && p.tr.keys.length;
      if (dragging.mode === 'move') {
        const dx = comp[0] - dragging.startComp[0];
        const dy = comp[1] - dragging.startComp[1];
        const cur = AE.scene.evalProp(layer, 'position', A.time, { comp: A.comp }) || [0, 0];
        const nv = [cur[0] + dx, cur[1] + dy];
        setAnimatedProp(layer, 'position', nv);
      } else if (dragging.mode === 'scale') {
        const b = layerLocalBounds(layer);
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        const k = Math.hypot(comp[0] - cx, comp[1] - cy) / Math.max(1, Math.hypot(dragging.startComp[0] - cx, dragging.startComp[1] - cy));
        const sc = AE.scene.evalProp(layer, 'scale', A.time, { comp: A.comp }) || [100, 100];
        setAnimatedProp(layer, 'scale', [sc[0] * k, sc[1] * k]);
      }
      UI.drawOverlay();
    });

    window.addEventListener('mouseup', () => {
      if (dragging) { dragging = null; UI.refreshTimeline(); }
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) {
        A.zoom = 'manual';
        A.zoomFactor = U.clamp(A.zoomFactor * (e.deltaY < 0 ? 1.1 : 0.9), 0.2, 6);
      }
    }, { passive: false });
  }

  function setAnimatedProp(layer, key, value) {
    const A = App();
    const p = layer.props[key];
    if (!p) return;
    if (p.tr && p.tr.keys.length) {
      const k = AE.anim.getKey(p.tr, A.time);
      if (k) { k.v = value; AE.anim.refreshHandles(p.tr); }
      else AE.anim.addKey(p.tr, A.time, value);
    } else {
      p.v = value;
    }
  }
  UI.setAnimatedProp = setAnimatedProp;
})(window);
