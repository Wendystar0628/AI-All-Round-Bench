'use strict';
// 生成三张风景壁纸（SVG，手绘配色与几何）：默认、黄昏、夜色。用法：node tools/make-wallpapers.js
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'assets', 'wallpaper');

// 确定性的伪随机，保证每次生成结果一致
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function ridge(seed, baseY, amp, color, W, H, steps) {
  const r = rng(seed);
  let d = `M0 ${H} L0 ${baseY}`;
  const pts = [];
  let y = baseY;
  for (let i = 0; i <= steps; i++) {
    const x = (W / steps) * i;
    y = Math.max(baseY - amp, Math.min(baseY + amp * 0.35, y + (r() - 0.5) * amp * 0.9));
    pts.push([x, y]);
  }
  for (const [x, yy] of pts) d += ` L${x.toFixed(1)} ${yy.toFixed(1)}`;
  d += ` L${W} ${H} Z`;
  return `<path d="${d}" fill="${color}"/>`;
}

function trees(seed, baseY, color, W, count) {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const h = 26 + r() * 30;
    const w = h * 0.42;
    s += `<path d="M${x.toFixed(1)} ${baseY} L${(x - w).toFixed(1)} ${(baseY - h * 0.2).toFixed(1)} L${(x + w).toFixed(1)} ${(baseY - h * 0.2).toFixed(1)} Z" fill="${color}"/>`;
    s += `<path d="M${x.toFixed(1)} ${(baseY - h * 0.25).toFixed(1)} L${(x - w * 0.8).toFixed(1)} ${(baseY - h * 0.7).toFixed(1)} L${(x + w * 0.8).toFixed(1)} ${(baseY - h * 0.7).toFixed(1)} Z" fill="${color}"/>`;
    s += `<path d="M${x.toFixed(1)} ${(baseY - h * 0.55).toFixed(1)} L${(x - w * 0.55).toFixed(1)} ${(baseY - h).toFixed(1)} L${(x + w * 0.55).toFixed(1)} ${(baseY - h).toFixed(1)} Z" fill="${color}"/>`;
  }
  return s;
}

function scene({ name, sky, sun, far, mid, near, lake, treeColor, stars, glow }) {
  const W = 1920, H = 1080;
  const parts = [];
  parts.push(`<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="0.65" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lake[0]}"/><stop offset="1" stop-color="${lake[1]}"/></linearGradient>
    <radialGradient id="sunglow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${sun}" stop-opacity="0.95"/><stop offset="0.35" stop-color="${sun}" stop-opacity="0.35"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>
  </defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
  if (stars) {
    const r = rng(7);
    for (let i = 0; i < 160; i++) {
      parts.push(`<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * 560).toFixed(0)}" r="${(0.6 + r() * 1.6).toFixed(2)}" fill="#ffffff" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`);
    }
  }
  parts.push(`<circle cx="1450" cy="520" r="420" fill="url(#sunglow)"/>`);
  parts.push(`<circle cx="1450" cy="520" r="${glow ? 110 : 96}" fill="${sun}"/>`);
  parts.push(ridge(11, 640, 230, far, W, H, 26));
  parts.push(ridge(23, 760, 170, mid, W, H, 22));
  parts.push(`<rect y="790" width="${W}" height="300" fill="url(#lake)"/>`);
  parts.push(ridge(41, 830, 90, near, W, H, 18));
  parts.push(trees(57, 860, treeColor, W, 90));
  parts.push(`<rect y="1000" width="${W}" height="80" fill="${near}"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  fs.writeFileSync(path.join(out, name + '.svg'), svg, 'utf8');
}

scene({ name: 'landscape', sky: ['#9fd3ff', '#cfe8ff', '#f4f1e6'], sun: '#fff1c2', far: '#8fa7c9', mid: '#5f7fa6', near: '#2f4e5a', lake: ['#6fa9b8', '#2c5966'], treeColor: '#1f3b3d', stars: false, glow: false });
scene({ name: 'dusk', sky: ['#2b2350', '#8a4f7a', '#f29a6b'], sun: '#ffd4a1', far: '#5b3f72', mid: '#3c2a52', near: '#241a36', lake: ['#c26b7a', '#4a2d4f'], treeColor: '#1b1330', stars: false, glow: true });
scene({ name: 'night', sky: ['#0b1030', '#1b2552', '#2d3a72'], sun: '#e8ecff', far: '#1f2a52', mid: '#16203f', near: '#0c1229', lake: ['#2a3f73', '#0a1126'], treeColor: '#070c1e', stars: true, glow: false });
console.log('wallpapers written');
