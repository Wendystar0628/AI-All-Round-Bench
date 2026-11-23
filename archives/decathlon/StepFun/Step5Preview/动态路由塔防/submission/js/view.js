/* 三维表现：静态场景建模 + 动态单位/特效/路线标记 */
(function (g) {
'use strict';
const TD = g.TD || (g.TD = {});
const Geo = TD.Geo, Acc = TD.Acc, M4 = TD.M4, D = TD.DATA;

const _m = M4.m4(), _m2 = M4.m4(), _nm = M4.m4();
function X(x, y, z, rx, ry, rz, sx, sy, sz) { return M4.compose(x, y, z, rx || 0, ry || 0, rz || 0, sx || 1, sy === undefined ? (sx || 1) : sy, sz === undefined ? (sx || 1) : sz, _m); }
function add(acc, geo, x, y, z, rx, ry, rz, s, col, emis, bill) {
  const m = X(x, y, z, rx, ry, rz, s === undefined ? 1 : s);
  acc.add(geo, m, col, emis, bill, M4.normalMat3(m, _nm));
  return acc;
}
function addM(acc, geo, m, col, emis, bill) { acc.add(geo, m, col, emis, bill, M4.normalMat3(m, _nm)); return acc; }

/* ---------------- 文字贴图 ---------------- */
const textCache = new Map();
function textTexture(renderer, text, opt) {
  opt = opt || {};
  const key = text + '|' + (opt.size || 22) + '|' + (opt.color || '#fff') + '|' + (opt.bold ? 1 : 0) + '|' + (opt.bg || '');
  if (textCache.has(key)) return textCache.get(key);
  const size = opt.size || 22;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = (opt.bold ? 'bold ' : '') + size + 'px "Microsoft YaHei","PingFang SC",sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 12;
  const h = Math.ceil(size * 1.5);
  cv.width = Math.max(4, w); cv.height = Math.max(4, h);
  const c2 = cv.getContext('2d');
  c2.font = font; c2.textBaseline = 'middle'; c2.textAlign = 'center';
  if (opt.bg) { c2.fillStyle = opt.bg; c2.fillRect(0, 0, cv.width, cv.height); }
  c2.shadowColor = 'rgba(0,0,0,0.9)'; c2.shadowBlur = 6;
  c2.fillStyle = opt.color || '#fff';
  c2.fillText(text, cv.width / 2, cv.height / 2 + 1);
  const gl = renderer.gl;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const o = { tex, w: cv.width, h: cv.height, ar: cv.width / cv.height };
  textCache.set(key, o);
  return o;
}

/* ---------------- 静态场景 ---------------- */
function build(mapId) {
  const mapDef = D.MAPS.find(m => m.id === mapId) || D.MAPS[0];
  const G = TD.Sim.prepGraph(mapDef);
  const env = Object.assign({}, mapDef.env);
  const A = new Acc();
  const T = new Acc(); // 透明
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const n of mapDef.nodes) { minx = Math.min(minx, n.x); maxx = Math.max(maxx, n.x); miny = Math.min(miny, n.y); maxy = Math.max(maxy, n.y); }
  const pad = 26;
  const bounds = { x0: minx - pad, x1: maxx + pad, y0: miny - pad, y1: maxy + pad, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 };
  env.bounds = bounds;

  /* 地面板 */
  const gw = bounds.x1 - bounds.x0, gh = bounds.y1 - bounds.y0;
  const groundCol = env.ground;
  add(A, Geo.geoBox(gw + 40, 3, gh + 40), bounds.cx, -1.6, bounds.cy, 0, 0, 0, 1, groundCol, 0);
  // 网格线
  const gridCol = env.grid;
  const gstep = 14;
  for (let x = Math.floor(bounds.x0 / gstep) * gstep; x <= bounds.x1; x += gstep) {
    add(A, Geo.geoBox(0.5, 0.3, gh), x, 0.05, bounds.cy, 0, 0, 0, 1, [gridCol[0] * .5, gridCol[1] * .5, gridCol[2] * .5], 0.25);
  }
  for (let y = Math.floor(bounds.y0 / gstep) * gstep; y <= bounds.y1; y += gstep) {
    add(A, Geo.geoBox(gw, 0.3, 0.5), bounds.cx, 0.05, y, 0, 0, 0, 1, [gridCol[0] * .5, gridCol[1] * .5, gridCol[2] * .5], 0.25);
  }
  /* 下方协议层 */
  const protoY = -16;
  add(A, Geo.geoBox(gw * 1.05, 1.5, gh * 1.05), bounds.cx, protoY, bounds.cy, 0, 0, 0, 1, [env.ground[0] * 1.4, env.ground[1] * 1.5, env.ground[2] * 1.6], 0);
  for (let x = Math.floor(bounds.x0 / 24) * 24; x <= bounds.x1; x += 24) {
    add(A, Geo.geoBox(0.7, 0.5, gh), x, protoY + 1.2, bounds.cy, 0, 0, 0, 1, env.grid, 0.7);
  }
  for (let y = Math.floor(bounds.y0 / 24) * 24; y <= bounds.y1; y += 24) {
    add(A, Geo.geoBox(gw, 0.5, 0.7), bounds.cx, protoY + 1.2, y, 0, 0, 0, 1, env.grid, 0.7);
  }
  /* 支撑柱 */
  for (let k = 0; k < 10; k++) {
    const px = bounds.x0 + (k + 0.5) / 10 * gw, pz = bounds.y0 + (k % 2 === 0 ? 0.12 : 0.88) * gh;
    add(A, Geo.geoCyl(1.6, 2.4, 16, 6), px, protoY + 8, pz, 0, 0, 0, 1, [0.10, 0.13, 0.18], 0);
  }

  /* 道路 */
  for (const e of G.edges) {
    const A0 = G.nodes.get(e.a), B0 = G.nodes.get(e.b);
    const len = e.len, ang = Math.atan2(B0.y - A0.y, B0.x - A0.x);
    const mx = (A0.x + B0.x) / 2, my = (A0.y + B0.y) / 2;
    const isLegacy = e.legacy, isTunnel = e.tunnel;
    const w = isLegacy ? 4.4 : 5.6;
    const base = isLegacy ? [0.16, 0.17, 0.22] : [0.13, 0.17, 0.24];
    if (isTunnel) {
      // 管道跨越
      add(A, Geo.geoCyl(2.6, 2.6, len, 8), mx, 5.2, my, 0, 0, 0, 0, [0.16, 0.20, 0.30], 0);
      add(A, Geo.geoCyl(2.9, 2.9, len, 8), mx, 5.2, my, 0, 0, 0, 0, [0.30, 0.45, 0.65], 0.55);
      add(A, Geo.geoBox(0.8, 0.8, len), mx, 8.6, my, 0, 0, 0, 0, [0.5, 0.8, 1.0], 1.1);
    } else {
      add(A, Geo.geoBox(len, 0.9, w), mx, 0.45, my, 0, -ang, 0, 1, base, 0);
      // 中心发光带
      add(A, Geo.geoBox(len, 0.35, isLegacy ? 0.9 : 1.3), mx, 1.0, my, 0, -ang, 0, 1, isLegacy ? [0.55, 0.45, 0.25] : [0.30, 0.62, 0.95], isLegacy ? 0.5 : 0.85);
      // 边线
      const px = Math.cos(ang) * 0, pz = Math.sin(ang) * 0;
      for (const s of [-1, 1]) {
        add(A, Geo.geoBox(len, 0.3, 0.5), mx - Math.sin(ang) * s * w * 0.45, 1.05, my + Math.cos(ang) * s * w * 0.45, 0, -ang, 0, 1, isLegacy ? [0.6, 0.5, 0.28] : [0.35, 0.7, 1.0], 0.6);
      }
    }
  }

  /* 节点 */
  for (const n of mapDef.nodes) {
    if (n.kind === 'entry') { buildEntry(A, T, n, env); continue; }
    if (n.kind === 'exit') { buildExit(A, T, n, env); continue; }
    buildNode(A, T, n, env);
  }
  /* 平台 */
  for (const p of mapDef.platforms) buildPlatform(A, T, p, env);
  /* 障碍 */
  for (const o of (mapDef.obstacles || [])) buildObstacle(A, T, o, env);

  /* 远景：其他网络集群 */
  buildDistant(A, T, env, mapDef);

  const staticMesh = A.build();
  const staticTrans = T.build();
  return { mapDef, G, env, staticMesh, staticTrans, bounds, text: {} };
}

function buildNode(A, T, n, env) {
  const r = n.sw ? 7.2 : 5.4;
  add(A, Geo.geoCyl(r, r * 1.12, 1.6, 6), n.x, 0.8, n.y, 0, 0, 0, 1, [0.14, 0.18, 0.26], 0);
  add(A, Geo.geoCyl(r * 0.86, r * 0.9, 0.5, 6), n.x, 1.7, n.y, 0, 0, 0, 1, [0.22, 0.30, 0.42], 0.35);
  if (n.sw) {
    add(A, Geo.geoRing(r * 0.98, 0.7, 0.2), n.x, 2.1, n.y, 0, 0, 0, 1, env.accent, 1.1);
    add(A, Geo.geoCyl(1.5, 1.9, 3.4, 6), n.x, 3.4, n.y, 0, 0, 0, 1, [0.20, 0.28, 0.38], 0);
    add(A, Geo.geoCyl(1.1, 1.1, 0.9, 6), n.x, 5.4, n.y, 0, 0, 0, 1, env.accent, 1.3);
  } else {
    add(A, Geo.geoCyl(1.1, 1.4, 2.0, 6), n.x, 2.6, n.y, 0, 0, 0, 1, [0.18, 0.24, 0.32], 0);
  }
}
function buildEntry(A, T, n, env) {
  const col = n.id === 'A' ? [0.25, 0.75, 0.95] : n.id === 'B' ? [0.55, 0.85, 0.45] : [0.85, 0.65, 0.35];
  add(A, Geo.geoBox(20, 1.4, 16), n.x, 0.7, n.y, 0, 0, 0, 1, [0.12, 0.16, 0.22], 0);
  for (const s of [-1, 1]) {
    add(A, Geo.geoBox(2.4, 13, 2.4), n.x + s * 7, 6.5, n.y - 5, 0, 0, 0, 1, [0.20, 0.26, 0.34], 0);
    add(A, Geo.geoBox(2.4, 13, 2.4), n.x + s * 7, 6.5, n.y + 5, 0, 0, 0, 1, [0.20, 0.26, 0.34], 0);
  }
  add(A, Geo.geoBox(17, 1.8, 13), n.x, 13.4, n.y, 0, 0, 0, 1, [0.18, 0.24, 0.32], 0);
  add(A, Geo.geoBox(15, 0.6, 11), n.x, 14.6, n.y, 0, 0, 0, 1, col, 1.5);
  add(A, Geo.geoCyl(6.5, 6.5, 0.6, 16), n.x, 2.4, n.y, 0, 0, 0, 1, col, 0.9);
}
function buildExit(A, T, n, env) {
  const col = n.id === 'X' ? [0.35, 0.85, 0.55] : [0.85, 0.75, 0.35];
  add(A, Geo.geoCyl(13, 14.5, 2, 8), n.x, 1, n.y, 0, 0, 0, 1, [0.13, 0.17, 0.24], 0);
  add(A, Geo.geoBox(15, 12, 15), n.x, 8, n.y, 0, 0, 0, 1, [0.16, 0.21, 0.29], 0);
  add(A, Geo.geoBox(16.5, 1.2, 16.5), n.x, 14.4, n.y, 0, 0, 0, 1, [0.20, 0.26, 0.34], 0);
  add(A, Geo.geoCyl(5.5, 6.5, 9, 8), n.x, 18.5, n.y, 0, 0, 0, 1, [0.22, 0.28, 0.38], 0);
  add(A, Geo.geoCyl(4.4, 4.4, 1.6, 8), n.x, 23.6, n.y, 0, 0, 0, 1, col, 1.6);
  add(A, Geo.geoRing(9.5, 1.2, 0.3), n.x, 3.2, n.y, 0, 0, 0, 1, col, 1.2);
}
function buildPlatform(A, T, p, env) {
  const y = 7;
  for (const s of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) {
    add(A, Geo.geoCyl(0.9, 1.2, y, 6), p.x + s[0], y / 2, p.y + s[1], 0, 0, 0, 1, [0.16, 0.20, 0.28], 0);
  }
  add(A, Geo.geoCyl(5.6, 6.2, 1.1, 6), p.x, y, p.y, 0, 0, 0, 1, [0.20, 0.26, 0.36], 0);
  add(A, Geo.geoRing(5.2, 0.8, 0.25), p.x, y + 0.7, p.y, 0, 0, 0, 1, env.accent, 0.9);
  add(A, Geo.geoCyl(4.6, 4.6, 0.2, 6), p.x, y + 0.75, p.y, 0, 0, 0, 1, env.accent, 0.35);
}
function buildObstacle(A, T, o, env) {
  if (o.kind === 'public') {
    // 公网流：发光半透明流体带
    add(A, Geo.geoBox(o.w, 5.5, o.h), o.x, 2.6, o.y, 0, 0, 0, 1, [0.35, 0.20, 0.42], 0.25);
    add(T, Geo.geoBox(o.w, 6.4, o.h), o.x, 3.2, o.y, 0, 0, 0, 1, [0.85, 0.45, 1.0], 0.55);
    for (let k = 0; k < 5; k++) {
      const yy = o.y - o.h / 2 + (k + 0.5) * o.h / 5;
      add(T, Geo.geoBox(o.w * 0.94, 0.5, 1.6), o.x, 3.4 + (k % 2) * 0.6, yy, 0, 0, 0, 1, [1.0, 0.7, 1.0], 1.1);
    }
    add(A, Geo.geoBox(o.w + 2, 1.0, o.h + 2), o.x, 0.2, o.y, 0, 0, 0, 1, [0.30, 0.16, 0.36], 0.4);
  } else if (o.kind === 'airgap') {
    add(A, Geo.geoCyl(o.w * 0.5, o.w * 0.5, 1.2, 20), o.x, 0.6, o.y, 0, 0, 0, 1, [0.05, 0.05, 0.07], 0);
    add(T, Geo.geoCyl(o.w * 0.48, o.w * 0.48, 7, 20), o.x, 4, o.y, 0, 0, 0, 1, [0.35, 0.25, 0.45], 0.28);
    for (let k = 0; k < 3; k++) add(T, Geo.geoRing(o.w * 0.46 - k * 3, 0.9, 0.2), o.x, 2 + k * 2.2, o.y, 0, 0, 0, 1, [0.75, 0.5, 1.0], 0.9);
    add(A, Geo.geoCyl(2, 3, 8, 8), o.x, 5, o.y, 0, 0, 0, 1, [0.10, 0.08, 0.14], 0);
  } else {
    // 数据设施
    const h = 8 + (o.w % 5);
    add(A, Geo.geoBox(o.w, h, o.h), o.x, h / 2, o.y, 0, 0, 0, 1, [0.13, 0.16, 0.21], 0);
    add(A, Geo.geoBox(o.w + 1.4, 1.2, o.h + 1.4), o.x, h + 0.6, o.y, 0, 0, 0, 1, [0.18, 0.22, 0.29], 0);
    for (let k = 0; k < 3; k++) {
      add(A, Geo.geoBox(o.w * 0.82, 0.5, 0.5), o.x, 2.5 + k * 2.6, o.y + o.h / 2 + 0.3, 0, 0, 0, 1, env.grid, 0.8);
      add(A, Geo.geoBox(o.w * 0.82, 0.5, 0.5), o.x, 2.5 + k * 2.6, o.y - o.h / 2 - 0.3, 0, 0, 0, 1, env.grid, 0.8);
    }
    add(A, Geo.geoBox(1.2, h * 0.7, 1.2), o.x, h * 0.55, o.y, 0, 0, 0, 1, [0.25, 0.35, 0.45], 0.5);
  }
}
function buildDistant(A, T, env, mapDef) {
  // 远处网络集群
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + 0.4;
    const dist = Math.max(env.bounds.x1 - env.bounds.x0, env.bounds.y1 - env.bounds.y0) * (0.62 + (k % 3) * 0.12);
    const cx = env.bounds.cx + Math.cos(a) * dist, cy = env.bounds.cy + Math.sin(a) * dist * 0.75;
    const s = 5 + (k % 4) * 3;
    add(A, Geo.geoBox(s, s * 0.5, s), cx, -8 - (k % 3) * 4, cy, 0, 0, 0, 1, [0.09, 0.11, 0.16], 0.1);
    for (let j = 0; j < 3; j++) {
      add(T, Geo.geoBox(s * 0.8, 0.4, 0.4), cx + (j - 1) * s * 0.4, -4 - (k % 3) * 4, cy, 0, 0, 0, 1, env.grid, 0.7);
    }
  }
  // 往来数据流（竖向光柱）
  for (let k = 0; k < 8; k++) {
    const cx = env.bounds.x0 + (k + 0.5) / 8 * (env.bounds.x1 - env.bounds.x0);
    const cy = env.bounds.y0 + (k % 2 ? 0.1 : 0.9) * (env.bounds.y1 - env.bounds.y0);
    add(T, Geo.geoCyl(0.7, 0.7, 60, 6), cx, 26, cy, 0, 0, 0, 1, env.accent, 0.55);
  }
}

