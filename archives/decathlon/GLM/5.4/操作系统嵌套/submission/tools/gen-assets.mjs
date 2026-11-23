// 生成壁纸（自制的风景图，随项目交付）
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets');
fs.mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  console.log('生成', path.basename(file), (png.length / 1024).toFixed(0) + 'KB');
}

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const noise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi + yi * 57), b = hash(xi + 1 + yi * 57), c = hash(xi + (yi + 1) * 57), d = hash(xi + 1 + (yi + 1) * 57);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
};
const fbm = (x, y, o = 5) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < o; i++) { s += noise(x * f, y * f) * amp; f *= 2; amp *= 0.5; } return s; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function landscape(name, W, H, palette, seed) {
  const buf = Buffer.alloc(W * H * 3);
  const horizon = H * 0.56;
  const sunX = W * 0.72, sunY = H * 0.30, sunR = H * 0.055;
  const ridges = [
    { base: 0.50, amp: 0.16, freq: 0.0016, col: palette.far, mix: 0.55 },
    { base: 0.56, amp: 0.13, freq: 0.0026, col: palette.mid, mix: 0.30 },
    { base: 0.62, amp: 0.10, freq: 0.0042, col: palette.near, mix: 0.12 },
    { base: 0.68, amp: 0.07, freq: 0.0072, col: palette.fore, mix: 0.0 }
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col;
      if (y < horizon) {
        const t = y / horizon;
        col = mix(palette.skyTop, palette.skyBot, Math.pow(t, 1.25));
        const dx = (x - sunX) / W, dy = (y - sunY) / H;
        const d = Math.sqrt(dx * dx + dy * dy);
        const glow = Math.exp(-d * 9) * 0.85 + Math.exp(-d * 30) * 0.6;
        col = mix(col, palette.sun, Math.min(1, glow));
        if (d < sunR / H) col = mix(col, [255, 246, 220], 0.95);
        // 星星
        if (t < 0.35) {
          const s = hash(x * 0.37 + y * 0.91 + seed);
          if (s > 0.9985) { const k = (0.35 - t) / 0.35; col = mix(col, [235, 240, 255], 0.55 * k); }
        }
        // 云带
        const cl = fbm(x * 0.0016 + seed, y * 0.004, 4);
        if (cl > 0.55) col = mix(col, palette.cloud, Math.min(0.35, (cl - 0.55) * 1.4) * (0.3 + 0.7 * t));
      } else {
        // 湖面：反射天空 + 山脊
        const ry = horizon - (y - horizon) * 0.9;
        const ripple = Math.sin(y * 0.35 + fbm(x * 0.01, y * 0.05, 3) * 8) * 3;
        const t2 = Math.max(0, ry) / horizon;
        col = mix(palette.skyTop, palette.skyBot, Math.pow(Math.min(1, t2), 1.25));
        const dx = (x - sunX) / W, dy = (Math.max(0, ry) - sunY) / H;
        const d = Math.sqrt(dx * dx + dy * dy);
        col = mix(col, palette.sun, Math.min(0.8, Math.exp(-d * 10) * 0.8));
        col = mix(col, palette.water, 0.42 + ripple * 0.01);
      }
      // 山脊
      for (let i = ridges.length - 1; i >= 0; i--) {
        const r = ridges[i];
        const hgt = horizon - (r.base - 0.5) * H * 1.6 - fbm(x * r.freq + seed * (i + 1), i * 3.1, 5) * r.amp * H;
        if (y > hgt && y < horizon + (i === ridges.length - 1 ? H : 0)) {
          const depth = Math.min(1, (y - hgt) / (H * 0.25));
          let c = mix(r.col, palette.haze, r.mix + depth * 0.15);
          const shade = fbm(x * 0.006, y * 0.006, 3) * 0.18;
          c = [c[0] * (0.85 + shade), c[1] * (0.85 + shade), c[2] * (0.85 + shade)];
          if (y > horizon) {
            // 水中倒影
            const ry2 = horizon - (y - horizon) * 0.9;
            if (ry2 < hgt) c = mix(c, palette.water, 0.55);
          }
          col = c;
        }
      }
      // 雾气
      const fog = Math.exp(-Math.abs(y - horizon) / (H * 0.09)) * 0.35;
      col = mix(col, palette.haze, fog);
      // 暗角
      const vx = (x / W - 0.5) * 2, vy = (y / H - 0.5) * 2;
      const vig = 1 - Math.min(0.42, (vx * vx + vy * vy) * 0.22);
      const i = (y * W + x) * 3;
      buf[i] = Math.max(0, Math.min(255, col[0] * vig));
      buf[i + 1] = Math.max(0, Math.min(255, col[1] * vig));
      buf[i + 2] = Math.max(0, Math.min(255, col[2] * vig));
    }
  }
  writePNG(path.join(outDir, name), W, H, buf);
}

landscape('wallpaper-root.png', 2560, 1440, {
  skyTop: [22, 26, 62], skyBot: [242, 150, 92], sun: [255, 206, 150], cloud: [120, 92, 132],
  far: [86, 74, 122], mid: [62, 54, 92], near: [40, 38, 64], fore: [22, 24, 38],
  water: [28, 34, 62], haze: [150, 110, 140]
}, 3.7);
landscape('wallpaper-dusk.png', 1920, 1080, {
  skyTop: [12, 18, 46], skyBot: [236, 120, 96], sun: [255, 190, 140], cloud: [96, 70, 110],
  far: [70, 58, 104], mid: [50, 44, 80], near: [32, 30, 54], fore: [16, 18, 30],
  water: [22, 28, 52], haze: [140, 96, 130]
}, 8.1);
landscape('wallpaper-mist.png', 1920, 1080, {
  skyTop: [26, 40, 56], skyBot: [176, 196, 190], sun: [240, 240, 220], cloud: [150, 168, 168],
  far: [92, 112, 116], mid: [66, 88, 92], near: [42, 62, 64], fore: [24, 38, 38],
  water: [34, 54, 58], haze: [190, 204, 200]
}, 12.3);
landscape('wallpaper-terra.png', 1920, 1080, {
  skyTop: [30, 22, 40], skyBot: [214, 140, 90], sun: [255, 200, 140], cloud: [120, 80, 80],
  far: [96, 66, 70], mid: [72, 50, 56], near: [48, 36, 40], fore: [26, 22, 26],
  water: [40, 30, 34], haze: [160, 110, 100]
}, 21.9);
