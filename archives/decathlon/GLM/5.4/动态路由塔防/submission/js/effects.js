/* 动态路由塔防 —— 特效：粒子、冲击环、光束、飘字、阻挡连线、事件到特效/音效的映射 */
window.G = window.G || {};
(function () {
  'use strict';
  const T = window.THREE, M = G.Models, S = G.Sim;

  const FX = {
    init(view) {
      this.view = view; this.group = new T.Group(); view.scene.add(this.group);
      // 粒子
      this.N = 2400; this.p = { pos: new Float32Array(this.N * 3), col: new Float32Array(this.N * 3), size: new Float32Array(this.N), life: new Float32Array(this.N), max: new Float32Array(this.N), vel: new Float32Array(this.N * 3), grav: new Float32Array(this.N), drag: new Float32Array(this.N) };
      this.pHead = 0;
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(this.p.pos, 3)); g.setAttribute('color', new T.BufferAttribute(this.p.col, 3)); g.setAttribute('size', new T.BufferAttribute(this.p.size, 1));
      const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*(260.0/-mv.z); gl_Position = projectionMatrix*mv; }', fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(d)); gl_FragColor = vec4(vC, a); }', vertexColors: true });
      this.points = new T.Points(g, mat); this.points.frustumCulled = false; this.group.add(this.points);
      // 环
      this.rings = []; for (let i = 0; i < 40; i++) { const m = new T.Mesh(new T.RingGeometry(0.9, 1.0, 48), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; this.group.add(m); this.rings.push({ m, t: 0, dur: 1, r0: 0, r1: 1, y: 0 }); }
      // 光束
      this.beams = []; for (let i = 0; i < 60; i++) { const m = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 6, 1, true), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })); m.visible = false; this.group.add(m); this.beams.push({ m, t: 0, dur: 0.2 }); }
      // 飘字
      this.texts = []; this.texCache = new Map();
      // 阻挡连线
      const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(new Float32Array(600), 3)); this.tether = new T.LineSegments(tg, new T.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.75 })); this.tether.frustumCulled = false; this.group.add(this.tether);
      // 选择/悬停
      this.tracers = [];
    },
    reset() { for (let i = 0; i < this.N; i++) this.p.life[i] = 0; for (const r of this.rings) r.m.visible = false; for (const b of this.beams) b.m.visible = false; for (const t of this.texts) { this.group.remove(t.s); } this.texts = []; },
    burst(x, y, z, color, n, speed, opts) {
      opts = opts || {}; const c = new T.Color(color); const sz = opts.size || 1.2; const life = opts.life || 0.7; const grav = opts.grav != null ? opts.grav : -6; const up = opts.up || 0;
      for (let i = 0; i < n; i++) { const k = this.pHead; this.pHead = (this.pHead + 1) % this.N; const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI; const sp = speed * (0.4 + Math.random() * 0.8);
        this.p.pos[k * 3] = x; this.p.pos[k * 3 + 1] = y; this.p.pos[k * 3 + 2] = z; this.p.vel[k * 3] = Math.cos(a) * Math.cos(e) * sp; this.p.vel[k * 3 + 1] = Math.sin(e) * sp + up; this.p.vel[k * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
        this.p.col[k * 3] = c.r; this.p.col[k * 3 + 1] = c.g; this.p.col[k * 3 + 2] = c.b; this.p.size[k] = sz * (0.5 + Math.random()); this.p.max[k] = this.p.life[k] = life * (0.6 + Math.random() * 0.6); this.p.grav[k] = grav; this.p.drag[k] = opts.drag != null ? opts.drag : 2.5; }
    },
    ring(x, y, z, r0, r1, color, dur, opts) {
      opts = opts || {}; const R = this.rings.find(r => !r.m.visible) || this.rings[0]; R.m.visible = true; R.m.position.set(x, y, z); R.m.material.color.set(color); R.m.material.opacity = opts.opacity != null ? opts.opacity : 0.9; R.t = 0; R.dur = dur; R.r0 = r0; R.r1 = r1; R.m.scale.setScalar(r0); R.m.rotation.x = opts.tilt ? 0 : -Math.PI / 2; R.m.rotation.z = opts.rot || 0; R.y = y; R.flat = !opts.tilt;
    },
    beam(a, b, color, width, dur, opts) {
      opts = opts || {}; const B = this.beams.find(x => !x.m.visible) || this.beams[0]; B.m.visible = true; B.m.material.color.set(color); B.m.material.opacity = opts.opacity != null ? opts.opacity : 0.9; B.t = 0; B.dur = dur; B.w = width;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const L = Math.hypot(dx, dy, dz) || 0.01; B.m.scale.set(width, L, width); B.m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      B.m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx / L, dy / L, dz / L));
    },
    text(str, x, y, z, color, size) {
      const key = str + '|' + color; let t = this.texCache.get(key);
      if (!t) { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const ctx = c.getContext('2d'); ctx.font = 'bold 36px "Microsoft YaHei UI","Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6; ctx.fillStyle = color; ctx.fillText(str, 128, 32); t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; this.texCache.set(key, t); }
      const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.position.set(x, y, z); const sc = (size || 1.2) * 256 / 64; s.scale.set(sc, size || 1.2, 1); s.renderOrder = 40; this.group.add(s); this.texts.push({ s, t: 0, dur: 1.1, y0: y });
    },
    update(dt, time) {
      // 粒子
      const P = this.p; const pos = this.points.geometry.attributes.position.array, col = this.points.geometry.attributes.color.array, size = this.points.geometry.attributes.size.array;
      for (let i = 0; i < this.N; i++) { if (P.life[i] <= 0) { size[i] = 0; continue; } P.life[i] -= dt; const k = i * 3; const dr = Math.max(0, 1 - P.drag[i] * dt); P.vel[k] *= dr; P.vel[k + 1] = P.vel[k + 1] * dr + P.grav[i] * dt; P.vel[k + 2] *= dr; P.pos[k] += P.vel[k] * dt; P.pos[k + 1] += P.vel[k + 1] * dt; P.pos[k + 2] += P.vel[k + 2] * dt; const r = Math.max(0, P.life[i] / P.max[i]); size[i] = (0.4 + r) * 1.3; if (P.life[i] <= 0) size[i] = 0; }
      this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.size.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
      for (const R of this.rings) { if (!R.m.visible) continue; R.t += dt; const k = Math.min(1, R.t / R.dur); const r = R.r0 + (R.r1 - R.r0) * (1 - Math.pow(1 - k, 2)); R.m.scale.setScalar(r); R.m.material.opacity = (1 - k) * (R.m.material.opacity > 0 ? 1 : 1) * (R.flat ? 0.9 : 0.9); if (k >= 1) R.m.visible = false; }
      for (const B of this.beams) { if (!B.m.visible) continue; B.t += dt; const k = Math.min(1, B.t / B.dur); B.m.material.opacity = (1 - k) * 0.9; B.m.scale.x = B.m.scale.z = B.w * (1 - k * 0.6); if (k >= 1) B.m.visible = false; }
      for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t += dt; const k = t.t / t.dur; t.s.position.y = t.y0 + k * 1.6; t.s.material.opacity = 1 - k * k; if (k >= 1) { this.group.remove(t.s); t.s.material.dispose(); this.texts.splice(i, 1); } }
      // 阻挡连线
      const g = this.view.game; if (!g) return; const arr = this.tether.geometry.attributes.position.array; let n = 0;
      for (const e of g.enemies) { if (e.dead || e.blockedBy == null) continue; const t = g.towers.find(x => x.id === e.blockedBy); if (!t) continue; if (n + 6 > arr.length) break; arr[n++] = e.x; arr[n++] = e.y + 0.8; arr[n++] = e.z; arr[n++] = t.x; arr[n++] = t.y + 1.2; arr[n++] = t.z; }
      for (let i = n; i < arr.length; i++) arr[i] = 0; this.tether.geometry.attributes.position.needsUpdate = true; this.tether.geometry.setDrawRange(0, n / 3);
      // 攻击/治疗目标指示
      for (const t of g.towers) { if (t.dead || t.type !== 'repair' || !t.lastTarget) continue; if (t.encUntil > time) continue; if (Math.floor(time * 12 + t.id) % 2 === 0) continue; }
    },
    // 事件 → 特效 + 音效
    handle(game, ev, time) {
      const A = G.Audio; const pos = { x: ev.x, y: ev.y, z: ev.z };
      switch (ev.type) {
        case 'shoot': { const t = ev.tower; const tgt = ev.target; if (ev.kind === 'pierce') { this.beam({ x: t.x, y: t.y + 1.5, z: t.z }, { x: ev.x2, y: t.y + 1.5, z: ev.z2 }, 0x9fe3ff, 0.18, 0.22); A.play('pierce'); } else { A.play(ev.kind === 'pulse' ? 'pulse' : 'laser'); } break; }
        case 'impact': this.burst(ev.x, ev.y, ev.z, ev.kind === 'pulse' ? 0x9fe3ff : 0x59c8ff, 6, 3, { size: 0.9, life: 0.35 }); break;
        case 'hit': { const e = ev.enemy; this.burst(e.x, e.y + 0.6, e.z, 0xffffff, 3, 2.5, { size: 0.7, life: 0.3 }); break; }
        case 'enemyDie': { const big = !!ev.enemy.def.boss; this.burst(ev.x, ev.y + 0.6, ev.z, ev.enemy.fly ? 0xffd84a : ev.enemy.def.boss ? 0xff8060 : 0x9fffc0, big ? 120 : 14, big ? 9 : 4, { size: big ? 2.4 : 1.2, life: big ? 1.6 : 0.7 }); if (big) { this.ring(ev.x, ev.y + 0.2, ev.z, 1, 12, 0xff8060, 1.2); A.play('bossDie'); } else A.play('die'); break; }
        case 'towerHit': { const t = ev.tower; this.burst(t.x, t.y + 1.2, t.z, 0xffa060, 8, 3, { size: 1.0, life: 0.4 }); A.play('towerHit'); break; }
        case 'towerDie': { const t = ev.tower; this.burst(t.x, t.y + 1, t.z, 0xff6040, 60, 7, { size: 1.8, life: 1.2 }); this.ring(t.x, t.y + 0.2, t.z, 1, 6, 0xff6040, 0.8); A.play('towerDie'); break; }
        case 'enemyAttack': { const e = ev.enemy, t = ev.tower; if (ev.kind === 'ranged') { this.beam({ x: e.x, y: e.y + 1.5, z: e.z }, { x: t.x, y: t.y + 1.4, z: t.z }, 0xb96bff, 0.12, 0.25); this.ring(t.x, t.y + 0.1, t.z, 0.3, 1.6, 0xb96bff, 0.4); A.play('encrypt'); } else if (ev.kind === 'siege') { this.beam({ x: e.x, y: e.y + 1.0, z: e.z }, { x: t.x, y: t.y + 1.0, z: t.z }, 0xffa040, 0.3, 0.2); this.ring(t.x, t.y + 0.1, t.z, 0.5, 3, 0xffa040, 0.5); this.burst(t.x, t.y + 1, t.z, 0xffc080, 20, 5, { size: 1.3, life: 0.6 }); A.play('siege'); } else { this.burst(t.x, t.y + 1.0, t.z, 0xff8060, 5, 2.5, { size: 0.8, life: 0.3 }); A.play('melee'); } break; }
        case 'enemyShot': break;
        case 'leak': { this.burst(ev.x, ev.y + 1, ev.z, 0xff3030, 40, 6, { size: 1.6, life: 1.0, grav: 2 }); this.ring(ev.x, ev.y + 0.1, ev.z, 1, 7, 0xff3030, 0.9); this.text('-' + ev.amount, ev.x, ev.y + 2.5, ev.z, '#ff6060', 1.6); A.play('leak'); break; }
        case 'deploy': { const t = ev.tower; this.ring(t.x, t.y + 0.05, t.z, 0.3, 3.2, 0x7dffb2, 0.6); this.burst(t.x, t.y + 0.5, t.z, 0x7dffb2, 24, 4, { size: 1.2, life: 0.6, grav: -3 }); A.play('deploy'); break; }
        case 'sell': A.play('sell'); break;
        case 'upgrade': { const t = ev.tower; this.ring(t.x, t.y + 0.05, t.z, 0.3, 4, 0xffe08a, 0.7); this.burst(t.x, t.y + 1, t.z, 0xffe08a, 30, 5, { size: 1.4, life: 0.8, grav: -4 }); A.play('upgrade'); break; }
        case 'isolate': { const n = game.M.byId.get(ev.node); this.ring(n.wx, n.wy + 0.1, n.wz, 3.5, 0.6, 0xff4a3a, 0.6); this.burst(n.wx, n.wy + 1, n.wz, 0xff6a4a, 40, 5, { size: 1.4, life: 0.8, grav: -2 }); A.play('isolate'); break; }
        case 'reopen': { const n = game.M.byId.get(ev.node); this.ring(n.wx, n.wy + 0.1, n.wz, 0.5, 4, 0x7dffb2, 0.7); this.burst(n.wx, n.wy + 1, n.wz, 0x7dffb2, 30, 4, { size: 1.2, life: 0.7, grav: -2 }); A.play('reopen'); break; }
        case 'routeChange': { if (this.view.routes) this.view.routes.flash(new Set(ev.entries)); A.play('route'); break; }
        case 'reject': A.play('reject'); break;
        case 'block': { const e = ev.enemy, t = ev.tower; this.burst((e.x + t.x) / 2, (e.y + t.y) / 2 + 1, (e.z + t.z) / 2, 0xffa040, 10, 3, { size: 1.0, life: 0.4 }); A.play('block'); break; }
        case 'lure': { const e = ev.enemy, t = ev.tower; this.beam({ x: t.x, y: t.y + 1.5, z: t.z }, { x: e.x, y: e.y + 0.8, z: e.z }, 0xff5fa8, 0.08, 0.5); break; }
        case 'reveal': { this.ring(ev.x, ev.y + 0.1, ev.z, 0.2, 2.2, 0xff5fa8, 0.5); this.burst(ev.x, ev.y + 0.8, ev.z, 0xff5fa8, 16, 3, { size: 1.0, life: 0.5 }); A.play('reveal'); break; }
        case 'replicate': { this.burst(ev.x, ev.y + 0.6, ev.z, 0x7cff5e, 20, 3, { size: 1.0, life: 0.6 }); this.text('复制', ev.x, ev.y + 2.2, ev.z, '#9dff7a', 1.1); break; }
        case 'payload': { this.ring(ev.x, ev.y + 0.1, ev.z, 0.5, ev.r * 4, 0xff4a4a, 0.7); this.burst(ev.x, ev.y + 0.5, ev.z, 0xff4a4a, 60, 8, { size: 1.8, life: 1.0 }); A.play('payload'); break; }
        case 'pulse': { const t = ev.tower; this.ring(t.x, t.y + 0.1, t.z, 0.5, ev.r * 4, 0x7dffb2, 0.55, { opacity: 0.8 }); break; }
        case 'heal': { const t = ev.tower, o = ev.target; this.beam({ x: t.x, y: t.y + 2.2, z: t.z }, { x: o.x, y: o.y + 1.5, z: o.z }, 0x9dff6a, 0.07, 0.25, { opacity: 0.7 }); this.burst(o.x, o.y + 1.8, o.z, 0x9dff6a, 2, 1.2, { size: 0.7, life: 0.5, grav: 2 }); break; }
        case 'shield': { const t = ev.tower || ev.enemy; this.ring(t.x, t.y + 0.6, t.z, 0.3, 2.0, 0x8ad0ff, 0.5, { tilt: true, rot: Math.random() * 3 }); A.play('shield'); break; }
        case 'shieldBreak': { const t = ev.tower || ev.enemy; this.burst(t.x, t.y + 1, t.z, 0x8ad0ff, 24, 5, { size: 1.2, life: 0.5 }); A.play('shieldBreak'); break; }
        case 'encrypt': { const t = ev.tower; this.text('加密', t.x, t.y + 3.6, t.z, '#d0a0ff', 1.2); break; }
        case 'storm': { const t = ev.tower; this.ring(t.x, t.y + 0.1, t.z, 0.3, 2.5, 0xb48cff, 0.7); break; }
        case 'skill': { const t = ev.tower; this.ring(t.x, t.y + 0.1, t.z, 0.3, 6, 0xffe08a, 0.9); this.burst(t.x, t.y + 1.5, t.z, 0xffe08a, 50, 6, { size: 1.5, life: 1.0, grav: -3 }); this.text(G.Sim.towerDef(t).skill.name, t.x, t.y + 4.2, t.z, '#ffe9a0', 1.5); A.play('skill'); break; }
        case 'intel': this.text('+' + ev.amount + ' 情报', ev.x || 0, ev.y + 2 || 2, ev.z || 0, '#8fe8ff', 1.2); A.play('intel'); break;
        case 'intelHold': break;
        case 'item': { if (ev.tower) { this.ring(ev.tower.x, ev.tower.y + 0.1, ev.tower.z, 0.3, 3, 0xffe08a, 0.7); } if (ev.cell) { const c = game.M.byId.get(ev.cell); this.ring(c.wx, c.wy + 0.1, c.wz, 0.3, (ev.radius || 1.5) * 4, 0xffb040, 0.8); this.burst(c.wx, c.wy + 0.5, c.wz, 0xffb040, 30, 4, { size: 1.2, life: 0.8 }); } A.play('item'); break; }
        case 'slam': { this.ring(ev.x, ev.y + 0.1, ev.z, 0.5, 9, 0xff4a3a, 0.9); this.burst(ev.x, ev.y + 0.5, ev.z, 0xff6a3a, 90, 9, { size: 2.2, life: 1.2 }); A.play('slam'); break; }
        case 'bossWarn': { for (const cid of ev.cells) { const c = game.M.byId.get(cid); this.ring(c.wx, c.wy + 0.1, c.wz, 2.2, 0.5, ev.kind === 'lock' ? 0xff3030 : 0xb48cff, 1.2); } A.play('bossWarn'); break; }
        case 'terrainApply': { for (const cid of ev.cells) { const c = game.M.byId.get(cid); this.burst(c.wx, c.wy + 1, c.wz, ev.kind === 'lock' ? 0xff3030 : 0xb48cff, 30, 5, { size: 1.5, life: 0.9 }); } break; }
        case 'terrainEnd': { const c = game.M.byId.get(ev.cell); if (c) this.ring(c.wx, c.wy + 0.1, c.wz, 0.3, 2.5, 0x7dffb2, 0.6); break; }
        case 'bossPhase': { const e = ev.enemy; this.ring(e.x, e.y + 0.1, e.z, 1, 10, 0xff4060, 1.2); this.burst(e.x, e.y + 2, e.z, 0xff4060, 120, 10, { size: 2.4, life: 1.4 }); A.play('bossPhase'); break; }
        case 'bossDie': { this.ring(ev.enemy.x, ev.enemy.y + 0.2, ev.enemy.z, 1, 16, 0xffffff, 1.5); break; }
        case 'spawn': { const e = ev.enemy; if (e.def.boss) { this.ring(e.x, e.y + 0.1, e.z, 1, 12, 0xff3050, 1.4); this.burst(e.x, e.y + 1, e.z, 0xff3050, 100, 8, { size: 2, life: 1.4 }); A.play('bossSpawn'); } else { this.ring(e.x, e.y + 0.1, e.z, 0.2, 1.6, e.entry === 'A' ? 0x3ad0ff : e.entry === 'B' ? 0xffb03a : 0xff5fd0, 0.5); } break; }
        case 'waveStart': A.play(ev.flood ? 'flood' : 'wave'); break;
        case 'waveClear': A.play('waveClear'); break;
        case 'win': A.play('win'); break;
        case 'lose': A.play('lose'); break;
        case 'siege': A.play('siegeTarget'); break;
      }
    }
  };
  G.FX = FX;
})();
