// 三维场景播放器：演出、飞行排演、记录回放、镜头、点选与跨层投送
import { h, clear, icon, iconSvg, fmtTime, clamp, lerp, smooth, rad, deg } from '../util.js';
import { SceneView } from '../scene.js';
import { FlightSim } from '../flight.js';
import { terrainHeight } from '../terrain.js';
import { basename as kbasename, extOf } from '../kernel.js';

const DEFAULT_SCENE = '/Demo/helicopter-24.scene';

function sampleTimeline(def, t) {
  const keys = def.timeline?.keys || [];
  const normCam = c => (Array.isArray(c) && c.length === 3 && typeof c[0] === 'number') ? [c, [0, 2, 0]] : (c || [[12, 6, 14], [0, 2, 0]]);
  if (!keys.length) return { pos: [0, 1, 0], rot: [0, 0, 0], rotor: 0.5, damage: 0, camPos: [12, 6, 14], camTarget: [0, 2, 0], label: '' };
  if (t <= keys[0].t) { const c = normCam(keys[0].cam); return { ...keys[0], camPos: c[0], camTarget: c[1] }; }
  const last = keys[keys.length - 1];
  if (t >= last.t) { const c = normCam(last.cam); return { ...last, camPos: c[0], camTarget: c[1] }; }
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const u = smooth(clamp((t - a.t) / (b.t - a.t || 1), 0, 1));
  const mix = (p, q) => p.map((v, k) => lerp(v, q[k] ?? v, u));
  const camA = normCam(a.cam), camB = normCam(b.cam);
  return {
    pos: mix(a.pos, b.pos), rot: mix(a.rot, b.rot), rotor: lerp(a.rotor, b.rotor, u), damage: lerp(a.damage || 0, b.damage || 0, u),
    camPos: mix(camA[0], camB[0]), camTarget: mix(camA[1], camB[1]), label: u < 0.5 ? a.label : b.label
  };
}

