'use strict';
/* 船体放样 + 驾驶舱 / 室内陈设构件 + 画布小贴图 */
function bsmooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

function hullShape(L, B, D, F) {
  const plan = t => t < 0.25 ? 0.80 + 0.20 * bsmooth(0, 0.25, t) : (t < 0.5 ? 1 : Math.pow(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 1.7)), 0.65));
  const keel = t => -D * (1 - 0.72 * bsmooth(0.45, 1.0, t));
  const gun = t => F + 0.30 * Math.pow(bsmooth(0.40, 1.0, t), 1.5) + 0.03 * (1 - bsmooth(0, 0.2, t));
  const prof = (y, t) => { const k = keel(t), g = gun(t); const v = clamp((y - k) / (g - k), 0, 1); return (0.14 + 0.86 * (1 - Math.pow(1 - v, 2.1))) * (1 + 0.05 * v); };
  const halfW = (z, y) => { const t = clamp((z + L / 2) / L, 0, 1); return plan(t) * B / 2 * prof(y, t); };
  return { plan, keel, gun, prof, halfW, L, B, D, F };
}

function hullGeometry(sh, colors, seed) {
  const { L, B, plan, keel, gun, prof } = sh;
  const NS = 26; const pos = [], col = [], idx = [];
  const rows = (t) => {
    const k = keel(t), g = gun(t);
    return [
      { y: k, c: colors.bottom }, { y: k * 0.45, c: colors.bottom }, { y: -0.02, c: colors.bottom },
      { y: -0.02, c: colors.top }, { y: g * 0.45, c: colors.top }, { y: g - 0.17, c: colors.top },
      { y: g - 0.17, c: colors.accent }, { y: g, c: colors.accent }];
  };
  const NR = 8, ring = [];
  const rust = new Col('#a8643a'), rust2 = new Col('#7d4a30');
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, z = -L / 2 + t * L, rw = rows(t);
    const rowIdx = [];
    const verts = [];
    for (let side = -1; side <= 1; side += 2) {
      const order = side < 0 ? [...Array(NR).keys()].reverse() : [...Array(NR).keys()];
      for (const r of order) {
        const R_ = rw[r]; const x = side * plan(t) * B / 2 * prof(R_.y, t);
        const c = R_.c.clone();
        if (R_.c === colors.top) {                 // 白漆磨损与锈迹
          const n = fbm2(z * 1.9 + seed, R_.y * 2.6 + seed * 0.7);
          const nearWL = 1 - bsmooth(0.0, 0.5, R_.y);
          const a = bsmooth(0.60, 0.78, n) * (0.35 + 0.65 * nearWL);
          c.lerp(n > 0.7 ? rust2 : rust, a * 0.85);
          c.multiplyScalar(0.97 + 0.05 * noise2(z * 6, R_.y * 8));
        }
        verts.push([x, R_.y, z, c]);
      }
    }
    ring.push(verts);
  }
  const rl = ring[0].length;
  for (let i = 0; i <= NS; i++) for (const v of ring[i]) { pos.push(v[0], v[1], v[2]); col.push(v[3].r, v[3].g, v[3].b); }
  for (let i = 0; i < NS; i++) for (let k = 0; k < rl - 1; k++) {
    const a = i * rl + k, b = a + 1, c = a + rl, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // 船尾板
  const base = pos.length / 3;
  const st = ring[0]; let cy = 0.3;
  for (const v of st) { pos.push(v[0], v[1], v[2]); col.push(v[3].r, v[3].g, v[3].b); }
  pos.push(0, cy, -L / 2); col.push(colors.top.r, colors.top.g, colors.top.b);
  const cidx = base + st.length;
  for (let k = 0; k < st.length - 1; k++) idx.push(base + k, cidx, base + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function deckGeometry(sh, yd) {
  const { L, B, plan, prof } = sh; const pts = [], NS = 22;
  for (let i = 0; i <= NS; i++) { const t = i / NS; const z = -L / 2 + t * L; pts.push(new THREE.Vector2(plan(t) * B / 2 * prof(yd, t) * 0.985, -z)); }
  const left = []; for (let i = NS; i >= 0; i--) { const p = pts[i]; left.push(new THREE.Vector2(-p.x, p.y)); }
  const shape = new THREE.Shape([...pts, ...left]);
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, yd, 0);
  return g;
}

/* ---------- 小画布纹理 ---------- */
function chartTexture() {
  const c = mkCanvas(128, 160), x = c.getContext('2d');
  x.fillStyle = '#e9efe4'; x.fillRect(0, 0, 128, 160);
  x.fillStyle = '#9fd0da'; x.beginPath(); x.moveTo(0, 30); x.bezierCurveTo(40, 20, 50, 70, 128, 55); x.lineTo(128, 160); x.lineTo(0, 160); x.fill();
  x.fillStyle = '#e1d8b5'; x.beginPath(); x.moveTo(0, 0); x.lineTo(128, 0); x.lineTo(128, 40); x.bezierCurveTo(70, 50, 60, 10, 0, 22); x.fill();
  x.strokeStyle = '#3d6c7c'; x.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, 60 + i * 15); x.bezierCurveTo(40, 50 + i * 14, 80, 80 + i * 15, 128, 66 + i * 16); x.stroke(); }
  x.strokeStyle = '#b3372e'; x.lineWidth = 2; x.setLineDash([5, 3]); x.beginPath(); x.moveTo(20, 140); x.lineTo(60, 100); x.lineTo(96, 118); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#244'; x.font = '10px sans-serif'; x.fillText('N', 110, 18); x.beginPath(); x.moveTo(114, 22); x.lineTo(110, 34); x.lineTo(118, 34); x.fill();
  x.strokeStyle = 'rgba(40,70,80,.4)'; x.lineWidth = 0.6; for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 160); x.stroke(); }
  return canvasTex(c);
}
function tideTexture() {
  const c = mkCanvas(96, 128), x = c.getContext('2d');
  x.fillStyle = '#f4f1e4'; x.fillRect(0, 0, 96, 128);
  x.fillStyle = '#25444f'; x.font = `bold 11px ${FONT_CJK}`; x.fillText('潮汐表', 6, 15);
  x.font = `8px ${FONT_CJK}`;
  const rows = ['06:12  満 1.8', '12:24  干 0.4', '18:41  満 1.9', '00:55  干 0.3', '06:58  満 1.7', '13:07  干 0.5', '19:22  満 1.8'];
  rows.forEach((t, i) => { x.fillStyle = i % 2 ? '#35606a' : '#2a4a54'; x.fillText(t, 6, 30 + i * 13); x.fillRect(6, 33 + i * 13, 84, 0.7); });
  x.fillStyle = 'rgba(200,60,50,.8)'; x.fillRect(4, 56, 88, 11);
  x.fillStyle = '#25444f'; x.fillText('12:24  干 0.4', 6, 43 + 13 * 1 + 0);
  return canvasTex(c);
}
function photoTexture(seed) {
  const c = mkCanvas(96, 72), x = c.getContext('2d');
  x.fillStyle = '#f3efe3'; x.fillRect(0, 0, 96, 72);
  const g = x.createLinearGradient(0, 4, 0, 68); g.addColorStop(0, '#cfe9ee'); g.addColorStop(0.55, '#8ec7cd'); g.addColorStop(1, '#3f8c9a');
  x.fillStyle = g; x.fillRect(5, 5, 86, 62);
  x.fillStyle = '#e9d3a4'; x.beginPath(); x.ellipse(40 + seed * 5, 40, 22, 8, -0.3, 0, 6.3); x.fill();
  x.fillStyle = '#d97b4b'; x.beginPath(); x.moveTo(60 + seed * 5, 36); x.lineTo(74 + seed * 5, 28); x.lineTo(72 + seed * 5, 46); x.fill();
  x.fillStyle = '#26323a'; x.beginPath(); x.arc(30 + seed * 5, 38, 1.6, 0, 6.3); x.fill();
  x.fillStyle = '#e6c9a8'; x.beginPath(); x.arc(20, 22, 7, 0, 6.3); x.fill(); x.fillStyle = '#d8453a'; x.fillRect(12, 28, 17, 22);
  x.fillStyle = '#f3e7a8'; x.fillRect(12, 16, 16, 4);
  return canvasTex(c);
}
function makeRadarScreen() {
  const c = mkCanvas(128, 128), x = c.getContext('2d'); const tex = canvasTex(c);
  const draw = (t) => {
    x.fillStyle = '#04201a'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(80,255,170,0.5)'; x.lineWidth = 1;
    for (let r = 20; r <= 60; r += 20) { x.beginPath(); x.arc(64, 64, r, 0, 6.283); x.stroke(); }
    x.beginPath(); x.moveTo(64, 4); x.lineTo(64, 124); x.moveTo(4, 64); x.lineTo(124, 64); x.stroke();
    const a = (t * 1.2) % 6.283;
    const g = x.createConicGradient ? x.createConicGradient(a - 1.2, 64, 64) : null;
    if (g) { g.addColorStop(0, 'rgba(60,255,150,0)'); g.addColorStop(0.19, 'rgba(60,255,150,0.65)'); g.addColorStop(0.2, 'rgba(60,255,150,0)'); g.addColorStop(1, 'rgba(60,255,150,0)'); x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, 6.283); x.fill(); }
    x.strokeStyle = 'rgba(160,255,200,0.95)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); x.stroke();
    x.fillStyle = 'rgba(200,255,220,0.9)'; for (const [px, py] of [[88, 40], [40, 82], [96, 90], [30, 36]]) { x.fillRect(px, py, 3, 3); }
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}
function makeFishFinder() {
  const c = mkCanvas(128, 96), x = c.getContext('2d'); const tex = canvasTex(c);
  let off = 0;
  const draw = (t) => {
    x.fillStyle = '#06233a'; x.fillRect(0, 0, 128, 96);
    off = (t * 24) % 128;
    for (let i = 0; i < 128; i++) {
      const xx = (i + off) % 128, depth = 62 + 14 * Math.sin(i * 0.07 + 1) + 6 * Math.sin(i * 0.23);
      x.fillStyle = '#e9c34a'; x.fillRect(127 - i, depth, 1, 4);
      x.fillStyle = '#d6532f'; x.fillRect(127 - i, depth + 4, 1, 3);
      x.fillStyle = 'rgba(72,200,240,0.5)'; x.fillRect(127 - i, depth - 3, 1, 3);
    }
    x.fillStyle = '#ffd35a';
    for (const [a, b] of [[30, 30], [58, 42], [92, 24], [110, 46]]) { const px = (127 - ((a + off) % 128)); x.fillRect(px, b, 5, 2); x.fillRect(px + 1, b - 1, 3, 4); }
    x.fillStyle = '#9fe8ff'; x.font = '9px monospace'; x.fillText('12.4m  18.6°C', 4, 10);
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}
function screenMat(tex) { return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); }

