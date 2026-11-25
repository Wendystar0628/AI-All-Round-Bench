/* viewpoints, orbit controls with collision, transitions, switcher UI */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3;
  const PI = Math.PI;

  // name, target, yaw, pitch, dist, fov, limits
  const L = W.L;
  const VIEWS = [
    { id: 'all', name: '全景', group: 0, t: [-0.4, 2.0, 0.2], yaw: 0.0, pitch: 0.56, dist: 68, fov: 34, dMin: 26, dMax: 110, pMin: 0.08, pMax: 1.35, pan: 10 },
    { id: 'section', name: '底座剖面', group: 0, t: [0.0, -1.3, 16.9], yaw: 0.35, pitch: 0.06, dist: 15, fov: 36, dMin: 5, dMax: 34, pMin: -0.3, pMax: 0.9, pan: 8 },
    { id: 'torii', name: '鸟居与参道', group: 1, t: [L.SANDO_X, 1.9, 9.6], yaw: 0.0, pitch: 0.28, dist: 12.5, fov: 40, dMin: 4, dMax: 26, pMin: 0.02, pMax: 1.2, pan: 6 },
    { id: 'temizu', name: '手水舍', group: 1, t: [6.2, 4.5, -8.6], yaw: -0.15, pitch: 0.3, dist: 7.5, fov: 38, dMin: 1.6, dMax: 12, pMin: 0.05, pMax: 1.25, pan: 2 },
    { id: 'shrine', name: '社殿', group: 1, t: [L.SANDO_X, 4.5, -10.0], yaw: 0.0, pitch: 0.18, dist: 10.5, fov: 38, dMin: 2.5, dMax: 20, pMin: 0.0, pMax: 1.2, pan: 4 },
    { id: 'inari', name: '稻荷小祠', group: 1, t: [14.0, 4.0, -11.9], yaw: 0.3, pitch: 0.75, dist: 8.0, fov: 40, dMin: 2, dMax: 14, pMin: 0.05, pMax: 1.25, pan: 3 },
    { id: 'ginkgo', name: '御神木与红毡长凳', group: 2, t: [-0.6, 4.2, -4.6], yaw: 0.12, pitch: 0.2, dist: 14.5, fov: 40, dMin: 3, dMax: 28, pMin: -0.05, pMax: 1.2, pan: 5 },
    { id: 'stream', name: '溪、小桥与枯山水', group: 2, t: [-2.4, 0.5, 5.0], yaw: 0.05, pitch: 0.75, dist: 15, fov: 40, dMin: 3, dMax: 26, pMin: 0.05, pMax: 1.3, pan: 5 },
    { id: 'gate', name: '庭门、盆景架与菊花台', group: 2, t: [-10.2, 0.9, 8.6], yaw: 0.0, pitch: 0.82, dist: 18, fov: 40, dMin: 3, dMax: 28, pMin: 0.05, pMax: 1.3, pan: 6 },
    { id: 'pond', name: '甜点水池', group: 2, t: [0.0, 0.7, 11.6], yaw: 0.15, pitch: 0.62, dist: 13, fov: 38, dMin: 2.5, dMax: 26, pMin: 0.03, pMax: 1.4, pan: 4 },
    { id: 'engawa', name: '檐廊与花摊', group: 3, t: [-11.2, 2.3, -2.2], yaw: 0.15, pitch: 0.16, dist: 8.5, fov: 40, dMin: 2, dMax: 16, pMin: -0.1, pMax: 1.0, pan: 4 },
    { id: 'studio', name: '画室全貌', group: 3, t: [-11, 1.9, -6.8], yaw: 0.1, pitch: 0.98, dist: 13.5, fov: 40, dMin: 6, dMax: 26, pMin: 0.55, pMax: 1.45, pan: 3 },
    { id: 'orrery', name: '观星球', group: 3, t: [-11, 3.0, -7.2], yaw: 0.35, pitch: 0.12, dist: 3.4, fov: 42, dMin: 1.3, dMax: 4.6, pMin: -0.3, pMax: 1.2, pan: 0.6 },
    { id: 'paint', name: '画画的角落与茶席', group: 3, t: [-11.4, 1.95, -4.9], yaw: 0.5, pitch: 0.36, dist: 4.6, fov: 42, dMin: 1.4, dMax: 6.5, pMin: 0.0, pMax: 1.2, pan: 1.2 },
    { id: 'reading', name: '观星与读书的角落', group: 3, t: [-8.4, 2.3, -9.9], yaw: -0.55, pitch: 0.22, dist: 3.6, fov: 42, dMin: 1.2, dMax: 4.6, pMin: -0.1, pMax: 1.2, pan: 0.8 },
    { id: 'lookout', name: '从拉门内向外望', group: 3, t: [-10.4, 2.35, -2.6], yaw: PI + 0.35, pitch: 0.1, dist: 3.4, fov: 46, dMin: 1.2, dMax: 4.2, pMin: -0.15, pMax: 0.6, pan: 0.5, yawRange: 0.65 },
  ];
  W.VIEWS = VIEWS;

  // ---------- collision solids ----------
  const boxes = [];
  const box = (x0, y0, z0, x1, y1, z1) => boxes.push({ min: new V3(x0, y0, z0), max: new V3(x1, y1, z1) });
  const obbs = [];
  const obb = (c, half, rx, ry) => { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, 0, 'YXZ')); m.setPosition(c); obbs.push({ inv: m.clone().invert(), half: new V3(...half) }); };
  const spheres = [];
  function buildSolids() {
    // studio walls (studio occupies z -11 .. -3)
    box(-16.1, 1.2, -11.8, -5.9, 4.5, -10.85);
    box(-6.15, 1.2, -11.1, -5.88, 4.5, -2.9);
    box(-16.1, 1.2, -3.12, -12.05, 4.3, -2.9);
    box(-7.95, 1.2, -3.12, -5.9, 4.3, -2.9);
    box(-16.1, 3.25, -3.12, -5.9, 4.35, -2.9);
    box(-16.1, 0.0, -11.2, -4.5, 1.5, -1.15);
    const ri = W.roofInfo;
    obb(new V3(ri.cx, (ri.ridgeY + 3.74) / 2 + 0.1, (ri.ridgeZ + ri.eaveZ) / 2), [ri.width / 2 + 0.1, 0.35, ri.slopeLen / 2 + 0.15], -ri.pitch, 0);
    obb(new V3(-10.3, 3.85, -2.0), [5.9, 0.25, 1.15], -0.32, 0);
    obb(new V3(-5.25, 3.85, -6.3), [0.9, 0.25, 5.4], 0, 0);
    // sanctuary, temizuya, gate, torii, ginkgo trunk, sake shelter
    const S = L.SHRINE;
    box(S.x - 2.0, 3.2, S.z - 2.0, S.x + 2.0, 8.6, S.z + 1.0);
    box(S.x - 2.4, 6.0, S.z + 0.8, S.x + 2.4, 8.0, S.z + 2.4);
    box(4.3, 5.4, -8.8, 6.9, 6.4, -6.6);
    box(L.GATE_X - 1.4, 2.2, 15.2, L.GATE_X + 1.4, 3.1, 16.3);
    box(L.TORII.x - 2.3, 3.4, L.TORII.z - 0.3, L.TORII.x + 2.3, 4.6, L.TORII.z + 0.3);
    box(L.GINKGO.x - 0.95, 3.0, L.GINKGO.z - 0.95, L.GINKGO.x + 0.95, 7.6, L.GINKGO.z + 0.95);
    box(5.2, 3.2, -15.1, 7.3, 5.6, -11.5);
    // stone stair block (stepped boxes)
    for (let z = L.TERR_Z; z < L.STAIR_Z0; z += 2.0) box(L.STAIR_X0 - 0.45, -0.5, z, L.STAIR_X1 + 0.45, W.stairY(z) + 0.3, Math.min(L.STAIR_Z0, z + 2.0));
    // tree canopies
    (W.treeList || []).forEach((t) => {
      if (!t.clusters || !t.clusters.length || t.kind === 'pine' || t.kind === 'persimmon') return;
      const c = new V3(); t.clusters.forEach((q) => c.add(q.c)); c.multiplyScalar(1 / t.clusters.length);
      let r = 0; t.clusters.forEach((q) => { r = Math.max(r, q.c.distanceTo(c) + q.r * 0.6); });
      spheres.push({ c, r: r * 0.85 });
    });
    (W.treeList || []).filter((t) => t.kind === 'sugi').forEach((t) => spheres.push({ c: new V3(t.x, t.y + t.h * 0.6, t.z), r: 1.6 }));
  }
  W.camSolids = { boxes, obbs, spheres };

  function rayBox(o, d, mn, mx, tmax) {
    let t0 = 0, t1 = tmax;
    for (let i = 0; i < 3; i++) {
      const a = i === 0 ? 'x' : i === 1 ? 'y' : 'z';
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return Infinity; continue; }
      let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return Infinity;
    }
    return t0 > 0 ? t0 : (t1 > 0 ? 0 : Infinity);
  }
  const _o = new V3(), _d = new V3(), _lo = new V3(), _ld = new V3();
  function castDist(origin, dir, maxD) {
    let best = maxD;
    for (const b of boxes) { const t = rayBox(origin, dir, b.min, b.max, best); if (t < best) best = t; }
    for (const b of obbs) {
      _lo.copy(origin).applyMatrix4(b.inv); _ld.copy(dir).transformDirection(b.inv);
      const t = rayBox(_lo, _ld, _o.set(-b.half.x, -b.half.y, -b.half.z), _d.set(b.half.x, b.half.y, b.half.z), best);
      if (t < best) best = t;
    }
    for (const s of spheres) {
      const oc = _o.copy(origin).sub(s.c); const bq = oc.dot(dir); const cq = oc.lengthSq() - s.r * s.r;
      if (cq < 0) continue; // origin inside canopy: ignore
      const disc = bq * bq - cq; if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc); if (t > 0 && t < best) best = t;
    }
    // terrain / base block
    const steps = Math.ceil(best / 0.25);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * best;
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (Math.abs(x) < 16.35 && Math.abs(z) < 16.35) {
        let h = Math.abs(x) < 16 && Math.abs(z) < 16 ? W.H(x, z) + 0.3 : 0.2;
        if (Math.hypot(x - W.L.POND.x, z - W.L.POND.z) < W.L.POND.r + 0.1) h = Math.max(W.WATER_Y + 0.25, 0.6 - 0.0);
        if (y < h && y > -4.75) { best = Math.max(0, t - 0.25); break; }
      }
    }
    return best;
  }
  W.castDist = castDist;

  // ---------- controller ----------
  const S = { target: new V3(), yaw: 0, pitch: 0, dist: 10, fov: 38, armDist: 10 };
  const G = { target: new V3(), yaw: 0, pitch: 0, dist: 10, fov: 38 };
  let view = VIEWS[0], viewIndex = 0;
  let trans = null;
  const cam = (W.cam = {});
  cam.S = S; cam.G = G;

  function applyView(v, instant) {
    view = v; viewIndex = VIEWS.indexOf(v);
    G.target.set(...v.t); G.yaw = v.yaw; G.pitch = v.pitch; G.dist = v.dist; G.fov = v.fov;
    if (instant) { S.target.copy(G.target); S.yaw = G.yaw; S.pitch = G.pitch; S.dist = G.dist; S.fov = G.fov; S.armDist = G.dist; trans = null; }
    updateUI();
  }
  cam.go = function (i) {
    const v = VIEWS[(i + VIEWS.length) % VIEWS.length];
    if (v === view && !trans) return;
    const from = { target: S.target.clone(), yaw: S.yaw, pitch: S.pitch, dist: S.armDist, fov: S.fov };
    // shortest yaw
    let dy = v.yaw - from.yaw; dy = ((dy + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;
    const sep = from.target.distanceTo(new V3(...v.t));
    trans = { from, to: v, dyaw: dy, t: 0, dur: W.clamp(1.6 + sep * 0.05, 1.8, 3.4), lift: W.clamp(sep * 0.45, 0, 18) };
    view = v; viewIndex = VIEWS.indexOf(v);
    updateUI();
  };
  cam.current = () => viewIndex;

  function posFrom(target, yaw, pitch, dist) {
    const cp = Math.cos(pitch);
    return new V3(target.x + Math.sin(yaw) * cp * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * cp * dist);
  }
  cam.posFrom = posFrom;

  cam.update = function (dt) {
    const c = W.render.camera;
    if (trans) {
      trans.t += dt / trans.dur;
      const k = W.ease(Math.min(1, trans.t));
      const f = trans.from, v = trans.to;
      S.target.lerpVectors(f.target, new V3(...v.t), k);
      S.yaw = f.yaw + trans.dyaw * k;
      S.pitch = W.lerp(f.pitch, v.pitch, k) + Math.sin(k * PI) * 0.18 * Math.min(1, trans.lift / 8);
      S.dist = Math.exp(W.lerp(Math.log(f.dist), Math.log(v.dist), k)) + Math.sin(k * PI) * trans.lift;
      S.fov = W.lerp(f.fov, v.fov, k);
      if (trans.t >= 1) { G.target.set(...v.t); G.yaw = S.yaw = v.yaw; G.pitch = v.pitch; G.dist = v.dist; G.fov = v.fov; trans = null; }
      S.armDist = S.dist;
    } else {
      const a = 1 - Math.exp(-dt * 7);
      S.target.lerp(G.target, a);
      S.yaw += (G.yaw - S.yaw) * a;
      S.pitch += (G.pitch - S.pitch) * a;
      S.dist += (G.dist - S.dist) * a;
      S.fov += (G.fov - S.fov) * a;
    }
    // collision arm
    const dir = posFrom(new V3(), S.yaw, S.pitch, 1).normalize();
    const hit = castDist(S.target, dir, S.dist);
    const want = Math.max(0.25, Math.min(S.dist, hit - 0.3));
    S.armDist = want < S.armDist ? want : S.armDist + (want - S.armDist) * (1 - Math.exp(-dt * 4));
    const p = S.target.clone().addScaledVector(dir, S.armDist);
    c.position.copy(p);
    c.up.set(0, 1, 0);
    c.lookAt(S.target);
    if (Math.abs(c.fov - S.fov) > 1e-3) { c.fov = S.fov; c.updateProjectionMatrix(); }
  };

  // ---------- input ----------
  function bindInput() {
    const el = document.getElementById('c');
    let drag = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (W.clock.exporting) return;
      el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey };
      el.classList.add('drag');
      if (trans) { trans = null; G.target.copy(S.target); G.yaw = S.yaw; G.pitch = S.pitch; G.dist = S.dist; G.fov = S.fov; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) {
        const s = G.dist * 0.0016;
        const right = new V3(Math.cos(G.yaw), 0, -Math.sin(G.yaw));
        const fwd = new V3(-Math.sin(G.yaw), 0, -Math.cos(G.yaw));
        G.target.addScaledVector(right, -dx * s).addScaledVector(new V3(0, 1, 0), dy * s * 0.6);
        const base = new V3(...view.t);
        const off = G.target.clone().sub(base);
        if (off.length() > view.pan) G.target.copy(base).addScaledVector(off.normalize(), view.pan);
      } else {
        G.yaw -= dx * 0.0055;
        G.pitch = W.clamp(G.pitch + dy * 0.0045, view.pMin, view.pMax);
        if (view.yawRange) {
          let d = G.yaw - view.yaw; d = ((d + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;
          G.yaw = view.yaw + W.clamp(d, -view.yawRange, view.yawRange);
        }
      }
    });
    const up = () => { drag = null; el.classList.remove('drag'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (W.clock.exporting) return;
      e.preventDefault();
      if (trans) { trans = null; G.target.copy(S.target); G.yaw = S.yaw; G.pitch = S.pitch; G.dist = S.dist; G.fov = S.fov; }
      G.dist = W.clamp(G.dist * Math.exp(e.deltaY * 0.0011), view.dMin, view.dMax);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (W.clock.exporting) return;
      if (e.key === 'ArrowRight' || e.key === ']') cam.go(viewIndex + 1);
      else if (e.key === 'ArrowLeft' || e.key === '[') cam.go(viewIndex - 1);
      else if (/^[0-9]$/.test(e.key)) { const n = e.key === '0' ? 9 : parseInt(e.key, 10) - 1; cam.go(n); }
      else if (e.key === 'Home') cam.go(0);
    });
  }

  // ---------- UI ----------
  let nav, label, dots = [];
  function buildUI() {
    nav = document.getElementById('nav');
    nav.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'nv-wrap';
    const prev = document.createElement('button'); prev.className = 'nv-arrow'; prev.textContent = '‹'; prev.title = '上一处 (←)';
    const next = document.createElement('button'); next.className = 'nv-arrow'; next.textContent = '›'; next.title = '下一处 (→)';
    label = document.createElement('div'); label.className = 'nv-label';
    const stars = document.createElement('div'); stars.className = 'nv-stars';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'nv-line'); svg.setAttribute('viewBox', '0 0 236 26');
    const pts = VIEWS.map((v, i) => { const x = 8 + i * 14.6 + (v.group * 0); const y = 13 + Math.sin(i * 1.7) * 6 + Math.cos(i * 0.6) * 2; return [x, y]; });
    const poly = document.createElementNS(svgNS, 'polyline'); poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    svg.appendChild(poly); stars.appendChild(svg);
    VIEWS.forEach((v, i) => {
      const b = document.createElement('button'); b.className = 'nv-dot'; b.style.left = pts[i][0] + 'px'; b.style.top = pts[i][1] + 'px';
      b.setAttribute('aria-label', v.name); b.dataset.name = v.name;
      b.addEventListener('click', () => cam.go(i));
      b.addEventListener('mouseenter', () => { label.textContent = v.name; label.classList.add('peek'); });
      b.addEventListener('mouseleave', () => { label.textContent = view.name; label.classList.remove('peek'); });
      stars.appendChild(b); dots.push(b);
    });
    prev.addEventListener('click', () => cam.go(viewIndex - 1));
    next.addEventListener('click', () => cam.go(viewIndex + 1));
    wrap.appendChild(label);
    const row = document.createElement('div'); row.className = 'nv-row';
    row.appendChild(prev); row.appendChild(stars); row.appendChild(next);
    wrap.appendChild(row);
    nav.appendChild(wrap);
  }
  function updateUI() {
    if (!label) return;
    label.textContent = view.name;
    dots.forEach((d, i) => d.classList.toggle('on', i === viewIndex));
  }
  cam.setUIVisible = (v) => { if (nav) nav.style.display = v ? '' : 'none'; };

  cam.init = function () {
    buildSolids();
    buildUI();
    bindInput();
    applyView(VIEWS[0], true);
    cam.update(0);
  };
  cam.snapshot = () => ({ target: S.target.clone(), yaw: S.yaw, pitch: S.pitch, dist: S.dist, fov: S.fov, view: viewIndex });
  cam.restore = (s) => { applyView(VIEWS[s.view], true); S.target.copy(s.target); G.target.copy(s.target); S.yaw = G.yaw = s.yaw; S.pitch = G.pitch = s.pitch; S.dist = G.dist = s.dist; S.armDist = s.dist; S.fov = G.fov = s.fov; };
})();
