// The hub: two facing pages of a star atlas. Every topic card in data/topics.json (format: website/hub/README.md)
// becomes a page of the plate: a text column, and a framed window of sky holding the topic's constellation in the
// card's accent. Everything drawn as sky stays inside the window; the rest of the page is plain paper. The hub
// knows no topic: a page is drawn from the card's own fields, its feature block by `feature.kind` (FEATURES
// below), and a card with status "soon" (a topic announced in its manifest, no site yet) gets a window still
// being surveyed. Static text and settings come from the page (<script id="hub-data">, from site.config.mjs).
const html = document.documentElement;
const root = html.dataset.root || './';
const { lang, text: T, colorLogos } = JSON.parse(document.getElementById('hub-data').textContent);
const en = lang === 'en';
const colour = new Set(colorLogos);
const NS = 'http://www.w3.org/2000/svg';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const dots = (d) => (d ? String(d).slice(0, 10).replace(/-/g, '.') : '');
const num = (v) => (v != null && v !== '' && Number.isFinite(+v) ? +v : null);
const one = (v) => (num(v) == null ? '—' : num(v).toFixed(1));
const shown = (v) => (v == null || v === '' ? '—' : String(v));
const safeUrl = (u) => (/^(\/|\.{0,2}\/|https?:)/.test(String(u ?? '')) ? String(u) : '#');
const safeColour = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c ?? '')) ? String(c) : '');
/** A {zh, en} label in the page's language (a plain string is taken as is). */
const say = (l) => (l && typeof l === 'object' ? (en ? l.en ?? l.zh : l.zh ?? l.en) : l) ?? '';
const pad2 = (n) => String(n).padStart(2, '0');
const r1 = (n) => Math.round(n * 10) / 10;

/** The four-point star: tips on the axes, sides curving in to a waist (the Stellar star). */
function star(x, y, R, waist = 0.4) {
  const k = (waist / Math.SQRT2 - 0.25) * 2 * R;
  const n = r1;
  return `M${n(x)} ${n(y - R)}q${n(k)} ${n(R - k)} ${n(R)} ${n(R)}q${n(k - R)} ${n(k)} ${n(-R)} ${n(R)}q${n(-k)} ${n(k - R)} ${n(-R)} ${n(-R)}q${n(R - k)} ${n(-k)} ${n(R)} ${n(-R)}z`;
}

/** A small seeded random source: the same topic id always draws the same sky. */
function seeded(text) {
  let a = 2166136261;
  for (const ch of String(text)) a = Math.imul(a ^ ch.codePointAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the entrance timeline ----------
// The page's head marks <html class="is-entering"> and the moment it did (window.__hubT0) when motion is welcome.
// Everything that comes in later is given a delay that keeps it on that one timeline (ms from the start);
// if the topic data is late, the plate's part of the sequence starts when it arrives instead.
// Order: ruler and wordmark → the plate opens → window frames draw → their grids sweep in → constellations
// connect → the readout scale extends → the ranked stars light → stillness.
const T0 = typeof window.__hubT0 === 'number' ? window.__hubT0 : performance.now();
const PLATE = 220; // when the plate starts to open
const PAGE = (i) => PLATE + 80 + i * 60; // when page i starts (its window frame begins to draw)
let shift = 0;
const since = () => performance.now() - T0;
const at = (ms) => `${Math.round(ms + shift - since())}ms`;
const anim = (kind, ms, du, style = '') =>
  ` data-in="${kind}" style="${style}--dl:${at(ms)}${du ? `;--du:${du}ms` : ''}"`;

// ---------- theme and language ----------

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const now = html.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
  const next = now === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  try {
    localStorage.setItem('theme', next); // the key the topic sites read too
  } catch {}
});

// the language switch remembers the choice (the topic sites read the same key)
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('[data-lang-switch]');
  if (!a) return;
  try {
    localStorage.setItem('octa.lang', a.dataset.langSwitch);
  } catch {}
});

// ---------- the pages ----------

function logo(m) {
  const name = String(m?.logo || '').replace(/[^\w-]/g, '');
  if (!name) return '<span class="logo" aria-hidden="true"></span>';
  const c = colour.has(name);
  return `<span class="logo${c ? ' is-color' : ''}" style="--icon:url(&quot;${root}logos/${name}${c ? '-color' : ''}.svg&quot;)" aria-hidden="true"></span>`;
}

