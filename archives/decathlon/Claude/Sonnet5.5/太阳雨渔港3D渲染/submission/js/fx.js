'use strict';
/* 全局着色器 uniform + 三渲二材质工厂（对 MeshToonMaterial 打补丁） */
const U = {
  uTime: { value: 0 },
  uCloud: { value: new THREE.Vector4(0, 0, 10, 0) },   // 云影中心x,z、半径、强度
  uCloudE: { value: new THREE.Vector2(1, 0) },         // 云影拉长方向
  uSun: { value: 1 },                                  // 太阳可见度（全局）
  uSunDirW: { value: new THREE.Vector3(0.50, 0.766, 0.405).normalize() },
  uSkyCol: { value: new THREE.Color('#e2f6f2') },
  uFogCol: { value: new THREE.Color('#e4f4f1') },
  uGustA: { value: new THREE.Vector4(-0.94, 0.34, -30, -999) },  // 风向x,z；起始坐标；起始时间
  uGustB: { value: new THREE.Vector4(7.0, 0.0, 1, 0) },        // 速度；幅度
  uWetness: { value: 1 },
  uRainNow: { value: 0.6 },
  uFogNear: { value: 42 }
};

const FX_COMMON_GLSL = /* glsl */`
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=.5; } return s; }
float gustAtV(vec2 xz){ float u=dot(xz,uGustA.xy); float tt=uTime-uGustA.w-(u-uGustA.z)/uGustB.x;
  return uGustB.y*smoothstep(0.,.7,tt)*exp(-max(tt-.7,0.)/2.6)*step(0.,tt); }
float cloudShadeAt(vec2 xz){ vec2 d=xz-uCloud.xy; vec2 e=uCloudE; float a=dot(d,e), b=dot(d,vec2(-e.y,e.x));
  float r=length(vec2(a*0.5,b)); return (1.-smoothstep(uCloud.z*.5,uCloud.z,r))*uCloud.w; }
`;

const VERT_DECL = /* glsl */`
uniform float uTime; uniform vec4 uGustA; uniform vec4 uGustB;
varying vec3 vWPos; varying vec3 vWN;
#ifdef USE_SWAY
attribute vec2 aSway;
#endif
float gustAtV(vec2 xz){ float u=dot(xz,uGustA.xy); float tt=uTime-uGustA.w-(u-uGustA.z)/uGustB.x;
  return uGustB.y*smoothstep(0.,.7,tt)*exp(-max(tt-.7,0.)/2.6)*step(0.,tt); }
`;
const VERT_SWAY = /* glsl */`
#ifdef USE_SWAY
{
  float sw = aSway.x, sph = aSway.y;
  #ifdef USE_INSTANCING
  vec4 swp = modelMatrix * instanceMatrix * vec4(transformed,1.0);
  #else
  vec4 swp = modelMatrix * vec4(transformed,1.0);
  #endif
  float sg = gustAtV(swp.xz);
  #if SWAY_MODE == 1
    transformed.x += sin(uTime*1.25+sph+swp.x*0.6)*0.17*sw;
    transformed.z += cos(uTime*0.95+sph*1.3+swp.z*0.5)*0.13*sw;
  #elif SWAY_MODE == 2
    float spd = 2.6+sg*5.5;
    transformed.z += sin(uTime*spd + sph - sw*6.0)*sw*(0.035+0.17*sg+0.03*sin(uTime*0.7+sph));
    transformed.y += sin(uTime*spd*0.8 + sph*2.0 - sw*4.0)*sw*(0.02+0.05*sg);
  #elif SWAY_MODE == 3
    float kk = 0.03 + sg*0.12;
    transformed.x += (sin(uTime*1.1+sph+swp.x*0.4)*kk - sg*0.07)*sw;
    transformed.z += (cos(uTime*0.9+sph*1.7)*kk + sg*0.03)*sw;
    transformed.y += sin(uTime*1.6+sph*2.1)*kk*0.3*sw;
  #elif SWAY_MODE == 4
    float spd4 = 1.2+sg*2.5;
    transformed.z += sin(uTime*spd4 + sph + transformed.y*2.0)*sw*(0.03+0.10*sg);
    transformed.x += sin(uTime*spd4*0.8 + sph*1.7)*sw*(0.01+0.05*sg);
  #elif SWAY_MODE == 5
    transformed.z += sin(uTime*7.5+sph - transformed.x*9.0)*sw*0.055;
    transformed.y += sin(uTime*5.0+sph)*sw*0.01;
  #endif
}
#endif
`;
const VERT_WPOS = /* glsl */`
{
  #ifdef USE_INSTANCING
    vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed,1.0);
    vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
  #else
    vec4 wpp = modelMatrix * vec4(transformed,1.0);
    vWN = normalize(mat3(modelMatrix) * objectNormal);
  #endif
  vWPos = wpp.xyz;
}
`;

