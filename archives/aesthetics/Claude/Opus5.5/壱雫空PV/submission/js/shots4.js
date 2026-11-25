/* Shots 28–36: the chorus — the brightest, fullest, fastest section. */
'use strict';
(function () {
  const PV = window.PV;
  const { W, H, B, BEAT, BAR, C, MEM, E, ease, seg, clamp, lerp, rnd, rgba, mix, font, F, TAU,
    rect, circle, line, rrect, grid, stripes, halftone, star4, star5, checker, barcode, tag, txt, ringText, glow, veil, ruler,
    drawFigure, drawCrop, silhouette, mono, rim, IMG, drawKaraoke, layoutH, layoutV, fillOf, hotOf, beatPulse, beatPos, pulse,
    mkCanvas, cached, antic } = PV;
  const LYR = PV.LY;
  const G = PV.G3;
  const SKY1 = '#2E9BEA', SKY2 = '#8FD3FF', SUN = C.sun;

  // ---------- chorus helpers ----------
  // falling confetti (deterministic: position is a pure function of t)
  const CONF_COL = [C.green, C.coral, C.yellow, C.indigo, C.sky, '#ffffff', SUN];
  function confetti(ctx, t, t0, n = 46, a = 1) {
    const fade = clamp((t - t0) / 0.4) * a;
    if (fade <= 0) return;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const per = 3.6 + rnd(i, 1) * 3.4;
      const age = (t - t0 + rnd(i, 2) * per) % per;
      const y = -40 + age * (H + 80) / per;
      const x = rnd(i, 3) * W + Math.sin(age * (1.4 + rnd(i, 4) * 1.6) + i) * (30 + rnd(i, 5) * 50);
      const rot = age * (2 + rnd(i, 6) * 4) * (i % 2 ? 1 : -1);
      const sx = Math.cos(age * (3 + rnd(i, 7) * 5));
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, sx);
      ctx.globalAlpha = fade;
      ctx.fillStyle = CONF_COL[i % CONF_COL.length];
      if (i % 4 === 0) { ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill(); }
      else ctx.fillRect(-9, -4, 18, 8);
      ctx.restore();
    }
    ctx.restore();
  }
  PV.confetti = confetti;
  // one frame before each chorus layout change: flash the next layout's main colour
  const FLASH = [[B(53), SKY1], [B(54), '#ffffff'], [B(54, 3), SKY1], [B(55), SKY1], [B(56), '#ffffff'], [B(57), SUN], [B(58), SKY1], [B(59), '#ffffff'],
    [B(60), SUN], [B(61), SKY1], [B(62), SKY1], [B(63), '#ffffff'], [B(64), SUN], [B(65), SKY1], [B(66), SUN], [B(67), '#ffffff']];
  function chorusFlash(ctx, t) {
    for (const [tb, col] of FLASH) if (t >= tb - 1 / 60 && t < tb) { rect(ctx, 0, 0, W, H, col); return true; }
    return false;
  }
  PV.chorusFlash = chorusFlash;
  function skyGrad(ctx, a = SKY1, b = SKY2) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function sunRays(ctx, cx, cy, rot, n = 18, a = 0.2, r = 2600) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = a0 + (TAU / n) * 0.5;
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r); ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r); ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
  function rainbowBand(ctx, x0, y0, x1, y1, w, a = 1) {
    const cols = ['#FF7A8A', '#FFB36B', '#FFE07A', '#86E08A', '#7CC8F2', '#9A8CE6'];
    const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang); ctx.globalAlpha = a;
    cols.forEach((c, i) => rect(ctx, 0, -w / 2 + (i * w) / cols.length, len, w / cols.length + 0.5, c));
    ctx.restore();
  }
  PV.sunRays = sunRays; PV.rainbowBand = rainbowBand;

  /* ============================== SHOT 28 · held breath ============================== */
  const T28 = 58.544;
  function s28(ctx, t, s, o = {}) {
    // grows out of the white point left by shot 27, then holds completely still
    const g = E.outExpo(seg(t, T28, T28 + 0.2));
    if (g < 1) {
      rect(ctx, 0, 0, W, H, C.navy);
      circle(ctx, 960, 540, 7, '#ffffff');
      ctx.save();
      ctx.beginPath(); ctx.arc(960, 540, 7 + 1150 * g, 0, TAU); ctx.clip();
      s28body(ctx, t);
      ctx.restore();
      circle(ctx, 960, 540, 7 + 1150 * g, null, 'rgba(255,255,255,0.8)', 2);
    } else s28body(ctx, t);
  }
  function s28body(ctx, t) {
    rect(ctx, 0, 0, W, H, '#5E7187');
    // static dot matrix
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    for (let y = 18; y < H; y += 24) for (let x = 18 + ((y / 24) % 2) * 12; x < W; x += 24) ctx.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
    ctx.globalAlpha = 1;
    // line 16, thin-stroke hollow characters on the centre line
    const L = LYR[15];
    const bright = E.inCubic(seg(t, T28, B(52) - 0.02));
    const lay = layoutH(ctx, L, 960, 540, { size: 150, fam: F.min, weight: 300, align: 'center', track: 10 });
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 300, color: '#ffffff', stroke: '#ffffff', lw: 1.4,
      fillOverride: (i, c) => Math.max(fillOf(c, t), 0.0) });
    // global slow filling with the brightness (unsung characters get a faint fill)
    ctx.save(); ctx.globalAlpha = 0.28 * bright;
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 300, color: '#ffffff', fillOverride: () => 1 });
    ctx.restore();
    line(ctx, 120, 650, 1800, 650, 'rgba(255,255,255,0.7)', 1);
    txt(ctx, 'BAR 51 — VOICE ONLY', 120, 680, { size: 12, weight: 800, track: 6, color: '#fff' });
    txt(ctx, '58.54', 1800, 680, { size: 12, fam: F.mono, weight: 600, color: '#fff', align: 'right' });
    // darkness lifting: brighter and brighter, faster and faster; a jolt on 59.78
    let dark = lerp(0.74, 0.0, bright);
    dark -= 0.4 * pulse(t, 59.78, 0.18);
    veil(ctx, '#0B1322', dark);
    // the sung characters stay lit above the darkness (only they are the hot spot)
    ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * bright;
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 300, color: '#ffffff' });
    ctx.restore();
    veil(ctx, '#ffffff', clamp(-dark) + 0.12 * pulse(t, 59.78, 0.18));
    // the last moments rise towards white
    veil(ctx, '#ffffff', E.inExpo(seg(t, B(52) - 0.28, B(52))) * 0.92);
  }
  PV.def({ id: 28, t0: T28, draw: s28, ov: 'white', name: 'CHORUS · HOLD' });

  /* ============================== SHOT 29 · sky, sun, stickers ============================== */
  const T29 = B(52);
  const ROW29 = ['rana', 'anon', 'tomori', 'soyo', 'taki'];
  function s29(ctx, t) {
    skyGrad(ctx);
    sunRays(ctx, 1980, -120, (t - T29) * 0.12, 20, 0.16);
    // the big flat sun
    circle(ctx, 1160, 440, 360, SUN);
    circle(ctx, 1160, 440, 360, null, '#ffffff', 6);
    circle(ctx, 1160, 440, 300, null, rgba('#ffffff', 0.45), 2);
    // rainbow ribbon crossing diagonally
    rainbowBand(ctx, -100, 940, 2050, 120, 120);
    // dot matrix turned into coloured dashes, falling again
    const dc = [C.green, C.coral, C.yellow, C.indigo, '#ffffff'];
    for (let i = 0; i < 70; i++) {
      const per = 1.2 + rnd(i, 1) * 0.9;
      const age = (t - T29 + rnd(i, 2) * per) % per;
      const y = -30 + (age / per) * (H + 60), x = (i * 137) % W + 20;
      rect(ctx, x, y, 4, 22, dc[i % 5]);
    }
    // five stickers land one per 8th note, with a bounce
    ROW29.forEach((m, i) => {
      const tl = T29 + i * (BEAT / 2);
      const u = seg(t, tl - 0.12, tl + 0.2);
      if (u <= 0) return;
      const x = 300 + i * 330;
      const h = m === 'taki' ? 430 : 560;
      const y = 1020 - (1 - E.outBack(u, 2.0)) * 700;
      ctx.save();
      if (m === 'taki') drawFigure(ctx, m, x, y, h, { sticker: true });
      else drawFigure(ctx, m, x, y, h, { sticker: true });
      ctx.restore();
    });
    // stars all over
    for (let i = 0; i < 12; i++) {
      const bp = beatPulse(t + rnd(i, 3) * 0.3, 0.2, 2);
      star4(ctx, rnd(i, 4) * W, rnd(i, 5) * 600 + 40, (12 + rnd(i, 6) * 18) * (0.6 + 0.6 * bp), '#fff');
    }
    // line 16 continues
    const L = LYR[15];
    const lay = layoutH(ctx, L, 120, 190, { size: 96, fam: F.min, weight: 900, track: 4 });
    ctx.save(); ctx.translate(6, 6);
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 900, color: rgba(C.ink, 0.35), fillOverride: (i, c) => fillOf(c, t) });
    ctx.restore();
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 900, color: '#fff', stroke: '#fff', lw: 2, hot: SUN });
    confetti(ctx, t, T29);
    // white flash: full white for one frame on 60.045, then recedes with the new picture already inside
    const fl = seg(t, T29, T29 + 0.34);
    if (t < T29 + 1 / 60) veil(ctx, '#ffffff', 1);
    else veil(ctx, '#ffffff', 1 - E.outCubic(fl));
    chorusFlash(ctx, t);
  }
  PV.def({ id: 29, t0: T29, draw: s29, ov: 'white', name: 'CHORUS' });

  /* ============================== SHOT 30 · mirror ============================== */
  const T30 = B(53);
  const CROPS30 = [[140, -20, 900, 760], [560, 330, 820, 590], [600, 1160, 940, 1530]];
  function mirrorBG(ctx, t, mode) {
    if (mode === 0) { rect(ctx, 0, 0, W, 540, SKY1); rect(ctx, 0, 540, W, 540, '#2A8BD4'); }
    else {
      rect(ctx, 0, 0, W, H, SKY1);
      // mirrored rows of hollow MyGO!!!!!
      ctx.save();
      ctx.font = font(900, 190, F.sans); ctx.letterSpacing = '6px'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      const word = 'MyGO!!!!!  ', tw = ctx.measureText(word).width;
      for (let r = 0; r < 3; r++) {
        const y = 440 - r * 200, off = ((t * 60 * (r % 2 ? 1 : -1)) % tw) - tw;
        for (let x = off; x < W; x += tw) {
          ctx.strokeText(word, x, y);
          ctx.save(); ctx.translate(0, 1080); ctx.scale(1, -1); ctx.strokeText(word, x, y); ctx.restore();
        }
      }
      ctx.letterSpacing = '0px';
      ctx.restore();
    }
  }
  function s30(ctx, t) {
    const b54 = B(54), b54c = B(54, 3), b55 = B(55);
    const mode = t >= b54 + BEAT * 0.9 ? 1 : 0;
    mirrorBG(ctx, t, mode);
    // stripes sweep across in bar 54 (beats 1–2)
    const sw = seg(t, b54 - 0.05, b54 + BEAT * 1.6);
    // tomori: half-body sticker (bar 53–54a) → three cards (bar 54 beats 3–4)
    const three = E.outBack(seg(t, b54c - 0.15, b54c + 0.21), 1.4);
    const drawTop = (g) => {
      if (three <= 0) {
        const u = E.outBack(seg(t, T30 - 0.17, T30 + 0.22), 1.3);
        g.save(); g.beginPath(); g.rect(0, 0, W, 540); g.clip();
        drawCrop(g, 'tomori', [60, -40, 980, 820], 1290, 540 - 520 * u, 560, 520, { sticker: true });
        g.restore();
      } else {
        for (let i = 0; i < 3; i++) {
          const w = 196, h = 264, x = 1262 + i * 214 + (1 - three) * 200 * (i - 1), y = 540 - h - 36;
          g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((i - 1) * 0.05 * (1 - three)); g.scale(three, three);
          rect(g, -w / 2 - 10, -h / 2 - 10, w + 20, h + 20, '#fff');
          rect(g, -w / 2, -h / 2, w, h, i === 1 ? SUN : C.skyL);
          drawCrop(g, 'tomori', CROPS30[i], -w / 2, -h / 2, w, h);
          g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20);
          g.restore();
        }
      }
    };
    drawTop(ctx);
    // mirror image of the top half (bottom half)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 540, W, 540); ctx.clip();
    ctx.translate(0, 1080); ctx.scale(1, -1);
    ctx.globalAlpha = 0.55; drawTop(ctx); ctx.globalAlpha = 1;
    ctx.restore();
    rect(ctx, 0, 538, W, 4, '#ffffff');
    // line 17: same entrance as lyric 02 (words slide in from the left), larger; mirror always hollow
    const L = LYR[16];
    // two rows like lyric 02 in shot 03, but larger (150 vs 126)
    const r1 = layoutH(ctx, L, 110, 262, { size: 150, fam: F.min, weight: 800, track: 2, to: 3 });
    const r2 = layoutH(ctx, L, 110, 436, { size: 150, fam: F.min, weight: 800, track: 2, from: 3 });
    const lay = { items: r1.items.concat(r2.items) };
    const mv = lay.items.map((it) => {
      const w = L.words[L.chars[it.i].w];
      const u = seg(t, w.t - 0.08, w.t + 0.3);
      return { ...it, x: it.x - 180 * (1 - E.outExpo(u)), alpha: u > 0 ? 1 : 0 };
    });
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 800, color: '#fff', stroke: 'rgba(255,255,255,0.5)', lw: 1.6, fillOverride: () => 0 });
    drawKaraoke(ctx, L, t, mv, { fam: F.min, weight: 800, color: '#fff', stroke: '#fff', lw: 2, hot: SUN });
    ctx.save(); ctx.translate(0, 1080); ctx.scale(1, -1);
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 800, color: '#fff', stroke: 'rgba(255,255,255,0.6)', lw: 1.6, fillOverride: () => 0 });
    ctx.restore();
    txt(ctx, 'MIRROR / 鏡', 114, 150, { size: 12, weight: 800, track: 6, color: '#fff' });
    // sweeping stripes (over everything)
    if (sw > 0 && sw < 1) {
      const SW = [[0, 120, '#ffffff'], [150, 40, SUN], [210, 180, C.skyL], [420, 24, '#ffffff'], [470, 90, SUN], [580, 150, '#ffffff'], [760, 36, C.skyL], [820, 120, '#ffffff'], [960, 70, SUN], [1040, 40, '#ffffff']];
      SW.forEach(([y, h, c], i) => {
        const u = E.inOutQuart(seg(sw, i * 0.02, 0.62 + i * 0.02));
        rect(ctx, lerp(-1500, W + 100, u), y, 1400, h, c);
      });
    }
    // bar 55: the centre line closes into a slit (opened again by shot 31)
    const cl = E.inExpo(seg(t, 64.36, B(56) - 0.01));
    if (cl > 0) {
      rect(ctx, 0, 0, W, 540 * cl, '#0E1830');
      rect(ctx, 0, H - 540 * cl, W, 540 * cl, '#0E1830');
      line(ctx, 0, 540 * cl, W, 540 * cl, '#fff', 2); line(ctx, 0, H - 540 * cl, W, H - 540 * cl, '#fff', 2);
    }
    confetti(ctx, t, T29);
    chorusFlash(ctx, t);
  }
  PV.def({ id: 30, t0: T30, draw: s30, ov: 'white', name: 'CHORUS' });

  /* ============================== SHOT 31 · flower of umbrellas → five circles ============================== */
  const T31 = B(56);
  const ROW31 = ['rana', 'anon', 'tomori', 'soyo', 'taki'];
  const CROP31 = { rana: [120, -10, 900, 760], anon: [260, 0, 1010, 760], tomori: [130, -10, 890, 760], soyo: [200, 0, 820, 760], taki: [600, 0, 1200, 600] };
  const C31 = { x: 960, y: 515, d: 205 };
  const petal31 = (i) => -Math.PI / 2 + (i / 5) * TAU;
  // umbrella i of the flower, seen from above, leaning a touch outwards like a petal; all turn together so the
  // flower keeps its five-fold symmetry; fold 0..1 shuts it. The member colour sits in the hem and fold lines and
  // faintly in the plastic.
  function umb31(i, t, fold, x, y) {
    const a = petal31(i), m = ROW31[i];
    return {
      idx: i, x, y, scale: 1.45, tilt: Math.PI / 2 - 0.12, roll: -a - Math.PI / 2, spin: Math.PI / 8 + (t - T31) * 0.45,
      open: 1 - fold, tint: MEM[m].c, tintAmt: 0.3, glow: 0.1, rib: '#FFFFFF', handle: MEM[m].c, seam: mix(MEM[m].c, '#ffffff', 0.3), seamA: 0.7,
      fres: 0.3, sheen: 0.16, streak: 0.45, fold,
    };
  }
  // the few drops left after the rain, lit by the sun (they twinkle); they roll off as the canopy shuts
  function drops31(ctx, it, t) {
    const U = PV.UMB;
    const R = U.rain(it, t, { seed: 310 + it.idx, n: 5, rmin: 0.022, rmax: 0.045, rcap: 11 });
    [...R.back, ...R.front].forEach((b, j) => { b.spark = Math.pow(Math.max(0, Math.sin(t * 5.5 + j * 2.1 + it.idx * 1.3)), 3); });
    U.drawBeads(ctx, R.back, 'sun', { a: 1 - it.fold });
    U.drawBeads(ctx, R.front, 'sun', { a: 1 - it.fold });
  }
  function s31(ctx, t) {
    skyGrad(ctx, '#3AA4EE', '#7CCBFA');
    // big white polka dots, slowly travelling
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    const off = (t - T31) * 26;
    for (let y = -80; y < H + 160; y += 170) for (let x = -160; x < W + 160; x += 170) {
      ctx.beginPath(); ctx.arc(x + ((y / 170) % 2) * 85 + (off % 170), y + (off * 0.4) % 170, 44, 0, TAU); ctx.fill();
    }
    const b57 = B(57), b58 = B(58), b59 = B(59);
    const rowX = (i) => 960 + (i - 2) * 310, rowY = 470;
    // bar 56: five tinted clear umbrellas seen from above make a five-petal flower, a few sunlit drops left on them;
    // after the flower has been seen on the downbeat they fold shut on five consecutive beats (with the 5→0 count),
    // and each place becomes a round frame
    const umbs = [];
    ROW31.forEach((m, i) => {
      const a = petal31(i);
      const fx = C31.x + Math.cos(a) * C31.d, fy = C31.y + Math.sin(a) * C31.d;
      const tf = T31 + (i + 1) * BEAT; // five consecutive beats
      const fold = E.inOutCubic(seg(t, tf - 0.16, tf - 0.04)); // snaps shut just before the beat
      const toFrame = E.outBack(seg(t, tf - 0.07, tf + 0.2), 1.6); // the frame pops on the beat
      const move = E.inOutCubic(seg(t, b57 + BEAT + 0.08, b57 + BEAT + 0.6));
      let x = lerp(fx, rowX(i), move), y = lerp(fy, rowY, move);
      if (t >= b58) y += Math.sin(Math.floor((beatPos(t) * 2)) * Math.PI + i) * 8 * (Math.floor(beatPos(t) * 2) % 2 ? 1 : -1);
      if (toFrame <= 0) {
        umbs.push(umb31(i, t, fold, fx, fy));
      } else {
        const r = 128 * toFrame * (1 - 0.12 * move);
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = mix(MEM[m].c, '#ffffff', 0.35); ctx.fill(); ctx.clip();
        drawCrop(ctx, m, CROP31[m], x - r, y - r * 0.92, 2 * r, 2 * r);
        ctx.restore();
        circle(ctx, x, y, r + 5, null, '#ffffff', 8);
        circle(ctx, x, y, r + 11, null, MEM[m].c, 4);
        // name plate
        const pa = clamp(toFrame);
        ctx.save(); ctx.globalAlpha = pa;
        tag(ctx, x, y + r + 40, MEM[m].name, { size: 15, bg: '#fff', color: C.ink, align: 'center', fam: F.got, track: 2 });
        ctx.restore();
      }
    });
    // the umbrellas still open (over the frames that already replaced their neighbours), with soft shadows on the sky
    const U = PV.UMB;
    if (umbs.length && U.begin(U.cam(14))) {
      // tinted plastic throws a tinted shadow
      umbs.forEach((it) => U.shadow(ctx, it, { dx: 18, dy: 26, blur: 24, color: rgba(mix(MEM[ROW31[it.idx]].c, '#0E3F80', 0.35), 0.3) }));
      U.render(ctx, umbs, { light: [-9, 9, 16], lightCol: '#FFF6DC' });
      umbs.forEach((it) => drops31(ctx, it, t));
    }
    // centre bud of the flower, gone with the last umbrella
    const bud = 1 - seg(t, b57 + BEAT - 0.2, b57 + BEAT);
    if (bud > 0) { circle(ctx, C31.x, C31.y, 26 * bud, '#fff'); circle(ctx, C31.x, C31.y, 12 * bud, SUN); }
    // line 18: thin hollow line; on bar 59 it rises to cross the five circles; segments inside circles become solid
    const L = LYR[17];
    const rise = E.inOutCubic(seg(t, b59 - 0.1, b59 + 0.4));
    const ly = lerp(860, rowY, rise);
    const lay = layoutH(ctx, L, 960, ly, { size: 108, fam: F.min, weight: 300, align: 'center', track: 18 });
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 300, color: '#ffffff', stroke: '#ffffff', lw: 1.6, hot: SUN });
    if (rise > 0) {
      ctx.save();
      ctx.beginPath();
      ROW31.forEach((m, i) => ctx.arc(rowX(i), rowY, 126, 0, TAU));
      ctx.clip();
      ctx.globalAlpha = 0.62 * rise; rect(ctx, 0, 0, W, H, '#ffffff');
      ctx.globalAlpha = rise;
      drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 300, color: C.ink, fillOverride: () => 1 });
      ctx.restore();
    }
    // slit opening from shot 30
    const op = E.outExpo(seg(t, T31, T31 + 0.32));
    if (op < 1) {
      const hgt = 540 * (1 - op);
      rect(ctx, 0, 0, W, hgt, '#0E1830'); rect(ctx, 0, H - hgt, W, hgt, '#0E1830');
      line(ctx, 0, hgt, W, hgt, '#fff', 2); line(ctx, 0, H - hgt, W, H - hgt, '#fff', 2);
    }
    confetti(ctx, t, T29);
    chorusFlash(ctx, t);
  }
  PV.def({ id: 31, t0: T31, draw: s31, ov: 'white', name: 'CHORUS',
    ovExtra: (ctx, t, col) => {
      const n = 5 - Math.floor(clamp((t - T31) / BEAT + 1e-6, 0, 5));
      const bp = beatPulse(t, 0.25);
      txt(ctx, 'COUNT', W - 68, 112, { size: 11, weight: 800, track: 4, color: col, align: 'right' });
      txt(ctx, String(n), W - 68, 178, { size: 64 + 10 * bp, weight: 900, color: col, align: 'right' });
    } });

  /* ============================== SHOT 32 · fan fold → vortex ============================== */
  const T32 = B(60);
  let lay32 = null;
  function layout32() {
    if (lay32) return lay32;
    const c = mkCanvas(1920, 1080), g = c.getContext('2d');
    skyGrad(g, '#2E9BEA', '#9AD8FF');
    sunRays(g, 960, 540, 0, 16, 0.18);
    circle(g, 960, 540, 250, SUN); circle(g, 960, 540, 250, null, '#fff', 6);
    ROW31.forEach((m, i) => {
      const a = Math.PI + (i / 4) * Math.PI * 0.999;
      const x = 960 + Math.cos(a) * 610, y = 560 + Math.sin(a) * 380 + 330;
      drawFigure(g, m, 960 + (i - 2) * 340, 1000 - Math.abs(i - 2) * 30, m === 'taki' ? 380 : 500, { sticker: true });
    });
    for (let i = 0; i < 14; i++) star4(g, rnd(i, 61) * W, rnd(i, 62) * 520, 12 + rnd(i, 63) * 16, '#fff');
    lay32 = c;
    return c;
  }
  function s32(ctx, t) {
    const img = layout32();
    const b61 = B(61);
    const cx = 960, cy = 540, N = 14, dA = TAU / N;
    // bar 60: fold halfway then spring back with a swing
    let f = 0;
    if (t < b61) {
      const a = seg(t, T32 - 0.06, T32 + 0.36), b = seg(t, T32 + 0.5, b61 - 0.05);
      f = 0.55 * E.outExpo(a) * (1 - E.outElastic(b));
    }
    // bar 61: spin up into a vortex
    const sp = seg(t, b61 - 0.05, B(62));
    const spin = Math.pow(sp, 2.2) * 9;
    // backdrop revealed behind the folding layout: deep sky, rays, giant hollow words
    skyGrad(ctx, '#1667B8', '#2E9BEA');
    sunRays(ctx, cx, cy, -(t - T32) * 0.3, 24, 0.1);
    ctx.save();
    ctx.font = font(900, 230, F.sans); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '10px';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2.5;
    for (let r = 0; r < 3; r++) ctx.strokeText(r % 2 ? 'HITOSHIZUKU' : 'MyGO!!!!!', cx + ((t - T32) * 60 * (r % 2 ? 1 : -1)) % 200, 300 + r * 300);
    ctx.letterSpacing = '0px';
    ctx.restore();
    if (sp <= 0) {
      for (let k = 0; k < N; k++) {
        const a0 = -Math.PI / 2 + k * dA - dA / 2;
        let d = k <= N / 2 ? k : k - N; // signed distance from the top wedge
        const rot = -d * dA * f;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1400, a0, a0 + dA); ctx.closePath(); ctx.clip();
        ctx.drawImage(img, -cx, -cy, W, H);
        if (k % 2) { ctx.fillStyle = `rgba(14,24,48,${0.22 * f / 0.55})`; ctx.fillRect(-cx, -cy, W, H); }
        ctx.restore();
        // white crease highlight
        if (f > 0.01) {
          const ae = a0 + rot;
          ctx.save(); ctx.globalAlpha = Math.min(1, f * 2.5);
          line(ctx, cx, cy, cx + Math.cos(ae) * 1300, cy + Math.sin(ae) * 1300, '#fff', 3);
          ctx.restore();
          const st = (t * 3 + k * 0.37) % 1;
          star4(ctx, cx + Math.cos(ae) * (150 + 700 * st), cy + Math.sin(ae) * (150 + 700 * st), 16 * f * 2, '#fff');
        }
      }
    } else {
      // vortex: concentric annuli twisted more towards the centre
      const R = 1150, rings = 40;
      for (let i = rings - 1; i >= 0; i--) {
        const r1 = (R * (i + 1)) / rings;
        const tw = spin * Math.pow(1 - i / rings, 1.6) + spin * 0.25;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(tw);
        ctx.beginPath(); ctx.arc(0, 0, r1, 0, TAU); ctx.clip();
        const sc = 1 - 0.35 * sp * (1 - i / rings);
        ctx.scale(sc, sc);
        ctx.drawImage(img, -cx, -cy, W, H);
        ctx.restore();
      }
      // swirl lines
      ctx.save(); ctx.translate(cx, cy);
      for (let j = 0; j < 8; j++) {
        ctx.beginPath();
        for (let r = 30; r < 1100; r += 20) { const a = j * (TAU / 8) + spin * 0.6 * (1 - r / 1100) * 2 + r * 0.004; r === 30 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * sp})`; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.restore();
      // the vortex spits out the first card of the next shot
      const sp2 = seg(t, B(62) - 0.22, B(62));
      if (sp2 > 0) {
        const s2 = E.inCubic(sp2);
        // lands exactly where shot 33's first polaroid is on its first frame
        const tg = card33(0, T33);
        ctx.save(); ctx.translate(lerp(cx, tg.x, s2), lerp(cy, tg.y, s2)); ctx.rotate(lerp(4.2, tg.rot, s2)); ctx.scale(0.1 + 0.9 * s2, 0.1 + 0.9 * s2);
        polaroid(ctx, 0, 0, 0, thumbs()[0], String(THUMB_T[0][0]).padStart(2, '0'));
        ctx.restore();
      }
    }
    // line 19 along a crease (rotates with the layout)
    const L = LYR[18];
    ctx.save();
    ctx.translate(cx, cy);
    const ar = -Math.PI / 2 - dA / 2 + 0 * f + spin * 0.4;
    ctx.rotate(ar + Math.PI / 2 - 0.0);
    const lay = layoutH(ctx, L, 0, -330, { size: 78, fam: F.min, weight: 900, align: 'center', track: 6 });
    ctx.restore();
    const items = lay.items.map((it) => {
      const ang = ar + Math.PI / 2;
      const x = cx + Math.cos(ang) * it.x - Math.sin(ang) * it.y, y = cy + Math.sin(ang) * it.x + Math.cos(ang) * it.y;
      return { ...it, x, y, rot: ang };
    });
    ctx.save();
    ctx.shadowColor = 'rgba(14,24,48,0.35)'; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5;
    drawKaraoke(ctx, L, t, items, { fam: F.min, weight: 900, color: '#fff', stroke: '#fff', lw: 2, hot: SUN });
    ctx.restore();
    confetti(ctx, t, T29);
    chorusFlash(ctx, t);
  }
  PV.def({ id: 32, t0: T32, draw: s32, ov: 'white', name: 'CHORUS · FOLD' });

  /* ============================== SHOT 33 · polaroids & giant letters ============================== */
  const T33 = B(62);
  let THUMBS = null;
  const THUMB_T = [[3, 4.6], [6, 12.75], [8, 15.0], [12, 21.9], [15, 28.9], [20, 38.4], [24, 49.9], [29, 60.9]];
  function thumbs() {
    if (THUMBS) return THUMBS;
    THUMBS = THUMB_T.map(([id, tt]) => {
      const c = mkCanvas(560, 315), g = c.getContext('2d');
      g.setTransform(560 / W, 0, 0, 315 / H, 0, 0);
      try { const s = PV.shot(id); s.draw(g, tt, s); } catch (e) { g.fillStyle = C.sky; g.fillRect(0, 0, W, H); }
      return c;
    });
    return THUMBS;
  }
  PV.initShots = () => { thumbs(); layout32(); };
  // polaroid k of shot 33: fast in, slow out (one per beat)
  function card33(k, t) {
    const tb = T33 + k * BEAT - 0.12;
    const age = t - tb;
    if (age < 0 || age > 2.6) return null;
    const fin = E.outExpo(clamp(age / 0.28));
    return { x: lerp(-320, 520 + (k % 3) * 300, fin) + Math.max(0, age - 0.28) * 520, y: 300 + ((k * 211) % 520) - 40, rot: (rnd(k, 3) - 0.5) * 0.5 + age * 0.08 };
  }
  function polaroid(ctx, x, y, rot, img, label) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const w = 400, h = 225;
    rect(ctx, -w / 2 - 16 + 8, -h / 2 - 16 + 10, w + 32, h + 74, 'rgba(14,24,48,0.22)');
    rect(ctx, -w / 2 - 16, -h / 2 - 16, w + 32, h + 74, '#fff');
    if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(14,24,48,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2, w, h);
    txt(ctx, 'SHOT ' + label, -w / 2, h / 2 + 40, { size: 15, weight: 800, track: 4, color: C.ink });
    txt(ctx, '壱雫空', w / 2, h / 2 + 40, { font: font(700, 18, F.min), color: C.ink, align: 'right' });
    ctx.restore();
  }
  function s33(ctx, t) {
    skyGrad(ctx, '#3AA4EE', '#A6DCFB');
    sunRays(ctx, -100, 1180, (t - T33) * 0.1, 22, 0.1);
    const th = thumbs();
    // one polaroid per beat flies across: fast in, slow out
    for (let k = 0; k < 8; k++) {
      const c = card33(k, t);
      if (!c) continue;
      polaroid(ctx, c.x, c.y, c.rot, th[k], String(THUMB_T[k][0]).padStart(2, '0'));
    }
    // giant hollow characters, out of frame, in front of the cards; sung characters fill white
    const L = LYR[19];
    const sp = 5; // 過ぎ去って | しまう瞬間を
    const size = 380, slot = 370;
    // the whole block steps one slot sideways on each bar's downbeat (enters on bar 62, steps again on bar 63)
    const s62 = E.outBack(seg(t, T33 - 0.16, T33 + 0.22), 1.4), s63 = E.outBack(seg(t, B(63) - 0.15, B(63) + 0.23), 1.4);
    const dx = slot * (1 - s62) - slot * s63;
    const row1 = layoutH(ctx, L, 60 + dx, 300, { size, fam: F.min, weight: 900, to: sp, track: -10 });
    const row2 = layoutH(ctx, L, 60 + dx, 760, { size, fam: F.min, weight: 900, from: sp, track: -10 });
    const items = row1.items.concat(row2.items);
    drawKaraoke(ctx, L, t, items, { fam: F.min, weight: 900, color: '#ffffff', stroke: '#ffffff', lw: 4, hot: '#ffffff',
      hotMark: (g, c, s, hot) => { g.fillStyle = rgba(SUN, 0.9 * hot); g.fillRect(-s * 0.5, s * 0.46, s, 14); } });
    txt(ctx, 'MOMENTS PASSING BY', 1860, 1000, { size: 12, weight: 800, track: 6, color: '#fff', align: 'right' });
    confetti(ctx, t, T29);
    chorusFlash(ctx, t);
  }
  PV.polaroid = polaroid; PV.thumbs = thumbs;
  PV.def({ id: 33, t0: T33, draw: s33, ov: 'white', name: 'CHORUS · MOMENTS' });

  /* ============================== SHOT 34 · the emblem (3D) ============================== */
  const T34 = B(64);
  function emblemTex() {
    return cached('emblem34', () => {
      const S = 1024, c = mkCanvas(S, S), g = c.getContext('2d');
      const R = 500;
      g.save(); g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU); g.clip();
      const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#2E9BEA'); gr.addColorStop(1, '#A9E0FF');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      sunRays(g, S / 2, S * 0.42, 0, 20, 0.22, 900);
      circle(g, S / 2, S * 0.4, 210, SUN); circle(g, S / 2, S * 0.4, 210, null, '#fff', 8);
      ROW31.forEach((m, i) => {
        const x = S / 2 + (i - 2) * 168, y = S * 0.86 + Math.abs(i - 2) * -22;
        drawFigure(g, m, x, y, m === 'taki' ? 250 : 330, { sticker: true });
      });
      g.restore();
      // rainbow ring
      const cg = g.createConicGradient(-Math.PI / 2, S / 2, S / 2);
      ['#FF7A8A', '#FFB36B', '#FFE07A', '#86E08A', '#7CC8F2', '#9A8CE6', '#FF7A8A'].forEach((cc, i) => cg.addColorStop(i / 6, cc));
      g.beginPath(); g.arc(S / 2, S / 2, R - 6, 0, TAU); g.lineWidth = 30; g.strokeStyle = cg; g.stroke();
      g.beginPath(); g.arc(S / 2, S / 2, R + 6, 0, TAU); g.lineWidth = 12; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.arc(S / 2, S / 2, R - 24, 0, TAU); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
      ringText(g, 'HITOSHIZUKU ✦ MyGO!!!!! ✦ HITOSHIZUKU ✦ MyGO!!!!! ✦ ', S / 2, S / 2, R - 52, -Math.PI / 2 - 1.2, { size: 22, weight: 800, spacing: 5, color: '#fff' });
      return c;
    });
  }
  function ring5Tex() {
    return cached('ring5', () => {
      const S = 1024, c = mkCanvas(S, S), g = c.getContext('2d');
      PV.ORDER.forEach((m, i) => {
        g.beginPath(); g.arc(S / 2, S / 2, 480, -Math.PI / 2 + (i / 5) * TAU + 0.04, -Math.PI / 2 + ((i + 1) / 5) * TAU - 0.04);
        g.lineWidth = 34; g.strokeStyle = MEM[m].c; g.lineCap = 'round'; g.stroke();
      });
      return c;
    });
  }
  // emblem pose: returns {pos, scale, rotY}
  function emblemPose(t) {
    const grow = E.outBack(seg(t, B(66) - 0.05, B(66) + 0.6), 1.2);
    return { pos: [0, 0, 0], scale: lerp(3.4, 4.4, grow) };
  }
  function cam34(t) {
    const b65 = B(65), b66 = B(66);
    let th, dist = 13.5, hgt = 1.2;
    if (t < b65) { th = -0.9; dist = lerp(22, 15, E.outCubic(seg(t, T34, b65))); }
    else if (t < b66) th = lerp(-0.9, -2.2, E.inOutCubic(seg(t, b65, b66)));
    else th = lerp(-2.2, -TAU, E.outCubic(seg(t, b66 - 0.05, b66 + 0.7)));
    if (t >= b66) { dist = 13.5; hgt = lerp(hgt, 0, E.outCubic(seg(t, b66, b66 + 0.7))); }
    return { eye: [Math.sin(th) * dist, hgt, Math.cos(th) * dist], at: [0, 0.4 * (1 - seg(t, b66, b66 + 0.7)), 0] };
  }
  // boards flowing along arcs into the centre during bar 64
  const FLOW_WORDS = ['ひとしずく', '空', '雨', '傘花', '瞬間', '心', '世界'];
  const FLOW = [];
  for (let i = 0; i < 34; i++) FLOW.push({ a: rnd(i, 1) * TAU, r: 9 + rnd(i, 2) * 10, y: (rnd(i, 3) - 0.5) * 9, d: rnd(i, 4) * 0.5, k: i });
  function render34(t, frozen) {
    const bg = '#2E9BEA';
    const c = frozen ? cam34(B(68) - 0.001) : cam34(t);
    G.begin(bg, { eye: c.eye, at: c.at, fov: 0.85, far: 300 }, { color: '#7CC8F2', range: [16, 60], amount: 0.7 });
    const pose = emblemPose(frozen ? B(68) : t);
    // rays plate behind the emblem
    const tex = G.tex('emblem34', emblemTex());
    G.quad(G.M.trs([0, 0, -0.06], [0, 0, ((frozen ? B(68) : t) - T34) * 0.05], [pose.scale * 2.4, pose.scale * 2.4, 1]), { tex: G.tex('glow3w', glowW()), tint: G.tint('#ffffff', 0.55), blend: true, depthWrite: false, noFog: true });
    G.quad(G.M.trs(pose.pos, [0, 0, 0], [pose.scale * 2, pose.scale * 2, 1]), { tex, at: 0.5, a2c: true, noFog: true });
    G.quad(G.M.trs([0, 0, -0.03], [0, 0, 0], [pose.scale * 2, pose.scale * 2, 1]), { tex, at: 0.5, a2c: true, tint: [0.75, 0.8, 0.9, 1] }); // back side (slightly darker)
    // five-colour ring on bar 67
    const r5 = E.outBack(seg(t, B(67) - 0.15, B(67) + 0.24), 1.6);
    if (r5 > 0 || frozen) G.quad(G.M.trs([0, 0, 0.04], [0, 0, ((frozen ? B(68) : t) - B(67)) * 0.4], [pose.scale * 2.45 * (frozen ? 1 : r5), pose.scale * 2.45 * (frozen ? 1 : r5), 1]), { tex: G.tex('ring5', ring5Tex()), at: 0.3, a2c: true, noFog: true });
    // flowing boards (bar 64) — along arcs into the centre, vanishing into the emblem
    if (!frozen) {
      FLOW.forEach((f) => {
        const u = E.inOutCubic(seg(t, T34 - 0.3 + f.d, B(65) - 0.1 + f.d * 0.3));
        if (u >= 1) return;
        const a = f.a + u * 2.4, r = f.r * (1 - u) + 0.2;
        const p = [Math.cos(a) * r, f.y * (1 - u), Math.sin(a) * r * 0.6 + 2 * (1 - u)];
        const sc = 1 - 0.8 * u;
        if (f.k % 5 === 0) {
          const m = PV.ORDER[(f.k / 5) % 5];
          G.quad(G.M.trs(p, [0, -a, 0], [1.8 * sc, 2.8 * sc, 1]), { tex: G.tex('card3|' + m + true, PV.texCard3(m)), at: 0.5, a2c: true });
        } else if (f.k % 5 === 2) {
          // text boards (words of the song) flowing in with the cards
          const wtxt = FLOW_WORDS[Math.floor(f.k / 5) % FLOW_WORDS.length];
          const cv = PV.texWord3(wtxt);
          const hh = 0.9 * sc;
          G.quad(G.M.trs(p, [0, -a, 0], [(hh * cv.width) / cv.height, hh, 1]), { tex: G.tex('word3|' + wtxt + true, cv), at: 0.5, a2c: true });
        } else {
          const kinds = ['stripes', 'halftone', 'checker', 'grid', 'sky', 'dots', 'rings', 'bars'];
          G.quad(G.M.trs(p, [0, -a, 0.3], [1.5 * sc, 1.1 * sc, 1]), { tex: G.tex('board3|' + kinds[f.k % 8] + (f.k % 3), PV.texBoard3(kinds[f.k % 8], f.k % 3)), at: 0.5 });
        }
      });
    }
    G.flush();
    return c;
  }
  function glowW() {
    return cached('glow3w', () => {
      const c = mkCanvas(256, 256), g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      return c;
    });
  }
  // screen-space circle of the emblem (for the 2D shots that follow)
  function emblemScreen(t, frozen) {
    const pose = emblemPose(frozen ? B(68) : t);
    const c = G.project([0, 0, 0]), e = G.project([0, pose.scale * 0.976, 0]);
    return { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y) };
  }
  function lyric21(ctx, t, emb) {
    const L = LYR[20];
    const grow = E.outBack(seg(t, B(66) - 0.05, B(66) + 0.6), 1.2);
    const y = Math.min(1000, emb.y + emb.r + 90);
    const lay = layoutH(ctx, L, 960, y, { size: 70, fam: F.min, weight: 900, align: 'center', track: 4, spaceW: 0.8 });
    const w = L.words[L.words.length - 1]; // ひとしずくを
    const items = lay.items.map((it) => {
      if (it.i >= w.i0 && it.i < w.i0 + 5) return { ...it, size: it.size * (1 + 0.25 * grow), y: it.y - 6 * grow };
      return it;
    });
    // backing band
    rect(ctx, lay.x0 - 70, y - 62, lay.width + 140, 124, 'rgba(255,255,255,0.92)');
    rect(ctx, lay.x0 - 70, y + 56, lay.width + 140, 6, SUN);
    drawKaraoke(ctx, L, t, items.filter((it) => !(it.i >= w.i0 && it.i < w.i0 + 5)), { fam: F.min, weight: 900, color: C.ink, stroke: C.ink, lw: 1.5, hot: SKY1 });
    drawKaraoke(ctx, L, t, items.filter((it) => it.i >= w.i0 && it.i < w.i0 + 5), { fam: F.min, weight: 900, color: SUN, stroke: C.ink, lw: 2.2,
      fillOverride: (i, c) => fillOf(c, t) });
    // outline the filled yellow glyphs for contrast on white
    ctx.save(); ctx.globalAlpha = 1;
    drawKaraoke(ctx, L, t, items.filter((it) => it.i >= w.i0 && it.i < w.i0 + 5 && fillOf(L.chars[it.i], t) > 0), { fam: F.min, weight: 900, stroke: C.ink, lw: 2.2, fillOverride: () => 0 });
    ctx.restore();
  }
  function s34(ctx, t) {
    if (!G.ok) { skyGrad(ctx); return; }
    render34(t, false);
    ctx.drawImage(G.canvas, 0, 0, W, H);
    const emb = emblemScreen(t, false);
    // sparkles around the emblem rim
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + (t - T34) * 0.6;
      const bp = beatPulse(t + i * 0.04, 0.22, 2);
      star4(ctx, emb.x + Math.cos(a) * emb.r * 1.25, emb.y + Math.sin(a) * emb.r * 1.25, (8 + 12 * bp) * clamp(emb.r / 300, 0.3, 1.5), '#fff');
    }
    lyric21(ctx, t, emb);
    confetti(ctx, t, T29);
    chorusFlash(ctx, t);
  }
  PV.def({ id: 34, t0: T34, draw: s34, ov: 'white', name: 'CHORUS · EMBLEM' });

  /* ============================== SHOT 35 · freeze ============================== */
  const T35 = B(68);
  function s35(ctx, t) {
    if (t >= 79.6 - 0.12) { PV.drawShot(ctx, 36, t); return; } // the emblem starts falling so the hit lands on 79.60
    if (!G.ok) { skyGrad(ctx); return; }
    render34(t, true);
    ctx.drawImage(G.canvas, 0, 0, W, H);
    const emb = emblemScreen(t, true);
    // a very thin glint travelling round the rim
    const a = -Math.PI / 2 + seg(t, T35, 79.6) * TAU * 0.85;
    ctx.save();
    ctx.beginPath(); ctx.arc(emb.x, emb.y, emb.r * 1.005, a - 0.35, a); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    star4(ctx, emb.x + Math.cos(a) * emb.r, emb.y + Math.sin(a) * emb.r, 16, '#fff');
    ctx.restore();
    lyric21(ctx, t, emb);
    confetti(ctx, T35, T29); // frozen confetti
  }
  PV.def({ id: 35, t0: T35, draw: s35, ov: (t) => (t >= 79.6 - 0.12 ? 'ink' : 'white'), name: 'CHORUS · FREEZE' });

  /* ============================== SHOT 36 · last hit & afterglow ============================== */
  const T36 = 79.6;
  const env = (t) => { const d = window.PV_DATA.rms50; const i = Math.floor(t * 50); return i < 0 || i >= d.length ? 0 : d[i] / 255; };
  let emb36 = null;
  function s36(ctx, t) {
    if (!emb36) {
      // emblem position at the freeze (computed once from the frozen 3D pose)
      if (G.ok) { render34(T36, true); emb36 = emblemScreen(T36, true); } else emb36 = { x: 960, y: 470, r: 330 };
    }
    paperSky(ctx);
    // the composition returns to shot 02: same impact point, guide line, hatch, slip and band — in fair-weather colours
    const IX = 780, IY = 700;
    // decay of the rings follows the measured loudness envelope of the track from 80.0 s
    const level = t < 80.0 ? 1 : clamp(Math.pow(env(t) / Math.max(0.05, env(80.0)), 0.8)) * (1 - seg(t, 80.0, 81.35));
    ctx.save();
    ctx.globalAlpha = clamp(level * 1.1);
    for (let i = 22; i >= 0; i--) {
      const d = T36 + i * 0.03;
      const r = (i + 1) * 62 * E.outExpo(seg(t, d, d + 1.3));
      if (r <= 0) continue;
      circle(ctx, IX, IY, r, i % 2 === 0 ? (i % 4 === 0 ? SKY1 : SUN) : '#FFFFFF');
    }
    ctx.restore();
    // shot 02's hatch, sliding into the left half again (sky blue now)
    const hx = lerp(-760, 0, E.outExpo(seg(t, T36 + 0.06, T36 + 0.6)));
    ctx.save();
    ctx.beginPath(); ctx.moveTo(hx + 72, 150); ctx.lineTo(hx + 640, 150); ctx.lineTo(hx + 520, 820); ctx.lineTo(hx + 72, 820); ctx.closePath(); ctx.clip();
    ctx.beginPath();
    for (let k = -900; k < 900; k += 15) { ctx.moveTo(hx + k, 820); ctx.lineTo(hx + k + 680, 140); }
    ctx.strokeStyle = rgba(C.skyD, 0.7); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // guide line from shot 01 and the landing line
    line(ctx, IX, 0, IX, IY, rgba(C.ink, 0.85), 2);
    line(ctx, 0, IY, W, IY, C.ink, 3);
    // the emblem falls from its frozen place onto the line; the hit lands on 79.60 (half a beat early)
    const fall = E.inCubic(seg(t, T36 - 0.12, T36));
    const er = lerp(emb36.r, 150, Math.max(fall, seg(t, T36, T36 + 0.35)));
    const ex = lerp(emb36.x, IX, fall);
    let ey = lerp(emb36.y, IY - 150, fall);
    if (t >= T36) { const b = seg(t, T36, T36 + 0.5); ey = IY - er - 36 * Math.sin(b * Math.PI) * (1 - b); }
    const sq = t >= T36 ? 1 - 0.14 * pulse(t, T36, 0.12) : 1;
    ctx.save(); ctx.translate(ex, ey + er); ctx.scale(1 / sq, sq); ctx.translate(0, -er);
    ctx.beginPath(); ctx.arc(0, 0, er, 0, TAU); ctx.save(); ctx.clip();
    ctx.drawImage(emblemTex(), -er * 1.024, -er * 1.024, er * 2.048, er * 2.048);
    ctx.restore();
    ctx.restore();
    const ip = seg(t, T36, T36 + 0.5);
    if (ip > 0 && ip < 1) circle(ctx, IX, IY, 20 + 200 * E.outExpo(ip), null, rgba(C.ink, 1 - ip), 2);
    circle(ctx, IX, IY, 7, C.ink);
    // the paper slip on the right: where shot 01 held the first line, it now holds the last one
    const L = LYR[20];
    const slip = E.outExpo(seg(t, T36 + 0.08, T36 + 0.5));
    if (slip > 0) {
      const sp = L.chars.findIndex((c) => c.space);
      const size = 50;
      const hgt = 560 * slip;
      rect(ctx, 1396, 140, 210, hgt, C.paper);
      ctx.strokeStyle = rgba(C.ink, 0.8); ctx.lineWidth = 1.5; ctx.strokeRect(1396, 140, 210, hgt);
      ctx.save(); ctx.beginPath(); ctx.rect(1396, 140, 210, hgt); ctx.clip();
      const c1 = layoutV(L, 1550, 176, { size, to: sp, lead: 1.06 });
      const c2 = layoutV(L, 1452, 176, { size, from: sp + 1, lead: 1.06, spaceGap: 0.6 });
      drawKaraoke(ctx, L, t, c1.items.concat(c2.items), { vertical: true, fam: F.min, weight: 600, color: C.ink, stroke: C.ink, lw: 1.2, hot: C.skyD });
      ctx.restore();
      txt(ctx, 'LYRIC 21', 1622, 158, { size: 11, weight: 800, track: 3, color: C.ink });
      line(ctx, 1622, 172, 1622 + 74 * slip, 172, C.ink, 1.2);
      txt(ctx, '1:14.95', 1622, 192, { size: 11, weight: 500, fam: F.mono, color: rgba(C.ink, 0.7) });
    }
    // small title surfacing at the centre-bottom
    const ta = E.outCubic(seg(t, T36 + 0.25, T36 + 0.9));
    ctx.save(); ctx.globalAlpha = ta;
    const ty = 836 + (1 - ta) * 30;
    rect(ctx, 960 - 150, ty - 52, 300, 104, 'rgba(255,255,255,0.9)');
    txt(ctx, '壱雫空', 960, ty, { font: font(900, 46, F.min), color: C.ink, align: 'center', track: 14 });
    ctx.font = font(900, 22, F.sans); ctx.textAlign = 'left'; ctx.letterSpacing = '4px';
    const mw = ctx.measureText('MyGO').width, bw = mw + 5 * 15;
    ctx.fillStyle = C.ink; ctx.fillText('MyGO', 960 - bw / 2, ty + 36);
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.6; ctx.strokeStyle = C.ink;
    PV.ORDER.forEach((m, i) => { const xx = 960 - bw / 2 + mw + i * 15; ctx.strokeText('!', xx, ty + 36); ctx.fillStyle = MEM[m].c; ctx.fillText('!', xx, ty + 36); });
    ctx.letterSpacing = '0px';
    ctx.restore();
    // the marquee band (same place as shot 02) rolls again
    PV.marquee(ctx, 912, 54, C.ink, C.paper, t);
    // confetti fades out with the sound
    confetti(ctx, t, T29, 46, clamp(level + 0.2));
  }
  function paperSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#DFF2FD'); g.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    PV.paperGrid(ctx, 0.6);
  }
  PV.def({ id: 36, t0: T36, draw: s36, ov: 'ink', name: 'FINALE' });
})();
