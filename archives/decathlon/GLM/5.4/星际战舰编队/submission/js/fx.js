'use strict';
/* ==================================================================
   特效系统：精灵 / 尾焰 / 光束 / 护盾 / 粒子
   ================================================================== */
const FX = {
  cap: 9000,
  data: null, count: 0, vao: null, vbo: null,
  plumeData: null, plumeCount: 0, plumeVao: null, plumeVbo: null,
  beams: [], shields: [],
  init() {
    const r = renderer, g = gl;
    // 精灵实例缓冲
    this.data = new Float32Array(this.cap * 10);
    this.vao = g.createVertexArray(); g.bindVertexArray(this.vao);
    g.bindBuffer(g.ARRAY_BUFFER, r.quadVAO ? g.getParameter(g.ARRAY_BUFFER_BINDING) : null);
    // 重新绑定四边形
    g.bindVertexArray(this.vao);
    const qb = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, qb);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(0, 0);
    this.vbo = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
    g.bufferData(g.ARRAY_BUFFER, this.data.byteLength, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 4, g.FLOAT, false, 40, 0); g.vertexAttribDivisor(1, 1);
    g.enableVertexAttribArray(2); g.vertexAttribPointer(2, 4, g.FLOAT, false, 40, 16); g.vertexAttribDivisor(2, 1);
    g.enableVertexAttribArray(3); g.vertexAttribPointer(3, 4, g.FLOAT, false, 40, 32); g.vertexAttribDivisor(3, 1);
    g.bindVertexArray(null);
    // 尾焰实例缓冲
    this.plumeData = new Float32Array(512 * 20);
    this.plumeVao = g.createVertexArray(); g.bindVertexArray(this.plumeVao);
    const cm = r.coneMesh;
    g.bindBuffer(g.ARRAY_BUFFER, cm.vb);
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(0, 0);
    g.bindBuffer(g.ARRAY_BUFFER, cm.ub);
    g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(1, 0);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, cm.ib);
    this.plumeVbo = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, this.plumeVbo);
    g.bufferData(g.ARRAY_BUFFER, this.plumeData.byteLength, g.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) {
      g.enableVertexAttribArray(2 + i);
      g.vertexAttribPointer(2 + i, 4, g.FLOAT, false, 80, i * 16);
      g.vertexAttribDivisor(2 + i, 1);
    }
    g.enableVertexAttribArray(6); g.vertexAttribPointer(6, 4, g.FLOAT, false, 80, 64); g.vertexAttribDivisor(6, 1);
    g.bindVertexArray(null);
  },
  reset() { this.count = 0; this.plumeCount = 0; this.beams.length = 0; this.shields.length = 0; if (this._shape) this._shape.length = 0; },
  sprite(pos, size, color, alpha, rot, stretch, shape) {
    if (this.count >= this.cap) return;
    const o = this.count * 10, d = this.data;
    d[o] = pos[0]; d[o + 1] = pos[1]; d[o + 2] = pos[2]; d[o + 3] = size;
    d[o + 4] = color[0]; d[o + 5] = color[1]; d[o + 6] = color[2]; d[o + 7] = alpha === undefined ? 1 : alpha;
    d[o + 8] = rot || 0; d[o + 9] = stretch || 1;
    this.count++;
    this._shape = this._shape || [];
    this._shape.push(shape || 0);
  },
  plume(matrix, color, intensity) {
    if (this.plumeCount >= 500) return;
    const o = this.plumeCount * 20, d = this.plumeData;
    for (let i = 0; i < 16; i++) d[o + i] = matrix[i];
    d[o + 16] = color[0]; d[o + 17] = color[1]; d[o + 18] = color[2]; d[o + 19] = intensity === undefined ? 1 : intensity;
    this.plumeCount++;
  },
  beam(a, b, radius, color, intensity) { this.beams.push({ a, b, radius, color, intensity }); },
  shield(pos, scale, quat, color, opacity, phase) { this.shields.push({ pos, scale, quat, color, opacity, phase }); },
  render() {
    const r = renderer, g = gl;
    // ---- 尾焰 ----
    if (this.plumeCount > 0) {
      g.useProgram(r.progPlume.p);
      g.uniformMatrix4fv(r.progPlume.u.uViewProj, false, cam.vp);
      g.uniform3fv(r.progPlume.u.uCamPos, cam.pos);
      g.uniform1f(r.progPlume.u.uTime, STATE.t);
      g.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false); gl.disable(gl.CULL_FACE);
      g.bindVertexArray(this.plumeVao);
      g.bindBuffer(g.ARRAY_BUFFER, this.plumeVbo);
      g.bufferSubData(g.ARRAY_BUFFER, 0, this.plumeData.subarray(0, this.plumeCount * 20));
      g.drawElementsInstanced(g.TRIANGLES, r.coneMesh.count, g.UNSIGNED_SHORT, 0, this.plumeCount);
      gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    }
    // ---- 光束 ----
    if (this.beams.length) {
      g.useProgram(r.progBeam.p);
      g.uniformMatrix4fv(r.progBeam.u.uViewProj, false, cam.vp);
      g.uniform3fv(r.progBeam.u.uCamPos, cam.pos);
      g.uniform1f(r.progBeam.u.uTime, STATE.t);
      g.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false); gl.disable(gl.CULL_FACE);
      const m = new Float32Array(16);
      for (const b of this.beams) {
        beamMatrix(m, b.a, b.b, b.radius);
        g.uniformMatrix4fv(r.progBeam.u.uModel, false, m);
        g.uniform3fv(r.progBeam.u.uColor, b.color);
        g.uniform1f(r.progBeam.u.uIntensity, b.intensity);
        g.bindVertexArray(r.cylMesh.vao);
        g.drawElements(g.TRIANGLES, r.cylMesh.count, g.UNSIGNED_SHORT, 0);
      }
      gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    }
    // ---- 护盾 ----
    if (this.shields.length) {
      g.useProgram(r.progShield.p);
      g.uniformMatrix4fv(r.progShield.u.uViewProj, false, cam.vp);
      g.uniform3fv(r.progShield.u.uCamPos, cam.pos);
      g.uniform1f(r.progShield.u.uTime, STATE.t);
      g.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false); gl.disable(gl.CULL_FACE);
      const m = new Float32Array(16), mr = new Float32Array(16);
      for (const s of this.shields) {
        M4.fromQuatPosScale(m, s.quat || Q.ident(), s.pos, s.scale);
        M4.fromQuatPosScale(mr, s.quat || Q.ident(), [0, 0, 0], [1, 1, 1]);
        g.uniformMatrix4fv(r.progShield.u.uModel, false, m);
        g.uniformMatrix4fv(r.progShield.u.uModelRot, false, mr);
        g.uniform3fv(r.progShield.u.uColor, s.color);
        g.uniform1f(r.progShield.u.uOpacity, s.opacity);
        g.uniform1f(r.progShield.u.uPhase, s.phase || 0);
        g.bindVertexArray(r.sphereMesh.vao);
        g.drawElements(g.TRIANGLES, r.sphereMesh.count, g.UNSIGNED_SHORT, 0);
      }
      gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    }
    // ---- 精灵 ----
    if (this.count > 0) {
      g.useProgram(r.progSprite.p);
      g.uniformMatrix4fv(r.progSprite.u.uViewProj, false, cam.vp);
      g.uniformMatrix4fv(r.progSprite.u.uView, false, cam.view);
      g.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false); gl.disable(gl.CULL_FACE);
      g.bindVertexArray(this.vao);
      g.bindBuffer(g.ARRAY_BUFFER, this.vbo);
      // 形状分组：按 sprite() 记录的 shape 分批绘制；四顶点四边形用扇形图元
      if (!this._tmp) this._tmp = new Float32Array(this.cap * 10);
      for (let sh = 0; sh < 3; sh++) {
        let n = 0;
        for (let i = 0; i < this.count; i++) {
          if ((this._shape[i] || 0) !== sh) continue;
          this._tmp.set(this.data.subarray(i * 10, i * 10 + 10), n * 10); n++;
        }
        if (!n) continue;
        g.bufferSubData(g.ARRAY_BUFFER, 0, this._tmp.subarray(0, n * 10));
        g.uniform1i(r.progSprite.u.uShape, sh);
        g.drawArraysInstanced(g.TRIANGLE_FAN, 0, 4, n);
      }
      gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    }
  },
};

