import {
  ColorRGBA, Composition, EvaluatedField, Layer, ParticleContent, ParticleEmitter,
  TriMesh3D, Vec3,
} from '../core/types';
import {
  clamp, DEG2RAD, hashString, lerp, m4TransformDir, m4TransformPoint, mulberry32,
  rayTriangleIntersect, v3Add, v3Cross, v3Dist, v3Dot, v3Len, v3Norm, v3Scale, v3Sub,
} from '../core/math';
import { EvalContext } from '../core/expressions';
import { getLayerWorldMatrix } from '../core/project';
import { evaluateShapeLayer, flattenPathData, samplePolysAtFraction } from '../geometry/pathOps';
import { evaluateTextLayout } from '../geometry/fontEngine';
import { combineFieldList, evaluateFieldLayer } from '../geometry/fields';
import { evaluateNodeGraph } from '../nodes/nodeEngine';
import { computeCompSimSignature, evaluateMesh3DLayer } from './sceneEval';

export interface SimParticle {
  id: number;
  pos: Vec3;
  vel: Vec3;
  age: number;
  maxLife: number;
  sizeStart: number;
  sizeEnd: number;
  colorStart: ColorRGBA;
  colorMid: ColorRGBA;
  colorEnd: ColorRGBA;
  colorOverride?: ColorRGBA;
  colorOverrideMix: number;
  opacityStart: number;
  opacityEnd: number;
  emissiveBoost: number;
  bounces: number;
  isSecondary: boolean;
  /** Recorded actual world positions [pos, simTime] for 3D trails */
  trail: Array<{ pos: Vec3; time: number }>;
}

export interface RenderParticle {
  pos: Vec3;
  vel: Vec3;
  size: number;
  color: ColorRGBA;
  emissiveBoost: number;
  trail: Array<{ pos: Vec3; alpha: number; width: number }>;
}

interface SimState {
  step: number;
  rngState: number;
  nextParticleId: number;
  emitCarries: number[];
  prevBursts: number[];
  prevEmitterPos: Vec3[];
  prevColliderCenters: Map<string, Vec3>;
  particles: SimParticle[];
}

interface ColliderBucket {
  mesh: TriMesh3D;
  velocity: Vec3;
  boundsMin: Vec3;
  boundsMax: Vec3;
  /** Simple 3D grid spatial hash for ultra-fast swept triangle queries */
  cellSize: number;
  cells: Map<string, number[]>;
}

function cloneSimState(s: SimState): SimState {
  return {
    step: s.step,
    rngState: s.rngState,
    nextParticleId: s.nextParticleId,
    emitCarries: s.emitCarries.slice(),
    prevBursts: s.prevBursts.slice(),
    prevEmitterPos: s.prevEmitterPos.map((p): Vec3 => [p[0], p[1], p[2]]),
    prevColliderCenters: new Map(Array.from(s.prevColliderCenters.entries()).map(([k, v]) => [k, [v[0], v[1], v[2]] as Vec3])),
    particles: s.particles.map((p) => ({
      ...p,
      pos: [p.pos[0], p.pos[1], p.pos[2]],
      vel: [p.vel[0], p.vel[1], p.vel[2]],
      colorStart: [...p.colorStart],
      colorMid: [...p.colorMid],
      colorEnd: [...p.colorEnd],
      colorOverride: p.colorOverride ? [...p.colorOverride] : undefined,
      trail: p.trail.map((tp) => ({ pos: [tp.pos[0], tp.pos[1], tp.pos[2]], time: tp.time })),
    })),
  };
}

function nextRand(state: SimState): number {
  let a = (state.rngState + 0x6D2B79F5) >>> 0;
  state.rngState = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function buildColliderBucket(mesh: TriMesh3D, velocity: Vec3): ColliderBucket {
  const bMin = mesh.boundsMin, bMax = mesh.boundsMax;
  const span = Math.max(20, bMax[0] - bMin[0], bMax[1] - bMin[1], bMax[2] - bMin[2]);
  const cellSize = Math.max(18, span / 8);
  const cells = new Map<string, number[]>();
  const pos = mesh.positions, idx = mesh.indices;

  for (let ti = 0; ti < idx.length; ti += 3) {
    const i0 = idx[ti] * 3, i1 = idx[ti + 1] * 3, i2 = idx[ti + 2] * 3;
    const minX = Math.floor(Math.min(pos[i0], pos[i1], pos[i2]) / cellSize);
    const maxX = Math.floor(Math.max(pos[i0], pos[i1], pos[i2]) / cellSize);
    const minY = Math.floor(Math.min(pos[i0 + 1], pos[i1 + 1], pos[i2 + 1]) / cellSize);
    const maxY = Math.floor(Math.max(pos[i0 + 1], pos[i1 + 1], pos[i2 + 1]) / cellSize);
    const minZ = Math.floor(Math.min(pos[i0 + 2], pos[i1 + 2], pos[i2 + 2]) / cellSize);
    const maxZ = Math.floor(Math.max(pos[i0 + 2], pos[i1 + 2], pos[i2 + 2]) / cellSize);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const k = `${x},${y},${z}`;
          let arr = cells.get(k);
          if (!arr) { arr = []; cells.set(k, arr); }
          arr.push(ti);
        }
      }
    }
  }
  return { mesh, velocity, boundsMin: bMin, boundsMax: bMax, cellSize, cells };
}

