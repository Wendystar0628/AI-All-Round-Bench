/* global JW */
var JW = JW || {};

JW.nextBodyId = 1;

JW.complianceFor = function (softness) {
  var s = JW.clamp(softness, 0, 1);
  var logA = Math.log(JW.TUNE.compFirm);
  var logB = Math.log(JW.TUNE.compSoft);
  return Math.exp(logA + (logB - logA) * s);
};

JW.dampingFor = function (softness) {
  return JW.lerp(JW.TUNE.dampFirm, JW.TUNE.dampSoft, JW.clamp(softness, 0, 1));
};

function pushTet(tets, a, b, c, d) { tets.push(a, b, c, d); }

JW.buildLattice = function (nx, ny, nz, posFn) {
  var verts = [];
  var index = [];
  function vid(i, j, k) { return (i * (ny + 1) + j) * (nz + 1) + k; }
  for (var i = 0; i <= nx; i++) {
    for (var j = 0; j <= ny; j++) {
      for (var k = 0; k <= nz; k++) {
        var p = posFn(i / nx, j / ny, k / nz);
        verts.push(p[0], p[1], p[2]);
        index.push(vid(i, j, k));
      }
    }
  }
  var tets = [];
  for (var x = 0; x < nx; x++) {
    for (var y = 0; y < ny; y++) {
      for (var z = 0; z < nz; z++) {
        var v000 = vid(x, y, z);
        var v100 = vid(x + 1, y, z);
        var v010 = vid(x, y + 1, z);
        var v110 = vid(x + 1, y + 1, z);
        var v001 = vid(x, y, z + 1);
        var v101 = vid(x + 1, y, z + 1);
        var v011 = vid(x, y + 1, z + 1);
        var v111 = vid(x + 1, y + 1, z + 1);
        pushTet(tets, v000, v100, v110, v111);
        pushTet(tets, v000, v100, v101, v111);
        pushTet(tets, v000, v010, v110, v111);
        pushTet(tets, v000, v010, v011, v111);
        pushTet(tets, v000, v001, v101, v111);
        pushTet(tets, v000, v001, v011, v111);
      }
    }
  }
  return { verts: verts, tets: tets };
};

JW.superEllipsoidPoint = function (u, v, w, rx, ry, rz, exponent) {
  var x = u * 2 - 1, y = v * 2 - 1, z = w * 2 - 1;
  var p = exponent;
  var ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  var nx = Math.pow(ax, p), ny = Math.pow(ay, p), nz = Math.pow(az, p);
  var norm = Math.pow(nx + ny + nz, 1 / p) || 1;
  var s = norm > 1e-5 ? (1 / Math.max(norm, 1)) : 1;
  // Pull cube corners onto the superellipsoid while keeping interior spacing.
  var k = norm <= 1 ? (0.72 + 0.28 * norm) : 1;
  if (norm > 1) k = 1 / norm;
  else k = 1 / Math.pow(Math.pow(norm, p) * 0.35 + 0.65, 1 / p);
  return [Math.sign(x) * ax * k * rx, Math.sign(y) * ay * k * ry, Math.sign(z) * az * k * rz];
};

function det3(ax, ay, az, bx, by, bz, cx, cy, cz) {
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
}

function makeBodyFrom(verts, tets, opt) {
  var n = verts.length / 3;
  var tetArr = tets instanceof Int32Array ? tets : Int32Array.from(tets);
  var nTet = tetArr.length / 4;
  // Orient and drop degenerate tets.
  var kept = [];
  var vols = [];
  for (var t = 0; t < nTet; t++) {
    var i0 = tetArr[t * 4], i1 = tetArr[t * 4 + 1], i2 = tetArr[t * 4 + 2], i3 = tetArr[t * 4 + 3];
    var ax = verts[i1 * 3] - verts[i0 * 3];
    var ay = verts[i1 * 3 + 1] - verts[i0 * 3 + 1];
    var az = verts[i1 * 3 + 2] - verts[i0 * 3 + 2];
    var bx = verts[i2 * 3] - verts[i0 * 3];
    var by = verts[i2 * 3 + 1] - verts[i0 * 3 + 1];
    var bz = verts[i2 * 3 + 2] - verts[i0 * 3 + 2];
    var cx = verts[i3 * 3] - verts[i0 * 3];
    var cy = verts[i3 * 3 + 1] - verts[i0 * 3 + 1];
    var cz = verts[i3 * 3 + 2] - verts[i0 * 3 + 2];
    var d = det3(ax, ay, az, bx, by, bz, cx, cy, cz);
    if (Math.abs(d) < 1e-10) continue;
    if (d < 0) {
      kept.push(i0, i1, i3, i2);
      vols.push(-d);
    } else {
      kept.push(i0, i1, i2, i3);
      vols.push(d);
    }
  }
  tetArr = Int32Array.from(kept);
  nTet = tetArr.length / 4;
  var used = new Uint8Array(n);
  for (var k = 0; k < tetArr.length; k++) used[tetArr[k]] = 1;
  var map = new Int32Array(n);
  map.fill(-1);
  var nv = 0;
  for (var i = 0; i < n; i++) if (used[i]) map[i] = nv++;
  var x = new Float32Array(nv), y = new Float32Array(nv), z = new Float32Array(nv);
  var rx = new Float32Array(nv), ry = new Float32Array(nv), rz = new Float32Array(nv);
  for (var i2 = 0; i2 < n; i2++) {
    if (map[i2] < 0) continue;
    var m = map[i2];
    x[m] = verts[i2 * 3]; y[m] = verts[i2 * 3 + 1]; z[m] = verts[i2 * 3 + 2];
    rx[m] = x[m]; ry[m] = y[m]; rz[m] = z[m];
  }
  for (var t2 = 0; t2 < tetArr.length; t2++) tetArr[t2] = map[tetArr[t2]];
  var body = {
    id: JW.nextBodyId++,
    name: opt.name || "果冻",
    color: opt.color.slice(),
    softness: opt.softness,
    toughness: opt.toughness,
    role: opt.role || "prop",
    n: nv,
    x: x, y: y, z: z,
    vx: new Float32Array(nv), vy: new Float32Array(nv), vz: new Float32Array(nv),
    invMass: new Float32Array(nv),
    rx: rx, ry: ry, rz: rz,
    crack: new Float32Array(nv),
    tet: tetArr,
    tetVol: Float32Array.from(vols),
    nTet: nTet,
    ei: null, ej: null, eLen: null, nEdge: 0,
    contact: null,
    contactSpeed: 0,
    generation: 0,
    floor: 0
  };
  // Mass from approximate volume and density 1050.
  var vol = 0;
  for (var tv = 0; tv < vols.length; tv++) vol += vols[tv] / 6;
  var mass = Math.max(0.2, vol * 1050);
  var pm = mass / nv;
  var inv = 1 / pm;
  for (var pi = 0; pi < nv; pi++) body.invMass[pi] = inv;
  body.mass = mass;
  body.restVolume = vol;
  rebuildEdges(body);
  return body;
}

