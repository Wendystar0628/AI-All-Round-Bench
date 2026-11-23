'use strict';
const tetraPattern=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
const surfaceTriangles=[[0,1,2],[0,2,3]];
const subdividedTri=[0,3,5,3,1,4,5,4,2,3,4,5];
const voxelFaces=[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]];
const jellyColors=[0x39dcb3,0xffa53d,0x9c83ef];
class SoftGel {
  constructor(scene,center,dimensions,resolution,kind){
    this.kind=kind; this.center=center; this.dims=dimensions;
    this.squeeze=0;this.squeezeV=0;this.tilt=0;this.tiltV=0;this.frameY=1;this.frameX=1;
    this.slide=[0,0];this.slideV=[0,0];this.spinKick=v3();
    const [nx,ny,nz]=resolution, [w,h,d]=dimensions;
    const cells=[],nodes=[],rest=[],links=[],vols=[],faces=[],bonds=[];
    // Each voxel owns six tetrahedra and connects to its neighbors through cohesive faces.
    const id=(x,y,z)=>x+(nx+1)*(y+(ny+1)*z);
    const index=(x,y,z)=>x+nx*(y+ny*z);
    const rounded=(x,y,z)=>{
      const coord=[(x/nx-.5)*w,(y/ny-.5)*h,(z/nz-.5)*d];
      const rad=kind===2?.43:.38; const inset=coord.map((v,i)=>clamp(v,-dimensions[i]/2+rad,dimensions[i]/2-rad));
      const dx=coord.map((v,i)=>v-inset[i]), l=Math.hypot(...dx), t=l>rad?rad/l:1;
      const inner=Math.max(0,1-Math.abs(coord[0])*1.48);
      const grain=kind===0?inner*(.116*Math.sin(y*1.48+z*1.36)+.060*Math.cos(z*2.30-y*1.52)) : 0;
      return [center[0]+inset[0]+dx[0]*t+grain,h/2+inset[1]+dx[1]*t+.017,center[1]+inset[2]+dx[2]*t];
    };
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const c={ix:[x,y,z],nodes:[],origin:rounded(x+.5,y+.5,z+.5),faces:[]};
      for(let q=0;q<8;q++){
        const a=x+(q&1),b=y+((q>>1)&1),e=z+((q>>2)&1);
        c.nodes.push(nodes.length);nodes.push(id(a,b,e));rest.push(...rounded(a,b,e));
      }
      cells.push(c);
      const edgeSet=new Set();
      for(const pattern of tetraPattern){
        const offsets=pattern.map(q=>c.nodes[q]*3);
        const [a,b,e,f]=offsets;
        const x1=rest[b]-rest[a],y1=rest[b+1]-rest[a+1],z1=rest[b+2]-rest[a+2];
        const x2=rest[e]-rest[a],y2=rest[e+1]-rest[a+1],z2=rest[e+2]-rest[a+2];
        const x3=rest[f]-rest[a],y3=rest[f+1]-rest[a+1],z3=rest[f+2]-rest[a+2];
        const volume=x1*(y2*z3-z2*y3)+y1*(z2*x3-x2*z3)+z1*(x2*y3-y2*x3);
        vols.push([a,b,e,f,volume]);
        for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
          const k=Math.min(pattern[i],pattern[j])*8+Math.max(pattern[i],pattern[j]);
          if(edgeSet.has(k))continue;
          edgeSet.add(k);
          const u=offsets[i],v=offsets[j];
          links.push([u,v,Math.hypot(rest[u]-rest[v],rest[u+1]-rest[v+1],rest[u+2]-rest[v+2]),(pattern[i]^pattern[j])===7?.9:1,rest[u]-rest[v],rest[u+1]-rest[v+1],rest[u+2]-rest[v+2]]);
        }
      }
    }
    const rng=randomSource(566+kind);
    for(const c of cells)for(let f=0;f<6;f++){
      const axis=f>>1, q=c.ix.slice();q[axis]+=f%2?1:-1;
      const n=q.every((a,i)=>a>=0&&a<resolution[i])?cells[index(...q)]:null;
      const face={ids:voxelFaces[f].map(k=>c.nodes[k]),bond:null};
      faces.push(face);c.faces.push(face);
      if(n&&f%2){
        const other=voxelFaces[f^1].map(k=>n.nodes[k]);
        const pairs=face.ids.map(a=>[a,other.find(b=>nodes[b]===nodes[a])]);
        const bond={face,other:n,f:f^1,pairs,axis,c,broken:false,damage:0,strain:0,weakness:mix(.82,1.18,rng()),mid:c.origin.map((a,i)=>(a+n.origin[i])*.5)};
        face.bond=bond;bonds.push(bond);
      }
    }
    for(const b of bonds)b.other.faces[b.f].bond=b;
    Object.assign(this,{cells,nodes,links,vols,faces,bonds,rest:new Float64Array(rest),p:new Float64Array(rest),prev:new Float64Array(rest),vel:new Float64Array(rest.length),groups:[],root:new Int32Array(nodes.length),events:[],fractured:false, volume:w*h*d});
    const mat=new T.MeshPhysicalMaterial({color:jellyColors[kind],metalness:0,roughness:.16,clearcoat:.85,clearcoatRoughness:.13,transmission:.61,thickness:1.18,attenuationColor:new T.Color(jellyColors[kind]),attenuationDistance:1.93,ior:1.39,side:T.DoubleSide});
    const torn=mat.clone();torn.roughness=.35;torn.transmission=.36;torn.color.multiplyScalar(.87);
    torn.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 tornPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntornPoint=position;');
      shader.fragmentShader='varying vec3 tornPoint;\n'+shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float seam=sin(tornPoint.y*53.+sin(tornPoint.z*28.)*2.6)*sin(tornPoint.z*44.+tornPoint.x*53.);
        normal=normalize(normal+vec3(dFdx(seam),dFdy(seam),0.)*.055);
        diffuseColor.rgb*=.94+seam*.09;
      `);
    };
    this.geometry=new T.BufferGeometry();
    this.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(faces.length*72),3).setUsage(T.DynamicDrawUsage));
    this.geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(faces.length*72),3).setUsage(T.DynamicDrawUsage));
    this.mesh=mesh(scene,this.geometry,[mat,torn]);this.mesh.frustumCulled=false;
    this.shadow=contactShadow(scene);
    this.contactTriangle=new T.Triangle();
    this.faceHit=v3();this.faceNormal=v3();this.faceWeights=v3();this.facePush=v3();
    this.normal=new Float32Array(rest.length);
    this.edgeLambda=new Float64Array(links.length);
    this.inclusions=[];
    const inclusionMat=new T.MeshPhysicalMaterial({color:0xd3fff2,roughness:.1,metalness:.21,clearcoat:1,envMapIntensity:.55});
    for(let i=0;i<18;i++){
      const x=.4+rng()*(nx-.8),y=.34+rng()*(ny-.66),z=.35+rng()*(nz-.7);
      const cell=cells[index(Math.floor(x),Math.floor(y),Math.floor(z))];
      const materialPoint=mesh(scene,sphereGeo,inclusionMat,0,0,0,false);
      materialPoint.scale.setScalar(.014+rng()*.019);
      this.inclusions.push({mesh:materialPoint,ids:cell.nodes,s:[x%1,y%1,z%1]});
    }
    this.topology();
    this.render();
  }
  topology(){
    // Rebuild the per-vertex welds over intact bonds. Torn faces expose their own vertices.
    const root=this.root;
    for(let i=0;i<root.length;i++)root[i]=i;
    function find(i){while(root[i]!==i){root[i]=root[root[i]];i=root[i];}return i;}
    for(const b of this.bonds)if(!b.broken)for(const [a,c] of b.pairs)root[find(c)]=find(a);
    const byRoot=new Map();
    for(let i=0;i<root.length;i++){
      const r=find(i);root[i]=r;
      if(!byRoot.has(r))byRoot.set(r,[]);
      byRoot.get(r).push(i*3);
    }
    this.groups=[...byRoot.values()].filter(g=>g.length>1);
    this.skin=this.faces.filter(f=>!f.bond);
    this.seams=this.faces.filter(f=>f.bond?.broken);
    this.contactTriangles=[...this.skin,...this.seams].flatMap(f=>surfaceTriangles.map(t=>t.map(i=>f.ids[i]*3)));
    this.seamRoots=new Set(this.seams.flatMap(f=>f.ids.map(i=>root[i])));
    const boundary=new Map();
    for(const f of [...this.skin,...this.seams])for(const i of f.ids)boundary.set(root[i],i);
    this.boundary=[...boundary.values()].map(i=>i*3);
    this.fragments=[];
    if(this.seams.length){
      const fragments=new Int32Array(this.cells.length).map((_,i)=>i);
      const findCell=i=>{while(i!==fragments[i])i=fragments[i];return i;};
      for(const b of this.bonds)if(!b.broken)fragments[findCell(b.c.nodes[0]/8)]=findCell(b.other.nodes[0]/8);
      const sides=new Map();
      for(const i of this.boundary){
        const key=findCell(Math.floor(i/24));
        if(!sides.has(key))sides.set(key,[]);
        sides.get(key).push(i);
      }
      this.fragments=[...sides.values()];
    }
  }
  measureStrain(){
    const p=this.p;
    for(const b of this.bonds){
      if(b.broken)continue;
      let stress=0;
      for(const [i,j] of b.pairs){
        const a=i*3,c=j*3,n=b.axis;
        const opening=Math.max(0,p[c+n]-p[a+n]);
        const s=(n+1)%3,t=(n+2)%3;
        stress+=opening+Math.hypot(p[c+s]-p[a+s],p[c+t]-p[a+t])*.34;
      }
      b.strain=Math.max(b.strain*.97,stress*.69);
    }
  }
  impulse(ball,energy,toughness,softness,repeat){
    const p=ball.p;
    const dx=p.x-this.center[0]-this.slide[0],dz=p.z-this.center[1]-this.slide[1];
    const bias=clamp(dx/this.dims[0]*2,-1,1);
    const offAxis=clamp(Math.hypot(bias,dz/this.dims[2]*2),0,1);
    const rocking=smooth(.42,.84,offAxis)*smooth(105,350,energy);
    // Once the specimen separates, reactions propagate through each fragment's own constraints.
    const restitution=this.fragments.length>1?0:repeat?.39:1;
    this.squeezeV+=restitution*Math.min(7.7,Math.sqrt(energy)*(.15+softness*.72)*(1-.28*Math.abs(bias))/(this.kind===0?1:.84));
    this.tiltV+=restitution*clamp(bias*.7+ball.v.x*.065,-.7,.7)*Math.min(5.0,Math.sqrt(energy)*.46);
    const mobility=clamp(ball.mass/(this.volume*.78),.05,.74);
    const slip=v=>Math.sign(v)*Math.max(0,Math.abs(v)-.80);
    this.slideV[0]+=restitution*clamp(mobility*(slip(ball.v.x)*1.47+bias*.53),-2.9,2.9);
    this.slideV[1]+=restitution*clamp(mobility*slip(ball.v.z)*1.14,-1.6,1.6);
    if(restitution&&energy>105&&offAxis>.46){
      const leverY=Math.max(.10,p.y-ball.r*.63-this.dims[1]*.49);
      const torque=v3(dx,leverY,dz).cross(ball.v);
      const [w,h,d]=this.dims;
      const kick=mobility*restitution*(.53+rocking*.84);
      torque.x*=kick*12/(h*h+d*d);
      torque.y*=kick*12/(w*w+d*d);
      torque.z*=kick*12/(w*w+h*h);
      this.spinKick.add(torque.clampLength(0,2.8+rocking*6.4));
    }
    const power=energy*(1-.64*rocking)*(.69+softness*.57)/(30+toughness*105+toughness**4*58);
    if(power<.68)return;
    const planarSpeed=Math.hypot(ball.v.x,ball.v.z);
    const nx=planarSpeed>.98?ball.v.x/planarSpeed:1,nz=planarSpeed>.98?ball.v.z/planarSpeed:0;
    const cx=this.center[0],cz=this.center[1];
    const x=cx+clamp((p.x-cx-this.slide[0])/this.frameX,-this.dims[0]*.44,this.dims[0]*.44);
    const z=cz+clamp((p.z-cz-this.slide[1])/this.frameX,-this.dims[2]*.44,this.dims[2]*.44);
    const y=clamp((p.y-ball.r*.77)/this.frameY,.25,this.dims[1]+.10);
    this.events.push({x,y,z,nx,nz,power,age:0});
  }
  damage(dt){
    let changed=false;
    for(const e of this.events){
      e.age+=dt;
      if(e.age>.58)continue;
      for(const b of this.bonds){
        if(b.broken)continue;
        const [x,y,z]=b.mid;
        const dist=Math.hypot(x-e.x,y-e.y,z-e.z);
        if(dist>e.age*8+.36)continue;
        const warp=.078*Math.sin(y*4.3+z*2.4)+.047*Math.sin(z*6.4-x);
        const signed=(x-e.x)*e.nx+(z-e.z)*e.nz-warp;
        const {origin:a}=b.c,{origin:d}=b.other;
        const span=.5*((d[0]-a[0])*e.nx+(d[2]-a[2])*e.nz);
        const across=Math.abs(signed)<=Math.abs(span)+.025;
        const tangent=b.axis===0?Math.abs(e.nx):b.axis===2?Math.abs(e.nz):0;
        const focusing=Math.exp(-Math.pow(signed/.33,2))*(across?.82+.18*tangent:.11+.17*tangent);
        const materialStress=Math.min(.44,b.strain*2.55);
        const load=(e.power*focusing*Math.exp(-dist*.21)+materialStress*(.32+.68*focusing))*b.weakness;
        if(load<.66)continue;
        b.damage+=dt*8.8*Math.max(0,load-.58)*(1-smooth(.34,.58,e.age));
        if(b.damage<1)continue;
        b.broken=true;changed=true;
        for(const [a,d] of b.pairs){
          const direction=Math.sign(span)||1;
          const speed=(.67+Math.min(2.6,e.power*.59))*direction;
          this.vel[a*3]-=e.nx*speed;this.vel[d*3]+=e.nx*speed;
          this.vel[a*3+2]-=e.nz*speed;this.vel[d*3+2]+=e.nz*speed;
        }
      }
    }
    this.events=this.events.filter(e=>e.age<=.58);
    if(changed){
      if(!this.fractured)soundEvent('crack',1.5);
      this.fractured=true;this.topology();
    }
  }
  predict(dt,soft){
    this.edgeLambda.fill(0);
    // A volume-preserving strain mode couples a localized impact to the bulk gel.
    const w=mix(19,9.2,soft);
    this.squeezeV+=(-w*w*this.squeeze-4.3*this.squeezeV)*dt;
    const next=clamp(this.squeeze+this.squeezeV*dt,-.14,.53);
    if(next>=.53&&this.squeezeV>0)this.squeezeV*=.23;
    const nextY=1-next,nextX=1/Math.sqrt(nextY),nextTilt=this.tilt+this.tiltV*dt;
    this.tiltV+=(-96*this.tilt-6*this.tiltV)*dt;
    const changeY=nextY/this.frameY,changeXZ=nextX/this.frameX, shear=nextTilt-this.tilt;
    const cx=this.center[0]+this.slide[0],cz=this.center[1]+this.slide[1];
    const maxSlide=this.kind===0?1.32:.38;
    const lateralX=clamp(this.slide[0]+this.slideV[0]*dt,-maxSlide,maxSlide)-this.slide[0];
    const lateralZ=clamp(this.slide[1]+this.slideV[1]*dt,-.68,.68)-this.slide[1];
    this.slide[0]+=lateralX;this.slide[1]+=lateralZ;
    this.slideV=this.slideV.map(v=>Math.sign(v)*Math.max(0,Math.abs(v)*Math.exp(-2.85*dt)-.55*dt));
    for(let a=0;a<this.p.length;a+=3){
      const y=this.p[a+1]-.015;
      this.p[a]=cx+(this.p[a]-cx)*changeXZ+y*shear+lateralX;
      this.p[a+1]=.015+y*changeY;
      this.p[a+2]=cz+(this.p[a+2]-cz)*changeXZ+lateralZ;
    }
    this.squeeze=next;this.frameY=nextY;this.frameX=nextX;this.tilt=nextTilt;
    const {p,prev,vel}=this; prev.set(p);
    if(this.spinKick.lengthSq()>0){
      const pivotY=this.dims[1]*.49*nextY,{x:wx,y:wy,z:wz}=this.spinKick;
      for(let a=0;a<p.length;a+=3){
        const x=p[a]-cx,y=p[a+1]-pivotY,z=p[a+2]-cz;
        vel[a]+=wy*z-wz*y;vel[a+1]+=wz*x-wx*z;vel[a+2]+=wx*y-wy*x;
      }
      this.spinKick.set(0,0,0);
    }
    for(let a=0;a<p.length;a+=3){
      vel[a+1]-=15*dt;p[a]+=vel[a]*dt;p[a+1]+=vel[a+1]*dt;p[a+2]+=vel[a+2]*dt;
    }
  }
  solveShape(stiff,dt){
    const p=this.p, alpha=stiff/(dt*dt)*.44;
    for(let i=0;i<this.links.length;i++){
      const [a,b,c,d,dx,dy,dz]=this.links[i];
      const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2],l=Math.sqrt(x*x+y*y+z*z);
      const rx=dx*this.frameX+dy*this.tilt, ry=dy*this.frameY,rz=dz*this.frameX;
      const desired=Math.abs(this.squeeze)<.00001&&Math.abs(this.tilt)<.00001?c:Math.sqrt(rx*rx+ry*ry+rz*rz);
      const compliance=alpha/d;
      const dl=(l-desired-compliance*this.edgeLambda[i])/(2+compliance);
      this.edgeLambda[i]+=dl;
      const s=dl/Math.max(1e-8,l);
      const u=x*s,v=y*s,w=z*s;
      p[a]-=u;p[a+1]-=v;p[a+2]-=w;p[b]+=u;p[b+1]+=v;p[b+2]+=w;
    }
    for(const [a,b,c,d,vol] of this.vols){
      const x=p[b]-p[a],y=p[b+1]-p[a+1],z=p[b+2]-p[a+2];
      const u=p[c]-p[a],v=p[c+1]-p[a+1],w=p[c+2]-p[a+2];
      const s=p[d]-p[a],t=p[d+1]-p[a+1],r=p[d+2]-p[a+2];
      const bx=v*r-w*t,by=w*s-u*r,bz=u*t-v*s;
      const cx=t*z-r*y,cy=r*x-s*z,cz=s*y-t*x;
      const dx=y*w-z*v,dy=z*u-x*w,dz=x*v-y*u;
      const ax=-bx-cx-dx,ay=-by-cy-dy,az=-bz-cz-dz;
      const mag=ax*ax+ay*ay+az*az+bx*bx+by*by+bz*bz+cx*cx+cy*cy+cz*cz+dx*dx+dy*dy+dz*dz;
      const q=.94*(x*bx+y*by+z*bz-vol)/(mag+.000005);
      p[a]-=q*ax;p[a+1]-=q*ay;p[a+2]-=q*az;p[b]-=q*bx;p[b+1]-=q*by;p[b+2]-=q*bz;
      p[c]-=q*cx;p[c+1]-=q*cy;p[c+2]-=q*cz;p[d]-=q*dx;p[d+1]-=q*dy;p[d+2]-=q*dz;
    }
  }
  weld(){
    const p=this.p;
    for(const g of this.groups){
      let x=0,y=0,z=0;
      for(const a of g){x+=p[a];y+=p[a+1];z+=p[a+2];}
      x/=g.length;y/=g.length;z/=g.length;
      for(const a of g){p[a]=x;p[a+1]=y;p[a+2]=z;}
    }
  }
  applyContactDelta(maximum=Infinity){
    const {p,contactDelta,root}=this;
    if(Number.isFinite(maximum))for(const a of this.boundary){
      const k=root[a/3]*3;
      const length=Math.hypot(contactDelta[k],contactDelta[k+1],contactDelta[k+2]);
      if(length>maximum)for(let axis=0;axis<3;axis++)contactDelta[k+axis]*=maximum/length;
    }
    for(let i=0;i<root.length;i++){
      const a=i*3,k=root[i]*3;
      p[a]+=contactDelta[k];p[a+1]+=contactDelta[k+1];p[a+2]+=contactDelta[k+2];
    }
    contactDelta.fill(0);
  }
  fillFaceContact(center,radius,share){
    const {p,contactTriangles,contactTriangle:tri,faceHit:hit,faceNormal:normal,faceWeights:weights,facePush:push}=this;
    let best=radius*radius;
    const rr=best;
    let nodes=null;
    for(const ids of contactTriangles){
      const [a,b,c]=ids;
      if(center.x<Math.min(p[a],p[b],p[c])-radius||center.x>Math.max(p[a],p[b],p[c])+radius||
         center.y<Math.min(p[a+1],p[b+1],p[c+1])-radius||center.y>Math.max(p[a+1],p[b+1],p[c+1])+radius||
         center.z<Math.min(p[a+2],p[b+2],p[c+2])-radius||center.z>Math.max(p[a+2],p[b+2],p[c+2])+radius)continue;
      tri.a.fromArray(p,a);tri.b.fromArray(p,b);tri.c.fromArray(p,c);
      if(tri.a.distanceToSquared(center)<rr||tri.b.distanceToSquared(center)<rr||tri.c.distanceToSquared(center)<rr)continue;
      tri.closestPointToPoint(center,hit);
      const distance=hit.distanceToSquared(center);
      if(distance>=best||distance<1e-9)continue;
      tri.getNormal(normal);
      if(normal.dot(center)-normal.dot(hit)<=0)continue;
      tri.getBarycoord(hit,weights);
      const length=Math.sqrt(distance);
      push.subVectors(hit,center).multiplyScalar((radius-length)/length);
      this.bestFaceWeights=[weights.x,weights.y,weights.z];
      best=distance;nodes=ids;
    }
    if(!nodes)return false;
    const bary=this.bestFaceWeights;
    const norm=bary[0]**2+bary[1]**2+bary[2]**2;
    for(let i=0;i<3;i++){
      const k=this.root[nodes[i]/3]*3,w=bary[i]*share*.66/Math.max(.33,norm);
      this.contactDelta[k]+=push.x*w;this.contactDelta[k+1]+=push.y*w;this.contactDelta[k+2]+=push.z*w;
    }
    return true;
  }
  collide(balls,pass){
    const p=this.p;
    for(const a of this.boundary){
      p[a+1]=Math.max(.014,p[a+1]);
      p[a]=clamp(p[a],-5.95,5.95);p[a+2]=clamp(p[a+2],-2.85,2.85);
    }
    for(const b of balls){
      const q=b.p,r=b.r+.035;
      if(q.y>4.05||Math.abs(q.x-this.center[0]-this.slide[0])>this.dims[0]+2)continue;
      const indentation=smooth(.9,4.4,-b.v.y)*this.softness;
      const nodeShare=clamp(b.mass/(b.mass+.63)+indentation*.085,.35,.98);
      let rx=0,ry=0,rz=0,hits=0;
      for(const a of this.boundary){
        const x=p[a]-q.x,y=p[a+1]-q.y,z=p[a+2]-q.z,l2=x*x+y*y+z*z;
        if(l2>=r*r||l2<1e-10)continue;
        const l=Math.sqrt(l2),push=(r-l)/l;
        const root=this.root[a/3];
        const dx=x*push,dy=y*push,dz=z*push;
        this.contactDelta[root*3]=dx*nodeShare;
        this.contactDelta[root*3+1]=dy*nodeShare;
        this.contactDelta[root*3+2]=dz*nodeShare;
        rx-=dx;ry-=dy;rz-=dz;hits++;
      }
      // Resolve contacts between vertices against the actual triangular skin.
      if(pass%3===0&&this.fillFaceContact(q,r,nodeShare)){
        const f=this.facePush;
        rx-=f.x*.64;ry-=f.y*.64;rz-=f.z*.64;hits++;
      }
      if(!hits)continue;
      const scale=(1-clamp(b.mass/(b.mass+.91),.40,.97))*(1-indentation*.38)*(hits>4?4/hits:1);
      q.x+=rx*scale;q.y+=ry*scale;q.z+=rz*scale;
      this.applyContactDelta();
      if(!b.touch&&pass===0){
        const closing=-(b.v.x*rx+b.v.y*ry+b.v.z*rz)/Math.max(1e-8,Math.hypot(rx,ry,rz));
        if(closing>2.15){
          const repeat=b.impactSites.has(this);
          const energy=.5*b.mass*(closing**2*.76+b.v.lengthSq()*.24)*(repeat?.73:1);
          this.impulse(b,energy,this.toughness,this.softness,repeat);
          soundEvent('hit',Math.min(1.9,energy/52));
          b.impactSites.add(this);
          b.touch=.38;b.hits++;
        }
      }
    }
  }
  collideGel(other){
    const a=this.p,b=other.p;
    const radius=.19,rr=radius*radius;
    let min=Infinity,max=-Infinity,contact=false;
    for(const j of other.boundary){min=Math.min(min,b[j]);max=Math.max(max,b[j]);}
    const share=other.volume/(this.volume+other.volume);
    for(const i of this.boundary){
      const ax=a[i],ay=a[i+1],az=a[i+2];
      if(ax<min-radius||ax>max+radius)continue;
      for(const j of other.boundary){
        const x=ax-b[j],y=ay-b[j+1],z=az-b[j+2],l=x*x+y*y+z*z;
        if(l>=rr||l<1e-10)continue;
        const s=(radius/Math.sqrt(l)-1)*.68;
        const p=this.root[i/3]*3,q=other.root[j/3]*3;
        this.contactDelta[p]+=x*s*share;this.contactDelta[p+1]+=y*s*share;this.contactDelta[p+2]+=z*s*share;
        other.contactDelta[q]-=x*s*(1-share);other.contactDelta[q+1]-=y*s*(1-share);other.contactDelta[q+2]-=z*s*(1-share);
        contact=true;
      }
    }
    if(contact){this.applyContactDelta(.09);other.applyContactDelta(.09);}
  }
  collideFragments(){
    const p=this.p;let contact=false;
    for(let f=0;f<this.fragments.length;f++)for(let g=0;g<f;g++){
      for(const a of this.fragments[f])for(const b of this.fragments[g]){
        const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2],d=x*x+y*y+z*z;
        if(d>.013||d<1e-10)continue;
        const w=(.114/Math.sqrt(d)-1)*.28;
        const u=this.root[a/3]*3,v=this.root[b/3]*3;
        this.contactDelta[u]+=x*w;this.contactDelta[u+1]+=y*w;this.contactDelta[u+2]+=z*w;
        this.contactDelta[v]-=x*w;this.contactDelta[v+1]-=y*w;this.contactDelta[v+2]-=z*w;
        contact=true;
      }
    }
    if(contact)this.applyContactDelta(.065);
  }
  finish(dt){
    const {p,vel,prev}=this;const drag=Math.exp(-1.75*dt);
    for(let a=0;a<p.length;a+=3){
      const f=p[a+1]<.026?.76:1;
      vel[a]=(p[a]-prev[a])*drag*f/dt;vel[a+1]=(p[a+1]-prev[a+1])*drag/dt;vel[a+2]=(p[a+2]-prev[a+2])*drag*f/dt;
    }
  }
  volumeRatio(){
    let volume=0,initial=0;
    const p=this.p;
    for(const [a,b,c,d,rest] of this.vols){
      const x=p[b]-p[a],y=p[b+1]-p[a+1],z=p[b+2]-p[a+2];
      const u=p[c]-p[a],v=p[c+1]-p[a+1],w=p[c+2]-p[a+2];
      const s=p[d]-p[a],t=p[d+1]-p[a+1],r=p[d+2]-p[a+2];
      volume+=x*(v*r-w*t)+y*(w*s-u*r)+z*(u*t-v*s);
      initial+=rest;
    }
    return volume/initial;
  }
  render(){
    const {p,root,normal,geometry}=this;
    const pos=geometry.attributes.position.array,nrm=geometry.attributes.normal.array;
    for(const b of this.inclusions){
      const [x,y,z]=b.s;let a=0,c=0,d=0;
      for(let j=0;j<8;j++){
        const w=(j&1?x:1-x)*(j&2?y:1-y)*(j&4?z:1-z),i=b.ids[j]*3;
        a+=p[i]*w;c+=p[i+1]*w;d+=p[i+2]*w;
      }
      b.mesh.position.set(a,c,d);
    }
    let out=0;
    geometry.clearGroups();
    for(const [selection,mat] of [[this.skin,0],[this.seams,1]]){
      normal.fill(0);
      const groupsStart=out;
      for(const {ids} of selection){
        const a=ids[0]*3,b=ids[1]*3,d=ids[3]*3;
        const x=p[b]-p[a],y=p[b+1]-p[a+1],z=p[b+2]-p[a+2],u=p[d]-p[a],v=p[d+1]-p[a+1],w=p[d+2]-p[a+2];
        for(const i of ids){
          const k=root[i]*3;
          normal[k]+=y*w-z*v;normal[k+1]+=z*u-x*w;normal[k+2]+=x*v-y*u;
        }
      }
      const point=new Float64Array(18), direction=new Float64Array(18), vertexRoots=new Int32Array(3);
      for(const {ids} of selection)for(const triangle of surfaceTriangles){
        for(let j=0;j<3;j++){
          const i=ids[triangle[j]],a=i*3,k=root[i]*3,b=j*3;
          vertexRoots[j]=root[i];
          const l=Math.hypot(normal[k],normal[k+1],normal[k+2])||1;
          for(let axis=0;axis<3;axis++){
            point[b+axis]=p[a+axis];
            direction[b+axis]=normal[k+axis]/l;
          }
        }
        for(let j=0;j<3;j++){
          const k=(j+1)%3,a=j*3,b=k*3,m=(j+3)*3;
          // Interpolate the exterior tangents while keeping the edges of torn faces coincident.
          const round=mat===0&&!(this.seamRoots.has(vertexRoots[j])&&this.seamRoots.has(vertexRoots[k]));
          let first=0,second=0;
          if(round)for(let axis=0;axis<3;axis++){
            const edge=point[b+axis]-point[a+axis];
            first+=edge*direction[a+axis];second-=edge*direction[b+axis];
          }
          const l=Math.hypot(direction[a]+direction[b],direction[a+1]+direction[b+1],direction[a+2]+direction[b+2])||1;
          for(let axis=0;axis<3;axis++){
            point[m+axis]=(point[a+axis]+point[b+axis])*.5-.105*(first*direction[a+axis]+second*direction[b+axis]);
            direction[m+axis]=(direction[a+axis]+direction[b+axis])/l;
          }
          point[m+1]=Math.max(.009,point[m+1]);
        }
        for(const j of subdividedTri){
          const a=j*3;
          for(let axis=0;axis<3;axis++){
            pos[out]=point[a+axis];nrm[out]=direction[a+axis];out++;
          }
        }
      }
      if(out>groupsStart)geometry.addGroup(groupsStart/3,(out-groupsStart)/3,mat);
    }
    geometry.setDrawRange(0,out/3);
    geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const a of this.boundary){minX=Math.min(minX,p[a]);maxX=Math.max(maxX,p[a]);minZ=Math.min(minZ,p[a+2]);maxZ=Math.max(maxZ,p[a+2]);}
    this.shadow.position.set((minX+maxX)/2,.012,(minZ+maxZ)/2);
    this.shadow.scale.set((maxX-minX)*.79,(maxZ-minZ)*.79,1);
  }
}
class JellyTest {
  constructor(){
    this.scene=labScene();plinth(this.scene,12.45,6.15,'IMPACT DECK','SOFT MATERIALS / ML-01');
    const deck=this.scene;
    for(const [x,col,name] of [[-3.59,0xdeb180,'B / FIRM'],[0,0x74e7c0,'A / GEL'],[3.47,0xb3a0ed,'C / SOFT']]){
      const a=[];for(const dx of [-1.43,1.43])for(const dz of [-1.41,1.41])a.push(x+dx,.013,dz,x+dx*.83,.013,dz,x+dx,.013,dz,x+dx,.013,dz*.80);
      line(deck,a,col,.65);
      typographicPlate(deck,1.77,.42,name,'SPECIMEN',x-.06,.013,1.92,'top','#c1d6d1');
    }
    for(const x of [-5.97,5.97]){
      box(deck,.16,.1,4.95,blackMetal,x,.055,0);
      box(deck,.035,.027,4.76,orange,x,.117,0);
    }
    this.gels=[
      new SoftGel(deck,[0,0],[2.86,2.10,2.57],[6,5,6],0),
      new SoftGel(deck,[-3.56,-.32],[2.35,1.52,2.30],[4,4,4],1),
      new SoftGel(deck,[3.46,-.48],[2.24,2.39,2.21],[4,5,4],2)
    ];
    for(const g of this.gels)g.contactDelta=new Float64Array(g.p.length);
    this.balls=[];this.queue=[];this.t=0;this.active=false;this.target=0;this.mode='center';
    this.params={soft:.65,tough:.66,mass:3.2,height:2.35,offset:-.83};
    this.materials=[[.65,.66],[.19,.94],[.81,.71]];
    this.preview=mesh(this.scene,sphereGeo,shotMat,0,4.9,.05);
    this.preview.scale.setScalar(.71);this.preview.rotation.set(.28,-.35,-.18);
    
    const aim=[];for(let i=0;i<8;i++)aim.push(0,2.21+i*.117,.04,0,2.26+i*.117,.04);
    this.aim=line(this.scene,aim,0xb3f4e6,.57);
  }
  launch(mode,show=false){
    this.preview.visible=false;this.aim.visible=false;this.active=true;
    this.mode=mode;
    const {mass,height}=this.params;
    const target=this.dropTarget();
    const place=(delay,m,h,x,z,vx=0,vz=0)=>this.queue.push({
      at:this.t+delay,m,h,x:x+target.x,z:z+target.z,y:target.y,vx,vz
    });
    if(mode==='multi'){
      const fallTime=h=>(Math.sqrt(1.25**2+30*h)-1.25)/15;
      const timeOffset=h=>fallTime(height*.64)-fallTime(h);
      const schedule=show?[[0,1.72,.60,-.45,.42,-.45,.56],[.91,3.45,1.05,.51,-.42,.8,-.72],[2.14,10.8,1.85,.02,.02,0,0]]:
        [[0,mass*.65,height*.64,-.38,.37,-.33,.43],[.81+timeOffset(height*.83),mass,height*.83,.43,-.37,.52,-.52],[1.63+timeOffset(height*1.04),mass*1.67,height*1.04,.02,.03]];
      for(const shot of schedule)place(...shot);
    }else{
      if(show&&mode==='offset')place(0,mass,height,-.03,.28,-3.5,.58);
      else place(0,mass,height,...this.shotVector(mode));
    }
    this.queue.sort((a,b)=>a.at-b.at);
    this.release();
  }
  shotVector(mode){
    if(mode!=='offset')return [0,.035,0,0];
    const offset=this.params.offset??-.83;
    const duration=(Math.sqrt(1.25**2+30*this.params.height)-1.25)/15;
    const distance=Math.abs(offset);
    const vx=(.95+distance*2.2)*(Math.sign(offset)||1);
    const vz=.23+distance*.62,z=.13*distance;
    return [offset-vx*duration,z-vz*duration,vx,vz];
  }
  dropTarget(){
    const g=this.gels[this.target];
    return {x:g.center[0]+g.slide[0],y:g.dims[1],z:g.center[1]+g.slide[1]};
  }
  release(){
    while(this.queue.length&&this.queue[0].at<=this.t+1e-8){
      const q=this.queue.shift(),r=clamp(.56+q.m*.041,.61,.94);
      const model=mesh(this.scene,sphereGeo,shotMat);model.scale.setScalar(r);model.rotation.set(.27,.42,-.13);
      const b={r,mass:q.m,p:v3(q.x,q.y+r+q.h,q.z),v:v3(q.vx,-1.25,q.vz),prev:v3(),model,shadow:contactShadow(this.scene),touch:0,hits:0,impactSites:new Set()};
      this.balls.push(b);
      if(this.balls.length>19){
        const old=this.balls.shift();this.scene.remove(old.model,old.shadow);old.shadow.geometry.dispose();old.shadow.material.dispose();
      }
    }
  }
  step(dt){
    if(!this.active)return;
    this.release();this.t+=dt;
    for(const b of this.balls){
      b.prev.copy(b.p);b.touch=Math.max(0,b.touch-dt);b.v.y-=15*dt;b.p.addScaledVector(b.v,dt);
    }
    this.materials[0][0]=this.params.soft;this.materials[0][1]=this.params.tough;
    for(const g of this.gels){
      [g.softness,g.toughness]=this.materials[g.kind];
      g.damage(dt);g.predict(dt,g.softness);
    }
    for(let pass=0;pass<8;pass++){
      for(const g of this.gels){
        const s=g.softness;
        g.solveShape(.000017+.00145*s*s,dt);
        if(pass===1)g.measureStrain();
        g.weld();g.collide(this.balls,pass);
        if(pass===6&&g.fragments.length>1)g.collideFragments();
      }
      if(pass===6){
        this.gels[0].collideGel(this.gels[1]);this.gels[0].collideGel(this.gels[2]);
        this.gels[1].collideGel(this.gels[2]);
      }
      for(let i=0;i<this.balls.length;i++){
        const b=this.balls[i];
        for(let j=0;j<i;j++){
          const a=this.balls[j],d=b.p.clone().sub(a.p),len=d.length(),r=b.r+a.r;
          if(len>=r||len<.0001)continue;
          d.multiplyScalar(1/len);
          const k=a.mass/(a.mass+b.mass),closing=b.v.clone().sub(a.v).dot(d);
          b.p.addScaledVector(d,(r-len)*k);a.p.addScaledVector(d,-(r-len)*(1-k));
          if(pass===0&&closing<-.9){
            soundEvent('metal',-closing*.18);
            b.prev.addScaledVector(d,dt*.47*closing*k);a.prev.addScaledVector(d,-dt*.47*closing*(1-k));
          }
        }
      }
    }
    for(const g of this.gels){g.weld();g.finish(dt);}
    for(const b of this.balls){
      const oldY=b.v.y,oldX=b.v.x,oldZ=b.v.z;puckBounds(b);
      b.v.copy(b.p).sub(b.prev).multiplyScalar(1/dt).clampLength(0,15);
      if(b.p.y<=b.r+.001&&oldY<0){
        if(oldY<-1.1){b.v.y=-oldY*.39;soundEvent('metal',Math.min(1.5,-oldY*.16));}else b.v.y=0;
        b.v.x*=.979;b.v.z*=.979;
      }
      if(b.p.x<=-6+b.r+.01||b.p.x>=6-b.r-.01)b.v.x=-oldX*.42;
      if(Math.abs(b.p.z)>=2.94-b.r-.01)b.v.z=-oldZ*.51;
      if(b.p.y>b.r+.015)b.v.y=Math.min(b.v.y,mix(6.15,4.55,clamp((b.mass-3)/7,0,1)));
      if(oldY<-.3&&b.v.y>1.2&&b.touch>0&&b.p.y>b.r+.12)soundEvent('bounce',b.v.y*.19);
      b.v.multiplyScalar(.998);
      b.model.rotateOnWorldAxis(v3(0,0,1),-b.v.x*dt/b.r);
      b.model.rotateOnWorldAxis(v3(1,0,0),b.v.z*dt/b.r);
    }
  }
  prepare(){
    if(!this.active){
      const r=clamp(.56+this.params.mass*.041,.61,.94), target=this.dropTarget();
      const [x,z,vx,vz]=this.shotVector(this.mode);
      const initialY=target.y+r+this.params.height;
      this.preview.scale.setScalar(r);this.preview.position.set(target.x+x,initialY,target.z+z);
      const duration=(Math.sqrt(1.25**2+30*this.params.height)-1.25)/15;
      const path=this.aim.geometry.attributes.position;
      for(let i=0;i<path.count;i++){
        const t=duration*(.32+.67*(Math.floor(i/2)+(i%2)*.53)/8);
        path.setXYZ(i,target.x+x+vx*t,initialY-1.25*t-7.5*t*t-r*.87,target.z+z+vz*t);
      }
      path.needsUpdate=true;this.aim.frustumCulled=false;
    }
    for(const g of this.gels)g.render();
    for(const b of this.balls){
      b.model.position.copy(b.p);b.shadow.position.set(b.p.x,.015,b.p.z);b.shadow.material.opacity=.65/(1+(b.p.y-b.r)*1.3);b.shadow.scale.setScalar(b.r*(1+.25*b.p.y));
    }
  }
}
function puckBounds(b){
  b.p.x=clamp(b.p.x,-6+b.r,6-b.r);b.p.z=clamp(b.p.z,-2.94+b.r,2.94-b.r);b.p.y=Math.max(b.r,b.p.y);
}


