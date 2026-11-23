Object.assign(names, {
  fontSize: '字号倍率',
  animStart: '范围起点',
  animEnd: '范围终点',
  animOffset: '范围偏移',
  animSoft: '软边',
  animX: '水平位移',
  animY: '垂直位移',
  animRot: '字符旋转',
  animScale: '缩放增量',
  windX: '水平风力',
  windZ: '纵深风力',
  strokeWidth: '描边宽度',
  animOpacity: '字符不透明度',
});
let projectPoster = '',
  pointEdit = false,
  spatialEdit = false,
  copyKeys = [],
  keySet = [],
  activeVertex = null,
  pendingHole = false,
  pathPreview = null;
function advField(l, k, label = names[k], unit = '') {
  return (
    '<div class="field"><button class="watch ' +
    (l.keys[k]?.length ? 'keyed' : '') +
    '" data-watch="' +
    k +
    '" title="动画">' +
    ic('watch') +
    '</button><label>' +
    esc(label) +
    '</label><span class="dial"><input aria-label="' +
    esc(label) +
    '" data-k="' +
    k +
    '" value="' +
    num(val(l, k)) +
    '"><em>' +
    unit +
    '</em></span></div>'
  );
}
function advSelect(l, k, n, values) {
  return (
    '<div class="field"><label>' +
    n +
    '</label><select data-lprop="' +
    k +
    '">' +
    values
      .map((v) => '<option ' + (l[k] === v ? 'selected' : '') + '>' + esc(v) + '</option>')
      .join('') +
    '</select></div>'
  );
}
const smallAct = (a, n) => '<button class="smallbtn" data-extra="' + a + '">' + n + '</button>';
let oldInspector = inspector;
inspector = function () {
  oldInspector();
  let l = sel();
  if (!l) return;
  let end = $('#props .insActions'),
    add = (s) => end.insertAdjacentHTML('beforebegin', s),
    f = (k) => advField(l, k);
  if (propTab === '属性') {
    if (l.type === 'text' && l.model !== 'caption') {
      add(
        group(
          '排版与动画器',
          'type',
          advSelect(l, 'align', '对齐方式', ['居中', '左对齐', '右对齐']) +
            advSelect(l, 'textUnit', '选择单位', ['逐字', '逐词', '逐行']) +
            [
              'fontSize',
              'spacing',
              'line',
              'animStart',
              'animEnd',
              'animOffset',
              'animSoft',
              'animX',
              'animY',
              'animRot',
              'animScale',
              'animOpacity',
            ]
              .map(f)
              .join('') +
            '<p class="propHelp">内置思源宋体风格的 Noto Serif SC 粗体轮廓，覆盖 7,946 个字符。「火」使用手工笔形。其他字符调用系统字体。</p>',
          'TYPE',
          false,
        ),
      );
    }
    if (
      ['shape', 'text', 'geo'].includes(l.type) &&
      !['air', 'stage', 'hammer', 'caption'].includes(l.model)
    ) {
      add(
        group(
          '轮廓与操作器',
          'pen',
          (l.ops || [])
            .map(
              (op, i) =>
                '<div class="oprow"><span>' +
                String(i + 1).padStart(2, '0') +
                '　' +
                op.type +
                '</span><button data-opup="' +
                i +
                '">↑</button><button data-opdel="' +
                i +
                '">×</button></div>',
            )
            .join('') +
            '<div class="flex">' +
            smallAct('op', '＋ 操作器') +
            smallAct('editPoints', '编辑轮廓') +
            '</div><div class="flex" style="margin-top:6px">' +
            smallAct('morph', '形状关键帧') +
            smallAct('hole', '绘制孔洞') +
            '</div>' +
            f('strokeWidth') +
            '<div class="field"><label>描边颜色</label><input data-lprop="strokeColor" type="color" value="' +
            (l.strokeColor || '#f5bd74') +
            '"></div>',
          'VECTOR',
          false,
        ),
      );
      add(
        group(
          '空间与碰撞',
          'vortex',
          '<label class="field"><input type="checkbox" data-flag="collider" ' +
            (l.collider ? 'checked' : '') +
            '> 粒子碰撞表面</label><label class="field"><input type="checkbox" data-flag="cast" ' +
            (l.cast !== false ? 'checked' : '') +
            '> 投射阴影</label><label class="field"><input type="checkbox" data-flag="receive" ' +
            (l.receive !== false ? 'checked' : '') +
            '> 接收阴影</label>' +
            smallAct('space', '编辑运动路径'),
          'SPACE',
          false,
        ),
      );
    }
    if (l.type === 'particle') {
      add(
        group(
          '发射与碰撞',
          'spark',
          advSelect(l, 'emitMode', '发射方式', ['几何表面', '轮廓曲线', '点']) +
            f('windX') +
            f('windZ') +
            '<label class="field"><input type="checkbox" data-flag="secondary" ' +
            (l.secondary ? 'checked' : '') +
            '> 碰撞次级发射</label>',
          'DYNAMICS',
        ),
      );
    }
    if (l.type === 'field')
      add(
        group(
          '场设置',
          'vortex',
          advSelect(l, 'fieldKind', '类型', ['距离衰减', '噪声', '旋涡']),
          'FALLOFF',
        ),
      );
  } else if (propTab === '效果') {
    add(
      group(
        '蒙版堆栈',
        'layers',
        advSelect(l, 'matteMode', '遮罩读取', ['Alpha', '反转 Alpha', '亮度', '反转亮度']) +
          (l.masks || [])
            .map(
              (m, i) =>
                '<div class="oprow"><span>蒙版 ' +
                (i + 1) +
                '　' +
                esc(m.shape) +
                '</span><button data-maskedit="' +
                i +
                '">编辑</button><button data-maskdel="' +
                i +
                '">×</button></div>',
            )
            .join('') +
          smallAct('mask', '＋ 添加蒙版'),
        'MASKS',
      ),
    );
  }
};
let origAssets = assetList;
assetList = function () {
  origAssets();
  for (let el of $$('#assetList [data-comp]')) {
    let c = P.comps.find((c) => c.id === el.dataset.comp);
    if (!c?.layers.some((l) => l.model === 'glyph') || filter) continue;
    el.classList.add('compCard');
    el.innerHTML =
      '<i class="compPhoto" style="background-image:url(' +
      projectPoster +
      ')"></i><span class="compMark">COMPOSITION　01</span><div class="compCopy">' +
      ic('comp') +
      '<p>' +
      esc(c.name) +
      '</p><small>' +
      c.duration +
      's / ' +
      c.fps +
      'fps</small></div>';
  }
};
let baseTimeline = timeline;
timeline = function () {
  baseTimeline();
  if (tab === '时间轴' && C().markers?.length) {
    let phases = C().markers.map((m, i, ms) => [m.name, m.t, (ms[i + 1]?.t ?? C().duration) - m.t]);
    $('.timeTop').insertAdjacentHTML(
      'afterend',
      '<div class="phaseLane"><div class="trackinfo">' +
        ic('time') +
        '　合成标记</div><div class="phaseStrips">' +
        phases
          .map(
            ([n, t, len], i) =>
              '<button '+ (timePercent(t+len)<=0||timePercent(t)>=100?'hidden ':'')+'data-phase="' +
              t +
              '" class="' +
              (phase(T) === n ? 'phaseNow' : '') +
              '" style="min-width:' +
              Math.max(0,Math.min(100,timePercent(t+len))-Math.max(0,timePercent(t))) +
              '%"><b>0' +
              (i + 1) +
              '</b> ' +
              n +
              '</button>',
          )
          .join('') +
        '</div></div>',
    );
  }
  if (tab === '节点' && sel()) {
    let n = sel().nodes.find((n) => n.id === selectedNode);
    if (n) $('.graphTools').insertAdjacentHTML('beforeend', smallAct('nodeParam', '节点参数'));
    $('.graphTools').insertAdjacentHTML('beforeend', smallAct('groupNodes', '封装节点组'));
  }
  keySet.forEach((q) =>
    $$('[data-key]')
      .find((e) => e.dataset.key === q.l && Number(e.dataset.t) === q.t)
      ?.classList.add('picked'),
  );
};
function addMask(i) {
  let l = sel(),
    mask = (l.masks || [])[i] || {
      shape: '椭圆',
      x: 0,
      y: 1,
      w: 2.8,
      h: 3,
      feather: 4,
      invert: false,
    };
  dialog(
    '蒙版设置',
    [
      ['shape', '形状', mask.shape, ['椭圆', '矩形']],
      ...['x', 'y', 'w', 'h', 'feather'].map((k, j) => [
        k,
        ['中心 X', '中心 Y', '宽度', '高度', '羽化（像素）'][j],
        mask[k],
      ]),
      ['inv', '反转', mask.invert ? '是' : '否', ['否', '是']],
    ],
    (d) => {
      record();
      l.masks ||= [];
      let m = { shape: d.shape, invert: d.inv === '是' };
      for (let k of ['x', 'y', 'w', 'h', 'feather']) m[k] = +d[k] || 0;
      if (mask.points) m.points = mask.points;
      if (mask.keys?.length) {
        m.keys = mask.keys.filter((q) => q.t !== T);
        let data = { ...m };
        delete data.keys;
        m.keys.push({ t: T, ...data });
        m.keys.sort((a, b) => a.t - b.t);
      }
      l.masks[i ?? l.masks.length] = m;
      changed();
    },
  );
}
function extraAction(a, b) {
  let l = sel();
  if (!l) return;
  if (a === 'op') {
    menu(
      b,
      ['并集', '差集', '交集', '重复器', '修剪路径'].map((type) => [
        type,
        () => {
          let add = (id) => {
            record();
            l.ops ||= [];
            l.ops.push({ type, target: id });
            if (type === '重复器' && l.p.repeat === 1) l.p.repeat = 3;
            if (type === '修剪路径' && l.p.trim === 100) l.p.trim = 72;
            changed();
          };
          if (['并集', '差集', '交集'].includes(type)) {
            let opts = L().filter(
              (other) =>
                other !== l &&
                ['geo', 'shape', 'text'].includes(other.type) &&
                !['stage', 'air', 'hammer', 'caption'].includes(other.model),
            );
            if (!opts.length) {
              notify('请先添加另一个形状作为运算对象');
              return;
            }
            menu(
              b,
              opts.map((o) => [o.name, () => add(o.id)]),
            );
          } else add('');
        },
      ]),
    );
  }
  if (a === 'editPoints') {
    if (!l.paths?.length) {
      const paths=captureContours(vectorShapes(l,T));
      if(!paths.length)return;
      record();l.paths=paths;l.activeRing=null;selectRing(l,0);
      l.shape='path';l.model='';l.type='shape';l.contours=[];l.nodes=[];
    }
    pointEdit = !pointEdit;
    spatialEdit = false;
    activeTool = 'select';
    changed();
  }
  if (a === 'hole') {
    pendingHole = true;
    penPts = [];
    tool('pen');
    notify('在轮廓内逐点绘制孔洞，双击闭合');
  }
  if (a === 'morph') {
    record();
    storeShapeKey(l,T);
    changed();
    notify('已记录当前轮廓');
  }
  if (a === 'space') {
    spatialEdit = !spatialEdit;
    pointEdit = false;
    if (!['x', 'y', 'z'].some((k) => l.keys[k]?.length)) {
      record();
      for (let k of ['x', 'y', 'z'])
        l.keys[k] = [
          key(T, val(l, k)),
          key(Math.min(C().duration, T + 1), val(l, k) + (k === 'x' ? 1 : 0)),
        ];
    }
    changed();
    if (spatialEdit) notify('拖动路径节点或切线手柄');
  }
  if (a === 'mask') addMask();
  if (a === 'nodeParam') {
    let n = l.nodes.find((q) => q.id === selectedNode);
    if (!n) return;
    let prop = n.param || (n.op === '挤出实体' ? 'depth' : 'node_' + n.id),
      sources = L().filter((a) => a !== l && ['geo', 'shape', 'text'].includes(a.type));
    dialog(
      '节点参数',
      [
        ['v', '数值', l.p[prop] !== undefined || l.keys[prop]?.length ? val(l, prop) : 1],
        [
          'ref',
          '输入资源',
          sources.find((o) => o.id === n.ref)?.name || '本层几何',
          ['本层几何', ...sources.map((l) => l.name)],
        ],
        ['animate', '记录关键帧', l.keys[prop]?.length ? '是' : '否', ['否', '是']],
      ],
      (d) => {
        record();
        n.param = prop;
        n.ref = sources.find((o) => o.name === d.ref)?.id || '';
        if (d.animate === '是' && !l.keys[prop]?.length) l.keys[prop] = [key(T, +d.v)];
        setVal(l, prop, +d.v);
        changed();
      },
    );
  }
  if (a === 'groupNodes') {
    dialog('封装节点组', [['name', '组名称', '几何处理组']], (d) => {
      record();
      l.nodeGroup = d.name;
      changed();
      notify('已封装节点组 ' + d.name);
    });
  }
}
document.addEventListener('click', (e) => {
  let b = e.target.closest('button');
  if (!b) return;
  let d = b.dataset,
    l = sel();
  if (d.phase !== undefined) seek(+d.phase);
  if (d.extra) extraAction(d.extra, b);
  if (d.maskedit != null) addMask(+d.maskedit);
  if (d.maskdel != null) {
    record();
    l.masks.splice(+d.maskdel, 1);
    changed();
  }
  if (d.opup != null && +d.opup > 0) {
    record();
    let i = +d.opup;
    [l.ops[i - 1], l.ops[i]] = [l.ops[i], l.ops[i - 1]];
    changed();
  }
  if (d.opdel != null) {
    record();
    l.ops.splice(+d.opdel, 1);
    changed();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.flag && sel()) {
    record();
    sel()[e.target.dataset.flag] = e.target.checked;
    changed();
  }
});
let oldRefresh = refresh;
refresh = function () {
  oldRefresh();
  let l = sel(),
    h = $('#handles'),
    o = l && entries.get(l.id),
    pp = (q) => {
      let p = q.clone().project(camera);
      return [(p.x * 0.5 + 0.5) * canvas.clientWidth, (0.5 - p.y * 0.5) * canvas.clientHeight];
    },
    circle = (p, attr, color = '#d1f786', size = 4) =>
      '<circle cx="' +
      p[0] +
      '" cy="' +
      p[1] +
      '" r="' +
      size +
      '" fill="' +
      color +
      '" stroke="#293322" ' +
      attr +
      '/>',
    line = (a, b, color = '#d6ee9c') =>
      '<path d="M' +
      a.join(' ') +
      'L' +
      b.join(' ') +
      '" stroke="' +
      color +
      '" fill="none" stroke-dasharray="3 3"/>';
  let svg = '';
  if (o && pointEdit && l.points) {
    let pts = l.points.map(([x, y]) => pp(o.localToWorld(V(x, y, 0.05))));
    svg += pts
      .map((p, i) => line(p, pts[(i + 1) % pts.length]) + circle(p, 'data-vertex="' + i + '"'))
      .join('');
  }
  if (o && spatialEdit) {
    let times = [...new Set(componentKeys.flatMap((k) => (l.keys[k] || []).map((q) => q.t)))].sort(
        (a, b) => a - b,
      ),
      world = (v, t) =>
        l.parent && entries.get(l.parent)
          ? v.applyMatrix4(
              layerMatrixAt(
                L().find((a) => a.id === l.parent),
                t,
              ),
            )
          : v;
    if (times.length > 1) {
      let curve = [];
      for (let i = 0; i < 101; i++) {
        let tt = times[0] + ((times.at(-1) - times[0]) * i) / 100;
        curve.push(pp(world(V(...componentKeys.map((k) => val(l, k, tt))), tt)));
      }
      svg +=
        '<polyline points="' +
        curve.map((p) => p.join(',')).join(' ') +
        '" fill="none" stroke="#bde780"/>';
      times.forEach((t, i) => {
        let pos = V(...componentKeys.map((k) => basePlain(l, k, t))),
          p = pp(world(pos.clone(), t));
        svg += circle(p, 'data-spacetime="' + t + '"');
        for (let side of ['in', 'out']) {
          let si = side === 'out' ? 1 : -1;
          if (!times[i + si]) {
            if (times[i + si] !== 0) continue;
          }
          let hand = l.space?.[t]?.[side] || [si * 0.3, si * 0.18, 0],
            hp = pp(world(pos.clone().add(vArr(hand)), t));
          svg +=
            line(p, hp, '#dda76f') +
            circle(hp, 'data-spacetime="' + t + '" data-tangent="' + side + '"', '#efaf72', 3.5);
        }
      });
    }
  }
  if (l?.type === 'field' && o) {
    let p = pp(o.getWorldPosition(V())),
      end = pp(o.getWorldPosition(V()).add(V(val(l, 'range'), 0, 0)));
    svg +=
      '<circle cx="' +
      p[0] +
      '" cy="' +
      p[1] +
      '" r="' +
      Math.hypot(end[0] - p[0], end[1] - p[1]) +
      '" fill="none" stroke="#d0ee9d" stroke-dasharray="5 4"/>';
  }
  if (activeTool === 'pen' && penPts.length) {
    let pts = penPts.map((p) => pp(V(...p, 0)));
    svg +=
      '<polyline points="' +
      pts.map((p) => p.join(',')).join(' ') +
      '" fill="none" stroke="#bfe27c"/>' +
      pts.map((p) => circle(p, '')).join('');
  }
  if (svg) h.insertAdjacentHTML('beforeend', '<svg class="editpoints">' + svg + '</svg>');
  $$('[data-phase]').forEach((b) =>
    b.classList.toggle('phaseNow', phase(+b.dataset.phase) === phase(T)),
  );
  if (l?.nodeGroup && tab === '节点' && $('.graphTools .small'))
    $('.graphTools .small').textContent = l.nodeGroup;
  let cap = L().find((x) => x.model === 'caption'),
    overlay = $('#overlay');
  if (cap) {
    overlay.style.transform =
      'translate(' +
      val(cap, 'x') * 12 +
      '%,' +
      -val(cap, 'y') * 15 +
      '%) rotate(' +
      -val(cap, 'rz') +
      'deg) scale(' +
      val(cap, 'sx') / 100 +
      ',' +
      val(cap, 'sy') / 100 +
      ')';
    overlay.style.opacity = val(cap, 'opacity') / 100;
    overlay.style.color = cap.color;
  } else {
    overlay.style.transform = '';
    overlay.style.opacity = 1;
  }
};
let priorPen = canvas.ondblclick;
canvas.ondblclick = (e) => {
  if (pendingHole && activeTool === 'pen' && penPts.length >= 3 && sel()) {
    record();
    let o = entries.get(sel().id);
    sel().contours ||= [];
    sel().contours.push(
      penPts.map((p) => {
        let q = o.worldToLocal(V(...p, 0));
        return [q.x, q.y];
      }),
    );
    pendingHole = false;
    penPts = [];
    tool('select');
    changed();
  } else priorPen(e);
};
document.addEventListener(
  'pointerdown',
  (e) => {
    let target = e.target,
      l = sel();
    if (target.dataset.vertex != null || target.dataset.spacetime != null) {
      e.stopImmediatePropagation();
      let o = entries.get(l.id),
        old = worldAt(e),
        i = +target.dataset.vertex,
        t = +target.dataset.spacetime,
        side = target.dataset.tangent,
        saved =
          target.dataset.vertex != null
            ? [...l.points[i]]
            : side
              ? [
                  ...(l.space?.[t]?.[side] || [
                    (side === 'out' ? 1 : -1) * 0.3,
                    (side === 'out' ? 1 : -1) * 0.18,
                    0,
                  ]),
                ]
              : componentKeys.map((k) => basePlain(l, k, t));
      record();
      drag(
        e,
        (x, y, ev) => {
          let a = worldAt(ev),
            parent = target.dataset.vertex != null ? o : o.parent,
            d = parent.worldToLocal(a).sub(parent.worldToLocal(old.clone()));
          if (target.dataset.vertex != null) {
            l.points[i] = [saved[0] + d.x, saved[1] + d.y];
            if(l.morph?.length)storeShapeKey(l,T);
            o.userData.key = '';
          } else if (side) {
            l.space ||= {};
            l.space[t] ||= {};
            l.space[t][side] = [saved[0] + d.x, saved[1] + d.y, saved[2] + d.z];
          } else
            componentKeys.forEach((k, j) => {
              if (!l.keys[k]?.length) l.keys[k] = [key(t, saved[j])];
              setVal(l, k, saved[j] + d[k], t);
            });
          refresh();
        },
        changed,
      );
      return;
    }
    let diamond = target.closest('[data-key]');
    if (diamond && (e.shiftKey || e.ctrlKey)) {
      e.stopImmediatePropagation();
      let q = { l: diamond.dataset.key, k: diamond.dataset.prop, t: +diamond.dataset.t },
        i = keySet.findIndex((x) => x.l === q.l && x.k === q.k && x.t === q.t);
      if (i === -1) keySet.push(q);
      else keySet.splice(i, 1);
      selectedKey = q;
      timeline();
      return;
    }
    if (diamond && keySet.length > 1) {
      e.stopImmediatePropagation();
      let arr = keySet
          .map((q) => ({
            q,
            pt: L()
              .find((l) => l.id === q.l)
              ?.keys[q.k]?.find((v) => v.t === q.t),
            t: q.t,
          }))
          .filter((z) => z.pt),
        left = Math.min(...arr.map((z) => z.t)),
        right = Math.max(...arr.map((z) => z.t)),
        w = $('.trackLane').clientWidth;
      record();
      drag(
        e,
        (dx) => {
          let dt = (dx / w) * spanTime();
          for (let z of arr) {
            z.pt.t = Math.max(
              0,
              Math.min(
                C().duration,
                snapped(
                  e.altKey
                    ? left + (z.t - left) * (1 + dt / Math.max(0.01, right - left))
                    : z.t + dt,
                ),
              ),
            );
            z.q.t = z.pt.t;
          }
          timeline();
          refresh();
        },
        () => {
          for (let l of L()) Object.values(l.keys).forEach((a) => a.sort((a, b) => a.t - b.t));
          changed();
        },
      );
      return;
    }
    if (target.closest('.trackLane') && !target.closest('.diamond') && e.shiftKey) {
      e.stopImmediatePropagation();
      let box = document.createElement('div');
      box.className = 'keyBox';
      document.body.append(box);
      let x0 = e.clientX,
        y0 = e.clientY;
      drag(
        e,
        (dx, dy) => {
          Object.assign(box.style, {
            left: Math.min(x0, x0 + dx) + 'px',
            top: Math.min(y0, y0 + dy) + 'px',
            width: Math.abs(dx) + 'px',
            height: Math.abs(dy) + 'px',
          });
          let r = box.getBoundingClientRect();
          keySet = $$('[data-key]')
            .filter((b) => {
              let bb = b.getBoundingClientRect();
              return (
                bb.left <= r.right && bb.right >= r.left && bb.top <= r.bottom && bb.bottom >= r.top
              );
            })
            .map((b) => ({ l: b.dataset.key, k: b.dataset.prop, t: +b.dataset.t }));
          timeline();
        },
        () => box.remove(),
      );
      return;
    }
    if (!diamond && !target.closest('.graphTools')) keySet = [];
  },
  true,
);
document.addEventListener(
  'keydown',
  (e) => {
    if (e.target.closest('input,textarea,select,dialog') || !keySet.length) return;
    let ctrl = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase();
    if (ctrl && k === 'c' && !e.shiftKey) {
      e.stopImmediatePropagation();
      e.preventDefault();
      copyKeys = keySet.map((q) => ({
        ...q,
        ...L()
          .find((l) => l.id === q.l)
          .keys[q.k].find((a) => a.t === q.t),
      }));
    }
    if (ctrl && k === 'v' && copyKeys.length) {
      e.stopImmediatePropagation();
      e.preventDefault();
      record();
      let start = Math.min(...copyKeys.map((q) => q.t));
      for (let q of copyKeys) {
        let l = L().find((l) => l.id === q.l);
        if (!l) continue;
        l.keys[q.k].push(key(Math.max(0, Math.min(C().duration, T + q.t - start)), q.v, q.mode));
        l.keys[q.k].sort((a, b) => a.t - b.t);
      }
      changed();
    }
    if (k === 'delete' || k === 'f9') {
      e.stopImmediatePropagation();
      e.preventDefault();
      record();
      for (let q of keySet) {
        let l = L().find((l) => l.id === q.l);
        if (k === 'delete') l.keys[q.k] = l.keys[q.k].filter((k) => k.t !== q.t);
        else {
          let k = l.keys[q.k].find((k) => k.t === q.t);
          if (k) k.mode = 'bezier';
        }
      }
      keySet = [];
      changed();
    }
  },
  true,
);
const postThumb = document.createElement('canvas');
postThumb.width = 340;
postThumb.height = 125;
postThumb.getContext('2d').drawImage(canvas, 0, 0, 340, 175);
projectPoster = postThumb.toDataURL('image/jpeg', 0.8);
let enhancedTimeline = timeline;
timeline = function () {
  enhancedTimeline();
  if (tab === '节点') {
    let l = sel();
    if (!l) return;
    for (let e of $$('[data-node]')) {
      let n = l.nodes.find((a) => a.id === e.dataset.node),
        kind = nodeKind(n),
        v = n.param ? num(val(l, n.param)) : null;
      e.querySelector('small').innerHTML =
        (kind === '几何'
          ? '<button class="port" data-portin="' + n.id + '" title="几何输入"></button>'
          : '<span></span>') +
        '<span>' +
        kind +
        (v !== null ? '　' + v : '') +
        '</span><button class="port" data-portout="' +
        n.id +
        '" style="background:' +
        { 几何: '#bed990', 向量: '#77aabc', 标量: '#b5a5d4', 颜色: '#dbaa85', 场: '#eeaf82' }[
          kind
        ] +
        '" title="' +
        kind +
        '输出"></button>';
      if (kind === '几何' && !['文字轮廓', '路径输入', '几何输出'].includes(n.op))
        e.insertAdjacentHTML(
          'beforeend',
          '<small style="border-top:1px solid #373c39"><button class="port" style="background:#a79bc0" data-paramin="' +
            n.id +
            '"></button>参数输入</small>',
        );
      if (n.control) {
        let a = l.nodes.find((x) => x.id === n.control);
        if (a)
          $('.nodeAreaSvg').insertAdjacentHTML(
            'beforeend',
            '<path d="M' +
              (a.x + 135) +
              ' ' +
              (a.y + 47) +
              ' C' +
              (a.x + 175) +
              ' ' +
              (a.y + 47) +
              ' ' +
              (n.x - 32) +
              ' ' +
              (n.y + 77) +
              ' ' +
              n.x +
              ' ' +
              (n.y + 77) +
              '" stroke="#afa3ca" fill="none"/>',
          );
      }
    }
    return;
  }
  if (tab === '曲线') {
    graphHandles();
    return;
  }
  let r = $('.timeRuler');
  if (r) {
    r.querySelectorAll('span').forEach((e) => e.remove());
    let dt = spanTime() <= 5 ? 1 : spanTime() <= 16 ? 2 : 5;
    for (let t = Math.ceil(windowStart()/dt)*dt; t <= windowStart()+spanTime(); t += dt)
      r.insertAdjacentHTML(
        'beforeend',
        '<span style="left:' +
          timePercent(t) +
          '%;' +
          (t === spanTime() ? 'transform:translateX(-100%)' : '') +
          '">' +
          String(t).padStart(2, '0') +
          's</span>',
      );
  }
  for (let row of $$('.trackrow[data-layer]')) {
    let l = L().find((o) => o.id === row.dataset.layer),
      keys = Object.entries(l.keys).filter(([k, a]) => a?.length);
    row
      .querySelector('.trackinfo')
      .insertAdjacentHTML(
        'beforeend',
        '<button class="rowToggle" data-expand="' +
          l.id +
          '" title="展开动画属性">' +
          ic(expanded.has(l.id) ? 'down' : 'arrow') +
          '</button>',
      );
    let clip = row.querySelector('.clip');
    clip.insertAdjacentHTML(
      'beforeend',
      '<i class="slip start" data-trim="in"></i><i class="slip end" data-trim="out"></i>',
    );
    if (expanded.has(l.id)) {
      let rows = keys.length
        ? keys
            .map(
              ([k, a]) =>
                '<div class="trackrow subtrack" data-layer="' +
                l.id +
                '"><div class="trackinfo">' +
                ic('watch') +
                '<span>' +
                esc(names[k] || k) +
                '</span></div><div class="trackLane">' +
                a
                  .map(
                    (q) =>
                      '<i class="diamond" data-key="' +
                      l.id +
                      '" data-prop="' +
                      k +
                      '" data-t="' +
                      q.t +
                      '" style="left:' +
                      timePercent(q.t) +
                      '%"></i>',
                  )
                  .join('') +
                '</div></div>',
            )
            .join('')
        : '<div class="trackrow subtrack"><div class="trackinfo">尚无动画属性</div></div>';
      row.insertAdjacentHTML('afterend', rows);
    }
  }
};
function graphHandles() {
  let l = sel(),
    svg = $('.grapharea svg');
  if (!l || !svg) return;
  let min = +svg.dataset.min,
    max = +svg.dataset.max,
    keys = l.keys[propKey] || [],
    yy = (v) => 85 - (65 * (v - min)) / (max - min),
    tt = (t) => (t / C().duration) * 1000,
    lines = '';
  for (let i = 0; i <= 5; i++) {
    let x = i * 200;
    lines +=
      '<path d="M' + x + ' 0v100" stroke="#777" opacity=".2" vector-effect="non-scaling-stroke"/>';
  }
  for (let i = 0; i < 3; i++)
    lines +=
      '<path d="M0 ' +
      (20 + i * 32.5) +
      'h1000" stroke="#777" opacity=".18" vector-effect="non-scaling-stroke"/>';
  svg.insertAdjacentHTML('afterbegin', lines);
  if (!speedGraph) {
    let handles = '';
    for (let i = 1; i < keys.length; i++) {
      let a = keys[i - 1],
        b = keys[i],
        dx = tt(b.t) - tt(a.t);
      for (let [q, side, v, u] of [
        [a, 'out', a.outHandle ?? 0, a.outTime ?? 1 / 3],
        [b, 'in', b.inHandle ?? 1, b.inTime ?? 2 / 3],
      ]) {
        let y = yy(a.v + (b.v - a.v) * v),
          x = tt(a.t) + dx * u;
        if (q.mode !== 'bezier' && q.inMode !== 'bezier') continue;
        handles +=
          '<path class="handleLine" d="M' +
          tt(q.t) +
          ' ' +
          yy(q.v) +
          'L' +
          x +
          ' ' +
          y +
          '"/><ellipse data-gh="' +
          q.t +
          '" data-side="' +
          side +
          '" cx="' +
          x +
          '" cy="' +
          y +
          '" rx="3.6" ry="2.5" fill="#c5a97a"/>';
      }
    }
    svg.insertAdjacentHTML('beforeend', handles);
  }
  $('.grapharea').insertAdjacentHTML(
    'beforeend',
    '<div class="graphhint">' +
      esc(names[propKey] || propKey) +
      '　' +
      num(min) +
      ' — ' +
      num(max) +
      '</div>',
  );
}
function groupReal() {
  let l = sel();
  if (!l?.nodes.length) return;
  let group =
    l.nodes.find((q) => q.id === selectedNode && q.children) || l.nodes.find((q) => q.children);
  if (group) {
    record();
    l.nodes = group.children;
    l.nodeGroup = '';
    selectedNode = '';
    changed();
    return;
  }
  dialog('封装节点组', [['n', '组名称', '锻造几何组']], (d) => {
    record();
    let inner = l.nodes,
      g = {
        id: 'n' + uid++,
        op: d.n,
        children: inner,
        exit: inner.find((n) => n.op === '几何输出')?.id,
        x: 80,
        y: 38,
      },
      out = { id: 'n' + uid++, op: '几何输出', input: g.id, x: 290, y: 38 };
    l.nodes = [g, out];
    l.nodeGroup = d.n;
    changed();
  });
}
document.addEventListener(
  'click',
  (e) => {
    let el = e.target.closest('button');
    if (!el) return;
    let d = el.dataset,
      l = sel();
    if (d.expand) {
      e.stopImmediatePropagation();
      expanded.has(d.expand) ? expanded.delete(d.expand) : expanded.add(d.expand);
      timeline();
      return;
    }
    if (d.extra === 'groupNodes') {
      e.stopImmediatePropagation();
      groupReal();
      return;
    }
    if (d.act === 'addnode') {
      e.stopImmediatePropagation();
      if (!l) return;
      menu(
        el,
        [
          '文字轮廓',
          '路径输入',
          '挤出实体',
          '变换几何',
          '分布实例',
          '弯曲变形',
          '扭转变形',
          '材质颜色',
          '场驱动变形',
          '几何输出',
          '数值',
          '向量',
          '颜色',
          '空间场',
        ].map((op) => [
          op,
          () => {
            record();
            let n = {
              id: 'n' + uid++,
              op,
              x: 38 + ((l.nodes.length * 135) % 440),
              y: 20 + (l.nodes.length % 3) * 44,
            };
            if (nodeKind(n) !== '几何') {
              n.param = 'node_' + n.id;
              l.p[n.param] = 1;
              n.tint = '#ffb469';
            }
            l.nodes.push(n);
            selectedNode = n.id;
            changed();
          },
        ]),
      );
      return;
    }
    if (d.portin && connecting && nodeKind(l.nodes.find((n) => n.id === connecting)) !== '几何') {
      e.stopImmediatePropagation();
      notify('几何输入需要几何端口');
      return;
    }
    if (d.paramin) {
      e.stopImmediatePropagation();
      let n = l.nodes.find((q) => q.id === d.paramin),
        src = l.nodes.find((q) => q.id === connecting);
      let expected =
        n.op === '材质颜色'
          ? ['颜色']
          : n.op === '场驱动变形'
            ? ['场']
            : n.op === '变换几何'
              ? ['向量', '标量']
              : ['标量'];
      if (!src || !expected.includes(nodeKind(src))) {
        notify('该参数需要' + expected.join('或') + '输出');
        return;
      }
      record();
      n.control = src.id;
      connecting = '';
      changed();
      return;
    }
    if (d.act === 'interp') {
      e.stopImmediatePropagation();
      let modes = [
        ['线性', 'linear'],
        ['缓动', 'bezier'],
        ['定格', 'hold'],
      ];
      menu(
        el,
        ['进入', '离开'].flatMap((n, i) =>
          modes.map(([title, mode]) => [
            n + ' · ' + title,
            () => {
              let qs = l?.keys[propKey];
              if (!qs) return;
              record();
              qs.filter((q) => !selectedKey || q.t === selectedKey.t).forEach(
                (q) => (q[i ? 'mode' : 'inMode'] = mode),
              );
              changed();
            },
          ]),
        ),
      );
      return;
    }
  },
  true,
);
document.addEventListener(
  'pointerdown',
  (e) => {
    let el = e.target;
    if (el.dataset.gh != null) {
      e.stopImmediatePropagation();
      let dir = el.dataset.side,
        keys = sel().keys[propKey],
        i = keys.findIndex((q) => q.t === +el.dataset.gh),
        a = keys[dir === 'out' ? i : i - 1],
        b = keys[dir === 'out' ? i + 1 : i],
        q = keys[i],
        box = $('.grapharea').getBoundingClientRect(),
        svg = $('.grapharea svg'),
        min = +svg.dataset.min,
        max = +svg.dataset.max;
      record();
      drag(
        e,
        (_, __, ev) => {
          let y = ((ev.clientY - box.top) / box.height) * 100,
            value = min + ((85 - y) / 65) * (max - min);
          q[dir+'Time']=Math.max(.002,Math.min(.998,(((ev.clientX-box.left)/box.width)*C().duration-a.t)/(b.t-a.t)));
          q[dir + 'Handle'] = (value - a.v) / (b.v - a.v || 1);
          q[dir==='in'?'inMode':'mode'] = 'bezier';
          timeline();
          refresh();
        },
        changed,
      );
      return;
    }
    if (el.dataset.trim) {
      e.stopImmediatePropagation();
      let k = el.dataset.trim,
        l = L().find((l) => l.id === el.closest('[data-layer]').dataset.layer);
      if (l.locked) return;
      let start = l[k],
        w = $('.trackLane').getBoundingClientRect().width;
      record();
      drag(
        e,
        (x) => {
          let t = snapped(start + (x / w) * spanTime());
          l[k] =
            k === 'in'
              ? Math.min(l.out, Math.max(0, t))
              : Math.max(l.in, Math.min(C().duration, t));
          timeline();
          refresh();
        },
        changed,
      );
    }
  },
  true,
);
let oldGraph = graphView;
graphView = function () {
  oldGraph();
  if (tab === '曲线' && $('#gProp'))
    $('#gProp').insertAdjacentHTML(
      'afterbegin',
      '<option value="pathSpeed" ' +
        (propKey === 'pathSpeed' ? 'selected' : '') +
        '>空间路径速度</option>',
    );
};

