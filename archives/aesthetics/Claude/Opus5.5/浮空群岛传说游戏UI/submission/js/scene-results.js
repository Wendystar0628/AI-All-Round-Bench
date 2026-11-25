/* =====================================================================
   4.6 结算画面：任务完成 / 评价揭晓 / 贡献与 MVP / 经验与升级 / 铜银金宝箱
   ===================================================================== */
(function () {
  'use strict';
  const D = () => G.DATA;
  const CHESTS = [
    { r: 'bronze', name: '铜宝箱', wood: ['#94603a', '#4a2810'], metal: ['#f6c39a', '#8a4a20'], items: [['fireCrystal', 6], ['coin', 12000]] },
    { r: 'silver', name: '银宝箱', wood: ['#3a5e9a', '#16264a'], metal: ['#ffffff', '#8aa0bc'], items: [['flameShard', 3], ['sigilFire', 1]] },
    { r: 'gold', name: '金宝箱', wood: ['#b0263f', '#4a0818'], metal: ['#fff4c0', '#c98a1e'], items: [['flameScale', 1], ['ignHorn', 1], ['sigilGold', 1]] },
  ];
  const EXP_GAIN = 6200;

  function chestSVG(c) {
    const id = c.r;
    const gem = c.r === 'gold' ? `<path d="M78 27l9 9-9 9-9-9z" fill="#ff4b6a" stroke="#fff" stroke-width="1.6"/><path d="M78 30l3 3-3 2z" fill="#fff" opacity=".8"/>` : c.r === 'silver' ? `<circle cx="78" cy="36" r="6" fill="#7fdcff" stroke="#fff" stroke-width="1.4"/>` : '';
    return `<svg viewBox="0 0 156 150">
      <defs><linearGradient id="chw-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.wood[0]}"/><stop offset="1" stop-color="${c.wood[1]}"/></linearGradient>
      <linearGradient id="chm-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.metal[0]}"/><stop offset="1" stop-color="${c.metal[1]}"/></linearGradient></defs>
      <ellipse cx="78" cy="144" rx="66" ry="7" fill="rgba(0,0,0,.35)"/>
      <g class="body">
        <path d="M14 64H142V131Q142 140 133 140H23Q14 140 14 131Z" fill="url(#chw-${id})" stroke="#140804" stroke-width="2.6"/>
        <path d="M14 64H142V74H14Z" fill="url(#chm-${id})" stroke="#140804" stroke-width="1.6"/>
        <path d="M30 74H42V140H30ZM114 74H126V140H114Z" fill="url(#chm-${id})" stroke="#140804" stroke-width="1.4"/>
        <path d="M24 90H132M24 112H132" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
        <rect x="63" y="76" width="30" height="32" rx="5" fill="url(#chm-${id})" stroke="#140804" stroke-width="2"/>
        <path d="M78 84a4.2 4.2 0 1 1-.1 0zM76 88h4v10h-4z" fill="#140804"/>
      </g>
      <g class="lid">
        <path d="M12 66V48Q12 16 78 16Q144 16 144 48V66Z" fill="url(#chw-${id})" stroke="#140804" stroke-width="2.6"/>
        <path d="M30 66V30Q35 21 42 19V66ZM126 66V30Q121 21 114 19V66Z" fill="url(#chm-${id})" stroke="#140804" stroke-width="1.4"/>
        <path d="M12 58H144V68H12Z" fill="url(#chm-${id})" stroke="#140804" stroke-width="1.6"/>
        <path d="M24 30Q78 6 132 30" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/>
        ${gem}
      </g>
    </svg>`;
  }
  const medalRing = () => {
    let st = '';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; st += `<path d="${G.star4(150 * Math.cos(a), 150 * Math.sin(a), i % 3 ? 4 : 7)}" fill="#ffe29a"/>`; }
    return `<svg class="rm-ring" viewBox="-165 -165 330 330">
      <circle r="160" fill="rgba(8,14,40,.65)" stroke="rgba(255,226,154,.7)" stroke-width="2"/>
      <g class="rm-spin"><path d="${G.astroRing(156, { ticks: 120, major: 10 })}" stroke="rgba(255,226,154,.6)" stroke-width="1.4"/></g>
      <g class="rm-spinr"><circle r="132" fill="none" stroke="rgba(160,210,255,.4)" stroke-width="1" stroke-dasharray="3 7"/>${st}</g>
      <circle r="112" fill="none" stroke="rgba(255,226,154,.35)" stroke-width="1.2"/>
    </svg>`;
  };

  class ResultsScene extends G.Scene {
    enter(p) {
      G.BG.set('victory');
      const R = (this.R = G.state.result || {
        time: 35620, party: ['erin', 'rock', 'thea', 'baldo'], taken: 61420, maxCombo: 286,
        dmg: { erin: 5980450, rock: 3120880, thea: 4410230, baldo: 3328900 },
      });
      this.party = R.party || ['erin', 'rock', 'thea', 'baldo'];
      const q = (this.q = G.questById(G.state.quest) || G.questById('x1'));
      const total = this.party.reduce((a, id) => a + (R.dmg[id] || 0), 0) || 1;
      let mvp = this.party[0];
      this.party.forEach((id) => { if ((R.dmg[id] || 0) > (R.dmg[mvp] || 0)) mvp = id; });
      this.mvp = mvp;
      const crit = [
        { icon: 'ui-clock', n: '通关时间', v: G.fmtTime(R.time), g: 'S+' },
        { icon: 'ui-heart', n: '受到伤害', v: G.fmt(R.taken || 0), g: (R.taken || 0) === 0 ? 'S+' : 'A' },
        { icon: 'ui-link', n: '连锁奥义', v: '全员连锁 ×1', g: 'S+' },
        { icon: 'sk-burst', n: '最大连击', v: (R.maxCombo || 0) + ' HITS', g: 'S' },
      ];
      this.root.innerHTML = `
        <div class="r-tint"></div>
        <div class="r-head"><div class="rh-wings"><i></i><i class="r"></i></div><div class="rh-main" data-t="任务完成"><span>任务完成</span></div><div class="rh-en">QUEST COMPLETE</div>
          <div class="rh-info"><span class="d">${D().TIERS.find((t) => t.id === q.tier).name}</span>${q.name}<i class="sep"></i>${G.icon('ui-clock')}通关时间<b class="num r-time">00:00.00</b></div></div>
        <div class="r-col r-rank plate rivets"><div class="r-h"><b>综合评价</b>RANK<span>C · B · A · S · S+</span></div>
          <div class="rank-med"><div class="rays"></div>${medalRing()}<div class="q">?</div><div class="letter"></div><i class="burst"></i></div>
          <div class="r-crit">${crit.map((c) => `<div class="crow">${G.icon(c.icon)}<span class="cn">${c.n}</span><span class="cv num">${c.v}</span><span class="cg ${c.g === 'A' ? 'a' : ''}">${c.g}</span></div>`).join('')}</div></div>
        <div class="r-col r-mid plate"><div class="r-h"><b>队员贡献</b>CONTRIBUTION<span>伤害量 · 经验值</span></div>
          ${this.party.map((id) => {
            const c = D().chars[id];
            const d = R.dmg[id] || 0;
            return `<div class="mrow el-${c.el} ${id === mvp ? 'mvp-row' : ''}" data-id="${id}">${id === mvp ? `<span class="mvp">${G.icon('ui-crown')}MVP</span>` : ''}${G.crest(id)}
              <div class="mb"><div class="mt"><b>${c.name}</b><span class="lv">Lv <strong class="lvn">${c.lv}</strong></span><span class="lvup">LEVEL UP!</span><span class="dmgv num">0</span><span class="pct num">${Math.round((d / total) * 100)}%</span></div>
              <div class="cbar"><i></i></div>
              <div class="xp"><small>EXP</small><div class="xbar"><i style="transform:scaleX(${(c.exp[0] / c.exp[1]).toFixed(3)})"></i></div><span class="xg num">+0</span></div></div></div>`;
          }).join('')}</div>
        <div class="r-col r-rew plate"><div class="r-h"><b>奖励宝箱</b>REWARDS</div>
          <div class="chests">${CHESTS.map((c, k) => `<div class="chest r-${c.r}" data-k="${k}"><div class="beam"></div><div class="crays"></div><div class="glow"></div><div class="cbox">${chestSVG(c)}</div>
            <div class="sparks">${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2 + k; const d = 90 + G.hash(i + k * 13) * 90; return `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d * 0.8 - 30).toFixed(0)}px;--dl:${(G.hash(i * 3 + k) * 0.15).toFixed(2)}s"></i>`; }).join('')}</div>
            ${c.r === 'gold' ? '<span class="rare">RARE DROP!</span>' : ''}<span class="cn">${c.name}</span></div>`).join('')}</div>
          <div class="r-items">${CHESTS.flatMap((c, k) => c.items.map(([id, n]) => `<div class="ri r-${D().ITEMS[id].r}" data-c="${k}">${G.itemTile(id, n > 1 ? (n >= 1000 ? G.fmt(n) : n) : '')}<span>${D().ITEMS[id].name}</span></div>`)).join('')}</div></div>
        <div class="r-foot"><span class="hint"><kbd>Space</kbd>跳过演出</span>
          <div class="btn btn-navy brk" data-act="retry"><span class="k">R</span>${G.icon('ui-retry')}再来一次</div>
          <div class="btn btn-gold brk" data-act="home"><span class="k">Esc</span>${G.icon('ui-home')}返回</div></div>`;
      this.steps = [
        [350, (ins) => G.countTo(this.$('.r-time'), 0, R.time, ins ? 1 : 900, { fmt: (v) => G.fmtTime(v) })],
        ...crit.map((c, i) => [1000 + i * 200, () => this.$$('.crow')[i].classList.add('on')]),
        [1950, (ins) => this.rollRank(ins)],
        ...this.party.map((id, i) => [3100 + i * 180, (ins) => this.contrib(i, ins)]),
        [4100, () => { const m = this.$(`.mrow[data-id="${mvp}"] .mvp`); if (m) m.classList.add('go'); }],
        [4500, (ins) => this.exp(ins)],
        [5900, (ins) => this.openChest(0, ins)],
        [7100, (ins) => this.openChest(1, ins)],
        [8300, (ins) => this.openChest(2, ins)],
        [10100, () => this.finish()],
      ];
      this.stepDone = new Array(this.steps.length).fill(false);
      this.steps.forEach((s, i) => this.after(s[0], () => this.runStep(i, false)));
    }
    runStep(i, ins) {
      if (this.stepDone[i]) return;
      this.stepDone[i] = true;
      this.steps[i][1](ins);
    }
    rollRank(ins) {
      const box = this.$('.rank-med .letter');
      const set = (t, cls) => { box.innerHTML = `<b class="${cls}" data-t="${t}"><span>${t}</span></b>`; };
      this.$('.rank-med .q').style.display = 'none';
      if (ins) { set('S+', 'final'); this.$('.rank-med').classList.add('landed'); return; }
      ['C', 'B', 'A', 'S'].forEach((t, k) => this.after(k * 150, () => set(t, 'roll grey')));
      this.after(760, () => {
        set('S+', 'final');
        this.$('.rank-med').classList.add('landed');
        G.retrigger(this.$('.rank-med .burst'), 'go');
      });
    }
    contrib(i, ins) {
      const id = this.party[i];
      const row = this.$(`.mrow[data-id="${id}"]`);
      row.classList.add('on');
      const max = Math.max(...this.party.map((p) => this.R.dmg[p] || 0)) || 1;
      const d = this.R.dmg[id] || 0;
      row.querySelector('.cbar i').style.transform = `scaleX(${(d / max).toFixed(3)})`;
      G.countTo(row.querySelector('.dmgv'), 0, d, ins ? 1 : 900);
    }
    exp(ins) {
      this.party.forEach((id, i) => {
        const c = D().chars[id];
        const row = this.$(`.mrow[data-id="${id}"]`);
        const gain = id === this.mvp ? Math.round(EXP_GAIN * 1.2) : EXP_GAIN;
        const bar = row.querySelector('.xbar i');
        G.countTo(row.querySelector('.xg'), 0, gain, ins ? 1 : 1000, { fmt: (v) => '+' + G.fmt(v) });
        const e0 = c.exp[0], mx = c.exp[1];
        const e1 = e0 + gain;
        const dur = 1100;
        if (e1 >= mx) {
          const tl = ((mx - e0) / gain) * dur;
          const rest = (e1 - mx) / (mx * 1.04);
          const lvl = () => {
            row.querySelector('.lvn').textContent = c.lv + 1;
            row.querySelector('.lvup').classList.add('go');
            bar.style.transition = 'none';
            bar.style.transform = 'scaleX(0)';
            void bar.offsetWidth;
            bar.style.transition = ins ? 'none' : `transform ${dur - tl}ms linear`;
            bar.style.transform = `scaleX(${rest.toFixed(3)})`;
          };
          if (ins) lvl();
          else {
            bar.style.transition = `transform ${tl}ms linear`;
            bar.style.transform = 'scaleX(1)';
            this.after(tl, lvl);
          }
        } else {
          bar.style.transition = ins ? 'none' : `transform ${dur}ms linear`;
          bar.style.transform = `scaleX(${(e1 / mx).toFixed(3)})`;
        }
      });
    }
    openChest(k, ins) {
      const ch = this.$(`.chest[data-k="${k}"]`);
      const items = this.$$(`.ri[data-c="${k}"]`);
      const showItems = (dl) => items.forEach((it, j) => (ins ? it.classList.add('on') : this.after(dl + j * 130, () => it.classList.add('on'))));
      if (ins) { ch.classList.add('open'); showItems(0); return; }
      const gold = CHESTS[k].r === 'gold';
      ch.classList.add('shake');
      if (gold) ch.classList.add('leak');
      const sd = gold ? 620 : 660;
      this.after(sd, () => {
        ch.classList.remove('shake');
        ch.classList.add('open');
        if (gold) {
          const f = G.html('<div class="tr-flash" style="position:absolute;inset:0;z-index:50;pointer-events:none;animation:fadeOut .7s ease-out both"></div>');
          this.root.appendChild(f);
          this.after(720, () => f.remove());
        }
        showItems(gold ? 300 : 200);
      });
    }
    finish() {
      this.root.classList.add('done');
      this.$('.r-foot .hint').innerHTML = `${G.icon('ui-check')}全部奖励已存入背包`;
      if (!G.touring && !G.exporting) G.UI.setHover(this.$('.btn[data-act="home"]'));
    }
    skip() {
      if (this.root.classList.contains('done')) return;
      G.cancelOwner(this);
      this.root.classList.add('instant');
      this.steps.forEach((s, i) => this.runStep(i, true));
    }
    act(a) {
      if (a === 'retry') G.App.go('battle', {}, 'fade');
      else if (a === 'home') G.App.go('quest', { tier: this.q.tier }, 'wind');
    }
    blankClick() { this.skip(); }
    key(e) {
      const k = e.key.toLowerCase();
      const done = this.root.classList.contains('done');
      if (!done) { if (k === ' ' || k === 'enter' || k === 'escape') { this.skip(); return true; } return true; }
      if (k === 'r') { G.UI.click(this.$('.btn[data-act="retry"]')); return true; }
      if (k === 'arrowleft' || k === 'arrowright') { G.navList(this.$$('.r-foot .btn'), k === 'arrowleft' ? -1 : 1); return true; }
      if (k === 'enter' || k === ' ') { const h = G.UI.hover; G.UI.click(h && h.classList.contains('btn') ? h : this.$('.btn[data-act="home"]')); return true; }
      return false;
    }
    back() {
      if (!this.root.classList.contains('done')) return this.skip();
      G.UI.click(this.$('.btn[data-act="home"]'));
    }
  }
  G.App.register('results', ResultsScene);
})();