/* ---------------- 动态：塔 ---------------- */
function towerModel(acc, t, time) {
  const lvl = t.level, d = t.def, col = d.color, acc2 = d.accent;
  const bob = t.type === 'interceptor' || t.type === 'sandbox' || t.type === 'repair' ? Math.sin(time * 1.6 + t.id) * 0.25 : 0;
  const y = t.z + bob;
  const flash = t.hitT > 0 ? 1 : 0;
  const c = flash ? [1, 0.55, 0.5] : col;
  const sel = t.selected ? 1 : 0;
  if (t.type === 'firewall') {
    add(acc, Geo.geoBox(9, 5.5, 3.2), t.x, y + 2.8, t.y, 0, t.facing, 0, 1, [0.16, 0.24, 0.34], 0);
    add(acc, Geo.geoBox(9.6, 1.4, 4.4), t.x, y + 5.8, t.y, 0, t.facing, 0, 1, c, 0.5);
    if (lvl > 1) {
      add(acc, Geo.geoBox(10.6, 1.1, 5.2), t.x, y + 7.4, t.y, 0, t.facing, 0, 1, acc2, 0.8);
      add(acc, Geo.geoBox(2, 4, 2), t.x - 3.6, y + 2, t.y - 2.4, 0, t.facing, 0, 1, [0.3, 0.4, 0.5], 0);
      add(acc, Geo.geoBox(2, 4, 2), t.x + 3.6, y + 2, t.y - 2.4, 0, t.facing, 0, 1, [0.3, 0.4, 0.5], 0);
    }
    // 盾牌指示
    if (t.fireT > 0) add(acc, Geo.geoQuad(11, 7), t.x, y + 4, t.y + 1.8, 0, t.facing, 0, 1, [0.7, 0.95, 1.0], 1.6, true);
  } else if (t.type === 'honeypot') {
    add(acc, Geo.geoCyl(3.4, 3.8, 4.4, 8), t.x, y + 2.2, t.y, 0, 0, 0, 1, [0.28, 0.20, 0.14], 0);
    add(acc, Geo.geoCyl(3.2, 3.2, 0.7, 8), t.x, y + 4.6, t.y, 0, 0, 0, 1, c, 0.7);
    const orbs = lvl > 1 && t.branch === 'b1' ? 3 : 1;
    for (let k = 0; k < orbs; k++) {
      const a = time * (t.branch === 'b1' ? 2.2 : 1.2) + k / orbs * Math.PI * 2;
      const rr = orbs > 1 ? 4.6 : 0;
      add(acc, Geo.geoSph(1.5, 8, 6), t.x + Math.cos(a) * rr, y + 6.6 + Math.sin(time * 2 + k) * 0.5, t.y + Math.sin(a) * rr, 0, 0, 0, 1, acc2, 1.4);
    }
    if (lvl > 1) add(acc, Geo.geoRing(5.4, 0.6, 0.2), t.x, y + 1.2, t.y, 0, 0, 0, 1, acc2, 0.9);
  } else if (t.type === 'gate') {
    for (const s of [-1, 1]) add(acc, Geo.geoBox(1.8, 7.5, 1.8), t.x + s * 4.4, y + 3.8, t.y, 0, 0, 0, 1, [0.24, 0.34, 0.26], 0);
    add(acc, Geo.geoBox(11, 1.2, 2.2), t.x, y + 7.6, t.y, 0, 0, 0, 1, [0.30, 0.44, 0.32], 0.4);
    const open = t.isoOpen ? 1 : 0;
    add(acc, Geo.geoBox(10.4, 0.9, 0.9), t.x, y + 3.6 - open * 3, t.y, 0, 0, 0, 1, c, 1.2);
    if (lvl > 1) for (const s of [-1, 1]) add(acc, Geo.geoBox(2.4, 2.4, 2.4), t.x + s * 4.4, y + 8.8, t.y, 0, 0, 0, 1, acc2, 0.9);
  } else if (t.type === 'interceptor') {
    add(acc, Geo.geoCyl(3.6, 4.2, 1.6, 8), t.x, y + 0.8, t.y, 0, 0, 0, 1, [0.22, 0.20, 0.32], 0);
    add(acc, Geo.geoCyl(2.4, 2.8, 2.4, 8), t.x, y + 2.6, t.y, 0, 0, 0, 1, c, 0.35);
    const len = t.branch === 'b1' ? 8.5 : 6.5;
    add(acc, Geo.geoBox(len, 1.5, 1.5), t.x, y + 4.2, t.y, 0, -t.facing, 0, 1, [0.4, 0.36, 0.55], 0.2);
    add(acc, Geo.geoCyl(0.7, 0.7, 1.4, 6), t.x + Math.cos(t.facing) * len * 0.5, y + 4.2, t.y + Math.sin(t.facing) * len * 0.5, 0, 0, 0, 1, acc2, 1.0);
    if (t.branch === 'b2') {
      for (const s of [-1, 1]) add(acc, Geo.geoBox(4.4, 0.9, 0.9), t.x + Math.cos(t.facing) * s * 1.6, y + 4.4, t.y + Math.sin(t.facing) * s * 1.6, 0, -t.facing, 0, 1, [0.5, 0.4, 0.7], 0.4);
    }
    if (lvl > 1) {
      add(acc, Geo.geoCyl(4.4, 4.6, 0.5, 8), t.x, y + 5.6, t.y, 0, 0, 0, 1, acc2, 0.8);
      add(acc, Geo.geoBox(len * 0.8, 1.1, 1.1), t.x + Math.cos(t.facing) * 0.6, y + 6.0, t.y + Math.sin(t.facing) * 0.6, 0, -t.facing, 0, 1, acc2, 0.7);
    }
    if (t.fireT > 0) add(acc, Geo.geoSph(1.6, 6, 5), t.x + Math.cos(t.facing) * len * 0.55, y + 4.2, t.y + Math.sin(t.facing) * len * 0.55, 0, 0, 0, 1, [1, 0.9, 0.6], 2.2);
  } else if (t.type === 'sandbox') {
    add(acc, Geo.geoCyl(3.2, 3.8, 2.6, 8), t.x, y + 1.3, t.y, 0, 0, 0, 1, [0.16, 0.30, 0.28], 0);
    add(T2(), Geo.geoSph(4.2, 10, 8), t.x, y + 5, t.y, 0, 0, 0, 1, [0.4, 1, 0.9], 0.32);
    for (let k = 0; k < 2; k++) {
      add(acc, Geo.geoRing(3.4, 0.5, 0.2), t.x, y + 4 + k * 2.2, t.y, time * (k ? -1.4 : 1.1), time * 0.8, 0, 1, acc2, 1.2);
    }
    add(acc, Geo.geoCyl(1.2, 1.2, 1.6, 6), t.x, y + 8.2, t.y, 0, 0, 0, 1, acc2, 1.5);
    if (lvl > 1) for (let k = 0; k < 3; k++) add(acc, Geo.geoBox(0.7, 3, 0.7), t.x + (k - 1) * 3, y + 6, t.y, 0, 0, 0, 1, acc2, 0.6);
  } else if (t.type === 'repair') {
    add(acc, Geo.geoCyl(3.0, 3.6, 2.2, 8), t.x, y + 1.1, t.y, 0, 0, 0, 1, [0.32, 0.26, 0.14], 0);
    add(acc, Geo.geoBox(1.4, 6.5, 1.4), t.x, y + 5.4, t.y, 0, 0, 0, 1, c, 0.5);
    add(acc, Geo.geoBox(6.5, 1.4, 1.4), t.x, y + 5.4, t.y, 0, 0, 0, 1, c, 0.5);
    add(acc, Geo.geoRing(4.6, 0.6, 0.2), t.x, y + 3.4, t.y, time * 1.6, 0, 0, 1, acc2, 1.0);
    if (lvl > 1) add(acc, Geo.geoRing(5.8, 0.4, 0.2), t.x, y + 3.4, t.y, -time * 2.1, 0, 0, 1, acc2, 0.8);
  }
  // 升级光环 / 选中环
  if (t.selected) add(acc, Geo.geoRing(7.5, 0.7, 0.2), t.x, y + 0.2, t.y, 0, 0, 0, 1, [1, 0.95, 0.5], 1.2);
  if (t.skillCd > 0 && t.def.skill) add(acc, Geo.geoRing(6.4, 0.4, 0.15), t.x, y + 0.2, t.y, 0, 0, 0, 1, [0.5, 0.8, 1], 0.7);
}
function T2() { return transAcc; }

