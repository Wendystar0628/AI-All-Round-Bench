/* 网络安全攻防战 — 应用主循环与场景切换 */
(function (root) {
  'use strict';
  const TD = root.TD, GX = TD.GX, UI = TD.UI, Input = TD.Input;
  const $ = s => document.querySelector(s);

  const App = TD.App = {
    state: 'boot', stage: null, sim: null, view: null, mapId: null, speed: 1, paused: false, menuOpen: false, locked: false, demo: null,
    acc: 0, envT: 0, last: 0, camTween: null, exporting: false, overT: -1, attract: null,

    init() {
      const cv = $('#stage');
      this.stage = new GX.Stage(cv);
      UI.init(this); Input.init(this); TD.Audio.init(this);
      window.addEventListener('resize', () => this.resize());
      this.resize();
      this.toMenu();
      const ld = $('#loading'); if (ld) ld.remove();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },
    resize() {
      const st = this.stage; st.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      if (this.view) this.fitDefault(!st.userCam && this.state === 'battle' && !this.demo);
    },
    fitDefault(apply) {
      const st = this.stage, m = this.view.map, keep = Object.assign({}, st.cam);
      st.fit(-m.ox - 0.55, m.ox + 0.55, -m.oz - 0.55, m.oz + 0.6, 1.0, 0);
      if (!apply) Object.assign(st.cam, keep);
    },
    loadMap(mapId, opts) {
      Input.reset(); UI.unbind();
      if (this.view) { this.view.dispose(); this.view = null; }
      this.mapId = mapId; this.sim = new TD.Sim(mapId, opts || {});
      this.view = new GX.BattleView(this.stage, this.sim);
      this.stage.userCam = false; this.stage.shake = 0; this.camTween = null; this.acc = 0; this.overT = -1;
      this.fitDefault(true);
      TD.Audio.bindSim(this.sim);
      this.sim.on('over', d => { this.overT = d.result === 'win' ? 2.6 : 2.0; this.overRes = d.result; TD.Audio.sfx(d.result === 'win' ? 'win' : 'lose'); });
    },

    // ---------- 场景 ----------
    toMenuScene() {
      this.demo = null; this.locked = false; $('#demo').classList.add('hidden'); $('#cursor').classList.add('hidden'); $('#dragGhost').classList.add('hidden');
      this.loadMap('intranet', { noAutoWave: true, seed: 7 });
      this.state = 'menu'; this.paused = false; this.menuOpen = false; this.speed = 1; UI.hud(false);
      // 菜单背景：一场自动进行的攻防
      const s = this.sim, at = (x, y) => y * s.W + x; s.integrity = s.maxIntegrity = 9999; s.compute = 99999; s.intel = 999;
      for (const [t, x, y, f, lv, br] of [['interceptor', 9, 9, 0, 2, 'a'], ['interceptor', 12, 11, 3, 2, 'b'], ['sandbox', 10, 9, 0, 2], ['repair', 12, 9, 0, 1], ['firewall', 11, 11, 0, 2], ['interceptor', 13, 7, 1, 1], ['interceptor', 7, 7, 1, 1], ['honeypot', 8, 6, 0, 1], ['sandbox', 13, 9, 0, 1], ['interceptor', 6, 2, 1, 1], ['interceptor', 16, 2, 1, 2, 'a'], ['gateway', 17, 3, 0, 1], ['repair', 16, 4, 0, 1], ['firewall', 8, 9, 0, 1]]) { const tw = s.place(t, at(x, y), f, true); if (tw && lv === 2) s.upgrade(tw.id, br || null, true); }
      s.wave = 6; s.startWave(false); this.attract = { t: 0 };
      TD.Audio.setScene('menu');
    },
    toMenu() { this.toMenuScene(); UI.show('menu'); },
    startMap(id) {
      this.demo = null; this.locked = false; $('#demo').classList.add('hidden'); $('#cursor').classList.add('hidden'); $('#dragGhost').classList.add('hidden');
      this.attract = null; this.loadMap(id, {});
      this.state = 'battle'; this.paused = false; this.menuOpen = false; this.speed = 1;
      UI.show(null); UI.hud(true); UI.bindSim(this.sim);
      TD.Audio.setScene(this.sim.def.theme);
    },
    setPaused(p, keepMenu) { this.paused = p; if (!keepMenu) { this.menuOpen = false; $('#pause').classList.add('hidden'); } if (p) Input.cancel(true); TD.Audio.setPaused(p); },
    togglePause() { if (this.state !== 'battle' || this.locked) return; this.setPaused(!this.paused); TD.Audio.sfx('click'); },
    openMenu() { if (this.state !== 'battle' || this.locked) return; this.setPaused(true); this.menuOpen = true; $('#pause').classList.remove('hidden'); },
    setSpeed(n) { if (this.locked) return; this.speed = n; if (this.paused) this.setPaused(false); TD.Audio.sfx('click'); },
    nextWave() { if (this.state !== 'battle' || this.locked || this.paused || !this.sim) return; if (this.sim.startWave(true)) TD.Audio.sfx('click'); },
    resetView() { const st = this.stage; this.camTween = { from: Object.assign({}, st.cam), to: Object.assign({}, st.camDef), t: 0, dur: 0.55 }; st.userCam = false; TD.Audio.sfx('click'); },
    toggleMute() { TD.Audio.setMuted(!TD.Audio.muted); UI.setMuteUi(TD.Audio.muted); },
    startDemos() { if (TD.Demo) UI.fade(() => TD.Demo.playAll()); },
    exitDemo() { if (!this.demo) return; if (this.exporting) return; TD.Demo.stop(); UI.fade(() => this.toMenu()); },

    // ---------- 主循环 ----------
    frame(now) {
      requestAnimationFrame(t => this.frame(t));
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
      if (this.exporting) return;
      this.tick(dt, null);
    },
    // dt：本帧真实（或导出）时长；ticks：指定推进的模拟步数（导出时使用）
    tick(dt, ticks) {
      this.envT += dt;
      const s = this.sim; let n = 0;
      if (s && !this.paused && (this.state === 'battle' || this.state === 'menu' || this.demo)) {
        if (ticks != null) n = ticks;
        else { this.acc += dt * 60 * (this.demo ? 1 : this.speed); n = Math.min(14, Math.floor(this.acc)); this.acc -= n; if (this.acc > 4) this.acc = 0; }
        for (let i = 0; i < n; i++) { if (this.demo) TD.Demo.beforeStep(); s.step(); }
      }
      if (this.demo) TD.Demo.update(dt);
      else if (this.state === 'menu') this.menuTick(dt);
      if (this.camTween) { const c = this.camTween; c.t += dt; const k = TD.ease(Math.min(1, c.t / c.dur)), cam = this.stage.cam; for (const key of ['tx', 'ty', 'tz', 'pitch', 'dist']) cam[key] = TD.lerp(c.from[key], c.to[key], k); cam.yaw = TD.angLerp(c.from.yaw, c.to.yaw, k); if (c.t >= c.dur) this.camTween = null; }
      if (this.overT > 0 && this.state === 'battle') { this.overT -= dt; if (this.overT <= 0) { this.overT = -1; Input.reset(); UI.showReport(this.sim, this.overRes); this.state = 'report'; TD.Audio.setScene('menu'); } }
      if (this.view) { Input.buildOverlay(); this.view.update(n * TD.TICK, dt, this.envT); }
      UI.update(dt);
      TD.Audio.update(dt);
      this.stage.render(dt);
    },
    menuTick(dt) {
      const s = this.sim, c = this.stage.cam, a = this.attract; if (!a) return; a.t += dt;
      c.yaw = 0.55 + Math.sin(a.t * 0.05) * 0.5; c.pitch = 0.5 + Math.sin(a.t * 0.07) * 0.06; c.dist = 21; c.tx = -5.5 + Math.sin(a.t * 0.04) * 1.2; c.tz = 2.2; c.ty = 0;
      s.compute = 99999; s.integrity = 9999;
      if (s.phase === 'prep') { if (s.wave > 10) s.wave = 4; s.startWave(false); }
      for (const t of s.towers) if (t.hp < t.maxHp * 0.3) t.hp = t.maxHp;
    }
  };

  window.addEventListener('DOMContentLoaded', () => { try { App.init(); } catch (e) { console.error(e); const ld = $('#loading'); if (ld) ld.textContent = '启动失败：' + e.message; } });
})(window);
