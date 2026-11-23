'use strict';
const RF = (() => {
const {T,clamp,lerp,smooth,rad,hash}=F;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const vertex='varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}';
const color=x=>new T.Color(x);
const warmth=t=>t>10.5?lerp(1,.26,smooth(clamp((t-10.5)/3.3))):1;
const targets=new Map(), meshes=new Map(), simulations=new Map(), plates=new Map();
let rr,env,screen,quad,output,background,metalTexture,platformTexture,W=900,H=506,lastScene,lastCamera,lastSampler,renderSampler,orbit=false,pickOwners=new Map(),renderSerial=0;
let rootPlanes=new Map(),rootCoverage=new Map(),rootMatteIds=new Set();
function shader(fragment,uniforms={},options={}){
 return new T.ShaderMaterial({uniforms:Object.fromEntries(Object.entries(uniforms).map(([k,v])=>[k,{value:v}])),vertexShader:vertex,fragmentShader:'varying vec2 uv0; '+fragment,depthTest:false,depthWrite:false,...options})
}
function init(canvas){
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true,premultipliedAlpha:false});
 if(!gl)throw Error('当前浏览器未启用 WebGL 2');
 rr=new T.WebGLRenderer({canvas,context:gl,antialias:true,alpha:true,preserveDrawingBuffer:true});
 rr.setClearColor(0,0);rr.shadowMap.enabled=true;rr.shadowMap.type=T.PCFSoftShadowMap;
 screen=new T.Scene();quad=new T.Mesh(new T.PlaneGeometry(2,2));quad.frustumCulled=false;screen.add(quad);
 output=shader('uniform sampler2D map;void main(){gl_FragColor=texture2D(map,uv0);if(gl_FragColor.a>0.)gl_FragColor.rgb/=gl_FragColor.a;\n#include <colorspace_fragment>\n}',{map:null});
 background=shader(`
 uniform float heat;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){
  vec2 p=uv0-vec2(.592,.39);float glow=exp(-dot(p*vec2(1.67,1.39),p*vec2(1.67,1.39))*9.);
  float rays=sin(atan(p.y,p.x)*13.+1.)*.07+1.;
  float beam=pow(max(0.,1.-abs(uv0.x-.68+.20*(uv0.y-.5))*2.9),7.)*smoothstep(.36,1.,uv0.y);
  vec3 c=vec3(.006,.0045,.0065)+vec3(.135,.026,.006)*glow*rays*heat;
  c+=vec3(.037,.024,.017)*beam*heat+vec3(.010,.016,.028)*exp(-length(uv0-vec2(.76,.77))*6.5)*(1.-heat*.55);
  c+=h(gl_FragCoord.xy)*vec3(.005,.003,.002);gl_FragColor=vec4(c,1.);
 }`,{heat:1});
 const pano=document.createElement('canvas');pano.width=512;pano.height=256;
 const ctx=pano.getContext('2d'), g=ctx.createLinearGradient(0,0,0,256);
 [[0,'#242832'],[.25,'#575253'],[.5,'#493639'],[.72,'#1a1010'],[1,'#0c1118']].forEach(([x,c])=>g.addColorStop(x,c));
 ctx.fillStyle=g;ctx.fillRect(0,0,512,256);
 [[95,54,90,48,'#fff0d9'],[255,94,9,125,'#f76724'],[384,72,67,71,'#b2cbea'],[468,121,24,57,'#ba4d23'],[145,144,52,3,'#ffae6e']].forEach(([x,y,w,h,c])=>{ctx.shadowBlur=20;ctx.shadowColor=c;ctx.fillStyle=c;ctx.fillRect(x,y,w,h)});
 const tex=new T.CanvasTexture(pano);tex.colorSpace=T.SRGBColorSpace;tex.mapping=T.EquirectangularReflectionMapping;
 const pm=new T.PMREMGenerator(rr);env=pm.fromEquirectangular(tex).texture;pm.dispose();tex.dispose();
 const brush=document.createElement('canvas');brush.width=256;brush.height=256;const b=brush.getContext('2d'), img=b.createImageData(256,256);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const i=4*(x+y*256),value=clamp(184+hash(y*5.1)*36+hash(i*.009)*32-Math.pow(hash(y*1.28),14)*42*(.5+.5*Math.sin(x*.19+y*.2)),0,255);
  img.data[i]=img.data[i+1]=img.data[i+2]=value;img.data[i+3]=255
 }
 b.putImageData(img,0,0);metalTexture=new T.CanvasTexture(brush);metalTexture.wrapS=metalTexture.wrapT=T.RepeatWrapping;metalTexture.repeat.set(.007,.0135);metalTexture.colorSpace=T.SRGBColorSpace;
 const platen=document.createElement('canvas');platen.width=platen.height=384;
 const disk=platen.getContext('2d'),grain=disk.createImageData(384,384);
 for(let y=0;y<384;y++)for(let x=0;x<384;x++){
  const i=4*(x+y*384),radius=Math.hypot(x-192,y-192),angle=Math.atan2(y-192,x-192);
  const machining=Math.sin(radius*2.8+Math.sin(angle*11+radius*.08)*.15);
  const milled=(radius>151&&radius<179)?Math.pow(Math.max(0,Math.cos(angle*72)),12)*25:0;
  const center=radius<124?2.3*Math.sin(x*.31)*Math.sin(y*.31):0;
  const v=clamp(174+machining*9+hash(i*.014)*17-milled+center,0,255);
  grain.data[i]=v;grain.data[i+1]=v;grain.data[i+2]=v;grain.data[i+3]=255
 }
 disk.putImageData(grain,0,0);
 platformTexture=new T.CanvasTexture(platen);platformTexture.colorSpace=T.SRGBColorSpace;platformTexture.anisotropy=Math.min(8,rr.capabilities.getMaxAnisotropy());
}
function release(){
 for(const g of meshes.values())g.dispose();meshes.clear();simulations.clear();
 for(const p of plates.values())p.tex.dispose();plates.clear()
}
function size(w,h){
 const d=Math.min(1.65,Math.max(1.35,devicePixelRatio),3200/Math.max(w,h)),cw=Math.max(2,Math.round(w*d)),ch=Math.max(2,Math.round(h*d));
 if(cw===W&&ch===H&&rr.domElement.width===cw)return;
 W=cw;H=ch;rr.setSize(cw,ch,false);for(const t of targets.values())t.dispose();targets.clear()
}
function target(id,depth=false){
 if(!targets.has(id)){
  const rt=new T.WebGLRenderTarget(W,H,{type:T.HalfFloatType,depthBuffer:depth,stencilBuffer:false});
  if(depth){rt.depthTexture=new T.DepthTexture(W,H);rt.depthTexture.type=T.UnsignedIntType}
  targets.set(id,rt)
 }
 const rt=targets.get(id);rt.lastUse=renderSerial;return rt
}
function clear(t){rr.setRenderTarget(t);rr.clear(true,true,true)}
function pass(m,dest,add=false){quad.material=m;rr.setRenderTarget(dest);rr.autoClear=!add;rr.render(screen,new T.Camera());rr.autoClear=true}
function cameraFor(s,isOrbit=false){
 const l=s.comp.layers.find(l=>l.type==='camera'&&s.active(l));
 const cam=new T.PerspectiveCamera(l?clamp(s.val(l,'fov'),8,150):39,s.comp.width/s.comp.height,5,8000);
 if(l){
  cam.position.setFromMatrixPosition(s.matrix(l));const target=V(...s.val(l,'target'));
  const parent=s.comp.layers.find(q=>q.id===l.parent);if(parent)target.applyMatrix4(s.matrix(parent));
  if(isOrbit)cam.position.sub(target).applyAxisAngle(V(0,1,0),.52).add(target);
  cam.lookAt(target);cam.rotateZ(rad(s.val(l,'rotation')[2]));
 }else{cam.position.set(isOrbit?345:0,isOrbit?240:0,s.comp.height*.5/Math.tan(rad(cam.fov/2)));cam.lookAt(0,0,0)}
 cam.userData.focus=l?s.val(l,'focus'):cam.position.length();cam.userData.aperture=l?s.val(l,'aperture'):0;
 cam.updateMatrixWorld();return cam
}
function lighting(s,scene){
 scene.environment=env;scene.add(new T.HemisphereLight(0xf9ddd0,0x969fae,1.35));
 const rim=new T.DirectionalLight(0x9ebcfa,2.2);rim.position.set(300,240,-350);scene.add(rim);
 const fill=new T.DirectionalLight(0xffe2bb,1.15);fill.position.set(170,80,500);scene.add(fill);
 let shadow=false,found=false;
 for(const l of s.comp.layers.filter(l=>l.type==='light'&&s.active(l))){
  found=true;const directional=l.lightType!=='point';
  const a=directional?new T.DirectionalLight(s.val(l,'fill'),s.val(l,'intensity')):new T.PointLight(s.val(l,'fill'),s.val(l,'intensity')*8000,2200,1.35);
  a.position.setFromMatrixPosition(s.matrix(l));a.castShadow=l.cast&&!shadow;
  if(a.castShadow){
   shadow=true;a.shadow.mapSize.set(1024,1024);a.shadow.bias=-.0002;a.shadow.normalBias=.45;a.shadow.camera.far=2200;
   if(directional){Object.assign(a.shadow.camera,{left:-650,right:650,top:580,bottom:-590})}a.shadow.camera.updateProjectionMatrix()
  }
  if(directional){
   a.target.position.set(...s.val(l,'target'));
   const parent=s.comp.layers.find(q=>q.id===l.parent);if(parent)a.target.position.applyMatrix4(s.matrix(parent));
   scene.add(a.target)
  }
  scene.add(a)
 }
 if(!found){const l=new T.DirectionalLight(0xffe9d0,2.1);l.position.set(-100,220,500);scene.add(l)}
}
function tessellate(original,depth,field=false){
 const source=original.index?original.toNonIndexed():original,p=source.attributes.position,uv=source.attributes.uv,points=[],tex=[],groups=[];
 const parts=source.groups.length?source.groups:[{start:0,count:p.count,materialIndex:0}];
 const at=i=>[p.getX(i),p.getY(i),p.getZ(i),uv.getX(i),uv.getY(i)];
 const edge=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])*.5);
 function triangle(a,b,c,level){
  const ab=edge(a,b),bc=edge(b,c),ca=edge(c,a),longest=Math.max(ab,bc,ca);
  if(level>0&&longest>(field?42:63)){
   if(longest===bc){[a,b,c]=[b,c,a]}
   else if(longest===ca){[a,b,c]=[c,a,b]}
   const mid=midpoint(a,b);
   triangle(a,mid,c,level-1);triangle(mid,b,c,level-1);
   return
  }
  for(const v of [a,b,c]){points.push(v[0],v[1],v[2]);tex.push(v[3],v[4])}
 }
 for(const part of parts){
  const start=points.length/3;
  for(let i=part.start;i<part.start+part.count;i+=3)triangle(at(i),at(i+1),at(i+2),field?11:8);
  groups.push({start,count:points.length/3-start,materialIndex:part.materialIndex})
 }
 if(source!==original)source.dispose();original.dispose();
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(tex,2));
 if(depth>.04)groups.forEach(q=>g.addGroup(q.start,q.count,q.materialIndex));
 return g
}
function smoothCaps(g){
 const p=g.attributes.position,n=g.attributes.normal,last=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1000)).join('/');
 const cap=g.groups.length?g.groups.filter(part=>part.materialIndex===0):[{start:0,count:p.count}];
 for(const {start,count} of cap)for(let i=start;i<start+count;i++){
  const k=key(i);if(!last.has(k))last.set(k,V());last.get(k).add(V().fromBufferAttribute(n,i))
 }
 for(const v of last.values())v.normalize();
 for(const {start,count} of cap)for(let i=start;i<start+count;i++){const v=last.get(key(i));n.setXYZ(i,v.x,v.y,v.z)}
 n.needsUpdate=true
}
function meshGeo(rings,depth=0,bevel=0,twist=0,bend=0){
 const solved=rings.deformVertex,rest=rings.rest||rings;
 let shapes=F.polygons(rest);if(!shapes.length)return null;
 const key=JSON.stringify([shapes,depth,bevel,twist,bend,rings.deformKey]);if(meshes.has(key))return meshes.get(key);
 if(depth>.04&&shapes.length>1){
  try{shapes=polygonClipping.union(shapes).map(p=>p.map(r=>r.slice(0,-1)))}catch{}
 }
 const make=pts=>pts.map(p=>new T.Vector2(p[0],p[1]));
 const coords=shapes.map(([outer,...holes])=>{const shape=new T.Shape(make(outer));shape.holes=holes.map(p=>new T.Path(make(p)));return shape});
 let g=depth>.04?new T.ExtrudeGeometry(coords,{depth,bevelEnabled:bevel>.01,bevelSegments:3,steps:twist||bend||solved?8:1,bevelSize:bevel*.7,bevelThickness:bevel}):new T.ShapeGeometry(coords);
 if(depth>.04)g.translate(0,0,-depth/2);
 const bz=rest.flatMap(r=>r.points).filter(p=>Math.abs(p[2]||0)>.02);
 if(twist||bend||bz.length||solved){
  g=tessellate(g,depth,!!solved);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i);let z=p.getZ(i),dist=Infinity,dz=0;
   for(const b of bz){const d=(x-b[0])**2+(y-b[1])**2;if(d<dist){dist=d;dz=b[2]}}
   if(dist<1800)z+=dz*Math.exp(-dist/1800);
   const a=rad(twist)*y/200,pt=[x*Math.cos(a)+z*Math.sin(a),y,z*Math.cos(a)-x*Math.sin(a)+y*y*bend/85000];
   p.setXYZ(i,...(solved?solved(pt):pt))
  }
  p.needsUpdate=true;g.computeVertexNormals();smoothCaps(g)
 }
 if(meshes.size>135){const first=meshes.keys().next().value;meshes.get(first).dispose();meshes.delete(first)}
 meshes.set(key,g);return g
}
const basic=(c,opacity=1)=>new T.MeshBasicMaterial({color:c,opacity,transparent:opacity<.999,side:T.DoubleSide,depthWrite:opacity>.96});
function metal(c,m,r,e=0,ec='#ff5221',opacity=1,map=null){
 return new T.MeshStandardMaterial({color:c,metalness:clamp(m),roughness:clamp(r,.055,1),emissive:ec,emissiveIntensity:Math.max(0,e),transparent:opacity<1,opacity,depthWrite:opacity>.96,map,side:T.DoubleSide,envMapIntensity:1.8})
}
function mesh(root,g,m,x=0,y=0,z=0){
 if(!g)return null;const a=new T.Mesh(g,m);a.position.set(x,y,z);a.castShadow=true;a.receiveShadow=true;root.add(a);return a
}
function line(root,pts,c,opacity=1,closed=false){
 if(pts.length<2)return;
 const cls=closed?T.LineLoop:T.Line;
 root.add(new cls(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:c,transparent:true,opacity,depthWrite:false})))
}
function ribbon(root,pts,w,c,a=1,closed=false){
 if(w<=0||pts.length<2)return;
 const v=[],len=closed?pts.length:pts.length-1;
 for(let i=0;i<len;i++){
  const p=V(...pts[i]),q=V(...pts[(i+1)%pts.length]),x=q.x-p.x,y=q.y-p.y;
  const u=V(-y,x).normalize().multiplyScalar(w*.5);
  const r=p.clone().add(u),s=p.clone().sub(u),t=q.clone().add(u),z=q.clone().sub(u);v.push(...r,...s,...t,...s,...z,...t)
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));return mesh(root,g,basic(c,a))
}
function stage(s,l,root){
 const t=s.time,yy=s.val(l,'height');
 const floor=new T.ShaderMaterial({uniforms:{heat:{value:warmth(t)},base:{value:color(s.val(l,'fill'))}},vertexShader:`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
 varying vec3 p;uniform float heat;uniform vec3 base;
 void main(){
  vec2 q=p.xy;float fade=exp(-length(q*vec2(.7,.61))/455.);
  vec2 g=abs(fract(q/70.+.5)-.5)/fwidth(q/70.);
  float grid=1.-min(1.,min(g.x,g.y));float ember=pow(max(0.,1.-length((q-vec2(93.,8.))/vec2(610.,390.))),2.);
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(127.1,311.7)))*43758.5453)*.004;
  gl_FragColor=vec4(vec3(.009,.006,.008)+base*fade*.64+vec3(.075,.025,.007)*grid*fade*heat+vec3(.15,.043,.009)*ember*heat+grain,fade*.95);
 }`,transparent:true,depthWrite:false});
 const f=mesh(root,new T.PlaneGeometry(3500,2200),floor,0,yy-36,-120);f.rotation.x=-Math.PI/2;f.castShadow=false;
 mesh(root,new T.CylinderGeometry(334,346,35,100),metal(0x1c1516,.69,.64,.023,0x582316),61,yy-21,0);
 const platen=metal(0x29242a,.81,.63,.026,0x873218,1,platformTexture);platen.envMapIntensity=1.12;
 mesh(root,new T.CylinderGeometry(314,322,9,100),platen,61,yy-1,0);
 for(const [r,co,d] of [[210,0xd78954,.43],[280,0xe57e43,.57],[300,0xc96537,.75],[313,0xfa8f4c,.87],[329,0xa86444,.65],[355,0xb56439,.50],[404,0xa35537,.36]]){
  const pts=Array.from({length:148},(_,i)=>{const a=i*Math.PI/74;return V(61+Math.cos(a)*r,yy+(r>322?-1:4.1),Math.sin(a)*r)});
  line(root,pts,color(co).lerp(color(0x9aa6bd),1-warmth(t)),d*(.45+warmth(t)*.55),true)
 }
 const ticks=[];
 for(let i=0;i<100;i++){
  const th=i*Math.PI/50,r=i%5===0?17:7;
  ticks.push(V(61+Math.cos(th)*313,yy+4.8,Math.sin(th)*313),V(61+Math.cos(th)*(313-r),yy+4.8,Math.sin(th)*(313-r)))
 }
 root.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(ticks),new T.LineBasicMaterial({color:0xbd876a,transparent:true,opacity:.6,depthWrite:false})));
 const dust=new T.BufferGeometry(),p=[];
 for(let i=0;i<125;i++){const x=hash(i*3.1)*1550-750,y=hash(i*8.3)*500-219,z=hash(i*4.2)*430-270,settle=Math.min(t,13.8);p.push(x+Math.sin(settle*.6+i)*10,y+(settle*(1.5+hash(i+7)*7))%44,z)}
 dust.setAttribute('position',new T.Float32BufferAttribute(p,3));
 root.add(new T.Points(dust,new T.PointsMaterial({color:0xff9b5c,transparent:true,opacity:.65*warmth(t),size:2.5,depthWrite:false})))
}
function objectFor(s,l,scene,extra=null,cam=null){
 const root=new T.Group();root.userData.layer=l.id;root.matrixAutoUpdate=false;root.matrix.copy(s.matrix(l));if(extra)root.matrix.premultiply(extra);scene.add(root);
 const v=k=>s.val(l,k),a=clamp(v('opacity')/100);
 if(a<=0)return root;
 if(l.type==='shape'||l.type==='text'){
  const r=F.geometry(l.motion&&s.motion?s.motion:s,l);
  if(l.forged){
   const progress=clamp(v('reveal')/100)*r.length,ghost=v('ghost')/100;
   const complete=[];
   if(ghost>0)mesh(root,meshGeo(r),basic(0x9f5832,ghost*a*.70),0,0,-1);
   r.forEach((p,i)=>{
    const w=clamp(progress-i),pts=p.points;
    if(ghost>0){
     ribbon(root,pts.map(p=>[p[0],p[1],.7]),1.1,0xc48158,ghost*a*.85,true);
    }
    if(w>.94){complete.push(p);ribbon(root,pts.map(p=>[p[0],p[1],1]),1.6,0xffca9a,a,true)}
    else if(w>0){
     const q=F.trim(p,0,w).points;
     const size=Math.min(...pts.map(p=>p[1])),height=Math.max(...pts.map(p=>p[1]))-size;
     const reveal=pts.map(p=>[p[0],Math.min(p[1],size+height*(.1+w)),0]);
     if(reveal.length>2)mesh(root,meshGeo([F.ring(reveal)]),metal(v('fill'),.54,.41,.64,'#ff7324',a*.92));
     ribbon(root,q.map(p=>[p[0],p[1],2]),5.1,0xffa051,a);ribbon(root,q.map(p=>[p[0],p[1],2.5]),1.85,0xfff1cf,a);
     const end=q.at(-1);if(end)mesh(root,new T.CircleGeometry(5,24),basic(0xffe9bc,a),end[0],end[1],4)
    }
   })
   if(complete.length)mesh(root,meshGeo(complete),metal(v('fill'),.52,.44,.46,'#ff7825',a))
  }else{
   const grouped=new Map();for(const p of r){const alpha=p.alpha??1,shade=p.tint||v('fill'),key=alpha+'|'+shade;if(!grouped.has(key))grouped.set(key,{alpha,shade,rings:[]});grouped.get(key).rings.push(p)}
   for(const {alpha,shade,rings} of grouped.values())mesh(root,meshGeo(grouped.size===1?r:rings),basic(shade,a*alpha));
   r.forEach(p=>ribbon(root,p.points.map(q=>[q[0],q[1],(q[2]||0)+.2]),v('strokeWidth')||(!p.closed?2:0),v('stroke')||v('fill'),a,p.closed))
  }
 }else if(l.type==='geometry'){
  const r=F.geometry(l.motion&&s.motion?s.motion:s,l),d=Math.max(0,v('depth')),g=meshGeo(r,d,clamp(v('bevel'),0,d*.48),v('twist'),v('bend'));
  if(g){
   const shade=r.find(p=>p.tint)?.tint||v('fill');
   const face=metal(shade,v('metal'),v('rough'),v('heat')*.38,v('emission'),a,metalTexture);
   const edge=metal(color(shade).multiplyScalar(.52),v('metal')+.13,v('rough')*.74,v('heat')*.62,'#ff6721',a,metalTexture);
   const m=mesh(root,g,d>.04?[face,edge]:face);m.castShadow=l.cast;m.receiveShadow=l.receive
  }
 }else if(l.type==='hammer'){
  const g=meshGeo([F.ring([[-78,-43],[-57,-55],[58,-55],[79,-34],[79,24],[57,42],[-60,42],[-80,25]])],v('depth'),5);
  const m=metal(v('fill'),v('metal'),v('rough'),v('heat'),0xf7863d,a,metalTexture);
  mesh(root,g,m,0,22,0);mesh(root,new T.BoxGeometry(97,13,148),metal(0x563c35,.7,.31,.07,0xdf7641,a),0,52,0);
  mesh(root,new T.BoxGeometry(53,31,95),m,0,72,0);mesh(root,new T.CylinderGeometry(25,27,280,8),metal(0x57545a,.75,.38,0,0xffffff,a),0,225,0);
  const faceZ=v('depth')/2+5.4;
  const panel=meshGeo([F.ring([[-63,-23],[62,-23],[67,-15],[67,0],[59,9],[-61,9],[-67,1],[-67,-15]])],3,1.5);
  mesh(root,panel,metal(0x292530,.72,.46,0,0xffffff,a),0,24,faceZ);
  for(let i=0;i<6;i++){
   const mark=mesh(root,new T.BoxGeometry(2.5,23,2),metal(i<3?0xbd764b:0x696169,.64,.45,.03,0xff6721,a),-50+7.5*i,17,faceZ+2);
   mark.rotation.z=-.38
  }
  for(const x of [-55,56]){
   const stud=mesh(root,new T.CylinderGeometry(3.5,3.5,4,6),m,x,40,faceZ);
   stud.rotation.x=Math.PI*.5
  }
  mesh(root,new T.BoxGeometry(122,3,3),metal(0x4b281e,.75,.45,v('heat')*.62,0xff692a,a),0,-25,faceZ);
 }else if(l.type==='stage')stage(s,l,root);
 else if(l.type==='particle')particles(l.motion&&s.motion?s.motion:s,l,root,cam);
 if(!l.forged&&['shape','text','geometry','hammer'].includes(l.type))root.traverse(o=>{
  if(o.isMesh&&[o.material].flat().every(m=>m.transparent))o.userData.depthComposite=true
 });
 return root
}
function plate(s,l){
 const id=l.id,key=[s.val(l,'text'),s.val(l,'fill'),Math.floor(s.time*60),s.comp.chapters.map(ch=>ch.name).join('')].join('|');
 let e=plates.get(id);
 if(!e){const cv=document.createElement('canvas');cv.width=1280;cv.height=720;const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;e={cv,tex};plates.set(id,e)}
 if(e.key===key)return e.tex;e.key=key;
 const ctx=e.cv.getContext('2d'), t=s.time,ch=s.comp.chapters.filter(c=>c.t<=t).at(-1), index=s.comp.chapters.indexOf(ch);
 ctx.clearRect(0,0,1280,720);const warm=t>11?'#aabaca':'#edab86',light=s.val(l,'fill'),quiet=t>11?'#7d8b9e':'#b7836a';
 function tx(str,x,y,font,fill){ctx.font=font;ctx.fillStyle=fill;ctx.fillText(str,x,y)}
 function ln(x,y,z,w,c,width=1){ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(z,w);ctx.stroke()}
 const far=1218,low=670;
 ctx.globalAlpha=.67;
 for(const [x,y,dx,dy] of [[36,34,1,1],[1244,34,-1,1],[36,686,1,-1],[1244,686,-1,-1]]){ln(x,y,x+dx*16,y,quiet,1.5);ln(x,y,x,y+dy*16,quiet,1.5)}
 ln(63,63,134,63,quiet);ln(far-34,63,far,63,quiet);ln(far-30,low,far,low,quiet);
 for(let i=0;i<9;i++)ln(far,288+i*15,far-(i%4===0?13:5),288+i*15,quiet);
 ctx.globalAlpha=1;
 tx('F / 01',63,86,'600 15px Consolas, monospace',warm);
 tx('铸造记录  /  材料研究',63,222,'500 17px "Microsoft YaHei", sans-serif',quiet);
 const str=String(s.val(l,'text'));tx(str.length===2?[...str].join(' '):str,59,300,'700 72px "Microsoft YaHei", sans-serif',light);
 tx('F O R G E D   T Y P E',65,333,'600 14px Consolas, monospace',warm);
 ln(64,366,113,366,warm,1.5);tx(ch?.name||'001',64,398,'500 18px "Microsoft YaHei", sans-serif',light);
 ctx.globalAlpha=.76;
 tx('THERMAL FORM STUDY',64,646,'600 14px Consolas, monospace',warm);
 tx('字模 / 金属 / 冷却',64,668,'500 13px "Microsoft YaHei", sans-serif',quiet);
 ctx.textAlign='right';tx('MAT.  FE–01',far,86,'600 14px Consolas, monospace',warm);
 tx('T+'+t.toFixed(2).padStart(5,'0')+' s',far,650,'600 14px Consolas, monospace',warm);ctx.textAlign='left';
 for(let i=0;i<4;i++){ctx.globalAlpha=i===index?.87:.31;ctx.fillStyle=warm;ctx.fillRect(far-84+i*22,668,18,2)}
 ctx.globalAlpha=1;e.tex.needsUpdate=true;return e.tex
}
const plateShader=shader('uniform sampler2D map;uniform float opacity;void main(){gl_FragColor=texture2D(map,uv0);gl_FragColor.a*=opacity;}',{map:null,opacity:1},{transparent:true});
function triangleData(s,l,emitter){
 let rings,mat,depth=0;
 if(emitter?.node){
  rings=F.nodeValue(s,emitter.node)||[];
  l=l||s.comp.layers.find(q=>q.type==='geometry'&&q.node===emitter.node);
  mat=l?s.matrix(l):s.matrix(emitter);depth=l?(s.val(l,'depth')||0):0;
 }else if(l){
  if(l.type==='precomp'&&l.sharedSpace||l.type==='stage'){
   let transform=s.matrix(l).clone(),y=s.val(l,'height');
   if(l.type==='precomp'){
    const comp=s.project.comps.find(c=>c.id===l.source),stage=comp?.layers.find(x=>x.type==='stage'&&x.visible);if(!stage)return {tri:[]};
    const sub=F.sampler(s.project,comp,remap(s,l));y=sub.val(stage,'height');transform.multiply(sub.matrix(stage))
   }
   const normal=V(0,1,0).transformDirection(transform);
   return {planes:[{center:V(61,y+3.5,0).applyMatrix4(transform),normal,radius:314,inverse:transform.clone().invert()},{center:V(0,y-36,0).applyMatrix4(transform),normal,radius:Infinity,inverse:null}]}
  }
  rings=F.geometry(s,l);mat=s.matrix(l);depth=s.val(l,'depth')||0
 }
 if(!rings?.length)return {tri:[],total:0,edges:[]};
 const g=meshGeo(rings,depth,l?clamp(s.val(l,'bevel')||0,0,depth*.48):0,l?s.val(l,'twist')||0:0,l?s.val(l,'bend')||0:0);
 const tri=[],edges=[];let total=0,distance=0;
 if(g){
  const p=g.attributes.position,ix=g.index?.array||Array.from({length:p.count},(_,i)=>i);
  for(let i=0;i<ix.length;i+=3){
   const a=V().fromBufferAttribute(p,ix[i]).applyMatrix4(mat),b=V().fromBufferAttribute(p,ix[i+1]).applyMatrix4(mat),c=V().fromBufferAttribute(p,ix[i+2]).applyMatrix4(mat);
   const n=b.clone().sub(a).cross(c.clone().sub(a)),ar=n.length()*.5;if(ar<.001)continue;
   total+=ar;tri.push({a,b,c,n:n.normalize(),cum:total,box:new T.Box3().setFromPoints([a,b,c])})
  }
 }
 for(const r of rings){
  const m=F.measure(r);for(let i=1;i<m.pts.length;i++){const a=V(...m.pts[i-1]).applyMatrix4(mat),b=V(...m.pts[i]).applyMatrix4(mat);distance+=a.distanceTo(b);edges.push({a,b,cum:distance})}
 }
 return {tri,total,edges,distance}
}
function collisionGrid(triangles,previous){
 const cells=new Map(),cell=75;
 const axis=v=>Math.floor(v/cell);
 const visit=(box,callback)=>{
  const x0=axis(box.min.x),x1=axis(box.max.x),y0=axis(box.min.y),y1=axis(box.max.y),z0=axis(box.min.z),z1=axis(box.max.z);
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)callback(x+' '+y+' '+z)
 };
 const items=triangles.map((tri,index)=>{
  const before=previous?.[index],former=before&&before.a.distanceToSquared(tri.a)<10000?before:null;
  const box=former?tri.box.clone().union(former.box):tri.box;
  const drift=former?tri.a.clone().add(tri.b).add(tri.c).sub(former.a).sub(former.b).sub(former.c).multiplyScalar(1/3):V();
  return {tri,former,box,drift,index}
 });
 if(items.length<80)return ()=>items;
 const wide=[];
 for(const item of items){
  const {box}=item;
  if((axis(box.max.x)-axis(box.min.x)+1)*(axis(box.max.y)-axis(box.min.y)+1)*(axis(box.max.z)-axis(box.min.z)+1)>300){wide.push(item);continue}
  visit(box,code=>{if(!cells.has(code))cells.set(code,[]);cells.get(code).push(item)})
 }
 return bounds=>{
  const found=new Set(wide);
  if(bounds.getSize(V()).length()>1500)return items;
  visit(bounds,code=>{for(const entry of cells.get(code)||[])found.add(entry)});
  return found
 }
}
function simAt(s,l){
 const simId=s.comp.id+':'+l.id;
 let sim=simulations.get(simId);
 if(!sim){sim={frames:[],live:[],step:Math.max(0,Math.floor(l.start*60)),carry:0,id:0};simulations.set(simId,sim)}
 const rate=60, sample=s.time*rate, max=Math.ceil(sample-1e-7), dt=1/rate, cp=s.comp;
 while(sim.step<=max){
  const step=sim.step++,t=step/rate,q=F.sampler(s.project,cp,t),v=k=>q.val(l,k),seed=v('seed');
  const emit=v('rate')/rate+sim.carry;let count=Math.max(0,Math.floor(emit));sim.carry=emit-count;
  count+= (l.bursts||[]).filter(([x])=>Math.ceil(x*rate-1e-6)===step).reduce((sum,[x,n])=>sum+n,0);
  if(t<l.start||t>l.end)count=0;
  const source=cp.layers.find(x=>x.id===l.source), geo=count>0?triangleData(q,source,l):null;
  const cs=(l.colliders||[]).map(id=>cp.layers.find(o=>o.id===id)).filter(Boolean);
  const col=sim.live.length?cs.map(o=>triangleData(q,o)):[],prev=sim.prev||[];sim.prev=col;
  const queries=col.map((part,i)=>part.tri?.length?collisionGrid(part.tri,prev[i]?.tri?.length===part.tri.length?prev[i].tri:null):null);
  const fields=(l.fields||[]).map(id=>cp.layers.find(o=>o.id===id)).filter(Boolean);
  const next=[];
  for(const p of sim.live){
   const age=t-p.birth;if(age>p.life)continue;
   const old=p.p.clone(),force=V(...v('force'));force.y-=v('gravity');
   if(l.attraction){const a=V().setFromMatrixPosition(q.matrix(l)).sub(old);force.addScaledVector(a.normalize(),l.attraction)}
   for(const f of fields)force.addScaledVector(F.fieldVector(q,f,old),16);
   p.vel.addScaledVector(force,dt).multiplyScalar(Math.exp(-Math.max(0,v('drag'))*dt));p.p.addScaledVector(p.vel,dt);
   const d=p.p.clone().sub(old),length=d.length();
   for(let k=0;k<col.length;k++){
    const data=col[k];let n,hit,move=V();
    for(let j=0;j<(data.planes?.length||0);j++){
     const part=data.planes[j],before=prev[k]?.planes?.[j]||part,relative=part.center.clone().sub(before.center),origin=old.clone().add(relative);
     const plane=new T.Plane().setFromNormalAndCoplanarPoint(part.normal,part.center);
     if(plane.distanceToPoint(origin)<0||plane.distanceToPoint(p.p)>0)continue;
     const point=plane.intersectLine(new T.Line3(origin,p.p),V());if(!point)continue;
     if(part.inverse){const local=point.clone().applyMatrix4(part.inverse);if(Math.hypot(local.x-61,local.z)>part.radius)continue}
     n=part.normal;hit=point;move=relative.multiplyScalar(rate);break
    }
    if(data.tri?.length&&(length>.0001||prev[k]?.tri?.length)){
     const bounds=new T.Box3().setFromPoints([old,p.p]).expandByScalar(1.2);let earliest=1.00001,bestIndex=Infinity;
     for(const {tri,former,box,drift,index} of queries[k](bounds)){
      if(!bounds.intersectsBox(box))continue;
      const origin=old.clone().add(drift),to=p.p.clone().sub(origin),len=to.length();if(len<=.0001)continue;
      const ray=new T.Ray(origin,to.divideScalar(len)),point=ray.intersectTriangle(tri.a,tri.b,tri.c,false,V());if(!point)continue;
      const test=point.distanceTo(origin)/len;
      if(test<earliest||(test===earliest&&index<bestIndex)){
       earliest=test;bestIndex=index;hit=point;n=tri.n.clone();if(n.dot(to)>0)n.negate();
       if(former){
        const b=T.Triangle.getBarycoord(point,tri.a,tri.b,tri.c,V());
        move=point.clone().addScaledVector(former.a,-b.x).addScaledVector(former.b,-b.y).addScaledVector(former.c,-b.z).multiplyScalar(rate);
       }else move=V()
      }
     }
    }
    if(n&&hit){
     p.p.copy(hit).addScaledVector(n,.9);
     p.vel.sub(move);
     const dot=p.vel.dot(n),normalSpeed=dot<0?-dot*clamp(v('bounce'),0,2):dot;
     p.vel.addScaledVector(n,-dot).multiplyScalar(1-clamp(v('friction'))).addScaledVector(n,normalSpeed).add(move);p.hit=true;
     if(l.hitLife)p.life=Math.min(p.life,age+l.hitLife);
     if(l.secondary&&!p.generation&&next.length<700)next.push({...p,id:++sim.id,p:p.p.clone(),vel:p.vel.clone().multiplyScalar(.45).addScaledVector(n,45),birth:t,life:.22,history:[p.p.clone()],generation:1})
    }
   }
   p.history.push(p.p.clone());if(p.history.length>120)p.history.shift();next.push(p)
  }
  sim.live=next;
  const emitterMatrix=q.matrix(l),emitter=V().setFromMatrixPosition(emitterMatrix),atImpact=fields[0],center=atImpact?V().setFromMatrixPosition(q.matrix(atImpact)):emitter;
  const movingSource=l.emitter==='point'?l:source||l;
  const inherited=(v('inheritMotion')??.18)*rate;
  const moveSource=count>0&&inherited?F.sampler(s.project,cp,Math.max(l.start,t-dt)).matrix(movingSource).clone().multiply(q.matrix(movingSource).clone().invert()):null;
  const impact=geo?.tri?.filter(x=>x.a.distanceTo(center)<148&&x.n.z>-.5);
  for(let i=0;i<Math.min(count,350)&&sim.live.length<1000;i++){
   const id=++sim.id,a=hash(id*5.23+seed),b=hash(id*31.4+seed),c=hash(id*4.19+seed),d=hash(id*8.53+seed),e=hash(id*7.89+seed);
   let p=emitter.clone(),normal=V(0,1,0).transformDirection(emitterMatrix);
   if(geo?.distance&&l.emitter==='curve'){
    const ed=geo.edges.find(ed=>ed.cum>=a*geo.distance);
    p=ed.a.clone().lerp(ed.b,b);
    const tangent=ed.b.clone().sub(ed.a).normalize();normal.addScaledVector(tangent,-normal.dot(tangent)).normalize()
   }
   else if(geo?.total&&l.emitter!=='point'){
    const tri=l.bursts?.length&&impact?.length?impact[Math.floor(a*impact.length)]:geo.tri.find(x=>x.cum>=a*geo.total);
    const r=Math.sqrt(b),u=1-r,vv=r*(1-c);
    p=tri.a.clone().multiplyScalar(u).addScaledVector(tri.b,vv).addScaledVector(tri.c,1-u-vv);normal=tri.n.clone();
    if(l.bursts?.length)normal.y=Math.abs(normal.y)*.7+.24;
    p.addScaledVector(normal,2)
   }
   const theta=e*Math.PI*2;const vel=normal.addScaledVector(V(Math.cos(theta),d*.92-.19,Math.sin(theta)),v('spread')).normalize().multiplyScalar(v('speed')*(.35+.95*d));
   if(moveSource)vel.addScaledVector(p.clone().sub(p.clone().applyMatrix4(moveSource)),inherited);
   if(l.bursts?.length)vel.y+=51;
   sim.live.push({id,p,vel,birth:t,life:Math.max(.04,v('life')*(.46+b*.91)),size:(.42+e*1.18)*v('particleSize'),history:[p.clone()],hit:false,generation:0})
  }
  sim.frames[step]=sim.live.map(p=>({id:p.id,p:p.p.clone(),life:clamp((t-p.birth)/p.life),size:p.size,hit:p.hit,history:p.history.slice()}))
 }
 const next=sim.frames[max]||[],weight=sample-(max-1);
 if(weight>=1-1e-7)return next;
 const following=new Map(next.map(p=>[p.id,p]));
 return (sim.frames[max-1]||[]).map(p=>{
  const q=following.get(p.id);if(!q)return p;
  const point=p.p.clone().lerp(q.p,weight);
  return {...p,p:point,life:lerp(p.life,q.life,weight),history:[...p.history,point]}
 })
}
function particles(s,l,root,cam){
 const data=simAt(s,l);if(!data.length)return;
 root.matrix.identity();
 const start=color(s.val(l,'fill')),end=color(s.val(l,'endColor')),trail=s.val(l,'trail'),alpha=clamp(s.val(l,'opacity')/100),width=s.val(l,'trailWidth');
 const trailTint=l.customTrail?color(s.val(l,'trailColor')||'#ff852f'):null;
 const trailFade=Math.max(.02,s.val(l,'trailFade')??1.4),fade=Math.max(.02,s.val(l,'particleFade')??1),endSize=Math.max(0,(s.val(l,'endSize')??35)/100);
 const pos=[],sizes=[],co=[],a=[],lines=[],tints=[];
 for(const p of data){
  const hue=p.hit&&l.hitColor?color(l.hitColor):start.clone().lerp(end,p.life);
  const visible=(1-p.life)**fade*alpha;
  pos.push(...p.p);sizes.push(Math.max(.3,p.size*lerp(1,endSize,p.life)));a.push(visible);co.push(hue.r,hue.g,hue.b);
  if(trail<=.001)continue;
  const h=p.history.slice(-Math.max(2,Math.ceil(trail*60)));
  for(let j=1;j<h.length;j++){
   const o=h[j-1],q=h[j],view=cam?cam.position.clone().sub(q):V(0,0,1);
   const side=view.cross(q.clone().sub(o)).normalize().multiplyScalar(width*(j/h.length)*.5);
   const a=o.clone().addScaledVector(side,.7),b=o.clone().addScaledVector(side,-.7),c=q.clone().add(side),d=q.clone().sub(side);
   lines.push(...a,...b,...c,...b,...d,...c);
   const tint=trailTint||hue;
   for(const u of [j-1,j-1,j,j-1,j,j])tints.push(tint.r,tint.g,tint.b,(u/h.length)**trailFade*visible*.94)
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('size',new T.Float32BufferAttribute(sizes,1));g.setAttribute('tint',new T.Float32BufferAttribute(co,3));g.setAttribute('fade',new T.Float32BufferAttribute(a,1));
 const mat=new T.ShaderMaterial({uniforms:{resolution:{value:H}},vertexShader:`attribute float size;attribute vec3 tint;attribute float fade;uniform float resolution;varying vec4 c;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=max(1.6,size*5.3*resolution/max(80.,-p.z));c=vec4(tint,fade);}`,fragmentShader:`varying vec4 c;void main(){float a=length(gl_PointCoord-.5)*2.;if(a>1.)discard;gl_FragColor=vec4(c.rgb*(1.+2.*exp(-a*a*8.)),c.a*exp(-a*a*4.6));}`,transparent:true,blending:T.AdditiveBlending,depthWrite:false});
 root.add(new T.Points(g,mat));
 if(lines.length){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(lines,3));g.setAttribute('tint',new T.Float32BufferAttribute(tints,4));
  const m=new T.ShaderMaterial({vertexShader:`attribute vec4 tint;varying vec4 c;void main(){c=tint;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:'varying vec4 c;void main(){gl_FragColor=vec4(c.rgb*2.4,c.a);}',side:T.DoubleSide,transparent:true,blending:T.AdditiveBlending,depthWrite:false});
  root.add(new T.Mesh(g,m))
 }
}

const post=shader(`
 uniform sampler2D map,depth,transparentDepth;uniform float focus,aperture,near,far;uniform vec2 px;
 void main(){
  vec4 c=texture2D(map,uv0);
  float d=min(texture2D(depth,uv0).x,texture2D(transparentDepth,uv0).x),z=near*far/(far-d*(far-near)),blur=clamp(abs(z-focus)/max(1.,z)*aperture,0.,21.);
  if(blur>.3){vec4 a=c;for(int i=0;i<12;i++){float th=float(i)*2.39996;a+=texture2D(map,uv0+vec2(cos(th),sin(th))*sqrt(float(i+1)/12.)*blur*px);}c=a/13.;}
  vec3 b=vec3(0.);
  for(int i=0;i<14;i++){float th=float(i)*2.39996;vec2 q=uv0+vec2(cos(th),sin(th))*sqrt(float(i+1)/14.)*9.*px;b+=max(vec3(0.),texture2D(map,q).rgb-.61)*.042;}
  c.rgb+=b;c.rgb=c.rgb/(1.+.22*max(max(c.r,c.g),c.b));gl_FragColor=c;
 }`,{map:null,depth:null,transparentDepth:null,focus:800,aperture:0,near:5,far:8000,px:new T.Vector2()});
const gaussian=shader(`
 uniform sampler2D map;uniform vec2 direction;uniform float radius;
 void main(){
  vec4 total=vec4(0.);float sum=0.;
  for(int i=-8;i<=8;i++){
   float x=float(i)/8.,w=exp(-4.5*x*x);
   vec2 at=uv0+direction*x*radius;
   if(all(greaterThanEqual(at,vec2(0.)))&&all(lessThanEqual(at,vec2(1.)))) total+=texture2D(map,at)*w;
   sum+=w;
  }
  gl_FragColor=total/sum;
 }`,{map:null,direction:new T.Vector2(),radius:0});
const effectShader=shader(`
 uniform sampler2D map,blurred;uniform int mode;uniform float amount,power,sat,light;uniform vec2 shift,px;uniform vec3 tint;
 vec3 toHsv(vec3 c){
  vec4 k=vec4(0.,-.33333333,.66666667,-1.);
  vec4 p=mix(vec4(c.bg,k.wz),vec4(c.gb,k.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y);
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-7)),d/(q.x+1e-7),q.x);
 }
 vec3 fromHsv(vec3 c){
  vec3 k=abs(fract(c.x+vec3(0.,.66666667,.33333333))*6.-3.);
  return c.z*mix(vec3(1.),clamp(k-1.,0.,1.),c.y);
 }
 void main(){
  vec4 c=texture2D(map,uv0);
  if(mode==1||mode==2){
   vec2 at=uv0-shift*px;
   float a=0.;if(all(greaterThanEqual(at,vec2(0.)))&&all(lessThanEqual(at,vec2(1.)))) a=clamp(texture2D(blurred,at).a*power,0.,1.);
   c=vec4(c.rgb+tint*a*(1.-c.a),c.a+a*(1.-c.a));
  }else if(c.a>1.e-6){
   vec3 hsv=toHsv(max(vec3(0.),c.rgb/c.a));
   hsv=vec3(fract(hsv.x+amount/360.),clamp(hsv.y*sat,0.,1.),hsv.z*max(0.,light));
   c.rgb=fromHsv(hsv)*c.a;
  }
  gl_FragColor=c;
 }`,{map:null,blurred:null,mode:0,amount:0,power:1,sat:1,light:1,shift:new T.Vector2(),px:new T.Vector2(),tint:new T.Color()});
const blendShader=shader(`
 uniform sampler2D back,fore,mask,matte;uniform int mode,matteMode;uniform bool useMask,adjust;uniform float opacity;
 void main(){
  vec4 b=texture2D(back,uv0),f=texture2D(fore,uv0);float a=opacity;
  if(useMask)a*=texture2D(mask,uv0).a;
  if(matteMode>0){vec4 m=texture2D(matte,uv0);float k=matteMode<=2?m.a:dot(m.rgb,vec3(.2126,.7152,.0722));a*=mod(float(matteMode),2.)==0.?1.-k:k;}
  if(adjust){gl_FragColor=mix(b,f,a);return;}f*=a;
  vec3 cb=b.a>0.?b.rgb/b.a:vec3(0.),cf=f.a>0.?f.rgb/f.a:vec3(0.),c=cf;
  if(mode==1)c=cb+cf;if(mode==2)c=cb+cf-cb*cf;if(mode==3)c=cb*cf;
  if(mode==4)c=mix(2.*cb*cf,1.-2.*(1.-cb)*(1.-cf),step(.5,cb));
  gl_FragColor=vec4((1.-f.a)*b.rgb+(1.-b.a)*f.rgb+b.a*f.a*c,f.a+b.a*(1.-f.a));
 }`,{back:null,fore:null,mask:null,matte:null,mode:0,matteMode:0,useMask:false,adjust:false,opacity:1});
const accumulate=shader('uniform sampler2D map;uniform float amount;void main(){gl_FragColor=texture2D(map,uv0)*amount;}',{map:null,amount:1},{transparent:true,blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneFactor});
const compositeDepth=shader('uniform sampler2D front,behind;void main(){vec4 f=texture2D(front,uv0);gl_FragColor=f+texture2D(behind,uv0)*(1.-f.a);}',{front:null,behind:null});
function uniforms(m,params){for(const [k,v] of Object.entries(params))m.uniforms[k].value=v}
function renderScene(scene,cam,rt){
 rr.setRenderTarget(rt);rr.autoClear=false;rr.render(scene,cam);rr.autoClear=true
}
function renderDepth(scene,cam,raw){
 const surfaces=[],other=[];
 scene.traverse(o=>{if(o.visible&&(o.isMesh||o.isLine||o.isPoints))(o.userData.depthComposite?surfaces:other).push(o)});
 if(!surfaces.length){renderScene(scene,cam,raw);return {map:raw,depth:raw.depthTexture}}
 for(const o of surfaces)o.visible=false;
 renderScene(scene,cam,raw);
 rr.shadowMap.autoUpdate=false;
 for(const o of other)o.visible=false;
 for(const o of surfaces)o.visible=true;
 const materials=new Map();
 const settings={opaqueDepth:{value:raw.depthTexture},previousDepth:{value:raw.depthTexture},peelFirst:{value:true},peelSize:{value:new T.Vector2(W,H)}};
 for(const [i,o] of surfaces.entries()){
  const list=[o.material].flat().map(original=>{
   const m=original.clone();
   m.blending=T.NoBlending;m.depthWrite=true;m.alphaTest=.001;m.forceSinglePass=true;
   m.onBeforeCompile=p=>{
    original.onBeforeCompile(p);
    Object.assign(p.uniforms,settings,{peelBias:{value:(i+1)*1e-7}});
    p.fragmentShader='uniform sampler2D opaqueDepth,previousDepth; uniform bool peelFirst; uniform vec2 peelSize; uniform float peelBias;\n'+p.fragmentShader;
    const depthTest=[
     '#include <clipping_planes_fragment>',
     'vec2 screenUV=gl_FragCoord.xy/peelSize;',
     'float z=gl_FragCoord.z-peelBias;',
     'if(z>texture2D(opaqueDepth,screenUV).x) discard;',
     'if(!peelFirst && z<=texture2D(previousDepth,screenUV).x+2e-8) discard;',
     'gl_FragDepth=z;'
    ].join('\n');
    p.fragmentShader=p.fragmentShader.replace('#include <clipping_planes_fragment>',depthTest);
    p.fragmentShader=p.fragmentShader.replace('#include <premultiplied_alpha_fragment>','gl_FragColor.rgb *= gl_FragColor.a;');
   };
   m.customProgramCacheKey=()=> 'forge-depth-peel:'+original.customProgramCacheKey();
   return m
  });
  materials.set(o,o.material);o.material=Array.isArray(o.material)?list:list[0]
 }
 let acc=target('peelAccum0');clear(acc);
 const first=target('peelFirst',true);
 for(let i=0;i<Math.min(surfaces.length*2,6);i++){
  const current=i===0?first:target('peelStep'+i%2,true);clear(current);renderScene(scene,cam,current);
  settings.peelFirst.value=false;settings.previousDepth.value=current.depthTexture;
  const dest=target('peelAccum'+(i+1)%2);
  uniforms(compositeDepth,{front:acc.texture,behind:current.texture});pass(compositeDepth,dest);acc=dest
 }
 for(const [o,old] of materials){[o.material].flat().forEach(m=>m.dispose());o.material=old}
 for(const o of other)o.visible=true;
 rr.shadowMap.autoUpdate=true;
 const map=target('peelResult');
 uniforms(compositeDepth,{front:acc.texture,behind:raw.texture});pass(compositeDepth,map);
 return {map,depth:first.depthTexture}
}
function disposeScene(scene){
 const cached=new Set(meshes.values());
 scene.traverse(o=>{
  if(o.isLight&&o.shadow?.map)o.shadow.map.dispose();
  if(o.geometry&&!cached.has(o.geometry))o.geometry.dispose();
  if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}
 })
}
function preview(s,ls,cam,id,keep=false,planes=new Map()){
 const raw=target(id+'raw',true);clear(raw);
 if(ls.some(l=>l.type==='stage'||l.type==='precomp'&&l.sharedSpace&&s.project.comps.find(c=>c.id===l.source)?.layers.some(x=>x.type==='stage'&&x.visible))){
  background.uniforms.heat.value=warmth(s.time);pass(background,raw)
 }
 const scene=new T.Scene();lighting(s,scene);
 const order=[...ls].reverse();
 for(const l of order){
  if(planes.has(l.id)){
   const {rt,comp}=planes.get(l.id),o=compositionPlane(s,l,rt,comp);
   o.userData.layer=l.id;o.userData.depthComposite=true;scene.add(o)
  }else if(l.type==='precomp'&&l.sharedSpace){
   const sub=s.project.comps.find(c=>c.id===l.source);if(!sub)continue;
   const q=F.sampler(s.project,sub,remap(s,l));const extra=s.matrix(l);
   for(const child of sub.layers.filter(q.active).reverse()){const root=objectFor(q,child,scene,extra,cam);root.userData.layer=l.id}
  }else if(['text','shape','geometry','particle','stage','hammer'].includes(l.type)){
   const obj=objectFor(s,l,scene,null,cam);
   if(l.type==='text'||l.type==='shape')obj.traverse(o=>{if(o.isMesh||o.isLine)o.renderOrder=order.indexOf(l)+1})
  }
 }
 const result=renderDepth(scene,cam,raw);
 if(keep){if(lastScene)disposeScene(lastScene);lastScene=scene;lastCamera=cam;lastSampler=s}
 else disposeScene(scene);
 const rt=target(id+'post');
 uniforms(post,{map:result.map.texture,depth:raw.depthTexture,transparentDepth:result.depth,focus:cam.userData.focus,aperture:cam.userData.aperture});post.uniforms.px.value.set(1/W,1/H);
 pass(post,rt);
 for(const l of order.filter(l=>l.type==='plate')){uniforms(plateShader,{map:plate(s,l),opacity:s.val(l,'opacity')/100});pass(plateShader,rt,true)}
 return rt
}
function effects(s,l,rt,id){
 const t=l.motion&&s.motion?s.motion.time:s.time;
 const value=(p,fallback)=>p?.keys?F.base(p,t):p??fallback;
 l.effects.forEach(e=>{
  const first=target(id+'fx0'),dest=rt===first?target(id+'fx1'):first;
  const scale=H/s.comp.height;
  const amount=value(e.amount,0);
  let blurred=rt;
  if(e.type!=='hsb'&&amount>0){
   const intermediate=target('gaussian-horizontal'),out=e.type==='blur'?dest:target('gaussian-vertical');
   uniforms(gaussian,{map:rt.texture,radius:amount*scale});gaussian.uniforms.direction.value.set(1/W,0);
   pass(gaussian,intermediate);
   gaussian.uniforms.map.value=intermediate.texture;gaussian.uniforms.direction.value.set(0,1/H);
   pass(gaussian,out);blurred=out;
  }
  if(e.type==='blur'){rt=blurred;return}
  uniforms(effectShader,{map:rt.texture,blurred:blurred.texture,mode:['blur','glow','shadow','hsb'].indexOf(e.type),amount,power:value(e.power,1),sat:value(e.sat,1),light:value(e.light,1)});
  effectShader.uniforms.tint.value.set(value(e.color,'#ffffff'));effectShader.uniforms.shift.value.set(e.type==='shadow'?value(e.x,0)*scale:0,e.type==='shadow'?-value(e.y,0)*scale:0);effectShader.uniforms.px.value.set(1/W,1/H);
  pass(effectShader,dest);rt=dest
 });
 return rt
}
function maskTexture(s,l,cam){
 const out=document.createElement('canvas'),tmp=document.createElement('canvas');out.width=tmp.width=W;out.height=tmp.height=H;
 const ctx=out.getContext('2d'),m=tmp.getContext('2d'), mat=s.matrix(l),t=l.motion&&s.motion?s.motion.time:s.time;
 l.masks.forEach((p,i)=>{
  m.clearRect(0,0,W,H);m.fillStyle='#fff';m.filter='none';m.globalCompositeOperation='source-over';
  if(p.invert)m.fillRect(0,0,W,H);
  m.globalCompositeOperation=p.invert?'destination-out':'source-over';
  const f=F.base(p.feather,t)*H/s.comp.height;m.filter=f>.1?'blur('+f+'px)':'none';
  const w=F.base(p.width,t)/2,h=F.base(p.height,t)/2,pos=F.base(p.position,t);
  const pts=p.type==='ellipse'?Array.from({length:60},(_,i)=>[w*Math.cos(i*Math.PI/30),h*Math.sin(i*Math.PI/30)]):p.type==='path'&&p.path?F.base(p.path,t):[[-w,-h],[w,-h],[w,h],[-w,h]];
  m.beginPath();pts.forEach((a,j)=>{
   const p=V(a[0]+pos[0],a[1]+pos[1],pos[2]||0).applyMatrix4(mat).project(cam),x=(p.x*.5+.5)*W,y=(.5-p.y*.5)*H;
   if(j)m.lineTo(x,y);else m.moveTo(x,y)
  });m.closePath();m.fill();
  ctx.globalCompositeOperation=i&&p.mode==='intersect'?'destination-in':i&&p.mode==='subtract'?'destination-out':'source-over';ctx.drawImage(tmp,0,0)
 });
 return new T.CanvasTexture(out)
}
function blend(back,fore,dest,{op='source-over',mask=null,matte=null,matteMode=0,adjust=false,alpha=1}={}){
 uniforms(blendShader,{back:back.texture,fore:fore.texture,mask:mask||fore.texture,matte:(matte||fore).texture,useMask:!!mask,matteMode,mode:Math.max(0,['source-over','lighter','screen','multiply','overlay'].indexOf(op)),adjust,opacity:alpha});
 pass(blendShader,dest)
}
function remap(s,l){
 const p=l.p.remap,duration=s.project.comps.find(c=>c.id===l.source)?.duration||s.comp.duration;
 const t=l.motion&&s.motion?s.motion.time:s.time;
 return clamp(p.keys.length||p.expr?s.val(l,'remap'):t-l.start+(l.offset||0),0,duration)
}
function compositionPlane(s,l,source,sub){
 const g=new T.PlaneGeometry(sub.width,sub.height);
 const m=new T.MeshBasicMaterial({map:source.texture,transparent:true,side:T.DoubleSide,opacity:clamp(s.val(l,'opacity')/100),depthWrite:false,alphaTest:.001,forceSinglePass:true});
 m.onBeforeCompile=p=>{
  p.fragmentShader=p.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb /= max(diffuseColor.a / max(opacity, .0001), .0001);');
 };
 const o=new T.Mesh(g,m);o.matrixAutoUpdate=false;o.matrix.copy(s.matrix(l));o.userData.textureResult=source;return o
}
function transformed(s,l,cam,source,id,sub){
 const rt=target(id+'plane'),scene=new T.Scene();clear(rt);
 scene.add(compositionPlane(s,l,source,sub));
 const canvasCam=new T.OrthographicCamera(-s.comp.width/2,s.comp.width/2,s.comp.height/2,-s.comp.height/2,1,12000);
 canvasCam.position.z=5000;
 rr.setRenderTarget(rt);rr.render(scene,l.is3d?cam:canvasCam);disposeScene(scene);return rt
}
function renderComp(project,comp,t,id='root',stack=[],motionTime=null){
 if(stack.includes(comp.id)||stack.length>8){const blank=target(id+'blank');clear(blank);return blank}
 stack=[...stack,comp.id];
 const s=F.sampler(project,comp,t);
 if(motionTime!==null){
  const motion=F.sampler(project,comp,motionTime),sv=s.val,sm=s.matrix;s.val=(l,k,x)=>l.motion?motion.val(l,k,x):sv(l,k,x);s.matrix=(l,seen)=>l.motion?motion.matrix(l,seen):sm(l,seen);s.motion=motion
 }
 const cam=cameraFor(s,orbit&&id==='root');
 const active=comp.layers.filter(l=>l.motion&&s.motion?s.motion.active(l):s.active(l)).filter(l=>!['audio','field','null','camera','light'].includes(l.type));
 const special=l=>l.type==='adjust'||l.type==='precomp'&&!l.sharedSpace&&!l.is3d||l.masks.length||l.effects.length||l.blend!=='source-over'||l.matte;
 const planes=new Map();
 for(const l of active.filter(q=>q.type==='precomp'&&q.is3d&&!q.sharedSpace&&!special(q))){
  const sub=project.comps.find(c=>c.id===l.source);
  if(sub)planes.set(l.id,{rt:renderSampled(project,sub,remap(s,l),id+l.id+'space',stack),comp:sub})
 }
 if(id==='root')rootPlanes=planes;
 if(!active.some(special))return preview(s,active,cam,id,id==='root',planes);
 let current=target(id+'mix0');clear(current);let batch=[],n=0,ng=0;
 if(id==='root'){if(lastScene)disposeScene(lastScene);lastScene=null;lastSampler=s;lastCamera=cam}
 const next=()=>target(id+'mix'+((++n)%2));
 const flush=()=>{if(!batch.length)return;const rt=preview(s,batch,cam,id+'grp'+(ng++%2),false,planes);const dest=next();blend(current,rt,dest);current=dest;batch=[]};
 const matteIds=new Set(active.map(l=>l.matte?.source).filter(Boolean));
 if(id==='root')rootMatteIds=matteIds;
 function layerPass(l,lid){
  if(l.type==='precomp'&&!l.sharedSpace){
   const sub=project.comps.find(c=>c.id===l.source);
   if(sub){
    const rt=renderSampled(project,sub,remap(s,l),lid+'sub',stack);
    return transformed(s,l,cam,rt,lid,sub)
   }
  }
  return preview(s,[l],cam,lid)
 }
 function layerContent(l,lid,seen=new Set()){
  if(seen.has(l.id)){const blank=target(lid+'cycle');clear(blank);return blank}
  seen=new Set(seen);seen.add(l.id);
  let rt=layerPass(l,lid);
  const matte=l.matte&&active.find(x=>x.id===l.matte.source);
  if(l.masks.length||matte){
   const blank=target(id+'blank');clear(blank);
   const cut=target(lid+'cut');
   const mask=l.masks.length?maskTexture(s,l,cam):null;
   blend(blank,rt,cut,{mask,matte:matte?layerContent(matte,lid+'matte',seen):null,matteMode:matte?l.matte.mode:0});
   mask?.dispose();rt=cut
  }
  return l.effects.length?effects(s,l,rt,lid):rt
 }
 for(const l of [...active].reverse()){
  if(matteIds.has(l.id))continue;
  if(!special(l)){batch.unshift(l);continue}
  flush();
  const lid=id+l.id,adjust=l.type==='adjust',rt=adjust?effects(s,l,current,lid):layerContent(l,lid);
  if(id==='root'&&!adjust)rootCoverage.set(l.id,rt);
  const dest=next(),mask=adjust&&l.masks.length?maskTexture(s,l,cam):null,matte=adjust&&l.matte&&active.find(x=>x.id===l.matte.source);
  blend(current,rt,dest,{op:l.blend,mask,adjust,alpha:adjust?clamp(s.val(l,'opacity')/100):1,matte:matte?layerContent(matte,lid+'matte'):null,matteMode:matte?l.matte.mode:0});
  mask?.dispose();current=dest
 }
 flush();return current
}
function expandInline(project,comp,t){
 const list=[...comp.layers],nodes=[...comp.nodes];
 let changed=false;
 const normal=(p,v)=>p.keys.length===0&&!p.expr&&JSON.stringify(p.v)===JSON.stringify(v);
 for(const wrapper of comp.layers){
  if(!wrapper.inline||!wrapper.visible||wrapper.start!==0||t>wrapper.end||wrapper.offset||wrapper.effects.length||wrapper.masks.length||wrapper.matte||wrapper.blend!=='source-over'||wrapper.motion||wrapper.parent||wrapper.affine
   ||!normal(wrapper.p.position,[0,0,0])||!normal(wrapper.p.anchor,[0,0,0])||!normal(wrapper.p.scale,[100,100,100])||!normal(wrapper.p.rotation,[0,0,0])||!normal(wrapper.p.opacity,100)
   ||wrapper.p.remap.keys.length||wrapper.p.remap.expr)continue;
  const sub=project.comps.find(q=>q.id===wrapper.source);if(!sub||sub.id===comp.id)continue;
  const at=list.indexOf(wrapper), children=sub.layers.filter(q=>!q.preDependency), order=wrapper.originalOrder||[], members=wrapper.members||[];
  if(at<0)continue;
  const follows=order.slice(0,order.indexOf(members[0])).filter(id=>list.some(q=>q.id===id&&!q.preProxy));
  const preceding=list.slice(0,at).map(q=>q.id).filter(id=>order.includes(id));
  const sameOrder=follows.length===preceding.length&&follows.every((id,i)=>id===preceding[i]);
  list.splice(at,1);changed=true;
  let index=at;
  children.forEach((child,i)=>{
   const proxy=list.findIndex(l=>l.id===child.id&&l.preProxy);
   if(proxy>=0){list.splice(proxy,1);if(proxy<index)index--}
   if(sameOrder&&i>0&&members[i]){
    const pred=order.slice(0,order.indexOf(members[i])).reverse().find(id=>list.some(q=>q.id===id));
    if(pred)index=Math.max(index,list.findIndex(q=>q.id===pred)+1)
   }
   list.splice(index++,0,child);pickOwners.set(child.id,wrapper.id)
  });
  for(const dep of sub.layers.filter(q=>q.preDependency))if(!list.some(q=>q.id===dep.id))list.push({...dep,visible:false});
  nodes.push(...sub.nodes.filter(n=>!nodes.some(q=>q.id===n.id)))
 }
 return changed?{...comp,layers:list,nodes}:comp
}
function renderSampled(project,comp,t,id,stack=[]){
 if(!comp.blur||comp.shutter<=0||!comp.layers.some(l=>l.motion))return renderComp(project,comp,t,id,stack);
 const acc=target(id+'acc');clear(acc);
 const interval=comp.shutter/360/comp.fps,phase=comp.phase/360/comp.fps,samples=5;
 for(let i=0;i<samples;i++){
  const time=clamp(t+phase+interval*(i+.5)/samples,0,comp.duration);
  const src=renderComp(project,comp,t,id,stack,time);
  uniforms(accumulate,{map:src.texture,amount:1/samples});pass(accumulate,acc,true)
 }
 if(id==='root'){lastSampler=F.sampler(project,comp,t);lastCamera=cameraFor(lastSampler,orbit)}
 return acc
}
function render(project,comp,t,alt=false){
 renderSerial++;
 pickOwners=new Map();
 rootCoverage=new Map();rootPlanes=new Map();rootMatteIds=new Set();
 const original=comp;comp=expandInline(project,comp,t);
 orbit=alt;const result=renderSampled(project,comp,t,'root');
 renderSampler=lastSampler;if(comp!==original)lastSampler=F.sampler(project,original,t);
 output.uniforms.map.value=result.texture;pass(output,null);rr.getContext().flush();
 for(const [id,rt] of targets)if(renderSerial-rt.lastUse>4){rt.dispose();targets.delete(id)}
 return lastSampler
}
function projectPoint(v){const p=v.clone().project(lastCamera);return [(p.x+1)*W/2,(1-p.y)*H/2]}
function layerBounds(layer){
 if(!lastCamera||!renderSampler)return null;
 let scene=lastScene,temporary=false;
 if(!scene&&['shape','text','geometry','hammer'].includes(layer.type)){
  scene=new T.Scene();objectFor(renderSampler,layer,scene);scene.updateMatrixWorld(true);temporary=true
 }
 if(!scene)return null;
 const vertex=V(),box=new T.Box2();
 scene.traverse(o=>{
  if(!o.isMesh||!o.visible)return;
  let owner=o;while(owner&&!owner.userData.layer)owner=owner.parent;
  if(!owner)return;
  const id=owner.userData.layer;
  if((pickOwners.get(id)||id)!==layer.id)return;
  const p=o.geometry.attributes.position;
  if(!p)return;
  for(let i=0;i<p.count;i++){
   vertex.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).project(lastCamera);
   if(!Number.isFinite(vertex.x)||vertex.z<-.999||vertex.z>1.0001)continue;
   box.expandByPoint(new T.Vector2((vertex.x+1)*W*.5,(1-vertex.y)*H*.5))
  }
 });
 if(temporary)disposeScene(scene);
 if(box.isEmpty())return null;
 const {min,max}=box;
 return [[min.x,min.y],[max.x,min.y],[max.x,max.y],[min.x,max.y]]
}
function covered(rt,u,v){
 const pixel=new Uint16Array(4),x=clamp(Math.floor(u*rt.width),0,rt.width-1),y=clamp(Math.floor(v*rt.height),0,rt.height-1);
 rr.readRenderTargetPixels(rt,x,y,1,1,pixel);
 return pixel[3]>9500
}
function pick(u,v,comp){
 const r=new T.Raycaster();r.setFromCamera(new T.Vector2(u*2-1,1-v*2),lastCamera);
 let scene=lastScene,temporary=false;
 if(!scene){
  scene=new T.Scene();temporary=true;
  for(const l of renderSampler.comp.layers.filter(renderSampler.active)){
   const tex=rootPlanes.get(l.id);
   if(tex){
    const o=compositionPlane(renderSampler,l,tex.rt,tex.comp);o.userData.layer=l.id;scene.add(o)
   }else if(['text','shape','geometry','hammer'].includes(l.type))objectFor(renderSampler,l,scene)
  }
  scene.updateMatrixWorld(true)
 }
 let layer=null;
 const hits=r.intersectObjects(scene.children,true).filter(h=>h.object.isMesh&&!h.object.isPoints);
 const owner=h=>{let x=h.object;while(x&&!x.userData.layer)x=x.parent;return x?.userData.layer};
 for(const h of hits){
  const id=owner(h),l=comp.layers.find(l=>l.id===(pickOwners.get(id)||id));
  if(!l||l.locked||!l.visible||rootMatteIds.has(id))continue;
  const coverage=rootCoverage.get(id),texture=h.object.userData.textureResult;
  if(coverage&&!covered(coverage,u,1-v))continue;
  if(texture&&h.uv&&!covered(texture,h.uv.x,h.uv.y))continue;
  if(!coverage&&l.masks.length){
   const tex=maskTexture(lastSampler,l,lastCamera),a=tex.image.getContext('2d').getImageData(clamp(Math.floor(u*W),0,W-1),clamp(Math.floor(v*H),0,H-1),1,1).data[3];
   tex.dispose();if(a<10)continue
  }
  if(!coverage&&l.matte){
   const covers=hits.some(h=>owner(h)===l.matte.source),inverse=l.matte.mode%2===0;
   if(covers===inverse)continue
  }
  layer=l;break
 }
 const rank=layer?comp.layers.indexOf(layer):Infinity;
 for(const l of comp.layers.slice(0,rank)){
  if(l.type==='precomp'&&!l.locked&&l.visible&&!rootMatteIds.has(l.id)&&rootCoverage.has(l.id)&&covered(rootCoverage.get(l.id),u,1-v)){layer=l;break}
 }
 if(temporary)disposeScene(scene);return layer
}
function world(u,v,point=V(),normal=null){
 if(!lastCamera)return V();
 const r=new T.Raycaster();r.setFromCamera(new T.Vector2(u*2-1,1-v*2),lastCamera);
 return r.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(normal||lastCamera.getWorldDirection(V()),point),V())||V()
}
function axisDistance(u,v,origin,axis){
 const r=new T.Raycaster();
 r.setFromCamera(new T.Vector2(u*2-1,1-v*2),lastCamera);
 const d=r.ray.direction,w=r.ray.origin.clone().sub(origin),b=d.dot(axis);
 if(1-b*b<.00001)return 0;
 return (w.dot(axis)-b*w.dot(d))/(1-b*b)
}
return {init,size,render,release,pick,world,axisDistance,projectPoint,layerBounds,get camera(){return lastCamera},get width(){return W},get height(){return H},get sampler(){return lastSampler}};
})();
