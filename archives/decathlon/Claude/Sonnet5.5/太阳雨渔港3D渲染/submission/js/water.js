'use strict';
/* 水体：平面反射、色块化水面、涟漪、航迹、剖面水墙、水洼 */
const NRIP = 64, NWAKE = 48;
const Ripples = {
  list: Array.from({ length: NRIP }, () => new THREE.Vector4(0, 0, -99, 0)), idx: 0,
  add(x, z, amp = 1) { this.list[this.idx].set(x, z, Env.t, amp); this.idx = (this.idx + 1) % NRIP; }
};
const SLAP = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)); let _slapI = 0;
function addSlap(x, z, amp = 1) { SLAP[_slapI].set(x, z, Env.t, amp); _slapI = (_slapI + 1) % 6; }
const Wake = {
  list: Array.from({ length: NWAKE }, () => new THREE.Vector4(0, 0, -99, 0)), idx: 0,
  add(x, z, s = 1) { this.list[this.idx].set(x, z, Env.t, s); this.idx = (this.idx + 1) % NWAKE; },
  // 某点受航迹波影响的强度：波前以速度 c 向外传播
  at(x, z) {
    let s = 0;
    for (const w of this.list) {
      const age = Env.t - w.z; if (age < 0 || age > 9) continue;
      const d = Math.hypot(x - w.x, z - w.y);
      const front = age * 1.5 + 0.3;
      const dd = Math.abs(d - front);
      if (dd < 0.9) s += (1 - dd / 0.9) * Math.exp(-age * 0.3) * w.w;
    }
    return Math.min(s, 1.5);
  }
};

class Reflector {
  constructor(y, scale = 0.5, clipOff = 0.0) {
    this.y = y; this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(LAYER.WORLD); this.cam.layers.enable(LAYER.GLASS);
    this.texMat = new M4();
    this.plane = new THREE.Plane(new V3(0, 1, 0), -(y + clipOff));
    this.ps = new V3(); this.look = new V3(); this.up = new V3();
  }
  resize(w, h) { this.rt.setSize(Math.max(64, Math.round(w * this.scale)), Math.max(64, Math.round(h * this.scale))); }
  render(renderer, scene, camera) {
    const cam = this.cam, y = this.y;
    camera.updateMatrixWorld();
    this.ps.setFromMatrixPosition(camera.matrixWorld);
    this.look.set(0, 0, -1).transformDirection(camera.matrixWorld);
    this.up.set(0, 1, 0).transformDirection(camera.matrixWorld);
    cam.position.set(this.ps.x, 2 * y - this.ps.y, this.ps.z);
    cam.up.set(this.up.x, -this.up.y, this.up.z);
    cam.lookAt(cam.position.x + this.look.x, cam.position.y - this.look.y, cam.position.z + this.look.z);
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    cam.updateMatrixWorld();
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMat.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    const prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.clippingPlanes = [this.plane];
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, cam);
    renderer.clippingPlanes = [];
    renderer.shadowMap.autoUpdate = prevAuto;
  }
}

const PAL_GLSL = /* glsl */`
vec3 posterPal(float L, vec3 src){
  vec3 c0=vec3(0.070,0.255,0.385), c1=vec3(0.16,0.54,0.60), c2=vec3(0.56,0.87,0.83), c3=vec3(0.965,1.0,0.985);
  vec3 c = L<0.20 ? c0 : (L<0.44 ? c1 : (L<0.72 ? c2 : c3));
  return mix(c, src, 0.10);
}
`;

