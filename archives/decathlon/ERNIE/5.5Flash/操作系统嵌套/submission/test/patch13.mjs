import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`      win.setData('source-system-id', sourceWin.systemId);
      win.setData('source-window-id', sourceWin.id);
      win.setData('source-app-id', sourceWin.appId);`, `      win.el.setAttribute('data-source-system-id', sourceWin.systemId);
      win.el.setAttribute('data-source-window-id', sourceWin.id);
      win.el.setAttribute('data-source-app-id', sourceWin.appId);`);
fs.writeFileSync('js/shell.js', s);
let c = fs.readFileSync('js/apps/charts.js', 'utf8');
c = c.replace(`  drawChart(ctx, W, H, opts = {}) {
    const c = this.chart;
    ctx.clearRect(0, 0, W, H);`, `  drawChart(ctx, W, H, opts = {}) {
    const c = this.chart;
    if (W < 40 || H < 30) return;
    ctx.clearRect(0, 0, W, H);`);
c = c.replace(`      const bw = Math.min(26, (groupW - 12) / Math.max(1, series.length));`, `      const bw = Math.max(2, Math.min(26, (groupW - 12) / Math.max(1, series.length)));`);
c = c.replace(`function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);`, `function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));`);
fs.writeFileSync('js/apps/charts.js', c);
console.log('done');