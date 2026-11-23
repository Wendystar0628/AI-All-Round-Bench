'use strict';
/* 场景一：重球冲击果冻。舞台、灯光、果冻/重球渲染、软体网格构建。 */

/* 由 JellyBody 的四面体面生成各碎块网格 */
function buildJellyMeshes(body, material){
  body.buildFaces();
  const meshes=[];
  for(let ci=0;ci<body.fragFaces.length;ci++){
    const faces=body.fragFaces[ci];
    if(!faces.length) continue;
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(faces.length*3*3);
    let k=0;
    for(const tri of faces){
      for(let v=0;v<3;v++){
        const p=body.pos[tri[v]];
        pos[k++]=p.x;pos[k++]=p.y;pos[k++]=p.z;
      }
    }
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,material.clone());
    mesh.castShadow=true; mesh.receiveShadow=true;
    mesh.userData.ci=ci;
    meshes.push(mesh);
  }
  return meshes;
}

class JellyScene {
  constructor(renderer){
    this.renderer=renderer;
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x0c1420);
    this.scene.fog=new THREE.Fog(0x0c1420, 7, 15);
    const env=APP.makeEnvTexture();
    this.scene.environment=env;

    this.camera=new THREE.PerspectiveCamera(42, innerWidth/innerHeight,0.05,60);
    this.camera.position.set(3.4,2.5,4.4);
    this.controls=new THREE.OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0,0.55,0);
    this.controls.enableDamping=true; this.controls.dampingFactor=0.08;
    this.controls.minDistance=1.2; this.controls.maxDistance=12;
    this.controls.maxPolarAngle=Math.PI*0.52;

    this._setupLights();
    this._setupStage();

    this.world=new JELLY.JellyWorld();
    this.world.groundY=0;
    this.jellyMeshes=[];
    this.ballMeshes=[];
    this.balls=[];

    this.softness=0.5; this.toughness=0.55;
    this.ballMass=14; this.dropHeight=2.6;
    this._seqTimers=[];

    this.reset();
  }

  _setupLights(){
    const hemi=new THREE.HemisphereLight(0xbfdcff,0x20202c,0.55);
    this.scene.add(hemi);
    const key=new THREE.DirectionalLight(0xfff2dd,2.1);
    key.position.set(3.2,6.5,4.0);
    key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);
    key.shadow.camera.left=-4;key.shadow.camera.right=4;
    key.shadow.camera.top=4;key.shadow.camera.bottom=-4;
    key.shadow.camera.near=1;key.shadow.camera.far=14;
    key.shadow.bias=-0.0004;
    this.scene.add(key); this.keyLight=key;
    const rim=new THREE.DirectionalLight(0x88bbff,1.0);
    rim.position.set(-4,3,-3); this.scene.add(rim);
    const fill=new THREE.PointLight(0xff9fc0,0.7,8);
    fill.position.set(-2.2,1.6,2.2); this.scene.add(fill);
  }

  _setupStage(){
    // 台面
    const tableMat=new THREE.MeshStandardMaterial({color:0x2b3550,roughness:0.55,metalness:0.25});
    const table=new THREE.Mesh(new THREE.BoxGeometry(6.2,0.28,4.2),tableMat);
    table.position.y=-0.14; table.receiveShadow=true; this.scene.add(table);
    // 台面上的暗色承托盘
    const plateMat=new THREE.MeshStandardMaterial({color:0x1c2438,roughness:0.35,metalness:0.5});
    const plate=new THREE.Mesh(new THREE.CylinderGeometry(2.55,2.6,0.06,64),plateMat);
    plate.position.y=0.02; plate.receiveShadow=true; this.scene.add(plate);
    // 背景墙（接光的弧面）
    const wallMat=new THREE.MeshStandardMaterial({color:0x141d2e,roughness:0.9,metalness:0});
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(12,7),wallMat);
    wall.position.set(0,3.2,-3.4); wall.receiveShadow=true; this.scene.add(wall);
    // 装饰立柱
    const postMat=new THREE.MeshStandardMaterial({color:0x24304a,roughness:0.4,metalness:0.6});
    for(const [x,z] of [[-2.9,-1.9],[2.9,-1.9]]){
      const p=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,3.4,16),postMat);
      p.position.set(x,1.5,z); p.castShadow=true; this.scene.add(p);
    }
  }

  _makeJellyMaterial(color){
    return new THREE.MeshPhysicalMaterial({
      color, transparent:true, opacity:0.62,
      roughness:0.18, metalness:0.0,
      transmission:0.35, thickness:0.6,
      clearcoat:0.6, clearcoatRoughness:0.25,
      ior:1.34,
      emissive:new THREE.Color(color).multiplyScalar(0.06),
      side:THREE.DoubleSide,
      depthWrite:false
    });
  }

  _addJelly(opts){
    const body=new JELLY.JellyBody(opts);
    this.world.addBody(body);
    const mat=this._makeJellyMaterial(opts.color);
    const meshes=buildJellyMeshes(body,mat);
    meshes.forEach(m=>{ this.scene.add(m); this.jellyMeshes.push({body,mesh:m}); });
    return body;
  }

  _addBall(radius, density, kind='metal'){
    const mat = kind==='stone'
      ? new THREE.MeshStandardMaterial({color:0x8a8f98,roughness:0.92,metalness:0.05})
      : new THREE.MeshStandardMaterial({color:0xc9d3de,roughness:0.18,metalness:1.0,
          envMapIntensity:1.2});
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,48,32),mat);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.visible=false;
    this.scene.add(mesh);
    const ball=this.world.addBall({r:radius,m:density*4/3*Math.PI*radius**3,
      pos:APP.V3(99,99,99),vel:APP.V3(),rest:0.32,mesh,kind});
    ball.active=false;
    this.balls.push(ball); this.ballMeshes.push(mesh);
    return ball;
  }

  reset(){
    this._clearDynamics();
    // —— 默认舞台：三块不同果冻 ——
    const h=0.075;
    // 主果冻（圆柱，中央）
    const cylR=0.46, cylH=1.05;
    this.bodyMain=this._addJelly({
      name:'main', nx:11,ny:9,nz:11, h,
      origin:APP.V3(-cylR,0,-cylR),
      shape:(x,y,z)=>{ const dx=x-0.5,dz=z-0.5; return dx*dx+dz*dz<=0.25 && y<=1 && y>=0; },
      softness:this.softness, toughness:this.toughness, color:0xff6b94
    });
    // 小方块软果冻（左前，更软）
    this.bodySoft=this._addJelly({
      name:'soft', nx:7,ny:5,nz:7, h:0.075,
      origin:APP.V3(-1.35,0,0.55),
      shape:()=>true,
      softness:Math.min(1,this.softness+0.32), toughness:this.toughness, color:0x67e8c4
    });
    // 硬果冻墩（右后，更结实、矮胖）
    this.bodyHard=this._addJelly({
      name:'hard', nx:9,ny:6,nz:9, h:0.075,
      origin:APP.V3(0.78,0,-0.95),
      shape:(x,y,z)=>{ const dx=x-0.5,dz=z-0.5;
        const top=(0.5-Math.min(y,1)*0.06);
        return dx*dx+dz*dz<=0.25 && y<=1; },
      softness:Math.max(0,this.softness-0.28), toughness:Math.min(1,this.toughness+0.22),
      color:0x7aa5ff
    });
    // 预置球（隐藏，触发时落球）
    if(!this._ballsMade){
      this._ballsMade=true;
      this.ballS=this._addBall(0.16, 7800,'metal');
      this.ballM=this._addBall(0.20, 7800,'metal');
      this.ballL=this._addBall(0.25, 7800,'metal');
      this.ballStone=this._addBall(0.22, 2700,'stone');
    }
    this._allBalls=[this.ballS,this.ballM,this.ballL,this.ballStone];
    this._allBalls.forEach(b=>{b.active=false;b.mesh.visible=false;});
  }

  _clearDynamics(){
    // 移除旧果冻
    if(this.bodyMain){
      this.jellyMeshes.forEach(({mesh})=>{ this.scene.remove(mesh); mesh.geometry.dispose(); });
      this.jellyMeshes=[];
      this.world.bodies.length=0;
    }
  }

  /* 供导演调用的动作 */
  dropBall(which='M', target=null, speed=0){
    const b=which==='S'?this.ballS:which==='L'?this.ballL:which==='R'?this.ballStone:this.ballM;
    const tgt=target||{x:0,z:0};
    const m=b.m;
    // 根据当前滑块质量调整（导演可覆盖）
    b.m = m;
    b.pos.set(tgt.x, this.dropHeight, tgt.z);
    b.vel.set(speed*(tgt.vx||0),0,speed*(tgt.vz||0));
    if(tgt.vx!==undefined){ b.vel.x=tgt.vx; b.vel.z=tgt.vz; }
    b.active=true; b.mesh.visible=true; b.mesh.position.copy(b.pos);
    return b;
  }

  setParams(p){
    if(p.softness!==undefined) this.softness=p.softness;
    if(p.toughness!==undefined) this.toughness=p.toughness;
    if(p.ballMass!==undefined){
      this.ballMass=p.ballMass;
      const d=p.ballMass/(4/3*Math.PI*0.2**3);
      this.ballM.m=p.ballMass;
      this.ballS.m=p.ballMass*0.55;
      this.ballL.m=p.ballMass*2.1;
      this.ballStone.m=p.ballMass*0.9;
    }
    if(p.dropHeight!==undefined) this.dropHeight=p.dropHeight;
    // 实时作用到现有果冻
    for(const body of this.world.bodies){
      if(body.name==='main'){body.softness=this.softness;body.toughness=this.toughness;}
      if(body.name==='soft'){body.softness=Math.min(1,this.softness+0.32);body.toughness=this.toughness;}
      if(body.name==='hard'){body.softness=Math.max(0,this.softness-0.28);
        body.toughness=Math.min(1,this.toughness+0.22);}
    }
  }

  trigger(kind){
    this._seqTimers.forEach(t=>clearTimeout(t)); this._seqTimers=[];
    if(kind==='center'){
      this.dropBall('M',{x:0,z:0});
    }else if(kind==='offset'){
      this.dropBall('L',{x:0.32,z:0.18,vx:-0.9,vz:-0.4});
    }else if(kind==='continuous'){
      this.dropBall('M',{x:0,z:0});
      this._seqTimers.push(setTimeout(()=>this.dropBall('L',{x:0.05,z:-0.03}),650));
      this._seqTimers.push(setTimeout(()=>this.dropBall('L',{x:-0.06,z:0.04}),1300));
    }
  }

  /* 物理推进 dt（视频导出时逐帧调用） */
  advance(dt){
    this.world.step(dt);
    // 事件 -> 声音
    for(const e of this.world.events){
      if(e.type==='crack') Sound.crack(e.intensity,e.pos);
      else if(e.type==='impact') Sound.impact(e.intensity,e.pos);
      else if(e.type==='thud') Sound.clink(e.intensity,e.pos,'stone');
      else if(e.type==='clink') Sound.clink(e.intensity,e.pos,'metal');
      else if(e.type==='boing') Sound.boing(e.intensity,e.pos);
    }
    this._syncMeshes();
  }

  _syncMeshes(){
    for(const body of this.world.bodies){
      if(body.fractureCount!==body._lastFracture){
        body._lastFracture=body.fractureCount;
        // 重建网格
        this.jellyMeshes=this.jellyMeshes.filter(rm=>{
          if(rm.body!==body) return true;
          this.scene.remove(rm.mesh); rm.mesh.geometry.dispose(); return false;
        });
        const mat=this._makeJellyMaterial(body.color);
        const ms=buildJellyMeshes(body,mat);
        ms.forEach(m=>{this.scene.add(m);this.jellyMeshes.push({body,mesh:m});});
      }
    }
    for(const {body,mesh} of this.jellyMeshes){
      const ci=mesh.userData.ci;
      const posAttr=mesh.geometry.attributes.position;
      const faces=body.fragFaces[ci];
      if(!faces) continue;
      let k=0;
      for(const tri of faces) for(let v=0;v<3;v++){
        const p=body.pos[tri[v]];
        posAttr.array[k++]=p.x;posAttr.array[k++]=p.y;posAttr.array[k++]=p.z;
      }
      posAttr.needsUpdate=true;
      mesh.geometry.computeVertexNormals();
    }
  }

  resize(){
    this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix();
  }

  render(){
    this.controls.update();
    this.renderer.render(this.scene,this.camera);
  }
}

window.JellyScene=JellyScene;
