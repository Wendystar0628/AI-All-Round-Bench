import fs from 'fs';
let p = fs.readFileSync('js/apps/player.js', 'utf8');
p = p.replace(`  rebuildView() {
    if (this.view) { this.view.dispose(); this.view = null; }
    if (this.sceneDef && this.canvas) {`, `  rebuildView() {
    if (this.view && this.view.def === this.sceneDef) { this.view.resize(); return; }
    if (this.view) { this.view.dispose(); this.view = null; }
    if (this.sceneDef && this.canvas) {`);
p = p.replace(`  restore(st) {
    if (!st) return;
    this.time = st.time || 0;
    this.duration = st.duration || 15;`, `  restore(st) {
    if (!st) return;
    this.duration = st.duration || 15;`);
p = p.replace(`    if (st.scenePath) this.loadScene(st.scenePath);
    if (st.mode === 'record' && st.record) {`, `    if (st.scenePath) this.loadScene(st.scenePath);
    this.time = st.time || 0;
    this.playing = !!st.playing;
    this.lastClock = 0;
    this.lastFlightClock = 0;
    if (st.mode === 'record' && st.record) {`);
fs.writeFileSync('js/apps/player.js', p);

let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`    if (this.sourceAppId === 'player' && app?.sceneDef && this.canvas) {
      try {
        this.view = new SceneView(this.canvas, app.sceneDef);
        this.view.resize();
      } catch (e) { console.error(e); }
    }
    this.ctx = this.canvas?.getContext('2d') || null;`, `    if (this.sourceAppId === 'player' && app?.sceneDef && this.canvas) {
      try {
        this.view = new SceneView(this.canvas, app.sceneDef);
        this.view.resize();
      } catch (e) { console.error(e); }
      this.ctx = null;
    } else {
      this.ctx = this.canvas?.getContext('2d') || null;
    }`);
fs.writeFileSync('js/shell.js', s);
console.log('done');