/* ---------------- 动态：敌人 ---------------- */
function enemyModel(acc, en, time) {
  const d = en.def, s = en.size;
  const flash = en.hitT > 0 ? 1 : 0;
  const col = flash ? [1, 0.7, 0.6] : d.color;
  const dark = d.dark;
  const z = en.fly ? en.z : 0;
  const ang = en.heading == null ? 0 : en.heading;
  if (en.type === 'worm') {
    const segs = 5;
    for (let k = 0; k < segs; k++) {
      const w = Math.sin(time * 8 - k * 0.9 + en.anim) * 1.1;
      const px = en.x - Math.cos(ang) * k * 1.5 + Math.cos(ang + Math.PI / 2) * w;
      const py = en.y - Math.sin(ang) * k * 1.5 + Math.sin(ang + Math.PI / 2) * w;
      const r = s * (0.62 - k * 0.06);
      add(acc, Geo.geoSph(r, 7, 5), px, z + r * 0.9, py, 0, 0, 0, 1, k % 2 ? col : dark, k === 0 ? 0.5 : 0.15);
    }
    add(acc, Geo.geoSph(0.5, 5, 4), en.x + Math.cos(ang) * 1.4, z + s * 0.95, en.y + Math.sin(ang) * 1.4, 0, 0, 0, 1, [1, 0.9, 0.4], 1.2);
  } else if (en.type === 'flood') {
    const p = Math.sin(time * 5 + en.anim) * 0.4;
    add(acc, Geo.geoSph(s * 0.8, 9, 7), en.x, z + s * 0.7 + p, en.y, 0, 0, 0, 1, col, 0.2);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 + time * 1.4;
      add(acc, Geo.geoSph(s * 0.3, 6, 5), en.x + Math.cos(a) * s * 0.7, z + s * 0.5 + Math.sin(time * 6 + k) * 0.8, en.y + Math.sin(a) * s * 0.7, 0, 0, 0, 1, [0.6, 0.75, 1.0], 0.5);
    }
    add(acc, Geo.geoRing(s * 0.9, 0.6, 0.2), en.x, z + 0.6, en.y, 0, 0, 0, 1, [0.7, 0.85, 1.0], 0.9);
  } else if (en.type === 'trojan') {
    if (!en.revealed) {
      // 伪装成正常数据包
      const bob = Math.sin(time * 3 + en.anim) * 0.4;
      add(acc, Geo.geoBox(s * 1.5, s * 1.1, s * 1.5), en.x, z + s * 1.2 + bob, en.y, time * 0.8, time * 0.5, 0, 1, [0.72, 0.78, 0.9], 0.35);
      add(acc, Geo.geoBox(s * 1.1, 0.4, s * 1.1), en.x, z + s * 1.2 + bob, en.y, time * 0.8, 0, 0, 1, [0.45, 0.75, 1.0], 0.9);
    } else {
      add(acc, Geo.geoBox(s * 1.3, s * 0.9, s * 1.6), en.x, z + s * 0.9, en.y, 0, ang, 0, 1, dark, 0.1);
      add(acc, Geo.geoCone(s * 0.7, s * 1.2, 6), en.x, z + s * 1.7, en.y, 0, Math.PI / 2 - ang, 0, 1, col, 0.5);
      for (let k = 0; k < 4; k++) {
        const a = ang + k * Math.PI / 2;
        add(acc, Geo.geoCone(s * 0.3, s * 0.8, 4), en.x + Math.cos(a) * s * 0.8, z + s * 0.8, en.y + Math.sin(a) * s * 0.8, Math.PI / 2, Math.PI / 2 - a, 0, 1, col, 0.4);
      }
      add(acc, Geo.geoSph(0.6, 5, 4), en.x, z + s * 2.3, en.y, 0, 0, 0, 1, [1, 0.4, 0.5], 1.4);
    }
  } else if (en.type === 'ransom') {
    add(acc, Geo.geoCyl(s * 0.7, s * 0.9, s * 1.5, 8), en.x, z + s * 0.8, en.y, 0, 0, 0, 1, dark, 0.1);
    add(acc, Geo.geoSph(s * 0.6, 8, 6), en.x, z + s * 1.8, en.y, 0, 0, 0, 1, col, 0.3);
    add(acc, Geo.geoBox(s * 0.8, s * 0.9, s * 0.4), en.x, z + s * 1.7, en.y + s * 0.5, 0, ang, 0, 1, [1, 0.85, 0.3], 1.1);
    add(acc, Geo.geoCyl(s * 0.25, s * 0.25, s * 0.5, 6), en.x, z + s * 2.1, en.y, 0, 0, 0, 1, [1, 0.9, 0.4], 1.4);
    if (en.atkCd < 0.25 && en.atkCd > 0) add(acc, Geo.geoRing(s, 0.8, 0.2), en.x, z + s * 1.5, en.y, 0, 0, 0, 1, [1, 0.5, 0.8], 1.5);
  } else if (en.type === 'hotspot') {
    const t = time * 3 + en.anim;
    add(acc, Geo.geoSph(s * 0.55, 8, 6), en.x, z + 2, en.y, 0, 0, 0, 1, col, 1.1);
    for (let k = 0; k < 3; k++) {
      const a = t + k * 2.1;
      add(acc, Geo.geoRing(s * 1.3, 0.35, 0.15), en.x, z + 2, en.y, Math.PI / 2, 0, a, 1, [0.7, 0.95, 1.0], 1.0);
    }
    add(acc, Geo.geoCone(s * 0.4, s * 1.2, 5), en.x, z + 3.4, en.y, Math.PI, 0, 0, 1, [0.8, 1, 1], 1.2);
  } else if (en.type === 'packer') {
    add(acc, Geo.geoBox(s * 1.5, s * 1.1, s * 1.5), en.x, z + s * 0.9, en.y, 0, ang, 0, 1, dark, 0.1);
    add(acc, Geo.geoBox(s * 1.1, s * 0.8, s * 1.1), en.x, z + s * 1.6, en.y, 0, ang, 0, 1, col, 0.35);
    for (let k = 0; k < 3; k++) {
      const a = ang + (k - 1) * 0.7;
      add(acc, Geo.geoCyl(s * 0.28, s * 0.28, s * 1.1, 6), en.x + Math.cos(a) * s * 0.9, z + s * 1.1, en.y + Math.sin(a) * s * 0.9, Math.PI / 2, Math.PI / 2 - a, 0, 1, col, 0.4);
    }
    add(acc, Geo.geoSph(0.7, 6, 5), en.x, z + s * 2.3, en.y, 0, 0, 0, 1, [1, 1, 0.6], 1.3);
  } else if (en.boss) {
    bossModel(acc, en, time, z);
  }
  // 护盾
  if (en.shield > 0) add(T2(), Geo.geoSph(s * 1.35, 10, 8), en.x, z + s * 0.9, en.y, 0, 0, 0, 1, [0.55, 0.85, 1.0], 0.30);
  // 减速/陷阱
  if (en.trap > 0) add(T2(), Geo.geoRing(s * 1.5, 0.6, 0.2), en.x, z + 0.4, en.y, 0, 0, 0, 1, [1, 0.8, 0.3], 1.2);
  if (en.slow > 0) add(T2(), Geo.geoRing(s * 1.6, 0.4, 0.15), en.x, z + 0.2, en.y, 0, 0, 0, 1, [0.5, 0.7, 1.0], 0.9);
}
function bossModel(acc, en, time, z) {
  const d = en.def, s = en.size;
  const col = en.hitT > 0 ? [1, 0.7, 0.6] : d.color;
  if (en.def.bossKind === 'wankui') {
    add(acc, Geo.geoSph(s * 0.7, 12, 9), en.x, z + s * 0.8, en.y, 0, 0, 0, 1, d.dark, 0.1);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + time * 0.7;
      const rr = s * 0.85;
      add(acc, Geo.geoSph(s * 0.26, 8, 6), en.x + Math.cos(a) * rr, z + s * 0.9 + Math.sin(time * 2 + k) * 1.6, en.y + Math.sin(a) * rr, 0, 0, 0, 1, col, 0.35);
      add(acc, Geo.geoCyl(s * 0.09, s * 0.09, s * 1.5, 5), en.x + Math.cos(a) * rr * 0.7, z + s * 0.9, en.y + Math.sin(a) * rr * 0.7, 0, 0, 0, 1, [0.6, 0.2, 0.2], 0.3);
    }
    add(acc, Geo.geoSph(s * 0.4, 10, 8), en.x, z + s * 1.7, en.y, 0, 0, 0, 1, col, 0.6);
    add(acc, Geo.geoRing(s * 1.1, 1.0, 0.25), en.x, z + 1, en.y, 0, 0, 0, 1, [1, 0.4, 0.4], 1.2);
    if (en.phase >= 1) for (let k = 0; k < 5; k++) add(acc, Geo.geoSph(s * 0.16, 6, 5), en.x + (k - 2) * s * 0.4, z + s * 2.4 + Math.sin(time * 4 + k) * 1.2, en.y, 0, 0, 0, 1, [1, 0.6, 0.4], 0.8);
  } else if (en.def.bossKind === 'mirage') {
    add(acc, Geo.geoCyl(s * 0.6, s * 0.8, s * 1.2, 8), en.x, z + s * 0.7, en.y, 0, 0, 0, 1, d.dark, 0.1);
    add(acc, Geo.geoSph(s * 0.5, 12, 9), en.x, z + s * 1.5, en.y, 0, 0, 0, 1, col, 0.45);
    for (let k = 0; k < 3; k++) {
      add(T2(), Geo.geoRing(s * (0.9 + k * 0.25), 0.7, 0.2), en.x, z + s * 1.2, en.y, time * (k % 2 ? -1 : 1) * 0.8, k * 0.5, 0, 1, [0.7, 0.9, 1.0], 1.0);
    }
    for (let k = 0; k < 4; k++) {
      const a = time * 1.2 + k * Math.PI / 2;
      add(acc, Geo.geoCone(s * 0.22, s * 0.9, 5), en.x + Math.cos(a) * s * 0.75, z + s * 1.4, en.y + Math.sin(a) * s * 0.75, Math.PI / 2, Math.PI / 2 - a, 0, 1, [0.8, 0.95, 1], 0.9);
    }
    if (en.phase >= 1) add(acc, Geo.geoRing(s * 1.5, 1.4, 0.3), en.x, z + s * 0.5, en.y, 0, 0, 0, 1, [1, 0.5, 0.9], 1.4);
  } else {
    add(acc, Geo.geoCyl(s * 0.55, s * 0.75, s * 1.1, 8), en.x, z + s * 0.6, en.y, 0, 0, 0, 1, d.dark, 0.1);
    add(acc, Geo.geoSph(s * 0.45, 12, 9), en.x, z + s * 1.35, en.y, 0, 0, 0, 1, col, 0.4);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + time * 0.5;
      add(acc, Geo.geoCone(s * 0.2, s * 0.8, 5), en.x + Math.cos(a) * s * 0.6, z + s * 1.3, en.y + Math.sin(a) * s * 0.6, Math.PI / 2, Math.PI / 2 - a, 0, 1, en.phase === 0 ? [0.5, 0.4, 0.7] : [1, 0.6, 0.3], en.phase === 0 ? 0.3 : 1.1);
    }
    if (en.phase >= 2) {
      add(acc, Geo.geoRing(s * 1.6, 1.6, 0.3), en.x, z + 0.5, en.y, 0, 0, 0, 1, [1, 0.4, 0.2], 1.5);
      for (let k = 0; k < 4; k++) add(acc, Geo.geoBox(s * 0.3, s * 1.6, s * 0.3), en.x + (k - 1.5) * s * 0.5, z + s * 1.2, en.y + s * 0.8, 0, 0, 0, 1, [1, 0.5, 0.3], 0.8);
    }
  }
}

