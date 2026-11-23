const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  esc = (s) =>
    String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
const paths = {
  folder: 'M3 7V5h7l2 3h9v12H3z',
  comp: 'M3 5h18v15H3z M3 10h18 M7 5l3 5m4-5 3 5',
  undo: 'M8 4 3 9l5 5 M4 9h10a6 6 0 0 1 0 12',
  redo: 'm16 4 5 5-5 5 M20 9H10a6 6 0 0 0 0 12',
  download: 'M12 3v12m-5-5 5 5 5-5 M4 16v5h16v-5',
  more: 'M4 12h1m6 0h1m6 0h1',
  search: 'M15 15l6 6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  down: 'm6 9 6 6 6-6',
  sliders: 'M3 7h6m4 0h8M3 17h11m4 0h3 M9 4h4v6H9z M14 14h4v6h-4z',
  expand: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',
  camera: 'M3 6h12v13H3z M15 10l6-3v12l-6-4',
  grid: 'M3 3h18v18H3z M9 3v18m6-18v18M3 9h18M3 15h18',
  frame: 'M3 8V4h5m8 0h5v4m0 8v4h-5m-8 0H3v-4',
  magnet: 'M5 4v10a7 7 0 0 0 14 0V4h-4v10a3 3 0 0 1-6 0V4z M5 9h4m6 0h4',
  zoom: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m0 6 5 5',
  help: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M9 8q3-4 6 0t-3 5v2m0 3h.01',
  select: 'm5 3 15 10-8 1-4 7z',
  hand: 'M7 12V6q2-3 3 0v4-6q2-3 3 0v6-5q2-2 3 0v6-3q2-2 3 0v8q-2 8-9 4l-6-7q-1-4 3-1z',
  rotate: 'M4 10a8 8 0 1 1 1 7 M4 4v6h6',
  rect: 'M4 4h16v16H4z',
  shape: 'm12 2 10 10-10 10L2 12z',
  pen: 'm4 20 3-10 10-7 4 4-7 10z M4 20l8-8 m2-7 5 5',
  type: 'M3 7V4h18v3 M12 4v16m-5 0h10',
  axis: 'M6 3v15h15 M6 18l10-10',
  pin: 'm8 3 11 6-4 1-2 6-7-4 4-5z M9 14l-5 7',
  cube: 'm12 2 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10',
  spark: 'm13 2 2 6 6 2-6 2-2 7-2-7-6-2 6-2z M4 15v6m-3-3h6',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v3m0 14v3M2 12h3m14 0h3 M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2',
  wave: 'M2 10v4m4-8v12m4-15v18m4-15v12m4-10v8m4-6v4',
  vortex: 'M20 7C9-6-4 12 7 19c9 6 18-8 10-12-7-5-13 8-5 8 4 0 4-5 1-4',
  time: 'M3 5h18M3 12h12m-8 7h14 M6 3v4m6 3v4m4 3v4',
  curve: 'M3 3v18h18 M5 16c10 0 4-11 15-11',
  node: 'M2 9h6v6H2z M16 3h6v6h-6z M16 15h6v6h-6z M8 12h3l5-6m-5 6 5 6',
  play: 'm7 4 13 8-13 8z',
  pause: 'M7 4h3v16H7z M15 4h3v16h-3z',
  prev: 'M5 5v14m13-14-10 7 10 7z',
  next: 'M19 5v14M6 5l10 7-10 7z',
  loop: 'm17 2 4 4-4 4M3 12V9q0-3 4-3h13 M7 22l-4-4 4-4m14-2v3q0 3-4 3H4',
  eye: 'M2 12q10-14 20 0-10 14-20 0z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  watch: 'M19 14a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M12 7V3m-3 0h6m-3 7v5l3 1m2-9 2-2',
  plus: 'M12 4v16M4 12h16',
  arrow: 'm8 4 8 8-8 8',
  ellipse: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  sound: 'M3 9h4l5-5v16l-5-5H3z M16 8q4 4 0 8m3-11q7 7 0 14',
  mute: 'M3 9h4l5-5v16l-5-5H3z M16 9l6 6m0-6-6 6',
  layers: 'm2 8 10-5 10 5-10 5z M3 13l9 5 9-5m-18 4 9 5 9-5',
  link: 'm10 8 4-4q7-4 7 3l-5 5M8 10l-5 5q-3 7 4 6l6-5 M8 16l8-8',
  scale: 'M3 9V3h6m12 12v6h-6 M3 3l7 7m11 11-7-7',
  file: 'M5 2h10l5 5v15H5z M15 2v6h5',
  fx: 'M5 20c5 3 6-6 7-12s4-7 7-5M6 10h11',
  palette: 'M12 3C1 3 0 18 10 20c8 2 1-5 6-5s7-11-4-12z',
  chev: 'm8 10 4 4 4-4',
};
function ic(n) {
  return (
    '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
    (paths[n] || paths.rect) +
    '"/></svg>'
  );
}
function icons() {
  document.querySelectorAll('i[data-i]').forEach((e) => (e.outerHTML = ic(e.dataset.i)));
}
const btn = (act, icon, title, cl = '') =>
  '<button class="' +
  cl +
  '" data-act="' +
  act +
  '" title="' +
  title +
  '" aria-label="' +
  title +
  '">' +
  ic(icon) +
  '</button>';
let tab = '时间轴',
  propTab = '属性',
  snap = true,
  loop = true,
  muted = false,
  zoom = 1,
  lastTime = 0,
  audioCtx = null,
  sources = [],
  propKey = 'ry',
  speedGraph = false,
  selectedKey = null,
  selectedNode = '',
  connecting = '',
  closedGroups = new Set(),
  modalCb,
  menuFns = [],
  expanded = new Set(),
  activeNodes = new Set(),
  filter = '',
  camPan = V(),
  msgTimer,
  exprOpen = false;
