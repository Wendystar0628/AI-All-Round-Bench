import fs from 'fs';
let s = fs.readFileSync('js/apps/player.js', 'utf8');
function rep(a, b) { if (!s.includes(a)) { console.log('MISS', a.slice(0, 60)); return; } s = s.replace(a, b); }
rep(`    this.recordInitial = this.makeRecordInitial();
    this.lastFlightClock = this.sys.clock;
    return this.sim;`, `    this.recordInitial = this.makeRecordInitial();
    if (this._rehFromShow) {
      const hs = this._rehFromShow;
      const st = this.sim.state;
      st.pos = { x: hs.heli.x, y: hs.heli.y, z: hs.heli.z };
      st.yaw = hs.heli.yaw; st.pitch = hs.heli.pitch; st.roll = hs.heli.roll;
      st.rotor = hs.heli.rotor; st.damage = hs.heli.damage || 0;
      st.alive = (hs.heli.damage || 0) < 0.9;
      st.vel = { x: 0, y: 0, z: 0 };
      st.t = 0; st.controls = { thr: 0.45, roll: 0, pitch: 0, yaw: 0 }; st.lastControlT = -1;
      this.recordInitial = this.makeRecordInitial();
      this._rehFromShow = null;
    }
    this.lastFlightClock = this.sys.clock;
    return this.sim;`);
rep(`  setMode(m) {
    if (m === 'record' && !this.record) { this.os.toast(this.sys, '记录回放', '请先打开或保存一份排演记录', 'warn'); return; }
    if (m === 'rehearsal' && this.mode !== 'rehearsal') {
      if (!this.sim) this.createSim(false);`, `  setMode(m) {
    if (m === 'record' && !this.record) { this.os.toast(this.sys, '记录回放', '请先打开或保存一份排演记录', 'warn'); return; }
    if (m === 'rehearsal' && this.mode !== 'rehearsal') {
      if (this.mode === 'show') this._rehFromShow = this.sceneState();
      if (!this.sim) this.createSim(false);`);
rep(`  startRehearsal() {
    if (!this.sceneDef) return;
    if (this.mode !== 'rehearsal') this.setMode('rehearsal');
    this.createSim(true);
    this.playing = true;`, `  startRehearsal() {
    if (!this.sceneDef) return;
    if (this.mode !== 'rehearsal') this.setMode('rehearsal');
    if (!this.sim) this.createSim(true);
    this.playing = true;`);
rep(`  resetRehearsal() {
    if (!this.sceneDef) return;
    this.createSim(true);`, `  resetRehearsal() {
    if (!this.sceneDef) return;
    this._rehFromShow = null;
    this.createSim(true);`);
fs.writeFileSync('js/apps/player.js', s);
console.log('done');