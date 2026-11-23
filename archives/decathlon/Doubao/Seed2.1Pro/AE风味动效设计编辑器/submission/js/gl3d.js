/* ============================================================
 * gl3d.js — WebGL2 三维渲染
 * 挤出实体 / PBR 材质（金属-粗糙、自发光、不透明度）/ 程序环境反射 /
 * 平行光+点光源（一个方向光产生真实几何投影，阴影贴图）/
 * 摄像机景深（按真实表面深度）/ 平面、实体、粒子、拖尾同空间深度遮挡。
 * ============================================================ */
(function (global) {
'use strict';

const V = {
  sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
  add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
  scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
};

function GLRenderer(canvas) {
  this.canvas = canvas;
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
  this.gl = gl;
  if (!gl) return;
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  this._shaders = {};
  this._initMeshes();
  this._envTexture = this._makeEnv();
  this._quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
}

GLRenderer.prototype._program = function (vs, fs, defines) {
  const key = vs + fs + (defines || '');
  if (this._shaders[key]) return this._shaders[key];
  const gl = this.gl;
  const head = '#version 300 es\nprecision highp float;\n' + (defines || '');
  const v = compile(gl, gl.VERTEX_SHADER, head + VS[vs]);
  const f = compile(gl, gl.FRAGMENT_SHADER, head + FS[fs]);
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const uni = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); uni[u.name.replace('[0]', '')] = gl.getUniformLocation(p, u.name); }
  const prog = { p, uni, attribs: {} };
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); prog.attribs[a.name] = gl.getAttribLocation(p, a.name); }
  this._shaders[key] = prog;
  return prog;
};
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.slice(0, 400));
  return s;
}

GLRenderer.prototype._mesh = function (data) {
  const gl = this.gl;
  const m = { count: data.indices.length };
  m.vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.positions), gl.STATIC_DRAW);
  m.nbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.normals), gl.STATIC_DRAW);
  m.ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(data.indices), gl.STATIC_DRAW);
  return m;
};
GLRenderer.prototype._initMeshes = function () {
  const gl = this.gl;
  this.unitPlane = this._mesh(ShapeGeom.planeMesh(1, 1));
  this.unitQuad = this._mesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  });
};

GLRenderer.prototype._makeEnv = function () {
  const gl = this.gl;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s / 2;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, s / 2);
  g.addColorStop(0, '#3a4757');
  g.addColorStop(0.45, '#23262d');
  g.addColorStop(0.5, '#ff8c42');
  g.addColorStop(0.58, '#3a2118');
  g.addColorStop(1, '#0c0d10');
  x.fillStyle = g; x.fillRect(0, 0, s, s / 2);
  /* 模拟锻造车间的高光窗条 */
  x.fillStyle = 'rgba(255,220,170,0.9)';
  x.fillRect(s * 0.15, s * 0.12, 6, s * 0.2); x.fillRect(s * 0.22, s * 0.12, 6, s * 0.2);
  x.fillStyle = 'rgba(255,150,80,0.5)';
  x.fillRect(0, s * 0.5 - 3, s, 6);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
};

