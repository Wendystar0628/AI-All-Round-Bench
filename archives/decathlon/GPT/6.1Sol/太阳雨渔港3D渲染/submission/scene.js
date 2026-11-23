/* Sun shower, a small harbour. All geometry and textures are made here. */
(() => {
'use strict';
const T=THREE, PI=Math.PI, TAU=PI*2;
let seed=61503;
function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
const range=(a,b)=>a+(b-a)*rand();
const scene=new T.Scene();scene.background=new T.Color('#e5efeb');scene.fog=new T.Fog('#e5efeb',65,115);
const renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.setClearColor('#e5efeb');document.body.appendChild(renderer.domElement);
const camera=new T.PerspectiveCamera(35,innerWidth/innerHeight,.1,200);
const hemi=new T.HemisphereLight('#effff7','#a1bdb5',1.7);scene.add(hemi);
const sun=new T.DirectionalLight('#fff6dc',2.35);sun.position.set(-12,28,12);sun.castShadow=true;
sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:75});sun.shadow.bias=-.0004;sun.shadow.normalBias=.035;sun.shadow.radius=3;scene.add(sun);
const fill=new T.DirectionalLight('#bce6e7',.45);fill.position.set(15,9,-15);scene.add(fill);
const grad=new T.DataTexture(new Uint8Array([135,195,238,255]),4,1,T.RedFormat);grad.needsUpdate=true;grad.minFilter=T.NearestFilter;grad.magFilter=T.NearestFilter;
const materials={};
const weatherTime={value:0};
function weatherMaterial(m){m.onBeforeCompile=shader=>{shader.uniforms.uHarbourTime=weatherTime;shader.vertexShader='varying vec3 vHarbourWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvHarbourWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader='uniform float uHarbourTime; varying vec3 vHarbourWorld;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float cloudCycle=mod(uHarbourTime,100.);float cloudCentre=17.-(cloudCycle-72.)*3.6;float cloudMask=exp(-pow((vHarbourWorld.x+vHarbourWorld.z*.3-cloudCentre)/5.,2.))*step(72.,cloudCycle)*(1.-step(84.,cloudCycle));diffuseColor.rgb*=1.-cloudMask*.16;`);};return m;}
function mat(color,extra={}){const key=color+JSON.stringify(extra);return materials[key]||(materials[key]=weatherMaterial(new T.MeshToonMaterial({color,gradientMap:grad,...extra})));}
const C={concrete:'#d6d9cd',edge:'#657f7a',white:'#f6f5de',dark:'#344f50',teal:'#5c9a9b',blue:'#547f8e',rust:'#ad7652',rope:'#be8760',yellow:'#e5bc55',red:'#d46d52',wood:'#ae9872'};
function mesh(g,m,p,x=0,y=0,z=0,edge=false){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=!m.transparent;o.receiveShadow=true;p.add(o);if(edge){const e=new T.LineSegments(new T.EdgesGeometry(g,32),new T.LineBasicMaterial({color:'#486663',transparent:true,opacity:.32}));o.add(e);}return o;}
function box(p,x,y,z,w,h,d,color,edge=true){return mesh(new T.BoxGeometry(w,h,d),typeof color==='string'?mat(color):color,p,x,y,z,edge);}
function boxParts(p,parts,color,edge=true){const positions=[],normals=[],uvs=[],indices=[];for(let [x,y,z,w,h,d] of parts){const q=new T.BoxGeometry(w,h,d);q.translate(x,y,z);const offset=positions.length/3;positions.push(...q.attributes.position.array);normals.push(...q.attributes.normal.array);uvs.push(...q.attributes.uv.array);for(let i of q.index.array)indices.push(offset+i);q.dispose();}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);return mesh(g,typeof color==='string'?mat(color):color,p,0,0,0,edge);}
function cyl(p,x,y,z,r,h,color,rt=r,n=16){return mesh(new T.CylinderGeometry(rt,r,h,n),typeof color==='string'?mat(color):color,p,x,y,z);}
function sphere(p,x,y,z,r,color,sx=1,sy=1,sz=1){const o=mesh(new T.IcosahedronGeometry(r,1),typeof color==='string'?mat(color):color,p,x,y,z);o.scale.set(sx,sy,sz);return o;}
function torus(p,x,y,z,r,t,color,rx=0,ry=0,rz=0){const o=mesh(new T.TorusGeometry(r,t,6,24),typeof color==='string'?mat(color):color,p,x,y,z);o.rotation.set(rx,ry,rz);return o;}
function beam(p,a,b,r,color,n=8){const va=new T.Vector3(...a),vb=new T.Vector3(...b),v=vb.clone().sub(va);const o=mesh(new T.CylinderGeometry(r,r,v.length(),n),typeof color==='string'?mat(color):color,p);o.position.copy(va.add(vb).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;}
function path(p,pts,r,color){const curve=new T.CatmullRomCurve3(pts.map(a=>new T.Vector3(...a)));return mesh(new T.TubeGeometry(curve,Math.max(12,pts.length*7),r,5,false),typeof color==='string'?mat(color):color,p);}
function line(p,pts,color,opacity=1){const o=new T.Line(new T.BufferGeometry().setFromPoints(pts.map(a=>new T.Vector3(...a))),new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));p.add(o);return o;}
function group(p,x=0,y=0,z=0){const o=new T.Group();o.position.set(x,y,z);p.add(o);return o;}
function canvasTexture(w,h,draw){const cv=document.createElement('canvas');cv.width=w;cv.height=h;draw(cv.getContext('2d'),w,h);const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;}
function label(p,x,y,z,w,h,text,bg='#e6e5cb',fg='#49676b',size=50){const tex=canvasTexture(768,Math.round(768*h/w),(c,W,H)=>{c.fillStyle=bg;c.fillRect(0,0,W,H);c.fillStyle='rgba(74,103,85,.028)';for(let i=0;i<13;i++)c.fillRect((Math.sin(i*17.3+text.length)*.5+.5)*W,0,2+i%5,H*(.25+(i%4)*.18));c.strokeStyle=fg;c.lineWidth=8;c.strokeRect(10,10,W-20,H-20);c.fillStyle=fg;c.font=`600 ${size}px 'Yu Gothic','Microsoft YaHei',sans-serif`;c.textAlign='center';c.textBaseline='middle';text.split('\n').forEach((s,i,a)=>c.fillText(s,W/2,H/2+(i-(a.length-1)/2)*size*1.5));c.fillStyle=bg;c.globalAlpha=.07;for(let i=0;i<24;i++)c.fillRect((Math.sin(i*13.4)*.5+.5)*W,(Math.cos(i*7.1)*.5+.5)*H,5+i%21,2+i%3);});return mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}),p,x,y,z);}
const glass=new T.MeshPhysicalMaterial({color:'#a2d8d3',transparent:true,opacity:.16,roughness:.12,metalness:.05,side:T.DoubleSide,depthWrite:false});
const seaMirror={texture:{value:null},matrix:{value:new T.Matrix4()},texel:{value:new T.Vector2(1/1600,1/1000)}};
const quayMirror={texture:{value:null},matrix:{value:new T.Matrix4()}};
const puddleMat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{uMirror:quayMirror.texture,uMirrorMatrix:quayMirror.matrix,uTime:weatherTime},
 vertexShader:`uniform mat4 uMirrorMatrix;varying vec4 vMirror;varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vMirror=uMirrorMatrix*w;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform sampler2D uMirror;uniform float uTime;varying vec4 vMirror;varying vec3 vWorld;void main(){vec2 uv=vMirror.xy/vMirror.w;uv.x+=sin(vWorld.z*13.+uTime*1.4)*.0007;vec4 r=texture2D(uMirror,uv);float l=dot(r.rgb,vec3(.22,.67,.11));vec3 c=mix(vec3(.35,.51,.49),vec3(.76,.82,.73),step(.45,l));vec3 base=vec3(.62,.74,.69);vec3 col=mix(base,c,r.a*.6);gl_FragColor=vec4(col,.65);}`});
const root=group(scene);
// Floating square plinth, with the harbour in section.
box(root,0,-1.65,0,24.12,.43,24.12,'#9eb9b2');box(root,0,-1.87,0,24.28,.16,24.28,'#e1dfcb');
box(root,0,-1.98,0,24.02,.08,24.02,'#8baba6');
const floor=mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({color:'#668c83',opacity:.19}),scene,0,-2.09,0);floor.rotation.x=-PI/2;floor.castShadow=false;
box(root,3.7,-1.39,1.7,16.6,.18,20.6,'#a7c9ba',false);
const concreteTex=canvasTexture(512,512,(c,W,H)=>{c.fillStyle='#d1d5ca';c.fillRect(0,0,W,H);for(let i=0;i<16000;i++){const a=rand()*.09;c.fillStyle=rand()>.5?`rgba(35,72,65,${a})`:`rgba(255,255,240,${a*2})`;c.fillRect(rand()*W,rand()*H,range(1,4),range(1,3));}for(let i=0;i<25;i++){c.fillStyle='rgba(92,130,116,.025)';c.beginPath();c.ellipse(rand()*W,rand()*H,range(10,80),range(4,24),rand()*PI,0,TAU);c.fill();}});concreteTex.wrapS=concreteTex.wrapT=T.RepeatWrapping;concreteTex.repeat.set(3,8);
const cement=weatherMaterial(new T.MeshStandardMaterial({color:'#e0e5dd',map:concreteTex,roughness:.48,metalness:.08}));
box(root,-8.3,-.03,-1.5,7.4,2.76,21,cement);box(root,-10.1,-.03,10.5,3.8,2.76,3,cement);box(root,3.7,-.03,-10.3,16.6,2.76,3.4,cement);
box(root,-8.3,1.38,-1.5,7.4,.12,21,cement);box(root,-10.1,1.38,10.5,3.8,.12,3,cement);box(root,3.7,1.38,-10.3,16.6,.12,3.4,cement);
// Block joints, tide stains, barnacles.
for(let row=0;row<5;row++)for(let k=0;k<16;k++){
 const z=-11.95+k*1.5+(row%2)*.73; if(z>8.35)continue;
 const y=-1.09+row*.51;
 box(root,-4.585,y,z,.026,.47,1.44,row<2?'#789c8b':row===2?'#92aaa0':'#b6c3b6',false);
}
for(let row=0;row<5;row++)for(let k=0;k<11;k++){const x=-4.5+k*1.5;box(root,x,-1.09+row*.51,-8.585,1.44,.47,.025,row<2?'#789c8b':row===2?'#92aaa0':'#b6c3b6',false);}
// Broken tide bands and capillary stains span the masonry instead of repeating on each block.
const tideTexture=canvasTexture(2048,512,(c,W,H)=>{for(let layer=0;layer<4;layer++){const y0=154+layer*34;c.fillStyle=['rgba(94,129,104,.21)','rgba(78,122,101,.18)','rgba(105,137,108,.16)','rgba(74,119,100,.15)'][layer];c.beginPath();c.moveTo(0,H);for(let x=0;x<=W;x+=8)c.lineTo(x,y0+Math.sin(x*.025+layer)*5+Math.sin(x*.087+layer*3)*2);c.lineTo(W,H);c.closePath();c.fill();}for(let i=0;i<310;i++){const x=rand()*W,y=range(146,480);c.fillStyle=i%4?'rgba(73,118,99,.14)':'rgba(184,188,143,.19)';c.fillRect(x,y,range(1,15),range(1,5));}for(let i=0;i<46;i++){const x=rand()*W,y=range(55,132),h=range(24,110),g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'rgba(114,131,102,0)');g.addColorStop(.35,'rgba(114,131,102,.18)');g.addColorStop(1,'rgba(114,131,102,0)');c.fillStyle=g;c.fillRect(x,y,range(2,9),h);}for(let i=0;i<18;i++){const x=i*W/17;c.strokeStyle='rgba(194,198,163,.2)';c.lineWidth=1;c.beginPath();c.moveTo(x,145);c.lineTo(x+4,166);c.lineTo(x+3,197);c.stroke();}});
const tideMaterial=mat('#c6d2b4',{map:tideTexture,transparent:true,opacity:.68,depthWrite:false,side:T.DoubleSide});
const leftTide=mesh(new T.PlaneGeometry(17.45,2.4),tideMaterial,root,-4.552,-.08,.22);leftTide.rotation.y=PI/2;leftTide.castShadow=false;const rearTide=mesh(new T.PlaneGeometry(16.5,2.4),tideMaterial,root,3.7,-.08,-8.552);rearTide.castShadow=false;
for(let i=0;i<130;i++){const z=range(-8.4,11.8);sphere(root,-4.54,range(-.8,.22),z,range(.025,.07),rand()>.5?'#d7ddbf':'#9ba797',.5,1,1);}
for(let z of [-5.1,-.7,6.9,8.4]){box(root,-4.54,.83,z,.035,.28,.28,'#8f9d85');torus(root,-4.495,.76,z,.12,.024,'#967b55',0,PI/2);for(let dz of [-.09,.09])sphere(root,-4.505,.9,z+dz,.022,'#657f70');box(root,-4.528,.42,z,.012,.45,.065,new T.MeshBasicMaterial({color:'#9d9574',transparent:true,opacity:.3}),false);}
for(let i=0;i<46;i++){const z=range(-8.5,11.8),y=range(-.4,.25);box(root,-4.525,y,z,.008,range(.08,.3),range(.04,.12),new T.MeshBasicMaterial({color:'#568875',transparent:true,opacity:range(.12,.3)}),false);}
// Open barnacle crowns and ribbed oyster shells make the exposed tide band readable close up.
function barnacle(x,y,z,s=1){const g=group(root,x,y,z);const crown=cyl(g,0,0,0,.062*s,.067*s,'#c2cbb3',.04*s,7);crown.rotation.z=-PI/2;const hole=cyl(g,.036*s,0,0,.027*s,.008*s,'#627f70',.027*s,7);hole.rotation.z=-PI/2;for(let i=0;i<6;i++){const a=i*TAU/6;beam(g,[.035*s,Math.cos(a)*.038*s,Math.sin(a)*.038*s],[-.03*s,Math.cos(a)*.06*s,Math.sin(a)*.06*s],.005*s,'#e0ddc3',4);}return g;}
for(let i=0;i<34;i++){const z=-7.6+i*.57+Math.sin(i*2.3)*.16,y=-.13+Math.sin(i*1.8)*.26;for(let j=0;j<3;j++)barnacle(-4.5,y+j*.06,z+j*.065,.7+(i%4)*.13);}
for(let i=0;i<26;i++){const g=group(root,-4.51,-.55+Math.sin(i)*.18,-7.3+i*.71);g.rotation.x=i*.7;const shell=sphere(g,.02,0,0,.1,i%2?'#b8c8b7':'#d4d6bb',.4,1.1,.75);for(let j=-2;j<=2;j++)line(g,[[.06,-.065,j*.006],[.055,.04,j*.022]],'#8fa795',.65);}
// Deck seams and fine cracks.
for(let z=-10;z<12;z+=3.5)line(root,[[-11.9,1.451,z],[z<9?-4.9:-8.3,1.451,z]],'#95a99c',.4);
for(let x=-10;x<-4.6;x+=2.7)line(root,[[x,1.451,-11.9],[x,1.451,x<-8.2?11.9:8.95]],'#a1b2a6',.35);
for(let i=0;i<23;i++){let x=range(-11.7,-5),z=range(-11,11);if(x>-8.45&&z>8.3)z=8.2;line(root,[[x,1.454,z],[x+.14,1.454,z+.22],[x+.05,1.454,z+.4],[x+.24,1.454,z+.61]],'#879f91',.32);}
// Water surfaces, coloured glints in the hand-painted style.
const waterUniforms={uTime:{value:0},uMirror:seaMirror.texture,uMirrorMatrix:seaMirror.matrix,uMirrorTexel:seaMirror.texel};
const waterMaterial=new T.ShaderMaterial({uniforms:waterUniforms,transparent:true,depthWrite:false,side:T.DoubleSide,
 vertexShader:`varying vec3 vPos;varying vec4 vMirror;uniform float uTime;uniform mat4 uMirrorMatrix;void main(){vPos=position;vec3 p=position;p.z+=.018*sin(p.x*1.4+uTime*.8)*cos(p.y*1.7+uTime*.5);vMirror=uMirrorMatrix*modelMatrix*vec4(p,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`varying vec3 vPos;varying vec4 vMirror;uniform float uTime;uniform sampler2D uMirror;uniform vec2 uMirrorTexel;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
 void main(){vec2 p=vPos.xy;vec2 q=vec2(p.x*.83+p.y*.23,p.y*1.65);q.x+=sin(p.y*1.8+uTime*.55)*.18;q.y+=uTime*.075;
 float n=noise(q)*.7+noise(q*2.4)*.3;
 vec3 col=vec3(.32,.70,.67);col=mix(col,vec3(.39,.75,.70),step(.39,n));col=mix(col,vec3(.47,.79,.73),step(.63,n));
 vec2 cells=vec2(p.x*1.5,p.y*3.8);float h=hash(floor(cells));vec2 f=fract(cells);float wave=sin(f.x*3.14+uTime*.7+h*6.)*.045+.5;
 float stroke=(1.-smoothstep(.008,.025,abs(f.y-wave)))*step(.72,h)*smoothstep(.03,.16,f.x)*(1.-smoothstep(.72,.95,f.x));
 col=mix(col,vec3(.77,.89,.79),stroke*.7);
 vec2 uv=vMirror.xy/vMirror.w;float distort=floor(sin(p.y*8.+uTime*.75)*4.)/4.;uv.x+=distort*.0045+sin(p.y*19.-uTime*.9)*.0012;uv.y+=sin(p.x*3.+p.y*9.+uTime*.6)*.0012;
 vec4 reflection=texture2D(uMirror,uv)*.36;reflection+=texture2D(uMirror,uv+uMirrorTexel*vec2(3.,1.))*.16;reflection+=texture2D(uMirror,uv-uMirrorTexel*vec2(3.,1.))*.16;reflection+=texture2D(uMirror,uv+uMirrorTexel*vec2(1.,3.))*.16;reflection+=texture2D(uMirror,uv-uMirrorTexel*vec2(1.,3.))*.16;
 float luminance=dot(reflection.rgb,vec3(.22,.67,.11));vec3 poster=vec3(.24,.48,.51);poster=mix(poster,vec3(.45,.65,.63),step(.22,luminance));poster=mix(poster,vec3(.83,.88,.79),step(.54,luminance));
 float fragmentMask=mix(.24,1.,step(.32+sin(uTime*.3)*.06,noise(vec2(p.x*2.,p.y*4.)+vec2(sin(uTime*.25)*.2,uTime*.035))));col=mix(col,poster,reflection.a*fragmentMask*.36);
 float cycle=mod(uTime,100.);float worldX=p.x+3.7,worldZ=1.7-p.y;float cloudCentre=17.-(cycle-72.)*3.6;float cloudMask=exp(-pow((worldX+worldZ*.3-cloudCentre)/5.,2.))*step(72.,cycle)*(1.-step(84.,cycle));col*=1.-cloudMask*.13;
 float windAge=cycle-52.-(12.-worldX)*.3;float windMask=step(0.,windAge)*(1.-step(6.,windAge))*sin(clamp(windAge/6.,0.,1.)*3.14159);float windLine=pow(max(0.,sin(p.y*29.+p.x*2.-uTime*3.)),18.);col=mix(col,vec3(.64,.84,.76),windMask*windLine*.22);gl_FragColor=vec4(col,.70);}`});
const water=mesh(new T.PlaneGeometry(16.6,20.6,65,80),waterMaterial,root,3.7,.38,1.7);water.rotation.x=-PI/2;water.castShadow=false;
const waterSide=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,uniforms:{uTime:weatherTime},
 vertexShader:`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform float uTime;varying vec2 vUv;varying vec3 vWorld;void main(){float depth=1.-vUv.y;vec3 col=mix(vec3(.41,.76,.69),vec3(.20,.52,.55),depth);float ripple=pow(max(0.,sin((vWorld.x+vWorld.z)*4.5+vWorld.y*17.+uTime*.6)),18.)*.07;col+=ripple;float lip=smoothstep(.97,1.,vUv.y);col=mix(col,vec3(.77,.92,.80),lip*.55);gl_FragColor=vec4(col,.23+depth*.22);}`});
