'use strict';
/* 防波堤+灯塔、山坡(树/瓦顶民家)、消波块、台阶与平台、滑道与舢板、远处防波堤、雾气 */
const HILL = { x0: -14, x1: -5.5, z0: -14, z1: -9.5 };
function hillRaw(x, z) {
  const u = clamp((-9.5 - z) / 4.5, 0, 1), v = clamp((x + 14) / 8.5, 0, 1);
  const ridge = Math.pow(smooth(0.0, 1.0, u), 0.85);
  const fall = 1 - 0.78 * smooth(0.3, 1.0, v);
  let h = 0.9 + 4.2 * ridge * fall + 0.25 * (fbm2(x * 0.9, z * 0.9) - 0.5) * 2 * smooth(0, 0.3, u);
  // 右侧入水
  h -= 1.6 * smooth(0.82, 1.0, v);
  return h;
}
const HOUSES = [
  { x: -12.4, z: -10.7, ry: 0.35, w: 1.6, d: 1.3, h: 0.9, roof: '#4a6f7b' },
  { x: -10.3, z: -11.6, ry: -0.1, w: 1.7, d: 1.4, h: 0.95, roof: '#58798a' },
  { x: -8.2, z: -11.1, ry: 0.2, w: 1.4, d: 1.2, h: 0.85, roof: '#3f6470' },
  { x: -11.7, z: -13.1, ry: 0.0, w: 1.5, d: 1.2, h: 0.85, roof: '#4f7684' }
];

function hillH(x, z) {
  let h = hillRaw(x, z);
  for (const hs of HOUSES) {
    if (hs.base === undefined) hs.base = hillRaw(hs.x, hs.z) - 0.05;
    const dx = Math.abs(x - hs.x) / (hs.w / 2 + 0.55), dz = Math.abs(z - hs.z) / (hs.d / 2 + 0.55);
    const d = Math.max(dx, dz), wgt = 1 - smooth(1.0, 2.0, d);
    if (wgt > 0) h = lerp(h, hs.base, wgt);
  }
  return h;
}
function buildTetrapod(P, x, y, z, s, ry) {
  const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  const cc = (px, py, pz) => { const n = noise2(px * 5 + py * 3, pz * 5); return new Col('#d9ded9').multiplyScalar(0.94 + 0.08 * n).lerp(new Col('#8fa89d'), smooth(0.25, -0.5, py) * 0.7); };
  P.T([x, y, z], [rnd(-0.4, 0.4), ry, rnd(-0.4, 0.4)], [s, s, s], () => {
    for (const d of dirs) {
      const v = new V3(d[0], d[1], d[2]).normalize().multiplyScalar(0.66), w = v.clone().multiplyScalar(0.9);
      P.taper([0, 0, 0], [w.x, w.y, w.z], 0.17, 0.27, '#d6dbd6', 8);
      P.taper([w.x, w.y, w.z], [v.x, v.y, v.z], 0.27, 0.2, '#cdd3ce', 8);                  // 端部倒角
      P.taper([v.x, v.y, v.z], [v.x * 1.02, v.y * 1.02, v.z * 1.02], 0.2, 0.19, '#c4cbc5', 8);
    }
    P.sph(0.2, [0, 0, 0], '#d3d8d4', null, 8, 6);
  });
}

