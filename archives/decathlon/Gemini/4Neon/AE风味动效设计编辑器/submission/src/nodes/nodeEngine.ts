import {
  Composition, EvaluatedField, FieldBlendMode, FieldKind, GraphEdge, GraphNode,
  NodeGraph, NodePort, PathData, Poly2D, PortDataType, TriMesh3D, Vec3, ColorRGBA,
} from '../core/types';
import {
  clamp, deepClone, genId, m4ComposeLayer, m4Identity, mulberry32, v3Add, v3Cross, v3Norm, v3Scale, v3Sub,
} from '../core/math';
import { EvalContext } from '../core/expressions';
import { evaluateTextLayout } from '../geometry/fontEngine';
import {
  applyRepeaterToPolys, booleanOpPolys, buildEllipseContours, buildRoundedRectContours,
  buildStarContours, evaluateShapeLayer, flattenPathData, polysToPathData, transformPolys2D,
  trimPolysByArcLength,
} from '../geometry/pathOps';
import {
  applyDeformersToMesh, buildExtrudedMesh3D, buildPrimitiveMesh3D, emptyMesh,
  mergeMeshes, transformMeshByMatrix,
} from '../geometry/mesh3d';
import { blendFields, evaluateFieldLayer, makePrimitiveField } from '../geometry/fields';
import { makeRingPath } from '../core/project';

export interface NodeEvalReport {
  /** Map: `${nodeId}:${portId}` -> evaluated runtime value */
  portValues: Map<string, any>;
  /** Human-readable inspection summary per node */
  nodeSummaries: Map<string, string>;
  /** Error messages if cycle or invalid config */
  errors: Map<string, string>;
}

export function summarizePortValue(type: PortDataType, val: any): string {
  if (val === undefined || val === null) return '空';
  if (type === 'scalar') return `${Number(val).toFixed(2)}`;
  if (type === 'vec3' && Array.isArray(val)) return `(${val[0].toFixed(1)}, ${val[1].toFixed(1)}, ${(val[2] ?? 0).toFixed(1)})`;
  if (type === 'color' && Array.isArray(val)) return `RGBA(${Math.round(val[0] * 255)}, ${Math.round(val[1] * 255)}, ${Math.round(val[2] * 255)})`;
  if (type === 'path') {
    const pd = val as PathData;
    const n = pd?.contours?.length ?? 0;
    const holes = pd?.contours?.filter((c) => c.isHole).length ?? 0;
    return holes > 0 ? `路径: ${n} 轮廓 (${holes} 孔洞)` : `路径: ${n} 轮廓`;
  }
  if (type === 'mesh') {
    const m = val as TriMesh3D;
    const vc = (m?.positions?.length ?? 0) / 3;
    const tc = (m?.indices?.length ?? 0) / 3;
    return `网格: ${vc} 顶点 / ${tc} 三角面`;
  }
  if (type === 'field') {
    const f = val as EvaluatedField;
    const kinds = f?.debugGizmos?.map((g) => (g.kind === 'vortex' ? '旋涡' : g.kind === 'noise' ? '噪声' : '衰减')).join('+') || '空场';
    return `空间场: ${kinds}`;
  }
  return String(val);
}

