import {
  Composition, EvaluatedField, Layer, Poly2D, TriMesh3D, Vec2, Vec3, ColorRGBA,
} from '../core/types';
import {
  clamp, compToWorld, defaultCameraMatrices, DEG2RAD, hashString, m4Identity, m4Invert,
  m4LookAt, m4Mul, m4Perspective, m4TransformDir, m4TransformPoint, Mat4, v3Dist, v3Norm, v3Sub,
} from '../core/math';
import { EvalContext } from '../core/expressions';
import { getLayerWorldMatrix, evaluateLayerLocalTransform } from '../core/project';
import { evaluateTextLayout } from '../geometry/fontEngine';
import { evaluateShapeLayer, flattenPathData } from '../geometry/pathOps';
import {
  applyDeformersToMesh, applyPuppetPins2D, buildExtrudedMesh3D, buildPrimitiveMesh3D, cloneMesh,
  emptyMesh, EvaluatedDeformerOp, transformMeshByMatrix,
} from '../geometry/mesh3d';
import { combineFieldList, evaluateFieldLayer } from '../geometry/fields';
import { evaluateNodeGraph, NodeEvalReport } from '../nodes/nodeEngine';

export interface EvaluatedCamera {
  layerId: string | null;
  eye: Vec3;
  target: Vec3;
  fovDeg: number;
  focalDistance: number;
  aperture: number;
  dofEnabled: boolean;
  nearClip: number;
  farClip: number;
  view: Mat4;
  proj: Mat4;
  vp: Mat4;
  invVP: Mat4;
}

export interface EvaluatedLight {
  layerId: string;
  lightType: 'directional' | 'point';
  position: Vec3;
  direction: Vec3; // pointing FROM surface TOWARD light (or light dir)
  target: Vec3;
  color: ColorRGBA;
  intensity: number;
  range: number;
  castShadow: boolean;
  shadowBias: number;
  shadowSoftness: number;
}

