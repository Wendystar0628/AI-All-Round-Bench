/* ============================================================
 * 三维世界层：场景、地形、模型、特效、相机
 * ============================================================ */
class World {
  constructor(canvas){
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance', alpha:false});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.58;

    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x030a10);
    this.scene.fog=new THREE.FogExp2(0x04131c, 0.0052);

    this.camera=new THREE.PerspectiveCamera(42, window.innerWidth/window.innerHeight, .1, 600);
    this.camera.position.set(0, 64, 70);

    this.groups={
      env:new THREE.Group(), terrain:new THREE.Group(), routes:new THREE.Group(),
      preview:new THREE.Group(), units:new THREE.Group(), fx:new THREE.Group(),
      labels:new THREE.Group(), markers:new THREE.Group()
    };
    Object.values(this.groups).forEach(g=>this.scene.add(g));

    this.raycaster=new THREE.Raycaster();
    this.pointer=new THREE.Vector2();
    this.groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    this.effects=[];
    this.routeAnims=[];
    this.unitMap=new Map();
    this.towerMeshes=new Map();
    this.enemyMeshes=new Map();
    this.nodeVisuals=new Map();
    this.cellVisuals=new Map();
    this.hoverCell=null;
    this.selectionRing=null;
    this.rangeRing=null;
    this.previewGroup=null;
    this.map=null;
    this.time=0;
    this.quality='high';