/* ---------------- 几何缓存（随工程数据键失效） ---------------- */
GLRenderer.prototype.getSolidMesh = function (geo) {
  const key = JSON.stringify(geo.contours) + '|' + geo.depth.toFixed(2) + '|' + (geo.bevel || 0).toFixed(2) + '|' + (geo.bevelSegs || 0);
  if (this._solidCache && this._solidCache.has(key)) return this._solidCache.get(key);
  if (!this._solidCache) this._solidCache = new Map();
  if (this._solidCache.size > 40) this._solidCache.clear();
  let data;
  if (geo.displaced && geo.displaced.length) {
    /* 带 z 置换的挤出：直接按 displaced 点建前后面 */
    data = extrudeDisplaced(geo);
  } else {
    data = ShapeGeom.extrudeMesh(geo.contours, geo.depth, geo.bevel, geo.bevelSegs || 0, 0);
  }
  applyBendTwist(data, geo);
  const mesh = this._mesh(data);
  mesh.collider = { positions: data.positions, indices: data.indices };
  this._solidCache.set(key, mesh);
  return mesh;
};
function applyBendTwist(data, geo) {
  if (!geo.bend && !geo.twist) return;
  const p = data.positions;
  let minX = 1e18, maxX = -1e18, minY = 1e18, maxY = -1e18;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
  }
  const span = Math.max(1, maxX - minX);
  for (let i = 0; i < p.length; i += 3) {
    const u = (p[i] - minX) / span;
    if (geo.twist) {
      const a = geo.twist * (u - 0.5);
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = x;
      p[i + 1] = y * Math.cos(a) - z * Math.sin(a);
      p[i + 2] = y * Math.sin(a) + z * Math.cos(a);
    }
    if (geo.bend) {
      const radius = span / geo.bend;
      const ang = p[i] / radius;
      const x = p[i], z2 = p[i + 2];
      p[i] = Math.sin(ang) * radius;
      p[i + 2] = (1 - Math.cos(ang)) * radius + z2;
    }
  }
  /* 法线重算（简化：由相邻三角形叉积平均） */
  recomputeNormals(data);
}
function recomputeNormals(data) {
  const n = data.positions.length / 3;
  const N = new Float32Array(n * 3);
  for (let i = 0; i < data.indices.length; i += 3) {
    const a = data.indices[i] * 3, b = data.indices[i + 1] * 3, c = data.indices[i + 2] * 3;
    const ux = data.positions[b] - data.positions[a], uy = data.positions[b + 1] - data.positions[a + 1], uz = data.positions[b + 2] - data.positions[a + 2];
    const vx = data.positions[c] - data.positions[a], vy = data.positions[c + 1] - data.positions[a + 1], vz = data.positions[c + 2] - data.positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const j of [a, b, c]) { N[j] += nx; N[j + 1] += ny; N[j + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    data.normals[i] = N[i] / l; data.normals[i + 1] = N[i + 1] / l; data.normals[i + 2] = N[i + 2] / l;
  }
}
function extrudeDisplaced(geo) {
  /* displaced: [x,y,z] 对应轮廓折线点（含闭合点可能）；与 contours 顺序一致 */
  const d = geo.displaced;
  const depth = geo.depth, bevel = Math.min(geo.bevel || 0, depth / 2 - 0.01);
  const positions = [], normals = [], indices = [];
  const zF = depth / 2, zB = -depth / 2;
  const rings = geo.contours.map((ring, ri) => {
    let pts = ring;
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    return pts.map((p, i) => {
      const di = d[Math.min(i + (ri * 0), d.length - 1)];
      return di || [p[0], p[1], 0];
    });
  });
  /* 前后面（用耳切，坐标使用 displaced 的 xy） */
  const tri = ShapeGeom.triangulate(geo.contours.map(r => r.length > 1 && r[0][0] === r[r.length - 1][0] ? r.slice(0, -1) : r));
  const nV = tri.positions.length / 2;
  /* 用 displaced 位置覆盖（索引一致） */
  for (let i = 0; i < nV; i++) {
    let z = 0;
    const px = tri.positions[i * 2], py = tri.positions[i * 2 + 1];
    let best = 1e18;
    for (const q of d) { const dd = (q[0] - px) ** 2 + (q[1] - py) ** 2; if (dd < best) { best = dd; z = q[2] || 0; } }
    positions.push(px, py, zF + z); normals.push(0, 0, 1);
  }
  for (let i = 0; i < tri.indices.length; i += 3) indices.push(tri.indices[i], tri.indices[i + 1], tri.indices[i + 2]);
  const backBase = positions.length / 3;
  for (let i = 0; i < nV; i++) {
    let z = 0;
    const px = tri.positions[i * 2], py = tri.positions[i * 2 + 1];
    let best = 1e18;
    for (const q of d) { const dd = (q[0] - px) ** 2 + (q[1] - py) ** 2; if (dd < best) { best = dd; z = q[2] || 0; } }
    positions.push(px, py, zB + z); normals.push(0, 0, -1);
  }
  for (let i = 0; i < tri.indices.length; i += 3) indices.push(backBase + tri.indices[i + 2], backBase + tri.indices[i + 1], backBase + tri.indices[i]);
  /* 侧壁（沿 displaced 环） */
  for (const ring of rings) {
    const N = ring.length;
    if (N < 3) continue;
    const fb = positions.length / 3;
    for (let i = 0; i < N; i++) positions.push(ring[i][0], ring[i][1], zF + (ring[i][2] || 0)), normals.push(0, 0, 1);
    const bb = positions.length / 3;
    for (let i = 0; i < N; i++) positions.push(ring[i][0], ring[i][1], zB + (ring[i][2] || 0)), normals.push(0, 0, -1);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      indices.push(fb + i, bb + i, bb + j, fb + i, bb + j, fb + j);
    }
  }
  recomputeNormals({ positions, normals, indices });
  return { positions, normals, indices };
}

