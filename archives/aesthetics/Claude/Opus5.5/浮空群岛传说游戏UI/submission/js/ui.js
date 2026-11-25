/* =====================================================================
   ui.js — 共用界面组件：标题栏 / 按键提示 / 道具格 / 星盘环 / 目录
   ===================================================================== */
(function () {
  'use strict';
  const D = () => G.DATA;

  // 星盘刻度环（SVG）
  G.astroRing = function (r = 50, opts = {}) {
    const n = opts.ticks || 72;
    let p = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const big = i % (opts.major || 6) === 0;
      const r0 = r - (big ? r * 0.1 : r * 0.05), r1 = r;
      p += `M${(r0 * Math.cos(a)).toFixed(2)} ${(r0 * Math.sin(a)).toFixed(2)}L${(r1 * Math.cos(a)).toFixed(2)} ${(r1 * Math.sin(a)).toFixed(2)}`;
    }
    return p;
  };
  G.headRing = () => `<svg class="ring" viewBox="-50 -50 100 100"><circle r="47" fill="rgba(8,18,44,.8)" stroke="rgba(255,226,154,.65)" stroke-width="1.4"/><circle r="40" fill="none" stroke="rgba(255,226,154,.3)" stroke-width=".8"/><path d="${G.astroRing(46, { ticks: 48, major: 4 })}" stroke="rgba(255,226,154,.7)" stroke-width="1"/><path d="${G.star4(0, -47, 6)}" fill="#ffe29a"/></svg>`;

  G.scrHead = (title, en, icon, res = true) => `
    <header class="scr-head">
      <div class="sh-emb">${G.headRing()}${G.icon(icon)}</div>
      <div class="sh-titles"><h1>${title}</h1><em>${en}</em></div>
      <div class="sh-line"></div>
      ${res ? `<div class="sh-res">
        <div class="res-chip">${G.icon('ui-flag')}<small>空行者等级</small>87</div>
        <div class="res-chip">${G.icon('it-coin')}<small>星币</small>1,284,500</div>
      </div>` : ''}
    </header>`;

  G.keybar = (items, left) =>
    `<div class="keybar">${left ? `<span class="kh left">${left}</span>` : ''}${items
      .map((it) => `<span class="kh" ${it.act ? `data-act="${it.act}"` : ''}>${it.k.map((k) => `<kbd>${k}</kbd>`).join('')}${it.t}</span>`)
      .join('')}</div>`;

  G.itemTile = (id, qty, extra = '') => {
    const it = D().ITEMS[id];
    return `<div class="itile r-${it.r} ${extra}" data-item="${id}">${G.rarityPips(it.r)}${G.icon(it.icon)}${it.el ? G.elBadge(it.el, 'iel') : ''}${qty ? `<span class="iq">×${qty}</span>` : ''}</div>`;
  };

  // 属性 + 名称
  G.elTag = (el) => `<span class="eltag el-${el}">${G.elBadge(el)}<b>${D().ELEMENTS[el].name}</b></span>`;
  G.wpTag = (w) => `<span class="wptag">${G.icon('w-' + w)}<b>${D().WEAPONS[w].name}</b></span>`;

  /* ---------- 界面目录 ---------- */
  G.TOC = {
    el: null,
    items: [
      { id: 'title', n: '4.1', name: '标题画面', en: 'TITLE' },
      { id: 'quest', n: '4.2', name: '任务柜台', en: 'QUESTS' },
      { id: 'party', n: '4.3', name: '编队与养成', en: 'PARTY' },
      { id: 'battle', n: '4.4', name: '战斗画面', en: 'BATTLE' },
      { id: 'ult', n: '4.5', name: '奥义与连锁奥义', en: 'CHAIN' },
      { id: 'results', n: '4.6', name: '结算画面', en: 'RESULTS' },
      { id: 'story', n: '4.7', name: '剧情画面', en: 'STORY' },
    ],
    init() {
      const el = (this.el = G.$('#toc'));
      el.innerHTML = `<button class="toc-btn" type="button"><svg viewBox="0 0 48 48"><path d="M8 11h32v4H8zM8 22h32v4H8zM8 33h32v4H8z"/></svg><span>界面目录</span></button>
        <div class="toc-list"><div class="tt">SCREEN INDEX</div>
        ${this.items.map((it) => `<a data-go="${it.id}"><i>${it.n}</i>${it.name}<em>${it.en}</em></a>`).join('')}
        <hr><a class="tour" data-go="tour"><svg viewBox="0 0 48 48"><path d="M13 7.5l26 16.5-26 16.5z"/></svg>播放演示录像<em>TOUR</em></a></div>`;
      const btn = el.querySelector('.toc-btn');
      btn.addEventListener('click', (e) => { e.stopPropagation(); el.classList.toggle('open'); });
      document.addEventListener('click', (e) => { if (!el.contains(e.target)) el.classList.remove('open'); });
      el.querySelectorAll('a[data-go]').forEach((a) =>
        a.addEventListener('click', (e) => {
          e.stopPropagation();
          el.classList.remove('open');
          this.jump(a.dataset.go);
        })
      );
    },
    jump(id) {
      if (G.exporting) return;
      if (G.touring && G.Tour) G.Tour.stopLive(true);
      G.Trans.cancel();
      if (G.App.scene) { G.cancelOwner(G.App.scene); G.App.scene._leaving = true; }
      G.$('#overlay').innerHTML = '';
      if (id === 'tour') { G.Tour.playLive(); return; }
      G.resetState();
      if (id === 'party') G.state.party = ['erin', 'rock', 'thea', 'rin'];
      if (id === 'battle' || id === 'ult' || id === 'results') G.state.party = ['erin', 'rock', 'thea', 'baldo'];
      const map = { ult: ['battle', { start: 'chain' }], battle: ['battle', {}], title: ['title', {}], quest: ['quest', { tier: 'extreme', sel: 'x1' }], party: ['party', {}], results: ['results', {}], story: ['story', {}] };
      const [sid, params] = map[id];
      G.App.go(sid, params, 'fade');
    },
    mark(sceneId) {
      if (!this.el) return;
      this.el.querySelectorAll('a[data-go]').forEach((a) => a.classList.toggle('cur', a.dataset.go === sceneId));
    },
  };
})();
