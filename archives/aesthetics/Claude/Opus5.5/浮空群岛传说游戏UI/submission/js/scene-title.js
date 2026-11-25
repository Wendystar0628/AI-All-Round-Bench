/* =====================================================================
   4.1 标题画面：标志入场 → 按任意键 → 主选单（继续游戏 / 新游戏 / 设置）
   ===================================================================== */
(function () {
  'use strict';
  const star4 = (r, cx = 0, cy = 0) => G.star4(cx, cy, r);

  function astroSVG() {
    const roman = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    let labels = '';
    roman.forEach((r, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = 328 * Math.cos(a), y = 328 * Math.sin(a);
      labels += `<text class="lbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${(i * 30).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})">${r}</text>`;
    });
    let stars = '';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      stars += `<path d="${star4(i % 2 ? 5 : 8, 236 * Math.cos(a), 236 * Math.sin(a))}" fill="${i % 2 ? '#9fd6ff' : '#ffe29a'}"/>`;
    }
    return `<svg class="logo-astro" viewBox="-340 -340 680 680">
      <defs>
        <linearGradient id="lgOrbit" x1="0" x2="1"><stop offset="0" stop-color="#ffe29a" stop-opacity="0"/><stop offset=".45" stop-color="#fff1c8"/><stop offset="1" stop-color="#8fd0ff" stop-opacity="0"/></linearGradient>
        <linearGradient id="lgOrbit2" x1="1" x2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#bfe4ff"/><stop offset="1" stop-color="#ffe29a" stop-opacity="0"/></linearGradient>
      </defs>
      <g class="spin">
        <circle r="312" fill="none" stroke="rgba(255,240,205,.6)" stroke-width="1.6" class="draw d1"/>
        <path d="${G.astroRing(312, { ticks: 120, major: 10 })}" stroke="rgba(255,240,205,.65)" stroke-width="1.2" class="fade"/>
        <g class="fade">${labels}</g>
      </g>
      <g class="spinr">
        <circle r="290" fill="none" stroke="rgba(255,240,205,.3)" stroke-width="1" stroke-dasharray="2 8" class="fade"/>
        <circle r="236" fill="none" stroke="rgba(170,215,255,.42)" stroke-width="1.2" class="draw d2"/>
        <g class="fade">${stars}</g>
      </g>
      <circle r="186" fill="none" stroke="rgba(255,240,205,.18)" stroke-width="1" class="draw d3"/>
      <g transform="rotate(-13)"><ellipse rx="372" ry="98" fill="none" stroke="url(#lgOrbit)" stroke-width="2.4" class="orbit"/></g>
      <g transform="rotate(17)"><ellipse rx="356" ry="66" fill="none" stroke="url(#lgOrbit2)" stroke-width="1.5" class="orbit"/></g>
      <path d="M-336 0H-250M250 0H336M0 -336V-326M0 250V336" stroke="rgba(255,240,205,.4)" stroke-width="1" class="fade"/>
    </svg>`;
  }
  function starSVG() {
    return `<svg viewBox="-90 -90 180 180">
      <defs><radialGradient id="lsg"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff6dc" stop-opacity=".9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
      <circle r="86" fill="url(#lsg)" opacity=".6"/>
      <g class="core">
        <path d="${star4(30)}" fill="#ffe7a6" transform="rotate(45)" opacity=".9"/>
        <path d="${star4(74)}" fill="#fffdf2"/>
        <circle r="7" fill="#fff"/>
      </g>
    </svg>`;
  }
  function ribbonSVG() {
    return `<svg viewBox="0 0 460 74" preserveAspectRatio="none">
      <defs><linearGradient id="rbG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c5fc0"/><stop offset=".5" stop-color="#173a86"/><stop offset="1" stop-color="#0c1c4c"/></linearGradient></defs>
      <path d="M2 12H44V66H2L20 39Z" fill="#0b1a44" stroke="#e9c27a" stroke-width="2"/>
      <path d="M458 12H416V66H458L440 39Z" fill="#0b1a44" stroke="#e9c27a" stroke-width="2"/>
      <path d="M32 4H428V70H32Z" fill="url(#rbG)" stroke="#ffe29a" stroke-width="2.6"/>
      <path d="M40 11H420V63H40Z" fill="none" stroke="rgba(255,226,154,.45)" stroke-width="1"/>
      <path d="${star4(7, 58, 37)}" fill="#ffe29a"/><path d="${star4(7, 402, 37)}" fill="#ffe29a"/>
    </svg>`;
  }
  const mk = () => `<svg viewBox="-27 -27 54 54"><circle r="22" fill="none" stroke="#c98a2e" stroke-width="1.6" stroke-dasharray="3 3.4"/><circle r="15" fill="none" stroke="rgba(201,138,46,.5)" stroke-width="1"/><path d="${star4(13)}" fill="#d99a30"/></svg>`;

  const SETTINGS = [
    { k: 'text', name: '文字速度', en: 'TEXT SPEED', type: 'seg', v: 3, max: 5 },
    { k: 'bgm', name: '背景音乐', en: 'MUSIC', type: 'seg', v: 4, max: 5 },
    { k: 'sfx', name: '音效', en: 'SOUND FX', type: 'seg', v: 4, max: 5 },
    { k: 'cam', name: '镜头灵敏度', en: 'CAMERA', type: 'seg', v: 3, max: 5 },
    { k: 'dmg', name: '伤害数字', en: 'DAMAGE NUMBERS', type: 'tog', v: 0, opts: ['显示', '隐藏'] },
    { k: 'shake', name: '画面震动', en: 'SCREEN SHAKE', type: 'tog', v: 0, opts: ['开启', '关闭'] },
  ];

  class TitleScene extends G.Scene {
    enter(p) {
      G.BG.set('dawn');
      this.mode = 'intro';
      this.settings = JSON.parse(JSON.stringify(SETTINGS));
      this.root.innerHTML = `
        <div class="t-veil"></div>
        <div class="logo">
          <div class="logo-glow"></div>
          ${astroSVG()}
          <div class="logo-shade"></div>
          <div class="logo-star">${starSVG()}<i class="streak"></i><i class="streak v"></i></div>
          <h1 class="logo-main" aria-label="浮空群岛传说">${['浮', '空', '群', '岛'].map((c, i) => `<span class="ch" style="--i:${i}" data-t="${c}"><span>${c}</span></span>`).join('')}</h1>
          <div class="logo-ribbon">${ribbonSVG()}<b>传说</b></div>
          <div class="logo-en"><i></i>LEGEND OF THE FLOATING ISLES<i class="r"></i></div>
        </div>
        <div class="t-prompt"><div class="pk"><svg viewBox="-10 -10 20 20"><path d="${star4(9)}"/></svg>按任意键开始<svg viewBox="-10 -10 20 20"><path d="${star4(9)}"/></svg></div><em>PRESS ANY KEY</em></div>
        <nav class="tmenu">
          <div class="ti brk" data-act="continue" style="--i:0"><span class="band"></span><span class="mk">${mk()}</span><span class="mk r">${mk()}</span>
            <span class="lb"><b>继续游戏</b><em>CONTINUE</em></span><small class="sub">第三章「焰冠苏醒」 · 艾琳 Lv 78 · 游玩时间 32:15:08</small></div>
          <div class="sep"></div>
          <div class="ti brk" data-act="newgame" style="--i:1"><span class="band"></span><span class="mk">${mk()}</span><span class="mk r">${mk()}</span>
            <span class="lb"><b>新游戏</b><em>NEW GAME</em></span></div>
          <div class="sep"></div>
          <div class="ti brk" data-act="settings" style="--i:2"><span class="band"></span><span class="mk">${mk()}</span><span class="mk r">${mk()}</span>
            <span class="lb"><b>设置</b><em>SETTINGS</em></span></div>
        </nav>
        <div class="t-foot"><span>© 2026 <b>MORNING STAR WORKS</b> · 晨星工作室</span><span>VER 1.0.3</span></div>
        <div class="modal set-modal" hidden></div>
        <div class="modal cf-modal" hidden></div>`;
      if (p.menu) {
        this.root.classList.add('skip-intro');
        this.openMenu(true);
      } else {
        this.after(2700, () => { if (this.mode === 'intro') this.mode = 'press'; });
      }
    }
    items() { return this.$$('.tmenu .ti'); }
    openMenu(instant) {
      if (this.mode === 'menu') return;
      this.mode = 'menu';
      this.root.classList.add('pressed', 'menu-open');
      if (!G.touring && !G.exporting) this.after(instant ? 0 : 650, () => { if (this.mode === 'menu' && !G.UI.hover) G.UI.setHover(this.items()[0]); });
    }
    closeMenu() {
      this.mode = 'press';
      G.UI.setHover(null);
      this.root.classList.remove('menu-open', 'pressed');
    }
    blankClick() {
      if (this.mode === 'intro' || this.mode === 'press') this.openMenu();
    }
    act(a, el) {
      if (this.mode === 'settings') return this.actSettings(a, el);
      if (this.mode === 'confirm') {
        if (a === 'cf-yes') this.startGame(el, true);
        if (a === 'cf-no') this.closeModal('.cf-modal');
        return;
      }
      if (this.mode !== 'menu') { this.openMenu(); return; }
      if (a === 'continue') this.startGame(el);
      else if (a === 'newgame') this.openConfirm();
      else if (a === 'settings') this.openSettings();
    }
    startGame(el, fromModal) {
      this.mode = 'leaving';
      let origin = el;
      if (fromModal) { origin = this.$('.ti[data-act="newgame"]'); this.closeModal('.cf-modal', true); }
      origin.classList.add('chosen');
      const r = G.rectOf(origin);
      this.after(260, () => G.App.go('story', {}, 'star', { x: r.cx, y: r.cy }));
    }
    openConfirm() {
      this.mode = 'confirm';
      const m = this.$('.cf-modal');
      m.innerHTML = `<div class="modal-card plate rivets confirm-card"><h2>开始新的冒险<em>NEW GAME</em></h2>
        <p>将从序章「晨星启航」开始新的旅程。</p><p class="dim" style="font-size:18px">当前存档不会被覆盖。</p>
        <div class="modal-foot"><div class="btn btn-gold brk" data-act="cf-yes"><span class="k">Enter</span>开始</div><div class="btn btn-navy brk" data-act="cf-no"><span class="k">Esc</span>取消</div></div></div>`;
      m.hidden = false;
      m.classList.remove('closing');
      if (!G.touring) G.UI.setHover(m.querySelector('[data-act="cf-yes"]'));
    }
    openSettings() {
      this.mode = 'settings';
      const m = this.$('.set-modal');
      m.innerHTML = `<div class="modal-card plate rivets"><h2>${G.icon('ui-gear')} 设置<em>SETTINGS</em></h2>
        ${this.settings.map((s, i) => `<div class="set-row brk" data-act="set" data-i="${i}" data-hov="1">
          <span class="sl">${s.name}<small>${s.en}</small></span>${this.rowCtl(s)}</div>`).join('')}
        <div class="modal-foot"><div class="btn btn-navy brk" data-act="set-close"><span class="k">Esc</span>返回</div></div></div>`;
      m.hidden = false;
      m.classList.remove('closing');
      if (!G.touring) G.UI.setHover(m.querySelector('.set-row'));
    }
    rowCtl(s) {
      if (s.type === 'seg') {
        let segs = '';
        for (let i = 0; i < s.max; i++) segs += `<i class="${i < s.v ? 'on' : ''}"></i>`;
        return `<span class="arr" data-act="set-dec">${G.icon('ui-arrowL')}</span><span class="segs">${segs}</span><span class="arr" data-act="set-inc">${G.icon('ui-arrowR')}</span><span class="val">${s.v * 20}</span>`;
      }
      return `<span class="tog">${s.opts.map((o, j) => `<span class="${j === s.v ? 'on' : ''}">${o}</span>`).join('')}</span>`;
    }
    changeSetting(i, d) {
      const s = this.settings[i];
      if (s.type === 'seg') s.v = G.clamp(s.v + d, 1, s.max);
      else s.v = (s.v + 1) % s.opts.length;
      const row = this.$(`.set-row[data-i="${i}"]`);
      row.querySelector('.sl').nextSibling;
      const ctl = G.html(`<div>${this.rowCtl(s)}</div>`);
      [...row.children].slice(1).forEach((n) => n.remove());
      [...ctl.childNodes].forEach((n) => row.appendChild(n));
    }
    actSettings(a, el) {
      if (a === 'set-close') return this.closeModal('.set-modal');
      const row = el.closest('.set-row');
      if (!row) return;
      const i = +row.dataset.i;
      if (a === 'set-inc') this.changeSetting(i, 1);
      else if (a === 'set-dec') this.changeSetting(i, -1);
      else if (this.settings[i].type === 'tog') this.changeSetting(i, 1);
    }
    closeModal(sel, keepMode) {
      const m = this.$(sel);
      m.classList.add('closing');
      this.after(220, () => { m.hidden = true; m.classList.remove('closing'); });
      if (!keepMode) {
        this.mode = 'menu';
        const which = sel === '.set-modal' ? 'settings' : 'newgame';
        G.UI.setHover(this.$(`.ti[data-act="${which}"]`));
      }
    }
    key(e) {
      const k = e.key;
      if (this.mode === 'intro' || this.mode === 'press') { if (k !== 'Escape') this.openMenu(); return true; }
      if (this.mode === 'menu') {
        if (k === 'ArrowUp' || k === 'w') G.navList(this.items(), -1, { wrap: true });
        else if (k === 'ArrowDown' || k === 's') G.navList(this.items(), 1, { wrap: true });
        else if (k === 'Enter' || k === ' ') { const h = this.items().includes(G.UI.hover) ? G.UI.hover : this.items()[0]; G.UI.click(h); }
        else if (k === 'Escape' || k === 'Backspace') this.closeMenu();
        return true;
      }
      if (this.mode === 'settings') {
        const rows = this.$$('.set-row');
        if (k === 'ArrowUp') G.navList(rows, -1);
        else if (k === 'ArrowDown') G.navList(rows, 1);
        else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Enter') {
          const h = rows.includes(G.UI.hover) ? G.UI.hover : rows[0];
          G.UI.setHover(h);
          this.changeSetting(+h.dataset.i, k === 'ArrowLeft' ? -1 : 1);
        } else if (k === 'Escape' || k === 'Backspace') this.closeModal('.set-modal');
        return true;
      }
      if (this.mode === 'confirm') {
        if (k === 'Enter') G.UI.click(this.$('[data-act="cf-yes"]'));
        else if (k === 'Escape' || k === 'Backspace') this.closeModal('.cf-modal');
        else if (k === 'ArrowLeft' || k === 'ArrowRight') G.navList(this.$$('.cf-modal .btn'), k === 'ArrowLeft' ? -1 : 1);
        return true;
      }
      return true;
    }
    back() {
      if (this.mode === 'settings') this.closeModal('.set-modal');
      else if (this.mode === 'confirm') this.closeModal('.cf-modal');
      else if (this.mode === 'menu') this.closeMenu();
    }
  }
  G.App.register('title', TitleScene);
})();
