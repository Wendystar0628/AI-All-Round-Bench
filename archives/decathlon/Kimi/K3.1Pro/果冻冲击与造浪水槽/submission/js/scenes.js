(function () {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t);
  const terrain=(x,z)=>.045+smooth(clamp((x-1)/2.45,0,1))*.58+.19*Math.exp(-((x+.35)*(x+.35)/.8+z*z/.65));

  function canvasTexture(draw,w=512,h=256){
    const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
  }

  function makeEnvironment(renderer){
    const scene=new THREE.Scene();scene.background=new THREE.Color(.07,.095,.11);
    const room=new THREE.Mesh(new THREE.BoxGeometry(30,20,30),new THREE.MeshBasicMaterial({color:0x17262b,side:THREE.BackSide}));scene.add(room);
    const panel=(pos,scale,color)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));m.position.set(...pos);m.scale.set(...scale);m.lookAt(0,0,0);scene.add(m);};
    panel([-5,6,3],[5,3,1],new THREE.Color(2.7,3.2,3.0));panel([5,2,-3],[3,5,1],new THREE.Color(.6,1.7,1.9));panel([0,7,-5],[4,2,1],new THREE.Color(2.0,1.55,1.2));
    const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(scene,.04).texture;pmrem.dispose();return env;
  }

  class BaseScene {
    constructor(renderer,environment){
      this.renderer=renderer;this.scene=new THREE.Scene();this.scene.environment=environment;this.scene.background=new THREE.Color(0x081316);this.scene.fog=new THREE.FogExp2(0x081316,.027);
      this.camera=new THREE.PerspectiveCamera(39,1,.05,100);this.target=new THREE.Vector3(0,.8,0);this.desiredTarget=this.target.clone();
      this.theta=.72;this.phi=1.12;this.radius=7.4;this.desired={theta:this.theta,phi:this.phi,radius:this.radius};this.cameraDirect=true;
      this.scene.add(new THREE.HemisphereLight(0xc6f4e8,0x061013,1.05));
      const key=new THREE.DirectionalLight(0xfff0d9,3.6);key.position.set(-3.5,7,4.5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.camera.near=.5;key.shadow.camera.far=20;key.shadow.bias=-.0004;key.shadow.normalBias=.025;this.scene.add(key);
      const rim=new THREE.PointLight(0x4ce3d3,28,16,2);rim.position.set(-4,3,-3);this.scene.add(rim);
      const warm=new THREE.PointLight(0xffb68c,19,14,2);warm.position.set(4,2,2);this.scene.add(warm);
      this.cameraHome();
    }
    cameraHome(){this.setOrbit(.72,1.1,7.6,new THREE.Vector3(0,.85,0));}
    setOrbit(theta,phi,radius,target){this.theta=theta;this.phi=phi;this.radius=radius;this.target.copy(target);this.desired={theta,phi,radius};this.desiredTarget.copy(target);this.updateCamera(0,true);}
    easeCamera(theta,phi,radius,target){this.desired={theta,phi,radius};this.desiredTarget.copy(target);}
    updateCamera(dt,instant=false){
      const k=instant?1:1-Math.exp(-7*dt);this.theta=lerp(this.theta,this.desired.theta,k);this.phi=lerp(this.phi,this.desired.phi,k);this.radius=lerp(this.radius,this.desired.radius,k);this.target.lerp(this.desiredTarget,k);
      const sp=Math.sin(this.phi);this.camera.position.set(this.target.x+this.radius*sp*Math.sin(this.theta),this.target.y+this.radius*Math.cos(this.phi),this.target.z+this.radius*sp*Math.cos(this.theta));this.camera.lookAt(this.target);this.camera.updateMatrixWorld();
    }
    resize(width,height,pixelRatio=1){this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(pixelRatio);this.renderer.setSize(width,height,false);}
    render(){this.renderer.render(this.scene,this.camera);}
    disposeObject(obj){obj.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)m.dispose();}});this.scene.remove(obj);}
  }

  function addLabFloor(scene,tank=false){
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshStandardMaterial({color:0x071114,roughness:.67,metalness:.22}));floor.rotation.x=-Math.PI/2;floor.position.y=-.34;floor.receiveShadow=true;scene.add(floor);
    if(!tank){
      const base=new THREE.Mesh(new THREE.CylinderGeometry(4.5,4.66,.28,96),new THREE.MeshStandardMaterial({color:0x172a2d,roughness:.32,metalness:.58}));base.position.y=-.15;base.receiveShadow=true;scene.add(base);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(4.49,.014,8,160),new THREE.MeshStandardMaterial({color:0x7de6ca,emissive:0x4db89e,emissiveIntensity:1.3,metalness:.6,roughness:.25}));ring.rotation.x=Math.PI/2;ring.position.y=.008;scene.add(ring);
      const lineMat=new THREE.LineBasicMaterial({color:0x4a8176,transparent:true,opacity:.18});
      for(const r of [1.35,2.7,4.05]){const pts=[];for(let i=0;i<128;i++)pts.push(new THREE.Vector3(Math.cos(i/128*Math.PI*2)*r,.009,Math.sin(i/128*Math.PI*2)*r));scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),lineMat));}
      const ticks=[];for(let i=0;i<80;i++){const a=i/80*Math.PI*2,r=i%5===0?3.94:4.0;ticks.push(new THREE.Vector3(Math.cos(a)*r,.012,Math.sin(a)*r),new THREE.Vector3(Math.cos(a)*4.12,.012,Math.sin(a)*4.12));}scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks),new THREE.LineBasicMaterial({color:0x7bc5b1,transparent:true,opacity:.27})));
      const labelTex=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#79aa9d';ctx.font='18px monospace';ctx.letterSpacing='4px';ctx.fillText('IMPULSE  /  DEFORMABLE SURFACE',20,45);ctx.fillStyle='#355c54';ctx.fillRect(20,61,w-40,1);},512,80);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(3.8,.59),new THREE.MeshBasicMaterial({map:labelTex,transparent:true,opacity:.55,depthWrite:false}));label.rotation.x=-Math.PI/2;label.position.set(0,.015,3.55);scene.add(label);
    }
    const pts=[];for(let i=0;i<170;i++)pts.push(Math.sin(i*12.37)*12,((i*1.713)%7)+.3,Math.cos(i*7.91)*9-2);
    const dust=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(pts,3)),new THREE.PointsMaterial({color:0x79bcb0,size:.014,transparent:true,opacity:.25,depthWrite:false}));scene.add(dust);
  }

  function metalTexture(){return canvasTexture((ctx,w,h)=>{ctx.fillStyle='#a6aaa6';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y++){const v=135+Math.floor(Math.random()*50);ctx.fillStyle=`rgba(${v},${v+4},${v+2},.18)`;ctx.fillRect(0,y,w,1);}for(let i=0;i<70;i++){ctx.fillStyle='rgba(255,255,255,.055)';ctx.fillRect(Math.random()*w,0,1,h);}},256,256);}

  class JellyScene extends BaseScene {
    constructor(renderer,environment){super(renderer,environment);addLabFloor(this.scene);this.group=new THREE.Group();this.scene.add(this.group);this.bodyViews=[];this.ballViews=new Map();this.rings=[];this.metalMap=metalTexture();this.world=null;this.detail=false;}
    reset(config={}){
      for(const v of this.bodyViews){this.group.remove(v.mesh);this.group.remove(v.inner);this.group.remove(v.cracks);v.mesh.geometry.dispose();v.mesh.material.dispose();v.inner.geometry.dispose();v.inner.material.dispose();v.cracks.geometry.dispose();v.cracks.material.dispose();}
      for(const v of this.ballViews.values()){this.group.remove(v);v.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}this.ballViews.clear();this.bodyViews=[];
      this.world=new LabPhysics.JellyWorld(config);this.world.onSound=(...args)=>{if(this.onSound)this.onSound(...args);if(args[0]==='impact')this.impactRing(args[2],args[1]);};
      const colors=[0x68e5b6,0xa88af2,0xf0b65e];
      this.world.bodies.forEach((body,i)=>{
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(body.pos),3).setUsage(THREE.DynamicDrawUsage));geo.setIndex(body.surface.flatMap(f=>[f.a,f.b,f.c]));geo.computeVertexNormals();
        const mat=new THREE.MeshPhysicalMaterial({color:colors[i],roughness:.18,metalness:.02,transmission:i===0?.26:.18,thickness:1.25,ior:1.36,attenuationColor:new THREE.Color(colors[i]),attenuationDistance:1.5,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.25,transparent:true,opacity:.94,side:THREE.DoubleSide});
        const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;mesh.renderOrder=2+i;this.group.add(mesh);
        const innerGeo=new THREE.BufferGeometry();const ids=[];for(let n=0;n<body.pos.length/3;n+=i===0?9:5)ids.push(n);innerGeo.setAttribute('position',new THREE.Float32BufferAttribute(ids.length*3,3));
        const inner=new THREE.Points(innerGeo,new THREE.PointsMaterial({color:i===0?0xd2ffe7:0xffe0b5,size:.035,transparent:true,opacity:.38,depthWrite:false}));inner.renderOrder=3;this.group.add(inner);
        const crackGeo=new THREE.BufferGeometry();crackGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(body.pos),3).setUsage(THREE.DynamicDrawUsage));
        const cracks=new THREE.Mesh(crackGeo,new THREE.MeshPhysicalMaterial({color:0xffb990,emissive:0x8d3528,emissiveIntensity:.25,roughness:.35,transmission:.15,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false}));cracks.renderOrder=5;this.group.add(cracks);
        this.bodyViews.push({mesh,inner,cracks,ids,version:-1});
      });
      this.sync();this.cameraHome();
    }
    setMaterial(softness,toughness){if(this.world)this.world.bodies[0].setMaterial(softness,toughness);}
    drop(options){const b=this.world.drop(options);this.sync();return b;}
    step(dt){if(this.world)this.world.step(dt);}
    impactRing(p,energy){
      if(!p||energy<12)return;const mat=new THREE.MeshBasicMaterial({color:0xb5ffe3,transparent:true,opacity:clamp(energy/250,.15,.55),side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});const mesh=new THREE.Mesh(new THREE.RingGeometry(.22,.24,48),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(p[0]??p.x,.025,p[2]??p.z);mesh.scale.setScalar(.5);this.scene.add(mesh);this.rings.push({mesh,life:1,speed:clamp(energy/100,1,4)});
    }
    sync(){
      if(!this.world)return;
      this.world.bodies.forEach((body,bi)=>{
        const view=this.bodyViews[bi],pos=view.mesh.geometry.attributes.position;pos.array.set(body.pos);pos.needsUpdate=true;
        if(view.version!==body.surfaceVersion){view.mesh.geometry.setIndex(body.surface.flatMap(f=>[f.a,f.b,f.c]));view.cracks.geometry.setIndex(body.surface.filter(f=>f.inside).flatMap(f=>[f.a,f.b,f.c]));view.version=body.surfaceVersion;}
        view.mesh.geometry.computeVertexNormals();view.mesh.geometry.computeBoundingSphere();view.cracks.geometry.attributes.position.array.set(body.pos);view.cracks.geometry.attributes.position.needsUpdate=true;
        const ip=view.inner.geometry.attributes.position;view.ids.forEach((id,j)=>{if(id*3+2<body.pos.length){ip.array[j*3]=body.pos[id*3];ip.array[j*3+1]=body.pos[id*3+1];ip.array[j*3+2]=body.pos[id*3+2];}});ip.needsUpdate=true;
      });
      for(const ball of this.world.balls){
        let view=this.ballViews.get(ball.id);
        if(!view){
          view=new THREE.Group();const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),new THREE.MeshStandardMaterial({color:0x9ba6a3,metalness:.92,roughness:.24,map:this.metalMap,envMapIntensity:1.65}));mesh.castShadow=true;mesh.receiveShadow=true;view.add(mesh);
          const seam=new THREE.Mesh(new THREE.TorusGeometry(1.002,.012,6,64),new THREE.MeshStandardMaterial({color:0x283735,metalness:.85,roughness:.3}));seam.rotation.x=Math.PI/2;view.add(seam);this.group.add(view);this.ballViews.set(ball.id,view);
        }
        view.position.copy(ball.position);view.scale.setScalar(ball.radius);view.rotation.copy(ball.rotation);view.visible=ball.active;
      }
    }
    updateVisual(dt){for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.life-=dt*1.8;r.mesh.scale.addScalar(dt*r.speed);r.mesh.material.opacity=Math.max(0,r.life*.35);if(r.life<=0){this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();this.rings.splice(i,1);}}this.updateCamera(dt);}
    cameraHome(){this.setOrbit(.72,1.1,7.55,new THREE.Vector3(0,.82,0));}
    cameraDetail(){this.setOrbit(.6,1.17,5.15,new THREE.Vector3(0,1.05,0));}
    demoCamera(run,t){
      if(run==='jelly-center'){
        const close=smooth(clamp(t/.5,0,1))*(1-smooth(clamp((t-3.1)/1.5,0,1)));const ball=this.world.balls[this.world.balls.length-1];const by=ball?Math.max(0,ball.position.y-1.3)*.16:0;
        this.setOrbit(.66+Math.sin(t*.28)*.055,1.08,lerp(7.6,5.65,close),new THREE.Vector3(0,.86+by,0));
      }else if(run==='jelly-multi'){
        const close=smooth(clamp((t-2.3)/.6,0,1))*(1-smooth(clamp((t-5.3)/1.2,0,1)));this.setOrbit(.62+t*.025,1.09,lerp(7.8,5.6,close),new THREE.Vector3(.05,.83,0));
      }else{
        const ball=this.world.balls[this.world.balls.length-1],x=ball?clamp(ball.position.x*.18,-.2,.55):0;this.setOrbit(.86+Math.sin(t*.35)*.06,1.07,7.4,new THREE.Vector3(x,.8,0));
      }
    }
  }

  const waterVertex=`attribute float aFoam;attribute float aMass;attribute float aSpeed;varying float vFoam;varying float vMass;varying float vSpeed;uniform float uRatio;void main(){vFoam=aFoam;vMass=aMass;vSpeed=aSpeed;vec4 mv=modelViewMatrix*vec4(position,1.);float size=mix(2.3,9.5,aFoam);if(aMass<.18)size=5.8+min(aSpeed,4.)*.65;gl_PointSize=clamp(size*uRatio*(6./-mv.z),1.,22.);gl_Position=projectionMatrix*mv;}`;
  const waterFragment=`varying float vFoam;varying float vMass;varying float vSpeed;void main(){vec2 p=gl_PointCoord-.5;float d=length(p);if(d>.5)discard;float edge=smoothstep(.5,.25,d);vec3 water=mix(vec3(.19,.72,.78),vec3(.75,.96,1.),clamp(vSpeed*.12,0.,.5));vec3 color=mix(water,vec3(.91,1.,.97),vFoam);float alpha=mix(.18,.88,vFoam);if(vMass<.18)alpha=.62;if(vMass>.55&&vFoam<.03)alpha=.035;gl_FragColor=vec4(color,edge*alpha);}`;

  class TankScene extends BaseScene {
    constructor(renderer,environment,water){
      super(renderer,environment);addLabFloor(this.scene,true);this.water=water;this.group=new THREE.Group();this.scene.add(this.group);this.balls=[];this.ballViews=[];this.densities=[.45,.82,1,2.4];this.bubbles=[];this.surfaceData=null;this.time=0;this.onSound=null;this.buildTank();this.buildWater();this.buildBalls();this.flow=null;
    }
    buildTank(){
      const base=new THREE.Mesh(new THREE.BoxGeometry(7.75,.22,3.5),new THREE.MeshStandardMaterial({color:0x142a2e,metalness:.7,roughness:.28}));base.position.y=-.23;base.receiveShadow=true;this.group.add(base);
      const trim=new THREE.Mesh(new THREE.BoxGeometry(7.5,.045,3.22),new THREE.MeshStandardMaterial({color:0x477a78,metalness:.8,roughness:.23}));trim.position.y=-.09;this.group.add(trim);
      const floorGeo=new THREE.PlaneGeometry(7.18,2.88,72,28);floorGeo.rotateX(-Math.PI/2);const fp=floorGeo.attributes.position;for(let i=0;i<fp.count;i++)fp.setY(i,terrain(fp.getX(i),fp.getZ(i)));floorGeo.computeVertexNormals();
      const grit=canvasTexture((ctx,w,h)=>{ctx.fillStyle='#49635e';ctx.fillRect(0,0,w,h);for(let i=0;i<9000;i++){const c=75+Math.random()*55;ctx.fillStyle=`rgba(${c},${c+12},${c+8},.25)`;ctx.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);}},256,128);grit.wrapS=grit.wrapT=THREE.RepeatWrapping;grit.repeat.set(5,2);
      const floor=new THREE.Mesh(floorGeo,new THREE.MeshStandardMaterial({color:0x718c80,map:grit,roughness:.72,metalness:.12}));floor.receiveShadow=true;this.group.add(floor);
      const glass=new THREE.MeshPhysicalMaterial({color:0xc6f7f1,metalness:.04,roughness:.06,transmission:.86,thickness:.08,ior:1.48,transparent:true,opacity:.16,envMapIntensity:1.35,side:THREE.DoubleSide,depthWrite:false});
      const frontGlass=glass.clone();frontGlass.opacity=.065;frontGlass.transmission=.92;
      const addGlass=(geo,pos,material=glass)=>{const m=new THREE.Mesh(geo,material);m.position.set(...pos);m.renderOrder=12;this.group.add(m);const e=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0x9de6df,transparent:true,opacity:.36}));e.position.copy(m.position);e.renderOrder=13;this.group.add(e);};
      addGlass(new THREE.BoxGeometry(.07,3.25,3.04),[-3.65,1.53,0]);addGlass(new THREE.BoxGeometry(.07,3.25,3.04),[3.65,1.53,0]);addGlass(new THREE.BoxGeometry(7.3,3.25,.055),[0,1.53,-1.5]);addGlass(new THREE.BoxGeometry(7.3,3.25,.04),[0,1.53,1.5],frontGlass);
      const rimMat=new THREE.MeshStandardMaterial({color:0x96d9d2,metalness:.72,roughness:.18,emissive:0x316c68,emissiveIntensity:.3});
      for(const z of [-1.51,1.51]){const rim=new THREE.Mesh(new THREE.BoxGeometry(7.42,.045,.055),rimMat);rim.position.set(0,3.17,z);this.group.add(rim);}
      for(const x of [-3.67,3.67]){const rim=new THREE.Mesh(new THREE.BoxGeometry(.055,.045,3.06),rimMat);rim.position.set(x,3.17,0);this.group.add(rim);}
      const ticks=[];for(let i=0;i<=16;i++){const y=i*.18;ticks.push(new THREE.Vector3(3.69,y,1.54),new THREE.Vector3(3.69,y,1.54-(i%5===0?.23:.12)));}this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks),new THREE.LineBasicMaterial({color:0x9edbd3,transparent:true,opacity:.55})));
      const paddleGeo=new THREE.BoxGeometry(.11,2.35,2.82);this.paddle=new THREE.Mesh(paddleGeo,new THREE.MeshStandardMaterial({color:0x6a8e8c,metalness:.78,roughness:.25}));this.paddle.position.set(-3.15,1.12,0);this.paddle.castShadow=true;this.group.add(this.paddle);
      this.paddleFace=new THREE.Mesh(new THREE.BoxGeometry(.025,1.95,2.58),new THREE.MeshStandardMaterial({color:0x8ed8ca,metalness:.5,roughness:.25,emissive:0x245f56,emissiveIntensity:.4}));this.paddleFace.position.set(.068,0,0);this.paddle.add(this.paddleFace);
      const rod=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,1.15,16),rimMat);rod.rotation.z=Math.PI/2;rod.position.set(-.55,.74,0);this.paddle.add(rod);
      const motor=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.68,32),new THREE.MeshStandardMaterial({color:0x243e42,metalness:.82,roughness:.25}));motor.rotation.z=Math.PI/2;motor.position.set(-4.1,1.85,0);this.group.add(motor);
      const causticMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uEnergy:{value:0}},vertexShader:`varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vPos;uniform float uTime;uniform float uEnergy;void main(){float a=sin(vPos.x*9.+uTime*1.8)+sin(vPos.z*15.-uTime*1.3)+sin((vPos.x+vPos.z)*7.+uTime);float c=pow(max(0.,a/3.),5.);gl_FragColor=vec4(.25,.85,.78,c*(.07+uEnergy*.025));}`});
      this.caustics=new THREE.Mesh(floorGeo.clone(),causticMat);this.caustics.position.y=.008;this.group.add(this.caustics);
      const labelTex=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#8fc7bf';ctx.font='16px monospace';ctx.fillText('PIC / FLIP     ·     WAVE FLUME 02',16,38);},512,64);const label=new THREE.Mesh(new THREE.PlaneGeometry(3.1,.38),new THREE.MeshBasicMaterial({map:labelTex,transparent:true,opacity:.65,depthWrite:false}));label.position.set(.4,-.2,1.765);this.group.add(label);
    }
    buildWater(){
      this.surfaceGeo=new THREE.PlaneGeometry(7.12,2.82,64,26);this.surfaceGeo.rotateX(-Math.PI/2);
      const colors=new Float32Array(this.surfaceGeo.attributes.position.count*3);colors.fill(1);this.surfaceGeo.setAttribute('color',new THREE.BufferAttribute(colors,3));this.surfaceGeo.setAttribute('aFoam',new THREE.BufferAttribute(new Float32Array(this.surfaceGeo.attributes.position.count),1).setUsage(THREE.DynamicDrawUsage));
      this.surfaceMesh=new THREE.Mesh(this.surfaceGeo,new THREE.MeshPhysicalMaterial({color:0x0e8f9f,vertexColors:true,roughness:.13,metalness:.05,transmission:.24,thickness:.75,ior:1.333,transparent:true,opacity:.68,clearcoat:1,clearcoatRoughness:.1,envMapIntensity:1.45,side:THREE.DoubleSide,depthWrite:false}));this.surfaceMesh.renderOrder=4;this.surfaceMesh.receiveShadow=true;this.group.add(this.surfaceMesh);
      this.frothMesh=new THREE.Mesh(this.surfaceGeo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:{value:0}},vertexShader:`attribute float aFoam;varying float vFoam;varying vec3 vWorld;void main(){vFoam=aFoam;vec4 world=modelMatrix*vec4(position+vec3(0.,.024,0.),1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,fragmentShader:`varying float vFoam;varying vec3 vWorld;uniform float uTime;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}void main(){float broad=noise(vWorld.xz*13.+vec2(uTime*.13,-uTime*.08));float fine=noise(vWorld.xz*43.);float alpha=smoothstep(.06,.42,vFoam)*(.16+.84*smoothstep(.22,.88,broad+fine*.34))*.62;if(alpha<.025)discard;gl_FragColor=vec4(mix(vec3(.67,.91,.9),vec3(.96,1.,.98),fine),alpha);}`}));
      this.frothMesh.renderOrder=5;this.group.add(this.frothMesh);
      this.volumeMesh=new THREE.Mesh(new THREE.BoxGeometry(7.1,1,2.81),new THREE.MeshPhysicalMaterial({color:0x1a8c9d,transmission:.3,transparent:true,opacity:.065,roughness:.15,side:THREE.BackSide,depthWrite:false}));this.volumeMesh.position.y=.82;this.volumeMesh.scale.y=1.62;this.volumeMesh.renderOrder=1;this.group.add(this.volumeMesh);
      const n=this.water?this.water.count:0;this.waterPositions=new Float32Array(n*3);this.waterState=new Float32Array(n*3);
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.waterPositions,3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('aFoam',new THREE.BufferAttribute(new Float32Array(n),1).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('aMass',new THREE.BufferAttribute(new Float32Array(n),1).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('aSpeed',new THREE.BufferAttribute(new Float32Array(n),1).setUsage(THREE.DynamicDrawUsage));
      this.waterPoints=new THREE.Points(geo,new THREE.ShaderMaterial({vertexShader:waterVertex,fragmentShader:waterFragment,uniforms:{uRatio:{value:Math.min(devicePixelRatio,2)}},transparent:true,depthWrite:false,blending:THREE.NormalBlending}));this.waterPoints.renderOrder=6;this.group.add(this.waterPoints);
      this.foamGeo=new THREE.BufferGeometry();this.foamGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(65*27*3),3).setUsage(THREE.DynamicDrawUsage));this.foamPoints=new THREE.Points(this.foamGeo,new THREE.PointsMaterial({color:0xf2fffc,size:.15,map:canvasTexture((ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.45,'rgba(255,255,255,.85)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);},64,64),transparent:true,opacity:.38,alphaTest:.025,depthWrite:false,blending:THREE.NormalBlending}));this.foamPoints.renderOrder=7;this.group.add(this.foamPoints);
      this.bubbleGeo=new THREE.BufferGeometry();this.bubbleGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(500*3),3).setUsage(THREE.DynamicDrawUsage));this.bubblePoints=new THREE.Points(this.bubbleGeo,new THREE.PointsMaterial({color:0xd4fffa,size:.036,transparent:true,opacity:.6,depthWrite:false}));this.bubblePoints.renderOrder=5;this.group.add(this.bubblePoints);
    }
    buildBalls(){
      const colors=[0xff8b70,0xf5cf66,0x6ee7dc,0xa893ff];
      for(let g=0;g<4;g++)for(let i=0;i<4;i++){
        const ball={group:g,index:i,position:new THREE.Vector3(),velocity:new THREE.Vector3(),radius:.17,density:this.densities[g],inWater:false,active:true,angle:0};this.balls.push(ball);
        const mesh=new THREE.Mesh(new THREE.SphereGeometry(ball.radius,28,20),new THREE.MeshPhysicalMaterial({color:colors[g],roughness:.22,metalness:g===3?.48:.12,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.25}));mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);this.ballViews.push(mesh);
      }
      this.arrangeBalls();
    }
    arrangeBalls(){
      for(const b of this.balls){const g=b.group,i=b.index;const x=-2.35+g*1.55+(i%2)*.34,z=-.65+Math.floor(i/2)*1.05;b.position.set(x,g===0?1.69:g===1?.96:g===2?.74:terrain(x,z)+b.radius,z);b.velocity.set(0,0,0);b.inWater=true;}this.syncBalls();
    }
    releaseBalls(stagger=false){
      this.seed=1729;
      for(const b of this.balls){const g=b.group,i=b.index;b.density=this.densities[g];const neutral=g===2;b.position.set(-2.35+g*1.55+(i%2-.5)*.24,neutral?2.02+i*.035:2.55+g*.13+i*.12,-.82+i*.53);b.velocity.set((Math.sin(i*7+g)-.5)*.08,neutral?-.22:stagger?-1.1-g*.12:-.3,0);b.inWater=false;b.active=true;}this.syncBalls();
    }
    setDensities(values){this.densities=values.slice();this.balls.forEach(b=>b.density=this.densities[b.group]);}
    sampleSurface(x,z){
      const s=this.surfaceData;if(!s)return this.water?this.water.meanLevel:1.65;const fx=clamp((x+3.6)/7.2*(s.nx-1),0,s.nx-1),fz=clamp((z+1.45)/2.9*(s.nz-1),0,s.nz-1),x0=Math.floor(fx),z0=Math.floor(fz),x1=Math.min(s.nx-1,x0+1),z1=Math.min(s.nz-1,z0+1),tx=fx-x0,tz=fz-z0;
      return lerp(lerp(s.top[x0+s.nx*z0],s.top[x1+s.nx*z0],tx),lerp(s.top[x0+s.nx*z1],s.top[x1+s.nx*z1],tx),tz);
    }
    buildFlow(){
      const nx=24,ny=16,nz=12,n=nx*ny*nz,sum=new Float32Array(n*3),count=new Uint16Array(n),p=this.water.positions,v=this.water.velocities;
      for(let i=0;i<this.water.count;i++){const k=i*4,x=Math.floor((p[k]+3.6)/7.2*nx),y=Math.floor(p[k+1]/4.2*ny),z=Math.floor((p[k+2]+1.45)/2.9*nz);if(x<0||x>=nx||y<0||y>=ny||z<0||z>=nz)continue;const id=x+nx*(y+ny*z);sum[id*3]+=v[k];sum[id*3+1]+=v[k+1];sum[id*3+2]+=v[k+2];count[id]++;}
      this.flow={nx,ny,nz,sum,count};
    }
    sampleFlow(x,y,z,out){
      out.set(0,0,0);const f=this.flow;if(!f)return out;const ix=clamp(Math.floor((x+3.6)/7.2*f.nx),0,f.nx-1),iy=clamp(Math.floor(y/4.2*f.ny),0,f.ny-1),iz=clamp(Math.floor((z+1.45)/2.9*f.nz),0,f.nz-1);let n=0;
      for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)>1)continue;const a=ix+dx,b=iy+dy,c=iz+dz;if(a<0||a>=f.nx||b<0||b>=f.ny||c<0||c>=f.nz)continue;const id=a+f.nx*(b+f.ny*c);if(f.count[id]){out.x+=f.sum[id*3];out.y+=f.sum[id*3+1];out.z+=f.sum[id*3+2];n+=f.count[id];}}
      if(n)out.multiplyScalar(1.8/n);return out;
    }
    sampleFoam(x,z){const s=this.surfaceData;if(!s)return 0;const ix=clamp(Math.round((x+3.6)/7.2*(s.nx-1)),0,s.nx-1),iz=clamp(Math.round((z+1.45)/2.9*(s.nz-1)),0,s.nz-1);return s.foam[ix+s.nx*iz];}
    stepBalls(dt){
      const flow=new THREE.Vector3();let anySplash=false;
      for(const b of this.balls){
        const oldY=b.position.y,surface=this.sampleSurface(b.position.x,b.position.z),cap=clamp(surface-(b.position.y-b.radius),0,b.radius*2),full=4/3*Math.PI*b.radius**3,submerged=Math.PI*cap*cap*(b.radius-cap/3)/full;
        b.velocity.y-=9.81*dt;b.velocity.y+=9.81*submerged/b.density*dt;
        this.sampleFlow(b.position.x,b.position.y,b.position.z,flow);const drag=1-Math.exp(-(1.1+2.8/b.density)*submerged*dt);b.velocity.lerp(flow,drag);
        const foam=this.sampleFoam(b.position.x,b.position.z);if(b.density<.7&&foam>.02&&submerged>.08){b.velocity.y+=foam*10*dt;b.velocity.x+=foam*2.4*dt;}
        if(b.density>1.5&&flow.length()>.12)b.velocity.y+=Math.max(0,flow.y)*dt*2.5;
        if(submerged>.05){b.velocity.x*=Math.exp(-.15*dt);b.velocity.z*=Math.exp(-.15*dt);if(b.velocity.length()>.65&&this.random()<dt*9)this.spawnBubble(b.position,b.velocity);}
        b.position.addScaledVector(b.velocity,dt);
        const floor=terrain(b.position.x,b.position.z)+b.radius;
        if(b.position.y<floor){b.position.y=floor;if(b.velocity.y<0){if(Math.abs(b.velocity.y)>.65&&this.onSound)this.onSound('ball',Math.abs(b.velocity.y),b.position);b.velocity.y*=-.2;}const friction=Math.exp(-(1.4+submerged*2)*dt);b.velocity.x*=friction;b.velocity.z*=friction;}
        if(Math.abs(b.position.x)>3.6-b.radius){b.position.x=Math.sign(b.position.x)*(3.6-b.radius);b.velocity.x*=-.38;}
        if(Math.abs(b.position.z)>1.45-b.radius){b.position.z=Math.sign(b.position.z)*(1.45-b.radius);b.velocity.z*=-.38;}
        if(b.position.y>5){b.position.y=5;b.velocity.y=-Math.abs(b.velocity.y);}
        const submergedNow=clamp((surface-b.position.y+b.radius)/(2*b.radius),0,1);
        if(submergedNow>.08&&!b.inWater){const energy=.5*b.density*b.velocity.length()**2;if(this.onSound)this.onSound('splash',energy,b.position);anySplash=true;}b.inWater=submergedNow>.08;
        if(b.position.y>surface+1&&oldY<=surface+1)b.inWater=false;
        b.angle+=b.velocity.x*dt/b.radius;
      }
      for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++){
        const a=this.balls[i],b=this.balls[j],d=new THREE.Vector3().subVectors(b.position,a.position),len=d.length(),min=a.radius+b.radius;if(len>=min||len<1e-5)continue;d.multiplyScalar(1/len);const corr=(min-len)*.5;a.position.addScaledVector(d,-corr);b.position.addScaledVector(d,corr);const rel=new THREE.Vector3().subVectors(b.velocity,a.velocity).dot(d);if(rel<0){const impulse=-1.25*rel/(1/a.density+1/b.density);a.velocity.addScaledVector(d,-impulse/a.density);b.velocity.addScaledVector(d,impulse/b.density);if(this.onSound&&Math.abs(rel)>.5)this.onSound('ball',Math.abs(rel),a.position);}
      }
      return anySplash;
    }
    random(){this.seed=(Math.imul(this.seed??1729,1664525)+1013904223)>>>0;return this.seed/4294967296;}
    spawnBubble(position,velocity){if(this.bubbles.length>=480)this.bubbles.shift();this.bubbles.push({position:position.clone().add(new THREE.Vector3((this.random()-.5)*.12,-.08,(this.random()-.5)*.12)),velocity:new THREE.Vector3(velocity.x*.12,.18+this.random()*.25,velocity.z*.12),life:1.5+this.random()*1.6});}
    updateBubbles(dt){for(let i=this.bubbles.length-1;i>=0;i--){const b=this.bubbles[i];b.position.addScaledVector(b.velocity,dt);b.velocity.y+=.07*dt;b.life-=dt;if(b.position.y>this.sampleSurface(b.position.x,b.position.z)||b.life<0)this.bubbles.splice(i,1);}}
    async step(dt){this.time+=dt;this.stepBalls(dt);if(this.water)await this.water.step(dt,this.balls);this.updateBubbles(dt);this.syncWater();this.syncBalls();}
    syncWater(){
      if(!this.water)return;const p=this.water.positions,v=this.water.velocities,geo=this.waterPoints.geometry;
      for(let i=0;i<this.water.count;i++){const k=i*4,j=i*3;this.waterPositions[j]=p[k];this.waterPositions[j+1]=p[k+1];this.waterPositions[j+2]=p[k+2];geo.attributes.aFoam.array[i]=p[k+3];geo.attributes.aMass.array[i]=v[k+3];geo.attributes.aSpeed.array[i]=Math.hypot(v[k],v[k+1],v[k+2]);}
      geo.attributes.position.needsUpdate=true;geo.attributes.aFoam.needsUpdate=true;geo.attributes.aMass.needsUpdate=true;geo.attributes.aSpeed.needsUpdate=true;geo.computeBoundingSphere();
      this.surfaceData=this.water.surface();const sp=this.surfaceGeo.attributes.position,s=this.surfaceData,col=this.surfaceGeo.attributes.color,foamAttr=this.surfaceGeo.attributes.aFoam;let foamCount=0;const fp=this.foamGeo.attributes.position;
      for(let z=0;z<s.nz;z++)for(let x=0;x<s.nx;x++){const id=x+s.nx*z,vi=z*s.nx+x,y=s.top[id];sp.setY(vi,y);const f=clamp(s.foam[id]*3.5,0,1);foamAttr.setX(vi,f);col.setXYZ(vi,lerp(.42,1,f),lerp(.82,1,f),lerp(.9,1,f));if(f>.055){fp.setXYZ(foamCount++,sp.getX(vi)+Math.sin(id*12.91)*.045,y+.035+Math.sin(id*4.17)*.018,sp.getZ(vi)+Math.cos(id*8.37)*.045);}}
      sp.needsUpdate=true;col.needsUpdate=true;foamAttr.needsUpdate=true;this.surfaceGeo.computeVertexNormals();this.surfaceGeo.computeBoundingSphere();this.foamGeo.setDrawRange(0,foamCount);fp.needsUpdate=true;
      this.volumeMesh.scale.y=Math.max(.2,this.water.meanLevel);this.volumeMesh.position.y=this.water.meanLevel*.5;this.buildFlow();
    }
    syncBalls(){this.balls.forEach((b,i)=>{this.ballViews[i].position.copy(b.position);this.ballViews[i].rotation.z=-b.angle;});}
    updateVisual(dt){
      if(this.water){const amp=this.water.currentAmplitude*.72;this.paddle.position.x=-3.6+Math.max(.08,.45+amp*Math.sin(this.water.phase));this.paddleFace.material.emissiveIntensity=.25+this.water.currentAmplitude*.8;}
      this.caustics.material.uniforms.uTime.value=this.time;this.caustics.material.uniforms.uEnergy.value=this.water?Math.min(3,this.water.energy):0;this.frothMesh.material.uniforms.uTime.value=this.time;
      const bp=this.bubbleGeo.attributes.position;this.bubbles.forEach((b,i)=>bp.setXYZ(i,b.position.x,b.position.y,b.position.z));bp.needsUpdate=true;this.bubbleGeo.setDrawRange(0,this.bubbles.length);this.updateCamera(dt);
    }
    cameraHome(){this.setOrbit(.76,1.13,10.1,new THREE.Vector3(0,1.12,0));}
    cameraDetail(){this.setOrbit(.92,1.23,7.6,new THREE.Vector3(.6,1.35,0));}
    demoCamera(run,t){
      if(t<3.8){this.setOrbit(.7+t*.02,1.17,lerp(9.5,8.7,t/3.8),new THREE.Vector3(0,1.3,0));}
      else if(t<13.8){const travel=clamp((t-4)/9,0,1);this.setOrbit(.82+Math.sin(t*.16)*.09,1.12,lerp(9.1,8.2,smooth(travel)),new THREE.Vector3(lerp(-.5,1.15,travel),1.25,0));}
      else{this.setOrbit(lerp(.9,.66,clamp((t-13.8)/5,0,1)),1.13,lerp(8.4,10.3,clamp((t-13.8)/5,0,1)),new THREE.Vector3(.3,1.1,0));}
    }
  }

  window.LabScenes={makeEnvironment,JellyScene,TankScene,terrain,clamp,lerp,smooth};
})();
