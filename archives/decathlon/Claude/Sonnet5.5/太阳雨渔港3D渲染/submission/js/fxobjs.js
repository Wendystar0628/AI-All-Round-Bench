'use strict';
/* 光柱、水面反光(天花板/舱顶摇曳光斑)、滴水源 */
const Shafts = [], Caustics = [], DripSources = [];

function makeShaft(top, dir, len, o = {}) {
  const pos = [], tt = [], idx = [];
  const bottom = top.map(p => p.clone().addScaledVector(dir, len));
  const add = (a, ta) => { pos.push(a.x, a.y, a.z); tt.push(ta); };
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    add(top[i], 0); add(top[j], 0); add(bottom[j], 1); add(bottom[i], 1);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(o.color || '#ffe7a8') }, uAmt: { value: 0 }, uTime: U.uTime, uPow: { value: o.pow || 1.3 }, uFadeTop: { value: o.fadeTop ? 1 : 0 } },
    vertexShader: `attribute float aT; varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vT=aT; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uAmt; uniform float uTime; uniform float uPow; uniform float uFadeTop; varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), uPow);
        float a = pow(1.0-vT, 0.9) * smoothstep(0.0,0.06,vT+0.06) * f * mix(1.0, smoothstep(0.0,0.45,vT)*1.6, uFadeTop);
        float fl = 0.85 + 0.15*vn(vec2(vT*6.0 - uTime*0.6, vW.x+vW.z));
        // 细微的分层色带
        float band = 0.8+0.2*step(0.5, fract(vT*5.0+uTime*0.03));
        float al = a*fl*band*uAmt;
        gl_FragColor = vec4(uCol, al);
      }`
  });
  const m = new THREE.Mesh(g, mat); m.layers.set(LAYER.FX); m.renderOrder = 20; m.frustumCulled = false;
  const c = new V3(); for (const p of top) c.add(p); c.multiplyScalar(0.25).addScaledVector(dir, len);
  Shafts.push({ mesh: m, c, amt: o.amt !== undefined ? o.amt : 1, ph: rnd(0, 6.28), fixed: o.fixed });
  return m;
}
// 水面反光投在天花板/墙面/舱顶的摇曳光斑
function makeCaustic(w, h, pos, rot, o = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uAmt: { value: 0 }, uScale: { value: o.scale || 1.0 }, uCol: { value: new THREE.Color(o.color || '#c6f5ea') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime; uniform float uAmt; uniform float uScale; uniform vec3 uCol; varying vec2 vUv;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      void main(){
        vec2 p = vUv*vec2(${(w).toFixed(2)},${(h).toFixed(2)})*uScale*2.0;
        float t = uTime*0.35;
        float a = vn(p*1.3+vec2(t,0.3*t)), b = vn(p*1.3*1.37+vec2(-0.7*t,t)+9.0);
        float c = vn(p*2.4+vec2(0.4*t,-t)+4.0);
        float net = smoothstep(0.80,0.95, 1.0-abs(a-b)*3.4);
        float net2 = smoothstep(0.86,0.97, 1.0-abs(a-c)*4.0)*0.6;
        float edge = smoothstep(0.0,0.12,vUv.x)*smoothstep(1.0,0.88,vUv.x)*smoothstep(0.0,0.12,vUv.y)*smoothstep(1.0,0.88,vUv.y);
        float al = (net+net2)*uAmt*edge;
        gl_FragColor = vec4(uCol, al);
      }`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(pos[0], pos[1], pos[2]); m.rotation.set(rot[0], rot[1], rot[2]); m.layers.set(LAYER.FX); m.renderOrder = 18;
  Caustics.push({ mat, c: new V3(pos[0], pos[1], pos[2]), amt: o.amt !== undefined ? o.amt : 0.4 });
  return m;
}
function addDrip(x, y, z, landY, o = {}) { DripSources.push({ x, y, z, landY, ripple: o.ripple !== false, rate: o.rate || 0.5, next: rnd(0, 3), big: o.big || 1, water: !!o.water }); }

function updateLightFx(dt, t) {
  const rainFx = 0.6 + 0.4 * Env.rainNow;
  for (const s of Shafts) {
    const sun = Env.sunAt(s.c.x, s.c.z);
    s.mesh.material.uniforms.uAmt.value = s.amt * sun * (0.9 + 0.1 * Math.sin(t * 0.7 + s.ph)) * (1 - 0.6 * Env.dark);
  }
  for (const c of Caustics) c.mat.uniforms.uAmt.value = c.amt * Env.sunAt(c.c.x, c.c.z) * (0.85 + 0.15 * Math.sin(t * 0.9 + c.c.x)) * (1 - 0.5 * Env.dark);
}

/* 在墙上开洞的实体墙：openings = [{a0,a1,y0,y1}]，axis 'x' 表示墙面法向沿 x（墙沿 z 延伸） */
function wallWithOpenings(P, axis, c, a0, a1, y0, y1, th, openings, color) {
  const breaks = new Set([a0, a1]);
  for (const o of openings) { breaks.add(clamp(o.a0, a0, a1)); breaks.add(clamp(o.a1, a0, a1)); }
  const bs = [...breaks].sort((p, q) => p - q);
  const put = (aa0, aa1, yy0, yy1) => {
    if (aa1 - aa0 < 1e-3 || yy1 - yy0 < 1e-3) return;
    const am = (aa0 + aa1) / 2, ym = (yy0 + yy1) / 2;
    if (axis === 'x') P.box(th, yy1 - yy0, aa1 - aa0, [c, ym, am], color); else P.box(aa1 - aa0, yy1 - yy0, th, [am, ym, c], color);
  };
  for (let i = 0; i < bs.length - 1; i++) {
    const s0 = bs[i], s1 = bs[i + 1], mid = (s0 + s1) / 2;
    const ops = openings.filter(o => o.a0 <= mid && o.a1 >= mid).sort((p, q) => p.y0 - q.y0);
    let y = y0;
    for (const o of ops) { put(s0, s1, y, o.y0); y = Math.max(y, o.y1); }
    put(s0, s1, y, y1);
  }
}

/* 雨珠：附着在边沿/栏杆上的小水珠（实例化，带暖色闪光） */
let _beadMat = null;
function makeBeads(points, rMin = 0.012, rMax = 0.028) {
  if (!_beadMat) _beadMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: U.uTime, uSun: U.uSun },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vId; void main(){ vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); vN=normalize(mat3(modelViewMatrix)*mat3(instanceMatrix)*normal); vV=-mv.xyz; vId=float(gl_InstanceID); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform float uSun; varying vec3 vN; varying vec3 vV; varying float vId;
      void main(){ vec3 n=normalize(vN), v=normalize(vV); float f=pow(1.0-max(dot(n,v),0.0),2.0);
        float tw = 0.5+0.5*sin(uTime*(1.2+fract(vId*0.37)*2.0)+vId*7.0);
        float spec = smoothstep(0.55,0.75, dot(n, normalize(vec3(-0.4,0.8,0.5)))) ;
        vec3 col = mix(vec3(0.72,0.92,0.95), vec3(1.0,0.95,0.78), spec*0.9 + smoothstep(0.7,1.0,tw)*0.4*uSun);
        float a = 0.55 + 0.4*f + spec*0.3;
        gl_FragColor = vec4(pow(col,vec3(2.2)), clamp(a,0.,0.95)); }`
  });
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), _beadMat, points.length);
  const m = new M4(), q = new Q4(), s = new V3(), p = new V3();
  points.forEach((pt, i) => { const r = rnd(rMin, rMax); p.set(pt[0], pt[1], pt[2]); s.set(r, r * 0.75, r); m.compose(p, q, s); im.setMatrixAt(i, m); });
  im.layers.set(LAYER.GLASS); im.renderOrder = 11; im.frustumCulled = false;
  return im;
}

