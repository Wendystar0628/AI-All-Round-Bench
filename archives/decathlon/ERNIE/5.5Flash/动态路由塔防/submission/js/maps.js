/* ============================================================
 * 地图层：三张地图的网格、入口出口、装饰与路线校验
 * ============================================================ */
const MAPS = (() => {

const W = 21, H = 15;
const CH = { LINK:'.', NODE:'n', PLATFORM:'p', OLD:'o', BLOCK:'#' };

function blank(w=W,h=H){ return Array.from({length:h},()=>Array(w).fill(CH.BLOCK)); }
function set(g,x,z,ch){ if(x>=0&&z>=0&&x<g[0].length&&z<g.length) g[z][x]=ch; }
function rect(g,x0,z0,x1,z1,ch){ for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++) set(g,x,z,ch); }
function hline(g,z,x0,x1,ch){ rect(g,x0,z,x1,z,ch); }
function vline(g,x,z0,z1,ch){ rect(g,x,z0,x,z1,ch); }

const WALK = new Set([CH.LINK,CH.NODE,CH.OLD]);

function makeMap(def){
  const m = Object.assign({}, def);
  m.w=W; m.h=H;
  m.cell = (x,z)=> (x<0||z<0||x>=m.w||z>=m.h)?null:m.grid[z][x];
  m.walkable = (x,z)=> { const c=m.cell(x,z); return !!c && WALK.has(c); };
  m.buildable = (x,z)=> { const c=m.cell(x,z); return c===CH.PLATFORM; };
  m.world = (x,z)=> ({ x:(x-(m.w-1)/2)*m.tile, z:(z-(m.h-1)/2)*m.tile });
  m.entries.forEach(e=>{ e.cell=e.cell||e.at; e.world=m.world(e.cell[0],e.cell[1]); e.color=e.color||0x5ce9ff; });
  m.exits.forEach(e=>{ e.cell=e.cell||e.at; e.world=m.world(e.cell[0],e.cell[1]); });
  m.entryById = id=>m.entries.find(e=>e.id===id);
  m.exitById = id=>m.exits.find(e=>e.id===id);
  m.nodes = [];
  for(let z=0;z<m.h;z++) for(let x=0;x<m.w;x++) if(m.grid[z][x]===CH.NODE) m.nodes.push({x,z,world:m.world(x,z)});
  return m;
}

/* ---------------- 地图 1：分段内网 ---------------- */
function buildMap1(){
  const g = blank();
  // 北端入口动脉
  vline(g,3,0,4,'.'); vline(g,17,0,4,'.');
  // DMZ 互联
  hline(g,4,3,17,'.');
  // 中央主干
  vline(g,10,4,14,'.');
  // 西边界与旧系统
  vline(g,3,5,11,'.');
  rect(g,3,11,8,11,'.');
  vline(g,3,6,8,'.'); rect(g,4,6,6,8,'.');
  rect(g,6,8,7,8,'.'); vline(g,7,8,10,'o'); rect(g,7,11,7,11,'.');
  // 东边界与灾备环
  vline(g,17,5,11,'.');
  rect(g,12,11,17,11,'.');
  // 底部环
  rect(g,8,12,12,12,'.'); vline(g,8,11,12,'.'); vline(g,12,11,12,'.');
  // 交换节点
  set(g,5,4,'n'); set(g,15,4,'n'); set(g,10,9,'n'); set(g,10,11,'n');
  // 设备平台
  [[5,6],[6,6],[7,6],[12,6],[14,6],[9,8],[11,8],[5,12],[8,13],[12,13],[15,12],[1,6],[19,6],[8,3],[12,3],[6,10],[14,10]]
    .forEach(([x,z])=>{ if(g[z][x]!==CH.NODE) set(g,x,z,CH.PLATFORM); });
  // 数据设施障碍
  rect(g,5,2,7,2,'#'); rect(g,13,2,15,2,'#'); rect(g,1,8,1,9,'#'); rect(g,19,8,19,9,'#');
  rect(g,5,7,6,7,'#'); rect(g,14,7,15,7,'#');
  return makeMap({
    id:'map1', name:'分段内网', sub:'企业内网 · 14 波', grid:g, tile:4.2,
    theme:'enterprise',
    entries:[
      {id:'A', cell:[3,0], name:'门户网站', defaultExit:'X', color:0x5ce9ff},
      {id:'B', cell:[17,0], name:'邮件网关', defaultExit:'X', color:0xffb85c}
    ],
    exits:[{id:'X', cell:[10,14], name:'核心数据库'}],
    spawnCells:{A:[3,0],B:[17,0]}
  });
}

/* ---------------- 地图 2：骨干流域 ---------------- */
function buildMap2(){
  const g = blank();
  // 公网流带（不可通行），仅两个跨越点
  for(let x=0;x<21;x++) if(x!==8 && x!==13) set(g,x,7,'#');
  // 北侧
  hline(g,4,0,8,'.'); vline(g,8,4,10,'.');
  vline(g,7,0,2,'.'); vline(g,7,3,4,'.'); hline(g,4,7,13,'.');
  // A 的北环绕行
  vline(g,1,2,4,'.'); hline(g,2,1,5,'.'); vline(g,5,2,4,'.');
  // 旧专线
  vline(g,13,0,3,'.'); vline(g,13,4,10,'o');
  // B 入口与东西走廊
  hline(g,3,13,20,'.'); vline(g,20,3,4,'.'); hline(g,4,13,20,'.');
  rect(g,5,10,8,10,'.'); rect(g,13,10,16,10,'.'); rect(g,5,11,13,11,'.'); vline(g,5,10,11,'.'); vline(g,13,10,11,'.'); hline(g,3,13,20,'.'); hline(g,4,8,13,'.');
  // 南端与双活中心
  hline(g,10,5,16,'.');
  vline(g,5,10,10,'.');
  // 交换节点
  set(g,4,4,'n'); set(g,13,5,'n'); set(g,8,9,'n'); set(g,16,3,'n');
  // 设备平台
  [[2,6],[6,6],[10,6],[16,6],[2,9],[6,12],[10,12],[14,12],[18,9],[9,8],[7,8],[11,2],[15,2],[3,5],[17,5],[12,9]]
    .forEach(([x,z])=>{ if(g[z][x]!==CH.NODE) set(g,x,z,CH.PLATFORM); });
  // 数据中心设施
  rect(g,3,8,4,9,'#'); rect(g,6,8,6,9,'#'); rect(g,15,8,15,9,'#'); rect(g,17,8,17,9,'#');
  rect(g,4,1,6,1,'#'); rect(g,10,1,11,1,'#'); rect(g,16,1,18,1,'#');
  return makeMap({
    id:'map2', name:'骨干流域', sub:'跨网骨干 · 15 波', grid:g, tile:4.2,
    theme:'backbone',
    entries:[
      {id:'A', cell:[0,4], name:'互联网', defaultExit:'X', color:0x5ce9ff},
      {id:'B', cell:[20,3], name:'云端互联', defaultExit:'Y', color:0xb58cff},
      {id:'C', cell:[13,0], name:'分支专线', defaultExit:'Y', color:0xffb85c}
    ],
    exits:[
      {id:'X', cell:[5,10], name:'数据中心 X'},
      {id:'Y', cell:[16,10], name:'数据中心 Y'}
    ],
    spawnCells:{A:[0,4],B:[20,3],C:[13,0]}
  });
}

/* ---------------- 地图 3：气隙深层 ---------------- */
function buildMap3(){
  const g = blank();
  // 中央气隙
  rect(g,8,5,12,9,'#');
  // 运维环
  rect(g,5,4,15,4,'.'); rect(g,5,10,15,10,'.');
  vline(g,5,4,10,'.'); vline(g,15,4,10,'.');
  // 顶部备用走廊
  rect(g,5,2,15,2,'.'); vline(g,5,2,4,'.'); vline(g,15,2,4,'.');
  // 狭窄通道：左侧旧工控总线，右侧新通道
  vline(g,7,5,9,'o'); vline(g,13,5,9,'.');
  // 入口连接
  hline(g,3,0,5,'.'); vline(g,5,3,4,'.');
  vline(g,10,0,4,'.');
  hline(g,7,20,20,'.'); vline(g,20,4,7,'.'); hline(g,4,15,20,'.');
  // 出口连接
  vline(g,6,10,14,'.'); vline(g,14,10,14,'.');
  vline(g,5,10,13,'.'); hline(g,13,5,6,'.');
  vline(g,15,10,13,'.'); hline(g,13,14,15,'.');
  // 交换节点
  [[10,4],[12,4],[5,7],[15,7],[13,7],[6,10],[14,10]]
    .forEach(([x,z])=>set(g,x,z,'n'));
  // 设备平台
  [[2,4],[2,7],[2,10],[18,3],[18,7],[18,11],[8,12],[12,12],[7,11],[13,11],[3,12],[17,12],[4,12],[16,12]]
    .forEach(([x,z])=>{ if(g[z][x]!==CH.NODE) set(g,x,z,CH.PLATFORM); });
  // 设施
  rect(g,1,5,1,6,'#'); rect(g,19,5,19,6,'#'); rect(g,8,1,9,1,'#'); rect(g,11,1,12,1,'#');
  rect(g,9,6,11,8,'#'); rect(g,3,6,3,8,'#'); rect(g,17,6,17,8,'#');
  return makeMap({
    id:'map3', name:'气隙深层', sub:'工控网络 · 16 波', grid:g, tile:4.2,
    theme:'industrial',
    entries:[
      {id:'A', cell:[0,3], name:'运维跳板机', defaultExit:'X', color:0x5ce9ff},
      {id:'B', cell:[10,0], name:'办公网下行', defaultExit:'Y', color:0x6cf0a8},
      {id:'C', cell:[20,7], name:'供应商远程维护', defaultExit:'Y', color:0xffb85c}
    ],
    exits:[
      {id:'X', cell:[6,14], name:'过程控制核心'},
      {id:'Y', cell:[14,14], name:'安全联锁核心'}
    ],
    spawnCells:{A:[0,3],B:[10,0],C:[20,7]}
  });
}

const MAP_LIST = [buildMap1(), buildMap2(), buildMap3()];
const byId = id => MAP_LIST.find(m=>m.id===id);

/* ---------------- 路径搜索与校验 ---------------- */
function neighbors(m,x,z,opts={}){
  const out=[];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dz] of dirs){
    const nx=x+dx, nz=z+dz;
    if(!m.walkable(nx,nz)) continue;
    const c=m.cell(nx,nz);
    if(opts.blockedNodes && opts.blockedNodes.has(nx+','+nz)) continue;
    if(opts.lockedCells && opts.lockedCells.has(nx+','+nz)) continue;
    out.push([nx,nz,c]);
  }
  return out;
}