export function evaluateNodeGraph(
  comp: Composition,
  graph: NodeGraph,
  time: number,
  ec: EvalContext,
  externalInputs?: Map<string, any>
): NodeEvalReport {
  const portValues = new Map<string, any>();
  const nodeSummaries = new Map<string, string>();
  const errors = new Map<string, string>();

  const nodeMap = new Map<string, GraphNode>();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  // Incoming edge lookup: `${toNodeId}:${toPortId}` -> GraphEdge
  const inEdgeMap = new Map<string, GraphEdge>();
  for (const e of graph.edges) {
    inEdgeMap.set(`${e.toNodeId}:${e.toPortId}`, e);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const readInput = (node: GraphNode, portId: string, fallback: any): any => {
    const edge = inEdgeMap.get(`${node.id}:${portId}`);
    if (!edge) {
      if (externalInputs && externalInputs.has(`${node.id}:${portId}`)) {
        return externalInputs.get(`${node.id}:${portId}`);
      }
      return fallback;
    }
    evalNode(edge.fromNodeId);
    const val = portValues.get(`${edge.fromNodeId}:${edge.fromPortId}`);
    return val !== undefined ? val : fallback;
  };

  const evalNode = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;
    if (visiting.has(nodeId)) {
      errors.set(nodeId, '节点图存在循环连线');
      return;
    }
    visiting.add(nodeId);

    try {
      const p = node.params || {};
      const getParam = (key: string, fallback: any) => {
        const ap = node.animParams?.[key];
        if (ap) return ec.evaluateProp(comp.layers[0] ?? ({ id: node.id, name: node.title, transform: {} } as any), ap, `node.${node.id}.${key}`, time);
        return p[key] !== undefined ? p[key] : fallback;
      };
      const setOut = (portId: string, val: any) => {
        portValues.set(`${node.id}:${portId}`, val);
      };

      switch (node.kind) {
        case 'valueScalar': {
          const v = Number(p.value ?? 0);
          setOut('out', v);
          nodeSummaries.set(node.id, `标量: ${v.toFixed(2)}`);
          break;
        }
        case 'valueVec3': {
          const v: Vec3 = Array.isArray(p.value) ? [Number(p.value[0]) || 0, Number(p.value[1]) || 0, Number(p.value[2]) || 0] : [0, 0, 0];
          setOut('out', v);
          nodeSummaries.set(node.id, summarizePortValue('vec3', v));
          break;
        }
        case 'valueColor': {
          const c: ColorRGBA = Array.isArray(p.value) ? [p.value[0], p.value[1], p.value[2], p.value[3] ?? 1] : [1, 0.5, 0.1, 1];
          setOut('out', c);
          nodeSummaries.set(node.id, summarizePortValue('color', c));
          break;
        }
        case 'mathOp': {
          const a = Number(readInput(node, 'a', p.a ?? 1));
          const b = Number(readInput(node, 'b', p.b ?? 1));
          let res = a + b;
          if (p.op === 'sub') res = a - b;
          else if (p.op === 'mul') res = a * b;
          else if (p.op === 'div') res = Math.abs(b) > 1e-6 ? a / b : 0;
          else if (p.op === 'sin') res = Math.sin(a * b);
          else if (p.op === 'max') res = Math.max(a, b);
          else if (p.op === 'min') res = Math.min(a, b);
          setOut('out', res);
          nodeSummaries.set(node.id, `${p.op || 'add'} = ${res.toFixed(2)}`);
          break;
        }
        case 'sourceShape': {
          const layer = comp.layers.find((l) => l.id === p.layerId || l.name === p.layerId);
          let pd: PathData = { contours: [] };
          if (layer?.shape) {
            pd = evaluateShapeLayer(comp, layer, layer.shape, time, ec).pathData;
          }
          setOut('path', pd);
          nodeSummaries.set(node.id, summarizePortValue('path', pd));
          break;
        }
        case 'sourceText': {
          const layer = comp.layers.find((l) => l.id === p.layerId || l.name === p.layerId);
          let pd: PathData = { contours: [] };
          let strokesPd: PathData = { contours: [] };
          if (layer?.text) {
            const fullCfg = { ...layer.text, writeOnEnabled: false };
            pd = evaluateTextLayout(comp, layer, fullCfg, time, ec).combinedPath;
            strokesPd = evaluateTextLayout(comp, layer, layer.text, time, ec).combinedPath;
          }
          setOut('path', pd);
          setOut('strokes', strokesPd);
          nodeSummaries.set(node.id, `${layer?.text?.text || '未绑定'} · ${summarizePortValue('path', pd)}`);
          break;
        }
        case 'strokeWriteOn': {
          const layer = comp.layers.find((l) => l.id === p.layerId || l.name === p.layerId);
          const prog = clamp(Number(readInput(node, 'progress', p.progress ?? 100)), 0, 100);
          let outPd: PathData;
          if (layer?.text) {
            const override = {
              ...layer.text,
              writeOnEnabled: true,
              writeOnProgress: { ...layer.text.writeOnProgress, animated: false, expressionEnabled: false, value: prog },
            };
            outPd = evaluateTextLayout(comp, layer, override, time, ec).combinedPath;
          } else {
            const inPd = readInput(node, 'path', { contours: [] }) as PathData;
            const polys = trimPolysByArcLength(flattenPathData(inPd, 8), 0, prog, 0);
            outPd = polysToPathData(polys);
          }
          setOut('path', outPd);
          nodeSummaries.set(node.id, `书写 ${prog.toFixed(0)}% · ${summarizePortValue('path', outPd)}`);
          break;
        }
        case 'primitivePath': {
          const sz = Number(readInput(node, 'size', p.width ?? 180));
          const h = p.height ? (p.height / (p.width || 180)) * sz : sz;
          let pd: PathData;
          if (p.shape === 'ring') {
            pd = makeRingPath(sz * 0.5, sz * 0.5 * clamp(Number(p.innerRatio ?? 0.55), 0.1, 0.9));
          } else if (p.shape === 'ellipse') {
            pd = { contours: buildEllipseContours(0, 0, sz, h) };
          } else if (p.shape === 'star') {
            pd = { contours: buildStarContours(0, 0, sz * 0.5, sz * 0.24, Number(p.sides ?? 6)) };
          } else {
            pd = { contours: buildRoundedRectContours(0, 0, sz, h, Number(p.roundness ?? 0)) };
          }
          setOut('path', pd);
          nodeSummaries.set(node.id, summarizePortValue('path', pd));
          break;
        }
        case 'primitiveMesh': {
          const m = buildPrimitiveMesh3D(p.kind || 'box', [
            Number(p.width ?? 180), Number(p.height ?? 80), Number(p.depth ?? 180),
          ]);
          setOut('mesh', m);
          nodeSummaries.set(node.id, summarizePortValue('mesh', m));
          break;
        }
        case 'pathTransform': {
          const inPd = readInput(node, 'path', { contours: [] }) as PathData;
          const off = readInput(node, 'offset', [Number(p.offsetX ?? 0), Number(p.offsetY ?? 0), 0]) as Vec3;
          const sc = Number(readInput(node, 'scale', p.scale ?? 1));
          const rot = Number(readInput(node, 'rotation', p.rotation ?? 0));
          const polys = transformPolys2D(flattenPathData(inPd, 8), off[0] || 0, off[1] || 0, sc, sc, rot);
          const outPd = polysToPathData(polys);
          setOut('path', outPd);
          nodeSummaries.set(node.id, summarizePortValue('path', outPd));
          break;
        }
        case 'trimPath': {
          const inPd = readInput(node, 'path', { contours: [] }) as PathData;
          const s = Number(readInput(node, 'start', p.start ?? 0));
          const e = Number(readInput(node, 'end', p.end ?? 100));
          const polys = trimPolysByArcLength(flattenPathData(inPd, 10), s, e, Number(p.offset ?? 0));
          const outPd = polysToPathData(polys);
          setOut('path', outPd);
          nodeSummaries.set(node.id, `修剪 ${s.toFixed(0)}-${e.toFixed(0)}%`);
          break;
        }
        case 'repeater': {
          const inPd = readInput(node, 'path', { contours: [] }) as PathData;
          const copies = Number(readInput(node, 'copies', p.copies ?? 4));
          const polys = applyRepeaterToPolys(
            flattenPathData(inPd, 8), copies, 0,
            Number(p.dx ?? 45), Number(p.dy ?? 0),
            Number(p.scaleStep ?? 1) * 100, Number(p.scaleStep ?? 1) * 100,
            Number(p.rotation ?? 15)
          );
          const outPd = polysToPathData(polys);
          setOut('path', outPd);
          nodeSummaries.set(node.id, `阵列 ×${Math.round(copies)} · ${outPd.contours.length} 轮廓`);
          break;
        }
        case 'booleanOp': {
          const a = readInput(node, 'a', { contours: [] }) as PathData;
          const b = readInput(node, 'b', { contours: [] }) as PathData;
          const polys = booleanOpPolys(flattenPathData(a, 10), flattenPathData(b, 10), p.op || 'difference');
          const outPd = polysToPathData(polys);
          setOut('path', outPd);
          nodeSummaries.set(node.id, `${p.op || 'diff'} · ${summarizePortValue('path', outPd)}`);
          break;
        }
        case 'extrude3d': {
          const inPd = readInput(node, 'path', { contours: [] }) as PathData;
          const depth = Number(readInput(node, 'depth', getParam('depth', 68)));
          const bevel = Number(readInput(node, 'bevel', getParam('bevel', 6)));
          const polys = flattenPathData(inPd, 8);
          const mesh = buildExtrudedMesh3D(polys, depth, bevel, Number(p.bevelSegments ?? 3), Number(p.interiorSubdiv ?? 24));
          setOut('mesh', mesh);
          nodeSummaries.set(node.id, summarizePortValue('mesh', mesh));
          break;
        }
        case 'fieldGenerator': {
          let field: EvaluatedField | null = null;
          if (p.layerId) {
            const fl = comp.layers.find((l) => l.id === p.layerId || l.name === p.layerId);
            if (fl) field = evaluateFieldLayer(comp, fl, time, ec);
          }
          if (!field) {
            const center = readInput(node, 'center', p.center ?? [0, 0, 0]) as Vec3;
            const strength = Number(readInput(node, 'strength', p.strength ?? 45));
            const radius = Number(readInput(node, 'radius', p.radius ?? 180));
            field = makePrimitiveField({
              kind: (p.fieldKind as FieldKind) || 'distance',
              center,
              radius,
              falloff: Number(p.falloff ?? 1.5),
              strength,
              direction: (p.direction as Vec3) || [0, 0, -1],
              noiseScale: Number(p.noiseScale ?? 0.015),
              noiseSpeed: Number(p.noiseSpeed ?? 1.2),
              swirlAngle: Number(p.swirlAngle ?? 1.2),
              pullInward: Number(p.pullInward ?? 0.25),
            });
          }
          setOut('field', field);
          nodeSummaries.set(node.id, summarizePortValue('field', field));
          break;
        }
        case 'fieldBlend': {
          const fa = readInput(node, 'a', null) as EvaluatedField | null;
          const fb = readInput(node, 'b', null) as EvaluatedField | null;
          const mix = Number(readInput(node, 'mix', p.mix ?? 0.5));
          const res = blendFields(fa, fb, (p.mode as FieldBlendMode) || 'add', mix);
          setOut('field', res);
          nodeSummaries.set(node.id, summarizePortValue('field', res));
          break;
        }
        case 'deformMesh': {
          const inMesh = readInput(node, 'mesh', emptyMesh()) as TriMesh3D;
          const field = readInput(node, 'field', null) as EvaluatedField | null;
          const amount = Number(readInput(node, 'amount', p.amount ?? 1));
          const mode = p.mode || 'field';
          let outMesh = inMesh;
          if (mode === 'bend' || mode === 'twist') {
            outMesh = applyDeformersToMesh(inMesh, [{ type: mode, amount, axis: p.axis || 'y', centerOffset: 0 }], m4Identity(), time);
          } else if (field) {
            outMesh = applyDeformersToMesh(inMesh, [{ type: 'field', field, fieldStrength: amount, displaceMode: p.displaceMode || 'dent' }], m4Identity(), time);
          }
          setOut('mesh', outMesh);
          nodeSummaries.set(node.id, summarizePortValue('mesh', outMesh));
          break;
        }
        case 'meshTransform': {
          const inMesh = readInput(node, 'mesh', emptyMesh()) as TriMesh3D;
          const off = readInput(node, 'offset', p.offset ?? [0, 0, 0]) as Vec3;
          const rot: Vec3 = p.rotation ?? [0, 0, 0];
          const scl: Vec3 = p.scale ? [p.scale[0] * 100, p.scale[1] * 100, p.scale[2] * 100] : [100, 100, 100];
          const mat = m4ComposeLayer(off, [0, 0, 0], scl, rot);
          const outMesh = transformMeshByMatrix(inMesh, mat);
          setOut('mesh', outMesh);
          nodeSummaries.set(node.id, summarizePortValue('mesh', outMesh));
          break;
        }
        case 'mergeMesh': {
          const a = readInput(node, 'a', emptyMesh()) as TriMesh3D;
          const b = readInput(node, 'b', emptyMesh()) as TriMesh3D;
          const outMesh = mergeMeshes([a, b]);
          setOut('mesh', outMesh);
          nodeSummaries.set(node.id, summarizePortValue('mesh', outMesh));
          break;
        }
        case 'scatterPoints': {
          const src = readInput(node, 'mesh', emptyMesh()) as TriMesh3D;
          const customInst = readInput(node, 'instance', null) as TriMesh3D | null;
          const count = clamp(Math.round(Number(readInput(node, 'count', p.count ?? 20))), 1, 200);
          const sz = Number(p.size ?? 8);
          const rng = mulberry32(Number(p.seed ?? 77));
          const pieces: TriMesh3D[] = [];
          const triCount = src.indices.length / 3;
          if (triCount > 0) {
            const proto = (customInst && customInst.indices.length > 0)
              ? customInst
              : buildPrimitiveMesh3D('box', [sz, sz, sz]);
            const instScale = (customInst && customInst.indices.length > 0) ? (sz / 100) * 100 : 100;
            for (let i = 0; i < count; i++) {
              const ti = Math.floor(rng() * triCount);
              const i0 = src.indices[ti * 3] * 3;
              const i1 = src.indices[ti * 3 + 1] * 3;
              const i2 = src.indices[ti * 3 + 2] * 3;
              let u = rng(), v = rng();
              if (u + v > 1) { u = 1 - u; v = 1 - v; }
              const w = 1 - u - v;
              const px = src.positions[i0] * w + src.positions[i1] * u + src.positions[i2] * v;
              const py = src.positions[i0 + 1] * w + src.positions[i1 + 1] * u + src.positions[i2 + 1] * v;
              const pz = src.positions[i0 + 2] * w + src.positions[i1 + 2] * u + src.positions[i2 + 2] * v;
              const mat = m4ComposeLayer([px, py, pz], [0, 0, 0], [instScale, instScale, instScale], [rng() * 360, rng() * 360, rng() * 360]);
              pieces.push(transformMeshByMatrix(proto, mat));
            }
          }
          const outMesh = mergeMeshes(pieces);
          setOut('mesh', outMesh);
          nodeSummaries.set(node.id, `散布 ${pieces.length} 实例`);
          break;
        }
        case 'group': {
          if (node.subGraph) {
            const extIn = new Map<string, any>();
            for (const inp of node.inputs) {
              const val = readInput(node, inp.id, inp.defaultValue);
              // Map group input port id (`targetNodeId__targetPortId`) into subGraph
              const mapping = node.params?.inputMap?.[inp.id];
              if (mapping) {
                extIn.set(`${mapping.nodeId}:${mapping.portId}`, val);
              }
            }
            const subRep = evaluateNodeGraph(comp, node.subGraph, time, ec, extIn);
            for (const outp of node.outputs) {
              const mapping = node.params?.outputMap?.[outp.id];
              if (mapping) {
                setOut(outp.id, subRep.portValues.get(`${mapping.nodeId}:${mapping.portId}`));
              }
            }
            nodeSummaries.set(node.id, `节点组 (${node.subGraph.nodes.length} 节点)`);
          }
          break;
        }
        case 'output': {
          const m = readInput(node, 'mesh', null);
          const f = readInput(node, 'field', null);
          setOut('mesh', m);
          setOut('field', f);
          const parts: string[] = [];
          if (m) parts.push(summarizePortValue('mesh', m));
          if (f) parts.push(summarizePortValue('field', f));
          nodeSummaries.set(node.id, parts.join(' | ') || '未连接');
          break;
        }
      }
    } catch (e: any) {
      errors.set(node.id, e?.message || String(e));
    } finally {
      visiting.delete(nodeId);
      visited.add(nodeId);
    }
  };

  for (const n of graph.nodes) evalNode(n.id);
  return { portValues, nodeSummaries, errors };
}

