/* =====================================================================
   textures.js — 全部贴图均由 Canvas 程序化生成（无外部资源依赖）
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;

  /* ---------- noise ---------- */
  function h2(x, y, s) {
    let n = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967295;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h2(xi, yi, s), b = h2(xi + 1, yi, s);
    const c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  }
  function fbm(x, y, s, oct = 4, lac = 2, gain = 0.5) {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * vnoise(x * f, y * f, s + i * 37);
      norm += amp; amp *= gain; f *= lac;
    }
    return sum / norm;
  }

  /* ---------- canvas helpers ---------- */
  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }
  function ctx2d(c) { return c.getContext('2d'); }
  function tex(canvas, rx = 1, ry, srgb = true) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry === undefined ? rx : ry);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
  function pixTex(size, fn) {
    const c = cv(size);
    const g = ctx2d(c);
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const o = fn(x, y, x / size, y / size);
        d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o.length > 3 ? o[3] : 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function mix(c1, c2, t) {
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
  }
  function rgb(r, g, b) { return [r, g, b]; }

  const FONT = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",sans-serif';
  const SERIF = '"Yu Mincho","MS Mincho","Songti SC",serif';

  /* =====================================================================
     地面 / 混凝土
     ===================================================================== */
  function concreteCanvas(size, opt) {
    opt = opt || {};
    const base = opt.base || [214, 214, 208];
    const dark = opt.dark || [150, 155, 152];
    const stain = opt.stain || [120, 126, 118];
    return pixTex(size, (x, y, u, v) => {
      const s = size / 64;
      let n = fbm(u * 14, v * 14, 11, 4);
      let n2 = fbm(u * 46, v * 46, 27, 3);
      let c = mix(base, dark, n * 0.45);
      c = mix(c, dark, n2 * 0.18);
      // 大块水渍
      const st = fbm(u * 3.2 + 4, v * 3.2, 71, 3);
      if (st > 0.58) c = mix(c, stain, (st - 0.58) * 1.5 * (opt.stainAmt === undefined ? 0.55 : opt.stainAmt));
      // 细麻点
      const sp = h2(x, y, 5);
      if (sp > 0.982) c = mix(c, [120, 122, 118], 0.55);
      else if (sp < 0.012) c = mix(c, [244, 244, 238], 0.5);
      // 淡淡横向水痕
      const band = Math.sin(v * Math.PI * 9 + n * 3) * 0.5 + 0.5;
      c = mix(c, dark, band * 0.035);
      return c;
    });
  }

  /* 底座外壁：粗砌混凝土块 */
  function blockWallCanvas(size) {
    const c = pixTex(256, (x, y, u, v) => {
      const rows = 4;
      const row = Math.floor(v * rows);
      const off = (row % 2) * 0.5;
      const cols = 3;
      const bu = (u * cols + off) % 1;
      const bv = (v * rows) % 1;
      const j = h2(Math.floor(u * cols + off), row, 21);
      let base = mix([198, 200, 196], [166, 172, 170], j * 0.75);
      const n = fbm(u * 22, v * 22, 13, 4);
      base = mix(base, [150, 158, 156], n * 0.34);
      const fine = fbm(u * 70, v * 70, 31, 2);
      base = mix(base, [178, 184, 180], fine * 0.22);
      // 灰缝
      const seam = Math.min(bu, 1 - bu) < 0.018 || bv < 0.035 || bv > 0.965;
      if (seam) base = mix(base, [138, 146, 144], 0.66);
      // 底部潮痕
      const damp = smoothstepLocal(0.14, 0.0, v);
      base = mix(base, [124, 140, 134], damp * 0.5);
      // 泛碱
      const salt = fbm(u * 9, v * 9 + 4, 47, 3);
      if (salt > 0.66) base = mix(base, [228, 230, 222], (salt - 0.66) * 1.1);
      return base;
    });
    return c;
  }
  function smoothstepLocal(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  /* 岸壁：混凝土砌块 + 潮位线 + 藤壶 + 牡蛎 */
  function seawallCanvas(size) {
    const c = pixTex(256, (x, y, u, v) => {
      const rowH = 1 / 8;
      const row = Math.floor(v / rowH);
      const off = (row % 2) * 0.5;
      const bu = (u * 4 + off) % 1;
      const bv = (v % rowH) / rowH;
      let base = [196, 196, 188];
      const j = h2(Math.floor(u * 4 + off), row, 3);
      base = mix(base, [160, 164, 158], j * 0.45);
      const n = fbm(u * 26, v * 26, 9, 4);
      base = mix(base, [142, 148, 142], n * 0.3);
      // 砌块缝
      const seam = Math.min(bu, 1 - bu) < 0.022 || bv < 0.035 || bv > 0.965;
      if (seam) base = mix(base, [116, 120, 116], 0.62);
      // 潮位线（深青绿 + 褐）
      const tide1 = Math.exp(-Math.pow((v - 0.26) / 0.055, 2));
      const tide2 = Math.exp(-Math.pow((v - 0.40) / 0.085, 2));
      const tide3 = Math.exp(-Math.pow((v - 0.13) / 0.03, 2));
      base = mix(base, [78, 96, 86], tide1 * 0.75);
      base = mix(base, [104, 108, 88], tide2 * 0.42);
      base = mix(base, [60, 78, 72], tide3 * 0.5);
      // 藤壶 / 牡蛎白点
      const b = fbm(u * 70, v * 70, 55, 2);
      if (b > 0.80) base = mix(base, [232, 228, 214], (b - 0.80) * 4.0);
      // 藻类绿
      const alg = fbm(u * 18, v * 18 + 3, 91, 3);
      if (alg > 0.62 && v < 0.46) base = mix(base, [74, 104, 76], (alg - 0.62) * 1.5);
      return base;
    });
    return c;
  }

  /* 白色船漆 */
  function hullCanvas(size) {
    return pixTex(256, (x, y, u, v) => {
      let base = [238, 240, 236];
      const n = fbm(u * 18, v * 18, 41, 3);
      base = mix(base, [206, 212, 210], n * 0.28);
      // 钢板拼缝
      const seam = (Math.abs(((v * 7) % 1) - 0.5) > 0.47) || (Math.abs(((u * 3) % 1) - 0.5) > 0.487);
      if (seam) base = mix(base, [188, 196, 196], 0.5);
      // 锈斑
      const r = fbm(u * 9, v * 9 + 12, 77, 4);
      if (r > 0.66) base = mix(base, [166, 106, 66], Math.min(1, (r - 0.66) * 3.4) * 0.85);
      const r2 = fbm(u * 22, v * 22 + 40, 13, 3);
      if (r2 > 0.78) base = mix(base, [140, 84, 54], (r2 - 0.78) * 2.4 * 0.6);
      // 水线污渍
      if (v > 0.72) base = mix(base, [126, 140, 128], (v - 0.72) * 1.1);
      return base;
    });
  }

  /* 木板 */
  function woodCanvas(size, tint) {
    const t = tint || [172, 138, 100];
    return pixTex(size, (x, y, u, v) => {
      const plank = Math.floor(v * 6);
      const pv = (v * 6) % 1;
      const j = h2(plank, 3, 17);
      let base = mix(t, [t[0] * 0.78, t[1] * 0.78, t[2] * 0.8], j * 0.5);
      const g = fbm(u * 60, (v * 6 + plank * 3.3) * 8, 23, 3);
      base = mix(base, [t[0] * 0.6, t[1] * 0.58, t[2] * 0.58], g * 0.4);
      const seam = pv < 0.035 || pv > 0.965;
      if (seam) base = mix(base, [t[0] * 0.42, t[1] * 0.4, t[2] * 0.4], 0.75);
      return base;
    });
  }

  /* 瓦屋顶 */
  function roofCanvas(size) {
    return pixTex(256, (x, y, u, v) => {
      const rows = 8;
      const rv = (v * rows) % 1;
      const ru = (u * 14) % 1;
      const col = Math.floor(u * 14);
      const j = h2(col, Math.floor(v * rows), 29);
      let base = mix([126, 84, 70], [156, 108, 88], j * 0.8);
      const n = fbm(u * 40, v * 40, 61, 3);
      base = mix(base, [96, 66, 58], n * 0.35);
      // 筒瓦明暗
      const wave = Math.sin(ru * Math.PI);
      base = mix(base, [178, 128, 102], wave * 0.35);
      // 瓦垄阴影
      if (ru < 0.08) base = mix(base, [70, 48, 42], 0.6);
      if (rv > 0.9) base = mix(base, [72, 50, 44], 0.45);
      // 苔与水渍
      const m = fbm(u * 12, v * 12 + 5, 97, 3);
      if (m > 0.70) base = mix(base, [96, 116, 88], (m - 0.70) * 1.2);
      return base;
    });
  }

  /* 锈迹 */
  function rustCanvas(size) {
    return pixTex(256, (x, y, u, v) => {
      const n = fbm(u * 11, v * 11, 5, 4);
      const n2 = fbm(u * 34, v * 34, 19, 3);
      let c = mix([172, 104, 58], [126, 66, 40], n);
      c = mix(c, [206, 146, 84], Math.max(0, n2 - 0.55) * 1.5);
      const a = n > 0.42 ? 255 : 0;
      return [c[0], c[1], c[2], a];
    });
  }

  /* 警示斜纹 */
  function hazardCanvas() {
    const c = cv(256, 256);
    const g = ctx2d(c);
    g.fillStyle = '#e6bf36'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#2e2f2c'; g.lineWidth = 40;
    for (let i = -280; i < 340; i += 80) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); }
    // 磨损
    g.globalAlpha = 0.22; g.fillStyle = '#d3ccb6';
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = Math.random() * 9;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalAlpha = 0.25; g.strokeStyle = '#b9b19a'; g.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      const x = Math.random() * 256, y = Math.random() * 256;
      g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
      g.stroke();
    }
    g.globalAlpha = 1;
    return c;
  }

  /* 渔网（带 alpha） */
  function netCanvas(size) {
    const c = cv(size);
    const g = ctx2d(c);
    g.clearRect(0, 0, size, size);
    g.strokeStyle = '#d8d2be';
    g.lineWidth = 2.2;
    const n = 16, step = size / n;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, size); g.stroke();
      g.beginPath(); g.moveTo(0, i * step); g.lineTo(size, i * step); g.stroke();
    }
    // 结
    g.fillStyle = '#efe8d2';
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      g.beginPath(); g.arc(i * step, j * step, 2.4, 0, 7); g.fill();
    }
    return c;
  }

  /* 缆绳 */
  function ropeCanvas() {
    return pixTex(64, (x, y, u, v) => {
      const s = (u * 4 + v * 9) % 1;
      const n = fbm(u * 30, v * 30, 33, 3);
      let c = mix([196, 158, 104], [148, 112, 70], Math.abs(s - 0.5) * 1.6);
      c = mix(c, [120, 92, 58], n * 0.35);
      return c;
    });
  }

  /* ============ 文字类贴图 ============ */
  function fadedPaper(size) {
    const c = cv(size);
    const g = ctx2d(c);
    g.fillStyle = '#e9e2cd'; g.fillRect(0, 0, size, size);
    g.globalAlpha = 0.12; g.fillStyle = '#8d8163';
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = Math.random() * size * 0.08;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(140,126,92,0.55)'); gr.addColorStop(1, 'rgba(140,126,92,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }

  /* 港名告示牌 */
  function portSignCanvas() {
    const c = fadedPaper(256);
    const g = ctx2d(c);
    g.strokeStyle = '#2f4a5a'; g.lineWidth = 5; g.strokeRect(10, 10, 236, 236);
    g.fillStyle = '#26414f';
    g.font = 'bold 62px ' + FONT;
    g.textAlign = 'center';
    g.fillText('潮見港', 128, 92);
    g.font = '22px ' + FONT;
    g.fillStyle = '#3d5a66';
    g.fillText('SHIOMI HARBOUR', 128, 124);
    g.font = '20px ' + FONT;
    g.fillText('禁 止 越 線', 128, 176);
    g.font = '17px ' + FONT;
    g.fillStyle = '#5b6f6a';
    g.fillText('— 小雨の日も足元に注意 —', 128, 206);
    // 褪色
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = Math.random() * 0.25;
      g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 9, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return c;
  }

  /* 注意落水牌 */
  function warnSignCanvas() {
    const c = fadedPaper(256);
    const g = ctx2d(c);
    g.fillStyle = '#c44a2e';
    g.fillRect(0, 0, 256, 56);
    g.fillStyle = '#f2ead6';
    g.font = 'bold 40px ' + FONT;
    g.textAlign = 'center';
    g.fillText('注意落水', 128, 42);
    g.fillStyle = '#3a3a36';
    g.font = '22px ' + FONT;
    g.fillText('足もと注意', 128, 106);
    g.strokeStyle = '#8d8163'; g.lineWidth = 2;
    g.strokeRect(18, 78, 220, 60);
    g.font = '18px ' + FONT;
    g.fillStyle = '#5a5445';
    g.fillText('波打ち際で滑りやすい', 128, 172);
    g.fillText(' fisher hooks 携帯厳禁', 128, 200);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 220; i++) {
      g.globalAlpha = Math.random() * 0.3;
      g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 8, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return c;
  }

  /* 时刻表 */
  function scheduleCanvas() {
    const c = fadedPaper(256);
    const g = ctx2d(c);
    g.fillStyle = '#3c4a52';
    g.font = 'bold 26px ' + FONT;
    g.textAlign = 'center';
    g.fillText('発 船 時 刻 表', 128, 40);
    g.strokeStyle = '#57646a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(20, 52); g.lineTo(236, 52); g.stroke();
    g.font = '18px ' + FONT;
    g.textAlign = 'left';
    const rows = [['6:20', '整理番号 漁協前'], ['7:05', '波老 ferry 受付'], ['8:10', '本土線 連絡船'], ['9:40', '潮流観測 定期便'], ['11:20', '-register 受付'], ['13:30', '貨物便 上り'], ['15:45', '定期便 下り'], ['17:10', '夕便 最終便']];
    g.fillStyle = '#4a5560';
    rows.forEach((r, i) => {
      const y = 80 + i * 21;
      g.fillText(r[0], 34, y);
      g.fillStyle = '#6b6a5c';
      g.fillText(r[1], 92, y);
      g.fillStyle = '#4a5560';
      g.strokeStyle = 'rgba(90,85,70,0.28)';
      g.beginPath(); g.moveTo(26, y + 6); g.lineTo(230, y + 6); g.stroke();
    });
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 300; i++) {
      g.globalAlpha = Math.random() * 0.32;
      g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 7, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return c;
  }

  /* 黑板 拍卖价格 */
  function blackboardCanvas() {
    const c = cv(256);
    const g = ctx2d(c);
    g.fillStyle = '#20342c'; g.fillRect(0, 0, 256, 256);
    g.globalAlpha = 0.22; g.fillStyle = '#7d8d7c';
    for (let i = 0; i < 120; i++) {
      g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 22, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#eef3ea';
    g.font = 'bold 27px ' + FONT;
    g.textAlign = 'center';
    g.fillText('本 日 の 魚 価', 128, 40);
    g.strokeStyle = 'rgba(240,245,235,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(26, 52); g.lineTo(230, 52); g.stroke();
    g.font = '19px ' + FONT;
    g.textAlign = 'left';
    const rows = [['マサバ', '128円'], ['ブリ', '210円'], ['サケ', '156円'], ['鯛', '340円'], ['イカ', '88円'], ['ホタテ', '195円']];
    rows.forEach((r, i) => {
      g.fillStyle = 'rgba(238,243,234,0.92)';
      g.fillText(r[0], 40, 84 + i * 27);
      g.fillText(r[1], 150, 84 + i * 27);
    });
    g.fillStyle = 'rgba(255,220,150,0.85)';
    g.font = 'italic 17px ' + FONT;
    g.fillText('— 漁協  auction —', 40, 240);
    return c;
  }

  /* 海图 */
  function chartCanvas() {
    const c = cv(256);
    const g = ctx2d(c);
    g.fillStyle = '#e6efe8'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(90,140,150,0.35)'; g.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 16); g.lineTo(256, i * 16); g.stroke();
    }
    g.strokeStyle = 'rgba(60,120,135,0.75)'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 196);
    g.bezierCurveTo(60, 186, 96, 150, 140, 128);
    g.bezierCurveTo(186, 106, 214, 80, 256, 70);
    g.stroke();
    g.fillStyle = 'rgba(150,200,205,0.5)';
    g.fillRect(0, 196, 256, 60);
    g.fillStyle = 'rgba(150,200,205,0.28)';
    g.beginPath(); g.moveTo(140, 128); g.bezierCurveTo(186, 106, 214, 80, 256, 70); g.lineTo(256, 0); g.lineTo(140, 0); g.fill();
    g.fillStyle = '#3b5a63';
    g.font = '13px ' + FONT;
    g.fillText('18', 60, 120); g.fillText('24', 200, 60); g.fillText('12', 170, 200);
    g.font = 'bold 15px ' + FONT;
    g.fillText('潮見港', 36, 184);
    // 罗盘
    g.save(); g.translate(214, 214); g.strokeStyle = '#456670'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, 0, 22, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(0, -18); g.lineTo(5, 4); g.lineTo(0, 0); g.lineTo(-5, 4); g.closePath(); g.fillStyle = '#456670'; g.fill();
    g.font = '11px ' + FONT; g.textAlign = 'center'; g.fillText('N', 0, -22);
    g.restore();
    // 折痕与污渍
    g.globalAlpha = 0.15; g.fillStyle = '#9aa79c';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 16, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    return c;
  }

  /* 潮汐表 */
  function tideCanvas() {
    const c = fadedPaper(128);
    const g = ctx2d(c);
    g.fillStyle = '#4a5560';
    g.font = 'bold 17px ' + FONT; g.textAlign = 'center';
    g.fillText('潮 汐 表', 64, 24);
    g.font = '13px ' + FONT; g.textAlign = 'left';
    const rows = [['満潮', '05:12'], ['干潮', '11:38'], ['満潮', '17:44'], ['干潮', '23:56']];
    rows.forEach((r, i) => {
      g.fillStyle = '#4d5860'; g.fillText(r[0], 16, 52 + i * 26);
      g.fillText(r[1], 74, 52 + i * 26);
      g.strokeStyle = 'rgba(90,85,70,0.3)';
      g.beginPath(); g.moveTo(10, 58 + i * 26); g.lineTo(118, 58 + i * 26); g.stroke();
    });
    return c;
  }

  /* 渔获照片 */
  function fishPhotoCanvas() {
    const c = cv(64);
    const g = ctx2d(c);
    g.fillStyle = '#f2efe4'; g.fillRect(0, 0, 64, 64);
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#b9d3d8'); gr.addColorStop(1, '#6e97a3');
    g.fillStyle = gr; g.fillRect(6, 6, 52, 52);
    g.fillStyle = '#8fa9b4';
    g.beginPath(); g.ellipse(32, 32, 19, 9, -0.25, 0, 7); g.fill();
    g.beginPath(); g.moveTo(48, 28); g.lineTo(58, 20); g.lineTo(57, 40); g.closePath(); g.fill();
    g.fillStyle = '#2b3a40'; g.beginPath(); g.arc(19, 28, 2.4, 0, 7); g.fill();
    g.strokeStyle = 'rgba(60,80,90,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(16, 36); g.lineTo(46, 30); g.stroke();
    return c;
  }

  /* 雷达屏 */
  function radarCanvas() {
    const c = cv(128);
    const g = ctx2d(c);
    g.fillStyle = '#03120e'; g.fillRect(0, 0, 128, 128);
    g.save(); g.translate(64, 64);
    g.strokeStyle = 'rgba(90,255,170,0.55)'; g.lineWidth = 1.4;
    for (let r = 16; r <= 58; r += 14) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(-58, 0); g.lineTo(58, 0); g.moveTo(0, -58); g.lineTo(0, 58); g.stroke();
    const gr = g.createConicGradient ? null : null;
    // 扫描扇
    g.save(); g.globalAlpha = 0.45; g.fillStyle = '#2effa6';
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 58, -0.6, 0); g.closePath(); g.fill(); g.restore();
    g.fillStyle = '#b9ffdd';
    const blips = [[20, -30], [-34, 12], [8, 40], [-12, -44], [42, 22]];
    blips.forEach((b) => { g.beginPath(); g.arc(b[0], b[1], 2.6, 0, 7); g.fill(); });
    g.restore();
    return c;
  }

  /* 鱼探仪 */
  function finderCanvas() {
    const c = cv(128);
    const g = ctx2d(c);
    g.fillStyle = '#07100f'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i++) {
      const v = Math.abs(Math.sin(i * 0.12)) * 0.6 + Math.random() * 0.4;
      const col = v > 0.72 ? [255, 214, 92] : v > 0.5 ? [232, 146, 70] : [58, 168, 148];
      g.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.85)';
      g.fillRect(i, 100 - v * 60, 1, v * 60 + 20);
    }
    g.strokeStyle = 'rgba(220,255,240,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); }
    g.fillStyle = 'rgba(190,255,225,0.9)';
    g.font = '11px monospace'; g.fillText('30m', 4, 16);
    return c;
  }

  /* 自动贩卖机 */
  function vendingCanvas() {
    const c = cv(192);
    const g = ctx2d(c);
    g.fillStyle = '#d94f3d'; g.fillRect(0, 0, 192, 192);
    g.fillStyle = '#f3ead2'; g.fillRect(12, 12, 168, 118);
    // 商品
    const cols = ['#e8a33a', '#5fb0c8', '#7fbf62', '#d9664e', '#c9d04a', '#e07fa5'];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[(r * 6 + i) % cols.length];
      g.fillRect(18 + i * 27, 18 + r * 38, 22, 32);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(18 + i * 27, 18 + r * 38, 22, 8);
    }
    // 选择按钮
    for (let i = 0; i < 6; i++) {
      g.fillStyle = '#f7c74a'; g.fillRect(18 + i * 27, 136, 22, 8);
    }
    g.fillStyle = '#f3ead2'; g.fillRect(12, 150, 168, 30);
    g.fillStyle = '#8c3b2e'; g.font = 'bold 15px ' + FONT; g.textAlign = 'center';
    g.fillText('つめたい / あたたかい', 96, 170);
    return c;
  }

  /* 钟面 */
  function clockCanvas() {
    const c = cv(128);
    const g = ctx2d(c);
    g.fillStyle = '#f3f1e4'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#3b4a4e'; g.lineWidth = 3;
    g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = i % 3 === 0 ? 4 : 2;
      g.beginPath();
      g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50);
      g.lineTo(64 + Math.sin(a) * 43, 64 - Math.cos(a) * 43);
      g.stroke();
    }
    g.fillStyle = '#3b4a4e'; g.textAlign = 'center';
    g.font = '13px ' + FONT; g.fillText('12', 64, 26);
    g.font = '10px ' + FONT; g.fillText('柳町港', 64, 104);
    // 指针（歪斜挂钟）
    g.strokeStyle = '#2c3639'; g.lineCap = 'round';
    g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 22, 64 - 14); g.stroke();
    g.lineWidth = 3.5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 8, 64 - 34); g.stroke();
    g.fillStyle = '#b2453a'; g.beginPath(); g.arc(64, 64, 4, 0, 7); g.fill();
    return c;
  }

  /* 收音机面板 */
  function radioCanvas() {
    const c = cv(128);
    const g = ctx2d(c);
    g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d8c9a4'; g.fillRect(8, 10, 112, 40);
    g.strokeStyle = '#4a3a26'; g.lineWidth = 1;
    for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(12 + i * 11, 12); g.lineTo(12 + i * 11, 48); g.stroke(); }
    g.fillStyle = '#2c2620'; g.fillRect(8, 56, 112, 64);
    g.strokeStyle = '#9aa0a2'; g.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(12 + i * 8, 60); g.lineTo(12 + i * 8, 116); g.stroke(); }
    g.fillStyle = '#e8e2cf'; g.fillRect(8, 10, 112, 40);
    g.strokeStyle = '#b2453a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(44, 30); g.lineTo(84, 30); g.stroke();
    g.fillStyle = '#3a3229'; g.font = '12px ' + FONT; g.fillText('AM', 16, 26);
    return c;
  }

  /* 护身符 */
  function charmCanvas() {
    const c = cv(48);
    const g = ctx2d(c);
    g.fillStyle = '#efe6cd'; g.fillRect(0, 0, 48, 48);
    g.strokeStyle = '#c0392b'; g.lineWidth = 2; g.strokeRect(4, 4, 40, 40);
    g.fillStyle = '#c0392b'; g.font = 'bold 18px ' + SERIF; g.textAlign = 'center';
    g.fillText('安', 24, 26);
    g.font = '9px ' + SERIF; g.fillText('漁', 24, 38);
    return c;
  }

  /* 塑料鱼箱（带孔） */
  function crateCanvas(base, edge) {
    const c = cv(128);
    const g = ctx2d(c);
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.fillStyle = edge; g.fillRect(0, 0, 128, 9); g.fillRect(0, 119, 128, 9);
    g.fillRect(0, 0, 9, 128); g.fillRect(119, 0, 9, 128);
    // 孔洞
    g.fillStyle = 'rgba(40,60,70,0.55)';
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
      g.fillRect(18 + i * 26, 20 + r * 30, 16, 18);
    }
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(12, 12, 104, 6);
    return c;
  }

  /* 海床砾石 */
  function seabedCanvas(size) {
    return pixTex(size, (x, y, u, v) => {
      const n = fbm(u * 30, v * 30, 61, 4);
      const n2 = h2(x, y, 7);
      let c = mix([96, 96, 86], [140, 136, 118], n);
      if (n2 > 0.965) c = mix(c, [172, 172, 156], 0.55);
      return c;
    });
  }

  /* 草地 */
  function grassCanvas(size) {
    return pixTex(size, (x, y, u, v) => {
      const n = fbm(u * 26, v * 26, 83, 4);
      const n2 = fbm(u * 90, v * 90, 12, 2);
      let c = mix([74, 118, 72], [126, 162, 96], n);
      c = mix(c, [58, 96, 62], n2 * 0.28);
      return c;
    });
  }

  /* 冰 */
  function iceCanvas() {
    const c = cv(64);
    const g = ctx2d(c);
    g.fillStyle = '#dff0f4'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 12; i++) {
      g.beginPath(); g.arc(Math.random() * 64, Math.random() * 64, Math.random() * 9, 0, 7); g.fill();
    }
    return c;
  }

  /* 混凝土雨渍（用于湿润面） */
  function wetConcreteCanvas(size) {
    const c = concreteCanvas(size, { stainAmt: 0.8 });
    const g = ctx2d(c);
    g.globalAlpha = 0.3; g.fillStyle = '#5d6b70';
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const w = 3 + Math.random() * 10, h = 20 + Math.random() * 90;
      const gr = g.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, 'rgba(70,86,90,0.55)'); gr.addColorStop(1, 'rgba(70,86,90,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    }
    g.globalAlpha = 1;
    return c;
  }

  /* 泡沫 / 噪声 */
  function noiseCanvas(size, s) {
    return pixTex(size, (x, y, u, v) => {
      const n = fbm(u * 10, v * 10, s || 5, 4);
      const g = h2(x, y, s || 5);
      return [n * 255, n * 255, n * 255];
    });
  }

  /* 云噪声（用于云影） */
  function cloudCanvas(size) {
    return pixTex(size, (x, y, u, v) => {
      const n = fbm(u * 6, v * 6, 123, 5, 2.1, 0.55);
      const m = fbm(u * 14 + 3, v * 14, 211, 4);
      const val = Math.min(1, Math.max(0, (n * 0.75 + m * 0.25 - 0.34) * 2.1));
      return [val * 255, val * 255, val * 255];
    });
  }

  /* 等距柱状天空（环境反射） */
  function skyEnvCanvas() {
    const c = cv(512, 256);
    const g = ctx2d(c);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0.0, '#8fc6dd');
    gr.addColorStop(0.38, '#cfe6ee');
    gr.addColorStop(0.52, '#f2f7f5');
    gr.addColorStop(0.56, '#e7f0ea');
    gr.addColorStop(0.62, '#a8cfc9');
    gr.addColorStop(1.0, '#7ba8a6');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    // 太阳
    const sx = 512 * 0.68, sy = 256 * 0.24;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 70);
    sg.addColorStop(0, 'rgba(255,250,232,1)');
    sg.addColorStop(0.25, 'rgba(255,244,206,0.75)');
    sg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, 70, 0, 7); g.fill();
    g.fillStyle = '#fffef6'; g.beginPath(); g.arc(sx, sy, 13, 0, 7); g.fill();
    // 云
    g.globalAlpha = 0.5; g.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 512, y = 20 + Math.random() * 110, r = 16 + Math.random() * 48;
      const eg = g.createRadialGradient(x, y, 0, x, y, r);
      eg.addColorStop(0, 'rgba(255,255,255,0.9)'); eg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = eg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }

  /* 底座铭牌 */
  function plaqueCanvas() {
    const c = cv(384, 128);
    const g = ctx2d(c);
    g.fillStyle = '#e7dcc0'; g.fillRect(0, 0, 384, 128);
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(120,108,80,0.25)');
    g.fillStyle = gr; g.fillRect(0, 0, 384, 128);
    g.strokeStyle = '#8a7c58'; g.lineWidth = 3; g.strokeRect(8, 8, 368, 112);
    g.fillStyle = '#4b4530';
    g.font = 'bold 40px ' + SERIF; g.textAlign = 'center';
    g.fillText('太陽雨の港', 192, 56);
    g.font = '20px ' + FONT; g.fillStyle = '#6b6144';
    g.fillText('潮 見 港  ／  MINIATURE HARBOUR No.7', 192, 92);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 120; i++) {
      g.globalAlpha = Math.random() * 0.16;
      g.beginPath(); g.arc(Math.random() * 384, Math.random() * 128, Math.random() * 10, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return c;
  }

  /* 柔和光晕 */
  function glowCanvas() {
    const c = cv(128);
    const g = ctx2d(c);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.22, 'rgba(255,250,230,0.55)');
    gr.addColorStop(0.55, 'rgba(255,246,215,0.16)');
    gr.addColorStop(1, 'rgba(255,246,215,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  TY.tex = {
    h2, vnoise, fbm, cv, ctx2d, tex, pixTex, mix, rgb, FONT, SERIF, glowCanvas,
    concreteCanvas, seawallCanvas, hullCanvas, woodCanvas, roofCanvas, rustCanvas, blockWallCanvas, plaqueCanvas,
    hazardCanvas, netCanvas, ropeCanvas, portSignCanvas, warnSignCanvas,
    scheduleCanvas, blackboardCanvas, chartCanvas, tideCanvas, fishPhotoCanvas,
    radarCanvas, finderCanvas, vendingCanvas, clockCanvas, radioCanvas, charmCanvas,
    crateCanvas, seabedCanvas, grassCanvas, iceCanvas, wetConcreteCanvas,
    noiseCanvas, cloudCanvas, skyEnvCanvas, fadedPaper,
  };
})();
