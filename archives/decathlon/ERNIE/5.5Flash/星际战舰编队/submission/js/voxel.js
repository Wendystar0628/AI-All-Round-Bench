(function(){
'use strict';

const MAT = {
  HULL:0, HULL2:1, TRIM:2, DARK:3, CYAN:4, AMBER:5, WHITE:6, ORANGE:7, GLASS:8,
  AST:9, AST_DARK:10, AST_LIGHT:11, CRACK:12, FLOOR:13, WALL:14, GREEN:15,
  GOLD:16, RED:17, CORE:18, PORTAL:19
};
const MAT_DEF = [
  {c:[168,178,190], glow:0}, // HULL
  {c:[50,74,92],    glow:0}, // HULL2
  {c:[208,172,116], glow:0}, // TRIM
  {c:[15,21,29],    glow:0}, // DARK
  {c:[80,235,255],  glow:1}, // CYAN
  {c:[255,165,70],  glow:1}, // AMBER
  {c:[230,245,255], glow:1}, // WHITE
  {c:[255,110,50],  glow:1}, // ORANGE
  {c:[24,48,66],    glow:0}, // GLASS
  {c:[132,118,100], glow:0}, // AST
  {c:[82,72,60],    glow:0}, // AST_DARK
  {c:[172,154,130], glow:0}, // AST_LIGHT
  {c:[255,140,60],  glow:1}, // CRACK
  {c:[78,90,102],   glow:0}, // FLOOR
  {c:[50,62,74],    glow:0}, // WALL
  {c:[90,255,180],  glow:1}, // GREEN
  {c:[150,116,66],  glow:0}, // GOLD
  {c:[255,70,50],   glow:1}, // RED
  {c:[100,225,255], glow:1}, // CORE
  {c:[65,155,195], glow:1}  // PORTAL
];
const COLORS = MAT_DEF.map(m=>m.c);
const GLOWS = MAT_DEF.map(m=>m.glow);

/* ------------------------------------------------------------------ */
/* fast sparse voxel map                                               */
/* ------------------------------------------------------------------ */
class VoxelMap {
  constructor(cap){
    cap = cap || 1024;
    while(cap < 1024) cap <<= 1;
    this.cap = cap;
    this.mask = cap-1;
    this.keys = new Int32Array(cap); this.keys.fill(-1);
    this.vals = new Uint8Array(cap);
    this.count = 0;
  }
  _hash(k){
    let h = k | 0;
    h = Math.imul(h ^ (h>>>16), 0x45d9f3b);
    h = Math.imul(h ^ (h>>>16), 0x45d9f3b);
    h = h ^ (h>>>16);
    return h >>> 0;
  }
  _grow(){
    const oldK=this.keys, oldV=this.vals, oldCap=this.cap;
    let cap=oldCap<<1;
    const keys=new Int32Array(cap); keys.fill(-1);
    const vals=new Uint8Array(cap);
    const mask=cap-1;
    for(let i=0;i<oldCap;i++){
      const k=oldK[i];
      if(k===-1) continue;
      let idx=this._hash(k)&mask;
      while(keys[idx]!==-1) idx=(idx+1)&mask;
      keys[idx]=k; vals[idx]=oldV[i];
    }
    this.cap=cap; this.mask=mask; this.keys=keys; this.vals=vals;
  }
  set(x,y,z,mat){
    if(x < -512 || x > 511 || y < -512 || y > 511 || z < -2048 || z > 2047) return;
    const key = ((x+512) & 1023) | (((y+512) & 1023) << 10) | (((z+2048) & 4095) << 20);
    let idx = this._hash(key) & this.mask;
    while(true){
      const k = this.keys[idx];
      if(k === -1){ this.keys[idx]=key; this.vals[idx]=mat; this.count++; if(this.count > this.cap*0.62) this._grow(); return; }
      if(k === key){ this.vals[idx]=mat; return; }
      idx=(idx+1)&this.mask;
    }
  }
  get(x,y,z){
    if(x < -512 || x > 511 || y < -512 || y > 511 || z < -2048 || z > 2047) return -1;
    const key = ((x+512) & 1023) | (((y+512) & 1023) << 10) | (((z+2048) & 4095) << 20);
    let idx = this._hash(key) & this.mask;
    while(true){
      const k=this.keys[idx];
      if(k===-1) return -1;
      if(k===key) return this.vals[idx];
      idx=(idx+1)&this.mask;
    }
  }
  has(x,y,z){ return this.get(x,y,z) !== -1; }
}

/* ------------------------------------------------------------------ */
/* builder                                                             */
/* ------------------------------------------------------------------ */
class VoxelBuilder {
  constructor(){ this.map = new VoxelMap(4096); this.minx=0;this.miny=0;this.minz=0;this.maxx=0;this.maxy=0;this.maxz=0; }
  set(x,y,z,mat){
    this.map.set(x,y,z,mat);
    if(x<this.minx)this.minx=x; if(x>this.maxx)this.maxx=x;
    if(y<this.miny)this.miny=y; if(y>this.maxy)this.maxy=y;
    if(z<this.minz)this.minz=z; if(z>this.maxz)this.maxz=z;
  }
  box(x0,x1,y0,y1,z0,z1,mat){
    if(x1<x0||y1<y0||z1<z0) return;
    const m=this.map;
    for(let x=x0;x<x1;x++) for(let y=y0;y<y1;y++) for(let z=z0;z<z1;z++){
      m.set(x,y,z,mat);
      if(x<this.minx)this.minx=x; if(x>this.maxx)this.maxx=x;
      if(y<this.miny)this.miny=y; if(y>this.maxy)this.maxy=y;
      if(z<this.minz)this.minz=z; if(z>this.maxz)this.maxz=z;
    }
  }
  hollowBox(x0,x1,y0,y1,z0,z1,mat,t){
    t = t||2;
    this.box(x0,x1,y0,y0+t,z0,z1,mat);
    this.box(x0,x1,y1-t,y1,z0,z1,mat);
    this.box(x0,x0+t,y0+t,y1-t,z0,z1,mat);
    this.box(x1-t,x1,y0+t,y1-t,z0,z1,mat);
    this.box(x0+t,x1-t,y0+t,y1-t,z0,z0+t,mat);
    this.box(x0+t,x1-t,y0+t,y1-t,z1-t,z1,mat);
  }
  build(){
    const m=this.map, keys=m.keys, vals=m.vals, cap=m.cap;
    const pos=[], nor=[], col=[], glo=[], idx=[];
    const AO = [0.58,0.76,0.90,1.0];

    const faces = [
      {n:[1,0,0], c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]], ax:[1,2]},
      {n:[-1,0,0],c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]], ax:[1,2]},
      {n:[0,1,0], c:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]], ax:[0,2]},
      {n:[0,-1,0],c:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]], ax:[0,2]},
      {n:[0,0,1], c:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]], ax:[0,1]},
      {n:[0,0,-1],c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]], ax:[0,1]}
    ];
    const get = (x,y,z)=>m.get(x,y,z);
    const keyOf = (x,y,z)=>(((x+512)&1023) | (((y+512)&1023)<<10) | (((z+2048)&4095)<<20));

    for(let i=0;i<cap;i++){
      const key=keys[i];
      if(key===-1) continue;
      const mat=vals[i];
      const x=(key&1023)-512;
      const y=((key>>>10)&1023)-512;
      const z=((key>>>20)&4095)-2048;
      const def=COLORS[mat] || [255,0,255];
      const glow=GLOWS[mat];
      const jr = 0.94 + 0.12*((Math.imul(key,2654435761)>>>0)%1000)/1000;
      for(let fi=0;fi<6;fi++){
        const f=faces[fi];
        if(get(x+f.n[0], y+f.n[1], z+f.n[2]) !== -1) continue;
        const base=pos.length/3;
        const [a0,a1]=f.ax;
        for(let ci=0;ci<4;ci++){
          const cc=f.c[ci];
          let ao=3;
          if(!glow){
            const s0 = cc[a0]===0 ? -1 : 1;
            const s1 = cc[a1]===0 ? -1 : 1;
            const p0=[x+f.n[0],y+f.n[1],z+f.n[2]];
            p0[a0]+=s0;
            const p1=[x+f.n[0],y+f.n[1],z+f.n[2]];
            p1[a1]+=s1;
            const p2=[x+f.n[0],y+f.n[1],z+f.n[2]];
            p2[a0]+=s0; p2[a1]+=s1;
            const o0=get(p0[0],p0[1],p0[2])!==-1?1:0;
            const o1=get(p1[0],p1[1],p1[2])!==-1?1:0;
            const o2=get(p2[0],p2[1],p2[2])!==-1?1:0;
            ao = (o0&&o1) ? 0 : 3-(o0+o1+o2);
          }
          const shade = glow ? 1.0 : AO[ao];
          const j = glow ? 1.0 : jr;
          pos.push(x+cc[0], y+cc[1], z+cc[2]);
          nor.push(f.n[0], f.n[1], f.n[2]);
          col.push(Math.min(255, def[0]*shade*j), Math.min(255, def[1]*shade*j), Math.min(255, def[2]*shade*j));
          glo.push(glow?255:0);
        }
        idx.push(base,base+1,base+2, base,base+2,base+3);
      }
    }
    return {
      positions:new Float32Array(pos),
      normals:new Float32Array(nor),
      colors:new Uint8Array(col),
      glows:new Uint8Array(glo),
      indices:new Uint32Array(idx)
    };
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function hash2(x,z){
  let h = Math.imul(x|0, 374761393) + Math.imul(z|0, 668265263);
  h = Math.imul(h ^ (h>>>13), 1274126177);
  return ((h ^ (h>>>16))>>>0)/4294967295;
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a>>>15), 1 | a);
    t = (t + Math.imul(t ^ (t>>>7), 61 | t)) ^ t;
    return ((t ^ (t>>>14)) >>> 0)/4294967296;
  };
}
function addNozzle(vb, cx, cy, cz, r, depth, matRim, matCore){
  depth = depth || 8;
  const t=3;
  // ring bars
  vb.box(cx-r, cx+r, cy+r-t, cy+r, cz-depth, cz, matRim);
  vb.box(cx-r, cx+r, cy-r, cy-r+t, cz-depth, cz, matRim);
  vb.box(cx-r, cx-r+t, cy-r+t, cy+r-t, cz-depth, cz, matRim);
  vb.box(cx+r-t, cx+r, cy-r+t, cy+r-t, cz-depth, cz, matRim);
  // inner dark cavity
  vb.box(cx-r+t, cx+r-t, cy-r+t, cy+r-t, cz-depth-2, cz-1, MAT.DARK);
  // glowing core
  vb.box(cx-r+t+2, cx+r-t-2, cy-r+t+2, cy+r-t-2, cz-depth-4, cz-depth, matCore);
}
function addPulseTurret(vb, x, y, z, scale){
  scale = scale || 1;
  const s=scale;
  vb.box(x-12*s, x+12*s, y, y+8*s, z-12*s, z+12*s, MAT.HULL2);
  vb.box(x-9*s, x+9*s, y+8*s, y+14*s, z-9*s, z+9*s, MAT.HULL);
  vb.box(x-3*s, x+3*s, y+12*s, y+18*s, z+9*s, z+34*s, MAT.DARK);
  vb.box(x-4*s, x+4*s, y+13*s, y+17*s, z+32*s, z+35*s, MAT.CYAN);
}
function addCIWS(vb, x, y, z, scale){
  scale = scale || 1;
  const s=scale;
  vb.box(x-7*s, x+7*s, y, y+5*s, z-7*s, z+7*s, MAT.HULL2);
  vb.box(x-5*s, x+5*s, y+5*s, y+9*s, z-5*s, z+5*s, MAT.HULL);
  vb.box(x-2*s, x+2*s, y+7*s, y+11*s, z+4*s, z+18*s, MAT.DARK);
  vb.box(x-2*s, x+2*s, y+8*s, y+10*s, z+17*s, z+19*s, MAT.AMBER);
}
function addMissilePod(vb, x0, x1, y0, y1, z0, z1){
  vb.hollowBox(x0,x1,y0,y1,z0,z1,MAT.HULL2,2);
  const rows=3, cols=4;
  const dx=(x1-x0-4)/cols, dz=(z1-z0-4)/rows;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const px=Math.round(x0+2+(c+0.5)*dx);
    const pz=Math.round(z0+2+(r+0.5)*dz);
    vb.box(px-1, px+1, y0-1, y0+1, pz-1, pz+1, MAT.DARK);
    vb.box(px-1, px+1, y0-2, y0-1, pz-1, pz+1, MAT.AMBER);
  }
}

window.VOX = { MAT, MAT_DEF, COLORS, GLOWS, VoxelMap, VoxelBuilder, hash2, mulberry32, addNozzle, addPulseTurret, addCIWS, addMissilePod };
})();