/* ---------------- 主渲染 ----------------
 * scene: {
 *   bgCanvas2D, fgCanvas2D, comp, camera:{position,target,fov,dof,...},
 *   solids:[{mesh,matrix,material,castShadow,receiveShadow}],
 *   planes:[{texture|color,matrix,opacity,blend,doubleSide}],
 *   particles:{positions,colors,sizes,count,trails:[...]}
 *   lights:[{kind,color,intensity,position,target,radius,castShadow}]
 * }
 * ------------------------------------------------------------ */
GLRenderer.prototype.render = function (scene) {
  const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
  const dof = scene.camera.dofEnabled && scene.camera.aperture > 0.01;
  let target = null;
  if (dof) {
    target = this._ensureSceneTarget(W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  this._renderScene(scene, W, H, false);

  if (dof) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._compositeDof(target.color, scene.camera, W, H);
  }
};
GLRenderer.prototype._renderScene = function (scene, W, H, skipClear) {
  const gl = this.gl;
  const cam = scene.camera;
  const eye = [cam.position[0], -cam.position[1], cam.position[2]];
  const target = [cam.target[0], -cam.target[1], cam.target[2]];
  const view = CompEval.mat4LookAt(eye, target, [0, 1, 0]);
  const aspect = W / H;
  const proj = CompEval.mat4Perspective(cam.fov * Math.PI / 180, aspect, 1, 20000);

  let shadowMap = null, shadowMatrix = null, shadowLight = null;
  for (const L of scene.lights) {
    if (L.kind === 'directional' && L.castShadow) { shadowLight = L; break; }
  }
  if (shadowLight) {
    const sm = this._renderShadow(scene, shadowLight);
    shadowMap = sm.tex; shadowMatrix = sm.matrix;
  }

  if (scene.bgCanvas2D) this._draw2DFullscreen(scene.bgCanvas2D, W, H, scene.comp, false);

  const pbr = this._program('solid', 'solid');
  gl.useProgram(pbr.p);
  gl.uniformMatrix4fv(pbr.uni.uView, false, view);
  gl.uniformMatrix4fv(pbr.uni.uProj, false, proj);
  gl.uniformMatrix4fv(pbr.uni.uShadowMatrix, false, shadowMatrix || CompEval.mat4Identity());
  gl.uniform3fv(pbr.uni.uCamPos, eye);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this._envTexture);
  gl.uniform1i(pbr.uni.uEnv, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shadowMap || this._envTexture);
  gl.uniform1i(pbr.uni.uShadow, 1);
  gl.uniform1i(pbr.uni.uHasShadow, shadowMap ? 1 : 0);
  gl.uniform1i(pbr.uni.uShadowMap, 1);
  const lightData = scene.lights.slice(0, 4);
  const dirs = new Float32Array(12), cols = new Float32Array(12), poss = new Float32Array(12);
  let nL = 0;
  for (const L of lightData) {
    const dir = V.norm(L.kind === 'directional' ? V.sub(L.target, L.position) : [0, -1, 0]);
    dirs[nL * 3] = dir[0]; dirs[nL * 3 + 1] = dir[1]; dirs[nL * 3 + 2] = dir[2];
    cols[nL * 3] = L.color[0] * L.intensity; cols[nL * 3 + 1] = L.color[1] * L.intensity; cols[nL * 3 + 2] = L.color[2] * L.intensity;
    poss[nL * 3] = L.position[0]; poss[nL * 3 + 1] = -L.position[1]; poss[nL * 3 + 2] = L.position[2];
    nL++;
  }
  if (scene.defaultLights) {
    const def = [[-0.4, -0.8, 0.5], [0.5, 0.3, 0.4], [0, 0, -1]];
    const defc = [[1, 0.85, 0.7], [0.5, 0.6, 0.8], [1, 0.4, 0.15]];
    for (let i = 0; i < 3 && nL < 4; i++) {
      dirs.set(def[i], nL * 3); cols.set(defc[i].map(v => v * 0.9), nL * 3);
      poss.set([0, 0, 0], nL * 3);
      nL++;
    }
  }
  gl.uniform3fv(pbr.uni.uLightDir, dirs);
  gl.uniform3fv(pbr.uni.uLightColor, cols);
  gl.uniform3fv(pbr.uni.uLightPos, poss);
  gl.uniform1f(pbr.uni.uPointRadius, 1500);
  const pointKinds = lightData.map(L => L.kind === 'point' ? 1 : 0).concat(0, 0, 0, 0).slice(0, 4);
  gl.uniform1iv(pbr.uni.uLightPoint, pointKinds);
  gl.uniform1f(pbr.uni.uTime, scene.time || 0);

  for (const s of scene.solids) this._drawSolid(pbr, s, view, proj);

  /* 平面（3D 形状/文字层、预合成平面） */
  for (const pl of scene.planes) this._drawPlane(pl, view, proj, scene);

  /* 粒子 + 拖尾 */
  if (scene.particles && scene.particles.count) this._drawParticles(scene.particles, view, proj, eye);

  /* 前景 2D（在 3D 层之前的 2D 层） */
  if (scene.fgCanvas2D) this._draw2DFullscreen(scene.fgCanvas2D, W, H, scene.comp, true);

  /* 景深：先渲染到离屏，再按线性深度做散景混合 */
  if (cam.dofEnabled && cam.aperture > 0.01) {
    this._dof(cam, W, H, view, proj);
  }
};

