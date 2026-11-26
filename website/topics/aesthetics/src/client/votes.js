// 观测者票选（docs/votes.md）：浏览器里唯一的一份票状态，和页面上各个票选部件的接线。
//
//   票箱  接口地址在页面的 #ae-votes 里，构建时定：线上在自己的子域 https://api.wendystars.com/api/votes/v1/<专题>/（跨源），
//         开发服务器是同源的 /api/votes/…。每个请求都带凭据（credentials: 'include'），观测者 ID 的 Cookie 才跟得过去。
//   状态  计票 tally（票箱的 /tally；连不上时退回发布时的快照 votes.json，构建时写进页面的 #ae-votes）、
//         我的票 mine（/me，每一卷按投票的先后）、票箱 status（loading → open | closed）。
//         进页面取一次，投票或撤回后取一次，页面停在前台时每分钟取一次，后台不取。
//   投票  乐观更新：先在页面上把孔打出来，同时发请求；服务端拒绝时孔用补丁退回，并写明原因。
//         票箱打开无感校验（/me 带 pow）时，投票前在后台先算好那道小题，观测者看不到任何界面。
//         投票回来的那一卷计票比 /tally 新（/tally 在边缘缓存 30 秒），这 35 秒里那一卷以它为准。
//   事件  状态每变一次在 document 上发 ae:votes（detail: { state, change }），各部件只听这个事件改自己，部件之间不直接互相调用。
//         change.kind：load、refresh、vote、retract（乐观的那一下）、confirm（服务端认了）、undo-vote、undo-retract（服务端拒了，退回）
//   部件  [data-ballot] 观测票   [data-punch] 打孔钮   [data-vote-mark] 页签上的小孔   [data-rank] 本卷票选
//         [data-vote-totals] 总得票   [data-vote-matrix] / [data-vote-cards] 星表   [data-vote-facts] [data-vote-state] 票选页页首
//         [data-vote-count] [data-vote-total] [data-vote-voters] 一句票数   [data-vote-asof] 截至几点几分   [data-vote-live] 读屏播报
//         [data-vote-ui]：要靠脚本的部件，构建时带 hidden，票箱的状态定下来以后才露出来（没有脚本时不出现）
//   动效  守设计系统第十节：打孔一下子打穿，黄铜环用 land 描完一圈，打下的小圆纸片沿 exit 落下、淡出；
//         撤回时纸补丁用 land 贴上，停一下再淡出；本卷票选第一次揭晓时纸签展开、各行依次落定；换位用 land。
//         系统要求减少动态效果时只剩 0.15 秒的透明度变化。
import './site.js';

const node = document.getElementById('ae-votes');
if (node) start(JSON.parse(node.textContent));

