"use strict";
const WATER = 12;
const randomBytes = new Uint8Array(256 * 256 * 4),
  randField = new Uint8Array(256 * 256);
for (let i = 0; i < randField.length; i++) randField[i] = Math.floor(rand() * 256);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 256; x++) {
    let i = y * 256 + x;
    randomBytes[i * 4] = randField[i];
    randomBytes[i * 4 + 1] = randField[((y + 17) & 255) * 256 + ((x + 37) & 255)];
    randomBytes[i * 4 + 2] = randField[((y + 71) & 255) * 256 + ((x + 9) & 255)];
    randomBytes[i * 4 + 3] = 255;
  }
const noiseLookup = new T.DataTexture(randomBytes, 256, 256);
noiseLookup.wrapS = noiseLookup.wrapT = T.RepeatWrapping;
noiseLookup.minFilter = noiseLookup.magFilter = T.LinearFilter;
noiseLookup.needsUpdate = true;
const noiseGL = `
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;
  vec2 n=texture2D(lookup,(uv+.5)/256.).rg;return mix(n.r,n.g,f.z);}
float fb(vec3 p){float a=n3(p)*.51;p=p*2.03+vec3(9.,4.,7.);a+=n3(p)*.255;
p=p*2.04+vec3(1.,13.,7.);a+=n3(p)*.132;p=p*2.07+vec3(3.,5.,1.);a+=n3(p)*.067;return a+n3(p*2.09)*.036;}
`;
// Bake a volumetric overcast to a floating-point sky map. All cameras share the same cloud field.
const rtFormat =
  renderer.capabilities.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float")
    ? T.HalfFloatType
    : T.UnsignedByteType;
const skyRT = new T.WebGLRenderTarget(2048, 1024, {
  type: rtFormat,
  depthBuffer: false,
  minFilter: T.LinearFilter,
  magFilter: T.LinearFilter,
});
const screenTriangle = new T.BufferGeometry();
screenTriangle.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const flatCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const flatScene = new T.Scene(),
  flatQuad = new T.Mesh(screenTriangle, null);