const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';
const STAR22 = 'M11 0Q11.72 10.28 22 11Q11.72 11.72 11 22Q10.28 11.72 0 11Q10.28 10.28 11 0Z';

/** kind "ranking": ordered rows { model, value, max }, read off a scale under the window (the window's width is
 *  the scale from 0 to max). Rows are named α, β, γ … in rank order: vendor mark, "name (effort)", the value,
 *  and a leader from 0 whose length is value / max with a star at its end; the first is the flare star. */
function ranking(f, b) {
  const items = Array.isArray(f.items) ? f.items : [];
  if (!items.length) return `<p class="feature-none">${esc(T.featureEmpty)}</p>`;
  const max = num(items[0]?.max);
  const row = (it, i) => {
    const m = it.model ?? {};
    const label = `${m.name ?? ''}${m.effort ? ` (${m.effort})` : ''}`;
    const value = num(it.value);
    const top = num(it.max);
    const share = value != null && top ? Math.max(0, Math.min(1, value / top)) : 0;
    const sr = [fill(T.rank, { n: i + 1 }), label, top ? fill(T.of, { value: one(value), max: shown(it.max) }) : one(value)].join(en ? ', ' : '，');
    const t = b + i * 38;
    return `<li class="rank-row${i === 0 ? ' is-best' : ''}"${anim('come', t, 0, `--v:${share};`)}>
      <span class="rank-who" aria-hidden="true">
        <span class="rank-g">${GREEK[i] ?? i + 1}</span>${logo(m)}
        <span class="mname" title="${esc(label)}"><span class="mname-text">${esc(m.name)}</span>${m.effort ? `<span class="mname-effort">(${esc(m.effort)})</span>` : ''}</span>
        <span class="rank-value">${one(value)}</span>
      </span>
      <span class="rank-track" aria-hidden="true">${top ? `<i class="rank-lead"${anim('extend', t + 20, 280)}></i><svg class="rank-star" viewBox="0 0 22 22"${anim('light', t + 300, 140)}><path d="${STAR22}"/></svg>` : ''}</span>
      <span class="sr-only">${esc(sr)}</span>
    </li>`;
  };
  const axis = max
    ? `<div class="rank-axis" aria-hidden="true"${anim('wipe', b + 40, 340)}>${[0, 0.5, 1]
        .map((p) => `<span style="--at:${p}">${shown(r1(max * p))}</span>`)
        .join('')}</div>`
    : '';
  return `<ol class="rank-list">${items.map(row).join('')}</ol>${axis}`;
}

// One drawing per feature kind. A new kind (e.g. a gallery for a showcase topic) is one more entry here.
const FEATURES = { ranking };

