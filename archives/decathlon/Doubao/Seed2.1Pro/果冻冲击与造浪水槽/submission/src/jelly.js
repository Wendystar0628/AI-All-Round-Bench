'use strict';
/* =====================================================================
 * Volumetric soft-body jelly.
 * Interior discretized into uniform voxels; each voxel is split into
 * 6 Kuhn tetrahedra. XPBD solves distance constraints (lattice edges),
 * per-tetrahedron hydrostatic volume constraints and a component-level
 * near-incompressibility constraint.
 * Fracture: edges accumulate tensile plastic damage and break past a
 * toughness-dependent threshold; tetrahedra crossing broken edges are
 * deactivated, then nodes are duplicated per connected component, so
 * fracture faces appear from the material criterion (no pre-cutting).
 * ===================================================================== */

const JELLY_DENSITY = 1000;

const HEX_V = [
  [0,0,0],[1,0,0],[1,1,0],[0,1,0],
  [0,0,1],[1,0,1],[1,1,1],[0,1,1]
];
const KUHN_TETS = [
  [0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]
];
const TET_FACES = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]];

class JellyBody {
  constructor(opts){
    this.name=opts.name||'jelly';
    this.nx=opts.nx; this.ny=opts.ny; this.nz=opts.nz;
    this.h=opts.h;
    this.origin=opts.origin.clone();
    this.shape=opts.shape;
    this.softness=opts.softness??0.5;
    this.toughness=opts.toughness??0.55;
    this.color=new THREE.Color(opts.color||0xff5f8a);
    // art-tuned density so a 2-36 kg "heavy ball" deforms but does not
    // trivially tunnel through the lattice
    this.density=(opts.density||JELLY_DENSITY)*60;
    this.friction=0.55;

    this.nnodes=(this.nx+1)*(this.ny+1)*(this.nz+1);
    this.nidx=(i,j,k)=> (i*(this.ny+1)+j)*(this.nz+1)+k;
    this.nodeUsed=new Uint8Array(this.nnodes);
    this.basePos=new Array(this.nnodes);
    for(let i=0;i<=this.nx;i++)for(let j=0;j<=this.ny;j++)for(let k=0;k<=this.nz;k++){
      const inside=this.shape(i/this.nx,j/this.ny,k/this.nz);
      const id=this.nidx(i,j,k);
      if(inside){
        this.nodeUsed[id]=1;
        this.basePos[id]=this.origin.clone().add(APP.V3(i*this.h,j*this.h,k*this.h));
      }
    }

    this.tets=[];
    const hexVol=this.h*this.h*this.h;
    const tetMass=this.density*hexVol/6;
    for(let ci=0;ci<this.nx;ci++)for(let cj=0;cj<this.ny;cj++)for(let ck=0;ck<this.nz;ck++){
      for(const quad of KUHN_TETS){
        const ids=quad.map(q=>{
          const [a,b,c]=HEX_V[q];
          return this.nidx(ci+a,cj+b,ck+c);
        });
        if(!ids.every(id=>this.nodeUsed[id])) continue;
        let cx=0,cy=0,cz=0;
        ids.forEach(id=>{const p=this.basePos[id];cx+=p.x;cy+=p.y;cz+=p.z;});
        cx/=4;cy/=4;cz/=4;
        const lx=(cx-this.origin.x)/this.h/this.nx,
              ly=(cy-this.origin.y)/this.h/this.ny,
              lz=(cz-this.origin.z)/this.h/this.nz;
        if(!this.shape(lx,ly,lz)) continue;
        const c=ids.slice();
        this.tets.push({c, rest:this._tetVolP(c.map(id=>this.basePos[id])), active:true, m:tetMass});
      }
    }

    this.nodeMass=new Float64Array(this.nnodes);
    this.tets.forEach(t=>{ if(t.active) for(const id of t.c) this.nodeMass[id]+=t.m/4; });

    // compact used nodes into contiguous sites; remap tetra node ids
    this._oldToSite=new Int32Array(this.nnodes); this._oldToSite.fill(-1);
    const usedIds=[];
    for(let id=0;id<this.nnodes;id++) if(this.nodeUsed[id]){ this._oldToSite[id]=usedIds.length; usedIds.push(id); }
    this.tets.forEach(t=>{ t.c=t.c.map(id=>this._oldToSite[id]); });
    this.siteCount=usedIds.length;
    this.pos=usedIds.map(id=>this.basePos[id].clone());
    this.vel=usedIds.map(()=>APP.V3());
    this.invMass=usedIds.map(id=>this.nodeMass[id]>1e-9?1/this.nodeMass[id]:0);

    this.originOfSite=Int32Array.from(usedIds);
    this.nodeOfSite=Int32Array.from(usedIds);
    this.siteOfNode=new Int32Array(this.nnodes); this.siteOfNode.fill(-1);
    usedIds.forEach((id,s)=>this.siteOfNode[id]=s);

    const edgeMap=new Map();
    this.edges=[];
    const addEdge=(a,b)=>{
      const oa=usedIds[a], ob=usedIds[b];
      const key=oa<ob?oa*this.nnodes+ob:ob*this.nnodes+oa;
      if(!edgeMap.has(key)){
        const rest=this.pos[a].distanceTo(this.pos[b]);
        edgeMap.set(key,1); this.edges.push({a,b,rest,damage:0,alive:true});
      }
    };
    this.tets.forEach(t=>{
      for(let i=0;i<4;i++)for(let j=i+1;j<4;j++) addEdge(t.c[i],t.c[j]);
    });

    this.faceHash=new Map();
    this.tets.forEach((t,ti)=>{
      const oc=t.c.map(s=>usedIds[s]);
      for(let f=0;f<4;f++){
        const tri=[oc[TET_FACES[f][0]],oc[TET_FACES[f][1]],oc[TET_FACES[f][2]]].sort((a,b)=>a-b);
        const key=tri[0]*1000000007+tri[1]*100003+tri[2];
        if(!this.faceHash.has(key)) this.faceHash.set(key,[]);
        this.faceHash.get(key).push(ti);
      }
    });

    this.components=[0];
    this.siteComp=new Int8Array(this.siteCount);
    this.topologyDirty=false;
    this.fractureCount=0;
    this.maxCompress=0;
    this._boingArmed=false;
    this._lastFracture=-1;
  }

