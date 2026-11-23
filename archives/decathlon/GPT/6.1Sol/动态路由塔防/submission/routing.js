'use strict';
const key=(x,z)=>x+','+z;
class Network {
 constructor(map){this.map=map;this.cells=new Map();this.nodes=[];this.pads=[];this.blocked=new Set();this.slow=new Set();this.cooldowns=new Map();
  const line=(l,fn)=>{let[x,z,ex,ez]=l;for(let i=0;i<100;i++){fn(x,z);if(x===ex&&z===ez)break;x+=Math.sign(ex-x);z+=Math.sign(ez-z);}};
  map.roads.forEach(l=>line(l,(x,z)=>{if(!this.cells.has(key(x,z)))this.cells.set(key(x,z),{x,z,k:key(x,z),type:'road',legacy:false});}));
  map.legacy.forEach(l=>line(l,(x,z)=>{const c=this.cells.get(key(x,z));if(c)c.legacy=true;}));
  map.nodes.forEach((n,i)=>{const c=this.cells.get(key(n.x,n.z));Object.assign(c,n,{type:'node',index:i});this.nodes.push(c);});
  map.entries.forEach((n,i)=>Object.assign(this.cells.get(key(n.x,n.z)),n,{type:'entry',entryIndex:i}));
  map.exits.forEach(n=>Object.assign(this.cells.get(key(n.x,n.z)),n,{type:'exit'}));
  map.pads.forEach(([x,z],i)=>{if(!this.cells.has(key(x,z))){const p={x,z,k:key(x,z),type:'pad',index:i};this.pads.push(p);}});
  this.routes=[];this.recalculate();
 }
 neighbors(c){return [[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>this.cells.get(key(c.x+x,c.z+z))).filter(Boolean);}
 weight(c,slow=this.slow){return c&&(c.legacy||slow.has(c.k))?1/.58:1;}
 edgeCost(a,b,slow=this.slow){return (this.weight(a,slow)+this.weight(b,slow))/2;}
 path(start,blocked=this.blocked,slow=this.slow,goal=null){
  const startKey=typeof start==='string'?start:key(start.x,start.z);if(!this.cells.has(startKey)||blocked.has(startKey))return null;
  const dist=new Map([[startKey,0]]),prev=new Map(),queue=[{k:startKey,d:0}],targets=new Set(goal?[goal]:this.map.exits.map(p=>key(p.x,p.z)));let end;
  while(queue.length){queue.sort((a,b)=>a.d-b.d);const q=queue.shift();if(q.d!==dist.get(q.k))continue;if(targets.has(q.k)){end=q.k;break;}
   for(const n of this.neighbors(this.cells.get(q.k))){if(blocked.has(n.k))continue;const nd=q.d+this.edgeCost(this.cells.get(q.k),n,slow);if(nd<(dist.get(n.k)??Infinity)-1e-8){dist.set(n.k,nd);prev.set(n.k,q.k);queue.push({k:n.k,d:nd});}}
  }if(!end)return null;const route=[];let c=end;while(c){route.unshift(this.cells.get(c));c=prev.get(c);}route.cost=dist.get(end);return route;
 }
 anchors(p){
  const raw=(p.edgeEnds||[p.cell,p.next]).filter(Boolean),unique=[...new Map(raw.map(c=>[c.k,c])).values()];
  if(unique.length===2){const[a,b]=unique,span=Math.hypot(a.x-b.x,a.z-b.z),d=Math.hypot(a.x-p.x,a.z-p.z)+Math.hypot(b.x-p.x,b.z-p.z);if(span>1.01||d>span+.12)return p.cell?[p.cell]:[];}
  return unique.length?unique:[this.cells.get(key(Math.round(p.x),Math.round(p.z)))].filter(Boolean);
 }
 pathFrom(p,blocked=this.blocked,slow=this.slow,goal=null){
  const anchors=this.anchors(p),edge=anchors.length===2?anchors:null,weight=edge?this.edgeCost(...edge,slow):this.weight(anchors[0],slow);let best=null;
  for(const c of anchors){const route=this.path(c,blocked,slow,goal);if(!route)continue;const partial=Math.hypot(c.x-p.x,c.z-p.z)*weight,cost=route.cost+partial;
   if(!best||cost<best.cost-1e-6||(Math.abs(cost-best.cost)<1e-6&&c.k===p.next?.k))best={route,anchor:c,cost,edge};
  }return best;
 }
 safePosition(p,blocked=this.blocked,slow=this.slow){
  if(p.flying)return true;
  for(const k of blocked){const c=this.cells.get(k);if(c&&Math.hypot(c.x-p.x,c.z-p.z)<.48)return false;}
  return p.cell?!!this.pathFrom(p,blocked,slow):!!this.path(p,blocked,slow);
 }
 preview(k,block=true,positions=[],slow=this.slow){const b=new Set(this.blocked);if(k){if(block)b.add(k);else b.delete(k);}const routes=this.map.entries.map(e=>this.path(e,b,slow));const fail=[];routes.forEach((r,i)=>{if(!r)fail.push(this.map.entries[i]);});for(const p of positions)if(!this.safePosition(p,b,slow))fail.push(p);return {valid:!fail.length,routes,blocked:b,slow,fail};}
 previewBlocks(keys,positions=[]){const blocked=new Set(this.blocked);keys.forEach(k=>blocked.add(k));const routes=this.map.entries.map(e=>this.path(e,blocked));const fail=[];routes.forEach((r,i)=>{if(!r)fail.push(this.map.entries[i]);});for(const p of positions)if(!this.safePosition(p,blocked))fail.push(p);return {valid:!fail.length,routes,blocked,slow:this.slow,fail};}
 recalculate(){
  this.routes=this.map.entries.map(e=>this.path(e));this.exitCosts=new Map();const q=[];
  for(const e of this.map.exits){const k=key(e.x,e.z);this.exitCosts.set(k,0);q.push({k,d:0});}
  while(q.length){q.sort((a,b)=>a.d-b.d);const at=q.shift();if(at.d!==this.exitCosts.get(at.k))continue;const c=this.cells.get(at.k);for(const next of this.neighbors(c)){if(this.blocked.has(next.k))continue;const d=at.d+this.edgeCost(c,next);if(d<(this.exitCosts.get(next.k)??Infinity)-1e-8){this.exitCosts.set(next.k,d);q.push({k:next.k,d});}}}
  return this.routes;
 }
 remaining(p){const a=this.anchors(p),w=a.length===2?this.edgeCost(...a):this.weight(a[0]);return Math.min(...a.filter(c=>!this.blocked.has(c.k)).map(c=>(this.exitCosts.get(c.k)??Infinity)+Math.hypot(c.x-p.x,c.z-p.z)*w));}
 nearest(x,z,types){let best=null,d=Infinity;for(const c of [...this.cells.values(),...this.pads]){if(types&&!types.includes(c.type))continue;const nd=Math.hypot(c.x-x,c.z-z);if(nd<d){best=c;d=nd;}}return d<.8?best:null;}
}
