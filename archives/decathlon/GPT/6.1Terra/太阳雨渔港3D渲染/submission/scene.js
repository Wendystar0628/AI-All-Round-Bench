const scene = new THREE.Scene();
// A pale, sun-washed sky is generated on canvas and remains local-file safe.
const skyCanvas=document.createElement('canvas');skyCanvas.width=skyCanvas.height=512;
const skyContext=skyCanvas.getContext('2d');
const skyGradient=skyContext.createLinearGradient(0,0,0,512);
skyGradient.addColorStop(0,'#d1e9e8');skyGradient.addColorStop(.58,'#e0f0ed');skyGradient.addColorStop(1,'#eff6ed');
skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,512,512);
const skyGlow=skyContext.createRadialGradient(390,75,0,390,75,300);
skyGlow.addColorStop(0,'rgba(255,250,229,.22)');skyGlow.addColorStop(1,'rgba(255,250,229,0)');
skyContext.fillStyle=skyGlow;skyContext.fillRect(0,0,512,512);
scene.background=new THREE.CanvasTexture(skyCanvas);scene.background.colorSpace=THREE.SRGBColorSpace;
scene.fog = new THREE.Fog(0xdcefee, 23, 45);
const camera = new THREE.PerspectiveCamera(31, innerWidth/innerHeight, .1, 100);
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0; document.body.appendChild(renderer.domElement);
const hemi=new THREE.HemisphereLight(0xf4ffff,0x9cb5a8,1.45); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffedc4,1.6); sun.position.set(-5,12,8); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:30}); sun.shadow.bias=-.0005; scene.add(sun);
const root=new THREE.Group();scene.add(root);
// A restrained stepped diffuse response keeps the lighting illustrative and soft.
const mat=(c,extra={})=>{
  const material=new THREE.MeshStandardMaterial({color:c,roughness:.85,...extra});
  if(!extra.transparent){
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `float watercolorLight = dot(totalDiffuse, vec3(0.299, 0.587, 0.114));
         float watercolorBand = floor(watercolorLight * 5.0 + 0.5) / 5.0;
         vec3 steppedDiffuse = totalDiffuse * mix(1.0, watercolorBand / max(watercolorLight, 0.0001), 0.45);
         vec3 outgoingLight = steppedDiffuse + totalSpecular + totalEmissiveRadiance;`
      );
    };
  }
  return material;
};
const C={concrete:mat(0xc8d0c8),top:mat(0xdce0d7,{roughness:.74}),edge:mat(0xaebfb8),dark:mat(0x304b4d),deep:mat(0x245e60),white:mat(0xf4f1df),yellow:mat(0xeebc45),black:mat(0x303c3a),orange:mat(0xd9804f),rust:mat(0x986f55),blue:mat(0x628b96),wood:mat(0x987961),green:mat(0x789c7c),glass:mat(0xb9e5df,{transparent:true,opacity:.22,roughness:.15,side:THREE.DoubleSide,depthWrite:false}),water:mat(0x70c0ba,{transparent:true,opacity:.76,roughness:.25}),foam:mat(0xeaf8ed),gold:mat(0xffdb91,{emissive:0xc89b4e,emissiveIntensity:.25})};
function box(x,y,z,w,h,d,m,parent=root){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function cyl(x,y,z,r1,r2,h,m,parent=root,n=12){const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,n),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function sphere(x,y,z,r,m,parent=root){const o=new THREE.Mesh(new THREE.SphereGeometry(r,10,7),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o}
function line(points,color=0x405b59,width=1,parent=root){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const o=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:.85}));parent.add(o);return o}
function tube(points,r,m,parent=root){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const o=new THREE.Mesh(new THREE.TubeGeometry(curve,32,r,6,false),m);parent.add(o);return o}
function torus(x,y,z,r,t,m,parent=root,rot=[Math.PI/2,0,0]){const o=new THREE.Mesh(new THREE.TorusGeometry(r,t,6,24),m);o.position.set(x,y,z);o.rotation.set(...rot);parent.add(o);return o}
function label(text,w,h,background='#e5e5d5',ink='#375a59',size=54){let c=document.createElement('canvas');c.width=512;c.height=256;let q=c.getContext('2d');q.fillStyle=background;q.fillRect(0,0,512,256);q.fillStyle=ink;q.textAlign='center';q.textBaseline='middle';q.font=`bold ${size}px sans-serif`;text.split('\n').forEach((s,i,a)=>q.fillText(s,256,128+(i-(a.length-1)/2)*70));const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});}
function sign(text,x,y,z,w,h,rot=0,bg='#e7e7d8',ink='#3b5e5d',size=48,parent=root){let o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),label(text,w,h,bg,ink,size));o.position.set(x,y,z);o.rotation.y=rot;parent.add(o);return o}
// The square cutaway, with a clearly legible L of land.
box(0,-1.12,0,10,.72,10,mat(0x80b1a8));
box(1.45,-.38,-.95,7.1,.82,8.1,mat(0x8ac5b9,{transparent:true,opacity:.34,depthWrite:false}));
box(0,-.96,0,10,.12,10,mat(0x526f69));
// harbor floor pebbles
let seed=43;function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}
for(let i=0;i<170;i++){let x=-1.95+rnd()*6.85,z=-4.75+rnd()*7.65;let o=sphere(x,-.76+rnd()*.05,z,.025+rnd()*.065,[C.edge,C.concrete,C.wood][i%3]);o.scale.y=.45}
// L-shaped concrete land, front quay and left return
box(0,-.28,3.75,10,1.25,2.5,C.concrete);box(-3.5,-.28,-.65,3,1.25,6.3,C.concrete);
box(0,.37,3.75,10,.12,2.5,C.top);box(-3.5,.37,-.65,3,.12,6.3,C.top);
// block seams and tide marks on exposed wall
for(let y of [-.62,-.3,.03]){line([[-1.98,y,-3.8],[-1.98,y,2.47],[4.95,y,2.47]],y<0?0x718f85:0x9baea4)}
for(let z=-3.5;z<2.5;z+=.65)line([[-1.975,-.77,z],[-1.975,.32,z]],0x9aafa6);
for(let x=-1.8;x<5;x+=.65)line([[x,-.77,2.475],[x,.32,2.475]],0x9aafa6);
// surface slab joints
for(let x=-4;x<5;x+=1.35)line([[x,.438,2.52],[x,.438,4.98]],0xb5c2bb);
for(let z=-4;z<2.5;z+=1.35)line([[-4.97,.438,z],[-2.04,.438,z]],0xb5c2bb);
// yellow black curb along quay
// Painted diagonal stripes are clipped to the narrow top and the water-facing side.
const stripeInk=mat(0x37463e);
function stripeQuad(vertices){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    ...vertices[0],...vertices[1],...vertices[2],...vertices[0],...vertices[2],...vertices[3]
  ],3));geometry.computeVertexNormals();
  let face=new THREE.Mesh(geometry,stripeInk);face.material.side=THREE.DoubleSide;root.add(face);
}
function curb(x,z,w,d,axis){
  box(x,.49,z,w,.16,d,C.yellow);
  const length=axis==='x'?w:d, width=axis==='x'?d:w;
  for(let u=-length/2+.25;u<length/2-.23;u+=.48){
    const us=[u-.16,u+.06,u+.16,u-.06];
    let top=axis==='x'?
      [[x+us[0],.572,z-width/2],[x+us[1],.572,z-width/2],[x+us[2],.572,z+width/2],[x+us[3],.572,z+width/2]]:
      [[x-width/2,.572,z+us[0]],[x-width/2,.572,z+us[1]],[x+width/2,.572,z+us[2]],[x+width/2,.572,z+us[3]]];
    stripeQuad(top);
    let side=axis==='x'?
      [[x+us[0],.41,z-width/2-.002],[x+us[1],.41,z-width/2-.002],[x+us[2],.57,z-width/2-.002],[x+us[3],.57,z-width/2-.002]]:
      [[x+width/2+.002,.41,z+us[0]],[x+width/2+.002,.41,z+us[1]],[x+width/2+.002,.57,z+us[2]],[x+width/2+.002,.57,z+us[3]]];
    stripeQuad(side);
    // A few exposed concrete flecks make the painted curb feel used.
    if(Math.floor((u+length)*10)%3===0){
      if(axis==='x')box(x+u,.576,z,.055,.003,.018,C.edge);
      else box(x,.576,z+u,.018,.003,.055,C.edge);
    }
  }
}
curb(1.48,2.46,6.95,.16,'x');curb(-1.98,-.75,.16,6.25,'z');
// dock steps at corner
for(let i=0;i<4;i++)box(-1.1-i*.05,.32-i*.13,2.18-i*.24,1.25,.18,.3,C.concrete);
box(-.95,-.1,1.12,1.6,.18,.65,C.edge);
// water surface with shards of posterized reflection
box(1.48,.06,-1.05,7.02,.06,6.95,C.water);box(1.48,.06,-4.76,7.02,.06,.48,C.water);
const shards=[],waterColors=[mat(0xd9f2e4),mat(0x9dd9c8),mat(0x6cb5ae),mat(0x3f918f)];
for(let i=0;i<220;i++){
  let x=-1.83+rnd()*6.75,z=-4.4+rnd()*6.65,w=.08+rnd()*.55,d=.015+rnd()*.065;
  let shape=new THREE.Shape();
  shape.moveTo(-w*.5,-d*.22);shape.lineTo(-w*.28,-d*.50);shape.lineTo(w*.30,-d*.48);
  shape.lineTo(w*.5,-d*.03);shape.lineTo(w*.27,d*.42);shape.lineTo(-w*.34,d*.5);shape.closePath();
  let o=new THREE.Mesh(new THREE.ShapeGeometry(shape),waterColors[i%4]);
  o.rotation.x=-Math.PI/2;o.position.set(x,.105+rnd()*.008,z);root.add(o);shards.push([o,x,w,rnd()*6,z]);
}
// submerged fish, weeds, tires and chain
const fishes=[];for(let i=0;i<10;i++){let g=new THREE.Group();root.add(g);let b=sphere(0,0,0,.09,C.blue,g);b.scale.set(1.8,.55,.6);let tail=new THREE.Mesh(new THREE.ConeGeometry(.07,.13,3),C.blue);tail.rotation.z=-Math.PI/2;tail.position.x=-.2;g.add(tail);g.position.set(-.5+rnd()*4,-.4,-1+rnd()*3);fishes.push([g,g.position.x,rnd()*6]);}
const weedClumps=[];for(let i=0;i<18;i++){let x=-1.65+rnd()*6.1,z=-4+rnd()*5.8;let g=new THREE.Group();g.position.set(x,-.75,z);root.add(g);for(let j=0;j<3;j++)tube([[0,0,0],[.05*j,.20,0],[.08*(j-1),.45-rnd()*.2,0]],.015,C.green,g);weedClumps.push(g)}
torus(3,-.69,1.5,.26,.065,C.black); for(let i=0;i<8;i++)torus(3.3+i*.19,-.68,1.35,.10,.018,C.rust);
// rusted ladders
function ladder(x,z,face){for(let i of [-1,1]){let a=cyl(x+(face==='z'?i*.22:0),-.1,z+(face==='x'?i*.22:0),.025,.025,1.1,C.rust);}
for(let y=-.55;y<.4;y+=.18){let a=cyl(x,y,z,.02,.02,.47,C.rust);a.rotation.z=face==='z'?Math.PI/2:0;a.rotation.x=face==='x'?Math.PI/2:0}}
ladder(1.5,2.43,'z');ladder(-1.94,-1.5,'x');
// bollards and rope
function bollard(x,z){cyl(x,.52,z,.14,.18,.15,C.black);cyl(x,.68,z,.09,.11,.26,C.black);cyl(x,.83,z,.16,.16,.09,C.black);torus(x,.68,z,.11,.025,C.orange)}
for(let x=-1.3;x<4.8;x+=1.55)bollard(x,2.8);for(let z=-3.6;z<2;z+=1.5)bollard(-2.35,z);
// puddles
for(let i=0;i<13;i++){let x=-4.6+rnd()*9.2,z=2.9+rnd()*1.8;let p=cyl(x,.442,z,.12+rnd()*.25,.12+rnd()*.25,.008,mat(0xa8c9c5,{roughness:.18}));p.scale.z=.4+rnd()*.6}
// lighthouse and breakwaters
const landmarkEdges=[];
landmarkEdges.push(box(2.6,.12,-4.24,4.8,.34,.20,C.concrete));box(2.6,.32,-4.24,4.8,.08,.24,C.top);
landmarkEdges.push(box(2.43,.38,-3.95,.65,.65,1.45,C.concrete));box(2.43,.75,-3.95,.7,.09,1.45,C.top);
let lx=2.43,lz=-3.18;landmarkEdges.push(cyl(lx,.88,lz,.42,.47,.2,C.white));landmarkEdges.push(cyl(lx,1.5,lz,.27,.36,1.12,C.white));landmarkEdges.push(cyl(lx,1.42,lz,.325,.345,.3,mat(0xc85d52)));cyl(lx,2.09,lz,.32,.32,.1,C.dark);let beacon=cyl(lx,2.28,lz,.23,.23,.33,C.gold.clone());cyl(lx,2.5,lz,.37,.37,.1,mat(0xc85d52));let roof=cyl(lx,2.63,lz,0,.36,.2,mat(0xc85d52));torus(lx,2.12,lz,.43,.025,C.dark);for(let a=0;a<8;a++){let t=a*Math.PI/4;cyl(lx+Math.cos(t)*.41,2.03,lz+Math.sin(t)*.41,.015,.015,.22,C.dark)}
// warehouses, with open front and furnished interiors
function building(x,z,w,d,kind){let wall=mat(kind==='warehouse'?0xd7ddd1:0xe7e1d0);landmarkEdges.push(box(x,.49,z,w,.14,d,C.concrete));landmarkEdges.push(box(x-w/2,1.35,z,.10,1.8,d,wall));// The water-facing wall is an open cutaway framed like large windows.
 for(let zz of [z-d/2,z,z+d/2])box(x+w/2,1.35,zz,.10,1.8,.09,wall);box(x+w/2,2.08,z,.10,.25,d,wall);box(x+w/2,.53,z,.10,.15,d,wall);if(kind==='waiting')box(x+w/2,1.32,z,.025,1.43,d-.12,C.glass);landmarkEdges.push(box(x,1.35,z-d/2,w,1.8,.10,wall));landmarkEdges.push(box(x,2.18,z,w,.18,d+.15,mat(0x718789)));
// roof ribbing
for(let a=-w/2;a<w/2;a+=.18)box(x+a,2.29,z,.025,.03,d+.17,mat(0x607a7b));
if(kind==='warehouse'){
 box(x,1.93,z+d/2,w,.45,.08,mat(0xc6d1cc));for(let y=1.72;y<2.12;y+=.08)line([[x-w/2,y,z+d/2+.05],[x+w/2,y,z+d/2+.05]],0x8fa5a0);
 sign('汐見漁協\n荷さばき所',x,2.42,z+d/2+.08,1.55,.38,0,'#edf0df','#3b6261',48);
 for(let i=0;i<7;i++){let xx=x-.58+(i%3)*.42, yy=.68+Math.floor(i/3)*.28,zz=z-.38;crate(xx,yy,zz,i%3===0?C.blue:C.white,.38,.24,.32)}
 box(x+.52,.78,z-.35,.55,.58,.5,C.white);box(x+.52,1.09,z-.35,.58,.07,.52,C.edge);sign('本日の競り\n鯵  480   鯛  780',x-.1,1.55,z-d/2+.07,.95,.52,0,'#3b5350','#f4ead1',38);
 box(x-.55,.59,z+.2,.33,.17,.3,C.dark);cyl(x-.55,.73,z+.2,.08,.08,.12,C.rust);box(x-.55,.82,z+.2,.38,.05,.3,C.white);
 }else{
 // open glazed frontage with frame
 box(x,1.35,z+d/2,w,.05,.06,C.wood);for(let xx of [x-w/2,x,x+w/2])box(xx,1.35,z+d/2,.06,1.78,.08,C.wood);box(x,1.32,z+d/2,w,1.65,.025,C.glass);
 box(x, .8,z-.35,w*.7,.1,.35,C.wood);for(let xx of [x-w*.27,x+w*.27])box(xx,.64,z-.35,.07,.3,.28,C.wood);box(x,1.1,z-.48,w*.7,.45,.08,C.wood);
 sign('船便時刻表\n  8:20  12:40\n  15:30  17:10',x-.45,1.55,z-d/2+.07,.55,.65,0,'#e8dcc2','#6f8074',37);
 box(x+.43,1.12,z-.5,.35,.23,.16,C.dark);cyl(x+.43,1.14,z-.405,.06,.06,.02,C.gold).rotation.x=Math.PI/2;
 cyl(x+.7,.65,z+.05,.16,.12,.3,C.wood);sphere(x+.7,.93,z+.05,.21,C.green);cyl(x-.7,.66,z,.11,.11,.3,C.white);cyl(x-.7,.85,z,.08,.1,.08,C.dark);
 torus(x+.5,1.71,z-d/2+.07,.15,.025,C.wood,root,[0,0,0]);cyl(x+.5,1.71,z-d/2+.065,.13,.13,.02,C.white).rotation.x=Math.PI/2;
 sign('待合室',x,2.42,z+d/2+.08,.8,.3,0,'#eae7d8','#446866',60);
 }}