  _tetVolP(pp){
    const a=pp[0],b=pp[1],c=pp[2],d=pp[3];
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z;
    const vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
    const wx=d.x-a.x,wy=d.y-a.y,wz=d.z-a.z;
    return Math.abs((ux*(vy*wz-vz*wy)-uy*(vx*wz-vz*wx)+uz*(vx*wy-vy*wx))/6);
  }

  stiffnessAlpha(){
    // XPBD edge compliance (1/stiffness). Tuned against substep dt~0.0052.
    const s=this.softness;
    return 0.025*Math.pow(s/0.5,2.2);
  }
  breakStretch(){ return 1.35 + this.toughness*0.75; }

  rebuildTopology(){
    const n=this.nnodes;
    const parent=new Int32Array(n); for(let i=0;i<n;i++)parent[i]=i;
    const find=x=>{ while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];} return x; };
    const union=(a,b)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent[rb]=ra;};
    this.tets.forEach(t=>{ if(t.active){
      const oc=t.c.map(s=>this.originOfSite[s]);
      for(let i=1;i<4;i++) union(oc[0],oc[i]);
    }});
    const rootOf=new Int32Array(n); rootOf.fill(-1);
    const compList=[];
    for(let id=0;id<n;id++) if(this.nodeUsed[id]){
      const r=find(id); rootOf[id]=r;
      if(!compList.includes(r)) compList.push(r);
    }
    compList.sort((a,b)=>a-b);
    const compIndex=new Map(); compList.forEach((r,i)=>compIndex.set(r,i));
    const ncomp=compList.length;

    const oldPos=this.pos, oldVel=this.vel, oldInv=this.invMass, oldOrigin=this.originOfSite;

    const tetComp=new Int8Array(this.tets.length);
    this.tets.forEach((t,ti)=>{ if(t.active){
      tetComp[ti]=compIndex.get(rootOf[oldOrigin[t.c[0]]]);
      t._ci=tetComp[ti];
    }});
    const nodeComps=Array.from({length:n},()=>new Set());
    this.tets.forEach((t,ti)=>{ if(t.active){
      const ci=tetComp[ti];
      for(const s of t.c) nodeComps[oldOrigin[s]].add(ci);
    }});

    const newPos=[],newVel=[],newInv=[],newOrigin=[];
    const siteKey=new Map();
    const mainSiteOfNode=new Int32Array(n); mainSiteOfNode.fill(-1);
    for(let id=0;id<n;id++){
      if(!this.nodeUsed[id]) continue;
      const comps=[...nodeComps[id]];
      if(comps.length===0) continue;
      comps.forEach((ci)=>{
        const sid=newPos.length;
        const src=this.siteOfNode[id]>=0?this.siteOfNode[id]:0;
        newPos.push(oldPos[src]?oldPos[src].clone():APP.V3());
        newVel.push(oldVel[src]?oldVel[src].clone():APP.V3());
        newInv.push(oldInv[src]||0);
        newOrigin.push(id);
        siteKey.set(id*16+ci,sid);
        if(mainSiteOfNode[id]<0) mainSiteOfNode[id]=sid;
      });
    }
    this.tets.forEach((t,ti)=>{
      if(!t.active) return;
      const ci=tetComp[ti];
      t.c=t.c.map(s=>{
        const k=siteKey.get(oldOrigin[s]*16+ci);
        return k===undefined?0:k;
      });
      t._ci=ci;
    });
    this.edges.forEach(e=>{
      const oa=oldOrigin[e.a], ob=oldOrigin[e.b];
      const ca=nodeComps[oa]?[...nodeComps[oa]]:[], cb=nodeComps[ob]?[...nodeComps[ob]]:[];
      const sa=mainSiteOfNode[oa], sb=mainSiteOfNode[ob];
      e.a=sa; e.b=sb;
      if(sa<0||sb<0){ e.alive=false; return; }
      const same=ca.some(c=>cb.includes(c));
      if(!same) e.alive=false;
    });
    const compAcc=Array.from({length:ncomp},()=>({vx:0,vy:0,vz:0,w:0}));
    this.tets.forEach((t,ti)=>{ if(t.active){
      const a=compAcc[tetComp[ti]]; if(!a) return;
      for(const s of t.c){ if(!newVel[s]) continue;
        a.vx+=newVel[s].x*0.25; a.vy+=newVel[s].y*0.25; a.vz+=newVel[s].z*0.25; a.w+=0.25; }
    }});
    for(let id=0;id<n;id++){
      const comps=[...nodeComps[id]];
      if(comps.length>1){
        comps.forEach((ci,k)=>{
          if(k===0) return;
          const sid=siteKey.get(id*16+ci);
          const a=compAcc[ci];
          if(a.w>0) newVel[sid].set(a.vx/a.w,a.vy/a.w,a.vz/a.w);
        });
      }
    }

    this.pos=newPos; this.vel=newVel; this.invMass=newInv;
    this.originOfSite=Int32Array.from(newOrigin);
    this.nodeOfSite=Int32Array.from(newOrigin);
    this.siteOfNode=mainSiteOfNode;
    this.siteComp=new Int8Array(newPos.length);
    this.tets.forEach((t,ti)=>{ if(t.active) for(const s of t.c) if(s<newPos.length) this.siteComp[s]=tetComp[ti]; });
    this.components=[...Array(ncomp).keys()];
    this.siteCount=newPos.length;
    this.topologyDirty=true;
  }

  buildFaces(){
    this.fragFaces=this.components.map(()=>[]);
    const compCache=this.tets.map((t)=>t.active?this.siteComp[t.c[0]]:-1);
    this.tets.forEach((t,ti)=>{
      if(!t.active) return;
      const myComp=compCache[ti];
      const oc=t.c.map(s=>this.originOfSite[s]);
      for(let f=0;f<4;f++){
        const F=TET_FACES[f];
        const tri=[oc[F[0]],oc[F[1]],oc[F[2]]].sort((a,b)=>a-b);
        const key=tri[0]*1000000007+tri[1]*100003+tri[2];
        const nbrs=this.faceHash.get(key)||[];
        let exposed=true;
        for(const nj of nbrs){ if(nj!==ti && this.tets[nj].active && compCache[nj]===myComp){ exposed=false; break; } }
        if(exposed) this.fragFaces[myComp].push([t.c[F[0]],t.c[F[1]],t.c[F[2]]]);
      }
    });
  }
}

