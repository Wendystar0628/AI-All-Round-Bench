import {
  AnimProp, Keyframe, PropValue, Vec2, Vec3, ColorRGBA, PathData, PathContour, BezierVertex,
} from './types';
import {
  clamp, lerp, deepClone, genId, solveCubicBezierX, evalCubicBezier1D,
  evalCubicBezier3D, buildBezier3DArcLengthLUT, arcLengthFractionToU,
  v3Add, v3Dist, ArcLengthLUT,
} from './math';

// ============================================================================
// Helper: Create AnimProp & Keyframes
// ============================================================================
export function makeProp<T>(
  id: string,
  label: string,
  type: AnimProp<T>['type'],
  value: T,
  opts?: Partial<Pick<AnimProp<T>, 'min' | 'max' | 'step' | 'unit' | 'animated' | 'keyframes' | 'expression' | 'expressionEnabled'>>
): AnimProp<T> {
  return {
    id,
    label,
    type,
    value: deepClone(value),
    animated: opts?.animated ?? false,
    keyframes: opts?.keyframes ? deepClone(opts.keyframes) : [],
    expressionEnabled: opts?.expressionEnabled ?? false,
    expression: opts?.expression ?? '',
    min: opts?.min,
    max: opts?.max,
    step: opts?.step,
    unit: opts?.unit,
  };
}

export function makeKeyframe<T>(
  time: number,
  value: T,
  ease: 'linear' | 'ease' | 'easeIn' | 'easeOut' | 'hold' = 'linear',
  spatial?: { inTan?: Vec3; outTan?: Vec3; broken?: boolean; linear?: boolean }
): Keyframe<T> {
  let inType: Keyframe['inType'] = 'linear';
  let outType: Keyframe['outType'] = 'linear';
  let outHandle: [number, number] = [0.333, 0.333];
  let inHandle: [number, number] = [0.667, 0.667];

  if (ease === 'hold') {
    outType = 'hold';
  } else if (ease === 'ease') {
    inType = 'bezier';
    outType = 'bezier';
    outHandle = [0.42, 0.0];
    inHandle = [0.58, 1.0];
  } else if (ease === 'easeIn') {
    inType = 'bezier';
    inHandle = [0.58, 1.0];
  } else if (ease === 'easeOut') {
    outType = 'bezier';
    outHandle = [0.42, 0.0];
  }

  return {
    id: genId('kf'),
    time,
    value: deepClone(value),
    inType,
    outType,
    outHandle,
    inHandle,
    inSpatialTangent: spatial?.inTan ? [...spatial.inTan] : undefined,
    outSpatialTangent: spatial?.outTan ? [...spatial.outTan] : undefined,
    spatialBroken: spatial?.broken,
    spatialLinear: spatial?.linear,
  };
}

export function sortKeyframes<T>(prop: AnimProp<T>): void {
  prop.keyframes.sort((a, b) => a.time - b.time);
}

/**
 * AE Rule (2.3): When property has animation enabled, modifying it from ANY entry
 * (Inspector, Canvas, Node, Curve) ONLY creates or updates the keyframe at current `time`.
 */
export function setPropValueAtTime<T>(prop: AnimProp<T>, time: number, value: T, snapEps = 1e-3): void {
  if (!prop.animated) {
    prop.value = deepClone(value);
    return;
  }
  const existing = prop.keyframes.find((k) => Math.abs(k.time - time) <= snapEps);
  if (existing) {
    existing.value = deepClone(value);
  } else {
    prop.keyframes.push(makeKeyframe(time, value, 'linear'));
    sortKeyframes(prop);
  }
}

export function togglePropAnimation<T>(prop: AnimProp<T>, currentTime: number, currentEvaluatedValue: T): void {
  if (!prop.animated) {
    prop.animated = true;
    if (prop.keyframes.length === 0) {
      prop.keyframes.push(makeKeyframe(currentTime, currentEvaluatedValue, 'linear'));
    }
  } else {
    prop.value = deepClone(currentEvaluatedValue);
    prop.animated = false;
    prop.keyframes = [];
  }
}

export function applyEasyEase(kf: Keyframe, mode: 'ease' | 'easeIn' | 'easeOut' | 'linear' | 'hold'): void {
  if (mode === 'linear') {
    kf.inType = 'linear';
    kf.outType = 'linear';
    kf.outHandle = [0.333, 0.333];
    kf.inHandle = [0.667, 0.667];
  } else if (mode === 'hold') {
    kf.outType = 'hold';
  } else if (mode === 'ease') {
    kf.inType = 'bezier';
    kf.outType = 'bezier';
    kf.outHandle = [0.42, 0.0];
    kf.inHandle = [0.58, 1.0];
  } else if (mode === 'easeIn') {
    kf.inType = 'bezier';
    kf.inHandle = [0.58, 1.0];
  } else if (mode === 'easeOut') {
    kf.outType = 'bezier';
    kf.outHandle = [0.42, 0.0];
  }
}

