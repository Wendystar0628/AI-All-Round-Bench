// ============================================================
// 显示设备（二维）：把各系统提交的帧绘制为窗口化画面
// - 每个系统实例一个容器；桌面背景绘制在底 canvas
// - 每个窗口一个 div + canvas，按 z 次序叠放
// - 后代系统桌面作为“系统窗口”内容嵌入，受裁剪与遮挡约束
// - 三维视图矩形由本模块计算并交给显示设备（三维）
// ============================================================

export class View2D {
  constructor(host) {
    this.host = host;
    this.views = new Map();   // systemId -> {el, base, wins:Map, lastFrame}
    this.iconCache = new Map();
  }

  ensure(system) {
    let v = this.views.get(system.id);
    if (!v) {
      const el = document.createElement('div');
      el.className = 'sysview';
      el.dataset.sys = system.id;
      el.style.position = 'absolute';
      el.style.left = '0px'; el.style.top = '0px'; el.style.width = '520px'; el.style.height = '380px';
      el.style.overflow = 'hidden';
      const base = document.createElement('canvas');
      base.className = 'sysbase';
      base.style.position = 'absolute'; base.style.left = '0'; base.style.top = '0';
      el.appendChild(base);
      v = { el, base, wins: new Map(), lastFrame: null };
      this.views.set(system.id, v);
    }
    return v;
  }