const FoamPatches = [];
function makeFoam(x, z, w, d, seed) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: U.uTime, uSeed: { value: seed }, uAmt: { value: 1 }, uSun: U.uSun, uSlap: { value: SLAP } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform float uSeed; uniform float uAmt; uniform vec4 uSlap[6]; varying vec2 vUv; varying vec3 vW;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      void main(){
        vec2 p = vUv*2.0-1.0;
        float r = length(p);
        float t = uTime*0.35;
        float n = vn(vW.xz*3.2 + vec2(t, -t*0.7) + uSeed) * 0.6 + vn(vW.xz*7.5 - vec2(t*1.3, t) + uSeed*2.0) * 0.4;
        float swell = 0.5+0.5*sin(uTime*0.9 + uSeed*3.0 + vW.x*1.7);
        float boost = 0.0; for(int i=0;i<6;i++){ vec4 sl=uSlap[i]; float ag=uTime-sl.z; if(ag>0.0&&ag<3.5){ boost += sl.w*exp(-ag*1.1)*(1.0-smoothstep(0.0,4.0,length(vW.xz-sl.xy))); } }
        float m = (1.0 - smoothstep(0.25, 1.0, r + (n-0.5)*1.0 - swell*0.2 - boost*0.55));
        float cut = step(0.60, m*(0.30+n*1.0));
        float rim = step(0.46, m*(0.30+n*1.0)) - cut;
        float dots = step(0.82, vn(vW.xz*11.0+vec2(t*1.5,-t))) * step(0.3, m) * (1.0-cut);
        vec3 col = mix(vec3(0.82,0.96,0.94), vec3(1.0), cut);
        float a = (cut*0.9 + rim*0.4 + dots*0.7)*uAmt;
        gl_FragColor = vec4(pow(col, vec3(2.2)), a);
      }`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z);
  m.layers.set(LAYER.WATER); m.renderOrder = 12; return m;
}

function buildJettyAndLighthouse(scene) {
  const J = AREA.jetty; const jy = 0.78;
  const P = new Parts(); P.jit = 0; P.curCol = new Col('#ffffff');
  // 防波堤（混凝土，朝水的立面用内壁材质）
  const Pt = new Parts(); Pt.jit = 0; Pt.curCol = new Col('#fff'); const Pi = new Parts(); Pi.jit = 0; Pi.curCol = new Col('#fff');
  const x0 = -6.0, x1 = 4.6, z0 = J.z0, z1 = J.z1;
  topFace(Pt, jy, x0, x1, z0, z1);
  wallFace(Pi, 'z', z1, x0, x1, BOT, jy, 1);        // 朝港池（+z）
  wallFace(Pi, 'z', z0, x0, x1, BOT, jy, -1);       // 朝外海（-z）
  wallFace(Pi, 'x', x1, z0, z1, BOT, jy, 1);        // 堤端（+x）
  scene.add(mesh(Pt.build(), MAT.conc), mesh(Pi.build(), MAT.concIn));
  // 堤上细节：外侧挡浪墙、护轮坎、系船柱、渔网堆
  const D = new Parts(); D.jit = 0.02;
  D.box(x1 - x0 - 0.1, 0.38, 0.22, [(x0 + x1) / 2 + 0.05, jy + 0.19, z0 + 0.14], '#cfd5cf');
  D.box(x1 - x0 - 0.1, 0.06, 0.26, [(x0 + x1) / 2 + 0.05, jy + 0.4, z0 + 0.14], '#bcc4bd');
  for (let x = -5.2; x < 4.2; x += 1.9) D.box(0.12, 0.38, 0.3, [x, jy + 0.19, z0 + 0.14], '#bcc4bd');
  const Dh = new Parts(); Dh.jit = 0; Dh.box(x1 - x0 - 0.2, 0.14, 0.26, [(x0 + x1) / 2, jy + 0.07, z1 - 0.14], '#fff');
  scene.add(mesh(Dh.build(), MAT.hazard));
  for (const bx of [-3.2, 0.2]) { D.cyl(0.15, 0.18, 0.1, 10, [bx, jy + 0.05, z1 - 0.5], '#1d2225'); D.cyl(0.1, 0.13, 0.18, 10, [bx, jy + 0.19, z1 - 0.5], '#1d2225'); D.sph(0.16, [bx, jy + 0.34, z1 - 0.5], '#242a2d', [1, 0.5, 1], 10, 6); }
  for (let k = 0; k < 4; k++) D.tor(0.22, 0.04, [-1.9, jy + 0.05 + k * 0.06, -11.0], k % 2 ? '#e4602f' : '#cf4f25', [Math.PI / 2, 0, 0], 14, 5);
  D.box(0.7, 0.3, 0.5, [-2.5, jy + 0.15, -11.1], '#2d77b8'); D.box(0.72, 0.04, 0.52, [-2.5, jy + 0.32, -11.1], '#e8f0f2');
  scene.add(mesh(D.build(), MAT.vcWet));
  // ---- 灯塔（红白相间） ----
  const lx = 3.5, lz = -11.1, ly = jy;
  const L = new Parts(); L.jit = 0.01;
  L.cyl(0.95, 1.0, 0.22, 16, [lx, ly + 0.11, lz], '#cfd5cf');
  const bands = [['#f4f2ea', 0.0], ['#d9453a', 0.9], ['#f4f2ea', 1.8], ['#d9453a', 2.7]];
  bands.forEach(([c, y0], i) => {
    const r0 = 0.66 - y0 * 0.055, r1 = 0.66 - (y0 + 0.9) * 0.055;
    L.cyl(r1, r0, 0.9, 20, [lx, ly + 0.22 + y0 + 0.45, lz], c);
  });
  const gy = ly + 0.22 + 3.6;
  L.cyl(0.62, 0.5, 0.12, 20, [lx, gy + 0.06, lz], '#3a4a50'); L.cyl(0.66, 0.66, 0.05, 20, [lx, gy + 0.14, lz], '#e8efec');
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; L.rod([lx + Math.cos(a) * 0.63, gy + 0.15, lz + Math.sin(a) * 0.63], [lx + Math.cos(a) * 0.63, gy + 0.5, lz + Math.sin(a) * 0.63], 0.014, '#cfd6d4', 4); }
  L.tor(0.63, 0.016, [lx, gy + 0.5, lz], '#cfd6d4', [Math.PI / 2, 0, 0], 20, 4);
  L.cyl(0.4, 0.45, 0.62, 12, [lx, gy + 0.46, lz], '#3a4a50', [0, 0, 0], true);        // 灯笼室框架
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; L.rod([lx + Math.cos(a) * 0.43, gy + 0.16, lz + Math.sin(a) * 0.43], [lx + Math.cos(a) * 0.4, gy + 0.78, lz + Math.sin(a) * 0.4], 0.02, '#e8efec', 5); }
  L.cyl(0.0, 0.52, 0.34, 14, [lx, gy + 0.95, lz], '#d9453a'); L.sph(0.06, [lx, gy + 1.15, lz], '#3a4a50', null, 6, 5);
  L.rod([lx, gy + 1.15, lz], [lx, gy + 1.5, lz], 0.014, '#3a4a50', 4);
  L.box(0.34, 0.06, 0.012, [lx + 0.17, gy + 1.45, lz], '#d8b04a');
  const rT = (yy) => 0.66 - (yy - 0.22) * 0.055;
  L.box(0.34, 0.56, 0.09, [lx, ly + 0.5, lz + rT(0.5) + 0.02], '#7a5236'); L.cyl(0.17, 0.17, 0.09, 12, [lx, ly + 0.78, lz + rT(0.78) + 0.02], '#7a5236', [Math.PI / 2, 0, 0]);
  L.box(0.28, 0.5, 0.02, [lx, ly + 0.5, lz + rT(0.5) + 0.07], '#a07048'); L.sph(0.025, [lx + 0.09, ly + 0.5, lz + rT(0.5) + 0.09], '#d8b04a', null, 6, 5);
  L.box(0.46, 0.05, 0.14, [lx, ly + 0.22, lz + rT(0.3) + 0.12], '#cfd5cf');                                        // 门前台阶
  for (const [yy, ww] of [[2.0, 0.15], [3.0, 0.13]]) { L.box(ww, 0.22, 0.05, [lx, ly + yy, lz + rT(yy) + 0.005], '#2e4a54'); L.cyl(ww / 2, ww / 2, 0.05, 10, [lx, ly + yy + 0.11, lz + rT(yy) + 0.005], '#2e4a54', [Math.PI / 2, 0, 0]); L.box(ww + 0.06, 0.03, 0.07, [lx, ly + yy - 0.12, lz + rT(yy) + 0.02], '#e8efec'); }
  scene.add(mesh(L.build(), MAT.vcWet));
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.54, 14), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.0, toneMapped: false, depthWrite: false }));
  lantern.position.set(lx, gy + 0.47, lz); lantern.layers.set(LAYER.FX); lantern.renderOrder = 14; scene.add(lantern);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.6, 14, 1, true), glassMat({ tint: '#d3eef2', opacity: 0.18 })); glass.position.set(lx, gy + 0.47, lz); glass.layers.set(LAYER.GLASS); scene.add(glass);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.0), new THREE.MeshBasicMaterial({ map: haloTexture(), color: '#fff0b8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.position.set(lx, gy + 0.47, lz); halo.layers.set(LAYER.FX); halo.renderOrder = 19; scene.add(halo);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.8, 8, 14, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uOp: { value: 0 } },
    vertexShader: 'varying float vX; varying vec3 vN; varying vec3 vV; void main(){ vX = position.x/8.0; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float uOp; varying float vX; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.2); float a = (1.0 - smoothstep(0.0, 1.0, vX)) * smoothstep(0.0, 0.04, vX) * f * uOp; gl_FragColor = vec4(vec3(1.0,0.9,0.6)*a, a); }' }));
  beam.geometry.translate(0, -4, 0); beam.geometry.rotateZ(Math.PI / 2); beam.position.set(lx, gy + 0.47, lz); beam.layers.set(LAYER.FX); beam.renderOrder = 19;
  const beamPivot = new THREE.Group(); beamPivot.position.copy(beam.position); beam.position.set(0, 0, 0); beamPivot.add(beam); scene.add(beamPivot);
  Systems.push((dt, t) => {
    const k = Env.lamp;
    lantern.material.opacity = 0.18 + 0.82 * k * (0.9 + 0.1 * Math.sin(t * 7));
    halo.material.opacity = 0.05 + 0.6 * k; beam.material.uniforms.uOp.value = 0.55 * k; beamPivot.rotation.y = t * 0.9;
  });
  // 灯塔旗/风向 小旗
  const fl = new THREE.PlaneGeometry(0.5, 0.3, 6, 2); fl.translate(0.25, 0, 0);
  const Pf = new Parts(); Pf.jit = 0; Pf.add(fl, [lx, gy + 1.38, lz], [0, 0, 0], null, '#fff', (x) => [clamp((x - lx) / 0.5, 0, 1), 0.2]);
  // 堤上消波块
  const T = new Parts(); T.jit = 0.03;
  const tcol = (x, y, z) => { const n = fbm2(x * 4 + y * 3, z * 4); return y < 0.15 ? new Col('#8aa59a').lerp(new Col('#d3d9d4'), smooth(-1.0, 0.12, y) * 0.8) : new Col('#d9ded9').multiplyScalar(0.94 + 0.1 * n); };
  const tets = [[4.95, -10.5, 0.1, 1.0], [5.25, -11.5, -0.2, 0.95], [5.0, -12.4, -0.3, 1.0], [5.2, -9.6, -0.35, 0.9], [4.3, -13.3, -0.1, 0.95], [4.9, -13.6, -0.05, 0.85], [3.2, -12.9, -0.4, 0.75], [1.6, -12.9, -0.5, 0.7], [-1.0, -12.9, -0.5, 0.7]];
  for (const [x, z, y, s] of tets) buildTetrapod(T, x, y + 0.1, z, s * 0.7, rnd(0, 6));
  scene.add(mesh(T.build(), toonMat({ vc: true, under: true, gloss: 0.3 })));
  scene.add(makeFoam(5.1, -11.4, 2.2, 3.6, 1.0), makeFoam(3.4, -13.0, 3.4, 1.3, 2.0));
  // 堤端的小旗杆
  addDrip(lx + 0.65, gy + 0.2, lz, ly + 0.3, { rate: 0.2, ripple: false });
}

function buildHill(scene) {
  const x0 = HILL.x0, x1 = HILL.x1, z0 = HILL.z0, z1 = HILL.z1, res = 0.28;
  const nx = Math.round((x1 - x0) / res), nz = Math.round((z1 - z0) / res);
  const pos = [], col = [], idx = [];
  const gA = new Col('#9fd09a'), gB = new Col('#5fae8a'), gC = new Col('#c6dd9c'), rockC = new Col('#9fb0aa');
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i / nx * (x1 - x0), z = z0 + j / nz * (z1 - z0), h = hillH(x, z);
    pos.push(x, h, z);
    const n = fbm2(x * 1.3, z * 1.3), t = smooth(0.9, 5.0, h);
    const c = gB.clone().lerp(gA, 0.3 + 0.7 * n).lerp(gC, t * 0.6 * n);
    if (h < 1.1) c.lerp(rockC, smooth(1.1, 0.4, h));
    // 梯田状深浅
    c.multiplyScalar(0.92 + 0.12 * noise2(x * 3, z * 3));
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  scene.add(mesh(g, MAT.vcWet));
  // 剖面（岩土分层）：x=-14、z=-14、x=x1 三面
  const S = new Parts(); S.jit = 0;
  const strata = ['#b9ac92', '#c9bda2', '#a8b3a9', '#cdc2a3', '#a2b3ab', '#c1b192', '#acbbb1'];
  const colAt = (y, k) => { const lv = Math.floor((y + 3.0) / 0.55 + (noise2(k * 0.7, y) * 0.6)); return new Col(strata[(lv + 7) % strata.length]).multiplyScalar(0.97 + 0.05 * hash2(lv, k)); };
  const wallStrip = (axis, c, a0, a1, dir) => {
    const n = Math.round(Math.abs(a1 - a0) / res);
    for (let i = 0; i < n; i++) {
      const aa = a0 + (a1 - a0) * i / n, ab = a0 + (a1 - a0) * (i + 1) / n;
      const ha = axis === 'x' ? hillH(c, aa) : hillH(aa, c), hb = axis === 'x' ? hillH(c, ab) : hillH(ab, c);
      const top = Math.min(ha, hb) ;
      let y = BOT;
      while (y < top - 0.01) {
        const y2 = Math.min(top, y + 0.55);
        const cc = colAt((y + y2) / 2, i);
        const verts = axis === 'x' ? [[c, y, aa], [c, y, ab], [c, y2, ab], [c, y2, aa]] : [[aa, y, c], [ab, y, c], [ab, y2, c], [aa, y2, c]];
        const base = S.p.length / 3;
        for (const v of verts) { S.p.push(...v); S.n.push(axis === 'x' ? dir : 0, 0, axis === 'z' ? dir : 0); S.c.push(cc.r, cc.g, cc.b); S.u.push(0, 0); S.s.push(0, 0); }
        if ((axis === 'x') === (dir < 0)) S.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else S.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
        S.cnt += 4; y = y2;
      }
      // 三角部分（高度差）用同色小条补上
      const hTop = Math.max(ha, hb), lo = top;
      if (hTop - lo > 0.01) {
        const cc = colAt(lo + 0.1, i);
        const verts = axis === 'x' ? [[c, lo, aa], [c, lo, ab], [c, hb, ab], [c, ha, aa]] : [[aa, lo, c], [ab, lo, c], [ab, hb, c], [aa, ha, c]];
        const base = S.p.length / 3;
        for (const v of verts) { S.p.push(...v); S.n.push(axis === 'x' ? dir : 0, 0, axis === 'z' ? dir : 0); S.c.push(cc.r, cc.g, cc.b); S.u.push(0, 0); S.s.push(0, 0); }
        if ((axis === 'x') === (dir < 0)) S.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else S.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
        S.cnt += 4;
      }
    }
  };
  wallStrip('x', -14, z0, z1, -1); wallStrip('z', -14, x0, x1, -1); wallStrip('x', x1, z0, z1, 1); wallStrip('z', z1, x0, x1, 1);
  scene.add(mesh(S.build(), MAT.vcUnder));

  // 小路 + 石阶
  const Pp = new Parts(); Pp.jit = 0.03;
  const path = [[-9.3, -9.55], [-9.8, -10.2], [-10.6, -10.6], [-11.0, -11.2], [-10.2, -11.9], [-9.6, -12.4]];
  for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1]; const A = [a[0], hillH(a[0], a[1]) + 0.025, a[1]], B = [b[0], hillH(b[0], b[1]) + 0.025, b[1]]; Pp.beam(A, B, 0.38, 0.05, '#d8cfb6'); }
  // 房屋
  const PL = new Parts(); PL.jit = 0.02;
  for (const h of HOUSES) house(Pp, h, PL);
  scene.add(mesh(Pp.build(), MAT.wall));
  scene.add(mesh(PL.build(), toonMat({ vc: true, sway: 2, side: THREE.DoubleSide, lift: 0.15 }), { cast: false }));
  // 电线杆
  const UP = new Parts(); UP.jit = 0; const ux = -10.1, uz = -9.9, uy = hillH(ux, uz);
  UP.cyl(0.07, 0.1, 5.2, 8, [ux, uy + 2.6, uz], '#7b6a58'); UP.box(1.2, 0.07, 0.08, [ux, uy + 4.7, uz], '#7b6a58'); UP.box(0.9, 0.06, 0.08, [ux, uy + 4.1, uz], '#7b6a58', [0, 0.0, 0]);
  for (const dx of [-0.5, 0, 0.5]) UP.cyl(0.03, 0.03, 0.12, 6, [ux + dx, uy + 4.8, uz], '#e8efec');
  window.UTILITY_POLE = [ux, uy + 4.8, uz];
  scene.add(mesh(UP.build(), MAT.vc));
  // 树木
  const TR = new Parts(); TR.jit = 0.08;
  const treeSway = (cy, ch) => (x, y, z) => [clamp((y - cy) / ch, 0, 1), (x * 3.1 + z * 1.7) % 6.28];
  const placed = [];
  const free = (x, z, r) => { for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < r + 1.3) return false; for (const p of placed) if (Math.hypot(x - p[0], z - p[1]) < p[2] + r) return false; return true; };
  const cols = ['#4f9a6d', '#62ad78', '#3f8a63', '#7bb86a', '#58a37c', '#8cc47a', '#6bb089'];
  let tries = 0, count = 0;
  while (count < 46 && tries++ < 600) {
    const x = rnd(x0 + 0.5, x1 - 0.8), z = rnd(z0 + 0.4, z1 - 0.5), h = hillH(x, z);
    if (h < 1.3) continue;
    if (Math.hypot(x - -9.8, z - -10.8) < 0.7) continue;
    const r = rnd(0.45, 0.8) * (h > 3 ? 0.9 : 1); if (!free(x, z, r * 0.8)) continue;
    placed.push([x, z, r * 0.8]); count++;
    const trunkH = r * 1.2;
    if (R() < 0.3) {   // 杉树
      TR.cyl(0.05, 0.08, trunkH, 6, [x, h + trunkH / 2, z], '#6f5a46');
      for (let k = 0; k < 4; k++) { const rr = r * (0.95 - k * 0.2), yy = h + trunkH * 0.7 + k * r * 0.45; TR.add(cached('cone' + k, () => new THREE.ConeGeometry(1, 0.9, 8)), [x, yy + 0.4, z], [0, rnd(0, 6), 0], [rr, r * 0.8, rr], (px, py, pz) => new Col(pick(['#3d8467', '#4a9172', '#35775e'])).lerp(new Col('#9bd0a0'), clamp((py - h) / 3.5, 0, 1) * 0.35), treeSway(h + trunkH * 0.6, r * 2.4)); }
    } else {
      TR.cyl(0.055, 0.09, trunkH, 6, [x, h + trunkH / 2, z], '#7a604a');
      const cc = pick(cols);
      for (let k = 0; k < 3; k++) { const ox = rnd(-0.28, 0.28) * r, oz = rnd(-0.28, 0.28) * r; TR.sph(r * rnd(0.7, 0.95), [x + ox, h + trunkH + r * (0.55 + k * 0.18), z + oz], (px, py, pz) => new Col(cc).lerp(new Col('#c9e8a8'), clamp((py - (h + trunkH)) / (r * 2), 0, 1) * 0.5).multiplyScalar(0.94 + 0.1 * noise2(px * 5, pz * 5)), [1, 0.85, 1], 9, 7, treeSway(h + trunkH * 0.8, r * 2.0)); }
    }
  }
  scene.add(mesh(TR.build(), toonMat({ vc: true, sway: 3, drops: 0.6, gloss: 0.1 })));
  // 岸边岩石
  const RK = new Parts(); RK.jit = 0.05;
  for (let i = 0; i < 26; i++) { const a = rnd(0, 1); const x = x1 - rnd(0.0, 1.0), z = rnd(z0 + 0.3, z1 - 0.3); const s = rnd(0.2, 0.5); RK.sph(s, [x, hillH(x, z) + s * 0.1 - 0.15, z], pick(['#a2b3ae', '#8fa39d', '#b8c4be', '#7f948f']), [1.3, 0.7, 1.1], 7, 5); }
  for (let i = 0; i < 12; i++) { const x = rnd(-13.6, -9.0), z = rnd(-13.6, -10.4), h = hillH(x, z); if (h > 2.2) { const s = rnd(0.2, 0.4); RK.sph(s, [x, h + s * 0.2, z], '#a9b8b2', [1.2, 0.7, 1.0], 7, 5); } }
  scene.add(mesh(RK.build(), MAT.vcUnder));
  // 草丛点缀
  scene.add(makeFoam(-5.3, -11.0, 1.2, 2.6, 4.0));
}

function house(P, h, PL) {
  const y = h.base + 0.02;
  const base = h.base + 0.04;
  P.T([h.x, 0, h.z], [0, h.ry, 0], null, () => {
    const ymin = Math.min(hillH(h.x - h.w / 2 - 0.3, h.z - h.d / 2 - 0.3), hillH(h.x + h.w / 2 + 0.3, h.z - h.d / 2 - 0.3), hillH(h.x - h.w / 2 - 0.3, h.z + h.d / 2 + 0.3), hillH(h.x + h.w / 2 + 0.3, h.z + h.d / 2 + 0.3)) - 0.15;
    P.box(h.w + 0.5, base - ymin, h.d + 0.5, [0, ymin + (base - ymin) / 2, 0], '#aaa493');                // 石垒台基
    const by = base;
    P.box(h.w + 0.3, 0.12, h.d + 0.3, [0, by + 0.06, 0], '#cfc5aa');
    P.box(h.w, h.h, h.d, [0, by + 0.12 + h.h / 2, 0], '#f1ead8');
    P.box(h.w + 0.01, 0.1, h.d + 0.01, [0, by + 0.17, 0], '#8c7a5a');
    // 木框 + 窗 + 门
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.08, h.h, 0.08, [sx * h.w / 2, by + 0.12 + h.h / 2, sz * h.d / 2], '#8a6a46');
    P.box(h.w + 0.04, 0.07, h.d + 0.04, [0, by + 0.12 + h.h, 0], '#8a6a46');
    P.box(0.34, 0.5, 0.04, [-h.w * 0.25, by + 0.12 + h.h * 0.55, h.d / 2 + 0.01], '#5e9fb3'); P.box(0.4, 0.04, 0.07, [-h.w * 0.25, by + 0.12 + h.h * 0.55 - 0.27, h.d / 2 + 0.03], '#8a6a46');
    P.box(0.34, 0.5, 0.04, [h.w * 0.28, by + 0.12 + h.h * 0.55, h.d / 2 + 0.01], '#f2d68a');
    P.box(0.3, 0.6, 0.04, [h.w * 0.0, by + 0.12 + 0.3, h.d / 2 + 0.01], '#7a5a3c');
    P.box(0.04, 0.5, 0.34, [h.w / 2 + 0.01, by + 0.12 + h.h * 0.55, 0], '#5e9fb3');
    // 瓦屋顶：入母屋风格的双坡 + 瓦垄
    const rh = h.h * 0.62, ov = 0.28, hw2 = h.w / 2 + ov, hd2 = h.d / 2 + ov, ry0 = by + 0.12 + h.h + 0.04;
    const slope = Math.atan2(rh, hd2), len = Math.hypot(rh, hd2);
    for (const sz of [-1, 1]) P.T([0, ry0 + rh / 2, sz * hd2 / 2], [sz * slope, 0, 0], null, () => {
      P.box(hw2 * 2, 0.07, len, [0, 0, 0], h.roof);
      for (let k = -9; k <= 9; k++) P.box(0.05, 0.05, len, [k * hw2 * 2 / 19, 0.05, 0], shade(h.roof, 1.18));
      P.box(hw2 * 2 + 0.06, 0.06, 0.08, [0, 0.03, sz * len / 2], shade(h.roof, 0.8));
    });
    P.box(hw2 * 2 + 0.08, 0.1, 0.12, [0, ry0 + rh + 0.03, 0], shade(h.roof, 0.7));
    const tri = new THREE.Shape([new THREE.Vector2(-h.w / 2, 0), new THREE.Vector2(h.w / 2, 0), new THREE.Vector2(0, rh - 0.05)]);
    P.geo(cached('tri' + h.w + h.h, () => new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false })), [0, ry0 - 0.02, h.d / 2 - 0.02], '#efe7d2');
    P.geo(cached('tri' + h.w + h.h, () => new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false })), [0, ry0 - 0.02, -h.d / 2 - 0.02], '#efe7d2');
    P.box(0.18, 0.5, 0.18, [h.w * 0.25, ry0 + rh * 0.55, -h.d * 0.15], '#a8a08a');            // 烟囱
    // 院墙 + 晾衣竿
    P.box(h.w + 1.2, 0.18, 0.08, [0, by + 0.09, h.d / 2 + 0.55], '#c9bfa3');
    P.rod([-h.w / 2 + 0.1, by + 1.0, h.d / 2 + 0.55], [h.w / 2 - 0.1, by + 1.0, h.d / 2 + 0.55], 0.015, '#8a6a46', 4);
    P.box(0.04, 1.0, 0.04, [-h.w / 2 + 0.08, by + 0.5, h.d / 2 + 0.55], '#8a6a46'); P.box(0.04, 1.0, 0.04, [h.w / 2 - 0.08, by + 0.5, h.d / 2 + 0.55], '#8a6a46');
  });
  if (PL) PL.T([h.x, 0, h.z], [0, h.ry, 0], null, () => {   // 晾着的衣物：随风飘动
    const cols = ['#f2f4ee', '#6fb0c8', '#f2b6c0', '#f6e6a0'];
    for (let k = 0; k < 4; k++) {
      const cw = 0.2 + (k % 2) * 0.05, ch = 0.3 + (k % 3) * 0.05, cx = -h.w / 2 + 0.3 + k * (h.w - 0.6) / 3, cy0 = base + 1.0;
      const g = new THREE.PlaneGeometry(cw, ch, 3, 4);
      PL.add(g, [cx, cy0 - ch / 2, h.d / 2 + 0.55], [0, 0, 0], null, cols[k % cols.length], (x, y, z) => [clamp((cy0 - y) / ch, 0, 1), k * 1.3 + h.x]);
    }
  });
}

function buildHarborSteps(scene) {
  const P = new Parts(); P.jit = 0; P.curCol = new Col('#fff');
  const box = (x0, x1, z0, z1, y0, y1) => P.box(x1 - x0, y1 - y0, z1 - z0, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], '#fff');
  box(0.9, 3.7, 5.0, 6.05, -1.0, 0.62); box(0.9, 3.7, 4.1, 5.0, -1.0, 0.34); box(0.9, 3.7, 3.2, 4.1, -1.0, 0.07);
  box(3.7, 5.5, 3.5, 6.05, -1.0, 0.17);                         // 略低的上下船平台
  box(0.62, 0.9, 3.2, 6.05, -1.0, 0.05); // 左侧挡墙下段
  scene.add(mesh(P.build(), MAT.concIn));
  const D = new Parts(); D.jit = 0.02;
  for (const [z0, z1, y] of [[5.0, 5.12, 0.62], [4.1, 4.22, 0.34], [3.2, 3.32, 0.07]]) D.box(2.8, 0.025, z1 - z0, [2.3, y + 0.013, (z0 + z1) / 2 + 0.0], '#f2c230');
  D.box(1.8, 0.02, 0.1, [4.6, 0.18, 3.62], '#f2c230');
  // 铁栏杆（锈蚀）
  const rr = '#8a5a3a';
  D.rod([0.95, 0.62, 5.5], [0.95, 1.55, 5.5], 0.03, rr, 6); D.rod([0.95, 0.07, 3.45], [0.95, 0.95, 3.45], 0.03, rr, 6);
  D.rod([0.95, 1.55, 5.5], [0.95, 0.95, 3.45], 0.03, rr, 6); D.rod([0.95, 1.1, 5.5], [0.95, 0.5, 3.45], 0.02, rr, 5);
  // 系船环
  D.tor(0.1, 0.02, [4.6, 0.19, 5.9], '#a9743a', [Math.PI / 2, 0, 0], 12, 5);
  scene.add(mesh(D.build(), MAT.metal));
  // 台阶旁的水渍/青苔
  scene.add(makeFoam(2.4, 2.9, 2.8, 1.1, 6.0));
}

function buildSlipwayAndSampan(scene) {
  // 斜坡滑道
  const sh = new THREE.Shape([new THREE.Vector2(9.0, QH), new THREE.Vector2(9.9, QH - 0.02), new THREE.Vector2(12.9, -0.95), new THREE.Vector2(12.9, -1.4), new THREE.Vector2(9.0, -1.4)]);
  const z0 = 8.2, z1 = 11.6;
  const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false }); g.translate(0, 0, z0);
  const P = new Parts(); P.jit = 0; P.add(g, [0, 0, 0], null, null, '#fff');
  scene.add(mesh(P.build(), MAT.concIn));
  const D = new Parts(); D.jit = 0.02;
  const ang = Math.atan2(QH + 0.95, 12.9 - 9.9);
  for (let i = 0; i < 14; i++) { const t = i / 13, x = 9.9 + t * 3.0, y = lerp(QH - 0.02, -0.95, t) + 0.012; D.box(0.05, 0.012, z1 - z0 - 0.1, [x, y, (z0 + z1) / 2], '#8a948f', [0, 0, -ang]); }
  D.box(0.15, 0.2, 3.4, [12.95, -0.9, (z0 + z1) / 2], '#a3c4a8');         // 海藻/青苔边缘
  scene.add(mesh(D.build(), MAT.vcUnder, { cast: false }));
  // 倒扣的小木舢板（半拖上岸）
  const sh2 = hullShape(2.5, 0.98, 0.4, 0.36);
  const hg = hullGeometry(sh2, { top: new Col('#b98e5a'), accent: new Col('#e9efe9'), bottom: new Col('#a07a4e') }, 21);
  const hm = new THREE.Mesh(hg, toonMat({ vc: true, side: THREE.DoubleSide, gloss: 0.3, drops: 0.9 })); hm.castShadow = true; hm.receiveShadow = true;
  const pivot = new THREE.Group(); pivot.add(hm);
  const wp = new Parts(); wp.jit = 0.03;
  // 船板接缝线 + 龙骨 + 横梁
  for (const sy of [-0.08, 0.06, 0.2]) for (const sd of [-1, 1]) { let prev = null; for (let i = 0; i <= 14; i++) { const z = -1.25 + 2.5 * i / 14, x = sd * (sh2.halfW(z, sy) + 0.006); const q = [x, sy, z]; if (prev) wp.rod(prev, q, 0.007, '#6a4a2c', 4); prev = q; } }
  { let prev = null; for (let i = 0; i <= 14; i++) { const z = -1.25 + 2.5 * i / 14, t = i / 14, q = [0, sh2.keel(t) - 0.012, z]; if (prev) wp.rod(prev, q, 0.02, '#5d4129', 5); prev = q; } }
  for (let i = 0; i < 4; i++) { const z = -0.75 + i * 0.5; wp.box(2 * sh2.halfW(z, 0.28) - 0.04, 0.035, 0.07, [0, 0.26, z], '#7a5a3a'); }
  pivot.add(mesh(wp.build(), MAT.vc));
  pivot.rotation.set(Math.PI, 0, 0);       // 倒扣
  const holder = new THREE.Group(); holder.add(pivot); holder.rotation.y = Math.PI / 2;   // 长轴沿 +x（下坡方向）
  const rollG = new THREE.Group(); rollG.add(holder); rollG.position.z = 0.0;
  const rollPivot = new THREE.Group(); rollPivot.position.set(0, 0, -0.5); rollG.position.set(0, 0, 0.5); rollPivot.add(rollG); rollPivot.rotation.x = -0.2;
  const outer = new THREE.Group(); outer.add(rollPivot);
  outer.position.set(11.19, 0.55, 10.2); outer.rotation.z = -0.553;
  scene.add(outer);
  const log = new Parts(); log.jit = 0; log.cyl(0.07, 0.07, 0.8, 8, [10.85, 0.34, 10.78], '#6e5238', [Math.PI / 2, 0, -0.55]);
  scene.add(mesh(log.build(), MAT.vcWet));
  window.SAMPAN = outer;
  scene.add(makeFoam(12.6, 10.0, 1.3, 3.0, 5.0));
}

function buildTetrapodCorner(scene) {
  const T = new Parts(); T.jit = 0.03;
  const list = [[12.6, 12.8, -0.15, 1.0], [13.3, 11.6, -0.05, 0.95], [11.7, 13.4, 0.0, 0.95], [13.4, 13.4, 0.1, 1.0], [12.4, 11.5, -0.4, 0.9], [13.0, 12.5, 0.55, 0.85], [11.2, 12.1, -0.6, 0.8]];
  for (const [x, z, y, s] of list) buildTetrapod(T, x, y + 0.15, z, s * 0.72, rnd(0, 6));
  scene.add(mesh(T.build(), toonMat({ vc: true, under: true, gloss: 0.3, drops: 0.5 })));
  scene.add(makeFoam(12.6, 12.6, 2.8, 2.6, 3.0), makeFoam(10.8, 13.4, 2.0, 1.0, 7.0));
}

function buildFarBreakwater(scene) {
  const P = new Parts(); P.jit = 0.02;
  P.box(3.4, 1.2, 0.9, [12.3, -0.2, -7.9], '#d6dcd8'); P.box(3.4, 0.1, 1.0, [12.3, 0.43, -7.9], '#c3cbc6');
  for (let x = 10.9; x < 14; x += 0.55) P.box(0.3, 0.25, 0.4, [x, 0.55, -8.2], '#bec6c1');
  P.cyl(0.16, 0.2, 0.9, 8, [10.9, 0.9, -7.9], '#d9453a'); P.sph(0.14, [10.9, 1.45, -7.9], '#f4e8c0', null, 8, 6);
  const Pt = new Parts(); Pt.jit = 0.03;
  for (const [x, z] of [[10.3, -7.3], [10.5, -8.6], [10.8, -7.6], [10.0, -8.2]]) buildTetrapod(Pt, x, 0.0, z, 0.8, rnd(0, 6));
  scene.add(mesh(P.build(), toonMat({ vc: true, haze: 0.30, under: true })), mesh(Pt.build(), toonMat({ vc: true, haze: 0.28, under: true })));
  scene.add(makeFoam(11.8, -7.3, 4.4, 1.2, 8.0));
}

/* 薄雾：三渲二分层雾带 */
function buildMist(scene) {
  const mat = (seed, a) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uSeed: { value: seed }, uA: { value: a }, uSun: U.uSun },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform float uSeed; uniform float uA; varying vec2 vUv; varying vec3 vW;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      void main(){
        float t = uTime*0.012;
        float n = vn(vec2(vUv.x*5.0 + t*10.0 + uSeed, vUv.y*2.2)) * 0.6 + vn(vec2(vUv.x*11.0 - t*14.0 + uSeed*3.0, vUv.y*4.5)) * 0.4;
        float edge = smoothstep(0.0,0.35,vUv.x)*smoothstep(1.0,0.65,vUv.x)*smoothstep(0.0,0.5,vUv.y)*smoothstep(1.0,0.5,vUv.y);
        float m = n*edge;
        float a = step(0.30,m)*0.5 + step(0.42,m)*0.5;
        gl_FragColor = vec4(pow(vec3(0.93,0.99,0.97),vec3(2.2)), a*uA);
      }`
  });
  const mk = (x, y, z, w, h, ry, seed, a) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(seed, a)); m.position.set(x, y, z); m.rotation.y = ry; m.layers.set(LAYER.FX); m.renderOrder = 8; scene.add(m); return m; };
  mk(10.5, 0.9, -9.2, 7.0, 1.8, 0.0, 1.0, 0.30);
  mk(8.0, 1.2, -13.4, 11.0, 2.6, 0.0, 3.0, 0.28);
  mk(12.2, 1.0, -5.2, 6.0, 2.0, Math.PI / 2, 5.0, 0.22);
  mk(-0.5, 0.9, -13.2, 9.0, 1.6, 0.0, 7.0, 0.22);
  mk(-7.0, 2.4, -12.6, 6.0, 2.8, Math.PI / 2 * 0.0, 9.0, 0.22);
}

function buildTerrain(scene) {
  buildJettyAndLighthouse(scene); buildHill(scene); buildHarborSteps(scene); buildSlipwayAndSampan(scene); buildTetrapodCorner(scene); buildFarBreakwater(scene); buildMist(scene);
}
