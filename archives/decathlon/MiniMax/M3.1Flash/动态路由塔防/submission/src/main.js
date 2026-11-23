/* =========================================================================
 *  动态路由塔防 · 主程序
 *  main.js — 渲染循环 / 拾取 / 部署 / 预览 / 演示接入
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;
  const U = RT.util;
  const D = RT.DATA;

  const app = {
    renderer: null, scene: null, camera: null, rig: null,
    bus: new U.Bus(), audio: RT.Audio,
    world: null, net: null, mapDef: null, battle: null,
    previews: {}, previewId: null, menuCam: null, menuT: 0,
    running: false, mode: 'idle',   // idle | battle | demo | export
    scriptLock: false,              // 演示/导出时屏蔽真实输入
    lastTime: 0, acc: 0, FIXED: 1 / 60
  };

  /* ================= 初始化 ================= */
  function boot() {
    const canvas = document.getElementById('view');
    const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    app.renderer = renderer;

    const scene = new T.Scene();
    app.scene = scene;
    const camera = new T.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 600);
    app.camera = camera;
    app.rig = new RT.Scene.CameraRig(camera, canvas);
    app.menuCam = new T.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 900);
    app.menuCam.position.set(0, 26, 52);

    RT.FX.init(scene);
    RT.UI.init(app);
    RT.Demo && RT.Demo.init(app);
    buildMenuPreviews();

    window.addEventListener('resize', onResize);
    onResize();

    // 首次交互后开启声音
    const unlock = () => {
      RT.Audio.resume();
      if (app.mapDef) RT.Audio.startAmbient(app.mapDef.id);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // 点击拾取
    canvas.addEventListener('pointerdown', onCanvasDown);
    canvas.addEventListener('pointermove', onCanvasMove);

    requestAnimationFrame(loop);
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    app.camera.aspect = w / h;
    app.camera.updateProjectionMatrix();
    app.renderer.setSize(w, h);
    app.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /* ================= 菜单战场预览 ================= */
  // 预建三张地图的世界对象，菜单里以缓速环绕方式展示真实战场
  function buildMenuPreviews() {
    D.MAPS.forEach((m) => {
      const net = RT.Net.build(m);
      const world = RT.Scene.buildWorld(app.scene, m, net);
      world.root.visible = false;
      app.previews[m.id] = { world: world, net: net };
    });
    app.showPreviewMap(D.MAPS[0].id);
  }

  app.showPreviewMap = function (mapId) {
    app.previewId = mapId;
    Object.keys(app.previews).forEach((id) => {
      app.previews[id].world.root.visible = (id === mapId);
    });
    const pv = app.previews[mapId];
    if (pv) {
      app.menuSpan = Math.max(pv.net.cols, pv.net.rows) * RT.Net.CELL;
      // 预览战场也画出入口路线，背景更有信息量
      RT.RouteViz.reset();
      RT.RouteViz.init(app.scene, pv.world);
      RT.RouteViz.build(RT.Net.computeRoutes(pv.net, { isolatedNodes: {}, blockedEdges: {} }));
    }
  };

  function updateMenuCamera(dt) {
    app.menuT += dt;
    const span = app.menuSpan || 40;
    const az = app.menuT * 0.055;
    const pol = 0.62 + Math.sin(app.menuT * 0.11) * 0.07;
    const dist = span * 1.32;
    const c = app.menuCam;
    c.position.set(Math.sin(az) * Math.sin(pol) * dist, Math.cos(pol) * dist * 0.72 + 6, Math.cos(az) * Math.sin(pol) * dist);
    c.lookAt(0, 2.2, 0);
  }

  /* ================= 关卡装载 ================= */
  app.startMap = function (mapId, opts) {
    opts = opts || {};
    app.mode = 'battle';
    app.scriptLock = false;
    // 清理旧场景
    if (app.world) {
      app.scene.remove(app.world.root);
      app.world.root.traverse((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      });
      app.scene.remove(app.world.sky.parent);
    }
    if (app.battle) {
      app.battle.towers.forEach((t) => app.scene.remove(t.model.group));
      app.battle.enemies.forEach((e) => app.scene.remove(e.group));
    }
    RT.FX.clear();
    RT.RouteViz.reset();
    RT.UI.resetLog();
    RT.UI.showSelection(null);
    const mapDef = D.MAPS.filter((m) => m.id === mapId)[0] || D.MAPS[0];
    app.mapDef = mapDef;
    app.net = RT.Net.build(mapDef);
    app.world = RT.Scene.buildWorld(app.scene, mapDef, app.net);
    app.world.root.visible = true;
    // 菜单预览战场隐藏
    Object.keys(app.previews).forEach((id) => { app.previews[id].world.root.visible = false; });
    app.battle = new RT.Battle({
      net: app.net, world: app.world, scene: app.scene, camera: app.camera,
      bus: app.bus, mapDef: mapDef, audio: app.audio
    });
    RT.RouteViz.init(app.scene, app.world);
    RT.RouteViz.build(app.battle.routes);
    // 默认视角
    const span = Math.max(app.net.cols, app.net.rows) * RT.Net.CELL;
    app.rig.set(0, 0.74, span * 1.18, new T.Vector3(0, 1.5, 0));
    app.rig.snap();
    RT.UI.showScreen('hud');
    RT.UI.refreshLegend();
    RT.UI.notice('已接入 ' + mapDef.name + ' · ' + mapDef.sector, 'ok');
    RT.Audio.startAmbient(mapDef.id);
    RT.Audio.sfx('wave');
    app.running = true;
    app.lastTime = performance.now();
  };

  app.restart = function () {
    if (!app.mapDef) return;
    const id = app.mapDef.id;
    RT.UI.showScreen('hud');
    app.startMap(id);
  };

  // 回到默认视角（整张地图完整可见）
  app.resetView = function () {
    if (!app.net) return;
    const span = Math.max(app.net.cols, app.net.rows) * RT.Net.CELL;
    app.rig.set(0, 0.74, span * 1.18, new T.Vector3(0, 1.5, 0));
    app.rig.snap();
    RT.UI.notice('视角已复位', 'info');
    app.audio.sfx('click');
  };

  app.toMenu = function () {
    app.mode = 'idle';
    // 收起战场，回到菜单预览
    if (app.battle) {
      app.battle.towers.forEach((t) => app.scene.remove(t.model.group));
      app.battle.enemies.forEach((e) => app.scene.remove(e.group));
      app.battle = null;
    }
    if (app.world) {
      app.scene.remove(app.world.root);
      app.world.root.traverse((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      });
      app.world = null;
    }
    RT.FX.clear();
    RT.RouteViz.reset();
    app.showPreviewMap(app.mapDef ? app.mapDef.id : D.MAPS[0].id);
    RT.UI.showScreen('menu');
    RT.RouteViz.hidePreview();
  };

  app.togglePause = function () {
    if (!app.battle) return;
    app.battle.paused = !app.battle.paused;
    const btn = document.getElementById('btn-pause');
    if (btn) btn.textContent = app.battle.paused ? '继续' : '暂停';
    document.body.classList.toggle('paused', app.battle.paused);
    app.audio.sfx('click');
  };

  app.setSpeed = function (s) {
    if (!app.battle) return;
    app.battle.speed = s;
    U.$$('.btn.speed').forEach((b) => b.classList.toggle('active', b.getAttribute('data-speed') === '' + s));
    app.audio.sfx('click');
  };

  /* ================= 拾取 ================= */
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();

  function pickAt(cx, cy) {
    if (!app.world) return null;
    const rect = app.renderer.domElement.getBoundingClientRect();
    ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, app.camera);
    const targets = app.world.pickables.slice();
    if (app.battle) {
      app.battle.towers.forEach((t) => targets.push(t.model.group));
      app.battle.enemies.forEach((e) => targets.push(e.group));
    }
    const hits = ray.intersectObjects(targets, true);
    for (let i = 0; i < hits.length; i++) {
      let o = hits[i].object;
      while (o) {
        if (o.userData && o.userData.pick) {
          const p = o.userData.pick;
          if (p.kind === 'edge') {
            const cell = cellOnEdge(p.edge, hits[i].point);
            if (cell) return { kind: 'link', edge: p.edge, gx: cell.gx, gy: cell.gy, pos: cell.pos, point: hits[i].point };
          }
          return Object.assign({}, p, { point: hits[i].point });
        }
        o = o.parent;
      }
    }
    return null;
  }
  app.pick = pickAt;

  // 屏幕坐标 → 水平面（y 高度）上的世界点
  function groundPointAt(cx, cy, y) {
    const rect = app.renderer.domElement.getBoundingClientRect();
    ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, app.camera);
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -(y || 0));
    const out = new T.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  function cellOnEdge(edge, point) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < edge.pts.length - 1; i++) {
      const a = edge.pts[i], b = edge.pts[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const l2 = abx * abx + abz * abz || 1;
      let t = ((point.x - a.x) * abx + (point.z - a.z) * abz) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + abx * t, pz = a.z + abz * t;
      const d = (px - point.x) * (px - point.x) + (pz - point.z) * (pz - point.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    const c = edge.cells[best];
    return { gx: c.gx, gy: c.gy, pos: edge.pts[best] };
  }

  function onCanvasDown(e) {
    if (e.button !== 0) return;
    if (app.scriptLock && !app.demoControl) return;
    if (!app.battle || app.battle.over) return;
    // 瞄准模式：确认朝向
    if (app.aimMode) {
      const p = pickAt(e.clientX, e.clientY);
      const a = app.aimMode.tower;
      let pt = p && p.point ? p.point : null;
      if (!pt) pt = groundPointAt(e.clientX, e.clientY, a.model.group.position.y);
      if (pt) {
        a.facing = Math.atan2(pt.x - a.model.group.position.x, pt.z - a.model.group.position.z);
        a.model.group.rotation.y = a.facing;
        a.needFacing = false;
        a.aimed = true;
        app.aimMode = null;
        app.clearPreview();
        RT.UI.notice(D.TOWERS[a.type].name + ' 朝向已确认', 'ok');
        app.audio.sfx('select');
      } else {
        RT.UI.notice('请点击战场地面来设定朝向', 'warn');
      }
      return;
    }
    const cell = pickAt(e.clientX, e.clientY);
    if (!cell) { RT.UI.showSelection(null); return; }
    // 有待部署卡片 -> 尝试部署
    const drag = RT.UI.drag;
    if (drag && drag.type) {
      app.tryDeploy(drag.type, cell);
      RT.UI.drag = null;
      return;
    }
    if (drag && drag.item) {
      app.useItemAt(drag.item, cell);
      RT.UI.drag = null;
      return;
    }
    // 选中
    if (cell.kind === 'tower') RT.UI.showSelection({ kind: 'tower', tower: cell.tower });
    else if (cell.kind === 'enemy') RT.UI.showSelection({ kind: 'enemy', enemy: cell.enemy });
    else if (cell.kind === 'node') RT.UI.showSelection({ kind: 'node', vertex: cell.vertex });
    else if (cell.kind === 'platform') RT.UI.showSelection({ kind: 'platform', gx: cell.gx, gy: cell.gy, name: cell.name });
    else if (cell.kind === 'obstacle') RT.UI.showSelection({ kind: 'obstacle', gx: cell.gx, gy: cell.gy, name: cell.name || (cell.obstacle && cell.obstacle.name) });
    else if (cell.kind === 'entry') RT.UI.showSelection({ kind: 'entry', vertex: cell.vertex });
    else if (cell.kind === 'exit') RT.UI.showSelection({ kind: 'exit', vertex: cell.vertex });
    else RT.UI.showSelection(null);
    app.audio.sfx('click');
  }

  function onCanvasMove(e) {
    if (app.scriptLock && !app.demoControl) return;
    if (app.aimMode) { updateAimPreview(e.clientX, e.clientY); return; }
    const cell = pickAt(e.clientX, e.clientY);
    app.hoverCell = cell;
    updateHoverPreview(cell);
  }

  // 瞄准模式：扇形预览跟随鼠标
  function updateAimPreview(cx, cy) {
    if (!app.aimMode || !preview.group) return;
    const a = app.aimMode.tower;
    const p = a.model.group.position;
    const def = D.TOWERS[a.type];
    const g = groundPointAt(cx, cy, p.y);
    const ang = g ? Math.atan2(g.x - p.x, g.z - p.z) : a.facing;
    preview.group.visible = true;
    preview.group.position.set(p.x, p.y, p.z);
    preview.group.rotation.y = ang - Math.PI * 0.75;
    preview.ring.visible = false;
    preview.cone.visible = true;
    preview.cone.position.set(0, 0, 0);
    preview.cone.scale.setScalar(def.range ? def.range[0] : 8);
    preview.cone.rotation.z = 0;
    RT.UI.setHint('设定「' + def.name + '」朝向：攻击扇形 ' + def.arc + '° · 射程 ' + def.range[0] + ' · 点击确认，Esc 取消');
  }

  /* ================= 预览与部署 ================= */
  const preview = { ring: null, cone: null, aimArrow: null, group: null };

  function ensurePreview() {
    if (preview.group) return;
    preview.group = new T.Group();
    app.scene.add(preview.group);
    preview.ring = new T.Mesh(new T.TorusGeometry(1, 0.045, 6, 48), new T.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false
    }));
    preview.ring.rotation.x = -Math.PI / 2;
    preview.group.add(preview.ring);
    const coneGeo = new T.RingGeometry(0.2, 1, 24, 1, 0, Math.PI / 2);
    preview.cone = new T.Mesh(coneGeo, new T.MeshBasicMaterial({
      color: 0xff7bd5, transparent: true, opacity: 0.28, side: T.DoubleSide,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    preview.cone.rotation.x = -Math.PI / 2;
    preview.group.add(preview.cone);
  }

  app.clearPreview = function () {
    if (preview.group) preview.group.visible = false;
    RT.RouteViz.hidePreview();
  };

  function updateHoverPreview(cell) {
    const drag = RT.UI.drag;
    if (!drag || !drag.type || !cell) {
      if (!app.aimMode) { preview.group && (preview.group.visible = false); RT.RouteViz.hidePreview(); }
      return;
    }
    ensurePreview();
    preview.group.visible = true;
    preview.group.position.set(0, 0, 0);
    preview.group.rotation.y = 0;
    preview.ring.visible = true;
    preview.cone.position.set(0, 0, 0);
    const def = D.TOWERS[drag.type];
    const ok = app.battle.canDeploy(drag.type, cell);
    const col = ok.ok ? new T.Color(def.color) : new T.Color('#ff4d6d');
    preview.ring.material.color.copy(col);
    preview.cone.material.color.copy(col);
    let px = 0, pz = 0, py = 0;
    if (cell.kind === 'platform') {
      const halfW = (app.net.cols - 1) / 2, halfH = (app.net.rows - 1) / 2;
      px = (cell.gx - halfW) * RT.Net.CELL; pz = (cell.gy - halfH) * RT.Net.CELL; py = 1.7;
    } else if (cell.kind === 'node') {
      px = cell.vertex.x; pz = cell.vertex.z; py = cell.vertex.y + 0.1;
    } else if (cell.kind === 'link' && cell.pos) {
      px = cell.pos.x; pz = cell.pos.z; py = cell.pos.y + 0.1;
    } else {
      preview.group.visible = false;
      return;
    }
    preview.ring.position.set(px, py + 0.06, pz);
    const range = def.range ? def.range[0] : 0;
    preview.ring.scale.setScalar(range || 1.3);
    preview.cone.position.set(px, py + 0.07, pz);
    preview.cone.visible = false;   // 朝向扇形只在瞄准阶段显示
    // 改道预览：网闸/防火墙放到节点，或隔离器瞄准节点
    const previews = [];
    if (drag.type === 'gateway' || (drag.type === 'firewall' && cell.kind === 'node')) {
      if (cell.kind === 'node') {
        const pv = app.battle.previewRoutes({ [cell.vertex.id]: true });
        RT.RouteViz.showPreview(pv, app.battle.routes);
        previews.push('隔离 ' + cell.vertex.name + ' 后：' + describePreview(pv));
      }
    }
    if (drag.item === 'isolator' && cell.kind === 'node') {
      const pv = app.battle.previewRoutes({ [cell.vertex.id]: true });
      RT.RouteViz.showPreview(pv, app.battle.routes);
      previews.push('隔离 ' + cell.vertex.name + ' 后：' + describePreview(pv));
    }
    RT.UI.setHint(previews.length ? previews.join('  |  ') : (ok.ok ? def.name + ' · ' + def.desc : ok.reason));
  }

  function describePreview(pv) {
    const parts = [];
    Object.keys(pv).forEach((k) => {
      const r = pv[k];
      const v = app.net.v[k];
      if (!r) parts.push(v.name + ' 无出口');
      else {
        const changed = !RT.Net.sameRoute(app.battle.routes[k], r);
        parts.push(v.name + ' → ' + r.verts.map((id) => app.net.v[id].name).join('→') + (changed ? '（改道）' : '（不变）'));
      }
    });
    return parts.join('；');
  }

  app.tryDeploy = function (type, cell) {
    if (!app.battle || app.battle.over) return false;
    const res = app.battle.deploy(type, cell);
    if (!res.ok) return false;
    app.audio.sfx('deploy');
    if (D.TOWERS[type].oriented) {
      app.aimMode = { tower: res.tower };
      RT.UI.notice('拖动鼠标设定 ' + D.TOWERS[type].name + ' 朝向，点击确认，Esc 取消', 'info');
      ensurePreview();
      preview.group.visible = true;
      preview.ring.visible = false;
      preview.cone.visible = true;
    } else {
      RT.UI.setHint('');
    }
    return true;
  };

  app.cancelAim = function () {
    if (app.aimMode && app.battle) {
      app.battle.cancelDeploy(app.aimMode.tower);
    }
    app.aimMode = null;
    app.clearPreview();
    RT.UI.setHint('');
  };

  app.useItemAt = function (itemId, cell) {
    if (!app.battle) return;
    let target = null;
    if (itemId === 'isolator') {
      if (cell.kind !== 'node') { RT.UI.notice('应急隔离器只能投放在交换节点上', 'warn'); return; }
      target = { vertex: cell.vertex };
    } else if (itemId === 'downgrade') {
      const p = cell.point || (cell.pos) || null;
      if (!p) { RT.UI.notice('请选择链路区域', 'warn'); return; }
      target = { pos: p };
    } else if (itemId === 'restore') {
      if (cell.kind !== 'tower') { RT.UI.notice('备份还原需要选择一座设备', 'warn'); return; }
      target = { tower: cell.tower };
    }
    const r = app.battle.useItem(itemId, target);
    if (r.ok) { app.audio.sfx('isolate'); app.battle.stats.items++; }
    else app.audio.sfx('error');
  };

  /* ================= 演示 / 导出 ================= */
  app.runDemo = function (demoId) {
    if (!RT.Demo) return;
    RT.Demo.start(demoId);
  };

  /* ================= 主循环 ================= */
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = Math.min(0.05, (now - app.lastTime) / 1000);
    app.lastTime = now;
    if (app.exportMode) {
      // 导出模式：由 videoExport.frame() 精确驱动，此处不额外推进
      if (app.renderer) app.renderer.render(app.scene, app.camera);
      return;
    }
    if (RT.Demo && RT.Demo.active) {
      RT.Demo.update(raw);
    } else if (app.battle && app.mode === 'battle') {
      const sp = app.battle.paused ? 0 : app.battle.speed;
      app.acc += raw * sp;
      let guard = 0;
      while (app.acc >= app.FIXED && guard < 12) {
        app.battle.update(app.FIXED);
        app.acc -= app.FIXED;
        guard++;
      }
      if (guard >= 12) app.acc = 0;
    }
    updateWorld(raw);
    RT.FX.update(raw, app.camera);
    RT.RouteViz.update(raw);
    RT.UI.update(raw);
    if (app.mode === 'idle') {
      // 菜单：环绕展示真实战场
      const pv = app.previews[app.previewId];
      if (pv) animateWorld(pv.world, raw);
      updateMenuCamera(raw);
      if (app.renderer) app.renderer.render(app.scene, app.menuCam);
      return;
    }
    if (app.renderer) app.renderer.render(app.scene, app.camera);
  }

  function updateWorld(dt) {
    const w = app.world;
    if (!w) return;
    app.rig.update(dt);
    animateWorld(w, dt);
  }

  function animateWorld(w, dt) {
    if (!w) return;
    w.skyMat.uniforms.time.value += dt;
    w.protoLayers.forEach((l) => { l.tex.offset.y -= dt * l.speed; l.tex.offset.x += dt * l.speed * 0.5; });
    w.cluster.rotation.y += dt * 0.008;
    w.stars.rotation.y += dt * 0.004;
    w.streams.material.map.offset.y -= dt * 0.25;
    w.obstacles.forEach((g) => {
      if (g.userData.flow) g.userData.flow.material.map.offset.y -= dt * 0.5;
    });
    // 节点动画
    Object.keys(w.nodeObjs).forEach((id) => {
      const o = w.nodeObjs[id];
      o.spin += dt;
      o.ring.rotation.z += dt * (o.isolated ? 0.25 : 0.9);
      o.core.rotation.y += dt * 1.2;
      o.core.rotation.x += dt * 0.6;
      o.core.position.y = 1.12 + Math.sin(o.spin * 2) * 0.05;
      o.halo.material.opacity = o.isolated ? 0.5 + Math.sin(o.spin * 6) * 0.18 : 0.3 + Math.sin(o.spin * 2) * 0.1;
      if (o.isolated) {
        o.lock.rotation.y += dt * 1.6;
        o.lock2.rotation.y -= dt * 1.2;
        o.barrier.material.opacity = 0.22 + Math.sin(o.spin * 5) * 0.1;
      }
    });
    // 入口出口动画
    Object.keys(w.entryObjs).forEach((id) => {
      const o = w.entryObjs[id];
      o.ring.rotation.z += dt * 1.1;
      o.halo.material.opacity = 0.36 + Math.sin(o.spin * 3) * 0.12;
      o.beam.material.opacity = 0.26 + Math.sin(o.spin * 2.2) * 0.1;
    });
    Object.keys(w.exitObjs).forEach((id) => {
      const o = w.exitObjs[id];
      o.rings.forEach((r, i) => { r.rotation.z += dt * (0.4 + i * 0.25) * (i % 2 ? -1 : 1); });
      o.core.rotation.y += dt * 0.7;
      o.core.position.y = 2.7 + Math.sin(o.spin * 1.6) * 0.08;
      o.halo.material.opacity = 0.42 + Math.sin(o.spin * 2.4) * 0.14;
    });
    // 平台呼吸
    w.platformObjs.forEach((p, i) => {
      p.ring.material.emissiveIntensity = 0.9 + Math.sin(performance.now() * 0.002 + i) * 0.3;
    });
  }

  window.RTApp = app;
  app.stepWorld = updateWorld;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
