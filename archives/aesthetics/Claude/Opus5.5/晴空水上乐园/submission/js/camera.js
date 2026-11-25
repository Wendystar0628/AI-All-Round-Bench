'use strict';
/* ==========================================================================
   Camera: orbit / look-around controls per viewpoint, smooth flights,
   collision push-out
   ========================================================================== */
(function () {
  const P = window.P;
  const C = (P.Cam = {});
  const v3 = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);

  C.views = [];
  C.addView = function (o) { C.views.push(o); return o; };
  C.current = 0;

  // orbit state
  const st = { target: v3(), az: 0, el: 0.4, dist: 100, fov: 40 };
  const goal = { target: v3(), az: 0, el: 0.4, dist: 100, fov: 40 };
  // look state
  const lk = { pos: v3(), yaw: 0, pitch: 0, fov: 50 };
  const lkGoal = { yaw: 0, pitch: 0, fov: 50 };
  let mode = 'orbit';
  let lim = null;
  let flight = null;
  C.state = st; C.goal = goal;

  function orbitPos(s, out) {
    const ce = Math.cos(s.el);
    return out.set(s.target.x + s.dist * Math.sin(s.az) * ce, s.target.y + s.dist * Math.sin(s.el), s.target.z + s.dist * Math.cos(s.az) * ce);
  }
  function lookDir(yaw, pitch, out) {
    return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }
  C.orbitPos = orbitPos;

  P.solidAt = function (x, y, z) {
    const ix = Math.floor(x / P.V), iy = Math.floor(y / P.V), iz = Math.floor(z / P.V);
    const m = P.world.get(ix, iy, iz);
    if (m) return m !== 255 && P.pal.cls[m] === 1;
    return iy < P.terrain.h(ix, iz);
  };

  // view endpoint (camera position + look point + fov)
  function viewEnd(v, outP, outL) {
    if (v.look) {
      outP.set(v.pos[0], v.pos[1], v.pos[2]);
      lookDir(v.yaw, v.pitch, outL).multiplyScalar(30).add(outP);
      return v.fov || 50;
    }
    const s = { target: v3(v.t[0], v.t[1], v.t[2]), az: v.az, el: v.el, dist: v.d };
    orbitPos(s, outP);
    outL.copy(s.target);
    return v.fov || 40;
  }

  const curP = v3(), curL = v3();
  C.go = function (i, instant) {
    const v = C.views[i];
    if (!v) return;
    C.current = i;
    lim = v;
    const P1 = v3(), L1 = v3();
    const fov1 = viewEnd(v, P1, L1);
    if (instant || !C.camera) {
      setMode(v);
      flight = null;
    } else {
      const P0 = C.camera.position.clone();
      const L0 = curL.clone();
      const span = P0.distanceTo(P1);
      const dur = P.clamp(1.7 + Math.sqrt(span) * 0.11, 1.9, 4.4);
      const lift = P.clamp(span * 0.22, 0, 90);
      flight = { P0, L0, P1, L1, fov0: C.camera.fov, fov1, t: 0, dur, lift, v };
    }
    if (C.onView) C.onView(i);
  };
  function setMode(v) {
    if (v.look) {
      mode = 'look';
      lk.pos.set(v.pos[0], v.pos[1], v.pos[2]);
      lk.yaw = lkGoal.yaw = v.yaw; lk.pitch = lkGoal.pitch = v.pitch; lk.fov = lkGoal.fov = v.fov || 50;
    } else {
      mode = 'orbit';
      st.target.set(v.t[0], v.t[1], v.t[2]); goal.target.copy(st.target);
      st.az = goal.az = v.az; st.el = goal.el = v.el; st.dist = goal.dist = v.d;
      st.fov = goal.fov = v.fov || 40;
    }
  }

  C.init = function (canvas, camera) {
    C.camera = camera;
    C.canvas = canvas;
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (P.exportMode) return;
      drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey };
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { }
      if (flight) { // abort flight: settle at current position into target mode
        setMode(flight.v); flight = null;
      }
    });
    const up = (e) => { drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch (er) { } };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || P.exportMode) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const h = canvas.clientHeight || 800;
      if (mode === 'look') {
        lkGoal.yaw -= dx / h * 1.6;
        lkGoal.pitch = P.clamp(lkGoal.pitch + dy / h * 1.2, -1.3, 0.35);
        return;
      }
      if (drag.b === 0 && !drag.shift) {
        goal.az -= dx / h * 2.6;
        goal.el += dy / h * 1.8;
      } else {
        const s = goal.dist * Math.tan((st.fov * Math.PI) / 360) * 2 / h;
        const ca = Math.cos(goal.az), sa = Math.sin(goal.az);
        goal.target.x += (-ca * dx - sa * dy) * s;
        goal.target.z += (sa * dx - ca * dy) * s;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      if (P.exportMode) return;
      e.preventDefault();
      if (flight) { setMode(flight.v); flight = null; }
      if (mode === 'look') lkGoal.fov = P.clamp(lkGoal.fov * Math.exp(e.deltaY * 0.0009), 22, 70);
      else goal.dist *= Math.exp(e.deltaY * 0.0011);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    C.go(0, true);
  };

  const tmp = v3(), tmp2 = v3(), tmp3 = v3();
  function bez(a, b, c, d, t, out) {
    const u = 1 - t;
    return out.set(
      u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
      u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z);
  }
  // keep the camera out of solids: if the desired point is inside/too close to geometry,
  // slide it toward the orbit target until it is free (occluders in between are allowed)
  function solidNear(x, y, z) {
    const r = 0.45;
    if (P.solidAt(x, y, z)) return true;
    return P.solidAt(x + r, y, z) || P.solidAt(x - r, y, z) || P.solidAt(x, y + r, z) || P.solidAt(x, y - r, z) || P.solidAt(x, y, z + r) || P.solidAt(x, y, z - r);
  }
  C.solidNear = solidNear;
  function unblock(from, to, out) {
    if (!solidNear(to.x, to.y, to.z)) return out.copy(to);
    const dir = tmp3.copy(from).sub(to);
    const L = dir.length();
    if (L < 1e-3) return out.copy(to);
    dir.multiplyScalar(1 / L);
    for (let s = 0.4; s <= L; s += 0.4) {
      const x = to.x + dir.x * s, y = to.y + dir.y * s, z = to.z + dir.z * s;
      if (!solidNear(x, y, z)) return out.set(x + dir.x * 0.3, y + dir.y * 0.3, z + dir.z * 0.3);
    }
    return out.copy(to);
  }

  C.update = function (t, dt, exporting) {
    const cam = C.camera;
    if (exporting) return; // tour drives the camera
    if (flight) {
      flight.t += dt;
      const u = P.clamp(flight.t / flight.dur, 0, 1);
      const e = P.easeInOutQ(u);
      const f = flight;
      tmp.copy(f.P0); tmp.y += f.lift;
      tmp2.copy(f.P1); tmp2.y += f.lift;
      bez(f.P0, tmp, tmp2, f.P1, e, cam.position);
      curL.lerpVectors(f.L0, f.L1, P.easeInOut(u));
      cam.fov = f.fov0 + (f.fov1 - f.fov0) * e;
      const gy = P.groundY(cam.position.x, cam.position.z);
      if (cam.position.y < gy + 1.5) cam.position.y = gy + 1.5;
      cam.up.set(0, 1, 0);
      cam.lookAt(curL);
      C.nearHint = 0.4;
      if (u >= 1) { setMode(f.v); flight = null; }
      return;
    }
    if (mode === 'look') {
      const k = 1 - Math.exp(-dt * 8);
      lk.yaw += (lkGoal.yaw - lk.yaw) * k;
      lk.pitch += (lkGoal.pitch - lk.pitch) * k;
      lk.fov += (lkGoal.fov - lk.fov) * k;
      cam.position.copy(lk.pos);
      lookDir(lk.yaw, lk.pitch, tmp).add(lk.pos);
      curL.copy(tmp);
      cam.fov = lk.fov;
      cam.up.set(0, 1, 0);
      cam.lookAt(tmp);
      C.nearHint = 0.15;
      return;
    }
    if (lim) {
      goal.dist = P.clamp(goal.dist, lim.dmin, lim.dmax);
      goal.el = P.clamp(goal.el, lim.emin, lim.emax);
      if (lim.box) {
        const b = lim.box;
        goal.target.x = P.clamp(goal.target.x, b[0], b[3]);
        goal.target.y = P.clamp(goal.target.y, b[1], b[4]);
        goal.target.z = P.clamp(goal.target.z, b[2], b[5]);
      }
    }
    const k = 1 - Math.exp(-dt * 7);
    st.target.lerp(goal.target, k);
    st.az += (goal.az - st.az) * k;
    st.el += (goal.el - st.el) * k;
    st.dist += (goal.dist - st.dist) * k;
    orbitPos(st, tmp);
    unblock(st.target, tmp, tmp2);
    const gy = P.groundY(tmp2.x, tmp2.z);
    if (tmp2.y < gy + 1.2) tmp2.y = gy + 1.2;
    cam.position.copy(tmp2);
    cam.up.set(0, 1, 0);
    cam.lookAt(st.target);
    curL.copy(st.target);
    cam.fov = st.fov;
    C.nearHint = P.clamp(cam.position.distanceTo(st.target) * 0.01, 0.1, 2.5);
  };
  C.isFlying = () => !!flight;
})();
