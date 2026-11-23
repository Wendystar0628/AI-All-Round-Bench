/* ===== app.js : 主循环、界面、相机交互 ===== */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const App = {
  canvas: null, R: null, stage: null, scenes: {}, scene: null, sceneKey: 'jelly',
  paused: false, speed: 1, last: 0, mode: 'live', // live | demo | export
  userCam: null, hudHidden: false, ready: false, statT: 0,
  toastT: 0,

  async init() {
    this.canvas = $('#view');
    try {
      this.R = new Renderer();
      await this.R.init(this.canvas);
      this.stage = new Stage(this.R);
      this.scenes.jelly = new JellyScene(this.R, this.stage);
      if (typeof TankScene !== 'undefined') this.scenes.tank = new TankScene(this.R, this.stage);
    } catch (e) {
      console.error(e);
      const f = $('#fatal'); f.style.display = 'flex';
      f.innerHTML = '<div style="font-size:20px">无法启动 WebGPU</div><div>' + (e.message || e) + '</div><div style="color:#8da3b5;font-size:13px">请使用支持 WebGPU 的 Chrome（需启用硬件加速）</div>';
      $('#loading').style.display = 'none';
      return;
    }
    this.bindUI();
    this.bindCamera();
    if (typeof AudioFx !== 'undefined') this.audio = new AudioFx();
    this.switchScene('jelly', true);
    this.ready = true;
    $('#loading').style.opacity = 0; setTimeout(() => $('#loading').style.display = 'none', 600);
    window.addEventListener('resize', () => { if (this.mode !== 'export') this.R.resize(); });
    requestAnimationFrame(t => this.loop(t));
  },

  /* ---------- 场景切换 ---------- */
  switchScene(key, first) {
    if (!this.scenes[key]) { this.toast('该场景尚未就绪'); return; }
    if (this.demo && this.demo.active) this.demo.stop();
    this.sceneKey = key;
    this.scene = this.scenes[key];
    this.scene.setupView();
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.scene === key));
    const cd = this.scene.camDefault;
    this.userCam = Object.assign({}, cd, { target: cd.target.slice() });
    this.applyUserCam();
    this.buildSide();
    $('#side').classList.toggle('water', key === 'tank');
    if (this.audio) this.audio.setScene(key);
    this.setPaused(false);
  },
  applyUserCam() { Object.assign(this.R.cam, this.userCam, { target: this.userCam.target.slice() }); },

  /* ---------- 主循环 ---------- */
  loop(ts) {
    requestAnimationFrame(t => this.loop(t));
    if (!this.ready || this.mode === 'export') return;
    const dtReal = Math.min(0.1, Math.max(0, (ts - (this.last || ts)) / 1000));
    this.last = ts;
    this.R.resize();
    const sc = this.scene;
    if (this.mode === 'demo' && this.demo.active) {
      this.demo.advance(dtReal);
    } else {
      this.applyUserCam();
      if (!this.paused) sc.advance(dtReal * this.speed);
    }
    this.handleEvents();
    const enc = GPUX.device.createCommandEncoder();
    sc.render(enc);
    GPUX.device.queue.submit([enc.finish()]);
    if (sc.afterSubmit) sc.afterSubmit();
    this.statT += dtReal;
    if (this.statT > 0.25) { this.statT = 0; this.updateStat(dtReal); }
  },
  handleEvents() {
    const sc = this.scene;
    const ev = sc.drainEvents ? sc.drainEvents() : [];
    if (this.audio && this.mode !== 'export') this.audio.consume(ev, sc);
  },

  /* ---------- 控制 ---------- */
  setPaused(p) { this.paused = p; $('#btnPause').textContent = p ? '▶ 继续' : '⏸ 暂停'; $('#btnPause').classList.toggle('on', p); },
  setSpeed(s) { this.speed = s; $$('#speedGrp .btn').forEach(b => b.classList.toggle('on', +b.dataset.speed === s)); },
  toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), 1800);
  },
  resetScene() { if (this.demo && this.demo.active) this.demo.stop(); this.scene.reset(this.scene.layout); this.scene.setupView(); this.setPaused(false); this.buildSide(); },

  bindUI() {
    $$('.tab').forEach(t => t.onclick = () => this.switchScene(t.dataset.scene));
    $('#btnPause').onclick = () => this.setPaused(!this.paused);
    $$('#speedGrp .btn').forEach(b => b.onclick = () => this.setSpeed(+b.dataset.speed));
    this.setSpeed(1);
    $('#btnReset').onclick = () => { this.resetScene(); this.toast('已重置'); };
    $('#btnRerun').onclick = () => { this.resetScene(); if (this.scene.rerun) this.scene.rerun(); this.toast('重新运行'); };
    $('#btnHide').onclick = () => this.toggleHud();
    $('#btnSound').onclick = () => {
      if (!this.audio) return;
      const on = this.audio.toggle();
      $('#btnSound').textContent = on ? '🔊 音效：开' : '🔇 音效：关';
      $('#btnSound').classList.toggle('on', on);
    };
    $('#btnDemoToggle').onclick = () => { const d = $('#demoBar'); d.style.display = d.style.display === 'none' ? 'block' : 'none'; };
    $$('.demoBtn').forEach(b => b.onclick = () => { if (this.demo) this.demo.start(b.dataset.run, true); });
    $('#btnDemoStop').onclick = () => { if (this.demo) this.demo.stop(); };
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'h' || e.key === 'H') this.toggleHud();
      else if (e.key === ' ') { e.preventDefault(); this.setPaused(!this.paused); }
      else if (e.key === 'r' || e.key === 'R') { this.resetScene(); }
      else if (e.key === '1') this.switchScene('jelly');
      else if (e.key === '2') this.switchScene('tank');
    });
  },
  toggleHud() { this.hudHidden = !this.hudHidden; $('#ui').classList.toggle('hidden', this.hudHidden); },

  bindCamera() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }; c.setPointerCapture(e.pointerId); c.focus(); });
    c.addEventListener('pointerup', e => { drag = null; });
    c.addEventListener('pointermove', e => {
      if (!drag || this.mode !== 'live') return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      const u = this.userCam;
      if (drag.btn === 2 || drag.btn === 1 || drag.shift) {
        const k = u.dist * 0.0014;
        const cy = Math.cos(u.yaw), sy = Math.sin(u.yaw);
        u.target[0] -= dx * k * cy; u.target[2] += dx * k * sy;
        u.target[1] += dy * k;
      } else {
        u.yaw -= dx * 0.005; u.pitch = clamp(u.pitch + dy * 0.005, -0.05, 1.5);
      }
    });
    c.addEventListener('wheel', e => {
      if (this.mode !== 'live') return;
      e.preventDefault();
      this.userCam.dist = clamp(this.userCam.dist * Math.exp(e.deltaY * 0.0011), 0.6, 9);
    }, { passive: false });
    c.addEventListener('dblclick', () => { const cd = this.scene.camDefault; this.userCam = Object.assign({}, cd, { target: cd.target.slice() }); });
  },

  /* ---------- 侧栏 ---------- */
  slider(id, label, min, max, step, val, fmt) {
    return `<div class="row"><label>${label}<em id="${id}v">${fmt(val)}</em></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  },
  bindSlider(id, fmt, cb) {
    const el = $('#' + id); if (!el) return;
    el.oninput = () => { $('#' + id + 'v').textContent = fmt(+el.value); cb(+el.value); };
  },
  buildSide() {
    if (this.sceneKey === 'jelly') this.buildJellySide(); else this.buildTankSide();
  },
  buildJellySide() {
    const S = this.scene, P = S.params, el = $('#side');
    const tgt = P.target, jp = S.jellyParams[tgt];
    const kinds = ['钢球', '石球', '铜球'];
    const names = ['红莓', '青柠', '琥珀'], cols = ['#ff4d6b', '#8ee03a', '#ffa21a'];
    el.innerHTML = `
      <h3>果冻</h3>
      <div class="chips" id="chTarget">${names.map((n, i) => `<div class="chip ${i === tgt ? 'on' : ''}" data-i="${i}"><span class="dot" style="background:${cols[i]}"></span>${n}</div>`).join('')}</div>
      ${this.slider('sSoft', '软硬（越右越硬）', 0, 100, 1, jp.s, v => v + '')}
      ${this.slider('sTough', '结实程度（越右越不易裂）', 0, 100, 1, jp.t, v => v + '')}
      <div class="sep"></div>
      <h3>重球</h3>
      ${this.slider('sMass', '质量', 1, 20, 0.5, P.mass, v => v.toFixed(1) + ' kg')}
      ${this.slider('sHeight', '下落高度', 0.15, 1.5, 0.05, P.height, v => v.toFixed(2) + ' m')}
      <div class="chips" id="chKind">${kinds.map((n, i) => `<div class="chip ${i === P.kind ? 'on' : ''}" data-i="${i}">${n}</div>`).join('')}</div>
      <div class="sep"></div>
      <h3>触发冲击</h3>
      <div class="btnrow"><button class="btn primary" id="bC">正中</button><button class="btn primary" id="bO">偏心</button><button class="btn primary" id="bM">连续</button></div>
      <div class="note">正中：重球正对果冻落下；偏心：偏离中心并带水平速度斜撞；连续：多球先后落下，后一球赶在振荡平息前砸下。右键/Shift 拖动平移，滚轮缩放，左键拖动旋转，双击复位视角。</div>`;
    $$('#chTarget .chip').forEach(c => c.onclick = () => { P.target = +c.dataset.i; this.buildJellySide(); });
    $$('#chKind .chip').forEach(c => c.onclick = () => { P.kind = +c.dataset.i; $$('#chKind .chip').forEach(x => x.classList.toggle('on', x === c)); });
    this.bindSlider('sSoft', v => v + '', v => { S.jellyParams[P.target].s = v; S.applyJellyParams(P.target); });
    this.bindSlider('sTough', v => v + '', v => { S.jellyParams[P.target].t = v; S.applyJellyParams(P.target); });
    this.bindSlider('sMass', v => v.toFixed(1) + ' kg', v => P.mass = v);
    this.bindSlider('sHeight', v => v.toFixed(2) + ' m', v => P.height = v);
    $('#bC').onclick = () => { this.audio && this.audio.unlock(); S.triggerCenter(); };
    $('#bO').onclick = () => { this.audio && this.audio.unlock(); S.triggerOffset(); };
    $('#bM').onclick = () => { this.audio && this.audio.unlock(); S.triggerMulti(); };
  },
  buildTankSide() {
    if (this.scene.buildSide) this.scene.buildSide(this);
  },
  updateStat() {
    const el = $('#stat'), S = this.scene;
    if (S.statText) el.innerHTML = S.statText();
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
