"use strict";
const Prints = (() => {
  const W = 1200,
    H = 680,
    TAU = 2 * Math.PI,
    paper = "#f5f2e9",
    L = Model.layout;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
    mix = (a, b, t) => a + (b - a) * t;
  const smooth = (x) => {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  };
  const frac = (x) => x - Math.floor(x);
  function random(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function sheet(w, h, paint) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d", { willReadFrequently: true }), w, h);
    return c;
  }
  function line(g, pts, color, width = 1) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
  }
  function poly(g, pts, color) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }
  function bed(g, color) {
    g.fillStyle = color;
    g.fillRect(-2000, -2000, 5200, 4680);
  }
  function disk(g, x, y, r, c) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  function quad(g, q, fn, w = 1, h = 1) {
    g.save();
    g.transform(
      (q[1][0] - q[0][0]) / w,
      (q[1][1] - q[0][1]) / w,
      (q[3][0] - q[0][0]) / h,
      (q[3][1] - q[0][1]) / h,
      ...q[0],
    );
    fn();
    g.restore();
  }
  function dieQuad(f, side, r = [0, 0, 610, 800], height = 0) {
    const [x, y, w, h] = r;
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].map(([u, v]) => f.point(L.die(side, u, v, f.layers.dieTop + height)));
  }
  const target = L.unit(2, 4, 2, 1),
    group = L.group(2, 4);
  function camera(
    angle,
    elevation,
    scale,
    x,
    y,
    open,
    cx = 790,
    cy = 329,
    cut = 0,
    dz = 0,
  ) {
    return { angle, elevation, scale, x, y, open, cx, cy, cut, dz };
  }
  function move(a, b, u) {
    u = smooth(u);
    const c = {};
    for (const k in a)
      c[k] =
        k === "scale"
          ? Math.exp(mix(Math.log(a[k]), Math.log(b[k]), u))
          : mix(a[k], b[k], u);
    return c;
  }
  const [ux, uy] = L.die(1, target[0] + 15, target[1] + 8, 0);
  const cover = camera(0.56, 0.61, 119, 0, 0, 0.35, 770, 330);
  const cityView = camera(-0.13, 1.3, 156, 0.2, -0.04, 0.13, 766, 323);
  const groupView = camera(-0.16, 1.4, 740, ux, uy, 0.13, 761, 313);
  const closeView = camera(-0.18, 1.43, 1750, ux, uy, 0.13, 745, 319);
  const flowView = camera(-0.5, 0.74, 153, 0.94, 0.38, 0.51, 752, 295, 1);
  const proofView = camera(-0.42, 0.86, 135, 0.38, 0.05, 0.45, 756, 302, 1);
  function viewAt(id, p) {
    if (id === 1) return move(cover, cityView, (p - 0.06) / 0.67);
    if (id === 2)
      return p < 0.47
        ? move(cityView, groupView, (p - 0.06) / 0.38)
        : move(groupView, closeView, (p - 0.47) / 0.3);
    if (id === 3)
      return p < 0.34
        ? move(closeView, flowView, p / 0.32)
        : move(flowView, proofView, (p - 0.65) / 0.16);
    if (id === 4) return proofView;
    const loomView = { ...closeView, cy: 443 };
    if (p < 0.28) return move(proofView, loomView, (p - 0.02) / 0.25);
    return move(loomView, cover, (p - 0.73) / 0.1);
  }
  const films = new Map();
  let exporting = false;
  function setExporting(value) {
    if (value === exporting) return;
    exporting = value;
    for (const f of films.values())
      for (const c of f.passes) c.width = c.height = 1;
    films.clear();
  }
  function film(id, p, resolution = 1.25) {
    const view = viewAt(id, p),
      key = Object.values(view).concat(resolution).join("|");
    let f = films.get(id);
    films.delete(id);
    if (!f || f.key !== key) {
      f = Model.makeRelief(view, f, resolution, exporting);
      f.key = key;
    }
    films.set(id, f);
    if (films.size > 2) {
      const oldest = films.keys().next().value;
      films.get(oldest).passes.forEach((c) => {
        c.width = c.height = 1;
      });
      films.delete(oldest);
    }
    return f;
  }
  let proof = null,
    sourcePixels = null;
  const ramp = [
    [34, 56, 48],
    [76, 106, 87],
    [142, 162, 135],
    [190, 195, 163],
    [232, 222, 190],
    [244, 235, 206],
  ];
  let inkSource = null,
    lastImpression = "";
  function prepareInk() {
    if (inkSource) return;
    proofSource();
    const cols = Math.ceil(W / 64),
      rows = Math.ceil(H / 64),
      low = new Uint8Array(cols * rows).fill(255),
      high = new Uint8Array(cols * rows);
    const values = new Uint8Array(W * H),
      red = new Uint8Array(W * H),
      colors = new Uint8Array(256 * 3);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x,
          ix = 4 * k,
          tile = Math.floor(x / 64) + Math.floor(y / 64) * cols;
        const l = Math.round(
          sourcePixels[ix] * 0.28 +
            sourcePixels[ix + 1] * 0.52 +
            sourcePixels[ix + 2] * 0.2,
        );
        values[k] = l;
        red[k] = Number(sourcePixels[ix] > sourcePixels[ix + 1] * 1.25);
        low[tile] = Math.min(l, low[tile]);
        high[tile] = Math.max(l, high[tile]);
      }
    for (let i = 0; i < 256; i++) {
      const v = clamp((i - 40) / 193) * 5,
        j = Math.min(4, Math.floor(v));
      for (let c = 0; c < 3; c++)
        colors[i * 3 + c] = mix(ramp[j][c], ramp[j + 1][c], v - j);
    }
    const surface = sheet(W / 2, H / 2, () => {}),
      ctx = surface.getContext("2d");
    inkSource = {
      cols,
      low,
      high,
      values,
      red,
      colors,
      surface,
      ctx,
      output: ctx.createImageData(W / 2, H / 2),
    };
  }
  function precision(g, p, t, s) {
    prepareInk();
    bed(g, paper);
    g.drawImage(proof, 0, 0);
    const q =
      smooth((p - 0.06) / 0.1) +
      smooth((p - 0.2) / 0.1) +
      smooth((p - 0.38) / 0.1) +
      smooth((p - 0.59) / 0.13);
    if (q === 0 && !s.awake) return;
    const lo = Math.floor(q),
      hi = Math.min(4, lo + 1),
      progress = smooth(q - lo);
    const key = [q, s.awake, s.x, s.y].join("/");
    const { cols, low, high, values, red, colors, surface, ctx, output } =
      inkSource;
    if (key !== lastImpression) {
      const width = surface.width,
        height = surface.height,
        px = s.x * W,
        py = s.y * H;
      const pitch = [1, 2, 4, 9, 2],
        levels = [1, 17, 8, 4, 4],
        data = output.data;
      for (let y = 0; y < height; y++) {
        const sy = y * 2,
          edge = (W + 120) * progress - 60 + 56 - (sy * 112) / H,
          ty = sy >> 6;
        for (let x = 0; x < width; x++) {
          const sx = x * 2,
            tx = sx >> 6,
            tile = ty * cols + tx,
            d = (y * width + x) * 4;
          let level = progress && sx < edge ? hi : lo;
          if (lo === 3) {
            const direction =
              ((tx * 64) / W) * 0.63 +
              ((ty * 64) / H) * 0.29 +
              0.08 * Math.sin(tx * 64 * 0.014 + ty * 64 * 0.017);
            level =
              sy % 64 <
              Math.min(64, H - ty * 64) *
                clamp((progress * 1.22 - direction) * 5.5)
                ? 4
                : 3;
          }
          if (s.awake && (sx - px) ** 2 + (sy - py) ** 2 < 84 ** 2)
            level = lo < 2 || lo === 4 ? 3 : 4;
          if (!level) {
            data[d + 3] = 0;
            continue;
          }
          const cell = pitch[level],
            cx = Math.floor(sx / cell),
            cy = Math.floor(sy / cell),
            index = cy * cell * W + cx * cell;
          const min = level === 4 ? low[tile] : 40,
            span = level === 4 ? high[tile] - min : 193,
            n = levels[level] - 1;
          const dither =
            ((cx % 2) * 2 + (cy % 2) - 1.5) * (level === 3 ? 0.015 : 0.006);
          const value = clamp(
            Math.round(
              min +
                (Math.round(
                  clamp((values[index] - min) / Math.max(1, span) + dither) * n,
                ) *
                  span) /
                  n,
            ),
            0,
            255,
          );
          if (red[index]) {
            data[d] = 209;
            data[d + 1] = 91;
            data[d + 2] = 56;
          } else {
            data[d] = colors[value * 3];
            data[d + 1] = colors[value * 3 + 1];
            data[d + 2] = colors[value * 3 + 2];
          }
          data[d + 3] = 255;
        }
      }
      ctx.putImageData(output, 0, 0);
      lastImpression = key;
    }
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(surface, 0, 0, W, H);
    g.restore();
  }
  function glyphCloud(text, fontSize, width, height) {
    const c = sheet(width, height, (g, w, h) => {
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "700 " + fontSize + 'px "SimSun",serif';
      g.fillText(text, w / 2, h * 0.51);
    });
    const data = c.getContext("2d").getImageData(0, 0, width, height).data,
      pts = [];
    for (let y = 1; y < height; y += 2)
      for (let x = 1; x < width; x += 2)
        if (data[(y * width + x) * 4 + 3] > 110)
          pts.push([x - width / 2, y - height / 2]);
    const r = random(471);
    for (let j = pts.length - 1; j > 0; j--) {
      let i = Math.floor(r() * (j + 1));
      [pts[j], pts[i]] = [pts[i], pts[j]];
    }
    return pts;
  }
  const phrases = ["天将明", "雨初歇", "风入林"],
    vocabulary = ["曙", "霁", "岚"];
  const lexicon = {
    天: [1, 0.1, 0],
    将: [0.3, 0.25, 0.2],
    明: [1, 0.1, 0.1],
    雨: [0.1, 1, 0.1],
    初: [0.2, 0.3, 0.1],
    歇: [0, 0.9, 0.1],
    风: [0, 0.1, 1],
    入: [0.2, 0.1, 0.3],
    林: [0.1, 0.1, 0.95],
  };
  const multiply = (input, weights) =>
    weights[0].map((_, j) =>
      input.reduce((acc, v, k) => acc + v * weights[k][j], 0),
    );
  function readPhrase(phrase) {
    const embeddings = Array.from(phrase, (ch) => lexicon[ch]);
    const features = embeddings.map((v) =>
      multiply(v, [
        [1, 0.25, -0.1],
        [-0.15, 1, 0.28],
        [0.2, -0.15, 1],
      ]).map((a) => Math.max(0, a)),
    );
    const pooled = features.reduce(
      (a, b) => a.map((x, j) => x + b[j]),
      [0, 0, 0],
    );
    const scores = multiply(pooled, [
      [1, -0.2, 0.1],
      [0.2, 1, -0.1],
      [-0.1, 0.1, 1],
    ]);
    return {
      glyph: vocabulary[scores.indexOf(Math.max(...scores))],
      color: pooled,
    };
  }
  const readings = phrases.map(readPhrase);
  let clouds = null;
  function prepareGlyphs() {
    if (!clouds)
      clouds = phrases.map((phrase, i) => [
        glyphCloud(phrase, 121, 422, 158),
        glyphCloud(readings[i].glyph, 246, 280, 290),
      ]);
  }
  const plateSeal = sheet(700, 535, (g, w, h) => {
    g.drawImage(Model.mask, 0, 0, w, h);
    const image = g.getImageData(0, 0, w, h),
      c = image.data;
    for (let i = 0; i < c.length; i += 4) {
      const v = (c[i] + c[i + 1] + c[i + 2]) / 765;
      c[i] = Math.round(161 + v * 84);
      c[i + 1] = Math.round(38 + v * 66);
      c[i + 2] = Math.round(23 + v * 47);
    }
    g.putImageData(image, 0, 0);
  });
  function backing(canvas, face) {
    const r = canvas.getBoundingClientRect(),
      d = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(r.width * d)),
      ch = Math.max(1, Math.round(r.height * d));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const g = canvas.getContext("2d", { willReadFrequently: true });
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const center = face.reduce(
      (a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4],
      [0, 0],
    );
    const plate = face.map(([x, y]) => [
      center[0] + (x - center[0]) * 0.82 + r.width * 0.068,
      center[1] + (y - center[1]) * 0.82 - r.height * 0.19,
    ]);
    quad(g, plate, () => {
      const border = 0.026;
      const pts = [
        [border, 0],
        [1 - border, 0],
        [1, border],
        [1, 1 - border],
        [1 - border, 1],
        [border, 1],
        [0, 1 - border],
        [0, border],
      ];
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
      g.closePath();
      g.clip();
      g.drawImage(plateSeal, 0, 0, 1, 1);
    });
    for (const dx of [0.021, 0.038]) {
      const outline = plate.map(([x, y]) => [
        x + r.width * dx,
        y - r.height * dx * 0.5,
      ]);
      line(g, [...outline, outline[0]], "#ac886457", 0.8);
    }
    for (const [x, y] of plate) {
      line(
        g,
        [
          [x - 4, y],
          [x + 4, y],
        ],
        "#8e786c",
        0.8,
      );
      line(
        g,
        [
          [x, y - 4],
          [x, y + 4],
        ],
        "#8e786c",
        0.8,
      );
    }
  }
  function drawPass(g, f, i) {
    g.drawImage(f.passes[i], 0, 0, W, H);
  }
  function ground(g, f) {
    bed(g, paper);
    const footprint = [
      [-3.32, -2.55],
      [3.32, -2.55],
      [3.32, 2.55],
      [-3.32, 2.55],
    ].map(([x, y]) => f.point([x, y, -0.24]));
    for (let i = 1; i <= 2; i++) {
      const q = footprint.map(([x, y]) => [x + i * 5, y + i * 3]);
      line(g, [...q, q[0]], "#94a2874f", 0.7);
    }
    drawPass(g, f, 0);
  }
  function applyDie(g, f, side, paint) {
    const q = dieQuad(f, side);
    quad(
      g,
      q,
      () => {
        g.beginPath();
        g.rect(0, 0, 610, 800);
        g.clip();
        paint();
      },
      610,
      800,
    );
  }
  function uvAt(f, side, x, y) {
    const q = dieQuad(f, side),
      a = q[0],
      u = [q[1][0] - a[0], q[1][1] - a[1]],
      v = [q[3][0] - a[0], q[3][1] - a[1]];
    const det = u[0] * v[1] - u[1] * v[0];
    return [
      (610 * ((x - a[0]) * v[1] - (y - a[1]) * v[0])) / det,
      (800 * (u[0] * (y - a[1]) - u[1] * (x - a[0]))) / det,
    ];
  }
  const blocks = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 4; c++) {
      const units = [];
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++) units.push(L.unit(c, r, a, b));
      blocks.push({ r, c, units, rect: L.group(c, r) });
    }
  function seam(g, f, t, amount) {
    const z = f.layers.dieTop + 0.001;
    for (let j = 0; j < 55; j++) {
      const y = (j - 27) * 0.064,
        edge = 0.115,
        u = frac(t * 0.49 + j * 0.357);
      const a = f.point([-edge, y, z]),
        b = f.point([edge, y, z]);
      line(g, [a, b], "rgba(183,146,96," + (0.24 + amount * 0.46) + ")", 0.7);
      const v = j % 2 ? u : 1 - u;
      line(
        g,
        [
          [mix(a[0], b[0], v * 0.79), mix(a[1], b[1], v * 0.79)],
          [mix(a[0], b[0], v * 0.79 + 0.21), mix(a[1], b[1], v * 0.79 + 0.21)],
        ],
        "#edbf82",
        1.3,
      );
    }
  }
  function windows(g, f, side, night, t, s, dispatch = 0, cityLight = 0) {
    const mouse = uvAt(f, side, s.x * W, s.y * H),
      active = clamp(night);
    const bounds = [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ].map(([x, y]) => uvAt(f, side, x, y));
    const left = Math.min(...bounds.map((p) => p[0])),
      right = Math.max(...bounds.map((p) => p[0]));
    const top = Math.min(...bounds.map((p) => p[1])),
      bottom = Math.max(...bounds.map((p) => p[1]));
    applyDie(g, f, side, () => {
      g.fillStyle = "rgba(22,49,38," + (0.15 + 0.67 * active) + ")";
      g.fillRect(0, 0, 610, 800);
      for (const { r, c, rect, units } of blocks) {
        if (
          rect[0] + rect[2] < left ||
          rect[0] > right ||
          rect[1] + rect[3] < top ||
          rect[1] > bottom
        )
          continue;
        const [x, y] = rect;
        const spine = side > 0 ? 14 : 597,
          tap = side > 0 ? x + 2 : x + 134;
        const arrival =
          Math.abs(y + 77 - 395) / 1350 +
          (Math.abs(tap - spine) / Math.abs(610 - 2 * spine)) * 0.44;
        const phase = clamp((frac(t * 0.28) - arrival) / 0.23);
        g.strokeStyle = "#9da990";
        g.lineWidth = 0.8;
        g.strokeRect(x, y, 138, 83);
        // A task enters the group's bus, then splits onto the four intra-block lanes.
        const send = clamp(phase * 1.65),
          reach = clamp((phase - 0.24) * 1.42);
        for (let j = 0; j < 16; j++) {
          const [u, v, w, h] = units[j],
            rx = u + 15,
            ry = v + 8;
          const near = s.awake
            ? Math.exp(-((rx - mouse[0]) ** 2 + (ry - mouse[1]) ** 2) / 4200)
            : 0;
          const lit =
            active *
              (0.5 + 0.5 * Math.sin(r * 1.43 + c * 2.4 + j * 0.64 + t * 0.8)) *
              0.69 +
            near;
          g.fillStyle = "rgba(174,183,146," + clamp(0.07 + lit * 0.52) + ")";
          g.fillRect(u, v, w, h);
          g.fillStyle = "rgba(230,171,110," + clamp(lit * 0.8) + ")";
          g.fillRect(u + 1, v + 1, w - 2, 1.5);
          if (cityLight > 0) {
            const blockGlow =
              0.5 +
              0.5 * Math.sin(r * 2.71 + c * 4.13 + side * 0.92 + t * 0.53);
            const windowGlow =
              cityLight *
              clamp(
                (blockGlow + 0.28 * Math.cos(j * 1.7 + r * 0.8) - 0.31) * 1.65,
              );
            if (windowGlow > 0.035) {
              g.fillStyle = "rgba(246,186,120," + windowGlow * 0.92 + ")";
              g.fillRect(u + 3, v + 2, 3.2, 8);
              g.fillRect(u + 10, v + 2, 2.3, 6);
              g.fillStyle = "rgba(248,225,175," + windowGlow * 0.89 + ")";
              g.fillRect(u + 17, v + 2, 3.1, 4);
              g.fillRect(u + 23, v + 3, 2.7, 7);
            }
          }
          if (dispatch === 0 && f.view.scale <= 420) continue;
          for (let lane = 0; lane < 4; lane++) {
            const destX = u + 4 + lane * 6.2,
              destY = v + 3 + (j % 3) * 3.4;
            const startX = tap,
              startY = y + 77;
            const routeX = mix(startX, destX, send),
              routeY = mix(startY, destY, reach);
            const travel =
              dispatch * clamp(phase * 16) * clamp(0.48 + near + reach);
            if (f.view.scale > 420) {
              g.fillStyle = "#374d3fc0";
              g.fillRect(destX - 1.9, v + 2, 3.8, 12);
              g.fillStyle =
                "rgba(220,203,155," + clamp(0.19 + 0.72 * travel) + ")";
              for (let cut = 0; cut < 5; cut++)
                g.fillRect(destX - 1.4, v + 3 + cut * 2.1, 2.8, 0.78);
            }
            if (dispatch > 0) {
              g.fillStyle =
                phase < 0.61
                  ? "rgba(255,184,104," + travel + ")"
                  : "rgba(195,228,193," + travel + ")";
              g.fillRect(routeX - 1.55, routeY - 1.1, 3.1, 2.2);
            }
          }
        }
        // SRAM strips keep their own lamination over the neighbouring arrays.
        if (c === 0 || c === 2) {
          const cr = L.cache(c === 0 ? -1 : 1, r);
          g.fillStyle = "#415c4d";
          g.fillRect(...cr);
          for (let l = 0; l < 17; l++) {
            g.fillStyle = l % 4 ? "#869b84" : "#b5b591";
            g.fillRect(cr[0] + 2, cr[1] + l * 3.8, 25, 1.65);
          }
        }
      }
    });
  }
  function city(g, f, p, t, s) {
    ground(g, f);
    drawPass(g, f, 1);
    const night = smooth(p / 0.7);
    for (const side of [-1, 1]) windows(g, f, side, night, t, s, 0, night);
    seam(g, f, t, night);
    drawPass(g, f, 2);
  }
  // A single issue token at the seam forks into two spines, eight rows,
  // and the local distributors etched across each group of the two dies.
  function issueBus(g, f, side, p, t) {
    const phase = frac(t * 0.28),
      amp = smooth((p + 0.02) / 0.15) * (1 - smooth((p - 0.48) / 0.22));
    if (!amp) return;
    const edge = side > 0 ? 7 : 603,
      origin = 395,
      spine = side > 0 ? 14 : 597;
    g.save();
    g.globalAlpha = amp;
    applyDie(g, f, side, () => {
      line(
        g,
        [
          [spine, 101],
          [spine, 759],
        ],
        "#b28c6573",
        1.7,
      );
      for (const sign of [-1, 1]) {
        const end = sign < 0 ? 101 : 759,
          y = origin + sign * Math.min(Math.abs(end - origin), phase * 1350);
        line(
          g,
          [
            [edge, origin],
            [spine, origin],
            [spine, y],
          ],
          "#f2b571",
          3,
        );
        g.fillStyle = "#ffdda2";
        g.fillRect(spine - 3, y - 4, 6, 8);
      }
      for (let r = 0; r < 8; r++) {
        const y = L.group(0, r)[1] + 77,
          delay = Math.abs(y - origin) / 1350;
        const fork = clamp((phase - delay) / 0.44);
        line(
          g,
          [
            [spine, y],
            [mix(spine, 610 - spine, fork), y],
          ],
          "#e7ae76",
          2.8,
        );
        for (let c = 0; c < 4; c++) {
          const [x] = L.group(c, r),
            tap = side > 0 ? x + 2 : x + 134;
          if (fork < Math.abs(tap - spine) / Math.abs(610 - 2 * spine))
            continue;
          g.fillStyle = "#f8d49b";
          g.fillRect(tap - 2, y - 5, 4, 9);
        }
      }
    });
    g.restore();
  }
  function parallel(g, f, p, t, s) {
    ground(g, f);
    drawPass(g, f, 1);
    const issue = smooth((p + 0.015) / 0.21);
    for (const side of [-1, 1]) {
      windows(g, f, side, 0.95, t, s, issue, 1 - smooth((p - 0.01) / 0.2));
      issueBus(g, f, side, p, t);
    }
    seam(g, f, t, 0.9);
    drawPass(g, f, 2);
  }
  // A memory read is one itinerary, partitioned across the surfaces it visits.
  // Every point is in package coordinates. The lateral section is the etch
  // drawn by landingMap; the cache and destination are addresses in silicon().
  function buildRoute(f, side, bank, lane) {
    const l = f.layers,
      z = l.interposerZ + 0.136,
      top = l.dieTop + 0.001;
    const etch = L.bus(side, bank, lane);
    const [hx, hy] = etch[0],
      [ex, ey] = etch.at(-1);
    const pair = Math.floor(lane / 4),
      row = bank * 2 + (pair % 2),
      col = side > 0 ? 2 : 0;
    const cache = L.cache(side, row);
    const cell = L.unit(col, row, side > 0 ? 2 : 3, pair % 4);
    const reg = L.die(side, cache[0] + 15, cache[1] + 5 + pair * 9, top);
    const core = L.die(side, cell[0] + 9 + (pair % 3) * 5, cell[1] + 8, top);
    const returnLine = lane % 4 === 2;
    const streetY = L.die(
      side,
      0,
      L.group(col, row)[1] + (returnLine ? 82 : 75),
      top,
    )[1];
    const stackHeight =
      side === 1 && bank === 3 ? l.stackTop : l.deviceZ + 0.259;
    const cap = [side * (2.58 - pair * 0.025), hy + 0.045, stackHeight];
    const via = [hx, hy, stackHeight],
      foot = [hx, hy, z],
      port = [ex, ey, top];
    const zbase = l.deviceZ + 0.002;
    // The copper through-via is exposed on the cut edge of the stack.
    const segments = [
      {
        pass: 2,
        points: [
          cap,
          [side * 2.27, hy + 0.045, stackHeight],
          [side * 2.19, hy, stackHeight],
          via,
        ],
      },
      { pass: 3, points: [via, [hx, hy, zbase]] },
      {
        pass: 0,
        points: [
          [hx, hy, zbase],
          foot,
          ...etch.slice(1).map(([x, y]) => [x, y, z]),
          port,
        ],
      },
      {
        pass: 1,
        points: [
          port,
          [ex, streetY, top],
          [reg[0], streetY, top],
          reg,
          [core[0], reg[1], top],
          core,
        ],
      },
    ];
    let total = 0;
    const parts = segments.map(({ pass, points }) => {
      const screen = points.map(f.point),
        lengths = [0];
      for (let j = 1; j < points.length; j++)
        lengths.push(
          lengths[j - 1] +
            Math.hypot(...points[j].map((v, k) => v - points[j - 1][k])),
        );
      const part = {
        pass,
        screen,
        lengths,
        start: total,
        end: total + lengths.at(-1),
      };
      total = part.end;
      return part;
    });
    return {
      side,
      bank,
      lane,
      row,
      cell,
      reg,
      core,
      parts,
      total,
      source: f.point(cap),
      back: returnLine,
    };
  }
  function position(part, dist) {
    const local = clamp(dist - part.start, 0, part.end - part.start);
    let i = 1;
    while (i < part.lengths.length - 1 && part.lengths[i] < local) i++;
    const v = clamp(
      (local - part.lengths[i - 1]) /
        Math.max(1e-8, part.lengths[i] - part.lengths[i - 1]),
    );
    const a = part.screen[i - 1],
      b = part.screen[i];
    return [mix(a[0], b[0], v), mix(a[1], b[1], v)];
  }
  function stream(g, part, dist, back, vivid) {
    const tail = dist + (back ? 0.29 : -0.29),
      start = Math.max(part.start, Math.min(tail, dist)),
      end = Math.min(part.end, Math.max(tail, dist));
    if (end <= start) return;
    const points = [position(part, start)];
    for (let j = 1; j < part.lengths.length - 1; j++) {
      const at = part.start + part.lengths[j];
      if (at > start && at < end) points.push(part.screen[j]);
    }
    points.push(position(part, end));
    line(g, points, vivid + "52", 6.7);
    line(g, points, vivid, 2.65);
    if (dist >= part.start && dist <= part.end) {
      const [x, y] = position(part, dist);
      disk(g, x, y, 3.4, vivid + "80");
      disk(g, x, y, 1.65, "#fff2cf");
    }
  }
  function memoryFilm(g, f, supply) {
    // The cap develops into an etched section on its own upper face.
    for (const side of [-1, 1])
      for (let bank = 0; bank < 4; bank++) {
        const [cx, cy] = L.memory(side, bank);
        const z =
          side === 1 && bank === 3
            ? f.layers.stackTop
            : f.layers.deviceZ + 0.259;
        const x0 = side > 0 ? 1.915 : cx - 0.468,
          x1 = side > 0 ? cx + 0.468 : -1.915;
        const q = [
          [x0, cy - 0.431],
          [x1, cy - 0.431],
          [x1, cy + 0.431],
          [x0, cy + 0.431],
        ].map(([x, y]) => f.point([x, y, z]));
        quad(
          g,
          q,
          () => {
            g.fillStyle = "rgba(107,65,43," + (0.25 + 0.5 * supply) + ")";
            g.fillRect(0, 0, 100, 100);
            for (let j = 0; j < 36; j++) {
              const y = 5 + j * 2.55,
                x = side > 0 ? 32 : 4;
              g.fillStyle = j % 4 ? "#c5ae8459" : "#ebc99cb3";
              g.fillRect(x, y, 64, j % 4 ? 0.52 : 0.9);
            }
            const inner = side > 0 ? 2 : 95;
            g.fillStyle = "#d1a87b";
            g.fillRect(inner, 3, 2, 94);
          },
          100,
          100,
        );
      }
  }
  function activateMemory(f, t, s, supply) {
    const rows = [new Float32Array(8), new Float32Array(8)];
    for (const route of f.routes) {
      const local = s.awake
        ? Math.exp(
            -(
              (s.x * W - route.source[0]) ** 2 +
              (s.y * H - route.source[1]) ** 2
            ) / 16000,
          )
        : 0;
      const pair = Math.floor(route.lane / 4),
        side = Number(route.side > 0);
      const load = clamp(supply + local * 0.87),
        index = (route.bank * 13 + pair * 7 + side * 14) % 53;
      route.focus = local;
      route.emitting = index / 53 < load;
      route.phase = frac(
        t * 0.26 + route.bank * 0.088 + pair * 0.083 + side * 0.24,
      );
      if (route.emitting && !route.back)
        rows[side][route.row] += 1 / (route.row % 2 ? 2 : 3);
    }
    return rows;
  }
  function flowLights(g, f, pass) {
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const route of f.routes) {
      if (pass === 3 && route.side < 0) continue;
      const { emitting, back, phase } = route;
      const part = route.parts.find((q) => q.pass === pass);
      const vivid = back ? "#aee7c3" : "#ffc184";
      const rail = back ? "#679b88" : "#d7824d";
      if (emitting && route.focus > 0.06) {
        g.globalAlpha = route.focus * 0.64;
        line(g, part.screen, vivid, 4.5);
        g.globalAlpha = 1;
      }
      line(
        g,
        part.screen,
        emitting ? rail + "db" : rail + "43",
        emitting ? 1.65 : 0.75,
      );
      if (!emitting) continue;
      const active = back ? phase > 0.5 : phase < 0.56;
      const d = back
        ? (1 - clamp((phase - 0.5) / 0.5)) * route.total
        : clamp(phase / 0.51) * route.total;
      if (active) stream(g, part, d, back, vivid);
      if (pass === 2 && ((!back && phase < 0.22) || (back && phase > 0.86)))
        disk(g, ...route.source, 2.7, vivid);
      if (pass === 1 && phase > 0.39 && phase < 0.7) {
        const [x, y] = f.point(route.core);
        disk(g, x, y, 4.9, vivid + "53");
        disk(g, x, y, 2.1, vivid);
      }
    }
    g.restore();
  }
  function tide(g, f, p, t, s) {
    ground(g, f);
    if (!f.routes) {
      f.routes = [];
      for (const side of [-1, 1])
        for (let bank = 0; bank < 4; bank++)
          for (let pair = 0; pair < 5; pair++)
            for (const lane of [pair * 4 + 1, pair * 4 + 2])
              f.routes.push(buildRoute(f, side, bank, lane));
    }
    const supply = 0.022 + 0.978 * smooth((p - 0.27) / 0.42);
    const rowLoad = activateMemory(f, t, s, supply);
    flowLights(g, f, 0);
    drawPass(g, f, 1);
    for (const side of [-1, 1])
      applyDie(g, f, side, () => {
        g.fillStyle = "#152f25e8";
        g.fillRect(0, 0, 610, 800);
        const mouse = uvAt(f, side, s.x * W, s.y * H);
        for (const { units, r, c, rect } of blocks) {
          const fed = rowLoad[Number(side > 0)][r];
          const supplyBand = clamp(fed * 1.86 - (side > 0 ? 3 - c : c) * 0.27);
          for (let j = 0; j < units.length; j++) {
            const [x, y, w, h] = units[j],
              near = s.awake
                ? Math.exp(-((x - mouse[0]) ** 2 + (y - mouse[1]) ** 2) / 4400)
                : 0;
            const light = clamp(supplyBand + near),
              pulse = 0.7 + 0.3 * Math.sin(t * 2.3 + j * 0.56 + r);
            g.fillStyle =
              "rgba(163,181,140," + (0.06 + light * pulse * 0.6) + ")";
            g.fillRect(x + 1, y + 1, w - 2, h - 2);
            g.fillStyle = "rgba(235,181,123," + (0.09 + light * 0.85) + ")";
            g.fillRect(x + 2, y + 2, w - 4, 1.6);
            for (let n = 0; n < 5; n++) {
              g.fillStyle = "#374f418a";
              g.fillRect(x + 3 + n * 5.3, y + 4, 1.2, 9);
            }
          }
          g.fillStyle = "#7b8a705e";
          g.fillRect(rect[0], rect[1] + 75, 134, 4);
        }
        for (let row = 0; row < 8; row++) {
          const [x, y, w, h] = L.cache(side, row);
          g.fillStyle = "#314f42";
          g.fillRect(x, y, w, h);
          for (let n = 0; n < 17; n++) {
            g.fillStyle =
              supply > 0.24 && n % 4 === Math.floor(t * 3) % 4
                ? "#d4ba8e"
                : "#79977e";
            g.fillRect(x + 2, y + n * 3.8, w - 4, 1.8);
          }
        }
      });
    flowLights(g, f, 1);
    seam(g, f, t, supply);
    drawPass(g, f, 2);
    memoryFilm(g, f, supply);
    flowLights(g, f, 3);
    flowLights(g, f, 2);
  }
  const neutral = { x: 0.5, y: 0.5, awake: false };
  function proofSource() {
    if (proof) return;
    const f = film(4, 0);
    proof = sheet(W, H, (g) => tide(g, f, 0.83, 2.75, neutral));
    sourcePixels = proof.getContext("2d").getImageData(0, 0, W, H).data;
  }
  function tensor(g, f, p, t, s) {
    ground(g, f);
    drawPass(g, f, 1);
    const close = smooth((p - 0.01) / 0.22) * (1 - smooth((p - 0.7) / 0.13));
    for (const side of [-1, 1]) windows(g, f, side, 0.45 + close * 0.32, t, s);
    seam(g, f, t, 0.5);
    drawPass(g, f, 2);
    prepareGlyphs();
    const unfold = smooth((p - 0.11) / 0.2) * (1 - smooth((p - 0.64) / 0.16));
    const cell = dieQuad(f, 1, target),
      center = cell.reduce(
        (a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4],
        [0, 0],
      );
    const untilt = smooth(unfold) * 0.93,
      tilt = s.awake ? (s.y - 0.5) * 0.14 : 0;
    // The lattice is an enlarged, raised lamina from this exact tensor site.
    const width = 634,
      height = 365,
      folded = [
        [-width / 2, -height / 2],
        [width / 2, -height / 2],
        [width / 2, height / 2],
        [-width / 2, height / 2],
      ];
    const plane = cell.map((q, i) => {
      const [x, y] = folded[i],
        a = -0.1 + tilt;
      return [
        mix(
          q[0],
          center[0] + 18 + x * Math.cos(a) - y * Math.sin(a) + y * 0.07,
          untilt,
        ),
        mix(q[1], center[1] - 204 + x * Math.sin(a) + y * Math.cos(a), untilt),
      ];
    });
    if (unfold > 0.02) {
      poly(g, cell, "#dc9e6b68");
      line(g, [...cell, cell[0]], "#efd6a9", 1.6);
      for (let j = 0; j < 4; j++)
        line(g, [cell[j], plane[j]], "#ab815dca", 1.15);
      for (let i = 1; i < 3; i++) {
        const q = cell.map((a, j) =>
          a.map((v, k) => mix(v, plane[j][k], i * 0.31)),
        );
        poly(g, q, "#415d4858");
        line(g, [...q, q[0]], "#b39a6fbe", 1.1);
        quad(
          g,
          q,
          () => {
            for (let j = 1; j < 15; j++)
              line(
                g,
                [
                  [j * 10, 2],
                  [j * 10, 53],
                  [j * 10 + 7, 60],
                  [j * 10 + 7, 98],
                ],
                j % 3 ? "#bcb9979f" : "#e1b183ba",
                1.15,
              );
          },
          160,
          100,
        );
      }
    }
    quad(
      g,
      plane,
      () => {
        g.fillStyle = "#294537";
        g.fillRect(0, 0, width, height);
        g.strokeStyle = "#c3aa80";
        g.lineWidth = 1.8;
        g.strokeRect(1, 1, width - 2, height - 2);
        const weights = s.shuttle || [1, 0, 0],
          heat = weights.reduce((v, w, i) => v + w * readings[i].color[0], 0);
        const scatter = smooth((p - 0.26) / 0.15),
          word = smooth((p - 0.44) / 0.15);
        // Row and column responses share the multipliers used by the moving strokes.
        for (let j = 0; j < 96; j++) {
          const x = 12 + j * 6.4,
            pts = [];
          for (let n = 0; n <= 24; n++) {
            let u = n / 24;
            pts.push([
              x +
                Math.sin(u * 6 + j * 0.17 + t * 0.39) *
                  3.4 *
                  Math.sin(Math.PI * u),
              10 + u * (height - 20),
            ]);
          }
          line(g, pts, j % 5 ? "#7c987c9a" : "#c19f73b0", j % 5 ? 0.72 : 1.3);
        }
        for (let j = 0; j < 49; j++) {
          const y = 12 + j * 6.95,
            pts = [];
          for (let n = 0; n <= 40; n++) {
            const u = n / 40,
              v =
                Math.sin(n * 0.22) * Math.cos(j * 0.23) +
                Math.cos(n * 0.17) * Math.sin(j * 0.28 + heat * 0.31);
            pts.push([10 + u * (width - 20), y + v * 4 * scatter]);
          }
          line(g, pts, j % 6 ? "#80978083" : "#bc9c6e", 0.9);
        }
        for (let j = 0; j < 3250; j++) {
          let ax = 0,
            ay = 0,
            bx = 0,
            by = 0;
          for (let n = 0; n < 3; n++) {
            if (weights[n] < 0.00005) continue;
            const aa = clouds[n][0][j % clouds[n][0].length],
              bb = clouds[n][1][j % clouds[n][1].length];
            ax += weights[n] * aa[0];
            ay += weights[n] * aa[1];
            bx += weights[n] * bb[0];
            by += weights[n] * bb[1];
          }
          const col = j % 80,
            row = Math.floor(j / 80),
            v =
              Math.sin(col * 0.2) * Math.cos(row * 0.23) +
              Math.cos(col * 0.17) * Math.sin(row * 0.28 + heat * 0.31);
          const xx = mix(
            mix(width / 2 + ax, 48 + col * 6.8, scatter),
            width / 2 + bx,
            word,
          );
          const yy = mix(
            mix(height / 2 + ay, 42 + row * 6.6 + v * 5, scatter),
            height / 2 + by,
            word,
          );
          const woven = scatter * (1 - word),
            power = clamp((v + 0.46) * 0.7),
            size = 2.6 + woven * (power * 2.3 - 1.7);
          g.fillStyle =
            woven > 0.55
              ? power > 0.63
                ? "#e0a068"
                : power > 0.33
                  ? "#c1c9aa"
                  : "#708d76"
              : j % 5
                ? "#eee4ca"
                : "#acbc9a";
          g.fillRect(xx, yy, size, size * (woven > 0.55 ? 0.8 : 0.94));
        }
      },
      width,
      height,
    );
    return plane;
  }
  function paperMargin(g, id) {
    // The edge of the photographic exposure leaves a paper margin for the title.
    const edge = id === 2 ? 390 : id === 5 ? 342 : 300;
    const veil = g.createLinearGradient(70, 0, edge + 82, 0);
    veil.addColorStop(0, paper);
    veil.addColorStop(0.48, "#f5f2e9f4");
    veil.addColorStop(0.78, "#f5f2e982");
    veil.addColorStop(1, "#f5f2e900");
    g.fillStyle = veil;
    g.fillRect(-200, -200, edge + 283, 1080);
  }
  function draw(canvas, id, p, t, s) {
    const r = canvas.getBoundingClientRect(),
      d = Math.min(devicePixelRatio || 1, 2),
      w = Math.max(1, Math.round(r.width * d)),
      h = Math.max(1, Math.round(r.height * d));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const g = canvas.getContext("2d", { willReadFrequently: exporting }),
      k = Math.max(w / W, h / H);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(k, 0, 0, k, (w - W * k) / 2, (h - H * k) / 2);
    const f = film(
      id,
      p,
      id === 4 ? 1.25 : Math.min(2.5, Math.max(1.25, Math.ceil(k * 4) / 4)),
    );
    if (id === 1) city(g, f, p, t, s);
    if (id === 2) parallel(g, f, p, t, s);
    if (id === 3) tide(g, f, p, t, s);
    if (id === 4) precision(g, p, t, s);
    if (id === 5) tensor(g, f, p, t, s);
    paperMargin(g, id);
    const region = (r, side = 1) => dieQuad(f, side, r);
    const whole = [0, 0, 610, 800];
    return {
      in:
        id === 1
          ? region(whole, -1)
          : id === 2
            ? region(group)
            : id === 4
              ? region(whole)
              : region(target),
      out:
        id === 1
          ? region(group)
          : id === 3 || id === 5
            ? region(whole)
            : region(target),
    };
  }
  let ready;
  function prepare() {
    if (!ready)
      ready = (async () => {
        await new Promise((r) => setTimeout(r, 0));
        prepareInk();
        prepareGlyphs();
      })();
    return ready;
  }
  return { draw, backing, prepare, setExporting };
})();
