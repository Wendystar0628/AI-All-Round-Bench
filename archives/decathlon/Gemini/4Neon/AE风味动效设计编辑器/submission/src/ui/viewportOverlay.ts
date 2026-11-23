import { BezierVertex, Keyframe, Layer, PuppetPin, Vec2, Vec3 } from '../core/types';
import {
  clamp, DEG2RAD, genId, m4Identity, m4Invert, m4TransformPoint, projectWorldToComp,
  rayPlaneIntersect, unprojectCompRay, v3Add, v3Dist, v3Norm, v3Scale, v3Sub,
} from '../core/math';
import { sampleSpatialMotionPath, setPropValueAtTime } from '../core/animation';
import {
  createDeformer, createPuppetPin, createShapeItem, evaluateLayerLocalTransform,
  getLayerWorldMatrix, moveAnchorPreserveVisual,
} from '../core/project';
import { evaluateShapeLayer } from '../geometry/pathOps';
import { classifyHolesByContainment, evaluateTextLayout } from '../geometry/fontEngine';
import { EvaluatedSceneSnapshot } from '../simulation/sceneEval';
import { computeParentAwareDragDelta, pickLayerAtCompPos } from '../render/picking';
import { EditorStore } from './store';

interface DragHandleHit {
  kind: 'axisX' | 'axisY' | 'axisZ' | 'anchor' | 'rotate' | 'scale' | 'spatialIn' | 'spatialOut' | 'spatialKf' | 'bezierVert' | 'bezierIn' | 'bezierOut' | 'puppetPin' | 'body';
  layerId: string;
  kfIdx?: number;
  itemId?: string;
  contourIdx?: number;
  vertexIdx?: number;
  pinId?: string;
  deformerId?: string;
}

