/* =====================================================================
   4.4 战斗画面 & 4.5 奥义与连锁奥义
   编排流程：首领登场 → 交战 → 连携时刻 → 首领超载 → 连锁奥义 → 破防 → 讨伐成功
   所有事件按战斗时刻调度；随机数固定种子，逐帧导出时画面完全一致
   ===================================================================== */
(function () {
  'use strict';
  const D = () => G.DATA;
  const E = G.E;
  const HPL = 4000000, LAYERS = 5;
  const SLOTS = [[-250, -120], [10, -160], [250, -110], [-330, 10], [330, 0], [-240, 120], [20, 150], [250, 115], [-120, -40], [140, 40], [-110, 50], [130, -50]];
  const LAYER_COL = [null, ['#d2a6ff', '#6a2fd8'], ['#ff8fcf', '#c41d7a'], ['#ff7f6a', '#d42424'], ['#ffb066', '#ec5c16'], ['#fff6a8', '#f0be28']];
  const OCT = 'M14 2H34L46 14V34L34 46H14L2 34V14Z';
  const OCT_IN = 'M15.6 6H32.4L42 15.6V32.4L32.4 42H15.6L6 32.4V15.6Z';
  const T = { HUD: 3700, LINK: 9500, OVER: 14200, TELE: 1800, BOSSHIT: 2900, HEAL: 3300, READY: 3800, AUTOQ: 900, LINKDUR: 9000, BREAKDUR: 9000 };
  const AUTO_SKILLS = [4700, 6000, 7300, 8500, 11000, 12300, 13500, 15300, 16700];
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const smooth = (a, b, x) => { const t = G.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const PAL = {
    wind: ['#e9fff4', '#8ff5c4', '#3fd68f', '#b8fff0', '#ffffff'],
    fire: ['#fff2c0', '#ffb347', '#ff6a3d', '#ff3a1a', '#ffe08a'],
    water: ['#e8fbff', '#8fdcff', '#3aa8ff', '#1d6fff', '#ffffff'],
    earth: ['#fff1c8', '#f2c46b', '#d49a3f', '#a8641c', '#ffe2a8'],
    light: ['#ffffff', '#fffbe0', '#ffe68a', '#ffd84a', '#fff4c0'],
    dark: ['#f0e0ff', '#c9a2ff', '#a674ff', '#6a2fe0', '#ffffff'],
  };

  class BattleScene extends G.Scene {
    enter(p) {
      G.BG.set('volcano');
      G.BG.state.shake = { x: 0, y: 0 };
      this.rng = G.rng(20261123);
      this.party = G.state.party.slice();
      this.leader = this.party[0];
      this.lc = D().chars[this.leader];
      this.q = G.questById(G.state.quest) || G.questById('x1');
      this.t0 = G.time;
      this.pausedTotal = 0;
      this.paused = false;
      this.phase = 'intro';
      this.lastInput = -1e9;
      this.userTouched = false;
      this.fx = [];
      this.shakes = [];
      this.ultDmg = {};
      this.stats = { taken: 0, maxCombo: 0, crits: 0, hits: 0 };
      const clock = () => this.bt();
      this.boss = { hp: new G.TV(HPL * LAYERS, clock), trail: new G.TV(HPL * LAYERS, clock), mode: new G.TV(12, clock), state: 'normal', floor: HPL * 2.4 };
      this.slotUse = SLOTS.map(() => -1e9);
      this.mem = this.party.map((id, i) => {
        const st = G.calcStats(id);
        return { id, i, c: D().chars[id], hpMax: st.hp, hp: new G.TV(st.hp, clock), trail: new G.TV(st.hp, clock), ult: new G.TV(i === 0 ? 32 : 24 + i * 7, clock), ready: false, dmg: 0 };
      });
      this.link = { v: new G.TV(28, clock), active: false, start: 0, end: 0 };
      this.skills = G.state.builds[this.leader].skills.map((sid) => ({ sid, S: D().SKILLS[sid], readyAt: 0, cdTotal: 1 }));
      this.combo = { n: 0, last: -1e9 };
      this.locked = true;
      this.hudStart = T.HUD;
      this.build();
      this.onFrame((t) => this.frame(t));
      if (p.start === 'chain') this.setupChainStart();
      else this.startIntro();
    }
    bt() { return (this.paused ? this.pauseAt : G.time) - this.t0 - this.pausedTotal; }
    atB(bt, fn) { return this.at(this.t0 + this.pausedTotal + bt, fn); }
    bossPos(bt) {
      return { x: 960 + 70 * Math.sin(bt * 0.00042) + 24 * Math.sin(bt * 0.0011), y: 426 + 20 * Math.sin(bt * 0.0008 + 1) };
    }
    /* ================= 构建 ================= */
    build() {
      this.root.innerHTML = `
        <div class="b-world"><canvas class="b-fx"></canvas>
          <div class="reticle locked"><svg viewBox="-130 -130 260 260">
            <g class="rg"><circle r="96" fill="none" stroke="#ff9a6a" stroke-width="2.2" stroke-dasharray="46 16 6 16" opacity=".9"/></g>
            <g class="rgr"><path d="${G.astroRing(116, { ticks: 48, major: 4 })}" stroke="#ffb890" stroke-width="2" opacity=".7"/></g>
            <g class="brkts" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round">
              <path d="M-74 -46V-74H-46M46 -74H74V-46M74 46V74H46M-46 74H-74V46"/></g>
            <path d="M0 -12L12 0L0 12L-12 0Z" fill="none" stroke="#fff" stroke-width="2.2"/><circle r="3" fill="#ff6a3d"/>
          </svg><div class="lk">LOCK ON<b>焰冠龙 · 焰冠</b></div></div>
          <div class="b-dmg"></div></div>
        <div class="b-tint"></div>
        <div class="hud-wrap"></div>
        <div class="b-chain"></div>
        <div class="cine"><i class="lbx top"></i><i class="lbx bot"></i></div>
        <div class="b-pause" hidden></div>`;
      this.world = this.$('.b-world');
      this.fxc = G.canvas(this.$('.b-fx'), { q: 1, maxK: 2.2 });
      this.reticle = this.$('.reticle');
      this.dmgLayer = this.$('.b-dmg');
      this.tint = this.$('.b-tint');
    }
    exit() {
      G.dropCanvas(this.fxc);
      G.BG.state.shake = { x: 0, y: 0 };
    }
    hudIn() {
      const L = this.lc, q = this.q;
      const wrap = this.$('.hud-wrap');
      const halo = `<svg class="halo" viewBox="-50 -50 100 100"><circle r="47" fill="none" style="stroke:var(--c)" stroke-width="1.4" stroke-opacity=".8"/><path d="${G.astroRing(47, { ticks: 48, major: 4 })}" style="stroke:var(--c)" stroke-width="1" stroke-opacity=".8"/><path d="${G.star4(0, -47, 6)}" fill="#ffe29a"/></svg>`;
      const C = 2 * Math.PI * 62;
      wrap.innerHTML = `
        <div class="h-quest"><div class="qi"><svg viewBox="-50 -50 100 100"><circle r="46" fill="url(#rg-boss)" stroke="#e9c27a" stroke-width="2.4"/><use href="#q-boss" x="-27" y="-28" width="54" height="54" fill="#fff"/></svg></div>
          <div class="qt"><small>${q.name} · ${D().TIERS.find((t) => t.id === q.tier).name}</small><b>讨伐 ${q.boss.name}</b></div>
          <div class="tm"><b class="num t-time">00:00</b><small>LIMIT 20:00</small></div></div>
        <div class="h-boss">
          <div class="hb-top">${G.elBadge('fire')}<span class="tt">天渊兽</span><span class="nm">焰冠龙 伊格瑞斯</span><span class="lv num">Lv 120</span><span class="st slowst">${G.icon('ui-slow')}行动减缓</span><span class="wk">弱点${G.elBadge(q.boss.weak || 'water')}</span></div>
          <div class="hb-hp"><div class="hpbar"><i class="under"></i><i class="trail"></i><i class="fill"></i><i class="ticks"></i><i class="flash"></i></div>
            <div class="layers"><svg viewBox="0 0 66 56"><path d="M17 2H49L64 28L49 54H17L2 28Z" fill="#1a0606" stroke="#e8c27a" stroke-width="2.4"/><path d="M19.5 6.5H46.5L59 28L46.5 49.5H19.5L7 28Z" fill="none" stroke="rgba(255,200,140,.4)" stroke-width="1"/></svg><b><small>×</small><span class="lyr">5</span></b></div></div>
          <div class="hb-mode"><span class="ml"><b>模式槽</b>MODE</span><div class="mgauge">${'<i></i>'.repeat(20)}</div><span class="ms"></span></div>
          <div class="hb-break"><i></i></div>
        </div>
        <div class="h-combo"><b class="num">0</b><em>HITS<span>连击</span></em><div class="cb"><i></i></div></div>
        <div class="h-party">${this.mem.slice(1).map((m) => `<div class="pm el-${m.c.el}" data-i="${m.i}">${G.crest(m.id)}<div class="pm-body">
          <div class="pm-top"><b>${m.c.name}</b>${G.elBadge(m.c.el)}<span class="lv">Lv${m.c.lv}</span><span class="ai">AI</span><span class="buffs"></span><span class="hpn num">${G.fmt(m.hpMax)}</span></div>
          <div class="bbar"><i class="trail"></i><i class="fill"></i></div><div class="ubar"><i></i></div></div>
          <div class="rdy"><svg viewBox="-10 -10 20 20"><path d="${G.star4(0, 0, 9.5)}"/></svg></div></div>`).join('')}</div>
        <div class="pp el-${L.el}"><div class="pp-bg"></div><div class="pp-crest">${halo}${G.crest(this.leader)}</div><div class="pp-body">
          <div class="pp-top"><b>${L.name}</b><em>${L.en}</em>${G.elBadge(L.el)}<span class="lv num">Lv ${L.lv}</span><span class="p1">${G.icon('ui-pad')}操作中</span></div>
          <div class="hprow"><div class="bbar"><i class="trail"></i><i class="fill"></i></div><span class="num pp-hpn">${G.fmt(this.mem[0].hpMax)}<small> / ${G.fmt(this.mem[0].hpMax)}</small></span></div>
          <div class="ultrow"><label>奥义</label><div class="pultbar"><i></i><i></i><i></i><i></i></div><span class="pct num">0%</span></div></div>
          <div class="rdyq"><kbd>Q</kbd>奥义 · READY</div><div class="buffs"></div></div>
        <div class="h-link"><svg viewBox="-75 -75 150 150">
            <defs><linearGradient id="lkG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ff0ff"/><stop offset="1" stop-color="#3a8cff"/></linearGradient>
            <linearGradient id="lkG2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#8ff0ff"/><stop offset="1" stop-color="#ffb3e6"/></linearGradient></defs>
            <circle class="lk-track" r="62"/><circle class="lk-fill" r="62" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
            <circle class="lk-ring" r="73"/><path class="lk-ticks" d="${G.astroRing(73, { ticks: 40, major: 5 })}"/>
            <g class="lk-spin"><path d="${G.star4(0, -73, 7)}" fill="#ffe29a"/><path d="${G.star4(0, 73, 5)}" fill="#8ff0ff"/></g></svg>
          <div class="lk-c"><small>连携值</small><b class="num"><span class="lkv">28</span><small>%</small></b><em>LINK</em></div></div>
        <div class="h-skills">${this.skills.map((s, k) => `<div class="sk el-${L.el}" data-act="skill" data-k="${k}"><div class="sk-box"><svg viewBox="0 0 48 48"><path d="${OCT}" fill="url(#g-el-${L.el})"/><path d="${OCT_IN}" fill="rgba(6,12,32,.5)" stroke="rgba(255,255,255,.6)" stroke-width="1.1"/><use href="#${s.S.icon}" x="12" y="12" width="24" height="24" fill="#fff" color="#fff"/></svg><div class="cdm"></div><div class="glint"></div><div class="cdn num"></div><div class="rdyfx"></div></div><kbd class="key">${k + 1}</kbd><span class="snm">${s.S.name}</span></div>`).join('')}
          <div class="ultb el-${L.el}" data-act="ult"><svg viewBox="-75 -75 150 150"><circle r="66" fill="rgba(6,12,34,.88)" stroke="rgba(255,226,154,.6)" stroke-width="1.5"/><circle r="56" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="9"/><circle class="u-fill" r="56" style="stroke:var(--c)" stroke-dasharray="${(2 * Math.PI * 56).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 56).toFixed(1)}"/><path d="${G.astroRing(70, { ticks: 36, major: 3 })}" stroke="rgba(255,226,154,.5)" stroke-width="1"/><g class="u-spin"><path d="${G.star4(0, -70, 9)}" fill="#fff6d6"/><path d="${G.star4(0, 70, 7)}" fill="#ffe29a"/><path d="${G.star4(-70, 0, 6)}" fill="#ffe29a"/><path d="${G.star4(70, 0, 6)}" fill="#ffe29a"/></g></svg>
            <kbd class="key">Q</kbd><div class="uc"><b>奥义</b><span class="num upct">0%</span></div></div></div>
        <div class="h-pause brk" data-act="pause"><span class="pz-ic">${G.icon('ui-pause')}</span>暂停<kbd>Esc</kbd></div>
        <div class="b-help"><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd>技能</span><span data-act="ult"><kbd>Q</kbd>奥义</span><span data-act="lock"><kbd>Tab</kbd>锁定</span><span data-act="pause"><kbd>Esc</kbd>暂停</span></div>`;
      const H = (this.H = {});
      H.time = wrap.querySelector('.t-time');
      H.under = wrap.querySelector('.hpbar .under');
      H.trail = wrap.querySelector('.hpbar .trail');
      H.fill = wrap.querySelector('.hpbar .fill');
      H.flash = wrap.querySelector('.hpbar .flash');
      H.layers = wrap.querySelector('.layers');
      H.lyr = wrap.querySelector('.lyr');
      H.mg = wrap.querySelector('.mgauge');
      H.mgSegs = Array.from(H.mg.children);
      H.ms = wrap.querySelector('.ms');
      H.brk = wrap.querySelector('.hb-break');
      H.brkBar = wrap.querySelector('.hb-break i');
      H.slow = wrap.querySelector('.slowst');
      H.combo = wrap.querySelector('.h-combo');
      H.comboN = wrap.querySelector('.h-combo b');
      H.comboBar = wrap.querySelector('.h-combo .cb i');
      H.pm = this.mem.map((m) => (m.i === 0 ? wrap.querySelector('.pp') : wrap.querySelector(`.pm[data-i="${m.i}"]`)));
      H.pp = wrap.querySelector('.pp');
      H.ppHpn = wrap.querySelector('.pp-hpn');
      H.ultSegs = Array.from(wrap.querySelectorAll('.pultbar > i'));
      H.ultBar = wrap.querySelector('.pultbar');
      H.ultPct = wrap.querySelector('.pp .pct');
      H.link = wrap.querySelector('.h-link');
      H.lkFill = wrap.querySelector('.lk-fill');
      H.lkV = wrap.querySelector('.lkv');
      H.lkLbl = wrap.querySelector('.lk-c small');
      H.sk = Array.from(wrap.querySelectorAll('.sk'));
      H.ultb = wrap.querySelector('.ultb');
      H.ufill = wrap.querySelector('.u-fill');
      H.upct = wrap.querySelector('.upct');
      this.lkC = C;
      this.uC = 2 * Math.PI * 56;
      this.skillCool = this.skills.map(() => false);
      this.root.classList.add('hud-on');
    }
    /* ================= 开场 ================= */
    startIntro() {
      const q = this.q;
      const cine = this.$('.cine');
      cine.classList.add('on');
      const name = '焰冠龙 伊格瑞斯';
      const intro = G.html(`<div class="intro"><div class="in-pre">天渊兽<em>ABYSSAL BEAST</em></div>
        <div class="in-name">${[...name].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</div>
        <div class="in-line"></div><div class="in-en">IGNIRIS, THE FLAME-CROWNED</div>
        <div class="in-info">Lv 120<i></i>${G.elBadge('fire')}火属性<i></i>弱点${G.elBadge('water')}水属性</div></div>`);
      cine.appendChild(intro);
      this.addFx({ type: 'ember', life: 3600, x: 960, y: 520 });
      this.atB(700, () => { this.shake(10, 600); this.addFx({ type: 'ring', life: 900, x: 960, y: 430, r0: 40, r1: 700, col: '#ff8a4a', w: 10 }); });
      this.atB(3100, () => intro.classList.add('out'));
      this.atB(3400, () => { cine.classList.remove('on'); cine.classList.add('off'); });
      this.atB(3650, () => { intro.remove(); cine.classList.remove('off'); });
      this.atB(T.HUD, () => this.beginFight());
    }
    beginFight() {
      this.hudIn();
      this.phase = 'engage';
      this.hudStart = this.bt();
      G.retrigger(this.reticle, 'lockin');
      this.reticle.classList.add('on');
      // 队友与自动攻击
      this.atB(this.bt() + 400, () => this.autoAtk());
      [1, 2, 3].forEach((i) => this.atB(this.bt() + 500 + i * 240, () => this.aiAct(i)));
      AUTO_SKILLS.forEach((t, n) => this.atB(t, () => this.autoSkill(n)));
      // 首领的小型攻击
      this.atB(6400, () => this.bossMinor('炎翼扫击', [0, 3], 0.1));
      this.atB(11800, () => this.bossMinor('熔岩吐息', [1, 2], 0.14));
      // 编排保证：未操作时按时推进
      this.atB(T.LINK, () => { if (!this.link.active && this.phase === 'engage') this.forceLink(); });
      this.atB(T.OVER, () => { if (this.boss.state === 'normal') this.forceOverload(); });
    }
    setupChainStart() {
      // 「奥义与连锁奥义」入口：直接来到超载后的奥义时刻
      this.chainEntry = true;
      this.pausedTotal = -(T.OVER + T.READY - 600);
      this.hudIn();
      this.reticle.classList.add('on');
      this.phase = 'engage';
      this.boss.hp.set(HPL * 2.78);
      this.boss.trail.set(HPL * 2.78);
      this.H.lyr.textContent = '3';
      this.link.v.set(64);
      this.mem.forEach((m, i) => { m.ult.set(i === 0 ? 94 : 97); m.hp.set(m.hpMax * (0.62 + i * 0.07)); m.trail.set(m.hp.target); });
      this.combo.n = 214;
      this.combo.last = this.bt();
      this.skills.forEach((s, k) => { s.cdTotal = s.S.cd * 1000; s.readyAt = this.bt() + [0, 2600, 5200, 0][k]; });
      this.overload(true);
      this.overAt = this.bt() - T.READY + 600;
      this.atB(this.bt() + 120, () => this.autoAtk());
      [1, 2, 3].forEach((i) => this.atB(this.bt() + 300 + i * 200, () => this.aiAct(i)));
      this.atB(this.bt() + 600, () => this.setReady());
    }
    /* ================= 时序推进 ================= */
    canAct() { return ['engage', 'unload'].includes(this.phase) && !this.paused; }
    autoAtk() {
      if (this.phase === 'victory' || this.phase === 'done') return;
      if (this.canAct() && this.phase !== 'unload') {
        const n = this.combo.n;
        this.hit(0, 15000 + (n % 4) * 2200, { critRate: 0.2, fx: n % 3 === 0 ? 'slash' : 'hit' });
      }
      this.after(this.link.active ? 340 : 400, () => this.autoAtk());
    }
    autoSkill(n) {
      if (!this.canAct() || this.phase === 'unload') return;
      if (this.bt() - this.lastInput < 2500) return;
      const order = [0, 1, 2, 3, 0, 1, 3, 0, 2];
      let k = order[n % order.length];
      if (this.bt() < this.skills[k].readyAt) k = this.skills.findIndex((s) => this.bt() >= s.readyAt);
      if (k >= 0) this.useSkill(k, true);
    }
    aiAct(i) {
      if (this.phase === 'victory' || this.phase === 'done') return;
      const m = this.mem[i];
      const R = this.rng;
      if (this.canAct() && this.phase !== 'unload') {
        m.acts = (m.acts || 0) + 1;
        const skill = m.acts % 4 === 2;
        if (skill) {
          const sid = m.c.skills ? G.state.builds[m.id].skills[((m.acts >> 2) + 2) % 4] : null;
          if (sid) this.aiCall(i, sid);
          if (sid === 'prayer') this.healParty(i, 0.18);
          const n = 3;
          for (let k = 0; k < n; k++) this.after(160 + k * 110, () => this.hit(i, this.aiBase(m) * 1.25, { critRate: 0.3, fx: k === n - 1 ? 'burst' : 'slash' }));
        } else {
          const n = m.c.el === 'earth' ? 1 : 2;
          for (let k = 0; k < n; k++) this.after(k * 130, () => this.hit(i, this.aiBase(m), { critRate: 0.22 }));
        }
      }
      const base = { fire: 950, water: 1150, earth: 1350 }[m.c.el] || 1100;
      this.after(base + (R() - 0.5) * 360, () => this.aiAct(i));
    }
    aiBase(m) {
      return { fire: 30000, water: 34000, earth: 76000, wind: 28000, dark: 31000, light: 30000 }[m.c.el] || 30000;
    }
    /* ================= 伤害 ================= */
    hit(i, base, o = {}) {
      const m = this.mem[i];
      const R = this.rng;
      let dmg = base * (0.86 + R() * 0.28);
      if (this.link.active) dmg *= 1.3;
      if (this.boss.state === 'break') dmg *= 1.5;
      const crit = o.crit || R() < (o.critRate == null ? 0.2 : o.critRate);
      if (crit) dmg *= 2.05;
      const weak = m.c.el === (this.q.boss.weak || 'water');
      if (weak) dmg *= 1.5;
      dmg = Math.round(dmg);
      const type = weak ? 'weak' : crit ? 'crit' : 'n';
      const tag = weak ? (crit ? 'WEAK · CRIT' : 'WEAK 弱点') : crit ? 'CRITICAL' : '';
      const sp = this.slotPos(R);
      const x = sp.x + (o.dx || 0), y = sp.y + (o.dy || 0);
      this.dmgNum(dmg, type, x, y, tag);
      this.addFx({ type: o.fx || 'hit', life: o.fx === 'slash' ? 320 : o.fx === 'burst' ? 520 : 300, x: x + (R() - 0.5) * 60, y: y + 40, col: D().ELEMENTS[m.c.el].c, a: R() * 6.28, seed: R() * 1000 });
      if (crit) this.stats.crits++;
      this.applyDamage(i, dmg, o);
      return dmg;
    }
    applyDamage(i, dmg, o = {}) {
      const m = this.mem[i];
      const B = this.boss;
      const hp0 = B.hp.target;
      const hp1 = Math.max(o.noFloor ? 0 : B.floor, hp0 - dmg);
      B.hp.to(hp1, 260, E.outCubic);
      this.after(340, () => B.trail.to(B.hp.target, 560, E.inOutCubic));
      const L0 = Math.ceil(hp0 / HPL - 1e-9), L1 = Math.ceil(hp1 / HPL - 1e-9);
      if (L1 < L0 && hp1 > 0) this.layerBreak(L1);
      m.dmg += dmg;
      this.stats.hits++;
      // 模式槽
      if (B.state === 'normal') {
        const cap = this.link.active || this.userTouched ? 100 : 90;
        const capT = this.bt() < T.OVER && !this.userTouched ? 97 : 100;
        const nv = Math.min(Math.min(cap, capT), B.mode.target + dmg / 64000);
        B.mode.to(nv, 300);
        if (nv >= 100) this.overload();
      } else if (B.state === 'over') {
        B.mode.to(Math.max(o.finisher ? 0 : 9, B.mode.target - dmg / 60000), 300);
      }
      // 连携值
      if (!this.link.active && this.phase === 'engage') {
        const capL = this.bt() < T.LINK && !this.userTouched ? 97 : 100;
        const nv = Math.min(capL, this.link.v.target + (i === 0 ? 2.5 : 2.0) + (o.linkBonus || 0));
        this.link.v.to(nv, 300);
        if (nv >= 100) this.linkTime();
      }
      // 奥义槽
      if (this.phase !== 'chain') {
        const capU = i === 0 ? (this.readyOK ? 100 : 95) : this.readyOK ? 100 : 98;
        m.ult.to(Math.min(capU, m.ult.target + (i === 0 ? 1.5 : 1.25) + (o.ultBonus || 0)), 300);
      }
      // 连击
      this.combo.n++;
      this.combo.last = this.bt();
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo.n);
      if (this.H && this.combo.n % 1 === 0) G.retrigger(this.H.comboN, 'bump');
    }
    slotPos(R) {
      let k = 0;
      for (let i = 1; i < SLOTS.length; i++) if (this.slotUse[i] < this.slotUse[k]) k = i;
      this.slotUse[k] = G.time;
      const bp = this.bossPos(this.bt());
      return { x: bp.x + SLOTS[k][0] + (R() - 0.5) * 50, y: bp.y + SLOTS[k][1] + (R() - 0.5) * 34 - 10 };
    }
    dmgNum(val, type, x, y, tag, extraCls = '') {
      const el = document.createElement('div');
      el.className = `dnum ${type} ${extraCls}`;
      el.style.left = x.toFixed(1) + 'px';
      el.style.top = y.toFixed(1) + 'px';
      const txt = typeof val === 'string' ? val : G.fmt(val);
      el.innerHTML = (tag ? `<i class="tag">${tag}</i>` : '') + `<b data-t="${txt}"><span>${txt}</span></b>`;
      this.dmgLayer.appendChild(el);
      this.after(type === 'ult' ? 1900 : 1400, () => el.remove());
      return el;
    }
    layerBreak(L) {
      if (!this.H) return;
      this.H.lyr.textContent = String(L);
      G.retrigger(this.H.layers, 'pop');
      G.retrigger(this.H.flash, 'go');
      this.shake(5, 300);
    }
    /* ================= 技能 ================= */
    useSkill(k, auto) {
      const s = this.skills[k];
      const el = this.H && this.H.sk[k];
      if (!s || !this.H) return;
      if (!this.canAct() || this.phase === 'unload' || this.bt() < s.readyAt) {
        if (!auto && el) G.retrigger(el, 'deny');
        return;
      }
      const cd = s.S.cd * 1000 * (this.link.active ? 0.8 : 1);
      s.readyAt = this.bt() + cd;
      s.cdTotal = cd;
      G.retrigger(el, 'fire');
      this.keyPop(el, String(k + 1));
      const kb = el.querySelector('.key');
      kb.classList.add('kp');
      this.after(160, () => kb.classList.remove('kp'));
      this.atB(s.readyAt, () => this.skillReady(k, s.readyAt));
      const icon = s.S.icon;
      const total = Math.max(160000, s.S.pow * 430);
      let n = { 'sk-multi': 5, 'sk-whirl': 6, 'sk-dash': 3, 'sk-thrust': 2, 'sk-rain': 6, 'sk-shot': 4 }[icon] || 1;
      if (s.S.pow === 0) {
        this.partyBuff('atk', 15000);
        this.addFx({ type: 'ring', life: 700, x: 380, y: 920, r0: 20, r1: 300, col: '#8ff5c4', w: 6 });
        n = 0;
      }
      const forceCrit = s.sid === 'azure';
      for (let h = 0; h < n; h++)
        this.after(90 + h * (n > 3 ? 85 : 130), () =>
          this.hit(0, (total / n) / (forceCrit ? 2.05 : 1.2), { crit: forceCrit, critRate: 0.3, fx: h === n - 1 ? (n === 1 ? 'big' : 'burst') : 'slash', linkBonus: s.sid === 'cyclone' ? 3 : 1, ultBonus: 1.5 })
        );
    }
    keyPop(host, label) {
      const kp = G.html(`<kbd class="kpop">${label}</kbd>`);
      host.appendChild(kp);
      this.after(760, () => kp.remove());
    }
    skillReady(k, when) {
      const s = this.skills[k];
      if (!this.H || Math.abs(s.readyAt - when) > 1) return;
      G.retrigger(this.H.sk[k], 'rdy');
    }
    partyBuff(kind, dur) {
      if (!this.H) return;
      const icons = { atk: 'ui-atkup', ult: 'ui-ult', cd: 'ui-time', def: 'ui-shield' };
      this.H.pm.forEach((p) => {
        const b = p.querySelector('.buffs');
        if (!b || b.querySelector(`.bf[data-k="${kind}"]`)) return;
        const e = G.html(`<span class="bf" data-k="${kind}">${G.icon(icons[kind])}</span>`);
        b.appendChild(e);
        this.after(dur, () => e.remove());
      });
    }
    aiCall(i, sid) {
      if (!this.H) return;
      const p = this.H.pm[i];
      const S = D().SKILLS[sid];
      const e = G.html(`<div class="call">${G.skillBadge(sid, this.mem[i].c.el)}${S.name}</div>`);
      p.appendChild(e);
      this.after(1650, () => e.remove());
    }
    /* ================= 首领行动 ================= */
    telegraph(name, dur, sub) {
      const bp = this.bossPos(this.bt());
      const t = G.html(`<div class="tele" style="left:${bp.x.toFixed(0)}px;top:${(bp.y - 150).toFixed(0)}px"><div class="tp">${G.icon('ui-warn')}${name}</div><div class="tb"><i style="animation:barShrink ${dur}ms linear both"></i></div><small>${sub || ''}</small></div>`);
      this.world.appendChild(t);
      this.after(dur, () => { t.classList.add('out'); this.after(300, () => t.remove()); });
    }
    bossMinor(name, targets, pct) {
      if (!this.canAct()) return;
      this.telegraph(name, 900, '回避！');
      this.after(950, () => {
        this.shake(8, 350);
        this.addFx({ type: 'flash', life: 260, col: 'rgba(255,90,40,.35)' });
        targets.forEach((i) => this.hurt(i, pct));
      });
    }
    hurt(i, pct) {
      const m = this.mem[i];
      const d = Math.round(m.hpMax * pct * (0.9 + this.rng() * 0.2));
      const nv = Math.max(m.hpMax * 0.08, m.hp.target - d);
      m.hp.to(nv, 220);
      this.after(400, () => m.trail.to(m.hp.target, 500));
      this.stats.taken += d;
      if (this.H) {
        G.retrigger(this.H.pm[i], 'hit');
        const p = this.panelPos(i);
        this.dmgNum('-' + G.fmt(d), 'hurt', p.x, p.y);
      }
    }
    healParty(src, pct) {
      this.mem.forEach((m) => {
        const add = Math.round(Math.min(m.hpMax * pct, m.hpMax - m.hp.target));
        const nv = Math.min(m.hpMax, m.hp.target + add);
        m.hp.to(nv, 500);
        m.trail.to(nv, 500);
        if (this.H && add > 0) {
          const p = this.panelPos(m.i);
          this.dmgNum('+' + G.fmt(add), 'heal', p.x, p.y - 10);
        }
      });
    }
    panelPos(i) {
      if (i === 0) return { x: 600, y: 860 };
      return { x: 500, y: 590 + (i - 1) * 88 };
    }
    /* ================= 连携时刻 ================= */
    forceLink() {
      this.link.v.to(100, 500);
      this.after(520, () => this.linkTime());
    }
    linkTime() {
      if (this.link.active || this.linkDone) return;
      this.link.active = true;
      this.linkDone = true;
      this.link.start = this.bt() + 200;
      this.link.end = this.link.start + T.LINKDUR;
      this.link.v.set(100);
      if (this.H) G.retrigger(this.H.link, 'full');
      this.H && this.H.link.classList.add('active');
      this.tint.className = 'b-tint link';
      this.addFx({ type: 'flash', life: 400, col: 'rgba(160,240,255,.45)' });
      this.addFx({ type: 'ring', life: 900, x: 801, y: 961, r0: 30, r1: 900, col: '#8ff0ff', w: 8 });
      const b = this.banner('link', '连携时刻', 'LINK TIME', [['ui-atkup', '全队攻击力提升'], ['ui-ult', '奥义槽积累提升'], ['ui-time', '技能冷却加速'], ['ui-slow', '敌人行动减缓']], 1900);
      ['atk', 'ult', 'cd'].forEach((k) => this.partyBuff(k, T.LINKDUR));
      if (this.H) this.H.slow.classList.add('slow');
      this.atB(this.link.end, () => this.linkEnd());
    }
    linkEnd() {
      this.link.active = false;
      this.link.v.to(0, 400);
      if (this.H) { this.H.link.classList.remove('active'); this.H.slow.classList.remove('slow'); }
      if (this.boss.state === 'over') this.tint.className = 'b-tint over';
      else if (this.boss.state === 'break') this.tint.className = 'b-tint st-break';
      else this.tint.className = 'b-tint';
    }
    /* ================= 超载 ================= */
    forceOverload() {
      this.boss.mode.to(100, 450);
      this.after(460, () => this.overload());
    }
    overload(silent) {
      const B = this.boss;
      if (B.state !== 'normal') return;
      B.state = 'over';
      this.overAt = this.bt();
      B.mode.set(100);
      if (this.H) { this.H.mg.classList.add('over'); this.H.ms.className = 'ms over'; this.H.ms.innerHTML = `${G.icon('ui-warn')}超载`; }
      this.tint.className = 'b-tint ' + (this.link.active ? 'link' : 'over');
      if (silent) return;
      this.shake(14, 700);
      this.addFx({ type: 'flash', life: 500, col: 'rgba(255,60,20,.5)' });
      this.addFx({ type: 'ring', life: 1000, x: this.bossPos(this.bt()).x, y: this.bossPos(this.bt()).y, r0: 40, r1: 1100, col: '#ff4b2a', w: 14 });
      this.banner('over', '超载', 'OVERLOAD', null, 1900, '焰冠龙 伊格瑞斯 进入超载状态 · 攻击性大幅提升');
      const o = this.overAt;
      this.atB(o + T.TELE, () => { if (this.phase === 'engage') this.telegraph('熔核爆发', 1100, '全队即将受到大范围攻击'); });
      this.atB(o + T.BOSSHIT, () => {
        if (this.phase !== 'engage') return;
        this.shake(20, 600);
        this.addFx({ type: 'flash', life: 420, col: 'rgba(255,80,30,.55)' });
        this.addFx({ type: 'ring', life: 800, x: this.bossPos(this.bt()).x, y: this.bossPos(this.bt()).y, r0: 60, r1: 1300, col: '#ffb347', w: 18 });
        this.mem.forEach((m) => this.hurt(m.i, 0.32));
      });
      this.atB(o + T.HEAL, () => {
        if (this.phase !== 'engage') return;
        const ti = this.mem.findIndex((m) => m.c.skills.includes('prayer'));
        if (ti > 0) this.aiCall(ti, 'prayer');
        this.healParty(ti, 0.26);
      });
      this.atB(o + T.READY, () => this.setReady());
    }
    setReady() {
      if (this.chainStarted) return;
      this.readyOK = true;
      this.mem.forEach((m) => { m.ult.to(100, 400); });
      this.after(420, () => {
        this.mem.forEach((m) => (m.ready = true));
        if (this.H) {
          this.H.pp.classList.add('ready');
          this.H.ultb.classList.add('full');
          this.H.ultBar.classList.add('full');
          this.H.pm.forEach((p, i) => i > 0 && p.classList.add('ready'));
        }
      });
      const dq = G.exporting || G.touring ? T.AUTOQ : this.chainEntry ? 2800 : 1700;
      const tryAuto = () => {
        if (this.chainStarted) return;
        if (G.exporting || G.touring || this.bt() - this.lastInput > 1200) this.startChain(true);
        else this.after(500, tryAuto);
      };
      this.after(420 + dq, tryAuto);
    }
    /* ================= 连锁奥义 ================= */
    startChain(auto) {
      if (this.chainStarted || !this.mem[0].ready || this.paused) return;
      this.chainStarted = true;
      this.phase = 'chain';
      this.root.classList.add('in-chain');
      const C = this.bt();
      if (this.H) {
        G.retrigger(this.H.ultb, 'fire');
        this.keyPop(this.H.ultb, 'Q');
        const kb = this.H.ultb.querySelector('.key');
        kb.classList.add('kp');
        this.after(180, () => kb.classList.remove('kp'));
        this.H.pp.classList.remove('ready');
        this.H.ultb.classList.remove('full');
      }
      this.chain = { n: 1, total: 0, order: [] };
      this.boss.floor = HPL * 0.3;
      const seq = [
        [0, 0, 2200], [1, 2300, 1500], [2, 3900, 1500], [3, 5500, 1500],
      ];
      seq.forEach(([i, at, dur]) => this.atB(C + at, () => this.cutIn(i, dur)));
      this.atB(C + 7100, () => this.fullChain());
      this.atB(C + 8300, () => this.finisher());
      this.atB(C + 10300, () => this.chainTotal());
      this.atB(C + 11700, () => this.breakBanner());
      this.atB(C + 12600, () => this.unload(C + 15800));
      this.atB(C + 16000, () => this.victory());
    }
    cutIn(i, dur) {
      const m = this.mem[i];
      const c = m.c;
      const ci = G.html(`<div class="cutin el-${c.el} ${i > 0 ? 'chain' : ''} ${i % 2 ? 'alt' : ''}" style="--dur:${dur}ms">
        <div class="ci-dim"></div>
        <div class="ci-band"><div class="ci-bg"></div><div class="ci-lines"></div><div class="ci-glyph"><svg viewBox="0 0 48 48"><use href="#i-${c.el}" fill="#fff" color="#fff"/></svg></div>
          <div class="ci-crest"><svg class="halo" viewBox="-50 -50 100 100"><circle r="48" fill="none" stroke="#fff" stroke-width="1.4" stroke-opacity=".8"/><path d="${G.astroRing(48, { ticks: 72, major: 6 })}" stroke="#fff" stroke-width="1" stroke-opacity=".8"/><circle r="43" fill="none" stroke="rgba(255,255,255,.4)" stroke-width=".6" stroke-dasharray="1 3"/></svg>${G.crest(m.id)}</div>
          <div class="ci-txt"><div class="ci-who"><b>${c.name}</b><em>${c.en}</em>${G.elBadge(c.el)}<span class="tag">${i === 0 ? 'BURST' : 'CHAIN ' + (i + 1)}</span></div>
            <div class="ci-ult" data-t="${c.ult.name}">${c.ult.name}</div><div class="ci-en">${c.ult.en}</div></div></div>
        <div class="ci-voice">「${c.voice}」</div>
        <div class="ci-flash"></div></div>`);
      this.root.appendChild(ci);
      this.after(dur + 30, () => ci.remove());
      m.ult.to(0, dur * 0.8);
      m.ready = false;
      if (this.H && i > 0) this.H.pm[i].classList.remove('ready');
      if (this.H && i === 0) this.H.ultBar.classList.remove('full');
      this.after(dur - 220, () => this.ultHit(i));
    }
    ultHit(i) {
      const m = this.mem[i];
      const bp = this.bossPos(this.bt());
      const base = [1180000, 960000, 1060000, 1120000][i];
      let dmg = Math.round(base * (0.95 + this.rng() * 0.1) * (m.c.el === (this.q.boss.weak || 'water') ? 1.5 : 1));
      this.ultDmg[m.id] = dmg;
      this.chain.total += dmg;
      this.applyDamage(i, dmg, {});
      const el = this.dmgNum(dmg, 'ult', bp.x, bp.y - 20, `${m.c.ult.name}${m.c.el === (this.q.boss.weak || 'water') ? ' · WEAK' : ''}`, `el-${m.c.el}`);
      this.addFx({ type: 'boom', life: 900, x: bp.x, y: bp.y, col: D().ELEMENTS[m.c.el].c, el: m.c.el, seed: i * 31 });
      this.addFx({ type: 'flash', life: 320, col: 'rgba(255,255,255,.55)' });
      this.shake(18, 520);
      this.chainUI(i);
    }
    chainUI(i) {
      const box = this.$('.b-chain');
      this.chain.order.push(this.mem[i].c.el);
      const n = i + 1;
      this.chain.n = n;
      const links = this.chain.order.map((el, k) => (k ? '<i class="lk"></i>' : '') + G.elBadge(el)).join('');
      if (n === 1) {
        box.innerHTML = `<div class="ch-lbl">CHAIN<span>连锁</span></div><div class="ch-num"><div class="ch-wait">连锁准备<small>等待队友接续奥义</small></div></div><div class="ch-links">${links}</div><div class="ch-bar"><i></i></div><div class="ch-dmg">连锁伤害<b class="num">${G.fmt(this.chain.total)}</b></div>`;
      } else {
        box.innerHTML = `<div class="ch-lbl">${n === 4 ? 'FULL CHAIN' : 'CHAIN'}<span>${n === 4 ? '全员连锁' : '连锁'}</span></div><div class="ch-num"><b class="slam" data-t="${n}"><span>${n}</span></b><i class="ring go"></i></div><div class="ch-links">${links}</div><div class="ch-bar"><i></i></div><div class="ch-dmg">连锁伤害<b class="num">${G.fmt(this.chain.total)}</b></div>`;
      }
      box.className = 'b-chain on' + (n === 4 ? ' full' : '');
      this.chainWin = n < 4 ? { start: this.bt(), dur: 1800 } : null;
      this.chainBar = box.querySelector('.ch-bar i');
      if (n === 4) this.chainBar.style.transform = 'scaleX(1)';
    }
    fullChain() {
      const el = this.lc.el;
      const order = this.chain.order;
      const pos = [[-420, -60], [-140, -120], [140, -120], [420, -60]];
      const fc = G.html(`<div class="fullchain el-${el}"><div class="fc-bg"></div><div class="fc-flash"></div>
        <div class="fc-badges">${order.map((e, k) => `<span class="fcb" style="--i:${k};--x:${pos[k][0]}px;--y:${pos[k][1]}px">${G.elBadge(e)}</span>`).join('')}</div>
        <div class="fc-title" data-t="全员连锁"><span>全员连锁</span></div><div class="fc-en">FULL CHAIN BURST</div></div>`);
      this.root.appendChild(fc);
      this.shake(16, 500);
      this.addFx({ type: 'ring', life: 900, x: 960, y: 540, r0: 40, r1: 1200, col: '#ffe29a', w: 16 });
      this.after(1050, () => fc.classList.add('out'));
      this.after(1450, () => fc.remove());
    }
    finisher() {
      const el = this.lc.el;
      const F = D().FINISHERS[el];
      const bp = this.bossPos(this.bt());
      const fn = G.html(`<div class="finisher el-${el}"><div class="fn-bg"></div><div class="fn-txt"><span class="fn-tag">${G.elBadge(el)}FULL CHAIN FINISHER · ${D().ELEMENTS[el].en}</span>
        <div class="fn-name" data-t="${F.name}">${F.name}</div><div class="fn-en">${F.en}</div></div></div>`);
      this.root.appendChild(fn);
      this.addFx({ type: 'vortex', life: 2600, x: bp.x, y: bp.y, el, seed: 7 });
      this.after(2620, () => fn.remove());
      this.after(1700, () => {
        const bp2 = this.bossPos(this.bt());
        const dmg = 3482600 + Math.round(this.rng() * 90000);
        this.ultDmg.__fin = dmg;
        this.chain.total += dmg;
        this.applyDamage(0, dmg, { finisher: true });
        this.boss.mode.to(0, 350);
        this.dmgNum(dmg, 'ult', bp2.x, bp2.y - 30, `${F.name}`, `el-${el}`);
        const cd = this.$('.b-chain .ch-dmg b');
        if (cd) G.countTo(cd, this.chain.total - dmg, this.chain.total, 600);
        this.addFx({ type: 'boom', life: 1200, x: bp2.x, y: bp2.y, col: D().ELEMENTS[el].c, el, seed: 99, big: true });
        this.addFx({ type: 'flash', life: 500, col: 'rgba(255,255,255,.85)' });
        this.shake(28, 900);
        this.after(360, () => this.breakBoss());
      });
    }
    chainTotal() {
      const list = this.mem.map((m, k) => `<span style="--i:${k}">${G.elBadge(m.c.el)}${m.c.name}<b class="num">${G.fmt(this.ultDmg[m.id] || 0)}</b></span>`).join('') + `<span style="--i:4">${G.elBadge(this.lc.el)}终结技<b class="num">${G.fmt(this.ultDmg.__fin || 0)}</b></span>`;
      const tot = this.chain.total;
      const ct = G.html(`<div class="chaintotal"><div class="ct-band"></div><small>连锁总伤害</small><em>CHAIN TOTAL</em><b data-t="${G.fmt(tot)}"><span class="ctv">0</span></b><div class="ct-list">${list}</div></div>`);
      this.root.appendChild(ct);
      const v = ct.querySelector('.ctv');
      G.countTo(v, 0, tot, 650, { ease: E.outCubic });
      this.after(1250, () => ct.classList.add('out'));
      this.after(1650, () => ct.remove());
    }
    breakBoss() {
      const B = this.boss;
      B.state = 'break';
      this.breakEnd = this.bt() + T.BREAKDUR;
      if (this.H) {
        this.H.mg.classList.remove('over');
        this.H.mg.classList.add('st-break');
        this.H.ms.className = 'ms st-break';
        this.H.ms.innerHTML = '破防';
        this.H.brk.classList.add('on');
        // 模式槽碎裂
        const sh = G.html(`<div class="shards" style="left:${(G.rectOf(this.H.mg).cx).toFixed(0)}px;top:${(G.rectOf(this.H.mg).cy).toFixed(0)}px;position:absolute;z-index:40">${Array.from({ length: 18 }, (_, k) => `<i style="--dx:${((this.rng() - 0.5) * 700).toFixed(0)}px;--dy:${(this.rng() * 360 - 60).toFixed(0)}px;--r:${(this.rng() * 720 - 360).toFixed(0)}deg;left:${((k - 9) * 44).toFixed(0)}px;animation-delay:${(k % 5) * 20}ms"></i>`).join('')}</div>`);
        this.root.appendChild(sh);
        this.after(1200, () => sh.remove());
      }
      this.reticle.classList.add('broken');
      this.tint.className = 'b-tint st-break';
    }
    breakBanner() {
      const b = this.banner('brkb', '破防', 'BREAK', null, 1500, '焰冠龙 伊格瑞斯 陷入破防 · 短时间内无法行动');
      this.addFx({ type: 'ring', life: 800, x: 960, y: 510, r0: 60, r1: 1000, col: '#bfeaff', w: 10 });
      this.phase = 'unload-wait';
    }
    unload(endB) {
      this.phase = 'unload';
      this.root.classList.remove('in-chain');
      this.after(900, () => { const bc = this.$('.b-chain'); if (bc) bc.classList.remove('on'); });
      this.boss.floor = 0;
      const start = this.bt();
      const n = 22;
      const span = endB - start;
      const weak = (i) => this.mem[i].c.el === (this.q.boss.weak || 'water');
      // 预先分配：每一击的份额不同，最后一击正好清空生命
      const plan = [];
      let sum = 0;
      for (let k = 0; k < n; k++) {
        const i = k % 4;
        const crit = this.rng() < 0.32;
        const w = (0.55 + this.rng() * 0.9) * (crit ? 2.1 : 1) * (weak(i) ? 1.45 : 1) * (k === n - 1 ? 2.4 : 1);
        plan.push({ i, crit, w });
        sum += w;
      }
      const hp0 = this.boss.hp.target;
      plan.forEach((pl, k) => {
        const at = start + (span * k) / n + (k % 3) * 25;
        this.atB(at, () => {
          const dmg = k === n - 1 ? Math.round(this.boss.hp.target) : Math.round((hp0 * pl.w) / sum);
          const i = pl.i;
          const m = this.mem[i];
          const wk = weak(i);
          const sp = this.slotPos(this.rng);
          this.dmgNum(dmg, wk ? 'weak' : pl.crit ? 'crit' : 'n', sp.x, sp.y, wk ? (pl.crit ? 'WEAK · CRIT' : 'WEAK 弱点') : pl.crit ? 'CRITICAL' : '');
          this.addFx({ type: k % 2 ? 'slash' : 'burst', life: 420, x: sp.x, y: sp.y + 40, col: D().ELEMENTS[m.c.el].c, a: this.rng() * 6.28, seed: k });
          this.applyDamage(i, Math.min(dmg, Math.max(0, this.boss.hp.target)), { noFloor: true });
          if (k % 6 === 5) this.aiCall(Math.max(1, i), G.state.builds[this.mem[Math.max(1, i)].id].skills[k % 4]);
        });
      });
    }
    victory() {
      this.phase = 'victory';
      const B = this.boss;
      B.hp.to(0, 300);
      B.trail.to(0, 600);
      if (this.H) this.H.lyr.textContent = '0';
      this.shake(30, 1000);
      this.addFx({ type: 'boom', life: 1400, x: this.bossPos(this.bt()).x, y: this.bossPos(this.bt()).y, col: '#ffe29a', el: 'light', seed: 5, big: true });
      this.reticle.classList.remove('on');
      const time = this.bt() - this.hudStart;
      this.clearTime = time;
      this.after(500, () => {
        this.root.classList.add('hud-hide');
        const cine = this.$('.cine');
        cine.classList.add('on');
        const v = G.html(`<div class="victory"><div class="vc-flash"></div><div class="vc-rays"></div><div class="vc-main" data-t="讨伐成功"><span>讨伐成功</span></div><div class="vc-en">QUEST CLEAR</div><div class="vc-time"><small>通关时间</small>${G.fmtTime(time)}</div></div>`);
        this.root.appendChild(v);
      });
      this.after(2900, () => this.finish());
    }
    finish() {
      if (this.phase === 'done') return;
      this.phase = 'done';
      const totals = {};
      this.mem.forEach((m) => (totals[m.id] = m.dmg));
      G.state.result = { time: this.clearTime || this.bt(), dmg: totals, party: this.party.slice(), taken: this.stats.taken, maxCombo: this.stats.maxCombo, chain: 4, breaks: 1 };
      G.App.go('results', {}, 'flash');
    }
    banner(kind, main, en, chips, dur, sub) {
      const b = G.html(`<div class="banner ${kind}">${kind === 'over' ? '<i class="hz t"></i><i class="hz b"></i>' : ''}<div class="bn-main">${main}</div><div class="bn-en">${en}</div>
        ${chips ? `<div class="bn-sub">${chips.map(([ic, t], k) => `<span class="chip" style="--i:${k}">${G.icon(ic)}${t}</span>`).join('')}</div>` : sub ? `<div class="bn-sub">${sub}</div>` : ''}</div>`);
      this.root.appendChild(b);
      this.after(dur, () => b.classList.add('out'));
      this.after(dur + 460, () => b.remove());
      return b;
    }
    /* ================= 特效 ================= */
    addFx(f) {
      f.t0 = G.time;
      if (f.seed == null) f.seed = this.rng() * 1000;
      this.fx.push(f);
    }
    shake(amp, dur) { this.shakes.push({ t0: G.time, amp, dur, s: this.rng() * 10 }); }
    shakeAt(t) {
      let x = 0, y = 0;
      this.shakes = this.shakes.filter((s) => t - s.t0 < s.dur);
      for (const s of this.shakes) {
        const p = (t - s.t0) / s.dur;
        const a = s.amp * (1 - p) * (1 - p);
        x += a * Math.sin((t - s.t0) * 0.09 + s.s);
        y += a * Math.cos((t - s.t0) * 0.113 + s.s * 2);
      }
      return { x, y };
    }
    drawFx(t) {
      const ctx = G.begin2d(this.fxc);
      this.fx = this.fx.filter((f) => t - f.t0 < f.life);
      for (const f of this.fx) {
        const a = G.clamp((t - f.t0) / f.life, 0, 1);
        ctx.save();
        try { FXD[f.type] && FXD[f.type](ctx, f, a, t); } catch (e) { console.error(e); }
        ctx.restore();
      }
    }
    /* ================= 每帧渲染 ================= */
    frame(t) {
      const bt = this.bt();
      const bp = this.bossPos(bt);
      this.reticle.style.transform = `translate(${bp.x.toFixed(1)}px,${bp.y.toFixed(1)}px)`;
      const sh = this.shakeAt(t);
      this.world.style.transform = `translate(${sh.x.toFixed(1)}px,${sh.y.toFixed(1)}px)`;
      G.BG.state.shake = sh;
      this.drawFx(t);
      const H = this.H;
      if (!H) return;
      H.time.textContent = G.fmtTime(Math.max(0, (this.phase === 'victory' || this.phase === 'done' ? this.clearTime : bt - this.hudStart)), false);
      // 首领生命
      const B = this.boss;
      const hp = B.hp.get(bt), tr = Math.max(hp, B.trail.get(bt));
      const L = Math.max(1, Math.ceil(hp / HPL - 1e-9));
      const frac = hp <= 0 ? 0 : (hp - (L - 1) * HPL) / HPL;
      const trL = Math.ceil(tr / HPL - 1e-9);
      const trFrac = trL > L ? 1 : (tr - (L - 1) * HPL) / HPL;
      const col = LAYER_COL[Math.min(5, L)];
      H.fill.style.transform = `scaleX(${frac.toFixed(4)})`;
      H.fill.style.background = `linear-gradient(180deg, ${col[0]}, ${col[1]})`;
      H.trail.style.transform = `scaleX(${trFrac.toFixed(4)})`;
      const ucol = L > 1 ? LAYER_COL[L - 1] : null;
      H.under.style.background = ucol ? `linear-gradient(180deg, ${ucol[0]}, ${ucol[1]})` : 'transparent';
      // 模式槽
      const mv = B.mode.get(bt);
      const segs = H.mgSegs;
      for (let k = 0; k < 20; k++) segs[k].style.setProperty('--f', G.clamp((mv / 100) * 20 - k, 0, 1).toFixed(3));
      if (B.state === 'break') H.brkBar.style.transform = `scaleX(${G.clamp((this.breakEnd - bt) / T.BREAKDUR, 0, 1).toFixed(4)})`;
      // 队伍
      this.mem.forEach((m, i) => {
        const p = H.pm[i];
        const hv = m.hp.get(bt), tv = Math.max(hv, m.trail.get(bt));
        const r = hv / m.hpMax;
        const bar = p.querySelector('.bbar');
        bar.querySelector('.fill').style.transform = `scaleX(${r.toFixed(4)})`;
        bar.querySelector('.trail').style.transform = `scaleX(${(tv / m.hpMax).toFixed(4)})`;
        const cls = r < 0.25 ? 'crit' : r < 0.5 ? 'low' : '';
        if (bar._c !== cls) { bar.classList.remove('low', 'crit'); if (cls) bar.classList.add(cls); bar._c = cls; }
        const uv = m.ult.get(bt);
        if (i === 0) {
          H.ppHpn.firstChild.textContent = G.fmt(hv);
          H.ultSegs.forEach((s, k) => s.style.setProperty('--f', G.clamp(uv / 25 - k, 0, 1).toFixed(3)));
          H.ultPct.textContent = Math.floor(uv) + '%';
          H.upct.textContent = Math.floor(uv) + '%';
          H.ufill.style.strokeDashoffset = (this.uC * (1 - uv / 100)).toFixed(1);
        } else {
          p.querySelector('.hpn').textContent = G.fmt(hv);
          const ub = p.querySelector('.ubar');
          ub.firstChild.style.transform = `scaleX(${(uv / 100).toFixed(4)})`;
          const full = uv >= 99.9;
          if (ub._f !== full) { ub.classList.toggle('full', full); ub._f = full; }
        }
      });
      // 连携
      let lv = this.link.v.get(bt);
      if (this.link.active) lv = 100 * G.clamp(1 - (bt - this.link.start) / T.LINKDUR, 0, 1);
      H.lkFill.style.strokeDashoffset = (this.lkC * (1 - lv / 100)).toFixed(1);
      H.lkV.textContent = Math.floor(lv);
      const ll = this.link.active ? '连携时刻' : '连携值';
      if (H.lkLbl.textContent !== ll) H.lkLbl.textContent = ll;
      // 技能
      this.skills.forEach((s, k) => {
        const el = H.sk[k];
        const rem = s.readyAt - bt;
        const cooling = rem > 0;
        if (this.skillCool[k] !== cooling) { el.classList.toggle('cooling', cooling); this.skillCool[k] = cooling; }
        const cdm = el.querySelector('.cdm'), cdn = el.querySelector('.cdn');
        if (cooling) {
          cdm.style.setProperty('--p', ((rem / s.cdTotal) * 360).toFixed(1) + 'deg');
          cdn.textContent = rem < 3000 ? (rem / 1000).toFixed(1) : Math.ceil(rem / 1000);
        } else if (cdn.textContent) { cdn.textContent = ''; cdm.style.setProperty('--p', '0deg'); }
      });
      // 连击
      const since = bt - this.combo.last;
      const on = this.combo.n >= 2 && since < 2600;
      if (H.combo._on !== on) { H.combo.classList.toggle('on', on); H.combo._on = on; }
      if (on) {
        const s = String(this.combo.n);
        if (H.comboN.textContent !== s) H.comboN.textContent = s;
        H.comboBar.style.transform = `scaleX(${G.clamp(1 - since / 2600, 0, 1).toFixed(3)})`;
      }
      // 连锁窗口
      if (this.chainWin && this.chainBar) this.chainBar.style.transform = `scaleX(${G.clamp(1 - (bt - this.chainWin.start) / this.chainWin.dur, 0, 1).toFixed(3)})`;
    }
    /* ================= 输入 ================= */
    act(a, el) {
      if (this.paused) {
        if (a === 'resume') this.togglePause(false);
        else if (a === 'retry') { this.togglePause(false); G.App.go('battle', {}, 'fade'); }
        else if (a === 'retreat') { this.togglePause(false); G.App.go('quest', { tier: this.q.tier }, 'fade'); }
        return;
      }
      if (a === 'pause') { if (this.phase !== 'victory' && this.phase !== 'done') this.togglePause(true); }
      else if (a === 'lock') this.toggleLock();
      else if (a === 'skill') { this.input(); this.useSkill(+el.dataset.k, false); }
      else if (a === 'ult') { this.input(); this.tryUlt(); }
    }
    input() { this.lastInput = this.bt(); this.userTouched = true; }
    tryUlt() {
      if (this.mem[0].ready && !this.chainStarted && this.phase === 'engage') this.startChain(false);
      else if (this.H) G.retrigger(this.H.ultb, 'deny');
    }
    key(e) {
      const k = e.key.toLowerCase();
      if (this.paused) {
        const bs = this.$$('.b-pause .btn');
        if (k === 'escape' || k === 'backspace') this.togglePause(false);
        else if (k === 'arrowup') G.navList(bs, -1);
        else if (k === 'arrowdown') G.navList(bs, 1);
        else if (k === 'enter' || k === ' ') { if (bs.includes(G.UI.hover)) G.UI.click(G.UI.hover); }
        return true;
      }
      if (['1', '2', '3', '4'].includes(k)) {
        this.input();
        if (this.H) { const sk = this.H.sk[+k - 1]; sk.classList.add('is-pressed'); this.after(120, () => sk.classList.remove('is-pressed')); }
        this.useSkill(+k - 1, false);
        return true;
      }
      if (k === 'q' || k === 'r') { this.input(); this.tryUlt(); return true; }
      if (k === 'tab') { this.toggleLock(); return true; }
      if (k === 'escape' || k === 'backspace' || k === 'p') {
        if (this.phase !== 'victory' && this.phase !== 'done') this.togglePause(true);
        return true;
      }
      return false;
    }
    toggleLock() {
      this.locked = !this.locked;
      this.reticle.classList.toggle('locked', this.locked);
      if (this.locked) G.retrigger(this.reticle, 'lockin');
    }
    togglePause(v) {
      if (v === this.paused) return;
      const pz = this.$('.b-pause');
      if (v) {
        this.paused = true;
        this.pauseAt = G.time;
        this.pausedTimers = G.pauseOwner(this);
        pz.innerHTML = `<div class="pz plate rivets"><h2>暂停</h2><div class="en">PAUSE</div><div class="pzb">
          <div class="btn btn-gold brk" data-act="resume"><span class="k">Esc</span>继续战斗</div>
          <div class="btn btn-navy brk" data-act="retry">重新挑战</div>
          <div class="btn btn-navy brk" data-act="retreat">撤退 · 返回任务柜台</div></div></div>`;
        pz.hidden = false;
        G.UI.setHover(pz.querySelector('.btn'));
      } else {
        this.pausedTotal += G.time - this.pauseAt;
        this.paused = false;
        G.resumeOwner(this.pausedTimers || []);
        this.pausedTimers = null;
        pz.hidden = true;
        G.UI.setHover(null);
      }
    }
    back() {
      if (this.paused) this.togglePause(false);
      else if (this.H && this.phase !== 'victory' && this.phase !== 'done') this.togglePause(true);
    }
  }

  /* ---------- 特效绘制 ---------- */
  const TAU = Math.PI * 2;
  const FXD = {
    hit(ctx, f, a) {
      ctx.globalCompositeOperation = 'lighter';
      const R = G.rng(f.seed | 0);
      const n = 9;
      ctx.strokeStyle = f.col;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const ang = R() * TAU;
        const r0 = 8 + 30 * E.outCubic(a), r1 = r0 + (30 + R() * 40) * (1 - a);
        ctx.globalAlpha = 1 - a;
        ctx.lineWidth = 3 * (1 - a) + 0.5;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0);
        ctx.lineTo(f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 40);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - a)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(f.x - 40, f.y - 40, 80, 80);
    },
    slash(ctx, f, a) {
      ctx.globalCompositeOperation = 'lighter';
      const p = E.outCubic(Math.min(1, a / 0.45));
      const fade = a < 0.45 ? 1 : 1 - (a - 0.45) / 0.55;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      const R = 110;
      const s0 = -1.2, s1 = s0 + 2.4 * p;
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = fade * (k === 0 ? 0.9 : 0.35);
        ctx.strokeStyle = k === 0 ? '#ffffff' : f.col;
        ctx.lineWidth = k === 0 ? 4 : 12 - k * 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, R, R * 0.38, 0, s0, s1);
        ctx.stroke();
      }
    },
    burst(ctx, f, a) {
      FXD.hit(ctx, f, a);
      FXD.ring(ctx, { x: f.x, y: f.y, r0: 10, r1: 120, col: f.col, w: 5 }, a);
    },
    big(ctx, f, a) {
      FXD.burst(ctx, f, a);
      FXD.slash(ctx, Object.assign({}, f, { a: f.a + 1.2 }), a);
    },
    ring(ctx, f, a) {
      ctx.globalCompositeOperation = 'lighter';
      const r = f.r0 + (f.r1 - f.r0) * E.outCubic(a);
      ctx.globalAlpha = (1 - a) * 0.9;
      ctx.strokeStyle = f.col;
      ctx.lineWidth = (f.w || 6) * (1 - a) + 1;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, r, r * (f.flat || 0.6), 0, 0, TAU);
      ctx.stroke();
    },
    flash(ctx, f, a) {
      ctx.globalAlpha = 1 - a;
      ctx.fillStyle = f.col;
      ctx.fillRect(-50, -50, 2020, 1180);
    },
    ember(ctx, f, a, t) {
      ctx.globalCompositeOperation = 'lighter';
      const fade = smooth(0, 0.1, a) * (1 - smooth(0.8, 1, a));
      for (let i = 0; i < 90; i++) {
        const h = G.hash(i * 2.3 + 5), h2 = G.hash(i * 4.9 + 1);
        const life = 1400 + h2 * 1200;
        const p = ((t - f.t0 + h * life) % life) / life;
        const x = 960 + (h - 0.5) * 1800 + Math.sin(t * 0.002 + i) * 30;
        const y = 1100 - p * 900;
        ctx.globalAlpha = fade * Math.sin(Math.PI * p);
        ctx.fillStyle = i % 2 ? '#ffb347' : '#ff6a2a';
        ctx.fillRect(x, y, 3, 5);
      }
    },
    boom(ctx, f, a, t) {
      ctx.globalCompositeOperation = 'lighter';
      const pal = PAL[f.el] || PAL.light;
      const big = f.big ? 1.6 : 1;
      const R = G.rng((f.seed | 0) + 3);
      // 光芒
      ctx.translate(f.x, f.y);
      for (let i = 0; i < 16; i++) {
        const ang = R() * TAU;
        const len = (300 + R() * 500) * big * E.outCubic(Math.min(1, a * 2.5));
        const w = (0.03 + R() * 0.05) * (1 - a);
        ctx.globalAlpha = (1 - a) * 0.8;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, pal[1]);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, len, ang - w, ang + w);
        ctx.closePath();
        ctx.fill();
      }
      for (let k = 0; k < 3; k++) {
        const aa = G.clamp(a * 1.3 - k * 0.12, 0, 1);
        if (aa <= 0) continue;
        const r = (40 + (520 + k * 160) * E.outCubic(aa)) * big;
        ctx.globalAlpha = (1 - aa) * 0.85;
        ctx.strokeStyle = pal[k + 1];
        ctx.lineWidth = (18 - k * 5) * (1 - aa) + 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.62, 0, 0, TAU);
        ctx.stroke();
      }
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 260 * big);
      cg.addColorStop(0, `rgba(255,255,255,${(1 - a) * 0.95})`);
      cg.addColorStop(0.4, `rgba(255,255,255,${(1 - a) * 0.3})`);
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = cg;
      ctx.fillRect(-300 * big, -300 * big, 600 * big, 600 * big);
      // 粒子
      for (let i = 0; i < 40; i++) {
        const ang = R() * TAU, sp = (200 + R() * 600) * big;
        const d = sp * E.outCubic(a);
        ctx.globalAlpha = (1 - a);
        ctx.fillStyle = pal[i % pal.length];
        const s = (2 + R() * 4) * (1 - a * 0.6);
        ctx.fillRect(Math.cos(ang) * d, Math.sin(ang) * d * 0.7, s, s);
      }
    },
    vortex(ctx, f, a, t) {
      const el = f.el;
      const pal = PAL[el] || PAL.wind;
      const inten = smooth(0, 0.12, a) * (1 - smooth(0.86, 1, a));
      const el0 = t - f.t0;
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x, f.y);
      const dir = el === 'dark' ? -1 : 1;
      // 旋涡弧线
      for (let i = 0; i < 84; i++) {
        const h = G.hash(i * 3.7 + 1), h2 = G.hash(i * 1.9 + 2), h3 = G.hash(i * 5.3 + 3);
        const grow = el === 'dark' ? 1.2 - 0.7 * a : 0.35 + 0.75 * E.outCubic(Math.min(1, a * 1.6));
        const r = (40 + h * 560) * grow;
        const sp = (0.9 + h2 * 2.4) * dir * (el === 'earth' ? 0.5 : 1);
        const ang = el0 * 0.0042 * sp + h * TAU;
        const span = 0.5 + h3 * 1.5;
        ctx.globalAlpha = inten * (0.2 + 0.55 * h2);
        ctx.strokeStyle = pal[i % pal.length];
        ctx.lineWidth = 1.5 + h3 * 6;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.58, -0.22, ang, ang + span);
        ctx.stroke();
      }
      // 各属性的附加图形
      const R = G.rng(77);
      if (el === 'wind' || el === 'light' || el === 'water') {
        for (let i = 0; i < 46; i++) {
          const h = G.hash(i * 7.1), ph = ((el0 * 0.0006 + h) % 1);
          const rr = (1 - ph) * 520 + 30;
          const an = h * TAU + ph * 7 * dir;
          const x = Math.cos(an) * rr, y = Math.sin(an) * rr * 0.58;
          ctx.globalAlpha = inten * Math.sin(Math.PI * ph);
          ctx.fillStyle = pal[(i + 1) % pal.length];
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(an + 1.2);
          ctx.beginPath();
          ctx.ellipse(0, 0, 11, 3.6, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
      if (el === 'fire') {
        for (let i = 0; i < 70; i++) {
          const h = G.hash(i * 2.9), ph = ((el0 * 0.0009 + h) % 1);
          ctx.globalAlpha = inten * (1 - ph);
          ctx.fillStyle = pal[i % pal.length];
          ctx.fillRect((h - 0.5) * 900, 260 - ph * 700, 4, 9);
        }
      }
      if (el === 'earth') {
        for (let i = 0; i < 30; i++) {
          const h = G.hash(i * 4.1), an = h * TAU, d = 80 + E.outCubic(a) * (300 + h * 300);
          ctx.globalAlpha = inten;
          ctx.fillStyle = pal[i % pal.length];
          ctx.save();
          ctx.translate(Math.cos(an) * d, Math.sin(an) * d * 0.6);
          ctx.rotate(an + el0 * 0.003);
          ctx.beginPath();
          ctx.moveTo(0, -14); ctx.lineTo(12, 8); ctx.lineTo(-10, 10);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      // 中心光
      const core = 0.4 + 0.6 * smooth(0.45, 0.66, a) * (1 - smooth(0.7, 0.95, a));
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 340);
      cg.addColorStop(0, `rgba(255,255,255,${inten * core})`);
      cg.addColorStop(0.25, el === 'dark' ? `rgba(40,0,80,${inten * 0.6})` : hexA(pal[2], inten * 0.35 * core));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = cg;
      ctx.fillRect(-360, -360, 720, 720);
      // 晨星闪光（高潮）
      const fl = smooth(0.58, 0.66, a) * (1 - smooth(0.66, 0.82, a));
      if (fl > 0) {
        ctx.globalAlpha = fl;
        ctx.fillStyle = '#ffffff';
        const s = 520 * (0.6 + 0.4 * fl);
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s * 1.6, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s * 1.6, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.fill();
      }
    },
  };

  G.App.register('battle', BattleScene);
})();