function findPath(m, start, goal, opts={}){
  if(!m.walkable(start[0],start[1])) return null;
  if(!m.walkable(goal[0],goal[1])) return null;
  const key=(x,z)=>x+','+z;
  const blocked = opts.blockedNodes || new Set();
  const locked = opts.lockedCells || new Set();
  if(blocked.has(key(goal[0],goal[1])) || locked.has(key(goal[0],goal[1]))) return null;
  if(blocked.has(key(start[0],start[1])) || locked.has(key(start[0],start[1]))) return null;
  const dist=new Map(), prev=new Map();
  const pq=[[0,start[0],start[1]]];
  dist.set(key(start[0],start[1]),0);
  while(pq.length){
    pq.sort((a,b)=>a[0]-b[0]);
    const [d,x,z]=pq.shift();
    if(d>dist.get(key(x,z))) continue;
    if(x===goal[0] && z===goal[1]){
      const path=[]; let cur=[x,z];
      while(cur){ path.push(cur); cur=prev.get(key(cur[0],cur[1])); }
      return path.reverse();
    }
    for(const [nx,nz,c] of neighbors(m,x,z,{blockedNodes:blocked,lockedCells:locked})){
      let cost = c===CH.OLD ? 2.0 : 1.0;
      if(opts.downgrade && opts.downgrade.has(key(nx,nz))) cost=4.0;
      const nd=d+cost, k=key(nx,nz);
      if(!dist.has(k) || nd<dist.get(k)-1e-9){
        dist.set(k,nd); prev.set(k,[x,z]);
        pq.push([nd,nx,nz]);
      }
    }
  }
  return null;
}

