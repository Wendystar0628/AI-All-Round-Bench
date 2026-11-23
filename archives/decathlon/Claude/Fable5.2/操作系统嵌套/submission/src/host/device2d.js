'use strict';
/*
 * 显示设备（二维部分）：接收各系统程序经系统接口提交的显示列表（可复制的数据），把它画成界面元素。
 * 设备不做窗口管理、不做命中判断、不保存应用状态：谁在上面、点到了谁，都由提交列表的程序决定。
 * 相同的提交得到相同的画面；两次提交之间画面不变。
 */
(function () {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const FONT_UI = '"HarmonyOS Sans SC","MiSans","Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif';
  const FONT_MONO = '"Cascadia Mono","JetBrains Mono","Consolas","Microsoft YaHei UI",monospace';

  class Device2D {
    constructor(host) {
      this.host = host;             // {isAncestor(a,b), fieldEvent(ev), systemFocused(sysId), dev3d}
      this.systems = new Map();     // sysId → {surfaces: Map<sid, S>}
      this.dirty = new Set();
      this.stats = { draws: 0, flushes: 0 };
    }
    sysOf(id) { let s = this.systems.get(id); if (!s) { s = { id, surfaces: new Map() }; this.systems.set(id, s); } return s; }
    surface(sys, sid, create) {
      const s = this.sysOf(sys);
      let S = s.surfaces.get(sid);
      if (!S && create) {
        const el = document.createElement('div');
        el.className = 'surf'; el.dataset.surf = sys + ':' + sid;
        S = { sys, sid, list: null, C: { slots: [], keyed: new Map() }, el, ctx: { sys, win: null, app: null }, meta: null, drawn: 0 };
        s.surfaces.set(sid, S);
      }
      return S;
    }
    apply(origin, op, a, b, c) {
      switch (op) {
        case 'draw': {
          const S = this.surface(origin, a, true);
          S.list = NVM.fromGuest(b) || [];
          S.drawn++; this.stats.draws++;
          this.dirty.add(S);
          return true;
        }
        case 'free': {
          const s = this.systems.get(origin); if (!s) return true;
          const S = s.surfaces.get(a);
          if (S) { this.destroyAll(S.C, S); S.el.remove(); s.surfaces.delete(a); this.dirty.delete(S); }
          return true;
        }
        case 'reset': {
          const s = this.systems.get(origin);
          if (s) { for (const S of s.surfaces.values()) { this.destroyAll(S.C, S); S.list = []; S.meta = null; S.el.remove(); this.dirty.delete(S); } s.surfaces.clear(); }
          if (this.host.dev3d) this.host.dev3d.reset(origin);
          return true;
        }
        case 'scene_open': case 'scene_layer': case 'scene_present': case 'scene_close':
          return this.host.dev3d ? this.host.dev3d.apply(origin, op, a, b, c) : true;
      }
      return true;
    }
    mount(sysId, container) {
      const S = this.surface(sysId, 0, true);
      S.ctx = { sys: sysId, win: null, app: null };
      if (S.el.parentNode !== container) container.appendChild(S.el);
      return S;
    }
    flush() {
      if (!this.dirty.size) return;
      this.stats.flushes++;
      const list = [...this.dirty]; this.dirty.clear();
      for (const S of list) { if (S.list) this.reconcile(S.el, S.C, S.list, S, S.ctx); }
    }
    // ---------- 对比更新 ----------
    reconcile(parent, C, list, S, scope) {
      const old = C.slots, nu = new Array(list.length);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p || typeof p !== 'object') { list[i] = { k: 'nil' }; }
        const q = list[i];
        const key = q.k === 'win' ? 'w:' + q.wid : (q.key != null ? 'k:' + q.key : null);
        let slot = null;
        if (key) { slot = C.keyed.get(key) || null; if (slot && (slot.p.k !== q.k || slot.taken)) slot = null; }
        else { const o = old[i]; if (o && !o.key && !o.taken && o.p.k === q.k && !!o.p.multi === !!q.multi) slot = o; }
        if (!slot) {
          const el = this.create(q, S, scope);
          parent.appendChild(el);
          slot = { el, p: null, key, taken: false, z: -1, C: null, st: {}, at: {} };
          if (key) { const prev = C.keyed.get(key); if (prev && !prev.taken) { /* 类型变了：旧的稍后清理 */ } C.keyed.set(key, slot); }
        }
        slot.taken = true;
        if (slot.z !== i) { slot.el.style.zIndex = i; slot.z = i; }
        this.patch(slot, q, S, scope);
        slot.p = q; nu[i] = slot;
      }
      for (const o of old) if (!o.taken) { this.destroy(o, S); o.el.remove(); if (o.key && C.keyed.get(o.key) === o) C.keyed.delete(o.key); }
      for (const s of nu) s.taken = false;
      C.slots = nu;
    }
    destroyAll(C, S) { for (const o of C.slots) { this.destroy(o, S); o.el.remove(); } C.slots = []; C.keyed.clear(); }
    destroy(slot, S) {
      if (slot.C) this.destroyAll(slot.C, S);
      if (slot.view && this.host.dev3d) { this.host.dev3d.detachView(slot.view); slot.view = null; }
      if (slot.p && (slot.p.k === 'sub' || slot.p.k === 'sys')) { const m = slot.mounted; if (m && m.el.parentNode === slot.el) m.el.remove(); }
    }
    create(p, S, scope) {
      let el;
      switch (p.k) {
        case 'btn': el = document.createElement('button'); el.type = 'button'; el.tabIndex = -1; el.className = 'p p-btn'; break;
        case 'input':
          el = document.createElement(p.multi ? 'textarea' : 'input');
          if (!p.multi) el.type = 'text';
          el.className = 'p p-input'; el.spellcheck = false; el.autocomplete = 'off'; el.wrap = p.wrap ? 'soft' : 'off';
          this.bindField(el, S);
          break;
        case 'line': case 'poly': el = document.createElementNS(SVGNS, 'svg'); el.setAttribute('class', 'p p-svg'); break;
        case 'view3d': el = document.createElement('canvas'); el.className = 'p p-view3d'; break;
        default: el = document.createElement('div'); el.className = 'p p-' + p.k;
      }
      return el;
    }
    st(slot, k, v) { if (slot.st[k] !== v) { slot.st[k] = v; slot.el.style[k] = v; } }
    at(slot, k, v) {
      if (slot.at[k] === v) return;
      slot.at[k] = v;
      if (v === null || v === undefined || v === false) slot.el.removeAttribute(k); else slot.el.setAttribute(k, v === true ? '' : v);
    }
    geom(slot, p) {
      this.st(slot, 'left', (p.x || 0) + 'px'); this.st(slot, 'top', (p.y || 0) + 'px');
      if (p.w != null) this.st(slot, 'width', Math.max(0, p.w) + 'px');
      if (p.h != null) this.st(slot, 'height', Math.max(0, p.h) + 'px');
    }
    tag(slot, p, scope) {
      if (p.id) {
        this.at(slot, 'data-testid', p.id);
        this.at(slot, 'data-system-id', scope.sys);
        this.at(slot, 'data-window-id', p.wref ? scope.sys + '-' + p.wref : (scope.win || null));
      } else if (slot.at['data-testid']) { this.at(slot, 'data-testid', null); }
      if (p.lb || slot.at['aria-label']) this.at(slot, 'aria-label', p.lb || null);
      if (p.tip || slot.at['title']) this.at(slot, 'title', p.tip || null);
      if (p.data || slot.dataKeys) {
        const d = p.data || {};
        if (slot.dataKeys) for (const k of slot.dataKeys) if (!(k in d)) this.at(slot, 'data-' + k, null);
        for (const k in d) this.at(slot, 'data-' + k, d[k] === null ? null : String(d[k]));
        slot.dataKeys = Object.keys(d);
      }
      if (p.cur || slot.st.cursor) this.st(slot, 'cursor', p.cur || '');
      if (p.o != null || slot.st.opacity) this.st(slot, 'opacity', p.o != null ? String(p.o) : '');
    }
    patch(slot, p, S, scope) {
      const el = slot.el, o = slot.p;
      switch (p.k) {
        case 'rect': {
          this.geom(slot, p);
          this.st(slot, 'background', p.c2 ? 'linear-gradient(' + (p.ga != null ? p.ga : 180) + 'deg,' + p.c + ',' + p.c2 + ')' : (p.c || 'transparent'));
          this.st(slot, 'borderRadius', p.r ? p.r + 'px' : '');
          this.st(slot, 'border', p.bw ? p.bw + 'px solid ' + (p.bc || '#000') : '');
          this.st(slot, 'boxShadow', p.sh ? SHADOWS[p.sh] || '' : '');
          this.st(slot, 'backdropFilter', p.blur ? 'blur(' + p.blur + 'px) saturate(1.3)' : '');
          break;
        }
        case 'text': {
          this.geom(slot, p);
          if (!o || o.t !== p.t) el.textContent = p.t == null ? '' : String(p.t);
          this.st(slot, 'color', p.c || '');
          this.st(slot, 'fontSize', (p.s || 13) + 'px');
          this.st(slot, 'fontWeight', p.b ? String(p.b === true ? 600 : p.b) : '');
          this.st(slot, 'textAlign', p.al === 1 ? 'center' : p.al === 2 ? 'right' : '');
          this.st(slot, 'fontFamily', p.f === 1 ? FONT_MONO : '');
          if (p.wrap) { this.st(slot, 'whiteSpace', 'pre-wrap'); this.st(slot, 'lineHeight', (p.lh || 1.45) + ''); }
          else { this.st(slot, 'whiteSpace', ''); this.st(slot, 'lineHeight', p.h != null ? p.h + 'px' : ''); }
          break;
        }
        case 'btn': {
          this.geom(slot, p);
          const cls = 'p p-btn v' + (p.v || 0) + (p.on ? ' on' : '') + (p.sel ? ' sel' : '');
          if (slot.cls !== cls) { el.className = cls; slot.cls = cls; }
          if (!o || o.t !== p.t || o.ic !== p.ic || o.ics !== p.ics || o.sub !== p.sub || o.icc !== p.icc) {
            el.textContent = '';
            if (p.ic) { const ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = iconSvg(p.ic); if (p.ics) { ic.style.width = ic.style.height = p.ics + 'px'; } if (p.icc) ic.style.color = p.icc; el.appendChild(ic); }
            if (p.t != null && p.t !== '') { const t = document.createElement('span'); t.className = 'tx'; t.textContent = p.t; el.appendChild(t); }
            if (p.sub) { const t = document.createElement('span'); t.className = 'sb'; t.textContent = p.sub; el.appendChild(t); }
          }
          if (el.disabled !== !!p.dis) el.disabled = !!p.dis;
          this.st(slot, 'fontSize', p.s ? p.s + 'px' : '');
          this.st(slot, 'color', p.c || '');
          this.st(slot, 'background', p.bg || '');
          this.st(slot, 'textAlign', p.al === 0 ? 'left' : '');
          this.st(slot, 'justifyContent', p.al === 0 ? 'flex-start' : p.al === 2 ? 'flex-end' : '');
          this.st(slot, 'fontFamily', p.f === 1 ? FONT_MONO : '');
          this.st(slot, 'fontWeight', p.b ? String(p.b === true ? 600 : p.b) : '');
          this.at(slot, 'aria-label', p.lb || p.t || p.tip || p.id || null);
          this.at(slot, 'aria-pressed', p.on ? 'true' : null);
          break;
        }
        case 'icon': {
          this.geom(slot, p);
          if (!o || o.n !== p.n) el.innerHTML = iconSvg(p.n);
          this.st(slot, 'color', p.c || '');
          break;
        }
        case 'input': {
          this.geom(slot, p);
          const v = p.v == null ? '' : String(p.v);
          el._prim = p; el._S = S;
          const changed = el.value !== v;
          if (changed && !el._composing) { const st = el.scrollTop, sl = el.scrollLeft; el.value = v; el.scrollTop = st; el.scrollLeft = sl; }
          if (p.ph !== (o && o.ph)) el.placeholder = p.ph || '';
          const cls = 'p p-input' + (p.mono ? ' mono' : '') + (p.multi ? ' multi' : '') + (p.bare ? ' bare' : '');
          if (slot.cls !== cls) { el.className = cls; slot.cls = cls; }
          if (el.readOnly !== !!p.ro) el.readOnly = !!p.ro;
          this.st(slot, 'fontSize', p.s ? p.s + 'px' : '');
          if (p.focus && this.host.systemFocused(scope.sys, scope.win)) {
            if (document.activeElement !== el) { el.focus({ preventScroll: true }); }
            if (p.s2 != null && (changed || !o || o.s2 !== p.s2 || o.e2 !== p.e2 || !o.focus)) {
              if (el.selectionStart !== p.s2 || el.selectionEnd !== p.e2) { try { el.setSelectionRange(p.s2, p.e2); } catch (e) { /* 忽略 */ } }
              el._ls = p.s2; el._le = p.e2;
            }
          } else if (document.activeElement === el && !p.focus) { el.blur(); }
          this.at(slot, 'aria-label', p.lb || p.ph || p.id || null);
          break;
        }
        case 'line': {
          const x1 = Math.min(p.x1, p.x2), y1 = Math.min(p.y1, p.y2), lw = p.lw || 1, pad = lw + 1;
          this.st(slot, 'left', (x1 - pad) + 'px'); this.st(slot, 'top', (y1 - pad) + 'px');
          const w = Math.abs(p.x2 - p.x1) + pad * 2, h = Math.abs(p.y2 - p.y1) + pad * 2;
          this.st(slot, 'width', w + 'px'); this.st(slot, 'height', h + 'px');
          const sig = [p.x1, p.y1, p.x2, p.y2, p.c, lw, p.dash].join(',');
          if (slot.sig !== sig) {
            slot.sig = sig;
            el.innerHTML = '<line x1="' + (p.x1 - x1 + pad) + '" y1="' + (p.y1 - y1 + pad) + '" x2="' + (p.x2 - x1 + pad) + '" y2="' + (p.y2 - y1 + pad) + '" stroke="' + esc(p.c || '#888') + '" stroke-width="' + lw + '"' + (p.dash ? ' stroke-dasharray="' + esc(p.dash) + '"' : '') + ' stroke-linecap="round"/>';
          }
          break;
        }
        case 'poly': {
          const pts = p.pts || []; let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (let i = 0; i + 1 < pts.length; i += 2) { if (pts[i] < x1) x1 = pts[i]; if (pts[i] > x2) x2 = pts[i]; if (pts[i + 1] < y1) y1 = pts[i + 1]; if (pts[i + 1] > y2) y2 = pts[i + 1]; }
          if (!isFinite(x1)) { x1 = y1 = x2 = y2 = 0; }
          const lw = p.lw || 1, pad = lw + 1;
          this.st(slot, 'left', (x1 - pad) + 'px'); this.st(slot, 'top', (y1 - pad) + 'px');
          this.st(slot, 'width', (x2 - x1 + pad * 2) + 'px'); this.st(slot, 'height', (y2 - y1 + pad * 2) + 'px');
          const sig = pts.join(',') + '|' + p.c + '|' + p.fill + '|' + lw + '|' + p.close;
          if (slot.sig !== sig) {
            slot.sig = sig;
            let d = '';
            for (let i = 0; i + 1 < pts.length; i += 2) d += (i ? 'L' : 'M') + (pts[i] - x1 + pad).toFixed(1) + ' ' + (pts[i + 1] - y1 + pad).toFixed(1);
            if (p.close) d += 'Z';
            el.innerHTML = '<path d="' + d + '" fill="' + esc(p.fill || 'none') + '" stroke="' + esc(p.c || 'none') + '" stroke-width="' + lw + '" stroke-linejoin="round" stroke-linecap="round"/>';
          }
          break;
        }
        case 'g': {
          this.geom(slot, p);
          if (!slot.C) slot.C = { slots: [], keyed: new Map() };
          this.st(slot, 'overflow', p.clip === false ? 'visible' : 'hidden');
          this.st(slot, 'background', p.c || '');
          this.st(slot, 'borderRadius', p.r ? p.r + 'px' : '');
          this.reconcile(el, slot.C, p.items || [], S, scope);
          break;
        }
        case 'win': {
          this.geom(slot, p);
          if (!slot.C) slot.C = { slots: [], keyed: new Map() };
          const gid = scope.sys + '-' + p.wid;
          const cls = 'p p-win' + (p.focus ? ' focus' : '') + (p.st === 2 ? ' max' : '') + (p.st === 1 ? ' min' : '') + (p.kind ? ' kind-' + p.kind : '');
          if (slot.cls !== cls) { el.className = cls; slot.cls = cls; }
          this.at(slot, 'data-testid', 'app-window'); this.at(slot, 'data-system-id', scope.sys); this.at(slot, 'data-window-id', gid);
          this.at(slot, 'data-app-id', p.app || 'app'); this.at(slot, 'data-state', p.st === 1 ? 'minimized' : p.st === 2 ? 'maximized' : 'normal');
          this.at(slot, 'data-focused', p.focus ? 'true' : 'false'); this.at(slot, 'aria-label', p.title || '');
          this.at(slot, 'data-source-system-id', p.src ? p.src.sys : null);
          this.at(slot, 'data-source-window-id', p.src ? p.src.sys + '-' + p.src.win : null);
          this.at(slot, 'data-source-app-id', p.src ? p.src.app : null);
          this.st(slot, 'display', p.st === 1 ? 'none' : '');
          this.st(slot, 'borderRadius', p.st === 2 ? '0px' : (p.r != null ? p.r + 'px' : ''));
          this.st(slot, 'borderColor', p.bc || '');
          slot.win = { sys: scope.sys, wid: p.wid, gid, app: p.app, title: p.title, st: p.st, focus: !!p.focus, kind: p.kind || 'app', src: p.src || null };
          this.reconcile(el, slot.C, p.items || [], S, { sys: scope.sys, win: gid, app: p.app });
          break;
        }
        case 'sub': case 'sys': {
          this.geom(slot, p);
          const refSys = p.k === 'sys' ? p.sysid : (p.sys || S.sys), sid = p.k === 'sys' ? 0 : p.sid;
          let T = null;
          if (refSys === S.sys || this.host.isAncestor(S.sys, refSys)) T = this.surface(refSys, sid, true);
          if (p.k === 'sys') { this.at(slot, 'data-system-id', p.sysid); this.at(slot, 'data-desktop-of', p.sysid); }
          if (T) {
            const ctx = p.k === 'sys' ? { sys: refSys, win: null, app: null } : { sys: scope.sys, win: scope.win, app: scope.app };
            if (T.el.parentNode !== el) { el.appendChild(T.el); }
            if (T.ctx.sys !== ctx.sys || T.ctx.win !== ctx.win) { T.ctx = ctx; this.retag(T); }
            slot.mounted = T;
          }
          break;
        }
        case 'view3d': {
          this.geom(slot, p);
          if (!slot.view && this.host.dev3d) { slot.view = this.host.dev3d.attachView({ sys: S.sys, scene: p.scene, canvas: el, w: p.w, h: p.h }); }
          if (slot.view) {
            if (slot.view.scene !== p.scene || slot.view.w !== p.w || slot.view.h !== p.h) { slot.view.scene = p.scene; slot.view.w = p.w; slot.view.h = p.h; this.host.dev3d.viewChanged(slot.view); }
          }
          break;
        }
        case 'wall': {
          this.geom(slot, p);
          const cls = 'p p-wall wall-' + (p.v || 2);
          if (slot.cls !== cls) { el.className = cls; slot.cls = cls; el.innerHTML = wallMarkup(p.v || 2, p.label || ''); }
          else if (!o || o.label !== p.label) { el.innerHTML = wallMarkup(p.v || 2, p.label || ''); }
          break;
        }
        case 'meta': { S.meta = p; this.st(slot, 'display', 'none'); if (p.d && p.d.accent && S.accent !== p.d.accent) { S.accent = p.d.accent; S.el.style.setProperty('--pa', p.d.accent); } return; }
        default: this.st(slot, 'display', 'none'); return;
      }
      this.tag(slot, p, scope);
      if (p.hid || slot.st.visibility) this.st(slot, 'visibility', p.hid ? 'hidden' : '');
    }
    retag(T) {
      // 显示面被挂到另一个窗口范围（例如投送窗口）后，更新其中控件的归属标注
      const walk = (C) => {
        for (const slot of C.slots) {
          if (slot.at['data-testid'] && slot.p && slot.p.k !== 'win') { this.at(slot, 'data-system-id', T.ctx.sys); this.at(slot, 'data-window-id', slot.p.wref ? T.ctx.sys + '-' + slot.p.wref : (T.ctx.win || null)); }
          if (slot.C && slot.p && slot.p.k === 'g') walk(slot.C);
        }
      };
      walk(T.C);
    }
    // ---------- 文本输入域：设备只负责显示与把原始文本事件送回系统，由程序修改内容 ----------
    bindField(el, S) {
      const send = (ev) => { if (this.host.fieldEvent) this.host.fieldEvent(el, ev); };
      el.addEventListener('beforeinput', (e) => {
        if (e.isComposing || e.inputType === 'insertCompositionText') return;
        e.preventDefault();
        const s = el.selectionStart, en = el.selectionEnd;
        const t = e.inputType;
        if (t === 'insertText' || t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'insertReplacementText' || t === 'insertFromYank') {
          let text = e.data != null ? e.data : (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
          if (!el._prim || !el._prim.multi) text = text.replace(/[\r\n]+/g, ' ');
          send({ t: 'text', text, s, e: en });
        } else if (t === 'insertLineBreak' || t === 'insertParagraph') {
          if (el._prim && el._prim.multi) send({ t: 'text', text: '\n', s, e: en });
        } else if (t === 'deleteByCut' || t === 'deleteByDrag') { send({ t: 'text', text: '', s, e: en }); }
        else if (t.startsWith('delete')) {
          if (s !== en) send({ t: 'text', text: '', s, e: en });
          else if (t.indexOf('Backward') >= 0) { if (s > 0) send({ t: 'text', text: '', s: s - 1, e: s }); }
          else if (s < el.value.length) send({ t: 'text', text: '', s, e: s + 1 });
        }
      });
      el.addEventListener('compositionstart', () => { el._composing = true; el._cs = el.selectionStart; el._ce = el.selectionEnd; });
      el.addEventListener('compositionend', (e) => {
        el._composing = false;
        const text = e.data || '';
        const v = el._prim ? String(el._prim.v == null ? '' : el._prim.v) : '';
        el.value = v;
        try { el.setSelectionRange(el._cs, el._cs); } catch (err) { /* 忽略 */ }
        if (text) send({ t: 'text', text, s: el._cs, e: el._ce });
      });
      const selCheck = () => {
        if (el._composing) return;
        if (el._ls !== el.selectionStart || el._le !== el.selectionEnd) { el._ls = el.selectionStart; el._le = el.selectionEnd; send({ t: 'sel', s: el._ls, e: el._le }); }
      };
      el.addEventListener('select', selCheck);
      el.addEventListener('keyup', selCheck);
      el.addEventListener('pointerup', () => setTimeout(selCheck, 0));
      el.addEventListener('focus', () => { el._ls = el.selectionStart; el._le = el.selectionEnd; if (this.host.fieldFocus) this.host.fieldFocus(el); });
      // fill() 等直接改写 value 的自动化方式：把差异转成一次“整段替换”的文本事件
      el.addEventListener('input', (e) => {
        if (el._composing) return;
        const v = el._prim ? String(el._prim.v == null ? '' : el._prim.v) : '';
        if (el.value !== v) { const nv = el.value; el.value = v; send({ t: 'text', text: nv, s: 0, e: v.length }); }
      });
    }
    // ---------- 供 inspect() 使用：读设备里已有的窗口与应用状态 ----------
    windowsOf(sysId) {
      const S = this.surface(sysId, 0, false); if (!S) return [];
      return S.C.slots.filter(s => s.p && s.p.k === 'win' && s.win).map(s => s.win);
    }
    metas(sysId) {
      const s = this.systems.get(sysId); if (!s) return [];
      const out = [];
      for (const S of s.surfaces.values()) if (S.meta && S.meta.d) out.push({ sid: S.sid, d: S.meta.d, ctx: S.ctx });
      return out;
    }
  }

  const SHADOWS = {
    1: '0 1px 3px rgba(0,0,0,.35)',
    2: '0 6px 18px rgba(0,0,0,.38)',
    3: '0 16px 48px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.35)',
    4: 'inset 0 0 0 1px rgba(255,255,255,.06)'
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function iconSvg(name) {
    const d = (window.OSIcons && window.OSIcons[name]) || (window.OSIcons && window.OSIcons.file) || '';
    return '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  // 子系统壁纸：按层级取不同色相的等高线图案（设备内置的自制图样）
  function wallMarkup(v, label) {
    const hues = { 2: 176, 3: 36, 4: 334, 5: 110, 6: 212, 7: 268 };
    const h = hues[v] != null ? hues[v] : (v * 67) % 360;
    let rings = '';
    for (let i = 0; i < 9; i++) {
      const r = 60 + i * 46;
      rings += '<ellipse cx="78%" cy="30%" rx="' + r * 1.5 + '" ry="' + r + '" fill="none" stroke="hsla(' + h + ',70%,70%,' + (0.16 - i * 0.012).toFixed(3) + ')" stroke-width="1.2" transform="rotate(-14)"/>';
      rings += '<ellipse cx="12%" cy="88%" rx="' + r * 1.25 + '" ry="' + r * 0.8 + '" fill="none" stroke="hsla(' + ((h + 40) % 360) + ',70%,70%,' + (0.12 - i * 0.01).toFixed(3) + ')" stroke-width="1"/>';
    }
    return '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">' +
      '<defs><linearGradient id="wg' + v + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + h + ',42%,17%)"/><stop offset=".55" stop-color="hsl(' + ((h + 24) % 360) + ',38%,11%)"/><stop offset="1" stop-color="hsl(' + ((h + 300) % 360) + ',36%,9%)"/></linearGradient>' +
      '<pattern id="wp' + v + '" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="hsla(' + h + ',60%,80%,.10)"/></pattern></defs>' +
      '<rect width="100%" height="100%" fill="url(#wg' + v + ')"/><rect width="100%" height="100%" fill="url(#wp' + v + ')"/>' + rings + '</svg>' +
      (label ? '<div class="wall-label" style="color:hsla(' + h + ',70%,78%,.16)">' + esc(label) + '</div>' : '');
  }

  window.Device2D = Device2D;
  window.DeviceFonts = { FONT_UI, FONT_MONO };
  window.deviceIconSvg = iconSvg;
})();
