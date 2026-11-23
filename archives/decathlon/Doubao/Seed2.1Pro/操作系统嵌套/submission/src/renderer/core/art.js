/* 自制美术：程序生成风景壁纸、应用图标、直升机贴图。无任何外部图片素材。 */
'use strict';
window.NOS = window.NOS || {};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d'), w, h };
}

function noise(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* 黄昏山谷风景：渐变天空、太阳、层叠山、湖泊、草地、树剪影 */
function paintLandscape(ctx, w, h, variant) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (variant === 'night') {
    sky.addColorStop(0, '#0b1030'); sky.addColorStop(0.55, '#243056'); sky.addColorStop(1, '#5a4a78');
  } else if (variant === 'dawn') {
    sky.addColorStop(0, '#2b2a5e'); sky.addColorStop(0.5, '#c96a8c'); sky.addColorStop(0.78, '#f2b36b'); sky.addColorStop(1, '#f7dc9a');
  } else {
    sky.addColorStop(0, '#2f3a78'); sky.addColorStop(0.45, '#7d6fb0'); sky.addColorStop(0.72, '#e89a72'); sky.addColorStop(1, '#f6d98b');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 星星（夜）
  if (variant === 'night') {
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * w, y = Math.random() * h * 0.5;
      ctx.globalAlpha = 0.3 + Math.random() * 0.7;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // 太阳/月
  const sunY = h * 0.56, sunX = w * 0.68;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, h * 0.4);
  glow.addColorStop(0, 'rgba(255,236,180,.9)'); glow.addColorStop(1, 'rgba(255,236,180,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = variant === 'night' ? '#f2f0e0' : '#ffe9b0';
  ctx.beginPath(); ctx.arc(sunX, sunY, h * 0.06, 0, 7); ctx.fill();

  // 远山多层
  const layers = [
    { base: 0.62, amp: 0.10, color: variant === 'night' ? '#1c2347' : '#6f5f93', seed: 3 },
    { base: 0.70, amp: 0.09, color: variant === 'night' ? '#151b38' : '#55507f', seed: 7 },
    { base: 0.80, amp: 0.07, color: variant === 'night' ? '#10152c' : '#3d3f68', seed: 13 },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    let seed = L.seed;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let x = 0; x <= w; x += 12) {
      const y = h * L.base + Math.sin(x * 0.004 + L.seed) * h * L.amp * 0.6 + rnd() * h * L.amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  }

  // 湖泊
  const lakeY = h * 0.8;
  const lake = ctx.createLinearGradient(0, lakeY, 0, h);
  lake.addColorStop(0, variant === 'night' ? '#1a2542' : '#8a76a8');
  lake.addColorStop(1, variant === 'night' ? '#0c1226' : '#4c4370');
  ctx.fillStyle = lake; ctx.fillRect(0, lakeY, w, h - lakeY);
  // 湖面反光
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 14; i++) {
    const y = lakeY + 8 + i * ((h - lakeY) / 16);
    const lw = w * (0.1 + Math.random() * 0.2) + Math.abs(sunX - w / 2) * 0.2;
    ctx.fillStyle = variant === 'night' ? '#3a4a78' : '#f7e2b2';
    ctx.fillRect(sunX - lw / 2 + (Math.random() - 0.5) * 40, y, lw, 2);
  }
  ctx.restore();

  // 前景草坡
  ctx.fillStyle = variant === 'night' ? '#0b0f1c' : '#2e3326';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 24) ctx.lineTo(x, h * 0.88 + Math.sin(x * 0.01) * h * 0.02);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

  // 树剪影
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w;
    const y = h * (0.84 + Math.random() * 0.12);
    const s = h * (0.02 + Math.random() * 0.03);
    ctx.fillStyle = variant === 'night' ? '#070a14' : '#222618';
    ctx.fillRect(x - s * 0.08, y, s * 0.16, s * 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x - s * 0.5, y + s * 0.1); ctx.lineTo(x + s * 0.5, y + s * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x - s * 0.42, y + s * 0.35); ctx.lineTo(x + s * 0.42, y + s * 0.35);
    ctx.closePath(); ctx.fill();
  }
}

NOS.art = {
  async wallpaper(variant) {
    const { c, ctx, w, h } = makeCanvas(1600, 900);
    paintLandscape(ctx, w, h, variant || 'dusk');
    return c.toDataURL('image/png');
  },

  /* 简易风格应用图标（圆角方块 + 白色符号） */
  icon(key, color, symbol) {
    const { c, ctx, w, h } = makeCanvas(64, 64);
    const r = 14;
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(1, shade(color, -28));
    roundRect(ctx, 2, 2, 60, 60, r);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 32, 34);
    return c.toDataURL('image/png');
  },

  /* 直升机机身曲面贴图（紫黄 + 24） */
  fuselageTexture() {
    const { c, ctx, w, h } = makeCanvas(512, 256);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9b5cf6'); g.addColorStop(0.5, '#7c3aed'); g.addColorStop(1, '#4c1d95');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // 黄色识别涂装带
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, h * 0.62, w, h * 0.16);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(0, h * 0.78, w, 4);
    // 数字 24（两侧）
    ctx.font = 'italic 900 120px Arial Black, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#4c1d95';
    ctx.fillStyle = '#fde047';
    ctx.strokeText('24', w * 0.3, h * 0.42); ctx.fillText('24', w * 0.3, h * 0.42);
    ctx.strokeText('24', w * 0.72, h * 0.42); ctx.fillText('24', w * 0.72, h * 0.42);
    // 高光与面板线
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff';
    ctx.fillRect(0, 10, w, 14);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#2e1065'; ctx.lineWidth = 2;
    for (let x = 64; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.globalAlpha = 1;
    return c.toDataURL('image/png');
  },

  grassTexture() {
    const { c, ctx, w, h } = makeCanvas(256, 256);
    ctx.fillStyle = '#3f621f'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      ctx.strokeStyle = Math.random() > 0.5 ? '#5a8128' : '#33501a';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 4); ctx.stroke();
    }
    return c.toDataURL('image/png');
  },

  concreteTexture() {
    const { c, ctx, w, h } = makeCanvas(256, 256);
    ctx.fillStyle = '#9aa0ae'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60,64,80,.5)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, 0, w, 8);
    return c.toDataURL('image/png');
  },

  makeCanvas, paintLandscape
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
NOS.shade = shade;
NOS.roundRect = roundRect;