export interface EvaluatedMeshInstance {
  layer: Layer;
  localMesh: TriMesh3D;
  worldMesh: TriMesh3D;
  worldMatrix: Mat4;
  opacity: number;
  material: {
    baseColor: ColorRGBA;
    metallic: number;
    roughness: number;
    emissiveColor: ColorRGBA;
    emissiveIntensity: number;
    opacity: number;
    heatColor: ColorRGBA;
    heatIntensity: number;
  };
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface EvaluatedSceneSnapshot {
  time: number;
  ec: EvalContext;
  nodeReport: NodeEvalReport;
  camera: EvaluatedCamera;
  lights: EvaluatedLight[];
  fields: Map<string, EvaluatedField>;
  meshes: Map<string, EvaluatedMeshInstance>;
}

// ============================================================================
// Camera Evaluation (supports Parent, Keyframes, Expressions!)
// ============================================================================
export function evaluateActiveCamera(comp: Composition, time: number, ec: EvalContext): EvaluatedCamera {
  const camLayer = comp.layers.find(
    (l) => l.type === 'camera' && l.visible && l.camera && time >= l.inPoint && time <= l.outPoint
  );
  if (!camLayer || !camLayer.camera) {
    const def = defaultCameraMatrices(comp.width, comp.height, 40);
    return {
      layerId: null,
      eye: def.eye,
      target: def.target,
      fovDeg: 40,
      focalDistance: def.focalDist,
      aperture: 0,
      dofEnabled: false,
      nearClip: 10,
      farClip: def.focalDist * 12,
      view: def.view,
      proj: def.proj,
      vp: def.vp,
      invVP: m4Invert(def.vp) ?? m4Identity(),
    };
  }

  const c = camLayer.camera;
  const worldMat = getLayerWorldMatrix(comp, camLayer, time, ec);
  const eye = m4TransformPoint(worldMat, [0, 0, 0]);
  const targetLocal = ec.evaluateProp(camLayer, c.target, 'camera.target', time, true) as Vec3;
  // If camera has a parent, transform target by parent matrix so camera rig orbits cleanly!
  let target = targetLocal;
  if (camLayer.parentId) {
    const parent = comp.layers.find((l) => l.id === camLayer.parentId);
    if (parent) {
      const pMat = getLayerWorldMatrix(comp, parent, time, ec);
      target = m4TransformPoint(pMat, targetLocal);
    }
  }
  const fovDeg = clamp(ec.evaluateProp(camLayer, c.fov, 'camera.fov', time) as number, 10, 115);
  const focalDistance = Math.max(10, ec.evaluateProp(camLayer, c.focalDistance, 'camera.focalDistance', time) as number);
  const aperture = clamp(ec.evaluateProp(camLayer, c.aperture, 'camera.aperture', time) as number, 0, 100);

  const view = m4LookAt(eye, target, [0, 1, 0]);
  const proj = m4Perspective(fovDeg * DEG2RAD, comp.width / comp.height, c.nearClip || 10, c.farClip || 6000);
  const vp = m4Mul(proj, view);
  const invVP = m4Invert(vp) ?? m4Identity();

  return {
    layerId: camLayer.id,
    eye,
    target,
    fovDeg,
    focalDistance,
    aperture,
    dofEnabled: c.dofEnabled,
    nearClip: c.nearClip || 10,
    farClip: c.farClip || 6000,
    view,
    proj,
    vp,
    invVP,
  };
}

// ============================================================================
// Lights Evaluation (supports Parent, Keyframes, Expressions!)
// ============================================================================
export function evaluateLights(comp: Composition, time: number, ec: EvalContext): EvaluatedLight[] {
  const out: EvaluatedLight[] = [];
  for (const l of comp.layers) {
    if (l.type !== 'light' || !l.visible || !l.light || time < l.inPoint || time > l.outPoint) continue;
    const lc = l.light;
    const wm = getLayerWorldMatrix(comp, l, time, ec);
    const pos = m4TransformPoint(wm, [0, 0, 0]);
    let target = ec.evaluateProp(l, lc.target, 'light.target', time, true) as Vec3;
    if (l.parentId) {
      const p = comp.layers.find((x) => x.id === l.parentId);
      if (p) target = m4TransformPoint(getLayerWorldMatrix(comp, p, time, ec), target);
    }
    const dir = v3Norm(v3Sub(pos, target)); // vector from target toward light
    const color = ec.evaluateProp(l, lc.color, 'light.color', time) as ColorRGBA;
    const intensity = Math.max(0, ec.evaluateProp(l, lc.intensity, 'light.intensity', time) as number);
    const range = Math.max(10, ec.evaluateProp(l, lc.range, 'light.range', time) as number);
    out.push({
      layerId: l.id,
      lightType: lc.lightType,
      position: pos,
      direction: dir,
      target,
      color,
      intensity,
      range,
      castShadow: lc.castShadow,
      shadowBias: lc.shadowBias ?? 0.0025,
      shadowSoftness: lc.shadowSoftness ?? 2.0,
    });
  }
  // Ensure at least one default studio directional light if user added 3D objects without lights
  if (out.length === 0) {
    out.push({
      layerId: '__default_key__',
      lightType: 'directional',
      position: [350, 480, 420],
      direction: v3Norm([350, 480, 420]),
      target: [0, 0, 0],
      color: [1, 0.96, 0.92, 1],
      intensity: 2.2,
      range: 2000,
      castShadow: true,
      shadowBias: 0.0025,
      shadowSoftness: 2.0,
    });
  }
  return out;
}

// ============================================================================
// Single Source of Truth: Evaluate 3D Mesh Layer (Source -> Extrude -> Deform -> World)
// ============================================================================
export function evaluateMesh3DLayer(
  comp: Composition,
  layer: Layer,
  time: number,
  ec: EvalContext,
  nodeReport: NodeEvalReport,
  fieldsMap: Map<string, EvaluatedField>
): EvaluatedMeshInstance | null {
  if (!layer.mesh3d || !layer.visible || time < layer.inPoint || time > layer.outPoint) return null;
  const mc = layer.mesh3d;
  const worldMatrix = getLayerWorldMatrix(comp, layer, time, ec);
  const tr = evaluateLayerLocalTransform(comp, layer, time, ec);

  let baseMesh: TriMesh3D = emptyMesh();

  if (mc.sourceType === 'node' && mc.sourceNodeRef) {
    const val = nodeReport.portValues.get(`${mc.sourceNodeRef.nodeId}:${mc.sourceNodeRef.portId}`);
    if (val && val.positions instanceof Float32Array) {
      baseMesh = cloneMesh(val as TriMesh3D);
    } else if (val && val.contours) {
      const depth = ec.evaluateProp(layer, mc.extrudeDepth, 'extrudeDepth', time) as number;
      const bevel = ec.evaluateProp(layer, mc.bevelSize, 'bevelSize', time) as number;
      const polys = flattenPathData(val, mc.curveSubdivisions || 8);
      baseMesh = buildExtrudedMesh3D(polys, depth, bevel, mc.bevelSegments ?? 3, mc.interiorSubdiv ?? 24);
    }
  } else if (mc.sourceType === 'layer' && mc.sourceLayerId) {
    const src = comp.layers.find((l) => l.id === mc.sourceLayerId || l.name === mc.sourceLayerId);
    let polys: Poly2D[] = [];
    let srcPins = src?.text?.puppetPins ?? src?.shape?.puppetPins;
    if (src?.text) {
      const layout = evaluateTextLayout(comp, src, src.text, time, ec);
      polys = flattenPathData(layout.combinedPath, mc.curveSubdivisions || 8);
    } else if (src?.shape) {
      polys = evaluateShapeLayer(comp, src, src.shape, time, ec, mc.curveSubdivisions || 8).polys;
    }
    // Propagate 2D Puppet Pin deformation on source contours cleanly into 3D extrusion! (2.8)
    if (src && srcPins && srcPins.length > 0 && polys.length > 0) {
      const evalPins = srcPins.map((p) => ({
        rest: p.restPos,
        target: ec.evaluateProp(src, p.position, `pin.${p.id}.pos`, time) as Vec2,
        rotDeg: ec.evaluateProp(src, p.rotation, `pin.${p.id}.rot`, time) as number,
        scalePct: ec.evaluateProp(src, p.scale, `pin.${p.id}.scl`, time) as number,
        radius: p.radius,
      }));
      polys = polys.map((poly) => {
        // Subdivide long edges so puppet curve bends smoothly before 3D extrusion
        const dense: Vec2[] = [];
        const pts = poly.points;
        const n = poly.closed ? pts.length : pts.length - 1;
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const segL = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const sub = Math.max(1, Math.min(8, Math.ceil(segL / 18)));
          for (let s = 0; s < sub; s++) {
            const u = s / sub;
            dense.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
          }
        }
        if (!poly.closed && pts.length > 0) dense.push(pts[pts.length - 1]);
        return { ...poly, points: applyPuppetPins2D(dense, evalPins) };
      });
    }
    if (polys.length > 0) {
      const depth = ec.evaluateProp(layer, mc.extrudeDepth, 'extrudeDepth', time) as number;
      const bevel = ec.evaluateProp(layer, mc.bevelSize, 'bevelSize', time) as number;
      baseMesh = buildExtrudedMesh3D(polys, depth, bevel, mc.bevelSegments ?? 3, mc.interiorSubdiv ?? 24);
    }
  } else {
    const size = mc.primitiveSize
      ? (ec.evaluateProp(layer, mc.primitiveSize, 'mesh3d.primitiveSize', time) as Vec3)
      : ([180, 180, 180] as Vec3);
    baseMesh = buildPrimitiveMesh3D(mc.primitiveKind || 'box', size);
  }