export function scaleSelectedKeyframes(
  keyframes: Keyframe[],
  selectedIds: Set<string>,
  pivotTime: number,
  scaleFactor: number
): void {
  const safeScale = Math.max(0.05, scaleFactor);
  for (const kf of keyframes) {
    if (selectedIds.has(kf.id)) {
      kf.time = Math.max(0, pivotTime + (kf.time - pivotTime) * safeScale);
    }
  }
  keyframes.sort((a, b) => a.time - b.time);
}

// ============================================================================
// Temporal Easing Curve Evaluation
// ============================================================================
export function evalTemporalProgress(k0: Keyframe, k1: Keyframe, time: number): number {
  const dt = k1.time - k0.time;
  if (dt <= 1e-7) return 1;
  const localT = clamp((time - k0.time) / dt, 0, 1);

  if (k0.outType === 'hold') {
    return time >= k1.time ? 1 : 0;
  }
  if (k0.outType === 'linear' && k1.inType === 'linear') {
    return localT;
  }

  const p1 = k0.outType === 'bezier' ? k0.outHandle : [0.3333, 0.3333];
  const p2 = k1.inType === 'bezier' ? k1.inHandle : [0.6667, 0.6667];
  const u = solveCubicBezierX(p1[0], p2[0], localT);
  return evalCubicBezier1D(0, p1[1], p2[1], 1, u);
}

export function evalTemporalDerivative(k0: Keyframe, k1: Keyframe, time: number): number {
  const dt = k1.time - k0.time;
  if (dt <= 1e-7 || k0.outType === 'hold') return 0;
  const h = Math.min(1e-4, dt * 0.01);
  const tA = Math.max(k0.time, time - h);
  const tB = Math.min(k1.time, time + h);
  if (tB <= tA) return 0;
  return (evalTemporalProgress(k0, k1, tB) - evalTemporalProgress(k0, k1, tA)) / (tB - tA);
}

// ============================================================================
// Spatial Bezier Path Helpers (for Position Properties)
// ============================================================================
function hasSpatialTangents(k0: Keyframe, k1: Keyframe): boolean {
  if (k0.spatialLinear && k1.spatialLinear) return false;
  const o = k0.outSpatialTangent;
  const i = k1.inSpatialTangent;
  const oLen = o ? Math.hypot(o[0], o[1], o[2]) : 0;
  const iLen = i ? Math.hypot(i[0], i[1], i[2]) : 0;
  return oLen > 1e-4 || iLen > 1e-4;
}

function getSpatialSegmentControlPoints(k0: Keyframe<Vec3>, k1: Keyframe<Vec3>): [Vec3, Vec3, Vec3, Vec3] {
  const p0: Vec3 = [k0.value[0], k0.value[1], k0.value[2] ?? 0];
  const p3: Vec3 = [k1.value[0], k1.value[1], k1.value[2] ?? 0];
  const outT: Vec3 = k0.spatialLinear ? [0, 0, 0] : (k0.outSpatialTangent ?? [0, 0, 0]);
  const inT: Vec3 = k1.spatialLinear ? [0, 0, 0] : (k1.inSpatialTangent ?? [0, 0, 0]);
  const p1 = v3Add(p0, outT);
  const p2 = v3Add(p3, inT);
  return [p0, p1, p2, p3];
}

// Lightweight LUT cache keyed by segment coordinates
const _lutCache = new Map<string, ArcLengthLUT>();

export function getSpatialSegmentLUT(k0: Keyframe<Vec3>, k1: Keyframe<Vec3>): ArcLengthLUT {
  const [p0, p1, p2, p3] = getSpatialSegmentControlPoints(k0, k1);
  const key = `${p0[0].toFixed(2)},${p0[1].toFixed(2)},${p0[2].toFixed(2)}|${p1[0].toFixed(2)},${p1[1].toFixed(2)},${p1[2].toFixed(2)}|${p2[0].toFixed(2)},${p2[1].toFixed(2)},${p2[2].toFixed(2)}|${p3[0].toFixed(2)},${p3[1].toFixed(2)},${p3[2].toFixed(2)}`;
  let lut = _lutCache.get(key);
  if (!lut) {
    if (_lutCache.size > 400) _lutCache.clear();
    lut = buildBezier3DArcLengthLUT(p0, p1, p2, p3, 64);
    _lutCache.set(key, lut);
  }
  return lut;
}