function beamMatrix(out, a, b, radius) {
  const d = V3.sub(b, a);
  const len = V3.len(d);
  const x = V3.norm(d);
  let up = Math.abs(x[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let y = V3.norm(V3.cross(up, x));
  const z = V3.cross(x, y);
  out[0] = x[0] * len; out[1] = x[1] * len; out[2] = x[2] * len; out[3] = 0;
  out[4] = y[0] * radius; out[5] = y[1] * radius; out[6] = y[2] * radius; out[7] = 0;
  out[8] = z[0] * radius; out[9] = z[1] * radius; out[10] = z[2] * radius; out[11] = 0;
  out[12] = a[0]; out[13] = a[1]; out[14] = a[2]; out[15] = 1;
  return out;
}
function dirMatrix(out, pos, dir, len, rad) {
  const x = V3.norm(dir);
  let up = Math.abs(x[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const y = V3.norm(V3.cross(up, x));
  const z = V3.cross(x, y);
  out[0] = x[0] * len; out[1] = x[1] * len; out[2] = x[2] * len; out[3] = 0;
  out[4] = y[0] * rad; out[5] = y[1] * rad; out[6] = y[2] * rad; out[7] = 0;
  out[8] = z[0] * rad; out[9] = z[1] * rad; out[10] = z[2] * rad; out[11] = 0;
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
  return out;
}
function initFX() { FX.init(); }