function makeWaterSurface(reflector) {
  const U2 = {
    uRefl: { value: reflector.rt.texture }, uTexMat: { value: reflector.texMat },
    uRip: { value: Ripples.list }, uWake: { value: Wake.list },
    uTime: U.uTime, uCloud: U.uCloud, uCloudE: U.uCloudE, uSun: U.uSun, uSunDirW: U.uSunDirW,
    uGustA: U.uGustA, uGustB: U.uGustB, uDark: { value: 0 }, uFogNear: U.uFogNear
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: U2,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform sampler2D uRefl; uniform mat4 uTexMat; uniform float uTime; uniform vec4 uRip[${NRIP}]; uniform vec4 uWake[${NWAKE}];
      uniform vec4 uCloud; uniform vec2 uCloudE; uniform float uSun; uniform vec3 uSunDirW; uniform vec4 uGustA; uniform vec4 uGustB; uniform float uDark; uniform float uFogNear;
      varying vec3 vW;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=.5; } return s; }
      float gustAtV(vec2 xz){ float u=dot(xz,uGustA.xy); float tt=uTime-uGustA.w-(u-uGustA.z)/uGustB.x;
        return uGustB.y*smoothstep(0.,.7,tt)*exp(-max(tt-.7,0.)/2.6)*step(0.,tt); }
      float cloudShadeAt(vec2 xz){ vec2 d=xz-uCloud.xy; vec2 e=uCloudE; float a=dot(d,e), b=dot(d,vec2(-e.y,e.x));
        float r=length(vec2(a*0.5,b)); return (1.-smoothstep(uCloud.z*.5,uCloud.z,r))*uCloud.w; }
      ${PAL_GLSL}
      void main(){
        vec2 xz = vW.xz; float t = uTime;
        float gust = gustAtV(xz);
        float cl = cloudShadeAt(xz);
        float sunV = uSun*(1.0-0.85*cl);
        float amp = 0.55 + gust*1.5;
        float n1 = vn(vec2(xz.x*0.55, xz.y*2.4) + vec2(t*0.22, t*0.31));
        float n2 = vn(vec2(xz.x*1.6, xz.y*4.4) + vec2(-t*0.35, t*0.50)+5.);
        float w1 = sin(xz.x*0.9 + t*0.8)*0.5 + sin(xz.y*1.3 - t*0.6 + xz.x*0.4)*0.5;
        float off = ((n1-0.5)*0.040 + (n2-0.5)*0.022 + w1*0.007)*amp;
        // 涟漪
        float ring = 0.0; vec2 rdir = vec2(0.);
        for(int i=0;i<${NRIP};i++){ vec4 r=uRip[i]; float age=uTime-r.z; if(age<0.||age>2.4) continue;
          vec2 dv = xz-r.xy; float d=length(dv); float rad=age*0.50+0.03; float w=0.030+age*0.012; float a=(1.0-age/2.4)*r.w;
          float rr = (1.0-smoothstep(0.0,w,abs(d-rad))) + 0.7*(1.0-smoothstep(0.0,w*0.8,abs(d-rad*0.55)));
          ring += rr*a; rdir += normalize(dv+1e-4)*rr*a; }
        // 航迹
        float foam=0., wring=0.; vec2 wdir=vec2(0.);
        for(int i=0;i<${NWAKE};i++){ vec4 w=uWake[i]; float age=uTime-w.z; if(age<0.||age>13.) continue;
          vec2 dv = xz-w.xy; float d=length(dv); float R0=0.5+age*0.26;
          foam += (1.-smoothstep(R0*0.35,R0,d))*exp(-age*0.42)*w.w;
          float fr = age*1.5+0.3; float lr = (1.0-smoothstep(0.0,0.10,abs(d-fr)))*exp(-age*0.26)*w.w;
          float rg = (i - (i/3)*3 == 0) ? 1.0 : 0.0; wring += lr*rg; wdir += normalize(dv+1e-4)*lr*(0.4+0.6*rg); }
        float uvOffX = floor(off*70.0+0.5)/70.0 + wdir.x*0.012 + rdir.x*0.006;
        float uvOffY = off*0.5 + wdir.y*0.008 + rdir.y*0.004;
        vec4 rc = uTexMat*vec4(vW,1.0);
        vec2 uv = rc.xy/rc.w + vec2(uvOffX, uvOffY);
        vec4 refl = texture2D(uRefl, uv);
        float cover = smoothstep(0.2,0.8,refl.a);
        float Lr = pow(dot(refl.rgb, vec3(0.299,0.587,0.114))+1e-4, 0.45);
        vec3 rp = posterPal(Lr, pow(refl.rgb, vec3(0.45)));
        vec3 V = normalize(cameraPosition - vW);
        float fre = pow(1.0 - clamp(V.y,0.,1.), 2.2);
        vec3 base = mix(vec3(0.22,0.70,0.68), vec3(0.11,0.50,0.60), smoothstep(0.32,0.72,fbm(xz*0.11+2.0)));
        vec3 sky = vec3(0.80,0.96,0.94);
        vec3 col = base;
        col = mix(col, sky, fre*0.55 + 0.05);
        col = mix(col, rp, cover*(0.62+0.28*fre));
        // 粼光：细碎的暖白光斑
        float g1 = vn(vec2(xz.x*1.1+t*0.35, xz.y*9.5 - t*0.7));
        float g2 = vn(vec2(xz.x*2.6-t*0.5, xz.y*16.0 + t*0.4)+3.0);
        float tw = 0.5+0.5*sin(t*(1.5+g2*3.0)+g1*30.0);
        float glint = step(0.93, g1*0.55+g2*0.55) * step(0.5,tw) * (0.7+0.5*gust);
        col = mix(col, vec3(1.0,0.95,0.78), glint*0.8*sunV);
        float ripM = step(0.40, ring);
        float foamM = step(0.5, foam*(0.55+0.9*vn(xz*5.5+vec2(t*0.2,0.))));
        float wringM = step(0.35, wring);
        // 阵风：细碎白色小波纹
        float gw = vn(vec2(xz.x*6.0+t*1.2, xz.y*15.0+t*0.5));
        float gwM = step(0.85, gw) * smoothstep(0.25,0.8,gust);
        col = mix(col, vec3(0.95,1.0,0.99), clamp(ripM*0.75 + foamM*0.92 + wringM*0.55 + gwM*0.8, 0., 1.));
        col = mix(col, col*vec3(0.80,0.88,0.92), cl*0.6 + uDark*0.3);
        float fogK = smoothstep(uFogNear, uFogNear+85.0, length(cameraPosition - vW))*0.8; col = mix(col, vec3(0.90,0.97,0.96), fogK);
        float alpha = 0.44 + fre*0.34 + cover*0.26 + ripM*0.2 + foamM*0.5 + wringM*0.3 + glint*0.3 + gwM*0.4;
        gl_FragColor = vec4(pow(col, vec3(2.2)), clamp(alpha, 0., 0.96));
      }`
  });
  const g = new THREE.PlaneGeometry(28, 28); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(0, 0, 0);
  m.layers.set(LAYER.WATER); m.renderOrder = 10; m.frustumCulled = false;
  return m;
}

/* 水域侧壁：半透明青绿色水体剖面 */
function makeWaterWall(w, h, pos, rotY) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uSun: U.uSun, uCloud: U.uCloud, uCloudE: U.uCloudE },
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform float uSun; uniform vec4 uCloud; uniform vec2 uCloudE; varying vec3 vW; varying vec2 vUv;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      void main(){
        float depth = clamp(-vW.y/3.0, 0.0, 1.0);
        float hc = vW.x + vW.z;
        float surf = 0.025*sin(hc*1.7+uTime*1.3) + 0.012*sin(hc*4.1-uTime*1.9);
        if (vW.y > surf) discard;
        vec3 top = vec3(0.55,0.93,0.86), mid = vec3(0.22,0.74,0.72), bot = vec3(0.07,0.40,0.47);
        vec3 col = mix(top, mid, smoothstep(0.0,0.35,depth)); col = mix(col, bot, smoothstep(0.3,1.0,depth));
        // 青绿色分层色带
        float bandN = vn(vec2(hc*0.6, vW.y*2.0)+uTime*0.07);
        float bandL = smoothstep(0.0,0.05, abs(fract(depth*4.0 + bandN*0.25)-0.5)-0.43);
        col = mix(col, col*1.18+0.04, (1.0-bandL)*0.6);
        // 焦散斜线
        vec2 cp = vec2(hc*0.8, vW.y*1.2);
        float ca = vn(cp*1.5+vec2(uTime*0.2,0.)); float cb = vn(cp*1.5+vec2(0.,-uTime*0.17)+9.);
        float cau = smoothstep(0.86,0.97, 1.0-abs(ca-cb)*3.2) * exp(-depth*1.4);
        col += vec3(0.5,0.9,0.8)*cau*0.35;
        float edge = smoothstep(0.07,0.0,abs(vW.y-surf)) ;
        col = mix(col, vec3(0.96,1.0,0.98), edge*0.9);
        float alpha = 0.20 + depth*0.20 + edge*0.65 + cau*0.2 + (1.0-bandL)*0.05;
        gl_FragColor = vec4(pow(col, vec3(2.2)), clamp(alpha,0.,0.92));
      }`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(pos[0], pos[1], pos[2]); m.rotation.y = rotY;
  m.layers.set(LAYER.WATER); m.renderOrder = 11;
  return m;
}

