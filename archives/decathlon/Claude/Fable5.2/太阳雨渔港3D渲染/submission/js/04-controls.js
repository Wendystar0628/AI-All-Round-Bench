/* mouse orbit controls: drag = rotate, right/middle/shift drag = pan, wheel = zoom towards the cursor */
(function () {
  'use strict';
  var H = window.H;
  var C = H.Controls = {
    target: new THREE.Vector3(0.5, 0.2, 2.5), theta: -0.70, phi: 1.03, dist: 108,
    gTarget: new THREE.Vector3(0.5, 0.2, 2.5), gTheta: -0.70, gPhi: 1.03, gDist: 108,
    enabled: true
  };
  var MIN_D = 1.4, MAX_D = 190, MIN_PHI = 0.10, MAX_PHI = 1.66;
  var dom, cam, mode = 0, lx = 0, ly = 0;
  var _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();

  function clampTarget(t) {
    t.x = H.clamp(t.x, -36, 36); t.z = H.clamp(t.z, -36, 36); t.y = H.clamp(t.y, -5.5, 14);
  }
  C.init = function (domEl, camera) {
    dom = domEl; cam = camera;
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    dom.addEventListener('pointerdown', function (e) {
      if (!C.enabled) return;
      mode = (e.button === 0 && !e.shiftKey && !e.ctrlKey) ? 1 : 2;
      lx = e.clientX; ly = e.clientY;
      try { dom.setPointerCapture(e.pointerId); } catch (err) { }
      e.preventDefault();
    });
    dom.addEventListener('pointermove', function (e) {
      if (!mode || !C.enabled) return;
      var dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      if (mode === 1) {
        C.gTheta -= dx * 0.0052; C.gPhi = H.clamp(C.gPhi - dy * 0.0045, MIN_PHI, MAX_PHI);
      } else {
        var k = C.gDist * Math.tan(cam.fov * Math.PI / 360) * 2 / dom.clientHeight;
        cam.updateMatrixWorld();
        _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1);
        C.gTarget.addScaledVector(_r, -dx * k).addScaledVector(_u, dy * k);
        clampTarget(C.gTarget);
      }
    });
    var up = function (e) { mode = 0; try { dom.releasePointerCapture(e.pointerId); } catch (err) { } };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', function (e) {
      if (!C.enabled) return;
      e.preventDefault();
      var dy = e.deltaY; if (e.deltaMode === 1) dy *= 32;
      var f = Math.exp(H.clamp(dy, -400, 400) * 0.0011);
      var nd = H.clamp(C.gDist * f, MIN_D, MAX_D); f = nd / C.gDist;
      // zoom towards the point under the cursor (on the plane through the target facing the camera)
      var rect = dom.getBoundingClientRect();
      var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1, ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      var th = Math.tan(cam.fov * Math.PI / 360);
      cam.updateMatrixWorld();
      _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1);
      _v.copy(C.gTarget).addScaledVector(_r, nx * th * cam.aspect * C.gDist).addScaledVector(_u, ny * th * C.gDist);
      C.gTarget.lerp(_v, 1 - f);
      clampTarget(C.gTarget);
      C.gDist = nd;
    }, { passive: false });
    dom.addEventListener('dblclick', function () {
      // back to the establishing view
      C.gTarget.set(0.5, 0.2, 2.5); C.gTheta = -0.70; C.gPhi = 1.03; C.gDist = 108;
    });
    C.apply();
  };
  C.apply = function () {
    var sp = Math.sin(C.phi), cp = Math.cos(C.phi);
    cam.position.set(C.target.x + C.dist * sp * Math.sin(C.theta), C.target.y + C.dist * cp, C.target.z + C.dist * sp * Math.cos(C.theta));
    cam.up.set(0, 1, 0);
    cam.lookAt(C.target);
    cam.near = H.clamp(C.dist * 0.035, 0.06, 1.2); cam.far = 620;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  };
  C.update = function (dt) {
    var k = 1 - Math.exp(-dt * 9.0);
    C.target.lerp(C.gTarget, k);
    C.theta += (C.gTheta - C.theta) * k; C.phi += (C.gPhi - C.phi) * k; C.dist += (C.gDist - C.dist) * k;
    C.apply();
  };
  C.snap = function () { C.target.copy(C.gTarget); C.theta = C.gTheta; C.phi = C.gPhi; C.dist = C.gDist; C.apply(); };
})();
