import {
  ColorRGBA, Composition, EvaluatedField, FieldBlendMode, FieldKind, Layer, Vec3,
} from '../core/types';
import {
  clamp, lerp, m4TransformDir, m4TransformPoint, noiseVec3, v3Add, v3Cross, v3Dot,
  v3Len, v3Norm, v3Scale, v3Sub,
} from '../core/math';
import { EvalContext } from '../core/expressions';
import { getLayerWorldMatrix } from '../core/project';

export function makePrimitiveField(opts: {
  kind: FieldKind;
  center: Vec3;
  radius: number;
  falloff: number;
  strength: number;
  direction: Vec3;
  noiseScale: number;
  noiseSpeed: number;
  swirlAngle: number;
  pullInward: number;
  invert?: boolean;
  color?: ColorRGBA;
}): EvaluatedField {
  const {
    kind, center, radius, falloff, strength, direction,
    noiseScale, noiseSpeed, swirlAngle, pullInward, invert = false,
  } = opts;
  const safeRadius = Math.max(1, radius);
  const safeFalloff = Math.max(0.15, falloff);
  const dirNorm = v3Norm(direction);
  const color: ColorRGBA = opts.color ?? (
    kind === 'vortex' ? [0.22, 0.86, 1.0, 0.7]
      : kind === 'noise' ? [0.72, 0.42, 1.0, 0.7]
      : [1.0, 0.54, 0.16, 0.7]
  );

  return {
    sample(p: Vec3, time: number) {
      const rel = v3Sub(p, center);
      const dist = v3Len(rel);
      let rawW = clamp(1 - dist / safeRadius, 0, 1);
      if (invert) rawW = 1 - rawW;
      const weight = rawW <= 0 ? 0 : Math.pow(rawW, safeFalloff);
      if (weight <= 1e-5 || Math.abs(strength) <= 1e-6) {
        return { weight: 0, force: [0, 0, 0] };
      }

      if (kind === 'distance') {
        // Directional push with slight radial flare away from center
        const radial = dist > 1e-4 ? v3Scale(rel, 1 / dist) : [0, 1, 0] as Vec3;
        const combinedDir = v3Norm(v3Add(v3Scale(dirNorm, 0.85), v3Scale(radial, 0.25)));
        return { weight, force: v3Scale(combinedDir, strength * weight) };
      }

      if (kind === 'noise') {
        const sc = Math.max(0.0005, noiseScale);
        const tOff = time * noiseSpeed;
        const nv = noiseVec3(p[0] * sc + tOff, p[1] * sc + tOff * 0.73, p[2] * sc - tOff * 0.51, 913);
        return { weight, force: v3Scale(nv, strength * weight) };
      }

      // Vortex field: tangential swirl around dirNorm + radial pull/push
      const axial = v3Dot(rel, dirNorm);
      const radialVec = v3Sub(rel, v3Scale(dirNorm, axial));
      const rLen = v3Len(radialVec);
      if (rLen < 1e-4) return { weight, force: [0, 0, 0] };
      const rNorm = v3Scale(radialVec, 1 / rLen);
      const tang = v3Cross(dirNorm, rNorm);
      const force = v3Add(
        v3Scale(tang, strength * swirlAngle * weight),
        v3Scale(rNorm, -strength * pullInward * weight)
      );
      return { weight, force };
    },
    debugGizmos: [{
      kind,
      center,
      radius: safeRadius,
      direction: dirNorm,
      color,
      strength,
    }],
  };
}

export function evaluateFieldLayer(
  comp: Composition,
  layer: Layer,
  time: number,
  ctx?: EvalContext
): EvaluatedField | null {
  if (!layer.field || !layer.visible || time < layer.inPoint || time > layer.outPoint) return null;
  const ec = ctx ?? new EvalContext(comp);
  const f = layer.field;
  const worldMat = getLayerWorldMatrix(comp, layer, time, ec);
  const center = m4TransformPoint(worldMat, [0, 0, 0]);
  const localDir = ec.evaluateProp(layer, f.direction, 'field.direction', time) as Vec3;
  const worldDir = v3Norm(m4TransformDir(worldMat, localDir));

  // Scale radius by world scale magnitude
  const sx = Math.hypot(worldMat[0], worldMat[1], worldMat[2]);
  const sy = Math.hypot(worldMat[4], worldMat[5], worldMat[6]);
  const sz = Math.hypot(worldMat[8], worldMat[9], worldMat[10]);
  const avgScale = Math.max(0.01, (sx + sy + sz) / 3);

  const radius = (ec.evaluateProp(layer, f.radius, 'field.radius', time) as number) * avgScale;
  const falloff = ec.evaluateProp(layer, f.falloff, 'field.falloff', time) as number;
  const strength = ec.evaluateProp(layer, f.strength, 'field.strength', time) as number;
  const noiseScale = ec.evaluateProp(layer, f.noiseScale, 'field.noiseScale', time) as number;
  const noiseSpeed = ec.evaluateProp(layer, f.noiseSpeed, 'field.noiseSpeed', time) as number;
  const swirlAngle = ec.evaluateProp(layer, f.swirlAngle, 'field.swirlAngle', time) as number;
  const pullInward = ec.evaluateProp(layer, f.pullInward, 'field.pullInward', time) as number;

  return makePrimitiveField({
    kind: f.kind,
    center,
    radius,
    falloff,
    strength,
    direction: worldDir,
    noiseScale,
    noiseSpeed,
    swirlAngle,
    pullInward,
    invert: f.invert,
    color: f.gizmoColor,
  });
}

export function blendFields(
  a: EvaluatedField | null,
  b: EvaluatedField | null,
  mode: FieldBlendMode = 'add',
  mix = 0.5
): EvaluatedField | null {
  if (!a && !b) return null;
  if (a && !b) return a;
  if (!a && b) return b;
  const fa = a!, fb = b!;
  const m = clamp(mix, 0, 1);

  return {
    sample(p: Vec3, time: number) {
      const ra = fa.sample(p, time);
      const rb = fb.sample(p, time);
      if (mode === 'add') {
        return {
          weight: clamp(ra.weight + rb.weight, 0, 2),
          force: v3Add(ra.force, rb.force),
        };
      }
      if (mode === 'multiply') {
        return {
          weight: ra.weight * rb.weight,
          force: v3Add(v3Scale(ra.force, rb.weight), v3Scale(rb.force, ra.weight)),
        };
      }
      if (mode === 'max') {
        return ra.weight >= rb.weight ? ra : rb;
      }
      // lerp
      return {
        weight: lerp(ra.weight, rb.weight, m),
        force: [
          lerp(ra.force[0], rb.force[0], m),
          lerp(ra.force[1], rb.force[1], m),
          lerp(ra.force[2], rb.force[2], m),
        ],
      };
    },
    debugGizmos: [...fa.debugGizmos, ...fb.debugGizmos],
  };
}

export function combineFieldList(fields: EvaluatedField[], mode: FieldBlendMode = 'add'): EvaluatedField | null {
  if (fields.length === 0) return null;
  let acc = fields[0];
  for (let i = 1; i < fields.length; i++) {
    acc = blendFields(acc, fields[i], mode, 0.5)!;
  }
  return acc;
}
