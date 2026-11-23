'use strict';
/* ==================================================================
   更新 / 绘制
   ================================================================== */
const _mm = new Float32Array(16);
const _lp = new Float32Array(32), _lc = new Float32Array(32);

function update(t) {
  STATE.t = t;
  updateCamera(t);
  STATE.room = roomAt(t);
  updateFleet(t);
  updateTurrets(t);
  updateSmallCraft(t);
  updateAsteroids(t);
  updateFX(t);
}

function setVoxCommon() {
  const u = renderer.progVox.u;
  gl.uniformMatrix4fv(u.uViewProj, false, cam.vp);
  gl.uniform3fv(u.uSunDir, SUN.dir);
  gl.uniform3fv(u.uSunColor, SUN.color);
  gl.uniform3fv(u.uSkyColor, SKYCOL);
  gl.uniform3fv(u.uGroundColor, GROUNDCOL);
  gl.uniform3fv(u.uRimDir, V3.norm([-0.62, 0.35, 0.7]));
  gl.uniform3fv(u.uRimColor, [0.55, 0.75, 1.15]);
  gl.uniform3fv(u.uCamPos, cam.pos);
  gl.uniform1f(u.uAmbient, STATE.room === 'reactor' ? 1.5 : STATE.room === 'ext' ? 0.95 : 2.0);
  gl.uniform1f(u.uEmissiveScale, 1.0);
  gl.uniform1f(u.uFogDensity, STATE.room === 'reactor' ? 0.0000006 : 0.0000010);
  gl.uniform3fv(u.uFogColor, FOGCOL);
  const n = Math.min(8, LIGHTS.length);
  for (let i = 0; i < 8; i++) {
    if (i < n) {
      const L = LIGHTS[i];
      _lp[i * 4] = L.p[0]; _lp[i * 4 + 1] = L.p[1]; _lp[i * 4 + 2] = L.p[2]; _lp[i * 4 + 3] = L.r;
      _lc[i * 4] = L.c[0]; _lc[i * 4 + 1] = L.c[1]; _lc[i * 4 + 2] = L.c[2]; _lc[i * 4 + 3] = L.i;
    } else { _lp[i * 4 + 3] = 0; _lc[i * 4 + 3] = 0; }
  }
  gl.uniform4fv(u.uLightPos, _lp);
  gl.uniform4fv(u.uLightCol, _lc);
  gl.uniform1i(u.uLightCount, n);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, renderer.paletteTex[0]);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, renderer.paletteTex[1]);
  gl.uniform1i(u.uPalA, 0);
  gl.uniform1i(u.uPalB, 1);
}

const _om = new Float32Array(16);
function drawVoxModel(model, matrix, emissiveScale) {
  const u = renderer.progVox.u;
  // 面数据存的是网格索引，补上体素网格原点偏移，回到模型局部坐标
  const g = model.grid;
  if (g && (g.ox || g.oy || g.oz)) {
    _om.set(matrix);
    _om[12] += matrix[0] * g.ox + matrix[4] * g.oy + matrix[8] * g.oz;
    _om[13] += matrix[1] * g.ox + matrix[5] * g.oy + matrix[9] * g.oz;
    _om[14] += matrix[2] * g.ox + matrix[6] * g.oy + matrix[10] * g.oz;
    matrix = _om;
  }
  gl.uniformMatrix4fv(u.uModel, false, matrix);
  gl.uniform1f(u.uEmissiveScale, emissiveScale === undefined ? 1 : emissiveScale);
  gl.bindVertexArray(model.mesh.vao);
  const ic = window.__maxInst ? Math.min(model.mesh.count, window.__maxInst) : model.mesh.count;
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, ic);
}