/* ============================ World ============================ */

class JellyWorld {
  constructor(){
    this.bodies=[];
    this.balls=[];
    this.groundY=0;
    this.bounds={minX:-2.6,maxX:2.6,minZ:-1.8,maxZ:1.8};
    this.events=[];
    this.time=0;
  }
  addBody(b){ this.bodies.push(b); return b; }
  addBall(o){
    const b=Object.assign({r:0.18,m:8,pos:APP.V3(),vel:APP.V3(),rest:0.3,
      mesh:null,kind:'metal'},o);
    this.balls.push(b); return b;
  }
  step(dt){
    const sub=4, h=dt/sub;
    for(let s=0;s<sub;s++) this._substep(h);
    this.time+=dt;
  }

  _substep(dt){
    const ev=this.events; ev.length=0;
    for(const body of this.bodies){
      const damp=Math.pow(0.992,dt*60);
      for(let s=0;s<body.siteCount;s++){
        if(body.invMass[s]===0) continue;
        body.vel[s].y -= APP.G*dt;
        body.vel[s].multiplyScalar(damp);
      }
    }
    for(const ball of this.balls) if(ball.active) ball.vel.y -= APP.G*dt;

    for(const body of this.bodies){
      body._p0=new Array(body.siteCount);
      for(let s=0;s<body.siteCount;s++){
        body._p0[s]=body.pos[s].clone();
        body.pos[s].addScaledVector(body.vel[s],dt);
      }
    }
    for(const ball of this.balls) if(ball.active) ball.pos.addScaledVector(ball.vel,dt);

    const ITER=7;
    for(let it=0;it<ITER;it++){
      for(const body of this.bodies){
        const alpha=body.stiffnessAlpha();
        const tilde=alpha/(dt*dt);
        for(const e of body.edges){
          if(!e.alive) continue;
          const a=e.a,b=e.b;
          const pa=body.pos[a],pb=body.pos[b];
          const dx=pb.x-pa.x,dy=pb.y-pa.y,dz=pb.z-pa.z;
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
          if(len<1e-9) continue;
          const stretch=len/e.rest;
          if(it===0 && stretch>1.0){
            const over=stretch-1.0;
            e.damage += over*over*dt*(0.25+(1-body.toughness)*1.1);
            if(e.damage > (1.25-body.toughness*1.05) && stretch>body.breakStretch()-0.05){
              e.alive=false;
              ev.push({type:'crack',pos:pa.clone().lerp(pb,0.5),intensity:APP.clamp((stretch-1)*2,0.2,1)});
            }
          }
          if(!e.alive) continue;
          const wa=body.invMass[a],wb=body.invMass[b],wsum=wa+wb;
          if(wsum===0) continue;
          const C=len-e.rest;
          const kp=stretch>1?1:0.96;
          const dC=-C*kp/(wsum+tilde);
          const nx=dx/len,ny=dy/len,nz=dz/len;
          pa.x-=wa*dC*nx;pa.y-=wa*dC*ny;pa.z-=wa*dC*nz;
          pb.x+=wb*dC*nx;pb.y+=wb*dC*ny;pb.z+=wb*dC*nz;
        }
      }

      if(it%2===0){
        for(const body of this.bodies){
          for(const t of body.tets){
            if(!t.active) continue;
            const p0=body.pos[t.c[0]],p1=body.pos[t.c[1]],p2=body.pos[t.c[2]],p3=body.pos[t.c[3]];
            const w0=body.invMass[t.c[0]],w1=body.invMass[t.c[1]],w2=body.invMass[t.c[2]],w3=body.invMass[t.c[3]];
            if(w0+w1+w2+w3===0) continue;
            const av=Math.abs(this._tetVol(p0,p1,p2,p3));
            if(av<1e-14) continue;
            const g=[
              this._tGrad(p3,p2,p1),
              this._tGrad(p0,p3,p2),
              this._tGrad(p1,p0,p3),
              this._tGrad(p2,p1,p0)
            ];
            const gn=w0*g[0].lengthSq()+w1*g[1].lengthSq()+w2*g[2].lengthSq()+w3*g[3].lengthSq();
            if(gn<1e-14) continue;
            const dlam=(t.rest-av)*0.10/gn;
            p0.addScaledVector(g[0],w0*dlam);p1.addScaledVector(g[1],w1*dlam);
            p2.addScaledVector(g[2],w2*dlam);p3.addScaledVector(g[3],w3*dlam);
          }
        }
      }

      if(it===1||it===4){
        for(const body of this.bodies){
          for(const ci of body.components){
            let vol=0;
            for(const t of body.tets) if(t.active && body.siteComp[t.c[0]]===ci)
              vol+=Math.abs(this._tetVol(body.pos[t.c[0]],body.pos[t.c[1]],body.pos[t.c[2]],body.pos[t.c[3]]));
            const rest=this._compRestVol(body,ci);
            const ratio=(vol-rest)/rest;
            if(Math.abs(ratio)<0.004) continue;
            let cx=0,cy=0,cz=0,tw=0;
            for(let s=0;s<body.siteCount;s++) if(body.siteComp[s]===ci&&body.invMass[s]>0){
              cx+=body.pos[s].x;cy+=body.pos[s].y;cz+=body.pos[s].z;tw++;
            }
            if(tw===0) continue; cx/=tw;cy/=tw;cz/=tw;
            const k=0.10;
            for(let s=0;s<body.siteCount;s++) if(body.siteComp[s]===ci&&body.invMass[s]>0){
              body.pos[s].x+=(cx-body.pos[s].x)*ratio*k;
              body.pos[s].y+=(cy-body.pos[s].y)*ratio*k;
              body.pos[s].z+=(cz-body.pos[s].z)*ratio*k;
            }
          }
        }
      }

      for(const body of this.bodies){
        for(let s=0;s<body.siteCount;s++){
          const p=body.pos[s]; if(body.invMass[s]===0) continue;
          if(p.y<this.groundY) p.y=this.groundY;
          if(p.x<this.bounds.minX)p.x=this.bounds.minX;
          if(p.x>this.bounds.maxX)p.x=this.bounds.maxX;
          if(p.z<this.bounds.minZ)p.z=this.bounds.minZ;
          if(p.z>this.bounds.maxZ)p.z=this.bounds.maxZ;
        }
      }

      for(const ball of this.balls){
        if(!ball.active) continue;
        for(const body of this.bodies){
          const rr=ball.r+body.h*0.55, r2=rr*rr;
          for(let s=0;s<body.siteCount;s++){
            if(body.invMass[s]===0) continue;
            const p=body.pos[s];
            const dx=p.x-ball.pos.x,dy=p.y-ball.pos.y,dz=p.z-ball.pos.z;
            const d2=dx*dx+dy*dy+dz*dz;
            if(d2>r2||d2<1e-12) continue;
            const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,nz=dz/d,pen=rr-d;
            const wn=body.invMass[s];
            p.x+=nx*pen*0.9;p.y+=ny*pen*0.9;p.z+=nz*pen*0.9;
            const wb=1/ball.m,total=wn+wb;
            ball.pos.x-=nx*pen*(wb/total)*0.9;
            ball.pos.y-=ny*pen*(wb/total)*0.9;
            ball.pos.z-=nz*pen*(wb/total)*0.9;
            const rvx=ball.vel.x-body.vel[s].x,rvy=ball.vel.y-body.vel[s].y,rvz=ball.vel.z-body.vel[s].z;
            const vn=rvx*nx+rvy*ny+rvz*nz;
            if(vn<0){
              const e=0.12,jimp=-(1+e)*vn/total;
              body.vel[s].x-=jimp*wn*nx;body.vel[s].y-=jimp*wn*ny;body.vel[s].z-=jimp*wn*nz;
              ball.vel.x+=jimp*wb*nx;ball.vel.y+=jimp*wb*ny;ball.vel.z+=jimp*wb*nz;
              const sp=-vn;
              if(sp>0.9&&it===0) ball._hit=Math.max(ball._hit||0,APP.clamp(sp/7,0.15,1));
              if(sp>3.2&&it===0) body.maxCompress=Math.max(body.maxCompress,APP.clamp(sp/9,0,1));
            }
          }
        }
        if(ball.pos.y-ball.r<this.groundY){
          ball.pos.y=this.groundY+ball.r;
          if(ball.vel.y<0){
            if(it===0&&-ball.vel.y>1.1) ball._groundHit=APP.clamp(-ball.vel.y/7,0.2,1);
            ball.vel.y=-ball.vel.y*ball.rest;
            ball.vel.x*=0.85;ball.vel.z*=0.85;
          }
        }
        if(ball.pos.x<this.bounds.minX+ball.r){ball.pos.x=this.bounds.minX+ball.r;ball.vel.x=Math.abs(ball.vel.x)*0.5;}
        if(ball.pos.x>this.bounds.maxX-ball.r){ball.pos.x=this.bounds.maxX-ball.r;ball.vel.x=-Math.abs(ball.vel.x)*0.5;}
        if(ball.pos.z<this.bounds.minZ+ball.r){ball.pos.z=this.bounds.minZ+ball.r;ball.vel.z=Math.abs(ball.vel.z)*0.5;}
        if(ball.pos.z>this.bounds.maxZ-ball.r){ball.pos.z=this.bounds.maxZ-ball.r;ball.vel.z=-Math.abs(ball.vel.z)*0.5;}
      }

      for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++){
        const A=this.balls[i],B=this.balls[j]; if(!A.active||!B.active) continue;
        const dx=B.pos.x-A.pos.x,dy=B.pos.y-A.pos.y,dz=B.pos.z-A.pos.z;
        const d2=dx*dx+dy*dy+dz*dz,rr=A.r+B.r;
        if(d2>rr*rr||d2<1e-12) continue;
        const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,nz=dz/d,pen=rr-d;
        const wa=1/A.m,wb=1/B.m,tt=wa+wb;
        A.pos.x-=nx*pen*(wa/tt);A.pos.y-=ny*pen*(wa/tt);A.pos.z-=nz*pen*(wa/tt);
        B.pos.x+=nx*pen*(wb/tt);B.pos.y+=ny*pen*(wb/tt);B.pos.z+=nz*pen*(wb/tt);
        const rvx=B.vel.x-A.vel.x,rvy=B.vel.y-A.vel.y,rvz=B.vel.z-A.vel.z;
        const vn=rvx*nx+rvy*ny+rvz*nz;
        if(vn<0){
          const e=0.45,jimp=-(1+e)*vn/tt;
          A.vel.x-=jimp*wa*nx;A.vel.y-=jimp*wa*ny;A.vel.z-=jimp*wa*nz;
          B.vel.x+=jimp*wb*nx;B.vel.y+=jimp*wb*ny;B.vel.z+=jimp*wb*nz;
          if(it===0&&-vn>1.0) A._clink=Math.max(A._clink||0,APP.clamp(-vn/6,0.2,1));
        }
      }
      this._jellyJelly();
    }