function rebuildEdges(body) {
  var key = new Map();
  var tet = body.tet;
  for (var t = 0; t < body.nTet; t++) {
    var id = [tet[t * 4], tet[t * 4 + 1], tet[t * 4 + 2], tet[t * 4 + 3]];
    for (var a = 0; a < 4; a++) {
      for (var b = a + 1; b < 4; b++) {
        var i = id[a], j = id[b];
        if (i > j) { var tmp = i; i = j; j = tmp; }
        key.set(i + "," + j, [i, j]);
      }
    }
  }
  var pairs = Array.from(key.values());
  body.nEdge = pairs.length;
  body.ei = new Int32Array(body.nEdge);
  body.ej = new Int32Array(body.nEdge);
  body.eLen = new Float32Array(body.nEdge);
  for (var e = 0; e < pairs.length; e++) {
    var i2 = pairs[e][0], j2 = pairs[e][1];
    body.ei[e] = i2;
    body.ej[e] = j2;
    var dx = body.rx[j2] - body.rx[i2];
    var dy = body.ry[j2] - body.ry[i2];
    var dz = body.rz[j2] - body.rz[i2];
    body.eLen[e] = Math.hypot(dx, dy, dz);
  }
  body.lamE = new Float32Array(body.nEdge);
  body.lamV = new Float32Array(body.nTet);
}

JW.makeJelly = function (opt) {
  var lattice;
  if (opt.shape === "box") {
    lattice = JW.buildLattice(opt.div[0], opt.div[1], opt.div[2], function (u, v, w) {
      return [
        opt.origin[0] + (u - 0.5) * opt.size[0],
        opt.origin[1] + v * opt.size[1],
        opt.origin[2] + (w - 0.5) * opt.size[2]
      ];
    });
  } else {
    lattice = JW.buildLattice(opt.div[0], opt.div[1], opt.div[2], function (u, v, w) {
      var p = JW.superEllipsoidPoint(u, v, w, opt.size[0], opt.size[1], opt.size[2], opt.exponent || 2.2);
      // Sit the bottom on y=0.
      return [opt.origin[0] + p[0], opt.origin[1] + p[1] + opt.size[1], opt.origin[2] + p[2]];
    });
    // superellipsoid is centered, y in [-ry, ry], plus ry puts bottom near 0.
  }
  var body = makeBodyFrom(lattice.verts, lattice.tets, opt);
  // Plant bottom exactly on the floor.
  var minY = 1e9;
  for (var i = 0; i < body.n; i++) if (body.y[i] < minY) minY = body.y[i];
  for (var j = 0; j < body.n; j++) {
    body.y[j] -= minY;
    body.ry[j] -= minY;
  }
  return body;
};

JW.cloneBody = function (b) {
  var c = {
    id: b.id,
    name: b.name,
    color: b.color.slice(),
    softness: b.softness,
    toughness: b.toughness,
    role: b.role,
    n: b.n,
    x: b.x.slice(), y: b.y.slice(), z: b.z.slice(),
    vx: b.vx.slice(), vy: b.vy.slice(), vz: b.vz.slice(),
    invMass: b.invMass.slice(),
    rx: b.rx.slice(), ry: b.ry.slice(), rz: b.rz.slice(),
    crack: b.crack.slice(),
    tet: b.tet.slice(),
    tetVol: b.tetVol.slice(),
    nTet: b.nTet,
    ei: b.ei.slice(), ej: b.ej.slice(), eLen: b.eLen.slice(), nEdge: b.nEdge,
    lamE: new Float32Array(b.nEdge),
    lamV: new Float32Array(b.nTet),
    contact: null,
    contactSpeed: 0,
    generation: b.generation,
    floor: b.floor,
    softBias: b.softBias || 0,
    toughBias: b.toughBias || 0,
    mass: b.mass,
    restVolume: b.restVolume
  };
  return c;
};

function solveEdge(b, e, dt, comp) {
  var i = b.ei[e], j = b.ej[e];
  var dx = b.x[j] - b.x[i];
  var dy = b.y[j] - b.y[i];
  var dz = b.z[j] - b.z[i];
  var len = Math.hypot(dx, dy, dz);
  if (len < 1e-8) return;
  var C = len - b.eLen[e];
  var w = b.invMass[i] + b.invMass[j];
  if (w <= 0) return;
  var alpha = comp / (dt * dt);
  var lam = b.lamE[e];
  var dl = (-C - alpha * lam) / (w + alpha);
  var cap = 0.02 / (Math.max(b.invMass[i], b.invMass[j]) + 1e-6);
  if (dl > cap) dl = cap;
  else if (dl < -cap) dl = -cap;
  b.lamE[e] = lam + dl;
  var nx = dx / len, ny = dy / len, nz = dz / len;
  var si = dl * b.invMass[i];
  var sj = dl * b.invMass[j];
  b.x[i] -= nx * si; b.y[i] -= ny * si; b.z[i] -= nz * si;
  b.x[j] += nx * sj; b.y[j] += ny * sj; b.z[j] += nz * sj;
}

