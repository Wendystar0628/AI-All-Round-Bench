/* Shots 12–22: verse (light, translucent) and the first half of the pre-chorus (deep navy). */
'use strict';
(function () {
  const PV = window.PV;
  const { W, H, B, BEAT, BAR, C, MEM, E, ease, seg, clamp, lerp, rnd, rgba, mix, desat, font, F, TAU,
    rect, circle, line, rrect, grid, stripes, halftone, star4, star5, checker, barcode, tape, tag, txt, ringText, ringTextLen,
    ruler, glow, veil, drawFigure, drawCrop, silhouette, mono, rim, IMG, drawKaraoke, layoutH, layoutV,
    antic, pulse, beatPulse, beatPos, fillOf, hotOf } = PV;
  const LYR = PV.LY;

  // grow-from-a-point helper: clip circle growing from the centre
  function growFromPoint(ctx, t, t0, dur = 0.3, cx = 960, cy = 540) {
    const g = E.outExpo(seg(t, t0, t0 + dur));
    ctx.beginPath(); ctx.arc(cx, cy, 6 + 1250 * g, 0, TAU); ctx.clip();
    return g;
  }
  // small caption used across the verse: ■ LYRIC 04 ──── 0:18.86
  function caption(ctx, x, y, label, time, col, a = 1, w = 300) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    rect(ctx, x, y - 10, 10, 10, C.sky);
    // white captions get a dark halo, so they stay readable where they cross something white (e.g. the zebra stripes)
    if (col === '#fff') { const m = ctx.getTransform(); ctx.shadowColor = rgba(C.navy, 0.95); ctx.shadowBlur = 5 * Math.hypot(m.a, m.b); }
    for (let k = 0; k < (col === '#fff' ? 2 : 1); k++) {
      txt(ctx, label, x + 20, y, { size: 12, weight: 800, track: 4, color: col });
      if (time) txt(ctx, time, x + w, y + 20, { size: 11, fam: F.mono, weight: 500, color: col, align: 'right' });
    }
    ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0;
    line(ctx, x + 128, y - 5, x + 128 + (w - 128) * a, y - 5, rgba(col === '#fff' ? '#ffffff' : C.ink, 0.45), 1);
    ctx.restore();
  }
  PV.caption = caption;

  /* ============================== SHOT 12 · acrylic cards ============================== */
  const T12 = B(17);
  const ORD12 = ['rana', 'anon', 'tomori', 'soyo', 'taki'];
  function acrylic(ctx, m, x, y, w, h, o = {}) {
    const col = MEM[m].c;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    // body
    rrect(ctx, -w / 2, -h / 2, w, h, 18);
    ctx.fillStyle = rgba(desat(col, 0.55, '#F2F6F8'), 0.55); ctx.fill();
    ctx.save(); ctx.clip();
    // tint wash + figure
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, rgba(col, 0.3)); g.addColorStop(1, rgba('#ffffff', 0.1));
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
    const crop = o.crop || [100, -10, 960, 860];
    if (o.color) drawCrop(ctx, m, crop, -w / 2, -h / 2 + h * 0.08, w, h * 0.92, { sticker: true });
    else {
      ctx.globalAlpha *= 0.85;
      drawCrop(ctx, m, crop, -w / 2, -h / 2 + h * 0.08, w, h * 0.92, { canvas: silhouette(m, desat(col, 0.3, '#B9C7D3')) });
      ctx.globalAlpha /= 0.85;
    }
    // sheen
    ctx.globalCompositeOperation = 'screen';
    const sg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    sg.addColorStop(0, 'rgba(255,255,255,0.0)'); sg.addColorStop(0.42, 'rgba(255,255,255,0.0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.45)'); sg.addColorStop(0.6, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = sg; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    rrect(ctx, -w / 2, -h / 2, w, h, 18);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.5; ctx.stroke();
    rrect(ctx, -w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 13);
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1; ctx.stroke();
    // the colour card gets a white name band so its label stays readable over the figure
    if (o.color) {
      ctx.save(); rrect(ctx, -w / 2, -h / 2, w, h, 18); ctx.clip();
      rect(ctx, -w / 2, h / 2 - 38, w, 38, 'rgba(255,255,255,0.92)');
      ctx.restore();
    }
    // number + dot on top
    txt(ctx, MEM[m].no, -w / 2 + 18, -h / 2 + 34, { size: 15, weight: 800, track: 2, color: C.ink });
    circle(ctx, w / 2 - 22, -h / 2 + 28, 7, col, C.ink, 1.5);
    txt(ctx, MEM[m].rom, 0, h / 2 - 20, { size: 11, weight: 800, track: 6, color: rgba(C.ink, 0.8), align: 'center' });
    ctx.restore();
  }
  PV.acrylic = acrylic;
  function s12(ctx, t) {
    // outside the growing circle: the end state of shot 11 (paper + the point it collapsed into)
    rect(ctx, 0, 0, W, H, '#FBFBF9');
    circle(ctx, 960, 540, 6, C.ink);
    ctx.save();
    growFromPoint(ctx, t, T12 - 0.01, 0.32);
    // background: pale sky gradient, bokeh, fine diagonal lines
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#CFE7F4'); g.addColorStop(1, '#F3F8FB');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const x = (rnd(i, 1) * W + (t - T12) * (12 + rnd(i, 2) * 18)) % (W + 400) - 200;
      glow(ctx, x, 120 + rnd(i, 3) * 820, 120 + rnd(i, 4) * 200, i % 3 ? '#FFFFFF' : C.sky, 0.55);
    }
    stripes(ctx, 0, 0, W, H, 0.6, 26, [1.2], 'rgba(255,255,255,0.55)', (t - T12) * 18);
    // bottom ruler
    ruler(ctx, 120, 1000, 1800, 1000, 84, rgba(C.ink, 0.5), { small: 6, big: 13, major: 6, side: -1 });
    // cards
    const b18 = B(18), b19 = B(19);
    const cw = 232, ch = 420, gap = 34, step = cw + gap, cy0 = 452;
    const shift = E.outExpo(seg(t, b18 - 0.02, b18 + 0.42)) + (t < b18 ? -0.05 * E.inOutQuad(seg(t, b18 - 0.14, b18)) : 0);
    const big = E.outExpo(seg(t, b19 - 0.02, b19 + 0.48));
    const bigPre = t < b19 ? 0.04 * E.inOutQuad(seg(t, b19 - 0.12, b19)) : 0;
    const order = [];
    ORD12.forEach((m, i) => {
      const drop = seg(t, T12 + i * (BEAT / 2) - 0.16, T12 + i * (BEAT / 2) + 0.2); // lands on its 8th note
      let y = lerp(-420, cy0, E.outBack(drop, 1.25));
      let slot = i - shift;
      if (slot < -0.5) slot += 5; // wrap: leftmost leaves, re-enters from the right
      let x = 960 + (slot - 2) * step;
      // wrapping card: slide out left then in from the right
      if (i === 0 && shift > 0 && shift < 1) {
        const u = shift;
        x = u < 0.5 ? lerp(960 - 2 * step, -cw, u * 2) : lerp(W + cw, 960 + 2 * step, (u - 0.5) * 2);
      }
      let w = cw, h = ch, a = 1, z = 0;
      if (m === 'tomori') {
        x = lerp(x, 960, big); y = lerp(y, 455, big);
        w = lerp(cw, 410, big) * (1 - bigPre); h = lerp(ch, 742, big) * (1 - bigPre); z = 10;
      } else {
        a = 1 - 0.62 * big;
        const sc = 1 - 0.14 * big;
        w *= sc; h *= sc; y = lerp(y, cy0 - 20, big);
        x = lerp(x, 960 + (x - 960) * 1.18, big);
      }
      if (drop > 0) order.push({ m, x, y, w, h, a, z });
    });
    order.sort((p, q) => p.z - q.z).forEach((c) => acrylic(ctx, c.m, c.x, c.y, c.w, c.h, { alpha: c.a, color: c.m === 'tomori', crop: c.m === 'taki' ? [600, -10, 1200, 700] : null }));
    // lyric 04, small, below the cards
    const L = LYR[3];
    const ly = lerp(778, 900, big);
    const lay = layoutH(ctx, L, 960, ly, { size: 40, fam: F.min, weight: 600, align: 'center', track: 6, spaceW: 1.2 });
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 600, color: C.ink, stroke: rgba(C.ink, 0.7), lw: 1, hot: C.skyD,
      appear: (i) => E.outCubic(seg(t, T12 + 0.1 + i * 0.02, T12 + 0.4 + i * 0.02)) });
    caption(ctx, 660, ly - 64, 'LYRIC 04', '0:18.86', C.ink, E.outCubic(seg(t, T12 + 0.2, T12 + 0.5)), 600);
    ctx.restore();
  }
  PV.def({ id: 12, t0: T12, draw: s12, ov: 'ink', name: 'VERSE' });

  /* ============================== SHOT 13 · frosted panels ============================== */
  const T13 = B(20);
  const HARM_COL = { rana: '#3FAE4A', anon: '#E8506E', soyo: '#D99A1E', taki: '#5A58A0' };
  PV.HARM_COL = HARM_COL;
  const SLOTS13 = [[540, 420, -0.05], [835, 610, 0.03], [1110, 430, -0.02], [1385, 615, 0.04]];
  const PERMS = [[0, 1, 2, 3], [2, 0, 3, 1], [3, 2, 1, 0], [1, 3, 0, 2], [0, 1, 2, 3]];
  let bgLow = null;
  function bg13(g, t) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#7DBFE2'); gr.addColorStop(1, '#D9EEF8');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const x = (rnd(i, 7) * W + (t - T13) * (10 + rnd(i, 8) * 30)) % (W + 300) - 150;
      const y = rnd(i, 9) * H, r = 30 + rnd(i, 10) * 120;
      glow(g, x, y, r, i % 4 === 0 ? C.sky : '#ffffff', 0.35 + rnd(i, 11) * 0.4);
    }
  }
  function s13(ctx, t) {
    bg13(ctx, t);
    // crisp bokeh rings
    for (let i = 0; i < 14; i++) {
      const x = (rnd(i, 21) * W + (t - T13) * 22) % (W + 200) - 100, y = rnd(i, 22) * H;
      circle(ctx, x, y, 8 + rnd(i, 23) * 26, rgba('#ffffff', 0.25 + 0.2 * rnd(i, 24)));
    }
    if (!bgLow) bgLow = PV.mkCanvas(384, 216);
    const lg = bgLow.getContext('2d');
    lg.setTransform(0.2, 0, 0, 0.2, 0, 0); bg13(lg, t);
    // shuffle on every beat of bar 21
    const b21 = B(21);
    let k = Math.floor(clamp((t - b21) / BEAT + 1, 0, 4));
    if (t < b21) k = 0;
    const tb = b21 + (k - 1) * BEAT;
    const u = k === 0 ? 1 : E.outExpo(seg(t, tb - 0.02, tb + 0.3));
    const from = PERMS[Math.max(0, k - 1)], to = PERMS[k];
    const L = LYR[4];
    const pieces = [[0, 2], [2, 3], [3, 5], [5, 6]];
    const order = [0, 1, 2, 3].map((p) => {
      const a = SLOTS13[from[p]], b = SLOTS13[to[p]];
      return { p, x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), r: lerp(a[2], b[2], u), lift: Math.sin(u * Math.PI) * 30 };
    });
    order.sort((a, b) => a.y - b.y);
    const ent = E.outExpo(seg(t, T13 - 0.04, T13 + 0.4));
    for (const o of order) {
      const m = PV.HARM[o.p];
      const pw = 330, ph = 460;
      const lit = seg(t, L.t + o.p * BEAT / 2 - 0.02, L.t + o.p * BEAT / 2 + 0.12);
      ctx.save();
      ctx.translate(o.x + (1 - ent) * (o.p % 2 ? 900 : -900), o.y - o.lift);
      ctx.rotate(o.r);
      // flat shadow
      rrect(ctx, -pw / 2 + 12, -ph / 2 + 14, pw, ph, 22); ctx.fillStyle = 'rgba(40,80,120,0.12)'; ctx.fill();
      // frosted: blurred low-res background inside the panel
      ctx.save();
      rrect(ctx, -pw / 2, -ph / 2, pw, ph, 22); ctx.clip();
      ctx.rotate(-o.r); ctx.translate(-(o.x), -(o.y - o.lift));
      ctx.drawImage(bgLow, 0, 0, W, H);
      ctx.restore();
      ctx.save();
      rrect(ctx, -pw / 2, -ph / 2, pw, ph, 22); ctx.clip();
      // member silhouette behind the frost, in its colour
      ctx.save();
      ctx.filter = 'blur(3px)';
      ctx.globalAlpha = 0.62 + 0.38 * lit;
      drawCrop(ctx, m, m === 'taki' ? [560, 0, 1260, 760] : [80, -20, 980, 980], -pw / 2, -ph / 2 + 34, pw, ph - 150, { canvas: silhouette(m, MEM[m].c) });
      ctx.restore();
      ctx.fillStyle = `rgba(255,255,255,${0.34 - 0.1 * lit})`; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      // clear label band for the harmony text
      ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fillRect(-pw / 2, ph / 2 - 120, pw, 120);
      line(ctx, -pw / 2 + 18, ph / 2 - 120, pw / 2 - 18, ph / 2 - 120, rgba(MEM[m].c, 0.9), 2);
      // frost grain
      halftone(ctx, -pw / 2, -ph / 2, pw, ph - 120, 9, 1.2, 'rgba(255,255,255,0.5)', () => 1);
      ctx.restore();
      rrect(ctx, -pw / 2, -ph / 2, pw, ph, 22);
      ctx.strokeStyle = `rgba(255,255,255,${0.75 + 0.25 * lit})`; ctx.lineWidth = 2 + 2 * lit; ctx.stroke();
      if (lit > 0) { rrect(ctx, -pw / 2 - 6, -ph / 2 - 6, pw + 12, ph + 12, 26); ctx.strokeStyle = rgba(MEM[m].c, 0.9 * lit); ctx.lineWidth = 3; ctx.stroke(); }
      // corner initial tag
      tag(ctx, -pw / 2 + 16, -ph / 2 + 26, MEM[m].ini, { size: 14, bg: MEM[m].c, color: C.ink, padx: 11 });
      txt(ctx, MEM[m].rom, pw / 2 - 16, -ph / 2 + 31, { size: 11, weight: 800, track: 4, color: rgba(C.ink, 0.7), align: 'right' });
      // harmony piece: narrow, wide-tracked sans; blurred behind the frost until sung
      const [i0, i1] = pieces[o.p];
      const its = [];
      for (let i = i0; i < i1; i++) its.push({ i, x: (i - i0 - (i1 - i0 - 1) / 2) * 62, y: ph / 2 - 60, size: 50 });
      const sung = fillOf(L.chars[i0], t);
      if (sung < 1) {
        ctx.save(); ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.75;
        drawKaraoke(ctx, L, t, its, { fam: F.got, weight: 700, color: HARM_COL[m], scaleX: 0.78, fillOverride: () => 1 });
        ctx.restore();
      }
      if (sung > 0) drawKaraoke(ctx, L, t, its, { fam: F.got, weight: 700, color: HARM_COL[m], scaleX: 0.78 });
      ctx.restore();
    }
    // thin light rays across the panels
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const off = ((t - T13) * 60 + i * 380) % 2200 - 400;
      ctx.globalAlpha = 0.55;
      line(ctx, off, -20, off + 700, H + 20, '#fff', i % 2 ? 1.2 : 2.4);
    }
    ctx.restore();
    txt(ctx, '( HARMONY )', 960, 900, { size: 13, weight: 800, track: 10, color: rgba(C.ink, 0.7 * ent), align: 'center' });
  }
  PV.def({ id: 13, t0: T13, draw: s13, ov: 'ink', name: 'VERSE · HARMONY' });

  /* ============================== SHOT 14 · umbrella arc ============================== */
  const T14 = B(22);
  function s14(ctx, t) {
    rect(ctx, 0, 0, W, H, '#FAFBFA');
    // stripes: horizontal, switch to vertical on bar 23 beat 1
    const b23 = B(23);
    const sw = E.inOutExpo(seg(t, b23 - 0.08, b23 + 0.18));
    const BANDS = [[40, 18, C.sky], [92, 6, C.grayL], [128, 46, rgba(C.sky, 0.55)], [226, 10, C.grayL], [262, 4, C.sky], [700, 30, C.grayL], [760, 8, C.sky], [800, 64, rgba(C.sky, 0.45)], [900, 12, C.grayL], [940, 24, C.sky], [1000, 6, C.grayL]];
    ctx.save();
    if (sw < 1) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H * (1 - sw)); ctx.clip();
      BANDS.forEach(([y, h, c], i) => rect(ctx, ((t - T14) * (i % 2 ? 30 : -30)) % 1, y, W, h, c));
      ctx.restore();
    }
    if (sw > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, H * (1 - sw), W, H * sw); ctx.clip();
      BANDS.forEach(([x, w, c]) => rect(ctx, x * 1.78, 0, w * 1.2, H, c));
      ctx.restore();
    }
    ctx.restore();
    // the big clear umbrella, seen from below: it springs open on the downbeat and turns slowly;
    // rain lands on top (seen through the plastic), slides down to the rib ends, gathers there and drips
    const U = PV.UMB, it = umb14(t);
    if (U.begin(U.cam(CAM14))) {
      const R = U.rain(it, t, RAIN14);
      U.drawBeads(ctx, R.back, 'light');
      U.render(ctx, [it], { light: [-9, -3, 9] });
      U.drawBeads(ctx, R.front, 'light');
    }
    // foreground graphic rain: rows of short dashes released on every 8th note
    const e0 = Math.floor(beatPos(T14) * 2);
    const ecur = Math.floor(beatPos(t) * 2);
    ctx.fillStyle = C.ink;
    for (let e = Math.max(e0 - 8, ecur - 9); e <= ecur; e++) {
      const te = PV.T0 + (e * BEAT) / 2;
      const y = (t - te) * 780 - 60;
      if (y > H + 40 || y < -60) continue;
      for (let j = 0; j < 9; j++) {
        if (rnd(e, j, 5) < 0.35) continue;
        const x = 70 + j * 215 + rnd(e, j) * 120;
        ctx.fillRect(x, y, 3, 26 + rnd(e, j, 3) * 18);
      }
    }
    // lyric 06 along the hem: hollow, chars glide along the curve into place, fill as sung
    const L = LYR[5];
    const arc = hemArc14(it);
    const n = L.chars.length, gap = 94;
    const items = L.chars.map((c, i) => {
      // slide in along the hem from the right: earlier characters settle first, so they never overlap
      const u = E.outExpo(seg(t, T14 - 0.1 + i * 0.05, T14 + 0.55 + i * 0.05));
      const s = arc.mid + (i - (n - 1) / 2) * gap + 900 * (1 - u);
      const p = arc.at(s);
      return { i, x: p.x, y: p.y, size: 70, rot: p.a, alpha: clamp(u * 3) };
    });
    drawKaraoke(ctx, L, t, items, { fam: F.min, weight: 700, color: C.ink, stroke: C.ink, lw: 1.6, hot: C.skyD });
    caption(ctx, 96, 910, 'LYRIC 06', '0:24.54', C.ink, E.outCubic(seg(t, T14, T14 + 0.4)), 330);
    txt(ctx, 'UMBRELLA / CLEAR VINYL / RIBS 8', W - 96, 910, { size: 11, weight: 800, track: 4, color: rgba(C.ink, 0.75), align: 'right' });
  }
  const CAM14 = 8.5;
  const spin14 = (t) => 0.25 + (t - T14) * 0.32;
  const RAIN14 = { seed: 14, n: 58, rmin: 0.011, rmax: 0.028, rcap: 14, sliders: [[2.05, 0.35], [2.6, 1.55], [2.35, 0.2]], tips: true, face: -Math.PI / 2, spread: 0.9, spinAt: spin14 };
  function umb14(t) {
    const op = seg(t, T14 - 0.06, T14 + 0.5);
    // springs open: overshoots (flatter canopy) and settles
    const open = op >= 1 ? 1 : lerp(0.42, 1, E.outCubic(Math.min(1, op * 1.6))) + 0.1 * Math.sin(Math.PI * clamp((op - 0.32) / 0.68)) * (1 - op);
    // a big umbrella above the viewer, tipped away so we look up into it; thin metal so the ribs stay graphic
    return {
      x: 960, y: 120, z: -4, scale: 9.5, tilt: -0.55, roll: Math.sin((t - T14) * 0.9) * 0.035,
      spin: spin14(t), open, tint: '#9CD3F1', tintAmt: 0.2, rib: '#22345A', handle: C.ink, seam: '#FFFFFF', seamA: 0.45,
      refr: 0.008, th: 0.5, fres: 0.16, sheen: 0.3,
    };
  }
  // the hem as a screen curve (lower half), parameterised by arc length; text sits just outside it
  function hemArc14(it) {
    const U = PV.UMB, N = 720, raw = [];
    for (let j = 0; j < N; j++) { const p = U.hemPoint(it, (j / N) * TAU, 0); raw.push([p.x, p.y]); }
    // push the curve outwards on screen by a fixed distance (away from the centre of the outline)
    const cxm = raw.reduce((s, p) => s + p[0], 0) / N, cym = raw.reduce((s, p) => s + p[1], 0) / N, OFF = 64;
    const pts = raw.map((p, j) => {
      const a = raw[(j + N - 1) % N], b = raw[(j + 1) % N];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (nx * (p[0] - cxm) + ny * (p[1] - cym) < 0) { nx = -nx; ny = -ny; }
      return [p[0] + nx * OFF, p[1] + ny * OFF];
    });
    pts.push(pts[0]);
    // lowest point on screen, then walk both ways while the curve keeps facing down
    let lo = 0; pts.forEach((p, j) => { if (p[1] > pts[lo][1]) lo = j; });
    const seq = [];
    for (let d = -N / 2; d <= N / 2; d++) seq.push(pts[(((lo + d) % N) + N) % N]);
    if (seq[0][0] > seq[seq.length - 1][0]) seq.reverse(); // left → right
    const acc = [0];
    for (let j = 1; j < seq.length; j++) acc.push(acc[j - 1] + Math.hypot(seq[j][0] - seq[j - 1][0], seq[j][1] - seq[j - 1][1]));
    // centre the line on the shaft, so the shaft passes between two characters
    const sx = U.axis(it, -0.42).x;
    let mid = acc[N / 2], best = 1e9;
    for (let j = 1; j < seq.length; j++) {
      if ((seq[j - 1][0] - sx) * (seq[j][0] - sx) <= 0 && Math.abs(j - N / 2) < best) {
        const f = (sx - seq[j - 1][0]) / ((seq[j][0] - seq[j - 1][0]) || 1);
        mid = lerp(acc[j - 1], acc[j], f); best = Math.abs(j - N / 2);
      }
    }
    const at = (s) => {
      s = clamp(s, 0, acc[acc.length - 1]);
      let j = 1; while (j < acc.length - 1 && acc[j] < s) j++;
      const f = (s - acc[j - 1]) / Math.max(1e-6, acc[j] - acc[j - 1]);
      const a = seq[j - 1], b = seq[j];
      return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    };
    return { at, mid, len: acc[acc.length - 1] };
  }
  PV.def({ id: 14, t0: T14, draw: s14, ov: 'ink', name: 'VERSE' });

  /* ============================== SHOT 15 · target rings ============================== */
  const T15 = B(24);
  const RR = [118, 192, 270, 352, 436];
  const RCOL = ['#3E93CB', '#BFE1F2', '#77BBDD', '#E4F2F9'];
  function s15(ctx, t) {
    rect(ctx, 0, 0, W, H, '#F4F9FC');
    const cx = 960, cy = 540;
    const b25 = B(25);
    // faint outer rings to the frame edges
    for (let r = 480; r < 1200; r += 44) circle(ctx, cx, cy, r, null, rgba(C.sky, 0.25), 1);
    // rings appear one per beat (bar 24), inner → outer
    for (let k = 3; k >= 0; k--) {
      const tb = T15 + k * BEAT;
      const u = E.outBack(seg(t, tb - 0.14, tb + 0.19), 1.4); // ring reaches its size on the beat
      if (u <= 0) continue;
      const r1 = RR[k + 1] * (0.6 + 0.4 * u);
      circle(ctx, cx, cy, r1, RCOL[k]);
      // per-ring decorations rotating alternately in bar 25
      const dir = k % 2 ? 1 : -1;
      const ang = dir * Math.max(0, t - b25) * 0.45 + k * 0.2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.beginPath();
      const r0 = RR[k] + 2, rr = RR[k + 1] - 2;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU, big = i % 6 === 0;
        ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a) * (rr - (big ? 14 : 6)), Math.sin(a) * (rr - (big ? 14 : 6)));
      }
      ctx.strokeStyle = k % 2 ? rgba(C.ink, 0.5) : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.font = font(700, 11, F.mono); ctx.fillStyle = k % 2 ? C.ink : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        ctx.save(); ctx.translate(Math.cos(a) * (r0 + rr) / 2, Math.sin(a) * (r0 + rr) / 2); ctx.rotate(a + Math.PI / 2);
        ctx.fillText('R' + (k + 1) + '·' + String(i * 90).padStart(3, '0'), 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
    // radial lines between the rings
    ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; ctx.moveTo(Math.cos(a) * RR[0], Math.sin(a) * RR[0]); ctx.lineTo(Math.cos(a) * RR[4] * ease(t, T15, T15 + 1.2, E.outCubic), Math.sin(a) * RR[4] * ease(t, T15, T15 + 1.2, E.outCubic)); }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // centre: a patch of clear sky
    const cu = E.outBack(seg(t, T15 - 0.08, T15 + 0.25), 1.6);
    if (cu > 0) {
      const g = ctx.createLinearGradient(cx, cy - RR[0], cx, cy + RR[0]);
      g.addColorStop(0, '#3D9FE6'); g.addColorStop(0.7, '#9FD3F1'); g.addColorStop(1, '#E9F6FC');
      circle(ctx, cx, cy, RR[0] * cu, g);
      // a small flat cloud
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, RR[0] * cu, 0, TAU); ctx.clip();
      ctx.fillStyle = '#fff';
      const ox = cx - 30 + Math.sin(t * 0.8) * 16;
      ctx.beginPath(); rrect(ctx, ox - 56, cy + 22, 112, 30, 15); ctx.fill();
      circle(ctx, ox - 10, cy + 20, 24, '#fff'); circle(ctx, ox + 22, cy + 26, 17, '#fff');
      ctx.restore();
      circle(ctx, cx, cy, RR[0] * cu, null, C.ink, 2.5);
    }
    // lyric 07 as a ring on the outermost circle, turning with it
    const L = LYR[6];
    const RT = 466;
    const n = L.chars.length;
    const spin = (t - T15) * 0.16 + Math.max(0, t - b25) * 0.2;
    // the line closes the outermost circle: written twice around it, turning with the ring
    const step = TAU / (2 * n);
    const items = [];
    for (let r = 0; r < 2; r++) L.chars.forEach((c, i) => {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * step + r * Math.PI + spin;
      const u = E.outCubic(seg(t, T15 + 0.05 + i * 0.03, T15 + 0.35 + i * 0.03));
      items.push({ i, x: cx + Math.cos(a) * RT, y: cy + Math.sin(a) * RT, size: 50, rot: a + Math.PI / 2, alpha: u });
    });
    drawKaraoke(ctx, L, t, items, { fam: F.min, weight: 700, color: C.ink, stroke: C.ink, lw: 1.4, hot: C.skyD });
    circle(ctx, cx, cy, RR[4] + 6, null, C.ink, 1.5);
    caption(ctx, 96, 930, 'LYRIC 07', '0:27.62', C.ink, E.outCubic(seg(t, T15, T15 + 0.4)), 330);
    txt(ctx, 'VINYL / SKY / TARGET', W - 96, 930, { size: 11, weight: 800, track: 4, color: rgba(C.ink, 0.75), align: 'right' });
  }
  PV.def({ id: 15, t0: T15, draw: s15, ov: 'ink', name: 'VERSE' });

  /* ============================== SHOT 16 · player ============================== */
  const T16 = B(26);
  const STAFF_Y = [770, 800, 830, 860, 890];
  function s16(ctx, t) {
    rect(ctx, 0, 0, W, H, '#FAFAF7');
    const end = B(27, 4);
    const col = E.inExpo(seg(t, end, B(28) - 0.015));
    const sc = Math.max(0.0001, 1 - col);
    ctx.save();
    ctx.translate(960, 540); ctx.scale(sc, sc); ctx.translate(-960, -540);
    const ent = E.outExpo(seg(t, T16 - 0.04, T16 + 0.4));
    // checker bands framing the staff
    const scroll = (t - T16) * 90;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W * ent, H); ctx.clip();
    for (const y of [718, 926]) {
      ctx.save(); ctx.translate(scroll % 36 - 36, 0); checker(ctx, 0, y, W + 72, 36, 18, '#16181d', '#fff'); ctx.restore();
    }
    // staff lines (scrolling left → right: bar lines move)
    STAFF_Y.forEach((y) => line(ctx, 0, y, W, y, '#7B828C', 2));
    for (let x = (scroll % 480) - 480; x < W; x += 480) line(ctx, x, STAFF_Y[0], x, STAFF_Y[4], '#7B828C', 2);
    txt(ctx, '𝄞', 40 + (scroll % 480), 900, { font: font(400, 150, 'Segoe UI Symbol, serif'), color: rgba('#16181d', 0.85) });
    ctx.restore();
    // notes: dots fall onto the staff on every 8th note; lyric chars land on them
    const L = LYR[7];
    const xs = L.chars.map((c, i) => 520 + i * 98);
    const pos = [2, 3, 1, 4, 2, 0, 3, 1, 2, 4];
    L.chars.forEach((c, i) => {
      const x = xs[i], ny = STAFF_Y[0] - 15 + pos[i] * 15 + 15;
      const tl = c.t;
      const u = seg(t, tl - 0.16, tl);
      if (u <= 0) return;
      const y = lerp(560, ny, E.inQuad(u));
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x - 26, y, 12, 9, -0.35, 0, TAU); ctx.fillStyle = C.ink; ctx.fill();
      if (u >= 1) { line(ctx, x - 15, y - 2, x - 15, y - 62, C.ink, 2.5); }
      ctx.restore();
    });
    // eighth-note dots falling across the staff (decorative)
    const ec = Math.floor(beatPos(t) * 2);
    for (let e = ec - 6; e <= ec; e++) {
      const te = PV.T0 + (e * BEAT) / 2;
      const u = seg(t, te, te + 0.22);
      if (u <= 0 || t < T16) continue;
      const x = 120 + (rnd(e, 4) * 0.25 + (e % 4) * 0.06) * W * 0.3 + (e % 2) * 1260;
      const y = lerp(600, STAFF_Y[Math.floor(rnd(e, 5) * 5)], E.outBounce(u));
      circle(ctx, x, y, 8, e % 2 ? C.green : C.coral);
    }
    const items = L.chars.map((c, i) => {
      const u = seg(t, c.t - 0.05, c.t + 0.2);
      const y = 690 - 70 * (1 - E.outBack(u, 2.2));
      return { i, x: xs[i], y, size: 44, alpha: clamp(u * 4) };
    });
    // hollow placeholders
    drawKaraoke(ctx, L, t, L.chars.map((c, i) => ({ i, x: xs[i], y: 690, size: 44 })), { fam: F.min, weight: 700, color: C.ink, stroke: rgba(C.ink, 0.35), lw: 1.2, fillOverride: () => 0, appear: () => ent });
    drawKaraoke(ctx, L, t, items, { fam: F.min, weight: 700, color: C.ink, hot: C.skyD });
    // player card
    const pk = E.outBack(seg(t, T16 - 0.15, T16 + 0.25), 1.3);
    const px = 960 - 330, py = 160 + (1 - pk) * 500, pw = 660, ph = 420;
    rrect(ctx, px + 12, py + 14, pw, ph, 30); ctx.fillStyle = 'rgba(27,42,71,0.10)'; ctx.fill();
    rrect(ctx, px, py, pw, ph, 30); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.stroke();
    PV.coverArt(ctx, 99, px + 34, py + 34, 170, { noUmb: true });
    txt(ctx, 'NOW PLAYING', px + 232, py + 64, { size: 12, weight: 800, track: 5, color: C.skyD });
    txt(ctx, '壱雫空', px + 230, py + 126, { font: font(800, 54, F.min), color: C.ink });
    txt(ctx, 'MyGO!!!!!', px + 232, py + 172, { size: 22, weight: 900, track: 1, color: C.ink });
    // waveform bouncing on beats
    const wx = px + 34, wy = py + 262, nb = 48;
    for (let i = 0; i < nb; i++) {
      const env = 0.3 + 0.7 * Math.abs(Math.sin(i * 0.7 + 1.3) * Math.cos(i * 0.23));
      const h = 6 + 46 * env * (0.45 + 0.55 * beatPulse(t - i * 0.004, 0.22)) * (0.7 + 0.3 * Math.sin(t * 9 + i));
      const played = i / nb < t / PV.DUR;
      rrect(ctx, wx + i * 12.2, wy - h / 2, 7, h, 3.5); ctx.fillStyle = played ? C.sky : '#D5DAE1'; ctx.fill();
    }
    // progress bar synced with the real song position
    const pr = t / PV.DUR;
    rrect(ctx, px + 34, py + 314, pw - 68, 6, 3); ctx.fillStyle = '#E3E6EA'; ctx.fill();
    rrect(ctx, px + 34, py + 314, (pw - 68) * pr, 6, 3); ctx.fillStyle = C.ink; ctx.fill();
    circle(ctx, px + 34 + (pw - 68) * pr, py + 317, 10, '#fff', C.ink, 2.5);
    const fm = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    txt(ctx, fm(t), px + 34, py + 346, { size: 13, fam: F.mono, weight: 600, color: C.ink });
    txt(ctx, fm(PV.DUR), px + pw - 34, py + 346, { size: 13, fam: F.mono, weight: 600, color: C.ink, align: 'right' });
    // transport
    const bx = px + pw / 2, by = py + 382;
    circle(ctx, bx, by, 28, C.ink);
    rect(ctx, bx - 9, by - 11, 6, 22, '#fff'); rect(ctx, bx + 3, by - 11, 6, 22, '#fff');
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(bx + s * 90, by); ctx.scale(s, 1);
      ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(6, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fillStyle = C.ink; ctx.fill();
      rect(ctx, 7, -10, 3.5, 20, C.ink);
      ctx.restore();
    }
    txt(ctx, '♡', px + 56, by + 8, { size: 24, weight: 400, color: C.ink, align: 'center' });
    txt(ctx, '⟲', px + pw - 56, by + 8, { size: 24, weight: 400, color: C.ink, align: 'center' });
    // side frames: Rana's picking hand / Anon's headstock, alternating on beats 2 & 4
    const bp = beatPos(t) - beatPos(T16);
    const phase = Math.floor((bp - 1) / 2) % 2; // switches on beats 2 and 4
    const sideOn = bp < 1 ? -1 : phase;
    const frames = [
      { m: 'rana', c: C.green, crop: [220, 470, 620, 790], x: 140, lbl: 'CAM A · PICKING' },
      { m: 'anon', c: C.coral, crop: [880, 210, 1122, 440], x: 1420, lbl: 'CAM B · HEADSTOCK' },
    ];
    frames.forEach((f, i) => {
      const fy = 210, fw = 360, fh = 300;
      const k = E.outExpo(seg(t, T16 + 0.1 + i * 0.08, T16 + 0.5 + i * 0.08));
      const on = sideOn === -1 || sideOn === i;
      const xx = f.x + (i ? 1 : -1) * (1 - k) * 600;
      ctx.save();
      rect(ctx, xx, fy, fw, fh, on ? '#fff' : '#EEF0F2');
      if (on) {
        ctx.save(); ctx.beginPath(); ctx.rect(xx, fy, fw, fh); ctx.clip();
        const zoom = 1 + 0.04 * beatPulse(t, 0.2);
        drawCrop(ctx, f.m, f.crop, xx - fw * (zoom - 1) / 2, fy - fh * (zoom - 1) / 2, fw * zoom, fh * zoom);
        ctx.restore();
      } else {
        line(ctx, xx, fy, xx + fw, fy + fh, rgba(C.ink, 0.2), 1); line(ctx, xx + fw, fy, xx, fy + fh, rgba(C.ink, 0.2), 1);
      }
      ctx.strokeStyle = f.c; ctx.lineWidth = 7; ctx.strokeRect(xx, fy, fw, fh);
      txt(ctx, f.lbl, xx, fy - 14, { size: 11, weight: 800, track: 4, color: C.ink });
      if (on) { circle(ctx, xx + fw - 20, fy - 18, 6, C.coral); txt(ctx, 'REC', xx + fw - 32, fy - 13, { size: 10, weight: 800, track: 2, color: C.ink, align: 'right' }); }
      ctx.restore();
    });
    // bottom metronome squares
    const e8 = Math.floor((beatPos(t) - beatPos(T16)) * 2);
    for (let i = 0; i < 16; i++) {
      const on = i === ((e8 % 16) + 16) % 16;
      rect(ctx, 960 - 16 * 19 / 2 + i * 19, 1000, 13, 13, on ? C.sky : 'rgba(27,42,71,0.12)');
    }
    ctx.restore();
    if (col > 0.97) circle(ctx, 960, 540, 6, C.ink);
  }
  PV.def({ id: 16, t0: T16, draw: s16, ov: 'ink', name: 'VERSE' });

  /* ============================== SHOT 17 · harmony burst ============================== */
  const T17 = B(28);
  function s17(ctx, t) {
    const b3 = B(28, 3);
    const dark = t >= b3 - 0.01 && t < B(29) - 0.06;
    const back = seg(t, B(29) - 0.12, B(29));
    rect(ctx, 0, 0, W, H, dark ? mix(C.indigoD, C.fog, E.inQuad(back)) : C.fog);
    const cx = 960, cy = 540;
    if (!dark) {
      // calm: a tiny dot, gentle breathing
      circle(ctx, cx, cy, 7 + 2 * Math.sin((t - T17) * 6), C.ink);
      circle(ctx, cx, cy, 24, null, rgba(C.ink, 0.25), 1);
      txt(ctx, '32.39', cx + 30, cy - 18, { size: 11, fam: F.mono, weight: 600, color: rgba(C.ink, 0.6) });
    }
    // drumstick (crop of the illustration) pokes in from the top-right corner on beat 2, strikes on beat 3
    const b2 = B(28, 2);
    const inU = E.outExpo(seg(t, b2 - 0.04, b2 + 0.25));
    const hit = seg(t, b3 - 0.07, b3);
    const lift = t < b3 ? E.inQuad(hit) : 1 - E.outCubic(seg(t, b3, b3 + 0.35));
    if (inU > 0 && t < b3 + 0.4) {
      ctx.save();
      const ex = lerp(2050, 1520, inU) + 120 * E.inCubic(seg(t, b3 + 0.05, b3 + 0.4));
      const ey = lerp(-380, 100, inU) - 200 * E.inCubic(seg(t, b3 + 0.05, b3 + 0.4));
      ctx.translate(ex, ey); ctx.rotate(-0.5 + 0.55 * lift);
      // a deliberate cut-out chip: white frame + crop of the raised stick and hand
      rect(ctx, -142 + 10, -32 + 12, 284, 420, 'rgba(27,42,71,0.18)');
      rect(ctx, -142, -32, 284, 420, '#fff');
      rect(ctx, -132, -22, 264, 400, mix(C.indigo, '#ffffff', 0.7));
      drawCrop(ctx, 'taki', [968, -10, 1200, 342], -132, -22, 264, 400);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(-142, -32, 284, 420);
      txt(ctx, 'STICK · 04', -122, 374, { size: 11, weight: 800, track: 3, color: C.ink });
      ctx.restore();
    }
    if (t >= b3 - 0.01) {
      // rings in the four harmony colours, each later & slower
      const cols = PV.HARM.map((m) => MEM[m].c);
      for (let k = 3; k >= 0; k--) {
        const d = b3 + k * 0.07;
        const u = seg(t, d, d + 0.9 + k * 0.15);
        const r = 30 + (90 + k * 95) * E.outExpo(u);
        circle(ctx, cx, cy, r, null, cols[k], 10 - k * 1.5);
      }
      circle(ctx, cx, cy, 9, '#fff');
      // spokes with end dots
      const su = E.outExpo(seg(t, b3, b3 + 0.5));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.3;
        const r1 = 60, r2 = 60 + (430 + (i % 3) * 90) * su;
        line(ctx, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, 'rgba(255,255,255,0.65)', 1.2);
        circle(ctx, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, 5, cols[i % 4]);
      }
      // harmony line as a ring: narrow, widely tracked, hollow → filled when sung; expands & turns
      const L = LYR[8];
      const RT = 60 + 395 * E.outExpo(seg(t, b3 + 0.2, b3 + 1.2)) + 10;
      const spin = (t - b3) * 0.35;
      const reps = 3;
      const items = [];
      for (let r = 0; r < reps; r++) {
        L.chars.forEach((c, i) => {
          const a = -Math.PI / 2 + spin + (r * TAU) / reps + (i - 2) * 0.13;
          items.push({ i, x: cx + Math.cos(a) * (RT + 34), y: cy + Math.sin(a) * (RT + 34), size: 34, rot: a + Math.PI / 2 });
        });
      }
      const ha = clamp((t - b3) * 4);
      ctx.save(); ctx.globalAlpha = ha;
      drawKaraoke(ctx, L, t, items, { fam: F.got, weight: 700, color: '#fff', stroke: 'rgba(255,255,255,0.9)', lw: 1.1, scaleX: 0.72 });
      ctx.restore();
      txt(ctx, '( HARMONY )  弾けた合図', 96, 1000 - 40, { size: 12, weight: 800, track: 6, color: 'rgba(255,255,255,0.7)' });
    }
  }
  PV.def({ id: 17, t0: T17, draw: s17, ov: (t) => (t >= B(28, 3) - 0.01 && t < B(29) - 0.06 ? 'white' : 'ink'), name: 'VERSE · HARMONY' });

  /* ============================== SHOT 18 · split, halftone & silhouette ============================== */
  const T18 = B(29);
  function s18(ctx, t) {
    rect(ctx, 0, 0, W, H, '#FBFBF9');
    // left half: halftone sky gradient
    rect(ctx, 0, 0, 960, H, '#EAF4FA');
    halftone(ctx, 0, 0, 960, H, 18, 9.6, C.sky, (u, v) => clamp(0.15 + 0.85 * Math.abs(v - 0.5) * 2 * (0.6 + 0.4 * u)), 0.785, (t - T18) * 14);
    // blurred colour blobs left by sung characters (accumulating texture)
    const L = LYR[9];
    const sp1 = 5;
    const size = 132;
    const colA = layoutV(L, 700, 150, { size, to: sp1, lead: 1.02 });
    const colB = layoutV(L, 520, 150 + size * 1.5, { size, from: sp1, lead: 1.02 });
    const items = colA.items.concat(colB.items);
    items.forEach((it) => {
      const c = L.chars[it.i];
      const u = seg(t, c.t + 0.15, c.t + 1.6);
      if (u <= 0) return;
      glow(ctx, it.x, it.y, size * (0.6 + 1.1 * E.outCubic(u)), C.sky, 0.55 * E.outCubic(u));
      glow(ctx, it.x + 30, it.y - 20, size * (0.4 + 0.8 * E.outCubic(u)), '#ffffff', 0.5 * E.outCubic(u));
    });
    // placeholders appear one by one through bar 29; characters fill as they are sung (from 34.56)
    drawKaraoke(ctx, L, t, items, { vertical: true, fam: F.min, weight: 900, color: C.ink, stroke: C.ink, lw: 2, hot: C.skyD,
      appear: (i) => E.outCubic(seg(t, T18 + 0.08 + i * (BEAT / 2), T18 + 0.3 + i * (BEAT / 2))) });
    // division line with ticks
    line(ctx, 960, 0, 960, H, C.ink, 1.5);
    for (let y = 60; y < H; y += 30) line(ctx, 960, y, 960 + (y % 150 === 0 ? 18 : 9), y, C.ink, 1.2);
    txt(ctx, 'HALF / HALF', 980, 1000, { size: 11, weight: 800, track: 4, color: C.ink });
    // right: Tomori silhouette in sky monochrome, duplicated every beat in bar 30
    const b30 = B(30);
    const ent = E.outExpo(seg(t, T18 - 0.02, T18 + 0.4));
    const sil = silhouette('tomori', C.sky);
    const n = t >= b30 ? Math.min(4, Math.floor((t - b30) / BEAT) + 1) : 0;
    for (let k = n; k >= 1; k--) {
      const tb = b30 + (k - 1) * BEAT;
      const u = E.outExpo(seg(t, tb - 0.02, tb + 0.3));
      ctx.save(); ctx.globalAlpha = 0.85 - k * 0.17;
      drawFigure(ctx, 'tomori', 1250 + 140 * k * u, 1000, 900, { canvas: silhouette('tomori', mix(C.sky, '#ffffff', 0.18 * k)) });
      ctx.restore();
    }
    ctx.save(); ctx.translate((1 - ent) * 500, 0);
    drawFigure(ctx, 'tomori', 1250, 1000, 900, { canvas: sil });
    ctx.restore();
    // small number column beside the silhouette
    ctx.save(); ctx.globalAlpha = ent;
    for (let i = 0; i < 9; i++) txt(ctx, String(i + 1).padStart(2, '0'), 1040, 180 + i * 84, { size: 13, fam: F.mono, weight: 600, color: i === 4 ? C.skyD : C.ink });
    line(ctx, 1076, 170, 1076, 860, rgba(C.ink, 0.4), 1);
    ctx.restore();
    caption(ctx, 1500, 120, 'LYRIC 10', '0:34.56', C.ink, ent, 330);
  }
  PV.def({ id: 18, t0: T18, draw: s18, ov: 'ink', name: 'VERSE' });

  /* ============================== SHOT 19 · break ============================== */
  const T19 = B(31);
  function s19(ctx, t, s, noSlit) {
    rect(ctx, 0, 0, W, H, C.navy);
    const cx = 960 + Math.sin((t - T19) * 0.8) * 12, cy = 540 + Math.cos((t - T19) * 0.6) * 6;
    // dot matrix, slowly fading in; one global flash at 35.39
    const fadeIn = E.outCubic(seg(t, T19 - 0.05, T19 + 0.8));
    const fl = pulse(t, 35.39, 0.35);
    ctx.fillStyle = '#fff';
    for (let y = 26; y < H; y += 28) for (let x = 26; x < W; x += 28) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.013 + y * 0.021 + t * 1.7 + rnd(x, y) * 6));
      ctx.globalAlpha = clamp(fadeIn * (0.12 + 0.35 * tw) + fl * 0.6);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    // marquee bands, stopped
    PV.marquee(ctx, 90, 44, C.sky, C.navy, t);
    PV.marquee(ctx, 946, 44, C.sky, C.navy, t, { dir: -1, phase: 300 });
    // the hollow circle + crossing line
    line(ctx, 0, cy, W, cy, 'rgba(255,255,255,0.85)', 1.5);
    circle(ctx, cx, cy, 330, null, '#fff', 2.5);
    circle(ctx, cx, cy, 5, '#fff');
    txt(ctx, 'BAR 31', cx - 300, cy - 30, { size: 14, weight: 800, track: 6, color: '#fff' });
    txt(ctx, 'BREAK', cx + 300, cy + 44, { size: 14, weight: 800, track: 8, color: C.sky, align: 'right' });
    txt(ctx, '— DRUMS & BASS OUT —', cx, cy + 372, { size: 11, weight: 800, track: 6, color: 'rgba(255,255,255,0.75)', align: 'center' });
    txt(ctx, '35.34 → 36.52', cx + 352, cy - 14, { size: 11, fam: F.mono, weight: 600, color: 'rgba(255,255,255,0.7)' });
    ruler(ctx, cx - 330, cy + 10, cx + 330, cy + 10, 44, 'rgba(255,255,255,0.6)', { small: 5, big: 11, major: 4 });
    // lyric 10 continues: small, white, above the line
    const L = LYR[9];
    const lay = layoutH(ctx, L, cx, cy - 92, { size: 54, fam: F.min, weight: 700, align: 'center', track: 8 });
    drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 700, color: '#fff', stroke: 'rgba(255,255,255,0.75)', lw: 1.2, hot: C.sky });
    // last beat: the centre opens from a vertical slit → shot 20
    if (!noSlit) {
      const sl = E.inOutExpo(seg(t, B(31, 4) + 0.02, B(32)));
      if (sl > 0) {
        const w = W * sl;
        ctx.save(); ctx.beginPath(); ctx.rect(960 - w / 2, 0, w, H); ctx.clip();
        PV.drawShot(ctx, 20, Math.max(t, B(32)));
        ctx.restore();
        line(ctx, 960 - w / 2, 0, 960 - w / 2, H, '#fff', 2); line(ctx, 960 + w / 2, 0, 960 + w / 2, H, '#fff', 2);
      }
    }
  }
  PV.def({ id: 19, t0: T19, draw: s19, ov: 'white', name: 'BREAK' });

  /* ============================== SHOT 20 · navy, zebra, umbrellas ============================== */
  const T20 = B(32);
  const UMB = ['rana', 'anon', 'soyo', 'taki', 'tomori'];
  function cloud(ctx, x, y, s, col, lw) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-90, 30); ctx.lineTo(90, 30);
    ctx.arc(80, 4, 26, Math.PI / 2, -Math.PI / 2, true);
    ctx.arc(30, -18, 44, 0.2, Math.PI + 0.4, true);
    ctx.arc(-46, -2, 34, -0.3, Math.PI * 0.5 + 0.0, true);
    ctx.closePath();
    ctx.lineWidth = lw / s; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
  }
  function zebra(ctx, t, horizon, camX) {
    // white flat zebra stripes in perspective (2D trapezoids toward a vanishing point)
    const vx = 960, n = 9;
    ctx.save(); ctx.beginPath(); ctx.rect(0, horizon, W, H - horizon); ctx.clip();
    for (let i = 0; i < n; i++) {
      const xb0 = -700 + i * 420 - camX, xb1 = xb0 + 230;
      const f = (H - horizon) / (H - horizon + 0.0001);
      ctx.beginPath();
      ctx.moveTo(vx + (xb0 - vx) * 0.04, horizon); ctx.lineTo(vx + (xb1 - vx) * 0.04, horizon);
      ctx.lineTo(xb1 + (xb1 - vx) * 0.6, H + 200); ctx.lineTo(xb0 + (xb0 - vx) * 0.6, H + 200); ctx.closePath();
      ctx.fillStyle = '#F4F6F8'; ctx.fill();
    }
    // fog toward the horizon
    const g = ctx.createLinearGradient(0, horizon, 0, horizon + 160);
    g.addColorStop(0, C.navy); g.addColorStop(1, rgba(C.navy, 0));
    ctx.fillStyle = g; ctx.fillRect(0, horizon, W, 160);
    ctx.restore();
  }
  function s20(ctx, t) {
    rect(ctx, 0, 0, W, H, C.navy);
    const b33 = B(33), b34 = B(34);
    const L = LYR[10];
    if (t < b34) {
      // perspective phase: frame moves up on bar 33 → zebra fills the lower half
      const up = E.inOutCubic(seg(t, b33 - 0.1, b33 + 0.5));
      const horizon = lerp(760, 540, up);
      zebra(ctx, t, horizon, (t - T20) * 30);
      line(ctx, 0, horizon, W, horizon, 'rgba(255,255,255,0.6)', 1.5);
      // outlined geometric clouds
      [[300, 200, 1.1], [1500, 160, 0.8], [980, 330, 0.6], [1700, 420, 0.5]].forEach(([x, y, s], i) => {
        cloud(ctx, x + Math.sin((t - T20) * 0.5 + i) * 30 - (t - T20) * 14, y - up * 120, s, 'rgba(255,255,255,0.85)', 2.2);
      });
      // RAIN, hollow, half out of the top edge
      ctx.save();
      ctx.font = font(400, 330, F.disp); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.letterSpacing = '40px';
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      const rw = ctx.measureText('RAIN  ').width;
      for (let x = -((t - T20) * 40 % rw); x < W; x += rw) ctx.strokeText('RAIN  ', x, -10 - up * 120);
      ctx.letterSpacing = '0px';
      ctx.restore();
      // five clear umbrellas slide in, one per beat, lit in their colours; their drops shiver as they stop
      umbrellas20(ctx, t, up);
      // rain: diagonal lines, denser each bar
      const dens = t < b33 ? 30 : 64;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i < dens; i++) {
        const sp = 900 + rnd(i, 3) * 500;
        const y = ((t * sp + rnd(i, 1) * 2000) % 1400) - 200, x = rnd(i, 2) * (W + 400) - 200 + y * 0.3;
        ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 46);
      }
      ctx.stroke();
      // lyric 11: bold mincho, words pushed in one by one; each new word nudges the line
      wordsPush(ctx, t, L, 230 - up * 40, '#fff');
    } else {
      // bar 34: straight top-down — stripes and emblems as one flat composition
      const u = E.outExpo(seg(t, b34 - 0.02, b34 + 0.4));
      ctx.save();
      ctx.translate(960, 540); ctx.rotate(-0.0 + (1 - u) * 0.25); ctx.scale(lerp(1.25, 1, u), lerp(1.25, 1, u)); ctx.translate(-960, -540);
      for (let i = 0; i < 8; i++) rect(ctx, 80 + i * 230, -100, 120, H + 200, '#F4F6F8');
      ctx.restore();
      // the same five umbrellas straight from above: five lit, see-through circles laid over the stripes
      umbrellasTop20(ctx, t, u);
      // rain, one step denser again in bar 34
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i < 110; i++) {
        const sp = 900 + rnd(i, 3) * 500;
        const y = ((t * sp + rnd(i, 1) * 2000) % 1400) - 200, x = rnd(i, 2) * (W + 400) - 200 + y * 0.3;
        ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 46);
      }
      ctx.stroke();
      txt(ctx, 'TOP VIEW · 90°', W - 96, 1000, { size: 11, weight: 800, track: 4, color: 'rgba(255,255,255,0.8)', align: 'right' });
      wordsPush(ctx, t, L, 230, '#fff', C.navy);
    }
    caption(ctx, 96, 1000, 'LYRIC 11', '0:37.05', '#fff', E.outCubic(seg(t, T20, T20 + 0.4)), 330);
  }
  // ---- shot 20 umbrellas ----
  const up20 = (t) => E.inOutCubic(seg(t, B(33) - 0.1, B(33) + 0.5));
  const arrive20 = (i) => T20 + i * BEAT; // the beat on which umbrella i stops
  function umb20(i, t, up) {
    const m = UMB[i], tb = arrive20(i);
    const u = E.outExpo(seg(t, tb - 0.06, tb + 0.3));
    const age = t - (tb + 0.06);
    const swing = age > 0 ? -0.1 * Math.exp(-6 * age) * Math.sin(13 * age) : 0; // leans into the slide, swings back
    return {
      idx: i, u, x: lerp(W + 280, 330 + i * 315, u), y: 585 - up * 60 + (i % 2) * 40, scale: 1.38,
      tilt: 0.36, roll: 0.34 * (1 - u) + swing, spin: i * 0.7 + (1 - u) * 1.6 + (t - T20) * 0.22,
      tint: MEM[m].c, tintAmt: 0.5, glow: 0.2, rib: '#C8D2E2', handle: MEM[m].c, seam: '#FFFFFF', seamA: 0.6, fres: 0.55, sheen: 0.18, streak: 0.5,
    };
  }
  // drops lag behind while the umbrella slides in, then shiver when it stops
  const jig20 = (i) => (t) => {
    const tb = arrive20(i), u = E.outExpo(seg(t, tb - 0.06, tb + 0.3)), age = t - (tb + 0.06);
    return {
      dx: 7 * Math.pow(1 - u, 2) + (age > 0 ? -6 * Math.exp(-7 * age) * Math.sin(22 * age) : 0),
      dy: age > 0 ? 2.2 * Math.exp(-7 * age) * Math.sin(29 * age + 1) : 0,
    };
  };
  // a few drops flung off the leading edge of the canopy as it stops
  function flung20(ctx, i, t) {
    // released as the umbrella brakes: they keep its momentum (with a little air drag) and fall
    const trel = arrive20(i) + 0.1, tau = t - trel;
    if (tau < 0 || tau > 0.62) return;
    const U = PV.UMB, it = umb20(i, trel, up20(trel));
    const ends = [];
    for (let r = 0; r < U.NR; r++) ends.push(U.ribEnd(it, r, 0.01));
    ends.sort((a, b) => a.x - b.x);
    for (let q = 0; q < 3; q++) {
      const e = ends[q];
      const vx = -(650 + rnd(i, q, 71) * 450), vy = -(90 + rnd(i, q, 72) * 220);
      const x = e.x + (vx * (1 - Math.exp(-3.2 * tau))) / 3.2, y = e.y + vy * tau + 0.5 * 2400 * tau * tau - (up20(t) - up20(trel)) * 60;
      U.drop(ctx, x, y, 3.6 + rnd(i, q, 73) * 2.8, { style: 'dark', a: clamp((0.62 - tau) / 0.25) * clamp(tau * 40), stretch: 1.12 });
    }
  }
  function umbrellas20(ctx, t, up) {
    const U = PV.UMB, items = [];
    UMB.forEach((m, i) => {
      const it = umb20(i, t, up);
      if (it.u <= 0) return;
      glow(ctx, it.x, it.y + 40, 200, MEM[m].c, 0.42); // seen through the canopy: the umbrella glows on the dark
      items.push(it);
    });
    if (!items.length || !U.begin()) return;
    const rains = items.map((it) => U.rain(it, t, { seed: 200 + it.idx, n: 16, rmin: 0.016, rmax: 0.042, rcap: 7, sliders: [[2.3, it.idx * 0.61]], tips: true, jig: jig20(it.idx) }));
    rains.forEach((R) => U.drawBeads(ctx, R.back, 'dark'));
    U.render(ctx, items, { light: [-7, 9, 10] });
    rains.forEach((R) => U.drawBeads(ctx, R.front, 'dark'));
    items.forEach((it) => flung20(ctx, it.idx, t));
  }
  function umbrellasTop20(ctx, t, u) {
    const U = PV.UMB, b34 = B(34);
    const rot = (1 - u) * 0.25, sc = lerp(1.25, 1, u);
    const map = (x, y) => { const dx = x - 960, dy = y - 540, c = Math.cos(rot), s = Math.sin(rot); return [960 + sc * (dx * c - dy * s), 540 + sc * (dx * s + dy * c)]; };
    const items = UMB.map((m, i) => {
      const [x, y] = map(260 + i * 350, 700 + (i % 2 ? -150 : 60));
      return { idx: i, x, y, scale: 1.34 * sc, tilt: Math.PI / 2, roll: -rot, spin: -(i * 0.4 + (t - b34) * 0.6),
        tint: MEM[m].c, tintAmt: 0.5, glow: 0.22, rib: '#C8D2E2', handle: MEM[m].c, seam: '#FFFFFF', seamA: 0.6, fres: 0.5, sheen: 0.18, streak: 0.5 };
    });
    items.forEach((it) => glow(ctx, it.x, it.y, 210 * sc, MEM[UMB[it.idx]].c, 0.45));
    if (!U.begin(U.cam(18))) return;
    const rains = items.map((it) => U.rain(it, t, { seed: 300 + it.idx, n: 18, rmin: 0.016, rmax: 0.04, rcap: 7, sliders: [[2.2, it.idx * 0.5]], tips: true, fallAway: true }));
    rains.forEach((R) => U.drawBeads(ctx, R.back, 'light'));
    U.render(ctx, items, { light: [-8, 8, 20] });
    rains.forEach((R) => U.drawBeads(ctx, R.front, 'light'));
  }
  // words push in from the right; every new word shoves the earlier ones left
  function wordsPush(ctx, t, L, y, col, bg) {
    const size = 92;
    const words = L.words;
    ctx.font = font(900, size, F.min);
    const ws = words.map((w) => ctx.measureText(w.text).width + 30);
    // visible words: from the latest word back until full
    let cur = -1;
    words.forEach((w, i) => { if (t >= w.t - 0.08) cur = i; });
    if (cur < 0) return;
    // target layout: right-aligned block ending at x=1820, keep last 4 words
    const first = Math.max(0, cur - 3);
    let x = 1830;
    const pos = [];
    for (let i = cur; i >= first; i--) { x -= ws[i]; pos[i] = x; }
    for (let i = first; i <= cur; i++) {
      const w = words[i];
      const u = E.outExpo(seg(t, w.t - 0.08, w.t + 0.25));
      const push = i < cur ? E.outBack(seg(t, words[cur].t - 0.08, words[cur].t + 0.25), 1.6) : 1;
      let px = pos[i];
      if (i === cur) px = lerp(W + 40, pos[i], u);
      else {
        // previous position before the latest push
        let x2 = 1830; const prev = [];
        for (let j = cur - 1; j >= Math.max(0, cur - 4); j--) { x2 -= ws[j]; prev[j] = x2; }
        px = lerp(prev[i] != null ? prev[i] : pos[i], pos[i], push);
      }
      if (bg) { rect(ctx, px - 12, y - size * 0.62, ws[i] - 6, size * 1.2, bg); }
      const lay = layoutH(ctx, L, px, y, { size, fam: F.min, weight: 900, from: w.i0, to: w.i1 });
      drawKaraoke(ctx, L, t, lay.items, { fam: F.min, weight: 900, color: col, stroke: col, lw: 1.6, hot: C.sky });
    }
  }
  PV.wordsPush = wordsPush;
  PV.def({ id: 20, t0: T20, draw: s20, ov: 'white', name: 'PRE-CHORUS' });

  /* ============================== SHOT 21 · road markings (perspective ground) ============================== */
  const T21 = B(35);
  let groundCv = null;
  function groundTex(t) {
    if (!groundCv) groundCv = PV.mkCanvas(2560, 1024);
    const g = groundCv.getContext('2d');
    const GW = 2560, GH = 1024;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.navy; g.fillRect(0, 0, GW, GH);
    // colour blobs expanding from between the markings, one per beat in bar 36
    const b36 = B(36);
    const cols = PV.HARM.map((m) => MEM[m].c);
    for (let k = 0; k < 4; k++) {
      const tb = b36 + k * BEAT;
      const u = E.outExpo(seg(t, tb - 0.04, tb + 0.5));
      if (u <= 0) continue;
      g.beginPath(); g.arc(520 + k * 520, k % 2 ? 300 : 740, 60 + 300 * u, 0, TAU); g.fillStyle = cols[k]; g.fill();
    }
    // lane lines and long bars
    g.fillStyle = '#fff';
    for (let x = 0; x < GW; x += 260) { g.fillRect(x, 506, 150, 12); }
    g.fillRect(0, 120, GW, 10); g.fillRect(0, 894, GW, 10);
    // arrows
    for (let x = 200; x < GW; x += 640) {
      g.save(); g.translate(x, 300); g.beginPath(); g.moveTo(0, -18); g.lineTo(120, -18); g.lineTo(120, -48); g.lineTo(190, 0); g.lineTo(120, 48); g.lineTo(120, 18); g.lineTo(0, 18); g.closePath(); g.fill(); g.restore();
      g.font = font(800, 40, F.sans); g.fillText(String((x / 640 + 1) | 0).padStart(2, '0'), x, 210);
    }
    // the harmony, painted like road text: bold, wide, written from one end, filled as sung
    const L = LYR[11];
    const sp = L.chars.findIndex((c) => c.space);
    g.save(); g.translate(330, 742); g.scale(1, 1.7);
    g.font = font(900, 150, F.got); g.textBaseline = 'middle'; g.textAlign = 'left';
    let x = 0;
    for (let i = 0; i < sp; i++) {
      const c = L.chars[i];
      const w = g.measureText(c.ch).width;
      const wr = seg(t, T21 + 0.1 + i * 0.09, T21 + 0.25 + i * 0.09); // written out (outline)
      if (wr > 0) {
        g.save(); g.beginPath(); g.rect(x - 10, -150, (w + 20) * wr, 300); g.clip();
        g.lineWidth = 5; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.strokeText(c.ch, x, 0);
        const f = fillOf(c, t);
        if (f > 0) { g.beginPath(); g.rect(x - 10, -150, (w + 20) * f, 300); g.clip(); g.fillStyle = '#fff'; g.fillText(c.ch, x, 0); }
        g.restore();
      }
      x += w + 18;
    }
    g.restore();
    return groundCv;
  }
  function s21(ctx, t) {
    const G = PV.G3;
    const cv = groundTex(t);
    const camX = lerp(-7, 6, E.inOutCubic(seg(t, T21 - 0.1, B(36) + 0.2))) + (t - T21) * 0.6;
    const ent = E.outExpo(seg(t, T21 - 0.02, T21 + 0.35));
    if (G.ok) {
      G.tex('ground21', cv, { update: true });
      G.begin(C.navy, { eye: [camX, 6.4 + (1 - ent) * 6, 10.5], at: [camX + 0.9, 0, 0.2], fov: 0.82 }, { color: C.navy, range: [10, 26], amount: 1 });
      G.quad(G.M.trs([0, 0, 0], [-Math.PI / 2, 0, 0], [30, 12, 1]), { tex: G.tex('ground21', cv) });
      G.flush();
      ctx.drawImage(G.canvas, 0, 0, W, H);
    } else ctx.drawImage(cv, 0, 0, W, H);
    // sky band with the tail of lyric 11
    const g = ctx.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, C.navy); g.addColorStop(1, rgba(C.navy, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 360);
    wordsPush(ctx, t, LYR[10], 200, '#fff');
    // small arrows + numbers along the markings (screen-space HUD)
    for (let i = 0; i < 5; i++) {
      const x = 180 + i * 380 - ((t - T21) * 140) % 380;
      PV.arrow(ctx, x, 980, 60, 0, 'rgba(255,255,255,0.8)', 3, 12);
      txt(ctx, 'L-' + String(i + 1).padStart(2, '0'), x, 1010, { size: 11, weight: 800, track: 3, color: 'rgba(255,255,255,0.7)' });
    }
    caption(ctx, 1480, 1000, 'HARMONY 12', '0:41.87', '#fff', E.outCubic(seg(t, T21, T21 + 0.4)), 340);
  }
  PV.def({ id: 21, t0: T21, draw: s21, ov: 'white', name: 'PRE-CHORUS' });

  /* ============================== SHOT 22 · inhale ============================== */
  const T22 = B(37);
  function s22(ctx, t, s, opt = {}) {
    rect(ctx, 0, 0, W, H, C.navy);
    const cx = 960, cy = 540;
    // a ring per beat, breathing outwards
    const bp = beatPos(t) - beatPos(T22);
    for (let b = Math.max(0, Math.floor(bp) - 5); b <= Math.floor(bp); b++) {
      const tb = T22 + b * BEAT;
      const u = seg(t, tb, tb + 1.7);
      if (u <= 0 || u >= 1) continue;
      circle(ctx, cx, cy, 170 + 760 * E.outCubic(u), null, `rgba(255,255,255,${0.55 * (1 - u)})`, 1.4);
    }
    // ticks & labels around the circle
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((t - T22) * 0.05);
    ctx.beginPath();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, r1 = 236, r2 = i % 10 === 0 ? 256 : 246;
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    // the small frame with one member (Soyo) as a yellow silhouette
    const ent = E.outBack(seg(t, T22 - 0.04, T22 + 0.4), 1.3);
    if (ent > 0) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, 170 * ent, 0, TAU); ctx.fillStyle = '#16244A'; ctx.fill(); ctx.clip();
      const br = 1 + 0.03 * Math.sin((t - T22) * Math.PI / BEAT / 2);
      drawCrop(ctx, 'soyo', [200, -40, 820, 900], cx - 170 * br, cy - 150 * br, 340 * br, 520 * br, { canvas: silhouette('soyo', C.yellow) });
      ctx.restore();
      circle(ctx, cx, cy, 170 * ent, null, C.yellow, 3);
    }
    // harmony line as a ring of narrow, tracked sans in the member colour
    const L = LYR[11];
    const n = L.chars.length;
    const spin = (t - T22) * 0.12;
    const items = L.chars.map((c, i) => {
      const a = -Math.PI / 2 + spin + (i / n) * TAU;
      return { i, x: cx + Math.cos(a) * 318, y: cy + Math.sin(a) * 318, size: 34, rot: a + Math.PI / 2 };
    });
    drawKaraoke(ctx, L, t, items, { fam: F.got, weight: 700, color: C.yellow, stroke: rgba(C.yellow, 0.7), lw: 1, scaleX: 0.74,
      appear: (i) => E.outCubic(seg(t, T22 + i * 0.02, T22 + 0.3 + i * 0.02)) });
    // labels around
    const lab = ['03', 'SOYO', 'BREATH IN', 'BAR 37–38', 'LOW END THIN', '42.40'];
    lab.forEach((l, i) => {
      const a = -Math.PI / 2 + (i / lab.length) * TAU + 0.26;
      txt(ctx, l, cx + Math.cos(a) * 430, cy + Math.sin(a) * 430, { size: 11, weight: 800, track: 4, color: i === 1 ? C.yellow : 'rgba(255,255,255,0.75)', align: 'center' });
    });
    if (!opt.noCaption) caption(ctx, 96, 1000, 'HARMONY 12', '0:41.87', '#fff', E.outCubic(seg(t, T22, T22 + 0.4)), 340);
  }
  PV.s22 = s22;
  PV.def({ id: 22, t0: T22, draw: s22, ov: 'white', name: 'PRE-CHORUS · INHALE' });
})();
