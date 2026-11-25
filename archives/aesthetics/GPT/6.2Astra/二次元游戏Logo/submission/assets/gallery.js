(() => {
  'use strict';
  const works = window.CATALOG;
  const editions = window.EDITIONS;
  const app = document.getElementById('app');
  const about = document.getElementById('about');
  const layerNames = ['异形底板', '背景英文', '主体元素', '中英文字面', '细线与刻度', '受光边与肌理'];
  const sections = [
    ['concept','概念单','CONCEPT'],['dialect','笔画方言','GLYPH STUDY'],
    ['motif','母题落点','MOTIF'],['mono','黑白稿','MONOCHROME'],
    ['layers','分层展开','SEPARATIONS'],['checks','检查格','PROOFS']
  ];
  let sequence = 0;
  let listView = false;
  let current = null;
  let stopTrackingSections = null;

  function icon(name, size=18) {
    const paths = {
      arrow:'<path d="M5 13 13 5M5 5h8v8"/>',
      right:'<path d="M3 9h12m-5-5 5 5-5 5"/>',
      back:'<path d="M15 9H3m5-5L3 9l5 5"/>',
      down:'<path d="M9 2v9m-4-4 4 4 4-4M3 12v3h12v-3"/>',
      replay:'<path d="M3.3 6.5A6.1 6.1 0 1 1 3.6 12M3 2.5v4.7h4.6"/>',
      grid:'<g fill="currentColor" stroke="none"><path d="M2.5 2.5h5.4v5.4H2.5zm7.6 0h5.4v5.4h-5.4zM2.5 10h5.4v5.4H2.5zm7.6 0h5.4v5.4h-5.4z"/></g>',
      list:'<path d="M6 4h10M6 9h10M6 14h10M2 4h1M2 9h1M2 14h1"/>',
      eye:'<path d="M1.5 9s3-4.6 7.5-4.6S16.5 9 16.5 9s-3 4.6-7.5 4.6S1.5 9 1.5 9Z"/><circle cx="9" cy="9" r="1.8"/>',
      play:'<path d="m5 2.7 10 6.3-10 6.3z" fill="currentColor" stroke="none"/>',
      pause:'<path d="M5 3v12M12 3v12" stroke-width="3"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">${paths[name]}</svg>`;
  }
  function registered(work) {
    const edition = editions[work.id];
    const prefix = 'p' + (++sequence) + '_';
    return {defs:edition.defs.replaceAll('ID_',prefix),layers:edition.layers.map(l=>l.replaceAll('ID_',prefix))};
  }
  function artwork(work, layers = null, label = '') {
    const data = registered(work);
    const ids = layers || [0,1,2,3,4,5];
    return `<svg class="artwork" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 480" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><defs>${data.defs}</defs>${ids.map(i=>`<g class="art-layer" data-l="${i}">${data.layers[i]}</g>`).join('')}</svg>`;
  }
  function register() {
    return '<svg class="register" viewBox="0 0 22 22" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="6.3"/><path d="M11 0v7m0 8v7M0 11h7m8 0h7"/><circle cx="11" cy="11" r="1.2" fill="currentColor" stroke="none"/></svg>';
  }
  function signature(work) {
    return `<span class="poster-id"><i></i>PLATE &nbsp;${work.no}</span>${register()}<div class="poster-colophon"><b>${work.location} &nbsp;/&nbsp; ${work.site}</b><span class="barcode" aria-hidden="true"></span></div>`;
  }
  function swatches(work) {
    return `<span class="swatches" aria-label="作品配色">${work.swatch.map(c=>`<i style="--c:${c}"></i>`).join('')}</span>`;
  }
  function card(work) {
    return `<a class="work-card" href="#work/${work.id}" style="--accent:${work.accent}" aria-label="查看《${work.name}》成品与设计拆解">
      <div class="poster poster-${work.id}">
        <img class="scene-bg" src="assets/scenes/${work.id}.webp" alt="">
        ${signature(work)}<div class="poster-logo">${artwork(work)}</div>
      </div>
      <div class="card-info"><div class="card-meta">
        <span class="card-context">${work.genre}<small>/ &nbsp;${work.category}</small></span>${swatches(work)}
      </div><div class="card-bottom"><div><h3>${work.name}</h3><p class="english-name">${work.en}</p></div><span class="open-arrow">${icon('arrow',19)}</span></div></div>
    </a>`;
  }
  function index() {
    current = null;
    document.title = '游戏字形档案 · 形研所 FORM LAB';
    app.innerHTML = `<section class="hero" aria-labelledby="archive-title">
      <div class="hero-copy"><div class="kicker"><span class="volume">VOL. 01</span><span>LOGOTYPE COLLECTION</span></div>
        <h1 id="archive-title">游戏字形档案</h1>
        <p>从世界观到笔画，三款游戏的中文标识再设计。</p>
      </div><figure class="hero-sketch"><img src="assets/specimen.svg" alt="末字钢板的三层轴测图"></figure>
    </section>
    <section aria-labelledby="index-title"><div class="index-bar"><div class="section-heading"><h2 id="index-title">作品索引</h2><span class="micro">/ &nbsp; WORK INDEX</span></div>
      <div class="view-tools"><span class="work-count">03 WORKS</span><div class="view-switch" aria-label="作品呈现方式">
        <button type="button" data-view="grid" aria-label="海报视图" title="海报视图" aria-pressed="${!listView}">${icon('grid',14)}</button>
        <button type="button" data-view="list" aria-label="列表视图" title="列表视图" aria-pressed="${listView}">${icon('list',15)}</button>
      </div></div></div><div class="work-grid ${listView?'list-view':''}">${works.map(card).join('')}</div></section>`;
  }

  function glyph(work, version, letter, annotated=false) {
    const c = editions[work.id].compare;
    const ch=letter || c.char;
    const sample=c.atlas[ch];
    const before = version === 'before';
    const ink = before ? '#777e70' : '#252d25';
    const colors=['#475e56','#b78a49','#89886b','#597a7c','#8a6471','#a0a98f','#6c7386'];
    let drawing=`<path fill="${ink}" d="${sample[version]}"/>`;
    if(ch===c.char) drawing+=`<path fill="${before?'#9da591':work.darkAccent}" d="${before?c.beforeAccent:c.accent}"/>`;
    if(!before && annotated){
      drawing=sample.pieces.map(([kind,d],i)=>`<path d="${d}" fill="${colors[i%colors.length]}"><title>${i+1} · ${kind}</title></path>`).join('');
      drawing+=sample.pieces.map(([,,x,y],i)=>`<circle cx="${x}" cy="${y}" r="3.35" fill="#f5f4ea" stroke="#454c40" stroke-width=".45"/><text x="${x}" y="${y+1.6}" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="4.8" fill="#292e24">${i+1}</text>`).join('');
    }
    return `<svg viewBox="-10 -10 120 120" role="img" aria-label="${ch}字${before?'参考骨架':'改造后笔画'}">
      <g fill="none" stroke="#818a77" stroke-width=".48"><rect x="0" y="0" width="100" height="100"/><path d="M0 0l100 100m0-100L0 100M50 0v100M0 50h100" stroke-dasharray="2.1 2.8"/></g>
      ${drawing}
      </svg>`;
  }
  function comparison(work,ch,annotated) {
    return `<figure class="glyph-figure">${glyph(work,'before',ch)}<figcaption>参考骨架 &nbsp; / &nbsp; <b>${work.baseName}</b></figcaption></figure>
      <span class="compare-arrow">→</span><figure class="glyph-figure">${glyph(work,'after',ch,annotated)}<figcaption>${annotated?'笔画构件编号':'逐笔重绘'} &nbsp; / &nbsp; <b>${work.title}</b></figcaption></figure>`;
  }
  function glyphControls(work) {
    const data=editions[work.id].compare;
    return `<div class="specimen-tools"><div class="glyph-picker" aria-label="选择比较的汉字">${Object.keys(data.atlas).map(ch=>`<button type="button" data-glyph="${ch}" aria-pressed="${ch===data.char}">${ch}</button>`).join('')}</div>
      <button type="button" class="annotation-button" data-annotations aria-pressed="false">构件标注</button></div>
      <div class="compare draft-grid" id="glyph-study">${comparison(work,data.char,false)}</div>`;
  }
  function motifDiagram(work) {
    const c=editions[work.id].compare;
    const anchor=(letter,outline)=>c.atlas[letter].pieces.find(p=>p[1]===outline).slice(2);
    const hit=anchor(c.char,c.accent);
    const echo=anchor(c.echoChar,c.echoAccent);
    const markers=[
      {x:29+hit[0]*1.79,y:43+hit[1]*1.79,ex:231,ey:30,tag:'A'},
      {x:325+echo[0]*1.24,y:84+echo[1]*1.24,ex:490,ey:70,tag:'B'}
    ];
    return `<svg viewBox="0 0 530 260" role="img" aria-label="${work.motifName}与${work.echoName}的落点对照">
      <g fill="none" stroke="#b6bead" stroke-width=".7" stroke-dasharray="3 4"><rect x="26" y="41" width="185" height="184"/><rect x="321" y="81" width="132" height="132"/><path d="M14 225h478M118 30v207m269-177v160"/></g>
      <g transform="translate(29 43) scale(1.79)"><path d="${c.after}" fill="#283028"/><path d="${c.accent}" fill="${work.darkAccent}"/></g>
      <g transform="translate(325 84) scale(1.24)"><path d="${c.echo}" fill="#616c60"/><path d="${c.echoAccent}" fill="${work.darkAccent}"/></g>
      ${markers.map(m=>`<path d="M${m.x} ${m.y}L${m.ex-24} ${m.ey}H${m.ex}" fill="none" stroke="#5a6454" stroke-width="1.2"/><circle cx="${m.x}" cy="${m.y}" r="3" stroke="#263022" fill="${work.accent}"/><rect x="${m.ex}" y="${m.ey-9}" width="18" height="18" fill="${work.accent}"/><text x="${m.ex+9}" y="${m.ey+4}" text-anchor="middle" fill="#20261c" font-family="monospace" font-size="12">${m.tag}</text>`).join('')}
      <g font-family="monospace" font-size="9.5" letter-spacing="1.3" fill="#66705f"><text x="25" y="244">SIGNATURE STROKE</text><text x="321" y="244">SECONDARY STROKE</text></g>
    </svg>`;
  }
  function exploded(work, spread = 1) {
    const d=registered(work);
    return `<svg viewBox="0 0 716 438" role="img" aria-label="${work.main}六层矢量分色展开图"><defs>${d.defs}</defs>
      <g fill="none" stroke="#a1ac98" stroke-width=".8" stroke-dasharray="3 5"><path d="M48 67v273m487-310v282m81-209v270M137 135v265"/></g>
      ${d.layers.map((l,i)=>{
        const f=319-i*47*spread;
        return `<g class="separation-film" data-n="${i}"><g transform="matrix(.455 -.032 .182 .148 43 ${f})">
          <rect width="1120" height="480" fill="#556053" fill-opacity=".27" stroke="#97a290" stroke-width="1.7"/>${l}
          </g><path d="M644 ${f+28}h19l8-7" fill="none" stroke="#adbaa7" stroke-width=".8"/>
          <text x="674" y="${f+23}" fill="#d8ddcd" font-size="11" font-family="monospace">0${i+1}</text></g>`;
      }).join('')}</svg>`;
  }
  function palette(work) {
    return `<div class="palette" aria-label="颜色与材质">${work.colors.map(([name,c],i)=>`<div><div class="color-chip" style="--c:${c}"></div><b>${['字面','底板','阴影','高光','点缀'][i]} · ${name}</b><small>${c}</small></div>`).join('')}</div>`;
  }
  function section(index,content) {
    const [id,title,en]=sections[index];
    return `<section class="dossier-section" id="study-${id}" data-study="${id}"><div class="dossier-heading"><span class="sec-no">0${index+1}</span><h2>${title}</h2><span class="micro">/ &nbsp; ${en}</span></div>${content}</section>`;
  }
  function reducedProof(work,pure=false) {
    return `<img class="raster-proof" src="assets/proofs/${work.id}${pure?'-chinese':''}-64.png" width="149" height="64" alt="${work.main}${pure?'中文字':'完整标识'}的 64 像素高缩样">`;
  }
  function checkGrid(work,pure=false) {
    return `<div class="check-grid ${pure?'only-chinese':''}">${[['gray','去色'],['reduced','缩小 · 64 px'],['white','白底'],['black','黑底']].map(([type,label])=>`<figure><div class="check-sample ${type}">${type==='reduced'?reducedProof(work,pure):artwork(work,pure?[3,5]:null)}</div><figcaption>${label}</figcaption></figure>`).join('')}</div>`;
  }
  function layerStudy(work) {
    return `<div class="layer-layout"><div class="layer-display" id="layer-display">${exploded(work)}</div>
      <div class="layer-controls"><span class="micro">单层检视 / FILMS</span>${layerNames.map((name,i)=>`<button type="button" class="layer-choice" data-layer="${i}" aria-pressed="false"><span>0${i+1}</span>${name}${icon('eye',13)}</button>`).join('')}</div></div>
      <div class="layer-toolbar"><div class="mode-switch"><button type="button" data-mode="spread" aria-pressed="true">分层展开</button><button type="button" data-mode="assembled" aria-pressed="false">完整叠合</button></div><span class="layer-status" role="status">全部 6 层</span></div>`;
  }
  function detail(work) {
    current = work;
    const i = works.indexOf(work);
    const next = works[(i+1)%works.length];
    const path = 'logos/'+work.main+'/';
    document.title = work.name + ' · 游戏字形档案';
    app.innerHTML = `<article style="--accent:${work.accent}"><div class="crumbs"><a href="#index">${icon('back',15)} 返回索引</a><span>PLATE ${work.no} &nbsp;/&nbsp; 03</span></div>
      <div class="folio-heading"><div><h1>${work.name}</h1><p class="english-name">${work.en}</p></div>
        <div class="folio-actions"><button type="button" class="button" data-replay>${icon('replay',15)}重播入场</button><a class="button ink" href="${path}final.png" download="${work.main}-成品.png">${icon('down',16)}下载成品</a></div></div>
      <div class="stage poster-${work.id}"><img class="scene-bg" src="assets/scenes/${work.id}-wide.webp" alt="">${signature(work)}<div class="stage-art">${artwork(work,null,work.name+'原创字标')}</div></div>
      <div class="dossier"><aside class="toc"><h2>设计拆解</h2><span class="micro">DESIGN DOSSIER</span><nav class="toc-list" aria-label="设计拆解章节">${sections.map(([id,title],k)=>`<a href="#work/${work.id}/${id}" data-jump="${id}"><span>0${k+1}</span>${title}</a>`).join('')}</nav></aside>
      <div class="studies">
      ${section(0,`<div class="concept-lede"><div><h3>${work.title}</h3><p>${work.concept}</p><div class="traits">${work.keywords.map(k=>`<span>${k}</span>`).join('')}</div></div>
        <dl class="specs"><dt>具体物件</dt><dd>${work.object}</dd><dt>动作</dt><dd>${work.action}</dd><dt>同源媒介</dt><dd>${work.medium}</dd><dt>主体元素</dt><dd>${work.element}</dd></dl></div>
        ${palette(work)}<div class="note-strip"><b>英文层</b>${work.enText}</div>`)}
      ${section(1,`${glyphControls(work)}
        <div class="compare-copy"><div><b>笔画规则</b><p class="body-copy">${work.dialect}</p></div><div><b>骨架与重心</b><p class="body-copy">${work.frame}</p></div></div>`)}
      ${section(2,`<div class="inspect"><div class="motif-board draft-grid">${motifDiagram(work)}</div><div><div class="caption-block"><h3><span class="ref-letter">A</span>${work.motifName}</h3><p>${work.motif}</p></div><div class="caption-block"><h3><span class="ref-letter">B</span>${work.echoName}</h3><p>${work.echo}</p></div></div></div><div class="note-strip"><b>${work.element}</b>${work.elementText}</div>`)}
      ${section(3,`<div class="mono-panel draft-grid"><img loading="lazy" width="1120" height="480" src="${path}mono.png" alt="${work.main}分层黑白定稿"></div><div class="mono-foot"><span class="mono-note">按读字、器物、底板分配明度。</span><a href="${path}mono.png" download="${work.main}-黑白稿.png" class="text-action">${icon('down',13)} 下载黑白稿</a></div>`)}
      ${section(4,layerStudy(work))}
      ${section(5,`<div class="mode-switch reading-switch"><button type="button" data-reading="all" aria-pressed="true">完整标识</button><button type="button" data-reading="chinese" aria-pressed="false">仅中文字</button></div><div id="reading-proofs">${checkGrid(work)}</div>`)}
      <div class="next-piece"><a class="text-action" href="#index">${icon('back',15)}作品索引</a><a href="#work/${next.id}"><small>下一件</small><strong>${next.name}</strong>${icon('right',20)}</a></div>
      </div></div></article>`;
    entrance();
    observeSections();
  }
  function entrance(manual = false) {
    if (!manual && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    app.querySelectorAll('.stage-art .art-layer').forEach((el,i)=>{
      el.getAnimations().forEach(a=>a.cancel());
      el.animate([{opacity:0,transform:`translate(${i===2?22:0}px,${i===2?-16:17}px)`},{opacity:1,transform:'translate(0,0)'}],
        {duration:670,delay:170*i,easing:'cubic-bezier(.18,.71,.26,1)',fill:'backwards'});
    });
  }
  function observeSections() {
    const links=[...app.querySelectorAll('.toc-list a')];
    const panels=links.map(a=>document.getElementById('study-'+a.dataset.jump));
    let pending=0,active=-1;
    function update() {
      pending=0;
      if(document.getElementById('website').hidden)return;
      const atEnd=scrollY+innerHeight>=document.documentElement.scrollHeight-2;
      const next=atEnd?panels.length-1:Math.max(0,panels.findLastIndex(p=>p.getBoundingClientRect().top<=innerHeight*.12));
      if(next===active)return;
      links[active]?.removeAttribute('aria-current');
      links[next].setAttribute('aria-current','location');
      active=next;
    }
    function schedule(){if(!pending)pending=requestAnimationFrame(update)}
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);
    stopTrackingSections=()=>{
      window.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
      cancelAnimationFrame(pending);
    };
    schedule();
  }
  function setLayer(mode, num) {
    const target=document.getElementById('layer-display');
    target.classList.toggle('light-mat',mode==='single' && num<2);
    target.innerHTML=mode==='spread'?exploded(current):artwork(current,mode==='single'?[num]:null,mode==='single'?layerNames[num]:'完整成品');
    const status=app.querySelector('.layer-status');
    status.textContent=mode==='single'?`第 ${num+1} 层 · ${layerNames[num]}`:(mode==='spread'?'全部 6 层':'六层叠合');
    app.querySelectorAll('[data-layer]').forEach(b=>b.setAttribute('aria-pressed',String(mode==='single' && +b.dataset.layer===num)));
    app.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  }
  function route() {
    if (about.open) about.close();
    const [,id,chapter]=location.hash.slice(1).split('/');
    const work=location.hash.startsWith('#work/') && works.find(w=>w.id===id);
    if (work && current===work && chapter && sections.some(s=>s[0]===chapter)) {
      document.getElementById('study-'+chapter).scrollIntoView({behavior:'instant'});return;
    }
    stopTrackingSections?.();
    stopTrackingSections=null;
    if (work) detail(work); else index();
    const jump=work && chapter && document.getElementById('study-'+chapter);
    if (jump) jump.scrollIntoView({behavior:'instant'}); else window.scrollTo(0,0);
  }
  const downloadPacks=new Map();
  async function downloadLocalPrint(link,work) {
    if(!downloadPacks.has(work.id)){
      const script=document.createElement('script');
      script.src='assets/downloads/'+work.id+'.js';
      downloadPacks.set(work.id,new Promise((resolve,reject)=>{
        script.onload=()=>resolve(window.LabPrints[work.id]);
        script.onerror=()=>reject(new Error('PNG files unavailable'));
      }));
      document.head.append(script);
    }
    try {
      const files=await downloadPacks.get(work.id);
      const filename=new URL(link.href).pathname.split('/').pop();
      const save=document.createElement('a');
      save.href='data:image/png;base64,'+files[filename];
      save.download=link.download;
      save.click();
    } catch {
      downloadPacks.delete(work.id);
      location.assign(link.href);
    }
  }
  app.addEventListener('click', e=>{
    const b=e.target.closest('button,a');
    if (!b) return;
    if (b.hasAttribute('download') && location.protocol==='file:') {
      e.preventDefault();
      downloadLocalPrint(b,current);
      return;
    }
    if (b.dataset.view) {
      listView=b.dataset.view==='list';
      app.querySelector('.work-grid').classList.toggle('list-view',listView);
      app.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));
    } else if (b.hasAttribute('data-replay')) entrance(true);
    else if (b.dataset.mode) setLayer(b.dataset.mode);
    else if (b.hasAttribute('data-layer')) setLayer('single',+b.dataset.layer);
    else if (b.dataset.glyph || b.hasAttribute('data-annotations')) {
      const annotations=app.querySelector('[data-annotations]');
      if(b.dataset.glyph) app.querySelectorAll('[data-glyph]').forEach(g=>g.setAttribute('aria-pressed',String(g===b)));
      else annotations.setAttribute('aria-pressed',String(annotations.getAttribute('aria-pressed')!=='true'));
      const ch=app.querySelector('[data-glyph][aria-pressed="true"]').dataset.glyph;
      document.getElementById('glyph-study').innerHTML=comparison(current,ch,annotations.getAttribute('aria-pressed')==='true');
    }
    else if (b.dataset.reading) {
      app.querySelectorAll('[data-reading]').forEach(g=>g.setAttribute('aria-pressed',String(g===b)));
      document.getElementById('reading-proofs').innerHTML=checkGrid(current,b.dataset.reading==='chinese');
    }
    else if (b.dataset.jump) {
      e.preventDefault();
      history.replaceState(null,'',b.getAttribute('href'));
      document.getElementById('study-'+b.dataset.jump).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }
  });
  document.getElementById('about-list').innerHTML=works.map(w=>`<a href="#work/${w.id}"><i style="--c:${w.accent}"></i><b>${w.name}</b><span>${w.title}</span>${icon('arrow',14)}</a>`).join('');
  document.getElementById('about-open').addEventListener('click',()=>about.showModal());
  about.addEventListener('click',e=>{
    if (e.target.closest('[data-close],.note-list a')) about.close();
    if (e.target===about) {
      const r=about.getBoundingClientRect();
      if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) about.close();
    }
  });
  window.addEventListener('hashchange',route);
  window.LabView={artwork,glyph,exploded,motifDiagram,icon,layerNames,reducedProof};
  route();
})();