function solveVolume(b, t, dt) {
  var i0 = b.tet[t * 4], i1 = b.tet[t * 4 + 1], i2 = b.tet[t * 4 + 2], i3 = b.tet[t * 4 + 3];
  var x0 = b.x[i0], y0 = b.y[i0], z0 = b.z[i0];
  var d1x = b.x[i1] - x0, d1y = b.y[i1] - y0, d1z = b.z[i1] - z0;
  var d2x = b.x[i2] - x0, d2y = b.y[i2] - y0, d2z = b.z[i2] - z0;
  var d3x = b.x[i3] - x0, d3y = b.y[i3] - y0, d3z = b.z[i3] - z0;
  var g1x = d2y * d3z - d2z * d3y;
  var g1y = d2z * d3x - d2x * d3z;
  var g1z = d2x * d3y - d2y * d3x;
  var g2x = d3y * d1z - d3z * d1y;
  var g2y = d3z * d1x - d3x * d1z;
  var g2z = d3x * d1y - d3y * d1x;
  var g3x = d1y * d2z - d1z * d2y;
  var g3y = d1z * d2x - d1x * d2z;
  var g3z = d1x * d2y - d1y * d2x;
  var g0x = -g1x - g2x - g3x;
  var g0y = -g1y - g2y - g3y;
  var g0z = -g1z - g2z - g3z;
  var det = d1x * g1x + d1y * g1y + d1z * g1z;
  var C = det - b.tetVol[t];
  var w0 = b.invMass[i0] * (g0x * g0x + g0y * g0y + g0z * g0z);
  var w1 = b.invMass[i1] * (g1x * g1x + g1y * g1y + g1z * g1z);
  var w2 = b.invMass[i2] * (g2x * g2x + g2y * g2y + g2z * g2z);
  var w3 = b.invMass[i3] * (g3x * g3x + g3y * g3y + g3z * g3z);
  var w = w0 + w1 + w2 + w3;
  if (w < 1e-16) return;
  var alpha = JW.TUNE.volComp / (dt * dt);
  var lam = b.lamV[t];
  var dl = (-C - alpha * lam) / (w + alpha);
  var gmax = Math.max(g0x * g0x + g0y * g0y + g0z * g0z, g1x * g1x + g1y * g1y + g1z * g1z, g2x * g2x + g2y * g2y + g2z * g2z, g3x * g3x + g3y * g3y + g3z * g3z);
  var invMax = Math.max(b.invMass[i0], b.invMass[i1], b.invMass[i2], b.invMass[i3]);
  var capV = 0.018 / (Math.sqrt(gmax) * invMax + 1e-8);
  if (dl > capV) dl = capV;
  else if (dl < -capV) dl = -capV;
  b.lamV[t] = lam + dl;
  var s0 = dl * b.invMass[i0];
  var s1 = dl * b.invMass[i1];
  var s2 = dl * b.invMass[i2];
  var s3 = dl * b.invMass[i3];
  b.x[i0] += g0x * s0; b.y[i0] += g0y * s0; b.z[i0] += g0z * s0;
  b.x[i1] += g1x * s1; b.y[i1] += g1y * s1; b.z[i1] += g1z * s1;
  b.x[i2] += g2x * s2; b.y[i2] += g2y * s2; b.z[i2] += g2z * s2;
  b.x[i3] += g3x * s3; b.y[i3] += g3y * s3; b.z[i3] += g3z * s3;
}

function collideBallParticle(b, i, ball) {
  var dx = b.x[i] - ball.x;
  var dy = b.y[i] - ball.y;
  var dz = b.z[i] - ball.z;
  var dist = Math.hypot(dx, dy, dz);
  var R = ball.r + 0.004;
  if (dist >= R || dist < 1e-8) return false;
  var nx = dx / dist, ny = dy / dist, nz = dz / dist;
  var pen = R - dist;
  var w = b.invMass[i] + ball.invMass;
  if (w <= 0) return false;
  var corr = pen / w;
  var si = corr * b.invMass[i];
  var sb = corr * ball.invMass;
  b.x[i] += nx * si; b.y[i] += ny * si; b.z[i] += nz * si;
  ball.x -= nx * sb; ball.y -= ny * sb; ball.z -= nz * sb;
  b.contact = { x: b.x[i], y: b.y[i], z: b.z[i] };
  return true;
}

function collideBallTet(b, t, ball) {
  var i0 = b.tet[t * 4], i1 = b.tet[t * 4 + 1], i2 = b.tet[t * 4 + 2], i3 = b.tet[t * 4 + 3];
  var cx = (b.x[i0] + b.x[i1] + b.x[i2] + b.x[i3]) * 0.25;
  var cy = (b.y[i0] + b.y[i1] + b.y[i2] + b.y[i3]) * 0.25;
  var cz = (b.z[i0] + b.z[i1] + b.z[i2] + b.z[i3]) * 0.25;
  var dx = cx - ball.x, dy = cy - ball.y, dz = cz - ball.z;
  var dist = Math.hypot(dx, dy, dz);
  var R = ball.r * 0.92;
  if (dist >= R || dist < 1e-8) return false;
  var nx = dx / dist, ny = dy / dist, nz = dz / dist;
  var pen = R - dist;
  var w = ball.invMass + b.invMass[i0] + b.invMass[i1] + b.invMass[i2] + b.invMass[i3];
  var corr = pen / w;
  ball.x -= nx * corr * ball.invMass;
  ball.y -= ny * corr * ball.invMass;
  ball.z -= nz * corr * ball.invMass;
  var ids = [i0, i1, i2, i3];
  for (var k = 0; k < 4; k++) {
    var id = ids[k];
    var s = corr * b.invMass[id];
    b.x[id] += nx * s; b.y[id] += ny * s; b.z[id] += nz * s;
  }
  b.contact = { x: cx, y: cy, z: cz };
  return true;
}