    for(const body of this.bodies){
      for(let s=0;s<body.siteCount;s++){
        if(body.invMass[s]===0) continue;
        body.vel[s].subVectors(body.pos[s],body._p0[s]).multiplyScalar(1/dt);
        if(body.pos[s].y<=this.groundY+1e-4){
          body.vel[s].x*=0.89; body.vel[s].z*=0.89;
        }
      }
      let broke=false;
      for(const e of body.edges){
        if(e.alive===false&&!e._handled){
          e._handled=true; broke=true;
          const oa=body.originOfSite[e.a]!==undefined?body.originOfSite[e.a]:-1;
          const ob=body.originOfSite[e.b]!==undefined?body.originOfSite[e.b]:-1;
          if(oa<0||ob<0) continue;
          const ka=oa<ob?oa*body.nnodes+ob:ob*body.nnodes+oa;
          for(const t of body.tets){
            if(!t.active) continue;
            const oc=t.c.map(s=>body.originOfSite[s]);
            for(let i=0;i<4&&t.active;i++)for(let j=i+1;j<4;j++){
              const x=oc[i]<oc[j]?oc[i]*body.nnodes+oc[j]:oc[j]*body.nnodes+oc[i];
              if(x===ka){ t.active=false; break; }
            }
          }
        }
      }
      if(broke){ body.rebuildTopology(); body.fractureCount++; }
      if(body.maxCompress>0.25&&!body._boingArmed){
        let kinetic=0;
        for(let s=0;s<body.siteCount;s++){const v=body.vel[s];kinetic+=v.x*v.x+v.y*v.y+v.z*v.z;}
        kinetic/=Math.max(1,body.siteCount);
        if(kinetic>1.2){ body._boingArmed=true; body._boingT=0.12; }
      }
      if(body._boingArmed){
        body._boingT-=dt;
        if(body._boingT<=0){
          ev.push({type:'boing',
            pos:APP.V3(body.origin.x+body.nx*body.h*0.5,body.origin.y+body.ny*body.h*0.7,body.origin.z),
            intensity:body.maxCompress});
          body._boingArmed=false; body.maxCompress*=0.4;
        }
      }
      body.maxCompress*=0.9;
    }

