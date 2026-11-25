/* Shot registry, the persistent layout layer (corner marks, timecode, shot no., metronome), marquee bands, film grain. */
'use strict';
(function () {
  const PV = window.PV;
  const { W, H, B, BEAT, C, MEM, E, seg, clamp, rgba, rnd, font, F, txt, rect, line, lerp } = PV;

  // ---------- shot registry ----------
  const SHOTS = PV.SHOTS = [];
  PV.def = (o) => { SHOTS.push(o); SHOTS.sort((a, b) => a.t0 - b.t0); };
  PV.shotAt = (t) => { let s = SHOTS[0]; for (const x of SHOTS) { if (t >= x.t0) s = x; else break; } return s; };
  PV.shot = (id) => SHOTS.find((s) => s.id === id);
  // draw another shot (for transitions)
  PV.drawShot = (ctx, id, t) => { const s = PV.shot(id); if (s) { ctx.save(); s.draw(ctx, t, s); ctx.restore(); } };

  // ---------- marquee ----------
  const RUNS = [[1.2215, B(10, 4)], [B(68, 3.5), 999]];
  PV.marqX = (t) => {
    let a = 0;
    for (const [s, e] of RUNS) { if (t > s) a += Math.min(t, e) - s; }
    return a;
  };
  const MQ = '  HITOSHIZUKU  ✦  MyGO!!!!!  ✦  ONE DROP OF SKY  ✦  壱雫空  ✦  TRACK 01  ✦  204 BPM ';
  const mqW = {};
  PV.marquee = function (ctx, y, h, bg, fg, t, o = {}) {
    const size = o.size || Math.round(h * 0.36);
    const fnt = font(o.weight || 700, size, F.sans);
    ctx.save();
    if (bg) rect(ctx, 0, y, W, h, bg);
    ctx.font = fnt; ctx.letterSpacing = size * 0.32 + 'px';
    const key = fnt + size;
    if (!mqW[key]) mqW[key] = ctx.measureText(MQ).width;
    const tw = mqW[key];
    const speed = o.speed || 95;
    let off = (PV.marqX(t) * speed * (o.dir || 1)) % tw;
    if (off < 0) off += tw;
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
    for (let x = -off - (o.phase || 0) % tw - tw; x < W + tw; x += tw) ctx.fillText(MQ, x, y + h / 2 + 1);
    ctx.letterSpacing = '0px';
    ctx.restore();
  };

  // ---------- persistent layout layer ----------
  const fmtTC = (t) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0');
  };
  const PRE_COL = [C.sky, MEM.rana.c, MEM.anon.c, MEM.soyo.c, MEM.taki.c, MEM.tomori.c];
  PV.overlay = function (ctx, t, s) {
    let theme = typeof s.ov === 'function' ? s.ov(t) : s.ov || 'ink';
    if (theme === 'none') return;
    const col = theme === 'white' ? 'rgba(255,255,255,0.88)' : theme === 'ink' ? rgba(C.ink, 0.86) : theme;
    const fade = s.ovAlpha ? s.ovAlpha(t) : 1;
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    // a soft halo in the opposite tone keeps the layer readable over any picture (figures, stripes, sky)
    ctx.shadowColor = theme === 'white' ? 'rgba(10,18,40,0.45)' : 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 5 * (PV.K || 1);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    const haloCol = theme === 'white' ? 'rgba(10,18,40,0.5)' : 'rgba(255,255,255,0.8)';
    // text with a crisp outline halo (invisible on like backgrounds, separates it from contrasting ones)
    const ft = (str, x, y) => { ctx.save(); ctx.strokeStyle = haloCol; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); ctx.restore(); ctx.fillText(str, x, y); };
    const M = 34, arm = 22;
    // corner marks, drawn outward from the corner point at the very start
    const cp = E.outCubic(seg(t, 0.1, 0.6));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[M, M, 1, 1], [W - M, M, -1, 1], [M, H - M, 1, -1], [W - M, H - M, -1, -1]]) {
      ctx.moveTo(cx + sx * arm * cp, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * arm * cp);
    }
    ctx.stroke();
    // tiny register crosses at mid edges
    const xp = E.outCubic(seg(t, 0.35, 0.8));
    ctx.beginPath();
    ctx.moveTo(W / 2 - 7 * xp, M); ctx.lineTo(W / 2 + 7 * xp, M); ctx.moveTo(W / 2, M - 7 * xp); ctx.lineTo(W / 2, M + 7 * xp);
    ctx.moveTo(W / 2 - 7 * xp, H - M); ctx.lineTo(W / 2 + 7 * xp, H - M); ctx.moveTo(W / 2, H - M - 7 * xp); ctx.lineTo(W / 2, H - M + 7 * xp);
    ctx.lineWidth = 1.2; ctx.stroke();

    // typed english label
    const L1 = 'HITOSHIZUKU', L2 = '/  MyGO!!!!!';
    const typed = Math.floor(seg(t, 0.22, 1.05) * (L1.length + L2.length + 1));
    ctx.font = font(800, 13, F.sans); ctx.letterSpacing = '5px'; ctx.fillStyle = col; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const a1 = L1.slice(0, Math.min(typed, L1.length));
    ft(a1, 68, 57);
    let w1 = ctx.measureText(L1).width;
    ctx.font = font(500, 13, F.sans);
    const a2 = typed > L1.length ? L2.slice(0, typed - L1.length - 1) : '';
    ft(a2, 68 + w1 + 14, 57);
    if (typed < L1.length + L2.length + 1 && t > 0.2) {
      const cw = typed <= L1.length ? ctx.measureText(a1).width + 4 : w1 + 14 + ctx.measureText(a2).width + 4;
      if (Math.floor(t * 12) % 2 === 0) rect(ctx, 68 + cw, 46, 8, 13, col);
    }
    ctx.letterSpacing = '0px';

    // shot number (top right)
    const sp = E.outCubic(seg(t, 0.3, 0.7));
    if (sp > 0) {
      ctx.globalAlpha = fade * sp;
      ctx.textAlign = 'right';
      ctx.font = font(500, 12, F.sans); ctx.letterSpacing = '4px';
      ft('/ 36', W - 68, 57);
      const wr = ctx.measureText('/ 36').width;
      ctx.font = font(800, 22, F.sans); ctx.letterSpacing = '1px';
      ft(String(s.id).padStart(2, '0'), W - 68 - wr - 10, 58);
      const wn = ctx.measureText(String(s.id).padStart(2, '0')).width;
      ctx.font = font(700, 11, F.sans); ctx.letterSpacing = '4px';
      ft('SHOT', W - 68 - wr - 10 - wn - 12, 57);
      ctx.letterSpacing = '0px';
      ctx.globalAlpha = fade;
    }

    // timecode (bottom left)
    let tc = t;
    if (t >= B(50, 4) - 0.03 && t < B(52)) tc = 58.54; // frozen through the silent bar
    if (t >= 81.25) tc = 81.43;
    const tp = E.outCubic(seg(t, 0.25, 0.65));
    ctx.globalAlpha = fade * tp;
    const blink = PV.beatPulse(t, 0.3);
    PV.circle(ctx, 72, 1036, 4.5, tc === t ? rgba(C.coral, 0.55 + 0.45 * blink) : col);
    ctx.font = font(500, 15, F.mono); ctx.textAlign = 'left'; ctx.fillStyle = col;
    ft(fmtTC(tc), 86, 1041);
    ctx.font = font(700, 10, F.sans); ctx.letterSpacing = '3px';
    ft('TC', 186, 1040);
    ctx.letterSpacing = '0px';

    // bar / beat (bottom right) + metronome in the prelude
    const bp = PV.beatPos(t);
    const barN = Math.max(1, Math.floor(bp / 4) + 1), beatN = Math.max(1, Math.floor(bp - (barN - 1) * 4) + 1);
    ctx.textAlign = 'right';
    ctx.font = font(700, 11, F.sans); ctx.letterSpacing = '3px';
    ft('BAR ' + String(barN).padStart(2, '0') + '  ·  ' + beatN, W - 68, 1040);
    const bw = ctx.measureText('BAR 00  ·  0').width;
    ctx.letterSpacing = '0px';
    if (t >= B(11) && t < B(17)) {
      const mc = PRE_COL[clamp(barN - 11, 0, 5)];
      const e8 = Math.floor((bp - (barN - 1) * 4) * 2);
      const x0 = W - 68 - bw - 26 - 8 * 15;
      for (let i = 0; i < 8; i++) {
        const on = i <= e8;
        if (on) {
          // solid cell in the overlay ink with the member colour inset: readable on any background
          rect(ctx, x0 + i * 15 - 0.5, 1028.5, 12, 12, col);
          rect(ctx, x0 + i * 15 + 2, 1031, 7, 7, mc);
        } else {
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(x0 + i * 15 + 0.5, 1029.5, 10, 10);
        }
      }
    }
    if (s.ovExtra) s.ovExtra(ctx, t, col);
    ctx.restore();
  };

  // ---------- carry-over subtitle ----------
  // Each lyric line has "home" shots where it is designed into the layout. When a line is still being
  // sung after its home shot has cut away (or starts with a pickup before it), a small strip keeps it readable.
  const HOME = { 1: [1, 2], 2: [3], 3: [4, 5], 4: [12], 5: [13], 6: [14], 7: [15], 8: [16], 9: [17], 10: [18, 19], 11: [20, 21],
    12: [21, 22, 23], 13: [23, 24], 14: [25, 26], 15: [26, 27], 16: [28, 29], 17: [30], 18: [31], 19: [32], 20: [33], 21: [34, 35, 36] };
  PV.carry = function (ctx, t, s) {
    let k = 0; // several lines can overlap (lead sustain + harmony): stack the strips upwards
    for (const L of PV.LY) {
      if (t < L.t + 0.02 || t > L.end + 0.15) continue; // no pre-roll: a carry strip only exists while the line is actually sounding
      if (HOME[L.id].includes(s.id)) continue;
      const a = clamp((t - (L.t + 0.02)) / 0.08) * (1 - clamp((t - L.end) / 0.15));
      const dark = (s.ovTheme || (typeof s.ov === 'function' ? s.ov(t) : s.ov)) === 'white';
      const y = 952 - k * 70; k++;
      ctx.save(); ctx.globalAlpha = a;
      const harm = L.kind === 'harm';
      const lay = PV.layoutH(ctx, L, 960, y, { size: harm ? 30 : 34, fam: harm ? F.got : F.min, weight: 700, align: 'center', track: harm ? 10 : 6, spaceW: 1, sx: harm ? 0.8 : 1 });
      rect(ctx, lay.x0 - 44, y - 30, lay.width + 88, 60, dark ? rgba(C.navy, 0.74) : 'rgba(255,255,255,0.86)');
      rect(ctx, lay.x0 - 44, y + 28, 46, 3, C.sky);
      PV.drawKaraoke(ctx, L, t, lay.items, { fam: harm ? F.got : F.min, weight: 700, color: dark ? '#fff' : C.ink,
        stroke: dark ? 'rgba(255,255,255,0.6)' : rgba(C.ink, 0.5), lw: 1, hot: C.sky, scaleX: harm ? 0.8 : 1 });
      ctx.restore();
    }
  };

  // ---------- grain ----------
  let grainCv = null;
  function mkGrain() {
    const n = 256, c = PV.mkCanvas(n, n), g = c.getContext('2d');
    const id = g.createImageData(n, n), p = id.data;
    for (let i = 0; i < n * n; i++) {
      const v = rnd(i, 911), a = rnd(i, 37);
      const white = v > 0.5;
      p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = white ? 255 : 0;
      p[i * 4 + 3] = Math.floor((white ? 0.11 : 0.085) * 255 * a * a);
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  PV.grain = function (ctx, t, s) {
    const amt = s && s.grain != null ? s.grain : 1;
    if (amt <= 0) return;
    if (!grainCv) grainCv = mkGrain();
    const f = Math.floor(t * 24);
    const pat = ctx.createPattern(grainCv, 'repeat');
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.floor(rnd(f, 1) * 256), Math.floor(rnd(f, 2) * 256)]));
    ctx.globalAlpha = amt;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  };
})();