/* ---------------- 特效 ---------------- */
function fxModel(acc, fx, time) {
  const k = fx.t / fx.dur;
  const a = 1 - k;
  switch (fx.kind) {
    case 'hit': add(acc, Geo.geoSph(1.1 + k * 1.6, 6, 5), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.95, 0.7], 2.2 * a); break;
    case 'melee': add(acc, Geo.geoRing(2 + k * 3, 1.4, 0.2), fx.x, fx.y, fx.z, Math.PI / 2, 0, 0, 1, [1, 0.8, 0.5], 1.6 * a); break;
    case 'sandblast': add(acc, Geo.geoSph(fx.r * (0.3 + k * 0.8), 12, 9), fx.x, fx.y, fx.z, 0, 0, 0, 1, [0.5, 1, 0.9], 1.4 * a); break;
    case 'shield': add(acc, Geo.geoRing(fx.r * k, 2.2, 0.3), fx.x, fx.y, fx.z, 0, 0, 0, 1, [0.6, 0.9, 1], 1.8 * a); break;
    case 'trap': add(acc, Geo.geoRing(fx.r * (0.4 + k * 0.6), 1.8, 0.3), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.8, 0.3], 1.8 * a); break;
    case 'death': {
      add(acc, Geo.geoSph(fx.size * (0.5 + k * 1.4), 10, 8), fx.x, fx.y, fx.z, 0, 0, 0, 1, fx.color || [1, 0.6, 0.5], 1.6 * a);
      for (let i = 0; i < 5; i++) {
        const ang = i / 5 * Math.PI * 2 + fx.x;
        const r = fx.size * (0.6 + k * 2.2);
        add(acc, Geo.geoSph(0.9 * a + 0.3, 5, 4), fx.x + Math.cos(ang) * r, fx.y + k * 4, fx.z + Math.sin(ang) * r, 0, 0, 0, 1, fx.color || [1, 0.7, 0.5], 2 * a);
      }
      break;
    }
    case 'towerdeath': add(acc, Geo.geoSph(4 + k * 7, 10, 8), fx.x, fx.y + k * 3, fx.z, 0, 0, 0, 1, [1, 0.5, 0.3], 2 * a); break;
    case 'attack': {
      const dx = fx.x - fx.from[0], dy = fx.y - fx.from[1], dz = fx.z - fx.from[2];
      add(acc, Geo.geoBox(0.7, 0.7, Math.hypot(dx, dy, dz)), (fx.x + fx.from[0]) / 2, (fx.y + fx.from[1]) / 2, (fx.z + fx.from[2]) / 2, Math.atan2(Math.hypot(dx, dy), dz), Math.atan2(dy, dx), 0, 1, [1, 0.5, 0.5], 2 * a);
      break;
    }
    case 'crypt': add(acc, Geo.geoRing(2 + k * 4, 0.8, 0.2), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.4, 0.9], 2 * a); break;
    case 'payload': add(acc, Geo.geoSph(fx.r * k, 10, 8), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.7, 0.3], 2 * a); break;
    case 'reveal': add(acc, Geo.geoRing(3 + k * 5, 0.9, 0.2), fx.x, fx.y, fx.z, 0, 0, 0, 1, [0.8, 1, 1], 2 * a); break;
    case 'leak': add(acc, Geo.geoRing(3 + k * 8, 1.4, 0.3), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.3, 0.3], 2.2 * a); break;
    case 'block': add(acc, Geo.geoRing(2 + k * 5, 1.0, 0.2), fx.x, fx.y, fx.z, 0, 0, 0, 1, [0.6, 0.9, 1], 1.8 * a); break;
    case 'shieldbreak': add(acc, Geo.geoRing(2 + k * 4, 0.8, 0.2), fx.x, fx.y, fx.z, 0, 0, 0, 1, [0.7, 0.9, 1], 2 * a); break;
    case 'heal': add(acc, Geo.geoRing(2 + k * 4, 0.8, 0.2), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.9, 0.4], 1.8 * a); break;
    case 'slam': add(acc, Geo.geoRing(2 + k * 7, 1.6, 0.3), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.6, 0.3], 2.2 * a); break;
    case 'bossslam': {
      add(acc, Geo.geoRing(3 + k * 16, 2.4, 0.4), fx.x, fx.y, fx.z, 0, 0, 0, 1, [1, 0.4, 0.3], 2.4 * a);
      add(acc, Geo.geoSph(2 + k * 6, 8, 6), fx.x, fx.y + k * 6, fx.z, 0, 0, 0, 1, [1, 0.5, 0.4], 1.8 * a);
      break;
    }
    case 'blackhole': {
      add(T2(), Geo.geoCyl(4 + k * 6, 1 + k * 2, 8, 14), fx.x, fx.y, fx.z, 0, 0, 0, 1, [0.2, 0.1, 0.3], 0.5 * a);
      add(T2(), Geo.geoRing(4 + k * 8, 1.4, 0.3), fx.x, fx.y, fx.z, 0, 0, 0, 1, [0.7, 0.4, 1], 1.8 * a);
      break;
    }
  }
}

