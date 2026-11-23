/* 网络安全攻防战 — 输入：Blender 式镜头、点选、拖放部署、朝向、路线预览与确认 */
(function (root) {
  'use strict';
  const TD = root.TD, THREE = root.THREE;
  const K = { cyan: new THREE.Color(0x45dcff), green: new THREE.Color(0x55ff9a), red: new THREE.Color(0xff3050), amber: new THREE.Color(0xffb53a), violet: new THREE.Color(0xb98cff), white: new THREE.Color(0xffffff), orange: new THREE.Color(0xff8a3a), blue: new THREE.Color(0x7fb4ff) };

  const Input = TD.Input = {
    app: null, mode: 'idle', activeCard: null, activeItem: null, dragging: false, mx: 0, my: 0, pick: null, pend: null, valid: [], cam: null, sealUntil: 0, sealed: null, sellId: 0, downAt: null,

    init(app) {
      this.app = app; const cv = app.stage.canvas;
      cv.addEventListener('pointerdown', e => { if (app.locked) return; TD.Audio && TD.Audio.unlock(); this.onDown(e); });
      window.addEventListener('pointermove', e => { if (app.locked) return; this.onMove(e); });
      window.addEventListener('pointerup', e => { if (app.locked) return; this.onUp(e); });
      cv.addEventListener('wheel', e => { e.preventDefault(); if (app.locked || app.state !== 'battle') return; this.zoom(e.deltaY); }, { passive: false });
      window.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
      window.addEventListener('keydown', e => this.onKey(e));
      window.addEventListener('blur', () => { this.cam = null; });
    },
    get sim() { return this.app.sim; }, get view() { return this.app.view; },
    canAct() { const a = this.app; return a.state === 'battle' && a.sim && !a.sim.over && !a.paused; },
    reset() { this.mode = 'idle'; this.activeCard = this.activeItem = null; this.dragging = false; this.pend = null; this.valid = []; this.sealed = null; this.sellId = 0; this.cam = null; TD.UI.hideConfirm(); TD.UI.hint(null); if (this.view) this.view.fx.setPreview(null); },

    // ---------- 镜头 ----------
    zoom(dy) { const st = this.app.stage, c = st.cam; c.dist = TD.clamp(c.dist * Math.exp(dy * 0.0011), 5, Math.max(70, st.camDef.dist * 1.6)); st.userCam = true; this.app.camTween = null; },
    orbit(dx, dy) { const c = this.app.stage.cam; c.yaw -= dx * 0.0052; c.pitch = TD.clamp(c.pitch + dy * 0.0042, 0.22, 1.5); this.app.stage.userCam = true; this.app.camTween = null; },
    pan(dx, dy) { const st = this.app.stage, c = st.cam, k = c.dist * Math.tan(st.camera.fov * Math.PI / 360) * 2 / st.h; const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); c.tx -= rx * dx * k; c.tz -= rz * dx * k; c.tx += fx * dy * k / Math.max(0.3, Math.sin(c.pitch)); c.tz += fz * dy * k / Math.max(0.3, Math.sin(c.pitch)); const lim = 22; c.tx = TD.clamp(c.tx, -lim, lim); c.tz = TD.clamp(c.tz, -lim, lim); st.userCam = true; this.app.camTween = null; },

    // ---------- 指针事件 ----------
    onDown(e) {
      const a = this.app; if (a.state !== 'battle') return;
      this.mx = e.clientX; this.my = e.clientY;
      if (e.button === 1) { e.preventDefault(); this.cam = { x: e.clientX, y: e.clientY, pan: e.shiftKey, zoom: e.ctrlKey }; return; }
      if (e.button === 2) { this.cancel(); return; }
      if (e.button === 0) this.press(e.clientX, e.clientY);
    },
    onMove(e) {
      const dx = e.clientX - this.mx, dy = e.clientY - this.my; this.mx = e.clientX; this.my = e.clientY;
      if (this.cam) { if (!(e.buttons & 4)) { this.cam = null; return; } if (this.cam.zoom) this.zoom(dy * 4); else if (this.cam.pan || e.shiftKey) this.pan(dx, dy); else this.orbit(dx, dy); return; }
      if (this.app.state === 'battle') this.move(e.clientX, e.clientY);
    },
    onUp(e) {
      if (e.button === 1) { this.cam = null; return; }
      if (e.button === 0 && this.dragging) this.release(e.clientX, e.clientY);
    },

    // ---------- 供真实输入与演示共用的动作 ----------
    beginCard(type, e) {
      if (!this.canAct()) { if (this.app.paused) TD.UI.toast('已暂停：继续后才能操作', 'info'); return; }
      this.cancel(true); this.mode = 'card'; this.activeCard = type; this.dragging = true; this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      const s = this.sim, d = TD.TOWERS[type]; this.valid = [];
      for (const c of s.grid.cells) { if (!d.place.includes(c.type) || s.towerAt[c.i]) continue; this.valid.push(c.i); }
      TD.UI.select(null); TD.Audio && TD.Audio.sfx('pick');
      this.mx = e.clientX; this.my = e.clientY; this.move(e.clientX, e.clientY);
    },
    beginItem(key, e) {
      if (!this.canAct()) { if (this.app.paused) TD.UI.toast('已暂停：继续后才能操作', 'info'); return; }
      this.cancel(true); this.mode = 'item'; this.activeItem = key; this.dragging = true; this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      const s = this.sim; this.valid = [];
      if (key === 'isolator') for (const c of s.grid.nodes) { if (!s.nodeIsolated(c.i)) this.valid.push(c.i); }
      if (key === 'restore') for (const t of s.towers) this.valid.push(t.ci);
      TD.UI.select(null); TD.Audio && TD.Audio.sfx('pick');
      this.mx = e.clientX; this.my = e.clientY; this.move(e.clientX, e.clientY);
    },
    overUi(x, y) { const e = document.elementFromPoint(x, y); return !!(e && e.closest && e.closest('.panel,.btn')); },
    move(x, y) {
      this.mx = x; this.my = y; if (!this.view) return;
      this.pick = this.overUi(x, y) && this.mode !== 'aim' ? { ci: -1, tower: null, enemy: null } : this.view.pick(x, y);
      if (this.mode === 'aim') { // 由鼠标相对落位格的方向决定朝向
        const p = this.pend, c = this.sim.grid.cells[p.ci], w = this.app.stage.rayPlane(x, y, 0.42);
        if (w) { const dx = w.x - this.view.wx(c.x), dz = w.z - this.view.wz(c.y); if (Math.hypot(dx, dz) > 0.35) { const f = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 2) : (dz > 0 ? 1 : 3); if (f !== p.facing) { p.facing = f; TD.Audio && TD.Audio.sfx('tick'); } } }
      }
      this.refresh();
    },
    // 根据当前模式更新预览（路线预览、提示）
    refresh() {
      const s = this.sim, v = this.view, UI = TD.UI; if (!s || !v) return;
      const ci = this.pick ? this.pick.ci : -1;
      if (this.mode === 'card') {
        const type = this.activeCard, d = TD.TOWERS[type];
        if (ci < 0) { this.hover = null; v.fx.setPreview(null); UI.hint(`把【${d.name}】拖到${d.place.map(p => ({ link: '链路', node: '交换节点', platform: '设备平台' }[p])).join('或')}上 · 右键取消`); return; }
        const chk = s.checkPlace(type, ci); let facing = 1;
        if (type === 'interceptor') facing = this.bestFacing(ci);
        this.hover = { ci, chk, facing };
        if (chk.ev) v.fx.setPreview(chk.ev.routes, chk.ev.changed); else v.fx.setPreview(null);
        if (chk.ok) UI.hint(chk.isolate ? `隔离【${s.grid.cells[ci].name}】：${chk.ev.changed.length ? chk.ev.changed.map(id => id + ' 改道→' + chk.ev.routes[id].exit).join('，') : '路线不变'} · 松开后确认` : type === 'interceptor' ? '松开落位，然后移动鼠标设定朝向' : `松开部署 · 算力 -${d.cost}`, 'ok');
        else UI.hint(chk.reason, 'bad');
      } else if (this.mode === 'item') {
        const key = this.activeItem, it = TD.ITEMS[key];
        const target = key === 'restore' ? (this.pick && this.pick.tower ? this.pick.tower.id : 0) : ci;
        if ((key === 'restore' && !target) || (key !== 'restore' && ci < 0)) { this.hover = null; v.fx.setPreview(null); UI.hint(`【${it.name}】选择投放位置：${it.target} · 右键取消`); return; }
        const chk = s.checkItem(key, target); this.hover = { ci: key === 'restore' ? this.pick.tower.ci : ci, chk, target };
        if (chk.ev) v.fx.setPreview(chk.ev.routes, chk.ev.changed); else v.fx.setPreview(null);
        if (chk.ok) UI.hint(key === 'isolator' ? `应急隔离【${s.grid.cells[ci].name}】：${chk.ev.changed.length ? chk.ev.changed.map(id => id + ' 改道→' + chk.ev.routes[id].exit).join('，') : '路线不变'} · 点击后确认` : key === 'downgrade' ? `协议降级 ${chk.cells.length} 格链路${chk.ev.changed.length ? '，' + chk.ev.changed.map(id => id + ' 改道→' + chk.ev.routes[id].exit).join('，') : '，路线不变'} · 点击确认` : `还原 ${Math.round(this.pick.tower.maxHp * it.frac)} 生命并解除加密 · 点击确认`, 'ok');
        else UI.hint(chk.reason, 'bad');
      } else if (this.mode === 'aim') {
        UI.hint(`朝向：${TD.DIR_NAMES[this.pend.facing]} · 移动鼠标调整，左键确认，右键取消`, 'ok');
      } else if (this.mode === 'idle') { this.hover = ci >= 0 ? { ci } : null; }
    },
    bestFacing(ci) {
      const s = this.sim, S = TD.towerStats('interceptor', 1), rc = new Set(); for (const id in s.routes) for (const c of s.routes[id].cells) rc.add(c);
      let bf = 1, bs = -1; for (let f = 0; f < 4; f++) { let n = 0; for (const c of s.areaCells(ci, f, S)) if (rc.has(c)) n++; if (n > bs) { bs = n; bf = f; } } return bf;
    },
    // 松开拖拽
    release(x, y) {
      this.dragging = false;
      const moved = this.downAt ? Math.hypot(x - this.downAt.x, y - this.downAt.y) : 99;
      if (moved < 6 && this.overUi(x, y)) return;      // 只是点了一下卡片：进入“拿起”状态，下一次点击地图落位
      this.move(x, y); this.commit();
    },
    // 左键按下（地图上）
    press(x, y) {
      this.move(x, y);
      if (this.mode === 'card' || this.mode === 'item') { if (!this.dragging) this.commit(); return; }
      if (this.mode === 'aim') { this.confirm(); return; }
      if (this.mode === 'confirm') return;
      if (this.app.state !== 'battle' || !this.pick) return;
      const p = this.pick, UI = TD.UI;
      if (p.enemy) UI.select({ kind: 'enemy', id: p.enemy.id }); else if (p.tower) UI.select({ kind: 'tower', id: p.tower.id }); else if (p.ci >= 0) UI.select({ kind: 'cell', ci: p.ci }); else UI.select(null);
      TD.Audio && TD.Audio.sfx('select');
    },
    commit() {
      const s = this.sim, UI = TD.UI, h = this.hover;
      if (!this.canAct()) { this.cancel(); return; }
      if (this.mode === 'card') {
        const type = this.activeCard;
        if (!h) { this.cancel(); return; }
        if (!h.chk.ok) { this.reject(h.chk, h.ci); return; }
        if (type === 'interceptor') { this.mode = 'aim'; this.pend = { type, ci: h.ci, facing: h.facing }; this.valid = []; TD.Audio && TD.Audio.sfx('place'); this.refresh(); return; }
        if (h.chk.isolate) { this.pend = { type, ci: h.ci, ev: h.chk.ev }; this.mode = 'confirm'; this.valid = []; UI.hint(null); const d = TD.TOWERS[type]; UI.showConfirm({ ci: h.ci, title: `隔离节点【${s.grid.cells[h.ci].name}】`, lines: UI.routeLines(h.chk.ev, s), cost: `部署 ${d.name}：算力 -${d.cost}　情报 -${h.chk.intel}` }); TD.Audio && TD.Audio.sfx('preview'); return; }
        if (s.place(type, h.ci, 0)) TD.Audio && TD.Audio.sfx('place_' + type);
        this.endAction();
      } else if (this.mode === 'item') {
        const key = this.activeItem;
        if (!h) { this.cancel(); return; }
        if (!h.chk.ok) { this.reject(h.chk, h.ci); return; }
        if (key === 'isolator') { this.pend = { item: key, ci: h.ci, ev: h.chk.ev }; this.mode = 'confirm'; this.valid = []; UI.hint(null); UI.showConfirm({ ci: h.ci, title: `应急隔离【${s.grid.cells[h.ci].name}】`, lines: UI.routeLines(h.chk.ev, s), cost: `应急隔离器：情报 -${TD.ITEMS.isolator.cost}　有效 ${TD.ITEMS.isolator.dur} 秒` }); TD.Audio && TD.Audio.sfx('preview'); return; }
        if (s.useItem(key, h.target)) TD.Audio && TD.Audio.sfx('item_' + key);
        this.endAction();
      }
    },
    reject(chk, ci) {
      const ev = chk.ev;
      this.sealed = { entries: ev ? ev.sealedEntries : [], enemies: ev ? ev.sealedEnemies : [], ci, until: (this.view.clock || 0) + 2.0 };
      TD.UI.toast(chk.reason); TD.UI.log('warn', 'DENY', chk.reason); TD.Audio && TD.Audio.sfx('deny');
      this.endAction();
    },
    confirm() {
      const s = this.sim, p = this.pend; if (!p || !this.canAct()) return;
      if (this.mode === 'aim') { if (s.place(p.type, p.ci, p.facing)) TD.Audio && TD.Audio.sfx('place_interceptor'); this.endAction(); }
      else if (this.mode === 'confirm') {
        if (p.item) { const chk = s.checkItem(p.item, p.ci); if (!chk.ok) { this.reject(chk, p.ci); return; } if (s.useItem(p.item, p.ci)) TD.Audio && TD.Audio.sfx('item_isolator'); }
        else { const chk = s.checkPlace(p.type, p.ci); if (!chk.ok) { this.reject(chk, p.ci); return; } if (s.place(p.type, p.ci, 0)) TD.Audio && TD.Audio.sfx('place_' + p.type); }
        this.endAction();
      }
    },
    cancel(silent) {
      if (this.mode !== 'idle' && !silent) TD.Audio && TD.Audio.sfx('cancel');
      if (this.mode === 'idle' && !silent && TD.UI.sel) TD.UI.select(null);
      this.endAction();
    },
    endAction() { this.mode = 'idle'; this.activeCard = this.activeItem = null; this.dragging = false; this.pend = null; this.hover = null; this.valid = []; TD.UI.hideConfirm(); TD.UI.hint(null); if (this.view) this.view.fx.setPreview(null); },
    clearPreview() { this.sellId = 0; if (this.view && this.mode === 'idle') this.view.fx.setPreview(null); },
    sellPreview(id) { if (this.mode !== 'idle' || !this.view) return; this.sellId = id; const ev = id ? this.sim.previewSell(id) : null; this.view.fx.setPreview(ev ? ev.routes : null, ev ? ev.changed : null); },

    // ---------- 键盘 ----------
    onKey(e) {
      const a = this.app, UI = TD.UI; TD.Audio && TD.Audio.unlock();
      if (e.key === 'Escape') { e.preventDefault(); if (a.demo) { a.exitDemo(); return; } if (!document.querySelector('#settings').classList.contains('hidden')) { document.querySelector('#settings').classList.add('hidden'); return; } if (!document.querySelector('#codex').classList.contains('hidden')) { UI.closeCodex(); return; } if (a.state === 'battle') { if (this.mode !== 'idle') this.cancel(); else if (a.menuOpen) a.setPaused(false); else if (UI.sel) UI.select(null); else a.openMenu(); } return; }
      if (a.locked || a.state !== 'battle' || !a.sim || a.menuOpen || !document.querySelector('#codex').classList.contains('hidden')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); a.togglePause(); return; }
      if (k === 'tab') { e.preventDefault(); a.setSpeed(a.speed % 3 + 1); return; }
      if (k === 'h' || k === 'home') { a.resetView(); return; }
      if (k === 'm') { a.toggleMute(); return; }
      if (k === 'n') { a.nextWave(); return; }
      if (k === 'enter') { if (this.mode === 'aim' || this.mode === 'confirm') this.confirm(); return; }
      const fake = { clientX: this.mx, clientY: this.my };
      if (k >= '1' && k <= '6') { this.beginCard(TD.TOWER_ORDER[+k - 1], fake); this.dragging = false; return; }
      if (k === 'z' || k === 'x' || k === 'c') { this.beginItem(TD.ITEM_ORDER['zxc'.indexOf(k)], fake); this.dragging = false; return; }
      if (UI.sel && UI.sel.kind === 'tower') { if (k === 'f') UI.insAct('skill'); else if (k === 'u') UI.insAct('up', 'a'); else if (k === 'i') UI.insAct('up', 'b'); else if (k === 'delete' || k === 'backspace') UI.insAct('sell'); }
    },

    // ---------- 把当前交互状态写入视图层 ----------
    rangeOverlay(ov, type, S, ci, facing, alpha) {
      const s = this.sim, c = s.grid.cells[ci]; alpha = alpha == null ? 1 : alpha; const y = (c.type === 'platform' ? 0.0 : 0) + 0.06;
      if (type === 'interceptor') for (const k of s.areaCells(ci, facing, S)) { const cc = s.grid.cells[k]; if (cc.type === 'void') continue; ov.cells.push([k, cc.walk ? 0 : 3, K.cyan, (cc.walk ? 0.95 : 0.35) * alpha]); }
      else if (type === 'sandbox') { ov.circles.push([c.x, c.y, S.detect, K.violet, y, 0.8 * alpha]); ov.circles.push([c.x, c.y, S.aoe, K.cyan, y, alpha]); }
      else if (type === 'repair') ov.circles.push([c.x, c.y, S.range, K.green, y, alpha]);
      else if (type === 'honeypot') ov.circles.push([c.x, c.y, S.lure, K.amber, y, alpha]);
      else if (type === 'firewall' && c.type === 'node') { for (const nb of c.nb) if (nb >= 0 && s.grid.cells[nb].walk) ov.cells.push([nb, 0, K.cyan, 0.8 * alpha]); }
    },
    buildOverlay() {
      const v = this.view, s = this.sim; if (!v || !s) return; const ov = v.overlay; ov.cells.length = 0; ov.circles.length = 0; ov.ghost = null;
      ov.sealed = this.sealed;
      const UI = TD.UI;
      if (this.app.state !== 'battle' && !this.app.demo) return;
      // 选中对象
      const sel = UI.sel;
      if (sel) {
        if (sel.kind === 'tower') { const t = s.tById.get(sel.id); if (t) { ov.cells.push([t.ci, 4, K.white, 1]); this.rangeOverlay(ov, t.type, t.S, t.ci, t.facing, 0.8); } }
        else if (sel.kind === 'enemy') { const e = s.eById.get(sel.id); if (e) { ov.circles.push([e.x, e.y, e.d.r + 0.22, K.white, 0.07, 1]); if (e.d.range) ov.circles.push([e.x, e.y, e.d.range, K.red, 0.06, 0.6]); if (e.d.shieldR) ov.circles.push([e.x, e.y, e.d.shieldR, K.violet, 0.06, 0.6]); } }
        else ov.cells.push([sel.ci, 4, K.white, 1]);
      }
      const h = this.hover;
      if (this.mode === 'idle') { if (h && h.ci >= 0 && !this.app.demo) { ov.cells.push([h.ci, 3, K.white, 0.55]); const t = s.tById.get(s.towerAt[h.ci]); if (t && !(sel && sel.kind === 'tower' && sel.id === t.id)) this.rangeOverlay(ov, t.type, t.S, t.ci, t.facing, 0.45); } }
      else if (this.mode === 'card') {
        const type = this.activeCard, col = K.green;
        for (const ci of this.valid) if (!h || h.ci !== ci) ov.cells.push([ci, 3, col, 0.5]);
        if (h) { ov.ghost = { type, ci: h.ci, facing: h.facing, ok: h.chk.ok }; ov.cells.push([h.ci, h.chk.ok ? 0 : 2, h.chk.ok ? K.green : K.red, 1]); const c = s.grid.cells[h.ci]; if (c && TD.TOWERS[type].place.includes(c.type)) this.rangeOverlay(ov, type, TD.towerStats(type, 1), h.ci, h.facing, 1); if (h.chk.ev && !h.chk.ev.ok) ov.sealed = { entries: h.chk.ev.sealedEntries, enemies: h.chk.ev.sealedEnemies, ci: h.ci, until: 1e9 }; }
      } else if (this.mode === 'aim') { const p = this.pend; ov.ghost = { type: p.type, ci: p.ci, facing: p.facing, ok: true }; this.rangeOverlay(ov, p.type, TD.towerStats(p.type, 1), p.ci, p.facing, 1); ov.cells.push([p.ci, 4, K.green, 1]); }
      else if (this.mode === 'confirm') { const p = this.pend; if (p.type) ov.ghost = { type: p.type, ci: p.ci, facing: 0, ok: true }; ov.cells.push([p.ci, 2, K.orange, 1]); }
      else if (this.mode === 'item') {
        const key = this.activeItem;
        for (const ci of this.valid) if (!h || h.ci !== ci) ov.cells.push([ci, 3, K.amber, 0.7]);
        if (h) { const ok = h.chk.ok; if (key === 'downgrade') { const c = s.grid.cells[h.ci]; ov.circles.push([c.x, c.y, TD.ITEMS.downgrade.radius, ok ? K.amber : K.red, 0.07, 1]); for (const ci of h.chk.cells) ov.cells.push([ci, 1, K.amber, 1]); } else ov.cells.push([h.ci, ok ? 0 : 2, ok ? (key === 'restore' ? K.green : K.amber) : K.red, 1]); if (h.chk.ev && !h.chk.ev.ok) ov.sealed = { entries: h.chk.ev.sealedEntries, enemies: h.chk.ev.sealedEnemies, ci: h.ci, until: 1e9 }; }
      }
    }
  };
})(window);
