import * as THREE from 'three';
import { Batch, mat } from '../core/batch.js';
import { makeRock, makeCap } from './rock.js';
import * as G from '../core/geo.js';
import { Collider } from './collide.js';
import { MAIN, SATS, mainGround } from './layout.js';
import { buildMainIsland } from './mainIsland.js';
import { buildWall } from './wall.js';
import { buildCity } from './city.js';
import { buildTemple } from './temple.js';
import { buildSatellites } from './satellites.js';
import { buildRingRoad } from './ringroad.js';
import { buildBridges } from './bridges.js';
import { buildWater } from './water.js';
import { buildLife } from './life.js';

export function buildWorld(ctx) {
  const { scene, M } = ctx;
  ctx.collider = new Collider();
  ctx.landmarks = {};
  ctx.flags = [];
  ctx.collider.addGround(mainGround, 0, 0, MAIN.rimR + 4);
  buildMainIsland(ctx);
  buildWall(ctx);
  buildCity(ctx);
  buildTemple(ctx);

  buildSatellites(ctx);
  buildBridges(ctx);
  buildRingRoad(ctx);
  buildWater(ctx);
  buildLife(ctx);
  const P = ctx.pipeline.atmoExtra;
  // art-directed light shafts falling through gaps in the upper clouds (landing point, radius) / (intensity, length, -, seed)
  const beams = [
    [-560, -262, -420, 52, 20, 3600, 0, 0.1], [520, -270, -700, 64, 17, 3600, 0, 0.5], [30, 60, -40, 32, 8.0, 3600, 0, 0.9],
    [780, -265, 300, 42, 15, 3600, 0, 1.3], [-180, -275, -1500, 84, 15, 3800, 0, 1.7], [-330, -266, 230, 40, 17, 3600, 0, 2.1],
  ];
  beams.forEach((v, i) => { P.uBeamA.value[i].set(v[0], v[1], v[2], v[3]); P.uBeamB.value[i].set(v[4], v[5], v[6], v[7]); });
  P.uIslA.value[0].set(0, 0, 0, MAIN.rimR); P.uIslB.value[0].set(-MAIN.depth, 1.55, 70, 1);
  Object.values(SATS).forEach((s, i) => { P.uIslA.value[i + 1].set(s.pos.x, s.pos.y, s.pos.z, s.R); P.uIslB.value[i + 1].set(s.pos.y - s.depth, 1.5, 12, 1); });
}