mesh(new T.PlaneGeometry(16.6,1.7),waterSide,root,3.7,-.48,12.015);const rightWater=mesh(new T.PlaneGeometry(20.6,1.7),waterSide,root,12.015,-.48,1.7);rightWater.rotation.y=PI/2;
line(root,[[-4.58,.39,12.03],[12.03,.39,12.03],[12.03,.39,-8.57]],'#b9e2cf',.7);
// Seabed stones, tyre, anchor chain and weeds.
for(let i=0;i<150;i++){const x=range(-4.2,11.8),z=range(-8.4,11.8);sphere(root,x,-1.23,z,range(.055,.22),['#a3b5a0','#b4c7ac','#7eab9e','#d1d2b2'][i%4],range(.8,1.8),.4,1);}
torus(root,5.5,-1.1,10.7,.62,.16,'#547671',PI/2,.15,.2);
for(let i=0;i<22;i++){torus(root,5.1+i*.1,-1.14,10.6-i*.12,.085,.025,'#817c5d',PI/2+(i%2)*PI/2,0,.4);}
const weeds=[];
for(let i=0;i<32;i++){const g=group(root,range(-4.2,11.5),-1.25,range(-8,11.5));for(let j=0;j<3;j++){const h=range(.25,.8);path(g,[[0,0,0],[j*.06,.2,0],[j*.05-.08,h*.7,.08],[.14,h,.06]],.027,['#467e66','#79a581','#527f60'][j]);}weeds.push(g);}
const kelpFronds=[];
function kelp(x,y,z,height,phase){const g=group(root,x,y,z);g.rotation.y=phase;for(let j=0;j<4;j++){const h=height*(.6+j*.13),positions=[],indices=[];for(let k=0;k<=16;k++){const q=k/16,w=Math.pow(Math.sin(q*PI),.7)*(.04+j*.011);const cx=Math.sin(q*3+phase+j)*q*.1+j*.035;for(let side of [-1,1])positions.push(cx+side*w,q*h,Math.sin(q*4+j)*q*.045);}for(let k=0;k<16;k++){const a=k*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();const o=mesh(geo,mat(['#568c77','#73a28a','#427c6d','#8bb39a'][j],{side:T.DoubleSide}),g);kelpFronds.push({o,base:new Float32Array(positions),phase:phase+j*.7});}return g;}
for(let i=0;i<11;i++)kelp(-4.38,-.88,-6.8+i*1.5,.52+(i%3)*.12,i*1.7);
for(let [x,z,h,a] of [[7.7,10.8,.87,1],[9.4,9.7,.72,3],[3.7,11,.58,.6],[10.7,5.8,.68,2.1]])kelp(x,-1.25,z,h,a);
const fish=[];
for(let i=0;i<23;i++){const g=group(root);const body=mesh(new T.SphereGeometry(.1,12,8),mat(i%4===0?'#97b7aa':'#6a9897'),g);body.scale.set(1.9,.62,.6);const verts=[-.14,0,0,-.29,.085,0,-.26,0,0,-.14,0,0,-.26,0,0,-.29,-.085,0,0,.035,0,-.04,.11,0,-.12,.045,0];const fg=new T.BufferGeometry();fg.setAttribute('position',new T.Float32BufferAttribute(verts,3));fg.computeVertexNormals();const fin=mesh(fg,mat('#a1c2b1',{side:T.DoubleSide}),g);for(let side of [-1,1]){sphere(g,.125,.012,side*.047,.019,'#e0e1c1');sphere(g,.136,.015,side*.059,.011,'#315b60');line(g,[[-.11,.008,side*.048],[.045,.015,side*.058],[.1,.01,side*.05]],'#bed2bd',.65);}fish.push({g,fin,phase:rand()*TAU,r:range(.7,2.1),cx:range(4.5,7.8),cz:range(5,8.5),y:range(-.95,-.28)});}
// Puddles.
const puddles=[];
function puddle(x,z,rx,rz){const shape=new T.Shape();for(let i=0;i<=64;i++){const a=i/64*TAU,r=1+Math.sin(a*5+z)*.065+Math.sin(a*9+x)*.025;const px=Math.cos(a)*r,py=Math.sin(a)*r;i?shape.lineTo(px,py):shape.moveTo(px,py);}shape.closePath();const o=mesh(new T.ShapeGeometry(shape),puddleMat,root,x,1.455,z);o.rotation.x=-PI/2;o.scale.set(rx,rz,1);o.castShadow=false;puddles.push({x,z,rx,rz});}
puddle(-6.6,6.8,1.2,.45);puddle(-9.8,1.8,.8,.5);puddle(-6.7,-4.5,.65,.33);puddle(-10.2,11.1,.9,.3);puddle(3.6,-10.2,1.1,.31);puddle(-6.9,8.1,1.05,.43);
for(let p of puddles){for(let j=0;j<5;j++){const o=mesh(new T.PlaneGeometry(p.rx*.13,p.rz*.6),new T.MeshBasicMaterial({color:j%2?'#6e9790':'#dce4cb',transparent:true,opacity:.23,depthWrite:false}),root,p.x-p.rx*.45+j*p.rx*.19,1.46,p.z);o.rotation.x=-PI/2;}}
// Iron drainage grates, a little chipped paint, and berth markings on the pier.
for(let z of [-6.8,2.2,8.1]){box(root,-5.65,1.455,z,.43,.016,.65,'#7c9184',false);for(let j=0;j<8;j++)box(root,-5.65,1.467,z-.27+j*.077,.32,.006,.022,'#526e64',false);}
for(let [z,n] of [[-4.7,'01'],[1.6,'02'],[8.7,'03']]){const o=label(root,-5.27,1.454,z,.45,.51,n,'#ccd2bd','#e7e6c9',245);o.rotation.x=-PI/2;o.rotation.z=-PI/2;}
// Mooring posts and dark wet coils.
const posts=[];
function bollard(x,z){const g=group(root,x,1.47,z);cyl(g,0,.035,0,.24,.07,'#65766d');cyl(g,0,.28,0,.12,.48,'#344b49');cyl(g,0,.5,0,.21,.1,'#334946');beam(g,[-.27,.42,0],[.27,.42,0],.075,'#344b49');for(let j=0;j<3;j++)torus(g,0,.2+j*.065,0,.155,.032,j===0?'#6c6e4c':'#ab8c5d',PI/2);posts.push(g);return g;}
[-7,-2,3.3,8.8].forEach(z=>bollard(-4.93,z));[0,4.7,8.5].forEach(x=>bollard(x,-8.98));
// Worn yellow and charcoal kerbs.
const stripeTex=canvasTexture(256,64,(c,W,H)=>{c.fillStyle='#ddbd62';c.fillRect(0,0,W,H);c.fillStyle='#4a5751';for(let i=-80;i<330;i+=65){c.beginPath();c.moveTo(i,0);c.lineTo(i+30,0);c.lineTo(i-5,H);c.lineTo(i-35,H);c.fill();}for(let i=0;i<400;i++){c.fillStyle='rgba(220,218,189,.24)';c.fillRect(rand()*W,rand()*H,range(1,7),range(1,3));}});stripeTex.wrapS=stripeTex.wrapT=T.RepeatWrapping;stripeTex.repeat.set(1,1);
const stripeMat=new T.MeshStandardMaterial({map:stripeTex,roughness:.65});
for(let z=-7.5;z<9;z+=2.5){box(root,-4.77,1.57,z,.3,.25,1.7,'#c7cbb7');const pl=mesh(new T.PlaneGeometry(1.7,.25),stripeMat,root,-4.611,1.58,z);pl.rotation.y=PI/2;box(root,-4.77,1.703,z,.3,.015,1.7,stripeMat,false);}
for(let i=0;i<4;i++)box(root,-4.17+i*.36,1.21-i*.23,5.5,.73,.24,2.35,cement);
box(root,-2.75,.51,5.5,1.65,.24,2.6,cement);
// Rusty ladders into the harbour.
function ladder(z){for(let s of [-.35,.35])path(root,[[-5,1.5,z+s],[-4.66,1.75,z+s],[-4.32,1.5,z+s],[-4.32,-.95,z+s]],.045,'#92734e');for(let y=-.75;y<1.5;y+=.32)beam(root,[-4.3,y,z-.35],[-4.3,y,z+.35],.033,'#a58d63');}
ladder(-6.4);ladder(7.6);
// Port lamps with ring shades, and fine suspended wires.
const lamps=[];
function lamp(x,z,h=5.8){const g=group(root,x,1.45,z);cyl(g,0,.12,0,.23,.24,'#70867c');cyl(g,0,h*.5,0,.06,h,'#5c7772',.045);path(g,[[0,h-.2,0],[.15,h+.2,0],[.7,h+.2,0],[.85,h-.05,0]],.05,'#5b7470');cyl(g,.85,h-.12,0,.29,.11,'#d6d9ba',.12);torus(g,.85,h-.17,0,.3,.025,'#506b66',PI/2);sphere(g,.85,h-.21,0,.12,new T.MeshBasicMaterial({color:'#fff2b1'}),1,.5,1);lamps.push(g);return g;}
lamp(-5.4,7.2);lamp(-5.35,-5.8);lamp(5.6,-10.5,5.1);
path(root,[[-5.4,7.2,7.2],[-5.5,6.4,1.1],[-5.35,7.2,-5.8],[.1,6.2,-8],[5.6,6.5,-10.5]],.013,'#697d73');
// Fish boxes are hollow, with handles and raised corner posts.
function crate(p,x,y,z,color='#e5e8d9',s=1){const g=group(p,x,y,z);g.scale.setScalar(s);const rgb=new T.Color(color),slatted=rgb.b>rgb.g*1.05&&rgb.b>rgb.r*1.3,parts=[[0,.045,0,.75,.09,.51]];if(slatted){for(let side of [-1,1]){for(let yy of [.12,.28,.44]){parts.push([0,yy,side*.245,.75,.035,.045],[side*.35,yy,0,.045,.035,.51]);}for(let xx of [-.34,-.22,-.11,0,.11,.22,.34])parts.push([xx,.27,side*.245,.025,.34,.04]);for(let zz of [-.2,-.1,0,.1,.2])parts.push([side*.35,.27,zz,.04,.34,.025]);}}else{for(let k of [-1,1])parts.push([0,.23,k*.245,.75,.38,.045],[k*.35,.23,0,.05,.38,.51],[k*.35,.45,0,.07,.055,.55]);}boxParts(g,parts,color);if(!slatted)boxParts(g,[-1,0,1].map(k=>[k*.23,.25,.273,.12,.1,.015]),'#9cac9f',false);return g;}
function stackCrates(p,x,y,z,n,color){for(let i=0;i<n;i++)crate(p,x+(i%2)*.025,y+i*.46,z,color);}
for(let i=0;i<4;i++)stackCrates(root,-6.1+(i%2)*.8,1.46,-.3+Math.floor(i/2)*.62,2+i%3,i%2?'#6f9fab':'#ecebdd');
stackCrates(root,-10.8,1.46,6.2,3,'#e9eadc');stackCrates(root,-10,1.46,6.3,2,'#6894a1');
// Warehouse: open front, high clerestory windows and a half-raised shutter.
const wh=group(root,-8.45,1.45,-2.6);
box(wh,0,.07,0,5.1,.14,5.5,'#9aa99b');box(wh,-2.45,1.9,0,.16,3.8,5.5,'#c9cfb9');
const whPuddle=mesh(new T.CircleGeometry(1,32),puddleMat,wh,.6,.147,.15);whPuddle.rotation.x=-PI/2;whPuddle.scale.set(1.2,.68,1);whPuddle.castShadow=false;
for(let side of [-1,1]){const z=side*2.68;box(wh,0,1.55,z,5.1,3.1,.16,side>0?'#d5d8c4':'#cbd1bc');box(wh,0,3.77,z,5.1,.12,.16,'#c9d2bc');for(let x of [-2.15,2.15])box(wh,x,3.42,z,.8,.64,.16,'#cbd1bc');}
for(let z=-2.5;z<2.7;z+=.35){box(wh,-2.55,1.8,z,.015,3.4,.016,'#a8bcae',false);box(wh,2.54,3.5,z,.024,.7,.02,'#89a7a0',false);}
box(wh,2.47,3.42,0,.18,.76,5.5,'#b2c1b1');
for(let z of [-2.57,2.57])box(wh,2.47,1.9,z,.2,3.8,.22,'#668980');
box(wh,2.5,3.17,0,.13,.3,4.8,'#a2b2a2');
for(let y=2.28;y<3.2;y+=.085)box(wh,2.56,y,0,.06,.065,4.85,'#a3b7af',false);
for(let z of [-2.7,2.7]){box(wh,2.6,1.6,z,.1,3.2,.06,'#7a9990');box(wh,0,3.43,z,3.4,.52,.025,glass,false);for(let x=-1.7;x<1.8;x+=.85)box(wh,x,3.43,z,.04,.6,.06,'#638d84',false);for(let y of [3.13,3.73])box(wh,0,y,z,3.44,.045,.06,'#638d84',false);}
// Gable and corrugated sea green roof.
function gable(p,w,d,y,h,color){const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute([-w/2,y,0,w/2,y,0,0,y+h,0],3));geom.computeVertexNormals();for(let z of [-d/2,d/2])mesh(geom,mat(color,{side:T.DoubleSide}),p,0,0,z);}
gable(wh,5.5,5.7,3.85,1.05,'#c7d0b8');
function roof(p,w,d,y,rise,color,tile=false){const slope=Math.atan2(rise,w/2),len=Math.hypot(w/2,rise);for(let s of [-1,1]){const o=box(p,s*w/4,y+rise/2,0,len+.18,.12,d+.5,color);o.rotation.z=-s*slope;for(let z=-d/2-.15;z<=d/2+.2;z+=tile?.18:.22){const a=[s*.02,y+rise+.09,z],b=[s*(w/2+.12),y+.055,z];beam(p,a,b,tile?.055:.018,tile?color:'#80a89e',6);}if(tile){for(let j=1;j<7;j++){const xx=s*w/2*j/7;beam(p,[xx,y+rise*(1-j/7)+.09,-d/2-.2],[xx,y+rise*(1-j/7)+.09,d/2+.2],.018,'#607a78');}}}beam(p,[0,y+rise+.1,-d/2-.3],[0,y+rise+.1,d/2+.3],.09,color);}
roof(wh,5.6,5.65,3.87,1.05,'#63938d');
// Rain gutters, downpipe, ventilation louvres, and weathered roof patches.
for(let s of [-1,1]){beam(wh,[s*2.91,3.84,-3.02],[s*2.91,3.84,3.02],.055,'#6c9386');}
path(wh,[[2.9,3.84,2.88],[2.75,3.6,2.88],[2.75,.2,2.88],[2.9,.12,3.03]],.043,'#77968a');
box(wh,0,3.92,2.77,1.1,.27,.04,'#819d8b');for(let j=0;j<5;j++)box(wh,0,3.83+j*.045,2.8,1,.018,.015,'#b5c5a8',false);
for(let j=0;j<12;j++){const x=range(.3,2.65),z=range(-2.7,2.7);const o=box(wh,x,4.95-x*.375,z,range(.04,.12),.006,range(.12,.4),'#86aaa0',false);o.rotation.z=-.358;}
// Label faces the open east facade.
const whSign=label(wh,2.635,3.73,0,3.7,.48,'汐風漁業協同組合','#e0debe','#477679',64);whSign.rotation.y=PI/2;
for(let z=-2;z<1.5;z+=.7)stackCrates(wh,-1.55,.17,z,3+(z>0?1:0),'#dee1ca');
stackCrates(wh,-.6,.17,-1.8,3,'#a8c4b9');stackCrates(wh,-.6,.17,-1,2,'#e3e4cf');
box(wh,-.6,.58,1.65,1.65,.86,1.1,'#e4e7d7');box(wh,-.6,1.05,1.65,1.72,.1,1.15,'#c0d2c7');box(wh,.28,.66,1.65,.04,.24,.12,'#5f7c75');
box(wh,1,.42,-1.6,.65,.14,.6,'#628079');cyl(wh,1,.68,-1.6,.055,.5,'#78928a');box(wh,1,.98,-1.6,.62,.1,.65,'#abbcac');
const scaleDial=cyl(wh,1.21,.72,-1.6,.18,.08,'#839d8a');scaleDial.rotation.z=-PI/2;
const dialTexture=canvasTexture(256,256,(c,W,H)=>{c.fillStyle='#e7e3c8';c.fillRect(0,0,W,H);c.strokeStyle='#59796a';c.fillStyle='#59796a';c.lineWidth=3;c.font='21px sans-serif';c.textAlign='center';c.textBaseline='middle';for(let i=0;i<31;i++){const a=PI*.75+i/30*PI*1.5,r=i%5?91:83;c.beginPath();c.moveTo(128+Math.cos(a)*r,128+Math.sin(a)*r);c.lineTo(128+Math.cos(a)*106,128+Math.sin(a)*106);c.stroke();if(i%5===0)c.fillText(String(i),128+Math.cos(a)*68,128+Math.sin(a)*68);}c.strokeStyle='#ba805c';c.lineWidth=5;c.beginPath();c.moveTo(128,128);c.lineTo(72,84);c.stroke();c.fillStyle='#708974';c.fillText('kg',128,178);});
const dialFace=mesh(new T.CircleGeometry(.16,32),new T.MeshBasicMaterial({map:dialTexture,side:T.DoubleSide}),wh,1.255,.72,-1.6);dialFace.rotation.y=PI/2;
const chalk=label(wh,-2.345,2.2,.3,1.8,1.25,'本日の水揚げ\n鯵　 380 / kg\n鯖　 520 / kg','#496b62','#e6e3c4',56);chalk.rotation.y=PI/2;
label(wh,.85,1.65,-2.584,1.65,1.05,'本日の競り\n鯵　380 円 / kg\n鯖　520 円 / kg','#4b6a5d','#e1dfbc',60);
for(let x of [1.9,2.15]){box(wh,x,1.52,-2.51,.18,.48,.19,'#bfa95a');box(wh,x,1.3,-2.42,.19,.13,.34,'#bfa95a');}
for(let z of [-1.5,-1.2]){box(wh,-2.25,1.75,z,.22,.55,.2,'#bda44f');box(wh,-2.15,1.52,z,.43,.14,.22,'#bda44f');}
for(let i=0;i<18;i++){const ice=box(wh,range(.4,1.8),.19,range(-.9,1.3),range(.06,.15),.09,range(.07,.14),new T.MeshPhysicalMaterial({color:'#dcf5e9',transparent:true,opacity:.6,roughness:.1}),false);ice.rotation.y=rand()*PI;}
const freezerLabel=label(wh,.263,.72,1.65,.35,.27,'氷','#d8d7bb','#678f87',180);freezerLabel.rotation.y=PI/2;
for(let j=0;j<5;j++)box(wh,.258,.34+j*.05,1.65,.012,.016,.61,'#8ea79a',false);
crate(wh,.2,.16,.65,'#e3e5d0');for(let i=0;i<3;i++){const caught=group(wh,.02+i*.17,.31,.65);caught.rotation.y=-.18+i*.13;sphere(caught,0,0,0,.085,'#b7c9bd',.65,.5,2);sphere(caught,0,.013,.12,.012,'#526f6c');const tail=mesh(new T.ConeGeometry(.052,.1,3),mat('#8ca99b'),caught,0,0,-.18);tail.rotation.x=PI/2;}
// Visible golden shafts (subtle planes, no heavy volumetric cone).
const shafts=[];
function shaft(p,x,y,z,h,w,dx=1.2,dz=-1.5,axis='x'){const wx=axis==='x'?w:0,wz=axis==='x'?0:w;const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,wx,0,wz,wx+dx,-h,wz+dz,0,0,0,wx+dx,-h,wz+dz,dx,-h,dz],3));geo.computeVertexNormals();const m=new T.MeshBasicMaterial({color:'#fff0b6',transparent:true,opacity:.085,depthWrite:false,side:T.DoubleSide});const o=mesh(geo,m,p,x,y,z);o.castShadow=false;shafts.push(o);return o;}
shaft(wh,-1.4,3.65,2.59,3.43,.47);shaft(wh,-.34,3.65,2.59,3.43,.47);
box(wh,0,3.8,0,4.74,.075,5.14,'#c1cfb7');for(let z of [-1.8,0,1.8])box(wh,0,3.73,z,4.7,.11,.08,'#8fa895');
const causticPatches=[];
function causticPatch(p,x,y,z,w,h,rx=PI/2,ry=0){const uniforms={uTime:weatherTime,uStrength:{value:.21}};const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms,
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uStrength;vec2 hash2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}void main(){vec2 p=vUv*vec2(4.5,3.5),id=floor(p),f=fract(p);float a=10.,b=10.;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 n=vec2(float(x),float(y));vec2 centre=.5+.28*sin(uTime*.6+6.2831*hash2(id+n));float d=length(n+centre-f);if(d<a){b=a;a=d;}else if(d<b)b=d;}}float edge=1.-smoothstep(.025,.075,b-a);float fade=smoothstep(0.,.16,vUv.x)*smoothstep(0.,.16,1.-vUv.x)*smoothstep(0.,.12,vUv.y)*smoothstep(0.,.12,1.-vUv.y);gl_FragColor=vec4(.75,.91,.78,edge*fade*uStrength);}`});const o=mesh(new T.PlaneGeometry(w,h),material,p,x,y,z);o.rotation.set(rx,ry,0);causticPatches.push(o);return o;}
causticPatch(wh,.1,3.755,.1,4.25,4.8);causticPatch(wh,-2.35,1.42,.1,3.7,.9,0,PI/2);
// Waiting room, the long glazing reveals its furniture.
const wr=group(root,-8.65,1.45,4.5);
box(wr,0,.1,0,4.75,.2,3.8,'#b0bdac');box(wr,-2.3,1.47,0,.15,2.85,3.8,'#d5d8bc');box(wr,0,1.47,-1.83,4.7,2.85,.13,'#d9dbbf');
for(let x of [-2.3,0,2.3])for(let z of [-1.8,1.8])box(wr,x,1.5,z,.1,3,.1,'#6c8c80');
for(let z of [-1.8,0,1.8])box(wr,2.3,1.5,z,.065,3,.06,'#6d8c83');
box(wr,2.32,1.56,0,.016,2.5,3.55,glass,false);box(wr,0,1.55,1.82,4.5,2.5,.014,glass,false);
for(let y of [.35,2.85]){box(wr,2.3,y,0,.12,.12,3.8,'#6c8c80');box(wr,0,y,1.82,4.7,.12,.1,'#6c8c80');}
roof(wr,5.1,4.1,2.98,.75,'#658d89',true);
beam(wr,[2.69,2.95,-2.21],[2.69,2.95,2.21],.045,'#74968b');path(wr,[[2.69,2.95,-2.2],[2.55,2.7,-2.2],[2.55,.22,-2.2]],.035,'#789a8d');
let sign=label(wr,2.4,2.64,0,2.55,.4,'汐 風 港　待 合 室','#e5dfbd','#46746f',58);sign.rotation.y=PI/2;
const woodTexture=canvasTexture(512,64,(c,W,H)=>{c.fillStyle='#dfc99a';c.fillRect(0,0,W,H);for(let i=0;i<30;i++){c.strokeStyle=i%3?'rgba(123,105,69,.13)':'rgba(248,231,187,.36)';c.lineWidth=i%3?1:2;c.beginPath();for(let x=0;x<=W;x+=8){const y=i*2.2+Math.sin(x*.025+i)*.7;x?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}});const benchWood=mat('#c2aa7c',{map:woodTexture});
function bench(p,x,y,z,angle=0){const b=group(p,x,y,z);b.rotation.y=angle;for(let j=0;j<4;j++)box(b,0,.48,j*.14-.2,2.5,.065,.12,benchWood);for(let j=0;j<3;j++)box(b,0,.75+j*.15,-.3,2.5,.1,.065,benchWood);for(let a of [-1,1]){beam(b,[a,.05,-.24],[a,1.15,-.32],.035,'#607c70');beam(b,[a,.06,.25],[a,.48,.25],.04,'#607c70');}return b;}
bench(wr,-.5,.2,-.85);bench(wr,-1.55,.2,.6,PI/2);
label(wr,.2,1.85,-1.746,1.55,1.03,'汐風航路 時刻表\n07:20　09:40　12:15\n14:30　16:10　18:00','#d7d4ae','#678075',57);
for(let x of [-.51,.91])for(let y of [1.4,2.29])sphere(wr,x,y,-1.724,.014,'#8b9d80');
const clockG=group(wr,1.58,2.1,-1.73);clockG.rotation.z=.07;const clockFace=cyl(clockG,0,0,0,.25,.05,'#eee9ca');clockFace.rotation.x=PI/2;torus(clockG,0,0,.03,.25,.018,'#758a77');
const clockTexture=canvasTexture(256,256,(c,W,H)=>{c.fillStyle='#eee7c9';c.fillRect(0,0,W,H);c.strokeStyle='#648170';c.fillStyle='#648170';c.lineWidth=2;for(let i=0;i<60;i++){const a=i*TAU/60;const r=i%5?108:98;c.beginPath();c.moveTo(128+Math.sin(a)*r,128-Math.cos(a)*r);c.lineTo(128+Math.sin(a)*116,128-Math.cos(a)*116);c.stroke();}c.font='29px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText('12',128,48);c.fillText('3',207,132);c.fillText('6',128,211);c.fillText('9',48,132);});
mesh(new T.CircleGeometry(.235,32),new T.MeshBasicMaterial({map:clockTexture}),clockG,0,0,.033);
const clockHands=[];for(let i=0;i<3;i++){const g=group(clockG);beam(g,[0,-.022,.052+i*.004],[0,[.125,.175,.19][i],.052+i*.004],i===2?.003:.007,i===2?'#bd9772':'#58776b');clockHands.push(g);}sphere(clockG,0,0,.069,.014,'#c2ab77');
box(wr,1.25,.45,-1.1,1.2,.1,.65,'#a48d63');for(let x of [.8,1.7])for(let z of [-1.3,-.9])beam(wr,[x,.1,z],[x,.4,z],.035,'#597468');
box(wr,1.23,.72,-1.07,.62,.39,.26,'#9b8c62');box(wr,1.13,.73,-.925,.33,.24,.02,'#4e665d');for(let i=0;i<5;i++)box(wr,1.13,.64+i*.045,-.908,.29,.01,.01,'#a5aa89',false);cyl(wr,1.44,.9,-1.07,.035,.03,'#ddd7b6');
box(wr,1.44,.79,-.919,.19,.042,.02,'#d2c18c');for(let i=0;i<5;i++)box(wr,1.36+i*.035,.79,-.906,.006,.025,.006,'#87977c',false);box(wr,1.46,.79,-.9,.008,.035,.005,'#b7845a',false);for(let y of [.64,.7]){const knob=cyl(wr,1.46,y,-.9,.034,.025,'#c1c3a3');knob.rotation.x=PI/2;}
path(wr,[[1.4,.94,-1.08],[1.62,1.4,-1.08]],.008,'#667e72');
cyl(wr,1.75,.48,.95,.19,.55,'#c4ccaf');torus(wr,1.75,.56,.95,.19,.025,'#819a85',PI/2);path(wr,[[1.85,.7,.95],[2,.9,.95],[2.12,.7,.95]],.024,'#657f6c');
path(wr,[[1.58,.57,.95],[1.43,.66,.95],[1.42,.75,.95]],.035,'#a1b397');cyl(wr,1.75,.79,.95,.18,.05,'#8ea78d');
const pothosLeaves=[];
function heartLeaf(p,x,y,z,s,a){const shape=new T.Shape();shape.moveTo(0,.06);shape.bezierCurveTo(-.1,.22,-.25,.13,-.17,-.02);shape.bezierCurveTo(-.1,-.12,-.015,-.2,0,-.23);shape.bezierCurveTo(.02,-.19,.12,-.09,.18,-.02);shape.bezierCurveTo(.25,.14,.09,.22,0,.06);const geo=new T.ShapeGeometry(shape,8),pa=geo.attributes.position;for(let i=0;i<pa.count;i++)pa.setZ(i,.035*Math.sin((pa.getY(i)+.23)/.4*PI)*(1-Math.abs(pa.getX(i))/.25));geo.computeVertexNormals();const g=group(p,x,y,z);g.scale.setScalar(s);g.rotation.set(.25,a*.7,Math.cos(a)*.4);mesh(geo,mat('#7ca272',{side:T.DoubleSide}),g);path(g,[[0,.06,.005],[0,-.07,.04],[0,-.21,.006]],.004,'#b0c58c');for(let side of [-1,1])line(g,[[0,-.04,.037],[side*.115,.015,.022]],'#a7be88',.65);pothosLeaves.push({g,angle:g.rotation.z,phase:a});return g;}
function plant(p,x,y,z,s=1){const g=group(p,x,y,z);cyl(g,0,.13*s,0,.18*s,.26*s,'#b5916a',.23*s);cyl(g,0,.265*s,0,.2*s,.015*s,'#7b8b61');for(let i=0;i<9;i++){const a=i*2.4,h=(.38+(i%4)*.075)*s,lx=Math.cos(a)*.23*s,lz=Math.sin(a)*.23*s;path(g,[[0,.22*s,0],[lx*.5,h*.8,lz*.5],[lx,h,lz]],.009*s,'#648b64');heartLeaf(g,lx,h-.015*s,lz,s*.72,a);}for(let side of [-1,1]){path(g,[[0,.3*s,0],[side*.18*s,.31*s,.13*s],[side*.26*s,.03*s,.2*s]],.008*s,'#759868');heartLeaf(g,side*.26*s,.08*s,.2*s,s*.65,side*1.2);}}
plant(wr,1.55,.2,1.1,1.3);
// Vending machine with bright little cans beneath a weathered canopy.
const vend=group(root,-10.55,1.45,7.55);box(vend,0,1.1,0,1.02,2.2,.78,'#c7d7c6');box(vend,0,1.4,.406,.85,1.22,.02,'#6b9da1');
for(let i=0;i<12;i++){const col=i%4,row=Math.floor(i/4);cyl(vend,-.3+col*.2,1.08+row*.33,.45,.055,.19,['#dbba61','#e4dfc2','#799e84','#d28b68'][col],.05,10);sphere(vend,-.3+col*.2,.95+row*.33,.46,.026,'#e9e6bf');}
label(vend,0,2,.412,.87,.22,'つめたい お飲みもの','#f7eccb','#5a8275',52);box(vend,.35,.6,.42,.09,.2,.03,'#697d6b');box(vend,-.1,.33,.42,.64,.17,.03,'#4f7168');
box(vend,0,2.38,.12,1.34,.07,1.2,'#8aa598');beam(vend,[-.55,2.35,-.2],[-.55,2.1,-.2],.025,'#987e5e');
for(let i=0;i<13;i++){const x=-.6+i*.095;box(vend,x,2.362,.718,.035+(i%3)*.018,.02,.012,i%2?'#a3835e':'#9b8c68',false);}for(let x of [-.47,.47])for(let i=0;i<3;i++)box(vend,x,1.72-i*.27,.402,.015,.18,.012,'#aab49a',false);
const vendingGlow=new T.PointLight('#ffedbb',.65,2.5,2);vendingGlow.position.set(0,1.5,.75);vend.add(vendingGlow);
// Port notice, instrument cases and transparent umbrella by the steps.
const notice=group(root,-8.7,1.45,9.25);notice.rotation.y=PI/2;for(let x of [-.7,.7])box(notice,x,.7,0,.08,1.4,.08,'#8d9b80');label(notice,0,1.35,.055,1.9,1.1,'汐 風 港\n足もとにご注意\n注意落水','#dfd9b6','#57796c',71);
function instrument(x,z,w,d){const g=group(root,x,1.52,z);g.rotation.y=-.12;box(g,0,.13,0,w,.23,d,'#a7b6b3');box(g,0,.26,0,w+.01,.06,d+.02,'#d2d8cd');for(let a of [-1,1]){box(g,a*w*.3,.16,d*.51,.12,.11,.025,'#576f69');for(let b of [-1,1])box(g,a*w*.48,.15,b*d*.47,.09,.22,.09,'#6a7f78');}path(g,[[-.17,.22,d/2],[ -.15,.38,d/2+.03],[.15,.38,d/2+.03],[.17,.22,d/2]],.035,'#465f59');}
instrument(-5.9,6.15,1.5,.43);instrument(-5.95,6.78,1.75,.52);
const umbrella=group(root,-4.94,1.88,4.07);umbrella.rotation.z=-.65;umbrella.rotation.x=.15;
beam(umbrella,[0,-.4,0],[0,.8,0],.018,'#a9b5ab');path(umbrella,[[0,-.3,0],[0,-.57,0],[.13,-.64,0],[.23,-.54,0]],.025,'#738d85');
const umbMat=new T.MeshPhysicalMaterial({color:'#d7ede0',transparent:true,opacity:.26,side:T.DoubleSide,roughness:.1,depthWrite:false});
for(let i=0;i<8;i++){const a=i*TAU/8,b=(i+1)*TAU/8;const pts=[0,.8,0,Math.cos(a)*.5,.63,Math.sin(a)*.5,Math.cos(a)*.87,.37,Math.sin(a)*.87,0,.8,0,Math.cos(a)*.87,.37,Math.sin(a)*.87,Math.cos(b)*.87,.37,Math.sin(b)*.87,0,.8,0,Math.cos(b)*.87,.37,Math.sin(b)*.87,Math.cos(b)*.5,.63,Math.sin(b)*.5];const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(pts,3));geom.computeVertexNormals();mesh(geom,umbMat,umbrella);path(umbrella,[[0,.81,0],[Math.cos(a)*.5,.64,Math.sin(a)*.5],[Math.cos(a)*.87,.38,Math.sin(a)*.87]],.009,'#98b3a9');}
sphere(umbrella,0,.84,0,.025,'#edf1da');
// Drying net, float line, hand winch, and small crane.
const netG=group(root,-10.8,1.45,9.8);
for(let z of [-1,1])beam(netG,[0,0,z],[0,2.5,z],.045,'#829383');beam(netG,[0,2.5,-1],[0,2.5,1],.045,'#829383');
const netLines=[];
for(let i=0;i<=15;i++){let z=-1+i*2/15;netLines.push(line(netG,[[0,.45,z],[.08,1.25,z],[0,2.4,z]],'#5a8b7b',.65));}
for(let j=0;j<16;j++){let y=.45+j*.13;netLines.push(line(netG,[[0,y,-1],[.08,y-.08,0],[0,y,1]],'#5a8b7b',.65));}
netLines.forEach(o=>o.userData.rest=new Float32Array(o.geometry.attributes.position.array));
path(netG,[[.1,2.38,-1],[.15,2.15,0],[.1,2.38,1]],.023,'#b9a575');for(let j=0;j<9;j++)sphere(netG,.11,2.2+Math.abs(j-4)*.04,-.9+j*.225,.075,j%2?'#e4d7aa':'#d49b60');
const crane=group(root,-5.7,1.45,-7.5);box(crane,0,.1,0,.9,.2,.8,'#8d9f8d');cyl(crane,0,.85,0,.12,1.5,'#a9b4a1');beam(crane,[0,1.5,0],[1.65,2.25,0],.075,'#a8b6a0');beam(crane,[0,1.55,0],[1.4,2.22,0],.022,'#747f68');
const craneRig=group(crane,1.65,2.25,0);torus(craneRig,0,-.04,0,.085,.018,'#7b8c76');path(craneRig,[[0,-.08,0],[0,-1.36,0]],.011,'#71816c');const hook=mesh(new T.TorusGeometry(.087,.017,6,18,PI*1.7),mat('#819187'),craneRig,.07,-1.45,0);hook.rotation.z=.2;
for(let x of [-.33,.33])for(let z of [-.27,.27])cyl(crane,x,.225,z,.04,.045,'#667d6c',.04,6);
const reel=cyl(crane,0,.65,.3,.25,.45,'#aa8057');reel.rotation.x=PI/2;for(let z of [.06,.54])torus(crane,0,.65,z,.29,.035,'#7f8062');path(crane,[[0,.65,.6],[.22,.65,.62],[.22,.83,.62]],.035,'#a77e55');
for(let i=0;i<11;i++)torus(crane,0,.65,.11+i*.035,.248,.012,i%2?'#b49e6b':'#8d8a63');for(let i=0;i<8;i++){const a=i*TAU/8;beam(crane,[0,.65,.576],[Math.cos(a)*.25,.65+Math.sin(a)*.25,.576],.012,'#7c8468');}cyl(crane,.22,.89,.62,.045,.17,'#4c6c5e');
// Nets, buckets and poles leaning on the warehouse wall.
mesh(new T.CylinderGeometry(.27,.22,.48,18,1,true),mat('#82a3a0',{side:T.DoubleSide}),root,-5.87,1.72,1.1);cyl(root,-5.87,1.5,1.1,.22,.025,'#70918a');torus(root,-5.87,1.98,1.1,.26,.018,'#5a7e77',PI/2);const bucketWater=mesh(new T.CircleGeometry(.235,24),new T.MeshBasicMaterial({color:'#668e88',transparent:true,opacity:.8,side:T.DoubleSide}),root,-5.87,1.76,1.1);bucketWater.rotation.x=-PI/2;path(root,[[-6.12,1.9,1.1],[-6.08,2.16,1.1],[-5.87,2.24,1.1],[-5.66,2.16,1.1],[-5.62,1.9,1.1]],.012,'#79978c');
beam(root,[-6,1.5,1.55],[-6.4,4.11,1.9],.025,'#9d9b70');torus(root,-6.4,4.45,1.9,.35,.021,'#778e80',0,PI/2);
const scoop=group(root,-6.4,4.45,1.9);for(let j=0;j<12;j++){const a=j/12*TAU,pts=[];for(let i=0;i<=10;i++){const q=i/10*PI/2;pts.push([Math.sin(q)*.38,Math.cos(q)*Math.cos(a)*.35,Math.cos(q)*Math.sin(a)*.35]);}line(scoop,pts,'#83a592',.7);}for(let j=1;j<6;j++){const q=j/6*PI/2,pts=[];for(let i=0;i<=24;i++){const a=i/24*TAU;pts.push([Math.sin(q)*.38,Math.cos(q)*Math.cos(a)*.35,Math.cos(q)*Math.sin(a)*.35]);}line(scoop,pts,'#83a592',.7);}
// Slipway and overturned clinker dinghy.
function slipHeight(x){return 1.44-(x+8.2)*1.04/3.6;}
const slipGeometry=new T.BufferGeometry();slipGeometry.setAttribute('position',new T.Float32BufferAttribute([-8.2,-1.41,9,-4.6,-1.41,9,-4.6,-1.41,12,-8.2,-1.41,12,-8.2,1.44,9,-4.6,.4,9,-4.6,.4,12,-8.2,1.44,12],3));slipGeometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],2));slipGeometry.setIndex([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);const slipFlat=slipGeometry.toNonIndexed();slipFlat.computeVertexNormals();mesh(slipFlat,cement,root,0,0,0,true);
for(let z of [9.02,11.97]){const o=box(root,-6.4,.99,z,3.78,.13,.12,'#c1cabb');o.rotation.z=-Math.atan(1.04/3.6);}
for(let z of [9.98,11.12])beam(root,[-8.1,slipHeight(-8.1)+.045,z],[-4.65,slipHeight(-4.65)+.045,z],.036,'#889b8d');
for(let x=-8.05;x<-4.7;x+=.31)line(root,[[x,slipHeight(x)+.008,9.2],[x,slipHeight(x)+.008,11.8]],'#8da496',.35);
for(let x of [-7.3,-5.3])for(let z of [10.02,11.08]){const chock=box(root,x,slipHeight(x)+.085,z,.28,.17,.2,'#a29470');chock.rotation.z=-Math.atan(1.04/3.6);}
const slipBoat=group(root,-6.25,slipHeight(-6.25)+.37,10.55);slipBoat.rotation.z=-Math.atan(1.04/3.6);const dinghy=group(slipBoat);dinghy.rotation.set(0,PI/2,PI);
function hullProfile(){return[[-.36,-.5],[-.48,-.4],[-.5,-.1],[-.47,.18],[-.37,.37],[-.22,.49],[0,.58],[.22,.49],[.37,.37],[.47,.18],[.5,-.1],[.48,-.4],[.36,-.5]];}
function hullRise(z){const q=Math.max(0,Math.min(1,(z-.12)/.46));return q*q*(3-2*q)*.13+Math.max(0,(-z-.35)/.15)*.025;}
function hullRail(length,width,y,scale=1){return hullProfile().map(([x,z])=>[x*width*scale,y+hullRise(z),z*length*scale]);}
function hullGeometry(length,width){const verts=[],uvs=[],idx=[];const rings=[{y:-.44,s:.38},{y:-.14,s:.85},{y:.23,s:1}],profile=hullProfile();for(let r of rings)for(let [x,z] of profile){verts.push(x*width*r.s,r.y+hullRise(z)*(r.s*.8+.2),z*length);uvs.push((z+.5)/1.08,(r.y+.44)/.67);}for(let k=0;k<rings.length-1;k++)for(let j=0;j<profile.length;j++){let a=k*profile.length+j,b=k*profile.length+(j+1)%profile.length,c=(k+1)*profile.length+j,d=(k+1)*profile.length+(j+1)%profile.length;idx.push(a,c,b,b,c,d);}for(let j=1;j<profile.length-1;j++)idx.push(0,j+1,j);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(idx);g.computeVertexNormals();return g;}
mesh(hullGeometry(3,1.5),mat('#bba47e',{side:T.DoubleSide,map:woodTexture}),dinghy);for(let i=0;i<7;i++){const y=-.38+i*.085,s=y<-.14?.38+(y+.44)/.3*.47:.85+(y+.14)/.37*.15,pts=hullProfile().map(([x,z])=>[x*1.5*s,y+hullRise(z)*(s*.8+.2),z*3]);pts.push(pts[0]);path(dinghy,pts,.012,'#988a66');}path(dinghy,[[0,-.437,-1.5],[0,-.451,-.7],[0,-.451,.3],[0,-.425,1.2],[0,-.385,1.72]],.042,'#947d56');
// A tiny harbour cat, sheltered in the shadow of the boat.
const cat=group(root,-7.45,slipHeight(-7.45)+.012,10.8),catTorso=group(cat);sphere(catTorso,0,.25,0,.24,'#b2a17b',.73,.82,1.6);sphere(catTorso,0,.27,.23,.17,'#cfc2a0',.82,.95,.8);const catHead=group(catTorso,0,.36,.35);sphere(catHead,0,0,0,.17,'#c3b18c',1,.9,.94);sphere(catHead,0,-.06,.125,.088,'#ded1ad',1,.64,.65);
for(let s of [-1,1]){const ear=mesh(new T.ConeGeometry(.084,.15,3),mat('#ac9874'),catHead,s*.105,.13,.005);ear.rotation.z=-s*.3;const inner=new T.BufferGeometry();inner.setAttribute('position',new T.Float32BufferAttribute([s*.06,.08,.057,s*.14,.08,.057,s*.12,.18,.04],3));inner.computeVertexNormals();mesh(inner,mat('#cfb299',{side:T.DoubleSide}),catHead);sphere(catHead,s*.073,.024,.142,.027,'#799675',1,.82,.45);sphere(catHead,s*.073,.024,.154,.008,'#3e6057',.65,1.8,.45);line(catHead,[[s*.02,.08,.145],[s*.04,.045,.157]],'#9b9471',.85);}
sphere(catHead,0,-.039,.179,.015,'#a88772',1,.7,.5);line(catHead,[[0,-.05,.177],[0,-.074,.179],[-.027,-.083,.167]],'#8d8b6c',.8);line(catHead,[[0,-.074,.179],[.027,-.083,.167]],'#8d8b6c',.8);
for(let z of [-.22,-.08,.08]){const w=.17*Math.sqrt(1-Math.pow(z/.39,2));path(catTorso,[[-w,.27,z],[-w*.75,.37,z-.015],[0,.44-Math.abs(z)*.15,z-.02],[w*.75,.37,z-.015],[w,.27,z]],.01,'#9a9470');}
const catTail=group(catTorso,0,.22,-.3);path(catTail,[[0,0,0],[.15,.03,-.2],[.25,.17,-.17],[.24,.25,-.09]],.045,'#aa9c76');path(catTail,[[.25,.17,-.17],[.24,.25,-.09]],.047,'#938e6b');
const catRoute=new T.CatmullRomCurve3([[-7.45,1.34,10.8],[-8.45,1.56,10.3],[-8.55,1.56,8.3],[-7.6,1.56,7.1],[-6.8,1.56,6.7]].map(a=>new T.Vector3(...a)),false,'catmullrom',.3);
const catLegs=[];for(let s of [-1,1])for(let z of [-.22,.22]){const leg=group(cat,s*.12,.24,z);beam(leg,[0,0,0],[0,-.2,.012],.043,'#b2a17b');sphere(leg,0,-.21,.042,.064,'#ded0a7',.8,.47,1.15);catLegs.push(leg);}
for(let s of [-1,1])for(let i=0;i<3;i++)line(catHead,[[s*.035,-.045-i*.012,.175],[s*(.2+i*.012),-.016-i*.04,.16]],'#e2d7b8',.8);
// Miniature hill and tiled-roof houses.
const treeCrowns=[];
function tree(p,x,y,z,s=1){const g=group(p,x,y,z);beam(g,[0,0,0],[.03,1.2*s,0],.08*s,'#8a9370');for(let j=0;j<5;j++){const a=j*2.4,r=.35*s;const crown=sphere(g,Math.cos(a)*r,(1.15+(j%2)*.33)*s,Math.sin(a)*r,.66*s,['#86ad82','#a3be8d','#75a47b','#91b584','#afc597'][j],1,1,1);treeCrowns.push(crown);}return g;}
function hillHeight(x,z){const q=Math.max(0,Math.min(1,(x+11.98)/.6,(-5.85-x)/1.6,(z+11.98)/.6,(-5.85-z)/2));return 1.44+1.58*q*q*(3-2*q);}
const hillVertices=[],hillColours=[],hillIndices=[],hillN=30;
for(let j=0;j<=hillN;j++)for(let i=0;i<=hillN;i++){const x=-11.98+i*6.13/hillN,z=-11.98+j*6.13/hillN,y=hillHeight(x,z);hillVertices.push(x,y,z);const c=new T.Color('#a5bc8d').lerp(new T.Color('#c1ce9d'),(y-1.44)/1.58*.55+Math.sin(i*2+j*3)*.035);hillColours.push(c.r,c.g,c.b);}
for(let j=0;j<hillN;j++)for(let i=0;i<hillN;i++){const a=j*(hillN+1)+i;hillIndices.push(a,a+hillN+1,a+1,a+1,a+hillN+1,a+hillN+2);}
const hillGeometry=new T.BufferGeometry();hillGeometry.setAttribute('position',new T.Float32BufferAttribute(hillVertices,3));hillGeometry.setAttribute('color',new T.Float32BufferAttribute(hillColours,3));hillGeometry.setIndex(hillIndices);hillGeometry.computeVertexNormals();mesh(hillGeometry,mat('#ffffff',{vertexColors:true}),root);
// Small stepping stones connect the village gardens to the harbour lane.
for(let i=0;i<15;i++){const x=-10.95+i*.31,z=-8.95+Math.max(0,i-9)*.27;box(root,x,hillHeight(x,z)+.025,z,.31,.055,.36,i%3?'#b9bda2':'#c4c7ab');}
function house(x,z,s=1,n=0){const g=group(root,x,3.045,z);g.scale.setScalar(s);const wall=['#e4ddbf','#e6dfc9','#dfd6bc'][n],roofColour=['#758b88','#7d9190','#8d9690'][n];
 box(g,0,.04,0,1.94,.08,2.02,'#9fae99');box(g,0,.93,0,1.8,1.78,1.9,wall);box(g,0,.22,.962,1.8,.32,.024,'#aa9d7e');box(g,.912,.22,0,.024,.32,1.9,'#aa9d7e');for(let y of [.1,.23,.36]){line(g,[[-.88,y,.982],[.88,y,.982]],'#8b9078',.55);line(g,[[.932,y,-.93],[.932,y,.93]],'#8b9078',.55);}
 gable(g,1.9,2,1.8,.55,wall);roof(g,2.15,2.15,1.8,.6,roofColour,true);
 for(let a of [-.5,.5]){box(g,a,1.01,.967,.55,.68,.035,'#8c9f90');box(g,a,1.01,.99,.46,.59,.012,'#729695');for(let xx of [-.24,0,.24])box(g,a+xx,1.01,1.006,.025,.63,.028,'#d1d1b4',false);for(let yy of [.72,1.02,1.31])box(g,a,yy,1.006,.5,.025,.028,'#d1d1b4',false);box(g,a,.68,1.02,.61,.055,.13,'#a49b7d');box(g,a,1.39,1.02,.69,.05,.22,roofColour);box(g,a-.33,1.02,.978,.11,.65,.03,'#a7a88b');for(let y=.76;y<1.31;y+=.075)box(g,a-.33,y,1.0,.1,.012,.012,'#89947b',false);}
 box(g,.922,.76,.21,.035,1.43,.64,'#998e70');for(let j=0;j<7;j++)box(g,.947,.76,-.06+j*.09,.016,1.34,.017,'#bdba9a',false);box(g,.947,.87,.24,.018,.025,.045,'#657e70');box(g,1.08,.075,.22,.34,.15,.83,'#bac0a7');box(g,1.06,1.53,.22,.43,.065,.86,roofColour);
 const nameplate=label(g,.96,1.2,.68,.18,.36,['浜田','森','小林'][n],'#d7d5b8','#6e8477',130);nameplate.rotation.y=PI/2;
 box(g,.924,1.1,-.59,.028,.48,.39,'#72908a');for(let zz of [-.78,-.59,-.4])box(g,.95,1.1,zz,.025,.5,.02,'#c6c9ad',false);box(g,.95,.86,-.59,.025,.02,.42,'#c6c9ad',false);box(g,.95,1.34,-.59,.025,.02,.42,'#c6c9ad',false);
 for(let side of [-1,1])beam(g,[side*1.17,1.79,-1.3],[side*1.17,1.79,1.3],.027,'#81998a');path(g,[[1.17,1.79,-1.22],[1.02,1.61,-1.03],[1.02,.15,-1.03]],.022,'#8b9d8c');
 box(g,-.66,.49,1.02,.37,.4,.19,'#ccd0b6');for(let j=0;j<5;j++)box(g,-.66,.36+j*.06,1.123,.29,.012,.012,'#9ba78d',false);path(g,[[-.8,.62,1.04],[-.84,.83,1.0],[-.84,1.43,1.0]],.012,'#a2ae92');
 box(g,1.03,.91,.87,.14,.22,.22,n===1?'#b38969':'#8a9f89');box(g,1.11,.94,.87,.012,.024,.14,'#627e70',false);plant(g,.48,.09,1.19,.35);plant(g,.79,.09,1.15,.27);
 box(g,.67,2.15,-.5,.25,.7,.3,'#a7af97');box(g,.67,2.52,-.5,.32,.07,.35,'#c5c7a8');return g;}
house(-9.7,-10.3,.85,0);house(-7.5,-9.9,.72,1);house(-10.35,-7.9,.68,2);
for(let a of [[-11.1,-10.8,1],[-10.9,-6.6,1],[-7,-11.1,.9],[-6.6,-8.8,.8],[-9,-7.3,.8],[-11.1,-8.6,.8],[-8.6,-11.1,.8]])tree(root,a[0],hillHeight(a[0],a[1]),a[1],a[2]);
// A low seawall leads to the red and ivory lantern.
box(root,3.4,1.61,-10.65,16,.4,1.1,'#c6cec0');box(root,3.5,1.88,-11,16.6,.24,.48,'#e2e0ca');
for(let x=-3;x<11;x+=1.4)box(root,x,1.62,-10.05,.03,.27,.015,'#a1b2a2',false);
const lighthouse=group(root,9.8,1.83,-10.2);cyl(lighthouse,0,.13,0,.93,.26,'#dddcc4',.93,24);cyl(lighthouse,0,.9,0,.67,1.3,'#f0edd6',.6,24);cyl(lighthouse,0,1.82,0,.6,.6,'#ce7460',.56,24);cyl(lighthouse,0,2.52,0,.56,.8,'#efead3',.5,24);cyl(lighthouse,0,3.02,0,.7,.14,'#b76852');
cyl(lighthouse,0,3.4,0,.44,.63,glass,.44,16);for(let i=0;i<6;i++){const a=i*TAU/6;beam(lighthouse,[Math.cos(a)*.44,3.07,Math.sin(a)*.44],[Math.cos(a)*.44,3.74,Math.sin(a)*.44],.025,'#697e70');}
const beacon=sphere(lighthouse,0,3.39,0,.16,new T.MeshBasicMaterial({color:'#ffe5a1'}));cyl(lighthouse,0,3.84,0,.66,.25,'#bb6951',.08,24);beam(lighthouse,[0,3.95,0],[0,4.28,0],.025,'#5a746c');
const beaconSweep=group(lighthouse,0,3.4,0);const beaconBeamMat=new T.MeshBasicMaterial({color:'#ffe6a5',transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false});for(let s of [-1,1]){const cone=mesh(new T.ConeGeometry(.85,4.8,24,1,true),beaconBeamMat,beaconSweep,s*2.4,0,0);cone.rotation.z=s*PI/2;cone.castShadow=false;}
torus(lighthouse,0,3.33,0,.83,.023,'#77897a',PI/2);torus(lighthouse,0,3.03,0,.84,.03,'#77897a',PI/2);for(let i=0;i<12;i++){const a=i*TAU/12;beam(lighthouse,[Math.cos(a)*.82,3.03,Math.sin(a)*.82],[Math.cos(a)*.82,3.35,Math.sin(a)*.82],.018,'#77897a');}
box(lighthouse,0,.7,.66,.4,.9,.025,'#78978e');label(lighthouse,0,1.03,.68,.25,.18,'汐風','#c8d5bd','#55796d',100);
// Far breakwater and mist, still part of the square model.
box(root,7,.6,-5.2,3.8,.4,.45,'#aac2b8');for(let x=5.3;x<8.9;x+=.8)box(root,x,.85,-5.2,.09,.1,.5,'#dae1cb');
// Tetrapods, not simple rocks: four concrete arms in a tetrahedron.
function tetrapod(x,y,z,s,ang){const g=group(root,x,y,z);g.rotation.set(range(-.3,.3),ang,range(-.4,.4));sphere(g,0,0,0,.21*s,'#c9d2c2');for(let v of [[0,.9,0],[.82,-.35,0],[-.41,-.35,.71],[-.41,-.35,-.71]]){const end=new T.Vector3(...v).multiplyScalar(s);const o=cyl(g,end.x*.55,end.y*.55,end.z*.55,.2*s,end.length()*.9,'#d2d7c6',.27*s,8);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.normalize());}return g;}
for(let i=0;i<12;i++)tetrapod(11.1+Math.sin(i*2)*.35,.3+Math.floor(i/5)*.25,-9.9+i*.24,.6+rand()*.25,rand()*TAU);
// Boats, interiors and all their small working objects.
const boats=[],flags=[];
function navigationScreen(p,x,y,z,type,phase){const m=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{uTime:weatherTime,uKind:{value:type},uPhase:{value:phase}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uKind;uniform float uPhase;void main(){vec2 q=(vUv-.5)*2.;vec3 col=vec3(.18,.38,.32);if(uKind<.5){float r=length(q);float rings=1.-smoothstep(.015,.035,abs(fract(r*3.)-.5));float axes=1.-smoothstep(.015,.04,min(abs(q.x),abs(q.y)));float angle=atan(q.y,q.x),sweep=mod(uTime*.55+uPhase-angle+6.2831,6.2831);float beam=exp(-sweep*2.8)*step(r,.96);float blip=exp(-length(q-vec2(.32,-.28))*48.)+exp(-length(q-vec2(-.4,.19))*55.);col+=vec3(.23,.42,.27)*(rings*.25+axes*.22+beam*.42+blip);}else{float bottom=.23+sin(vUv.x*9.+uTime*.16)*.08+sin(vUv.x*27.+uPhase)*.035;float trace=1.-smoothstep(.012,.03,abs(vUv.y-bottom));float grid=(1.-smoothstep(.01,.035,abs(fract(vUv.x*5.)-.5)))*.12+(1.-smoothstep(.01,.035,abs(fract(vUv.y*4.)-.5)))*.12;col+=vec3(.45,.42,.22)*(trace*.9+grid);}gl_FragColor=vec4(col+vec3(.12,.21,.14),1.);}`});const o=mesh(new T.PlaneGeometry(.19,.16),m,p,x,y,z);return o;}
const chartTexture=canvasTexture(512,384,(c,W,H)=>{c.fillStyle='#ece3bd';c.fillRect(0,0,W,H);c.strokeStyle='#b4c6ad';c.lineWidth=1;for(let x=0;x<W;x+=48){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}for(let y=0;y<H;y+=48){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}c.fillStyle='#b6c8a2';c.strokeStyle='#789f8e';c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.lineTo(190,0);c.lineTo(170,65);c.lineTo(220,90);c.lineTo(170,125);c.lineTo(150,200);c.lineTo(80,235);c.lineTo(130,300);c.lineTo(70,H);c.lineTo(0,H);c.closePath();c.fill();c.stroke();for(let i=0;i<4;i++){c.strokeStyle='#a2bda8';c.beginPath();c.ellipse(260,180,80+i*24,45+i*18,-.55,0,TAU);c.stroke();}c.fillStyle='#688d79';c.font="25px 'Yu Gothic','Microsoft YaHei'";c.fillText('汐風湾 海図',300,38);for(let i=0;i<6;i++)c.fillText((8+i*3).toString(),210+(i%2)*135,105+Math.floor(i/2)*74);c.strokeStyle='#bc946c';c.setLineDash([7,5]);c.beginPath();c.moveTo(170,220);c.lineTo(390,270);c.lineTo(445,120);c.stroke();c.setLineDash([]);c.fillStyle='#667c66';c.fillRect(480,320,18,40);});
const photoTexture=canvasTexture(256,160,(c,W,H)=>{c.fillStyle='#eeead6';c.fillRect(0,0,W,H);c.fillStyle='#a5c6be';c.fillRect(10,10,W-20,H-26);c.fillStyle='#739b99';c.fillRect(10,75,W-20,59);c.fillStyle='#d9dfcc';c.beginPath();c.ellipse(128,82,66,22,-.17,0,TAU);c.fill();c.beginPath();c.moveTo(70,83);c.lineTo(43,60);c.lineTo(48,106);c.closePath();c.fill();c.fillStyle='#4d7272';c.beginPath();c.arc(174,74,4,0,TAU);c.fill();c.font='12px sans-serif';c.fillText('08.17　大漁',100,153);});
function lifeRing(p,x,y,z,r=.25){const g=group(p,x,y,z);torus(g,0,0,0,r,.055,'#e8e5cd');for(let i=0;i<4;i++){const a=i*PI/2;const o=mesh(new T.TorusGeometry(r,.058,5,5,.48),mat('#da8963'),g);o.rotation.z=a-.24;}return g;}
function tyre(p,x,y,z,r=.24,angle=0){const g=torus(p,x,y,z,r,r*.24,'#405d59',0,angle);for(let i=0;i<12;i++){const a=i*TAU/12;const o=box(g,Math.cos(a)*r,Math.sin(a)*r,.04,.025,.08,.03,'#4a6760',false);o.rotation.z=a;}return g;}
function boat(x,z,angle,scale=1,cabin=true,name='汐風丸',kind='angling'){const g=group(root,x,.58,z);g.rotation.y=angle;g.scale.setScalar(scale);
 const fenders=[];
 const L=cabin?(kind==='working'?5.05:kind==='classic'?4.7:4.6):3.3,W=cabin?(kind==='angling'?1.98:1.83):1.4;
 mesh(hullGeometry(L,W),mat('#eeeedd',{side:T.DoubleSide}),g,0,0,0,true);
 const hullBottom=mesh(hullGeometry(L*.96,W*.94),mat('#698f8c',{side:T.DoubleSide}),g,0,-.12,0);hullBottom.scale.y=.57;
 const deckShape=new T.Shape();hullProfile().forEach(([a,b],i)=>i?deckShape.lineTo(a*W*.92,-b*L*.92):deckShape.moveTo(a*W*.92,-b*L*.92));deckShape.closePath();
 const deck=mesh(new T.ShapeGeometry(deckShape),mat('#bcc8ae',{side:T.DoubleSide}),g,0,.22,0);deck.rotation.x=-PI/2;
 path(g,hullRail(L,W,.27),.045,'#e7ead7');beam(g,[-W*.36,.295,-L*.5],[W*.36,.295,-L*.5],.045,'#e7ead7');
 // Blue painted rubbing strake and short rust runs.
 path(g,hullRail(L,W,.075,1.01),.035,kind==='classic'?'#849c9b':kind==='working'?'#527f91':'#618e95');
 for(let s of [-1,1]){for(let zz of [-1.3,.7]){const tire=tyre(g,s*W*.5,.1,zz,.23,PI/2);fenders.push({o:tire,x:s*W*.5,phase:zz+s});path(g,[[s*W*.46,.33,zz],[s*W*.54,.2,zz],[s*W*.54,.08,zz]],.018,'#aa9068');}for(let zz of [-.8,.9])box(g,s*W*.503,-.035,zz,.012,.15,.055,'#b29a75',false);}
 const nm=label(g,W*.5,.02,.05,1.25,.19,name,'#eeeedd','#648a88',85);nm.rotation.y=PI/2;
 // Railings along raised bow.
 for(let s of [-1,1]){for(let zz of [.9,1.5])beam(g,[s*W*(zz>1?.34:.46),.31,zz],[s*W*(zz>1?.34:.46),.84,zz],.018,'#93aaa1');path(g,[[s*W*.47,.84,.7],[s*W*.35,.84,1.5],[0,.85,L*.55]],.018,'#9daea0');}
 box(g,0,.35,1.15,.56,.15,.6,'#dfe5cb');cyl(g,0,.47,1.15,.12,.1,'#78958a');
 if(cabin){
  const cb=group(g,0,.26,kind==='working'?.02:-.35);
  box(cb,0,.06,0,1.38,.12,1.75,'#a9bbaa');box(cb,0,.38,-.77,1.4,.7,.08,'#ecebd3');
  box(cb,-.65,.46,0,.08,.83,1.7,'#e9e8cf');box(cb,.65,.27,.43,.08,.42,.74,'#e9e8cf');
  // Thin frames and generous clear glazing; starboard doorway left open.
  for(let xx of [-.65,.65])for(let zz of [-.8,.8]){if(kind==='classic'&&zz>0)beam(cb,[xx,.08,.8],[xx,1.84,.58],.033,'#e8e7cc');else box(cb,xx,.95,zz,.065,1.8,.065,'#e8e7cc');}
  box(cb,0,.58,.79,1.37,.86,.07,'#e8e9d1');const windscreen=box(cb,0,1.38,kind==='classic'?.715:.8,1.25,.65,.018,glass,false),divider=box(cb,0,1.38,kind==='classic'?.73:.82,.045,.7,.025,'#869d91');if(kind==='classic'){windscreen.rotation.x=-.22;divider.rotation.x=-.22;}
  box(cb,-.66,1.36,0,.015,.66,1.55,glass,false);box(cb,.66,1.39,.42,.015,.7,.68,glass,false);box(cb,.66,.94,.05,.05,1.7,.055,'#e4e5cc');
  // A full-height open doorway, with the glazed door folded against the forward side.
  box(cb,.72,.09,-.38,.24,.08,.7,'#a6b9a8');box(cb,0,1.6,-.79,1.3,.055,.055,'#bac6ae');box(cb,0,1.19,-.805,1.24,.76,.012,glass,false);
  const door=group(cb,.69,.08,.05);door.rotation.y=-2.86;
  box(door,0,.43,-.34,.035,.78,.68,'#e6e7d0');box(door,0,1.27,-.34,.012,.77,.62,glass,false);
  for(let z of [-.68,0])box(door,0,.85,z,.045,1.68,.035,'#d7dfc9');for(let y of [.04,.83,1.67])box(door,0,y,-.34,.045,.035,.7,'#d7dfc9');
  beam(door,[.035,.9,-.52],[.035,1.04,-.52],.014,'#789389');for(let y of [.3,1.37])cyl(door,0,y,0,.028,.11,'#8fa79a');
  box(cb,0,1.83,0,1.62,.13,2.03,'#e8ead5');box(cb,0,1.91,0,1.69,.06,2.1,kind==='working'?'#668d98':kind==='classic'?'#8ba6a0':'#779e96');
  // Navigation console and a visible spoked wheel.
  box(cb,0,.71,.5,1.08,.3,.4,'#79998b');const wheel=torus(cb,.24,.98,.3,.17,.022,'#695f45',-.3);for(let i=0;i<5;i++){const a=i*TAU/5;beam(wheel,[0,0,0],[Math.cos(a)*.16,Math.sin(a)*.16,0],.009,'#7d7955');}
  for(let [i,xx] of [-.34,-.04].entries()){box(cb,xx,.98,.56,.24,.24,.07,'#476d61');navigationScreen(cb,xx,.99,.518,i,boats.length*.7);for(let j=0;j<3;j++)sphere(cb,xx-.06+j*.06,.89,.515,.013,j===2?'#d9bd70':'#aac1a5');}
  // Sea chart, tidal table, thermos, enamel cup.
  const chart=mesh(new T.PlaneGeometry(.42,.3),new T.MeshBasicMaterial({map:chartTexture,side:T.DoubleSide}),cb,-.29,.88,.36);chart.rotation.x=-PI/2;box(cb,-.29,.886,.49,.09,.009,.025,'#829783',false);
  const tide=label(cb,.36,.88,.47,.15,.22,'潮汐\n06:42\n18:56','#e8dfbd','#789582',125);tide.rotation.x=-PI/2;
  box(cb,-.4,.79,-.27,.52,.06,.56,'#bbbea0');for(let z of [-.47,-.07])beam(cb,[-.62,.52,z],[-.18,.765,z],.015,'#829b88');
  cyl(cb,-.48,.965,-.24,.055,.28,'#babda4');cyl(cb,-.48,1.12,-.24,.058,.035,'#6f8d7c');torus(cb,-.48,.87,-.24,.055,.006,'#d3d4b7',PI/2);path(cb,[[-.54,1.05,-.24],[-.59,1.04,-.24],[-.59,.91,-.24],[-.54,.9,-.24]],.009,'#8a9e8b');
  cyl(cb,-.25,.89,-.28,.065,.13,'#f2e6bf');torus(cb,-.17,.9,-.28,.046,.012,'#e5dfb9',0,PI/2);cyl(cb,-.25,.958,-.28,.052,.004,'#737c61');torus(cb,-.25,.96,-.28,.06,.009,'#819d91',PI/2);
  box(cb,0,.45,-.35,.48,.12,.46,'#789784');box(cb,0,.67,-.55,.45,.45,.09,'#749583');beam(cb,[0,.14,-.35],[0,.43,-.35],.05,'#819681');
  // Yellow raincoat hung on aft wall, photograph and omamori.
  box(cb,-.25,.94,-.72,.33,.6,.06,'#ddbc58');for(let s of [-1,1]){const sl=box(cb,-.25+s*.22,1.03,-.72,.13,.4,.06,'#ddbc58');sl.rotation.z=s*.38;}sphere(cb,-.25,1.28,-.73,.15,'#dfc265',.8,.7,.35);
  line(cb,[[-.25,.69,-.682],[-.25,1.16,-.682]],'#bb9c4c',.7);for(let i=0;i<4;i++)sphere(cb,-.22,.8+i*.09,-.68,.011,'#e7d7a1');path(cb,[[-.25,1.4,-.75],[-.25,1.52,-.75],[-.15,1.54,-.75]],.008,'#a8ad87');
  mesh(new T.PlaneGeometry(.23,.16),new T.MeshBasicMaterial({map:photoTexture,side:T.DoubleSide}),cb,.38,1.36,-.722);box(cb,.54,1.44,.78,.09,.17,.03,'#be8f5c');path(cb,[[.54,1.54,.78],[.54,1.72,.78]],.006,'#d1c094');
  beam(g,[0,2.17,-.35],[0,3.15,-.35],.027,'#93a99c');beam(g,[0,2.75,-.85],[0,2.75,.3],.018,'#819e91');cyl(g,.36,2.28,-.61,.22,.15,'#e4e8d0',.19);beam(g,[.58,2.14,-.9],[.64,3.1,-1.02],.012,'#69877e');
  const lr=lifeRing(g,.77,1.15,-.38,.26);lr.rotation.y=PI/2;
  // A simple canvas sun frame over the working stern.
  for(let ss of [-1,1])beam(g,[ss*.7,.35,-1.68],[ss*.7,1.71,-1.68],.019,'#809d92');beam(g,[-.7,1.71,-1.68],[.7,1.71,-1.68],.018,'#809d92');
  crate(g,-.38,.26,-1.4,'#e3e7d0',.6);crate(g,.3,.26,-1.4,'#9eb7ab',.6);
  shaft(cb,.61,1.67,-.3,1.4,.27,-.84,.45,'z');causticPatch(cb,0,1.755,0,1.3,1.64);causticPatch(cb,-.602,.63,.02,1.3,.46,0,PI/2);
 }else{for(let zz of [-.8,.25])box(g,0,.43,zz,W*.82,.1,.27,'#b3aa85');crate(g,0,.26,-.32,'#dce2c9',.55);beam(g,[-.5,.5,-1],[.6,.5,.9],.028,'#a0956e');}
 if(!cabin){box(g,0,.5,-L*.47,.42,.54,.32,'#6a8580');box(g,0,.83,-L*.47,.51,.18,.38,'#92a79a');box(g,0,.31,-.65,.3,.25,.23,'#b78662');}
 const item={g,x,z,angle,scale,cabin,kind,L,W,fenders,phase:rand()*TAU};boats.push(item);return item;
}
const mainBoat=boat(-2.7,1.6,PI,1,true,'第八 汐風丸','angling');const rearBoat=boat(-2.6,-4.7,PI,1.03,true,'しおさい','working');boat(-2.05,8.7,-.25,.85,false,'なつかぜ','skiff');const outing=boat(4.1,-2.7,PI,.95,true,'白波丸','classic');
// Canvas awning, working light and extra rigging distinguish the boats.
box(mainBoat.g,0,1.73,-1.53,1.56,.045,.73,'#d9d8b3');for(let side of [-1,1]){beam(mainBoat.g,[side*.74,.32,-1.89],[side*.74,1.73,-1.89],.017,'#93aaa0');const holder=cyl(mainBoat.g,side*.84,.51,-1.72,.045,.32,'#8a9f96');holder.rotation.x=.45;path(mainBoat.g,[[side*.84,.59,-1.72],[side*1.0,1.45,-2.01],[side*1.13,2.51,-2.32]],.013,'#526b69');path(mainBoat.g,[[side*1.13,2.51,-2.32],[side*1.13,1.1,-2.33]],.004,'#b5bda0');torus(mainBoat.g,side*.86,.72,-1.76,.055,.013,'#b7b89a',0,PI/2);}
beam(rearBoat.g,[0,2.2,-.35],[0,3.65,-.35],.018,'#7e9889');
path(rearBoat.g,[[-.65,1.73,-1.68],[0,3.5,-.35],[.65,1.73,-1.68]],.008,'#a5b5a2');
for(let side of [-1,1])beam(rearBoat.g,[side*.78,.28,-2.15],[side*.78,2.46,-1.83],.035,'#8ba5a0');beam(rearBoat.g,[-.8,2.46,-1.83],[.8,2.46,-1.83],.04,'#8ba5a0');
for(let xx of [-.4,.4]){torus(rearBoat.g,xx,2.34,-1.83,.085,.025,'#7c8f7c');path(rearBoat.g,[[xx,2.31,-1.82],[xx,1.23,-1.82],[xx+.08,1.16,-1.82],[xx+.14,1.28,-1.82]],.011,'#8b8365');}
for(let j=0;j<8;j++){const net=torus(rearBoat.g,-.17+Math.sin(j)*.15,.38+j*.025,-1.84,.28-j*.018,.018,j%2?'#729985':'#86ab94',PI/2);net.scale.z=.7;}
for(let j=0;j<5;j++)box(outing.g,0,.4,-1.51+j*.105,1.15,.06,.09,benchWood);for(let side of [-1,1])beam(outing.g,[side*.49,.24,-1.6],[side*.49,.4,-1.6],.023,'#a4b4a2');
sphere(outing.g,.36,2.36,-.61,.2,'#eceedd',1,.7,1);sphere(outing.g,.73,2.15,.31,.042,new T.MeshBasicMaterial({color:'#ce8b6c'}));sphere(outing.g,-.73,2.15,.31,.042,new T.MeshBasicMaterial({color:'#8bb690'}));
const skiff=boats[2].g;for(let i=0;i<6;i++)box(skiff,-.4+i*.16,.235,-.18,.13,.018,1.7,benchWood,false);box(skiff,-.3,.42,-1.15,.24,.3,.25,'#c18c66');path(skiff,[[-.38,.58,-1.15],[-.38,.68,-1.15],[-.2,.68,-1.15],[-.2,.58,-1.15]],.018,'#aa805d');
const boatFlag=mesh(new T.PlaneGeometry(.37,.2,8,3),mat('#d7b266',{side:T.DoubleSide}),rearBoat.g,.2,3.43,-.35);flags.push(boatFlag);
const tripRoute=new T.CatmullRomCurve3([[4.1,.58,-2.7],[3.4,.58,-4.5],[3.8,.58,-6.1],[5.3,.58,-7],[8.2,.58,-7],[9.8,.58,-5.9],[10.1,.58,-3.8],[8.7,.58,-1.2],[6,.58,-.5],[4.6,.58,-1.2]].map(v=>new T.Vector3(...v)),true,'catmullrom',.35);
// Mooring ropes, with restrained sag.
const mooring=[];
const fibreTexture=canvasTexture(256,64,(c,W,H)=>{c.fillStyle='#e1c998';c.fillRect(0,0,W,H);for(let i=-H;i<W+H;i+=13){c.strokeStyle=i%2?'#a18c60':'#bea875';c.lineWidth=3;c.beginPath();c.moveTo(i,0);c.lineTo(i+H,H);c.stroke();c.strokeStyle='#ecd7ab';c.lineWidth=1;c.beginPath();c.moveTo(i+5,0);c.lineTo(i+H+5,H);c.stroke();}});fibreTexture.wrapS=fibreTexture.wrapT=T.RepeatWrapping;fibreTexture.repeat.set(18,2);
const mooringMaterial=mat('#bd8557',{map:fibreTexture});
function attachMooring(b,anchor,local){const a=new T.Vector3(...anchor),l=new T.Vector3(...local);b.g.updateWorldMatrix(true,false);const end=l.clone().applyMatrix4(b.g.matrixWorld);const curve=new T.CatmullRomCurve3([a,a.clone().lerp(end,.5).add(new T.Vector3(0,-.22,0)),end]);const o=mesh(new T.TubeGeometry(curve,28,.026,6,false),mooringMaterial,root);mooring.push({o,b,a,l});const c=group(b.g,...local);box(c,0,.005,0,.14,.025,.33,'#7f998a');for(let z of [-.09,.09])cyl(c,0,.06,z,.027,.09,'#66887e');beam(c,[0,.105,-.17],[0,.105,.17],.024,'#6b8d80');return o;}
attachMooring(mainBoat,[-4.93,1.73,3.3],[.83,.3,-1.62]);attachMooring(rearBoat,[-4.93,1.73,-2],[.83,.3,-1.62]);attachMooring(boats[2],[-4.93,1.73,8.8],[-.62,.3,-.85]);
const outingRope=attachMooring(outing,[4.7,1.73,-8.98],[0,.32,2.35]);
path(root,[[-4.94,1.68,8.78],[-4.62,.4,8.85],[-4.57,-.25,8.92]],.026,'#927b51');path(root,[[-4.57,.38,8.92],[-4.57,-.35,8.97],[-4.51,-.42,8.82]],.026,'#667451');
for(let j=0;j<5;j++){const o=torus(root,-5.75+j*.02,1.48+j*.014,-1.9,.18+j*.025,.021,'#be8c61',PI/2);o.rotation.z=j*.2;}
path(root,[[-5.45,1.49,-1.9],[-5.4,1.48,-1.4],[-5.7,1.48,-1.28]],.021,'#be8c61');
// Buoys and their faded numbers.
const buoys=[];
for(let [x,z,n] of [[2,5.8,'03'],[10,3.5,'07'],[6.9,9.2,'12']]){const g=group(root,x,.42,z);sphere(g,0,0,0,.24,'#d8996c',1,.75,1);cyl(g,0,.12,0,.18,.15,'#e8dcab');torus(g,0,.25,0,.055,.012,'#7c957e');label(g,0,.12,.185,.21,.12,n,'#e0c997','#6e8b79',160);buoys.push({g,x,z});}
// Crisp fragmented boat reflections; their strips slowly shear with waves.
const reflections=[];
for(let b of boats){const rg=group(root,b.x,.435,b.z);rg.rotation.y=b.angle;b.reflection=rg;for(let j=0;j<28;j++){const zz=-2.15+j*.16;const w=Math.max(.2,1.7-Math.abs(zz)*.5)*range(.65,1.2);const o=mesh(new T.PlaneGeometry(w,.11),new T.MeshBasicMaterial({color:j%5===0?'#e5efdc':j%3===0?'#3d797b':'#5d9e97',transparent:true,opacity:j%5===0?.5:.3,depthWrite:false,side:T.DoubleSide}),rg,.2+range(-.18,.18),0,zz);o.rotation.x=-PI/2;reflections.push({o,x:o.position.x,z:o.position.z,phase:rand()*TAU});}}
for(let i=0;i<100;i++){const x=range(-3.8,11.8),z=range(-7.6,11.8);const o=mesh(new T.PlaneGeometry(range(.05,.4),range(.012,.045)),new T.MeshBasicMaterial({color:i%3?'#cdebd0':'#f4f1cc',transparent:true,opacity:range(.2,.8),depthWrite:false}),root,x,.413,z);o.rotation.x=-PI/2;reflections.push({o,x,z,phase:rand()*TAU,glint:true});}
// Delicate concentric rain circles and tetrapod foam.
const ripples=[];
for(let i=0;i<54;i++){const x=range(-4.2,11.7),z=range(-7.5,11.7);const o=torus(root,x,.425,z,.12,.007,new T.MeshBasicMaterial({color:'#d6edcf',transparent:true,opacity:.35,depthWrite:false}),PI/2);o.castShadow=false;ripples.push({o,x,z,phase:rand(),rate:range(.3,.6)});}
for(let p of puddles)for(let i=0;i<3;i++){const o=torus(root,p.x+range(-p.rx*.5,p.rx*.5),1.462,p.z,.09,.004,new T.MeshBasicMaterial({color:'#e5e8ca',transparent:true,opacity:.5,depthWrite:false}),PI/2);o.castShadow=false;ripples.push({o,phase:rand(),rate:.4});}
for(let i=0;i<3;i++){const o=torus(wh,.2+i*.4,.155,.3,.06,.003,new T.MeshBasicMaterial({color:'#e5e8cc',transparent:true,opacity:.35,depthWrite:false}),PI/2);o.castShadow=false;ripples.push({o,phase:i*.3,rate:.3});}
const foams=[];
for(let i=0;i<26;i++){const o=mesh(new T.PlaneGeometry(range(.15,.6),.045),new T.MeshBasicMaterial({color:'#eaf2d9',transparent:true,opacity:.55,depthWrite:false}),root,10.4+range(-.3,.9),.43,-8.7+range(-.8,3));o.rotation.x=-PI/2;foams.push(o);}
for(let i=0;i<45;i++){const o=mesh(new T.PlaneGeometry(.025,range(.12,.35)),new T.MeshBasicMaterial({color:'#d9ead0',transparent:true,opacity:.45,depthWrite:false}),root,-4.5,.43,-8.2+i*.45);o.rotation.x=-PI/2;foams.push(o);}
// A thin, painted bank of sea mist behind the outer breakwater.
const mist=[];const mistTex=canvasTexture(512,64,(c,W,H)=>{for(let j=0;j<4;j++){c.fillStyle=`rgba(231,242,229,${.07-j*.012})`;c.beginPath();c.ellipse(W*.5,H*.6,W*(.47-j*.025),H*(.4-j*.06),0,0,TAU);c.fill();}});
for(let i=0;i<3;i++){const m=mesh(new T.PlaneGeometry(5,.47),new T.MeshBasicMaterial({map:mistTex,transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide}),root,6+i*.9,.85+i*.12,-7.9+i*.4);m.userData.startX=m.position.x;mist.push(m);}
// Wind sock, fabric flags.
function flag(x,z,h){const g=group(root,x,1.45,z);beam(g,[0,0,0],[0,h,0],.024,'#789286');const geo=new T.PlaneGeometry(.72,.36,10,4);const o=mesh(geo,mat('#dbb968',{side:T.DoubleSide}),g,.37,h-.3,0);flags.push(o);}
flag(-8.65,11.4,3.7);flag(7.4,-10.6,3.8);
const sock=group(root,-6.5,4.9,-7.3),sockSegments=[];beam(root,[-6.5,1.45,-7.3],[-6.5,5,-7.3],.03,'#859b89');torus(sock,0,0,0,.19,.012,'#a4b49b',0,PI/2);for(let i=0;i<6;i++){const o=cyl(sock,.11+i*.17,-.015*i,0,.19-i*.021,.18,i%2?'#eee3c2':'#d18a66',.17-i*.021,12);o.rotation.z=PI/2;sockSegments.push(o);}
// A flock of sea gulls, the wings stay thin and graphic.
const gulls=[];
function gull(x,y,z,i){const g=group(root,x,y,z);sphere(g,0,0,0,.085,'#f1f0d5',.6,.7,1.8);sphere(g,0,.06,.12,.065,'#f5f1d9');for(let s of [-1,1]){sphere(g,s*.052,.077,.143,.009,'#4f7469');beam(g,[s*.025,-.035,.01],[s*.025,-.09,.022],.007,'#bb9b66');beam(g,[s*.025,-.09,.022],[s*.025,-.09,.062],.009,'#bb9b66');}const beak=mesh(new T.ConeGeometry(.025,.1,5),mat('#d4b76c'),g,0,.05,.22);beak.rotation.x=PI/2;const tail=mesh(new T.ConeGeometry(.067,.17,3),mat('#d9dfc8'),g,0,-.005,-.18);tail.rotation.x=-PI/2;const wings=[];for(let s of [-1,1]){const w=group(g,0,.015,0);const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute([0,0,0,s*.25,.06,-.03,s*.59,-.01,-.15,0,0,-.05,s*.59,-.01,-.15,s*.27,-.035,-.14],3));geom.computeVertexNormals();mesh(geom,mat('#f4f0d4',{side:T.DoubleSide}),w);line(w,[[s*.42,.015,-.1],[s*.59,-.01,-.15]],'#81968b',.7);wings.push(w);}gulls.push({g,wings,x,y,z,phase:i*1.7,perched:i>4});}
gull(-.8,7,-1,0);gull(4.3,7.6,2.5,1);gull(6.8,6.3,-5,2);gull(1,5.2,7,3);gull(-2,8,-6,4);gull(-4.93,2.06,3.3,5);gull(-2.65,3.05,1.7,6);
// The fine warm rain is actual world-space line geometry.
const rainCount=660,rainData=new Float32Array(rainCount*6),rainSeed=[];
for(let i=0;i<rainCount;i++)rainSeed.push([range(-12,12),range(0,11),range(-12,12),range(.1,.24)]);
const rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainData,3));
const rainMat=new T.LineBasicMaterial({color:'#f4e5b9',transparent:true,opacity:.44,depthWrite:false});const rain=new T.LineSegments(rainGeo,rainMat);root.add(rain);
// Fine water droplets along umbrella edge and cabin roofs.
const drops=[];
for(let i=0;i<12;i++){const a=i*TAU/12;const g=sphere(umbrella,Math.cos(a)*.87,.37,Math.sin(a)*.87,.016,new T.MeshBasicMaterial({color:'#f7f1cc'}),1,1.7,1);drops.push({o:g,y:.37,phase:i*.4});}
const fallingDrops=[];for(let i=0;i<8;i++){const o=sphere(root,0,0,0,.018,new T.MeshBasicMaterial({color:'#f6f0ca'}),.75,1.7,.75);o.castShadow=false;const a=(i-1)*.8,local=i<3?new T.Vector3(Math.cos(a)*.87,.38,Math.sin(a)*.87):i<6?new T.Vector3(.865,2.19,.62):new T.Vector3(.85,5.6,0);const impactRing=torus(root,0,0,0,.08,.004,new T.MeshBasicMaterial({color:'#e4ebcb',transparent:true,opacity:0,depthWrite:false}),PI/2);const splash=group(root);for(let j=0;j<5;j++){const a=j*TAU/5;line(splash,[[Math.cos(a)*.025,0,Math.sin(a)*.025],[Math.cos(a)*.07,.075,Math.sin(a)*.07]],'#e6edd0',.42);}fallingDrops.push({o,ring:impactRing,splash,source:i<3?umbrella:i<6?boats[[0,1,3][i-3]].g:lamps[i-6],local,phase:i*.47,period:3.3+i*.27});}
// Almost invisible painted rainbow, appears only during the lull.
const rainbow=group(root,5.9,2,-6.3);const rainbowMats=[];
for(let j=0;j<5;j++){const pts=[];for(let i=0;i<=80;i++){const a=.08+PI*.94*i/80;pts.push([Math.cos(a)*(3+j*.045),Math.sin(a)*(3+j*.045),0]);}const m=new T.MeshBasicMaterial({color:['#d5a1a0','#e4c095','#e9dbb1','#a7c6a0','#a3becb'][j],transparent:true,opacity:0,depthWrite:false});path(rainbow,pts,.022,m);rainbowMats.push(m);}
// A distant boat moving quietly along the breakwater.
const distant=group(root);const dh=mesh(hullGeometry(1.1,.38),mat('#d6e0cd'),distant);box(distant,0,.28,-.05,.3,.28,.4,'#d9e0cc');beam(distant,[0,.4,0],[0,.8,0],.012,'#8caa99');
const wake=[];
for(let i=0;i<24;i++){const o=mesh(new T.PlaneGeometry(.12+.025*i,.035),new T.MeshBasicMaterial({color:'#e7ecd0',transparent:true,opacity:.55,depthWrite:false}),root);o.rotation.x=-PI/2;wake.push(o);}
const wakeVertices=new Float32Array(33*4*3),wakeIndices=[];
for(let side=0;side<2;side++)for(let i=0;i<32;i++){let k=side*66+i*2;wakeIndices.push(k,k+1,k+2,k+1,k+3,k+2);}
const wakeGeometry=new T.BufferGeometry();wakeGeometry.setAttribute('position',new T.BufferAttribute(wakeVertices,3));wakeGeometry.setIndex(wakeIndices);
const wakeRibbon=mesh(wakeGeometry,new T.MeshBasicMaterial({color:'#e6f3db',transparent:true,opacity:.56,side:T.DoubleSide,depthWrite:false}),root);wakeRibbon.frustumCulled=false;
// Actual reflected geometry is reduced to three painted colour bands by the surface shaders.
// Separate mirror heights keep the quay puddles and the harbour surface spatially coherent.
const reflectionCamera=new T.PerspectiveCamera();reflectionCamera.layers.set(1);
const mirrorClip=new T.Plane(new T.Vector3(0,1,0),-.4),mirrorLook=new T.Vector3(),mirrorBias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
const seaTarget=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,format:T.RGBAFormat,depthBuffer:true});
const quayTarget=seaTarget.clone();seaMirror.texture.value=seaTarget.texture;quayMirror.texture.value=quayTarget.texture;
root.updateMatrixWorld(true);
root.traverse(o=>{if(!o.isMesh||o.material.transparent)return;const bounds=new T.Box3().setFromObject(o);if(bounds.max.y>.44){o.layers.enable(1);for(let child of o.children)child.layers.enable(1);}});
function reflectionSize(){const scale=Math.min(1,1600/innerWidth,1100/innerHeight);const w=Math.max(1,Math.round(innerWidth*scale)),h=Math.max(1,Math.round(innerHeight*scale));seaTarget.setSize(w,h);quayTarget.setSize(w,h);seaMirror.texel.value.set(1/w,1/h);}
reflectionSize();
function reflectAt(height,target,uniform){
 camera.getWorldDirection(mirrorLook);mirrorLook.add(camera.position);mirrorLook.y=height*2-mirrorLook.y;
 reflectionCamera.position.copy(camera.position);reflectionCamera.position.y=height*2-camera.position.y;
 reflectionCamera.up.set(0,-1,0);reflectionCamera.lookAt(mirrorLook);reflectionCamera.projectionMatrix.copy(camera.projectionMatrix);reflectionCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);reflectionCamera.updateMatrixWorld();
 uniform.matrix.value.copy(mirrorBias).multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);
 mirrorClip.constant=-height-.025;renderer.clippingPlanes=[mirrorClip];renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,reflectionCamera);
}
function renderFrame(){
 const oldBackground=scene.background,oldTarget=renderer.getRenderTarget(),oldAlpha=renderer.getClearAlpha(),oldClips=renderer.clippingPlanes;
 scene.background=null;renderer.setClearAlpha(0);
 reflectAt(.38,seaTarget,seaMirror);reflectAt(1.455,quayTarget,quayMirror);
 renderer.clippingPlanes=oldClips;renderer.setRenderTarget(oldTarget);renderer.setClearAlpha(oldAlpha);scene.background=oldBackground;renderer.render(scene,camera);
}
// Mouse orbit, pan and zoom, without interface elements.
const view={az:.85,el:.57,distance:44.8,target:new T.Vector3(0,-2.5,0)};
let pointer=null,exportState=null,liveTime=0,lastStamp=performance.now(),nearFactor=0;
function setCamera(){camera.position.set(view.target.x+Math.sin(view.az)*Math.cos(view.el)*view.distance,view.target.y+Math.sin(view.el)*view.distance,view.target.z+Math.cos(view.az)*Math.cos(view.el)*view.distance);camera.lookAt(view.target);camera.updateMatrixWorld();}
const pickSurfaces=[],pickRay=new T.Raycaster(),pickPoint=new T.Vector2();root.traverse(o=>{if(o.isMesh&&!o.material.transparent)pickSurfaces.push(o);});
const cvs=renderer.domElement;
cvs.addEventListener('contextmenu',e=>e.preventDefault());
cvs.addEventListener('pointerdown',e=>{if(exportState)return;pointer={x:e.clientX,y:e.clientY,button:e.button,shift:e.shiftKey};cvs.setPointerCapture(e.pointerId);});
cvs.addEventListener('pointermove',e=>{if(!pointer||exportState)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(pointer.button!==0||pointer.shift){const f=view.distance*.0011;view.target.x-=Math.cos(view.az)*dx*f;view.target.z+=Math.sin(view.az)*dx*f;view.target.y+=dy*f;}else{view.az-=dx*.005;view.el=Math.max(.12,Math.min(1.35,view.el+dy*.004));}pointer.x=e.clientX;pointer.y=e.clientY;});
cvs.addEventListener('pointerup',()=>pointer=null);cvs.addEventListener('pointercancel',()=>pointer=null);
cvs.addEventListener('wheel',e=>{e.preventDefault();if(exportState)return;const next=Math.max(5,Math.min(75,view.distance*Math.exp(e.deltaY*.001)));if(next<view.distance){setCamera();scene.updateMatrixWorld(true);pickPoint.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);pickRay.setFromCamera(pickPoint,camera);const hits=pickRay.intersectObjects(pickSurfaces,false);let p=hits.length?hits[0].point:pickRay.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-.38),new T.Vector3());if(p&&Math.abs(p.x)<12.1&&Math.abs(p.z)<12.1)view.target.lerp(p,1-next/view.distance);}view.distance=next;},{passive:false});
cvs.addEventListener('dblclick',()=>{if(exportState)return;overviewCamera();});
function resize(){const atHome=Math.abs(view.az-.85)<.001&&Math.abs(view.el-.57)<.001&&view.target.distanceTo(new T.Vector3(0,-2.5,0))<.01;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);reflectionSize();if(!exportState&&atHome)overviewCamera();}addEventListener('resize',resize);
function smooth(a,b,t){const q=Math.max(0,Math.min(1,t));return a+(b-a)*q*q*(3-2*q);}
function voyageProgress(q){const e=.12;if(q<e)return(q*.5-e/(2*PI)*Math.sin(PI*q/e))/(1-e);if(q>1-e)return 1-voyageProgress(1-q);return(q-e*.5)/(1-e);}
function update(t){
 waterUniforms.uTime.value=t;
 weatherTime.value=t;
 const cycle=t%100,lull=cycle>4&&cycle<12?Math.sin((cycle-4)/8*PI):0;
 const weather=Math.max(.07,.67+.12*Math.sin(t*.17)-lull*.62),gust=cycle>52&&cycle<64?Math.pow(Math.sin((cycle-52)/12*PI),2):0;
 const cloud=cycle>74&&cycle<83?Math.pow(Math.sin((cycle-74)/9*PI),2):0;
 sun.intensity=2.35+.08*Math.sin(t*.08+.7)-cloud*.75;hemi.intensity=1.7-cloud*.12;
 rainMat.opacity=.25+weather*.22;
 rainGeo.setDrawRange(0,Math.floor(400+weather*260)*2);
 for(let i=0;i<rainCount;i++){const [x,y,z,l]=rainSeed[i];const yy=((y-t*(3.5+weather*.6))%11+11)%11;const xx=x+(11-yy)*(.12+gust*.13);let j=i*6;rainData[j]=xx;rainData[j+1]=yy;rainData[j+2]=z;rainData[j+3]=xx+.05+gust*.04;rainData[j+4]=yy-l;rainData[j+5]=z+.018;}
 rainGeo.attributes.position.needsUpdate=true;
 for(let [i,b] of boats.entries()){const wave=Math.sin(t*.75+i*1.3);b.g.position.y=.58+wave*.033;b.g.rotation.z=Math.sin(t*.65+i)*.013;b.g.rotation.x=Math.cos(t*.58+i)*.012;}
 // One quiet excursion per cycle, leaving enough time for all the other small events.
 let trip=cycle>12&&cycle<48?(cycle-12)/36:0;
 if(trip){const progress=voyageProgress(trip);const pos=tripRoute.getPointAt(progress),dir=tripRoute.getTangentAt(progress);outing.g.position.x=pos.x;outing.g.position.z=pos.z;outing.g.rotation.y=Math.atan2(dir.x,dir.z);}
 else{outing.g.position.x=outing.x;outing.g.position.z=outing.z;outing.g.rotation.y=outing.angle;}
 outingRope.visible=!trip;
 for(let [i,o] of wake.entries()){o.visible=!!trip;if(trip){const progress=Math.max(0,voyageProgress(trip)-i*.003),pos=tripRoute.getPointAt(progress),dir=tripRoute.getTangentAt(progress);o.position.set(pos.x,.445,pos.z);o.rotation.z=-Math.atan2(dir.x,dir.z);o.material.opacity=.45*(1-i/24);}}
 wakeRibbon.visible=!!trip;if(trip){for(let side=0;side<2;side++)for(let i=0;i<33;i++){const u=Math.max(0,voyageProgress(trip)-.012-i*.0025),pos=tripRoute.getPointAt(u),dir=tripRoute.getTangentAt(u);for(let edge=0;edge<2;edge++){const w=(side?1:-1)*(.21+i*.016+edge*.028);const k=(side*66+i*2+edge)*3;wakeVertices[k]=pos.x+dir.z*w;wakeVertices[k+1]=.449;wakeVertices[k+2]=pos.z-dir.x*w;}}wakeGeometry.attributes.position.needsUpdate=true;wakeRibbon.material.opacity=.35*Math.min(1,trip*10,(1-trip)*10);}
 const waveSources=[];for(let age=.5;age<9;age+=.6){const q=(cycle-12-age)/36;if(q>0&&q<1)waveSources.push({pos:tripRoute.getPointAt(voyageProgress(q)),age});}
 const wakeAt=(x,z)=>{let v=0;for(let s of waveSources){const d=Math.hypot(s.pos.x-x,s.pos.z-z)-s.age*.9;v+=Math.sin(d*4)*Math.exp(-d*d*1.7-s.age*.25);}return v;};
 for(let b of boats){if(b===outing)continue;const v=wakeAt(b.x,b.z);b.g.position.y+=v*.045;b.g.rotation.z+=v*.012;}
 for(let [i,b] of boats.entries())for(let f of b.fenders){f.o.position.x=f.x+Math.sin(t*.87+i+f.phase)*.016;f.o.rotation.x=Math.sin(t*1.1+f.phase)*.035;f.o.rotation.z=Math.sin(t*.79+i+f.phase)*.04;}
 const ropeUp=new T.Vector3(0,1,0);for(let [j,r] of mooring.entries()){if(!r.o.visible)continue;r.b.g.updateWorldMatrix(true,false);const end=r.l.clone().applyMatrix4(r.b.g.matrixWorld),delta=end.clone().sub(r.a),sag=.17+Math.sin(t*.7+j)*.035;const pos=r.o.geometry.attributes.position,nor=r.o.geometry.attributes.normal;for(let i=0;i<=28;i++){const q=i/28,centre=r.a.clone().addScaledVector(delta,q);centre.y-=4*sag*q*(1-q);centre.z+=Math.sin(q*PI)*Math.sin(t*.9+j)*.025;const tangent=delta.clone();tangent.y-=4*sag*(1-2*q);tangent.z+=PI*Math.cos(q*PI)*Math.sin(t*.9+j)*.025;tangent.normalize();const n=new T.Vector3().crossVectors(tangent,ropeUp).normalize(),bin=new T.Vector3().crossVectors(tangent,n);for(let k=0;k<=6;k++){const a=k/6*TAU,v=n.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin,Math.sin(a)),idx=i*7+k;pos.setXYZ(idx,centre.x+v.x*.026,centre.y+v.y*.026,centre.z+v.z*.026);nor.setXYZ(idx,v.x,v.y,v.z);}}pos.needsUpdate=true;nor.needsUpdate=true;r.o.geometry.computeBoundingSphere();}
 distant.position.set(.5+Math.sin(t*.025)*1.1,.59,-8);distant.rotation.y=PI/2;
 for(let b of boats){b.reflection.position.x=b.g.position.x;b.reflection.position.z=b.g.position.z;b.reflection.rotation.y=b.g.rotation.y;}
 for(let [i,b] of buoys.entries()){const delay=i*.7,v=wakeAt(b.x,b.z);b.g.position.y=.42+Math.sin(t*1.2-delay)*.018+v*.055;b.g.rotation.z=Math.sin(t*.9-delay)*.04+v*.07;}
 nearFactor=Math.max(0,Math.min(1,(23-view.distance)/15));
 for(let f of fish){const a=t*.17+f.phase,close=1-smooth(0,1,(Math.hypot(camera.position.x-f.cx,camera.position.y-f.y,camera.position.z-f.cz)-4)/14),alert=close*(.25+Math.pow(Math.max(0,Math.sin(t*.65+1.1)),2)*1.15),spread=1+alert*1.2,rx=Math.min(f.r*spread,11.5-f.cx,f.cx+4.1),rz=Math.min(f.r*.5*spread,11.4-f.cz,f.cz+7.8);f.g.position.set(f.cx+Math.cos(a)*rx,f.y+Math.sin(t*.7+f.phase)*.03,f.cz+Math.sin(a)*rz);f.g.rotation.y=Math.atan2(-Math.cos(a)*rz,-Math.sin(a)*rx);f.fin.rotation.y=Math.sin(t*8+f.phase)*.12;}
 for(let [i,g] of weeds.entries()){g.rotation.z=Math.sin(t*.9+i*.8)*.09;g.rotation.x=Math.cos(t*.7+i)*.06;}
 for(let f of kelpFronds){const a=f.o.geometry.attributes.position;for(let k=0;k<a.count;k++){const q=Math.floor(k/2)/16;a.setX(k,f.base[k*3]+Math.sin(t*1.1+f.phase+q*2.4)*q*q*.065);a.setZ(k,f.base[k*3+2]+Math.cos(t*.8+f.phase+q*3)*q*q*.04);}a.needsUpdate=true;}
 const cloudAt=(x,z)=>cycle>72&&cycle<84?Math.exp(-Math.pow((x+z*.3-(17-(cycle-72)*3.6))/5,2)):0;
 for(let r of reflections){r.o.position.x=r.x+Math.sin(t*.7+r.phase)*.085;r.o.scale.x=1+Math.sin(t*.8+r.phase)*.18;if(r.glint)r.o.material.opacity=(.15+Math.pow(Math.max(0,Math.sin(t*1.1+r.phase)),5)*.6)*(1-cloudAt(r.x,r.z)*.65);}
 for(let r of ripples){const a=(t*r.rate+r.phase)%1;r.o.scale.setScalar(.3+a*2.3);r.o.material.opacity=Math.sin(a*PI)*.32*(.4+weather*.6);}
 foams.forEach((o,i)=>{const v=wakeAt(o.position.x,o.position.z);o.position.y=.43+Math.sin(t*.8+i)*.015+v*.013;o.scale.x=.7+Math.sin(t*.7+i)*.25+v*.15;});
 const gustAt=x=>{const age=cycle-52-(12-x)*.3;return age>0&&age<6?Math.pow(Math.sin(age/6*PI),2):0;};
 flags.forEach((o,i)=>{let a=o.geometry.attributes.position;const localGust=gustAt(i===0?-2.6:i===1?-8.65:7.4);for(let j=0;j<a.count;j++){const x=a.getX(j);a.setZ(j,Math.sin(x*7-t*2+i)*(.035+localGust*.1)*(x+.36));}a.needsUpdate=true;});
 sock.rotation.y=Math.sin(t*.5)*.08+gustAt(-6.5)*.22;sock.rotation.z=.08+Math.sin(t*.8)*.03;
 craneRig.rotation.z=Math.sin(t*.7)*.005+gustAt(-5.7)*.012;
 sockSegments.forEach((o,i)=>{o.position.y=-.015*i+Math.sin(t*1.3-i*.5)*.007*i+gustAt(-6.5)*.022*i;o.position.z=Math.sin(t*1.1-i*.4)*.005*i;o.rotation.z=PI/2+Math.cos(t*1.3-i*.5)*.018*i;});
 treeCrowns.forEach((o,i)=>{const local=gustAt(-9-i*.04);o.rotation.z=Math.sin(t*.85+i*.6)*(.008+local*.025);});
 for(let o of netLines){const a=o.geometry.attributes.position,b=o.userData.rest;for(let k=0;k<a.count;k++){const q=Math.max(0,(2.4-b[k*3+1])/2);a.setX(k,b[k*3]+Math.sin(t*.9+b[k*3+2]*2)*.025*q+gustAt(-10.8)*.11*q*q*Math.sin(b[k*3+2]*1.8+t*1.4));}a.needsUpdate=true;}
 for(let [i,b] of gulls.entries()){const a=t*(.1+i*.004)+b.phase,close=1-smooth(0,1,(Math.hypot(camera.position.x-b.x,camera.position.y-b.y,camera.position.z-b.z)-5)/12);let folded=0,flap=Math.sin(t*3+i)*.12;if(!b.perched){b.g.position.set(b.x+Math.cos(a)*1.2,b.y+Math.sin(t*.4+i)*.17,b.z+Math.sin(a)*1.4);b.g.rotation.y=-a;const landing=i===0?smooth(0,1,(cycle-92)/2)*(1-smooth(0,1,(cycle-97)/2))*(1-close):0;if(landing)b.g.position.lerp(new T.Vector3(6.5,.53+Math.sin(t)*.02,6.2),landing);folded=landing;}else{b.g.position.set(b.x+Math.cos(a)*close*2,b.y+close*2.6,b.z+Math.sin(a)*close);b.g.rotation.y=-a*close;folded=1-close;flap=Math.sin(t*5)*.4;}b.wings.forEach((w,j)=>{const side=j?1:-1;w.rotation.y=side*folded*1.2;w.rotation.z=-side*folded*.25+side*(1-folded)*flap;w.scale.set(1-folded*.4,1,1-folded*.3);});}
 const routeVariant=Math.sin(Math.floor(t/100)*2.4);let catWalk=0,catSpeed=0;if(cycle>4&&cycle<12){const q=(cycle-4)/8,s=Math.sin(q*PI)*(.91+.09*Math.cos(Math.floor(t/100)*2.4)),pos=catRoute.getPointAt(s),dir=catRoute.getTangentAt(s);cat.position.copy(pos);cat.position.z+=routeVariant*.22*s;catWalk=smooth(0,1,(cycle-4)/.3)*(1-smooth(0,1,(cycle-11.7)/.3));catSpeed=Math.abs(Math.cos(q*PI));cat.rotation.y=Math.atan2(dir.x,dir.z)+PI*smooth(0,1,(q-.46)/.08);}else{cat.position.set(-7.45,0,10.8);cat.rotation.y=0;}cat.position.y=(cat.position.x>-8.2&&cat.position.z>9?slipHeight(cat.position.x):1.44)+.012+Math.abs(Math.sin(t*7))*.007*catSpeed;catTorso.scale.y=.72+catWalk*.28;catTorso.position.y=-.025*(1-catWalk);catTail.rotation.y=Math.sin(t*.9)*(.025+catWalk*.07);catLegs.forEach((o,i)=>{o.position.y=.11+catWalk*.13;o.rotation.x=(1-catWalk)+catWalk*Math.sin(t*8+([0,PI,PI,0][i]))*.4*catSpeed;});const catNear=1-smooth(0,1,(camera.position.distanceTo(cat.position)-5)/13);let catLook=Math.atan2(camera.position.x-cat.position.x,camera.position.z-cat.position.z)-cat.rotation.y;catLook=Math.atan2(Math.sin(catLook),Math.cos(catLook));catHead.rotation.y=Math.max(-.8,Math.min(.8,catLook))*catNear+Math.sin(t*.4)*.06;catHead.rotation.x=-catNear*.14;
 shafts.forEach(o=>o.material.opacity=(.055+sun.intensity*.01)*(1-cloud*.5));
 causticPatches.forEach((o,i)=>{o.material.uniforms.uStrength.value=(.17+Math.sin(t*.7+i)*.035)*(1-cloud*.65);});
 clockHands[0].rotation.z=-(2.8+t/3600)*TAU/12;clockHands[1].rotation.z=-(48+t/60)*TAU/60;clockHands[2].rotation.z=-(10+t)*TAU/60;
 pothosLeaves.forEach(l=>l.g.rotation.z=l.angle+Math.sin(t*.6+l.phase)*.009);
 drops.forEach(d=>d.o.position.y=d.y-((t*.5+d.phase)%1)*.15);
 for(let d of fallingDrops){const age=(t+d.phase)%d.period;d.source.updateWorldMatrix(true,false);const origin=d.local.clone().applyMatrix4(d.source.matrixWorld);const impact=origin.x<-4.6||origin.z<-8.6?1.464:.44;d.o.position.copy(origin);d.o.position.y-=age*age*2.1;d.o.visible=d.o.position.y>impact;const hitTime=Math.sqrt(Math.max(0,origin.y-impact)/2.1),elapsed=age-hitTime;d.ring.visible=elapsed>=0&&elapsed<.8;d.ring.position.set(origin.x,impact,origin.z);d.ring.scale.setScalar(.2+Math.max(0,elapsed)*4);d.ring.material.opacity=elapsed>=0?Math.max(0,1-elapsed/.8)*.42:0;d.splash.visible=elapsed>=0&&elapsed<.15;d.splash.position.set(origin.x,impact,origin.z);d.splash.scale.setScalar(1+Math.max(0,elapsed)*4);}
 rainbowMats.forEach(m=>m.opacity=cycle>6&&cycle<11?Math.sin((cycle-6)/5*PI)*.1:0);
 mist.forEach((o,i)=>{o.position.x=o.userData.startX+Math.sin(t*.09+i)*.22;o.material.opacity=.35+Math.sin(t*.1+i)*.08;});
 beacon.material.color.set(cycle>76&&cycle<79?'#fff3b2':'#ddcd8b');
 beaconSweep.rotation.y=t*1.4;beaconBeamMat.opacity=cloud>.5?(cloud-.5)*.12:0;
}
function homeDistance(){return 44.8*Math.max(1,1.3/(innerWidth/innerHeight));}
function overviewCamera(){view.az=.85;view.el=.57;view.distance=homeDistance();view.target.set(0,-2.5,0);setCamera();}
const tourStart=[Math.sin(.85)*Math.cos(.57)*44.8,-2.5+Math.sin(.57)*44.8,Math.cos(.85)*Math.cos(.57)*44.8];
// Duration, camera endpoints and look-at endpoints. Cuts separate the different shot sizes.
const tourShots=[
 // Establish the L-shaped quay, rain and breakwater with a slow aerial push.
 [7,tourStart,[18,13,23],[0,-2.5,0],[-.3,.2,-1]],
 // Track the moored boats and buoys from the open channel.
 [5,[4.2,4.1,11.8],[3.7,3.7,5.7],[-1.3,1.2,7.2],[-2.1,1.4,.8]],
 // The cases and puddle lead the eye to the clear umbrella by the steps.
 [5,[-1.1,3.7,8.4],[-1.7,3.35,7.5],[-5.8,1.8,5.9],[-5.35,1.95,5.1]],
 // Approach the cat from the open end of the slipway, clear of the hull.
 [5,[-8.4,1.92,12.3],[-8.05,1.85,11.95],[-7.45,1.57,11.1],[-7.45,1.59,11.13]],
 // Look through the port glass across the chart, radar and thermos shelf.
 [6,[-.8,2.35,3.15],[-1.18,2.25,2.95],[-2.5,1.85,1.9],[-2.5,1.85,1.9]],
 // A lateral move across the front glazing holds the benches, radio and clock.
 [5,[-8.7,3.2,9.4],[-7.25,3.15,8.85],[-8.3,2.8,3.9],[-8.05,2.8,3.65]],
 // Move along the lane below the shutter, revealing stacked crates and light shafts.
 [5,[-4.65,2.85,-4],[-4.65,2.8,-2.2],[-8.5,2.65,-2.5],[-8.85,2.75,-1.1]],
 // Follow the white boat during its existing excursion, widening onto its wake.
 [7,null,null,null,null],
 // Arc around the lantern with the tetrapods and foam in the foreground.
 [5,[19.4,5.5,-3.9],[18.2,4.9,-5.4],[10.3,3.25,-9.2],[10.1,3.25,-9.4]],
 // Descend outside the front cutaway, keeping the seabed and fish behind its glassy edge.
 [4,[9.2,1.7,15.8],[8.8,-.55,14],[6,-.45,9.4],[5.9,-.6,8.9]],
 // Hold the net, float line and flag as the existing gust arrives at this end of the quay.
 [7,[-5.6,4.2,13.5],[-5.9,4.05,13.3],[-10,3.5,9.9],[-10.1,3.5,9.9]],
 // Return to the complete model and settle on the overview composition.
 [3,[21,15.5,26],tourStart,[0,-.5,0],[0,-2.5,0]]
];
const tourDuration=tourShots.reduce((seconds,shot)=>seconds+shot[0],0);
const tourHomeDirection=new T.Vector3(Math.sin(.85)*Math.cos(.57),Math.sin(.57),Math.cos(.85)*Math.cos(.57));
function tourCamera(t){
 if(t<=0||t>=tourDuration-.6){overviewCamera();return;}
 let elapsed=t,index=0;
 while(index<tourShots.length-1&&elapsed>=tourShots[index][0])elapsed-=tourShots[index++][0];
 const shot=tourShots[index],duration=index===tourShots.length-1?shot[0]-.6:shot[0];
 const q=Math.max(0,Math.min(1,elapsed/duration)),u=smooth(0,1,q);
 if(index===7){
  // Derive the subject from absolute export time, never from its previous rendered pose.
  const progress=voyageProgress((t-12)/36),p=tripRoute.getPointAt(progress),dir=tripRoute.getTangentAt(progress);
  camera.position.copy(p).addScaledVector(dir,-6.5-u*4).addScaledVector(new T.Vector3(dir.z,0,-dir.x),4+u*3);
  camera.position.y+=5+u*7;
  view.target.copy(p);view.target.y+=.8;view.target.lerp(new T.Vector3(0,.7,0),u*.25);
 }else{
  camera.position.fromArray(shot[1]).lerp(new T.Vector3(...shot[2]),u);
  view.target.fromArray(shot[3]).lerp(new T.Vector3(...shot[4]),u);
  const homeBlend=index===0?1-u:index===tourShots.length-1?u:0;
  camera.position.addScaledVector(tourHomeDirection,(homeDistance()-44.8)*homeBlend);
 }
 view.distance=camera.position.distanceTo(view.target);
 camera.lookAt(view.target);camera.updateMatrixWorld();
}
window.videoExport={runs:['overview','tour'],async begin(id,{fps=30}={}){if(!this.runs.includes(id))throw new Error('Unknown run '+id);if(!(fps>0&&Number.isFinite(fps)))throw new Error('fps must be positive');const saved=exportState?exportState.saved:{...view,target:view.target.clone()};exportState={id,fps,saved};overviewCamera();update(0);renderFrame();return{frames:Math.round((id==='overview'?5:tourDuration)*fps)};},async frame(i){if(!exportState)throw new Error('Call begin first');const t=i/exportState.fps;if(exportState.id==='tour')tourCamera(t);else overviewCamera();update(t);renderFrame();await new Promise(resolve=>requestAnimationFrame(resolve));},end(){if(exportState){const s=exportState.saved;Object.assign(view,s);view.target=s.target;exportState=null;lastStamp=performance.now();}}};
// A small inspection hook is useful when verifying local-file and export behaviour.
window.harbour={scene,camera,renderer,view,update,overviewCamera,renderFrame};
overviewCamera();
function animate(stamp){requestAnimationFrame(animate);if(exportState)return;liveTime+=Math.min(.1,(stamp-lastStamp)/1000);lastStamp=stamp;update(liveTime);setCamera();renderFrame();}requestAnimationFrame(animate);
})();
