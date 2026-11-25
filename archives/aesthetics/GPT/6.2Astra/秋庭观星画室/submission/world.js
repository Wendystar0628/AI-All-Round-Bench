// All dimensions are in garden units. Static objects are batched after construction.
const T=THREE,TAU=Math.PI*2,V=(x,y,z)=>new T.Vector3(x,y,z),scene=new T.Scene(),gardenRoot=new T.Group();scene.add(gardenRoot);let world=gardenRoot;
// Each building and all its furnishings share one placement on the site plan.
const matrixSite=new WeakMap(),sites={};
function site(name,origin,anchor,scale=1,angle=0){
  const group=new T.Group();group.name=name;group.scale.setScalar(scale);group.rotation.y=angle;
  const offset=V(...origin).multiplyScalar(scale).applyAxisAngle(V(0,1,0),angle);
  group.position.copy(V(...anchor).sub(offset));gardenRoot.add(group);group.updateMatrixWorld();
  sites[name]=group;
}
function atSite(name,build){
  const parent=world;world=sites[name];try{return build()}finally{world=parent}
}
function sitePoint(name,p){return V(...p).applyMatrix4(sites[name].matrixWorld)}
const terraceY=2.72,axisX=4.67;
// The buildings use their own local dimensions; paths meet their transformed thresholds.
site('studio',[-3.48,.12,-2.01],[-3.82,.12,-2.43],.735,.19);
site('upper',[4.67,.12,-2.35],[4.67,.12,-2.83],.79);
site('treeGround',[0,0,0],[-.43,0,-.05]);
site('entry',[-5.54,.12,5.84],[-4.91,.12,5.51],.77);
site('sand',[-3.71,.12,4.59],[-3.36,.12,4.55],.95);
site('sweep',[.64,.12,-.03],[.43,.12,-2.49],.70);
site('gate',[4.75,.12,3.45],[axisX,.12,5.57],.77);
site('hall',[4.4,1.98,-4.86],[axisX,terraceY,-4.41],.88);
site('purification',[2.81,.14,1.35],[2.17,terraceY,-2.95],.90);
site('inari',[2.49,.12,-1.52],[6.32,terraceY,-5.92],.85);
site('votive',[2.39,1.98,-3.05],[2.43,terraceY,-4.58],.88,.36);
site('barrels',[6.365,1.98,-5.04],[2.51,terraceY,-5.86],.91);
site('fortunes',[6.15,1.98,-4.12],[6.76,terraceY,-3.58],.87,-1.10);
site('junction',[3.56,.12,2.02],[5.84,.12,1.38],.66,-.88);
site('bonsai',[-4.38,.12,2.66],[-4.98,.12,1.56],.90);
site('ginkgo',[.37,.11,-4.09],[.51,terraceY,-3.02]);
site('rest',[.32,.12,-.63],[1.18,.12,-2.18],.66,.30);
site('dipper',[1.53,.827,2.29],[1.47,.964,.32]);
site('stair',[4.75,.12,3.02],[axisX,.12,2.16]);
for(const key of ['hall','purification','inari','votive','barrels','fortunes','treeGround','stair'])sites.upper.add(sites[key]);
sites.treeGround.add(sites.ginkgo);
sites.studio.add(sites.bonsai);
gardenRoot.updateMatrixWorld(true);
let seed=289312;function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}function R(a,b){return a+(b-a)*rand()}function pick(a){return a[Math.floor(rand()*a.length)]}function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
const renderer=new T.WebGLRenderer({canvas:stage,antialias:false,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor(0,0);renderer.getContext().disable(renderer.getContext().DITHER);renderer.outputColorSpace=T.SRGBColorSpace;
const camera=new T.PerspectiveCamera(38,1,.035,170);
const sunlight=new T.DirectionalLight(0xffe0a6,2.1);sunlight.position.set(-4.8,13,-7.4);sunlight.castShadow=true;Object.assign(sunlight.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.5,far:48});sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.bias=-.00045;sunlight.shadow.normalBias=.018;scene.add(sunlight,new T.HemisphereLight(0xfff2da,0xb9a7be,1.7));
const grad=new T.DataTexture(new Uint8Array([64,74,84,255,159,153,159,255,213,212,198,255,255,249,225,255]),4,1);grad.needsUpdate=true;grad.minFilter=grad.magFilter=T.NearestFilter;
const paint=new T.MeshToonMaterial({color:0xffffff,gradientMap:grad,side:T.DoubleSide});
const boxG=new T.BoxGeometry(1,1,1),sphereG=new T.SphereGeometry(1,14,10),rockG=new T.IcosahedronGeometry(1,1),geos=new Map(),batches=new Map(),tmp=new T.Object3D(),ink='#493f38',wood='#6b4430',lightwood='#b58451',red='#bd412a',gold='#cf9d50',paper='#eddfb5',sage='#667b52';let anim=[];
function cached(k,fn){if(!geos.has(k))geos.set(k,fn());return geos.get(k)}
function obj(g,x,y,z,sx,sy,sz,c,rx=0,ry=0,rz=0,mat=paint){tmp.position.set(x,y,z);tmp.scale.set(sx,sy,sz);tmp.rotation.set(rx,ry,rz);tmp.updateMatrix();let k=g.uuid+mat.uuid;if(!batches.has(k))batches.set(k,{g,mat,m:[],c:[]});let b=batches.get(k);const rest=tmp.matrix.clone();if(world!==gardenRoot)matrixSite.set(rest,world);if(activeJoint)jointForMatrix.set(rest,activeJoint);b.m.push(rest);b.c.push(c);return tmp}
function box(x,y,z,w,h,d,c,rx=0,ry=0,rz=0){return obj(boxG,x,y,z,w,h,d,c,rx,ry,rz)}
function ball(x,y,z,w,h,d,c,rx=0,ry=0,rz=0){return obj(sphereG,x,y,z,w,h,d,c,rx,ry,rz)}
function rock(x,y,z,w,h,d,c){return obj(rockG,x,y,z,w,h,d,c,R(-.15,.15),R(0,6),R(-.12,.12))}
function cylG(r=1,n=16){return cached('c'+r+'_'+n,()=>new T.CylinderGeometry(r,1,1,n))}
function cyl(x,y,z,r,h,c,ratio=1,n=16){return obj(cylG(ratio,n),x,y,z,r,h,r,c)}
function rod(x,y,z,X,Y,Z,r,c,ratio=1,n=10){let v=V(X-x,Y-y,Z-z),q=new T.Quaternion().setFromUnitVectors(V(0,1,0),v.clone().normalize()),e=new T.Euler().setFromQuaternion(q);return obj(cylG(ratio,n),(X+x)/2,(Y+y)/2,(Z+z)/2,r,v.length(),r,c,e.x,e.y,e.z)}
function ring(x,y,z,r,t,c,rx=0,ry=0,rz=0,s=1){let g=cached('r'+Math.round(t/r*100),()=>new T.TorusGeometry(1,t/r,7,48));return obj(g,x,y,z,r,r*s,r,c,rx,ry,rz)}
function pipe(pts,r,c){for(let i=1;i<pts.length;i++)rod(...pts[i-1],...pts[i],r,c)}
function mesh(g,c,x=0,y=0,z=0,mat){let o=new T.Mesh(g,mat||new T.MeshToonMaterial({color:c,gradientMap:grad,side:T.DoubleSide}));o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;world.add(o);if(activeJoint){o.updateMatrix();activeJoint.singles.push([o,o.matrix.clone()]);o.matrixAutoUpdate=false}return o}
function moving(g,x,y,z,c,sx=1,sy=1,sz=1,cb){let o=mesh(g,c,x,y,z);o.scale.set(sx,sy,sz);if(cb)anim.push(t=>cb(o,t));return o}
// Each suspended assembly has one pivot. Related parts share its displacement.
let activeJoint = null;
const joints = [], jointForMatrix = new WeakMap();
function windStrength(t, x, z) {
  const arrival = (5 - x) * .39 + (3 - z) * .12;
  const phase = ((t - arrival + 84) % 42) - 4;
  return Math.exp(-phase * phase / 8);
}
function suspended(x, y, z, amplitude, makeParts, delay=0) {
  const joint = { x, y, z, amplitude, delay, matrix: new T.Matrix4(), origin: new T.Matrix4().makeTranslation(-x, -y, -z), singles: [] };
  const previous = activeJoint;
  activeJoint = joint;
  joints.push(joint);
  try { return makeParts(); } finally { activeJoint = previous; }
}
const roundDetails=[],middleSphere=new T.SphereGeometry(1,11,7),smallSphere=new T.SphereGeometry(1,8,5);
function sizedSpheres(matrices,indices){
  const buckets=[[],[],[]],radii=[0,0,0];
  for(const id of indices){
    const m=matrices[id].elements;
    const r=Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
    const bin=r<.081?0:r<.187?1:2;buckets[bin].push(id);radii[bin]=Math.max(radii[bin],r);
  }
  return buckets.map((items,i)=>({items,radius:radii[i]}));
}
function selectRoundDetail(){
  const pixelsPerUnit=renderer.domElement.height/visibleHeight();
  for(const entry of roundDetails){
    // A perspective near plane may bring a small prop into the foreground.
    const diameter=2*entry.radius*pixelsPerUnit;
    entry.mesh.geometry=dist<3?sphereG:diameter<=11?smallSphere:diameter<=23?middleSphere:sphereG;
  }
}
function flush() {
  const movingBatches = [];
  for (const {g, mat, m, c} of batches.values()) {
    const fixed = [], mobile = [];
    m.forEach((matrix, i) => (jointForMatrix.has(matrix) ? mobile : fixed).push(i));
    for (const indices of [fixed, mobile]) {
      if (!indices.length) continue;
      const parents=new Map();
      for(const i of indices){const parent=matrixSite.get(m[i])||gardenRoot;if(!parents.has(parent))parents.set(parent,[]);parents.get(parent).push(i)}
      for(const [parent,members] of parents){
      const groups=g===sphereG?sizedSpheres(m,members):[{items:members,radius:0}];
      for(const {items,radius} of groups){
        if(!items.length)continue;
        const obj=new T.InstancedMesh(g,mat,items.length);
        items.forEach((source,i)=>{
          obj.setMatrixAt(i,m[source]);obj.setColorAt(i,new T.Color(c[source]));
        });
        obj.castShadow=obj.receiveShadow=true;
        if(mat.userData.windDepth)obj.customDepthMaterial=mat.userData.windDepth;
        parent.add(obj);
        if(radius)roundDetails.push({mesh:obj,radius});
        if(indices===mobile){
          obj.instanceMatrix.setUsage(T.DynamicDrawUsage);obj.frustumCulled=false;
          movingBatches.push({obj,parts:items.map(i=>[jointForMatrix.get(m[i]),m[i]])});
        }
      }
      }
    }
  }
  batches.clear();
  const product = new T.Matrix4(), angles = new T.Euler();
  anim.push(t => {
    for (const joint of joints) {
      const {x, y, z, amplitude} = joint;
      const gust = windStrength(t-joint.delay, x, z);
      const tilt = amplitude * (.12 * Math.sin(1.46*t + x + z) + gust * (.6 + .4*Math.sin(3.1*t + x)));
      angles.set(.36 * tilt, .14 * tilt, tilt);
      joint.matrix.makeRotationFromEuler(angles).setPosition(x, y, z).multiply(joint.origin);
      for (const [mesh, rest] of joint.singles) {
        mesh.matrix.multiplyMatrices(joint.matrix, rest);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    for (const {obj, parts} of movingBatches) {
      parts.forEach(([joint, rest], i) => obj.setMatrixAt(i, product.multiplyMatrices(joint.matrix, rest)));
      obj.instanceMatrix.needsUpdate = true;
    }
  });
}
function canvasTex(w,h,fn){let cv=document.createElement('canvas');cv.width=w;cv.height=h;fn(cv.getContext('2d'),w,h);let tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex}
function art(x,y,z,w,h,draw,rx=0,ry=0){let o=mesh(new T.PlaneGeometry(w,h),0,x,y,z,new T.MeshBasicMaterial({map:canvasTex(512,Math.max(64,Math.round(512*h/w)),draw),side:T.DoubleSide}));o.rotation.set(rx,ry,0);return o}
function sign(x,y,z,w,h,label,bg='#473f34',fg='#f1dcac',sub=''){return art(x,y,z,w,h,(p,W,H)=>{p.fillStyle=bg;p.fillRect(0,0,W,H);p.strokeStyle=fg;p.lineWidth=2;p.strokeRect(7,7,W-14,H-14);p.textAlign='center';p.textBaseline='middle';p.fillStyle=fg;p.font='500 '+Math.min(H*.59,W/(label.length+.6))+'px "SimSun",serif';p.fillText(label,W/2,H*(sub?.4:.51));if(sub){p.font='16px Georgia';p.fillText(sub,W/2,H*.78)}})}
function slab(x,y,z,w,d,h,color){box(x,y,z,w,h,d,ink);box(x,y+.017,z,w-.035,h,d-.035,color)}
function stone(x,y,z,r=.32){rock(x,y,z,r,R(.07,.14),r*R(.65,1.1),pick(['#a9a593','#b0a997','#9e9382','#c1b8a3']))}
function polygon(points){let sh=new T.Shape();points.forEach(([x,y],i)=>i?sh.lineTo(x,y):sh.moveTo(x,y));sh.closePath();return new T.ShapeGeometry(sh)}
function face(verts,inds,c){let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts.flat(),3));g.setIndex(inds);g.computeVertexNormals();return mesh(g,c)}
const mapleGeo=polygon([[0,-.43],[-.07,-.14],[-.52,-.12],[-.27,.05],[-.54,.32],[-.19,.21],[-.26,.62],[-.07,.4],[0,.9],[.1,.4],[.28,.62],[.21,.19],[.55,.32],[.29,.03],[.53,-.12],[.07,-.15]]);
const fanGeo=polygon([[0,-.35],[-.06,-.15],[-.48,.24],[-.52,.43],[-.35,.59],[-.14,.66],[0,.48],[.08,.67],[.32,.62],[.52,.43],[.48,.24],[.05,-.15]]);
let mapCols=['#a8362c','#be3f26','#dc512b','#cd422c','#e86a2f','#f28a40'],ginCols=['#b89329','#cb9f25','#eebd2b','#f4ce3d','#f8db54','#ffe274'];function leaf(x,y,z,s,type=0,c,flat=false){obj(type?fanGeo:mapleGeo,x,y,z,s,s,s,c||pick(type?ginCols:mapCols),flat?-1.56:R(-1.7,-.45),R(0,6.28),R(0,6.28))}
function plank(x,y,z,w,h,d,col){box(x,y,z,w,h,d,col);for(let j=0;j<3;j++){let len=w*R(.1,.4);box(x+R(-(w-len)/2,(w-len)/2),y+h/2+.001,z+R(-d*.4,d*.4),len,.002,.007,'#805e43')}}
function pot(x,y,z,r,c){cyl(x,y+r*.46,z,r*.74,r*.92,c,1.33);cyl(x,y+r*.94,z,r*1.03,.06,c);cyl(x,y+r*.978,z,r*.87,.025,'#493e31')}
// Shimenawa are continuously braided, including the smaller ropes on the Inari gates.
function rope(x,y,z,w,sag=.18){
  const size=w/2.10,thickness=size*.025,steps=88;
  for(let strand=0;strand<3;strand++){
    let path=[];
    for(let i=0;i<=steps;i++){
      const u=i/steps,phase=u*TAU*10+strand*TAU/3,bulge=.62+.38*Math.sin(Math.PI*u);
      path.push([x+(u-.5)*w,y-sag*Math.sin(Math.PI*u)+thickness*bulge*Math.cos(phase),z+thickness*bulge*Math.sin(phase)]);
    }
    pipe(path,thickness*.68,['#a1804f','#d2b381','#b89967'][strand]);
  }
  const shide=cached('folded-shide',()=>polygon([[-.022,0],[.023,0],[.023,-.051],[.056,-.051],[.056,-.115],[.086,-.115],[.086,-.192],[.041,-.192],[.041,-.142],[.011,-.142],[.011,-.083],[-.022,-.083]]));
  for(let i=0;i<5;i++){
    const u=.12+i*.19,X=x+(u-.5)*w,Y=y-sag*Math.sin(Math.PI*u);
    suspended(X,Y,z,.31,()=>{
      if(i===1||i===3){
        for(let k=0;k<10;k++){let a=k*TAU/10;rod(X+.009*size*Math.cos(a),Y-.014*size,z+.009*size*Math.sin(a),X+.033*size*Math.cos(a),Y-(.165+.019*Math.sin(k*2.4))*size,z+.029*size*Math.sin(a),.0062*size,'#bea06b',.44,5)}
      }else{
        obj(shide,X,Y-.018*size,z+.018*size,size,size,size,'#f3ecd5',.09,.14*Math.sin(i),.14);
        obj(shide,X+.012*size,Y-.019*size,z+.016*size,size*.9,size*.84,size,'#d7d1bc',-.11,-.34,-.12);
      }
    });
  }
}
function stoneLanternCap(x,y,z,s,wide){
  const count=wide?6:4,overhang=wide?.65:.49;
  const levels=[[.98,0],[1,.057],[.77,.109],[.48,.177],[.28,.257]];
  const vertices=[],indices=[];
  for(let row=0;row<levels.length;row++){
    for(let k=0;k<count*4;k++){
      const section=Math.floor(k/4),t=(k%4)/4;
      const a=(section+.5)*TAU/count,b=(section+1.5)*TAU/count;
      const radius=overhang*s*levels[row][0],atCorner=(1-Math.sin(t*Math.PI));
      vertices.push([x+radius*((1-t)*Math.cos(a)+t*Math.cos(b)),y+s*(levels[row][1]+(.038-.006*row)*atCorner),z+radius*((1-t)*Math.sin(a)+t*Math.sin(b))]);
      if(row){const n=row*count*4+k,nn=row*count*4+(k+1)%(count*4);indices.push(n,nn,nn-count*4,n,nn-count*4,n-count*4)}
    }
  }
  face(vertices,indices,'#868e7e');
  for(let i=0;i<count;i++){
    const a=(i+.5)*TAU/count;let path=[];
    for(let row=1;row<levels.length;row++)path.push([x+Math.cos(a)*overhang*s*levels[row][0],y+s*(levels[row][1]+.039-.006*row),z+Math.sin(a)*overhang*s*levels[row][0]]);
    pipe(path,s*.012,'#a0a590');
  }
  cyl(x,y+.258*s,z,.135*s,.039*s,'#939a89',1,12);
  ball(x,y+.337*s,z,.092*s,.096*s,.092*s,'#99a08e');
  cyl(x,y+.432*s,z,.049*s,.094*s,'#a3a591',.048,12);
}
// The weathered granite of the figures, lanterns and well shares one mineral wash.
const mineralWash=canvasTex(384,384,(p,w,h)=>{
  p.fillStyle='#e4e4d8';p.fillRect(0,0,w,h);
  let seed=19831;const local=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let j=0;j<210;j++){
    let x=local()*w,y=local()*h,r=2+local()*24;
    const g=p.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,j%3?'rgba(113,127,113,.14)':'rgba(171,160,143,.19)');g.addColorStop(1,'rgba(147,149,126,0)');p.fillStyle=g;p.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let j=0;j<12000;j++){let x=local()*w,y=local()*h,r=.3+local()**2*1.23;p.fillStyle=j%3?'#faf4df65':'#666b644d';p.fillRect(x,y,r,r*.71)}
});mineralWash.wrapS=mineralWash.wrapT=T.RepeatWrapping;
function mineralWashOn(mat){
  mat.onBeforeCompile=shader=>{
    shader.uniforms.graniteWash={value:mineralWash};
    shader.vertexShader='varying vec3 stoneLocal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      vec4 cutStone=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        cutStone=instanceMatrix*cutStone;
      #endif
      stoneLocal=(modelMatrix*cutStone).xyz;
      #include <project_vertex>
    `);
    shader.fragmentShader='varying vec3 stoneLocal;uniform sampler2D graniteWash;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 veinUV=vec2(stoneLocal.x*.82+stoneLocal.z*.73,stoneLocal.y*.93+stoneLocal.z*.29);
      vec3 minerals=texture2D(graniteWash,veinUV).rgb;
      diffuseColor.rgb*=.63+.56*minerals;
    `);
  };mat.customProgramCacheKey=()=>'carvedGraniteWash';return mat;
}
const graniteFinish=mineralWashOn(paint.clone());
function lantern(x,y,z,s=1,wide=false){
  const c='#959b8c',dark='#788375',light='#a8ad9a';
  let hearth;
  if(wide){
    for(let k=0;k<4;k++){
      const a=(k+.5)*Math.PI/2;
      const p=(r,h)=>[x+r*s*Math.cos(a),y+h*s,z+r*s*Math.sin(a)];
      rootCurve([p(.184,.365),p(.24,.265),p(.31,.102),p(.359,.048)],.091*s,dark);
      obj(rockG,...p(.332,.047),.106*s,.046*s,.089*s,c,0,a);
    }
    hearth=.42;
    cyl(x,y+.337*s,z,.349*s,.093*s,dark,1.13,6);cyl(x,y+.398*s,z,.411*s,.061*s,light,1,6);
  }else{
    cyl(x,y+.071*s,z,.335*s,.142*s,c,1,8);cyl(x,y+.165*s,z,.289*s,.085*s,dark,.89,8);
    cyl(x,y+.235*s,z,.252*s,.086*s,c,.63,12);
    cyl(x,y+.509*s,z,.141*s,.477*s,c,.87,16);
    for(let yy of [.323,.676])cyl(x,y+yy*s,z,.145*s,.038*s,light,1,16);
    cyl(x,y+.785*s,z,.146*s,.141*s,dark,1.97,8);
    cyl(x,y+.883*s,z,.322*s,.063*s,light,1,8);
    hearth=.915;
  }
  const chamberH=wide?.319:.352,rad=wide?.272:.224,sides=wide?6:4;
  for(let k=0;k<sides;k++){
    const a=(k+.5)*TAU/sides,X=x+Math.sin(a)*rad*s,Z=z+Math.cos(a)*rad*s;
    cyl(X,y+(hearth+chamberH*.5)*s,Z,.045*s,chamberH*s,c,1,8);
  }
  const bodyRadius=(wide?.187:.149)*s;
  cyl(x,y+(hearth+chamberH*.51)*s,z,bodyRadius,chamberH*.91*s,'#e8cb8b',1,sides);
  for(let k=0;k<sides;k++){
    const a=k*TAU/sides,rr=rad*Math.cos(Math.PI/sides)*s,xx=x+Math.sin(a)*rr,zz=z+Math.cos(a)*rr;
    const faceW=2*rad*Math.sin(Math.PI/sides)-.034,faceH=chamberH-.028;
    const panel=cached('lantern chamber '+wide+' '+(k%3),()=>{
      const sh=new T.Shape();sh.moveTo(-faceW/2,-faceH/2);sh.lineTo(faceW/2,-faceH/2);sh.lineTo(faceW/2,faceH/2);sh.lineTo(-faceW/2,faceH/2);sh.closePath();
      if(k%3===0){let hole=new T.Path();hole.absarc(0,0,.069,0,TAU,true);sh.holes.push(hole)}
      else if(k%3===1){
        let hole=new T.Path();hole.moveTo(-.013,.085);hole.bezierCurveTo(-.092,.065,-.107,-.035,-.038,-.076);hole.bezierCurveTo(.003,-.098,.042,-.072,.052,-.051);hole.bezierCurveTo(-.037,-.081,-.072,.028,-.013,.085);sh.holes.push(hole);
      }else{
        for(let j of [-1,0,1]){let hole=new T.Path(),cx=j*.05;hole.moveTo(cx-.012,-.083);hole.lineTo(cx-.012,.083);hole.lineTo(cx+.012,.083);hole.lineTo(cx+.012,-.083);hole.closePath();sh.holes.push(hole)}
      }
      return new T.ExtrudeGeometry(sh,{depth:.026,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,curveSegments:18});
    });
    obj(panel,xx,y+(hearth+chamberH*.50)*s,zz,s,s,s,c,0,a,0,graniteFinish);
  }
  cyl(x,y+(hearth+chamberH+.004)*s,z,(wide?.345:.32)*s,.054*s,dark,1,sides);
  stoneLanternCap(x,y+(hearth+chamberH)*s,z,s,wide);
  for(let k=0;k<5;k++){let a=k*2.399+.32,r=(wide?.30:.22)*s;obj(rockG,x+Math.cos(a)*r,y+(hearth+chamberH+.135)*s,z+Math.sin(a)*r,.073*s,.018*s,.042*s,'#879469',0,a)}
}
function paperlamp(x,y,z,s=1){suspended(x,y+.28*s,z,.21,()=>{ball(x,y,z,.18*s,.25*s,.18*s,'#ffdb98');for(let i=-2;i<=2;i++)ring(x,y+i*.075*s,z,(.18*Math.sqrt(1-(i*.29)**2))*s,.009*s,'#bc8f58',Math.PI/2);cyl(x,y+.24*s,z,.097*s,.05*s,wood);cyl(x,y-.24*s,z,.1*s,.055*s,wood)})}

function rootCurve(points,radius,color){
  const line=new T.CatmullRomCurve3(points.map(p=>V(...p))),segments=points.length*5;
  const vertices=[],indices=[],axis=V(0,1,0);
  for(let i=0;i<=segments;i++){
    const u=i/segments,center=line.getPointAt(u),tangent=line.getTangentAt(u);
    const cross=new T.Vector3().crossVectors(tangent,Math.abs(tangent.y)>.91?V(1,0,0):axis).normalize();
    const binormal=new T.Vector3().crossVectors(tangent,cross);
    const r=radius*(.083+.917*(1-u)**.79);
    for(let k=0;k<7;k++){
      const a=k*TAU/7,pt=center.clone().addScaledVector(cross,r*Math.cos(a)).addScaledVector(binormal,r*Math.sin(a));
      vertices.push(pt.toArray());
      if(i){let n=i*7+k,nn=i*7+(k+1)%7;indices.push(n,n-7,nn-7,n,nn-7,nn)}
    }
  }
  return face(vertices,indices,color);
}
