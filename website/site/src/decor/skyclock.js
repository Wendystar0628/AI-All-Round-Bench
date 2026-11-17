// 星钟 (website/docs/visual.md 六「星钟」): a page's decor slot as a real astronomical timepiece
// set to the moment the page opened — the leaderboard's last hour of star trails, the categories'
// 28 lunar mansions, the model page's sundial, the zeros' lunation, a task page's water-clock rod,
// the about page's light-time ruler and the FAQ's pointer stars (the home page keeps its orbit).
// Fine ink-2 lines and ink four-point stars; the one violet mark is "now". Low-precision public
// formulas; longitude from the time zone's standard meridian (UTC+8 → 120°E), latitude 35°N, no
// location request, no readouts. Drawn once as inline SVG; the first page of a visit
// (html.is-first-page) plays one entrance to now, then it stays still (motion.md 一.7); reduced
// motion and the calm variant draw the end state.
//
//   import { mountSky } from '../../decor/skyclock.js';
//   mountSky(span, 'trails'); // 'trails' 'mansions' 'ruler' 'sundial' 'lunation' 'louke' 'lighttime' 'pointers'
import { reduced, calm } from '../motion.js';

const NS = 'http://www.w3.org/2000/svg';
const SNAP = 'cubic-bezier(.16, 1, .3, 1)';
let uid = 0;

// ---------- geometry ----------
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
};
const f = (v) => +(+v).toFixed(1);
const rad = (a) => (a * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const wrap360 = (a) => ((a % 360) + 360) % 360;
/** A screen angle from 12 o'clock, clockwise. */
const pol = (cx, cy, r, a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
/** The site's one star shape (charts/star.js), at a point, for merging into one path. */
function starPath(x, y, tip, waist = 0.4) {
  const k = (waist / Math.SQRT2 - 0.25) * 2 * tip;
  const R = tip;
  return `M${f(x)} ${f(y - R)}q${f(k)} ${f(R - k)} ${f(R)} ${f(R)}q${f(k - R)} ${f(k)} ${f(-R)} ${f(R)}q${f(-k)} ${f(k - R)} ${f(-R)} ${f(-R)}q${f(R - k)} ${f(-k)} ${f(R)} ${f(-R)}z`;
}
function sheet(host, W, H) {
  const svg = el('svg', { class: 'sky-svg', viewBox: `0 0 ${f(W)} ${f(H)}`, 'aria-hidden': 'true', focusable: 'false' });
  host.replaceChildren(svg);
  return svg;
}
const spin = (node, x, y) => {
  node.style.transformBox = 'view-box';
  node.style.transformOrigin = `${f(x)}px ${f(y)}px`;
};

// ---------- astronomy (low precision, enough for a picture) ----------
const jd = (d) => d.getTime() / 86400000 + 2440587.5;
const tzLon = (d) => -d.getTimezoneOffset() * 0.25; // the time zone's standard meridian
/** Local sidereal time in degrees. */
const lstDeg = (d) => wrap360(280.46061837 + 360.98564736629 * (jd(d) - 2451545) + tzLon(d));
/** The sun: right ascension, declination, ecliptic longitude (degrees), obliquity (radians). */
function sunPos(d) {
  const n = jd(d) - 2451545;
  const g = rad(357.529 + 0.98560028 * n);
  const q = 280.459 + 0.98564736 * n;
  const L = rad(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * n);
  return { ra: wrap360(deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)))), dec: deg(Math.asin(Math.sin(e) * Math.sin(L))), eps: e };
}
const SYN = 29.530588853;
/** Days since the last new moon (from the new moon of 2000-01-06). */
const moonAge = (d) => (((jd(d) - 2451550.26) % SYN) + SYN) % SYN;
/** Apparent solar time in hours: clock time, the zone meridian, the equation of time. */
function solarHours(d) {
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const B = rad((360 / 365) * (N - 81));
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  return (((utcH + tzLon(d) / 15 + eot / 60) % 24) + 24) % 24;
}

