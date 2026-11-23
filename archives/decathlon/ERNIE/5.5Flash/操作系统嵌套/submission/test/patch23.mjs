import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`    if (win.appId === 'player' || win.appId === 'charts') this.closeProjectionsOf(win);`,
`    if (win.appId === 'player' || win.appId === 'charts') {
      const sid = win.id;
      setTimeout(() => this.closeProjectionsOf({ id: sid }), 180);
    }`);
s = s.replace(`  closeProjectionsOf(win) {
    for (const p of [...this.windows.values()]) {
      if (p.appId === 'projection' && p.state?.sourceWindowId === win.id) {`,
`  closeProjectionsOf(win) {
    const still = this.windows.get(win.id);
    if (still && still.appId !== 'projection' && still !== win) return;
    for (const p of [...this.windows.values()]) {
      if (p.appId === 'projection' && p.state?.sourceWindowId === win.id) {`);
s = s.replace(`    if (this.sourceAppId === 'player') {
      if (!this.view) this.rebuildView();
      const st = src.app.sceneState ? src.app.sceneState() : null;`,
`    if (this.sourceAppId === 'player') {
      if (!this.view || (src.app.sceneDef && this.view.def !== src.app.sceneDef)) this.rebuildView();
      const st = src.app.sceneState ? src.app.sceneState() : null;`);
fs.writeFileSync('js/shell.js', s);
console.log('done');