function feature(f, b) {
  const draw = f && FEATURES[f.kind];
  if (!draw) return '';
  const title = say(f.title);
  return `<div class="topic-feature" data-kind="${esc(f.kind)}">
      ${title ? `<h4 class="feature-head"${anim('wipe', b - 60, 300)}><i aria-hidden="true">//</i>${esc(title)}</h4>` : ''}
      ${draw(f, b)}
    </div>`;
}

function card(t, i) {
  const soon = t.status === 'soon' || !t.url;
  const draft = !soon && t.status !== 'online';
  const name = en ? t.name_en || t.name : t.name;
  const other = en ? t.name : t.name_en;
  const href = en ? `${String(t.url ?? '').replace(/\/?$/, '/')}en/` : t.url;
  const accent = safeColour(t.accent);
  const stats = soon || !Array.isArray(t.stats) ? [] : t.stats;
  const b = PAGE(i);
  const block = soon ? '' : feature(t.feature, b + 340);
  const about = say(t.about);
  const stat = (s) => `<div><dt>${esc(say(s.label))}</dt><dd>${esc(shown(s.value))}</dd></div>`;
  const style = [accent ? `--topic:${accent}` : '', `--dl-tab:${at(b)}`].filter(Boolean).join(';');
  return `<li class="topic ${soon ? 'is-soon' : 'is-open'}${draft ? ' is-draft' : ''}${block ? ' has-feature' : ''}" data-id="${esc(t.id)}" style="${style}">
    <div class="topic-id"${anim('wipe', b + 60, 380)}>
      <p class="topic-tag"><span class="topic-no">No.${pad2(i + 1)}</span>${other ? `<span class="topic-eyebrow" lang="${en ? 'zh-CN' : 'en'}"><i aria-hidden="true">//</i>${esc(other)}</span>` : ''}</p>
      <h3 class="topic-name">${soon ? esc(name) : `<a class="topic-link" href="${esc(safeUrl(href))}">${esc(name)}</a>`}</h3>
      ${soon ? `<p class="topic-mark">${esc(T.soon)}</p>` : ''}
      ${draft ? `<p class="topic-draft"><b>${esc(T.draft)}</b>${esc(T.draftNote)}</p>` : ''}
      ${about ? `<p class="topic-about">${esc(about)}</p>` : ''}
    </div>
    <div class="topic-window" aria-hidden="true"><svg class="win" focusable="false"></svg></div>
    ${stats.length ? `<dl class="topic-stats"${anim('wipe', b + 140, 380)}>${stats.map(stat).join('')}</dl>` : ''}
    ${block}
    ${soon ? '' : `<p class="topic-foot"${anim('wipe', b + 480, 320)}><span class="topic-date">${t.updated ? esc(fill(T.updated, { date: dots(t.updated) })) : ''}</span><span class="topic-go" aria-hidden="true">${esc(T.open)}<svg viewBox="0 0 18 12"><path d="M0 6H16M11 1L16 6L11 11"/></svg></span></p>`}
  </li>`;
}

// ---------- the windows: frame, grid, constellation ----------

// Figures relative to their brightest star (the tail, at 0,0): x in window widths (drawn to the left, mirrored
// when there is more room on the right), y in window heights upwards. Edges join star indexes.
const FIGURES = [
  { stars: [[0, 0, 1], [-0.12, -0.3, 2], [-0.36, -0.22, 3], [-0.5, -0.52, 2], [-0.24, -0.62, 3], [-0.06, -0.72, 2]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [4, 5]] },
  { stars: [[0, 0, 1], [-0.2, -0.24, 2], [-0.44, -0.12, 3], [-0.56, -0.44, 2], [-0.3, -0.58, 2], [-0.08, -0.66, 3]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [4, 5]] },
  { stars: [[0, 0, 1], [-0.16, -0.36, 2], [-0.42, -0.3, 3], [-0.52, -0.62, 2], [-0.22, -0.7, 3], [0.04, -0.56, 2]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 1]] },
];
const MAG = { 1: 8, 2: 5.2, 3: 3.7 };
const INSET = 16; // nothing drawn closer than this to the frame

const el = (name, attrs, cls) => {
  const e = document.createElementNS(NS, name);
  if (cls) e.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  return e;
};
/** an element on the entrance timeline: `kind` draw | light | wipe, starting at `ms`, lasting `du` */
const timed = (e, kind, ms, du) => {
  e.dataset.in = kind;
  e.style.setProperty('--dl', at(ms));
  e.style.setProperty('--du', `${du}ms`);
  if (kind === 'draw') e.setAttribute('pathLength', '1');
  return e;
};

/** offset of an element inside `host` from layout (ignores the transforms of the entrance) */
function offset(node, host) {
  let x = 0;
  let y = 0;
  for (let n = node; n && n !== host; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

/** a segment from a to b, stopped short of both stars; `part` < 1 stops it part of the way */
function segment(a, b, ga, gb, part = 1) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const x1 = a.x + ux * ga;
  const y1 = a.y + uy * ga;
  const len = Math.max(0, d - ga - gb) * part;
  return { x1, y1, x2: x1 + ux * len, y2: y1 + uy * len, ux, uy };
}
const pathOf = (s) => `M${r1(s.x1)} ${r1(s.y1)}L${r1(s.x2)} ${r1(s.y2)}`;

let maskNo = 0;
/** a mask that draws dashed lines in along their length during the entrance (dashes can't use pathLength) */
function revealMask(svg, W, H) {
  const id = `reveal-${++maskNo}`;
  const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -40, y: -40, width: W + 80, height: H + 80 });
  svg.append(mask);
  const add = (d, ms, du) =>
    mask.append(timed(el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-linecap': 'square' }), 'draw', ms, du));
  return { url: `url(#${id})`, add };
}

/** the frame, its ticks and labels, and an even grid inside; returns the grid pitch */
function frame(svg, W, H, rand, { pitch, dashed, b }) {
  const cols = Math.max(2, Math.round(W / pitch));
  const step = W / cols;
  const grid = el('g', {}, 'grid');
  for (let k = 1; k < cols; k++) grid.append(el('path', { d: `M${r1(k * step)} 0V${r1(H)}` }));
  const rows = [];
  for (let y = H - step; y > step * 0.5; y -= step) rows.push(y);
  rows.forEach((y) => grid.append(el('path', { d: `M0 ${r1(y)}H${r1(W)}` })));
  svg.append(timed(grid, 'wipe', b + 200, 360));

  // ticks outside the frame on all four edges, longer every fifth on top and bottom
  const ticks = el('g', {}, 'ticks');
  for (let k = 0; k <= cols; k++) {
    const x = r1(k * step);
    const len = k % 5 === 0 ? 7 : 4;
    ticks.append(el('path', { d: `M${x} 0V${-len}M${x} ${r1(H)}V${r1(H + len)}` }));
  }
  rows.forEach((y) => ticks.append(el('path', { d: `M0 ${r1(y)}H-4M${r1(W)} ${r1(y)}H${r1(W + 4)}` })));
  svg.append(timed(ticks, 'light', b + 300, 200));

  // a few coordinates on the map frame: right ascension along the top (growing to the left), declination on the right
  const h0 = Math.floor(rand() * 20);
  const d0 = (Math.floor(rand() * 7) - 3) * 10;
  const labels = el('g', {}, 'coord');
  const nRa = cols >= 8 ? 3 : 2;
  const ra = Array.from({ length: nRa }, (_, j) => Math.round((cols * (j + 1)) / (nRa + 1)));
  ra.forEach((k, n) => {
    const t = el('text', { x: r1(k * step), y: -12, 'text-anchor': 'middle' });
    t.textContent = `${pad2((h0 + ra.length - 1 - n) % 24)}h`;
    labels.append(t);
  });
  [rows[1], rows[3]].filter(Boolean).forEach((y, n) => {
    const t = el('text', { x: r1(W + 9), y: r1(y + 3.5) });
    const d = d0 + (n + 1) * 10;
    t.textContent = `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}°`;
    labels.append(t);
  });
  svg.append(timed(labels, 'light', b + 320, 200));

  const box = `M0.5 0.5H${r1(W - 0.5)}V${r1(H - 0.5)}H0.5Z`;
  if (dashed) {
    const reveal = revealMask(svg, W, H);
    svg.append(el('path', { d: box, mask: reveal.url }, 'frame is-dashed'));
    reveal.add(box, b, 360);
  } else {
    svg.append(timed(el('path', { d: box }, 'frame'), 'draw', b, 360));
  }
  return step;
}

/** lay a figure out inside the window with its brightest star at (tx, ty) */
function place(fig, tx, ty, W, H) {
  const right = tx < W / 2; // more room on the right: mirror the figure
  const xs = fig.stars.map(([x]) => (right ? -x : x) * W);
  const ys = fig.stars.map(([, y]) => y * H);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const s = Math.min(
    1,
    minX < 0 ? (tx - INSET) / -minX : 1,
    maxX > 0 ? (W - INSET - tx) / maxX : 1,
    minY < 0 ? (ty - INSET) / -minY : 1,
  );
  return fig.stars.map(([, , m], k) => ({ x: tx + xs[k] * s, y: ty + ys[k] * s, m, r: MAG[m] }));
}

function drawWindow(li, i) {
  const win = li.querySelector('.topic-window');
  const svg = win?.querySelector('.win');
  if (!svg) return;
  const W = win.clientWidth;
  const H = win.clientHeight;
  if (!W || !H) return; // 还没排版出宽高时不画：网格步长会是 0；尺寸一出来 ResizeObserver 会再画一次
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const soon = li.classList.contains('is-soon');
  const rand = seeded(li.dataset.id || i);
  const fig = FIGURES[Math.floor(rand() * FIGURES.length)];
  const b = PAGE(i);
  const rows = [...li.querySelectorAll('.rank-row')].slice(0, 3);
  // with a ranking, the window's width is the readout's scale: one grid column per tenth of it
  frame(svg, W, H, rand, { pitch: rows.length ? W / 10 : 34, dashed: soon, b });

  const lines = el('g', {});
  const marks = el('g', {});
  svg.append(lines, marks);

  // the brightest star stands right above the first ranked star, so one straight leader joins them
  const first = rows[0];
  const v = first ? Number(first.style.getPropertyValue('--v')) || 0 : soon ? 0.72 : 0.6;
  const tx = Math.min(W - INSET - 6, Math.max(INSET + 6, v * W));
  const stars = place(fig, tx, H * (soon ? 0.7 : 0.8), W, H);

  // draw order: outwards from the brightest star, star by star
  const depth = stars.map(() => Infinity);
  depth[0] = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [a, c] of fig.edges) {
      if (depth[a] + 1 < depth[c]) (depth[c] = depth[a] + 1), (changed = true);
      if (depth[c] + 1 < depth[a]) (depth[a] = depth[c] + 1), (changed = true);
    }
  }
  const F = b + 320; // the constellation starts to connect
  const STEP = 60;
  const DU = 140;
  const litAt = (k) => F + depth[k] * STEP + (depth[k] ? DU - STEP : 0);

  // a few faint stray stars, inside the window only
  const loose = [];
  for (let guard = 0; loose.length < 5 && guard < 80; guard++) {
    const p = { x: INSET + rand() * (W - 2 * INSET), y: INSET + rand() * (H - 2 * INSET) };
    if ([...stars, ...loose].some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 24)) continue;
    loose.push(p);
  }

  if (!soon) {
    for (const [a, c] of fig.edges) {
      const [u, w] = depth[a] <= depth[c] ? [a, c] : [c, a];
      lines.append(timed(el('path', { d: pathOf(segment(stars[u], stars[w], stars[u].r + 4, stars[w].r + 4)) }, 'ln'), 'draw', F + depth[u] * STEP, DU));
    }
    stars.forEach((s, k) => marks.append(timed(el('path', { d: star(s.x, s.y, s.r, s.m === 1 ? 0.32 : 0.38) }, `st m${s.m}`), 'light', litAt(k), 140)));
    loose.forEach((p, k) => marks.append(timed(el('path', { d: star(p.x, p.y, 1.8 + (k % 2) * 0.6, 0.44) }, 'st faint'), 'light', F + 60 + k * 38, 140)));

    // the one leader out of the window: from the brightest star straight down to α on the readout scale
    if (first?.querySelector('.rank-star')) {
      const tr = offset(first.querySelector('.rank-track'), li);
      const wo = offset(win, li);
      const ay = tr.y + tr.h / 2 - wo.y;
      const ax = tr.x - wo.x + v * tr.w;
      const lit = b + 340 + 300; // when α lights (the first row's star, see ranking())
      const s = segment(stars[0], { x: ax, y: ay }, stars[0].r + 4, 14);
      lines.append(timed(el('path', { d: pathOf(s) }, 'ln lead'), 'draw', lit - 200, 200));
    }
    return;
  }

  // still being surveyed: hollow stars, construction lines in starlight cyan (some stopped half way with a
  // pencil tick), and a protractor laid in the window's lower left corner
  const reveal = revealMask(svg, W, H);
  const dashed = el('g', { mask: reveal.url });
  lines.append(dashed);
  fig.edges.forEach(([a, c], k) => {
    const [u, w] = depth[a] <= depth[c] ? [a, c] : [c, a];
    const part = k % 3 === 1 ? 0.4 + rand() * 0.25 : 1;
    const s = segment(stars[u], stars[w], stars[u].r + 5, stars[w].r + 5, part);
    const ms = F + depth[u] * STEP;
    const du = Math.round(DU * (0.4 + 0.6 * part));
    dashed.append(el('path', { d: pathOf(s) }, 'cl'));
    reveal.add(pathOf(s), ms, du);
    if (part < 1) {
      const tx2 = -s.uy * 4;
      const ty2 = s.ux * 4;
      lines.append(timed(el('path', { d: `M${r1(s.x2 - tx2)} ${r1(s.y2 - ty2)}L${r1(s.x2 + tx2)} ${r1(s.y2 + ty2)}` }, 'ce'), 'light', ms + du, 100));
    }
  });
  const R = Math.min(W, H) * 0.36;
  const arc = `M0 ${r1(H - R)}A${r1(R)} ${r1(R)} 0 0 1 ${r1(R)} ${r1(H)}`;
  lines.append(timed(el('path', { d: arc }, 'arc'), 'draw', b + 420, 360));
  const ticks = el('g', {}, 'arc-ticks');
  for (let k = 1; k < 9; k++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (k / 9);
    const len = k % 3 === 0 ? 8 : 4;
    const p = { x: Math.cos(a) * R, y: H + Math.sin(a) * R };
    const q = { x: Math.cos(a) * (R - len), y: H + Math.sin(a) * (R - len) };
    ticks.append(el('path', { d: `M${r1(p.x)} ${r1(p.y)}L${r1(q.x)} ${r1(q.y)}` }));
  }
  lines.append(timed(ticks, 'light', b + 700, 160));
  stars.forEach((s, k) => marks.append(timed(el('path', { d: star(s.x, s.y, s.r + 0.6, 0.4) }, 'cs'), 'light', litAt(k), 140)));
  loose.forEach((p, k) => marks.append(timed(el('path', { d: star(p.x, p.y, 2, 0.44) }, 'cs faint'), 'light', F + 60 + k * 38, 140)));
}

