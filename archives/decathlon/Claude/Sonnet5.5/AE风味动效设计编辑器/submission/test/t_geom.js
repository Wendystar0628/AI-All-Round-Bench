require('../js/util.js'); require('../js/geom.js');
const G = AE.G;
const sq = (x,y,s)=>[x,y,x+s,y,x+s,y+s,x,y+s];
let u = G.boolean([sq(0,0,10)],[sq(5,5,10)],'union'); console.log('union', u.length, u.map(p=>G.polyArea(p)));
let i = G.boolean([sq(0,0,10)],[sq(5,5,10)],'intersect'); console.log('inter', i.length, i.map(p=>G.polyArea(p)));
let d = G.boolean([sq(0,0,10)],[sq(5,5,10)],'diff'); console.log('diff', d.length, d.map(p=>G.polyArea(p)));
let h = G.boolean([sq(0,0,10)],[sq(3,3,4)],'diff'); console.log('hole', h.length, h.map(p=>G.polyArea(p)));
let same = G.boolean([sq(0,0,10)],[sq(0,0,10)],'union'); console.log('same', same.length, same.map(p=>G.polyArea(p)));
let adj = G.boolean([sq(0,0,10)],[sq(10,0,10)],'union'); console.log('adj', adj.length, adj.map(p=>G.polyArea(p)));
// stroke polygons union
const s1 = G.strokePolygon([0,0,100,0],10,'round'); const s2 = G.strokePolygon([50,-40,50,40],10,'butt');
console.log(G.polyArea(s1), G.polyArea(s2));
let r = G.resolve([s1,s2]); console.log('cross', r.length, r.map(p=>G.polyArea(p)), r[0].length/2);
const e = G.ellipseShape(100,60); const f = G.flattenShape(e); console.log('ell', f[0].pts.length/2, G.polyArea(f[0].pts));
