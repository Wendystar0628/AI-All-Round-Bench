'use strict';
/* 场景二渲染：玻璃水槽、由 MPM 占有度 3D 纹理 raymarch 的水体、
 * 多密度刚球、造浪板、地形、白水/飞溅点精灵。 */

const BALL_COLORS=[0xff6b59,0xffc84d,0x9be86b,0x56c7ff,0xb08bff];
const BALL_NAMES=['很轻','较轻','中性','较重','很重'];
const BALL_DENS=[0.42,0.72,1.0,1.3,1.75];

const WATER_VERT=/* glsl */`#version 300 es
precision highp float;
in vec3 position;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
out vec3 vWorld;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  vWorld=wp.xyz;
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;

const WATER_FRAG=/* glsl */`#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uGrid;
uniform vec3 uOrigin; uniform vec3 uCell; uniform vec3 uGridN;
uniform vec3 uCamPos; uniform float uTime;
uniform float uWaterLevel; uniform vec3 uTankMax;
in vec3 vWorld;
out vec4 outColor;

float occAt(vec3 w){
  vec3 uvw=(w-uOrigin)/uCell/uGridN;
  if(any(bvec3(lessThan(uvw,vec3(0.02))))||any(bvec3(greaterThan(uvw,vec3(0.98))))) return 0.0;
  return texture(uGrid,uvw).a;
}
float foamAt(vec3 w){
  vec3 uvw=(w-uOrigin)/uCell/uGridN;
  if(any(bvec3(lessThan(uvw,vec3(0.02))))||any(bvec3(greaterThan(uvw,vec3(0.98))))) return 0.0;
  return texture(uGrid,uvw).b;
}
vec3 occGrad(vec3 w){
  float e=uCell.x;
  return vec3(occAt(w+vec3(e,0,0))-occAt(w-vec3(e,0,0)),
              occAt(w+vec3(0,e,0))-occAt(w-vec3(0,e,0)),
              occAt(w+vec3(0,0,e))-occAt(w-vec3(0,0,e)))/(2.0*e);
}

float terrainH(vec2 xz){
  float ty=0.0;
  float rs=3.45;
  float ramp=smoothstep(rs-0.05,rs+0.55,xz.x);
  ty=ramp*clamp((xz.x-rs)*0.95,0.0,0.95);
  float dx=(xz.x-2.55)/0.42;
  float dz=(xz.y-0.625)/(0.42*0.85);
  float d2=dx*dx+dz*dz;
  if(d2<1.0){ ty=max(ty,0.42*sqrt(1.0-d2)); }
  return ty;
}

// 光线步进：返回进入/离开距离与命中类型
vec2 raymarch(vec3 ro, vec3 rd, out vec3 hitN, out float foam){
  vec3 mn=uOrigin; vec3 mx=uOrigin+uCell*uGridN;
  float t0=0.0,t1=12.0;
  // 盒相交
  for(int i=0;i<3;i++){
    float a=(mn[i]-ro[i])/rd[i], b=(mx[i]-ro[i])/rd[i];
    if(a>b){float t2=a;a=b;b=t2;}
    t0=max(t0,a);t1=min(t1,b);
  }
  if(t1<t0) return vec2(-1.0);
  float enter=t1, leave=t1;
  bool inside=false; bool found=false;
  float t=max(t0,0.0);
  float stepL=uCell.x*0.9;
  float prev=0.0;
  vec3 prevP=ro+rd*t;
  for(int i=0;i<160;i++){
    if(t>t1) break;
    vec3 p=ro+rd*t;
    float o=occAt(p);
    if(o>0.28){
      if(!found){ enter=mix(t-stepL,t,clamp((0.28-prev)/max(o-prev,1e-3),0.0,1.0)); found=true; }
      inside=true;
    }else{
      if(inside){ leave=t; break; }
    }
    prev=o; prevP=p; t+=stepL;
  }
  if(!found) return vec2(-1.0);
  if(inside) leave=min(t,t1);
  vec3 hp=ro+rd*enter;
  hitN=normalize(-occGrad(hp)+vec3(0.0,0.001,0.0));
  foam=foamAt(hp+hitN*uCell.x*1.5);
  return vec2(enter,leave);
}

