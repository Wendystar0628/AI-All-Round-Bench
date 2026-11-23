/* 界面绑定 */
'use strict';
const UI = {
  toastTimer: 0,
  init() {
    const $ = (id) => document.getElementById(id);
    // 首次交互解锁音频
    const unlock = () => { Snd.ensure(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    // 场景切换
    $('tab0').onclick = () => { App.switchScene(0); };
    $('tab1').onclick = () => { App.switchScene(1); };
    // 音效
    $('soundBtn').onclick = () => {
      Snd.ensure();
      Snd.setMuted(!Snd.muted);
      $('soundBtn').textContent = Snd.muted ? '🔇 音效关' : '🔊 音效开';
      $('soundBtn').classList.toggle('off', Snd.muted);
    };
    // 场景一
    $('selTarget').onchange = (e) => { Scene1.params.target = +e.target.value; };
    const bindRange = (id, vid, fmt, fn) => {
      const el = $(id);
      el.addEventListener('input', () => {
        const v = +el.value;
        $(vid).textContent = fmt(v);
        fn(v);
      });
    };
    bindRange('rngSoft', 'vSoft', v => v.toFixed(2), v => { Scene1.params.softness = v; Scene1.applyParams(); });
    bindRange('rngTough', 'vTough', v => v.toFixed(2), v => { Scene1.params.toughness = v; Scene1.applyParams(); });
    bindRange('rngMass', 'vMass', v => v.toFixed(1) + ' kg', v => { Scene1.params.mass = v; });
    bindRange('rngHeight', 'vHeight', v => v.toFixed(2) + ' m', v => { Scene1.params.height = v; });
    $('selMaterial').onchange = (e) => { Scene1.params.material = e.target.value; };
    $('btnCenter').onclick = () => { Snd.ensure(); Scene1.trigger('center'); this.toast('正中冲击'); };
    $('btnOffset').onclick = () => { Snd.ensure(); Scene1.trigger('offset'); this.toast('偏心冲击'); };
    $('btnMulti').onclick = () => { Snd.ensure(); Scene1.trigger('multi'); this.toast('连续冲击 · 三球接连落下'); };
    // 场景二
    for (let g = 0; g < 4; g++) {
      bindRange('rngD' + g, 'vD' + g, v => v.toFixed(2), v => {
        Scene2.groups[g].density = v;
        const V = Scene2.ballVolume();
        for (const b of Scene2.balls) if (b.group === g) { b.density = v; b.m = v * 1000 * V; b.invM = 1 / b.m; }
      });
    }
    bindRange('rngAmp', 'vAmp', v => v.toFixed(3) + ' m', v => { Scene2.wave.amp = v; });
    bindRange('rngFreq', 'vFreq', v => v.toFixed(2) + ' Hz', v => { Scene2.wave.freq = v; });
    $('btnDrop').onclick = () => { Snd.ensure(); Scene2.dropBalls(); this.toast('释放 28 颗小球'); };
    $('btnWaveOn').onclick = () => { Snd.ensure(); Scene2.startWave(); this.toast('造浪开始'); this.syncWaveBtn(); };
    $('btnWaveOff').onclick = () => { Scene2.stopWave(); this.toast('造浪停止 · 余波衰减'); this.syncWaveBtn(); };
    // 运行控制
    $('btnPause').onclick = () => {
      App.paused = !App.paused;
      $('btnPause').textContent = App.paused ? '▶ 继续' : '⏸ 暂停';
      $('btnPause').classList.toggle('on', App.paused);
      this.syncMode();
    };
    $('btnSlow').onclick = () => {
      App.slow = !App.slow;
      $('btnSlow').classList.toggle('on', App.slow);
      this.toast(App.slow ? '慢放 0.25×' : '常速');
      this.syncMode();
    };
    $('btnReset').onclick = () => App.resetScene();
    $('btnRerun').onclick = () => App.rerun();
    // 演示
    document.querySelectorAll('.demo-btn').forEach(btn => {
      btn.onclick = () => App.startDemo(btn.dataset.run);
    });
    $('demoExit').onclick = () => App.exitDemo();
    this.syncScene();
  },
  syncScene() {
    const is1 = App.scene === Scene1;
    document.getElementById('panel1').hidden = !is1;
    document.getElementById('panel2').hidden = is1;
    document.getElementById('tab0').classList.toggle('active', is1);
    document.getElementById('tab1').classList.toggle('active', !is1);
    if (!is1) this.syncWaveBtn();
    this.syncMode();
  },
  syncWaveBtn() {
    const on = Scene2.wave.on;
    document.getElementById('btnWaveOn').classList.toggle('on', on);
    document.getElementById('btnWaveOff').classList.toggle('on', !on);
  },
  syncMode() {
    const el = document.getElementById('stMode');
    el.textContent = App.paused ? '已暂停' : (App.slow ? '慢放 0.25×' : '实时');
  },
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  },
  updateStatus(fps, ms) {
    document.getElementById('stFps').textContent = fps.toFixed(0) + ' FPS · ' + ms.toFixed(1) + 'ms';
    const sc = App.scene;
    document.getElementById('stSim').textContent = '模拟 ' + sc.time.toFixed(1) + 's';
    const info = sc === Scene1
      ? '果冻 ×' + sc.jellies.length + ' · 球 ×' + sc.balls.length + (sc.jellies.some(j => j.broken) ? ' · 已开裂' : '')
      : '粒子 ' + (FL.particleCount / 1000).toFixed(0) + 'k · 球 ×' + sc.balls.length + (sc.wave.on ? ' · 造浪中' : '');
    document.getElementById('stInfo').textContent = info;
    if (sc === Scene2) this.syncWaveBtn();
  },
  showDemoUI(def) {
    document.getElementById('demoChip').hidden = false;
    document.getElementById('demoBars').hidden = false;
    document.getElementById('demoTitle').textContent = '演示 · ' + def.title;
  },
  hideDemoUI() {
    document.getElementById('demoChip').hidden = true;
    document.getElementById('demoBars').hidden = true;
  },
  updateDemoProgress() {
    const st = Demos.active;
    if (!st) return;
    const p = st.demoTime / st.def.duration;
    document.getElementById('demoFill').style.width = (p * 100).toFixed(1) + '%';
    document.getElementById('demoTime').textContent = st.demoTime.toFixed(1) + ' / ' + st.def.duration.toFixed(1) + ' s';
  }
};
window.UI = UI;
