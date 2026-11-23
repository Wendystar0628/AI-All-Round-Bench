/* ============================================================
 * comp.js — 合成求值器
 * 同一时刻结果确定：所有模拟、表达式、几何缓存都以 (工程,t) 为键，
 * 直接跳到后段或重开后读取同一时刻结果一致。
 * ============================================================ */
(function (global) {
'use strict';

/* ---------------- 矩阵工具 ---------------- */
const Mat3 = {
  identity() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; },
  mult(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
      a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
      a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
      a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
      a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
      a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
      a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
    ];
  },
  apply(m, p) {
    return [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]];
  }
};
function mat4Identity() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    out[i * 4 + j] = s;
  }
  return out;
}
function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
function mat4LookAt(eye, center, up) {
  let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
  let l = Math.hypot(z0, z1, z2) || 1; z0 /= l; z1 /= l; z2 /= l;
  let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
  l = Math.hypot(x0, x1, x2) || 1; x0 /= l; x1 /= l; x2 /= l;
  const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
  const m = mat4Identity();
  m[0] = x0; m[4] = x1; m[8] = x2;
  m[1] = y0; m[5] = y1; m[9] = y2;
  m[2] = z0; m[6] = z1; m[10] = z2;
  m[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  m[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  m[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  return m;
}
/* 世界 TRS（AE 坐标：x右、y下、z向观察者） */
function mat4TRS(pos, rotXYZ, scale, anchor) {
  const cx = Math.cos(rotXYZ[0]), sx = Math.sin(rotXYZ[0]);
  const cy = Math.cos(rotXYZ[1]), sy = Math.sin(rotXYZ[1]);
  const cz = Math.cos(rotXYZ[2]), sz = Math.sin(rotXYZ[2]);
  const Rx = [1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0, 0, 0, 0, 1];
  const Ry = [cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0, 0, 0, 0, 1];
  const Rz = [cz, -sz, 0, 0, sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  let R = mat4Multiply(Rz, mat4Multiply(Ry, Rx));
  const m = mat4Identity();
  m[0] = R[0] * scale[0]; m[1] = R[1] * scale[0]; m[2] = R[2] * scale[0];
  m[4] = R[4] * scale[1]; m[5] = R[5] * scale[1]; m[6] = R[6] * scale[1];
  m[8] = R[8] * scale[2]; m[9] = R[9] * scale[2]; m[10] = R[10] * scale[2];
  m[12] = pos[0] - (m[0] * anchor[0] + m[4] * anchor[1] + m[8] * (anchor[2] || 0));
  m[13] = pos[1] - (m[1] * anchor[0] + m[5] * anchor[1] + m[9] * (anchor[2] || 0));
  m[14] = pos[2] - (m[2] * anchor[0] + m[6] * anchor[1] + m[10] * (anchor[2] || 0));
  return m;
}
function mat4ApplyPoint(m, p) {
  const x = p[0] || 0, y = p[1] || 0, z = p[2] || 0;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}
function mat4Invert(a) {
  const out = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return mat4Identity();
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b11 + a13 * b10) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b11 - a03 * b10) * det;
  out[14] = (a31 * b01 - a30 * b03 + a32 * b05 - a33 * b04) * det;
  out[15] = (a20 * b03 - a21 * b01 - a22 * b05 + a23 * b04) * det;
  return out;
}

/* ---------------- 求值器 ---------------- */
function Evaluator(project) {
  this.project = project;
  this.exprEngine = Expr.create();
  this.exprCache = new Map();
  this.compiledExprs = new Map();
  this.errors = [];
  this.geoCache = new Map();
  this.particleCache = new Map();
}
Evaluator.prototype._compile = function (src) {
  if (this.compiledExprs.has(src)) return this.compiledExprs.get(src);
  const c = { src, ast: null, err: null };
  try { c.ast = this.exprEngine.compile(src); } catch (e) { c.err = e.message; }
  this.compiledExprs.set(src, c);
  return c;
};

/* 取属性最终值（关键帧+表达式），t 为该属性所属合成中的时间 */
Evaluator.prototype.getPropValue = function (p, t, layerId, compId, stack) {
  let kv;
  if (p.animated && p.keys.length) {
    kv = (p.type === 'vec2' || p.type === 'vec3') && p.name === '位置'
      ? M.samplePosition(p, t).value : M.sampleKeys(p, t);
  } else if (typeof p.value === 'object' && p.value !== null) {
    kv = M.deepClone(p.value);
  } else {
    kv = p.value;
  }
  if (p.exprEnabled && p.expr) {
    const compiled = this._compile(p.expr);
    if (compiled.err) {
      this.reportExpr(layerId, p, compiled.err);
      return kv;
    }
    const comp = M.findComp(this.project, compId) || this.project && this._lastComp;
    const layer = comp && comp.layers.find(L => L.id === layerId);
    const ctx = {
      time: t, value: kv, rawProp: p, propId: p.id, layerId, compId,
      comp, layer, compName: comp ? comp.name : '',
      compWidth: comp ? comp.width : 0, compHeight: comp ? comp.height : 0,
      compDuration: comp ? comp.duration : 0,
      fps: comp ? comp.fps : 30,
      wiggleSeed: this.wiggleSeed || 0,
      getPropValue: (pp, tt, ll, cc, st) => this.getPropValue(pp, tt, ll, cc || compId, st)
    };
    try {
      const v = this.exprEngine.evaluate(compiled.ast, ctx, stack || []);
      return normalizeExpr(v, p, kv);
    } catch (e) {
      this.reportExpr(layerId, p, e.message);
      return kv;
    }
  }
  return kv;
};
function normalizeExpr(v, p, kv) {
  if (Array.isArray(kv)) {
    if (typeof v === 'number') return kv.map(() => v);
    if (Array.isArray(v)) {
      const out = kv.slice();
      for (let i = 0; i < out.length; i++) out[i] = (typeof v[i] === 'number' && isFinite(v[i])) ? v[i] : (v[i] && v[i].valueOf && isFinite(+v[i])) ? +v[i] : out[i];
      return out;
    }
    return kv;
  }
  if (typeof v === 'number') return isFinite(v) ? v : kv;
  if (typeof v === 'boolean') return p.type === 'bool' ? v : kv;
  if (typeof v === 'string') return p.type === 'string' ? v : kv;
  const n = +v;
  return isFinite(n) ? n : kv;
}
Evaluator.prototype.reportExpr = function (layerId, p, msg) {
  const key = layerId + '|' + p.id + '|' + msg;
  if (!this._errKeys) this._errKeys = new Set();
  if (!this._errKeys.has(key)) { this._errKeys.add(key); this.errors.push({ layerId, propId: p.id, propName: p.name, msg }); }
};

/* 合成一帧的完整求值 */
Evaluator.prototype.evaluateComp = function (comp, t, opts) {
  opts = opts || {};
  this._lastComp = comp;
  this._lastT = t;
  this.errors = [];
  this._errKeys = new Set();
  this._graphCacheKey = null;
  const ev = this;
  const state = { comp, t, layers: [], camera: null, lights: [], fields: [], particleLayers: [], geoLayers: [] };
  /* 场图层先求值（供几何和粒子使用） */
  const fieldDefsById = new Map();
  for (const L of comp.layers) {
    if (L.type === 'field' && L.enabled && this.layerActive(L, t)) {
      const pos = ev.getPV(L, t, comp, 'position');
      const F = L.field;
      fieldDefsById.set(L.id, {
        kind: ev.getPV(F.kind, t, comp), radius: ev.getPV(F.radius, t, comp),
        strength: ev.getPV(F.strength, t, comp), frequency: ev.getPV(F.frequency, t, comp),
        timeScale: ev.getPV(F.timeScale, t, comp), falloff: ev.getPV(F.falloff, t, comp),
        blend: ev.getPV(F.blend, t, comp), position: pos, seed: M.hashStr(L.id)
      });
      state.fields.push(fieldDefsById.get(L.id));
    }
  }
  /* 每个图层的变换（含父级链） */
  const world2 = new Map(), world3 = new Map();
  for (const L of comp.layers) {
    if (L.is3D) world3.set(L.id, ev.worldMatrix3(L, comp, t));
    else world2.set(L.id, ev.worldMatrix2(L, comp, t, world2));
  }
  for (const L of comp.layers) {
    const active = L.enabled && this.layerActive(L, t);
    const T = L.transform;
    const ls = {
      layer: L, active,
      tr: {
        anchor: ev.pv(T.anchor, t, L, comp),
        position: ev.pv(T.position, t, L, comp),
        scale: ev.pv(T.scale, t, L, comp),
        rotation: ev.pv(T.rotation, t, L, comp),
        rotationX: T.rotationX ? ev.pv(T.rotationX, t, L, comp) : 0,
        rotationY: T.rotationY ? ev.pv(T.rotationY, t, L, comp) : 0,
        opacity: ev.pv(T.opacity, t, L, comp)
      },
      matrix2: world2.get(L.id) || null,
      matrix3: world3.get(L.id) || null
    };
    if (L.type === 'camera' && active) {
      const C = L.camera;
      ls.camera = {
        target: ev.pv(C.target, t, L, comp), fov: ev.pv(C.fov, t, L, comp),
        focusDist: ev.pv(C.focusDist, t, L, comp), aperture: ev.pv(C.aperture, t, L, comp),
        blurLevel: ev.pv(C.blurLevel, t, L, comp), dofEnabled: ev.pv(C.dofEnabled, t, L, comp),
        position: ls.tr.position
      };
      state.camera = ls;
    }
    if (L.type === 'light' && active) {
      const Li = L.light;
      ls.light = {
        kind: ev.pv(Li.kind, t, L, comp), color: ev.pv(Li.color, t, L, comp),
        intensity: ev.pv(Li.intensity, t, L, comp), target: ev.pv(Li.target, t, L, comp),
        radius: ev.pv(Li.radius, t, L, comp), castShadow: ev.pv(Li.castShadow, t, L, comp),
        position: ls.tr.position
      };
      state.lights.push(ls);
    }
    if (L.type === 'particle' && active) state.particleLayers.push(ls);
    if (L.type === 'geo' && active) state.geoLayers.push(ls);
    state.layers.push(ls);
  }
  /* 默认摄像机 */
  if (!state.camera) {
    const fov = 35;
    const dist = comp.height / 2 / Math.tan(fov * Math.PI / 360);
    state.camera = {
      defaultCam: true,
      camera: { target: [comp.width / 2, comp.height / 2, 0], fov, focusDist: dist, aperture: 0, blurLevel: 100, dofEnabled: false, position: [comp.width / 2, comp.height / 2, -dist] },
      tr: { position: [comp.width / 2, comp.height / 2, -dist] }
    };
  }
  /* 默认环境光（无灯光时） */
  state.defaultLights = state.lights.length === 0;
  state.fieldDefsById = fieldDefsById;
  this._fieldMap = fieldDefsById;
  return state;
}
Evaluator.prototype.layerActive = function (L, t) {
  const inT = L.inPoint, outT = L.outPoint;
  return t >= inT && t < outT;
};
Evaluator.prototype.pv = function (p, t, L, comp) {
  return this.getPropValue(p, t, L.id, comp.id);
};
Evaluator.prototype.getPV = function (L, t, comp, name) {
  return this.pv(L.transform[name], t, L, comp);
};

/* 2D 父级链合成矩阵 */
Evaluator.prototype.worldMatrix2 = function (L, comp, t, cache) {
  if (cache && cache.has(L.id)) return cache.get(L.id);
  const T = L.transform;
  const anchor = this.pv(T.anchor, t, L, comp);
  const pos = this.pv(T.position, t, L, comp);
  const scl = this.pv(T.scale, t, L, comp);
  const rot = this.pv(T.rotation, t, L, comp) * Math.PI / 180;
  let m = localMatrix2(pos, anchor, scl, rot);
  if (L.parent) {
    const P = M.findLayer(comp, L.parent);
    if (P) {
      const pm = P.is3D ? null : this.worldMatrix2(P, comp, t, cache);
      if (pm) m = Mat3.mult(pm, m);
    }
  }
  if (cache) cache.set(L.id, m);
  return m;
};
function localMatrix2(pos, anchor, scl, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const sx = scl[0] / 100, sy = scl[1] / 100;
  /* translate(pos) * rotate * scale * translate(-anchor) */
  const a = c * sx, b = -s * sy, cc = s * sx, d = c * sy;
  const ax = anchor[0], ay = anchor[1];
  const m = [
    a, b, pos[0] - (a * ax + b * ay),
    cc, d, pos[1] - (cc * ax + d * ay),
    0, 0, 1
  ];
  return m;
}
/* 3D 世界矩阵（父级 3D 链；2D 父级只取平移，保持画面位置） */
Evaluator.prototype.worldMatrix3 = function (L, comp, t, chain) {
  chain = chain || new Set();
  const T = L.transform;
  const anchor = to3(this.pv(T.anchor, t, L, comp));
  const pos = to3(this.pv(T.position, t, L, comp));
  const scl = this.pv(T.scale, t, L, comp);
  const rz = this.pv(T.rotation, t, L, comp) * Math.PI / 180;
  const rx = T.rotationX ? this.pv(T.rotationX, t, L, comp) * Math.PI / 180 : 0;
  const ry = T.rotationY ? this.pv(T.rotationY, t, L, comp) * Math.PI / 180 : 0;
  const m = mat4TRS(pos, [rx, ry, rz], [scl[0] / 100, scl[1] / 100, (scl[2] !== undefined ? scl[2] : scl[0]) / 100], anchor);
  if (L.parent && !chain.has(L.parent)) {
    const P = M.findLayer(comp, L.parent);
    if (P) {
      chain.add(L.id);
      const pm = P.is3D ? this.worldMatrix3(P, comp, t, chain) : null;
      if (pm) return mat4Multiply(pm, m);
    }
  }
  return m;
};
function to3(v) {
  if (v.length === 3) return v;
  return [v[0], v[1], 0];
}

/* 设置/更换/解除父级时保持当前画面：补偿子层位置 */
Evaluator.prototype.reparentKeepFrame = function (comp, L, newParentId, t) {
  const oldWorld = L.is3D ? this.worldMatrix3(L, comp, t) : this.worldMatrix2(L, comp, t);
  L.parent = newParentId || null;
  if (L.is3D) {
    const newParent = M.findLayer(comp, newParentId);
    const pim = newParent && newParent.is3D ? mat4Invert(this.worldMatrix3(newParent, comp, t)) : mat4Identity();
    const local = mat4Multiply(pim, oldWorld);
    const anchor = to3(this.pv(L.transform.anchor, t, L, comp));
    const pos = [
      local[12] + local[0] * anchor[0] + local[4] * anchor[1] + local[8] * (anchor[2] || 0),
      local[13] + local[1] * anchor[0] + local[5] * anchor[1] + local[9] * (anchor[2] || 0),
      local[14] + local[2] * anchor[0] + local[6] * anchor[1] + local[10] * (anchor[2] || 0)
    ];
    if (L.transform.position.animated) M.setKey(L.transform.position, t, pos); else L.transform.position.value = pos;
  } else {
    const newParent = M.findLayer(comp, newParentId);
    const pim = newParent && !newParent.is3D ? invert2(this.worldMatrix2(newParent, comp, t)) : Mat3.identity();
    const local = Mat3.mult(pim, oldWorld);
    const anchor = this.pv(L.transform.anchor, t, L, comp);
    const pos = [local[2] + local[0] * anchor[0] + local[1] * anchor[1],
                 local[5] + local[3] * anchor[0] + local[4] * anchor[1]];
    if (L.transform.position.animated) M.setKey(L.transform.position, t, pos); else L.transform.position.value = pos;
  }
};
function invert2(m) {
  const det = m[0] * m[4] - m[1] * m[3];
  if (!det) return Mat3.identity();
  const id = 1 / det;
  return [
    m[4] * id, -m[1] * id, (m[1] * m[5] - m[4] * m[2]) * id,
    -m[3] * id, m[0] * id, (m[3] * m[2] - m[0] * m[5]) * id,
    0, 0, 1
  ];
}

/* 单独移动锚点：保持画面位置不变，自动补偿 position */
Evaluator.prototype.moveAnchorKeepFrame = function (comp, L, newAnchor, t) {
  const oldAnchor = this.pv(L.transform.anchor, t, L, comp);
  const pos = this.pv(L.transform.position, t, L, comp);
  const scl = this.pv(L.transform.scale, t, L, comp);
  const rot = this.pv(L.transform.rotation, t, L, comp) * Math.PI / 180;
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = (newAnchor[0] - oldAnchor[0]) * scl[0] / 100;
  const dy = (newAnchor[1] - oldAnchor[1]) * scl[1] / 100;
  const npos = [pos[0] + c * dx - s * dy, pos[1] + s * dx + c * dy];
  if (L.transform.anchor.animated) { M.setKey(L.transform.anchor, t, newAnchor); M.setKey(L.transform.position, t, npos); }
  else { L.transform.anchor.value = newAnchor.slice(); L.transform.position.value = npos; }
};

/* ---------------- 几何体解析（供 3D/粒子/节点共用） ---------------- */
Evaluator.prototype.layerGeometry = function (layerId) {
  const comp = this._lastComp, t = this._lastT;
  const L = M.findLayer(comp, layerId);
  if (!L) return null;
  if (L.type === 'text') return this.textGeometry(L, t, comp);
  if (L.type === 'shape') return this.shapeGeometry(L, t, comp);
  if (L.type === 'solid') {
    const w = L.solid.width, h = L.solid.height;
    const flat = ShapeGeom.flattenPath(M.rectPath(w, h), 0.5).map(c => c.pts);
    return { kind: 'plane', contours: flat, paths: [{ closed: true, contours: flat.map(c => ({ closed: true, pts: c })) }] };
  }
  if (L.type === 'geo') return this.geoGeometry(L, t, comp);
  return null;
};
Evaluator.prototype.textGeometry = function (L, t, comp) {
  const layout = Text2D.layoutText(L, t, (p, tt) => this.pv(p, tt, L, comp));
  const tp = Text2D.textPaths(layout);
  const flat = ShapeGeom.flattenPath(tp.all, 0.6).map(c => c.pts);
  return { kind: 'plane', contours: flat, paths: [tp.all], layout, perChar: tp.perChar, width: layout.width, height: layout.height };
};
Evaluator.prototype.shapeGeometry = function (L, t, comp) {
  const all = [];
  for (const grp of L.shapes) collectGroupShapes(grp, all, this, L, comp, t);
  const paths = all.map(a => a.path);
  const flat = [];
  for (const pth of paths) for (const c of ShapeGeom.flattenPath(pth, 0.6)) flat.push(c.pts);
  return { kind: 'plane', contours: flat, paths, fills: all.map(a => a.fill), strokes: all.map(a => a.stroke) };
};
Evaluator.prototype.geoGeometry = function (L, t, comp) {
  const G = L.geo;
  const refId = this.pv(G.refLayer, t, L, comp);
  let src = this.layerGeometry(refId);
  /* 节点图几何来源 */
  const nodeResults = this.evalGraph(comp, t);
  if (this.pv(G.source, t, L, comp) === 'node') {
    const nodeId = this.pv(G.refNode, t, L, comp);
    const r = nodeResults.get(nodeId);
    if (r && r.out) src = r.out;
  }
  if (!src) return null;
  const depth = this.pv(G.depth, t, L, comp);
  const bevel = this.pv(G.bevelSize, t, L, comp);
  const bevelSegs = this.pv(G.bevelSegs, t, L, comp);
  let contours = NodeGraph.geometryContours(src);
  /* 场驱动顶点变形（在挤出前的平面上作用 + z 置换） */
  const fieldDefs = (L.fieldIds || []).map(id => this.evaluateComp && this._fieldDef(id)).filter(Boolean);
  let displaced = null;
  if (fieldDefs.length) {
    const newContours = [];
    displaced = [];
    for (const ring of contours) {
      const nr = ring.map(p => {
        const f = Fields.combinedField(fieldDefs, p[0], p[1], 0, t);
        displaced.push([p[0] + f[0], p[1] + f[1], f[2]]);
        return [p[0] + f[0], p[1] + f[1]];
      });
      newContours.push(nr);
    }
    contours = newContours;
  }
  /* 图钉变形 */
  if (L.pins && L.pins.length) {
    contours = this.applyPins(L, contours, t, comp, displaced);
  }
  /* 弯曲/扭转：生成带 z 置换的前后面顶点（挤出时应用） */
  const bend = this.pv(G.bend, t, L, comp) * Math.PI / 180;
  const twist = this.pv(G.twist, t, L, comp) * Math.PI / 180;
  return { kind: 'solid', contours, depth, bevel, bevelSegs, displaced, bend, twist, source: src,
    castShadow: this.pv(G.castShadow, t, L, comp), receiveShadow: this.pv(G.receiveShadow, t, L, comp),
    material: {
      baseColor: this.pv(G.material.baseColor, t, L, comp),
      metalness: this.pv(G.material.metalness, t, L, comp),
      roughness: this.pv(G.material.roughness, t, L, comp),
      emissive: this.pv(G.material.emissive, t, L, comp),
      emissiveIntensity: this.pv(G.material.emissiveIntensity, t, L, comp),
      opacity: this.pv(G.material.opacity, t, L, comp)
    } };
};
Evaluator.prototype._fieldDef = function (id) {
  return this._fieldMap ? this._fieldMap.get(id) : null;
};
Evaluator.prototype.evalGraph = function (comp, t) {
  const cacheKey = comp.id + '|' + t.toFixed(5);
  if (this._graphCacheKey === cacheKey) return this._graphCache;
  const self = this;
  const ge = new NodeGraph.GraphEval();
  const results = ge.evaluate(comp.graph, {
    time: t,
    layerGeometry: id => {
      const L = M.findLayer(comp, id);
      if (!L) return null;
      if (L.type === 'text') return self.textGeometry(L, t, comp);
      if (L.type === 'shape') return self.shapeGeometry(L, t, comp);
      if (L.type === 'geo') return self.geoGeometry(L, t, comp);
      return null;
    },
    emitOutput() {}
  });
  this._graphCacheKey = cacheKey;
  this._graphCache = results;
  return results;
};

/* 图钉：移动控制点的二次坐标影响（带权重的双调和近似：高斯权重） */
Evaluator.prototype.applyPins = function (L, contours, t, comp, displacedIn) {
  const pins = L.pins.map(pn => ({
    from: pn.base,
    to: this.pv(pn.position, t, L, comp),
    radius: this.pv(pn.radius, t, L, comp)
  }));
  return contours.map(ring => ring.map(p => {
    let x = p[0], y = p[1];
    for (const pn of pins) {
      const dx = p[0] - pn.from[0], dy = p[1] - pn.from[1];
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * (pn.radius * pn.radius / 4 + 1)));
      x += (pn.to[0] - pn.from[0]) * w;
      y += (pn.to[1] - pn.from[1]) * w;
    }
    return [x, y];
  }));
};

