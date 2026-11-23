/* A tetrahedral position-based elastic body. The surface is skinned to its volume nodes. */
class ElasticVolume {
  constructor(){
    this.nx=6;this.ny=4;this.nz=6;this.nodes=[];this.edges=[];this.tets=[];
    const id=(x,y,z)=>(y*(this.nz+1)+z)*(this.nx+1)+x;this.id=id;
    for(let y=0;y<=this.ny;y++)for(let z=0;z<=this.nz;z++)for(let x=0;x<=this.nx;x++){
      let p=new THREE.Vector3((x/this.nx-.5)*2,(y/this.ny-.5)*1.3,(z/this.nz-.5)*2);
      this.nodes.push({p:p.clone(),old:p.clone(),rest:p.clone()});
    }
    const edgeSet=new Set();const addEdge=(a,b)=>{let key=Math.min(a,b)+','+Math.max(a,b);if(edgeSet.has(key))return;edgeSet.add(key);this.edges.push({a,b,len:this.nodes[a].p.distanceTo(this.nodes[b].p)})};
    const vol=(a,b,c,d)=>b.clone().sub(a).dot(c.clone().sub(a).cross(d.clone().sub(a)))/6;
    for(let y=0;y<this.ny;y++)for(let z=0;z<this.nz;z++)for(let x=0;x<this.nx;x++){
      let q=[id(x,y,z),id(x+1,y,z),id(x,y+1,z),id(x+1,y+1,z),id(x,y,z+1),id(x+1,y,z+1),id(x,y+1,z+1),id(x+1,y+1,z+1)];
      for(let tet of [[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]]){let v=tet.map(i=>q[i]);for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)addEdge(v[i],v[j]);this.tets.push({v,rest:vol(...v.map(i=>this.nodes[i].p))})}
    }
  }
  clone(){let v=new ElasticVolume();for(let i=0;i<this.nodes.length;i++){v.nodes[i].p.copy(this.nodes[i].p);v.nodes[i].old.copy(this.nodes[i].old)}for(let i=0;i<this.edges.length;i++)v.edges[i].broken=!!this.edges[i].broken;for(let i=0;i<this.tets.length;i++)v.tets[i].broken=!!this.tets[i].broken;return v}
  impulse(x,z,power,toughness=1){for(let n of this.nodes){let r=Math.hypot(n.p.x-x,n.p.z-z);let w=Math.exp(-r*r*5)*Math.max(0,(n.p.y+.65)/1.3);n.old.y+=power*w*.22;n.old.x-=(n.p.x-x)*power*w*.025;n.old.z-=(n.p.z-z)*power*w*.025}
    // Break links whose predicted tensile impulse exceeds the material threshold.
    for(let e of this.edges){if(e.broken)continue;let a=this.nodes[e.a],b=this.nodes[e.b],axis=b.p.clone().sub(a.p).normalize(),relative=b.old.clone().sub(b.p).sub(a.old.clone().sub(a.p));let tension=Math.abs(axis.dot(relative))/e.len;if(tension>.19+toughness*.30){e.broken=true}}
    for(let t of this.tets){if(t.broken)continue;for(let e of this.edges){if(e.broken&&t.v.includes(e.a)&&t.v.includes(e.b)){t.broken=true;break}}}
  }
  step(dt,stiff){
    let nodes=this.nodes;let speed=Math.min(1,dt*120);
    for(let n of nodes){let vx=(n.p.x-n.old.x)*.985*speed,vy=(n.p.y-n.old.y)*.985*speed,vz=(n.p.z-n.old.z)*.985*speed;n.old.copy(n.p);n.p.x+=vx;n.p.y+=vy;n.p.z+=vz;}
    for(let iter=0;iter<3;iter++){
      for(let e of this.edges){if(e.broken)continue;let a=nodes[e.a].p,b=nodes[e.b].p,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,l=Math.hypot(dx,dy,dz)||1;let k=(l-e.len)/l*(.12+stiff*.28);a.x+=dx*k;a.y+=dy*k;a.z+=dz*k;b.x-=dx*k;b.y-=dy*k;b.z-=dz*k}
      for(let t of this.tets){if(t.broken)continue;let [a,b,c,d]=t.v.map(i=>nodes[i].p);let ba=b.clone().sub(a),ca=c.clone().sub(a),da=d.clone().sub(a);let gb=ca.clone().cross(da).multiplyScalar(1/6),gc=da.clone().cross(ba).multiplyScalar(1/6),gd=ba.clone().cross(ca).multiplyScalar(1/6),ga=gb.clone().add(gc).add(gd).negate();let volume=ba.dot(ca.cross(da))/6;let denom=ga.lengthSq()+gb.lengthSq()+gc.lengthSq()+gd.lengthSq()+1e-9;let lambda=(volume-t.rest)/denom*.42;a.addScaledVector(ga,-lambda);b.addScaledVector(gb,-lambda);c.addScaledVector(gc,-lambda);d.addScaledVector(gd,-lambda)}
      for(let n of nodes){if(n.rest.y<-.64){n.p.y=Math.max(n.p.y,-.65);n.p.x+=(n.rest.x-n.p.x)*.012;n.p.z+=(n.rest.z-n.p.z)*.012}}
    }
  }
  deform(x,y,z,out){let fx=THREE.MathUtils.clamp((x/2+.5)*this.nx,0,this.nx-.00001),fy=THREE.MathUtils.clamp((y/1.3+.5)*this.ny,0,this.ny-.00001),fz=THREE.MathUtils.clamp((z/2+.5)*this.nz,0,this.nz-.00001),ix=Math.floor(fx),iy=Math.floor(fy),iz=Math.floor(fz);fx-=ix;fy-=iy;fz-=iz;out.set(x,y,z);for(let dy=0;dy<2;dy++)for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++){let w=(dx?fx:1-fx)*(dy?fy:1-fy)*(dz?fz:1-fz),n=this.nodes[this.id(ix+dx,iy+dy,iz+dz)];out.addScaledVector(n.p.clone().sub(n.rest),w)}return out}
}
