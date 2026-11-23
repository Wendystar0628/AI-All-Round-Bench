require('../js/util.js'); require('../js/geom.js'); require('../js/mesh.js'); require('../js/font.js');
const F=AE.Font, G=AE.G;
let t0=Date.now();
for (const ch of F.strokeChars){ const g=F.glyph('forge',ch); if(!g.polys.length) console.log('empty',ch); }
console.log('all glyphs', F.strokeChars.length, Date.now()-t0,'ms');
const g=F.glyph('forge','金'); console.log('金 polys', g.polys.length, g.polys.map(p=>p.length/2+':'+G.polyArea(p).toFixed(4)));
const lay=F.layout({text:'金火\n山',font:'forge',size:100}); console.log(lay.chars.map(c=>[c.ch,c.x,c.y,c.word]), lay.bbox);
