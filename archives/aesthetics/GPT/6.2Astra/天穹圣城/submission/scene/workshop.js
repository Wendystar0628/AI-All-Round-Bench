'use strict';

const T = THREE, PI = Math.PI, TAU = 2 * PI;
const sin = Math.sin, cos = Math.cos, clamp = T.MathUtils.clamp, mix = T.MathUtils.lerp;
const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
let seed = 127924;
function rand(a=0,b=1) {
  seed = (Math.imul(1664525,seed)+1013904223) >>> 0;
  return a + (b-a)*seed/4294967296;
}
const pick = a => a[Math.floor(rand(0,a.length))];
function hash(x,y) { let n=Math.imul(x,1597334677)^Math.imul(y,3812015801); n=Math.imul(n^(n>>>16),2246822507); return ((n^(n>>>13))>>>0)/4294967295; }
function noise2(x,y,period=65536) {
  const i=Math.floor(x),j=Math.floor(y);
  let u=x-i,v=y-j; u=u*u*(3-2*u); v=v*v*(3-2*v);
  const f=(a,b)=>hash(((i+a)%period+period)%period,((j+b)%period+period)%period);
  return mix(mix(f(0,0),f(1,0),u),mix(f(0,1),f(1,1),u),v);
}
const scene=new T.Scene();
// Geometry is multisampled in the linear-light world buffer. The final
// full-screen resolve needs one well-defined sample per output pixel.
const renderer=new T.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.getContext().disable(renderer.getContext().DITHER);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=.95;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
document.getElementById('world').appendChild(renderer.domElement);
const camera=new T.PerspectiveCamera(32,1,.12,1600);
scene.fog=new T.Fog(0xc4d6de,110,346);
const hemi=new T.HemisphereLight(0xb9d8ef,0x767184,.92);
scene.add(hemi);
const sun=new T.DirectionalLight(0xffdfaf,3.27);
sun.position.set(-77,67,37); sun.target.position.set(0,1,0);
sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-66,right:66,bottom:-68,top:72,near:10,far:242});
sun.shadow.mapSize.set(4096,4096); sun.shadow.bias=-.00013; sun.shadow.normalBias=.032;
scene.add(sun,sun.target);
const rim=new T.DirectionalLight(0xd0e4ff,.43); rim.position.set(43,32,-75); scene.add(rim);