/**
 * Encapsulate selected nodes into a reusable Node Group (2.7)!
 */
export function encapsulateNodesIntoGroup(graph: NodeGraph, selectedNodeIds: string[], title = '封装节点组'): GraphNode | null {
  const sel = new Set(selectedNodeIds);
  const subNodes = graph.nodes.filter((n) => sel.has(n.id));
  if (subNodes.length === 0) return null;

  let avgX = 0, avgY = 0;
  for (const n of subNodes) { avgX += n.x; avgY += n.y; }
  avgX /= subNodes.length; avgY /= subNodes.length;

  const internalEdges: GraphEdge[] = [];
  const incomingEdges: GraphEdge[] = [];
  const outgoingEdges: GraphEdge[] = [];
  const keepEdges: GraphEdge[] = [];

  for (const e of graph.edges) {
    const fIn = sel.has(e.fromNodeId);
    const tIn = sel.has(e.toNodeId);
    if (fIn && tIn) internalEdges.push(deepClone(e));
    else if (!fIn && tIn) incomingEdges.push(e);
    else if (fIn && !tIn) outgoingEdges.push(e);
    else keepEdges.push(e);
  }

  const groupId = genId('grp');
  const inputs: NodePort[] = [];
  const outputs: NodePort[] = [];
  const inputMap: Record<string, { nodeId: string; portId: string }> = {};
  const outputMap: Record<string, { nodeId: string; portId: string }> = {};
  const newEdges: GraphEdge[] = [...keepEdges];

  incomingEdges.forEach((e, idx) => {
    const targetNode = subNodes.find((n) => n.id === e.toNodeId);
    const targetPort = targetNode?.inputs.find((p) => p.id === e.toPortId);
    const pid = `in_${idx}`;
    inputs.push({ id: pid, name: targetPort?.name || `输入 ${idx + 1}`, dataType: targetPort?.dataType || 'mesh', direction: 'in' });
    inputMap[pid] = { nodeId: e.toNodeId, portId: e.toPortId };
    newEdges.push({ id: genId('edg'), fromNodeId: e.fromNodeId, fromPortId: e.fromPortId, toNodeId: groupId, toPortId: pid });
  });

  outgoingEdges.forEach((e, idx) => {
    const srcNode = subNodes.find((n) => n.id === e.fromNodeId);
    const srcPort = srcNode?.outputs.find((p) => p.id === e.fromPortId);
    const pid = `out_${idx}`;
    outputs.push({ id: pid, name: srcPort?.name || `输出 ${idx + 1}`, dataType: srcPort?.dataType || 'mesh', direction: 'out' });
    outputMap[pid] = { nodeId: e.fromNodeId, portId: e.fromPortId };
    newEdges.push({ id: genId('edg'), fromNodeId: groupId, fromPortId: pid, toNodeId: e.toNodeId, toPortId: e.toPortId });
  });

  // Expose at least one output port from last subnode if none wired out yet
  if (outputs.length === 0) {
    const last = subNodes[subNodes.length - 1];
    if (last.outputs[0]) {
      outputs.push({ ...last.outputs[0], id: 'out_0' });
      outputMap['out_0'] = { nodeId: last.id, portId: last.outputs[0].id };
    }
  }

  const groupNode: GraphNode = {
    id: groupId,
    kind: 'group',
    title,
    x: avgX,
    y: avgY,
    params: { inputMap, outputMap },
    inputs,
    outputs,
    subGraph: { nodes: deepClone(subNodes), edges: internalEdges },
  };

  graph.nodes = graph.nodes.filter((n) => !sel.has(n.id));
  graph.nodes.push(groupNode);
  graph.edges = newEdges;
  return groupNode;
}
