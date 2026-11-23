/* ============ camera controls (orbit / pan / zoom) ============ */
(function () {
  const HB = (window.HB = window.HB || {});

  HB.controls = function (camera, dom) {
    const st = {
      az: Math.PI * 0.78, po: 0.62, dist: 46,
      tAz: Math.PI * 0.78, tPo: 0.62, tDist: 46,
      target: new THREE.Vector3(-1, -0.5, 2),
      tTarget: new THREE.Vector3(-1, -0.5, 2),
      enabled: true, damp: 0.12,
    };
    let dragging = 0, lx = 0, ly = 0;

    function apply() {
      st.az += (st.tAz - st.az) * st.damp;
      st.po += (st.tPo - st.po) * st.damp;
      st.dist += (st.tDist - st.dist) * st.damp;
      st.target.lerp(st.tTarget, st.damp);
      const cp = Math.cos(st.po), sp = Math.sin(st.po);
      camera.position.set(
        st.target.x + st.dist * cp * Math.sin(st.az),
        st.target.y + st.dist * sp,
        st.target.z + st.dist * cp * Math.cos(st.az)
      );
      camera.lookAt(st.target);
    }

    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    dom.addEventListener('pointerdown', function (e) {
      if (!st.enabled) return;
      dom.setPointerCapture(e.pointerId);
      dragging = (e.button === 2 || e.shiftKey) ? 2 : 1;
      lx = e.clientX; ly = e.clientY;
    });
    dom.addEventListener('pointerup', function (e) {
      dragging = 0;
      try { dom.releasePointerCapture(e.pointerId); } catch (err) { }
    });
    dom.addEventListener('pointermove', function (e) {
      if (!dragging || !st.enabled) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (dragging === 1) {
        st.tAz -= dx * 0.0055;
        st.tPo = Math.max(0.10, Math.min(1.45, st.tPo - dy * 0.0045));
      } else {
        const s = st.dist * 0.0016;
        const right = new THREE.Vector3(Math.cos(st.az), 0, -Math.sin(st.az));
        const fwd = new THREE.Vector3(Math.sin(st.az), 0, Math.cos(st.az));
        st.tTarget.addScaledVector(right, -dx * s);
        st.tTarget.addScaledVector(fwd, -dy * s * 0.7);
        st.tTarget.x = Math.max(-34, Math.min(34, st.tTarget.x));
        st.tTarget.z = Math.max(-34, Math.min(34, st.tTarget.z));
        st.tTarget.y = Math.max(-4, Math.min(6, st.tTarget.y));
      }
    });
    dom.addEventListener('wheel', function (e) {
      if (!st.enabled) return;
      e.preventDefault();
      const k = Math.exp(e.deltaY * 0.0012);
      st.tDist = Math.max(6, Math.min(140, st.tDist * k));
    }, { passive: false });

    st.apply = apply;
    st.set = function (az, po, dist, tx, ty, tz, instant) {
      st.tAz = az; st.tPo = po; st.tDist = dist;
      st.tTarget.set(tx, ty, tz);
      if (instant) {
        st.az = az; st.po = po; st.dist = dist; st.target.set(tx, ty, tz); apply();
      }
    };
    st.get = function () {
      return { az: st.az, po: st.po, dist: st.dist, target: st.target.clone() };
    };
    return st;
  };
})();
