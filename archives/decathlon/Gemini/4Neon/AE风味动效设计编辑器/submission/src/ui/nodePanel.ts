import { GraphEdge, GraphNode, NodeKind, PortDataType } from '../core/types';
import { clamp, deepClone, genId } from '../core/math';
import { createGraphNode } from '../core/project';
import { encapsulateNodesIntoGroup, summarizePortValue } from '../nodes/nodeEngine';
import { EditorStore } from './store';

const PORT_COLORS: Record<PortDataType, string> = {
  scalar: '#cbd5e1',
  vec3: '#38bdf8',
  color: '#f472b6',
  path: '#34d399',
  mesh: '#f59e0b',
  field: '#a78bfa',
};

const PORT_TYPE_LABELS: Record<PortDataType, string> = {
  scalar: '标量',
  vec3: '向量',
  color: '颜色',
  path: '路径',
  mesh: '三维网格',
  field: '空间场',
};

const NODE_W = 178;
const HEADER_H = 26;
const PORT_ROW_H = 21;

export class NodePanel {
  private container: HTMLElement;
  private store: EditorStore;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private propPane!: HTMLElement;

  private panX = 18;
  private panY = 12;
  private zoom = 0.86;

  private dragNode: { ids: string[]; startX: number; startY: number; origPos: Map<string, [number, number]> } | null = null;
  private dragWire: { fromNodeId: string; fromPortId: string; dataType: PortDataType; curX: number; curY: number } | null = null;
  private dragPan: { startX: number; startY: number; origPanX: number; origPanY: number } | null = null;
  private hoverEdgeId: string | null = null;

  constructor(container: HTMLElement, store: EditorStore) {
    this.container = container;
    this.store = store;
    this.buildDOM();
    this.bindEvents();
  }