/** the plate: its edge (the top one is the ruler) and a binding line between neighbouring pages */
function drawPlate() {
  const plate = document.querySelector('.plate');
  const svg = plate?.querySelector('.plate-sky');
  if (!svg) return;
  const W = plate.clientWidth;
  const H = plate.clientHeight;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const cut = 52;
  svg.append(el('path', { d: `M${W - 0.5} 0V${H - cut}L${W - cut} ${H - 0.5}H0.5V0` }, 'edge'));

  const pages = [...plate.querySelectorAll('.topic')];
  pages.forEach((li, k) => {
    if (!k) return;
    const side = Math.abs(pages[k - 1].offsetTop - li.offsetTop) < 2;
    const x = li.offsetLeft;
    const y = li.offsetTop;
    const len = side ? li.offsetHeight : W;
    const d = side ? `M${x} ${y + 24}V${y + len - 24}` : `M24 ${y}H${W - 24}`;
    const bind = el('g', {}, 'bind');
    bind.append(timed(el('path', { d }), 'draw', PLATE + 160, 460));
    const marks = el('g', {});
    const n = 6;
    for (let j = 1; j < n; j++) {
      const p = side ? { x, y: y + 24 + ((len - 48) * j) / n } : { x: 24 + ((W - 48) * j) / n, y };
      marks.append(el('path', { d: side ? `M${p.x - 4} ${r1(p.y)}H${p.x + 4}` : `M${r1(p.x)} ${p.y - 4}V${p.y + 4}` }));
    }
    bind.append(timed(marks, 'light', PLATE + 520, 160));
    svg.append(bind);
  });
  pages.forEach(drawWindow);
}

