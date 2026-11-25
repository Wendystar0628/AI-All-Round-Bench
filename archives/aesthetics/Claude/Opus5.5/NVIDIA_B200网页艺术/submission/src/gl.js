// WebGL 渲染器、后期（辉光 / 色差 / 颗粒 / 暗角）与场景切换
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { S } from './state.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVig: { value: 0.55 },
    uCA: { value: 0.0025 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFade: { value: 0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVig, uCA, uFade; uniform vec2 uRes; uniform vec3 uLift;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 uv = vUv; vec2 d = uv-0.5; float r = length(d*vec2(uRes.x/uRes.y,1.));
      vec2 off = d*uCA*(0.4+r*1.6);
      vec3 c;
      c.r = texture2D(tDiffuse, uv-off).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv+off).b;
      c *= mix(1.0, smoothstep(1.25, 0.2, r), uVig);
      c += uLift*(1.0-c);
      float g = hash(floor(uv*uRes) + floor(fract(uTime*13.17)*977.0)) - 0.5;
      c += g*uGrain*(0.6+0.4*(1.0-c));
      c = mix(c, vec3(0.0), uFade);
      gl_FragColor = vec4(c,1.0);
    }`,
};

// 精度：同一幅画面随位数减少而变粗（色阶断层、抖动、网点、少数几种颜色），再按小块各自缩放恢复清晰
const PrintShader = {
  uniforms: {
    tDiffuse: { value: null }, tMask: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) }, uStage: { value: 0 }, uBlock: { value: 0 }, uMaskOn: { value: 0 },
    uCell: { value: 32 }, uGrid: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 }, uDither: { value: 0 },
    uHalf: { value: 0 }, uDuo: { value: 0 }, uDot: { value: 7 }, uCursor: { value: new THREE.Vector3(-1, -1, 0) }, uMix: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tMask; uniform vec2 uRes; uniform vec3 uCursor;
    uniform float uStage, uBlock, uMaskOn, uCell, uGrid, uFade, uTime, uDither, uHalf, uDuo, uDot, uMix;
    varying vec2 vUv;
    float qch(float v, float m, float bias, float mx){
      float x = clamp(v, 0.0, 1.0)*mx; float emin = 1.0 - bias;
      float e2 = max(floor(log2(max(x, 1e-7))), emin); float st = exp2(e2 - m);
      return min(floor(x/st + 0.5)*st, mx)/mx;
    }
    vec3 qfmt(vec3 c, float f){
      if (f < 0.5) return c;
      if (f < 1.5) return vec3(qch(c.r,10.,15.,65504.), qch(c.g,10.,15.,65504.), qch(c.b,10.,15.,65504.));
      if (f < 2.5) return vec3(qch(c.r,3.,7.,448.), qch(c.g,3.,7.,448.), qch(c.b,3.,7.,448.));
      if (f < 3.5) return vec3(qch(c.r,3.,1.,7.5), qch(c.g,3.,1.,7.5), qch(c.b,3.,1.,7.5));
      return vec3(qch(c.r,1.,1.,6.), qch(c.g,1.,1.,6.), qch(c.b,1.,1.,6.));
    }
    float b2(vec2 a){ return mod(a.x,2.)*2. + mod(a.y,2.)*3. - mod(a.x,2.)*mod(a.y,2.)*4.; }
    float bayer(vec2 p){ vec2 a = mod(floor(p), 4.0); return (b2(a)*4. + b2(floor(a/2.)) + 0.5)/16.; }
    vec3 pal(float L){
      vec3 c0 = vec3(0.02,0.024,0.027), c1 = vec3(0.09,0.2,0.1), c2 = vec3(0.45,0.66,0.2), c3 = vec3(0.72,0.95,0.29), c4 = vec3(0.93,0.91,0.87);
      return L < 0.25 ? mix(c0,c1,L/0.25) : L < 0.5 ? mix(c1,c2,(L-0.25)/0.25) : L < 0.75 ? mix(c2,c3,(L-0.5)/0.25) : mix(c3,c4,(L-0.75)/0.25);
    }
    void main(){
      vec2 px = vUv*uRes;
      float sc = max(1.0, uRes.y/1080.0);
      vec3 src = texture2D(tDiffuse, vUv).rgb;
      float fa = floor(uStage), k = uStage - fa, fb = min(fa + 1.0, 4.0);
      float edge = k*1.2 - 0.1;
      float f = vUv.x < edge ? fb : fa;
      float scan = (k > 0.001 && k < 0.999) ? exp(-abs(vUv.x - edge)*600.0) : 0.0;
      vec2 cell = floor(px/uCell), c0 = cell*uCell;
      float m = 1e-3;
      for (int i = 0; i < 5; i++) for (int j = 0; j < 5; j++) {
        vec3 sv = texture2D(tDiffuse, (c0 + (vec2(float(i), float(j)) + 0.5)/5.0*uCell)/uRes).rgb;
        m = max(m, max(max(sv.r, sv.g), sv.b));
      }
      m = max(m, 0.02);
      vec2 cols = uRes/uCell;
      float order = (cell.x + (cols.y - cell.y))/(cols.x + cols.y);
      float narr = smoothstep(order*0.85, order*0.85 + 0.15, uBlock);
      float mval = texture2D(tMask, (c0 + 0.5*uCell)/uRes).r*uMaskOn;
      float amt = clamp(max(narr, mval), 0.0, 1.0);
      float dth = (bayer(px/sc) - 0.5)*uDither*0.11;
      vec3 qa = qfmt(clamp(src + dth, 0.0, 1.0), f);
      vec3 qb = qfmt(clamp(src/m + dth, 0.0, 1.0), f)*m;
      float ab = smoothstep(0.35, 0.65, amt);
      vec3 q = mix(qa, qb, ab);
      float L = dot(q, vec3(0.3, 0.55, 0.15));
      vec3 col = mix(q, pal(L), uDuo);
      float ds = uDot*sc;
      vec2 rp = mat2(0.7071,-0.7071,0.7071,0.7071)*px/ds; vec2 g = fract(rp) - 0.5;
      float dotm = smoothstep(0.05, -0.05, length(g) - sqrt(clamp(L,0.,1.))*0.62);
      vec3 ht = mix(pal(L*0.25), pal(min(1.0, L*1.15 + 0.08)), dotm);
      col = mix(col, ht, uHalf*(1.0 - ab*0.85));
      col += vec3(0.72,0.95,0.29)*scan*0.45;
      vec2 bu = fract(px/uCell);
      float bl = 1.0 - smoothstep(0.0, 1.5*sc/uCell, min(min(bu.x,1.0-bu.x), min(bu.y,1.0-bu.y)));
      float flash = clamp(amt*(1.0-amt)*4.0, 0.0, 1.0);
      col = mix(col, vec3(0.02,0.024,0.027), uFade);
      col += vec3(0.72,0.95,0.29)*bl*(uGrid*0.55 + flash*0.6);
      float cd = length(px - uCursor.xy);
      col += vec3(0.72,0.95,0.29)*uCursor.z*0.6*exp(-abs(cd - 46.0*sc)*0.25/sc);
      gl_FragColor = vec4(mix(src, col, uMix), 1.0);
    }`,
};