const FRAG_DECL = /* glsl */`
uniform float uTime; uniform vec4 uCloud; uniform vec2 uCloudE; uniform float uSun; uniform vec3 uSunDirW;
uniform vec3 uSkyCol; uniform vec3 uFogCol; uniform vec4 uGustA; uniform vec4 uGustB; uniform float uWetness; uniform float uRainNow;
uniform float uLift; uniform float uHaze; uniform float uGloss; uniform float uDrops;
varying vec3 vWPos; varying vec3 vWN;
${FX_COMMON_GLSL}
`;

// 反照率阶段：混凝土 / 警示条 / 水下 / 雨珠等
const FRAG_ALBEDO = /* glsl */`
float fxWet = uGloss;
float fxCl = cloudShadeAt(vWPos.xz);
#ifdef FX_CONCRETE
{
  vec3 wn = normalize(vWN);
  float top = smoothstep(0.55,0.85,wn.y);
  float hc = abs(wn.x)>abs(wn.z) ? vWPos.z : vWPos.x;
  vec3 base = diffuseColor.rgb;
  float n1 = fbm(vWPos.xz*0.55);
  float n2 = fbm(vWPos.xz*2.3+11.);
  float n3 = vn(vWPos.xz*11.0);
  float wetM = smoothstep(0.40,0.66, fbm(vWPos.xz*0.30+3.7));
  vec3 topC = base*(0.92+0.15*n1);
  topC *= 1.0 - 0.22*smoothstep(0.50,0.78,n2);
  topC *= 0.93 + 0.12*n3;
  topC *= 1.0 - 0.10*step(0.86, vn(vWPos.xz*24.0)) - 0.05*step(0.9, vn(vWPos.xz*47.0+5.0));
  topC = mix(topC, topC*vec3(0.80,0.90,0.92), wetM*0.65);
  vec2 jp = abs(fract(vWPos.xz/3.2+0.5)-0.5)*3.2;
  float joint = 1.0-smoothstep(0.0,0.035,min(jp.x,jp.y));
  topC *= 1.0 - 0.20*joint;
  // 墙：砌块
  float ch = 0.5; float yy = vWPos.y+3.0; float row = floor(yy/ch);
  float off = fract(sin(row*12.9898)*43758.5453)*1.7;
  float bw = 1.25+fract(sin(row*3.1)*91.7)*0.55;
  float cx = (hc+off)/bw; float colId = floor(cx);
  float fy = fract(yy/ch), fx = fract(cx);
  float jy = min(fy,1.0-fy)*ch, jx = min(fx,1.0-fx)*bw;
  float jline = 1.0-smoothstep(0.012,0.034,min(jy,jx));
  float bt = h21(vec2(row,colId));
  vec3 wallC = base*(0.88+0.2*bt)*(0.95+0.08*n3);
  wallC *= 1.0 - 0.28*jline;
  float ty = vWPos.y + (fbm(vec2(hc*0.8,2.0))-0.5)*0.40;
  float damp = smoothstep(0.95,0.5,ty)*0.09 + smoothstep(0.38,0.12,ty)*0.13 + smoothstep(0.06,-0.35,ty)*0.20;
  float tl = (1.0-smoothstep(0.0,0.028,abs(ty-0.66)))*0.15;
  tl += (1.0-smoothstep(0.0,0.025,abs(ty-0.32)))*0.20;
  tl += (1.0-smoothstep(0.0,0.03,abs(ty-0.03)))*0.28;
  wallC *= 1.0 - damp - tl;
  float slime = smoothstep(0.12,-0.55,ty)*(0.45+0.55*n2);
  wallC = mix(wallC, vec3(0.16,0.34,0.31), slime*0.62);
  float stk = vn(vec2(hc*3.3, vWPos.y*0.22));
  wallC *= 1.0 - 0.10*smoothstep(0.6,0.92,stk);
  diffuseColor.rgb = mix(wallC, topC, top);
  fxWet = mix(0.25, (0.55+0.45*wetM)*uWetness, top);
}
#endif
#ifdef FX_HAZARD
{
  float sd = fract((vWPos.x+vWPos.z+vWPos.y*0.0)*1.55);
  float st = step(0.5, sd);
  float wear = fbm(vWPos.xz*3.7+vec2(vWPos.y*2.0));
  vec3 yel = vec3(0.98,0.80,0.10), blk = vec3(0.07,0.075,0.08);
  vec3 pc = mix(yel, blk, st);
  float gone = smoothstep(0.58,0.74,wear);
  pc = mix(pc, vec3(0.62,0.64,0.62), gone*0.8);
  pc *= 0.9+0.12*vn(vWPos.xz*20.);
  diffuseColor.rgb = pc;
  fxWet = 0.55*uWetness;
}
#endif
#ifdef FX_WEATHER
{
  vec3 wn = normalize(vWN);
  float sideF = 1.0 - smoothstep(0.5,0.8,abs(wn.y));
  float hcw = abs(wn.x)>abs(wn.z) ? vWPos.z : vWPos.x;
  float lowD = smoothstep(2.0, 0.95, vWPos.y);
  float stk = vn(vec2(hcw*3.6, vWPos.y*0.30));
  float stk2 = vn(vec2(hcw*9.0+3.0, vWPos.y*0.6));
  float drip = smoothstep(0.58,0.86,stk)*smoothstep(0.9,3.2,vWPos.y)*0.14 + smoothstep(0.62,0.9,stk2)*0.06;
  diffuseColor.rgb *= 1.0 - sideF*(0.13*lowD + drip);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.80,0.92,0.88), sideF*lowD*0.5);
  float topf = smoothstep(0.7,0.95,wn.y);
  diffuseColor.rgb *= 1.0 - topf*0.06*vn(vWPos.xz*3.0);
}
#endif
#ifdef FX_WOODGRAIN
{
  float g = vn(vec2(vWPos.x*1.5+vWPos.z*1.5, vWPos.y*24.0));
  diffuseColor.rgb *= 0.9 + 0.2*g;
}
#endif
`;

