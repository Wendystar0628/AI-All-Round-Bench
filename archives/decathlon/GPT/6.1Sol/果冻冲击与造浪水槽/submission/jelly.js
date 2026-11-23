/* Volumetric XPBD: tetrahedral volume + distance constraints.
   Fracture splits the current tetrahedral connectivity from the impact stress field;
   no prebuilt fragment meshes are used. All new faces are extracted from tetrahedra. */
(function(){
const V=THREE.Vector3;
const sub=(a,b)=>new V().subVectors(a,b);
function vol(a,b,c,d){return sub(b,a).dot(sub(c,a).cross(sub(d,a)))/6;}
class SoftBody{
 constructor(world,center,size,color,stiff,tough){
  this.world=world;this.origin=new V(...center);this.size=size;this.stiff=stiff;this.tough=tough;this.nodes=[];this.tets=[];this.edges=[];this.fractured=false;this.damage=0;this.contactAge=-1;this.hitPoint=new V();this.groups=[];
  const nx=8,ny=7,nz=8,id=(x,y,z)=>(y*nz+z)*nx+x;
  for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
   let p=new V((x/(nx-1)-.5)*size[0],y/(ny-1)*size[1],(z/(nz-1)-.5)*size[2]);
   const q=new V(p.x, p.y-size[1]/2,p.z),core=new V(Math.max(-size[0]/2+.22,Math.min(size[0]/2-.22,q.x)),Math.max(-size[1]/2+.22,Math.min(size[1]/2-.22,q.y)),Math.max(-size[2]/2+.22,Math.min(size[2]/2-.22,q.z)));
   const delta=q.clone().sub(core);if(delta.length()>.22)q.copy(core.add(delta.normalize().multiplyScalar(.22)));
   p.set(q.x,q.y+size[1]/2+.075,q.z).add(this.origin);
   this.nodes.push({p:p.clone(),old:p.clone(),rest:p.clone(),v:new V(),w:1,group:0});
  }
  const patterns=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
  for(let y=0;y<ny-1;y++)for(let z=0;z<nz-1;z++)for(let x=0;x<nx-1;x++){
   let c=[id(x,y,z),id(x+1,y,z),id(x,y+1,z),id(x+1,y+1,z),id(x,y,z+1),id(x+1,y,z+1),id(x,y+1,z+1),id(x+1,y+1,z+1)];
   for(let pat of patterns){let ids=pat.map(i=>c[i]),v=vol(...ids.map(i=>this.nodes[i].rest));if(v<0){[ids[1],ids[2]]=[ids[2],ids[1]];v=-v;}this.tets.push({ids,volume:v,group:0});}
  }
  this.material=new THREE.MeshPhysicalMaterial({color,roughness:.17,metalness:.02,transmission:.48,thickness:1.5,ior:1.39,transparent:true,opacity:.96,clearcoat:1,clearcoatRoughness:.15,attenuationColor:new THREE.Color(color),attenuationDistance:2.8,envMapIntensity:1.2});
  this.mesh=new THREE.Mesh(new THREE.BufferGeometry(),this.material);this.mesh.castShadow=true;this.mesh.receiveShadow=true;this.mesh.frustumCulled=false;world.group.add(this.mesh);this.rebuild();
 }
 rebuild(){
  const es=new Map(),faces=new Map(),ps=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]];
  for(let t of this.tets){let a=t.ids;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){let k=[a[i],a[j]].sort((a,b)=>a-b).join('/');if(!es.has(k))es.set(k,{a:a[i],b:a[j],len:this.nodes[a[i]].rest.distanceTo(this.nodes[a[j]].rest)});}for(let f of ps){let face=f.map(i=>a[i]),key=[...face].sort((a,b)=>a-b).join('/');if(faces.has(key))faces.delete(key);else faces.set(key,face);}}
  this.edges=[...es.values()];let inds=[...faces.values()].flat();this.surface=[...new Set(inds)];this.neighbors=new Map();for(let i=0;i<inds.length;i+=3)for(let a=0;a<3;a++){let ix=inds[i+a];if(!this.neighbors.has(ix))this.neighbors.set(ix,new Set());this.neighbors.get(ix).add(inds[i+(a+1)%3]);this.neighbors.get(ix).add(inds[i+(a+2)%3]);}this.mesh.geometry.dispose();this.mesh.geometry=new THREE.BufferGeometry();this.mesh.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.nodes.length*3),3));this.mesh.geometry.setIndex(inds);this.sync();
 }
 fracture(){
  if(this.fractured)return;this.fractured=true;
  const hp=this.hitPoint.clone(),angle=this.principalAngle??.65,n1=new V(Math.cos(angle),0,Math.sin(angle)),n2=new V(-Math.sin(angle),.2,Math.cos(angle)),splitFour=this.damage>2;
  // Principal tensile directions emanate from the contact; bond failure is energy gated.
  const maps=new Map(),old=this.nodes,newNodes=[];
  for(let t of this.tets){let mid=new V();for(let i of t.ids)mid.add(old[i].rest);mid.multiplyScalar(.25).sub(hp);let a=mid.dot(n1)>0?1:0,b=splitFour&&mid.dot(n2)>0?1:0;let g=a+2*b;t.group=g;
   t.ids=t.ids.map(i=>{let key=i+':'+g;if(maps.has(key))return maps.get(key);let n=old[i],p=n.p.clone();const dir=new V((a?1:-1)*n1.x+(splitFour?(b?1:-1)*n2.x:0),.2,(a?1:-1)*n1.z+(splitFour?(b?1:-1)*n2.z:0));let v=n.v.clone().addScaledVector(dir,.65+this.damage*.3);let nn={p,rest:n.rest.clone(),old:n.old.clone(),v,w:1,group:g};let ix=newNodes.length;newNodes.push(nn);maps.set(key,ix);return ix;});
  }
  this.nodes=newNodes;this.rebuild();this.world.event('材料达到断裂阈值 · 新裂面形成','crack');
 }
 step(dt,balls){
  const ns=this.nodes,alpha=(.00001+Math.pow(1-this.stiff,3)*.005)/(dt*dt),va=.0000000005/(dt*dt);
  for(let n of ns){n.old.copy(n.p);n.v.y-=9.81*dt;n.p.addScaledVector(n.v,dt);}
  let peak=0,sxx=0,sxz=0,szz=0;
  for(let e of this.edges)e.lambda=0;for(let t of this.tets)t.lambda=0;
  for(let iter=0;iter<4;iter++){
   for(let e of this.edges){let a=ns[e.a],b=ns[e.b],dx=b.p.x-a.p.x,dy=b.p.y-a.p.y,dz=b.p.z-a.p.z,l=Math.sqrt(dx*dx+dy*dy+dz*dz);if(l<1e-7)continue;let strain=(l-e.len)/e.len;peak=Math.max(peak,strain);if(strain>0){let tension=strain*strain/(l*l);sxx+=dx*dx*tension;sxz+=dx*dz*tension;szz+=dz*dz*tension;}let dl=(-(l-e.len)-alpha*e.lambda)/(2+alpha);e.lambda+=dl;let s=-dl/l;a.p.x+=dx*s;a.p.y+=dy*s;a.p.z+=dz*s;b.p.x-=dx*s;b.p.y-=dy*s;b.p.z-=dz*s;}
   for(let t of this.tets){let [a,b,c,d]=t.ids.map(i=>ns[i].p);let g1=sub(c,a).cross(sub(d,a)).multiplyScalar(1/6),g2=sub(d,a).cross(sub(b,a)).multiplyScalar(1/6),g3=sub(b,a).cross(sub(c,a)).multiplyScalar(1/6),g0=g1.clone().add(g2).add(g3).negate(),gr=[g0,g1,g2,g3],cv=sub(b,a).dot(sub(c,a).cross(sub(d,a)))/6-t.volume,den=gr.reduce((s,g)=>s+g.lengthSq(),va);let lam=(-cv-va*t.lambda)/den;t.lambda+=lam;for(let i=0;i<4;i++)ns[t.ids[i]].p.addScaledVector(gr[i],Math.max(-4,Math.min(4,lam)));}
   for(let n of ns){
    if(n.p.y<.075){n.p.y=.075;n.p.x+=(n.old.x-n.p.x)*.008;n.p.z+=(n.old.z-n.p.z)*.008;}
    n.p.x=Math.max(-6.3,Math.min(6.3,n.p.x));n.p.z=Math.max(-3.2,Math.min(3.2,n.p.z));
   }
   for(let ball of balls){if(ball.p.y>this.origin.y+this.size[1]+ball.r+2)continue;for(let i of this.surface){let n=ns[i],d=sub(n.p,ball.p),len=d.length();if(len<ball.r+.035){
      const normal=d.multiplyScalar(1/Math.max(.001,len)),depth=ball.r+.035-len,w=ball.mass/(ball.mass+1.8);n.p.addScaledVector(normal,depth*w*.8);ball.p.addScaledVector(normal,-depth*(1-w)*.09);
      if(!ball.contacts.has(this)){ball.contacts.add(this);this.contactAge=0;this.hitPoint.copy(n.rest);let energy=.5*ball.mass*ball.v.lengthSq();this.lastEnergy=energy;this.damage+=energy/(70+this.tough*300)*(1.12-this.stiff*.22);for(let nn of ns){let rr=Math.hypot(nn.rest.x-n.rest.x,nn.rest.z-n.rest.z);let wgt=Math.exp(-rr*rr/1.2)*Math.pow(Math.max(0,(nn.rest.y-this.origin.y)/this.size[1]),1.3);let impulse=ball.v.y*ball.mass/(ball.mass+3.5)*wgt*5.0;nn.p.y+=impulse*dt;nn.old.y-=impulse*dt*.35;if(ball.v.x)nn.p.x+=ball.v.x*(.3+wgt)*dt*3;}this.world.event(energy>160?'强冲击 · 体积约束传递形变':'接触 · 动能转化为弹性势能','impact');if(this===this.world.bodies[0])this.world.lastEnergy=energy;}
    }}}
  }
  const damping=Math.exp(-dt*(this.fractured?(this.contactAge>3?4.5:2.7):1.45));
  for(let n of ns){n.v.copy(n.p).sub(n.old).multiplyScalar(damping/dt);if(n.v.lengthSq()>900)n.v.clampLength(0,30);}
  this.principalAngle=.5*Math.atan2(2*sxz,sxx-szz);this.peakStrain=peak;
  if(this.contactAge>=0){this.contactAge+=dt;if(this.damage>1.18&&peak>.085&&this.contactAge>.12&&!this.fractured)this.fracture();}
 }
 sync(){const p=this.mesh.geometry.attributes.position;for(let i=0;i<this.nodes.length;i++){let v=this.nodes[i].p;p.setXYZ(i,v.x,v.y,v.z);}if(this.fractured){for(let pass=0;pass<4;pass++){const arr=p.array.slice();for(let [i,nb] of this.neighbors){let x=0,y=0,z=0;for(let j of nb){x+=arr[j*3];y+=arr[j*3+1];z+=arr[j*3+2];}p.setXYZ(i,arr[i*3]*.5+x/nb.size*.5,arr[i*3+1]*.5+y/nb.size*.5,arr[i*3+2]*.5+z/nb.size*.5);}}}p.needsUpdate=true;this.mesh.geometry.computeVertexNormals();this.mesh.geometry.computeBoundingSphere();}
 dispose(){this.mesh.geometry.dispose();this.material.dispose();}
}
class JellyWorld{
 constructor(scene,env,event){this.scene=scene;this.env=env;this.event=event;this.group=new THREE.Group();scene.add(this.group);this.bodies=[];this.balls=[];this.seed=123;this.time=0;this.target=0;this.settings=[{stiff:.42,tough:.72},{stiff:.62,tough:.95},{stiff:.82,tough:1}];this.params={stiffness:.42,toughness:.72,mass:5,height:3.2};this.jobs=[];this.reset();}
 random(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
 reset(){for(let b of this.bodies)b.dispose();for(let b of this.balls){b.mesh.geometry.dispose();b.mesh.material.dispose();}this.group.clear();this.time=0;this.jobs=[];this.balls=[];this.seed=123;this.lastEnergy=0;
  this.bodies=[new SoftBody(this,[-.25,0,.35],[2.65,2.05,2.4],0xdb5995,this.settings[0].stiff,this.settings[0].tough),new SoftBody(this,[-3.35,0,-.1],[1.7,1.35,1.85],0x8c79cf,this.settings[1].stiff,this.settings[1].tough),new SoftBody(this,[3.35,0,.65],[1.7,2.55,1.75],0xdba33f,this.settings[2].stiff,this.settings[2].tough)];
 }
 trigger(kind='center',mass=this.params.mass,height=this.params.height){
  if(kind==='multi'){for(let i=0;i<3;i++)this.jobs.push({t:this.time+i*.76,kind:'center',mass:mass*(.65+i*.42),height:height+.3*i,target:this.target});}
  else this.drop(kind,mass,height);
 }
 drop(kind,mass,height,targetIndex=this.target){let r=.36+Math.cbrt(mass)*.075,body=this.bodies[targetIndex],center=new V(),top=-Infinity;for(let n of body.nodes){center.add(n.p);top=Math.max(top,n.p.y);}center.divideScalar(body.nodes.length);let p=new V(center.x+(kind==='offset'?.65:0),top+height+r,center.z);let mesh=new THREE.Mesh(new THREE.SphereGeometry(r,36,24),new THREE.MeshStandardMaterial({color:0x798388,metalness:.96,roughness:.2,envMapIntensity:1.8}));mesh.castShadow=true;mesh.receiveShadow=true;mesh.position.copy(p);this.group.add(mesh);this.balls.push({p,old:p.clone(),v:new V(kind==='offset'?.8:0,0,kind==='offset'?.25:0),r,mass,mesh,rotation:new V(),contacts:new Set(),bounced:false});}
 step(dt){this.time+=dt;for(let i=this.jobs.length-1;i>=0;i--)if(this.jobs[i].t<=this.time){let j=this.jobs.splice(i,1)[0];this.drop(j.kind,j.mass,j.height,j.target);}
  for(let b of this.balls){b.old.copy(b.p);b.v.y-=9.81*dt;b.p.addScaledVector(b.v,dt);}
  for(let body of this.bodies)body.step(dt,this.balls);
  // Broad phase spatial hashing for soft/soft and newly separated fracture faces.
  // A surface node carries a small collision radius; contacts exchange impulses.
  const bins=new Map(),cell=.19;
  for(let bi=0;bi<this.bodies.length;bi++){let body=this.bodies[bi];for(let ni of body.surface){let n=body.nodes[ni],cx=Math.floor(n.p.x/cell),cy=Math.floor(n.p.y/cell),cz=Math.floor(n.p.z/cell);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){let bucket=bins.get((cx+dx)+','+(cy+dy)+','+(cz+dz));if(!bucket)continue;for(let other of bucket){if(other.bi===bi&&other.n.group===n.group)continue;let o=other.n,d=sub(n.p,o.p),l=d.length();if(l<.14){if(l<.0001){d.set(n.group>o.group?1:-1,0,.3).normalize();}else d.divideScalar(l);let depth=(.14-l)*.36;n.p.addScaledVector(d,depth);o.p.addScaledVector(d,-depth);let rel=sub(n.v,o.v).dot(d);if(rel<0){n.v.addScaledVector(d,-rel*.45);o.v.addScaledVector(d,rel*.45);}}}}let key=cx+','+cy+','+cz;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({n,bi});}}
  for(let b of this.balls){let incoming=b.v.y;b.v.copy(b.p).sub(b.old).divideScalar(dt);if(b.contacts.size&&!b.bounced&&incoming<-2&&b.v.y>incoming*.25){b.v.y=Math.max(b.v.y,Math.abs(incoming)*(.32+this.params.stiffness*.25));b.v.x+=(b.p.x+.25)*1.9;b.bounced=true;this.event('回弹 · 弹性势能重新释放','bounce');}
   if(b.p.y<b.r+.075){b.p.y=b.r+.075;if(b.v.y<-.6)this.event('刚体接触台面','tick');b.v.y=Math.abs(b.v.y)*.38;b.v.x*=.985;b.v.z*=.985;}
   if(Math.abs(b.p.x)>6.1-b.r){b.p.x=Math.sign(b.p.x)*(6.1-b.r);b.v.x*=-.55;}
   if(Math.abs(b.p.z)>3.1-b.r){b.p.z=Math.sign(b.p.z)*(3.1-b.r);b.v.z*=-.55;}
   b.rotation.z-=b.v.x*dt/b.r;b.rotation.x+=b.v.z*dt/b.r;
   if(b.v.lengthSq()>1600)b.v.clampLength(0,40);
  }
  for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++){let a=this.balls[i],b=this.balls[j],d=sub(b.p,a.p),l=d.length(),r=a.r+b.r;if(l<r){d.divideScalar(l||1);a.p.addScaledVector(d,-(r-l)*b.mass/(a.mass+b.mass));b.p.addScaledVector(d,(r-l)*a.mass/(a.mass+b.mass));let v=sub(b.v,a.v).dot(d);if(v<0){let imp=-1.5*v/(1/a.mass+1/b.mass);a.v.addScaledVector(d,-imp/a.mass);b.v.addScaledVector(d,imp/b.mass);this.event('金属球碰撞','tick');}}}
 }
 sync(){for(let b of this.bodies)b.sync();for(let b of this.balls){b.mesh.position.copy(b.p);b.mesh.rotation.set(b.rotation.x,0,b.rotation.z);}}
 select(index){this.target=index;this.params.stiffness=this.settings[index].stiff;this.params.toughness=this.settings[index].tough;}
 setParams(p){Object.assign(this.params,p);this.settings[this.target]={stiff:this.params.stiffness,tough:this.params.toughness};if(this.bodies[this.target]){this.bodies[this.target].stiff=this.params.stiffness;this.bodies[this.target].tough=this.params.toughness;}}
}
window.JellyWorld=JellyWorld;
})();
