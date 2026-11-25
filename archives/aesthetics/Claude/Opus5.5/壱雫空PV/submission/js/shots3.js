/* Shots 23–27: the pre-chorus "board space" in 3D (flat boards with outlines, rendered by PV.G3),
   plus the collapse into a white point. */
'use strict';
(function () {
  const PV = window.PV;
  const { W, H, B, BEAT, BAR, C, MEM, E, ease, seg, clamp, lerp, rnd, rgba, mix, font, F, TAU,
    rect, circle, line, rrect, grid, stripes, halftone, star4, star5, checker, barcode, tag, txt, glow,
    drawFigure, drawCrop, silhouette, mono, IMG, drawKaraoke, layoutH, fillOf, beatPulse, beatPos, mkCanvas, cached } = PV;
  const LYR = PV.LY;
  const G = PV.G3;
  const M = () => G.M;
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  };
  // catmull-rom through points
  function cr(p, u) {
    const n = p.length - 1;
    const f = clamp(u) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }

  // ---------------- textures ----------------
  function texCard(m, lit) {
    return cached('card3|' + m + lit, () => {
      const cw = 512, ch = 800, c = mkCanvas(cw, ch), g = c.getContext('2d');
      const col = MEM[m].c;
      rrect(g, 6, 6, cw - 12, ch - 12, 34); g.fillStyle = lit ? col : '#E6EAF0'; g.fill();
      g.save(); rrect(g, 6, 6, cw - 12, ch - 12, 34); g.clip();
      if (lit) {
        stripes(g, 0, 0, cw, ch, 0.785, 46, [14], 'rgba(255,255,255,0.22)', 0);
        g.beginPath(); g.arc(cw * 0.75, ch * 0.2, 260, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
      } else halftone(g, 0, 0, cw, ch, 16, 3.2, 'rgba(27,42,71,0.10)', () => 1);
      const crop = m === 'taki' ? [160, -30, 1448, 1100] : null;
      if (crop) drawCrop(g, m, crop, 6, 130, cw - 12, ch - 230, lit ? { sticker: true } : { canvas: mono(m, '#3A4A6B', '#C9D2DE', true) });
      else drawFigure(g, m, cw / 2, ch - 108, 600, lit ? { sticker: true } : { canvas: mono(m, '#3A4A6B', '#C9D2DE', true) });
      g.fillStyle = '#fff'; g.fillRect(0, ch - 100, cw, 100);
      g.restore();
      txt(g, MEM[m].no, 40, 72, { size: 40, weight: 900, color: lit ? C.ink : '#7C8799' });
      txt(g, MEM[m].rom, cw - 40, 70, { size: 30, weight: 900, track: 6, color: lit ? '#fff' : '#7C8799', align: 'right' });
      txt(g, MEM[m].name, 40, ch - 38, { font: font(800, 44, F.min), color: C.ink });
      txt(g, MEM[m].part, cw - 40, ch - 40, { size: 34, weight: 900, color: lit ? col : '#9AA5B5', align: 'right' });
      rrect(g, 6, 6, cw - 12, ch - 12, 34); g.lineWidth = 10; g.strokeStyle = C.ink; g.stroke();
      return c;
    });
  }
  const PATTERNS = ['stripes', 'halftone', 'checker', 'grid', 'sky', 'dots', 'rings', 'bars'];
  function texBoard(kind, tone = 0) {
    return cached('board3|' + kind + tone, () => {
      const s = 512, c = mkCanvas(s, s), g = c.getContext('2d');
      const base = tone === 1 ? C.sky : tone === 2 ? C.ink : '#F7F8FA';
      const fg = tone === 2 ? '#fff' : tone === 1 ? '#fff' : C.ink;
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      if (kind === 'stripes') stripes(g, 0, 0, s, s, 0.785, 64, [22], tone ? fg : C.sky, 0);
      if (kind === 'halftone') halftone(g, 0, 0, s, s, 24, 11, fg, (u, v) => u * 0.9 + 0.1);
      if (kind === 'checker') checker(g, 0, 0, s, s, 64, '#16181d', '#fff');
      if (kind === 'grid') grid(g, 0, 0, s, s, 42, fg, 3);
      if (kind === 'sky') { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#3D9FE6'); gr.addColorStop(1, '#D8EEF9'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
      if (kind === 'dots') for (let y = 32; y < s; y += 64) for (let x = 32 + (y / 64 % 2) * 32; x < s; x += 64) circle(g, x, y, 13, fg);
      if (kind === 'rings') for (let r = 30; r < 360; r += 40) circle(g, s / 2, s / 2, r, null, fg, 10);
      if (kind === 'bars') for (let i = 0; i < 9; i++) g.fillRect(40 + i * 50, 60 + rnd(i, 3) * 200, 22, s);
      g.lineWidth = 16; g.strokeStyle = C.ink; g.strokeRect(8, 8, s - 16, s - 16);
      return c;
    });
  }
  function texWord(text, lit) {
    return cached('word3|' + text + lit, () => {
      const g0 = mkCanvas(8, 8).getContext('2d');
      g0.font = font(900, 150, F.min);
      const tw = g0.measureText(text).width;
      const w = Math.ceil(tw + 140), h = 240;
      const c = mkCanvas(w, h), g = c.getContext('2d');
      rrect(g, 6, 6, w - 12, h - 12, 18); g.fillStyle = lit ? '#FFFFFF' : '#182646'; g.fill();
      g.lineWidth = 8; g.strokeStyle = lit ? C.ink : 'rgba(255,255,255,0.65)'; g.stroke();
      g.font = font(900, 150, F.min); g.textBaseline = 'middle'; g.textAlign = 'center';
      if (lit) { g.fillStyle = C.ink; g.fillText(text, w / 2, h / 2 + 6); g.fillStyle = C.sky; g.fillRect(30, h - 34, 60, 10); }
      else { g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 6); }
      return c;
    });
  }
  function texLetter(ch, side) {
    return cached('let3|' + ch + side, () => {
      const c = mkCanvas(320, 400), g = c.getContext('2d');
      g.font = font(400, 400, F.disp); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      if (side) { g.fillStyle = side; g.fillText(ch, 160, 378); }
      else {
        g.fillStyle = '#FFFFFF'; g.fillText(ch, 160, 378);
        g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = C.ink; g.strokeText(ch, 160, 378);
      }
      return c;
    });
  }
  function texGlow() {
    return cached('glow3', () => {
      const c = mkCanvas(256, 256), g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      return c;
    });
  }
  function texRim() {
    return cached('rim3', () => {
      const c = mkCanvas(256, 384), g = c.getContext('2d');
      g.shadowColor = '#fff'; g.shadowBlur = 34;
      rrect(g, 40, 40, 176, 304, 22); g.lineWidth = 14; g.strokeStyle = '#fff'; g.stroke();
      g.shadowBlur = 0; g.lineWidth = 6; g.stroke();
      return c;
    });
  }
  const T = (key, cv) => G.tex(key, cv);
  PV.texCard3 = (m) => texCard(m, true);
  PV.texBoard3 = texBoard;
  PV.texWord3 = (text) => texWord(text, true);

  // lit state of members (pre-chorus colour order)
  const LIT_AT = { rana: B(41), anon: B(43), soyo: B(45), taki: B(47), tomori: B(49) };
  const litOf = (m, t) => E.outCubic(seg(t, LIT_AT[m] - 0.05, LIT_AT[m] + 0.25));

  // common drawing helpers
  function card(m, pos, rot, t, scale = 1, o = {}) {
    const lit = o.lit != null ? o.lit : litOf(m, t);
    const model = M().trs(pos, rot, [2.2 * scale, 3.44 * scale, 1]);
    G.quad(model, { tex: T('card3|' + m + false, texCard(m, false)), at: 0.5, a2c: true });
    if (lit > 0) {
      const mm = M().trs(v3.add(pos, rotDir(rot, 0.012)), rot, [2.2 * scale, 3.44 * scale, 1]);
      G.quad(mm, { tex: T('card3|' + m + true, texCard(m, true)), at: 0.5, a2c: true, tint: [1, 1, 1, 1], blend: lit < 1, depthWrite: true });
      // rim light behind the card
      const rm = M().trs(v3.add(pos, rotDir(rot, -0.05)), rot, [2.2 * scale * 1.45, 3.44 * scale * 1.3, 1]);
      G.quad(rm, { tex: T('rim3', texRim()), tint: G.tint(MEM[m].c, 0.95 * lit), blend: true, additive: true, depthWrite: false, noFog: true });
    }
  }
  // offset along the board normal for a given euler rotation
  function rotDir(rot, d) {
    const m = M().trs([0, 0, 0], rot, [1, 1, 1]);
    return [m[8] * d, m[9] * d, m[10] * d];
  }
  function board(kind, tone, pos, rot, w, h, o = {}) {
    G.quad(M().trs(pos, rot, [w, h, 1]), { tex: T('board3|' + kind + tone, texBoard(kind, tone)), at: 0.5, tint: o.tint });
  }
  function word(text, lit, pos, rot, hgt) {
    const c0 = texWord(text, false);
    const w = (hgt * c0.width) / c0.height;
    G.quad(M().trs(pos, rot, [w, hgt, 1]), { tex: T('word3|' + text + false, c0), at: 0.5, a2c: true });
    if (lit > 0) G.quad(M().trs(v3.add(pos, rotDir(rot, 0.02)), rot, [w, hgt, 1]), { tex: T('word3|' + text + true, texWord(text, true)), at: 0.02, blend: true, tint: [1, 1, 1, lit], depthWrite: false });
  }
  // extruded letter from stacked slices
  function letter(ch, pos, rotY, hgt, depth, sideCol, slices = 34) {
    const w = hgt * 0.8;
    const front = T('let3|' + ch + '', texLetter(ch, null));
    const side = T('let3|' + ch + sideCol, texLetter(ch, sideCol));
    for (let i = 0; i <= slices; i++) {
      const d = (i / slices - 0.5) * depth;
      const p = [pos[0] + Math.sin(rotY) * d, pos[1], pos[2] + Math.cos(rotY) * d];
      const isFace = i === 0 || i === slices;
      G.quad(M().trs(p, [0, rotY, 0], [w, hgt, 1]), { tex: isFace ? front : side, at: 0.5, a2c: true });
    }
  }
  function sky3(t) { return mix(C.navy, '#22407A', seg(t, B(41), B(46))); }
  function hudStars(ctx, t, pts, col) {
    pts.forEach((p, i) => {
      const s = G.project(p);
      if (s.z <= 0.3) return;
      const k = clamp(9 / s.z, 0.2, 2.5);
      const bp = beatPulse(t + i * 0.05, 0.25);
      if (i % 3 === 0) star4(ctx, s.x, s.y, (10 + 14 * bp) * k, col || '#fff');
      else circle(ctx, s.x, s.y, (3 + 3 * bp) * k, i % 2 ? '#fff' : (col || C.sky));
    });
  }
  function blit(ctx) { ctx.drawImage(G.canvas, 0, 0, W, H); }
  // pre-chorus colour tracker: the five representative colours light up bar by bar
  function litHUD(ctx, t) {
    PV.ORDER.forEach((m, i) => {
      const lit = litOf(m, t);
      const pop = 1 + 0.5 * PV.pulse(t, LIT_AT[m], 0.25);
      circle(ctx, 1644 + i * 36, 120, 11 * pop, lit > 0.02 ? PV.mix('#2A3A5E', MEM[m].c, lit) : 'rgba(255,255,255,0.12)', '#fff', 1.5);
    });
    txt(ctx, 'LIT', 1610, 125, { size: 11, weight: 800, track: 3, color: '#fff', align: 'right' });
  }

  /* ============================== SHOT 23 · pull back, fly in ============================== */
  const T23 = B(39);
  let frame22 = null;
  const FOV = 0.9, D0 = 4.5 / Math.tan(FOV / 2);
  const W23 = [];
  for (let i = 0; i < 44; i++) {
    const z = 12 - i * 2.2;
    const side = i % 2 ? 1 : -1;
    W23.push({ kind: PATTERNS[i % PATTERNS.length], tone: i % 3, pos: [side * (3.5 + rnd(i, 1) * 10) - 4, (rnd(i, 2) - 0.5) * 11, z - 4 - rnd(i, 3) * 4], rot: [(rnd(i, 4) - 0.5) * 0.6, (rnd(i, 5) - 0.5) * 1.2, (rnd(i, 6) - 0.5) * 0.5], s: 2.4 + rnd(i, 7) * 3.6 });
  }
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * TAU + 0.2;
    W23.push({ kind: PATTERNS[(i + 2) % PATTERNS.length], tone: (i + 1) % 3, pos: [Math.cos(ang) * (11.5 + rnd(i, 21) * 5), Math.sin(ang) * (7 + rnd(i, 22) * 3.5), -3 - rnd(i, 23) * 12], rot: [(rnd(i, 24) - 0.5) * 0.5, (rnd(i, 25) - 0.5) * 0.9, (rnd(i, 26) - 0.5) * 0.4], s: 2 + rnd(i, 27) * 3 });
  }
  const CARD23 = [['rana', [-12, 2.5, -4]], ['anon', [11, -2, -9]], ['soyo', [-7.5, -3.6, -19]], ['taki', [8.5, 3.8, -26]], ['tomori', [-3.6, 1.6, -40]]];
  const WORDS13 = () => LYR[12].words;
  function path23(u) {
    return cr([[2.5, 1.5, 31], [-6.5, 0.6, 14], [-10.5, 0.3, -2], [-6, -0.5, -18], [-2.5, 0.4, -34], [-2, 0.3, -46]], u);
  }
  function s23(ctx, t) {
    if (!G.ok) { PV.s22(ctx, t); return; }
    // the flat frame of shot 22, as a board
    if (!frame22) frame22 = mkCanvas(1280, 720);
    const fg = frame22.getContext('2d');
    fg.setTransform(1280 / W, 0, 0, 720 / H, 0, 0);
    PV.s22(fg, t, null, { noCaption: true });
    const ftex = G.tex('frame22', frame22, { update: true });
    const b40 = B(40);
    let eye, at;
    if (t < b40) {
      const u = E.outQuart(seg(t, T23 + 0.04, b40));
      eye = [lerp(0, 2.5, u), lerp(0, 1.5, u), lerp(D0, 31, u)];
      at = [lerp(0, -1, u), lerp(0, -0.2, u), 0];
    } else {
      const u = E.outExpo(seg(t, b40, B(41) + 0.25));
      eye = path23(0.92 * u);
      const ahead = path23(Math.min(1, 0.92 * u + 0.08));
      at = v3.lerp([-1, -0.2, 0], ahead, E.outCubic(seg(t, b40 - 0.02, b40 + 0.2)));
    }
    G.begin(C.navy, { eye, at, fov: FOV, far: 300 }, { color: C.navy, range: [38, 110], amount: 1 });
    // frame board (tilts slightly once revealed)
    const tilt = E.inOutCubic(seg(t, T23 + 0.3, b40)) * 0.18;
    G.quad(M().trs([0, 0, 0], [0, tilt, 0], [16, 9, 1]), { tex: ftex, noFog: t < T23 + 0.4 });
    // thin white edge around the frame board
    for (const [px, py, sx, sy] of [[0, 4.52, 16.1, 0.06], [0, -4.52, 16.1, 0.06], [8.02, 0, 0.06, 9.08], [-8.02, 0, 0.06, 9.08]])
      G.quad(M().trs([px * Math.cos(tilt), py, -px * Math.sin(tilt)], [0, tilt, 0], [sx, sy, 1]), { tint: [1, 1, 1, 1] });
    W23.forEach((b, i) => board(b.kind, b.tone, b.pos, [b.rot[0], b.rot[1] + (t - T23) * 0.15 * (i % 2 ? 1 : -1), b.rot[2]], b.s, b.s * (0.7 + rnd(i, 8) * 0.6)));
    CARD23.forEach(([m, p], i) => card(m, p, [0, 0.4 * (i % 2 ? -1 : 1) + Math.sin(t * 0.6 + i) * 0.1, 0], t, 1.1, { lit: 0 }));
    // the grazing board at the bar-40 downbeat
    board('stripes', 1, [-5.2, 1.4, 11.5], [0, 0.6, 0.1], 3.2, 2.2);
    // lyric 13 word boards along the flight path, lit as they are sung
    const words = WORDS13();
    const L = LYR[12];
    words.forEach((w, i) => {
      if (i > 2) return;
      const p = path23(0.45 + i * 0.16);
      const side = i % 2 ? 1 : -1;
      const pos = [p[0] + side * 2.6, p[1] + (i % 2 ? -1.1 : 1.2), p[2] - 1.5];
      word(w.text, fillOf(L.chars[w.i0], t), pos, [0, side * -0.35, 0], 1.7);
    });
    G.flush();
    blit(ctx);
    hudStars(ctx, t, CARD23.map(([m, p]) => [p[0] + 1.6, p[1] + 1.9, p[2]]), '#fff');
    // flat lyric strip (helps reading while the boards fly by)
    lyricStrip(ctx, t, t < 46.32 ? LYR[11] : LYR[12], 1);
  }
  // small subtitle-like strip used during the 3D flight
  function lyricStrip(ctx, t, L, a, y = 968) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    const harm = L.kind === 'harm';
    const lay = layoutH(ctx, L, 960, y, { size: harm ? 30 : 34, fam: harm ? F.got : F.min, weight: 700, align: 'center', track: harm ? 10 : 6, spaceW: 1, sx: harm ? 0.8 : 1 });
    rect(ctx, lay.x0 - 40, y - 30, lay.width + 80, 60, rgba(C.navy, 0.72));
    drawKaraoke(ctx, L, t, lay.items, { fam: harm ? F.got : F.min, weight: 700, color: harm ? C.yellow : '#fff', stroke: 'rgba(255,255,255,0.6)', lw: 1, hot: C.sky, scaleX: harm ? 0.8 : 1 });
    ctx.restore();
  }
  PV.lyricStrip = lyricStrip;
  PV.def({ id: 23, t0: T23, draw: s23, ov: 'white', name: 'BOARD SPACE' });

  /* ============================== SHOT 24 · giant letters ============================== */
  const T24 = B(41);
  const WORD24 = 'HITOSHIZUKU';
  const LX24 = (i) => (i - 5) * 3.45;
  const CARD24 = [['rana', [-4.6, 2.5, 3.3], -0.6], ['anon', [-1.7, 2.8, -2.6], 0.4], ['soyo', [8.5, 2.2, 2.4], -0.3], ['taki', [12.0, 3.4, -3.0], 0.5], ['tomori', [-8.6, 3.0, -3.0], 0.3]];
  function cam24(t) {
    const b42 = B(42), b43 = B(43);
    if (t < b42) {
      const u = E.outQuart(seg(t, T24 - 0.02, b42 + 0.1));
      const x = lerp(-24, -2, u);
      return { eye: [x, 1.25, 6.8], at: [x + 6, 1.9, -1.5] };
    }
    if (t < b43) {
      // continue along the front and turn around the last letter
      const u = E.outQuart(seg(t, b42 - 0.02, b43 + 0.1));
      const pts = [[-2, 1.25, 6.8], [9, 1.3, 6.6], [17.5, 1.4, 6.2], [22.5, 1.5, 1.5], [21, 1.5, -5.5]];
      const eye = cr(pts, u);
      const at = v3.lerp([4, 1.9, -1.5], [17.25, 2.2, 0], E.inOutCubic(clamp(u * 1.6)));
      return { eye, at: u > 0.62 ? v3.lerp(at, [10, 2, -2], (u - 0.62) / 0.38) : at };
    }
    const u = E.outQuart(seg(t, b43 - 0.02, B(44) + 0.1));
    const eye = v3.lerp([21, 1.5, -5.5], [4, 1.6, -7.2], u);
    return { eye, at: v3.add(eye, [-6, 0.4, 3.2]) };
  }
  function s24(ctx, t) {
    if (!G.ok) { rect(ctx, 0, 0, W, H, C.navy); return; }
    const bg = sky3(t);
    const c = cam24(t);
    G.begin(bg, { eye: c.eye, at: c.at, fov: 1.0, far: 300 }, { color: bg, range: [18, 60], amount: 1 });
    // white grid floor
    G.floor(M().trs([0, 0, 0], [-Math.PI / 2, 0, 0], [140, 140, 1]), { tint: G.tint(mix(bg, '#0A1228', 0.4), 1), line: [1, 1, 1, 0.9], step: 1.15, major: 4 });
    // giant extruded letters
    for (let i = 0; i < WORD24.length; i++) {
      letter(WORD24[i], [LX24(i), 2.25, 0], 0, 4.5, 1.05, '#B9C6DA');
    }
    // floating boards between the letters
    for (let i = 0; i < 10; i++) {
      const x = LX24(i) + 1.72, y = 4.9 + rnd(i, 2) * 2.2, z = (rnd(i, 3) - 0.5) * 6;
      board(PATTERNS[(i + 3) % PATTERNS.length], i % 3, [x, y, z], [0, (rnd(i, 4) - 0.5) * 1.4 + Math.sin(t * 0.7 + i) * 0.15, (rnd(i, 5) - 0.5) * 0.4], 1.5 + rnd(i, 6), 1.1 + rnd(i, 7));
    }
    // member cards; on their bar they light up with a rim light and turn to face the camera
    CARD24.forEach(([m, p, ry], i) => {
      const lit = litOf(m, t);
      const toCam = Math.atan2(c.eye[0] - p[0], c.eye[2] - p[2]);
      const ang = lerp(ry + Math.sin(t * 0.8 + i) * 0.08, toCam, E.outBack(lit, 1.4) * 0.9);
      card(m, [p[0], p[1] + Math.sin(t * 1.3 + i) * 0.12, p[2]], [0, ang, 0], t, 0.95);
    });
    // word boards: second half of lyric 13
    const L = LYR[12];
    const ws = L.words;
    const spots = [[-12, 5.6, 3.6, 0.25], [2.5, 5.8, 4.2, -0.15], [14.5, 5.4, 3.2, -0.5], [19.5, 4.2, -3.6, -1.9], [11.5, 4.9, -4.6, -2.8], [3.0, 5.4, -4.8, -3.0]];
    ws.forEach((w, i) => {
      if (i < 2) return;
      const s = spots[i - 2];
      word(w.text, fillOf(L.chars[w.i0], t), [s[0], s[1], s[2]], [0, s[3], 0], 1.35);
    });
    G.flush();
    blit(ctx);
    // twinkles around the cards (in their colours once lit)
    CARD24.forEach(([m, p], i) => {
      const lit = litOf(m, t);
      hudStars(ctx, t, [[p[0] + 1.5, p[1] + 1.9, p[2]], [p[0] - 1.4, p[1] - 1.2, p[2] + 0.2], [p[0] + 1.2, p[1] - 1.9, p[2]]], lit > 0.5 ? MEM[m].c : '#fff');
    });
    litHUD(ctx, t);
    lyricStrip(ctx, t, L, 1);
  }
  PV.def({ id: 24, t0: T24, draw: s24, ov: 'white', name: 'BOARD SPACE' });

  /* ============================== SHOT 25 · orbit & anamorphic sentence ============================== */
  const T25 = B(44);
  const TSTAR = B(46);
  const ORB_R = 10.5, ORB_H = 2.6;
  function theta25(t) {
    // angle increases; holds still for one beat at the target pose
    const a0 = -1.25, aStar = 0.0, a1 = 1.15;
    if (t < TSTAR) return lerp(a0, aStar, E.inOutCubic(seg(t, T25 - 0.3, TSTAR)) * 0.92 + 0.08 * seg(t, T25 - 0.3, TSTAR));
    if (t < TSTAR + BEAT) return aStar;
    return lerp(aStar, a1, E.inCubic(seg(t, TSTAR + BEAT, B(47) + 0.2)));
  }
  const camAt = (th) => ({ eye: [Math.sin(th) * ORB_R, ORB_H, Math.cos(th) * ORB_R], at: [0, 2.3, 0] });
  // build anamorphic fragments for lyric 14 (screen layout at the target pose)
  let FRAG = null, lineHollow = null, lineSolid = null;
  function buildFrag() {
    const L = LYR[13];
    const size = 118;
    const cvW = 2048, cvH = 256;
    lineHollow = mkCanvas(cvW, cvH); lineSolid = mkCanvas(cvW, cvH);
    const gh = lineHollow.getContext('2d'), gs = lineSolid.getContext('2d');
    gh.font = gs.font = font(900, size, F.min);
    gh.textBaseline = gs.textBaseline = 'middle'; gh.textAlign = gs.textAlign = 'center';
    let x = 60; const boxes = [];
    for (let i = 0; i < L.chars.length; i++) {
      const w = gh.measureText(L.chars[i].ch).width + 14;
      boxes.push([x, w]);
      gh.lineWidth = 3.5; gh.strokeStyle = '#fff'; gh.lineJoin = 'round'; gh.strokeText(L.chars[i].ch, x + w / 2, cvH / 2 + 4);
      gs.fillStyle = '#fff'; gs.fillText(L.chars[i].ch, x + w / 2, cvH / 2 + 4);
      x += w;
    }
    const total = x - 60;
    // screen placement at the target pose: centred, y = 900
    const scale = 1560 / total; // texture px → screen px
    const sx0 = 960 - (total * scale) / 2, sy = 905;
    const cam = camAt(0);
    const fwd = v3.norm(v3.sub(cam.at, cam.eye));
    const right = v3.norm(v3.cross(fwd, [0, 1, 0]));
    const up = v3.cross(right, fwd);
    const th = Math.tan(FOV25 / 2);
    FRAG = [];
    boxes.forEach(([bx, bw], i) => {
      const parts = 2 + (i % 2);
      for (let p = 0; p < parts; p++) {
        // vertical slices of the glyph cell
        const u0 = bx + (bw * p) / parts, u1 = bx + (bw * (p + 1)) / parts;
        const v0 = 40, v1 = cvH - 40;
        const scx = sx0 + ((u0 + u1) / 2 - 60) * scale, scy = sy + ((v0 + v1) / 2 - cvH / 2) * scale;
        const sw = (u1 - u0) * scale, sh = (v1 - v0) * scale;
        const d = 3.5 + rnd(i, p, 9) * 9.5;
        const ndx = (scx / W) * 2 - 1, ndy = 1 - (scy / H) * 2;
        const asp = W / H;
        const dir = v3.norm(v3.add(fwd, v3.add(v3.mul(right, ndx * th * asp), v3.mul(up, ndy * th))));
        const along = d / (dir[0] * fwd[0] + dir[1] * fwd[1] + dir[2] * fwd[2]);
        const pos = v3.add(cam.eye, v3.mul(dir, along));
        const wpx = (2 * d * th) / H; // world units per screen px at depth d
        FRAG.push({ i, pos, w: sw * wpx, h: sh * wpx, uv: [u0 / cvW, v0 / cvH, u1 / cvW, v1 / cvH] });
      }
    });
  }
  const FOV25 = 0.85;
  const ORBIT25 = ['rana', 'anon', 'soyo', 'taki'];
  function s25(ctx, t) {
    if (!G.ok) { rect(ctx, 0, 0, W, H, C.navy); return; }
    if (!FRAG) buildFrag();
    const bg = sky3(t);
    const th = theta25(t);
    const c = camAt(th);
    G.begin(bg, { eye: c.eye, at: c.at, fov: FOV25, far: 300 }, { color: bg, range: [16, 48], amount: 1 });
    G.floor(M().trs([0, -1.2, 0], [-Math.PI / 2, 0, 0], [120, 120, 1]), { tint: G.tint(mix(bg, '#0A1228', 0.45), 1), line: [1, 1, 1, 0.55], step: 1.2, major: 5 });
    // centre: Tomori's full-body card
    card('tomori', [0, 2.3, 0], [0, th * 0.65, 0], t, 1.35, { lit: 1 });
    // the other cards circle at different speeds (near fast, far slow); Soyo swings to the front in bar 45
    ORBIT25.forEach((m, i) => {
      const r = 5.2 + i * 1.6;
      let a = i * 1.57 + (t - T25) * (0.75 - i * 0.12);
      let rr = r;
      if (m === 'soyo') {
        // swings round to the foreground (left of frame) on bar 45, then returns to its orbit before bar 46
        const sw = E.inOutCubic(seg(t, B(45) - 0.25, B(45) + 0.3)) * (1 - E.inOutCubic(seg(t, B(45) + 0.62, B(46) - 0.12)));
        a = lerp(a, th - 0.62, sw);
        rr = lerp(r, 7.6, sw);
      }
      const p = [Math.sin(a) * rr, 2.1 + Math.sin(t + i) * 0.5, Math.cos(a) * rr];
      card(m, p, [0, a + Math.PI * 0, 0], t, 0.9);
    });
    for (let i = 0; i < 14; i++) {
      const a = i * 0.9 + (t - T25) * (0.35 + (i % 3) * 0.12), r = 8 + (i % 4) * 2.4;
      board(PATTERNS[i % PATTERNS.length], i % 3, [Math.sin(a) * r, -0.2 + (i % 5) * 1.3, Math.cos(a) * r], [0, a, 0.2 * Math.sin(i)], 1.3, 1);
    }
    // anamorphic fragments of lyric 14
    const L = LYR[13];
    const hk = G.tex('l14h', lineHollow), sk = G.tex('l14s', lineSolid);
    FRAG.forEach((f) => {
      const model = M().trs(f.pos, [0, 0, 0], [f.w, f.h, 1]);
      // face the target camera orientation (yaw only: target looks along -z)
      G.quad(model, { tex: hk, uv: f.uv, at: 0.4, a2c: true, tint: [1, 1, 1, 0.9] });
      const fl = fillOf(L.chars[f.i], t);
      if (fl > 0) G.quad(M().trs([f.pos[0], f.pos[1], f.pos[2] + 0.002], [0, 0, 0], [f.w, f.h, 1]), { tex: sk, uv: f.uv, at: 0.4, a2c: true, tint: G.tint(PV.hotOf(L, L.chars[f.i], t) > 0.5 ? C.sky : '#ffffff', fl) });
    });
    G.flush();
    blit(ctx);
    hudStars(ctx, t, [[1.8, 4.6, 0.4], [-1.9, 1.0, 0.3], [2.2, 0.2, -0.4], [-2.4, 4.1, 0.2]], C.sky);
    // the moment the sentence assembles: a thin bracket + label
    const hold = seg(t, TSTAR - 0.05, TSTAR + 0.05) * (1 - seg(t, TSTAR + BEAT, TSTAR + BEAT + 0.1));
    if (hold > 0) {
      ctx.save(); ctx.globalAlpha = hold;
      line(ctx, 170, 830, 170, 980, '#fff', 2); line(ctx, 170, 830, 196, 830, '#fff', 2); line(ctx, 170, 980, 196, 980, '#fff', 2);
      line(ctx, 1750, 830, 1750, 980, '#fff', 2); line(ctx, 1724, 830, 1750, 830, '#fff', 2); line(ctx, 1724, 980, 1750, 980, '#fff', 2);
      txt(ctx, 'ALIGNED · BAR 46', 960, 800, { size: 12, weight: 800, track: 6, color: C.sky, align: 'center' });
      ctx.restore();
    }
    litHUD(ctx, t);
  }
  PV.def({ id: 25, t0: T25, draw: s25, ov: 'white', name: 'BOARD SPACE' });

  /* ============================== SHOT 26 · spiral ============================== */
  const T26 = B(47);
  const SPIRAL = [];
  for (let k = 0; k < 64; k++) {
    const a = k * 0.42, r = 1.6 + k * 0.29;
    SPIRAL.push({ a, r, y: Math.sin(k * 0.7) * 1.3 + (k % 2 ? 0.5 : -0.5), k });
  }
  const VIEWS = [
    { eye: [5, -5.5, 9], at: [0, 1.5, 0] },
    { eye: [0.01, 24, 0.5], at: [0, 0, 0], up: [0, 0, -1] },
    { eye: [21, 1.2, 2], at: [0, 0.5, 0] },
    { eye: [4.6, 1.6, 7.4], at: [2.2, 1.2, 1.5] },
  ];
  function spinOf(t) {
    // spiral rotation; accelerating to the fastest in bar 49
    const base = (t - T26) * 0.5;
    const extra = Math.pow(seg(t, B(49) - 0.2, B(50)), 2) * 3.2;
    return base + extra;
  }
  function drawSpiral(t, spin) {
    const L = LYR[14];
    const n = SPIRAL.length;
    SPIRAL.forEach((s, idx) => {
      const a = s.a + spin * (1.2 - s.r / 30);
      const p = [Math.cos(a) * s.r, s.y, Math.sin(a) * s.r];
      const face = -a + Math.PI / 2;
      const outer = idx >= n - L.chars.length;
      if (outer) {
        // outermost boards carry lyric 15, one big character each (hollow, filled when sung)
        const ci = idx - (n - L.chars.length);
        const ch = L.chars[ci];
        const key = 'ch15|' + ci;
        const hollow = cached(key + 'h', () => charBoard(ch.ch, false));
        const solid = cached(key + 's', () => charBoard(ch.ch, true));
        G.quad(M().trs(p, [0, face, 0], [2.6, 2.6, 1]), { tex: G.tex(key + 'h', hollow), at: 0.5, a2c: true });
        const f = fillOf(ch, t);
        if (f > 0) G.quad(M().trs(v3.add(p, rotDir([0, face, 0], 0.02)), [0, face, 0], [2.6, 2.6, 1]), { tex: G.tex(key + 's', solid), at: 0.02, blend: true, tint: [1, 1, 1, f], depthWrite: false });
      } else if (idx % 4 === 0) {
        const m = PV.ORDER[(idx / 4) % 5];
        card(m, p, [0, face, 0], t, 0.62);
      } else {
        board(PATTERNS[idx % PATTERNS.length], idx % 3, p, [0, face, (idx % 5) * 0.1], 1.1 + (idx % 3) * 0.35, 0.9 + (idx % 2) * 0.4);
      }
    });
  }
  function charBoard(ch, solid) {
    const c = mkCanvas(320, 320), g = c.getContext('2d');
    rrect(g, 6, 6, 308, 308, 24); g.fillStyle = solid ? '#FFFFFF' : 'rgba(255,255,255,0.08)'; g.fill();
    g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
    g.font = font(900, 230, F.min); g.textAlign = 'center'; g.textBaseline = 'middle';
    if (solid) { g.fillStyle = C.ink; g.fillText(ch, 160, 168); }
    else { g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.strokeText(ch, 160, 168); }
    return c;
  }
  function render26(t, view, bg) {
    G.begin(bg, { eye: view.eye, at: view.at, up: view.up, fov: 0.95, far: 400 }, { color: bg, range: [30, 120], amount: 1 });
    // taki's card swoops past in bar 48
    const sw = seg(t, B(48) - 0.1, B(48) + 0.5);
    if (sw > 0 && sw < 1) {
      const e = view.eye, a = view.at;
      const fwd = v3.norm(v3.sub(a, e));
      const p = v3.add(e, v3.add(v3.mul(fwd, 3.2), [lerp(-7, 7, E.inOutCubic(sw)), lerp(1.5, -0.8, sw), 0]));
      card('taki', p, [0, Math.atan2(-fwd[0], -fwd[2]), 0.3], t, 1.0);
    }
    drawSpiral(t, spinOf(t));
    G.flush();
  }
  // pixel-block cover: blocks double every frame (60 fps clock) until full
  const BLOCK_ORDER = (() => { const a = []; for (let i = 0; i < 144; i++) a.push(i); for (let i = 143; i > 0; i--) { const j = Math.floor(rnd(i, 77) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
  function blocksAt(t, tb) {
    const f = Math.floor((t - (tb - 0.13)) * 60);
    if (f < 0) return 0;
    return Math.min(144, Math.pow(2, f));
  }
  let viewCv = null;
  const FAR26 = [0, 15.5, 21];
  // five-colour sparkles riding the spiral arms (bar 49: every colour lit)
  function spiralSparkles(ctx, t, amt) {
    if (amt <= 0) return;
    const spin = spinOf(t);
    for (let i = 0; i < 36; i++) {
      const s = SPIRAL[(i * 7) % SPIRAL.length];
      const a = s.a + spin * (1.2 - s.r / 30) + 0.21;
      const p = G.project([Math.cos(a) * s.r, s.y + 1.4, Math.sin(a) * s.r]);
      if (p.z <= 0.5) continue;
      const bp = beatPulse(t + i * 0.037, 0.22, 2);
      const col = MEM[PV.ORDER[i % 5]].c;
      ctx.save(); ctx.globalAlpha = amt;
      if (i % 3 === 0) star4(ctx, p.x, p.y, (10 + 16 * bp) * clamp(24 / p.z, 0.4, 1.6), col);
      else circle(ctx, p.x, p.y, (3 + 4 * bp) * clamp(24 / p.z, 0.4, 1.6), col);
      ctx.restore();
    }
  }
  function s26(ctx, t) {
    if (!G.ok) { rect(ctx, 0, 0, W, H, C.navy); return; }
    const bg = mix(sky3(t), '#3A6FB8', seg(t, B(49), B(50)));
    const vt = [B(47), B(47, 3), B(48), B(48, 3)];
    let vi = 0; for (let i = 0; i < 4; i++) if (t >= vt[i]) vi = i;
    const b49 = B(49);
    if (t >= b49) {
      // fastest pull-back to the farthest point; whole spiral appears
      const u = E.outExpo(seg(t, b49 - 0.02, B(50) - 0.05));
      const eye = v3.lerp(VIEWS[3].eye, FAR26, u), at = v3.lerp(VIEWS[3].at, [0, 0, 0], clamp(u * 1.4));
      render26(t, { eye, at }, bg);
      blit(ctx);
      spiralSparkles(ctx, t, E.outCubic(seg(t, b49, b49 + 0.3)));
    } else {
      // two-beat views joined by pixel-block covers
      render26(t, VIEWS[vi], bg);
      blit(ctx);
      const next = vi + 1;
      if (next < 4) {
        const n = blocksAt(t, vt[next]);
        if (n > 0) {
          if (!viewCv) viewCv = mkCanvas(G.canvas.width, G.canvas.height);
          if (viewCv.width !== G.canvas.width || viewCv.height !== G.canvas.height) { viewCv.width = G.canvas.width; viewCv.height = G.canvas.height; }
          render26(t, VIEWS[next], bg);
          const g = viewCv.getContext('2d'); g.clearRect(0, 0, viewCv.width, viewCv.height); g.drawImage(G.canvas, 0, 0);
          ctx.save(); ctx.beginPath();
          for (let i = 0; i < n; i++) { const b = BLOCK_ORDER[i]; ctx.rect((b % 16) * 120, Math.floor(b / 16) * 120, 120, 120); }
          ctx.clip(); ctx.drawImage(viewCv, 0, 0, W, H); ctx.restore();
        }
      }
    }
    litHUD(ctx, t);
    lyricStrip(ctx, t, t < 55.36 ? LYR[13] : LYR[14], 1);
  }
  PV.def({ id: 26, t0: T26, draw: s26, ov: 'white', name: 'BOARD SPACE · SPIRAL' });

  /* ============================== SHOT 27 · collapse to a white point ============================== */
  const T27 = B(50);
  function s27(ctx, t) {
    const b3 = B(50, 3), end = 58.544;
    const u = E.inCubic(seg(t, b3 - 0.02, end - 0.03)); // visibly falls in from beat 3, faster and faster
    rect(ctx, 0, 0, W, H, C.navy);
    // still full on beats 1–2: the spiral keeps turning, all colours lit
    if (G.ok) { render26(t, { eye: FAR26, at: [0, 0, 0] }, '#3A6FB8'); }
    // beat 3: everything falls into the centre, faster and faster, washing to white
    const sc = Math.max(0.004, 1 - u);
    ctx.save();
    ctx.translate(960, 540); ctx.scale(sc, sc);
    if (G.ok) ctx.drawImage(G.canvas, -960, -540, W, H); else rect(ctx, -960, -540, W, H, '#3A6FB8');
    ctx.globalAlpha = clamp(u * 1.7);
    rect(ctx, -960, -540, W, H, '#ffffff');
    ctx.restore();
    if (u > 0.3) circle(ctx, 960, 540, 7 * clamp((u - 0.3) * 3), '#fff');
    if (u <= 0) { if (G.ok) spiralSparkles(ctx, t, 1); lyricStrip(ctx, t, LYR[14], 1 - seg(t, b3 - 0.3, b3)); }
  }
  PV.def({ id: 27, t0: T27, draw: s27, ov: 'white', name: 'COLLAPSE' });
})();