  private buildDOM(): void {
    const addItems: Array<[NodeKind, string]> = [
      ['sourceText', '文字字形源'],
      ['sourceShape', '形状源'],
      ['strokeWriteOn', '笔画书写'],
      ['primitivePath', '程序图形'],
      ['primitiveMesh', '三维基础体'],
      ['pathTransform', '路径变换'],
      ['trimPath', '修剪路径'],
      ['repeater', '阵列重复'],
      ['booleanOp', '布尔运算'],
      ['extrude3d', '三维挤出'],
      ['fieldGenerator', '空间场生成'],
      ['fieldBlend', '场混合'],
      ['deformMesh', '网格变形'],
      ['meshTransform', '网格变换'],
      ['mergeMesh', '合并网格'],
      ['scatterPoints', '表面散布'],
      ['valueScalar', '标量参数'],
      ['mathOp', '数学运算'],
      ['output', '场景输出'],
    ];
    const opts = addItems.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

    this.container.innerHTML = `
      <div class="node-toolbar">
        <div class="node-tb-left">
          <select id="nd-add-sel" name="nd-add-sel" class="mini-select">${opts}</select>
          <button class="mini-btn accent" id="nd-add-btn">+ 添加节点</button>
          <button class="mini-btn" id="nd-dup-btn">复制节点</button>
          <button class="mini-btn" id="nd-group-btn" title="将所选节点封装为可复用节点组">封装节点组</button>
          <button class="mini-btn" id="nd-fit-btn" title="缩放并居中全部节点">适配视图</button>
          <button class="mini-btn danger" id="nd-del-btn">删除</button>
        </div>
        <div class="node-legend">
          <span class="leg-item"><i style="background:${PORT_COLORS.path}"></i>路径</span>
          <span class="leg-item"><i style="background:${PORT_COLORS.mesh}"></i>网格</span>
          <span class="leg-item"><i style="background:${PORT_COLORS.field}"></i>空间场</span>
          <span class="leg-item"><i style="background:${PORT_COLORS.scalar}"></i>标量</span>
          <span class="leg-item"><i style="background:${PORT_COLORS.vec3}"></i>向量</span>
        </div>
      </div>
      <div class="node-body">
        <div class="node-canvas-wrap" id="nd-canvas-wrap">
          <canvas id="nd-canvas"></canvas>
        </div>
        <div class="node-side-inspector" id="nd-inspector"></div>
      </div>
    `;

    this.canvas = this.container.querySelector('#nd-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.propPane = this.container.querySelector('#nd-inspector')!;

    this.container.querySelector('#nd-add-btn')!.addEventListener('click', () => {
      const kind = (this.container.querySelector('#nd-add-sel') as HTMLSelectElement).value as NodeKind;
      const comp = this.store.getActiveComp();
      this.store.beginEdit();
      const nx = Math.round((180 - this.panX) / this.zoom + (comp.nodeGraph.nodes.length % 5) * 32);
      const ny = Math.round((70 - this.panY) / this.zoom + (comp.nodeGraph.nodes.length % 4) * 28);
      const node = createGraphNode(kind, nx, ny);
      comp.nodeGraph.nodes.push(node);
      this.store.selectedNodeIds = new Set([node.id]);
      this.store.commitEdit();
      this.store.showToast(`已添加节点：${node.title}`);
    });

    this.container.querySelector('#nd-dup-btn')!.addEventListener('click', () => {
      const comp = this.store.getActiveComp();
      const sel = comp.nodeGraph.nodes.filter((n) => this.store.selectedNodeIds.has(n.id));
      if (sel.length === 0) return;
      this.store.beginEdit();
      const newIds: string[] = [];
      for (const n of sel) {
        const c = deepClone(n);
        c.id = genId('nd');
        c.x += 36; c.y += 36;
        c.title = `${n.title} 副本`;
        comp.nodeGraph.nodes.push(c);
        newIds.push(c.id);
      }
      this.store.selectedNodeIds = new Set(newIds);
      this.store.commitEdit();
    });

    this.container.querySelector('#nd-group-btn')!.addEventListener('click', () => {
      const comp = this.store.getActiveComp();
      const ids = Array.from(this.store.selectedNodeIds);
      if (ids.length === 0) {
        this.store.showToast('请先 Shift 点击选择要封装的节点');
        return;
      }
      this.store.beginEdit();
      const grp = encapsulateNodesIntoGroup(comp.nodeGraph, ids, `节点组 ${comp.nodeGraph.nodes.filter((n) => n.kind === 'group').length + 1}`);
      if (grp) {
        this.store.selectedNodeIds = new Set([grp.id]);
        this.store.commitEdit();
        this.store.showToast(`已封装节点组：${grp.title}`);
      }
    });

    this.container.querySelector('#nd-fit-btn')!.addEventListener('click', () => {
      const nodes = this.store.getActiveComp().nodeGraph.nodes;
      if (nodes.length === 0) return;
      const wrap = this.container.querySelector('#nd-canvas-wrap') as HTMLElement;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) {
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
        x1 = Math.max(x1, n.x + NODE_W); y1 = Math.max(y1, n.y + this.getNodeHeight(n));
      }
      const bw = Math.max(100, x1 - x0 + 40), bh = Math.max(80, y1 - y0 + 40);
      this.zoom = clamp(Math.min((wrap.clientWidth - 20) / bw, (wrap.clientHeight - 20) / bh), 0.45, 1.3);
      this.panX = (wrap.clientWidth - (x1 - x0) * this.zoom) * 0.5 - x0 * this.zoom;
      this.panY = (wrap.clientHeight - (y1 - y0) * this.zoom) * 0.5 - y0 * this.zoom;
      this.render();
    });

    this.container.querySelector('#nd-del-btn')!.addEventListener('click', () => {
      const comp = this.store.getActiveComp();
      if (this.store.selectedNodeIds.size === 0) return;
      this.store.beginEdit();
      const del = this.store.selectedNodeIds;
      comp.nodeGraph.nodes = comp.nodeGraph.nodes.filter((n) => !del.has(n.id));
      comp.nodeGraph.edges = comp.nodeGraph.edges.filter((e) => !del.has(e.fromNodeId) && !del.has(e.toNodeId));
      this.store.selectedNodeIds.clear();
      this.store.commitEdit();
    });
  }

