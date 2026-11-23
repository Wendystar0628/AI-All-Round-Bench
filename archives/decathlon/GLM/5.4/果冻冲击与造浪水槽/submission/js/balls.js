'use strict';
/* ---------------------------------------------------------------------------
   Rigid spheres shared by both scenes (impulse based contacts, rolling)
--------------------------------------------------------------------------- */

class Ball {
  constructor(cfg) {
    this.p = cfg.p.slice();
    this.v = cfg.v ? cfg.v.slice() : [0, 0, 0];
    this.q = [0, 0, 0, 1];
    this.w = cfg.w ? cfg.w.slice() : [0, 0, 0];
    this.r = cfg.r;
    this.density = cfg.density || 1000;
    this.color = cfg.color || [0.8, 0.8, 0.8];
    this.group = cfg.group || 0;
    this.mass = (4 / 3) * Math.PI * Math.pow(this.r, 3) * this.density;
    this.invMass = 1 / this.mass;
    this.inertia = (2 / 5) * this.mass * this.r * this.r;
    this.invInertia = 1 / this.inertia;
    this.dead = false;
    this.hitCooldown = 0;
    this.rest = 0.35;
    this.fric = 0.45;
    this.scaleV = 1;
  }

  integrate(dt) {
    this.v[1] -= 9.8 * dt;
    this.p[0] += this.v[0] * dt;
    this.p[1] += this.v[1] * dt;
    this.p[2] += this.v[2] * dt;
    // integrate orientation
    const wl = Math.hypot(this.w[0], this.w[1], this.w[2]);
    if (wl > 1e-6) {
      const dq = Quat.fromAxisAngle([this.w[0] / wl, this.w[1] / wl, this.w[2] / wl], wl * dt);
      Quat.normalize(this.q, Quat.mul([0, 0, 0, 0], dq, this.q));
    }
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
  }

  velocityAt(px, py, pz) {
    const rx = px - this.p[0], ry = py - this.p[1], rz = pz - this.p[2];
    return [this.v[0] + this.w[1] * rz - this.w[2] * ry,
      this.v[1] + this.w[2] * rx - this.w[0] * rz,
      this.v[2] + this.w[0] * ry - this.w[1] * rx];
  }

  applyImpulse(jx, jy, jz, px, py, pz) {
    this.v[0] += jx * this.invMass;
    this.v[1] += jy * this.invMass;
    this.v[2] += jz * this.invMass;
    const rx = px - this.p[0], ry = py - this.p[1], rz = pz - this.p[2];
    this.w[0] += (ry * jz - rz * jy) * this.invInertia;
    this.w[1] += (rz * jx - rx * jz) * this.invInertia;
    this.w[2] += (rx * jy - ry * jx) * this.invInertia;
  }
}

