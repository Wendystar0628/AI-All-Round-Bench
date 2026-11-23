'use strict';
// 生成默认壁纸：黄昏山谷湖泊风景（纯 Node 光栅化 + PNG 编码）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 1600, H = 900;
const buf = Buffer.alloc(W * H * 3);

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }

function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = clamp(Math.round(c[0]), 0, 255);
  buf[i + 1] = clamp(Math.round(c[1]), 0, 255);
  buf[i + 2] = clamp(Math.round(c[2]), 0, 255);
}

// 确定性伪随机
let seed = 20261116;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

const horizon = Math.floor(H * 0.62);

// 天空与地面渐变
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let c;
    if (y < horizon) {
      const t = y / horizon;
      const top = [18, 24, 66], mid = [96, 62, 110], low = [232, 128, 72];
      c = t < 0.55 ? mix(top, mid, t / 0.55) : mix(mid, low, (t - 0.55) / 0.45);
    } else {
      const t = (y - horizon) / (H - horizon);
      const near = [48, 66, 84], far = [16, 20, 40];
      c = mix(near, far, t);
    }
    setPx(x, y, c);
  }
}

// 星星（上半部分）
for (let i = 0; i < 240; i++) {
  const x = Math.floor(rnd() * W), y = Math.floor(rnd() * horizon * 0.55);
  const b = 0.3 + rnd() * 0.7;
  setPx(x, y, [255 * b, 250 * b, 235 * b]);
  if (b > 0.85) { setPx(x + 1, y, [200 * b, 200 * b, 200 * b]); setPx(x, y + 1, [200 * b, 200 * b, 200 * b]); }
}

// 太阳与光晕
const sunX = W * 0.66, sunY = horizon - H * 0.04, sunR = 46;
for (let y = Math.floor(sunY - 160); y < sunY + 160; y++) {
  for (let x = Math.floor(sunX - 160); x < sunX + 160; x++) {
    const d = Math.hypot(x - sunX, y - sunY);
    if (d < 160) {
      const g = Math.pow(1 - d / 160, 2.2) * 0.75;
      const base = [buf[(y * W + x) * 3], buf[(y * W + x) * 3 + 1], buf[(y * W + x) * 3 + 2]];
      setPx(x, y, mix(base, [255, 196, 120], g));
    }
  }
}
for (let y = Math.floor(sunY - sunR); y < sunY + sunR; y++) {
  for (let x = Math.floor(sunX - sunR); x < sunX + sunR; x++) {
    const d = Math.hypot(x - sunX, y - sunY);
    if (d < sunR) setPx(x, y, mix([255, 214, 150], [255, 246, 220], 1 - d / sunR));
  }
}

// 云带
for (let i = 0; i < 7; i++) {
  const cy = horizon * (0.25 + rnd() * 0.5), cx = rnd() * W;
  const cw = 180 + rnd() * 260, chh = 10 + rnd() * 16;
  for (let y = Math.floor(cy - chh * 2); y < cy + chh * 2; y++) {
    for (let x = Math.floor(cx - cw / 2); x < cx + cw / 2; x++) {
      const dx = (x - cx) / (cw / 2), dy = (y - cy) / chh;
      const d = dx * dx + dy * dy * 4;
      if (d < 1) {
        const a = (1 - d) * 0.16;
        const idx = (y * W + x) * 3;
        const base = [buf[idx], buf[idx + 1], buf[idx + 2]];
        setPx(x, y, mix(base, [255, 190, 160], a));
      }
    }
  }
}

// 山脉（三层），多边形扫描填充
function mountain(baseY, amp, color, jag) {
  const pts = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W;
    const y = baseY - (Math.sin(i * 1.7 + jag) * 0.5 + 0.5) * amp - rnd() * amp * 0.4;
    pts.push([x, y]);
  }
  for (let x = 0; x < W; x++) {
    let top = H;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (x >= x0 && x <= x1) { top = lerp(y0, y1, (x - x0) / (x1 - x0)); break; }
    }
    for (let y = Math.max(horizon - 260, Math.floor(top)); y < horizon + 2; y++) setPx(x, y, color);
  }
}
mountain(horizon - 150, 190, [70, 62, 104], 1.3);
mountain(horizon - 90, 140, [48, 44, 78], 4.1);
mountain(horizon - 40, 95, [30, 30, 56], 8.7);

// 湖面反光
for (let y = horizon; y < H; y++) {
  const t = (y - horizon) / (H - horizon);
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 3;
    const wob = Math.sin(x * 0.02 + y * 0.35) * 0.5 + 0.5;
    const streak = Math.pow(Math.max(0, 1 - Math.abs(x - sunX) / (60 + t * 260)), 2) * (0.35 - t * 0.2);
    const shimmer = wob * 0.05 * (1 - t);
    const base = [buf[idx], buf[idx + 1], buf[idx + 2]];
    setPx(x, y, mix(base, [255, 180, 110], clamp(streak + shimmer, 0, 0.6)));
  }
}

// 前景山丘
(function () {
  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i++) pts.push([(i / n) * W, H * 0.86 - (Math.sin(i * 2.1 + 0.4) * 0.5 + 0.5) * 60 - rnd() * 20]);
  for (let x = 0; x < W; x++) {
    let top = H;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (x >= x0 && x <= x1) { top = lerp(y0, y1, (x - x0) / (x1 - x0)); break; }
    }
    for (let y = Math.floor(top); y < H; y++) {
      const t = (y - top) / Math.max(1, H - top);
      setPx(x, y, mix([22, 34, 40], [8, 12, 20], t));
    }
  }
})();

// 树剪影
for (let i = 0; i < 26; i++) {
  const x = Math.floor(rnd() * W), base = H * 0.9 + rnd() * H * 0.08;
  const h = 30 + rnd() * 46, w = 10 + rnd() * 12;
  for (let y = Math.floor(base - h); y < base; y++) {
    for (let xo = -w; xo <= w; xo++) {
      const t = 1 - Math.abs(y - (base - h)) / h;
      const ww = w * (1 - t * 0.75);
      if (Math.abs(xo) < ww) setPx(x + xo, y, [10, 16, 18]);
    }
  }
}

// ---------- PNG 编码 ----------
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 8 })),
  chunk('IEND', Buffer.alloc(0))
]);
const out = path.join(__dirname, '..', 'assets', 'wallpaper.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('written', out, png.length, 'bytes');