/** Sample spatial motion path points for Canvas visualization */
export function sampleSpatialMotionPath(prop: AnimProp<Vec3>, stepsPerSegment = 28): Vec3[] {
  const kfs = prop.keyframes;
  if (!prop.animated || kfs.length < 2) return [];
  const pts: Vec3[] = [];
  for (let i = 0; i < kfs.length - 1; i++) {
    const k0 = kfs[i], k1 = kfs[i + 1];
    const [p0, p1, p2, p3] = getSpatialSegmentControlPoints(k0, k1);
    const curved = hasSpatialTangents(k0, k1);
    const steps = curved ? stepsPerSegment : 2;
    for (let s = 0; s <= steps; s++) {
      if (i > 0 && s === 0) continue;
      const u = s / steps;
      pts.push(curved ? evalCubicBezier3D(p0, p1, p2, p3, u) : [
        lerp(p0[0], p3[0], u),
        lerp(p0[1], p3[1], u),
        lerp(p0[2], p3[2], u),
      ]);
    }
  }
  return pts;
}

// ============================================================================
// Hole-Aware Path Morphing (2.5)
// ============================================================================
function signedAreaOfVertices(verts: BezierVertex[]): number {
  let a = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p = verts[i], q = verts[(i + 1) % n];
    a += (p.x * q.y - q.x * p.y);
  }
  return a * 0.5;
}

function resampleContour(c: PathContour, targetCount: number): BezierVertex[] {
  const src = c.vertices;
  if (src.length === 0) return [];
  if (src.length === targetCount) return src.map((v) => ({ ...v }));

  // Build cumulative arc length along polyline/bezier segments
  const segCount = c.closed ? src.length : Math.max(1, src.length - 1);
  const segSamples: Array<{ x: number; y: number }[]> = [];
  const segLens: number[] = [];
  let totalLen = 0;
  const subN = 12;

  for (let i = 0; i < segCount; i++) {
    const a = src[i];
    const b = src[(i + 1) % src.length];
    const p0x = a.x, p0y = a.y;
    const p1x = a.x + a.outX, p1y = a.y + a.outY;
    const p2x = b.x + b.inX, p2y = b.y + b.inY;
    const p3x = b.x, p3y = b.y;
    const arr: Array<{ x: number; y: number }> = [];
    let sl = 0;
    let px = p0x, py = p0y;
    for (let s = 0; s <= subN; s++) {
      const u = s / subN;
      const inv = 1 - u;
      const x = inv * inv * inv * p0x + 3 * inv * inv * u * p1x + 3 * inv * u * u * p2x + u * u * u * p3x;
      const y = inv * inv * inv * p0y + 3 * inv * inv * u * p1y + 3 * inv * u * u * p2y + u * u * u * p3y;
      if (s > 0) sl += Math.hypot(x - px, y - py);
      arr.push({ x, y });
      px = x; py = y;
    }
    segSamples.push(arr);
    segLens.push(sl);
    totalLen += sl;
  }

  const out: BezierVertex[] = [];
  const denom = c.closed ? targetCount : Math.max(1, targetCount - 1);
  for (let k = 0; k < targetCount; k++) {
    const targetDist = (k / denom) * totalLen;
    let acc = 0;
    let chosenX = src[0].x, chosenY = src[0].y;
    for (let i = 0; i < segCount; i++) {
      const sl = segLens[i];
      if (acc + sl >= targetDist - 1e-6 || i === segCount - 1) {
        const localFrac = sl > 1e-6 ? clamp((targetDist - acc) / sl, 0, 1) : 0;
        const arr = segSamples[i];
        const fIdx = localFrac * (arr.length - 1);
        const i0 = Math.floor(fIdx);
        const i1 = Math.min(arr.length - 1, i0 + 1);
        const lf = fIdx - i0;
        chosenX = lerp(arr[i0].x, arr[i1].x, lf);
        chosenY = lerp(arr[i0].y, arr[i1].y, lf);
        break;
      }
      acc += sl;
    }
    out.push({ x: chosenX, y: chosenY, inX: 0, inY: 0, outX: 0, outY: 0 });
  }
  return out;
}