const atlas=new T.Group(); scene.add(atlas);
const ticking=[], timeUniform={value:0};
function group(p,x=0,y=0,z=0,ry=0) {
  const g=new T.Group(); g.position.set(x,y,z); g.rotation.y=ry; p.add(g); return g;
}
function moving(g,fn) {g.userData.mobile=true; ticking.push(fn); return g;}
function grainTexture() {
  const n=256,bytes=new Uint8Array(n*n*4);
  for (let j=0;j<n;j++) for(let i=0;i<n;i++) {
    const k=(i+n*j)*4,x=i/n,y=j/n;
    bytes[k]=255*(.46*noise2(x*5,y*5,5)+.27*noise2(x*13,y*13,13)+.16*noise2(x*32,y*32,32)+.11*noise2(x*78,y*78,78));
    bytes[k+1]=255*(.5*noise2(x*24,y*24,24)+.3*noise2(x*61,y*61,61)+.2*hash(i,j));
    bytes[k+2]=255*hash(i+441,j);bytes[k+3]=255;
  }
  const t=new T.DataTexture(bytes,n,n); t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;
  t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
const patina=grainTexture();
const plateLoads=[],plates={};
for(const [key,data] of Object.entries(materialPlates)) {
  const t=new T.Texture(),im=new Image();plates[key]=t;
  t.wrapS=T.RepeatWrapping;t.wrapT=key==='heavens'?T.ClampToEdgeWrapping:T.RepeatWrapping;
  t.anisotropy=1;
  const ready=new Promise((resolve,reject)=>{im.onload=()=>{t.image=im;t.needsUpdate=true;resolve();};im.onerror=()=>reject(new Error('Cannot decode '+key));});
  plateLoads.push(ready);im.src=data;
}
const platesReady=Promise.all(plateLoads);
const M={};
function surface(key,color,kind='plain',rough=.86,metal=.015,extra={}) {
  const mat=new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,envMapIntensity:metal>.3?.83:.26,...extra});
  mat.name=key;M[key]=mat;
  mat.onBeforeCompile=s=>{
    s.uniforms.uWeather={value:patina}; s.uniforms.uHour=timeUniform;
    s.vertexShader='varying vec3 vSite;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <project_vertex>',[
      'vec4 siteVertex = vec4(transformed,1.);','#ifdef USE_INSTANCING','siteVertex = instanceMatrix * siteVertex;','#endif',
      'vSite = (modelMatrix * siteVertex).xyz;','#include <project_vertex>'].join('\n'));
    s.uniforms.uPlate={value:kind==='rock'?plates.cliff:kind==='turf'?plates.turf:plates.wall};
    s.uniforms.uCliffNormals={value:plates.cliffNormals};
    s.fragmentShader='varying vec3 vSite;uniform sampler2D uWeather,uPlate,uCliffNormals; uniform float uHour;\n'+s.fragmentShader;
    let effect='';
    if (kind==='stone'||kind==='paving') effect=`
      vec3 axisN = abs(normalize(cross(dFdx(vSite),dFdy(vSite))));
      vec2 stoneUV = axisN.y > .69 ? vSite.xz : vec2(axisN.x > axisN.z ? vSite.z : vSite.x,vSite.y);
      vec3 stoneAlbedo=texture2D(uPlate,stoneUV*vec2(.31,.31)).rgb;
      vec2 coord=stoneUV;
      coord *= ${kind==='paving'?'vec2(1.16,1.50)':'vec2(.95,2.35)'};
      coord.x += .5*mod(floor(coord.y),2.);
      vec2 seamDist = .5-abs(fract(coord)-.5);
      vec2 aa=max(fwidth(coord)*.75,vec2(.008));
      vec2 joint=1.-smoothstep(vec2(.008)-aa,vec2(.018)+aa,seamDist);
      float joints=max(joint.x,joint.y)*clamp(1.-max(aa.x,aa.y),0.,1.);
      float block=texture2D(uWeather,(floor(coord)+.5)*.019).g;
      diffuseColor.rgb*=1.+(block-.50)*.12-joints*.049;
      diffuseColor.rgb*=mix(vec3(1.),stoneAlbedo*1.91,${kind==='stone'?'.81':'.48'});
    `;
    if (kind==='roof'||kind==='terracotta') effect=`
      float lap = vSite.y*3.3+.05*weather.r;
      float seam = 1.-smoothstep(.012,.042+fwidth(lap),abs(fract(lap)-.50));
      diffuseColor.rgb*=vec3(.94,1.,1.)*(1.+(weather.r-.5)*.72-.14*seam*clamp(1.-fwidth(lap),0.,1.));
      vec2 sheet=vec2(vSite.x*.88+vSite.z*.67,lap*.69);
      sheet.x+=.5*mod(floor(sheet.y),2.);
      vec2 lines=.5-abs(fract(sheet)-.5);
      float join=min(lines.x,lines.y);
      diffuseColor.rgb*=.97+.20*texture2D(uWeather,(floor(sheet)+.5)*.014).r-.22*(1.-smoothstep(.006,.028+fwidth(join),join));
      ${kind==='terracotta'?`
        vec3 Rn=abs(normalize(cross(dFdx(vSite),dFdy(vSite))));
        float across=(Rn.x>Rn.z?vSite.z:vSite.x)*5.15;
        float course=vSite.y*4.98;
        float crest=.5+.5*cos(across*6.283);
        float ridge=pow(crest,2.2)*(1.-smoothstep(.02,.70,fwidth(across)));
        float lower=1.-smoothstep(.012,.056+fwidth(course),abs(fract(course)-.5));
        float relief=.052*ridge-.022*lower;
        diffuseColor.rgb*=.87+.205*ridge-.18*lower*(1.-clamp(fwidth(course),0.,1.));
      `:''}
    `;
    if(kind==='terracotta')s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      vec3 tx=dFdx(-vViewPosition),ty=dFdy(-vViewPosition),U=cross(ty,normal),W=cross(normal,tx);
      float det=dot(tx,U);
      normal=normalize(max(abs(det),1e-9)*normal-sign(det)*(dFdx(relief)*U+dFdy(relief)*W));
    `);
    if (kind==='rock') effect=`
      vec3 bed=texture2D(uWeather,vec2(vSite.x*.043+vSite.z*.031,vSite.y*.113)).rgb;
      float phase=vSite.y*2.1+.32*vSite.x-.25*vSite.z+bed.r*7.0;
      float cleavage=smoothstep(.49,.84,sin(phase))*.6+smoothstep(.2,.98,sin(phase*.43+2.7))*.4;
      vec3 grains=texture2D(uWeather,vec2(vSite.x*.48+vSite.z*.36,vSite.y*.18)).rgb;
      diffuseColor.rgb *= (1.04+.63*(bed.r-.5)+.33*(grains.g-.5)-.19*cleavage);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.22,1.13,.95),smoothstep(.47,.64,bed.r)*cleavage);
      vec3 faceN=abs(normalize(cross(dFdx(vSite),dFdy(vSite))));
      vec2 cliffUV=faceN.y>.78?vSite.xz:(faceN.x>faceN.z?vSite.zy:vSite.xy);
      cliffUV=mat2(.96,-.20,.20,.96)*cliffUV*vec2(.086,.108);
      vec3 mineral=texture2D(uPlate,cliffUV).rgb;
      diffuseColor.rgb*=max(.10*vec3(1.),min(vec3(2.28),pow(mineral*1.97,vec3(1.26))));
      float lichen=smoothstep(.51,.64,weather.r)*smoothstep(.15,.83,faceN.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.88,1.13,.66),lichen*.75);
    `;
    if(kind==='rock')s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
      vec2 st0=dFdx(cliffUV),st1=dFdy(cliffUV);
      vec3 qp0=cross(normal,q0),qp1=cross(q1,normal);
      vec3 tang=qp1*st0.x+qp0*st1.x,bitang=qp1*st0.y+qp0*st1.y;
      float invL=inversesqrt(max(1e-12,max(dot(tang,tang),dot(bitang,bitang))));
      vec3 rockN=texture2D(uCliffNormals,cliffUV).xyz*2.-1.;
      normal=normalize(normal*rockN.z+invL*.93*(tang*rockN.x+bitang*rockN.y));
    `);
    if(kind==='turf')effect='vec3 turf=texture2D(uPlate,vSite.xz*.107+vSite.y*.012).rgb;diffuseColor.rgb*=clamp(turf*1.86,vec3(.27),vec3(1.69));';
    if(kind==='wood') effect=`
      float fibres=texture2D(uWeather,vec2(vSite.x*.8+vSite.z*.9,vSite.y*.16)).g;
      diffuseColor.rgb*=.74+.52*fibres;
    `;
    if(kind==='carving')effect=`
      vec3 deposit=texture2D(uWeather,vSite.xy*vec2(.256,.057)+vSite.z*.107).rgb;
      float fleck=texture2D(uWeather,vSite.xz*.83+vSite.y*.41).g;
      vec3 facing=normalize(cross(dFdx(vSite),dFdy(vSite)));
      float moss=smoothstep(.48,.70,deposit.r)*(.28+.72*smoothstep(.07,.78,facing.y));
      diffuseColor.rgb*=.84+.25*deposit.g+.10*fleck;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.61,.80,.56),moss*.67);
    `;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 weather=texture2D(uWeather,vSite.xz*.147+vec2(vSite.y*.037,vSite.y*.127)).rgb;
      diffuseColor.rgb*=1.+(weather.g-.50)*.13+(weather.r-.5)*.16;
      ${effect}
      float shadowOfCloud=texture2D(uWeather,vSite.xz*.0042+vec2(uHour*.0009,.17)).r;
      diffuseColor.rgb*=.91+.12*smoothstep(.30,.64,shadowOfCloud);
      float afternoon=mod(uHour,90.);
      float veil=smoothstep(77.,82.,afternoon)*(1.-smoothstep(86.,89.7,afternoon));
      float cloudEdge=smoothstep(-10.,8.,vSite.x+.42*vSite.y+.18*vSite.z-(afternoon-83.)*7.8);
      diffuseColor.rgb*=mix(vec3(1.),vec3(.73,.80,.92),veil*cloudEdge);
    `);
  };
  mat.customProgramCacheKey=()=>'atelier-'+kind;
  return mat;
}
surface('ashlar',0xe6d5af,'stone'); surface('chalk',0xf4e5c8,'stone');
surface('ivory',0xffe9c7); surface('sand',0xc9b38d,'stone'); surface('aged',0xa79979,'stone');
surface('trim',0xdbbf94); surface('joint',0x958274); surface('inset',0x514f4b);
surface('deep',0x233b40); surface('basalt',0x5f665e,'stone'); surface('road',0xd7bc9c,'paving');
surface('paver',0xb49d81,'paving'); surface('copper',0x3f8f85,'roof',.46,.25);
surface('copper2',0x5ca69b,'roof',.48,.19); surface('seagreen',0x28665f,'roof',.58,.18);
surface('tile',0xb76946,'terracotta');surface('tile2',0xc38359,'terracotta');
surface('gold',0xd9a74e,'plain',.34,.58); surface('brass',0x95713c,'plain',.48,.4);
surface('bone',0xeed5a1,'plain',.57,.09);surface('iron',0x424b48,'plain',.6,.31);
surface('walnut',0x775538,'wood'); surface('wood',0xb18b62,'wood');surface('plank',0xc49c6e,'wood');surface('rope',0xa18a61);
surface('wine',0x95473a);surface('linen',0xf0dbae);surface('indigo',0x3f6974);surface('saffron',0xd3a44f);
surface('glass',0x3e7881,'plain',.25,.3,{emissive:0x194553,emissiveIntensity:.30});
surface('amber',0xe4ab5e,'plain',.40,.2,{emissive:0xffb95b,emissiveIntensity:.86});
surface('moss',0x767d51,'turf');surface('grass',0x7c895b,'turf');surface('bark',0x5a5545,'wood');
surface('leaf',0x708858,'plain',.93,0,{vertexColors:true});
surface('rock',0xffffff,'rock',.96,0,{vertexColors:true});
surface('statue',0xb6bdab,'carving'); surface('bronze',0x62857a,'plain',.55,.27);
surface('jewel',0x98ece6,'plain',.21,.31,{emissive:0x55c7d3,emissiveIntensity:.54});
surface('shard',0xffffff,'plain',.27,.23,{vertexColors:true,emissive:0x3195ac,emissiveIntensity:.42});
surface('blossom',0xc2807d);
const geomCache=new Map();
function geometry(key,fn) {if(!geomCache.has(key))geomCache.set(key,fn());return geomCache.get(key);}
function mesh(p,geometry,material,x=0,y=0,z=0) {
  const o=new T.Mesh(geometry,typeof material==='string'?M[material]:material);
  o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;
}
const cube=geometry('box',()=>new T.BoxGeometry(1,1,1));
function box(p,x,y,z,w,h,d,m='ashlar',ry=0) {
  const o=mesh(p,cube,m,x,y,z);o.scale.set(w,h,d);o.rotation.y=ry;return o;
}
function cyl(p,x,y,z,rb,rt,h,m='ivory',n=16,ry=0) {
  const r=Math.max(.0001,rb,rt),a=+(rb/r).toFixed(3),b=+(rt/r).toFixed(3);
  const geo=geometry('c'+n+','+a+','+b,()=>new T.CylinderGeometry(b,a,1,n));
  const o=mesh(p,geo,m,x,y,z);o.scale.set(r,h,r);o.rotation.y=ry;return o;
}
function orb(p,x,y,z,rx,ry,rz,m,n=12) {
  const geo=geometry('s'+n,()=>new T.SphereGeometry(1,n,Math.max(6,n>>1)));
  const o=mesh(p,geo,m,x,y,z);o.scale.set(rx,ry,rz);return o;
}
function ico(p,x,y,z,rx,ry,rz,m,detail=0) {
  const o=mesh(p,geometry('i'+detail,()=>new T.IcosahedronGeometry(1,detail)),m,x,y,z);o.scale.set(rx,ry,rz);return o;
}
function torus(p,x,y,z,r,t,m='gold',horizontal=false,n=32) {
  const ratio=+(t/r).toFixed(4);
  const geo=geometry('t'+n+','+ratio,()=>new T.TorusGeometry(1,ratio,6,n));
  const o=mesh(p,geo,m,x,y,z);o.scale.setScalar(r);if(horizontal)o.rotation.x=PI/2;return o;
}
function rod(p,from,to,r1,r2=r1,m='ivory',n=8) {
  const a=V(...from),b=V(...to),dir=b.clone().sub(a),mid=a.add(b).multiplyScalar(.5);
  const o=cyl(p,mid.x,mid.y,mid.z,r1,r2,dir.length(),m,n);
  o.quaternion.setFromUnitVectors(V(0,1,0),dir.normalize());return o;
}
function timber(p,a,b,w,d,m='walnut') {
  const A=V(...a),B=V(...b),delta=B.clone().sub(A),mid=A.add(B).multiplyScalar(.5);
  const o=box(p,mid.x,mid.y,mid.z,w,delta.length(),d,m);o.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return o;
}
function tube(p,path,r,m='gold',n=18,sides=6) {
  const curve=new T.CatmullRomCurve3(path.map(q=>V(...q)));
  return mesh(p,new T.TubeGeometry(curve,n,r,sides,false),m);
}
function extrude(p,pts,depth,m,x=0,y=0,z=0) {
  const sh=new T.Shape();sh.moveTo(...pts[0]); for(let i=1;i<pts.length;i++)sh.lineTo(...pts[i]);sh.closePath();
  const geo=new T.ExtrudeGeometry(sh,{depth,bevelEnabled:false,curveSegments:12});geo.translate(0,0,-depth/2);
  return mesh(p,geo,m,x,y,z);
}
function rawGeo(pos,index,colors,uvs) {
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  if(index)g.setIndex(index);if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  if(uvs)g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.computeVertexNormals();return g;
}
function lathe(p,x,y,z,profile,m,n=24) {
  return mesh(p,new T.LatheGeometry(profile.map(a=>new T.Vector2(...a)),n),m,x,y,z);
}
function lineProfile(p,x,y,z,sx,sy,profile,m,n=16) {
  const ge=geometry('l'+n+JSON.stringify(profile),()=>new T.LatheGeometry(profile.map(q=>new T.Vector2(...q)),n));
  const o=mesh(p,ge,m,x,y,z);o.scale.set(sx,sy,sx);return o;
}
function arcline(r,s,h,gothic=false,n=16) {
  const pts=[[-r,0],[-r,s]];
  for(let i=0;i<=n;i++) {
    const t=i/n;
    if (gothic) {
      const c=(h*h-r*r)/(2*r),rad=r+c,ang=Math.acos(clamp(c/rad,-1,1))*Math.min(t,1-t)*2;
      pts.push([(t<.5?1:-1)*(c-rad*cos(ang)),s+rad*sin(ang)]);
    } else pts.push([-r*cos(PI*t),s+h*sin(PI*t)]);
  }
  pts.push([r,0]);return pts;
}
function archBand(p,x,y,z,r,s,h,t,d,m='ivory',pointed=false) {
  const a=arcline(r,s,h,pointed),b=arcline(r+t,s,h+t,pointed);
  const key=['ab',r,s,h,t,d,pointed].join('|');
  const ge=geometry(key,()=>{const obj=extrude(new T.Group(),a.concat(b.reverse()),d,m);return obj.geometry;});
  return mesh(p,ge,m,x,y,z);
}
function archWall(p,x,y,z,w,h,d,opening,s,rise,m='ashlar',pointed=false) {
  const k=['aw',w,h,d,opening,s,rise,pointed].join('|');
  const geo=geometry(k,()=>extrude(new T.Group(),[[-w/2,0],[-w/2,h],[w/2,h],[w/2,0],...arcline(opening/2,s,rise,pointed).reverse()],d,m).geometry);
  return mesh(p,geo,m,x,y,z);
}
function windowArch(p,x,y,z,w,h,pointed=true,rich=false,glass='glass') {
  const r=w/2,rise=Math.min(h*.52,r*(pointed?1.52:1)),s=h-rise;
  const ge=geometry(['win',w,h,pointed].join('|'),()=>extrude(new T.Group(),arcline(r,s,rise,pointed),.043,glass).geometry);
  mesh(p,ge,glass,x,y,z);
  archBand(p,x,y,z+.034,r,s,rise,w*.075,.115,'trim',pointed);
  box(p,x,y+.01,z+.06,w*1.27,w*.107,.20,'ivory');
  box(p,x,y+h*.46,z+.055,w*.052,h*.88,.072,'bone');
  box(p,x,y+h*.46,z+.06,w*.96,w*.060,.07,'brass');
  if(rich){
    for(const side of [-1,1]) archBand(p,x+side*w*.225,y+h*.067,z+.067,w*.20,h*.47,w*.36,w*.044,.075,'bone',true);
    torus(p,x,y+h*.82,z+.062,w*.105,w*.031,'gold',false,14);
  }
}
function radial(p,r,angle,y=0) {return group(p,r*sin(angle),y,r*cos(angle),angle);}

// Bake immobile geometry once, keeping independently animated local transforms.
function bake(root) {
  root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert(),sets=new Map(),mobiles=[];
  function walk(o) {
    if(o!==root && o.userData.mobile){mobiles.push(o);return;}
    if(o.isMesh && !o.isInstancedMesh) {
      const mat=o.material; if(!sets.has(mat))sets.set(mat,[]);
      sets.get(mat).push({g:o.geometry,m:new T.Matrix4().multiplyMatrices(inv,o.matrixWorld),o});
    } else for(const child of o.children.slice())walk(child);
  }
  walk(root);
  for(const [mat,parts] of sets) {
    const byGeo=new Map();
    for(const p of parts){if(!byGeo.has(p.g))byGeo.set(p.g,[]);byGeo.get(p.g).push(p);p.o.removeFromParent();}
    const merge=[];
    for(const [g,list] of byGeo) {
      if(list.length>=10) {
        const im=new T.InstancedMesh(g,mat,list.length);list.forEach((q,i)=>im.setMatrixAt(i,q.m));
        im.castShadow=im.receiveShadow=true;im.computeBoundingSphere();root.add(im);
      } else merge.push(...list);
    }
    if(!merge.length)continue;
    let count=0,ni=0;
    for(const q of merge){const g=q.g;count+=g.attributes.position.count;ni+=g.index?g.index.count:g.attributes.position.count;}
    const pp=new Float32Array(count*3),nn=new Float32Array(count*3),ii=new Uint32Array(ni);
    const cc=mat.vertexColors?new Float32Array(count*3):null,uu=mat.map?new Float32Array(count*2):null;
    let base=0,k=0;const v=V(),normalMatrix=new T.Matrix3();
    for(const q of merge) {
      const g=q.g,pos=g.attributes.position,norm=g.attributes.normal,col=g.attributes.color;
      normalMatrix.getNormalMatrix(q.m);
      for(let i=0;i<pos.count;i++) {
        v.fromBufferAttribute(pos,i).applyMatrix4(q.m).toArray(pp,(base+i)*3);
        v.fromBufferAttribute(norm,i).applyNormalMatrix(normalMatrix).toArray(nn,(base+i)*3);
        if(cc){if(col)v.fromBufferAttribute(col,i);else v.set(1,1,1);v.toArray(cc,(base+i)*3);}
        if(uu&&g.attributes.uv){uu[(base+i)*2]=g.attributes.uv.getX(i);uu[(base+i)*2+1]=g.attributes.uv.getY(i);}
      }
      const idx=g.index?g.index.array:null,n=idx?idx.length:pos.count;
      for(let i=0;i<n;i++)ii[k++]=base+(idx?idx[i]:i);base+=pos.count;
    }
    const bg=new T.BufferGeometry();bg.setAttribute('position',new T.BufferAttribute(pp,3));bg.setAttribute('normal',new T.BufferAttribute(nn,3));
    if(cc)bg.setAttribute('color',new T.BufferAttribute(cc,3));if(uu)bg.setAttribute('uv',new T.BufferAttribute(uu,2));bg.setIndex(new T.BufferAttribute(ii,1));bg.computeBoundingSphere();mesh(root,bg,mat);
  }
  const prune=o=>{for(const c of o.children.slice()){if(c.userData.mobile)continue;if(c.isGroup){prune(c);if(!c.children.length)c.removeFromParent();}}};prune(root);
  mobiles.forEach(bake);
}
