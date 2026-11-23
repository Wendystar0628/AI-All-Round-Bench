'use strict';
/* 环境：光照、天空、云影、阵风、雨势、事件导演 */
const Env = {
  t: 0,
  sunDir: new V3(0.50, 0.766, 0.405).normalize(),
  cloudAmp: 0, dark: 0, rain: 0.62, rainTarget: 0.62, rainbow: 0, lamp: 0,
  gustActive: 0, wind: 0.2,
  catOut: 0, boatOut: 0,
  event: null, evT: 0, restT: 3.0, queue: ['gust', 'boat', 'cloud', 'cat', 'rainbow', 'cloudDark', 'gust', 'cat', 'boat', 'cloud'],
  evCount: 0,
  cloud: { x: 40, z: -30, dx: -0.8, dz: 0.6, sp: 2.4, R: 11, amp: 0, active: false, t: 0, dur: 28 },
  gust: { t0: -999, dirx: -0.91, dirz: 0.41, u0: 0, dur: 9 },
  cloudDimAt(x, z) {                 // 与着色器中 cloudShadeAt 一致
    const c = this.cloud; const ex = c.dx, ez = c.dz; const dxp = x - c.x, dzp = z - c.z;
    const a = dxp * ex + dzp * ez, b = -dxp * ez + dzp * ex;
    const r = Math.hypot(a * 0.5, b);
    return (1 - smooth(c.R * 0.5, c.R, r)) * c.amp;
  },
  sunAt(x, z) { return U.uSun.value * (1 - 0.85 * this.cloudDimAt(x, z)); },
  windAt(x, z) {                      // 与着色器 gustAtV 一致，返回 0..1
    const g = this.gust; const u = x * g.dirx + z * g.dirz;
    const tt = this.t - g.t0 - (u - g.u0) / 7.0;
    if (tt < 0) return 0;
    return smooth(0, 0.7, tt) * Math.exp(-Math.max(tt - 0.7, 0) / 2.6) * (U.uGustB.value.y);
  }
};

function setupEnvironment(scene, renderer) {
  // 光源
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.6);
  sun.position.copy(Env.sunDir).multiplyScalar(48);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 4; sc.far = 110;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xdff6f4, 0x74b8b2, 2.5);
  scene.add(hemi);
  Env.sun = sun; Env.hemi = hemi;
  // 风向 / 云方向
  const g = Env.gust; g.u0 = 22 * g.dirx + (-22) * g.dirz;
  U.uGustA.value.set(g.dirx, g.dirz, g.u0, -999);
  U.uSunDirW.value.copy(Env.sunDir);
}

