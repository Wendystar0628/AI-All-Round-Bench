/* surface.sim.js — naive surface nets over the particle density field.
   The free surface, the spray and the white water all come from the
   particle state; nothing here uses a height field or an analytic wave. */
(function (global) {
  'use strict';

  global.WGSL_SURFACE = /* wgsl */`
struct SimU {
  grid : vec4f,
  org  : vec4f,
  dtv  : vec4f,
  wave : vec4f,
  mat  : vec4f,
  misc : vec4f,
};
@group(0) @binding(0) var<uniform> SU : SimU;
@group(0) @binding(1) var<storage, read> gRho  : array<f32>;
@group(0) @binding(2) var<storage, read> gFoam : array<f32>;
@group(0) @binding(3) var<storage, read> gVel  : array<f32>;

@group(1) @binding(0) var<storage, read_write> cellVert : array<f32>;   // pos3 nrm3 foam speed
@group(1) @binding(1) var<storage, read_write> cellFlag : array<u32>;
@group(1) @binding(2) var<storage, read_write> wVerts   : array<f32>;   // triangle soup
@group(1) @binding(3) var<storage, read_write> vCount   : atomic<u32>;
@group(1) @binding(4) var<storage, read_write> indirectBuf: array<u32>;

fn numCells() -> u32 {
  let nx = u32(SU.grid.x) - 1u; let ny = u32(SU.grid.y) - 1u; let nz = u32(SU.grid.z) - 1u;
  return nx * ny * nz;
}
fn cellIndex(i: i32, j: i32, k: i32) -> u32 {
  let nx = i32(SU.grid.x) - 1; let ny = i32(SU.grid.y) - 1;
  return u32(i) + u32(nx) * (u32(j) + u32(ny) * u32(k));
}
fn nodeIndexS(i: i32, j: i32, k: i32) -> u32 {
  return u32(i) + u32(SU.grid.x) * (u32(j) + u32(SU.grid.y) * u32(k));
}
fn nodePosS(n: u32) -> vec3f {
  let nx = i32(SU.grid.x); let ny = i32(SU.grid.y);
  let i = i32(n % u32(nx));
  let j = i32((n / u32(nx)) % u32(ny));
  let k = i32(n / u32(nx * ny));
  return SU.org.xyz + vec3f(f32(i), f32(j), f32(k)) * SU.grid.w;
}
fn terrainHs(x: f32, z: f32) -> f32 {
  let L = SU.grid.x * SU.grid.w;
  let t = clamp(x / L, 0.0, 1.0);
  var h = 0.120 + 0.055 * t + 0.090 * smoothstep(0.68, 1.0, t);
  let mx = (x - 0.35 * L) / 0.115;
  let mz = z / 0.105;
  h += 0.105 * exp(-0.5 * (mx * mx + mz * mz));
  h -= 0.020 * exp(-0.5 * (z / 0.115) * (z / 0.115));
  return h;
}

@compute @workgroup_size(64)
fn cellVerts(@builtin(global_invocation_id) gid: vec3u) {
  let ci = gid.x;
  if (ci >= numCells()) { return; }
  let nx = i32(SU.grid.x) - 1; let ny = i32(SU.grid.y) - 1;
  let i = i32(ci % u32(nx));
  let j = i32((ci / u32(nx)) % u32(ny));
  let k = i32(ci / u32(nx * ny));

  var vals: array<f32, 8>;
  var foams: array<f32, 8>;
  var spds: array<f32, 8>;
  var ids: array<u32, 8>;
  var cnt = 0;
  for (var a = 0; a < 2; a = a + 1) {
  for (var b = 0; b < 2; b = b + 1) {
  for (var c = 0; c < 2; c = c + 1) {
    let n = nodeIndexS(i + a, j + b, k + c);
    vals[cnt] = gRho[n];
    foams[cnt] = gFoam[n];
    let v = vec3f(gVel[n * 3u], gVel[n * 3u + 1u], gVel[n * 3u + 2u]);
    spds[cnt] = length(v);
    ids[cnt] = n;
    cnt = cnt + 1;
  }}}

  let iso = SU.mat.y;
  var mn = 1.0e9; var mx = -1.0e9;
  for (var a = 0; a < 8; a = a + 1) {
    mn = min(mn, vals[a]); mx = max(mx, vals[a]);
  }
  if (mn >= iso || mx < iso) {
    cellFlag[ci] = 0u;
    return;
  }

  // centre of the cell
  let c = nodePosS(ids[0]) + vec3f(0.5, 0.5, 0.5) * SU.grid.w;
  // do not build geometry under the tank floor
  if (c.y < terrainHs(c.x, c.z) + 0.22 * SU.grid.w) {
    cellFlag[ci] = 0u;
    return;
  }

  // average of the edge crossings
  var acc = vec3f(0.0);
  var nAcc = 0.0;
  let e0 = array<u32, 12>(0u, 2u, 4u, 6u, 1u, 3u, 5u, 7u, 0u, 1u, 2u, 3u);
  let e1 = array<u32, 12>(1u, 3u, 5u, 7u, 0u, 2u, 4u, 6u, 4u, 5u, 6u, 7u);
  for (var e = 0; e < 12; e = e + 1) {
    let a = e0[e]; let b = e1[e];
    let va = vals[a]; let vb = vals[b];
    if ((va - iso) * (vb - iso) >= 0.0) { continue; }
    let t = (iso - va) / (vb - va);
    let pa = nodePosS(ids[a]); let pb = nodePosS(ids[b]);
    acc = acc + mix(pa, pb, t);
    nAcc = nAcc + 1.0;
  }
  if (nAcc < 0.5) { cellFlag[ci] = 0u; return; }
  var p = acc / nAcc;

  // gradient of the density (points into the fluid) -> outward normal
  let dx = SU.grid.w;
  let gx = ((vals[1] + vals[3] + vals[5] + vals[7]) - (vals[0] + vals[2] + vals[4] + vals[6])) / (4.0 * dx);
  let gy = ((vals[2] + vals[3] + vals[6] + vals[7]) - (vals[0] + vals[1] + vals[4] + vals[5])) / (4.0 * dx);
  let gz = ((vals[4] + vals[5] + vals[6] + vals[7]) - (vals[0] + vals[1] + vals[2] + vals[3])) / (4.0 * dx);
  var nrm = -normalize(vec3f(gx, gy, gz));

  // stick the side walls onto the glass
  let L = SU.grid.x * SU.grid.w; let W = SU.grid.z * SU.grid.w;
  let z0 = SU.org.z;
  if (nrm.x < -0.5 && p.x < SU.org.x + 1.7 * dx) { p.x = SU.org.x; }
  if (nrm.x > 0.5 && p.x > SU.org.x + L - 1.7 * dx) { p.x = SU.org.x + L; }
  if (nrm.z < -0.5 && p.z < z0 + 1.7 * dx) { p.z = z0; }
  if (nrm.z > 0.5 && p.z > z0 + W - 1.7 * dx) { p.z = z0 + W; }

  var fm = 0.0; var sp = 0.0;
  for (var a = 0; a < 8; a = a + 1) { fm = fm + foams[a] * 0.125; sp = sp + spds[a] * 0.125; }

  let o = ci * 8u;
  cellVert[o] = p.x; cellVert[o + 1u] = p.y; cellVert[o + 2u] = p.z;
  cellVert[o + 3u] = nrm.x; cellVert[o + 4u] = nrm.y; cellVert[o + 5u] = nrm.z;
  cellVert[o + 6u] = fm; cellVert[o + 7u] = sp;
  cellFlag[ci] = 1u;
}

/* emit one quad per sign changing grid edge */
fn emitQuad(c0: u32, c1: u32, c2: u32, c3: u32) {
  if (cellFlag[c0] == 0u || cellFlag[c1] == 0u || cellFlag[c2] == 0u || cellFlag[c3] == 0u) { return; }
  var o = atomicAdd(&vCount, 6u);
  let b0 = c0 * 8u; let b1 = c1 * 8u; let b2 = c2 * 8u; let b3 = c3 * 8u;
  let p0 = vec3f(cellVert[b0], cellVert[b0 + 1u], cellVert[b0 + 2u]);
  let p1 = vec3f(cellVert[b1], cellVert[b1 + 1u], cellVert[b1 + 2u]);
  let p2 = vec3f(cellVert[b2], cellVert[b2 + 1u], cellVert[b2 + 2u]);
  let p3 = vec3f(cellVert[b3], cellVert[b3 + 1u], cellVert[b3 + 2u]);
  let n0 = vec3f(cellVert[b0 + 3u], cellVert[b0 + 4u], cellVert[b0 + 5u]);
  let n1 = vec3f(cellVert[b1 + 3u], cellVert[b1 + 4u], cellVert[b1 + 5u]);
  let n2 = vec3f(cellVert[b2 + 3u], cellVert[b2 + 4u], cellVert[b2 + 5u]);
  let n3 = vec3f(cellVert[b3 + 3u], cellVert[b3 + 4u], cellVert[b3 + 5u]);
  let gn = normalize(cross(p1 - p0, p2 - p0));
  let an = normalize(n0 + n1 + n2 + n3);
  let flip = dot(gn, an) < 0.0;
  var q: array<u32, 6>;
  if (flip) {
    q[0] = c0; q[1] = c2; q[2] = c1;
    q[3] = c0; q[4] = c3; q[5] = c2;
  } else {
    q[0] = c0; q[1] = c1; q[2] = c2;
    q[3] = c0; q[4] = c2; q[5] = c3;
  }
  for (var t = 0; t < 6; t = t + 1) {
    let src = q[t] * 8u;
    wVerts[o + u32(t) * 8u] = cellVert[src];
    wVerts[o + u32(t) * 8u + 1u] = cellVert[src + 1u];
    wVerts[o + u32(t) * 8u + 2u] = cellVert[src + 2u];
    wVerts[o + u32(t) * 8u + 3u] = cellVert[src + 3u];
    wVerts[o + u32(t) * 8u + 4u] = cellVert[src + 4u];
    wVerts[o + u32(t) * 8u + 5u] = cellVert[src + 5u];
    wVerts[o + u32(t) * 8u + 6u] = cellVert[src + 6u];
    wVerts[o + u32(t) * 8u + 7u] = cellVert[src + 7u];
  }
}

@compute @workgroup_size(64)
fn quadsX(@builtin(global_invocation_id) gid: vec3u) {
  let nx = u32(SU.grid.x); let ny = u32(SU.grid.y); let nz = u32(SU.grid.z);
  let total = (nx - 1u) * ny * nz;
  if (gid.x >= total) { return; }
  let i = i32(gid.x % (nx - 1u));
  let j = i32((gid.x / (nx - 1u)) % ny);
  let k = i32(gid.x / ((nx - 1u) * ny));
  let a = gRho[nodeIndexS(i, j, k)];
  let b = gRho[nodeIndexS(i + 1, j, k)];
  let iso = SU.mat.y;
  if ((a - iso) * (b - iso) >= 0.0) { return; }
  emitQuad(cellIndex(i, j - 1, k - 1), cellIndex(i, j, k - 1), cellIndex(i, j, k), cellIndex(i, j - 1, k));
}

@compute @workgroup_size(64)
fn quadsY(@builtin(global_invocation_id) gid: vec3u) {
  let nx = u32(SU.grid.x); let ny = u32(SU.grid.y); let nz = u32(SU.grid.z);
  let total = nx * (ny - 1u) * nz;
  if (gid.x >= total) { return; }
  let i = i32(gid.x % nx);
  let j = i32((gid.x / u32(nx)) % (ny - 1u));
  let k = i32(gid.x / (u32(nx) * (ny - 1u)));
  let a = gRho[nodeIndexS(i, j, k)];
  let b = gRho[nodeIndexS(i, j + 1, k)];
  let iso = SU.mat.y;
  if ((a - iso) * (b - iso) >= 0.0) { return; }
  emitQuad(cellIndex(i - 1, j, k - 1), cellIndex(i, j, k - 1), cellIndex(i, j, k), cellIndex(i - 1, j, k));
}

@compute @workgroup_size(64)
fn quadsZ(@builtin(global_invocation_id) gid: vec3u) {
  let nx = u32(SU.grid.x); let ny = u32(SU.grid.y); let nz = u32(SU.grid.z);
  let total = nx * ny * (nz - 1u);
  if (gid.x >= total) { return; }
  let i = i32(gid.x % nx);
  let j = i32((gid.x / u32(nx)) % ny);
  let k = i32(gid.x / (u32(nx) * ny));
  let a = gRho[nodeIndexS(i, j, k)];
  let b = gRho[nodeIndexS(i, j, k + 1)];
  let iso = SU.mat.y;
  if ((a - iso) * (b - iso) >= 0.0) { return; }
  emitQuad(cellIndex(i - 1, j - 1, k), cellIndex(i, j - 1, k), cellIndex(i, j, k), cellIndex(i - 1, j, k));
}

@compute @workgroup_size(1)
fn writeIndirect() {
  indirectBuf[0] = atomicLoad(&vCount);
  indirectBuf[1] = 1u;
  indirectBuf[2] = 0u;
  indirectBuf[3] = 0u;
}
`;
})(window);