// ---------- page ----------

const slot = document.querySelector('[data-slot="topics"]');
const note = (s) => `<li class="topics-note">${esc(s)}</li>`;

function fields(data, topics) {
  const open = topics.filter((t) => t.status === 'online').length;
  const n = topics.length;
  const parts = [
    data.updated ? fill(esc(T.dataUpdated), { date: `<b>${esc(dots(data.updated))}</b>` }) : '',
    n ? (en && n === 1 ? esc(T.countOne) : fill(esc(T.count), { n: `<b>${pad2(n)}</b>` })) : '',
    n ? fill(esc(T.openCount), { n: `<b>${pad2(open)}</b>` }) : '',
  ].filter(Boolean);
  const box = document.querySelector('[data-slot="fields"]');
  if (box) box.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const atlas = document.querySelector('.atlas');
  let topics = [];
  try {
    const r = await (window.__hubData ?? fetch(`${root}data/topics.json`, { cache: 'no-cache' }));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    topics = Array.isArray(data.topics) ? data.topics : [];
    shift = Math.max(0, since() - PLATE);
    slot.innerHTML = topics.length ? topics.map(card).join('') : note(T.empty);
    fields(data, topics);
    const up = document.querySelector('[data-slot="updated"]');
    if (up && data.updated) up.textContent = fill(T.dataUpdated, { date: dots(data.updated) });
  } catch (e) {
    console.error(e);
    slot.innerHTML = note(T.failed);
  }
  slot.removeAttribute('aria-busy');
  atlas.style.setProperty('--dl', at(PLATE));
  atlas.classList.add('is-on');
  // the windows are drawn from the laid-out page: once the font is in, and again whenever the plate changes size
  await Promise.race([document.fonts?.ready, sleep(700)]);
  drawPlate();
  let frameNo = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frameNo);
    frameNo = requestAnimationFrame(drawPlate);
  }).observe(document.querySelector('.plate'));
  // the sequence ends; from here on the page is still
  setTimeout(() => html.classList.remove('is-entering'), Math.max(0, 1150 + shift + topics.length * 60 - since()));
}

main();