/* ---- 天空穹顶 ---- */
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { uSunDir: { value: Env.sunDir }, uTime: U.uTime, uSun: U.uSun, uDark: { value: 0 }, uRainbow: { value: 0 }, uRbAxis: { value: new V3(-0.58 * Math.cos(0.95), -Math.sin(0.95), -0.81 * Math.cos(0.95)).normalize() } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_Position.z=gl_Position.w*0.9999; }`,
    fragmentShader: `uniform vec3 uSunDir; uniform float uTime; uniform float uSun; uniform float uDark; uniform float uRainbow; uniform vec3 uRbAxis; varying vec3 vD;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=.5; } return s; }
      void main(){
        vec3 d=normalize(vD);
        float h=d.y;
        vec3 hor=vec3(0.95,0.99,0.975), mid=vec3(0.82,0.955,0.96), zen=vec3(0.66,0.88,0.94), low=vec3(0.88,0.965,0.955);
        vec3 col = h>0. ? mix(hor, mix(mid,zen,smoothstep(0.25,0.9,h)), smoothstep(0.0,0.35,h)) : mix(hor, low, smoothstep(0.0,-0.6,h));
        // 地平线：极淡的远海与朦胧岛影（只在低机位环视时才会看到）
        { float az = atan(d.x, d.z);
          float isl = 0.012 + 0.05*pow(vn(vec2(az*2.1, 3.0)),2.2) + 0.02*vn(vec2(az*9.0, 7.0));
          float band = smoothstep(-0.16,-0.01,h)*(1.0-smoothstep(-0.01,0.02,h));
          vec3 seaC = vec3(0.70,0.90,0.90);
          col = mix(col, seaC, band*0.45);
          float inIsl = step(h, isl)*step(0.0,h);
          col = mix(col, vec3(0.74,0.87,0.88), inIsl*0.55*smoothstep(0.55,0.62,vn(vec2(az*1.3,11.0))));
          float streak = step(0.8, vn(vec2(az*40.0, h*260.0)))*smoothstep(-0.14,-0.01,h)*(1.0-smoothstep(-0.01,0.0,h));
          col = mix(col, vec3(0.97,1.0,0.99), streak*0.5); }
        // 水彩式的薄云（分级平涂）
        vec2 cp = d.xz/(abs(d.y)+0.35)*1.6 + vec2(uTime*0.004, uTime*0.002);
        float n = fbm(cp*1.3 + vec2(0.0, 2.0)*d.y);
        float cl = smoothstep(0.50,0.56,n)*0.30 + smoothstep(0.60,0.66,n)*0.22;
        cl *= smoothstep(-0.75,0.05,h);
        // 云底略带青色，云面泛白
        float cl2 = smoothstep(0.50,0.56,fbm(cp*1.3 + vec2(0.0, 2.0)*d.y + vec2(0.07,0.11)))*0.16*smoothstep(-0.75,0.05,h);
        col = mix(col, vec3(0.72,0.90,0.92), cl2);
        col = mix(col, vec3(1.0), cl);
        // 太阳光晕
        float sd = max(dot(d, normalize(uSunDir)),0.);
        col += vec3(1.0,0.93,0.72)*(pow(sd,48.)*0.55 + pow(sd,6.)*0.10)*uSun;
        // 云隙放射光
        float ang = atan(d.x*uSunDir.z-d.z*uSunDir.x, d.y-uSunDir.y);
        float rays = smoothstep(0.55,1.0, sin(ang*17.0+uTime*0.05)*0.5+0.5) * pow(sd,3.0)*0.10;
        col += vec3(1.0,0.95,0.8)*rays*uSun;
        float th = degrees(acos(clamp(dot(d, normalize(uRbAxis)),-1.,1.)));
        float tb = (th - 40.0)/5.0;
        if (tb>0. && tb<1. && uRainbow>0.001) {
          float k = floor(tb*6.0);
          vec3 rc = k<1.?vec3(.62,.5,.9): (k<2.?vec3(.45,.65,.95): (k<3.?vec3(.5,.9,.7): (k<4.?vec3(.98,.95,.55): (k<5.?vec3(1.,.75,.45): vec3(1.,.55,.5)))));
          float ed = smoothstep(0.,0.05,tb)*smoothstep(1.,0.95,tb);
          col = mix(col, mix(col, rc, 0.9), 0.42*uRainbow*ed);
        }
        col = mix(col, col*vec3(0.62,0.74,0.80), uDark);
        gl_FragColor=vec4(col,1.0);
        gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(2.2));
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), mat);
  m.renderOrder = -100; m.frustumCulled = false; m.layers.set(LAYER.SKY);
  Env.skyMat = mat;
  return m;
}

/* ---- 事件导演：同一时刻最多一件较明显的事 ---- */
function startEvent(name) {
  Env.event = name; Env.evT = 0;
  if (name === 'gust') {
    const g = Env.gust; g.t0 = Env.t; U.uGustA.value.w = g.t0; Env.evDur = 11;
    U.uGustB.value.y = 0.0; Env.gustRise = true;
  } else if (name === 'cloud' || name === 'cloudDark') {
    const c = Env.cloud; c.active = true; c.t = 0; c.dur = name === 'cloudDark' ? 32 : 24;
    c.R = name === 'cloudDark' ? 20 : 11;
    const ang = rnd(-0.3, 0.3);
    c.dx = Math.cos(2.5 + ang); c.dz = Math.sin(2.5 + ang);    // 由右后向左前移动
    const L = 44;
    c.x0 = -c.dx * L; c.z0 = -c.dz * L; c.x = c.x0; c.z = c.z0;
    c.sp = (2 * L) / c.dur;
    c.dark = name === 'cloudDark';
    Env.evDur = c.dur + 4;
  } else if (name === 'rainbow') {
    Env.rainTarget = 0.1; Env.evDur = 20; Env.rbStart = 3;
  } else if (name === 'cat') {
    Env.catOut = 1; Env.rainTarget = 0.18; Env.evDur = 32;
  } else if (name === 'boat') {
    Env.boatOut = 1; Env.evDur = 70;
  }
}
function endEvent() {
  const e = Env.event;
  if (e === 'cloud' || e === 'cloudDark') { Env.cloud.active = false; Env.cloud.amp = 0; Env.cloudAmp = 0; }
  if (e === 'rainbow') { Env.rainTarget = 0.62; }
  if (e === 'cat') { Env.rainTarget = 0.62; Env.catOut = 0; }
  Env.event = null; Env.restT = rnd(1.5, 3.5);
}

