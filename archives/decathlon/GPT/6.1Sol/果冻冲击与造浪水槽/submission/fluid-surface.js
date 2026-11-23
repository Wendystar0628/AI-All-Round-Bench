/* A three-dimensional, particle-derived density isosurface. This is a rendering
   reconstruction only: every degree of fluid motion remains in the GPU solver.
   Tetrahedral polygonization supports overhangs, cavities and disconnected drops. */
(function(){
const S=.14,NX=77,NY=36,NZ=34,PL=NX*NY,COUNT=PL*NZ,R=.42,ISO=1.8;
const TETS=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
class ParticleSurface{
 constructor(){
  this.field=new Float32Array(COUNT);this.gradient=new Float32Array(COUNT*3);this.visibility=new Float32Array(24000);
  this.positions=new Float32Array(2700000);this.normals=new Float32Array(2700000);this.vertices=0;this.lastCPU=null;
  this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('normal',new THREE.BufferAttribute(this.normals,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setDrawRange(0,0);
  this.material=new THREE.ShaderMaterial({side:THREE.DoubleSide,vertexShader:`varying vec3 vp,nv;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vp=p.xyz;nv=normalMatrix*normal;gl_Position=projectionMatrix*p;}`,fragmentShader:`precision highp float;varying vec3 vp,nv;void main(){vec3 n=normalize(nv);if(dot(n,-vp)<0.)n=-n;gl_FragColor=vec4(-vp.z,n*.5+.5);}`});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.triangles=0;
 }
 update(cpu,count){
  if(cpu===this.lastCPU)return;this.lastCPU=cpu;const f=this.field,g=this.gradient;f.fill(0);const invR2=1/(R*R);
  for(let i=0;i<count;i++){
   const p=i*8,px=cpu[p]+S,py=cpu[p+1]+S,pz=cpu[p+2]+S;
   const x0=Math.max(1,Math.ceil((px-R)/S)),x1=Math.min(NX-2,Math.floor((px+R)/S)),y0=Math.max(1,Math.ceil((py-R)/S)),y1=Math.min(NY-2,Math.floor((py+R)/S)),z0=Math.max(1,Math.ceil((pz-R)/S)),z1=Math.min(NZ-2,Math.floor((pz+R)/S));
   for(let z=z0;z<=z1;z++){let dz=z*S-pz;for(let y=y0;y<=y1;y++){let dy=y*S-py,base=NX*y+PL*z;for(let x=x0;x<=x1;x++){let dx=x*S-px,q=1-(dx*dx+dy*dy+dz*dz)*invR2;if(q>0)f[base+x]+=q*q*q;}}}
  }
  for(let z=1;z<NZ-1;z++)for(let y=1;y<NY-1;y++)for(let x=1;x<NX-1;x++){const k=x+NX*y+PL*z;g[k*3]=f[k-1]-f[k+1];g[k*3+1]=f[k-NX]-f[k+NX];g[k*3+2]=f[k-PL]-f[k+PL];}
  for(let i=0;i<count;i++){let k=i*8,x=Math.round((cpu[k]+S)/S),y=Math.round((cpu[k+1]+S)/S),z=Math.round((cpu[k+2]+S)/S);this.visibility[i]=f[x+NX*y+PL*z]<ISO*1.22?1:0;}
  this.vertices=0;
  const offsets=[0,1,NX,NX+1,PL,PL+1,PL+NX,PL+NX+1],corners=Array.from({length:8},()=>({k:0,x:0,y:0,z:0,v:0}));
  for(let z=0;z<NZ-1;z++)for(let y=0;y<NY-1;y++)for(let x=0;x<NX-1;x++){
   let base=x+NX*y+PL*z,lo=Infinity,hi=-Infinity;
   for(let a=0;a<8;a++){let c=corners[a];c.k=base+offsets[a];c.v=f[c.k];lo=Math.min(lo,c.v);hi=Math.max(hi,c.v);c.x=(x+(a&1))*S-S-5.2;c.y=(y+((a>>1)&1))*S-S+.15;c.z=(z+((a>>2)&1))*S-S-2.15;}
   if(lo>=ISO||hi<ISO)continue;
   for(let tet of TETS){let inside=[],outside=[];for(let a of tet)(corners[a].v>=ISO?inside:outside).push(corners[a]);if(!inside.length||inside.length===4)continue;
    if(inside.length===1){this.triangle(this.edge(inside[0],outside[0]),this.edge(inside[0],outside[1]),this.edge(inside[0],outside[2]));}
    else if(inside.length===3){this.triangle(this.edge(outside[0],inside[0]),this.edge(outside[0],inside[2]),this.edge(outside[0],inside[1]));}
    else{let a=this.edge(inside[0],outside[0]),b=this.edge(inside[0],outside[1]),c=this.edge(inside[1],outside[0]),d=this.edge(inside[1],outside[1]);this.triangle(a,b,c);this.triangle(b,d,c);}
   }
  }
  this.triangles=this.vertices/3;this.geometry.setDrawRange(0,this.vertices);this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.normal.needsUpdate=true;
 }
 edge(a,b){let t=(ISO-a.v)/(b.v-a.v),j=a.k*3,k=b.k*3,g=this.gradient,nx=g[j]+(g[k]-g[j])*t,ny=g[j+1]+(g[k+1]-g[j+1])*t,nz=g[j+2]+(g[k+2]-g[j+2])*t,l=Math.hypot(nx,ny,nz)||1,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;nx/=l;ny/=l;nz/=l;const minX=this.minX??-4.84;if(x<minX){x=minX;nx=-1;ny=0;nz=0;}if(x>4.96){x=4.96;nx=1;ny=0;nz=0;}if(z< -2.03){z=-2.03;nx=0;ny=0;nz=-1;}if(z>2.03){z=2.03;nx=0;ny=0;nz=1;}const floor=.27+Math.max(0,x-2.3)*.22;if(y<floor){y=floor;nx=0;ny=-1;nz=0;}return [x,y,z,nx,ny,nz];}
 triangle(a,b,c){if((this.vertices+3)*3>this.positions.length)return;const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];if((uy*vz-uz*vy)*(a[3]+b[3]+c[3])+(uz*vx-ux*vz)*(a[4]+b[4]+c[4])+(ux*vy-uy*vx)*(a[5]+b[5]+c[5])<0)[b,c]=[c,b];for(let v of [a,b,c]){let k=this.vertices++*3;this.positions[k]=v[0];this.positions[k+1]=v[1];this.positions[k+2]=v[2];this.normals[k]=v[3];this.normals[k+1]=v[4];this.normals[k+2]=v[5];}}
}
window.ParticleSurface=ParticleSurface;
})();