/* ---------------- 路线标记 ---------------- */
const ENTRY_COL = { A: [0.25, 0.75, 0.95], B: [0.55, 0.85, 0.45], C: [0.85, 0.65, 0.35] };
function routeModel(acc, st, opts) {
  const G = st.G;
  for (const eid of st.mapDef.nodes.filter(n => n.kind === 'entry').map(n => n.id)) {
    const r = st.routes[eid];
    if (!r) continue;
    const col = ENTRY_COL[eid] || [0.7, 0.7, 0.9];
    const changed = opts && opts.changed && opts.changed[eid];
    const y = 2.6 + (changed ? Math.sin(st.time * 6) * 0.5 : 0);
    for (let k = 0; k < r.path.length - 1; k++) {
      const A0 = G.nodeById.get(r.path[k]), B0 = G.nodeById.get(r.path[k + 1]);
      const len = Math.hypot(B0.x - A0.x, B0.y - A0.y), ang = Math.atan2(B0.y - A0.y, B0.x - A0.x);
      add(acc, Geo.geoBox(len, 0.5, 1.5), (A0.x + B0.x) / 2, y, (A0.y + B0.y) / 2, 0, -ang, 0, 1, col, changed ? 1.6 : 0.55);
    }
    // 箭头
    for (let k = 0; k < r.path.length - 1; k++) {
      const A0 = G.nodeById.get(r.path[k]), B0 = G.nodeById.get(r.path[k + 1]);
      const mx = (A0.x + B0.x) / 2, my = (A0.y + B0.y) / 2;
      const ang = Math.atan2(B0.y - A0.y, B0.x - A0.x);
      add(acc, Geo.geoCone(1.7, 3.4, 3), mx, y + 0.6, my, Math.PI / 2, -ang, 0, 1, col, 1.0);
    }
  }
  // 预览路线
  if (opts && opts.preview) {
    for (const eid in opts.preview) {
      const r = opts.preview[eid];
      if (!r) continue;
      const col = [1, 0.85, 0.3];
      for (let k = 0; k < r.path.length - 1; k++) {
        const A0 = G.nodeById.get(r.path[k]), B0 = G.nodeById.get(r.path[k + 1]);
        const len = Math.hypot(B0.x - A0.x, B0.y - A0.y), ang = Math.atan2(B0.y - A0.y, B0.x - A0.x);
        add(acc, Geo.geoBox(len, 0.4, 2.6), (A0.x + B0.x) / 2, 3.4, (A0.y + B0.y) / 2, 0, -ang, 0, 1, col, 1.3);
      }
    }
  }
  // 黑洞/锁死提示
  for (const id of st.black) {
    const e = G.edges.find(e => e.id === id);
    if (!e) continue;
    const A0 = G.nodes.get(e.a), B0 = G.nodes.get(e.b);
    add(acc, Geo.geoSph(3.5, 8, 6), (A0.x + B0.x) / 2, 3, (A0.y + B0.y) / 2, 0, 0, 0, 1, [0.4, 0.2, 0.6], 1.4);
  }
}