export class ViewportOverlayController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private store: EditorStore;
  private activeDrag: {
    hit: DragHandleHit;
    startComp: Vec2;
    lastComp: Vec2;
    startVal?: any;
    startAngle?: number;
    startDist?: number;
    layerCenterScreen?: Vec2;
  } | null = null;
  private drawCreateState: {
    kind: 'rect' | 'ellipse';
    layerId: string;
    itemId: string;
    startComp: Vec2;
  } | null = null;
  private orbitState: {
    lastX: number;
    lastY: number;
    mode: 'orbit' | 'pan';
  } | null = null;

  constructor(canvas: HTMLCanvasElement, store: EditorStore) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.store = store;
    this.bindEvents();
  }

  private clientToComp(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const comp = this.store.getActiveComp();
    const nx = (clientX - rect.left) / Math.max(1, rect.width);
    const ny = (clientY - rect.top) / Math.max(1, rect.height);
    return [nx * comp.width, ny * comp.height];
  }

  private compToCanvas(cx: number, cy: number): Vec2 {
    const comp = this.store.getActiveComp();
    return [(cx / comp.width) * this.canvas.width, (cy / comp.height) * this.canvas.height];
  }

  private projectPointToCanvas(p: Vec3, is3D: boolean, snap: EvaluatedSceneSnapshot): { x: number; y: number; visible: boolean } {
    const comp = this.store.getActiveComp();
    if (!is3D) {
      const [sx, sy] = this.compToCanvas(p[0], p[1]);
      return { x: sx, y: sy, visible: true };
    }
    const pr = projectWorldToComp(snap.camera.vp, p, comp.width, comp.height);
    const [sx, sy] = this.compToCanvas(pr.x, pr.y);
    return { x: sx, y: sy, visible: pr.w > 1 };
  }

  // ==========================================================================
  // Render Interactive Gizmos, Paths, Pins, Fields, Lights & Camera Frustums
  // ==========================================================================
  public render(snap: EvaluatedSceneSnapshot): void {
    const comp = this.store.getActiveComp();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Empty composition clean visual state (2.1)
    if (comp.layers.length === 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = `${Math.round(14 * dpr)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('空白合成 · 使用顶部工具栏或左侧面板添加形状、文字、三维实体或粒子', w * 0.5, h * 0.5);
      ctx.restore();
      return;
    }

    // During playback or export mode, keep the hero artwork pristine & uncluttered!
    if (this.store.isExportMode || this.store.isPlaying || !this.store.showOverlays) {
      return;
    }

    const t = this.store.currentTime;
    const scaleX = w / comp.width;

    // 1) Optional 3D perspective floor grid
    if (this.store.showGrid) {
      this.draw3DGrid(ctx, snap, dpr);
    }

    // 2) Helper objects (Lights, Fields, Nulls) visible across scene
    for (const l of comp.layers) {
      if (!l.visible || t < l.inPoint || t > l.outPoint) continue;
      const isSel = this.store.selectedLayerIds.has(l.id);
      if (l.type === 'light' && l.light) {
        this.drawLightHelper(ctx, l, snap, isSel, dpr);
      } else if (l.type === 'field' && l.field && (l.field.showGizmo || isSel)) {
        this.drawFieldHelper(ctx, l, snap, isSel, dpr);
      } else if (l.type === 'null') {
        this.drawNullHelper(ctx, l, snap, isSel, dpr);
      } else if (l.type === 'camera' && isSel && l.id !== snap.camera.layerId) {
        this.drawCameraHelper(ctx, l, snap, dpr);
      }
    }

    // 3) Selected Layer(s): Bounding Box, 3D Axes, Anchor, Motion Path, Bezier Nodes, Puppet Pins
    const selected = this.store.getSelectedLayers();
    if (selected.length > 1) {
      this.drawMultiSelectionBadge(ctx, selected.length, w, dpr);
    }

    for (const l of selected) {
      if (!l.visible || t < l.inPoint || t > l.outPoint) continue;
      this.drawMotionPath(ctx, l, snap, dpr);
      this.drawLayerTransformGizmo(ctx, l, snap, scaleX, dpr);
      if (this.store.activeTool === 'pen' && l.type === 'shape' && l.shape) {
        this.drawShapeBezierHandles(ctx, l, snap, dpr);
      }
      if (this.store.activeTool === 'puppet' || this.hasPuppetPins(l)) {
        this.drawPuppetPins(ctx, l, snap, dpr);
      }
    }
  }

  private hasPuppetPins(l: Layer): boolean {
    if (l.shape?.puppetPins && l.shape.puppetPins.length > 0) return true;
    if (l.text?.puppetPins && l.text.puppetPins.length > 0) return true;
    if (l.mesh3d?.deformers.some((d) => d.type === 'puppet' && d.pins && d.pins.length > 0)) return true;
    return false;
  }

  private draw3DGrid(ctx: CanvasRenderingContext2D, snap: EvaluatedSceneSnapshot, dpr: number): void {
    ctx.save();
    ctx.lineWidth = 1 * dpr;
    const yFloor = -142;
    const span = 500, step = 50;
    for (let v = -span; v <= span; v += step) {
      const major = v === 0;
      ctx.strokeStyle = major ? 'rgba(56,189,248,0.28)' : 'rgba(255,255,255,0.08)';
      const a1 = this.projectPointToCanvas([v, yFloor, -span], true, snap);
      const a2 = this.projectPointToCanvas([v, yFloor, span], true, snap);
      if (a1.visible && a2.visible) {
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
      }
      const b1 = this.projectPointToCanvas([-span, yFloor, v], true, snap);
      const b2 = this.projectPointToCanvas([span, yFloor, v], true, snap);
      if (b1.visible && b2.visible) {
        ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawLightHelper(ctx: CanvasRenderingContext2D, l: Layer, snap: EvaluatedSceneSnapshot, isSel: boolean, dpr: number): void {
    const comp = this.store.getActiveComp();
    const wm = getLayerWorldMatrix(comp, l, this.store.currentTime, snap.ec);
    const pos = m4TransformPoint(wm, [0, 0, 0]);
    const p = this.projectPointToCanvas(pos, true, snap);
    if (!p.visible) return;

    ctx.save();
    const col = isSel ? '#fde047' : 'rgba(244,211,94,0.72)';
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = (isSel ? 2 : 1.3) * dpr;

    // Sunburst icon
    const r = 7 * dpr;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * (r + 2 * dpr), p.y + Math.sin(a) * (r + 2 * dpr));
      ctx.lineTo(p.x + Math.cos(a) * (r + 7 * dpr), p.y + Math.sin(a) * (r + 7 * dpr));
      ctx.stroke();
    }
    if (l.light?.lightType === 'directional') {
      const tgt = snap.ec.evaluateProp(l, l.light.target, 'light.target', this.store.currentTime) as Vec3;
      const pt = this.projectPointToCanvas(tgt, true, snap);
      if (pt.visible) {
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.font = `${Math.round(10 * dpr)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(l.name, p.x + 12 * dpr, p.y - 8 * dpr);
    ctx.restore();
  }

  private drawFieldHelper(ctx: CanvasRenderingContext2D, l: Layer, snap: EvaluatedSceneSnapshot, isSel: boolean, dpr: number): void {
    const f = snap.fields.get(l.id);
    if (!f) return;
    const g = f.debugGizmos[0];
    if (!g) return;

    ctx.save();
    const strokeCol = isSel
      ? 'rgba(56,220,255,0.95)'
      : `rgba(${Math.round(g.color[0] * 255)},${Math.round(g.color[1] * 255)},${Math.round(g.color[2] * 255)},0.48)`;
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = (isSel ? 1.8 : 1.1) * dpr;

    // Draw 3 orthogonal 3D wireframe circles representing true world-space field influence radius!
    const segs = 32;
    const drawCircle = (ax1: Vec3, ax2: Vec3) => {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const wp: Vec3 = [
          g.center[0] + (ax1[0] * Math.cos(a) + ax2[0] * Math.sin(a)) * g.radius,
          g.center[1] + (ax1[1] * Math.cos(a) + ax2[1] * Math.sin(a)) * g.radius,
          g.center[2] + (ax1[2] * Math.cos(a) + ax2[2] * Math.sin(a)) * g.radius,
        ];
        const sp = this.projectPointToCanvas(wp, true, snap);
        if (!sp.visible) continue;
        if (!started) { ctx.moveTo(sp.x, sp.y); started = true; } else ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
    };
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    drawCircle([1, 0, 0], [0, 1, 0]);
    drawCircle([1, 0, 0], [0, 0, 1]);
    drawCircle([0, 1, 0], [0, 0, 1]);
    ctx.setLineDash([]);

    const cPt = this.projectPointToCanvas(g.center, true, snap);
    if (cPt.visible) {
      ctx.fillStyle = strokeCol;
      ctx.beginPath(); ctx.arc(cPt.x, cPt.y, 4 * dpr, 0, Math.PI * 2); ctx.fill();

      // Type-specific recognizable indicator (arrow for Distance, swirl for Vortex, wave ticks for Noise)
      if (g.kind === 'distance') {
        const tipW = v3Add(g.center, v3Scale(g.direction, Math.min(g.radius * 0.75, 95)));
        const tipP = this.projectPointToCanvas(tipW, true, snap);
        if (tipP.visible) {
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath(); ctx.moveTo(cPt.x, cPt.y); ctx.lineTo(tipP.x, tipP.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(tipP.x, tipP.y, 3 * dpr, 0, Math.PI * 2); ctx.fill();
        }
      } else if (g.kind === 'vortex') {
        ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        ctx.arc(cPt.x, cPt.y, 18 * dpr, 0, Math.PI * 1.45);
        ctx.stroke();
      } else {
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        for (let k = -2; k <= 2; k++) {
          const ox = cPt.x + k * 6 * dpr;
          const oy = cPt.y + Math.sin(k * 1.4) * 6 * dpr;
          if (k === -2) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
        }
        ctx.stroke();
      }

      ctx.font = `${Math.round(10 * dpr)}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(`${l.name} (${g.kind === 'vortex' ? '旋涡' : g.kind === 'noise' ? '噪声' : '衰减'})`, cPt.x + 8 * dpr, cPt.y - 6 * dpr);
    }
    ctx.restore();
  }

  private drawNullHelper(ctx: CanvasRenderingContext2D, l: Layer, snap: EvaluatedSceneSnapshot, isSel: boolean, dpr: number): void {
    const comp = this.store.getActiveComp();
    const wm = getLayerWorldMatrix(comp, l, this.store.currentTime, snap.ec);
    const wp = m4TransformPoint(wm, [0, 0, 0]);
    const p = this.projectPointToCanvas(wp, l.is3D, snap);
    if (!p.visible) return;
    ctx.save();
    ctx.strokeStyle = isSel ? '#c084fc' : 'rgba(155,114,207,0.65)';
    ctx.lineWidth = 1.5 * dpr;
    const s = 9 * dpr;
    ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
    ctx.beginPath();
    ctx.moveTo(p.x - s * 1.4, p.y); ctx.lineTo(p.x + s * 1.4, p.y);
    ctx.moveTo(p.x, p.y - s * 1.4); ctx.lineTo(p.x, p.y + s * 1.4);
    ctx.stroke();
    ctx.restore();
  }

  private drawCameraHelper(ctx: CanvasRenderingContext2D, l: Layer, snap: EvaluatedSceneSnapshot, dpr: number): void {
    const comp = this.store.getActiveComp();
    const wm = getLayerWorldMatrix(comp, l, this.store.currentTime, snap.ec);
    const eye = m4TransformPoint(wm, [0, 0, 0]);
    const tgt = snap.ec.evaluateProp(l, l.camera!.target, 'camera.target', this.store.currentTime) as Vec3;
    const pe = this.projectPointToCanvas(eye, true, snap);
    const pt = this.projectPointToCanvas(tgt, true, snap);
    if (!pe.visible) return;
    ctx.save();
    ctx.strokeStyle = '#52b788';
    ctx.lineWidth = 1.6 * dpr;
    // Draw recognizable 3D camera frustum pyramid pointing toward target!
    const fwd = v3Norm(v3Sub(tgt, eye));
    const right = v3Norm([fwd[2], 0, -fwd[0]]);
    const up: Vec3 = [0, 1, 0];
    const dist = 58, fw = 34, fh = 20;
    const baseC = v3Add(eye, v3Scale(fwd, dist));
    const fc: Vec3[] = [
      v3Add(v3Add(baseC, v3Scale(right, -fw)), v3Scale(up, fh)),
      v3Add(v3Add(baseC, v3Scale(right, fw)), v3Scale(up, fh)),
      v3Add(v3Add(baseC, v3Scale(right, fw)), v3Scale(up, -fh)),
      v3Add(v3Add(baseC, v3Scale(right, -fw)), v3Scale(up, -fh)),
    ];
    const fsp = fc.map((c) => this.projectPointToCanvas(c, true, snap));
    if (fsp.every((p) => p.visible)) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(pe.x, pe.y); ctx.lineTo(fsp[i].x, fsp[i].y);
      }
      ctx.moveTo(fsp[0].x, fsp[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(fsp[i].x, fsp[i].y);
      ctx.closePath();
      ctx.stroke();
    }
    if (pt.visible) {
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(pe.x, pe.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#52b788';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawMotionPath(ctx: CanvasRenderingContext2D, l: Layer, snap: EvaluatedSceneSnapshot, dpr: number): void {
    const posProp = l.transform.position;
    if (!posProp.animated || posProp.keyframes.length < 2) return;
    const comp = this.store.getActiveComp();
    let parentMat = m4Identity();
    if (l.parentId) {
      const parent = comp.layers.find((p) => p.id === l.parentId);
      if (parent) parentMat = getLayerWorldMatrix(comp, parent, this.store.currentTime, snap.ec);
    }

    const pts = sampleSpatialMotionPath(posProp, 24);
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.78)';
    ctx.lineWidth = 1.6 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.beginPath();
    let started = false;
    for (const lp of pts) {
      const wp = m4TransformPoint(parentMat, lp);
      const sp = this.projectPointToCanvas(wp, l.is3D, snap);
      if (!sp.visible) continue;
      if (!started) { ctx.moveTo(sp.x, sp.y); started = true; } else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Keyframe waypoints & Spatial Bezier Handles!
    for (const kf of posProp.keyframes) {
      const kp = m4TransformPoint(parentMat, kf.value as Vec3);
      const sp = this.projectPointToCanvas(kp, l.is3D, snap);
      if (!sp.visible) continue;
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.2 * dpr;
      const r = 4.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - r); ctx.lineTo(sp.x + r, sp.y);
      ctx.lineTo(sp.x, sp.y + r); ctx.lineTo(sp.x - r, sp.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();

      const drawTan = (tan: Vec3 | undefined) => {
        if (!tan || Math.hypot(tan[0], tan[1], tan[2]) < 0.5) return;
        const hp = m4TransformPoint(parentMat, v3Add(kf.value as Vec3, tan));
        const sh = this.projectPointToCanvas(hp, l.is3D, snap);
        if (!sh.visible) return;
        ctx.strokeStyle = 'rgba(56,189,248,0.85)';
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sh.x, sh.y); ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath(); ctx.arc(sh.x, sh.y, 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
      };
      drawTan(kf.inSpatialTangent);
      drawTan(kf.outSpatialTangent);
    }
    ctx.restore();
  }

  private drawLayerTransformGizmo(
    ctx: CanvasRenderingContext2D,
    l: Layer,
    snap: EvaluatedSceneSnapshot,
    _scaleX: number,
    dpr: number
  ): void {
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;
    const wm = getLayerWorldMatrix(comp, l, t, snap.ec);
    const tr = evaluateLayerLocalTransform(comp, l, t, snap.ec);

    // Compute world-space anchor/origin point (where gizmo sits!)
    const originWorld = m4TransformPoint(wm, tr.anchor);
    const centerSP = this.projectPointToCanvas(originWorld, l.is3D, snap);
    if (!centerSP.visible) return;

    ctx.save();
    if (!l.is3D) {
      // 2D Selection Box in final parented screen space + Scale & Rotate handles!
      let b = { minX: -80, minY: -80, maxX: 80, maxY: 80 };
      if (l.type === 'shape' && l.shape) {
        b = evaluateShapeLayer(comp, l, l.shape, t, snap.ec, 6).bounds;
      } else if (l.type === 'text' && l.text) {
        b = evaluateTextLayout(comp, l, l.text, t, snap.ec).bounds;
      } else if (l.type === 'precomp') {
        b = { minX: -comp.width * 0.5, minY: -comp.height * 0.5, maxX: comp.width * 0.5, maxY: comp.height * 0.5 };
      }
      const cornersLocal: Vec3[] = [
        [b.minX, b.minY, 0], [b.maxX, b.minY, 0], [b.maxX, b.maxY, 0], [b.minX, b.maxY, 0],
      ];
      const cornersSP = cornersLocal.map((c) => this.projectPointToCanvas(m4TransformPoint(wm, c), false, snap));
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.moveTo(cornersSP[0].x, cornersSP[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(cornersSP[i].x, cornersSP[i].y);
      ctx.closePath();
      ctx.stroke();

      // Corner scale squares
      ctx.fillStyle = '#0f172a';
      for (const c of cornersSP) {
        ctx.fillRect(c.x - 4 * dpr, c.y - 4 * dpr, 8 * dpr, 8 * dpr);
        ctx.strokeRect(c.x - 4 * dpr, c.y - 4 * dpr, 8 * dpr, 8 * dpr);
      }
      // Top-center rotation handle
      const topMidX = (cornersSP[0].x + cornersSP[1].x) * 0.5;
      const topMidY = (cornersSP[0].y + cornersSP[1].y) * 0.5;
      const dx = cornersSP[1].x - cornersSP[0].x, dy = cornersSP[1].y - cornersSP[0].y;
      const dl = Math.hypot(dx, dy) || 1;
      const nx = dy / dl, ny = -dx / dl;
      const rotX = topMidX + nx * 24 * dpr, rotY = topMidY + ny * 24 * dpr;
      ctx.beginPath(); ctx.moveTo(topMidX, topMidY); ctx.lineTo(rotX, rotY); ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(rotX, rotY, 4.5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      // 3D RGB Axis Gizmo projected using exact scene camera VP! (2.12)
      const axisLen = 78;
      const axes: Array<{ dir: Vec3; color: string; label: string }> = [
        { dir: [axisLen, 0, 0], color: '#ef4444', label: 'X' },
        { dir: [0, axisLen, 0], color: '#22c55e', label: 'Y' },
        { dir: [0, 0, axisLen], color: '#3b82f6', label: 'Z' },
      ];
      for (const ax of axes) {
        const endWorld = v3Add(originWorld, ax.dir);
        const endSP = this.projectPointToCanvas(endWorld, true, snap);
        if (!endSP.visible) continue;
        ctx.strokeStyle = ax.color;
        ctx.fillStyle = ax.color;
        ctx.lineWidth = 2.2 * dpr;
        ctx.beginPath(); ctx.moveTo(centerSP.x, centerSP.y); ctx.lineTo(endSP.x, endSP.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(endSP.x, endSP.y, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;
        ctx.fillText(ax.label, endSP.x + 6 * dpr, endSP.y + 3 * dpr);
      }
    }

    // Anchor Point Crosshair (highlighted when Anchor tool `Y` is active!)
    const isAnchorTool = this.store.activeTool === 'anchor';
    ctx.strokeStyle = isAnchorTool ? '#f59e0b' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = (isAnchorTool ? 2.2 : 1.4) * dpr;
    const ar = (isAnchorTool ? 9 : 6) * dpr;
    ctx.beginPath(); ctx.arc(centerSP.x, centerSP.y, ar, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerSP.x - ar * 1.5, centerSP.y); ctx.lineTo(centerSP.x + ar * 1.5, centerSP.y);
    ctx.moveTo(centerSP.x, centerSP.y - ar * 1.5); ctx.lineTo(centerSP.x, centerSP.y + ar * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  private drawShapeBezierHandles(ctx: CanvasRenderingContext2D, l: Layer, snap: EvaluatedSceneSnapshot, dpr: number): void {
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;
    const wm = getLayerWorldMatrix(comp, l, t, snap.ec);

    ctx.save();
    for (const item of l.shape!.items) {
      if (item.kind !== 'path' || !item.visible) continue;
      const pos = snap.ec.evaluateProp(l, item.position, `shape.${item.id}.position`, t) as Vec2;
      const pd = snap.ec.evaluateProp(l, item.path, `shape.${item.id}.path`, t);
      for (const c of pd.contours) {
        // Draw contour outline
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        c.vertices.forEach((v, idx) => {
          const wp = m4TransformPoint(wm, [v.x + pos[0], v.y + pos[1], 0]);
          const sp = this.projectPointToCanvas(wp, l.is3D, snap);
          if (idx === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
        });
        if (c.closed) ctx.closePath();
        ctx.stroke();

        // Draw vertices & tangent handles
        for (const v of c.vertices) {
          const vp = this.projectPointToCanvas(m4TransformPoint(wm, [v.x + pos[0], v.y + pos[1], 0]), l.is3D, snap);
          const drawH = (hx: number, hy: number) => {
            if (Math.hypot(hx, hy) < 0.5) return;
            const hp = this.projectPointToCanvas(m4TransformPoint(wm, [v.x + pos[0] + hx, v.y + pos[1] + hy, 0]), l.is3D, snap);
            ctx.strokeStyle = 'rgba(245,158,11,0.85)';
            ctx.beginPath(); ctx.moveTo(vp.x, vp.y); ctx.lineTo(hp.x, hp.y); ctx.stroke();
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath(); ctx.arc(hp.x, hp.y, 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
          };
          drawH(v.inX, v.inY);
          drawH(v.outX, v.outY);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#0ea5e9';
          ctx.lineWidth = 1.4 * dpr;
          ctx.fillRect(vp.x - 4 * dpr, vp.y - 4 * dpr, 8 * dpr, 8 * dpr);
          ctx.strokeRect(vp.x - 4 * dpr, vp.y - 4 * dpr, 8 * dpr, 8 * dpr);
        }
      }
    }
    ctx.restore();
  }

  private drawPuppetPins(ctx: CanvasRenderingContext2D, l: Layer, snap: EvaluatedSceneSnapshot, dpr: number): void {
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;
    const wm = getLayerWorldMatrix(comp, l, t, snap.ec);

    const pins: Array<{ pin: PuppetPin; pathPrefix: string }> = [];
    if (l.shape?.puppetPins) l.shape.puppetPins.forEach((p) => pins.push({ pin: p, pathPrefix: `pin.${p.id}` }));
    if (l.text?.puppetPins) l.text.puppetPins.forEach((p) => pins.push({ pin: p, pathPrefix: `pin.${p.id}` }));
    if (l.mesh3d) {
      for (const d of l.mesh3d.deformers) {
        if (d.type === 'puppet' && d.pins) {
          d.pins.forEach((p) => pins.push({ pin: p, pathPrefix: `def.${d.id}.pin.${p.id}` }));
        }
      }
    }

    ctx.save();
    for (const { pin, pathPrefix } of pins) {
      const target = snap.ec.evaluateProp(l, pin.position, `${pathPrefix}.pos`, t) as Vec2;
      const localP: Vec3 = l.is3D ? [target[0], -target[1], 10] : [target[0], target[1], 0];
      const sp = this.projectPointToCanvas(m4TransformPoint(wm, localP), l.is3D, snap);
      if (!sp.visible) continue;
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 6 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 2 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawMultiSelectionBadge(ctx: CanvasRenderingContext2D, count: number, w: number, dpr: number): void {
    ctx.save();
    const txt = `已多选 ${count} 个图层 · Ctrl+Shift+C 原位预合成`;
    ctx.font = `${Math.round(11 * dpr)}px "Microsoft YaHei", sans-serif`;
    const tw = ctx.measureText(txt).width + 18 * dpr;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.roundRect(w * 0.5 - tw * 0.5, 10 * dpr, tw, 24 * dpr, 6 * dpr);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText(txt, w * 0.5, 26 * dpr);
    ctx.restore();
  }

  // ==========================================================================
  // Pointer Interaction: Direct Translate / Rotate / Scale / Anchor / Pen / Pin / Orbit
  // ==========================================================================
  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => this.onPointerUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  private hitTestOverlayHandles(compPt: Vec2, snap: EvaluatedSceneSnapshot): DragHandleHit | null {
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;
    const hitR = 14;
    const [canX, canY] = this.compToCanvas(compPt[0], compPt[1]);
    const dpr = window.devicePixelRatio || 1;
    const radPx = hitR * dpr;

    for (const l of this.store.getSelectedLayers()) {
      if (l.locked) continue;
      const wm = getLayerWorldMatrix(comp, l, t, snap.ec);
      const tr = evaluateLayerLocalTransform(comp, l, t, snap.ec);
      const originWorld = m4TransformPoint(wm, tr.anchor);
      const centerSP = this.projectPointToCanvas(originWorld, l.is3D, snap);

      // 1) Puppet pins
      const checkPins = (pins: PuppetPin[], deformerId?: string) => {
        for (const p of pins) {
          const tgt = snap.ec.evaluateProp(l, p.position, `pin.${p.id}.pos`, t) as Vec2;
          const lp: Vec3 = l.is3D ? [tgt[0], -tgt[1], 10] : [tgt[0], tgt[1], 0];
          const sp = this.projectPointToCanvas(m4TransformPoint(wm, lp), l.is3D, snap);
          if (Math.hypot(sp.x - canX, sp.y - canY) < radPx) {
            return { kind: 'puppetPin' as const, layerId: l.id, pinId: p.id, deformerId };
          }
        }
        return null;
      };
      if (l.shape?.puppetPins) { const h = checkPins(l.shape.puppetPins); if (h) return h; }
      if (l.text?.puppetPins) { const h = checkPins(l.text.puppetPins); if (h) return h; }
      if (l.mesh3d) {
        for (const d of l.mesh3d.deformers) {
          if (d.type === 'puppet' && d.pins) { const h = checkPins(d.pins, d.id); if (h) return h; }
        }
      }

      // 2) Bezier Pen vertices & tangents
      if (this.store.activeTool === 'pen' && l.type === 'shape' && l.shape) {
        for (const item of l.shape.items) {
          if (item.kind !== 'path' || !item.visible) continue;
          const pos = snap.ec.evaluateProp(l, item.position, `shape.${item.id}.position`, t) as Vec2;
          const pd = snap.ec.evaluateProp(l, item.path, `shape.${item.id}.path`, t);
          for (let ci = 0; ci < pd.contours.length; ci++) {
            const c = pd.contours[ci];
            for (let vi = 0; vi < c.vertices.length; vi++) {
              const v = c.vertices[vi];
              const hIn = this.projectPointToCanvas(m4TransformPoint(wm, [v.x + pos[0] + v.inX, v.y + pos[1] + v.inY, 0]), l.is3D, snap);
              if (Math.hypot(v.inX, v.inY) > 0.5 && Math.hypot(hIn.x - canX, hIn.y - canY) < radPx) {
                return { kind: 'bezierIn', layerId: l.id, itemId: item.id, contourIdx: ci, vertexIdx: vi };
              }
              const hOut = this.projectPointToCanvas(m4TransformPoint(wm, [v.x + pos[0] + v.outX, v.y + pos[1] + v.outY, 0]), l.is3D, snap);
              if (Math.hypot(v.outX, v.outY) > 0.5 && Math.hypot(hOut.x - canX, hOut.y - canY) < radPx) {
                return { kind: 'bezierOut', layerId: l.id, itemId: item.id, contourIdx: ci, vertexIdx: vi };
              }
              const vp = this.projectPointToCanvas(m4TransformPoint(wm, [v.x + pos[0], v.y + pos[1], 0]), l.is3D, snap);
              if (Math.hypot(vp.x - canX, vp.y - canY) < radPx) {
                return { kind: 'bezierVert', layerId: l.id, itemId: item.id, contourIdx: ci, vertexIdx: vi };
              }
            }
          }
        }
      }

      // 3) Spatial Motion Path handles & waypoints
      if (l.transform.position.animated && l.transform.position.keyframes.length >= 2) {
        let pMat = m4Identity();
        if (l.parentId) {
          const parent = comp.layers.find((p) => p.id === l.parentId);
          if (parent) pMat = getLayerWorldMatrix(comp, parent, t, snap.ec);
        }
        const kfs = l.transform.position.keyframes;
        for (let ki = 0; ki < kfs.length; ki++) {
          const kf = kfs[ki];
          if (kf.outSpatialTangent && Math.hypot(...kf.outSpatialTangent) > 0.5) {
            const hp = this.projectPointToCanvas(m4TransformPoint(pMat, v3Add(kf.value as Vec3, kf.outSpatialTangent)), l.is3D, snap);
            if (Math.hypot(hp.x - canX, hp.y - canY) < radPx) return { kind: 'spatialOut', layerId: l.id, kfIdx: ki };
          }
          if (kf.inSpatialTangent && Math.hypot(...kf.inSpatialTangent) > 0.5) {
            const hp = this.projectPointToCanvas(m4TransformPoint(pMat, v3Add(kf.value as Vec3, kf.inSpatialTangent)), l.is3D, snap);
            if (Math.hypot(hp.x - canX, hp.y - canY) < radPx) return { kind: 'spatialIn', layerId: l.id, kfIdx: ki };
          }
          const kp = this.projectPointToCanvas(m4TransformPoint(pMat, kf.value as Vec3), l.is3D, snap);
          if (Math.hypot(kp.x - canX, kp.y - canY) < radPx * 0.85) return { kind: 'spatialKf', layerId: l.id, kfIdx: ki };
        }
      }

      // 4) Anchor tool handle
      if (this.store.activeTool === 'anchor' && Math.hypot(centerSP.x - canX, centerSP.y - canY) < radPx * 1.4) {
        return { kind: 'anchor', layerId: l.id };
      }

      // 5) 3D Axis arrows
      if (l.is3D && this.store.activeTool === 'select') {
        const axisLen = 78;
        const checks: Array<{ kind: 'axisX' | 'axisY' | 'axisZ'; dir: Vec3 }> = [
          { kind: 'axisX', dir: [axisLen, 0, 0] },
          { kind: 'axisY', dir: [0, axisLen, 0] },
          { kind: 'axisZ', dir: [0, 0, axisLen] },
        ];
        for (const ch of checks) {
          const ep = this.projectPointToCanvas(v3Add(originWorld, ch.dir), true, snap);
          if (Math.hypot(ep.x - canX, ep.y - canY) < radPx) {
            return { kind: ch.kind, layerId: l.id };
          }
        }
      }

      // 6) 2D Rotate & Corner Scale handles
      if (!l.is3D && this.store.activeTool === 'select') {
        let b = { minX: -80, minY: -80, maxX: 80, maxY: 80 };
        if (l.type === 'shape' && l.shape) b = evaluateShapeLayer(comp, l, l.shape, t, snap.ec, 6).bounds;
        else if (l.type === 'text' && l.text) b = evaluateTextLayout(comp, l, l.text, t, snap.ec).bounds;
        const cornersSP = [
          [b.minX, b.minY, 0], [b.maxX, b.minY, 0], [b.maxX, b.maxY, 0], [b.minX, b.maxY, 0],
        ].map((c) => this.projectPointToCanvas(m4TransformPoint(wm, c as Vec3), false, snap));
        const topMidX = (cornersSP[0].x + cornersSP[1].x) * 0.5;
        const topMidY = (cornersSP[0].y + cornersSP[1].y) * 0.5;
        const dx = cornersSP[1].x - cornersSP[0].x, dy = cornersSP[1].y - cornersSP[0].y;
        const dl = Math.hypot(dx, dy) || 1;
        const rotX = topMidX + (dy / dl) * 24 * dpr, rotY = topMidY + (-dx / dl) * 24 * dpr;
        if (Math.hypot(rotX - canX, rotY - canY) < radPx) return { kind: 'rotate', layerId: l.id };
        for (const c of cornersSP) {
          if (Math.hypot(c.x - canX, c.y - canY) < radPx) return { kind: 'scale', layerId: l.id };
        }
      }
    }
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    const snap = this.store.lastSceneSnap;
    if (!snap || this.store.isExportMode) return;
    const comp = this.store.getActiveComp();
    const compPt = this.clientToComp(e.clientX, e.clientY);

    // Camera orbit / pan with Middle button, Alt+Drag, or Camera Orbit tool
    if (e.button === 1 || this.store.activeTool === 'cameraOrbit' || (e.altKey && e.button === 0)) {
      this.store.beginEdit();
      this.orbitState = { lastX: e.clientX, lastY: e.clientY, mode: e.shiftKey ? 'pan' : 'orbit' };
      return;
    }
    if (e.button !== 0) return;

    const tool = this.store.activeTool;

    // Shape Creation Tools (Rect / Ellipse)
    if (tool === 'rect' || tool === 'ellipse') {
      this.store.beginEdit();
      let layer = this.store.getPrimarySelectedLayer();
      if (!e.shiftKey || !layer || layer.type !== 'shape' || !layer.shape) {
        layer = this.store.addLayer('shape');
        layer.transform.position.value = [compPt[0], compPt[1], 0];
        layer.shape!.items = [];
      }
      const item = createShapeItem(tool);
      const wm = getLayerWorldMatrix(comp, layer, this.store.currentTime, snap.ec);
      const inv = m4Invert(wm) ?? m4Identity();
      const lp = m4TransformPoint(inv, [compPt[0], compPt[1], 0]);
      item.position.value = [lp[0], lp[1]];
      item.size.value = [10, 10];
      layer.shape!.items.push(item);
      this.drawCreateState = { kind: tool, layerId: layer.id, itemId: item.id, startComp: compPt };
      this.store.notify('full');
      return;
    }

    // Text Tool: Click to drop new Chinese text layer
    if (tool === 'text') {
      const layer = this.store.addLayer('text', { text: '玄锻' });
      layer.transform.position.value = [compPt[0], compPt[1], 0];
      layer.text!.fontSize.value = 130;
      this.store.activeTool = 'select';
      this.store.notify('full');
      return;
    }

    // Check interactive handles first (Axes, Pins, Bezier Nodes, Spatial Handles, Scale/Rotate, Anchor)
    const handleHit = this.hitTestOverlayHandles(compPt, snap);
    if (handleHit) {
      this.startHandleDrag(handleHit, compPt, snap);
      return;
    }

    // Pen Tool: Add vertex to selected Shape path or create a new Bezier path layer!
    if (tool === 'pen') {
      this.handlePenClick(compPt, snap);
      return;
    }

    // Puppet Pin Tool: Drop a new Puppet Pin on selected layer!
    if (tool === 'puppet') {
      this.handlePuppetDrop(compPt, snap);
      return;
    }

    // Rotate / Scale tool anywhere on canvas for selected layer
    const primary = this.store.getPrimarySelectedLayer();
    if (primary && !primary.locked && (tool === 'rotate' || tool === 'scale' || tool === 'anchor')) {
      this.startHandleDrag({ kind: tool, layerId: primary.id }, compPt, snap);
      return;
    }

    // Otherwise: Pick nearest visible 3D deformed surface or 2D shape/text!
    const pick = pickLayerAtCompPos(comp, snap, compPt[0], compPt[1], this.store.currentTime);
    if (pick) {
      if (!this.store.selectedLayerIds.has(pick.layerId) || e.shiftKey) {
        this.store.selectLayer(pick.layerId, e.shiftKey);
      }
      const l = comp.layers.find((x) => x.id === pick.layerId);
      if (l && !l.locked && !e.shiftKey) {
        this.startHandleDrag({ kind: 'body', layerId: l.id }, compPt, snap);
      }
    } else if (!e.shiftKey) {
      this.store.selectLayer(null, false);
    }
  }

  private startHandleDrag(hit: DragHandleHit, compPt: Vec2, snap: EvaluatedSceneSnapshot): void {
    const comp = this.store.getActiveComp();
    const l = comp.layers.find((x) => x.id === hit.layerId);
    if (!l) return;
    this.store.beginEdit();

    const tr = evaluateLayerLocalTransform(comp, l, this.store.currentTime, snap.ec);
    const wm = getLayerWorldMatrix(comp, l, this.store.currentTime, snap.ec);
    const centerWorld = m4TransformPoint(wm, tr.anchor);
    const pr = l.is3D
      ? projectWorldToComp(snap.camera.vp, centerWorld, comp.width, comp.height)
      : { x: centerWorld[0], y: centerWorld[1] };

    this.activeDrag = {
      hit,
      startComp: compPt,
      lastComp: compPt,
      startVal: {
        position: [...tr.position],
        anchor: [...tr.anchor],
        scale: [...tr.scale],
        rotation: [...tr.rotation],
      },
      layerCenterScreen: [pr.x, pr.y],
      startAngle: Math.atan2(compPt[1] - pr.y, compPt[0] - pr.x),
      startDist: Math.max(10, Math.hypot(compPt[0] - pr.x, compPt[1] - pr.y)),
    };
  }

  private handlePenClick(compPt: Vec2, snap: EvaluatedSceneSnapshot): void {
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;
    this.store.beginEdit();
    let layer = this.store.getPrimarySelectedLayer();
    if (!layer || layer.type !== 'shape' || !layer.shape) {
      layer = this.store.addLayer('shape');
      layer.transform.position.value = [comp.width * 0.5, comp.height * 0.5, 0];
      const item = createShapeItem('path', '自由路径 1');
      item.path.value = { contours: [{ id: genId('cnt'), closed: false, vertices: [] }] };
      layer.shape!.items = [item];
    }
    let pathItem = layer.shape!.items.find((it) => it.kind === 'path');
    if (!pathItem) {
      pathItem = createShapeItem('path', '自由路径');
      pathItem.path.value = { contours: [{ id: genId('cnt'), closed: false, vertices: [] }] };
      layer.shape!.items.push(pathItem);
    }
    const wm = getLayerWorldMatrix(comp, layer, t, snap.ec);
    const inv = m4Invert(wm) ?? m4Identity();
    const lp = m4TransformPoint(inv, [compPt[0], compPt[1], 0]);
    const itemPos = snap.ec.evaluateProp(layer, pathItem.position, `shape.${pathItem.id}.position`, t) as Vec2;
    const vx = lp[0] - itemPos[0], vy = lp[1] - itemPos[1];

    const pd = JSON.parse(JSON.stringify(snap.ec.evaluateProp(layer, pathItem.path, `shape.${pathItem.id}.path`, t)));
    // If previous contour is already closed, automatically begin a new contour (e.g. an interior hole!)
    if (pd.contours.length === 0 || pd.contours[pd.contours.length - 1].closed) {
      pd.contours.push({ id: genId('cnt'), closed: false, vertices: [] });
    }
    const contour = pd.contours[pd.contours.length - 1];

    // If clicking near first vertex of an open path with >=3 verts -> close contour & classify holes!
    if (!contour.closed && contour.vertices.length >= 3) {
      const f = contour.vertices[0];
      if (Math.hypot(f.x - vx, f.y - vy) < 16) {
        contour.closed = true;
        classifyHolesByContainment(pd.contours);
        setPropValueAtTime(pathItem.path, t, pd);
        this.store.commitEdit();
        this.store.showToast(contour.isHole ? '已闭合孔洞轮廓' : '已闭合贝塞尔路径');
        return;
      }
    }
    const newVert: BezierVertex = { x: vx, y: vy, inX: -24, inY: 0, outX: 24, outY: 0 };
    contour.vertices.push(newVert);
    setPropValueAtTime(pathItem.path, t, pd);
    this.store.commitEdit();
  }

  private handlePuppetDrop(compPt: Vec2, snap: EvaluatedSceneSnapshot): void {
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;
    const layer = this.store.getPrimarySelectedLayer();
    if (!layer || (layer.type !== 'shape' && layer.type !== 'text' && layer.type !== 'mesh3d')) {
      this.store.showToast('请先选择一个形状、文字或三维几何图层来放置图钉');
      return;
    }
    const wm = getLayerWorldMatrix(comp, layer, t, snap.ec);
    const inv = m4Invert(wm) ?? m4Identity();
    let lx = 0, ly = 0;
    if (layer.is3D) {
      const ray = unprojectCompRay(snap.camera.invVP, compPt[0], compPt[1], comp.width, comp.height);
      const centerW = m4TransformPoint(wm, [0, 0, 0]);
      const hitW = rayPlaneIntersect(ray.origin, ray.dir, centerW, v3Norm(v3Sub(snap.camera.eye, centerW)));
      if (!hitW) return;
      const lp = m4TransformPoint(inv, hitW);
      lx = lp[0]; ly = -lp[1];
    } else {
      const lp = m4TransformPoint(inv, [compPt[0], compPt[1], 0]);
      lx = lp[0]; ly = lp[1];
    }

    this.store.beginEdit();
    if (layer.shape) {
      if (!layer.shape.puppetPins) layer.shape.puppetPins = [];
      layer.shape.puppetPins.push(createPuppetPin(lx, ly, layer.shape.puppetPins.length + 1));
    } else if (layer.text) {
      if (!layer.text.puppetPins) layer.text.puppetPins = [];
      layer.text.puppetPins.push(createPuppetPin(lx, ly, layer.text.puppetPins.length + 1));
    } else if (layer.mesh3d) {
      let def = layer.mesh3d.deformers.find((d) => d.type === 'puppet');
      if (!def) {
        def = createDeformer('puppet');
        layer.mesh3d.deformers.push(def);
      }
      if (!def.pins) def.pins = [];
      def.pins.push(createPuppetPin(lx, ly, def.pins.length + 1));
    }
    this.store.commitEdit();
    this.store.showToast('已添加图钉（直接拖动图钉可实时变形）');
  }

  private onPointerMove(e: PointerEvent): void {
    const snap = this.store.lastSceneSnap;
    if (!snap) return;
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;

    // 1) Camera Orbit / Pan
    if (this.orbitState) {
      const dx = e.clientX - this.orbitState.lastX;
      const dy = e.clientY - this.orbitState.lastY;
      this.orbitState.lastX = e.clientX;
      this.orbitState.lastY = e.clientY;
      const camLayer = comp.layers.find((l) => l.type === 'camera' && l.visible && l.camera);
      if (camLayer && camLayer.camera) {
        const eye = snap.ec.evaluateProp(camLayer, camLayer.transform.position, 'position', t, true) as Vec3;
        const tgt = snap.ec.evaluateProp(camLayer, camLayer.camera.target, 'camera.target', t, true) as Vec3;
        const rel = v3Sub(eye, tgt);
        if (this.orbitState.mode === 'orbit') {
          const r = Math.max(40, Math.hypot(rel[0], rel[1], rel[2]));
          let theta = Math.atan2(rel[0], rel[2]) - dx * 0.008;
          let phi = clamp(Math.acos(clamp(rel[1] / r, -0.99, 0.99)) - dy * 0.008, 0.12, Math.PI - 0.12);
          const newEye: Vec3 = [
            tgt[0] + r * Math.sin(phi) * Math.sin(theta),
            tgt[1] + r * Math.cos(phi),
            tgt[2] + r * Math.sin(phi) * Math.cos(theta),
          ];
          setPropValueAtTime(camLayer.transform.position, t, newEye);
        } else {
          const newEye: Vec3 = [eye[0] - dx * 0.8, eye[1] + dy * 0.8, eye[2]];
          const newTgt: Vec3 = [tgt[0] - dx * 0.8, tgt[1] + dy * 0.8, tgt[2]];
          setPropValueAtTime(camLayer.transform.position, t, newEye);
          setPropValueAtTime(camLayer.camera.target, t, newTgt);
        }
        this.store.notify('full');
      }
      return;
    }

    const compPt = this.clientToComp(e.clientX, e.clientY);

    // 2) Shape Drag-Create
    if (this.drawCreateState) {
      const l = comp.layers.find((x) => x.id === this.drawCreateState!.layerId);
      const item = l?.shape?.items.find((it) => it.id === this.drawCreateState!.itemId);
      if (l && item) {
        const w = Math.max(8, Math.abs(compPt[0] - this.drawCreateState.startComp[0]) * 2);
        const h = Math.max(8, Math.abs(compPt[1] - this.drawCreateState.startComp[1]) * 2);
        item.size.value = e.shiftKey ? [Math.max(w, h), Math.max(w, h)] : [w, h];
        this.store.notify('full');
      }
      return;
    }

    // 3) Active Gizmo / Handle Drag
    if (!this.activeDrag) return;
    const { hit, lastComp, startVal, layerCenterScreen, startAngle, startDist } = this.activeDrag;
    const l = comp.layers.find((x) => x.id === hit.layerId);
    if (!l) return;

    if (hit.kind === 'body' || hit.kind === 'axisX' || hit.kind === 'axisY' || hit.kind === 'axisZ') {
      const axisLock = hit.kind === 'axisX' ? 'x' : hit.kind === 'axisY' ? 'y' : hit.kind === 'axisZ' ? 'z' : 'free';
      const delta = computeParentAwareDragDelta(comp, l, snap, t, lastComp[0], lastComp[1], compPt[0], compPt[1], axisLock);
      const curPos = snap.ec.evaluateProp(l, l.transform.position, 'position', t, true) as Vec3;
      setPropValueAtTime(l.transform.position, t, [curPos[0] + delta[0], curPos[1] + delta[1], curPos[2] + delta[2]]);
    } else if (hit.kind === 'anchor') {
      // Transform drag delta into the layer's OWN local space (inv(worldMat)) so anchor tracks cursor 1-to-1
      // even when rotated, scaled, and parented, while keeping the visual screen position strictly locked!
      const wm = getLayerWorldMatrix(comp, l, t, snap.ec);
      const invW = m4Invert(wm) ?? m4Identity();
      let dLocal: Vec3 = [0, 0, 0];
      if (!l.is3D) {
        const a0 = m4TransformPoint(invW, [lastComp[0], lastComp[1], 0]);
        const a1 = m4TransformPoint(invW, [compPt[0], compPt[1], 0]);
        dLocal = [a1[0] - a0[0], a1[1] - a0[1], 0];
      } else {
        const originW = m4TransformPoint(wm, [0, 0, 0]);
        const pN = v3Norm(v3Sub(snap.camera.eye, originW));
        const r0 = unprojectCompRay(snap.camera.invVP, lastComp[0], lastComp[1], comp.width, comp.height);
        const r1 = unprojectCompRay(snap.camera.invVP, compPt[0], compPt[1], comp.width, comp.height);
        const w0 = rayPlaneIntersect(r0.origin, r0.dir, originW, pN);
        const w1 = rayPlaneIntersect(r1.origin, r1.dir, originW, pN);
        if (w0 && w1) {
          const l0 = m4TransformPoint(invW, w0);
          const l1 = m4TransformPoint(invW, w1);
          dLocal = [l1[0] - l0[0], l1[1] - l0[1], l1[2] - l0[2]];
        }
      }
      const curAnc = snap.ec.evaluateProp(l, l.transform.anchor, 'anchor', t) as Vec3;
      moveAnchorPreserveVisual(comp, l, [curAnc[0] + dLocal[0], curAnc[1] + dLocal[1], curAnc[2] + dLocal[2]], t);
    } else if (hit.kind === 'rotate' && layerCenterScreen && startAngle !== undefined) {
      const curAng = Math.atan2(compPt[1] - layerCenterScreen[1], compPt[0] - layerCenterScreen[0]);
      const dDeg = ((curAng - startAngle) * 180) / Math.PI;
      const baseR = startVal.rotation as Vec3;
      setPropValueAtTime(l.transform.rotation, t, [baseR[0], baseR[1], baseR[2] + dDeg]);
    } else if (hit.kind === 'scale' && layerCenterScreen && startDist) {
      const curDist = Math.max(5, Math.hypot(compPt[0] - layerCenterScreen[0], compPt[1] - layerCenterScreen[1]));
      const ratio = curDist / startDist;
      const baseS = startVal.scale as Vec3;
      setPropValueAtTime(l.transform.scale, t, [baseS[0] * ratio, baseS[1] * ratio, l.is3D ? baseS[2] * ratio : 100]);
    } else if (hit.kind === 'spatialIn' || hit.kind === 'spatialOut' || hit.kind === 'spatialKf') {
      const kf = l.transform.position.keyframes[hit.kfIdx ?? 0];
      if (kf) {
        const delta = computeParentAwareDragDelta(comp, l, snap, t, lastComp[0], lastComp[1], compPt[0], compPt[1], 'free');
        if (hit.kind === 'spatialKf') {
          const v = kf.value as Vec3;
          kf.value = [v[0] + delta[0], v[1] + delta[1], v[2] + delta[2]];
        } else if (hit.kind === 'spatialOut') {
          const o = kf.outSpatialTangent ?? [0, 0, 0];
          kf.outSpatialTangent = [o[0] + delta[0], o[1] + delta[1], o[2] + delta[2]];
          kf.spatialLinear = false;
          if (!e.altKey && !kf.spatialBroken) {
            kf.inSpatialTangent = [-kf.outSpatialTangent[0], -kf.outSpatialTangent[1], -kf.outSpatialTangent[2]];
          } else {
            kf.spatialBroken = true;
          }
        } else {
          const inn = kf.inSpatialTangent ?? [0, 0, 0];
          kf.inSpatialTangent = [inn[0] + delta[0], inn[1] + delta[1], inn[2] + delta[2]];
          kf.spatialLinear = false;
          if (!e.altKey && !kf.spatialBroken) {
            kf.outSpatialTangent = [-kf.inSpatialTangent[0], -kf.inSpatialTangent[1], -kf.inSpatialTangent[2]];
          } else {
            kf.spatialBroken = true;
          }
        }
      }
    } else if ((hit.kind === 'bezierVert' || hit.kind === 'bezierIn' || hit.kind === 'bezierOut') && l.shape) {
      const item = l.shape.items.find((it) => it.id === hit.itemId);
      if (item) {
        const wm = getLayerWorldMatrix(comp, l, t, snap.ec);
        const inv = m4Invert(wm) ?? m4Identity();
        const p0 = m4TransformPoint(inv, [lastComp[0], lastComp[1], 0]);
        const p1 = m4TransformPoint(inv, [compPt[0], compPt[1], 0]);
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const pd = JSON.parse(JSON.stringify(snap.ec.evaluateProp(l, item.path, `shape.${item.id}.path`, t)));
        const vert = pd.contours[hit.contourIdx!]?.vertices[hit.vertexIdx!];
        if (vert) {
          if (hit.kind === 'bezierVert') { vert.x += dx; vert.y += dy; }
          else if (hit.kind === 'bezierIn') {
            vert.inX += dx; vert.inY += dy;
            if (!e.altKey && !vert.broken) { vert.outX = -vert.inX; vert.outY = -vert.inY; }
          } else {
            vert.outX += dx; vert.outY += dy;
            if (!e.altKey && !vert.broken) { vert.inX = -vert.outX; vert.inY = -vert.outY; }
          }
          setPropValueAtTime(item.path, t, pd);
        }
      }
    } else if (hit.kind === 'puppetPin') {
      const delta = computeParentAwareDragDelta(comp, l, snap, t, lastComp[0], lastComp[1], compPt[0], compPt[1], 'free');
      const findPin = (): PuppetPin | undefined => {
        if (l.shape?.puppetPins) return l.shape.puppetPins.find((p) => p.id === hit.pinId);
        if (l.text?.puppetPins) return l.text.puppetPins.find((p) => p.id === hit.pinId);
        if (l.mesh3d) {
          const d = l.mesh3d.deformers.find((x) => x.id === hit.deformerId);
          return d?.pins?.find((p) => p.id === hit.pinId);
        }
      };
      const pin = findPin();
      if (pin) {
        const cur = snap.ec.evaluateProp(l, pin.position, `pin.${pin.id}.pos`, t) as Vec2;
        const dySign = l.is3D ? -1 : 1;
        setPropValueAtTime(pin.position, t, [cur[0] + delta[0], cur[1] + delta[1] * dySign]);
      }
    }

    this.activeDrag.lastComp = compPt;
    this.store.notify('full');
  }

  private onPointerUp(): void {
    if (this.activeDrag || this.drawCreateState || this.orbitState) {
      this.activeDrag = null;
      this.drawCreateState = null;
      this.orbitState = null;
      this.store.commitEdit();
    }
  }

  private onWheel(e: WheelEvent): void {
    const snap = this.store.lastSceneSnap;
    if (!snap || this.store.isExportMode) return;
    const comp = this.store.getActiveComp();
    if (this.store.activeTool === 'cameraOrbit' || e.altKey) {
      e.preventDefault();
      const camLayer = comp.layers.find((l) => l.type === 'camera' && l.visible && l.camera);
      if (camLayer && camLayer.camera) {
        this.store.beginEdit();
        const t = this.store.currentTime;
        const eye = snap.ec.evaluateProp(camLayer, camLayer.transform.position, 'position', t, true) as Vec3;
        const tgt = snap.ec.evaluateProp(camLayer, camLayer.camera.target, 'camera.target', t, true) as Vec3;
        const rel = v3Sub(eye, tgt);
        const factor = e.deltaY > 0 ? 1.08 : 0.92;
        const newEye = v3Add(tgt, v3Scale(rel, clamp(factor, 0.5, 2.0)));
        setPropValueAtTime(camLayer.transform.position, t, newEye);
        this.store.commitEdit();
      }
    }
  }
}