const FRAG_LIGHT = /* glsl */`
float fxSunK = uSun*(1.0 - 0.85*fxCl);
reflectedLight.directDiffuse *= fxSunK;
`;

const FRAG_FINAL = /* glsl */`
{
  vec3 fV = normalize(vViewPosition);
  float fNdv = clamp(dot(normal,fV),0.,1.);
  float lumD = dot(diffuseColor.rgb, vec3(0.333)) + 0.02;
  float litA = clamp(dot(reflectedLight.directDiffuse, vec3(0.333)) / (lumD*0.82*max(uSun,0.2)), 0., 1.);
  // 阴影区偏深青
  outgoingLight = mix(outgoingLight, outgoingLight*vec3(0.80,0.96,1.04) + vec3(0.0,0.012,0.022), (1.0-litA)*0.65);
  outgoingLight += diffuseColor.rgb * uLift;
  float sunVis = uSun*(1.0-fxCl*0.85);
  #ifdef FX_WET
  if (fxWet > 0.001) {
    float fre = pow(1.0-fNdv, 2.6);
    outgoingLight = mix(outgoingLight, uSkyCol, clamp(fre*0.85*fxWet,0.,0.65));
    {   // 雨点落在湿地面上溅起的小圈
      vec3 wnS = normalize(vWN); float topS = smoothstep(0.7,0.95,wnS.y);
      if (topS > 0.01 && fxWet > 0.2) {
        vec2 gp = vWPos.xz*7.0; vec2 cid = floor(gp); vec2 fq = fract(gp)-0.5;
        float hs = h21(cid+17.0); float on = step(hs, 0.16*uRainNow);
        float ph = fract(uTime*(0.7+hs*0.8) + hs*9.0);
        vec2 off = (vec2(h21(cid+3.3),h21(cid+8.1))-0.5)*0.4;
        float dd = length(fq-off); float rad = ph*0.34;
        float ringS = (1.0-smoothstep(0.0,0.05,abs(dd-rad)))*(1.0-ph)*on;
        outgoingLight = mix(outgoingLight, vec3(1.0), ringS*0.55*topS*fxWet*(1.0-0.5*fxCl));
      }
    }
    vec3 Ls = normalize((viewMatrix*vec4(uSunDirW,0.)).xyz);
    vec3 Hh = normalize(Ls+fV);
    float sp = dot(normal,Hh) + (vn(vWPos.xz*14.0+vWPos.y*9.0)-0.5)*0.012;
    #ifdef FX_CONCRETE
    float glK = 0.55, e0 = 0.972, e1 = 0.984;
    #else
    float glK = 0.9, e0 = 0.950, e1 = 0.968;
    #endif
    float gl = smoothstep(e0,e1,sp);
    outgoingLight += vec3(1.0,0.88,0.62)*gl*glK*fxWet*sunVis;
  }
  #endif
  #ifdef FX_DROPS
  {
    vec3 wn2 = normalize(vWN);
    float upf = smoothstep(0.55,0.9,wn2.y);
    if (upf > 0.01 && uDrops > 0.0 && vWPos.y > 0.03) {
      vec2 gp = vWPos.xz*13.0; vec2 cell = floor(gp); vec2 fc = fract(gp)-0.5;
      float hh = h21(cell);
      if (hh > 0.62) {
        vec2 off = (vec2(h21(cell+3.1),h21(cell+7.7))-0.5)*0.5;
        float d = length(fc-off);
        float rad = 0.07+0.07*h21(cell+1.3);
        float dropM = 1.0-smoothstep(rad*0.8,rad,d);
        float tw = 0.5+0.5*sin(uTime*(1.0+hh*2.0)+hh*40.0);
        vec3 dc = mix(diffuseColor.rgb*0.9, vec3(1.0,0.92,0.7), 0.25+0.75*smoothstep(0.55,1.0,tw)*sunVis);
        outgoingLight = mix(outgoingLight, dc*1.12, dropM*0.7*upf*uDrops);
        outgoingLight += vec3(1.0,0.85,0.5)*dropM*smoothstep(0.8,1.0,tw)*0.45*sunVis*upf*uDrops;
      }
    }
  }
  #endif
  #ifdef FX_UNDER
  {
    float dep = max(-vWPos.y, 0.0);
    float kk = 1.0-exp(-dep*0.30);
    vec3 wn3 = normalize(vWN);
    vec2 cp = vWPos.xz*0.8 + vWPos.y*0.4;
    float ca = vn(cp*1.5+vec2(uTime*0.20,0.0));
    float cb = vn(cp*1.5+vec2(0.0,-uTime*0.17)+9.0);
    float cau = smoothstep(0.84,0.97, 1.0-abs(ca-cb)*3.2);
    float cmask = (0.35+0.65*clamp(wn3.y,0.,1.)) * exp(-dep*0.45) * step(0.0,-vWPos.y+0.05);
    outgoingLight = mix(outgoingLight*vec3(0.86,0.97,0.99), vec3(0.05,0.31,0.37), kk*0.62);
    outgoingLight += vec3(0.50,0.92,0.80)*cau*cmask*0.26*sunVis;
  }
  #endif
  outgoingLight *= mix(vec3(1.0), vec3(0.86,0.93,0.97), fxCl*0.9);
  outgoingLight = mix(outgoingLight, uFogCol, uHaze);
}
`;

