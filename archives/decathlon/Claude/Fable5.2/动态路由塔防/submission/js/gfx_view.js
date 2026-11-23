/* 网络安全攻防战 — 战场视图：把模拟状态同步为模型、动作、特效与信息层 */
(function (root) {
  'use strict';
  const TD = root.TD, THREE = root.THREE, GX = TD.GX, G = GX.G, mk = GX.mk;
  const V3 = THREE.Vector3, PI = Math.PI, C = (h) => new THREE.Color(h);
  const K = { cyan: C(0x45dcff), white: C(0xffffff), red: C(0xff3050), orange: C(0xff8a3a), amber: C(0xffb53a), green: C(0x55ff9a), pink: C(0xff4fa2), violet: C(0xc23cff), gold: C(0xffd84a), blue: C(0x7fb4ff), dark: C(0x30102a), grey: C(0x9aa8b8) };
  const FLY_H = 1.75;

  class BattleView {
    constructor(stage, sim) {
      this.stage = stage; this.sim = sim;
      this.map = new GX.MapScene(stage, sim);
      this.fx = new GX.FX(stage, this.map);
      this.units = new THREE.Group(); stage.scene.add(this.units);
      this.tv = new Map(); this.ev = new Map(); this.sv = new Map(); this.iso = {}; this.zoneObjs = new Map(); this.warnObjs = new Map();
      this.frags = []; this.fbeams = []; this.fbi = 0;
      this.overlay = { cells: [], circles: [], ghost: null, sealed: null, sel: null, hover: -1 };
      this.ghost = null; this.ghostKey = '';
      this.simT = 0; this.rng = TD.makeRng(99); this._v = new V3(); this._v2 = new V3();
      this.labels = [];
      for (const k in this.map.nodeViews) this.labels.push([this.map.nodeViews[k].label, 1]);
      this.map.root.traverse(o => { if (o.isSprite && o.userData.aspect && !this.labels.some(l => l[0] === o)) this.labels.push([o, 1]); });
      for (const l of this.labels) l[1] = l[0].scale.y;
      this.fx.setRoutes(sim.routes, null);
      this._h = (n, d) => this.onEvent(n, d); sim.on('*', this._h);
    }
    dispose() {
      this.sim.off('*', this._h); this.stage.scene.remove(this.units); this.fx.dispose(); this.map.dispose();
      if (this.ghost) this.stage.scene.remove(this.ghost.g);
    }
    wx(x) { return this.map.wx(x); } wz(y) { return this.map.wz(y); }
    cellY(ci) { return this.map.top(this.sim.grid.cells[ci]); }
    groundY(x, y) { const c = this.sim.cellAt(Math.round(x), Math.round(y)); return c && c.type === 'node' ? 0.09 : 0.0; }
    towerTop(t) { return this.cellY(t.ci) + (t.type === 'repair' ? 0.95 : t.type === 'interceptor' ? 0.42 : 0.5); }
    enemyPos(e, out) {
      const v = this.ev.get(e.id);
      if (v) return out.copy(v.g.position).setY(v.g.position.y + v.model.h * 0.5);
      return out.set(this.wx(e.x), e.fly ? FLY_H : 0.3, this.wz(e.y));
    }

    // ---------- 塔视图 ----------
    _makeTowerView(t) {
      const model = GX.makeTower(t.type, t.level, t.branch);
      const g = new THREE.Group(); g.add(model.g);
      g.position.set(this.wx(t.x), this.cellY(t.ci), this.wz(t.y));
      const v = { t, model, g, key: t.level + (t.branch || ''), yaw: 0, dmgAcc: 0, dmgT: 0, seed: (t.id * 0.137) % 1, sh: null, chains: null, encK: 0, shK: 0 };
      // 职业色底环：远看也能分辨塔的职业
      const rk = TD.TOWERS[t.type].roleKey; this._roleMat = this._roleMat || {};
      const rm = this._roleMat[rk] || (this._roleMat[rk] = GX.glow(new THREE.Color(TD.ROLE_COLORS[rk]).getHex(), 1.7));
      const ring = mk(G.tor(0.43, 0.018, 6, 28), rm, [0, 0.03, 0], [PI / 2, 0, 0]); ring.castShadow = false; g.add(ring);
      v.baseYaw = t.type === 'interceptor' ? Math.atan2(TD.DIRS[t.facing][0], TD.DIRS[t.facing][1]) : this._upstreamYaw(t);
      v.yaw = v.baseYaw; model.g.rotation.y = v.yaw;
      this.units.add(g); this.tv.set(t.id, v); return v;
    }
    _upstreamYaw(t) {
      if (t.type !== 'firewall') return 0;
      const s = this.sim, c = s.grid.cells[t.ci]; let best = -1, bd = -1;
      for (let d = 0; d < 4; d++) { const v = c.nb[d]; if (v < 0 || !s.grid.cells[v].walk) continue; const dd = isFinite(s.field.dist[v]) ? s.field.dist[v] : -5; if (dd > bd) { bd = dd; best = d; } }
      return best < 0 ? 0 : Math.atan2(TD.DIRS[best][0], TD.DIRS[best][1]);
    }
    _syncTowers(dt) {
      const sim = this.sim, fx = this.fx;
      for (const t of sim.towers) {
        let v = this.tv.get(t.id); if (!v) v = this._makeTowerView(t);
        if (v.key !== t.level + (t.branch || '')) { v.g.remove(v.model.g); v.model = GX.makeTower(t.type, t.level, t.branch); v.g.add(v.model.g); v.key = t.level + (t.branch || ''); }
        const S = t.S, m = v.model;
        // 防火墙朝向被阻挡的敌人
        if (t.type === 'firewall') { if (t.blocked.length) { const e = sim.eById.get(t.blocked[0]); if (e) v.baseYaw = Math.atan2(e.x - t.x, e.y - t.y); } v.yaw = TD.angLerp(v.yaw, v.baseYaw, Math.min(1, dt * 6)); }
        m.g.rotation.y = m.noYaw ? 0 : v.yaw;
        const dep = sim.time - t.born;
        const a = v.a || (v.a = {}); a.t = sim.time + v.seed * 10; a.dt = dt; a.fire = sim.time - t.fireT; a.hit = sim.time - t.lastHitT; a.deploy = dep; a.skill = t.skillT; a.seed = v.seed; a.enc = t.encT > 0;
        a.hasAim = t.hasAim && !a.enc; a.aim = TD.angDiff(v.yaw, Math.atan2(Math.cos(t.aim), Math.sin(t.aim))); a.cdK = S.rate ? 1 - t.cd / S.rate : 0; a.heal = t.healIds.length > 0; a.lureR = S.lure; a.range = S.range; a.pitch = 0;
        if (a.hasAim && t.target) { const e = sim.eById.get(t.target); if (e) { const dd = Math.hypot(e.x - t.x, e.y - t.y) || 1; a.pitch = Math.atan2((e.fly ? FLY_H : 0.25) - (v.g.position.y + 0.4), dd); if (!S.pierce) this._fbeam(v.g.position.x, v.g.position.y + 0.42, v.g.position.z, this.wx(e.x), e.fly ? FLY_H : 0.3, this.wz(e.y), K.cyan, 0.008, 0.25); } }
        if (a.enc) { a.t = v.frozenT || (v.frozenT = a.t); a.dt = 0; } else v.frozenT = 0;
        m.tick(a);
        // 部署展开
        const ds = dep < 0.45 ? TD.easeOut(dep / 0.45) : 1; m.g.scale.set(0.6 + 0.4 * ds, ds < 1 ? Math.max(0.05, ds * (1 + 0.25 * Math.sin(ds * PI))) : 1, 0.6 + 0.4 * ds);
        const up = t.upT != null ? sim.time - t.upT : 9; if (up < 0.5) m.g.scale.multiplyScalar(1 + 0.18 * Math.sin(up / 0.5 * PI));
        // 受击闪光与加密变色
        const hk = a.hit < 0.16 ? 1 - a.hit / 0.16 : 0; v.encK += ((a.enc ? 1 : 0) - v.encK) * Math.min(1, dt * 8);
        GX.flashMats(m.mats, hk * 0.9, t.lastHitKind === 'ranged' ? K.red : K.orange, K.dark, v.encK);
        // 护盾
        if (t.shield > 0) { if (!v.sh) { v.sh = new THREE.Mesh(G.sph(0.54, 20, 14), GX.M.tShield.clone()); v.sh.position.y = 0.42; v.sh.renderOrder = 9; v.shw = new THREE.Mesh(G.ico(0.55, 1), new THREE.MeshBasicMaterial({ color: 0x9ff0ff, wireframe: true, transparent: true, opacity: 0.2, toneMapped: false, depthWrite: false })); v.shw.position.y = 0.42; v.g.add(v.sh, v.shw); } v.shK += (1 - v.shK) * Math.min(1, dt * 10); }
        else v.shK += (0 - v.shK) * Math.min(1, dt * 10);
        if (v.sh) { const vis = v.shK > 0.02; v.sh.visible = v.shw.visible = vis; if (vis) { v.sh.scale.setScalar(v.shK * (1 + 0.03 * Math.sin(sim.time * 6))); v.shw.scale.setScalar(v.shK); v.shw.rotation.y = sim.time * 0.8; v.sh.material.opacity = 0.05 + 0.07 * (t.shield / (t.shieldMax || 1)) + (a.hit < 0.15 ? 0.25 : 0); } }
        // 加密锁链
        if (v.encK > 0.03) { if (!v.chains) { v.chains = new THREE.Group(); for (let i = 0; i < 2; i++) { const r = mk(G.tor(0.5, 0.022, 5, 20), GX.M.chain, null, [PI / 2 + (i ? 0.7 : -0.7), 0, 0]); r.castShadow = false; v.chains.add(r); } v.chains.position.y = 0.42; v.g.add(v.chains); } v.chains.visible = true; v.chains.scale.setScalar(v.encK); v.chains.rotation.y = sim.time * 1.4; }
        else if (v.chains) v.chains.visible = false;
        // 治疗光束
        if (t.type === 'repair') for (const id of t.healIds) { const o = sim.tById.get(id), ov = this.tv.get(id); if (!o || !ov) continue; const y1 = v.g.position.y + 0.92, y2 = ov.g.position.y + 0.42; this._fbeam(v.g.position.x, y1, v.g.position.z, ov.g.position.x, y2, ov.g.position.z, K.green, 0.022, 0.6); if (this.rng() < dt * 22) { const u = this.rng(); fx.spawn(TD.lerp(v.g.position.x, ov.g.position.x, u), TD.lerp(y1, y2, u), TD.lerp(v.g.position.z, ov.g.position.z, u), 0, 0.4, 0, 0.5, 0.12, K.green, -0.3); } if (this.rng() < dt * 10) fx.spawn(ov.g.position.x + (this.rng() - 0.5) * 0.5, y2 - 0.2, ov.g.position.z + (this.rng() - 0.5) * 0.5, 0, 0.9, 0, 0.6, 0.16, K.green, -0.2); }
        // 阻挡关系连线
        if (t.blocker) for (const id of t.blocked) { const e = sim.eById.get(id); if (!e) continue; const ep = this.enemyPos(e, this._v); this._fbeam(v.g.position.x, v.g.position.y + 0.3, v.g.position.z, ep.x, ep.y, ep.z, K.white, 0.012, 0.5); }
        // 伤害飘字（合并）
        if (v.dmgAcc > 0) { v.dmgT -= dt; if (v.dmgT <= 0) { fx.text(v.g.position.x, v.g.position.y + 1.0, v.g.position.z, '-' + Math.round(v.dmgAcc), { color: '#ff7a5a', size: 0.5, life: 0.8, rise: 0.5 }); v.dmgAcc = 0; } }
      }
      for (const [id, v] of this.tv) if (!this.sim.tById.has(id)) { this.units.remove(v.g); this.tv.delete(id); }
    }

    // ---------- 敌人视图 ----------
    _makeEnemyView(e) {
      const model = GX.makeEnemy(e.type); const g = new THREE.Group(); g.add(model.g);
      const v = { e, model, g, yaw: Math.atan2(e.dirX, e.dirY), roll: 0, revealK: e.hidden ? 0 : 1, a: {}, bub: null, shK: 0, lx: e.x, ly: e.y, opK: 1 };
      g.rotation.y = v.yaw; if (e.boss) model.g.scale.setScalar(1.15);
      this._placeEnemy(v, e); this.units.add(g); this.ev.set(e.id, v); return v;
    }
    _placeEnemy(v, e) {
      const lat = e.fly ? 0 : e.lat * (e.boss ? 0 : 1);
      v.g.position.set(this.wx(e.x) - e.dirY * lat, e.fly ? FLY_H : this.groundY(e.x, e.y), this.wz(e.y) + e.dirX * lat);
    }
    _syncEnemies(dt) {
      const sim = this.sim, fx = this.fx;
      for (const e of sim.enemies) {
        if (e.dead) continue;
        let v = this.ev.get(e.id); if (!v) v = this._makeEnemyView(e);
        const m = v.model, a = v.a;
        this._placeEnemy(v, e);
        const ty = Math.atan2(e.dirX, e.dirY), pv = v.yaw; v.yaw = TD.angLerp(v.yaw, ty, Math.min(1, dt * (e.boss ? 4 : 9)));
        const rate = dt > 0 ? TD.angDiff(pv, v.yaw) / dt : 0; v.roll += ((e.fly ? -rate * 0.25 : -rate * 0.06) - v.roll) * Math.min(1, dt * 8);
        v.g.rotation.y = v.yaw; m.g.rotation.z = TD.clamp(v.roll, -0.6, 0.6);
        const moved = Math.hypot(e.x - v.lx, e.y - v.ly); v.lx = e.x; v.ly = e.y;
        a.t = sim.time + e.seed * 10; a.dt = dt; a.sp = dt > 0 ? Math.min(2.5, moved / dt) : 0; a.move = a.sp > 0.05; a.atk = sim.time - e.atkT; a.hit = sim.time - e.hitT; a.state = e.state; a.seed = e.seed; a.phase = e.phase; a.cast = e.castT != null ? sim.time - e.castT : 99; a.phaseAge = e.phaseT != null ? sim.time - e.phaseT : 99; a.stormAge = e.stormT != null ? sim.time - e.stormT : null;
        v.revealK += ((e.hidden ? 0 : 1) - v.revealK) * Math.min(1, dt * 5); a.revealK = v.revealK;
        if (e.rootT > 0 || e.stunT > 0) { a.dt = 0; a.t = v.fz || (v.fz = a.t); } else v.fz = 0;
        m.tick(a);
        // 出场、受击
        const age = sim.time - e.born, sc = age < 0.4 ? 0.25 + 0.75 * TD.easeOut(age / 0.4) : 1, hk = a.hit < 0.12 ? 1 - a.hit / 0.12 : 0;
        const bs = e.boss ? 1.15 : 1; m.g.scale.set(bs * sc * (1 + hk * 0.1), bs * sc * (1 - hk * 0.08), bs * sc * (1 + hk * 0.1));
        let tint = null, tk = 0; if (e.rootT > 0) { tint = K.amber; tk = 0.5; } else if (e.stunT > 0) { tint = K.gold; tk = 0.4; } else if (e.slowT > 0) { tint = K.blue; tk = 0.45; } else if (e.markT > 0) { tint = K.orange; tk = 0.3; }
        GX.flashMats(m.mats, hk * 0.8, K.white, tint, tk);
        // 蛰影潜伏：半透明
        if (e.type === 'boss3') { const want = e.phase === 1 && e.revealT <= 0 ? 0.22 : 1; v.opK += (want - v.opK) * Math.min(1, dt * 6); for (const mm of m.mats) { mm.transparent = v.opK < 0.98; mm.opacity = v.opK; mm.depthWrite = v.opK > 0.6; } }
        // 敌方护盾
        if (e.shield > 0) { if (!v.bub) { v.bub = new THREE.Mesh(G.sph(1, 18, 12), GX.M.eShield.clone()); v.bub.renderOrder = 9; v.bubw = new THREE.Mesh(G.ico(1.02, 1), new THREE.MeshBasicMaterial({ color: 0xff8ae0, wireframe: true, transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false })); v.g.add(v.bub, v.bubw); } v.shK += (1 - v.shK) * Math.min(1, dt * 10); } else v.shK += (0 - v.shK) * Math.min(1, dt * 12);
        if (v.bub) { const vis = v.shK > 0.03; v.bub.visible = v.bubw.visible = vis; if (vis) { const r = (e.d.r + 0.12) * v.shK; v.bub.scale.setScalar(r); v.bubw.scale.setScalar(r); v.bub.position.y = v.bubw.position.y = m.h * 0.5; v.bubw.rotation.y = sim.time * 1.5; v.bub.material.opacity = 0.09 + (sim.time - (e.shieldHitT || -9) < 0.12 ? 0.3 : 0); } }
        // 飞行单位：在地面投下落点环与引线，区分高度
        if (e.fly) { const gx = v.g.position.x, gz = v.g.position.z; fx.circle(gx, gz, 0.17, K.violet, 0.05, 0.75); this._fbeam(gx, 0.05, gz, gx, FLY_H - 0.25, gz, K.violet, 0.006, 0.3); }
        // 连线：洪泛团冲击目标、被诱骗
        if (e.detour) { const ep = this.enemyPos(e, this._v); if (e.detour.kind === 'smash') { const c = sim.grid.cells[e.detour.node]; this._fbeam(ep.x, ep.y, ep.z, this.wx(c.x), 0.45, this.wz(c.y), K.red, 0.014, 0.55); } else { const t = sim.tById.get(e.detour.tower); if (t) this._fbeam(ep.x, ep.y, ep.z, this.wx(t.x), 0.5, this.wz(t.y), K.amber, 0.012, 0.6); } }
        if (e.slowT > 0 && this.rng() < dt * 8) fx.spawn(v.g.position.x + (this.rng() - 0.5) * 0.3, v.g.position.y + 0.1, v.g.position.z + (this.rng() - 0.5) * 0.3, 0, 0.3, 0, 0.5, 0.09, K.blue, 0);
        if (e.boss && this.rng() < dt * 14) fx.spawn(v.g.position.x + (this.rng() - 0.5) * 0.9, v.g.position.y + this.rng() * 1.6, v.g.position.z + (this.rng() - 0.5) * 0.9, 0, 0.5, 0, 0.8, 0.14, e.type === 'boss2' ? K.violet : K.red, -0.2);
      }
    }

    // ---------- 碎裂退场 ----------
    shatter(group, o) {
      o = o || {}; const list = []; group.updateMatrixWorld(true);
      group.traverse(ch => { if (ch.isMesh && ch.visible && ch.geometry && !ch.material.wireframe && ch.material.opacity > 0.3 && !(ch.material.blending === THREE.AdditiveBlending)) list.push(ch); });
      const step = Math.max(1, Math.ceil(list.length / (o.max || 26))), c = new V3(); group.getWorldPosition(c); c.y += o.cy || 0.3;
      for (let i = 0; i < list.length; i += step) {
        const src = list[i], f = new THREE.Mesh(src.geometry, src.material); src.matrixWorld.decompose(f.position, f.quaternion, f.scale); f.castShadow = true;
        const d = f.position.clone().sub(c); d.y = Math.abs(d.y) * 0.5; if (d.lengthSq() < 0.0004) d.set(this.rng() - 0.5, 0.3, this.rng() - 0.5); d.normalize();
        const sp = (o.speed || 2.4) * (0.5 + this.rng());
        this.fx.root.add(f); this.frags.push({ f, vx: d.x * sp + (o.vx || 0), vy: 1.4 + this.rng() * 2.2 * (o.up || 1), vz: d.z * sp + (o.vz || 0), ax: (this.rng() - 0.5) * 12, az: (this.rng() - 0.5) * 12, t: 0, life: (o.life || 0.85) * (0.7 + this.rng() * 0.5), s: f.scale.clone(), floor: o.floor == null ? 0 : o.floor });
      }
    }
    _updFrags(dt) {
      for (let i = this.frags.length - 1; i >= 0; i--) {
        const p = this.frags[i]; p.t += dt; const u = p.t / p.life;
        if (u >= 1) { this.fx.root.remove(p.f); this.frags.splice(i, 1); continue; }
        p.vy -= 7.5 * dt; p.f.position.x += p.vx * dt; p.f.position.y += p.vy * dt; p.f.position.z += p.vz * dt;
        if (p.f.position.y < p.floor + 0.04 && p.vy < 0) { p.f.position.y = p.floor + 0.04; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
        p.f.rotation.x += p.ax * dt; p.f.rotation.z += p.az * dt;
        const k = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45; p.f.scale.copy(p.s).multiplyScalar(Math.max(0.001, k));
      }
    }

    // ---------- 每帧光束（连线类）----------
    _fbeam(x1, y1, z1, x2, y2, z2, c, w, a) {
      let b = this.fbeams[this.fbi];
      if (!b) { b = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), GX.basicAdd(0xffffff, 1)); b.renderOrder = 11; this.fx.root.add(b); this.fbeams.push(b); }
      this.fbi++; b.visible = true; b.material.color.copy(c); b.material.opacity = a;
      this._v2.set(x2 - x1, y2 - y1, z2 - z1); const len = this._v2.length(); if (len < 1e-4) { b.visible = false; return; }
      b.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); b.quaternion.setFromUnitVectors(this.fx._up, this._v2.normalize()); b.scale.set(w, len, w);
    }

    // ---------- 弹道 ----------
    _syncShots(dt) {
      const sim = this.sim, fx = this.fx;
      for (const s of sim.shots) {
        let v = this.sv.get(s.id);
        if (!v) {
          let mesh;
          if (s.kind === 'ransom') { mesh = new THREE.Group(); mesh.add(mk(G.oct(0.09), GX.M.eGlow)); const r = mk(G.tor(0.12, 0.014, 5, 14), GX.M.eGlow); mesh.add(r); }
          else { mesh = mk(G.sph(0.05, 8, 6), s.kind === 'sup' ? GX.M.pktGlow : GX.M.tGlow, null, null, [0.7, 0.7, s.kind === 'sup' ? 3 : 5]); }
          mesh.traverse(o => { o.castShadow = false; });
          const src = s.tk === 'e' ? this.tv.get(s.src) : this.ev.get(s.src);
          const h0 = s.tk === 'e' ? (src ? src.g.position.y + 0.42 : 0.8) : 0.45;
          v = { mesh, h0, total: Math.hypot(s.tx - s.sx, s.ty - s.sy) || 1 }; fx.root.add(mesh); this.sv.set(s.id, v);
        }
        let h1 = 0.3; if (s.tk === 'e') { const e = sim.eById.get(s.target); h1 = e && e.fly ? FLY_H : (s.fly ? FLY_H : 0.3); } else { const t = sim.tById.get(s.target); h1 = t ? this.cellY(t.ci) + 0.4 : 0.5; }
        const rem = Math.hypot(s.tx - s.x, s.ty - s.y), u = TD.clamp(1 - rem / v.total, 0, 1);
        const x = this.wx(s.x), z = this.wz(s.y), y = TD.lerp(v.h0, h1, u) + (s.kind === 'ransom' ? Math.sin(u * PI) * 0.5 : 0);
        const px = v.mesh.position.x, py = v.mesh.position.y, pz = v.mesh.position.z;
        v.mesh.position.set(x, y, z); v.h1 = h1;
        if (s.kind === 'ransom') { v.mesh.rotation.x += dt * 9; v.mesh.rotation.y += dt * 7; if (this.rng() < dt * 60) fx.spawn(x, y, z, 0, 0, 0, 0.35, 0.16, K.red, 0, 0); }
        else { if (px || pz) v.mesh.lookAt(x * 2 - px, y * 2 - py, z * 2 - pz); if (this.rng() < dt * 50) fx.spawn(x, y, z, 0, 0, 0, 0.18, 0.1, s.kind === 'sup' ? K.blue : K.cyan, 0, 0); }
      }
      for (const [id, v] of this.sv) if (!sim.shots.some(s => s.id === id)) { fx.root.remove(v.mesh); this.sv.delete(id); }
    }

    // ---------- 区域、预警、隔离器 ----------
    _syncZones(dt) {
      const sim = this.sim, fx = this.fx, cl = fx.cells;
      for (const z of sim.zones) {
        const fade = Math.min(1, z.t / 0.6);
        if (z.kind === 'downgrade') for (const ci of z.cells) { const c = sim.grid.cells[ci]; cl.add(this.wx(c.x), 0.022, this.wz(c.y), 1, K.amber, 0.9 * fade); }
        else {
          let o = this.zoneObjs.get(z.id);
          if (!o) {
            o = { g: new THREE.Group(), items: [] };
            for (const ci of z.cells) {
              const c = sim.grid.cells[ci], it = new THREE.Group(); it.position.set(this.wx(c.x), 0, this.wz(c.y));
              if (z.kind === 'blackhole') { it.add(new THREE.Mesh(G.sph(0.3, 20, 14), new THREE.MeshBasicMaterial({ color: 0x020005 }))); const a = new THREE.Mesh(G.tor(0.42, 0.05, 8, 40), GX.basicAdd(0xc23cff, 0.9)); a.rotation.x = PI / 2 - 0.35; it.add(a); const b = new THREE.Mesh(G.tor(0.56, 0.02, 6, 40), GX.basicAdd(0xff5fd0, 0.7)); b.rotation.x = PI / 2 + 0.3; it.add(b); it.children.forEach(ch => { ch.position.y = 0.5; }); }
              else { const m = new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }); it.add(new THREE.Mesh(G.box(0.92, 0.7, 0.92), m)); const w = new THREE.LineSegments(new THREE.EdgesGeometry(G.box(0.92, 0.7, 0.92)), new THREE.LineBasicMaterial({ color: 0xff5060, toneMapped: false })); it.add(w); it.children.forEach(ch => { ch.position.y = 0.38; }); for (const s of [-1, 1]) { const x = mk(G.box(1.2, 0.05, 0.05), GX.M.eGlow, [0, 0.74, 0], [0, s * PI / 4, 0]); x.castShadow = false; it.add(x); } }
              o.g.add(it); o.items.push(it);
            }
            fx.root.add(o.g); this.zoneObjs.set(z.id, o);
          }
          const k = Math.min(1, (z.dur - z.t) / 0.4) * fade;
          o.items.forEach((it, i) => { it.scale.setScalar(Math.max(0.01, k)); if (z.kind === 'blackhole') { it.children[1].rotation.z = sim.time * 3; it.children[2].rotation.z = -sim.time * 2; if (this.rng() < dt * 30) { const a = this.rng() * 6.28, r = 0.9; fx.spawn(it.position.x + Math.cos(a) * r, 0.5 + (this.rng() - 0.5) * 0.3, it.position.z + Math.sin(a) * r, -Math.cos(a) * 1.6, 0, -Math.sin(a) * 1.6, 0.5, 0.1, K.violet, 0, 0); } } });
          for (const ci of z.cells) { const c = sim.grid.cells[ci]; cl.add(this.wx(c.x), 0.024, this.wz(c.y), 2, z.kind === 'blackhole' ? K.violet : K.red, 0.8 * fade); }
        }
      }
      for (const [id, o] of this.zoneObjs) if (!sim.zones.some(z => z.id === id)) { fx.root.remove(o.g); this.zoneObjs.delete(id); }
      // Boss 预警
      for (const w of sim.warnings) {
        const boss = sim.eById.get(w.boss), u = w.t / w.dur, col = w.kind === 'spoof' ? K.violet : K.red;
        for (const ci of w.cells) {
          const c = sim.grid.cells[ci], x = this.wx(c.x), z = this.wz(c.y);
          cl.add(x, 0.03 + (c.type === 'node' ? 0.1 : 0), z, 2, col, 1);
          this._fbeam(x, 0, z, x, 2.4, z, col, 0.022 + 0.012 * Math.sin(sim.time * 20), 0.3);
          fx.circle(x, z, 0.75 - 0.45 * u, col, 0.09, 1);
          if (boss) { const bp = this.enemyPos(boss, this._v); this._fbeam(bp.x, bp.y + 0.3, bp.z, x, 0.5, z, col, 0.012, 0.3 + 0.2 * Math.sin(sim.time * 16)); }
        }
        let o = this.warnObjs.get(w.id);
        if (!o) { const c = sim.grid.cells[w.cells[Math.floor(w.cells.length / 2)]]; const txt = w.kind === 'surge' ? '洪峰预警' : w.kind === 'spoof' ? '伪路由预警' : '锁死预警'; o = GX.textSprite('⚠ ' + txt, { size: 36, color: '#fff', bg: w.kind === 'spoof' ? 'rgba(70,16,110,0.92)' : 'rgba(120,10,24,0.92)', border: '#ffffff', scale: 0.0105, depthTest: false }); o.position.set(this.wx(c.x), 1.7, this.wz(c.y)); o.renderOrder = 47; fx.root.add(o); this.warnObjs.set(w.id, o); this.labels.push([o, o.scale.y]); }
        o.material.opacity = 0.75 + 0.25 * Math.sin(sim.time * 14);
      }
      for (const [id, o] of this.warnObjs) if (!sim.warnings.some(w => w.id === id)) { fx.root.remove(o); this.labels = this.labels.filter(l => l[0] !== o); o.material.map.dispose(); this.warnObjs.delete(id); }
      // 应急隔离器
      for (const k in sim.nodes) {
        const ns = sim.nodes[k]; let o = this.iso[k];
        if (ns.iso) {
          if (!o) { o = this.iso[k] = new THREE.Group(); const c = sim.grid.cells[k]; o.position.set(this.wx(c.x), 0.1, this.wz(c.y)); for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; const cl2 = new THREE.Group(); cl2.rotation.y = -a; cl2.add(mk(G.box(0.07, 0.5, 0.07), GX.M.tSteel, [0.4, 0.25, 0])); cl2.add(mk(G.box(0.22, 0.06, 0.07), GX.M.tAmber, [0.31, 0.5, 0])); cl2.add(mk(G.box(0.1, 0.05, 0.12), GX.M.tDark, [0.4, 0.02, 0])); o.add(cl2); } const r = mk(G.tor(0.3, 0.03, 6, 24), GX.M.tAmber, [0, 0.62, 0], [PI / 2, 0, 0]); r.castShadow = false; o.add(r); this.units.add(o); o.userData.born = sim.time; }
          const age = sim.time - o.userData.born; o.scale.setScalar(Math.min(1, TD.easeOut(age / 0.35))); o.children[4].rotation.z = sim.time * 2; o.children[4].position.y = 0.62 + 0.04 * Math.sin(sim.time * 4);
        } else if (o) { this.units.remove(o); delete this.iso[k]; }
      }
    }

    // ---------- 血条与状态 ----------
    _syncBars() {
      const sim = this.sim, B = this.fx.bars; B.begin();
      const ks = TD.clamp(this.stage.cam.dist / 34, 0.55, 1.25);
      const sel = this.overlay.sel;
      for (const t of sim.towers) {
        const v = this.tv.get(t.id); if (!v) continue;
        const x = v.g.position.x, y = v.g.position.y + (t.type === 'repair' ? 1.32 : t.type === 'firewall' && t.level >= 2 ? 1.2 : 1.05), z = v.g.position.z, f = Math.max(0, t.hp / t.maxHp);
        const r = f > 0.5 ? (1 - f) * 2 * 0.9 + 0.2 : 1, g = f > 0.5 ? 0.95 : 0.25 + f * 1.4;
        B.bar(x, y, z, 0.74 * ks, 0.105 * ks, f, t.shield > 0 ? t.shield / (t.shieldMax || 1) : 0, r, g, 0.35, 1);
        const ic = [];
        if (t.encT > 0) ic.push(0); if (t.shield > 0) ic.push(1); if (t.shieldLock > 0) ic.push(8); if (t.onNode) ic.push(11);
        const sk = TD.towerSkill(t.type, t.level, t.branch); if (sk && t.skillCd <= 0 && t.encT <= 0) ic.push(9);
        ic.forEach((k, i) => B.icon(x, y + 0.2 * ks, z, 0.22 * ks, k, (i - (ic.length - 1) / 2) * 0.24 * ks, 1));
      }
      for (const e of sim.enemies) {
        if (e.dead) continue; const v = this.ev.get(e.id); if (!v) continue;
        const x = v.g.position.x, y = v.g.position.y + v.model.h + 0.16, z = v.g.position.z, ic = [];
        if (e.hidden) { B.icon(x, y, z, 0.2 * ks, 7, 0, 0.9); continue; }
        if (e.type === 'boss3' && e.phase === 1 && e.revealT <= 0) { B.icon(x, y, z, 0.3 * ks, 7, 0, 0.9); continue; }
        const w = (e.boss ? 1.9 : e.type === 'flood' ? 0.74 : 0.56) * ks, h = (e.boss ? 0.16 : 0.09) * ks;
        B.bar(x, y, z, w, h, Math.max(0, e.hp / e.maxHp), e.shield > 0 ? e.shield / (e.shieldMax || 1) : 0, 1, 0.22, 0.32, 1);
        if (e.revealAt != null && sim.time - e.revealAt < 2.5 || (e.type === 'boss3' && e.phase === 1)) ic.push(2);
        if (e.slowT > 0) ic.push(3); if (e.rootT > 0) ic.push(4); if (e.markT > 0) ic.push(5); if (e.stunT > 0) ic.push(6); if (e.blockedBy) ic.push(10);
        ic.forEach((k, i) => B.icon(x, y + 0.17 * ks, z, 0.19 * ks, k, (i - (ic.length - 1) / 2) * 0.2 * ks, 1));
      }
      for (const k in sim.nodes) { const ns = sim.nodes[k]; if (ns.iso) { const c = sim.grid.cells[k]; B.bar(this.wx(c.x), 1.25, this.wz(c.y), 0.74 * ks, 0.105 * ks, ns.iso.hp / ns.iso.maxHp, ns.iso.t / ns.iso.dur, 1, 0.75, 0.25, 1); } }
      B.end();
    }

    // ---------- 交互层（由输入模块填写 overlay）----------
    _syncOverlay(dt) {
      const ov = this.overlay, fx = this.fx, cl = fx.cells, sim = this.sim;
      for (const c of ov.cells) { const cc = sim.grid.cells[c[0]]; cl.add(this.wx(cc.x), this.map.top(cc) + 0.02, this.wz(cc.y), c[1], c[2], c[3]); }
      for (const c of ov.circles) fx.circle(this.wx(c[0]), this.wz(c[1]), c[2], c[3], c[4], c[5]);
      if (ov.sealed && ov.sealed.until > this.clock) {
        const s = ov.sealed;
        for (const id of s.entries) { const en = sim.grid.entries.find(e => e.id === id); cl.add(this.wx(en.x), 0.04, this.wz(en.y), 2, K.red, 1); this._fbeam(this.wx(en.x), 0, this.wz(en.y), this.wx(en.x), 2.6, this.wz(en.y), K.red, 0.035, 0.5); }
        for (const id of s.enemies) { const e = sim.eById.get(id); if (!e) continue; const p = this.enemyPos(e, this._v); fx.circle(p.x, p.z, 0.4, K.red, 0.08, 1); this._fbeam(p.x, 0, p.z, p.x, 1.6, p.z, K.red, 0.04, 0.7); }
        if (s.ci >= 0) { const c = sim.grid.cells[s.ci]; cl.add(this.wx(c.x), this.map.top(c) + 0.03, this.wz(c.y), 2, K.red, 1); }
      }
      // 部署虚影
      const gh = ov.ghost, key = gh ? gh.type + (gh.level || 1) + (gh.branch || '') : '';
      if (key !== this.ghostKey) { if (this.ghost) this.stage.scene.remove(this.ghost.g); this.ghost = null; this.ghostKey = key; if (gh) { this.ghost = GX.makeTower(gh.type, gh.level || 1, gh.branch); for (const m of this.ghost.mats) { m.transparent = true; m.opacity = 0.62; m.depthWrite = false; } this.ghost.g.traverse(o => { o.castShadow = false; }); this.stage.scene.add(this.ghost.g); } }
      if (this.ghost && gh) {
        const c = sim.grid.cells[gh.ci]; this.ghost.g.visible = !!c;
        if (c) {
          this.ghost.g.position.set(this.wx(c.x), this.map.top(c) + 0.02, this.wz(c.y));
          const yaw = gh.type === 'interceptor' ? Math.atan2(TD.DIRS[gh.facing || 0][0], TD.DIRS[gh.facing || 0][1]) : 0; this.ghost.g.rotation.y = this.ghost.noYaw ? 0 : yaw;
          this.ghost.tick({ t: this.clock, dt, fire: 9, hit: 9, deploy: 9, skill: 0, aim: 0, hasAim: false, cdK: 0, seed: 0, heal: false, lureR: 2.6, pitch: 0 });
          GX.flashMats(this.ghost.mats, 0.35 + 0.15 * Math.sin(this.clock * 8), gh.ok ? K.green : K.red, null, 0);
        }
      }
    }

    // ---------- 事件 → 特效 ----------
    tpos(t, out, h) { return out.set(this.wx(t.x), this.cellY(t.ci) + (h == null ? 0.42 : h), this.wz(t.y)); }
    onEvent(n, d) {
      const fx = this.fx, sim = this.sim, v = this._v, st = this.stage;
      switch (n) {
        case 'towerPlace': { this.tpos(d.tower, v, 0.05); fx.ring(v.x, v.y, v.z, { r0: 0.2, r1: 1.1, life: 0.45, color: K.cyan }); fx.burst(v.x, v.y + 0.1, v.z, { n: 22, color: K.cyan, speed: 2.2, life: 0.5, size: 0.12, flat: true }); fx.beam(v.x, v.y, v.z, v.x, v.y + 3.0, v.z, { color: K.cyan, width: 0.06, life: 0.35, alpha: 0.6 }); break; }
        case 'towerUp': { this.tpos(d.tower, v, 0.05); fx.ring(v.x, v.y, v.z, { r0: 0.2, r1: 1.3, life: 0.6, color: K.gold }); fx.burst(v.x, v.y + 0.3, v.z, { n: 30, color: K.gold, speed: 1.2, up: 2.2, life: 0.8, size: 0.13, grav: 1.5 }); fx.text(v.x, v.y + 1.3, v.z, '升级', { color: '#ffd84a', size: 0.55 }); break; }
        case 'towerSell': { const tv = this.tv.get(d.tower.id); this.tpos(d.tower, v, 0.3); fx.burst(v.x, v.y, v.z, { n: 26, color: K.cyan, speed: 1.4, up: 1.6, life: 0.7, size: 0.13 }); fx.text(v.x, v.y + 0.9, v.z, '+' + d.refund + ' 算力', { color: '#6fe8ff', size: 0.55 }); if (tv) { this.shatter(tv.model.g, { speed: 1.2, life: 0.55, floor: this.cellY(d.tower.ci) }); } break; }
        case 'towerDie': { const tv = this.tv.get(d.tower.id); this.tpos(d.tower, v, 0.3); if (tv) this.shatter(tv.model.g, { speed: 3, life: 1.1, floor: this.cellY(d.tower.ci) }); fx.ring(v.x, v.y - 0.2, v.z, { r0: 0.2, r1: 1.7, life: 0.5, color: K.orange }); fx.glow(v.x, v.y, v.z, { color: K.orange, size: 3.2, life: 0.35 }); fx.burst(v.x, v.y, v.z, { n: 46, color: K.orange, speed: 3.6, life: 0.7, size: 0.16, grav: 4 }); fx.burst(v.x, v.y, v.z, { n: 16, color: K.grey, speed: 1, up: 1, life: 1.2, size: 0.3, grav: -0.4 }); fx.text(v.x, v.y + 1.1, v.z, '设备损毁', { color: '#ff5a4a', size: 0.62, life: 1.2 }); st.addShake(0.09); break; }
        case 'towerHit': {
          const tv = this.tv.get(d.tower.id); if (tv) { tv.dmgAcc += d.dmg + d.abs; if (tv.dmgT <= 0) tv.dmgT = 0.28; }
          this.tpos(d.tower, v, 0.4); const sx = this.wx(d.sx), sz = this.wz(d.sy);
          if (d.kind === 'melee') { fx.beam(sx, 0.3, sz, v.x, v.y, v.z, { color: K.pink, width: 0.03, life: 0.14 }); fx.burst(TD.lerp(sx, v.x, 0.75), v.y, TD.lerp(sz, v.z, 0.75), { n: 7, color: K.orange, speed: 1.8, life: 0.3, size: 0.1, grav: 3 }); }
          else if (d.kind === 'smash') { fx.beam(sx, 0.45, sz, v.x, v.y, v.z, { color: K.red, width: 0.12, life: 0.22 }); fx.ring(v.x, v.y - 0.3, v.z, { r0: 0.3, r1: 1.15, life: 0.35, color: K.red }); fx.burst(v.x, v.y, v.z, { n: 20, color: K.orange, speed: 3, life: 0.45, size: 0.14, grav: 4 }); st.addShake(0.035); }
          else if (d.kind === 'ranged') { fx.burst(v.x, v.y, v.z, { n: 12, color: K.red, speed: 2, life: 0.35, size: 0.12 }); fx.glow(v.x, v.y, v.z, { color: K.red, size: 1.3, life: 0.2 }); }
          else if (d.kind === 'payload' || d.kind === 'surge') { fx.burst(v.x, v.y, v.z, { n: 18, color: K.red, speed: 2.8, life: 0.5, size: 0.15, grav: 2 }); }
          if (d.abs > 0) fx.ring(v.x, v.y, v.z, { r0: 0.5, r1: 0.75, life: 0.2, color: K.cyan, alpha: 0.6 });
          break;
        }
        case 'shot': { const tv = this.tv.get(d.tower.id); if (!tv) break; const a = d.tower.aim, y = tv.g.position.y + 0.42; fx.glow(tv.g.position.x + Math.cos(a) * 0.55, y, tv.g.position.z + Math.sin(a) * 0.55, { color: d.kind === 'sup' ? K.blue : K.cyan, size: d.kind === 'sup' ? 0.5 : 0.9, life: 0.1 }); break; }
        case 'shotHit': {
          const s = d.shot, sv = this.sv.get(s.id), y = sv ? sv.h1 : 0.4, x = this.wx(s.tx), z = this.wz(s.ty);
          if (s.kind === 'ransom') { fx.glow(x, y, z, { color: K.red, size: 1.6, life: 0.25 }); }
          else if (d.hit) { fx.burst(x, y, z, { n: s.kind === 'sup' ? 4 : 8, color: s.kind === 'sup' ? K.blue : K.cyan, speed: 1.8, life: 0.25, size: 0.1 }); fx.glow(x, y, z, { color: s.kind === 'sup' ? K.blue : K.cyan, size: 0.7, life: 0.12 }); if (s.kind === 'sup') fx.ring(x, 0.05, z, { r0: 0.1, r1: 0.4, life: 0.25, color: K.blue, alpha: 0.6 }); }
          break;
        }
        case 'beam': { const tv = this.tv.get(d.tower.id), b = d.b; const y = tv ? tv.g.position.y + 0.42 : 0.8; const x1 = this.wx(b.x1), z1 = this.wz(b.y1), x2 = this.wx(b.x2), z2 = this.wz(b.y2); fx.beam(x1, y, z1, x2, 0.35, z2, { color: K.white, width: 0.028, life: 0.3 }); fx.beam(x1, y, z1, x2, 0.35, z2, { color: K.cyan, width: 0.085, life: 0.4, alpha: 0.5 }); fx.glow(x1, y, z1, { color: K.cyan, size: 1.6, life: 0.2 }); for (const id of b.hits) { const e = sim.eById.get(id) || null; if (e) { const p = this.enemyPos(e, this._v2); fx.burst(p.x, p.y, p.z, { n: 9, color: K.cyan, speed: 2.4, life: 0.3, size: 0.12 }); } } break; }
        case 'pulse': { this.tpos(d.tower, v, 0); const y = 0.06; fx.ring(v.x, y, v.z, { r0: 0.3, r1: d.r, life: d.big ? 0.6 : 0.42, color: d.big ? K.white : K.cyan, alpha: 1 }); fx.ring(v.x, y, v.z, { r0: 0.1, r1: d.r * 0.8, life: 0.55, color: K.cyan, alpha: 0.5 }); fx.glow(v.x, v.y + 0.45, v.z, { color: K.cyan, size: d.big ? 3 : 1.6, life: 0.25 }); for (const id of d.ids) { const e = sim.eById.get(id); if (!e) continue; const x = this.wx(e.x), z = this.wz(e.y); fx.beam(x, 0, z, x, 0.9, z, { color: K.cyan, width: 0.05, life: 0.25 }); fx.burst(x, 0.25, z, { n: 5, color: K.cyan, speed: 1.2, up: 1, life: 0.3, size: 0.1 }); } if (d.big) st.addShake(0.03); break; }
        case 'fwHit': { this.tpos(d.tower, v, 0.4); for (const p of d.pts) { const x = this.wx(p[0]), z = this.wz(p[1]); fx.beam(v.x, v.y, v.z, x, 0.3, z, { color: K.cyan, width: 0.07, life: 0.16 }); fx.burst(x, 0.3, z, { n: 9, color: K.cyan, speed: 2.2, life: 0.3, size: 0.11, grav: 2 }); fx.ring(x, 0.05, z, { r0: 0.1, r1: 0.4, life: 0.22, color: K.cyan, alpha: 0.7 }); } break; }
        case 'melee': break;
        case 'smash': { const c = sim.grid.cells[d.ci]; fx.ring(this.wx(c.x), 0.12, this.wz(c.y), { r0: 0.4, r1: 1.0, life: 0.3, color: K.red }); break; }
        case 'isoHit': { const c = sim.grid.cells[d.ci], x = this.wx(c.x), z = this.wz(c.y); fx.beam(this.wx(d.sx), 0.45, this.wz(d.sy), x, 0.45, z, { color: K.red, width: 0.12, life: 0.22 }); fx.burst(x, 0.45, z, { n: 20, color: K.amber, speed: 3, life: 0.45, size: 0.14, grav: 4 }); st.addShake(0.03); break; }
        case 'ransomShot': { const p = this.enemyPos(d.enemy, v); fx.glow(p.x, p.y, p.z, { color: K.red, size: 1.1, life: 0.18 }); fx.beam(p.x, p.y, p.z, this.wx(d.tower.x), this.cellY(d.tower.ci) + 0.4, this.wz(d.tower.y), { color: K.red, width: 0.012, life: 0.3, alpha: 0.6 }); break; }
        case 'encrypt': { this.tpos(d.tower, v); fx.burst(v.x, v.y, v.z, { n: 18, color: K.red, speed: 1.4, life: 0.5, size: 0.13 }); fx.ring(v.x, v.y, v.z, { r0: 0.9, r1: 0.45, life: 0.35, color: K.red, ease: false }); fx.text(v.x, v.y + 0.9, v.z, '已加密', { color: '#ff4060', size: 0.58, life: 1.1 }); break; }
        case 'cleanse': { if (d.auto) break; this.tpos(d.tower, v); fx.burst(v.x, v.y, v.z, { n: 20, color: K.green, speed: 1.8, up: 1, life: 0.6, size: 0.13 }); fx.text(v.x, v.y + 0.9, v.z, '解除加密', { color: '#6fffb0', size: 0.55 }); break; }
        case 'encBlocked': { this.tpos(d.tower, v); fx.ring(v.x, v.y, v.z, { r0: 0.5, r1: 0.8, life: 0.25, color: K.cyan }); fx.text(v.x, v.y + 0.9, v.z, '护盾挡下加密', { color: '#8fe8ff', size: 0.48 }); break; }
        case 'shieldBreak': { this.tpos(d.tower, v); fx.burst(v.x, v.y, v.z, { n: 26, color: K.cyan, speed: 3, life: 0.45, size: 0.14, grav: 3 }); fx.ring(v.x, v.y, v.z, { r0: 0.6, r1: 1.2, life: 0.3, color: K.cyan }); break; }
        case 'skill': {
          const t = d.tower; this.tpos(t, v); fx.text(v.x, v.y + 1.15, v.z, d.name, { color: t.type === 'repair' ? '#6fffb0' : t.type === 'honeypot' ? '#ffc24a' : '#8fe8ff', size: 0.66, life: 1.3 }); fx.glow(v.x, v.y, v.z, { color: K.white, size: 2.4, life: 0.3 });
          if (t.type === 'firewall') { fx.ring(v.x, 0.08, v.z, { r0: 0.3, r1: 1.2, life: 0.5, color: K.cyan }); fx.burst(v.x, v.y, v.z, { n: 24, color: K.cyan, speed: 1, up: 1.5, life: 0.7, size: 0.12 }); }
          else if (t.type === 'honeypot') { fx.ring(v.x, 0.08, v.z, { r0: 0.2, r1: t.S.lure, life: 0.6, color: K.amber }); for (const id of d.ids) { const e = sim.eById.get(id); if (!e) continue; const p = this.enemyPos(e, this._v2); fx.beam(v.x, v.y, v.z, p.x, p.y, p.z, { color: K.amber, width: 0.05, life: 0.5 }); fx.ring(p.x, 0.06, p.z, { r0: 0.6, r1: 0.25, life: 0.4, color: K.amber, ease: false }); } }
          else if (t.type === 'interceptor' && d.beams) { for (const b of d.beams) { fx.beam(this.wx(b.x1), v.y, this.wz(b.y1), this.wx(b.x2), 0.35, this.wz(b.y2), { color: K.white, width: 0.04, life: 0.45 }); fx.beam(this.wx(b.x1), v.y, this.wz(b.y1), this.wx(b.x2), 0.35, this.wz(b.y2), { color: K.cyan, width: 0.13, life: 0.55, alpha: 0.5 }); } st.addShake(0.03); }
          else if (t.type === 'interceptor') { for (const id of d.ids) { const e = sim.eById.get(id); if (!e) continue; const p = this.enemyPos(e, this._v2); fx.beam(v.x, v.y, v.z, p.x, p.y, p.z, { color: K.blue, width: 0.03, life: 0.35 }); fx.ring(p.x, 0.06, p.z, { r0: 0.5, r1: 0.2, life: 0.45, color: K.blue, ease: false }); } }
          else if (t.type === 'repair') { fx.ring(v.x, 0.08, v.z, { r0: 0.3, r1: t.S.range, life: 0.7, color: K.green }); for (const id of d.ids) { const o = sim.tById.get(id); if (!o) continue; this.tpos(o, this._v2); fx.beam(v.x, v.y + 0.5, v.z, this._v2.x, this._v2.y, this._v2.z, { color: K.green, width: 0.06, life: 0.5 }); fx.ring(this._v2.x, this._v2.y - 0.3, this._v2.z, { r0: 0.9, r1: 0.6, life: 0.4, color: K.cyan, ease: false }); fx.burst(this._v2.x, this._v2.y, this._v2.z, { n: 12, color: K.cyan, speed: 1, up: 1.2, life: 0.6, size: 0.12 }); } }
          break;
        }
        case 'lure': { this.tpos(d.tower, v); const p = this.enemyPos(d.enemy, this._v2); fx.beam(v.x, v.y, v.z, p.x, p.y, p.z, { color: K.amber, width: 0.03, life: 0.4 }); fx.text(p.x, p.y + 0.5, p.z, '被诱骗', { color: '#ffc24a', size: 0.42, life: 0.8 }); break; }
        case 'block': { const p = this.enemyPos(d.enemy, v); fx.burst(p.x, p.y, p.z, { n: 6, color: K.white, speed: 1.4, life: 0.25, size: 0.1 }); break; }
        case 'reveal': { const p = this.enemyPos(d.enemy, v); fx.ring(p.x, 0.06, p.z, { r0: 0.15, r1: 0.7, life: 0.4, color: K.gold }); fx.glow(p.x, p.y, p.z, { color: K.gold, size: 1.4, life: 0.3 }); fx.text(p.x, p.y + 0.55, p.z, '显形', { color: '#ffe14a', size: 0.5, life: 0.9 }); break; }
        case 'replicate': { const p = this.enemyPos(d.enemy, v); fx.burst(p.x, p.y, p.z, { n: 16, color: K.pink, speed: 1.8, life: 0.45, size: 0.12 }); fx.ring(p.x, 0.12, p.z, { r0: 0.2, r1: 0.8, life: 0.4, color: K.pink }); fx.text(p.x, p.y + 0.5, p.z, '复制', { color: '#ff7ab8', size: 0.44, life: 0.8 }); break; }
        case 'packShield': { const p = this.enemyPos(d.enemy, v).clone(); fx.ring(p.x, 0.06, p.z, { r0: 0.2, r1: d.enemy.d.shieldR, life: 0.5, color: K.violet, alpha: 0.7 }); for (const id of d.ids) { const e = sim.eById.get(id); if (!e) continue; const q = this.enemyPos(e, this._v2); fx.beam(p.x, p.y, p.z, q.x, q.y, q.z, { color: K.violet, width: 0.03, life: 0.35 }); } break; }
        case 'eShieldBreak': { const p = this.enemyPos(d.enemy, v); fx.burst(p.x, p.y, p.z, { n: 14, color: K.pink, speed: 2.4, life: 0.35, size: 0.12, grav: 2 }); break; }
        case 'payload': { const x = this.wx(d.x), z = this.wz(d.y); fx.ring(x, 0.08, z, { r0: 0.2, r1: d.r, life: 0.5, color: K.red }); fx.glow(x, 0.5, z, { color: K.red, size: 3.4, life: 0.35 }); fx.burst(x, 0.4, z, { n: 40, color: K.red, speed: 3.4, life: 0.6, size: 0.16, grav: 2 }); fx.text(x, 1.2, z, '载荷释放', { color: '#ff4060', size: 0.6, life: 1.1 }); st.addShake(0.06); break; }
        case 'spawn': { const ev = this._makeEnemyView(d.enemy); if (!d.copy && !d.from) { const p = this.map.portals[d.enemy.entry]; if (p) { fx.glow(p.x, 0.6, p.z, { color: C(TD.ENTRY_COLORS[d.enemy.entry]), size: 1.6, life: 0.3 }); fx.burst(p.x, 0.5, p.z, { n: 8, color: C(TD.ENTRY_COLORS[d.enemy.entry]), speed: 1.2, life: 0.4, size: 0.1 }); } } break; }
        case 'enemyDie': {
          const e = d.enemy, ev = this.ev.get(e.id); const p = ev ? v.copy(ev.g.position) : v.set(this.wx(e.x), 0, this.wz(e.y)); const h = ev ? ev.model.h * 0.5 : 0.3;
          const c = e.type === 'worm' ? K.pink : e.type === 'trojan' && e.hidden ? K.blue : (e.type === 'flood' || e.type === 'hotspot' || e.type === 'packer' || e.type === 'boss2') ? K.violet : K.red;
          if (ev) { this.shatter(ev.model.g, { speed: e.boss ? 4.5 : 2.4, life: e.boss ? 1.8 : 0.8, max: e.boss ? 60 : 22, floor: e.fly ? 0 : p.y, cy: h, vx: e.dirX * 0.8, vz: e.dirY * 0.8 }); this.units.remove(ev.g); this.ev.delete(e.id); }
          fx.glow(p.x, p.y + h, p.z, { color: c, size: e.boss ? 7 : 1.5, life: e.boss ? 0.7 : 0.22 }); fx.burst(p.x, p.y + h, p.z, { n: e.boss ? 120 : 14, color: c, speed: e.boss ? 5 : 2.2, life: e.boss ? 1.2 : 0.45, size: e.boss ? 0.22 : 0.12, grav: 2.5 });
          if (!e.fly) fx.ring(p.x, p.y + 0.05, p.z, { r0: 0.15, r1: e.boss ? 4 : 0.6, life: e.boss ? 0.9 : 0.3, color: c, alpha: 0.7 });
          if (d.reward >= 9) fx.text(p.x, p.y + h + 0.5, p.z, '+' + d.reward, { color: '#7fe6ff', size: 0.4, life: 0.7, rise: 0.4 });
          if (e.boss) { st.addShake(0.3); for (let i = 0; i < 5; i++) { const dl = i * 0.14; let t = 0, done = false; fx.add((dt) => { t += dt; if (!done && t >= dl) { done = true; fx.ring(p.x, 0.1 + i * 0.3, p.z, { r0: 0.3, r1: 2.5 + i, life: 0.7, color: i % 2 ? K.white : c }); return false; } return true; }); } }
          break;
        }
        case 'leak': { const e = d.enemy, ev = this.ev.get(e.id); if (ev) { this.units.remove(ev.g); this.ev.delete(e.id); } const ex = sim.grid.exits.find(q => q.id === d.exit) || sim.grid.exits[0]; const x = this.wx(ex.x), z = this.wz(ex.y); fx.ring(x, 0.08, z, { r0: 0.3, r1: 1.8, life: 0.6, color: K.red }); fx.beam(x, 0, z, x, 3.2, z, { color: K.red, width: 0.22, life: 0.5, alpha: 0.5 }); fx.burst(x, 1.2, z, { n: 30, color: K.red, speed: 2.6, life: 0.7, size: 0.16 }); fx.text(x, 2.9, z, '完整度 -' + d.dmg, { color: '#ff4a4a', size: 0.72, life: 1.4 }); if (this.map.exits[ex.id]) this.map.exits[ex.id].hurt = 0.6; st.addShake(0.09); break; }
        case 'nodeIsolate': { const c = sim.grid.cells[d.ci], x = this.wx(c.x), z = this.wz(c.y); fx.ring(x, 0.12, z, { r0: 1.3, r1: 0.55, life: 0.4, color: K.orange, ease: false }); fx.ring(x, 0.12, z, { r0: 0.3, r1: 1.3, life: 0.5, color: K.orange }); fx.burst(x, 0.3, z, { n: 26, color: K.orange, speed: 1.6, up: 1.4, life: 0.6, size: 0.13 }); fx.text(x, 1.55, z, '节点隔离', { color: '#ff9a4a', size: 0.66, life: 1.4 }); break; }
        case 'nodeOpen': { const c = sim.grid.cells[d.ci], x = this.wx(c.x), z = this.wz(c.y); fx.ring(x, 0.12, z, { r0: 0.3, r1: 1.6, life: 0.6, color: K.green }); fx.burst(x, 0.5, z, { n: 34, color: d.why === 'sell' || d.why === 'expire' ? K.green : K.orange, speed: 3, life: 0.6, size: 0.14, grav: 3 }); for (let dd = 0; dd < 4; dd++) { const nb = c.nb[dd]; if (nb < 0 || !sim.grid.cells[nb].walk) continue; for (let k = 0; k < 8; k++) fx.spawn(x, 0.15, z, TD.DIRS[dd][0] * (1.5 + k * 0.35), 0, TD.DIRS[dd][1] * (1.5 + k * 0.35), 0.6, 0.14, K.green, 0, 0.8); } fx.text(x, 1.55, z, '旁路直通', { color: '#6fffb0', size: 0.66, life: 1.4 }); if (d.why === 'smash' || d.why === 'surge') { st.addShake(0.08); fx.glow(x, 0.5, z, { color: K.amber, size: 3, life: 0.3 }); } break; }
        case 'routes': { for (const id in d.routes) { const r = this.map.setEntryLabel(id, d.routes[id].exit); if (r) { this.labels = this.labels.filter(l => l[0] !== r.old); this.labels.push([r.neu, r.neu.scale.y]); } } this.fx.setRoutes(d.routes, d.changed); if (d.changed.length) this.fx.routeChanged(d.old, d.routes, d.changed); for (const [id, tv] of this.tv) if (tv.t.type === 'firewall' && !tv.t.blocked.length) tv.baseYaw = this._upstreamYaw(tv.t); break; }
        case 'item': { const c = sim.grid.cells[d.ci], x = this.wx(c.x), z = this.wz(c.y); if (d.key === 'downgrade') { fx.ring(x, 0.06, z, { r0: 0.2, r1: TD.ITEMS.downgrade.radius, life: 0.6, color: K.amber }); fx.text(x, 1.2, z, '协议降级', { color: '#ffc24a', size: 0.66, life: 1.3 }); for (const ci of d.cells) { const cc = sim.grid.cells[ci]; fx.beam(this.wx(cc.x), 0, this.wz(cc.y), this.wx(cc.x), 0.7, this.wz(cc.y), { color: K.amber, width: 0.16, life: 0.4, alpha: 0.25 }); } } else if (d.key === 'restore') { const y = this.cellY(d.ci); fx.beam(x, y, z, x, y + 3, z, { color: K.green, width: 0.18, life: 0.6, alpha: 0.4 }); fx.burst(x, y + 0.3, z, { n: 30, color: K.green, speed: 0.8, up: 2, life: 0.9, size: 0.14, grav: -0.5 }); fx.text(x, y + 1.3, z, '+' + Math.round(d.amt) + ' 备份还原', { color: '#6fffb0', size: 0.6, life: 1.2 }); } break; }
        case 'honeyBurst': { this.tpos(d.tower, v); fx.ring(v.x, 0.08, v.z, { r0: 0.3, r1: d.r, life: 0.6, color: K.amber }); fx.glow(v.x, v.y, v.z, { color: K.amber, size: 4, life: 0.35 }); break; }
        case 'intel': { if (d.x == null) break; fx.text(this.wx(d.x), 1.5, this.wz(d.y), '+' + d.n + ' 情报', { color: '#ffd84a', size: 0.56, life: 1.2 }); break; }
        case 'bossSpawn': { const p = this.map.portals[d.enemy.entry]; if (p) { fx.ring(p.x, 0.1, p.z, { r0: 0.3, r1: 4, life: 1, color: K.red }); fx.glow(p.x, 1, p.z, { color: K.red, size: 7, life: 0.8 }); fx.burst(p.x, 0.8, p.z, { n: 80, color: K.red, speed: 4, life: 1, size: 0.2 }); } st.addShake(0.22); break; }
        case 'bossPhase': { const p = this.enemyPos(d.enemy, v); fx.ring(p.x, 0.1, p.z, { r0: 0.4, r1: 5, life: 0.9, color: K.white }); fx.ring(p.x, 0.1, p.z, { r0: 0.2, r1: 3.5, life: 1.1, color: d.enemy.type === 'boss2' ? K.violet : K.red }); fx.glow(p.x, p.y, p.z, { color: K.white, size: 6, life: 0.5 }); fx.burst(p.x, p.y, p.z, { n: 90, color: d.enemy.type === 'boss2' ? K.violet : K.red, speed: 4.5, life: 0.9, size: 0.2 }); st.addShake(0.25); break; }
        case 'bossAct': {
          const e = d.enemy, p = this.enemyPos(e, v).clone();
          if (d.kind === 'surge') { const c = sim.grid.cells[d.ci], x = this.wx(c.x), z = this.wz(c.y); fx.beam(p.x, p.y + 0.3, p.z, x, 0.5, z, { color: K.red, width: 0.3, life: 0.5, alpha: 0.6 }); fx.beam(p.x, p.y + 0.3, p.z, x, 0.5, z, { color: K.white, width: 0.14, life: 0.35 }); fx.ring(x, 0.1, z, { r0: 0.3, r1: 2.6, life: 0.6, color: K.red }); fx.glow(x, 0.6, z, { color: K.red, size: 5, life: 0.4 }); fx.burst(x, 0.5, z, { n: 70, color: K.red, speed: 4.5, life: 0.8, size: 0.2, grav: 3 }); for (let k = 0; k < 14; k++) { const u = k / 14; fx.burst(TD.lerp(p.x, x, u), 0.4, TD.lerp(p.z, z, u), { n: 3, color: K.pink, speed: 1.5, life: 0.5, size: 0.14 }); } fx.text(x, 2, z, '洪峰', { color: '#ff4060', size: 0.9, life: 1.3 }); st.addShake(0.28); }
          else if (d.kind === 'blackhole') { const c = sim.grid.cells[d.ci], x = this.wx(c.x), z = this.wz(c.y); fx.beam(p.x, p.y + 0.5, p.z, x, 0.5, z, { color: K.violet, width: 0.2, life: 0.5 }); fx.ring(x, 0.1, z, { r0: 2.2, r1: 0.3, life: 0.5, color: K.violet, ease: false }); fx.glow(x, 0.5, z, { color: K.violet, size: 4, life: 0.4 }); fx.text(x, 1.6, z, '路由黑洞', { color: '#d080ff', size: 0.76, life: 1.4 }); st.addShake(0.12); }
          else if (d.kind === 'lock') { for (const ci of d.cells) { const c = sim.grid.cells[ci], x = this.wx(c.x), z = this.wz(c.y); fx.beam(x, 3.5, z, x, 0, z, { color: K.red, width: 0.22, life: 0.45, alpha: 0.5 }); fx.ring(x, 0.08, z, { r0: 0.2, r1: 1.0, life: 0.45, color: K.red }); fx.burst(x, 0.3, z, { n: 22, color: K.red, speed: 2.6, life: 0.5, size: 0.15, grav: 3 }); } const c = sim.grid.cells[d.cells[Math.floor(d.cells.length / 2)]]; fx.text(this.wx(c.x), 1.7, this.wz(c.y), '运维环锁死', { color: '#ff4060', size: 0.8, life: 1.5 }); st.addShake(0.2); }
          else if (d.kind === 'storm') { e.stormT = sim.time; fx.glow(p.x, p.y, p.z, { color: K.violet, size: 5, life: 0.4 }); for (const id of d.ids) { const t = sim.tById.get(id); if (!t) continue; this.tpos(t, this._v2); fx.beam(p.x, p.y + 0.6, p.z, this._v2.x, this._v2.y, this._v2.z, { color: K.violet, width: 0.045, life: 0.4 }); fx.burst(this._v2.x, this._v2.y, this._v2.z, { n: 8, color: K.violet, speed: 1.6, life: 0.4, size: 0.12 }); } fx.text(p.x, p.y + 1.6, p.z, '路由风暴', { color: '#d080ff', size: 0.8, life: 1.4 }); st.addShake(0.14); }
          else { fx.ring(p.x, 0.08, p.z, { r0: 0.3, r1: 1.6, life: 0.5, color: d.kind === 'worms' ? K.pink : K.red }); fx.burst(p.x, p.y, p.z, { n: 30, color: K.pink, speed: 2.4, life: 0.5, size: 0.14 }); fx.text(p.x, p.y + 1.4, p.z, d.kind === 'worms' ? '释放蠕虫' : '放出木马', { color: '#ff7ab8', size: 0.6, life: 1.1 }); }
          break;
        }
      }
    }

    // ---------- 拾取 ----------
    pick(sx, sy) {
      const st = this.stage, sim = this.sim, res = { ci: -1, tower: null, enemy: null };
      let bd = 34 * (st.h / 1080) * TD.clamp(34 / st.cam.dist, 0.7, 2.2); bd *= bd;
      for (const e of sim.enemies) { if (e.dead) continue; const p = this.enemyPos(e, this._v); const s = st.project(p.x, p.y, p.z, this._v2); const d = (s.x - sx) * (s.x - sx) + (s.y - sy) * (s.y - sy); const lim = e.boss ? bd * 5 : bd; if (d < lim && d < bd * 6) { if (!res.enemy || d < res._d) { res.enemy = e; res._d = d; } } }
      const hi = st.rayPlane(sx, sy, 0.42);
      if (hi) { const c = sim.cellAt(Math.round(hi.x + this.map.ox), Math.round(hi.z + this.map.oz)); if (c && (c.type === 'platform' || c.type === 'obstacle')) res.ci = c.i; }
      if (res.ci < 0) { const lo = st.rayPlane(sx, sy, 0.0); if (lo) { const c = sim.cellAt(Math.round(lo.x + this.map.ox), Math.round(lo.z + this.map.oz)); if (c && c.type !== 'void') res.ci = c.i; } }
      if (res.ci >= 0 && sim.towerAt[res.ci]) res.tower = sim.tById.get(sim.towerAt[res.ci]);
      if (!res.tower) { let b2 = bd * 1.2; for (const t of sim.towers) { const s = st.project(this.wx(t.x), this.cellY(t.ci) + 0.45, this.wz(t.y), this._v2); const d = (s.x - sx) * (s.x - sx) + (s.y - sy) * (s.y - sy); if (d < b2) { b2 = d; res.tower = t; } } if (res.tower) res.ci = res.tower.ci; }
      return res;
    }
    screenOfCell(ci, h) { const c = this.sim.grid.cells[ci]; return this.stage.project(this.wx(c.x), this.map.top(c) + (h || 0), this.wz(c.y)); }

    // ---------- 主更新 ----------
    update(dtSim, dtReal, envT) {
      this.clock = envT; this.fbi = 0;
      this.fx.beginOverlay();
      this.map.update(envT, dtReal, this.sim);
      this._syncTowers(dtSim); this._syncEnemies(dtSim); this._syncShots(dtSim); this._syncZones(dtSim);
      for (const [id, v] of this.ev) if (!this.sim.eById.has(id)) { this.units.remove(v.g); this.ev.delete(id); }
      this._syncOverlay(dtReal);
      this._syncBars();
      this.fx.endOverlay();
      for (let i = this.fbi; i < this.fbeams.length; i++) this.fbeams[i].visible = false;
      this._updFrags(dtSim);
      this.fx.update(dtSim);
      const ks = TD.clamp(this.stage.cam.dist / (this.stage.camDef.dist || 34), 0.3, 1.2);
      for (const l of this.labels) { const s = l[1] * ks; l[0].scale.set(s * l[0].userData.aspect, s, 1); }
    }
  }
  GX.BattleView = BattleView;
})(window);