/* ---------- 船只室内/舱室构件（局部坐标，z 向船首） ---------- */
function addCabin(P, Pin, Pg, o, out) {
  // o: {z0,z1,hw,y0,h,roof,accent,door:'aft'|'side', seed}
  const { z0, z1, hw, y0, h } = o; const zc = (z0 + z1) / 2, len = z1 - z0;
  const wallC = o.wall || '#f1f3ee', trim = o.trim || '#dde3dd', dark = '#31404a';
  const pillar = (x, z) => P.box(0.07, h, 0.07, [x, y0 + h / 2, z], trim);
  const lowH = 0.30, winH = h - lowH - 0.14, hdrH = 0.14;
  // 四角立柱
  for (const sx of [-1, 1]) for (const z of [z0, z1]) pillar(sx * hw, z);
  // 侧壁：下板 + 窗(玻璃) + 上梁
  for (const sx of [-1, 1]) {
    P.box(0.05, lowH, len, [sx * hw, y0 + lowH / 2, zc], wallC);
    P.box(0.05, hdrH, len, [sx * hw, y0 + h - hdrH / 2, zc], wallC);
    P.box(0.07, winH + 0.02, 0.05, [sx * hw, y0 + lowH + winH / 2, zc], trim);            // 窗中梃
    Pg.plane(len - 0.08, winH, [sx * hw, y0 + lowH + winH / 2, zc], '#fff', [0, Math.PI / 2, 0]);
    // 窗下沿金属条
    P.box(0.08, 0.025, len, [sx * hw, y0 + lowH, zc], '#aeb7b4');
  }
  // 前壁(仪表台一侧)
  P.box(2 * hw, lowH, 0.05, [0, y0 + lowH / 2, z1], wallC);
  P.box(2 * hw, hdrH, 0.05, [0, y0 + h - hdrH / 2, z1], wallC);
  for (const x of [-hw * 0.5, hw * 0.5]) P.box(0.05, winH, 0.05, [x, y0 + lowH + winH / 2, z1], trim);
  Pg.plane(2 * hw - 0.1, winH, [0, y0 + lowH + winH / 2, z1], '#fff', [0, 0, 0]);
  // 后壁：中间留门洞，两侧窗
  const dw = 0.58;
  for (const sx of [-1, 1]) {
    const w = hw - dw / 2, xc = sx * (dw / 2 + w / 2);
    P.box(w * 2 / 2, lowH, 0.05, [xc, y0 + lowH / 2, z0], wallC);
    P.box(w, hdrH, 0.05, [xc, y0 + h - hdrH / 2, z0], wallC);
    Pg.plane(w - 0.05, winH, [xc, y0 + lowH + winH / 2, z0], '#fff', [0, Math.PI, 0]);
  }
  P.box(dw + 0.1, hdrH, 0.06, [0, y0 + h - hdrH / 2, z0], wallC);
  P.box(0.05, h, 0.07, [dw / 2, y0 + h / 2, z0], trim); P.box(0.05, h, 0.07, [-dw / 2, y0 + h / 2, z0], trim);
  // 敞开的舱门：门板向外打开
  P.T([dw / 2 + 0.02, 0, z0 - 0.02], [0, -1.75, 0], null, () => {
    P.box(0.54, h - 0.12, 0.04, [-0.27, y0 + (h - 0.12) / 2 + 0.01, 0], wallC);
    P.box(0.34, 0.34, 0.045, [-0.27, y0 + 0.78, 0], '#c4e6ee');
    P.box(0.05, 0.12, 0.06, [-0.5, y0 + 0.5, 0], '#8a7a54');
  });
  // 顶棚
  const ov = 0.2;
  {
    // 带天窗的顶棚：操舵位上方留一块透明亚克力天窗，从上方也能看到舵轮和仪表
    const rw = 2 * hw + 0.3, zmin = zc + 0.08 - (len + 0.45) / 2, zmax = zc + 0.08 + (len + 0.45) / 2;
    const hx = hw - 0.16, hz1 = z1 - 0.08, hz0 = z1 - 0.8, ry = y0 + h + 0.035, rc = o.roof || '#f4f6f2', ac = o.accent || '#2a8f94';
    const slab = (xa, xb, za, zb) => { P.box(xb - xa, 0.07, zb - za, [(xa + xb) / 2, ry, (za + zb) / 2], rc); P.box(xb - xa + 0.04, 0.03, zb - za + 0.04, [(xa + xb) / 2, y0 + h + 0.005, (za + zb) / 2], ac); };
    slab(-rw / 2, rw / 2, zmin, hz0); slab(-rw / 2, rw / 2, hz1, zmax);
    slab(-rw / 2, -hx, hz0, hz1); slab(hx, rw / 2, hz0, hz1);
    // 天窗框与玻璃
    P.box(2 * hx, 0.025, 0.03, [0, ry + 0.045, hz0], '#cdd6d3'); P.box(2 * hx, 0.025, 0.03, [0, ry + 0.045, hz1], '#cdd6d3');
    P.box(0.03, 0.025, hz1 - hz0, [-hx, ry + 0.045, (hz0 + hz1) / 2], '#cdd6d3'); P.box(0.03, 0.025, hz1 - hz0, [hx, ry + 0.045, (hz0 + hz1) / 2], '#cdd6d3');
    P.box(0.025, 0.02, hz1 - hz0, [0, ry + 0.035, (hz0 + hz1) / 2], '#cdd6d3');
    Pg.plane(2 * hx, hz1 - hz0, [0, ry + 0.04, (hz0 + hz1) / 2], '#fff', [-Math.PI / 2, 0, 0]);
    out && (out.sky = { x0: -hx, x1: hx, z0: hz0, z1: hz1, y: ry + 0.04 });
  }
  P.box(2 * hw + 0.1, 0.025, 0.05, [0, y0 + h + 0.082, zc + len / 2 + 0.28], '#cfd7d3');
  // 地板
  Pin.box(2 * hw - 0.06, 0.03, len - 0.04, [0, y0 + 0.015, zc], o.floor || '#a9937a');
  for (let i = -3; i <= 3; i++) Pin.box(0.012, 0.032, len - 0.05, [i * (hw / 3.4), y0 + 0.016, zc], '#8b775f');
  // 内顶
  { const hx = hw - 0.16, hz1 = z1 - 0.08, hz0 = z1 - 0.8, cy = y0 + h - 0.01, cc = '#dfe6e0';
    Pin.box(2 * hw - 0.06, 0.02, hz0 - (z0 + 0.02), [0, cy, (hz0 + z0 + 0.02) / 2], cc);
    Pin.box(2 * hw - 0.06, 0.02, (z1 - 0.02) - hz1, [0, cy, (hz1 + z1 - 0.02) / 2], cc);
    Pin.box(hw - 0.03 - hx, 0.02, hz1 - hz0, [-(hw - 0.03 + hx) / 2, cy, (hz0 + hz1) / 2], cc); Pin.box(hw - 0.03 - hx, 0.02, hz1 - hz0, [(hw - 0.03 + hx) / 2, cy, (hz0 + hz1) / 2], cc); }
}

