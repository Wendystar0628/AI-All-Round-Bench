import polygonClipping from 'polygon-clipping';
import {
  BezierVertex, BooleanOpMode, Composition, Layer, PathContour, PathData,
  Poly2D, ShapeContent, ShapeItem, ShapeModifier, Vec2,
} from '../core/types';
import { clamp, DEG2RAD, genId, lerp } from '../core/math';
import { EvalContext } from '../core/expressions';

// ============================================================================
// Flatten Cubic Bezier Contours -> Poly2D[]
// ============================================================================
export function flattenContour(c: PathContour, curveSteps = 10): Poly2D {
  const verts = c.vertices;
  const pts: Vec2[] = [];
  if (verts.length === 0) return { points: [], closed: c.closed, isHole: c.isHole };
  if (verts.length === 1) return { points: [[verts[0].x, verts[0].y]], closed: c.closed, isHole: c.isHole };

  const segCount = c.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const hasHandles =
      Math.abs(a.outX) + Math.abs(a.outY) + Math.abs(b.inX) + Math.abs(b.inY) > 1e-3;
    const steps = hasHandles ? Math.max(2, curveSteps) : 1;
    const p0x = a.x, p0y = a.y;
    const p1x = a.x + a.outX, p1y = a.y + a.outY;
    const p2x = b.x + b.inX, p2y = b.y + b.inY;
    const p3x = b.x, p3y = b.y;

    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const inv = 1 - u;
      const x = inv * inv * inv * p0x + 3 * inv * inv * u * p1x + 3 * inv * u * u * p2x + u * u * u * p3x;
      const y = inv * inv * inv * p0y + 3 * inv * inv * u * p1y + 3 * inv * u * u * p2y + u * u * u * p3y;
      if (pts.length === 0 || Math.hypot(x - pts[pts.length - 1][0], y - pts[pts.length - 1][1]) > 1e-3) {
        pts.push([x, y]);
      }
    }
  }
  if (!c.closed) {
    const last = verts[verts.length - 1];
    pts.push([last.x, last.y]);
  }
  return { points: pts, closed: c.closed, isHole: c.isHole };
}

export function flattenPathData(pd: PathData, curveSteps = 10): Poly2D[] {
  return pd.contours.map((c) => flattenContour(c, curveSteps)).filter((p) => p.points.length >= 2);
}

export function polysToPathData(polys: Poly2D[]): PathData {
  return {
    contours: polys.map((poly) => ({
      id: genId('cnt'),
      closed: poly.closed,
      isHole: poly.isHole,
      vertices: poly.points.map(([x, y]): BezierVertex => ({ x, y, inX: 0, inY: 0, outX: 0, outY: 0 })),
    })),
  };
}

// ============================================================================
// Primitive Shape -> PathData
// ============================================================================
export function buildRoundedRectContours(cx: number, cy: number, w: number, h: number, rIn: number): PathContour[] {
  const hw = Math.max(0.5, w * 0.5);
  const hh = Math.max(0.5, h * 0.5);
  const r = clamp(rIn, 0, Math.min(hw, hh));
  if (r < 0.5) {
    return [{
      id: genId('rct'),
      closed: true,
      isHole: false,
      vertices: [
        { x: cx - hw, y: cy - hh, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: cx + hw, y: cy - hh, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: cx + hw, y: cy + hh, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: cx - hw, y: cy + hh, inX: 0, inY: 0, outX: 0, outY: 0 },
      ],
    }];
  }
  const k = 0.55228475 * r;
  return [{
    id: genId('rct'),
    closed: true,
    isHole: false,
    vertices: [
      { x: cx - hw + r, y: cy - hh, inX: -k, inY: 0, outX: 0, outY: 0 },
      { x: cx + hw - r, y: cy - hh, inX: 0, inY: 0, outX: k, outY: 0 },
      { x: cx + hw, y: cy - hh + r, inX: 0, inY: -k, outX: 0, outY: 0 },
      { x: cx + hw, y: cy + hh - r, inX: 0, inY: 0, outX: 0, outY: k },
      { x: cx + hw - r, y: cy + hh, inX: k, inY: 0, outX: 0, outY: 0 },
      { x: cx - hw + r, y: cy + hh, inX: 0, inY: 0, outX: -k, outY: 0 },
      { x: cx - hw, y: cy + hh - r, inX: 0, inY: k, outX: 0, outY: 0 },
      { x: cx - hw, y: cy - hh + r, inX: 0, inY: 0, outX: 0, outY: -k },
    ],
  }];
}

