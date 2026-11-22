// The hub: one star chart. Every topic card in data/topics.json (format: website/hub/README.md) becomes a
// region of the plate with its own constellation in the card's accent. The hub knows no topic: a region is
// drawn from the card's own fields, its feature block by `feature.kind` (FEATURES below), and a card with
// status "soon" (a topic announced in its manifest, no site yet) is drawn as a sky still being charted.
// Static text and settings come from the page (<script id="hub-data">, written from site.config.mjs).
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
const T0 = typeof window.__hubT0 === 'number' ? window.__hubT0 : performance.now();
const PLATE = 360; // when the plate starts to open
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

// ---------- the regions ----------

function logo(m) {
  const name = String(m?.logo || '').replace(/[^\w-]/g, '');
  if (!name) return '<span class="logo" aria-hidden="true"></span>';
  const c = colour.has(name);
  return `<span class="logo${c ? ' is-color' : ''}" style="--icon:url(&quot;${root}logos/${name}${c ? '-color' : ''}.svg&quot;)" aria-hidden="true"></span>`;
}

const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';
const STAR22 = 'M11 0Q11.72 10.28 22 11Q11.72 11.72 11 22Q10.28 11.72 0 11Q10.28 10.28 11 0Z';

/** kind "ranking": ordered rows { model, value, max }. The rows are the constellation's brightest stars, named
 *  α, β, γ … in rank order: vendor mark, "name (effort)", a leader from 0 whose length is value / max with a
 *  star at its end, and the value. The first is the flare star. */
function ranking(f, base) {
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
    const t = base + i * 38;
    return `<li class="rank-row${i === 0 ? ' is-best' : ''}"${anim('come', t + 20, 0, `--v:${share};`)}>
      <span class="rank-g" aria-hidden="true">${GREEK[i] ?? i + 1}</span>
      ${logo(m)}
      <span class="mname" title="${esc(label)}" aria-hidden="true"><span class="mname-text">${esc(m.name)}</span>${m.effort ? `<span class="mname-effort">(${esc(m.effort)})</span>` : ''}</span>
      <span class="rank-track" aria-hidden="true">${top ? `<i class="rank-lead"${anim('extend', t + 60, 420)}></i><svg class="rank-star" viewBox="0 0 22 22"${anim('light', t + 480, 160)}><path d="${STAR22}"/></svg>` : ''}</span>
      <span class="rank-value" aria-hidden="true">${one(value)}</span>
      <span class="sr-only">${esc(sr)}</span>
    </li>`;
  };
  const axis = max
    ? `<div class="rank-axis" aria-hidden="true"${anim('wipe', base + 120, 420)}><span class="rank-axis-scale">${[0, 0.5, 1]
        .map((p) => `<span style="--at:${p}">${shown(r1(max * p))}</span>`)
        .join('')}</span></div>`
    : '';
  return `<ol class="rank-list">${items.map(row).join('')}</ol>${axis}`;
}

// One drawing per feature kind. A new kind (e.g. a gallery for a showcase topic) is one more entry here.
const FEATURES = { ranking };

