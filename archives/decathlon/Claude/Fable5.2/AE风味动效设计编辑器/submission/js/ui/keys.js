// 快捷键（AE 习惯）。在输入文字、数值或表达式时不抢占输入
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, C = MF.Cmd;

  function typing(e) { const t = e.target; if (!t || !t.tagName) return false; const tag = t.tagName; if (tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return true; if (tag === 'INPUT') { const ty = (t.type || '').toLowerCase(); if (ty === 'checkbox' || ty === 'color' || ty === 'range' || ty === 'button') return false; return !t.readOnly; } return false; }
  const K = (MF.Keys = {
    spaceUsed: false,
    init() { window.addEventListener('keydown', K.down, true); window.addEventListener('keyup', K.up, true); window.addEventListener('blur', () => { MF.Viewport.space = false; }); },
    // 删除：路径顶点 > 关键帧 > 节点/连线 > 图层
    del() {
      if (MF.NodeView && MF.NodeView.focused) { if (MF.NodeView.del()) return; }
      if (MF.Tools.deleteSubPoints()) return;
      if (App.sel.keys.length && C.deleteKeys()) return;
      if (App.sel.pin) { const c = App.comp(); for (const id of App.sel.nodes) { const n = MF.Nodes.findDeep(c, id); if (n && n.pins && n.pins.some((p) => p.id === App.sel.pin)) { App.edit('删除图钉', () => { n.pins = n.pins.filter((p) => p.id !== App.sel.pin); }); App.sel.pin = null; return; } } }
      if (MF.NodeView && MF.NodeView.del()) return;
      if (App.sel.layers.length) C.deleteLayers();
    },
    up(e) { if (e.code === 'Space') { const was = MF.Viewport.space; MF.Viewport.space = false; if (was && !K.spaceUsed && !typing(e)) { App.toggle(); e.preventDefault(); } MF.Viewport.ov.style.cursor = 'default'; } },
    down(e) {
      if (App.exporting) return;
      const ctrl = e.ctrlKey || e.metaKey, sh = e.shiftKey, alt = e.altKey, k = e.key, code = e.code;
      if (document.querySelector('.modal-bg')) { if (k === 'Escape') document.querySelector('.modal-bg').remove(); return; }
      if (typing(e)) return; // 不抢占输入
      if (k === 'Escape') { MF.W.closeMenus(); if (MF.Tools.penState) { MF.Tools.penFinish(); return; } if (App.tool !== 'select') { MF.Tools.setTool('select'); return; } if (App.sel.keys.length) { App.selectKeys([]); return; } return; }
      const done = () => { e.preventDefault(); e.stopPropagation(); };
      const c = App.comp(); const nodeFocus = MF.NodeView && MF.NodeView.focused;
      if (code === 'Space') { done(); if (!e.repeat) { MF.Viewport.space = true; K.spaceUsed = false; } return; }
      // ---- Ctrl 组合 ----
      if (ctrl) {
        const kk = k.toLowerCase();
        if (kk === 'z') { done(); if (sh) App.redo(); else App.undo(); return; }
        if (kk === 'y') { done(); App.redo(); return; }
        if (kk === 's') { done(); App.save(); return; }
        if (kk === 'o') { done(); App.open(); return; }
        if (kk === 'n' && !alt) { done(); MF.Shell.compDialog(null); return; }
        if (kk === 'k') { done(); if (c) MF.Shell.compDialog(c); return; }
        if (kk === 'c' && sh) { done(); MF.Shell.precomposeDialog(); return; }
        if (kk === 'c') { done(); C.copy(); return; }
        if (kk === 'v') { done(); C.paste(); return; }
        if (kk === 'x') { done(); C.copy(); K.del(); return; }
        if (kk === 'd') { done(); if (nodeFocus && App.sel.nodes.length) MF.NodeView.duplicate(); else C.duplicateLayers(); return; }
        if (kk === 'a') { done(); C.selectAll(); return; }
        if (kk === 'g') { done(); if (sh) MF.NodeView.ungroup(); else MF.NodeView.group(); return; }
        if (kk === 't' && alt) { done(); const L = App.selLayers().find((l) => l.type === 'precomp'); if (L) C.enableRemap(L); return; }
        if (kk === 't' && !alt) { done(); MF.Tools.setTool('text'); return; }
        if (kk === 'p') { done(); MF.Tools.setTool('pin'); return; }
        if (kk === 'h' && alt) { done(); C.ease('hold'); return; }
        if (code === 'BracketRight') { done(); C.moveLayers(sh ? 'top' : 'up'); return; }
        if (code === 'BracketLeft') { done(); C.moveLayers(sh ? 'bottom' : 'down'); return; }
        if (k === 'F9' && sh) { done(); C.ease('easeOut'); return; }
        if (alt && sh && kk === 'y') { done(); C.addLayer('null'); return; }
        if (alt && !sh && kk === 'y') { done(); C.addLayer('adjust'); return; }
        if (alt && sh && kk === 't') { done(); C.addLayer('text'); return; }
        if (alt && sh && kk === 'c') { done(); C.addLayer('camera'); return; }
        if (alt && sh && kk === 'l') { done(); C.addLayer('light', { kind: 'parallel', name: '平行光' }); return; }
        return;
      }
      // ---- 功能键 ----
      if (k === 'F9') { done(); C.ease(sh ? 'easeIn' : 'ease'); return; }
      if (k === 'F2') { done(); App.selectLayers([]); App.selectNodes([]); return; }
      if (k === 'F1') { done(); MF.Shell.keysDialog(); return; }
      if (k === 'Delete' || k === 'Backspace') { done(); K.del(); return; }
      if (k === 'Enter') { const L = App.selLayers()[0]; if (L && MF.Timeline) { const r = MF.Timeline.rows.find((x) => x.kind === 'layer' && x.L === L); if (r && r.el) { done(); MF.Timeline.rename(L, r.el.querySelector('.nm')); } } return; }
      if (!c) return;
      const fps = c.fps;
      if (k === 'PageDown' || (code === 'ArrowRight' && ctrl)) { done(); App.step(sh ? 10 : 1); return; }
      if (k === 'PageUp') { done(); App.step(sh ? -10 : -1); return; }
      if (k === 'Home') { done(); App.pause(); App.setTime(0); return; }
      if (k === 'End') { done(); App.pause(); App.setTime(c.duration - 1 / fps); return; }
      if (k.startsWith('Arrow')) { const ls = App.selLayers().filter((l) => !l.locked && l.type !== 'audio'); if (!ls.length) return; done(); const d = sh ? 10 : 1; const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0; const m = MF.Schema.transform[1]; App.edit('微移图层', () => { for (const L of ls) { const p = MF.Anim.value(L.tr.position, App.time, m); App.setProp(L.tr.position, m, [p[0] + dx, p[1] + dy, p[2] || 0]); } }); return; }
      const kk = k.toLowerCase();
      if (alt && sh && 'psrta'.includes(kk) && kk.length === 1) { done(); const key = { p: 'position', s: 'scale', r: 'rotation', t: 'opacity', a: 'anchor' }[kk]; const m = MF.Schema.transform.find((x) => x.key === key); const ls = App.selLayers(); if (ls.length) App.edit('添加关键帧', () => { for (const L of ls) { const p = L.tr[key]; if (!p.k) p.k = []; MF.Anim.setValue(p, App.time, MF.Anim.value(p.k.length ? p : { v: p.v }, App.time, m), m); } }); C.soloProp(kk); return; }
      if (code === 'BracketLeft') { done(); if (alt) C.trimIn(); else C.moveInTo(); return; }
      if (code === 'BracketRight') { done(); if (alt) C.trimOut(); else C.moveOutTo(); return; }
      if (alt) return;
      if (code === 'Backquote') { done(); MF.Shell.maximize(sh ? 'timeline' : 'viewer'); return; }
      if (code === 'Slash' && sh) { done(); MF.Viewport.fit(); return; }
      if (code === 'Equal') { done(); MF.Timeline.setZoom(MF.Timeline.zoom * 1.4); return; }
      if (code === 'Minus') { done(); MF.Timeline.setZoom(MF.Timeline.zoom / 1.4); return; }
      if (code === 'Period') { done(); MF.Viewport.setZoom(App.view.scale * 1.25); return; }
      if (code === 'Comma') { done(); MF.Viewport.setZoom(App.view.scale / 1.25); return; }
      switch (kk) {
        case 'j': done(); C.jumpKey(-1); break; case 'k': done(); C.jumpKey(1); break;
        case 'b': done(); C.setWorkArea('in'); break; case 'n': done(); C.setWorkArea('out'); break;
        case 'i': { const L = App.selLayers()[0]; if (L) { done(); App.pause(); App.setTime(L.in); } break; }
        case 'o': { const L = App.selLayers()[0]; if (L) { done(); App.pause(); App.setTime(L.out - 1 / fps); } break; }
        case 'u': done(); C.revealAnimated(); break;
        case 'p': case 's': case 'r': case 't': case 'a': if (App.sel.layers.length) { done(); C.soloProp(kk); } break;
        case 'v': done(); MF.Tools.setTool('select'); break; case 'h': done(); MF.Tools.setTool('hand'); break; case 'z': done(); MF.Tools.setTool('zoom'); break;
        case 'w': done(); MF.Tools.setTool('rotate'); break; case 'y': done(); MF.Tools.setTool('anchor'); break; case 'c': done(); MF.Tools.setTool('camera'); break;
        case 'q': done(); MF.Tools.setTool(App.tool === 'rect' ? 'ellipse' : App.tool === 'ellipse' ? 'star' : 'rect'); break; case 'g': done(); MF.Tools.setTool('pen'); break;
        case 'l': done(); App.loop = !App.loop; App.toast(App.loop ? '循环工作区：开' : '循环工作区：关'); MF.Shell.refreshTop(); break;
        default: break;
      }
    },
  });
})();
