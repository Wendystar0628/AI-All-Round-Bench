/* 顶部菜单与工具、左侧项目面板、底部页签、快捷键，以及全部面板的初始化入口 UI.init。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = AE.UI;
  const Model = AE.Model;
  const Anim = AE.Anim;
  const App = AE.App;
  const G = AE.Graph;
  const E = UI.el;
  const Menus = (UI.menus = {});
  let leftBody, leftTabs;
  let leftTab = 'project';

  // ---------- 图层创建 ----------
  Menus.addLayer = (type) => {
    const c = App.comp();
    if (!c) return;
    App.mutate('新建' + Model.typeName(type), () => {
      const cc = App.comp();
      const t = App.state.time;
      const opts = { inPoint: Math.max(0, Math.min(t, cc.workEnd - 0.1)), outPoint: cc.duration, is3D: false };
      const cx = cc.width / 2, cy = cc.height / 2;
      let L;
      if (type === 'shape') {
        L = Model.createLayer(cc, 'shape', Object.assign(opts, { name: '形状 ' + (cc.layers.length + 1), tr: { position: [cx, cy] } }));
        L.contents = [
          { type: 'rect', pos: Model.vec([0, 0]), size: Model.vec([420, 260]), round: Model.num(0) },
          { type: 'fill', color: Model.color([0.95, 0.55, 0.2]), opacity: Model.num(100) },
        ];
      } else if (type === 'text') {
        L = Model.createLayer(cc, 'text', Object.assign(opts, { name: '文字', text: '文字', size: 200, tr: { position: [cx, cy] } }));
      } else if (type === 'null') {
        L = Model.createLayer(cc, 'null', Object.assign(opts, { name: '空对象', tr: { position: [cx, cy] } }));
      } else if (type === 'adjust') {
        L = Model.createLayer(cc, 'adjust', Object.assign(opts, { name: '调整图层' }));
        L.effects = [{ type: 'hsl', name: '色相/饱和度/亮度', on: true, params: { hue: Model.num(0), sat: Model.num(0), light: Model.num(0) } }];
      } else if (type === 'camera') {
        L = Model.createLayer(cc, 'camera', Object.assign(opts, { name: '摄像机 ' + (cc.layers.filter((l) => l.type === 'camera').length + 1) }));
      } else if (type === 'light') {
        L = Model.createLayer(cc, 'light', Object.assign(opts, { name: '灯光 ' + (cc.layers.filter((l) => l.type === 'light').length + 1), kind: 'parallel', position: [cx - 600, cy - 700, -600], poi: [cx, cy, 0] }));
      } else if (type === 'pointlight') {
        L = Model.createLayer(cc, 'light', Object.assign(opts, { name: '点光源', kind: 'point', position: [cx, cy - 500, -500], poi: [cx, cy, 0] }));
      } else if (type === 'geo') {
        L = Model.createLayer(cc, 'geo', Object.assign(opts, { name: '三维几何', is3D: true, tr: { position: [cx, cy, 0] } }));
        // 默认节点图：文字 -> 挤出
        const g = G.newGraph('几何节点图 ' + ((App.project.graphs || []).length + 1));
        const tx = G.newNode(g, 'text', 0, 0, { text: '火', size: 300 });
        const ex = G.newNode(g, 'extrude', 0, 0, { depth: 120 });
        ex.ins.geo = { node: tx.id, port: 'out' };
        App.project.graphs.push(g);
        L.geo.source = { graph: g.id, node: ex.id };
      } else if (type === 'particles') {
        L = Model.createLayer(cc, 'particles', Object.assign(opts, { name: '粒子', is3D: true, tr: { position: [cx, cy, 0] } }));
        L.particles.emitters = [AE.Particles.newEmitter('发射器 1', { pos: [0, 0, 0], dir: [0, -1, 0], rate: 40, speed: 300, spread: 30, life: 1.5 })];
      } else if (type === 'sound') {
        L = Model.createLayer(cc, 'sound', Object.assign(opts, { name: '音色', instrument: 'hit', events: [{ t: 0, pitch: 1, gain: 1 }] }));
      } else if (type === 'precomp') {
        Props().precompose();
        return;
      }
      if (!L) return;
      cc.layers.unshift(L);
      App.state.selected = [L.id];
    });
  };
  function Props() {
    return UI.props;
  }

  // ---------- 图层操作 ----------
  Menus.duplicateSelected = () => {
    const c = App.comp();
    const ids = App.state.selected.filter((id) => c.layers.some((l) => l.id === id));
    if (!ids.length) return App.toast('请先选择图层');
    App.mutate('复制图层', () => {
      const cc = App.comp();
      const news = [];
      cc.layers.forEach((l, i) => {
        if (!ids.includes(l.id)) return;
        const cp = Model.cloneLayer(l);
        cp.name = l.name + ' 副本';
        news.push(cp);
      });
      cc.layers = news.concat(cc.layers);
      App.state.selected = news.map((n) => n.id);
    });
  };
  Menus.deleteSelected = () => {
    const ids = App.state.selected;
    if (!ids.length) return;
    App.mutate('删除图层', () => {
      const cc = App.comp();
      cc.layers = cc.layers.filter((l) => !ids.includes(l.id));
      cc.layers.forEach((l) => {
        if (ids.includes(l.parent)) l.parent = null;
        if (ids.includes(l.matte)) l.matte = null;
      });
    });
    App.state.selected = [];
  };
  Menus.moveSelected = (dir) => {
    const ids = App.state.selected;
    if (!ids.length) return;
    App.mutate('调整图层顺序', () => {
      const cc = App.comp();
      const idx = cc.layers.findIndex((l) => l.id === ids[0]);
      const j = idx + dir;
      if (j < 0 || j >= cc.layers.length) return;
      const t = cc.layers[idx];
      cc.layers[idx] = cc.layers[j];
      cc.layers[j] = t;
    });
  };
  Menus.selectAll = () => {
    App.state.selected = App.comp().layers.map((l) => l.id);
    App.notify();
    App.requestRender();
  };

  // 所选图层的当前时间裁剪：入点到当前时间
  Menus.trimToTime = (side) => {
    const ids = App.state.selected;
    App.mutate('裁剪图层', () => {
      ids.forEach((id) => {
        const l = App.layer(id);
        if (!l) return;
        const t = App.state.time;
        if (side === 'in' && t < l.outPoint) l.inPoint = t;
        if (side === 'out' && t > l.inPoint) l.outPoint = t;
      });
    });
  };

  // 关键帧：F9 缓入缓出 / 线性 / 定格（对曲线中选中的关键帧，或时间轴中的关键帧）
  Menus.keyEase = (kind) => {
    if (App.state.graphSel && App.state.selProp) return UI.graph.setInterp(kind);
    App.toast('请在曲线视图中选中一个关键帧');
  };
  Menus.jumpKey = (dir) => {
    const L = App.selectedLayer();
    if (!L) return;
    const c = App.comp();
    const times = [];
    const visit = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(visit);
      if (o.kind && o.id && 'v' in o) {
        if (o.animated) o.keys.forEach((k) => times.push(k.t + (L.startTime || 0)));
        return;
      }
      Object.keys(o).forEach((k) => visit(o[k]));
    };
    visit(L);
    const t = App.state.time;
    const eps = 1e-3;
    let target = null;
    if (dir > 0) {
      const cand = times.filter((x) => x > t + eps).sort((a, b) => a - b);
      target = cand[0];
    } else {
      const cand = times.filter((x) => x < t - eps).sort((a, b) => b - a);
      target = cand[0];
    }
    if (target !== undefined) App.setTime(target);
    void c;
  };
  // 复制 / 粘贴关键帧（选中的时间轴关键帧）
  let keyClip = null;
  Menus.copyKey = () => {
    if (UI.timeline.selectedKeys().length) return UI.timeline.copyKeys();
    const sp = App.state.selProp;
    const gs = App.state.graphSel;
    if (!sp || !gs) return App.toast('先选择一个关键帧');
    const L = App.layer(sp.layer);
    const p = L && UI.findProp(L, sp.prop);
    if (!p || !p.keys[gs.index]) return;
    keyClip = JSON.parse(JSON.stringify(p.keys[gs.index]));
    App.toast('已复制关键帧');
  };
  Menus.pasteKey = () => {
    if (UI.timeline.clip && UI.timeline.clip.length) return UI.timeline.pasteKeys();
    const sp = App.state.selProp;
    if (!sp || !keyClip) return App.toast('没有可粘贴的关键帧（先选属性并复制）');
    App.mutate('粘贴关键帧', () => {
      const L = App.layer(sp.layer);
      const p = UI.findProp(L, sp.prop);
      if (!p) return;
      const lt = App.state.time - (L.startTime || 0);
      if (!p.animated) Anim.enable(p, lt, p.v);
      const k = JSON.parse(JSON.stringify(keyClip));
      k.t = lt;
      Anim.setKey(p, lt, k.v);
      const nk = p.keys.find((x) => Math.abs(x.t - lt) < 1e-4);
      if (nk) Object.assign(nk, { inT: k.inT, outT: k.outT, inI: k.inI, inS: k.inS, outI: k.outI, outS: k.outS });
    });
  };

  // 所选图层：切换为三维
  const TOOL_HINT = {
    select: '选择工具：点击或拖动图层；拖动路径节点与手柄可编辑形状',
    anchor: '锚点工具：拖动选择框移动锚点（画面不动）',
    rect: '矩形工具：在画布上拖拽绘制矩形（Alt 无效；M 切换为蒙版）',
    ellipse: '椭圆工具：在画布上拖拽绘制椭圆（M 切换为蒙版）',
    pen: '钢笔工具：单击加节点，拖动设定切线；双击或回到起点结束，Esc 取消',
  };
  Menus.setTool = (t) => {
    if (App.state.tool === 'pen' && t !== 'pen') UI.viewer.cancelDraw();
    App.state.tool = t;
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    App.setStatus(TOOL_HINT[t] || '');
  };
  // 快捷键 P/S/T/A/Shift+R：展开所选图层并显示对应属性（即使没有关键帧）
  Menus.showProps = (labels) => {
    const id = App.state.selected[0];
    if (!id) return App.toast('先选择一个图层');
    App.state.expandedLayers[id] = true;
    App.state.propFocus = { layerId: id, labels };
    App.notify();
  };
  // 绘制目标：形状内容 / 蒙版
  Menus.toggleDrawTarget = () => {
    App.state.drawTarget = App.state.drawTarget === 'mask' ? 'content' : 'mask';
    App.setStatus('绘制目标：' + (App.state.drawTarget === 'mask' ? '蒙版（绘制到所选图层的蒙版）' : '形状内容（绘制到所选形状图层，无则新建）'));
    App.notify();
  };

  // ---------- 底部页签 ----------
  Menus.bottomTab = (tab) => {
    App.state.bottomTab = tab;
    document.querySelectorAll('#bottomBody > [data-tab]').forEach((el) => (el.hidden = el.dataset.tab !== tab));
    document.querySelectorAll('#bottomTabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'graph') UI.graph.full();
    if (tab === 'nodes') UI.nodes.full();
  };

  // ---------- 左侧项目面板 ----------
  function projectPanel() {
    const p = App.project;
    const comps = E('div', { class: 'list' }, App.project.comps.map((c) => {
      const cur = c.id === App.state.compId;
      return E('div', {
        class: 'lirow' + (cur ? ' on' : ''),
        onclick: () => App.setComp(c.id),
        ondblclick: () => {
          const inp = UI.textInput(c.name, (v) => App.mutate('重命名合成', () => (Model.findComp(App.project, c.id).name = v || c.name)));
          inp.focus();
        },
      }, [
        E('span', { class: 'ticon', text: '▣' }),
        E('span', { class: 'grow', text: c.name }),
        E('span', { class: 'muted small', text: c.width + '×' + c.height }),
        E('button', { class: 'mini', title: '复制合成', onclick: (e) => { e.stopPropagation(); App.mutate('复制合成', () => { const n = Model.cloneComp(c); App.project.comps.push(n); }); } }, '⧉'),
        E('button', { class: 'mini', title: '删除合成', onclick: (e) => { e.stopPropagation(); if (App.project.comps.length <= 1) return App.toast('至少保留一个合成'); App.mutate('删除合成', () => { App.project.comps = App.project.comps.filter((x) => x.id !== c.id); }); App.setComp(App.project.comps[0].id); } }, UI.ICON.x),
      ]);
    }));
    const graphs = E('div', { class: 'list' }, (p.graphs || []).map((g) => E('div', { class: 'lirow', onclick: () => { App.state.selectedGraph = g.id; Menus.bottomTab('nodes'); } }, [E('span', { class: 'ticon', text: '⬢' }), E('span', { class: 'grow', text: g.name }), E('span', { class: 'muted small', text: g.nodes.length + ' 节点' })])));
    return [
      E('div', { class: 'card' }, [
        E('div', { class: 'card-title', text: p.name }),
        E('div', { class: 'btns' }, [
          E('button', { class: 'btn small', onclick: () => App.load(Model.emptyProject()) }, '新建空工程'),
          E('button', { class: 'btn small', onclick: () => App.load(AE.Demo.build()) }, '载入示例'),
        ]),
      ]),
      E('div', { class: 'card' }, [E('div', { class: 'card-title', text: '合成' }), comps, E('button', { class: 'btn small', onclick: () => App.mutate('新建合成', () => { const n = Model.newComp({ name: '合成 ' + (App.project.comps.length + 1) }); App.project.comps.push(n); App.project.activeComp = n.id; }) }, '+ 新建合成')]),
      E('div', { class: 'card' }, [E('div', { class: 'card-title', text: '节点图' }), graphs.childNodes.length ? graphs : E('div', { class: 'muted small', text: '无节点图' }), E('button', { class: 'btn small', onclick: () => { Menus.bottomTab('nodes'); App.setStatus('在底部“节点”中新建节点图'); } }, '打开节点编辑器')]),
    ];
  }
  function newLayerGrid() {
    const items = [
      ['shape', '形状', '◇'], ['text', '文字', 'T'], ['null', '空对象', '○'], ['adjust', '调整', '◐'], ['camera', '摄像机', '🎥'], ['light', '平行光', '☀'], ['pointlight', '点光源', '✹'], ['geo', '三维几何', '⬢'], ['particles', '粒子', '✦'], ['sound', '音色', '♪'], ['precomp', '预合成', '▣'],
    ];
    return E('div', { class: 'grid2' }, items.map(([t, label, icon]) => E('button', { class: 'gbtn', title: '新建' + label, onclick: () => Menus.addLayer(t) }, [E('span', { class: 'gicon', text: icon }), E('span', { text: label })])));
  }
  function helpPanel() {
    const rows = [
      ['空格', '播放 / 暂停'],
      ['Home / End', '回到工作区起点 / 终点'],
      [', / .', '上一帧 / 下一帧'],
      ['J / K', '上一个 / 下一个关键帧'],
      ['F9', '选中关键帧缓入缓出（曲线视图）'],
      ['Ctrl+Z / Ctrl+Shift+Z', '撤销 / 重做'],
      ['Ctrl+D', '复制图层'],
      ['Delete', '删除图层'],
      ['Ctrl+Shift+C', '预合成所选图层'],
      ['Ctrl+A', '选择全部图层'],
      ['[ / ]', '裁剪入点 / 出点（到当前时间）'],
      ['Ctrl+C / Ctrl+V', '复制 / 粘贴关键帧'],
      ['Ctrl+S / Ctrl+O', '保存 / 打开工程'],
      ['Alt+拖动', '移动锚点（画布）'],
      ['Ctrl+Enter', '应用表达式'],
      ['Esc', '取消选择'],
    ];
    return E('div', { class: 'help' }, rows.map(([k, v]) => E('div', { class: 'hrow' }, [E('kbd', { text: k }), E('span', { text: v })])));
  }
  function assetsPanel() {
    return E('div', { class: 'help' }, [
      E('div', { class: 'card-title', text: '内置字体' }),
      ...Object.keys(AE.Text.FONTS).map((k) => E('div', { class: 'hrow' }, [E('span', { text: AE.Text.FONTS[k].label })])),
      E('div', { class: 'muted small', text: AE.Text.COVERAGE }),
      E('div', { class: 'card-title', text: '内置音色' }),
      E('div', { class: 'muted small', text: '锤击 · 火星 · 炉火底噪 · 音调（由 WebAudio 实时合成，参数可编辑）' }),
    ]);
  }
  function leftPanelRender() {
    UI.clear(leftBody);
    const map = { project: projectPanel, layers: () => [E('div', { class: 'card' }, [E('div', { class: 'card-title', text: '新建图层' }), newLayerGrid()])], assets: assetsPanel, help: helpPanel };
    const parts = (map[leftTab] || projectPanel)();
    (Array.isArray(parts) ? parts : [parts]).forEach((p) => leftBody.appendChild(p));
    UI.clear(leftTabs);
    [['project', '项目'], ['layers', '新建'], ['assets', '素材'], ['help', '快捷键']].forEach(([k, label]) => {
      leftTabs.appendChild(E('button', { class: 'tab' + (leftTab === k ? ' on' : ''), onclick: () => { leftTab = k; leftPanelRender(); } }, label));
    });
  }

  // ---------- 顶部菜单 ----------
  function topMenus() {
    const menus = document.getElementById('menus');
    const items = [
      ['文件', [
        ['新建空工程', () => App.load(Model.emptyProject())],
        ['载入示例（锻字）', () => App.load(AE.Demo.build())],
        ['打开工程…', () => openDialog()],
        ['保存工程…  Ctrl+S', () => App.saveFile()],
      ]],
      ['编辑', [
        ['撤销  Ctrl+Z', () => App.undo()],
        ['重做  Ctrl+Shift+Z', () => App.redo()],
        ['复制图层  Ctrl+D', () => Menus.duplicateSelected()],
        ['删除图层  Delete', () => Menus.deleteSelected()],
        ['全选图层  Ctrl+A', () => Menus.selectAll()],
        ['复制关键帧  Ctrl+C', () => Menus.copyKey()],
        ['粘贴关键帧  Ctrl+V', () => Menus.pasteKey()],
      ]],
      ['图层', [
        ['新建形状', () => Menus.addLayer('shape')],
        ['新建文字', () => Menus.addLayer('text')],
        ['新建空对象', () => Menus.addLayer('null')],
        ['新建调整图层', () => Menus.addLayer('adjust')],
        ['新建摄像机', () => Menus.addLayer('camera')],
        ['新建平行光', () => Menus.addLayer('light')],
        ['新建点光源', () => Menus.addLayer('pointlight')],
        ['新建三维几何', () => Menus.addLayer('geo')],
        ['新建粒子', () => Menus.addLayer('particles')],
        ['新建音色', () => Menus.addLayer('sound')],
        ['预合成所选  Ctrl+Shift+C', () => Props().precompose()],
        ['图层上移', () => Menus.moveSelected(-1)],
        ['图层下移', () => Menus.moveSelected(1)],
        ['裁剪入点到当前时间  [', () => Menus.trimToTime('in')],
        ['裁剪出点到当前时间  ]', () => Menus.trimToTime('out')],
      ]],
      ['动画', [
        ['缓入缓出 F9', () => Menus.keyEase('ease')],
        ['线性插值', () => Menus.keyEase('linear')],
        ['定格', () => Menus.keyEase('hold')],
        ['上一个关键帧  J', () => Menus.jumpKey(-1)],
        ['下一个关键帧  K', () => Menus.jumpKey(1)],
        ['打开表达式编辑', () => { App.state.rightTab = 'expr'; App.notify(); }],
      ]],
      ['合成', [
        ['合成设置', () => { App.state.rightTab = 'comp'; App.notify(); }],
        ['新建合成', () => App.mutate('新建合成', () => { const n = Model.newComp({ name: '合成 ' + (App.project.comps.length + 1) }); App.project.comps.push(n); App.project.activeComp = n.id; App.state.compId = n.id; })],
      ]],
      ['视图', [
        ['时间轴', () => Menus.bottomTab('timeline')],
        ['曲线视图', () => Menus.bottomTab('graph')],
        ['节点编辑器', () => Menus.bottomTab('nodes')],
        ['保存至本地（JSON）', () => App.saveFile()],
      ]],
    ];
    menus.innerHTML = '';
    items.forEach(([name, list]) => {
      const btn = E('div', { class: 'menu' }, [E('span', { class: 'mtitle', text: name }), E('div', { class: 'mpop' }, list.map(([label, fn]) => E('div', { class: 'mitem', onclick: (e) => { e.stopPropagation(); fn(); } }, label)))]);
      menus.appendChild(btn);
    });
    // 工具
    const tools = document.getElementById('tools');
    tools.innerHTML = '';
    [['select', '选择 (V)', '↖'], ['anchor', '锚点 (Y)', '⊕'], ['rect', '矩形 (R)', '▭'], ['ellipse', '椭圆 (E)', '◯'], ['pen', '钢笔 (G)', '✒']].forEach(([k, label, icon]) => {
      tools.appendChild(E('button', { class: 'tool tbtn' + (App.state.tool === k ? ' on' : ''), 'data-tool': k, title: label, onclick: () => Menus.setTool(k) }, icon));
    });
    const top = document.getElementById('topRight');
    top.innerHTML = '';
    top.appendChild(E('button', { class: 'btn small', onclick: () => App.undo(), title: 'Ctrl+Z' }, '↶ 撤销'));
    top.appendChild(E('button', { class: 'btn small', onclick: () => App.redo(), title: 'Ctrl+Shift+Z' }, '↷ 重做'));
    top.appendChild(E('button', { class: 'btn small', onclick: () => App.saveFile(), title: 'Ctrl+S' }, '保存'));
    top.appendChild(E('button', { class: 'btn small', onclick: () => openDialog(), title: 'Ctrl+O' }, '打开'));
    top.appendChild(E('button', { class: 'btn small primary', onclick: () => App.play(), title: '空格' }, '▶ 播放'));
  }
  function openDialog() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => inp.files[0] && App.openFile(inp.files[0]);
    inp.click();
  }

  // ---------- 快捷键 ----------
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  function onKey(e) {
    if (isTyping(e)) return;
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      return App.undo();
    }
    if ((mod && k.toLowerCase() === 'z' && e.shiftKey) || (mod && k.toLowerCase() === 'y')) {
      e.preventDefault();
      return App.redo();
    }
    if (mod && k.toLowerCase() === 'd') {
      e.preventDefault();
      return Menus.duplicateSelected();
    }
    if (mod && k.toLowerCase() === 'a') {
      e.preventDefault();
      return Menus.selectAll();
    }
    if (mod && e.shiftKey && k.toLowerCase() === 'c') {
      e.preventDefault();
      return Props().precompose();
    }
    if (mod && k.toLowerCase() === 'c') return Menus.copyKey();
    if (mod && k.toLowerCase() === 'v') return Menus.pasteKey();
    if (mod && k.toLowerCase() === 's') {
      e.preventDefault();
      return App.saveFile();
    }
    if (mod && k.toLowerCase() === 'o') {
      e.preventDefault();
      return openDialog();
    }
    if (mod) return;
    const c = App.comp();
    switch (k) {
      case ' ':
        e.preventDefault();
        App.play();
        break;
      case 'Home':
        App.setTime(c.workStart);
        break;
      case 'End':
        App.setTime(c.workEnd);
        break;
      case ',':
        App.setTime(App.state.time - 1 / c.fps);
        break;
      case '.':
        App.setTime(App.state.time + 1 / c.fps);
        break;
      case 'j':
      case 'J':
        Menus.jumpKey(-1);
        break;
      case 'k':
      case 'K':
        Menus.jumpKey(1);
        break;
      case 'F9':
        e.preventDefault();
        Menus.keyEase('ease');
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        // 有选中的关键帧时删除关键帧，否则删除图层
        if (!UI.timeline.deleteKeys()) Menus.deleteSelected();
        break;
      case '[':
        Menus.trimToTime('in');
        break;
      case ']':
        Menus.trimToTime('out');
        break;
      case 'Escape':
        if (UI.viewer.hasDrawing()) {
          UI.viewer.cancelDraw();
          App.requestRender();
          break;
        }
        App.state.selected = [];
        App.notify();
        App.requestRender();
        break;
      case 'Enter':
        if (UI.viewer.hasDrawing()) UI.viewer.finishPen();
        break;
      case 'v':
      case 'V':
        Menus.setTool('select');
        break;
      case 'y':
      case 'Y':
        Menus.setTool('anchor');
        break;
      case 'r':
      case 'R':
        // R 为矩形工具；Shift+R 显示旋转属性
        if (e.shiftKey) Menus.showProps(['旋转', 'X 旋转', 'Y 旋转']);
        else Menus.setTool('rect');
        break;
      case 'e':
      case 'E':
        Menus.setTool('ellipse');
        break;
      case 'g':
      case 'G':
        Menus.setTool('pen');
        break;
      case 'm':
      case 'M':
        Menus.toggleDrawTarget();
        break;
      case 'p':
      case 'P':
        Menus.showProps(['位置']);
        break;
      case 's':
      case 'S':
        Menus.showProps(['缩放']);
        break;
      case 't':
      case 'T':
        Menus.showProps(['不透明度']);
        break;
      case 'a':
      case 'A':
        Menus.showProps(['锚点']);
        break;
      default:
        break;
    }
  }

  Menus.init = () => {
    leftBody = document.getElementById('leftBody');
    leftTabs = document.getElementById('leftTabs');
    topMenus();
    document.addEventListener('keydown', onKey);
    UI.register({ full: () => leftPanelRender(), time: () => {}, values: () => {} });
    // 底部页签
    const bt = document.getElementById('bottomTabs');
    UI.clear(bt);
    [['timeline', '时间轴'], ['graph', '曲线'], ['nodes', '节点']].forEach(([k, label]) => {
      bt.appendChild(E('button', { class: 'tab', 'data-tab': k, onclick: () => Menus.bottomTab(k) }, label));
    });
    document.querySelectorAll('#bottomBody > div').forEach((el, i) => {
      el.dataset.tab = ['timeline', 'graph', 'nodes'][i];
    });
    Menus.bottomTab(App.state.bottomTab || 'timeline');
  };

  // 全部界面面板的初始化（由 App.init 调用）
  UI.init = () => {
    UI.props.init();
    UI.timeline.init();
    UI.graph.init();
    UI.viewer.init();
    UI.nodes.init();
    Menus.init();
  };
})();
