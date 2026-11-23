// ---------- procedural canvas textures ----------
const FONT_CN = '"Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
const FONT_SERIF = '"Noto Serif CJK SC","Source Han Serif SC","Songti SC","SimSun",serif';
const FONT_MONO = '"DejaVu Sans Mono","Consolas",monospace';

function srgb(tex) { tex.encoding = THREE.sRGBEncoding; return tex; }

function texConcrete() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = mulberry32(11);
    ctx.fillStyle = '#d2d5d1'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, rad = 30 + r() * 120;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.55;
      g.addColorStop(0, dark ? 'rgba(120,124,116,0.10)' : 'rgba(255,255,250,0.13)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.strokeStyle = 'rgba(120,122,114,0.16)';
    for (let i = 0; i < 4; i++) {
      const y = 70 + i * 120 + r() * 20;
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + (r() - 0.5) * 3);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      let x = r() * w, y = r() * h;
      ctx.strokeStyle = 'rgba(85,90,84,0.30)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 14; s++) { x += (r() - 0.5) * 26; y += r() * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 7000; i++) {
      const v = r();
      ctx.fillStyle = v < 0.5 ? 'rgba(90,94,88,0.10)' : 'rgba(255,255,252,0.14)';
      ctx.fillRect(r() * w, r() * h, 1, 1);
    }
    for (let i = 0; i < 8; i++) {
      const x = r() * w, y = r() * h, rad = 20 + r() * 55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(96,110,106,0.13)');
      g.addColorStop(1, 'rgba(96,110,106,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}

function texWetGround() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = mulberry32(23);
    ctx.fillStyle = '#c6cdc9'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 25 + r() * 130;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, r() < 0.6 ? 'rgba(118,132,130,0.16)' : 'rgba(245,247,240,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 12; i++) {
      const x = r() * w, y = r() * h, rad = 18 + r() * 46;
      const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
      g.addColorStop(0, 'rgba(88,108,108,0.22)');
      g.addColorStop(0.7, 'rgba(96,116,114,0.12)');
      g.addColorStop(1, 'rgba(96,116,114,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.strokeStyle = 'rgba(96,102,96,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(w, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, h); ctx.stroke();
    for (let i = 0; i < 8000; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(80,88,84,0.10)' : 'rgba(255,255,250,0.12)';
      ctx.fillRect(r() * w, r() * h, 1, 1);
    }
    ctx.strokeStyle = 'rgba(90,98,94,0.10)'; ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.4, 60 + i * 8, 0.2, 1.2); ctx.stroke();
    }
  }, { repeat: [4, 4] });
}