flatQuad.frustumCulled = false;
flatScene.add(flatQuad);
const flatVert = "void main(){gl_Position=vec4(position.xy,0.,1.);}";
const passPixels = { value: new T.Vector2(1, 1) };
const viewportGL = "uniform vec2 passPixels;\n#define vUv (gl_FragCoord.xy*passPixels)\n";
function blit(mat, target) {
  flatQuad.material = mat;
  passPixels.value.set(
    1 / (target ? target.width : canvas.width),
    1 / (target ? target.height : canvas.height)
  );
  renderer.setRenderTarget(target);
  renderer.render(flatScene, flatCamera);
}
const cloudBaker = new T.ShaderMaterial({
  uniforms: { lookup: { value: noiseLookup }, passPixels },
  vertexShader: flatVert,
  fragmentShader:
    viewportGL +
    `
uniform sampler2D lookup;
` +
    noiseGL +
    `
float cloud(vec3 p){
  float layer=smoothstep(.70,.86,p.y)*(1.-smoothstep(1.45,1.83,p.y));
  vec3 q=p*vec3(1.31,1.82,1.31)+vec3(-3.78,.25,7.49);
  float skew=n3(q*.68);
  float base=fb(q*1.81+skew*.99);
  return max(0.,base-.372)*layer*5.8;
}
void main(){
  float a=(vUv.x-.5)*6.2831853,h=(vUv.y-.5)*3.1415926;
  vec3 dir=vec3(cos(h)*cos(a),sin(h),cos(h)*sin(a));
  float elev=max(.0,dir.y);
  float port=pow(max(0.,dot(normalize(vec3(dir.x,.0,dir.z)),normalize(vec3(.18,.0,-1.)))),2.);
  vec3 moon=normalize(vec3(-.63,.36,-.86));
  float moonDot=max(0.,dot(dir,moon));
  vec3 horizon=mix(vec3(.079,.121,.157),vec3(.189,.137,.099),port*.69);
  vec3 sky=mix(horizon,vec3(.013,.031,.064),smoothstep(-.01,.73,dir.y));
  sky+=vec3(.14,.19,.24)*pow(moonDot,8.)+vec3(.49,.61,.73)*pow(moonDot,85.);
  if(dir.y>-.055){
    vec3 rd=normalize(vec3(dir.x,max(.018,dir.y+.052),dir.z));
    float t0=.70/rd.y,t1=min(44.,1.83/rd.y);
    float stepLen=(t1-t0)/29.;float tr=1.;vec3 scatter=vec3(0.);
    for(int i=0;i<29;i++){
      float t=t0+(float(i)+.52)*stepLen;vec3 p=rd*t;float den=cloud(p);
      if(den>.002){
        float towards=cloud(p+moon*.19);
        float light=clamp((den-towards)*1.27+.39,.035,1.0);
        float depth=clamp((p.y-.73)/.89,.0,1.);
        vec3 dark=vec3(.017,.030,.045)+vec3(.017,.013,.009)*port;
        vec3 silver=vec3(.11,.164,.21)*(.27+1.85*pow(moonDot,4.));
        vec3 col=dark+silver*(light*.86+depth*.22);
        col+=vec3(.075,.035,.009)*port*pow(max(.0,1.-elev*2.4),2.);
        // Localised sodium light on the underside of the cloud deck above the berths.
        vec2 west=(p.xz-vec2(-2.9,-5.6))*vec2(.43,.36);
        vec2 east=(p.xz-vec2(1.85,-4.25))*vec2(.56,.43);
        float uplight=.88*exp(-dot(west,west))+.73*exp(-dot(east,east));
        col+=vec3(.24,.078,.018)*uplight*(1.-depth*.81)*(.41+.59*min(1.,den));
        float k=1.-exp(-den*stepLen*4.48);scatter+=tr*k*col;tr*=1.-k;
        if(tr<.011)break;
      }
    }sky=scatter+tr*sky;
    sky=mix(sky,horizon,(1.-smoothstep(.0,.19,elev))*.81);
  }
  float band=exp(-abs(dir.y+.002)*16.);
  sky+=vec3(.051,.025,.009)*port*band;
  sky*=vec3(.38,.46,.56);sky+=vec3(.035,.013,.002)*port*exp(-abs(dir.y)*8.5);gl_FragColor=vec4(sky,1.);
}`,
});
blit(cloudBaker, skyRT);
renderer.setRenderTarget(null);
cloudBaker.dispose();
const skyRead = `vec2 skyUV(vec3 d){d=normalize(d);return vec2(atan(d.z,d.x)*.159154943+.5,asin(clamp(d.y,-1.,1.))*.318309886+.5);}`;
const lightningU = { value: 0 };
const skyMat = new T.ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  uniforms: {
    skyMap: { value: skyRT.texture },
    time: clockUniform,
    flash: lightningU,
    skyViewport: { value: new T.Vector4() },
    lensTangent: { value: new T.Vector2() },
  },
  vertexShader: "void main(){gl_Position=vec4(position.xy,1.,1.);}",
  fragmentShader:
    `uniform sampler2D skyMap;uniform float flash,time;uniform vec4 skyViewport;uniform vec2 lensTangent;` +
    skyRead +
    `
 void main(){vec2 ndc=2.*(gl_FragCoord.xy-skyViewport.xy)/skyViewport.zw-1.;
 vec3 ray=vec3(ndc*lensTangent,-1.);
 vec3 d=normalize(vec3(dot(ray,viewMatrix[0].xyz),dot(ray,viewMatrix[1].xyz),dot(ray,viewMatrix[2].xyz)));
 vec2 uv=skyUV(d);uv.x=fract(uv.x+sin(time*.00086)*.012);vec3 c=texture2D(skyMap,uv).rgb;
 c+=vec3(.29,.41,.55)*flash*(.12+1.05*pow(max(0.,dot(d,normalize(vec3(.33,.38,-1.)))),7.))*(.36+clamp(c.g*17.,0.,1.55));gl_FragColor=vec4(c,1.);}`,
});
const sky = new T.Mesh(screenTriangle, skyMat);
sky.onBeforeRender = (r, world, lens) => {
  r.getCurrentViewport(skyMat.uniforms.skyViewport.value);
  const m = lens.projectionMatrix.elements;
  skyMat.uniforms.lensTangent.value.set(1 / m[0], 1 / m[5]);
};
sky.frustumCulled = false;
sky.renderOrder = -1000;
scene.add(sky);
// The reflection probe includes the luminous apertures of the floodlight banks.
const probeScene = new T.Scene(),
  probeMat = new T.ShaderMaterial({
    side: T.BackSide,
    uniforms: { clouds: { value: skyRT.texture } },
    vertexShader:
      "varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:
      `varying vec3 d;uniform sampler2D clouds;` +
      skyRead +
      `
 float softbox(vec3 r,vec3 centre,vec2 span){
   vec3 f=normalize(centre),right=normalize(cross(vec3(0.,1.,0.),f)),up=cross(f,right);
   float z=dot(r,f);vec2 xy=abs(vec2(dot(r,right),dot(r,up))/max(z,.01));
   return step(.25,z)*(1.-smoothstep(span.x*.79,span.x,xy.x))*(1.-smoothstep(span.y*.79,span.y,xy.y));
 }
 void main(){vec3 r=normalize(d);vec3 col=texture2D(clouds,skyUV(r)).rgb*1.25+vec3(.014,.023,.032);
 col+=vec3(1.28,1.66,2.03)*softbox(r,vec3(-.72,.9,.91),vec2(.49,.20));
 col+=vec3(.93,1.24,1.48)*softbox(r,vec3(.79,.37,.67),vec2(.17,.65));
 col+=vec3(3.14,1.66,.68)*softbox(r,vec3(.71,.44,-.81),vec2(.49,.13));
 col+=vec3(.46,.65,.78)*softbox(r,vec3(-1.,.01,-.26),vec2(.67,.077));
 col+=vec3(.25,.37,.46)*softbox(r,vec3(.10,.97,.09),vec2(.83,.38));
 gl_FragColor=vec4(col,1.);}`,
  });