// ---------- bright stars round the north celestial pole (J2000: RA h, Dec °, magnitude) ----------
const STARS = {
  dubhe: [11.062, 61.751, 1.8], merak: [11.031, 56.382, 2.4], phecda: [11.897, 53.695, 2.4], megrez: [12.257, 57.033, 3.3],
  alioth: [12.9, 55.96, 1.8], mizar: [13.399, 54.925, 2.2], alkaid: [13.792, 49.313, 1.9],
  muscida: [8.504, 60.718, 3.4], talitha: [8.987, 48.042, 3.1], thetaUMa: [9.548, 51.678, 3.2], uma23: [9.525, 63.062, 3.7],
  psiUMa: [11.161, 44.498, 3.0], muUMa: [10.372, 41.499, 3.1], lamUMa: [10.285, 42.914, 3.5], chiUMa: [11.768, 47.779, 3.7],
  polaris: [2.53, 89.264, 2.0], yildun: [17.537, 86.586, 4.4], epsUMi: [16.766, 82.037, 4.2], zetUMi: [15.734, 77.795, 4.3],
  kochab: [14.845, 74.156, 2.1], pherkad: [15.346, 71.834, 3.0], etaUMi: [16.292, 75.755, 5.0],
  caph: [0.153, 59.15, 2.3], schedar: [0.675, 56.537, 2.2], navi: [0.945, 60.717, 2.2], ruchbah: [1.43, 60.235, 2.7], segin: [1.907, 63.67, 3.4],
  alderamin: [21.31, 62.585, 2.5], alfirk: [21.478, 70.561, 3.2], errai: [23.656, 77.632, 3.2], iotCep: [22.828, 66.201, 3.5], zetCep: [22.181, 58.201, 3.4],
  thuban: [14.073, 64.376, 3.7], eltanin: [17.943, 51.489, 2.2], rastaban: [17.507, 52.301, 2.8], etaDra: [16.4, 61.514, 2.7],
  zetDra: [17.146, 65.715, 3.2], altais: [19.209, 67.662, 3.1], edasich: [15.416, 58.966, 3.3], thetaDra: [16.031, 58.565, 4.0],
  kapDra: [12.558, 69.788, 3.9], lamDra: [11.523, 69.331, 3.8], xiDra: [17.892, 56.873, 3.7], epsDra: [19.803, 70.268, 3.8],
  capella: [5.278, 45.998, 0.1], menkalinan: [5.992, 44.948, 1.9], deltaAur: [5.992, 54.285, 3.7], mirfak: [3.405, 49.861, 1.8],
  algol: [3.136, 40.956, 2.1], betaCam: [5.057, 60.442, 4.0], alphaCam: [4.901, 66.343, 4.3],
  deneb: [20.69, 45.28, 1.3], vega: [18.616, 38.784, 0.0],
};
const tipOf = (mag) => Math.max(1.8, 2.1 + (4.6 - mag) * 1.15);

// ---------- 排行总榜: the last hour of star trails ----------
function trails(host, d, W, H) {
  const svg = sheet(host, W, H);
  const cx = W + 26;
  const cy = -34;
  const k = Math.max(W, H) / 46;
  const lst = lstDeg(d);
  const arcs = [];
  const heads = [];
  const inside = (x, y) => x > -30 && x < W + 30 && y > -30 && y < H + 30;
  for (const key in STARS) {
    const [ra, dec, mag] = STARS[key];
    const r = (90 - dec) * k;
    const a1 = ra * 15 - lst; // now
    const [x0, y0] = pol(cx, cy, r, a1 + 15); // an hour ago: 15° clockwise
    const [x1, y1] = pol(cx, cy, r, a1);
    if (!inside(x0, y0) && !inside(x1, y1)) continue;
    arcs.push(el('path', { class: 'sky-line', d: `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 0 0 ${f(x1)} ${f(y1)}`, 'stroke-width': f(0.7 + (4.6 - mag) * 0.22), 'stroke-linecap': 'round', pathLength: 1 }, svg));
    heads.push(el('path', { class: 'sky-star', d: starPath(x1, y1, tipOf(mag) * 0.9) }, svg));
  }
  return () => {
    arcs.forEach((p) => p.animate([{ strokeDasharray: '1', strokeDashoffset: 1 }, { strokeDasharray: '1', strokeDashoffset: 0 }], { duration: 900, easing: 'linear' }));
    heads.forEach((s) => s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 860, fill: 'backwards' }));
  };
}