function applyBallFriction(b, i, ball) {
  var dx = b.x[i] - ball.x;
  var dy = b.y[i] - ball.y;
  var dz = b.z[i] - ball.z;
  var dist = Math.hypot(dx, dy, dz);
  var R = ball.r + 0.012;
  if (dist >= R || dist < 1e-8) return;
  var nx = dx / dist, ny = dy / dist, nz = dz / dist;
  var rx = -nx * ball.r, ry = -ny * ball.r, rz = -nz * ball.r;
  var wx = ball.wx || 0, wy = ball.wy || 0, wz = ball.wz || 0;
  var tx = wy * rz - wz * ry;
  var ty = wz * rx - wx * rz;
  var tz = wx * ry - wy * rx;
  var rvx = b.vx[i] - (ball.vx + tx);
  var rvy = b.vy[i] - (ball.vy + ty);
  var rvz = b.vz[i] - (ball.vz + tz);
  var vn = rvx * nx + rvy * ny + rvz * nz;
  var txv = rvx - vn * nx, tyv = rvy - vn * ny, tzv = rvz - nz * vn;
  var slip = Math.hypot(txv, tyv, tzv);
  if (slip < 1e-5) return;
  var I = 0.4 * ball.mass * ball.r * ball.r;
  var invI = 1 / I;
  var rn = ball.r;
  var w = b.invMass[i] + ball.invMass + rn * rn * invI;
  var j = Math.min(slip / w, slip * JW.TUNE.ballJellyFric);
  var jx = txv / slip * j, jy = tyv / slip * j, jz = tzv / slip * j;
  b.vx[i] -= jx * b.invMass[i];
  b.vy[i] -= jy * b.invMass[i];
  b.vz[i] -= jz * b.invMass[i];
  ball.vx += jx * ball.invMass;
  ball.vy += jy * ball.invMass;
  ball.vz += jz * ball.invMass;
  ball.wx = wx + (ry * jz - rz * jy) * invI;
  ball.wy = wy + (rz * jx - rx * jz) * invI;
  ball.wz = wz + (rx * jy - ry * jx) * invI;
}

function maxTensileEdge(b) {
  var best = 0;
  var bi = 0, bj = 1;
  var bx = 1, by = 0, bz = 0;
  for (var e = 0; e < b.nEdge; e++) {
    var i = b.ei[e], j = b.ej[e];
    var dx = b.x[j] - b.x[i], dy = b.y[j] - b.y[i], dz = b.z[j] - b.z[i];
    var len = Math.hypot(dx, dy, dz);
    var strain = (len - b.eLen[e]) / (b.eLen[e] + 1e-8);
    if (strain > best) {
      best = strain;
      bi = i; bj = j;
      bx = dx / (len || 1); by = dy / (len || 1); bz = dz / (len || 1);
    }
  }
  return { strain: best, i: bi, j: bj, nx: bx, ny: by, nz: bz };
}

function tetCentroid(b, t) {
  var i0 = b.tet[t * 4], i1 = b.tet[t * 4 + 1], i2 = b.tet[t * 4 + 2], i3 = b.tet[t * 4 + 3];
  return {
    x: (b.x[i0] + b.x[i1] + b.x[i2] + b.x[i3]) * 0.25,
    y: (b.y[i0] + b.y[i1] + b.y[i2] + b.y[i3]) * 0.25,
    z: (b.z[i0] + b.z[i1] + b.z[i2] + b.z[i3]) * 0.25
  };
}

function tetStrain(b, t) {
  var id = [b.tet[t * 4], b.tet[t * 4 + 1], b.tet[t * 4 + 2], b.tet[t * 4 + 3]];
  var worst = 0;
  var nx = 1, ny = 0, nz = 0;
  for (var a = 0; a < 4; a++) {
    for (var c = a + 1; c < 4; c++) {
      var i = id[a], j = id[c];
      var dx = b.x[j] - b.x[i], dy = b.y[j] - b.y[i], dz = b.z[j] - b.z[i];
      var len = Math.hypot(dx, dy, dz);
      var rdx = b.rx[j] - b.rx[i], rdy = b.ry[j] - b.ry[i], rdz = b.rz[j] - b.rz[i];
      var rl = Math.hypot(rdx, rdy, rdz);
      var strain = (len - rl) / (rl + 1e-8);
      if (strain > worst) {
        worst = strain;
        nx = dx / (len || 1); ny = dy / (len || 1); nz = dz / (len || 1);
      }
    }
  }
  return { strain: worst, nx: nx, ny: ny, nz: nz };
}

