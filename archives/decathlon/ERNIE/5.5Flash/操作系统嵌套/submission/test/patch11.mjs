import fs from 'fs';
let s = fs.readFileSync('js/apps/spreadsheet.js', 'utf8');
s = s.replace(`      if (name === 'SUM') {
        let s = 0;
        for (const a of args) { if (Array.isArray(a)) s += a.reduce((x, v) => x + (typeof v === 'number' ? v : 0), 0); else if (typeof a === 'number') s += a; }
        return s;
      }
      if (name === 'AVERAGE') {
        const arr = args.flat().filter(v => typeof v === 'number');
        if (!arr.length) throw new Error('#DIV/0!');
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      }
      if (name === 'MIN' || name === 'MAX') {
        const arr = args.flat().filter(v => typeof v === 'number');
        if (!arr.length) return 0;
        return name === 'MIN' ? Math.min(...arr) : Math.max(...arr);
      }`, `      const flat = args.map(a => Array.isArray(a) ? a : (a && Array.isArray(a.range) ? a.range : [a])).flat();
      if (name === 'SUM') {
        let s = 0;
        for (const v of flat) if (typeof v === 'number') s += v;
        return s;
      }
      if (name === 'AVERAGE') {
        const arr = flat.filter(v => typeof v === 'number');
        if (!arr.length) throw new Error('#DIV/0!');
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      }
      if (name === 'MIN' || name === 'MAX') {
        const arr = flat.filter(v => typeof v === 'number');
        if (!arr.length) return 0;
        return name === 'MIN' ? Math.min(...arr) : Math.max(...arr);
      }`);
fs.writeFileSync('js/apps/spreadsheet.js', s);

let c = fs.readFileSync('js/apps/charts.js', 'utf8');
c = c.replace(`          grad.addColorStop(0, s.color || PALETTE[si % PALETTE.length]);
          grad.addColorStop(1, (s.color || PALETTE[si % PALETTE.length]) + '55');`, `          grad.addColorStop(0, s.color || PALETTE[si % PALETTE.length]);
          grad.addColorStop(1, alphaColor(s.color || PALETTE[si % PALETTE.length], 0.33));`);
c = c.replace(`function roundRect(ctx, x, y, w, h, r) {`, `function alphaColor(hex, a) {
  let h = String(hex || '#6f8dff').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  if (h.length !== 6) return 'rgba(111,141,255,' + a + ')';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function roundRect(ctx, x, y, w, h, r) {`);
fs.writeFileSync('js/apps/charts.js', c);
console.log('patched');