function texWall() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = mulberry32(37);
    ctx.fillStyle = '#c5cbc7'; ctx.fillRect(0, 0, w, h);
    const rows = 6, rh = h / rows;
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * 42;
      for (let x = -84 + off; x < w + 84; x += 84) {
        const v = 0.9 + r() * 0.16;
        const c = Math.floor(198 * v), cg = Math.floor(199 * v), cb = Math.floor(189 * v);
        ctx.fillStyle = `rgb(${c},${cg},${cb})`;
        ctx.fillRect(x + 1.5, row * rh + 1.5, 81, rh - 3);
        ctx.fillStyle = 'rgba(90,98,92,0.07)';
        ctx.fillRect(x + 1.5, row * rh + rh - 8, 81, 6);
        ctx.fillStyle = 'rgba(255,255,250,0.10)';
        ctx.fillRect(x + 1.5, row * rh + 1.5, 81, 3);
      }
    }
    ctx.strokeStyle = 'rgba(88,96,90,0.35)'; ctx.lineWidth = 1.6;
    for (let row = 0; row <= rows; row++) {
      ctx.beginPath(); ctx.moveTo(0, row * rh); ctx.lineTo(w, row * rh); ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * w, len = 30 + r() * 200, sw = 2 + r() * 8;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(74,92,84,0.16)');
      g.addColorStop(1, 'rgba(74,92,84,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, sw, len);
    }
    const gg = ctx.createLinearGradient(0, h * 0.62, 0, h);
    gg.addColorStop(0, 'rgba(70,96,74,0)');
    gg.addColorStop(1, 'rgba(58,84,66,0.42)');
    ctx.fillStyle = gg; ctx.fillRect(0, h * 0.62, w, h * 0.38);
    for (let i = 0; i < 260; i++) {
      const y = h * 0.66 + r() * h * 0.34;
      ctx.fillStyle = `rgba(${40 + r() * 30 | 0},${70 + r() * 40 | 0},${52 + r() * 26 | 0},${0.15 + r() * 0.3})`;
      ctx.beginPath(); ctx.arc(r() * w, y, 1 + r() * 3.4, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 120; i++) {
      const y = h * 0.72 + r() * h * 0.28;
      ctx.fillStyle = `rgba(232,232,220,${0.25 + r() * 0.4})`;
      ctx.beginPath(); ctx.arc(r() * w, y, 0.8 + r() * 1.8, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 7; i++) {
      const x = r() * w;
      const g = ctx.createLinearGradient(0, 0, 0, 80 + r() * 90);
      g.addColorStop(0, 'rgba(146,92,58,0.20)');
      g.addColorStop(1, 'rgba(146,92,58,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + r() * 4, 170);
    }
  }, { repeat: [3, 1.4] });
}

function texWood() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = mulberry32(51);
    ctx.fillStyle = '#b28a5e'; ctx.fillRect(0, 0, w, h);
    const planks = 5, ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const v = 0.88 + r() * 0.22;
      ctx.fillStyle = `rgb(${168 * v | 0},${128 * v | 0},${86 * v | 0})`;
      ctx.fillRect(0, p * ph + 1, w, ph - 2);
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(${90 + r() * 40 | 0},${62 + r() * 26 | 0},${38 + r() * 20 | 0},${0.10 + r() * 0.14})`;
        ctx.lineWidth = 0.8 + r();
        ctx.beginPath();
        const y = p * ph + r() * ph;
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5 + (r() - 0.5) * 1.2);
        ctx.stroke();
      }
      if (r() < 0.6) {
        const x = r() * w, y = p * ph + ph * (0.3 + r() * 0.4);
        ctx.strokeStyle = 'rgba(80,52,30,0.45)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(x, y, 4 + r() * 3, 2 + r() * 2, 0, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,40,24,0.35)';
      ctx.fillRect(0, p * ph, w, 1.4);
    }
  }, { repeat: [2, 2] });
}

function texRoof() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = mulberry32(67);
    ctx.fillStyle = '#7d8d9b'; ctx.fillRect(0, 0, w, h);
    const cols = 8, rows = 8, cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = 0.9 + r() * 0.18;
        ctx.fillStyle = `rgb(${116 * v | 0},${132 * v | 0},${146 * v | 0})`;
        ctx.fillRect(x * cw + 1, y * rh + 1, cw - 2, rh - 2);
        ctx.strokeStyle = 'rgba(56,70,82,0.35)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x * cw + cw / 2, y * rh + rh * 0.86, cw * 0.5, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x * cw + 2, y * rh + 2, cw - 4, 2);
      }
    }
  }, { repeat: [3, 2] });
}

function texSand() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = mulberry32(83);
    ctx.fillStyle = '#b8b49a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, rad = 0.6 + r() * 3.4;
      const v = r();
      ctx.fillStyle = v < 0.4 ? 'rgba(96,102,86,0.35)' : (v < 0.75 ? 'rgba(150,146,120,0.4)' : 'rgba(224,220,198,0.45)');
      ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.7), r() * TAU, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 20; i++) {
      const x = r() * w, y = r() * h, rad = 20 + r() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(86,104,88,0.18)');
      g.addColorStop(1, 'rgba(86,104,88,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, { repeat: [6, 6] });
}

function signTexture(opts) {
  const w = opts.w || 512, h = opts.h || 256;
  return canvasTexture(w, h, (ctx, W, H) => {
    const r = mulberry32(opts.seed || 5);
    ctx.fillStyle = opts.bg || '#e8e6da'; ctx.fillRect(0, 0, W, H);
    if (opts.border !== false) {
      ctx.strokeStyle = opts.borderColor || '#5a6a70';
      ctx.lineWidth = opts.borderWidth || 10;
      ctx.strokeRect(7, 7, W - 14, H - 14);
    }
    ctx.fillStyle = opts.fg || '#33454d';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = opts.lines || [];
    const fs = opts.fontSize || 44;
    lines.forEach((ln, i) => {
      const y = H / 2 + (i - (lines.length - 1) / 2) * (fs * 1.28);
      ctx.font = `${ln.bold === false ? '' : 'bold '}${ln.size || fs}px ${ln.font || FONT_CN}`;
      ctx.fillStyle = ln.color || opts.fg || '#33454d';
      ctx.fillText(ln.text, W / 2 + (ln.dx || 0), y);
    });
    if (opts.sub) {
      ctx.font = `26px ${FONT_CN}`;
      ctx.fillStyle = opts.subColor || 'rgba(60,76,80,0.8)';
      ctx.fillText(opts.sub, W / 2, H - 34);
    }
    for (let i = 0; i < 900; i++) {
      const x = r() * W, y = r() * H;
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,250,0.05)' : 'rgba(70,80,72,0.05)';
      ctx.fillRect(x, y, 1 + r() * 3, 1 + r() * 2);
    }
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = 'rgba(80,86,78,0.10)'; ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      const x = r() * W, y = r() * H;
      ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 90, y + (r() - 0.5) * 40);
      ctx.stroke();
    }
    if (opts.fade) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(240,240,230,0.28)');
      g.addColorStop(0.5, 'rgba(240,240,230,0.05)');
      g.addColorStop(1, 'rgba(210,214,200,0.25)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }, { clamp: true });
}

function texBlackboard() {
  return canvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#6f5334'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2f403b'; ctx.fillRect(10, 10, w - 20, h - 20);
    const r = mulberry32(99);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(230,240,235,0.045)');
      g.addColorStop(1, 'rgba(230,240,235,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(238,244,236,0.92)';
    ctx.font = `bold 38px ${FONT_CN}`;
    ctx.fillText('本日の競り落価格', 34, 50);
    ctx.strokeStyle = 'rgba(238,244,236,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, 78); ctx.lineTo(480, 78); ctx.stroke();
    const rows = [
      ['アジ  中', '¥ 180'],
      ['イワシ', '¥ 120'],
      ['カサゴ', '¥ 260'],
      ['タコ  大', '¥ 480'],
      ['ブリ  小', '¥ 720'],
      ['車エビ', '¥ 950']
    ];
    ctx.font = `30px ${FONT_CN}`;
    rows.forEach((rw, i) => {
      const y = 112 + i * 34;
      ctx.fillStyle = 'rgba(236,242,234,0.9)';
      ctx.fillText(rw[0], 42, y);
      ctx.textAlign = 'right';
      ctx.fillText(rw[1], 470, y);
      ctx.textAlign = 'left';
    });
    ctx.font = `italic 22px ${FONT_CN}`;
    ctx.fillStyle = 'rgba(236,242,234,0.55)';
    ctx.fillText('※ 午前5:30 開始', 34, 296);
    for (let i = 0; i < 800; i++) {
      ctx.fillStyle = `rgba(240,246,238,${r() * 0.05})`;
      ctx.fillRect(r() * w, r() * h, 1.4, 1.4);
    }
  }, { clamp: true });
}

function texTimetable() {
  return canvasTexture(384, 512, (ctx, w, h) => {
    const r = mulberry32(131);
    ctx.fillStyle = '#e7e4d6'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8d9a9c'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#3a5560'; ctx.textAlign = 'center';
    ctx.font = `bold 44px ${FONT_CN}`; ctx.fillText('時 刻 表', w / 2, 68);
    ctx.font = `20px ${FONT_CN}`; ctx.fillStyle = '#6d7f84';
    ctx.fillText('日凪漁港 — 連絡船', w / 2, 100);
    ctx.strokeStyle = 'rgba(70,90,96,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(22, 118); ctx.lineTo(w - 22, 118); ctx.stroke();
    const rows = [
      ['06:10', '防波堤', '○'],
      ['07:25', '青島', '○'],
      ['09:00', '防波堤', '×'],
      ['11:40', '青島', '○'],
      ['14:15', '防波堤', '○'],
      ['16:30', '青島', '○'],
      ['18:05', '防波堤', '×']
    ];
    ctx.textAlign = 'left';
    rows.forEach((rw, i) => {
      const y = 154 + i * 40;
      ctx.font = `26px ${FONT_MONO}`; ctx.fillStyle = '#3b4b50';
      ctx.fillText(rw[0], 32, y);
      ctx.font = `24px ${FONT_CN}`; ctx.fillText(rw[1], 132, y);
      ctx.font = `bold 24px ${FONT_CN}`;
      ctx.fillStyle = rw[2] === '○' ? '#4d7a63' : '#a0665e';
      ctx.fillText(rw[2], 310, y);
      ctx.strokeStyle = 'rgba(90,105,108,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(24, y + 14); ctx.lineTo(w - 24, y + 14); ctx.stroke();
    });
    ctx.font = `18px ${FONT_CN}`; ctx.fillStyle = 'rgba(90,105,108,0.75)';
    ctx.fillText('※ 荒天時は欠航の場合があります', 26, 462);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(120,120,100,${r() * 0.05})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,252,235,0.35)');
    g.addColorStop(0.5, 'rgba(255,252,235,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { clamp: true });
}

function texVending() {
  return canvasTexture(256, 512, (ctx, w, h) => {
    const r = mulberry32(151);
    ctx.fillStyle = '#e9ece9'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8443f'; ctx.fillRect(0, 88, w, 46);
    ctx.fillStyle = '#f2efe6'; ctx.textAlign = 'center';
    ctx.font = `bold 30px ${FONT_CN}`; ctx.fillText('つめたい のみもの', w / 2, 121);
    ctx.fillStyle = '#20313a'; ctx.fillRect(16, 150, w - 32, 236);
    const grd = ctx.createLinearGradient(0, 150, 0, 386);
    grd.addColorStop(0, 'rgba(190,235,245,0.85)');
    grd.addColorStop(0.45, 'rgba(120,180,200,0.55)');
    grd.addColorStop(1, 'rgba(40,70,84,0.9)');
    ctx.fillStyle = grd; ctx.fillRect(16, 150, w - 32, 236);
    const cols = ['#df5a4e', '#e8b64a', '#4f9ac4', '#6cbb8a', '#e8e4d8', '#d4759a'];
    for (let row = 0; row < 3; row++) {
      for (let c = 0; c < 4; c++) {
        const x = 34 + c * 50, y = 178 + row * 68;
        ctx.fillStyle = cols[(row * 4 + c) % cols.length];
        ctx.fillRect(x, y, 26, 44);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x + 3, y + 8, 20, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 2, y + 2, 4, 40);
        ctx.fillStyle = 'rgba(20,30,34,0.8)';
        ctx.fillRect(x - 2, y + 48, 30, 6);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.moveTo(30, 150); ctx.lineTo(90, 150); ctx.lineTo(30, 386); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9dedd'; ctx.fillRect(16, 400, w - 32, 92);
    ctx.fillStyle = '#37474d'; ctx.fillRect(34, 418, 70, 26);
    ctx.fillStyle = '#8fb7a8'; ctx.fillRect(40, 424, 58, 14);
    ctx.fillStyle = '#2c3a3f'; ctx.beginPath(); ctx.arc(180, 432, 16, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8443f'; ctx.beginPath(); ctx.arc(180, 432, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(60,70,70,0.6)'; ctx.fillRect(28, 466, 200, 8);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(140,86,52,${0.05 + r() * 0.16})`;
      ctx.fillRect(r() * w, 470 + r() * 42, 2 + r() * 10, 1 + r() * 3);
    }
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(70,80,76,${r() * 0.05})`;
      ctx.fillRect(r() * w, r() * h, 2, 1);
    }
  }, { clamp: true });
}

function texCaustic() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = mulberry32(171);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.10 + r() * 0.25})`;
      ctx.lineWidth = 0.8 + r() * 2.4;
      let x = r() * w, y = r() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      const n = 3 + (r() * 4 | 0);
      for (let k = 0; k < n; k++) {
        x += (r() - 0.5) * 60; y += (r() - 0.5) * 60;
        ctx.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, rad = 8 + r() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, { repeat: [2, 2] });
}