let _gradTex = null;
function gradientMap() {
  if (_gradTex) return _gradTex;
  const N = 64, d = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * 2 - 1;     // N·L
    const v = x < 0.03 ? 0.0 : (x < 0.46 ? 0.74 : 1.0);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255;
  }
  _gradTex = new THREE.DataTexture(d, N, 1, THREE.RGBAFormat);
  _gradTex.minFilter = _gradTex.magFilter = THREE.NearestFilter;
  _gradTex.needsUpdate = true;
  return _gradTex;
}

const ALL_MESHES = [];      // 参与轮廓线通道的网格
function reg(mesh) { ALL_MESHES.push(mesh); return mesh; }

/* 选项：color vc map emissive emissiveMap side transparent opacity concrete hazard gloss drops lift haze sway under alphaTest */
function toonMat(o = {}) {
  const m = new THREE.MeshToonMaterial({
    color: o.color !== undefined ? o.color : 0xffffff,
    gradientMap: gradientMap(),
    vertexColors: o.vc !== false && !o.map ? true : !!o.vc,
    map: o.map || null,
    side: o.side || THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity !== undefined ? o.opacity : 1,
    alphaTest: o.alphaTest || 0,
    depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
  });
  if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity || 1; }
  if (o.emissiveMap) m.emissiveMap = o.emissiveMap;
  if (o.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = o.polygonOffset; m.polygonOffsetUnits = o.polygonOffset; }
  const defs = {};
  if (o.concrete) defs.FX_CONCRETE = '';
  if (o.hazard) defs.FX_HAZARD = '';
  if (o.wood) defs.FX_WOODGRAIN = '';
  if (o.weather) defs.FX_WEATHER = '';
  if (o.gloss || o.concrete || o.hazard) defs.FX_WET = '';
  if (o.drops) defs.FX_DROPS = '';
  if (o.under) defs.FX_UNDER = '';
  if (o.sway) { defs.USE_SWAY = ''; defs.SWAY_MODE = o.sway; }
  m.defines = defs;
  m.userData.sway = o.sway || 0;
  m.userData.fxKey = JSON.stringify(defs);
  const uni = { uLift: { value: o.lift || 0 }, uHaze: { value: o.haze || 0 }, uGloss: { value: o.gloss || 0 }, uDrops: { value: o.drops !== undefined ? (o.drops === true ? 1 : o.drops) : 0 } };
  m.userData.uni = uni;
  m.customProgramCacheKey = () => m.userData.fxKey;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_SWAY)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_WPOS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_ALBEDO)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + FRAG_LIGHT)
      .replace('#include <opaque_fragment>', FRAG_FINAL + '\n#include <opaque_fragment>');
  };
  return m;
}