function buildFromPartition(src, tetSide, which, normal, point, impact) {
  var remap = new Int32Array(src.n);
  remap.fill(-1);
  var list = [];
  var tets = [];
  var vols = [];
  for (var t = 0; t < src.nTet; t++) {
    if (tetSide[t] !== which) continue;
    var ids = [];
    for (var k = 0; k < 4; k++) {
      var v = src.tet[t * 4 + k];
      if (remap[v] < 0) {
        remap[v] = list.length;
        list.push(v);
      }
      ids.push(remap[v]);
    }
    tets.push(ids[0], ids[1], ids[2], ids[3]);
    vols.push(src.tetVol[t]);
  }
  if (list.length < 4 || tets.length < 4) return null;
  var nv = list.length;
  var verts = new Float32Array(nv * 3);
  var rest = new Float32Array(nv * 3);
  var vel = new Float32Array(nv * 3);
  var crack = new Float32Array(nv);
  for (var i = 0; i < nv; i++) {
    var s = list[i];
    var px = src.x[s], py = src.y[s], pz = src.z[s];
    var shared = false;
    // A vertex used by the other side is on the crack lip.
    verts[i * 3] = px; verts[i * 3 + 1] = py; verts[i * 3 + 2] = pz;
    rest[i * 3] = src.rx[s]; rest[i * 3 + 1] = src.ry[s]; rest[i * 3 + 2] = src.rz[s];
    vel[i * 3] = src.vx[s]; vel[i * 3 + 1] = src.vy[s]; vel[i * 3 + 2] = src.vz[s];
    crack[i] = 0;
    void shared;
  }
  // Mark crack vertices: those whose source vertex is referenced by opposite tets.
  var usedOpp = new Uint8Array(src.n);
  for (var t2 = 0; t2 < src.nTet; t2++) {
    if (tetSide[t2] === which) continue;
    for (var k2 = 0; k2 < 4; k2++) usedOpp[src.tet[t2 * 4 + k2]] = 1;
  }
  var gap = 0.006;
  for (var i2 = 0; i2 < nv; i2++) {
    var s2 = list[i2];
    if (!usedOpp[s2]) continue;
    crack[i2] = 1;
    var open = 1;
    if (impact) {
      var dx = src.x[s2] - impact.x, dy = src.y[s2] - impact.y, dz = src.z[s2] - impact.z;
      var dist = Math.hypot(dx, dy, dz);
      open = Math.max(0.25, 1.15 - dist * 1.6);
    }
    var sgn = which;
    verts[i2 * 3] += normal.x * sgn * gap * open;
    verts[i2 * 3 + 1] += normal.y * sgn * gap * open;
    verts[i2 * 3 + 2] += normal.z * sgn * gap * open;
    vel[i2 * 3] += normal.x * sgn * 0.55 * open;
    vel[i2 * 3 + 1] += normal.y * sgn * 0.55 * open;
    vel[i2 * 3 + 2] += normal.z * sgn * 0.55 * open;
  }
  var body = {
    id: JW.nextBodyId++,
    name: src.name,
    color: src.color.slice(),
    softness: src.softness,
    toughness: src.toughness,
    role: src.role,
    n: nv,
    x: verts.subarray ? Float32Array.from(verts) : verts,
    y: new Float32Array(nv),
    z: new Float32Array(nv),
    vx: new Float32Array(nv), vy: new Float32Array(nv), vz: new Float32Array(nv),
    invMass: new Float32Array(nv),
    rx: new Float32Array(nv), ry: new Float32Array(nv), rz: new Float32Array(nv),
    crack: crack,
    tet: Int32Array.from(tets),
    tetVol: Float32Array.from(vols),
    nTet: tets.length / 4,
    contact: null,
    contactSpeed: src.contactSpeed,
    generation: src.generation + 1,
    floor: src.floor,
    softBias: src.softBias || 0,
    toughBias: src.toughBias || 0,
    mass: src.mass * (nv / src.n),
    restVolume: 0
  };
  // The packed xyz above was wrong — rewrite properly.
  for (var i3 = 0; i3 < nv; i3++) {
    body.x[i3] = verts[i3 * 3];
    body.y[i3] = verts[i3 * 3 + 1];
    body.z[i3] = verts[i3 * 3 + 2];
    body.rx[i3] = rest[i3 * 3];
    body.ry[i3] = rest[i3 * 3 + 1];
    body.rz[i3] = rest[i3 * 3 + 2];
    body.vx[i3] = vel[i3 * 3];
    body.vy[i3] = vel[i3 * 3 + 1];
    body.vz[i3] = vel[i3 * 3 + 2];
    body.invMass[i3] = src.invMass[list[i3]];
  }
  var vol = 0;
  for (var tv = 0; tv < body.tetVol.length; tv++) vol += body.tetVol[tv] / 6;
  body.restVolume = vol;
  rebuildEdges(body);
  return body;
}

function tryFracture(b, time) {
  if (b.nTet < 80) return null;
  if (b.noBreakUntil && time < b.noBreakUntil) return null;
  var edgeInfo = maxTensileEdge(b);
  if (edgeInfo.strain < b.toughness) return null;
  var best = null;
  var contact = b.contact;
  for (var t = 0; t < b.nTet; t++) {
    var info = tetStrain(b, t);
    if (info.strain < b.toughness * 0.92) continue;
    var c = tetCentroid(b, t);
    var dist = 0.2;
    if (contact) dist = Math.hypot(c.x - contact.x, c.y - contact.y, c.z - contact.z);
    var score = info.strain / (0.12 + dist);
    if (!best || score > best.score) best = { score: score, c: c, info: info, t: t };
  }
  if (!best) {
    // Fall back to the global most-stretched edge midpoint.
    var i = edgeInfo.i, j = edgeInfo.j;
    best = {
      c: { x: (b.x[i] + b.x[j]) * 0.5, y: (b.y[i] + b.y[j]) * 0.5, z: (b.z[i] + b.z[j]) * 0.5 },
      info: edgeInfo
    };
  }
  var normal = JW.norm({ x: best.info.nx, y: best.info.ny, z: best.info.nz });
  if (Math.abs(normal.y) > 0.92) {
    // A near-vertical tension direction would slice horizontally into a pancake.
    // Prefer the horizontal component so the crack opens from the strike.
    var hx = normal.x, hz = normal.z;
    var hl = Math.hypot(hx, hz);
    if (hl < 0.2) { hx = 1; hz = 0; hl = 1; }
    normal = { x: hx / hl, y: 0.15 * Math.sign(normal.y || 1), z: hz / hl };
    normal = JW.norm(normal);
  }
  var side = new Int8Array(b.n);
  for (var p = 0; p < b.n; p++) {
    var sd = (b.x[p] - best.c.x) * normal.x + (b.y[p] - best.c.y) * normal.y + (b.z[p] - best.c.z) * normal.z;
    side[p] = sd >= 0 ? 1 : -1;
  }
  var tetSide = new Int8Array(b.nTet);
  var nA = 0, nB = 0;
  for (var t2 = 0; t2 < b.nTet; t2++) {
    var ssum = 0;
    for (var k = 0; k < 4; k++) ssum += side[b.tet[t2 * 4 + k]];
    // Centroid side, breaking ties toward the larger vertex vote.
    var ts = ssum >= 0 ? 1 : -1;
    tetSide[t2] = ts;
    if (ts > 0) nA++; else nB++;
  }
  if (nA < 6 || nB < 6) return null;
  if (nA < b.nTet * 0.08 || nB < b.nTet * 0.08) return null;
  var A = buildFromPartition(b, tetSide, 1, normal, best.c, b.contact);
  var B = buildFromPartition(b, tetSide, -1, normal, best.c, b.contact);
  if (!A || !B) return null;
  A.noBreakUntil = time + 0.42;
  B.noBreakUntil = time + 0.42;
  return [A, B];
}

