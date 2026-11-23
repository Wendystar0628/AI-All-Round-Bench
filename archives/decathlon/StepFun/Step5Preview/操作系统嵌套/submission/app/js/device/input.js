// ============================================================
// 输入设备：把原始指针与键盘事件分发给获得焦点的系统
// - 指针事件落在哪个系统窗口由 DOM 命中决定
// - 键盘只交给当前焦点系统，不触发其他系统快捷键
// - 跨层拖放：拖动幽灵 + 投放目标探测
// - 画布内文本输入通过隐藏输入框（IME）中转
// ============================================================

export class Input {
  constructor(host) {
    this.host = host;
    this.focus = null;          // systemId 或 'outer'
    this.ghost = null;
    this.ime = document.createElement('input');
    this.ime.className = 'sysime';
    this.ime.style.position = 'fixed';
    this.ime.style.opacity = '0';
    this.ime.style.zIndex = '10001';
    this.ime.style.width = '1px'; this.ime.style.height = '1px';
    this.ime.style.border = 'none'; this.ime.style.padding = '0';
    document.body.appendChild(this.ime);
    this.imeTarget = null;
    this.bind();
  }

  bind() {
    const root = document.getElementById('desktop') || document.body;
    root.addEventListener('pointerdown', (e) => this.onDown(e), true);
    window.addEventListener('pointermove', (e) => this.onMove(e), true);
    window.addEventListener('pointerup', (e) => this.onUp(e), true);
    root.addEventListener('wheel', (e) => this.onWheel(e), { passive: false, capture: true });
    root.addEventListener('contextmenu', (e) => { if (e.target.closest('.sysview')) e.preventDefault(); });
    window.addEventListener('keydown', (e) => this.onKeyDown(e), true);
    this.ime.addEventListener('input', () => this.onIme());
    this.ime.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') { this.pushKey(e.key, ''); this.ime.value = ''; this.ime.blur(); }
      else if (e.key === 'Backspace') { this.pushKey('Backspace', ''); }
      e.stopPropagation(); e.preventDefault();
    });
    this.ime.addEventListener('compositionend', () => { this.pushKey('', this.ime.value); this.ime.value = ''; });
  }

  systemOf(target) {
    const el = target.closest ? target.closest('.sysview') : null;
    if (el) return el.dataset.sys;
    if (target.closest && target.closest('#desktop')) return 'outer';
    return null;
  }

  localPt(e, sysId) {
    if (sysId === 'outer') return { x: e.clientX, y: e.clientY };
    const v = this.host.view2d.views.get(sysId);
    if (!v) return null;
    const r = v.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  setFocus(sysId) {
    if (this.focus === sysId) return;
    if (this.focus && this.focus !== 'outer') {
      const s = this.host.systems.get(this.focus);
      if (s) s.pushInbox({ t: 'focus', on: 0 });
    }
    this.focus = sysId;
    if (sysId && sysId !== 'outer') {
      const s = this.host.systems.get(sysId);
      if (s) s.pushInbox({ t: 'focus', on: 1 });
    }
    this.host.emit('focus', sysId);
  }

  onDown(e) {
    const sysId = this.systemOf(e.target);
    if (!sysId) return;
    this.setFocus(sysId);
    if (sysId === 'outer') { this.hideIme(); return; }
    const p = this.localPt(e, sysId);
    const s = this.host.systems.get(sysId);
    if (!s || !p) return;
    this.hideIme();
    (s._inputQueue = s._inputQueue || []).push({ t: 'down', x: p.x, y: p.y, btn: e.button === 2 ? 2 : 1 });
  }

  onMove(e) {
    const d = this.host.drag;
    if (d && this.ghost) {
      this.ghost.style.left = (e.clientX + 8) + 'px';
      this.ghost.style.top = (e.clientY + 8) + 'px';
      const t = this.dropTarget(e);
      this.ghost.style.borderColor = t ? '#43d9a3' : '#8b6cff';
    }
    const sysId = this.systemOf(e.target);
    if (!sysId || sysId === 'outer') return;
    const p = this.localPt(e, sysId);
    const s = this.host.systems.get(sysId);
    if (!s || !p) return;
    (s._inputQueue = s._inputQueue || []).push({ t: 'move', x: p.x, y: p.y });
    if ((s._inputQueue || []).length > 60) s._inputQueue.shift();
  }

  onUp(e) {
    const d = this.host.drag;
    if (d) {
      const t = this.dropTarget(e);
      this.host.endDrag();
      if (t && t.systemId !== d.systemId) {
        const sys = this.host.systems.get(t.systemId);
        if (sys) sys.pushInbox({ t: 'drop_request', from: d.systemId, path: d.path, name: d.name });
      }
      return;
    }
    const sysId = this.systemOf(e.target);
    if (!sysId || sysId === 'outer') return;
    const p = this.localPt(e, sysId);
    const s = this.host.systems.get(sysId);
    if (!s || !p) return;
    (s._inputQueue = s._inputQueue || []).push({ t: 'up', x: p.x, y: p.y });
  }

  onWheel(e) {
    const sysId = this.systemOf(e.target);
    if (!sysId || sysId === 'outer') return;
    e.preventDefault();
    const p = this.localPt(e, sysId);
    const s = this.host.systems.get(sysId);
    if (!s || !p) return;
    (s._inputQueue = s._inputQueue || []).push({ t: 'wheel', x: p.x, y: p.y, dx: e.deltaX, dy: e.deltaY });
  }

  onKeyDown(e) {
    if (document.activeElement === this.ime) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const sysId = this.focus;
    if (!sysId || sysId === 'outer') return;
    const s = this.host.systems.get(sysId);
    if (!s) return;
    const key = e.key.length === 1 ? '' : e.key;
    this.pushKey(key, e.key.length === 1 ? e.key : '');
    e.preventDefault(); e.stopPropagation();
  }

  pushKey(key, text) {
    const sysId = this.imeTarget || this.focus;
    if (!sysId || sysId === 'outer') return;
    const s = this.host.systems.get(sysId);
    if (!s) return;
    (s._inputQueue = s._inputQueue || []).push({ t: 'key', key, text });
  }

  onIme() {
    if (!this.imeTarget) return;
    const v = this.ime.value;
    this.ime.value = '';
    if (v) this.pushKey('', v);
  }

  showIme(sysId, x, y) {
    this.imeTarget = sysId;
    this.ime.style.left = x + 'px'; this.ime.style.top = y + 'px';
    this.ime.focus({ preventScroll: true });
  }
  hideIme() { this.imeTarget = null; this.ime.blur(); }

  dropTarget(e) {
    // 探测指针下的系统窗口（优先文件管理器窗口的当前目录）
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sysEl = el && el.closest ? el.closest('.sysview') : null;
    if (sysEl) {
      const sys = this.host.systems.get(sysEl.dataset.sys);
      if (sys && sys.frame2d) {
        const v = this.host.view2d.views.get(sys.id);
        const r = v.el.getBoundingClientRect();
        const lx = e.clientX - r.left, ly = e.clientY - r.top;
        for (const w of sys.frame2d.wins || []) {
          if (w.min === 1) continue;
          if (lx >= w.x && lx <= w.x + w.w && ly >= w.y && ly <= w.y + w.h && w.meta && w.meta.path) {
            return { systemId: sys.id, dir: w.meta.path, winId: w.id };
          }
        }
        return { systemId: sys.id, dir: null };
      }
      return { systemId: sysEl.dataset.sys, dir: null };
    }
    // 根桌面文件管理器窗口
    const rootWin = el && el.closest ? el.closest('[data-rootpath]') : null;
    if (rootWin) return { systemId: 'outer', dir: rootWin.dataset.rootpath };
    return null;
  }

  showGhost(name) {
    if (!this.ghost) {
      this.ghost = document.createElement('div');
      this.ghost.className = 'dragghost';
      this.ghost.style.position = 'fixed';
      this.ghost.style.zIndex = '10002';
      this.ghost.style.pointerEvents = 'none';
      this.ghost.style.padding = '4px 10px';
      this.ghost.style.borderRadius = '6px';
      this.ghost.style.background = 'rgba(28,36,51,0.92)';
      this.ghost.style.color = '#e8ecf4';
      this.ghost.style.font = '12px "Microsoft YaHei", sans-serif';
      this.ghost.style.border = '1px solid #8b6cff';
      document.body.appendChild(this.ghost);
    }
    this.ghost.textContent = name;
    this.ghost.style.display = 'block';
  }
  hideGhost() { if (this.ghost) this.ghost.style.display = 'none'; }
}