function alignClosedRing(a: BezierVertex[], b: BezierVertex[]): BezierVertex[] {
  const n = a.length;
  if (n === 0 || b.length !== n) return b;
  // Ensure same winding orientation if needed, then pick cyclic rotation minimizing sum squared distance
  const testCandidate = (cand: BezierVertex[]) => {
    let bestShift = 0;
    let bestCost = Infinity;
    for (let shift = 0; shift < n; shift++) {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        const va = a[i], vb = cand[(i + shift) % n];
        const dx = va.x - vb.x, dy = va.y - vb.y;
        cost += dx * dx + dy * dy;
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestShift = shift;
      }
    }
    const rotated: BezierVertex[] = [];
    for (let i = 0; i < n; i++) rotated.push(cand[(i + bestShift) % n]);
    return { cost: bestCost, ring: rotated };
  };
  const fwd = testCandidate(b);
  const rev = testCandidate([...b].reverse());
  return fwd.cost <= rev.cost ? fwd.ring : rev.ring;
}

function collapseContourToPoint(c: PathContour): PathContour {
  let cx = 0, cy = 0;
  for (const v of c.vertices) { cx += v.x; cy += v.y; }
  const n = Math.max(1, c.vertices.length);
  cx /= n; cy /= n;
  return {
    id: c.id,
    closed: c.closed,
    isHole: c.isHole,
    vertices: c.vertices.map(() => ({ x: cx, y: cy, inX: 0, inY: 0, outX: 0, outY: 0 })),
  };
}

/**
 * Hole-aware path morphing (2.5):
 * Separates outer contours and holes so holes morph cleanly to holes (preserving correspondence!)
 * and outer contours morph cleanly to outer contours.
 */
export function morphPathData(a: PathData, b: PathData, t: number): PathData {
  if (t <= 0) return deepClone(a);
  if (t >= 1) return deepClone(b);

  const classify = (pd: PathData) => {
    const outers: PathContour[] = [];
    const holes: PathContour[] = [];
    for (const c of pd.contours) {
      const area = signedAreaOfVertices(c.vertices);
      const isHole = c.isHole !== undefined ? c.isHole : (pd.contours.length > 1 && area < 0);
      if (isHole) holes.push(c); else outers.push(c);
    }
    return { outers, holes };
  };

  const ca = classify(a);
  const cb = classify(b);

  const morphList = (listA: PathContour[], listB: PathContour[], markHole: boolean): PathContour[] => {
    const count = Math.max(listA.length, listB.length);
    const res: PathContour[] = [];
    for (let i = 0; i < count; i++) {
      const rawA = listA[i] ?? collapseContourToPoint(listB[i]);
      const rawB = listB[i] ?? collapseContourToPoint(listA[i]);
      const sameTopo = rawA.vertices.length === rawB.vertices.length && rawA.closed === rawB.closed;
      let va: BezierVertex[], vb: BezierVertex[];
      if (sameTopo) {
        va = rawA.vertices;
        vb = rawB.vertices;
      } else {
        const n = Math.max(24, rawA.vertices.length, rawB.vertices.length);
        va = resampleContour(rawA, n);
        vb = resampleContour(rawB, n);
        if (rawA.closed && rawB.closed) {
          vb = alignClosedRing(va, vb);
        }
      }
      const verts: BezierVertex[] = va.map((p, idx) => {
        const q = vb[idx];
        return {
          x: lerp(p.x, q.x, t),
          y: lerp(p.y, q.y, t),
          inX: lerp(p.inX, q.inX, t),
          inY: lerp(p.inY, q.inY, t),
          outX: lerp(p.outX, q.outX, t),
          outY: lerp(p.outY, q.outY, t),
          broken: p.broken || q.broken,
        };
      });
      res.push({
        id: rawA.id || genId('cnt'),
        closed: rawA.closed || rawB.closed,
        isHole: markHole,
        vertices: verts,
      });
    }
    return res;
  };

  return {
    contours: [
      ...morphList(ca.outers, cb.outers, false),
      ...morphList(ca.holes, cb.holes, true),
    ],
  };
}

