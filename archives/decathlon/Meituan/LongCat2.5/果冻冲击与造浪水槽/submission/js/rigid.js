/* rigid.js — 刚性小球：重力、球-球碰撞、滚动、与静态环境碰撞 */
(function () {
  const App = (window.App = window.App || {});
  const { V3 } = App.util;

  let _id = 1;

  class Balls {
    constructor() {
      this.list = [];
      this.gravity = -9.8;
      this.restitution = 0.42;
      this.friction = 0.35;
      this.airDrag = 0.02;
      this.onCollide = null;   // (ball, other, impulse, point) => void  音效用
      this.events = [];
    }

    clear() { this.list.length = 0; this.events.length = 0; }

    add(opts) {
      const r = opts.radius;
      const rho = opts.density;
      const m = (4 / 3) * Math.PI * r * r * r * rho;
      const b = {
        id: _id++,
        p: new Float32Array(opts.pos),
        v: new Float32Array(opts.vel || [0, 0, 0]),
        w: new Float32Array(opts.spin || [0, 0, 0]),
        r, m, invM: 1 / m,
        invI: 1 / (0.4 * m * r * r),
        rho, color: opts.color || [0.8, 0.3, 0.3, 1],
        group: opts.group || 0,
        rest: opts.restitution === undefined ? this.restitution : opts.restitution,
        fric: opts.friction === undefined ? this.friction : opts.friction,
        resting: 0,
        inWater: 0,
        mesh: null,
        submerged: 0,
      };
      this.list.push(b);
      return b;
    }

    step(dt, collideStatic) {
      const g = this.gravity;
      for (const b of this.list) {
        b.v[1] += g * dt;
        // 空气阻力
        const sp = Math.hypot(b.v[0], b.v[1], b.v[2]);
        if (sp > 1e-6) {
          const k = Math.max(0, 1 - this.airDrag * dt * sp);
          b.v[0] *= k; b.v[1] *= k; b.v[2] *= k;
        }
        b.p[0] += b.v[0] * dt;
        b.p[1] += b.v[1] * dt;
        b.p[2] += b.v[2] * dt;
        // 角速度衰减 + 由滚动驱动
        const wlen = Math.hypot(b.w[0], b.w[1], b.w[2]);
        if (wlen > 1e-6) {
          const k = Math.max(0, 1 - 0.6 * dt);
          b.w[0] *= k; b.w[1] *= k; b.w[2] *= k;
        }
        if (collideStatic) collideStatic(b, dt, this);
      }
      this.collide(dt);
    }

    collide(dt) {
      const L = this.list;
      for (let i = 0; i < L.length; i++) {
        const a = L[i];
        for (let j = i + 1; j < L.length; j++) {
          const b = L[j];
          const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2];
          const rr = a.r + b.r;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-12) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const pen = rr - d;
          const im = a.invM + b.invM;
          // 位置修正
          const corr = pen / im * 0.8;
          a.p[0] -= nx * corr * a.invM; a.p[1] -= ny * corr * a.invM; a.p[2] -= nz * corr * a.invM;
          b.p[0] += nx * corr * b.invM; b.p[1] += ny * corr * b.invM; b.p[2] += nz * corr * b.invM;
          // 法向冲量
          const rvx = b.v[0] - a.v[0], rvy = b.v[1] - a.v[1], rvz = b.v[2] - a.v[2];
          const vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            const e = Math.min(a.rest, b.rest);
            const jn = -(1 + e) * vn / im;
            a.v[0] -= nx * jn * a.invM; a.v[1] -= ny * jn * a.invM; a.v[2] -= nz * jn * a.invM;
            b.v[0] += nx * jn * b.invM; b.v[1] += ny * jn * b.invM; b.v[2] += nz * jn * b.invM;
            // 切向摩擦
            const tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz;
            const tl = Math.hypot(tx, ty, tz);
            if (tl > 1e-6) {
              const f = Math.min(a.fric, b.fric) * jn / tl;
              a.v[0] += tx * f * a.invM; a.v[1] += ty * f * a.invM; a.v[2] += tz * f * a.invM;
              b.v[0] -= tx * f * b.invM; b.v[1] -= ty * f * b.invM; b.v[2] -= tz * f * b.invM;
            }
            const imp = Math.abs(jn);
            if (imp > 0.02) this.events.push({ type: 'ball', a, b, imp, p: [a.p[0] + nx * a.r, a.p[1] + ny * a.r, a.p[2] + nz * a.r] });
          }
        }
      }
    }

    // 球与果冻节点耦合：把节点推离球面，并把反作用力累加到球上
    applyJellyContact(nodes, nodeRadius, stiff, dt, onHit) {
      for (const b of this.list) {
        const rr = b.r + nodeRadius;
        const r2 = rr * rr;
        let fx = 0, fy = 0, fz = 0;
        for (let i = 0; i < nodes.length; i += 3) {
          const dx = nodes[i] - b.p[0], dy = nodes[i + 1] - b.p[1], dz = nodes[i + 2] - b.p[2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= r2 || d2 < 1e-12) continue;
          const d = Math.sqrt(d2);
          const pen = rr - d;
          const nx = dx / d, ny = dy / d, nz = dz / d;
          // 节点被推出（写入 nodeVel 由调用方处理），这里只累积反作用
          const f = pen * stiff;
          fx -= nx * f; fy -= ny * f; fz -= nz * f;
        }
        b.v[0] += fx * b.invM * dt;
        b.v[1] += fy * b.invM * dt;
        b.v[2] += fz * b.invM * dt;
      }
    }
  }

  App.Balls = Balls;
})();