function addHelm(P, Pin, Pscr, o, out) {
  // 仪表台贴着前壁；返回屏幕/动态件信息
  const { z1, hw, y0 } = o;
  const zf = z1 - 0.06;
  const consoleH = 0.46, consoleD = 0.36;
  Pin.box(2 * hw - 0.12, consoleH, consoleD, [0, y0 + consoleH / 2 + 0.03, zf - consoleD / 2], '#3f4e55');
  // 台面前倾斜板
  Pin.T([0, y0 + consoleH + 0.03, zf - consoleD * 0.55], [0.5, 0, 0], null, () => {
    Pin.box(2 * hw - 0.12, 0.04, consoleD * 0.85, [0, 0, 0], '#3b4a50');
  });
  // 左侧雷达屏 / 右侧鱼探仪（发光屏）
  const sy = y0 + consoleH + 0.2, sz = zf - 0.22;
  const radar = makeRadarScreen(), finder = makeFishFinder();
  const xr = -hw * 0.52, xf = hw * 0.50;
  Pin.box(0.42, 0.36, 0.07, [xr, sy, sz], '#1e272b', [-0.25, 0, 0]);
  Pin.box(0.36, 0.27, 0.07, [xf, sy - 0.02, sz], '#1e272b', [-0.25, 0, 0]);
  Pin.cyl(0.02, 0.02, 0.14, 6, [xr, sy - 0.17, sz + 0.0], '#2c373b'); Pin.cyl(0.02, 0.02, 0.14, 6, [xf, sy - 0.17, sz], '#2c373b');
  out.screens.push({ pos: [xr, sy - 0.006, sz - 0.037], rot: [-0.25, Math.PI, 0], size: [0.35, 0.3], tex: radar, kind: 'radar' });
  out.screens.push({ pos: [xf, sy - 0.026, sz - 0.037], rot: [-0.25, Math.PI, 0], size: [0.3, 0.22], tex: finder, kind: 'finder' });
  // 舵轮：斜装在台面上
  const wx = 0.0, wy = y0 + consoleH + 0.22, wz = zf - 0.17;
  out.wheel = { pos: [wx, wy, wz] };
  Pin.T([wx, wy, wz], [-0.55, 0, 0], null, () => {
    Pin.tor(0.17, 0.018, [0, 0, 0], '#6b4a2f', [0, 0, 0], 20, 6);
    Pin.cyl(0.04, 0.04, 0.06, 10, [0, 0, 0], '#b08b3a', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; Pin.rod([0, 0, 0], [Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0], 0.011, '#7a5636', 5); P_peg(Pin, a); }
  });
  Pin.cyl(0.03, 0.03, 0.16, 8, [wx, y0 + consoleH + 0.1, wz + 0.05], '#4a5256');
  // 对讲机 + 小橱架 + 保温壶 + 搪瓷杯
  Pin.box(0.13, 0.11, 0.07, [hw * 0.18, y0 + consoleH + 0.1, zf - 0.08], '#27302f');
  Pin.cyl(0.012, 0.012, 0.16, 5, [hw * 0.20, y0 + consoleH + 0.22, zf - 0.08], '#222');
  // 侧壁小搁板
  const shx = hw - 0.12, shz = zf - 0.55;
  Pin.box(0.2, 0.025, 0.46, [shx, y0 + 0.72, shz], '#9a7b52');
  Pin.cyl(0.055, 0.05, 0.22, 12, [shx, y0 + 0.845, shz - 0.1], '#c7d5d3');                  // 保温壶
  Pin.cyl(0.058, 0.058, 0.04, 12, [shx, y0 + 0.97, shz - 0.1], '#c0392b');
  Pin.box(0.03, 0.12, 0.016, [shx + 0.08, y0 + 0.855, shz - 0.1], '#6d7b7a');
  Pin.cyl(0.042, 0.038, 0.075, 12, [shx, y0 + 0.7625 + 0.04, shz + 0.12], '#f7f5ee');        // 搪瓷杯
  Pin.tor(0.043, 0.006, [shx, y0 + 0.838 , shz + 0.12], '#2a5da8', [Math.PI / 2, 0, 0], 12, 4);
  Pin.tor(0.028, 0.008, [shx + 0.052, y0 + 0.80, shz + 0.12], '#f3f1ea', [0, Math.PI / 2, 0], 8, 4, Math.PI);
  // 座椅(船长凳)
  Pin.cyl(0.015, 0.015, 0.36, 6, [0, y0 + 0.2, zf - 0.78], '#59666b'); Pin.cyl(0.13, 0.12, 0.07, 12, [0, y0 + 0.41, zf - 0.78], '#2f4d5a');
  Pin.cyl(0.1, 0.1, 0.012, 12, [0, y0 + 0.02, zf - 0.78], '#59666b');
}
function P_peg(P, a) { P.sph(0.014, [Math.cos(a) * 0.20, Math.sin(a) * 0.20, 0], '#7a5636', null, 6, 4); }

