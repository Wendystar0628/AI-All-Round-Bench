/* =====================================================================
   4.3 编队与角色养成：四个编队位 / 换人 / 角色详情 / 技能与徽印替换预览 / 出击
   ===================================================================== */
(function () {
  'use strict';
  const D = () => G.DATA;
  const OCT = 'M14 2H34L46 14V34L34 46H14L2 34V14Z';
  const OCT_IN = 'M15.6 6H32.4L42 15.6V32.4L32.4 42H15.6L6 32.4V15.6Z';

  // 技能徽章：八角形（与六边形的属性徽章区分）
  G.skillBadge = (sid, el, cls = '') => {
    const s = D().SKILLS[sid];
    return `<div class="skb ${cls}"><svg viewBox="0 0 48 48"><path d="${OCT}" fill="url(#g-el-${el})"/><path d="${OCT_IN}" fill="rgba(6,12,32,.42)" stroke="rgba(255,255,255,.55)" stroke-width="1.1"/><use href="#${s.icon}" x="12.5" y="12.5" width="23" height="23" fill="#fff" color="#fff"/></svg></div>`;
  };
  // 徽印：菱形纹章，颜色表示稀有度
  G.sigilMedal = (sig) =>
    sig
      ? `<svg viewBox="0 0 48 54"><path d="M24 1L47 27L24 53L1 27Z" fill="url(#g-r-${sig.r})" stroke="rgba(255,255,255,.8)" stroke-width="1.2"/><path d="M24 8.5L39.8 27L24 45.5L8.2 27Z" fill="rgba(8,14,36,.5)" stroke="rgba(255,255,255,.35)" stroke-width="1"/><use href="#${D().TRAITS[sig.t].icon}" x="14" y="17" width="20" height="20" fill="#fff" color="#fff"/></svg>`
      : `<svg viewBox="0 0 48 54"><path d="M24 1L47 27L24 53L1 27Z" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.32)" stroke-width="1.2" stroke-dasharray="3 3"/><use href="#ui-plus" x="16" y="19" width="16" height="16" color="rgba(255,255,255,.45)"/></svg>`;
  const halo = () => `<svg class="halo" viewBox="-50 -50 100 100"><circle r="48" fill="none" style="stroke:var(--c)" stroke-opacity=".55" stroke-width=".8"/><path d="${G.astroRing(48, { ticks: 60, major: 5 })}" style="stroke:var(--c)" stroke-opacity=".75" stroke-width=".8"/><circle r="42" fill="none" stroke="rgba(255,226,154,.35)" stroke-width=".6" stroke-dasharray="1 3"/><path d="${G.star4(0, -48, 5)}" fill="#ffe29a"/></svg>`;

  function fmtDelta(row, d) {
    const a = Math.abs(d);
    let s;
    if (row.k === 'crit' || row.k === 'ultgain') s = a.toFixed(1) + '%';
    else if (row.k === 'critdmg' || row.k === 'skillpow') s = Math.round(a) + '%';
    else if (row.k === 'cd') s = a.toFixed(1) + 's';
    else s = G.fmt(a);
    return (d > 0 ? '▲ +' : '▼ -') + s;
  }

  class PartyScene extends G.Scene {
    enter(p) {
      G.BG.set('golden');
      this.mode = 'party';
      const q = G.questById(G.state.quest) || G.questById('x1');
      this.q = q;
      this.root.innerHTML = `
        <div class="p-tint"></div>
        ${G.scrHead('编队', 'PARTY FORMATION · 晨星号', 'ui-person', false)}
        <div class="p-cards"></div>
        <div class="p-bottom plate rivets">
          <div class="p-pow">
            <div class="pr"><small>推荐战力</small><div class="bar rec"><i></i></div><b class="num p-rec">${G.fmt(q.rec)}</b></div>
            <div class="pr"><small>队伍战力</small><div class="bar cur"><i class="pv"></i><i class="cv"></i><span class="mark"></span></div><b class="num p-cur">0</b></div>
            <div class="vd"></div>
          </div>
          <div class="p-elems"><div class="row"></div><small></small></div>
          <div class="btn btn-gold p-sortie brk" data-act="sortie"><span class="k">F</span><div>出击<em>SORTIE</em></div></div>
        </div>
        ${G.keybar([
          { k: ['←', '→'], t: '选择编队位' },
          { k: ['Enter'], t: '更换角色' },
          { k: ['C'], t: '角色详情' },
          { k: ['F'], t: '出击', act: 'sortie' },
          { k: ['Esc'], t: '返回', act: 'back' },
        ])}`;
      const head = this.$('.scr-head');
      head.insertAdjacentHTML('beforeend', `<div class="quest-chip">${G.bossCrest()}<span class="d">${D().TIERS.find((t) => t.id === q.tier).name}</span><b>${q.name}</b><small>推荐战力<b>${G.fmt(q.rec)}</b></small></div>`);
      this.renderCards();
      this.updatePower(null, true);
    }
    /* ---------- 编队位 ---------- */
    cardHTML(id, i) {
      const c = D().chars[id];
      const st = G.calcStats(id);
      const b = G.state.builds[id];
      return `<div class="slot"><b>0${i + 1}</b><span class="role">${i === 0 ? G.icon('ui-pad') + '操作角色' : G.icon('ui-chip') + '队友 · AI'}</span></div>
        <div class="pc-crest">${halo()}${G.crest(id)}</div>
        <div class="pc-name"><b>${c.name}</b><span class="lv">Lv<strong>${c.lv}</strong></span></div>
        <div class="pc-sub">${c.en}<span>${c.title}</span></div>
        <div class="pc-tags">${G.elTag(c.el)}${G.wpTag(c.weapon)}</div>
        <div class="pc-pow">${G.icon('ui-power')}<small>战力</small><b class="num">${G.fmt(st.power)}</b></div>
        <div class="pc-skills">${b.skills.map((s) => G.skillBadge(s, c.el)).join('')}</div>
        <div class="pc-btns"><div class="pc-btn" data-act="swap" data-i="${i}">${G.icon('ui-swap')}更换</div><div class="pc-btn" data-act="detail" data-i="${i}">${G.icon('ui-person')}详情<kbd>C</kbd></div></div>`;
    }
    renderCards() {
      const wrap = this.$('.p-cards');
      wrap.innerHTML = G.state.party
        .map((id, i) => `<div class="pcard brk el-${D().chars[id].el} ${i === 0 ? 'leader' : ''}" data-act="slot" data-i="${i}" style="--i:${i}">${this.cardHTML(id, i)}</div>`)
        .join('');
    }
    refreshCard(i, flip) {
      const card = this.$(`.pcard[data-i="${i}"]`);
      const id = G.state.party[i];
      const apply = () => {
        card.className = `pcard brk el-${D().chars[id].el} ${i === 0 ? 'leader' : ''} ${flip ? 'flip' : ''} ${G.UI.hover === card ? 'hov' : ''}`;
        card.innerHTML = this.cardHTML(id, i);
      };
      if (flip) {
        card.classList.remove('flip');
        void card.offsetWidth;
        card.classList.add('flip');
        this.after(330, apply);
      } else apply();
    }
    updatePower(previewParty, instant) {
      const q = this.q;
      const cur = G.partyPower();
      const pv = previewParty ? G.partyPower(previewParty) : cur;
      const max = Math.max(cur, pv, q.rec) * 1.12;
      this.$('.bar.rec i').style.width = (q.rec / max) * 100 + '%';
      this.$('.bar.cur .cv').style.width = (Math.min(cur, pv) / max) * 100 + '%';
      const pvEl = this.$('.bar.cur .pv');
      pvEl.style.width = (Math.max(cur, pv) / max) * 100 + '%';
      pvEl.classList.toggle('neg', pv < cur);
      pvEl.style.opacity = pv !== cur ? 1 : 0;
      this.$('.bar.cur .mark').style.left = (q.rec / max) * 100 + '%';
      const shown = pv;
      const el = this.$('.p-cur');
      const from = this.lastPow == null ? 0 : this.lastPow;
      if (from !== shown) G.countTo(el, from, shown, instant ? 900 : 500, { delay: instant ? 300 : 0 });
      this.lastPow = shown;
      const diff = shown - q.rec;
      const vd = this.$('.vd');
      vd.className = 'vd ' + (diff >= 0 ? '' : 'bad');
      vd.innerHTML = `${G.icon(diff >= 0 ? 'ui-check' : 'ui-warn')}${diff >= 0 ? '战力充足' : '战力不足'}<span class="dl num">${diff >= 0 ? '+' : ''}${G.fmt(diff)}</span>${pv !== cur ? `<span class="dl num" style="color:${pv > cur ? 'var(--mint)' : 'var(--rose)'};margin-left:14px">（${pv > cur ? '▲ +' : '▼ '}${G.fmt(pv - cur)}）</span>` : ''}`;
      // 属性构成
      const party = previewParty || G.state.party;
      this.$('.p-elems .row').innerHTML = party.map((id) => G.elBadge(D().chars[id].el)).join('');
      const weak = q.boss.weak;
      const has = party.find((id) => D().chars[id].el === weak);
      const sm = this.$('.p-elems small');
      sm.className = has ? 'ok' : '';
      sm.innerHTML = has ? `${G.icon('ui-check')}编队中有克制首领的${G.elBadge(weak)}${D().ELEMENTS[weak].name}属性角色` : `${G.icon('ui-info')}建议编入${G.elBadge(weak)}${D().ELEMENTS[weak].name}属性角色`;
    }
    /* ---------- 换人 ---------- */
    openSwap(i) {
      if (this.mode !== 'party') return;
      this.mode = 'swap';
      this.slotIdx = i;
      const curId = G.state.party[i];
      this.$$('.pcard').forEach((c) => c.classList.toggle('picking', +c.dataset.i === i));
      const curPow = G.calcStats(curId).power;
      const dr = G.html(`<div class="drawer"><h3>选择队员<em>SELECT MEMBER</em><span>更换 0${i + 1} 号位：${D().chars[curId].name}</span><span class="dpv"></span></h3>
        <div class="ctiles">${D().CHAR_ORDER.map((id, k) => {
          const c = D().chars[id];
          const pw = G.calcStats(id).power;
          const inP = G.state.party.indexOf(id);
          const dl = pw - curPow;
          return `<div class="ctile brk el-${c.el} ${id === curId ? 'cur' : ''}" data-act="pickc" data-id="${id}" style="--i:${k}">
            ${inP >= 0 ? `<span class="inp">${id === curId ? '当前' : '编队中 0' + (inP + 1)}</span>` : ''}
            ${G.crest(id)}<b>${c.name}</b>
            <div class="ci">${G.elBadge(c.el)}${G.icon('w-' + c.weapon)}Lv ${c.lv}</div>
            <div class="cp">${G.icon('ui-power')}${G.fmt(pw)}</div>
            <div class="dl ${dl < 0 ? 'neg' : dl === 0 ? 'zero' : ''}">${id === curId ? '—' : (dl >= 0 ? '▲ +' : '▼ ') + G.fmt(dl)}</div></div>`;
        }).join('')}</div></div>`);
      this.root.appendChild(dr);
      this.drawer = dr;
      if (!G.touring && !G.exporting) G.UI.setHover(dr.querySelector('.ctile:not(.cur)'));
    }
    swapParty(id) {
      const party = G.state.party.slice();
      const i = this.slotIdx;
      const cur = party[i];
      const j = party.indexOf(id);
      if (j >= 0) party[j] = cur;
      party[i] = id;
      return { party, j };
    }
    closeSwap() {
      const dr = this.drawer;
      this.drawer = null;
      this.mode = 'party';
      this.$$('.pcard').forEach((c) => c.classList.remove('picking'));
      this.updatePower(null);
      if (dr) {
        dr.classList.add('out');
        this.after(300, () => dr.remove());
      }
      G.UI.setHover(this.$(`.pcard[data-i="${this.slotIdx}"]`));
    }
    pickChar(id) {
      const curId = G.state.party[this.slotIdx];
      if (id === curId) return this.closeSwap();
      const { party, j } = this.swapParty(id);
      G.state.party = party;
      this.refreshCard(this.slotIdx, true);
      if (j >= 0) this.refreshCard(j, true);
      this.closeSwap();
    }
    /* ---------- 角色详情 ---------- */
    openDetail(i) {
      if (this.mode !== 'party') return;
      this.mode = 'detail';
      this.detIdx = i;
      const el = G.html(`<div class="detail"></div>`);
      this.root.appendChild(el);
      this.detEl = el;
      this.renderDetail();
    }
    detId() { return G.state.party[this.detIdx]; }
    renderDetail() {
      const id = this.detId();
      const c = D().chars[id];
      const b = G.state.builds[id];
      const st = G.calcStats(id);
      const el = this.detEl;
      el.className = `detail el-${c.el}`;
      el.innerHTML = `
        ${G.scrHead('角色详情', 'CHARACTER · 养成', 'ui-person', false)}
        <div class="det-col det-l">
          <div class="det-id" style="animation-delay:.05s"><div class="crestwrap">${halo()}${G.crest(id)}</div>
            <div><h2>${c.name}</h2><div class="en">${c.en}</div><div class="ttl">「${c.title}」</div><div class="tags">${G.elTag(c.el)}${G.wpTag(c.weapon)}</div></div></div>
          <div class="det-lv plate" style="animation-delay:.1s"><div class="lvrow"><small>LV</small><b>${c.lv}</b><span>/ 100</span><em>距离升级<b class="num">${G.fmt(c.exp[1] - c.exp[0])}</b>EXP</em></div>
            <div class="expbar"><i style="width:${(c.exp[0] / c.exp[1]) * 100}%"></i></div></div>
          <div class="det-stats plate" style="animation-delay:.15s"><div class="det-h"><b>属性</b>STATUS<span class="pvhint"></span></div>
            ${G.STAT_ROWS.map((r) => `<div class="srow ${r.k === 'power' ? 'big' : ''}" data-k="${r.k}">${G.icon(r.icon)}<span class="sn">${r.name}<small>${r.en}</small></span><b class="sv num">${r.fmt(st[r.k])}</b><span class="sd num"></span></div>`).join('')}
          </div>
        </div>
        <div class="det-col det-m">
          <div class="det-wp plate" style="animation-delay:.12s">${G.itemTile2(c.weaponItem, c.weapon)}<div><div class="wn">${c.weaponItem.name}</div><div class="wm">${G.elBadge(c.weaponItem.el)}${D().ELEMENTS[c.weaponItem.el].name}属性 · ${D().WEAPONS[c.weapon].name}<b>Lv ${c.weaponItem.lv}</b></div></div>
            <div class="ws"><small>武器攻击力</small><b class="num">+${G.fmt(c.weaponItem.atk)}</b></div></div>
          <div class="det-sk plate" style="animation-delay:.18s"><div class="det-h"><b>技能</b>SKILLS<span>点击技能槽替换</span></div>
            ${b.skills.map((s, k) => this.skrowHTML(s, k, c.el)).join('')}</div>
        </div>
        <div class="det-col det-r">
          <div class="det-sg plate" style="animation-delay:.16s"><div class="det-h"><b>徽印</b>SIGILS<span>${b.sigils.filter(Boolean).length} / ${b.sigils.length}</span></div>
            <div class="sgrid">${b.sigils.map((s, k) => this.sglHTML(s, k)).join('')}</div></div>
          <div class="det-tr plate" style="animation-delay:.22s"><div class="det-h"><b>特性汇总</b>TRAITS<span>同类特性叠加</span></div><div class="trows"></div></div>
        </div>
        ${G.keybar([
          { k: ['↑', '↓', '←', '→'], t: '选择' },
          { k: ['Enter'], t: '更换' },
          { k: ['Q', 'E'], t: '切换角色' },
          { k: ['Esc'], t: '返回', act: 'back' },
        ])}`;
      const head = el.querySelector('.scr-head');
      head.insertAdjacentHTML('beforeend', `<div class="det-sw"><kbd data-act="detprev">Q</kbd>${G.state.party.map((pid, k) => `<span class="sw brk ${k === this.detIdx ? 'on' : ''}" data-act="detsw" data-i="${k}">${G.crest(pid)}</span>`).join('')}<kbd data-act="detnext">E</kbd></div>`);
      this.renderTraits();
    }
    skrowHTML(s, k, el) {
      const S = D().SKILLS[s];
      return `<div class="skrow brk" data-act="skill" data-k="${k}"><span class="num">${k + 1}</span>${G.skillBadge(s, el)}
        <div class="skt"><div class="skn">${S.name}<em>${S.en}</em><span class="cdc">${G.icon('ui-time')}${S.cd.toFixed(1)}s</span></div><div class="skd">${S.desc}</div></div></div>`;
    }
    sglHTML(s, k) {
      return `<div class="sgl brk ${s ? '' : 'empty'}" data-act="sigil" data-k="${k}"><div class="med">${G.sigilMedal(s)}</div><b>${s ? D().TRAITS[s.t].name : '空槽位'}</b><span>${s ? 'Lv ' + s.lv : '—'}</span></div>`;
    }
    renderTraits(previewBuild) {
      const id = this.detId();
      const b = G.state.builds[id];
      const cur = G.traitSum(b.sigils);
      const pv = previewBuild ? G.traitSum(previewBuild.sigils) : null;
      const cnt = {};
      b.sigils.forEach((s) => s && (cnt[s.t] = (cnt[s.t] || 0) + 1));
      const keys = Array.from(new Set([...Object.keys(cur), ...(pv ? Object.keys(pv) : [])]));
      keys.sort((a, z) => ((pv ? pv[z] : cur[z]) || cur[z] || 0) - ((pv ? pv[a] : cur[a]) || cur[a] || 0));
      const T = D().TRAITS;
      this.$('.trows').innerHTML = keys
        .slice(0, 8)
        .map((k) => {
          const lv0 = cur[k] || 0;
          const lv1 = pv ? pv[k] || 0 : lv0;
          const max = T[k].max;
          const segs = 15;
          const on0 = Math.ceil((Math.min(lv0, max) / max) * segs), on1 = Math.ceil((Math.min(lv1, max) / max) * segs);
          let bar = '';
          for (let i = 0; i < segs; i++) {
            let cls = '';
            if (i < Math.min(on0, on1)) cls = 'on';
            else if (i < on1) cls = 'add';
            else if (i < on0) cls = 'rem';
            bar += `<i class="${cls}"></i>`;
          }
          const ch = lv1 !== lv0;
          return `<div class="trow ${ch ? (lv1 > lv0 ? 'inc' : 'dec') : ''} ${cnt[k] > 1 ? 'stack' : ''}">${G.icon(T[k].icon)}<span class="tn">${T[k].name}</span><span class="tb">${bar}</span><span class="tl">${ch ? `${lv0} → ${lv1}` : `Lv ${Math.min(lv0, max)}<small>/${max}</small>`}</span></div>`;
        })
        .join('');
    }
    preview(build) {
      const id = this.detId();
      const s0 = G.calcStats(id);
      const s1 = build ? G.calcStats(id, build) : s0;
      let any = false;
      G.STAT_ROWS.forEach((r) => {
        const row = this.$(`.srow[data-k="${r.k}"]`);
        if (!row) return;
        const d = s1[r.k] - s0[r.k];
        row.classList.remove('inc', 'dec');
        const sd = row.querySelector('.sd');
        if (Math.abs(d) > 0.001) {
          any = true;
          const better = r.lowerBetter ? d < 0 : d > 0;
          row.classList.add(better ? 'inc' : 'dec');
          sd.textContent = fmtDelta(r, d);
        } else sd.textContent = '';
      });
      this.$('.pvhint').textContent = any ? '预览：替换后的数值变化' : '';
      this.renderTraits(build);
    }
    commit(build, kind, k) {
      const id = this.detId();
      const s0 = G.calcStats(id);
      G.state.builds[id] = build;
      const s1 = G.calcStats(id);
      G.STAT_ROWS.forEach((r) => {
        const row = this.$(`.srow[data-k="${r.k}"]`);
        row.classList.remove('inc', 'dec');
        row.querySelector('.sd').textContent = '';
        if (Math.abs(s1[r.k] - s0[r.k]) > 0.001) {
          G.countTo(row.querySelector('.sv'), s0[r.k], s1[r.k], 700, { fmt: r.fmt });
          G.retrigger(row, 'flash');
        }
      });
      this.$('.pvhint').textContent = '';
      const c = D().chars[id];
      if (kind === 'skill') {
        const old = this.$(`.skrow[data-k="${k}"]`);
        const nn = G.html(this.skrowHTML(build.skills[k], k, c.el));
        nn.classList.add('swapped');
        old.replaceWith(nn);
      } else {
        const old = this.$(`.sgl[data-k="${k}"]`);
        const nn = G.html(this.sglHTML(build.sigils[k], k));
        nn.classList.add('swapped');
        old.replaceWith(nn);
        this.$('.det-sg .det-h span').textContent = `${build.sigils.filter(Boolean).length} / ${build.sigils.length}`;
      }
      this.renderTraits();
      // 编队卡同步
      this.refreshCard(this.detIdx, false);
      this.updatePower(null);
    }
    openPicker(kind, k) {
      if (this.mode !== 'detail') return;
      this.mode = 'picker';
      this.pick = { kind, k };
      const id = this.detId();
      const c = D().chars[id];
      const b = G.state.builds[id];
      let rows = '';
      if (kind === 'skill') {
        const cur = b.skills[k];
        rows = c.pool
          .map((s, i) => {
            const S = D().SKILLS[s];
            const eq = b.skills.indexOf(s);
            const isCur = s === cur;
            return `<div class="pkrow brk ${eq >= 0 ? 'cur' : ''}" ${eq >= 0 && !isCur ? '' : `data-act="pk"`} data-v="${s}" style="--i:${i}">${G.skillBadge(s, c.el)}
              <div class="pt"><div class="pn">${S.name}<span class="cdc">CD ${S.cd.toFixed(1)}s</span></div><div class="pd">${S.desc}${S.pow ? ` 威力 ${S.pow}%` : ''}</div></div>${eq >= 0 ? `<span class="eq">${isCur ? '当前槽位' : '已装备 · 槽' + (eq + 1)}</span>` : ''}</div>`;
          })
          .join('');
      } else {
        const cur = b.sigils[k];
        rows = G.state.bag
          .map((s, i) => `<div class="pkrow brk" data-act="pk" data-v="${i}" style="--i:${i}"><div class="med">${G.sigilMedal(s)}</div>
            <div class="pt"><div class="pn">${D().TRAITS[s.t].name}<span class="lvc">Lv ${s.lv}</span></div><div class="pd">${D().RARITY[s.r].name}徽印 · ${this.traitDesc(s)}</div></div></div>`)
          .join('');
        if (cur) rows += `<div class="pkrow brk" data-act="pk" data-v="none" style="--i:${G.state.bag.length}"><div class="med">${G.sigilMedal(null)}</div><div class="pt"><div class="pn">卸下徽印</div><div class="pd">将该徽印放回背包，槽位留空。</div></div></div>`;
      }
      const curName = kind === 'skill' ? D().SKILLS[b.skills[k]].name : b.sigils[k] ? `${D().TRAITS[b.sigils[k].t].name} Lv ${b.sigils[k].lv}` : '空槽位';
      const pk = G.html(`<div class="picker ${kind === 'sigil' ? 'sig' : ''}"><h3>${kind === 'skill' ? '选择技能' : '选择徽印'}<em>${kind === 'skill' ? 'SELECT SKILL' : 'SELECT SIGIL'}</em></h3>
        <div class="rep">替换：<b>${curName}</b> · 悬停查看属性变化</div><div class="pk-list">${rows}</div></div>`);
      this.detEl.appendChild(pk);
      this.pickEl = pk;
      const slot = this.$(kind === 'skill' ? `.skrow[data-k="${k}"]` : `.sgl[data-k="${k}"]`);
      if (slot) slot.classList.add('editing');
      if (!G.touring && !G.exporting) G.UI.setHover(pk.querySelector('.pkrow[data-act]:not(.cur)') || pk.querySelector('.pkrow[data-act]'));
    }
    traitDesc(s) {
      const m = { atk: '攻击力 +' + s.lv * 36, hp: '生命值 +' + G.fmt(s.lv * 160), def: '防御力 +' + s.lv * 22, crit: '暴击率 +' + (s.lv * 0.9).toFixed(1) + '%', critdmg: '暴击伤害 +' + s.lv * 2 + '%', ultgain: '奥义效率 +' + (s.lv * 1.6).toFixed(1) + '%', link: '连携值获取提升', cdr: '技能冷却 -' + (s.lv * 1.2).toFixed(1) + '%', eldmg: '技能威力 +' + s.lv * 2 + '%', brk: '破防时伤害提升' };
      return m[s.t] || '';
    }
    candidateBuild(v) {
      const id = this.detId();
      const b = G.state.builds[id];
      const nb = { skills: b.skills.slice(), sigils: b.sigils.map((s) => (s ? Object.assign({}, s) : null)) };
      if (this.pick.kind === 'skill') nb.skills[this.pick.k] = v;
      else nb.sigils[this.pick.k] = v === 'none' ? null : Object.assign({}, G.state.bag[+v]);
      return nb;
    }
    closePicker() {
      const pk = this.pickEl;
      this.pickEl = null;
      this.mode = 'detail';
      this.preview(null);
      this.$$('.editing').forEach((n) => n.classList.remove('editing'));
      if (pk) { pk.classList.add('out'); this.after(260, () => pk.remove()); }
      const k = this.pick.k;
      G.UI.setHover(this.$(this.pick.kind === 'skill' ? `.skrow[data-k="${k}"]` : `.sgl[data-k="${k}"]`));
    }
    choose(v) {
      const { kind, k } = this.pick;
      const id = this.detId();
      const b = G.state.builds[id];
      if (kind === 'skill' && v === b.skills[k]) return this.closePicker();
      const nb = this.candidateBuild(v);
      if (kind === 'sigil') {
        const old = b.sigils[k];
        if (v !== 'none') G.state.bag.splice(+v, 1);
        if (old) G.state.bag.push(old);
      }
      const pk = this.pickEl;
      this.pickEl = null;
      this.mode = 'detail';
      if (pk) { pk.classList.add('out'); this.after(260, () => pk.remove()); }
      this.commit(nb, kind, k);
      G.UI.setHover(this.$(kind === 'skill' ? `.skrow[data-k="${k}"]` : `.sgl[data-k="${k}"]`));
    }
    closeDetail() {
      const el = this.detEl;
      this.detEl = null;
      this.mode = 'party';
      el.classList.add('out');
      this.after(300, () => el.remove());
      G.UI.setHover(this.$(`.pcard[data-i="${this.detIdx}"]`));
    }
    switchDetail(d) {
      this.detIdx = (this.detIdx + d + 4) % 4;
      this.renderDetail();
    }
    onHover(el) {
      if (this.mode === 'swap') {
        const dpv = this.drawer && this.drawer.querySelector('.dpv');
        if (el && el.classList.contains('ctile')) {
          const { party } = this.swapParty(el.dataset.id);
          this.updatePower(party);
          const a = G.partyPower(), b = G.partyPower(party);
          if (dpv) dpv.innerHTML = b === a ? '' : `队伍战力<b>${G.fmt(a)}</b><span class="ar">→</span><b>${G.fmt(b)}</b><span class="${b > a ? 'inc' : 'dec'}">${b > a ? '▲ +' : '▼ '}${G.fmt(b - a)}</span>`;
        } else { this.updatePower(null); if (dpv) dpv.innerHTML = ''; }
      } else if (this.mode === 'picker') {
        if (el && el.classList.contains('pkrow') && el.dataset.act) this.preview(this.candidateBuild(el.dataset.v));
        else this.preview(null);
      }
    }
    sortie() {
      if (this.mode !== 'party') return;
      this.mode = 'leaving';
      G.App.go('battle', {}, 'sortie', { sub: `${this.q.name} · ${D().TIERS.find((t) => t.id === this.q.tier).name}` });
    }
    act(a, el) {
      const i = el.dataset.i != null ? +el.dataset.i : null;
      if (this.mode === 'party') {
        if (a === 'slot' || a === 'swap') this.openSwap(i);
        else if (a === 'detail') this.openDetail(i);
        else if (a === 'sortie') this.sortie();
        else if (a === 'back') this.back();
      } else if (this.mode === 'swap') {
        if (a === 'pickc') this.pickChar(el.dataset.id);
        else if (a === 'back') this.back();
      } else if (this.mode === 'detail') {
        if (a === 'detprev' || a === 'detnext') this.switchDetail(a === 'detprev' ? -1 : 1);
        else if (a === 'detsw') { if (+el.dataset.i !== this.detIdx) this.switchDetail(+el.dataset.i - this.detIdx); }
        else if (a === 'skill') this.openPicker('skill', +el.dataset.k);
        else if (a === 'sigil') this.openPicker('sigil', +el.dataset.k);
        else if (a === 'back') this.back();
      } else if (this.mode === 'picker') {
        if (a === 'pk') this.choose(el.dataset.v);
        else if (a === 'skill' || a === 'sigil') { this.closePicker(); this.act(a, el); }
        else if (a === 'back') this.back();
      }
    }
    blankClick() {
      if (this.mode === 'swap') this.closeSwap();
      else if (this.mode === 'picker') this.closePicker();
    }
    key(e) {
      const k = e.key.toLowerCase();
      const hov = G.UI.hover;
      if (this.mode === 'party') {
        const cards = this.$$('.pcard');
        if (k === 'arrowleft' || k === 'a') G.navList(cards, -1);
        else if (k === 'arrowright' || k === 'd') G.navList(cards, 1);
        else if (k === 'enter' || k === ' ') {
          if (hov && hov.dataset.act === 'sortie') G.UI.click(hov);
          else { const c = cards.includes(hov) ? hov : cards[0]; G.UI.click(c); }
        } else if (k === 'c') { const c = cards.includes(hov) ? hov : cards[0]; this.openDetail(+c.dataset.i); }
        else if (k === 'f') G.UI.click(this.$('.p-sortie'));
        else if (k === 'arrowdown') G.UI.setHover(this.$('.p-sortie'));
        else if (k === 'arrowup') G.UI.setHover(cards[0]);
        else return false;
        return true;
      }
      if (this.mode === 'swap') {
        const tiles = this.$$('.ctile');
        if (k === 'arrowleft' || k === 'a') G.navList(tiles, -1);
        else if (k === 'arrowright' || k === 'd') G.navList(tiles, 1);
        else if (k === 'enter' || k === ' ') { if (tiles.includes(hov)) G.UI.click(hov); }
        else return false;
        return true;
      }
      if (this.mode === 'detail') {
        const sk = this.$$('.skrow'), sg = this.$$('.sgl');
        const inSk = sk.includes(hov), inSg = sg.includes(hov);
        if (k === 'arrowup' || k === 'arrowdown' || k === 'w' || k === 's') {
          const d = k === 'arrowup' || k === 'w' ? -1 : 1;
          if (inSg) G.navGrid(sg, 0, d, 5);
          else G.navList(sk, d);
        } else if (k === 'arrowright' || k === 'd') {
          if (inSg) G.navGrid(sg, 1, 0, 5);
          else G.UI.setHover(sg[0]);
        } else if (k === 'arrowleft' || k === 'a') {
          if (inSg && sg.indexOf(hov) % 5 !== 0) G.navGrid(sg, -1, 0, 5);
          else G.UI.setHover(sk[inSg ? Math.min(3, Math.floor(sg.indexOf(hov) / 5) * 2) : 0]);
        } else if (k === 'enter' || k === ' ') { if (inSk || inSg) G.UI.click(hov); else G.UI.setHover(sk[0]); }
        else if (k === 'q' || k === 'e') this.switchDetail(k === 'q' ? -1 : 1);
        else return false;
        return true;
      }
      if (this.mode === 'picker') {
        const rows = this.$$('.pkrow[data-act]');
        if (k === 'arrowup' || k === 'w') G.navList(rows, -1);
        else if (k === 'arrowdown' || k === 's') G.navList(rows, 1);
        else if (k === 'enter' || k === ' ') { if (rows.includes(hov)) G.UI.click(hov); }
        else return false;
        return true;
      }
      return true;
    }
    back() {
      if (this.mode === 'picker') this.closePicker();
      else if (this.mode === 'detail') this.closeDetail();
      else if (this.mode === 'swap') this.closeSwap();
      else if (this.mode === 'party') G.App.go('quest', { tier: this.q.tier }, 'wind');
    }
  }
  G.App.register('party', PartyScene);

  // 武器道具格
  G.itemTile2 = (wi, weapon) => `<div class="itile r-${wi.rarity}">${G.rarityPips(wi.rarity)}${G.icon('w-' + weapon)}${G.elBadge(wi.el, 'iel')}</div>`;
})();
