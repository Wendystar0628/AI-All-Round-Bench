(() => {
  'use strict';

  const canvas = document.getElementById('cinema');
  const gl = canvas.getContext('webgl2', {
    antialias: true, alpha: false, depth: true, stencil: false,
    powerPreference: 'high-performance', premultipliedAlpha: false
  });
  if (!gl) {
    document.getElementById('fallback').style.display = 'grid';
    return;
  }

  const DURATION = 76;
  const TAU = Math.PI * 2;
  const loopAngle = t => t * TAU / DURATION;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const pulse = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x));
  const fract = x => x - Math.floor(x);
  const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);

  const C = {
    shell: [0.32, 0.42, 0.48, 1], shell2: [0.18, 0.27, 0.34, 1],
    edge: [0.76, 0.48, 0.18, 1], dark: [0.025, 0.07, 0.105, 1],
    cyan: [0.12, 0.92, 1.0, 1], blue: [0.08, 0.38, 1.0, 0.8],
    white: [0.78, 0.98, 1, 1], amber: [1.0, 0.48, 0.12, 1],
    rock: [0.27, 0.23, 0.24, 1], rockLit: [0.48, 0.37, 0.28, 1],
    red: [1.0, 0.14, 0.06, 1], shield: [0.14, 0.72, 1.0, 0.24]
  };

  function shader(type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const cubeVS = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal;
  layout(location=2) in vec3 iPos; layout(location=3) in vec3 iScale;
  layout(location=4) in vec4 iColor; layout(location=5) in float iGlow;
  layout(location=6) in vec3 iRot;
  uniform mat4 uVP; uniform vec3 uCamera;
  out vec3 vWorld; out vec3 vNormal; out vec3 vVoxel; out vec4 vColor;
  out float vGlow; out vec3 vView;
  mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1,0,0,0,c,s,0,-s,c);}
  mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0,-s,0,1,0,s,0,c);}
  mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0,-s,c,0,0,0,1);}
  void main(){
    mat3 r=rz(iRot.z)*ry(iRot.y)*rx(iRot.x);
    vec3 local=aPos*iScale; vec3 world=iPos+r*local;
    vWorld=world; vNormal=normalize(r*aNormal); vVoxel=(aPos+.5)*iScale;
    vColor=iColor; vGlow=iGlow; vView=uCamera-world;
    gl_Position=uVP*vec4(world,1.0);
  }`;
  const cubeFS = `#version 300 es
  precision highp float;
  in vec3 vWorld; in vec3 vNormal; in vec3 vVoxel; in vec4 vColor;
  in float vGlow; in vec3 vView;
  layout(location=0) out vec4 oColor; layout(location=1) out vec4 oBloom;
  uniform float uTime;
  void main(){
    vec3 n=normalize(vNormal), v=normalize(vView);
    vec3 ld=normalize(vec3(-.48,.72,-.52));
    float dif=max(dot(n,ld),0.0), rim=pow(1.0-max(dot(n,v),0.0),3.0);
    vec3 av=abs(n); vec2 q = av.x>.8?vVoxel.yz:(av.y>.8?vVoxel.xz:vVoxel.xy);
    vec2 fw=fwidth(q)*.65; vec2 g=smoothstep(vec2(.43)-fw,vec2(.492)+fw,abs(fract(q)-.5));
    float grid=max(g.x,g.y);
    float edge=pow(1.0-max(abs(dot(n,v)),0.0),5.0);
    vec3 lit=vColor.rgb*(.15+dif*.86)+vec3(.05,.13,.18)*(.35+rim*.5);
    lit*=1.0-grid*.28; lit+=vec3(.62,.83,.92)*edge*.24;
    vec3 hv=normalize(ld+v);float nh=max(dot(n,hv),0.0);
    float lum=dot(vColor.rgb,vec3(.299,.587,.114));
    float solid=(1.0-clamp(vGlow,0.0,1.0))*smoothstep(.10,.34,lum);
    float amberMat=smoothstep(.18,.52,vColor.r-vColor.b);
    float broadSpec=pow(nh,13.0)*solid*(.16+.25*lum);
    float edgeSpec=pow(nh,42.0)*solid*amberMat*.72;
    lit+=vec3(.32,.55,.68)*broadSpec+vec3(1.0,.68,.30)*edgeSpec;
    float shimmer=.94+.06*sin(uTime*2.9762457+vWorld.z*.13+vWorld.x*.07);
    vec3 col=mix(lit,vColor.rgb*(1.35+vGlow*.75)*shimmer,clamp(vGlow,0.0,1.0));
    oColor=vec4(col,vColor.a);
    float b=max(max(col.r,col.g),col.b)*(.22+vGlow*1.25);
    oBloom=vec4(col*b,clamp(vColor.a*(.4+vGlow),0.0,1.0));
  }`;
  const bgVS = `#version 300 es
  precision highp float; out vec2 vUv;
  void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p*.5;gl_Position=vec4(p*2.-1.,0,1);}`;
  const bgFS = `#version 300 es
  precision highp float; in vec2 vUv;
  layout(location=0) out vec4 oColor; layout(location=1) out vec4 oBloom;
  uniform vec2 uResolution; uniform float uTime; uniform float uScene;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
  void main(){
    vec2 uv=vUv; vec2 p=(uv-.5)*vec2(uResolution.x/uResolution.y,1.0);
    float n=noise(p*2.2+vec2(.3,-.2))+noise(p*5.1)*.35;
    float broad=noise(p*1.05+vec2(-.4,.15));
    float band=exp(-pow(abs(p.y+.18*sin(p.x*1.8)-.08),2.0)*5.0);
    float wisp=exp(-pow(abs(p.y-.28*sin(p.x*1.25+.8)+.17),2.0)*12.0);
    vec3 col=mix(vec3(.003,.008,.022),vec3(.018,.055,.085),n*.42);
    col+=vec3(.032,.13,.19)*band*(.25+.48*n);
    col+=vec3(.055,.035,.12)*wisp*(.10+.34*broad);
    col+=vec3(.14,.038,.13)*exp(-dot(p-vec2(-.58,.36),p-vec2(-.58,.36))*2.7)*.30;
    float loopPhase=uTime*.08267349;
    vec2 starDrift=sin(loopPhase)*vec2(.0004234,-.0001451);
    vec2 starUv=(uv+starDrift)*vec2(310.,175.);
    vec2 cell=floor(starUv); vec2 sp=fract(starUv)-.5;
    float s=h(cell); float star=step(.9925,s)*pow(s,18.0)*(1.0-smoothstep(.04,.24,length(sp)));
    float interior=step(.5,uScene)*(1.0-step(4.5,uScene));
    vec2 pc=p-vec2(-.92,.52);float pd=length(pc),pr=.70;
    float planet=1.0-smoothstep(-.012,.018,pd-pr);
    float rim=1.0-smoothstep(0.0,.045,abs(pd-pr));
    float halo=1.0-smoothstep(.015,.14,abs(pd-pr));
    float day=smoothstep(-.34,.38,-pc.x*.66-pc.y*.28);
    vec3 planetCol=mix(vec3(.010,.026,.052),vec3(.052,.12,.16),day);
    col=mix(col,planetCol,planet*.78*(1.0-interior)); col+=vec3(.10,.42,.60)*(rim*.88+halo*.18)*(1.0-interior);
    col=mix(col,vec3(.003,.009,.013)+vec3(.008,.022,.028)*n,interior*.88);
    star*=mix(1.0,.28,interior); col+=mix(vec3(.3,.65,1),vec3(1,.75,.48),h(cell+7.))*star*2.4;
    oColor=vec4(col,1); oBloom=vec4(col*.12+star,1);
  }`;
  const blurFS = `#version 300 es
  precision highp float; in vec2 vUv; out vec4 outColor;
  uniform sampler2D uTex; uniform vec2 uDir;
  void main(){vec2 t=1./vec2(textureSize(uTex,0));vec4 c=texture(uTex,vUv)*.227;
  c+=texture(uTex,vUv+uDir*t*1.384)*.316;c+=texture(uTex,vUv-uDir*t*1.384)*.316;
  c+=texture(uTex,vUv+uDir*t*3.231)*.070;c+=texture(uTex,vUv-uDir*t*3.231)*.070;outColor=c;}`;
  const compositeFS = `#version 300 es
  precision highp float; in vec2 vUv; out vec4 outColor;
  uniform sampler2D uSceneTex; uniform sampler2D uBloomTex; uniform vec2 uResolution;
  void main(){vec3 c=texture(uSceneTex,vUv).rgb;vec3 b=texture(uBloomTex,vUv).rgb;
  c+=b*.82; c=1.-exp(-c*1.16); c=pow(c,vec3(.86));
  vec2 q=vUv*(1.-vUv);float vig=pow(clamp(q.x*q.y*18.,0.,1.),.16);c*=mix(.62,1.,vig);
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);c+=(grain-.5)/255.;
  outColor=vec4(c,1);}`;

  const cubeProgram = program(cubeVS, cubeFS), bgProgram = program(bgVS, bgFS);
  const blurProgram = program(bgVS, blurFS), compositeProgram = program(bgVS, compositeFS);

  const cubeVerts = new Float32Array([
    -.5,-.5,.5, 0,0,1, .5,-.5,.5,0,0,1, .5,.5,.5,0,0,1, -.5,-.5,.5,0,0,1, .5,.5,.5,0,0,1, -.5,.5,.5,0,0,1,
    .5,-.5,-.5,0,0,-1, -.5,-.5,-.5,0,0,-1, -.5,.5,-.5,0,0,-1, .5,-.5,-.5,0,0,-1, -.5,.5,-.5,0,0,-1, .5,.5,-.5,0,0,-1,
    -.5,-.5,-.5,-1,0,0, -.5,-.5,.5,-1,0,0, -.5,.5,.5,-1,0,0, -.5,-.5,-.5,-1,0,0, -.5,.5,.5,-1,0,0, -.5,.5,-.5,-1,0,0,
    .5,-.5,.5,1,0,0, .5,-.5,-.5,1,0,0, .5,.5,-.5,1,0,0, .5,-.5,.5,1,0,0, .5,.5,-.5,1,0,0, .5,.5,.5,1,0,0,
    -.5,.5,.5,0,1,0, .5,.5,.5,0,1,0, .5,.5,-.5,0,1,0, -.5,.5,.5,0,1,0, .5,.5,-.5,0,1,0, -.5,.5,-.5,0,1,0,
    -.5,-.5,-.5,0,-1,0, .5,-.5,-.5,0,-1,0, .5,-.5,.5,0,-1,0, -.5,-.5,-.5,0,-1,0, .5,-.5,.5,0,-1,0, -.5,-.5,.5,0,-1,0
  ]);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const cubeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.bufferData(gl.ARRAY_BUFFER, cubeVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  const instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  const stride = 14 * 4;
  [3,3,4,1,3].forEach((n,j)=>{const loc=2+j, off=[0,3,6,10,11][j]*4; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,n,gl.FLOAT,false,stride,off); gl.vertexAttribDivisor(loc,1);});
  gl.bindVertexArray(null);

  let sceneFbo, sceneTex, brightTex, depthBuf, pingFbo = [], pingTex = [], rw = 1, rh = 1;
  function texture(w,h,linear=true){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);return t;}
  function target(){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);return f;}
  function resize(){
    const dpr=Math.min(window.devicePixelRatio||1,1.5), w=Math.min(3840,Math.max(2,Math.floor(innerWidth*dpr))), h=Math.min(2160,Math.max(2,Math.floor(innerHeight*dpr)));
    if(w===rw&&h===rh)return;rw=canvas.width=w;rh=canvas.height=h;
    [sceneTex,brightTex,...pingTex].forEach(t=>t&&gl.deleteTexture(t));[sceneFbo,...pingFbo].forEach(f=>f&&gl.deleteFramebuffer(f));if(depthBuf)gl.deleteRenderbuffer(depthBuf);
    sceneFbo=target();sceneTex=texture(w,h);brightTex=texture(w,h);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sceneTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,brightTex,0);
    depthBuf=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depthBuf);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthBuf);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    for(let i=0;i<2;i++){pingFbo[i]=target();pingTex[i]=texture(Math.max(1,w>>1),Math.max(1,h>>1));gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pingTex[i],0);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }

  const V3 = {
    sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    norm:a=>{const l=Math.hypot(...a)||1;return[a[0]/l,a[1]/l,a[2]/l];}, lerp:(a,b,t)=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)]
  };
  function perspective(fov,asp,n,f){const q=1/Math.tan(fov/2),nf=1/(n-f);return new Float32Array([q/asp,0,0,0,0,q,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0]);}
  function lookAt(e,c,u=[0,1,0]){const z=V3.norm(V3.sub(e,c)),x=V3.norm(V3.cross(u,z)),y=V3.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1]);}
  function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}

  let opaque=[], glow=[];
  function add(list,p,s,c,g=0,r=[0,0,0]){list.push(p[0],p[1],p[2],Math.max(.035,s[0]),Math.max(.035,s[1]),Math.max(.035,s[2]),c[0],c[1],c[2],c[3]??1,g,r[0],r[1],r[2]);}
  const box=(p,s,c=C.shell,g=0,r=[0,0,0])=>add(opaque,p,s,c,g,r);
  const light=(p,s,c=C.cyan,g=1,r=[0,0,0])=>add(glow,p,s,c,g,r);
  function line(a,b,w,c=C.cyan,g=1,list=glow){const d=V3.sub(b,a),l=Math.hypot(...d),m=V3.lerp(a,b,.5),rx=-Math.asin(d[1]/l),ry=Math.atan2(d[0],d[2]);add(list,m,[w,w,l],c,g,[rx,ry,0]);}
  function dottedLine(a,b,w,c,segments=20,phase=0){for(let i=0;i<segments;i++){if((i+phase)%3===2)continue;const p0=V3.lerp(a,b,i/segments),p1=V3.lerp(a,b,(i+.58)/segments);line(p0,p1,w,c,1);}}

  const at=(o,x=0,y=0,z=0)=>[o[0]+x,o[1]+y,o[2]+z];
  function engine(o,x,y,z,scale=1,boost=1,t=0,phase=0){
    box(at(o,x,y,z),[3.5*scale,3.0*scale,2.0*scale],C.dark);
    box(at(o,x,y,z-.8*scale),[2.5*scale,2.0*scale,.7*scale],C.edge,.1);
    const wave=.94+.06*Math.sin(loopAngle(t)*5+phase), outer=(5.5+boost*6.5)*scale*wave, inner=(4.2+boost*9.2)*scale*wave;
    light(at(o,x,y,z-1.25*scale),[1.8*scale,1.4*scale,.7*scale],C.white,2+boost*.35);
    light(at(o,x,y,z-2.0*scale-outer*.5),[1.45*scale,1.05*scale,outer],C.cyan,1.55+boost*.28);
    light(at(o,x,y,z-2.0*scale-inner*.52),[.62*scale,.48*scale,inner],C.white,2.15+boost*.55);
  }
  function turret(o,x,y,z,side=1,active=0){
    const hot=clamp(active);
    box(at(o,x,y,z),[2.4,1.2,2.8],C.shell2); box(at(o,x,y+.8,z+.25),[1.35,.65,1.7],C.edge);
    box(at(o,x-.55,y+1.05,z+1.8),[.42,.42,2.7],C.dark); box(at(o,x+.55,y+1.05,z+1.8),[.42,.42,2.7],C.dark);
    light(at(o,x,y+1.05,z+3.22),[.7+hot*.45,.45+hot*.22,.5+hot*.38],hot>.04?C.amber:C.blue,.45+hot*1.85);
  }

  function flagship(o=[0,0,0],boost=0,t=0,detail=1){
    const loop=loopAngle(t);
    /* long stepped inner keel and alternating armor bays */
    box(at(o,0,-1,-1),[14,8,104],C.dark);
    for(let i=0;i<14;i++){
      const z=-52+i*7.8, k=1-Math.abs(i-7)/10, w=13+8*k, h=4.2+2.7*k;
      box(at(o,0,0,z),[w*1.35,h*1.15,6.8],i%3===1?C.shell2:C.shell);
      box(at(o,-w*.78,1.2,z+.4),[w*.42,2.4,7.8],C.shell2,0,[0,.035,0]);
      box(at(o,w*.78,1.2,z+.4),[w*.42,2.4,7.8],C.shell2,0,[0,-.035,0]);
      box(at(o,0,h*.72+1,z-.4),[w*.72,1.4,5.6],i%2?C.shell:C.shell2);
      box(at(o,0,-h*.68-1,z+.5),[w*.62,1.2,5.3],C.shell2);
      if(i%2===0){
        box(at(o,-w*.93,-2,z),[1.1,6.4,5.3],C.edge); box(at(o,w*.93,-2,z),[1.1,6.4,5.3],C.edge);
        light(at(o,-w*.96,.8,z-2.7),[.38,.38,3.2],C.cyan,.8); light(at(o,w*.96,.8,z-2.7),[.38,.38,3.2],C.cyan,.8);
      }
    }
    /* dorsal stepped citadel */
    for(let i=0;i<7;i++){
      const z=-31+i*10;
      box(at(o,0,6.0+(i%2)*.8,z),[10-i*.35,3.4,7.2],i%2?C.shell2:C.shell);
      box(at(o,0,8.1+(i%2)*.8,z-.6),[5.6,1.2,4.8],C.edge);
      light(at(o,0,8.8+(i%2)*.8,z+1.1),[3.8,.25,.48],C.cyan,.9);
    }
    /* ventral ribs and structural gaps */
    for(let z=-43;z<37;z+=10){
      box(at(o,-8,-7,z),[1.2,4.8,1.3],C.edge,0,[0,0,-.24]); box(at(o,8,-7,z),[1.2,4.8,1.3],C.edge,0,[0,0,.24]);
      box(at(o,0,-8.7,z),[15,1.0,1.4],C.shell2);
    }
    /* forked armored prow and the huge central beam weapon */
    for(let i=0;i<5;i++){
      const z=55+i*5.2, sep=10-i*.95;
      box(at(o,-sep,0,z),[9-i*.8,5.5-i*.5,7.0],C.shell,0,[0,.055,0]);
      box(at(o,sep,0,z),[9-i*.8,5.5-i*.5,7.0],C.shell,0,[0,-.055,0]);
      box(at(o,-sep,3.5,z-1),[6-i*.5,1.2,5.2],C.shell2); box(at(o,sep,3.5,z-1),[6-i*.5,1.2,5.2],C.shell2);
    }
    box(at(o,0,-.4,49),[10,7.5,12],C.edge); box(at(o,0,-.4,56),[7.2,5.0,10],C.dark);
    box(at(o,0,-.4,64),[4.8,3.2,12],C.shell2); box(at(o,0,-.4,71),[3.6,2.6,3.4],C.dark);
    light(at(o,0,-.4,72.8),[2.4,1.65,.9],C.cyan,1.5);
    for(let z=50;z<70;z+=4.3) light(at(o,0,1.4,z),[3.1,.25,2.4],C.blue,.7);
    /* enormous side hangar mouth with receding luminous bays */
    box(at(o,21,-1,-18),[2.0,10,25],C.dark); box(at(o,22.1,4.8,-18),[1.1,1.1,27],C.edge);
    box(at(o,22.1,-6.0,-18),[1.1,1.1,27],C.edge);
    for(let z=-28;z<-7;z+=5) light(at(o,22.7,-3.7,z),[.25,.25,2.1],C.cyan,.8);
    /* distributed pulse turrets */
    if(detail){let ti=0;for(let z=-38;z<40;z+=13){const left=pulse(51.45+ti*.08,51.78+ti*.08,56.65+ti*.04,57.25+ti*.04,t),right=pulse(51.58+ti*.08,51.91+ti*.08,56.78+ti*.04,57.38+ti*.04,t);turret(o,-10,7.2,z,-1,left);turret(o,10,7.2,z,1,right);ti++;}}
    /* layered stern and seven visibly recessed engines */
    box(at(o,0,0,-58),[28,12,7],C.shell2); box(at(o,0,0,-62),[23,10,4],C.dark);
    const e=[[-8,2],[-4,3],[0,3],[4,3],[8,2],[-5,-3.2],[5,-3.2]];
    e.forEach((q,i)=>engine(o,q[0],q[1],-64,1,boost,t,i*.82));
    /* navigation skiffs trace the hull */
    skiff(at(o,25+Math.sin(loop*10)*2,3,-5+Math.sin(loop*6+1.1)*3.5),.9,1.0);
    skiff(at(o,-21,8,-24+Math.sin(loop*7+.4)*8),.75,.8);
    skiff(at(o,16,-9,30+Math.cos(loop*8+.7)*5),.7,.8);
  }

  function guard(o,boost=0,phase=0,weapon=0,t=0){
    box(at(o,0,0,0),[6.8,4.4,15],C.dark); box(at(o,0,.4,1),[7.7,3.8,10.5],C.shell);
    box(at(o,0,2.6,-1),[4.8,1.3,7.5],C.shell2); box(at(o,-4,0,-1),[3.3,2.6,7.2],C.shell2); box(at(o,4,0,-1),[3.3,2.6,7.2],C.shell2);
    box(at(o,-2.4,0,8),[2.5,2.1,4.2],C.shell,0,[0,.1,0]); box(at(o,2.4,0,8),[2.5,2.1,4.2],C.shell,0,[0,-.1,0]);
    light(at(o,0,1.5,5),[3.2,.25,3.8],C.cyan,.6);
    for(let x of [-2.4,2.4]){box(at(o,x,3.15,1),[1.45,.8,2.0],C.edge);box(at(o,x,3.5,3),[.32,.32,3.0],C.dark);if(weapon)light(at(o,x,3.5,4.6),[.5,.5,.6],C.amber,2);}
    engine(o,-2,0,-8,0.56,boost,t,phase*.47); engine(o,2,0,-8,.56,boost,t,phase*.47+1.1);
  }
  function vanguard(o,boost=0,phase=0,weapon=0,t=0){
    box(at(o,0,0,-1),[4.5,3.3,20],C.dark); box(at(o,0,.4,1),[5.2,2.8,15],C.shell);
    box(at(o,-5,0,0),[5.8,1.8,11],C.shell2,0,[0,.12,-.05]); box(at(o,5,0,0),[5.8,1.8,11],C.shell2,0,[0,-.12,.05]);
    box(at(o,-2.2,0,11),[2.1,2.0,5.8],C.shell,0,[0,.08,0]); box(at(o,2.2,0,11),[2.1,2.0,5.8],C.shell,0,[0,-.08,0]);
    for(let z=-3;z<7;z+=3.1){box(at(o,-6.8,1.2,z),[2.0,1.3,2.0],C.edge);box(at(o,6.8,1.2,z),[2.0,1.3,2.0],C.edge);light(at(o,-6.8,1.3,z+1.05),[1.15,.55,.35],weapon?C.amber:C.blue,weapon?1.7:.4);light(at(o,6.8,1.3,z+1.05),[1.15,.55,.35],weapon?C.amber:C.blue,weapon?1.7:.4);}
    light(at(o,0,2.1,4),[2.5,.22,5],C.cyan,.55); engine(o,0,0,-12,.7,boost,t,phase*.39);
  }
  function skiff(o,s=1,boost=1){
    box(at(o,0,0,0),[1.8*s,1.0*s,3.6*s],C.shell);
    box(at(o,-1.05*s,0,.2*s),[.8*s,.45*s,2.0*s],C.shell2);box(at(o,1.05*s,0,.2*s),[.8*s,.45*s,2.0*s],C.shell2);
    box(at(o,0,.08*s,1.75*s),[1.15*s,.72*s,1.35*s],C.shell);
    box(at(o,-.48*s,0,2.55*s),[.42*s,.34*s,.78*s],C.edge);box(at(o,.48*s,0,2.55*s),[.42*s,.34*s,.78*s],C.edge);
    box(at(o,0,0,-1.85*s),[1.5*s,.78*s,.72*s],C.dark);
    light(at(o,0,.42*s,.62*s),[.72*s,.16*s,1.15*s],C.cyan,.82);
    light(at(o,-1.28*s,.12*s,.15*s),[.24*s,.18*s,.5*s],C.amber,.9);light(at(o,1.28*s,.12*s,.15*s),[.24*s,.18*s,.5*s],C.amber,.9);
    light(at(o,0,0,-2.15*s),[.45*s,.35*s,(1.55+boost*.75)*s],C.cyan,1.35);
  }

  const guardPos=[], vanPos=[];
  for(let i=0;i<16;i++){
    const side=i%2?-1:1, row=Math.floor(i/2);
    guardPos.push([side*(30+(row%3)*11),((row%4)-1.5)*9,-48+row*14]);
  }
  for(let i=0;i<18;i++){
    const side=i%2?-1:1,row=Math.floor(i/2);
    vanPos.push([side*(58+(row%4)*14),((row%5)-2)*11,18+row*19]);
  }
  function stagedBoost(boost,delay=0){
    const cruise=Math.min(boost,.12), surge=clamp((boost-.12)/.88);
    return cruise+.88*clamp(surge*1.16-delay);
  }
  function fleet(t,boost=0,attack=0,shield=0,origin=[0,0,0]){
    const loop=loopAngle(t);
    flagship(origin,stagedBoost(boost),t,1);
    guardPos.forEach((p,i)=>{const row=Math.floor(i/2),drift=Math.sin(loop*3+i)*.8,q=[p[0]*(1+attack*.09),p[1]*(1+attack*.05)+drift,p[2]],thrust=stagedBoost(boost,row*.018);guard(at(origin,q[0],q[1],q[2]),thrust,i,attack,t);if(shield>0)addShield(at(origin,q[0],q[1],q[2]),[7,5,13],clamp(shield-i*.035),false,t,i*.61);});
    vanPos.forEach((p,i)=>{const row=Math.floor(i/2),drift=Math.cos(loop*2+i)*.7,q=[p[0]*(1+attack*.14),p[1]*(1+attack*.07)+drift,p[2]],thrust=stagedBoost(boost,.018+row*.019);vanguard(at(origin,q[0],q[1],q[2]),thrust,i,attack,t);if(shield>0)addShield(at(origin,q[0],q[1],q[2]),[9,5,17],clamp(shield-(i+3)*.025),false,t,i*.47+1.2);});
    if(shield>0)addShield(origin,[27,15,72],clamp(shield+.18),true,t,.3);
  }

  function addShield(o,r,intensity,big=false,t=0,phase=0){
    if(intensity<=.015)return; const c=[.10,.76,1,Math.min(.32,intensity*.26)], n=big?80:32, loop=loopAngle(t);
    for(let i=0;i<n;i++){
      const a=i/n*TAU;
      const sweep=Math.pow(.5+.5*Math.cos(a*3-loop*28-phase),9);
      const pulseA=.62+.18*Math.sin(a*7+loop*25+phase)+sweep*.72;
      for(let ring=0;ring<(big?4:3);ring++){
        const y=ring===0?0:(ring===1?Math.sin(a+phase*.08)*r[1]*.72:(ring===2?Math.cos(a*2+phase*.12)*r[1]*.48:Math.sin(a*3-loop*2)*r[1]*.34));
        const x=Math.cos(a)*r[0],z=Math.sin(a)*r[2];
        light(at(o,x,y,z),[big?.5:.34,big?.5:.34,big?3.7:1.42],c,1.0*pulseA,[0,-a,0]);
      }
    }
    const wave=clamp(intensity*1.4); if(wave<1){const rr=mix(.2,1,wave);for(let i=0;i<n;i+=2){const a=i/n*TAU;light(at(o,Math.cos(a)*r[0]*rr,Math.sin(a*2)*r[1]*.25,Math.sin(a)*r[2]*rr),[.5,.5,1.2],C.white,1.8,[0,-a,0]);}}
  }

  function asteroid(o,r=12,seed=1,split=0,heat=0,drift=0){
    const n=Math.floor(32+r*3.2);
    for(let i=0;i<n;i++){
      const h1=hash(seed*91+i*3.1),h2=hash(seed*47+i*7.7),h3=hash(seed*19+i*11.3);
      const a=h1*TAU; let y=(h2*2-1)*r*.72; const rr=Math.sqrt(Math.max(0,1-y*y/(r*r*.55)))*r*(.45+.5*h3);
      let x=Math.cos(a)*rr,z=Math.sin(a)*rr;
      const grp=Math.floor(hash(i*5.3+seed)*5), dir=[[-1,.15,.15],[1,.25,-.1],[-.2,1,.25],[.15,-.7,.8],[.4,.1,-1]][grp];
      const travel=(split*split+drift*.04)*r*(.45+hash(i+seed)*.7);
      x+=dir[0]*travel;y+=dir[1]*travel;z+=dir[2]*travel;
      const s=1.4+hash(i*13+seed)*2.8;
      const col=heat>0&&hash(i+4)<heat*.42?C.rockLit:(i%4?C.rock:C.shell2);
      const tumble=split+drift*(.06+hash(i*8.1+seed)*.11);
      box(at(o,x,y,z),[s*(.65+hash(i)*.7),s*(.6+hash(i+2)*.75),s*(.7+hash(i+3)*.8)],col,0,[tumble*dir[2],tumble*dir[0],tumble*dir[1]]);
      if(heat>.08&&hash(i*2.1)<heat*.28) light(at(o,x-dir[0]*s*.5,y-dir[1]*s*.5,z-dir[2]*s*.5),[s*.34,s*.24,s*.35],C.amber,1.7);
    }
    /* carved rim around a real central void */
    if(split<.15&&r>9){for(let i=0;i<12;i++){const a=i/12*TAU;box(at(o,Math.cos(a)*r*.42,Math.sin(a)*r*.32,2.2),[2.2,2.2,2.4],C.dark,0,[0,0,a]);}}
    if(heat>.05){const ex=heat*(1-split*.4);light(o,[r*.5*ex,r*.5*ex,r*.5*ex],[1,.32,.08,Math.min(.8,ex)],2.5);}
  }
  function debrisField(t,accelerate=0){
    const loop=loopAngle(t);
    for(let i=0;i<26;i++){
      const x=(hash(i*3)-.5)*220,y=(hash(i*7+2)-.5)*100,z=(hash(i*11+6)-.5)*260+30-accelerate*(15+hash(i)*70);
      const s=.3+hash(i+9)*1.1, spin=loop+hash(i)*TAU;
      box([x,y,z],[s,s*(.5+hash(i)),s],i%4?C.rock:C.rockLit,0,[Math.sin(spin)*.35,Math.cos(spin+hash(i+1)*TAU)*.45,0]);
      if(accelerate>.12)line([x,y,z],[x,y,z+accelerate*(4+hash(i+5)*10)],.1+s*.05,[.20,.48,.58,.22],.75);
    }
  }

  function hangar(t){
    /* 360-grid-equivalent bay: repeated portals and uninterrupted guide depth */
    box([0,-14,0],[40,2,190],C.dark); box([-21,0,0],[2,29,190],C.shell2);box([21,0,0],[2,29,190],C.shell2);
    for(let z=-88;z<=88;z+=16){
      box([0,14,z],[42,1.5,1.6],C.shell);box([-19,0,z],[1.5,28,1.6],C.edge);box([19,0,z],[1.5,28,1.6],C.edge);
      light([-18.1,8,z],[.35,9,.4],C.cyan,.65);light([18.1,8,z],[.35,9,.4],C.cyan,.65);
      box([-10,5,z],[12,1.0,1.6],C.shell2);box([10,5,z],[12,1.0,1.6],C.shell2);
    }
    for(let z=-80;z<82;z+=18){
      for(const side of [-1,1]){
        box([side*19,-4,z],[1.2,7,12],C.dark);box([side*16,-7.2,z],[6,.8,12],C.shell2);box([side*16,-.8,z],[6,.8,12],C.shell2);
        for(const edgeX of [13.25,18.75]){box([side*edgeX,-4,z-5.65],[.55,6,.55],C.edge);box([side*edgeX,-4,z+5.65],[.55,6,.55],C.edge);}
        light([side*18.2,-4,z],[.28,4.6,8],[.08,.64,.76,.35],.75);skiff([side*14.7,-3.5,z],.92,.35);
      }
    }
    for(let z=-90;z<95;z+=6){light([-5,-12.7,z],[1.6,.2,2.5],C.cyan,.8);light([5,-12.7,z],[1.6,.2,2.5],C.cyan,.8);}
    /* non-humanoid articulated service cranes */
    for(let z=-68;z<70;z+=34){for(const side of [-1,1]){box([side*15,7,z],[1,8,1],C.edge);box([side*11,10,z],[8,1,1],C.shell);box([side*8,6,z],[1,8,1],C.shell2);}}
    const fly=clamp((t-14)/7), z=-72+fly*150;
    skiff([Math.sin(fly*5)*3,-1,z],1.15,1.2);skiff([7,2.5,z+16],1.42,1.35);
    skiff([-6,4,76-fly*140],1.0,.9);skiff([8,-2,-20+Math.cos(fly*TAU)*28],.72,.7);
  }

  function bridge(t){
    box([0,-18,0],[132,3,132],C.dark);box([-66,8,0],[3,52,130],C.shell2);box([66,8,0],[3,52,130],C.shell2);
    /* terraced command decks */
    for(const side of [-1,1])for(let row=0;row<4;row++){
      const x=side*(27+row*9),z=-35+row*21,y=-12+row*2.2;
      box([x,y,z],[14,2,30],row%2?C.shell:C.shell2);
      for(let k=-1;k<=1;k++){box([x-side*2,y+2.2,z+k*8],[7,3.2,5],C.dark);light([x-side*3,y+4,z+k*8],[5,.18,3],C.cyan,.9,[0,0,side*.12]);}
    }
    /* command nexus and a readable holographic carrier formation */
    box([0,-13,3],[24,5,30],C.shell);box([0,-9,3],[18,3,22],C.edge);box([0,-5,3],[11,2,15],C.dark);
    for(let i=0;i<12;i++){const a=i/12*TAU,rr=10+(i%2)*3;light([Math.cos(a)*rr,-1+Math.sin(t+i)*1.1,3+Math.sin(a)*rr],[.32,.32,1.25],i%4?C.cyan:C.amber,1.1,[0,-a,0]);}
    for(let i=0;i<4;i++){const y=3+i*3.4,rx=14-i*1.7,rz=9-i*.9;for(let j=0;j<16;j++){const a=j/16*TAU;light([Math.cos(a)*rx,y,4+Math.sin(a)*rz],[.28,.18,1.2],[.1,.65,1,.32],.9,[0,-a,0]);}}
    const hy=8+Math.sin(t*.85)*.32;
    light([0,hy,4],[2.8,.38,10.5],[.10,.82,1,.52],1.35);
    light([-2.6,hy-.12,7.7],[2.25,.3,5.7],[.10,.68,1,.46],1.2,[0,.09,0]);
    light([2.6,hy-.12,7.7],[2.25,.3,5.7],[.10,.68,1,.46],1.2,[0,-.09,0]);
    light([0,hy+.55,2.2],[1.25,.32,3.4],[1,.48,.12,.58],1.35);
    light([0,hy,-1.6],[1.3,.42,.55],[.48,.92,1,.6],1.3);
    const holoEscorts=[[-8,-.5,-3],[8,-.2,-3],[-6,.8,1],[6,1.1,1],[-9,1.9,6],[9,1.6,6],[-5,3,10],[5,3.3,10]];
    holoEscorts.forEach((q,i)=>{
      const bob=Math.sin(t*1.2+i)*.22;
      light([q[0],hy+q[1]+bob,4+q[2]],[1.15,.24,3.25],[.10,.76,1,.46],1.15,[0,(i%2?-.05:.05),0]);
      light([q[0],hy+q[1]+bob,1.95+q[2]],[.48,.25,.42],[.36,.88,1,.55],1.2);
    });
    const scanY=hy-3.2+fract(t*.18)*7.2;
    light([0,scanY,4],[26,.055,19],[.08,.58,1,.14],.42);
    /* suspended data glass */
    for(let i=0;i<10;i++){const side=i%2?-1:1,x=side*(12+(i%3)*8),y=7+(i%4)*4,z=-28+i*7;light([x,y,z],[9,.25,5],[.08,.72,1,.22],.8,[Math.PI/2,0,side*.08]);}
    /* monumental observation frame, open to space */
    box([-48,10,64],[12,50,4],C.shell);box([48,10,64],[12,50,4],C.shell);box([0,33,64],[90,6,4],C.shell);box([0,-12,64],[90,6,4],C.edge);
    for(let x=-42;x<=42;x+=14)box([x,10,63],[1.2,42,2],C.shell2,0,[0,0,x*.0015]);
    /* silhouettes of the fleet beyond the aperture */
    for(let i=0;i<13;i++){const x=(i%2?-1:1)*(12+(i%5)*11),y=-2+(i%4)*7,z=88+(i%3)*16;box([x,y,z],[2.2,1.2,10],C.shell2);light([x,y,z-6],[.8,.5,5],C.cyan,1.1);}
  }

  function ring(center,rad,y,segments,rot,lit=0){
    for(let i=0;i<segments;i++){const a=i/segments*TAU+rot,x=center[0]+Math.cos(a)*rad,z=center[2]+Math.sin(a)*rad;box([x,center[1]+y,z],[4.5,2,1.3],i%3?C.shell2:C.edge,0,[0,-a,0]);if(lit&&i%2===0)light([x,center[1]+y+.8,z],[2.5,.24,.5],C.cyan,.8,[0,-a,0]);}
  }
  function coreAtrium(t){
    /* five platform strata around an intentionally vast void */
    for(let level=-2;level<=2;level++){
      const y=level*25;
      for(const side of [-1,1]){box([side*58,y,0],[24,3,100],level%2?C.shell:C.shell2);box([side*42,y,0],[9,2,92],C.edge);}
      for(let z=-43;z<=43;z+=22){box([-47,y,z],[14,2,7],C.shell);box([47,y,z],[14,2,7],C.shell);}
    }
    for(let z=-62;z<=62;z+=31){box([-74,0,z],[5,145,6],C.shell2);box([74,0,z],[5,145,6],C.shell2);box([0,68,z],[148,5,6],C.dark);}
    /* cantilevered braces, each large enough to wipe the moving camera */
    for(let i=0;i<8;i++){const a=i/8*TAU,y=(i%4-1.5)*18,x=Math.cos(a)*50,z=Math.sin(a)*50;line([x,y,z],[Math.cos(a)*18,y*.35,Math.sin(a)*18],3.2,i%2?C.shell:C.edge,0,opaque);}
    /* luminous faceted reactor: opaque voxel cage guarantees a readable core behind the transparent flow */
    for(let y=-44;y<=44;y+=8){
      const r=8.5+Math.cos(y*.14)*1.7;
      box([0,y,0],[r*1.42,3.7,r*1.42],y%16?C.dark:C.shell2,.2,[0,-t*.035+y*.008,0]);
      light([0,y,0],[r*1.05,2.7,r*1.05],[.08,.78,.92,.7],1.25,[0,t*.12+y*.01,0]);
    }
    ring([0,0,0],24,-27,30,t*.10,1);ring([0,0,0],31,0,36,-t*.075,1);ring([0,0,0],26,28,32,t*.13,1);
    for(let i=0;i<6;i++){const a=i/6*TAU+t*.05;line([Math.cos(a)*15,-52,Math.sin(a)*15],[Math.cos(a)*15,52,Math.sin(a)*15],1.2,C.edge,0,opaque);}
    const breath=.72+.28*Math.sin(t*1.7);light([0,0,0],[13*breath,105,13*breath],[.08,.8,1,.22],1.1);
  }

  function energyCorridor(t){
    box([0,-27,0],[84,3,210],C.dark);box([-43,0,0],[3,56,210],C.shell2);box([43,0,0],[3,56,210],C.shell2);
    for(let z=-98;z<=98;z+=16){
      box([0,27,z],[86,2.6,2.6],C.shell);box([-40,0,z],[2.8,54,2.8],C.edge);box([40,0,z],[2.8,54,2.8],C.edge);
      box([-22,18,z],[34,2.2,2.5],C.shell2);box([22,18,z],[34,2.2,2.5],C.shell2);
      light([-39,9,z],[.35,14,.45],C.cyan,.7);light([39,9,z],[.35,14,.45],C.cyan,.7);
    }
    for(let z=-88;z<=80;z+=24)for(const side of [-1,1]){
      /* open loading frames keep the moving energy blocks visible from the aisle */
      box([side*34,-5,z],[5,33,8],C.shell);box([side*29,10,z],[12,3,8],C.shell2);box([side*29,-20,z],[12,3,8],C.shell2);
      box([side*23.5,-5,z],[2,27,8],C.edge);light([side*24,-5,z],[.3,23,5],[.08,.62,.82,.35],.65);
      const cyc=fract(t*.18+z*.017+(side>0?.3:0));light([side*29,-13+cyc*18,z],[5,5,4],cyc>.82?C.white:C.cyan,1.45);
      box([side*19,3,z+4],[3,19,3],C.shell2,0,[0,0,side*Math.sin(t+z)*.25]);
    }
    for(let z=-96;z<100;z+=8){const phase=fract(t*.28+z*.01);light([0,-24.8,z],[5,.25,3],phase>.72?C.amber:C.cyan,1);light([0,23.8,-z],[4,.25,2],C.cyan,.65);}
    /* broad terminal coupling chamber: a luminous destination instead of an empty aperture */
    box([0,27,106],[86,5,8],C.edge);box([0,-27,106],[86,5,8],C.edge);
    box([-43,0,106],[5,58,8],C.shell);box([43,0,106],[5,58,8],C.shell);
    const chamberPulse=.82+.18*Math.sin(t*1.45);
    light([0,0,109],[66*chamberPulse,45*chamberPulse,2.2],[.08,.66,1,.15],.65);
    for(let i=-2;i<=2;i++){
      const y=i*8.2,x=Math.sin(t*.7+i)*5.5;
      const chamberColor=i===0?[.42,.92,1,.62]:[.08,.78,1,.58];
      light([x,y,105],[30-Math.abs(i)*3,4.4,4.5],chamberColor,1.05+chamberPulse*.35);
      box([i*13,0,107],[2.4,43,5],i%2?C.shell2:C.edge);
    }
    light([0,25,104],[44,2.2,3],[.18,.82,1,.16],.75);light([0,-25,104],[44,2.2,3],[.18,.82,1,.16],.75);
    light([-22,0,104],[2.2,48,3],[.18,.82,1,.16],.75);light([22,0,104],[2.2,48,3],[.18,.82,1,.16],.75);
  }

  function beamEffect(t,origin,target){
    const charge=pulse(47.0,48.2,49.25,49.55,t), active=pulse(49.15,49.48,54.6,55.25,t);
    if(charge>0){
      light(origin,[2.5+charge*5,2.1+charge*4,2.5+charge*4],[.12,.72,1,.55],2.5);
      light(at(origin,0,0,4),[5+charge*8,4+charge*6,3+charge*5],[.65,.98,1,.72],3.2);
      for(let i=0;i<6;i++){const fill=clamp(charge*1.45-i*.13);if(fill>0)light(at(origin,0,1.8,-3.7*i),[2.7,.24,2.4],[.08,.58,1,.65],.8+fill*1.2);}
      for(let i=0;i<8;i++){const a=t*2+i*TAU/8;light(at(origin,Math.cos(a)*(4+charge*4),Math.sin(a)*(3+charge*2),-1),[.42,.42,2.4],i%2?C.cyan:C.white,1.8,[0,-a,0]);}
      for(let i=0;i<7;i++){const p=V3.lerp(origin,target,.025+i*.032);light(p,[.42,.42,1.6],i%2?C.white:C.cyan,1.3);}
    }
    if(active>0){
      line(origin,target,2.0+active*.8,[.10,.62,1,.28],2.6); line(origin,target,.45+active*.3,C.white,3.2);
      const flow=Math.floor(t*18)%3; dottedLine(origin,target,.72,[.15,.92,1,.8],34,flow);
      for(let i=1;i<4;i++){const p=V3.lerp(origin,target,i*.22);const a=t*3+i;light(at(p,Math.cos(a)*2,Math.sin(a)*2,0),[.3,.3,3.2],C.white,2,[0,a,0]);}
    }
  }
  function pulseFire(t,origin){
    if(t<51.6||t>57.5)return;
    const sources=[at(origin,-10,8,28),at(origin,10,8,28),at(origin,-10,8,2),at(origin,10,8,2)];
    sources.forEach((s,j)=>{
      const target=[34+(j%2)*7,-5+j*3,112+j*4];
      for(let k=0;k<5;k++){
        const born=51.8+j*.16+k*.72, u=(t-born)/1.65;
        if(u>0&&u<1){const p=V3.lerp(s,target,u),prev=V3.lerp(s,target,Math.max(0,u-.065));line(prev,p,.68,[1,.36,.07,.78],2.2);light(p,[1.4,1.4,3.0],C.amber,2.8);}
        if(Math.abs(t-born)<.11)light(s,[1.7,1.2,1.8],C.white,2.8);
      }
    });
  }
  function pointDefense(t,origin){
    if(t<53.6||t>58.4)return;
    const guards=[guardPos[4],guardPos[7],guardPos[10]];
    guards.forEach((gp,j)=>{
      const s=at(origin,gp[0]+(j-1)*2,gp[1]+3.4,gp[2]+4), target=[-27-j*7,12+j*5,96+j*9];
      const gate=.5+.5*Math.sin((t-53.6)*16+j*2);
      if(gate>.22){
        dottedLine(s,target,.38,j%2?C.amber:C.white,38,Math.floor(t*25+j)%4);
        const tracer=fract((t-53.6)*3.15+j*.27),p=V3.lerp(s,target,tracer);
        light(p,[.72,.72,2.2],j%2?C.amber:C.white,2.35);
      }
      if(gate>.75){light(s,[1.4,1.4,2.0],C.amber,2.8);light(target,[1.5,1.5,1.5],[1,.45,.12,.55],2.1);}
    });
  }
  function bezier(a,b,c,u){const v=1-u;return[a[0]*v*v+b[0]*2*v*u+c[0]*u*u,a[1]*v*v+b[1]*2*v*u+c[1]*u*u,a[2]*v*v+b[2]*2*v*u+c[2]*u*u];}
  function missileFire(t,origin){
    const targets=[[-45,12,145],[-53,8,151],[-39,17,154],[-48,4,148],[-57,15,156],[-42,20,150]];
    for(let i=0;i<6;i++){
      const vp=vanPos[2+i], s=at(origin,vp[0]+(i%2?6:-6),vp[1]+1,vp[2]+2), target=targets[i];
      const born=54.7+i*.27,u=clamp((t-born)/4.0); if(t<born||t>born+4.45)continue;
      const control=[mix(s[0],target[0],.48)+(i-2.5)*5,Math.max(s[1],target[1])+23+i*2,mix(s[2],target[2],.52)];
      const p=bezier(s,control,target,u),pp=bezier(s,control,target,Math.max(0,u-.022));line(pp,p,.82,C.white,2.7);box(p,[1.05,1.05,3.8],C.edge,.15,[0,Math.atan2(p[0]-pp[0],p[2]-pp[2]),0]);
      if(u<.065)light(s,[2.4,1.8,2.8],C.amber,2.7);
      for(let q=1;q<12;q++){const uq=Math.max(0,u-q*.024),p0=bezier(s,control,target,uq),p1=bezier(s,control,target,Math.max(0,uq-.022));const al=1-q/12;line(p0,p1,.7*al,[.1+.8*al,.34+.45*al,1,al*.72],1.9);}
      if(u>.985){
        light(target,[5,5,5],C.amber,3);
        const rr=3.5+(u-.985)*90;for(let k=0;k<12;k++){const a=k/12*TAU;light(at(target,Math.cos(a)*rr,Math.sin(a)*rr,0),[.35,.35,1.4],[1,.38,.08,.55],2,[0,-a,0]);}
      }
    }
    const impact=pulse(58.55,59.05,60.75,61.45,t),impactCenter=[-48,13,151];
    if(impact>0){
      light(impactCenter,[4+impact*7,4+impact*7,4+impact*7],[1,.32,.06,.58],2.75);
      const rr=5+smooth(58.7,60.9,t)*23;
      for(let k=0;k<18;k++){
        const a=k/18*TAU+t*.22;
        light(at(impactCenter,Math.cos(a)*rr,Math.sin(a)*rr*.72,Math.sin(a*2)*2.8),[.65,.65,2.8],k%3?C.amber:C.white,1.9,[0,-a,0]);
      }
    }
  }
  function attackScene(t){
    const origin=[0,0,-48]; fleet(t,.12,1,0,origin); debrisField(t,0);
    const beamSplit=smooth(52.8,56.2,t),beamHeat=pulse(49.4,51.4,54.8,57.2,t);
    asteroid([10,5,132],15,12,beamSplit,beamHeat,Math.max(0,t-52.8));
    asteroid([40,0,116],9,24,smooth(55.2,58.0,t),pulse(53,54,56.5,58.2,t),Math.max(0,t-55.2));
    asteroid([-31,19,101],6.5,31,smooth(56.1,58.5,t),pulse(54,55,57.6,59,t),Math.max(0,t-56.1));
    asteroid([-48,13,151],14,42,smooth(59.1,61.5,t),pulse(58.2,59.2,61,62.5,t),Math.max(0,t-59.1));
    asteroid([66,-15,147],8,47,0,0);asteroid([-76,-7,125],10,55,0,0);
    beamEffect(t,at(origin,0,-.4,72.8),[10,5,132]);pulseFire(t,origin);pointDefense(t,origin);missileFire(t,origin);
    /* persistent fragments remain readable after the flashes */
    if(t>55)for(let i=0;i<28;i++){const k=(t-55)*(.35+hash(i)),a=hash(i*4)*TAU;box([12+Math.cos(a)*k*5,5+(hash(i+2)-.5)*k*3,132+Math.sin(a)*k*4],[.45+hash(i)*.8,.45+hash(i+1)*.8,.45+hash(i+2)*.8],C.rockLit,0,[k*.2,k*.13,0]);}
  }

  function sceneAt(t){
    opaque=[];glow=[]; let eye,target,fov=Math.PI/3.15,scene=0;
    if(t<14){
      scene=0;const residual=1-smooth(0,3.4,t),boost=1-smooth(0,5,t);fleet(t,boost,0,residual,[0,0,0]);debrisField(t,boost*2.3);
      asteroid([78,-8,105],11,7,0,0);asteroid([-65,22,132],8,9,0,0);
      if(t<6){const u=smooth(0,6,t),arc=Math.sin(u*Math.PI);eye=[mix(62,50,u)+arc*8,mix(28,55,u)+arc*15,mix(-116,-35,u)];target=V3.lerp([0,0,8],[0,0,15],u);}
      else if(t<10.5){const u=smooth(6,10.5,t),arc=Math.sin(u*Math.PI);eye=[mix(50,52,u)+arc*10,mix(55,42,u)+arc*8,mix(-35,57,u)];target=V3.lerp([0,0,12],[0,1,30],u);fov=mix(.92,1.05,u);}
      else {const u=smooth(10.5,14,t);eye=V3.lerp([52,42,57],[188,82,-108],u);target=V3.lerp([0,1,25],[0,28,-8],u);fov=mix(1.02,1.08,u);}
    } else if(t<21){
      scene=1;hangar(t);const u=smooth(14,21,t);eye=[mix(-2,2,u),mix(3,0,u),mix(-88,28,u)];target=[-8,0,mix(-25,78,u)];fov=.98;
    } else if(t<29){
      scene=2;bridge(t);const u=smooth(21,29,t);eye=[mix(-56,30,u),mix(15,21,u),mix(-43,14,u)];target=[mix(0,4,u),mix(5,11,u),mix(24,60,u)];fov=.98;
    } else if(t<38){
      scene=3;coreAtrium(t);
      if(t<35){const u=smooth(29,35,t);eye=[mix(36,-8,u),mix(-45,12,u),mix(-86,-88,u)+Math.sin(u*Math.PI)*12];target=[mix(-36,-38,u),mix(-18,0,u),0];fov=1.05;}
      else {const u=smooth(35,38,t);eye=[mix(-8,14,u),mix(12,34,u),mix(-88,-68,u)];target=[-38,0,0];fov=mix(1.05,1.12,u);}
    } else if(t<46){
      scene=4;energyCorridor(t);const u=smooth(38,46,t);eye=[mix(-6,6,u),mix(4,-2,u),mix(-94,52,u)];target=[-20,mix(0,3,u),mix(-25,104,u)];fov=1.04;
    } else if(t<62){
      scene=5;attackScene(t);
      if(t<52){const u=smooth(46,52,t);eye=V3.lerp([275,104,15],[225,82,18],u);target=[0,65,2];fov=1.18;}
      else if(t<57){const u=smooth(52,57,t);eye=V3.lerp([-220,76,18],[-178,58,48],u);target=V3.lerp([0,34,60],[2,30,72],u);fov=1.15;}
      else {const u=smooth(57,62,t);eye=V3.lerp([145,70,70],[84,48,118],u);target=V3.lerp([-550,60,120],[-850,70,150],u);fov=mix(1.08,.98,u);}
    } else {
      scene=6;const sh=smooth(62,68,t),boost=smooth(67,73.5,t),advance=smooth(70,76,t)*30,regroup=1-smooth(62,68,t);fleet(t,boost,regroup,sh,[0,0,advance]);debrisField(t,boost*2.3);
      for(let i=0;i<24;i++){const a=hash(i)*TAU,k=(t-62)*(2+hash(i)*4);box([10+Math.cos(a)*(8+k),5+(hash(i+3)-.5)*(10+k*.3),110-k*7],[.5+hash(i)*1.5,.5+hash(i+1),.5+hash(i+2)],C.rock,0,[k*.1,k*.12,0]);}
      if(t<69){const u=smooth(62,69,t);eye=V3.lerp([225,94,28],[182,70,-2],u);target=[0,16,-20];fov=1.11;}
      else {const u=smooth(69,76,t);eye=V3.lerp([164,58,22],[62,28,-86],u);target=V3.lerp([0,0,32],[0,0,35],u);fov=mix(1.03,.9,u);}
    }
    return {eye,target,fov,scene};
  }

  function uniform(p,n){return gl.getUniformLocation(p,n);}
  const U={
    cube:{vp:uniform(cubeProgram,'uVP'),camera:uniform(cubeProgram,'uCamera'),time:uniform(cubeProgram,'uTime')},
    bg:{res:uniform(bgProgram,'uResolution'),time:uniform(bgProgram,'uTime'),scene:uniform(bgProgram,'uScene')},
    blur:{tex:uniform(blurProgram,'uTex'),dir:uniform(blurProgram,'uDir')},
    comp:{scene:uniform(compositeProgram,'uSceneTex'),bloom:uniform(compositeProgram,'uBloomTex'),res:uniform(compositeProgram,'uResolution')}
  };
  function drawInstances(data,transparent,vp,eye,t){
    if(!data.length)return;
    gl.useProgram(cubeProgram);gl.uniformMatrix4fv(U.cube.vp,false,vp);gl.uniform3fv(U.cube.camera,eye);gl.uniform1f(U.cube.time,t);
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,instBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    if(transparent){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);}else{gl.disable(gl.BLEND);gl.depthMask(true);}
    gl.drawArraysInstanced(gl.TRIANGLES,0,36,data.length/14);gl.bindVertexArray(null);
    if(transparent){gl.disable(gl.BLEND);gl.depthMask(true);}
  }
  function renderAt(t){
    resize(); t=((t%DURATION)+DURATION)%DURATION;
    const s=sceneAt(t),proj=perspective(s.fov,rw/rh,.08,900),view=lookAt(s.eye,s.target),vp=mul(proj,view);
    gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,rw,rh);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(bgProgram);gl.uniform2f(U.bg.res,rw,rh);gl.uniform1f(U.bg.time,t);gl.uniform1f(U.bg.scene,s.scene);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    drawInstances(opaque,false,vp,s.eye,t);drawInstances(glow,true,vp,s.eye,t);
    gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);
    let source=brightTex;
    for(let i=0;i<6;i++){
      gl.bindFramebuffer(gl.FRAMEBUFFER,pingFbo[i&1]);gl.viewport(0,0,Math.max(1,rw>>1),Math.max(1,rh>>1));
      gl.useProgram(blurProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source);gl.uniform1i(U.blur.tex,0);gl.uniform2f(U.blur.dir,i&1?0:1,i&1?1:0);gl.drawArrays(gl.TRIANGLES,0,3);source=pingTex[i&1];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,rw,rh);gl.useProgram(compositeProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sceneTex);gl.uniform1i(U.comp.scene,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,source);gl.uniform1i(U.comp.bloom,1);gl.uniform2f(U.comp.res,rw,rh);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.flush();
  }

  let exportMode=false,exportFps=60,exportTime=0,startClock=performance.now()/1000;
  function loop(ms){if(!exportMode){const t=(ms/1000-startClock)%DURATION;renderAt(t);}requestAnimationFrame(loop);}
  window.videoExport={
    runs:['tour'],
    async begin(runId,{fps=60}={}){
      if(runId!=='tour')throw new Error('Unknown run: '+runId);
      exportMode=true;exportFps=Math.max(1,Number(fps)||60);exportTime=0;renderAt(0);
      return {frames:Math.round(DURATION*exportFps)};
    },
    async frame(i){
      if(!exportMode)throw new Error('Call begin() before frame()');
      exportTime=clamp(Number(i)||0,0,Math.round(DURATION*exportFps)-1)/exportFps;renderAt(exportTime);
    },
    end(){exportMode=false;startClock=performance.now()/1000-exportTime;}
  };
  addEventListener('resize',()=>{rw=0;});
  resize();renderAt(0);requestAnimationFrame(loop);
})();

