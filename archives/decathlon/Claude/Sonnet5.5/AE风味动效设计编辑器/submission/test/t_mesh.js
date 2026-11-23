require('../js/util.js'); require('../js/geom.js'); require('../js/mesh.js');
const G = AE.G, Mesh = AE.Mesh;
// 带孔的方块 + 凹形
const outer=[0,0,100,0,100,100,0,100]; const hole=[30,30,30,70,70,70,70,30];
let t0=Date.now();
const m = Mesh.tessellate([outer,hole], 8);
console.log('tess', m.pos.length/3, m.idx.length/3, 'loops', m.loops.length, m.loops.map(l=>l.length), Date.now()-t0,'ms');
// 面积检查
let area=0; for(let t=0;t<m.idx.length;t+=3){const a=m.idx[t]*3,b=m.idx[t+1]*3,c=m.idx[t+2]*3; area+=0.5*((m.pos[b]-m.pos[a])*(m.pos[c+1]-m.pos[a+1])-(m.pos[b+1]-m.pos[a+1])*(m.pos[c]-m.pos[a]));}
console.log('area', area, 'expect', 10000-1600);
t0=Date.now();
const ex = Mesh.extrude(m,{depth:20,bevel:3,bevelSeg:2,depthSeg:2});
console.log('extrude', ex.pos.length/3, ex.idx.length/3, 'vol', Mesh.signedVolume(ex), Date.now()-t0,'ms');
const ex0 = Mesh.extrude(m,{depth:20,bevel:0});
console.log('extrude0 vol', Mesh.signedVolume(ex0), 'expect', 8400*20);
// L 形
const L=[0,0,60,0,60,20,20,20,20,100,0,100];
const m2=Mesh.tessellate([L],6); console.log('L', m2.pos.length/3, m2.idx.length/3, m2.loops.length);
// 大点数性能
const circ=[]; for(let i=0;i<200;i++){const a=i/200*Math.PI*2; circ.push(Math.cos(a)*300,Math.sin(a)*300);}
t0=Date.now(); const m3=Mesh.tessellate([circ],6); console.log('big', m3.pos.length/3, m3.idx.length/3, Date.now()-t0,'ms');
