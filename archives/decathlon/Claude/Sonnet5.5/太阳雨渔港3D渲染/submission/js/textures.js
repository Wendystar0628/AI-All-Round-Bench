'use strict';
/* 全部纹理由画布程序生成：告示牌、黑板、时刻表、贩卖机、渔网…… */
function wornOverlay(x, w, h, amt = 0.25) {          // 褪色/磨损
  for (let i = 0; i < 160 * amt * 4; i++) {
    x.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${210 + Math.random() * 45 | 0},${200 + Math.random() * 55 | 0},${Math.random() * 0.12})`;
    x.fillRect(Math.random() * w, Math.random() * h, Math.random() * 14 + 2, Math.random() * 3 + 0.5);
  }
}
function texBlackboard() {
  const c = mkCanvas(512, 288), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 288); g.addColorStop(0, '#1f3a34'); g.addColorStop(1, '#17302b');
  x.fillStyle = g; x.fillRect(0, 0, 512, 288);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(230,240,235,${Math.random() * 0.05})`; x.beginPath(); x.ellipse(Math.random() * 512, Math.random() * 288, 30 + Math.random() * 60, 6 + Math.random() * 14, Math.random(), 0, 6.3); x.fill(); }
  x.fillStyle = '#f2f0e0'; x.textBaseline = 'middle';
  x.font = `bold 38px ${FONT_CJK}`; x.fillText('本日入札', 150, 32);
  x.strokeStyle = '#f2f0e0'; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 58); x.lineTo(300, 58); x.stroke();
  x.font = `30px ${FONT_CJK}`;
  const rows = [['鯵', '¥ 380'], ['鯖', '¥ 260'], ['鰤', '¥ 1250'], ['烏賊', '¥ 640'], ['蛸', '¥ 980']];
  rows.forEach((r, i) => { x.fillStyle = i === 2 ? '#ffe27a' : '#f2f0e0'; x.fillText(r[0], 30, 90 + i * 38); x.fillText(r[1], 160, 90 + i * 38); x.font = `20px ${FONT_CJK}`; x.fillText('/kg', 255, 94 + i * 38); x.font = `30px ${FONT_CJK}`; });
  // 粉笔画的小鱼
  x.strokeStyle = '#9fe0f0'; x.lineWidth = 3; x.beginPath(); x.ellipse(405, 100, 45, 22, 0, 0, 6.3); x.stroke();
  x.beginPath(); x.moveTo(450, 100); x.lineTo(485, 80); x.lineTo(485, 120); x.closePath(); x.stroke();
  x.beginPath(); x.arc(380, 94, 4, 0, 6.3); x.stroke();
  x.strokeStyle = '#ffd6e0'; x.beginPath(); x.moveTo(330, 190); x.lineTo(470, 190); x.stroke();
  x.fillStyle = '#ffd6e0'; x.font = `22px ${FONT_CJK}`; x.fillText('入札 15:30', 340, 215); x.fillText('雨天 ☂ 注意', 340, 245);
  x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(0, 0, 512, 4);
  return canvasTex(c);
}
function texTimetable() {
  const c = mkCanvas(256, 320), x = c.getContext('2d');
  x.fillStyle = '#efe8cf'; x.fillRect(0, 0, 256, 320);
  x.fillStyle = '#6f98a8'; x.fillRect(0, 0, 256, 54);
  x.fillStyle = '#f7f3e3'; x.font = `bold 28px ${FONT_CJK}`; x.textBaseline = 'middle'; x.fillText('渡船时刻表', 14, 27);
  x.font = `15px ${FONT_CJK}`; x.fillStyle = '#4a6d7a'; x.fillText('日和港 → 小凪岛', 14, 72);
  const t = ['07:10', '09:30', '11:50', '14:20', '16:05', '17:40', '19:10'];
  t.forEach((s, i) => { x.fillStyle = i === 4 ? '#b6483c' : '#5a7581'; x.font = `bold 22px monospace`; x.fillText(s, 20 + (i % 2) * 120, 108 + Math.floor(i / 2) * 36); });
  x.strokeStyle = 'rgba(80,110,125,0.5)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(12, 124 + i * 36); x.lineTo(244, 124 + i * 36); x.stroke(); }
  x.fillStyle = '#7e8f94'; x.font = `13px ${FONT_CJK}`; x.fillText('※ 荒天时停航', 14, 262); x.fillText('※ 乘船请提前5分钟', 14, 282);
  wornOverlay(x, 256, 320, 1);
  x.fillStyle = 'rgba(255,250,235,0.35)'; x.fillRect(0, 0, 256, 320);   // 褪色
  return canvasTex(c);
}
function texClock() {
  const c = mkCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#f6f4ea'; x.beginPath(); x.arc(64, 64, 62, 0, 6.3); x.fill();
  x.strokeStyle = '#5b4a38'; x.lineWidth = 7; x.beginPath(); x.arc(64, 64, 60, 0, 6.3); x.stroke();
  x.fillStyle = '#3b3a38'; x.font = `bold 15px ${FONT_CJK}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = i / 12 * 6.283 - 1.5708; x.fillText(String(i), 64 + Math.cos(a) * 45, 64 + Math.sin(a) * 45); }
  x.strokeStyle = '#2a2a2a'; x.lineCap = 'round'; x.lineWidth = 4; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(-0.5) * 28, 64 + Math.sin(-0.5) * 28); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(1.9) * 38, 64 + Math.sin(1.9) * 38); x.stroke();
  x.strokeStyle = '#c0392b'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(3.6) * 40, 64 + Math.sin(3.6) * 40); x.stroke();
  x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(64, 64, 3.5, 0, 6.3); x.fill();
  return canvasTex(c);
}
function texVending() {
  const c = mkCanvas(256, 512), x = c.getContext('2d');
  x.fillStyle = '#2f7f93'; x.fillRect(0, 0, 256, 512);
  x.fillStyle = '#f6f1df'; x.fillRect(10, 10, 236, 40);
  x.fillStyle = '#2a6a7a'; x.font = `bold 26px ${FONT_CJK}`; x.textBaseline = 'middle'; x.fillText('冷たい あったか〜い', 20, 31);
  x.fillStyle = '#e9f6f4'; x.fillRect(10, 58, 190, 300);       // 展示窗
  const cols = ['#e04b3a', '#f2b632', '#3aa0d8', '#5cb85c', '#e8e8e8', '#8e5bb5', '#f08a3a', '#2e86c1'];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) {
    const px = 18 + k * 36, py = 66 + r * 72, col = cols[(r * 5 + k * 3) % cols.length];
    x.fillStyle = col; x.fillRect(px, py + 8, 24, 48); x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(px + 3, py + 12, 5, 38); x.fillStyle = '#f6f6f6'; x.fillRect(px + 4, py + 28, 16, 10);
    x.fillStyle = '#222'; x.fillRect(px + 7, py + 2, 10, 6);
    x.fillStyle = '#ffe9a0'; x.fillRect(px - 1, py + 58, 26, 11); x.fillStyle = '#c0392b'; x.font = '9px monospace'; x.fillText('130', px + 2, py + 64);
  }
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.moveTo(10, 58); x.lineTo(90, 58); x.lineTo(10, 180); x.fill();
  x.fillStyle = '#d9e4e4'; x.fillRect(208, 62, 36, 100);    // 投币区
  x.fillStyle = '#26333a'; x.fillRect(214, 70, 24, 10); x.fillRect(218, 92, 16, 28);
  x.fillStyle = '#e24d3d'; x.beginPath(); x.arc(226, 140, 9, 0, 6.3); x.fill();
  x.fillStyle = '#26333a'; x.fillRect(208, 170, 36, 22);
  x.fillStyle = '#213a44'; x.fillRect(10, 366, 236, 136);     // 取物口
  x.fillStyle = '#0f2229'; x.fillRect(46, 390, 164, 90);
  x.fillStyle = '#f6f1df'; x.font = `bold 18px ${FONT_CJK}`; x.fillText('日和港 自販機', 56, 376);
  return canvasTex(c);
}
function texSign() {
  const c = mkCanvas(640, 320), x = c.getContext('2d');
  x.fillStyle = '#2d6f7e'; x.fillRect(0, 0, 640, 320);
  x.strokeStyle = '#e9efe4'; x.lineWidth = 10; x.strokeRect(14, 14, 612, 292);
  x.fillStyle = '#f2f0e2'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 108px ${FONT_CJK}`; x.fillText('日和渔港', 320, 105);
  x.font = `bold 30px Georgia, serif`; x.fillText('H I Y O R I   P O R T', 320, 186);
  x.fillStyle = '#d8453a'; x.fillRect(60, 214, 520, 70);
  x.fillStyle = '#fbf3e0'; x.font = `bold 50px ${FONT_CJK}`; x.fillText('注意落水', 320, 250);
  // 褪色、划痕、雨渍
  for (let i = 0; i < 220; i++) { x.fillStyle = `rgba(235,240,225,${Math.random() * 0.12})`; x.fillRect(Math.random() * 640, Math.random() * 320, Math.random() * 40 + 3, Math.random() * 2 + 0.5); }
  const g = x.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, 'rgba(255,255,240,0.22)'); g.addColorStop(1, 'rgba(255,255,240,0.0)'); x.fillStyle = g; x.fillRect(0, 0, 640, 320);
  for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(140,90,50,0.18)'; x.fillRect(30 + Math.random() * 580, 20 + Math.random() * 120, 3 + Math.random() * 4, 80 + Math.random() * 150); }
  return canvasTex(c);
}
function texNet(w = 256, h = 256, cell = 16, col = '#d8d2b8') {
  const c = mkCanvas(w, h), x = c.getContext('2d');
  x.clearRect(0, 0, w, h); x.strokeStyle = col; x.lineWidth = 2.2;
  for (let i = -h; i < w + h; i += cell) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); }
  x.fillStyle = col; for (let i = 0; i < w; i += cell) for (let j = 0; j < h; j += cell) { if (((i + j) / cell) % 2 === 0) { x.beginPath(); x.arc(i, j, 1.8, 0, 6.3); x.fill(); } }
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function texBuoy(num, base) {
  const c = mkCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#f2efe4'; x.fillRect(0, 44, 128, 44);
  x.fillStyle = '#7b4a3c'; x.font = `bold 44px ${FONT_CJK}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), 64, 68);
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,250,235,${Math.random() * 0.2})`; x.fillRect(Math.random() * 128, Math.random() * 128, Math.random() * 14 + 2, Math.random() * 3 + 1); }
  x.fillStyle = 'rgba(120,80,40,.25)'; for (let i = 0; i < 8; i++) x.fillRect(Math.random() * 128, Math.random() * 128, 3, 16);
  const t = canvasTex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
