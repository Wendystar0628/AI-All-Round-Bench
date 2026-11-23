'use strict';
/* ---------------------------------------------------------------------------
   UI wiring (Chinese interface)
--------------------------------------------------------------------------- */

const DENSITY_GROUPS = [
  { name: '低密度', color: '#ffc94a', density: 300, hint: '漂浮' },
  { name: '中低', color: '#ff8a5b', density: 650, hint: '半浸' },
  { name: '中性', color: '#5be3a0', density: 1000, hint: '悬浮' },
  { name: '中高', color: '#4fb3ff', density: 1400, 'hint': '缓沉' },
  { name: '高密度', color: '#e85dff', density: 2200, hint: '沉底' },
];

class UI {
  constructor(app) {
    this.app = app;
    this.el = (id) => document.getElementById(id);
    this.toastTimer = 0;
  }

  init() {
    const app = this.app;
    // scene tabs
    document.querySelectorAll('#sceneTabs .tab').forEach((b) => {
      b.addEventListener('click', () => {
        app.setScene(parseInt(b.dataset.scene, 10));
        document.querySelectorAll('#sceneTabs .tab').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    // ---- scene 1 sliders ----
    const bindRange = (id, vid, fmt, cb) => {
      const r = this.el(id), v = this.el(vid);
      const upd = () => { v.textContent = fmt(parseFloat(r.value)); };
      r.addEventListener('input', () => { upd(); cb(parseFloat(r.value)); });
      upd();
      return r;
    };
    this.soft = bindRange('pSoft', 'pSoftV', (x) => x.toFixed(0), (x) => app.scene1.setParam('softness', x / 100));
    this.tough = bindRange('pTough', 'pToughV', (x) => x.toFixed(0), (x) => app.scene1.setParam('toughness', x / 100));
    this.mass = bindRange('pMass', 'pMassV', (x) => x.toFixed(1) + ' kg', (x) => { app.scene1.params.mass = x; });
    this.height = bindRange('pHeight', 'pHeightV', (x) => (x / 100).toFixed(2) + ' m', (x) => { app.scene1.params.height = x / 100; });

    // impacts
    document.querySelectorAll('[data-impact]').forEach((b) => {
      b.addEventListener('click', () => {
        if (app.sceneId !== 1) app.setScene(1);
        app.scene1.trigger(b.dataset.impact);
        app.lastAction = { kind: 'impact', type: b.dataset.impact };
        app.camMode = 'free';
        this.flash(b);
        this.toast(b.dataset.impact === 'center' ? '正中冲击' : b.dataset.impact === 'offset' ? '偏心冲击' : '连续冲击');
      });
    });

    // ---- scene 2 ----
    this.buildDensityRows();
    bindRange('pWaveAmp', 'pWaveAmpV', (x) => (x / 1000).toFixed(3) + ' m', (x) => app.scene2.setWaveAmp(x / 1000));
    bindRange('pWaveFreq', 'pWaveFreqV', (x) => (x / 100).toFixed(2) + ' Hz', (x) => app.scene2.setWaveFreq(x / 100));
    this.el('btnWaveStart').addEventListener('click', () => { app.scene2.setWaving(true); this.toast('造浪开始'); });
    this.el('btnWaveStop').addEventListener('click', () => { app.scene2.setWaving(false); this.toast('造浪停止'); });
    this.el('btnRelease').addEventListener('click', () => { app.scene2.releaseBalls(); this.toast('释放小球'); });
    this.el('btnSettle').addEventListener('click', () => { app.scene2.settle(); this.toast('水体静置'); });

    // ---- transport ----
    this.btnPlay = this.el('btnPlay');
    this.btnPlay.addEventListener('click', () => {
      app.paused = !app.paused;
      this.btnPlay.classList.toggle('active', app.paused);
      this.btnPlay.querySelector('span').textContent = app.paused ? '继续' : '暂停';
      this.toast(app.paused ? '已暂停' : '继续');
    });
    this.btnSlow = this.el('btnSlow');
    this.btnSlow.addEventListener('click', () => {
      const on = app.timeScale !== 0.25;
      app.timeScale = on ? 0.25 : 1;
      this.btnSlow.classList.toggle('active', on);
      this.btnSlow.querySelector('span').textContent = on ? '慢放 ×0.25' : '正常速度';
      this.toast(on ? '慢放 0.25×' : '恢复正常速度');
    });
    this.el('btnReset').addEventListener('click', () => {
      app.scene.reset();
      app.paused = false;
      this.btnPlay.classList.remove('active');
      this.btnPlay.querySelector('span').textContent = '暂停';
      this.toast('已重置');
    });
    this.el('btnRerun').addEventListener('click', () => {
      app.scene.reset();
      app.paused = false;
      this.btnPlay.classList.remove('active');
      this.btnPlay.querySelector('span').textContent = '暂停';
      if (app.lastAction && app.lastAction.kind === 'demo') app.demos.play(app.lastAction.id);
      else if (app.lastAction && app.lastAction.kind === 'impact') app.scene1.trigger(app.lastAction.type);
      else if (app.sceneId === 2) app.scene2.releaseBalls();
      this.toast('重新运行');
    });

    // ---- demos ----
    document.querySelectorAll('.demoBtn').forEach((b) => {
      b.addEventListener('click', () => app.demos.play(b.dataset.run));
    });

    // ---- sound ----
    this.btnSound = this.el('btnSound');
    this.btnSound.addEventListener('click', () => {
      const on = app.audio.toggle();
      this.btnSound.classList.toggle('on', on);
      this.toast(on ? '音效开启' : '音效关闭');
    });

    // ---- help ----
    this.el('btnHelp').addEventListener('click', () => this.el('help').classList.remove('hidden'));
    this.el('btnHelpClose').addEventListener('click', () => this.el('help').classList.add('hidden'));
    this.el('help').addEventListener('click', (e) => { if (e.target.id === 'help') this.el('help').classList.add('hidden'); });

    this.onSceneChange(1);
  }

  buildDensityRows() {
    const host = this.el('densityRows');
    host.innerHTML = '';
    this.densityInputs = [];
    DENSITY_GROUPS.forEach((g, i) => {
      const row = document.createElement('div');
      row.className = 'dRow';
      row.innerHTML = `<i style="background:${g.color};color:${g.color}"></i><span>${g.name}</span>
        <input type="range" min="100" max="3000" step="10" value="${g.density}">
        <em>${g.density}</em>`;
      host.appendChild(row);
      const r = row.querySelector('input'), em = row.querySelector('em');
      r.addEventListener('input', () => {
        const v = parseInt(r.value, 10);
        em.textContent = v;
        this.app.scene2.setGroupDensity(i, v);
        this.updateLegend();
      });
      this.densityInputs.push(r);
    });
  }

  updateLegend() {
    const vals = this.densityInputs.map((r) => parseInt(r.value, 10));
    const rows = document.querySelectorAll('#legend2 .lRow');
    rows.forEach((row, i) => {
      const v = vals[i];
      const hint = v < 800 ? '漂浮' : v < 1150 ? (v < 950 ? '半浸' : '悬浮') : v < 1800 ? '缓沉' : '沉底';
      row.querySelector('em').textContent = hint;
      const sp = row.querySelector('span');
      if (sp) sp.textContent = DENSITY_GROUPS[i].name + ' ' + v;
    });
  }

  onSceneChange(n) {
    this.el('page1').classList.toggle('hidden', n !== 1);
    this.el('page2').classList.toggle('hidden', n !== 2);
    this.el('legend1').classList.toggle('hidden', n !== 1);
    this.el('legend2').classList.toggle('hidden', n !== 2);
    document.querySelectorAll('#sceneTabs .tab').forEach((x) => {
      x.classList.toggle('active', parseInt(x.dataset.scene, 10) === n);
    });
    if (n === 2) this.updateLegend();
  }

  demoCameraOff() {
    if (this.app.demos) this.app.demos.cameraOverride = false;
  }

  flash(btn) {
    btn.classList.add('lit');
    setTimeout(() => btn.classList.remove('lit'), 260);
  }

  toast(msg) {
    const t = this.el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
  }

  setPlaying(runId) {
    document.querySelectorAll('.demoBtn').forEach((b) => b.classList.toggle('playing', b.dataset.run === runId));
  }

  tick(dt) {
    const d = this.app.demos;
    if (d && d.active) {
      const p = d.progress();
      this.setPlaying(d.runId);
      if (p >= 1) { d.stop(); this.setPlaying(null); }
    } else if (d && d.runId) {
      this.setPlaying(null);
    }
  }
}