function drawWorld() {
  const room = STATE.room;
  for (const s of SCENE.ships) {
    if (s.far && room !== 'ext') continue;
    drawVoxModel(s.model, s.mat, 1);
  }
  for (const tr of SCENE.turrets) {
    modelMatrix(_mm, tr.pos, tr.quat, tr.center, 1);
    drawVoxModel(tr.model, _mm, 1);
  }
  // 近防炮：装在近卫舰的 ciws 挂点上（底座中心对准挂点，与 updateAttackFX 的炮口位置一致）
  const ciws = SCENE.models.ciws;
  for (const s of SCENE.ships) {
    if (!s.ciws || (s.far && room !== 'ext')) continue;
    for (const ci of s.ciws) {
      _mm.set(s.mat);
      const p = xf(s.mat, [ci.x - 18, ci.y, ci.z]);
      _mm[12] = p[0]; _mm[13] = p[1]; _mm[14] = p[2];
      drawVoxModel(ciws.model, _mm, 1);
    }
  }
  // 导弹：沿 updateAttackFX 的飞行弧线
  for (const ms of MISSILE_DRAW) {
    modelMatrix(_mm, ms.pos, ms.quat, SCENE.models.missile.center, 1);
    drawVoxModel(SCENE.models.missile.model, _mm, 1);
  }
  for (const c of SCENE.smallcraft) {
    modelMatrix(_mm, c.pos, c.quat, c.center, 1);
    drawVoxModel(c.model, _mm, 1);
  }
  for (const a of SCENE.asteroids) {
    if (a.dead) continue;
    modelMatrix(_mm, a.worldPos, a.rotNow, [0, 0, 0], a.scale);
    drawVoxModel(SCENE.models.asteroids[a.variant].model, _mm, 1);
  }
  for (const f of SCENE.frags) {
    modelMatrix(_mm, f.pos, f.quat, f.center, f.scale);
    drawVoxModel(f.model, _mm, 1);
  }
  // 舰桥内部
  modelMatrix(_mm, [605, 122, 0], Q.ident(), [0, 0, 0], 1);
  drawVoxModel(SCENE.models.bridge.model, _mm, 1);
}

function drawReactor() {
  const R = SCENE.models.reactor;
  const pulse = 1.0 + 0.18 * Math.sin(STATE.t * 1.7) + 0.08 * Math.sin(STATE.t * 4.3);
  const m = new Float32Array(16);
  modelMatrix(m, REACTOR_POS, Q.ident(), [0, 0, 0], 1);
  drawVoxModel(R.model, m, pulse);
  for (const ring of R.rings) {
    const q = Q.fromAxis([0, 1, 0], STATE.t * ring.speed * 2.2);
    modelMatrix(m, [REACTOR_POS[0], REACTOR_POS[1] + ring.y, REACTOR_POS[2]], q, [0, 0, 0], 1);
    drawVoxModel(ring.model, m, pulse);
  }
}

function drawSky() {
  const p = renderer.progSky;
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  gl.useProgram(p.p);
  gl.uniform3fv(p.u.uCamRight, cam.right);
  gl.uniform3fv(p.u.uCamUp, cam.upv);
  gl.uniform3fv(p.u.uCamFwd, cam.fwd);
  gl.uniform1f(p.u.uAspect, renderer.W / renderer.H);
  gl.uniform1f(p.u.uTanHalf, Math.tan(cam.fov * Math.PI / 360));
  gl.uniform3fv(p.u.uSunDir, SUN.dir);
  gl.uniform3fv(p.u.uNebulaA, [0.085, 0.03, 0.17]);
  gl.uniform3fv(p.u.uNebulaB, [0.26, 0.085, 0.24]);
  gl.uniform3fv(p.u.uNebulaC, [0.04, 0.18, 0.26]);
  gl.uniform1f(p.u.uTime, STATE.t);
  gl.bindVertexArray(renderer.emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
}

function render() {
  const room = STATE.room;
  renderer.beginFrame([0.004, 0.006, 0.014]);
  if (room !== 'reactor') drawSky();
  gl.useProgram(renderer.progVox.p);
  setVoxCommon();
  if (room === 'reactor') drawReactor(); else drawWorld();
  FX.render();
  renderer.endFrame({
    exposure: exposureAt(STATE.t) * 1.0,
    bloom: room === 'reactor' ? 0.95 : 0.8,
    bloomThreshold: 1.0,
    vignette: room === 'reactor' ? 0.65 : 0.5,
  });
}
