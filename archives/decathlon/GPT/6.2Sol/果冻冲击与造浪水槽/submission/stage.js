'use strict';
const T = THREE;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const mix = (a,b,t) => a+(b-a)*t;
const smooth = (a,b,v) => {const q=clamp((v-a)/(b-a),0,1);return q*q*(3-2*q);};
const v3 = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
function randomSource(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; };
}
const stageEl=document.getElementById('stage');
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(1);
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.22;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
stageEl.append(renderer.domElement);
const camera=new T.PerspectiveCamera(34,1,.08,300);
const metal=new T.MeshStandardMaterial({color:0x526c72,metalness:.78,roughness:.31});
const blackMetal=new T.MeshStandardMaterial({color:0x202f36,metalness:.62,roughness:.42});
const trim=new T.MeshStandardMaterial({color:0x9db9bd,metalness:.67,roughness:.29});
const orange=new T.MeshStandardMaterial({color:0xb97135,metalness:.56,roughness:.33});
const aqua=new T.MeshStandardMaterial({color:0x56f4cc,emissive:0x1aab89,emissiveIntensity:.75,metalness:.3,roughness:.27});
const stageMat=new T.MeshStandardMaterial({color:0x38565b,metalness:.42,roughness:.53});
const sphereGeo=new T.SphereGeometry(1,48,28);
function mesh(parent,geo,mat,x=0,y=0,z=0,shadows=true){
  const m=new T.Mesh(geo,mat); m.position.set(x,y,z);m.castShadow=shadows;m.receiveShadow=shadows;parent.add(m);return m;
}
function box(p,w,h,d,m,x=0,y=0,z=0,s=true){return mesh(p,new T.BoxGeometry(w,h,d),m,x,y,z,s);}
function cyl(p,r1,r2,h,m,x=0,y=0,z=0,s=true){return mesh(p,new T.CylinderGeometry(r1,r2,h,24),m,x,y,z,s);}
function line(p,coords,color,opacity=1){
  const m=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(coords,3)),new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));
  p.add(m);return m;
}
function canvasTexture(w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;
}
const envRoom=new T.Scene();
envRoom.background=new T.Color(0x304b56);
function lightCard(w,h,x,y,z,c){
  const m=mesh(envRoom,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(c[0],c[1],c[2]),side:T.DoubleSide}),x,y,z,false);
  m.lookAt(0,0,0);
}
lightCard(13,4,-5,9,3,[3.9,4.25,4.1]);lightCard(5,10,-9,3,-3,[1.0,2.1,2.65]);lightCard(7,2,5,6,-8,[2.8,3.1,4.4]);
lightCard(5,2,7,2,7,[2.9,1.74,1.15]);lightCard(2,6,1,3,10,[.8,1.5,1.65]);lightCard(16,12,0,-6,0,[.14,.24,.27]);
const pmrem=new T.PMREMGenerator(renderer);
const env=pmrem.fromScene(envRoom,.035).texture;
pmrem.dispose();
const backdrop=new T.Color(0x243744);
function labScene(){
  const sc=new T.Scene();sc.environment=env;sc.background=backdrop;sc.fog=new T.FogExp2(backdrop,.044);
  sc.add(new T.HemisphereLight(0xd6efff,0x315352,1.65));
  const sun=new T.DirectionalLight(0xe8fff5,2.65);sun.position.set(-4,10,6);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-11,right:11,top:9,bottom:-9,near:.1,far:29});
  sun.shadow.normalBias=.022;sun.shadow.bias=-.00032;sun.shadow.radius=3;sc.add(sun);
  const rim=new T.DirectionalLight(0x8acfff,2.4);rim.position.set(5,5,-7);sc.add(rim);
  const warm=new T.DirectionalLight(0xffc28a,.75);warm.position.set(7,3,5);sc.add(warm);
  const floor=mesh(sc,new T.PlaneGeometry(290,290),new T.MeshStandardMaterial({color:0x243b46,roughness:.76,metalness:.17}),0,-.93,0);
  floor.rotation.x=-Math.PI/2;
  const grid=new T.GridHelper(70,70,0x688889,0x567077);grid.position.y=-.921;grid.material.transparent=true;grid.material.opacity=.19;sc.add(grid);
  return sc;
}
function typographicPlate(p,w,h,text,sub,x,y,z,face='front',color='#a4c3c4'){
  const map=canvasTexture(1024,256,(c)=>{
    c.clearRect(0,0,1024,256);
    c.fillStyle=color;c.font='bold 79px Consolas';c.fillText(text,23,105);c.font='35px Consolas';c.fillText(sub,25,170);
    c.globalAlpha=.7;c.fillRect(25,195,190,4);
  });
  const m=mesh(p,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false}),x,y,z,false);
  if(face==='top')m.rotation.x=-Math.PI/2;
  return m;
}
function plinth(sc,w,d,caption,sub){
  box(sc,w+.23,.12,d+.22,blackMetal,0,-.77,0);
  box(sc,w,.54,d,blackMetal,0,-.46,0);
  box(sc,w+.08,.15,d+.08,metal,0,-.16,0);
  box(sc,w,.09,d,stageMat,0,-.046,0);
  box(sc,w-1,.023,.025,aqua,0,-.275,d/2+.016);
  box(sc,w-1,.022,.025,metal,0,-.64,d/2+.014);
  for(const x of [-w/2+.42,w/2-.42]) for(const z of [-d/2+.40,d/2-.40]){
    box(sc,.66,.22,.62,blackMetal,x,-.80,z);
    box(sc,.39,.04,.28,orange,x,-.326,Math.sign(z)*(d/2+.015));
    if(z>0)for(let j=0;j<3;j++)box(sc,.038,.075,.028,trim,x+(j-1)*.1,-.53,d/2+.014,false);
  }
  const positions=[];
  for(let x=Math.ceil(-w/2+.32);x<=w/2-.32;x++)positions.push(x,.004,-d/2+.24,x,.004,d/2-.24);
  for(let z=Math.ceil(-d/2+.32);z<=d/2-.32;z++)positions.push(-w/2+.24,.004,z,w/2-.24,.004,z);
  for(let x=-w/2+.45;x<w/2-.39;x+=.20)positions.push(x,.008,d/2-.29,x,.008,d/2-.22-(Math.round((x+w/2)*5)%5===2?.075:0));
  line(sc,positions,0x9cc2bc,.22);
  typographicPlate(sc,3.67,.42,caption,sub,-w/2+2.43,-.494,d/2+.021);
}
const softShadow=canvasTexture(96,96,(c)=>{
  const g=c.createRadialGradient(48,48,1,48,48,46);
  g.addColorStop(0,'rgba(0,12,18,.85)');g.addColorStop(.45,'rgba(0,12,18,.44)');g.addColorStop(1,'rgba(0,12,18,0)');
  c.fillStyle=g;c.fillRect(0,0,96,96);
});
function contactShadow(sc){
  const m=mesh(sc,new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({map:softShadow,transparent:true,opacity:.65,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),0,.012,0,false);
  m.rotation.x=-Math.PI/2;return m;
}
const shotMap=canvasTexture(1024,512,(c,w,h)=>{
  c.fillStyle='#89999e';c.fillRect(0,0,w,h);
  c.strokeStyle='#859297';c.lineWidth=1;
  for(let i=4;i<h;i+=5){c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke();}
  c.fillStyle='#222d36';c.fillRect(0,219,w,74);
  c.fillStyle='#a95828';c.fillRect(0,228,w,55);
  c.fillStyle='#edaa64';c.fillRect(0,230,w,3);c.fillRect(0,277,w,3);
  for(let x=50;x<w;x+=256){
    c.fillStyle='#231e21';c.font='bold 27px Consolas';c.fillText('ML  /  Fe',x,264);
    c.fillRect(x+133,237,25,34);c.fillStyle='#df964b';c.fillRect(x+139,237,3,34);c.fillRect(x+151,237,2,34);
  }
});
const shotMat=new T.MeshStandardMaterial({map:shotMap,metalness:.83,roughness:.25,envMapIntensity:1.12});
function soundEvent(kind,energy=1){
  if(!window.labAudio?.enabled||window.labAudio.silent||!window.labAudio.ctx)return;
  const ctx=window.labAudio.ctx,t=ctx.currentTime;
  const strength=clamp(energy,.18,2);
  const modes={hit:[103,42,.27,.095],bounce:[169,74,.16,.053],crack:[207,53,.34,.095],metal:[446,185,.20,.051],splash:[89,43,.32,.07],wave:[51,32,.53,.039]};
  const [hi,lo,len,gain]=modes[kind]||modes.hit;
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=kind==='metal'?'triangle':'sine';o.frequency.setValueAtTime(hi,t);o.frequency.exponentialRampToValueAtTime(lo,t+len*.72);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(gain*strength,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+len);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+len+.01);
  if(['splash','wave','crack','hit'].includes(kind)){
    const n=ctx.createBufferSource();n.buffer=window.labAudio.noise;
    const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value={splash:1230,wave:650,crack:1830,hit:310}[kind];f.Q.value=.6;
    const a=ctx.createGain();a.gain.setValueAtTime(.12*gain*strength,t);a.gain.linearRampToValueAtTime(.97*gain*strength,t+.023);a.gain.exponentialRampToValueAtTime(.0001,t+len);
    n.connect(f).connect(a).connect(ctx.destination);n.start(t);n.stop(t+len);
  }
}


