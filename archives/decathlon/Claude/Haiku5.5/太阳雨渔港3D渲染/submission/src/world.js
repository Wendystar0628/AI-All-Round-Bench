import * as THREE from 'three';
import { Builder } from './core/builder.js';
import { buildSky, buildLights, buildClouds, updateClouds, buildMist, FOG_COLOR } from './scene/sky.js';
import { buildBase, buildHazardStrips } from './scene/base.js';
import { buildHarbourWater, buildPuddle, buildSeabed, makeKelpGroups, updateKelp, makeFish, updateFish, fishSchools, updateReflectors, resizeReflectors, ripBuf } from './scene/water.js';
import { buildQuay } from './scene/quay.js';
import { buildWarehouse, buildWaitingRoom, buildBreakwater, lampOn } from './scene/buildings.js';
import { buildHill } from './scene/hill.js';
import { buildSportBoat, buildSmallBoat, buildOpenBoat, buildFarBoat, buildWakeTrail } from './scene/boats.js';
import { buildLife } from './scene/life.js';
import { feedRipples } from './scene/route.js';
import { GUSTS, rainAt, gustAt, smooth } from './core/wave.js';

// 组装整个微缩场景，返回每帧的更新函数。所有动态量都是时间 t 的纯函数（或由 t 推进的确定性状态）。
export function buildWorld(scene) {
  scene.fog = new THREE.Fog(FOG_COLOR, 46, 140);

  buildSky(scene);
  const lights = buildLights(scene);
  const clouds = buildClouds(scene);
  const mist = buildMist(scene);

  // 静态结构：底座与水下
  const base = new Builder();
  buildBase(base);
  buildSeabed(base);
  base.finish(scene);
  buildHazardStrips(scene);

  // 水面与水洼
  buildHarbourWater(scene);
  buildPuddle(scene, -7.2, 6.6, 1.25);
  buildPuddle(scene, 1.2, 6.4, 0.85, 0.35);

  // 水下的海草（海床上的，以及贴在岸壁上的）与鱼群
  const kelp = makeKelpGroups(scene, [
    { x: 6.1, z: -2.2, h: 1.1, n: 6, phase: 0.1 },
    { x: 8.6, z: -6.6, h: 0.9, n: 5, phase: 1.4 },
    { x: 0.3, z: -8.6, h: 0.8, n: 5, phase: 2.2 },
    { x: -1.4, z: 0.4, h: 0.7, n: 4, phase: 3.1 },
    { x: 9.1, z: 1.9, h: 1.0, n: 5, phase: 4.0 },
    { x: 4.0, z: -8.0, h: 0.6, n: 4, phase: 5.2 },
    // 岸壁上附着的海藻（根在墙根，朝水里生长）
    { x: 0.4, z: 2.88, y: -2.4, h: 1.1, n: 5, phase: 5.1 },
    { x: 9.3, z: 2.88, y: -2.5, h: 1.0, n: 4, phase: 7.3 },
    { x: -3.88, z: -8.4, y: -2.4, h: 1.0, n: 5, phase: 8.2, ry: Math.PI / 2 },
    { x: -3.88, z: 1.6, y: -2.3, h: 1.1, n: 5, phase: 9.0, ry: Math.PI / 2 },
  ]);
  const schools = fishSchools();
  const fish = makeFish(scene, schools);
  const schoolCenters = schools.map((s) => new THREE.Vector3(s.cx, s.cy, s.cz));
  const scares = new Array(schools.length).fill(0);

  // 码头、建筑、山坡与船只的动态部件（每个部件都提供 update(t)）
  const dyn = [];
  const quayDyn = [];
  buildQuay(scene, quayDyn);
  const umbrella = quayDyn.umbrella;
  dyn.push(...quayDyn.filter((d) => d.update));

  buildWarehouse(scene);
  buildWaitingRoom(scene);
  buildBreakwater(scene, dyn);
  buildHill(scene, dyn);

  const sportBoat = buildSportBoat(scene, dyn);

  const openBoat = buildOpenBoat(scene, dyn);
  buildFarBoat(scene, dyn);
  buildWakeTrail(scene, dyn);

  const smallBoat = buildSmallBoat(scene, dyn);
  // 船上的滴水点与海鸥的停靠点（船局部坐标，随船运动）
  const boatAnchors = [
    { obj: smallBoat.group, pts: [[0.56, 0.32, 0.3, 2.7], [-0.56, 0.32, -0.6, 3.3], [0.42, 1.02, 0.3, 2.2], [-0.42, 1.02, -0.6, 2.9]], perches: [[0.53, 0.3, 0.2], [0.4, 1.52, -0.15]] },
    { obj: openBoat.group, pts: [], perches: [[0.2, 1.44, 0.0]] },
    { obj: sportBoat.group, pts: [], perches: [[0.46, 1.6, -0.35]] },
  ];
  const life = buildLife(scene, umbrella, boatAnchors);

  const gustT = [0, 0, 0, 0];
  // 码头边的阵风强度（雨丝、旗子与渔网都随它变化）
  const PIER_POINT = [-2, 4];

  const update = (t, cam) => {
    // 阵风前沿：已发生的阵风中最近的四次
    const past = GUSTS.filter((g) => g <= t + 0.5).slice(-4);
    for (let k = 0; k < 4; k++) gustT[k] = past[past.length - 4 + k] ?? -100;

    const rain = rainAt(t);
    const gust = gustAt(PIER_POINT[0], PIER_POINT[1], t);
    updateClouds(clouds, t);
    mist.update(t);
    // 薄云经过太阳时（云影掠过底座），光线与粼光一起变淡
    const cx = clouds.position.x;
    const cover = smooth(-16, -6, cx) * (1 - smooth(6, 16, cx));
    // 灯塔亮起的那一次，天色短暂变暗
    const dusk = lampOn(t);
    lights.sun.intensity = 2.9 * (1 - 0.2 * cover) * (1 - 0.35 * dusk);
    lights.hemi.intensity = 1.05 * (1 - 0.2 * dusk);
    for (const d of dyn) d.update(t);
    updateKelp(kelp, t);
    // 镜头靠近哪一群鱼，哪一群就散开
    for (let si = 0; si < schoolCenters.length; si++) {
      scares[si] = smooth(14, 7, cam.position.distanceTo(schoolCenters[si]));
    }
    updateFish(fish, t, scares);
    feedRipples(ripBuf, t);
    updateReflectors(t, rain, gustT, cover);
    life.update(t, cam.position, rain, cover, gust);
    return lights;
  };

  return { update, resize: resizeReflectors, lights };
}
