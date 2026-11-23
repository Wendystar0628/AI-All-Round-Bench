/* core.js — 数学、相机、工具 */
(function () {
  const App = (window.App = window.App || {});

  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // ---------- vec3 (plain arrays) ----------
  const V3 = {
    create(x = 0, y = 0, z = 0) { return new Float32Array([x, y, z]); },
    set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; },
    copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
    add(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
    sub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
    scale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
    addScaled(o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross(o, a, b) {
      const ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
      o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx; return o;
    },
    len(a) { return Math.hypot(a[0], a[1], a[2]); },
    len2(a) { return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; },
    dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); },
    normalize(o, a) {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
    },
    lerp(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; },
  };

  // ---------- mat4 (column major, Float32Array(16)) ----------
  const M4 = {
    create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    copy(o, a) { o.set(a); return o; },
    translation(x, y, z) { const m = M4.create(); m[12] = x; m[13] = y; m[14] = z; return m; },
    scaling(x, y, z) { const m = new Float32Array(16); m[0] = x; m[5] = y; m[10] = z; m[15] = 1; return m; },
    multiply(o, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      return o;
    },
    perspective(o, fovY, aspect, near, far) {
      const f = 1 / Math.tan(fovY / 2);
      o.fill(0);
      o[0] = f / aspect; o[5] = f;
      o[10] = (far + near) / (near - far); o[11] = -1;
      o[14] = (2 * far * near) / (near - far);
      return o;
    },
    ortho(o, l, r, b, t, n, f) {
      o.fill(0);
      o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[15] = 1;
      o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n);
      return o;
    },
    lookAt(o, eye, target, up) {
      const z = V3.create(); V3.sub(z, eye, target); V3.normalize(z, z);
      const x = V3.create(); V3.cross(x, up, z); V3.normalize(x, x);
      const y = V3.create(); V3.cross(y, z, x);
      M4.identity(o);
      o[0] = x[0]; o[1] = y[0]; o[2] = z[0];
      o[4] = x[1]; o[5] = y[1]; o[6] = z[1];
      o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
      o[12] = -V3.dot(x, eye); o[13] = -V3.dot(y, eye); o[14] = -V3.dot(z, eye);
      return o;
    },
    invert(o, a) {
      const inv = new Float32Array(16);
      inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
      inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
      inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
      inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
      inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
      inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
      inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
      inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
      inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
      inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
      inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
      inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
      inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
      inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
      inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
      inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
      let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
      if (det === 0) { o.set(M4.create()); return o; }
      det = 1 / det;
      for (let i = 0; i < 16; i++) o[i] = inv[i] * det;
      return o;
    },
    transformPoint(o, m, p) {
      const x = p[0], y = p[1], z = p[2];
      o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      return o;
    },
  };

  // ---------- 轨道相机 ----------
  class OrbitCamera {
    constructor() {
      this.target = new Float32Array([0, 0.35, 0]);
      this.distance = 2.6;
      this.yaw = -0.7;      // 绕 y
      this.pitch = 0.42;    // 仰角
      this.fov = 42 * Math.PI / 180;
      this.near = 0.02;
      this.far = 60;
      this.position = new Float32Array(3);
      this.view = M4.create();
      this.proj = M4.create();
      this.viewProj = M4.create();
      this.invViewProj = M4.create();
      this.update(1, 1);
    }
    update(aspect, dt) {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      this.position[0] = this.target[0] + this.distance * cp * sy;
      this.position[1] = this.target[1] + this.distance * sp;
      this.position[2] = this.target[2] + this.distance * cp * cy;
      M4.lookAt(this.view, this.position, this.target, [0, 1, 0]);
      M4.perspective(this.proj, this.fov, aspect, this.near, this.far);
      M4.multiply(this.viewProj, this.proj, this.view);
      M4.invert(this.invViewProj, this.viewProj);
      return this;
    }
    forward(o) { V3.normalize(o, [this.target[0] - this.position[0], this.target[1] - this.position[1], this.target[2] - this.position[2]]); return o; }
    // 由屏幕坐标得到世界射线
    screenRay(px, py, w, h, outOrigin, outDir) {
      const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
      const p = M4.transformPoint([], this.invViewProj, [nx, ny, 1]);
      outOrigin.set(this.position);
      V3.sub(outDir, p, this.position); V3.normalize(outDir, outDir);
      return outDir;
    }
  }

  // ---------- 简单的 UI 构建辅助 ----------
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function makeSlider(parent, opts) {
    const row = el('div', 'row');
    const lab = el('label', '', opts.label);
    const out = el('output', '', opts.value.toFixed(opts.decimals === undefined ? 2 : opts.decimals));
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = opts.min; inp.max = opts.max; inp.step = opts.step;
    inp.value = opts.value;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      out.textContent = v.toFixed(opts.decimals === undefined ? 2 : opts.decimals);
      opts.onInput(v);
    });
    row.appendChild(lab); row.appendChild(inp); row.appendChild(out);
    parent.appendChild(row);
    return {
      set(v) { inp.value = v; out.textContent = v.toFixed(opts.decimals === undefined ? 2 : opts.decimals); },
      getValue() { return parseFloat(inp.value); },
      row,
    };
  }

  function makeSeg(parent, opts) {
    const seg = el('div', 'seg');
    const btns = [];
    opts.options.forEach((o, i) => {
      const b = el('button', i === opts.index ? 'on' : '', o.label);
      b.addEventListener('click', () => {
        btns.forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        opts.onPick(i, o.value);
      });
      seg.appendChild(b); btns.push(b);
    });
    parent.appendChild(seg);
    return {
      set(i) { btns.forEach((x, j) => x.classList.toggle('on', i === j)); },
      seg,
    };
  }

  App.util = { clamp, lerp, smoothstep, damp, rand, TAU, V3, M4, OrbitCamera, el, makeSlider, makeSeg };
  App.V3 = V3; App.M4 = M4;
})();