  // Evaluate Deformers (Bend, Twist, Space Fields, Puppet Pins)
  const defOps: EvaluatedDeformerOp[] = [];
  for (const d of mc.deformers) {
    if (!d.enabled) continue;
    if (d.type === 'bend' || d.type === 'twist') {
      const amount = d.amount ? (ec.evaluateProp(layer, d.amount, `def.${d.id}.amount`, time) as number) : 0;
      const centerOffset = d.centerOffset ? (ec.evaluateProp(layer, d.centerOffset, `def.${d.id}.centerOffset`, time) as number) : 0;
      defOps.push({ type: d.type, amount, axis: d.axis || 'y', centerOffset });
    } else if (d.type === 'field') {
      const str = d.fieldStrength ? (ec.evaluateProp(layer, d.fieldStrength, `def.${d.id}.fieldStrength`, time) as number) : 1;
      const fList: EvaluatedField[] = [];
      if (d.fieldNodeRef) {
        const nf = nodeReport.portValues.get(`${d.fieldNodeRef.nodeId}:${d.fieldNodeRef.portId}`) as EvaluatedField | undefined;
        if (nf) fList.push(nf);
      }
      for (const fid of d.fieldLayerIds || []) {
        const fl = fieldsMap.get(fid);
        if (fl) fList.push(fl);
      }
      const combined = combineFieldList(fList, d.fieldBlend || 'add');
      if (combined) {
        defOps.push({ type: 'field', field: combined, fieldStrength: str, displaceMode: d.displaceMode || 'dent' });
      }
    } else if (d.type === 'puppet' && d.pins && d.pins.length > 0) {
      const evalPins = d.pins.map((p) => ({
        rest: p.restPos,
        target: ec.evaluateProp(layer, p.position, `def.${d.id}.pin.${p.id}.pos`, time) as Vec2,
        rotDeg: ec.evaluateProp(layer, p.rotation, `def.${d.id}.pin.${p.id}.rot`, time) as number,
        scalePct: ec.evaluateProp(layer, p.scale, `def.${d.id}.pin.${p.id}.scl`, time) as number,
        radius: p.radius,
      }));
      defOps.push({ type: 'puppet', pins: evalPins });
    }
  }

