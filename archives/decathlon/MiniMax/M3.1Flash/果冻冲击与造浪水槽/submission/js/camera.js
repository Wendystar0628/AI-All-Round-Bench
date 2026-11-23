/* camera.js — orbit camera with cinematic overrides. */
(function (global) {
  'use strict';
  const U = global.U;

  class Camera {
    constructor() {
      this.target = new Float32Array([0, 0.22, 0]);
      this.azimuth = -0.72;
      this.elevation = 0.34;
      this.distance = 2.15;
      this.fov = 0.60;
      this.near = 0.03;
      this.far = 60;
      this.up = new Float32Array([0, 1, 0]);
      this.pos = new Float32Array(3);
      this.cinematic = false;
      this._view = U.M4.create();
      this._proj = U.M4.create();
      this._vp = U.M4.create();
      this._ivp = U.M4.create();
      this.update(0);
    }

    setOrbit(target, azimuth, elevation, distance) {
      this.target.set(target);
      this.azimuth = azimuth; this.elevation = elevation; this.distance = distance;
      this.cinematic = false;
      this.update(0);
    }

    setPose(px, py, pz, tx, ty, tz) {
      this.pos[0] = px; this.pos[1] = py; this.pos[2] = pz;
      this._posOverride = [px, py, pz, tx, ty, tz];
      this.cinematic = true;
      this.update(0);
    }

    update(dt) {
      if (this.cinematic && this._posOverride) {
        const o = this._posOverride;
        this.pos[0] = o[0]; this.pos[1] = o[1]; this.pos[2] = o[2];
        this.target[0] = o[3]; this.target[1] = o[4]; this.target[2] = o[5];
      } else {
        const ce = Math.cos(this.elevation), se = Math.sin(this.elevation);
        this.pos[0] = this.target[0] + Math.sin(this.azimuth) * ce * this.distance;
        this.pos[1] = this.target[1] + se * this.distance;
        this.pos[2] = this.target[2] + Math.cos(this.azimuth) * ce * this.distance;
      }
    }

    matrices(aspect) {
      U.M4.lookAt(this._view, this.pos, this.target, this.up);
      U.M4.perspective(this._proj, this.fov, aspect, this.near, this.far);
      U.M4.multiply(this._vp, this._proj, this._view);
      U.M4.invert(this._ivp, this._vp);
      return { view: this._view, proj: this._proj, viewProj: this._vp, invViewProj: this._ivp };
    }
  }

  global.Camera = Camera;
})(window);
