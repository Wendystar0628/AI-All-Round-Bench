// 通用工具与自制图标库
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a || 1);
export const smooth = t => t * t * (3 - 2 * t);
export const rad = d => d * Math.PI / 180;
export const deg = r => r * 180 / Math.PI;
export const TAU = Math.PI * 2;

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash1(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function fmtInt(n) { return Math.round(n).toLocaleString('zh-CN'); }
export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
export function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
export function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function deepClone(v) {
  if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch (e) {} }
  return JSON.parse(JSON.stringify(v));
}
export function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function debounce(fn, ms = 300) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  d.cancel = () => clearTimeout(t);
  return d;
}
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
export function on(el, ev, fn, opts) { el.addEventListener(ev, fn, opts); return () => el.removeEventListener(ev, fn, opts); }
export function nextFrame() { return new Promise(r => requestAnimationFrame(() => r())); }
export function sleepReal(ms) { return new Promise(r => setTimeout(r, ms)); }

const ICONS = {
  files: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderOpen: '<path d="M3 8V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1"/><path d="M3 9h17l-2 9H4z"/>',
  file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/>',
  fileText: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 12h6M9 16h6"/>',
  code: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M10 12l-2 2 2 2M14 12l2 2-2 2"/>',
  sheet: '<path d="M4 3h16v18H4z"/><path d="M4 9h16M4 15h16M9 3v18M15 3v18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-5 6-3-3-4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 4h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
  step: '<path d="M6 5l9 7-9 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  loop: '<path d="M4 12a8 8 0 0 1 13-6l3 3"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-13 6l-3-3"/><path d="M4 20v-5h5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  restore: '<path d="M8 8h11v11H8z"/><path d="M5 16V5h11"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="1"/><path d="M5 15V5h10"/>',
  paste: '<path d="M8 5h8v3H8z"/><path d="M8 6H5v15h14V6h-3"/>',
  cut: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 8l12 12M8 16L20 4"/>',
  save: '<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h7"/><path d="M3 9h18l-2 10H4z"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6"/>',
  reload: '<path d="M20 12a8 8 0 1 1-3-6"/><path d="M20 4v5h-5"/>',
  stopload: '<rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  wifi: '<path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9 17a4 4 0 0 1 6 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21 11v3"/><path d="M6 11h8v3H6z" fill="currentColor" stroke="none"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2M9 2h6M12 2v4"/>',
  note: '<path d="M5 3h14v13l-5 5H5z"/><path d="M14 21v-5h5M8 8h8M8 12h6"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V2h6v2"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.4-2-.7-1.2 0-2.4 1.6-2.4h2A4 4 0 0 0 21 12a9 9 0 0 0-9-9z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7.5" r="1" fill="currentColor"/><circle cx="14.5" cy="7.5" r="1" fill="currentColor"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  memory: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11v2M11 11v2M15 11v2M19 11v2"/>',
  disk: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  bug: '<rect x="7" y="7" width="10" height="12" rx="5"/><path d="M9 7V5a3 3 0 0 1 6 0v2M3 12h4M17 12h4M4 7l3 2M20 7l-3 2M4 18l3-2M20 18l-3-2"/>',
  warning: '<path d="M12 3l9 17H3z"/><path d="M12 9v5M12 17v.5"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2.5M12 17v.5"/>',
  power: '<path d="M12 3v9"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
  projection: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 9h10M7 13h6"/>',
  system: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="8.5" y="14" width="7" height="7" rx="1.5"/><path d="M6.5 10v2h11v-2M12 12v2"/>',
  kernel: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  tasks: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="18" r="1.5" fill="currentColor"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2l1.5 3 3.3-.8 1 3.2 3 1.6-1.6 3 1.6 3-3 1.6-1 3.2-3.3-.8L12 22l-1.5-3-3.3.8-1-3.2-3-1.6 1.6-3-1.6-3 3-1.6 1-3.2 3.3.8z"/>',
  player: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>',
  charts: '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  editor: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18"/>',
  widgets: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  navigation: '<path d="M12 3l8 18-8-5-8 5z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/><path d="M4 4l16 16"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.5M10 10h.5M14 10h.5M18 10h.5M7 14h10"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  star: '<path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  text: '<path d="M5 6h14M12 6v13M8 19h8"/>',
  bold: '<path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  brake: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  thermometer: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>',
  droplet: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10 6a10 10 0 0 1 12 6 10 10 0 0 1-3 4M6 6a10 10 0 0 0-4 6 10 10 0 0 0 14 6"/>',
  archive: '<path d="M3 6h18v4H3zM5 10v10h14V10M9 14h6"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 0-8 6 6 0 0 1 11.5-1.5A3.5 3.5 0 0 1 18 18z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v5l3 2"/>',
  sort: '<path d="M8 4v16M5 17l3 3 3-3M16 20V4M13 7l3-3 3 3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  eyeDropper: '<path d="M15 4l5 5-9 9-5 1 1-5z"/><path d="M13 6l5 5"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
};

export function iconSvg(name, cls = '') {
  const p = ICONS[name] || ICONS.file;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.innerHTML = iconSvg(name);
  const svg = span.firstChild;
  if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
  return svg;
}
export function iconNode(name, size = 18) { return icon(name, size); }

export const FILE_ICONS = {
  sheet: ['sheet', '#4ade80'], scene: ['film', '#c084fc'], prog: ['code', '#7dd3fc'],
  kernel: ['kernel', '#fca5a5'], txt: ['fileText', '#cbd5e1'], md: ['fileText', '#93c5fd'],
  record: ['history', '#fbbf24'], snap: ['archive', '#f472b6'], json: ['code', '#fcd34d'],
  folder: ['folder', '#ffc857'], app: ['grid', '#93c5fd'], image: ['image', '#86efac'],
};
export function fileIcon(path, isDir) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const pair = isDir ? FILE_ICONS.folder : (FILE_ICONS[ext] || FILE_ICONS.txt);
  return { svg: iconSvg(pair[0]), color: pair[1], ext: ext.toUpperCase() };
}

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function pointInRect(x, y, r) { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
export function normAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function angleDiff(target, current) { return normAngle(target - current); }
export function dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

export const clampText = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);