function texCloudShadow() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = mulberry32(191);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = 60 + r() * (w - 120), y = 60 + r() * (h - 120);
      const rad = 30 + r() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, { repeat: [1, 1] });
}

function texFoam() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const r = mulberry32(211);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = w / 2 + (r() - 0.5) * 90, y = h / 2 + (r() - 0.5) * 60;
      const rad = 2 + r() * 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
  }, { clamp: true });
}

function texPhoto() {
  return canvasTexture(160, 120, (ctx, w, h) => {
    const r = mulberry32(223);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#bcdbe4'); g.addColorStop(0.55, '#e9f1ee'); g.addColorStop(0.56, '#6fa8ac'); g.addColorStop(1, '#3f6f78');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(w * 0.74, h * 0.22, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2f4ee';
    ctx.beginPath(); ctx.moveTo(w * 0.18, h * 0.62); ctx.lineTo(w * 0.66, h * 0.62);
    ctx.lineTo(w * 0.58, h * 0.76); ctx.lineTo(w * 0.26, h * 0.76); ctx.closePath(); ctx.fill();
    ctx.fillRect(w * 0.36, h * 0.4, w * 0.22, h * 0.22);
    ctx.fillStyle = '#5f7f86'; ctx.fillRect(w * 0.4, h * 0.45, w * 0.06, h * 0.08);
    ctx.strokeStyle = '#7a8a88'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.46, h * 0.4); ctx.lineTo(w * 0.46, h * 0.2); ctx.stroke();
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.10 + r() * 0.2})`;
      ctx.lineWidth = 1 + r() * 2;
      const y = h * 0.58 + r() * h * 0.4;
      ctx.beginPath(); ctx.moveTo(r() * w, y); ctx.lineTo(r() * w, y + 1); ctx.stroke();
    }
    ctx.strokeStyle = '#f4f0e4'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
  }, { clamp: true });
}

function texBuoyNumber(n) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#e8e3d2';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 56, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c05a45'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 50, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#3d4c52'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold 62px ${FONT_MONO}`;
    ctx.fillText(String(n), w / 2, h / 2 + 3);
  }, { clamp: true });
}