function feature(f, base) {
  const draw = f && FEATURES[f.kind];
  if (!draw) return '';
  const title = say(f.title);
  return `<div class="topic-feature" data-kind="${esc(f.kind)}">
      ${title ? `<h4 class="feature-head"${anim('wipe', base, 360)}><i aria-hidden="true">//</i>${esc(title)}</h4>` : ''}
      ${draw(f, base)}
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
  const b = PLATE + 240 + i * 100; // this region's part of the sequence
  const block = soon ? '' : feature(t.feature, b + 100);
  const about = say(t.about);
  const stat = (s) => `<div><dt>${esc(say(s.label))}</dt><dd>${esc(shown(s.value))}</dd></div>`;
  const style = [accent ? `--topic:${accent}` : '', `--dl-tab:${at(b + 40)}`].filter(Boolean).join(';');
  return `<li class="topic ${soon ? 'is-soon' : 'is-open'}${draft ? ' is-draft' : ''}${block ? ' has-feature' : ''}" data-id="${esc(t.id)}" style="${style}">
    <svg class="topic-sky" aria-hidden="true" focusable="false"></svg>
    <div class="topic-id"${anim('wipe', b, 420)}>
      <p class="topic-tag"><span class="topic-no">No.${pad2(i + 1)}</span>${other ? `<span class="topic-eyebrow" lang="${en ? 'zh-CN' : 'en'}"><i aria-hidden="true">//</i>${esc(other)}</span>` : ''}</p>
      <h3 class="topic-name">${soon ? esc(name) : `<a class="topic-link" href="${esc(safeUrl(href))}">${esc(name)}</a>`}</h3>
      ${soon ? `<p class="topic-mark">${esc(T.soon)}</p>` : ''}
      ${draft ? `<p class="topic-draft"><b>${esc(T.draft)}</b>${esc(T.draftNote)}</p>` : ''}
      ${about ? `<p class="topic-about">${esc(about)}</p>` : ''}
    </div>
    <div class="topic-skybox" aria-hidden="true"></div>
    ${stats.length ? `<dl class="topic-stats"${anim('wipe', b + 60, 420)}>${stats.map(stat).join('')}</dl>` : ''}
    ${block}
    ${soon ? '' : `<p class="topic-foot"${anim('wipe', b + 420, 360)}><span class="topic-date">${t.updated ? esc(fill(T.updated, { date: dots(t.updated) })) : ''}</span><span class="topic-go" aria-hidden="true">${esc(T.open)}<svg viewBox="0 0 18 12"><path d="M0 6H16M11 1L16 6L11 11"/></svg></span></p>`}
  </li>`;
}

// ---------- the sky: grid, boundaries and one constellation per region ----------

// Figures in a region's sky box (0–1 on both axes). `tail` is the star the brightest ranked star hangs from.
const FIGURES = [
  { stars: [[0.14, 0.2, 2], [0.4, 0.34, 1], [0.68, 0.16, 3], [0.9, 0.42, 2], [0.62, 0.6, 3], [0.36, 0.82, 2]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [4, 5]], tail: 5 },
  { stars: [[0.1, 0.46, 3], [0.3, 0.2, 2], [0.54, 0.34, 1], [0.8, 0.12, 3], [0.9, 0.56, 2], [0.6, 0.78, 2]], edges: [[0, 1], [1, 2], [2, 3], [2, 5], [5, 4], [4, 3]], tail: 5 },
  { stars: [[0.2, 0.18, 2], [0.48, 0.08, 3], [0.76, 0.26, 1], [0.64, 0.56, 2], [0.36, 0.48, 3], [0.88, 0.8, 2]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [3, 5]], tail: 5 },
];
const MAG = { 1: 7.5, 2: 5.4, 3: 3.8 };

const el = (name, attrs, cls) => {
  const e = document.createElementNS(NS, name);
  if (cls) e.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  return e;
};
/** an element on the entrance timeline: `kind` draw | light, starting at `ms`, lasting `du` */
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

/** a segment from a to b, stopped short of both stars */
function segment(a, b, ga, gb, part = 1) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const x1 = a.x + ux * ga;
  const y1 = a.y + uy * ga;
  const len = Math.max(0, d - ga - gb) * part;
  return { x1, y1, x2: x1 + ux * len, y2: y1 + uy * len, ux, uy, len };
}
const pathOf = (s) => `M${r1(s.x1)} ${r1(s.y1)}L${r1(s.x2)} ${r1(s.y2)}`;

/** a mask that draws dashed lines in along their length during the entrance (dashes can't use pathLength) */
function revealMask(svg, id, W, H) {
  const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
  svg.append(mask);
  return (d, ms, du, cls) => {
    mask.append(timed(el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-linecap': 'round' }, cls), 'draw', ms, du));
  };
}

let maskNo = 0;

function drawRegion(li, i) {
  const svg = li.querySelector('.topic-sky');
  const skyEl = li.querySelector('.topic-skybox');
  if (!svg || !skyEl) return;
  const W = li.offsetWidth;
  const H = li.offsetHeight;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const soon = li.classList.contains('is-soon');
  const rand = seeded(li.dataset.id || i);
  const fig = FIGURES[Math.floor(rand() * FIGURES.length)];
  const box = offset(skyEl, li);
  const px = { x: box.x + 18, y: box.y + 10, w: Math.max(60, box.w - 36), h: Math.max(60, box.h - (soon ? 34 : 22)) };
  const stars = fig.stars.map(([x, y, m]) => ({ x: px.x + x * px.w, y: px.y + y * px.h, m, r: MAG[m] }));
  const b = PLATE + 240 + i * 100;
  const F = b - (soon ? 20 : 80); // the figure starts drawing, just before the region's labels

  // depth of each star from the first one, so the lines draw outwards star by star
  const depth = stars.map(() => Infinity);
  depth[0] = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [a, c] of fig.edges) {
      if (depth[a] + 1 < depth[c]) (depth[c] = depth[a] + 1), (changed = true);
      if (depth[c] + 1 < depth[a]) (depth[a] = depth[c] + 1), (changed = true);
    }
  }
  const STEP = 80;
  const DU = 180;
  const litAt = (k) => F + (depth[k] === 0 ? 0 : depth[k] * STEP + DU - STEP);

  const lines = el('g', {});
  const marks = el('g', {});
  svg.append(lines, marks);

  // a few faint loose stars around the figure
  const loose = [];
  for (let k = 0, guard = 0; k < 5 && guard < 60; guard++) {
    const p = { x: px.x + rand() * px.w, y: px.y + rand() * px.h };
    if ([...stars, ...loose].some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 26)) continue;
    loose.push(p);
    k++;
  }

  if (!soon) {
    for (const [a, c] of fig.edges) {
      const [u, v] = depth[a] <= depth[c] ? [a, c] : [c, a];
      const s = segment(stars[u], stars[v], stars[u].r + 4, stars[v].r + 4);
      lines.append(timed(el('path', { d: pathOf(s) }, 'ln'), 'draw', F + depth[u] * STEP, DU));
    }
    stars.forEach((s, k) => marks.append(timed(el('path', { d: star(s.x, s.y, s.r, s.m === 1 ? 0.32 : 0.38) }, `st m${s.m}`), 'light', litAt(k), 160)));
    loose.forEach((p, k) => marks.append(timed(el('path', { d: star(p.x, p.y, 2 + (k % 2) * 0.6, 0.44), opacity: 0.55 }, 'st'), 'light', F + 120 + k * 45, 160)));

    // the tail: the brightest ranked stars (the leaders' ends) hang from the figure
    const rows = [...li.querySelectorAll('.rank-row')].slice(0, 3);
    const data = rows.map((row, k) => {
      const tr = offset(row.querySelector('.rank-track'), li);
      const v = Number(row.style.getPropertyValue('--v')) || 0;
      return { x: tr.x + v * tr.w, y: tr.y + tr.h / 2, r: k === 0 ? 11 : 7.5, lit: b + 100 + k * 38 + 480 + 160 };
    });
    if (data.length && rows[0].querySelector('.rank-star')) {
      const tail = stars[fig.tail];
      const chain = [tail, ...data];
      for (let k = 0; k < chain.length - 1; k++) {
        const s = segment(chain[k], chain[k + 1], chain[k].r + 4, chain[k + 1].r + 4);
        const start = k === 0 ? Math.max(litAt(fig.tail), data[0].lit - 400) : chain[k].lit - 120;
        const end = k === 0 ? data[0].lit - 160 : chain[k + 1].lit;
        lines.append(timed(el('path', { d: pathOf(s) }, 'ln'), 'draw', start, Math.max(120, end - start)));
      }
    }
    return;
  }

  // still being charted: stars plotted hollow, construction lines in starlight cyan, some of them stopped
  // half way with a pencil tick, and one compass arc around the brightest star
  const reveal = revealMask(svg, `reveal-${++maskNo}`, W, H);
  const dashed = el('g', { mask: `url(#reveal-${maskNo})` });
  lines.append(dashed);
  fig.edges.forEach(([a, c], k) => {
    const [u, v] = depth[a] <= depth[c] ? [a, c] : [c, a];
    const part = k % 3 === 1 ? 0.38 + rand() * 0.3 : 1;
    const s = segment(stars[u], stars[v], stars[u].r + 5, stars[v].r + 5, part);
    const ms = F + depth[u] * STEP;
    const du = Math.round(DU * (0.4 + 0.6 * part));
    dashed.append(el('path', { d: pathOf(s) }, 'cl'));
    reveal(pathOf(s), ms, du);
    if (part < 1) {
      const tx = -s.uy * 4;
      const ty = s.ux * 4;
      lines.append(timed(el('path', { d: `M${r1(s.x2 - tx)} ${r1(s.y2 - ty)}L${r1(s.x2 + tx)} ${r1(s.y2 + ty)}` }, 'ce'), 'light', ms + du, 120));
    }
  });
  // a protractor arc round the brightest star, on the side away from the rest of the figure
  const bright = stars.find((s) => s.m === 1) ?? stars[0];
  const cx = stars.reduce((t, s) => t + s.x, 0) / stars.length;
  const cy = stars.reduce((t, s) => t + s.y, 0) / stars.length;
  const away = Math.atan2(bright.y - cy, bright.x - cx);
  const R = Math.max(36, Math.min(70, Math.min(px.w, px.h) * 0.34));
  const span = (Math.PI * 7) / 9; // 140°
  const a0 = away - span / 2;
  const pt = (a, rr = R) => ({ x: bright.x + Math.cos(a) * rr, y: bright.y + Math.sin(a) * rr });
  const p0 = pt(a0);
  const p1 = pt(a0 + span);
  const arc = `M${r1(p0.x)} ${r1(p0.y)}A${r1(R)} ${r1(R)} 0 0 1 ${r1(p1.x)} ${r1(p1.y)}`;
  lines.append(timed(el('path', { d: arc }, 'arc'), 'draw', F + 120, 480));
  for (let k = 0, n = 14; k <= n; k++) {
    const a = a0 + (span * k) / n;
    const p = pt(a);
    const q = pt(a, R + (k % 7 === 0 ? 7 : 3.5));
    marks.append(timed(el('path', { d: `M${r1(p.x)} ${r1(p.y)}L${r1(q.x)} ${r1(q.y)}` }, 'tick'), 'light', F + 120 + (480 * k) / n, 100));
  }
  stars.forEach((s, k) => marks.append(timed(el('path', { d: star(s.x, s.y, s.r + 0.8, 0.4) }, 'cs'), 'light', litAt(k), 160)));
  loose.forEach((p, k) => marks.append(timed(el('path', { d: star(p.x, p.y, 2.2, 0.44) }, 'cs'), 'light', F + 160 + k * 45, 160)));
}

function drawPlate() {
  const plate = document.querySelector('.plate');
  const svg = plate?.querySelector('.plate-sky');
  if (!svg) return;
  const W = plate.clientWidth;
  const H = plate.clientHeight;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const grid = el('g', {});
  svg.append(grid);

  // the coordinate grid: parallels round a pole far above the plate, meridians running from it
  const P = { x: W * 0.58, y: -W * 1.05 };
  const far = Math.max(Math.hypot(P.x, H - P.y), Math.hypot(W - P.x, H - P.y));
  const parallels = [];
  for (let r = -P.y + 40; r < far; r += 72) parallels.push(r);
  parallels.forEach((r, k) => {
    const side = (x) => P.y + Math.sqrt(Math.max(0, r * r - (x - P.x) ** 2));
    const x0 = Math.max(-20, P.x - r + 1);
    const x1 = Math.min(W + 20, P.x + r - 1);
    const d = `M${r1(x0)} ${r1(side(x0))}A${r1(r)} ${r1(r)} 0 0 0 ${r1(x1)} ${r1(side(x1))}`;
    grid.append(timed(el('path', { d }, 'g soft'), 'draw', PLATE + 100 + (k * 300) / parallels.length, 560));
  });
  const meridians = [];
  for (let x = W * 0.58 - Math.ceil((W * 0.7) / 150) * 150; x < W * 1.2; x += 150) meridians.push(x);
  meridians.forEach((xt, k) => {
    const dx = xt - P.x;
    const dy = -P.y;
    const t = H / dy;
    const d = `M${r1(xt)} 0L${r1(xt + dx * t)} ${r1(H)}`;
    grid.append(timed(el('path', { d }, 'g soft'), 'draw', PLATE + 140 + (k * 300) / meridians.length, 520));
  });

  // the plate's edge (the top one is the ruler), with its cut corner
  const cut = 52;
  svg.append(el('path', { d: `M${W - 0.5} 0V${H - cut}L${W - cut} ${H - 0.5}H0.5V0` }, 'edge'));

  // boundaries between the regions, stepped like constellation borders
  const reveal = revealMask(svg, `reveal-${++maskNo}`, W, H);
  const dashed = el('g', { mask: `url(#reveal-${maskNo})` });
  svg.append(dashed);
  const regions = [...plate.querySelectorAll('.topic')];
  regions.forEach((li, k) => {
    if (!k) return;
    const prev = regions[k - 1];
    const x = li.offsetLeft;
    const y = li.offsetTop;
    const h = li.offsetHeight;
    const w = li.offsetWidth;
    const j = k % 2 ? 18 : -18;
    const d =
      Math.abs(prev.offsetTop - y) < 2
        ? `M${x} ${y}V${r1(y + h * 0.3)}H${x + j}V${r1(y + h * 0.66)}H${x}V${y + h}`
        : `M0 ${y}H${r1(w * 0.42)}V${y + j}H${r1(w * 0.7)}V${y}H${W}`;
    dashed.append(el('path', { d }, 'b'));
    reveal(d, PLATE + 220 + k * 100, 520);
  });

  regions.forEach(drawRegion);
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
  // the sky is drawn from the laid-out page: once the font is in, and again whenever the plate changes size
  await Promise.race([document.fonts?.ready, sleep(700)]);
  drawPlate();
  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawPlate);
  }).observe(document.querySelector('.plate'));
  // the sequence ends; from here on the page is still
  setTimeout(() => html.classList.remove('is-entering'), Math.max(0, 1400 + shift + topics.length * 100 - since()));
}

main();