function addCabinDetails(P, Pin, o, out) {
  const { z0, z1, hw, y0, h } = o; const zc = (z0 + z1) / 2;
  // 海图 + 潮汐表（夹板）：贴在右侧内壁
  const bx = hw - 0.04, by = y0 + 0.97, bz = zc + 0.05;
  Pin.box(0.015, 0.42, 0.32, [bx, by, bz], '#8b6a47');
  Pin.box(0.02, 0.05, 0.1, [bx - 0.004, by + 0.2, bz], '#b9bcbd');   // 夹子
  out.paper.push({ pos: [bx - 0.012, by - 0.01, bz], rot: [0, -Math.PI / 2, 0], size: [0.26, 0.34], tex: chartTexture() });
  out.paper.push({ pos: [bx - 0.02, by - 0.03, bz + 0.17], rot: [0, -Math.PI / 2, 0.06], size: [0.14, 0.2], tex: tideTexture() });
  // 黄色雨衣挂钩（后壁内侧靠门）
  const hx = -hw + 0.18, hz = z0 + 0.06, hy = y0 + h - 0.26;
  Pin.box(0.2, 0.04, 0.02, [hx, hy + 0.12, hz], '#7a634a');
  Pin.cyl(0.008, 0.008, 0.06, 5, [hx, hy + 0.09, hz + 0.03], '#a7a39a', [Math.PI / 2, 0, 0]);
  // 雨衣
  Pin.T([hx, hy - 0.12, hz + 0.075], [0, 0, 0.03], null, () => {
    Pin.box(0.26, 0.32, 0.075, [0, 0, 0], '#f2c72a');
    Pin.box(0.3, 0.12, 0.07, [0, 0.12, 0], '#e8b91d');
    Pin.sph(0.07, [0, 0.20, 0.0], '#f2c72a', [1.0, 0.9, 0.9], 8, 6);        // 兜帽
    Pin.box(0.07, 0.30, 0.06, [-0.15, -0.02, 0.01], '#dca91a', [0, 0, 0.12]);
    Pin.box(0.07, 0.30, 0.06, [0.15, -0.02, 0.01], '#dca91a', [0, 0, -0.12]);
    Pin.box(0.12, 0.03, 0.01, [0, 0.08, -0.04], '#bfa01a');
  });
  // 护身符 + 渔获照片（贴在左侧窗边）
  const sx = -hw + 0.04, sy = y0 + 0.78;
  Pin.box(0.012, 0.11, 0.07, [sx + 0.01, sy + 0.12, zc + 0.35], '#c1272d');
  Pin.box(0.014, 0.03, 0.04, [sx + 0.011, sy + 0.1, zc + 0.35], '#d8b04a');
  Pin.rod([sx + 0.01, sy + 0.18, zc + 0.35], [sx + 0.01, sy + 0.30, zc + 0.35], 0.004, '#e8d9a0', 4);
  Pin.sph(0.012, [sx + 0.02, sy + 0.095, zc + 0.35], '#e5b94d', null, 6, 4);
  Pin.rod([sx + 0.02, sy + 0.095, zc + 0.35], [sx + 0.02, sy + 0.02, zc + 0.355], 0.004, '#c1272d', 4);
  out.paper.push({ pos: [sx + 0.012, sy + 0.12, zc - 0.05], rot: [0, Math.PI / 2, 0.08], size: [0.18, 0.135], tex: photoTexture(o.seed || 0) });
  Pin.box(0.012, 0.03, 0.06, [sx + 0.006, sy + 0.2, zc - 0.05], '#e9dcb0', [0.2, 0, 0]);
  // 纸巾卷 / 小置物篮
  Pin.cyl(0.04, 0.04, 0.05, 10, [-hw + 0.1, y0 + 0.055, zc - 0.2], '#4b6a78');
  Pin.box(0.18, 0.14, 0.14, [hw - 0.16, y0 + 0.1, z0 + 0.2], '#2f6f87');   // 小冰盒
  Pin.box(0.2, 0.025, 0.16, [hw - 0.16, y0 + 0.185, z0 + 0.2], '#e7efef');
}
