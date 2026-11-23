// 开发期几何单元测试：node tools/test-geom.js
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global; global.document = {};
const root = path.join(__dirname, '..');
const load = (f) => vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
['js/core/util.js', 'js/core/fonts.js', 'js/geom/boolean.js', 'js/geom/path.js', 'js/geom/tri.js', 'js/geom/solid.js'].forEach(load);
for (const f of fs.readdirSync(path.join(root, 'data'))) if (f.startsWith('font_')) load('data/' + f);
MF.Fonts.init();
console.log('fonts', MF.Fonts.list.map(f => f.label + ':' + f.count).join(', '));
function meshArea(m) { let s = 0; const v = m.verts, t = m.tris; for (let i = 0; i < t.length; i += 3) { s += Math.abs((v[t[i+1]*2]-v[t[i]*2])*(v[t[i+2]*2+1]-v[t[i]*2+1]) - (v[t[i+1]*2+1]-v[t[i]*2+1])*(v[t[i+2]*2]-v[t[i]*2]))/2; } return s; }
function polyArea(cs) { return cs.reduce((a, c) => a + MF.Path.area(c.pts), 0); }
function watertight(m) { const e = new Map(); const t = m.idx; for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { const a = t[i+k], b = t[i+(k+1)%3]; const pa = [m.pos[a*3],m.pos[a*3+1],m.pos[a*3+2]].map(x=>x.toFixed(3)).join(','), pb = [m.pos[b*3],m.pos[b*3+1],m.pos[b*3+2]].map(x=>x.toFixed(3)).join(','); const key = pa < pb ? pa+'|'+pb : pb+'|'+pa; e.set(key, (e.get(key)||0) + (pa<pb?1:-1)); } let bad = 0; for (const v of e.values()) if (v !== 0) bad++; return bad; }
let t0 = Date.now();
for (const ch of '金永回国锻器固字一鼎') {
  const t1 = Date.now();
  const g = MF.Fonts.glyph('kai', ch);
  const u = MF.Fonts.outline('kai', ch);
  const strokesArea = g.strokes.reduce((a, s) => a + Math.abs(polyArea(s.contours)), 0);
  const m = MF.Tri.triangulate(u);
  const scaled = { type:'mesh2', verts: m.verts.map(x => x*400), tris: m.tris, loops: m.loops };
  const r = MF.Tri.refine(scaled, 14);
  const s3 = MF.Solid.extrude(r, 80, 6, 4, 2);
  console.log(ch, 'strokes', g.strokes.length, 'loops', u.length, 'holes', u.filter(c => MF.Path.area(c.pts) < 0).length, 'unionArea', polyArea(u).toFixed(4), 'sumStrokes', strokesArea.toFixed(4), 'triArea', meshArea(m).toFixed(4), 'refined v', r.verts.length/2, 't', r.tris.length/3, 'refArea', (meshArea(r)/160000).toFixed(4), 'solid v', s3.pos.length/3, 'open edges', watertight(s3), (Date.now()-t1)+'ms');
}
// 思源黑体
for (const ch of '金回锻A8') { const u = MF.Fonts.outline('hei', ch); const m = MF.Tri.triangulate(u); const n = MF.Bool.normalize(u, 'nonzero'); console.log('hei', ch, 'contours', u.length, 'area(nonzero union)', polyArea(n).toFixed(4), 'triArea', meshArea(m).toFixed(4)); }
// 布尔：两个矩形/圆
const A = MF.Path.flattenValue(MF.Path.rect(100, 100, 0, 0, 0)), B = MF.Path.flattenValue(MF.Path.ellipse(100, 100, 50, 0), 0.05);
for (const mode of ['union', 'intersect', 'difference', 'xor']) { const r = MF.Bool.op(A, B, mode); console.log(mode, 'loops', r.length, 'area', polyArea(r).toFixed(2)); }
// 期望：圆面积 7854；交 = 半圆 3927；并 = 10000+3927=13927；差 = 10000-3927=6073；异或=10000
const off = MF.Path.offset(A, 10, 'round'); console.log('offset +10 round area', polyArea(off).toFixed(1), '(期望', (120*120 - (400 - Math.PI*100)).toFixed(1), ')');
const off2 = MF.Path.offset(A, -10, 'miter'); console.log('offset -10 area', polyArea(off2).toFixed(1), '(期望 6400)');
const so = MF.Path.strokeOutline([{ pts: [0, 0, 100, 0, 100, 100], closed: false }], 20, 'round'); console.log('stroke outline area', polyArea(so).toFixed(1), '(≈', (200*20 + Math.PI*100 - 0).toFixed(1), '附近)');
// 修剪
const tr = MF.Path.trim(A, 0.25, 0.75, 0, 'each'); console.log('trim len', tr.reduce((a, c) => a + MF.Path.length(c), 0).toFixed(2), '(期望 200)');
const tr2 = MF.Path.trim(A, 0, 0.5, 0.9, 'each'); console.log('trim wrap len', tr2.reduce((a, c) => a + MF.Path.length(c), 0).toFixed(2), 'pieces', tr2.length);
// 形变（含孔）
const ga = MF.Fonts.outline('hei', '回'), gb = MF.Fonts.outline('hei', '日');
const mo = MF.Path.morph(ga, gb, 0.5); console.log('morph contours', mo.length, 'A', ga.length, 'B', gb.length, 'area', polyArea(MF.Bool.normalize(mo, 'evenodd')).toFixed(4));
// 图钉
{ const m = MF.Tri.refine(MF.Tri.triangulate(A), 12); const d = MF.Pins.deform(m, [{ rx: -40, ry: 0, x: -40, y: 0, rot: 0, scale: 1 }, { rx: 40, ry: 0, x: 60, y: -20, rot: 30, scale: 1.2 }], 15, 0.4); let flipped = 0; for (let i = 0; i < d.tris.length; i += 3) { const a = d.tris[i], b = d.tris[i+1], c = d.tris[i+2]; const cr = (d.verts[b*2]-d.verts[a*2])*(d.verts[c*2+1]-d.verts[a*2+1]) - (d.verts[b*2+1]-d.verts[a*2+1])*(d.verts[c*2]-d.verts[a*2]); if (cr <= 0) flipped++; } console.log('pins verts', d.verts.length/2, 'flipped tris', flipped, 'area', meshArea(d).toFixed(1)); }
console.log('total', Date.now() - t0, 'ms');
