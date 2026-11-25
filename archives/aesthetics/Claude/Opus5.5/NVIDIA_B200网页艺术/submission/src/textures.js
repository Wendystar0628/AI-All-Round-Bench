// 程序化贴图：全部在 Canvas 中绘制（不读取任何图片文件，file:// 下可用作 WebGL 纹理）
import * as THREE from 'three';
import { REGIONS, GPCS, LAYOUT } from './floorplan.js';
import { rng } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function noise(ctx, w, h, amt, seed = 3, size = 2) {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / (size * size * 6); i++) {
    const a = r() * amt;
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(r() * w, r() * h, size, size);
  }
}

/** 晶粒顶面：颜色贴图 + 自发光贴图。返回 {map, emi} */
export function dieTextures() {
  const W = 1024, H = 1312;
  const [c, x] = canvas(W, H);
  const [ce, e] = canvas(W, H);
  const R = rng(11);
  // 底色
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2a2f38'); g.addColorStop(0.5, '#1f232a'); g.addColorStop(1, '#2b2e35');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  noise(x, W, H, 0.05, 5, 2);
  // 标准单元的细密纹理
  for (let i = 0; i < 2400; i++) {
    x.fillStyle = `rgba(${150 + R() * 60},${160 + R() * 60},${180 + R() * 60},${0.03 + R() * 0.05})`;
    x.fillRect(R() * W, R() * H, 2 + R() * 22, 1 + R() * 3);
  }
  const rect = (o) => [o.u0 * W, o.v0 * H, (o.u1 - o.u0) * W, (o.v1 - o.v0) * H];
  for (const r of REGIONS) {
    const [X, Y, w, h] = rect(r);
    if (r.key === 'io') {
      x.fillStyle = '#3a352b'; x.fillRect(X, Y, w, h);
      for (let yy = Y; yy < Y + h; yy += 5) { x.fillStyle = 'rgba(214,180,120,0.35)'; x.fillRect(X + 2, yy, w - 4, 2); }
      e.fillStyle = 'rgba(255,170,70,0.25)'; e.fillRect(X, Y, w, h);
    } else if (r.key === 'hbi') {
      x.fillStyle = '#2d3a2a'; x.fillRect(X, Y, w, h);
      for (let yy = Y; yy < Y + h; yy += 3) { x.fillStyle = 'rgba(190,240,120,0.45)'; x.fillRect(X + 1, yy, w - 2, 1); }
      for (let yy = Y; yy < Y + h; yy += 3) { e.fillStyle = 'rgba(184,242,74,0.75)'; e.fillRect(X + 1, yy, w - 2, 1); }
    } else if (r.key === 'phy') {
      x.fillStyle = '#3b3329'; x.fillRect(X, Y, w, h);
      for (let xx = X + 2; xx < X + w - 2; xx += 6) for (let yy = Y + 2; yy < Y + h - 2; yy += 6) {
        x.fillStyle = 'rgba(230,170,100,0.45)'; x.fillRect(xx, yy, 3, 3);
      }
      e.fillStyle = 'rgba(255,160,60,0.22)'; e.fillRect(X, Y, w, h);
    } else if (r.key === 'l2') {
      x.fillStyle = '#28303a'; x.fillRect(X, Y, w, h);
      // SRAM 阵列：成排的小银行
      const banks = 24;
      for (let b = 0; b < banks; b++) {
        const bx = X + 4 + (b * (w - 8)) / banks, bw = (w - 8) / banks - 4;
        for (let half = 0; half < 2; half++) {
          const by = Y + 4 + half * (h / 2), bh = h / 2 - 8;
          x.fillStyle = '#3b4656'; x.fillRect(bx, by, bw, bh);
          for (let yy = by; yy < by + bh; yy += 2) { x.fillStyle = 'rgba(160,200,235,0.16)'; x.fillRect(bx, yy, bw, 1); }
          e.fillStyle = 'rgba(124,224,255,0.13)'; e.fillRect(bx, by, bw, bh);
        }
      }
    } else if (r.key === 'eng') {
      x.fillStyle = '#343038'; x.fillRect(X, Y, w, h);
      x.strokeStyle = 'rgba(230,220,255,0.35)'; x.lineWidth = 2; x.strokeRect(X + 3, Y + 3, w - 6, h - 6);
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(200,190,255,${0.08 + R() * 0.12})`; x.fillRect(X + R() * w, Y + R() * h, 4 + R() * 18, 2 + R() * 6); }
    }
  }
  for (const gp of GPCS) {
    const [X, Y, w, h] = rect(gp);
    x.strokeStyle = 'rgba(210,220,235,0.22)'; x.lineWidth = 2; x.strokeRect(X, Y, w, h);
  }
  // SM 街区：4 个分区，每个分区一块张量核心、寄存器条纹；底部为 L1/共享内存
  const cells = [...LAYOUT.sms.filter((s) => s.die === 0), ...LAYOUT.fronts.filter((s) => s.die === 0)];
  for (const s of cells) {
    const [X, Y, w, h] = rect(s);
    const isSM = s.i !== undefined;
    x.fillStyle = isSM ? '#303844' : '#3a3440';
    x.fillRect(X, Y, w, h);
    if (!isSM) {
      x.strokeStyle = 'rgba(255,200,140,0.35)'; x.strokeRect(X + 2, Y + 2, w - 4, h - 4);
      continue;
    }
    const sh = h * 0.78;
    for (let q = 0; q < 4; q++) {
      const qx = X + (q % 2) * (w / 2) + 2, qy = Y + Math.floor(q / 2) * (sh / 2) + 2;
      const qw = w / 2 - 4, qh = sh / 2 - 4;
      x.fillStyle = '#26303b'; x.fillRect(qx, qy, qw, qh);
      for (let yy = qy; yy < qy + qh; yy += 3) { x.fillStyle = 'rgba(170,190,215,0.18)'; x.fillRect(qx, yy, qw * 0.45, 1); }
      x.fillStyle = '#52606e'; x.fillRect(qx + qw * 0.55, qy + qh * 0.15, qw * 0.38, qh * 0.7);
      e.fillStyle = 'rgba(184,242,74,0.55)'; e.fillRect(qx + qw * 0.55, qy + qh * 0.15, qw * 0.38, qh * 0.7);
    }
    x.fillStyle = '#3e4a58'; x.fillRect(X + 2, Y + sh + 2, w - 4, h - sh - 4);
    for (let xx = X + 2; xx < X + w - 2; xx += 2) { x.fillStyle = 'rgba(170,210,240,0.14)'; x.fillRect(xx, Y + sh + 2, 1, h - sh - 4); }
    e.fillStyle = 'rgba(124,224,255,0.16)'; e.fillRect(X + 2, Y + sh + 2, w - 4, h - sh - 4);
  }
  // 边缘封环
  x.strokeStyle = 'rgba(200,200,210,0.35)'; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, H - 6);
  return { map: tex(c), emi: tex(ce) };
}

/** 中介层：RDL 布线 */
export function interposerTexture() {
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#1c2026'; x.fillRect(0, 0, W, H);
  noise(x, W, H, 0.06, 7, 2);
  const R = rng(21);
  x.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const horiz = R() > 0.5;
    const a = R() * W, b = R() * H, l = 30 + R() * 200;
    x.strokeStyle = `rgba(${170 + R() * 50},${150 + R() * 40},${110 + R() * 40},${0.06 + R() * 0.12})`;
    x.beginPath();
    if (horiz) { x.moveTo(a, b); x.lineTo(a + l, b); x.lineTo(a + l + 10, b + 10); }
    else { x.moveTo(a, b); x.lineTo(a, b + l); x.lineTo(a + 10, b + l + 10); }
    x.stroke();
  }
  for (let i = 0; i < 4000; i++) { x.fillStyle = 'rgba(220,200,160,0.10)'; x.fillRect(R() * W, R() * H, 2, 2); }
  return tex(c);
}

/** 有机基板：焊盘、电容位、定位标记 */
export function substrateTexture() {
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  const g = x.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, '#16241e'); g.addColorStop(1, '#0d1612');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  noise(x, W, H, 0.05, 9, 3);
  const R = rng(31);
  // 外圈焊盘阵列
  for (let ring = 0; ring < 3; ring++) {
    const m = 26 + ring * 16;
    for (let t = m; t < W - m; t += 14) {
      for (const [px, py] of [[t, m], [t, H - m], [m, t], [W - m, t]]) {
        x.fillStyle = `rgba(210,170,90,${0.3 + R() * 0.25})`; x.fillRect(px - 3, py - 3, 6, 6);
      }
    }
  }
  // 细走线
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = `rgba(80,140,100,${0.08 + R() * 0.12})`; x.lineWidth = 1;
    const a = R() * W, b = R() * H;
    x.beginPath(); x.moveTo(a, b); x.lineTo(a + (R() - 0.5) * 300, b); x.lineTo(a + (R() - 0.5) * 300, b + (R() - 0.5) * 300); x.stroke();
  }
  // 定位标记
  x.strokeStyle = 'rgba(230,200,130,0.6)'; x.lineWidth = 3;
  for (const [px, py] of [[60, 60], [W - 60, H - 60]]) { x.beginPath(); x.arc(px, py, 12, 0, 7); x.stroke(); }
  return tex(c);
}

/** 印刷电路板（服务器主板 / 托盘） */
export function pcbTexture(seed = 5, tint = '#0e1813') {
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  x.fillStyle = tint; x.fillRect(0, 0, W, H);
  noise(x, W, H, 0.05, seed, 3);
  const R = rng(seed);
  for (let i = 0; i < 520; i++) {
    x.strokeStyle = `rgba(${90 + R() * 60},${150 + R() * 60},${110 + R() * 40},${0.05 + R() * 0.1})`;
    x.lineWidth = R() > 0.9 ? 3 : 1;
    let a = R() * W, b = R() * H;
    x.beginPath(); x.moveTo(a, b);
    for (let k = 0; k < 3; k++) {
      if (R() > 0.5) a += (R() - 0.5) * 400; else b += (R() - 0.5) * 400;
      x.lineTo(a, b);
    }
    x.stroke();
  }
  for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(200,180,120,${0.08 + R() * 0.14})`; x.fillRect(R() * W, R() * H, 3, 3); }
  return tex(c);
}

/** 托盘前面板：通风孔、端口、指示灯。kind: compute | switch | power */
export function panelTextures(kind = 'compute') {
  const W = 1024, H = 64;
  const [c, x] = canvas(W, H);
  const [ce, e] = canvas(W, H);
  const R = rng(kind.length * 17);
  x.fillStyle = kind === 'power' ? '#1b1d21' : '#15171b'; x.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  // 蜂窝通风
  for (let xx = 8; xx < W - 8; xx += 9) for (let yy = 8; yy < H - 8; yy += 9) {
    if (kind === 'switch' && xx > 120 && xx < W - 120) continue;
    x.fillStyle = 'rgba(0,0,0,0.75)'; x.beginPath(); x.arc(xx + ((yy / 9) % 2) * 4, yy, 3, 0, 7); x.fill();
  }
  if (kind === 'switch') {
    // 端口笼
    for (let i = 0; i < 18; i++) {
      const px = 130 + i * 43; x.fillStyle = '#2c3036'; x.fillRect(px, 12, 36, 40); x.fillStyle = '#0a0b0d'; x.fillRect(px + 4, 18, 28, 28);
      e.fillStyle = R() > 0.3 ? 'rgba(184,242,74,0.9)' : 'rgba(124,224,255,0.8)'; e.fillRect(px + 14, 6, 8, 3);
    }
  } else if (kind === 'compute') {
    for (let i = 0; i < 4; i++) { const px = 380 + i * 70; x.fillStyle = '#2b2f35'; x.fillRect(px, 16, 54, 32); x.fillStyle = '#0b0c0e'; x.fillRect(px + 5, 22, 44, 20); }
    for (let i = 0; i < 6; i++) { e.fillStyle = R() > 0.4 ? 'rgba(184,242,74,0.9)' : 'rgba(124,224,255,0.9)'; e.fillRect(700 + i * 18, 28, 8, 8); }
  } else {
    for (let i = 0; i < 6; i++) { const px = 40 + i * 160; x.fillStyle = '#23262b'; x.fillRect(px, 8, 140, 48); x.strokeStyle = 'rgba(255,255,255,0.08)'; x.strokeRect(px, 8, 140, 48); e.fillStyle = 'rgba(255,179,71,0.95)'; e.fillRect(px + 120, 14, 8, 8); }
  }
  // 拉手
  x.fillStyle = '#3a3e45'; x.fillRect(6, 10, 10, 44); x.fillRect(W - 16, 10, 10, 44);
  return { map: tex(c), emi: tex(ce) };
}

/** 柔和的径向光斑（用作粒子/光晕） */
export function dotTexture() {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return tex(c, false, 1);
}
