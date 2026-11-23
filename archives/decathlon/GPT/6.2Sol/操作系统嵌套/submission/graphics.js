import * as T from './node_modules/three/build/three.module.js';
import {ground,clamp,pineLayout,cameraOrbit} from './flight.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const rng=n=>{const x=Math.sin(n*91.17+15.7)*43758.5453;return x-Math.floor(x);};
let renderer, glCanvas, lost=false;
const stageCache=new Map(), outputs=new WeakMap();
function makeRenderer(){
  glCanvas=document.createElement('canvas');
  renderer=new T.WebGLRenderer({canvas:glCanvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  glCanvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});
  glCanvas.addEventListener('webglcontextrestored',()=>{lost=false;for(const stage of stageCache.values())stage.revision++;});
}
const sphere=new T.SphereGeometry(1,36,22), box=new T.BoxGeometry(1,1,1), cyl=new T.CylinderGeometry(1,1,1,28), taper=new T.CylinderGeometry(.45,1,1,22);
function textMap(text,color,bg=null){
  const c=document.createElement('canvas');c.width=512;c.height=256;
  const ctx=c.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,512,256);}
  ctx.font='900 italic 205px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.strokeStyle='rgba(35,26,48,.8)';ctx.lineWidth=8;ctx.strokeText(text,256,143);
  ctx.fillStyle=color;ctx.fillText(text,256,143);
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;return map;
}
function stageFor(resource){
  const id=resource.assetId;
  if(stageCache.has(id))return stageCache.get(id);
  const scene=new T.Scene();
  const terrain=resource.terrain??{size:120,amplitude:0};
  const sky=resource.sky??{};
  const fog=sky.fog??'#a8bac8';
  scene.background=new T.Color(sky.horizon??'#e9bc92');scene.fog=new T.FogExp2(fog,.009);
  const dome=new T.Mesh(new T.SphereGeometry(260,32,16),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{upper:{value:new T.Color(sky.top??'#5189a0')},lower:{value:new T.Color(sky.horizon??'#f9cf9e')},sun:{value:V(...(sky.sun??[-50,30,-80])).normalize()}},
    vertexShader:'varying vec3 world; void main(){world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 world;uniform vec3 upper;uniform vec3 lower;uniform vec3 sun;void main(){vec3 d=normalize(world);float t=clamp((d.y+.06)*2.0,0.,1.);float a=max(dot(d,sun),0.);vec3 c=mix(lower,upper,pow(t,.62));c+=vec3(.68,.38,.18)*pow(a,22.)*.63;c+=vec3(1.,.82,.43)*smoothstep(.9987,.9991,a);gl_FragColor=vec4(c,1.); #include <colorspace_fragment>\n}'.replace('; #',';\n#')
  }));
  scene.add(dome);
  const lp=resource.lighting??{};
  scene.add(new T.HemisphereLight(lp.sky??'#cfe7ff',lp.ground??'#a48f78',lp.ambient??1.9));
  const sunlight=new T.DirectionalLight(lp.sun??'#ffdaa6',lp.intensity??3.2);sunlight.position.set(...(lp.position??[-20,37,18]));sunlight.castShadow=true;
  Object.assign(sunlight.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:94});
  sunlight.shadow.mapSize.set(1024,1024);sunlight.shadow.normalBias=.035;sunlight.shadow.bias=-.00025;
  scene.add(sunlight,sunlight.target);
  const palette=Object.fromEntries(Object.entries(resource.material??{}).map(([k,m])=>[k,new T.MeshStandardMaterial({color:m.color??'#ccc',roughness:m.rough??.7,metalness:m.metal??.02,emissive:m.emissive??'#000',emissiveIntensity:m.emissiveIntensity??1})]));
  if(palette.glass)palette.glass.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
      'float edge=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),2.4); outgoingLight+=mix(vec3(.015,.026,.039),vec3(.077,.116,.155),edge);\n#include <opaque_fragment>');
  };
  const standard=(color,params={})=>new T.MeshStandardMaterial({color,...params});
  const defaultMat=standard('#a89ebe');
  function mesh(desc){
    let m;
    if(desc.shape==='label'){
      const geometry=new T.PlaneGeometry(desc.s[0],desc.s[1],8,4);
      const a=geometry.attributes.position;
      for(let i=0;i<a.count;i++)a.setZ(i,-.16*a.getX(i)**2-.20*a.getY(i)**2);
      geometry.computeVertexNormals();
      m=new T.Mesh(geometry,new T.MeshStandardMaterial({map:textMap(desc.text,desc.ink??'#ffe5a7'),transparent:true,alphaTest:.35,roughness:.54,polygonOffset:true,polygonOffsetFactor:-1}));
    }else{
      m=new T.Mesh(({sphere,box,cylinder:cyl,taper})[desc.shape]??box,palette[desc.material]??defaultMat);
      m.scale.set(...desc.s);
    }
    m.name=desc.name;m.position.set(...desc.p);if(desc.r)m.rotation.set(...desc.r);
    m.castShadow=desc.shape!=='label';m.receiveShadow=true;return m;
  }
  const g=new T.PlaneGeometry(terrain.size??240,terrain.size??240,100,100);
  g.rotateX(-Math.PI/2);
  const ap=g.attributes.position, color=[];
  const ca=new T.Color(terrain.color??'#888567'), cb=new T.Color(terrain.colorHigh??'#b09c72'), cc=new T.Color(terrain.low??'#67745a');
  for(let i=0;i<ap.count;i++){
    const x=ap.getX(i),z=ap.getZ(i),y=ground(resource,x,z);ap.setY(i,y);
    const t=(Math.sin(x*.2)*Math.cos(z*.17)+Math.sin(x*.55+z*.35)*.13)*.5+.5;
    ca.clone().lerp(t>.5?cb:cc,Math.abs(t-.5)*.85).toArray(color,i*3);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(color,3));g.computeVertexNormals();
  const groundMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.99});
  groundMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 strataGround;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstrataGround=position.xz;');
    shader.fragmentShader='varying vec2 strataGround;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 p=strataGround; float b=sin(p.x*.63+sin(p.y*.38)*3.4)*sin(p.y*.51+sin(p.x*.52)); float grit=fract(sin(dot(floor(p*18.),vec2(12.9898,78.233)))*43758.5453); diffuseColor.rgb*=.92+b*.095+grit*.13;');
  };
  const land=new T.Mesh(g,groundMaterial);land.receiveShadow=true;land.name='地面';scene.add(land);
  const gravel=standard('#5a5e5e'), padLine=new T.MeshBasicMaterial({color:'#ffd17f',side:T.DoubleSide});
  for(const p of resource.pads??[]){
    const asphalt=new T.Mesh(new T.CylinderGeometry(p.r,p.r,.10,64),gravel);asphalt.position.set(p.x,.025,p.z);asphalt.receiveShadow=true;asphalt.name='停机坪 '+p.text;scene.add(asphalt);
    const ring=new T.Mesh(new T.RingGeometry(p.r-.47,p.r-.35,64),padLine);ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.081,p.z);scene.add(ring);
    const label=new T.Mesh(new T.PlaneGeometry(p.r*1.23,p.r*.64),new T.MeshStandardMaterial({map:textMap(p.text,'#e5c997'),transparent:true,alphaTest:.2}));label.position.set(p.x,.084,p.z);label.rotation.x=-Math.PI/2;scene.add(label);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;const m=new T.Mesh(box,padLine);m.scale.set(.15,.09,.41);m.rotation.y=-a;m.position.set(p.x+Math.cos(a)*(p.r-.21),.095,p.z+Math.sin(a)*(p.r-.21));scene.add(m);}
  }
  const treeMat=[standard('#314e43'),standard('#3d5f4a'),standard('#455f4d')],bark=standard('#6a5142');
  for(let i=0;i<(resource.terrainProps?.mountains??0);i++){
    const a=(i+.14)*6.28/(resource.terrainProps.mountains), radius=72+rng(i*2)*26,h=11+rng(i*5)*24,r=11+rng(i*7)*13;
    const geo=new T.BufferGeometry(),rings=[], tris=[], shades=[],sides=9, baseAngle=rng(i*3)*6.28;
    const summit=[(rng(i+44)-.5)*r*.94,h,(rng(i+18)-.5)*r*.84];
    for(let j=0;j<4;j++){
      const u=[0,.36,.66,.86][j];
      rings.push(Array.from({length:sides},(_,k)=>{
        const theta=baseAngle+k*6.283/sides;
        const slope=1.0+rng(i*27+k*7+j)*.49;
        return [Math.cos(theta)*r*(1-u)*slope+summit[0]*u,h*u+(rng(i+k+j*74)-.5)*h*.13,Math.sin(theta)*r*(1-u)*(1+rng(k+i*32)*.56)+summit[2]*u];
      }));
    }
    const rock=new T.Color(['#526c78','#526979','#687b87'][i%3]), cap=new T.Color('#e7d9bf');
    const tri=(a,b,c,n)=>{
      tris.push(...c,...b,...a);
      const tint=(n>2?rock.clone().lerp(cap,((a[1]+b[1]+c[1])/3/h>.79)?.87:.38):rock.clone()).multiplyScalar(.78+rng(tris.length+i)*.46);
      for(let q=0;q<3;q++)shades.push(tint.r,tint.g,tint.b);
    };
    for(let j=1;j<4;j++)for(let k=0;k<sides;k++){
      const p=(k+1)%sides;tri(rings[j-1][k],rings[j-1][p],rings[j][k],j);tri(rings[j][k],rings[j-1][p],rings[j][p],j);
    }
    for(let k=0;k<sides;k++)tri(rings[3][k],rings[3][(k+1)%sides],summit,4);
    geo.setAttribute('position',new T.Float32BufferAttribute(tris,3));geo.setAttribute('color',new T.Float32BufferAttribute(shades,3));geo.computeVertexNormals();
    const mountain=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,side:T.DoubleSide}));
    mountain.position.set(Math.cos(a)*radius,-3,Math.sin(a)*radius);scene.add(mountain);
  }
  const terrainObjects=[land];
  for(const {x,y,z,h,i} of pineLayout(resource)){
    const trunk=new T.Mesh(new T.CylinderGeometry(.08,.16,h*.72,6),bark);trunk.position.set(x,y+h*.31,z);trunk.name='松树';scene.add(trunk);terrainObjects.push(trunk);
    for(let j=0;j<3;j++){const m=new T.Mesh(new T.ConeGeometry(h*(.25-j*.048),h*.57,7),treeMat[(i+j)%3]);m.position.set(x,y+h*(.43+j*.18),z);m.castShadow=true;m.name='松树';scene.add(m);terrainObjects.push(m);}
  }
  for(const p of resource.obstacles??[]){
    const m=mesh(p);m.position.y+=ground(resource,p.p[0],p.p[2]);scene.add(m);terrainObjects.push(m);
    if(p.s[0]>4){
      const front=new T.Mesh(box,standard('#344e54'));front.scale.set(p.s[0]*.63,p.s[1]*.72,.052);front.position.copy(m.position).add(V(0,-p.s[1]*.1,p.s[2]*.51));scene.add(front);
      for(let i=0;i<6;i++){const slat=new T.Mesh(box,standard(i===5?'#c99f5d':'#6d8282'));slat.scale.set(p.s[0]*.64,.045,.035);slat.position.copy(front.position).add(V(0,(i-2.5)*p.s[1]*.12,.045));scene.add(slat);}
    }
  }
  for(const desc of resource.decor??[]){
    const m=mesh(desc);
    m.position.y+=ground(resource,desc.p[0],desc.p[2]);
    scene.add(m);
  }
  const dummy=new T.Object3D();
  const grassN=clamp(terrain.grass??0,0,5000),grassData=[];
  const grass=new T.InstancedMesh(new T.ConeGeometry(1,1,3),standard('#989254'),grassN);
  for(let i=0;i<grassN;i++){const x=(rng(i*5)-.5)*67,z=(rng(i*5+1)-.5)*62;if((resource.pads??[]).some(p=>Math.hypot(p.x-x,p.z-z)<p.r+.7))continue;grassData.push([x,ground(resource,x,z),z,.18+rng(i*5+2)*.34]);}
  grass.count=grassData.length;grass.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(grass);
  const body=new T.Group(),rotor=new T.Group(),tail=new T.Group();rotor.position.set(0,1.58,0);tail.position.set(.18,.64,-4.09);body.add(rotor,tail);scene.add(body);
  const blur=new T.Mesh(new T.RingGeometry(.25,4.08,48),new T.MeshBasicMaterial({color:'#c5b5ae',transparent:true,opacity:.09,side:T.DoubleSide,depthWrite:false}));blur.rotation.x=-Math.PI/2;rotor.add(blur);
  const pickable=terrainObjects,parts=[], debris=[];
  (resource.parts??[]).forEach((desc,i)=>{
    const m=mesh(desc);pickable.push(m);parts.push(m);
    if(desc.group==='rotor'||desc.group==='tail'){
      const group=desc.group==='rotor'?rotor:tail;
      if(desc.local){const axis=new T.Group();axis.rotation.y=desc.yaw??0;axis.rotation.x=desc.roll??0;group.add(axis);axis.add(m);}
      else{m.position.sub(group.position);group.add(m);}
    }else body.add(m);
    if(i%3===0||desc.group==='rotor'){
      const d=desc.shape==='label'?null:mesh(desc);
      if(d){d.visible=false;scene.add(d);debris.push({d,desc,i});}
    }
  });
  const smoke=[],fire=[],dust=[];
  const cloud=new T.IcosahedronGeometry(1,1);
  for(let i=0;i<49;i++){
    const mode=i<23?'smoke':i<32?'fire':'dust';
    const opacity=mode==='smoke'?.48:.7;
    const mat=mode==='fire'?new T.MeshBasicMaterial({color:i%2?'#ffbe3d':'#f16c38',transparent:true,opacity,depthWrite:false}):standard(mode==='smoke'?'#45404c':'#c3a381',{transparent:true,opacity,depthWrite:false,roughness:1});
    const o=new T.Mesh(cloud,mat);o.visible=false;scene.add(o);
    (mode==='smoke'?smoke:mode==='fire'?fire:dust).push(o);
  }
  const impactLight=new T.PointLight('#ffa044',0,15,2);
  scene.add(impactLight);
  const sparks=Array.from({length:23},(_,i)=>{
    const ember=new T.Mesh(cloud,new T.MeshBasicMaterial({color:i%3?'#ffbb56':'#ffdba1',transparent:true,depthWrite:false}));
    ember.visible=false;scene.add(ember);return ember;
  });
  const camera=new T.PerspectiveCamera(resource.camera?.fov??45,1,.1,300);
  const stage={resource,scene,camera,sunlight,body,rotor,tail,blur,grass,grassData,dummy,parts,debris,smoke,fire,dust,sparks,impactLight,pickable,revision:0};
  stageCache.set(id,stage);return stage;
}
function pose(stage, packet, aspect){
  const {scene,camera,body,resource,rotor,tail,blur,debris,parts,smoke,fire,dust,sparks,impactLight,dummy,grass,grassData,sunlight}=stage;
  const f=packet.frame,t=f.t,cfg=packet.camera??{},impact=f.impact??Infinity, after=t-impact, fallen=f.damaged;
  const fx=f.fxTime??t,fxFault=f.fxTime!=null?f.fxFault:f.fault,fxAfter=fx-(f.fxTime!=null?f.fxImpact??Infinity:impact);
  const fxX=f.fxX??f.x,fxY=f.fxY??f.y,fxZ=f.fxZ??f.z;
  const target=V(f.x,f.y+.3,f.z);
  body.position.set(f.x,f.y,f.z);body.rotation.set(f.pitch,f.yaw,f.roll,'YXZ');
  rotor.rotation.y=f.spin;tail.rotation.x=f.spin*2.3;blur.material.opacity=fallen?.013:clamp(t*.08,0,.095);
  for(const [i,m] of parts.entries())m.visible=!fallen||!debris.some(d=>d.i===i);
  for(const {d,i,desc} of debris){
    d.visible=fallen;if(!fallen)continue;
    const a=rng(i*5)*6.283,r=(2+rng(i)*7)*(1-Math.exp(-after*1.4));
    const x=f.x+Math.cos(a)*r,z=f.z+Math.sin(a)*r;
    const h=Math.max(0,Math.sin(Math.min(Math.PI,after*2.8))*(1.5+rng(i+3)*2.8));
    const settling=clamp((after-.62)/.69,0,1), roll=Math.min(after,1.3)*2.7;
    const floorHeight=desc.shape==='sphere'?Math.min(...desc.s)*.62:Math.min(...desc.s)*.52;
    d.position.set(x,ground(resource,x,z)+h+floorHeight+.022,z);
    d.rotation.set(T.MathUtils.lerp((desc.r?.[0]??0)+after*(2+rng(i)*4),desc.shape==='cylinder'||desc.shape==='taper'?Math.PI/2:0,settling),
      a+Math.min(after,1.3)*3.8,T.MathUtils.lerp(roll,0,settling));
  }
  const smoking=fxFault!=null&&fx>=fxFault;
  smoke.forEach((o,i)=>{
    const emitted=fx-fxFault-i*.079;
    o.visible=smoking&&emitted>=0;if(!o.visible)return;
    const age=emitted%3.1;
    const r=rng(i)*.84;
    const scale=(.19+age*.46)*(fallen?1.65:1);
    o.position.set(fxX+age*.70+Math.sin(i*3.1)*age*.36,fxY+.47+age*(fxAfter>=0?1.9:.56),fxZ-age*(fxAfter>=0?.22:1.58)+r);
    o.scale.set(scale,scale*(.74+rng(i+3)*.45),scale);o.rotation.set(age*.7,i,age*.2);o.material.opacity=clamp((.52-age*.148)*(fallen?1:.82)*(f.fxIntensity??1),0,.75);
  });
  fire.forEach((o,i)=>{
    o.visible=fallen&&fxAfter>=0&&fxAfter<3;if(!o.visible)return;
    const age=(fxAfter+i*.09)%1;const s=(1-age)*Math.min(3.0,.8+7*fxAfter)*Math.max(.2,1-fxAfter*.33);
    o.scale.set(s*.66,s*1.2,s*.67);o.position.set(f.x+(rng(i)-.5)*2,f.y+age*2.4,f.z+(rng(i+35)-.5)*2);o.material.opacity=(1-age)*.86;
  });
  const fireFloor=ground(resource,fxX,fxZ);
  impactLight.position.set(fxX,fireFloor+.8,fxZ);
  impactLight.intensity=fxAfter>=0&&fxAfter<.75?70*Math.exp(-fxAfter*5):0;
  sparks.forEach((o,i)=>{
    const life=.24+rng(i+12)*.73,age=fxAfter;
    o.visible=age>=0&&age<life;if(!o.visible)return;
    const angle=i*2.399,radius=age*(2.7+rng(i+3)*8.8);
    const x=fxX+Math.cos(angle)*radius,z=fxZ+Math.sin(angle)*radius;
    const y=Math.max(ground(resource,x,z)+.03,fireFloor+.48+age*(2+rng(i)*7)-6*age*age);
    o.position.set(x,y,z);
    const scale=.04+rng(i+10)*.062;
    o.scale.set(scale,scale,scale*(1.5+age*2));o.rotation.y=Math.PI/2-angle;
    o.material.opacity=1-age/life;
  });
  const gy=ground(resource,f.x,f.z),h=f.y-gy;
  dust.forEach((o,i)=>{
    o.visible=(h<5&&t>.3)||fallen;if(!o.visible)return;
    const shaken=fxAfter>=0;
    const a=i*2.399,age=shaken?clamp(fxAfter,0,3):((fx*.73+i*.117)%1);
    const r=shaken?age*(1.4+rng(i)*2.9):2+age*5;
    const x=fxX+Math.cos(a)*r,z=fxZ+Math.sin(a)*r;
    o.position.set(x,ground(resource,x,z)+.13+age*.6,z);
    o.scale.set(.12+age*.67,.08+age*.24,.12+age*.67);
    o.material.opacity=(shaken?Math.max(.02,.48-fxAfter*.15):clamp((1-age)*(1-h/5)*.25,0,.4))*(f.fxIntensity??1);
  });
  for(let i=0;i<grassData.length;i++){
    const [x,y,z,l]=grassData[i],dx=x-f.x,dz=z-f.z;
    const wave=clamp(1-Math.hypot(dx,dz)/9,0,1)*clamp(1-h/7,0,1)*1.65;
    dummy.position.set(x,y+l*.44,z);dummy.scale.set(.047,l,.047);dummy.rotation.set(dz*.17*wave,0,-dx*.17*wave);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
  }
  grass.instanceMatrix.needsUpdate=true;
  const mode=cfg.mode??'cinema';
  if(packet.isDefault||mode!=='cinema'){
    const {angle,tilt,distance}=cameraOrbit(resource,f,cfg,packet.isDefault);
    const dist=distance*Math.max(1,1.28/aspect);
    camera.position.copy(target).add(V(Math.cos(angle)*dist,Math.tan(tilt)*dist,Math.sin(angle)*dist));
    target.y+=fallen?.5:.25;
  }else{
    camera.position.set(...(resource.camera?.position??[8,5,9]));
    target.set(...(resource.camera?.target??[0,0,0]));
  }
  camera.aspect=aspect;camera.updateProjectionMatrix();camera.lookAt(target);
  const lp=resource.lighting?.position??[-20,37,18];
  sunlight.position.set(f.x+lp[0],f.y+lp[1],f.z+lp[2]);sunlight.target.position.set(f.x,0,f.z);
  scene.updateMatrixWorld(true);camera.updateMatrixWorld();
}
export function paint(canvas,packet){
  if(!packet?.resource||!canvas.isConnected||!canvas.offsetWidth||!canvas.offsetHeight)return;
  if(!renderer)makeRenderer();
  if(lost)return;
  const stage=stageFor(packet.resource);
  const w=Math.min(1560,Math.round(canvas.offsetWidth*devicePixelRatio)),h=Math.max(1,Math.round(w*canvas.offsetHeight/canvas.offsetWidth));
  const key=packet.revision+':'+stage.revision+':'+w+':'+h;
  if(outputs.get(canvas)?.key===key)return;
  const r=canvas.getBoundingClientRect();
  const visible=[.07,.5,.93].some(y=>[.07,.5,.93].some(x=>document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)===canvas));
  if(!visible&&outputs.has(canvas))return;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  renderer.setSize(w,h,false);pose(stage,packet,w/h);renderer.render(stage.scene,stage.camera);
  canvas.getContext('2d').drawImage(glCanvas,0,0,w,h);outputs.set(canvas,{key,packet});
}
export function point(canvas,packet,x,y){
  if(!packet?.resource)return null;
  const stage=stageFor(packet.resource),r=canvas.getBoundingClientRect();
  pose(stage,packet,r.width/r.height);
  const caster=new T.Raycaster();caster.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),stage.camera);
  const hit=caster.intersectObjects(stage.pickable.filter(m=>m.visible),false)[0];
  if(!hit)return null;
  return {name:hit.object.name,ground:hit.object===stage.pickable[0],aircraft:stage.parts.includes(hit.object),point:hit.point.toArray()};
}
export function trimGraphics(active){
  for(const [id,stage] of stageCache)if(!active.has(id)){
    const geometries=new Set(),materials=new Set();
    stage.scene.traverse(o=>{if(o.geometry&&![sphere,box,cyl,taper].includes(o.geometry))geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const m of materials){m.map?.dispose();m.dispose();}
    for(const g of geometries)g.dispose();
    stage.sunlight.shadow.map?.dispose();stageCache.delete(id);
  }
}
