// 开屏 · 星轨定盘 (website/docs/home.md「开屏」, motion.md 一.9): the first page of a visit, when it is the home
// page, opens with one long exposure pressed into about a second. The dial's centre is the
// celestial pole; the whole sky turns about it and every star draws its trail, while the dial's
// tick ring is counted round. The exposure eases out to a stop, the trails dissolve, and only the
// dial's own 13 stars and its ring are left — drawn in the dial's coordinates, exactly over the
// real ones — so as the splash's paper fades the home page's entrance carries straight on.
//
//   import { wantsSplash, playSplash } from './splash.js';
//   if (wantsSplash()) playSplash({ dial: dialSvg, onHandoff: enterHome });
//
// Covers the content only (the command bar stays usable). Any click, key, wheel or swipe — or the
// skip button — closes the shutter at once and hands over. Not under reduced motion, the calm
// variant, a deep link (#anchor) or a hidden tab; the dial below the fold (phones) hands over
// without the hold.
import { reduced, calm } from '../../motion.js';
import { t } from '../../core/index.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 320; // the dial's viewBox centre (stardial.js: S = 640)
const RING = 312; // its tick ring
const T = { open: 140, expose: 1050, settle: 300, hold: 140, fade: 460 };
const THETA = 120; // degrees the sky turns in the exposure

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
};
const f = (v) => +(+v).toFixed(2);
const rad = (a) => (a * Math.PI) / 180;
const pt = (r, a) => [C + r * Math.sin(rad(a)), C - r * Math.cos(rad(a))];
/** The site's four-point star at the origin (charts/star.js). */
function starPath(tip, waist = 0.36) {
  const k = (waist / Math.SQRT2 - 0.25) * 2 * tip;
  const R = tip;
  return `M0 ${f(-R)}q${f(k)} ${f(R - k)} ${f(R)} ${f(R)}q${f(k - R)} ${f(k)} ${f(-R)} ${f(R)}q${f(-k)} ${f(k - R)} ${f(-R)} ${f(-R)}q${f(R - k)} ${f(-k)} ${f(R)} ${f(-R)}z`;
}
function arc(r, a0, a1) {
  if (a1 - a0 < 0.05) return '';
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}
/** A wedge from 12 o'clock clockwise to `a` degrees: the counted part of the tick ring. */
function wedge(a) {
  if (a >= 359.9) return `M${C - 400} ${C - 400}h800v800h-800z`;
  const [x, y] = pt(400, a);
  return `M${C} ${C}L${C} ${C - 400}A400 400 0 ${a > 180 ? 1 : 0} 1 ${f(x)} ${f(y)}Z`;
}
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = seed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** The exposure eases in from rest and out to a stop: the sky slows into the shutter, no jolt. */
const ease = (p) => (1 - Math.cos(Math.PI * p)) / 2;

/** Play on the first page of a visit when it is the home page, motion allowed, no deep link. */
export function wantsSplash() {
  const root = document.documentElement;
  return root.classList.contains('is-first-page') && !reduced() && !calm() && !location.hash && document.visibilityState !== 'hidden';
}

/**
 * Run the splash over the content. `dial` is the home dial's svg, already drawn at rest (no
 * entrance of its own); `onHandoff` starts the home page's entrance (the dial's assembly without
 * the star flight) — called once, as the splash starts to fade.
 */
