'use strict';
const T = THREE, PI = Math.PI, TAU = PI * 2;
const scene = new T.Scene();
const stage = new T.Group(); scene.add(stage);
const renderer = new T.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
renderer.setClearColor(0x000000,0);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const hemi = new T.HemisphereLight(0xf5fbff,0xb4c9b2,2.03); scene.add(hemi);
const sun = new T.DirectionalLight(0xffebcd,2.22);
sun.position.set(-24,35,13);
sun.castShadow = true;
Object.assign(sun.shadow.camera,{left:-23,right:23,top:24,bottom:-23,near:1,far:90});
sun.shadow.mapSize.set(2048,2048);
sun.shadow.bias = -.00036;
sun.shadow.normalBias = .035;
scene.add(sun);
const fill = new T.DirectionalLight(0xc0e7ec,.58); fill.position.set(12,7,-14); scene.add(fill);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = .98;
const vec = (x,y,z)=>new T.Vector3(x,y,z);
const lerp = T.MathUtils.lerp;
const clamp = T.MathUtils.clamp;
const smooth = (a,b,x)=>{const f=clamp((x-a)/(b-a),0,1);return f*f*(3-2*f)};
let seed=2146;
function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296}
const rr=(a,b)=>lerp(a,b,rnd()), pick=a=>a[Math.floor(rnd()*a.length)];
const colors = new Map(), shapes = new Map();
function mat(color, roughness=.83, metalness=0){
  if(color && color.isMaterial)return color;
  const k=[color,roughness,metalness].join('/');
  if(!colors.has(k)) colors.set(k,new T.MeshStandardMaterial({color,roughness,metalness}));
  return colors.get(k);
}
const tint=(c,k)=>new T.Color(c).multiplyScalar(k);
function oxidizedIron(color){
 const m=mat(color,.75,.12).clone();
 m.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 steelUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsteelUV=uv;');
  shader.fragmentShader='varying vec2 steelUV;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 u=steelUV;
   float patches=sin(u.x*38.+sin(u.y*27.)*.9)*cos(u.y*27.+u.x*15.)+sin(u.x*68.-u.y*43.)*.22;
   float grit=sin(u.x*460.+u.y*317.)*cos(u.x*160.-u.y*537.);
   float worn=smoothstep(.34,.75,patches+.16*grit);
   vec3 oxide=vec3(.38,.206,.087);
   diffuseColor.rgb=mix(diffuseColor.rgb*(.94+.09*grit),oxide,worn*.62);
  `);
 };
 return m;
}
const ink = '#354e50', metal='#5b7678', white='#f2f1df', stone='#b6bcb2', red='#c55142', blue='#367d94', gold='#e5ae49';
function group(x=0,y=0,z=0,p=stage){const g=new T.Group();g.position.set(x,y,z);p.add(g);return g}
function mesh(geo,c,x,y,z,p=stage,shadow=true){
  const m=new T.Mesh(geo,mat(c));m.position.set(x,y,z);p.add(m);
  m.castShadow=shadow;m.receiveShadow=shadow;return m;
}
function cached(key,fn){if(!shapes.has(key))shapes.set(key,fn());return shapes.get(key)}
const unitBox=new T.BoxGeometry(), unitBall=new T.SphereGeometry(1,12,8);
function box(x,y,z,w,h,d,c,p=stage,s=true){
  const m=mesh(unitBox,c,x,y,z,p,s);m.scale.set(w,h,d);return m;
}
function ball(x,y,z,a,b,d,c,p=stage,s=true){
  const m=mesh(unitBall,c,x,y,z,p,s);m.scale.set(a,b,d);return m;
}
function ico(x,y,z,a,b,d,c,p=stage,det=0,s=true){
  const m=mesh(cached('i'+det,()=>new T.IcosahedronGeometry(1,det)),c,x,y,z,p,s);m.scale.set(a,b,d);return m;
}
function cyl(x,y,z,a,b,h,c,p=stage,n=16,s=true){
  return mesh(cached(['c',a,b,h,n].join(),()=>new T.CylinderGeometry(a,b,h,n)),c,x,y,z,p,s);
}
function tor(x,y,z,r,d,c,p=stage,s=true){
  return mesh(cached(['t',r,d].join(),()=>new T.TorusGeometry(r,d,6,24)),c,x,y,z,p,s);
}
function beam(a,b,r,c,p=stage,n=8,s=true){
  const v=Array.isArray(a)?vec(...a):a, w=Array.isArray(b)?vec(...b):b;
  const d=w.clone().sub(v),mid=v.clone().addScaledVector(d,.5);
  const m=mesh(cached('beam'+n,()=>new T.CylinderGeometry(1,1,1,n)),c,mid.x,mid.y,mid.z,p,s);
  m.scale.set(r,d.length(),r);m.quaternion.setFromUnitVectors(vec(0,1,0),d.normalize());return m;
}
function path(pts,r,c,p=stage,s=false){
  const curve=new T.CatmullRomCurve3(pts.map(a=>vec(...a)));
  return mesh(new T.TubeGeometry(curve,Math.max(8,pts.length*4),r,6,false),c,0,0,0,p,s);
}
function plane(x,y,z,w,h,c,p=stage){
  return mesh(cached(['p',w,h].join(),()=>new T.PlaneGeometry(w,h)),c,x,y,z,p,false);
}
function flat(x,y,z,w,h,c,p=stage){const m=plane(x,y,z,w,h,c,p);m.rotation.x=-PI/2;return m}
function alpha(c,opacity){return new T.MeshBasicMaterial({color:c,transparent:true,opacity,depthWrite:false,side:T.DoubleSide})}
const glazing=new T.MeshPhongMaterial({color:0xa8e5e8,transparent:true,opacity:.145,depthWrite:false,shininess:108,side:T.DoubleSide,reflectivity:.73});
glazing.onBeforeCompile=shader=>{
 shader.uniforms.glassTime=renderTime;
 shader.uniforms.glassRain=rainDensity;
 shader.vertexShader='varying vec2 rainPane; varying float panePhase;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n rainPane=uv; panePhase=modelMatrix[3].x*.21+modelMatrix[3].z*.16;');
 shader.fragmentShader='varying vec2 rainPane;varying float panePhase;uniform float glassTime,glassRain;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 pane=rainPane*vec2(22.,15.);
   vec2 grid=floor(pane);
   float r=fract(sin(dot(grid+panePhase,vec2(23.64,106.91)))*7691.75);
   vec2 off=vec2(fract(r*13.6)-.5,fract(r*7.79)-.5)*.66;
   vec2 spot=fract(pane)-.5-off;
   float radius=length(spot*vec2(1.06,.83));
   float glint=step(.82,r)*(1.-smoothstep(.047,.102,radius));
   float lane=floor(pane.x), rand=fract(sin(lane*33.16+panePhase*8.3)*7318.22);
   float slide=fract(rainPane.y+glassTime*(.046+rand*.029)+rand*11.37);
   float rivulet=step(.85,rand)*(1.-smoothstep(.029,.069,abs(fract(pane.x)-.5-.16*sin(slide*16.))))
    *smoothstep(.57,.71,slide)*(1.-smoothstep(.735,.790,slide));
   float wet=(glint*.86+rivulet)*glassRain;
   diffuseColor.a=min(.30,diffuseColor.a+.18*wet);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.73,.90,.84),wet*.51);
 `);
};
function edge(o,c='#465858',opacity=.42,angle=32){
  const m=new T.LineSegments(new T.EdgesGeometry(o.geometry,angle),new T.LineBasicMaterial({color:c,transparent:true,opacity,depthWrite:false}));
  o.add(m);return o;
}
function canvasMat(w,h,draw,lit=false,cut=false){
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
  draw(ctx,w,h);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
  return lit ? new T.MeshStandardMaterial({map:tex,roughness:.78,alphaTest:cut?.08:0,side:T.DoubleSide}) :
    new T.MeshBasicMaterial({map:tex,transparent:cut,side:T.DoubleSide,alphaTest:cut?.04:0,depthWrite:!cut});
}
function linesText(ctx,text,x,y,size,color,align='left',bold=false){
  ctx.font=(bold?'bold ':'')+size+'px "Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
  ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,x,y);
}
function sign(text,sub,x,y,z,w,h,p=stage,theme=['#e8e4ce','#36535a','#b95e48']){
  const m=canvasMat(512,160,(c,W,H)=>{
    c.fillStyle=theme[0];c.fillRect(0,0,W,H);
    c.strokeStyle=theme[2];c.lineWidth=5;c.strokeRect(10,9,W-20,H-18);
    linesText(c,text,W/2,sub?65:82,sub?48:56,theme[1],'center',true);
    if(sub)linesText(c,sub,W/2,121,22,theme[2],'center',true);
    for(let i=0;i<65;i++){c.fillStyle=i%2?'#ffffff25':'#7e624420';c.fillRect(rr(0,W),rr(0,H),rr(1,21),rr(1,3))}
  });return plane(x,y,z,w,h,m,p);
}
const renderTime={value:0}, cloudLight={value:1}, windPower={value:0};
const boats=[], fish=[], foliage=[], cloth=[], causticPanels=[], buoys=[], beads=[], lamps=[], shoreFoam=[], ripples=[], puddles=[];
const SHORE=1.03, WAT=.04;
const seaEdge=14;
const outerPier={end:8.42,sea:-11.05,harbor:-9.37,towerX:7.48,towerZ:-10.25};
const cloudPass={value:0}, cloudBand={value:-30}, rainDensity={value:.66};
function cloudAt(x,z){
 const offset=Math.abs(.96*x-.28*z-cloudBand.value);
 return 1-cloudPass.value*(.13+.61*(1-smooth(2.2,9.5,offset)));
}
const sunlightField=`
uniform float cloudBand;
float cloudTransmission(vec2 p,float density){
 float offset=abs(dot(p,vec2(.96,-.28))-cloudBand);
 return 1.-density*(.13+.61*(1.-smoothstep(2.2,9.5,offset)));
}
float waterLightField(vec2 p,float t){
 float time=t*.56;
 float x=p.x*3.3+sin(p.y*2.34+time)*1.12+cos(p.x*1.43+time*.42)*.57;
 float y=p.y*4.12+sin(p.x*3.29-time*.95)*1.14;
 float crossWave=sin(x)+.79*cos(y);
 float core=1.-smoothstep(.047,.30,abs(crossWave));
 float halo=(1.-smoothstep(.17,.73,abs(crossWave)))*.37;
 float focus=.55+.45*smoothstep(-.42,.64,sin(p.x*.82+p.y*.61+time*.37));
 return max(core,halo)*focus;
}`;
function irreg(x,y,z,rx,rz,c,p=stage,amount=.2){
 const g=new T.BufferGeometry(), a=[0,0,0], ix=[];
 for(let j=0;j<19;j++){
   const t=j/19*TAU,k=rr(1-amount,1+amount);
   a.push(Math.cos(t)*rx*k,0,Math.sin(t)*rz*k);ix.push(0,1+(j+1)%19,1+j);
 }
 g.setAttribute('position',new T.Float32BufferAttribute(a,3));g.setIndex(ix);g.computeVertexNormals();
 return mesh(g,c,x,y,z,p,false);
}
const groundShadow=canvasMat(256,256,(c,w,h)=>{
 const q=c.createRadialGradient(w*.5,h*.5,w*.14,w*.5,h*.5,w*.49);
 q.addColorStop(0,'#53797170');q.addColorStop(.55,'#53797142');q.addColorStop(1,'#53797100');c.fillStyle=q;c.fillRect(0,0,w,h);
},false,true);
flat(1.5,-4.22,2,44,43,groundShadow);