// ============================================================================
// Core Keyframe Evaluator (before Expressions)
// ============================================================================
export function evaluateKeyframes<T>(prop: AnimProp<T>, time: number, isSpatial = false): T {
  if (!prop.animated || prop.keyframes.length === 0) {
    return deepClone(prop.value);
  }
  const kfs = prop.keyframes;
  if (kfs.length === 1 || time <= kfs[0].time) {
    return deepClone(kfs[0].value);
  }
  const last = kfs[kfs.length - 1];
  if (time >= last.time) {
    return deepClone(last.value);
  }

  // Binary search for segment [k0, k1]
  let lo = 0, hi = kfs.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].time <= time) lo = mid; else hi = mid;
  }
  const k0 = kfs[lo];
  const k1 = kfs[hi];

  const sFrac = evalTemporalProgress(k0, k1, time);

  if (prop.type === 'scalar') {
    return lerp(k0.value as number, k1.value as number, sFrac) as T;
  }
  if (prop.type === 'vec2') {
    const a = k0.value as Vec2, b = k1.value as Vec2;
    if (isSpatial && hasSpatialTangents(k0, k1)) {
      const k03 = { ...k0, value: [a[0], a[1], 0] as Vec3 };
      const k13 = { ...k1, value: [b[0], b[1], 0] as Vec3 };
      const [p0, p1, p2, p3] = getSpatialSegmentControlPoints(k03, k13);
      const lut = getSpatialSegmentLUT(k03, k13);
      const u = arcLengthFractionToU(lut, sFrac);
      const pt = evalCubicBezier3D(p0, p1, p2, p3, u);
      return [pt[0], pt[1]] as T;
    }
    return [lerp(a[0], b[0], sFrac), lerp(a[1], b[1], sFrac)] as T;
  }
  if (prop.type === 'vec3') {
    const a = k0.value as Vec3, b = k1.value as Vec3;
    if (isSpatial && hasSpatialTangents(k0, k1)) {
      const [p0, p1, p2, p3] = getSpatialSegmentControlPoints(k0 as Keyframe<Vec3>, k1 as Keyframe<Vec3>);
      const lut = getSpatialSegmentLUT(k0 as Keyframe<Vec3>, k1 as Keyframe<Vec3>);
      const u = arcLengthFractionToU(lut, sFrac);
      return evalCubicBezier3D(p0, p1, p2, p3, u) as T;
    }
    return [lerp(a[0], b[0], sFrac), lerp(a[1], b[1], sFrac), lerp(a[2], b[2], sFrac)] as T;
  }
  if (prop.type === 'color') {
    const a = k0.value as ColorRGBA, b = k1.value as ColorRGBA;
    return [
      clamp(lerp(a[0], b[0], sFrac), 0, 1),
      clamp(lerp(a[1], b[1], sFrac), 0, 1),
      clamp(lerp(a[2], b[2], sFrac), 0, 1),
      clamp(lerp(a[3], b[3], sFrac), 0, 1),
    ] as T;
  }
  if (prop.type === 'path') {
    return morphPathData(k0.value as PathData, k1.value as PathData, sFrac) as T;
  }
  return deepClone(k0.value);
}

/**
 * Evaluate true Speed (units/sec) at time `t` for Speed Graph (2.3):
 * For spatial Position, returns exact physical speed ds/dt along the curved motion path!
 * For scalar/vec, returns finite-difference rate of change.
 */
export function evaluatePropertySpeed(
  evalFn: (t: number) => PropValue,
  prop: AnimProp<any>,
  time: number,
  isSpatial = false
): number {
  const eps = 1e-3;
  // Exact analytical arc-length speed for spatial keyframed properties without expressions
  if (isSpatial && !prop.expressionEnabled && prop.animated && prop.keyframes.length >= 2) {
    const kfs = prop.keyframes;
    if (time < kfs[0].time || time > kfs[kfs.length - 1].time) return 0;
    for (let i = 0; i < kfs.length - 1; i++) {
      const k0 = kfs[i], k1 = kfs[i + 1];
      if (time >= k0.time && time <= k1.time) {
        if (k0.outType === 'hold') return 0;
        const dsdt = evalTemporalDerivative(k0, k1, time);
        if (prop.type === 'vec3' && hasSpatialTangents(k0, k1)) {
          const lut = getSpatialSegmentLUT(k0 as Keyframe<Vec3>, k1 as Keyframe<Vec3>);
          return Math.abs(dsdt * lut.totalLength);
        }
        const a = k0.value as Vec3, b = k1.value as Vec3;
        const dist = v3Dist([a[0], a[1], a[2] ?? 0], [b[0], b[1], b[2] ?? 0]);
        return Math.abs(dsdt * dist);
      }
    }
  }
  // General path speed (works seamlessly with expressions AND spatial curves!)
  const v0 = evalFn(Math.max(0, time - eps));
  const v1 = evalFn(time + eps);
  const dt = time + eps - Math.max(0, time - eps);
  if (dt <= 1e-7) return 0;
  if (typeof v0 === 'number' && typeof v1 === 'number') {
    return (v1 - v0) / dt;
  }
  if (Array.isArray(v0) && Array.isArray(v1)) {
    let sumSq = 0;
    for (let i = 0; i < Math.min(v0.length, v1.length); i++) {
      const d = (v1[i] as number) - (v0[i] as number);
      sumSq += d * d;
    }
    return Math.sqrt(sumSq) / dt;
  }
  return 0;
}