export class PlayerApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.mode = state.recordPath ? 'record' : 'show';
    this.scenePath = state.path || (state.recordPath ? '' : DEFAULT_SCENE);
    this.sceneDef = null;
    this.time = 0;
    this.duration = 15;
    this.playing = false;
    this.rate = 1;
    this.loop = false;
    this.camera = { mode: 'cinematic', yaw: 0.7, pitch: 0.34, dist: 17, target: null };
    this.selection = null;
    this.view = null;
    this.sim = null;
    this.record = null;
    this.recordSamples = [];
    this.recordInitial = null;
    this.lastClock = 0;
    this.lastFlightClock = 0;
    this.acc = 0;
    this.controllerPath = '/System/controller.prog';
    this.heading = 0;
    this.wind = 2.2;
    this.faultAt = 0;
    this.lastLabel = '';
    this.restoreState = state;
  }

  mount(body) {
    const wrap = h('div', { class: 'player-wrap' });
    const top = h('div', { class: 'toolbar', style: { padding: '5px 8px', gap: '5px' } });
    const mode = h('div', { class: 'player-mode' });
    this.modeBtns = {};
    for (const [id, label] of [['show', '演出'], ['rehearsal', '飞行排演'], ['record', '记录回放']]) {
      const b = h('button', { class: this.mode === id ? 'on' : '', 'data-testid': 'player-mode-' + id }, label);
      b.addEventListener('click', () => this.setMode(id));
      mode.append(b); this.modeBtns[id] = b;
    }
    top.append(mode);
    const open = h('button', { class: 'btn small', 'data-testid': 'player-open' }, iconSvg('folder'), '打开场景');
    open.addEventListener('click', () => this.openPicker());
    top.append(open);
    top.append(hdiv());
    const cam = h('button', { class: 'btn small', 'data-testid': 'player-camera' }, iconSvg('camera'), '镜头：电影');
    cam.addEventListener('click', () => this.cycleCamera());
    this.camBtn = cam;
    top.append(cam);
    const proj = h('button', { class: 'btn small', 'data-testid': 'window-project' }, iconSvg('projection'), '投送到祖先桌面');
    proj.addEventListener('click', e => { e.stopPropagation(); this.projectMenu(proj); });
    top.append(proj);
    top.append(h('div', { class: 'spacer' }));
    this.sceneLabel = h('span', { class: 'pill', style: { maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, this.scenePath || '未载入场景');
    top.append(this.sceneLabel);
    wrap.append(top);

    const stage = h('div', { class: 'player-stage', 'data-testid': 'player-view' });
    this.canvas = h('canvas', {});
    stage.append(this.canvas);
    const hud = h('div', { class: 'player-hud' });
    this.hudTime = h('div', { class: 'hud-chip' }, '00:00.00 / 00:15.00');
    this.hudState = h('div', { class: 'hud-chip' }, '已暂停');
    this.hudCam = h('div', { class: 'hud-chip' }, '电影镜头');
    hud.append(this.hudTime, this.hudState, this.hudCam);
    stage.append(hud);
    this.selEl = h('div', { class: 'player-selection hidden', 'data-testid': 'player-selection' });
    stage.append(this.selEl);
    wrap.append(stage);

    const controls = h('div', { class: 'player-controls' });
    const mk = (testid, ic, title, fn) => {
      const b = h('button', { class: 'pc-btn', title, 'data-testid': testid });
      b.innerHTML = iconSvg(ic);
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      controls.append(b); return b;
    };
    this.playBtn = mk('player-play', 'play', '播放', () => this.togglePlay());
    mk('player-pause', 'pause', '暂停', () => this.pause());
    mk('player-stop', 'stop', '停止', () => this.stop());
    mk('player-step', 'step', '逐帧', () => this.stepFrame());
    const seek = h('input', { type: 'range', min: '0', max: String(this.duration), step: '0.01', value: '0', 'data-testid': 'player-seek', style: { flex: '1', accentColor: 'var(--accent)' } });
    this.seekEl = seek;
    seek.addEventListener('input', () => this.seek(Number(seek.value)));
    controls.append(seek);
    this.timeEl = h('span', { class: 'player-time', 'data-testid': 'player-time' }, '00:00.00');
    controls.append(this.timeEl);
    const rate = h('select', { class: 'select player-rate', 'data-testid': 'player-rate', title: '播放速率' });
    for (const v of [0.25, 0.5, 1, 1.5, 2]) { const o = h('option', { value: String(v) }, v + '×'); if (v === 1) o.selected = true; rate.append(o); }
    rate.addEventListener('change', () => { this.rate = Number(rate.value); this.updateHud(); });
    this.rateEl = rate;
    controls.append(rate);
    const loop = h('button', { class: 'btn small', 'data-testid': 'player-loop', title: '循环' }, iconSvg('loop'));
    loop.addEventListener('click', () => { this.loop = !this.loop; loop.classList.toggle('primary', this.loop); });
    controls.append(loop);
    wrap.append(controls);

    const reh = h('div', { class: 'rehearsal-panel', 'data-testid': 'rehearsal-panel' });
    const fld = (label, input) => h('div', { class: 'reh-field' }, h('span', {}, label), input);
    this.windEl = h('input', { class: 'input', type: 'number', step: '0.1', value: '2.2', 'data-testid': 'rehearsal-wind' });
    this.windEl.addEventListener('change', () => this.applyRehEnv());
    this.headingEl = h('input', { class: 'input', type: 'number', value: '0', 'data-testid': 'rehearsal-heading' });
    this.headingEl.addEventListener('change', () => this.applyRehEnv());
    this.faultEl = h('input', { class: 'input', type: 'number', step: '0.5', value: '0', 'data-testid': 'rehearsal-fault' });
    this.faultEl.addEventListener('change', () => this.applyRehEnv());
    this.ctrlEl = h('select', { class: 'select', 'data-testid': 'rehearsal-controller' });
    this.refreshControllerList();
    reh.append(
      fld('风 (m/s)', this.windEl), fld('目标航向 (°)', this.headingEl), fld('故障时刻 (s，0=关)', this.faultEl), fld('飞控程序', this.ctrlEl)
    );
    wrap.append(reh);
    const acts = h('div', { class: 'reh-actions' });
    const start = h('button', { class: 'btn primary', 'data-testid': 'rehearsal-start' }, iconSvg('play'), '开始排演');
    start.addEventListener('click', () => this.startRehearsal());
    const reset = h('button', { class: 'btn', 'data-testid': 'rehearsal-reset' }, iconSvg('restart'), '重置');
    reset.addEventListener('click', () => this.resetRehearsal());
    const save = h('button', { class: 'btn', 'data-testid': 'rehearsal-save' }, iconSvg('save'), '保存排演记录');
    save.addEventListener('click', () => this.saveRecord());
    const cont = h('button', { class: 'btn', 'data-testid': 'rehearsal-continue' }, iconSvg('step'), '从当前位置续演');
    cont.addEventListener('click', () => this.continueFromHere());
    acts.append(start, reset, save, cont, hdiv());
    this.rehStatus = h('span', { class: 'pill' }, '飞控待启动');
    acts.append(this.rehStatus);
    wrap.append(acts);

    body.append(wrap);
    this.wrap = wrap;
    this.rehEl = reh; this.actsEl = acts;
    this.updateModeVisibility();
    this.bindCanvas();
    this.ro = new ResizeObserver(() => { this.view?.resize(); });
    this.ro.observe(stage);
    if (this.scenePath) this.loadScene(this.scenePath);
    if (this.mode === 'record' && this.restoreState?.recordPath) this.loadRecord(this.restoreState.recordPath);
    if (this.restoreState?.path && this.mode === 'show') this.loadScene(this.restoreState.path);
    this.updateHud();
  }

  refreshControllerList() {
    clear(this.ctrlEl);
    const files = (this.sys.fs.list('/System') || []).filter(f => !f.dir && (f.path.endsWith('.prog')));
    for (const f of files) {
      const o = h('option', { value: f.path }, kbasename(f.path));
      if (f.path === this.controllerPath) o.selected = true;
      this.ctrlEl.append(o);
    }
    const custom = (this.sys.fs.list('/Documents') || []).filter(f => !f.dir && f.path.endsWith('.prog'));
    for (const f of custom) this.ctrlEl.append(h('option', { value: f.path }, kbasename(f.path)));
    if (!files.length) this.ctrlEl.append(h('option', { value: '/System/controller.prog' }, 'controller.prog'));
  }

  bindCanvas() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (this.camera.mode !== 'free') {
        const hstate = this.sceneState();
        const hp = hstate.heli;
        this.camera.mode = 'free';
        this.camera.target = [hp.x, hp.y + 1.2, hp.z];
        this.camera.yaw = 0.7; this.camera.pitch = 0.34; this.camera.dist = 17;
        this.updateCamBtn();
      }
      drag = { x: e.clientX, y: e.clientY, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        drag.moved = true;
        this.camera.yaw += dx * 0.008;
        this.camera.pitch = clamp(this.camera.pitch + dy * 0.006, -0.1, 1.35);
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    this.canvas.addEventListener('pointerup', e => {
      if (!drag) return;
      const moved = drag.moved; drag = null;
      if (moved) return;
      if (this.view) {
        const pick = this.view.pick(e.clientX, e.clientY);
        if (pick) {
          this.selection = { ...pick, damage: this.currentDamage(), status: this.currentDamage() > 0.8 ? '损毁' : this.currentDamage() > 0.1 ? '受损' : '完好' };
          this.showSelection();
        } else {
          const g = this.view.groundHit(e.clientX, e.clientY);
          if (g && this.mode === 'rehearsal') {
            const hdg = (deg(Math.atan2(g.x, g.z)) + 360) % 360;
            this.headingEl.value = String(Math.round(hdg));
            this.applyRehEnv();
            this.os.toast(this.sys, '目标航向已设置', `${Math.round(hdg)}° · 点击地面设为目标航向`, 'ok');
          } else {
            this.selection = null; this.selEl.classList.add('hidden');
          }
        }
      }
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.camera.mode !== 'free') {
        const hs = this.sceneState();
        this.camera.mode = 'free'; this.camera.target = [hs.heli.x, hs.heli.y + 1.2, hs.heli.z];
        this.camera.yaw = 0.7; this.camera.pitch = 0.34; this.camera.dist = 17;
      }
      this.camera.dist = clamp(this.camera.dist * (1 + Math.sign(e.deltaY) * 0.08), 5, 60);
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  updateCamBtn() {
    if (!this.camBtn) return;
    const name = { cinematic: '电影', follow: '跟随', free: '自由' }[this.camera.mode] || '电影';
    this.camBtn.innerHTML = iconSvg('camera') + '镜头：' + name;
    this.hudCam.textContent = name + '镜头';
  }
  cycleCamera() {
    const order = this.mode === 'show' ? ['cinematic', 'follow', 'free'] : ['follow', 'free', 'cinematic'];
    const i = order.indexOf(this.camera.mode);
    this.camera.mode = order[(i + 1) % order.length];
    if (this.camera.mode === 'free' && !this.camera.target) {
      const hs = this.sceneState();
      this.camera.target = [hs.heli.x, hs.heli.y + 1.2, hs.heli.z];
    }
    this.updateCamBtn();
  }

  loadScene(path, defOverride) {
    const f = this.sys.fs.get(path);
    let def = defOverride;
    if (!def) {
      if (!f || f.dir) { this.os.toast(this.sys, '无法打开场景', `${path} 不存在`, 'err'); return; }
      try { def = JSON.parse(f.content); } catch (e) { this.os.toast(this.sys, '场景格式错误', e.message, 'err'); return; }
    }
    if (!def || def.format !== 'nos-scene') { this.os.toast(this.sys, '场景格式错误', '需要 nos-scene 资源', 'err'); return; }
    const proc = this.sys.processes.find(p => p.name === 'player');
    const bytes = new TextEncoder().encode(JSON.stringify(def)).length * 30;
    if (this.sys.totalMem + bytes > this.sys.memoryLimit) {
      this.os.toast(this.sys, '场景载入失败', '内存配额不足，无法载入该场景资源', 'err');
      return;
    }
    if (proc) this.sys.chargeMemory(proc, bytes); else this.sys.totalMem += bytes;
    this.sceneDef = def;
    this.scenePath = path;
    this.duration = def.timeline?.duration || 15;
    this.time = 0;
    this.selection = null;
    this.selEl?.classList.add('hidden');
    this.rebuildView();
    this.sceneLabel.textContent = path;
    this.win.setTitle(def.name || kbasename(path));
    this.updateHud();
    this.render();
  }

  rebuildView() {
    if (this.view && this.view.def === this.sceneDef) { this.view.resize(); return; }
    if (this.view) { this.view.dispose(); this.view = null; }
    if (this.sceneDef && this.canvas) {
      try {
        this.view = new SceneView(this.canvas, this.sceneDef);
        this.view.resize();
      } catch (e) { console.error(e); this.os.toast(this.sys, '三维视图不可用', e.message, 'err'); }
    }
  }

  openPicker() {
    const files = (this.sys.fs.list('/Demo') || []).filter(f => !f.dir && f.path.endsWith('.scene'));
    const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflow: 'auto' } });
    for (const f of files) {
      const b = h('button', { class: 'btn ghost', style: { justifyContent: 'flex-start' } }, iconSvg('film'), kbasename(f.path));
      b.addEventListener('click', () => { this.loadScene(f.path); layer.remove(); });
      list.append(b);
    }
    const layer = h('div', { class: 'modal-layer', style: { pointerEvents: 'auto' } });
    const dlg = h('div', { class: 'dialog' }, h('h3', {}, '打开场景资源'), list, h('div', { class: 'dlg-actions' }, h('button', { class: 'btn' }, '取消')));
    dlg.lastChild.lastChild.addEventListener('click', () => layer.remove());
    layer.append(dlg);
    this.win.bodyEl.appendChild(layer);
    layer.addEventListener('pointerdown', e => { if (e.target === layer) layer.remove(); });
  }

  setMode(m) {
    if (m === 'record' && !this.record) { this.os.toast(this.sys, '记录回放', '请先打开或保存一份排演记录', 'warn'); return; }
    if (m === 'rehearsal' && this.mode !== 'rehearsal') {
      if (this.mode === 'show') this._rehFromShow = this.sceneState();
      if (!this.sim) this.createSim(false);
      this.camera.mode = 'follow';
      this.time = this.sim ? this.sim.state.t : 0;
      this.ensureController(this.controllerPath);
      this.lastFlightClock = this.sys.clock;
    }
    if (m === 'show' && this.mode !== 'show') {
      this.time = clamp(this.time, 0, this.duration);
      this.camera.mode = 'cinematic';
    }
    this.mode = m;
    for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', k === m);
    this.updateModeVisibility();
    this.updateCamBtn();
    this.updateHud();
    this.render();
  }
  updateModeVisibility() {
    if (!this.rehEl) return;
    const reh = this.mode === 'rehearsal';
    this.rehEl.style.display = reh ? 'grid' : 'none';
    this.actsEl.style.display = reh ? 'flex' : 'none';
    this.seekEl.disabled = reh;
    this.modeBtns?.record && (this.modeBtns.record.style.opacity = this.record ? '1' : '.45');
  }

  createSim(reset = true) {
    if (!this.sceneDef) return null;
    this.sim = new FlightSim(this.sceneDef, { start: this.sceneDef.flight?.start || [0, 3.4, 0], wind: Number(this.windEl?.value || 2.2), faultAt: Number(this.faultEl?.value || 0), targetPad: this.sceneDef.flight?.targetPad ?? 1 });
    const hv = Number(this.headingEl?.value || 0);
    this.sim.setEnvironment({ heading: hv || null });
    this.recordSamples = [];
    this.recordInitial = this.makeRecordInitial();
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
    return this.sim;
  }
  makeRecordInitial() {
    return {
      scene: this.scenePath, sceneData: this.sceneDef,
      opts: { start: this.sceneDef?.flight?.start || [0, 3.4, 0], wind: this.sim?.state.wind, faultAt: this.sim?.state.faultAt, targetPad: this.sim?.targetPadIndex },
      state: this.sim ? this.sim.snapshot() : null
    };
  }
  applyRehEnv() {
    this.wind = Number(this.windEl.value) || 0;
    this.heading = Number(this.headingEl.value) || 0;
    this.faultAt = Number(this.faultEl.value) || 0;
    if (this.sim) this.sim.setEnvironment({ wind: this.wind, faultAt: this.faultAt, heading: this.heading || null });
    this.os.toast(this.sys, '排演参数', `风 ${this.wind} m/s · 航向 ${this.heading}° · 故障 ${this.faultAt}s`, 'info', false);
  }
  ensureController(path) {
    const p = path || '/System/controller.prog';
    this.controllerPath = p;
    const existing = this.sys.processes.find(x => x.name === 'controller' && x.type === 'program' && x.state !== 'finished');
    if (existing) existing.state = 'finished';
    const f = this.sys.fs.get(p);
    if (!f || f.dir) { this.os.toast(this.sys, '飞控未启动', `${p} 不存在`, 'err'); return; }
    const r = this.sys.spawn('controller', f.content, { type: 'program', quota: 1200 });
    if (r.ok) {
      this.rehStatus.textContent = `飞控进程 ${r.proc.id} · ${kbasename(p)}`;
      this.rehStatus.className = 'pill ok';
      this.os.notify(this.sys, '飞控已启动', `${kbasename(p)} · 进程 ${r.proc.id}`, 'ok', false);
    } else {
      this.rehStatus.textContent = '飞控启动失败';
      this.rehStatus.className = 'pill err';
    }
  }
  startRehearsal() {
    if (!this.sceneDef) return;
    if (this.mode !== 'rehearsal') this.setMode('rehearsal');
    if (!this.sim) this.createSim(true);
    this.playing = true;
    this.time = this.sim ? this.sim.state.t : 0;
    this.applyRehEnv();
    this.ensureController(this.ctrlEl.value || this.controllerPath);
    this.lastFlightClock = this.sys.clock;
    this.updateHud();
    this.os.notify(this.sys, '飞行排演开始', '飞控、动力学与场景已启动', 'ok', false);
  }
  resetRehearsal() {
    if (!this.sceneDef) return;
    this._rehFromShow = null;
    this.createSim(true);
    this.playing = false;
    this.time = 0;
    this.lastFlightClock = this.sys.clock;
    this.updateHud();
    this.render();
  }

  systemTick(sys) {
    const expected = 20 * (sys.speed || 1);
    if (!this.lastClock) { this.lastClock = sys.clock; return; }
    let dt = sys.clock - this.lastClock;
    this.lastClock = sys.clock;
    if (dt <= 0) return;
    if (dt > expected * 2.5) dt = 0;
    if (this.mode === 'show' || this.mode === 'record') {
      if (!this.playing) return;
      const adv = dt / 1000 * this.rate;
      this.time += adv;
      const dur = this.mode === 'record' && this.record ? (this.record.duration || this.duration) : this.duration;
      if (this.time >= dur) {
        if (this.loop) this.time = this.time % dur;
        else { this.time = dur; this.playing = false; }
      }
    }
  }
  flightStep(sys) {
    if (this.mode !== 'rehearsal' || !this.sim) return;
    const expected = 20 * (sys.speed || 1);
    if (!this.lastFlightClock) this.lastFlightClock = sys.clock;
    if (!this.playing) { this.lastFlightClock = sys.clock; return; }
    let dt = sys.clock - this.lastFlightClock;
    this.lastFlightClock = sys.clock;
    if (dt <= 0) return;
    if (dt > 250) dt = 250;
    this.acc += dt;
    let n = 0;
    while (this.acc >= 20 && n < 30) {
      this.sim.step(0.02);
      this.acc -= 20; n++;
      this.recordSamples.push({
        t: +this.sim.state.t.toFixed(3),
        thr: this.sim.state.controls.thr, roll: this.sim.state.controls.roll,
        pitch: this.sim.state.controls.pitch, yaw: this.sim.state.controls.yaw
      });
      if (this.recordSamples.length > 20000) this.recordSamples.shift();
    }
    this.time = this.sim.state.t;
    if (!this.sim.state.alive && this.playing) {
      this.playing = false;
      this.os.notify(this.sys, '飞行结束', `机体状态：${this.sim.state.reason || '坠毁'}`, 'warn', true);
    }
    return { cost: 2 + n * 2 };
  }

  togglePlay() {
    if (this.mode === 'rehearsal' && !this.sim) this.createSim(false);
    if (this.mode === 'record' && !this.record) return;
    this.playing = !this.playing;
    if (this.playing) {
      if (this.mode === 'show' || this.mode === 'record') {
        const dur = this.mode === 'record' && this.record ? this.record.duration : this.duration;
        if (this.time >= dur - 0.001) this.time = 0;
      }
      if (this.mode === 'rehearsal') { this.lastFlightClock = this.sys.clock; if (!this.sys.processes.find(p => p.name === 'controller' && p.state !== 'finished')) this.ensureController(this.controllerPath); }
    }
    this.updateHud();
  }
  pause() { this.playing = false; this.updateHud(); }
  stop() {
    this.playing = false;
    if (this.mode === 'rehearsal') { this.resetRehearsal(); return; }
    this.time = 0;
    this.updateHud();
    this.render();
  }
  stepFrame() {
    this.playing = false;
    if (this.mode === 'rehearsal') {
      if (this.sim) { for (let i = 0; i < 2; i++) this.sim.step(0.02); this.time = this.sim.state.t; }
    } else {
      const dur = this.mode === 'record' && this.record ? this.record.duration : this.duration;
      this.time = clamp(this.time + 1 / 30, 0, dur);
    }
    this.updateHud();
    this.render();
  }
  seek(t) {
    if (this.mode === 'rehearsal') return;
    const dur = this.mode === 'record' && this.record ? this.record.duration : this.duration;
    this.time = clamp(t, 0, dur);
    this.updateHud();
    this.render();
  }

  recordStateAt(t) {
    if (!this.record) return null;
    const init = this.record.initial;
    const samples = this.record.samples || [];
    if (!init || !samples.length) return init?.state || null;
    try { return FlightSim.replay(init, samples, t); } catch (e) { return init.state; }
  }

  currentDamage() {
    if (this.mode === 'rehearsal' && this.sim) return this.sim.state.damage;
    if (this.mode === 'record') { const st = this.recordStateAt(this.time); return st?.damage || 0; }
    return sampleTimeline(this.sceneDef, this.time).damage || 0;
  }

  sceneState() {
    const cam = { ...this.camera };
    if (!this.sceneDef) return { time: 0, duration: 15, heli: { x: 0, y: 1, z: 0, yaw: 0, pitch: 0, roll: 0, rotor: 0.4, damage: 0 }, camera: cam, camPos: [12, 6, 14], camTarget: [0, 2, 0], crashT: -1 };
    if (this.mode === 'show') {
      const k = sampleTimeline(this.sceneDef, this.time);
      const crashKey = (this.sceneDef.timeline?.keys || []).find(x => (x.label || '').includes('撞击'));
      return {
        time: this.time, duration: this.duration,
        heli: { x: k.pos[0], y: k.pos[1], z: k.pos[2], yaw: k.rot[1], pitch: k.rot[0], roll: k.rot[2], rotor: k.rotor, damage: k.damage, rotorAngle: this.time * 42 },
        camera: cam, camPos: k.camPos, camTarget: [k.pos[0] + Math.sin(k.rot[1]) * 1.5, k.pos[1] + 0.8, k.pos[2] + Math.cos(k.rot[1]) * 1.5],
        crashT: crashKey ? crashKey.t : -1,
        crashPos: crashKey ? { x: k.pos[0], y: 1.0, z: k.pos[2] } : null
      };
    }
    if (this.mode === 'record') {
      const st = this.recordStateAt(this.time) || this.record?.initial?.state;
      if (!st) return { time: 0, duration: this.record?.duration || 15, heli: { x: 0, y: 1, z: 0, yaw: 0, pitch: 0, roll: 0, rotor: 0.5, damage: 0 }, camera: cam, camPos: [12, 6, 14], camTarget: [0, 2, 0], crashT: -1 };
      return {
        time: this.time, duration: this.record?.duration || this.duration,
        heli: { x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw, pitch: st.pitch, roll: st.roll, rotor: st.rotor, damage: st.damage, rotorAngle: st.t * 42 },
        camera: cam, camPos: null, camTarget: null,
        crashT: st.crashT ?? -1, crashPos: st.crashPos || null
      };
    }
    const st = this.sim?.state;
    if (!st) return { time: 0, duration: this.duration, heli: { x: 0, y: 1, z: 0, yaw: 0, pitch: 0, roll: 0, rotor: 0.4, damage: 0 }, camera: cam, camPos: null, camTarget: null, crashT: -1 };
    return {
      time: st.t, duration: this.duration,
      heli: { x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw, pitch: st.pitch, roll: st.roll, rotor: st.rotor, damage: st.damage, rotorAngle: st.t * 42 },
      camera: cam, camPos: null, camTarget: null,
      crashT: st.crashT ?? -1, crashPos: st.crashPos || null
    };
  }

  showSelection() {
    if (!this.selection) { this.selEl.classList.add('hidden'); return; }
    this.selEl.classList.remove('hidden');
    this.selEl.innerHTML = `<div class="ps-title">部件点选</div><div style="font-weight:600">${this.selection.name || this.selection.part}</div><div style="color:var(--muted);margin-top:2px">状态：${this.selection.status || '完好'}</div>`;
  }

  updateHud() {
    const dur = this.mode === 'record' && this.record ? this.record.duration : this.duration;
    if (this.timeEl) this.timeEl.textContent = fmtTime(this.time);
    if (this.hudTime) this.hudTime.textContent = `${fmtTime(this.time)} / ${fmtTime(dur)}`;
    if (this.seekEl && document.activeElement !== this.seekEl) { this.seekEl.max = String(dur); this.seekEl.value = String(this.time); }
    if (this.hudState) this.hudState.textContent = this.playing ? `播放中 · ${this.rate}×` : (this.mode === 'rehearsal' ? '排演暂停' : '已暂停');
    if (this.playBtn) {
      this.playBtn.innerHTML = iconSvg(this.playing ? 'pause' : 'play');
    }
    if (this.mode === 'rehearsal' && this.sim) {
      const s = this.sim.state;
      if (this.rehStatus) {
        const ctrl = this.sys.processes.find(p => p.name === 'controller' && p.state !== 'finished');
        this.rehStatus.textContent = ctrl ? `飞控 ${ctrl.id} · ${ctrl.state} · 控制周期 ${Math.round(ctrl.usedTotal > 0 ? 20 : 20)}ms` : '飞控未运行 · 机体不稳定';
        this.rehStatus.className = 'pill ' + (ctrl ? (ctrl.state === 'error' ? 'err' : 'ok') : 'warn');
      }
      if (this.hudState) this.hudState.textContent = `${this.playing ? '排演中' : '排演暂停'} · 风 ${s.wind} · 故障 ${s.faultAt || '关'} · 高度 ${Math.max(0, s.pos.y).toFixed(1)}m`;
    }
  }

  render() {
    if (this.view && this.sceneDef) {
      try { this.view.update(this.sceneState()); } catch (e) {}
    }
    this.updateHud();
  }

  saveRecord() {
    if (!this.sim) { this.os.toast(this.sys, '保存记录', '没有可保存的排演', 'warn'); return; }
    const data = {
      format: 'nos-record', version: 1, createdAt: Date.now(),
      scene: this.scenePath, sceneData: this.sceneDef,
      initial: this.recordInitial || this.makeRecordInitial(),
      samples: this.recordSamples.slice(),
      duration: this.sim.state.t,
      inputs: { wind: this.wind, heading: this.heading, faultAt: this.faultAt },
      result: { alive: this.sim.state.alive, reason: this.sim.state.reason, distance: this.sim.state.distance }
    };
    let name = `排演-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    let path = `/Documents/${name}.record`;
    let i = 1; while (this.sys.fs.exists(path)) { path = `/Documents/${name} (${i++}).record`; }
    if (this.sys.fs.storageUsed() + JSON.stringify(data).length > this.sys.storageLimit) { this.os.toast(this.sys, '保存失败', '存储配额不足', 'err'); return; }
    this.sys.fs.write(path, JSON.stringify(data), Date.now());
    this.sys.syncStorage();
    this.os.notify(this.sys, '排演记录已保存', `${path} · ${data.samples.length} 个控制样本`, 'ok', true);
  }

  loadRecord(path) {
    const f = this.sys.fs.get(path);
    if (!f || f.dir) { this.os.toast(this.sys, '打开记录失败', `${path} 不存在`, 'err'); return; }
    try {
      const data = JSON.parse(f.content);
      if (data.format !== 'nos-record') throw new Error('格式不符');
      this.record = data;
      this.recordSamples = data.samples || [];
      this.recordInitial = data.initial;
      if (data.sceneData) {
        this.sceneDef = data.sceneData;
        this.scenePath = data.scene || this.scenePath;
        this.duration = data.duration || 15;
        this.rebuildView();
        this.sceneLabel.textContent = this.scenePath;
      }
      this.mode = 'record';
      this.time = 0;
      this.playing = false;
      this.camera.mode = 'follow';
      for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', k === 'record');
      this.updateModeVisibility();
      this.updateCamBtn();
      this.win.setTitle(`排演记录 · ${kbasename(path)}`);
      this.os.notify(this.sys, '记录已载入', `${path} · ${data.samples?.length || 0} 个样本 · 可跳转/续演`, 'ok', true);
      this.updateHud();
      this.render();
    } catch (e) { this.os.toast(this.sys, '打开记录失败', e.message, 'err'); }
  }

  continueFromHere() {
    if (!this.record) { this.os.toast(this.sys, '续演', '请先打开排演记录', 'warn'); return; }
    const st = this.recordStateAt(this.time);
    if (!st) return;
    const sceneDef = this.sceneDef;
    this.sim = new FlightSim(sceneDef, this.record.initial?.opts || {});
    this.sim.restore(st);
    this.sim.setEnvironment({ heading: this.heading, wind: this.wind, faultAt: this.faultAt });
    this.recordSamples = [];
    this.recordInitial = { scene: this.scenePath, sceneData: sceneDef, opts: this.record.initial?.opts || {}, state: JSON.parse(JSON.stringify(st)) };
    this.mode = 'rehearsal';
    this.playing = true;
    this.lastFlightClock = this.sys.clock;
    for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', k === 'rehearsal');
    this.updateModeVisibility();
    this.ensureController(this.ctrlEl.value || this.controllerPath);
    this.os.notify(this.sys, '已转入续演', `从 ${fmtTime(this.time)} 继续，保存后形成新的连续记录`, 'ok', true);
  }

  reset() {
    this.sim = null;
    this.record = null;
    this.recordSamples = [];
    this.time = 0;
    this.playing = false;
    this.mode = 'show';
    this.camera.mode = 'cinematic';
    if (this.sceneDef) { this.loadScene(this.scenePath || '/Demo/helicopter-24.scene'); }
    for (const [k, b] of Object.entries(this.modeBtns || {})) b.classList.toggle('on', k === 'show');
    this.updateModeVisibility();
    this.updateHud();
    this.render();
  }
  projectMenu(anchor) {
    const sys = this.sys;
    const ancestors = [];
    let p = sys.parent;
    while (p) { ancestors.unshift(p); p = p.parent; }
    if (!ancestors.length) { this.os.toast(sys, '投送', '当前系统没有祖先桌面', 'warn'); return; }
    const items = ancestors.map(a => ({
      icon: 'projection', label: `投送到 ${a.id}`, testid: 'project-target', targetSystemId: a.id,
      act: () => this.os.project(this.win, a)
    }));
    const r = anchor.getBoundingClientRect();
    const d = this.win.desktop;
    const local = d.toLocal(r.left, r.bottom);
    d.showContextMenu(r.left, r.bottom + 4, items);
  }

  applyProjectionAction(action) {
    if (!action) return;
    if (this.win.appId === 'projection') return;
    switch (action.type) {
      case 'toggle': this.togglePlay(); break;
      case 'pause': this.pause(); break;
      case 'stop': this.stop(); break;
      case 'step': this.stepFrame(); break;
      case 'seek': this.seek(action.time); break;
      case 'camera': this.cycleCamera(); break;
      case 'orbit':
        if (this.camera.mode !== 'free') {
          const hs = this.sceneState();
          this.camera.mode = 'free'; this.camera.target = [hs.heli.x, hs.heli.y + 1.2, hs.heli.z];
          this.camera.yaw = 0.7; this.camera.pitch = 0.34; this.camera.dist = 17;
        }
        this.camera.yaw += (action.dx || 0) * 0.008;
        this.camera.pitch = clamp(this.camera.pitch + (action.dy || 0) * 0.006, -0.1, 1.35);
        break;
      case 'zoom': this.camera.dist = clamp(this.camera.dist * (1 + Math.sign(action.delta) * 0.08), 5, 60); break;
      case 'select':
        if (action.pick) { this.selection = { ...action.pick, status: this.currentDamage() > 0.8 ? '损毁' : this.currentDamage() > 0.1 ? '受损' : '完好' }; this.showSelection(); }
        break;
      case 'ground':
        if (this.mode === 'rehearsal') {
          const hdg = (deg(Math.atan2(action.x, action.z)) + 360) % 360;
          this.headingEl.value = String(Math.round(hdg)); this.applyRehEnv();
        }
        break;
      default: break;
    }
    this.render();
  }

  inspect(win) {
    const dur = this.mode === 'record' && this.record ? this.record.duration : this.duration;
    return {
      windowId: win.id, systemId: this.sys.id,
      state: this.playing ? 'playing' : (this.mode === 'rehearsal' ? 'paused' : 'paused'),
      position: +this.time.toFixed(3), duration: +dur.toFixed(3), rate: this.rate,
      scene: this.scenePath, frameTime: +(this.sceneState().time || 0).toFixed(3)
    };
  }

  serialize() {
    const out = {
      mode: this.mode, scenePath: this.scenePath, time: this.time, duration: this.duration,
      playing: this.playing, rate: this.rate, loop: this.loop, camera: this.camera,
      selection: this.selection, wind: this.wind, heading: this.heading, faultAt: this.faultAt,
      controllerPath: this.controllerPath
    };
    if (this.mode === 'rehearsal' && this.sim) {
      out.sim = this.sim.snapshot();
      out.recordSamples = this.recordSamples.slice(-4000);
      out.recordInitial = this.recordInitial;
    }
    if (this.mode === 'record' && this.record) {
      out.record = this.record;
    }
    return out;
  }
  restore(st) {
    if (!st) return;
    this.duration = st.duration || 15;
    this.rate = st.rate || 1;
    this.loop = !!st.loop;
    this.playing = !!st.playing;
    this.camera = st.camera || this.camera;
    this.selection = st.selection || null;
    this.wind = st.wind ?? 2.2;
    this.heading = st.heading ?? 0;
    this.faultAt = st.faultAt ?? 0;
    this.controllerPath = st.controllerPath || '/System/controller.prog';
    if (st.scenePath) this.loadScene(st.scenePath);
    this.time = st.time || 0;
    this.playing = !!st.playing;
    this.lastClock = 0;
    this.lastFlightClock = 0;
    if (st.mode === 'record' && st.record) {
      this.record = st.record;
      this.recordSamples = st.record.samples || [];
      this.recordInitial = st.record.initial;
      this.mode = 'record';
    } else if (st.mode === 'rehearsal') {
      this.mode = 'rehearsal';
      if (st.sim) {
        if (!this.sim) this.sim = new FlightSim(this.sceneDef, {});
        this.sim.restore(st.sim);
        this.recordSamples = st.recordSamples || [];
        this.recordInitial = st.recordInitial;
      }
    } else this.mode = st.mode || 'show';
    for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', k === this.mode);
    this.updateModeVisibility();
    this.updateCamBtn();
    this.showSelection();
    this.updateHud();
    this.render();
  }
  beforeClose() { return true; }
  tick() { this.updateHud(); }
  dispose() { this.ro?.disconnect(); this.view?.dispose(); this.view = null; }
}

function hdiv() { return h('div', { class: 'spacer' }); }