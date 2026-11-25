/* Shots 01–11: opening (white, lines & circles) and the prelude (title + five member posters). */
'use strict';
(function () {
  const PV = window.PV;
  const { W, H, B, BEAT, BAR, C, MEM, E, ease, seg, clamp, lerp, rnd, rgba, mix, font, F, TAU,
    rect, circle, line, rrect, grid, stripes, halftone, star4, star5, checker, barcode, tape, tag, txt, ringText,
    ruler, glow, veil, drawFigure, drawCrop, silhouette, rim, IMG, LY: LYR, drawKaraoke, layoutH, layoutV,
    antic, pulse, beatPulse, beatPos } = PV;

  // ---------- shared helpers ----------
  const paper = (ctx, c = C.paper) => rect(ctx, 0, 0, W, H, c);
  const paperGrid = (ctx, a = 1, ox = 0, oy = 0) => {
    if (a <= 0) return;
    grid(ctx, 0, 0, W, H, 40, rgba(C.ink, 0.045 * a), 1, ox, oy);
    grid(ctx, 0, 0, W, H, 160, rgba(C.ink, 0.075 * a), 1, ox, oy);
  };
  // member name tag: [01] 要楽奈 Gt.
  function nameTag(ctx, x, y, m, o = {}) {
    const M = MEM[m];
    const h = 40, ink = o.ink || C.ink, bg = o.bg || '#fff', acc = o.acc || M.c;
    ctx.save();
    ctx.font = font(800, 17, F.sans);
    const wNo = 46;
    ctx.font = font(700, 19, F.got);
    const wName = ctx.measureText(M.name).width;
    ctx.font = font(700, 15, F.sans);
    const wPart = ctx.measureText(M.part).width;
    const w = wNo + 18 + wName + 22 + wPart + 20;
    rrect(ctx, x, y - h / 2, w, h, 4); ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
    rrect(ctx, x, y - h / 2, wNo, h, 4); ctx.fillStyle = acc; ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.noInk || ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = font(800, 17, F.sans); ctx.fillText(M.no, x + wNo / 2, y + 1);
    ctx.textAlign = 'left'; ctx.fillStyle = ink;
    ctx.font = font(700, 19, F.got); ctx.fillText(M.name, x + wNo + 16, y + 1);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x + wNo + 16 + wName + 11, y, 2.5, 0, TAU); ctx.fill();
    ctx.font = font(700, 15, F.sans); ctx.fillText(M.part, x + wNo + 16 + wName + 22, y + 1);
    ctx.restore();
    return w;
  }
  PV.nameTag = nameTag;

  // instrument pictograms (flat, geometric)
  function icon(ctx, kind, x, y, s, col, ink) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 2.4 / s * s;
    if (kind === 'guitar') {
      ctx.save(); ctx.rotate(-0.6);
      ctx.beginPath(); ctx.ellipse(0, 18, 20, 24, 0, 0, TAU); ctx.ellipse(0, -8, 15, 16, 0, 0, TAU); ctx.fill('nonzero');
      ctx.beginPath(); ctx.ellipse(0, 18, 20, 24, 0, 0, TAU); ctx.stroke();
      rect(ctx, -3.5, -62, 7, 56, ink); rect(ctx, -6, -76, 12, 16, col); ctx.strokeRect(-6, -76, 12, 16);
      circle(ctx, 0, 10, 6, ink);
      ctx.restore();
    } else if (kind === 'pick') {
      ctx.beginPath(); ctx.moveTo(-14, -12); ctx.quadraticCurveTo(0, -20, 14, -12); ctx.quadraticCurveTo(10, 8, 0, 18); ctx.quadraticCurveTo(-10, 8, -14, -12);
      ctx.fill(); ctx.stroke();
    } else if (kind === 'bass') {
      ctx.save(); ctx.rotate(-0.55);
      ctx.beginPath(); ctx.ellipse(-3, 30, 22, 26, 0.15, 0, TAU); ctx.ellipse(4, 4, 15, 17, -0.2, 0, TAU); ctx.fill('nonzero');
      ctx.beginPath(); ctx.ellipse(-3, 30, 22, 26, 0.15, 0, TAU); ctx.stroke();
      rect(ctx, -3, -78, 6, 86, ink);
      rrect(ctx, -6, -100, 12, 24, 4); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 4; i++) circle(ctx, 11, -97 + i * 6.5, 2.6, ink);
      rect(ctx, -12, 26, 24, 5, ink);
      ctx.restore();
    } else if (kind === 'drum') {
      ctx.beginPath(); ctx.ellipse(0, -10, 30, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-30, -10); ctx.lineTo(-30, 14); ctx.ellipse(0, 14, 30, 10, 0, Math.PI, 0, true); ctx.lineTo(30, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-26, -36); ctx.lineTo(8, -14); ctx.moveTo(26, -36); ctx.lineTo(-8, -14); ctx.lineWidth = 3.5; ctx.stroke();
    } else if (kind === 'mic') {
      rrect(ctx, -11, -40, 22, 34, 11); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -16, 18, 0.15, Math.PI - 0.15); ctx.moveTo(0, 2); ctx.lineTo(0, 22); ctx.moveTo(-10, 22); ctx.lineTo(10, 22); ctx.stroke();
    }
    ctx.restore();
  }
  PV.icon = icon;

  // prelude signature curtain: diagonal band in next member colour, one beat long, centred on the bar line
  const CURT = [[B(12), MEM.rana.c], [B(13), MEM.anon.c], [B(14), MEM.soyo.c], [B(15), MEM.taki.c], [B(16), MEM.tomori.c]];
  const ANG = Math.atan2(H, W);
  function curtain(ctx, t) {
    for (const [tb, col] of CURT) {
      const a = tb - BEAT / 2, b = tb + BEAT / 2;
      if (t < a || t > b) continue;
      const u = seg(t, a, b);
      const half = 1150; // half extent along diagonal
      const lead = u < 0.5 ? lerp(-half, half + 40, E.outExpo(u * 2)) : half + 40;
      const trail = u < 0.5 ? -half - 40 : lerp(-half - 40, half + 40, E.inExpo((u - 0.5) * 2));
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(-ANG);
      ctx.fillStyle = col; ctx.fillRect(trail, -1400, lead - trail, 2800);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      if (u < 0.5) ctx.fillRect(lead - 10, -1400, 4, 2800);
      else ctx.fillRect(trail, -1400, 4, 2800);
      ctx.fillStyle = mix(col, '#ffffff', 0.45);
      if (u > 0.5) ctx.fillRect(trail - 60 * (1 - E.inExpo((u - 0.5) * 2)), -1400, 60 * (1 - E.inExpo((u - 0.5) * 2)), 2800);
      ctx.restore();
    }
  }
  PV.preCurtain = curtain;

  // vertical string with pluck vibration
  function pluckX(t, tp, y, amp, seed) {
    if (t < tp) return 0;
    const d = t - tp;
    return amp * Math.exp(-d * 6.5) * Math.sin(d * 2 * Math.PI * 15 + seed) * Math.sin((y / H) * Math.PI * (2 + (seed % 2)));
  }

  /* ============================== SHOT 01 ============================== */
  const LX = 780, LY = 700;
  function s01(ctx, t) {
    paper(ctx);
    paperGrid(ctx, ease(t, 0, 0.5, E.outCubic));
    // drawn line: fast then easing out near the bottom
    const p = E.outQuart(seg(t, 0.05, 1.02));
    const y1 = LY * p;
    line(ctx, LX, 0, LX, y1, C.ink, 2);
    // ruler ticks along the line
    ctx.beginPath();
    for (let y = 46; y < y1; y += 46) { const big = Math.round(y / 46) % 5 === 0; ctx.moveTo(LX - (big ? 14 : 7), y); ctx.lineTo(LX, y); }
    ctx.strokeStyle = rgba(C.ink, 0.6); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = font(600, 10, F.mono); ctx.fillStyle = rgba(C.ink, 0.55); ctx.textAlign = 'right';
    for (let i = 1; i * 230 < y1; i++) ctx.fillText('0' + i, LX - 20, i * 230 + 4);
    // landing target
    const tg = ease(t, 0.55, 0.9, E.outBack);
    if (tg > 0) {
      ctx.save(); ctx.translate(LX, LY);
      ctx.strokeStyle = rgba(C.ink, 0.55); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-26 * tg, 0); ctx.lineTo(26 * tg, 0); ctx.stroke();
      ctx.setLineDash([3, 4]); circle(ctx, 0, 0, 22 * tg, null, rgba(C.ink, 0.45), 1.2); ctx.setLineDash([]);
      ctx.restore();
      txt(ctx, 'IMPACT  1.22', LX + 34, LY + 4, { size: 10, weight: 700, track: 2, color: rgba(C.ink, 0.6 * tg) });
    }
    // falling ball (accelerating)
    if (t > 0.3) {
      const u = seg(t, 0.3, B(2));
      const by = LY * E.inCubic(u);
      const v = 3 * u * u; // speed proxy
      ctx.save();
      const g = ctx.createLinearGradient(LX, by - 120 * v, LX, by);
      g.addColorStop(0, rgba(C.sky, 0)); g.addColorStop(1, rgba(C.sky, 0.55));
      ctx.fillStyle = g; ctx.fillRect(LX - 6, by - 120 * v, 12, 120 * v);
      ctx.restore();
      circle(ctx, LX, by, 14, C.sky);
      circle(ctx, LX, by, 14, null, C.ink, 1.5);
    }
    lyricL1(ctx, t);
  }
  // first lyric, vertical on the right: hollow placeholder appearing, then filled as sung
  function lyricL1(ctx, t, o = {}) {
    const L = LYR[0];
    const x = 1500, y = 196, size = 60;
    const strip = o.strip || 0;
    if (strip > 0) {
      // paper slip behind the text (keeps it readable over the rings)
      const h = (size * 1.06 * 11 + 70) * strip;
      ctx.save();
      rect(ctx, x - 62, y - 50, 124, h, C.paper);
      ctx.strokeStyle = rgba(C.ink, 0.8); ctx.lineWidth = 1.5; ctx.strokeRect(x - 62, y - 50, 124, h);
      ctx.restore();
    }
    const lay = layoutV(L, x, y, { size, lead: 1.06 });
    drawKaraoke(ctx, L, t, lay.items, {
      vertical: true, fam: F.min, weight: 600, color: C.ink, stroke: C.ink, lw: 1.3, hot: C.skyD,
      appear: (i) => E.outCubic(seg(t, 0.28 + i * 0.04, 0.5 + i * 0.04)),
    });
    // caption
    const ca = E.outCubic(seg(t, 0.5, 0.9));
    if (ca > 0) {
      ctx.save(); ctx.globalAlpha = ca;
      txt(ctx, 'LYRIC 01', x + 52, y + 8, { size: 11, weight: 800, track: 3, color: C.ink });
      line(ctx, x + 52, y + 22, x + 52 + 74 * ca, y + 22, C.ink, 1.2);
      txt(ctx, '0:00.92', x + 52, y + 42, { size: 11, weight: 500, fam: F.mono, color: rgba(C.ink, 0.7) });
      ctx.restore();
    }
  }
  PV.def({ id: 1, t0: 0, draw: s01, ov: 'ink', name: 'OPENING' });

  /* ============================== SHOT 02 ============================== */
  const RING_W = 62, RING_N = 23;
  function ringsS02(ctx, t, tb, cx, cy, colA, colB, o = {}) {
    // bump on bar 3 downbeat: slight squeeze then release
    let sc = 1;
    if (o.bump) {
      const b = o.bump;
      if (t > b - 0.1 && t < b + 0.45) {
        sc = t < b ? 1 - 0.04 * E.inOutQuad(seg(t, b - 0.1, b)) : 1 - 0.04 + 0.04 * E.outBack(seg(t, b, b + 0.4), 2.2);
      }
    }
    for (let i = RING_N - 1; i >= 0; i--) {
      const d = tb + i * 0.032;
      const r = (i + 1) * RING_W * E.outExpo(seg(t, d, d + 1.25)) * sc * (o.scale || 1);
      if (r <= 0) continue;
      circle(ctx, cx, cy, r, i % 2 === 0 ? colA : colB);
    }
  }
  function s02(ctx, t) {
    paper(ctx);
    paperGrid(ctx, 1);
    const tb = B(2);
    ringsS02(ctx, t, tb, LX, LY, C.sky, C.paper, { bump: B(3) });
    // thin rule + impact
    line(ctx, LX, 0, LX, LY, rgba(C.ink, 0.9), 2);
    const ip = seg(t, tb, tb + 0.5);
    if (ip < 1) circle(ctx, LX, LY, 20 + 160 * E.outExpo(ip), null, rgba(C.ink, 1 - ip), 2);
    circle(ctx, LX, LY, 7, C.ink);
    txt(ctx, 'BAR 02', LX + 18, LY - 14, { size: 10, weight: 800, track: 3, color: C.ink });
    // diagonal hatch sliding into the left half
    const hx = lerp(-760, 0, E.outExpo(seg(t, tb + 0.08, tb + 0.6)));
    ctx.save();
    ctx.beginPath(); ctx.moveTo(hx + 72, 150); ctx.lineTo(hx + 640, 150); ctx.lineTo(hx + 520, 820); ctx.lineTo(hx + 72, 820); ctx.closePath(); ctx.clip();
    ctx.beginPath();
    for (let k = -900; k < 900; k += 15) { ctx.moveTo(hx + k, 820); ctx.lineTo(hx + k + 680, 140); }
    ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    if (hx > -700) txt(ctx, 'HATCH / 45°', hx + 76, 842, { size: 10, weight: 800, track: 3, color: C.ink });
    // marquee band
    const mw = E.outExpo(seg(t, tb, tb + 0.45));
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * mw, H); ctx.clip();
    PV.marquee(ctx, 912, 54, C.ink, C.paper, t);
    ctx.restore();
    lyricL1(ctx, t, { strip: E.outExpo(seg(t, tb - 0.05, tb + 0.35)) });
    // L2 pickup begins at 3.361 -> shot 03 takes over
  }
  PV.def({ id: 2, t0: B(2), draw: s02, ov: 'ink', name: 'OPENING' });

  /* ============================== SHOT 03 ============================== */
  const T3 = 3.361;
  const COLS = [[0, 600], [600, 1380], [1380, W]];
  function s03(ctx, t) {
    // columns slide up, each half a beat later, covering shot 02
    const starts = [T3 - 0.07, T3 - 0.07 + BEAT / 2, T3 - 0.07 + BEAT];
    const off = starts.map((s) => H * (1 - E.outExpo(seg(t, s, s + 0.42))));
    if (off.some((o) => o > 0.5)) PV.drawShot(ctx, 2, t);
    for (let c = 0; c < 3; c++) {
      const [x0, x1] = COLS[c];
      ctx.save();
      ctx.translate(0, off[c]);
      ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, H); ctx.clip();
      rect(ctx, x0, 0, x1 - x0, H, C.paper2);
      grid(ctx, x0, 0, x1 - x0, H, 32, rgba(C.ink, 0.06), 1, 0, 0);
      grid(ctx, x0, 0, x1 - x0, H, 160, rgba(C.ink, 0.09), 1, 0, 0);
      if (c > 0) line(ctx, x0 + 0.5, 0, x0 + 0.5, H, rgba(C.ink, 0.35), 1);
      if (c === 0) col03a(ctx, t, starts[0]);
      if (c === 1) col03b(ctx, t, starts[1]);
      if (c === 2) col03c(ctx, t, starts[2]);
      ctx.restore();
    }
  }
  function col03a(ctx, t, ts) {
    const cx = 300, cy = 540, cw = 372, ch = 760;
    const rot = lerp(-0.12, 0, E.outBack(seg(t, ts + 0.05, ts + 0.6), 2.6));
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    // card shadow plate + card
    rrect(ctx, -cw / 2 + 10, -ch / 2 + 12, cw, ch, 14); ctx.fillStyle = rgba(C.ink, 0.12); ctx.fill();
    rrect(ctx, -cw / 2, -ch / 2, cw, ch, 14); ctx.fillStyle = C.sky; ctx.fill();
    ctx.save(); rrect(ctx, -cw / 2, -ch / 2, cw, ch, 14); ctx.clip();
    stripes(ctx, -cw / 2, -ch / 2, cw, ch, 0.785, 34, [10], rgba('#ffffff', 0.13), t * 14);
    circle(ctx, 60, -150, 210, rgba('#ffffff', 0.16));
    drawFigure(ctx, 'tomori', 0, ch / 2 - 40, 640, { sticker: true });
    ctx.restore();
    // card text
    txt(ctx, 'No.05', -cw / 2 + 22, -ch / 2 + 40, { size: 15, weight: 800, track: 3, color: C.ink });
    txt(ctx, 'TOMORI', cw / 2 - 22, -ch / 2 + 40, { size: 15, weight: 800, track: 5, color: '#fff', align: 'right' });
    rect(ctx, -cw / 2, ch / 2 - 64, cw, 64, '#fff');
    txt(ctx, '高松燈', -cw / 2 + 22, ch / 2 - 24, { font: font(700, 24, F.min), color: C.ink });
    txt(ctx, 'Vo.', cw / 2 - 22, ch / 2 - 25, { size: 18, weight: 800, track: 2, color: C.ink, align: 'right' });
    // tape on two corners
    tape(ctx, -cw / 2 + 18, -ch / 2 + 6, 120, 34, -0.7, 'rgba(255,255,255,0.62)', 3);
    tape(ctx, cw / 2 + 2, ch / 2 + 2, 120, 34, -0.75, 'rgba(255,236,170,0.7)', 5);
    ctx.restore();
    // twinkling stars around the card
    const SP = [[70, 170, 26], [520, 250, 18], [540, 860, 30], [70, 930, 16], [470, 120, 12]];
    SP.forEach(([x, y, r], i) => {
      const bp = beatPulse(t + i * 0.07, 0.25);
      const a = E.outBack(seg(t, ts + 0.2 + i * 0.05, ts + 0.5 + i * 0.05));
      star4(ctx, x, y, r * a * (0.75 + 0.45 * bp), '#fff', 0);
      star4(ctx, x, y, r * a * (0.75 + 0.45 * bp) * 0.42, C.sky, 0);
    });
  }
  function col03b(ctx, t, ts) {
    const L = LYR[1];
    const x = 664, y1 = 470, y2 = 640, size = 126;
    const a = E.outCubic(seg(t, ts, ts + 0.4));
    // caption
    ctx.save(); ctx.globalAlpha = a;
    rect(ctx, x, 250, 14, 14, C.sky);
    txt(ctx, 'LYRIC 02', x + 26, 263, { size: 13, weight: 800, track: 4, color: C.ink });
    line(ctx, x + 140, 257, 1320, 257, rgba(C.ink, 0.5), 1);
    txt(ctx, '0:03.36', 1320, 284, { size: 12, fam: F.mono, weight: 500, color: rgba(C.ink, 0.7), align: 'right' });
    ctx.restore();
    // per-word slide from left into place, as each word is sung
    const rows = [layoutH(ctx, L, x, y1, { size, fam: F.min, weight: 700, to: 4, track: 2 }), layoutH(ctx, L, x, y2, { size, fam: F.min, weight: 700, from: 4, track: 2 })];
    const items = rows[0].items.concat(rows[1].items);
    const wordOff = (i) => {
      const w = L.chars[i].w, wt = L.words[w].t;
      const u = seg(t, wt - 0.08, wt + 0.3);
      return { dx: -160 * (1 - E.outExpo(u)), on: u > 0 };
    };
    // faint placeholder
    drawKaraoke(ctx, L, t, items, { fam: F.min, weight: 700, color: C.ink, stroke: rgba(C.ink, 0.28), lw: 1.4, fillOverride: () => 0, appear: () => a });
    const moving = items.map((it) => { const o = wordOff(it.i); return { ...it, x: it.x + o.dx, alpha: o.on ? 1 : 0 }; });
    drawKaraoke(ctx, L, t, moving, { fam: F.min, weight: 700, color: C.ink, stroke: C.ink, lw: 1.6, hot: C.skyD });
    // romaji gloss
    ctx.save(); ctx.globalAlpha = a * 0.8;
    txt(ctx, 'WASUREZU NI  /  ARUITEKU YO', x, 760, { size: 13, weight: 600, track: 7, color: C.ink });
    ruler(ctx, x, 800, 1320, 800, 40, rgba(C.ink, 0.55), { small: 5, big: 11, major: 8 });
    ctx.restore();
    // sung-word underline marker
    const wi = PV.wordAt(L, t);
    if (wi >= 0) {
      const ws = L.words[wi];
      const its = items.filter((it) => it.i >= ws.i0 && it.i < ws.i1);
      if (its.length) {
        const xa = its[0].x - size / 2, xb = its[its.length - 1].x + size / 2;
        const u = E.outExpo(seg(t, ws.t, ws.t + 0.25));
        rect(ctx, xa, its[0].y + size * 0.62, (xb - xa) * u, 7, C.sky);
      }
    }
  }
  function col03c(ctx, t, ts) {
    const x = 1452;
    const items = [
      (y) => tag(ctx, x, y, 'TRACK 01', { size: 14, stroke: C.ink, color: C.ink, lw: 1.6 }),
      (y) => tag(ctx, x, y, 'VOCAL · TOMORI', { size: 14, bg: C.sky, color: C.ink }),
      (y) => tag(ctx, x, y, '♩ = 204', { size: 14, bg: C.ink, color: '#fff' }),
      (y) => tag(ctx, x, y, '4 / 4', { size: 14, stroke: C.ink, color: C.ink, lw: 1.6 }),
      (y) => tag(ctx, x, y, 'MyGO!!!!!', { size: 14, bg: '#fff', stroke: C.ink, color: C.ink, lw: 1.6 }),
    ];
    items.forEach((f, i) => {
      const u = E.outBack(seg(t, ts + 0.08 + i * 0.06, ts + 0.4 + i * 0.06));
      if (u <= 0) return;
      ctx.save(); ctx.translate(0, (1 - u) * 40); ctx.globalAlpha = clamp(u);
      f(330 + i * 64);
      ctx.restore();
    });
    const u = E.outCubic(seg(t, ts + 0.3, ts + 0.7));
    ctx.save(); ctx.globalAlpha = u;
    rect(ctx, x, 690, 300 * u, 92, '#fff');
    barcode(ctx, x + 14, 704, 272 * u, 52, 17, C.ink);
    txt(ctx, '4 589650 270127', x + 14, 772, { size: 11, fam: F.mono, weight: 500, track: 3, color: C.ink });
    txt(ctx, '壱雫空', x, 860, { font: font(700, 30, F.min), color: C.ink });
    txt(ctx, 'HITOSHIZUKU', x, 890, { size: 11, weight: 800, track: 6, color: rgba(C.ink, 0.75) });
    circle(ctx, 1830, 160, 10, C.sky);
    ctx.restore();
  }
  PV.def({ id: 3, t0: T3, draw: s03, ov: 'ink', name: 'OPENING' });

  /* ============================== SHOT 04 ============================== */
  const T4 = 5.665;
  const L3 = LYR[2];
  function bgWords(ctx, t, col, lw) {
    ctx.save();
    ctx.font = font(400, 400, F.disp);
    ctx.letterSpacing = '18px';
    ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const word = 'HITOSHIZUKU  ';
    const tw = ctx.measureText(word).width;
    for (let r = 0; r < 3; r++) {
      const y = -10 + r * 380;
      const sp = (r % 2 ? -1 : 1) * 34;
      let x = ((t * sp + r * 410) % tw) - tw;
      for (; x < W; x += tw) ctx.strokeText(word, x, y);
    }
    ctx.letterSpacing = '0px';
    ctx.restore();
  }
  function frameCircle(ctx, cx, cy, r, crop, o = {}) {
    if (r <= 1) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = o.bg || C.skyP; ctx.fill();
    ctx.clip();
    if (o.pattern) o.pattern(cx, cy, r);
    drawCrop(ctx, 'tomori', crop, cx - r, cy - r, 2 * r, 2 * r);
    ctx.restore();
    circle(ctx, cx, cy, r, null, o.ring || C.ink, o.lw || 3);
  }
  const CROPS = [[140, -20, 900, 740], [520, 300, 860, 640], [600, 1170, 940, 1530]];
  function s04(ctx, t) {
    const b6 = B(6), b7 = B(7), b8 = B(8);
    // background: white → sky (bar 7) → white (bar 8)
    const flip = E.inOutQuart(seg(t, b7 - 0.04, b7 + 0.1));
    const back = t >= b8 - 0.02;
    paper(ctx);
    if (!back && flip > 0) { rect(ctx, 0, 0, W, H * flip, C.sky); }
    // background giant hollow words
    const bwc = back ? rgba(C.sky, 0.45) : flip >= 1 ? 'rgba(255,255,255,0.75)' : rgba(C.sky, 0.45);
    bgWords(ctx, t, bwc, 2.4);
    // entry from right (from shot 03): fast wipe
    const ent = E.outExpo(seg(t, T4, T4 + 0.24));
    if (ent < 1) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * (1 - ent), H); ctx.clip();
      PV.drawShot(ctx, 3, t);
      ctx.restore();
      line(ctx, W * (1 - ent), 0, W * (1 - ent) - 120, H, C.ink, 3);
    }
    if (ent <= 0) return;
    // ---- left: frame(s) ----
    const a6 = antic(t, b6, 0.14, 0.4, 0.07); // bar6 snap
    const s7 = b7 - 0.13; // snap start: the outBack crossing lands on the bar-7 downbeat
    const k7 = E.outBack(seg(t, s7, s7 + 0.34), 1.3);
    const pre7 = t < s7 ? -0.05 * E.inOutQuad(seg(t, s7 - 0.12, s7)) : 0;
    const k8 = E.outExpo(seg(t, b8, b8 + 0.34));
    const pre8 = t < b8 ? 0.05 * E.inOutQuad(seg(t, b8 - 0.12, b8)) : 0;
    const R1 = 330 * (0.82 + 0.18 * a6);
    const ringT = 'HITOSHIZUKU ✦ MyGO!!!!! ✦ TOMORI TAKAMATSU ✦ VOCAL ✦ ';
    if (t < s7) {
      const cx = 600 - 40 * pre7 * 10, cy = 540;
      const r = R1 * (1 + pre7);
      frameCircle(ctx, cx, cy, r * ent, CROPS[0], { bg: C.skyP, pattern: (x, y, rr) => halftone(ctx, x - rr, y - rr, 2 * rr, 2 * rr, 16, 5, rgba(C.sky, 0.6), (u, v) => v) });
      ringText(ctx, ringT + ringT, cx, cy, r + 34, -Math.PI / 2 + t * 0.22, { size: 15, weight: 800, spacing: 3.2, color: C.ink });
      circle(ctx, cx, cy, r + 58, null, rgba(C.ink, 0.35), 1);
    } else {
      // one → three circles in a row (or small pager in bar 8)
      // drawn back-to-front so the half-body crop (i = 0) is on top: at the split it equals the single frame exactly
      for (let i = 2; i >= 0; i--) {
        const tx = 250 + i * 290, ty = 560, tr = 128;
        let cx = lerp(600, tx, k7), cy = lerp(540, ty, k7), r = lerp(R1 * (1 + pre7), tr, k7);
        if (t >= b8 - 0.12) {
          const sx = 128 + i * 92, sy = 900, sr = 38;
          const kk = clamp(k8 - pre8 * 3);
          cx = lerp(tx, sx, kk); cy = lerp(ty, sy, kk); r = lerp(tr, sr, kk) * (1 + pre8);
        }
        frameCircle(ctx, cx, cy, r, CROPS[i], { bg: i === 1 ? C.paper : C.skyP, ring: back ? C.ink : '#fff', lw: back ? 2 : 4 });
        if (i === 1) ringText(ctx, ringT + ringT, cx, cy, r + 22 * (r / 128), -Math.PI / 2 + t * 0.22, { size: 11 * Math.max(0.5, r / 128), weight: 800, spacing: 2.2, color: back ? C.ink : '#fff' });
      }
      if (!back) {
        txt(ctx, 'CROP  A / B / C', 122, 760, { size: 12, weight: 800, track: 4, color: '#fff' });
        ruler(ctx, 122, 790, 1000, 790, 44, 'rgba(255,255,255,0.8)', { small: 5, big: 12, major: 4 });
      }
    }
    // ---- right: lyric 3 (vertical, two columns) ----
    const sp = L3.chars.findIndex((c) => c.space);
    const hotCol = !back && flip >= 1 ? '#ffffff' : C.skyD;
    if (!back) {
      const size = 82;
      const ca = layoutV(L3, 1660, 150, { size, to: sp, lead: 1.05 });
      const cb = layoutV(L3, 1520, 150 + size * 0.5, { size, from: sp + 1, lead: 1.05 });
      const dy = 30 * (1 - E.outExpo(seg(t, T4, T4 + 0.4))) + (a6 - 1) * 20;
      const items = ca.items.concat(cb.items).map((it) => ({ ...it, y: it.y + dy }));
      drawKaraoke(ctx, L3, t, items, { vertical: true, fam: F.min, weight: 800, color: C.ink, stroke: C.ink, lw: 1.5, hot: hotCol,
        appear: (i) => E.outCubic(seg(t, T4 + 0.02 * i, T4 + 0.25 + 0.02 * i)) });
      line(ctx, 1590, 130, 1590, 950, flip >= 1 ? 'rgba(255,255,255,0.7)' : rgba(C.ink, 0.4), 1);
    } else {
      // bar 8: ひとしずく to the centre, the rest shrinks to a side column
      const w0 = L3.words[1]; // ひとしずく
      const size = 190;
      const lay = layoutH(ctx, L3, 930, 520, { size, fam: F.min, weight: 800, from: w0.i0, to: w0.i1, align: 'center', track: 6 });
      const intro = E.outExpo(seg(t, b8, b8 + 0.42));
      const items = lay.items.map((it, j) => ({ ...it, x: lerp(1660, it.x, intro), y: lerp(150 + (3 + j) * 86, it.y, intro), size: lerp(82, size, intro) }));
      drawKaraoke(ctx, L3, t, items, { fam: F.min, weight: 800, color: C.sky, stroke: C.sky, lw: 2, fillOverride: (i, c) => PV.fillOf(c, t) });
      // gloss
      const ga = E.outCubic(seg(t, b8 + 0.2, b8 + 0.5));
      ctx.save(); ctx.globalAlpha = ga;
      txt(ctx, '一滴', 930, 680, { font: font(600, 34, F.min), color: C.ink, align: 'center', track: 14 });
      line(ctx, 930 - 240 * ga, 640, 930 + 240 * ga, 640, C.ink, 1.2);
      txt(ctx, 'HITO · SHIZUKU  —  ONE DROP', 930, 384, { size: 13, weight: 800, track: 7, color: C.ink, align: 'center' });
      ctx.restore();
      // the rest: small vertical column at the right edge
      const rest = [];
      const sz = 40;
      let yy = 150, gapY = 0;
      L3.chars.forEach((c, i) => {
        if (i === w0.i0) { gapY = yy + sz * 0.55; yy += sz * 1.15; }
        if (i >= w0.i0 && i < w0.i1) return;
        if (c.space) { yy += sz * 0.7; return; }
        rest.push({ i, x: 1760, y: yy + sz / 2, size: sz }); yy += sz * 1.08;
      });
      const shrink = E.outExpo(seg(t, b8, b8 + 0.4));
      drawKaraoke(ctx, L3, t, rest.map((it) => ({ ...it, x: lerp(1600, it.x, shrink) })), { vertical: true, fam: F.min, weight: 700, color: C.ink, stroke: C.ink, lw: 1, hot: C.skyD });
      const gx = lerp(1600, 1760, shrink);
      rect(ctx, gx - 8, gapY - 8, 16, 16, C.sky);
      line(ctx, gx - 22, gapY, gx - 70 * shrink, gapY, C.sky, 2);
      line(ctx, 1712, 140, 1712, 940, rgba(C.ink, 0.5), 1);
    }
    // ---- bar 8: horizontal stripes sweeping across ----
    const sw = seg(t, b8 - 0.1, b8 + 0.5);
    if (sw > 0 && sw < 1) {
      const SW = [[90, 70, C.ink], [190, 24, C.sky], [250, 120, C.sky], [400, 14, C.ink], [450, 60, C.skyL], [560, 34, C.ink], [640, 150, C.sky], [820, 18, C.ink], [870, 80, C.skyL], [980, 40, C.ink]];
      SW.forEach(([y, h, c], i) => {
        const d = i * 0.025;
        const u = E.inOutQuart(seg(sw, d, d + 0.62));
        const x0 = lerp(-1400, W + 200, u);
        rect(ctx, x0, y, 1200, h, c);
      });
    }
  }
  PV.def({ id: 4, t0: T4, draw: s04, ov: (t) => (t >= B(7) && t < B(8) - 0.02 ? 'white' : 'ink'), name: 'OPENING' });

  /* ============================== SHOT 05 ============================== */
  const T5 = B(9);
  function s05(ctx, t) {
    paper(ctx);
    paperGrid(ctx, 1 - E.outCubic(seg(t, T5, T5 + 1.0)));
    const end = B(10, 4);
    const col = E.inExpo(seg(t, end, B(11) - 0.02)); // collapse to a point
    const sc = 1 - col;
    const cx = 960, cy = 540;
    // marquee bands (top + bottom)
    const bi = E.outExpo(seg(t, T5, T5 + 0.5));
    ctx.save(); // bands stop (frozen by the marquee clock) on the last beat, they do not fade
    ctx.save(); ctx.translate(-W * (1 - bi), 0); PV.marquee(ctx, 92, 46, C.ink, C.paper, t, { dir: 1 }); ctx.restore();
    ctx.save(); ctx.translate(W * (1 - bi), 0); PV.marquee(ctx, 942, 46, C.sky, C.ink, t, { dir: -1, phase: 300 }); ctx.restore();
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(Math.max(sc, 0.0001), Math.max(sc, 0.0001)); ctx.translate(-cx, -cy);
    // horizontal line with ticks & numbers
    const lp = E.outExpo(seg(t, T5 + 0.05, T5 + 0.6));
    line(ctx, cx - 960 * lp, cy, cx + 960 * lp, cy, C.sky, 2);
    ctx.beginPath();
    for (let x = 0; x <= W; x += 24) {
      if (Math.abs(x - cx) > 960 * lp) continue;
      const big = x % 120 === 0;
      ctx.moveTo(x, cy - (big ? 12 : 5)); ctx.lineTo(x, cy + (big ? 12 : 5));
    }
    ctx.strokeStyle = C.sky; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.font = font(600, 11, F.mono); ctx.fillStyle = C.ink; ctx.textAlign = 'center';
    for (let i = 0; i <= 16; i++) {
      const x = i * 120; if (Math.abs(x - cx) > 960 * lp || Math.abs(x - cx) < 360) continue;
      ctx.fillText(String(i + 1).padStart(2, '0'), x, cy + 32);
    }
    // big hollow circle drawn from a point (fast, slow settle)
    const cp = E.outExpo(seg(t, T5 + 0.08, T5 + 1.25));
    ctx.beginPath(); ctx.arc(cx, cy, 340, -Math.PI / 2, -Math.PI / 2 + TAU * cp);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
    if (cp > 0 && cp < 1) { const a = -Math.PI / 2 + TAU * cp; circle(ctx, cx + Math.cos(a) * 340, cy + Math.sin(a) * 340, 8, C.sky); }
    circle(ctx, cx, cy, 6, C.ink);
    // crossing marks
    [[cx - 340, 'A'], [cx + 340, 'B']].forEach(([x, l]) => {
      if (cp < 0.5) return;
      circle(ctx, x, cy, 9, C.paper, C.ink, 2);
      txt(ctx, l, x, cy - 22, { size: 12, weight: 800, color: C.ink, align: 'center' });
    });
    // lyric 3, second phrase, along the line inside the circle
    const sp = L3.chars.findIndex((c) => c.space);
    const lay = layoutH(ctx, L3, cx, cy - 70, { size: 58, fam: F.min, weight: 700, from: sp + 1, align: 'center', track: 4 });
    drawKaraoke(ctx, L3, t, lay.items, { fam: F.min, weight: 700, color: C.ink, stroke: C.ink, lw: 1.2, hot: C.skyD,
      appear: (i) => E.outCubic(seg(t, T5 + 0.05 + (i - sp) * 0.02, T5 + 0.35 + (i - sp) * 0.02)) });
    // first phrase as a small gloss under the line
    const lay2 = layoutH(ctx, L3, cx, cy + 74, { size: 22, fam: F.min, weight: 600, to: sp, align: 'center', track: 10 });
    drawKaraoke(ctx, L3, t, lay2.items, { fam: F.min, weight: 600, color: rgba(C.ink, 0.55), appear: () => E.outCubic(seg(t, T5 + 0.3, T5 + 0.7)) });
    txt(ctx, 'SAISHO NO HITOSHIZUKU NI', cx, cy + 112, { size: 10, weight: 700, track: 6, color: rgba(C.ink, 0.5 * lp), align: 'center' });
    ctx.restore();
    if (t >= B(11) - 0.03) circle(ctx, cx, cy, 6, C.ink);
    // previous layout slides out to the left, accelerating
    const so = seg(t, T5 - 0.001, T5 + 0.32);
    if (so < 1) {
      ctx.save(); ctx.translate(-W * 1.05 * E.inExpo(so), 0);
      PV.drawShot(ctx, 4, t);
      ctx.restore();
    }
  }
  PV.def({ id: 5, t0: T5, draw: s05, ov: 'ink', name: 'OPENING' });

  /* ============================== SHOT 06 ============================== */
  const T6 = B(11);
  function cover(ctx, t, x, y, S, o = {}) {
    // single sleeve, S = side length, top-left at x,y
    rect(ctx, x, y, S, S, '#FBFAF7');
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, S, S); ctx.clip();
    // pale sky quarter disc
    circle(ctx, x + S, y, S * 0.62, rgba(C.sky, 0.28));
    halftone(ctx, x, y + S * 0.55, S, S * 0.45, 13, 4.4, rgba(C.sky, 0.55), (u, v) => v * 0.9);
    // a small clear 3D umbrella leaning beside the title; the canopy is clean (no rain yet)
    if (!o.noUmb && PV.UMB.begin()) {
      const it = umb06(t, x, y, S);
      PV.UMB.shadow(ctx, it, { dx: 12, dy: 16, blur: (16 * S) / 560, color: 'rgba(27,42,71,0.18)' });
      PV.UMB.render(ctx, [it], { light: [-7, 9, 12] });
    }
    ctx.restore();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeRect(x, y, S, S);
    // title glyphs
    const ch = [
      { c: '壱', x: x + S * 0.2, y: y + S * 0.2, s: S * 0.22, tb: B(11, 2), dx: -500, dy: 0, hollow: true },
      { c: '雫', x: x + S * 0.37, y: y + S * 0.56, s: S * 0.5, tb: B(11, 3), dx: 0, dy: -600, hollow: false },
      { c: '空', x: x + S * 0.8, y: y + S * 0.62, s: S * 0.22, tb: B(11, 4), dx: 500, dy: 0, hollow: true },
    ];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const g of ch) {
      const u = seg(t, g.tb - 0.1, g.tb + 0.16);
      if (u <= 0) continue;
      const k = E.outBack(u, 1.6);
      const gx = g.x + g.dx * (1 - k), gy = g.y + g.dy * (1 - k);
      ctx.font = font(900, g.s, F.min);
      if (g.hollow) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeText(g.c, gx, gy);
        const f = seg(t, g.tb + 0.12, g.tb + 0.3);
        if (f > 0) {
          ctx.save(); ctx.beginPath(); ctx.rect(gx - g.s / 2, gy - g.s / 2, g.s, g.s * f); ctx.clip();
          ctx.fillStyle = C.ink; ctx.fillText(g.c, gx, gy); ctx.restore();
        }
      } else { ctx.fillStyle = C.ink; ctx.fillText(g.c, gx, gy); }
    }
    // romanised title + label
    const la = E.outCubic(seg(t, B(11, 3), B(11, 3.6)));
    ctx.save(); ctx.globalAlpha = la;
    txt(ctx, 'HITOSHIZUKU', x + S * 0.06, y + S * 0.86, { size: S * 0.026, weight: 800, track: S * 0.012, color: C.ink });
    ctx.restore();
    // MyGO!!!!! with five coloured marks
    const my = y + S * 0.93, mx = x + S * 0.06;
    ctx.font = font(900, S * 0.075, F.sans); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const mw = ctx.measureText('MyGO').width;
    ctx.save(); ctx.globalAlpha = E.outCubic(seg(t, B(11, 3.5), B(11, 4)));
    ctx.fillStyle = C.ink; ctx.fillText('MyGO', mx, my);
    ctx.restore();
    const ex = ['rana', 'anon', 'soyo', 'taki', 'tomori'];
    ex.forEach((m, i) => {
      const tb = B(11, 4.12) + i * 0.022;
      const u = seg(t, tb, tb + 0.11);
      if (u <= 0) return;
      const yy = my - 160 * (1 - E.outBounce(u));
      ctx.fillStyle = MEM[m].c; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.font = font(900, S * 0.075, F.sans);
      ctx.strokeText('!', mx + mw + 4 + i * S * 0.034, yy);
      ctx.fillText('!', mx + mw + 4 + i * S * 0.034, yy);
    });
  }
  // the sleeve's umbrella: leaning, turning slowly so the panels, ribs and highlight read as an object
  const umb06 = (t, x, y, S) => ({
    x: x + S * 0.775, y: y + S * 0.19, scale: S * 0.0019, tilt: 0.52, spin: 0.3 + (t - T6) * 0.6, roll: -0.4, open: 1,
    tint: '#8FCDEE', tintAmt: 0.3, rib: C.ink, handle: C.ink, seam: '#FFFFFF', seamA: 0.6,
  });
  E.outBounce = (x) => {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  };
  function vinyl(ctx, cx, cy, r, rot) {
    circle(ctx, cx, cy, r, '#16181d');
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    for (let rr = r * 0.42; rr < r * 0.97; rr += 5) { ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = r * 0.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, -0.5, -0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, Math.PI - 0.5, Math.PI - 0.15); ctx.stroke();
    circle(ctx, 0, 0, r * 0.34, C.sky);
    txt(ctx, 'MyGO!!!!!', 0, -r * 0.12, { size: r * 0.07, weight: 900, color: C.ink, align: 'center', track: 2 });
    txt(ctx, 'SIDE A · 33⅓', 0, r * 0.18, { size: r * 0.045, weight: 700, color: C.ink, align: 'center', track: 2 });
    circle(ctx, 0, 0, r * 0.035, '#16181d');
    ctx.restore();
  }
  function s06(ctx, t) {
    // grows from the point left by shot 05
    const g = E.outExpo(seg(t, T6, T6 + 0.3));
    // outside the growing circle: the frozen end of shot 05 (stopped bands, the point)
    if (g < 1) PV.drawShot(ctx, 5, T6 - 0.0005); else paper(ctx);
    ctx.save();
    ctx.beginPath(); ctx.arc(960, 540, 6 + 1200 * g, 0, TAU); ctx.clip();
    rect(ctx, 0, 0, W, H, C.sky);
    stripes(ctx, 0, 0, W, H, -0.785, 96, [30], 'rgba(255,255,255,0.32)', t * 40);
    // dots & stars scattered
    for (let i = 0; i < 26; i++) {
      const x = rnd(i, 1) * W, y = rnd(i, 2) * H;
      if (Math.abs(x - 960) < 420 && Math.abs(y - 540) < 380) continue;
      const bp = beatPulse(t + rnd(i, 3) * 0.3, 0.3, 2);
      if (i % 3 === 0) star4(ctx, x, y, (10 + rnd(i, 4) * 16) * (0.7 + 0.5 * bp), '#fff');
      else circle(ctx, x, y, 3 + rnd(i, 5) * 5, i % 2 ? '#fff' : C.ink);
    }
    const S = 560, cxv = 960, cyv = 540;
    const k = E.outBack(seg(t, T6, T6 + 0.32), 1.5);
    const oy = (1 - k) * 760;
    // ring text around the sleeve
    ctx.save(); ctx.globalAlpha = E.outCubic(seg(t, T6 + 0.1, T6 + 0.4));
    const RT = 'HITOSHIZUKU · MyGO!!!!! · HITOSHIZUKU · MyGO!!!!! · HITOSHIZUKU · MyGO!!!!! · ';
    ringText(ctx, RT, cxv, cyv + oy, 430, t * 0.35, { size: 17, weight: 800, spacing: 4.5, color: '#fff' });
    circle(ctx, cxv, cyv + oy, 456, null, 'rgba(255,255,255,0.6)', 1.2);
    ctx.restore();
    // record slides out from behind the sleeve
    const rs = E.outExpo(seg(t, B(11, 2) - 0.05, B(11, 3) + 0.1));
    vinyl(ctx, cxv + rs * 250, cyv + oy, 262, t * 3.2);
    // sleeve with drop shadow plate
    rect(ctx, cxv - S / 2 + 14, cyv - S / 2 + oy + 14, S, S, C.ink);
    cover(ctx, t, cxv - S / 2, cyv - S / 2 + oy, S);
    // corner sticker label
    const lu = E.outBack(seg(t, B(11, 2), B(11, 2) + 0.25), 2);
    if (lu > 0) {
      ctx.save(); ctx.translate(cxv - S / 2 + 6, cyv - S / 2 + oy + 10); ctx.rotate(-0.22); ctx.scale(lu, lu);
      tag(ctx, -40, 0, 'No.01', { size: 15, bg: C.sun, color: C.ink, stroke: C.ink, lw: 2 });
      ctx.restore();
    }
    ctx.restore();
    curtain(ctx, t);
  }
  PV.def({ id: 6, t0: T6, draw: s06, ov: 'white', name: 'TITLE' });
  PV.POSTER_T = 60.95;

  /* ============================== SHOT 07 · RANA ============================== */
  const T7 = B(12);
  const STR7 = [1120, 1255, 1390, 1525, 1660, 1795];
  function s07(ctx, t) {
    paper(ctx, '#FBFBF8');
    // green vertical stripes (segmented, scrolling down)
    const cols = [[60, 46], [150, 10], [190, 22], [300, 70], [420, 8], [470, 30], [610, 14], [700, 52], [860, 10], [900, 26], [1000, 64]];
    ctx.fillStyle = C.green;
    cols.forEach(([x, w], i) => {
      const len = 260 + rnd(i, 1) * 420, gap = 40 + rnd(i, 2) * 120, per = len + gap;
      const off = ((t * (40 + rnd(i, 3) * 30) + rnd(i, 4) * per) % per) - per;
      for (let y = off; y < H; y += per) ctx.fillRect(x, y, w, len);
    });
    // checker stickers
    const ck = (x, y, s, r, d) => {
      const u = E.outBack(seg(t, T7 + d, T7 + d + 0.25), 2);
      if (u <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.scale(u, u);
      rect(ctx, -s / 2 - 6, -s / 2 - 6, s + 12, s + 12, '#fff');
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(-s / 2 - 6, -s / 2 - 6, s + 12, s + 12);
      checker(ctx, -s / 2, -s / 2, s, s, s / 4, '#151515', '#fff');
      ctx.restore();
    };
    // giant hollow RANA (vertical), slides down on beat 2 (half a beat after the figure)
    const b2 = B(12, 2);
    const gk = E.outExpo(seg(t, b2 - 0.04, b2 + 0.34));
    const shake = (tb) => (t > tb ? Math.sin((t - tb) * 70) * 7 * Math.exp(-(t - tb) * 9) : 0);
    const jit = shake(B(12, 3)) + shake(B(12, 4));
    if (gk > 0) {
      ctx.save();
      ctx.font = font(400, 470, F.disp); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = C.green; ctx.lineWidth = 7; ctx.lineJoin = 'round';
      const letters = 'RANA';
      for (let i = 0; i < 4; i++) {
        const y = -150 + i * 395 - (1 - gk) * (900 + i * 120);
        // hollow letters: a white halo keeps the green outline clear of the stripes behind
        ctx.strokeStyle = '#FBFBF8'; ctx.lineWidth = 22; ctx.strokeText(letters[i], 900 + jit, y);
        ctx.strokeStyle = C.green; ctx.lineWidth = 7; ctx.strokeText(letters[i], 900 + jit, y);
      }
      ctx.restore();
    }
    // figure revealed strip by strip as each string is plucked (beat 1, left → right)
    const pl = STR7.map((x, i) => T7 + 0.02 + i * 0.04);
    ctx.save();
    ctx.beginPath();
    let any = false;
    STR7.forEach((x, i) => {
      const u = E.outExpo(seg(t, pl[i], pl[i] + 0.16));
      if (u <= 0) return;
      any = true;
      const hw = 68 * u + (i === STR7.length - 1 ? 200 * u : 0);
      ctx.rect(x - (i === 0 ? 260 * u : 68 * u), 0, (i === 0 ? 260 * u : 68 * u) + hw, H);
    });
    if (any) {
      ctx.clip();
      drawFigure(ctx, 'rana', 1790 + jit * 0.6, 2580, 2520, { sticker: true });
    }
    ctx.restore();
    // strings
    const strum = [B(12, 3), B(12, 4)];
    STR7.forEach((x, i) => {
      ctx.beginPath();
      for (let y = 0; y <= H; y += 12) {
        let dx = pluckX(t, pl[i], y, 16, i);
        strum.forEach((s, j) => { dx += pluckX(t, s + i * 0.018, y, 10, i + j); });
        y === 0 ? ctx.moveTo(x + dx, y) : ctx.lineTo(x + dx, y);
      }
      ctx.strokeStyle = '#3B3F46'; ctx.lineWidth = i < 3 ? 2.6 : 1.8; ctx.stroke();
    });
    ck(330, 840, 86, 0.18, 0.12);
    ck(1010, 170, 64, -0.2, 0.2);
    // instrument icons + tag
    const ia = E.outBack(seg(t, T7 + 0.15, T7 + 0.4));
    if (ia > 0) {
      icon(ctx, 'guitar', 150, 640, ia, C.green, C.ink);
      icon(ctx, 'pick', 230, 690, ia * 1.1, C.green, C.ink);
      icon(ctx, 'pick', 270, 640, ia * 0.8, '#fff', C.ink);
    }
    ctx.save(); ctx.translate(-300 * (1 - E.outExpo(seg(t, T7 + 0.05, T7 + 0.35))), 0);
    nameTag(ctx, 90, 960, 'rana');
    ctx.restore();
    txt(ctx, 'STRINGS × 6', 1120, 1000, { size: 11, weight: 800, track: 4, color: C.ink });
    curtain(ctx, t);
  }
  PV.def({ id: 7, t0: T7, draw: s07, ov: 'ink', name: '要楽奈 RANA' });

  /* ============================== SHOT 08 · ANON ============================== */
  const T8 = B(13);
  const BA = -0.42; // band angle
  function s08(ctx, t) {
    rect(ctx, 0, 0, W, H, C.coral);
    // white halftone, dense at one corner fading to the opposite
    halftone(ctx, 0, 0, W, H, 22, 9, 'rgba(255,255,255,0.75)', (u, v) => clamp(1.25 - (u * 0.75 + (1 - v) * 0.75)), 0.3);
    const drift = (t - T8) * 22;
    const dx = Math.cos(BA) * drift, dy = Math.sin(BA) * drift;
    ctx.save(); ctx.translate(dx, dy);
    // diagonal white band
    ctx.save(); ctx.translate(960, 560); ctx.rotate(BA);
    const bw = E.outExpo(seg(t, T8 - 0.02, T8 + 0.3));
    rect(ctx, -1400, -170 * bw, 2800, 340 * bw, '#fff');
    rect(ctx, -1400, -170 * bw - 18, 2800, 5, 'rgba(255,255,255,0.8)');
    rect(ctx, -1400, 170 * bw + 13, 2800, 5, 'rgba(255,255,255,0.8)');
    // ANON along the band (beneath the afterimages)
    const na = E.outExpo(seg(t, T8 + 0.04, T8 + 0.4));
    ctx.font = 'italic ' + font(900, 300, F.sans); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'italic ' + font(900, 400, F.sans);
    ctx.lineWidth = 9; ctx.strokeStyle = C.coral; ctx.strokeText('ANON', -40 + (1 - na) * -900, 14);
    ctx.fillStyle = '#fff'; ctx.fillText('ANON', -40 + (1 - na) * -900, 14);
    ctx.restore();
    // speed lines from the guitar-neck direction, one burst per beat
    for (let b = 0; b < 4; b++) {
      const tb = T8 + b * BEAT;
      const u = seg(t, tb, tb + 0.34);
      if (u <= 0 || u >= 1) continue;
      for (let i = 0; i < 7; i++) {
        const off = (rnd(b, i) - 0.5) * 300, len = 160 + rnd(b, i, 2) * 320;
        const d0 = 260 + E.outExpo(u) * 700 + rnd(b, i, 3) * 120;
        const ang = BA - 0.05;
        const sx = 1300 + Math.cos(ang) * d0 - Math.sin(ang) * off, sy = 330 + Math.sin(ang) * d0 + Math.cos(ang) * off;
        ctx.save(); ctx.globalAlpha = 1 - u;
        line(ctx, sx, sy, sx + Math.cos(ang) * len * (1 - u * 0.5), sy + Math.sin(ang) * len * (1 - u * 0.5), '#fff', 4 + rnd(b, i, 4) * 6);
        ctx.restore();
      }
    }
    // afterimages landing one by one, white → deeper, last one is the colour figure (lands on beat 3)
    const FX = 1010, FY = 980, FH = 820;
    const n = 5, land = B(13, 3);
    for (let k = 0; k <= n; k++) {
      const tk = T8 + 0.08 + (land - T8 - 0.08) * (k / n);
      const u = seg(t, tk - 0.1, tk + 0.12);
      if (u <= 0) continue;
      const back = (n - k) * 110;
      const px = FX - Math.cos(BA) * back, py = FY - Math.sin(BA) * back;
      const rise = (1 - E.outBack(u, 1.8)) * 130;
      ctx.save();
      if (k < n) {
        const col = mix('#FFFFFF', '#E0466A', (k / (n - 1)) * 0.75);
        ctx.globalAlpha = 0.95;
        drawFigure(ctx, 'anon', px, py - rise, FH, { canvas: silhouette('anon', col, true) });
      } else {
        drawFigure(ctx, 'anon', px, py - rise, FH, { sticker: true });
      }
      ctx.restore();
    }
    ctx.restore();
    // white star stickers popping in sequence
    const SP = [[180, 220, 46, 0.1], [520, 120, 30, -0.2], [1640, 760, 54, 0.3], [1780, 300, 34, 0.1], [300, 760, 40, -0.3], [1420, 160, 26, 0]];
    SP.forEach(([x, y, r, rot], i) => {
      const u = E.outBack(seg(t, T8 + 0.1 + i * 0.12, T8 + 0.3 + i * 0.12), 2.2);
      if (u <= 0) return;
      star5(ctx, x, y, r * u + 6, '#fff', rot, 0.45);
      star5(ctx, x, y, r * u, C.coral, rot, 0.45);
      star5(ctx, x, y, r * u * 0.62, '#fff', rot, 0.45);
    });
    const ia = E.outBack(seg(t, T8 + 0.15, T8 + 0.4));
    if (ia > 0) { icon(ctx, 'guitar', 1700, 520, ia, '#fff', '#C2344F'); icon(ctx, 'pick', 1790, 560, ia, C.coral, '#fff'); }
    ctx.save(); ctx.translate(300 * (1 - E.outExpo(seg(t, T8 + 0.05, T8 + 0.35))), 0);
    nameTag(ctx, 1460, 960, 'anon', { acc: '#fff', ink: '#B92D4A', bg: '#fff' });
    ctx.restore();
    curtain(ctx, t);
  }
  PV.def({ id: 8, t0: T8, draw: s08, ov: 'white', name: '千早愛音 ANON' });

  /* ============================== SHOT 09 · SOYO ============================== */
  const T9 = B(14);
  function s09(ctx, t) {
    const mid = 540;
    rect(ctx, 0, 0, W, mid, '#FBFAF6');
    rect(ctx, 0, mid, W, H - mid, C.yellow);
    // fine horizontal lines (top), concentric arcs (bottom)
    ctx.beginPath(); for (let y = 18; y < mid; y += 16) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.strokeStyle = rgba(C.warm, 0.38); ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(0, mid, W, H - mid); ctx.clip();
    ctx.beginPath(); for (let r = 40; r < 1200; r += 26) { ctx.moveTo(960 + r, mid); ctx.arc(960, mid, r, 0, Math.PI); }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    // four bass strings (thick lines) sinking a little every beat
    const sink = 9 * beatPulse(t, 0.18);
    [312, 392, 688, 768].forEach((y, i) => {
      rect(ctx, 0, y + sink - 4 - (i % 2), W, 8 + (i % 2) * 2, i < 2 ? '#6E655A' : '#8E7A55');
    });
    // symmetric side columns of dots and ticks
    for (const s of [-1, 1]) {
      const x = 960 + s * 300;
      for (let i = 0; i < 11; i++) {
        const y = 200 + i * 68;
        circle(ctx, x, y, i === 5 ? 7 : 4, i === 5 ? C.ink : rgba(C.ink, 0.6));
        line(ctx, x + s * 18, y, x + s * (i % 5 === 0 ? 46 : 30), y, rgba(C.ink, 0.6), 1.4);
      }
      txt(ctx, s < 0 ? 'L' : 'R', x, 160, { size: 12, weight: 800, track: 2, color: C.ink, align: 'center' });
    }
    // card unfolding from the split line (already in colour)
    const cw = 380, ch = 900;
    const u = E.outExpo(seg(t, T9 - 0.02, T9 + 0.34));
    const top = mid - (ch / 2) * u, bot = mid + (ch / 2) * u;
    if (u > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(960 - cw / 2, top, cw, bot - top); ctx.clip();
      rect(ctx, 960 - cw / 2, mid - ch / 2, cw, ch / 2, '#fff');
      rect(ctx, 960 - cw / 2, mid, cw, ch / 2, mix(C.yellow, '#ffffff', 0.35));
      ctx.beginPath(); for (let y = mid - ch / 2 + 20; y < mid; y += 16) { ctx.moveTo(960 - cw / 2, y); ctx.lineTo(960 + cw / 2, y); }
      ctx.strokeStyle = rgba(C.warm, 0.25); ctx.lineWidth = 1; ctx.stroke();
      drawFigure(ctx, 'soyo', 960, mid, 430, {});
      // reflection, half a beat later
      const ru = E.outCubic(seg(t, T9 + BEAT / 2, T9 + BEAT / 2 + 0.3));
      if (ru > 0) {
        ctx.save();
        ctx.globalAlpha = 0.42 * ru;
        ctx.translate(0, 2 * mid); ctx.scale(1, -1);
        drawFigure(ctx, 'soyo', 960, mid, 430, { canvas: PV.mono('soyo', '#B08A3E', '#FFF3D0') });
        ctx.restore();
      }
      ctx.restore();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.strokeRect(960 - cw / 2, top, cw, bot - top);
    }
    line(ctx, 0, mid, W, mid, C.ink, 1.5);
    // SOYO in thin hollow serif, vertical beside the card
    const sa = E.outCubic(seg(t, T9 + 0.1, T9 + 0.4));
    ctx.save(); ctx.globalAlpha = sa;
    ctx.font = font(400, 64, F.serif); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.3;
    'SOYO'.split('').forEach((c, i) => ctx.strokeText(c, 960 + cw / 2 + 52, 260 + i * 74));
    'SOYO'.split('').forEach((c, i) => ctx.strokeText(c, 960 - cw / 2 - 52, H - 260 - i * 74));
    ctx.restore();
    const ia = E.outBack(seg(t, T9 + 0.15, T9 + 0.4));
    if (ia > 0) { icon(ctx, 'bass', 300, 420, ia * 1.1, C.yellow, C.ink); icon(ctx, 'bass', 1620, 420, ia * 1.1, C.yellow, C.ink); }
    nameTag(ctx, 90, 960, 'soyo', { acc: C.yellow });
    txt(ctx, 'SYMMETRY / 4 STRINGS', W - 90, 960, { size: 11, weight: 800, track: 4, color: C.ink, align: 'right' });
    curtain(ctx, t);
  }
  PV.def({ id: 9, t0: T9, draw: s09, ov: 'ink', name: '長崎そよ SOYO' });

  /* ============================== SHOT 10 · TAKI ============================== */
  const T10 = B(15);
  // drum geometry in original image coords: [cx, cy, rx, ry]
  const RIMS = [[720, 815, 236, 236], [630, 430, 118, 22], [888, 450, 112, 20], [375, 538, 120, 20], [1040, 597, 108, 16], [720, 815, 205, 205]];
  const CYMS = [[383, 340, 205, 50, -0.12], [1213, 320, 190, 44, 0.06], [1290, 463, 140, 20, 0.02], [420, 488, 86, 14, 0.05]];
  function s10(ctx, t) {
    rect(ctx, 0, 0, W, H, C.indigoD);
    grid(ctx, 0, 0, W, H, 40, 'rgba(255,255,255,0.05)', 1);
    // ring groups
    [[260, 200, 5], [1700, 260, 4], [1500, 900, 3]].forEach(([x, y, n], j) => {
      for (let i = 0; i < n; i++) circle(ctx, x, y, 40 + i * 34 + (t - T10) * 18, null, 'rgba(255,255,255,0.14)', 1.2);
    });
    // drum kit placement
    const IW = 1460, s = IW / 1448, ox = 960 - IW / 2 + 15 * s, oy = 1100 - 1086 * s;
    const P = (x, y) => [ox + x * s, oy + y * s];
    const m = PV.META.taki;
    const dark = silhouette('taki', '#191838');
    ctx.drawImage(dark, ox + m.ox * s, oy + m.oy * s, m.w * s, m.h * s);
    // white edge highlights on rims and cymbals
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.4;
    RIMS.forEach(([x, y, rx, ry], i) => { const [px, py] = P(x, y); ctx.beginPath(); ctx.ellipse(px, py, rx * s, ry * s, 0, i === 0 || i === 5 ? 0 : Math.PI * 0.05, i === 0 || i === 5 ? TAU : Math.PI * 0.95); ctx.stroke(); });
    const e8 = Math.floor(beatPos(t) * 2);
    CYMS.forEach(([x, y, rx, ry, r], i) => {
      const [px, py] = P(x, y);
      const fl = (e8 + i) % 2 === 0 ? 1 : 0.35;
      ctx.globalAlpha = fl;
      ctx.beginPath(); ctx.ellipse(px, py, rx * s, ry * s, r, 0, TAU); ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    // circular window on the bass drum: colour crop of sticks + hands, then expands to full colour (beat 3)
    const [bx, by] = P(720, 815);
    const br = 236 * s;
    const open = E.outBack(seg(t, T10 - 0.09, T10 + 0.16), 1.6);
    const b3 = B(15, 3);
    const grow = E.outExpo(seg(t, b3 - 0.03, b3 + 0.4));
    const R = br * open + grow * 2300;
    if (R > 1) {
      ctx.save();
      ctx.beginPath(); ctx.arc(bx, by, R, 0, TAU); ctx.clip();
      if (grow <= 0) {
        rect(ctx, bx - R, by - R, 2 * R, 2 * R, mix(C.indigo, '#ffffff', 0.55));
        drawCrop(ctx, 'taki', [905, 10, 1295, 400], bx - br, by - br, 2 * br, 2 * br); // stick + raised hand + cymbal, no face
      } else {
        rect(ctx, 0, 0, W, H, mix(C.indigo, '#ffffff', 0.18));
        grid(ctx, 0, 0, W, H, 40, 'rgba(255,255,255,0.12)', 1);
        ctx.drawImage(PV.IMG.taki_st, ox + m.ox * s, oy + m.oy * s, m.w * s, m.h * s);
      }
      ctx.restore();
      circle(ctx, bx, by, R, null, '#fff', 3);
    }
    // per-beat thin ring from the window
    for (let b = 0; b < 4; b++) {
      const tb = T10 + b * BEAT, u = seg(t, tb, tb + 0.6);
      if (u <= 0 || u >= 1) continue;
      circle(ctx, bx, by, br + 20 + 420 * E.outCubic(u), null, `rgba(255,255,255,${0.7 * (1 - u)})`, 2);
    }
    // eighth-note squares at the top
    for (let i = 0; i < 8; i++) {
      const on = i <= Math.floor((beatPos(t) - beatPos(T10)) * 2);
      const x = 560 + i * 104;
      rect(ctx, x, 110, 64, 22, on ? (i % 2 ? C.indigo : '#fff') : 'rgba(255,255,255,0.08)');
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, 110.5, 63, 21);
    }
    // TAKI cut by a diagonal light
    const ta = E.outExpo(seg(t, T10 + 0.02, T10 + 0.3));
    ctx.save();
    ctx.font = font(400, 230, F.disp); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const tx = 96 - (1 - ta) * 600, ty = 420;
    const cutA = (x) => 0.0 + x * 1.2; // cut line y = ty-200 + ...
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(560, 0); ctx.lineTo(160, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillText('TAKI', tx, ty);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.moveTo(560, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(160, H); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillText('TAKI', tx + 14, ty - 18);
    ctx.restore();
    ctx.restore();
    // the light beam
    ctx.save(); ctx.globalAlpha = 0.85;
    const lg = ctx.createLinearGradient(380, 0, 560, 0);
    ctx.beginPath(); ctx.moveTo(552, -10); ctx.lineTo(570, -10); ctx.lineTo(170, H + 10); ctx.lineTo(152, H + 10); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.moveTo(500, -10); ctx.lineTo(640, -10); ctx.lineTo(240, H + 10); ctx.lineTo(100, H + 10); ctx.closePath(); ctx.fill();
    ctx.restore();
    const ia = E.outBack(seg(t, T10 + 0.15, T10 + 0.4));
    if (ia > 0) icon(ctx, 'drum', 1760, 560, ia * 1.2, C.indigo, '#fff');
    nameTag(ctx, W - 470, 190, 'taki', { acc: C.indigo, bg: C.indigoDD, ink: '#fff' });
    curtain(ctx, t);
  }
  PV.def({ id: 10, t0: T10, draw: s10, ov: 'white', name: '椎名立希 TAKI' });

  /* ============================== SHOT 11 · TOMORI ============================== */
  const T11 = B(16);
  function waveY(t, x, base) {
    const amp = 10 + 34 * beatPulse(t, 0.24);
    const flat = clamp((Math.abs(x - 960) - 90) / 260);
    const s = flat * flat * (3 - 2 * flat);
    return base + s * amp * (Math.sin(x * 0.021 + t * 9) * 0.65 + Math.sin(x * 0.047 - t * 13) * 0.35);
  }
  function s11(ctx, t) {
    paper(ctx, '#FBFBF9');
    const end = B(16, 4);
    const col = E.inExpo(seg(t, end, B(17) - 0.015));
    const sc = Math.max(0.0001, 1 - col);
    const cx = 960, cy = 540;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    const base = 650;
    const dp = E.inOutCubic(seg(t, T11 - 0.02, T11 + 0.55));
    const xEnd = dp * W;
    ctx.beginPath();
    for (let x = 0; x <= xEnd; x += 6) { const y = waveY(t, x, base); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = C.sky; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    if (dp < 1) circle(ctx, xEnd, waveY(t, xEnd, base), 6, C.sky);
    // outline traced upward from her feet, then colour fills in
    const reach = T11 - 0.02 + 0.55 * 0.5;
    const tr = E.outCubic(seg(t, reach, reach + 0.3));
    const fillU = E.outCubic(seg(t, reach + 0.22, reach + 0.45));
    const FH = 250;
    if (tr > 0) {
      const m = PV.META.tomori, s = FH / (m.h - 2 * PV.PADI);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - 200, base - FH * 1.1 * tr - 10, 400, FH * 1.1 * tr + 20); ctx.clip();
      drawFigure(ctx, 'tomori', cx, base, FH, { canvas: rim('tomori', C.sky) });
      ctx.restore();
      if (fillU > 0) { ctx.save(); ctx.globalAlpha = fillU; drawFigure(ctx, 'tomori', cx, base, FH, {}); ctx.restore(); }
    }
    // star above her head
    const sa = E.outBack(seg(t, reach + 0.35, reach + 0.55), 2.5);
    if (sa > 0) star4(ctx, cx + 8, base - FH - 46, 18 * sa * (0.85 + 0.3 * beatPulse(t, 0.2)), C.sky);
    // TOMORI tiny, widely tracked, below the wave
    const ta = E.outCubic(seg(t, reach + 0.3, reach + 0.6));
    ctx.save(); ctx.globalAlpha = ta;
    txt(ctx, 'TOMORI', cx + 9, base + 64, { size: 15, weight: 700, track: 18, color: C.ink, align: 'center' });
    ctx.restore();
    ctx.restore();
    if (col > 0.98) circle(ctx, cx, cy, 6, C.ink);
    ctx.save(); ctx.globalAlpha = 1 - col;
    const ia = E.outBack(seg(t, T11 + 0.15, T11 + 0.4));
    if (ia > 0) icon(ctx, 'mic', 1790, 900, ia, C.sky, C.ink);
    nameTag(ctx, 90, 960, 'tomori', { acc: C.sky });
    ctx.restore();
    curtain(ctx, t);
  }
  PV.def({ id: 11, t0: T11, draw: s11, ov: 'ink', name: '高松燈 TOMORI' });

  Object.assign(PV, { paper, paperGrid, ringsS02, frameCircle, vinyl, coverArt: cover, waveY });
})();