JW.extractSurface = function (b) {
  var map = new Map();
  var tet = b.tet;
  function addFace(a, c, d, opp) {
    var s0 = a, s1 = c, s2 = d;
    var k0 = s0, k1 = s1, k2 = s2;
    if (k0 > k1) { var t = k0; k0 = k1; k1 = t; }
    if (k1 > k2) { var t2 = k1; k1 = k2; k2 = t2; }
    if (k0 > k1) { var t3 = k0; k0 = k1; k1 = t3; }
    var key = k0 + "," + k1 + "," + k2;
    if (map.has(key)) map.delete(key);
    else map.set(key, [a, c, d, opp]);
  }
  for (var t = 0; t < b.nTet; t++) {
    var i0 = tet[t * 4], i1 = tet[t * 4 + 1], i2 = tet[t * 4 + 2], i3 = tet[t * 4 + 3];
    addFace(i1, i3, i2, i0);
    addFace(i0, i2, i3, i1);
    addFace(i0, i3, i1, i2);
    addFace(i0, i1, i2, i3);
  }
  // Fix winding so normals point away from the opposite vertex.
  var faces = [];
  map.forEach(function (f) {
    var a = f[0], c = f[1], d = f[2], o = f[3];
    var abx = b.x[c] - b.x[a], aby = b.y[c] - b.y[a], abz = b.z[c] - b.z[a];
    var acx = b.x[d] - b.x[a], acy = b.y[d] - b.y[a], acz = b.z[d] - b.z[a];
    var nx = aby * acz - abz * acy;
    var ny = abz * acx - abx * acz;
    var nz = abx * acy - aby * acx;
    var ox = b.x[o] - b.x[a], oy = b.y[o] - b.y[a], oz = b.z[o] - b.z[a];
    if (nx * ox + ny * oy + nz * oz > 0) faces.push(a, d, c);
    else faces.push(a, c, d);
  });
  var pos = new Float32Array(b.n * 3);
  var nor = new Float32Array(b.n * 3);
  var col = new Float32Array(b.n * 4);
  for (var i = 0; i < faces.length; i += 3) {
    var ia = faces[i], ib = faces[i + 1], ic = faces[i + 2];
    var x0 = b.x[ia], y0 = b.y[ia], z0 = b.z[ia];
    var ux = b.x[ib] - x0, uy = b.y[ib] - y0, uz = b.z[ib] - z0;
    var vx = b.x[ic] - x0, vy = b.y[ic] - y0, vz = b.z[ic] - z0;
    var nx2 = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz2 = ux * vy - uy * vx;
    nor[ia * 3] += nx2; nor[ia * 3 + 1] += ny2; nor[ia * 3 + 2] += nz2;
    nor[ib * 3] += nx2; nor[ib * 3 + 1] += ny2; nor[ib * 3 + 2] += nz2;
    nor[ic * 3] += nx2; nor[ic * 3 + 1] += ny2; nor[ic * 3 + 2] += nz2;
  }
  for (var p = 0; p < b.n; p++) {
    pos[p * 3] = b.x[p]; pos[p * 3 + 1] = b.y[p]; pos[p * 3 + 2] = b.z[p];
    var nx3 = nor[p * 3], ny3 = nor[p * 3 + 1], nz3 = nor[p * 3 + 2];
    var l = Math.hypot(nx3, ny3, nz3) || 1;
    nor[p * 3] = nx3 / l; nor[p * 3 + 1] = ny3 / l; nor[p * 3 + 2] = nz3 / l;
    col[p * 4] = b.color[0]; col[p * 4 + 1] = b.color[1]; col[p * 4 + 2] = b.color[2];
    col[p * 4 + 3] = b.crack[p];
  }
  return { pos: pos, nor: nor, col: col, idx: Uint32Array.from(faces), count: faces.length };
};

JW.bodyVolume = function (b) {
  var vol = 0;
  for (var t = 0; t < b.nTet; t++) {
    var i0 = b.tet[t * 4], i1 = b.tet[t * 4 + 1], i2 = b.tet[t * 4 + 2], i3 = b.tet[t * 4 + 3];
    var d1x = b.x[i1] - b.x[i0], d1y = b.y[i1] - b.y[i0], d1z = b.z[i1] - b.z[i0];
    var d2x = b.x[i2] - b.x[i0], d2y = b.y[i2] - b.y[i0], d2z = b.z[i2] - b.z[i0];
    var d3x = b.x[i3] - b.x[i0], d3y = b.y[i3] - b.y[i0], d3z = b.z[i3] - b.z[i0];
    vol += det3(d1x, d1y, d1z, d2x, d2y, d2z, d3x, d3y, d3z) / 6;
  }
  return vol;
};