/* ---------------- 血条/状态（公告板） ---------------- */
function barModel(acc, x, y, z, w, frac, col) {
  add(acc, Geo.geoQuad(w, 1.1), x, y, z, 0, 0, 0, 1, [0.08, 0.08, 0.12], 0.55, true);
  if (frac > 0.01) add(acc, Geo.geoQuad(w * frac, 0.75), x - w * (1 - frac) / 2, y, z, 0, 0, 0, 1, col, 0.85, true);
}
function statusModel(acc, en) {
  const z = (en.fly ? en.z : 0) + en.size + 3.4;
  barModel(acc, en.x, z, en.y, 6.5, Math.max(0, en.hp / en.maxHp), en.hp / en.maxHp > 0.4 ? [0.35, 0.95, 0.45] : [0.95, 0.35, 0.3]);
  if (en.shield > 0) add(acc, Geo.geoQuad(1.6, 1.6), en.x + 4.6, z, en.y, 0, 0, 0, 1, [0.5, 0.8, 1], 1.1, true);
  if (en.def.disguised && !en.revealed) add(acc, Geo.geoQuad(1.3, 1.3), en.x - 4.6, z, en.y, 0, 0, 0, 1, [0.8, 0.9, 1], 1.0, true);
}

let transAcc = null;

/* ---------------- 每帧 ---------------- */
function render(st, cam, renderer, opts) {
  opts = opts || {};
  const A = new Acc(), T = new Acc();
  transAcc = T;
  const time = st.time;
  // 塔
  for (const t of st.towers) if (!t.dead) towerModel(A, t, time);
  // 敌人
  for (const en of st.enemies) if (!en.dead && !en.leaked) { enemyModel(A, en, time); statusModel(T, en); }
  // 弹道
  for (const s of st.shots) {
    const k = s.t / s.dur;
    const x = s.x + (s.tx - s.x) * k, y = s.y + (s.ty - s.y) * k, z = s.z + (s.tz - s.z) * k;
    const dx = s.tx - s.x, dy = s.ty - s.y, dz = s.tz - s.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const col = s.kind === 'crypt' ? [1, 0.4, 0.9] : [1, 0.95, 0.6];
    add(A, Geo.geoBox(0.6, 0.6, Math.min(len, 7)), x, y, z, Math.atan2(Math.hypot(dx, dy), dz), Math.atan2(dy, dx), 0, 1, col, 2.4);
    add(T, Geo.geoSph(1.1, 6, 5), x, y, z, 0, 0, 0, 1, col, 1.6);
  }
  // 治疗束
  for (const b of st.beams) {
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1, dz = b.z2 - b.z1, len = Math.hypot(dx, dy, dz) || 1;
    add(T, Geo.geoBox(0.5, 0.5, len), (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, (b.z1 + b.z2) / 2, Math.atan2(Math.hypot(dx, dy), dz), Math.atan2(dy, dx), 0, 1, [1, 0.9, 0.4], 1.8);
  }
  // 特效
  for (const fx of st.fx) fxModel(A, fx, time);
  // 路线
  if (opts.routes !== false) routeModel(A, st, opts);
  // 隔离器
  for (const iso of st.isolators) {
    const nd = st.G.nodeById.get(iso.nodeId);
    if (!nd) continue;
    const pulse = 0.6 + Math.sin(time * 5) * 0.25;
    add(A, Geo.geoCyl(6.5, 7, 5, 6), nd.x, 2.6, nd.y, 0, 0, 0, 1, [0.35, 0.65, 0.45], 0.5);
    add(A, Geo.geoRing(7.6, 0.7, 0.2), nd.x, 5.2, nd.y, 0, 0, 0, 1, [0.5, 1, 0.6], 1.2 * pulse);
  }
  // 隔离节点指示
  for (const nid of st.isolated) {
    const nd = st.G.nodeById.get(nid);
    if (!nd) continue;
    add(A, Geo.geoRing(8.6, 0.9, 0.25), nd.x, 2.6, nd.y, 0, 0, 0, 1, [1, 0.45, 0.35], 1.3);
    add(T, Geo.geoCyl(7, 7, 5, 6), nd.x, 2.8, nd.y, 0, 0, 0, 1, [1, 0.4, 0.35], 0.16);
  }
  // Boss 预警
  if (opts.warn) for (const w of opts.warn) {
    const nd = st.G.nodeById.get(w);
    if (!nd) continue;
    add(A, Geo.geoRing(9.5, 1.2, 0.3), nd.x, 3, nd.y, 0, 0, 0, 1, [1, 0.3, 0.3], 1.5 + Math.sin(time * 8) * 0.6);
  }
  // 拖放预览
  if (opts.place) {
    const p = opts.place;
    const r = p.radius || (p.type === 'interceptor' ? 36 : p.type === 'sandbox' ? 27 : 26);
    add(T, Geo.geoRing(r, 0.8, 0.2), p.x, 1.2, p.y, 0, 0, 0, 1, [0.4, 1, 0.6], 1.2);
    if (p.type === 'interceptor' && p.facing != null) {
      const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
      for (let k = 0; k < 10; k++) {
        const rr = 6 + k * 3;
        add(T, Geo.geoQuad(2.4, 2.4), p.x + fx * rr, 1.4, p.y + fy * rr, 0, 0, 0, 1, [0.6, 0.9, 1], 0.5);
      }
      add(T, Geo.geoRing(r * 0.35, 0.6, 0.2), p.x + fx * r * 0.5, 1.2, p.y + fy * r * 0.5, 0, 0, 0, 1, [0.6, 0.9, 1], 1.1);
    }
  }
  return { dyn: A.build(), trans: T.build() };
}

TD.View = { build, render, textTexture, ENTRY_COL };
})(typeof window !== 'undefined' ? window : globalThis);