export function playSplash({ dial, onHandoff }) {
  const root = document.documentElement;
  const bar = document.querySelector('.site-bar');
  const top = Math.max(0, bar ? bar.getBoundingClientRect().bottom : 0);
  const layer = document.createElement('div');
  layer.className = 'sx';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.top = `${top}px`;
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'sx-skip';
  skipBtn.tabIndex = -1;
  skipBtn.innerHTML = `<span></span><kbd>Esc</kbd>`;
  skipBtn.firstChild.textContent = t('home.splash.skip');
  const svg = el('svg', { class: 'sx-svg', 'aria-hidden': 'true', focusable: 'false' });
  layer.append(svg, skipBtn);
  document.body.append(layer);

  // the world is the dial's own coordinates, laid over the dial on screen
  const W = layer.clientWidth;
  const H = layer.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const box = dial.getBoundingClientRect();
  const k = box.width / 640;
  const ox = box.left;
  const oy = box.top - top;
  // full precision: the splash's stars and ring must land on the dial's to the pixel
  const world = el('g', { transform: `translate(${ox} ${oy}) scale(${k})` }, svg);
  const toWorld = (x, y) => [(x - ox) / k, (y - oy) / k];
  const id = `sx${Date.now().toString(36)}`;

  const gSky = el('g', { class: 'sx-sky' }, world);
  const gTrails = el('g', { class: 'sx-trails' }, gSky);
  const gGlints = el('g', { class: 'sx-glints' }, gSky);
  const list = [];

  // background stars: outside the tick ring, wherever their path crosses the screen; four
  // magnitudes, the brighter the fewer
  const rnd = seeded(20261117);
  const rMin = RING + 16;
  const corners = [toWorld(0, 0), toWorld(W, 0), toWorld(0, H), toWorld(W, H)];
  const rMax = Math.max(...corners.map(([x, y]) => Math.hypot(x - C, y - C))) + 24 / k;
  const target = Math.max(46, Math.min(120, Math.round((W * H) / 15000)));
  const mags = [[0.2, 0.46], [0.32, 0.3], [0.5, 0.17], [0.78, 0.07]];
  const [vx0, vy0] = toWorld(-8, -8);
  const [vx1, vy1] = toWorld(W + 8, H + 8);
  const inView = ([x, y]) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
  for (let tries = 0; list.length < target && tries < target * 40; tries++) {
    const r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin));
    const a = rnd() * 360;
    let seen = false;
    for (let s = 0; s <= 1 && !seen; s += 0.2) seen = inView(pt(r, a - THETA * s));
    if (!seen) continue;
    let u = rnd();
    let m = mags[0][0];
    for (const [mv, pw] of mags) {
      if (u < pw) {
        m = mv;
        break;
      }
      u -= pw;
    }
    const trail = el('path', { class: 'sx-trail', style: `--m: ${m}` }, gTrails);
    const head = el('path', { class: 'sx-glint', d: starPath((1.3 + m * 3.4) / k), style: `--m: ${m}` }, gGlints);
    list.push({ r, a, trail, head });
  }

  // the dial's 13 stars: the same shapes, ending where they stand on the dial
  const gData = el('g', { class: 'sx-data' }, world);
  for (const node of dial.querySelectorAll('.sd-star')) {
    if (node.style.opacity === '0') continue;
    const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(node.getAttribute('transform') || '');
    const shape = node.querySelector('.sd-star-shape');
    if (!m || !shape) continue;
    const x = +m[1];
    const y = +m[2];
    const r = Math.hypot(x - C, y - C);
    const a = (Math.atan2(x - C, C - y) * 180) / Math.PI;
    const trail = el('path', { class: 'sx-trail is-data' }, gTrails);
    const head = el('g', {}, gData);
    el('path', { class: `sx-star${node.classList.contains('is-best') ? ' is-best' : ''}`, d: shape.getAttribute('d') }, head);
    list.push({ r, a, trail, head });
  }

  // the tick ring, counted round: the dial's own ring, revealed by a turning wedge
  const ticks = dial.querySelector('.sd-ticks');
  const clip = el('clipPath', { id: `${id}c` }, el('defs', {}, svg));
  const wedgePath = el('path', { d: wedge(0) }, clip);
  const limb = el('g', { class: 'sx-limb', 'clip-path': `url(#${id}c)` }, world);
  if (ticks) limb.append(ticks.cloneNode(true));

  // the pole: a flare star at the dial's centre
  const pole = el('path', { class: 'sx-pole', d: starPath(Math.max(7 / k, 12)), transform: `translate(${C} ${C})` }, world);

  function draw(p) {
    const th = THETA * ease(p);
    for (const s of list) {
      const a0 = s.a - THETA;
      const a1 = a0 + th;
      const [x, y] = pt(s.r, a1);
      s.head.setAttribute('transform', `translate(${f(x)} ${f(y)})`);
      s.trail.setAttribute('d', arc(s.r, a0, a1));
    }
    wedgePath.setAttribute('d', wedge(360 * ease(p)));
  }

  // ---------- the run ----------
  const dialInView = box.top + box.height * 0.5 < innerHeight && box.bottom > top;
  const timers = new Set();
  const later = (fn, ms) => {
    const h = setTimeout(() => {
      timers.delete(h);
      fn();
    }, ms);
    timers.add(h);
  };
  let phase = 'expose';
  let raf = 0;
  let handedOver = false;
  const startW = innerWidth;

  draw(0);
  layer.classList.add('is-on');
  pole.animate([{ transform: `translate(${C}px, ${C}px) scale(0)` }, { transform: `translate(${C}px, ${C}px) scale(1)` }], { duration: 240, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  const t0 = performance.now();
  const frame = (now) => {
    if (phase !== 'expose') return;
    const p = Math.min(1, Math.max(0, (now - t0 - T.open) / T.expose));
    draw(p);
    if (p >= 1) settle(false);
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  // a tab that stops drawing frames still ends the exposure
  later(() => phase === 'expose' && settle(false), T.open + T.expose + 400);

  /** The shutter: the trails and the background stars dissolve, the 13 stars settle with a small flare. */
  function settle(skipped) {
    if (phase !== 'expose') return;
    phase = 'settle';
    cancelAnimationFrame(raf);
    draw(1);
    const fadeOut = { duration: skipped ? 180 : T.settle, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'forwards' };
    gTrails.animate([{ opacity: 1 }, { opacity: 0 }], fadeOut);
    gGlints.animate([{ opacity: 1 }, { opacity: 0 }], fadeOut);
    for (const s of list) {
      if (!s.head.classList.contains('sx-glint')) {
        s.head.firstChild.animate([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      }
    }
    later(handoff, skipped || !dialInView ? 60 : T.settle * 0.6 + T.hold);
  }

  /** The handover: the home entrance starts under the splash, whose paper fades off its stars. */
  function handoff() {
    if (handedOver) return;
    handedOver = true;
    phase = 'handoff';
    onHandoff?.();
    const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.fade, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
    pole.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.fade * 0.6, easing: 'linear', fill: 'forwards' });
    layer.style.pointerEvents = 'none';
    fade.onfinish = done;
    later(done, T.fade + 200);
  }
  function done() {
    timers.forEach(clearTimeout);
    timers.clear();
    cancelAnimationFrame(raf);
    layer.remove();
    removeEventListener('keydown', onKey, true);
    removeEventListener('wheel', skip);
    removeEventListener('touchmove', skip);
    removeEventListener('resize', onResize);
  }
  /** Skip = close the shutter now; once handed over, the splash just goes. */
  function skip() {
    if (phase === 'expose') settle(true);
    else if (phase === 'settle') handoff();
    else done();
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    skip();
  }
  // only a change of width is a new layout (a phone's address bar changes the height)
  const onResize = () => innerWidth !== startW && skip();
  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    skip();
  });
  addEventListener('keydown', onKey, true);
  addEventListener('wheel', skip, { passive: true });
  addEventListener('touchmove', skip, { passive: true });
  addEventListener('resize', onResize);
  return { skip };
}