function crate(x,y,z,m=C.white,w=.5,h=.28,d=.4,parent=root){box(x,y,z,w,h,d,m,parent);box(x,y+h*.48,z,w+.035,.035,d+.035,C.edge,parent);for(let s of [-1,1])box(x+s*w*.36,y,z+d*.51,.035,h*.7,.012,C.edge,parent)}
building(-3.52,-2.95,2.5,1.75,'warehouse');building(-3.52,-.47,2.5,1.7,'waiting');
// small houses and trees on the hill
const hill=mat(0x9fbd9b);let mound=sphere(-4.1,.55,-4.25,1.25,hill);mound.scale.set(1.1,.5,.7);
function tree(x,z,s){cyl(x,.75,z,.07*s,.1*s,.8*s,C.wood);for(let i=0;i<4;i++){let a=i*Math.PI/2;sphere(x+Math.cos(a)*.22*s,1.3*s,z+Math.sin(a)*.18*s,.38*s,[C.green,mat(0x91b494),mat(0x6f9c82)][i%3])}}
tree(-4.75,-4.3,.7);tree(-2.7,-4.5,.62);
// boat hull generated from cross sections; deck and visible cabin
const boats=[];
function boat(x,z,scale=1,cabin=true,angle=0){let g=new THREE.Group();g.position.set(x,.14,z);g.rotation.y=angle;g.scale.setScalar(scale);root.add(g);
let shape=new THREE.Shape();shape.moveTo(-.48,-.95);shape.lineTo(.48,-.95);shape.lineTo(.5,.52);shape.quadraticCurveTo(.4,.95,0,1.22);shape.quadraticCurveTo(-.4,.95,-.5,.52);shape.closePath();let geo=new THREE.ExtrudeGeometry(shape,{depth:.28,bevelEnabled:true,bevelThickness:.08,bevelSize:.08,bevelSegments:1});let hull=new THREE.Mesh(geo,C.white);hull.rotation.x=Math.PI/2;hull.position.y=.28;g.add(hull);hull.castShadow=true;
// The deck uses the same bow direction as the hull and sits just above its rim.
let deck=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat(0xd4e1d9,{side:THREE.DoubleSide}));
deck.rotation.x=Math.PI/2;deck.position.y=.365;g.add(deck);
// A muted underwater underside gives the translucent harbor a cool shadow.
let underside=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat(0x497c79,{transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
underside.rotation.x=Math.PI/2;underside.position.y=-.074;underside.scale.set(.78,.89,1);g.add(underside);
// rim rails
let pts=[[-.48,.34,-.95],[-.5,.34,.5],[-.38,.34,.88],[0,.34,1.2],[.38,.34,.88],[.5,.34,.5],[.48,.34,-.95],[-.48,.34,-.95]];tube(pts,.025,C.blue,g);
box(0,.34,-.59,.75,.08,.45,C.wood,g);for(let s of [-1,1]){torus(s*.65,.14,-.27,.13,.038,C.black,g,[0,Math.PI/2,0]);torus(s*.53,.24,.48,.13,.035,C.orange,g,[0,Math.PI/2,0]);torus(s*.53,.24,.48,.13,.012,C.white,g,[0,Math.PI/2,0]);}
if(cabin){box(0,.38,-.05,.8,.08,.8,C.white,g);box(-.38,.74,-.05,.025,.58,.72,C.glass,g);box(.38,.74,-.05,.025,.58,.72,C.glass,g);box(0,.77,.34,.8,.65,.04,C.glass,g);box(0,1.12,-.05,.92,.09,.92,C.white,g);for(let xx of [-.38,.38])for(let zz of [-.4,.34])box(xx,.76,zz,.035,.67,.035,C.blue,g);
// console, glowing screens and wheel inside, open rear
box(0,.58,.15,.65,.25,.23,C.blue,g);box(-.2,.76,.24,.2,.16,.025,mat(0x4eb5a6,{emissive:0x298e83,emissiveIntensity:.6}),g);box(.06,.76,.24,.15,.13,.025,mat(0x98d5c3,{emissive:0x469b91,emissiveIntensity:.4}),g);torus(.22,.75,.04,.11,.015,C.dark,g,[0,0,0]);box(-.16,.47,-.2,.3,.12,.3,C.wood,g);box(-.16,.66,-.33,.3,.35,.08,C.wood,g);box(-.08,.69,.285,.22,.12,.012,C.white,g);line([[-.17,.71,.295],[.01,.71,.295]],0x82a7a1,1,g);box(.35,.9,-.2,.02,.13,.13,C.orange,g);
 cyl(0,1.28,0,.13,.13,.09,C.white,g);cyl(.22,1.45,-.1,.015,.015,.7,C.dark,g);sphere(.22,1.8,-.1,.035,C.orange,g);for(let s of [-1,1]){line([[s*.46,.4,-.8],[s*.46,.82,-.8],[s*.46,.82,-.4]],0x748f8a,1,g)}
}else{box(0,.38,.3,.72,.08,.22,C.wood,g);cyl(0,.42,-.8,.1,.1,.18,C.blue,g)}
for(let i=0;i<6;i++){let xx=(rnd()-.5)*.9;box(xx,.19,-.97,.035,.09,.008,C.rust,g)}
boats.push({g,x,z,phase:rnd()*6});return g}
boat(-1.43,-2.25,.8,true,-.08);boat(3.35,-.65,.72,true,.04);boat(1.35,-1.75,.78,false,-.12);boat(.35,.35,.76,false,.16);
// ropes to bollards
const innerMooring=tube([[-2.3,.7,-2.1],[-1.8,.28,-2],[-1.2,.2,-2.5]],.025,C.orange);const quayMooring=tube([[.25,.7,2.8],[.5,.3,1.8],[.7,.23,.9]],.025,C.orange);
// fishing gear, lamp, street corner
for(let i=0;i<9;i++)crate(-4.45+(i%2)*.48,.59+Math.floor(i/2)*.28,1.05+(i%3)*.15,i%3?C.white:C.blue,.46,.25,.38);
function lamp(x,z){cyl(x,1.48,z,.035,.05,2.05,C.dark);cyl(x,2.55,z,.22,.3,.11,C.dark);cyl(x,2.49,z,.18,.18,.08,C.gold);torus(x,2.48,z,.31,.025,C.dark)}lamp(-2.7,1.95);lamp(3.6,3.2);
line([[-2.7,2.55,1.95],[0,2.9,2.55],[3.6,2.55,3.2]],0x687b76);
// nets on drying frame
for(let xx of [-4.65,-3.35])cyl(xx,1.05,2.12,.025,.025,1.2,C.rust);let cross=cyl(-4,1.65,2.12,.025,.025,1.35,C.rust);cross.rotation.z=Math.PI/2;
let fishingNet=new THREE.Group();fishingNet.position.set(-4,1.65,2.12);root.add(fishingNet);for(let i=0;i<=10;i++){let x=-.62+i*.124;line([[x,-.03,0],[x+.04,-.98,0]],0x7f9b88,1,fishingNet)}for(let i=0;i<8;i++){let y=-.97+i*.13;line([[-.6,y,0],[.62,y,0]],0x91a795,1,fishingNet)}for(let i=0;i<8;i++)sphere(-.55+i*.16,-.05,0,.045,C.orange,fishingNet);
// life traces and props
// Instrument cases are built with contoured shells in details.js.
// transparent umbrella, leaned near stairs
let umb=new THREE.Group();umb.position.set(-2.2,.45,3.35);umb.rotation.z=-.35;root.add(umb);cyl(0,.6,0,.018,.018,1.2,C.wood,umb);let canopy=new THREE.Mesh(new THREE.ConeGeometry(.53,.28,12,1,true),C.glass);canopy.position.y=1.05;umb.add(canopy);for(let i=0;i<12;i++){let a=i*Math.PI/6;line([[0,1.19,0],[Math.cos(a)*.53,.91,Math.sin(a)*.53]],0xd5eee6,1,umb);sphere(Math.cos(a)*.48,.94,Math.sin(a)*.48,.018,C.gold,umb)}
// vending machine
const vendingAnchor=new THREE.Group();vendingAnchor.position.set(-4.62,0,2.70);vendingAnchor.rotation.y=0;root.add(vendingAnchor);const vendingMachine=new THREE.Group();vendingMachine.position.set(4.55,0,-.1);vendingAnchor.add(vendingMachine);box(-4.55,1.04,.1,.52,1.28,.5,mat(0xd77d65),vendingMachine);box(-4.55,1.3,.36,.41,.55,.02,mat(0xe6f1dd,{emissive:0xcdd9b3,emissiveIntensity:.35}),vendingMachine);for(let i=0;i<4;i++)for(let j=0;j<2;j++)box(-4.7+i*.1,1.2+j*.2,.38,.055,.13,.02,[C.blue,C.orange,C.green][(i+j)%3],vendingMachine);box(-4.55,.78,.37,.28,.12,.02,C.dark,vendingMachine);box(-4.55,1.74,.1,.64,.08,.62,C.rust,vendingMachine);
// winch and crane
box(2.4,.5,3.6,.7,.13,.45,C.rust);cyl(2.4,.83,3.6,.19,.19,.45,C.rust).rotation.z=Math.PI/2;torus(2.1,.83,3.6,.22,.025,C.dark,root,[0,Math.PI/2,0]);cyl(2.8,1.15,3.6,.035,.04,1.3,C.dark);let boom=cyl(2.55,1.75,3.6,.025,.025,.95,C.dark);boom.rotation.z=-.55;line([[2.3,2.1,3.6],[2.3,1.1,3.6]],0x6c7365);
// sign board
box(4.5,.95,4.25,.07,1.1,.07,C.wood);sign('汐見港\n注意落水',4.5,1.35,4.3,.75,.48,0,'#e9e0bc','#b26452',52);
// slope and upturned dinghy
let ramp=box(3.8,.25,2.05,1.3,.12,1.15,C.edge);ramp.rotation.x=-.2;let dinghy=new THREE.Mesh(new THREE.SphereGeometry(.6,12,6,0,Math.PI*2,0,Math.PI/2),C.wood);dinghy.scale.set(.7,.35,1.5);dinghy.position.set(3.8,.53,3.9);root.add(dinghy);
// tetrapods
for(let i=0;i<6;i++){let x=4.62+(rnd()-.5)*.3,z=-4.64+(rnd()-.5)*.38,y=.20;let g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(.7);g.rotation.y=rnd()*6;root.add(g);for(let a=0;a<4;a++){let arm=cyl(0,0,0,.13,.19,.7,C.concrete,g,6);arm.rotation.z=a===0?0:1.25;arm.rotation.y=a*2.1;arm.position.set(Math.cos(a*2.1)*.17,.1,Math.sin(a*2.1)*.17)}}
// windsock, float buoys
cyl(-2.8,1.55,-3.9,.025,.025,2.2,C.dark);let sock=new THREE.Mesh(new THREE.ConeGeometry(.14,.65,10,1,true),C.orange);sock.rotation.z=-Math.PI/2;sock.position.set(-2.45,2.55,-3.9);root.add(sock);
const buoyGroups=[];for(let i=0;i<4;i++){let x=3.2+i*.36,z=.5+i*.2;let g=new THREE.Group();g.position.set(x,.16,z);root.add(g);cyl(0,0,0,.11,.14,.25,C.orange,g);sphere(0,.14,0,.08,C.white,g);buoyGroups.push(g)}

// A layered, illustrated cutaway on the exposed water side.
box(5.006,-.46,-1.05,.015,.65,6.85,mat(0x81c4b8,{transparent:true,opacity:.55}));
for(let i=0;i<60;i++){let z=-4.38+rnd()*6.7;let y=-.79+rnd()*.14;let o=sphere(5.024,y,z,.04+rnd()*.055,[C.edge,C.wood,C.concrete][i%3]);o.scale.set(.28,.55,1.4)}
const sideWeeds=[];for(let i=0;i<9;i++){let z=-4.15+i*.72;let g=new THREE.Group();g.position.set(5.04,-.78,z);root.add(g);for(let j=0;j<3;j++)tube([[0,0,j*.05],[0,.23,j*.08],[0,.43-rnd()*.12,.08+j*.08]],.012,C.green,g);sideWeeds.push(g)}
let sideFish=[];for(let i=0;i<6;i++){let z=-3.8+i*.9+.10*Math.sin(i*2.1),y=-.23-.30*(.5+.5*Math.sin(i*1.83));let g=new THREE.Group();g.position.set(5.055,y,z);g.scale.setScalar(.78+.25*(.5+.5*Math.sin(i*1.37)));root.add(g);let f=sphere(0,0,0,.075,C.deep,g);f.scale.set(.18,.48,1.4);let tail=new THREE.Mesh(new THREE.ConeGeometry(.06,.12,3),C.deep);tail.rotation.x=Math.PI/2;tail.position.set(0,0,-.13);g.add(tail);sideFish.push([g,z,i])}
torus(5.06,-.61,-2.7,.19,.05,C.dark,root,[0,Math.PI/2,0]);
// More daily life: a bucket, leaning landing net and shore cat under the skiff.
cyl(-3.05,.58,1.62,.16,.12,.28,C.blue);torus(-3.05,.74,1.62,.16,.012,C.white);let pole=cyl(-3.1,1.15,1.45,.025,.025,1.3,C.wood);pole.rotation.z=-.25;torus(-2.94,1.76,1.45,.2,.018,C.dark,root,[0,0,0]);
let cat=new THREE.Group();cat.position.set(3.55,.5,3.95);root.add(cat);
let body=sphere(0,.09,0,.18,mat(0x8b8c7c),cat);body.scale.set(1.3,.65,.8);
let catHead=new THREE.Group();catHead.position.set(-.2,.13,0);cat.add(catHead);
sphere(0,0,0,.12,mat(0x8b8c7c),catHead);
for(let z of [-.07,.07]){let ear=new THREE.Mesh(new THREE.ConeGeometry(.045,.1,4),mat(0x8b8c7c));ear.position.set(-.02,.10,z);catHead.add(ear)}
tube([[.18,.08,0],[.34,.09,0],[.38,.18,.03]],.025,mat(0x8b8c7c),cat);
// Weathered wall details, shells and mussels at the tideline.
for(let i=0;i<35;i++){let x=-1.8+rnd()*6.6;let y=-.54+rnd()*.25;let o=sphere(x,y,2.49,.025+rnd()*.025,i%2?C.white:C.edge);o.scale.set(1,.55,.3)}
// A few enamel buoys, painted numbers and a rack of rods.
for(let i=0;i<4;i++){let x=-4.6+i*.3;let rod=cyl(x,1.2,1.7,.012,.012,1.5,C.wood);rod.rotation.z=.18;}
sign('PORT\nKEEP CLEAR',-4.3,1.25,1.91,.55,.4,0,'#e4d5b7','#b46b55',46);
// Two tiny tiled houses tucked into the green hillside.
function cottage(x,z,s){box(x,.89,z,.8*s,.62*s,.65*s,C.white);let roof=box(x,1.25,z,.95*s,.12*s,.8*s,C.blue);roof.rotation.z=.12;box(x,1.0,z+.33*s,.2*s,.35*s,.02,C.wood);for(let i=0;i<6;i++)box(x-.4*s+i*.16*s,1.32,z,.02*s,.02,.8*s,C.edge)}
cottage(-4.45,-4.5,.7);cottage(-3.25,-4.6,.58);



// Fine joints, tidal staining and small repairs make the cut concrete read as a real miniature.
for(let y of [-.64,-.31,.02,.31])line([[-4.98,y,5.012],[4.98,y,5.012]],0xb0c5b8);
for(let row=0;row<3;row++)for(let x=-4.6+(row%2)*.5;x<5;x+=1.0)line([[x,-.75+row*.31,5.014],[x,-.47+row*.31,5.014]],0xb5c6bd);
for(let i=0;i<75;i++){let x=-4.85+rnd()*9.7,z=2.65+rnd()*2.2;let w=.05+rnd()*.18;box(x,.444,z,w,.004,.012,i%3?C.edge:C.white)}
// Coiled rope, a pair of covered baskets and additional fishing equipment.
for(let i=0;i<3;i++)torus(-2.9,.47,2.8,.22-i*.045,.018,C.orange);
for(let i=0;i<3;i++){cyl(-4.3+i*.36,.56,3.2,.15,.13,.22,C.blue);torus(-4.3+i*.36,.68,3.2,.15,.015,C.white)}
for(let i=0;i<5;i++){let a=box(1.9+i*.13,.45,4.6,.035,.025,.28,C.wood);a.rotation.y=.3}

// Floating wake and intermittent rainbow, kept delicate like painted animation effects.
let wake=[];
for(let i=0;i<12;i++){
  const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0xf2fbf0,transparent:true,opacity:.80-i*.028,side:THREE.DoubleSide,depthWrite:false});
  for(let side of [-1,1]){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([
      0,0,0, side*.19,0,-.11, side*.22,0,-.10,
      0,0,0, side*.22,0,-.10, side*.025,0,.025
    ],3));geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry,material));
  }
  group.position.y=.13;group.visible=false;root.add(group);wake.push(group);
}
let rainbow=new THREE.Group();root.add(rainbow);rainbow.position.set(2.7,2.05,-4.3);rainbow.rotation.y=-.2;
for(let i=0;i<4;i++){let m=new THREE.MeshBasicMaterial({color:[0xe9aaa3,0xeacb9f,0xc9d9af,0xa6d5d1][i],transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false});let arc=new THREE.Mesh(new THREE.TorusGeometry(1.65-i*.055,.025,5,64,Math.PI),m);rainbow.add(arc)}
// A few softly illuminated ice fragments on the warehouse floor.
for(let i=0;i<13;i++){let o=box(-4.35+rnd()*1.4,.51,-3.4+rnd()*1.2,.07,.04,.06,C.glass);o.rotation.y=rnd()*3}
for(let i=0;i<2;i++){let boot=box(-4.5+i*.22,1.15,-3.79,.13,.32,.13,C.dark);box(-4.5+i*.22,1.0,-3.72,.13,.09,.25,C.dark)}
// Fine light shafts are translucent geometry inside the warehouse.
const warehouseBeams=[];for(let i=0;i<3;i++){let beam=new THREE.Mesh(new THREE.PlaneGeometry(.20,1.6),new THREE.MeshBasicMaterial({color:0xffe9b5,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}));beam.position.set(-4.05+i*.24,1.24,-3.0);beam.rotation.z=-.24;root.add(beam);warehouseBeams.push(beam)}

