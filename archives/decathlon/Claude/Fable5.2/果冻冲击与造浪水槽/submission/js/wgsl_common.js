'use strict';
/* 两个场景共用的 WGSL 片段：刚体球结构、四元数、球-球/球-平面碰撞 */
JW.BALL_FLOATS = 32;           // 每颗球 32 个 float（128 字节）
JW.WGSL_BALL = /* wgsl */`
struct Ball {
  pos: vec3f, radius: f32,
  vel: vec3f, mass: f32,
  quat: vec4f,
  ang: vec3f, alive: f32,
  acc: vec3f, wet: f32,
  ev: vec4f,     // x 最近一次硬碰撞时刻, y 强度(接近速度), z 类型(1 台面/槽壁/地形, 2 球-球), w 材质或分组
  ev2: vec4f,    // x 入水时刻, y 入水速度, z 果冻接触冲量(平滑), w 相对密度
  ev3: vec4f,    // x 果冻撞击时刻, y 撞击峰值, z 累计滚动量, w 备用
};
fn qmul(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(a.w*b.xyz + b.w*a.xyz + cross(a.xyz, b.xyz), a.w*b.w - dot(a.xyz, b.xyz));
}
fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0*cross(q.xyz, v);
  return v + q.w*t + cross(q.xyz, t);
}
fn qintegrate(q: vec4f, w: vec3f, dt: f32) -> vec4f {
  return normalize(q + 0.5*dt*qmul(vec4f(w, 0.0), q));
}
`;

JW.WGSL_BALL_COLLIDE = /* wgsl */`
struct Hit { dv: vec3f, dw: vec3f, dp: vec3f, s: f32 };
// A 受 B 的作用（双方各自独立计算，同一初态下冲量对称）
fn ballPair(A: Ball, B: Ball, e: f32, mu: f32) -> Hit {
  var h: Hit;
  h.dv = vec3f(0.0); h.dw = vec3f(0.0); h.dp = vec3f(0.0); h.s = 0.0;
  let d = A.pos - B.pos;
  let l = length(d);
  let R = A.radius + B.radius;
  if (l >= R || l < 1e-6) { return h; }
  let n = d/l;
  let ra = -n*A.radius;
  let rb = n*B.radius;
  let vr = (A.vel + cross(A.ang, ra)) - (B.vel + cross(B.ang, rb));
  let vn = dot(vr, n);
  let ima = 1.0/A.mass;
  let imb = 1.0/B.mass;
  h.dp = n*(R - l)*(ima/(ima + imb))*0.9;
  if (vn < 0.0) {
    let ee = select(e, 0.0, vn > -0.06);
    let j = -(1.0 + ee)*vn/(ima + imb);
    var J = j*n;
    let vt = vr - vn*n;
    let lt = length(vt);
    if (lt > 1e-5) {
      let jt = min(mu*j, lt/(3.5*(ima + imb)));
      J -= vt/lt*jt;
    }
    h.dv = J*ima;
    h.dw = cross(ra, J)*(2.5*ima/(A.radius*A.radius));
    h.s = -vn;
  }
  return h;
}
// 球与(可运动)平面: n 为平面外法线, pen 为嵌入深度(>0), vp 为平面速度。返回接近速度
fn ballPlane(B: ptr<function, Ball>, n: vec3f, pen: f32, vp: vec3f, e: f32, mu: f32) -> f32 {
  (*B).pos += n*pen;
  let r = -n*(*B).radius;
  let vr = (*B).vel + cross((*B).ang, r) - vp;
  let vn = dot(vr, n);
  if (vn >= 0.0) { return 0.0; }
  let ee = select(e, 0.0, vn > -0.12);
  let j = -(1.0 + ee)*vn;
  var J = j*n;
  let vt = vr - vn*n;
  let lt = length(vt);
  if (lt > 1e-5) {
    let jt = min(mu*j, lt/3.5);
    J -= vt/lt*jt;
  }
  (*B).vel += J;
  (*B).ang += cross(r, J)*(2.5/((*B).radius*(*B).radius));
  return -vn;
}
`;