probeScene.add(new T.Mesh(new T.BoxGeometry(26, 26, 26), probeMat));
const pmrem = new T.PMREMGenerator(renderer),
  probeRT = pmrem.fromScene(probeScene, 0, 0.2, 50);
scene.environment = probeRT.texture;
pmrem.dispose();
probeMat.dispose();
const hemi = new T.HemisphereLight(0xb8d3f0, 0x243243, 0.78);
scene.add(hemi);
function sun(color, intensity, from, to) {
  let d = new T.DirectionalLight(color, intensity);
  d.position.copy(V(...from));
  d.target.position.copy(V(...to));
  scene.add(d, d.target);
  return d;
}
const key = sun(0xc9e1f3, 1.54, [-48, 102, 74], [0, 39, 0]);
key.castShadow = true;
key.shadow.mapSize.set(3072, 3072);
Object.assign(key.shadow.camera, { left: -48, right: 48, top: 48, bottom: -45, near: 1, far: 200 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.normalBias = 0.064;
key.shadow.bias = -0.00011;
const sodium = sun(0xffb276, 2.72, [51, 69, -85], [0, 42, 0]),
  fillLight = sun(0xaccbe0, 0.53, [51, 68, 36], [0, 47, 0]);
sodium.castShadow = true;
sodium.shadow.mapSize.set(2048, 2048);
Object.assign(sodium.shadow.camera, { left: -46, right: 46, top: 45, bottom: -45, near: 1, far: 212 });
sodium.shadow.camera.updateProjectionMatrix();
sodium.shadow.bias = -0.00014;
sodium.shadow.normalBias = 0.071;
sun(0x9fc5e0, 1.42, [-59, 51, -56], [0, 44, 0]);
const lightningLight = sun(0xc9dfff, 0, [38, 91, -65], [0, 40, 0]);
renderer.shadowMap.needsUpdate = true;
function oceanNoiseTexture() {
  const n = 512,
    d = new Uint8Array(n * n * 4),
    waves = [],
    fieldX = new Float32Array(47 * 47),
    fieldY = new Float32Array(47 * 47);
  for (let i = 0; i < 47 * 47; i++) {
    fieldX[i] = 0.13 + 0.74 * rand();
    fieldY[i] = 0.13 + 0.74 * rand();
  }
  for (let k = 0; k < 13; k++) {
    let fx = Math.round(between(-5, 6)),
      fy = Math.round(between(3, 15));
    waves.push([fx, fy, rand() * TAU, between(0.055, 0.15)]);
  }
  const radius = (u, v, scale) => {
    let xx = u * scale,
      yy = v * scale,
      ix = Math.floor(xx),
      iy = Math.floor(yy),
      dx = xx - ix,
      dy = yy - iy,
      a = 22,
      b = 23;
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        let i = ((ix + x + scale * 3) % scale) + ((iy + y + scale * 3) % scale) * 47;
        let qx = x + fieldX[i] - dx,
          qy = y + fieldY[i] - dy,
          dd = qx * qx + qy * qy;
        if (dd < a) {
          b = a;
          a = dd;
        } else if (dd < b) b = dd;
      }
    return Math.sqrt(b) - Math.sqrt(a);
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let u = x / n,
        v = y / n,
        warp = n4(u, v) * 0.132 + n8(u * 2, v * 2) * 0.028,
        nu = u + warp,
        nv = v + warp * 0.61 + 0.062 * n8(v, u),
        sx = 0,
        sy = 0;
      for (let [fx, fy, ph, amp] of waves) {
        let wave = (fx * nu + fy * nv) * TAU + ph,
          val = amp * (Math.cos(wave) - 0.21 * Math.cos(2 * wave));
        sx += (val * fx) / 8;
        sy += (val * fy) / 10;
      }
      let cells = radius(nu, nv, 22),
        fine = radius(nu + 0.123, nv + 0.345, 45),
        foam = Math.exp(-cells * cells * 55) * 0.65 + Math.exp(-fine * fine * 89) * 0.35;
      let i = (y * n + x) * 4;
      d[i] = clamp(0.5 + sx * 0.64, 0, 1) * 255;
      d[i + 1] = clamp(0.5 + sy * 0.49, 0, 1) * 255;
      d[i + 2] = Math.min(1, foam * (0.63 + 0.71 * n21(u, v))) * 255;
      d[i + 3] =
        clamp(n4(u + 0.12, v + 0.27) * 0.35 + n8(u, v) * 0.31 + n21(u, v) * 0.24 + n63(u, v) * 0.1, 0, 1) *
        255;
    }
  const t = new T.DataTexture(d, n, n);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.magFilter = T.LinearFilter;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}
const seaDetail = oceanNoiseTexture();
const waveGL = `
float swell(vec2 p,float t){
 float a=dot(p,vec2(.076,.256))+t*1.13+.49*sin(p.x*.044+p.y*.019);
 float b=dot(p,vec2(-.155,.412))+t*1.47+.32*sin(p.x*.062);
 float c=dot(p,vec2(.308,-.177))-t*.93;
 float d=dot(p,vec2(.413,.573))+t*1.76;
 return .91*sin(a)-.21*cos(2.*a)+.53*sin(b)-.095*cos(2.*b)+.29*sin(c)+.14*sin(d);
}
vec2 swellSlope(vec2 p,float t){
 float a=dot(p,vec2(.076,.256))+t*1.13+.49*sin(p.x*.044+p.y*.019);
 float b=dot(p,vec2(-.155,.412))+t*1.47+.32*sin(p.x*.062);
 float c=dot(p,vec2(.308,-.177))-t*.93,d=dot(p,vec2(.413,.573))+t*1.76;
 return (.91*cos(a)+.42*sin(2.*a))*(vec2(.076,.256)+.49*cos(p.x*.044+p.y*.019)*vec2(.044,.019))+
 (.53*cos(b)+.19*sin(2.*b))*(vec2(-.155,.412)+vec2(.01984*cos(p.x*.062),0.))+
 .29*cos(c)*vec2(.308,-.177)+.14*cos(d)*vec2(.413,.573);
}`;
const waterRT = new T.WebGLRenderTarget(800, 450, {
  type: rtFormat,
  minFilter: T.LinearFilter,
  magFilter: T.LinearFilter,
  depthBuffer: true,
});
const waterMirror = new T.PerspectiveCamera(),
  mirrorProjection = new T.Matrix4();
const nr = reflections.length;
const waterUniforms = {
  time: clockUniform,
  eye: { value: camera.position },
  optics: { value: skyRT.texture },
  normalSheet: { value: seaDetail },
  surfaceReflection: { value: waterRT.texture },
  mirrorProjection: { value: mirrorProjection },
  flash: lightningU,
  breaker: { value: 0 },
  portLamps: { value: reflections.map((r) => r.p) },
  portColors: { value: reflections.map((r) => r.c) },
  portSpread: { value: reflections.map((r) => r.spread) },
};
const seaMat = new T.ShaderMaterial({
  uniforms: waterUniforms,
  vertexShader:
    `
uniform float time,breaker;uniform mat4 mirrorProjection;varying vec3 wPos;varying vec4 reflectedUV;varying float waveHeight;
` +
    waveGL +
    `
void main(){vec2 p=position.xz;float nearLeg=exp(-min(length(p-vec2(13.4,.7)),length(p-vec2(-13.5,-.72)))*.091);
 float wave=swell(p,time)+nearLeg*.22*sin(length(p)*.64-time*1.6);
 wPos=vec3(p.x,12.+wave,p.y);wPos.y+=breaker*nearLeg*(1.+.77*sin(.31*p.y+time));
 waveHeight=wave;reflectedUV=mirrorProjection*vec4(p.x,12.,p.y,1.);gl_Position=projectionMatrix*viewMatrix*vec4(wPos,1.);
}`,
  fragmentShader:
    `
uniform sampler2D surfaceReflection,normalSheet,optics;uniform float time,flash,breaker;uniform vec3 eye;
uniform vec3 portLamps[` +
    nr +
    `],portColors[` +
    nr +
    `];uniform float portSpread[` +
    nr +
    `];
varying vec3 wPos;varying vec4 reflectedUV;varying float waveHeight;
` +
    waveGL +
    skyRead +
    `
float wake(vec2 q,float t,float n){
 q*=vec2(.94,.78);float d=length(q);
 float behind=clamp(q.y*.13,0.,1.);float f=1.-smoothstep(2.,9.9+2.*behind+breaker*3.,d);
 float streak=.5+.5*sin(d*2.32-t*2.66+n*7.+q.x*.29);
 return f*(.48+.57*streak);
}
void main(){vec2 p=wPos.xz;vec3 E=eye-wPos;float dist=length(E);E/=dist;
 vec2 uv1=p*.084+vec2(.009,.041)*time;vec2 uv2=mat2(.87,.49,-.49,.87)*p*.164+vec2(-.028,.039)*time;
 vec4 n1=texture2D(normalSheet,uv1),n2=texture2D(normalSheet,uv2);
 vec4 longNoise=texture2D(normalSheet,p*.024+vec2(.003,.012)*time);
 vec2 slopes=swellSlope(p,time);
 vec2 capillary=(n1.rg-.5)*.61+(n2.rg-.5)*.37;
 vec2 rainCell=p*2.48,ic=floor(rainCell),fc=fract(rainCell);
 vec2 rseed=fract(sin(vec2(dot(ic,vec2(19.27,75.23)),dot(ic,vec2(93.7,31.9))))*43758.5453);
 vec2 drop=fc-(rseed*.70+.15);float dlen=max(.0001,length(drop));float life=fract(time*1.67+rseed.x*7.6);
 float ripple=sin((dlen-life*.82)*62.)*exp(-abs(dlen-life*.42)*19.)*(1.-life)*.072;
 slopes-=drop/dlen*ripple*(1.-smoothstep(20.,102.,dist));
 vec2 micro=texture2D(normalSheet,p*.51+vec2(time*.024,time*.058)).rg-.5;
 slopes+=capillary+.15*micro;
 vec3 N=normalize(vec3(-slopes.x,1.,-slopes.y));vec3 R=reflect(-E,N);
 float facing=clamp(dot(N,E),.0,1.0),fres=.065+.935*pow(1.-facing,4.5);
 vec3 dark=mix(vec3(.004,.018,.027),vec3(.018,.06,.077),smoothstep(-1.3,1.62,waveHeight)*.72);
 vec2 coord=reflectedUV.xy/reflectedUV.w*.5+.5;
 vec2 lateral=vec2(viewMatrix[0][0],viewMatrix[2][0]);
 vec2 warp=vec2(dot(slopes,lateral),slopes.y*.81+slopes.x*.28)*(clamp(84./dist,.24,1.7)*.068);
 coord+=warp;
 vec3 refl=texture2D(surfaceReflection,clamp(coord,.002,.998)).rgb;
 refl=.64*refl+.20*texture2D(surfaceReflection,clamp(coord+capillary*.018,.002,.998)).rgb+.16*texture2D(surfaceReflection,clamp(coord-capillary*.025,.002,.998)).rgb;
 float edgeFade=smoothstep(-.012,.025,min(min(coord.x,coord.y),min(1.-coord.x,1.-coord.y)));
 vec3 ambient=texture2D(optics,skyUV(R)).rgb;
 refl=mix(ambient,refl,edgeFade);
 vec3 water=dark*(.57+.38*max(N.y,0.))+refl*(.39+.72*fres);
 float moonSpec=pow(max(0.,dot(R,normalize(vec3(-.43,.36,-.81)))),72.);
 water+=vec3(.24,.37,.52)*moonSpec;
 for(int i=0;i<` +
    nr +
    `;i++){
  vec3 delta=portLamps[i]-wPos;float len=length(delta);vec3 L=delta/len;
  float align=max(0.,dot(R,L));float lobe=pow(align,196./portSpread[i]);
  float small=pow(align,745.);water+=portColors[i]*(lobe*.32+small*1.37)/(1.+len*len*.000105);
 }
 vec3 core=normalize(vec3(0.,56.2,7.)-wPos);
 water+=vec3(1.24,.40,.066)*pow(max(0.,dot(R,core)),155.)*exp(-abs(p.x)*.048);
 float foamField=longNoise.a*.6+n1.a*.4;
 float wakeA=wake(p-vec2(13.48,.77),time,foamField)+wake(p-vec2(-13.44,-.58),time+.6,foamField);
 float shore=1.-smoothstep(.2,5.5,abs(p.y+61.42));
 float crest=smoothstep(1.15,1.73,waveHeight+(foamField-.47)*2.8);
 float foamBase=clamp(crest*.83+wakeA*.98+shore*(.3+.58*n2.a),0.,1.);
 vec4 fineBubbles=texture2D(normalSheet,p*.395+vec2(-.051,.075)*time);
 float lace=n1.b*.16+longNoise.b*.06+n2.b*.33+fineBubbles.b*.45;
 float density=clamp((n1.a-.35)*1.65+(longNoise.a-.46)*.80,0.,1.);
 float foam=smoothstep(.31,.84,foamBase*.85+lace*.49+density*.27+(foamField-.52)*.79);
 foam*=clamp(wakeA*1.99+shore*1.4+crest*1.43,0.,1.);
 vec3 froth=mix(vec3(.18,.265,.277),vec3(.66,.78,.79),clamp(lace*.71+density*.41+foamField*.19,0.,1.));
 froth+=vec3(.17,.13,.065)*shore;water=mix(water,froth,foam*.87*(1.-.62*smoothstep(81.,270.,dist)));
 water+=vec3(.10,.15,.19)*flash;
 float fog=1.-exp(-dist*dist*.000010);water=mix(water,vec3(.031,.048,.061),fog*.91);
 gl_FragColor=vec4(water,1.);
}`,
});
function seaGrid() {
  let n = 302,
    ps = [],
    idx = [];
  function spacing(u) {
    let a = Math.abs(u);
    return (
      Math.sign(u) * (a <= 0.8 ? a * 182 : 145.6 + Math.pow((a - 0.8) / 0.2, 2.45) * 1620 + (a - 0.8) * 184)
    );
  }
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      ps.push(spacing((i / n) * 2 - 1), 0, spacing((j / n) * 2 - 1));
      if (i && j) {
        let a = j * (n + 1) + i;
        idx.push(a - n - 2, a - 1, a, a - n - 2, a, a - n - 1);
      }
    }
  let g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(ps, 3));
  g.setIndex(idx);
  return g;
}
const sea = new T.Mesh(seaGrid(), seaMat);
sea.frustumCulled = false;
scene.add(sea);