function notify(s) {
  $('#toast').textContent = s;
  $('#toast').style.display = 'block';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => ($('#toast').style.display = 'none'), 1800);
}
function menu(anchor, items) {
  let p = $('#popup');
  menuFns = items.map((a) => a[1]);
  p.innerHTML = items
    .map(
      (a, i) => '<button data-menu="' + i + '">' + (a[2] ? ic(a[2]) : '') + esc(a[0]) + '</button>',
    )
    .join('');
  p.style.display = 'block';
  let r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  p.style.left = Math.min(innerWidth - p.offsetWidth - 5, Math.max(5, r.left)) + 'px';
  p.style.top = Math.min(innerHeight - p.offsetHeight - 8, r.bottom + 4) + 'px';
}
function dialog(title, fields, cb, ok = '确定') {
  let m = $('#modal');
  modalCb = cb;
  m.innerHTML =
    '<form><h3>' +
    esc(title) +
    '</h3>' +
    fields
      .map(
        ([k, n, v, type]) =>
          '<label class="formfield">' +
          esc(n) +
          (Array.isArray(type)
            ? '<select name="' +
              k +
              '">' +
              type
                .map((a) => '<option ' + (a === v ? 'selected' : '') + '>' + esc(a) + '</option>')
                .join('') +
              '</select>'
            : '<input name="' + k + '" type="' + (type || 'text') + '" value="' + esc(v) + '">') +
          '</label>',
      )
      .join('') +
    '<div class="dialogend"><button type="button" onclick="this.closest(\'dialog\').close()">取消</button><button class="export">' +
    ok +
    '</button></div></form>';
  m.showModal();
  m.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    let data = Object.fromEntries(new FormData(e.target));
    m.close();
    cb(data);
  };
}
function choose(l, extend = false) {
  if (!l) return;
  if (!extend) S.clear();
  if (extend && S.has(l.id)) S.delete(l.id);
  else S.add(l.id);
  selectedKey = null;
  selectedNode = '';
  drawUI();
  refresh();
}
function thumb(l) {
  let m = l.model || l.type;
  return (
    '<div class="thumb ' +
    m +
    '">' +
    (m === 'glyph'
      ? esc(l.text.slice(0, 1))
      : m === 'comp'
        ? '火'
        : m === 'stage' || m === 'light'
          ? ''
          : m === 'particle'
            ? '<svg viewBox="0 0 40 32"><g stroke="#ffb85d">' +
              Array.from({ length: 27 }, (_, i) => {
                let x = (i * 43.77) % 40,
                  y = (i * 13.6) % 32;
                return (
                  '<path d="M' + x + ' ' + y + 'l' + (x - 20) * 0.17 + ' -2" stroke-width=".9"/>'
                );
              }).join('') +
              '</g></svg>'
            : ic(types[l.type]?.[1] || 'comp')) +
    '</div>'
  );
}
function assetList() {
  let shown = L().filter((l) => l.name.includes(filter)),
    rows = (list, sub) =>
      list
        .map(
          (l) =>
            '<button class="asset ' +
            (S.has(l.id) ? 'selected' : '') +
            '" data-asset="' +
            l.id +
            '">' +
            thumb(l) +
            '<div><p>' +
            esc(l.name) +
            '</p><small>' +
            sub(l) +
            '</small></div></button>',
        )
        .join(''),
    group = (n, c) =>
      '<div class="assetgroup">' +
      ic('down') +
      n +
      '<span>' +
      String(c).padStart(2, '0') +
      '</span></div>';
  let assets = filter
    ? shown
    : shown.filter(
        (l) =>
          !['camera', 'light', 'null', 'field', 'adj', 'audio'].includes(l.type) &&
          !['caption', 'air', 'hammer'].includes(l.model),
      );
  $('#assetList').innerHTML =
    group('合成', P.comps.length) +
    P.comps
      .filter((c) => c.name.includes(filter))
      .map(
        (c) =>
          '<button class="asset" data-comp="' +
          c.id +
          '">' +
          thumb({ model: 'comp' }) +
          '<div><p>' +
          esc(c.name) +
          '</p><small>' +
          c.w +
          ' × ' +
          c.h +
          '</small></div></button>',
      )
      .join('') +
    group('场景素材', assets.length) +
    rows(
      assets,
      (l) =>
        ({
          geo: 'GEOMETRY',
          particle: 'PARTICLES',
          shape: 'VECTOR',
          text: 'TYPOGRAPHY',
          pre: 'COMPOSITION',
        })[l.type],
    ) +
    group(
      '材质与声音',
      shown.filter((l) => l.type === 'audio').length +
        (assets.some((l) => l.model === 'glyph') ? 1 : 0),
    ) +
    (assets.some((l) => l.model === 'glyph')
      ? '<button class="asset" data-act="material">' +
        thumb({ type: 'light' }) +
        '<div><p>熔铸铜</p><small>PBR MATERIAL</small></div></button>'
      : '') +
    rows(
      shown.filter((l) => l.type === 'audio'),
      () => 'SYNTH AUDIO',
    );
}
const names = {
  x: 'X 位置',
  y: 'Y 位置',
  z: 'Z 位置',
  rx: 'X 旋转',
  ry: 'Y 旋转',
  rz: 'Z 旋转',
  sx: 'X 缩放',
  sy: 'Y 缩放',
  sz: 'Z 缩放',
  ax: '锚点 X',
  ay: '锚点 Y',
  az: '锚点 Z',
  opacity: '不透明度',
  depth: '挤出深度',
  bevel: '倒角半径',
  metal: '金属度',
  rough: '粗糙度',
  heat: '热辐射',
  bend: '弯曲',
  twist: '扭转',
  trim: '修剪路径',
  repeat: '重复数量',
  offset: '重复位移',
  rate: '发射速率',
  speed: '初速度',
  life: '粒子寿命',
  seed: '随机种子',
  drag: '阻力',
  gravity: '重力',
  trail: '拖尾长度',
  trailWidth: '拖尾宽度',
  intensity: '光照强度',
  fov: '视角',
  focus: '对焦距离',
  aperture: '光圈',
  tx: '目标 X',
  ty: '目标 Y',
  tz: '目标 Z',
  range: '作用半径',
  strength: '场强度',
  frequency: '频率',
  volume: '音量',
  size: '整体尺寸',
  spacing: '字距',
  line: '行距',
  blur: '高斯模糊',
  glow: '发光',
  shadow: '投影',
  hue: '色相',
  saturation: '饱和度',
  brightness: '亮度',
  remap: '时间重映射',
};
function group(n, icon, body, sub = '', open = true) {
  return (
    '<details class="grp" data-group="' +
    n +
    '" ' +
    ((!closedGroups.has(n) && open) || closedGroups.has('!' + n) ? 'open' : '') +
    '><summary>' +
    ic(icon) +
    n +
    '<small>' +
    sub +
    '</small></summary>' +
    body +
    '</details>'
  );
}
const num = (n, d = 2) => Number((+n).toFixed(d));
function inspector() {
  let l = sel(),
    p = $('#props');
  if (!l) {
    p.innerHTML = '<div class="empty">选择一个图层查看属性</div>';
    return;
  }
  let info = types[l.type],
    v = (k) => val(l, k),
    dial = (k, u = '', axis = '') =>
      '<span class="dial">' +
      (axis ? '<i class="ax' + 'XYZ'.indexOf(axis) + '">' + axis + '</i>' : '') +
      '<input aria-label="' +
      names[k] +
      '" data-k="' +
      k +
      '" type="text" value="' +
      num(v(k)) +
      '"><em>' +
      u +
      '</em></span>',
    watch = (k) =>
      '<button class="watch ' +
      (l.keys[k]?.length ? 'keyed' : '') +
      '" data-watch="' +
      k +
      '" title="切换' +
      names[k] +
      '关键帧">' +
      ic('watch') +
      '</button>',
    field = (k, u = '', slide = false) =>
      '<div class="field">' +
      watch(k) +
      '<label>' +
      names[k] +
      '</label>' +
      (slide
        ? '<input data-range="' +
          k +
          '" type="range" min="0" max="1" step=".01" value="' +
          v(k) +
          '">'
        : '') +
      dial(k, u) +
      '</div>',
    vec = (label, ks, u) =>
      '<div class="field">' +
      watch(ks[0]) +
      '<label>' +
      label +
      '</label>' +
      ic('link') +
      '</div><div class="vec">' +
      ks.map((k, i) => dial(k, u, 'XYZ'[i])).join('') +
      '</div>',
    plain = (k, n) =>
      '<div class="field"><label>' +
      n +
      '</label><input class="plain" data-lprop="' +
      k +
      '" value="' +
      esc(l[k]) +
      '"></div>',
    list = (k, n, opts) =>
      '<div class="field"><label>' +
      n +
      '</label><select data-lprop="' +
      k +
      '">' +
      opts
        .map((a) => {
          let [v, n] = Array.isArray(a) ? a : [a, a];
          return (
            '<option value="' +
            esc(v) +
            '" ' +
            (v === l[k] ? 'selected' : '') +
            '>' +
            esc(n) +
            '</option>'
          );
        })
        .join('') +
      '</select></div>',
    others = L()
      .filter((a) => a !== l)
      .map((a) => [a.id, a.name]);
  let html =
    '<div class="identity"><div class="thumb">' +
    ic(info[1]) +
    '</div><div><p ondblclick="renameLayer()">' +
    esc(S.size > 1 ? '已选择 ' + S.size + ' 个图层' : l.name) +
    '</p><small>' +
    info[0] +
    ' &nbsp;/&nbsp; LAYER ' +
    String(L().indexOf(l) + 1).padStart(2, '0') +
    '</small></div></div><div class="pTabs">' +
    ['属性', '效果', '表达式']
      .map(
        (n) =>
          '<button data-proptab="' +
          n +
          '" class="' +
          (propTab === n ? 'current' : '') +
          '">' +
          n +
          '</button>',
      )
      .join('') +
    '</div>';
  if (propTab === '属性') {
    html += group(
      '变换',
      'axis',
      vec('位置', ['x', 'y', 'z'], '') +
        vec('旋转', ['rx', 'ry', 'rz'], '°') +
        vec('缩放', ['sx', 'sy', 'sz'], '') +
        field('opacity', '%'),
      'TRANSFORM',
    );
    if (['geo', 'shape', 'text'].includes(l.type)) {
      html += group(
        '材质',
        'cube',
        '<div class="materialbox"><i class="sphere"></i><div>' +
          esc(l.material || '表面材质') +
          '<small>　PBR</small></div></div><div class="field"><label>基础色</label><small>' +
          esc(l.color.toUpperCase()) +
          '</small><input type="color" class="colorin" data-lprop="color" value="' +
          l.color +
          '"></div>' +
          field('metal', '', true) +
          field('rough', '', true) +
          field('heat', '', true),
        'MATERIAL',
      );
      html += group(
        '几何',
        'layers',
        (l.model === 'glyph' || l.type === 'text'
          ? '<div class="field"><label>源文字</label><textarea data-lprop="text">' +
            esc(l.text) +
            '</textarea></div>'
          : '') +
          field('depth') +
          field('bevel') +
          field('trim', '%') +
          field('repeat') +
          field('offset') +
          field('bend') +
          field('twist') +
          field('size') +
          list('source', '轮廓来源', [['', '本层几何'], ...others]),
        'GEOMETRY',
      );
    }
    if (l.type === 'particle')
      html += group(
        '发射器',
        'spark',
        list('source', '发射表面', [['', '点发射'], ...others]) +
          ['rate', 'speed', 'life', 'seed', 'drag', 'gravity', 'trail', 'trailWidth']
            .map((k) => field(k))
            .join(''),
        'EMITTER',
      );
    if (l.type === 'camera')
      html += group(
        '摄像机',
        'camera',
        ['fov', 'tx', 'ty', 'tz', 'focus', 'aperture'].map((k) => field(k)).join(''),
        'CAMERA',
      );
    if (l.type === 'light')
      html += group(
        '灯光',
        'sun',
        list('kind', '类型', ['点光源', '平行光']) +
          field('intensity') +
          '<input type="color" data-lprop="color" value="' +
          l.color +
          '">',
        'LIGHT',
      );
    if (l.type === 'field')
      html += group('空间场', 'vortex', field('strength') + field('range'), 'FIELD');
    if (l.type === 'audio')
      html += group(
        '合成器',
        'wave',
        field('frequency', 'Hz') +
          field('volume') +
          list('osc', '音色', ['sine', 'triangle', 'sawtooth', 'square']),
        'SYNTH',
      );
    if (l.type === 'pre') html += group('时间重映射', 'time', field('remap', 's'), 'TIME');
    html += group(
      '图层设置',
      'layers',
      plain('name', '图层名称') +
        list('parent', '父级', [['', '无'], ...others]) +
        vec('锚点', ['ax', 'ay', 'az'], '') +
        plain('in', '入点') +
        plain('out', '出点') +
        '<label class="field"><input type="checkbox" data-mb ' +
        (l.mb ? 'checked' : '') +
        '> 运动模糊</label>',
      'LAYER',
      false,
    );
  } else if (propTab === '效果') {
    html +=
      group(
        '颜色与光效',
        'fx',
        ['blur', 'glow', 'shadow', 'hue', 'saturation', 'brightness'].map((k) => field(k)).join(''),
        'EFFECTS',
      ) +
      group(
        '蒙版与混合',
        'layers',
        list('mask', '蒙版', ['无', '矩形', '椭圆', '反转椭圆']) +
          list('blend', '混合模式', ['正常', '相加', '滤色', '正片叠底', '叠加']) +
          list('matte', '轨道遮罩', [['', '无'], ...others]),
        'MASK',
      );
  } else {
    html += group(
      '属性表达式',
      'fx',
      '<div class="field"><label>驱动属性</label><select id="exprProp">' +
        Object.entries(names)
          .map(
            ([k, n]) =>
              '<option value="' +
              k +
              '" ' +
              (k === propKey ? 'selected' : '') +
              '>' +
              n +
              '</option>',
          )
          .join('') +
        '</select></div><textarea id="expr" rows="4" style="width:100%;padding:7px;font-family:var(--mono)" placeholder="value + time * 10">' +
        esc(l.expr[propKey] || '') +
        '</textarea><div class="flex"><button data-act="applyexpr" class="smallbtn">应用表达式</button><button data-act="exprsample" class="smallbtn">示例</button></div><p class="small">' +
        esc(errors[l.id + ':' + propKey] || '当前值　' + num(v(propKey))) +
        '</p>',
      'EXPRESSION',
    );
  }
  p.innerHTML =
    html +
    '<div class="insActions">' +
    btn('layerMenu', 'more', '图层操作', 'smallbtn') +
    btn('addkey', 'shape', '添加关键帧', 'smallbtn') +
    '</div>';
  p.querySelectorAll('details').forEach((d) => {
    d.ontoggle = () => {
      if (!d.isConnected) return;
      if (d.open) {
        closedGroups.delete(d.dataset.group);
        closedGroups.add('!' + d.dataset.group);
      } else {
        closedGroups.add(d.dataset.group);
        closedGroups.delete('!' + d.dataset.group);
      }
    };
  });
}
function drawUI() {
  let c = C();
  $('#projName').textContent = P.name;
  $('#compLabel').textContent = c.name;
  $('#seqName').textContent = c.name;
  $('#saveState').textContent = dirty ? '有未导出更改' : '工程已就绪';
  $('#screen').style.setProperty('--ar', c.w / c.h);
  $('#emptyCanvas').hidden=L().length>0;$('#previewSize').textContent=c.w+' × '+c.h;
  $('#rail').innerHTML =
    [
      ['select', 'select', '选择 V'],
      ['hand', 'hand', '平移视图 H'],
      ['rotate', 'rotate', '旋转 R'],
      ['scale', 'scale', '缩放 S'],
      null,
      ['rect', 'rect', '绘制矩形 M'],
      ['ellipse', 'ellipse', '绘制椭圆 O'],
      ['pen', 'pen', '绘制路径 G'],
      ['type', 'type', '添加文字 T'],
      null,
      ['pin', 'pin', '变形图钉'],
      ['axis', 'axis', '锚点工具 Y'],
    ]
      .map((i) =>
        i
          ? btn('tool-' + i[0], i[1], i[2], activeTool === i[0] ? 'active' : '')
          : '<i class="rsep"></i>',
      )
      .join('') +
    '<div class="push"></div>' +
    btn('help', 'help', '操作指南');
  $('#viewTabs').innerHTML = ['时间轴', '曲线', '节点']
    .map(
      (n, i) =>
        '<button class="' +
        (tab === n ? 'active' : '') +
        '" data-tab="' +
        n +
        '">' +
        ic(['time', 'curve', 'node'][i]) +
        n +
        '</button>',
    )
    .join('');
  $('.swatches').innerHTML = P.palette
    .map(
      (v, i) =>
        '<button data-color="' +
        i +
        '" style="background:' +
        v +
        '" title="使用 ' +
        v +
        '"></button>',
    )
    .join('');
  assetList();
  inspector();
  timeline();
  icons();
}
let timelineOrigin=0;
const spanTime = () => C().duration / zoom;
const windowStart=()=>Math.max(0,Math.min(timelineOrigin,C().duration-spanTime()));
const timePercent=t=>(t-windowStart())/spanTime()*100;
function zoomTimeline(factor,focus=T){
  const frac=Math.max(0,Math.min(1,(focus-windowStart())/spanTime()));
  zoom=Math.max(1,Math.min(32,zoom*factor));
  timelineOrigin=Math.max(0,Math.min(C().duration-spanTime(),focus-frac*spanTime()));
  timeline();
}
function timeTop() {
  return (
    '<div class="timeTop"><div class="transport"><b id="timecode">' +
    tc() +
    '</b>' +
    btn('prev', 'prev', '上一关键帧') +
    btn('play', playing ? 'pause' : 'play', '播放 / 暂停') +
    btn('next', 'next', '下一关键帧') +
    btn('loop', 'loop', '循环工作区', loop ? 'on' : '') +
    '</div><div class="timeRuler"><div class="rulerlines"></div>' +
    Array.from(
      { length: 9 },
      (_, i) =>
        '<span style="left:' +
        i * 12.5 +
        '%;' +
        (i === 8 ? 'transform:translateX(-100%)' : '') +
        '">' +
        num((spanTime() * i) / 8, 1) +
        's</span>',
    ).join('') +
    '<i class="workarea" style="left:' +
    Math.max(0,timePercent(C().start)) +
    '%;right:' +
    Math.max(0, 100 - timePercent(C().end)) +
    '%"><b data-workedge="start" title="工作区入点"></b><b data-workedge="end" title="工作区出点"></b></i></div></div>'
  );
}
function keysFor(l) {
  return Object.entries(l.keys)
    .flatMap(([k, a]) => a.map((q) => ({ k, ...q })))
    .sort((a, b) => a.t - b.t);
}
function waveSvg(l) {
  let d = '';
  for (let i = 0; i < 350; i++) {
    let t = Math.max(windowStart(),l.in)+i/350*(Math.min(windowStart()+spanTime(),l.out)-Math.max(windowStart(),l.in)),
      a = 0.7;
    for (let [s, f, h] of l.notes || [[0, 100, 2]])
      if (t >= s) a += 7 * Math.exp((-(t - s) * 3) / h);
    a *= 0.45 + Math.abs(Math.sin(i * 34)) * 0.55;
    d += 'M' + i + ' ' + (8 - a) + 'v' + a * 2;
  }
  return (
    '<svg class="wavebar" viewBox="0 0 350 16" preserveAspectRatio="none"><path d="' +
    d +
    '" fill="none" stroke="#98c6b5" stroke-width=".65"/></svg>'
  );
}
function timeline() {
  let body = $('#timelineBody'),
    old = $('.tlScroll')?.scrollTop || 0;
  if (tab === '节点') {
    nodesView();
    return;
  }
  if (tab === '曲线') {
    graphView();
    return;
  }
  let c = C(),
    cl = (l) => types[l.type][2];
  body.innerHTML =
    timeTop() +
    '<div class="tlScroll">' +
    L()
      .map((l, i) => {
        let times = new Set();
        return (
          '<div class="trackrow ' +
          (S.has(l.id) ? 'selected' : '') +
          '" data-layer="' +
          l.id +
          '"><div class="trackinfo"><button data-visible="' +
          l.id +
          '" title="显示 / 隐藏" style="opacity:' +
          (l.visible ? 1 : 0.3) +
          '">' +
          ic('eye') +
          '</button><button data-lock="' +
          l.id +
          '" style="opacity:' +
          (l.locked ? 1 : 0.42) +
          '" title="锁定">' +
          ic('lock') +
          '</button><em>' +
          String(i + 1).padStart(2, '0') +
          '</em><i class="dot" style="background:' +
          cl(l) +
          '"></i>' +
          ic(types[l.type][1]) +
          '<span>' +
          esc(l.name) +
          '</span></div><div class="trackLane"><div class="clip" data-clip="' +
          l.id +
          '" style="left:' +
          Math.min(100, Math.max(0,timePercent(l.in))) +
          '%;width:' +
          Math.max(0,Math.min(100,timePercent(l.out))-Math.max(0,timePercent(l.in))) +
          '%;--color:' +
          cl(l) +
          '">' +
          (l.type === 'audio'
            ? waveSvg(l)
            : '<span>' +
              esc(
                {
                  geo: 'GEOMETRY',
                  particle: 'EMITTER',
                  light: 'LIGHT',
                  camera: 'CAM',
                  shape: 'SHAPE',
                  text: 'TYPE',
                }[l.type] || '',
              ) +
              '</span>') +
          '</div>' +
          keysFor(l)
            .filter((q) => {
              if (times.has(q.t) || timePercent(q.t)>100 || timePercent(q.t)<0) return false;
              times.add(q.t);
              return true;
            })
            .map(
              (q) =>
                '<i class="diamond ' +
                (selectedKey?.l === l.id && selectedKey?.t === q.t ? 'picked' : '') +
                '" data-key="' +
                l.id +
                '" data-prop="' +
                q.k +
                '" data-t="' +
                q.t +
                '" style="left:' +
                timePercent(q.t) +
                '%;--color:' +
                cl(l) +
                '" title="' +
                names[q.k] +
                ' ' +
                num(q.t) +
                ' s"></i>',
            )
            .join('') +
          '</div></div>'
        );
      })
      .join('') +
    '</div><div class="headLine"></div><div class="tlFoot"><button data-act="add">' +
    ic('plus') +
    ' 添加图层</button><span>｜</span><span>' +
    L().length +
    ' 个图层</span><div class="push"></div>' +
    btn('sound', muted ? 'mute' : 'sound', '音频开关') +
    '<span>' +
    c.fps +
    ' FPS</span><span>·</span><span>' +
    tc(c.duration) +
    '</span></div>';
  $('.tlScroll').scrollTop = old;
  moveHead();
}
function moveHead() {
  let h = $('.headLine'),
    r = $('.timeRuler');
  if (h && r) {
    h.style.left = r.offsetLeft + timePercent(T)/100 * r.offsetWidth + 'px';
    h.style.bottom = '28px';
    h.style.display = timePercent(T)>=0 && timePercent(T)<=100 ? 'block' : 'none';
  }
  if ($('#timecode')) $('#timecode').textContent = tc();
}
function graphView() {
  let l = sel();
  if (!l) {
    $('#timelineBody').innerHTML = '<div class="empty">选择图层查看曲线</div>';
    return;
  }
  let k = propKey,
    d = C().duration,
    values = [],
    fn = (t) =>
      k==='pathSpeed'||(speedGraph&&componentKeys.includes(k))
        ? pathSpeedAt(l,t)
        : speedGraph
          ? (val(l, k, t + 0.001) - val(l, k, t)) / 0.001
          : val(l, k, t);
  for (let i = 0; i <= 220; i++) values.push(fn((d * i) / 220));
  let min = Math.min(...values),
    max = Math.max(...values);
  if (max === min) {
    min--;
    max++;
  }
  let Y = (v) => 85 - (65 * (v - min)) / (max - min);
  $('#timelineBody').innerHTML =
    '<div class="graphTools"><select id="gProp">' +
    Object.entries(names)
      .map(
        ([k, n]) =>
          '<option value="' +
          k +
          '" ' +
          (propKey === k ? 'selected' : '') +
          '>' +
          n +
          (l.keys[k]?.length ? ' ◆' : '') +
          '</option>',
      )
      .join('') +
    '</select><button data-act="curveMode" class="smallbtn">' +
    (speedGraph ? '速度曲线' : '值曲线') +
    '</button><button data-act="addkey">＋ 关键帧</button><button data-act="interp">插值方式</button><div class="push"></div><span id="timecode">' +
    tc() +
    '</span></div><div class="grapharea"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" data-min="' +
    min +
    '" data-max="' +
    max +
    '"><path d="' +
    values.map((v, i) => (i ? 'L' : 'M') + (i / 220) * 1000 + ' ' + Y(v)).join(' ') +
    '" stroke="#c6ea85" fill="none" vector-effect="non-scaling-stroke" stroke-width="2"/>' +
    (l.keys[k] || [])
      .map(
        (q) =>
          '<ellipse data-gkey="' +
          q.t +
          '" cx="' +
          (q.t / d) * 1000 +
          '" cy="' +
          Y(fn(q.t)) +
          '" rx="5" ry="3" fill="#d5f59e"/>',
      )
      .join('') +
    '<path id="ghead" d="M' +
    (T / d) * 1000 +
    ' 0v100" stroke="#cfdeac" vector-effect="non-scaling-stroke"/></svg></div>';
}
function nodesView() {
  let l = sel();
  if (!l) {
    $('#timelineBody').innerHTML = '<div class="empty">选择一个几何图层</div>';
    return;
  }
  let ns = l.nodes || [],
    con = ns
      .map((n) => {
        let a = ns.find((x) => x.id === n.input);
        return a
          ? '<path d="M' +
              (a.x + 138) +
              ' ' +
              (a.y + 47) +
              ' C' +
              (a.x + 190) +
              ' ' +
              (a.y + 47) +
              ' ' +
              (n.x - 50) +
              ' ' +
              (n.y + 47) +
              ' ' +
              n.x +
              ' ' +
              (n.y + 47) +
              '" stroke="#a9ca91" fill="none"/>'
          : '';
      })
      .join('');
  $('#timelineBody').innerHTML =
    '<div class="graphTools"><button class="smallbtn" data-act="addnode">＋ 创建节点</button><button data-act="copynode">复制</button><button data-act="disconnect">断开输入</button><button data-act="delnode">删除</button><div class="push"></div><span class="small">' +
    (connecting ? '选择目标输入端口' : '几何节点　/　' + esc(l.name)) +
    '</span></div><div class="nodearea"><svg class="nodeAreaSvg">' +
    con +
    '</svg>' +
    ns
      .map(
        (n) =>
          '<div data-node="' +
          n.id +
          '" class="node ' +
          (selectedNode === n.id ? 'nodeselected' : '') +
          '" style="left:' +
          n.x +
          'px;top:' +
          n.y +
          'px"><b>' +
          ic('cube') +
          '　' +
          esc(n.op) +
          '</b><small><button class="port" data-portin="' +
          n.id +
          '" title="几何输入"></button>几何<button class="port" data-portout="' +
          n.id +
          '" title="几何输出"></button></small></div>',
      )
      .join('') +
    '</div>';
}
function refresh() {
  renderScene();
  moveHead();
  let l = sel();
  for (let e of $$('[data-k]'))
    if (l && document.activeElement !== e) e.value = num(val(l, e.dataset.k));
  for (let e of $$('[data-range]')) if (l) e.value = val(l, e.dataset.range);
  if ($('#ghead')) $('#ghead').setAttribute('d', 'M' + (T / C().duration) * 1000 + ' 0v100');
  let h = $('#handles');
  h.className = (gridOn ? 'gridShow ' : '') + (safeOn ? 'safeShow' : '');
  h.innerHTML = '';
  if (
    selectedHandles &&
    l &&
    entries.get(l.id) &&
    ['geo', 'shape', 'text'].includes(l.type) &&
    l.model !== 'air'
  ) {
    const bounds=Array.from(S).map(id=>L().find(q=>q.id===id)).filter(Boolean).map(selectionBounds).filter(Boolean);
    if(bounds.length){
      const a=bounds.flatMap(b=>[b.minX,b.maxX]),b=bounds.flatMap(b=>[b.minY,b.maxY]);
      const x=Math.min(...a),y=Math.min(...b);
      h.innerHTML =
        '<div class="selbox" style="left:' +
        x * 100 +
        '%;top:' +
        y * 100 +
        '%;width:' +
        (Math.max(...a) - x) * 100 +
        '%;height:' +
        (Math.max(...b) - y) * 100 +
        '%"><i></i><i></i><i></i><i></i></div>';
    }
  }
}
function silence() {
  for (let s of sources)
    try {
      s.stop();
    } catch {}
  sources = [];
}
function scheduleAudio() {
  silence();
  if (exporting || !playing || muted) return;
  try {
    audioCtx ||= new AudioContext();
    audioCtx.resume();
    for (let ev of audioEvents(T, C().end)) {
      let { l, t, f, len } = ev;
      let st = audioCtx.currentTime + Math.max(0, ev.start - T),
        dur = Math.max(0.02, len),
        osc = audioCtx.createOscillator(),
        gain = audioCtx.createGain();
      osc.type = l.osc || 'triangle';
      osc.frequency.setValueAtTime(((f * val(l, 'frequency', t)) / 110) * (len < 1 ? 3 : 1), st);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * 0.52), st + dur);
      let vol = Math.max(0.0002, val(l, 'volume', t)) * (len < 1 ? 1 : 0.45);
      gain.gain.setValueAtTime(0.0001, st);
      gain.gain.exponentialRampToValueAtTime(vol, st + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(st);
      osc.stop(st + dur + 0.02);
      sources.push(osc);
      if (l.instrument === '锻炉合奏')
        forgeTimbre(audioCtx, l, st, (f * val(l, 'frequency', t)) / 110, dur, vol, t);
    }
  } catch {}
}
let playToken = 0,
  firstPlay = true;