function texBoatName(text) {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(250,250,244,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold 38px ${FONT_CN}`;
    ctx.fillText(text, w / 2, h / 2);
  }, { clamp: true });
}

function texGradientMap() {
  const data = new Uint8Array([70, 128, 186, 232, 255]);
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function texTideOverlay() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    const r = mulberry32(241);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(52,78,70,0)');
    g.addColorStop(0.42, 'rgba(52,78,70,0.10)');
    g.addColorStop(0.62, 'rgba(44,70,62,0.38)');
    g.addColorStop(0.72, 'rgba(38,62,56,0.52)');
    g.addColorStop(1, 'rgba(30,54,50,0.62)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      const y = h * 0.55 + r() * h * 0.45;
      ctx.fillStyle = `rgba(${36 + r() * 24 | 0},${62 + r() * 30 | 0},${48 + r() * 20 | 0},${0.1 + r() * 0.3})`;
      ctx.beginPath(); ctx.arc(r() * w, y, 0.7 + r() * 2.4, 0, TAU); ctx.fill();
    }
  }, { clamp: true });
}

function texSignpost() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = mulberry32(251);
    ctx.fillStyle = '#e4e1d2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6f7f82'; ctx.lineWidth = 7; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3c5158';
    ctx.font = `bold 46px ${FONT_SERIF}`;
    ctx.fillText('日凪漁港', w / 2, 82);
    ctx.font = `20px ${FONT_CN}`;
    ctx.fillStyle = '#6d7f84';
    ctx.fillText('HINAGI  FISHING PORT', w / 2, 112);
    ctx.strokeStyle = 'rgba(70,90,96,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, 130); ctx.lineTo(w - 30, 130); ctx.stroke();
    ctx.fillStyle = '#a9503f';
    ctx.font = `bold 34px ${FONT_CN}`;
    ctx.fillText('注意落水', w / 2, 178);
    ctx.fillStyle = 'rgba(80,90,90,0.85)';
    ctx.font = `19px ${FONT_CN}`;
    ctx.fillText('足元に ご注意ください', w / 2, 210);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(90,90,75,${r() * 0.06})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
    ctx.fillStyle = 'rgba(140,92,56,0.18)';
    ctx.fillRect(8, 8, 3, 40); ctx.fillRect(w - 12, h - 50, 3, 40);
  }, { clamp: true });
}

function texHazard() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const r = mulberry32(401);
    ctx.fillStyle = '#d9b64a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3a3a38'; ctx.lineWidth = 26;
    for (let i = -h; i < w + h; i += 52) {
      ctx.beginPath(); ctx.moveTo(i, -10); ctx.lineTo(i + h + 20, h + 10); ctx.stroke();
    }
    for (let i = 0; i < 500; i++) {
      const x = r() * w, y = r() * h;
      ctx.fillStyle = r() < 0.5 ? 'rgba(150,150,140,0.22)' : 'rgba(240,238,225,0.16)';
      ctx.fillRect(x, y, 1 + r() * 4, 1 + r() * 3);
    }
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = 'rgba(190,188,176,0.35)';
      ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 2 + r() * 7, 1 + r() * 3, r() * TAU, 0, TAU); ctx.fill();
    }
  }, { repeat: [6, 1] });
}

function texRock() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = mulberry32(409);
    ctx.fillStyle = '#8a887a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h, rad = 2 + r() * 16;
      const v = 0.75 + r() * 0.45;
      ctx.fillStyle = `rgba(${118 * v | 0},${116 * v | 0},${102 * v | 0},0.55)`;
      ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.6), r() * TAU, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = 'rgba(60,62,56,0.35)'; ctx.lineWidth = 0.8 + r() * 1.6;
      let x = r() * w, y = r() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 3 + r() * 12;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(78,104,74,0.35)');
      g.addColorStop(1, 'rgba(78,104,74,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, { repeat: [2, 1] });
}


function texTideTable() {
  return canvasTexture(192, 128, (ctx, w, h) => {
    const r = mulberry32(181);
    ctx.fillStyle = '#ece8d6'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8b9a9a'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#3c545c'; ctx.textAlign = 'left';
    ctx.font = `bold 20px ${FONT_CN}`; ctx.fillText('潮汐表', 12, 26);
    ctx.font = `12px ${FONT_MONO}`; ctx.fillStyle = '#5d7076';
    ctx.fillText('HINAGI', 118, 24);
    ctx.strokeStyle = 'rgba(70,90,96,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10, 34); ctx.lineTo(w - 10, 34); ctx.stroke();
    // tide curve
    ctx.strokeStyle = 'rgba(70,110,120,0.65)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = 10; x <= w - 10; x += 4) {
      const y = 70 + Math.sin((x - 10) / (w - 20) * TAU) * 16;
      if (x === 10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#5d7076'; ctx.font = '10px ' + FONT_MONO;
    ctx.fillText('06:00', 12, 112); ctx.fillText('12:00', 78, 112); ctx.fillText('18:00', 144, 112);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(120,120,100,${r() * 0.05})`;
      ctx.fillRect(r() * w, r() * h, 2, 1);
    }
  }, { clamp: true });
}

// cached textures

const TEX = {};
function initTextures() {
  TEX.concrete = texConcrete();
  TEX.wetGround = texWetGround();
  TEX.wall = texWall();
  TEX.wood = texWood();
  TEX.roof = texRoof();
  TEX.sand = texSand();
  TEX.gradient = texGradientMap();
  TEX.tide = texTideOverlay();
  TEX.caustic = texCaustic();
  TEX.cloud = texCloudShadow();
  TEX.foam = texFoam();
  TEX.photo = texPhoto();
  TEX.blackboard = texBlackboard();
  TEX.timetable = texTimetable();
  TEX.vending = texVending();
  TEX.signpost = texSignpost();
  TEX.hazard = texHazard();
  TEX.rock = texRock();
  TEX.tidetable = texTideTable();
  TEX.glow = canvasSpriteTexture(128, [
    [0, 'rgba(255,255,255,1)'],
    [0.2, 'rgba(255,250,230,0.7)'],
    [0.5, 'rgba(255,246,214,0.18)'],
    [1, 'rgba(255,246,214,0)']
  ]);
}