JW.stepJellies = function (bodies, balls, dt, time, events) {
  var g = JW.CFG.gravity;
  var floor = 0;
  var out = bodies;
  if (balls) {
    for (var sb = 0; sb < balls.length; sb++) {
      var ball0 = balls[sb];
      ball0._px = ball0.x; ball0._py = ball0.y; ball0._pz = ball0.z;
      ball0._vinY = ball0.vy;
      ball0._touched = false;
      if (ball0.held) continue;
      ball0.vy -= g * dt;
      ball0.x += ball0.vx * dt;
      ball0.y += ball0.vy * dt;
      ball0.z += ball0.vz * dt;
    }
  }
  for (var bi = 0; bi < out.length; bi++) {
    var b = out[bi];
    var comp = JW.complianceFor(b.softness);
    var damp = Math.exp(-JW.dampingFor(b.softness) * dt);
    b.lamE.fill(0);
    b.lamV.fill(0);
    var sx = new Float32Array(b.n);
    var sy = new Float32Array(b.n);
    var sz = new Float32Array(b.n);
    for (var i = 0; i < b.n; i++) {
      b.vy[i] -= g * dt;
      b.vx[i] *= damp; b.vy[i] *= damp; b.vz[i] *= damp;
      sx[i] = b.x[i]; sy[i] = b.y[i]; sz[i] = b.z[i];
      b.x[i] += b.vx[i] * dt;
      b.y[i] += b.vy[i] * dt;
      b.z[i] += b.vz[i] * dt;
    }
    var iters = JW.TUNE.jellyIters;
    for (var it = 0; it < iters; it++) {
      for (var e = 0; e < b.nEdge; e++) solveEdge(b, e, dt, comp);
      for (var t = 0; t < b.nTet; t++) solveVolume(b, t, dt);
      for (var p = 0; p < b.n; p++) {
        if (b.y[p] < floor) b.y[p] = floor;
      }
      if (balls) {
        for (var s = 0; s < balls.length; s++) {
          var ball = balls[s];
          if (ball.held) continue;
          var hit = false;
          for (var p2 = 0; p2 < b.n; p2++) {
            if (collideBallParticle(b, p2, ball)) hit = true;
          }
          for (var tt = 0; tt < b.nTet; tt += 2) {
            if (collideBallTet(b, tt, ball)) hit = true;
          }
          if (hit) {
            ball._touched = true;
            var sp = Math.hypot(ball._vinY, ball.vx, ball.vz);
            if (sp > b.contactSpeed) b.contactSpeed = sp;
          }
        }
      }
      // Jelly-jelly: only a cheap push of vertices out of the other body's particles near contact.
    }
    // Separate overlapping jellies with a coarse vertex-sphere test against the other surface samples.
    if (bi > 0) {
      for (var oj = 0; oj < bi; oj++) {
        separateBodies(b, out[oj]);
      }
    }
    for (var i2 = 0; i2 < b.n; i2++) {
      var vx = (b.x[i2] - sx[i2]) / dt;
      var vy = (b.y[i2] - sy[i2]) / dt;
      var vz = (b.z[i2] - sz[i2]) / dt;
      if (vx > 8) vx = 8; else if (vx < -8) vx = -8;
      if (vy > 8) vy = 8; else if (vy < -8) vy = -8;
      if (vz > 8) vz = 8; else if (vz < -8) vz = -8;
      b.vx[i2] = vx; b.vy[i2] = vy; b.vz[i2] = vz;
      if (b.y[i2] <= floor + 1e-4) {
        if (b.vy[i2] < 0) b.vy[i2] = 0;
        var h = Math.hypot(b.vx[i2], b.vz[i2]);
        var dec = JW.TUNE.groundMu * g * dt * 3.2;
        if (h <= dec) { b.vx[i2] = 0; b.vz[i2] = 0; }
        else {
          var sc = (h - dec) / h;
          b.vx[i2] *= sc; b.vz[i2] *= sc;
        }
      }
    }
    if (balls) {
      for (var s2 = 0; s2 < balls.length; s2++) {
        var bf = balls[s2];
        if (bf.held) continue;
        for (var p3 = 0; p3 < b.n; p3 += 2) applyBallFriction(b, p3, bf);
      }
    }
  }
  if (balls) {
    for (var s3 = 0; s3 < balls.length; s3++) {
      var s = balls[s3];
      if (s.held) continue;
      var nvx = (s.x - s._px) / dt;
      var nvy = (s.y - s._py) / dt;
      var nvz = (s.z - s._pz) / dt;
      if (s.y < floor + s.r) {
        s.y = floor + s.r;
        if (s._vinY < -0.45) nvy = -s._vinY * JW.TUNE.ballFloorE;
        else if (nvy < 0) nvy = 0;
        var I = 0.4 * s.mass * s.r * s.r;
        var slipX = nvx - (s.wz || 0) * s.r;
        var slipZ = nvz + (s.wx || 0) * s.r;
        var slip = Math.hypot(slipX, slipZ);
        if (slip > 1e-4) {
          var k = Math.min(1, (4.5 * dt) / slip);
          nvx -= slipX * k * 0.65;
          nvz -= slipZ * k * 0.65;
          s.wz = (s.wz || 0) + (slipX * k * s.r) / I * 0.65;
          s.wx = (s.wx || 0) - (slipZ * k * s.r) / I * 0.65;
        }
        if (events && s._vinY < -0.9 && !s._touched) events.floorHit = Math.max(events.floorHit || 0, -s._vinY);
      }
      if (nvx > 9) nvx = 9; else if (nvx < -9) nvx = -9;
      if (nvy > 9) nvy = 9; else if (nvy < -9) nvy = -9;
      if (nvz > 9) nvz = 9; else if (nvz < -9) nvz = -9;
      s.vx = nvx; s.vy = nvy; s.vz = nvz;
      if (s._touched && !s.prevContact && s._vinY < -0.6 && events) {
        events.impact = Math.max(events.impact || 0, -s._vinY);
      }
      s.prevContact = s._touched;
      s.quat = JW.quatFromAngVel(s.quat, { x: s.wx || 0, y: s.wy || 0, z: s.wz || 0 }, dt);
    }
    for (var a = 0; a < balls.length; a++) {
      for (var c = 0; c < a; c++) {
        var A = balls[a], B = balls[c];
        if (A.held || B.held) continue;
        var dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z;
        var dist = Math.hypot(dx, dy, dz);
        var minD = A.r + B.r;
        if (dist >= minD || dist < 1e-6) continue;
        var nx = dx / dist, ny = dy / dist, nz = dz / dist;
        var pen = minD - dist;
        var wsum = A.invMass + B.invMass;
        A.x += nx * pen * (A.invMass / wsum);
        A.y += ny * pen * (A.invMass / wsum);
        A.z += nz * pen * (A.invMass / wsum);
        B.x -= nx * pen * (B.invMass / wsum);
        B.y -= ny * pen * (B.invMass / wsum);
        B.z -= nz * pen * (B.invMass / wsum);
        var rv = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny + (A.vz - B.vz) * nz;
        if (rv < 0) {
          var jimp = -(1 + 0.4) * rv / wsum;
          A.vx += nx * jimp * A.invMass; A.vy += ny * jimp * A.invMass; A.vz += nz * jimp * A.invMass;
          B.vx -= nx * jimp * B.invMass; B.vy -= ny * jimp * B.invMass; B.vz -= nz * jimp * B.invMass;
          if (events) events.ballHit = Math.max(events.ballHit || 0, -rv);
        }
      }
    }
  }
  var next = [];
  var fractured = false;
  var worstI = -1;
  var worstStrain = -1;
  for (var q = 0; q < out.length; q++) {
    var info = maxTensileEdge(out[q]);
    if (info.strain > worstStrain) { worstStrain = info.strain; worstI = q; }
  }
  for (var q2 = 0; q2 < out.length; q2++) {
    var parts = null;
    if (q2 === worstI) parts = tryFracture(out[q2], time || 0);
    if (parts) {
      fractured = true;
      next.push(parts[0], parts[1]);
      if (events) events.crack = (events.crack || 0) + 1;
    } else next.push(out[q2]);
  }
  return { bodies: next, fractured: fractured };
};

