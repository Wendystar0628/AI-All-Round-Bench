/* =====================================================================
   4.7 剧情画面：逐字对话 / 自动 / 快进 / 名词解释 / 章节标题卡
   ===================================================================== */
(function () {
  'use strict';
  const CAST = ['erin', 'rock', 'thea', 'baldo'];
  const CHAR_MS = 36, FF_MS = 7;

  function chapterRing() {
    let roman = '';
    const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    R.forEach((r, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = 452 * Math.cos(a), y = 452 * Math.sin(a);
      roman += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${i * 30} ${x.toFixed(1)} ${y.toFixed(1)})" style="font:400 16px var(--f-en);fill:rgba(255,226,154,.55);letter-spacing:.1em">${r}</text>`;
    });
    return `<svg viewBox="-500 -500 1000 1000">
      <g class="rot"><circle r="480" fill="none" stroke="rgba(255,226,154,.45)" stroke-width="1.5" class="draw"/>
      <path d="${G.astroRing(480, { ticks: 180, major: 15 })}" stroke="rgba(255,226,154,.5)" stroke-width="1.2"/>${roman}</g>
      <g class="rotr"><circle r="420" fill="none" stroke="rgba(160,200,255,.3)" stroke-width="1" stroke-dasharray="4 10"/>
      <circle r="330" fill="none" stroke="rgba(255,226,154,.22)" stroke-width="1" class="draw"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * Math.PI * 2; return `<path d="${G.star4(330 * Math.cos(a), 330 * Math.sin(a), i % 2 ? 6 : 10)}" fill="${i % 2 ? '#9fd6ff' : '#ffe29a'}"/>`; }).join('')}</g>
      <g transform="rotate(-12)"><ellipse rx="560" ry="120" fill="none" stroke="rgba(255,226,154,.25)" stroke-width="1.2"/></g>
    </svg>`;
  }

  class StoryScene extends G.Scene {
    enter(p) {
      G.BG.set('dusk');
      const D = G.DATA.STORY;
      this.lines = D.lines;
      this.idx = -1;
      this.auto = false;
      this.ff = false;
      this.typing = false;
      this.mode = 'dlg';
      this.pinned = null;
      this.root.innerHTML = `
        <div class="st-shade"></div>
        <div class="st-loc"><div class="pin">${G.icon('q-escort')}</div><div><b>${D.place}</b><small>THE MORNING STAR · DECK</small></div><span class="time">${D.time}</span></div>
        <div class="st-cast">${CAST.map((id, i) => `<div class="cm el-${G.DATA.chars[id].el}" data-id="${id}" style="--i:${i}">${G.crest(id)}<i>${G.DATA.chars[id].name}</i></div>`).join('')}</div>
        <div class="dlg" data-act="adv">
          <div class="dlg-box"></div>
          <div class="orn"><svg viewBox="-50 -50 100 100"><circle r="46" fill="none" stroke="#ffe29a" stroke-width="1"/><path d="${G.astroRing(46, { ticks: 60, major: 5 })}" stroke="#ffe29a" stroke-width="1"/><path d="${G.star4(0, 0, 30)}" fill="#ffe29a"/></svg></div>
          <div class="nameplate"></div>
          <div class="dlg-ctl">
            <div class="dlg-btn auto brk" data-act="auto">${G.icon('ui-auto')}自动<em>AUTO</em><kbd>A</kbd><i class="prog"></i></div>
            <div class="dlg-btn ff brk" data-act="ff">${G.icon('ui-ff')}快进<em>SKIP</em><kbd>S</kbd></div>
          </div>
          <div class="dlg-text"></div>
          <div class="dlg-next"><svg viewBox="-10 -10 20 20"><path d="${G.star4(0, 0, 9)}"/></svg></div>
        </div>`;
      this.dlg = this.$('.dlg');
      this.textEl = this.$('.dlg-text');
      this.after(p.fast ? 100 : 750, () => this.next());
      this.onFrame((t) => this.frame(t));
    }
    renderLine(line) {
      let html = '', n = 0;
      const parts = line.text.split(/(\{[^}]+\})/);
      for (const part of parts) {
        if (!part) continue;
        if (part[0] === '{') {
          const term = part.slice(1, -1);
          html += `<span class="term" data-term="${term}" data-act="term">${[...term].map((ch) => `<span class="c" data-n="${n++}">${ch}</span>`).join('')}${G.icon('ui-book', 'bk')}</span>`;
        } else html += [...part].map((ch) => `<span class="c" data-n="${n++}">${ch}</span>`).join('');
      }
      this.textEl.innerHTML = html;
      this.chars = Array.from(this.textEl.querySelectorAll('.c'));
      this.shown = 0;
      return n;
    }
    showLine(i) {
      const line = this.lines[i];
      const prev = i > 0 ? this.lines[i - 1].who : null;
      this.idx = i;
      this.closeGloss(true);
      const ch = G.DATA.chars[line.who];
      if (line.who !== prev) {
        const np = this.$('.nameplate');
        np.className = `nameplate el-${ch.el}`;
        np.innerHTML = `${G.elBadge(ch.el)}<b>${ch.name}</b><em>${ch.en}</em>`;
        G.retrigger(np, 'swap');
        this.dlg.className = `dlg el-${ch.el}`;
        this.$$('.st-cast .cm').forEach((c) => c.classList.toggle('on', c.dataset.id === line.who));
      }
      const N = this.renderLine(line);
      this.$('.dlg-next').classList.remove('on');
      this.typing = true;
      this.lineStart = G.time;
      this.ms = this.ff ? FF_MS : CHAR_MS;
      this.N = N;
      if (this.doneId) G.cancel(this.doneId);
      this.doneId = this.at(G.time + N * this.ms + 20, () => this.lineDone(i));
    }
    lineDone(i) {
      if (i !== this.idx || !this.typing) return;
      this.typing = false;
      this.doneId = null;
      this.chars.forEach((c) => c.classList.add('on'));
      this.shown = this.chars.length;
      this.$$('.term').forEach((t) => t.classList.add('ready'));
      this.$('.dlg-next').classList.add('on');
      this.lineDoneAt = G.time;
      this.queueAdvance();
    }
    queueAdvance() {
      if (this.advId) { G.cancel(this.advId); this.advId = null; }
      if (this.typing || this.mode !== 'dlg') return;
      if (this.ff) this.advId = this.after(160, () => { this.advId = null; this.next(); });
      else if (this.auto) {
        this.waitStart = G.time;
        this.waitDur = 650 + this.N * 16;
        this.advId = this.after(this.waitDur, () => { this.advId = null; this.next(); });
      }
    }
    completeNow() {
      if (!this.typing) return;
      if (this.doneId) { G.cancel(this.doneId); this.doneId = null; }
      this.lineDone(this.idx);
    }
    next() {
      if (this.mode !== 'dlg') return;
      if (this.advId) { G.cancel(this.advId); this.advId = null; }
      if (this.idx + 1 < this.lines.length) this.showLine(this.idx + 1);
      else this.chapterCard();
    }
    advance() {
      if (this.mode === 'chapter') return this.leaveChapter();
      if (this.mode !== 'dlg') return;
      if (this.pinned) { this.closeGloss(); return; }
      if (this.typing) this.completeNow();
      else this.next();
    }
    setAuto(v) {
      this.auto = v;
      this.$('.dlg-btn.auto').classList.toggle('on', v);
      if (v && this.ff) this.setFF(false);
      if (v) { this.closeGloss(); this.queueAdvance(); }
      else if (this.advId) { G.cancel(this.advId); this.advId = null; }
    }
    setFF(v) {
      this.ff = v;
      this.$('.dlg-btn.ff').classList.toggle('on', v);
      if (v && this.auto) this.setAuto(false);
      if (v) {
        this.closeGloss();
        if (this.typing) this.completeNow();
        else this.queueAdvance();
      } else if (this.advId) { G.cancel(this.advId); this.advId = null; }
    }
    frame(t) {
      if (this.typing && this.chars) {
        const n = Math.min(this.chars.length, Math.floor((t - this.lineStart) / this.ms) + 1);
        for (let k = this.shown; k < n; k++) this.chars[k].classList.add('on');
        this.shown = Math.max(this.shown, n);
      }
      const pg = this.$('.dlg-btn.auto .prog');
      if (pg) {
        const p = this.auto && this.advId && !this.typing ? G.clamp((t - this.waitStart) / this.waitDur, 0, 1) : 0;
        pg.style.transform = `scaleX(${p})`;
      }
    }
    /* ---- 名词解释 ---- */
    openGloss(termEl, pin) {
      const key = termEl.dataset.term;
      const g = G.DATA.GLOSSARY[key];
      if (!g) return;
      if (this.gloss && this.gloss._key === key) {
        if (pin) { this.pinned = termEl; termEl.classList.add('pinned'); this.gloss.querySelector('.g-pin').textContent = '已固定 · 再次点击关闭'; }
        return;
      }
      this.closeGloss(true);
      const el = G.html(`<div class="gloss plate rivets"><span class="g-cat">${G.icon('ui-book')}${g.cat}</span><span class="g-pin">${pin ? '已固定 · 再次点击关闭' : '点击固定'}</span>
        <h4>${key}</h4><div class="g-en">${g.en.toUpperCase()}</div><p>${g.text}</p><i class="g-arrow"></i></div>`);
      el._key = key;
      this.root.appendChild(el);
      const r = G.rectOf(termEl);
      const h = el.offsetHeight;
      el.style.left = G.clamp(r.cx - 230, 40, 1880 - 460) + 'px';
      el.style.top = r.y - h - 26 + 'px';
      el.querySelector('.g-arrow').style.left = G.clamp(r.cx - G.clamp(r.cx - 230, 40, 1420), 30, 430) + 'px';
      this.gloss = el;
      if (pin) { this.pinned = termEl; termEl.classList.add('pinned'); }
    }
    closeGloss(instant) {
      if (this.pinned) this.pinned.classList.remove('pinned');
      this.pinned = null;
      const g = this.gloss;
      this.gloss = null;
      if (!g) return;
      if (instant) { g.remove(); return; }
      g.classList.add('out');
      this.after(190, () => g.remove());
    }
    onHover(el) {
      if (this.mode !== 'dlg') return;
      if (el && el.classList.contains('term')) {
        if (!this.pinned) this.openGloss(el, false);
      } else if (!this.pinned && this.gloss) this.closeGloss();
    }
    /* ---- 章节标题卡 ---- */
    chapterCard() {
      if (this.mode === 'chapter') return;
      this.mode = 'chapter';
      this.closeGloss(true);
      if (this.advId) G.cancel(this.advId);
      const c = G.DATA.STORY.chapter;
      const el = G.html(`<div class="chapter"><div class="cc-veil"></div>
        <div class="cc-stack">
          <div class="cc-ring">${chapterRing()}</div>
          <div class="cc-num"><b>${c.num}</b><em>${c.en}</em></div>
          <div class="cc-title">${[...c.name].map((ch, i) => `<span style="--i:${i}" data-t="${ch}"><i>${ch}</i></span>`).join('')}</div>
          <div class="cc-line"></div>
          <div class="cc-en">${c.enName}</div>
          <div class="cc-tag">${c.tag}</div>
        </div>
        <div class="cc-skip"><kbd>Enter</kbd>继续</div></div>`);
      this.root.appendChild(el);
      this.chapterEl = el;
      this.chapterAt = G.time;
      this.after(420, () => {
        G.BG.set('night');
        this.$$('.st-shade,.st-loc,.st-cast,.dlg').forEach((n) => (n.style.visibility = 'hidden'));
      });
      this.after(3900, () => this.leaveChapter(true));
    }
    leaveChapter(force) {
      if (this.left) return;
      if (!force && G.time - this.chapterAt < 1300) return;
      this.left = true;
      this.chapterEl.classList.add('leave');
      this.after(520, () => G.App.go('quest', { tier: 'normal' }, 'wind'));
    }
    act(a, el) {
      if (a === 'auto') this.setAuto(!this.auto);
      else if (a === 'ff') this.setFF(!this.ff);
      else if (a === 'term') {
        if (this.typing) { this.completeNow(); return; }
        if (this.pinned === el) this.closeGloss();
        else this.openGloss(el, true);
      } else if (a === 'adv') this.advance();
    }
    blankClick() { this.advance(); }
    key(e) {
      const k = e.key.toLowerCase();
      if (k === 'enter' || k === ' ') { this.advance(); return true; }
      if (this.mode !== 'dlg') return k !== 'escape' && k !== 'backspace';
      if (k === 'a') { this.setAuto(!this.auto); return true; }
      if (k === 's' || k === 'control') { this.setFF(!this.ff); return true; }
      if (k === 'tab' || k === 'arrowright' || k === 'arrowleft') {
        const terms = this.$$('.term');
        if (terms.length) G.navList(terms, k === 'arrowleft' ? -1 : 1, { wrap: true });
        return true;
      }
      return false;
    }
    keyUp(e) {
      if (e.key === 'Control' && this.ff) this.setFF(false);
    }
    back() {
      if (this.pinned) { this.closeGloss(); return; }
      G.App.go('title', { menu: true }, 'fade');
    }
  }
  G.App.register('story', StoryScene);
})();
