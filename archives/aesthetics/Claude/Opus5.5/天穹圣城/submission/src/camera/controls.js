import * as THREE from 'three';

const _v = new THREE.Vector3();
const _off = new THREE.Vector3();

function smoother(u) { return u * u * u * (u * (u * 6 - 15) + 10); }

// Orbit-style viewer with per-viewpoint limits, damping, pan bounds and collision push-out.
export class ViewControls {
  constructor(camera, dom, collider = null) {
    this.camera = camera; this.dom = dom; this.collider = collider;
    this.target = new THREE.Vector3(); this.goalTarget = new THREE.Vector3();
    this.r = 100; this.phi = 1.2; this.theta = 0;
    this.gr = 100; this.gphi = 1.2; this.gtheta = 0;
    this.lim = { minR: 10, maxR: 1000, minPhi: 0.2, maxPhi: 1.6, minTheta: -Infinity, maxTheta: Infinity, panCenter: new THREE.Vector3(), panRadius: 50 };
    this.enabled = true;
    this.flight = null;
    this.onFlightEnd = null;
    this._drag = null;
    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      el.setPointerCapture(e.pointerId);
      this._drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey, id: e.pointerId };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this._drag || !this.enabled || this.flight) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      const h = el.clientHeight || 800;
      if (this._drag.pan) this._pan(dx, dy, h);
      else {
        this.gtheta -= dx / h * 2.6;
        this.gphi -= dy / h * 2.2;
        this._clampGoal();
      }
    });
    const end = (e) => { if (this._drag && this._drag.id === e.pointerId) this._drag = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      if (!this.enabled || this.flight) return;
      e.preventDefault();
      const k = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0016);
      this.gr *= k; this._clampGoal();
    }, { passive: false });
  }

  _pan(dx, dy, h) {
    const cam = this.camera;
    const right = _v.set(1, 0, 0).applyQuaternion(cam.quaternion); right.y = 0; right.normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    const s = this.r * 1.1 / h;
    // drag right moves scene right -> target moves left
    this.goalTarget.addScaledVector(right, -dx * s);
    // vertical drag: mostly move along view-forward on ground plane, plus some height when looking flat
    const up = Math.abs(fwd.y) < 0.5;
    if (up) this.goalTarget.y += dy * s * 0.8; else this.goalTarget.addScaledVector(flat, dy * s);
    this._clampGoal();
  }

  _clampGoal() {
    const L = this.lim;
    this.gr = THREE.MathUtils.clamp(this.gr, L.minR, L.maxR);
    this.gphi = THREE.MathUtils.clamp(this.gphi, L.minPhi, L.maxPhi);
    if (isFinite(L.minTheta)) {
      // keep theta continuous near the allowed window
      this.gtheta = THREE.MathUtils.clamp(this.gtheta, L.minTheta, L.maxTheta);
    }
    _off.subVectors(this.goalTarget, L.panCenter);
    const pr = L.panRadius;
    if (_off.length() > pr) { _off.setLength(pr); this.goalTarget.copy(L.panCenter).add(_off); }
  }

  // set view immediately
  setView(target, position, limits) {
    if (limits) Object.assign(this.lim, limits, { panCenter: (limits.panCenter || target).clone() });
    this.target.copy(target); this.goalTarget.copy(target);
    _off.subVectors(position, target);
    this.r = _off.length();
    this.phi = Math.acos(THREE.MathUtils.clamp(_off.y / this.r, -1, 1));
    this.theta = Math.atan2(_off.x, _off.z);
    if (isFinite(this.lim.minTheta)) {
      // unwrap theta near window center
      const mid = (this.lim.minTheta + this.lim.maxTheta) / 2;
      while (this.theta - mid > Math.PI) this.theta -= Math.PI * 2;
      while (this.theta - mid < -Math.PI) this.theta += Math.PI * 2;
    }
    this.gr = this.r; this.gphi = this.phi; this.gtheta = this.theta;
    this._clampGoal();
    this.r = this.gr; this.phi = this.gphi; this.theta = this.gtheta;
    this._apply();
  }

  flyTo(target, position, limits, duration = 2.5) {
    const cam = this.camera;
    const p0 = cam.position.clone(), t0 = this.target.clone();
    const p1 = position.clone(), t1 = target.clone();
    const dist = p0.distanceTo(p1);
    // raised control point to arc over the islands
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const lift = Math.min(dist * 0.32, 600);
    const ctrl = mid.clone(); ctrl.y = Math.max(p0.y, p1.y) + lift;
    // push control point away from the main island axis if path crosses it
    const hz = new THREE.Vector2(mid.x, mid.z);
    if (hz.length() < 260) { const d = hz.lengthSq() > 1 ? hz.normalize() : new THREE.Vector2(0, 1); ctrl.x += d.x * (260 - mid.length() * 0.2); ctrl.z += d.y * (260 - mid.length() * 0.2); }
    this.flight = { p0, t0, p1, t1, ctrl, dur: duration, el: 0, limits };
  }

  update(dt) {
    if (this.flight) {
      const f = this.flight; f.el += dt;
      const u = Math.min(1, f.el / f.dur); const e = smoother(u);
      const a = 1 - e;
      const pos = new THREE.Vector3()
        .addScaledVector(f.p0, a * a).addScaledVector(f.ctrl, 2 * a * e).addScaledVector(f.p1, e * e);
      const te = smoother(Math.min(1, u * 1.15));
      const tgt = f.t0.clone().lerp(f.t1, te);
      this.camera.position.copy(pos);
      this.camera.lookAt(tgt);
      this.target.copy(tgt);
      if (u >= 1) {
        this.flight = null;
        this.setView(f.t1, f.p1, f.limits);
        if (this.onFlightEnd) this.onFlightEnd();
      }
      return;
    }
    const k = 1 - Math.exp(-dt * 7.5);
    this.r += (this.gr - this.r) * k;
    this.phi += (this.gphi - this.phi) * k;
    this.theta += (this.gtheta - this.theta) * k;
    this.target.lerp(this.goalTarget, k);
    this._apply();
  }

  _apply() {
    const sp = Math.sin(this.phi);
    _off.set(sp * Math.sin(this.theta), Math.cos(this.phi), sp * Math.cos(this.theta)).multiplyScalar(this.r);
    const pos = _v.copy(this.target).add(_off);
    if (this.collider) {
      const fixed = this.collider.resolve(this.target, pos);
      if (fixed) pos.copy(fixed);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }
}
