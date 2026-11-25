import * as THREE from 'three';
import { SATS, CLK, P, dirOf, MAIN } from '../world/layout.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// camera position from target + spherical offset (theta measured like the controls: atan2(x, z))
function orbitPos(t, r, phiDeg, thetaRad) {
  const ph = THREE.MathUtils.degToRad(phiDeg);
  return V3(t.x + Math.sin(ph) * Math.sin(thetaRad) * r, t.y + Math.cos(ph) * r, t.z + Math.sin(ph) * Math.cos(thetaRad) * r);
}
const thetaOf = (v) => Math.atan2(v.x, v.z);

export function makeViewpoints(ctx) {
  const L = ctx.landmarks;
  const vps = [];
  const add = (name, target, pos, lim) => vps.push({ name, target: target.clone(), pos: pos.clone(), lim: { minR: 10, maxR: 400, minPhi: 0.15, maxPhi: 1.75, panRadius: 60, ...lim } });

  // 1 panorama
  add('全景', V3(-10, -48, 40), V3(275, 198, 1195), { minR: 480, maxR: 2600, minPhi: 0.32, maxPhi: 1.72, panRadius: 520 });
  // 2 island bottom: crystals, chains, guardian
  { const t = V3(0, -128, 118); add('岛底 · 晶簇与神像', t, V3(150, -205, 420), { minR: 90, maxR: 560, minPhi: 0.7, maxPhi: 2.45, panRadius: 120 }); }
  // 3 gate & wall
  { const t = L.gate.clone().add(V3(0, 4, 4)); add('城门与城墙', t, t.clone().add(V3(58, 16, 66)), { minR: 28, maxR: 300, minPhi: 0.45, maxPhi: 1.72, panRadius: 120 }); }
  // 4 market
  { const t = L.market.clone().add(V3(0, 3, 0)); const out = V3(t.x, 0, t.z).normalize(); add('下城集市', t, t.clone().addScaledVector(out, 34).add(V3(-18, 24, 6)), { minR: 14, maxR: 190, minPhi: 0.2, maxPhi: 1.45, panRadius: 70 }); }
  // 5 academy & bell tower
  { const t = L.academy.clone().lerp(L.bellTower, 0.3).add(V3(0, 2, 0)); const out = V3(t.x, 0, t.z).normalize(); const side = V3(out.z, 0, -out.x); add('学院庭院与钟楼', t, t.clone().addScaledVector(out, 52).addScaledVector(side, 30).add(V3(0, 66, 0)), { minR: 18, maxR: 240, minPhi: 0.12, maxPhi: 1.45, panRadius: 80 }); }
  // 6 grand stair & plaza
  { const t = V3(0, 34, 86); add('大台阶与礼仪广场', t, V3(46, 52, 196), { minR: 18, maxR: 300, minPhi: 0.25, maxPhi: 1.55, panRadius: 90 }); }
  // 7 temple
  { const t = V3(0, 72, 2); add('主殿', t, V3(118, 96, 168), { minR: 60, maxR: 420, minPhi: 0.2, maxPhi: 1.62, panRadius: 90 }); }
  // 8 spire & crystal ball
  { const t = ctx.ballCenter.clone().add(V3(0, -10, 0)); add('尖塔与水晶球', t, t.clone().add(V3(36, 2, 52)), { minR: 24, maxR: 260, minPhi: 0.25, maxPhi: 2.3, panRadius: 45 }); }
  // 9 water system
  { const t = P(95, CLK(10.3), 12); add('水系 · 蓄水池到瀑布', t, P(395, CLK(10.15), 165), { minR: 50, maxR: 560, minPhi: 0.25, maxPhi: 2.1, panRadius: 170 }); }
  // 10 harbor
  { const t = L.harbor.clone().add(V3(0, 8, 0)); const s = SATS.harbor; const out = dirOf(s.th); add('飞艇港岛', t, t.clone().addScaledVector(out, 125).add(V3(70, 46, 85)), { minR: 35, maxR: 420, minPhi: 0.2, maxPhi: 2.0, panRadius: 110 }); }
  // 11 clock tower & suspension bridge
  { const t = L.suspension.clone().lerp(L.clockTower, 0.45); add('钟塔岛与悬索桥', t, t.clone().add(V3(95, 32, 150)), { minR: 35, maxR: 420, minPhi: 0.2, maxPhi: 2.0, panRadius: 130 }); }
  // 12 monastery & vineyard
  { const t = L.monastery.clone().add(V3(0, -2, 0)); const s = SATS.monastery; const out = dirOf(s.th); add('修道院岛与葡萄园', t, t.clone().addScaledVector(out, 118).add(V3(40, 62, 88)), { minR: 30, maxR: 380, minPhi: 0.15, maxPhi: 1.95, panRadius: 100 }); }
  // 13 waterwheel & aqueduct
  { const t = L.wheel.clone().add(V3(0, 0, 40)); add('水车岛与渡槽', t, t.clone().add(V3(-120, 30, 120)), { minR: 30, maxR: 420, minPhi: 0.2, maxPhi: 2.0, panRadius: 160 }); }
  // 14 lighthouse
  { const t = L.lighthouse.clone().add(V3(0, -14, 0)); const s = SATS.lighthouse; const out = dirOf(s.th); add('灯塔岛', t, t.clone().addScaledVector(out, -40).add(V3(-120, 30, 150)), { minR: 30, maxR: 480, minPhi: 0.2, maxPhi: 2.1, panRadius: 120 }); }
  // 15 ruins & broken bridge
  { const t = L.brokenBridge.clone().lerp(L.ruins, 0.4).add(V3(0, -6, 0)); add('废墟岛与断桥', t, t.clone().add(V3(130, 52, 110)), { minR: 30, maxR: 420, minPhi: 0.2, maxPhi: 2.1, panRadius: 130 }); }
  // 16 outer ring road
  {
    const R = ctx.ring; const g = R.segs.find((s) => s.a === 'lighthouse');
    const s = g.s0 + (g.s1 - g.s0) * 0.16; const p = R.pointAt(s); const tg = R.tangentAt(s);
    const t = p.clone().add(V3(0, 2, 0));
    const side = V3(tg.z, 0, -tg.x); if (side.dot(V3(p.x, 0, p.z)) < 0) side.negate();
    add('外环道路', t, t.clone().addScaledVector(side, 60).addScaledVector(tg, -70).add(V3(0, 26, 0)), { minR: 18, maxR: 420, minPhi: 0.2, maxPhi: 2.0, panRadius: 260 });
  }
  return vps;
}