const BallCollide = {
  pair(a, b, restitution, friction) {
    const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2];
    const d = Math.hypot(dx, dy, dz);
    const rr = a.r + b.r;
    if (d >= rr || d < 1e-9) return false;
    const nx = dx / d, ny = dy / d, nz = dz / d;
    const pen = rr - d;
    const wa = a.invMass, wb = b.invMass;
    const ws = wa + wb;
    a.p[0] -= nx * pen * (wa / ws); a.p[1] -= ny * pen * (wa / ws); a.p[2] -= nz * pen * (wa / ws);
    b.p[0] += nx * pen * (wb / ws); b.p[1] += ny * pen * (wb / ws); b.p[2] += nz * pen * (wb / ws);
    const cx = a.p[0] + nx * a.r, cy = a.p[1] + ny * a.r, cz = a.p[2] + nz * a.r;
    const va = a.velocityAt(cx, cy, cz);
    const vb = b.velocityAt(cx, cy, cz);
    const rvx = vb[0] - va[0], rvy = vb[1] - va[1], rvz = vb[2] - va[2];
    const vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn >= 0) return false;
    const e = restitution;
    const jn = -(1 + e) * vn / ws;
    a.applyImpulse(-jn * nx, -jn * ny, -jn * nz, cx, cy, cz);
    b.applyImpulse(jn * nx, jn * ny, jn * nz, cx, cy, cz);
    // friction
    let tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl > 1e-6) {
      tx /= tl; ty /= tl; tz /= tl;
      const vt = rvx * tx + rvy * ty + rvz * tz;
      const jt = clamp(-vt / (ws * 3.5), -friction * jn, friction * jn);
      a.applyImpulse(-jt * tx, -jt * ty, -jt * tz, cx, cy, cz);
      b.applyImpulse(jt * tx, jt * ty, jt * tz, cx, cy, cz);
    }
    return true;
  },

  // infinite plane dot(n, p) = d
  plane(ball, nx, ny, nz, d, restitution, friction) {
    const dist = ball.p[0] * nx + ball.p[1] * ny + ball.p[2] * nz - d;
    const pen = ball.r - dist;
    if (pen <= 0) return false;
    ball.p[0] += nx * pen; ball.p[1] += ny * pen; ball.p[2] += nz * pen;
    const cx = ball.p[0] - nx * ball.r, cy = ball.p[1] - ny * ball.r, cz = ball.p[2] - nz * ball.r;
    const va = ball.velocityAt(cx, cy, cz);
    const vn = va[0] * nx + va[1] * ny + va[2] * nz;
    if (vn < 0) {
      const jn = -(1 + restitution) * vn / (ball.invMass * 3.5);
      ball.applyImpulse(jn * nx, jn * ny, jn * nz, cx, cy, cz);
      let tx = va[0] - vn * nx, ty = va[1] - vn * ny, tz = va[2] - vn * nz;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-6) {
        tx /= tl; ty /= tl; tz /= tl;
        const vt = va[0] * tx + va[1] * ty + va[2] * tz;
        const jt = clamp(-vt / (ball.invMass * 3.5), -friction * jn, friction * jn);
        ball.applyImpulse(jt * tx, jt * ty, jt * tz, cx, cy, cz);
      }
    }
    return true;
  },

  heightfield(ball, hFn, restitution, friction) {
    const h = hFn(ball.p[0], ball.p[2]);
    const pen = ball.r - (ball.p[1] - h);
    if (pen <= 0) return false;
    // normal from finite differences
    const e = 0.01;
    const hx = (hFn(ball.p[0] + e, ball.p[2]) - hFn(ball.p[0] - e, ball.p[2])) / (2 * e);
    const hz = (hFn(ball.p[0], ball.p[2] + e) - hFn(ball.p[0], ball.p[2] - e)) / (2 * e);
    let nx = -hx, ny = 1, nz = -hz;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    ball.p[0] += nx * pen; ball.p[1] += ny * pen; ball.p[2] += nz * pen;
    const cx = ball.p[0] - nx * ball.r, cy = ball.p[1] - ny * ball.r, cz = ball.p[2] - nz * ball.r;
    const va = ball.velocityAt(cx, cy, cz);
    const vn = va[0] * nx + va[1] * ny + va[2] * nz;
    if (vn < 0) {
      const jn = -(1 + restitution) * vn / (ball.invMass * 3.5);
      ball.applyImpulse(jn * nx, jn * ny, jn * nz, cx, cy, cz);
      let tx = va[0] - vn * nx, ty = va[1] - vn * ny, tz = va[2] - vn * nz;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-6) {
        tx /= tl; ty /= tl; tz /= tl;
        const vt = va[0] * tx + va[1] * ty + va[2] * tz;
        const jt = clamp(-vt / (ball.invMass * 3.5), -friction * jn, friction * jn);
        ball.applyImpulse(jt * tx, jt * ty, jt * tz, cx, cy, cz);
      }
    }
    return true;
  },

  // axis aligned box interior walls: keep the ball inside [min,max]
  boxInside(ball, min, max, restitution, friction) {
    let hit = false;
    for (let a = 0; a < 3; a++) {
      const lo = min[a] + ball.r, hi = max[a] - ball.r;
      if (ball.p[a] < lo) {
        ball.p[a] = lo;
        if (ball.v[a] < 0) ball.v[a] = -ball.v[a] * restitution;
        // spin from wall friction
        hit = true;
      } else if (ball.p[a] > hi) {
        ball.p[a] = hi;
        if (ball.v[a] > 0) ball.v[a] = -ball.v[a] * restitution;
        hit = true;
      }
    }
    return hit;
  },
};