  const localMesh = applyDeformersToMesh(baseMesh, defOps, worldMatrix, time);

  // Also apply optional heatFieldLayerId to boost localized hot-zone vertex heat even if separate from deformer
  const matCfg = mc.material;
  const heatIntensity = matCfg.heatIntensity
    ? (ec.evaluateProp(layer, matCfg.heatIntensity, 'material.heatIntensity', time) as number)
    : 0;
  if (matCfg.heatFieldLayerId && heatIntensity > 0.01) {
    const hf = fieldsMap.get(matCfg.heatFieldLayerId);
    if (hf) {
      for (let i = 0; i < localMesh.positions.length; i += 3) {
        const wp = m4TransformPoint(worldMatrix, [localMesh.positions[i], localMesh.positions[i + 1], localMesh.positions[i + 2]]);
        const s = hf.sample(wp, time);
        if (s.weight > 0) {
          localMesh.heat[i / 3] = Math.max(localMesh.heat[i / 3], s.weight);
        }
      }
    }
  }

  const worldMesh = transformMeshByMatrix(localMesh, worldMatrix);

  const material = {
    baseColor: ec.evaluateProp(layer, matCfg.baseColor, 'material.baseColor', time) as ColorRGBA,
    metallic: clamp(ec.evaluateProp(layer, matCfg.metallic, 'material.metallic', time) as number, 0, 1),
    roughness: clamp(ec.evaluateProp(layer, matCfg.roughness, 'material.roughness', time) as number, 0.04, 1),
    emissiveColor: ec.evaluateProp(layer, matCfg.emissiveColor, 'material.emissiveColor', time) as ColorRGBA,
    emissiveIntensity: Math.max(0, ec.evaluateProp(layer, matCfg.emissiveIntensity, 'material.emissiveIntensity', time) as number),
    opacity: clamp(ec.evaluateProp(layer, matCfg.opacity, 'material.opacity', time) as number, 0, 1),
    heatColor: matCfg.heatColor
      ? (ec.evaluateProp(layer, matCfg.heatColor, 'material.heatColor', time) as ColorRGBA)
      : ([1.0, 0.45, 0.08, 1] as ColorRGBA),
    heatIntensity: Math.max(0, heatIntensity),
  };

  return {
    layer,
    localMesh,
    worldMesh,
    worldMatrix,
    opacity: clamp(tr.opacity / 100, 0, 1),
    material,
    castShadow: mc.castShadow,
    receiveShadow: mc.receiveShadow,
  };
}

// ============================================================================
// Evaluate Complete 3D Scene Snapshot at Time `t`
// ============================================================================
export function evaluateSceneSnapshot(comp: Composition, time: number, ecIn?: EvalContext): EvaluatedSceneSnapshot {
  const ec = ecIn ?? new EvalContext(comp);
  const nodeReport = evaluateNodeGraph(comp, comp.nodeGraph, time, ec);
  const camera = evaluateActiveCamera(comp, time, ec);
  const lights = evaluateLights(comp, time, ec);

  const fields = new Map<string, EvaluatedField>();
  for (const l of comp.layers) {
    if (l.type === 'field') {
      const f = evaluateFieldLayer(comp, l, time, ec);
      if (f) fields.set(l.id, f);
    }
  }

  const meshes = new Map<string, EvaluatedMeshInstance>();
  for (const l of comp.layers) {
    if (l.type === 'mesh3d') {
      const inst = evaluateMesh3DLayer(comp, l, time, ec, nodeReport, fields);
      if (inst) meshes.set(l.id, inst);
    }
  }

  return { time, ec, nodeReport, camera, lights, fields, meshes };
}

/** Deterministic structural hash for invalidating particle simulation caches on any edit */
export function computeCompSimSignature(comp: Composition, particleLayerId: string): string {
  // Hash all layers affecting simulation (particles, fields, meshes, source text/shape, nodeGraph)
  const relevant = comp.layers.map((l) => {
    if (l.id === particleLayerId || l.type === 'field' || l.type === 'mesh3d' || l.type === 'text' || l.type === 'shape' || l.type === 'null') {
      return {
        id: l.id, visible: l.visible, parentId: l.parentId, inPoint: l.inPoint, outPoint: l.outPoint,
        tr: l.transform, text: l.text, shape: l.shape, mesh3d: l.mesh3d, field: l.field,
        particle: l.id === particleLayerId ? l.particle : undefined,
      };
    }
    return l.id;
  });
  return `${hashString(JSON.stringify(relevant))}_${hashString(JSON.stringify(comp.nodeGraph))}`;
}
