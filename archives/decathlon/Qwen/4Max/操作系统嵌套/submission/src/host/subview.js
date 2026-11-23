'use strict';
// 子系统桌面视图：把内核/窗口管理程序提交的显示列表呈现为可操作桌面。
// 子桌面裁剪在父系统窗口内；输入经内核→窗口管理程序分发。
const { d2, device3d } = require('./device.js');

const TITLE_H = 34;

class Subview {
  constructor(os, inst, mountEl) {
    this.os = os;
    this.inst = inst;
    inst.surface = this;
    this.mountEl = mountEl;
    this.el = document.createElement('div');
    this.el.className = 'sub-desktop';
    this.el.dataset.systemId = inst.id;
    this.el.dataset.testid = 'os-desktop';
    this.base = document.createElement('canvas');
    this.base.className = 'sub-base';
    this.winLayer = document.createElement('div');
    this.winLayer.className = 'sub-windows';
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'sub-overlay';
    this.errorEl = document.createElement('div');
    this.errorEl.className = 'sub-error';
    this.errorEl.style.display = 'none';
    this.el.append(this.base, this.winLayer, this.overlay, this.errorEl);
    mountEl.appendChild(this.el);
    this.winEls = new Map();
    this.lastWindowsSig = '';
    this.lastBaseV = -1; this.lastOverlayV = -1;
    this.contentVersions = new Map();
    this.dragging = false;
    this.bindInput();
    os.device.registerView(this);
    this.resizeCanvases();
  }

  resizeCanvases() {
    const r = this.el.getBoundingClientRect();
    const vw = this.inst.viewport.w, vh = this.inst.viewport.h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sx = r.width > 0 ? (r.width / vw) : 1;
    const sy = r.height > 0 ? (r.height / vh) : 1;
    this.scaleX = sx * dpr; this.scaleY = sy * dpr;
    for (const cv of [this.base, this.overlay]) {
      cv.width = Math.max(8, Math.round(vw * this.scaleX));
      cv.height = Math.max(8, Math.round(vh * this.scaleY));
    }
    this.lastBaseV = -1; this.lastOverlayV = -1;
    this.contentVersions.clear();
  }

