/* 3D translucent umbrellas (a clear plastic "vinyl" umbrella), modelled and rendered with WebGL2 and composited
   into the flat picture.
   - geometry: 8 ribs bent into a dome, 8 canopy panels (flat between ribs, scalloped hem), stretchers, runner,
     shaft, top cap + tip, beads on the rib ends, J handle; built per opening amount (cached).
   - canopy shading: the panel refracts what is behind it (a snapshot of the 2D picture plus whatever 3D was drawn
     before it), is faintly tinted, brightens at fold lines, hem and grazing angles, and carries a highlight on the
     lit side. Far layer first, then a copy of the frame buffer, then the near layer, so ribs and the far half of the
     canopy are seen through the near half.
   - drops are 2D glossy beads placed at projected canopy points: drops facing the camera are drawn over the
     umbrella, drops on the far side are drawn before it (and are then seen through the plastic).
   Everything is a pure function of the arguments (time included), so frames are deterministic. */
'use strict';
(function () {
  const PV = window.PV;
  const G = PV.G3;
  const { W, H, clamp, lerp, rnd, TAU } = PV;

  // ---------------- small vector / matrix helpers (column-major mat4) ----------------
  const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const S = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
  const RX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const RY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const RZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  const mul = (...ms) => ms.reduce((a, b) => G.M.mul(a, b));
  const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const applyDir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrmz = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // ---------------- geometry (model space: apex at the origin, shaft along -Y, rib length 1) ----------------
  const NR = 8, U = 16, K = 6;
  const ribAng = (open, j) => lerp(0.06, 1.36, open) - 0.5 * open * ((j - 0.5) / U); // angle from the downward axis
  function ribPath(open, phi) {
    const pts = [[0, 0, 0]];
    let p = [0, 0, 0];
    for (let j = 1; j <= U; j++) {
      const a = ribAng(open, j);
      p = [p[0] + (Math.sin(a) * Math.cos(phi)) / U, p[1] - Math.cos(a) / U, p[2] + (Math.sin(a) * Math.sin(phi)) / U];
      pts.push(p);
    }
    return pts;
  }
  // outward (upper) normal of the canopy along a rib, at segment j
  const ribNormal = (open, phi, j) => { const a = ribAng(open, Math.max(1, Math.min(U, j))); return [Math.cos(a) * Math.cos(phi), Math.sin(a), Math.cos(a) * Math.sin(phi)]; };
  function along(path, u) {
    const f = clamp(u) * U, j = Math.min(U - 1, Math.floor(f)), r = f - j;
    const a = path[j], b = path[j + 1];
    return [lerp(a[0], b[0], r), lerp(a[1], b[1], r), lerp(a[2], b[2], r)];
  }
  const umax = (k, open) => 1 - 0.07 * Math.sin(Math.PI * k) * open; // scalloped hem between rib ends
  function canopyPoint(ribs, open, i, u, k) {
    const A = ribs[((i % NR) + NR) % NR], B = ribs[(((i + 1) % NR) + NR) % NR];
    const uu = u * umax(k, open);
    const pa = along(A, uu), pb = along(B, uu);
    const p = [lerp(pa[0], pb[0], k), lerp(pa[1], pb[1], k), lerp(pa[2], pb[2], k)];
    // the panel gives a little between the ribs (so the fold lines read as creases)
    const sag = 0.022 * Math.sin(Math.PI * k) * Math.sin(Math.PI * Math.min(1, uu * 1.15)) * open;
    const rr = Math.hypot(p[0], p[2]) || 1;
    return [p[0] - (p[0] / rr) * sag, p[1] - sag * 0.35, p[2] - (p[2] / rr) * sag];
  }
  function tube(pts, r, out, sides = 7, caps = false) {
    const base = out.pos.length / 3, n = pts.length;
    const rad = (i) => (typeof r === 'function' ? r(i / (n - 1)) : r);
    for (let i = 0; i < n; i++) {
      const p = pts[i], pn = pts[Math.min(n - 1, i + 1)], pp = pts[Math.max(0, i - 1)];
      const t = nrmz(sub(pn, pp));
      const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const n1 = nrmz(cross(t, ref)), n2 = cross(t, n1);
      for (let s = 0; s < sides; s++) {
        const th = (s / sides) * TAU, c = Math.cos(th), sn = Math.sin(th);
        const nn = [n1[0] * c + n2[0] * sn, n1[1] * c + n2[1] * sn, n1[2] * c + n2[2] * sn];
        out.pos.push(p[0] + nn[0] * rad(i), p[1] + nn[1] * rad(i), p[2] + nn[2] * rad(i));
        out.nrm.push(nn[0], nn[1], nn[2]);
        out.uk.push(0, 0);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
      const a = base + i * sides + s, b = base + i * sides + ((s + 1) % sides), c = a + sides, d = b + sides;
      out.idx.push(a, c, b, b, c, d);
    }
    if (caps) for (const end of [0, n - 1]) {
      const p = pts[end], q = pts[end === 0 ? 1 : n - 2];
      const nn = nrmz(sub(p, q));
      const ci = out.pos.length / 3;
      out.pos.push(p[0], p[1], p[2]); out.nrm.push(nn[0], nn[1], nn[2]); out.uk.push(0, 0);
      for (let s = 0; s < sides; s++) out.idx.push(ci, base + end * sides + s, base + end * sides + ((s + 1) % sides));
    }
  }
  const geoCache = new Map();
  // open: 0 = closed, 1 = open; up to 1.15 lets a canopy spring past fully open. th: thickness of the metal parts
  function geometry(open, th = 1) {
    const q = Math.round(clamp(open, 0, 1.15) * 48) / 48;
    const key = q + '|' + th;
    let g = geoCache.get(key);
    if (g) return g;
    const ribs = [];
    for (let i = 0; i < NR; i++) ribs.push(ribPath(q, (i / NR) * TAU));
    // canopy panels; triangles wound counter-clockwise as seen from outside (above)
    const can = { pos: [], nrm: [], uk: [], idx: [] };
    for (let i = 0; i < NR; i++) {
      const base = can.pos.length / 3, grid = [];
      for (let j = 0; j <= U; j++) for (let s = 0; s <= K; s++) {
        const p = canopyPoint(ribs, q, i, j / U, s / K);
        grid.push(p); can.pos.push(p[0], p[1], p[2]); can.uk.push(j / U, s / K);
      }
      const gp = (jj, ss) => grid[Math.max(0, Math.min(U, jj)) * (K + 1) + Math.max(0, Math.min(K, ss))];
      for (let j = 0; j <= U; j++) for (let s = 0; s <= K; s++) {
        const n = j === 0 ? [0, 1, 0] : nrmz(cross(sub(gp(j, s + 1), gp(j, s - 1)), sub(gp(j + 1, s), gp(j - 1, s))));
        can.nrm.push(n[0], n[1], n[2]);
      }
      for (let j = 0; j < U; j++) for (let s = 0; s < K; s++) {
        const a = base + j * (K + 1) + s, b = a + 1, c = a + K + 1, d = c + 1;
        can.idx.push(a, b, c, b, d, c);
      }
    }
    // frame (thin metal) and hard parts (plastic: top cap, tip, rib-end beads, runner, handle)
    const frame = { pos: [], nrm: [], uk: [], idx: [] }, hard = { pos: [], nrm: [], uk: [], idx: [] };
    for (let i = 0; i < NR; i++) {
      const phi = (i / NR) * TAU;
      const pts = ribs[i].map((p, j) => { const nn = ribNormal(q, phi, j); return [p[0] - nn[0] * 0.016, p[1] - nn[1] * 0.016, p[2] - nn[2] * 0.016]; });
      tube(pts, 0.0105 * th, frame, 6);
      const e = pts[U], dn = nrmz(sub(pts[U], pts[U - 1]));
      tube([sub(e, scl(dn, 0.02)), add(e, scl(dn, 0.028))], (f) => (0.019 - 0.007 * f) * Math.sqrt(th), hard, 8, true);
    }
    const runnerY = lerp(-0.66, -0.36, q);
    if (q > 0.08) for (let i = 0; i < NR; i++) {
      const phi = (i / NR) * TAU, p = along(ribs[i], 0.46), nn = ribNormal(q, phi, Math.round(0.46 * U));
      tube([[0, runnerY, 0], [p[0] - nn[0] * 0.016, p[1] - nn[1] * 0.016, p[2] - nn[2] * 0.016]], 0.0062 * th, frame, 4);
    }
    tube([[0, runnerY + 0.06, 0], [0, runnerY - 0.07, 0]], 0.026 * Math.sqrt(th), hard, 10, true); // runner
    const shaft = []; for (let j = 0; j <= 10; j++) shaft.push([0, 0.02 - (j / 10) * 1.12, 0]);
    tube(shaft, 0.0135 * Math.sqrt(th), frame, 8);
    tube([[0, -0.05, 0], [0, 0.02, 0], [0, 0.045, 0]], (f) => 0.045 - 0.012 * f, hard, 12, true); // top cap
    tube([[0, 0.04, 0], [0, 0.11, 0], [0, 0.18, 0]], (f) => 0.018 - 0.008 * f, hard, 10, true);   // tip
    const hk = [[0, -1.06, 0], [0, -1.16, 0], [0, -1.26, 0]];
    for (let j = 1; j <= 12; j++) { const th = (j / 12) * Math.PI; hk.push([-0.105 + 0.105 * Math.cos(th), -1.26 - 0.105 * Math.sin(th), 0]); }
    hk.push([-0.21, -1.235, 0]);
    tube(hk, 0.031, hard, 10, true);                                                              // J handle
    g = { open: q, ribs, can: upload(can), frame: upload(frame), hard: upload(hard) };
    geoCache.set(key, g);
    return g;
  }
  const geo = (it) => geometry(it.open == null ? 1 : it.open, it.th || 1);

  // ---------------- GL ----------------
  let P = null, grabTex = null, grabW = 0, grabH = 0;
  const VS = `#version 300 es
  in vec3 aPos; in vec3 aNrm; in vec2 aUK;
  uniform mat4 uM, uV, uP;
  out vec3 vW; out vec3 vN; out vec2 vUK;
  void main(){ vec4 wp = uM * vec4(aPos, 1.0); vW = wp.xyz; vN = mat3(uM) * aNrm; vUK = aUK; gl_Position = uP * uV * wp; }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vW; in vec3 vN; in vec2 vUK;
  uniform int uMode; uniform vec3 uColor; uniform vec3 uEye; uniform vec3 uLight; uniform vec3 uLightCol;
  uniform sampler2D uBg; uniform sampler2D uGrab; uniform float uUseGrab; uniform vec2 uVP; uniform mat4 uV;
  uniform float uRefr; uniform vec4 uTint; uniform float uGlow; uniform float uTrans; uniform vec3 uSeam; uniform float uSeamA;
  uniform float uFres; uniform float uSheen; uniform float uStreak;
  out vec4 o;
  vec3 behind(vec2 p){
    vec2 q = clamp(p, vec2(0.0005), vec2(0.9995));
    vec3 b = texture(uBg, vec2(q.x, 1.0 - q.y)).rgb;
    if (uUseGrab > 0.5) { vec4 g = texture(uGrab, q); b = g.rgb + b * (1.0 - g.a); }
    return b;
  }
  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(uEye - vW);
    if (dot(N, V) < 0.0) N = -N;
    // a light at a position (so a flat panel gets a glint that falls off, not a uniform flash)
    vec3 L = normalize(uLight - vW), Hh = normalize(L + V);
    float nh = max(dot(N, Hh), 0.0);
    if (uMode == 0) {
      float d = max(dot(N, L), 0.0);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 c = uColor * (0.46 + 0.6 * d) + uLightCol * pow(nh, 44.0) * 0.65 + vec3(rim * 0.1);
      o = vec4(min(c, vec3(1.0)), 1.0);
      return;
    }
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);
    // slight refraction: the picture behind shifts with the panel's view-space normal (more at grazing angles)
    vec3 Nv = mat3(uV) * N;
    vec2 off = -Nv.xy * uRefr * (0.45 + 0.55 * (1.0 - ndv)) * uVP.x;
    vec3 col = behind((gl_FragCoord.xy + off) / uVP) * uTrans;
    col = mix(col, col * uTint.rgb, uTint.a);                  // faint colour, still transmits
    col += uTint.rgb * uGlow * (0.55 + 0.45 * fres);           // light scattered in the tinted plastic
    // fold lines between panels, the hem along the rim, the patch at the top
    float ky = min(vUK.y, 1.0 - vUK.y), wk = max(fwidth(vUK.y), 1e-4), wu = max(fwidth(vUK.x), 1e-4);
    float fold = (1.0 - smoothstep(wk * 0.6, wk * 1.8, ky)) * smoothstep(0.04, 0.1, vUK.x);
    float foldSoft = (1.0 - smoothstep(0.0, 0.12, ky)) * smoothstep(0.04, 0.1, vUK.x);
    float hem = smoothstep(0.952 - wu, 0.952 + wu, vUK.x);
    float hemLine = 1.0 - smoothstep(wu * 0.6, wu * 1.8, abs(vUK.x - 0.952));
    float cap = 1.0 - smoothstep(0.055 - wu, 0.055 + wu, vUK.x);
    col = mix(col, uSeam, clamp(fold * uSeamA + foldSoft * uSeamA * 0.16 + hem * 0.16 + hemLine * 0.5 + cap * 0.38, 0.0, 1.0));
    // reflections: grazing sheen, a sharp highlight, and a soft streak on every panel turned towards the light
    // (the streak lives on the panel, so it travels with the canopy as it turns and fades on the shaded side)
    float face = max(dot(N, L), 0.0);
    float streak = (1.0 - smoothstep(0.03, 0.15, abs(vUK.y - 0.3))) * smoothstep(0.16, 0.3, vUK.x) * (1.0 - smoothstep(0.72, 0.9, vUK.x));
    col += uLightCol * (pow(nh, 90.0) * 1.1 + pow(nh, 10.0) * uSheen + streak * pow(face, 2.5) * uStreak) + vec3(0.92, 0.96, 1.0) * fres * uFres;
    o = vec4(min(col, vec3(1.0)), 1.0);
  }`;
  function prog() {
    if (P) return P;
    const gl = G.gl;
    const c = G.compile(VS, FS);
    P = { ...c, aPos: gl.getAttribLocation(c.p, 'aPos'), aNrm: gl.getAttribLocation(c.p, 'aNrm'), aUK: gl.getAttribLocation(c.p, 'aUK') };
    return P;
  }
  function upload(m) {
    const gl = G.gl;
    prog();
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (data, loc, size) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
    };
    buf(m.pos, P.aPos, 3); buf(m.nrm, P.aNrm, 3); buf(m.uk, P.aUK, 2);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, n: m.idx.length };
  }
  function grab() {
    const gl = G.gl;
    gl.activeTexture(gl.TEXTURE1);
    if (!grabTex) grabTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, grabTex);
    if (grabW !== G.vw || grabH !== G.vh) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, G.vw, G.vh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      grabW = G.vw; grabH = G.vh;
    }
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, G.vw, G.vh);
    gl.activeTexture(gl.TEXTURE0);
  }

  // ---------------- camera & placement ----------------
  // a camera on the z axis whose z = 0 plane maps 1 unit = 100 logical px; smaller D = stronger perspective
  const cam = (D = 10) => ({ eye: [0, 0, D], at: [0, 0, 0], fov: 2 * Math.atan(5.4 / D), near: 0.25, far: 200 });
  let CAM = cam(10);
  const at = (sx, sy, z = 0) => [(sx - 960) / 100, (540 - sy) / 100, z];
  // item: {x, y (logical px), z, scale (1 = rib length 100 px), tilt (about X; + shows the top), spin (about the shaft),
  //        roll (in the picture plane), open 0..1, tint, tintAmt, glow, rib, handle, seam, seamA, trans, refr}
  const model = (it) => mul(T(...at(it.x, it.y, it.z || 0)), RZ(it.roll || 0), RX(it.tilt || 0), RY(it.spin || 0), S(it.scale || 1));
  function begin(c) {
    if (!G.ok) return false;
    CAM = c || cam(10);
    G.begin(null, CAM, null);
    return true;
  }
  const project = (w) => G.project(w);
  const rgb = (hex) => PV.hexRgb(hex).map((v) => v / 255);

  function render(ctx, items, o = {}) {
    if (!G.ok || !items.length) return false;
    const gl = G.gl;
    prog();
    const bgTex = G.tex('umbBg', ctx.canvas, { update: true, mip: false });
    // far → near (by depth of the canopy centre)
    const list = items.map((it) => ({ it, m: model(it), g: geo(it) }));
    list.forEach((e) => { e.d = project(apply(e.m, [0, -0.3, 0])).z; });
    list.sort((a, b) => b.d - a.d);
    gl.useProgram(P.p);
    const u = P.u;
    gl.uniformMatrix4fv(u.uV, false, G.view); gl.uniformMatrix4fv(u.uP, false, G.proj);
    gl.uniform3fv(u.uEye, CAM.eye); gl.uniform3fv(u.uLight, o.light || [-8, 10, 12]); // light position (world units)
    gl.uniform3fv(u.uLightCol, rgb(o.lightCol || '#FFFFFF'));
    gl.uniform2f(u.uVP, G.vw, G.vh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgTex); gl.uniform1i(u.uBg, 0);
    gl.uniform1i(u.uGrab, 1);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    const draw = (mesh) => { gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0); };
    let dirty = false;
    list.forEach(({ it, m, g }) => {
      gl.uniformMatrix4fv(u.uM, false, m);
      // opaque parts
      gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.uniform1i(u.uMode, 0);
      gl.uniform3fv(u.uColor, rgb(it.rib || '#55627C')); draw(g.frame);
      gl.uniform3fv(u.uColor, rgb(it.handle || '#F2F4F7')); draw(g.hard);
      // canopy: far layer (inside faces), copy, near layer (outside faces)
      gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.uniform1i(u.uMode, 1);
      const tc = rgb(it.tint || '#CFE8F6');
      gl.uniform4f(u.uTint, tc[0], tc[1], tc[2], it.tintAmt == null ? 0.3 : it.tintAmt);
      gl.uniform1f(u.uGlow, it.glow || 0);
      gl.uniform1f(u.uTrans, it.trans == null ? 0.93 : it.trans);
      gl.uniform1f(u.uRefr, it.refr == null ? 0.006 : it.refr);
      gl.uniform3fv(u.uSeam, rgb(it.seam || '#FFFFFF'));
      gl.uniform1f(u.uSeamA, it.seamA == null ? 0.55 : it.seamA);
      gl.uniform1f(u.uFres, it.fres == null ? 0.36 : it.fres);
      gl.uniform1f(u.uSheen, it.sheen == null ? 0.12 : it.sheen);
      gl.uniform1f(u.uStreak, it.streak == null ? 0.4 : it.streak);
      for (const face of [gl.FRONT, gl.BACK]) {
        const useGrab = face === gl.BACK || dirty;
        if (useGrab) grab();
        gl.uniform1f(u.uUseGrab, useGrab ? 1 : 0);
        gl.cullFace(face);
        draw(g.can);
      }
      dirty = true;
    });
    gl.disable(gl.CULL_FACE); gl.depthMask(true); gl.enable(gl.BLEND);
    gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
    ctx.drawImage(G.canvas, 0, 0, W, H);
    return true;
  }

  // ---------------- canopy points, drops ----------------
  // a point on the canopy (panel i, u from the top to the hem, k across the panel) as seen on screen:
  // {x, y, ppu: px per model unit, ang: direction the surface turns away, sq: foreshortening, front: faces the camera}
  function spot(it, i, u, k, lift = 0.008) {
    const g = geo(it);
    u = clamp(u, 0, 1); k = clamp(k, 0, 1);
    const p = canopyPoint(g.ribs, g.open, i, u, k);
    const du = u < 0.98 ? 0.015 : -0.015, dk = k < 0.98 ? 0.015 : -0.015;
    const pu = canopyPoint(g.ribs, g.open, i, u + du, k), pk = canopyPoint(g.ribs, g.open, i, u, k + dk);
    let n = nrmz(cross(scl(sub(pk, p), Math.sign(dk)), scl(sub(pu, p), Math.sign(du))));
    if (u < 0.02) n = [0, 1, 0];
    return view(it, add(p, scl(n, lift)), n);
  }
  // the end of rib i (where drops gather before they fall), slightly below it
  function ribEnd(it, i, hang = 0.02) {
    const g = geo(it);
    const p = g.ribs[((i % NR) + NR) % NR][U];
    return view(it, [p[0], p[1] - hang, p[2]], [0, 1, 0]);
  }
  function view(it, p, n) {
    const m = model(it), s = it.scale || 1;
    const w = apply(m, p), wn = nrmz(applyDir(m, n));
    const v = nrmz(sub(CAM.eye, w));
    const P0 = project(w), Px = project(add(w, [0.01 * s, 0, 0])), Pn = project(add(w, scl(wn, 0.01 * s)));
    const f = Math.abs(dot(wn, v));
    return { x: P0.x, y: P0.y, z: P0.z, ppu: Math.hypot(Px.x - P0.x, Px.y - P0.y) * 100, ang: Math.atan2(Pn.y - P0.y, Pn.x - P0.x), sq: 0.5 + 0.5 * f, front: dot(wn, v) > 0, w };
  }
  // a point on the circle through the rib ends at angle phi (model space, no spin), pushed out radially by `out`
  function hemPoint(it, phi, out = 0) {
    const g = geo(it);
    const e = g.ribs[0][U], rho = Math.hypot(e[0], e[2]) + out;
    return view({ ...it, spin: 0 }, [rho * Math.cos(phi), e[1], rho * Math.sin(phi)], [0, 1, 0]);
  }
  // a point on the shaft (model height y; the hem is at about -0.4) as seen on screen
  const axis = (it, y) => view({ ...it, spin: 0 }, [0, y, 0], [0, 1, 0]);
  // the outline of the canopy on screen (hem points), for shadows
  function outline(it, n = 6) {
    const pts = [];
    for (let i = 0; i < NR; i++) for (let s = 0; s < n; s++) { const v = spot(it, i, 1, s / n, 0); pts.push([v.x, v.y]); }
    return pts;
  }
  // a soft shadow of the canopy cast on the flat picture behind
  function shadow(ctx, it, o = {}) {
    const pts = outline(it);
    const m = ctx.getTransform(), sc = Math.hypot(m.a, m.b) || 1;
    ctx.save();
    ctx.shadowColor = o.color || 'rgba(13,23,48,0.22)';
    ctx.shadowBlur = (o.blur || 18) * sc;
    ctx.shadowOffsetX = (10000 + (o.dx || 0)) * sc; ctx.shadowOffsetY = (o.dy || 0) * sc;
    ctx.beginPath();
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x - 10000, y) : ctx.moveTo(x - 10000, y)));
    ctx.closePath(); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
  }
  // a glossy water bead; style 'light' (light ground), 'dark' (dark ground), 'sun' (sunlit, sparkles)
  function drop(ctx, x, y, r, o = {}) {
    const a = o.a == null ? 1 : o.a;
    if (r < 0.6 || a <= 0.01) return;
    const style = o.style || 'light';
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x, y);
    const ang = o.ang || 0, sq = o.sq || 1, st = o.stretch || 1;
    ctx.save();
    ctx.rotate(ang); ctx.scale(sq, 1); ctx.rotate(-ang); ctx.scale(1 / Math.sqrt(st), st);
    const g = ctx.createRadialGradient(r * 0.22, r * 0.3, r * 0.05, 0, 0, r);
    if (style === 'dark') {
      g.addColorStop(0, 'rgba(255,255,255,0.26)'); g.addColorStop(0.62, 'rgba(170,205,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0.5)');
    } else if (style === 'sun') {
      g.addColorStop(0, 'rgba(255,252,236,0.75)'); g.addColorStop(0.6, 'rgba(210,236,255,0.25)'); g.addColorStop(1, 'rgba(30,90,150,0.42)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.62, 'rgba(206,229,245,0.2)'); g.addColorStop(1, 'rgba(27,42,71,0.42)');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(0.7, r * 0.13);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = style === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(27,42,71,0.42)'; ctx.stroke();
    ctx.restore();
    // highlight toward the light, caustic spot opposite
    ctx.beginPath(); ctx.ellipse(-r * 0.34, -r * 0.38, r * 0.3, r * 0.19, -0.7, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.34, r * 0.4 * st, r * 0.12, 0, TAU);
    ctx.fillStyle = style === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.8)'; ctx.fill();
    if (style === 'sun' && o.spark) {
      PV.glow(ctx, -r * 0.34, -r * 0.38, r * 3.2, '#FFF1C2', 0.5 * o.spark);
      PV.star4(ctx, -r * 0.34, -r * 0.38, r * (1.2 + 1.4 * o.spark), 'rgba(255,250,228,0.95)', 0.25);
    }
    ctx.restore();
  }

  // rain on one canopy at time t:
  //   o.n static beads (radius o.rmin..o.rmax in model units), o.sliders [[period, phase], ...] (rest → slide down to
  //   the end of a rib → gather there → drip), o.tips: beads hanging at the rib ends that swell and fall,
  //   o.jig(t) → {dx, dy} shake in px for every bead (trembling), o.seed.
  // returns {back: [...], front: [...]} beads in screen space ({x, y, r, a, ang, sq, stretch})
  function rain(it, t, o = {}) {
    const back = [], front = [];
    const seed = o.seed || 1, jig = o.jig ? o.jig(t) : null;
    const cap = o.rcap || 1e9;
    const push = (sp, r, extra = {}) => {
      const jw = extra.jw == null ? 1 : extra.jw;
      const b = { x: sp.x + (jig ? jig.dx * jw : 0), y: sp.y + (jig ? jig.dy * jw : 0), r: Math.min(r, cap * (extra.capMul || 1)), ang: sp.ang, sq: sp.sq, a: 1, ...extra };
      (sp.front || extra.forceFront ? front : back).push(b);
    };
    for (let j = 0; j < (o.n || 0); j++) {
      const i = Math.floor(rnd(seed, j, 1) * NR), u = 0.14 + rnd(seed, j, 2) * 0.8, k = 0.06 + rnd(seed, j, 3) * 0.88;
      const r = lerp(o.rmin || 0.012, o.rmax || 0.035, Math.pow(rnd(seed, j, 4), 2.2));
      const sp = spot(it, i, u, k);
      push(sp, r * sp.ppu, { jw: 0.6 + rnd(seed, j, 5) * 0.8 });
    }
    (o.sliders || []).forEach(([period, ph], j) => {
      const c = ((((t + ph) / period) % 1) + 1) % 1, cyc = Math.floor((t + ph) / period);
      const sd = seed * 31 + j * 7 + cyc * 101;
      // o.face (+ o.spread, o.spinAt): keep sliders on the side of the canopy that is in view (unspun model angle)
      let i = Math.floor(rnd(sd, 1) * NR);
      if (o.face != null) {
        const t0 = cyc * period - ph, phi = o.face + (rnd(sd, 5) - 0.5) * 2 * (o.spread || 1);
        i = ((Math.round((phi + (o.spinAt ? o.spinAt(t0) : it.spin || 0)) / (TAU / NR) - 0.5) % NR) + NR) % NR;
      }
      const u0 = 0.3 + rnd(sd, 2) * 0.25, k0 = 0.2 + rnd(sd, 3) * 0.6, side = k0 < 0.5 ? 0 : 1;
      const r0 = (o.rmax || 0.035) * (0.95 + rnd(sd, 4) * 0.25);
      const kind = 'slider' + j;
      if (c < 0.34) { const sp = spot(it, i, u0, k0); push(sp, r0 * sp.ppu * (0.85 + (0.15 * c) / 0.34), { kind, capMul: 1.3 }); return; }
      if (c < 0.66) {
        const s = PV.E.inQuad((c - 0.34) / 0.32), sp = spot(it, i, lerp(u0, 0.985, s), lerp(k0, side, Math.pow(s, 0.7)));
        push(sp, r0 * sp.ppu, { kind, capMul: 1.3, stretch: 1 + 0.35 * Math.sin(Math.PI * s) });
        // a thin wet trail
        for (let q = 1; q <= 4; q++) {
          const s2 = Math.max(0, s - q * 0.07);
          const tp = spot(it, i, lerp(u0, 0.985, s2), lerp(k0, side, Math.pow(s2, 0.7)));
          push(tp, r0 * tp.ppu * (0.32 - q * 0.05), { a: 0.7, capMul: 0.4 });
        }
        return;
      }
      const e = ribEnd(it, i + side, 0.012);
      if (c < 0.84) { const s = (c - 0.66) / 0.18; push(e, r0 * e.ppu * (1.05 + 0.5 * s), { kind, capMul: 1.3 + 0.5 * s, forceFront: true, stretch: 1 + 0.25 * s, ang: 0, sq: 1 }); return; }
      const s = (c - 0.84) / 0.16, tau = s * period * 0.16;
      if (o.fallAway) push(e, r0 * e.ppu * 1.3 * (1 - 0.75 * s), { kind, capMul: 1.6, forceFront: true, ang: 0, sq: 1, a: 1 - s });
      else push({ ...e, y: e.y + 0.5 * 2600 * tau * tau }, r0 * e.ppu * 1.3, { kind, capMul: 1.6, forceFront: true, stretch: 1.35, ang: 0, sq: 1, a: 1 - Math.pow(s, 3) });
    });
    if (o.tips) for (let i = 0; i < NR; i++) {
      const per = 1.3 + rnd(seed, i, 41) * 1.1, c = ((((t + rnd(seed, i, 42) * per) / per) % 1) + 1) % 1;
      const e = ribEnd(it, i, 0.014);
      const r0 = (o.rmin || 0.012) * 1.25 * e.ppu;
      if (c < 0.8) push(e, r0 * (0.6 + 0.7 * (c / 0.8)), { kind: 'tip', capMul: 0.8 + 0.4 * (c / 0.8), forceFront: true, stretch: 1 + 0.3 * (c / 0.8), ang: 0, sq: 1 });
      else if (o.fallAway) { const s = (c - 0.8) / 0.2; push(e, r0 * 1.3 * (1 - 0.75 * s), { kind: 'tip', capMul: 1.2, forceFront: true, ang: 0, sq: 1, a: 1 - s }); }
      else { const s = (c - 0.8) / 0.2, tau = s * per * 0.2; push({ ...e, y: e.y + 0.5 * 2600 * tau * tau }, r0 * 1.3, { kind: 'tip', capMul: 1.2, forceFront: true, stretch: 1.4, ang: 0, sq: 1, a: 1 - s * s }); }
    }
    return { back, front };
  }
  const drawBeads = (ctx, list, style, extra = {}) => list.forEach((b) => drop(ctx, b.x, b.y, b.r, { style, ang: b.ang, sq: b.sq, stretch: b.stretch, a: (b.a == null ? 1 : b.a) * (extra.a == null ? 1 : extra.a), spark: b.spark }));

  PV.UMB = { begin, render, cam, at, model, spot, ribEnd, hemPoint, axis, outline, shadow, drop, rain, drawBeads, NR,
    get CAM() { return CAM; } };
})();