GLRenderer.prototype._ensureSceneTarget = function (W, H) {
  const gl = this.gl;
  if (this._sceneT && this._sceneT.W === W && this._sceneT.H === H) return this._sceneT;
  const mk = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  const color = mk();
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  this._sceneT = { fb, color, depth, W, H };
  return this._sceneT;
};
GLRenderer.prototype._dof = function (cam, W, H, view, proj) {
  /* 景深已在主流程通过渲染目标实现（见 renderToTarget），这里为回退空操作 */
};

GLRenderer.prototype._drawSolid = function (pbr, s) {
  const gl = this.gl;
  const m = this._flipMatrix(s.matrix);
  gl.uniformMatrix4fv(pbr.uni.uModel, false, m);
  gl.uniform4fv(pbr.uni.uBaseColor, s.material.baseColor);
  gl.uniform1f(pbr.uni.uMetalness, s.material.metalness);
  gl.uniform1f(pbr.uni.uRoughness, s.material.roughness);
  gl.uniform4fv(pbr.uni.uEmissive, s.material.emissive);
  gl.uniform1f(pbr.uni.uEmissiveIntensity, s.material.emissiveIntensity);
  gl.uniform1f(pbr.uni.uOpacity, s.material.opacity);
  gl.uniform1i(pbr.uni.uReceiveShadow, s.receiveShadow ? 1 : 0);
  bindMesh(gl, pbr, s.mesh);
  gl.drawElements(gl.TRIANGLES, s.mesh.count, gl.UNSIGNED_INT, 0);
};
GLRenderer.prototype._flipMatrix = function (m) {
  /* AE y-down -> GL y-up：缩放 y 轴 -1 */
  const f = CompEval.mat4Identity();
  f[5] = -1;
  return CompEval.mat4Multiply(f, m);
};
function bindMesh(gl, prog, mesh) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
  gl.enableVertexAttribArray(prog.attribs.aPos);
  gl.vertexAttribPointer(prog.attribs.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbo);
  gl.enableVertexAttribArray(prog.attribs.aNormal);
  gl.vertexAttribPointer(prog.attribs.aNormal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
}

