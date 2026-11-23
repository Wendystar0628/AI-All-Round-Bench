// ---------- cinematic tour ----------
const TOUR = { duration: 69, shots: [], fov: 34 };

function initTour() {
  const S = (t0, t1, p0, p1, q0, q1, fov0, fov1, follow) => ({
    t0, t1,
    p0: new THREE.Vector3(p0[0], p0[1], p0[2]),
    p1: new THREE.Vector3(p1[0], p1[1], p1[2]),
    q0: new THREE.Vector3(q0[0], q0[1], q0[2]),
    q1: new THREE.Vector3(q1[0], q1[1], q1[2]),
    fov0: fov0 === undefined ? 38 : fov0,
    fov1: fov1 === undefined ? fov0 || 38 : fov1,
    follow: !!follow
  });
  TOUR.shots = [
    // 1 establishing
    S(0, 5.5, [66, 43, 64], [55, 35, 55], [0, 0.5, 0], [-1, 0.5, 1], 36, 34),
    // 2 lateral along the quay
    S(5.5, 11, [16, 7.5, 21], [-2, 6.0, 18.5], [-2, 1.6, 8.5], [-6, 1.4, 7.0], 38, 38),
    // 3 gull close-up
    S(11, 16, [-6.2, 2.3, 10.9], [-7.0, 2.0, 10.2], [-11, 0.95, 8.75], [-11, 0.95, 8.75], 30, 30),
    // 4 wheelhouse interior
    S(16, 21.5, [-6.2, 2.0, 5.6], [-6.8, 1.8, 5.0], [-9.4, 1.35, 3.9], [-9.5, 1.3, 3.8], 34, 34),
    // 5 cases / umbrella / puddle
    S(21.5, 27, [-1.8, 2.7, 15.4], [-3.2, 2.2, 14.4], [-6.2, 0.7, 10.4], [-6.6, 0.6, 10.2], 38, 38),
    // 6 cat beside the upturned skiff
    S(27, 32, [7.4, 0.7, 14.7], [7.0, 0.55, 14.0], [5.3, 0.12, 13.3], [5.3, 0.12, 13.3], 30, 30),
    // 7 wind / nets / windsock
    S(32, 37.5, [0.5, 4.6, 22.5], [-0.5, 4.2, 21.5], [-1.5, 2.2, 12.8], [-1.0, 2.1, 12.5], 60, 60),
    // 8 warehouse
    S(37.5, 43, [-12.6, 1.9, 8.8], [-14.4, 1.6, 10.0], [-18.2, 1.3, 18.0], [-18.4, 1.2, 18.5], 42, 42),
    // 9 waiting room
    S(43, 48, [-5.4, 2.5, 12.2], [-2.6, 2.0, 13.2], [-3.4, 1.5, 20.0], [-3.0, 1.5, 20.2], 40, 40),
    // 10 underwater section
    S(48, 53, [36, 0.8, 14], [32, -1.4, 10], [20, -3.2, 8.5], [19, -3.2, 7.0], 40, 40),
    // 11 lighthouse / tetrapods
    S(53, 58, [25, 8.5, 5], [23, 7.5, 0], [10, 5.2, -10.3], [10, 5.0, -10.8], 38, 38),
    // 12 follow the departing boat
    S(58, 64, [14, 11, 17], [12, 10, 15], [0, 1.5, 0], [0, 1.4, 0], 40, 40, true),
    // 13 pull out
    S(64, 69, [24, 24, 30], [34, 36, 44], [0, 0.5, 0], [0, 0.5, 0], 40, 40, true)
  ];
}

function tourCameraAt(t) {
  const shots = TOUR.shots;
  let shot = shots[shots.length - 1];
  for (let i = 0; i < shots.length; i++) {
    if (t >= shots[i].t0 && t < shots[i].t1) { shot = shots[i]; break; }
    if (t >= shots[shots.length - 1].t0) shot = shots[shots.length - 1];
  }
  const u = clamp((t - shot.t0) / (shot.t1 - shot.t0), 0, 1);
  const e = easeInOut(u);
  const p = shot.p0.clone().lerp(shot.p1, e);
  const q = shot.q0.clone().lerp(shot.q1, e);
  if (shot.follow) {
    const base = (BOATS.hero ? BOATS.hero.group.position : new THREE.Vector3()).clone();
    p.copy(base).add(shot.p0.clone().lerp(shot.p1, e));
    q.copy(base).add(shot.q0.clone().lerp(shot.q1, e));
  } else {
    // gentle breathing so the frame is never dead still
    p.x += Math.sin(t * 0.21) * 0.05;
    p.y += Math.sin(t * 0.17 + 1.2) * 0.04;
    q.x += Math.sin(t * 0.13 + 0.4) * 0.03;
  }
  return { pos: p, target: q, fov: lerp(shot.fov0, shot.fov1, e) };
}