/* 形状组求值：处理 路径/矩形/椭圆 + 修剪 + 重复器 + 填充/描边 */
function collectGroupShapes(group, out, ev, L, comp, t) {
  /* 从下往上处理：AE 顺序，数组内后出现的元素先绘制；操作器对其上方/下方几何作用，这里简化为全组收集 */
  const paths = [], fills = [], strokes = [], ops = [];
  let repeater = null, trim = null;
  for (const it of group.items) {
    if (it.type === 'group') {
      collectGroupShapes(it, out, ev, L, comp, t);
    } else if (it.type === 'rect') {
      const size = ev.pv(it.size, t, L, comp), posi = ev.pv(it.position, t, L, comp), r = ev.pv(it.roundness, t, L, comp);
      let pth = ShapeGeom.transformPath(M.rectPath(size[0], size[1], r), [1, 0, 0, 1, posi[0], posi[1]]);
      paths.push(pth);
    } else if (it.type === 'ellipse') {
      const size = ev.pv(it.size, t, L, comp), posi = ev.pv(it.position, t, L, comp);
      let pth = ShapeGeom.transformPath(M.ellipsePath(size[0], size[1]), [1, 0, 0, 1, posi[0], posi[1]]);
      paths.push(pth);
    } else if (it.type === 'path') {
      const d = it.d;
      let pth;
      if (d.animated && d.keys.length > 1) {
        const v0 = d.keys[0].paths, v1 = d.keys[d.keys.length - 1].paths;
        let u = 0;
        const tt = t;
        if (tt >= d.keys[d.keys.length - 1].t) pth = v1;
        else if (tt <= d.keys[0].t) pth = v0;
        else {
          let i = 0; while (i < d.keys.length - 1 && d.keys[i + 1].t <= tt) i++;
          u = (tt - d.keys[i].t) / (d.keys[i + 1].t - d.keys[i] || 1);
          pth = ShapeGeom.morphPath(d.keys[i].paths, d.keys[i + 1].paths, M.smooth(u));
        }
      } else pth = d.keys[0].paths;
      paths.push(pth);
    } else if (it.type === 'fill') {
      fills.push({ color: ev.pv(it.color, t, L, comp), opacity: ev.pv(it.opacity, t, L, comp) / 100, rule: ev.pv(it.fillRule, t, L, comp) });
    } else if (it.type === 'stroke') {
      strokes.push({ color: ev.pv(it.color, t, L, comp), opacity: ev.pv(it.opacity, t, L, comp) / 100,
        width: ev.pv(it.width, t, L, comp), cap: ev.pv(it.cap, t, L, comp), join: ev.pv(it.join, t, L, comp) });
    } else if (it.type === 'trim') trim = it;
    else if (it.type === 'repeater') repeater = it;
  }
  let work = paths.slice();
  if (trim) {
    const s = ev.pv(trim.start, t, L, comp), e = ev.pv(trim.end, t, L, comp), off = ev.pv(trim.offset, t, L, comp);
    work = work.map(p => ShapeGeom.trimPath(p, s, e, off));
  }
  if (repeater) {
    const copies = Math.round(ev.pv(repeater.copies, t, L, comp));
    const off = ev.pv(repeater.offset, t, L, comp);
    const rp = ev.pv(repeater.position, t, L, comp);
    const rs = ev.pv(repeater.scale, t, L, comp);
    const rr = ev.pv(repeater.rotation, t, L, comp);
    const so = ev.pv(repeater.startOpacity, t, L, comp) / 100, eo = ev.pv(repeater.endOpacity, t, L, comp) / 100;
    const expanded = [];
    for (let i = 0; i < copies; i++) {
      const u = copies > 1 ? i / (copies - 1) : 0;
      const scl = [M.lerp(100, rs[0], u) / 100, M.lerp(100, rs[1], u) / 100];
      const rot = (rr * (i + off)) * Math.PI / 180;
      const pos = [rp[0] * (i + off), rp[1] * (i + off)];
      const opa = M.lerp(so, eo, u);
      const m = composeRepeater(pos, scl, rot);
      for (const pth of work) {
        const np = ShapeGeom.transformPath(pth, m);
        expanded.push(np);
        const f = fills.map(x => ({ ...x, opacity: x.opacity * opa }));
        out.push({ path: np, fill: f[0], stroke: strokes[0] ? { ...strokes[0], opacity: strokes[0].opacity * opa } : null });
      }
    }
    return;
  }
  for (const pth of work) out.push({ path: pth, fill: fills[fills.length - 1] || null, stroke: strokes[strokes.length - 1] || null });
}
function composeRepeater(pos, scl, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [c * scl[0], s * scl[0], -s * scl[1], c * scl[1], pos[0], pos[1]];
}

global.CompEval = {
  Evaluator, Mat3, mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt, mat4TRS,
  mat4ApplyPoint, mat4Invert, localMatrix2, invert2, to3
};
})(window);
