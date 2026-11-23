/* =========================================================================
 *  动态路由塔防 · 特效
 *  fx.js — 弹道 / 光束 / 爆炸 / 护盾 / 生命条 / 世界标签
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;

  const FX = {
    scene: null, items: [], bars: [], labels: [], texCache: {}
  };

  FX.init = function (scene) { FX.scene = scene; };

  /* ---------------- 文本贴图 ---------------- */
  function textTexture(str, color, bg) {
    const key = str + '|' + color + '|' + (bg || '');
    if (FX.texCache[key]) return FX.texCache[key];
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    if (bg) {
      x.fillStyle = bg; x.globalAlpha = 0.72;
      x.beginPath(); x.roundRect(6, 18, 500, 92, 26); x.fill();
      x.globalAlpha = 1;
    }
    x.font = '600 62px "Microsoft YaHei", "PingFang SC", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(0,0,0,0.85)'; x.shadowBlur = 10;
    x.fillStyle = color;
    x.fillText(str, 256, 66);
    const t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    FX.texCache[key] = t;
    return t;
  }

  /* ---------------- 世界标签 ---------------- */
  FX.label = function (text, pos, color, bg, scale) {
    if (!pos) return null;
    const sp = new T.Sprite(new T.SpriteMaterial({
      map: textTexture(text, color || '#eaf6ff', bg), transparent: true,
      depthTest: false, depthWrite: false
    }));
    sp.position.copy(pos);
    const s = scale || 4.2;
    sp.scale.set(s, s * 0.25, 1);
    sp.renderOrder = 20;
    FX.scene.add(sp);
    FX.labels.push({ sp: sp, t: 0, life: 2.6, vy: 0.9, base: sp.position.y });
    return sp;
  };

  /* ---------------- 生命条 ---------------- */
  FX.makeBar = function (width, color) {
    const g = new T.Group();
    const bg = new T.Mesh(new T.PlaneGeometry(width, width * 0.13), new T.MeshBasicMaterial({
      color: 0x0a0f18, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false
    }));
    const fill = new T.Mesh(new T.PlaneGeometry(width * 0.98, width * 0.09), new T.MeshBasicMaterial({
      color: new T.Color(color || '#6cf'), depthTest: false, depthWrite: false, transparent: true
    }));
    fill.position.z = 0.01;
    g.add(bg); g.add(fill);
    g.renderOrder = 18;
    g.userData = { fill: fill, w: width, bg: bg };
    return g;
  };
  FX.updateBar = function (bar, ratio, color, shieldRatio) {
    const ud = bar.userData;
    const f = Math.max(0, Math.min(1, ratio));
    ud.fill.scale.x = Math.max(0.001, f);
    ud.fill.position.x = -ud.w * 0.49 * (1 - f);
    if (color) ud.fill.material.color.set(color);
    if (shieldRatio !== undefined) {
      ud.bg.material.color.set(shieldRatio > 0 ? 0x1b3a5c : 0x0a0f18);
    }
  };
  FX.billboard = function (bar, camera) {
    bar.quaternion.copy(camera.quaternion);
  };

  /* ---------------- 粒子系统 ---------------- */
  function ParticlePool(max) {
    this.max = max; this.list = [];
    const geo = new T.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.scl = new Float32Array(max);
    geo.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.col, 3));
    geo.setAttribute('scale', new T.BufferAttribute(this.scl, 1));
    const mat = new T.PointsMaterial({
      size: 0.42, vertexColors: true, transparent: true, opacity: 0.9,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      map: RT.Art.getTextures(RT.DATA.MAPS[0].theme).glowWhite
    });
    this.points = new T.Points(geo, mat);
    this.points.frustumCulled = false;
    this.life = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.maxLife = new Float32Array(max);
    this.cursor = 0;
    FX.scene.add(this.points);
  }
  ParticlePool.prototype.emit = function (x, y, z, color, count, speed, size, life) {
    const c = new T.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.pos[idx * 3] = x; this.pos[idx * 3 + 1] = y; this.pos[idx * 3 + 2] = z;
      this.vel[idx * 3] = Math.cos(a) * Math.cos(e) * sp;
      this.vel[idx * 3 + 1] = Math.sin(e) * sp * 0.8 + speed * 0.25;
      this.vel[idx * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      const j = 0.75 + Math.random() * 0.45;
      this.col[idx * 3] = c.r * j; this.col[idx * 3 + 1] = c.g * j; this.col[idx * 3 + 2] = c.b * j;
      this.life[idx] = life * (0.6 + Math.random() * 0.7);
      this.maxLife[idx] = this.life[idx];
      this.scl[idx] = size * (0.6 + Math.random() * 0.8);
    }
  };
  ParticlePool.prototype.update = function (dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.scl[i] = 0; continue; }
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= dt * 2.4;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.scl[i] = Math.max(0, this.scl[i] * (0.985 + 0.015 * k));
      if (this.life[i] <= 0) this.scl[i] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.scale.needsUpdate = true;
  };

  FX.pool = null;
  FX.ensurePool = function () {
    if (!FX.pool) FX.pool = new ParticlePool(1200);
    return FX.pool;
  };

  /* ---------------- 爆炸 / 冲击 ---------------- */
  FX.explode = function (pos, color, scale) {
    const p = FX.ensurePool();
    p.emit(pos.x, pos.y, pos.z, color, Math.round(22 * (scale || 1)), 4.2 * (scale || 1), 0.9, 0.75);
    const flash = new T.Sprite(new T.SpriteMaterial({
      map: RT.Art.getTextures(RT.DATA.MAPS[0].theme).glowWhite,
      color: new T.Color(color), transparent: true, opacity: 0.9,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    flash.position.copy(pos);
    const s = 2.4 * (scale || 1);
    flash.scale.set(s, s, 1);
    FX.scene.add(flash);
    FX.items.push({ obj: flash, t: 0, life: 0.42, kind: 'flash', s: s });
  };

  FX.hitSpark = function (pos, color) {
    const p = FX.ensurePool();
    p.emit(pos.x, pos.y, pos.z, color, 6, 3.0, 0.45, 0.32);
  };

  FX.ring = function (pos, color, maxR, life, flat) {
    const geo = new T.RingGeometry(0.5, 0.62, 40);
    const mat = new T.MeshBasicMaterial({
      color: new T.Color(color), transparent: true, opacity: 0.85,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
    const m = new T.Mesh(geo, mat);
    m.position.copy(pos);
    if (flat !== false) m.rotation.x = -Math.PI / 2;
    FX.scene.add(m);
    FX.items.push({ obj: m, t: 0, life: life || 0.7, kind: 'ring', maxR: maxR || 3 });
  };

  /* ---------------- 弹道 ---------------- */
  FX.projectile = function (from, to, color, speed, onHit, opts) {
    opts = opts || {};
    const geo = opts.big ? new T.SphereGeometry(0.2, 10, 8) : new T.SphereGeometry(0.11, 8, 6);
    const mat = new T.MeshBasicMaterial({ color: new T.Color(color), transparent: true, opacity: 0.98 });
    const m = new T.Mesh(geo, mat);
    m.position.copy(from);
    const trail = opts.trail !== false;
    FX.scene.add(m);
    const it = {
      obj: m, from: from.clone(), to: to.clone(), speed: speed || 22, onHit: onHit,
      t: 0, dist: from.distanceTo(to), kind: 'proj', trail: trail, color: color
    };
    FX.items.push(it);
    return it;
  };

  FX.beam = function (from, to, color, life, width) {
    const len = from.distanceTo(to);
    const geo = new T.CylinderGeometry(width || 0.06, width || 0.06, len, 6, 1, true);
    geo.translate(0, len / 2, 0);
    const mat = new T.MeshBasicMaterial({
      color: new T.Color(color), transparent: true, opacity: 0.9,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
    const m = new T.Mesh(geo, mat);
    m.position.copy(from);
    m.lookAt(to);
    m.rotateX(Math.PI / 2);
    FX.scene.add(m);
    FX.items.push({ obj: m, t: 0, life: life || 0.18, kind: 'beam' });
    return m;
  };

  FX.shieldBubble = function (pos, color, radius, life) {
    const m = new T.Mesh(new T.SphereGeometry(radius, 16, 12), new T.MeshBasicMaterial({
      color: new T.Color(color), transparent: true, opacity: 0.3,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    }));
    m.position.copy(pos);
    FX.scene.add(m);
    FX.items.push({ obj: m, t: 0, life: life || 0.4, kind: 'bubble' });
  };

  /* ---------------- 更新 ---------------- */
  FX.update = function (dt, camera) {
    const p = FX.ensurePool();
    p.update(dt);
    for (let i = FX.items.length - 1; i >= 0; i--) {
      const it = FX.items[i];
      it.t += dt;
      const k = it.t / it.life;
      if (it.kind === 'proj') {
        const d = it.speed * dt;
        const total = it.dist || 1;
        const prog = Math.min(1, (it.obj.position.distanceTo(it.from) + d) / total);
        const target = it.to.clone().lerp(it.from, 1 - prog);
        it.obj.position.lerp(target, 0.55);
        if (it.trail) {
          p.emit(it.obj.position.x, it.obj.position.y, it.obj.position.z, it.color, 1, 0.6, 0.35, 0.22);
        }
        if (prog >= 0.995 || it.t > 3) {
          if (it.onHit) it.onHit(it.obj.position);
          FX.scene.remove(it.obj);
          it.obj.geometry.dispose && it.obj.geometry.dispose();
          FX.items.splice(i, 1);
        }
      } else if (it.kind === 'flash') {
        const s = it.s * (0.6 + k * 1.8);
        it.obj.scale.set(s, s, 1);
        it.obj.material.opacity = Math.max(0, 0.9 * (1 - k));
        if (k >= 1) { FX.scene.remove(it.obj); FX.items.splice(i, 1); }
      } else if (it.kind === 'ring') {
        const s = 0.6 + k * it.maxR;
        it.obj.scale.set(s, s, s);
        it.obj.material.opacity = Math.max(0, 0.85 * (1 - k));
        if (k >= 1) { FX.scene.remove(it.obj); FX.items.splice(i, 1); }
      } else if (it.kind === 'beam' || it.kind === 'bubble') {
        it.obj.material.opacity = Math.max(0, (it.kind === 'bubble' ? 0.3 : 0.9) * (1 - k));
        if (it.kind === 'bubble') it.obj.scale.setScalar(1 + k * 0.4);
        if (k >= 1) { FX.scene.remove(it.obj); FX.items.splice(i, 1); }
      }
    }
    // 标签
    for (let i = FX.labels.length - 1; i >= 0; i--) {
      const l = FX.labels[i];
      l.t += dt;
      l.sp.position.y = l.base + l.vy * l.t;
      l.sp.material.opacity = l.t > l.life - 0.7 ? Math.max(0, (l.life - l.t) / 0.7) : 1;
      if (l.t >= l.life) { FX.scene.remove(l.sp); FX.labels.splice(i, 1); }
    }
  };

  FX.clear = function () {
    FX.items.forEach((it) => FX.scene.remove(it.obj));
    FX.items.length = 0;
    FX.labels.forEach((l) => FX.scene.remove(l.sp));
    FX.labels.length = 0;
  };

  RT.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