let currentRefresh = refresh;
refresh = function () {
  currentRefresh();
  showHelpers();
};
let detailInspector = inspector;
inspector = function () {
  detailInspector();
  let l = sel();
  if (!l || propTab !== '属性') return;
  let end = $('#props .insActions');
  if (l.pins?.length)
    end.insertAdjacentHTML(
      'beforebegin',
      group(
        '图钉',
        'pin',
        l.pins
          .map(
            (p, i) =>
              '<div class="assetgroup">图钉 ' +
              (i + 1) +
              '</div>' +
              ['X', 'Y', 'R', 'S']
                .map((k, j) =>
                  advField(l, 'pin' + i + k, ['水平偏移', '垂直偏移', '旋转', '缩放增量'][j]),
                )
                .join(''),
          )
          .join(''),
        'PUPPET',
      ),
    );
  if (l.type === 'shape' && l.shape === 'path') {
    end.insertAdjacentHTML(
      'beforebegin',
      group(
        '路径设置',
        'pen',
        '<label class="field"><input type="checkbox" data-openpath ' +
          (l.open ? 'checked' : '') +
          '> 开放路径</label><p class="propHelp">编辑轮廓时双击顶点切换平滑与尖角，拖动橙色手柄独立调整切线。</p>',
        'PATH',
        false,
      ),
    );
  }
  if (l.type === 'pre')
    end.insertAdjacentHTML(
      'beforebegin',
      group(
        '合成引用',
        'comp',
        '<div class="field"><label>引用合成</label><select data-refcomp>' +
          P.comps
            .filter((c) => c !== C() && !c.layers.some((o) => o.ref === C().id))
            .map(
              (c) =>
                '<option value="' +
                c.id +
                '" ' +
                (c.id === l.ref ? 'selected' : '') +
                '>' +
                esc(c.name) +
                '</option>',
            )
            .join('') +
          '</select></div><label class="field"><input type="checkbox" data-flag="remapOn" ' +
          (l.remapOn ? 'checked' : '') +
          '> 启用时间重映射</label>' +
          smallAct('openReference', '打开源合成'),
        'SOURCE',
      ),
    );
};
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-extra="openReference"]') && sel()?.ref) switchComp(sel().ref);
});
document.addEventListener('change', (e) => {
  if ('openpath' in e.target.dataset && sel()) {
    record();
    sel().open = e.target.checked;
    if (sel().open && val(sel(), 'strokeWidth') <= 0) sel().p.strokeWidth = 0.04;
    changed();
  }
  if ('refcomp' in e.target.dataset && sel()) {
    record();
    sel().ref = e.target.value;
    changed();
  }
});
document.addEventListener('dblclick', (e) => {
  if (e.target.dataset.vertex != null && sel()) {
    let l = sel(),
      i = +e.target.dataset.vertex,
      p = l.points,
      prev = p[(i - 1 + p.length) % p.length],
      next = p[(i + 1) % p.length],
      dx = (next[0] - prev[0]) / 6,
      dy = (next[1] - prev[1]) / 6;
    record();
    l.handles ||= {};
    if (l.handles[i]) delete l.handles[i];
    else l.handles[i] = { in: [-dx, -dy], out: [dx, dy] };
    changed();
  }
});
document.addEventListener(
  'pointerdown',
  (e) => {
    let el = e.target,
      d = el.dataset,
      l = sel(),
      o = l && entries.get(l.id);
    if (!o || l.locked) return;
    if (d.vhandle != null || d.pin != null || d.axis != null) {
      e.stopImmediatePropagation();
      let pin = d.pin != null ? l.pins[+d.pin] : null,
        k = d.axis,
        start = worldAt(e, o.getWorldPosition(V()).z),
        s = pin
          ? [val(l, 'pin' + d.pin + 'X'), val(l, 'pin' + d.pin + 'Y')]
          : k
            ? val(l, k)
            : [...l.handles[+d.vhandle][d.direction]];
      record();
      drag(
        e,
        (dx, dy, ev) => {
          let a = worldAt(ev, start.z),
            ob = k ? o.parent : o,
            delta = ob.worldToLocal(a).sub(ob.worldToLocal(start.clone()));
          if (pin) {
            setVal(l, 'pin' + d.pin + 'X', s[0] + delta.x);
            setVal(l, 'pin' + d.pin + 'Y', s[1] + delta.y);
          } else if (k) setVal(l, k, s + (k === 'z' ? -dy * 0.013 : delta[k]));
          else l.handles[+d.vhandle][d.direction] = [s[0] + delta.x, s[1] + delta.y];
          o.userData.key = '';
          refresh();
        },
        changed,
      );
      return;
    }
    if (el.matches('.selbox i')) {
      e.stopImmediatePropagation();
      let x = val(l, 'sx'),
        y = val(l, 'sy');
      record();
      drag(
        e,
        (dx) => {
          setVal(l, 'sx', Math.max(1, x * (1 + dx / 150)));
          setVal(l, 'sy', Math.max(1, y * (1 + dx / 150)));
          refresh();
        },
        changed,
      );
    }
  },
  true,
);
document.addEventListener(
  'contextmenu',
  (e) => {
    let field = e.target.closest('[data-k]'),
      l = sel();
    if (field && l) {
      e.preventDefault();
      e.stopImmediatePropagation();
      let k = field.dataset.k;
      propKey = k;
      menu({ left: e.clientX, bottom: e.clientY }, [
        ['添加关键帧', () => addKey(k), 'shape'],
        [
          '编辑值曲线',
          () => {
            tab = '曲线';
            drawUI();
            refresh();
          },
          'curve',
        ],
        [
          '编辑表达式',
          () => {
            propTab = '表达式';
            inspector();
          },
          'fx',
        ],
      ]);
    }
  },
  true,
);
let finalInspector = inspector;
inspector = function () {
  finalInspector();
  let l = sel();
  if (!l || propTab !== '效果') return;
  let dx = $('#props .insActions');
  dx.insertAdjacentHTML(
    'beforebegin',
    group(
      '效果顺序',
      'layers',
      (l.fxOrder || defaultFx)
        .map(
          (k, i) =>
            '<div class="oprow"><button data-togglefx="' +
            k +
            '" style="opacity:' +
            (l.disabledFx?.includes(k) ? 0.35 : 1) +
            '">' +
            ic('eye') +
            '</button><span>' +
            esc(names[k] || '色相 / 饱和度 / 亮度') +
            '</span><button data-fxmove="' +
            i +
            '" title="上移">↑</button></div>',
        )
        .join(''),
      'STACK',
    ),
  );
  let masks = l.masks || [];
  dx.insertAdjacentHTML(
    'beforebegin',
    group(
      '蒙版动画',
      'pen',
      smallAct('freeMask', '＋ 自由路径蒙版') +
        masks
          .map(
            (m, i) =>
              '<div class="oprow"><span>蒙版 ' +
              (i + 1) +
              '</span><button data-maskkey="' +
              i +
              '">' +
              ic('shape') +
              ' 记录路径</button></div>',
          )
          .join(''),
      'PATH',
      false,
    ),
  );
};
let maskDrawing = false;
document.addEventListener('click', (e) => {
  let b = e.target.closest('button');
  if (!b) return;
  let l = sel(),
    d = b.dataset;
  if (d.extra === 'freeMask' && l) {
    maskDrawing = true;
    penPts = [];
    tool('pen');
    notify('在画布上绘制蒙版，双击完成');
  }
  if (d.maskkey != null && l) {
    record();
    let m = l.masks[+d.maskkey],
      { keys, ...data } = m;
    m.keys = (keys || []).filter((q) => q.t !== T);
    m.keys.push({ t: T, ...structuredClone(data) });
    m.keys.sort((a, b) => a.t - b.t);
    changed();
  }
  if (d.togglefx && l) {
    record();
    l.disabledFx ||= [];
    l.disabledFx = l.disabledFx.includes(d.togglefx)
      ? l.disabledFx.filter((a) => a !== d.togglefx)
      : [...l.disabledFx, d.togglefx];
    changed();
  }
  if (d.fxmove != null && l && +d.fxmove > 0) {
    record();
    l.fxOrder ||= [...defaultFx];
    let i = +d.fxmove;
    [l.fxOrder[i], l.fxOrder[i - 1]] = [l.fxOrder[i - 1], l.fxOrder[i]];
    changed();
  }
});
canvas.addEventListener(
  'dblclick',
  (e) => {
    if (!maskDrawing || !sel() || penPts.length < 3) return;
    e.stopImmediatePropagation();
    record();
    let l = sel(),
      o = entries.get(l.id);
    l.masks ||= [];
    l.masks.push({
      shape: '自由路径',
      points: penPts.map((p) =>
        o
          .worldToLocal(V(...p, 0))
          .toArray()
          .slice(0, 2),
      ),
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      feather: 0,
      invert: false,
    });
    penPts = [];
    maskDrawing = false;
    tool('select');
    changed();
  },
  true,
);
const origAction = act;
act = function (a, e) {
  if (a === 'settings') {
    let c = C();
    dialog(
      '合成设置',
      [
        ['name', '名称', c.name],
        ...['w', 'h', 'fps', 'duration', 'start', 'end', 'shutter', 'phase'].map((k, i) => [
          k,
          ['宽度', '高度', '帧率', '时长', '工作区入点', '工作区出点', '快门角度', '快门相位'][i],
          c[k] || 0,
        ]),
        ['mb', '运动模糊', c.mb ? '启用' : '关闭', ['启用', '关闭']],
        ['bg', '背景颜色', c.bg || '#191819', 'color'],
        ['bgAlpha', '背景不透明度', c.bgAlpha ?? 100],
      ],
      (d) => {
        record();
        c.name = d.name;
        c.mb = d.mb === '启用';
        for (let k of ['w', 'h', 'fps', 'duration']) c[k] = Math.max(1, +d[k] || 1);
        c.end = Math.min(c.duration, Math.max(0.001, +d.end));
        c.start = Math.max(0, Math.min(c.end - 0.001, +d.start));
        c.phase = Number(d.phase) || 0;
        c.shutter = Math.max(0, Number(d.shutter) || 0);
        c.bg = d.bg;
        c.bgAlpha = Math.max(0, Math.min(100, +d.bgAlpha));
        seek(Math.min(T, c.end));
        changed();
      },
    );
    return;
  }
  return origAction(a, e);
};
let refreshPost = refresh,
  lastPosterVersion = version,
  posterTimer;