function routeKey(path){ return path? path.map(p=>p[0]+','+p[1]).join('|') : 'null'; }

function validateMap(m){
  const report={map:m.id, ok:true, issues:[], nodeChecks:[]};
  const base={};
  for(const e of m.entries){
    const p=findPath(m,e.cell,m.exitById(e.defaultExit).cell);
    base[e.id]=p;
    if(!p) { report.ok=false; report.issues.push('入口 '+e.id+' 基线无路径'); }
  }
  for(const node of m.nodes){
    const blocked=new Set([node.x+','+node.z]);
    let changed=0, broken=[];
    for(const e of m.entries){
      const p=findPath(m,e.cell,m.exitById(e.defaultExit).cell,{blockedNodes:blocked});
      const bp=base[e.id];
      if(!p){ broken.push(e.id); }
      else if(routeKey(p)!==routeKey(bp)){
        changed++;
      }
    }
    const ok=changed>0 && broken.length===0;
    if(!ok) report.ok=false;
    if(broken.length) report.issues.push('节点 '+node.x+','+node.z+' 隔离导致 '+broken.join('/')+' 无路径');
    if(!changed) report.issues.push('节点 '+node.x+','+node.z+' 隔离未改变任何入口路线');
    report.nodeChecks.push({x:node.x,z:node.z,changed,broken,ok});
  }
  return report;
}

function validateAll(){
  return MAP_LIST.map(m=>({id:m.id, ...validateMap(m)}));
}

return { MAP_LIST, byId, CH, findPath, validateMap, validateAll, neighbors };
})();