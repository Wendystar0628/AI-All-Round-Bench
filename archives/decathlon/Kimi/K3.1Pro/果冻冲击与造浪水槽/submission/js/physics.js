(function () {
  const FLOOR = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const closest = { x: 0, y: 0, z: 0, u: 0, v: 0, w: 0 };

  function closestTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) { closest.x = ax; closest.y = ay; closest.z = az; closest.u = 1; closest.v = 0; closest.w = 0; return; }
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { closest.x = bx; closest.y = by; closest.z = bz; closest.u = 0; closest.v = 1; closest.w = 0; return; }
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      closest.x = ax + abx * v; closest.y = ay + aby * v; closest.z = az + abz * v;
      closest.u = 1 - v; closest.v = v; closest.w = 0; return;
    }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) { closest.x = cx; closest.y = cy; closest.z = cz; closest.u = 0; closest.v = 0; closest.w = 1; return; }
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      closest.x = ax + acx * w; closest.y = ay + acy * w; closest.z = az + acz * w;
      closest.u = 1 - w; closest.v = 0; closest.w = w; return;
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      closest.x = bx + (cx - bx) * w; closest.y = by + (cy - by) * w; closest.z = bz + (cz - bz) * w;
      closest.u = 0; closest.v = 1 - w; closest.w = w; return;
    }
    const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
    closest.x = ax + abx * v + acx * w; closest.y = ay + aby * v + acy * w; closest.z = az + abz * v + acz * w;
    closest.u = 1 - v - w; closest.v = v; closest.w = w;
  }

  class SoftBody {
    constructor(options) {
      this.options = options;
      this.center = options.center || [0, 0, 0];
      this.size = options.size || [2, 1.5, 1.6];
      this.nx = options.nx || 8; this.ny = options.ny || 6; this.nz = options.nz || 6;
      this.softness = options.softness ?? 0.55;
      this.toughness = options.toughness ?? 0.78;
      this.shape = options.shape || 'box';
      this.floor = options.floor ?? FLOOR;
      this.fractureEnabled = options.fractureEnabled !== false;
      this.onFracture = null;
      this.onImpact = null;
      this.pos = []; this.prev = []; this.vel = []; this.rest = []; this.invMass = [];
      this.tets = []; this.surface = []; this.originalFaceCounts = new Map();
      this.topologyDirty = true; this.stepCount = 0; this.fractures = 0; this.impactEnergy = 0;
      this.volumeRatio = 1; this.deformation = 0; this.maxSpeed = 0; this.lastImpactPoint = [0, 1, 0];
      this.build();
    }

    build() {
      const nx = this.nx, ny = this.ny, nz = this.nz;
      const index = (x, y, z) => x + nx * (y + ny * z);
      for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        let u = x / (nx - 1) * 2 - 1, v = y / (ny - 1) * 2 - 1, w = z / (nz - 1) * 2 - 1;
        let px = u * this.size[0] * .5, py = (v + 1) * this.size[1] * .5, pz = w * this.size[2] * .5;
        if (this.shape === 'cylinder') {
          px *= Math.sqrt(1 - w * w * .48); pz *= Math.sqrt(1 - u * u * .48);
          py *= 1 - .07 * (u * u + w * w);
        } else {
          const bx = 1 - .095 * (Math.pow(Math.abs(v), 8) + Math.pow(Math.abs(w), 8));
          const by = 1 - .065 * (Math.pow(Math.abs(u), 8) + Math.pow(Math.abs(w), 8));
          const bz = 1 - .095 * (Math.pow(Math.abs(u), 8) + Math.pow(Math.abs(v), 8));
          px *= bx; py = this.size[1] * .5 + (py - this.size[1] * .5) * by; pz *= bz;
        }
        this.rest.push(px + this.center[0], py + this.center[1], pz + this.center[2]);
        this.pos.push(px + this.center[0], py + this.center[1], pz + this.center[2]);
        this.prev.push(px + this.center[0], py + this.center[1], pz + this.center[2]);
        this.vel.push(0, 0, 0); this.invMass.push(1);
      }
      const pattern = [[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]];
      for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
        const q = [index(x,y,z),index(x+1,y,z),index(x+1,y+1,z),index(x,y+1,z),index(x,y,z+1),index(x+1,y,z+1),index(x+1,y+1,z+1),index(x,y+1,z+1)];
        for (const p of pattern) {
          let t = [q[p[0]],q[p[1]],q[p[2]],q[p[3]]];
          if (this.signedVolume(t, this.rest) < 0) t = [t[0],t[1],t[3],t[2]];
          const restVolume = Math.abs(this.signedVolume(t, this.rest));
          this.tets.push({ v: t, rest: restVolume, alive: true, damage: 0, heat: 0 });
        }
      }
      this.restVolume = this.tets.reduce((s,t) => s + t.rest, 0);
      this.restBounds = this.getBounds(this.rest);
      this.countOriginalFaces();
      this.rebuildConstraints(); this.rebuildSurface();
    }

    countOriginalFaces() {
      const faces = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
      for (const t of this.tets) for (const f of faces) {
        const ids = [t.v[f[0]],t.v[f[1]],t.v[f[2]]];
        const key = ids.slice().sort((a,b)=>a-b).join(',');
        this.originalFaceCounts.set(key,(this.originalFaceCounts.get(key)||0)+1);
      }
    }

    signedVolume(t, p) {
      const a=t[0]*3,b=t[1]*3,c=t[2]*3,d=t[3]*3;
      const abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2];
      const acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2];
      const adx=p[d]-p[a],ady=p[d+1]-p[a+1],adz=p[d+2]-p[a+2];
      return (abx*(acy*adz-acz*ady)+aby*(acz*adx-acx*adz)+abz*(acx*ady-acy*adx))/6;
    }

    getBounds(p = this.pos) {
      const b = { min:[Infinity,Infinity,Infinity], max:[-Infinity,-Infinity,-Infinity] };
      for (let i=0;i<p.length;i+=3) for(let a=0;a<3;a++) { b.min[a]=Math.min(b.min[a],p[i+a]); b.max[a]=Math.max(b.max[a],p[i+a]); }
      return b;
    }

    rebuildConstraints() {
      const edgeMap = new Map();
      for (const t of this.tets) if (t.alive) {
        const v=t.v, pairs=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
        for(const e of pairs){const a=v[e[0]],b=v[e[1]],key=a<b?a+','+b:b+','+a;if(!edgeMap.has(key))edgeMap.set(key,[a,b]);}
      }
      this.edges=[];
      for(const [a,b] of edgeMap.values()){
        const ai=a*3,bi=b*3,dx=this.rest[bi]-this.rest[ai],dy=this.rest[bi+1]-this.rest[ai+1],dz=this.rest[bi+2]-this.rest[ai+2];
        this.edges.push({a,b,rest:Math.hypot(dx,dy,dz)});
      }
      this.topologyDirty = true;
    }

    rebuildSurface() {
      const map = new Map(), faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
      for(let ti=0;ti<this.tets.length;ti++){
        const t=this.tets[ti]; if(!t.alive)continue;
        for(const f of faces){
          const a=t.v[f[0]],b=t.v[f[1]],c=t.v[f[2]],key=[a,b,c].slice().sort((x,y)=>x-y).join(',');
          if(map.has(key))map.delete(key);else map.set(key,{a,b,c,t:ti,key});
        }
      }
      this.surface=Array.from(map.values(),f=>({...f,inside:(this.originalFaceCounts.get(f.key)||1)>1}));
      this.topologyDirty=false; this.surfaceVersion=(this.surfaceVersion||0)+1;
    }

    setMaterial(softness,toughness){this.softness=softness;this.toughness=toughness;}

    step(dt) {
      const p=this.pos,prev=this.prev,v=this.vel,n=p.length/3;
      const drag=Math.exp(-(this.fractures?1.15:.48)*dt),g=-4.2;
      for(let i=0;i<n;i++){
        const k=i*3;prev[k]=p[k];prev[k+1]=p[k+1];prev[k+2]=p[k+2];
        v[k]*=drag;v[k+1]=(v[k+1]+g*dt)*drag;v[k+2]*=drag;
        p[k]+=v[k]*dt;p[k+1]+=v[k+1]*dt;p[k+2]+=v[k+2]*dt;
      }
      const stiffness=1-this.softness;
      const edgeAlpha=.035+this.softness*this.softness*45;
      const volumeAlpha=.00004+this.softness*.012;
      for(let iteration=0;iteration<6;iteration++){
        for(const e of this.edges){
          const a=e.a*3,b=e.b*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2];
          const len=Math.hypot(dx,dy,dz);if(len<1e-7)continue;
          const w=this.invMass[e.a]+this.invMass[e.b];
          const corr=(len-e.rest)/(len*(w+edgeAlpha));
          p[a]+=dx*corr*this.invMass[e.a];p[a+1]+=dy*corr*this.invMass[e.a];p[a+2]+=dz*corr*this.invMass[e.a];
          p[b]-=dx*corr*this.invMass[e.b];p[b+1]-=dy*corr*this.invMass[e.b];p[b+2]-=dz*corr*this.invMass[e.b];
        }
        for(const t of this.tets){
          if(!t.alive)continue;
          const ids=t.v,a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,d=ids[3]*3;
          const abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2];
          const acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2];
          const adx=p[d]-p[a],ady=p[d+1]-p[a+1],adz=p[d+2]-p[a+2];
          const vol=(abx*(acy*adz-acz*ady)+aby*(acz*adx-acx*adz)+abz*(acx*ady-acy*adx))/6;
          const C=vol-t.rest;
          const gbx=(acy*adz-acz*ady)/6,gby=(acz*adx-acx*adz)/6,gbz=(acx*ady-acy*adx)/6;
          const gcx=(ady*abz-adz*aby)/6,gcy=(adz*abx-adx*abz)/6,gcz=(adx*aby-ady*abx)/6;
          const gdx=(aby*acz-abz*acy)/6,gdy=(abz*acx-abx*acz)/6,gdz=(abx*acy-aby*acx)/6;
          const gax=-gbx-gcx-gdx,gay=-gby-gcy-gdy,gaz=-gbz-gcz-gdz;
          const denom=this.invMass[ids[0]]*(gax*gax+gay*gay+gaz*gaz)+this.invMass[ids[1]]*(gbx*gbx+gby*gby+gbz*gbz)+this.invMass[ids[2]]*(gcx*gcx+gcy*gcy+gcz*gcz)+this.invMass[ids[3]]*(gdx*gdx+gdy*gdy+gdz*gdz)+volumeAlpha;
          if(denom<1e-9)continue;const lambda=-C/denom;
          p[a]+=gax*lambda*this.invMass[ids[0]];p[a+1]+=gay*lambda*this.invMass[ids[0]];p[a+2]+=gaz*lambda*this.invMass[ids[0]];
          p[b]+=gbx*lambda*this.invMass[ids[1]];p[b+1]+=gby*lambda*this.invMass[ids[1]];p[b+2]+=gbz*lambda*this.invMass[ids[1]];
          p[c]+=gcx*lambda*this.invMass[ids[2]];p[c+1]+=gcy*lambda*this.invMass[ids[2]];p[c+2]+=gcz*lambda*this.invMass[ids[2]];
          p[d]+=gdx*lambda*this.invMass[ids[3]];p[d+1]+=gdy*lambda*this.invMass[ids[3]];p[d+2]+=gdz*lambda*this.invMass[ids[3]];
        }
        for(let i=0;i<n;i++){
          const k=i*3;if(p[k+1]<this.floor){p[k+1]=this.floor;const friction=.88;p[k]=prev[k]+(p[k]-prev[k])*friction;p[k+2]=prev[k+2]+(p[k+2]-prev[k+2])*friction;}
        }
      }
      let maxSpeed=0;const velocityLimit=this.fractures?8:22;
      for(let i=0;i<n;i++){
        const k=i*3;let vx=(p[k]-prev[k])/dt,vy=(p[k+1]-prev[k+1])/dt,vz=(p[k+2]-prev[k+2])/dt;
        const speed=Math.hypot(vx,vy,vz);if(speed>velocityLimit){const s=velocityLimit/speed;vx*=s;vy*=s;vz*=s;}
        if(p[k+1]<=this.floor+.0001){if(vy<0)vy=0;vx*=.985;vz*=.985;}
        const radial=Math.hypot(p[k],p[k+2]);if(radial>4.08){const nx=p[k]/radial,nz=p[k+2]/radial;p[k]=nx*4.08;p[k+2]=nz*4.08;const outward=vx*nx+vz*nz;if(outward>0){vx-=outward*nx*1.25;vz-=outward*nz*1.25;}}
        if(p[k+1]>4.5){p[k+1]=4.5;vy=Math.min(0,vy);}
        v[k]=vx;v[k+1]=vy;v[k+2]=vz;maxSpeed=Math.max(maxSpeed,Math.hypot(vx,vy,vz));
      }
      this.maxSpeed=maxSpeed;this.impactEnergy*=Math.exp(-2.6*dt);
      this.stepCount++;
      if(this.fractureEnabled)this.updateFracture(dt);
      if(this.stepCount%8===0)this.updateStats();
    }

    updateStats(){
      let vol=0,aliveRest=0,maxStrain=0;
      for(const t of this.tets)if(t.alive){
        vol+=Math.abs(this.signedVolume(t.v,this.pos));aliveRest+=t.rest;
        const ids=t.v;
        for(const pair of [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]){
          const a=ids[pair[0]]*3,b=ids[pair[1]]*3,ar=ids[pair[0]]*3,br=ids[pair[1]]*3;
          const len=Math.hypot(this.pos[b]-this.pos[a],this.pos[b+1]-this.pos[a+1],this.pos[b+2]-this.pos[a+2]);
          const rest=Math.hypot(this.rest[br]-this.rest[ar],this.rest[br+1]-this.rest[ar+1],this.rest[br+2]-this.rest[ar+2]);
          maxStrain=Math.max(maxStrain,Math.abs(len/rest-1));
        }
      }
      this.volumeRatio=vol/Math.max(.00001,aliveRest);this.deformation=clamp(maxStrain*100,0,199);
    }

    collideSphere(ball) {
      const bp=ball.position,r=ball.radius;
      const bounds=this.boundsCache&&this.stepCount%8!==0?this.boundsCache:(this.boundsCache=this.getBounds());
      if(bp.x<bounds.min[0]-r||bp.x>bounds.max[0]+r||bp.y<bounds.min[1]-r||bp.y>bounds.max[1]+r||bp.z<bounds.min[2]-r||bp.z>bounds.max[2]+r)return false;
      let best=Infinity,bestFace=null,bestPoint=null;
      for(const f of this.surface){
        if(this.fractures&&f.inside)continue;
        const a=f.a*3,b=f.b*3,c=f.c*3,p=this.pos;
        closestTriangle(bp.x,bp.y,bp.z,p[a],p[a+1],p[a+2],p[b],p[b+1],p[b+2],p[c],p[c+1],p[c+2]);
        const dx=bp.x-closest.x,dy=bp.y-closest.y,dz=bp.z-closest.z,dist=dx*dx+dy*dy+dz*dz;
        if(dist<best){best=dist;bestFace=f;bestPoint=[closest.x,closest.y,closest.z,closest.u,closest.v,closest.w];}
      }
      if(!bestFace)return false;
      const f=bestFace,a=f.a*3,b=f.b*3,c=f.c*3,p=this.pos;
      const abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2],acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2];
      let nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;const nl=Math.hypot(nx,ny,nz);if(nl<1e-8)return false;nx/=nl;ny/=nl;nz/=nl;
      const q=bestPoint,dx=bp.x-q[0],dy=bp.y-q[1],dz=bp.z-q[2],signed=dx*nx+dy*ny+dz*nz;
      if(signed>=r){if(this.stressContacts)this.stressContacts.delete(ball.id);return false;}
      const penetration=Math.min(r-signed,r*1.7),weights=[q[3],q[4],q[5]],ids=[f.a,f.b,f.c];
      const invBall=1/ball.mass,denom=invBall+weights[0]*weights[0]+weights[1]*weights[1]+weights[2]*weights[2];
      const lambda=penetration/denom,contactScale=this.fractures?.32:1;
      ball.position.x+=nx*lambda*invBall*.35;ball.position.y+=ny*lambda*invBall*.35;ball.position.z+=nz*lambda*invBall*.35;
      for(let j=0;j<3;j++){const k=ids[j]*3,corr=lambda*weights[j]*1.9*contactScale;p[k]-=nx*corr;p[k+1]-=ny*corr;p[k+2]-=nz*corr;}
      const vv=this.vel,vx=vv[a]*weights[0]+vv[b]*weights[1]+vv[c]*weights[2],vy=vv[a+1]*weights[0]+vv[b+1]*weights[1]+vv[c+1]*weights[2],vz=vv[a+2]*weights[0]+vv[b+2]*weights[1]+vv[c+2]*weights[2];
      const rvx=ball.velocity.x-vx,rvy=ball.velocity.y-vy,rvz=ball.velocity.z-vz,vn=rvx*nx+rvy*ny+rvz*nz;
      if(vn<0){
        const energy=.5*ball.mass*vn*vn,restitution=.025+(1-this.softness)*.13;
        const impulse=-(1+restitution)*vn/denom;
        ball.velocity.x+=nx*impulse*invBall*.58;ball.velocity.y+=ny*impulse*invBall*.58;ball.velocity.z+=nz*impulse*invBall*.58;
        for(let j=0;j<3;j++){const k=ids[j]*3,im=impulse*weights[j]*1.08*contactScale;vv[k]-=nx*im;vv[k+1]-=ny*im;vv[k+2]-=nz*im;}
        const tangentX=rvx-vn*nx,tangentY=rvy-vn*ny,tangentZ=rvz-vn*nz,friction=.045+this.softness*.08;
        ball.velocity.x-=tangentX*friction;ball.velocity.y-=tangentY*friction;ball.velocity.z-=tangentZ*friction;
        this.impactEnergy=Math.max(this.impactEnergy,energy);this.lastImpactPoint=[q[0],q[1],q[2]];
        if(!this.stressContacts)this.stressContacts=new Set();
        if(energy>20&&!this.stressContacts.has(ball.id)){this.stressContacts.add(ball.id);this.applyImpactStress(q[0],q[1],q[2],energy);this.registerImpact(q[0],q[1],q[2],energy,nx,ny,nz);}
        if(this.onImpact&&energy>1)this.onImpact(energy,q);
      }
      return true;
    }

    applyImpactStress(x,y,z,energy){
      if(this.fractures>8)return;
      const compression=clamp(energy*this.softness*.0015,0,.46),height=Math.max(.3,this.restBounds.max[1]-this.restBounds.min[1]),cx=(this.restBounds.min[0]+this.restBounds.max[0])*.5,cz=(this.restBounds.min[2]+this.restBounds.max[2])*.5;
      for(let i=0;i<this.pos.length;i+=3){
        const h=clamp((this.rest[i+1]-this.floor)/height,0,1),rx=this.rest[i]-cx,rz=this.rest[i+2]-cz;
        const directional=clamp(1+(this.rest[i]-x)*.16, .72,1.28),amount=compression*directional;
        this.pos[i+1]-=height*amount*h;this.pos[i]+=rx*amount*.5;this.pos[i+2]+=rz*amount*.5;
        this.vel[i+1]-=height*amount*2.8*h;this.vel[i]+=rx*amount*1.4;this.vel[i+2]+=rz*amount*1.4;
      }
      this.boundsCache=null;
    }

    registerImpact(x,y,z,energy,nx,ny,nz){
      if(!this.fractureEnabled||energy<5)return;
      const scale=.003/(0.25+this.toughness*1.8);
      let dx=x-this.lastImpactPoint[0],dy=y-this.lastImpactPoint[1],dz=z-this.lastImpactPoint[2];
      for(const t of this.tets){
        if(!t.alive)continue;const ids=t.v;let cx=0,cy=0,cz=0;
        for(const id of ids){cx+=this.pos[id*3];cy+=this.pos[id*3+1];cz+=this.pos[id*3+2];}cx*=.25;cy*=.25;cz*=.25;
        const px=cx-x,py=cy-y,pz=cz-z;
        const along=Math.abs(px),plane=Math.exp(-along*along/.07)*Math.exp(-py*py/3.4)*Math.exp(-pz*pz/2.8);
        const local=Math.exp(-(px*px+py*py+pz*pz)/.48);
        t.heat=Math.min(3,t.heat+energy*scale*(plane+local*.12));
      }
    }

    updateFracture(dt){
      let broke=0;const candidates=[];
      for(let ti=0;ti<this.tets.length;ti++){
        const t=this.tets[ti];if(!t.alive)continue;t.heat*=Math.exp(-1.45*dt);
        let maxStretch=0,maxCompress=0;const ids=t.v;
        for(const pair of [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]){
          const a=ids[pair[0]]*3,b=ids[pair[1]]*3;
          const len=Math.hypot(this.pos[b]-this.pos[a],this.pos[b+1]-this.pos[a+1],this.pos[b+2]-this.pos[a+2]);
          const rest=Math.hypot(this.rest[b]-this.rest[a],this.rest[b+1]-this.rest[a+1],this.rest[b+2]-this.rest[a+2]);
          const ratio=len/rest;maxStretch=Math.max(maxStretch,ratio-1);maxCompress=Math.max(maxCompress,1-ratio);
        }
        const strain=Math.max(maxStretch,maxCompress*1.18),threshold=.22+this.toughness*.5;
        t.damage+=Math.max(0,strain-threshold)*dt*1.8+Math.max(0,t.heat-(.25+this.toughness*.72))*dt*2.8;
        const centerX=(this.pos[ids[0]*3]+this.pos[ids[1]*3]+this.pos[ids[2]*3]+this.pos[ids[3]*3])*.25,affinity=Math.exp(-Math.pow((centerX-this.lastImpactPoint[0])/.32,2));
        if((strain>Math.max(.025,threshold*.16)&&t.damage>.055)||t.heat>(.25+this.toughness*.72)*1.18||(this.fractures>20&&affinity>.35&&t.heat>.02))candidates.push({ti,score:t.damage+t.heat*.08+strain*.05+affinity*5});
      }
      candidates.sort((a,b)=>b.score-a.score);
      if(this.fractures>this.tets.length*.32)candidates.length=0;
      for(const c of candidates){if(broke>=8)break;const t=this.tets[c.ti];t.alive=false;broke++;this.fractures++;
        const ids=t.v,cx=(this.pos[ids[0]*3]+this.pos[ids[1]*3]+this.pos[ids[2]*3]+this.pos[ids[3]*3])*.25,direction=Math.sign(cx-this.lastImpactPoint[0])||1;
        for(const id of ids)this.vel[id*3]+=direction*Math.min(.018,this.impactEnergy*.00008);
        for(const other of this.tets)if(other.alive&&other.v.some(id=>t.v.includes(id)))other.damage+=.012;
      }
      if(broke){this.rebuildConstraints();this.rebuildSurface();if(this.onFracture)this.onFracture(broke,this.lastImpactPoint);}
    }
  }

  class JellyWorld {
    constructor(config={}) {
      this.config=config;this.time=0;this.impactEnergy=0;this.onSound=null;
      const main=new SoftBody({center:[0,0,0],size:[2.15,1.58,1.65],nx:8,ny:6,nz:6,softness:config.softness??.55,toughness:config.toughness??.78,fractureEnabled:true});
      const left=new SoftBody({center:[-2.55,0,.62],size:[1.05,1.12,1.02],nx:5,ny:5,nz:5,shape:'cylinder',softness:.34,toughness:.95,fractureEnabled:false});
      const right=new SoftBody({center:[2.55,0,-.52],size:[1.2,.85,1.05],nx:5,ny:4,nz:5,softness:.72,toughness:.8,fractureEnabled:false});
      this.bodies=[main,left,right];
      for(const b of this.bodies){b.onImpact=(energy,p)=>{this.impactEnergy=Math.max(this.impactEnergy,energy);if(this.onSound)this.onSound('impact',energy,p);};b.onFracture=(count,p)=>{if(this.onSound)this.onSound('crack',count,p);};}
      this.balls=[];this.ballId=0;
      this.addBall({position:[2.25,.28,1.12],radius:.28,mass:2.4,velocity:[0,0,0],resting:true});
      for(let i=0;i<45;i++)this.step(1/120,true);
      this.impactEnergy=0;
    }

    addBall(options={}) {
      const radius=options.radius||.39,mass=options.mass||8;
      const ball={id:this.ballId++,position:new THREE.Vector3(...(options.position||[0,4,0])),velocity:new THREE.Vector3(...(options.velocity||[0,0,0])),radius,mass,rotation:new THREE.Euler(),spin:new THREE.Vector3(),active:true,resting:!!options.resting,hit:false,trail:[]};
      this.balls.push(ball);return ball;
    }

    drop(options={}) {
      const body=this.bodies[0],bounds=body.getBounds(),radius=options.radius||.4;
      const offset=options.offset||[0,0];
      const height=options.height??3.2;
      const p=[bounds.min[0]+(bounds.max[0]-bounds.min[0])*.5+offset[0],bounds.max[1]+height+radius,bounds.min[2]+(bounds.max[2]-bounds.min[2])*.5+offset[1]];
      const velocity=options.velocity||[options.slant?-1.5:0,options.speed??0,options.slant?.4:0];
      return this.addBall({position:p,radius,mass:options.mass||8,velocity});
    }

    step(dt,settling=false) {
      this.time+=dt;
      for(const b of this.bodies)b.step(dt);
      for(const ball of this.balls){
        if(!ball.active)continue;
        if(!ball.resting){ball.velocity.y-=9.81*dt;ball.position.addScaledVector(ball.velocity,dt);}
        for(const body of this.bodies)body.collideSphere(ball);
        if(ball.position.y<ball.radius){
          ball.position.y=ball.radius;
          if(ball.velocity.y<0){if(Math.abs(ball.velocity.y)>1.1&&this.onSound)this.onSound('floor',Math.abs(ball.velocity.y)*ball.mass,ball.position);ball.velocity.y*=-.3;}
          ball.velocity.x*=.992;ball.velocity.z*=.992;
          if(Math.abs(ball.velocity.y)<.07)ball.velocity.y=0;
          ball.resting=false;
        }
        if(Math.abs(ball.position.x)>4.15){ball.position.x=Math.sign(ball.position.x)*4.15;ball.velocity.x*=-.45;}
        if(Math.abs(ball.position.z)>3.25){ball.position.z=Math.sign(ball.position.z)*3.25;ball.velocity.z*=-.45;}
        const speed=Math.hypot(ball.velocity.x,ball.velocity.z);
        if(ball.position.y<=ball.radius+.005&&speed<.025){ball.velocity.x=0;ball.velocity.z=0;if(ball.velocity.y===0)ball.resting=true;}
        ball.spin.set(ball.velocity.z/ball.radius,0,-ball.velocity.x/ball.radius);
        ball.rotation.x+=ball.spin.x*dt;ball.rotation.z+=ball.spin.z*dt;
      }
      for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++){
        const a=this.balls[i],b=this.balls[j],dx=b.position.x-a.position.x,dy=b.position.y-a.position.y,dz=b.position.z-a.position.z;
        const dist=Math.hypot(dx,dy,dz),min=a.radius+b.radius;if(dist>=min||dist<1e-6)continue;
        const nx=dx/dist,ny=dy/dist,nz=dz/dist,ia=1/a.mass,ib=1/b.mass,corr=(min-dist)/(ia+ib);
        a.position.x-=nx*corr*ia;a.position.y-=ny*corr*ia;a.position.z-=nz*corr*ia;b.position.x+=nx*corr*ib;b.position.y+=ny*corr*ib;b.position.z+=nz*corr*ib;
        const rv=(b.velocity.x-a.velocity.x)*nx+(b.velocity.y-a.velocity.y)*ny+(b.velocity.z-a.velocity.z)*nz;
        if(rv<0){const impulse=-(1.42)*rv/(ia+ib);a.velocity.x-=nx*impulse*ia;a.velocity.y-=ny*impulse*ia;a.velocity.z-=nz*impulse*ia;b.velocity.x+=nx*impulse*ib;b.velocity.y+=ny*impulse*ib;b.velocity.z+=nz*impulse*ib;a.resting=b.resting=false;if(this.onSound&&Math.abs(rv)>.8)this.onSound('ball',Math.abs(rv)*2,a.position);}
      }
      this.impactEnergy*=Math.exp(-2.3*dt);
      if(!settling)this.constrainBodies();
    }

    constrainBodies(){
      const a=this.bodies[1],b=this.bodies[2];
      for(const body of [a,b]){
        const bounds=body.getBounds(),cx=(bounds.min[0]+bounds.max[0])*.5,cz=(bounds.min[2]+bounds.max[2])*.5;
        const home=body.center;
        for(let i=0;i<body.pos.length;i+=3){body.vel[i]+=(home[0]+(body.rest[i]-body.center[0])-body.pos[i])*.002;body.vel[i+2]+=(home[2]+(body.rest[i+2]-body.center[2])-body.pos[i+2])*.002;}
      }
    }
  }

  window.LabPhysics={SoftBody,JellyWorld,FLOOR,clamp};
})();
