/* 壱雫空 PV — core: timing grid, easing, deterministic random, palette, images, shared drawing primitives.
   Everything rendered is a pure function of song time t (seconds). */
'use strict';
(function () {
  const PV = window.PV = window.PV || {};
  const W = 1920, H = 1080;
  const BEAT = 60 / 204, BAR = BEAT * 4, T0 = 0.045, DUR = 81.4;
  const B = (n, k = 1) => T0 + (n - 1) * BAR + (k - 1) * BEAT;
  const beatPos = (t) => (t - T0) / BEAT;            // 0 = bar 1 beat 1
  const barOf = (t) => Math.floor((t - T0) / BAR) + 1;

  // ---------- math / easing ----------
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    lin: (x) => x,
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inQuart: (x) => x * x * x * x,
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    inOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
    outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
    inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
    outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
    smooth: (x) => x * x * (3 - 2 * x),
    // fast in, slow settle with a small overshoot
    snap: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -11 * x) * Math.cos(x * 7.5) * (1 - x * 0.4)),
  };
  const ease = (t, a, b, fn = E.outCubic) => fn(seg(t, a, b));
  // anticipation: small reverse move before snapping (returns value in about [-amt, 1])
  const antic = (t, tb, pre = 0.12, post = 0.32, amt = 0.08) => {
    // the snap starts early enough that the overshoot first reaches the target exactly on the beat tb
    const ts = tb - post * 0.42;
    if (t < ts - pre) return 0;
    if (t < ts) { const u = seg(t, ts - pre, ts); return -amt * Math.sin(u * Math.PI * 0.5); }
    const u = seg(t, ts, ts + post);
    return lerp(-amt, 1, E.outBack(u, 1.4));
  };
  // decaying pulse after time tb
  const pulse = (t, tb, dur = 0.25) => (t < tb ? 0 : Math.exp(-((t - tb) / dur) * 3.2));
  // beat pulse of the grid (most recent beat), returns 0..1
  const beatPulse = (t, dur = 0.22, sub = 1) => {
    const p = beatPos(t) * sub; if (p < 0) return 0;
    const f = p - Math.floor(p);
    return Math.exp(-(f * BEAT / sub) / dur * 3.2);
  };

  // ---------- deterministic random ----------
  function hash32(n) {
    n = (n | 0) ^ 0x9e3779b9;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    n ^= n >>> 16;
    return n >>> 0;
  }
  const rnd = (i, j = 0, k = 0) => hash32((i | 0) * 73856093 ^ (j | 0) * 19349663 ^ (k | 0) * 83492791) / 4294967296;
  const rndr = (a, b, i, j, k) => a + (b - a) * rnd(i, j, k);

  // ---------- palette ----------
  const C = {
    paper: '#F5F3EE', paper2: '#ECEAE4', fog: '#EEF2F4',
    ink: '#1B2A47', ink2: '#2B3C5E', navy: '#0D1730', navy2: '#13213F',
    sky: '#77BBDD', skyL: '#BFE0F0', skyP: '#E3F1F8', skyD: '#3C8FC4',
    blue: '#2E9BEA', blueL: '#66C1FF', blueD: '#1677C8',
    sun: '#FFC83D', sunL: '#FFE08A', sunD: '#F5A623',
    coral: '#FF8899', green: '#77DD77', yellow: '#FFDD88', indigo: '#7777AA',
    indigoD: '#23224A', indigoDD: '#17163A',
    gray: '#8D929B', grayL: '#C9CCD1', warm: '#B9AF9F', white: '#FFFFFF', black: '#111111',
  };
  const MEM = {
    rana: { c: '#77DD77', name: '要楽奈', rom: 'RANA', full: 'RANA KANAME', part: 'Gt.', no: '01', ini: 'R' },
    anon: { c: '#FF8899', name: '千早愛音', rom: 'ANON', full: 'ANON CHIHAYA', part: 'Gt.', no: '02', ini: 'A' },
    soyo: { c: '#FFDD88', name: '長崎そよ', rom: 'SOYO', full: 'SOYO NAGASAKI', part: 'Ba.', no: '03', ini: 'S' },
    taki: { c: '#7777AA', name: '椎名立希', rom: 'TAKI', full: 'TAKI SHIINA', part: 'Dr.', no: '04', ini: 'T' },
    tomori: { c: '#77BBDD', name: '高松燈', rom: 'TOMORI', full: 'TOMORI TAKAMATSU', part: 'Vo.', no: '05', ini: 'T' },
  };
  const ORDER = ['rana', 'anon', 'soyo', 'taki', 'tomori'];
  const HARM = ['rana', 'anon', 'soyo', 'taki'];

  function hexRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a = 1) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const mix = (h1, h2, t) => {
    const a = hexRgb(h1), b = hexRgb(h2);
    const c = a.map((v, i) => Math.round(lerp(v, b[i], clamp(t))));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const desat = (hex, amt, toward = '#E9EEF2') => mix(hex, toward, amt);

  // ---------- fonts ----------
  const F = {
    min: '"Source Han Serif", "Source Han Serif JP", "Noto Serif JP", "Yu Mincho", "MS PMincho", serif',
    got: '"Yu Gothic", "YuGothic", "Zen Kaku Gothic New", "Meiryo", sans-serif',
    sans: '"Montserrat", "Inter", "Segoe UI", Arial, sans-serif',
    cond: '"Roboto Condensed", "Oswald", "Bahnschrift Condensed", "Arial Narrow", sans-serif',
    disp: '"Anton", "Bebas Neue", Impact, sans-serif',
    serif: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace',
  };
  const font = (w, size, fam) => `${w} ${size}px ${fam}`;

  // ---------- images ----------
  const IMG = {};
  const META = (window.PV_DATA && window.PV_DATA.meta) || {};
  function loadImages() {
    const src = window.PV_DATA.img;
    const ps = Object.keys(src).map((k) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        (im.decode ? im.decode().catch(() => 0) : Promise.resolve()).then(() => {
          // keep a fully decoded bitmap copy: drawing from a canvas avoids decode-cache variance (same time → same pixels)
          const c = document.createElement('canvas');
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          c.getContext('2d').drawImage(im, 0, 0);
          IMG[k] = c;
          res();
        });
      };
      im.onerror = () => { console.warn('img fail', k); res(); };
      im.src = src[k];
    }));
    return Promise.all(ps);
  }
  // source rect (in processed image coords) from original-image coords
  const SR = (name, x0, y0, x1, y1) => { const m = META[name]; return [x0 - m.ox, y0 - m.oy, x1 - x0, y1 - y0]; };
  // full content box (processed image coords minus padding)
  const PADI = 28;
  const fullBox = (name) => { const m = META[name]; return [PADI, PADI, m.w - 2 * PADI, m.h - 2 * PADI]; };

  // cache of tinted / derived canvases
  const _cache = new Map();
  function cached(key, make) {
    let v = _cache.get(key);
    if (!v) { v = make(); _cache.set(key, v); }
    return v;
  }
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  // solid-colour silhouette of an image (optionally sticker = with outline)
  function silhouette(name, color, sticker = false) {
    return cached('sil|' + name + '|' + color + '|' + sticker, () => {
      const im = IMG[sticker ? name + '_st' : name];
      const c = mkCanvas(im.width, im.height), g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      return c;
    });
  }
  // duotone-ish monochrome (luminance mapped between dark and light colour)
  function mono(name, dark, light, sticker = false) {
    return cached('mono|' + name + dark + light + sticker, () => {
      const im = IMG[sticker ? name + '_st' : name];
      const c = mkCanvas(im.width, im.height), g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
      const a = hexRgb(dark), b = hexRgb(light);
      for (let i = 0; i < p.length; i += 4) {
        if (!p[i + 3]) continue;
        let l = (p[i] * 0.3 + p[i + 1] * 0.55 + p[i + 2] * 0.15) / 255;
        l = clamp((l - 0.12) / 0.8);
        l = l * l * (3 - 2 * l);
        p[i] = a[0] + (b[0] - a[0]) * l; p[i + 1] = a[1] + (b[1] - a[1]) * l; p[i + 2] = a[2] + (b[2] - a[2]) * l;
      }
      g.putImageData(d, 0, 0);
      return c;
    });
  }
  // outline only (sticker rim minus figure), tinted
  function rim(name, color) {
    return cached('rim|' + name + color, () => {
      const st = IMG[name + '_st'], im = IMG[name];
      const c = mkCanvas(st.width, st.height), g = c.getContext('2d');
      g.drawImage(st, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(im, 0, 0);
      return c;
    });
  }

  // draw an image (or canvas) so that source rect sr maps to dest rect, with optional anchor helpers
  function drawImg(ctx, im, sr, dx, dy, dw, dh) {
    if (!im) return;
    if (sr) ctx.drawImage(im, sr[0], sr[1], sr[2], sr[3], dx, dy, dw, dh);
    else ctx.drawImage(im, dx, dy, dw, dh);
  }
  // draw whole character scaled to content height h, anchored at (x = horizontal centre of content, y = feet)
  function drawFigure(ctx, name, x, yFeet, h, opt = {}) {
    const m = META[name];
    const im = opt.canvas || IMG[opt.sticker ? name + '_st' : name];
    const s = h / (m.h - 2 * PADI);
    const w = m.w * s, hh = m.h * s;
    ctx.drawImage(im, x - w / 2, yFeet - hh + PADI * s, w, hh);
    return { s, x0: x - w / 2, y0: yFeet - hh + PADI * s, w, h: hh };
  }
  // draw a crop given in original coords into dest rect (cover-fit)
  function drawCrop(ctx, name, orig, dx, dy, dw, dh, opt = {}) {
    const im = opt.canvas || IMG[opt.sticker ? name + '_st' : name];
    const [x0, y0, x1, y1] = orig;
    let sw = x1 - x0, sh = y1 - y0;
    const ar = dw / dh;
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (sw / sh > ar) sw = sh * ar; else sh = sw / ar;
    const m = META[name];
    ctx.drawImage(im, cx - sw / 2 - m.ox, cy - sh / 2 - m.oy, sw, sh, dx, dy, dw, dh);
  }

  // ---------- shared drawing primitives ----------
  const TAU = Math.PI * 2;
  function rect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  function circle(ctx, x, y, r, fill, stroke, lw) {
    if (r <= 0) return;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function line(ctx, x1, y1, x2, y2, color, lw = 1) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function grid(ctx, x, y, w, h, step, color, lw = 1, ox = 0, oy = 0) {
    ctx.beginPath();
    let sx = x + (((ox % step) + step) % step);
    for (let gx = sx; gx <= x + w; gx += step) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); }
    let sy = y + (((oy % step) + step) % step);
    for (let gy = sy; gy <= y + h; gy += step) { ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  }
  // parallel stripes inside a clip rect; widths cycles; angle in radians (0 = vertical stripes moving along x)
  function stripes(ctx, x, y, w, h, angle, period, widths, color, offset = 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2 + period;
    ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.fillStyle = color;
    const n = Math.ceil((2 * R) / period) + 2;
    const off = ((offset % period) + period) % period;
    for (let i = -1; i < n; i++) {
      const sw = widths[((i % widths.length) + widths.length) % widths.length];
      const sx = -R + i * period + off;
      ctx.fillRect(sx, -R, sw, 2 * R);
    }
    ctx.restore();
  }
  // halftone dots on a lattice, radius from fn(u,v) in 0..1 where u,v normalised positions
  function halftone(ctx, x, y, w, h, step, rmax, color, fn, angle = 0, drift = 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = color;
    ctx.beginPath();
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2 + step;
    const ph = ((drift % step) + step) % step; // lattice offset (slow flowing dots)
    for (let gy = -R - step + ph; gy <= R; gy += step) {
      for (let gx = -R; gx <= R; gx += step) {
        const px = cx + gx * ca - gy * sa, py = cy + gx * sa + gy * ca;
        if (px < x - step || px > x + w + step || py < y - step || py > y + h + step) continue;
        const r = rmax * fn((px - x) / w, (py - y) / h);
        if (r > 0.25) { ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, TAU); }
      }
    }
    ctx.fill();
    ctx.restore();
  }
  // four-point sparkle star
  function star4(ctx, x, y, r, color, rot = 0, thin = 0.18) {
    if (r <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    const k = r * thin;
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(k, -k, r, 0);
    ctx.quadraticCurveTo(k, k, 0, r);
    ctx.quadraticCurveTo(-k, k, -r, 0);
    ctx.quadraticCurveTo(-k, -k, 0, -r);
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  function star5(ctx, x, y, r, color, rot = 0, inner = 0.45, stroke, lw) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
      i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    if (color) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
    ctx.restore();
  }
  function checker(ctx, x, y, w, h, cell, c1 = '#111', c2 = '#fff') {
    ctx.fillStyle = c2; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = c1;
    for (let j = 0; j * cell < h - 0.01; j++)
      for (let i = 0; i * cell < w - 0.01; i++)
        if ((i + j) % 2 === 0) ctx.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell));
  }
  function barcode(ctx, x, y, w, h, seed, color) {
    ctx.fillStyle = color;
    let cx = x, i = 0;
    while (cx < x + w) {
      const bw = 1 + Math.floor(rnd(seed, i) * 4) * 1.5;
      if (i % 2 === 0) ctx.fillRect(cx, y, Math.min(bw, x + w - cx), h);
      cx += bw + (i % 2 ? 0 : 1 + rnd(seed, i, 7) * 2.5);
      i++;
    }
  }
  function tape(ctx, x, y, w, h, angle, color, seed = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath();
    const n = 7;
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    for (let i = 1; i <= n; i++) ctx.lineTo(w / 2 + (i % 2 ? -3 : 2) * (0.6 + rnd(seed, i)), -h / 2 + (h * i) / n);
    ctx.lineTo(-w / 2, h / 2);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? 3 : -2) * (0.6 + rnd(seed, i, 3)), -h / 2 + (h * i) / n);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  // capsule tag
  function tag(ctx, x, y, text, o = {}) {
    const size = o.size || 15;
    ctx.font = font(o.weight || 700, size, o.fam || F.sans);
    ctx.letterSpacing = (o.track != null ? o.track : 0.12 * size) + 'px';
    const tw = ctx.measureText(text).width;
    const padx = o.padx || size * 0.9, h = o.h || size * 2;
    const w = tw + padx * 2;
    let bx = x;
    if (o.align === 'right') bx = x - w; else if (o.align === 'center') bx = x - w / 2;
    rrect(ctx, bx, y - h / 2, w, h, o.radius != null ? o.radius : h / 2);
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fill(); }
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1.5; ctx.stroke(); }
    ctx.fillStyle = o.color || '#000';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, bx + padx, y + size * 0.04);
    ctx.letterSpacing = '0px';
    return w;
  }
  // plain spaced text
  function txt(ctx, s, x, y, o = {}) {
    ctx.font = o.font || font(o.weight || 600, o.size || 14, o.fam || F.sans);
    ctx.letterSpacing = (o.track || 0) + 'px';
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if (o.stroke) {
      ctx.lineJoin = 'round'; ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1;
      ctx.strokeText(s, x, y);
    }
    if (o.color) { ctx.fillStyle = o.color; ctx.fillText(s, x, y); }
    const w = o.measure ? ctx.measureText(s).width : 0;
    ctx.letterSpacing = '0px';
    return w;
  }
  // text around a circle
  function ringText(ctx, s, cx, cy, r, a0, o = {}) {
    ctx.save();
    ctx.font = o.font || font(o.weight || 700, o.size || 16, o.fam || F.sans);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sp = o.spacing || 0;
    let a = a0;
    const dir = o.dir || 1;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const cw = ctx.measureText(ch).width + sp;
      const da = cw / r;
      a += (da / 2) * dir;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      if (o.stroke) { ctx.lineJoin = 'round'; ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.strokeText(ch, 0, 0); }
      if (o.color) { ctx.fillStyle = typeof o.color === 'function' ? o.color(i) : o.color; ctx.fillText(ch, 0, 0); }
      ctx.restore();
      a += (da / 2) * dir;
    }
    ctx.restore();
    return a;
  }
  function ringTextLen(ctx, s, r, o = {}) {
    ctx.font = o.font || font(o.weight || 700, o.size || 16, o.fam || F.sans);
    let L = 0; for (const ch of s) L += ctx.measureText(ch).width + (o.spacing || 0);
    return L / r;
  }
  // tick ruler between two points
  function ruler(ctx, x1, y1, x2, y2, n, color, o = {}) {
    const lw = o.lw || 1.2;
    line(ctx, x1, y1, x2, y2, color, lw);
    const dx = (x2 - x1) / n, dy = (y2 - y1) / n, L = Math.hypot(dx, dy);
    const nx = -dy / L, ny = dx / L;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const len = i % (o.major || 5) === 0 ? (o.big || 12) : (o.small || 6);
      const px = x1 + dx * i, py = y1 + dy * i;
      ctx.moveTo(px, py); ctx.lineTo(px + nx * len * (o.side || 1), py + ny * len * (o.side || 1));
    }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  }
  function arrow(ctx, x, y, len, ang, color, lw = 3, head = 12) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0);
    ctx.moveTo(len - head, -head * 0.7); ctx.lineTo(len, 0); ctx.lineTo(len - head, head * 0.7);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'miter'; ctx.stroke();
    ctx.restore();
  }
  // soft round light (bokeh)
  function glow(ctx, x, y, r, color, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(0.55, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // white flash / dim helpers
  function veil(ctx, color, a) { if (a <= 0) return; ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore(); }

  Object.assign(PV, {
    W, H, BEAT, BAR, T0, DUR, B, beatPos, barOf, clamp, lerp, seg, E, ease, antic, pulse, beatPulse,
    rnd, rndr, C, MEM, ORDER, HARM, rgba, mix, desat, hexRgb, F, font, IMG, META, loadImages, SR, fullBox, PADI,
    cached, mkCanvas, silhouette, mono, rim, drawImg, drawFigure, drawCrop, TAU,
    rect, circle, line, rrect, grid, stripes, halftone, star4, star5, checker, barcode, tape, tag, txt, ringText, ringTextLen,
    ruler, arrow, glow, veil,
  });
})();
