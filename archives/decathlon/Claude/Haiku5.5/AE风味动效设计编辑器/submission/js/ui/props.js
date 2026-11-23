/* 右侧面板：图层属性（变换、类型专属、材质与挤出）、效果与蒙版、表达式编辑、合成设置。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = AE.UI;
  const U = AE.U;
  const Model = AE.Model;
  const App = AE.App;
  const Anim = AE.Anim;
  const G = AE.Graph;
  const P = AE.Path;
  const E = UI.el;
  const Props = (UI.props = {});

  let body = null;
  let tabsEl = null;

  const TABS = [
    ['props', '属性'],
    ['fx', '效果蒙版'],
    ['expr', '表达式'],
    ['comp', '合成'],
  ];

  function layerOf() {
    return App.selectedLayer();
  }

  // 行的快捷构造
  const row = (label, child) => E('div', { class: 'frow' }, [E('span', { class: 'flabel', text: label }), child]);
  const pr = (label, layer, prop, opts) => UI.propRow(Object.assign({ label, layer, prop }, opts || {}));

  // 只读 / 编辑的基础字段
  function baseFields(layer) {
    const comp = App.comp();
    const lay = layer;
    const nameIn = UI.textInput(lay.name, (v) => App.mutate('重命名图层', (p) => (App.layer(lay.id).name = v || lay.name)));
    const enabled = UI.check(lay.enabled, (v) => App.mutate('显示开关', () => (App.layer(lay.id).enabled = v)), '显示');
    const lock = UI.check(lay.locked, (v) => App.mutate('锁定', () => (App.layer(lay.id).locked = v)), '锁定');
    const inP = UI.num({ value: lay.inPoint, step: 0.05, decimals: 2, suffix: 's', onSet: (v) => App.mutate('入点', () => (App.layer(lay.id).inPoint = Math.max(0, Math.min(v, App.layer(lay.id).outPoint - 0.04)))) });
    const outP = UI.num({ value: lay.outPoint, step: 0.05, decimals: 2, suffix: 's', onSet: (v) => App.mutate('出点', () => (App.layer(lay.id).outPoint = Math.min(comp.duration, Math.max(v, App.layer(lay.id).inPoint + 0.04)))) });
    const stt = UI.num({ value: lay.startTime, step: 0.05, decimals: 2, suffix: 's', onSet: (v) => App.mutate('开始时间', () => (App.layer(lay.id).startTime = v)) });
    const parents = [['', '无']].concat(comp.layers.filter((l) => l.id !== lay.id).map((l) => [l.id, l.name]));
    const parent = UI.select(parents, lay.parent || '', (v) => App.mutate('设置父级', () => setParent(lay.id, v || null)));
    const modes = [['normal', '正常'], ['add', '相加'], ['screen', '滤色'], ['multiply', '正片叠底'], ['overlay', '叠加']];
    const blend = UI.select(modes, lay.blend, (v) => App.mutate('混合模式', () => (App.layer(lay.id).blend = v)));
    const mattes = [['', '无']].concat(comp.layers.filter((l) => l.id !== lay.id).map((l) => [l.id, l.name]));
    const matte = UI.select(mattes, lay.matte || '', (v) => App.mutate('轨道遮罩', () => (App.layer(lay.id).matte = v || null)));
    const mm = UI.select([['alpha', 'Alpha'], ['alphaInv', 'Alpha 反转'], ['luma', '亮度'], ['lumaInv', '亮度反转']], lay.matteMode, (v) => App.mutate('遮罩模式', () => (App.layer(lay.id).matteMode = v)));
    const is3d = UI.check(lay.is3D, (v) => App.mutate('三维图层', () => (App.layer(lay.id).is3D = v)), '三维图层');
    const mb = UI.check(lay.mb, (v) => App.mutate('运动模糊开关', () => (App.layer(lay.id).mb = v)), '运动模糊');
    const castC = UI.check(lay.castShadow !== false, (v) => App.mutate('投射阴影', () => (App.layer(lay.id).castShadow = v)), '投射阴影');
    const accC = UI.check(lay.acceptShadow !== false, (v) => App.mutate('接收阴影', () => (App.layer(lay.id).acceptShadow = v)), '接收阴影');
    return E('div', { class: 'fields' }, [
      row('名称', nameIn),
      row('状态', E('div', { class: 'inline' }, [enabled, lock])),
      row('入点 / 出点', E('div', { class: 'inline' }, [inP, outP])),
      row('开始时间', stt),
      row('父级', parent),
      row('混合', blend),
      row('轨道遮罩', E('div', { class: 'inline' }, [matte, mm])),
      row('三维', is3d),
      row('模糊 / 阴影', E('div', { class: 'inline wrap' }, [mb, castC, accC])),
    ]);
  }

  // 设置 / 解除父级，保持当前画面：先记下世界矩阵，再把它分解回本地的位置、旋转、缩放（计入锚点，忽略剪切）
  function setParent(layerId, parentId) {
    const comp = App.comp();
    const layer = Model.findLayer(comp, layerId);
    const t = App.state.time;
    if (!layer) return;
    const before = worldOfLayer(comp, layer, t);
    const lt = t - (layer.startTime || 0);
    const anchor = Anim.value(comp, layer, layer.tr.anchor, t);
    layer.parent = parentId || null;
    let local = before;
    if (parentId) {
      const pw = worldOfLayer(comp, Model.findLayer(comp, parentId), t);
      const inv = AE.U.mat.invert(pw);
      if (!inv) return;
      local = AE.U.mat.mul(inv, before);
    }
    // 世界 / 本地矩阵 M = T(p) R S T(-a)  =>  p = M 的平移 + M 的线性部分 * a
    const a = [anchor[0], anchor[1], anchor[2] || 0];
    const m = local;
    const pos = [
      m[12] + m[0] * a[0] + m[4] * a[1] + m[8] * a[2],
      m[13] + m[1] * a[0] + m[5] * a[1] + m[9] * a[2],
      m[14] + m[2] * a[0] + m[6] * a[1] + m[10] * a[2],
    ];
    const e = AE.U.mat.decomposeEuler(m);
    const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]);
    Anim.write(layer, layer.tr.position, lt, pos);
    Anim.write(layer, layer.tr.rotation, lt, U.rad2deg(e[2]));
    Anim.write(layer, layer.tr.scale, lt, [sx * 100, sy * 100, 100]);
    App.liveChange();
  }
  function worldOfLayer(comp, layer, t) {
    const R = AE.Renderer.prototype.worldOf;
    return R.call({ worldOf: R }, comp, layer, t, { world: new Map(), visiting: new Set() });
  }
  Props.setParent = setParent;

  // 变换区
  function transformSection(layer) {
    const is3 = layer.is3D;
    const items = [
      pr('锚点', layer, layer.tr.anchor, { label: '锚点', decimals: 1 }),
      pr('位置', layer, layer.tr.position, { label: '位置', decimals: 1 }),
      pr('缩放', layer, layer.tr.scale, { label: '缩放', decimals: 1, suffix: '%' }),
      pr('旋转', layer, layer.tr.rotation, { label: '旋转 Z', decimals: 1, suffix: '°' }),
    ];
    if (is3) {
      items.push(pr('X 旋转', layer, layer.tr.rotationX, { label: 'X 旋转', decimals: 1, suffix: '°' }));
      items.push(pr('Y 旋转', layer, layer.tr.rotationY, { label: 'Y 旋转', decimals: 1, suffix: '°' }));
    }
    items.push(pr('不透明度', layer, layer.tr.opacity, { label: '不透明度', decimals: 1, suffix: '%', min: 0, max: 100 }));
    return UI.section('变换', items);
  }

  // ---------- 形状内容 ----------
  const ITEM_TYPES = [
    ['rect', '矩形'],
    ['ellipse', '椭圆'],
    ['path', '路径（矩形轮廓）'],
    ['fill', '填充'],
    ['stroke', '描边'],
    ['trim', '修剪路径'],
    ['repeat', '重复器'],
    ['merge:add', '合并：并集'],
    ['merge:subtract', '合并：差集'],
    ['merge:intersect', '合并：交集'],
    ['merge:exclude', '合并：排除'],
    ['group', '组'],
  ];
  function newItem(type) {
    const k = type.split(':');
    const t = k[0];
    if (t === 'rect') return { type: 'rect', pos: Model.vec([0, 0]), size: Model.vec([240, 160]), round: Model.num(0) };
    if (t === 'ellipse') return { type: 'ellipse', pos: Model.vec([0, 0]), size: Model.vec([240, 240]) };
    if (t === 'path') return { type: 'path', path: Model.path([Model.bpath(true, [[-120, -120], [120, -120], [120, 120], [-120, 120]])]) };
    if (t === 'fill') return { type: 'fill', color: Model.color([1, 1, 1]), opacity: Model.num(100) };
    if (t === 'stroke') return { type: 'stroke', color: Model.color([1, 1, 1]), opacity: Model.num(100), width: Model.num(8) };
    if (t === 'trim') return { type: 'trim', start: Model.num(0), end: Model.num(100), offset: Model.num(0) };
    if (t === 'repeat') return { type: 'repeat', copies: Model.num(3), offset: Model.vec([60, 0]), rot: Model.num(0), scale: Model.vec([100, 100]), opStart: Model.num(100), opEnd: Model.num(100) };
    if (t === 'merge') return { type: 'merge', mode: k[1] || 'add' };
    if (t === 'group') return { type: 'group', name: '组', tr: { anchor: Model.vec([0, 0]), position: Model.vec([0, 0]), scale: Model.vec([100, 100]), rotation: Model.num(0), opacity: Model.num(100) }, items: [] };
    return null;
  }
  Props.newItem = newItem;

  // 路径项的轮廓编辑：闭合 / 开放、添加孔洞（椭圆或矩形轮廓）、删除轮廓；
  // 当前时刻的轮廓列表被复制、修改后写回（有动画时写入关键帧）
  function editPathList(layerId, propId, fn) {
    App.mutate('编辑轮廓', () => {
      const lay = App.layer(layerId);
      const pp = UI.findProp(lay, propId);
      if (!pp) return;
      const t = App.state.time;
      const lt = t - (lay.startTime || 0);
      const list = JSON.parse(JSON.stringify(Anim.value(App.comp(), lay, pp, t) || []));
      const out = fn(list) || list;
      Anim.write(lay, pp, lt, out);
    });
  }
  function pathEditor(L, it) {
    const list = Anim.value(App.comp(), L, it.path, App.state.time) || [];
    const closed = list.length ? list.every((bp) => bp.closed) : false;
    const bounds = list.length ? P.bounds(P.contoursFromBPaths(list, 1)) : null;
    const sz = bounds ? Math.max(40, Math.round((bounds.x1 - bounds.x0) * 0.25)) : 80;
    return E('div', { class: 'pathed' }, [
      E('div', { class: 'muted small', text: list.length + ' 个轮廓（外轮廓与孔洞），节点与切线可在画布上直接拖动' }),
      row('闭合', UI.check(closed, (v) => editPathList(L.id, it.path.id, (l) => l.map((bp) => Object.assign(bp, { closed: v }))), '闭合路径')),
      E('div', { class: 'inline' }, [
        E('button', { class: 'btn small', onclick: () => editPathList(L.id, it.path.id, (l) => l.concat([Model.ellipsePath(0, 0, sz, sz * 0.7)])) }, '+ 椭圆轮廓'),
        E('button', { class: 'btn small', onclick: () => editPathList(L.id, it.path.id, (l) => l.concat([Model.rectPath(0, 0, sz, sz * 0.7, 0)])) }, '+ 矩形轮廓'),
        E('button', { class: 'btn small danger', disabled: list.length <= 1, onclick: () => editPathList(L.id, it.path.id, (l) => l.slice(0, -1)) }, '删除末轮廓'),
      ]),
    ]);
  }

  // 内容列表的定位：listPath 为通往该列表的组索引序列（根列表为 []）
  function listAt(lay, listPath) {
    let arr = lay.contents;
    for (const i of listPath) arr = arr[i].items;
    return arr;
  }
  // 形状内容树（递归）
  function contentTree(layer, items, listPath) {
    const wrap = E('div', { class: 'ctree' });
    (items || []).forEach((it, idx) => {
      const head = E('div', { class: 'citem-head' }, [
        E('span', { class: 'ctype', text: typeLabel(it) }),
        E('span', { class: 'grow' }),
        E('button', { class: 'mini', title: '上移', onclick: () => moveItem(layer.id, listPath, idx, -1) }, UI.ICON.up),
        E('button', { class: 'mini', title: '下移', onclick: () => moveItem(layer.id, listPath, idx, 1) }, UI.ICON.down),
        E('button', { class: 'mini', title: '删除', onclick: () => App.mutate('删除内容项', () => listAt(App.layer(layer.id), listPath).splice(idx, 1)) }, UI.ICON.x),
      ]);
      const bodyEl = E('div', { class: 'citem-body' });
      contentFields(layer, it, bodyEl, listPath, idx);
      wrap.appendChild(E('div', { class: 'citem' }, [head, bodyEl]));
    });
    const sel = UI.select([['', '添加内容…']].concat(ITEM_TYPES), '', (v) => {
      if (!v) return;
      App.mutate('添加内容', () => listAt(App.layer(layer.id), listPath).push(newItem(v)));
    });
    wrap.appendChild(E('div', { class: 'addrow' }, [sel]));
    return wrap;
  }
  function typeLabel(it) {
    const f = ITEM_TYPES.find(([k]) => k === it.type || (it.type === 'merge' && k === 'merge:' + it.mode));
    return f ? f[1] : it.type;
  }
  function moveItem(layerId, listPath, idx, dir) {
    App.mutate('调整内容顺序', () => {
      const arr = listAt(App.layer(layerId), listPath);
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return;
      const t = arr[idx];
      arr[idx] = arr[j];
      arr[j] = t;
    });
  }
  function contentFields(layer, it, host, listPath, idx) {
    const L = layer;
    const rowsOf = (defs) => defs.map(([label, prop, opts]) => pr(label, L, prop, Object.assign({ label }, opts || {})));
    if (it.type === 'rect') host.append(...rowsOf([['位置', it.pos], ['大小', it.size], ['圆角', it.round, { min: 0 }]]));
    else if (it.type === 'ellipse') host.append(...rowsOf([['位置', it.pos], ['大小', it.size]]));
    else if (it.type === 'path') host.append(pathEditor(L, it), pr('路径', L, it.path, { label: '路径' }));
    else if (it.type === 'fill') host.append(...rowsOf([['颜色', it.color], ['不透明度', it.opacity, { suffix: '%', min: 0, max: 100 }]]));
    else if (it.type === 'stroke') host.append(...rowsOf([['颜色', it.color], ['不透明度', it.opacity, { suffix: '%' }], ['宽度', it.width, { min: 0 }]]));
    else if (it.type === 'trim') host.append(...rowsOf([['起点', it.start, { suffix: '%', min: 0, max: 100 }], ['终点', it.end, { suffix: '%', min: 0, max: 100 }], ['偏移', it.offset, { suffix: '%' }]]));
    else if (it.type === 'repeat') host.append(...rowsOf([['副本数', it.copies, { min: 1, max: 60, decimals: 0 }], ['偏移', it.offset], ['旋转', it.rot, { suffix: '°' }], ['缩放', it.scale, { suffix: '%' }], ['起始不透明', it.opStart, { suffix: '%' }], ['结束不透明', it.opEnd, { suffix: '%' }]]));
    else if (it.type === 'merge') {
      host.append(row('模式', UI.select([['add', '并集'], ['subtract', '差集（前减后）'], ['intersect', '交集'], ['exclude', '排除']], it.mode, (v) => App.mutate('合并模式', () => (listAt(App.layer(L.id), listPath)[idx].mode = v)))));
    } else if (it.type === 'group') {
      host.append(...[['锚点', it.tr.anchor], ['位置', it.tr.position], ['缩放', it.tr.scale, { suffix: '%' }], ['旋转', it.tr.rotation, { suffix: '°' }], ['不透明度', it.tr.opacity, { suffix: '%' }]].map(([l, p, o]) => pr(l, L, p, Object.assign({ label: l }, o || {}))));
      host.append(E('div', { class: 'sub' }, [contentTree(L, it.items, listPath.concat([idx]))]));
    }
  }

  // ---------- 文字 ----------
  function textSection(layer) {
    const tx = layer.text;
    const area = E('textarea', { class: 'txtarea', rows: 3 }, tx.text.v);
    area.addEventListener('change', () => UI.writeProp(layer, tx.text, area.value, '修改文字'));
    area.addEventListener('keydown', (e) => e.stopPropagation());
    const fonts = Object.keys(AE.Text.FONTS).map((k) => [k, AE.Text.FONTS[k].label]);
    const lay = AE.Text.layout({ text: tx.text.v, font: tx.font, size: Anim.keyValue(tx.size, 0), leading: 300, tracking: 0, align: tx.align });
    const miss = lay.missing ? E('div', { class: 'warn', text: '字体不含 ' + lay.missing + ' 个字符（显示为空）' }) : null;
    const animators = tx.animators.map((an, i) =>
      UI.section('动画器 ' + (i + 1) + ' · ' + an.name, [
        row('名称', UI.textInput(an.name, (v) => App.mutate('动画器名', () => (App.layer(layer.id).text.animators[i].name = v)))),
        row('单位', UI.select([['char', '逐字'], ['word', '逐词'], ['line', '逐行']], an.unit, (v) => App.mutate('动画器单位', () => (App.layer(layer.id).text.animators[i].unit = v)))),
        pr('起点', layer, an.start, { label: '起点', suffix: '%', min: 0, max: 100 }),
        pr('终点', layer, an.end, { label: '终点', suffix: '%', min: 0, max: 100 }),
        pr('偏移', layer, an.offset, { label: '偏移', suffix: '%' }),
        pr('软边', layer, an.softness, { label: '软边', suffix: '%', min: 0 }),
        pr('位置', layer, an.pos, { label: '位置' }),
        pr('旋转', layer, an.rot, { label: '旋转', suffix: '°' }),
        pr('缩放', layer, an.scale, { label: '缩放', suffix: '%' }),
        pr('不透明度', layer, an.opacity, { label: '不透明度', suffix: '%' }),
        E('button', { class: 'btn small danger', onclick: () => App.mutate('删除动画器', () => App.layer(layer.id).text.animators.splice(i, 1)) }, '删除动画器'),
      ].filter(Boolean))
    );
    const addAn = E('button', { class: 'btn small', onclick: () => App.mutate('添加文字动画器', () => App.layer(layer.id).text.animators.push(newAnimator(tx.animators.length + 1))) }, '+ 文字动画器（逐字位移 / 旋转 / 缩放 / 透明）');
    return UI.section('文字', [
      row('内容', area),
      miss,
      row('字体', UI.select(fonts, tx.font, (v) => App.mutate('字体', () => (App.layer(layer.id).text.font = v)))),
      row('自动笔画', UI.check(!!layer.autoStroke, (v) => App.mutate('自动笔画', () => { App.layer(layer.id).autoStroke = v ? { start: 0, span: 2.6 } : null; }), '按字形逐笔书写（遮罩随文字重新生成）')),
      pr('字号', layer, tx.size, { label: '字号', min: 4, decimals: 0 }),
      pr('行距', layer, tx.leading, { label: '行距', decimals: 0 }),
      pr('字距', layer, tx.tracking, { label: '字距', decimals: 0 }),
      row('对齐', UI.select([['left', '左'], ['center', '中'], ['right', '右']], tx.align, (v) => App.mutate('对齐', () => (App.layer(layer.id).text.align = v)))),
      pr('填充颜色', layer, layer.fill.color, { label: '填充颜色' }),
      pr('填充不透明', layer, layer.fill.opacity, { label: '填充不透明', suffix: '%' }),
      E('div', { class: 'muted small', text: AE.Text.COVERAGE }),
      ...animators,
      addAn,
    ]);
  }
  function newAnimator(n) {
    return {
      name: '动画器' + n,
      unit: 'char',
      start: Model.num(0),
      end: Model.num(100),
      offset: Model.num(0),
      softness: Model.num(30),
      pos: Model.vec([0, 0]),
      rot: Model.num(0),
      scale: Model.vec([100, 100]),
      opacity: Model.num(100),
    };
  }

  // ---------- 材质 / 挤出 ----------
  function materialSection(layer) {
    const m = layer.mat || (layer.geo && layer.geo.mat);
    if (!m) return null;
    const items = [pr('基础色', layer, m.color, { label: '基础色' }), pr('金属度', layer, m.metal, { label: '金属度', min: 0, max: 1, step: 0.05, decimals: 2 }), pr('粗糙度', layer, m.rough, { label: '粗糙度', min: 0.04, max: 1, step: 0.05, decimals: 2 }), pr('发光', layer, m.emit, { label: '发光', min: 0, step: 0.05, decimals: 2 }), pr('发光颜色', layer, m.emitColor, { label: '发光颜色' }), pr('材质不透明', layer, m.alpha, { label: '材质不透明', suffix: '%', min: 0, max: 100 })];
    const secs = [UI.section('材质', items)];
    if (layer.extrude) secs.push(UI.section('挤出', [pr('深度', layer, layer.extrude.depth, { label: '深度', min: 0 }), pr('倒角', layer, layer.extrude.bevel, { label: '倒角', min: 0 })]));
    return secs;
  }

  // ---------- 图层类型专属 ----------
  function typeSections(layer) {
    const comp = App.comp();
    const out = [];
    if (layer.type === 'shape') {
      out.push(UI.section('形状内容', [contentTree(layer, layer.contents, [])]));
    }
    if (layer.type === 'text') out.push(textSection(layer));
    if (layer.type === 'precomp') {
      const compOpts = App.project.comps.filter((c) => c.id !== comp.id).map((c) => [c.id, c.name]);
      out.push(
        UI.section('预合成', [
          row('合成', UI.select([['', '（未选择）']].concat(compOpts), layer.pre.comp || '', (v) => App.mutate('预合成源', () => (App.layer(layer.id).pre.comp = v || null)))),
          row('时间重映射', UI.check(!!layer.pre.remap, (v) => App.mutate('时间重映射', () => {
            const l = App.layer(layer.id);
            l.pre.remap = v ? Model.num(Math.max(0, App.state.time - (l.startTime || 0))) : null;
          }), '启用（秒，可关键帧 / 变速 / 倒放 / 定格）')),
          layer.pre.remap ? pr('重映射时间', layer, layer.pre.remap, { label: '重映射', decimals: 2, suffix: 's', min: 0 }) : null,
          row('子合成起点', UI.num({ value: layer.pre.start || 0, decimals: 2, suffix: 's', onSet: (v) => App.mutate('子合成起点', () => (App.layer(layer.id).pre.start = v)) })),
          E('div', { class: 'muted small', text: '同一合成可在多个预合成图层中引用，各引用拥有独立的时间与变换。' }),
        ].filter(Boolean))
      );
    }
    if (layer.type === 'camera') {
      out.push(
        UI.section('摄像机', [
          pr('目标点', layer, layer.cam.poi, { label: '目标点' }),
          pr('缩放（焦距）', layer, layer.cam.zoom, { label: '缩放', min: 1, decimals: 0 }),
          row('景深', UI.check(layer.cam.dof, (v) => App.mutate('景深开关', () => (App.layer(layer.id).cam.dof = v)), '启用')),
          pr('对焦距离', layer, layer.cam.focus, { label: '对焦距离', min: 1, decimals: 0 }),
          pr('光圈', layer, layer.cam.aperture, { label: '光圈', min: 0, decimals: 1 }),
        ])
      );
    }
    if (layer.type === 'light') {
      out.push(
        UI.section('灯光', [
          row('类型', UI.select([['parallel', '平行光'], ['point', '点光源']], layer.light.kind, (v) => App.mutate('灯光类型', () => (App.layer(layer.id).light.kind = v)))),
          pr('颜色', layer, layer.light.color, { label: '颜色' }),
          pr('强度', layer, layer.light.intensity, { label: '强度', suffix: '%', min: 0 }),
          layer.light.kind === 'parallel' ? pr('照射目标', layer, layer.light.poi, { label: '照射目标' }) : null,
          row('投射阴影', UI.check(layer.light.shadow, (v) => App.mutate('灯光阴影', () => (App.layer(layer.id).light.shadow = v)), '启用')),
          pr('阴影深度', layer, layer.light.shadowDark, { label: '阴影深度', suffix: '%', min: 0, max: 100 }),
        ].filter(Boolean))
      );
    }
    if (layer.type === 'geo') {
      out.push(geoSourceSection(layer));
    }
    if (layer.type === 'particles') out.push(particleSections(layer));
    if (layer.type === 'sound') out.push(soundSection(layer));
    return out;
  }

  // 几何来源：选择节点图与输出节点
  function geoSourceSection(layer) {
    const graphs = App.project.graphs || [];
    const src = layer.geo.source || {};
    const gSel = UI.select([['', '（未选择）']].concat(graphs.map((g) => [g.id, g.name])), src.graph || '', (v) => App.mutate('几何来源图', () => {
      const l = App.layer(layer.id);
      l.geo.source = v ? { graph: v, node: '' } : null;
    }));
    const g = graphs.find((x) => x.id === src.graph);
    const nodes = g ? g.nodes.filter((n) => G.typeInfo(n.type).outputs.some((o) => o.type === 'geometry') || n.type === 'group') : [];
    const nSel = UI.select([['', '（未选择）']].concat(nodes.map((n) => [n.id, G.typeInfo(n.type).label + ' · ' + n.id.slice(-4)])), src.node || '', (v) => App.mutate('几何输出节点', () => (App.layer(layer.id).geo.source.node = v)));
    const openBtn = E('button', { class: 'btn small', onclick: () => { App.state.selectedGraph = src.graph; App.state.bottomTab = 'nodes'; App.notify(); } }, '在节点编辑器中打开');
    const newGraph = E('button', { class: 'btn small', onclick: () => App.mutate('新建节点图', () => {
      const ng = G.newGraph('几何节点图 ' + ((App.project.graphs || []).length + 1));
      const tx = G.newNode(ng, 'text', -300, 0, { text: '火', size: 300 });
      const ex = G.newNode(ng, 'extrude', 0, 0, { depth: 120 });
      ex.ins.geo = { node: tx.id, port: 'out' };
      App.project.graphs.push(ng);
      App.layer(layer.id).geo.source = { graph: ng.id, node: ex.id };
    }) }, '+ 新建节点图');
    return UI.section('几何来源（节点图）', [row('节点图', gSel), row('输出', nSel), E('div', { class: 'inline' }, [openBtn, newGraph])]);
  }

  // 碰撞体来源：几何图层，或节点图中的几何输出（同一个几何输出可同时被显示、变形、发射与碰撞）
  function colliderOptions(layer) {
    const opts = [['', '（无）']];
    App.comp().layers.forEach((l) => {
      if (l.id !== layer.id && (l.type === 'geo' || l.type === 'shape' || l.type === 'text')) opts.push(['L:' + l.id, '图层 · ' + l.name]);
    });
    (App.project.graphs || []).forEach((g) =>
      g.nodes.filter((n) => G.typeInfo(n.type).outputs.some((o) => o.type === 'geometry')).forEach((n) => opts.push(['G:' + g.id + '|' + n.id, '节点 · ' + g.name + ' · ' + G.typeInfo(n.type).label]))
    );
    return opts;
  }
  function setCollider(layerId, i, v) {
    const cc = App.layer(layerId).particles.colliders[i];
    if (!cc) return;
    delete cc.graph;
    delete cc.node;
    cc.layer = null;
    if (v.startsWith('L:')) cc.layer = v.slice(2);
    else if (v.startsWith('G:')) {
      const [g, n] = v.slice(2).split('|');
      cc.graph = g;
      cc.node = n;
    }
  }

  // 粒子：发射器、全局、碰撞、场、拖尾
  function particleSections(layer) {
    const pr2 = layer.particles;
    const comp = App.comp();
    const layerOpts = [['', '（无）']].concat(comp.layers.filter((l) => l.id !== layer.id).map((l) => [l.id, l.name]));
    const ems = pr2.emitters.map((e, i) => {
      const head = E('div', { class: 'citem-head' }, [E('span', { class: 'ctype', text: '发射器 · ' + e.name }), E('span', { class: 'grow' }), E('button', { class: 'mini', onclick: () => App.mutate('删除发射器', () => App.layer(layer.id).particles.emitters.splice(i, 1)) }, UI.ICON.x)]);
      const kind = UI.select([['point', '点'], ['curve', '形状曲线'], ['surface', '几何表面']], e.src.kind, (v) => App.mutate('发射源', () => (App.layer(layer.id).particles.emitters[i].src.kind = v)));
      const srcLayer = UI.select(layerOpts, e.src.layer || '', (v) => App.mutate('发射源图层', () => (App.layer(layer.id).particles.emitters[i].src.layer = v || null)));
      const on = UI.check(e.on, (v) => App.mutate('发射器开关', () => (App.layer(layer.id).particles.emitters[i].on = v)), '启用');
      return E('div', { class: 'citem' }, [
        head,
        E('div', { class: 'citem-body' }, [
          row('启用 / 来源', E('div', { class: 'inline' }, [on, kind])),
          row('来源图层', srcLayer),
          pr('发射位置', layer, e.pos, { label: '位置' }),
          pr('方向', layer, e.dir, { label: '方向' }),
          pr('速率/秒', layer, e.rate, { label: '速率', min: 0, decimals: 0 }),
          pr('初速度', layer, e.speed, { label: '初速度', min: 0, decimals: 0 }),
          pr('扩散角', layer, e.spread, { label: '扩散角', suffix: '°', min: 0, max: 180, decimals: 0 }),
          pr('寿命', layer, e.life, { label: '寿命', suffix: 's', min: 0.05, decimals: 2 }),
        ]),
      ]);
    });
    const addEm = E('button', { class: 'btn small', onclick: () => App.mutate('新增发射器', () => App.layer(layer.id).particles.emitters.push(AE.Particles.newEmitter('发射器 ' + (pr2.emitters.length + 1), { pos: [0, 0, 0], dir: [0, -1, 0], rate: 40 }))) }, '+ 发射器');
    const colls = pr2.colliders.map((c, i) =>
      E('div', { class: 'citem-head' }, [
        E('span', { class: 'ctype', text: c.kind === 'plane' ? '平面碰撞' : '几何碰撞' }),
        c.kind === 'plane' ? E('span', { class: 'muted small', text: '' }) : UI.select(colliderOptions(layer), c.layer ? 'L:' + c.layer : c.graph ? 'G:' + c.graph + '|' + c.node : '', (v) => App.mutate('碰撞体来源', () => setCollider(layer.id, i, v))),
        E('span', { class: 'grow' }),
        E('button', { class: 'mini', onclick: () => App.mutate('删除碰撞体', () => App.layer(layer.id).particles.colliders.splice(i, 1)) }, UI.ICON.x),
      ])
    );
    const planeBtn = E('button', { class: 'btn small', onclick: () => App.mutate('添加平面碰撞', () => App.layer(layer.id).particles.colliders.push({ kind: 'plane', pos: Model.vec([0, 0, 0]), normal: Model.vec([0, -1, 0]) })) }, '+ 平面');
    const geoBtn = E('button', { class: 'btn small', onclick: () => App.mutate('添加几何碰撞', () => App.layer(layer.id).particles.colliders.push({ kind: 'geo', layer: null })) }, '+ 几何图层');
    const fieldRows = (pr2.fields || []).map((f, i) => E('div', { class: 'citem-head' }, [E('span', { class: 'ctype', text: '场引用 ' + (i + 1) }), E('span', { class: 'grow' }), E('button', { class: 'mini', onclick: () => App.mutate('删除场引用', () => App.layer(layer.id).particles.fields.splice(i, 1)) }, UI.ICON.x)]));
    const fieldOpts = [['', '选择节点图场…']];
    (App.project.graphs || []).forEach((g) => g.nodes.filter((n) => G.typeInfo(n.type).outputs.some((o) => o.type === 'field')).forEach((n) => fieldOpts.push([g.id + '|' + n.id, g.name + ' · ' + G.typeInfo(n.type).label])));
    const fieldSel = UI.select(fieldOpts, '', (v) => {
      if (!v) return;
      const [gid, nid] = v.split('|');
      App.mutate('添加场', () => App.layer(layer.id).particles.fields.push({ graph: gid, node: nid }));
    });
    const trail = pr2.trail;
    return UI.section('粒子系统', [
      ...ems,
      addEm,
      UI.section('全局', [pr('重力', layer, pr2.gravity, { label: '重力' }), pr('阻力', layer, pr2.drag, { label: '阻力', min: 0, decimals: 2 }), pr('弹性', layer, pr2.restitution, { label: '弹性', min: 0, max: 1, decimals: 2 }), pr('摩擦', layer, pr2.friction, { label: '摩擦', min: 0, max: 1, decimals: 2 }), pr2.hitLife ? pr('碰撞寿命', layer, pr2.hitLife, { label: '碰撞寿命倍率', min: 0.05, max: 2, decimals: 2 }) : null, pr('大小', layer, pr2.size, { label: '起始大小', min: 0, decimals: 1 }), pr('终止大小', layer, pr2.sizeEnd, { label: '终止大小', min: 0, decimals: 1 }), pr('颜色', layer, pr2.color, { label: '起始颜色' }), pr('终止颜色', layer, pr2.colorEnd, { label: '终止颜色' }), row('最大粒子数', UI.num({ value: pr2.maxParticles, decimals: 0, min: 10, max: 20000, onSet: (v) => App.mutate('最大粒子数', () => (App.layer(layer.id).particles.maxParticles = v)) })), row('随机种子', UI.num({ value: pr2.seed, decimals: 0, onSet: (v) => App.mutate('随机种子', () => (App.layer(layer.id).particles.seed = v)) }))]),
      UI.section('碰撞体', [...colls, E('div', { class: 'inline' }, [planeBtn, geoBtn])]),
      UI.section('场（与几何共享的空间场）', [...fieldRows, row('添加', fieldSel)]),
      UI.section('拖尾', [row('启用', UI.check(trail.on, (v) => App.mutate('拖尾开关', () => (App.layer(layer.id).particles.trail.on = v)), '实际轨迹拖尾')), pr('长度（采样）', layer, trail.length, { label: '长度', decimals: 0, min: 1 }), pr('宽度', layer, trail.width, { label: '宽度', min: 0 }), pr('消退', layer, trail.fade, { label: '消退', suffix: '%', min: 0, max: 100 })]),
      UI.section('次级发射', [row('启用', UI.check(!!(pr2.secondary && pr2.secondary.on), (v) => App.mutate('次级发射', () => { const p = App.layer(layer.id).particles; p.secondary = p.secondary || { on: false, count: Model.num(3), speed: Model.num(300), life: Model.num(0.4) }; p.secondary.on = v; }), '碰撞时生成粒子'))], { collapsed: true }),
    ]);
  }

  // 音色：事件列表
  function soundSection(layer) {
    const s = layer.sound;
    const names = AE.Audio ? AE.Audio.INSTRUMENTS : [['hit', '锤击'], ['spark', '火星'], ['bed', '炉火底噪'], ['tone', '音调']];
    const evs = s.events.map((ev, i) =>
      E('div', { class: 'frow ev' }, [
        UI.num({ value: ev.t, decimals: 2, suffix: 's', width: '60px', onSet: (v) => App.mutate('音效时间', () => (App.layer(layer.id).sound.events[i].t = v)) }),
        UI.num({ value: ev.pitch || 1, decimals: 2, width: '46px', title: '音高', onSet: (v) => App.mutate('音高', () => (App.layer(layer.id).sound.events[i].pitch = v)) }),
        UI.num({ value: ev.gain === undefined ? 1 : ev.gain, decimals: 2, width: '46px', title: '音量', onSet: (v) => App.mutate('音量', () => (App.layer(layer.id).sound.events[i].gain = v)) }),
        E('button', { class: 'mini', onclick: () => App.mutate('删除音效', () => App.layer(layer.id).sound.events.splice(i, 1)) }, UI.ICON.x),
      ])
    );
    return UI.section('音色', [
      row('音色', UI.select(names, s.instrument, (v) => App.mutate('音色', () => (App.layer(layer.id).sound.instrument = v)))),
      pr('音量', layer, s.volume, { label: '音量', suffix: '%', min: 0 }),
      E('div', { class: 'muted small', text: '事件：时间 / 音高倍率 / 音量（相对图层时间）' }),
      ...evs,
      E('button', { class: 'btn small', onclick: () => App.mutate('添加音效', () => App.layer(layer.id).sound.events.push({ t: Math.max(0, App.state.time - (layer.startTime || 0)), pitch: 1, gain: 1 })) }, '+ 事件（当前时间）'),
    ]);
  }

  // ---------- 效果与蒙版 ----------
  const FX_DEFS = {
    blur: { label: '高斯模糊', params: [['radius', '模糊半径', 'num', { min: 0, suffix: 'px' }]] },
    glow: { label: '发光', params: [['threshold', '阈值', 'num', { min: 0, max: 100, suffix: '%' }], ['radius', '半径', 'num', { min: 0 }], ['intensity', '强度', 'num', { min: 0, suffix: '%' }], ['color', '颜色', 'color']] },
    shadow: { label: '投影', params: [['opacity', '不透明', 'num', { min: 0, max: 100, suffix: '%' }], ['distance', '距离', 'num', { min: 0 }], ['direction', '方向', 'num', { suffix: '°' }], ['softness', '柔化', 'num', { min: 0 }], ['color', '颜色', 'color']] },
    hsl: { label: '色相/饱和度/亮度', params: [['hue', '色相', 'num', { suffix: '°' }], ['sat', '饱和度', 'num', { suffix: '%' }], ['light', '亮度', 'num', { suffix: '%' }]] },
  };
  Props.FX_DEFS = FX_DEFS;
  function newEffect(type) {
    const d = FX_DEFS[type];
    const params = {};
    const init = { blur: { radius: 10 }, glow: { threshold: 50, radius: 20, intensity: 100, color: [1, 1, 1] }, shadow: { opacity: 70, distance: 12, direction: 135, softness: 6, color: [0, 0, 0] }, hsl: { hue: 0, sat: 0, light: 0 } }[type];
    d.params.forEach(([k, , kind]) => {
      const v = init[k];
      params[k] = kind === 'color' ? Model.color(v) : Model.num(v);
    });
    return { type, name: d.label, on: true, params };
  }

  function effectsTab(layer) {
    const fxs = layer.effects.map((fx, i) => {
      const d = FX_DEFS[fx.type];
      const head = E('div', { class: 'citem-head' }, [
        UI.check(fx.on !== false, (v) => App.mutate('效果开关', () => (App.layer(layer.id).effects[i].on = v))),
        E('span', { class: 'ctype', text: fx.name || d.label }),
        E('span', { class: 'grow' }),
        E('button', { class: 'mini', onclick: () => App.mutate('效果上移', () => swap(App.layer(layer.id).effects, i, i - 1)) }, UI.ICON.up),
        E('button', { class: 'mini', onclick: () => App.mutate('效果下移', () => swap(App.layer(layer.id).effects, i, i + 1)) }, UI.ICON.down),
        E('button', { class: 'mini', onclick: () => App.mutate('删除效果', () => App.layer(layer.id).effects.splice(i, 1)) }, UI.ICON.x),
      ]);
      return E('div', { class: 'citem' }, [head, E('div', { class: 'citem-body' }, d.params.map(([k, label, kind, o]) => pr(label, layer, fx.params[k], Object.assign({ label, kind }, o || {}))))]);
    });
    const addSel = UI.select([['', '添加效果…'], ['blur', '高斯模糊'], ['glow', '发光'], ['shadow', '投影'], ['hsl', '色相/饱和度/亮度']], '', (v) => {
      if (!v) return;
      App.mutate('添加效果', () => App.layer(layer.id).effects.push(newEffect(v)));
    });
    return [UI.section('效果', [...fxs, E('div', { class: 'addrow' }, [addSel]), E('div', { class: 'muted small', text: '效果按顺序处理；发光与投影可超出图层边界。' })])];
  }
  function swap(arr, i, j) {
    if (j < 0 || j >= arr.length) return;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }

  function masksSection(layer) {
    const ms = layer.masks.map((m, i) => {
      const head = E('div', { class: 'citem-head' }, [
        E('span', { class: 'ctype', text: m.name || '蒙版 ' + (i + 1) }),
        UI.select([['add', '相加'], ['subtract', '相减'], ['intersect', '相交'], ['none', '无']], m.mode, (v) => App.mutate('蒙版模式', () => (App.layer(layer.id).masks[i].mode = v))),
        UI.check(m.inv, (v) => App.mutate('反转蒙版', () => (App.layer(layer.id).masks[i].inv = v)), '反转'),
        E('span', { class: 'grow' }),
        E('button', { class: 'mini', onclick: () => App.mutate('删除蒙版', () => App.layer(layer.id).masks.splice(i, 1)) }, UI.ICON.x),
      ]);
      return E('div', { class: 'citem' }, [head, E('div', { class: 'citem-body' }, [pr('路径', layer, m.path, { label: '形状' }), pr('羽化', layer, m.feather, { label: '羽化', min: 0, suffix: 'px' }), pr('不透明', layer, m.opacity, { label: '不透明', suffix: '%', min: 0, max: 100 })])]);
    });
    const addM = (shape) =>
      E('button', { class: 'btn small', onclick: () => App.mutate('添加蒙版', () => {
        const l = App.layer(layer.id);
        // 蒙版形状位于图层本地坐标中心（随图层变换移动）
        const bp = shape === 'ellipse' ? Model.ellipsePath(0, 0, 480, 320) : Model.rectPath(0, 0, 480, 320, 0);
        l.masks.push({ name: shape === 'ellipse' ? '椭圆蒙版' : '矩形蒙版', mode: 'add', inv: false, path: Model.path([bp]), feather: Model.num(0), opacity: Model.num(100), expand: Model.num(0) });
      }) }, shape === 'ellipse' ? '+ 椭圆蒙版' : '+ 矩形蒙版');
    return UI.section('蒙版（图层本地坐标）', [...ms, E('div', { class: 'inline' }, [addM('rect'), addM('ellipse')])]);
  }

  // ---------- 表达式 ----------
  function exprTab() {
    const sp = App.state.selProp;
    const host = E('div', { class: 'expr' });
    if (!sp) {
      host.append(E('div', { class: 'muted', text: '在属性行右侧点击 fx 按钮，选择要编辑表达式的属性。' }));
      host.append(E('div', { class: 'muted small', text: '可用：time、value、wiggle(频率,幅度)、loopOut("cycle"|"pingpong")、linear(t,a,b,c,d)、ease(t,a,b,c,d)、thisComp.layer("名称").transform.rotation、valueAtTime(t)。' }));
      return host;
    }
    const layer = App.layer(sp.layer);
    const prop = layer && UI.findProp(layer, sp.prop);
    if (!prop) {
      host.append(E('div', { class: 'muted', text: '所选属性已不存在。' }));
      return host;
    }
    host.append(E('div', { class: 'expr-title', text: '属性：' + layer.name + ' · ' + (sp.label || prop.kind) }));
    const area = E('textarea', { class: 'code', rows: 8, spellcheck: 'false' }, prop.expr || '');
    area.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) apply();
    });
    const err = E('div', { class: 'expr-err-text' });
    const on = UI.check(prop.exprOn !== false, (v) => App.mutate('表达式开关', () => (UI.findProp(App.layer(layer.id), prop.id).exprOn = v)), '启用表达式');
    function apply() {
      App.mutate('表达式', () => {
        const pp = UI.findProp(App.layer(layer.id), prop.id);
        pp.expr = area.value.trim();
        pp.exprOn = true;
      });
      const e2 = AE.Expr.errors.get(prop.id);
      err.textContent = e2 || (area.value.trim() ? '已应用' : '已清除');
    }
    const clear = E('button', { class: 'btn small danger', onclick: () => { area.value = ''; apply(); } }, '清除表达式');
    const btn = E('button', { class: 'btn small primary', onclick: apply }, '应用（Ctrl+Enter）');
    host.append(area, E('div', { class: 'inline' }, [on, btn, clear]), err);
    const refreshErr = () => {
      const e2 = AE.Expr.errors.get(prop.id);
      err.textContent = e2 || (prop.expr ? '当前值：' + JSON.stringify(Anim.value(App.comp(), layer, prop, App.state.time)).slice(0, 60) : '未设置表达式');
      err.classList.toggle('bad', !!e2);
    };
    refreshErr();
    host._refresh = refreshErr;
    return host;
  }

  // ---------- 合成设置 ----------
  function compTab() {
    const c = App.comp();
    const wrap = E('div', { class: 'fields' });
    const set = (label, key, v) => App.mutate('合成设置', () => (App.comp()[key] = v));
    wrap.append(
      row('合成名', UI.textInput(c.name, (v) => set('名称', 'name', v || c.name))),
      row('尺寸', E('div', { class: 'inline' }, [UI.num({ value: c.width, decimals: 0, width: '70px', onSet: (v) => set('宽', 'width', Math.round(v)) }), E('span', { text: '×' }), UI.num({ value: c.height, decimals: 0, width: '70px', onSet: (v) => set('高', 'height', Math.round(v)) })])),
      row('帧率', UI.num({ value: c.fps, decimals: 0, width: '70px', onSet: (v) => set('帧率', 'fps', Math.max(1, Math.round(v))) })),
      row('时长', UI.num({ value: c.duration, decimals: 2, suffix: 's', width: '80px', onSet: (v) => App.mutate('时长', () => { App.comp().duration = v; App.comp().workEnd = Math.min(App.comp().workEnd, v); }) })),
      row('工作区', E('div', { class: 'inline' }, [UI.num({ value: c.workStart, decimals: 2, width: '60px', onSet: (v) => set('工作区起点', 'workStart', Math.max(0, Math.min(v, c.workEnd - 0.1))) }), UI.num({ value: c.workEnd, decimals: 2, width: '60px', onSet: (v) => set('工作区终点', 'workEnd', Math.min(c.duration, Math.max(v, c.workStart + 0.1))) })])),
      row('背景色', UI.color(c.bg, () => {}, (rgb) => set('背景', 'bg', rgb))),
      row('运动模糊', UI.check(c.motionBlur, (v) => set('运动模糊', 'motionBlur', v), '合成总开关')),
      row('快门角度', UI.num({ value: c.shutter, decimals: 0, suffix: '°', onSet: (v) => set('快门角度', 'shutter', v) })),
      row('快门相位', UI.num({ value: c.phase, decimals: 0, suffix: '°', onSet: (v) => set('快门相位', 'phase', v) })),
      row('采样数', UI.num({ value: c.mbSamples, decimals: 0, min: 2, max: 32, onSet: (v) => set('采样数', 'mbSamples', Math.round(v)) })),
      E('div', { class: 'inline' }, [
        E('button', { class: 'btn small primary', onclick: () => precompose() }, '预合成所选图层 (Ctrl+Shift+C)'),
        E('button', { class: 'btn small', onclick: () => App.mutate('新建合成', () => { const n = Model.newComp({ name: '合成 ' + (App.project.comps.length + 1), width: c.width, height: c.height, fps: c.fps, duration: c.duration }); App.project.comps.push(n); App.project.activeComp = n.id; App.state.compId = n.id; }) }, '+ 新建合成'),
      ]),
    );
    return wrap;
  }

  // 预合成：把所选图层移入新合成，原位置放置预合成图层
  function precompose() {
    const c = App.comp();
    const ids = App.state.selected.filter((id) => c.layers.some((l) => l.id === id));
    if (!ids.length) return App.toast('请先选择要预合成的图层');
    App.mutate('预合成', () => {
      const cc = App.comp();
      const moved = cc.layers.filter((l) => ids.includes(l.id));
      const idx = cc.layers.findIndex((l) => ids.includes(l.id));
      const nc = Model.newComp({ name: '预合成 ' + (App.project.comps.length + 1), width: cc.width, height: cc.height, fps: cc.fps, duration: cc.duration, bg: [0, 0, 0] });
      nc.layers = moved;
      App.project.comps.push(nc);
      cc.layers = cc.layers.filter((l) => !ids.includes(l.id));
      const pl = Model.createLayer(cc, 'precomp', { name: nc.name, comp: nc.id, inPoint: cc.workStart, outPoint: cc.workEnd });
      pl.tr.position = Model.vec([cc.width / 2, cc.height / 2, 0]);
      cc.layers.splice(Math.max(0, idx), 0, pl);
      App.state.selected = [pl.id];
    });
  }
  Props.precompose = precompose;

  // ---------- 面板组装 ----------
  function buildLayerProps(layer) {
    const wrap = E('div', { class: 'props' });
    const head = E('div', { class: 'phead' }, [E('span', { class: 'ticon', text: UI.typeIcon[layer.type] || '?' }), E('span', { class: 'ptype', text: Model.typeName(layer.type) })]);
    wrap.append(head, UI.section('基础', [baseFields(layer)]), transformSection(layer));
    typeSections(layer).forEach((s) => wrap.append(s));
    const mat = materialSection(layer);
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((s) => wrap.append(s));
    return wrap;
  }

  function buildFx(layer) {
    const wrap = E('div', { class: 'props' });
    if (!layer) return E('div', { class: 'muted', text: '选择一个图层以编辑效果与蒙版。' });
    wrap.append(...effectsTab(layer));
    wrap.append(masksSection(layer));
    return wrap;
  }

  Props.full = () => {
    if (!body || !App.comp()) return;
    UI.clear(body);
    const tab = App.state.rightTab;
    const layer = layerOf();
    if (tab === 'props') {
      if (!layer) {
        const c = App.comp();
        body.append(E('div', { class: 'empty' }, [E('div', { class: 'big', text: '未选择图层' }), E('div', { class: 'muted', text: c.layers.length ? '在时间轴或画布中选择图层。' : '空工程：使用顶部“图层”菜单或左侧按钮新建图层。' })]));
      } else {
        const n = App.state.selected.length;
        if (n > 1) body.append(E('div', { class: 'multi-note' }, '已选择 ' + n + ' 个图层；属性面板显示首个图层，时间轴与画布中的操作作用于全部所选图层。'));
        body.append(buildLayerProps(layer));
      }
    } else if (tab === 'fx') body.append(buildFx(layer));
    else if (tab === 'expr') {
      const ex = exprTab();
      body.append(ex);
      Props._exprHost = ex;
    } else if (tab === 'comp') body.append(compTab());
    renderTabs();
  };
  function renderTabs() {
    if (!tabsEl) return;
    UI.clear(tabsEl);
    TABS.forEach(([k, label]) => {
      tabsEl.append(
        E('button', {
          class: 'tab' + (App.state.rightTab === k ? ' on' : ''),
          onclick: () => {
            App.state.rightTab = k;
            Props.full();
          },
        }, label)
      );
    });
  }
  Props.values = () => {
    // 数值随时间变化：刷新属性行与表达式
    if (!body) return;
    body.querySelectorAll('.prow').forEach((r) => r.refresh && r.refresh());
    body.querySelectorAll('input.num, input.txt, select.sel, input[type=color]').forEach(() => {});
    if (Props._exprHost && Props._exprHost._refresh) Props._exprHost._refresh();
  };
  UI.focusExpr = () => {};

  Props.init = () => {
    body = document.getElementById('rightBody');
    tabsEl = document.getElementById('rightTabs');
    UI.register({
      full: () => Props.full(),
      time: () => Props.values(),
      values: () => Props.values(),
    });
  };
  void TABS;
  void FX_DEFS;
  void U;
})();
