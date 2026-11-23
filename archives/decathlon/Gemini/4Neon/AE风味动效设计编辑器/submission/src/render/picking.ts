import { Composition, Layer, Vec2, Vec3 } from '../core/types';
import {
  m4Identity, m4Invert, m4TransformPoint, projectWorldToComp, rayPlaneIntersect,
  rayTriangleIntersect, unprojectCompRay, v3Dist, v3Norm, v3Sub,
} from '../core/math';
import { EvalContext } from '../core/expressions';
import { getLayerWorldMatrix } from '../core/project';
import { evaluateShapeLayer, flattenPathData } from '../geometry/pathOps';
import { evaluateTextLayout } from '../geometry/fontEngine';
import { EvaluatedSceneSnapshot } from '../simulation/sceneEval';

export interface PickHit {
  layerId: string;
  worldPoint: Vec3;
  distance: number;
  is3D: boolean;
}

function pointInPolyEvenOdd(x: number, y: number, polys: { points: Vec2[]; closed: boolean }[]): boolean {
  let inside = false;
  for (const poly of polys) {
    const pts = poly.points;
    if (pts.length < 3) continue;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi)) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Pick nearest visible unlocked layer at composition coordinates (cx, cy).
 * Respects 3D depth occlusion, holes, deformed vertices, and 2D layer stacking order!
 */
export function pickLayerAtCompPos(
  comp: Composition,
  snap: EvaluatedSceneSnapshot,
  cx: number,
  cy: number,
  time: number
): PickHit | null {
  const ec = snap.ec;

  // 1) Check topmost 2D renderable layers first (top-to-bottom AE stacking)
  for (const layer of comp.layers) {
    if (!layer.visible || layer.locked || time < layer.inPoint || time > layer.outPoint) continue;
    if (layer.is3D) continue;
    if (layer.type === 'shape' || layer.type === 'text' || layer.type === 'precomp') {
      const wm = getLayerWorldMatrix(comp, layer, time, ec);
      const inv = m4Invert(wm);
      if (!inv) continue;
      const localP = m4TransformPoint(inv, [cx, cy, 0]);
      if (layer.type === 'shape' && layer.shape) {
        const res = evaluateShapeLayer(comp, layer, layer.shape, time, ec, 8);
        if (pointInPolyEvenOdd(localP[0], localP[1], res.polys)) {
          return { layerId: layer.id, worldPoint: [cx, cy, 0], distance: 0, is3D: false };
        }
        // Check stroke proximity
        for (const p of res.polys) {
          for (let i = 0; i < p.points.length - 1; i++) {
            if (distToSeg2D(localP[0], localP[1], p.points[i][0], p.points[i][1], p.points[i + 1][0], p.points[i + 1][1]) < 12) {
              return { layerId: layer.id, worldPoint: [cx, cy, 0], distance: 0, is3D: false };
            }
          }
        }
      } else if (layer.type === 'text' && layer.text) {
        const tl = evaluateTextLayout(comp, layer, layer.text, time, ec);
        const polys = flattenPathData(tl.combinedPath, 6);
        if (pointInPolyEvenOdd(localP[0], localP[1], polys)) {
          return { layerId: layer.id, worldPoint: [cx, cy, 0], distance: 0, is3D: false };
        }
        const b = tl.bounds;
        if (localP[0] >= b.minX - 6 && localP[0] <= b.maxX + 6 && localP[1] >= b.minY - 6 && localP[1] <= b.maxY + 6) {
          // Soft hit inside text box only if no 3D solid underneath (check 3D first below if missed exact glyph)
        }
      } else if (layer.type === 'precomp') {
        if (Math.abs(localP[0]) <= comp.width * 0.5 && Math.abs(localP[1]) <= comp.height * 0.5) {
          return { layerId: layer.id, worldPoint: [cx, cy, 0], distance: 0, is3D: false };
        }
      }
    }
  }

  // 2) Exact 3D Raycast against ALL visible unlocked deformed 3D meshes (nearest surface!)
  const ray = unprojectCompRay(snap.camera.invVP, cx, cy, comp.width, comp.height);
  let best3D: PickHit | null = null;

  for (const [, inst] of snap.meshes) {
    const l = inst.layer;
    if (!l.visible || l.locked || inst.opacity * inst.material.opacity < 0.02) continue;
    const m = inst.worldMesh;
    if (m.indices.length === 0) continue;

    // Fast ray-AABB reject
    if (!rayIntersectsAABB(ray.origin, ray.dir, m.boundsMin, m.boundsMax)) continue;

    const pos = m.positions, idx = m.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i] * 3, i1 = idx[i + 1] * 3, i2 = idx[i + 2] * 3;
      const hit = rayTriangleIntersect(
        ray.origin, ray.dir,
        [pos[i0], pos[i0 + 1], pos[i0 + 2]],
        [pos[i1], pos[i1 + 1], pos[i1 + 2]],
        [pos[i2], pos[i2 + 1], pos[i2 + 2]],
        false
      );
      if (hit && (!best3D || hit.t < best3D.distance)) {
        best3D = {
          layerId: l.id,
          worldPoint: [
            ray.origin[0] + ray.dir[0] * hit.t,
            ray.origin[1] + ray.dir[1] * hit.t,
            ray.origin[2] + ray.dir[2] * hit.t,
          ],
          distance: hit.t,
          is3D: true,
        };
      }
    }
  }

  // 3) Also check helper gizmos (Light / Field / Null / Camera icons) within 18px screen radius
  let bestHelper: PickHit | null = null;
  for (const l of comp.layers) {
    if (!l.visible || l.locked || time < l.inPoint || time > l.outPoint) continue;
    if (l.type !== 'light' && l.type !== 'field' && l.type !== 'null') continue;
    const wm = getLayerWorldMatrix(comp, l, time, ec);
    const wp = m4TransformPoint(wm, [0, 0, 0]);
    const sp = l.is3D
      ? projectWorldToComp(snap.camera.vp, wp, comp.width, comp.height)
      : { x: wp[0], y: wp[1], z: 0, w: 1 };
    if (sp.w > 0 && Math.hypot(sp.x - cx, sp.y - cy) < 18) {
      const dist = v3Dist(snap.camera.eye, wp);
      if (!bestHelper || dist < bestHelper.distance) {
        bestHelper = { layerId: l.id, worldPoint: wp, distance: dist, is3D: l.is3D };
      }
    }
  }

  if (bestHelper && (!best3D || bestHelper.distance < best3D.distance + 40)) {
    return bestHelper;
  }
  return best3D;
}