export function buildEllipseContours(cx: number, cy: number, w: number, h: number): PathContour[] {
  const rx = Math.max(0.5, w * 0.5);
  const ry = Math.max(0.5, h * 0.5);
  const k = 0.55228475;
  return [{
    id: genId('elp'),
    closed: true,
    isHole: false,
    vertices: [
      { x: cx, y: cy - ry, inX: -rx * k, inY: 0, outX: rx * k, outY: 0 },
      { x: cx + rx, y: cy, inX: 0, inY: -ry * k, outX: 0, outY: ry * k },
      { x: cx, y: cy + ry, inX: rx * k, inY: 0, outX: -rx * k, outY: 0 },
      { x: cx - rx, y: cy, inX: 0, inY: ry * k, outX: 0, outY: -ry * k },
    ],
  }];
}

export function buildStarContours(cx: number, cy: number, outerR: number, innerR: number, points = 5): PathContour[] {
  const n = Math.max(3, Math.round(points));
  const verts: BezierVertex[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const ang = -Math.PI * 0.5 + (i * Math.PI) / n;
    verts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, inX: 0, inY: 0, outX: 0, outY: 0 });
  }
  return [{ id: genId('str'), closed: true, isHole: false, vertices: verts }];
}

// ============================================================================
// Shape Operations: Trim Paths (Exact Arc-Length!), Repeater, 2D Booleans
// ============================================================================

export function trimPolysByArcLength(polys: Poly2D[], startPct: number, endPct: number, offsetDeg = 0): Poly2D[] {
  let s0 = clamp(startPct, 0, 100) / 100;
  let s1 = clamp(endPct, 0, 100) / 100;
  if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; }
  const span = s1 - s0;
  if (span <= 1e-5) return [];
  if (span >= 0.9999 && Math.abs(offsetDeg % 360) < 1e-4) return polys;

  const off = (((offsetDeg / 360) % 1) + 1) % 1;
  const out: Poly2D[] = [];

  for (const poly of polys) {
    const pts = poly.points;
    if (pts.length < 2) continue;
    const seq = poly.closed ? [...pts, pts[0]] : pts;
    const cum: number[] = [0];
    let total = 0;
    for (let i = 1; i < seq.length; i++) {
      total += Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]);
      cum.push(total);
    }
    if (total < 1e-5) continue;

    const sampleAt = (dist: number): Vec2 => {
      const d = clamp(dist, 0, total);
      let lo = 0, hi = cum.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid; else hi = mid;
      }
      const segL = cum[hi] - cum[lo];
      const f = segL > 1e-7 ? (d - cum[lo]) / segL : 0;
      return [lerp(seq[lo][0], seq[hi][0], f), lerp(seq[lo][1], seq[hi][1], f)];
    };

    const sliceRange = (fA: number, fB: number) => {
      const dA = fA * total;
      const dB = fB * total;
      if (dB - dA < 1e-4) return;
      const res: Vec2[] = [sampleAt(dA)];
      for (let i = 1; i < seq.length - 1; i++) {
        if (cum[i] > dA + 1e-4 && cum[i] < dB - 1e-4) {
          res.push([seq[i][0], seq[i][1]]);
        }
      }
      res.push(sampleAt(dB));
      if (res.length >= 2) {
        out.push({ points: res, closed: false, isHole: poly.isHole });
      }
    };

    const a = (s0 + off) % 1;
    const b = a + span;
    if (b <= 1.0 + 1e-6) {
      sliceRange(a, Math.min(1, b));
    } else if (poly.closed) {
      // Wrap around seam cleanly as a single continuous open polyline
      const dA = a * total;
      const dB = (b - 1) * total;
      const res: Vec2[] = [sampleAt(dA)];
      for (let i = 1; i < seq.length; i++) {
        if (cum[i] > dA + 1e-4) res.push([seq[i][0], seq[i][1]]);
      }
      for (let i = 1; i < seq.length; i++) {
        if (cum[i] < dB - 1e-4) res.push([seq[i][0], seq[i][1]]);
      }
      res.push(sampleAt(dB));
      if (res.length >= 2) out.push({ points: res, closed: false, isHole: poly.isHole });
    } else {
      sliceRange(a, 1);
      sliceRange(0, Math.min(1, b - 1));
    }
  }
  return out;
}

