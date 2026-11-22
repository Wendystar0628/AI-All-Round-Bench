// Topic cards from data/topics.json (card format: website/hub/README.md). The hub knows no topic:
// every card is drawn from its own fields, and its feature block by `feature.kind` (FEATURES below).
// Static text and settings come from the page (<script id="hub-data">, written from site.config.mjs).
const html = document.documentElement;
const root = html.dataset.root || './';
const { lang, text: T, colorLogos } = JSON.parse(document.getElementById('hub-data').textContent);
const en = lang === 'en';
const colour = new Set(colorLogos);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const dots = (d) => (d ? String(d).slice(0, 10).replace(/-/g, '.') : '');
const num = (v) => (v != null && v !== '' && Number.isFinite(+v) ? +v : null);
const one = (v) => (num(v) == null ? '—' : num(v).toFixed(1));
const shown = (v) => (v == null || v === '' ? '—' : String(v));
const safeUrl = (u) => (/^(\/|\.{0,2}\/|https?:)/.test(String(u ?? '')) ? String(u) : '#');
const safeColour = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c ?? '')) ? String(c) : '');
/** A {zh, en} label in the page's language (a plain string is taken as is). */
const say = (l) => (l && typeof l === 'object' ? (en ? l.en ?? l.zh : l.zh ?? l.en) : l) ?? '';

// the language switch remembers the choice (the topic sites read the same key)
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('[data-lang-switch]');
  if (!a) return;
  try {
    localStorage.setItem('octa.lang', a.dataset.langSwitch);
  } catch {}
});

function logo(m) {
  const name = String(m?.logo || '').replace(/[^\w-]/g, '');
  if (!name) return '<span class="logo" aria-hidden="true"></span>';
  const c = colour.has(name);
  return `<span class="logo${c ? ' is-color' : ''}" style="--icon:url(&quot;${root}logos/${name}${c ? '-color' : ''}.svg&quot;)" aria-hidden="true"></span>`;
}

/** kind "ranking": ordered rows { model, value, max } — rank, vendor mark, "name (effort)", value and a bar of value / max. */
function ranking(f) {
  const items = Array.isArray(f.items) ? f.items : [];
  if (!items.length) return `<p class="feature-none">${esc(T.featureEmpty)}</p>`;
  const row = (it, i) => {
    const m = it.model ?? {};
    const label = `${m.name ?? ''}${m.effort ? ` (${m.effort})` : ''}`;
    const value = num(it.value);
    const max = num(it.max);
    const share = value != null && max ? Math.max(0, Math.min(1, value / max)) : 0;
    const sr = [fill(T.rank, { n: i + 1 }), label, max ? fill(T.of, { value: one(value), max: shown(it.max) }) : one(value)].join(en ? ', ' : '，');
    return `<li class="rank-row" style="--v:${share}">
    <span class="rank-n" aria-hidden="true">${i + 1}</span>
    ${logo(m)}
    <span class="mname" title="${esc(label)}" aria-hidden="true"><span class="mname-text">${esc(m.name)}</span>${m.effort ? `<span class="mname-effort">(${esc(m.effort)})</span>` : ''}</span>
    <span class="rank-value" aria-hidden="true">${one(value)}</span>
    ${max ? '<span class="rank-bar" aria-hidden="true"><i></i></span>' : ''}
    <span class="sr-only">${esc(sr)}</span>
  </li>`;
  };
  return `<ol class="rank-list">${items.map(row).join('')}</ol>`;
}

// One drawing per feature kind. A new kind (e.g. a gallery for a showcase topic) is one more entry here.
const FEATURES = { ranking };

function feature(f) {
  const draw = f && FEATURES[f.kind];
  if (!draw) return '';
  const title = say(f.title);
  return `<div class="topic-feature" data-kind="${esc(f.kind)}">
      ${title ? `<h4 class="feature-head">${esc(title)}</h4>` : ''}
      ${draw(f)}
    </div>`;
}

function card(t) {
  const draft = t.status !== 'online';
  const name = en ? t.name_en || t.name : t.name;
  const other = en ? t.name : t.name_en;
  const href = en ? `${String(t.url ?? '').replace(/\/?$/, '/')}en/` : t.url;
  const accent = safeColour(t.accent);
  const stats = Array.isArray(t.stats) ? t.stats : [];
  const block = feature(t.feature);
  const stat = (s) => `<div><dt>${esc(say(s.label))}</dt><dd>${esc(shown(s.value))}</dd></div>`;
  return `<li class="topic${draft ? ' is-draft' : ''}${block ? ' has-feature' : ''}"${accent ? ` style="--topic:${accent}"` : ''}>
    <div class="topic-id">
      <h3 class="topic-name"><a class="topic-link" href="${esc(safeUrl(href))}">${esc(name)}</a></h3>
      ${other ? `<p class="topic-other" lang="${en ? 'zh-CN' : 'en'}">${esc(other)}</p>` : ''}
      ${draft ? `<p class="topic-draft"><b>${esc(T.draft)}</b>${esc(T.draftNote)}</p>` : ''}
      ${stats.length ? `<dl class="topic-stats">${stats.map(stat).join('')}</dl>` : ''}
    </div>
    ${block}
    <p class="topic-foot"><span>${t.updated ? esc(fill(T.updated, { date: dots(t.updated) })) : ''}</span><span class="topic-go" aria-hidden="true">${esc(T.open)}</span></p>
  </li>`;
}

const slot = document.querySelector('[data-slot="topics"]');
const note = (s) => `<li class="topics-note">${esc(s)}</li>`;

async function main() {
  try {
    const r = await fetch(`${root}data/topics.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const topics = Array.isArray(data.topics) ? data.topics : [];
    slot.innerHTML = topics.length ? topics.map(card).join('') : note(T.empty);
    const up = document.querySelector('[data-slot="updated"]');
    if (up && data.updated) up.textContent = fill(T.dataUpdated, { date: dots(data.updated) });
  } catch (e) {
    console.error(e);
    slot.innerHTML = note(T.failed);
  }
  slot.removeAttribute('aria-busy');
  // the bars grow once, after the first frame
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add('is-ready')));
}

main();
