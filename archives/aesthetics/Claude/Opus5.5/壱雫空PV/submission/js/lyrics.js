/* Lyrics with per-character onset times (estimated from a pitch-salience analysis of the track,
   anchored to the LRC line starts) + karaoke rendering helpers. */
'use strict';
(function () {
  const PV = window.PV;
  const { clamp, seg, E, lerp, F, font, rgba } = PV;

  // kind | text with '|' word breaks | onset times for every non-space, non-small-kana char | phrase end
  const RAW = [
    ['main', 'もし|この|雨が|上がっても', '0.92 1.07 1.25 1.53 1.69 2.14 2.38 2.55 2.70 2.84 3.00', 3.36],
    ['main', '忘れずに|歩いてくよ', '3.36 3.79 3.92 4.03 4.24 4.82 5.10 5.40 5.49', 5.62],
    ['main', '最初の|ひとしずく|に| |顔|上げた|今日の|僕を', '5.67 6.30 6.62 7.13 7.30 7.47 7.72 7.90 8.06 8.66 9.07 9.25 9.55 9.80 9.95 10.13 10.36 10.93', 11.6],
    ['main', '透明な|傘で|作る| |ひとり分|だけの|世界', '18.86 19.24 19.68 19.97 20.35 20.69 21.02 21.13 21.22 21.62 21.88 22.10 22.33 22.40 22.63 22.81', 23.8],
    ['harm', '遮って|隠れた', '22.89 23.33 23.48 23.63 23.92 24.07', 24.4],
    ['main', 'そっと|逃げ込んで|いた', '24.535 24.58 24.64 24.96 25.09 25.40 25.54 25.68 26.01 26.32', 27.2],
    ['main', 'ビニール|越しの|空から', '27.62 27.79 27.92 28.04 28.50 28.64 28.73 28.91 29.36 29.65', 29.8],
    ['main', 'こぼれ|落ちる|音|響いて', '29.88 30.05 30.22 30.60 30.82 30.95 31.25 31.50 31.97 32.10', 33.15],
    ['harm', '弾けた|合図', '32.39 32.69 32.84 33.13 33.43', 34.0],
    ['main', '滲む|心へと|溶けた', '34.56 34.98 35.38 35.99 36.10 36.22 36.42 36.52', 36.7],
    ['main', '泣き|じゃくって|いる| |この|空と|いこう', '37.05 37.17 37.48 37.62 37.70 37.79 37.92 38.20 38.52 38.70 38.92 39.96 40.29 40.53 40.92', 42.1],
    ['harm', 'アスファルト|染めていく| |溢れ出した|スコール', '41.87 42.07 42.27 42.47 42.67 42.87 43.07 43.27 43.47 43.67 44.04 44.44 44.64 44.84 45.04 45.24 45.44 45.64 45.84', 46.2],
    ['main', '通り|過ぎる|時を| |待つ|だけ|じゃなくて', '46.55 47.04 47.33 47.44 47.59 47.89 48.33 49.03 49.26 49.37 49.68 49.82 49.98 50.25 50.68', 50.9],
    ['main', '僕は|見つめて|いたいんだよ', '51.05 51.62 51.82 52.20 52.46 52.74 53.07 53.34 53.70 54.23 54.55 54.90', 55.15],
    ['main', '無色でも|そこに|あるもの', '55.45 55.71 55.99 56.09 56.28 56.45 56.60 56.74 56.87 57.31 57.62', 57.95],
    ['main', 'この|雨が|上がってく|時', '58.54 59.18 59.38 60.04 60.45 60.62 60.74 60.85 61.28 61.44', 61.85],
    ['main', 'なにも|なかった|ように', '62.16 62.49 62.61 62.77 62.91 63.08 63.24 63.70 63.90 64.24', 64.5],
    ['main', '消えてく|傘花|みたいに|心は', '64.54 64.87 65.14 65.27 65.53 65.91 66.31 66.43 66.62 66.99 67.44 68.36', 68.9],
    ['main', '上手に|折り畳め|ないから', '69.05 69.22 69.53 69.87 69.95 70.12 70.54 70.67 70.85 71.06 71.28', 71.55],
    ['main', '過ぎ去って|しまう|瞬間を', '71.53 71.89 72.00 72.08 72.15 72.44 72.62 72.84 73.03 73.71 74.08', 74.4],
    ['main', '僕は|あつめたいよ| |ああ| |ひとしずくを', '74.95 75.41 75.59 75.76 76.23 76.31 76.63 76.96 77.30 77.77 78.17 78.37 78.66 78.92 79.14 79.39', 80.0],
  ];
  const SMALL = 'ゃゅょぁぃぅぇぉャュョァィゥェォ';

  const LY = RAW.map(([kind, src, ts, end], li) => {
    const times = ts.split(/\s+/).map(Number);
    const chars = [], words = [];
    let k = 0, wi = -1;
    for (const part of src.split('|')) {
      if (part === ' ') { chars.push({ ch: ' ', t: null, space: true, w: -1 }); continue; }
      wi = words.length;
      const w = { i0: chars.length, i1: chars.length + part.length, text: part };
      words.push(w);
      for (const ch of part) {
        let t;
        if (SMALL.includes(ch)) t = chars.length ? chars[chars.length - 1].t : times[k];
        else t = times[k++];
        chars.push({ ch, t, w: wi });
      }
    }
    if (k !== times.length) console.warn('lyric time count mismatch line', li + 1, k, times.length);
    // char end times
    const real = chars.filter((c) => !c.space);
    real.forEach((c, i) => { c.te = i + 1 < real.length ? Math.max(c.t, real[i + 1].t) : end; });
    words.forEach((w, i) => { w.t = chars[w.i0].t; w.te = i + 1 < words.length ? words[i + 1].t : end; });
    return { id: li + 1, kind, chars, words, text: chars.map((c) => c.ch).join(''), t: times[0], end };
  });

  const FILL = 0.085;
  const fillOf = (c, t) => (c.t == null ? 0 : clamp((t - c.t) / FILL));
  // 1 while the char's word is the word being sung, fading after it ends
  function hotOf(line, c, t) {
    if (c.w < 0) return 0;
    const w = line.words[c.w];
    if (t < w.t) return 0;
    if (t < w.te) return 1;
    return Math.max(0, 1 - (t - w.te) / 0.22);
  }

  // vertical glyph handling
  const ROT_V = 'ー～〜（）()「」『』—―…';
  function drawGlyph(ctx, ch, x, y, size, vertical, mode) {
    let dx = 0, dy = 0, rot = 0;
    if (vertical) {
      if (ROT_V.includes(ch)) rot = Math.PI / 2;
      else if (SMALL.includes(ch) || 'っッ'.includes(ch)) { dx = size * 0.1; dy = -size * 0.1; }
      else if ('、。'.includes(ch)) { dx = size * 0.55; dy = -size * 0.55; }
    }
    if (rot) { ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(rot); if (mode === 's') ctx.strokeText(ch, 0, 0); else ctx.fillText(ch, 0, 0); ctx.restore(); }
    else if (mode === 's') ctx.strokeText(ch, x + dx, y + dy); else ctx.fillText(ch, x + dx, y + dy);
  }

  /* Draw positioned karaoke chars.
     items: [{i, x, y, size, rot, sx}] (x,y = glyph centre)
     st: {fam, weight, color, stroke, lw, hollowA, hot, vertical, appear(i,item)->0..1, fillDir:'h'|'v', fillOverride(i)->0..1,
          shadow, scaleX} */
  function drawKaraoke(ctx, line, t, items, st) {
    const fam = st.fam || F.min, weight = st.weight || 600;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const it of items) {
      const c = line.chars[it.i];
      if (!c || c.space) continue;
      const a = st.appear ? st.appear(it.i, it) : 1;
      if (a <= 0.001) continue;
      const size = it.size;
      ctx.font = font(weight, size, fam);
      let f = st.fillOverride ? st.fillOverride(it.i, c) : fillOf(c, t);
      const hot = st.hot ? hotOf(line, c, t) : 0;
      ctx.save();
      ctx.translate(it.x, it.y);
      if (it.rot) ctx.rotate(it.rot);
      const sx = it.sx || st.scaleX || 1;
      if (sx !== 1 || it.sy) ctx.scale(sx, it.sy || 1);
      ctx.globalAlpha = a * (it.alpha == null ? 1 : it.alpha);
      // hollow placeholder
      if (st.stroke && f < 1) {
        ctx.strokeStyle = st.stroke;
        ctx.lineWidth = it.lw || st.lw || Math.max(1, size / 34);
        const ha = st.hollowA == null ? 1 : st.hollowA;
        if (ha < 1) ctx.globalAlpha = a * ha * (it.alpha == null ? 1 : it.alpha);
        drawGlyph(ctx, c.ch, 0, 0, size, st.vertical, 's');
        ctx.globalAlpha = a * (it.alpha == null ? 1 : it.alpha);
      }
      if (f > 0) {
        const col = hot > 0 && st.hot ? (hot >= 1 ? st.hot : PV.mix(st.color, st.hot, hot)) : st.color;
        ctx.fillStyle = col;
        if (f < 1) {
          ctx.save();
          ctx.beginPath();
          const s = size * 0.62;
          if (st.fillDir === 'v' || (st.vertical && st.fillDir !== 'h')) ctx.rect(-s, -s, 2 * s, 2 * s * f);
          else ctx.rect(-s, -s, 2 * s * f, 2 * s);
          ctx.clip();
          drawGlyph(ctx, c.ch, 0, 0, size, st.vertical, 'f');
          ctx.restore();
        } else drawGlyph(ctx, c.ch, 0, 0, size, st.vertical, 'f');
        if (st.hotMark && hot > 0) st.hotMark(ctx, c, size, hot);
      }
      ctx.restore();
    }
  }

  // horizontal layout (returns items + total width); o: {size, fam, weight, track, align:'left'|'center'|'right', spaceW, from, to}
  function layoutH(ctx, line, x, y, o) {
    const size = o.size, fam = o.fam || F.min, weight = o.weight || 600;
    ctx.font = font(weight, size, fam);
    const track = o.track || 0;
    const from = o.from || 0, to = o.to == null ? line.chars.length : o.to;
    const adv = [];
    let total = 0;
    for (let i = from; i < to; i++) {
      const c = line.chars[i];
      const w = c.space ? size * (o.spaceW == null ? 0.6 : o.spaceW) : ctx.measureText(c.ch).width * (o.sx || 1) + track;
      adv.push(w); total += w;
    }
    if (to > from && !line.chars[to - 1].space) total -= track;
    let cx = x;
    if (o.align === 'center') cx = x - total / 2; else if (o.align === 'right') cx = x - total;
    const items = [];
    for (let i = from; i < to; i++) {
      const w = adv[i - from];
      const vis = w - (line.chars[i].space ? 0 : track);
      items.push({ i, x: cx + vis / 2, y, size, sx: o.sx });
      cx += w;
    }
    return { items, width: total, x0: items.length ? items[0].x : x };
  }
  // vertical layout: o: {size, gap(=lead factor), from, to, spaceGap}
  function layoutV(line, x, y, o) {
    const size = o.size, lead = o.lead || 1.04;
    const from = o.from || 0, to = o.to == null ? line.chars.length : o.to;
    const items = [];
    let cy = y + size / 2;
    for (let i = from; i < to; i++) {
      const c = line.chars[i];
      if (c.space) { cy += size * (o.spaceGap == null ? 0.5 : o.spaceGap); continue; }
      items.push({ i, x, y: cy, size });
      cy += size * lead;
    }
    return { items, height: cy - y - size * (lead - 1) - size / 2 + size / 2 };
  }
  // char index of first space (phrase split)
  const splitAt = (line) => line.chars.findIndex((c) => c.space);
  // is any part of the line being sung/visible
  const progress = (line, t) => clamp((t - line.t) / (line.end - line.t));
  const sungCount = (line, t) => line.chars.filter((c) => !c.space && c.t != null && t >= c.t).length;
  const wordAt = (line, t) => line.words.findIndex((w) => t >= w.t && t < w.te);

  PV.LY = LY;
  Object.assign(PV, { drawKaraoke, layoutH, layoutV, fillOf, hotOf, splitAt, progress, sungCount, wordAt, drawGlyph, FILL });
})();
