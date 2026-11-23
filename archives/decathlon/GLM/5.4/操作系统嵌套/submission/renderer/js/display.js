// ===========================================================================
//  display.js —— 显示设备
//  接收程序提交的二维图形与三维场景，按提交内容和时刻绘制。
//  · 每个系统实例有独立的缓冲区集合；窗口管理器的桌面上可以 blit 应用缓冲区
//  · 三维视图由 scene3d 渲染到暂存画布，再合成到二维画面
// ===========================================================================
(function () {
  const U = window.U;

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function parseColor(c) {
    if (!c) return '#000';
    if (c[0] === '#') return c;
    if (c.startsWith('rgb')) return c;
    return c;
  }

  class Display {
    constructor(runtime) {
      this.rt = runtime;
      this.scene3d = new window.Scene3D();
      this.cache = {};
      this.wallpapers = {};
    }
    // 桌面缓存
    canvasFor(inst, w, h) {
      const c = this.cache[inst.id] || (this.cache[inst.id] = { canvas: document.createElement('canvas'), w: 0, h: 0, dirty: true });
      const cv = c.canvas;
      if (c.w !== w || c.h !== h) {
        c.w = w; c.h = h;
        cv.width = Math.max(1, Math.round(w * (window.devicePixelRatio || 1)));
        cv.height = Math.max(1, Math.round(h * (window.devicePixelRatio || 1)));
        c.dirty = true;
      }
      return c;
    }
    markDirty(inst) { const c = this.cache[inst.id]; if (c) c.dirty = true; }
    renderInstance(inst, w, h, force) {
      const c = this.canvasFor(inst, w, h);
      let sig = 0;
      for (const k in inst.display.buffers) { const b = inst.display.buffers[k]; if (b.t && b.t > sig) sig = b.t; }
      if (!force && c.sig === sig && c.w === w && c.h === h) return c.canvas;
      const ctx = c.canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const desk = inst.display.buffers[Object.keys(inst.display.buffers).find((k) => k.endsWith(':desktop'))];
      if (desk && desk.list) {
        this.drawList(ctx, desk.list, inst, { x: 0, y: 0, w, h });
      } else {
        ctx.fillStyle = '#08090f';
        ctx.fillRect(0, 0, w, h);
      }
      inst.display.dirty = false;
      c.dirty = false;
      c.sig = sig;
      return c.canvas;
    }
    drawList(ctx, list, inst, clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      for (const op of list) {
        switch (op.op) {
          case 'rect': {
            ctx.fillStyle = parseColor(op.color);
            if (op.r) { roundRect(ctx, op.x, op.y, op.w, op.h, op.r); ctx.fill(); }
            else ctx.fillRect(op.x, op.y, op.w, op.h);
            break;
          }
          case 'text': {
            ctx.fillStyle = parseColor(op.color);
            ctx.font = (op.weight || 400) + ' ' + (op.size || 12) + 'px "MiSans","HarmonyOS Sans SC","Microsoft YaHei UI",sans-serif';
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = op.align === 'center' ? 'center' : (op.align === 'right' ? 'right' : 'left');
            ctx.fillText(op.s == null ? '' : String(op.s), op.x, op.y);
            break;
          }
          case 'line': {
            ctx.strokeStyle = parseColor(op.color);
            ctx.lineWidth = op.w || 1;
            ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
            break;
          }
          case 'circle': {
            ctx.fillStyle = parseColor(op.color);
            ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'icon': {
            const p = window.Icons.path2d(op.name);
            if (p) {
              ctx.save();
              ctx.translate(op.x, op.y);
              const k = (op.size || 18) / 24;
              ctx.scale(k, k);
              ctx.strokeStyle = parseColor(op.color || '#e9edf6');
              ctx.fillStyle = parseColor(op.color || '#e9edf6');
              ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
              ctx.stroke(p);
              ctx.restore();
            }
            break;
          }
          case 'wallpaper': {
            const img = this.wallpaper(inst.depth || 0, clip.w, clip.h);
            if (img) ctx.drawImage(img, clip.x, clip.y, clip.w, clip.h);
            break;
          }
          case 'blit': {
            const b = inst.display.buffers[op.buf];
            if (!b) break;
            if (b.type === '2d' && b.list) {
              ctx.save();
              ctx.beginPath(); ctx.rect(op.x, op.y, op.w, op.h); ctx.clip();
              this.drawList(ctx, b.list, inst, { x: op.x, y: op.y, w: op.w, h: op.h });
              ctx.restore();
            } else if (b.type === 'scene') {
              this.drawScene(ctx, inst, b, op.x, op.y, op.w, op.h);
            }
            break;
          }
          case 'desktop': {
            const child = this.rt.getInstance(op.id);
            if (child) {
              const cv = this.renderInstance(child, op.w, op.h);
              ctx.save();
              ctx.beginPath(); ctx.rect(op.x, op.y, op.w, op.h); ctx.clip();
              ctx.drawImage(cv, op.x, op.y, op.w, op.h);
              ctx.restore();
            }
            break;
          }
          case 'scene3d': {
            const sb = inst.display.buffers[op.scene];
            const fb = inst.display.buffers[op.fx];
            if (sb && sb.type === 'scene') {
              const merged = Object.assign({}, sb.state, { fx: fb ? fb.state : null });
              this.drawSceneState(ctx, inst, merged, op.x, op.y, op.w, op.h);
            }
            break;
          }
          case 'clip': ctx.save(); ctx.beginPath(); ctx.rect(op.x, op.y, op.w, op.h); ctx.clip(); break;
          case 'unclip': ctx.restore(); break;
          default: break;
        }
      }
      ctx.restore();
    }
    drawScene(ctx, inst, buf, x, y, w, h) {
      const st = buf.state || {};
      this.drawSceneState(ctx, inst, st, x, y, w, h);
    }
    drawSceneState(ctx, inst, st, x, y, w, h) {
      const res = this.rt.sceneResource(inst, st.scene);
      if (!res) {
        ctx.fillStyle = '#05070b';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#6b7488';
        ctx.font = '12px "MiSans",sans-serif';
        ctx.fillText('场景资源缺失：' + (st.scene || '?'), x + 12, y + 24);
        return;
      }
      const m = ctx.getTransform();
      const sc = Math.max(0.05, Math.abs(m.a));
      const cv = this.scene3d.render((inst.id) + ':' + (st.scene || ''), res, st, st.fx, Math.max(2, w * sc), Math.max(2, h * sc));
      ctx.drawImage(cv, x, y, w, h);
    }
    renderProjection(proj, win) {
      const inst = this.rt.getInstance(proj.instId);
      if (!inst) return null;
      const b = inst.display.buffers[Object.keys(inst.display.buffers).find((k) => k.endsWith(':' + proj.buf))];
      const wrap = win.canvas.parentElement;
      if (!wrap) return null;
      const cw = wrap.clientWidth, chh = wrap.clientHeight;
      if (cw < 2 || chh < 2) return null;
      if (!this._proj) this._proj = {};
      const key = proj.instId + ':' + proj.source;
      const c = this._proj[key] || (this._proj[key] = { canvas: document.createElement('canvas'), w: 0, h: 0, t: -1 });
      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(cw * dpr), H = Math.round(chh * dpr);
      if (c.canvas.width !== W || c.canvas.height !== H) { c.canvas.width = W; c.canvas.height = H; c.t = -1; }
      const sig = (b && b.t) || 0;
      if (c.t === sig && !inst.display.dirty) return c.canvas;
      const ctx = c.canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05070b';
      ctx.fillRect(0, 0, W, H);
      if (b && b.type === '2d' && b.list) {
        const sw = b.w || 640, sh = b.h || 400;
        const scale = Math.min(cw / sw, chh / sh);
        const ox = (cw - sw * scale) / 2, oy = (chh - sh * scale) / 2;
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
        this.drawList(ctx, b.list, inst, { x: 0, y: 0, w: sw, h: sh });
      } else {
        ctx.fillStyle = '#6b7488';
        ctx.font = '13px "MiSans",sans-serif';
        ctx.fillText('源应用尚未提交画面', 20, 30);
      }
      c.t = sig;
      inst.display.dirty = false;
      return c.canvas;
    }
    wallpaper(depth, w, h) {
      const key = 'w' + (depth % 4);
      if (this.wallpapers[key]) return this.wallpapers[key];
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 320;
      const g = cv.getContext('2d');
      const hues = [[258, 44, 12], [212, 40, 14], [172, 42, 12], [318, 38, 12]];
      const hh = hues[depth % 4];
      const grd = g.createLinearGradient(0, 0, 0, 320);
      grd.addColorStop(0, 'hsl(' + hh[0] + ',' + hh[1] + '%,' + (hh[2] + 6) + '%)');
      grd.addColorStop(1, 'hsl(' + hh[0] + ',' + hh[1] + '%,' + hh[2] + '%)');
      g.fillStyle = grd; g.fillRect(0, 0, 512, 320);
      // 等高线纹理
      g.strokeStyle = 'rgba(255,255,255,0.055)';
      g.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        g.beginPath();
        for (let x = 0; x <= 512; x += 8) {
          const y = 40 + i * 11 + Math.sin(x * 0.012 + i * 0.6) * 14 + Math.cos(x * 0.03 + i) * 5;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      // 层级徽记
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.font = '700 150px "MiSans",sans-serif';
      g.fillText('' + (depth + 1), 380, 300);
      this.wallpapers[key] = cv;
      return cv;
    }
  }

  window.Display = Display;
})();