/* 水洼：倒映灯柱 / 船 / 海鸥 */
function makePuddles(reflector, list) {
  const pos = [], uv = [], seed = [], idx = []; let n = 0;
  for (const p of list) {   // {x,z,rx,rz,rot}
    const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; const sd = p.seed !== undefined ? p.seed : rnd(0, 20);
    for (const [a, b] of corners) {
      const lx = a * p.rx * 1.25, lz = b * p.rz * 1.25;
      pos.push(p.x + lx * c - lz * s, p.y !== undefined ? p.y : reflector.y + 0.012, p.z + lx * s + lz * c);
      uv.push(a * 1.25, b * 1.25); seed.push(sd);
    }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uRefl: { value: reflector.rt.texture }, uTexMat: { value: reflector.texMat }, uTime: U.uTime, uRip: { value: Ripples.list },
      uCloud: U.uCloud, uCloudE: U.uCloudE, uSun: U.uSun, uSunDirW: U.uSunDirW },
    vertexShader: `attribute float aSeed; varying vec3 vW; varying vec2 vUv; varying float vS;
      void main(){ vUv=uv; vS=aSeed; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uRefl; uniform mat4 uTexMat; uniform float uTime; uniform vec4 uRip[${NRIP}]; uniform vec4 uCloud; uniform vec2 uCloudE; uniform float uSun;
      varying vec3 vW; varying vec2 vUv; varying float vS;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=.5; } return s; }
      float cloudShadeAt(vec2 xz){ vec2 d=xz-uCloud.xy; vec2 e=uCloudE; float a=dot(d,e), b=dot(d,vec2(-e.y,e.x));
        float r=length(vec2(a*0.5,b)); return (1.-smoothstep(uCloud.z*.5,uCloud.z,r))*uCloud.w; }
      ${PAL_GLSL}
      void main(){
        vec2 p = vUv;
        float n = vn(p*1.3+vS*3.7)*0.7 + vn(p*2.6+vS*1.9)*0.3;
        float r = length(p*vec2(1.0,1.08)) + (n-0.5)*0.6;
        float mask = 1.0 - smoothstep(0.78,0.84,r);
        if (mask < 0.01) discard;
        float rim = smoothstep(0.62,0.80,r);
        vec2 xz = vW.xz; float t = uTime;
        float ring = 0.0; vec2 rdir = vec2(0.);
        for(int i=0;i<${NRIP};i++){ vec4 rr=uRip[i]; float age=t-rr.z; if(age<0.||age>2.0) continue;
          vec2 dv = xz-rr.xy; float d=length(dv); if (d>1.0) continue; float rad=age*0.34+0.02; float w=0.02+age*0.008; float a=(1.0-age/2.0)*rr.w;
          float q = (1.0-smoothstep(0.0,w,abs(d-rad)))+0.7*(1.0-smoothstep(0.0,w*0.8,abs(d-rad*0.55)));
          ring += q*a; rdir += normalize(dv+1e-4)*q*a; }
        float wob = (vn(vec2(xz.x*0.8, xz.y*1.6)+t*0.12)-0.5);
        vec4 rc = uTexMat*vec4(vW,1.0);
        vec2 uv = rc.xy/rc.w + vec2(floor(wob*8.0)/8.0*0.0035, wob*0.002) + rdir*0.0025;
        vec4 refl = texture2D(uRefl, uv);
        float cover = smoothstep(0.2,0.8,refl.a);
        float Lr = pow(dot(refl.rgb, vec3(0.299,0.587,0.114))+1e-4, 0.45);
        vec3 rp = posterPal(Lr, pow(refl.rgb, vec3(0.45)));
        vec3 V = normalize(cameraPosition - vW); float fre = pow(1.0 - clamp(V.y,0.,1.), 2.0);
        vec3 skyc = vec3(0.80,0.95,0.93);
        vec3 col = mix(vec3(0.60,0.78,0.78), skyc, 0.45 + fre*0.5);
        col = mix(col, rp, cover*0.72);
        float ringM = step(0.4, ring);
        col = mix(col, vec3(0.97,1.0,0.99), ringM*0.7);
        float cl = cloudShadeAt(xz);
        col = mix(col, col*vec3(0.80,0.89,0.94), cl*0.55);
        col = mix(col, vec3(0.30,0.46,0.50), rim*0.55*(1.0-cover));
        gl_FragColor = vec4(pow(col, vec3(2.2)), mask*(0.86));
      }`
  });
  const m = new THREE.Mesh(g, mat); m.layers.set(LAYER.WATER); m.renderOrder = 9; m.frustumCulled = false;
  return m;
}
