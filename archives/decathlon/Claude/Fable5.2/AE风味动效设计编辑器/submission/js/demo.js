// 临时测试工程（稍后替换为「锻字」示例）
(function () {
  'use strict';
  const MF = window.MF, App = MF.App, Model = MF.Model, N = MF.Nodes;
  MF.Demo = {
    load() {
      const P = Model.newProject(); P.name = '测试';
      const c = Model.newComp(P, { name: '主合成', w: 1920, h: 1080, fps: 30, duration: 8 });
      c.env.preset = 'forge';
      // 2D 形状
      const S = Model.newLayer(P, c, 'shape', { name: '矩形' });
      S.items.push(Model.newShapeItem(P, 'rect', { size: [400, 260], roundness: 30 }), Model.newShapeItem(P, 'stroke', { width: 10, color: [1, 1, 1, 1] }), Model.newShapeItem(P, 'fill', { color: [0.2, 0.5, 0.9, 1] }));
      S.tr.position.v = [400, 300, 0]; S.tr.rotation.k = [MF.Anim.mkKey(0, 0), MF.Anim.mkKey(4, 180)]; S.fx.push(Model.newEffect(P, 'shadow'));
      const Tx = Model.newLayer(P, c, 'text', { name: '标题', str: '锻字 Forge' }); Tx.tr.position.v = [1400, 250, 0]; Tx.text.p.size.v = 120;
      // 3D
      const G = Model.newLayer(P, c, 'geo', { name: '字块' });
      const n1 = N.create(P, 'textGlyph', { x: 40, y: 40, s: { text: '金', font: 'kai' }, p: { size: 460 } });
      const n2 = N.create(P, 'mesh', { x: 230, y: 40, p: { density: 20 } }); n2.in.geo = { n: n1.id, p: 'geo' };
      const n3 = N.create(P, 'extrude', { x: 420, y: 40, p: { depth: 90, bevel: 6 } }); n3.in.geo = { n: n2.id, p: 'geo' };
      const n4 = N.create(P, 'xform3', { x: 610, y: 40, p: { position: [960, 600, 0], rotation: [-25, 30, 0] } }); n4.in.geo = { n: n3.id, p: 'geo' };
      const n5 = N.create(P, 'geoLayer', { x: 800, y: 40, s: { layer: G.id } }); n5.in.geo = { n: n4.id, p: 'geo' };
      const fl = N.create(P, 'box', { x: 420, y: 200, p: { size: [2400, 40, 1600] } });
      const fx = N.create(P, 'xform3', { x: 610, y: 200, p: { position: [960, 880, 0] } }); fx.in.geo = { n: fl.id, p: 'geo' };
      const F = Model.newLayer(P, c, 'geo', { name: '地面' }); F.geo.p.baseColor.v = [0.25, 0.25, 0.27, 1]; F.geo.p.metallic.v = 0.2; F.geo.p.roughness.v = 0.7; F.geo.s.cast = false;
      const n6 = N.create(P, 'geoLayer', { x: 800, y: 200, s: { layer: F.id } }); n6.in.geo = { n: fx.id, p: 'geo' };
      c.nodes.push(n1, n2, n3, n4, n5, fl, fx, n6);
      const Lt = Model.newLayer(P, c, 'light', { name: '主光', kind: 'parallel' }); Lt.tr.position.v = [400, -600, -900]; Lt.light.p.poi.v = [960, 700, 0];
      const Cam = Model.newLayer(P, c, 'camera', { name: '摄像机' }); Cam.tr.position.v = [960, 200, -2400]; Cam.cam.p.poi.v = [960, 620, 0];
      App.setProject(P);
    },
  };
})();