// 等轴测插画：用法线与深度找出轮廓，画成细线
const EdgeShader = {
  uniforms: { tDiffuse: { value: null }, tNormal: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uAmt: { value: 0 }, uInk: { value: new THREE.Color(0.62, 0.6, 0.55) }, uFlat: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tNormal, tDepth; uniform vec2 uTexel; uniform float uAmt, uFlat; uniform vec3 uInk; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec4 n0 = texture2D(tNormal, vUv); float d0 = texture2D(tDepth, vUv).x;
      float dn = 0.0, dd = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 o = i == 0 ? vec2(1.,0.) : i == 1 ? vec2(-1.,0.) : i == 2 ? vec2(0.,1.) : vec2(0.,-1.);
        vec4 n = texture2D(tNormal, vUv + o*uTexel); float d = texture2D(tDepth, vUv + o*uTexel).x;
        dn += length(n.rgb - n0.rgb) + abs(n.a - n0.a); dd += abs(d - d0);
      }
      float e = clamp(smoothstep(0.35, 0.8, dn) + smoothstep(0.0015, 0.004, dd), 0.0, 1.0);
      c = mix(c, c*0.55 + vec3(0.012,0.014,0.016), uFlat);
      gl_FragColor = vec4(mix(c, uInk, e*uAmt), 1.0);
    }`,
};

export class GL {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: true, stencil: false,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.localClippingEnabled = true;
    r.setClearColor(0x050607, 1);

    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 0.82);
    this.output = new OutputPass();
    this.final = new ShaderPass(FinalShader);
    // 钳制过亮像素与 NaN，避免辉光被少数高光点燃成大片眩光
    this.clampPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uMax: { value: 3.0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 v = c.rgb;
          if (any(isnan(v)) || any(isinf(v))) v = vec3(0.0);
          float m = max(max(v.r, v.g), v.b); if (m > uMax) v *= uMax / m;
          gl_FragColor = vec4(v, 1.0); }`,
    });
    this.edge = new ShaderPass(EdgeShader);
    this.print = new ShaderPass(PrintShader);
    this.nrt = new THREE.WebGLRenderTarget(4, 4, { depthTexture: new THREE.DepthTexture(4, 4) });
    this.normalMat = new THREE.MeshNormalMaterial();
    this.edge.uniforms.tNormal.value = this.nrt.texture;
    this.edge.uniforms.tDepth.value = this.nrt.depthTexture;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.clampPass);
    this.composer.addPass(this.edge);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.print);
    this.composer.addPass(this.final);

    this.cur = null;
    this.post = { bloom: 0.7, radius: 0.55, threshold: 0.82, exposure: 1, grain: 0.045, vig: 0.55, ca: 0.0025, fade: 0, edge: 0, flat: 0, print: null };
    this._v = new THREE.Vector3();
  }
  resize(w, h, dpr) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.print.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.nrt.setSize(Math.round(w * dpr), Math.round(h * dpr));
    const tx = Math.max(1, dpr * (h / 1080));
    this.edge.uniforms.uTexel.value.set(tx / (w * dpr), tx / (h * dpr));
  }
  /** 本帧由哪个场景占用画布 */
  use(def) { this.cur = def; }
  setPost(o) { this.post.edge = 0; this.post.flat = 0; this.post.print = null; Object.assign(this.post, o); }
  render() {
    const def = this.cur;
    const u = this.final.uniforms;
    u.uTime.value = S.time;
    if (!def) { this.renderer.setRenderTarget(null); this.renderer.clear(); return; }
    const cam = def.camera;
    if (!cam.isOrthographicCamera) { cam.aspect = S.W / S.H; cam.updateProjectionMatrix(); }
    cam.layers.enable(1);
    const P0 = this.post;
    // 线描：先把场景的法线与深度画进一张离屏贴图（第 1 层的光点、光晕不参与）
    this.edge.enabled = P0.edge > 0.001;
    if (this.edge.enabled) {
      const sc = def.scene, r = this.renderer;
      const om = sc.overrideMaterial, bg = sc.background, fog = sc.fog;
      sc.overrideMaterial = this.normalMat; sc.background = null; sc.fog = null;
      cam.layers.set(0);
      const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
      r.setRenderTarget(this.nrt); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam);
      r.setRenderTarget(null); r.setClearColor(cc, ca);
      sc.overrideMaterial = om; sc.background = bg; sc.fog = fog;
      cam.layers.enable(1);
      this.edge.uniforms.uAmt.value = P0.edge; this.edge.uniforms.uFlat.value = P0.flat;
    }
    const pr = P0.print;
    this.print.enabled = !!pr;
    if (pr) {
      const pu = this.print.uniforms;
      for (const k in pr) if (pu[k] !== undefined) { if (pu[k].value && pu[k].value.isVector3) pu[k].value.copy(pr[k]); else pu[k].value = pr[k]; }
      pu.uTime.value = S.time;
    }
    this.renderPass.scene = def.scene;
    this.renderPass.camera = def.camera;
    const P = this.post;
    this.bloom.strength = P.bloom; this.bloom.radius = P.radius; this.bloom.threshold = P.threshold;
    this.bloom.enabled = P.bloom > 0.001;
    this.renderer.toneMappingExposure = P.exposure;
    u.uGrain.value = P.grain; u.uVig.value = P.vig; u.uCA.value = P.ca; u.uFade.value = P.fade;
    this.composer.render(S.dt);
  }
  /** 三维点 → 屏幕像素 */
  project(v, camera, out = {}) {
    if (!camera.isOrthographicCamera && camera.aspect !== S.W / S.H) { camera.aspect = S.W / S.H; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    const p = this._v.copy(v).project(camera);
    out.x = (p.x * 0.5 + 0.5) * S.W;
    out.y = (-p.y * 0.5 + 0.5) * S.H;
    out.z = p.z;
    out.vis = p.z < 1 && p.z > -1;
    return out;
  }
}