function texScaleDial() {
  const c = mkCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#f4f1e4'; x.beginPath(); x.arc(64, 64, 62, 0, 6.3); x.fill();
  x.strokeStyle = '#2b2b2b'; x.lineWidth = 2;
  for (let i = 0; i <= 40; i++) { const a = 2.4 + i / 40 * 4.5; const r0 = i % 5 === 0 ? 46 : 52; x.beginPath(); x.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); x.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); x.stroke(); }
  x.fillStyle = '#2b2b2b'; x.font = 'bold 13px sans-serif'; x.textAlign = 'center'; x.fillText('kg', 64, 92);
  for (let i = 0; i <= 8; i++) { const a = 2.4 + i / 8 * 4.5; x.fillText(String(i * 5), 64 + Math.cos(a) * 38, 68 + Math.sin(a) * 38); }
  x.strokeStyle = '#c0392b'; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(4.7) * 44, 64 + Math.sin(4.7) * 44); x.stroke();
  x.fillStyle = '#c0392b'; x.beginPath(); x.arc(64, 64, 5, 0, 6.3); x.fill();
  return canvasTex(c);
}
function texRadio() {
  const c = mkCanvas(128, 64), x = c.getContext('2d');
  x.fillStyle = '#c9b690'; x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#6a5a42'; for (let i = 0; i < 12; i++) x.fillRect(6, 8 + i * 4.3, 56, 2);
  x.fillStyle = '#f3ecd3'; x.fillRect(70, 8, 52, 22);
  x.strokeStyle = '#3a3a3a'; x.lineWidth = 1; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(72 + i * 4.2, 22); x.lineTo(72 + i * 4.2, 28); x.stroke(); }
  x.strokeStyle = '#c0392b'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(94, 9); x.lineTo(94, 29); x.stroke();
  x.fillStyle = '#4a3e30'; x.beginPath(); x.arc(84, 46, 8, 0, 6.3); x.fill(); x.beginPath(); x.arc(110, 46, 8, 0, 6.3); x.fill();
  return canvasTex(c);
}
function texNotice() {   // 候船室告示 / 日历
  const c = mkCanvas(128, 160), x = c.getContext('2d');
  x.fillStyle = '#f2efe0'; x.fillRect(0, 0, 128, 160);
  x.fillStyle = '#c0504a'; x.fillRect(0, 0, 128, 34);
  x.fillStyle = '#fbf6e8'; x.font = `bold 24px ${FONT_CJK}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('十月', 64, 18);
  x.fillStyle = '#4a4a44'; x.font = '12px monospace'; x.textAlign = 'left';
  for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) { const d = r * 7 + k + 1; if (d > 31) break; x.fillStyle = k === 0 ? '#c0392b' : (k === 6 ? '#2a6ba5' : '#4a4a44'); x.fillText(String(d).padStart(2, ' '), 6 + k * 17, 52 + r * 20); }
  x.strokeStyle = '#c0392b'; x.lineWidth = 2; x.beginPath(); x.arc(6 + 3 * 17 + 8, 52 + 20 * 2 - 4, 10, 0, 6.3); x.stroke();
  wornOverlay(x, 128, 160, 0.5);
  return canvasTex(c);
}
function texWood(w = 256, h = 256, base = '#b9946a', dark = '#8d6a46') {
  const c = mkCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(${parseInt(dark.slice(1, 3), 16)},${parseInt(dark.slice(3, 5), 16)},${parseInt(dark.slice(5, 7), 16)},${0.1 + Math.random() * 0.25})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const y0 = Math.random() * h; x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + Math.random() * 6 - 3, w * 0.6, y0 + Math.random() * 6 - 3, w, y0 + Math.random() * 6 - 3); x.stroke(); }
  x.strokeStyle = 'rgba(60,40,20,0.45)'; x.lineWidth = 2; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(0, i * h / 5); x.lineTo(w, i * h / 5); x.stroke(); }
  const t = canvasTex(c, { repeat: [1, 1] }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function texCaustic() {            // 水面反光投在天花板/墙上：用于叠加
  const c = mkCanvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  x.lineCap = 'round';
  for (let k = 0; k < 46; k++) {
    x.strokeStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.6})`; x.lineWidth = 1.5 + Math.random() * 3;
    const px = Math.random() * 256, py = Math.random() * 256, len = 14 + Math.random() * 40, a = Math.random() * 0.5 - 0.25;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + len * 0.5, py + Math.sin(a * 6) * 8, px + len, py + a * 20); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function texCoopSign() {
  const c = mkCanvas(512, 128), x = c.getContext('2d');
  x.fillStyle = '#f3efe0'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#2b6f86'; x.fillRect(0, 0, 512, 22); x.fillRect(0, 106, 512, 22);
  x.fillStyle = '#1f4f63'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 56px ${FONT_CJK}`; x.fillText('日和港漁協', 256, 58);
  x.font = `18px ${FONT_CJK}`; x.fillStyle = '#4a7a8a'; x.fillText('水産物荷捌所 · 競り 15:30', 256, 98);
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(150,130,100,${Math.random() * 0.10})`; x.fillRect(Math.random() * 512, Math.random() * 128, Math.random() * 3 + 1, Math.random() * 40 + 8); }
  x.fillStyle = 'rgba(255,255,245,0.25)'; x.fillRect(0, 0, 512, 128);
  return canvasTex(c);
}
function texWaitSign() {
  const c = mkCanvas(512, 96), x = c.getContext('2d');
  x.fillStyle = '#2d6f7e'; x.fillRect(0, 0, 512, 96);
  x.strokeStyle = '#f3efe0'; x.lineWidth = 5; x.strokeRect(6, 6, 500, 84);
  x.fillStyle = '#f6f2e4'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 46px ${FONT_CJK}`; x.fillText('待合室', 150, 50);
  x.font = `20px ${FONT_CJK}`; x.fillText('渡船のりば  FERRY', 360, 50);
  for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(240,245,235,${Math.random() * 0.12})`; x.fillRect(Math.random() * 512, Math.random() * 96, Math.random() * 20 + 2, 2); }
  return canvasTex(c);
}

function texWetSign() {
  const c = mkCanvas(128, 192), x = c.getContext('2d');
  x.fillStyle = '#f4c82a'; x.fillRect(0, 0, 128, 192);
  x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 34px ${FONT_CJK}`; x.fillText('注意', 64, 34); x.fillText('地滑', 64, 74);
  x.fillStyle = '#d63a2e'; x.beginPath(); x.moveTo(64, 98); x.lineTo(104, 160); x.lineTo(24, 160); x.closePath(); x.fill();
  x.fillStyle = '#fff'; x.font = `bold 40px ${FONT_CJK}`; x.fillText('!', 64, 138);
  x.strokeStyle = '#222'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 186);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,230,${Math.random() * 0.15})`; x.fillRect(Math.random() * 128, Math.random() * 192, 8, 2); }
  return canvasTex(c);
}