void main(){
  vec3 ro=uCamPos;
  vec3 rd=normalize(vWorld-uCamPos);
  vec3 nrm; float foam;
  vec2 hit=raymarch(ro,rd,nrm,foam);
  vec3 col;
  vec3 deep=vec3(0.02,0.13,0.22);
  vec3 shallow=vec3(0.35,0.72,0.82);
  vec3 bg=mix(vec3(0.05,0.09,0.15),vec3(0.12,0.2,0.32),clamp(rd.y*0.8+0.4,0.0,1.0));
  if(hit.x<0.0){
    // 没命中：可能看见水下地形（透过玻璃边缘）——给淡背景
    outColor=vec4(col,0.0);
    return;
  }
  vec3 hp=ro+rd*hit.x;
  // 菲涅耳
  float fres=pow(1.0-max(dot(-rd,nrm),0.0),3.0);
  // 反射：环境渐变 + 高光带
  vec3 refl=mix(vec3(0.05,0.1,0.18),vec3(0.55,0.72,0.9),clamp(nrm.y*0.5+0.5,0.0,1.0));
  float band=exp(-pow((hp.x*0.9-hp.z*0.4-1.2),2.0)*0.25)*0.25;
  refl+=vec3(1.0,0.95,0.85)*band*max(nrm.y,0.0);
  // 折射颜色（按水深）
  float depth=hit.y-hit.x;
  vec3 waterCol=mix(shallow,deep,clamp(depth*0.9,0.0,1.0));
  // 水底地形（射线在水中继续到地形）
  vec3 underP=ro+rd*hit.y;
  vec3 tint=waterCol;
  if(rd.y<0.0){
    float tg=(-hp.y)/rd.y;
    vec3 bp=hp+rd*tg;
    if(tg>0.0 && bp.y<terrainH(bp.xz)+0.02){
      float shallowD=clamp(tg*1.4,0.0,1.0);
      vec3 sand=vec3(0.32,0.3,0.24);
      tint=mix(sand*0.6+vec3(0.05,0.18,0.22),deep,shallowD);
    }
  }
  // 焦散光
  float caust=0.5+0.5*sin(hp.x*9.0+uTime*1.4)*sin(hp.z*7.0-uTime*1.1);
  tint*=0.85+0.25*caust;
  col=mix(tint,refl,fres*0.75);
  // 白水
  col=mix(col,vec3(0.92,0.96,1.0),foam*0.85);
  // 表面 alpha：表面不透明些，越往体内越淡（帮助看见水下球）
  float surfA=0.42+fres*0.45+foam*0.5;
  float alpha=clamp(surfA,0.08,0.92);
  outColor=vec4(col,alpha);
}
`;

class TankScene {
  constructor(renderer, sim){
    this.renderer=renderer; this.sim=sim;
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x0c1420);
    this.scene.fog=new THREE.Fog(0x0c1420, 6, 14);
    this.scene.environment=APP.makeEnvTexture();

    this.camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,0.05,60);
    this.camera.position.set(2.1,2.1,3.4);
    this.controls=new THREE.OrbitControls(this.camera,renderer.domElement);
    this.controls.target.set(2.25,0.55,0.62);
    this.controls.enableDamping=true;this.controls.dampingFactor=0.08;
    this.controls.minDistance=1.0;this.controls.maxDistance=10;
    this.controls.maxPolarAngle=Math.PI*0.55;

    this._lights(); this._buildTank();
    this._buildWater();
    this._buildBalls();
    this._buildSpray();
    this._spray=[];

    this.ballDensity=BALL_DENS.slice();
    this.sprayTimer=0;
  }
  _lights(){
    this.scene.add(new THREE.HemisphereLight(0xcfe4ff,0x1c2230,0.7));
    const k=new THREE.DirectionalLight(0xfff2dd,2.0);
    k.position.set(2.5,6,-2); k.castShadow=true;
    k.shadow.mapSize.set(2048,2048);
    k.shadow.camera.left=-3;k.shadow.camera.right=6;k.shadow.camera.top=4;k.shadow.camera.bottom=-3;
    k.shadow.camera.near=1;k.shadow.camera.far=14;k.shadow.bias=-0.0004;
    this.scene.add(k);
    const r=new THREE.DirectionalLight(0x9fc8ff,0.8);r.position.set(-3,2,3);this.scene.add(r);
  }
  _buildTank(){
    const C=this.sim.cfg;
    const L=C.length, H=1.6, W=C.width, t=0.025;
    const glass=new THREE.MeshPhysicalMaterial({color:0xbfe3f2,transparent:true,opacity:0.13,
      roughness:0.05,metalness:0,transmission:0.9,thickness:0.05,ior:1.45,
      side:THREE.DoubleSide,depthWrite:false});
    const mk=(w,h,d,x,y,z)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),glass);
      m.position.set(x,y,z); this.scene.add(m); return m; };
    // 前/后/右/底（左端是造浪板）
    mk(L,t,W,L/2,-t/2,W/2);
    mk(L,H,t,L/2,H/2,-t/2);
    mk(L,H,t,L/2,H/2,W+t/2);
    mk(t,H,W,L+t/2,H/2,W/2);
    // 玻璃边缘高光线
    const edgeMat=new THREE.LineBasicMaterial({color:0xaad8f0,transparent:true,opacity:0.7});
    const pts=[
      new THREE.Vector3(0,H,0),new THREE.Vector3(L,H,0),new THREE.Vector3(L,0,0),
      new THREE.Vector3(0,H,W),new THREE.Vector3(L,H,W),new THREE.Vector3(L,0,W),
      new THREE.Vector3(0,H,0),new THREE.Vector3(0,H,W),
      new THREE.Vector3(L,H,0),new THREE.Vector3(L,H,W)
    ];
    const g=new THREE.BufferGeometry().setFromPoints(pts);
    this.scene.add(new THREE.LineSegments(g,edgeMat));
    // 底座
    const base=new THREE.Mesh(new THREE.BoxGeometry(L+0.12,0.1,W+0.12),
      new THREE.MeshStandardMaterial({color:0x22304a,roughness:0.5,metalness:0.4}));
    base.position.y=-0.07;base.receiveShadow=true;this.scene.add(base);

    // 地形（斜坡+礁石）：自定义网格
    const tg=new THREE.PlaneGeometry(L,W,90,24);
    tg.rotateX(-Math.PI/2);
    const pa=tg.attributes.position;
    for(let i=0;i<pa.count;i++){
      const x=pa.getX(i)+L/2, z=pa.getZ(i)+W/2;
      pa.setY(i,this.sim._terrainY(x,z));
      pa.setX(i,x);pa.setZ(i,z);
    }
    tg.computeVertexNormals();
    const tm=new THREE.MeshStandardMaterial({color:0x4a5566,roughness:0.85,metalness:0.05});
    this.terrain=new THREE.Mesh(tg,tm);this.terrain.receiveShadow=true;this.scene.add(this.terrain);

    // 造浪板（推板 + 导轨）
    this.paddle=new THREE.Mesh(new THREE.BoxGeometry(0.06,1.5,W-0.06),
      new THREE.MeshStandardMaterial({color:0x9aa8bc,roughness:0.3,metalness:0.75}));
    this.paddle.position.set(C.x0,0.75,W/2);this.paddle.castShadow=true;
    this.scene.add(this.paddle);
    const railMat=new THREE.MeshStandardMaterial({color:0x5a6a80,roughness:0.3,metalness:0.8});
    for(const zz of [0.05,W-0.05]){
      const rail=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.9,12),railMat);
      rail.rotation.z=Math.PI/2;rail.position.set(C.x0-0.05,1.5,zz);this.scene.add(rail);
    }
  }
  _buildWater(){
    const C=this.sim.cfg;
    // 平面盒（覆盖整个网格域），shader 内 raymarch
    const geo=new THREE.BoxGeometry(C.nx*C.h,C.ny*C.h,C.nz*C.h);
    const tex=new THREE.DataTexture3D(this.sim.statsBytes||new Uint8Array(this.sim.N*4),
      C.nx+1,C.ny+1,C.nz+1);
    tex.format=THREE.RGBAFormat; tex.type=THREE.UnsignedByteType;
    tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter;
    tex.wrapS=tex.wrapT=tex.wrapR=THREE.ClampToEdgeWrapping;
    tex.unpackAlignment=1;
    this.gridTex=tex;
    this.waterMat=new THREE.ShaderMaterial({
      vertexShader:WATER_VERT, fragmentShader:WATER_FRAG,
      uniforms:{
        uGrid:{value:tex},
        uOrigin:{value:APP.V3(0,0,0)},
        uCell:{value:APP.V3(C.h,C.h,C.h)},
        uGridN:{value:APP.V3(C.nx+1,C.ny+1,C.nz+1)},
        uCamPos:{value:APP.V3()},
        uTime:{value:0},
        uWaterLevel:{value:C.waterLevel},
        uTankMax:{value:APP.V3(C.length,1.6,C.width)}
      },
      transparent:true, depthWrite:false, side:THREE.BackSide,
      glslVersion:THREE.GLSL3
    });
    this.water=new THREE.Mesh(geo,this.waterMat);
    this.scene.add(this.water);
  }
  _buildBalls(){
    const geo=new THREE.SphereGeometry(0.075,32,24);
    this.ballMeshes=[];
    for(let i=0;i<MAX_BALLS;i++){
      const mat=new THREE.MeshPhysicalMaterial({color:BALL_COLORS[i%5],
        roughness:0.25,metalness:0.0,clearcoat:0.7,clearcoatRoughness:0.2});
      const m=new THREE.Mesh(geo,mat);
      m.castShadow=true;m.receiveShadow=true;m.visible=false;this.scene.add(m);
      this.ballMeshes.push(m);
    }
  }
  _buildSpray(){
    const N=1200;
    this.sprayPos=new Float32Array(N*3);
    this.sprayCol=new Float32Array(N*3);
    this.sprayGeo=new THREE.BufferGeometry();
    this.sprayGeo.setAttribute('position',new THREE.BufferAttribute(this.sprayPos,3));
    this.sprayGeo.setAttribute('color',new THREE.BufferAttribute(this.sprayCol,3));
    const mat=new THREE.PointsMaterial({size:0.035,vertexColors:true,transparent:true,
      opacity:0.9,depthWrite:false,blending:THREE.AdditiveBlending});
    this.sprayPts=new THREE.Points(this.sprayGeo,mat);this.sprayPts.frustumCulled=false;
    this.scene.add(this.sprayPts);
  }

  /* 由 sim 状态同步渲染对象 */
  sync(dt){
    const C=this.sim.cfg;
    // 3D 纹理
    if(this.sim.statsBytes){
      if(!this.gridTex.image||this.gridTex.image.data!==this.sim.statsBytes){
        this.gridTex.image.data=this.sim.statsBytes;
      }
      this.gridTex.needsUpdate=true;
    }
    this.waterMat.uniforms.uCamPos.value.copy(this.camera.position);
    this.waterMat.uniforms.uTime.value=this.sim.time;
    // 球
    this.sim.balls.forEach((b,i)=>{
      const m=this.ballMeshes[i];
      m.visible=b.active;
      if(b.active){
        m.position.copy(b.pos);
        m.material.color.setHex(BALL_COLORS[b.group]);
        const s=b.r/0.075; m.scale.setScalar(s);
      }
    });
    // 造浪板
    this.paddle.position.x=this.sim.paddleX;
    // 白水粒子：根据事件与高速区生成（轻量 CPU 粒子）
    this._updateSpray(dt);
  }

  _updateSpray(dt){
    // 入水事件 -> 一圈飞溅
    for(const e of this.sim.events){
      if(e.type==='splash') this._burst(e.pos, Math.round(20+e.intensity*50), e.intensity);
    }
    // 造浪破碎区：扫描 stats 中的 foam 像素（抽样）
    this.sprayTimer-=dt;
    if(this.sprayTimer<=0){
      this.sprayTimer=0.05;
      if(this.sim.statsBytes && this.sim.waveOn){
        const C=this.sim.cfg, b=this.sim.statsBytes;
        const ny=C.ny+1,nz=C.nz+1, stride=ny*nz;
        for(let i=0;i<140;i++){
          const n=(Math.random()*b.length/4)|0;
          const foam=b[n*4+3];
          if(foam>110 && Math.random()<0.5){
            const x=((n/stride)|0), yz=n%stride, y=(yz/nz)|0, z=yz%nz;
            this._addSpray(x*C.h+(Math.random()-0.5)*C.h, y*C.h, z*C.h+(Math.random()-0.5)*C.h,
              0.6+foam/400);
          }
        }
      }
    }
    // 积分
    const p=this.sprayPos,c=this.sprayCol;
    for(let i=0;i<p.length/3;i++){
      if(c[i*3]<0) continue;
      const idx=i*3;
      if(p[idx+1]<-1){c[idx]=-1;continue;}
      this._sv= this._sv||[];
      let v=this._sv[i]; if(!v){v=this._sv[i]=APP.V3();}
      v.y-=9.81*dt;
      p[idx]+=v.x*dt;p[idx+1]+=v.y*dt;p[idx+2]+=v.z*dt;
      c[idx]*=Math.pow(0.02,dt); // 衰减标记
      if(p[idx+1]<0.02||c[idx]<0.02){c[idx]=-1;}
    }
    this.sprayGeo.attributes.position.needsUpdate=true;
    this.sprayGeo.attributes.color.needsUpdate=true;
  }
  _burst(center,n,intensity){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, r=Math.random()*0.12;
      this._addSpray(center.x+Math.cos(a)*r, center.y+0.02, center.z+Math.sin(a)*r,
        intensity, Math.sin(a)*2.2*intensity, 2.5+Math.random()*2.5*intensity, Math.cos(a)*2.2*intensity);
    }
  }
  _addSpray(x,y,z,intensity=0.5,vx=0,vy=0,vz=0){
    const p=this.sprayPos,c=this.sprayCol;
    for(let i=0;i<p.length/3;i++){
      if(c[i*3]<0){
        p[i*3]=x;p[i*3+1]=y;p[i*3+2]=z;
        c[i*3]=0.85+Math.random()*0.15;c[i*3+1]=0.92;c[i*3+2]=1.0;
        let v=this._sv[i]; if(!v){v=this._sv[i]=APP.V3();}
        v.set(vx+(Math.random()-0.5)*1.2,vy,vz+(Math.random()-0.5)*1.2);
        return;
      }
    }
  }

  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  render(){this.controls.update();this.renderer.render(this.scene,this.camera);}
}
window.TankScene=TankScene;
window.BALL_COLORS=BALL_COLORS;window.BALL_NAMES=BALL_NAMES;window.BALL_DENS=BALL_DENS;
