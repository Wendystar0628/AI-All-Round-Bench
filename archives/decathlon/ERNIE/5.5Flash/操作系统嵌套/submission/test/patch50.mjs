import fs from 'fs';
let c = fs.readFileSync('js/apps/charts.js', 'utf8');
c = c.replace(`  drawChart(ctx, W, H, opts = {}) {
    const c = this.chart;`, `  drawChart(ctx, W, H, opts = {}) {
    const c = opts.chart || this.chart;`);
fs.writeFileSync('js/apps/charts.js', c);
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`        src.app.drawChart(ctx, w, h, { interactive: false });`, `        src.app.drawChart(ctx, w, h, { interactive: false, chart: deepClone(src.app.chart) });`);
fs.writeFileSync('js/shell.js', s);
console.log('done');