export function transformPolys2D(
  polys: Poly2D[],
  dx: number,
  dy: number,
  sx: number,
  sy: number,
  rotDeg: number
): Poly2D[] {
  const rad = rotDeg * DEG2RAD;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return polys.map((p) => ({
    closed: p.closed,
    isHole: p.isHole,
    points: p.points.map(([x, y]): Vec2 => {
      const rx = x * sx, ry = y * sy;
      return [rx * cos - ry * sin + dx, rx * sin + ry * cos + dy];
    }),
  }));
}

export function applyRepeaterToPolys(
  polys: Poly2D[],
  copies: number,
  offsetIdx: number,
  dx: number,
  dy: number,
  sxPct: number,
  syPct: number,
  rotDeg: number
): Poly2D[] {
  const count = clamp(Math.round(copies), 1, 64);
  const out: Poly2D[] = [];
  const sxStep = sxPct / 100;
  const syStep = syPct / 100;
  for (let i = 0; i < count; i++) {
    const k = i + offsetIdx;
    const sx = Math.pow(sxStep, k);
    const sy = Math.pow(syStep, k);
    const rot = rotDeg * k;
    // Accumulate rotated/scaled offset cleanly
    const tx = dx * k;
    const ty = dy * k;
    out.push(...transformPolys2D(polys, tx, ty, sx, sy, rot));
  }
  return out;
}

// ============================================================================
// 2D Boolean Operations via polygon-clipping (Union / Difference / Intersection)
// ============================================================================
type Ring = [number, number][];
type PolygonPC = Ring[];
type MultiPolygonPC = PolygonPC[];

function polySignedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * 0.5;
}

