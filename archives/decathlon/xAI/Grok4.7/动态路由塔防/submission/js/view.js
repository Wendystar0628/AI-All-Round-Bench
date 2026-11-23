/* 场景。相机只在 applyCamera 里由 theta/phi 放置；平移读相机矩阵列。单位朝向用 atan2(x, z)，局部 +Z 为前方。 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var TD = root.TD = root.TD || {};
  var CELL = TD.CELL;

  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function circuitTex(rgb) {
    return canvasTex(128, 128, function (g) {
      g.fillStyle = '#061018';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = rgb;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(8, 64); g.lineTo(48, 64); g.lineTo(48, 24); g.lineTo(112, 24);
      g.moveTo(16, 96); g.lineTo(80, 96); g.lineTo(80, 48);
      g.stroke();
      g.fillStyle = rgb;
      g.fillRect(104, 18, 10, 10);
      g.fillRect(72, 42, 8, 8);
    });
  }

  function chevronTex() {
    return canvasTex(64, 128, function (g) {
      g.clearRect(0, 0, 64, 128);
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath();
      g.moveTo(32, 10); g.lineTo(54, 48); g.lineTo(32, 36); g.lineTo(10, 48); g.fill();
    });
  }

  function textSprite(text, color) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    var g = c.getContext('2d');
    g.font = 'bold 54px "Microsoft YaHei", sans-serif';
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 64);
    var tex = new THREE.CanvasTexture(c);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.material.userData.own = true;
    s.material.userData.ownMap = true;
    s.scale.set(6.4, 1.6, 1);
    return s;
  }

  function std(color, em, emi) {
    var m = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.62, metalness: 0.28,
      emissive: new THREE.Color(em || 0x000000),
      emissiveIntensity: emi == null ? 0.2 : emi
    });
    m.userData.baseI = m.emissiveIntensity;
    return m;
  }

  function disposeObj(o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) {
        if (m.map && m.userData && m.userData.ownMap) m.map.dispose();
        if (m.userData && m.userData.own) m.dispose();
      });
    }
  }

  TD.createView = function (canvas, floatLayer) {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    var cam = { theta: 0.2, phi: 0.82, radius: 60, target: new THREE.Vector3() };
    var home = { theta: 0.2, phi: 0.82, radius: 60, tx: 0, tz: 0 };
    var raycaster = new THREE.Raycaster();
    var hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a120c, 0.55);
    var sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    scene.add(hemi, sun, sun.target);
    var root = new THREE.Group();
    var tileRoot = new THREE.Group();
    var unitRoot = new THREE.Group();
    var fxRoot = new THREE.Group();
    var guideRoot = new THREE.Group();
    var routeRoot = new THREE.Group();
    var linkRoot = new THREE.Group();
    scene.add(root);
    root.add(tileRoot, unitRoot, fxRoot, guideRoot, routeRoot, linkRoot);

    var chev = chevronTex();
    var circ = circuitTex('rgba(80,180,220,0.85)');
    var flowTex = canvasTex(64, 64, function (g) {
      g.fillStyle = '#102033';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(80,200,255,0.8)';
      for (var i = 0; i < 8; i++) g.fillRect(i * 8, 0, 3, 64);
    });
    var tiles = {};
    var units = {};
    var fxMeshes = {};
    var shots = {};
    var floats = {};
    var baseRoutes = {};
    var battleRef = null;
    var routeSig = '';
    var clockTex = [circ, flowTex, chev];

    function fitOf(map) {
      return {
        tx: (map.cols - 1) * CELL * 0.5,
        tz: (map.rows - 1) * CELL * 0.5,
        radius: Math.max(map.cols, map.rows) * CELL * 1.48,
        theta: 0.22,
        phi: 0.78
      };
    }

    function applyCamera() {
      var sp = Math.sin(cam.phi);
      camera.position.set(
        cam.target.x + cam.radius * sp * Math.sin(cam.theta),
        cam.target.y + cam.radius * Math.cos(cam.phi),
        cam.target.z + cam.radius * sp * Math.cos(cam.theta)
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(cam.target);
      camera.updateMatrixWorld();
    }

    function resize() {
      var w = canvas.clientWidth || window.innerWidth;
      var h = canvas.clientHeight || window.innerHeight;
      var pr = window.devicePixelRatio || 1;
      if (w > 2000) pr = 1;
      else pr = Math.min(pr, 1.5);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }

    function clearGroup(g, deep) {
      for (var i = g.children.length - 1; i >= 0; i--) {
        var o = g.children[i];
        g.remove(o);
        if (deep) o.traverse(disposeObj);
      }
    }

    function buildBackdrop(map) {
      var g = new THREE.Group();
      var seed = 0;
      for (var i = 0; i < map.id.length; i++) seed = (seed * 33 + map.id.charCodeAt(i)) >>> 0;
      function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
      for (var n = 0; n < 36; n++) {
        var x = (rnd() - 0.5) * map.cols * CELL * 2.4;
        var z = (rnd() - 0.5) * map.rows * CELL * 2.4;
        if (Math.abs(x - home.tx) < map.cols * CELL * 0.55 && Math.abs(z - home.tz) < map.rows * CELL * 0.55) continue;
        var h = 0.8 + rnd() * 3.2;
        var m = new THREE.Mesh(new THREE.BoxGeometry(0.6 + rnd(), h, 0.6 + rnd()), std(map.theme.accent, map.theme.accent, 0.15 + rnd() * 0.3));
        m.position.set(x, h * 0.5, z);
        g.add(m);
      }
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(map.cols * CELL * 3, map.rows * CELL * 3), new THREE.MeshStandardMaterial({ color: map.theme.bed, roughness: 1, metalness: 0 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(home.tx, -0.05, home.tz);
      floor.receiveShadow = true;
      g.add(floor);
      return g;
    }

    function addRack(parent, cell) {
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.35, 0.7), std(0x1a242e, 0x123040, 0.15));
      body.position.y = 0.7;
      body.castShadow = true;
      parent.add(body);
      for (var i = 0; i < 3; i++) {
        var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), std(0x7ee7ff, 0x3ec8ff, 0.8));
        lamp.position.set(0, 0.35 + i * 0.28, 0.36);
        lamp.userData.lamp = 1 + i + cell.c * 0.1;
        parent.add(lamp);
      }
    }

    function buildTiles(map) {
      Object.keys(map.cells).forEach(function (k) {
        var cell = map.cells[k];
        var group = new THREE.Group();
        group.position.set(cell.c * CELL, 0, cell.r * CELL);
        var color = 0x163040, em = 0x0c3040, h = 0.16, y = 0.08;
        if (cell.kind === 'old') { color = 0x6a4a18; em = 0xffb020; }
        if (cell.kind === 'node') { color = 0x245068; em = 0x3ec8ff; h = 0.22; y = 0.11; }
        if (cell.kind === 'spawn') { color = 0x14585a; em = 0x3ee0ff; h = 0.2; y = 0.1; }
        if (cell.kind === 'exit') { color = 0x14502a; em = 0x7dffb3; h = 0.24; y = 0.12; }
        if (cell.kind === 'platform') { color = 0x243044; em = 0x1a3048; h = 0.78; y = 0.39; }
        if (cell.kind === 'obstacle') {
          if (cell.decor === 'gap') { color = 0x12080a; em = 0x000000; h = 0.3; y = -0.2; }
          else if (cell.decor === 'flow') { color = 0x12344a; em = 0x1a6a90; h = 0.7; y = 0.35; }
          else { color = 0x12181e; em = 0x000000; h = 0.08; y = 0.04; }
        }
        var material = std(color, em, cell.kind === 'obstacle' ? 0.05 : 0.25);
        material.userData.own = true;
        if (cell.kind === 'path' || cell.kind === 'old' || cell.kind === 'node') {
          material.map = circ;
          material.color.setHex(0xffffff);
          material.emissive.setHex(cell.kind === 'old' ? 0x5a3a10 : 0x0a2838);
        }
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.96, h, CELL * 0.96), material);
        mesh.position.y = y;
        mesh.receiveShadow = true;
        mesh.castShadow = cell.kind === 'platform' || cell.kind === 'obstacle';
        mesh.userData.cell = { c: cell.c, r: cell.r, kind: cell.kind };
        group.add(mesh);
        if (cell.kind === 'obstacle' && cell.decor === 'rack') addRack(group, cell);
        if (cell.kind === 'obstacle' && cell.decor === 'flow') {
          material.transparent = true;
          material.opacity = 0.72;
          material.map = flowTex;
          material.color.setHex(0x88ddff);
        }
        if (cell.kind === 'obstacle' && cell.decor === 'gap') {
          var haze = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9), new THREE.MeshBasicMaterial({ color: 0xff6644, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
          haze.userData.own = true;
          haze.rotation.x = -Math.PI / 2;
          haze.position.y = 0.05;
          group.add(haze);
        }
        if (cell.kind === 'node') {
          var postMat = std(0xff5d73, 0xff5d73, 0.5);
          postMat.userData.own = true;
          for (var d = 0; d < 4; d++) {
            var post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), postMat);
            var ang = d * Math.PI / 2;
            post.position.set(Math.cos(ang) * 0.7, 0.5, Math.sin(ang) * 0.7);
            post.visible = false;
            post.userData.post = true;
            group.add(post);
          }
        }
        if (cell.kind === 'exit') {
          var core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), std(0x7dffb3, 0x7dffb3, 0.8));
          core.position.y = 0.7;
          core.userData.spin = true;
          group.add(core);
        }
        tiles[k] = group;
        tileRoot.add(group);
      });
      map.entrances.forEach(function (e) {
        var s = textSprite(e.name, e.color || '#7ee7ff');
        s.position.set(e.c * CELL, 2.3, e.r * CELL);
        tileRoot.add(s);
      });
      map.exits.forEach(function (e) {
        var s = textSprite(e.name, e.color || '#7dffb3');
        s.position.set(e.c * CELL, 2.5, e.r * CELL);
        tileRoot.add(s);
      });
      map.nodes.forEach(function (n) {
        var s = textSprite(n.name, '#d7e6f2');
        s.scale.set(4.6, 1.15, 1);
        s.position.set(n.c * CELL, 1.8, n.r * CELL);
        s.userData.nodeLabel = n.id;
        tileRoot.add(s);
      });
    }

    function load(battle) {
      battleRef = battle;
      clearGroup(tileRoot, true);
      clearGroup(unitRoot, true);
      clearGroup(fxRoot, true);
      clearGroup(routeRoot, true);
      clearGroup(guideRoot, true);
      clearGroup(linkRoot, true);
      tiles = {}; units = {}; fxMeshes = {}; shots = {};
      Object.keys(floats).forEach(function (id) { if (floats[id].el) floats[id].el.remove(); });
      floats = {};
      routeSig = '';
      var map = battle.map;
      var fit = fitOf(map);
      home = fit;
      cam.theta = fit.theta;
      cam.phi = fit.phi;
      cam.radius = fit.radius;
      cam.target.set(fit.tx, 0, fit.tz);
      scene.background = new THREE.Color(map.theme.fog);
      scene.fog = new THREE.Fog(map.theme.fog, 28, map.theme.fogFar || 80);
      hemi.color.setHex(map.theme.sky);
      hemi.groundColor.setHex(map.theme.ground);
      sun.color.setHex(map.theme.sun);
      var span = Math.max(map.cols, map.rows) * CELL * 0.75;
      sun.shadow.camera.left = -span;
      sun.shadow.camera.right = span;
      sun.shadow.camera.top = span;
      sun.shadow.camera.bottom = -span;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 120;
      sun.position.set(fit.tx + 14, 32, fit.tz + 12);
      sun.target.position.set(fit.tx, 0, fit.tz);
      sun.shadow.camera.updateProjectionMatrix();
      var oldBg = root.getObjectByName('backdrop');
      if (oldBg) { root.remove(oldBg); oldBg.traverse(disposeObj); }
      var bg = buildBackdrop(map);
      bg.name = 'backdrop';
      root.add(bg);
      buildTiles(map);
      captureBase(battle);
      applyCamera();
    }

    function captureBase(battle) {
      baseRoutes = {};
      Object.keys(battle.routes).forEach(function (id) {
        var r = battle.routes[id];
        baseRoutes[id] = r ? r.path.join('|') : '';
      });
    }

    function surfaceY(battle, c, r) {
      var cell = battle.cellAt(c, r);
      if (!cell) return 0;
      if (cell.kind === 'platform') return 0.78;
      if (cell.kind === 'obstacle' && cell.decor === 'gap') return 0.05;
      return 0.18;
    }

    function makeBars() {
      var g = new THREE.Group();
      function plane(w, h, color, y) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 0.92 }));
        m.position.y = y;
        m.userData.own = true;
        return m;
      }
      var bg = plane(1.2, 0.12, 0x061018, 0);
      var fg = plane(1.2, 0.1, 0x7dffb3, 0.001);
      var sh = plane(1.2, 0.06, 0x8be9ff, -0.12);
      g.add(bg, fg, sh);
      g.userData.fg = fg;
      g.userData.sh = sh;
      g.position.y = 1.7;
      return g;
    }

    function ensureUnit(kind, obj, factory) {
      var rec = units[obj.id];
      var sig = kind + '|' + (obj.type || '') + '|' + (obj.level || 0) + '|' + (obj.branch || '');
      if (!rec || rec.sig !== sig) {
        if (rec) { unitRoot.remove(rec.pivot); rec.pivot.traverse(disposeObj); }
        var model = factory();
        var pivot = new THREE.Group();
        pivot.add(model);
        var shell = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.28, depthWrite: false }));
        shell.visible = false;
        shell.userData.own = true;
        var enc = new THREE.Mesh(new THREE.OctahedronGeometry(0.95), new THREE.MeshBasicMaterial({ color: 0xd45bff, wireframe: true }));
        enc.visible = false;
        enc.userData.own = true;
        var bars = makeBars();
        pivot.add(shell, enc, bars);
        pivot.userData.kind = kind;
        pivot.userData.eid = obj.id;
        pivot.userData.model = model;
        pivot.userData.shell = shell;
        pivot.userData.enc = enc;
        pivot.userData.bars = bars;
        unitRoot.add(pivot);
        rec = units[obj.id] = { pivot: pivot, sig: sig };
      }
      return rec;
    }

    function setBar(bars, hp, max, shield) {
      var r = Math.max(0, Math.min(1, hp / (max || 1)));
      bars.userData.fg.scale.x = Math.max(0.02, r);
      bars.userData.fg.position.x = (r - 1) * 0.6;
      bars.userData.fg.material.color.setHex(r < 0.35 ? 0xff5d73 : r < 0.7 ? 0xffb020 : 0x7dffb3);
      var s = shield > 0 ? Math.min(1, shield / (max || 1)) : 0;
      bars.userData.sh.visible = s > 0;
      bars.userData.sh.scale.x = Math.max(0.02, s);
      bars.userData.sh.position.x = (s - 1) * 0.6;
      bars.quaternion.copy(camera.quaternion);
    }

    function yawOf(obj, battle) {
      if (obj.facing != null && obj.type === 'intercept') return obj.facing;
      if (obj.targetId && battle) {
        var e = battle.enemyById ? battle.enemyById(obj.targetId) : null;
        if (e) return Math.atan2(e.x - obj.x, (e.z - obj.z));
      }
      if (obj.state === 'blocked' && obj.blocker && battle) {
        var t = battle.towerById(obj.blocker);
        if (t) return Math.atan2(t.x - obj.x, t.z - obj.z);
      }
      if (obj.state === 'attacknode' && obj.goalNode && battle) {
        var n = battle.nodeById(obj.goalNode);
        if (n) return Math.atan2(n.c * CELL - obj.x, n.r * CELL - obj.z);
      }
      return obj.yaw || 0;
    }

    function flash(model, on) {
      model.traverse(function (o) {
        if (!o.material || !o.material.userData || o.userData.lamp) return;
        if (o.material.userData.baseI == null) return;
        o.material.emissiveIntensity = on ? 1.55 : o.material.userData.baseI;
      });
    }

    function syncUnits(battle, time) {
      var alive = {};
      battle.towers.forEach(function (t) {
        alive[t.id] = 1;
        var rec = ensureUnit('tower', t, function () { return TD.models.tower(t.type, t.level, t.branch); });
        var p = rec.pivot;
        var y = surfaceY(battle, t.c, t.r);
        var sink = t.dead ? (1 - Math.max(0, t.deathT) / 0.7) * 1.2 : 0;
        p.position.set(t.x, y - sink, t.z);
        p.rotation.y = yawOf(t, battle);
        p.userData.model.userData.tick && p.userData.model.userData.tick(p.userData.model, t, time);
        flash(p.userData.model, t.hitFlash > 0);
        p.userData.shell.visible = t.shield > 0;
        p.userData.shell.scale.setScalar(0.9 + Math.min(0.6, t.shield / 200));
        p.userData.enc.visible = t.encryptT > 0;
        p.userData.enc.rotation.y = time;
        setBar(p.userData.bars, t.hp, t.maxHp, t.shield);
        p.userData.bars.position.y = (t.type === 'firewall' || t.type === 'gate' ? 2.05 : 1.7);
      });
      battle.holders.forEach(function (h) {
        if (h.dead) return;
        alive[h.id] = 1;
        var rec = ensureUnit('holder', h, TD.models.holder);
        var p = rec.pivot;
        p.position.set(h.x, 0.18, h.z);
        p.userData.model.userData.tick && p.userData.model.userData.tick(p.userData.model, h, time);
        p.userData.shell.visible = false;
        p.userData.enc.visible = false;
        setBar(p.userData.bars, h.hp, h.maxHp, 0);
      });
      battle.enemies.forEach(function (e) {
        alive[e.id] = 1;
        var rec = ensureUnit('enemy', e, function () { return TD.models.enemy(e.type); });
        var p = rec.pivot;
        var yaw = yawOf(e, battle);
        var side = ((e.id % 3) - 1) * (e.def && e.def.boss ? 0 : 0.16);
        var ox = Math.cos(yaw) * side;
        var oz = -Math.sin(yaw) * side;
        var baseY = e.flying ? e.y : (e.y || 0) + 0.18;
        var sink = (e.state === 'dead' || e.state === 'leaked') ? (1 - Math.max(0, e.deathT) / 0.7) * 1.1 : 0;
        p.position.set(e.x + ox, baseY - sink, e.z + oz);
        p.rotation.y = yaw;
        if (e.def && e.def.boss) p.scale.setScalar(e.type === 'shadow' ? 1.35 : 1.5);
        p.userData.model.userData.tick && p.userData.model.userData.tick(p.userData.model, e, time);
        flash(p.userData.model, e.hitFlash > 0);
        p.userData.shell.visible = e.shield > 0;
        p.userData.enc.visible = false;
        setBar(p.userData.bars, e.hp, e.maxHp, e.shield);
        p.userData.bars.position.y = e.flying ? 0.8 : (e.def && e.def.boss ? 2.3 : 1.15);
        var moving = e.state === 'move' && e.rootT <= 0;
        if (moving && !e.flying) p.position.y += Math.abs(Math.sin(time * 10 + (e.phase0 || 0))) * 0.05;
      });
      Object.keys(units).forEach(function (id) {
        if (!alive[id]) {
          unitRoot.remove(units[id].pivot);
          units[id].pivot.traverse(disposeObj);
          delete units[id];
        }
      });
    }

    function syncTiles(battle, time) {
      Object.keys(tiles).forEach(function (k) {
        var group = tiles[k];
        var mesh = group.children[0];
        var info = mesh.userData.cell;
        if (!info) return;
        var cell = battle.cellAt(info.c, info.r);
        if (cell && (cell.kind === 'path' || cell.kind === 'old' || cell.kind === 'spawn')) {
          var hot = battle.tempOld.has(k);
          mesh.material.emissive.setHex(hot || cell.kind === 'old' ? 0x8a5a12 : 0x0a2838);
        }
        if (info.kind === 'node') {
          var node = battle.nodeAt(info.c, info.r);
          var iso = node && node.isolated;
          var lock = node && node.lockT > 0;
          mesh.material.emissive.setHex(iso ? 0x8a2030 : lock ? 0x8a5a10 : 0x145060);
          group.children.forEach(function (ch) { if (ch.userData.post) ch.visible = !!iso; });
        }
        group.traverse(function (o) {
          if (o.userData.lamp) o.material.emissiveIntensity = 0.35 + 0.65 * Math.abs(Math.sin(time * 2.2 + o.userData.lamp));
          if (o.userData.spin) o.rotation.y = time * 0.8;
        });
      });
    }

    function ribbon(path, y, lateral, color, opacity) {
      if (!path || path.length < 2) return null;
      var pts = path.map(function (k) {
        var p = k.split(',');
        return { x: +p[0] * CELL, z: +p[1] * CELL };
      });
      var half = 0.13;
      var positions = [], uvs = [], acc = 0;
      for (var i = 0; i < pts.length; i++) {
        var dx, dz;
        if (i < pts.length - 1) { dx = pts[i + 1].x - pts[i].x; dz = pts[i + 1].z - pts[i].z; }
        else { dx = pts[i].x - pts[i - 1].x; dz = pts[i].z - pts[i - 1].z; }
        var len = Math.hypot(dx, dz) || 1;
        var sx = -dz / len, sz = dx / len;
        var cx = pts[i].x + sx * lateral, cz = pts[i].z + sz * lateral;
        positions.push(cx + sx * half, y, cz + sz * half, cx - sx * half, y, cz - sz * half);
        uvs.push(0, acc, 1, acc);
        if (i < pts.length - 1) acc += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / 1.2;
      }
      var idx = [];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      var m = new THREE.MeshBasicMaterial({
        map: chev, color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      });
      m.userData.own = true;
      return new THREE.Mesh(geo, m);
    }

    function syncRoutes(battle, guides) {
      var preview = guides && guides.preview;
      var sig = battle.routeRev + '|' + (preview ? JSON.stringify(Object.keys(preview).map(function (k) {
        return k + (preview[k] ? preview[k].path.join('.') : '');
      })) : '');
      if (sig === routeSig) return;
      routeSig = sig;
      clearGroup(routeRoot, true);
      var ents = battle.map.entrances;
      ents.forEach(function (ent, i) {
        var route = battle.routes[ent.id];
        var lateral = (i - (ents.length - 1) / 2) * 0.28;
        var changed = route && baseRoutes[ent.id] && route.path.join('|') !== baseRoutes[ent.id];
        if (route) {
          var mesh = ribbon(route.path, 0.22, lateral, new THREE.Color(ent.color || '#7ee7ff'), changed ? 0.95 : 0.55);
          if (mesh) routeRoot.add(mesh);
        }
        if (preview && preview[ent.id] && route && preview[ent.id].path.join('|') !== route.path.join('|')) {
          var alt = ribbon(preview[ent.id].path, 0.34, lateral, new THREE.Color(ent.color || '#ffffff'), 0.95);
          if (alt) routeRoot.add(alt);
        }
      });
    }

    function marker(c, r, color, y, scale) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.92, 0.08, CELL * 0.92), new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide
      }));
      m.userData.own = true;
      m.position.set(c * CELL, y, r * CELL);
      if (scale) m.scale.y = scale;
      return m;
    }

    function syncGuides(battle, guides, time) {
      clearGroup(guideRoot, true);
      if (!guides) guides = {};
      (guides.sealed || []).forEach(function (s) {
        guideRoot.add(marker(s.c, s.r, 0xff3355, 0.4));
      });
      (guides.zone || []).forEach(function (s) {
        guideRoot.add(marker(s.c, s.r, 0xffb020, 0.28));
      });
      if (guides.hover) guideRoot.add(marker(guides.hover.c, guides.hover.r, guides.bad ? 0xff3355 : 0x7ee7ff, 0.45));
      if (guides.select) guideRoot.add(marker(guides.select.c, guides.select.r, 0xffffff, 0.55));
      battle.telegraphs.forEach(function (tel) {
        tel.cells.forEach(function (k) {
          var p = k.split(',');
          var m = marker(+p[0], +p[1], tel.kind === 'lock' ? 0xff6644 : 0xff44cc, 0.5);
          m.material.opacity = 0.25 + 0.35 * Math.abs(Math.sin(time * 6));
          guideRoot.add(m);
        });
      });
      battle.tempBlocks.forEach(function (v, k) {
        var p = k.split(',');
        guideRoot.add(marker(+p[0], +p[1], v.kind === 'lock' ? 0xff4422 : 0xaa22ff, 0.36));
      });
      if (guides.range) {
        var rg = guides.range;
        if (rg.cone) {
          var half = rg.cone * 0.5;
          var pos = [0, 0.08, 0];
          var seg = 16;
          var radius = rg.radius * CELL;
          for (var i = 0; i <= seg; i++) {
            var a = -half + (2 * half) * i / seg;
            pos.push(Math.sin(a) * radius, 0.08, Math.cos(a) * radius);
          }
          var idx = [];
          for (var i = 1; i <= seg; i++) idx.push(0, i, i + 1);
          var geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geo.setIndex(idx);
          var cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0x7aa2ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide
          }));
          cone.userData.own = true;
          cone.position.set(rg.x, rg.y || 0.8, rg.z);
          cone.rotation.y = rg.facing || 0;
          guideRoot.add(cone);
        } else if (rg.radius) {
          var ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.2, rg.radius * CELL - 0.08), rg.radius * CELL, 40), new THREE.MeshBasicMaterial({
            color: 0x7dffb3, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide
          }));
          ring.userData.own = true;
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(rg.x, (rg.y || 0.2) + 0.05, rg.z);
          guideRoot.add(ring);
        }
      }
    }

    function line(a, b, color) {
      var geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      var m = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.85 }));
      m.userData.own = true;
      return m;
    }

    function syncLinks(battle) {
      clearGroup(linkRoot, true);
      battle.towers.forEach(function (t) {
        if (t.dead) return;
        (t.blocked || []).forEach(function (id) {
          var e = battle.enemyById(id);
          if (!e || !battle.living(e)) return;
          linkRoot.add(line(new THREE.Vector3(t.x, 0.8, t.z), new THREE.Vector3(e.x, 0.6, e.z), 0xffb020));
        });
        (t.healIds || []).forEach(function (id) {
          var o = battle.towerById(id);
          if (!o || o.dead) return;
          linkRoot.add(line(new THREE.Vector3(t.x, 1.1, t.z), new THREE.Vector3(o.x, 1.1, o.z), 0x7dff6a));
        });
        if (t.targetId && t.type !== 'firewall') {
          var tgt = battle.enemyById(t.targetId);
          if (tgt && battle.living(tgt)) {
            linkRoot.add(line(new THREE.Vector3(t.x, 1.3, t.z), new THREE.Vector3(tgt.x, tgt.flying ? tgt.y : 0.7, tgt.z), 0x7aa2ff));
          }
        }
      });
    }

    function syncShots(battle) {
      var alive = {};
      battle.projectiles.forEach(function (p) {
        alive[p.id] = 1;
        var mesh = shots[p.id];
        if (!mesh) {
          var color = p.kind === 'lock' ? 0xd45bff : p.kind === 'slow' ? 0xffe27a : 0xd6e4ff;
          mesh = new THREE.Mesh(p.kind === 'lock' ? new THREE.OctahedronGeometry(0.12) : new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: color }));
          mesh.userData.own = true;
          shots[p.id] = mesh;
          fxRoot.add(mesh);
        }
        mesh.position.set(p.x, p.y, p.z);
      });
      Object.keys(shots).forEach(function (id) {
        if (!alive[id]) { fxRoot.remove(shots[id]); shots[id].traverse(disposeObj); delete shots[id]; }
      });
    }

    function fxMesh(fx) {
      var color = 0xffffff, geo = new THREE.SphereGeometry(0.18, 8, 6);
      if (fx.kind === 'boom' || fx.kind === 'burst' || fx.kind === 'bossdie' || fx.kind === 'payload') { color = 0xff6644; geo = new THREE.SphereGeometry(0.35, 10, 8); }
      else if (fx.kind === 'heal' || fx.kind === 'restore') color = 0x7dff6a;
      else if (fx.kind === 'shield' || fx.kind === 'shell') color = 0x9be7ff;
      else if (fx.kind === 'encrypt') color = 0xd45bff;
      else if (fx.kind === 'iso') color = 0xff5d73;
      else if (fx.kind === 'open') color = 0x7dffb3;
      else if (fx.kind === 'scan' || fx.kind === 'reveal') color = 0x3dffc5;
      else if (fx.kind === 'pierce') color = 0xd6e4ff;
      else if (fx.kind === 'downgrade') color = 0xffb020;
      else if (fx.kind === 'slam' || fx.kind === 'hitred') color = 0xff4455;
      else if (fx.kind === 'spark' || fx.kind === 'slash') color = 0xffe7a0;
      var mesh;
      if (fx.kind === 'pierce' && fx.extra) {
        mesh = line(new THREE.Vector3(fx.x, fx.y, fx.z), new THREE.Vector3(fx.extra.x2, fx.extra.y2, fx.extra.z2), color);
      } else if (fx.kind === 'scan') {
        mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.35, 24), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData.own = true;
        mesh.userData.grow = (fx.extra && fx.extra.range ? fx.extra.range : 3) * CELL;
      } else {
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 }));
        mesh.userData.own = true;
      }
      mesh.position.set(fx.x, fx.y, fx.z);
      return mesh;
    }

    function syncFx(battle) {
      var alive = {};
      battle.fxs.forEach(function (fx) {
        if (fx.kind === 'text') {
          alive['t' + fx.id] = 1;
          if (!floats[fx.id]) {
            var el = document.createElement('div');
            el.className = 'floater';
            el.textContent = fx.extra && fx.extra.text || '';
            el.style.color = (fx.extra && fx.extra.color) || '#fff';
            floatLayer.appendChild(el);
            floats[fx.id] = { el: el };
          }
          var p = project(fx.x, fx.y + (1 - fx.age / fx.life) * 0.4, fx.z);
          floats[fx.id].el.style.left = p.x + 'px';
          floats[fx.id].el.style.top = p.y + 'px';
          floats[fx.id].el.style.opacity = String(1 - fx.age / fx.life);
          return;
        }
        alive[fx.id] = 1;
        var mesh = fxMeshes[fx.id];
        if (!mesh) {
          mesh = fxMesh(fx);
          fxMeshes[fx.id] = mesh;
          fxRoot.add(mesh);
        }
        var k = fx.age / fx.life;
        if (mesh.userData.grow) mesh.scale.setScalar(0.2 + mesh.userData.grow * k);
        else mesh.scale.setScalar(1 + k * 1.4);
        if (mesh.material) mesh.material.opacity = 0.9 * (1 - k);
      });
      Object.keys(fxMeshes).forEach(function (id) {
        if (!alive[id]) { fxRoot.remove(fxMeshes[id]); fxMeshes[id].traverse(disposeObj); delete fxMeshes[id]; }
      });
      Object.keys(floats).forEach(function (id) {
        if (!alive['t' + id]) { floats[id].el.remove(); delete floats[id]; }
      });
    }

    function project(x, y, z) {
      var v = new THREE.Vector3(x, y, z);
      v.project(camera);
      var rect = canvas.getBoundingClientRect();
      return {
        x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
        y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
        behind: v.z > 1
      };
    }

    function pick(cx, cy) {
      var rect = canvas.getBoundingClientRect();
      var ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(unitRoot.children.concat(tileRoot.children), true);
      for (var i = 0; i < hits.length; i++) {
        var o = hits[i].object;
        while (o) {
          if (o.userData && o.userData.eid) return { kind: o.userData.kind, id: o.userData.eid };
          if (o.userData && o.userData.cell) return { kind: 'cell', c: o.userData.cell.c, r: o.userData.cell.r, tile: o.userData.cell.kind };
          o = o.parent;
        }
      }
      var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      var hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit) && battleRef) {
        var c = Math.round(hit.x / CELL), r = Math.round(hit.z / CELL);
        if (battleRef.cellAt(c, r)) return { kind: 'cell', c: c, r: r, tile: battleRef.cellAt(c, r).kind };
      }
      return null;
    }

    function groundPoint(cx, cy, y) {
      var rect = canvas.getBoundingClientRect();
      var ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(y || 0));
      var hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return hit;
    }

    function sync(battle, guides, time) {
      if (!battle) return;
      battleRef = battle;
      syncTiles(battle, time);
      syncUnits(battle, time);
      syncRoutes(battle, guides);
      syncGuides(battle, guides, time);
      syncLinks(battle);
      syncShots(battle);
      syncFx(battle);
      chev.offset.y = -time * 0.35;
      circ.offset.y = time * 0.05;
      flowTex.offset.x = -time * 0.4;
    }

    function render() { renderer.render(scene, camera); }

    function resetCamera() {
      cam.theta = home.theta;
      cam.phi = home.phi;
      cam.radius = home.radius;
      cam.target.set(home.tx, 0, home.tz);
      applyCamera();
    }

    function findNose(enemyId) {
      var rec = units[enemyId];
      if (!rec) return null;
      var found = null;
      rec.pivot.traverse(function (o) { if (o.userData && o.userData.nose) found = o; });
      return found ? { pivot: rec.pivot, nose: found } : null;
    }

    return {
      cam: cam, camera: camera, scene: scene, renderer: renderer,
      applyCamera: applyCamera, resize: resize, load: load, sync: sync, render: render,
      project: project, pick: pick, groundPoint: groundPoint, resetCamera: resetCamera,
      captureBase: captureBase, surfaceY: surfaceY, findNose: findNose, fitOf: fitOf
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