  private getNodeHeight(node: GraphNode): number {
    const rows = Math.max(node.inputs.length, node.outputs.length, 1);
    return HEADER_H + rows * PORT_ROW_H + 26;
  }

  private getPortPos(node: GraphNode, portId: string, dir: 'in' | 'out'): [number, number] {
    const list = dir === 'in' ? node.inputs : node.outputs;
    const idx = Math.max(0, list.findIndex((p) => p.id === portId));
    const px = dir === 'in' ? node.x : node.x + NODE_W;
    const py = node.y + HEADER_H + idx * PORT_ROW_H + 12;
    return [px, py];
  }

  private screenToGraph(sx: number, sy: number): [number, number] {
    return [(sx - this.panX) / this.zoom, (sy - this.panY) / this.zoom];
  }

  public render(): void {
    const wrap = this.container.querySelector('#nd-canvas-wrap') as HTMLElement;
    if (!wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(120, wrap.clientWidth);
    const h = Math.max(100, wrap.clientHeight);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e1118';
    ctx.fillRect(0, 0, w, h);

    // Subtle blueprint grid
    const grid = 24 * this.zoom;
    if (grid >= 10) {
      ctx.fillStyle = 'rgba(148,163,184,0.14)';
      const ox = ((this.panX % grid) + grid) % grid;
      const oy = ((this.panY % grid) + grid) % grid;
      for (let gx = ox; gx < w; gx += grid) {
        for (let gy = oy; gy < h; gy += grid) {
          ctx.fillRect(gx, gy, 1.3, 1.3);
        }
      }
    }

    const comp = this.store.getActiveComp();
    const graph = comp.nodeGraph;
    const report = this.store.lastSceneSnap?.nodeReport;

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1) Draw Edges (Bezier curves color-coded by port data type + hover highlight!)
    for (const edge of graph.edges) {
      const fn = graph.nodes.find((n) => n.id === edge.fromNodeId);
      const tn = graph.nodes.find((n) => n.id === edge.toNodeId);
      if (!fn || !tn) continue;
      const port = fn.outputs.find((p) => p.id === edge.fromPortId);
      const isHov = edge.id === this.hoverEdgeId;
      const col = isHov ? '#fde047' : PORT_COLORS[port?.dataType || 'mesh'];
      const [x0, y0] = this.getPortPos(fn, edge.fromPortId, 'out');
      const [x1, y1] = this.getPortPos(tn, edge.toPortId, 'in');
      this.drawBezierWire(ctx, x0, y0, x1, y1, col, isHov ? 3.4 : 2.2);
      if (isHov) {
        const mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5 - 8;
        const val = report?.portValues.get(`${fn.id}:${edge.fromPortId}`);
        const label = `${PORT_TYPE_LABELS[port?.dataType || 'mesh']} · ${summarizePortValue(port?.dataType || 'mesh', val)} (点击断开)`;
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(mx - tw * 0.5, my - 13, tw, 18, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'center';
        ctx.fillText(label, mx, my - 1);
      }
    }

    // Active dragging wire
    if (this.dragWire) {
      const fn = graph.nodes.find((n) => n.id === this.dragWire!.fromNodeId);
      if (fn) {
        const [x0, y0] = this.getPortPos(fn, this.dragWire.fromPortId, 'out');
        this.drawBezierWire(ctx, x0, y0, this.dragWire.curX, this.dragWire.curY, PORT_COLORS[this.dragWire.dataType], 2.4);
      }
    }

    // 2) Draw Nodes
    for (const node of graph.nodes) {
      const nh = this.getNodeHeight(node);
      const sel = this.store.selectedNodeIds.has(node.id);
      const hasErr = report?.errors.has(node.id);

      // Node shadow & card body
      ctx.fillStyle = '#181e2a';
      ctx.strokeStyle = hasErr ? '#ef4444' : sel ? '#f59e0b' : '#2d3748';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.beginPath();
      ctx.roundRect(node.x, node.y, NODE_W, nh, 7);
      ctx.fill(); ctx.stroke();

      // Header band color-coded by category
      const headCol = node.kind === 'output' ? '#b45309'
        : node.kind === 'group' ? '#0e7490'
        : node.kind.includes('field') || node.kind.includes('Field') ? '#5b21b6'
        : node.kind.includes('source') ? '#047857'
        : '#1e293b';
      ctx.fillStyle = headCol;
      ctx.beginPath();
      ctx.roundRect(node.x + 0.5, node.y + 0.5, NODE_W - 1, HEADER_H, [6, 6, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(node.title, node.x + 9, node.y + 17);

      // Input ports
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      node.inputs.forEach((p, idx) => {
        const py = node.y + HEADER_H + idx * PORT_ROW_H + 12;
        ctx.fillStyle = PORT_COLORS[p.dataType];
        ctx.beginPath(); ctx.arc(node.x, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'left';
        ctx.fillText(p.name, node.x + 10, py + 3);
      });

      // Output ports
      node.outputs.forEach((p, idx) => {
        const py = node.y + HEADER_H + idx * PORT_ROW_H + 12;
        ctx.fillStyle = PORT_COLORS[p.dataType];
        ctx.beginPath(); ctx.arc(node.x + NODE_W, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'right';
        ctx.fillText(p.name, node.x + NODE_W - 10, py + 3);
      });

      // Live output summary footer inside node card!
      const summary = report?.errors.get(node.id) || report?.nodeSummaries.get(node.id) || '';
      ctx.fillStyle = hasErr ? '#fca5a5' : '#94a3b8';
      ctx.font = '9.5px "Consolas", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(summary.slice(0, 26), node.x + 8, node.y + nh - 7);
    }

    ctx.restore();

    if (graph.nodes.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText('当前合成暂无程序节点 · 点击左上角「+ 添加节点」构建可视化几何与场管线', 24, 48);
    }

    this.renderNodeSideInspector();
  }

  private drawBezierWire(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number): void {
    const dx = Math.max(45, Math.abs(x1 - x0) * 0.45);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + dx, y0, x1 - dx, y1, x1, y1);
    ctx.stroke();
  }

  private renderNodeSideInspector(): void {
    const comp = this.store.getActiveComp();
    const graph = comp.nodeGraph;
    const report = this.store.lastSceneSnap?.nodeReport;
    const selNodes = graph.nodes.filter((n) => this.store.selectedNodeIds.has(n.id));
    if (selNodes.length !== 1) {
      this.propPane.innerHTML = `<div class="nd-empty-hint">${selNodes.length > 1 ? `已选 ${selNodes.length} 个节点，可点击「封装节点组」打包复用` : '点击节点查看参数、端口类型与实时计算结果；双击输入端口可断开连线'}</div>`;
      return;
    }

    const node = selNodes[0];
    const p = node.params;
    const summary = report?.nodeSummaries.get(node.id) || '无输出';

    let controls = '';
    if (node.kind === 'sourceText' || node.kind === 'sourceShape' || node.kind === 'strokeWriteOn' || node.kind === 'fieldGenerator') {
      const filterType = node.kind === 'sourceText' || node.kind === 'strokeWriteOn' ? 'text' : node.kind === 'sourceShape' ? 'shape' : 'field';
      const layers = comp.layers.filter((l) => l.type === filterType);
      const opts = [`<option value="">内置参数</option>`]
        .concat(layers.map((l) => `<option value="${l.id}" ${p.layerId === l.id ? 'selected' : ''}>${l.name}</option>`))
        .join('');
      controls += `<label class="nd-row"><span>源图层</span><select data-param="layerId">${opts}</select></label>`;
    }
    if (node.kind === 'extrude3d') {
      controls += `<label class="nd-row"><span>挤出深度</span><input type="number" data-param="depth" value="${p.depth ?? 68}" step="2" /></label>`;
      controls += `<label class="nd-row"><span>倒角尺寸</span><input type="number" data-param="bevel" value="${p.bevel ?? 6}" step="0.5" /></label>`;
    }
    if (node.kind === 'booleanOp') {
      controls += `<label class="nd-row"><span>布尔模式</span><select data-param="op">
        <option value="union" ${p.op === 'union' ? 'selected' : ''}>并集</option>
        <option value="difference" ${p.op === 'difference' ? 'selected' : ''}>差集</option>
        <option value="intersect" ${p.op === 'intersect' ? 'selected' : ''}>交集</option>
      </select></label>`;
    }
    if (node.kind === 'fieldBlend') {
      controls += `<label class="nd-row"><span>混合方式</span><select data-param="mode">
        <option value="add" ${p.mode === 'add' ? 'selected' : ''}>相加</option>
        <option value="multiply" ${p.mode === 'multiply' ? 'selected' : ''}>相乘</option>
        <option value="max" ${p.mode === 'max' ? 'selected' : ''}>最大值</option>
        <option value="lerp" ${p.mode === 'lerp' ? 'selected' : ''}>插值</option>
      </select></label>`;
    }
    if (node.kind === 'deformMesh') {
      controls += `<label class="nd-row"><span>变形类型</span><select data-param="mode">
        <option value="field" ${p.mode === 'field' ? 'selected' : ''}>空间场驱动</option>
        <option value="bend" ${p.mode === 'bend' ? 'selected' : ''}>弯曲</option>
        <option value="twist" ${p.mode === 'twist' ? 'selected' : ''}>扭转</option>
      </select></label>`;
      controls += `<label class="nd-row"><span>强度</span><input type="number" data-param="amount" value="${p.amount ?? 1}" step="0.1" /></label>`;
    }
    if (node.kind === 'primitivePath') {
      controls += `<label class="nd-row"><span>图形</span><select data-param="shape">
        <option value="ring" ${p.shape === 'ring' ? 'selected' : ''}>圆环(带孔)</option>
        <option value="rect" ${p.shape === 'rect' ? 'selected' : ''}>矩形</option>
        <option value="ellipse" ${p.shape === 'ellipse' ? 'selected' : ''}>椭圆</option>
        <option value="star" ${p.shape === 'star' ? 'selected' : ''}>星形</option>
      </select></label>`;
      controls += `<label class="nd-row"><span>尺寸</span><input type="number" data-param="width" value="${p.width ?? 180}" step="10" /></label>`;
    }
    if (node.kind === 'repeater') {
      controls += `<label class="nd-row"><span>副本数</span><input type="number" data-param="copies" value="${p.copies ?? 5}" min="1" max="40" /></label>`;
      controls += `<label class="nd-row"><span>旋转步进</span><input type="number" data-param="rotation" value="${p.rotation ?? 18}" /></label>`;
    }
    if (node.kind === 'valueScalar') {
      controls += `<label class="nd-row"><span>数值</span><input type="number" data-param="value" value="${p.value ?? 0}" step="1" /></label>`;
    }
    if (node.kind === 'scatterPoints') {
      controls += `<label class="nd-row"><span>散布点数</span><input type="number" data-param="count" value="${p.count ?? 24}" min="1" max="150" /></label>`;
      controls += `<label class="nd-row"><span>块体尺寸</span><input type="number" data-param="size" value="${p.size ?? 8}" min="1" max="60" /></label>`;
    }

    const outPortsHtml = node.outputs.map((op) => {
      const val = report?.portValues.get(`${node.id}:${op.id}`);
      return `<div class="nd-port-stat"><i style="background:${PORT_COLORS[op.dataType]}"></i><b>${op.name}</b> (${PORT_TYPE_LABELS[op.dataType]}): ${summarizePortValue(op.dataType, val)}</div>`;
    }).join('');

    this.propPane.innerHTML = `
      <div class="nd-insp-title">${node.title}</div>
      <div class="nd-insp-summary">${summary}</div>
      <div class="nd-insp-controls">${controls}</div>
      <div class="nd-insp-ports">${outPortsHtml}</div>
    `;

    this.propPane.querySelectorAll('[data-param]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = (el as HTMLElement).dataset.param!;
        const raw = (el as HTMLInputElement).value;
        this.store.beginEdit();
        node.params[key] = (el as HTMLInputElement).type === 'number' ? Number(raw) : raw;
        // If user overrides animated extrude param manually, also update static fallback
        if (node.animParams?.[key]) {
          node.animParams[key].animated = false;
          node.animParams[key].value = node.params[key];
        }
        this.store.commitEdit();
      });
    });
  }

  private bindEvents(): void {
    const getPos = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      const { sx, sy } = getPos(e);
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this.dragPan = { startX: sx, startY: sy, origPanX: this.panX, origPanY: this.panY };
        return;
      }
      if (e.button !== 0) return;

      const [gx, gy] = this.screenToGraph(sx, sy);
      const comp = this.store.getActiveComp();
      const graph = comp.nodeGraph;

      // 1) Check Output Ports (start wiring!)
      for (let i = graph.nodes.length - 1; i >= 0; i--) {
        const n = graph.nodes[i];
        for (const op of n.outputs) {
          const [px, py] = this.getPortPos(n, op.id, 'out');
          if (Math.hypot(gx - px, gy - py) < 10) {
            this.dragWire = { fromNodeId: n.id, fromPortId: op.id, dataType: op.dataType, curX: gx, curY: gy };
            return;
          }
        }
        // Check Input Ports (click existing connected input to disconnect!)
        for (const ip of n.inputs) {
          const [px, py] = this.getPortPos(n, ip.id, 'in');
          if (Math.hypot(gx - px, gy - py) < 10) {
            const idx = graph.edges.findIndex((ed) => ed.toNodeId === n.id && ed.toPortId === ip.id);
            if (idx >= 0) {
              this.store.beginEdit();
              graph.edges.splice(idx, 1);
              this.store.commitEdit();
              this.store.showToast('已断开节点连线');
              return;
            }
          }
        }
      }

      // 2) Check Node Bodies
      for (let i = graph.nodes.length - 1; i >= 0; i--) {
        const n = graph.nodes[i];
        const nh = this.getNodeHeight(n);
        if (gx >= n.x && gx <= n.x + NODE_W && gy >= n.y && gy <= n.y + nh) {
          if (!this.store.selectedNodeIds.has(n.id) && !e.shiftKey) {
            this.store.selectedNodeIds.clear();
          }
          if (e.shiftKey && this.store.selectedNodeIds.has(n.id)) this.store.selectedNodeIds.delete(n.id);
          else this.store.selectedNodeIds.add(n.id);

          const ids = Array.from(this.store.selectedNodeIds);
          const origPos = new Map<string, [number, number]>();
          for (const id of ids) {
            const nd = graph.nodes.find((x) => x.id === id);
            if (nd) origPos.set(id, [nd.x, nd.y]);
          }
          this.store.beginEdit();
          this.dragNode = { ids, startX: gx, startY: gy, origPos };
          this.render();
          return;
        }
      }

      // 2.5) Click directly on an edge wire to disconnect it cleanly!
      const hitEdge = this.hitTestEdge(gx, gy, graph);
      if (hitEdge) {
        this.store.beginEdit();
        graph.edges = graph.edges.filter((ed) => ed.id !== hitEdge.id);
        this.hoverEdgeId = null;
        this.store.commitEdit();
        this.store.showToast('已断开节点连线');
        return;
      }

      // Empty background -> pan canvas
      if (!e.shiftKey) this.store.selectedNodeIds.clear();
      this.dragPan = { startX: sx, startY: sy, origPanX: this.panX, origPanY: this.panY };
      this.render();
    });

    window.addEventListener('pointermove', (e) => {
      const { sx, sy } = getPos(e);
      if (this.dragPan) {
        this.panX = this.dragPan.origPanX + (sx - this.dragPan.startX);
        this.panY = this.dragPan.origPanY + (sy - this.dragPan.startY);
        this.render();
        return;
      }
      const [gx, gy] = this.screenToGraph(sx, sy);
      if (this.dragWire) {
        this.dragWire.curX = gx;
        this.dragWire.curY = gy;
        this.render();
        return;
      }
      if (this.dragNode) {
        const comp = this.store.getActiveComp();
        const dx = gx - this.dragNode.startX;
        const dy = gy - this.dragNode.startY;
        for (const id of this.dragNode.ids) {
          const nd = comp.nodeGraph.nodes.find((x) => x.id === id);
          const orig = this.dragNode.origPos.get(id);
          if (nd && orig) {
            nd.x = Math.round(orig[0] + dx);
            nd.y = Math.round(orig[1] + dy);
          }
        }
        this.render();
      } else {
        // Live hover detection over wires to show connection meaning & current result! (2.7)
        const r = this.canvas.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const he = this.hitTestEdge(gx, gy, this.store.getActiveComp().nodeGraph);
          const nextId = he?.id ?? null;
          if (nextId !== this.hoverEdgeId) {
            this.hoverEdgeId = nextId;
            this.render();
          }
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.dragPan) { this.dragPan = null; return; }
      if (this.dragNode) {
        this.dragNode = null;
        this.store.commitEdit(false);
        return;
      }
      if (this.dragWire) {
        const { sx, sy } = getPos(e);
        const [gx, gy] = this.screenToGraph(sx, sy);
        const comp = this.store.getActiveComp();
        const graph = comp.nodeGraph;
        const dw = this.dragWire;
        this.dragWire = null;

        for (const n of graph.nodes) {
          if (n.id === dw.fromNodeId) continue;
          for (const ip of n.inputs) {
            const [px, py] = this.getPortPos(n, ip.id, 'in');
            if (Math.hypot(gx - px, gy - py) < 15) {
              if (ip.dataType !== dw.dataType) {
                this.store.showToast(`端口类型不匹配：${PORT_TYPE_LABELS[dw.dataType]} ≠ ${PORT_TYPE_LABELS[ip.dataType]}`);
                this.render();
                return;
              }
              this.store.beginEdit();
              // Replace any existing edge into this specific input port (outputs can still branch to many inputs!)
              graph.edges = graph.edges.filter((ed) => !(ed.toNodeId === n.id && ed.toPortId === ip.id));
              graph.edges.push({
                id: genId('edg'),
                fromNodeId: dw.fromNodeId,
                fromPortId: dw.fromPortId,
                toNodeId: n.id,
                toPortId: ip.id,
              });
              this.store.commitEdit();
              this.store.showToast('已连接节点端口');
              return;
            }
          }
        }
        this.render();
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.11;
      this.zoom = clamp(this.zoom * factor, 0.4, 2.2);
      this.render();
    }, { passive: false });
  }

  private hitTestEdge(gx: number, gy: number, graph: { nodes: GraphNode[]; edges: GraphEdge[] }): GraphEdge | null {
    for (const edge of graph.edges) {
      const fn = graph.nodes.find((n) => n.id === edge.fromNodeId);
      const tn = graph.nodes.find((n) => n.id === edge.toNodeId);
      if (!fn || !tn) continue;
      const [x0, y0] = this.getPortPos(fn, edge.fromPortId, 'out');
      const [x1, y1] = this.getPortPos(tn, edge.toPortId, 'in');
      const dx = Math.max(45, Math.abs(x1 - x0) * 0.45);
      for (let s = 1; s < 16; s++) {
        const u = s / 16, inv = 1 - u;
        const bx = inv * inv * inv * x0 + 3 * inv * inv * u * (x0 + dx) + 3 * inv * u * u * (x1 - dx) + u * u * u * x1;
        const by = inv * inv * inv * y0 + 3 * inv * inv * u * y0 + 3 * inv * u * u * y1 + u * u * u * y1;
        if (Math.hypot(gx - bx, gy - by) < 9) return edge;
      }
    }
    return null;
  }
}