    for(const ball of this.balls){
      if(ball._hit){ ev.push({type:'impact',pos:ball.pos.clone(),intensity:ball._hit}); ball._hit=0; }
      if(ball._groundHit){ ev.push({type:'thud',pos:ball.pos.clone(),intensity:ball._groundHit}); ball._groundHit=0; }
      if(ball._clink){ ev.push({type:'clink',pos:ball.pos.clone(),intensity:ball._clink}); ball._clink=0; }
      if(ball.active&&ball.mesh) ball.mesh.position.copy(ball.pos);
    }
  }

  _jellyJelly(){
    if(this.bodies.length<2) return;
    const cs=0.075;
    const byKey=new Map();
    const key=(x,y,z)=> Math.floor(x/cs)*73856093 ^ Math.floor(y/cs)*19349663 ^ Math.floor(z/cs)*83492791;
    const items=[];
    this.bodies.forEach((body,bi)=>{
      for(let s=0;s<body.siteCount;s++){
        if(body.invMass[s]===0) continue;
        const p=body.pos[s], k=key(p.x,p.y,p.z);
        const itm={bi,s,p,k}; items.push(itm);
        if(!byKey.has(k)) byKey.set(k,[]);
        byKey.get(k).push(itm);
      }
    });
    const minD=cs*0.9;
    for(const itm of items){
      const cx=Math.floor(itm.p.x/cs),cy=Math.floor(itm.p.y/cs),cz=Math.floor(itm.p.z/cs);
      for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(let oz=-1;oz<=1;oz++){
        const k=(cx+ox)*73856093 ^ (cy+oy)*19349663 ^ (cz+oz)*83492791;
        const arr=byKey.get(k); if(!arr) continue;
        for(const o of arr){
          if(o.bi===itm.bi) continue;
          const a=this.bodies[itm.bi],b=this.bodies[o.bi];
          const pa=itm.p,pb=o.p;
          const dx=pb.x-pa.x,dy=pb.y-pa.y,dz=pb.z-pa.z;
          const d2=dx*dx+dy*dy+dz*dz;
          if(d2>minD*minD||d2<1e-12) continue;
          const d=Math.sqrt(d2),pen=(minD-d)*0.5,nx=dx/d,ny=dy/d,nz=dz/d;
          pa.x-=nx*pen;pa.y-=ny*pen;pa.z-=nz*pen;
          pb.x+=nx*pen;pb.y+=ny*pen;pb.z+=nz*pen;
        }
      }
    }
  }

  _tetVol(p0,p1,p2,p3){
    const ux=p1.x-p0.x,uy=p1.y-p0.y,uz=p1.z-p0.z;
    const vx=p2.x-p0.x,vy=p2.y-p0.y,vz=p2.z-p0.z;
    const wx=p3.x-p0.x,wy=p3.y-p0.y,wz=p3.z-p0.z;
    return (ux*(vy*wz-vz*wy)-uy*(vx*wz-vz*wx)+uz*(vx*wy-vy*wx))/6;
  }
  _tGrad(a,b,c){
    const ux=b.x-c.x,uy=b.y-c.y,uz=b.z-c.z;
    const vx=a.x-c.x,vy=a.y-c.y,vz=a.z-c.z;
    return APP.V3(
      (uy*vz-uz*vy)/6,
      (uz*vx-ux*vz)/6,
      (ux*vy-uy*vx)/6
    );
  }
  _compRestVol(body,ci){
    if(body._rvCount!==body.components.length||body.topologyDirty){
      body._rvCount=body.components.length;
      const vols=new Float64Array(body.components.length);
      for(const t of body.tets) if(t.active){
        const c=t.c.map(s=>body.basePos[body.nodeOfSite[s]]);
        if(c.every(p=>p)) vols[body.siteComp[t.c[0]]]+=Math.abs(this._tetVol(c[0],c[1],c[2],c[3]));
      }
      body._restVol=vols;
    }
    return body._restVol[ci]||1;
  }
}

window.JELLY={JellyBody,JellyWorld,JELLY_DENSITY,KUHN_TETS,HEX_V,TET_FACES};
