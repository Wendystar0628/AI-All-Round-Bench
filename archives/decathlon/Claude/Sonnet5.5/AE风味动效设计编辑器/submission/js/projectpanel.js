/* projectpanel.js — 项目面板：合成列表、工程信息、示例 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, Model = AE.Model, App = AE.App, UI = AE.UI, Actions = AE.Actions;
  const h = UI.h; const P = AE.Project = {};
  let host, body;
  P.init = (el) => {
    host = el; host.innerHTML = ''; host.append(h('div', { class: 'phead' }, h('span', { class: 'title', text: '项目' })));
    body = h('div', { class: 'pbody scroll' }); host.append(body);
    let pend = false; const defer = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; P.rebuild(); }); };
    App.on('struct', defer); App.on('comp', defer); App.on('select', defer); P.rebuild();
  };
  P.rebuild = () => {
    body.innerHTML = ''; const p = App.project;
    body.append(h('div', { class: 'kv' }, h('label', { text: '工程名' }), h('input', { type: 'text', value: p.name, onchange: e => App.edit('工程名', () => { p.name = e.target.value || p.name; }, 'values') })));
    body.append(h('div', { class: 'proj-sec' }, h('span', { text: '合成' }), h('span', null, h('button', { class: 'btn sm', text: '+', title: '新建合成', onclick: () => UI.compDialog(null) }))));
    const list = h('div', { class: 'proj-list' });
    for (const c of p.comps) {
      list.append(h('div', { class: 'proj-item' + (c.id === p.active ? ' on' : ''), title: `${c.w}×${c.h} @${c.fps}fps · ${c.dur}s · ${c.layers.length} 层`, onclick: () => App.setComp(c.id), ondblclick: () => UI.compDialog(c), oncontextmenu: e => { e.preventDefault(); UI.menu([{ label: '设为当前合成', fn: () => App.setComp(c.id) }, { label: '合成设置…', fn: () => UI.compDialog(c) }, { label: '作为预合成图层加入当前合成', disabled: c.id === App.comp.id, fn: () => { Actions.newLayer('precomp', { comp: c.id }); } }, { label: '删除', fn: () => Actions.deleteComp(c.id) }], e.clientX, e.clientY); } }, h('span', { class: 'ico', text: '▣' }), h('span', { text: c.name, style: { flex: 1 } }), h('span', { class: 'muted', text: c.layers.length + ' 层' })));
    }
    body.append(list);
    body.append(h('div', { class: 'proj-sec' }, h('span', { text: '当前合成' })));
    const c = App.comp; body.append(h('div', { class: 'kv' }, h('label', { text: '尺寸' }), h('span', { text: `${c.w} × ${c.h}`, style: { color: 'var(--cy)' } }), h('label', { text: '帧率/时长' }), h('span', { text: `${c.fps} fps / ${c.dur}s` }), h('label', { text: '图层数' }), h('span', { text: String(c.layers.length) }), h('label', { text: '节点数' }), h('span', { text: String(p.graph.nodes.length) })));
    body.append(h('div', { class: 'proj-sec' }, h('span', { text: '工程' })));
    body.append(h('div', { style: { padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', text: '新建', onclick: () => App.newProject() }), h('button', { class: 'btn sm', text: '打开…', onclick: () => App.openFile() }), h('button', { class: 'btn sm', text: '保存…', onclick: () => App.saveFile() }), h('button', { class: 'btn sm on', text: '载入示例「锻字」', onclick: () => App.loadDemo() })));
    body.append(h('div', { class: 'proj-sec' }, h('span', { text: '字体' })));
    body.append(h('div', { style: { padding: '2px 8px 8px', color: 'var(--txt2)', lineHeight: 1.7 } }, '内置「锻造黑」笔画字体（' + AE.Font.strokeChars.length + ' 字，可转为几何）。其他字符使用系统字体轮廓。', h('div', null, h('button', { class: 'btn sm', text: '字体与字符范围', onclick: () => UI.fontInfo() }))));
  };
})();