// ---------- 题目类别榜: the 28 lunar mansions and the degrees of the circuit ----------
// 《淮南子·天文训》星分度 (维基文库本: 箕十一又四分之一, 东井三十); they sum to 362¼, spread over one turn.
const XIU = [12, 9, 15, 5, 5, 18, 11.25, 26, 8, 12, 10, 17, 16, 9, 16, 12, 14, 11, 16, 2, 9, 30, 4, 15, 7, 18, 18, 17];
const XIU_SUM = XIU.reduce((s, w) => s + w, 0);
const RA_JIAO = 201.3; // 角宿距星 (Spica)
const DU = 360 / 365.25; // one 古度
const xiuBounds = () => {
  let cum = 0;
  return XIU.map((w) => {
    const ra = RA_JIAO + (cum * 360) / XIU_SUM;
    cum += w;
    return ra;
  });
};
function mansions(host, d, W, H) {
  const svg = sheet(host, W, H);
  const id = `sky${++uid}`;
  const R = Math.max(1800, W * 2.2);
  const cx = W * 0.58;
  const cy = H * 0.82 - R; // the arc runs low in the slot, under the title, the spokes rising and fading
  const sun = sunPos(d);
  const kd = H / 124; // pixels per degree of declination (squeezed)
  const SUN_AT = 180 - Math.min(6, deg(Math.asin((W * 0.3) / R))); // the sun just right of straight down
  const ang = (ra) => SUN_AT + (ra - sun.ra); // larger RA to the left (facing south, east on the left)
  const half = deg(Math.asin(Math.min(1, (W * 0.75) / R))) + 3;
  const vis = (a) => Math.abs(wrap360(a) - 180) < half + 32;
  // the mansion spokes fade upwards, clear of the title
  const defs = el('defs', {}, svg);
  const mk = el('mask', { id: `${id}m`, maskUnits: 'userSpaceOnUse', x: -W, y: -H, width: 3 * W, height: 3 * H }, defs);
  const rg = el('radialGradient', { id: `${id}g`, gradientUnits: 'userSpaceOnUse', cx: f(cx), cy: f(cy), r: f(R + 60) }, defs);
  el('stop', { offset: `${f(((R - 90) / (R + 60)) * 100)}%`, 'stop-color': '#000' }, rg);
  el('stop', { offset: `${f(((R - 20) / (R + 60)) * 100)}%`, 'stop-color': '#fff' }, rg);
  el('stop', { offset: '100%', 'stop-color': '#fff' }, rg);
  el('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: `url(#${id}g)` }, mk);
  const g = el('g', {}, el('g', { mask: `url(#${id}m)` }, svg)); // the turning layer; the fade stays put
  spin(g, cx, cy);
  const A0 = 180 - half - 34; // 30-odd degrees more, for the entrance
  const A1 = 180 + half + 34;
  const arc = (r, attrs) => {
    const [x0, y0] = pol(cx, cy, r, A0);
    const [x1, y1] = pol(cx, cy, r, A1);
    return el('path', { class: 'sky-line', d: `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y1)}`, ...attrs }, g);
  };
  arc(R, { 'stroke-width': 1 });
  arc(R + 7, { 'stroke-width': 0.7 });
  arc(R - 54, { 'stroke-width': 0.8, 'stroke-dasharray': '2 6' });
  let t = '';
  for (let i = 0; i < 366; i++) {
    const a = ang(RA_JIAO + i * DU);
    if (!vis(a)) continue;
    const [x1, y1] = pol(cx, cy, R, a);
    const [x2, y2] = pol(cx, cy, R + 7, a);
    t += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
  }
  el('path', { class: 'sky-line', d: t, 'stroke-width': 0.7 }, g);
  let s = '';
  for (const ra of xiuBounds()) {
    const a = ang(ra);
    if (!vis(a)) continue;
    const [x1, y1] = pol(cx, cy, R + 16, a);
    const [x2, y2] = pol(cx, cy, R - 150, a);
    s += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
  }
  el('path', { class: 'sky-line', d: s, 'stroke-width': 1 }, g);
  // the ecliptic, the sun's yearly road, dashed
  let e = '';
  let pen = false;
  for (let lam = 0; lam <= 360; lam += 1.5) {
    const L = rad(lam);
    const ra = wrap360(deg(Math.atan2(Math.cos(sun.eps) * Math.sin(L), Math.cos(L))));
    const dec = deg(Math.asin(Math.sin(sun.eps) * Math.sin(L)));
    const a = ang(ra);
    if (!vis(a)) {
      pen = false;
      continue;
    }
    const [x, y] = pol(cx, cy, R - dec * kd, a);
    e += `${pen ? 'L' : 'M'}${f(x)} ${f(y)}`;
    pen = true;
  }
  el('path', { class: 'sky-line', d: e, 'stroke-width': 0.9, 'stroke-dasharray': '5 4' }, g);
  // today: the sun on the ecliptic; the violet notch on the ring of degrees
  const [sx, sy] = pol(cx, cy, R - sun.dec * kd, SUN_AT);
  const [n1x, n1y] = pol(cx, cy, R - 6, SUN_AT);
  const [n2x, n2y] = pol(cx, cy, R + 14, SUN_AT);
  el('line', { class: 'sky-now', x1: f(n1x), y1: f(n1y), x2: f(n2x), y2: f(n2y), 'stroke-width': 2 }, svg);
  el('path', { class: 'sky-star', d: starPath(sx, sy, 6.5) }, svg);
  // a month ago to today: 30°
  return () => g.animate([{ transform: 'rotate(30deg)' }, { transform: 'rotate(0deg)' }], { duration: 1100, easing: SNAP });
}
/** Between the two groups: the circuit pulled straight (苏颂's flat star chart). */
function ruler(host, d, W, H) {
  const svg = sheet(host, W, H);
  const sun = sunPos(d);
  const m = 2;
  const X = (ra) => m + (wrap360(ra - RA_JIAO) / 360) * (W - 2 * m);
  const y = H * 0.62;
  let t = `M${m} ${f(y)}H${f(W - m)}`;
  const step = W < 700 ? 5 : 1; // every five degrees on a narrow screen
  for (let i = 0; i < 365; i += step) t += `M${f(X(RA_JIAO + i * DU))} ${f(y)}v-4`;
  for (const ra of xiuBounds()) t += `M${f(X(ra))} ${f(y + 6)}V${f(y - 16)}`;
  el('path', { class: 'sky-line', d: t, 'stroke-width': 0.7 }, svg);
  const x = X(sun.ra);
  el('line', { class: 'sky-now', x1: f(x), y1: f(y - 20), x2: f(x), y2: f(y + 9), 'stroke-width': 2 }, svg);
  el('path', { class: 'sky-star', d: starPath(x, y - 28, 5) }, svg);
  return null;
}

// ---------- 模型得分: a horizontal sundial at 35°N ----------
function sundial(host, d, W, H) {
  const svg = sheet(host, W, H);
  const id = `sky${++uid}`;
  const PHI = rad(35);
  const ox = W / 2;
  const oy = H - 2;
  const dirOf = (h) => {
    const Hh = rad((h - 12) * 15);
    const th = Math.atan2(Math.sin(PHI) * Math.sin(Hh), Math.cos(Hh)); // tanθ = sinφ·tan(hour angle)
    return [Math.sin(th), -Math.cos(th)];
  };
  el('rect', { x: 0, y: 0, width: W, height: H }, el('clipPath', { id: `${id}c` }, el('defs', {}, svg)));
  const g = el('g', { 'clip-path': `url(#${id}c)` }, svg);
  let full = '';
  let halves = '';
  for (let h = 6; h <= 18; h += 0.5) {
    const [ux, uy] = dirOf(h);
    const whole = h % 1 === 0;
    const r0 = whole ? H * 0.34 : H * 0.62; // the inner ring stays clear for the gnomon and the shadow
    const r1 = H * 0.9;
    const seg = `M${f(ox + ux * r0)} ${f(oy + uy * r0)}L${f(ox + ux * r1)} ${f(oy + uy * r1)}`;
    if (whole) full += seg;
    else halves += seg;
  }
  el('path', { class: 'sky-line', d: full, 'stroke-width': 1 }, g);
  el('path', { class: 'sky-line', d: halves, 'stroke-width': 0.7, 'stroke-dasharray': '1 4' }, g);
  for (const r of [H * 0.34, H * 0.62, H * 0.9]) {
    el('path', { class: 'sky-line', d: `M${f(ox - r)} ${f(oy)}A${f(r)} ${f(r)} 0 0 1 ${f(ox + r)} ${f(oy)}`, 'stroke-width': 0.8, 'stroke-dasharray': r < H * 0.8 ? '2 6' : 'none' }, g);
  }
  el('line', { class: 'sky-line', x1: f(ox), y1: f(oy), x2: f(ox), y2: f(oy - H * 0.16), 'stroke-width': 3 }, g); // the gnomon, seen from above
  // now: the shadow's direction from apparent solar time, its length from the sun's altitude
  const sun = sunPos(d);
  const sh = solarHours(d);
  const Hh = rad((sh - 12) * 15);
  const dec = rad(sun.dec);
  const alt = Math.asin(Math.sin(PHI) * Math.sin(dec) + Math.cos(PHI) * Math.cos(dec) * Math.cos(Hh));
  if (alt <= 0) return null; // no shadow at night
  const [ux, uy] = dirOf(sh);
  const len = Math.min(H * 0.9, (H * 0.3) / Math.tan(alt));
  const shadow = el('line', { class: 'sky-now', x1: f(ox), y1: f(oy), x2: f(ox + ux * len), y2: f(oy + uy * len), 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
  spin(shadow, ox, oy);
  const a = deg(Math.atan2(ux, -uy));
  // from the noon line to now
  return () => shadow.animate([{ transform: `rotate(${-a}deg)` }, { transform: 'rotate(0deg)' }], { duration: 900, easing: SNAP });
}

// ---------- 0分盘点: one lunation ----------
function moonGlyph(parent, x, y, r, age) {
  const ph = (2 * Math.PI * age) / SYN;
  const rx = Math.abs(Math.cos(ph)) * r;
  const waxing = age < SYN / 2;
  const crescent = Math.cos(ph) > 0;
  el('circle', { class: 'sky-moon', cx: f(x), cy: f(y), r: f(r), 'stroke-width': 0.9 }, parent);
  if (age <= 0.4 || age >= SYN - 0.4) return;
  const p = waxing
    ? `M${f(x)} ${f(y - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + r)}A${f(rx)} ${f(r)} 0 0 ${crescent ? 0 : 1} ${f(x)} ${f(y - r)}Z`
    : `M${f(x)} ${f(y - r)}A${f(r)} ${f(r)} 0 0 0 ${f(x)} ${f(y + r)}A${f(rx)} ${f(r)} 0 0 ${crescent ? 1 : 0} ${f(x)} ${f(y - r)}Z`;
  el('path', { class: 'sky-moon-lit', d: p }, parent);
}
function lunation(host, d, W, H) {
  const svg = sheet(host, W, H);
  const m = 14;
  const span = W - 2 * m;
  const r = Math.min(11, span / 8 / 2.8);
  const yG = H * 0.36;
  const yB = H * 0.72;
  for (let i = 0; i < 8; i++) moonGlyph(svg, m + (span / 8) * (i + 0.5), yG, r, (SYN / 8) * i);
  let t = `M${m} ${f(yB)}H${f(W - m)}`;
  for (let day = 0; day <= 29; day++) t += `M${f(m + (day / SYN) * span)} ${f(yB)}v${day % 7 === 0 ? 7 : 4}`;
  el('path', { class: 'sky-line', d: t, 'stroke-width': 0.8 }, svg);
  const x = m + (moonAge(d) / SYN) * span;
  el('line', { class: 'sky-now', x1: f(x), y1: f(yG + r + 6), x2: f(x), y2: f(yB + 10), 'stroke-width': 2 }, svg);
  return null; // still: the page is quiet
}

// ---------- 题目详情: the water clock's hundred marks ----------
function louke(host, d, W, H) {
  const svg = sheet(host, W, H);
  const m = 10;
  const span = W - 2 * m;
  const y1 = H * 0.3;
  const y2 = H * 0.7;
  const X = (ke) => m + (ke / 100) * span;
  const nowKe = ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
  const water = el('rect', { class: 'sky-fill', x: m, y: f(y2 + 3), width: f(X(nowKe) - m), height: 4 }, svg);
  const every = W < 300 ? 5 : 1;
  let t = `M${m} ${f(y2)}H${f(W - m)}M${m} ${f(y1)}H${f(W - m)}`;
  for (let i = 0; i <= 100; i += every) t += `M${f(X(i))} ${f(y2)}v${i % 25 === 0 ? -9 : -4}`;
  for (let i = 0; i < 12; i++) t += `M${f(X((((23 + 2 * i) % 24) / 24) * 100))} ${f(y1 - 6)}V${f(y2)}`; // the twelve double hours (子 from 23:00)
  el('path', { class: 'sky-line', d: t, 'stroke-width': 0.8 }, svg);
  const tick = el('line', { class: 'sky-now', x1: f(X(nowKe)), y1: f(y1 - 10), x2: f(X(nowKe)), y2: f(y2 + 10), 'stroke-width': 2 }, svg);
  // the water rises from midnight to now, the notch rides on it
  return () => {
    water.style.transformBox = 'fill-box';
    water.style.transformOrigin = 'left';
    water.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, easing: 'linear' });
    tick.animate([{ transform: `translateX(${-(X(nowKe) - m)}px)` }, { transform: 'translateX(0)' }], { duration: 900, easing: 'linear' });
  };
}

// ---------- 挑战赛说明: how long the light you see now has travelled (log seconds) ----------
const LIGHT = [
  [1.28, 'moon'], [499, 'sun'], [1.338e8, 'star3'], [2.72e8, 'star5'], [7.9e8, 'star5'],
  [1.4e10, 'cluster'], [4.24e10, 'nebula'], [8.2e11, 'core'], [7.9e13, 'galaxy'],
]; // the moon, the sun, Proxima, Sirius, Vega, the Pleiades, the Orion Nebula, the galactic centre, Andromeda
function lighttime(host, d, W, H) {
  const svg = sheet(host, W, H);
  const m = 12;
  const span = W - 2 * m;
  const yA = H * 0.7;
  const yO = H * 0.3;
  const X = (lg) => m + (lg / 14) * span;
  let t = `M${m} ${f(yA)}H${f(W - m)}`;
  for (let p = 0; p <= 14; p++) {
    t += `M${f(X(p))} ${f(yA)}v8`;
    if (p < 14) for (let n = 2; n <= 9; n++) t += `M${f(X(p + Math.log10(n)))} ${f(yA)}v${n === 5 ? 5 : 3}`;
  }
  el('path', { class: 'sky-line', d: t, 'stroke-width': 0.8 }, svg);
  let lead = '';
  let stars = '';
  for (const [sec, kind] of LIGHT) {
    const x = X(Math.log10(sec));
    lead += `M${f(x)} ${f(yO + 9)}V${f(yA - 3)}`;
    if (kind === 'sun') stars += starPath(x, yO, 7);
    else if (kind === 'star5') stars += starPath(x, yO, 4.6);
    else if (kind === 'star3') stars += starPath(x, yO, 3);
    else if (kind === 'cluster') for (const [dx, dy] of [[-4, -3], [2, -5], [5, 1], [-1, 2], [-6, 3], [3, 5]]) stars += starPath(x + dx, yO + dy, 1.7);
    else if (kind === 'moon') moonGlyph(svg, x, yO, 4.5, 9);
    else if (kind === 'nebula') {
      el('ellipse', { class: 'sky-line', cx: f(x), cy: f(yO), rx: 7, ry: 5, 'stroke-dasharray': '2 2' }, svg);
      stars += starPath(x, yO, 1.8);
    } else if (kind === 'core') {
      el('circle', { class: 'sky-line', cx: f(x), cy: f(yO), r: 6, 'stroke-dasharray': '1 2' }, svg);
      stars += starPath(x, yO, 2.4);
    } else if (kind === 'galaxy') {
      el('ellipse', { class: 'sky-line', cx: f(x), cy: f(yO), rx: 13, ry: 4, transform: `rotate(-28 ${f(x)} ${f(yO)})` }, svg);
      stars += starPath(x, yO, 2.2);
    }
  }
  el('path', { class: 'sky-line', d: lead, 'stroke-width': 0.7, 'stroke-dasharray': '1 3' }, svg);
  el('path', { class: 'sky-star', d: stars }, svg);
  el('line', { class: 'sky-now', x1: m, y1: f(yA - 12), x2: m, y2: f(yA + 10), 'stroke-width': 2 }, svg); // now, at the left end
  return null;
}

// ---------- 猜你想问: the pointer stars ----------
function pointers(host, d, W, H) {
  const svg = sheet(host, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const k = (Math.min(W, H) / 2 - 8) / 44;
  const lst = lstDeg(d);
  const P = (key) => {
    const [ra, dec] = STARS[key];
    return pol(cx, cy, (90 - dec) * k, ra * 15 - lst);
  };
  el('circle', { class: 'sky-line', cx: f(cx), cy: f(cy), r: f(34 * k), 'stroke-width': 0.8, 'stroke-dasharray': '1 5' }, svg);
  let ticks = '';
  for (const a of [0, 90, 180, 270]) {
    const [x1, y1] = pol(cx, cy, 42 * k, a);
    const [x2, y2] = pol(cx, cy, 44.5 * k, a);
    ticks += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
  }
  el('path', { class: 'sky-line', d: ticks, 'stroke-width': 1 }, svg);
  const seg = (a, b, ga, gb) => {
    const [x1, y1] = P(a);
    const [x2, y2] = b ? P(b) : [cx, cy];
    const L = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / L;
    const uy = (y2 - y1) / L;
    return `M${f(x1 + ux * ga)} ${f(y1 + uy * ga)}L${f(x2 - ux * gb)} ${f(y2 - uy * gb)}`;
  };
  const dipper = [['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'], ['megrez', 'dubhe'], ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid']];
  el('path', { class: 'sky-line', d: dipper.map(([a, b]) => seg(a, b, 6, 6)).join(''), 'stroke-width': 1 }, svg);
  el('path', { class: 'sky-line', d: seg('dubhe', null, 7, 9), 'stroke-width': 1, 'stroke-dasharray': '1 4' }, svg); // the pointers, on to Polaris
  let s = '';
  for (const key of ['dubhe', 'merak', 'phecda', 'megrez', 'alioth', 'mizar', 'alkaid']) {
    const [x, y] = P(key);
    s += starPath(x, y, tipOf(STARS[key][2]) * 0.9);
  }
  s += starPath(cx, cy, 6.5); // Polaris, near the pole
  el('path', { class: 'sky-star', d: s }, svg);
  return null;
}

const DRAW = { trails, mansions, ruler, sundial, lunation, louke, lighttime, pointers };

/** The one entrance plays on the first page of a visit, not under reduced motion or the calm variant. */
const entering = () => document.documentElement.classList.contains('is-first-page') && !reduced() && !calm();

function keep(host, draw) {
  let played = false;
  let size = '';
  /** Draw when the slot has a size and it changed; the first draw may play the entrance. */
  const run = () => {
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    const key = `${W}x${H}`;
    if (key === size) return;
    size = key;
    const enter = draw(W, H);
    if (!played) {
      played = true;
      if (enter && entering()) enter();
    }
  };
  new ResizeObserver(() => run()).observe(host);
  // the first draw does not wait for the observer (it is not delivered in a hidden tab); a slot
  // that is not in the page yet draws on the next turn
  run();
  setTimeout(run, 0);
}

/**
 * Draw the timepiece `kind` into `host` (an aria-hidden decor slot sized by CSS) for the moment
 * the page opened; redrawn on resize without motion. Returns the host.
 */
export function mountSky(host, kind) {
  const now = new Date();
  host.classList.add('sky', `sky-${kind}`);
  host.setAttribute('aria-hidden', 'true');
  keep(host, (W, H) => DRAW[kind](host, now, W, H));
  return host;
}

