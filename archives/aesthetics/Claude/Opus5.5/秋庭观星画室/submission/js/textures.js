/* atlas drawings — every texture is painted procedurally on canvas */
(function () {
  'use strict';
  const W = window.W, A = W.atlas;
  const MIN = '"Shippori Mincho B1","Yu Mincho","SimSun",serif';
  const BRUSH = '"STKaiti","KaiTi","LXGW WenKai GB",serif';
  const HAND = '"LXGW WenKai GB","STKaiti",cursive';
  const R = W.rng(1234);

  function paper(c, w, h, base, speck) {
    c.fillStyle = base || '#f3ead6'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < (speck || 300); i++) { c.fillStyle = `rgba(120,90,50,${R() * 0.06})`; c.fillRect(R() * w, R() * h, R() * 3 + 1, R() * 3 + 1); }
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,80,30,0.12)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function vtext(c, str, x, y, size, font, color, gap) {
    c.fillStyle = color; c.font = `${size}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let i = 0; i < str.length; i++) c.fillText(str[i], x, y + i * size * (gap || 1.05));
  }
  function star5(c, x, y, r, fill) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = fill; c.fill();
  }
  function scribble(c, x, y, w, lines, color, lw) {
    c.strokeStyle = color; c.lineWidth = lw || 1.5; c.lineCap = 'round';
    for (let i = 0; i < lines; i++) {
      c.beginPath(); let px = x; const py = y + i * 14;
      c.moveTo(px, py);
      const L = w * (0.6 + R() * 0.4);
      while (px < x + L) { px += 4 + R() * 6; c.lineTo(px, py + (R() - 0.5) * 3); }
      c.stroke();
    }
  }

  W.paintAtlas = function () {
    // tatami: weave + heri borders along long sides
    A.alloc('tatami', 256, 512, (c, w, h) => {
      c.fillStyle = '#c9c58e'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        const v = 0.85 + R() * 0.15;
        c.fillStyle = `rgba(${Math.round(160 * v)},${Math.round(156 * v)},${Math.round(98 * v)},0.6)`;
        c.fillRect(0, y, w, 2);
      }
      for (let x = 22; x < w - 22; x += 22) { c.fillStyle = 'rgba(110,100,60,0.25)'; c.fillRect(x, 0, 1.5, h); }
      c.fillStyle = '#2d3a2a'; c.fillRect(0, 0, 18, h); c.fillRect(w - 18, 0, 18, h);
      c.fillStyle = 'rgba(190,170,110,0.35)'; for (let y = 0; y < h; y += 10) { c.fillRect(4, y, 10, 3); c.fillRect(w - 14, y, 10, 3); }
    });
    // engawa-side & generic wood boards
    A.alloc('painting', 512, 384, (c, w, h) => {
      paper(c, w, h, '#f6efe0', 150);
      // sky wash
      let g = c.createLinearGradient(0, 0, 0, h * 0.55); g.addColorStop(0, 'rgba(130,175,225,0.85)'); g.addColorStop(1, 'rgba(210,225,235,0.4)');
      c.fillStyle = g; c.beginPath(); c.moveTo(20, 20); c.lineTo(w - 30, 25); c.lineTo(w - 40, h * 0.55); c.lineTo(25, h * 0.58); c.closePath(); c.fill();
      // far trees
      c.fillStyle = 'rgba(70,110,80,0.7)'; c.beginPath(); c.moveTo(25, h * 0.52); for (let x = 25; x < w - 40; x += 18) c.lineTo(x, h * 0.42 - R() * 28); c.lineTo(w - 40, h * 0.55); c.closePath(); c.fill();
      // ginkgo yellow mass
      c.fillStyle = 'rgba(240,190,50,0.9)'; c.beginPath(); c.ellipse(w * 0.34, h * 0.33, 95, 70, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(250,215,90,0.8)'; c.beginPath(); c.ellipse(w * 0.3, h * 0.27, 55, 40, 0, 0, Math.PI * 2); c.fill();
      // maples
      c.fillStyle = 'rgba(210,50,30,0.85)'; c.beginPath(); c.ellipse(w * 0.12, h * 0.5, 60, 45, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(230,95,35,0.8)'; c.beginPath(); c.ellipse(w * 0.84, h * 0.43, 50, 40, 0, 0, Math.PI * 2); c.fill();
      // torii
      c.fillStyle = '#d23a24';
      c.fillRect(w * 0.6, h * 0.36, 9, 120); c.fillRect(w * 0.6 + 86, h * 0.36, 9, 120);
      c.fillRect(w * 0.6 - 18, h * 0.33, 132, 12); c.fillRect(w * 0.6 - 6, h * 0.4, 108, 7);
      c.fillStyle = '#2a1a18'; c.fillRect(w * 0.6 - 20, h * 0.32, 136, 5);
      // ground & pond (pencil only partially painted)
      c.fillStyle = 'rgba(110,150,70,0.75)'; c.fillRect(25, h * 0.62, w * 0.55, h * 0.12);
      c.fillStyle = 'rgba(90,170,200,0.8)'; c.beginPath(); c.ellipse(w * 0.4, h * 0.8, 120, 30, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(200,150,60,0.9)'; c.lineWidth = 6; c.beginPath(); c.ellipse(w * 0.4, h * 0.8, 124, 33, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(180,220,90,0.9)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(w * 0.3 + i * 22, h * 0.8 + (i % 2) * 6, 7, 0, Math.PI * 2); c.fill(); }
      // unfinished pencil lines on right & bottom
      c.strokeStyle = 'rgba(60,60,70,0.55)'; c.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(w * 0.62 + i * 14, h * 0.7); c.lineTo(w * 0.6 + i * 16, h * 0.95); c.stroke(); }
      c.beginPath(); c.ellipse(w * 0.82, h * 0.82, 50, 20, 0.2, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(w * 0.55, h * 0.66); c.lineTo(w - 30, h * 0.64); c.stroke();
    });
    A.alloc('scroll', 192, 512, (c, w, h) => {
      c.fillStyle = '#5b6e5a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c6a463'; c.fillRect(10, 40, w - 20, h - 80);
      paper(c, 0, 0); c.fillStyle = '#efe6cf'; c.fillRect(18, 60, w - 36, h - 120);
      vtext(c, '星河一天秋', w / 2, 82, 60, BRUSH, '#1e1a1a', 1.08);
      c.fillStyle = '#b8241c'; c.fillRect(w / 2 + 30, h - 110, 16, 16);
    });
    A.alloc('starchart', 512, 512, (c, w, h) => {
      c.fillStyle = '#e8dcbc'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1b2848'; c.beginPath(); c.arc(w / 2, h / 2, 230, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#c9a85a'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h / 2, 232, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1; c.strokeStyle = 'rgba(200,180,120,0.5)';
      for (let r = 60; r < 230; r += 55) { c.beginPath(); c.arc(w / 2, h / 2, r, 0, Math.PI * 2); c.stroke(); }
      for (let a = 0; a < 12; a++) { c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a / 6 * Math.PI) * 230, h / 2 + Math.sin(a / 6 * Math.PI) * 230); c.stroke(); }
      for (let i = 0; i < 260; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 225; const s = R() < 0.1 ? 2.6 : 1.2; c.fillStyle = R() < 0.2 ? '#ffe9a8' : '#ffffff'; c.beginPath(); c.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, s, 0, Math.PI * 2); c.fill(); }
      // constellations
      c.strokeStyle = '#e8c76a'; c.lineWidth = 1.5;
      const cons = [[[180, 150], [215, 140], [250, 155], [280, 150], [300, 175], [335, 190], [345, 160]], [[300, 330], [320, 300], [350, 310], [340, 345], [300, 330]], [[150, 300], [175, 280], [200, 300], [190, 330], [160, 340]]];
      cons.forEach((pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); pts.forEach((p) => star5(c, p[0], p[1], 5, '#fff3c0')); });
      c.fillStyle = '#5a4630'; c.font = `22px ${MIN}`; c.textAlign = 'center'; c.fillText('秋 の 星 図', w / 2, 500);
    });
    A.alloc('moonphase', 512, 256, (c, w, h) => {
      paper(c, w, h, '#efe4c8');
      c.fillStyle = '#3d3226'; c.font = `24px ${MIN}`; c.textAlign = 'center'; c.fillText('月 の 満 ち 欠 け', w / 2, 40);
      for (let i = 0; i < 8; i++) {
        const x = 40 + i * 62, y = 140, r = 24;
        c.fillStyle = '#2a2f45'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f4e3a0';
        const ph = i / 8;
        c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
        const k = Math.cos(ph * Math.PI * 2);
        c.beginPath(); c.arc(x, y, r, -Math.PI / 2, Math.PI / 2, ph > 0.5); c.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (ph < 0.25 || ph > 0.75) ? ph <= 0.5 : ph > 0.5); c.fill();
        c.restore();
        c.fillStyle = '#5a4a36'; c.font = `14px ${HAND}`; c.fillText(['新月', '三日月', '上弦', '十三夜', '満月', '居待', '下弦', '有明'][i], x, 196);
      }
    });
    A.alloc('constscroll', 256, 512, (c, w, h) => {
      c.fillStyle = '#3c3a52'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#101a34'; c.fillRect(16, 40, w - 32, h - 80);
      for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.6})`; c.beginPath(); c.arc(20 + R() * (w - 40), 44 + R() * (h - 90), R() * 1.4 + 0.3, 0, Math.PI * 2); c.fill(); }
      const pts = [[90, 120], [150, 110], [120, 190], [100, 260], [160, 255], [130, 300], [80, 380], [180, 370]];
      c.strokeStyle = '#d7b860'; c.lineWidth = 1.6;
      [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5], [5, 6], [5, 7]].forEach(([a, b]) => { c.beginPath(); c.moveTo(...pts[a]); c.lineTo(...pts[b]); c.stroke(); });
      pts.forEach((p, i) => star5(c, p[0], p[1], i === 2 ? 9 : 6, '#fff0b8'));
      vtext(c, '参宿', w - 40, 60, 26, MIN, '#e8d7a8');
    });
    A.alloc('notes', 512, 384, (c, w, h) => {
      paper(c, w, h, '#f7f1e2', 80);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w / 2 - 3, 0, 6, h);
      c.strokeStyle = 'rgba(120,150,190,0.35)'; c.lineWidth = 1; for (let y = 40; y < h; y += 22) { c.beginPath(); c.moveTo(10, y); c.lineTo(w - 10, y); c.stroke(); }
      c.fillStyle = '#243052'; c.font = `20px ${HAND}`; c.textAlign = 'left';
      c.fillText('十一月二十二日 晴れ', 20, 34);
      c.font = `16px ${HAND}`;
      ['夕方より観測予定', '・すばる 東の空', '・木星 高度 32°', '・月齢 二日', '風 弱し 雲 少なし'].forEach((t, i) => c.fillText(t, 22, 78 + i * 24));
      // diagram on right page
      c.strokeStyle = '#243052'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(380, 150, 80, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(380, 150, 80, 28, -0.4, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(300, 150); c.lineTo(460, 150); c.stroke();
      [[350, 110], [400, 95], [420, 135], [365, 175], [330, 140], [395, 200]].forEach((p) => star5(c, p[0], p[1], 6, '#243052'));
      c.font = `15px ${HAND}`; c.fillText('昴 M45', 330, 270); c.fillText('赤経 3h47m', 330, 294);
      scribble(c, 22, 210, 210, 6, 'rgba(36,48,82,0.75)', 1.3);
      c.strokeStyle = 'rgba(200,80,60,0.8)'; c.beginPath(); c.arc(430, 300, 16, 0, Math.PI * 2); c.stroke();
    });
    const sketch = (name, fn) => A.alloc(name, 256, 320, (c, w, h) => { paper(c, w, h, '#f8f3e6', 60); fn(c, w, h); });
    sketch('sketchMaple', (c, w, h) => {
      c.strokeStyle = '#3b2f2a'; c.lineWidth = 2; c.fillStyle = 'rgba(214,70,36,0.75)';
      c.beginPath();
      const cx = w / 2, cy = h * 0.45;
      for (let i = 0; i <= 14; i++) { const a = -Math.PI / 2 + i / 14 * Math.PI * 2; const r = i % 2 ? 40 : 100; c.lineTo(cx + Math.cos(a) * r * (i === 7 || i === 8 ? 0.6 : 1), cy + Math.sin(a) * r); }
      c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy + 120); c.stroke();
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + i / 7 * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 85, cy + Math.sin(a) * 85); c.stroke(); }
      c.fillStyle = '#3b2f2a'; c.font = `18px ${HAND}`; c.textAlign = 'center'; c.fillText('いろは紅葉', w / 2, h - 24);
    });
    sketch('sketchTorii', (c, w, h) => {
      c.strokeStyle = '#3b3036'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(30, 90); c.quadraticCurveTo(w / 2, 70, w - 30, 90); c.stroke();
      c.beginPath(); c.moveTo(40, 120); c.lineTo(w - 40, 120); c.stroke();
      c.beginPath(); c.moveTo(72, 95); c.lineTo(66, 280); c.moveTo(w - 72, 95); c.lineTo(w - 66, 280); c.stroke();
      c.fillStyle = 'rgba(220,70,40,0.55)'; c.fillRect(64, 95, 10, 180); c.fillRect(w - 76, 95, 10, 180);
      c.lineWidth = 1; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(20 + i * 18, 300); c.lineTo(30 + i * 18, 290); c.stroke(); }
      c.fillStyle = '#3b3036'; c.font = `16px ${HAND}`; c.textAlign = 'center'; c.fillText('鳥居 習作', w / 2, 40);
    });
    sketch('sketchStars', (c, w, h) => {
      c.fillStyle = 'rgba(30,40,80,0.9)';
      const pts = [[60, 80], [110, 70], [150, 100], [185, 95], [200, 150], [170, 190], [120, 230]];
      c.strokeStyle = '#2b3866'; c.lineWidth = 1.5; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      pts.forEach((p) => star5(c, p[0], p[1], 8, '#e2b33a'));
      c.font = `22px ${HAND}`; c.fillStyle = '#2b3866'; c.textAlign = 'center'; c.fillText('北斗七星!', w / 2, 285);
      c.beginPath(); c.arc(200, 250, 18, 0.5, 5.2); c.stroke();
    });
    sketch('sketchGarden', (c, w, h) => {
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 1.4;
      c.beginPath(); c.ellipse(w / 2, h * 0.6, 90, 40, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(w / 2, h * 0.6, 98, 46, 0, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(w / 2 - 50 + i * 32, h * 0.6, 10, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = 'rgba(120,180,90,0.6)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(w / 2 - 50 + i * 32, h * 0.6, 9, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.moveTo(40, 120); c.bezierCurveTo(70, 60, 110, 90, 130, 50); c.stroke();
      c.font = `16px ${HAND}`; c.fillStyle = '#333'; c.textAlign = 'center'; c.fillText('果物タルトの池', w / 2, 40);
    });
    // ema (votive plaques)
    const emaPics = [
      (c, w, h) => { star5(c, w / 2, h / 2 + 4, 22, '#e6b528'); star5(c, w / 2 - 30, h / 2 - 8, 9, '#e6b528'); star5(c, w / 2 + 30, h / 2 + 14, 8, '#e6b528'); },
      (c, w, h) => { c.fillStyle = '#c22a1e'; c.beginPath(); c.ellipse(w / 2, h / 2 + 8, 26, 16, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.fillRect(w / 2 - 14, h / 2 - 2, 8, 6); },
      (c, w, h) => { c.fillStyle = '#f2f2f2'; c.beginPath(); c.moveTo(w / 2 - 20, h / 2 + 20); c.lineTo(w / 2, h / 2 - 20); c.lineTo(w / 2 + 20, h / 2 + 20); c.fill(); c.fillStyle = '#c22a1e'; c.fillRect(w / 2 - 6, h / 2 + 8, 12, 5); },
      (c, w, h) => { c.fillStyle = '#d6461e'; c.beginPath(); for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI * 2; const r = i % 2 ? 9 : 24; c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + 8 + Math.sin(a) * r); } c.fill(); },
      (c, w, h) => { c.fillStyle = '#e8b440'; c.beginPath(); c.arc(w / 2 - 12, h / 2 + 8, 15, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e0e8f8'; c.beginPath(); c.arc(w / 2 + 18, h / 2, 8, 0, Math.PI * 2); c.fill(); },
      (c, w, h) => { c.fillStyle = '#3a2a2a'; c.beginPath(); c.ellipse(w / 2, h / 2 + 12, 20, 13, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(w / 2 - 14, h / 2 + 2); c.lineTo(w / 2 - 10, h / 2 - 12); c.lineTo(w / 2 - 4, h / 2 + 2); c.fill(); c.beginPath(); c.moveTo(w / 2 + 14, h / 2 + 2); c.lineTo(w / 2 + 10, h / 2 - 12); c.lineTo(w / 2 + 4, h / 2 + 2); c.fill(); },
    ];
    const emaTxt = ['星に願いを', '合格祈願', '家内安全', '良縁', '絵が上達しますように', 'ねこ健康'];
    emaPics.forEach((fn, i) => A.alloc('ema' + i, 128, 96, (c, w, h) => {
      c.fillStyle = '#d9b98a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(120,80,40,0.25)'; for (let y = 4; y < h; y += 7) { c.beginPath(); c.moveTo(0, y + R() * 2); c.lineTo(w, y + R() * 2); c.stroke(); }
      fn(c, w, h);
      c.fillStyle = '#2a1e18'; c.font = `11px ${HAND}`; c.textAlign = 'center'; c.fillText(emaTxt[i], w / 2, h - 10);
    }));
    A.alloc('plaque', 128, 256, (c, w, h) => {
      c.fillStyle = '#1e1a1a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c8a050'; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
      vtext(c, '星宮神社', w / 2, 30, 46, MIN, '#e8c463', 1.08);
    });
    A.alloc('pillar', 96, 512, (c, w, h) => {
      c.fillStyle = '#a39c8d'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(60,60,60,${R() * 0.12})`; c.fillRect(R() * w, R() * h, 3, 3); }
      vtext(c, '星宮神社', w / 2, 40, 70, MIN, '#4a453d', 1.12);
    });
    A.alloc('sign', 256, 160, (c, w, h) => {
      c.fillStyle = '#c8a476'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#26302a'; c.fillRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#f4efe2'; c.font = `30px ${HAND}`; c.textAlign = 'center';
      c.fillText('秋の花', w / 2, 52);
      c.font = `20px ${HAND}`; c.fillText('ひと束 五百円', w / 2, 88);
      c.fillStyle = '#f2a640'; c.fillText('ご自由にどうぞ ♪', w / 2, 122);
      c.fillStyle = '#e65a4a'; c.beginPath(); c.arc(40, 40, 8, 0, Math.PI * 2); c.fill();
    });
    ['星の雫', '秋月', '天の川', '御神酒'].forEach((t, i) => A.alloc('sake' + i, 160, 256, (c, w, h) => {
      const bg = ['#f2ecd8', '#1f3a6a', '#f2ecd8', '#b8261e'][i];
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      const ac = ['#c22a1e', '#e8c45a', '#2a5a9a', '#f2e6c8'][i];
      c.fillStyle = ac; c.fillRect(0, 18, w, 12); c.fillRect(0, h - 30, w, 12);
      c.beginPath(); c.arc(w / 2, 80, 30, 0, Math.PI * 2); c.fill();
      c.fillStyle = bg; c.font = `30px ${MIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(['星', '月', '川', '神'][i], w / 2, 82);
      vtext(c, t, w / 2, 120, 30, BRUSH, i === 1 || i === 3 ? '#f2e6c8' : '#1c1a1a');
    }));
    A.alloc('lantern', 128, 128, (c, w, h) => {
      c.fillStyle = '#f4ead2'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c62a1e'; c.fillRect(0, 0, w, 16); c.fillRect(0, h - 16, w, 16);
      c.fillStyle = '#c62a1e'; c.font = `44px ${MIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('奉納', w / 2, h / 2);
    });
    A.alloc('clock', 256, 256, (c, w, h) => {
      c.fillStyle = '#f2e8d0'; c.beginPath(); c.arc(w / 2, h / 2, 124, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#2a201a'; c.font = `24px ${MIN}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      nums.forEach((n, i) => { const a = -Math.PI / 2 + i / 12 * Math.PI * 2; c.fillText(n, w / 2 + Math.cos(a) * 98, h / 2 + Math.sin(a) * 98); });
      c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + 40, h / 2 + 30); c.stroke();
      c.lineWidth = 4; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 - 20, h / 2 - 80); c.stroke();
    });
    A.alloc('globe', 512, 256, (c, w, h) => {
      c.fillStyle = '#5f8fb4'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d8c48a';
      const blob = (x, y, rx, ry) => { c.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; const r = 0.75 + R() * 0.4; c.lineTo(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r); } c.fill(); };
      blob(90, 80, 50, 40); blob(120, 170, 30, 50); blob(260, 70, 40, 30); blob(270, 150, 35, 50); blob(360, 80, 80, 40); blob(420, 175, 30, 22); blob(300, 236, 160, 14);
      c.strokeStyle = 'rgba(255,255,255,0.3)'; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    });
    A.alloc('sketchbook', 256, 192, (c, w, h) => {
      paper(c, w, h, '#fbf7ec', 30);
      c.strokeStyle = '#4a4a4a'; c.lineWidth = 1.3;
      c.beginPath(); c.ellipse(w / 2, h * 0.55, 85, 35, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(230,90,50,0.7)'; c.beginPath(); c.ellipse(w / 2 - 20, h * 0.55, 14, 6, 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(240,230,220,0.9)'; c.beginPath(); c.ellipse(w / 2 + 25, h * 0.6, 12, 5, -0.3, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(30, 60); c.quadraticCurveTo(70, 30, 120, 50); c.stroke();
      c.font = `15px ${HAND}`; c.fillStyle = '#444'; c.fillText('鯉 三匹', 26, 26);
    });
    A.alloc('lime', 256, 256, (c, w, h) => {
      const cx = w / 2, cy = h / 2;
      c.fillStyle = '#4f8a1e'; c.beginPath(); c.arc(cx, cy, 126, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e9f2c4'; c.beginPath(); c.arc(cx, cy, 112, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 10; i++) {
        const a0 = i / 10 * Math.PI * 2 + 0.05, a1 = (i + 1) / 10 * Math.PI * 2 - 0.05;
        c.fillStyle = i % 2 ? '#b7dc4a' : '#c4e257';
        c.beginPath(); c.moveTo(cx + Math.cos((a0 + a1) / 2) * 12, cy + Math.sin((a0 + a1) / 2) * 12); c.arc(cx, cy, 100, a0, a1); c.closePath(); c.fill();
        c.fillStyle = 'rgba(240,250,200,0.6)';
        for (let k = 0; k < 6; k++) { const a = W.lerp(a0, a1, 0.3 + R() * 0.4), r = 40 + R() * 50; c.beginPath(); c.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 6, 2, a, 0, Math.PI * 2); c.fill(); }
      }
      c.fillStyle = '#eef5d0'; c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.fill();
    });
    A.alloc('starfruit', 256, 256, (c, w, h) => {
      const cx = w / 2, cy = h / 2;
      c.fillStyle = '#e8b81a';
      c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 56 : 124; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); c.fill();
      c.fillStyle = '#f6dc5a';
      c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 46 : 108; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); c.fill();
      c.strokeStyle = '#d9a514'; c.lineWidth = 3; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80); c.stroke(); }
      c.fillStyle = '#7a5a1a'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5 + 0.3; c.beginPath(); c.ellipse(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 6, 3, a, 0, Math.PI * 2); c.fill(); }
    });
    A.alloc('glassRefl', 512, 256, (c, w, h) => {
      c.fillStyle = '#9fb7c8'; c.fillRect(0, 0, w, h);
      let g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c8dcef'); g.addColorStop(0.5, '#a9c2d4'); g.addColorStop(1, '#7a8d78');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // garden blobs
      c.fillStyle = '#d0472c'; c.beginPath(); c.ellipse(80, 70, 90, 55, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e8b33a'; c.beginPath(); c.ellipse(400, 60, 120, 60, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5f7f3a'; c.fillRect(0, h * 0.62, w, h * 0.4);
      // flower reflections (stall)
      const fc = ['#e0482a', '#f08a2a', '#7b62c8', '#c83a52', '#f2c04a', '#8a7ad8'];
      for (let i = 0; i < 60; i++) { c.fillStyle = fc[i % fc.length]; c.beginPath(); c.arc(R() * w * 0.55, h * 0.55 + R() * h * 0.3, 8 + R() * 12, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(w * 0.6, 0); c.lineTo(w * 0.72, 0); c.lineTo(w * 0.5, h); c.lineTo(w * 0.38, h); c.fill();
    });
    A.alloc('plate', 512, 64, (c, w, h) => {
      c.fillStyle = '#c39a4a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7a5a22'; c.lineWidth = 3; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#4a3416'; c.font = `34px ${MIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('秋庭観星画室', w / 2, h / 2 + 2);
    });
    A.alloc('mail', 128, 128, (c, w, h) => {
      c.fillStyle = '#c8281e'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f2ead8'; c.font = `40px ${MIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('〒', w / 2, 38);
      c.font = `22px ${MIN}`; c.fillText('郵便', w / 2, 90);
    });
    A.alloc('book', 256, 160, (c, w, h) => {
      paper(c, w, h, '#f6efde', 40);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w / 2 - 2, 0, 4, h);
      c.fillStyle = '#3a3030';
      for (let col = 0; col < 14; col++) { const x = w - 16 - col * 17; if (Math.abs(x - w / 2) < 10) continue; for (let r = 0; r < 9; r++) if (R() < 0.92) c.fillRect(x, 14 + r * 15, 9, 9); }
    });
    A.alloc('flag', 64, 256, (c, w, h) => {
      c.fillStyle = '#c8241c'; c.fillRect(0, 0, w, h);
      vtext(c, '稲荷大明神', w / 2, 16, 40, MIN, '#f6efe2', 1.1);
    });
    A.alloc('makie', 256, 128, (c, w, h) => {
      c.fillStyle = '#1c1414'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#d4a848'; c.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const x = 30 + i * 40, y = 70 + Math.sin(i) * 20; c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + 10, y + 20, x + 5, y); c.stroke(); c.fillStyle = '#e0b850'; c.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; c.ellipse(x + 5 + Math.cos(a) * 7, y + Math.sin(a) * 7, 5, 3, a, 0, Math.PI * 2); } c.fill(); }
      c.beginPath(); c.moveTo(0, 40); c.bezierCurveTo(60, 20, 120, 60, 256, 30); c.stroke();
    });
    A.alloc('apron', 128, 160, (c, w, h) => {
      c.fillStyle = '#5d6f8a'; c.fillRect(0, 0, w, h);
      const pc = ['#e0482a', '#f2c040', '#4a9a5a', '#f6f0e0', '#7a5ac8'];
      for (let i = 0; i < 24; i++) { c.fillStyle = pc[i % pc.length]; c.beginPath(); c.ellipse(R() * w, R() * h, 3 + R() * 8, 2 + R() * 5, R() * 3, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.strokeRect(20, 70, w - 40, 40);
    });
    A.alloc('kotoji', 128, 128, (c, w, h) => { c.fillStyle = '#f6f0e4'; c.fillRect(0, 0, w, h); });
    A.alloc('radio', 128, 96, (c, w, h) => {
      c.fillStyle = '#d9c7a0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#6a4a2a'; for (let y = 10; y < h - 10; y += 7) c.fillRect(10, y, 64, 3);
      c.fillStyle = '#f2e8c8'; c.fillRect(82, 14, 38, 30); c.fillStyle = '#c22a1e'; c.fillRect(100, 14, 2, 30);
      c.fillStyle = '#3a2a1a'; c.font = '9px serif'; for (let i = 0; i < 4; i++) c.fillText(String(5 + i * 3), 84 + i * 9, 54);
    });
    A.alloc('kanban', 128, 256, (c, w, h) => {
      c.fillStyle = '#efe6cf'; c.fillRect(0, 0, w, h);
      vtext(c, '御神木', w / 2, 30, 50, BRUSH, '#2a1e18', 1.15);
    });
  };
})();
