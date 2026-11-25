"use strict";
const airFX = group(scene);
const gustU = { value: 0 };
const stormPeriod = 90;
const lightningBeats = [83.15, 83.38, 83.79];
const breakerPeak = 62.7;
const breakerVariance = 3.1;
function gustAt(t) {
  return Math.exp(-((t % stormPeriod - 39.8) ** 2) / 8.4);
}
function breakerAt(t) {
  return Math.exp(-((t % stormPeriod - breakerPeak) ** 2) / breakerVariance);
}
const rainCount = 23000,
  rp = [],
  phase = [],
  tail = [];
for (let i = 0; i < rainCount; i++) {
  let p = [between(-128, 128), between(0, 116), between(-128, 128)],
    s = rand();
  rp.push(...p, ...p);
  phase.push(s, s);
  tail.push(0, 1);
}
// The second rain curtain becomes visible only as the gust crosses the berth.
for (let i = 0; i < 7200; i++) {
  const start = ((i * 37) % rainCount) * 6;
  const drop = [rp[start] + 93.7, rp[start + 1] + 33.9, rp[start + 2] - 71.3];
  const variation = 2 + phase[start / 3] * 0.93;
  rp.push(...drop, ...drop);
  phase.push(variation, variation);
  tail.push(0, 1);
}
let rainGeo = new T.BufferGeometry();
rainGeo.setAttribute("position", new T.Float32BufferAttribute(rp, 3));
rainGeo.setAttribute("phase", new T.Float32BufferAttribute(phase, 1));
rainGeo.setAttribute("tail", new T.Float32BufferAttribute(tail, 1));
const rainMaterial = new T.ShaderMaterial({
  uniforms: {
    time: clockUniform,
    eye: { value: camera.position },
    gust: gustU,
    emitter: { value: reactorMount.localToWorld(V(0, 0, 0.94)) },
    forehead: headBeam.start,
    foreheadEnd: headBeam.end,
    shoulderA: { value: bodyProjectors[0][0] },
    shoulderEndA: { value: bodyProjectors[0][1] },
    shoulderB: { value: bodyProjectors[1][0] },
    shoulderEndB: { value: bodyProjectors[1][1] },
    ls0: aircraft[0].cone.start,
    ls1: aircraft[1].cone.start,
    lt0: aircraft[0].cone.end,
    lt1: aircraft[1].cone.end,
  },
  transparent: true,
  depthWrite: false,
  blending: T.AdditiveBlending,
  vertexShader: `attribute float phase,tail;uniform float time,gust;uniform vec3 eye,ls0,ls1,lt0,lt1,emitter,forehead,foreheadEnd,shoulderA,shoulderEndA,shoulderB,shoulderEndB;varying vec3 dye;varying float alpha;
 float cone(vec3 p,vec3 a,vec3 b){vec3 d=b-a;float f=clamp(dot(p-a,d)/dot(d,d),.0,1.);return (1.-smoothstep(.1,.4+f*6.,length(p-a-f*d)))*(1.-f*.6);}
 void main(){float salt=fract(phase);float curtain=mix(1.,gust,step(1.5,phase));
 float speed=24.+salt*15.;float t=time*(.94+.06*salt);
 float y=mod(position.y-t*speed,116.);vec2 drift=vec2(.169+gust*.25,.061+gust*.12);
 vec2 horizontal=position.xz+(116.-y)*drift;
 vec2 xz=mod(horizontal-eye.xz+128.,256.)+eye.xz-128.;
 vec3 p=vec3(xz.x,12.3+y,xz.y);float len=.62+salt*1.29+gust*.37;
 p+=tail*len*vec3(-drift.x,1.,-drift.y);
 float dist=length(p-eye);float backlight=cone(p,ls0,lt0)+cone(p,ls1,lt1);
 backlight+=.68*(cone(p,forehead,foreheadEnd)+cone(p,shoulderA,shoulderEndA)+cone(p,shoulderB,shoulderEndB));
 float core=exp(-length(p-emitter)*.26);
 alpha=curtain*(.032+salt*.083+backlight*.46+core*.34)*(1.-smoothstep(87.,151.,dist))*smoothstep(2.,12.,dist)*(.62+tail*.38);
 dye=mix(vec3(.44,.57,.66),vec3(1.7,.66,.19),core*.90)+backlight*vec3(.51,.68,.78);
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
  fragmentShader: `varying vec3 dye;varying float alpha;void main(){gl_FragColor=vec4(dye,alpha);}`,
});
const rainfall = new T.LineSegments(rainGeo, rainMaterial);
rainfall.frustumCulled = false;
rainfall.renderOrder = 10;
airFX.add(rainfall);
// Torn sheets curl outward from each shin. Thin upper edges disintegrate into droplets.
function surfSheet(x, z, phase) {
  let v = [],
    uv = [],
    ix = [],
    n = 142,
    kmax = 12;
  for (let k = 0; k <= kmax; k++)
    for (let j = 0; j <= n; j++) {
      let a = (j / n) * TAU;
      v.push(Math.cos(a), k / kmax, Math.sin(a));
      uv.push(j / n, k / kmax);
      if (j && k) {
        let i = k * (n + 1) + j;
        ix.push(i - n - 2, i, i - 1, i - n - 2, i - n - 1, i);
      }
    }
  let g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  let mat = new T.ShaderMaterial({
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: clockUniform,
      breaker: waterUniforms.breaker,
      centre: { value: new T.Vector2(x, z) },
      phase: { value: phase },
      bubbles: { value: seaDetail },
    },
    vertexShader:
      `uniform float time,phase,breaker;uniform vec2 centre;varying vec2 st;varying float sheetDensity;` +
      waveGL +
      `
 void main(){st=uv;float t=time+phase,a=uv.x*6.283185,h=uv.y;
 float crest=smoothstep(-.85,1.24,swell(centre+position.xz*3.,time));
 float pulse=.64*crest+.36*(.5+.5*sin(t*1.55+sin(a*3.+t*.6)));
 float peak=pow(.5+.5*sin(a*3.+t*.93+.8*sin(a*7.+t)),2.);
 float tear=.77+.23*sin(a*15.+t*2.23)*sin(a*9.-t*.89);
 sheetDensity=.36+.64*peak;float height=(1.68+pulse*3.5+peak*3.24+breaker*17.)*tear;
 float r=3.0+h*.67+h*h*(2.15+2.66*pulse+breaker*3.55)+sin(a*4.+t*.8)*.64;
 vec2 xz=centre+position.xz*vec2(r,r*.89);float y=11.6+swell(xz,time)*.79+h*height;
 gl_Position=projectionMatrix*viewMatrix*vec4(xz.x,y,xz.y,1.);}`,
    fragmentShader: `uniform sampler2D bubbles;uniform float time,phase,breaker;varying vec2 st;varying float sheetDensity;
 void main(){vec4 f=texture2D(bubbles,vec2(st.x*4.+phase,st.y*(.94+breaker*1.61)-time*.077));vec4 g=texture2D(bubbles,vec2(st.x*8.-time*.018,st.y*(1.79+breaker*1.88)+time*.03));
 float lace=f.b*.64+g.b*.36;float a=smoothstep(.28,.75,lace+(.54-st.y)*.43)*(1.-smoothstep(.68,1.,st.y+(f.a-.5)*.70));
 if(a<.018)discard;gl_FragColor=vec4(mix(vec3(.20,.31,.34),vec3(.71,.81,.81),lace),a*sheetDensity*.97);}`,
  });
  let o = new T.Mesh(g, mat);
  o.frustumCulled = false;
  o.renderOrder = 2;
  airFX.add(o);
}
surfSheet(13.4, 0.75, 0.97);
surfSheet(-13.45, -0.59, 3.41);
const sp = [],
  flow = [],
  sr = [],
  types = [];
function spray(origin, dir, seed, size, kind) {
  sp.push(...origin);
  flow.push(...dir);
  sr.push(seed, size);
  types.push(kind);
}
for (let s of [-1, 1])
  for (let i = 0; i < 4100; i++) {
    let a = rand() * TAU,
      r = between(2.6, 3.66),
      kick = rand() ** 1.75,
      b = between(1.7, 5.7);
    spray(
      [s * 13.44 + Math.cos(a) * r, 12.21, Math.sin(a) * r * 0.77 + s * 0.65],
      [Math.cos(a) * b, between(3.1, 9.5) + kick * 6.4, Math.sin(a) * b],
      rand(),
      between(0.021, 0.117),
      0
    );
  }
for (let i = 0; i < 2100; i++)
  spray(
    [between(-250, 250), 12.6, between(-61.6, -59.5)],
    [between(-1.6, 1.6), between(2.1, 8.3), between(0.4, 3.7)],
    rand(),
    between(0.05, 0.199),
    0
  );
for (let [p, w, d] of splashSurfaces)
  for (let i = 0; i < 110; i++)
    spray(
      [p.x + between(-w, w), p.y, p.z + between(-d, d)],
      [between(-0.78, 1.19), between(0.36, 2.7), between(-0.84, 0.84)],
      rand(),
      between(0.009, 0.041),
      1
    );
for (let [v, n] of waterSources)
  for (let j = 0; j < Math.ceil(n * 9); j++)
    spray(
      [v.x + between(-0.18, 0.18), v.y, v.z + between(-0.16, 0.16)],
      [0.35, between(-0.3, -2.3), -0.2],
      rand(),
      between(0.022, 0.085),
      2
    );
const sg = new T.BufferGeometry();
// Each impact throws a few small droplets from the same point on a moving crest.
for (let cell = 0; cell < 2300; cell++) {
  const x = between(-90, 90),
    z = between(-60, 145),
    phase = rand();
  for (let j = 0; j < 3; j++) {
    const a = (j * TAU) / 3 + phase * 19;
    spray(
      [x, 12, z],
      [Math.cos(a) * 0.69, between(0.84, 1.78), Math.sin(a) * 0.69],
      phase,
      between(0.014, 0.049),
      3
    );
  }
}
for (let [k, a, n] of [
  ["position", sp, 3],
  ["flow", flow, 3],
  ["variety", sr, 2],
  ["kind", types, 1],
])
  sg.setAttribute(k, new T.Float32BufferAttribute(a, n));
const splashMat = new T.ShaderMaterial({
  uniforms: { time: clockUniform, pixels, breaker: waterUniforms.breaker },
  transparent: true,
  depthWrite: false,
  vertexShader:
    `attribute vec3 flow;attribute vec2 variety;attribute float kind;uniform float time,pixels,breaker;varying float alpha,hotspot;
 ` +
    waveGL +
    `
 void main(){float seed=variety.x;
 float period=kind<.5?1.07+seed*.64:(kind<1.5?.38+seed*.36:.88+seed*.27);
 float age=fract(time/period+seed)*period;float launch=time-age;vec3 p=position;
 if(kind<.5){
   float incoming=swell(p.xz,launch);
   p.y+=.77*incoming;
   float sincePeak=mod(launch,90.)-${breakerPeak.toFixed(2)};
   float impulse=exp(-sincePeak*sincePeak/${breakerVariance.toFixed(2)});
   float beat=.58+.68*smoothstep(-.85,1.24,incoming)+impulse*1.93;
   p+=vec3(flow.x*(1.+.37*impulse),flow.y*beat,flow.z)*age;
   p.y-=7.27*age*age;
 }else if(kind>2.5){
   p.y+=swell(p.xz,launch);p+=flow*age;p.y-=5.25*age*age;
 }else if(kind<1.5){p+=flow*age;p.y-=5.4*age*age;}else{p+=flow*age;p.y-=7.8*age*age;}
 vec4 mv=viewMatrix*vec4(p,1.);gl_PointSize=clamp(variety.y*pixels*projectionMatrix[1][1]/max(1.,-mv.z),.65,17.);
 alpha=(kind<.5?.66:.46)*(1.-smoothstep(.67,1.,age/period))*smoothstep(11.9,12.75,p.y);
 if(kind>2.5)alpha=.47*(1.-smoothstep(.10,.21,age))*(1.-smoothstep(19.,62.,-mv.z));
 hotspot=.57+.43*seed;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `varying float alpha,hotspot;void main(){vec2 d=2.*gl_PointCoord-1.;d.x*=1.25;d.x+=.14*d.y;float r=dot(d,d);if(r>1.)discard;float glint=.49+.51*exp(-dot(d-vec2(-.26,-.33),d-vec2(-.26,-.33))*4.);gl_FragColor=vec4(vec3(.61,.76,.80)*hotspot*glint,(1.-r)*alpha);}`,
});
const sprayDots = new T.Points(sg, splashMat);
sprayDots.frustumCulled = false;
sprayDots.renderOrder = 6;
airFX.add(sprayDots);
// Light scattered by salt spray takes its colour from the lamps at that berth.
function sprayLighting(x, y, z) {
  const position = V(x, y, z);
  const light = z < -38 ? new T.Color(0.19, 0.24, 0.28) : new T.Color(0.36, 0.47, 0.51);
  for (let k = 0; k < yardSources.length; k++) {
    const falloff = 0.053 * Math.exp(-position.distanceToSquared(yardSources[k]) / 1050);
    light.r += yardTints[k].r * falloff;
    light.g += yardTints[k].g * falloff;
    light.b += yardTints[k].b * falloff;
  }
  return light;
}
// A crest folds up the quay face and spills over the coping when it reaches deck level.
const washPositions = [],
  washColours = [],
  washIndices = [];
const shoreStations = 520,
  shoreRows = 10;
for (let i = 0; i <= shoreStations; i++) {
  const x = -251 + (502 * i) / shoreStations;
  const colour = sprayLighting(x, 16, -62);
  for (let j = 0; j <= shoreRows; j++) {
    washPositions.push(x, j / shoreRows, -60);
    washColours.push(colour.r, colour.g, colour.b);
    if (i && j) {
      const a = i * (shoreRows + 1) + j;
      washIndices.push(a - shoreRows - 2, a - 1, a, a - shoreRows - 2, a, a - shoreRows - 1);
    }
  }
}
const washGeometry = new T.BufferGeometry();
washGeometry.setAttribute("position", new T.Float32BufferAttribute(washPositions, 3));
washGeometry.setAttribute("tint", new T.Float32BufferAttribute(washColours, 3));
washGeometry.setIndex(washIndices);
const washMaterial = new T.ShaderMaterial({
  uniforms: { time: clockUniform, detail: { value: seaDetail } },
  side: T.DoubleSide,
  transparent: true,
  depthWrite: false,
  vertexShader:
    waveGL +
    `
    attribute vec3 tint;uniform float time;
    varying vec2 sheetUV;varying vec3 incident;varying float breaking;
    void main(){
      float x=position.x,v=position.y;
      float wave=swell(vec2(x,-60.1),time);
      breaking=smoothstep(-.28,1.52,wave);
      float runup=12.15+.84*wave+3.91*breaking;
      float overflow=max(0.,runup-16.3);
      float climb=smoothstep(0.,.60,v),across=max(0.,(v-.60)/.40);
      float z=mix(-58.9,-61.54,climb)-across*(.12+2.64*overflow);
      float y=mix(11.93+swell(vec2(x,z),time),min(16.34,runup),climb);
      y+=overflow*(.04+.21*sin(across*3.14159))*(1.-.84*across);
      sheetUV=vec2(x*.143,v);incident=tint;
      gl_Position=projectionMatrix*viewMatrix*vec4(x,y,z,1.);
    }`,
  fragmentShader: `
    uniform sampler2D detail;uniform float time;
    varying vec2 sheetUV;varying vec3 incident;varying float breaking;
    void main(){
      vec4 a=texture2D(detail,vec2(sheetUV.x,sheetUV.y*.89-time*.11));
      vec4 b=texture2D(detail,vec2(sheetUV.x*2.74,sheetUV.y*1.73-time*.19));
      float froth=smoothstep(.26,.81,.49*a.b+.32*b.b+.51*a.a);
      float edge=(1.-smoothstep(.73,1.,sheetUV.y+(b.a-.51)*.27))*smoothstep(0.,.17,sheetUV.y);
      float alpha=breaking*froth*edge*.93;
      gl_FragColor=vec4(incident*(.83+.52*froth),alpha);
    }`,
});
const quayWash = new T.Mesh(washGeometry, washMaterial);
quayWash.frustumCulled = false;
quayWash.renderOrder = 2;
airFX.add(quayWash);
// A low, wind-torn layer of spray softens the waterline and the distant working apron.
let mistPos = [],
  mistUV = [],
  mistParams = [],
  mistColours = [],
  mistIdx = [];
function vapour(x, y, z, w, h, alpha) {
  const colour = sprayLighting(x, y, z);
  let i = mistPos.length / 3,
    r = rand() * 84;
  for (let [u, v] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]) {
    mistPos.push(x, y, z);
    mistUV.push(u, v);
    mistParams.push(w, h, alpha, r);
    mistColours.push(colour.r, colour.g, colour.b);
  }
  mistIdx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
for (let i = 0; i < 45; i++)
  vapour(
    -225 + i * 10.5,
    15 + rand() * 1.6,
    between(-70, -60),
    between(16, 35),
    between(3, 7),
    between(0.12, 0.24)
  );
for (let i = 0; i < 18; i++)
  vapour(
    -219 + i * 25.5,
    23.7 + Math.sin(i) * 1.7,
    -81 - (i % 3) * 4,
    between(25, 53),
    between(7, 14),
    between(0.18, 0.29)
  );
for (let i = 0; i < 19; i++)
  vapour(
    between(-171, 184),
    31 + rand() * 6,
    between(-120, -83),
    between(18, 38),
    between(6, 12),
    between(0.04, 0.11)
  );
for (let s of [-1, 1])
  for (let i = 0; i < 11; i++)
    vapour(
      13.43 * s + between(-5.1, 5.1),
      between(14.91, 16.33),
      between(-4.2, 3),
      between(4.6, 9.2),
      between(3.86, 6.97),
      between(0.16, 0.3)
    );
for (let [p, w, d] of splashSurfaces)
  for (let j = 0; j < 2; j++)
    vapour(
      p.x + between(-w * 0.5, w * 0.5),
      p.y + 0.36,
      p.z + between(-d * 0.5, d * 0.5),
      w * 1.62,
      between(0.71, 1.34),
      between(0.105, 0.19)
    );
let mg = new T.BufferGeometry();
mg.setAttribute("position", new T.Float32BufferAttribute(mistPos, 3));
mg.setAttribute("uv", new T.Float32BufferAttribute(mistUV, 2));
mg.setAttribute("settings", new T.Float32BufferAttribute(mistParams, 4));
mg.setAttribute("tint", new T.Float32BufferAttribute(mistColours, 3));
mg.setIndex(mistIdx);
let mMat = new T.ShaderMaterial({
  uniforms: { time: clockUniform, lookup: { value: noiseLookup } },
  transparent: true,
  depthWrite: false,
  side: T.DoubleSide,
  vertexShader: `attribute vec4 settings;attribute vec3 tint;uniform float time;varying vec3 incident;varying vec2 st;varying float alpha,seed,dist;
 void main(){st=uv;alpha=settings.z;seed=settings.w;vec3 p=position;p.x+=sin(time*.32+seed)*1.04;p.y+=sin(time*.65+seed)*.32;
 vec4 mv=viewMatrix*vec4(p,1.);mv.xy+=(uv-.5)*settings.xy;dist=-mv.z;incident=tint;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:
    `uniform float time;uniform sampler2D lookup;varying vec3 incident;varying vec2 st;varying float alpha,seed,dist;` +
    noiseGL +
    `
 void main(){vec2 d=(st-.5)*2.;float envelope=max(0.,1.-dot(d,d));float n=fb(vec3(st*vec2(3.8,2.2)+seed,time*.16));
 float a=smoothstep(.26,.69,n)*envelope*envelope*alpha;gl_FragColor=vec4(incident,a);}`,
});
const mistMesh = new T.Mesh(mg, mMat);
mistMesh.frustumCulled = false;
mistMesh.renderOrder = 5;
airFX.add(mistMesh);
const lightning = group(scene),
  arcM = emit(0xc9e2ff, 8);
const lightningOrigin = V(63, 156, -244);
let startArc = lightningOrigin.clone();
for (let k = 0; k < 26; k++) {
  let next = startArc.clone().add(V(between(-5, 3.4), -between(2.4, 5.4), between(-1.4, 2.2)));
  rod(lightning, startArc, next, 0.1 - k * 0.0025, arcM, 5);
  if (k % 7 === 0) {
    let a = startArc.clone();
    for (let j = 0; j < 5; j++) {
      let b = a.clone().add(V(between(1, 5.8), -between(0.9, 3.8), -0.7));
      rod(lightning, a, b, 0.051 - j * 0.006, arcM, 4);
      a = b;
    }
  }
  startArc = next;
}
bake(lightning);
lightning.visible = false;
function atmosphere(t) {
  const u = t % stormPeriod;
  const flash = (x, w) => Math.exp(-Math.max(0, u - x) / w) * (u >= x ? 1 : 0);
  const [first, second, afterglow] = lightningBeats;
  const light = 0.88 * flash(first, 0.35) + 0.74 * flash(second, 0.48) + 0.31 * flash(afterglow, 1.12);
  lightningU.value = light;
  lightningLight.intensity = light * 6.4;
  lightning.visible = (u > first && u < 83.35) || (u > second && u < 83.57);
  gustU.value = gustAt(t);
  waterUniforms.breaker.value = breakerAt(t);
}