/* 轮廓线通道所用的法线材质（带同样的摆动顶点动画） */
const _nmats = {};
function normalMatFor(mat) {
  const sway = mat.userData.sway || 0;
  const side = mat.side;
  const key = sway + '_' + side;
  if (_nmats[key]) return _nmats[key];
  const m = new THREE.MeshNormalMaterial({ side });
  if (sway) {
    m.defines = { USE_SWAY: '', SWAY_MODE: sway };
    m.customProgramCacheKey = () => 'n' + key;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uTime: U.uTime, uGustA: U.uGustA, uGustB: U.uGustB });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uGustA; uniform vec4 uGustB;\n#ifdef USE_SWAY\nattribute vec2 aSway;\n#endif\n' +
          'float gustAtV(vec2 xz){ float u=dot(xz,uGustA.xy); float tt=uTime-uGustA.w-(u-uGustA.z)/uGustB.x; return uGustB.y*smoothstep(0.,.7,tt)*exp(-max(tt-.7,0.)/2.6)*step(0.,tt); }')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_SWAY);
    };
  }
  _nmats[key] = m;
  return m;
}

/* 玻璃 / 透明塑料：保持透明、带动漫式斜向高光 */
function glassMat(o = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTint: { value: new THREE.Color(o.tint || '#bfe9ee') },
      uOp: { value: o.opacity !== undefined ? o.opacity : 0.2 },
      uStripe: { value: o.stripe !== undefined ? o.stripe : 1 },
      uTime: U.uTime, uSun: U.uSun, uCloud: U.uCloud, uCloudE: U.uCloudE
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; vN=normalize(normalMatrix*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uTint; uniform float uOp; uniform float uStripe; uniform float uTime; uniform float uSun; uniform vec4 uCloud; uniform vec2 uCloudE;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        vec3 n=normalize(vN); vec3 v=normalize(vV); float f=pow(1.-abs(dot(n,v)),2.2);
        float s=(vUv.x*0.9+vUv.y*1.0);
        float st=smoothstep(0.0,0.02,abs(fract(s*1.2+0.12)-0.5)-0.46)*0.0;
        float band = step(0.9, fract(s*0.8+0.15)) + step(0.96, fract(s*0.8+0.33))*0.0;
        float b2 = smoothstep(0.0,0.015,0.07-abs(fract(s*0.9)-0.30)) + smoothstep(0.0,0.015,0.025-abs(fract(s*0.9)-0.42));
        vec3 col=mix(uTint, vec3(1.), b2*0.9*uStripe);
        float a=uOp + f*0.22 + b2*0.28*uStripe;
        gl_FragColor=vec4(col, clamp(a,0.,0.85));
      }`
  });
  return m;
}