function stop() {
  playToken++;
  playing = false;
  silence();
  timeline();
}
function play() {
  if (exporting) return;
  if (playing) {
    stop();
    return;
  }
  if (firstPlay && T === 8.4 && C().markers?.length) T = C().start;
  firstPlay = false;
  if (T >= C().end - 0.001) T = C().start;
  playing = true;
  const token = ++playToken;
  lastTime = performance.now();
  timeline();
  scheduleAudio();
  function tick(now) {
    if (!playing || exporting || token !== playToken) return;
    T += (now - lastTime) / 1000;
    lastTime = now;
    if (T >= C().end) {
      if (loop) {
        T = C().start + (T - C().end);
        scheduleAudio();
      } else {
        T = C().end;
        stop();
      }
    }
    refresh();
    if (playing) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function seek(t) {
  firstPlay = false;
  T = Math.max(0, Math.min(C().duration, t));
  lastTime = performance.now();
  refresh();
  if (playing) scheduleAudio();
}
function addLayer(type, extra = {}) {
  record();
  let l = layer(
    type,
    types[type][0] + ' ' + String(L().filter((l) => l.type === type).length + 1).padStart(2, '0'),
    { out: C().duration, color: '#bb9a77', ...extra },
  );
  if (type === 'text') l.text = extra.text || '文字';
  if (type === 'particle' && !l.source) l.source = sel()?.id || '';
  if (type === 'field') l.p.strength = 1;
  if (type === 'camera') Object.assign(l.p, { x: 3, y: 3, z: 8 });
  if (type === 'light') Object.assign(l.p, { x: -2, y: 4, z: 2 });
  L().unshift(l);
  S = new Set([l.id]);
  propTab = '属性';
  changed();
  return l;
}
function newComp(empty = false) {
  dialog(
    empty ? '新建空工程' : '新建合成',
    [
      [
        'name',
        empty ? '工程名称' : '合成名称',
        empty ? '未命名工程' : '合成 ' + (P.comps.length + 1),
      ],
      ['w', '宽度', 1920, 'number'],
      ['h', '高度', 1080, 'number'],
      ['fps', '帧率', 30, 'number'],
      ['duration', '时长（秒）', 15, 'number'],
    ],
    (d) => {
      stop();
      record();
      let c = comp(d.name);
      for (let k of ['w', 'h', 'fps', 'duration']) c[k] = Math.max(1, +d[k] || 1);
      c.end = c.duration;
      if (empty) P = { name: d.name, comps: [], palette: P.palette };
      P.comps.push(c);
      P.active = c.id;
      S.clear();
      T = 0;
      changed();
    },
  );
}
function renameLayer() {
  let l = sel();
  if (l)
    dialog('重命名图层', [['n', '名称', l.name]], (d) => {
      record();
      l.name = d.n;
      changed();
    });
}
function precomp() {
  if (!S.size) return;
  dialog('预合成所选图层', [['n', '合成名称', '预合成 ' + P.comps.length]], (d) => {
    record();
    precomposeLayers(d.n);
    changed();
  });
}
function deleteSel() {
  let l = sel();
  if (!l) return;
  record();
  if (selectedKey) {
    let q = selectedKey,
      a = L().find((l) => l.id === q.l);
    a.keys[q.k] = a.keys[q.k].filter((x) => x.t !== q.t);
    selectedKey = null;
  } else {
    let ids = new Set(
      L()
        .filter((l) => S.has(l.id) && !l.locked)
        .map((l) => l.id),
    );
    C().layers = L().filter((l) => !ids.has(l.id));
    for (let l of L()) {
      if (ids.has(l.parent)) l.parent = '';
      if (ids.has(l.source)) l.source = '';
    }
    S.clear();
  }
  changed();
}
function dup() {
  if (!S.size) return;
  record();
  let newS = new Set();
  for (let l of L()
    .slice()
    .filter((l) => S.has(l.id))) {
    let n = structuredClone(l);
    n.id = 'l' + uid++;
    n.name += ' 副本';
    L().splice(L().indexOf(l), 0, n);
    newS.add(n.id);
  }
  S = newS;
  changed();
}
function addKey(k = propKey) {
  let l = sel();
  if (!l || l.locked) return;
  record();
  l.keys[k] ||= [];
  if (!l.keys[k].some((q) => q.t === T)) l.keys[k].push(key(T, val(l, k)));
  l.keys[k].sort((a, b) => a.t - b.t);
  selectedKey = { l: l.id, t: T, k };
  propKey = k;
  changed();
}
function interp(mode) {
  let l = sel();
  if (!l) return;
  record();
  let a = l.keys[selectedKey?.k || propKey] || [];
  a.filter((q) => !selectedKey || q.t === selectedKey.t).forEach((q) => (q.mode = mode));
  changed();
}
function switchComp(id) {
  zoom=1;timelineOrigin=0;
  stop();
  P.active = id;
  S = new Set([L()[0]?.id]);
  T = 0;
  version++;
  selectedHandles = false;
  drawUI();
  refresh();
}
function save() {
  let b = new Blob([JSON.stringify(P, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(b),
    a = document.createElement('a');
  a.href = url;
  a.download = P.name + '.forge';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dirty = false;
  drawUI();
  notify('工程文件已导出');
}
function tool(name) {
  activeTool = name;
  if (name === 'type') {
    dialog('创建文字图层', [['text', '文字内容', '文字']], (d) => {
      addLayer('text', { text: d.text });
      tool('select');
    });
  }
  drawUI();
  canvas.style.cursor = ['pen', 'ellipse', 'rect', 'pin'].includes(name)
    ? 'crosshair'
    : name === 'hand'
      ? 'grab'
      : 'default';
  if (name === 'pen') notify('逐点绘制路径，双击完成');
}
function act(a, e) {
  let l = sel(),
    c = C();
  if (a.startsWith('tool-')) {
    tool(a.slice(5));
    return;
  }
  switch (a) {
    case 'project':
      menu(e, [
        ['新建空工程', () => newComp(true), 'file'],
        ['新建合成', () => newComp(), 'comp'],
        ['合成设置', () => act('settings', e), 'sliders'],
        ['打开工程', () => $('#file').click(), 'folder'],
        ['导出工程', save, 'download'],
        [
          '载入锻字示例',
          () => {
            stop();
            record();
            P = demo();
            T = 8.4;
            restored();
          },
          'cube',
        ],
      ]);
      break;
    case 'settings':
      dialog(
        '合成设置',
        [
          ['name', '名称', c.name],
          ...['w', 'h', 'fps', 'duration', 'start', 'end', 'shutter'].map((k, i) => [
            k,
            ['宽度', '高度', '帧率', '时长', '工作区入点', '工作区出点', '快门角度'][i],
            c[k],
            'number',
          ]),
          ['mb', '运动模糊', c.mb ? '启用' : '关闭', ['启用', '关闭']],
        ],
        (d) => {
          record();
          c.name = d.name;
          for (let k of ['w', 'h', 'fps', 'duration', 'start', 'end', 'shutter'])
            c[k] = Math.max(k === 'start' ? 0 : 1, +d[k] || 0);
          c.mb = d.mb === '启用';
          c.end = Math.min(c.end, c.duration);
          c.start = Math.min(c.start, c.end - 0.01);
          changed();
        },
      );
      break;
    case 'save':
      save();
      break;
    case 'undo':
      undo();
      break;
    case 'redo':
      undo(true);
      break;
    case 'play':
      play();
      break;
    case 'sound':
      muted = !muted;
      scheduleAudio();
      timeline();
      break;
    case 'loop':
      loop = !loop;
      timeline();
      break;
    case 'prev':
    case 'next': {
      let times = [
        ...new Set([0, c.duration, ...L().flatMap((l) => keysFor(l).map((k) => k.t))]),
      ].sort((a, b) => a - b);
      seek(
        a === 'prev'
          ? (times.filter((t) => t < T - 0.001).at(-1) ?? 0)
          : (times.find((t) => t > T + 0.001) ?? c.duration),
      );
      break;
    }
    case 'emptyShape':addLayer('shape',{shape:'rect'});break;
    case 'add':
      menu(
        e,
        Object.entries(types).map(([k, v]) => [
          v[0],
          () => {
            if (k === 'pre') {
              menu(
                e,
                P.comps
                  .filter((p) => p !== c && !p.layers.some((l) => l.ref === c.id))
                  .map((p) => [p.name, () => addLayer('pre', { ref: p.id })]),
              );
              return;
            }
            addLayer(k, k === 'geo' ? { model: 'glyph' } : {});
          },
          v[1],
        ]),
      );
      break;
    case 'layerMenu':
      menu(e, [
        ['重命名', renameLayer],
        ['复制图层', dup],
        ['上移图层', () => order(-1)],
        ['下移图层', () => order(1)],
        ['预合成…', precomp],
        ['删除所选', deleteSel],
      ]);
      break;
    case 'addkey':
      addKey();
      break;
    case 'interp':
      menu(e, [
        ['线性', () => interp('linear')],
        ['贝塞尔缓动', () => interp('bezier')],
        ['定格', () => interp('hold')],
      ]);
      break;
    case 'zoomin':
    case 'zoomout':
      zoomTimeline(a==='zoomin'?1.4:1/1.4);
      break;
    case 'snap':
      snap = !snap;
      e.classList.toggle('on', snap);
      notify(snap ? '已启用帧吸附' : '已关闭帧吸附');
      break;
    case 'zoomview':
      menu(
        e,
        [
          ['适应', 1],
          ['75%', 0.75],
          ['125%', 1.25],
          ['150%', 1.5],
        ].map(([n, v]) => [
          n,
          () => {
            viewScale = v;
            $('#viewZoom').textContent = n;
            refresh();
          },
        ]),
      );
      break;
    case 'camera':
      menu(
        e,
        ['活动摄像机', '正面视图', '俯视视图'].map((n, i) => [
          n,
          () => {
            angleMode = i;
            $('#camLabel').textContent = n;
            refresh();
          },
        ]),
      );
      break;
    case 'grid':
      gridOn = !gridOn;
      e.classList.toggle('on', gridOn);
      refresh();
      break;
    case 'safe':
      safeOn = !safeOn;
      e.classList.toggle('on', safeOn);
      refresh();
      break;
    case 'fullscreen':
      $('.preview').classList.toggle('big');
      refresh();
      break;
    case 'palette':
      if (l) {
        propTab = '属性';
        inspector();
        $('.colorin')?.click();
      }
      break;
    case 'material': {
      let g = L().find((a) => a.model === 'glyph');
      if (g) choose(g);
      $('.materialbox')?.scrollIntoView({ block: 'nearest' });
      break;
    }
    case 'applyexpr':
      if (l) {
        record();
        l.expr[propKey] = $('#expr').value;
        val(l, propKey);
        changed();
      }
      break;
    case 'exprsample':
      menu(
        e,
        ['value + time * 5', 'wiggle(2, 3)', 'loopOut("pingpong")', 'ease(time, 0, 5, 0, 100)'].map(
          (s) => [s, () => ($('#expr').value = s)],
        ),
      );
      break;
    case 'curveMode':
      speedGraph = !speedGraph;
      timeline();
      break;
    case 'addnode':
      if (l)
        menu(
          e,
          [
            '文字轮廓',
            '路径输入',
            '挤出实体',
            '分布实例',
            '变换几何',
            '扭转变形',
            '弯曲变形',
            '几何输出',
          ].map((op) => [
            op,
            () => {
              record();
              l.nodes.push({
                id: 'n' + uid++,
                op,
                x: 35 + ((l.nodes.length * 147) % 450),
                y: 25 + (l.nodes.length % 3) * 38,
              });
              changed();
            },
          ]),
        );
      break;
    case 'copynode':
    case 'disconnect':
    case 'delnode': {
      let n = l?.nodes.find((x) => x.id === selectedNode);
      if (!n) {
        notify('先选择节点');
        break;
      }
      record();
      if (a === 'copynode') l.nodes.push({ ...n, id: 'n' + uid++, x: n.x + 45, y: n.y + 30 });
      else if (a === 'disconnect') n.input = '';
      else {
        l.nodes = l.nodes.filter((q) => q !== n);
        l.nodes.forEach((q) => {
          if (q.input === n.id) q.input = '';
        });
      }
      changed();
      break;
    }
    case 'help': {
      let m = $('#modal');
      m.innerHTML =
        '<h3>工作台快捷键</h3>' +
        [
          ['空格', '播放或暂停'],
          ['← / →', '向前或向后一帧'],
          ['V / H / R / S', '选择、平移视图、旋转、缩放'],
          ['M / O / G / T', '矩形、椭圆、路径、文字'],
          ['Shift + 单击', '多选图层'],
          ['J / K', '跳转关键帧'],
          ['F9', '缓入缓出'],
          ['Ctrl + D', '复制图层'],
          ['Ctrl + Shift + C', '预合成'],
          ['Ctrl + Z / Y', '撤销 / 重做'],
          ['Ctrl + S / O', '保存 / 打开工程'],
        ]
          .map(([a, b]) => '<div class="formfield"><kbd>' + a + '</kbd>' + b + '</div>')
          .join('') +
        '<div class="dialogend"><button class="export" onclick="this.closest(\'dialog\').close()">完成</button></div>';
      m.showModal();
      break;
    }
  }
}
function order(d) {
  let l = sel(),
    i = L().indexOf(l),
    j = i + d;
  if (j < 0 || j >= L().length) return;
  record();
  L().splice(i, 1);
  L().splice(j, 0, l);
  changed();
}
document.addEventListener('click', (e) => {
  let b = e.target.closest('button'),
    d = b?.dataset || {};
  if (d.menu != null) {
    $('#popup').style.display = 'none';
    menuFns[+d.menu]?.();
    return;
  }
  if (!e.target.closest('#popup')) $('#popup').style.display = 'none';
  if (d.act) {
    act(d.act, b);
    return;
  }
  if (d.color != null && sel()) {
    record();
    sel().color = P.palette[d.color];
    changed();
    return;
  }
  if (d.asset) {
    choose(
      L().find((l) => l.id === d.asset),
      e.shiftKey,
    );
    return;
  }
  if (d.comp) {
    if (d.comp !== P.active) switchComp(d.comp);
    else act('settings', b);
    return;
  }
  if (d.proptab) {
    propTab = d.proptab;
    inspector();
    return;
  }
  if (d.tab) {
    tab = d.tab;
    drawUI();
    refresh();
    return;
  }
  if (d.visible || d.lock) {
    let l = L().find((l) => l.id === (d.visible || d.lock)),
      k = d.visible ? 'visible' : 'locked';
    record();
    l[k] = !l[k];
    changed();
    return;
  }
  if (d.watch) {
    let l = sel();
    if (!l || l.locked) return;
    propKey = d.watch;
    record();
    if (l.keys[propKey]?.length) {
      l.p[propKey] = val(l, propKey);
      delete l.keys[propKey];
    } else l.keys[propKey] = [key(T, val(l, propKey))];
    changed();
    return;
  }
  if (d.portout) {
    connecting = d.portout;
    timeline();
    return;
  }
  if (d.portin && connecting && connecting !== d.portin) {
    let n = sel().nodes.find((q) => q.id === d.portin);
    let upstream = sel().nodes.find((q) => q.id === connecting),
      seen = new Set();
    while (upstream) {
      if (upstream === n || seen.has(upstream)) {
        notify('连接会产生循环');
        return;
      }
      seen.add(upstream);
      upstream = sel().nodes.find((q) => q.id === upstream.input);
    }
    record();
    n.input = connecting;
    connecting = '';
    changed();
    return;
  }
  let r = e.target.closest('.trackinfo,.clip');
  if (r && !e.target.closest('[data-key]'))
    choose(
      L().find((l) => l.id === r.closest('[data-layer]').dataset.layer),
      e.shiftKey,
    );
});
document.addEventListener('contextmenu', (e) => {
  let row = e.target.closest('[data-layer],[data-asset]');
  if (row) {
    e.preventDefault();
    choose(L().find((l) => l.id === (row.dataset.layer || row.dataset.asset)));
    act('layerMenu', { left: e.clientX, bottom: e.clientY });
  } else if (e.target.closest('.timeline')) {
    e.preventDefault();
    act('add', { left: e.clientX, bottom: e.clientY });
  }
});
document.addEventListener('dblclick', (e) => {
  if (e.target.closest('.trackinfo')) renameLayer();
  if (e.target.closest('.timeRuler')) act('settings', e.target);
});
$('#search').oninput = (e) => {
  filter = e.target.value;
  assetList();
};
document.addEventListener('change', (e) => {
  let el = e.target,
    d = el.dataset,
    l = sel();
  if (el.id === 'exprProp' || el.id === 'gProp') {
    propKey = el.value;
    if (el.id === 'gProp') timeline();
    else inspector();
    return;
  }
  if (!l || l.locked) return;
  if (d.k || d.range) {
    let k = d.k || d.range,
      n = Number(el.value);
    if (!Number.isFinite(n)) return;
    record();
    if (k.startsWith('a') && ['ax', 'ay', 'az'].includes(k)) {
      let diff = V();
      diff[k[1]] = n - val(l, k);
      let o = entries.get(l.id);
      diff.multiply(o.scale).applyQuaternion(o.quaternion);
      for (let c of ['x', 'y', 'z']) setVal(l, c, val(l, c) + diff[c]);
    }
    setVal(l, k, n);
    propKey = k;
    changed();
  } else if (d.lprop) {
    let k = d.lprop;
    if (k === 'parent') {
      let dest = el.value,
        anc = L().find((a) => a.id === dest);
      while (anc) {
        if (anc === l) {
          notify('父级不能形成循环');
          inspector();
          return;
        }
        anc = L().find((a) => a.id === anc.parent);
      }
      let obj = entries.get(l.id),
        mat = obj.matrixWorld.clone(),
        p = entries.get(dest);
      if (p) mat.premultiply(p.matrixWorld.clone().invert());
      let pos = V(),
        q = new THREE.Quaternion(),
        s = V();
      mat.decompose(pos, q, s);
      pos.add(V(val(l, 'ax'), val(l, 'ay'), val(l, 'az')).multiply(s).applyQuaternion(q));
      s.divideScalar(val(l, 'size') || 1);
      let r = new THREE.Euler().setFromQuaternion(q);
      record();
      for (let k of ['x', 'y', 'z']) {
        setVal(l, k, pos[k]);
        setVal(l, 'r' + k, (r[k] * 180) / Math.PI);
        setVal(l, 's' + k, s[k] * 100);
      }
      l.parent = dest;
    } else {
      record();
      l[k] = ['in', 'out'].includes(k) ? Math.max(0, Number(el.value) || 0) : el.value;
    }
    changed();
  } else if ('mb' in d) {
    record();
    l.mb = el.checked;
    changed();
  }
});
$('#file').onchange = async (e) => {
  let f = e.target.files[0];
  if (!f) return;
  try {
    let p = validateProject(JSON.parse(await f.text()));
    record();
    stop();
    P = p;
    uid =
      Math.max(
        uid,
        ...P.comps
          .flatMap((c) => [
            c.id,
            ...c.layers.flatMap((l) => [l.id, ...(l.nodes || []).map((n) => n.id)]),
          ])
          .map((s) => parseInt(s.slice(1)) || 0),
      ) + 1;
    T = 0;
    restored();
    notify('工程已打开');
  } catch {
    notify('无法读取该工程文件');
  }
  e.target.value = '';
};
let copyKey = null;
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea,select,[contenteditable],dialog') || exporting) return;
  let k = e.key.toLowerCase(),
    ctrl = e.ctrlKey || e.metaKey;
  if (ctrl) {
    if (['z', 'y', 'd', 's', 'o', 'c', 'v'].includes(k)) e.preventDefault();
    if (k === 'z') undo(e.shiftKey);
    if (k === 'y') undo(true);
    if (k === 'd') dup();
    if (k === 's') save();
    if (k === 'o') $('#file').click();
    if (k === 'c' && e.shiftKey) precomp();
    else if (k === 'c' && selectedKey) {
      let q = selectedKey;
      copyKey = {
        k: q.k,
        ...L()
          .find((l) => l.id === q.l)
          .keys[q.k].find((v) => v.t === q.t),
      };
    }
    if (k === 'v' && copyKey && sel()) {
      addKey(copyKey.k);
      Object.assign(
        sel().keys[copyKey.k].find((q) => q.t === T),
        { v: copyKey.v, mode: copyKey.mode },
      );
      changed();
    }
    return;
  }
  if (k === ' ') {
    e.preventDefault();
    play();
  } else if (k === 'arrowright' || k === 'arrowleft') {
    e.preventDefault();
    seek(T + (k === 'arrowright' ? 1 : -1) / C().fps);
  } else if (k === 'delete' || k === 'backspace') {
    e.preventDefault();
    deleteSel();
  } else if (k === 'f9') {
    e.preventDefault();
    interp('bezier');
  } else if (k === 'escape') {
    activeTool = 'select';
    $('#popup').style.display = 'none';
    $('.preview').classList.remove('big');
    selectedHandles = false;
    drawUI();
    refresh();
  } else if (k === '/') {
    e.preventDefault();
    $('#search').focus();
  } else if (k === 'j' || k === 'k') act(k === 'j' ? 'prev' : 'next');
  else if ({ v: 1, h: 1, r: 1, s: 1, m: 1, o: 1, g: 1, t: 1, y: 1 }[k])
    tool(
      {
        v: 'select',
        h: 'hand',
        r: 'rotate',
        s: 'scale',
        m: 'rect',
        o: 'ellipse',
        g: 'pen',
        t: 'type',
        y: 'axis',
      }[k],
    );
});
function drag(e, fn, end = () => {}) {
  e.preventDefault();
  let x = e.clientX,
    y = e.clientY,
    move = (ev) => fn(ev.clientX - x, ev.clientY - y, ev),
    up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      end(ev);
    };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
const snapped = (t) => (snap ? Math.round(t * C().fps) / C().fps : t);
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || exporting) return;
  let target = e.target,
    r = target.closest('.timeRuler'),
    g = target.closest('[data-gkey]'),
    q = target.closest('[data-key]'),
    node = target.closest('[data-node]');
  if (r) {
    let box = r.getBoundingClientRect(),
      fn = (x) => seek(snapped(windowStart()+((x-box.left)/box.width)*spanTime()));
    fn(e.clientX);
    drag(e, (_, __, ev) => fn(ev.clientX));
    return;
  }
  if (g || q) {
    let k = g ? propKey : q.dataset.prop,
      l = g ? sel() : L().find((l) => l.id === q.dataset.key),
      t = +(g ? g.dataset.gkey : q.dataset.t),
      pt = l.keys[k].find((x) => x.t === t),
      box = (g ? $('.grapharea') : q.parentElement).getBoundingClientRect(),
      v = pt.v,
      svg = g?.closest('svg');
    S = new Set([l.id]);
    selectedKey = { k, l: l.id, t };
    propKey = k;
    T = t;
    record();
    drag(
      e,
      (x, y) => {
        pt.t = Math.max(
          0,
          Math.min(C().duration, snapped(t + (x / box.width) * (g ? C().duration : spanTime()))),
        );
        if (g) pt.v = v - ((y / box.height) * (+svg.dataset.max - Number(svg.dataset.min))) / 0.65;
        selectedKey.t = T = pt.t;
        l.keys[k].sort((a, b) => a.t - b.t);
        timeline();
        refresh();
      },
      () => {
        drawUI();
        refresh();
      },
    );
    refresh();
    return;
  }
  if (node && !target.closest('button')) {
    let n = sel().nodes.find((q) => q.id === node.dataset.node);
    selectedNode = n.id;
    let xx = n.x,
      yy = n.y;
    record();
    timeline();
    drag(e, (x, y) => {
      n.x = Math.max(0, xx + x);
      n.y = Math.max(0, yy + y);
      nodesView();
    });
    return;
  }
  if (target.closest('.grapharea')) {
    let box = $('.grapharea').getBoundingClientRect();
    seek(((e.clientX - box.left) / box.width) * C().duration);
    return;
  }
  if (target === canvas) canvasDown(e);
});
const ray = new THREE.Raycaster();
function rayAt(e) {
  let r = canvas.getBoundingClientRect();
  ray.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      1 - ((e.clientY - r.top) / r.height) * 2,
    ),
    camera,
  );
  return ray;
}
function worldAt(e, z = 0) {
  return rayAt(e).ray.intersectPlane(new THREE.Plane(V(0, 0, 1), -z), V()) || V();
}
let penPts = [];
function canvasDown(e) {
  let w = worldAt(e),
    toolname = activeTool;
  if (toolname === 'hand') {
    let init = camPan.clone();
    drag(e, (x, y) => {
      camPan.set(init.x - (x / canvas.clientHeight) * 4, init.y + (y / canvas.clientHeight) * 4, 0);
      refresh();
    });
    return;
  }
  if (toolname === 'pen') {
    if (e.detail < 2) penPts.push([w.x, w.y]);
    refresh();
    notify('路径节点 ' + penPts.length + '　·　双击闭合');
    return;
  }
  if (['rect', 'ellipse'].includes(toolname)) {
    let l = addLayer('shape', { shape: toolname, p: { x: w.x, y: w.y } });
    selectedHandles = true;
    drag(
      e,
      (x, y, ev) => {
        let q = worldAt(ev);
        l.p.x = (q.x + w.x) / 2;
        l.p.y = (q.y + w.y) / 2;
        l.p.sx = Math.max(2, (Math.abs(q.x - w.x) / 1.8) * 100);
        l.p.sy = Math.max(2, (Math.abs(q.y - w.y) / 1.4) * 100);
        refresh();
      },
      () => {
        activeTool = 'select';
        changed();
      },
    );
    return;
  }
  let hit=pickLayer(e);
  let l = toolname === 'select' ? hit?.l : sel();
  if (!l) {
    S.clear();
    selectedHandles = false;
    drawUI();
    refresh();
    return;
  }
  selectedHandles = true;
  if(!S.has(l.id)||e.shiftKey)choose(l,e.shiftKey);
  if (l.locked) return;
  let o = entries.get(l.id),
    z = hit?.h.point.z || o.getWorldPosition(V()).z,
    p0 = worldAt(e, z),
    start = {};
  for (let k of ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz', 'ax', 'ay', 'az'])
    start[k] = val(l, k);
  if (toolname === 'pin') {
    let local = o.worldToLocal(p0.clone());
    record();
    l.pins ||= [];
    let pin = { x: local.x, y: local.y, dx: 0, dy: 0 };
    l.pins.push(pin);
    drag(
      e,
      (x, y, ev) => {
        let n = o.worldToLocal(worldAt(ev, z));
        pin.dx = n.x - local.x;
        pin.dy = n.y - local.y;
        o.userData.key = '';
        refresh();
      },
      changed,
    );
    return;
  }
  const moveSet=L().filter(q=>S.has(q.id)&&!q.locked&&!hasSelectedParent(q)).map(q=>({l:q,o:entries.get(q.id),p:componentKeys.map(k=>val(q,k))}));
  let did = false;
  drag(
    e,
    (dx, dy, ev) => {
      if (!did && Math.hypot(dx, dy) < 2) return;
      if (!did) {
        record();
        did = true;
      }
      let q1 = o.parent.worldToLocal(worldAt(ev, z)),
        q0 = o.parent.worldToLocal(p0.clone()),
        dif = q1.sub(q0);
      if(toolname==='select'&&S.size>1){
        const delta=worldAt(ev,z).sub(p0);
        for(const item of moveSet){const d=delta.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(item.o.parent.matrixWorld).invert());componentKeys.forEach((k,i)=>setVal(item.l,k,item.p[i]+d[k]))}
      }
      else if (toolname === 'rotate') setVal(l, 'rz', start.rz + dx * 0.45);
      else if (toolname === 'scale') {
        for (let k of ['sx', 'sy', 'sz']) setVal(l, k, Math.max(1, start[k] * (1 + dx / 160)));
      } else {
        for (let k of ['x', 'y', 'z']) setVal(l, k, start[k] + dif[k]);
        if (toolname === 'axis') {
          let diff = dif.applyQuaternion(o.quaternion.clone().invert()).divide(o.scale);
          for (let k of ['x', 'y', 'z']) setVal(l, 'a' + k, start['a' + k] + diff[k]);
        }
      }
      refresh();
    },
    () => {
      if (did) changed();
    },
  );
}
canvas.ondblclick = () => {
  if (activeTool === 'pen' && penPts.length >= 3) {
    addLayer('shape', { shape: 'path', points: penPts });
    penPts = [];
    tool('select');
  }
};
window.videoExport = {
  runs: ['demo'],
  async begin(id, { fps = 60 } = {}) {
    if (id !== 'demo') throw Error('未知导出段落');
    this.backup = { p: P, t: T, s: [...S], tab, propTab };
    stop();
    exporting = true;
    this.fps = fps;
    P = demo();
    S = new Set([L()[0].id]);
    T = 0;
    tab = '时间轴';
    propTab = '属性';
    version++;
    selectedHandles = false;
    drawUI();
    refresh();
    gl.finish();
    return { frames: 15 * fps };
  },
  async frame(i) {
    T = Math.min(15, Math.max(0, i / this.fps));
    refresh();
    gl.finish();
  },
  end() {
    if (!exporting) return;
    P = this.backup.p;
    T = this.backup.t;
    S = new Set(this.backup.s);
    tab = this.backup.tab;
    propTab = this.backup.propTab;
    exporting = false;
    version++;
    drawUI();
    refresh();
  },
};
drawUI();
refresh();
new ResizeObserver(() => refresh()).observe($('#screen'));