refresh = function () {
  refreshPost();
  if (!exporting && lastPosterVersion !== version) {
    lastPosterVersion = version;
    clearTimeout(posterTimer);
    posterTimer = setTimeout(() => {
      if (exporting || !L().some((l) => l.model === 'glyph')) return;
      let ctx = postThumb.getContext('2d');
      ctx.drawImage(canvas, 0, -15, 340, 175);
      projectPoster = postThumb.toDataURL('image/jpeg', 0.8);
      assetList();
    }, 250);
  }
};
let baseBegin = videoExport.begin.bind(videoExport),
  baseEnd = videoExport.end.bind(videoExport);
videoExport.begin = async function (id, opts) {
  let sample = P.comps.find(
      (c) =>
        c.duration === 15 &&
        c.layers.some((l) => l.model === 'glyph') &&
        c.layers.some((l) => l.model === 'caption'),
    ),
    extra = {
      viewScale,
      angleMode,
      camPan: camPan.clone(),
      spatialEdit,
      pointEdit,
      safeOn,
      gridOn,
      activeTool,
      filter,
      playing,zoom,timelineOrigin,
    };
  if (this.backup && exporting) this.end();
  zoom=1;timelineOrigin=0;viewScale = 1;
  angleMode = 0;
  camPan.set(0, 0, 0);
  pointEdit = spatialEdit = gridOn = safeOn = false;
  activeTool = 'select';
  filter = '';
  let result = await baseBegin(id, opts);
  this.extra = extra;
  if (sample) {
    P = structuredClone(this.backup.p);
    P.active = sample.id;
    S = new Set([L().find((l) => l.model === 'glyph').id]);
    version++;
    drawUI();
    refresh();
    gl.finish();
  }
  return result;
};
videoExport.end = function () {
  if (!exporting) return;
  let s = this.extra || {};
  zoom=s.zoom||1;timelineOrigin=s.timelineOrigin||0;
  viewScale = s.viewScale || 1;
  angleMode = s.angleMode || 0;
  camPan.copy(s.camPan || V());
  spatialEdit = s.spatialEdit;
  pointEdit = s.pointEdit;
  safeOn = s.safeOn;
  gridOn = s.gridOn;
  activeTool = s.activeTool || 'select';
  filter = s.filter || '';
  baseEnd();
  if (s.playing) play();
};
function displayScale() {
  let s = innerWidth >= 2200 ? Math.min(2.25, innerWidth / 1760) : 1;
  document.body.style.setProperty('--uis', s);
}
displayScale();
window.addEventListener('resize', displayScale);
let headerInspector = inspector;
inspector = function () {
  headerInspector();
  let l = sel();
  if (!l || propTab !== '属性') return;
  let end = $('#props .insActions');
  if (l.type === 'geo') {
    let opts = [
      ['glyph', '字形挤出'],
      ['solid', '轮廓实体'],
      ['stage', '锻台'],
      ['hammer', '锻锤'],
      ['air', '炉室环境'],
    ];
    end.insertAdjacentHTML(
      'beforebegin',
      group(
        '生成器',
        'cube',
        '<div class="field"><label>实体类型</label><select data-lprop="model">' +
          opts
            .map(
              ([v, n]) =>
                '<option value="' +
                v +
                '" ' +
                (v === l.model ? 'selected' : '') +
                '>' +
                n +
                '</option>',
            )
            .join('') +
          '</select></div>',
        'GENERATOR',
        false,
      ),
    );
  }
  if (l.model === 'caption') {
    end.insertAdjacentHTML(
      'beforebegin',
      group(
        '画面题签',
        'type',
        [
          ['labelTop', '片头标识'],
          ['labelSub', '副标题'],
          ['labelCode', '编号'],
        ]
          .map(
            ([k, n]) =>
              '<div class="field"><label>' +
              n +
              '</label><input data-lprop="' +
              k +
              '" class="plain" value="' +
              esc(l[k]) +
              '"></div>',
          )
          .join(''),
        'TITLES',
      ),
    );
  }
};
document.addEventListener('dblclick', (e) => {
  let b = e.target.closest('[data-phase]');
  if (!b) return;
  let c = C(),
    m = c.markers.find((m) => m.t === +b.dataset.phase);
  if (!m) return;
  dialog(
    '合成标记',
    [
      ['name', '阶段名称', m.name],
      ['t', '标记时间', m.t],
    ],
    (d) => {
      record();
      m.name = d.name;
      m.t = Math.max(0, Math.min(c.duration, +d.t));
      c.markers.sort((a, b) => a.t - b.t);
      changed();
    },
  );
});
document.addEventListener(
  'click',
  (e) => {
    let b = e.target.closest('[data-extra="nodeParam"]'),
      l = sel();
    if (!b || !l) return;
    let n = l.nodes.find((a) => a.id === selectedNode);
    if (!n || !['向量', '颜色', '空间场'].includes(n.op)) return;
    e.stopImmediatePropagation();
    if (n.op === '颜色') {
      dialog('颜色节点', [['tint', '颜色输出', n.tint || '#faba74', 'color']], (d) => {
        record();
        n.tint = d.tint;
        changed();
      });
      return;
    }
    if (n.op === '空间场') {
      let choices = L().filter((l) => l.type === 'field');
      if (!choices.length) {
        notify('先添加空间场图层，再连接场输入');
        return;
      }
      dialog(
        '场引用',
        [
          [
            'ref',
            '空间场',
            choices.find((o) => o.id === n.ref)?.name || choices[0].name,
            choices.map((l) => l.name),
          ],
        ],
        (d) => {
          record();
          n.ref = choices.find((o) => o.name === d.ref).id;
          changed();
        },
      );
      return;
    }
    dialog(
      '向量节点',
      [
        ['x', 'X 分量', val(l, n.param)],
        ['y', 'Y 分量', val(l, n.param + 'Y')],
        ['animate', '记录关键帧', '否', ['否', '是']],
      ],
      (d) => {
        record();
        for (let [k, v] of [
          [n.param, +d.x],
          [n.param + 'Y', +d.y],
        ]) {
          if (d.animate === '是' && !l.keys[k]?.length) l.keys[k] = [key(T, v)];
          setVal(l, k, v);
        }
        changed();
      },
    );
  },
  true,
);
Object.assign(names, { red: '红色通道', green: '绿色通道', blue: '蓝色通道' });
const colorInspector = inspector;
inspector = function () {
  colorInspector();
  let l = sel();
  if (!l || propTab !== '属性') return;
  let end = $('#props .insActions');
  if (['shape', 'text', 'geo', 'light', 'particle'].includes(l.type))
    end.insertAdjacentHTML(
      'beforebegin',
      group('颜色通道', 'palette', rgbKeys.map((k) => advField(l, k)).join(''), 'RGB', false),
    );
  if (l.type === 'particle')
    end.insertAdjacentHTML(
      'beforebegin',
      group(
        '表面响应',
        'layers',
        '<div class="field"><label>反弹系数</label><input data-lprop="bounce" class="plain" value="' +
          (l.bounce ?? 0.53) +
          '"></div><div class="field"><label>摩擦系数</label><input data-lprop="friction" class="plain" value="' +
          (l.friction ?? 0.23) +
          '"></div>',
        'COLLISION',
        false,
      ),
    );
};
document.addEventListener(
  'change',
  (e) => {
    let l = sel(),
      el = e.target;
    if (el.dataset.lprop === 'color' && l && !l.locked) {
      e.stopImmediatePropagation();
      record();
      let color = el.value;
      for (let [i, k] of rgbKeys.entries()) {
        let v = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
        setVal(l, k, v);
      }
      if (!rgbKeys.some((k) => l.keys[k]?.length)) l.color = color;
      changed();
    }
  },
  true,
);