function updateEnv(dt) {
  Env.t += dt; U.uTime.value = Env.t;
  // 事件调度
  if (Env.event === null) {
    Env.restT -= dt;
    if (Env.restT <= 0) { startEvent(Env.queue[Env.evCount % Env.queue.length]); Env.evCount++; }
  } else {
    Env.evT += dt;
    if (Env.evT > (Env.evDur || 60) + 45) { Env.boatOut = 0; Env.catOut = 0; endEvent(); }
    else if (Env.event === 'boat') { if (Env.boatDone) { Env.boatDone = false; endEvent(); } }
    else if (Env.event === 'cat') {
      // 猫回去后结束
      if (Env.evT > 8 && Env.catOut === 0) endEvent();
      if (Env.evT > Env.evDur - 8 && Env.catOut === 1) { Env.rainTarget = 0.7; }
      if (Env.catHome && Env.evT > 10) { Env.catHome = false; endEvent(); }
    } else if (Env.evT > Env.evDur) endEvent();
  }
  // 云影
  const c = Env.cloud;
  if (c.active) {
    c.t += dt; c.x = c.x0 + c.dx * c.sp * c.t; c.z = c.z0 + c.dz * c.sp * c.t;
    const p = c.t / c.dur;
    c.amp = smooth(0.0, 0.18, p) * (1 - smooth(0.82, 1.0, p));
    if (p >= 1.0) { c.active = false; c.amp = 0; }
  }
  U.uCloud.value.set(c.x, c.z, c.R, c.amp);
  U.uCloudE.value.set(c.dx, c.dz);
  Env.cloudAmp = c.amp;
  // 天色变暗（极偶尔）
  let darkT = 0;
  if (c.active && c.dark) { const p = c.t / c.dur; darkT = smooth(0.25, 0.42, p) * (1 - smooth(0.62, 0.8, p)); }
  Env.dark += (darkT - Env.dark) * Math.min(1, dt * 1.2);
  U.uSun.value = 1 - 0.40 * Env.dark;
  Env.lamp += ((Env.dark > 0.35 ? 1 : 0) - Env.lamp) * Math.min(1, dt * 1.5);
  Env.skyMat.uniforms.uDark.value = Env.dark * 0.6; Env.skyMat.uniforms.uRainbow.value = Env.rainbow;
  Env.sun.intensity = 2.6 * (1 - 0.15 * Env.dark);
  Env.hemi.intensity = 2.5 * (1 - 0.18 * Env.dark);
  // 阵风幅度
  const g = Env.gust; const gt = Env.t - g.t0;
  U.uGustB.value.y = (Env.event === 'gust' || gt < 24) ? 1.0 : 0.0;
  U.uGustA.value.w = g.t0;
  // 雨势缓慢起伏
  Env.rain += (Env.rainTarget - Env.rain) * Math.min(1, dt * 0.35);
  const wob = 0.15 * Math.sin(Env.t * 0.10) + 0.08 * Math.sin(Env.t * 0.23 + 1.3);
  Env.rainNow = clamp(Env.rain + (Env.rainTarget > 0.5 ? wob : 0), 0.05, 1);
  // 彩虹
  const rbTarget = (Env.event === 'rainbow' && Env.evT > Env.rbStart && Env.evT < Env.evDur - 5 && Env.rain < 0.3) ? 1 : 0;
  Env.rainbow += (rbTarget - Env.rainbow) * Math.min(1, dt * 0.5);
  U.uWetness.value = 0.85 + 0.15 * Env.rainNow; U.uRainNow.value = Env.rainNow;
}