  // 由父系统帧放置后代系统桌面
  place(systemId, x, y, w, h, parentWinEl) {
    const v = this.ensure(this.host.systems.get(systemId));
    const el = v.el;
    if (el.parentElement !== parentWinEl) parentWinEl.appendChild(el);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.width = Math.max(80, w) + 'px'; el.style.height = Math.max(60, h) + 'px';
    const s = this.host.systems.get(systemId);
    if (s) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - (s.vw || 0)) > 1 || Math.abs(r.height - (s.vh || 0)) > 1) {
        s.vw = r.width; s.vh = r.height;
        s.pushInbox({ t: 'viewport', w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }

  sync(system) {
    const frame = system.frame2d;
    if (!frame) return;
    const v = this.ensure(system);
    v.lastFrame = frame;
    // 底 canvas
    const el = v.el;
    const w = el.clientWidth, h = el.clientHeight;
    if (v.base.width !== w * this.dpr || v.base.height !== h * this.dpr) {
      v.base.width = Math.max(1, w * this.dpr); v.base.height = Math.max(1, h * this.dpr);
      v.base.style.width = w + 'px'; v.base.style.height = h + 'px';
    }
    const bctx = v.base.getContext('2d');
    bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    bctx.clearRect(0, 0, w, h);
    this.prims(bctx, frame.bg || [], 0, 0);

    // 窗口
    const seen = new Set();
    const wins = (frame.wins || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const win of wins) {
      seen.add(win.id);
      let entry = v.wins.get(win.id);
      if (!entry) {
        const div = document.createElement('div');
        div.className = 'syswin';
        div.style.position = 'absolute';
        const cv = document.createElement('canvas');
        cv.style.position = 'absolute'; cv.style.left = '0'; cv.style.top = '0';
        div.appendChild(cv);
        el.appendChild(div);
        entry = { div, canvas: cv };
        v.wins.set(win.id, entry);
      }
      const div = entry.div, cv = entry.canvas;
      div.style.left = win.x + 'px'; div.style.top = win.y + 'px';
      div.style.width = win.w + 'px'; div.style.height = win.h + 'px';
      div.style.zIndex = String(100 + (win.z || 0));
      div.style.display = win.min === 1 ? 'none' : 'block';
      if (cv.width !== win.w * this.dpr || cv.height !== win.h * this.dpr) {
        cv.width = Math.max(1, win.w * this.dpr); cv.height = Math.max(1, win.h * this.dpr);
        cv.style.width = win.w + 'px'; cv.style.height = win.h + 'px';
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, win.w, win.h);
      this.prims(ctx, win.content || [], 0, 0);
      // 后代系统桌面嵌入
      if (win.sys) {
        this.place(win.sys, 1, 26, win.w - 2, win.h - 27, div);
      }
    }
    // 移除已关闭窗口
    for (const [id, entry] of [...v.wins]) {
      if (!seen.has(id)) { entry.div.remove(); v.wins.delete(id); }
    }
    // 三维视图矩形
    this.host.view3d && this.host.view3d.collect(system, frame, v);
  }

  get dpr() { return Math.min(2, window.devicePixelRatio || 1); }

  // ---------------- 图元绘制 ----------------
  prims(ctx, list, ox, oy) {
    const clipStack = [];
    for (const p of list) {
      if (!p || !p.t) continue;
      switch (p.t) {
        case 'r': {
          ctx.fillStyle = p.c === 'none' ? 'transparent' : (p.c || '#000');
          this.roundRect(ctx, ox + p.x, oy + p.y, p.w, p.h, p.r || 0);
          ctx.fill();
          if (p.s && p.s !== 'none') { ctx.strokeStyle = p.s; ctx.lineWidth = p.sw || 1; ctx.stroke(); }
          break;
        }
        case 'g': {
          const g = ctx.createLinearGradient(ox + p.x, oy + p.y, ox + p.x, oy + p.y + p.h);
          g.addColorStop(0, p.c1 || '#111'); g.addColorStop(1, p.c2 || '#000');
          ctx.fillStyle = g; ctx.fillRect(ox + p.x, oy + p.y, p.w, p.h);
          break;
        }
        case 't': {
          const fs = p.fs || 12;
          ctx.font = (p.fw ? 'bold ' : '') + fs + 'px "Microsoft YaHei", "Segoe UI", "PingFang SC", sans-serif';
          ctx.fillStyle = p.c || '#fff';
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = p.a === 'c' ? 'center' : p.a === 'r' ? 'right' : 'left';
          let s = String(p.s == null ? '' : p.s);
          if (p.mw) {
            const max = p.mw;
            let m = ctx.measureText(s).width;
            if (m > max) {
              while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
              s = s + '…';
            }
          }
          ctx.fillText(s, ox + p.x, oy + p.y);
          break;
        }
        case 'l': {
          ctx.strokeStyle = p.c || '#fff'; ctx.lineWidth = p.w || 1;
          ctx.beginPath(); ctx.moveTo(ox + p.x1, oy + p.y1); ctx.lineTo(ox + p.x2, oy + p.y2); ctx.stroke();
          break;
        }
        case 'p': {
          const pts = p.pts || [];
          if (pts.length < 2) break;
          ctx.beginPath();
          ctx.moveTo(ox + pts[0][0], oy + pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(ox + pts[i][0], oy + pts[i][1]);
          if (p.close) ctx.closePath();
          if (p.f) { ctx.fillStyle = p.f; ctx.fill(); }
          ctx.strokeStyle = p.c || '#fff'; ctx.lineWidth = p.w || 1; ctx.stroke();
          break;
        }
        case 'c': {
          ctx.beginPath(); ctx.arc(ox + p.x, oy + p.y, p.r || 2, 0, Math.PI * 2);
          if (p.f) { ctx.fillStyle = p.c || '#fff'; ctx.fill(); }
          else { ctx.strokeStyle = p.c || '#fff'; ctx.lineWidth = p.w || 1; ctx.stroke(); }
          break;
        }
        case 'i': {
          const img = this.icon(p.img, p.w, p.h);
          if (img) ctx.drawImage(img, ox + p.x, oy + p.y, p.w, p.h);
          break;
        }
        case 'clip': {
          ctx.save();
          ctx.beginPath(); ctx.rect(ox + p.x, oy + p.y, p.w, p.h); ctx.clip();
          clipStack.push(1);
          break;
        }
        case 'unclip': {
          if (clipStack.length) { ctx.restore(); clipStack.pop(); }
          break;
        }
      }
    }
    while (clipStack.length) { ctx.restore(); clipStack.pop(); }
  }

  roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 自制矢量图标
  icon(name, w, h) {
    const key = name + ':' + w + 'x' + h;
    if (this.iconCache.has(key)) return this.iconCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = h * 2;
    const c = cv.getContext('2d');
    c.scale(2, 2);
    const S = w / 24;
    c.save(); c.scale(S, S);
    const kind = String(name).replace('vec:', '');
    const P = '#8b6cff', Y = '#ffd23f', D = '#2b303c', G = '#9aa7bd';
    if (kind === 'folder') {
      c.fillStyle = '#c99a4b'; c.beginPath();
      c.moveTo(2, 6); c.lineTo(9, 6); c.lineTo(11, 8); c.lineTo(22, 8); c.lineTo(22, 20); c.lineTo(2, 20); c.closePath(); c.fill();
      c.fillStyle = '#e0b264'; c.fillRect(2, 8, 20, 11);
    } else if (kind === 'file' || kind === 'doc') {
      c.fillStyle = '#39415a'; c.fillRect(5, 2, 14, 20);
      c.fillStyle = '#5a6480'; c.fillRect(5, 2, 14, 4);
      c.strokeStyle = '#8b96b5'; c.lineWidth = 1;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(8, 10 + i * 3); c.lineTo(16, 10 + i * 3); c.stroke(); }
    } else if (kind === 'code') {
      c.strokeStyle = P; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(8, 6); c.lineTo(3, 12); c.lineTo(8, 18); c.stroke();
      c.beginPath(); c.moveTo(16, 6); c.lineTo(21, 12); c.lineTo(16, 18); c.stroke();
      c.beginPath(); c.moveTo(13, 4); c.lineTo(11, 20); c.stroke();
    } else if (kind === 'cpu') {
      c.strokeStyle = G; c.lineWidth = 1.5;
      c.strokeRect(6, 6, 12, 12);
      c.fillStyle = P; c.fillRect(9, 9, 6, 6);
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(4 + i * 2, 2); c.lineTo(4 + i * 2, 6); c.stroke();
        c.beginPath(); c.moveTo(4 + i * 2, 18); c.lineTo(4 + i * 2, 22); c.stroke();
        c.beginPath(); c.moveTo(2, 8 + i * 2); c.lineTo(6, 8 + i * 2); c.stroke();
        c.beginPath(); c.moveTo(18, 8 + i * 2); c.lineTo(22, 8 + i * 2); c.stroke();
      }
    } else if (kind === 'heli') {
      c.fillStyle = P;
      c.beginPath(); c.ellipse(12, 15, 6, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillRect(16, 13, 6, 2.5);
      c.strokeStyle = D; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(4, 8); c.lineTo(20, 8); c.stroke();
      c.beginPath(); c.moveTo(12, 8); c.lineTo(12, 11); c.stroke();
      c.fillStyle = Y; c.fillRect(9, 14, 6, 1.6);
      c.strokeStyle = D; c.lineWidth = 1;
      c.beginPath(); c.moveTo(8, 19); c.lineTo(16, 19); c.stroke();
      c.beginPath(); c.moveTo(8, 19); c.lineTo(7, 22); c.stroke();
      c.beginPath(); c.moveTo(16, 19); c.lineTo(17, 22); c.stroke();
    } else if (kind === 'chart') {
      c.fillStyle = P; c.fillRect(4, 13, 4, 7);
      c.fillStyle = Y; c.fillRect(10, 8, 4, 12);
      c.fillStyle = '#43d9a3'; c.fillRect(16, 4, 4, 16);
      c.strokeStyle = G; c.lineWidth = 1;
      c.beginPath(); c.moveTo(3, 21); c.lineTo(22, 21); c.stroke();
    } else if (kind === 'term') {
      c.fillStyle = '#0b1018'; c.fillRect(2, 4, 20, 16);
      c.strokeStyle = G; c.strokeRect(2, 4, 20, 16);
      c.fillStyle = '#43d9a3'; c.fillRect(4, 7, 6, 2);
      c.fillStyle = Y; c.fillRect(4, 11, 10, 2);
      c.fillStyle = '#7fd0ff'; c.fillRect(4, 15, 4, 2);
    } else if (kind === 'help') {
      c.strokeStyle = Y; c.lineWidth = 2;
      c.beginPath(); c.arc(12, 12, 9, 0, Math.PI * 2); c.stroke();
      c.fillStyle = Y;
      c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText('?', 12, 16);
    } else if (kind === 'sheet') {
      c.fillStyle = '#1f6f54'; c.fillRect(3, 4, 18, 16);
      c.strokeStyle = '#9fe3c9'; c.lineWidth = 0.8;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(3, 4 + i * 4); c.lineTo(21, 4 + i * 4); c.stroke(); }
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(3 + i * 4.5, 4); c.lineTo(3 + i * 4.5, 20); c.stroke(); }
    } else {
      c.fillStyle = '#39415a'; c.fillRect(5, 2, 14, 20);
    }
    c.restore();
    this.iconCache.set(key, cv);
    return cv;
  }

  detach(systemId) {
    const v = this.views.get(systemId);
    if (v) { v.el.remove(); this.views.delete(systemId); }
  }
}