// atmospheric fine rain in a volume
let rainGeo=new THREE.BufferGeometry(), rainPos=[];for(let i=0;i<520;i++){let x=(rnd()-.5)*11,y=rnd()*6,z=(rnd()-.5)*11;rainPos.push(x,y,z,x+.045,y-.18,z+.015)}rainGeo.setAttribute('position',new THREE.Float32BufferAttribute(rainPos,3));let rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0xfff3d2,transparent:true,opacity:.44}));root.add(rain);let rainBase=rainPos.slice();
// seabirds: small graphic wings
let birds=[];for(let i=0;i<5;i++){let g=new THREE.Group();let l=line([[0,0,0],[-.18,.08,0],[-.32,.04,0]],0x526a69,1,g),r=line([[0,0,0],[.18,.08,0],[.32,.04,0]],0x526a69,1,g);root.add(g);birds.push(g)}
// ripples
let ripples=[];for(let i=0;i<18;i++){
  let geometry=new THREE.TorusGeometry(.075,.004,5,28,Math.PI*(1.25+(i%3)*.18));
  let material=new THREE.MeshBasicMaterial({color:0xeaf8ed,transparent:true,opacity:.32,depthWrite:false});
  let ring=new THREE.Mesh(geometry,material);ring.rotation.x=Math.PI/2;ring.rotation.z=(i%7)*.47;
  ring.position.set(-1.6+rnd()*6.2,.125,-4+rnd()*6);root.add(ring);ripples.push([ring,rnd()*5]);
}
// orbit control, deterministic animation, and fixed export API
let target=new THREE.Vector3(0,-.8,0),radius=19,theta=.72,phi=1.02;
const overviewPos=new THREE.Vector3(12.2,10.6,14.2),overviewTarget=new THREE.Vector3(0,-.8,0);
camera.position.copy(overviewPos);camera.lookAt(overviewTarget);
function syncOrbit(){let d=camera.position.clone().sub(target);radius=d.length();theta=Math.atan2(d.x,d.z);phi=Math.acos(d.y/radius)}
syncOrbit();
let dragging=false,dragMode='rotate',lastX=0,lastY=0;
let exporting=false,exportFps=3,run='overview',time=0,last=performance.now(),savedView=null;
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('pointerdown',e=>{
  if(exporting)return;
  dragging=true;dragMode=(e.button===2||e.shiftKey)?'pan':'rotate';lastX=e.clientX;lastY=e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup',()=>dragging=false);
renderer.domElement.addEventListener('pointercancel',()=>dragging=false);
renderer.domElement.addEventListener('pointermove',e=>{
  if(!dragging||exporting)return;
  const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
  if(dragMode==='pan'){
    const scale=2*radius*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))/innerHeight;
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    const next=target.clone().addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);
    next.x=THREE.MathUtils.clamp(next.x,-5.5,5.5);next.y=THREE.MathUtils.clamp(next.y,-1.2,3.5);next.z=THREE.MathUtils.clamp(next.z,-5.5,5.5);
    target.copy(next);
  }else{
    theta-=dx*.006;phi=Math.max(.16,Math.min(1.65,phi+dy*.006));
  }
  setOrbit();
});
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();if(exporting)return;radius=Math.max(2,Math.min(30,radius*Math.exp(e.deltaY*.001)));setOrbit()},{passive:false});
function setOrbit(){camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(target)}
// Paired times mark cuts; each interval between them is one eased camera move.
const path=[
  // High harbor approach.
  {t:0,p:[14,11,16],q:[0,-.4,0]},{t:7,p:[10,7.8,11],q:[.1,0,-.5]},
  // The cat beneath the upturned skiff.
  {t:7,p:[1.9,1.15,6.2],q:[3.42,.66,3.96]},{t:12,p:[2.55,.95,5.55],q:[3.4,.65,3.98]},
  // Cases and umbrella by the steps.
  {t:12,p:[1.4,2.9,7.6],q:[-.65,.65,3.9]},{t:17,p:[.2,2.35,6.9],q:[-.8,.65,3.75]},
  // Slide along the quay and the moored boats.
  {t:17,p:[4.7,3.6,7.3],q:[1.4,.4,-.2]},{t:23,p:[.4,3.2,6.6],q:[-.3,.6,-.7]},
  // Warehouse opening and stacked fish boxes.
  {t:23,p:[.3,2,-1],q:[-3.55,1.15,-3]},{t:28,p:[-.55,1.8,-1.4],q:[-3.65,1.13,-3.05]},
  // Follow the boat as it leaves its berth.
  {t:28,p:[7,3.2,3.5],q:[3.35,.55,-.65]},{t:35,p:[7.8,4.8,2],q:[3.95,.55,-2]},
  // Lighthouse and the breakwater.
  {t:35,p:[7,3.3,-.2],q:[2.5,1.25,-3.45]},{t:40,p:[6.3,3,-1.1],q:[2.45,1.3,-3.4]},
  // Through the moored boat's cabin windows.
  {t:40,p:[.5,1.35,-.2],q:[-1.43,.76,-2.2]},{t:45,p:[-.25,1.15,-1],q:[-1.43,.75,-2.2]},
  // Waiting room behind the glass.
  {t:45,p:[.1,1.7,1.6],q:[-3.5,1.15,-.45]},{t:50,p:[-.55,1.65,.65],q:[-3.5,1.15,-.55]},
  // Descend beside the exposed underwater face.
  {t:50,p:[10,1.5,1.6],q:[5,-.15,-.8]},{t:55,p:[9,-.15,.7],q:[5,-.48,-1]},
  // Pull back to the complete harbor.
  {t:55,p:[10,7.8,11],q:[0,-.2,0]},{t:60,p:[12.2,10.6,14.2],q:[0,-.8,0]}
];
function cameraAt(t){if(run==='overview'){camera.position.copy(overviewPos);camera.lookAt(overviewTarget);return}let i=0;while(i<path.length-2&&t>path[i+1].t)i++;let a=path[i],b=path[i+1],u=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)));u=u*u*(3-2*u);camera.position.set(...a.p).lerp(new THREE.Vector3(...b.p),u);let q=new THREE.Vector3(...a.q).lerp(new THREE.Vector3(...b.q),u);camera.lookAt(q)}
function update(t){boats.forEach((b,i)=>{if(i===0)b.g.position.x=b.x+.01*Math.sin(t*.56+b.phase);b.g.position.y=.14+Math.sin(t*1.1+b.phase)*.025;b.g.rotation.z=Math.sin(t*.8+b.phase)*.025;b.g.rotation.x=Math.sin(t*.65+b.phase)*.018});shards.forEach(([o,x,w,p,z])=>{o.position.x=x+Math.sin(t*.6+p)*.045;o.position.z=z+Math.sin(t*.34+p)*.025;o.scale.x=.72+.28*Math.sin(t*.7+p)});fishes.forEach(([g,x,p])=>{g.position.x=x+Math.sin(t*.45+p)*.35;g.position.z+=0;g.rotation.y=Math.sin(t*.45+p)>0?.15:-.15});birds.forEach((g,i)=>{let a=t*.12+i*1.25;g.position.set(Math.cos(a)*(2.2+i*.15),3.8+i*.17,Math.sin(a)*2.5-1);g.rotation.y=-a});ripples.forEach(([o,p])=>{let v=(t*.45+p)%2;o.scale.setScalar(.4+v);o.material.opacity=.32*THREE.MathUtils.smoothstep(v,0,.16)*(1-THREE.MathUtils.smoothstep(v,1.25,2))});let arr=rainGeo.attributes.position.array;for(let i=0;i<arr.length;i+=6){let yy=(rainBase[i+1]-t*2.4)%6;if(yy<0)yy+=6;arr[i]=rainBase[i]+(6-yy)*.13;arr[i+1]=yy;arr[i+2]=rainBase[i+2];arr[i+3]=arr[i]+.045;arr[i+4]=yy-.18;arr[i+5]=arr[i+2]+.015}rainGeo.attributes.position.needsUpdate=true;sideFish.forEach(([g,z,i])=>g.position.z=z+Math.sin(t*.5+i)*.13);sun.intensity=1.6+.16*Math.sin(t*.15);sock.rotation.y=Math.sin(t*.9)*.1;cat.rotation.y=Math.sin(t*.3)*.12;rainbow.visible=Math.sin(t*.075)>.8;rainbow.children.forEach(a=>a.material.opacity=Math.max(0,(Math.sin(t*.075)-.8)*.5));let trip=(t%60);let traveling=trip>28&&trip<48;let u=traveling?(trip-28)/20:0;let boatOut=boats[1].g;if(traveling){let loop=Math.sin(Math.PI*u);boatOut.position.x=boats[1].x+loop*2.2;boatOut.position.z=boats[1].z-loop*1.2;boatOut.rotation.y=.04+Math.sin(u*Math.PI*2)*.3} else {boatOut.position.x=boats[1].x;boatOut.position.z=boats[1].z;boatOut.rotation.y=.04}wake.forEach((o,i)=>{o.visible=traveling;o.position.set(boatOut.position.x-.2-i*.11,.13,boatOut.position.z+.65+i*.12);o.scale.setScalar(.6+i*.12)});if(typeof updateDetails==='function')updateDetails(t);}
function render(){renderer.render(scene,camera)}
window.videoExport={
  runs:['overview','tour'],
  async begin(id,{fps}={}){
    if(!['overview','tour'].includes(id))throw Error('Unknown run');
    if(!exporting)savedView={position:camera.position.clone(),target:target.clone(),time};
    dragging=false;exporting=true;run=id;exportFps=fps||3;time=0;
    cameraAt(0);update(0);render();return {frames:(id==='overview'?5:60)*exportFps};
  },
  async frame(i){time=i/exportFps;cameraAt(time);update(time);render()},
  end(){
    if(savedView){target.copy(savedView.target);camera.position.copy(savedView.position);camera.lookAt(target);time=savedView.time;savedView=null;syncOrbit();update(time);render()}
    exporting=false;last=performance.now();
  }
};
function animate(now){requestAnimationFrame(animate);if(!exporting){time+=Math.min((now-last)/1000,.05);update(time);render()}last=now}requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);render()});
