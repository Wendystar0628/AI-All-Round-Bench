window.H = {
  async readBuf(buf, bytes) { const D = GPUX.device; const rb = D.createBuffer({size: bytes, usage: GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}); const e = D.createCommandEncoder(); e.copyBufferToBuffer(buf,0,rb,0,bytes); D.queue.submit([e.finish()]); await rb.mapAsync(GPUMapMode.READ); const a = new Float32Array(rb.getMappedRange().slice(0)); rb.unmap(); rb.destroy(); return a; },
  async parts() { const sim = App.scene.sim; return this.readBuf(sim.partBuf, sim.np*80); },
  async stats() { const sim = App.scene.sim; const a = await this.parts(); let n=0,svy=0,ymax=0,vmax=0,nan=0; for(let i=0;i<sim.np;i++){const o=i*20; const y=a[o+1]; if(!(y===y)){nan++;continue;} ymax=Math.max(ymax,y); vmax=Math.max(vmax,Math.hypot(a[o+4],a[o+5],a[o+6])); if(y>0.45){n++; svy+=a[o+5];}} return {n, meanVy: n? +(svy/n).toFixed(2):0, ymax:+ymax.toFixed(3), vmax:+vmax.toFixed(2), nan}; },
  async balls(n=20) { const a = await this.readBuf(App.scene.sim.ballBuf, 112*n); const out=[]; for(let i=0;i<n;i++){const o=i*28; out.push(`${i} p(${a[o].toFixed(2)},${a[o+1].toFixed(2)},${a[o+2].toFixed(2)}) v(${a[o+4].toFixed(2)},${a[o+5].toFixed(2)},${a[o+6].toFixed(2)}) d${a[o+11].toFixed(2)} phi${a[o+22].toFixed(2)}`);} return out; },
  hud() { if (!App.hudHidden) App.toggleHud(); },
  async run(t) { const sc = App.scene; App.setPaused(true); sc.stepTo(t); await GPUX.done(); return sc.simTime; },
};
'H ready'
H.profile = async function (xs = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.3]) {
  const sim = App.scene.sim; const a = await this.readBuf(sim.hBuf, sim.sx * sim.sz * 4);
  return xs.map(x => { let s = 0, n = 0; for (let k = 0; k < sim.sz; k++) { const h = a[k * sim.sx + Math.round(x / 0.01)]; if (h > -5) { s += h; n++; } } return n ? +(s / n).toFixed(3) : null; });
};
H.series = async function (t0, t1, dt, x) {
  const out = []; for (let t = t0; t <= t1 + 1e-6; t += dt) { await this.run(t); App.scene.render && 0; await new Promise(r => setTimeout(r, 60)); out.push(+((await this.profile([x]))[0])); } return out;
};
'ok'