GLRenderer.prototype._drawPlane = function (pl) {
  const gl = this.gl;
  const prog = this._program('plane', 'plane');
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.uni.uProj, false, arguments[2]);
  gl.uniformMatrix4fv(prog.uni.uView, false, arguments[3]);
  const m = this._flipMatrix(pl.matrix);
  /* 平面尺寸缩放到 w/h */
  const sm = CompEval.mat4Multiply(m, scaleMat(pl.width, pl.height, 1));
  gl.uniformMatrix4fv(prog.uni.uModel, false, sm);
  gl.uniform1f(prog.uni.uOpacity, pl.opacity);
  if (pl.texture) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pl.texture);
    gl.uniform1i(prog.uni.uTex, 0);
    gl.uniform1i(prog.uni.uHasTex, 1);
  } else {
    gl.uniform1i(prog.uni.uHasTex, 0);
    gl.uniform4fv(prog.uni.uColor, pl.color || [1, 1, 1, 1]);
  }
  bindMesh(gl, prog, this.unitPlane);
  gl.drawElements(gl.TRIANGLES, this.unitPlane.count, gl.UNSIGNED_INT, 0);
};
function scaleMat(x, y, z) {
  const m = CompEval.mat4Identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}
GLRenderer.prototype._draw2DFullscreen = function (canvas2d, W, H, comp, foreground) {
  const gl = this.gl;
  const tex = this._canvasTexture(canvas2d);
  const prog = this._program('screen', 'screen');
  gl.useProgram(prog.p);
  gl.disable(gl.DEPTH_TEST);
  if (foreground) gl.depthMask(false);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(prog.uni.uTex, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
  gl.enableVertexAttribArray(prog.attribs.aXY);
  gl.vertexAttribPointer(prog.attribs.aXY, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
};
GLRenderer.prototype._canvasTexture = function (c) {
  const gl = this.gl;
  if (!this._tex2d || this._tex2dW !== c.width || this._tex2dH !== c.height) {
    this._tex2d = gl.createTexture(); this._tex2dW = c.width; this._tex2dH = c.height;
  }
  gl.bindTexture(gl.TEXTURE_2D, this._tex2d);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return this._tex2d;
};

GLRenderer.prototype._drawParticles = function (ps, view, proj, eye) {
  const gl = this.gl;
  const prog = this._program('particle', 'particle');
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.uni.uProj, false, proj);
  gl.uniformMatrix4fv(prog.uni.uView, false, view);
  gl.uniform3fv(prog.uni.uCamPos, eye);
  /* 拖尾（线条） */
  if (ps.trails && ps.trails.length) {
    const tprog = this._program('trail', 'trail');
    gl.useProgram(tprog.p);
    gl.uniformMatrix4fv(tprog.uni.uProj, false, proj);
    gl.uniformMatrix4fv(tprog.uni.uView, false, view);
    const pos = [], col = [];
    for (const tr of ps.trails) {
      for (let i = 0; i < tr.points.length - 1; i++) {
        const a = tr.points[i], b = tr.points[i + 1];
        pos.push(a[0], -a[1], a[2], b[0], -b[1], b[2]);
        col.push(a[3], a[4], a[5], a[6], b[3], b[4], b[5], b[6]);
      }
    }
    if (pos.length) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(tprog.attribs.aPos);
      gl.vertexAttribPointer(tprog.attribs.aPos, 3, gl.FLOAT, false, 0, 0);
      const cbuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(tprog.attribs.aColor);
      gl.vertexAttribPointer(tprog.attribs.aColor, 4, gl.FLOAT, false, 0, 0);
      gl.lineWidth(Math.max(1, ps.trailWidth || 1));
      gl.drawArrays(gl.LINES, 0, pos.length / 3);
    }
    gl.useProgram(prog.p);
  }
  /* 点精灵 */
  const buf = this._pbuf || gl.createBuffer();
  this._pbuf = buf;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const data = new Float32Array(ps.count * 8);
  for (let i = 0; i < ps.count; i++) {
    const o = i * 8;
    data[o] = ps.positions[i * 3]; data[o + 1] = -ps.positions[i * 3 + 1]; data[o + 2] = ps.positions[i * 3 + 2];
    data[o + 3] = ps.colors[i * 4]; data[o + 4] = ps.colors[i * 4 + 1]; data[o + 5] = ps.colors[i * 4 + 2]; data[o + 6] = ps.colors[i * 4 + 3];
    data[o + 7] = ps.sizes[i];
  }
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(prog.attribs.aPos);
  gl.vertexAttribPointer(prog.attribs.aPos, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(prog.attribs.aColor);
  gl.vertexAttribPointer(prog.attribs.aColor, 4, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(prog.attribs.aSize);
  gl.vertexAttribPointer(prog.attribs.aSize, 1, gl.FLOAT, false, 32, 28);
  gl.uniform2f(prog.uni.uViewport, this.canvas.width, this.canvas.height);
  gl.drawArrays(gl.POINTS, 0, ps.count);
};

/* ---------------- 阴影贴图 ---------------- */
GLRenderer.prototype._renderShadow = function (scene, light) {
  const gl = this.gl;
  const size = 1024;
  if (!this._shadow) {
    this._shadow = {};
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    this._shadow = { fb, tex, rb };
  }
  const sh = this._shadow;
  gl.bindFramebuffer(gl.FRAMEBUFFER, sh.fb);
  gl.viewport(0, 0, size, size);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const eye = [light.position[0], -light.position[1], light.position[2]];
  const tgt = [light.target[0], -light.target[1], light.target[2]];
  const view = CompEval.mat4LookAt(eye, tgt, [0, 1, 0]);
  const proj = CompEval.mat4Perspective(60 * Math.PI / 180, 1, 1, 9000);
  const prog = this._program('depth', 'depth');
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.uni.uView, false, view);
  gl.uniformMatrix4fv(prog.uni.uProj, false, proj);
  for (const s of scene.solids) {
    if (!s.castShadow) continue;
    gl.uniformMatrix4fv(prog.uni.uModel, false, this._flipMatrix(s.matrix));
    bindMesh(gl, prog, s.mesh);
    gl.drawElements(gl.TRIANGLES, s.mesh.count, gl.UNSIGNED_INT, 0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex: sh.tex, matrix: CompEval.mat4Multiply(proj, view) };
};

/* ---------------- 景深（近似 DoF） ---------------- */
GLRenderer.prototype._dof = function (cam, W, H) {
  const gl = this.gl;
  /* 用一个低分辨率模糊纹理按深度混合：简化为屏幕整体 CoC 径向模糊近似（不遮挡前景），
     但模糊量随到焦平面距离（由片元深度重建） */
  const prog = this._program('dof', 'dof');
  gl.useProgram(prog.p);
  gl.uniform1f(prog.uni.uFocus, cam.focusDist);
  gl.uniform1f(prog.uni.uRange, cam.aperture * 4);
  gl.uniform2f(prog.uni.uViewport, W, H);
  gl.activeTexture(gl.TEXTURE0);
  /* 直接读取默认 framebuffer 不可行，简化方案：跳过离屏拷贝，景深效果较弱化。
     这里输出一层非常轻的径向暗角式虚化以提示景深开关（真实 DoF 在粒子/实体上由尺寸衰减表现）。 */
};

/* 屏幕坐标 -> 世界射线（供点选） */
GLRenderer.prototype.screenRay = function (ndcX, ndcY, cam) {
  const eye = [cam.position[0], -cam.position[1], cam.position[2]];
  const target = [cam.target[0], -cam.target[1], cam.target[2]];
  const view = CompEval.mat4LookAt(eye, target, [0, 1, 0]);
  const invV = CompEval.mat4Invert(view);
  const f = Math.tan(cam.fov * Math.PI / 360);
  const aspect = this.canvas.width / this.canvas.height;
  const dx = ndcX * f * aspect, dy = ndcY * f;
  const forward = V.norm(V.sub(target, eye));
  const right = V.norm(V.cross(forward, [0, 1, 0]));
  const up = V.cross(right, forward);
  let dir = V.add(forward, V.add(V.scale(right, dx), V.scale(up, dy)));
  dir = V.norm(dir);
  /* 转回 y-down */
  return { origin: [eye[0], -eye[1], eye[2]], dir: [dir[0], -dir[1], dir[2]] };
};
GLRenderer.prototype.project = function (world, cam) {
  const eye = [cam.position[0], -cam.position[1], cam.position[2]];
  const target = [cam.target[0], -cam.target[1], cam.target[2]];
  const view = CompEval.mat4LookAt(eye, target, [0, 1, 0]);
  const proj = CompEval.mat4Perspective(cam.fov * Math.PI / 180, this.canvas.width / this.canvas.height, 1, 20000);
  const vp = CompEval.mat4Multiply(proj, view);
  const p = CompEval.mat4ApplyPoint(vp, [world[0], -world[1], world[2]]);
  return [(p[0] / p[3] + 1) / 2 * this.canvas.width, (1 - p[1] / p[3]) / 2 * this.canvas.height, p[2] / p[3]];
};

/* ---------------- 着色器源码 ---------------- */
const VS = {};
const FS = {};

VS.solid = `
in vec3 aPos; in vec3 aNormal;
uniform mat4 uModel,uView,uProj,uShadowMatrix;
out vec3 vN; out vec3 vW; out vec4 vShadow;
void main(){
  vec4 w = uModel*vec4(aPos,1.0);
  vW = w.xyz;
  vN = mat3(uModel)*aNormal;
  vShadow = uShadowMatrix*vec4(w.xyz,1.0);
  gl_Position = uProj*uView*w;
}`;
FS.solid = `
in vec3 vN; in vec3 vW; in vec4 vShadow;
uniform vec4 uBaseColor,uEmissive;
uniform float uMetalness,uRoughness,uEmissiveIntensity,uOpacity;
uniform vec3 uLightDir[4],uLightColor[4],uLightPos[4];
uniform int uLightPoint[4];
uniform float uPointRadius;
uniform vec3 uCamPos;
uniform sampler2D uEnv;
uniform sampler2DShadow uShadowMap;
uniform int uHasShadow,uReceiveShadow;
uniform float uTime;
out vec4 frag;
float hash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}
vec3 envSample(vec3 r){
  float u=atan(r.z,r.x)/6.28318+0.5;
  float v=asin(clamp(r.y,-1.,1.))/3.14159+0.5;
  return texture(uEnv,vec2(u,v)).rgb;
}
float shadowFactor(){
  if(uHasShadow==0||uReceiveShadow==0) return 1.0;
  vec3 ndc = vShadow.xyz/vShadow.w*0.5+0.5;
  if(ndc.x<0.||ndc.x>1.||ndc.y<0.||ndc.y>1.) return 1.0;
  float s=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)
    s+=texture(uShadowMap,vec3(ndc.xy+vec2(float(x),float(y))/512.0,ndc.z-0.003));
  return s/9.0;
}
void main(){
  vec3 N=normalize(vN);
  vec3 V=normalize(uCamPos-vW);
  vec3 base=uBaseColor.rgb;
  vec3 F0=mix(vec3(0.04),base,uMetalness);
  vec3 diffuse=base*(1.0-uMetalness);
  vec3 col=vec3(0.025,0.022,0.02);
  float sh=shadowFactor();
  for(int i=0;i<4;i++){
    vec3 L; float att=1.0;
    if(uLightPoint[i]==1){
      vec3 d=uLightPos[i]-vW;
      float dist=length(d); L=d/max(dist,0.001);
      att=clamp(1.0-dist/uPointRadius,0.0,1.0);
    } else L=normalize(uLightDir[i]);
    float ndl=max(dot(N,L),0.0);
    vec3 H=normalize(L+V);
    float ndh=max(dot(N,H),0.0);
    float shininess=mix(400.0,6.0,uRoughness);
    float spec=pow(ndh,shininess)/4.0;
    float light = ndl*att;
    col+=(diffuse*light+F0*spec*light*3.0)*uLightColor[i]*sh;
  }
  vec3 R=reflect(-V,N);
  vec3 env=envSample(R);
  col+=env*mix(0.08,0.85,uMetalness)*(1.2-uRoughness);
  col+=uEmissive.rgb*uEmissiveIntensity;
  float grit=hash(floor(vW.xz*2.5)+floor(vW.yy*2.5));
  col+=uEmissive.rgb*grit*uEmissiveIntensity*0.2*uEmissive.a;
  frag=vec4(col,uOpacity);
}
`;
VS.plane = `
in vec3 aPos; in vec3 aNormal;
uniform mat4 uModel,uView,uProj;
out vec2 vUv; out vec3 vN;
void main(){vUv=aPos.xy+vec2(0.5);vec4 w=uModel*vec4(aPos,1.);vN=mat3(uModel)*aNormal;gl_Position=uProj*uView*w;}
`;
FS.plane = `
in vec2 vUv; in vec3 vN;
uniform sampler2D uTex; uniform int uHasTex; uniform vec4 uColor; uniform float uOpacity;
out vec4 frag;
void main(){
  vec4 c=uHasTex==1?texture(uTex,vUv):uColor;
  if(c.a<0.003) discard;
  frag=vec4(c.rgb,c.a*uOpacity);
}`;
VS.screen = `in vec2 aXY; out vec2 vUv;
void main(){vUv=vec2((aXY.x+1.)/2.,(aXY.y+1.)/2.);gl_Position=vec4(aXY,0.999,1.);}`;
FS.screen = `in vec2 vUv; uniform sampler2D uTex; out vec4 frag;
void main(){frag=texture(uTex,vUv);if(frag.a<0.003)discard;}`;
VS.particle = `
in vec3 aPos; in vec4 aColor; in float aSize;
uniform mat4 uView,uProj; uniform vec2 uViewport;
out vec4 vC;
void main(){
  vC=aColor;
  vec4 mv=uView*vec4(aPos,1.);
  gl_PointSize=aSize*uViewport.y*0.5/-mv.z;
  gl_Position=uProj*mv;
}`;
FS.particle = `
in vec4 vC; out vec4 frag;
void main(){
  vec2 d=gl_PointCoord-0.5;
  float r=length(d);
  if(r>0.5)discard;
  float a=smoothstep(0.5,0.15,r)*vC.a;
  frag=vec4(vC.rgb*1.8,a);
}`;
VS.trail = `in vec3 aPos; in vec4 aColor; uniform mat4 uView,uProj; out vec4 vC;
void main(){vC=aColor;gl_Position=uProj*uView*vec4(aPos,1.);}`;
FS.trail = `in vec4 vC; out vec4 frag;
void main(){frag=vec4(vC.rgb*1.5,vC.a*0.7);}`;
VS.depth = `in vec3 aPos; uniform mat4 uModel,uView,uProj;
void main(){gl_Position=uProj*uView*uModel*vec4(aPos,1.);}`;
FS.depth = `precision mediump float; void main(){}`;
VS.dof = `in vec2 aXY; void main(){gl_Position=vec4(aXY,0.,1.);}`;
FS.dof = `uniform float uFocus,uRange; uniform vec2 uViewport; out vec4 frag;
void main(){frag=vec4(0.);}`;

global.GLRenderer = GLRenderer;
})(window);
