/* =========================================================================
 *  动态路由塔防 · 路线可视化
 *  routeviz.js — 入口路线标记 / 流动指示 / 改道预览
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;

  const V = {
    scene: null, world: null, groups: {}, ghosts: {}, chevrons: [], time: 0
  };

  V.init = function (scene, world) {
    V.scene = scene; V.world = world;
    if (!V.root) {
      V.root = new T.Group();
      scene.add(V.root);
    }
  };

  function ribbonGeo(pts, width) {
    const positions = [], uvs = [], indices = [];
    const half = width / 2;
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x, dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      const nx = -dz, nz = dx;
      positions.push(p.x + nx * half, p.y + 0.11, p.z + nz * half);
      positions.push(p.x - nx * half, p.y + 0.11, p.z - nz * half);
      if (i > 0) acc += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      uvs.push(0, acc / 4, 1, acc / 4);
      if (i < pts.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      g.remove(c);
      if (c.geometry) c.geometry.dispose();
    }
  }

  /* 建立/刷新入口路线带 */
  V.build = function (routes) {
    const world = V.world;
    if (!world) return;
    Object.keys(routes).forEach((id) => {
      if (!V.groups[id]) {
        const g = new T.Group();
        V.root.add(g);
        V.groups[id] = g;
      }
      const g = V.groups[id];
      clearGroup(g);
      const r = routes[id];
      if (!r || !r.pts || r.pts.length < 2) return;
      const entry = world.net.v[id];
      const col = new T.Color(entry.color || world.theme.accent);
      const mat = new T.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.42,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      });
      const mesh = new T.Mesh(ribbonGeo(r.pts, 0.62), mat);
      g.add(mesh);
      // 流动箭头贴图叠加
      const flowMat = new T.MeshBasicMaterial({
        color: col, map: RT.Art.getTextures(world.theme).road,
        transparent: true, opacity: 0.5, blending: T.AdditiveBlending,
        depthWrite: false, side: T.DoubleSide
      });
      const flow = new T.Mesh(ribbonGeo(r.pts, 0.5), flowMat);
      flow.position.y = 0.015;
      g.add(flow);
      // 方向指示
      const chev = new T.Group();
      const shape = new T.Shape();
      shape.moveTo(0, 0.42); shape.lineTo(0.36, -0.28); shape.lineTo(0, -0.05); shape.lineTo(-0.36, -0.28);
      const geo = new T.ShapeGeometry(shape);
      const cm = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
      for (let i = 0; i < 3; i++) {
        const c = new T.Mesh(geo, cm);
        c.rotation.x = -Math.PI / 2;
        chev.add(c);
      }
      g.add(chev);
      V.chevrons = V.chevrons.filter((c) => c.entry !== id);
      V.chevrons.push({ entry: id, group: chev, route: r, flowMat: flowMat });
    });
  };

  /* 改道预览：显示新路线（虚线幽灵） */
  V.showPreview = function (preview, base) {
    V.hidePreview();
    const world = V.world;
    if (!world) return;
    Object.keys(preview).forEach((id) => {
      const p = preview[id], b = base[id];
      if (!p || !p.pts || p.pts.length < 2) return;
      if (b && RT.Net.sameRoute(b, p)) return;
      const g = new T.Group();
      V.root.add(g);
      const mat = new T.MeshBasicMaterial({
        color: new T.Color('#ffe66a'), transparent: true, opacity: 0.75,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      });
      // 分段虚线
      for (let i = 0; i < p.pts.length - 1; i += 2) {
        const seg = p.pts.slice(i, Math.min(p.pts.length, i + 2));
        if (seg.length < 2) break;
        g.add(new T.Mesh(ribbonGeo(seg, 0.5), mat));
      }
      // 起点标记
      const s = p.pts[0];
      const ring = new T.Mesh(new T.RingGeometry(0.7, 0.95, 24), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, s.y + 0.12, s.z);
      g.add(ring);
      V.ghosts[id] = g;
    });
  };

  V.hidePreview = function () {
    Object.keys(V.ghosts).forEach((id) => {
      const g = V.ghosts[id];
      V.root.remove(g);
      clearGroup(g);
    });
    V.ghosts = {};
  };

  V.update = function (dt) {
    V.time += dt;
    V.chevrons.forEach((c) => {
      const r = c.route;
      if (!r || !r.pts || r.pts.length < 2) return;
      c.flowMat.map.offset.y -= dt * 0.55;
      const len = r.cum && r.cum.length ? r.cum[r.cum.length - 1] : 1;
      c.group.children.forEach((m, i) => {
        const d = ((V.time * 7 + i * (len / 3)) % len);
        let k = 0;
        while (k < r.cum.length - 2 && r.cum[k + 1] < d) k++;
        const t = (d - r.cum[k]) / Math.max(0.001, r.cum[k + 1] - r.cum[k]);
        const a = r.pts[k], b = r.pts[k + 1];
        m.position.set(a.x + (b.x - a.x) * t, a.y + 0.16, a.z + (b.z - a.z) * t);
        const ang = Math.atan2(b.x - a.x, b.z - a.z);
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.rotateOnWorldAxis(new T.Vector3(0, 1, 0), ang + Math.PI);
      });
    });
  };

  V.reset = function () {
    Object.keys(V.groups).forEach((id) => {
      const g = V.groups[id];
      V.root.remove(g); clearGroup(g);
    });
    V.groups = {}; V.chevrons = [];
    V.hidePreview();
  };

  RT.RouteViz = V;
})(typeof window !== 'undefined' ? window : globalThis);