function sweptCollideSegment(
  p0: Vec3,
  p1: Vec3,
  bucket: ColliderBucket
): { hitPos: Vec3; normal: Vec3; t: number } | null {
  const pad = 4.0;
  const sMinX = Math.min(p0[0], p1[0]) - pad, sMaxX = Math.max(p0[0], p1[0]) + pad;
  const sMinY = Math.min(p0[1], p1[1]) - pad, sMaxY = Math.max(p0[1], p1[1]) + pad;
  const sMinZ = Math.min(p0[2], p1[2]) - pad, sMaxZ = Math.max(p0[2], p1[2]) + pad;

  if (
    sMaxX < bucket.boundsMin[0] || sMinX > bucket.boundsMax[0] ||
    sMaxY < bucket.boundsMin[1] || sMinY > bucket.boundsMax[1] ||
    sMaxZ < bucket.boundsMin[2] || sMinZ > bucket.boundsMax[2]
  ) {
    return null;
  }

  const delta = v3Sub(p1, p0);
  const segLen = v3Len(delta);
  if (segLen < 1e-5) return null;
  const dir = v3Scale(delta, 1 / segLen);

  const cs = bucket.cellSize;
  const cMinX = Math.floor(sMinX / cs), cMaxX = Math.floor(sMaxX / cs);
  const cMinY = Math.floor(sMinY / cs), cMaxY = Math.floor(sMaxY / cs);
  const cMinZ = Math.floor(sMinZ / cs), cMaxZ = Math.floor(sMaxZ / cs);

  const pos = bucket.mesh.positions;
  const idx = bucket.mesh.indices;
  let bestT = segLen + 1.5;
  let bestNormal: Vec3 | null = null;
  const tested = new Set<number>();

  for (let x = cMinX; x <= cMaxX; x++) {
    for (let y = cMinY; y <= cMaxY; y++) {
      for (let z = cMinZ; z <= cMaxZ; z++) {
        const list = bucket.cells.get(`${x},${y},${z}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const ti = list[k];
          if (tested.has(ti)) continue;
          tested.add(ti);
          const i0 = idx[ti] * 3, i1 = idx[ti + 1] * 3, i2 = idx[ti + 2] * 3;
          const hit = rayTriangleIntersect(
            p0, dir,
            [pos[i0], pos[i0 + 1], pos[i0 + 2]],
            [pos[i1], pos[i1 + 1], pos[i1 + 2]],
            [pos[i2], pos[i2 + 1], pos[i2 + 2]],
            false
          );
          if (hit && hit.t <= bestT) {
            bestT = hit.t;
            // Ensure normal opposes incoming ray direction
            bestNormal = v3Dot(hit.normal, dir) > 0 ? v3Scale(hit.normal, -1) : hit.normal;
          }
        }
      }
    }
  }

  if (!bestNormal) return null;
  return {
    hitPos: v3Add(p0, v3Scale(dir, Math.max(0, bestT - 0.5))),
    normal: bestNormal,
    t: clamp(bestT / segLen, 0, 1),
  };
}

function randomConeDirection(baseDir: Vec3, spreadDeg: number, rand: () => number): Vec3 {
  const dir = v3Norm(baseDir);
  if (spreadDeg <= 0.1) return dir;
  const maxAng = clamp(spreadDeg, 0, 180) * DEG2RAD;
  const cosMax = Math.cos(maxAng);
  const z = lerp(cosMax, 1, rand());
  const phi = rand() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const up: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tang = v3Norm(v3Cross(up, dir));
  const bitang = v3Cross(dir, tang);
  return v3Norm(v3Add(
    v3Add(v3Scale(tang, Math.cos(phi) * r), v3Scale(bitang, Math.sin(phi) * r)),
    v3Scale(dir, z)
  ));
}

// ============================================================================
// Deterministic Simulation Cache Manager (2.14)
// ============================================================================
interface LayerCache {
  signature: string;
  checkpoints: Map<number, SimState>; // step -> immutable snapshot
  latest: SimState;
}

class ParticleSimulationEngine {
  private caches = new Map<string, LayerCache>();
  private checkpointInterval = 15; // store checkpoint every 0.25s at 60Hz

  public clearAll(): void {
    this.caches.clear();
  }

  public queryRenderParticles(comp: Composition, layer: Layer, queryTime: number): RenderParticle[] {
    if (!layer.particle || !layer.visible || queryTime < layer.inPoint || queryTime > layer.outPoint) {
      return [];
    }
    const pc = layer.particle;
    const simFps = clamp(Math.round(pc.simFps || 60), 24, 120);
    const dt = 1 / simFps;
    const simStart = Math.max(0, layer.inPoint);
    const relTime = Math.max(0, queryTime - simStart);
    const targetStep = Math.floor(relTime * simFps + 1e-6);
    const subRem = Math.max(0, relTime - targetStep * dt);

    const sig = computeCompSimSignature(comp, layer.id);
    const cacheKey = `${comp.id}:${layer.id}`;
    let cache = this.caches.get(cacheKey);
    if (!cache || cache.signature !== sig) {
      const init = this.makeInitialState(pc);
      cache = {
        signature: sig,
        checkpoints: new Map([[0, cloneSimState(init)]]),
        latest: init,
      };
      this.caches.set(cacheKey, cache);
    }

    // Retrieve exact discrete state at `targetStep` WITHOUT mutating cached checkpoints
    let state: SimState;
    if (cache.latest.step === targetStep) {
      state = cache.latest;
    } else if (cache.latest.step < targetStep) {
      state = cache.latest;
      this.advanceStateTo(comp, layer, pc, state, targetStep, simStart, dt, cache);
    } else {
      // Seeking backwards or motion-blur sub-frame before latest -> restore nearest checkpoint <= targetStep
      const cpStep = Math.floor(targetStep / this.checkpointInterval) * this.checkpointInterval;
      let bestStep = 0;
      for (const s of cache.checkpoints.keys()) {
        if (s <= targetStep && s >= bestStep) bestStep = s;
      }
      void cpStep;
      const baseSnap = cache.checkpoints.get(bestStep) ?? this.makeInitialState(pc);
      const working = cloneSimState(baseSnap);
      this.advanceStateTo(comp, layer, pc, working, targetStep, simStart, dt, cache);
      state = working;
      // Only overwrite latest if user actually scrubbed backwards significantly (not tiny motion-blur jitter)
      if (cache.latest.step - targetStep > 4) {
        cache.latest = working;
      }
    }

    return this.buildRenderSnapshot(comp, layer, pc, state, simStart + targetStep * dt, subRem);
  }

  private makeInitialState(pc: ParticleContent): SimState {
    const seed = pc.emitters[0]?.seed ?? 1024;
    return {
      step: 0,
      rngState: (seed * 2654435761) >>> 0 || 123456789,
      nextParticleId: 1,
      emitCarries: pc.emitters.map(() => 0),
      prevBursts: pc.emitters.map(() => 0),
      prevEmitterPos: pc.emitters.map(() => [0, 0, 0]),
      prevColliderCenters: new Map(),
      particles: [],
    };
  }

  private advanceStateTo(
    comp: Composition,
    layer: Layer,
    pc: ParticleContent,
    state: SimState,
    targetStep: number,
    simStart: number,
    dt: number,
    cache: LayerCache
  ): void {
    const maxSteps = Math.min(targetStep, Math.ceil((comp.duration + 1) * (pc.simFps || 60)));
    while (state.step < maxSteps) {
      state.step++;
      const t = simStart + state.step * dt;
      this.stepOnce(comp, layer, pc, state, t, dt);
      if (state.step % this.checkpointInterval === 0 && !cache.checkpoints.has(state.step)) {
        cache.checkpoints.set(state.step, cloneSimState(state));
      }
    }
  }

  private stepOnce(
    comp: Composition,
    layer: Layer,
    pc: ParticleContent,
    state: SimState,
    time: number,
    dt: number
  ): void {
    const ec = new EvalContext(comp);
    const layerWorldMat = getLayerWorldMatrix(comp, layer, time, ec);
    const maxP = clamp(pc.maxParticles || 1600, 50, 5000);
    const trailLenSec = pc.trailsEnabled
      ? clamp(ec.evaluateProp(layer, pc.trailLength, 'particle.trailLength', time) as number, 0.01, 2.0)
      : 0;

    // Quick check: will any emitter emit on this step, or are particles already alive?
    const rates = pc.emitters.map((em, i) =>
      em.enabled ? Math.max(0, ec.evaluateProp(layer, em.rate, `emt.${em.id}.rate`, time) as number) : 0
    );
    const bursts = pc.emitters.map((em, i) =>
      em.enabled ? Math.max(0, ec.evaluateProp(layer, em.burst, `emt.${em.id}.burst`, time) as number) : 0
    );

    const anyEmit = rates.some((r) => r > 0.01) || bursts.some((b, i) => b > 0.5 && b > (state.prevBursts[i] ?? 0) + 0.5);
    if (!anyEmit && state.particles.length === 0) {
      for (let i = 0; i < bursts.length; i++) state.prevBursts[i] = bursts[i];
      return;
    }

    // Evaluate node graph & fields once for this step
    const nodeReport = evaluateNodeGraph(comp, comp.nodeGraph, time, ec);
    const fieldsMap = new Map<string, EvaluatedField>();
    for (const l of comp.layers) {
      if (l.type === 'field') {
        const f = evaluateFieldLayer(comp, l, time, ec);
        if (f) fieldsMap.set(l.id, f);
      }
    }

    // Evaluate needed meshes (emitter sources & colliders)
    const meshCache = new Map<string, TriMesh3D>();
    const getMeshByLayerId = (lid: string): TriMesh3D | null => {
      if (meshCache.has(lid)) return meshCache.get(lid)!;
      const target = comp.layers.find((l) => l.id === lid || l.name === lid);
      if (!target || target.type !== 'mesh3d') return null;
      const inst = evaluateMesh3DLayer(comp, target, time, ec, nodeReport, fieldsMap);
      if (!inst) return null;
      meshCache.set(lid, inst.worldMesh);
      return inst.worldMesh;
    };

    // 1) Emit new particles from each emitter
    const rand = () => nextRand(state);
    for (let ei = 0; ei < pc.emitters.length; ei++) {
      const em = pc.emitters[ei];
      if (!em.enabled) continue;

      const rate = rates[ei];
      const burstNow = bursts[ei];
      const prevBurst = state.prevBursts[ei] ?? 0;
      state.prevBursts[ei] = burstNow;

      let toSpawn = 0;
      if (rate > 0) {
        state.emitCarries[ei] = (state.emitCarries[ei] ?? 0) + rate * dt;
        const n = Math.floor(state.emitCarries[ei]);
        state.emitCarries[ei] -= n;
        toSpawn += n;
      }
      // Rising-edge burst trigger (deterministic single fire!)
      if (burstNow >= 1 && burstNow > prevBurst + 0.5) {
        toSpawn += Math.round(burstNow);
      }

      const emLocalPos = ec.evaluateProp(layer, em.position, `emt.${em.id}.pos`, time, true) as Vec3;
      const emWorldPos = m4TransformPoint(layerWorldMat, emLocalPos);
      const prevPos = state.prevEmitterPos[ei] ?? emWorldPos;
      const emVel: Vec3 = state.step > 1 ? v3Scale(v3Sub(emWorldPos, prevPos), 1 / dt) : [0, 0, 0];
      state.prevEmitterPos[ei] = emWorldPos;

      if (toSpawn <= 0 || state.particles.length >= maxP) continue;
      toSpawn = Math.min(toSpawn, maxP - state.particles.length);

      const speed = ec.evaluateProp(layer, em.speed, `emt.${em.id}.speed`, time) as number;
      const spread = ec.evaluateProp(layer, em.spread, `emt.${em.id}.spread`, time) as number;
      const life = Math.max(0.05, ec.evaluateProp(layer, em.life, `emt.${em.id}.life`, time) as number);
      const sizeStart = ec.evaluateProp(layer, em.sizeStart, `emt.${em.id}.sizeStart`, time) as number;
      const sizeEnd = ec.evaluateProp(layer, em.sizeEnd, `emt.${em.id}.sizeEnd`, time) as number;
      const colorStart = ec.evaluateProp(layer, em.colorStart, `emt.${em.id}.colorStart`, time) as ColorRGBA;
      const colorMid = ec.evaluateProp(layer, em.colorMid, `emt.${em.id}.colorMid`, time) as ColorRGBA;
      const colorEnd = ec.evaluateProp(layer, em.colorEnd, `emt.${em.id}.colorEnd`, time) as ColorRGBA;
      const baseDirLocal = ec.evaluateProp(layer, em.direction, `emt.${em.id}.dir`, time) as Vec3;
      const baseDirWorld = v3Norm(m4TransformDir(layerWorldMat, baseDirLocal));

      // Prepare surface mesh or curve source if configured
      let surfMesh: TriMesh3D | null = null;
      let weightedTris: number[] | null = null;
      let curvePolys: ReturnType<typeof flattenPathData> | null = null;
      let curveWorldMat = layerWorldMat;

      if (em.sourceKind === 'surface') {
        if (em.sourceNodeRef) {
          const val = nodeReport.portValues.get(`${em.sourceNodeRef.nodeId}:${em.sourceNodeRef.portId}`);
          if (val && val.positions instanceof Float32Array) surfMesh = val as TriMesh3D;
        } else if (em.sourceLayerId) {
          surfMesh = getMeshByLayerId(em.sourceLayerId);
        }
        // If weightFieldLayerId is assigned, prioritize triangles in the hot/deformed zone!
        if (surfMesh && surfMesh.indices.length >= 3) {
          const wf = em.weightFieldLayerId ? fieldsMap.get(em.weightFieldLayerId) : null;
          if (wf) {
            const hot: number[] = [];
            const pos = surfMesh.positions, idx = surfMesh.indices;
            for (let ti = 0; ti < idx.length; ti += 3) {
              const i0 = idx[ti] * 3, i1 = idx[ti + 1] * 3, i2 = idx[ti + 2] * 3;
              const cx = (pos[i0] + pos[i1] + pos[i2]) / 3;
              const cy = (pos[i0 + 1] + pos[i1 + 1] + pos[i2 + 1]) / 3;
              const cz = (pos[i0 + 2] + pos[i1 + 2] + pos[i2 + 2]) / 3;
              const s = wf.sample([cx, cy, cz], time);
              if (s.weight > 0.08) hot.push(ti);
            }
            if (hot.length > 0) weightedTris = hot;
          }
        }
      } else if (em.sourceKind === 'curve') {
        if (em.sourceNodeRef) {
          const val = nodeReport.portValues.get(`${em.sourceNodeRef.nodeId}:${em.sourceNodeRef.portId}`);
          if (val?.contours) curvePolys = flattenPathData(val, 8);
        } else if (em.sourceLayerId) {
          const srcL = comp.layers.find((l) => l.id === em.sourceLayerId || l.name === em.sourceLayerId);
          if (srcL) {
            curveWorldMat = getLayerWorldMatrix(comp, srcL, time, ec);
            if (srcL.shape) curvePolys = evaluateShapeLayer(comp, srcL, srcL.shape, time, ec, 8).polys;
            else if (srcL.text) {
              const tl = evaluateTextLayout(comp, srcL, srcL.text, time, ec);
              curvePolys = flattenPathData(tl.combinedPath, 8);
            }
          }
        }
      }

      for (let k = 0; k < toSpawn; k++) {
        let spawnPos: Vec3 = [emWorldPos[0], emWorldPos[1], emWorldPos[2]];
        let spawnDir: Vec3 = baseDirWorld;

        if (em.sourceKind === 'surface' && surfMesh && surfMesh.indices.length >= 3) {
          const triOffset = weightedTris
            ? weightedTris[Math.floor(rand() * weightedTris.length)]
            : Math.floor(rand() * (surfMesh.indices.length / 3)) * 3;
          const i0 = surfMesh.indices[triOffset] * 3;
          const i1 = surfMesh.indices[triOffset + 1] * 3;
          const i2 = surfMesh.indices[triOffset + 2] * 3;
          let u = rand(), v = rand();
          if (u + v > 1) { u = 1 - u; v = 1 - v; }
          const w = 1 - u - v;
          const p = surfMesh.positions, n = surfMesh.normals;
          spawnPos = [
            p[i0] * w + p[i1] * u + p[i2] * v,
            p[i0 + 1] * w + p[i1 + 1] * u + p[i2 + 1] * v,
            p[i0 + 2] * w + p[i1 + 2] * u + p[i2 + 2] * v,
          ];
          const surfN = v3Norm([
            n[i0] * w + n[i1] * u + n[i2] * v,
            n[i0 + 1] * w + n[i1 + 1] * u + n[i2 + 1] * v,
            n[i0 + 2] * w + n[i1 + 2] * u + n[i2 + 2] * v,
          ]);
          spawnPos = v3Add(spawnPos, v3Scale(surfN, 2.5));
          spawnDir = v3Norm(v3Add(v3Scale(surfN, em.normalBoost ?? 0.8), v3Scale(baseDirWorld, 1.0)));
        } else if (em.sourceKind === 'curve' && curvePolys && curvePolys.length > 0) {
          const sample = samplePolysAtFraction(curvePolys, rand());
          spawnPos = m4TransformPoint(curveWorldMat, [sample.pos[0], -sample.pos[1], 0]);
        }

        const dir = randomConeDirection(spawnDir, spread, rand);
        const spd = speed * (1 + (rand() * 2 - 1) * clamp(em.speedVar, 0, 0.95));
        const pLife = Math.max(0.06, life * (1 + (rand() * 2 - 1) * clamp(em.lifeVar, 0, 0.9)));
        const vel = v3Add(v3Scale(dir, spd), v3Scale(emVel, em.inheritVelocity ?? 0));

        state.particles.push({
          id: state.nextParticleId++,
          pos: spawnPos,
          vel,
          age: 0,
          maxLife: pLife,
          sizeStart,
          sizeEnd,
          colorStart: [...colorStart],
          colorMid: [...colorMid],
          colorEnd: [...colorEnd],
          colorOverrideMix: 0,
          opacityStart: em.opacityStart ?? 1,
          opacityEnd: em.opacityEnd ?? 0,
          emissiveBoost: em.emissiveBoost ?? 2.0,
          bounces: 0,
          isSecondary: false,
          trail: [{ pos: [...spawnPos], time }],
        });
      }
    }

    if (state.particles.length === 0) return;

    // 2) Gather Forces (Gravity, Directional, Attractors, Space Fields 2.8)
    const gravity = ec.evaluateProp(layer, pc.gravity, 'particle.gravity', time) as Vec3;
    const dirForce = ec.evaluateProp(layer, pc.directionalForce, 'particle.dirForce', time) as Vec3;
    const drag = Math.max(0, ec.evaluateProp(layer, pc.drag, 'particle.drag', time) as number);
    const restitution = clamp(ec.evaluateProp(layer, pc.restitution, 'particle.restitution', time) as number, 0, 1);
    const friction = clamp(ec.evaluateProp(layer, pc.friction, 'particle.friction', time) as number, 0, 1);

    const activeFields: EvaluatedField[] = [];
    if (pc.fieldNodeRef) {
      const nf = nodeReport.portValues.get(`${pc.fieldNodeRef.nodeId}:${pc.fieldNodeRef.portId}`) as EvaluatedField | undefined;
      if (nf) activeFields.push(nf);
    }
    for (const fid of pc.fieldLayerIds || []) {
      const f = fieldsMap.get(fid);
      if (f) activeFields.push(f);
    }
    const combinedField = combineFieldList(activeFields, 'add');

    const attractors = pc.attractors
      .filter((a) => a.enabled)
      .map((a) => ({
        pos: m4TransformPoint(layerWorldMat, ec.evaluateProp(layer, a.position, `att.${a.id}.pos`, time) as Vec3),
        strength: ec.evaluateProp(layer, a.strength, `att.${a.id}.str`, time) as number,
        radius: Math.max(10, ec.evaluateProp(layer, a.radius, `att.${a.id}.rad`, time) as number),
      }));

    // 3) Gather Colliders (Current deformed meshes + node meshes + surface velocity!)
    const colliders: ColliderBucket[] = [];
    for (const cid of pc.colliderLayerIds || []) {
      const cm = getMeshByLayerId(cid);
      if (cm && cm.indices.length >= 3) {
        const center: Vec3 = [
          (cm.boundsMin[0] + cm.boundsMax[0]) * 0.5,
          (cm.boundsMin[1] + cm.boundsMax[1]) * 0.5,
          (cm.boundsMin[2] + cm.boundsMax[2]) * 0.5,
        ];
        const prevC = state.prevColliderCenters.get(cid) ?? center;
        const surfVel: Vec3 = state.step > 1 ? v3Scale(v3Sub(center, prevC), 1 / dt) : [0, 0, 0];
        state.prevColliderCenters.set(cid, center);
        colliders.push(buildColliderBucket(cm, surfVel));
      }
    }
    for (const ref of pc.colliderNodeRefs || []) {
      const val = nodeReport.portValues.get(`${ref.nodeId}:${ref.portId}`);
      if (val && val.positions instanceof Float32Array && val.indices.length >= 3) {
        colliders.push(buildColliderBucket(val as TriMesh3D, [0, 0, 0]));
      }
    }

    // 4) Integrate & Collide
    const dragFactor = Math.exp(-drag * dt);
    const newlySpawned: SimParticle[] = [];
    const alive: SimParticle[] = [];

    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      p.age += dt;
      if (p.age >= p.maxLife) continue;

      // Accumulate acceleration
      let ax = gravity[0] + dirForce[0];
      let ay = gravity[1] + dirForce[1];
      let az = gravity[2] + dirForce[2];

      for (const att of attractors) {
        const toAtt = v3Sub(att.pos, p.pos);
        const d = v3Len(toAtt);
        if (d > 1 && d < att.radius) {
          const w = 1 - d / att.radius;
          const mag = (att.strength * w) / d;
          ax += toAtt[0] * mag;
          ay += toAtt[1] * mag;
          az += toAtt[2] * mag;
        }
      }

      if (combinedField) {
        const fs = combinedField.sample(p.pos, time);
        // Scale field vector cleanly for particle acceleration
        ax += fs.force[0] * 12;
        ay += fs.force[1] * 12;
        az += fs.force[2] * 12;
      }

      p.vel[0] = (p.vel[0] + ax * dt) * dragFactor;
      p.vel[1] = (p.vel[1] + ay * dt) * dragFactor;
      p.vel[2] = (p.vel[2] + az * dt) * dragFactor;

      const oldPos: Vec3 = [p.pos[0], p.pos[1], p.pos[2]];
      const nextPos: Vec3 = [
        oldPos[0] + p.vel[0] * dt,
        oldPos[1] + p.vel[1] * dt,
        oldPos[2] + p.vel[2] * dt,
      ];

      // Swept surface collision against all active colliders
      let bestHit: { hitPos: Vec3; normal: Vec3; t: number; surfVel: Vec3 } | null = null;
      for (let ci = 0; ci < colliders.length; ci++) {
        const hit = sweptCollideSegment(oldPos, nextPos, colliders[ci]);
        if (hit && (!bestHit || hit.t < bestHit.t)) {
          bestHit = { ...hit, surfVel: colliders[ci].velocity };
        }
      }

      if (bestHit) {
        const N = bestHit.normal;
        const vRel = v3Sub(p.vel, bestHit.surfVel);
        const vn = v3Dot(vRel, N);
        if (vn < 0) {
          const vNormal = v3Scale(N, vn);
          const vTangent = v3Sub(vRel, vNormal);
          const vRelReflected = v3Add(
            v3Scale(vTangent, 1 - friction),
            v3Scale(vNormal, -restitution)
          );
          p.vel = v3Add(vRelReflected, bestHit.surfVel);
        }
        p.pos = v3Add(bestHit.hitPos, v3Scale(N, 1.2));
        p.bounces++;

        // Collision triggers: color shift, life multiplier, and secondary emission!
        if (pc.onCollisionColorMix > 0.01) {
          p.colorOverride = [...pc.onCollisionColor];
          p.colorOverrideMix = clamp(p.colorOverrideMix + pc.onCollisionColorMix, 0, 1);
        }
        if (pc.onCollisionLifeMult > 0 && pc.onCollisionLifeMult < 1 && p.bounces === 1) {
          const remLife = Math.max(0.05, (p.maxLife - p.age) * pc.onCollisionLifeMult);
          p.maxLife = p.age + remLife;
        }
        if (
          pc.subEmitOnCollision && !p.isSecondary && p.bounces === 1 &&
          state.particles.length + newlySpawned.length < maxP
        ) {
          const subN = clamp(Math.round(pc.subEmitCount || 2), 1, 8);
          for (let s = 0; s < subN; s++) {
            const sDir = randomConeDirection(N, 70, rand);
            const sSpd = (pc.subEmitSpeed || 120) * (0.6 + rand() * 0.8);
            const spPos: Vec3 = [p.pos[0], p.pos[1], p.pos[2]];
            newlySpawned.push({
              id: state.nextParticleId++,
              pos: spPos,
              vel: v3Add(v3Scale(sDir, sSpd), v3Scale(bestHit.surfVel, 0.3)),
              age: 0,
              maxLife: Math.max(0.08, (pc.subEmitLife || 0.45) * (0.65 + rand() * 0.7)),
              sizeStart: pc.subEmitSize || 3.5,
              sizeEnd: 0.6,
              colorStart: [...pc.subEmitColor],
              colorMid: [1.0, 0.55, 0.12, 1],
              colorEnd: [0.35, 0.05, 0.01, 1],
              colorOverrideMix: 0,
              opacityStart: 1,
              opacityEnd: 0,
              emissiveBoost: 2.4,
              bounces: 1,
              isSecondary: true,
              trail: [{ pos: [...spPos], time }],
            });
          }
        }
      } else {
        p.pos = nextPos;
      }

      // Record actual trajectory point for 3D trail ribbon
      if (trailLenSec > 0) {
        p.trail.push({ pos: [p.pos[0], p.pos[1], p.pos[2]], time });
        const cutoff = time - trailLenSec;
        while (p.trail.length > 2 && p.trail[0].time < cutoff) {
          p.trail.shift();
        }
        if (p.trail.length > 40) p.trail.shift();
      } else if (p.trail.length > 0) {
        p.trail.length = 0;
      }

      alive.push(p);
    }

    state.particles = alive.concat(newlySpawned);
  }

  /** Pure read-only fractional-time interpolation for smooth 60fps & zero-artifact Motion Blur! */
  private buildRenderSnapshot(
    comp: Composition,
    layer: Layer,
    pc: ParticleContent,
    state: SimState,
    stepTime: number,
    subRem: number
  ): RenderParticle[] {
    const ec = new EvalContext(comp);
    const curTime = stepTime + subRem;
    const trailLen = pc.trailsEnabled
      ? Math.max(0.01, ec.evaluateProp(layer, pc.trailLength, 'particle.trailLength', curTime) as number)
      : 0;
    const trailW = pc.trailsEnabled
      ? Math.max(0.5, ec.evaluateProp(layer, pc.trailWidth, 'particle.trailWidth', curTime) as number)
      : 0;
    const trailFade = Math.max(0.2, pc.trailFade || 1.5);

    const out: RenderParticle[] = [];
    for (const p of state.particles) {
      const age = p.age + subRem;
      if (age >= p.maxLife) continue;
      const lifeT = clamp(age / p.maxLife, 0, 1);

      const pos: Vec3 = [
        p.pos[0] + p.vel[0] * subRem,
        p.pos[1] + p.vel[1] * subRem,
        p.pos[2] + p.vel[2] * subRem,
      ];
      const size = Math.max(0.4, lerp(p.sizeStart, p.sizeEnd, lifeT));

      // 3-stop gradient over life (Start -> Mid -> End)
      let r: number, g: number, b: number;
      if (lifeT < 0.4) {
        const u = lifeT / 0.4;
        r = lerp(p.colorStart[0], p.colorMid[0], u);
        g = lerp(p.colorStart[1], p.colorMid[1], u);
        b = lerp(p.colorStart[2], p.colorMid[2], u);
      } else {
        const u = (lifeT - 0.4) / 0.6;
        r = lerp(p.colorMid[0], p.colorEnd[0], u);
        g = lerp(p.colorMid[1], p.colorEnd[1], u);
        b = lerp(p.colorMid[2], p.colorEnd[2], u);
      }
      if (p.colorOverride && p.colorOverrideMix > 0) {
        r = lerp(r, p.colorOverride[0], p.colorOverrideMix);
        g = lerp(g, p.colorOverride[1], p.colorOverrideMix);
        b = lerp(b, p.colorOverride[2], p.colorOverrideMix);
      }
      const alpha = clamp(lerp(p.opacityStart, p.opacityEnd, Math.pow(lifeT, 1.35)), 0, 1);

      const trailPts: RenderParticle['trail'] = [];
      if (pc.trailsEnabled && p.trail.length >= 1) {
        for (let ti = 0; ti < p.trail.length; ti++) {
          const tp = p.trail[ti];
          const ageFrac = clamp(1 - (curTime - tp.time) / trailLen, 0, 1);
          if (ageFrac <= 0.01 && ti < p.trail.length - 1) continue;
          trailPts.push({
            pos: tp.pos,
            alpha: Math.pow(ageFrac, trailFade) * alpha,
            width: trailW * (0.25 + 0.75 * ageFrac) * (size / Math.max(1, p.sizeStart)),
          });
        }
        trailPts.push({ pos, alpha, width: trailW * (size / Math.max(1, p.sizeStart)) });
      }

      out.push({
        pos,
        vel: p.vel,
        size,
        color: [r, g, b, alpha],
        emissiveBoost: p.emissiveBoost * (1 - lifeT * 0.65),
        trail: trailPts,
      });
    }
    return out;
  }
}

export const particleEngine = new ParticleSimulationEngine();