    this.setupLights();
    this.setupSky();
    this.setupEnvironment();
    this.setupCameraState();
    this.makeTextures();
    this.resize();
    window.addEventListener('resize',()=>this.resize());
  }

  /* ---------------- 基础 ---------------- */
  setupLights(){
    const hemi=new THREE.HemisphereLight(0x9feeff, 0x0a1c26, 2.2);
    this.scene.add(hemi);
    this.scene.add(new THREE.AmbientLight(0x2a5a6a, 0.55));
    const dir=new THREE.DirectionalLight(0xe8fbff, 2.7);
    dir.position.set(42,72,38);
    dir.castShadow=true;
    dir.shadow.mapSize.set(2048,2048);
    dir.shadow.camera.left=-70; dir.shadow.camera.right=70;
    dir.shadow.camera.top=70; dir.shadow.camera.bottom=-70;
    dir.shadow.camera.near=1; dir.shadow.camera.far=220;
    dir.shadow.bias=-0.0006;
    dir.shadow.normalBias=0.03;
    this.scene.add(dir);
    this.dirLight=dir;
    const fill=new THREE.DirectionalLight(0x2d8aaa, 1.05);
    fill.position.set(-40,30,-30); this.scene.add(fill);
    const core=new THREE.PointLight(0x5ce9ff, 40, 120, 2);
    core.position.set(0,18,0); this.scene.add(core);
    this.coreLight=core;
  }

  setupSky(){
    const geo=new THREE.SphereGeometry(320,32,24);
    const mat=new THREE.ShaderMaterial({
      side:THREE.BackSide, depthWrite:false,
      uniforms:{top:{value:new THREE.Color(0x02070d)},mid:{value:new THREE.Color(0x06202c)},bot:{value:new THREE.Color(0x010409)}},
      vertexShader:`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){ float h=normalize(vP).y; vec3 c=mix(bot,mid,smoothstep(-0.4,0.15,h)); c=mix(c,top,smoothstep(0.05,0.8,h));
        float band=sin(h*40.0)*0.012; gl_FragColor=vec4(c+band,1.0); }`
    });
    this.sky=new THREE.Mesh(geo,mat); this.scene.add(this.sky);

    const starGeo=new THREE.BufferGeometry();
    const N=1100, pos=new Float32Array(N*3), col=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const r=120+Math.random()*170, th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
      pos[i*3]=r*Math.sin(ph)*Math.cos(th); pos[i*3+1]=r*Math.cos(ph)*0.7+20; pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
      const c=new THREE.Color().setHSL(.52+Math.random()*.1,.7,.55+Math.random()*.35);
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    starGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    starGeo.setAttribute('color',new THREE.BufferAttribute(col,3));
    const starMat=new THREE.PointsMaterial({size:.55,vertexColors:true,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
    this.stars=new THREE.Points(starGeo,starMat); this.scene.add(this.stars);
  }

  setupEnvironment(){
    // 远景网络集群
    this.distant=new THREE.Group(); this.scene.add(this.distant);
    const cols=[0x1b6b82,0x2a4f7a,0x1a5a58,0x4a3a7a];
    for(let i=0;i<26;i++){
      const a=Math.random()*Math.PI*2, r=95+Math.random()*90;
      const g=new THREE.Group();
      g.position.set(Math.cos(a)*r, -30+Math.random()*45, Math.sin(a)*r);
      const n=3+Math.floor(Math.random()*6);
      for(let j=0;j<n;j++){
        const s=.5+Math.random()*1.6;
        const m=new THREE.Mesh(new THREE.BoxGeometry(s,s,s), new THREE.MeshStandardMaterial({color:cols[i%cols.length],emissive:cols[i%cols.length],emissiveIntensity:.35,metalness:.5,roughness:.4,transparent:true,opacity:.75}));
        m.position.set((Math.random()-.5)*10,(Math.random()-.5)*6,(Math.random()-.5)*10);
        m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
        g.add(m);
      }
      const lineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6,-2,0),new THREE.Vector3(6,2,0)]);
      g.add(new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:cols[i%cols.length],transparent:true,opacity:.35})));
      this.distant.add(g);
    }
    this.distant.rotation.y=0;

    // 协议层
    this.protocol=new THREE.Group(); this.scene.add(this.protocol);
    const layerCols=[0x0d4c5e,0x0a3a55,0x123a5a,0x0a2c44];
    for(let L=0;L<4;L++){
      const y=-8-L*7;
      const grid=new THREE.GridHelper(190,38,layerCols[L],0x071c26);
      grid.position.y=y; grid.material.transparent=true; grid.material.opacity=.38; grid.material.depthWrite=false;
      this.protocol.add(grid);
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(190,190), new THREE.MeshBasicMaterial({color:layerCols[L],transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}));
      plane.rotation.x=-Math.PI/2; plane.position.y=y-.05; this.protocol.add(plane);
    }
    // 协议层数据流
    this.streams=new THREE.Group(); this.scene.add(this.streams);
    const sGeo=new THREE.BufferGeometry();
    const SN=420, sp=new Float32Array(SN*3), sc=new Float32Array(SN*3);
    for(let i=0;i<SN;i++){
      sp[i*3]=(Math.random()-.5)*190;
      sp[i*3+1]=-8-Math.floor(Math.random()*4)*7+Math.random()*.6;
      sp[i*3+2]=(Math.random()-.5)*190;
      const c=new THREE.Color().setHSL(.5+Math.random()*.08,.8,.5);
      sc[i*3]=c.r; sc[i*3+1]=c.g; sc[i*3+2]=c.b;
    }
    sGeo.setAttribute('position',new THREE.BufferAttribute(sp,3));
    sGeo.setAttribute('color',new THREE.BufferAttribute(sc,3));
    this.streamPoints=new THREE.Points(sGeo,new THREE.PointsMaterial({size:.42,vertexColors:true,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.streams.add(this.streamPoints);

    // 远景数据流星
    this.meteors=new THREE.Group(); this.scene.add(this.meteors);
    for(let i=0;i<16;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(.28,6,6), new THREE.MeshBasicMaterial({color:0x5ce9ff,transparent:true,opacity:.6,blending:THREE.AdditiveBlending}));
      m.userData={a:Math.random()*6.28,r:70+Math.random()*90,y:-20+Math.random()*50,s:.2+Math.random()*.5};
      this.meteors.add(m);
    }

    // 环境微粒
    const pGeo=new THREE.BufferGeometry();
    const PN=350, pp=new Float32Array(PN*3);
    for(let i=0;i<PN;i++){ pp[i*3]=(Math.random()-.5)*130; pp[i*3+1]=Math.random()*45-8; pp[i*3+2]=(Math.random()-.5)*100; }
    pGeo.setAttribute('position',new THREE.BufferAttribute(pp,3));
    this.motes=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.18,color:0x6fe9ff,transparent:true,opacity:.4,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.scene.add(this.motes);
  }

  setupCameraState(){
    this.camTarget=new THREE.Vector3(0,0,0);
    this.camRadius=92;
    this.camTheta=Math.PI*0.5;
    this.camPhi=0.86;
    this.defaultCam={target:new THREE.Vector3(0,0,0),radius:92,theta:Math.PI*0.5,phi:0.86};
    this.applyCamera();
  }

  applyCamera(){
    const r=this.camRadius, t=this.camTheta, p=this.camPhi;
    this.camera.position.set(
      this.camTarget.x + r*Math.sin(p)*Math.cos(t),
      this.camTarget.y + r*Math.cos(p),
      this.camTarget.z + r*Math.sin(p)*Math.sin(t)
    );
    this.camera.lookAt(this.camTarget);
  }

  resetCamera(){ this.camTarget.copy(this.defaultCam.target); this.camRadius=this.defaultCam.radius; this.camTheta=this.defaultCam.theta; this.camPhi=this.defaultCam.phi; this.applyCamera(); }

  focusAt(x,z,radius=36){
    this.camTarget.set(x,0,z);
    this.camRadius=radius;
    this.camTheta=Math.PI*0.5;
    this.camPhi=0.78;
    this.applyCamera();
  }

  resize(){
    const w=window.innerWidth, h=window.innerHeight;
    this.renderer.setPixelRatio(this.quality==='low'?1:Math.min(window.devicePixelRatio||1,2));
    this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
  }

  setQuality(q){ this.quality=q; this.resize(); if(q==='low'){ this.renderer.shadowMap.enabled=false; } else { this.renderer.shadowMap.enabled=true; } }

  /* ---------------- 纹理 ---------------- */
  makeTextures(){
    const mk=(draw,size=128)=>{
      const c=document.createElement('canvas'); c.width=c.height=size;
      const x=c.getContext('2d'); draw(x,size);
      const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; t.wrapS=t.wrapT=THREE.RepeatWrapping;
      return t;
    };
    const circuit=(base,line,accent)=>mk((x,s)=>{
      x.fillStyle=base; x.fillRect(0,0,s,s);
      x.strokeStyle='rgba(255,255,255,.03)'; x.lineWidth=1;
      for(let i=0;i<8;i++){ x.beginPath(); x.moveTo(0,i*s/8); x.lineTo(s,i*s/8); x.stroke(); }
      x.strokeStyle=line; x.lineWidth=2; x.globalAlpha=.55;
      for(let i=0;i<5;i++){
        x.beginPath(); x.moveTo(Math.random()*s,0); x.lineTo(Math.random()*s,s); x.stroke();
      }
      x.globalAlpha=1; x.strokeStyle=accent; x.lineWidth=2.4;
      x.strokeRect(8,8,s-16,s-16);
      x.fillStyle=accent;
      for(let i=0;i<4;i++){ x.beginPath(); x.arc(16+i*30,s/2,2.2,0,6.28); x.fill(); }
      x.globalAlpha=.18; x.fillStyle='#000'; x.fillRect(0,s-14,s,14);
    });
    this.tex={
      link:circuit('#0e3040','#2f9ab8','#5fe0f0'),
      old:circuit('#3a2a0e','#a86a22','#ffcf7a'),
      platform:mk((x,s)=>{
        x.fillStyle='#14303d'; x.fillRect(0,0,s,s);
        x.strokeStyle='rgba(140,220,240,.18)'; x.lineWidth=1;
        for(let i=0;i<=4;i++){ x.beginPath(); x.moveTo(i*s/4,0); x.lineTo(i*s/4,s); x.stroke(); x.beginPath(); x.moveTo(0,i*s/4); x.lineTo(s,i*s/4); x.stroke(); }
        x.fillStyle='rgba(92,233,255,.16)';
        for(let i=0;i<4;i++) for(let j=0;j<4;j++){ x.beginPath(); x.arc(i*s/4+s/8,j*s/4+s/8,2,0,6.28); x.fill(); }
        x.strokeStyle='rgba(92,233,255,.5)'; x.lineWidth=3; x.strokeRect(3,3,s-6,s-6);
      }),
      node:mk((x,s)=>{
        x.fillStyle='#103844'; x.fillRect(0,0,s,s);
        x.strokeStyle='rgba(92,233,255,.25)'; x.lineWidth=1;
        for(let i=0;i<8;i++){ x.beginPath(); x.moveTo(s/2,s/2); x.lineTo(s/2+Math.cos(i/8*6.28)*s/2,s/2+Math.sin(i/8*6.28)*s/2); x.stroke(); }
        x.strokeStyle='#5ce9ff'; x.lineWidth=3;
        for(const r of [s*.2,s*.36]){ x.beginPath(); x.arc(s/2,s/2,r,0,6.28); x.stroke(); }
        x.fillStyle='#0a1a22'; x.beginPath(); x.arc(s/2,s/2,s*.1,0,6.28); x.fill();
      }),
      obstacle:mk((x,s)=>{
        x.fillStyle='#14303c'; x.fillRect(0,0,s,s);
        x.fillStyle='#122e3c';
        for(let i=0;i<4;i++){ x.fillRect(8,8+i*30,s-16,22); }
        x.fillStyle='rgba(92,233,255,.5)';
        for(let i=0;i<4;i++) for(let j=0;j<5;j++){ x.fillRect(14+j*20,14+i*30,4,4); }
        x.strokeStyle='rgba(92,233,255,.35)'; x.lineWidth=2; x.strokeRect(4,4,s-8,s-8);
      })
    };
  }

  label(text, color='#8ff7ff', scale=1, sub=''){
    const c=document.createElement('canvas'); c.width=512; c.height=sub?176:128;
    const x=c.getContext('2d');
    x.clearRect(0,0,c.width,c.height);
    x.font='600 54px "Microsoft YaHei","PingFang SC",sans-serif';
    x.textAlign='center'; x.textBaseline='middle';
    x.shadowColor=color; x.shadowBlur=22; x.fillStyle=color;
    x.fillText(text,256,sub?58:64);
    if(sub){ x.shadowBlur=8; x.font='400 30px "Microsoft YaHei",sans-serif'; x.fillStyle='rgba(200,240,255,.75)'; x.fillText(sub,256,118); }
    const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,depthTest:true});
    const s=new THREE.Sprite(m); s.scale.set(9*scale, (sub?3.1:2.25)*scale, 1);
    return s;
  }

  /* ---------------- 地图构建 ---------------- */
  setMap(map){
    this.map=map;
    this.clearGroup(this.groups.terrain);
    this.clearGroup(this.groups.routes);
    this.clearGroup(this.groups.preview);
    this.clearGroup(this.groups.units);
    this.clearGroup(this.groups.fx);
    this.clearGroup(this.groups.labels);
    this.clearGroup(this.groups.markers);
    this.effects=[]; this.routeAnims=[]; this.unitMap.clear(); this.towerMeshes.clear(); this.enemyMeshes.clear(); this.nodeVisuals.clear(); this.cellVisuals.clear();
    this.selectionRing=null; this.rangeRing=null;
    this.previewGroup=null; this.hoverCell=null;
    this.flowBand=null; this.flowTex=null; this.flowPoints=null; this.dmzRing=null; this.airGap=null;
    this.routeFlash=null; this.lockGroup=null; this.lockSignature='';
    this.buildTerrain();
    this.buildRoutes();
    this.applyTheme();
  }

  applyTheme(){
    const themes={
      enterprise:{fog:0x04131c, sky:0x06202c, key:0xd8f8ff, accent:0x5ce9ff},
      backbone:{fog:0x071018, sky:0x1a1a2e, key:0xffe6c8, accent:0xffb85c},
      industrial:{fog:0x06110e, sky:0x0c241c, key:0xd8ffe8, accent:0x6cf0a8}
    };
    const t=themes[this.map.theme]||themes.enterprise;
    this.scene.fog.color.setHex(t.fog);
    this.scene.fog.density=this.map.theme==='industrial'?0.0062:0.0052;
    this.dirLight.color.setHex(t.key);
    this.coreLight.color.setHex(t.accent);
    this.renderer.setClearColor(t.fog,1);
    if(this.sky){ this.sky.material.uniforms.mid.value.setHex(t.sky); }
  }

  buildTerrain(){
    const m=this.map, tile=m.tile;
    const matLink=new THREE.MeshStandardMaterial({map:this.tex.link,color:0xd4f2fb,metalness:.5,roughness:.44,emissive:0x145066,emissiveIntensity:1.2});
    const matOld=new THREE.MeshStandardMaterial({map:this.tex.old,color:0xffe0b0,metalness:.45,roughness:.5,emissive:0x8a4a08,emissiveIntensity:1.15});
    const matPlat=new THREE.MeshStandardMaterial({map:this.tex.platform,color:0xdff5fc,metalness:.62,roughness:.32,emissive:0x1a5a6a,emissiveIntensity:.95});
    const matBlock=new THREE.MeshStandardMaterial({map:this.tex.obstacle,color:0xb8d6e0,metalness:.55,roughness:.46,emissive:0x0e2a34,emissiveIntensity:.8});
    const matNode=new THREE.MeshStandardMaterial({map:this.tex.node,color:0xe2fbff,metalness:.62,roughness:.28,emissive:0x1a6a7a,emissiveIntensity:1.25});
    const linkGeo=new THREE.BoxGeometry(tile*.94,.26,tile*.94);
    const platGeo=new THREE.BoxGeometry(tile*.9,1.15,tile*.9);
    const blockGeo=new THREE.BoxGeometry(tile*.92,2.6,tile*.92);
    const nodeBaseGeo=new THREE.CylinderGeometry(tile*.48,tile*.52,.5,8);
    const nodeRingGeo=new THREE.TorusGeometry(tile*.43,.09,8,32);

    for(let z=0;z<m.h;z++) for(let x=0;x<m.w;x++){
      const ch=m.cell(x,z); if(ch==='#') continue;
      const w=m.world(x,z);
      if(ch==='p'){
        const g=new THREE.Group(); g.position.set(w.x,0,w.z);
        const base=new THREE.Mesh(platGeo,matPlat); base.position.y=.575; base.receiveShadow=true; base.castShadow=true; g.add(base);
        const top=new THREE.Mesh(new THREE.BoxGeometry(tile*.82,.06,tile*.82), new THREE.MeshStandardMaterial({map:this.tex.platform,color:0xcfeaf4,metalness:.8,roughness:.25,emissive:0x1a6a7a,emissiveIntensity:.5}));
        top.position.y=1.18; top.receiveShadow=true; g.add(top);
        const edgeMat=new THREE.MeshBasicMaterial({color:0x5ce9ff,transparent:true,opacity:.6});
        for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
          const e=new THREE.Mesh(new THREE.BoxGeometry(.12,.5,.12),edgeMat);
          e.position.set(dx*tile*.4,1.4,dz*tile*.4); g.add(e);
        }
        this.groups.terrain.add(g);
        this.cellVisuals.set(x+','+z,{type:'p',y:1.21});
      } else if(ch==='n'){
        const g=new THREE.Group(); g.position.set(w.x,0,w.z);
        const base=new THREE.Mesh(nodeBaseGeo,matNode); base.position.y=.25; base.castShadow=true; base.receiveShadow=true; g.add(base);
        const ring=new THREE.Mesh(nodeRingGeo, new THREE.MeshBasicMaterial({color:0x5ce9ff,transparent:true,opacity:.8})); ring.rotation.x=Math.PI/2; ring.position.y=.52; g.add(ring);
        const ring2=new THREE.Mesh(nodeRingGeo, new THREE.MeshBasicMaterial({color:0x2fd6b8,transparent:true,opacity:.45})); ring2.rotation.x=Math.PI/2; ring2.position.y=.62; ring2.scale.setScalar(.72); g.add(ring2);
        for(let i=0;i<4;i++){
          const a=i*Math.PI/2;
          const arm=new THREE.Mesh(new THREE.BoxGeometry(.22,.14,tile*.36), matPlat);
          arm.position.set(Math.cos(a)*tile*.36,.36,Math.sin(a)*tile*.36); arm.rotation.y=-a; g.add(arm);
        }
        const dome=new THREE.Mesh(new THREE.SphereGeometry(tile*.42,16,10,0,Math.PI*2,0,Math.PI/2), new THREE.MeshBasicMaterial({color:0x9be9ff,transparent:true,opacity:0,wireframe:true}));
        dome.position.y=.5; g.add(dome);
        this.groups.terrain.add(g);
        this.nodeVisuals.set(x+','+z,{group:g,ring,ring2,dome,base});
        this.cellVisuals.set(x+','+z,{type:'n',y:.55});
      } else if(ch==='o'){
        const g=new THREE.Group(); g.position.set(w.x,0,w.z);
        const base=new THREE.Mesh(linkGeo,matOld); base.position.y=-.13; base.receiveShadow=true; g.add(base);
        const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,tile*.92,8), new THREE.MeshStandardMaterial({color:0x6a4a1a,metalness:.8,roughness:.4,emissive:0xffb85c,emissiveIntensity:.35}));
        pipe.rotation.x=Math.PI/2; pipe.position.set(tile*.28,.12,0); g.add(pipe);
        this.groups.terrain.add(g);
        this.cellVisuals.set(x+','+z,{type:'o',y:.1});
} else {
        const base=new THREE.Mesh(linkGeo,matLink); base.position.y=-.13; base.receiveShadow=true; this.groups.terrain.add(base);
        const top=new THREE.Mesh(new THREE.PlaneGeometry(tile*.9,tile*.9), new THREE.MeshBasicMaterial({map:this.tex.link,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false}));
        top.rotation.x=-Math.PI/2; top.position.y=.02; this.groups.terrain.add(top);
        this.cellVisuals.set(x+','+z,{type:'.',y:.1});
      }
      // 障碍设施
      if(ch==='#'){
        const g=new THREE.Group(); g.position.set(w.x,0,w.z);
        const h=2.2+((x*7+z*13)%5)*.22;
        const b=new THREE.Mesh(new THREE.BoxGeometry(tile*.9,h,tile*.9),matBlock); b.position.y=h/2; b.castShadow=true; b.receiveShadow=true; g.add(b);
        const lightMat=new THREE.MeshBasicMaterial({color:0x5ce9ff,transparent:true,opacity:.55});
        for(let i=0;i<3;i++){
          const strip=new THREE.Mesh(new THREE.BoxGeometry(tile*.62,.05,.04),lightMat);
          strip.position.set(0,h*.3+i*.5,tile*.46); g.add(strip);
        }
        if((x+z)%4===0){
          const ant=new THREE.Mesh(new THREE.CylinderGeometry(.04,.06,1.6,6),new THREE.MeshStandardMaterial({color:0x4a6a78,metalness:.7,roughness:.3}));
          ant.position.set(0,h+.8,0); g.add(ant);
          const tip=new THREE.Mesh(new THREE.SphereGeometry(.09,8,8),new THREE.MeshBasicMaterial({color:0xff5d72}));
          tip.position.set(0,h+1.6,0); g.add(tip);
        }
        this.groups.terrain.add(g);
        this.cellVisuals.set(x+','+z,{type:'#',y:h});
      }
    }

    // 入口 / 出口
    for(const e of m.entries) this.buildPortal(e,'entry');
    for(const e of m.exits) this.buildPortal(e,'exit');
    this.buildMapDecor();

    // 边界框
    const halfW=(m.w-1)/2*tile, halfH=(m.h-1)/2*tile;
    const frameMat=new THREE.MeshBasicMaterial({color:0x2f7f96,transparent:true,opacity:.5});
    const mkBar=(w,d,x,z)=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(w,.12,d),frameMat); b.position.set(x,.06,z); this.groups.terrain.add(b); };
    mkBar(halfW*2+tile,tile*.12,0,-halfH-tile*.55); mkBar(halfW*2+tile,tile*.12,0,halfH+tile*.55);
    mkBar(tile*.12,halfH*2+tile,-halfW-tile*.55,0); mkBar(tile*.12,halfH*2+tile,halfW+tile*.55,0);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const p=new THREE.Mesh(new THREE.CylinderGeometry(.5,.7,3.4,6),new THREE.MeshStandardMaterial({color:0x12303e,metalness:.7,roughness:.35,emissive:0x1a6a7a,emissiveIntensity:.5}));
      p.position.set(sx*(halfW+tile*.55),1.7,sz*(halfH+tile*.55)); p.castShadow=true; this.groups.terrain.add(p);
      const l=new THREE.Mesh(new THREE.SphereGeometry(.22,10,10),new THREE.MeshBasicMaterial({color:0x5ce9ff}));
      l.position.set(p.position.x,3.6,p.position.z); this.groups.terrain.add(l);
    }
    // 悬浮地面阴影/底座
    const base=new THREE.Mesh(new THREE.BoxGeometry(halfW*2+tile*2,1.2,halfH*2+tile*2),new THREE.MeshStandardMaterial({color:0x050d13,metalness:.6,roughness:.6}));
    base.position.y=-1.1; base.receiveShadow=true; this.groups.terrain.add(base);
    const under=new THREE.Mesh(new THREE.BoxGeometry(halfW*2+tile*1.4,.2,halfH*2+tile*1.4),new THREE.MeshBasicMaterial({color:0x0a2a38,transparent:true,opacity:.7}));
    under.position.y=-1.75; this.groups.terrain.add(under);

    // 地形数据
    this.map.nodeCells = new Map();
    for(const n of m.nodes) this.map.nodeCells.set(n.x+','+n.z,n);
  }

  buildMapDecor(){
    const m=this.map;
    if(m.id==='map1'){
      const w=m.world(10,4);
      const lab=this.label('DMZ · 业务互联','#5ce9ff',.95);
      lab.position.set(w.x,4.6,w.z); this.groups.terrain.add(lab);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(3.2,.05,6,48),new THREE.MeshBasicMaterial({color:0x5ce9ff,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false}));
      ring.rotation.x=Math.PI/2; ring.position.set(w.x,.18,w.z); this.groups.terrain.add(ring);
      this.dmzRing=ring;
    }
    if(m.id==='map2'){
      const w=m.world(10,7);
      const bandW=(m.w+1)*m.tile;
      const texCanvas=document.createElement('canvas'); texCanvas.width=512; texCanvas.height=64;
      const cx=texCanvas.getContext('2d');
      cx.fillStyle='rgba(255,184,92,.06)'; cx.fillRect(0,0,512,64);
      cx.strokeStyle='rgba(255,184,92,.55)'; cx.lineWidth=2;
      for(let i=0;i<12;i++){ cx.beginPath(); cx.moveTo(i*44,0); cx.lineTo(i*44+30,64); cx.stroke(); }
      const tex=new THREE.CanvasTexture(texCanvas); tex.colorSpace=THREE.SRGBColorSpace; tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(6,1);
      const band=new THREE.Mesh(new THREE.PlaneGeometry(bandW,m.tile*1.15),new THREE.MeshBasicMaterial({map:tex,color:0xffb85c,transparent:true,opacity:.34,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
      band.rotation.x=-Math.PI/2; band.position.set(0,.75,w.z); this.groups.terrain.add(band);
      this.flowBand=band; this.flowTex=tex;
      const lab=this.label('公网流 · PUBLIC TRAFFIC','#ffb85c',1.0);
      lab.position.set(0,4.6,w.z); this.groups.terrain.add(lab);
      const pgeo=new THREE.BufferGeometry(); const N=90, pos=new Float32Array(N*3);
      for(let i=0;i<N;i++){ pos[i*3]=(Math.random()-.5)*bandW; pos[i*3+1]=.9+Math.random()*.4; pos[i*3+2]=w.z+(Math.random()-.5)*m.tile; }
      pgeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      const pts=new THREE.Points(pgeo,new THREE.PointsMaterial({color:0xffd166,size:.3,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
      this.groups.terrain.add(pts); this.flowPoints=pts;
    }
    if(m.id==='map3'){
      const w=m.world(10,7);
      const g=new THREE.Group(); g.position.set(w.x,0,w.z);
      const field=new THREE.Mesh(new THREE.CylinderGeometry(m.tile*2.6,m.tile*2.9,4.5,32,1,true),new THREE.MeshBasicMaterial({color:0x6cf0a8,transparent:true,opacity:.08,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
      field.position.y=2.2; g.add(field);
      for(let i=0;i<3;i++){
        const r=new THREE.Mesh(new THREE.TorusGeometry(m.tile*2.7+i*.35,.05,6,64),new THREE.MeshBasicMaterial({color:0x6cf0a8,transparent:true,opacity:.35-i*.07,blending:THREE.AdditiveBlending,depthWrite:false}));
        r.rotation.x=Math.PI/2; r.position.y=.6+i*.9; g.add(r);
      }
      for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        const p=new THREE.Mesh(new THREE.CylinderGeometry(.28,.4,5.5,6),new THREE.MeshStandardMaterial({color:0x0c2a22,metalness:.7,roughness:.3,emissive:0x1a5a3a,emissiveIntensity:.7}));
        p.position.set(dx*m.tile*2.7,2.75,dz*m.tile*2.7); g.add(p);
        const tip=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),new THREE.MeshBasicMaterial({color:0x6cf0a8}));
        tip.position.set(p.position.x,5.6,p.position.z); g.add(tip);
      }
      const lab=this.label('气隙 · AIR GAP','#6cf0a8',1.1);
      lab.position.set(0,6.4,0); g.add(lab);
      this.groups.terrain.add(g); this.airGap=g;
    }
  }

  buildPortal(e,type){
    const color=e.color||0x5ce9ff;
    const g=new THREE.Group(); g.position.set(e.world.x,0,e.world.z);
    if(type==='entry'){
      const ringMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85});
      for(let i=0;i<3;i++){
        const r=new THREE.Mesh(new THREE.TorusGeometry(1.5+i*.35,.06,8,40),ringMat);
        r.rotation.x=Math.PI/2; r.position.y=.5+i*.12; g.add(r);
      }
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.35,.9,5,12,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
      beam.position.y=2.5; g.add(beam);
      const core=new THREE.Mesh(new THREE.OctahedronGeometry(.55,0),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.4,metalness:.4,roughness:.2}));
      core.position.y=2.0; g.add(core); g.userData.core=core;
      const lab=this.label(e.id+' · '+e.name,'#'+color.toString(16).padStart(6,'0'),1.0);
      lab.position.set(0,4.2,0); g.add(lab);
    } else {
      const coreMat=new THREE.MeshStandardMaterial({color:0xd8fff4,emissive:0x2fd6b8,emissiveIntensity:1.6,metalness:.6,roughness:.2,transparent:true,opacity:.95});
      const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(1.5,0),coreMat); crystal.position.y=2.4; g.add(crystal); g.userData.crystal=crystal;
      const base=new THREE.Mesh(new THREE.CylinderGeometry(2.0,2.4,1.0,8),new THREE.MeshStandardMaterial({color:0x0c2a33,metalness:.8,roughness:.3,emissive:0x0a3a3a,emissiveIntensity:.7}));
      base.position.y=.5; g.add(base);
      for(let i=0;i<3;i++){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(2.1+i*.35,.07,8,48),new THREE.MeshBasicMaterial({color:0x6cf0a8,transparent:true,opacity:.55}));
        ring.rotation.x=Math.PI/2; ring.position.y=1.0+i*.5; g.add(ring); g.userData['ring'+i]=ring;
      }
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,1.6,7,12,1,true),new THREE.MeshBasicMaterial({color:0x6cf0a8,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
      beam.position.y=4.5; g.add(beam);
      const lab=this.label(e.id+' · '+e.name,'#6cf0a8',1.0);
      lab.position.set(0,5.2,0); g.add(lab);
    }
    this.groups.terrain.add(g);
  }

  buildRoutes(){ this.updateRoutes([],[]); }

  flashRoutes(ids){
    this.routeFlash={ids:new Set(ids||[]),until:this.time+2.2};
  }

  updateRoutes(routes, preview){
    this.clearGroup(this.groups.routes);
    this.clearGroup(this.groups.preview);
    this.routeAnims=[];
    const build=(list,group,isPreview)=>{
      for(const r of list){
        if(!r.path || r.path.length<2) continue;
        const pts=[];
        for(const c of r.path){
          const w=this.map.world(c[0],c[1]);
          const p=new THREE.Vector3(w.x,.42,w.z);
          if(!pts.length || pts[pts.length-1].distanceToSquared(p)>.0001) pts.push(p);
        }
        if(pts.length<2) continue;
        const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');
        const color=r.color!=null?r.color:0x5ce9ff;
        const lineMat=isPreview
          ? new THREE.LineDashedMaterial({color:0xffd27a,dashSize:.9,gapSize:.55,transparent:true,opacity:.95,depthWrite:false})
          : new THREE.LineBasicMaterial({color,transparent:true,opacity:.72,depthWrite:false});
        let linePts=curve.getPoints(160);
        if(linePts.some(p=>!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.z))) continue;
        const geo=new THREE.BufferGeometry().setFromPoints(linePts);
        const line=new THREE.Line(geo,lineMat);
        if(isPreview) line.computeLineDistances();
        line.renderOrder=3;
        group.add(line);
        const curveLen=curve.getLength();
        if(!isFinite(curveLen) || curveLen<.1) continue;
        // 发光底衬
        const glowMat=new THREE.MeshBasicMaterial({color:isPreview?0xffb85c:color,transparent:true,opacity:isPreview?.25:.12,depthWrite:false,blending:THREE.AdditiveBlending});
        const glow=new THREE.Mesh(new THREE.TubeGeometry(curve,120,isPreview?.10:.07,4,false), glowMat);
        glow.renderOrder=2; group.add(glow);
        // 箭头
        const len=curveLen;
        const n=Math.max(1,Math.floor(len/10));
        for(let i=1;i<=n;i++){
          const t=i/(n+1);
          const p=curve.getPointAt(t), tan=curve.getTangentAt(t);
          if(!isFinite(p.x)||!isFinite(tan.x)) continue;
          const cone=new THREE.Mesh(new THREE.ConeGeometry(.34,.95,6), new THREE.MeshBasicMaterial({color:isPreview?0xffd27a:color,transparent:true,opacity:.85}));
          cone.position.copy(p); cone.position.y+=.18;
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tan.normalize());
          group.add(cone);
        }
        // 流动光点
        const dots=[];
        const dotMat=new THREE.MeshBasicMaterial({color:isPreview?0xffe6a8:color,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
        const dotGeo=new THREE.SphereGeometry(isPreview?.15:.11,6,6);
        const count=Math.max(3,Math.floor(len/6));
        for(let i=0;i<count;i++){
          const d=new THREE.Mesh(dotGeo,dotMat); group.add(d); dots.push({mesh:d,off:i/count});
        }
        this.routeAnims.push({curve,dots,isPreview,entry:r.entryId,exit:r.exitId,lineMat,baseLine:isPreview?.95:.72,glowMat,baseGlow:isPreview?.25:.12});
      }
    };
    build(routes,this.groups.routes,false);
    build(preview,this.groups.preview,true);
    if(preview.length){
      const lab=this.label('预览路线 · PREVIEW','#ffd27a',.9);
      lab.position.set(0,7.5,0); this.groups.preview.add(lab);
    }
  }

  /* ---------------- 模型：塔 ---------------- */
  towerModel(type, level=1, branch=null, nodeVariant=false){
    const def=DATA.TOWERS[type];
    const g=new THREE.Group();
    const dark=new THREE.MeshStandardMaterial({color:0x122b38,metalness:.75,roughness:.32});
    const mid=new THREE.MeshStandardMaterial({color:0x2a5a70,metalness:.7,roughness:.3});
    const accent=new THREE.MeshStandardMaterial({color:def.color,emissive:def.color,emissiveIntensity:1.1,metalness:.5,roughness:.25});
    const accent2=new THREE.MeshStandardMaterial({color:def.accent,emissive:def.accent,emissiveIntensity:1.4,metalness:.4,roughness:.2});
    const glass=new THREE.MeshStandardMaterial({color:0x9be9ff,emissive:0x2fd6b8,emissiveIntensity:1.0,transparent:true,opacity:.55,metalness:.2,roughness:.1});
    const parts={spinners:[],pulsers:[],barrels:[]};
    const add=(mesh,x=0,y=0,z=0)=>{ mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; g.add(mesh); return mesh; };

    // 底座
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.65,.42,6),dark); add(base,0,.21,0);
    const baseRing=new THREE.Mesh(new THREE.TorusGeometry(1.35,.07,6,30),accent); baseRing.rotation.x=Math.PI/2; add(baseRing,0,.46,0);
    parts.pulsers.push({mesh:baseRing,kind:'ring'});

    if(type==='firewall'){
      const wallH=level>1?2.5:1.9;
      for(let i=0;i<3;i++){
        const a=(i-1)*.62;
        const wall=new THREE.Mesh(new THREE.BoxGeometry(1.25,wallH,.3), mid);
        wall.position.set(Math.sin(a)*1.0, .42+wallH/2, -Math.cos(a)*.85);
        wall.rotation.y=a; add(wall);
        const strip=new THREE.Mesh(new THREE.BoxGeometry(1.1,.08,.32),accent);
        strip.position.set(wall.position.x, .42+wallH*.72, wall.position.z-0.02); strip.rotation.y=a; add(strip);
      }
      const core=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,1.2,6),accent); add(core,0,.95,0); parts.pulsers.push({mesh:core,kind:'core'});
      const shield=new THREE.Mesh(new THREE.SphereGeometry(1.45,16,10,0,6.28,0,1.2),glass); add(shield,0,1.0,0); parts.shield=shield;
      if(level>1){
        for(let i=0;i<4;i++){ const s=new THREE.Mesh(new THREE.ConeGeometry(.18,.7,4),accent2); const a=i*1.57; add(s,Math.cos(a)*1.2,2.55,Math.sin(a)*1.2); }
      }
      const turret=new THREE.Group(); turret.position.y=1.1; g.add(turret); parts.barrels.push(turret);
    }
    else if(type==='honeypot'){
      const pot=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.25,1.5,12),mid); add(pot,0,.95,0);
      const honey=new THREE.Mesh(new THREE.CylinderGeometry(.82,.9,.18,16),new THREE.MeshStandardMaterial({color:0xffd166,emissive:0xffb85c,emissiveIntensity:1.6,roughness:.2,metalness:.2})); add(honey,0,1.78,0);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(1.02,.1,8,24),accent); rim.rotation.x=Math.PI/2; add(rim,0,1.8,0);
      const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,1.5,6),mid); add(antenna,0,2.4,0);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.22,10,10),accent2); add(bulb,0,3.15,0); parts.pulsers.push({mesh:bulb,kind:'core'});
      const ringMat=new THREE.MeshBasicMaterial({color:0xffb85c,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false});
      for(let i=0;i<(branch==='lure'?4:2);i++){
        const r=new THREE.Mesh(new THREE.TorusGeometry(1.5+i*.3,.045,6,36),ringMat.clone());
        r.rotation.x=Math.PI/2; r.position.y=.8+i*.25; add(r); parts.pulsers.push({mesh:r,kind:'lure'});
      }
      if(level>1){
        const r=new THREE.Mesh(new THREE.TorusGeometry(1.85,.06,6,40),accent2);
        r.rotation.x=Math.PI/2; r.position.y=.55; add(r); parts.spinners.push({mesh:r,axis:'y',speed:.5});
        const cap=new THREE.Mesh(new THREE.CylinderGeometry(.6,.9,.25,12),accent);
        add(cap,0,2.02,0); parts.pulsers.push({mesh:cap,kind:'core'});
      }
      if(branch==='armor'){
        for(let i=0;i<4;i++){ const a=i*1.57; const p=new THREE.Mesh(new THREE.BoxGeometry(.5,1.1,.18),new THREE.MeshStandardMaterial({color:0x6a4a1a,metalness:.8,roughness:.35,emissive:0x3a2400,emissiveIntensity:.5})); p.position.set(Math.cos(a)*1.2,1.0,Math.sin(a)*1.2); p.rotation.y=-a; add(p); }
      }
    }
    else if(type==='netgate'){
      const h=level>1?3.6:2.9;
      for(const sx of [-1,1]){
        const p=new THREE.Mesh(new THREE.BoxGeometry(.55,h,.7),mid); add(p,sx*1.25,h/2+.42,0);
        const cap=new THREE.Mesh(new THREE.BoxGeometry(.75,.22,.9),accent); add(cap,sx*1.25,h+.5,0);
      }
      const beam=new THREE.Mesh(new THREE.BoxGeometry(2.9,.35,.55),dark); add(beam,0,h+.7,0);
      for(let i=0;i<5;i++){
        const bar=new THREE.Mesh(new THREE.BoxGeometry(.08,.1,2.2),accent2);
        bar.position.set(-.9+i*.45, .8+i*.38, 0); add(bar);
      }
      const field=new THREE.Mesh(new THREE.PlaneGeometry(2.2,h-.4),new THREE.MeshBasicMaterial({color:0x9be9ff,transparent:true,opacity:.18,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
      field.position.y=h/2+.3; g.add(field); parts.field=field;
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.7,.05,6,36),accent); ring.rotation.x=Math.PI/2; add(ring,0,h+.9,0); parts.spinners.push({mesh:ring,axis:'y',speed:.8});
      if(level>1){ const ring2=new THREE.Mesh(new THREE.TorusGeometry(1.2,.04,6,30),accent2); ring2.rotation.x=Math.PI/2; add(ring2,0,h+1.35,0); parts.spinners.push({mesh:ring2,axis:'y',speed:-1.1}); }
    }
    else if(type==='interceptor'){
      const head=new THREE.Group(); head.position.y=1.35; g.add(head);
      const body=new THREE.Mesh(new THREE.BoxGeometry(1.1,.8,1.5),mid); head.add(body); body.castShadow=true;
      const barrelLen=level>1?2.6:2.0;
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.13,.18,barrelLen,8),accent2);
      barrel.rotation.x=Math.PI/2; barrel.position.set(0,.1,barrelLen/2+.6); head.add(barrel); barrel.castShadow=true;
      const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.3,8),accent); muzzle.rotation.x=Math.PI/2; muzzle.position.set(0,.1,barrelLen+.7); head.add(muzzle);
      const fin=new THREE.Mesh(new THREE.BoxGeometry(.1,.7,1.0),accent); fin.position.set(0,.55,-.2); head.add(fin);
      parts.head=head; parts.barrels.push(head);
      if(branch==='pierce'){
        const rail=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,3.4),new THREE.MeshStandardMaterial({color:0xbff9ff,emissive:0x5ce9ff,emissiveIntensity:1.4,metalness:.6,roughness:.2})); rail.position.set(0,.2,1.7); head.add(rail);
        for(let i=0;i<3;i++){ const coil=new THREE.Mesh(new THREE.TorusGeometry(.28,.05,6,16),accent2); coil.rotation.x=Math.PI/2; coil.position.set(0,.2,.6+i*.65); head.add(coil); }
      }
      if(branch==='suppress'){
        const dish=new THREE.Mesh(new THREE.CylinderGeometry(.55,.15,.5,12),new THREE.MeshStandardMaterial({color:0x9be9ff,emissive:0x5ce9ff,emissiveIntensity:.9,metalness:.5,roughness:.3})); dish.rotation.x=Math.PI/2; dish.position.set(0,.1,1.5); head.add(dish);
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.6,.05,6,24),accent2); ring.position.set(0,.1,1.75); head.add(ring);
      }
      const baseRing=new THREE.Mesh(new THREE.TorusGeometry(1.5,.06,6,30),accent); baseRing.rotation.x=Math.PI/2; add(baseRing,0,.5,0);
    }
    else if(type==='sandbox'){
      const body=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,1.6),dark); body.rotation.y=Math.PI/4; add(body,0,1.5,0);
      const frame=new THREE.Mesh(new THREE.BoxGeometry(1.85,1.85,1.85),new THREE.MeshBasicMaterial({color:0xb58cff,wireframe:true,transparent:true,opacity:.45})); frame.rotation.y=Math.PI/4; add(frame,0,1.5,0);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.55,16,12),new THREE.MeshStandardMaterial({color:0xd9c6ff,emissive:0xb58cff,emissiveIntensity:1.5,roughness:.15,metalness:.3})); add(eye,0,2.1,0); parts.eye=eye;
      const iris=new THREE.Mesh(new THREE.SphereGeometry(.22,12,10),new THREE.MeshBasicMaterial({color:0x06131a})); add(iris,0,2.1,.45);
      const ringMat=new THREE.MeshBasicMaterial({color:0xb58cff,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false});
      for(let i=0;i<3;i++){ const r=new THREE.Mesh(new THREE.TorusGeometry(1.2+i*.35,.035,6,36),ringMat.clone()); r.rotation.x=Math.PI/2; add(r,0,.55+i*.5,0); parts.spinners.push({mesh:r,axis:'y',speed:(i%2?-.6:.6)}); }
      if(level>1){ const r4=new THREE.Mesh(new THREE.TorusGeometry(2.0,.04,6,40),accent); r4.rotation.x=Math.PI/2; add(r4,0,1.8,0); parts.spinners.push({mesh:r4,axis:'y',speed:.4}); }
    }
    else if(type==='repair'){
      const col=new THREE.Mesh(new THREE.CylinderGeometry(.55,.8,2.0,8),mid); add(col,0,1.3,0);
      const orb=new THREE.Mesh(new THREE.SphereGeometry(.55,14,12),new THREE.MeshStandardMaterial({color:0xb6ffd8,emissive:0x6cf0a8,emissiveIntensity:1.7,roughness:.15,metalness:.3})); add(orb,0,2.6,0); parts.orb=orb;
      const cross=new THREE.Group(); cross.position.y=2.6; g.add(cross);
      const c1=new THREE.Mesh(new THREE.BoxGeometry(1.9,.16,.32),accent); cross.add(c1);
      const c2=new THREE.Mesh(new THREE.BoxGeometry(.32,.16,1.9),accent); cross.add(c2);
      parts.spinners.push({mesh:cross,axis:'y',speed:.9});
      for(let i=0;i<3;i++){
        const a=i*2.094;
        const arm=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,1.3),mid); arm.position.set(Math.cos(a)*.75,1.2,Math.sin(a)*.75); arm.rotation.y=-a; add(arm);
        const tip=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),accent2); add(tip,Math.cos(a)*1.35,1.25,Math.sin(a)*1.35);
      }
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.6,.05,6,36),accent2); ring.rotation.x=Math.PI/2; add(ring,0,.6,0); parts.spinners.push({mesh:ring,axis:'y',speed:-.5});
      if(level>1){ const ring2=new THREE.Mesh(new THREE.TorusGeometry(2.1,.04,6,40),accent); ring2.rotation.x=Math.PI/2; add(ring2,0,1.6,0); parts.spinners.push({mesh:ring2,axis:'y',speed:.35}); }
    }

    g.userData.parts=parts;
    g.userData.def=def;
    g.userData.type=type;
    return g;
  }

  /* ---------------- 模型：敌人 ---------------- */
  enemyModel(type){
    const def=DATA.ENEMIES[type]||{};
    const g=new THREE.Group();
    const parts={legs:[],segments:[],spinners:[],wings:[],shell:null};
    const add=(mesh,x=0,y=0,z=0)=>{ mesh.position.set(x,y,z); mesh.castShadow=true; g.add(mesh); return mesh; };
    const dark=new THREE.MeshStandardMaterial({color:0x1a2430,metalness:.7,roughness:.35});
    const accent=new THREE.MeshStandardMaterial({color:def.color||0xffffff,emissive:def.color||0xffffff,emissiveIntensity:.9,metalness:.4,roughness:.3});
    const glow=new THREE.MeshBasicMaterial({color:def.color||0xffffff,transparent:true,opacity:.8});

    if(type==='worm'){
      const head=new THREE.Mesh(new THREE.SphereGeometry(.55,12,10),accent); add(head,0,.55,0);
      const eyeMat=new THREE.MeshBasicMaterial({color:0x12240a});
      for(const sx of [-1,1]){ const e=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),eyeMat); add(e,sx*.22,.68,.42); }
      for(let i=0;i<4;i++){
        const s=new THREE.Mesh(new THREE.SphereGeometry(.52-i*.07,10,8),new THREE.MeshStandardMaterial({color:0x3f7a2a,emissive:0x1a3a10,emissiveIntensity:.4,metalness:.4,roughness:.5}));
        s.position.set(0,.5,-.75-i*.62); add(s); parts.segments.push({mesh:s,base:s.position.clone(),i});
      }
      const mand=new THREE.Mesh(new THREE.ConeGeometry(.12,.5,4),glow); mand.rotation.x=Math.PI/2; add(mand,.28,.35,.5);
      const mand2=mand.clone(); mand2.position.x=-.28; g.add(mand2);
    }
    else if(type==='flood'){
      for(let i=0;i<5;i++){
        const r=.5+Math.random()*.35;
        const s=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),new THREE.MeshStandardMaterial({color:i%2?0xff8a5c:0xd9532c,emissive:0x7a2410,emissiveIntensity:.6,metalness:.3,roughness:.5,transparent:true,opacity:.95}));
        s.position.set((Math.random()-.5)*1.2,.55+Math.random()*.5,(Math.random()-.5)*1.2); add(s); parts.segments.push({mesh:s,base:s.position.clone(),i,ph:Math.random()*6});
      }
      const eyeMat=new THREE.MeshBasicMaterial({color:0x2a0a02});
      for(const [x,z] of [[-.35,.55],[.35,.55],[0,-.1]]){ const e=new THREE.Mesh(new THREE.SphereGeometry(.14,8,8),eyeMat); add(e,x,.85,z); }
      for(let i=0;i<5;i++){ const sp=new THREE.Mesh(new THREE.ConeGeometry(.1,.4,4),glow); const a=i*1.256; sp.position.set(Math.cos(a)*.85,.4,Math.sin(a)*.85); sp.rotation.z=Math.cos(a)*.8; sp.rotation.x=Math.sin(a)*.8; add(sp); }
    }
    else if(type==='trojan'){
      const body=new THREE.Mesh(new THREE.BoxGeometry(1.15,.9,1.5),new THREE.MeshStandardMaterial({color:0x6b4a9a,metalness:.6,roughness:.35,emissive:0x2a1040,emissiveIntensity:.5})); add(body,0,.65,0);
      const head=new THREE.Mesh(new THREE.BoxGeometry(.65,.55,.7),dark); add(head,0,1.25,.35);
      const shell=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.4,1.9),new THREE.MeshStandardMaterial({color:0xc7a6ff,transparent:true,opacity:.32,metalness:.2,roughness:.2,emissive:0x7a4fbf,emissiveIntensity:.3})); add(shell,0,.7,0); parts.shell=shell;
      for(let i=0;i<4;i++){ const leg=new THREE.Mesh(new THREE.BoxGeometry(.12,.55,.12),dark); const sx=i<2?-1:1, sz=i%2?-.45:.45; add(leg,sx*.6,.28,sz); parts.legs.push({mesh:leg,ph:i}); }
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),new THREE.MeshBasicMaterial({color:0xff5d72})); add(eye,0,1.3,.7);
    }
    else if(type==='ransom'){
      const body=new THREE.Mesh(new THREE.SphereGeometry(.62,12,10),new THREE.MeshStandardMaterial({color:0x8a1a28,metalness:.6,roughness:.35,emissive:0x5a0610,emissiveIntensity:.8})); add(body,0,.75,0);
      const lock=new THREE.Mesh(new THREE.BoxGeometry(.7,.55,.35),accent); add(lock,0,1.35,0);
      const shackle=new THREE.Mesh(new THREE.TorusGeometry(.26,.07,6,16,Math.PI),accent); add(shackle,0,1.62,0);
      for(let i=0;i<6;i++){
        const a=i/6*6.28;
        const leg=new THREE.Mesh(new THREE.CylinderGeometry(.06,.04,1.15,5),dark);
        leg.position.set(Math.cos(a)*.75,.35,Math.sin(a)*.75); leg.rotation.z=Math.cos(a)*1.0; leg.rotation.x=Math.sin(a)*1.0; add(leg);
        parts.legs.push({mesh:leg,ph:i*1.1,base:leg.rotation.clone()});
      }
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),new THREE.MeshBasicMaterial({color:0xffd0d6})); add(eye,0,.9,.55);
    }
    else if(type==='hotspot'){
      const core=new THREE.Mesh(new THREE.OctahedronGeometry(.48,0),accent); add(core,0,3.4,0);
      const ringMat=new THREE.MeshBasicMaterial({color:0xffd166,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false});
      for(let i=0;i<3;i++){ const r=new THREE.Mesh(new THREE.TorusGeometry(.7+i*.25,.035,6,28),ringMat.clone()); r.rotation.x=Math.PI/2; add(r,0,3.4,0); parts.spinners.push({mesh:r,axis:'y',speed:.5+i*.3}); }
      for(const sx of [-1,1]){ const w=new THREE.Mesh(new THREE.BoxGeometry(.9,.04,.5),glow); add(w,sx*.8,3.3,0); parts.wings.push({mesh:w,sx}); }
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.14,8,8),new THREE.MeshBasicMaterial({color:0x3a2600})); add(eye,0,3.4,.4);
    }
    else if(type==='shielder'){
      const core=new THREE.Mesh(new THREE.SphereGeometry(.62,14,12),new THREE.MeshStandardMaterial({color:0x2a6a8a,metalness:.6,roughness:.3,emissive:0x0a3a4a,emissiveIntensity:.8})); add(core,0,.8,0);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.2,10,10),new THREE.MeshBasicMaterial({color:0x8ff7ff})); add(eye,0,.9,.5);
      for(let i=0;i<6;i++){
        const a=i/6*6.28;
        const p=new THREE.Mesh(new THREE.BoxGeometry(.55,.7,.12),new THREE.MeshStandardMaterial({color:0x4fc3ff,emissive:0x2a7a9a,emissiveIntensity:.8,transparent:true,opacity:.75,metalness:.5,roughness:.3}));
        p.position.set(Math.cos(a)*1.0,.85,Math.sin(a)*1.0); p.rotation.y=-a; add(p);
      }
      const aura=new THREE.Mesh(new THREE.TorusGeometry(1.3,.05,6,32),new THREE.MeshBasicMaterial({color:0x4fc3ff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
      aura.rotation.x=Math.PI/2; add(aura,0,.4,0); parts.aura=aura; parts.spinners.push({mesh:aura,axis:'y',speed:.4});
    }
    else if(type==='boss_wankui'){
      const segs=8;
      for(let i=0;i<segs;i++){
        const r=1.5-i*.09;
        const s=new THREE.Mesh(new THREE.SphereGeometry(r,14,12),new THREE.MeshStandardMaterial({color:i%2?0x8a1020:0x5a0812,metalness:.7,roughness:.35,emissive:0x3a0208,emissiveIntensity:.6}));
        s.position.set(0,1.1,-i*1.15); add(s); parts.segments.push({mesh:s,base:s.position.clone(),i});
      }
      const head=new THREE.Mesh(new THREE.SphereGeometry(1.7,16,12),new THREE.MeshStandardMaterial({color:0xc0203a,metalness:.6,roughness:.3,emissive:0x5a0610,emissiveIntensity:.9})); add(head,0,1.2,0); parts.head=head;
      const eyeMat=new THREE.MeshBasicMaterial({color:0xffe0e4});
      for(let i=0;i<5;i++){ const e=new THREE.Mesh(new THREE.SphereGeometry(.16,8,8),eyeMat); e.position.set((i-2)*.5,1.55,.8+Math.abs(i-2)*.1); add(e); }
      for(let i=0;i<6;i++){
        const a=i/6*6.28;
        const leg=new THREE.Mesh(new THREE.CylinderGeometry(.09,.05,2.2,5),dark); leg.position.set(Math.cos(a)*1.4,.3,Math.sin(a)*1.4); leg.rotation.z=Math.cos(a)*1.2; leg.rotation.x=Math.sin(a)*1.2; add(leg); parts.legs.push({mesh:leg,ph:i,base:leg.rotation.clone()});
      }
      for(let i=0;i<5;i++){ const sp=new THREE.Mesh(new THREE.ConeGeometry(.22,1.1,5),accent); const a=(i-2)*.45; add(sp,Math.sin(a)*1.2,2.8,Math.cos(a)*.2); }
      const crown=new THREE.Mesh(new THREE.TorusGeometry(1.9,.1,6,28),accent); crown.rotation.x=Math.PI/2; add(crown,0,2.2,0); parts.spinners.push({mesh:crown,axis:'y',speed:.3});
    }
    else if(type==='boss_shenlou'){
      const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,1),new THREE.MeshStandardMaterial({color:0xd9c6ff,emissive:0xb58cff,emissiveIntensity:1.5,metalness:.4,roughness:.2,transparent:true,opacity:.9})); add(core,0,2.2,0); parts.core=core;
      for(let i=0;i<4;i++){
        const r=new THREE.Mesh(new THREE.TorusGeometry(1.6+i*.45,.06,6,40),new THREE.MeshBasicMaterial({color:0xb58cff,transparent:true,opacity:.45-i*.07,blending:THREE.AdditiveBlending,depthWrite:false}));
        r.rotation.x=Math.PI/2+(i%2?.3:-.3); add(r,0,2.0+i*.3,0); parts.spinners.push({mesh:r,axis:'y',speed:.3+i*.12});
      }
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.35,12,10),new THREE.MeshBasicMaterial({color:0x06131a})); add(eye,0,2.2,.8);
      const pupil=new THREE.Mesh(new THREE.SphereGeometry(.14,8,8),new THREE.MeshBasicMaterial({color:0xb58cff})); add(pupil,0,2.2,1.05);
      for(let i=0;i<3;i++){ const shard=new THREE.Mesh(new THREE.OctahedronGeometry(.4,0),new THREE.MeshStandardMaterial({color:0x9a7ad0,emissive:0x6a4a9a,emissiveIntensity:.8,metalness:.5,roughness:.3,transparent:true,opacity:.8})); const a=i*2.094; add(shard,Math.cos(a)*2.2,1.6+Math.sin(a)*.6,Math.sin(a)*2.2); parts.shards=parts.shards||[]; parts.shards.push({mesh:shard,base:shard.position.clone(),ph:a}); }
    }
    else if(type==='boss_zheying'){
      const cloak=new THREE.Mesh(new THREE.ConeGeometry(1.5,3.6,8,1,true),new THREE.MeshStandardMaterial({color:0x12040a,metalness:.6,roughness:.4,emissive:0x2a0208,emissiveIntensity:.5,side:THREE.DoubleSide,transparent:true,opacity:.95})); add(cloak,0,1.8,0); parts.cloak=cloak;
      const core=new THREE.Mesh(new THREE.OctahedronGeometry(.55,0),new THREE.MeshStandardMaterial({color:0xff5d72,emissive:0xff5d72,emissiveIntensity:1.8,metalness:.4,roughness:.2})); add(core,0,1.7,0); parts.core=core;
      for(let i=0;i<3;i++){ const s=new THREE.Mesh(new THREE.TetrahedronGeometry(.55,0),new THREE.MeshStandardMaterial({color:0x6a0a18,emissive:0x3a0208,emissiveIntensity:.8,metalness:.6,roughness:.3})); const a=i*2.094; add(s,Math.cos(a)*1.9,2.6+Math.sin(a)*.4,Math.sin(a)*1.9); parts.shards=parts.shards||[]; parts.shards.push({mesh:s,base:s.position.clone(),ph:a}); }
      for(let i=0;i<4;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(1.3+i*.25,.04,6,32),new THREE.MeshBasicMaterial({color:0xff5d72,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false})); ring.rotation.x=Math.PI/2; add(ring,0,.5+i*.45,0); parts.spinners.push({mesh:ring,axis:'y',speed:.2+i*.1}); }
      parts.armor=[];
      for(let i=0;i<4;i++){ const p=new THREE.Mesh(new THREE.BoxGeometry(.7,1.4,.2),new THREE.MeshStandardMaterial({color:0x2a0a10,metalness:.8,roughness:.3,emissive:0x1a0208,emissiveIntensity:.5})); const a=i*1.57; p.position.set(Math.cos(a)*1.15,1.6,Math.sin(a)*1.15); p.rotation.y=-a; p.visible=false; add(p); parts.armor.push(p); }
    }

    g.userData.parts=parts; g.userData.type=type; g.userData.def=def;
    return g;
  }

  /* ---------------- 单位管理 ---------------- */
  addTower(t){
    const model=this.towerModel(t.type,t.level,t.branch, t.cell && this.map.cell(t.cell.x,t.cell.z)==='n');
    model.userData.id=t.id; model.userData.level=t.level; model.userData.branch=t.branch; model.userData.buildT=0;
    if(t.type==='interceptor') model.rotation.y=t.facing||0;
    const cell=this.map.world(t.cell.x,t.cell.z);
    const baseY=this.map.cell(t.cell.x,t.cell.z)==='p'?1.21:0.55;
    model.position.set(cell.x,baseY,cell.z);
    const bar=this.makeHealthBar(t.type==='netgate'?2.0:1.7, baseY+3.6);
    model.add(bar);
    const sel=new THREE.Mesh(new THREE.TorusGeometry(1.75,.05,6,40),new THREE.MeshBasicMaterial({color:0x5ce9ff,transparent:true,opacity:.0,blending:THREE.AdditiveBlending,depthWrite:false}));
    sel.rotation.x=Math.PI/2; sel.position.y=.08; model.add(sel);
    const shield=new THREE.Mesh(new THREE.SphereGeometry(1.8,16,12),new THREE.MeshBasicMaterial({color:0x4fc3ff,transparent:true,opacity:.0,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    shield.position.y=1.1; model.add(shield);
    const enc=new THREE.Sprite(new THREE.SpriteMaterial({map:this.makeIconTexture('🔒','#b58cff'),transparent:true,depthWrite:false}));
    enc.scale.set(1.1,1.1,1); enc.position.y=3.9; enc.visible=false; model.add(enc);
    this.groups.units.add(model);
    this.towerMeshes.set(t.id,{model,bar,sel,shield,enc,baseY,tower:t});
    if(t) t.model=model;
    return model;
  }

  removeMesh(m){ if(!m) return; if(m.parent) m.parent.remove(m); if(m.geometry && m.geometry.dispose) m.geometry.dispose(); if(m.material){ if(Array.isArray(m.material)) m.material.forEach(x=>x.dispose&&x.dispose()); else m.material.dispose&&m.material.dispose(); } }

  clearGroup(g){
    while(g.children.length){ const c=g.children.pop(); c.traverse&&c.traverse(o=>{ if(o.geometry) o.geometry.dispose&&o.geometry.dispose(); if(o.material){ if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose&&m.dispose()); else o.material.dispose&&o.material.dispose(); } }); }
  }

  makeIconTexture(text,color){
    const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
    x.clearRect(0,0,64,64); x.font='40px sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillStyle=color; x.fillText(text,32,34);
    const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
  }

  makeHealthBar(width=1.7,y=0){
    const g=new THREE.Group();
    const bg=new THREE.Mesh(new THREE.PlaneGeometry(width,.16),new THREE.MeshBasicMaterial({color:0x001018,transparent:true,opacity:.85,depthWrite:false,depthTest:false}));
    const fill=new THREE.Mesh(new THREE.PlaneGeometry(width,.12),new THREE.MeshBasicMaterial({color:0x6cf0a8,transparent:true,opacity:.95,depthWrite:false,depthTest:false}));
    fill.position.z=.01;
    g.add(bg); g.add(fill); g.position.y=y; g.userData={fill,width}; g.renderOrder=10;
    return g;
  }

  updateTowerVisual(t){
    const v=this.towerMeshes.get(t.id); if(!v) return;
    const {model,bar,sel,shield,enc}=v;
    // 等级/分支变化重建
    if(model.userData.level!==t.level || model.userData.branch!==t.branch){
      const pos=model.position.clone();
      this.groups.units.remove(model);
      const nm=this.towerModel(t.type,t.level,t.branch, this.map.cell(t.cell.x,t.cell.z)==='n');
      nm.position.copy(pos); nm.add(bar); nm.add(sel); nm.add(shield); nm.add(enc);
      nm.userData.id=t.id; nm.userData.level=t.level; nm.userData.branch=t.branch; nm.userData.buildT=0;
      if(t.type==='interceptor') nm.rotation.y=t.facing||0;
      this.groups.units.add(nm); this.towerMeshes.set(t.id,{...v,model:nm});
      return;
    }
    model.userData.level=t.level; model.userData.branch=t.branch;
    const ratio=Math.max(0,t.hp/t.maxHp);
    bar.userData.fill.scale.x=Math.max(.001,ratio);
    bar.userData.fill.position.x=-bar.userData.width*(1-ratio)/2;
    bar.userData.fill.material.color.setHex(ratio>.5?0x6cf0a8:ratio>.25?0xffb85c:0xff5d72);
    sel.material.opacity = t.selected? .85 : 0;
    const encOn = t.encryptedUntil > (this.game?this.game.time:0);
    enc.visible=!!encOn;
    const shOn = t.shield>0;
    shield.material.opacity = shOn? .28 : 0;
    shield.rotation.y += .01;
    if(t.hitFlash>0){ model.traverse(o=>{ if(o.material && o.material.emissive){ if(o.userData._origEmissive==null) o.userData._origEmissive=o.material.emissive.getHex(); o.material.emissive.setHex(0xffffff); } }); }
    else { model.traverse(o=>{ if(o.material && o.material.emissive && o.userData._origEmissive!=null){ o.material.emissive.setHex(o.userData._origEmissive); } }); }
  }

  addEnemy(e){
    const model=this.enemyModel(e.type);
    model.userData.id=e.id;
    const bar=this.makeHealthBar(e.boss?3.2:1.35, e.boss?4.6:(e.type==='hotspot'?4.3:1.9));
    model.add(bar);
    this.groups.units.add(model);
    this.enemyMeshes.set(e.id,{model,bar});
    return model;
  }

  updateEnemyVisual(e){
    const v=this.enemyMeshes.get(e.id); if(!v) return;
    const {model,bar}=v;
    const y = e.flying? 0 : 0;
    if(e.dead){
      const k=Math.min(1,(e.deathT||0)/.55);
      if(model.userData.deathScale==null) model.userData.deathScale=model.scale.x||1;
      model.scale.setScalar(Math.max(.02,model.userData.deathScale*(1-k*.82)));
      model.position.set(e.pos.x, -k*1.1, e.pos.z);
      model.rotation.y+=.08;
      if(bar) bar.visible=false;
      if(v.statusRing) v.statusRing.visible=false;
      if(v.shieldMesh) v.shieldMesh.visible=false;
      return;
    }
    model.position.set(e.pos.x, y, e.pos.z);
    if(!e.dead && (e.spawnT||0)<.35){ const k=Math.max(.02,Math.min(1,(e.spawnT||0)/.35)); model.scale.setScalar(k); }
    else if(!e.dead && ((!e.boss && Math.abs(model.scale.x-1)>.01) || (e.boss && model.scale.x<1))) model.scale.setScalar(1);
    if(isFinite(e.angle)) model.rotation.y=e.angle;
    const ratio=Math.max(0,e.hp/e.maxHp);
    bar.userData.fill.scale.x=Math.max(.001,ratio);
    bar.userData.fill.position.x=-bar.userData.width*(1-ratio)/2;
    bar.userData.fill.material.color.setHex(ratio>.5?0x6cf0a8:ratio>.25?0xffb85c:0xff5d72);
    if(e.shield>0){
      if(!v.shieldMesh){
        const s=new THREE.Mesh(new THREE.SphereGeometry(e.boss?2.4:1.15,16,12),new THREE.MeshBasicMaterial({color:0x4fc3ff,transparent:true,opacity:.25,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false}));
        s.position.y=e.boss?1.8:.8; model.add(s); v.shieldMesh=s;
      }
      v.shieldMesh.visible=true; v.shieldMesh.rotation.y+=.02;
    } else if(v.shieldMesh) v.shieldMesh.visible=false;
    if(e.disguised && !e.revealed){
      const parts=model.userData.parts;
      if(parts.shell) parts.shell.visible=true;
      model.traverse(o=>{ if(o.material && o.material.transparent && o.material.opacity<.5) o.material.opacity=Math.min(.55,o.material.opacity); });
    } else if(model.userData.parts.shell){ model.userData.parts.shell.visible=false; }
    if(e.hitFlash>0){
      model.traverse(o=>{ if(o.material && o.material.emissive){ if(o.userData._oe==null) o.userData._oe=o.material.emissive.getHex(); o.material.emissive.setHex(0xffffff); } });
    } else {
      model.traverse(o=>{ if(o.material && o.material.emissive && o.userData._oe!=null){ o.material.emissive.setHex(o.userData._oe); } });
    }
    if(!v.statusRing){
      const sr=new THREE.Mesh(new THREE.RingGeometry(e.boss?1.9:.85,e.boss?2.15:1.0,32),new THREE.MeshBasicMaterial({color:0xffb85c,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
      sr.rotation.x=-Math.PI/2; sr.position.y=.12; model.add(sr); v.statusRing=sr;
    }
    const now=this.game?this.game.time:0;
    const rooted=e.rootUntil>now, slowed=e.slowUntil>now;
    v.statusRing.visible=rooted||slowed;
    if(v.statusRing.visible){ v.statusRing.material.color.setHex(rooted?0xffb85c:0x8ff7ff); v.statusRing.scale.setScalar(1+Math.sin(this.time*6)*.08); }
  }

  removeTower(id){
    const v=this.towerMeshes.get(id); if(!v) return;
    this.groups.units.remove(v.model); this.towerMeshes.delete(id);
  }
  wreckTower(id){
    const v=this.towerMeshes.get(id); if(!v) return;
    this.towerMeshes.delete(id);
    const m=v.model;
    if(v.bar) v.bar.visible=false;
    if(v.sel) v.sel.material.opacity=0;
    if(v.shield) v.shield.material.opacity=0;
    if(v.enc) v.enc.visible=false;
    const baseY=m.position.y;
    this.effects.push({mesh:m,t:0,dur:.5,update:(e,dt)=>{
      e.t+=dt; const k=Math.min(1,e.t/.5);
      m.scale.setScalar(Math.max(.02,1-k*.75));
      m.position.y=baseY-k*1.4;
      m.rotation.z=k*.5;
      if(e.t>=.5){ this.clearGroup(m); this.groups.units.remove(m); return false; }
      return true;
    }});
  }
  removeEnemy(id){
    const v=this.enemyMeshes.get(id); if(!v) return;
    this.groups.units.remove(v.model); this.enemyMeshes.delete(id);
  }

  /* ---------------- 选中 / 范围 ---------------- */
  selectTower(id){
    for(const [tid,v] of this.towerMeshes){ v.model.userData.selected=false; }
    if(id!=null){ const v=this.towerMeshes.get(id); if(v){ v.model.userData.selected=true; const t=this.game.towers.find(x=>x.id===id); let rr=0; if(t){ const st=this.game.statsFor(t); rr=((t.type==='honeypot'?st.lure:st.range)||0)*this.map.tile; } if(t && rr>0) this.showRange(t.cell, rr, t.type==='honeypot'?0xffb85c:0x5ce9ff, true); } }
  }

  showRange(cell, radius, color=0x5ce9ff, valid=true){
    this.clearRange();
    const w=this.map.world(cell.x,cell.z);
    const y=this.map.cell(cell.x,cell.z)==='p'?1.3:0.3;
    const geo=new THREE.RingGeometry(Math.max(.1,radius-0.09),radius,64);
    const mat=new THREE.MeshBasicMaterial({color: valid?color:0xff5d72,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
    const ring=new THREE.Mesh(geo,mat); ring.rotation.x=-Math.PI/2; ring.position.set(w.x,y,w.z);
    this.groups.preview.add(ring);
    const disc=new THREE.Mesh(new THREE.CircleGeometry(radius,48), new THREE.MeshBasicMaterial({color:valid?color:0xff5d72,transparent:true,opacity:.06,side:THREE.DoubleSide,depthWrite:false}));
    disc.rotation.x=-Math.PI/2; disc.position.set(w.x,y-.01,w.z); this.groups.preview.add(disc);
    this.rangeRing=new THREE.Group(); this.groups.preview.remove(ring); this.groups.preview.remove(disc); this.rangeRing.add(ring); this.rangeRing.add(disc); this.groups.preview.add(this.rangeRing);
  }
  clearRange(){ if(this.rangeRing){ this.clearGroup(this.rangeRing); this.groups.preview.remove(this.rangeRing); this.rangeRing=null; } }

  showPlacementPreview(type, cell, facing=0, valid=true, range=3){
    if(this.previewGroup){ this.clearGroup(this.previewGroup); this.groups.preview.remove(this.previewGroup); this.previewGroup=null; }
    const g=new THREE.Group();
    const w=this.map.world(cell.x,cell.z);
    const isPlat=this.map.cell(cell.x,cell.z)==='p';
    const y=isPlat?1.21:.55;
    const model=this.towerModel(type,1,null, this.map.cell(cell.x,cell.z)==='n');
    model.position.set(0,0,0); model.rotation.y=facing;
    model.traverse(o=>{ if(o.material){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=.55; if(!valid && o.material.color) o.material.color.setHex(0xff5d72); } });
    g.add(model); g.position.set(w.x,y,w.z);
    const radius=range||0;
    if(radius>0){
      const ring=new THREE.Mesh(new THREE.RingGeometry(Math.max(.1,radius-.08),radius,64),new THREE.MeshBasicMaterial({color:valid?0xffd27a:0xff5d72,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2; ring.position.y=.05; g.add(ring);
    } else {
      const ring=new THREE.Mesh(new THREE.RingGeometry(this.map.tile*.46,this.map.tile*.54,4,1,Math.PI/4),new THREE.MeshBasicMaterial({color:valid?0xffd27a:0xff5d72,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2; ring.position.y=.05; g.add(ring);
    }
    if(type==='interceptor'){
      const arc=new THREE.Mesh(new THREE.CircleGeometry(radius,32, -Math.PI/2-0.96, 1.92), new THREE.MeshBasicMaterial({color:valid?0x5ce9ff:0xff5d72,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));
      arc.rotation.x=-Math.PI/2; arc.position.y=.04; arc.rotation.z=-facing; g.add(arc);
      const arrow=new THREE.Mesh(new THREE.ConeGeometry(.3,1.0,5),new THREE.MeshBasicMaterial({color:valid?0x5ce9ff:0xff5d72,transparent:true,opacity:.9}));
      arrow.rotation.x=Math.PI/2; arrow.position.set(Math.sin(facing)*2.0,.3,Math.cos(facing)*2.0); g.add(arrow);
    }
    this.groups.preview.add(g); this.previewGroup=g;
  }
  clearPlacement(){ if(this.previewGroup){ this.clearGroup(this.previewGroup); this.groups.preview.remove(this.previewGroup); this.previewGroup=null; } }

  highlightCell(cell,color=0x5ce9ff){
    this.clearHighlight();
    const w=this.map.world(cell.x,cell.z);
    const g=new THREE.Group();
    const y=this.map.cell(cell.x,cell.z)==='p'?1.24:.12;
    for(const [dx,dz,w2,d] of [[-1,0,.1,2.2],[1,0,.1,2.2],[0,-1,2.2,.1],[0,1,2.2,.1]]){
      const b=new THREE.Mesh(new THREE.BoxGeometry(w2,.05,d),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
      b.position.set(dx*2.1,0,dz*2.1); g.add(b);
    }
    g.position.set(w.x,y,w.z); this.groups.markers.add(g); this.hoverCell=g;
  }
  clearHighlight(){ if(this.hoverCell){ this.clearGroup(this.hoverCell); this.groups.markers.remove(this.hoverCell); this.hoverCell=null; } }

  flashCell(cell,color=0xff5d72,dur=.8){
    const w=this.map.world(cell.x,cell.z);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.1,.1,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.position.set(w.x,.5,w.z); this.groups.markers.add(m);
    this.effects.push({mesh:m,t:0,dur,update:(e,dt)=>{ e.t+=dt; m.material.opacity=.8*(1-e.t/dur); m.scale.setScalar(1+e.t*1.5); if(e.t>=dur){ this.removeMesh(m); return false; } return true; }});
  }

  setNodeVisual(cell, state){
    const v=this.nodeVisuals.get(cell.x+','+cell.z); if(!v) return;
    if(state && state.active){
      v.dome.material.opacity=.35;
      v.ring.material.color.setHex(0xff5d72);
      v.ring2.material.color.setHex(0xffb85c);
    } else {
      v.dome.material.opacity=0;
      v.ring.material.color.setHex(0x5ce9ff);
      v.ring2.material.color.setHex(0x2fd6b8);
    }
  }

  /* ---------------- 特效 ---------------- */
  beam(a,b,color=0x5ce9ff,width=.08,dur=.18){
    const dir=new THREE.Vector3().subVectors(b,a); const len=dir.length();
    const geo=new THREE.CylinderGeometry(width,width,len,6,1,true);
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
    const m=new THREE.Mesh(geo,mat);
    m.position.copy(a).addScaledVector(dir,.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
    this.groups.fx.add(m);
    this.effects.push({mesh:m,t:0,dur,update:(e,dt)=>{ e.t+=dt; m.material.opacity=.9*(1-e.t/dur); if(e.t>=dur){ this.removeMesh(m); return false; } return true; }});
  }

  ringPulse(pos,color=0x5ce9ff,radius=2,dur=.5,y=0.4){
    const m=new THREE.Mesh(new THREE.RingGeometry(.82,1,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.rotation.x=-Math.PI/2; m.position.set(pos.x,y,pos.z); m.scale.setScalar(.3);
    this.groups.fx.add(m);
    this.effects.push({mesh:m,t:0,dur,update:(e,dt)=>{ e.t+=dt; const k=e.t/dur; m.scale.setScalar(.3+k*radius); m.material.opacity=.8*(1-k); if(e.t>=dur){ this.removeMesh(m); return false; } return true; }});
  }

  burst(pos,color=0xffb85c,count=14,scale=1){
    const geo=new THREE.BufferGeometry(); const p=new Float32Array(count*3); const v=[];
    for(let i=0;i<count;i++){ p[i*3]=pos.x; p[i*3+1]=pos.y+.6; p[i*3+2]=pos.z; v.push(new THREE.Vector3((Math.random()-.5)*6,(Math.random()*6+1),(Math.random()-.5)*6).multiplyScalar(scale)); }
    geo.setAttribute('position',new THREE.BufferAttribute(p,3));
    geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0),1000);
    const mat=new THREE.PointsMaterial({color,size:.35,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending});
    const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; this.groups.fx.add(pts);
    this.effects.push({mesh:pts,t:0,dur:.7,update:(e,dt)=>{ e.t+=dt; const arr=geo.attributes.position.array; for(let i=0;i<count;i++){ arr[i*3]+=v[i].x*dt; arr[i*3+1]+=v[i].y*dt; arr[i*3+2]+=v[i].z*dt; v[i].y-=9*dt; } geo.attributes.position.needsUpdate=true; mat.opacity=1-e.t/.7; if(e.t>=.7){ this.groups.fx.remove(pts); return false; } return true; }});
  }

  projectileVisual(from,to,color,speed=30,dur=null){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.14,8,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));
    m.position.copy(from); this.groups.fx.add(m);
    const dist=from.distanceTo(to); const d=dur||Math.max(.06,dist/speed);
    this.effects.push({mesh:m,t:0,dur:d,update:(e,dt)=>{ e.t+=dt; const k=Math.min(1,e.t/d); m.position.lerpVectors(from,to,k); if(e.t>=d){ this.removeMesh(m); return false; } return true; }});
  }

  healBeam(from,to,color=0x6cf0a8){
    this.beam(from,to,color,.05,.35);
    this.ringPulse({x:to.x,z:to.z},color,1.0,.4,to.y+.1);
  }

  muzzleFlash(t,color=0xffd166){
    const w=this.map.world(t.cell.x,t.cell.z);
    const base=this.map.cell(t.cell.x,t.cell.z)==='p'?1.21:.55;
    const a=t.facing||0;
    const x=w.x+Math.sin(a)*2.1, z=w.z+Math.cos(a)*2.1;
    const m=new THREE.Mesh(new THREE.SphereGeometry(.3,8,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));
    m.position.set(x,base+1.5,z); this.groups.fx.add(m);
    this.effects.push({mesh:m,t:0,dur:.13,update:(e,dt)=>{ e.t+=dt; m.scale.setScalar(1+e.t*8); m.material.opacity=.95*(1-e.t/.13); if(e.t>=.13){ this.removeMesh(m); return false; } return true; }});
  }

  areaOverlay(cells,color=0xffb85c,dur=14){
    const g=new THREE.Group();
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    for(const c of cells){
      const w=this.map.world(c.x,c.z);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(this.map.tile*.9,this.map.tile*.9),mat.clone());
      m.rotation.x=-Math.PI/2; m.position.set(w.x,.18,w.z); g.add(m);
    }
    this.groups.markers.add(g);
    this.effects.push({mesh:g,t:0,dur,update:(e,dt)=>{ e.t+=dt; g.children.forEach(m=>m.material.opacity=.13*(.65+.35*Math.sin(this.time*3))); if(e.t>=dur){ this.clearGroup(g); this.groups.markers.remove(g); return false; } return true; }});
  }

  detectPulse(pos){
    this.ringPulse({x:pos.x,z:pos.z},0xffd166,1.8,.45,.7);
  }

  shieldBurst(pos,color=0x4fc3ff){
    const m=new THREE.Mesh(new THREE.SphereGeometry(1.2,16,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    m.position.set(pos.x,pos.y+1,pos.z); this.groups.fx.add(m);
    this.effects.push({mesh:m,t:0,dur:.6,update:(e,dt)=>{ e.t+=dt; m.scale.setScalar(1+e.t*2); m.material.opacity=.5*(1-e.t/.6); if(e.t>=.6){ this.removeMesh(m); return false; } return true; }});
  }

  encryptBurst(pos){
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,0),new THREE.MeshBasicMaterial({color:0xb58cff,transparent:true,opacity:.6,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    m.position.set(pos.x,pos.y+1,pos.z); this.groups.fx.add(m);
    this.effects.push({mesh:m,t:0,dur:.5,update:(e,dt)=>{ e.t+=dt; m.rotation.y+=dt*8; m.material.opacity=.6*(1-e.t/.5); if(e.t>=.5){ this.removeMesh(m); return false; } return true; }});
  }

  explosion(pos,color=0xff8a5c,scale=1){
    this.burst({x:pos.x,y:pos.y+.4,z:pos.z},color,18*scale,scale);
    this.ringPulse({x:pos.x,z:pos.z},color,3*scale,.5,.5);
  }

  warning(pos,dur=2.5,color=0xff5d72){
    const w=this.map.world(pos.x,pos.z);
    const g=new THREE.Group();
    const m=new THREE.Mesh(new THREE.CylinderGeometry(1.9,2.3,3.5,12,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.position.y=1.75; g.add(m);
    const r=new THREE.Mesh(new THREE.TorusGeometry(2.0,.08,6,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
    r.rotation.x=Math.PI/2; r.position.y=.2; g.add(r);
    g.position.set(w.x,0,w.z); this.groups.markers.add(g);
    this.effects.push({mesh:g,t:0,dur,update:(e,dt)=>{ e.t+=dt; const k=e.t/dur; m.material.opacity=.28*(.5+.5*Math.sin(e.t*10)); r.scale.setScalar(1+.08*Math.sin(e.t*8)); if(e.t>=dur){ this.clearGroup(g); this.groups.markers.remove(g); return false; } return true; }});
  }

  /* ---------------- 更新 ---------------- */
  syncLocks(){
    if(!this.game || !this.map) return;
    const now=this.game.time;
    const active=[...this.game.lockCells.entries()].filter(([k,v])=>v.expires>now);
    const sig=active.map(([k])=>k).sort().join('|');
    if(sig===this.lockSignature) return;
    this.lockSignature=sig;
    if(this.lockGroup){ this.clearGroup(this.lockGroup); this.groups.markers.remove(this.lockGroup); this.lockGroup=null; }
    if(!active.length) return;
    const g=new THREE.Group();
    for(const [k,v] of active){
      const [x,z]=k.split(',').map(Number);
      if(!this.map.walkable(x,z) && this.map.cell(x,z)!=='n') continue;
      const w=this.map.world(x,z);
      const lockColor=v.source==='shenlou'?0xb58cff:0xff5d72;
      const cyl=new THREE.Mesh(new THREE.CylinderGeometry(this.map.tile*.46,this.map.tile*.5,3.6,12,1,true),new THREE.MeshBasicMaterial({color:v.source==='shenlou'?0x0d0618:0x12000a,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
      cyl.position.set(w.x,1.8,w.z); g.add(cyl);
      const wire=new THREE.Mesh(new THREE.CylinderGeometry(this.map.tile*.47,this.map.tile*.51,3.7,10,3,true),new THREE.MeshBasicMaterial({color:lockColor,wireframe:true,transparent:true,opacity:.38,depthWrite:false,blending:THREE.AdditiveBlending}));
      wire.position.set(w.x,1.85,w.z); g.add(wire);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(this.map.tile*.5,.06,6,32),new THREE.MeshBasicMaterial({color:lockColor,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
      ring.rotation.x=Math.PI/2; ring.position.set(w.x,.2,w.z); g.add(ring);
    }
    this.groups.markers.add(g); this.lockGroup=g;
  }

  update(dt){
    this.time+=dt;
    if(this.game){
      for(const t of this.game.towers) this.updateTowerVisual(t);
      for(const e of this.game.enemies) this.updateEnemyVisual(e);
      this.syncLocks();
      if(this.map){
        for(const n of this.map.nodes){
          const st=this.game.nodeStates.get(n.x+','+n.z);
          this.setNodeVisual(n,st);
        }
      }
    }
    // 环境
    this.stars.rotation.y+=dt*.004;
    this.distant.rotation.y+=dt*.006;
    this.protocol.children.forEach((o,i)=>{ if(o.isGridHelper) o.position.y += Math.sin(this.time*.2+i)*.0005; });
    this.streams.rotation.y+=dt*.02;
    this.motes.rotation.y+=dt*.01;
    for(const m of this.meteors.children){
      const u=m.userData; u.a+=dt*u.s*.25;
      m.position.set(Math.cos(u.a)*u.r,u.y+Math.sin(this.time*.5+u.a)*2,Math.sin(u.a)*u.r);
    }
    if(this.coreLight) this.coreLight.intensity=35+Math.sin(this.time*1.5)*8;
    if(this.routeFlash && this.time<this.routeFlash.until){
      for(const a of this.routeAnims){
        const hot=a.isPreview?false:this.routeFlash.ids.has(a.entry);
        a.lineMat.opacity=hot?.7+.3*Math.abs(Math.sin(this.time*9)):a.baseLine;
        a.glowMat.opacity=hot?.2+.2*Math.abs(Math.sin(this.time*9)):a.baseGlow;
      }
    } else if(this.routeFlash){
      for(const a of this.routeAnims){ a.lineMat.opacity=a.baseLine; a.glowMat.opacity=a.baseGlow; }
      this.routeFlash=null;
    }
    if(this.flowTex) this.flowTex.offset.x+=dt*.12;
    if(this.flowPoints) this.flowPoints.position.x=Math.sin(this.time*.2)*1.5;
    if(this.dmzRing) this.dmzRing.rotation.z+=dt*.25;
    if(this.airGap) this.airGap.rotation.y+=dt*.08;
    // 路线流动
    for(const a of this.routeAnims){
      for(const d of a.dots){
        const t=((this.time*(a.isPreview?.55:.32)+d.off)%1+1)%1;
        d.mesh.position.copy(a.curve.getPointAt(t));
        d.mesh.position.y+=.12+Math.sin(this.time*4+d.off*6)*.05;
      }
    }
    // 塔模型动画
    for(const [id,v] of this.towerMeshes){
      const m=v.model, p=m.userData.parts||{};
      if((m.userData.buildT||0)<.3){ m.userData.buildT=(m.userData.buildT||0)+dt; const k=Math.max(.02,Math.min(1,m.userData.buildT/.3)); m.scale.setScalar(k); }
      if(p.spinners) for(const s of p.spinners){ if(s.axis==='y') s.mesh.rotation.y+=dt*s.speed; }
      if(p.pulsers) for(const s of p.pulsers){
        const k=1+Math.sin(this.time*3+s.mesh.id*.1)*.06;
        if(s.kind==='core'||s.kind==='ring') s.mesh.scale.setScalar(k);
        else if(s.kind==='lure'){ s.mesh.rotation.z+=dt*.4; s.mesh.material.opacity=.35+.25*Math.sin(this.time*2+s.mesh.id); }
      }
      if(p.field){ p.field.material.opacity=.12+.06*Math.sin(this.time*4); }
      if(p.eye){ p.eye.position.y=2.1+Math.sin(this.time*2)*.08; p.eye.rotation.y+=dt*.6; }
      if(p.orb){ p.orb.position.y=2.6+Math.sin(this.time*2.4)*.1; }
      if(p.shield){ p.shield.material.opacity = m.userData.selected? .12 : .05; }
      if(p.head){
        const tw=v.tower;
        if(tw && tw.recoil>0){ tw.recoil=Math.max(0,tw.recoil-dt); p.head.position.z=-Math.sin(Math.min(1,tw.recoil*9)*Math.PI)*.2; }
        else p.head.position.z=0;
      }
      if(p.barrels) for(const b of p.barrels){ if(b.userData.recoil>0){ b.userData.recoil-=dt; b.position.z = b.userData.baseZ - Math.sin(Math.min(1,b.userData.recoil*8)*Math.PI)*.18; } }
    }
    // 敌人模型动画
    for(const [id,v] of this.enemyMeshes){
      const en=this.game?this.game.enemyById(id):null;
      if(en && en.dead) continue;
      const m=v.model, p=m.userData.parts||{}, t=this.time;
      if(p.segments) for(const s of p.segments){
        if(p.legs && p.legs.length && m.userData.type==='boss_wankui'){ s.mesh.position.y=s.base.y+Math.sin(t*3+s.i*.7)*.08; }
        else if(m.userData.type==='flood'){ s.mesh.position.y=s.base.y+Math.sin(t*3+s.ph)*.08; s.mesh.scale.setScalar(1+Math.sin(t*2+s.ph)*.05); }
        else { s.mesh.position.x=s.base.x+Math.sin(t*3+s.i*.6)*.08; s.mesh.position.y=s.base.y+Math.sin(t*3+s.i*.6)*.05; }
      }
      if(p.legs) for(const l of p.legs){
        const r=l.base||{x:0,z:0};
        l.mesh.rotation.x=(r.x||0)+Math.sin(t*5+l.ph)*.25;
        l.mesh.rotation.z=(r.z||0)+Math.cos(t*5+l.ph)*.2;
      }
      if(p.spinners) for(const s of p.spinners){ s.mesh.rotation.y+=dt*s.speed; }
      if(p.wings) for(const w of p.wings){ w.mesh.position.y=3.3+Math.sin(t*6+w.sx)*.08; w.mesh.rotation.z=Math.sin(t*8)*.2*w.sx; }
      if(p.core) p.core.rotation.y+=dt*.8;
      if(p.shards) for(const s of p.shards){ s.mesh.rotation.y+=dt*.7; s.mesh.position.y=s.base.y+Math.sin(t*2+s.ph)*.2; }
      if(p.aura){ p.aura.material.opacity=.3+.2*Math.sin(t*3); }
      if(p.cloak){ p.cloak.material.opacity=.85+.1*Math.sin(t*3); }
      if(p.armor) for(const a of p.armor){ a.visible = m.userData.phase>=2; }
      if(m.userData.type==='hotspot'){ m.position.y=Math.sin(t*3+(m.userData.id||0))*.15; }
      if(m.userData.type==='boss_shenlou'){ m.position.y=Math.sin(t*1.6)*.2; }
      if(m.userData.type==='boss_zheying'){ m.position.y=Math.sin(t*1.4)*.12; }
      if(m.userData.type==='boss_wankui'){ m.position.y=Math.sin(t*1.8)*.08; }
    }
    // 特效
    for(let i=this.effects.length-1;i>=0;i--){ if(!this.effects[i].update(this.effects[i],dt)) this.effects.splice(i,1); }
    // 血条朝向
    const camQ=this.camera.quaternion;
    for(const [,v] of this.towerMeshes){ v.bar.quaternion.copy(camQ); }
    for(const [,v] of this.enemyMeshes){ v.bar.quaternion.copy(camQ); }
  }

  render(){ this.renderer.render(this.scene,this.camera); }

  /* ---------------- 拾取 ---------------- */
  setPointer(clientX,clientY){
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.pointer.x=(clientX/window.innerWidth)*2-1;
    this.pointer.y=-(clientY/window.innerHeight)*2+1;
    this.raycaster.setFromCamera(this.pointer,this.camera);
  }

  pickGround(){
    const p=new THREE.Vector3();
    const hit=this.raycaster.ray.intersectPlane(this.groundPlane,p);
    if(!hit) return null;
    if(!this.map) return null;
    const tile=this.map.tile;
    const x=Math.round(p.x/tile+(this.map.w-1)/2);
    const z=Math.round(p.z/tile+(this.map.h-1)/2);
    if(x<0||z<0||x>=this.map.w||z>=this.map.h) return null;
    return {x,z,world:p};
  }

  pickObject(){
    const hits=this.raycaster.intersectObjects([...this.towerMeshes.values()].map(v=>v.model).concat([...this.enemyMeshes.values()].map(v=>v.model)),true);
    if(!hits.length) return null;
    let o=hits[0].object;
    while(o && !o.userData.id) o=o.parent;
    return o?o.userData.id:null;
  }

  screenToGround(clientX,clientY){ this.setPointer(clientX,clientY); return this.pickGround(); }

  worldToScreen(x,y,z){
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    const v=new THREE.Vector3(x,y,z).project(this.camera);
    return {x:(v.x*.5+.5)*window.innerWidth, y:(-v.y*.5+.5)*window.innerHeight, visible:v.z<1};
  }
}