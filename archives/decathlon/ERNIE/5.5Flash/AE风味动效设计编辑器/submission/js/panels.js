/* AE Forge Editor - project / properties / effects panels */
(function (global) {
  'use strict';
  const A = global.AEAnim;
  const P = global.AEProject;
  const UI = () => global.UI;
  let liveRegistry = [];

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  function fmt(v, digits) {
    if (typeof v !== 'number') return String(v);
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    return v.toFixed(digits === undefined ? 2 : digits);
  }
  function isArr(v) { return Array.isArray(v); }

  // ---------------- project panel ----------------
  function renderProject() {
    const host = document.getElementById('compList');
    if (!host) return;
    host.innerHTML = '';
    const proj = P.project;
    for (const c of proj.comps) {
      const row = el('div', 'comp-item' + (c.id === P.state.activeCompId ? ' active' : ''));
      const ico = el('span', 'comp-ico');
      const name = el('span', 'comp-name', c.name);
      const sub = el('span', 'comp-sub', c.layers.length + '层');
      row.append(ico, name, sub);
      row.onclick = () => {
        P.state.activeCompId = c.id;
        P.state.time = 0;
        P.invalidate();
        UI().selected = [];
        updateStage();
        AEPanels.renderAll();
      };
      row.oncontextmenu = (e) => {
        e.preventDefault();
        UIMenu.open(e.clientX, e.clientY, [
          { label: '重命名', fn: () => { const n = prompt('合成名称', c.name); if (n) { P.pushUndo(); c.name = n; AEPanels.renderAll(); } } },
          { label: '删除合成', fn: () => { if (proj.comps.length <= 1) return; P.pushUndo(); proj.comps = proj.comps.filter(x => x !== c); P.state.activeCompId = proj.comps[0].id; P.invalidate(); updateStage(); AEPanels.renderAll(); } },
        ]);
      };
      host.appendChild(row);
    }
    const title = document.getElementById('projectTitle');
    if (title) title.textContent = proj.name + ' — AE 风味动效设计编辑器';
  }
  function updateStage() { if (window.App && App.updateStageSize) App.updateStageSize(); }

  // ---------------- property helpers ----------------
  function animBtn(prop) {
    const b = el('button', 'mini-btn anim-btn');
    b.textContent = '◷';
    b.style.color = prop.expr ? '#63b3ff' : (prop.keys && prop.keys.length ? '#ffcf9e' : '#6b6b78');
    b.title = '关键帧开关';
    b.onclick = (e) => {
      e.stopPropagation();
      P.pushUndo();
      if (prop.keys && prop.keys.length) { prop.keys = []; }
      else { A.setKey(prop, P.state.time, prop.value); }
      P.invalidate();
      AEPanels.renderProps();
      if (global.AETL) AETL.draw();
    };
    return b;
  }

  function valueInputs(prop, opts) {
    opts = opts || {};
    const wrap = el('div', 'val');
    const base = prop.value;
    const arr = isArr(base);
    const n = arr ? base.length : 1;
    const comp = P.activeComp();
    const ctx = P.makeCtx(comp, opts.layer || null, P.state.time);
    const cur = A.evalProp(prop, P.state.time, ctx);
    for (let i = 0; i < n; i++) {
      const inp = el('input', 'prop-input');
      inp.type = 'number';
      inp.step = opts.step || '0.1';
      inp.value = fmt(arr ? (cur[i] === undefined ? 0 : cur[i]) : cur, opts.digits);
      inp.dataset.propName = opts.propName || '';
      inp.dataset.idx = i;
      const apply = (v) => {
        P.pushUndo();
        let nv;
        if (opts.target) {
          nv = arr ? base.map((x, k) => k === i ? v : x) : v;
          opts.target[0][opts.target[1]] = nv;
        } else {
          nv = arr ? base.map((x, k) => k === i ? v : x) : v;
          if (prop.keys && prop.keys.length) A.setKey(prop, P.state.time, nv);
          else prop.value = nv;
        }
        P.invalidate();
      };
      inp.onchange = () => {
        let v = parseFloat(inp.value);
        if (isNaN(v)) return;
        apply(v);
        if (global.AETL) AETL.draw();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { inp.blur(); } };
      wrap.appendChild(inp);
      liveRegistry.push({ input: inp, prop, idx: i, target: opts.target, digits: opts.digits });
    }
    if (opts.unit) wrap.appendChild(el('span', 'prop-unit', opts.unit));
    return wrap;
  }

  function propRow(label, prop, opts) {
    opts = opts || {};
    const box = el('div');
    const row = el('div', 'prop-row');
    row.appendChild(el('label', null, label));
    row.appendChild(valueInputs(prop, Object.assign({ propName: opts.prop }, opts)));
    if (opts.noAnim !== true) row.appendChild(animBtn(prop));
    const fxB = el('button', 'mini-btn');
    fxB.textContent = 'ƒx';
    fxB.style.color = prop.expr ? '#63b3ff' : '#6b6b78';
    fxB.title = '表达式';
    box.appendChild(row);
    const exprRow = el('div', 'prop-row');
    exprRow.style.display = prop.expr ? 'flex' : 'none';
    exprRow.appendChild(el('label', null, '表达式'));
    const inp = el('input', 'prop-input');
    inp.value = prop.expr || '';
    inp.placeholder = '例如 wiggle(2, 30)';
    exprRow.appendChild(inp);
    box.appendChild(exprRow);
    fxB.onclick = (e) => {
      e.stopPropagation();
      const show = exprRow.style.display === 'none';
      exprRow.style.display = show ? 'flex' : 'none';
      if (show) inp.focus();
    };
    row.appendChild(fxB);
    inp.onchange = () => {
      P.pushUndo();
      prop.expr = inp.value.trim();
      P.invalidate();
      const res = global.AEExpr.evaluate(prop.expr, P.state.time, A.keysAt(prop, P.state.time), P.makeCtx(P.activeComp(), null, P.state.time));
      inp.classList.toggle('bad', !!prop.expr && !res.ok);
      if (prop.expr && !res.ok) global.AppToast('表达式错误：' + res.error, true);
      if (global.AETL) AETL.draw();
    };
    if (prop.expr) {
      const res = global.AEExpr.evaluate(prop.expr, P.state.time, A.keysAt(prop, P.state.time), P.makeCtx(P.activeComp(), null, P.state.time));
      if (!res.ok) inp.classList.add('bad');
    }
    return box;
  }

  function section(title, children) {
    const s = el('div', 'prop-section');
    if (title) s.appendChild(el('div', 'prop-title', title));
    for (const c of children) if (c) s.appendChild(c);
    return s;
  }

  function selectRow(label, options, value, onchange) {
    const row = el('div', 'prop-row');
    row.appendChild(el('label', null, label));
    const sel = el('select', 'prop-input');
    for (const o of options) {
      const op = el('option', null, o.label);
      op.value = o.value;
      sel.appendChild(op);
    }
    sel.value = value;
    sel.onchange = () => onchange(sel.value);
    row.appendChild(sel);
    return row;
  }

  function colorRow(label, value, onchange) {
    const row = el('div', 'prop-row');
    row.appendChild(el('label', null, label));
    const wrap = el('div', 'prop-color');
    const sw = el('span', 'prop-swatch');
    sw.style.background = value;
    const inp = el('input');
    inp.type = 'color';
    inp.value = toHex(value);
    const hex = el('input', 'prop-input');
    hex.value = value;
    inp.oninput = () => { sw.style.background = inp.value; hex.value = inp.value; };
    inp.onchange = () => { P.pushUndo(); sw.style.background = inp.value; hex.value = inp.value; onchange(inp.value); };
    hex.onchange = () => { P.pushUndo(); sw.style.background = hex.value; onchange(hex.value); };
    wrap.append(sw, inp, hex);
    row.appendChild(wrap);
    return row;
  }

  function toHex(v) {
    if (typeof v !== 'string') return '#ffffff';
    if (v.startsWith('#')) return v.length === 4 ? '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : v.slice(0, 7);
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map(x => parseFloat(x));
      return '#' + p.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
    }
    return '#ffffff';
  }

  function textRow(label, value, onchange, opts) {
    opts = opts || {};
    const row = el('div', 'prop-row');
    row.appendChild(el('label', null, label));
    const inp = el(opts.multiline ? 'textarea' : 'input', 'prop-input');
    if (opts.multiline) { inp.rows = 2; inp.style.height = '44px'; inp.style.resize = 'vertical'; }
    inp.value = value == null ? '' : value;
    inp.onchange = () => onchange(inp.value);
    row.appendChild(inp);
    return row;
  }

  // ---------------- main props ----------------
  function renderProps() {
    liveRegistry = [];
    const host = document.getElementById('propsPanel');
    if (!host) return;
    host.innerHTML = '';
    const comp = P.activeComp();
    const sel = comp.layers.filter(l => UI().selected.includes(l.id));
    const selCount = document.getElementById('selCount');
    if (selCount) selCount.textContent = sel.length ? (sel.length === 1 ? sel[0].name : sel.length + ' 个图层') : '未选择';
    if (!sel.length) {
      const d = el('div', 'prop-empty');
      d.innerHTML = '未选择图层<br><span style="color:#55555f">在合成中单击选择，或在时间轴上点选图层</span>';
      host.appendChild(d);
      return;
    }
    const l = sel[0];
    const t = P.state.time;

    const tr = l.transform;
    host.appendChild(section('变换', [
      propRow('锚点', tr.anchor, { prop: 'transform.anchor', layer: l }),
      propRow('位置', tr.position, { prop: 'transform.position', layer: l }),
      propRow('缩放', tr.scale, { prop: 'transform.scale', layer: l, step: '1' }),
      propRow('旋转', tr.rotation, { prop: 'transform.rotation', layer: l, step: '1', unit: '°' }),
      propRow('不透明度', tr.opacity, { prop: 'transform.opacity', layer: l, step: '1', unit: '%' }),
    ]));

    const basic = [];
    basic.push(textRow('名称', l.name, (v) => { P.pushUndo(); l.name = v; AEPanels.renderAll(); }));
    basic.push(selectRow('混合模式', [
      { label: '正常', value: 'normal' }, { label: '相加', value: 'add' },
      { label: '滤色', value: 'screen' }, { label: '正片叠底', value: 'multiply' },
      { label: '叠加', value: 'overlay' },
    ], l.blendMode, (v) => { P.pushUndo(); l.blendMode = v; P.invalidate(); }));
    const parents = [{ label: '无', value: '' }].concat(comp.layers.filter(x => x !== l && x.type !== 'camera' && x.type !== 'light').map(x => ({ label: x.name, value: x.id })));
    basic.push(selectRow('父级', parents, l.parentId || '', (v) => { P.pushUndo(); P.reparent(l.id, v || null, true); AEPanels.renderAll(); }));
    basic.push(section('时间', [
      propRow('入点', { value: l.inPoint, keys: [], expr: '' }, { noAnim: true, step: '0.1', unit: 's', target: [l, 'inPoint'] }),
      propRow('出点', { value: l.outPoint, keys: [], expr: '' }, { noAnim: true, step: '0.1', unit: 's', target: [l, 'outPoint'] }),
      propRow('拉伸', { value: l.stretch, keys: [], expr: '' }, { noAnim: true, step: '1', unit: '%', target: [l, 'stretch'] }),
    ]));
    host.appendChild(section('图层', basic));

    if (l.type === 'shape') host.appendChild(shapeProps(l));
    else if (l.type === 'text') host.appendChild(textProps(l));
    else if (l.type === 'precomp') {
      host.appendChild(section('预合成', [
        selectRow('源合成', P.project.comps.map(c => ({ label: c.name, value: c.id })), l.compId, (v) => { P.pushUndo(); l.compId = v; P.invalidate(); }),
        propRow('时间重映射', l.timeRemap, { prop: 'timeRemap', layer: l, step: '0.1', unit: 's' }),
      ]));
    } else if (l.type === 'camera') {
      host.appendChild(section('摄像机', [
        propRow('视角', l.camera.fov, { prop: 'camera.fov', layer: l, step: '1', unit: '°' }),
        propRow('对焦距离', l.camera.focus, { prop: 'camera.focus', layer: l, step: '10' }),
        propRow('光圈', l.camera.aperture, { prop: 'camera.aperture', layer: l, step: '0.01' }),
        propRow('目标点', l.camera.target, { prop: 'camera.target', layer: l, step: '1' }),
      ]));
    } else if (l.type === 'light') {
      host.appendChild(section('灯光', [
        selectRow('类型', [{ label: '平行光', value: 'parallel' }, { label: '点光源', value: 'point' }], l.light.kind, (v) => { P.pushUndo(); l.light.kind = v; P.invalidate(); }),
        colorRow('颜色', l.light.color, (v) => { l.light.color = v; P.invalidate(); }),
        propRow('强度', l.light.intensity, { prop: 'light.intensity', layer: l, step: '0.1' }),
      ]));
    } else if (l.type === 'geo3d' || (l.is3D && (l.type === 'shape' || l.type === 'text'))) {
      host.appendChild(materialProps(l));
      if (l.type === 'geo3d') host.appendChild(geoProps(l));
      else host.appendChild(section('挤出', [
        propRow('深度', { value: l.geometryDepth, keys: [], expr: '' }, { noAnim: true, step: '1', target: [l, 'geometryDepth'] }),
      ]));
    } else if (l.type === 'particle') {
      host.appendChild(particleProps(l));
    } else if (l.type === 'audio') {
      host.appendChild(section('音色', [
        selectRow('音色', [
          { label: '锻炉 (forge)', value: 'forge' }, { label: '空灵 (airy)', value: 'airy' }, { label: '电子 (digital)', value: 'digital' },
        ], l.audio.patch, (v) => { P.pushUndo(); l.audio.patch = v; }),
        propRow('音量', { value: l.audio.gain, keys: [], expr: '' }, { noAnim: true, step: '0.05', target: [l.audio, 'gain'] }),
      ]));
    }

    const fxRows = [];
    if (l.masks && l.masks.length) {
      for (let i = 0; i < l.masks.length; i++) {
        const m = l.masks[i];
        const row = el('div', 'prop-row');
        row.appendChild(el('label', null, '蒙版 ' + (i + 1)));
        const nm = el('input', 'prop-input');
        nm.value = m.name || (m.kind === 'rect' ? '矩形' : m.kind === 'ellipse' ? '椭圆' : '路径');
        nm.onchange = () => { P.pushUndo(); m.name = nm.value; };
        row.appendChild(nm);
        const del = el('button', 'mini-action', '删除');
        del.onclick = () => { P.pushUndo(); l.masks.splice(i, 1); P.invalidate(); AEPanels.renderProps(); };
        row.appendChild(del);
        fxRows.push(row);
        fxRows.push(propRow('羽化', { value: m.feather || 0, keys: [], expr: '' }, { noAnim: true, step: '1', target: [m, 'feather'] }));
      }
    }
    if (l.effects && l.effects.length) {
      for (let i = 0; i < l.effects.length; i++) {
        const e = l.effects[i];
        const row = el('div', 'prop-row');
        row.appendChild(el('label', null, effectName(e.type)));
        const del = el('button', 'mini-action', '删除');
        del.onclick = () => { P.pushUndo(); l.effects.splice(i, 1); P.invalidate(); AEPanels.renderProps(); };
        row.appendChild(del);
        fxRows.push(row);
        if (e.type === 'gaussian') fxRows.push(propRow('半径', { value: e.params.radius, keys: [], expr: '' }, { noAnim: true, step: '1', target: [e.params, 'radius'] }));
        if (e.type === 'glow') {
          fxRows.push(propRow('半径', { value: e.params.radius, keys: [], expr: '' }, { noAnim: true, step: '1', target: [e.params, 'radius'] }));
          fxRows.push(propRow('强度', { value: e.params.intensity, keys: [], expr: '' }, { noAnim: true, step: '0.1', target: [e.params, 'intensity'] }));
        }
        if (e.type === 'shadow') {
          fxRows.push(propRow('距离', { value: e.params.distance, keys: [], expr: '' }, { noAnim: true, step: '1', target: [e.params, 'distance'] }));
          fxRows.push(propRow('半径', { value: e.params.radius, keys: [], expr: '' }, { noAnim: true, step: '1', target: [e.params, 'radius'] }));
        }
        if (e.type === 'hue') {
          fxRows.push(propRow('色相', { value: e.params.hue, keys: [], expr: '' }, { noAnim: true, step: '1', target: [e.params, 'hue'] }));
          fxRows.push(propRow('饱和度', { value: e.params.saturation, keys: [], expr: '' }, { noAnim: true, step: '1', target: [e.params, 'saturation'] }));
          fxRows.push(propRow('亮度', { value: e.params.brightness, keys: [], expr: '' }, { noAnim: true, step: '1', target: [e.params, 'brightness'] }));
        }
      }
    }
    if (fxRows.length) host.appendChild(section('蒙版与效果', fxRows));

    const acts = el('div', 'prop-actions');
    const addMask = el('button', 'mini-action', '+ 蒙版');
    addMask.onclick = () => {
      P.pushUndo();
      l.masks = l.masks || [];
      l.masks.push({ kind: 'rect', x: 0, y: 0, w: 500, h: 400, feather: 20, invert: false, enabled: true, name: '蒙版 ' + (l.masks.length + 1) });
      P.invalidate(); AEPanels.renderProps();
    };
    const addFx = el('button', 'mini-action', '+ 效果');
    addFx.onclick = (e) => {
      e.stopPropagation();
      UIMenu.open(e.clientX, e.clientY, [
        { label: '高斯模糊', fn: () => addEffect(l, 'gaussian') },
        { label: '发光', fn: () => addEffect(l, 'glow') },
        { label: '投影', fn: () => addEffect(l, 'shadow') },
        { label: '色相 / 饱和度', fn: () => addEffect(l, 'hue') },
      ]);
    };
    const dup = el('button', 'mini-action', '复制');
    dup.onclick = () => { P.pushUndo(); P.duplicateLayers([l.id]); AEPanels.renderAll(); };
    const del = el('button', 'mini-action', '删除');
    del.onclick = () => { P.pushUndo(); P.removeLayers([l.id]); UI().selected = []; AEPanels.renderAll(); };
    const pre = el('button', 'mini-action', '预合成');
    pre.onclick = () => global.App && global.App.precompose ? global.App.precompose() : null;
    acts.append(addMask, addFx, dup, pre, del);
    host.appendChild(acts);
  }

  function effectName(t) {
    return { gaussian: '高斯模糊', glow: '发光', shadow: '投影', hue: '色相/饱和度' }[t] || t;
  }
  function addEffect(l, type) {
    P.pushUndo();
    l.effects = l.effects || [];
    const params = type === 'gaussian' ? { radius: 12 } : type === 'glow' ? { radius: 24, intensity: 1, color: '#ff9a4d' } :
      type === 'shadow' ? { radius: 14, distance: 10, angle: 135, opacity: 0.5, color: '#000000' } : { hue: 0, saturation: 100, brightness: 100 };
    l.effects.push({ type, enabled: true, params });
    P.invalidate();
    AEPanels.renderProps();
  }

  function shapeProps(l) {
    const rows = [];
    if (l.shapes) {
      for (let i = 0; i < l.shapes.length; i++) {
        const s = l.shapes[i];
        const row = el('div', 'prop-row');
        row.appendChild(el('label', null, '形状 ' + (i + 1)));
        const sel = el('select', 'prop-input');
        sel.innerHTML = '<option value="rect">矩形</option><option value="ellipse">椭圆</option><option value="path">路径</option><option value="contours">轮廓</option>';
        sel.value = s.kind || 'rect';
        sel.onchange = () => { P.pushUndo(); s.kind = sel.value; P.invalidate(); AEPanels.renderProps(); };
        row.appendChild(sel);
        rows.push(row);
        if (s.kind === 'rect') {
          rows.push(propRow('宽', { value: s.w, keys: [], expr: '' }, { noAnim: true, step: '1', target: [s, 'w'] }));
          rows.push(propRow('高', { value: s.h, keys: [], expr: '' }, { noAnim: true, step: '1', target: [s, 'h'] }));
          rows.push(propRow('圆角', { value: s.round || 0, keys: [], expr: '' }, { noAnim: true, step: '1', target: [s, 'round'] }));
        } else if (s.kind === 'ellipse') {
          rows.push(propRow('宽', { value: s.w, keys: [], expr: '' }, { noAnim: true, step: '1', target: [s, 'w'] }));
          rows.push(propRow('高', { value: s.h, keys: [], expr: '' }, { noAnim: true, step: '1', target: [s, 'h'] }));
        }
      }
    }
    const fill = l.fill || {};
    const stroke = l.stroke || {};
    const mods = l.modifiers || {};
    const modRows = [];
    if (mods.trim) {
      modRows.push(propRow('修剪末', mods.trim.end, { prop: 'trim.end', layer: l, step: '1', unit: '%' }));
      modRows.push(propRow('修剪始', mods.trim.start, { prop: 'trim.start', layer: l, step: '1', unit: '%' }));
      modRows.push(propRow('偏移', mods.trim.offset, { prop: 'trim.offset', layer: l, step: '1', unit: '%' }));
    }
    if (mods.repeater) {
      modRows.push(propRow('重复数', mods.repeater.copies, { prop: 'repeater.copies', layer: l, step: '1' }));
      modRows.push(propRow('副本位移', mods.repeater.x, { prop: 'repeater.x', layer: l }));
    }
    return section('形状', rows.concat([
      section('填充', [
        colorRow('颜色', fill.color || '#ffffff', (v) => { P.pushUndo(); fill.color = v; P.invalidate(); }),
        propRow('不透明度', { value: fill.opacity === undefined ? 100 : fill.opacity, keys: [], expr: '' }, { noAnim: true, step: '1', unit: '%', target: [fill, 'opacity'] }),
      ]),
      section('描边', [
        propRow('宽度', { value: stroke.width || 4, keys: [], expr: '' }, { noAnim: true, step: '1', target: [stroke, 'width'] }),
        colorRow('颜色', stroke.color || '#ffffff', (v) => { P.pushUndo(); stroke.color = v; P.invalidate(); }),
      ]),
      section('修改器', modRows),
    ]));
  }

  function textProps(l) {
    const t = l.text;
    const rows = [
      textRow('内容', t.content, (v) => { P.pushUndo(); t.content = v; P.invalidate(); AEPanels.renderAll(); }, { multiline: true }),
      propRow('字号', { value: t.size, keys: [], expr: '' }, { noAnim: true, step: '1', target: [t, 'size'] }),
      selectRow('对齐', [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }], t.align, (v) => { P.pushUndo(); t.align = v; P.invalidate(); }),
      propRow('行距', { value: t.lineHeight, keys: [], expr: '' }, { noAnim: true, step: '0.05', target: [t, 'lineHeight'] }),
      propRow('字距', { value: t.tracking, keys: [], expr: '' }, { noAnim: true, step: '10', target: [t, 'tracking'] }),
      colorRow('颜色', t.color, (v) => { P.pushUndo(); t.color = v; P.invalidate(); }),
    ];
    const an = l.animator;
    if (an && an.enabled) {
      rows.push(propRow('范围起点', an.start, { prop: 'animator.start', layer: l, step: '1', unit: '%' }));
      rows.push(propRow('范围终点', an.end, { prop: 'animator.end', layer: l, step: '1', unit: '%' }));
      rows.push(propRow('偏移', an.offset, { prop: 'animator.offset', layer: l, step: '1' }));
      rows.push(propRow('位置', an.position, { prop: 'animator.position', layer: l, step: '1' }));
      rows.push(propRow('旋转', an.rotation, { prop: 'animator.rotation', layer: l, step: '1', unit: '°' }));
      rows.push(propRow('缩放', an.scale, { prop: 'animator.scale', layer: l, step: '1', unit: '%' }));
      rows.push(propRow('软边', { value: an.feather, keys: [], expr: '' }, { noAnim: true, step: '1', target: [an, 'feather'] }));
    }
    return section('文字', rows.concat([
      section('动画器', [
        (() => {
          const b = el('button', 'mini-action wide', an.enabled ? '关闭动画器' : '启用字符动画器');
          b.onclick = () => { P.pushUndo(); an.enabled = !an.enabled; P.invalidate(); AEPanels.renderProps(); };
          return b;
        })(),
        selectRow('范围', [{ label: '字符', value: 'char' }, { label: '词', value: 'word' }, { label: '行', value: 'line' }], an.range, (v) => { an.range = v; P.invalidate(); }),
      ]),
      section('几何', [
        propRow('挤出深度', { value: l.geometryDepth, keys: [], expr: '' }, { noAnim: true, step: '1', target: [l, 'geometryDepth'] }),
      ]),
    ]));
  }

  function materialProps(l) {
    const m = l.material;
    if (!m) return section('材质', []);
    return section('材质', [
      colorRow('基础色', m.color, (v) => { P.pushUndo(); m.color = v; P.invalidate(); }),
      propRow('金属度', { value: m.metalness, keys: [], expr: '' }, { noAnim: true, step: '0.05', target: [m, 'metalness'] }),
      propRow('粗糙度', { value: m.roughness, keys: [], expr: '' }, { noAnim: true, step: '0.05', target: [m, 'roughness'] }),
      colorRow('发光色', m.emissive, (v) => { P.pushUndo(); m.emissive = v; P.invalidate(); }),
      propRow('发光强度', m.emissiveIntensity, { prop: 'material.emissiveIntensity', layer: l, step: '0.1' }),
      propRow('不透明度', { value: m.opacity === undefined ? 100 : m.opacity, keys: [], expr: '' }, { noAnim: true, step: '1', unit: '%', target: [m, 'opacity'] }),
    ]);
  }

  function geoProps(l) {
    const g = l.geo || {};
    const rows = [
      selectRow('类型', [
        { label: '立方体', value: 'box' }, { label: '圆柱', value: 'cylinder' },
        { label: '平面', value: 'plane' }, { label: '自定义组合', value: 'custom' },
      ], g.kind || 'box', (v) => { P.pushUndo(); g.kind = v; P.invalidate(); AEPanels.renderProps(); }),
    ];
    if (g.kind === 'box') {
      rows.push(propRow('宽', { value: g.w || 200, keys: [], expr: '' }, { noAnim: true, step: '1', target: [g, 'w'] }));
      rows.push(propRow('高', { value: g.h || 200, keys: [], expr: '' }, { noAnim: true, step: '1', target: [g, 'h'] }));
      rows.push(propRow('深', { value: g.d || 80, keys: [], expr: '' }, { noAnim: true, step: '1', target: [g, 'd'] }));
    } else if (g.kind === 'cylinder') {
      rows.push(propRow('半径', { value: g.r || 60, keys: [], expr: '' }, { noAnim: true, step: '1', target: [g, 'r'] }));
      rows.push(propRow('高', { value: g.h || 200, keys: [], expr: '' }, { noAnim: true, step: '1', target: [g, 'h'] }));
    } else if (g.kind === 'plane') {
      rows.push(propRow('宽', { value: g.w || 2000, keys: [], expr: '' }, { noAnim: true, step: '10', target: [g, 'w'] }));
      rows.push(propRow('高', { value: g.h || 2000, keys: [], expr: '' }, { noAnim: true, step: '10', target: [g, 'h'] }));
    }
    return section('几何', rows);
  }

  function particleProps(l) {
    const p = l.particles;
    const rows = [
      propRow('发射速率', { value: p.rate, keys: [], expr: '' }, { noAnim: true, step: '1', target: [p, 'rate'] }),
      propRow('初速度', { value: p.speed, keys: [], expr: '' }, { noAnim: true, step: '10', target: [p, 'speed'] }),
      propRow('寿命', { value: p.life, keys: [], expr: '' }, { noAnim: true, step: '0.1', target: [p, 'life'] }),
      propRow('大小', { value: p.size, keys: [], expr: '' }, { noAnim: true, step: '1', target: [p, 'size'] }),
      propRow('重力', { value: p.gravity, keys: [], expr: '' }, { noAnim: true, step: '10', target: [p, 'gravity'] }),
      propRow('阻力', { value: p.drag, keys: [], expr: '' }, { noAnim: true, step: '0.01', target: [p, 'drag'] }),
      colorRow('颜色', p.color, (v) => { P.pushUndo(); p.color = v; P.invalidate(); }),
      colorRow('末端色', p.colorEnd, (v) => { P.pushUndo(); p.colorEnd = v; P.invalidate(); }),
      propRow('随机种子', { value: p.seed, keys: [], expr: '' }, { noAnim: true, step: '1', target: [p, 'seed'] }),
    ];
    if (p.colliders && p.colliders[0] && p.colliders[0].point) {
      rows.push(propRow('地面高度', { value: p.colliders[0].point[1], keys: [], expr: '' }, { noAnim: true, step: '1', target: [p.colliders[0].point, 1] }));
    }
    return section('粒子', rows);
  }

  function renderFX() {
    const host = document.getElementById('fxList');
    if (!host) return;
    const defs = [['gaussian', '高斯模糊'], ['glow', '发光'], ['shadow', '投影'], ['hue', '色相/饱和度']];
    host.innerHTML = '';
    for (const [t, n] of defs) {
      const d = el('div', 'fx-item', n);
      d.onclick = () => {
        const sel = P.activeComp().layers.filter(l => UI().selected.includes(l.id));
        if (!sel.length) { global.AppToast('请先选择图层', true); return; }
        addEffect(sel[0], t);
      };
      host.appendChild(d);
    }
  }

  function updateLive() {
    const focused = document.activeElement;
    for (const it of liveRegistry) {
      if (it.input === focused) continue;
      if (!it.input.isConnected) continue;
      let v;
      if (it.target) {
        v = it.target[0][it.target[1]];
        if (Array.isArray(v)) v = v[it.idx];
      } else {
        v = A.evalProp(it.prop, P.state.time, P.makeCtx(P.activeComp(), null, P.state.time));
        if (Array.isArray(v)) v = v[it.idx];
      }
      if (typeof v === 'number' && isFinite(v)) {
        const s = fmt(v, it.digits);
        if (it.input.value !== s) it.input.value = s;
      }
    }
  }

  function renderAll() {
    renderProject();
    renderProps();
    renderFX();
    const meta = document.getElementById('compMeta');
    if (meta) {
      const c = P.activeComp();
      meta.textContent = c.width + ' × ' + c.height + ' · ' + c.fps + ' fps · ' + c.duration.toFixed(2) + ' s';
    }
    const tl = document.getElementById('tlEmpty');
    if (tl) tl.hidden = P.activeComp().layers.length > 0;
  }

  global.AEPanels = { renderAll, renderProps, renderProject, renderFX, addEffect, updateLive };
})(window);