/**
 * Unproject a drag from screen comp pos `(cx0, cy0) -> (cx1, cy1)` into a world-space delta
 * lying on the camera-facing plane passing through `anchorWorldPos` (for 3D layers),
 * then convert into the layer's parent-local coordinate space so dragging under ANY animated parent stays 100% hand-locked!
 */
export function computeParentAwareDragDelta(
  comp: Composition,
  layer: Layer,
  snap: EvaluatedSceneSnapshot,
  time: number,
  cx0: number,
  cy0: number,
  cx1: number,
  cy1: number,
  axisLock: 'free' | 'x' | 'y' | 'z' = 'free'
): Vec3 {
  const ec = snap.ec;
  const worldMat = getLayerWorldMatrix(comp, layer, time, ec);
  const worldOrigin = m4TransformPoint(worldMat, [0, 0, 0]);

  let parentWorld = m4Identity();
  if (layer.parentId) {
    const p = comp.layers.find((l) => l.id === layer.parentId);
    if (p) parentWorld = getLayerWorldMatrix(comp, p, time, ec);
  }
  const invParent = m4Invert(parentWorld) ?? m4Identity();

  if (!layer.is3D) {
    const p0 = m4TransformPoint(invParent, [cx0, cy0, 0]);
    const p1 = m4TransformPoint(invParent, [cx1, cy1, 0]);
    const dx = axisLock === 'y' ? 0 : p1[0] - p0[0];
    const dy = axisLock === 'x' ? 0 : p1[1] - p0[1];
    return [dx, dy, 0];
  }

  // 3D drag: intersect rays with plane facing camera through worldOrigin
  const planeNormal = v3Norm(v3Sub(snap.camera.eye, worldOrigin));
  const r0 = unprojectCompRay(snap.camera.invVP, cx0, cy0, comp.width, comp.height);
  const r1 = unprojectCompRay(snap.camera.invVP, cx1, cy1, comp.width, comp.height);
  const w0 = rayPlaneIntersect(r0.origin, r0.dir, worldOrigin, planeNormal);
  const w1 = rayPlaneIntersect(r1.origin, r1.dir, worldOrigin, planeNormal);
  if (!w0 || !w1) return [0, 0, 0];

  const l0 = m4TransformPoint(invParent, w0);
  const l1 = m4TransformPoint(invParent, w1);
  let dx = l1[0] - l0[0], dy = l1[1] - l0[1], dz = l1[2] - l0[2];
  if (axisLock === 'x') { dy = 0; dz = 0; }
  else if (axisLock === 'y') { dx = 0; dz = 0; }
  else if (axisLock === 'z') { dx = 0; dy = 0; }
  return [dx, dy, dz];
}

function distToSeg2D(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function rayIntersectsAABB(o: Vec3, d: Vec3, bMin: Vec3, bMax: Vec3): boolean {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < bMin[i] || o[i] > bMax[i]) return false;
    } else {
      const invD = 1 / d[i];
      let t1 = (bMin[i] - o[i]) * invD;
      let t2 = (bMax[i] - o[i]) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return tmax >= 0;
}
