/* scene_tank.js — 场景二：多密度球与造浪水槽（占位，后续实现） */
(function () {
  const App = (window.App = window.App || {});
  const { M4, el } = App.util;

  class SceneTank {
    constructor(renderer) {
      this.renderer = renderer;
      this.name = 'tank';
      this.title = '场景二 · 多密度球造浪水槽';
      this.camera = new App.util.OrbitCamera();
      this.camera.target = new Float32Array([0, 0.35, 0]);
      this.camera.distance = 2.4;
      this.camera.yaw = -0.5;
      this.camera.pitch = 0.35;
      renderer.shadowExtent = 2.2;
      renderer.shadowCenter = new Float32Array([0, 0.3, 0]);
      this.floorMesh = renderer.createMesh(App.PRIM.primPlane(9, 9, 1));
      this.tankMesh = renderer.createMesh(App.PRIM.primBox(2.0, 0.9, 1.0));
      this.t = 0;
      this.params = { amp: 0.5, freq: 1.0, densities: [0.35, 0.7, 1.0, 1.6, 2.6] };
    }
    reset() { this.t = 0; }
    update(dt) { this.t += dt; }
    render(renderer) {
      renderer.setTime(this.t);
      renderer.begin(this.camera);
      renderer.endShadow();
      const pass = renderer.beginMain();
      renderer.drawMesh(pass, this.floorMesh, null, [0.16, 0.17, 0.20, 1], [0.9, 0, 1, App.RENDER_MODE.FLOOR], [0, 0, 0, 0]);
      renderer.drawMesh(pass, this.tankMesh, M4.translation(0, 0.45, 0), [0.6, 0.8, 0.9, 1], [0.1, 0, 0.15, App.RENDER_MODE.GLASS], [0, 0, 0, 0]);
      renderer.finishMainAndCopy();
      const tp = renderer.beginTransparent();
      renderer.end();
    }
    buildPanel(body) {
      const g = el('div', 'grp');
      g.appendChild(el('div', 'grp-title', '造浪'));
      App.util.makeSlider(g, { label: '幅度', min: 0.1, max: 1, step: 0.01, value: this.params.amp, onInput: (v) => this.params.amp = v });
      App.util.makeSlider(g, { label: '频率', min: 0.3, max: 2.5, step: 0.01, value: this.params.freq, onInput: (v) => this.params.freq = v });
      body.appendChild(g);
    }
    buildActions(box) {
      const b = el('button', 'abtn', '释放小球');
      b.addEventListener('click', () => {});
      box.appendChild(b);
    }
  }

  App.scenes = App.scenes || {};
  App.scenes.tank = { create: (r) => new SceneTank(r), title: '场景二 · 多密度球造浪水槽' };
})();