function pointInRing(pt: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function polysToMultiPolygon(polys: Poly2D[]): MultiPolygonPC {
  const closedPolys = polys.filter((p) => p.points.length >= 3);
  if (closedPolys.length === 0) return [];

  // Group holes inside their containing outer ring
  const outers: { ring: Ring; holes: Ring[]; area: number }[] = [];
  const holes: Ring[] = [];

  for (const p of closedPolys) {
    const ring: Ring = p.points.map(([x, y]) => [x, y]);
    // Close ring explicitly for polygon-clipping
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    if (p.isHole) {
      holes.push(ring);
    } else {
      outers.push({ ring, holes: [], area: Math.abs(polySignedArea(p.points)) });
    }
  }

  if (outers.length === 0 && holes.length > 0) {
    // Fallback if all marked hole
    return holes.map((h) => [h]);
  }

  // Assign each hole to smallest containing outer ring
  for (const h of holes) {
    let best: typeof outers[0] | null = null;
    for (const o of outers) {
      if (pointInRing(h[0], o.ring)) {
        if (!best || o.area < best.area) best = o;
      }
    }
    if (best) best.holes.push(h);
  }

  return outers.map((o) => [o.ring, ...o.holes]);
}

function multiPolygonToPolys(mp: MultiPolygonPC): Poly2D[] {
  const out: Poly2D[] = [];
  for (const poly of mp) {
    for (let ri = 0; ri < poly.length; ri++) {
      const ring = poly[ri];
      if (!ring || ring.length < 3) continue;
      // Remove duplicate closing point
      const pts: Vec2[] = [];
      for (let i = 0; i < ring.length; i++) {
        const pt: Vec2 = [ring[i][0], ring[i][1]];
        if (i === ring.length - 1 && pts.length > 0 && Math.hypot(pt[0] - pts[0][0], pt[1] - pts[0][1]) < 1e-5) {
          continue;
        }
        pts.push(pt);
      }
      if (pts.length >= 3) {
        out.push({ points: pts, closed: true, isHole: ri > 0 });
      }
    }
  }
  return out;
}

export function booleanOpPolys(aPolys: Poly2D[], bPolys: Poly2D[], mode: BooleanOpMode): Poly2D[] {
  const mpA = polysToMultiPolygon(aPolys);
  const mpB = polysToMultiPolygon(bPolys);
  if (mpA.length === 0 && mpB.length === 0) return [];
  if (mpB.length === 0) return mode === 'intersect' ? [] : aPolys;
  if (mpA.length === 0) return mode === 'union' ? bPolys : [];

  try {
    let res: MultiPolygonPC;
    if (mode === 'union') {
      res = polygonClipping.union(mpA as any, mpB as any) as MultiPolygonPC;
    } else if (mode === 'difference') {
      res = polygonClipping.difference(mpA as any, mpB as any) as MultiPolygonPC;
    } else {
      res = polygonClipping.intersection(mpA as any, mpB as any) as MultiPolygonPC;
    }
    return multiPolygonToPolys(res);
  } catch (e) {
    console.warn('Boolean op error:', e);
    return aPolys;
  }
}

export function booleanOpGroups(groups: Poly2D[][], mode: BooleanOpMode): Poly2D[] {
  if (groups.length === 0) return [];
  if (groups.length === 1) return groups[0];
  let acc = groups[0];
  for (let i = 1; i < groups.length; i++) {
    acc = booleanOpPolys(acc, groups[i], mode);
  }
  return acc;
}

// ============================================================================
// Evaluate Full Shape Layer Content (Items -> Ordered Modifiers!)
// ============================================================================
export interface EvaluatedShapeResult {
  polys: Poly2D[];
  pathData: PathData;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function evaluateShapeItemContours(
  comp: Composition,
  layer: Layer,
  item: ShapeItem,
  time: number,
  ec: EvalContext
): PathContour[] {
  if (!item.visible) return [];
  const pos = ec.evaluateProp(layer, item.position, `shape.${item.id}.position`, time) as Vec2;
  const size = ec.evaluateProp(layer, item.size, `shape.${item.id}.size`, time) as Vec2;
  if (item.kind === 'rect') {
    const r = ec.evaluateProp(layer, item.roundness, `shape.${item.id}.roundness`, time) as number;
    return buildRoundedRectContours(pos[0], pos[1], size[0], size[1], r);
  }
  if (item.kind === 'ellipse') {
    return buildEllipseContours(pos[0], pos[1], size[0], size[1]);
  }
  if (item.kind === 'star') {
    const ir = item.innerRadius ? (ec.evaluateProp(layer, item.innerRadius, `shape.${item.id}.innerRadius`, time) as number) : size[0] * 0.25;
    return buildStarContours(pos[0], pos[1], size[0] * 0.5, ir, item.points ?? 5);
  }
  // Free Bezier path (supports animated Path Morphing!)
  const pd = ec.evaluateProp(layer, item.path, `shape.${item.id}.path`, time) as PathData;
  return pd.contours.map((c) => ({
    ...c,
    vertices: c.vertices.map((v) => ({ ...v, x: v.x + pos[0], y: v.y + pos[1] })),
  }));
}

export function evaluateShapeLayer(
  comp: Composition,
  layer: Layer,
  content: ShapeContent,
  time: number,
  ctx?: EvalContext,
  curveSteps = 12
): EvaluatedShapeResult {
  const ec = ctx ?? new EvalContext(comp);

  // Evaluate each shape item as its own group so Boolean modifier knows distinct operands!
  let groups: Poly2D[][] = [];
  for (const item of content.items) {
    const contours = evaluateShapeItemContours(comp, layer, item, time, ec);
    if (contours.length > 0) {
      groups.push(contours.map((c) => flattenContour(c, curveSteps)));
    }
  }

  // Apply modifiers strictly in user-configured order!
  for (const mod of content.modifiers) {
    if (!mod.enabled) continue;
    if (mod.type === 'trim') {
      const st = mod.start ? (ec.evaluateProp(layer, mod.start, `mod.${mod.id}.start`, time) as number) : 0;
      const en = mod.end ? (ec.evaluateProp(layer, mod.end, `mod.${mod.id}.end`, time) as number) : 100;
      const off = mod.offset ? (ec.evaluateProp(layer, mod.offset, `mod.${mod.id}.offset`, time) as number) : 0;
      groups = groups.map((g) => trimPolysByArcLength(g, st, en, off));
    } else if (mod.type === 'repeater') {
      const copies = mod.copies ? (ec.evaluateProp(layer, mod.copies, `mod.${mod.id}.copies`, time) as number) : 3;
      const offIdx = mod.offsetIndex ? (ec.evaluateProp(layer, mod.offsetIndex, `mod.${mod.id}.offsetIndex`, time) as number) : 0;
      const rPos = mod.repPosition ? (ec.evaluateProp(layer, mod.repPosition, `mod.${mod.id}.repPosition`, time) as Vec2) : [50, 0];
      const rScl = mod.repScale ? (ec.evaluateProp(layer, mod.repScale, `mod.${mod.id}.repScale`, time) as Vec2) : [100, 100];
      const rRot = mod.repRotation ? (ec.evaluateProp(layer, mod.repRotation, `mod.${mod.id}.repRotation`, time) as number) : 0;
      // Repeater produces individual repeated groups so a subsequent Boolean can union/diff them!
      const flatAll = groups.flat();
      const count = clamp(Math.round(copies), 1, 64);
      const sxStep = rScl[0] / 100;
      const syStep = rScl[1] / 100;
      const newGroups: Poly2D[][] = [];
      for (let i = 0; i < count; i++) {
        const k = i + offIdx;
        newGroups.push(transformPolys2D(flatAll, rPos[0] * k, rPos[1] * k, Math.pow(sxStep, k), Math.pow(syStep, k), rRot * k));
      }
      groups = newGroups;
    } else if (mod.type === 'boolean') {
      const op = mod.boolOp ?? 'union';
      const combined = booleanOpGroups(groups, op);
      groups = [combined];
    }
  }

  const polys = groups.flat();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) {
    for (const [x, y] of p.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -60; minY = -60; maxX = 60; maxY = 60;
  }

  return {
    polys,
    pathData: polysToPathData(polys),
    bounds: { minX, minY, maxX, maxY },
  };
}

/** Sample point & tangent along Poly2D[] at normalized fraction u in [0,1] (for curve particle emitters!) */
export function samplePolysAtFraction(polys: Poly2D[], u: number): { pos: Vec2; tangent: Vec2 } {
  const segs: { a: Vec2; b: Vec2; len: number }[] = [];
  let total = 0;
  for (const p of polys) {
    const pts = p.points;
    if (pts.length < 2) continue;
    const n = p.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > 1e-5) {
        segs.push({ a, b, len: l });
        total += l;
      }
    }
  }
  if (segs.length === 0 || total < 1e-5) return { pos: [0, 0], tangent: [1, 0] };
  const target = clamp(u, 0, 1) * total;
  let acc = 0;
  for (const s of segs) {
    if (acc + s.len >= target || s === segs[segs.length - 1]) {
      const f = clamp((target - acc) / s.len, 0, 1);
      const dx = (s.b[0] - s.a[0]) / s.len;
      const dy = (s.b[1] - s.a[1]) / s.len;
      return {
        pos: [lerp(s.a[0], s.b[0], f), lerp(s.a[1], s.b[1], f)],
        tangent: [dx, dy],
      };
    }
    acc += s.len;
  }
  return { pos: segs[0].a, tangent: [1, 0] };
}
