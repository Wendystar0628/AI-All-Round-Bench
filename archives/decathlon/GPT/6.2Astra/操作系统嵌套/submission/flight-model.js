// Deterministic flight equations used to author the reference recording and run live rehearsals.
function advanceFlight(f, signal, h, t, ground) {
  if (f.contact) {
    const a = Math.min(1.45, Math.max(0, t - f.contact.t));
    let c = f.contact;
    f.x = c.x + (c.vx * (1 - Math.exp(-3 * a))) / 3;
    f.z = c.z + (c.vz * (1 - Math.exp(-3 * a))) / 3;
    f.y = c.y + Math.max(0, 0.26 * Math.sin(a * 9) * Math.exp(-3 * a));
    f.roll = c.roll + (c.roll < 0 ? -0.68 : 0.68) * (1 - Math.exp(-3 * a));
    f.tilt = c.tilt - 0.29 * (1 - Math.exp(-4 * a));
    return false;
  }
  const [lift, rudder, yaw] = signal.c || [0, 0, 0],
    wind = signal.wind || 0;
  f.spin +=
    (rudder +
      1.55 * f.roll +
      0.28 * Math.sin(t * 2.4) +
      wind * 0.09 +
      (signal.fault ? 2.8 : 0)) *
    h;
  f.roll += f.spin * h;
  f.vy +=
    (Math.min(24, Math.max(0, lift)) *
      (signal.fault ? 0.28 : 1) *
      Math.cos(f.roll) -
      9.81) *
    h;
  const oldY = f.y;
  f.y += f.vy * h;
  f.yaw += (yaw - f.yaw) * h * 1.6;
  let speed = signal.speed ?? 1.7,
    vx = signal.landing
      ? Math.max(-3, Math.min(3, 18 - f.x))
      : speed * Math.cos(f.yaw),
    vz = signal.landing
      ? Math.max(-3, Math.min(3, -3 - f.z))
      : speed * Math.sin(f.yaw);
  f.vx += (vx + wind * 0.24 - f.vx) * h;
  f.vz += (vz + Math.sin(f.roll) * 2 - f.vz) * h;
  f.x += f.vx * h;
  f.z += f.vz * h;
  f.tilt += (-f.vx * 0.045 - (signal.fault ? 0.45 : 0) - f.tilt) * h * 2.8;
  if (f.y < ground) {
    const impact = oldY >= ground && f.vy < -2.4;
    f.y = ground;
    f.vy = 0;
    if (impact) {
      f.contact = {
        t,
        x: f.x,
        y: f.y,
        z: f.z,
        vx: f.vx,
        vz: f.vz,
        roll: f.roll,
        tilt: f.tilt,
      };
      return true;
    }
  }
  return false;
}
function terrainRelief(n,x,z){
  let h=0;
  for(let [cx,cz,rx,rz,height] of n.hills||[]){
    let falloff=Math.max(0,1-((x-cx)/rx)**2-((z-cz)/rz)**2);
    h+=height*falloff*falloff;
  }
  return h;
}
function collisionHeight(nodes, x, z) {
  let level = 0;
  for (let n of nodes) {
    if (n.parent) continue;
    let dx = x - n.p[0],
      dz = z - n.p[2],
      sz = n.size||[1,1,1];
    if(n.shape==="terrain"&&Math.abs(dx)<=sz[0]/2&&Math.abs(dz)<=sz[2]/2)level=Math.max(level,n.p[1]+sz[1]/2+terrainRelief(n,x,z));
    if (
      n.shape === "box" &&
      Math.abs(dx) <= sz[0] / 2 &&
      Math.abs(dz) <= sz[2] / 2
    )
      level = Math.max(level, n.p[1] + sz[1] / 2);
    if (
      n.shape === "cyl" &&
      (dx * dx) / (sz[0] * sz[0]) + (dz * dz) / (sz[2] * sz[2]) <= 1
    )
      level = Math.max(level, n.p[1] + sz[1] / 2);
    if (["peak", "pine", "rock"].includes(n.shape)) {
      let radius = Math.hypot(dx / sz[0], dz / sz[2]);
      if (radius < 1)
        level = Math.max(
          level,
          n.p[1] +
            sz[1] *
              (n.shape === "rock"
                ? Math.sqrt(1 - radius * radius)
                : 0.5 - radius),
        );
    }
  }
  return level;
}
if (typeof module !== "undefined")
  module.exports = { advanceFlight, collisionHeight,terrainRelief };