function separateBodies(a, b) {
  // Sample a subset of vertices as spheres of radius based on local spacing.
  var rad = 0.03;
  var stepA = Math.max(1, (a.n / 80) | 0);
  var stepB = Math.max(1, (b.n / 80) | 0);
  for (var i = 0; i < a.n; i += stepA) {
    for (var j = 0; j < b.n; j += stepB) {
      var dx = a.x[i] - b.x[j];
      var dy = a.y[i] - b.y[j];
      var dz = a.z[i] - b.z[j];
      var d2 = dx * dx + dy * dy + dz * dz;
      var minD = rad * 2;
      if (d2 >= minD * minD || d2 < 1e-10) continue;
      var d = Math.sqrt(d2);
      var pen = minD - d;
      var nx = dx / d, ny = dy / d, nz = dz / d;
      var wa = a.invMass[i], wb = b.invMass[j];
      var w = wa + wb;
      a.x[i] += nx * pen * (wa / w);
      a.y[i] += ny * pen * (wa / w);
      a.z[i] += nz * pen * (wa / w);
      b.x[j] -= nx * pen * (wb / w);
      b.y[j] -= ny * pen * (wb / w);
      b.z[j] -= nz * pen * (wb / w);
    }
  }
}

JW.makeSphere = function (opt) {
  return {
    x: opt.x, y: opt.y, z: opt.z,
    vx: opt.vx || 0, vy: opt.vy || 0, vz: opt.vz || 0,
    wx: 0, wy: 0, wz: 0,
    r: opt.r,
    mass: opt.mass,
    invMass: 1 / opt.mass,
    material: opt.material || "metal",
    color: opt.color || (opt.material === "stone" ? [0.45, 0.42, 0.38] : [0.78, 0.8, 0.83]),
    held: !!opt.held,
    quat: { x: 0, y: 0, z: 0, w: 1 },
    prevContact: false,
    id: opt.id || 0
  };
};

JW.stepBalls = function (balls, dt, events) {
  var g = JW.CFG.gravity;
  var floor = 0;
  for (var i = 0; i < balls.length; i++) {
    var s = balls[i];
    if (s.held) continue;
    var px = s.x, py = s.y, pz = s.z;
    s.vy -= g * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.y < floor + s.r) {
      var vin = s.vy;
      s.y = floor + s.r;
      if (vin < -0.4) {
        s.vy = -vin * JW.TUNE.ballFloorE;
        if (events && Math.abs(vin) > 0.8) events.floorHit = Math.max(events.floorHit || 0, Math.abs(vin));
      } else if (s.vy < 0) s.vy = 0;
      // Roll friction and spin coupling.
      var I = 0.4 * s.mass * s.r * s.r;
      var slipX = s.vx - s.wz * s.r;
      var slipZ = s.vz + s.wx * s.r;
      var slip = Math.hypot(slipX, slipZ);
      var maxF = 6 * dt;
      if (slip > 1e-4) {
        var k = Math.min(1, maxF / slip);
        var jx = slipX * k, jz = slipZ * k;
        var invSum = 1 / (s.invMass + (s.r * s.r) / I);
        // Reduce slip.
        s.vx -= jx * 0.6;
        s.vz -= jz * 0.6;
        s.wz += (jx * s.r) / I * 0.6;
        s.wx -= (jz * s.r) / I * 0.6;
      }
      s.wx *= 0.995; s.wy *= 0.995; s.wz *= 0.995;
      void invSum;
    }
    // Ball-ball.
    for (var j = 0; j < i; j++) {
      var o = balls[j];
      var dx = s.x - o.x, dy = s.y - o.y, dz = s.z - o.z;
      var dist = Math.hypot(dx, dy, dz);
      var minD = s.r + o.r;
      if (dist >= minD || dist < 1e-8) continue;
      var nx = dx / dist, ny = dy / dist, nz = dz / dist;
      var pen = minD - dist;
      var w = s.invMass + o.invMass;
      s.x += nx * pen * (s.invMass / w);
      s.y += ny * pen * (s.invMass / w);
      s.z += nz * pen * (s.invMass / w);
      o.x -= nx * pen * (o.invMass / w);
      o.y -= ny * pen * (o.invMass / w);
      o.z -= nz * pen * (o.invMass / w);
      var rv = (s.vx - o.vx) * nx + (s.vy - o.vy) * ny + (s.vz - o.vz) * nz;
      if (rv < 0) {
        var e = 0.45;
        var jimp = -(1 + e) * rv / w;
        s.vx += nx * jimp * s.invMass;
        s.vy += ny * jimp * s.invMass;
        s.vz += nz * jimp * s.invMass;
        o.vx -= nx * jimp * o.invMass;
        o.vy -= ny * jimp * o.invMass;
        o.vz -= nz * jimp * o.invMass;
        if (events && -rv > 0.4) events.ballHit = Math.max(events.ballHit || 0, -rv);
      }
    }
    s.quat = JW.quatFromAngVel(s.quat, { x: s.wx, y: s.wy, z: s.wz }, dt);
    // Keep a breadcrumb of horizontal travel for debugging.
    void px; void py; void pz;
  }
};

JW.measureJelly = function (b) {
  var minY = 1e9, maxY = -1e9, maxR = 0;
  var cx = 0, cz = 0;
  for (var i = 0; i < b.n; i++) {
    if (b.y[i] < minY) minY = b.y[i];
    if (b.y[i] > maxY) maxY = b.y[i];
    cx += b.x[i]; cz += b.z[i];
  }
  cx /= b.n; cz /= b.n;
  for (var j = 0; j < b.n; j++) {
    var r = Math.hypot(b.x[j] - cx, b.z[j] - cz);
    if (r > maxR) maxR = r;
  }
  var info = maxTensileEdge(b);
  return {
    height: maxY - minY,
    maxY: maxY,
    radius: maxR,
    strain: info.strain,
    volume: JW.bodyVolume(b),
    rest: b.restVolume,
    n: b.n,
    pieces: 1
  };
};
