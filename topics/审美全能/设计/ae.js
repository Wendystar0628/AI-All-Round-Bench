/* =====================================================================
   AI审美全能 · 页面运行时  window.AE
   依赖：logo/glyphs.js（AE_GLYPHS）、ornaments/ornaments.js（AEOrn）；字标另要 logo/wordmark/wordmark.js（AE_WORDMARK），
   题名锁定另要 logo/lockups/lockups.js（AE_LOCKUPS）。
   约定：画面只由时间决定。页面分两步——build() 在载入时画一次静态层；frame(t) 只更新会动的东西。
   ?t=秒 停在那一刻（不给就用页面的默认时刻）。随机一律带种子。
   这里放的是母版部件：标题字形、字标、题名锁定、右上型号名、星线进度条、观测卡、评语字幕。网站在 Node 的沙箱里也执行它（不碰 DOM）。
   ===================================================================== */
(function (root) {
  'use strict';
  var AE = root.AE = {};
  var q = new URLSearchParams(root.location ? root.location.search : '');

  /* ---------- 时间与曲线 ---------- */
  AE.T = function (def) { var v = q.get('t'); return v == null ? def : parseFloat(v); };
  AE.clamp = function (x, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return Math.max(a, Math.min(b, x)); };
  AE.lerp = function (a, b, t) { return a + (b - a) * t; };
  AE.prog = function (T, t0, dur) { return dur <= 0 ? (T >= t0 ? 1 : 0) : AE.clamp((T - t0) / dur); };
  function bezier(p1x, p1y, p2x, p2y) {
    var cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx, cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    function sx(t) { return ((ax * t + bx) * t + cx) * t; }
    function sy(t) { return ((ay * t + by) * t + cy) * t; }
    function dx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 12; i++) { var e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
      return sy(AE.clamp(t));
    };
  }
  AE.ease = { land: bezier(0.16, 1, 0.3, 1), sway: bezier(0.65, 0, 0.35, 1), exit: bezier(0.4, 0, 1, 1), lin: function (x) { return AE.clamp(x); } };
  AE.rng = function (seed) { return root.AETex ? root.AETex.rng(seed) : Math.random; };

  /* 入场：data-in="起点秒,时长,方式[,退场起点,退场时长]"
     方式：fade 线性 / focus 从虚到实（模糊 12px→0）/ rise 淡入上移 24px / slide 淡入右移 24px /
          land 从 1.05 倍落定 / draw 从左向右显现 / drawc 从中间向两边 / none（只用退场） */
  AE.play = function (T, scope) {
    (scope || root.document).querySelectorAll('[data-in]').forEach(function (el) {
      var a = el.getAttribute('data-in').split(',').map(function (s) { return s.trim(); });
      var t0 = parseFloat(a[0]), dur = parseFloat(a[1]), kind = a[2] || 'fade';
      var out0 = a[3] != null ? parseFloat(a[3]) : null, outDur = a[4] != null ? parseFloat(a[4]) : 0.12;
      var p = kind === 'none' ? 1 : AE.prog(T, t0, dur), e = AE.ease.land(p);
      var op = 1, tf = '', fl = '', cp = '';
      switch (kind) {
        case 'fade': op = p; break;
        case 'focus': op = e; fl = 'blur(' + ((1 - e) * 12).toFixed(2) + 'px)'; break;
        case 'rise': op = e; tf = 'translateY(' + ((1 - e) * 24).toFixed(2) + 'px)'; break;
        case 'slide': op = e; tf = 'translateX(' + ((e - 1) * 24).toFixed(2) + 'px)'; break;
        case 'land': op = e; tf = 'scale(' + (1 + (1 - e) * 0.05).toFixed(4) + ')'; break;
        case 'draw': cp = 'inset(0 ' + ((1 - e) * 100).toFixed(2) + '% 0 0)'; break;
        case 'drawc': cp = 'inset(0 ' + ((1 - e) * 50).toFixed(2) + '% 0 ' + ((1 - e) * 50).toFixed(2) + '%)'; break;
      }
      if (out0 != null && T >= out0) op *= 1 - AE.ease.exit(AE.prog(T, out0, outDur));
      el.style.opacity = op >= 1 ? '' : op.toFixed(3);
      el.style.transform = tf; el.style.filter = fl; el.style.clipPath = cp;
      el.style.visibility = op <= 0.001 ? 'hidden' : '';
    });
  };

  /* ---------- 十个方向（展示顺序；题名、类别取 topics/审美全能/展示文案.json） ----------
     short：进度星座和卷目里的简称；accent：这一题的点亮色；deep：这一题世界色最深的一档（票根实底）；verb：观测卡票根上的动作。
     整套配色（特质词、世界色、点亮色、墨色、光色、主角材质、笔画处理）在 tokens.json 的 directions[]。 */
  AE.DIRS = [
    { no: '01', key: 'mygo-pv', cat: 'PV设计', short: 'PV', catEn: 'PV DESIGN', title: '《壱雫空》PV', accent: '#F6C66A', deep: '#2F6E99', verb: '放映', judge: 'claude', provisional: true },
    { no: '02', key: 'autumn-observatory', cat: '卡通渲染', short: '卡通渲染', catEn: 'TOON RENDERING', title: '秋庭观星画室', accent: '#C8402A', deep: '#1C1828', verb: '入画', judge: 'claude' },
    { no: '03', key: 'greenhouse-render', cat: '白模渲染', short: '白模渲染', catEn: 'WHITEBOX RENDER', title: '玻璃温室与花艺工作室', accent: '#B65E3A', deep: '#6A5238', verb: '掌灯', judge: 'gpt' },
    { no: '04', key: 'nvidia-b200-web', cat: '创意网页设计', short: '网页设计', catEn: 'CREATIVE WEB', title: 'NVIDIA B200 网页艺术', accent: '#F2A73A', deep: '#0A1C16', verb: '通电', judge: 'claude' },
    { no: '05', key: 'sky-citadel', cat: '大型场景建模', short: '大型建模', catEn: 'GRAND SCENE', title: '天穹圣城', accent: '#72E0DE', deep: '#2A3858', verb: '登岛', judge: 'gpt' },
    { no: '06', key: 'pelican-22-styles', cat: 'SVG动画', short: 'SVG动画', catEn: 'SVG ANIMATION', title: '鹈鹕的二十二种画法', accent: '#C8372A', deep: '#4A443B', verb: '起笔', judge: 'claude' },
    { no: '07', key: 'water-park', cat: '体素建模', short: '体素建模', catEn: 'VOXEL', title: '晴空水上乐园', accent: '#F2694A', deep: '#11535E', verb: '入园', judge: 'gemini' },
    { no: '08', key: 'harbor-mecha', cat: '硬表面建模', short: '硬表面', catEn: 'HARD SURFACE', title: '雨夜港口的巨型机甲', accent: '#FF7A2A', deep: '#0D141B', verb: '点火', judge: 'gpt' },
    { no: '09', key: 'floating-isles-game-ui', cat: '游戏UI设计', short: '游戏UI', catEn: 'GAME UI', title: '浮空群岛传说游戏UI', accent: '#F4C43E', deep: '#131538', verb: '开始', judge: 'gemini' },
    { no: '10', key: 'anime-game-logo', cat: '字体与Logo设计', short: 'Logo设计', catEn: 'TYPE & LOGO', title: '二次元游戏Logo', accent: '#C8322A', deep: '#34302E', verb: '付印', judge: 'gemini', provisional: true }
  ];
  AE.dir = function (key) { for (var i = 0; i < AE.DIRS.length; i++) if (AE.DIRS[i].key === key) return AE.DIRS[i]; return null; };

  AE.JUDGES = {
    gpt: { name: 'GPT 6.2 Sol', portrait: 'gpt.png', lamp: '#4C5866', edge: '#36404B', role: '白模渲染 · 大型场景建模 · 硬表面建模' },
    claude: { name: 'Claude Opus 5.5', portrait: 'claude.png', lamp: '#2E4B48', edge: '#203634', role: 'PV设计 · SVG动画 · 创意网页设计 · 卡通渲染' },
    gemini: { name: 'Gemini 4 Neon', portrait: 'gemini.png', lamp: '#6E5432', edge: '#4F3B22', role: '体素建模 · 游戏UI设计 · 字体与Logo设计' }
  };

  function f2(n) { return (+n).toFixed(2); }
  function mixHex(a, b, t) {
    var A = [1, 3, 5].map(function (i) { return parseInt(a.slice(i, i + 2), 16); }), Bc = [1, 3, 5].map(function (i) { return parseInt(b.slice(i, i + 2), 16); });
    return '#' + A.map(function (v, i) { var c = Math.round(v + (Bc[i] - v) * t).toString(16); return c.length < 2 ? '0' + c : c; }).join('');
  }
  /* 切面四角星（八个三角面，左上受光）：给一个底色，按它推出八个面的明暗 */
  AE.facetStar = function (cx, cy, w, h, color) {
    var rx = w / 2, ry = h / 2, k = 0.22, C = [cx, cy];
    var Tp = [cx, cy - ry], R = [cx + rx, cy], Bt = [cx, cy + ry], L = [cx - rx, cy];
    function q(sx, sy) { return [cx + sx * rx * k, cy + sy * ry * k]; }
    var tr = q(1, -1), br = q(1, 1), bl = q(-1, 1), tl = q(-1, -1);
    var tone = [[Tp, tl, 0.42], [Tp, tr, 0.18], [R, tr, 0], [R, br, -0.32], [Bt, br, -0.22], [Bt, bl, 0], [L, bl, -0.08], [L, tl, 0.3]];
    return tone.map(function (t) {
      var col = t[2] >= 0 ? mixHex(color, '#FFE9D2', t[2]) : mixHex(color, '#1A0E08', -t[2]);
      return '<path d="M' + f2(t[0][0]) + ' ' + f2(t[0][1]) + 'L' + f2(t[1][0]) + ' ' + f2(t[1][1]) + 'L' + f2(C[0]) + ' ' + f2(C[1]) + 'Z" fill="' + col + '"/>';
    }).join('');
  };

  /* ---------- 标题字形：思源宋体 Heavy 的整行路径（logo/glyphs.js），平的纸白或墨 ----------
     key：ten-volumes（十卷星图）或题 key。o = { fill: 颜色（或 [上, 下]，只取第一个）}。返回 { w, h, base, html }。字形本身已是细横粗竖，不再加粗竖笔 */
  AE.title = function (key, size, o) {
    o = o || {};
    var Tt = root.AE_GLYPHS.titles[key], s = size / 1000, base = 880 * s;
    var fill = Array.isArray(o.fill) ? o.fill[0] : (o.fill || '#EDE5D8');
    var body = Tt.glyphs.map(function (g) { return '<path transform="translate(' + g.x + ' 0)" d="' + g.d + '"/>'; }).join('');
    var W = Math.ceil(Tt.w * s + 2), H = Math.ceil(base + 0.14 * size);
    return {
      w: W, h: H, base: base,
      html: '<svg class="ae-title-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="overflow:visible" aria-label="' + Tt.text + '">' +
        '<g fill="' + fill + '" transform="translate(0 ' + f2(base) + ') scale(' + s.toFixed(5) + ' ' + (-s).toFixed(5) + ')">' + body + '</g></svg>'
    };
  };

  /* ---------- 字标「AI审美全能」（logo/wordmark/wordmark.js 的 AE_WORDMARK，生成器 logo/wordmark/build/wordmark.py） ----------
     铜版宋：发丝横、刺形横末三角、菱形点；「审」是天文台——宀 的横在子午线上断开一道观测缝，锈橙切面星落进缝里；AI 浅金 Didone。
     AE.wordmarkSVG(size, o)：o = { form: 'display' | 'small'（不给时 <48px 用 small）, ink: 纸面墨色, star: 星的颜色 | false（不画星）,
     starGlow: 星的一圈暖晕（默认暗底有）, fill: 汉字的颜色, aiFill: AI 的颜色, id }。
     返回 { w, h, base, starAt: { x, y, w, h }（星心和宽高，SVG 坐标）, form, html }；SVG 的框是字身框，星尖越出上沿（overflow 可见）。 */
  AE.wordmarkSVG = function (size, o) {
    o = o || {};
    var WM = root.AE_WORDMARK, form = o.form || (size < 48 ? 'small' : 'display'), F = WM.forms[form];
    var C = WM.colors[o.ink ? 'ink' : 'dark'], s = size / 1000, base = WM.ascent * s;
    var fills = { ai: o.aiFill || C.ai, cn: o.fill || C.cn };
    var body = F.glyphs.map(function (g) { return '<path transform="translate(' + g.x + ' 0)" fill="' + fills[g.role] + '" d="' + g.d + '"/>'; }).join('');
    var W = Math.ceil(F.w * s + 2), H = Math.ceil(base + 0.14 * size);
    var st = F.star, b = F.starBoost, k = b && size < b.below ? Math.min(b.max, 1 + (b.below - size) * b.per) : 1;   // 小字号再小时星放大，下尖不动
    var starAt = { x: st.x * s, y: base - (st.y - st.h / 2 + st.h * k / 2) * s, w: st.w * k * s, h: st.h * k * s }, star = '';
    if (o.star !== false) {
      if (o.starGlow !== false && C.halo) {
        var gid = 'wmh' + (o.id || form) + Math.round(size);
        star += '<defs><radialGradient id="' + gid + '"><stop offset="0" stop-color="' + C.halo + '" stop-opacity=".38"/><stop offset=".45" stop-color="#E08A58" stop-opacity=".10"/><stop offset="1" stop-color="#E08A58" stop-opacity="0"/></radialGradient></defs>' +
          '<circle cx="' + f2(starAt.x) + '" cy="' + f2(starAt.y) + '" r="' + f2(starAt.h * 0.62) + '" fill="url(#' + gid + ')"/>';
      }
      star += AE.facetStar(starAt.x, starAt.y, starAt.w, starAt.h, o.star || C.star);
    }
    return {
      w: W, h: H, base: base, starAt: starAt, form: form,
      html: '<svg class="ae-title-svg ae-wordmark-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="overflow:visible" aria-label="' + WM.text + '">' +
        '<g transform="translate(0 ' + f2(base) + ') scale(' + s.toFixed(5) + ' ' + (-s).toFixed(5) + ')">' + body + '</g>' + star + '</svg>'
    };
  };

  /* 字标 + 两端渐隐的短发丝线（字宽的 28%）+ AI AESTHETICS。
     角落小号只有字和线：英文只在 ≥30px 能读的地方出现（片头、落版、网站首屏），o.en 打开；o.ink 纸面墨色 */
  AE.wordmark = function (size, o) {
    size = size || 46; o = o || {};
    var t = AE.wordmarkSVG(size, { id: 'wm' + Math.round(size) + (o.ink ? 'i' : ''), ink: o.ink });
    return '<div class="ae-wordmark' + (o.ink ? ' is-ink' : '') + '">' + t.html +
      '<i class="ae-hair-fade" style="width:' + Math.round(t.w * 0.28) + 'px"></i>' + (o.en ? '<span class="en">AI AESTHETICS</span>' : '') + '</div>';
  };
  AE.modelTag = function (name) {
    return '<div class="ae-modeltag">' + root.AEOrn.diamonds() + '<span>' + name + '</span></div>';
  };

  /* ---------- 题名锁定（logo/lockups/：图层 PNG + 清单 lockups.js 的 window.AE_LOCKUPS） ----------
     十题各一件，视频和网站用同一份。坐标单位是视频舞台像素（1920×1080），图层是 2 倍图。
     几何线是矢量，在这里按清单画：可以伸到画面里的一点（o.to），遇到要读的小字断开（o.avoid），可以按进度“画出来”（o.progress）。 */
  AE.lockupItem = function (key) { var L = root.AE_LOCKUPS; return (L && L.items[key]) || null; };

  /* 图层的 role：plate 底板 · ghost 背景巨字 · emblem 主体元素（可拆几层）· line 画进图层的细线 · text 中文 · hero 单独换料的签名字 ·
     en 英文 · glint 星芒与高光。层数不定，按清单的顺序从后往前叠。要读的是 text、hero、en：摆放按它们和编号小标算最高点，
     矢量几何线的字后一层插在第一张要读的图层前面。 */
  AE.LOCKUP_READ = ['text', 'hero', 'en'];
  AE.lockupTop = function (it) {
    var top = it.tag ? it.tag.y : Infinity;
    it.layers.forEach(function (l) { if (AE.LOCKUP_READ.indexOf(l.role) >= 0) top = Math.min(top, l.y); });
    return top;
  };

  /* 入场：每层在清单里带 enter = { at, dur, kind, … }。at、dur 是占整段入场的比例（0–1），页面自己定整段多长
     （片头一格 0.8 秒、介绍页 2.4 秒）。几何线、星芒、编号小标的时刻在 item.enter.{geo, star, tag}，没写的取下面的缺省。
     每层在 at + dur 时必须已经落定（页面走完整段以后不再重画）。坐标（from、pivot）都是锁定坐标。
     任何 kind 都能带的通用参数：sweep: { at, dur } 形状里扫过一道光（材质面）；steps: N 进度按 N 格跳（定格动画、老游戏那种一顿一顿）。
     kind 见下面的登记处（内置几种 + 各题自己的）。 */
  AE.LOCKUP_ENTER = { geo: { at: 0.34, dur: 0.6 }, star: { at: 0.7, dur: 0.2 }, tag: { at: 0.1, dur: 0.26 } };
  AE.lockupEnter = function (it) {
    var D = AE.LOCKUP_ENTER, g = it.enter || {}, anchor = null;
    // 化开、转入的缺省中心：主体元素或签名字的中心，都没有就是字块中心
    it.layers.forEach(function (l) { if (!anchor && (l.role === 'emblem' || l.role === 'hero')) anchor = [l.x + l.w / 2, l.y + l.h / 2]; });
    if (!anchor) anchor = [(it.box[0] + it.box[2]) / 2, (it.box[1] + it.box[3]) / 2];
    return {
      layers: it.layers.map(function (l) {
        if (!l.enter || !AE.LOCKUP_KINDS[l.enter.kind]) throw new Error('题名锁定 ' + l.file + '：这一层的 enter.kind 没有登记（' + (l.enter && l.enter.kind) + '）');
        var e = Object.assign({}, l.enter);
        if ((e.kind === 'grow' || e.kind === 'turn') && !e.from) e.from = anchor;
        return { layer: l, e: e };
      }),
      geo: Object.assign({}, D.geo, g.geo), star: Object.assign({}, D.star, g.star), tag: Object.assign({}, D.tag, g.tag)
    };
  };
  /* 整段入场走完的进度（≥ 1）：每层的 at + dur、参数里带 { at, dur } 的子段（扫光等）、几何线、星芒里最晚的那一刻 */
  AE.lockupEnd = function (plan, star) {
    var u = 1;
    plan.layers.forEach(function (L) {
      u = Math.max(u, L.e.at + L.e.dur);
      // 参数里带 { at, dur } 的子段（sweep，或各题 kind 自己的）也算进去
      Object.keys(L.e).forEach(function (n) { var v = L.e[n]; if (v && typeof v === 'object' && typeof v.at === 'number' && typeof v.dur === 'number') u = Math.max(u, v.at + v.dur); });
    });
    u = Math.max(u, plan.geo.at + plan.geo.dur);
    if (star) u = Math.max(u, plan.star.at + plan.star.dur);
    return u;
  };

  /* ---------- 入场方式（kind）的登记处 ----------
     AE.lockupKind(名字, { ease, pose, draw })
       ease        进度的缓动：'land'（缺省）| 'sway' | 'lin' | 函数 (p) => 0–1
       pose(o, k)  按进度改这一层的样子 o（字段见 AE.lockupPose）；
                   k = { e 这一层的 enter（参数都在里面）, p 线性进度 0–1, E 缓动后的进度, q = 1 − E, u 整段进度, l 图层 { id role x y w h pivot }, dv(v, 缺省) }
       draw(c, D, o, env)  可选：自己在 canvas 上画这一层（视频的介绍页和片头都用 canvas 画锁定，两处同一份代码）。
                   c   画布，已平移好，直接用舞台坐标画；
                   D   { l 图层, e enter, cv 已缩到本处大小的图层画布, x y 左上（舞台坐标）, w h, memo 这一层自己的缓存 {} }；
                   o   这一刻的样子（pose 写的字段都在，另有 o.p、o.E、o.u）；
                   env { k 锁定坐标 → 舞台的倍数, at([x, y]) 锁定坐标 → 舞台坐标, canvas(w, h) 新画布, light 这一题的光色 'r,g,b',
                         paint(c, D, o, src) 照常画这一层（遮罩、扫光、位移转缩、模糊亮度都算上；src 可换成自己处理过的画布，和 D.cv 一样大） }
     随机一律带种子（AE.rng('…')），画面只由时间决定。内置的几种在下面；各题自己的追加在「各题的入场方式」一段。
     网站只摆静止的样子，不走入场。 */
  AE.LOCKUP_KINDS = {};
  AE.lockupKind = function (name, def) { AE.LOCKUP_KINDS[name] = def; return def; };
  function dv(v, d) { return v == null ? d : v; }

  // fade 淡入 · focus 从虚到实（blur、dx、dy）· slide 横移淡入（dx）· land 微微放大后落定（s）·
  // wipe 从一边擦出来（dir：right/left/up/down，soft 软边）· grow 从一点往外化开（from，soft）· turn 绕 from 转进来（angle 度）·
  // ignite 由暗到亮（dark 起始亮度）· flash 一闪亮起 · trace 绕一点转一圈画出来（见下）
  AE.lockupKind('fade', { ease: 'lin', pose: function (o, k) { o.a = k.p; } });
  AE.lockupKind('focus', { pose: function (o, k) { o.a = k.E; o.blur = k.q * k.dv(k.e.blur, 6); o.dx = k.q * (k.e.dx || 0); o.dy = k.q * (k.e.dy || 0); } });
  AE.lockupKind('slide', { pose: function (o, k) { o.a = k.E; o.dx = k.q * k.dv(k.e.dx, 30); } });
  AE.lockupKind('land', { pose: function (o, k) { o.a = k.E; o.s = 1 + k.q * k.dv(k.e.s, 0.05); } });
  AE.lockupKind('wipe', { ease: 'sway', pose: function (o, k) { o.clip = k.p < 1 ? { type: 'wipe', dir: k.e.dir || 'right', e: k.E, soft: k.dv(k.e.soft, 0.12) } : null; } });
  AE.lockupKind('grow', { ease: 'sway', pose: function (o, k) {
    o.a = Math.min(1, k.E * 1.15); o.s = 0.92 + 0.08 * k.E; o.at = k.e.from || null;
    o.clip = k.p < 1 ? { type: 'radial', at: k.e.from, e: k.E, soft: k.dv(k.e.soft, 0.3) } : null;
  } });
  AE.lockupKind('turn', { ease: 'sway', pose: function (o, k) { o.a = k.E; o.rot = k.q * k.dv(k.e.angle, -30); o.at = k.e.from || null; } });
  AE.lockupKind('ignite', { pose: function (o, k) { var d0 = k.dv(k.e.dark, 0.2); o.a = Math.min(1, k.E * 2); o.bright = d0 + (1 - d0) * k.E; } });
  AE.lockupKind('flash', { pose: function (o, k) { o.a = AE.clamp(k.p * 2.5); o.bright = 1 + 0.9 * Math.sin(Math.PI * k.p); } });
  // trace 绕 from（缺省 pivot）转一圈画出来：环、刻度圈、表盘（start 起始角度，0 朝右、-90 朝上；dir 1 顺时针 / -1 逆时针；soft 软边占一圈的比例）
  AE.lockupKind('trace', { ease: 'sway', pose: function (o, k) {
    o.clip = k.p < 1 ? { type: 'conic', at: k.e.from || (k.l && k.l.pivot) || null, e: k.E, soft: k.dv(k.e.soft, 0.06), start: k.dv(k.e.start, -90), dir: k.e.dir || 1 } : null;
  } });

  /* 一层在入场进度 u（0–1）时的样子：{ kind, p 线性进度, E 缓动后的进度, u, a 不透明度, dx dy 位移, s 缩放, rot 转角（度）,
     at 转、缩的中心（锁定坐标，null 为图层中心）, blur, bright 亮度倍数,
     clip 遮罩或 null：{ type: 'wipe', dir, e, soft } 从一边擦出 · { type: 'radial', at, e, soft } 或 { type: 'radial', at, r, soft }（绝对半径）从一点化开 ·
          { type: 'conic', at, e, soft, start, dir } 绕一点转着显出,
     filter 另加的 canvas 滤镜（如 'saturate(.4)'）, sweep 光扫到哪儿（0–1，-1 没有） }。位移、模糊、半径都是锁定坐标的像素 */
  AE.lockupPose = function (e, u, l) {
    var K = AE.LOCKUP_KINDS[e.kind] || AE.LOCKUP_KINDS.fade;
    var p = e.dur > 0 ? AE.clamp((u - e.at) / e.dur) : (u >= e.at ? 1 : 0);
    if (e.steps > 0 && p < 1) p = Math.floor(p * e.steps) / e.steps;
    var ez = K.ease || 'land', E = typeof ez === 'function' ? ez(p) : (AE.ease[ez] || AE.ease.land)(p);
    var o = { kind: e.kind, p: p, E: E, u: u, a: 1, dx: 0, dy: 0, s: 1, rot: 0, at: null, blur: 0, bright: 1, filter: '', clip: null, sweep: -1 };
    if (K.pose) K.pose(o, { e: e, p: p, E: E, q: 1 - E, u: u, l: l, dv: dv });
    if (p <= 0) o.a = 0;
    if (e.sweep) { var sp = AE.clamp((u - e.sweep.at) / e.sweep.dur); o.sweep = sp > 0 && sp < 1 ? AE.ease.sway(sp) : -1; }
    return o;
  };

  /* ---------- 在 canvas 上画一层（视频的介绍页、片头共用） ----------
     AE.lockupDraw(c, D, o, env)：这一层的 kind 有 draw 就交给它，否则照常画（AE.lockupPaint）。D、env 见登记处的说明 */
  AE.lockupDraw = function (c, D, o, env) {
    if (o.a <= 0.002) return;
    var K = AE.LOCKUP_KINDS[o.kind];
    if (K && K.draw) K.draw(c, D, o, env); else AE.lockupPaint(c, D, o, env);
  };
  var lkScratch = null;   // 一张草稿画布：遮罩和扫光在这里合成，合成完马上画走
  function lkMasked(D, o, env, src) {
    if (!lkScratch || lkScratch.width < D.w || lkScratch.height < D.h)
      lkScratch = env.canvas(Math.max(D.w, lkScratch ? lkScratch.width : 0), Math.max(D.h, lkScratch ? lkScratch.height : 0));
    var sx = lkScratch.getContext('2d');
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1; sx.filter = 'none';
    sx.clearRect(0, 0, lkScratch.width, lkScratch.height); sx.drawImage(src, 0, 0);
    var c = o.clip, g;
    if (c) {
      if (c.type === 'wipe') {
        var e1 = c.e * (1 + c.soft), e0 = e1 - c.soft, hz = c.dir === 'left' || c.dir === 'right', span = hz ? D.w : D.h, rev = c.dir === 'left' || c.dir === 'up';
        var a = (rev ? 1 - e0 : e0) * span, b = (rev ? 1 - e1 : e1) * span;
        g = hz ? sx.createLinearGradient(a, 0, b === a ? a + 0.5 : b, 0) : sx.createLinearGradient(0, a, 0, b === a ? a + 0.5 : b);
      } else if (c.type === 'conic') {   // 绕一点转着显出来：从 start 度（0 朝右，90 朝下）顺时针扫过 e 圈（dir -1 逆时针）
        var ca = c.at ? env.at(c.at) : [D.x + D.w / 2, D.y + D.h / 2], st = (c.start == null ? -90 : c.start) * Math.PI / 180, cs = Math.max(0.001, c.soft);
        var e1c = c.e * (1 + cs), e0c = Math.max(0, e1c - cs);
        g = sx.createConicGradient(st, ca[0] - D.x, ca[1] - D.y);
        var stops = c.dir === -1 ? [[0, 0], [Math.max(0, 1 - e1c), 0], [Math.max(0, 1 - e0c), 1], [1, 1]] : [[0, 1], [Math.min(1, e0c), 1], [Math.min(1, e1c), 0], [1, 0]];
        stops.forEach(function (q) { g.addColorStop(q[0], 'rgba(0,0,0,' + q[1] + ')'); });
      } else {   // radial：从一点化开。给 r（锁定像素）就是绝对半径、soft 是软边宽（锁定像素），几层可以共用同一道前沿；不给就按这一层的大小走 e
        var at = c.at ? env.at(c.at) : [D.x + D.w / 2, D.y + D.h / 2], cx = at[0] - D.x, cy = at[1] - D.y, r0, r1;
        if (c.r != null) { r1 = Math.max(0, c.r * env.k); r0 = Math.max(0, r1 - c.soft * env.k); }
        else {
          var R = Math.max(Math.hypot(cx, cy), Math.hypot(D.w - cx, cy), Math.hypot(cx, D.h - cy), Math.hypot(D.w - cx, D.h - cy));
          r1 = c.e * R * (1 + c.soft); r0 = Math.max(0, r1 - R * c.soft);
        }
        g = sx.createRadialGradient(cx, cy, r0, cx, cy, Math.max(r0 + 0.5, r1));
      }
      if (c.type !== 'conic') { g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
      sx.globalCompositeOperation = 'destination-in'; sx.fillStyle = g; sx.fillRect(0, 0, D.w, D.h);
    }
    if (o.sweep >= 0) {   // 一道光斜着扫过这一层的形状（只落在它的笔画上）
      var bx = AE.lerp(-0.4, 1.4, o.sweep) * (D.w + D.h), lg = sx.createLinearGradient(bx - D.h, 0, bx, D.h * 0.6), L = env.light || '243,214,176';
      lg.addColorStop(0, 'rgba(' + L + ',0)'); lg.addColorStop(0.5, 'rgba(' + L + ',0.55)'); lg.addColorStop(1, 'rgba(' + L + ',0)');
      sx.globalCompositeOperation = 'source-atop'; sx.fillStyle = lg; sx.fillRect(0, 0, D.w, D.h);
    }
    sx.globalCompositeOperation = 'source-over';
    return lkScratch;
  }
  /* 照常画一层：遮罩（擦出、化开、转出）→ 扫光 → 位移、转、缩 → 模糊、亮度、滤镜。src 不给就是 D.cv */
  AE.lockupPaint = function (c, D, o, env, src) {
    if (o.a <= 0.002) return;
    src = src || D.cv;
    if (o.clip || o.sweep >= 0) src = lkMasked(D, o, env, src);
    var k = env.k, at = o.at ? env.at(o.at) : [D.x + D.w / 2, D.y + D.h / 2];
    c.save();
    c.translate(at[0] + o.dx * k, at[1] + o.dy * k); if (o.rot) c.rotate(o.rot * Math.PI / 180); if (o.s !== 1) c.scale(o.s, o.s); c.translate(-at[0], -at[1]);
    c.globalAlpha = Math.min(1, o.a);
    var fl = (o.blur > 0.05 ? 'blur(' + (o.blur * k).toFixed(2) + 'px) ' : '') + (o.bright !== 1 ? 'brightness(' + o.bright.toFixed(3) + ') ' : '') + (o.filter || '');
    if (fl) c.filter = fl;
    c.drawImage(src, 0, 0, D.w, D.h, D.x, D.y, D.w, D.h);
    c.restore();
  };

  /* 逐像素显出（给 draw 用）：按一张阈值图把这一层显出来，阈值小的先出现。
     field(w, h) → Float32Array(w·h)，0–1，只在第一次算、存在 D.memo[key]；v 是这一刻的水位（v ≥ 1 + soft 时全显），soft 软边。
     返回和 D.cv 一样大的画布（src 换别的同样大的画布也行），交给 env.paint(c, D, o, 它) 画。 */
  AE.lockupReveal = function (D, env, key, field, v, soft, src) {
    var m = D.memo[key] || (D.memo[key] = {});
    if (!m.f) { m.f = field(D.w, D.h); m.mask = env.canvas(D.w, D.h); m.out = env.canvas(D.w, D.h); m.img = m.mask.getContext('2d').createImageData(D.w, D.h); }
    var a = m.img.data, f = m.f, s = soft || 0.08, n = D.w * D.h, x;
    for (var i = 0; i < n; i++) { x = (v - f[i]) / s; a[i * 4 + 3] = x <= 0 ? 0 : (x >= 1 ? 255 : x * 255); }
    m.mask.getContext('2d').putImageData(m.img, 0, 0);
    var oc = m.out.getContext('2d');
    oc.globalCompositeOperation = 'copy'; oc.drawImage(src || D.cv, 0, 0);
    oc.globalCompositeOperation = 'destination-in'; oc.drawImage(m.mask, 0, 0); oc.globalCompositeOperation = 'source-over';
    return m.out;
  };
  /* 带种子的平滑值噪声：AE.lockupNoise('种子') → f(x, y)，0–1，一格一个随机值、格间平滑（x、y 是格子坐标，自己乘缩放） */
  AE.lockupNoise = function (seed) {
    var r = AE.rng(seed), P = new Float32Array(4096);
    for (var i = 0; i < 4096; i++) P[i] = r();
    function h(i, j) { return P[(Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) & 4095]; }
    function sm(t) { return t * t * (3 - 2 * t); }
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
      var a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  };

  /* ======== 各题的入场方式：每题自己的 kind 追加在这一段（一种一块，AE.lockupKind('<题前缀>-<名字>', {…})，名字带题前缀）。
     不改上面的内置 kind 和画法；要改它们先告诉统筹。 ======== */

  /* ---- 03 温室 · greenhouse-dusk：白模被夕光扫过、长出材质 ----
     先是一件没上材质的白模（只有形体明暗的灰石膏色），从虚到实出来；然后一道夕光沿光束的方向从左上斜扫到右下，
     扫过的地方长出这一层本来的颜色和材质，光的前沿落在形状上一道暖光。各层共用同一道光（按整段进度 u 走），所以光是连着扫过整件的。
     参数（at、dur 要盖住光走完的那一刻）：light [u0, u1] 光扫过的整段进度；front [s0, s1] 前沿走过的位置（锁定坐标在 dir 上的投影）；
       dir 光的方向；soft 前沿的宽（锁定像素）；glow 前沿暖光的浓度；tone 暖光的颜色 'r,g,b'；
       clay [lift, gain] 白模的明暗（灰度 g → lift + gain·g），false 时没有白模（底板：光到哪儿颜色才到哪儿）；
       show 白模从虚到实用多少整段进度（缺省 0.1）、blur 起始的虚（缺省 5） */
  AE.lockupKind('greenhouse-dusk', {
    ease: 'lin',
    pose: function (o, k) {
      var e = k.e;
      if (e.clay === false) return;
      var q = AE.ease.land(AE.clamp((k.u - e.at) / (e.show || 0.1)));
      o.a = q; o.blur = (1 - q) * k.dv(e.blur, 5);
    },
    draw: function (c, D, o, env) {
      var e = D.e, L = e.light, f = 0.5 - 0.5 * Math.cos(Math.PI * AE.clamp((o.u - L[0]) / (L[1] - L[0])));   // 光匀匀地起、匀匀地停
      if (f >= 1) { AE.lockupPaint(c, D, o, env); return; }
      var m = D.memo, w = D.w, h = D.h, k = env.k;
      var F = e.front, soft = e.soft, d = e.dir, dn = Math.hypot(d[0], d[1]), ux = d[0] / dn, uy = d[1] / dn;
      var s = AE.lerp(F[0], F[1], f), s0 = ux * D.l.x + uy * D.l.y;
      var P = function (sv) { var t = (sv - s0) * k; return [ux * t, uy * t]; };   // 前沿位置 → 这一层画布里的点
      var lit = function (x) { var a = P(s - soft), b = P(s), g = x.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; };
      if (!m.mix) { m.mix = env.canvas(w, h); m.wb = env.canvas(w, h); }
      if (e.clay !== false && !m.clay) {   // 白模：去色、压成一段窄的灰（石膏的明暗），略带一点暖
        var cl = e.clay, br = 2 * cl[0] + cl[1], ct = cl[1] / br, cx = (m.clay = env.canvas(w, h)).getContext('2d');
        cx.filter = 'grayscale(1) contrast(' + ct.toFixed(3) + ') brightness(' + br.toFixed(3) + ') sepia(0.16)';
        cx.drawImage(D.cv, 0, 0); cx.filter = 'none';
      }
      var mx = m.mix.getContext('2d');
      mx.setTransform(1, 0, 0, 1, 0, 0); mx.globalAlpha = 1; mx.filter = 'none'; mx.globalCompositeOperation = 'source-over'; mx.clearRect(0, 0, w, h);
      if (f > 0) {
        mx.drawImage(D.cv, 0, 0);
        var tone = e.tone, gl = e.glow, a2 = P(s - soft * 2.2), b2 = P(s), g1 = mx.createLinearGradient(a2[0], a2[1], b2[0], b2[1]);
        g1.addColorStop(0, 'rgba(' + tone + ',0)'); g1.addColorStop(0.66, 'rgba(' + tone + ',' + gl + ')'); g1.addColorStop(1, 'rgba(' + tone + ',0)');
        mx.globalCompositeOperation = 'source-atop'; mx.fillStyle = g1; mx.fillRect(0, 0, w, h);      // 光的前沿落在形状上
        mx.globalCompositeOperation = 'destination-in'; mx.fillStyle = lit(mx); mx.fillRect(0, 0, w, h);   // 只留光扫过的一侧
      }
      if (m.clay) {   // 还没被光扫到的一侧是白模；两半按透明度相加，接缝处不透光也不发灰
        var wx = m.wb.getContext('2d');
        wx.setTransform(1, 0, 0, 1, 0, 0); wx.globalCompositeOperation = 'source-over'; wx.clearRect(0, 0, w, h); wx.drawImage(m.clay, 0, 0);
        if (f > 0) { wx.globalCompositeOperation = 'destination-out'; wx.fillStyle = lit(wx); wx.fillRect(0, 0, w, h); }
        mx.globalCompositeOperation = 'lighter'; mx.drawImage(m.wb, 0, 0);
      }
      mx.globalCompositeOperation = 'source-over';
      AE.lockupPaint(c, D, o, env, m.mix);
    }
  });

  /* ---- 01 PV · pv-glare：太阳从一团晃眼的光里收出来 ----
     亮、虚、略大 → 落定成清楚的日轮。from 收拢的中心（锁定坐标）、glare 起始多亮（亮度多出的倍数）、blur、s */
  AE.lockupKind('pv-glare', {
    pose: function (o, k) {
      o.a = Math.min(1, k.E * 1.8); o.bright = 1 + k.q * k.dv(k.e.glare, 0.6); o.blur = k.q * k.dv(k.e.blur, 8);
      o.s = 1 + k.q * k.dv(k.e.s, 0.12); o.at = k.e.from || null;
    }
  });

  /* ---- 01 PV · pv-rain：雨从上往下落 ----
     擦出的前沿和雨丝一起往下走，越落越快（重力，不减速），落到位就停。dy 雨丝跟着落下的距离、soft 前沿的软边 */
  AE.lockupKind('pv-rain', {
    ease: function (p) { return p * p; },
    pose: function (o, k) {
      o.a = Math.min(1, k.p * 4); o.dy = -k.q * k.dv(k.e.dy, 14);
      o.clip = k.p < 1 ? { type: 'wipe', dir: 'down', e: k.E, soft: k.dv(k.e.soft, 0.3) } : null;
    }
  });

  /* ---- 01 PV · pv-fall：一滴水顺着雨向落进原位 ----
     越落越快，路上顺着落的方向拉长一点，身后拖一道淡的雨痕；落到原位就停，不弹（落定后照常画，扫光照算）。
     c 水滴腹心（锁定坐标）、fall 落下的距离（锁定像素）、dir 落的方向（默认雨向，偏竖直 16°）、stretch 路上拉长多少 */
  AE.lockupKind('pv-fall', {
    ease: 'lin',
    draw: function (c, D, o, env) {
      var e = D.e, p = o.p;
      if (p >= 1) { AE.lockupPaint(c, D, o, env); return; }
      var d = e.dir || [0.2756, 0.9613], n = Math.hypot(d[0], d[1]), ax = d[0] / n, ay = d[1] / n, ang = Math.atan2(ay, ax);
      var Lf = (e.fall || 140) * env.k, ctr = env.at(e.c), st0 = e.stretch == null ? 0.16 : e.stretch, a = Math.min(1, p * 2.2);   // 起落那段慢，水滴在「雨」里慢慢聚出来
      var one = function (pp, alpha) {
        if (pp <= 0 || alpha <= 0.002) return;
        var off = -(1 - pp * pp) * Lf, st = 1 + st0 * 4 * pp * (1 - pp);
        c.save(); c.globalAlpha = alpha;
        c.translate(ctr[0] + ax * off, ctr[1] + ay * off); c.rotate(ang); c.scale(st, 1 / Math.sqrt(st)); c.rotate(-ang); c.translate(-ctr[0], -ctr[1]);
        c.drawImage(D.cv, 0, 0, D.w, D.h, D.x, D.y, D.w, D.h);
        c.restore();
      };
      for (var i = 3; i >= 1; i--) one(p - i * 0.06, a * 0.14 / i);   // 身后的雨痕
      one(p, a);
    }
  });

  /* ---- 01 PV · pv-ripple：水面上的涟漪 ----
     从中心一圈圈扩到原位（减速落定）；外面再多走一圈，越走越淡、散掉。from 涟漪中心（锁定坐标）、echo 外圈多走出去的比例 */
  AE.lockupKind('pv-ripple', {
    draw: function (c, D, o, env) {
      var e = D.e, p = o.p;
      AE.lockupPaint(c, D, Object.assign({}, o, { at: e.from, s: 0.3 + 0.7 * o.E, a: Math.min(1, p * 3) }), env);
      var p2 = AE.clamp((p - 0.1) / 0.9);
      if (p2 > 0 && p2 < 1) AE.lockupPaint(c, D, Object.assign({}, o, { at: e.from, s: 1 + (e.echo == null ? 0.7 : e.echo) * AE.ease.land(p2), a: 0.5 * (1 - p2) * Math.min(1, p2 * 8) }), env);
    }
  });

  /* ---- 08 雨夜港口的巨型机甲：先装配——蓝图的中线、刻度圈先画出，炉心的装甲板和涡轮叶反向一拧锁死，两段钢字推到位
     （第一段带着钢杆插进刻字环，第二段被液压杆顶上来），这时都是没通电的冷钢；空一拍，炉芯打火（一下没着、再着），
     光从炉心沿钢杆传进每个字，最后德尔塔一闪点亮 ---- */
  var mechaHeavy = bezier(0.62, 0, 0.16, 1);   // 液压件：起步沉、中段快、到位一下子停死（不回弹）
  // 到位：stop（占这一层时长的比例）以前走完位移（dx dy）、转角（angle，绕 from 或 pivot）、缩放（s）；fade 以前由透明到实；
  // 到位那一下钢边亮一下（seat 亮度增量）再退回
  function mechaMove(o, k) {
    var e = k.e, stop = k.dv(e.stop, 0.8), m = AE.clamp(k.p / stop), E = mechaHeavy(m), q = 1 - E;
    o.a = AE.clamp(m / k.dv(e.fade, 0.3));
    o.dx = q * (e.dx || 0); o.dy = q * (e.dy || 0); o.rot = q * (e.angle || 0); o.s = 1 + q * (e.s || 0);
    o.at = e.from || (k.l && k.l.pivot) || null;
    if (k.p > stop) { var w = (k.p - stop) / (1 - stop); o.bright = 1 + k.dv(e.seat, 0.22) * Math.exp(-w * 3.5) * (1 - w); }
  }
  AE.lockupKind('mecha-clamp', { ease: 'lin', pose: mechaMove });
  // 钢字：按 mecha-clamp 到位，到位时是没通电的冷钢；power = { at, dur, from, reach, band, dark }：通电的前沿从 from（炉心）往外推到 reach
  // （锁定像素），前沿以内是亮的湿钢、以外是冷钢（dark 亮度、褪色），前沿上一道冷白的电光；几段字共用同一道前沿
  AE.lockupKind('mecha-power', { ease: 'lin',
    pose: function (o, k) { mechaMove(o, k); var pw = k.e.power; o.power = pw ? AE.clamp((k.u - pw.at) / pw.dur) : 1; },
    draw: function (c, D, o, env) {
      var pw = D.e.power || {}, w = o.power;
      if (w >= 1) { env.paint(c, D, o); return; }
      var m = D.memo.pw || (D.memo.pw = { a: env.canvas(D.w, D.h), b: env.canvas(D.w, D.h), f: env.canvas(D.w, D.h) });
      var band = (pw.band || 80) * env.k, r = AE.ease.sway(w) * ((pw.reach || 800) * env.k + band), at = env.at(pw.from), cx = at[0] - D.x, cy = at[1] - D.y;
      var grad = function (x, inner) {
        var g = x.createRadialGradient(cx, cy, Math.max(0, r - band), cx, cy, Math.max(0.5, r));
        g.addColorStop(0, 'rgba(0,0,0,' + (inner ? 1 : 0) + ')'); g.addColorStop(1, 'rgba(0,0,0,' + (inner ? 0 : 1) + ')'); return g;
      };
      // 冷钢 ×（1 − 前沿）+ 亮钢 × 前沿：预乘颜色相加，透明度不多不少
      var xa = m.a.getContext('2d'), xb = m.b.getContext('2d');
      xa.globalCompositeOperation = 'copy'; xa.filter = 'brightness(' + (pw.dark == null ? 0.5 : pw.dark) + ') saturate(.35)'; xa.drawImage(D.cv, 0, 0); xa.filter = 'none';
      xa.globalCompositeOperation = 'destination-in'; xa.fillStyle = grad(xa, false); xa.fillRect(0, 0, D.w, D.h);
      if (r > 0) {
        xb.globalCompositeOperation = 'copy'; xb.drawImage(D.cv, 0, 0);
        xb.globalCompositeOperation = 'destination-in'; xb.fillStyle = grad(xb, true); xb.fillRect(0, 0, D.w, D.h);
        xa.globalCompositeOperation = 'lighter'; xa.drawImage(m.b, 0, 0);
      }
      xa.globalCompositeOperation = 'source-over';
      env.paint(c, D, o, m.a);
      if (r <= 0) return;
      // 前沿上的电光：钢面在那一圈里加亮（冷白），随前沿走完退掉
      var xf = m.f.getContext('2d');
      xf.globalCompositeOperation = 'copy'; xf.drawImage(D.cv, 0, 0);
      var g = xf.createRadialGradient(cx, cy, Math.max(0, r - band * 1.3), cx, cy, Math.max(0.5, r - band * 0.1));
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      xf.globalCompositeOperation = 'destination-in'; xf.fillStyle = g; xf.fillRect(0, 0, D.w, D.h); xf.globalCompositeOperation = 'source-over';
      c.save(); c.globalCompositeOperation = 'lighter';
      env.paint(c, D, Object.assign({}, o, { a: 0.6 * Math.sin(Math.PI * Math.min(1, w * 1.1)), bright: 1, filter: 'saturate(.15)' }), m.f);
      c.restore();
    } });
  // 炉芯打火：先亮到七成、一下没着往回落，再着起来，着的时候过亮一点（flare）再回到本色
  AE.lockupKind('mecha-ignite', { ease: 'lin', pose: function (o, k) {
    var p = k.p, L;
    if (p < 0.2) L = 0.7 * AE.ease.land(p / 0.2);
    else if (p < 0.32) L = 0.7 - 0.45 * AE.ease.sway((p - 0.2) / 0.12);
    else L = 0.25 + 0.75 * AE.ease.land((p - 0.32) / 0.68);
    var f = p > 0.32 ? Math.sin(Math.PI * AE.clamp((p - 0.32) / 0.68)) : 0;
    o.a = AE.clamp(L * 1.5); o.bright = 0.1 + 0.9 * L + k.dv(k.e.flare, 0.6) * f * f;
  } });
  // 德尔塔点亮：一团过曝的白从稍大收进三角里，冷却成本色（flash 起始的过亮，s 起始的放大，绕 from 或 pivot）
  AE.lockupKind('mecha-flare', { pose: function (o, k) {
    o.a = AE.clamp(k.E * 1.4); o.bright = 1 + k.dv(k.e.flash, 1.6) * k.q; o.s = 1 + k.q * k.dv(k.e.s, 0.3); o.at = k.e.from || (k.l && k.l.pivot) || null;
  } });
  // 模板喷字：喷枪从左往右走一趟，颜料一粒粒落上去（前沿是喷雾的颗粒，不是一条直边）
  AE.lockupKind('mecha-spray', { ease: 'lin', pose: function (o, k) { o.a = k.p > 0 ? 1 : 0; },
    draw: function (c, D, o, env) {
      if (o.p >= 1) { env.paint(c, D, o); return; }
      var soft = 0.14;
      env.paint(c, D, o, AE.lockupReveal(D, env, 'spray', function (w, h) {
        var n = AE.lockupNoise('mecha-spray'), r = AE.rng('mecha-spray-grain'), f = new Float32Array(w * h), s = 22 * env.k;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) f[y * w + x] = 0.7 * x / w + 0.17 * n(x / s, y / s) + 0.13 * r();
        return f;
      }, AE.ease.sway(o.p) * (1 + soft), soft));
    } });

  /* ---- 09 浮空群岛 · 卡带开机的标题画面（isles-mosaic / isles-tiles / isles-rise / isles-drip / isles-blink） ----
     16 位机的规矩：背景层整片做马赛克，精灵不受马赛克、按整格移动；亮度、不透明度都是一档一档跳，不做平滑的淡入。 */

  /* isles-mosaic 马赛克淡入（SNES 的 mosaic 寄存器加分档亮度）：方块边长从 block（锁定像素）起一档档对半，小到 2 以下就清晰；
     不透明度跟着按档升起，最后一档马赛克时已是全亮。block: 0 时不做马赛克，只分 levels 档淡入 */
  AE.lockupKind('isles-mosaic', {
    ease: 'lin',
    pose: function (o, k) {
      var b = k.dv(k.e.block, 16), n = 0;
      while (b / Math.pow(2, n) > 2) n++;
      if (!n) { var lv = k.dv(k.e.levels, 3); o.a = Math.ceil(k.p * lv - 1e-6) / lv; return; }
      var i = Math.min(n, Math.floor(k.p * (n + 1)));
      o.mosaic = i < n ? b / Math.pow(2, i) : 0;
      o.a = Math.min(1, (i + 1) / n);
    },
    draw: function (c, D, o, env) {
      var b = (o.mosaic || 0) * env.k;
      if (b < 1.5) { env.paint(c, D, o); return; }
      var key = 'mosaic' + b.toFixed(2), big = D.memo[key];
      if (!big) {   // 每一档只算一次：按方块缩小（平均）再不插值地放回去
        var sw = Math.max(1, Math.ceil(D.w / b)), sh = Math.max(1, Math.ceil(D.h / b)), sm = env.canvas(sw, sh), sx = sm.getContext('2d');
        sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high'; sx.drawImage(D.cv, 0, 0, D.w / b, D.h / b);
        big = D.memo[key] = env.canvas(D.w, D.h);
        var bx = big.getContext('2d');
        bx.imageSmoothingEnabled = false; bx.drawImage(sm, 0, 0, sw, sh, 0, 0, sw * b, sh * b);
      }
      var sm0 = c.imageSmoothingEnabled;
      c.imageSmoothingEnabled = false; env.paint(c, D, o, big); c.imageSmoothingEnabled = sm0;
    }
  });

  /* isles-tiles 一格一格铺开（菜单条、珠点线）：从 dir 那一边按 tile（锁定像素）一格格显出，没有软边 */
  AE.lockupKind('isles-tiles', {
    ease: 'lin',
    pose: function (o, k) {
      var n = Math.max(1, Math.ceil(k.l.w / k.dv(k.e.tile, 8))), m = Math.ceil(k.p * n - 1e-6);
      o.clip = k.p < 1 ? { type: 'wipe', dir: k.e.dir || 'right', e: m / n, soft: 0 } : null;
    }
  });

  /* isles-rise 精灵浮上来：从 dy（锁定像素，正数在下面）按整格（cell，缺省 2 = 一个像素格）升到位，减速得比 land 缓（浮上来，不是弹上来），
     不透明度在前 fade 里分三档出来。move：位移只占这一段的前多少（之后停着）；dark + light [起, 止]：先暗着，到 light 那一段再分四档亮起来（晶簇停稳后点亮） */
  AE.lockupKind('isles-rise', {
    ease: 'lin',
    pose: function (o, k) {
      var e = k.e, cell = k.dv(e.cell, 2), E = 1 - Math.pow(1 - AE.clamp(k.p / k.dv(e.move, 1)), 3);
      o.dy = Math.round((1 - E) * k.dv(e.dy, 40) / cell) * cell;
      o.a = Math.min(1, Math.ceil(k.p / k.dv(e.fade, 0.24) * 3 - 1e-6) / 3);
      if (e.dark != null) {
        var lt = e.light || [0.7, 1], y = AE.clamp((k.p - lt[0]) / (lt[1] - lt[0]));
        o.bright = e.dark + (1 - e.dark) * Math.floor(y * 4 + 1e-6) / 4;
      }
    }
  });

  /* isles-drip 一滴在尖上结出来、落到位：前 form 段在高 dy（锁定像素，负数在上面）的地方分三档长大，之后按整格落下 */
  AE.lockupKind('isles-drip', {
    ease: 'lin',
    pose: function (o, k) {
      var f = k.dv(k.e.form, 0.45), dy = k.dv(k.e.dy, -7);
      if (k.p < f) { var i = Math.min(2, Math.floor(k.p / f * 3)); o.dy = dy; o.s = [0.4, 0.7, 1][i]; o.a = [0.5, 0.8, 1][i]; }
      else o.dy = Math.round(dy * (1 - AE.ease.sway((k.p - f) / (1 - f))) / 2) * 2;
    }
  });

  /* isles-blink 菜单式的闪：亮—灭—亮……灭 blinks 次，最后亮着（光标选中、按下 PRESS START） */
  AE.lockupKind('isles-blink', {
    ease: 'lin',
    pose: function (o, k) { var n = k.dv(k.e.blinks, 1); o.a = k.p >= 1 || Math.floor(k.p * (2 * n + 1)) % 2 === 0 ? 1 : 0; }
  });

  /* ---- 10 二次元游戏Logo · 一张校样从上版到改样（logo-sheet / logo-register / logo-strike / logo-foil / logo-trace） ---- */

  /* logo-sheet 校样纸放上压台：从略高、略偏、略斜（dx、dy 锁定像素，rot 度，s 多出的倍数）落平 */
  AE.lockupKind('logo-sheet', {
    pose: function (o, k) {
      var e = k.e;
      o.a = Math.min(1, k.p * 4);
      o.dx = k.q * k.dv(e.dx, -10); o.dy = k.q * k.dv(e.dy, -14); o.rot = k.q * k.dv(e.rot, -1.2); o.s = 1 + k.q * k.dv(e.s, 0.025);
    }
  });

  /* logo-register 套准：两版错开 d（锁定像素，沿 angle 度的方向一正一反）的影子半透明地叠着，往中间收、合成一个（对准）*/
  AE.lockupKind('logo-register', {
    pose: function (o, k) { o.a = Math.min(1, k.p * 4); o.reg = k.q; },
    draw: function (c, D, o, env) {
      var r = (o.reg || 0) * dv(D.e.d, 12);
      if (r < 0.05) { env.paint(c, D, o); return; }
      var t = dv(D.e.angle, -30) * Math.PI / 180, ux = Math.cos(t) * r, uy = Math.sin(t) * r, a = o.a * (0.5 + 0.5 * Math.pow(1 - o.reg, 3));
      env.paint(c, D, Object.assign({}, o, { dx: o.dx + ux, dy: o.dy + uy, a: a }));
      env.paint(c, D, Object.assign({}, o, { dx: o.dx - ux, dy: o.dy - uy, a: a }));
    }
  });

  /* logo-strike 铅字一压：墨一下子吃进纸里（不透明度很快到满、墨边从虚收实），压下去那一刻往右下一道深的凹痕影、左上一丝纸的亮，随压力退净 */
  AE.lockupKind('logo-strike', {
    pose: function (o, k) { o.a = Math.min(1, k.p * 5); o.blur = k.q * k.dv(k.e.blur, 1.4); o.dent = k.q; },
    draw: function (c, D, o, env) {
      var q = o.dent || 0, k = env.k;
      if (q > 0.01) {
        c.save(); c.globalAlpha = 0.42 * q * Math.min(1, o.a); c.filter = 'brightness(0) blur(' + ((0.8 + 1.6 * q) * k).toFixed(2) + 'px)';
        c.drawImage(D.cv, D.x + 1.8 * k, D.y + 2.4 * k); c.restore();
        c.save(); c.globalAlpha = 0.5 * q; c.filter = 'brightness(0) invert(1) blur(' + (0.8 * k).toFixed(2) + 'px)';
        c.drawImage(D.cv, D.x - 1.2 * k, D.y - 1.2 * k); c.restore();
      }
      env.paint(c, D, o);
    }
  });

  /* logo-foil 烫印：前 strike 段烫印版压下，留下一枚没上箔的素压凹痕（左上内壁一线影、右下内壁一线亮）；
     之后箔膜从左往右揭开（揭口斜 angle 度），揭过的地方是箔，揭口一道镭射的亮边跟着走 */
  function logoBlind(D, env) {
    var k = env.k, d = Math.max(1, 1.5 * k), W = D.w, H = D.h;
    var sil = env.canvas(W, H), s = sil.getContext('2d'), wall = env.canvas(W, H), w = wall.getContext('2d'), out = env.canvas(W, H), x = out.getContext('2d');
    s.drawImage(D.cv, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#5B4D42'; s.fillRect(0, 0, W, H);
    x.globalAlpha = 0.12; x.drawImage(sil, 0, 0);                                    // 凹下去的底：纸略暗一点
    w.drawImage(sil, 0, 0); w.globalCompositeOperation = 'destination-out'; w.drawImage(sil, d, d);
    x.globalAlpha = 0.5; x.filter = 'blur(' + (0.6 * k).toFixed(2) + 'px)'; x.drawImage(wall, 0, 0); x.filter = 'none';   // 左上内壁的影
    w.globalCompositeOperation = 'source-over'; w.clearRect(0, 0, W, H); w.drawImage(sil, 0, 0);
    w.globalCompositeOperation = 'source-in'; w.fillStyle = '#FFFDF6'; w.fillRect(0, 0, W, H);
    w.globalCompositeOperation = 'destination-out'; w.drawImage(sil, -d, -d);
    x.globalAlpha = 0.85; x.drawImage(wall, 0, 0);                                    // 右下内壁的亮
    return out;
  }
  AE.lockupKind('logo-foil', {
    ease: 'lin',
    pose: function (o, k) {
      var f = k.dv(k.e.strike, 0.22);
      o.a = Math.min(1, k.p / f * 3);
      o.peel = k.p < f ? 0 : AE.ease.sway((k.p - f) / (1 - f));
      o.dent = k.p < f ? 1 - AE.ease.land(k.p / f) : 0;
    },
    draw: function (c, D, o, env) {
      if (o.p >= 1) { env.paint(c, D, o); return; }
      var m = D.memo, k = env.k, W = D.w, H = D.h;
      if (!m.blind) { m.blind = logoBlind(D, env); m.foil = env.canvas(W, H); m.rest = env.canvas(W, H); }
      var th = dv(D.e.angle, 20) * Math.PI / 180, nx = Math.cos(th), ny = Math.sin(th);
      var ps = [0, W * nx, H * ny, W * nx + H * ny], s0 = Math.min.apply(null, ps), s1 = Math.max.apply(null, ps), band = 30 * k;
      var pos = AE.lerp(s0 - 2, s1 + band, o.peel);
      var grad = function (x, a, b, stops) { var g = x.createLinearGradient(nx * a, ny * a, nx * b, ny * b); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; };
      // 揭过的一边：箔，揭口后面一道镭射亮边（粉—白—青，只落在箔上）
      var f = m.foil.getContext('2d');
      f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, W, H); f.drawImage(D.cv, 0, 0);
      f.globalCompositeOperation = 'destination-in'; f.fillStyle = grad(f, pos - 1.5, pos + 1.5, [[0, '#000'], [1, 'rgba(0,0,0,0)']]); f.fillRect(0, 0, W, H);
      f.globalCompositeOperation = 'source-atop';
      f.fillStyle = grad(f, pos - band, pos, [[0, 'rgba(255,214,236,0)'], [0.45, 'rgba(214,236,255,.5)'], [0.82, 'rgba(255,255,255,.92)'], [1, 'rgba(255,248,236,.2)']]);
      f.fillRect(0, 0, W, H);
      // 还没揭的一边：素压凹痕
      var r = m.rest.getContext('2d');
      r.globalCompositeOperation = 'source-over'; r.clearRect(0, 0, W, H); r.drawImage(m.blind, 0, 0);
      r.globalCompositeOperation = 'destination-in'; r.fillStyle = grad(r, pos - 1.5, pos + 1.5, [[0, 'rgba(0,0,0,0)'], [1, '#000']]); r.fillRect(0, 0, W, H);
      r.globalCompositeOperation = 'source-over'; r.drawImage(m.foil, 0, 0);
      if (o.dent > 0.01) {   // 烫印版压下那一刻：一道往右下的深影，随版抬起退净
        c.save(); c.globalAlpha = 0.22 * o.dent; c.filter = 'brightness(0) blur(' + (1.1 * k).toFixed(2) + 'px)'; c.drawImage(D.cv, D.x + 1.4 * k, D.y + 1.8 * k); c.restore();
      }
      env.paint(c, D, o, m.rest);
    }
  });

  /* logo-trace 笔顺着路写出来：paths 是几段笔路（锁定坐标的折线），w 是每段笔路盖住的宽（一个数或每段一个，锁定像素）；
     一段写完抬笔停 lift（占这一段入场的比例）再写下一段；每段的用时按长度分，段内先慢后快再慢 */
  AE.lockupKind('logo-trace', {
    ease: 'lin',
    pose: function (o, k) { o.a = 1; },
    draw: function (c, D, o, env) {
      if (o.p >= 1) { env.paint(c, D, o); return; }
      var m = D.memo, e = D.e, k = env.k;
      if (!m.segs) {
        var W = e.w, lift = dv(e.lift, 0), n = (e.paths || []).length;
        m.segs = (e.paths || []).map(function (pts, i) {
          var q = pts.map(function (p) { var s = env.at(p); return [s[0] - D.x, s[1] - D.y]; }), L = [0];
          for (var j = 1; j < q.length; j++) L.push(L[j - 1] + Math.hypot(q[j][0] - q[j - 1][0], q[j][1] - q[j - 1][1]));
          return { q: q, L: L, len: L[L.length - 1], w: (Array.isArray(W) ? W[i] : dv(W, 12)) * k };
        });
        var share = m.segs.map(function (s) { return Math.pow(s.len, 0.75); }), tot = share.reduce(function (a, b) { return a + b; }, 0) || 1, t = 0, free = 1 - lift * Math.max(0, n - 1);
        m.segs.forEach(function (s, i) { s.t0 = t; s.t1 = t + free * share[i] / tot; t = s.t1 + lift; });
        m.mask = env.canvas(D.w, D.h);
      }
      var x = m.mask.getContext('2d');
      x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, D.w, D.h);
      x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#000';
      m.segs.forEach(function (s) {
        var f = AE.ease.sway(AE.clamp((o.p - s.t0) / (s.t1 - s.t0)));
        if (f <= 0) return;
        var goal = f * s.len, q = s.q;
        x.lineWidth = s.w; x.beginPath(); x.moveTo(q[0][0], q[0][1]);
        for (var j = 1; j < q.length; j++) {
          if (s.L[j] >= goal) { var u = (goal - s.L[j - 1]) / ((s.L[j] - s.L[j - 1]) || 1); x.lineTo(q[j - 1][0] + (q[j][0] - q[j - 1][0]) * u, q[j - 1][1] + (q[j][1] - q[j - 1][1]) * u); break; }
          x.lineTo(q[j][0], q[j][1]);
        }
        x.stroke();
      });
      x.globalCompositeOperation = 'source-in'; x.drawImage(D.cv, 0, 0);
      env.paint(c, D, o, m.mask);
    }
  });

  /* ---- 06 鹈鹕 · 共用：折线（锁定坐标，按弧长等分）上取点、取走向；悬着的纸身下那团软影 ---- */
  function pelicanAt(P, s) {
    var f = AE.clamp(s) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), t = f - i;
    return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t];
  }
  function pelicanDir(P, s) {
    var i = Math.min(P.length - 2, Math.floor(AE.clamp(s) * (P.length - 1)));
    return Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) * 180 / Math.PI;
  }
  // 这一层的剪影染成纸的暗调（暖褐），落在纸面上：跟着纸转，不跟着纸往上抬（base 是纸面上的位移，锁定像素）；抬得越高越虚、离得越远
  function pelicanLiftShadow(c, D, o, env, base, at) {
    var L = o.lift, m = D.memo, k = env.k;
    if (!(L > 0.01)) return;
    if (!m.sil) {
      m.sil = env.canvas(D.w, D.h);
      var x = m.sil.getContext('2d'); x.drawImage(D.cv, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#3B3027'; x.fillRect(0, 0, D.w, D.h);
    }
    c.save();
    c.translate(at[0] + (base[0] + 6 * L) * k, at[1] + (base[1] + 10 * L) * k); if (o.rot) c.rotate(o.rot * Math.PI / 180); c.translate(-at[0], -at[1]);
    c.globalAlpha = 0.36 * Math.min(1, L * 1.5); c.filter = 'blur(' + ((1.2 + 7 * L) * k).toFixed(2) + 'px)';
    c.drawImage(m.sil, D.x, D.y, D.w, D.h);
    c.restore();
  }

  /* ---- 06 鹈鹕 · pelican-paste：贴一张剪好的纸 ----
     剪纸动画是一格一格拍的：纸从左上方悬着进来（多歪一点、大一点），一顿一顿地按到纸面上（n 格，越往后挪得越少），
     悬着时身下一团软的暖影，按平了影子收成图层里那道锐边小落影。纸不淡入：出现就是整张的。
     参数：dx dy 悬着时的位移（锁定像素）、rot 多歪的度数、s 大多少、n 走几格、lift 软影的浓淡（0 没有）。 */
  AE.lockupKind('pelican-paste', {
    ease: 'lin',
    pose: function (o, k) {
      var e = k.e, n = e.n || 4, q = k.p < 1 ? Math.pow(1 - Math.floor(k.p * n) / n, 2.2) : 0;
      o.dx = q * k.dv(e.dx, -14); o.dy = q * k.dv(e.dy, -22); o.rot = q * (e.rot || 0); o.s = 1 + q * k.dv(e.s, 0.08); o.lift = q * k.dv(e.lift, 1);
    },
    draw: function (c, D, o, env) {
      pelicanLiftShadow(c, D, o, env, [0, 0], [D.x + D.w / 2, D.y + D.h / 2]);
      env.paint(c, D, o);
    }
  });

  /* ---- 06 鹈鹕 · pelican-nib：笔尖落到起笔上，顺着贝塞尔路径一路画到它站的地方 ----
     前 place 那一段像贴纸一样一顿一顿地按到起笔上；之后一路滑过去（矢量是顺的，sway）：笔尖的尖始终在路上，
     笔身随路的起伏微微偏一点，到「法」后面正好立定。参数：path 路径（锁定坐标，按弧长等分，末点就是 tip）、tip、place（占这一层时长的比例）。
     墨线和沿线的英文用 pelican-ink 跟在笔尖后面（时刻取这一层滑的那一段）。 */
  AE.lockupKind('pelican-nib', {
    ease: 'lin',
    pose: function (o, k) {
      var e = k.e, P = e.path, tip = e.tip, g = e.place || 0.15, p = k.p, s = 0, L = 0;
      if (p < g) L = Math.pow(1 - Math.floor(p / g * 3) / 3, 2.2); else s = AE.ease.sway((p - g) / (1 - g));
      var pt = pelicanAt(P, s);
      o.at = tip; o.base = [pt[0] - tip[0], pt[1] - tip[1]];
      o.dx = o.base[0] - 10 * L; o.dy = o.base[1] - 18 * L;
      o.rot = (pelicanDir(P, s) - pelicanDir(P, 1)) * 0.8 - 9 * L; o.s = 1 + 0.06 * L; o.lift = L;
    },
    draw: function (c, D, o, env) {
      pelicanLiftShadow(c, D, o, env, o.base, env.at(o.at));
      env.paint(c, D, o);
    }
  });

  /* ---- 06 鹈鹕 · pelican-ink：跟着笔尖显出来 ----
     从左往右显出，边缘始终在笔尖身后 lag（锁定像素）处、软边 soft（锁定像素）：墨线就是笔尖刚走过的地方，沿线的斜体紧跟着。
     at、dur 和 pelican-nib 滑的那一段一样，path 同一条。 */
  AE.lockupKind('pelican-ink', {
    ease: 'sway',
    pose: function (o, k) {
      if (k.p >= 1) return;
      var e = k.e, l = k.l, sf = k.dv(e.soft, 6) / l.w, f = (pelicanAt(e.path, k.E)[0] - (e.lag || 0) - l.x) / l.w;
      o.clip = { type: 'wipe', dir: 'right', e: Math.max(0, f) / (1 + sf), soft: sf };
    }
  });

  /* ---- 04 B200 · nvidia-etch：一块覆铜板曝光、蚀刻，剩下 B200 ----
     先是一整块覆铜（box，锁定坐标；铜色和字面同一条色带 ramp，从 ramp_y[0] 到 ramp_y[1]），字藏在铜里，只看得出过孔和字边；
     前 show 那一段像曝光一样由暗到亮、亮过一点再落回；之后字外的铜被蚀刻掉：一片片不规则地化开，贴着字边的最后才没，露出板子和 B200。 */
  AE.lockupKind('nvidia-etch', {
    ease: 'lin',
    pose: function (o, k) {
      var t = AE.clamp(k.p / (k.e.show || 0.18));
      if (t < 1) { o.a = Math.min(1, t * 1.6); o.bright = 0.5 + 0.5 * t + 0.4 * Math.sin(Math.PI * t); }
    },
    draw: function (c, D, o, env) {
      var e = D.e, l = D.l, m = D.memo, show = e.show || 0.18;
      env.paint(c, D, o);
      if (o.p >= 1) return;
      if (!m.slab) {
        // 覆铜：字面那条铜色带 + 横向拉丝，字所在的地方挖掉（字自己在下面）
        var w = D.w, h = D.h, B = e.box || [l.x, l.y, l.x + l.w, l.y + l.h], p0 = env.at([B[0], B[1]]), p1 = env.at([B[2], B[3]]);
        var ry = e.ramp_y || [B[1], B[3]], y0 = env.at([0, ry[0]])[1] - D.y, y1 = env.at([0, ry[1]])[1] - D.y;
        m.slab = env.canvas(w, h);
        var sx = m.slab.getContext('2d'), gr = sx.createLinearGradient(0, y0, 0, y1);
        (e.ramp || [[0, '#FFE2CC'], [0.5, '#B9674B'], [1, '#7A3826']]).forEach(function (q) { gr.addColorStop(q[0], q[1]); });
        sx.fillStyle = gr; sx.fillRect(p0[0] - D.x, p0[1] - D.y, p1[0] - p0[0], p1[1] - p0[1]);
        var N = AE.lockupNoise('nvidia-etch-brush');
        for (var y = Math.floor(p0[1] - D.y); y < p1[1] - D.y; y++) {
          var n = N(0.5, y / env.k / 1.6) - 0.5;
          sx.fillStyle = n > 0 ? 'rgba(255,236,220,' + (n * 0.16).toFixed(3) + ')' : 'rgba(60,20,10,' + (-n * 0.2).toFixed(3) + ')';
          sx.fillRect(p0[0] - D.x, y, p1[0] - p0[0], 1);
        }
        var sd = sx.getImageData(0, 0, w, h), glyph = D.cv.getContext('2d').getImageData(0, 0, w, h).data, i;
        for (i = 0; i < w * h; i++) { var a = glyph[i * 4 + 3] / 255; sd.data[i * 4 + 3] *= 1 - AE.clamp((a - 0.8) / 0.17); }
        sx.putImageData(sd, 0, 0);
        // 蚀刻的先后：一片片的噪声，贴着字的地方最晚（字的剪影虚开当作“离字多近”）
        var bl = env.canvas(w, h), bx = bl.getContext('2d');
        bx.filter = 'blur(' + (12 * env.k).toFixed(2) + 'px)'; bx.drawImage(D.cv, 0, 0);
        var near = bx.getImageData(0, 0, w, h).data, N1 = AE.lockupNoise('nvidia-etch-a'), N2 = AE.lockupNoise('nvidia-etch-b');
        m.f = new Float32Array(w * h);
        for (var yy = 0; yy < h; yy++) {
          var ly = l.y + (yy + 0.5) * l.h / h;
          for (var xx = 0; xx < w; xx++) {
            var lx = l.x + (xx + 0.5) * l.w / w, q = yy * w + xx;
            m.f[q] = 1 - (0.62 * (0.65 * N1(lx / 18, ly / 18) + 0.35 * N2(lx / 7, ly / 7)) + 0.38 * near[q * 4 + 3] / 255);
          }
        }
      }
      var pe = Math.max(0, (o.p - show) / (1 - show)), v = 1 - (1 - pe) * (1 - pe);
      var left = AE.lockupReveal(D, env, 'nv-slab', function () { return m.f; }, 1.04 - 1.1 * v, 0.04, m.slab);
      // 剩下的铜有厚度：往右下挤出一道暗铜（和字的铜箔同一个方向），蚀刻出的坑和残片边上看得见
      env.paint(c, D, Object.assign({}, o, { dx: o.dx + 0.8, dy: o.dy + 1.8, bright: o.bright * 0.3 }), left);
      env.paint(c, D, o, left);
    }
  });

  /* ---- 04 B200 · nvidia-boot：晶粒通电，点阵从正中一格格亮起 ----
     box（锁定坐标）里 cols × rows 的格子按离 center 的远近一格格亮起（带一点随机 jitter），刚亮的那几格更亮一下。 */
  AE.lockupKind('nvidia-boot', {
    ease: 'lin',
    draw: function (c, D, o, env) {
      var e = D.e, l = D.l, B = e.box, nc = e.cols || 5, nr = e.rows || 12, jit = e.jitter == null ? 0.3 : e.jitter;
      var ct = e.center || [(B[0] + B[2]) / 2, (B[1] + B[3]) / 2], cw = (B[2] - B[0]) / nc, ch = (B[3] - B[1]) / nr;
      var field = function (w, h) {
        if (D.memo.f) return D.memo.f;
        var N = AE.lockupNoise('nvidia-boot'), f = new Float32Array(w * h), sx = l.w / w, sy = l.h / h, dmax = Math.hypot(0.8, 0.5);
        for (var y = 0; y < h; y++) {
          var j = Math.max(0, Math.min(nr - 1, Math.floor((l.y + (y + 0.5) * sy - B[1]) / ch)));
          for (var x = 0; x < w; x++) {
            var i = Math.max(0, Math.min(nc - 1, Math.floor((l.x + (x + 0.5) * sx - B[0]) / cw)));
            var d = Math.hypot((B[0] + (i + 0.5) * cw - ct[0]) / (B[2] - B[0]) * 1.6, (B[1] + (j + 0.5) * ch - ct[1]) / (B[3] - B[1]));
            f[y * w + x] = Math.min(1, d / dmax) * (1 - jit) + jit * N(i, j);
          }
        }
        return (D.memo.f = f);
      };
      var v = o.E * 1.01, on = AE.lockupReveal(D, env, 'nv-on', field, v, 0.004);
      env.paint(c, D, o, on);
      if (o.p >= 1 || v <= 0) return;
      // 刚亮的那几格（水位往回 0.12 以内的）再叠一遍，亮一下
      var old = AE.lockupReveal(D, env, 'nv-old', field, v - 0.12, 0.004), m = D.memo;
      if (!m.band) m.band = env.canvas(D.w, D.h);
      var bx = m.band.getContext('2d');
      bx.globalCompositeOperation = 'copy'; bx.drawImage(on, 0, 0); bx.globalCompositeOperation = 'destination-out'; bx.drawImage(old, 0, 0); bx.globalCompositeOperation = 'source-over';
      c.save(); c.globalCompositeOperation = 'lighter'; env.paint(c, D, Object.assign({}, o, { a: 0.5 }), m.band); c.restore();
    }
  });

  /* ---- 04 B200 · nvidia-print：丝印的刮板从上往下走一遍 ----
     白油墨的字（中文、NVIDIA、底线带、位号）由一把横着的刮板从 span[0] 刮到 span[1]（锁定 y）印上去；几层给同一个 span、同样的时刻，
     就是同一把刮板一次印完。soft 边缘的宽（锁定像素）。 */
  AE.lockupKind('nvidia-print', {
    ease: 'sway',
    pose: function (o, k) {
      if (k.p >= 1) return;
      var e = k.e, l = k.l, sp = e.span || [l.y, l.y + l.h], sf = k.dv(e.soft, 6) / l.h, f = (AE.lerp(sp[0], sp[1], k.E) - l.y) / l.h;
      o.clip = { type: 'wipe', dir: 'down', e: Math.max(0, f) / (1 + sf), soft: sf };
    }
  });

  /* ---- 04 B200 · nvidia-pulse：一个光点从晶粒下来、沿基线走线跑到信号灯 ----
     光点顺着 path（锁定坐标的折线：晶粒底 → 基线走线 → 灯前）起步慢、越跑越快，身后拖一小段亮尾；它跑过的走线留下这一层的亮。
     到灯前光点收掉，灯接着亮（led 那一层）。 */
  AE.lockupKind('nvidia-pulse', {
    ease: function (p) { return p * p * (1.6 - 0.6 * p); },
    pose: function (o, k) {
      if (k.p >= 1) return;
      // 光点在折线上走到哪儿：[x, y, 走向 dx, dy]（按弧长）
      var P = k.e.path, L = [0], i;
      for (i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      var goal = k.E * L[L.length - 1];
      for (i = 1; i < P.length - 1 && L[i] < goal; i++);
      var d = L[i] - L[i - 1] || 1, t = (goal - L[i - 1]) / d, ux = (P[i][0] - P[i - 1][0]) / d, uy = (P[i][1] - P[i - 1][1]) / d;
      var h = [P[i - 1][0] + ux * d * t, P[i - 1][1] + uy * d * t, ux, uy], l = k.l, sf = 10 / l.w, f = (h[0] - l.x) / l.w;
      o.clip = { type: 'wipe', dir: 'right', e: Math.max(0, f) / (1 + sf), soft: sf };
      o.head = h;
    },
    draw: function (c, D, o, env) {
      env.paint(c, D, o);
      if (!o.head || o.p >= 1) return;
      var k = env.k, h = o.head, p = env.at(h), a = Math.min(1, o.p * 8) * Math.min(1, (1 - o.p) * 10), tl = 42 * k;
      var q = [p[0] - h[2] * tl, p[1] - h[3] * tl];
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a;
      var g = c.createLinearGradient(q[0], q[1], p[0], p[1]);
      g.addColorStop(0, 'rgba(255,170,70,0)'); g.addColorStop(1, 'rgba(255,226,170,0.9)');
      c.strokeStyle = g; c.lineWidth = 3.2 * k; c.lineCap = 'round'; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(p[0], p[1]); c.stroke();
      var r = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], 16 * k);
      r.addColorStop(0, 'rgba(255,246,226,0.95)'); r.addColorStop(0.25, 'rgba(255,196,110,0.5)'); r.addColorStop(1, 'rgba(242,167,58,0)');
      c.fillStyle = r; c.fillRect(p[0] - 16 * k, p[1] - 16 * k, 32 * k, 32 * k);
      c.restore();
    }
  });

  /* ---- 05 天穹圣城 · citadel-rise：城往上长 ----
     这一层从下往上长出来：一道软的前沿从图层底边升到顶（落定曲线，先快后慢：字身很快读得出，塔尖最后慢慢探到顶），同时整块往上抬一点。
     cols 把这一层竖着切成几段（「天」「圣」「城」），一段比一段晚起、各长各的、一起到顶：一座跟一座。
     参数：dy 抬起的距离（锁定像素，默认 16）；soft 前沿的软边（锁定像素，默认 36）；
       cols [[这一段从哪个 x 起（锁定坐标）, 晚多少（占这一层进度）], …]，第一段从 0 起 */
  AE.lockupKind('citadel-rise', {
    pose: function (o, k) { o.dy = k.q * k.dv(k.e.dy, 16); },
    draw: function (c, D, o, env) {
      if (o.p >= 1) { env.paint(c, D, o); return; }
      var e = D.e, l = D.l, sx = D.w / l.w, sy = D.h / l.h, soft = Math.max(1, (e.soft == null ? 36 : e.soft) * sy), cols = e.cols || [[0, 0]];
      var m = D.memo.rise || (D.memo.rise = env.canvas(D.w, D.h)), x = m.getContext('2d');
      x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, D.w, D.h);
      for (var i = 0; i < cols.length; i++) {
        var x0 = i ? Math.max(0, Math.round((cols[i][0] - l.x) * sx)) : 0, x1 = i + 1 < cols.length ? Math.min(D.w, Math.round((cols[i + 1][0] - l.x) * sx)) : D.w;
        var d = cols[i][1] || 0, p = AE.clamp((o.p - d) / (1 - d));
        if (x1 <= x0 || p <= 0) continue;
        var top = D.h - AE.ease.land(p) * (D.h + soft);     // 前沿（图层像素）：再往上是还没长出来的
        x.save(); x.beginPath(); x.rect(x0, 0, x1 - x0, D.h); x.clip();
        x.drawImage(D.cv, 0, 0);
        var g = x.createLinearGradient(0, top, 0, top + soft);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
        x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(x0, 0, x1 - x0, D.h);
        x.restore();
      }
      env.paint(c, D, o, m);
    }
  });

  /* ---- 05 天穹圣城 · citadel-dawn：太阳从穹顶后面升起来 ----
     晨光圣轮从穹顶鼓座那条线后面往上升（线以下藏着，边上化开一小段）；升起来的同时，光刃从日轮一把把往外放出去。
     参数：c 日心（锁定坐标，也是鼓座那条线的高度）；r 日轮外环的半径（锁定像素，一开始只露到这里）；dy 从多低升起（锁定像素）；soft 光刃放出去的软边（占比） */
  AE.lockupKind('citadel-dawn', {
    ease: 'lin',
    pose: function (o, k) {
      var e = k.e, c = e.c, l = k.l, soft = k.dv(e.soft, 0.22);
      // 升：匀匀地上来、到位前慢下来（看得见它从线后面升起，不是原地淡出来）；光刃在升到一半时开始往外放
      var t = AE.clamp(k.p / 0.78), rise = 1 - (1 - t) * (1 - t), rays = AE.ease.sway(AE.clamp((k.p - 0.3) / 0.7));
      var R = Math.max(Math.hypot(c[0] - l.x, c[1] - l.y), Math.hypot(l.x + l.w - c[0], c[1] - l.y), Math.hypot(c[0] - l.x, l.y + l.h - c[1]), Math.hypot(l.x + l.w - c[0], l.y + l.h - c[1]));
      var e0 = Math.min(1, ((k.dv(e.r, 90) + 4) / R + soft) / (1 + soft));
      o.a = AE.clamp(k.p / 0.06); o.dy = (1 - rise) * k.dv(e.dy, 60);
      o.clip = k.p < 1 ? { type: 'radial', at: c, e: e0 + (1 - e0) * rays, soft: soft } : null;
    },
    draw: function (c, D, o, env) {
      if (o.p >= 1) { env.paint(c, D, o); return; }
      // 地平线（鼓座那条线）在图层画布上的位置：图层这一刻往下沉了 dy，线不动
      var sy = D.h / D.l.h, h0 = (D.e.c[1] + 3 - D.l.y) * sy - o.dy * env.k, h1 = h0 + 14 * sy;
      var m = D.memo.dawn || (D.memo.dawn = env.canvas(D.w, D.h)), x = m.getContext('2d');
      x.globalCompositeOperation = 'copy'; x.drawImage(D.cv, 0, 0);
      var g = x.createLinearGradient(0, h0, 0, h1);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
      x.globalCompositeOperation = 'source-over';
      env.paint(c, D, o, m);
    }
  });

  /* ---- 05 天穹圣城 · citadel-glass：穹顶的玻璃被晨光照透 ----
     肋间的玻璃从下往上亮起来（软的前沿），亮过头一点再落回水晶青；采光亭的两扇窗在最上面，最后透亮。
     参数：glow 亮过头多少（默认 0.9）；soft 前沿软边（占比，默认 0.6） */
  AE.lockupKind('citadel-glass', {
    pose: function (o, k) {
      o.a = Math.min(1, k.E * 1.6);
      o.clip = k.p < 1 ? { type: 'wipe', dir: 'up', e: k.E, soft: k.dv(k.e.soft, 0.6) } : null;
      o.bright = 1 + k.dv(k.e.glow, 0.9) * k.q;
    }
  });

  /* ---- 07 晴空水上乐园 · lido-roll：救生圈滚进来 ----
     从右边滚进来、停在原位：往左走多远就逆时针转多少（不打滑：转角 = 距离 / 半径），落定曲线减速停住。
     参数：dx 从多远滚来（锁定像素，默认 90）；r 圈的半径（锁定像素）；转轴是图层的 pivot（圈心） */
  AE.lockupKind('lido-roll', {
    pose: function (o, k) {
      var d = k.dv(k.e.dx, 90);
      o.a = Math.min(1, k.E * 2.2); o.dx = k.q * d; o.rot = k.q * d / k.dv(k.e.r, 65) * 180 / Math.PI; o.at = (k.l && k.l.pivot) || null;
    }
  });

  /* ---- 07 晴空水上乐园 · lido-tiles：一块块铺上去，水漫上来，水线下错开 ----
     马赛克墙一块砖一块砖地铺：铺砖的前沿从日心往外走（墙、字、LID 走同一道前沿），每块砖从自己的中心长满一格，早晚带一点散。
     水从底下涨上来：水漫过哪一行，那一行才错开半块（折射）；水线下的字没被水漫过时还对齐着、压暗成干的深青墨，漫过了才亮成池青。
     底板（pool）水线下的砖就是水：水涨到哪一行，哪一行才铺。
     参数（u 都是整段进度；at、dur 要盖住铺完、水涨完、错开完，模块里按砖算好）：
       grid 砖距（锁定像素）；o 起点（锁定坐标）；wave [u0, u1] 前沿从起点走到 rmax 远；tile 一块砖从中心长满用多少；jit 每块早晚的散；
       wl 水线（锁定 y，落在砖缝上）；shift [水线下第 0、1、2… 行往右错开多少（锁定像素）]；tide [u0, u1, y0] 水从 y0 涨到水线；
       lag 水漫过一行以后这一行错开用多少；pool 水线下的砖跟着水铺；dry 水还没漫过时水线下的砖压暗到多少（不给就不压） */
  (function () {
    function hash(i, j) { var h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 0xffff) / 65535; }
    function tideAt(e, y) {   // 水面涨到 y 的那一刻（整段进度）
      var t = e.tide, s = AE.clamp((t[2] - y) / (t[2] - e.wl)), a = 0, b = 1;
      for (var n = 0; n < 24; n++) { var mid = (a + b) / 2; if (AE.ease.sway(mid) < s) a = mid; else b = mid; }
      return t[0] + (t[1] - t[0]) * (a + b) / 2;
    }
    function shiftOf(e, j) { var jw = Math.round(e.wl / e.grid); return j < jw ? 0 : (e.shift[Math.min(e.shift.length - 1, j - jw)] || 0); }
    function rows(D) {        // 这一层里水线下的每一行：图层画布上的上下沿、错开多少、水漫过它的那一刻
      var e = D.e, l = D.l, P = e.grid, sy = D.h / l.h, out = [];
      for (var j = Math.max(Math.round(e.wl / P), Math.floor(l.y / P)); j * P < l.y + l.h; j++) {
        var y0 = Math.max(0, Math.round((j * P - l.y) * sy)), y1 = Math.min(D.h, Math.round(((j + 1) * P - l.y) * sy));
        if (y1 > y0) out.push({ y0: y0, y1: y1, shift: shiftOf(e, j), u: tideAt(e, (j + 0.5) * P) });
      }
      return out;
    }
    function field(D) {       // 每个像素什么时候显出来（占这一层进度）：它那块砖开始铺的时刻 + 离砖心多远（砖从中心长满）
      return function (w, h) {
        var e = D.e, l = D.l, P = e.grid, sx = w / l.w, sy = h / l.h, f = new Float32Array(w * h), o = e.o, jw = Math.round(e.wl / P);
        var w0 = e.wave[0], w1 = e.wave[1], gro = e.tile / e.dur;
        for (var py = 0; py < h; py++) {
          var Y = l.y + (py + 0.5) / sy, j = Math.floor(Y / P), sh = shiftOf(e, j), cy = (j + 0.5) * P, pool = e.pool && j >= jw, tu = pool ? tideAt(e, cy) : 0;
          for (var px = 0; px < w; px++) {
            var X = l.x + (px + 0.5) / sx, i = Math.floor((X - sh) / P), cx = (i + 0.5) * P + sh;
            var u = pool ? tu + e.jit * 0.5 * hash(i, j) : w0 + (w1 - w0) * Math.min(1, Math.hypot(cx - o[0], cy - o[1]) / e.rmax) + e.jit * hash(i, j);
            f[py * w + px] = (u - e.at) / e.dur + gro * Math.min(1, Math.max(Math.abs(X - cx), Math.abs(Y - cy)) / (P / 2));
          }
        }
        return f;
      };
    }
    AE.lockupKind('lido-tiles', {
      ease: 'lin',
      draw: function (c, D, o, env) {
        if (o.p >= 1) { env.paint(c, D, o); return; }
        var e = D.e, soft = 0.35 * e.tile / e.dur;
        var R = AE.lockupReveal(D, env, 'lido', field(D), o.p * (1 + soft), soft);
        var M = D.memo.lidoRows || (D.memo.lidoRows = rows(D));
        var moving = M.filter(function (r) { return o.u < r.u + e.lag; });
        if (!moving.length) { env.paint(c, D, o, R); return; }
        // 水线下：水还没漫过的行退回对齐、压暗（干的砖）；漫过以后错开半块、亮回池青
        var out = D.memo.lidoOut || (D.memo.lidoOut = env.canvas(D.w, D.h)), x = out.getContext('2d'), sx = D.w / D.l.w, dry = e.dry == null ? 1 : e.dry;
        x.globalCompositeOperation = 'copy'; x.drawImage(R, 0, 0); x.globalCompositeOperation = 'source-over';
        moving.forEach(function (r) {
          var s = AE.ease.sway(AE.clamp((o.u - r.u) / e.lag)), b = dry + (1 - dry) * s;
          x.clearRect(0, r.y0, D.w, r.y1 - r.y0);
          if (b < 0.999) x.filter = 'brightness(' + b.toFixed(3) + ')';
          x.drawImage(R, 0, r.y0, D.w, r.y1 - r.y0, -r.shift * (1 - s) * sx, r.y0, D.w, r.y1 - r.y0);
          x.filter = 'none';
        });
        env.paint(c, D, o, out);
      }
    });
  })();

  /* ---- 02 秋庭观星画室：一页木版套色——霞一条条、淡版、天球、字一块块印上去（色顺着版木的横纹吃进纸里，馬連推过去的方向就是显出来的方向）；
     浑天仪的架子、赤道环、黄道环被拨了一下，各自转回到对齐，黄道环最后停准、正好接上「星」日里那一横；最后朱印压上 ---- */
  // 套色：dir 馬連推的方向（'right' 从左往右 · 'left' · 'down' · 'up'）；grain 版木纹的分量（0–1）；soft 吃墨的软边
  AE.lockupKind('autumn-print', { ease: 'lin', pose: function (o, k) { o.a = k.p > 0 ? 1 : 0; },
    draw: function (c, D, o, env) {
      if (o.p >= 1) { env.paint(c, D, o); return; }
      var e = D.e, soft = e.soft || 0.2, gw = e.grain == null ? 0.5 : e.grain, dir = e.dir || 'right';
      env.paint(c, D, o, AE.lockupReveal(D, env, 'print', function (w, h) {
        var n1 = AE.lockupNoise('autumn-print:' + D.l.id), n2 = AE.lockupNoise('autumn-grain:' + D.l.id), f = new Float32Array(w * h), s = env.k;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var b = dir === 'right' ? x / w : dir === 'left' ? 1 - x / w : dir === 'down' ? y / h : 1 - y / h;
          // 馬連的斑（一块块吃得深浅不一）加版木的纹（横向长纹，纹路随木头微微起伏）
          var yy = y / s + 9 * n2(x / (160 * s) + 7.3, y / (60 * s));
          var g = 0.72 * n1(x / (40 * s), y / (26 * s)) + 0.28 * n2(x / (110 * s), yy / 5.5);
          f[y * w + x] = (1 - gw) * b + gw * ((g - 0.5) * 1.8 + 0.5);
        }
        return f;
      }, AE.ease.sway(o.p) * (1 + soft) + (o.p > 0 ? 0.04 : 0), soft));
    } });
  // 铜环转到对齐：绕 from 从 angle 度转回 0，起步快、慢慢停准（环被拨了一下，转到刻度对上）；fade 以前由透明到实
  var autumnSettle = bezier(0.22, 0.62, 0.28, 1);
  AE.lockupKind('autumn-align', { ease: autumnSettle, pose: function (o, k) {
    o.a = AE.clamp(k.p / k.dv(k.e.fade, 0.18)); o.rot = k.q * k.dv(k.e.angle, -30); o.at = k.e.from || (k.l && k.l.pivot) || null;
  } });

  /* ======== 各题的入场方式到此为止 ======== */

  function polyLen(p) { var L = 0; for (var i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function cutAt(p, len) {   // 从起点量 len 长的一段
    var out = [p[0]], acc = 0;
    for (var i = 1; i < p.length; i++) {
      var d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (acc + d >= len) { var k = d ? (len - acc) / d : 0; out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k]); return out; }
      acc += d; out.push(p[i]);
    }
    return out;
  }
  function inRects(x, y, rects, pad) { for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (x > r[0] - pad && x < r[2] + pad && y > r[1] - pad && y < r[3] + pad) return true; } return false; }
  function splitAvoid(p, rects, pad) {   // 碰到要读的小字就断开
    if (!rects || !rects.length) return [p];
    var out = [], cur = [];
    for (var i = 0; i < p.length; i++) {
      if (inRects(p[i][0], p[i][1], rects, pad)) { if (cur.length > 1) out.push(cur); cur = []; } else cur.push(p[i]);
    }
    if (cur.length > 1) out.push(cur);
    return out;
  }
  function densify(p, step) {
    var out = [p[0]];
    for (var i = 1; i < p.length; i++) {
      var d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]), n = Math.max(1, Math.ceil(d / step));
      for (var k = 1; k <= n; k++) out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k / n, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k / n]);
    }
    return out;
  }
  /* 几何线的笔画清单：{ strokes: [{ pts, rgb, w, stops, z, dash, cap, colors }], labels }。colors：多色的线（如虹），[[位置, 颜色, 不透明度]]。
     o = { to: [x, y] 伸到画面里的那一点（锁定坐标）, avoid: [[x0, y0, x1, y1]] 要断开的区域（锁定坐标）, progress: 0–1 画出来多少 } */
  AE.lockupStrokes = function (key, o) {
    o = o || {};
    var it = AE.lockupItem(key), g = it && it.geo, out = [], labels = [];
    if (!g) return { strokes: out, labels: labels };
    (g.strokes || []).forEach(function (s) { out.push({ pts: s.pts, rgb: s.rgb, colors: s.colors, w: s.w || 1, stops: s.stops, z: s.z || 'front', dash: s.dash, cap: s.cap }); });
    if (g.out) {
      // 伸进画面的那一根：从锚点顺着方向出去；给了 o.to 就接到那一点。走法 a.route：
      //   'curve'（默认）一道顺滑的线到那一点，再往前多走一小段断开收尾；
      //   'swing' 先顺着方向出去 a.lead，再平着走、到那一点的上方才落下去（不穿过左栏的正文）；
      //   'elbow' 先顺着方向出去 a.lead，拐成水平走到那一点的正上方，再竖直落下（蓝图上的尺寸线），刻度只在最后一段
      var a = g.out, p0 = [a.x, a.y], pts, tickFrom = 0;
      if (o.to && a.route === 'elbow') {
        var q1 = [p0[0] + a.dx * (a.lead || 24), p0[1] + a.dy * (a.lead || 24)];
        pts = [p0, q1, [o.to[0], q1[1]], o.to];
        tickFrom = polyLen(pts.slice(0, 3)) + 6;
      } else if (o.to && a.route === 'swing') {
        var s1 = [p0[0] + a.dx * (a.lead || 30), p0[1] + a.dy * (a.lead || 30)], s2 = [o.to[0], s1[1]], s3 = o.to;
        pts = [];
        for (var si = 0; si <= 64; si++) { var st = si / 64, sm = 1 - st; pts.push([sm * sm * sm * p0[0] + 3 * sm * sm * st * s1[0] + 3 * sm * st * st * s2[0] + st * st * st * s3[0], sm * sm * sm * p0[1] + 3 * sm * sm * st * s1[1] + 3 * sm * st * st * s2[1] + st * st * st * s3[1]]); }
        var se = pts[pts.length - 1], sq = pts[pts.length - 2], sl = Math.hypot(se[0] - sq[0], se[1] - sq[1]) || 1;
        if (a.overshoot !== false) pts.push([se[0] + (se[0] - sq[0]) / sl * 40, se[1] + (se[1] - sq[1]) / sl * 40]);
      } else if (o.to) {
        var L = Math.hypot(o.to[0] - p0[0], o.to[1] - p0[1]), p1 = [p0[0] + a.dx * L * 0.45, p0[1] + a.dy * L * 0.45], p3 = o.to;
        var p2 = [p3[0] - (p3[0] - p1[0]) * 0.3, p3[1] - (p3[1] - p1[1]) * 0.3];
        pts = [];
        for (var i = 0; i <= 64; i++) { var t = i / 64, m = 1 - t; pts.push([m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]]); }
        var e = pts[pts.length - 1], q = pts[pts.length - 2], el = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1;
        if (a.overshoot !== false) pts.push([e[0] + (e[0] - q[0]) / el * L * 0.12, e[1] + (e[1] - q[1]) / el * L * 0.12]);
      } else pts = [p0, [p0[0] + a.dx * a.len, p0[1] + a.dy * a.len]];
      pts = densify(pts, 6);
      var total = polyLen(pts);
      out.push({ pts: pts, rgb: a.rgb, w: a.w || 1, stops: a.stops, z: a.z || 'front', dash: a.dash || (a.tail === false ? null : [Math.max(0, total - 45), 8, 14, 7, 6, 9999]), cap: a.cap });
      if (a.ticks) {
        for (var s = tickFrom + a.ticks.every; s < total - 30; s += a.ticks.every) {
          var c1 = cutAt(pts, s), pe = c1[c1.length - 1], pb = c1[c1.length - 2] || pts[0], tl = Math.hypot(pe[0] - pb[0], pe[1] - pb[1]) || 1;
          var nx = -(pe[1] - pb[1]) / tl, ny = (pe[0] - pb[0]) / tl, k = a.ticks.len;
          out.push({ pts: [[pe[0] - nx * k, pe[1] - ny * k], [pe[0] + nx * k, pe[1] + ny * k]], rgb: a.rgb, w: a.ticks.w || a.w || 1, stops: [[0, 0.6], [1, 0.6]], z: 'front', tick: s / total });
        }
      }
      if (a.label) { var le = cutAt(pts, total * (a.label.at || 0.8)); le = le[le.length - 1]; labels.push({ x: le[0] + (a.label.dx || 0), y: le[1] + (a.label.dy || 0), text: a.label.text, rgb: a.rgb }); }
    }
    // 断开与进度
    var pr = o.progress == null ? 1 : o.progress, res = [];
    out.forEach(function (s) {
      if (s.tick != null) { if (pr >= s.tick + 0.04) res.push(s); return; }
      var p = pr >= 1 ? s.pts : cutAt(densify(s.pts, 4), polyLen(s.pts) * pr);
      if (p.length < 2) return;
      splitAvoid(o.avoid ? densify(p, 3) : p, o.avoid, 14).forEach(function (q2) { res.push(Object.assign({}, s, { pts: q2 })); });
    });
    return { strokes: res, labels: pr >= 0.92 ? labels : [] };
  };
  /* 几何线画成 SVG 内容（z: 'back' 字后 / 'front' 字前），页面放进一个 overflow:visible 的 <svg> */
  AE.lockupGeoSVG = function (key, z, o) {
    o = o || {};
    var r = AE.lockupStrokes(key, o), id = (o.id || key.replace(/[^a-z0-9]/gi, '')) + z, n = 0, defs = '', body = '';
    r.strokes.filter(function (s) { return s.z === z; }).forEach(function (s) {
      var a = s.pts[0], b = s.pts[s.pts.length - 1], gid = id + 'g' + (n++);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) b = [a[0] + 1, a[1]];
      defs += '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + f2(a[0]) + '" y1="' + f2(a[1]) + '" x2="' + f2(b[0]) + '" y2="' + f2(b[1]) + '">' +
        (s.colors ? s.colors.map(function (st) { return '<stop offset="' + st[0] + '" stop-color="' + st[1] + '" stop-opacity="' + f2(st[2]) + '"/>'; }).join('')
          : (s.stops || [[0, 0.42], [1, 0.42]]).map(function (st) { return '<stop offset="' + st[0] + '" stop-color="rgb(' + s.rgb + ')" stop-opacity="' + f2(st[1]) + '"/>'; }).join('')) + '</linearGradient>';
      body += '<path d="M' + s.pts.map(function (p) { return f2(p[0]) + ' ' + f2(p[1]); }).join('L') + '" fill="none" stroke="url(#' + gid + ')" stroke-width="' + s.w + '"' +
        (s.dash ? ' stroke-dasharray="' + s.dash.map(f2).join(' ') + '"' : '') + (s.cap ? ' stroke-linecap="' + s.cap + '"' : '') + '/>';
    });
    if (z === 'front') r.labels.forEach(function (l) {
      body += '<text x="' + f2(l.x) + '" y="' + f2(l.y) + '" fill="rgba(' + l.rgb + ',.8)" style="font:500 19px \'AE Didone\', serif;letter-spacing:.2em">' + l.text + '</text>';
    });
    return '<defs>' + defs + '</defs>' + body;
  };
  /* 星芒（锁定里唯一的一颗）：细长的十字芒、亮核、一圈窄暖晕。o = { long, tall, a, id } */
  AE.glintSVG = function (x, y, s, o) {
    o = o || {};
    var a = o.a == null ? 1 : o.a, id = 'gl' + (o.id || Math.round(x) + '_' + Math.round(y)), L = s * (o.long || 2.6), Tl = s * (o.tall || 1.9), w = s * 0.09;
    function lg(gid, len) { return '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + f2(-len) + '" x2="' + f2(len) + '" y1="0" y2="0"><stop offset="0" stop-color="#FFF0D2" stop-opacity="0"/><stop offset=".5" stop-color="#FFF6E2" stop-opacity="' + a + '"/><stop offset="1" stop-color="#FFF0D2" stop-opacity="0"/></linearGradient>'; }
    function ray(len, wid, ang, gid) { return '<path transform="translate(' + f2(x) + ' ' + f2(y) + ') rotate(' + ang + ')" d="M' + f2(-len) + ' 0L0 ' + f2(-wid) + 'L' + f2(len) + ' 0L0 ' + f2(wid) + 'Z" fill="url(#' + gid + ')"/>'; }
    return '<defs><radialGradient id="' + id + 'h"><stop offset="0" stop-color="#FFECC8" stop-opacity="' + f2(0.55 * a) + '"/><stop offset=".25" stop-color="#FFD6A0" stop-opacity="' + f2(0.18 * a) + '"/><stop offset="1" stop-color="#FFC88C" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'c"><stop offset="0" stop-color="#FFF8EC"/><stop offset="1" stop-color="#FFF0D7" stop-opacity="0"/></radialGradient>' +
      lg(id + 'l', L) + lg(id + 't', Tl) + lg(id + 'd', s * 0.7) + '</defs>' +
      '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + f2(s * 1.6) + '" fill="url(#' + id + 'h)"/>' +
      ray(L, w, 0, id + 'l') + ray(Tl, w, 90, id + 't') + ray(s * 0.7, s * 0.05, 45, id + 'd') + ray(s * 0.7, s * 0.05, -45, id + 'd') +
      '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + f2(s * 0.22) + '" fill="url(#' + id + 'c)"/>';
  };
  /* 编号小标：编号 Didone 斜体 + 一小段发丝 + 类别宋体 + 英文小型大写（样式在 components.css .ae-lk-tag） */
  AE.lockupTag = function (d, tone) {
    return '<div class="ae-lk-tag' + (tone === 'ink' ? ' is-ink' : '') + '"><span class="no">' + d.no + '</span><i class="hr"></i><span class="cn">' + d.cat + '</span><span class="en">' + (d.catEn || '') + '</span></div>';
  };
  /* 网页用的 WebP：每一张图层和小形态旁边都有一张同名的 .webp（同尺寸、有损压缩带透明，约为 PNG 的五分之一）。清单里的 file 换后缀即可 */
  AE.lockupWebp = function (f) { return f.replace(/\.png$/, '.webp'); };
  /* 一件锁定的 HTML（网站页首、核对图），静止的样子。图层按清单从后往前叠，字后的几何线插在第一张要读的图层（text、hero、en）前面，
     字前的几何线和矢量星芒在最上面。
     o = { base: lockups 目录的地址（以 / 结尾）, form: 'full'（默认）| 'mini' | 'mini-ink' | 'stamp' | 'stamp-blind',
           scale: 缩放, to, avoid（几何线，见上）, tag: true 时按 AE.DIRS 写编号小标, webp: true 用网页的 WebP 图层, id }。返回 { html, w, h, item } */
  AE.lockup = function (key, o) {
    o = o || {};
    var it = AE.lockupItem(key);
    if (!it) return null;
    var base = o.base || '', k = o.scale || 1, form = o.form || 'full', d = AE.dir(key) || {};
    var file = function (f) { return base + (o.webp ? AE.lockupWebp(f) : f); };
    if (form !== 'full') {
      var fm = it.forms[form];
      return { w: fm.w * k, h: fm.h * k, item: it, html: '<span class="ae-lockup is-' + form + '" role="img" aria-label="' + (d.title || key) + '" style="display:inline-block;position:relative;width:' + f2(fm.w * k) + 'px;height:' + f2(fm.h * k) + 'px">' +
        '<img alt="" src="' + file(fm.file) + '" style="display:block;width:100%;height:100%"></span>' };
    }
    function img(l) { return '<img class="ae-lk-' + l.role + '" alt="" src="' + file(l.file) + '" style="position:absolute;left:' + l.x + 'px;top:' + l.y + 'px;width:' + l.w + 'px;height:' + l.h + 'px">'; }
    function svg(z) { return '<svg class="ae-lk-geo is-' + z + '" width="' + it.w + '" height="' + it.h + '" viewBox="0 0 ' + it.w + ' ' + it.h + '" style="position:absolute;left:0;top:0;overflow:visible">' + AE.lockupGeoSVG(key, z, { to: o.to, avoid: o.avoid, id: o.id }) + '</svg>'; }
    var html = '', backDone = false;
    it.layers.forEach(function (l) {
      if (!backDone && AE.LOCKUP_READ.indexOf(l.role) >= 0) { html += svg('back'); backDone = true; }
      html += img(l);
    });
    html += svg('front');
    if (it.star) html += '<svg class="ae-lk-star" width="' + it.w + '" height="' + it.h + '" style="position:absolute;left:0;top:0;overflow:visible">' + AE.glintSVG(it.star.x, it.star.y, it.star.s, Object.assign({ id: (o.id || '') + key.replace(/[^a-z0-9]/gi, '') }, it.star)) + '</svg>';
    if (o.tag && it.tag) html += '<div class="ae-lk-tagpos" style="position:absolute;left:' + it.tag.x + 'px;top:' + it.tag.y + 'px">' + AE.lockupTag(d, it.tag.tone || (it.ground === 'light' ? 'ink' : '')) + '</div>';
    return {
      w: it.w * k, h: it.h * k, item: it,
      html: '<div class="ae-lockup" role="img" aria-label="' + (d.title || key) + '" style="position:relative;width:' + f2(it.w * k) + 'px;height:' + f2(it.h * k) + 'px">' +
        '<div class="ae-lk-inner" style="position:absolute;left:0;top:0;width:' + it.w + 'px;height:' + it.h + 'px;transform:scale(' + k + ');transform-origin:0 0">' + html + '</div></div>'
    };
  };

  /* ---------- 星线进度条 ----------
     o = { cur: 当前题序 1–10（0 = 还没开始）, prog: 当前题内走过的比例, missing: [题序], done: 全部走完,
           mode: 'master'（介绍页、点评、汇总）| 'work'（作品播放时：星缩成点、不写字、线下只垫一道暗晕）,
           label: 是否写「01/ 题名」, accent: 定位环颜色 }
     画法：十颗四角星串在一根 2px 的线上，星在每题那一段的中点；走过的星点亮（浅金），
     没有作品的星只描边、那一段用点线（云遮，未观测）；全部走完，整条线连成一个星座。 */
  AE.progress = function (o) {
    o = o || {};
    var x0 = 96, x1 = 1824, y = o.y || 1032, n = AE.DIRS.length, sw = (x1 - x0) / n, cur = o.cur || 0, miss = o.missing || [];
    var work = o.mode === 'work', acc = o.accent || '#DE6B34';
    var X = function (i) { return x0 + sw * (i - 0.5); };
    var walk = o.done ? x1 : (cur ? x0 + sw * (cur - 1) + sw * AE.clamp(o.prog || 0) : x0);
    var s = '';
    if (work) s += '<defs><filter id="pgsh" x="-5%" y="-200%" width="110%" height="500%"><feGaussianBlur stdDeviation="5"/></filter></defs>' +
      '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="rgba(5,7,10,.5)" stroke-width="16" filter="url(#pgsh)"/>';
    for (var i = 1; i <= n; i++) {
      var a = x0 + sw * (i - 1), b = a + sw, m = miss.indexOf(i) >= 0;
      var wa = Math.min(b, Math.max(a, walk));
      if (m) {
        for (var dx = a + 5; dx < b; dx += 10) s += '<circle cx="' + dx.toFixed(1) + '" cy="' + y + '" r="1.6" fill="rgba(233,220,205,' + (dx < walk ? .8 : .5) + ')"/>';
      } else {
        if (wa > a) s += '<line x1="' + a.toFixed(1) + '" y1="' + y + '" x2="' + wa.toFixed(1) + '" y2="' + y + '" stroke="rgba(233,220,205,.86)" stroke-width="2.6"/>';
        if (wa < b) s += '<line x1="' + wa.toFixed(1) + '" y1="' + y + '" x2="' + b.toFixed(1) + '" y2="' + y + '" stroke="rgba(233,220,205,.42)" stroke-width="2"/>';
      }
    }
    for (var k = 0; k <= n; k++) {
      var tx = x0 + sw * k;
      s += '<line x1="' + tx.toFixed(1) + '" y1="' + (y - 12) + '" x2="' + tx.toFixed(1) + '" y2="' + y + '" stroke="rgba(233,220,205,' + (tx <= walk ? .7 : .42) + ')" stroke-width="2"/>';
    }
    for (i = 1; i <= n; i++) {
      var xi = X(i), mm = miss.indexOf(i) >= 0, past = o.done || i < cur, now = i === cur && !o.done;
      var sz = work ? 14 : (now ? 26 : 22), hgt = sz * 1.2;
      var path = root.AEOrn.star4(xi, y, sz, hgt);
      if (mm) {
        s += '<path d="' + path + '" fill="#0D1420" stroke="rgba(233,220,205,' + (work ? .5 : .7) + ')" stroke-width="2"/>';
      } else if (now) {
        s += '<path d="' + path + '" fill="#F0EADF"/>';
      } else if (past) {
        s += '<path d="' + path + '" fill="#E4D2A0" opacity="' + (work ? .7 : 1) + '"/>';
      } else {
        s += '<path d="' + path + '" fill="rgba(233,220,205,' + (work ? .4 : .5) + ')"/>';
      }
    }
    if (cur && !o.done) {
      var rc = X(cur);
      s += '<circle cx="' + rc.toFixed(1) + '" cy="' + y + '" r="' + (work ? 13 : 19) + '" fill="none" stroke="' + acc + '" stroke-width="2.6"/>';
      if (o.label !== false && !work) {
        var d = AE.DIRS[cur - 1], right = cur <= 7, lx = right ? rc - 6 : rc + 6;
        s += '<text x="' + lx.toFixed(1) + '" y="' + (y - 34) + '" text-anchor="' + (right ? 'start' : 'end') + '" class="ae-pg-label">' +
          '<tspan class="no">' + d.no + '/</tspan><tspan dx="12">' + (o.name || d.title) + '</tspan></text>';
      }
    }
    return '<svg class="ae-progress" viewBox="0 0 1920 1080" width="1920" height="1080" aria-hidden="true">' + s + '</svg>';
  };

  /* ---------- 观测卡（票）：票面写这一题的题材字，票根写这一题故事里的动作 ----------
     o = { face: 票面 HTML, verb: 动作, deep: 票根实底色, bar: 左缘色条, punched: 0–1（打孔进度）, tear: 0–1 } */
  AE.ticket = function (o) {
    o = o || {};
    var holeR = 15 * AE.ease.land(AE.clamp(o.punched || 0));
    var hole = holeR > 0.5 ? '<i class="hole" style="width:' + (holeR * 2).toFixed(1) + 'px;height:' + (holeR * 2).toFixed(1) + 'px"></i>' : '<i class="mark"></i>';
    return '<div class="ae-ticket" style="--tk-deep:' + (o.deep || '#74321E') + ';--tk-bar:' + (o.bar || o.deep || '#74321E') + '">' +
      '<div class="face ae-paper">' + (o.face || '') + '</div>' +
      '<div class="perf"></div>' +
      '<div class="stub"><span class="verb">' + (o.verb || '入场') + '</span>' + hole + '</div></div>';
  };

  /* ---------- 评语字幕：按句出现 ----------
     把一段文字按句末标点切成句子，每句一个 inline span（不拆字，断行交给 line-break:strict）。
     state(t, times)：times[i] 是第 i 句开始的时刻（配音时间表 sentences[i].start + 语音提示点 t）；
     还没到的句子不显示，正在读的句子暖白，读完的退到 --ae-text-2；新的一句 0.2s 从虚到实。 */
  AE.splitSentences = function (text) {
    var out = [], cur = '';
    Array.from(text).forEach(function (ch, i, arr) {
      cur += ch;
      if ('。！？!?'.indexOf(ch) >= 0 && '」』”）)'.indexOf(arr[i + 1] || '') < 0) { out.push(cur); cur = ''; }
    });
    if (cur) out.push(cur);
    return out;
  };
  AE.subtitle = function (el, text) {
    var ss = AE.splitSentences(text);
    el.innerHTML = ss.map(function (s, i) { return '<span class="s" data-i="' + i + '">' + s + '</span>'; }).join('');
    return {
      sentences: ss,
      state: function (t, times, end) {
        el.querySelectorAll('.s').forEach(function (sp, i) {
          var t0 = times[i], t1 = i + 1 < times.length ? times[i + 1] : (end == null ? Infinity : end);
          var p = AE.prog(t, t0, 0.2), e = AE.ease.land(p);
          sp.classList.toggle('done', t >= t1);
          sp.style.opacity = t < t0 ? '0' : (p >= 1 ? '' : e.toFixed(3));
          sp.style.filter = (t >= t0 && p < 1) ? 'blur(' + ((1 - e) * 6).toFixed(2) + 'px)' : '';
        });
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
