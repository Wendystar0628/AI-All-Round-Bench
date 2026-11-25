(() => {
  'use strict';
  const works=window.CATALOG;
  const {artwork,glyph,exploded,motifDiagram,layerNames,icon,reducedProof}=window.LabView;
  const cinema=document.getElementById('cinema');
  const stage=document.getElementById('film-stage');
  const controls=document.getElementById('film-controls');
  const slider=document.getElementById('film-scrub');
  const toggle=document.getElementById('film-toggle');
  const page=document.getElementById('website');
  const cut=[0,5.8,11.1,15.6,20.0,24.5,30];
  const length=90;
  let mode='closed', shotKey='', fps=60, position=0, playing=false;
  let origin=0, ticker=0, hideTimer=0, returned=null, ready=null;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const ease=n=>1-(1-clamp(n))**3;
  const timecode=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;

  function resize() {
    if (cinema.hidden) return;
    const scale=Math.min(cinema.clientWidth/1600,cinema.clientHeight/900);
    stage.style.setProperty('--film-scale',scale);
  }
  function preload() {
    if (!ready) {
      const assets=works.flatMap(w=>['assets/scenes/'+w.id+'-wide.webp','logos/'+w.main+'/mono.png','assets/proofs/'+w.id+'-64.png']);
      ready=Promise.all(assets.map(src=>{
        const image=new Image();image.src=src;
        return image.decode().then(()=>image);
      })).catch(err=>{ready=null;throw err});
    }
    return ready;
  }
  function mast(work,code) {
    return `<div class="film-mast"><span><i style="background:${work.accent}"></i> FORM LAB &nbsp;/&nbsp; VISUAL IDENTITY STUDIES</span><span>PLATE ${work.no} &nbsp;·&nbsp; ${code}</span></div>`;
  }
  function folio(work) {
    return `<div class="film-folio"><span>${work.name} &nbsp; / &nbsp; ${work.en.toUpperCase()}</span><span>LOGOTYPE COLLECTION &nbsp; / &nbsp; VOL. 01</span></div>`;
  }
  function beauty(work,hold) {
    return `<div class="film-beauty"><img class="film-scene" src="assets/scenes/${work.id}-wide.webp" alt="">
      <div class="film-shade"></div>${mast(work,hold?'FINAL IMPRESSION':'ASSEMBLY')}
      <div class="film-art">${artwork(work,null,work.name+'成品')}</div>
      <div class="beauty-caption"><div class="film-cue">${work.category}</div><h2>${work.title}</h2></div>
      <div class="beauty-location"><b>${work.location}</b><span>${work.site} &nbsp;/&nbsp; ${work.code}–${work.no}</span></div></div>`;
  }
  function dialectShot(w) {
    return `<div class="film-paper">${mast(w,'GLYPH STUDY')}<div class="film-layout">
      <div class="film-copy"><div class="film-cue">CONCEPT &nbsp;/&nbsp; 笔画方言</div><h2>${w.title}</h2>
        <p>${w.concept}</p><div class="film-traits">${w.keywords.join(' &nbsp; / &nbsp; ')}</div>
        <div class="film-palette">${w.colors.map(([,c])=>`<i style="background:${c}"></i>`).join('')}</div></div>
      <div class="film-compare draft-grid"><figure>${glyph(w,'before')}<figcaption>参考骨架 · ${w.base}</figcaption></figure><span>→</span>
        <figure>${glyph(w,'after')}<figcaption>逐笔重绘 · ${w.title}</figcaption></figure></div>
      </div>${folio(w)}</div>`;
  }
  function motifShot(w) {
    const crop={endfield:'658 0 405 153',starrail:'203 9 457 348',waves:'710 -8 230 289'}[w.id];
    const obj=artwork(w,[2]).replace('0 0 1120 480',crop);
    return `<div class="film-paper">${mast(w,'MOTIF')}<div class="film-layout film-motif">
      <div class="film-copy"><div class="film-cue">SIGNATURE STROKE &nbsp;/&nbsp; 母题落点</div><h2>${w.motifName.split(' / ')[1]}</h2><p>${w.motifShort}</p>
      <div class="film-object">${obj}<span>主体元素 &nbsp;/&nbsp; ${w.element}</span></div></div>
      <div class="film-diagram draft-grid">${motifDiagram(w)}<div><b>A</b> ${w.motifName}<i></i><b>B</b> ${w.echoName}</div></div>
      </div>${folio(w)}</div>`;
  }
  function layerShot(w) {
    return `<div class="film-paper film-dark">${mast(w,'SEPARATIONS')}<div class="film-layout">
      <div class="film-copy"><div class="film-cue">SIX REGISTERED FILMS</div><h2>分层展开</h2><ol class="film-layer-list">${layerNames.map((s,i)=>`<li><small>0${i+1}</small>${s}</li>`).join('')}</ol></div>
      <div class="film-exploded">${exploded(w)}</div></div>${folio(w)}</div>`;
  }
  function proofShot(w) {
    return `<div class="film-paper">${mast(w,'PROOF SHEET')}<div class="film-proof-title"><div class="film-cue">PROOF SHEET</div><h2>明度与尺度</h2></div>
      <div class="film-proofs"><figure class="film-monoprint draft-grid"><img src="logos/${w.main}/mono.png" alt="黑白稿"><figcaption>黑白稿 &nbsp; / &nbsp; MONOCHROME</figcaption></figure>
      <div class="film-checks">${[['gray','去色'],['reduced','64 px'],['white','白底'],['black','黑底']].map(([c,l])=>`<figure class="film-check ${c}">${c==='reduced'?reducedProof(w):artwork(w)}<figcaption>${l}</figcaption></figure>`).join('')}</div></div>${folio(w)}</div>`;
  }

  function render(t) {
    position=Math.max(0,Math.min(length,t));
    const pinned=Math.min(position,length-1e-7);
    const id=Math.floor(pinned/30), local=pinned-30*id;
    const n=cut.findIndex((v,i)=>i<cut.length-1 && local>=v && local<cut[i+1]);
    const work=works[id], elapsed=local-cut[n], key=id+'/'+n;
    if(key!==shotKey){
      stage.style.setProperty('--accent',work.accent);
      stage.innerHTML=n===0||n===5?beauty(work,n===5):[null,dialectShot,motifShot,layerShot,proofShot][n](work);
      shotKey=key;
    }
    if(n===0||n===5){
      const stages=stage.querySelectorAll('.art-layer');
      stages.forEach((g,j)=>{
        const alpha=n===5?1:ease((elapsed-.15-j*.36)/1.2);
        g.style.opacity=alpha;
        g.setAttribute('transform',`translate(${(1-alpha)*(j===2?34:0)} ${(1-alpha)*(j===2?-25:21)})`);
      });
      const drift=n===0?ease(elapsed/5.8):ease(elapsed/3.2);
      stage.querySelector('.film-scene').style.transform=`scale(${1.052-.037*drift}) translateX(${(1-drift)*-.5}%)`;
      const cap=stage.querySelector('.beauty-caption');
      cap.style.opacity=n===0?.6+.4*ease(elapsed):ease(elapsed/.55);
      cap.style.transform=`translateY(${(1-ease(elapsed/.8))*10}px)`;
    }else{
      const body=stage.querySelector('.film-layout,.film-proofs');
      const start=ease(elapsed/.62);
      body.style.opacity=.62+.38*start;
      body.style.transform=`translateY(${(1-start)*13}px)`;
      if(n===3){
        const spread=ease(elapsed/1.9);
        stage.querySelectorAll('.separation-film').forEach((g,i)=>g.setAttribute('transform',`translate(0 ${(1-spread)*i*47})`));
        stage.querySelectorAll('.film-layer-list li').forEach((li,i)=>li.style.opacity=.35+.65*ease((elapsed-i*.23)/.4));
      }
    }
    if(mode==='preview') {
      slider.value=position;
      document.getElementById('film-time').textContent=timecode(position);
    }
  }
  function controlIcon(){
    toggle.innerHTML=icon(playing?'pause':'play',18);
    toggle.setAttribute('aria-label',playing?'暂停播放':position>=length?'重新播放':'继续播放');
  }
  function showControls() {
    if(mode!=='preview')return;
    controls.classList.remove('quiet');cinema.style.cursor='';
    clearTimeout(hideTimer);
    if (playing) hideTimer=setTimeout(()=>{
      if (controls.matches(':hover') || controls.contains(document.activeElement)) return;
      controls.classList.add('quiet');cinema.style.cursor='none';
    },1850);
  }
  function stopClock() {
    playing=false; cancelAnimationFrame(ticker); clearTimeout(hideTimer);
  }
  function loop(now) {
    if(mode!=='preview'||!playing)return;
    render((now-origin)/1000);
    if(position>=length){stopClock();controlIcon();showControls();return}
    ticker=requestAnimationFrame(loop);
  }
  function play() {
    if(position>=length) render(0);
    playing=true;origin=performance.now()-position*1000;
    controlIcon();showControls();ticker=requestAnimationFrame(loop);
  }
  function pause() {
    if(playing)render((performance.now()-origin)/1000);
    stopClock();controlIcon();showControls();
  }
  function seek(t) {
    render(t);origin=performance.now()-position*1000;showControls();
  }
  function enter(nextMode) {
    stopClock();
    if(mode==='closed'){
      returned={x:window.scrollX,y:window.scrollY,focus:document.activeElement};
      const dialog=document.getElementById('about');if(dialog.open)dialog.close();
    }
    page.hidden=true;cinema.hidden=false;document.documentElement.classList.add('in-film');
    mode=nextMode;shotKey='';cinema.style.cursor='';
    controls.hidden=nextMode!=='preview';controls.classList.remove('quiet');
    resize();render(0);
  }
  function end(){
    if(mode==='closed')return;
    stopClock();mode='closed';shotKey='';stage.replaceChildren();
    controls.hidden=true;cinema.hidden=true;page.hidden=false;
    document.documentElement.classList.remove('in-film');
    if(returned){
      returned.focus?.focus({preventScroll:true});window.scrollTo(returned.x,returned.y);returned=null;
    }
  }
  const painted=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

  window.videoExport={
    runs:['show'],
    async begin(run,options={}){
      if(run!=='show') throw new RangeError('Unknown run');
      const rate=Number(options.fps??60);
      if(!Number.isFinite(rate)||rate<=0)throw new RangeError('fps must be positive');
      fps=rate;enter('export');
      await Promise.all([preload(),document.fonts.ready]);
      render(0);await painted();
      return {frames:Math.round(length*fps)};
    },
    async frame(i){
      if(mode!=='export')throw new Error('Call begin first');
      if(!Number.isInteger(i)||i<0||i>=Math.round(length*fps))throw new RangeError('Frame is outside the run');
      render(i/fps);await painted();
    },
    end
  };
  document.getElementById('play-film').addEventListener('click',async()=>{
    enter('preview');controlIcon();
    await Promise.all([preload(),document.fonts.ready]);
    if(mode==='preview'&&!playing)play();
  });
  toggle.addEventListener('click',()=>playing?pause():play());
  document.getElementById('film-exit').addEventListener('click',end);
  slider.addEventListener('input',()=>seek(Number(slider.value)));
  cinema.addEventListener('pointermove',showControls);
  controls.addEventListener('focusin',showControls);
  window.addEventListener('resize',resize);
  window.addEventListener('keydown',e=>{
    if(mode!=='preview')return;
    if(e.key==='Escape'){e.preventDefault();end()}
    else if(e.code==='Space' && !e.target.closest('button,input')){e.preventDefault();playing?pause():play()}
    else if(['ArrowLeft','ArrowRight'].includes(e.key) && e.target!==slider){
      e.preventDefault();seek(position+(e.key==='ArrowRight'?5:-5));
    }
  });
})();
