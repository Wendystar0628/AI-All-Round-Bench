/* 世界视图：把游戏逻辑同步成三维场景，处理事件特效、路线标记、预览与叠加层 */
(function (G) {
'use strict';
var T = window.THREE, gfx = G.gfx, fx = G.fx, K = G.K;
var DX = G.DX, DY = G.DY;
var TOP_ROAD = 0.105, TOP_PLAT = 0.39;
function sfx(name, x, y, v) { if (G.audio && G.audio.play) G.audio.play(name, x, y, v); }

function World(game, overlay) {
  this.game = game; this.overlay = overlay; this.octx = overlay.getContext('2d');
  var scene = gfx.newScene(); this.scene = scene;
  fx.init(scene);
  this.terrain = new G.Terrain(game, scene);
  this.towerViews = {}; this.enemyViews = {}; this.isoViews = {}; this.projViews = {}; this.hazViews = {}; this.dying = [];
  this.floats = []; this.time = 0; this.hoverTile = -1; this.sel = null; this.shake = 0; this.flash = 0;
  this.routeViews = {}; this.previewViews = []; this.ghostRoutes = []; this.preview = null; this.denyMarks = []; this.boosts = {};
  this.buildCommon(); this.buildRoutes(); this.buildTraffic(); this.buildFlyLines(); this.buildZoneLabels();
  var self = this; game.on(function (t, d) { self.onEvent(t, d); });
  this.relFx = 0;
}
G.World = World;
var W = World.prototype;

W.buildCommon = function () {
  var scene = this.scene;
  this.hover = new T.Mesh(gfx.ring(0.38, 0.5, 4), new T.MeshBasicMaterial({ color: new T.Color('#c2e8f4').multiplyScalar(2), transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
  this.hover.rotation.x = -Math.PI / 2; this.hover.rotation.z = Math.PI / 4; scene.add(this.hover);
  this.selRing = new T.Mesh(gfx.ring(0.52, 0.6, 40), new T.MeshBasicMaterial({ color: new T.Color('#ffffff').multiplyScalar(2), transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
  this.selRing.rotation.x = -Math.PI / 2; scene.add(this.selRing);
  this.rangeGrp = new T.Group(); this.rangeGrp.visible = false; scene.add(this.rangeGrp);
  var rmat = function (c, o) { return new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(1.6), transparent: true, opacity: o, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }); };
  this.rangeFan = new T.Mesh(new T.CircleGeometry(1, 3), rmat('#6fb6e6', 0.22)); this.rangeFan.rotation.x = -Math.PI / 2; this.rangeFan.position.y = 0.13; this.rangeGrp.add(this.rangeFan);
  this.rangeFanEdge = new T.LineLoop(new T.BufferGeometry(), new T.LineBasicMaterial({ color: new T.Color('#cfe8f8').multiplyScalar(2), transparent: true, opacity: 0.9 })); this.rangeFanEdge.position.y = 0.135; this.rangeGrp.add(this.rangeFanEdge);
  this.rangeC1 = new T.Mesh(gfx.ring(0.97, 1.0, 64), rmat('#ffd43b', 0.9)); this.rangeC1.rotation.x = -Math.PI / 2; this.rangeC1.position.y = 0.13; this.rangeGrp.add(this.rangeC1);
  this.rangeD1 = new T.Mesh(new T.CircleGeometry(1, 48), rmat('#ffd43b', 0.12)); this.rangeD1.rotation.x = -Math.PI / 2; this.rangeD1.position.y = 0.125; this.rangeGrp.add(this.rangeD1);
  this.rangeC2 = new T.Mesh(gfx.ring(0.97, 1.0, 64), rmat('#ffffff', 0.7)); this.rangeC2.rotation.x = -Math.PI / 2; this.rangeC2.position.y = 0.13; this.rangeGrp.add(this.rangeC2);
  // 道具预览
  this.itemGrp = new T.Group(); this.itemGrp.visible = false; scene.add(this.itemGrp);
  this.itemRing = new T.Mesh(gfx.ring(0.96, 1.0, 64), rmat('#f7c23d', 0.9)); this.itemRing.rotation.x = -Math.PI / 2; this.itemRing.position.y = 0.14; this.itemGrp.add(this.itemRing);
  this.itemDisc = new T.Mesh(new T.CircleGeometry(1, 48), rmat('#f7c23d', 0.16)); this.itemDisc.rotation.x = -Math.PI / 2; this.itemDisc.position.y = 0.13; this.itemGrp.add(this.itemDisc);
  this.ghost = null;
};

// ---------- 路线 ----------
function tileXY(game, tiles) { return tiles.map(function (i) { return [game.tx(i), game.ty(i)]; }); }
W.entOffset = function (en) { var n = this.game.entrances.length, k = this.game.entrances.indexOf(en); return (k - (n - 1) / 2) * 0.17; };
W.buildRoutes = function () {
  var self = this, g = this.game;
  for (var id in this.routeViews) { this.scene.remove(this.routeViews[id].mesh); }
  this.routeViews = {};
  g.entrances.forEach(function (en) {
    var geo = fx.makeRibbon(tileXY(g, en.route), self.entOffset(en), 0.13, 0.117);
    var mat = fx.ribbonMat(en.color, 0); var mesh = new T.Mesh(geo, mat); mesh.renderOrder = 3; self.scene.add(mesh);
    self.routeViews[en.id] = { mesh: mesh, mat: mat, boost: 0 };
  });
};
W.setDeployHint = function (kind) {
  var g = this.game;
  if (!this.hintMesh) {
    var geo = new T.RingGeometry(0.34, 0.46, 4); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 4);
    this.hintMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    this.hintMesh = new T.InstancedMesh(geo, this.hintMat, g.N); this.hintMesh.frustumCulled = false; this.hintMesh.visible = false; this.scene.add(this.hintMesh);
  }
  if (this.hintKind === kind) return; this.hintKind = kind;
  if (!kind) { this.hintMesh.visible = false; return; }
  var d = G.TOWERS[kind], n = 0, m = new T.Matrix4();
  for (var i = 0; i < g.N; i++) {
    var pc = g.placeClass(i); if (d.place.indexOf(pc) < 0 || g.towerAt[i] || g.isoAt[i] || g.kind[i] === K.IN || g.kind[i] === K.OUT) continue;
    m.makeTranslation(g.tx(i), pc === 'plat' ? 0.4 : (pc === 'node' ? 0.16 : 0.13), g.ty(i)); this.hintMesh.setMatrixAt(n++, m);
  }
  this.hintMesh.count = n; this.hintMesh.instanceMatrix.needsUpdate = true; this.hintMat.color.set(d.color).multiplyScalar(1.6); this.hintMesh.visible = n > 0;
};
W.buildZoneLabels = function () {
  var g = this.game, self = this, sums = {}; this.zoneLabels = [];
  for (var i = 0; i < g.N; i++) { var z = g.zoneAt[i]; if (!z) continue; var k = g.kind[i]; if (k === K.OBS && g.sub[i] !== '=' && g.sub[i] !== '~') continue; var o = sums[z.name] || (sums[z.name] = { x: 0, y: 0, n: 0, c: z.color }); o.x += g.tx(i); o.y += g.ty(i); o.n++; }
  for (var nm in sums) {
    var o2 = sums[nm]; var sp = gfx.textSprite(nm, { size: 40, color: '#ffffff', bg: 'rgba(12,22,20,0.72)', stroke: o2.c, scale: 0.0058, depthTest: false, opacity: 0.0 });
    sp.position.set(o2.x / o2.n, 0.95, o2.y / o2.n); sp.renderOrder = 9; this.scene.add(sp); this.zoneLabels.push(sp);
  }
  this.zoneT = 0; this.zoneOn = false;
};
W.showZones = function (sec) { this.zoneT = Math.max(this.zoneT, sec); };
W.updateZoneLabels = function (dt) {
  var on = this.zoneOn || this.zoneT > 0 || !!this.preview; this.zoneT = Math.max(0, this.zoneT - dt);
  for (var i = 0; i < this.zoneLabels.length; i++) { var m = this.zoneLabels[i].material; m.opacity += ((on ? 0.92 : 0) - m.opacity) * Math.min(1, dt * 8 + 0.02); this.zoneLabels[i].visible = m.opacity > 0.02; }
};
W.buildFlyLines = function () {
  var g = this.game, self = this; this.flyLines = {};
  g.entrances.forEach(function (en) {
    var ex = g.exits[g.map.flyTo[en.id] || '1']; if (!ex) return;
    var pts = []; for (var i = 0; i <= 24; i++) { var u = i / 24; pts.push([en.x + (ex.x - en.x) * u, en.y + (ex.y - en.y) * u]); }
    var geo = fx.makeRibbon(pts, self.entOffset(en) * 0.6, 0.07, 2.1); var mat = fx.ribbonMat(en.color, 1); mat.uniforms.uColor.value.lerp(new T.Color('#c2e8f4'), 0.4);
    var mesh = new T.Mesh(geo, mat); mesh.visible = false; mesh.renderOrder = 5; self.scene.add(mesh); self.flyLines[en.id] = { mesh: mesh, mat: mat };
  });
};
W.updateFlyLines = function (t) {
  var g = this.game, fc = g.forecast(g.waveIdx) || {}, active = {};
  g.enemies.forEach(function (e) { if (e.air && !e.dead) active[e.ent] = 1; });
  for (var id in this.flyLines) { var fl = this.flyLines[id], on = active[id] || (fc[id] && fc[id].hotspot); fl.mesh.visible = !!on; if (on) { fl.mat.uniforms.uTime.value = t; fl.mat.uniforms.uAlpha.value = active[id] ? 0.9 : 0.45; } }
};
W.buildTraffic = function () {
  var g = this.game, per = 12, n = g.entrances.length * per;
  var mat = new T.MeshBasicMaterial({ color: new T.Color('#f7f3e7').multiplyScalar(1.6) });
  this.traffic = new T.InstancedMesh(new T.BoxGeometry(0.13, 0.05, 0.07), mat, n); this.traffic.frustumCulled = false; this.scene.add(this.traffic); this.trafficPer = per;
  this.trafficMat = new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: false });
  var col = new T.Color(); for (var i = 0; i < n; i++) { col.set(g.entrances[Math.floor(i / per)].color).lerp(new T.Color('#ffffff'), 0.55).multiplyScalar(1.7); this.traffic.setColorAt(i, col); }
  this.traffic.instanceColor.needsUpdate = true; this.trafficPhase = [];
  for (var k = 0; k < n; k++) this.trafficPhase.push(G.rand());
};
var _tm = new T.Matrix4(), _tq = new T.Quaternion(), _tp = new T.Vector3(), _ts = new T.Vector3(1, 1, 1), _te = new T.Euler();
W.updateTraffic = function (t) {
  var g = this.game, per = this.trafficPer, self = this;
  g.entrances.forEach(function (en, ei) {
    var pts = en.route, L = pts.length - 1; if (L < 1) return; var off = self.entOffset(en) * 1.0;
    for (var k = 0; k < per; k++) {
      var idx = ei * per + k, u = ((self.trafficPhase[idx] + t * 0.11) % 1) * L, i0 = Math.min(L - 1, Math.floor(u)), f = u - i0;
      var a = pts[i0], b = pts[i0 + 1], ax = g.tx(a), ay = g.ty(a), bx = g.tx(b), by = g.ty(b), dx = bx - ax, dy = by - ay;
      var px = ax + dx * f + (-dy) * off, pz = ay + dy * f + dx * off;
      _te.set(0, -Math.atan2(dy, dx), 0); _tq.setFromEuler(_te); _tp.set(px, 0.15, pz); var sc = Math.min(1, Math.min(u, L - u) * 2); _ts.set(sc, sc, sc);
      _tm.compose(_tp, _tq, _ts); self.traffic.setMatrixAt(idx, _tm);
    }
  });
  this.traffic.instanceMatrix.needsUpdate = true;
};
W.clearPreview = function () {
  var self = this; this.previewViews.forEach(function (v) { self.scene.remove(v.mesh); }); this.previewViews = []; this.preview = null;
  for (var id in this.routeViews) this.routeViews[id].mat.uniforms.uAlpha.value = 1;
};
W.setPreview = function (pv) {
  this.clearPreview(); if (!pv) return;
  this.preview = pv; var g = this.game, self = this;
  g.entrances.forEach(function (en) {
    var r = pv.routes[en.id]; if (!r) return;
    var rv = self.routeViews[en.id];
    if (r.changed && r.reach) {
      rv.mat.uniforms.uAlpha.value = 0.18;
      var geo = fx.makeRibbon(tileXY(g, r.tiles), self.entOffset(en), 0.2, 0.125);
      var mat = fx.ribbonMat('#ffffff', 1); mat.uniforms.uColor.value.set(en.color).lerp(new T.Color('#ffffff'), 0.45);
      var mesh = new T.Mesh(geo, mat); mesh.renderOrder = 4; self.scene.add(mesh); self.previewViews.push({ mesh: mesh, mat: mat });
    }
  });
};
W.onReroute = function (d) {
  var g = this.game, self = this;
  // 重建当前路线；变化的路线闪烁；旧线以幽灵形式淡出
  this.buildRoutes();
  this.ghostRoutes.forEach(function (gr) { self.scene.remove(gr.mesh); }); this.ghostRoutes = [];
  d.changed.forEach(function (id) {
    var en = g.routes[id], old = d.oldRoutes[id];
    self.routeViews[id].boost = 3.2; self.routeViews[id].mat.uniforms.uBoost.value = 1;
    var geo = fx.makeRibbon(tileXY(g, old), self.entOffset(en), 0.13, 0.121);
    var mat = fx.ribbonMat('#ff4f6a', 1); var mesh = new T.Mesh(geo, mat); mesh.renderOrder = 2; self.scene.add(mesh); self.ghostRoutes.push({ mesh: mesh, mat: mat, t: 0 });
  });
  this.reroutePulse = 1; if (d.changed.length) this.showZones(4);
};

// ---------- 事件 ----------
W.towerTop = function (tw) { return tw.onNode ? 0.14 : (this.game.kind[tw.idx] === K.PLAT ? TOP_PLAT : TOP_ROAD); };
W.pos3 = function (x, y, z) { return new T.Vector3(x, z, y); };
W.floatText = function (x, y, z, text, color, big) { if (!big && this.floats.length > 22) return; this.floats.push({ x: x, y: y, z: z, text: text, color: color || '#fff', t: 0, dur: 1.1, big: !!big }); if (this.floats.length > 60) this.floats.shift(); };
W.onEvent = function (type, d) {
  var g = this.game;
  switch (type) {
    case 'built': this.addTowerView(d.tw, d.free); break;
    case 'upgraded': this.rebuildTower(d.tw); break;
    case 'sold': case 'towerDead': this.removeTowerView(d.tw, type); break;
    case 'towerDestroyed': { var c = new T.Color(G.TOWERS[d.tw.kind].color); fx.burst(d.tw.x, 0.5, d.tw.y, '#ffb066', 40, 3.5, 0.9, 0.18, { g: 4 }); fx.burst(d.tw.x, 0.4, d.tw.y, '#' + c.getHexString(), 26, 3, 0.8, 0.14, { g: 3 }); fx.ring(d.tw.x, 0.15, d.tw.y, 0.3, 1.8, 0.5, '#ff7a2e'); this.shake = Math.max(this.shake, 0.18); sfx('towerBreak', d.tw.x, d.tw.y); break; }
    case 'spawn': this.addEnemyView(d.e); if (!d.e.def.boss) sfx('sp_' + d.e.type, d.e.x, d.e.y, 0.7); break;
    case 'proj': if (d.p.kind === 'enc') sfx('ransomFire', d.p.x0, d.p.y0); break;
    case 'death': this.onDeath(d); break;
    case 'leak': this.onLeak(d); break;
    case 'melee': { var v = this.enemyViews[d.e.id]; if (v) v.atk = 1; var tv = this.towerViews[d.tw.id]; var tp = d.tw; fx.burst(tp.x, 0.5, tp.y, '#ff6a6a', 6, 1.6, 0.35, 0.1, { g: 3 }); sfx('melee', tp.x, tp.y); break; }
    case 'towerHit': { var tv2 = this.towerViews[d.tw.id]; if (tv2) tv2.s.hit = 1; if (d.dmg >= 1) this.floatText(d.tw.x, d.tw.y, 1.0, '-' + Math.round(d.dmg), d.kind === 'surge' || d.kind === 'strike' ? '#ff9f43' : '#ff7a7a'); if (d.absorbed > 0) fx.burst(d.tw.x, 0.6, d.tw.y, '#a9d6ea', 4, 1.2, 0.3, 0.1); break; }
    case 'counter': { var tv3 = this.towerViews[d.tw.id]; if (tv3) tv3.s.atk = 1; var e = d.e; fx.beam(d.tw.x, 0.5, d.tw.y, e.x, 0.35, e.y, '#ff8a4c', 0.05, 0.14, 0.9); fx.burst(e.x, 0.4, e.y, '#ffb066', 6, 2, 0.3, 0.1, { g: 3 }); sfx('counter', d.tw.x, d.tw.y); break; }
    case 'enemyHit': { var ev = this.enemyViews[d.e.id]; if (ev) ev.s.hit = 1; if (d.dmg >= 1 && d.kind !== 'trace') this.floatText(d.e.x, d.e.y, (d.e.air ? 2.4 : 0.8) + (d.e.def.boss ? 1.1 : 0), '' + Math.round(d.dmg), d.shieldOnly ? '#a9d6ea' : (d.kind === 'beam' ? '#aaffd0' : '#ffe9a6')); if (d.shieldOnly) fx.burst(d.e.x, 0.5, d.e.y, '#a9d6ea', 4, 1.4, 0.3, 0.1); break; }
    case 'shot': { var tv4 = this.towerViews[d.tw.id]; if (tv4) tv4.s.atk = 1; sfx(d.kind === 'shell' ? 'shell' : (d.kind === 'beam' ? 'beam' : (d.kind === 'pulse' ? 'pulse' : 'bolt')), d.tw.x, d.tw.y); break; }
    case 'beam': { var col = '#bfe3f8'; var top = this.towerTop(d.tw) + 0.75; fx.beam(d.x0, top, d.y0, d.x1, 0.55, d.y1, col, 0.1, 0.22, 1); fx.beam(d.x0, top, d.y0, d.x1, 0.55, d.y1, '#ffffff', 0.035, 0.16, 1); fx.burst(d.x1, 0.5, d.y1, col, 8, 2, 0.35, 0.1); break; }
    case 'impact': this.onImpact(d); break;
    case 'blocked': { var bv = this.enemyViews[d.e.id]; fx.ring(d.e.x, 0.14, d.e.y, 0.1, 0.55, 0.35, '#ff8a4c'); break; }
    case 'revealed': { fx.ring(d.e.x, 0.14, d.e.y, 0.1, 0.8, 0.5, '#ffe066'); fx.burst(d.e.x, 0.4, d.e.y, '#ffe066', 14, 2.2, 0.5, 0.12); sfx('reveal', d.e.x, d.e.y); this.floatText(d.e.x, d.e.y, 1.0, '显形', '#ffe066'); break; }
    case 'detect': break;
    case 'payload': { fx.ring(d.e.x, 0.15, d.e.y, 0.2, 2.1, 0.6, '#6dff4a'); fx.burst(d.e.x, 0.4, d.e.y, '#9bff6a', 40, 3.5, 0.8, 0.16, { g: 2 }); this.shake = Math.max(this.shake, 0.12); sfx('payload', d.e.x, d.e.y); break; }
    case 'clone': { fx.ring(d.to.x, 0.14, d.to.y, 0.1, 0.8, 0.5, '#ff5d6c'); fx.burst(d.to.x, 0.3, d.to.y, '#ff5d6c', 14, 1.8, 0.5, 0.12); sfx('clone', d.to.x, d.to.y); this.floatText(d.to.x, d.to.y, 0.8, '复制', '#ff5d6c'); break; }
    case 'aura': { var pv = this.enemyViews[d.e.id]; if (pv) pv.s.pulse = 1; d.targets.forEach(function (t) { fx.beam(d.e.x, 0.5, d.e.y, t.x, 0.5, t.y, '#a9d6ea', 0.03, 0.4, 0.6); fx.burst(t.x, 0.6, t.y, '#a9d6ea', 6, 1, 0.5, 0.1); }); sfx('shieldUp', d.e.x, d.e.y); break; }
    case 'shieldBreak': { var ob = d.e || d.tw; if (ob) { fx.ring(ob.x, 0.5, ob.y, 0.2, 0.9, 0.35, '#a9d6ea'); fx.burst(ob.x, 0.6, ob.y, '#b4def0', 16, 2.4, 0.5, 0.12); sfx('shieldBreak', ob.x, ob.y); } break; }
    case 'shieldOn': { fx.ring(d.tw.x, 0.2, d.tw.y, 0.2, 0.9, 0.5, '#a9d6ea'); fx.burst(d.tw.x, 0.5, d.tw.y, '#b4def0', 12, 1.5, 0.6, 0.1, { up: 1, flat: true }); break; }
    case 'encrypt': { fx.ring(d.tw.x, 0.5, d.tw.y, 0.2, 1.0, 0.5, '#fb53c5'); fx.burst(d.tw.x, 0.6, d.tw.y, '#fb53c5', 14, 1.6, 0.6, 0.12); sfx('encrypt', d.tw.x, d.tw.y); this.floatText(d.tw.x, d.tw.y, 1.3, '已加密', '#fb53c5'); break; }
    case 'unencrypt': { fx.ring(d.tw.x, 0.5, d.tw.y, 0.2, 1.0, 0.5, '#6dffe9'); fx.burst(d.tw.x, 0.6, d.tw.y, '#6dffe9', 10, 1.5, 0.6, 0.1, { up: 1, flat: true }); sfx('decrypt', d.tw.x, d.tw.y); break; }
    case 'heal': { var rp = d.tw; d.targets.forEach(function (t) { fx.beam(rp.x, 0.9, rp.y, t.x, 0.6, t.y, '#38e8c6', 0.04, 0.3, 0.8); fx.burst(t.x, 0.5, t.y, '#7dffd9', 3, 0.8, 0.7, 0.09, { up: 1, flat: true }); }); sfx('heal', rp.x, rp.y, 0.5); break; }
    case 'skill': this.onSkill(d); break;
    case 'trapped': fx.ring(d.e.x, 0.14, d.e.y, 0.1, 0.6, 0.4, '#d684f8'); break;
    case 'blast': fx.ring(d.x, 0.2, d.y, 0.2, d.r * 1.1, 0.5, '#ff7a2e'); fx.burst(d.x, 0.4, d.y, '#ffb066', 34, 3.4, 0.7, 0.16, { g: 3 }); this.shake = Math.max(this.shake, 0.14); sfx('boom', d.x, d.y); break;
    case 'isolate': this.onIsolate(d); break;
    case 'bypass': this.onBypass(d); break;
    case 'isoGone': { var iv = this.isoViews[d.iso.id]; if (iv) { this.scene.remove(iv.g); delete this.isoViews[d.iso.id]; fx.burst(d.iso.x, 0.4, d.iso.y, '#ff3d4f', 24, 2.6, 0.7, 0.14, { g: 2 }); } break; }
    case 'isoHit': { var ivv = this.isoViews[d.iso.id]; this.floatText(d.iso.x, d.iso.y, 1.0, '-' + Math.round(d.dmg), '#ff9f43'); break; }
    case 'item': this.onItem(d); break;
    case 'reroute': this.onReroute(d); break;
    case 'turn': { this.turnCount = (this.turnCount || 0) + 1; if (this.turnT === undefined || this.time - this.turnT > 0.6) { this.turnT = this.time; this.turnLabels = 0; } if (this.turnLabels < 3 && !d.e.def.boss) { this.turnLabels++; this.floatText(d.e.x, d.e.y, 0.9, '掉头', '#7fdcc4'); fx.ring(d.e.x, 0.14, d.e.y, 0.1, 0.7, 0.4, '#7fdcc4', 0.7); sfx('turn', d.e.x, d.e.y); } break; }
    case 'strike': { var sv = this.enemyViews[d.e.id]; if (sv) sv.atk = 1; var tx = d.idx % g.W, ty = (d.idx / g.W) | 0; fx.ring(tx, 0.2, ty, 0.2, 1.4, 0.4, '#ff9f43'); fx.burst(tx, 0.5, ty, '#ff9f43', 22, 3, 0.5, 0.14, { g: 3 }); this.shake = Math.max(this.shake, 0.1); sfx('strike', tx, ty); break; }
    case 'flooderTurn': this.floatText(d.e.x, d.e.y, 1.2, '冲击节点', '#ff9f43'); break;
    case 'bossIntro': this.shake = 0.5; this.flash = 0.8; sfx('bossIntro'); if (G.camCtl && !(G.match && G.match.demo)) G.camCtl.focus(d.e.x, d.e.y + 1.5, 13, 2.4); break;
    case 'bossPhase': this.shake = 0.5; this.flash = 0.6; fx.ring(d.e.x, 0.15, d.e.y, 0.3, 5, 1.0, d.e.def.color); sfx('bossPhase'); break;
    case 'hazard': this.onHazard(d); break;
    case 'surge': { fx.ring(d.x, 0.15, d.y, 0.3, 2.4, 0.7, '#ff4a1a'); fx.ring(d.x, 0.15, d.y, 0.1, 1.4, 0.5, '#ffffff'); fx.burst(d.x, 0.5, d.y, '#ff6b3d', 60, 5, 0.9, 0.2, { g: 3 }); this.shake = 0.45; sfx('surge', d.x, d.y); if (d.boss) { var bv2 = this.enemyViews[d.boss.id]; if (bv2) bv2.s.surge = 1; fx.beam(d.boss.x, 0.8, d.boss.y, d.x, 0.2, d.y, '#ff6b3d', 0.14, 0.4, 0.9); } break; }
    case 'storm': { fx.ring(d.e.x, 0.3, d.e.y, 0.3, 5.2, 0.9, '#d5aafb'); fx.ring(d.e.x, 0.6, d.e.y, 0.3, 4.2, 0.7, '#ffffff', 0.6); this.shake = 0.35; sfx('storm', d.e.x, d.e.y); var bv3 = this.enemyViews[d.e.id]; if (bv3) bv3.s.surge = 1; break; }
    case 'swarm': { fx.ring(d.e.x, 0.2, d.e.y, 0.3, 2.5, 0.6, '#ff5d6c'); sfx('swarm', d.e.x, d.e.y); break; }
    case 'wave': this.flash = Math.max(this.flash, d.boss ? 0.5 : 0.18); sfx(d.rush || d.boss ? 'waveHeavy' : 'wave'); break;
    case 'waveClear': sfx('waveClear'); break;
    case 'intelGain': this.floatText(d.x == null ? 0 : d.x, d.y == null ? 0 : d.y, 1.4, '情报 +' + d.v, '#a9d6ea', true); break;
    case 'end': sfx(d.win ? 'win' : 'lose'); break;
  }
};
W.onImpact = function (d) {
  var k = d.kind;
  if (k === 'bolt') { fx.burst(d.x, d.z, d.y, '#c4e6fb', 8, 2.2, 0.3, 0.1); fx.ring(d.x, 0.2, d.y, 0.05, 0.35, 0.25, '#9fd2f5', 0.7); sfx('hit', d.x, d.y, 0.5); }
  else if (k === 'pulse') { fx.burst(d.x, d.z, d.y, '#9fd6ea', 10, 2, 0.4, 0.11); fx.ring(d.x, 0.2, d.y, 0.05, 0.6, 0.35, '#9fd6ea', 0.8); sfx('hitSlow', d.x, d.y, 0.5); }
  else if (k === 'shell') { fx.burst(d.x, 0.25, d.y, '#ffd43b', 26, 3.2, 0.6, 0.15, { g: 3 }); fx.ring(d.x, 0.14, d.y, 0.1, d.r * 1.15, 0.45, '#ffd43b'); fx.ring(d.x, 0.14, d.y, 0.05, d.r * 0.7, 0.3, '#ffffff', 0.7); sfx('boom', d.x, d.y, 0.8); }
  else if (k === 'enc') { fx.burst(d.x, 0.6, d.y, '#fb53c5', 12, 2.2, 0.45, 0.12); sfx('encHit', d.x, d.y, 0.6); }
};
W.onSkill = function (d) {
  var tw = d.tw, top = this.towerTop(tw);
  if (d.kind === 'harden') { fx.ring(tw.x, 0.2, tw.y, 0.3, 1.2, 0.6, '#ffb066'); fx.burst(tw.x, 0.4, tw.y, '#ffb066', 22, 2, 0.6, 0.12, { up: 1 }); sfx('harden', tw.x, tw.y); var v = this.towerViews[tw.id]; }
  else if (d.kind === 'trap') { var st = G.towerStats(tw.kind, tw.level, tw.branch); fx.ring(tw.x, 0.2, tw.y, 0.3, st.lure, 0.7, '#d684f8'); fx.ring(tw.x, 0.2, tw.y, 0.2, st.lure * 0.7, 0.5, '#ffffff', 0.6); sfx('trap', tw.x, tw.y); var tv = this.towerViews[tw.id]; if (tv) tv.s.trap = 1; }
  else if (d.kind === 'switch') { var st2 = G.towerStats(tw.kind, tw.level, tw.branch); fx.ring(tw.x, 0.25, tw.y, 0.3, st2.skillR, 0.8, '#38e8c6'); fx.ring(tw.x, 0.25, tw.y, 0.2, st2.skillR * 0.7, 0.6, '#ffffff', 0.7); fx.burst(tw.x, 0.8, tw.y, '#7dffd9', 40, 3, 0.9, 0.14, { up: 0.5 }); sfx('switch', tw.x, tw.y); var tv2 = this.towerViews[tw.id]; if (tv2) tv2.s.skill = 1; }
};
W.onIsolate = function (d) {
  var x = this.game.tx(d.idx), y = this.game.ty(d.idx);
  fx.ring(x, 0.15, y, 0.2, 1.5, 0.6, '#ff3d4f'); fx.ring(x, 0.15, y, 0.1, 0.9, 0.4, '#ffffff', 0.7);
  fx.burst(x, 0.5, y, '#ff6a7a', 30, 2.8, 0.8, 0.14, { up: 1.2, flat: true }); this.shake = Math.max(this.shake, 0.16);
  sfx('isolate', x, y);
  if (d.iso) this.addIsoView(d.iso);
};
W.onBypass = function (d) {
  var x = this.game.tx(d.idx), y = this.game.ty(d.idx);
  fx.ring(x, 0.15, y, 0.2, 1.6, 0.7, '#6dffb0'); fx.burst(x, 0.5, y, '#6dffb0', 28, 2.4, 0.9, 0.13, { up: 1.5, flat: true });
  this.floatText(x, y, 1.5, '旁路直通', '#6dffb0', true); sfx('bypass', x, y);
};
W.onItem = function (d) {
  if (d.id === 'isolator') return;
  if (d.id === 'downgrade') {
    var g = this.game; sfx('downgrade', d.x, d.y);
    d.tiles.forEach(function (i) { fx.ring(g.tx(i), 0.14, g.ty(i), 0.1, 0.55, 0.7, '#ff9a3d', 0.7); });
    fx.ring(d.x, 0.14, d.y, 0.3, G.ITEMS.downgrade.radius * 1.1, 0.7, '#ff9a3d'); fx.burst(d.x, 0.4, d.y, '#ffb066', 40, 3, 0.9, 0.12, { flat: true, up: 0.7 });
  } else if (d.id === 'restore') {
    fx.ring(d.x, 0.2, d.y, 0.2, 1.3, 0.7, '#6dffe9'); fx.burst(d.x, 0.5, d.y, '#7dffd9', 30, 2.4, 0.9, 0.13, { up: 1.3 }); sfx('restore', d.x, d.y);
  }
};
W.onDeath = function (d) {
  var e = d.e, v = this.enemyViews[e.id]; if (!v) return;
  delete this.enemyViews[e.id]; this.removeEnemyBlob(v);
  var col = e.def.color, boss = e.def.boss, n = boss ? 90 : 18;
  fx.burst(e.x, e.air ? 2.1 : 0.4, e.y, col, n, boss ? 6 : 2.8, boss ? 1.3 : 0.7, boss ? 0.22 : 0.13, { g: e.air ? 5 : 2 });
  fx.ring(e.x, e.air ? 2.0 : 0.15, e.y, 0.1, boss ? 4 : 0.9, boss ? 1.0 : 0.4, col);
  if (boss) { this.shake = 0.8; this.flash = 0.7; sfx('bossDie', e.x, e.y); } else sfx(e.air ? 'airDie' : 'die', e.x, e.y, 0.7);
  if (!d.silent) this.floatText(e.x, e.y, (e.air ? 2.6 : 0.9) + (boss ? 1.4 : 0), '+' + e.def.rewardC, '#ffe08a');
  this.dying.push({ v: v, t: 0, dur: boss ? 1.4 : (e.air ? 0.7 : 0.38), boss: boss, air: e.air, y0: v.g.position.y, spin: (G.rand() - 0.5) * 12 });
};
W.onLeak = function (d) {
  var e = d.e, v = this.enemyViews[e.id]; if (v) { this.scene.remove(v.g); this.removeEnemyBlob(v); delete this.enemyViews[e.id]; }
  var ex = this.game.exits[this.game.sub[e.cur]] || this.game.exits[this.game.map.flyTo[e.ent]] || { x: e.x, y: e.y };
  fx.ring(ex.x, 0.2, ex.y, 0.2, 2.2, 0.6, '#ff3d4f'); fx.burst(ex.x, 0.6, ex.y, '#ff5d6c', 30, 3, 0.8, 0.15, { up: 1 });
  this.flash = Math.max(this.flash, 0.35); this.shake = Math.max(this.shake, 0.22); sfx('leak');
  var eo = this.terrain.exitObjs[ex.id]; if (eo) eo.flash = 1;
};
W.onHazard = function (d) {
  var h = d.h, g = this.game;
  if (d.phase === 'warn') {
    var grp = new T.Group(), self = this;
    if (h.kind === 'surge') {
      var x = g.tx(h.tiles[0]), y = g.ty(h.tiles[0]);
      var r1 = new T.Mesh(gfx.ring(0.9, 1.0, 48), new T.MeshBasicMaterial({ color: new T.Color('#ff3d1a').multiplyScalar(2), transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); r1.rotation.x = -Math.PI / 2; r1.position.set(x, 0.2, y); grp.add(r1);
      var disc = new T.Mesh(new T.CircleGeometry(1.3, 40), new T.MeshBasicMaterial({ color: new T.Color('#ff3d1a').multiplyScalar(1.4), transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.18, y); grp.add(disc);
      this.hazViews[h.id] = { g: grp, h: h, r1: r1, disc: disc, kind: 'surge' };
    } else {
      var col = h.kind === 'blackhole' ? '#c682f8' : '#ff3d4f';
      var meshes = [];
      h.tiles.forEach(function (i) {
        var x = g.tx(i), y = g.ty(i);
        var m = new T.Mesh(gfx.plane(1, 1), new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { uTime: { value: 0 }, uCol: { value: new T.Color(col) }, uOn: { value: 0 }, uKind: { value: h.kind === 'blackhole' ? 0 : 1 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
          fragmentShader: 'varying vec2 vUv; uniform float uTime,uOn,uKind; uniform vec3 uCol; void main(){ vec2 p = vUv-0.5; float r = length(p); float a; vec3 c = uCol;\n if (uKind < 0.5) { float ang = atan(p.y,p.x); float sp = sin(ang*5.0 + r*18.0 - uTime*6.0)*0.5+0.5; a = smoothstep(0.55,0.2,r)*(0.35+0.65*sp); a = mix(a*0.6, a, uOn); c *= 1.0 + 1.5*(1.0-r*2.0); if (uOn>0.5) c = mix(c, vec3(0.05,0.0,0.12)*8.0, smoothstep(0.25,0.0,r)); }\n else { float s = fract((p.x+p.y)*5.0 - uTime*0.8); a = step(0.5,s)*0.55 + 0.1; a *= smoothstep(0.7,0.4,max(abs(p.x),abs(p.y))*1.4); a = mix(a*0.7, a+0.25, uOn); c *= 2.0; }\n float blink = mix(0.55+0.45*sin(uTime*14.0), 1.0, uOn); gl_FragColor = vec4(c, a*blink); }' }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 0.16, y); m.renderOrder = 6; grp.add(m); meshes.push(m);
        var rg = new T.Mesh(gfx.ring(0.46, 0.5, 4), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(2.2), transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); rg.rotation.x = -Math.PI / 2; rg.rotation.z = Math.PI / 4; rg.position.set(x, 0.17, y); grp.add(rg); meshes.push(rg);
      });
      this.hazViews[h.id] = { g: grp, h: h, meshes: meshes, kind: h.kind };
    }
    this.scene.add(grp); sfx('warn');
  } else if (d.phase === 'on') {
    var hv = this.hazViews[h.id]; if (hv && hv.meshes) hv.meshes.forEach(function (m) { if (m.material.uniforms) m.material.uniforms.uOn.value = 1; });
    h.tiles.forEach(function (i) { fx.ring(g.tx(i), 0.2, g.ty(i), 0.1, 1.0, 0.5, h.kind === 'blackhole' ? '#c682f8' : '#ff3d4f'); fx.burst(g.tx(i), 0.4, g.ty(i), h.kind === 'blackhole' ? '#c682f8' : '#ff3d4f', 14, 2, 0.6, 0.12); });
    this.shake = Math.max(this.shake, 0.25); sfx(h.kind === 'blackhole' ? 'blackhole' : 'lock');
  } else { var hv2 = this.hazViews[h.id]; if (hv2) { this.scene.remove(hv2.g); delete this.hazViews[h.id]; } if (d.phase === 'end') { h.tiles.forEach(function (i) { fx.ring(g.tx(i), 0.2, g.ty(i), 0.1, 0.9, 0.5, '#6dffb0'); }); sfx('bypass'); } }
};

// ---------- 塔视图 ----------
W.addTowerView = function (tw, free) {
  var g = this.game, d = G.TOWERS[tw.kind];
  var hor = 0; for (var k = 0; k < 4; k++) { var nx = tw.x + DX[k], ny = tw.y + DY[k]; if (g.inb(nx, ny) && g.isRoadKind(g.kind[g.idx(nx, ny)]) && (k === 0 || k === 2)) hor = 1; }
  var model = G.models.tower(tw.kind, tw.level, tw.branch, { onNode: tw.onNode, wallYaw: hor ? Math.PI / 2 : 0 });
  var grp = new T.Group(); grp.add(model.group); model.group.scale.setScalar(1.2); grp.position.set(tw.x, this.towerTop(tw), tw.y); this.scene.add(grp);
  var aim = tw.face;
  var v = { tw: tw, model: model, g: grp, s: { t: 0, atk: 0, hit: 0, trap: 0, skill: 0 }, build: free ? 0.9 : 0, aim: aim, shieldMesh: null, hor: hor };
  this.towerViews[tw.id] = v;
  if (!free) { fx.ring(tw.x, 0.16, tw.y, 0.2, 1.1, 0.5, d.color); fx.burst(tw.x, 0.3, tw.y, d.color, 22, 2.2, 0.7, 0.12, { up: 1 }); sfx('build', tw.x, tw.y); }
  gfx.shadowize(grp, true, true);
};
W.rebuildTower = function (tw) {
  var v = this.towerViews[tw.id]; if (!v) return;
  this.scene.remove(v.g); delete this.towerViews[tw.id]; this.addTowerView(tw, true);
  var nv = this.towerViews[tw.id]; nv.build = 0; nv.aim = v.aim;
  fx.ring(tw.x, 0.16, tw.y, 0.2, 1.6, 0.7, '#ffffff'); fx.ring(tw.x, 0.16, tw.y, 0.1, 1.1, 0.5, G.TOWERS[tw.kind].color);
  fx.burst(tw.x, 0.5, tw.y, '#ffffff', 30, 3, 0.9, 0.13, { up: 1.4 }); sfx('upgrade', tw.x, tw.y);
};
W.removeTowerView = function (tw, why) {
  var v = this.towerViews[tw.id]; if (!v) return; delete this.towerViews[tw.id];
  if (why === 'sold') { fx.burst(tw.x, 0.5, tw.y, '#a9d6ea', 24, 2.4, 0.8, 0.12, { up: 1.2 }); fx.ring(tw.x, 0.16, tw.y, 0.2, 1.0, 0.5, '#a9d6ea'); sfx('sell', tw.x, tw.y); }
  this.dying.push({ v: v, t: 0, dur: why === 'sold' ? 0.4 : 0.25, tower: true });
};
W.addIsoView = function (iso) {
  var g = new T.Group(); g.position.set(iso.x, 0.14, iso.y);
  var plug = gfx.mesh(gfx.cyl(0.2, 0.26, 0.2, 8), gfx.mat('#ffd7a0', { m: 0.7, r: 0.3, e: 0.5, ec: '#ff8a3d' }), 0, 0.1, 0, g);
  var ring = gfx.mesh(gfx.tor(0.3, 0.025, 6, 20), gfx.glow('#ffb04a', 2.2), 0, 0.28, 0, g); ring.rotation.x = Math.PI / 2;
  gfx.mesh(gfx.box(0.08, 0.34, 0.08), gfx.glow('#ff8a3d', 2), 0, 0.3, 0, g);
  var ttl = gfx.mesh(gfx.ring(0.33, 0.36, 40), new T.MeshBasicMaterial({ color: new T.Color('#ffb04a').multiplyScalar(2), transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }), 0, 0.05, 0, g); ttl.rotation.x = -Math.PI / 2;
  gfx.shadowize(g, true, false);
  this.scene.add(g); this.isoViews[iso.id] = { g: g, iso: iso, ring: ring, ttl: ttl, build: 0 };
};

// ---------- 敌人视图 ----------
W.addEnemyView = function (e) {
  var model = G.models.enemy(e.type), grp = new T.Group(); grp.add(model.group); this.scene.add(grp);
  var sm = null;
  var v = { e: e, model: model, g: grp, s: { t: 0, m: G.rand() * 6, mv: 1, atk: 0, hit: 0, rev: e.disguised ? 0 : 1, pulse: 0, surge: 0, phase: 1, opacity: 1 }, px: e.x, py: e.y, shield: null, op: 1 };
  this.enemyViews[e.id] = v;
  gfx.shadowize(grp, true, false);
  var col = e.def.color; if (!e.cloned || e.def.boss) fx.ring(e.x, 0.15, e.y, 0.1, 0.9, 0.5, col, 0.8);
  if (e.def.boss) { fx.ring(e.x, 0.15, e.y, 0.4, 6, 1.4, col); }
};
W.enemyWorldPos = function (v) {
  var e = v.e, cy = Math.cos(e.yaw), sy = Math.sin(e.yaw), lane = e.lane * (e.def.boss ? 0.2 : 1), slot = e.bl ? e.slotIdx * 0.2 : 0;
  var x = e.x + (-sy) * lane - cy * slot, z = e.y + cy * lane - sy * slot;
  return [x, z];
};

// ---------- 帧同步 ----------
W.update = function (dt, t) {
  var g = this.game; this.time = t;
  this.terrain.update(t, dt);
  fx.update(dt);
  var self = this;
  // 节点高亮复位
  for (var nid in this.terrain.nodeObjs) this.terrain.nodeObjs[nid].hl = 0;
  if (this.hoverNodeHint) this.hoverNodeHint.forEach(function (i) { if (self.terrain.nodeObjs[i]) self.terrain.nodeObjs[i].hl = 0.5; });
  if (this.hoverTile >= 0 && this.terrain.nodeObjs[this.hoverTile]) this.terrain.nodeObjs[this.hoverTile].hl = 1;
  // 路线带
  for (var id in this.routeViews) {
    var rv = this.routeViews[id]; rv.mat.uniforms.uTime.value = t;
    if (rv.boost > 0) { rv.boost -= dt; rv.mat.uniforms.uBoost.value = rv.boost > 0 ? 1 : 0; }
  }
  this.previewViews.forEach(function (p) { p.mat.uniforms.uTime.value = t; });
  this.updateTraffic(t); this.updateFlyLines(t); this.updateZoneLabels(dt);
  if (this.hintMesh && this.hintMesh.visible) this.hintMat.opacity = 0.35 + 0.3 * Math.sin(t * 5);
  for (var gi = this.ghostRoutes.length - 1; gi >= 0; gi--) { var gr = this.ghostRoutes[gi]; gr.t += dt; gr.mat.uniforms.uTime.value = t; gr.mat.uniforms.uAlpha.value = Math.max(0, 1 - gr.t / 2.6) * 0.8; if (gr.t > 2.6) { this.scene.remove(gr.mesh); this.ghostRoutes.splice(gi, 1); } }
  // 节点状态
  g.nodes.forEach(function (i) { self.terrain.setNodeState(i, (g.blocked[i] & 1) ? 'iso' : (g.nodeCd[i] > 0 ? 'cd' : 'open')); });
  // 塔
  for (var tid in this.towerViews) this.syncTower(this.towerViews[tid], dt, t);
  for (var eid in this.enemyViews) this.syncEnemy(this.enemyViews[eid], dt, t);
  for (var iid in this.isoViews) { var iv = this.isoViews[iid]; iv.build = Math.min(1, iv.build + dt * 3); iv.g.scale.set(1, 0.2 + 0.8 * iv.build, 1); iv.ring.rotation.z = t * 2; iv.ttl.scale.setScalar(1); iv.g.position.y = 0.14 + Math.sin(t * 3) * 0.01; var f = iv.iso.ttl / iv.iso.ttlMax; iv.ttl.material.opacity = 0.4 + 0.5 * f; if (iv.iso.hitFlash > 0) iv.ring.scale.setScalar(1.3); else iv.ring.scale.setScalar(1); }
  this.syncProjs(dt, t);
  // 死亡动画
  for (var di = this.dying.length - 1; di >= 0; di--) {
    var dy = this.dying[di]; dy.t += dt; var p = dy.t / dy.dur;
    if (p >= 1) { this.scene.remove(dy.v.g); this.dying.splice(di, 1); continue; }
    var s = dy.tower ? Math.max(0.01, 1 - p) : Math.max(0.01, 1 - p * p) * (1 + Math.sin(p * 40) * 0.08 * (1 - p));
    dy.v.g.scale.set(s, dy.tower ? s : s * (1 - 0.5 * p), s); if (!dy.tower) { dy.v.g.position.x += (G.rand() - 0.5) * 0.02; if (dy.boss) dy.v.g.rotation.y += dt * 3; if (dy.air) { var fall = p * p; dy.v.g.position.y = dy.y0 - (dy.y0 - 0.2) * fall; dy.v.g.rotation.y += dt * dy.spin; dy.v.g.rotation.z += dt * dy.spin * 0.3; if (G.rand() < 0.6) fx.spawn(dy.v.g.position.x, dy.v.g.position.y, dy.v.g.position.z, 0, 0.3, 0, '#ff9a5a', 0.14, 0.4); } else if (dy.tower) { dy.v.g.position.y -= dt * 0.8; } }
  }
  // 危害贴花
  for (var hid in this.hazViews) {
    var hv = this.hazViews[hid], h = hv.h;
    if (hv.kind === 'surge') { var pp = h.t / h.warn; hv.r1.scale.setScalar(1.9 - pp * 1.0 + Math.sin(t * 18) * 0.04); hv.r1.material.opacity = 0.5 + 0.5 * Math.sin(t * 20); hv.disc.material.opacity = 0.1 + 0.25 * pp; }
    else hv.meshes.forEach(function (m) { if (m.material.uniforms) m.material.uniforms.uTime.value = t; else m.material.opacity = h.active ? 0.5 : 0.5 + 0.5 * Math.sin(t * 16); });
  }
  // 出口闪光
  for (var xid in this.terrain.exitObjs) { var eo = this.terrain.exitObjs[xid]; if (eo.flash > 0) { eo.flash -= dt * 1.5; eo.pad.material.opacity = 0.9; } }
  // 选中环 / 悬停
  this.updateSelection(t);
  // 镜头震动与全屏闪
  this.shake = Math.max(0, this.shake - dt * 1.6); this.flash = Math.max(0, this.flash - dt * 1.4);
  gfx.matComp.uniforms.flash.value = this.flash * 0.4;
  gfx.matComp.uniforms.flashCol.value.set(this.flashCol || (this.reroutePulse ? '#f7c23d' : '#ff3d4f'));
  if (this.shake > 0 && G.camCtl) G.camCtl.shakeAmt = this.shake;
  this.drawOverlay(dt, t);
};
W.syncTower = function (v, dt, t) {
  var tw = v.tw, s = v.s, g = this.game, st = G.towerStats(tw.kind, tw.level, tw.branch);
  s.t = t; s.atk = Math.max(0, s.atk - dt * 5); s.hit = Math.max(0, s.hit - dt * 6); s.trap = Math.max(0, s.trap - dt); s.skill = Math.max(0, s.skill - dt * 2);
  s.enc = tw.encT > 0; s.harden = tw.hardenT; s.blocking = st.block ? tw.blocked.length ? Math.min(1, g.blockUsed(tw) / st.block) : 0 : 0;
  s.lure = st.lure; s.healing = tw.healing && tw.healing.length && tw.encT <= 0 ? 1 : 0; s.detecting = tw.kind === 'sandbox' && tw.encT <= 0;
  if (tw.aim != null && tw.cd > 0 && (tw.kind === 'interceptor' || tw.kind === 'sandbox')) { v.aimTarget = tw.aim; } else if (tw.cd <= -0.6 || v.aimTarget == null) v.aimTarget = tw.face;
  var da = G.angDiff(v.aimTarget == null ? tw.face : v.aimTarget, v.aim); v.aim += da * Math.min(1, dt * 12);
  s.aimYaw = -v.aim; s.faceYaw = -tw.face; s.showFace = tw.kind === 'interceptor' && (this.sel && this.sel.obj === tw || this.showAllFaces);
  s.cooling = tw.cd > 0;
  v.build = Math.min(1, v.build + dt * 2.6);
  var b = v.build, sc = b < 1 ? (1 - Math.pow(1 - b, 3)) * (1 + Math.sin(b * Math.PI) * 0.12) : 1;
  v.g.scale.set(1, Math.max(0.02, sc), 1); v.g.position.y = this.towerTop(tw);
  v.model.update(dt, s);
  // 护盾泡
  if (tw.shield > 0) {
    if (!v.shieldMesh) { v.shieldMesh = new T.Mesh(gfx.sph(0.6, 20, 14), new T.MeshBasicMaterial({ color: new T.Color('#a9d6ea').multiplyScalar(1.5), transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); v.shieldMesh.position.y = 0.5; v.g.add(v.shieldMesh); }
    v.shieldMesh.visible = true; v.shieldMesh.material.opacity = 0.14 + 0.1 * Math.sin(t * 4) + (s.hit * 0.3); v.shieldMesh.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
  } else if (v.shieldMesh) v.shieldMesh.visible = false;
};
W.syncEnemy = function (v, dt, t) {
  var e = v.e, s = v.s, def = e.def, g = this.game;
  var pos = this.enemyWorldPos(v), dx = pos[0] - v.px, dz = pos[1] - v.py, dist = Math.hypot(dx, dz);
  v.px = pos[0]; v.py = pos[1];
  var spd = dt > 0 ? dist / dt : 0, mvT = clamp01(spd / Math.max(0.2, def.speed * 0.6)); s.mv += (mvT - s.mv) * Math.min(1, dt * 8); if (e.bl || e.rootT > 0) s.mv *= 0.9;
  s.m += dist * (def.boss ? 0.9 : 1.2) / (def.boss ? 1.5 : 0.6) * 0.6 + dt * 0.4 * (s.mv > 0.1 ? 0 : 0);
  s.t = t; s.atk = Math.max(0, s.atk - dt * 4); s.hit = Math.max(0, s.hit - dt * 7); s.pulse = Math.max(0, s.pulse - dt * 1.4); s.surge = Math.max(0, s.surge - dt * 1.2);
  s.rev += ((e.revealed || !e.disguised ? 1 : 0) - s.rev) * Math.min(1, dt * 7);
  s.phase = e.phase || 1;
  var opTarget = e.stealth && !e.revealed ? 0.22 : 1; v.op += (opTarget - v.op) * Math.min(1, dt * 4); s.opacity = v.op;
  var base = e.air ? 2.1 + Math.sin(t * 2.4 + e.id) * 0.08 : TOP_ROAD;
  var scl = e.spawnT > 0 ? 1 - e.spawnT / 0.7 : 1; if (e.bossSpawn > 0) scl = 1 - e.bossSpawn / 2.2;
  scl = Math.max(0.02, scl);
  v.g.position.set(pos[0], base, pos[1]); v.g.rotation.y = -e.yaw; v.g.scale.setScalar(scl * (def.boss ? 1 : 1.35));
  if (e.air) { v.g.rotation.z = Math.sin(t * 1.5 + e.id) * 0.05; }
  v.model.update(dt, s);
  // 落影（飞行单位）
  if (e.air) { if (!v.blob) { v.blob = new T.Mesh(gfx.ring(0, 0.3, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })); v.blob.rotation.x = -Math.PI / 2; this.scene.add(v.blob); } v.blob.position.set(pos[0], 0.12, pos[1]); }
  // 护盾泡
  if (e.shield > 0) {
    if (!v.shieldMesh) { v.shieldMesh = new T.Mesh(gfx.sph(1, 14, 10), new T.MeshBasicMaterial({ color: new T.Color('#a9d6ea').multiplyScalar(1.5), transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending })); v.g.add(v.shieldMesh); }
    v.shieldMesh.visible = true; var r = def.boss ? 1.1 : 0.4; v.shieldMesh.scale.setScalar(r * (1 + Math.sin(t * 5) * 0.04)); v.shieldMesh.position.y = def.boss ? 1 : 0.35; v.shieldMesh.material.opacity = 0.12 + Math.min(0.2, e.shield / 400);
  } else if (v.shieldMesh) v.shieldMesh.visible = false;
  // 持续粒子
  if (e.type === 'flooder' && G.rand() < 0.5) fx.spawn(pos[0] + (G.rand() - 0.5) * 0.5, 0.2, pos[1] + (G.rand() - 0.5) * 0.5, 0, 0.6, 0, '#ff8a3d', 0.1, 0.5);
  if (e.air && G.rand() < 0.4) fx.spawn(pos[0], 2.0, pos[1], 0, 0.1, 0, '#7cc9e4', 0.08, 0.5);
  if (e.def.boss && G.rand() < 0.7) fx.spawn(pos[0] + (G.rand() - 0.5) * 1.2, 0.2 + G.rand() * 1.6, pos[1] + (G.rand() - 0.5) * 1.2, 0, 0.5, 0, def.color, 0.14, 0.9);
  if (e.slowT > 0 && G.rand() < 0.3) fx.spawn(pos[0], 0.3, pos[1], 0, 0.4, 0, '#9fd6ea', 0.07, 0.5);
  if (e.rootT > 0 && G.rand() < 0.3) fx.spawn(pos[0] + (G.rand() - 0.5) * 0.4, 0.15, pos[1] + (G.rand() - 0.5) * 0.4, 0, 0.8, 0, '#d684f8', 0.08, 0.5);
};
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
W.removeEnemyBlob = function (v) { if (v.blob) this.scene.remove(v.blob); };

// 弹道
W.syncProjs = function (dt, t) {
  var g = this.game, seen = {};
  for (var i = 0; i < g.projs.length; i++) {
    var p = g.projs[i]; seen[p.id] = 1; var v = this.projViews[p.id];
    if (!v) {
      var mesh, col;
      if (p.kind === 'bolt') { col = '#c4e6fb'; mesh = new T.Mesh(gfx.sph(0.07, 8, 6), gfx.glow(col, 3)); mesh.scale.set(2.2, 1, 1); }
      else if (p.kind === 'pulse') { col = '#9fd6ea'; mesh = new T.Mesh(gfx.tor(0.1, 0.03, 6, 14), gfx.glow(col, 3)); }
      else if (p.kind === 'shell') { col = '#ffd43b'; mesh = new T.Mesh(gfx.ico(0.12, 1), gfx.glow('#ffe58a', 3)); }
      else { col = '#fb53c5'; mesh = new T.Mesh(gfx.sph(0.09, 8, 6), gfx.glow(col, 3)); }
      this.scene.add(mesh); v = this.projViews[p.id] = { mesh: mesh, col: col };
    }
    var tz = p.target ? (p.target.air ? 2.1 : (p.target.isIso ? 0.3 : (p.target.kind ? this.towerTop(p.target) + 0.4 : 0.5))) : 0.2;
    var tx = p.target ? p.target.x : p.tx, ty = p.target ? p.target.y : p.ty; if (p.fixed) { tx = p.tx; ty = p.ty; }
    var u = Math.min(1, p.t);
    var x = p.x0 + (tx - p.x0) * u, z = p.y0 + (ty - p.y0) * u, y;
    var z0 = (p.src && p.src.kind ? this.towerTop(p.src) + 0.75 : 0.8);
    if (p.kind === 'shell') { y = z0 + (0.2 - z0) * u + Math.sin(u * Math.PI) * (1.2 + Math.hypot(tx - p.x0, ty - p.y0) * 0.25); v.mesh.rotation.x += dt * 8; }
    else y = z0 + (tz - z0) * u;
    v.mesh.position.set(x, y, z);
    if (p.kind === 'bolt') v.mesh.rotation.y = -Math.atan2(ty - p.y0, tx - p.x0);
    if (p.kind === 'pulse') { v.mesh.rotation.y = -Math.atan2(ty - p.y0, tx - p.x0) + Math.PI / 2; v.mesh.scale.setScalar(1 + u * 1.2); }
    fx.spawn(x, y, z, 0, 0, 0, v.col, p.kind === 'shell' ? 0.16 : 0.1, 0.3, { k: 1.5, d: 3 });
  }
  for (var id in this.projViews) { if (!seen[id]) { this.scene.remove(this.projViews[id].mesh); delete this.projViews[id]; } }
};

// 选中 / 悬停 / 范围
W.setSelection = function (obj, type) { this.sel = obj ? { obj: obj, type: type } : null; this.refreshRange(); };
W.updateSelection = function (t) {
  var s = this.sel, g = this.game;
  if (s && s.obj) {
    var o = s.obj, x, y, col = '#ffffff', r = 0.55;
    if (s.type === 'tower') { if (o.dead) { this.setSelection(null); } else { x = o.x; y = o.y; col = G.TOWERS[o.kind].color; } }
    else if (s.type === 'enemy') { if (o.dead) { this.setSelection(null); } else { x = o.x; y = o.y; col = o.def.color; r = o.def.boss ? 1.4 : 0.6; } }
    else if (s.type === 'tile') { x = g.tx(o); y = g.ty(o); col = '#c2e8f4'; }
    if (x != null) { this.selRing.position.set(x, o.air ? 0.15 : 0.16, y); this.selRing.scale.setScalar(r * (1 + Math.sin(t * 5) * 0.05)); this.selRing.material.color.set(col).multiplyScalar(2); this.selRing.material.opacity = 0.9; this.selRing.rotation.z = t * 0.8; }
    else this.selRing.material.opacity = 0;
    if (s.type === 'tower' && s.obj && !s.obj.dead) this.refreshRange(true);
  } else this.selRing.material.opacity = 0;
  if (this.hoverTile >= 0) { this.hover.position.set(g.tx(this.hoverTile), g.kind[this.hoverTile] === K.PLAT ? 0.4 : 0.14, g.ty(this.hoverTile)); this.hover.material.opacity = 0.55 + 0.3 * Math.sin(t * 7); }
  else this.hover.material.opacity = 0;
};
// spec: {x,y,kind,level,branch,face,ok}
W.showRange = function (spec) {
  this.rangeSpec = spec; this.refreshRange();
};
W.hideRange = function () { this.rangeSpec = null; this.refreshRange(); };
W.refreshRange = function (soft) {
  var spec = this.rangeSpec;
  if (!spec && this.sel && this.sel.type === 'tower' && !this.sel.obj.dead) { var tw = this.sel.obj; spec = { x: tw.x, y: tw.y, kind: tw.kind, level: tw.level, branch: tw.branch, face: tw.face, ok: true, top: this.towerTop(tw) }; }
  if (!spec) { this.rangeGrp.visible = false; return; }
  var st = G.towerStats(spec.kind, spec.level || 1, spec.branch || null), grp = this.rangeGrp, top = spec.top != null ? spec.top : (this.game.kind[this.game.idx(spec.x, spec.y)] === K.PLAT ? TOP_PLAT : TOP_ROAD);
  grp.visible = true; grp.position.set(spec.x, top - 0.25, spec.y);
  var ok = spec.ok !== false, tint = ok ? null : '#f0644a';
  var fan = this.rangeFan, edge = this.rangeFanEdge, c1 = this.rangeC1, d1 = this.rangeD1, c2 = this.rangeC2;
  fan.visible = edge.visible = c1.visible = d1.visible = c2.visible = false;
  var set = function (m, col) { m.material.color.set(tint || col).multiplyScalar(1.7); };
  if (spec.kind === 'interceptor') {
    var half = st.arc * Math.PI / 180, psi = spec.face || 0, key = st.range + '|' + st.arc + '|' + psi.toFixed(3);
    if (this.fanKey !== key) {
      this.fanKey = key; fan.geometry.dispose(); fan.geometry = new T.CircleGeometry(st.range, 40, -psi - half, half * 2);
      var pts = [new T.Vector3(0, 0, 0)]; for (var i = 0; i <= 24; i++) { var a = psi - half + (half * 2) * i / 24; pts.push(new T.Vector3(Math.cos(a) * st.range, 0, Math.sin(a) * st.range)); }
      edge.geometry.dispose(); edge.geometry = new T.BufferGeometry().setFromPoints(pts);
    }
    fan.visible = edge.visible = true; set(fan, '#6fb6e6'); edge.material.color.set(tint || '#cfe8f8').multiplyScalar(2);
    fan.position.y = 0.25 + 0.13 - 0.25 + 0.0; edge.position.y = 0.26;
    fan.position.y = 0.27;
  } else if (spec.kind === 'sandbox') {
    c1.visible = d1.visible = true; c1.scale.setScalar(st.detect); d1.scale.setScalar(st.detect); set(c1, '#ffd43b'); set(d1, '#ffd43b'); c2.visible = true; c2.scale.setScalar(st.range); set(c2, '#ffffff'); c1.position.y = d1.position.y = c2.position.y = 0.27;
  } else if (spec.kind === 'repair') {
    c1.visible = d1.visible = true; c1.scale.setScalar(st.range); d1.scale.setScalar(st.range); set(c1, '#38e8c6'); set(d1, '#38e8c6'); c1.position.y = d1.position.y = 0.27;
    c2.visible = true; c2.scale.setScalar(st.skillR); set(c2, '#9dffe9'); c2.material.opacity = 0.3; c2.position.y = 0.27;
  } else if (spec.kind === 'honeypot') {
    c1.visible = d1.visible = true; c1.scale.setScalar(st.lure); d1.scale.setScalar(st.lure); set(c1, '#d684f8'); set(d1, '#d684f8'); c1.position.y = d1.position.y = 0.27;
  } else if (spec.kind === 'firewall' || spec.kind === 'airgap') {
    c1.visible = true; c1.scale.setScalar(0.62); set(c1, spec.kind === 'firewall' ? '#ff8a4c' : '#f8ca56'); c1.position.y = 0.27;
    if (spec.nodeAdj) { c2.visible = true; c2.scale.setScalar(1.45); set(c2, '#ff8a4c'); c2.material.opacity = 0.35; c2.position.y = 0.27; }
  }
  if (c2.visible && spec.kind !== 'repair' && spec.kind !== 'firewall') c2.material.opacity = 0.7;
};
W.showItemRange = function (spec) {
  // spec: {x,y,radius,color,ok} 或 null
  if (!spec) { this.itemGrp.visible = false; return; }
  this.itemGrp.visible = true; this.itemGrp.position.set(spec.x, 0, spec.y);
  var col = spec.ok === false ? '#f0644a' : (spec.color || '#f7c23d');
  this.itemRing.material.color.set(col).multiplyScalar(1.8); this.itemDisc.material.color.set(col).multiplyScalar(1.4);
  var r = spec.radius || 0.55; this.itemRing.scale.setScalar(r); this.itemDisc.scale.setScalar(r);
  this.itemRing.visible = this.itemDisc.visible = true;
};
W.setGhost = function (kind, x, y, ok, face, level) {
  if (!kind) { if (this.ghost) { this.scene.remove(this.ghost.g); this.ghost = null; } this.ghostKind = null; return; }
  if (!this.ghost || this.ghostKind !== kind) {
    if (this.ghost) this.scene.remove(this.ghost.g);
    var m = G.models.tower(kind, 1, null, { onNode: this.game.kind[this.game.idx(x, y)] === K.NODE }), grp = new T.Group(); grp.add(m.group);
    m.group.traverse(function (o) { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = Math.min(o.material.opacity, 0.62); o.material.depthWrite = false; o.castShadow = false; } });
    this.scene.add(grp); this.ghost = { g: grp, m: m }; this.ghostKind = kind;
  }
  var top = this.game.kind[this.game.idx(x, y)] === K.PLAT ? TOP_PLAT : (this.game.kind[this.game.idx(x, y)] === K.NODE ? 0.14 : TOP_ROAD);
  this.ghost.g.position.set(x, top, y); this.ghost.g.visible = true;
  this.ghost.m.update(0, { t: this.time, aimYaw: -(face || 0), faceYaw: -(face || 0), showFace: kind === 'interceptor', phase: 1 });
};
W.flashDeny = function (tiles, msg) {
  var g = this.game, self = this;
  tiles.forEach(function (i) { var x = g.tx(i), y = g.ty(i); fx.ring(x, 0.2, y, 0.1, 1.2, 0.6, '#ff3d4f'); fx.ring(x, 0.2, y, 0.1, 0.7, 0.4, '#ffffff', 0.7); self.floatText(x, y, 1.2, '封死位置', '#f0644a', true); });
  sfx('deny'); this.shake = Math.max(this.shake, 0.08);
};

// ---------- 拾取 ----------
var _ray = new T.Raycaster(), _nd = new T.Vector2(), _pl = new T.Plane(new T.Vector3(0, 1, 0), 0), _hit = new T.Vector3();
W.screenRay = function (cx, cy) {
  var r = gfx.renderer.domElement.getBoundingClientRect();
  _nd.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); _ray.setFromCamera(_nd, gfx.camera); return _ray;
};
W.tileAt = function (cx, cy) {
  var g = this.game, ray = this.screenRay(cx, cy), res = -1;
  _pl.constant = -TOP_PLAT; var ok = ray.ray.intersectPlane(_pl, _hit);
  if (ok) { var x = Math.round(_hit.x), y = Math.round(_hit.z); if (g.inb(x, y) && g.kind[g.idx(x, y)] === K.PLAT) res = g.idx(x, y); }
  if (res < 0) { _pl.constant = -TOP_ROAD; ok = ray.ray.intersectPlane(_pl, _hit); if (ok) { var x2 = Math.round(_hit.x), y2 = Math.round(_hit.z); if (g.inb(x2, y2)) res = g.idx(x2, y2); } }
  return res;
};
W.groundPoint = function (cx, cy, h) {
  var ray = this.screenRay(cx, cy); _pl.constant = -(h || 0.2); var ok = ray.ray.intersectPlane(_pl, _hit); return ok ? { x: _hit.x, y: _hit.z } : null;
};
W.project = function (x, y, z) {
  var v = new T.Vector3(x, z, y).project(gfx.camera), r = gfx.renderer.domElement.getBoundingClientRect();
  return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top, vis: v.z < 1 };
};
W.enemyAt = function (cx, cy) {
  var best = null, bd = 1e9;
  for (var id in this.enemyViews) {
    var v = this.enemyViews[id], e = v.e; if (e.dead) continue; if (e.disguised && !e.revealed && false) continue;
    var h = e.air ? 2.1 : (e.def.boss ? 1.0 : 0.4), p = this.project(v.px, v.py, h);
    var d = Math.hypot(p.x - cx, p.y - cy), lim = e.def.boss ? 70 : 24;
    if (d < lim && d < bd) { bd = d; best = e; }
  }
  return best;
};
W.towerAtScreen = function (cx, cy) {
  var best = null, bd = 1e9;
  for (var id in this.towerViews) { var tw = this.towerViews[id].tw; var p = this.project(tw.x, tw.y, this.towerTop(tw) + 0.4); var d = Math.hypot(p.x - cx, p.y - cy); if (d < 30 && d < bd) { bd = d; best = tw; } }
  return best;
};

// ---------- 叠加层 ----------
W.resizeOverlay = function () {
  var c = this.overlay, dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.floor(window.innerWidth * dpr); c.height = Math.floor(window.innerHeight * dpr); c.style.width = window.innerWidth + 'px'; c.style.height = window.innerHeight + 'px';
  this.dpr = dpr;
};
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
W.bar = function (ctx, x, y, w, h, frac, col, shieldFrac, bg) {
  ctx.fillStyle = bg || 'rgba(8,16,14,0.85)'; rr(ctx, x - 1, y - 1, w + 2, h + 2, 2); ctx.fill();
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(0, w * frac), h);
  if (shieldFrac > 0) { ctx.fillStyle = '#a9d6ea'; ctx.fillRect(x, y - 2, Math.min(w, w * shieldFrac), 2); }
};
W.icon = function (ctx, kind, x, y, col) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.6;
  if (kind === 'lock') { ctx.fillRect(-4, -1, 8, 6); ctx.beginPath(); ctx.arc(0, -1, 3, Math.PI, 0); ctx.stroke(); }
  else if (kind === 'shield') { ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(5, -3); ctx.lineTo(4, 3); ctx.lineTo(0, 6); ctx.lineTo(-4, 3); ctx.lineTo(-5, -3); ctx.closePath(); ctx.fill(); }
  else if (kind === 'eye') { ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.5, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, 7); ctx.fill(); }
  else if (kind === 'slow') { ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.lineTo(-4, 4); ctx.lineTo(4, 4); ctx.stroke(); }
  else if (kind === 'root') { ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(0, -4); ctx.lineTo(5, 4); ctx.stroke(); ctx.fillRect(-5, 4, 10, 2); }
  else if (kind === 'harden') { ctx.fillRect(-4, -4, 8, 8); }
  ctx.restore();
};
W.drawOverlay = function (dt, t) {
  var ctx = this.octx, g = this.game, dpr = this.dpr || 1, self = this;
  var uz = Math.max(0.85, Math.min(2.4, G.uiz || 1)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); ctx.scale(uz, uz);
  var P2 = function (x, y, z) { var p = self.project(x, y, z); p.x /= uz; p.y /= uz; return p; };
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // 阻挡/诱导关系线
  ctx.lineWidth = 1.5;
  g.enemies.forEach(function (e) {
    if (e.dead || e.air) return;
    var v = self.enemyViews[e.id]; if (!v) return;
    if (e.bl) { var a = P2(v.px, v.py, 0.35), b = P2(e.bl.x, e.bl.y, self.towerTop(e.bl) + 0.35); var hot = v.s.atk > 0.2; ctx.strokeStyle = hot ? 'rgba(255,90,90,0.95)' : 'rgba(255,150,80,0.5)'; ctx.setLineDash(hot ? [] : [4, 4]); ctx.lineWidth = hot ? 2.4 : 1.3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
    if (e.lure) { var a2 = P2(v.px, v.py, 0.6), b2 = P2(e.lure.x, e.lure.y, self.towerTop(e.lure) + 0.5); ctx.strokeStyle = 'rgba(214,132,248,0.85)'; ctx.setLineDash([2, 5]); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.setLineDash([]); }
  });
  g.towers.forEach(function (tw) {
    if (tw.kind === 'repair' && tw.healing && tw.healing.length && tw.encT <= 0) tw.healing.forEach(function (o) { if (o.dead) return; var a = P2(tw.x, tw.y, 0.85), b = P2(o.x, o.y, 0.7); ctx.strokeStyle = 'rgba(56,232,198,0.75)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); });
  });
  // 生命条
  g.towers.forEach(function (tw) {
    var p = P2(tw.x, tw.y, self.towerTop(tw) + (tw.kind === 'airgap' ? 0.95 : 1.05)); if (!p.vis) return;
    var w = 44, frac = tw.hp / tw.maxhp, st = G.towerStats(tw.kind, tw.level, tw.branch);
    var col = frac > 0.55 ? '#6fd9a4' : (frac > 0.28 ? '#f0c35a' : '#f0644a');
    self.bar(ctx, p.x - w / 2, p.y, w, 5, frac, col, tw.shield > 0 ? tw.shield / tw.maxhp : 0);
    var ix = p.x - w / 2, iy = p.y - 9;
    if (tw.encT > 0) { self.icon(ctx, 'lock', ix + 5, iy, '#fb53c5'); ix += 14; }
    if (tw.shield > 0) { self.icon(ctx, 'shield', ix + 5, iy, '#a9d6ea'); ix += 14; }
    if (tw.hardenT > 0) { self.icon(ctx, 'harden', ix + 5, iy, '#ffb066'); ix += 14; }
    if (tw.level >= 2) { ctx.font = 'bold 11px ' + gfx.FONT; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'right'; ctx.fillText('Ⅱ' + (tw.branch || ''), p.x + w / 2, iy); ctx.textAlign = 'center'; }
    if (tw.blocked.length && st.block) { ctx.font = 'bold 11px ' + gfx.MONO; ctx.fillStyle = '#ffb066'; ctx.textAlign = 'right'; ctx.fillText(g.blockUsed(tw) + '/' + st.block, p.x + w / 2, p.y + 13); ctx.textAlign = 'center'; }
    if (tw.skillCd > 0 && (tw.kind === 'firewall' || tw.kind === 'honeypot' || tw.kind === 'repair')) { ctx.font = '10px ' + gfx.MONO; ctx.fillStyle = 'rgba(252,232,183,0.8)'; ctx.fillText(Math.ceil(tw.skillCd) + 's', p.x, p.y + 13); }
  });
  g.enemies.forEach(function (e) {
    if (e.dead) return; var v = self.enemyViews[e.id]; if (!v) return;
    var frac = e.hp / e.maxhp, boss = e.def.boss;
    if (frac >= 0.999 && e.shield <= 0 && !boss && !e.rootT && !e.slowT) { if (!(e.bl) ) return; }
    var p = P2(v.px, v.py, e.air ? 2.55 : (boss ? 2.55 : 0.85)); if (!p.vis) return;
    var w = boss ? 120 : 30; var col = e.def.color;
    var bar = boss ? 8 : 4;
    self.bar(ctx, p.x - w / 2, p.y, w, bar, frac, boss ? '#f0644a' : '#ff6b7a', e.shield > 0 ? Math.min(1, e.shield / e.maxhp * (boss ? 1 : 4)) : 0);
    var ix = p.x - 6 * (e.bl ? 1 : 0), iy = p.y - 8;
    var icons = []; if (e.shield > 0) icons.push(['shield', '#a9d6ea']); if (e.slowT > 0) icons.push(['slow', '#9fd6ea']); if (e.rootT > 0) icons.push(['root', '#d684f8']); if ((e.disguised || e.stealth) && e.revealed) icons.push(['eye', '#ffe066']);
    icons.forEach(function (ic, k) { self.icon(ctx, ic[0], p.x - (icons.length - 1) * 7 + k * 14, iy, ic[1]); });
    if (boss) { ctx.font = 'bold 14px ' + gfx.FONT; ctx.fillStyle = '#fff'; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.fillText(e.def.name + (e.phase > 1 || e.type === 'boss3' ? ' · ' + (e.type === 'boss3' ? ['潜伏', '提权', '破坏'][e.phase - 1] : (e.phase === 2 ? '第二阶段' : '')) : ''), p.x, p.y - 22); ctx.shadowBlur = 0; }
  });
  // 节点标签
  g.nodes.forEach(function (i) {
    var x = g.tx(i), y = g.ty(i), p = P2(x, y, 0.95); if (!p.vis) return;
    var thing = g.towerAt[i] || g.isoAt[i];
    if (thing) { var txt = thing.isIso ? '隔离器 ' + Math.ceil(thing.ttl) + 's' : '已隔离'; ctx.font = 'bold 11px ' + gfx.FONT; var tw2 = ctx.measureText(txt).width + 14; ctx.fillStyle = 'rgba(60,8,16,0.85)'; rr(ctx, p.x - tw2 / 2, p.y - 31, tw2, 16, 8); ctx.fill(); ctx.strokeStyle = '#ff3d4f'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#ffd0d6'; ctx.fillText(txt, p.x, p.y - 23); }
    else if (g.nodeCd[i] > 0) { var tx = '重启 ' + Math.ceil(g.nodeCd[i]) + 's'; ctx.font = 'bold 11px ' + gfx.FONT; var w3 = ctx.measureText(tx).width + 14; ctx.fillStyle = 'rgba(50,34,6,0.85)'; rr(ctx, p.x - w3 / 2, p.y - 31, w3, 16, 8); ctx.fill(); ctx.strokeStyle = '#ffb02e'; ctx.stroke(); ctx.fillStyle = '#ffe3a8'; ctx.fillText(tx, p.x, p.y - 23); }
    else if (self.showNodeNames || (self.hoverTile === i)) { var nm = g.nodeName(i); ctx.font = '11px ' + gfx.FONT; var w4 = ctx.measureText(nm).width + 14; ctx.fillStyle = 'rgba(13,27,24,0.85)'; rr(ctx, p.x - w4 / 2, p.y - 31, w4, 16, 8); ctx.fill(); ctx.strokeStyle = '#6dffb0'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#c8ffe2'; ctx.fillText(nm, p.x, p.y - 23); }
  });
  // 危害文字
  for (var hid in this.hazViews) {
    var hv = this.hazViews[hid], h = hv.h, ti = h.tiles[0], hp = P2(g.tx(ti), g.ty(ti), 0.9); if (!hp.vis) continue;
    var left = h.active ? Math.max(0, h.dur - h.t) : Math.max(0, h.warn - h.t);
    var lab = hv.kind === 'surge' ? '洪峰冲击 ' : (hv.kind === 'blackhole' ? (h.active ? '路由黑洞 ' : '预警·路由黑洞 ') : (h.active ? '运维环锁死 ' : '预警·锁死运维环 '));
    var txt = lab + (left).toFixed(1) + 's'; ctx.font = 'bold 12px ' + gfx.FONT; var tw3 = ctx.measureText(txt).width + 16;
    var c = hv.kind === 'blackhole' ? '#c682f8' : '#f0644a'; ctx.fillStyle = 'rgba(16,7,23,0.88)'; rr(ctx, hp.x - tw3 / 2, hp.y - 36, tw3, 20, 10); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(txt, hp.x, hp.y - 26);
  }
  // 出入口标记在三维中；预览标签
  if (this.preview && this.previewLabels) { }
  // 出口处的路线徽标：哪些入口通往这里
  var ends = {};
  g.entrances.forEach(function (en) { if (en.exit) (ends[en.exit] = ends[en.exit] || []).push(en); });
  for (var xid in ends) {
    var ex = g.exits[xid], bp = P2(ex.x, ex.y, 0.5); if (!bp.vis) continue;
    ends[xid].forEach(function (en, k) { var bx = bp.x - (ends[xid].length - 1) * 11 + k * 22, by = bp.y + 26; ctx.fillStyle = en.color; rr(ctx, bx - 9, by - 9, 18, 18, 4); ctx.fill(); ctx.fillStyle = '#0b1714'; ctx.font = 'bold 13px ' + gfx.MONO; ctx.fillText(en.id, bx, by + 1); });
    ctx.font = '10px ' + gfx.FONT; ctx.fillStyle = 'rgba(241,234,214,.85)'; ctx.fillText('来路', bp.x, bp.y + 44);
  }
  // 浮动数字
  for (var fi = this.floats.length - 1; fi >= 0; fi--) {
    var f = this.floats[fi]; f.t += dt; var u = f.t / f.dur; if (u >= 1) { this.floats.splice(fi, 1); continue; }
    var fp = this.project(f.x, f.y, f.z + u * 0.7); if (!fp.vis) continue;
    ctx.globalAlpha = 1 - u * u; ctx.font = (f.big ? 'bold 17px ' : 'bold 13px ') + gfx.FONT; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(f.text, fp.x, fp.y); ctx.fillStyle = f.color; ctx.fillText(f.text, fp.x, fp.y); ctx.globalAlpha = 1;
  }
  // 预览路线说明标签（沿预览路线中点）
  if (this.preview) {
    this.game.entrances.forEach(function (en) {
      var r = self.preview.routes[en.id]; if (!r || !r.changed || !r.reach) return;
      var mid = r.tiles[Math.floor(r.tiles.length * 0.35)], p = P2(g.tx(mid), g.ty(mid), 0.7); if (!p.vis) return;
      var txt = en.id + ' 改道 ' + (r.deltaCost >= 0 ? '+' : '') + r.deltaCost.toFixed(1); ctx.font = 'bold 12px ' + gfx.FONT; var w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(13,21,19,0.9)'; rr(ctx, p.x - w / 2, p.y - 10, w, 20, 10); ctx.fill(); ctx.strokeStyle = en.color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(txt, p.x, p.y);
    });
  }
};
W.dispose = function () { this.game.listeners.length = 0; gfx.disposeScene(this.scene); };
})(window.G = window.G || {});
