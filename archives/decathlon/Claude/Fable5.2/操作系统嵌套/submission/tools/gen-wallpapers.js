'use strict';
// 自制风景壁纸（程序化生成的矢量图）：晨曦山谷 / 夜湖 / 琥珀沙丘。运行一次即可，产物随项目交付。
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'wallpapers');
fs.mkdirSync(OUT, { recursive: true });
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function ridge(r, w, base, amp, rough, n) {
  const pts = [];
  const phase = r() * 10, f1 = 1.5 + r() * 2, f2 = 5 + r() * 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const yy = base - amp * (0.5 + 0.5 * Math.sin(phase + t * f1 * Math.PI)) - amp * 0.35 * Math.sin(phase * 2 + t * f2 * Math.PI) - rough * (r() - 0.5);
    pts.push([t * w, yy]);
  }
  return pts;
}
function pathOf(pts, w, h) { return 'M0,' + h + ' L' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L') + ' L' + w + ',' + h + ' Z'; }
function pine(x, y, s, fill) {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const yy = y - s * (0.25 + i * 0.22), ww = s * (0.34 - i * 0.07);
    d += 'M' + (x - ww).toFixed(1) + ',' + yy.toFixed(1) + ' L' + x.toFixed(1) + ',' + (yy - s * 0.36).toFixed(1) + ' L' + (x + ww).toFixed(1) + ',' + yy.toFixed(1) + ' Z ';
  }
  return '<path d="' + d + '" fill="' + fill + '"/><rect x="' + (x - s * 0.03).toFixed(1) + '" y="' + (y - s * 0.26).toFixed(1) + '" width="' + (s * 0.06).toFixed(1) + '" height="' + (s * 0.26).toFixed(1) + '" fill="' + fill + '"/>';
}
function dawn() {
  const W = 2560, H = 1440, r = rng(24);
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice">';
  s += '<defs>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f4a"/><stop offset=".32" stop-color="#4a3a7c"/><stop offset=".55" stop-color="#c2668c"/><stop offset=".72" stop-color="#f7a56b"/><stop offset=".86" stop-color="#ffd58a"/></linearGradient>' +
    '<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d8"/><stop offset=".25" stop-color="#ffe29a" stop-opacity=".95"/><stop offset=".6" stop-color="#ffb46b" stop-opacity=".35"/><stop offset="1" stop-color="#ff9a6b" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3b27a"/><stop offset=".4" stop-color="#8a5f93"/><stop offset="1" stop-color="#231f48"/></linearGradient>' +
    '<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe8c8" stop-opacity="0"/><stop offset=".5" stop-color="#ffd9b8" stop-opacity=".42"/><stop offset="1" stop-color="#ffd9b8" stop-opacity="0"/></linearGradient>' +
    '<filter id="b6"><feGaussianBlur stdDeviation="6"/></filter></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#sky)"/>';
  for (let i = 0; i < 140; i++) { const x = r() * W, y = r() * H * 0.36, o = (0.25 + r() * 0.6) * (1 - y / (H * 0.4)); s += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (0.6 + r() * 1.3).toFixed(1) + '" fill="#fff" opacity="' + o.toFixed(2) + '"/>'; }
  s += '<circle cx="1640" cy="800" r="520" fill="url(#sun)"/><circle cx="1640" cy="800" r="92" fill="#fff4cf"/>';
  for (let i = 0; i < 9; i++) { const x = r() * W, y = 300 + r() * 380, w = 260 + r() * 520; s += '<ellipse cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" rx="' + w.toFixed(0) + '" ry="' + (14 + r() * 22).toFixed(0) + '" fill="' + (i % 2 ? '#ffc7a0' : '#e58fa3') + '" opacity="' + (0.22 + r() * 0.25).toFixed(2) + '" filter="url(#b6)"/>'; }
  const layers = [[900, 250, 26, '#7d5a94', 0.9], [960, 210, 30, '#5f4683', 1], [1010, 190, 22, '#473771', 1], [1060, 150, 18, '#332a5c', 1]];
  for (const [base, amp, rough, fill, op] of layers) {
    s += '<path d="' + pathOf(ridge(r, W, base, amp, rough, 90), W, H) + '" fill="' + fill + '" opacity="' + op + '"/>';
    s += '<rect x="0" y="' + (base - 60) + '" width="' + W + '" height="150" fill="url(#mist)" opacity=".8"/>';
  }
  s += '<rect x="0" y="1080" width="' + W + '" height="' + (H - 1080) + '" fill="url(#lake)"/>';
  s += '<ellipse cx="1640" cy="1090" rx="140" ry="16" fill="#fff0c8" opacity=".85" filter="url(#b6)"/>';
  for (let i = 0; i < 26; i++) { const y = 1100 + i * 13 + r() * 6, w = 150 - i * 3 + r() * 90, x = 1640 + (r() - 0.5) * 60; s += '<rect x="' + (x - w / 2).toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + (2 + r() * 2.4).toFixed(1) + '" rx="1.5" fill="#ffe2a8" opacity="' + (0.75 - i * 0.025).toFixed(2) + '"/>'; }
  for (let i = 0; i < 60; i++) { const y = 1100 + r() * 330, x = r() * W, w = 60 + r() * 220; s += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + w.toFixed(0) + '" height="1.6" fill="#fff" opacity="' + (0.05 + r() * 0.1).toFixed(2) + '"/>'; }
  const shoreL = [[0, 1090], [220, 1068], [480, 1082], [700, 1100], [860, 1126], [980, 1160], [0, 1160]];
  s += '<path d="M' + shoreL.map(p => p.join(',')).join(' L') + ' Z" fill="#221b44"/>';
  for (let i = 0; i < 46; i++) { const x = r() * 900, y = 1072 + (x / 900) * 60 + r() * 14, sz = 70 + r() * 110 * (1 - x / 1400); s += pine(x, y, sz, i % 3 ? '#1b1638' : '#251d4a'); }
  const shoreR = [[W, 1076], [2330, 1070], [2140, 1088], [2010, 1110], [1940, 1140], [W, 1140]];
  s += '<path d="M' + shoreR.map(p => p.join(',')).join(' L') + ' Z" fill="#221b44"/>';
  for (let i = 0; i < 26; i++) { const x = 1980 + r() * 580, y = 1090 - ((x - 1980) / 580) * 22 + r() * 12, sz = 60 + r() * 100; s += pine(x, y, sz, i % 3 ? '#1b1638' : '#251d4a'); }
  s += '<path d="M0,' + H + ' L0,1330 C300,1270 620,1300 900,1350 C1300,1420 1700,1380 2100,1330 C2300,1305 2460,1310 ' + W + ',1326 L' + W + ',' + H + ' Z" fill="#141029"/>';
  for (let i = 0; i < 220; i++) { const x = r() * W, y = 1320 + r() * 110, hgt = 14 + r() * 34; s += '<path d="M' + x.toFixed(0) + ',' + (y + 20).toFixed(0) + ' q' + (r() * 8 - 4).toFixed(1) + ',' + (-hgt / 2).toFixed(1) + ' ' + (r() * 14 - 7).toFixed(1) + ',' + (-hgt).toFixed(1) + '" stroke="#221a42" stroke-width="2" fill="none"/>'; }
  for (let i = 0; i < 7; i++) { const x = 1100 + r() * 500, y = 520 + r() * 180, w = 9 + r() * 8; s += '<path d="M' + x.toFixed(0) + ',' + y.toFixed(0) + ' q' + (w / 2).toFixed(1) + ',' + (-w / 2).toFixed(1) + ' ' + w.toFixed(1) + ',0 q' + (w / 2).toFixed(1) + ',' + (-w / 2).toFixed(1) + ' ' + w.toFixed(1) + ',0" stroke="#2a2250" stroke-width="2.2" fill="none" stroke-linecap="round"/>'; }
  s += '</svg>';
  return s;
}
function night() {
  const W = 2560, H = 1440, r = rng(7);
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice"><defs>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050816"/><stop offset=".5" stop-color="#0f1b3d"/><stop offset=".85" stop-color="#1d3b5f"/></linearGradient>' +
    '<radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#eaf6ff" stop-opacity=".5"/><stop offset="1" stop-color="#9fd0ff" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3b5f"/><stop offset="1" stop-color="#050816"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#sky)"/>';
  for (let i = 0; i < 420; i++) { const x = r() * W, y = r() * H * 0.66; s += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (0.5 + r() * 1.5).toFixed(1) + '" fill="#fff" opacity="' + (0.25 + r() * 0.7).toFixed(2) + '"/>'; }
  s += '<circle cx="640" cy="360" r="320" fill="url(#moon)"/><circle cx="640" cy="360" r="78" fill="#f2f8ff"/><circle cx="668" cy="344" r="70" fill="#0c1634"/>';
  const cols = ['#16284d', '#122143', '#0e1a38', '#0b142c', '#080f22'];
  for (let i = 0; i < 5; i++) {
    let d = 'M0,' + H + ' L';
    for (let k = 0; k < 60; k++) d += (k / 59 * W).toFixed(0) + ',' + (940 + i * 40 - (190 - i * 34) * (0.5 + 0.5 * Math.sin(i * 2.1 + k / 59 * (3 + i) * Math.PI)) - r() * 14).toFixed(0) + ' L';
    s += '<path d="' + d + W + ',' + H + ' Z" fill="' + cols[i] + '"/>';
  }
  s += '<rect y="1110" width="' + W + '" height="330" fill="url(#lake)"/>';
  for (let i = 0; i < 22; i++) { const y = 1120 + i * 13, w = 120 - i * 3 + r() * 60; s += '<rect x="' + (640 - w / 2 + (r() - 0.5) * 30).toFixed(0) + '" y="' + y + '" width="' + w.toFixed(0) + '" height="2.4" rx="1.2" fill="#dff0ff" opacity="' + (0.55 - i * 0.02).toFixed(2) + '"/>'; }
  s += '<path d="M1400,1120 C1700,1090 2200,1094 ' + W + ',1100 L' + W + ',1150 L1400,1150 Z" fill="#060b19"/>';
  for (let i = 0; i < 40; i++) { const x = 1500 + r() * 1060, y = 1100 + r() * 16, sz = 60 + r() * 120; s += pine(x, y, sz, '#060b19'); }
  s += '</svg>';
  return s;
}
function dunes() {
  const W = 2560, H = 1440, r = rng(99);
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice"><defs>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27304f"/><stop offset=".45" stop-color="#8f6a7f"/><stop offset=".7" stop-color="#f0b276"/><stop offset=".9" stop-color="#ffe0a3"/></linearGradient>' +
    '<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#ffb46b" stop-opacity="0"/></radialGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#sky)"/><circle cx="1900" cy="760" r="420" fill="url(#sun)"/><circle cx="1900" cy="760" r="70" fill="#fff4cf"/>';
  const cols = ['#c98a5a', '#b3724a', '#99583c', '#7c4330', '#5c2f25', '#3d1f1c'];
  for (let i = 0; i < 6; i++) {
    const base = 860 + i * 96, amp = 150 - i * 12, ph = r() * 6;
    let d = 'M0,' + H + ' L';
    for (let k = 0; k <= 80; k++) { const t = k / 80; d += (t * W).toFixed(0) + ',' + (base - amp * Math.pow(0.5 + 0.5 * Math.sin(ph + t * (2.2 + i * 0.7) * Math.PI), 1.6)).toFixed(0) + ' '; }
    s += '<path d="' + d + ' L' + W + ',' + H + ' Z" fill="' + cols[i] + '"/>';
  }
  s += '</svg>';
  return s;
}
fs.writeFileSync(path.join(OUT, 'dawn-valley.svg'), dawn());
fs.writeFileSync(path.join(OUT, 'night-lake.svg'), night());
fs.writeFileSync(path.join(OUT, 'amber-dunes.svg'), dunes());
console.log('wallpapers written');
