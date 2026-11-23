// 向量与矩阵工具。矩阵为列主序 Float32Array(16)，与 WGSL / WebGPU 约定一致。
const Vec3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

const Mat4 = {
  // 深度范围 [0,1]（WebGPU）
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, far * nf, -1,
      0, 0, far * near * nf, 0,
    ]);
  },
  ortho(l, r, b, t, n, f) {
    return new Float32Array([
      2 / (r - l), 0, 0, 0,
      0, 2 / (t - b), 0, 0,
      0, 0, 1 / (n - f), 0,
      -(r + l) / (r - l), -(t + b) / (t - b), n / (n - f), 1,
    ]);
  },
  lookAt(eye, target, up) {
    const z = Vec3.norm(Vec3.sub(eye, target));
    const x = Vec3.norm(Vec3.cross(up, z));
    const y = Vec3.cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -Vec3.dot(x, eye), -Vec3.dot(y, eye), -Vec3.dot(z, eye), 1,
    ]);
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  },
};

// 轨道相机：绕 target 旋转、推拉
class OrbitCam {
  constructor(target, yaw, pitch, dist, fovy) {
    this.target = target.slice();
    this.yaw = yaw;
    this.pitch = pitch;
    this.dist = dist;
    this.fovy = fovy;
  }
  eye() {
    const cp = Math.cos(this.pitch);
    return [
      this.target[0] + this.dist * cp * Math.sin(this.yaw),
      this.target[1] + this.dist * Math.sin(this.pitch),
      this.target[2] + this.dist * cp * Math.cos(this.yaw),
    ];
  }
}

// 相机与灯光的统一布局（WGSL struct Cam，共 64 个 float = 256 字节）：
// [0..15] viewProj  [16..31] view  [32..47] lightVP  [48..51] eye
// [52..55] lightDir(指向光源)  [56..59] screen(w,h,1/w,1/h)  [60..63] misc(time)
const CamPack = {
  build(out, eye, target, fovy, aspect, lightDir, lightVP, screenW, screenH, time) {
    const view = Mat4.lookAt(eye, target, [0, 1, 0]);
    const proj = Mat4.perspective(fovy, aspect, 0.02, 60);
    out.set(Mat4.mul(proj, view), 0);
    out.set(view, 16);
    out.set(lightVP, 32);
    out.set([eye[0], eye[1], eye[2], 1], 48);
    out.set([lightDir[0], lightDir[1], lightDir[2], 0], 52);
    out.set([screenW, screenH, 1 / screenW, 1 / screenH], 56);
    out.set([time || 0, 0, 0, 0], 60);
    return out;
  },
};

const Rng = {
  // 可复现的伪随机数（mulberry32），导出时保证每次 begin 结果一致
  make(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
};

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function smooth01(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