  bindInput() {
    const toLocal = e => {
      const r = this.el.getBoundingClientRect();
      const vw = this.inst.viewport.w, vh = this.inst.viewport.h;
      return {
        x: (e.clientX - r.left) / (r.width / vw),
        y: (e.clientY - r.top) / (r.height / vh)
      };
    };
    const send = (kind, e, extra) => {
      const p = toLocal(e);
      this.inst.input(Object.assign({ kind, x: p.x, y: p.y, button: e.button || 0, buttons: e.buttons || 0, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey }, extra || {}));
    };
    this.el.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.el.setPointerCapture(e.pointerId);
      this.dragging = true;
      send('pointer_down', e);
      this.os.desktop.noteSubsystemPointer(this.inst);
    });
    this.el.addEventListener('pointermove', e => {
      if (this.dragging || e.buttons === 0) send('pointer_move', e);
    });
    this.el.addEventListener('pointerup', e => {
      this.dragging = false;
      send('pointer_up', e);
    });
    this.el.addEventListener('pointercancel', e => { this.dragging = false; send('pointer_up', e); });
    this.el.addEventListener('dblclick', e => { send('dblclick', e); });
    this.el.addEventListener('wheel', e => {
      e.preventDefault();
      send('wheel', e, { dx: e.deltaX, dy: e.deltaY });
    }, { passive: false });
    this.el.addEventListener('contextmenu', e => e.preventDefault());
  }

  layout(windows) {
    const sig = JSON.stringify(windows.map(w => [w.id, w.x, w.y, w.w, w.h, w.z, w.minimized, w.maximized, w.kind, w.childId, w.projId]));
    if (sig === this.lastWindowsSig) return;
    this.lastWindowsSig = sig;
    const seen = new Set();
    const vw = this.inst.viewport.w, vh = this.inst.viewport.h;
    for (const w of windows) {
      seen.add(w.id);
      let rec = this.winEls.get(w.id);
      if (!rec) {
        const el = document.createElement('div');
        el.className = 'sub-window-content';
        el.dataset.windowId = String(w.id);
        el.dataset.appId = w.appId || '';
        let canvas = null;
        if (w.kind === 'system' && w.childId) {
          const child = this.os.instances.get(w.childId);
          if (child) {
            if (!child.surface) new Subview(this.os, child, el);
            else { child.surface.mountEl.appendChild(child.surface.el); child.surface.resizeCanvases(); }
          }
        } else if (w.kind === 'projection') {
          canvas = document.createElement('canvas');
          canvas.className = 'sub-content-canvas';
          el.appendChild(canvas);
          el.dataset.sourceSystemId = w.sourceSystemId || '';
          el.dataset.sourceWindowId = String(w.sourceWindowId || '');
          el.dataset.sourceAppId = w.sourceAppId || '';
        } else {
          canvas = document.createElement('canvas');
          canvas.className = 'sub-content-canvas';
          el.appendChild(canvas);
        }
        this.winLayer.appendChild(el);
        rec = { el, canvas, kind: w.kind };
        this.winEls.set(w.id, rec);
      }
      const x = w.maximized ? 0 : w.x;
      const y = w.maximized ? 0 : w.y;
      const ww = w.maximized ? vw : w.w;
      const wh = w.maximized ? vh : w.h;
      rec.el.style.left = x + 'px';
      rec.el.style.top = (y + TITLE_H) + 'px';
      rec.el.style.width = ww + 'px';
      rec.el.style.height = Math.max(0, wh - TITLE_H) + 'px';
      rec.el.style.zIndex = String(10 + (w.z || 0));
      rec.el.style.display = w.minimized ? 'none' : '';
      rec.el.style.pointerEvents = 'none';
      if (w.kind === 'system' && w.childId) {
        const child = this.os.instances.get(w.childId);
        if (child) {
          const cw = ww, ch = Math.max(60, wh - TITLE_H);
          if (child.viewport.w !== cw || child.viewport.h !== ch) child.resize(cw, ch);
          if (child.surface) child.surface.resizeCanvases();
        }
      } else if (rec.canvas) {
        const cw = ww, ch = Math.max(1, wh - TITLE_H);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (rec.canvas.width !== Math.round(cw * dpr) || rec.canvas.height !== Math.round(ch * dpr)) {
          rec.canvas.width = Math.max(8, Math.round(cw * dpr));
          rec.canvas.height = Math.max(8, Math.round(ch * dpr));
          this.contentVersions.delete(w.id);
        }
        rec.cw = cw; rec.ch = ch; rec.dpr = dpr;
      }
    }
    for (const [id, rec] of Array.from(this.winEls.entries())) {
      if (!seen.has(id)) {
        if (rec.kind === 'system') {
          // 子桌面随窗口关闭销毁
          const w = this.inst.windows.find(x => x.id === id);
        }
        rec.el.remove();
        this.winEls.delete(id);
        this.contentVersions.delete(id);
      }
    }
    this.lastBaseV = -1;
  }

  wallpaper(ctx, vw, vh) {
    const depth = this.inst.depth;
    const hues = [258, 275, 292, 310, 230];
    const hue = hues[(depth - 2) % hues.length];
    const g = ctx.createLinearGradient(0, 0, vw * 0.3, vh);
    g.addColorStop(0, `hsl(${hue}, 42%, 13%)`);
    g.addColorStop(0.55, `hsl(${hue + 14}, 38%, 17%)`);
    g.addColorStop(1, `hsl(${hue + 30}, 34%, 11%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // 网格点
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    for (let x = 20; x < vw; x += 34) for (let y = 20; y < vh; y += 34) ctx.fillRect(x, y, 1.5, 1.5);
    // 层級水印
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.min(vh * 0.5, 300) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('L' + depth, vw - 24, vh - 8);
    ctx.restore();
    // 远山装饰
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = `hsl(${hue + 40}, 50%, 40%)`;
    ctx.beginPath();
    ctx.moveTo(0, vh);
    for (let x = 0; x <= vw; x += 24) {
      ctx.lineTo(x, vh - 60 - Math.sin(x * 0.011 + depth) * 34 - Math.sin(x * 0.03) * 12);
    }
    ctx.lineTo(vw, vh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  render(device) {
    const inst = this.inst;
    const vw = inst.viewport.w, vh = inst.viewport.h;
    if (this.el.clientWidth === 0) return;
    // 基础层：壁纸 + WM 提交
    const wmSub = this.findWmSub(device);
    const baseV = wmSub ? wmSub.version : -2;
    if (baseV !== this.lastBaseV || this._sizeChanged()) {
      this.lastBaseV = baseV;
      const ctx = this.base.getContext('2d');
      ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      this.wallpaper(ctx, vw, vh);
      if (wmSub && wmSub.base) d2.renderList(ctx, wmSub.base, { blinkOn: device.blinkOn });
    }
    // 窗口内容
    for (const w of inst.windows) {
      if (w.minimized) continue;
      const rec = this.winEls.get(w.id);
      if (!rec || !rec.canvas) continue;
      let sub = null, projSrc = null;
      if (w.kind === 'projection') {
        const proj = this.os.projections.get(w.projId);
        if (proj) {
          projSrc = proj;
          sub = device.peekSub(proj.sourceSystemId, proj.sourcePid);
        }
      } else {
        sub = device.peekSub(inst.id, w.ownerPid);
      }
      const v = sub ? sub.version : -1;
      const sceneV = this.sceneVersion(inst, w, sub, projSrc);
      const key = v + ':' + sceneV + ':' + (device.blinkOn ? 1 : 0);
      if (this.contentVersions.get(w.id) === key) continue;
      this.contentVersions.set(w.id, key);
      const ctx = rec.canvas.getContext('2d');
      ctx.setTransform(rec.dpr, 0, 0, rec.dpr, 0, 0);
      ctx.clearRect(0, 0, rec.cw, rec.ch);
      ctx.fillStyle = '#12152a';
      ctx.fillRect(0, 0, rec.cw, rec.ch);
      if (sub && sub.content) {
        d2.renderList(ctx, sub.content, {
          blinkOn: device.blinkOn,
          render3d: (it, c) => device.render3dOp(it, c)
        });
      }
      if (w.kind === 'projection' && projSrc && this.os.projectionPaused(projSrc.id)) {
        ctx.save();
        ctx.fillStyle = 'rgba(10,12,24,0.55)';
        ctx.fillRect(0, 0, rec.cw, rec.ch);
        ctx.fillStyle = '#f5b942';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('源系统已暂停 · 内容冻结', rec.cw / 2, rec.ch / 2);
        ctx.restore();
      }
    }
    // 覆盖层
    const ovV = wmSub ? wmSub.version : -2;
    if (ovV !== this.lastOverlayV || this._sizeChanged()) {
      this.lastOverlayV = ovV;
      const ctx = this.overlay.getContext('2d');
      ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      if (wmSub && wmSub.overlay) d2.renderList(ctx, wmSub.overlay, { blinkOn: device.blinkOn });
    }
    this._lastW = this.el.clientWidth; this._lastH = this.el.clientHeight;
  }
  _sizeChanged() {
    return this._lastW !== this.el.clientWidth || this._lastH !== this.el.clientHeight;
  }
  sceneVersion(inst, w, sub, projSrc) {
    // 三维内容随提交变化
    let v = 0;
    const sysId = projSrc ? projSrc.sourceSystemId : inst.id;
    const m = this.os.device.scenes.get(sysId);
    if (m) for (const h of m.keys()) v += device3d.frameTime(h) * 1000 + (device3d.getState(h) ? 1 : 0);
    return Math.round(v * 100);
  }
  findWmSub(device) {
    // 窗口管理器是提交 base 层的进程
    for (const [k, s] of device.subs.entries()) {
      if (k.startsWith(this.inst.id + ':') && s.base) return s;
    }
    return null;
  }
  showError(msg) {
    this.errorEl.style.display = 'flex';
    this.errorEl.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'sub-error-box';
    box.dataset.testid = 'kernel-error';
    box.dataset.systemId = this.inst.id;
    const t = document.createElement('div');
    t.className = 'sub-error-title';
    t.textContent = '内核错误 · ' + this.inst.name;
    const m = document.createElement('div');
    m.className = 'sub-error-msg';
    m.textContent = msg;
    const hint = document.createElement('div');
    hint.className = 'sub-error-hint';
    hint.textContent = '该子系统已停止。可在父系统“系统管理”中修改内核源文件后重启，父系统与兄弟系统不受影响。';
    box.append(t, m, hint);
    this.errorEl.appendChild(box);
  }
  clearError() { this.errorEl.style.display = 'none'; this.errorEl.innerHTML = ''; }
  destroy() {
    this.os.device.unregisterView(this);
    for (const [, rec] of this.winEls) {
      if (rec.kind === 'system') {
        // 子实例由 os.stopInstance 处理
      }
    }
    this.el.remove();
  }
}

module.exports = { Subview, TITLE_H };