drawUI();
refresh();
const sequenceInspector = inspector;
inspector = function () {
  sequenceInspector();
  const l = sel();
  if (l?.type !== 'audio' || propTab !== '属性') return;
  const notes = l.notes || [];
  $('#props .insActions').insertAdjacentHTML(
    'beforebegin',
    group(
      '音序器',
      'wave',
      advSelect(l, 'instrument', '音源', ['基础振荡器', '锻炉合奏']) +
        notes
          .map(
            ([t, f, d], i) =>
              '<div class="oprow"><span>' +
              num(t) +
              ' s　' +
              num(f) +
              ' Hz</span><button data-notedit="' +
              i +
              '">编辑</button><button data-notdel="' +
              i +
              '">×</button></div>',
          )
          .join('') +
        smallAct('note', '＋ 插入音符'),
      'SEQUENCER',
    ),
  );
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'),
    l = sel();
  if (!b || l?.type !== 'audio') return;
  const d = b.dataset;
  if (d.notdel != null) {
    record();
    l.notes.splice(+d.notdel, 1);
    changed();
    if (playing) scheduleAudio();
    return;
  }
  if (d.extra === 'note' || d.notedit != null) {
    const i = d.notedit != null ? +d.notedit : l.notes?.length || 0,
      n = l.notes?.[i] || [T, 110, 0.6];
    dialog(
      '音符设置',
      [
        ['t', '起始时间（秒）', n[0]],
        ['f', '频率（Hz）', n[1]],
        ['len', '时值（秒）', n[2]],
      ],
      (v) => {
        record();
        l.notes ||= [];
        l.notes[i] = [
          Math.max(0, Math.min(C().duration, +v.t)),
          Math.max(12, +v.f || 110),
          Math.max(0.04, +v.len || 0.6),
        ];
        l.notes.sort((a, b) => a[0] - b[0]);
        changed();
        if (playing) scheduleAudio();
      },
    );
  }
});
document.addEventListener(
  'pointerdown',
  (e) => {
    const port = e.target.closest('[data-portout]');
    if (!port) return;
    const id = port.dataset.portout,
      area = $('.nodearea'),
      rect = area.getBoundingClientRect(),
      a = port.getBoundingClientRect(),
      start = e.clientX;
    let path = null;
    const move = (ev) => {
      if (!path && Math.abs(ev.clientX - start) < 4) return;
      if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#cde991');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '5 3');
        area.querySelector('svg').append(path);
      }
      let x = a.left + a.width / 2 - rect.left + area.scrollLeft,
        y = a.top + a.height / 2 - rect.top + area.scrollTop,
        xx = ev.clientX - rect.left + area.scrollLeft,
        yy = ev.clientY - rect.top + area.scrollTop;
      path.setAttribute(
        'd',
        'M' +
          x +
          ' ' +
          y +
          'C' +
          (x + 44) +
          ' ' +
          y +
          ' ' +
          (xx - 44) +
          ' ' +
          yy +
          ' ' +
          xx +
          ' ' +
          yy,
      );
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!path) return;
      path.remove();
      const dst = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest('[data-paramin],[data-portin]');
      if (dst) {
        connecting = id;
        dst.click();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  true,
);
document.addEventListener(
  'toggle',
  (e) => {
    const d = e.target;
    if (!d.isConnected || !d.matches('details[data-group]')) return;
    if (d.open) {
      closedGroups.delete(d.dataset.group);
      closedGroups.add('!' + d.dataset.group);
    } else {
      closedGroups.add(d.dataset.group);
      closedGroups.delete('!' + d.dataset.group);
    }
  },
  true,
);
const lightingInspector = inspector;
inspector = function () {
  lightingInspector();
  let l = sel();
  if (l?.type === 'light' && propTab === '属性')
    $('#props .insActions').insertAdjacentHTML(
      'beforebegin',
      group(
        '方向与阴影',
        'sun',
        '<label class="field"><input type="checkbox" data-flag="cast" ' +
          (l.cast !== false ? 'checked' : '') +
          '> 投射阴影</label>' +
          (l.kind === '平行光' ? ['tx', 'ty', 'tz'].map((k) => advField(l, k)).join('') : ''),
        'LIGHTING',
      ),
    );
};
document.addEventListener('wheel',e=>{
  if(!e.target.closest('.timeRuler,.phaseStrips')||exporting)return;
  e.preventDefault();
  const rect=$('.timeRuler').getBoundingClientRect();
  if(e.shiftKey){timelineOrigin=Math.max(0,Math.min(C().duration-spanTime(),windowStart()+Math.sign(e.deltaY||e.deltaX)*spanTime()*.12));timeline()}
  else zoomTimeline(e.deltaY<0?1.24:1/1.24,windowStart()+(e.clientX-rect.left)/rect.width*spanTime());
},{passive:false});
document.addEventListener('pointerdown',e=>{
  const k=e.target.dataset.workedge;if(!k)return;
  e.stopImmediatePropagation();const c=C(),rect=$('.timeRuler').getBoundingClientRect();record();
  drag(e,(dx,dy,ev)=>{let t=snapped(windowStart()+(ev.clientX-rect.left)/rect.width*spanTime());
    c[k]=k==='start'?Math.max(0,Math.min(c.end-1/c.fps,t)):Math.min(c.duration,Math.max(c.start+1/c.fps,t));timeline()},changed)
},true);
const contourInspector=inspector;
inspector=function(){contourInspector();let l=sel();if(!l?.paths?.length||propTab!=='属性')return;
  const options=l.paths.map((r,i)=>'<option value="'+i+'" '+(i===l.activeRing?'selected':'')+'>'+ (r.owner<0?'外轮廓':'孔洞')+' '+(i+1)+' · '+r.points.length+' 个顶点</option>').join('');
  $('#props .insActions').insertAdjacentHTML('beforebegin',group('编辑轮廓','pen','<div class="field"><select class="ringchoice" data-ring>'+options+'</select></div>','CONTOURS'));
};
document.addEventListener('change',e=>{if('ring'in e.target.dataset&&sel()?.paths){selectRing(sel(),+e.target.value);pointEdit=true;drawUI();refresh()}});
const impactInspector=inspector;
inspector=function(){
  impactInspector();const l=sel();
  if(!l||propTab!=='属性')return;
  const end=$('#props .insActions');
  if(l.type==='particle')end.insertAdjacentHTML('beforebegin',group('发射分布','spark','<div class="field"><label>受击区域</label><select data-lprop="impactTarget"><option value="">整个表面</option>'+L().filter(x=>x!==l&&x.id!==l.source&&['geo','shape','null'].includes(x.type)).map(x=>'<option value="'+x.id+'" '+(l.impactTarget===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div>','SURFACE',false));
  if(l.model==='air')end.insertAdjacentHTML('beforebegin',group('炉尘','spark',advField(l,'dustOpacity','炉尘不透明度','%'),'EMBERS'));
  if(l.model==='glyph')end.insertAdjacentHTML('beforebegin',group('书写','pen',advSelect(l,'writeMode','显现方式',['路径修剪','笔画生长']),'STROKES',false));
};
const materialInspector=inspector;inspector=function(){materialInspector();let l=sel();if(!l)return;
if(l.model==='stage'&&propTab==='属性')$('#props .insActions').insertAdjacentHTML('beforebegin',group('工作台表面','cube',advField(l,'reflection','反射强度'),'REFLECTION',false));
if(S.size>1)$('#props .identity').insertAdjacentHTML('afterend','<div class="batchList">'+L().filter(q=>S.has(q.id)).map(q=>'<span>'+esc(q.name)+'</span>').join('')+'</div>');
};
document.addEventListener('change',e=>{if(S.size<=1)return;let k=e.target.dataset.k||e.target.dataset.range;if(!k||!Number.isFinite(Number(e.target.value)))return;const n=Number(e.target.value);e.stopImmediatePropagation();record();for(const l of L())if(S.has(l.id)&&!l.locked)setVal(l,k,n);propKey=k;changed()},true);
const displayStats=refresh;refresh=function(){displayStats();if(tab!=='节点')return;let graph=$('.graphTools'),l=sel(),g=l&&entries.get(l.id)?.children[0]?.geometry;
if(graph&&g?.attributes.position){let tag=graph.querySelector('.statstrip');if(!tag){tag=document.createElement('span');tag.className='statstrip';graph.append(tag)}tag.textContent=Math.round((g.index?.count??g.attributes.position.count)/3).toLocaleString('zh-CN')+' 面'}
};