/* 岸壁/船体水线处的三渲二浪花带：随潮汐一拍一拍地舔上来 */
let _foamRibMat = null;
function foamRibbonMat() {
  if (_foamRibMat) return _foamRibMat;
  _foamRibMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uSun: U.uSun, uSlap: { value: SLAP } },
    vertexShader: `attribute float aD; attribute float aU; varying float vD; varying float vU; varying vec3 vW; void main(){ vD=aD; vU=aU; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec4 uSlap[6]; varying float vD; varying float vU; varying vec3 vW;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      void main(){
        float n = vn(vec2(vU*2.6, uTime*0.5)) * 0.6 + vn(vec2(vU*6.0 - uTime*0.7, vD*3.0)) * 0.4;
        float lap = 0.5+0.5*sin(uTime*1.15 + vU*0.9 + n*5.0);
        float boost = 0.0; for(int i=0;i<6;i++){ vec4 sl=uSlap[i]; float ag=uTime-sl.z; if(ag>0.0&&ag<3.5){ boost += sl.w*exp(-ag*1.1)*(1.0-smoothstep(0.0,3.5,length(vW.xz-sl.xy))); } }
        float width = 0.18 + 0.45*lap + 0.2*n + boost*0.7;
        float core = step(vD, width);
        float dots = step(0.80, vn(vec2(vU*9.0+uTime*0.4, vD*7.0))) * step(vD, width+0.35) * (1.0-core);
        float a = (core*0.92 + dots*0.8) * (1.0 - smoothstep(0.85,1.0,vD));
        gl_FragColor = vec4(pow(vec3(0.97,1.0,0.99),vec3(2.2)), a);
      }`
  });
  return _foamRibMat;
}
function makeFoamRibbon(points, w, y = 0.025) {
  const pos = [], aD = [], aU = [], idx = []; let acc = 0;
  points.forEach((p, i) => {
    if (i > 0) acc += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]);
    pos.push(p[0] - p[2] * 0.03, y, p[1] - p[3] * 0.03, p[0] + p[2] * w, y, p[1] + p[3] * w); aD.push(0, 1); aU.push(acc, acc);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aD', new THREE.Float32BufferAttribute(aD, 1)); g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, foamRibbonMat()); m.layers.set(LAYER.WATER); m.renderOrder = 12; m.frustumCulled = false;
  return m;
}
function lineRibbonPts(x0, z0, x1, z1, nx, nz, step = 0.5) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(L / step)), out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([lerp(x0, x1, t), lerp(z0, z1, t), nx, nz]); }
  return out;
}