/** 正交相机：按视口比例设置取景高度 V（世界单位） */
export function setOrtho(cam, V) {
  const a = S.W / S.H;
  cam.left = (-V * a) / 2; cam.right = (V * a) / 2; cam.top = V / 2; cam.bottom = -V / 2;
  cam.updateProjectionMatrix();
}

/**
 * 剖切截面：给材质注入“背面即截面”的着色。
 * 闭合网格被剖切平面切开后，透过切口看到的是背面——把它涂成带斜线阴影的实心截面色。
 */
export function sectionize(mat, color, hatch = 0.35) {
  mat.side = THREE.DoubleSide;
  mat.userData.sectionColor = new THREE.Color(color);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, rr) => {
    if (prev) prev(sh, rr);
    sh.uniforms.uSecColor = { value: mat.userData.sectionColor };
    sh.uniforms.uSecHatch = { value: hatch };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uSecColor; uniform float uSecHatch;\nvoid main() {')
      .replace(
        /}\s*$/,
        `  if(!gl_FrontFacing){
             float hh = step(0.62, fract((gl_FragCoord.x + gl_FragCoord.y)/7.0));
             vec3 sc = uSecColor*(1.0 - uSecHatch*hh);
             gl_FragColor = vec4(sc, 1.0);
           }
         }`
      );
  };
  mat.customProgramCacheKey = () => 'sec' + color + '_' + hatch;
  return mat;
}