function start(cfg) {
  const LAND = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const EXIT = 'cubic-bezier(0.4, 0, 1, 1)';
  const PER_TASK = 2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const plural = new Intl.PluralRules(cfg.lang === 'en' ? 'en' : 'zh-CN');
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const pad = (n) => String(n).padStart(2, '0');

  /** 文案：cfg.t 是 votes.json 的那一份（英文缺的已退回中文）；值可以是 {one, other}，按 vars.n 选 */
  function tr(key, vars = {}) {
    let v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), cfg.t);
    if (v && typeof v === 'object') v = v[plural.select(+(vars.n ?? 0))] ?? v.other;
    return typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : '';
  }
  const nameOf = (id) => cfg.models[id]?.name ?? id;
  const shortOf = (id) => cfg.models[id]?.short ?? id;
  const pctOf = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '0%');

  /** 截至几点几分：今天只写时分，别的日子带日期（观测者自己的时区） */
  function timeOf(iso) {
    const d = new Date(iso ?? Date.now());
    if (Number.isNaN(d.getTime())) return '';
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return d.toDateString() === new Date().toDateString() ? hm : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${hm}`;
  }

  /* ---------- 状态 ---------- */

  /** 计票整理成只含名单里的作品：{ updated, voters, taskVoters, tasks: { 题key: { 型号id: 票数 } } } */
  function clean(raw) {
    if (!raw || typeof raw !== 'object' || !raw.tasks || typeof raw.tasks !== 'object') return null;
    const out = { updated: raw.updated ?? null, voters: num(raw.voters), taskVoters: {}, tasks: {} };
    for (const [task, ids] of Object.entries(cfg.votable)) {
      out.tasks[task] = Object.fromEntries(ids.map((id) => [id, num(raw.tasks[task]?.[id])]));
      out.taskVoters[task] = num(raw.taskVoters?.[task]);
    }
    return out;
  }
  const cleanMine = (votes) => Object.fromEntries(Object.entries(cfg.votable).map(([task, ids]) => [task, (Array.isArray(votes?.[task]) ? votes[task] : []).filter((m) => ids.includes(m))]));

  const snapshot = clean(cfg.snapshot);
  const state = {
    status: 'loading',                    // loading | open | closed
    source: snapshot ? 'snapshot' : 'none',   // 计票从哪来：live 票箱 | snapshot 发布时的快照 | none 都没有
    tally: snapshot,
    mine: cleanMine({}),
  };
  const recent = new Map();               // 题key → { counts, voters, until }：投票回来的这一卷计票
  let recentVoters = null;                // { value, until }：投出第一票后专题的观测者数
  let pending = 0;                        // 还没回来的投票、撤回
  let fetchedAt = 0;
  const personal = Boolean(document.querySelector('[data-ballot], [data-punch], [data-vote-mark], [data-rank]'));

  const mineOf = (task) => state.mine[task] ?? [];
  const countOf = (task, id) => state.tally?.tasks[task]?.[id] ?? 0;

  /** 本卷票选揭晓过的卷（记在本地，下次来仍是展开的） */
  const SEEN = 'ae.votes.seen';
  const seen = (() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')); } catch { return new Set(); } })();
  function markSeen(task) {
    if (seen.has(task)) return;
    seen.add(task);
    try { localStorage.setItem(SEEN, JSON.stringify([...seen])); } catch { /* 存不了就只在这一次访问里展开 */ }
  }
  const revealed = (task) => seen.has(task) || mineOf(task).length > 0;

  function emit(change) {
    document.dispatchEvent(new CustomEvent('ae:votes', { detail: { state, change } }));
  }

  /* ---------- 票箱 ---------- */

  async function call(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(cfg.api + path, {
        method,
        credentials: 'include',                    // 线上票箱在另一个子域：观测者 ID 的 Cookie 要跨源带上
        cache: path === 'tally' ? 'default' : 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw { code: 'network' };
    }
    let data = null;
    try { data = await res.json(); } catch { /* 不是 JSON：多半是这里没有挂票箱 */ }
    if (!res.ok || !data) {
      const code = data?.error ?? (res.status === 404 || res.status >= 500 ? 'closed' : 'unknown');
      throw { code: code === 'not_found' ? 'closed' : code, status: res.status, data, retryAfter: num(res.headers.get('Retry-After')) };
    }
    return data;
  }

  /** 把一次完整的计票合进来：比投票回来的那一卷旧的（边缘缓存里的，updated 更早），那一卷以投票回来的数为准；
   *  一样新或更新的（别的观测者、别的标签页又投了）照它 */
  const older = (r, next) => (r.at && next.updated ? next.updated < r.at : r.until > Date.now());
  function take(raw) {
    const next = clean(raw);
    if (!next) return;
    for (const [task, r] of recent) {
      if (r.until < Date.now() || !older(r, next)) { recent.delete(task); continue; }
      next.tasks[task] = { ...r.counts };
      next.taskVoters[task] = r.voters;
    }
    if (recentVoters && recentVoters.until > Date.now() && older(recentVoters, next)) next.voters = recentVoters.value;
    state.tally = next;
    state.source = 'live';
  }

  async function load(kind) {
    if (pending) return;                  // 投票还在路上：等它回来再取（投完会取一次）
    const [tally, me] = await Promise.allSettled([call('tally'), personal ? call('me') : Promise.resolve(null)]);
    if (pending) return;
    if (tally.status === 'fulfilled') take(tally.value);
    if (personal && me.status === 'fulfilled') {
      state.mine = cleanMine(me.value?.votes);
      if (me.value?.pow) prepare(me.value.pow);
    }
    state.status = tally.status === 'fulfilled' && (!personal || me.status === 'fulfilled') ? 'open' : 'closed';
    fetchedAt = Date.now();
    emit({ kind });
  }

  /* 无感校验：sha256(题面:答案) 的前导零位数够了就是答案（website/services/votes/src/signing.js）。一道题只能用一次 */
  let proof = null;
  function zeros(bytes) {
    let bits = 0;
    for (const b of bytes) {
      if (b === 0) { bits += 8; continue; }
      return bits + Math.clz32(b) - 24;
    }
    return bits;
  }
  async function solve({ challenge, difficulty } = {}) {
    if (typeof challenge !== 'string' || !(difficulty > 0) || !globalThis.crypto?.subtle) return null;
    const enc = new TextEncoder();
    for (let i = 0; i < 1 << 24; i++) {
      const nonce = i.toString(36);
      if (zeros(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${challenge}:${nonce}`)))) >= difficulty) return { challenge, nonce };
      if (i % 4000 === 3999) await new Promise((r) => setTimeout(r));
    }
    return null;
  }
  // 题面五分钟内有效：手上那道算好的题快过期了才换一道新的
  let proofAt = 0;
  function prepare(pow) {
    if (proof && Date.now() - proofAt < 240_000) return;
    proof = solve(pow);
    proofAt = Date.now();
  }

  /** 乐观地改计票：d 是 +1 / −1；这位观测者在这一卷、在整个专题从没票变有票（或反过来）时，观测者数跟着变 */
  function bump(task, id, d, before) {
    const t = state.tally;
    if (!t) return;
    t.tasks[task] = { ...t.tasks[task], [id]: Math.max(0, (t.tasks[task]?.[id] ?? 0) + d) };
    const wasEmpty = before.task === 0, nowEmpty = before.task + d === 0;
    if (d > 0 && wasEmpty) t.taskVoters[task] = (t.taskVoters[task] ?? 0) + 1;
    if (d < 0 && nowEmpty) t.taskVoters[task] = Math.max(0, (t.taskVoters[task] ?? 0) - 1);
    if (d > 0 && before.all === 0) t.voters += 1;
    if (d < 0 && before.all + d === 0) t.voters = Math.max(0, t.voters - 1);
  }
  const before = (task) => ({ task: mineOf(task).length, all: sum(Object.values(state.mine).map((l) => l.length)) });

  /** 服务端回来的这一卷：{ task, votes, tally, voters, updated } */
  function settle(task, res) {
    if (!res || typeof res !== 'object') return;
    if (Array.isArray(res.votes)) state.mine[task] = res.votes.filter((m) => cfg.votable[task]?.includes(m));
    if (state.tally && res.tally && typeof res.tally === 'object') {
      const counts = Object.fromEntries((cfg.votable[task] ?? []).map((id) => [id, num(res.tally[id])]));
      state.tally.tasks[task] = counts;
      state.tally.taskVoters[task] = num(res.voters);
      if (res.updated) state.tally.updated = res.updated;
      recent.set(task, { counts, voters: num(res.voters), at: res.updated ?? null, until: Date.now() + 35_000 });
    }
    recentVoters = { value: state.tally?.voters ?? 0, at: res.updated ?? null, until: Date.now() + 35_000 };
  }

  const reasonOf = (e) => (e?.code && tr(`error.${e.code}`)) || (cfg.lang === 'en' ? e?.data?.message?.en : e?.data?.message?.zh) || tr('error.unknown');
  const leftOf = (task) => tr(`live.left${Math.max(0, PER_TASK - mineOf(task).length)}`);

  async function send(kind, task, id) {
    const voting = kind === 'vote';
    const was = mineOf(task);
    const kept = state.tally && structuredClone(state.tally);   // 退回时原样放回（投票在路上时不会有别的刷新改它）
    const b = before(task);
    state.mine[task] = voting ? [...was, id] : was.filter((m) => m !== id);
    bump(task, id, voting ? 1 : -1, b);
    if (voting) markSeen(task);
    pending++;
    emit({ kind, task, model: id });
    try {
      const body = { task, model: id };
      let res;
      try {
        if (voting && proof) { const p = await proof; proof = null; if (p) body.pow = p; }
        res = await call('vote', { method: voting ? 'POST' : 'DELETE', body });
      } catch (e) {
        if (!(voting && e.code === 'pow_required' && e.data?.pow)) throw e;
        const p = await solve(e.data.pow);     // 票箱刚打开校验：算完这道题再投一次
        if (!p) throw e;
        res = await call('vote', { method: 'POST', body: { ...body, pow: p } });
      }
      pending--;
      settle(task, res);
      emit({ kind: 'confirm', task, model: id });
      announce(tr(voting ? 'live.voted' : 'live.retracted', { name: nameOf(id), left: leftOf(task) }));
    } catch (e) {
      pending--;
      // 退回：服务端说了这一卷现在的票（两票已满、已经投过）就照它，否则回到投之前；计票放回原样，随后的刷新再校准
      state.mine[task] = Array.isArray(e.data?.votes) ? e.data.votes.filter((m) => cfg.votable[task]?.includes(m)) : was;
      state.tally = kept;
      if (e.code === 'closed' || e.code === 'network') state.status = 'closed';
      const reason = reasonOf(e);
      emit({ kind: voting ? 'undo-vote' : 'undo-retract', task, model: id, reason, code: e.code, wait: e.retryAfter });
      announce(tr(voting ? 'live.failedVote' : 'live.failedRetract', { name: nameOf(id), reason }));
    }
    load('refresh');
  }

  function vote(task, id) {
    const mine = mineOf(task);
    if (state.status !== 'open' || mine.includes(id) || mine.length >= PER_TASK) return;
    send('vote', task, id);
  }
  function retract(task, id) {
    if (state.status !== 'open' || !mineOf(task).includes(id)) return;
    send('retract', task, id);
  }

  /* ---------- 动效 ---------- */

  const motion = () => !reduce.matches;
  const fade = (el, from, to) => el.animate({ opacity: [from, to] }, { duration: 150, easing: 'linear' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  /** FLIP 换位：list 里的元素按 sorted 重排，各自从原来的位置用 land 滑到新位置；数字直接换 */
  function reorder(list, sorted) {
    if (sorted.every((el, i) => list.children[i] === el)) return;
    const top = new Map(sorted.map((el) => [el, el.getBoundingClientRect().top]));
    for (const el of sorted) list.append(el);
    if (!motion()) return;
    for (const el of sorted) {
      const dy = top.get(el) - el.getBoundingClientRect().top;
      if (dy) el.animate({ translate: [`0 ${dy}px`, '0 0'] }, { duration: 620, easing: LAND });
    }
  }
  /** 名次：票多的在前；票数相同名次相同、按登记顺序（data-i） */
  function ranked(items, valueOf) {
    const order = items.map((el) => ({ el, v: valueOf(el), i: +el.dataset.i })).sort((a, b) => b.v - a.v || a.i - b.i);
    let rank = 0;
    return order.map((o, k) => ({ ...o, rank: k && o.v === order[k - 1].v ? rank : (rank = k + 1) }));
  }

  /* ---------- 观测票 ---------- */

  // 一个孔位：dataset.model 是投在这里的那一位；leaving 为真时它正被补丁盖上（撤回的动效还没放完）
  function fillSlot(slot, id) {
    slot.dataset.model = id;
    slot.leaving = false;
    slot.classList.add('is-on');
    slot.token = Symbol('slot');
    for (const a of slot.getAnimations({ subtree: true })) a.cancel();
    slot.querySelector('.ae-bt-hole').hidden = false;
    slot.querySelector('[data-hole-sr]').textContent = tr('ballot.retract', { name: nameOf(id) });
    slot.querySelector('[data-hole-who]').textContent = shortOf(id);
  }
  function clearSlot(slot) {
    delete slot.dataset.model;
    slot.leaving = false;
    slot.classList.remove('is-on');
    slot.token = Symbol('slot');
    const hole = slot.querySelector('.ae-bt-hole');
    const ballotEl = slot.closest('[data-ballot]');
    if (hole === document.activeElement) {
      // 焦点在这个孔上（从票上撤回）：移到另一个孔，没有了就放回这张票上，读屏会念出票的新状态
      const other = $$('.ae-bt-hole', ballotEl).find((b) => b !== hole && !b.hidden);
      (other ?? ballotEl).focus({ preventScroll: true });
    }
    hole.hidden = true;
  }
  /** 打孔：孔一下子打穿，黄铜环用 land 描完一圈，打下的小圆纸片沿 exit 往下落、随即淡出，简称跟着盖上 */
  function punchIn(slot, chad) {
    const who = slot.querySelector('.ae-bt-who');
    const hole = slot.querySelector('.ae-bt-hole');
    if (!motion()) { fade(hole, 0, 1); fade(who, 0, 1); return; }
    slot.querySelector('.ring').animate({ strokeDashoffset: [1, 0] }, { duration: 560, easing: LAND });
    slot.querySelector('.lit').animate({ opacity: [0, 0, 1] }, { duration: 560, easing: 'linear' });
    if (chad) {
      slot.querySelector('.ae-bt-chad').animate(
        [{ opacity: 1, translate: '0 0', rotate: '0deg' }, { opacity: 1, offset: 0.55 }, { opacity: 0, translate: '9px 72px', rotate: '50deg' }],
        { duration: 680, easing: EXIT },
      );
    }
    who.animate([{ opacity: 0, scale: 1.18 }, { opacity: 1, scale: 1 }], { duration: 240, delay: 180, easing: LAND, fill: 'backwards' });
  }
  /** 撤回（或被拒的一票退回）：纸补丁用 land 贴上，停一下，孔位回到印着的虚圆，补丁淡出 */
  async function patchOut(slot) {
    const token = slot.token = Symbol('patch');
    slot.leaving = true;
    const patch = slot.querySelector('.ae-bt-patch');
    if (!motion()) {
      await fade(slot.querySelector('.ae-bt-hole'), 1, 0).finished.catch(() => {});
      if (slot.token === token) clearSlot(slot);
      return;
    }
    const land = patch.animate([{ opacity: 0, scale: 1.4, translate: '0 -6px' }, { opacity: 1, scale: 1, translate: '0 0' }], { duration: 340, easing: LAND, fill: 'forwards' });
    await land.finished.catch(() => {});
    if (slot.token !== token) return;
    clearSlot(slot);
    slot.token = token;
    await wait(520);
    if (slot.token !== token) return;
    const off = patch.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 460, easing: 'linear', fill: 'forwards' });
    await off.finished.catch(() => {});
    land.cancel();
    off.cancel();
  }

  function renderBallot(el, change) {
    const task = el.dataset.ballot;
    const mine = mineOf(task);
    const slots = $$('[data-slot]', el);
    const here = change?.task === task;
    // 不再是我的票的孔位：这一次撤回（或被拒）的那一个用补丁盖上，别的（另一个标签页里撤回的）直接回到虚圆
    for (const s of slots) {
      const id = s.dataset.model;
      if (!id || s.leaving || mine.includes(id)) continue;
      if (here && change.model === id && (change.kind === 'retract' || change.kind === 'undo-vote')) patchOut(s);
      else clearSlot(s);
    }
    // 还没有孔的票：先找正被补丁盖上的同一位（撤回被拒，孔回来），再找空孔位，最后才借一个正在盖补丁的
    for (const id of mine) {
      if (slots.some((s) => s.dataset.model === id && !s.leaving)) continue;
      const s = slots.find((x) => x.leaving && x.dataset.model === id) ?? slots.find((x) => !x.dataset.model) ?? slots.find((x) => x.leaving);
      if (!s) continue;
      fillSlot(s, id);
      if (here && change.model === id && (change.kind === 'vote' || change.kind === 'undo-retract')) punchIn(s, change.kind === 'vote');
    }
    const closed = state.status !== 'open';
    el.classList.toggle('is-closed', closed);
    for (const b of $$('.ae-bt-hole', el)) b.disabled = closed;
    const names = mine.map(nameOf).join(tr('ballot.and'));
    el.querySelector('[data-ballot-sr]').textContent = tr(closed ? 'ballot.srClosed' : `ballot.sr${Math.min(mine.length, PER_TASK)}`, { names });
  }

  /* ---------- 打孔钮、页签上的小孔 ---------- */

  function renderPunch(btn, change) {
    const [task, id] = btn.dataset.punch.split('/');
    const wrap = btn.closest('.ae-punch');
    const mine = mineOf(task);
    const on = mine.includes(id);
    const closed = state.status !== 'open';
    const spent = !on && mine.length >= PER_TASK;
    btn.setAttribute('aria-pressed', String(on));
    if (closed || spent) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
    if (spent && !closed) btn.setAttribute('aria-describedby', btn.dataset.hint); else btn.removeAttribute('aria-describedby');
    wrap.classList.toggle('is-on', on);
    wrap.classList.toggle('is-spent', spent && !closed);
    wrap.classList.toggle('is-closed', closed);
    btn.querySelector('[data-punch-text]').textContent = tr(closed ? 'punch.closed' : on ? 'punch.voted' : spent ? 'punch.spent' : 'punch.vote');
    const note = wrap.querySelector('[data-punch-note]');
    if (change?.task === task && change.model === id) {
      clearTimeout(note.timer);
      note.textContent = change.reason ?? '';
      // 限频时留到可以再投（Retry-After），别的原因留十几秒；下一次投成了就清掉
      if (change.reason) note.timer = setTimeout(() => { note.textContent = ''; }, Math.max(12, change.wait || 0) * 1000);
    }
    if (on && change?.kind === 'vote' && change.task === task && change.model === id && !motion()) fade(wrap.querySelector('.ae-punch-hole'), 0, 1);
  }

  function renderMark(el, change) {
    const [task, id] = el.dataset.voteMark.split('/');
    const on = mineOf(task).includes(id);
    const was = !el.hidden;
    el.hidden = !on;
    if (on && !was && change?.kind === 'vote') fade(el, 0, 1);
  }

  /* ---------- 本卷票选 ---------- */

  function unfold(el) {
    const fold = el.querySelector('[data-rank-fold]');
    const sheet = el.querySelector('[data-rank-sheet]');
    const rows = $$('.ae-rank-row', sheet);
    if (!motion()) { fold.hidden = true; sheet.hidden = false; fade(sheet, 0, 1); return; }
    fold.animate([{ opacity: 1, scale: '1 1' }, { opacity: 0, scale: '1 0.4' }], { duration: 180, easing: EXIT }).finished.then(() => {
      fold.hidden = true;
      sheet.hidden = false;
      sheet.animate([{ clipPath: 'inset(0 0 100% 0)', opacity: 0.6 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }], { duration: 560, easing: LAND });
      rows.forEach((r, k) => r.animate([{ opacity: 0, translate: '0 -10px' }, { opacity: 1, translate: '0 0' }], { duration: 520, delay: 200 + k * 90, easing: LAND, fill: 'backwards' }));
    }, () => {});
  }

  function renderRank(el, change) {
    const task = el.dataset.rank;
    const fold = el.querySelector('[data-rank-fold]');
    const sheet = el.querySelector('[data-rank-sheet]');
    const closed = state.status !== 'open';
    const open = revealed(task) && state.tally;
    const first = open && sheet.hidden && change?.kind === 'vote' && change.task === task;
    if (!open) {
      fold.hidden = false;
      sheet.hidden = true;
      const n = state.tally?.taskVoters[task] ?? 0;
      fold.querySelector('[data-rank-voters]').textContent = closed ? tr('rank.closed') : n ? tr('rank.voters', { n }) : tr('rank.votersNone');
      return;
    }
    // 填数：名次、票数、占比、按本卷最高票的比例的那一段；第一名那一段用这一卷的点亮色
    const list = sheet.querySelector('.ae-rank-rows');
    const items = $$('.ae-rank-row', list);
    const counts = new Map(items.map((r) => [r, countOf(task, r.dataset.model)]));
    const total = sum([...counts.values()]);
    const max = Math.max(0, ...counts.values());
    const order = ranked(items, (r) => counts.get(r));
    for (const { el: r, v: n, rank } of order) {
      const pct = pctOf(n, total);
      r.classList.toggle('is-top', rank === 1 && n > 0);
      r.querySelector('[data-rank-no]').textContent = rank;
      r.querySelector('[data-rank-n]').textContent = n;
      r.querySelector('[data-rank-pct]').textContent = pct;
      r.querySelector('[data-rank-bar]').style.setProperty('--w', max ? (n / max).toFixed(3) : '0');
      r.querySelector('[data-rank-sr]').textContent = tr('rank.row', { rank, name: nameOf(r.dataset.model), n, pct });
    }
    const note = sheet.querySelector('[data-rank-note]');
    note.hidden = !(closed && state.source === 'snapshot');
    note.textContent = note.hidden ? '' : tr('rank.snapshot');
    if (first) {
      for (const { el: r } of order) list.append(r);
      unfold(el);
    } else {
      fold.hidden = true;
      const showing = !sheet.hidden;
      sheet.hidden = false;
      if (showing) reorder(list, order.map((o) => o.el)); else for (const { el: r } of order) list.append(r);
    }
  }

  /* ---------- 票选页：页首、总得票、星表 ---------- */

  const allTasks = Object.keys(cfg.votable);
  const totalOf = (id) => sum(allTasks.map((t) => countOf(t, id)));
  const grand = () => sum(allTasks.map((t) => sum(Object.values(state.tally?.tasks[t] ?? {}))));

  function renderFacts(el) {
    const total = grand();
    const parts = state.tally && total ? [tr('facts.votes', { n: total }), tr('facts.voters', { n: state.tally.voters }), asOf()] : [];
    el.hidden = !parts.length;
    el.innerHTML = '';
    parts.forEach((text, k) => {
      if (k) el.append(Object.assign(document.createElement('i'), { textContent: '·', ariaHidden: 'true' }));
      el.append(Object.assign(document.createElement('span'), { textContent: text }));
    });
  }
  function renderState(el) {
    const total = state.tally ? grand() : 0;
    const closed = state.status !== 'open';
    el.textContent = closed
      ? tr(state.source === 'snapshot' && total ? 'state.snapshot' : 'state.closed')
      : total ? '' : tr('state.none');
  }

  function renderTotals(list) {
    const items = $$('.ae-tot', list);
    const order = ranked(items, (r) => totalOf(r.dataset.model));
    const max = Math.max(1, ...order.map((o) => o.v));
    list.hidden = !state.tally || order.every((o) => !o.v);
    for (const { el: r, v, rank } of order) {
      r.querySelector('[data-tot-no]').textContent = rank;
      r.querySelector('[data-tot-n]').textContent = v;
      r.querySelector('[data-tot-bar]').style.setProperty('--w', (v / max).toFixed(3));
      const segs = $$('[data-seg]', r);
      for (const seg of segs) {
        const n = countOf(seg.dataset.seg, r.dataset.model);
        seg.hidden = !n;
        seg.style.setProperty('--g', n);
        seg.querySelector('[data-seg-n]').textContent = tr('totals.votes', { n });
        seg.setAttribute('aria-label', tr('totals.segment', { no: seg.dataset.no, name: seg.dataset.name, n }));
      }
      const shown = segs.filter((s) => !s.hidden);
      for (const seg of segs) seg.classList.toggle('is-end', shown.indexOf(seg) >= shown.length - 2 && !seg.hidden);   // 末尾两段的纸签往左展开
    }
    if (list.hidden) for (const { el: r } of order) list.append(r); else reorder(list, order.map((o) => o.el));
    return order.map((o) => o.el.dataset.model);
  }

  function renderMatrix(root, sequence) {
    const total = state.tally ? grand() : 0;
    const body = root.querySelector('[data-matrix-rows]');
    const foot = root.querySelector('[data-matrix-foot]');
    body.hidden = foot.hidden = !total;
    for (const task of allTasks) {
      const counts = Object.values(state.tally?.tasks[task] ?? {});
      const s = sum(counts), lead = Math.max(0, ...counts);
      for (const cell of $$(`[data-cell^="${task}/"]`, root)) {
        const n = countOf(task, cell.dataset.cell.slice(task.length + 1));
        cell.querySelector('[data-n]').textContent = n;
        cell.classList.toggle('is-lead', n > 0 && n === lead);
        cell.classList.toggle('is-zero', !n);
        cell.querySelector('[data-dot]')?.style.setProperty('--s', s ? (n / s).toFixed(3) : '0');
      }
      const col = root.querySelector(`[data-col-total="${task}"]`);
      if (col) col.textContent = s;
    }
    for (const row of $$('tr[data-model]', body)) row.querySelector('[data-row-total]').textContent = totalOf(row.dataset.model);
    root.querySelector('[data-grand-total]').textContent = total;
    const rows = $$('tr[data-model]', body);
    for (const id of sequence) { const r = rows.find((x) => x.dataset.model === id); if (r) body.append(r); }
  }

  function renderCards(list, sequence) {
    const total = state.tally ? grand() : 0;
    list.hidden = !total;
    const cards = $$('.ae-mcard', list);
    const ranks = new Map(ranked(cards, (c) => totalOf(c.dataset.model)).map((o) => [o.el, o.rank]));
    for (const c of cards) {
      const t = totalOf(c.dataset.model);
      c.querySelector('[data-card-no]').textContent = ranks.get(c);
      c.querySelector('[data-card-n]').textContent = tr('totals.votes', { n: t });
      for (const li of $$('[data-cell]', c)) {
        const [task, id] = li.dataset.cell.split('/');
        const counts = Object.values(state.tally?.tasks[task] ?? {});
        const s = sum(counts), n = countOf(task, id);
        li.querySelector('[data-n]').textContent = n;
        li.querySelector('[data-bar]').style.setProperty('--w', s ? (n / s).toFixed(3) : '0');
        li.classList.toggle('is-lead', n > 0 && n === Math.max(...counts));
      }
    }
    for (const id of sequence) { const c = cards.find((x) => x.dataset.model === id); if (c) list.append(c); }
  }

  /* ---------- 一句票数、截至几点几分 ---------- */

  const asOf = () => (state.source === 'live' ? tr('facts.asOf', { time: timeOf(state.tally?.updated) })
    : state.source === 'snapshot' ? tr('facts.asOfPublishAt', { time: timeOf(state.tally?.updated) }) : '');

  function renderCounts() {
    const have = Boolean(state.tally);
    for (const el of $$('[data-vote-count]')) {
      const [task, id] = el.dataset.voteCount.split('/');
      el.hidden = !have;
      if (have) el.textContent = tr(el.dataset.tpl, { n: countOf(task, id) });
    }
    for (const el of $$('[data-vote-total]')) {
      el.hidden = !have;
      if (have) el.lastChild.textContent = tr(el.dataset.tpl, { n: totalOf(el.dataset.voteTotal) });
    }
    for (const el of $$('[data-vote-voters]')) {
      const n = state.tally?.voters ?? 0;
      el.hidden = !(n > 0);
      if (n > 0) el.lastChild.textContent = tr(el.dataset.tpl, { n });
    }
    for (const el of $$('[data-vote-asof]')) el.textContent = asOf();
  }

  /* ---------- 读屏播报 ---------- */

  const live = document.querySelector('[data-vote-live]');
  function announce(text) {
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 60);
  }

  /* ---------- 接线 ---------- */

  document.addEventListener('ae:votes', (e) => {
    const { change } = e.detail;
    if (state.status !== 'loading') for (const el of $$('[data-vote-ui][hidden]')) el.hidden = false;
    for (const el of $$('[data-ballot]')) renderBallot(el, change);
    for (const el of $$('[data-punch]')) renderPunch(el, change);
    for (const el of $$('[data-vote-mark]')) renderMark(el, change);
    for (const el of $$('[data-rank]')) renderRank(el, change);
    const totals = document.querySelector('[data-vote-totals]');
    const sequence = totals ? renderTotals(totals) : [];
    for (const el of $$('[data-vote-matrix]')) renderMatrix(el, sequence);
    for (const el of $$('[data-vote-cards]')) renderCards(el, sequence);
    for (const el of $$('[data-vote-facts]')) renderFacts(el);
    for (const el of $$('[data-vote-state]')) renderState(el);
    renderCounts();
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-punch]');
    if (btn) {
      if (btn.getAttribute('aria-disabled') === 'true') return;
      const [task, id] = btn.dataset.punch.split('/');
      if (mineOf(task).includes(id)) retract(task, id); else vote(task, id);
      return;
    }
    const hole = e.target.closest('.ae-bt-hole');
    if (hole && !hole.disabled) {
      const task = hole.closest('[data-ballot]').dataset.ballot;
      const id = hole.closest('[data-slot]').dataset.model;
      if (id) retract(task, id);
    }
  });

  // 进页面取一次；页面停在前台时每分钟取一次，后台不取，回到前台时过了一分钟就补一次
  const EVERY = 60_000;
  let timer = 0;
  const tick = async () => {
    clearTimeout(timer);
    if (document.visibilityState === 'visible') await load('refresh');
    timer = setTimeout(tick, EVERY);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - fetchedAt >= EVERY) tick();
  });
  load('load').then(() => { timer = setTimeout(tick, EVERY); });
}
