/* =====================================================================
   4.2 任务柜台：难度分档 / 任务列表 / 详情 / 战力对比 / 出发
   ===================================================================== */
(function () {
  'use strict';
  const DONE = { n1: 1, n2: 1, n3: 1, h1: 1, h2: 1, x2: 1 };
  const qRing = (boss) => `<svg class="ring" viewBox="-50 -50 100 100"><circle r="47" fill="${boss ? 'url(#rg-boss)' : 'rgba(14,30,72,.92)'}" stroke="#e9c27a" stroke-width="2"/><path d="${G.astroRing(43, { ticks: 36, major: 3 })}" stroke="rgba(255,226,154,.55)" stroke-width="1"/><circle r="35" fill="none" stroke="rgba(255,226,154,.3)" stroke-width="1"/></svg>`;
  const bullet = `<svg viewBox="-10 -10 20 20"><path d="${G.star4(0, 0, 9)}"/></svg>`;

  class QuestScene extends G.Scene {
    enter(p) {
      G.BG.set('day');
      const D = G.DATA;
      this.tier = p.tier || G.state.tier || 'normal';
      this.sel = p.sel || null;
      this.root.innerHTML = `
        <div class="q-tint"></div>
        ${G.scrHead('任务柜台', 'QUEST COUNTER · 空行者公会', 'it-map')}
        <div class="q-tabs"><kbd class="qk" data-act="tabprev">Q</kbd>
          ${D.TIERS.map((t) => `<div class="q-tab brk" data-act="tab" data-tier="${t.id}"><div><b>${t.name}</b><em>${t.en}</em></div><span class="stars">${'<i></i>'.repeat(t.stars)}</span>${t.id === 'legend' ? G.icon('ui-lock', 'lockdot') : ''}</div>`).join('')}
          <kbd class="qk" data-act="tabnext">E</kbd></div>
        <div class="q-list plate"><div class="ql-head"><b>委托列表</b>QUEST LIST<span class="qcount"></span></div><div class="q-rows"></div></div>
        <div class="q-detail plate rivets"><div class="qd-wm"><svg viewBox="-50 -50 100 100"><circle r="48" fill="none" stroke="#ffe29a" stroke-width=".6"/><path d="${G.astroRing(48, { ticks: 90, major: 9 })}" stroke="#ffe29a" stroke-width=".6"/><circle r="34" fill="none" stroke="#ffe29a" stroke-width=".4" stroke-dasharray="1 2"/><path d="${G.star4(0, 0, 26)}" fill="#ffe29a"/></svg></div><div class="qd-in"></div></div>
        ${G.keybar([
          { k: ['Q', 'E'], t: '切换难度', act: 'tabnext' },
          { k: ['↑', '↓'], t: '选择任务' },
          { k: ['Enter'], t: '确认 / 出发' },
          { k: ['Esc'], t: '返回', act: 'back' },
        ])}`;
      this.setTier(this.tier, true);
    }
    quests() { return G.DATA.QUESTS[this.tier]; }
    rows() { return this.$$('.qrow'); }
    setTier(t, first) {
      if (!first && t === this.tier) return;
      this.tier = t;
      G.state.tier = t;
      this.$$('.q-tab').forEach((el) => el.classList.toggle('sel', el.dataset.tier === t));
      const qs = this.quests();
      const D = G.DATA;
      this.$('.q-rows').innerHTML = qs
        .map((q, i) => {
          const it = D.ITEMS[q.reward];
          const ty = D.QTYPES[q.type];
          return `<div class="qrow brk ${q.locked ? 'locked' : ''}" data-act="pick" data-id="${q.id}" style="--i:${i}">
            ${q.isNew ? '<span class="qnew">NEW</span>' : ''}${DONE[q.id] ? `<span class="qdone">${G.icon('ui-check')}已通关</span>` : ''}
            <div class="qbadge">${qRing(q.type === 'boss')}${G.icon(ty.icon)}</div>
            <div class="qmain"><div class="qname">${q.name}</div><div class="qmeta"><span class="qtype">${G.icon(ty.icon)}${ty.name}</span><span class="qloc">${G.icon('ui-pin')}${q.loc}</span></div></div>
            <div class="qpow"><small>推荐战力</small><b>${G.icon('ui-power')}${G.fmt(q.rec)}</b></div>
            <div class="qrew">${G.itemTile(q.reward)}<span><small>主要奖励</small>${it.name}</span></div>
            ${q.locked ? `<div class="qlock">${G.icon('ui-lock')}</div>` : ''}
          </div>`;
        })
        .join('');
      const done = qs.filter((q) => DONE[q.id]).length;
      this.$('.qcount').textContent = `${qs.length} 件委托 · 已完成 ${done}`;
      const keep = qs.find((q) => q.id === this.sel);
      this.select(keep ? keep.id : qs[0].id, true);
    }
    select(id, force) {
      if (!force && id === this.sel) return;
      this.sel = id;
      this.rows().forEach((r) => r.classList.toggle('sel', r.dataset.id === id));
      const q = G.questById(id);
      const D = G.DATA;
      const tier = D.TIERS.find((t) => t.id === q.tier);
      const tColor = { normal: '#4ea4ff', hard: '#f6b83c', extreme: '#ff5a3c', legend: '#b77bff' }[q.tier];
      const pp = G.partyPower();
      const max = Math.max(pp, q.rec) * 1.12;
      const diff = pp - q.rec;
      const ty = D.QTYPES[q.type];
      const b = q.boss;
      const box = this.$('.qd-in');
      box.innerHTML = `
        <div class="qd-tags"><span class="qd-diff" style="--tc:${tColor}">${tier.name}<em>${tier.en} ${'★'.repeat(tier.stars)}</em></span><span class="qd-type">${G.icon(ty.icon)}${ty.name}</span></div>
        <h2 class="qd-name">${q.name}</h2>
        <div class="qd-loc">${G.icon('ui-pin')}${q.loc}</div>
        <div class="qd-boss">${q.type === 'boss' ? G.bossCrest() : `<svg class="crest" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="url(#rg-el-${b.el})"/><circle cx="50" cy="50" r="48" fill="none" stroke="#f3d48a" stroke-width="2.2"/><use href="#${ty.icon}" x="24" y="24" width="52" height="52" fill="#fff"/></svg>`}
          <div><div class="bt">${b.title ? b.title + ' · ABYSSAL BEAST' : '讨伐目标 · TARGET'}</div><div class="bn">${b.name}</div><div class="bl">${b.lv ? 'LV ' + b.lv + ' · ' : ''}${D.ELEMENTS[b.el].name}属性</div></div>
          <div class="bel"><div>${G.elBadge(b.el)}属性</div><div class="weak">${G.elBadge(b.weak)}弱点</div></div></div>
        <div class="qd-sec"><b>任务目标</b>OBJECTIVES</div>
        <div class="qd-goals">${q.goals.map((g) => `<div>${bullet}${g}</div>`).join('')}</div>
        <div class="qd-desc">${q.desc}</div>
        <div class="qd-sec"><b>可能获得的奖励</b>REWARDS</div>
        <div class="qd-rew">${q.rewards.map(([id, tag]) => `<div class="rw" data-hov="1">${G.itemTile(id)}<span>${D.ITEMS[id].name}</span>${tag ? `<em class="${tag === '稀有' ? 'rare' : ''}">${tag}</em>` : ''}</div>`).join('')}</div>
        <div class="qd-foot">
          <div class="qd-power">
            <div class="pw-row"><small>推荐战力</small><div class="bar rec"><i style="width:${(q.rec / max) * 100}%"></i></div><b class="num pw-rec">${G.fmt(q.rec)}</b></div>
            <div class="pw-row"><small>队伍战力</small><div class="bar cur"><i style="width:${(pp / max) * 100}%"></i><span class="mark" style="left:${(q.rec / max) * 100}%"></span></div><b class="num pw-cur">${G.fmt(pp)}</b></div>
            <div class="pw-verdict ${diff >= 0 ? 'ok' : 'bad'}">${G.icon(diff >= 0 ? 'ui-check' : 'ui-warn')}${diff >= 0 ? '战力充足' : '战力不足'}<span class="num">${diff >= 0 ? '+' : ''}${G.fmt(diff)}</span></div>
          </div>
          <div class="btn btn-gold qd-go brk ${q.locked ? 'locked' : ''}" data-act="go"><span class="k">Enter</span>出发</div>
        </div>`;
      G.retrigger(box, 'qd-in');
      G.countTo(box.querySelector('.pw-rec'), 0, q.rec, 900, { delay: 300 });
      G.countTo(box.querySelector('.pw-cur'), 0, pp, 1000, { delay: 350 });
    }
    depart() {
      const q = G.questById(this.sel);
      const go = this.$('.qd-go');
      if (q.locked) {
        G.retrigger(go, 'q-shake');
        const t = G.html(`<div class="q-toast">${G.icon('ui-lock')} 该任务尚未解锁</div>`);
        this.root.appendChild(t);
        this.after(1700, () => t.remove());
        return;
      }
      G.state.quest = q.id;
      G.App.go('party', {}, 'wind');
    }
    act(a, el) {
      if (a === 'tab') this.setTier(el.dataset.tier);
      else if (a === 'tabprev' || a === 'tabnext') this.stepTier(a === 'tabprev' ? -1 : 1);
      else if (a === 'pick') this.select(el.dataset.id);
      else if (a === 'go') this.depart();
      else if (a === 'back') this.back();
    }
    stepTier(d) {
      const ids = G.DATA.TIERS.map((t) => t.id);
      const i = G.clamp(ids.indexOf(this.tier) + d, 0, ids.length - 1);
      const tab = this.$(`.q-tab[data-tier="${ids[i]}"]`);
      G.UI.pressFlash(tab);
      this.setTier(ids[i]);
    }
    key(e) {
      const k = e.key.toLowerCase();
      if (k === 'q' || k === 'e') { this.stepTier(k === 'q' ? -1 : 1); return true; }
      if (k === 'arrowup' || k === 'w') { this.navRows(-1); return true; }
      if (k === 'arrowdown' || k === 's') { this.navRows(1); return true; }
      if (k === 'arrowleft' || k === 'arrowright') { this.stepTier(k === 'arrowleft' ? -1 : 1); return true; }
      if (k === 'enter' || k === ' ') {
        const h = G.UI.hover;
        if (h && h.classList.contains('qrow') && h.dataset.id !== this.sel) { G.UI.click(h); return true; }
        G.UI.click(this.$('.qd-go'));
        return true;
      }
      return false;
    }
    navRows(d) {
      const rows = this.rows();
      if (!rows.includes(G.UI.hover)) { const i = rows.findIndex((r) => r.dataset.id === this.sel); G.UI.setHover(rows[Math.max(0, i)]); return; }
      G.navList(rows, d);
    }
    back() { G.App.go('title', { menu: true }, 'wind'); }
  }
  G.App.register('quest', QuestScene);
})();
