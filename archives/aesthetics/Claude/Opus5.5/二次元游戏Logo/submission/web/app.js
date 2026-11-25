/* 展示网页：首页（三枚并排）→ 每枚的展示页；以及 window.videoExport 展示片导出接口。
   所有动画都由一个时间 t 算出（同一个 t 画出同一帧），展示页用真实时间推进，导出模式只由 frame(i) 推进。 */
(function () {
  'use strict';
  const KEYS = ['ef', 'sr', 'ww'];
  const D = window.LOGO_DATA, CC = window.CONCEPTS;

  // ------------------------------------------------------------ 小工具
  function el(tag, attrs, kids) {
    const ns = ['svg', 'path', 'g', 'rect', 'circle', 'line', 'polyline', 'text', 'defs', 'clipPath'].includes(tag) ? 'http://www.w3.org/2000/svg' : null;
    const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === 'class') e.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    if (kids) for (const c of [].concat(kids)) if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return e;
  }
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const easeIO = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  function fade(t, a, b, fi = 0.45, fo = 0.45) {   // a..b 区间里的淡入淡出系数
    return Math.min(seg(t, a, a + fi), 1 - seg(t, b - fo, b));
  }
  function center(box) { return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]; }
  function strokeColor(i, n) {
    const h = (i * 137.508 + 18) % 360;
    return `hsl(${h} 62% 62%)`;
  }
  function decodeAll(imgs) {
    return Promise.all(imgs.map(im => (im.complete && im.naturalWidth) ? (im.decode ? im.decode().catch(() => 0) : 0)
      : new Promise(r => { im.addEventListener('load', () => (im.decode ? im.decode().catch(() => 0) : 0).then(r), { once: true }); im.addEventListener('error', r, { once: true }); })));
  }

  // ------------------------------------------------------------ 逐层入场（同一个函数给展示页和展示片用）
  const ENTRANCE = {
    plate: [0.0, 1.0], bgEn: [0.7, 1.7], main: [1.4, 2.5], strokes: [2.1, 4.5], text: [4.0, 5.0],
    lines: [4.8, 5.9], hi: [5.6, 6.6], end: 6.9
  };
  function buildStage(key, opt = {}) {
    const d = D[key];
    const ar = d.canvas[0] / d.canvas[1];
    const root = el('div', { class: 'stage', style: { '--ar': ar } });
    root.style.setProperty('--ar', ar);
    const layers = d.layers.map(L => {
      const im = el('img', { src: L.file, alt: L.name, draggable: 'false' });
      im.dataset.group = L.group;
      root.appendChild(im);
      return { im, group: L.group, name: L.name };
    });
    // 逐笔描出来的轮廓（描完再换成成品的字层）
    const svg = el('svg', { viewBox: `0 0 ${d.canvas[0]} ${d.canvas[1]}`, preserveAspectRatio: 'none' });
    const sw = d.canvas[0] / 650;
    const strokes = [], fills = [];
    const gFill = el('g'), gLine = el('g');
    svg.appendChild(gFill); svg.appendChild(gLine);
    for (const c of d.chars) for (const s of c.strokes) {
      if (!s.d) continue;
      const f = el('path', { d: s.d, fill: s.tag === 'climax' ? CC[key].theme.accent : CC[key].theme.face, opacity: 0 });
      const p = el('path', { d: s.d, fill: 'none', stroke: CC[key].theme.accent, 'stroke-width': sw, 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 });
      gFill.appendChild(f); gLine.appendChild(p);
      strokes.push(p); fills.push(f);
    }
    const fill = gFill;
    root.appendChild(svg);
    const el_box = (d.motif.find(m => m.kind === 'element') || {}).box || [0.4, 0.4, 0.6, 0.6];
    const ec = center(el_box);
    const st = { root, layers, svg, strokes, fill, ar, key };
    st.set = function (t) {
      const E = ENTRANCE;
      const n = strokes.length;
      const per = 0.55, span = (E.strokes[1] - E.strokes[0]) - per;
      for (const L of layers) {
        const s = L.im.style;
        if (L.group === 'plate') {
          const p = ease(seg(t, ...E.plate));
          s.opacity = clamp(p * 1.4);
          s.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
          s.transform = `scale(${(0.985 + 0.015 * p).toFixed(4)})`;
        } else if (L.group === 'bgEn') {
          const p = ease(seg(t, ...E.bgEn));
          s.opacity = p;
          s.transform = `translateY(${((1 - p) * 2.2).toFixed(3)}%)`;
        } else if (L.group === 'main') {
          const p = ease(seg(t, ...E.main));
          s.opacity = p;
          s.transformOrigin = `${(ec[0] * 100).toFixed(2)}% ${(ec[1] * 100).toFixed(2)}%`;
          s.transform = `scale(${(0.9 + 0.1 * p).toFixed(4)})`;
        } else if (L.group === 'text') {
          const p = easeIO(seg(t, ...E.text));
          s.opacity = p;
          s.transform = '';
        } else if (L.group === 'lines') {
          const p = ease(seg(t, ...E.lines));
          s.opacity = clamp(p * 1.3);
          s.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
        } else if (L.group === 'hi') {
          const p = seg(t, ...E.hi);
          s.opacity = p < 0.5 ? p * 2 : 1;
          s.filter = p > 0 && p < 1 ? `brightness(${(1 + 0.6 * Math.sin(p * Math.PI)).toFixed(3)})` : '';
        }
      }
      strokes.forEach((p, i) => {
        const a = E.strokes[0] + (n > 1 ? span * i / (n - 1) : 0);
        p.setAttribute('stroke-dashoffset', (1 - easeIO(seg(t, a, a + per))).toFixed(4));
        fills[i].setAttribute('opacity', (0.9 * easeIO(seg(t, a + per * 0.55, a + per + 0.3))).toFixed(3));
      });
      const fo = seg(t, E.text[0] + 0.3, E.text[1] + 0.2);
      svg.style.opacity = (1 - fo).toFixed(3);
      svg.style.display = (t < E.strokes[0] - 0.01 || fo >= 1) ? 'none' : '';
    };
    st.set(opt.t != null ? opt.t : 99);
    return st;
  }

  // ------------------------------------------------------------ 方言示意：底字与方言并排（字体单位、y 朝下）
  function glyphSVG(ch, mode, key, opts = {}) {
    const svg = el('svg', { viewBox: '-80 -70 1160 1160' });
    svg.appendChild(el('rect', { x: 0, y: 0, width: 1000, height: 1000, fill: 'none', stroke: 'rgba(255,255,255,.14)', 'stroke-dasharray': '6 8', 'stroke-width': 2 }));
    svg.appendChild(el('line', { x1: -60, y1: 880, x2: 1060, y2: 880, stroke: 'rgba(255,255,255,.10)', 'stroke-width': 2 }));
    const n = ch.strokes.length;
    if (mode === 'base') svg.appendChild(el('path', { d: ch.src, fill: 'rgba(255,255,255,.10)' }));
    ch.strokes.forEach((s, i) => {
      const col = s.tag === 'climax' ? CC[key].theme.accent : strokeColor(i, n);
      const d = mode === 'base' ? s.base : s.new;
      if (d) svg.appendChild(el('path', { d, fill: col, opacity: mode === 'base' ? 0.62 : 0.9 }));
    });
    if (opts.axes !== false) {
      ch.strokes.forEach((s, i) => {
        const ax = mode === 'base' ? s.axb : s.axn;
        if (!ax || ax.length < 2) return;
        svg.appendChild(el('polyline', { points: ax.map(p => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(10,10,12,.85)', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        svg.appendChild(el('polyline', { points: ax.map(p => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(255,255,255,.9)', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }));
        svg.appendChild(el('circle', { cx: ax[0][0], cy: ax[0][1], r: 9, fill: '#fff' }));
      });
    }
    return svg;
  }
  function dialectNotes(key, ch) {
    const notes = {
      ef: { '终': '纟 重新排开：240° 的撇 + 水平的折；冬 的横撇折成 0°/270°/240°/210° 四段', '末': '竖 = 桁架塔身（高潮）；横担在两侧让开拼缝；撇捺 = 先 60° 后 30° 的两折塔腿', '地': '提 取 30°；也 的横折钩上扬 30°；两根竖各开一小段桁架孔（呼应）',
        '明': '日 的两横两头留缝（模版桥）', '日': '横浮在两竖之间：T 字接头的拼缝', '方': '撇 = 竖 + 60° + 30° 三折', '舟': '两点 = 平行四边形的点' },
      sr: { '星': '发丝横 × 粗竖：横竖比 1:5；撇收尖带刻槽', '穹': '三个点换成四角星；八 的右点按捺的笔法', '铁': '捺上三道轨枕刻口（呼应）', '道': '平捺 → 铁轨（高潮，在组合里驶出字外）；两点换星',
        '崩': '月 的粗竖刻槽、发丝横', '坏': '点换四角星；提取直' },
      ww: { '鸣': '急起—长身—余音：每笔一个钟鸣包络；鸟 的点弯成声波弧（呼应）', '潮': '氵 → 三段声波弧（高潮）；最长的竖向下多垂一截（悬针）' }
    };
    return (notes[key] || {})[ch] || '';
  }

  // ------------------------------------------------------------ 母题落点的标注层
  const KIND_COL = { climax: null, echo: '#ffffff', element: '#9fd2ff', line: '#c7c2b8', dot: '#f7d38b', en: '#c7c2b8' };
  function motifSVG(key, withNums = true) {
    const d = D[key];
    const [W, H] = d.canvas;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
    const acc = CC[key].theme.accent;
    const sw = W / 520;
    const items = d.motif.filter(m => m.kind !== 'dot').concat(d.motif.filter(m => m.kind === 'dot').slice(0, 2));
    items.forEach((m, i) => {
      const [x0, y0, x1, y1] = m.box;
      const col = m.kind === 'climax' ? acc : KIND_COL[m.kind] || '#fff';
      const pad = W * 0.006;
      svg.appendChild(el('rect', { x: x0 * W - pad, y: y0 * H - pad, width: (x1 - x0) * W + 2 * pad, height: (y1 - y0) * H + 2 * pad,
        fill: m.kind === 'climax' ? hexA(acc, 0.08) : 'none', stroke: col, 'stroke-width': m.kind === 'climax' ? sw * 1.6 : sw,
        'stroke-dasharray': m.kind === 'climax' ? 'none' : `${sw * 5} ${sw * 4}`, rx: sw * 2 }));
      if (withNums) {
        const cx = x0 * W - pad, cy = y0 * H - pad;
        svg.appendChild(el('circle', { cx, cy, r: W * 0.0125, fill: col }));
        svg.appendChild(el('text', { x: cx, y: cy + W * 0.0046, 'text-anchor': 'middle', 'font-size': W * 0.0135, 'font-family': 'Bahnschrift, sans-serif', 'font-weight': 700, fill: '#111', text: String(i + 1) }));
      }
    });
    return { svg, items };
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }
  function motifColor(key, m) { return m.kind === 'climax' ? CC[key].theme.accent : KIND_COL[m.kind] || '#fff'; }

  // ------------------------------------------------------------ 首页
  function buildHome() {
    const home = document.getElementById('home');
    home.innerHTML = '';
    const bg = el('canvas', { class: 'home-bg' });
    home.appendChild(bg);
    const wrap = el('div', { class: 'wrap' });
    wrap.appendChild(el('div', { class: 'home-head' }, [
      el('div', null, [
        el('div', { class: 'kicker', text: 'Type & Logo Redesign · 艺术字与 Logo 设计' }),
        el('h1', { html: '终末地　星穹铁道　鸣潮<small>三款二次元游戏，三套从世界观推出来的字形方言——中文是主体，英文是辅助。</small>' })
      ]),
      el('div', { class: 'meta', html: '每一枚：一个具体的物件、一种同源的媒介、一套全组执行的笔画规则；一处同构的高潮，加上同类笔画上的呼应。<br>点开任意一枚，看它的入场动画与设计拆解。' })
    ]));
    const cards = el('div', { class: 'cards' });
    KEYS.forEach((k, i) => {
      const c = CC[k];
      const cv = el('canvas');
      const card = el('a', { class: 'card', href: '#' + k, style: { '--caccent': c.theme.accent, '--cglow': c.theme.glow } }, [
        el('div', { class: 'shot' }, [cv, el('img', { src: `web/${k}/final_small.png`, alt: c.game })]),
        el('div', { class: 'info' }, [
          el('div', { class: 'num', text: `0${i + 1} / 03` }),
          el('h2', { html: `${c.game}<em>${c.en}</em>` }),
          el('p', { text: c.oneLine }),
          el('div', { class: 'chips' }, c.words.map(w => el('span', { class: 'chip', text: w }))),
          el('div', { class: 'go', text: '进入展示页 →' })
        ])
      ]);
      cards.appendChild(card);
      card._cv = cv; card._k = k;
    });
    wrap.appendChild(cards);
    wrap.appendChild(el('div', { class: 'home-foot' }, [
      el('span', { text: '成品、黑白稿与分层 PNG 在 logos\\ 下；三张概念单写在 README.md。' }),
      el('span', { text: 'PC · 1920×1080 起' })
    ]));
    home.appendChild(wrap);
    function paint() {
      const r = home.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      bg.width = Math.round(window.innerWidth * dpr); bg.height = Math.round(Math.max(r.height, window.innerHeight) * dpr);
      BG.draw('home', bg.getContext('2d'), bg.width, bg.height, 0);
      cards.querySelectorAll('.card').forEach(cd => {
        const s = cd._cv.getBoundingClientRect();
        cd._cv.width = Math.round(s.width * dpr); cd._cv.height = Math.round(s.height * dpr);
        BG.draw(cd._k, cd._cv.getContext('2d'), cd._cv.width, cd._cv.height, 3.0);
      });
    }
    home._paint = paint;
  }

  // ------------------------------------------------------------ 展示页
  let show = null;
  function buildShow(key) {
    const c = CC[key], d = D[key];
    const root = document.getElementById('show');
    root.innerHTML = '';
    root.style.setProperty('--accent', c.theme.accent);
    root.style.setProperty('--theme-bg', c.theme.bg);
    root.style.background = c.theme.bg;
    const idx = KEYS.indexOf(key);
    const replay = el('button', { text: '重播入场', onclick: () => { show.t0 = performance.now(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    root.appendChild(el('div', { class: 'topbar' }, [
      el('a', { class: 'back', href: '#', html: '← 三枚 Logo' }),
      el('span', { class: 'title', text: c.game }),
      el('span', { class: 'spacer' }),
      el('nav', null, KEYS.map(k => el('a', { href: '#' + k, class: k === key ? 'on' : '', text: CC[k].main }))),
      replay
    ]));
    // 成品 + 入场
    const hero = el('section', { class: 'hero' });
    const cv = el('canvas', { class: 'bg' });
    const stage = buildStage(key, { t: 0 });
    const sw = el('div', { class: 'stage-wrap', style: { '--ar': stage.ar } }, [stage.root]);
    sw.style.setProperty('--ar', stage.ar);
    hero.appendChild(cv); hero.appendChild(sw);
    hero.appendChild(el('div', { class: 'caption' }, [el('span', { class: 'g', text: c.game }), el('span', { class: 'e', text: c.en })]));
    hero.appendChild(el('div', { class: 'cue', html: '设计拆解<i></i>' }));
    root.appendChild(hero);

    // 01 概念单
    const s1 = section('01', '概念单', '先把主题压成：一个物件、三个气质词、一种材质或光；后面每一处改动都从这里取。');
    const left = el('div', null, [
      el('p', { class: 'one', text: c.oneLine }),
      el('div', { class: 'words' }, c.words.map(w => el('span', { text: w }))),
      el('dl', { class: 'kv' }, [
        el('dt', { text: '具体物件' }), el('dd', { text: c.object }),
        el('dt', { text: '动作' }), el('dd', { text: c.action }),
        el('dt', { text: '材质 · 光' }), el('dd', { text: c.material }),
        el('dt', { text: '同源媒介' }), el('dd', { text: c.medium }),
        el('dt', { text: '骨架' }), el('dd', { text: c.skeleton })
      ]),
      el('div', { class: 'block' }, [el('h4', { text: '母题落点' }),
        el('div', { class: 'motif-box', html: `<b>高潮</b>${c.motif.climax}` }),
        el('div', { class: 'motif-box', html: `<b>呼应</b>${c.motif.echo}` }),
        el('div', { class: 'motif-box', html: `<b>为什么</b>${c.motif.why}` })]),
      el('div', { class: 'block' }, [el('h4', { text: '主体元素' }), el('p', { style: { margin: 0, color: '#e4e0d6' }, text: c.element })])
    ]);
    const right = el('div', null, [
      el('div', { class: 'block', style: { marginTop: 0 } }, [el('h4', { text: '方言（全组共用的笔画规则）' }),
        el('table', { class: 'table' }, c.dialect.map(r => el('tr', null, [el('td', { text: r[0] }), el('td', { text: r[1] })])))]),
      el('div', { class: 'block' }, [el('h4', { text: '英文的用法' }), el('ul', null, c.english.map(x => el('li', { text: x })))]),
      el('div', { class: 'block' }, [el('h4', { text: '颜色角色' }), el('div', { class: 'swatches' }, c.colors.map(r =>
        el('div', { class: 'sw' }, [el('div', { class: 'c', style: { background: r[1] } }), el('div', { class: 't', html: `<b>${r[0]}</b><code>${r[1]}</code><br>${r[2]}` })])))]),
      el('div', { class: 'block' }, [el('h4', { text: '自己构思的设计' }), el('ul', null, c.own.map(x => el('li', { text: x })))])
    ]);
    s1.body.appendChild(el('div', { class: 'concept' }, [left, right]));
    root.appendChild(s1.sec);

    // 02 方言示意
    const s2 = section('02', '方言示意', '左：底字的笔画（按笔顺切开，白线是标注的中线）；右：同一笔按方言重画（白线是吸附后的中线）。同一笔两边同色，高潮用点缀色。');
    const mains = d.chars.filter(x => x.role === 'main'), series = d.chars.filter(x => x.role === 'series');
    const grid = el('div', { class: 'dialect-grid', style: { '--cols': Math.min(mains.length, 3) } });
    grid.style.setProperty('--cols', Math.min(mains.length, mains.length === 4 ? 2 : 3));
    mains.forEach(ch => grid.appendChild(dcard(key, ch)));
    s2.body.appendChild(grid);
    if (series.length) {
      s2.body.appendChild(el('div', { class: 'block' }, [el('h4', { text: `系列名「${c.series}」：同一套方言，缩小使用` })]));
      const sr_ = el('div', { class: 'series-row' });
      sr_.style.setProperty('--scols', Math.max(series.length, 2) * 1);
      series.forEach(ch => sr_.appendChild(dcard(key, ch, true)));
      s2.body.appendChild(sr_);
    }
    s2.body.appendChild(el('div', { class: 'rules' }, c.dialect.slice(1).map(r => el('div', { class: 'rule' }, [el('b', { text: r[0] }), r[1]]))));
    root.appendChild(s2.sec);

    // 03 母题落点
    const s3 = section('03', '母题落点', '一处完整的同构置换作为高潮；同类笔画带上弱化的特征作为呼应；母题放不进笔画的地方，交给主体元素和细线。');
    const ms = motifSVG(key);
    const mstage = el('div', { class: 'motif-stage' }, [el('div', { class: 'inner' }, [el('img', { src: `web/${key}/final.png`, alt: '' }), ms.svg])]);
    const legend = el('div', { class: 'legend' }, ms.items.map((m, i) => el('div', { class: 'it' }, [
      el('i', { style: { background: motifColor(key, m) }, text: String(i + 1) }),
      el('div', { html: `${m.label}${m.note ? `<small>${m.note}</small>` : ''}` })])));
    s3.body.appendChild(el('div', { class: 'motif-wrap' }, [mstage, legend]));
    root.appendChild(s3.sec);

    // 04 黑白稿
    const s4 = section('04', '黑白稿', '先黑白、后颜色：每一层平涂一档灰，形和明暗在黑白下已经成立。');
    s4.body.appendChild(el('div', { class: 'mono-wrap' }, [
      el('figure', { class: 'white' }, [el('img', { src: `web/${key}/mono.png`, alt: '黑白稿' }), el('figcaption', { text: '黑白稿 · logos/' + dirName(key) + '/mono.png', style: { background: '#111' } })]),
      el('figure', null, [el('img', { src: `web/${key}/final.png`, alt: '成品', style: { background: '#1a1a1a' } }), el('figcaption', { text: '上色以后 · final.png（透明底）' })])
    ]));
    root.appendChild(s4.sec);

    // 05 分层展开
    const s5 = section('05', '分层展开', '所有层共用一张画布、一套坐标；z 序从底到顶。拖动滑杆把层拉开或合上。');
    const ex = explodeView(key, false);
    s5.body.appendChild(ex.root);
    const rng_ = el('input', { type: 'range', min: 0, max: 100, value: 100 });
    rng_.addEventListener('input', () => ex.set(rng_.value / 100));
    s5.body.appendChild(el('div', { class: 'explode-ctl' }, [el('span', { text: '合上' }), rng_, el('span', { text: '展开' })]));
    root.appendChild(s5.sec);

    // 06 检查格
    const s6 = section('06', '检查格', '去色、缩到高 64 像素、白底、黑底，以及拿掉主体元素和细线以后只留字。');
    s6.body.appendChild(checkGrid(key, false));
    root.appendChild(s6.sec);
    root.appendChild(el('div', { class: 'foot' }, [
      el('span', { text: `${c.game} · ${c.en}` }),
      el('a', { href: '#' + KEYS[(idx + 1) % 3], text: `下一枚：${CC[KEYS[(idx + 1) % 3]].game} →` })
    ]));

    const S = { key, cv, stage, ex, t0: Infinity, raf: 0 };
    // 层图解码完再开始入场（否则第一秒可能在空白上播放）
    decodeAll(stage.layers.map(L => L.im)).then(() => { if (S.t0 === Infinity) S.t0 = performance.now() + 250; });
    function loop(now) {
      const t = S.t0 === Infinity ? -1 : (now - S.t0) / 1000;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      if (window.scrollY < window.innerHeight * 1.1) BG.draw(key, cv.getContext('2d'), w, h, (now - S.tb) / 1000);
      stage.set(t);
      S.raf = requestAnimationFrame(loop);
    }
    S.tb = performance.now();
    S.raf = requestAnimationFrame(loop);
    // 进入视野时展开
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { animateExplode(ex, rng_); io.disconnect(); } }), { threshold: 0.35 });
    io.observe(ex.root);
    ex.set(0);
    return S;
  }
  function animateExplode(ex, input) {
    const t0 = performance.now();
    (function step(now) {
      const p = easeIO((now - t0) / 1600);
      ex.set(p); input.value = Math.round(p * 100);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function dirName(k) { return { ef: '终末地', sr: '星穹铁道', ww: '鸣潮' }[k]; }
  function section(n, title, desc) {
    const body = el('div');
    const sec = el('section', { class: 'sec' }, [el('div', { class: 'sec-h' }, [el('span', { class: 'n', text: n }), el('h3', { text: title }), el('span', { class: 'd', text: desc })]), body]);
    return { sec, body };
  }
  function dcard(key, ch, small) {
    const note = dialectNotes(key, ch.ch);
    const climax = ch.strokes.some(s => s.tag === 'climax'), echo = ch.strokes.some(s => s.tag === 'echo');
    return el('div', { class: 'dcard' }, [
      el('div', { class: 'lab', html: `<span>底字</span><b>${ch.ch}</b><span>方言</span>` }),
      el('div', { class: 'pair' }, [el('div', null, [glyphSVG(ch, 'base', key)]), el('div', null, [glyphSVG(ch, 'new', key)])]),
      small ? null : el('div', { class: 'notes', html: (climax ? '<span class="hl">高潮 · </span>' : echo ? '<span class="hl">呼应 · </span>' : '') + note })
    ]);
  }
  function explodeView(key, film) {
    const d = D[key];
    const root = el('div', { class: film ? 'explodeF' : 'explode' });
    const stack = el('div', { class: 'stack' });
    root.appendChild(stack);
    const sheets = d.layers.map((L, i) => {
      const sh = el('div', { class: 'sheet' }, [el('div', { class: 'frame' }), el('img', { src: L.file, alt: L.name }),
        el('div', { class: 'tag', html: `<b>z${String(i + 1).padStart(2, '0')}</b>${L.name.replace(/_/g, ' · ')}` })]);
      stack.appendChild(sh);
      return sh;
    });
    const ar = d.canvas[0] / d.canvas[1];
    function set(p) {
      const n = sheets.length;
      const W = film ? (root.clientWidth || window.innerWidth) : root.clientWidth;
      const Hc = film ? (root.clientHeight || window.innerHeight) : root.clientHeight;
      // 宽按容器的宽和高一起限：层数越多、画布越扁，拉开后越占高度
      const w = Math.min(W * (film ? 0.44 : 0.46), Hc * (film ? 0.62 : 0.66) * ar / (1 + 0.04 * n));
      stack.style.width = w + 'px';
      stack.style.marginLeft = (-w / 2 - W * 0.07) + 'px';
      stack.style.marginTop = (-(w / ar) / 2) + 'px';
      stack.style.transform = `rotateX(${(50 * p).toFixed(2)}deg) rotateZ(${(-22 * p).toFixed(2)}deg)`;
      const gap = Math.min(0.11 * w, Hc * 0.75 / n) * p;
      sheets.forEach((sh, i) => {
        sh.style.transform = `translateZ(${((i - (n - 1) / 2) * gap).toFixed(1)}px)`;
        sh.querySelector('.frame').style.opacity = (0.15 + 0.85 * p).toFixed(3);
        const tag = sh.querySelector('.tag');
        tag.style.opacity = clamp(p * 1.6 - 0.3).toFixed(3);
        tag.style.transform = `rotateZ(${(22 * p).toFixed(2)}deg) rotateX(${(-50 * p).toFixed(2)}deg)`;
      });
    }
    return { root, set, sheets };
  }
  function checkGrid(key, film) {
    const c = CC[key];
    const fin = `web/${key}/final.png`;
    const cell = (cap, sub, pic, bg) => el('div', { class: film ? 'ckc' : 'ck' }, [
      el('div', { class: 'pic', style: { background: bg } }, [pic]),
      el('div', { class: 'cap', html: film ? `${cap}` : `${cap}<span>${sub}</span>` })]);
    const img = (src, style) => el('img', { class: 'full', src, style });
    const tiny = el('div', { class: 'tiny' }, [
      el('div', { style: { background: '#ececec' } }, [el('img', { src: fin })]),
      el('div', { style: { background: '#181818' } }, [el('img', { src: fin })])
    ]);
    return el('div', { class: film ? 'grid' : 'checks' }, [
      cell('去色', '按亮度去掉颜色', img(fin, { filter: 'grayscale(1)' }), '#7d7d7d'),
      cell('高 64 像素', '整枚缩小，主字仍认得出', tiny, '#333'),
      cell('白底', '放在纯白上', img(fin), '#ffffff'),
      cell('黑底', '放在纯黑上', img(fin), '#000000'),
      cell('只留字', '拿掉底板、主体元素、英文与细线', img(`web/${key}/text_only.png`), '#8a8a8a'),
      cell('主题背景', '为它设计的背景', img(fin), c.theme.bg)
    ]);
  }

  // ------------------------------------------------------------ 路由
  function route() {
    const k = location.hash.replace('#', '');
    if (show) { cancelAnimationFrame(show.raf); show = null; }
    const home = document.getElementById('home'), sv = document.getElementById('show');
    if (KEYS.includes(k)) {
      home.classList.remove('on'); sv.classList.add('on');
      window.scrollTo(0, 0);
      show = buildShow(k);
      document.title = `${CC[k].game} · Logo 重设计`;
    } else {
      sv.classList.remove('on'); home.classList.add('on');
      sv.innerHTML = '';
      document.title = '三枚二次元游戏 Logo · 重设计';
      requestAnimationFrame(() => home._paint && home._paint());
    }
  }

  // ------------------------------------------------------------ 展示片（导出模式）
  const SEG = 30.0, TOTAL = 90.0;
  const STEPS = [
    ['入场', 0.8, 9.3], ['概念单', 9.3, 12.7], ['方言', 12.7, 16.6], ['母题落点', 16.6, 19.8],
    ['黑白稿', 19.8, 22.0], ['分层展开', 22.0, 25.2], ['检查格', 25.2, 27.6], ['成品', 27.6, 30.0]
  ];
  let film = null;
  function buildFilm() {
    const root = document.getElementById('film');
    root.innerHTML = '';
    const cv = el('canvas', { class: 'bg' });
    root.appendChild(cv);
    const segs = {};
    for (const key of KEYS) {
      const c = CC[key], d = D[key];
      const sg = el('div', { class: 'seg' });
      sg.style.setProperty('--faccent', c.theme.accent);
      const stage = buildStage(key, { t: 0 });
      const fst = el('div', { class: 'fstage' }, [stage.root]);
      // 黑白稿层与标注层叠在舞台上
      const monoImg = el('img', { src: `web/${key}/mono.png`, alt: '', style: { opacity: 0, background: '#fff' } });
      stage.root.appendChild(monoImg);
      const ms = motifSVG(key);
      ms.svg.style.opacity = 0;
      stage.root.appendChild(ms.svg);
      sg.appendChild(fst);
      // 母题图例：放在右侧（和概念单同一个位置）
      const mp = el('div', { class: 'panel cpanel' }, [
        el('div', { class: 'fkick', style: { fontSize: '1.5vh', color: c.theme.accent, marginBottom: '1.6vh' }, text: 'MOTIF · 母题落点' })]);
      const labs = ms.items.map((m, i) => {
        const it = el('div', { style: { display: 'grid', gridTemplateColumns: '3.6vh 1fr', gap: '1.2vh', alignItems: 'start', fontSize: '1.85vh', lineHeight: '1.45', margin: '0 0 1.3vh', opacity: 0 } }, [
          el('span', { style: { width: '3vh', height: '3vh', borderRadius: '50%', background: motifColor(key, m), color: '#111', display: 'grid', placeItems: 'center', fontFamily: 'Bahnschrift,sans-serif', fontWeight: 700, fontSize: '1.6vh' }, text: String(i + 1) }),
          el('div', { html: `${m.label}${m.note ? `<div style="color:rgba(242,239,232,.62);font-size:1.5vh">${m.note}</div>` : ''}` })]);
        mp.appendChild(it);
        return it;
      });
      sg.appendChild(mp);
      // 概念单
      const cp = el('div', { class: 'panel cpanel' }, [
        el('div', { class: 'fkick', style: { fontSize: '1.5vh', color: c.theme.accent }, text: 'CONCEPT · 概念单' }),
        el('div', { class: 'one', text: c.oneLine }),
        el('div', { class: 'fw' }, c.words.map(w => el('span', { text: w }))),
        el('dl', { class: 'rowk' }, [
          el('dt', { text: '物件' }), el('dd', { text: c.object }),
          el('dt', { text: '材质' }), el('dd', { text: c.material }),
          el('dt', { text: '媒介' }), el('dd', { text: c.medium }),
          el('dt', { text: '主体' }), el('dd', { text: c.element.split('：')[0] + '：' + (c.element.split('：')[1] || '').split('；')[0] })
        ])
      ]);
      sg.appendChild(cp);
      // 方言
      const mains = d.chars.filter(x => x.role === 'main');
      const pick = key === 'sr' ? [mains[1], mains[3]] : key === 'ef' ? [mains[0], mains[1], mains[2]] : mains;
      const dp = el('div', { class: 'panel dpanel' }, [
        el('div', { class: 'fkick', style: { fontSize: '1.5vh', color: c.theme.accent, marginBottom: '1.4vh' }, text: 'DIALECT · 底字 → 方言' }),
        el('div', { class: 'drow', style: { '--n': pick.length } }, pick.map(ch => el('div', { class: 'dc' }, [
          el('div', { class: 'lab', html: `<span>底字</span><b style="color:#fff;font-family:var(--cn-serif);font-size:2.2vh">${ch.ch}</b><span>方言</span>` }),
          el('div', { class: 'pair' }, [glyphSVG(ch, 'base', key), glyphSVG(ch, 'new', key)])]))),
        el('div', { class: 'rl' }, c.dialect.slice(1, 5).map(r => el('div', null, [el('b', { text: r[0] }), r[1]])))
      ]);
      dp.querySelector('.drow').style.setProperty('--n', pick.length);
      sg.appendChild(dp);
      // 分层
      const ex = explodeView(key, true);
      ex.root.style.opacity = 0;
      sg.appendChild(ex.root);
      // 检查
      const xp = el('div', { class: 'panel xpanel' }, [
        el('div', { class: 'fkick', style: { fontSize: '1.5vh', color: c.theme.accent, marginBottom: '1.4vh' }, text: 'CHECK · 去色 / 64px / 白底 / 黑底 / 只留字' }),
        checkGrid(key, true)]);
      sg.appendChild(xp);
      // 底栏
      const stepLab = el('span', { class: 'step' });
      const bar = el('div', { class: 'fbar' }, [el('span', { class: 'gname', html: `${c.game}<span style="font-family:Bahnschrift,sans-serif;font-weight:400;font-size:1.5vh;letter-spacing:.3em;margin-left:1.6vh;color:rgba(255,255,255,.6)">${c.en.toUpperCase()}</span>` }), stepLab]);
      sg.appendChild(bar);
      const prog = el('div', { class: 'fprog' });
      sg.appendChild(prog);
      root.appendChild(sg);
      segs[key] = { sg, stage, fst, monoImg, ms, labs, mp, cp, dp, ex, xp, stepLab, prog };
    }
    // 片头标题卡（叠在第一段开头）
    const cover = el('div', { class: 'panel', style: { left: '0', top: '0', right: '0', bottom: '0', display: 'grid', placeItems: 'center', textAlign: 'center' } }, [
      el('div', null, [el('div', { class: 'fkick', style: { fontSize: '1.6vh', color: 'rgba(255,255,255,.6)' }, text: 'TYPE & LOGO REDESIGN' }),
        el('div', { class: 'ftitle', style: { fontSize: '6.2vh', marginTop: '1.6vh' }, text: '终末地　星穹铁道　鸣潮' }),
        el('div', { style: { fontSize: '2vh', marginTop: '1.2vh', color: 'rgba(255,255,255,.7)', letterSpacing: '.2em' }, text: '三枚二次元游戏 Logo · 重新设计' })])
    ]);
    root.appendChild(cover);
    return { root, cv, segs, cover };
  }

  function renderFilm(T) {
    const F = film;
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = 1;
    if (F.cv.width !== W * dpr || F.cv.height !== H * dpr) { F.cv.width = W * dpr; F.cv.height = H * dpr; }
    const si = Math.min(2, Math.floor(T / SEG));
    const key = KEYS[si];
    const t = T - si * SEG;
    const ctx = F.cv.getContext('2d');
    BG.draw(key, ctx, F.cv.width, F.cv.height, T);
    // 段落之间过黑
    const black = Math.max(1 - seg(t, 0, 0.8), si < 2 ? seg(t, SEG - 0.5, SEG) : 0);
    ctx.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
    ctx.fillRect(0, 0, F.cv.width, F.cv.height);
    // 片头：第一段的前 2.4 秒
    const cov = si === 0 ? fade(T, -1, 2.4, 0.01, 0.6) : 0;
    F.cover.style.opacity = cov.toFixed(3);
    for (const k of KEYS) {
      const S = F.segs[k];
      S.sg.style.opacity = k === key ? (1 - black).toFixed(3) : 0;
      S.sg.style.visibility = k === key ? 'visible' : 'hidden';
    }
    const S = F.segs[key];
    const d = D[key];
    const ar = d.canvas[0] / d.canvas[1];
    // ---- 舞台：入场居中 → 概念单移到左侧缩小 → 方言时隐去 → 母题时在左侧回来 → 黑白稿回到中间 → 分层/检查隐去 → 成品
    const fullW = Math.min(W * 0.8, H * 0.6 * ar);
    const L = easeIO(seg(t, 9.1, 9.8)) * (1 - easeIO(seg(t, 19.6, 20.3)));     // 0 = 居中大，1 = 左侧小
    const V = Math.min(
      1 - seg(t, 12.5, 12.9) + seg(t, 16.3, 16.7),
      1 - seg(t, 21.8, 22.2) + seg(t, 27.2, 27.7));
    const wStage = fullW * (1 - 0.42 * L);
    const cx = W / 2 - W * 0.22 * L, cy = H * 0.48;
    S.fst.style.width = wStage + 'px';
    S.fst.style.transform = `translate(${(cx - wStage / 2).toFixed(1)}px, ${(cy - wStage / ar / 2).toFixed(1)}px)`;
    S.fst.style.left = '0'; S.fst.style.top = '0';
    S.fst.style.opacity = clamp(V).toFixed(3);
    S.fst.style.visibility = V > 0.001 ? 'visible' : 'hidden';
    const delay = si === 0 ? 1.4 : 0;                     // 第一段让片头标题先走
    S.stage.set(Math.max(0, t - 0.8 - delay));
    // 母题标注 + 右侧图例
    const pm = fade(t, 16.6, 19.8, 0.5, 0.45);
    S.ms.svg.style.opacity = pm.toFixed(3);
    S.mp.style.opacity = pm.toFixed(3);
    S.mp.style.transform = `translate(${(1 - ease(seg(t, 16.6, 17.3))) * 4}vh, -50%)`;
    S.labs.forEach((lb, i) => { lb.style.opacity = clamp((t - 16.9 - i * 0.2) / 0.35).toFixed(3); });
    // 黑白稿
    const pmono = fade(t, 19.8, 22.0, 0.4, 0.4);
    S.monoImg.style.opacity = pmono.toFixed(3);
    // 面板
    S.cp.style.opacity = fade(t, 9.5, 12.6, 0.5, 0.4).toFixed(3);
    S.cp.style.transform = `translate(${(1 - ease(seg(t, 9.5, 10.2))) * 4}vh, -50%)`;
    S.dp.style.opacity = fade(t, 12.8, 16.5, 0.5, 0.45).toFixed(3);
    const pex = fade(t, 22.0, 25.2, 0.4, 0.4);
    S.ex.root.style.opacity = pex.toFixed(3);
    S.ex.set(easeIO(seg(t, 22.2, 23.6)));
    S.xp.style.opacity = fade(t, 25.2, 27.6, 0.4, 0.4).toFixed(3);
    // 底栏：当前步骤
    const step = STEPS.findIndex(s => t >= s[1] && t < s[2]);
    S.stepLab.textContent = step >= 0 ? `${String(step + 1).padStart(2, '0')} / 08　${STEPS[step][0]}` : '';
    S.prog.style.width = (clamp(t / SEG) * 100).toFixed(2) + '%';
    const barOp = seg(t, 1.0, 1.8) * (1 - seg(t, SEG - 0.6, SEG));
    S.sg.querySelector('.fbar').style.opacity = (si === 0 ? Math.min(barOp, 1 - cov) : barOp).toFixed(3);
  }

  function nextPaint() {
    return new Promise(res => {
      let done = false;
      const fin = () => { if (!done) { done = true; res(); } };
      requestAnimationFrame(() => requestAnimationFrame(fin));
      setTimeout(fin, 120);
    });
  }

  const videoExport = {
    runs: ['show'],
    _fps: 60,
    async begin(name, opts) {
      if (name !== 'show') throw new Error('unknown run: ' + name);
      const fps = (opts && opts.fps) || 60;
      this._fps = fps;
      if (show) { cancelAnimationFrame(show.raf); }
      if (!film) film = buildFilm();
      film.root.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      window.scrollTo(0, 0);
      const imgs = Array.from(film.root.querySelectorAll('img'));
      await decodeAll(imgs);
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      renderFilm(0);
      await nextPaint();
      return { frames: Math.round(TOTAL * fps) };
    },
    async frame(i) {
      if (!film) throw new Error('call begin() first');
      const T = Math.min(TOTAL - 1e-6, i / this._fps);
      renderFilm(T);
      await nextPaint();
    },
    end() {
      if (film) { film.root.hidden = true; }
      document.documentElement.style.overflow = '';
      route();
    }
  };
  window.videoExport = videoExport;

  // ------------------------------------------------------------ 启动
  buildHome();
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { const h = document.getElementById('home'); if (h.classList.contains('on') && h._paint) h._paint(); });
  route();
})();
