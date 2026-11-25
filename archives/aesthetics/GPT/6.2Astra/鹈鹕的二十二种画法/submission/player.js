const $=s=>document.getElementById(s),film=$('film'),icons={play:'<path d="M7 4l13 8-13 8Z" fill="currentColor" stroke="none"/>',pause:'<path d="M8 5v14m8-14v14" stroke-width="4"/>',next:'<path d="M5 5l11 7-11 7Z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',full:'<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',on:'<path d="M3 9h4l6-5v16l-6-5H3ZM16 8q5 4 0 8m3-11q8 7 0 14"/>',off:'<path d="M3 9h4l6-5v16l-6-5H3ZM17 9l5 6m0-6l-5 6"/>',wave:'<path d="M3 10v4m4-6v8m5-12v16m5-13v10m4-7v4"/>'};
function icon(k,size=19){return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icons[k]+'</svg>'}
let raf=0,time=0,playing=false,muted=false,cover=true,exporting=false,fps=60,origin=0,last=-1,saved,chapter=-99;
function introPlacement(t){
 const travel=Math.max(0,t-3)*turn*53,follow=travel*.76;
 return {x:424+travel-follow,y:288,k:1,follow};
}
function intro(t,pedalTime=t,separate=false){
 const camera=introPlacement(t);
 const progress=clamp((t-1.12)/1.62);
 let stroke=0;
 const shape=bike(-1,Math.max(0,pedalTime-3),true);
 const drawing=progress>=1?shape:shape.replace(/<(circle|path) /g,(match)=>{
   const part=clamp(progress*4.1-stroke++*.26);
   return match+'pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="'+(1-part)+'" fill-opacity="'+ease((part-.8)/.2)+'" opacity="'+(part>0?1:0)+'" ';
 });
 const instruction='画一只骑自行车的鹈鹕。';
 const back=R(0,0,1200,675,'#f3efdf')+R(32,32,1136,611,'none',st('#a8a993',1))+
 mt(56,72,'FRAME LAB   /   DRAWING INSTRUCTIONS',15,'#677269','letter-spacing="2"')+mt(1013,72,'PLATE 00',15,'#677269')+
 T(88,171,instruction.slice(0,Math.floor(t*9)),42,ink,'font-weight="bold"')+(t<1.3?R(92+Math.min(instruction.length,Math.floor(t*9))*42,137,3,38,ink):'')+
 (t>=3?T(86,600,'再画一遍，换个画法。',36,ink,'font-weight="bold"'):'')+R(0,0,1200,675,'url(#grain)','opacity=".08"');
 const road=L(42,529,1160,529,'#8c9388',2)+rep(13,j=>{
  const x=48+j*92-camera.follow%92;
  return L(x,531,x+9+(j%3)*2,531,'#b9b6a5',1.5);
 });
 const bird=G(drawing,tr(camera.x,camera.y));
 return separate?{back,road,bird,top:''}:back+road+bird;
}
function finishPlacement(t){
 const join=ease(t/3.3),sprint=clamp((t-6)/4),distance=1-(1-sprint)**2.5;
 const nose=860+distance*(968+258*.31+5-860);
 return {x:mixN(483,nose-209*.34,join),y:mixN(269,494,join),k:mixN(.71,.34,join)};
}
function ending(t,separate=false){
 const pullback=ease((t-1.5)/3.4),zoom=1.58-.58*pullback;
 const sprint=clamp((t-6)/4),distance=1-(1-sprint)**2.5;
 const photo=t>=10,rideTime=t<6?t:6+4*(sprint-sprint*sprint/2);
 const finishX=968+258*.31+5;
 const travel=turn*53*.31*rideTime,cameraX=travel-distance*134;
 let riders='',lanes='';
 for(let row=0;row<4;row++){
   const baseline=231+row*92+76;
   lanes+=P('M45 '+baseline+'H1148','none','stroke="#a9afa0" stroke-width="1" stroke-dasharray="4 8" stroke-dashoffset="'+(cameraX%12)+'"')+
    rep(8,j=>L(46+j*162-cameraX%162,baseline-1,53+j*162-cameraX%162,baseline-6,'#acb3a4',1));
 }
 for(let i=0;i<22;i++){
   const row=Math.floor(i/6),col=i%6,join=ease((t-(i%5)*.16)/2.95);
   const sx=[-1100,1180,-500,720][i%4],sy=[-480,480,640,-620][i%4];
   const x=89+col*145+row%2*20+distance*134+(1-join)*sx;
   const y=221+row*91+(1-join)*sy;
   const styleRider=finishRider(i,rideTime);
   riders+=G(i===21?signalRider(styleRider,rideTime):styleRider,tr(x,y,.31)+(i===11?' id="photo-blueprint"':'')+([12,15].includes(i)?' filter="url(#bleed)"':''));

 }
 // The closest printed rider is at x = 968 + 258 * .31.
 const leader=finishPlacement(t);
 const original=G(bike(-1,rideTime,true),tr(leader.x,leader.y,leader.k)+' id="photo-original"');
 const flagX=finishX+(turn*53*.31*8-134)-cameraX;
 let strip=G(R(0,0,24,414,'url(#finish)')+L(0,0,0,414,ink,1.3),tr(flagX,169));
 const lens='transform="translate(600 358) scale('+zoom+') translate(-600 -358)"';
 const joinTime=ease((t-1.02)/1.46),sheetMargin=mixN(32,26,joinTime),wheelY=leader.y+241*leader.k;
 const pencil=L(45,wheelY,1160,wheelY,'#8c9388',1.6)+rep(12,j=>{const x=57+j*99-cameraX%99;return L(x,wheelY+2,x+11,wheelY+2,'#abae9e',1.2)});
 const stage=G(opacity(lanes+strip,joinTime)+opacity(pencil,1-ease((t-2.8)/1.1))+riders,lens),bird=G(original,lens);
 const captions=mt(54,69,'FRAME LAB   /   FINISH CAMERA',14,'#6c7469','letter-spacing="2"')+
 T(53,134,t>3.5?'一只鹈鹕，二十二种画法。':'重回画布',44,ink,'font-weight="bold"')+
 mt(975,photo?42:69,photo?'EXPOSURE  001':'FINISH  /  22',15,'#617467');
 let s=R(0,0,1200,675,'#f3efdf')+R(sheetMargin,sheetMargin,1200-sheetMargin*2,675-sheetMargin*2,'none',st('#979e8e'))+opacity(captions,joinTime);
 const back=s;
 s='';
 if(photo){
   // Each lane uses the actual frozen rider, with one horizontal scale for both crops.
   const left=finishX-54,scale=4,tip=(finishX-left)*scale,otherTip=tip-5*scale;
   function lane(id,y,worldY){
    return '<svg x="1" y="'+y+'" width="253" height="48" viewBox="'+left+' '+worldY+' 63.25 12" overflow="hidden"><use href="#'+id+'"/></svg>';
   }
   s+=G(R(0,0,255,139,'#f3efdf',st('#55645c',1.6))+R(0,0,255,24,ink)+
   mt(11,17,'PHOTO FINISH   ×4',13,paper)+
   rep(13,j=>L(tip+(j-10)*20,25,tip+(j-10)*20,j%2?30:34,'#778278',1))+
   lane('photo-original',36,494-44*.34)+lane('photo-blueprint',87,312-65*.31)+
   L(0,85,255,85,'#a8b0a2',.8)+L(tip+1,25,tip+1,135,'#3f675c',1)+
   L(otherTip+1,86,otherTip+1,135,'#788ca1',1,'stroke-dasharray="3 2"'),tr(869,51))+
   mt(53,174,'00:02:27.000    /    原稿领先半格',15,'#59665c','letter-spacing="1"');
 }
 s+=opacity(rep(22,j=>G(C(0,0,12,'none',st(palettes[j][3],1.5))+mt(0,4,n2(j+1),10,palettes[j][3],'text-anchor="middle"'),tr(65+j*43,615)))+
 mt(1031,621,'22 / 22',15,'#687469'),joinTime)+R(0,0,1200,675,'url(#grain)','opacity=".045"');
 return separate?{back,road:stage,bird,top:s}:back+stage+bird+s;
}  function idx(t){return t<5?-1:t>=137?22:Math.floor((t-5)/6)}
function scene(i,l,pedalTime=l){
 if(i<0)return intro(l,pedalTime);
 if(i===22)return ending(l);
 return journeyScene(i,l,pedalTime);
}
function seal(i,l){let c=i<0?ink:palettes[i][1];return G(C(0,0,24,'none',st(c,2))+C(0,0,20,'none',st(c,1))+mt(0,4,n2(i+1),14,c,'text-anchor="middle" font-weight="bold"')+mt(0,15,'PASS',6,c,'text-anchor="middle"'),tr(1144,613,1+.2*Math.max(0,1-l*6),-12))}
function picture(t){
 const i=idx(t),local=i<0?t:i===22?t-137:t-5-i*6;
 if(i>=0&&local<changeLength[i])return repaint(i-1,local);
 return scene(i,local)+(i>=0&&i<22&&local<1.95?seal(i,local):'');
}
film.innerHTML=definitions+'<defs id="drawing-library"></defs><g id="artwork"></g>';const art=$('artwork');
const frameTemplate=document.createElementNS('http://www.w3.org/2000/svg','g');
function reconcileSvg(current,next){
 if(current.isEqualNode(next))return;
 if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName){
  current.replaceWith(next);return;
 }
 if(current.nodeType!==1){current.nodeValue=next.nodeValue;return}
 for(let j=current.attributes.length-1;j>=0;j--){
  const attr=current.attributes[j];
  if(!next.hasAttributeNS(attr.namespaceURI,attr.localName))current.removeAttributeNS(attr.namespaceURI,attr.localName);
 }
 for(let j=0;j<next.attributes.length;j++){
  const attr=next.attributes[j];
  if(current.getAttributeNS(attr.namespaceURI,attr.localName)!==attr.value){
   current.setAttributeNS(attr.namespaceURI,attr.name,attr.value);
  }
 }
 reconcileSvgChildren(current,next);
}
function reconcileSvgChildren(current,next){
 if(current.childNodes.length!==next.childNodes.length){
  current.replaceChildren(...Array.from(next.childNodes));return;
 }
 let original=current.firstChild,incoming=next.firstChild;
 while(original){
  const following=original.nextSibling,nextIncoming=incoming.nextSibling;
  reconcileSvg(original,incoming);original=following;incoming=nextIncoming;
 }
}
let drawnTime=null;
function show(t,posterMode=false){
 time=clamp(t,0,149);
 const key=posterMode?-1:Math.min(time,147);
 if(key!==drawnTime){
  const markup=posterMode?journeyScene(0,2.65):picture(time);
  if(playing&&!exporting&&drawnTime!==null&&key>drawnTime&&key-drawnTime<.18&&idx(key)===idx(drawnTime)){
   frameTemplate.innerHTML=markup;reconcileSvgChildren(art,frameTemplate);
  }else art.innerHTML=markup;
  drawnTime=key;
 }
if(exporting)return;let i=posterMode?0:idx(time);if(i!==chapter){chapter=i;$('next').disabled=i===22;$('sid').textContent=i<0?'00':i===22?'END':n2(i+1);$('sname').textContent=i<0?'片头 · 一条指令':i===22?'片尾 · 冲线':CN[i];document.querySelectorAll('.card').forEach((c,j)=>c.classList.toggle('active',i===j))}$('now').textContent=n2(Math.floor(time/60))+':'+n2(Math.floor(time%60));$('seek').setAttribute('aria-valuetext',$('now').textContent+' / 02:29 · '+$('sname').textContent);$('seek').value=time;$('seek').style.setProperty('--p',time/149*100+'%')}
function transport(){ if(!playing)document.getElementById("controls").classList.remove('idle'); $('play').innerHTML=icon(playing?'pause':'play');$('play').setAttribute('aria-label',playing?'暂停':'播放');$('vol').innerHTML=icon(muted?'off':'on');$('soundTop').innerHTML=icon(muted?'off':'wave',16)+(muted?'声音关闭':'声音开启');$('vol').setAttribute('aria-pressed',!muted)}
function seek(t){if(exporting)return;cover=false;show(t);if(playing){origin=performance.now()/1000-time;audioStart(time)}}
function playhead(ms=performance.now()){
 if(audioWaiting!==null)return audioWaiting;
 const seconds=!muted&&ac&&ac.state==='running'?ac.currentTime-audioOrigin:ms/1000-origin;
 return clamp(seconds,0,149);
}
function toggle(){
 if(exporting)return;
 if(playing){
  const stoppedAt=playhead();playing=false;cancelAnimationFrame(raf);hush();show(stoppedAt);
 }else{
  if(time>=149)time=0;
  cover=false;show(time);playing=true;origin=performance.now()/1000-time;
  audioStart(time);last=-1;raf=requestAnimationFrame(loop);
 }
 transport();
}
function loop(ms){
 if(!playing||exporting)return;
 const v=playhead(ms);
 if(v>=149){playing=false;hush();show(149);transport();return}
 audioPump(v);
 const interval=1000/30;
 if(last<0||ms-last>=interval){
  show(v);last=last<0?ms:ms-(ms-last)%interval;
 }
 raf=requestAnimationFrame(loop);
}
function mute(){
 const at=playing?playhead():time;
 muted=!muted;
 if(playing)origin=performance.now()/1000-at;
 if(muted)hush();else if(playing)audioStart(at);
 transport();
}
function syncFullscreen(){
 const expanded=document.fullscreenElement===$('player');
 const label=expanded?'退出全屏':'全屏';
 $('full').setAttribute('aria-pressed',expanded);
 $('full').setAttribute('aria-label',label);$('full').title=label;
 $('full').innerHTML=expanded?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 9h7V2m6 0v7h7m0 6h-7v7m-6 0v-7H2"/></svg>':icon('full');
}
document.addEventListener('fullscreenchange',syncFullscreen);
$('next').innerHTML=icon('next');syncFullscreen();$('next').onclick=()=>seek(cover?5:Math.min(137,5+6*(idx(time)+1)));$('play').onclick=$('screen').onclick=toggle;$('vol').onclick=$('soundTop').onclick=mute;$('seek').oninput=e=>seek(+e.target.value);$('full').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('player').requestFullscreen();$('navnotes').onclick=()=>$('notes').showModal();$('closeNotes').onclick=()=>$('notes').close();$('notes').onclick=e=>{if(e.target===$('notes'))$('notes').close()};$('navindex').onclick=()=>$('index').scrollIntoView();$('navfilm').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});$('ahead').onclick=()=>$('cards').scrollBy({left:$('cards').clientWidth*.83,behavior:'smooth'});$('back').onclick=()=>$('cards').scrollBy({left:-$('cards').clientWidth*.83,behavior:'smooth'});document.addEventListener('keydown',e=>{if(exporting||$('notes').open||e.target.matches('input'))return;if(e.code==='Space'&&!e.target.closest('button')){e.preventDefault();toggle()}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();seek(time+(e.key==='ArrowRight'?5:-5))}});
$('tick').innerHTML=rep(23,i=>'<i style="left:'+(5+i*6)/149*100+'%"></i>');transport();show(0,true);
CN.forEach((name,i)=>{let b=document.createElement('button');b.className='card'+(!i?' active':'');b.innerHTML='<svg viewBox="0 0 1200 675" aria-hidden="true"></svg><label><b>'+n2(i+1)+'</b>'+name+'<small>'+shotsZh[i]+'</small></label>';b.title=n2(i+1)+' · '+shotsZh[i];b.onclick=()=>{seek(5+i*6+changeLength[i]+.10);$('player').scrollIntoView({block:'center',behavior:'smooth'})};$('cards').append(b);let obs=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){b.querySelector('svg').innerHTML=scene(i,2.9);obs.disconnect()}},{rootMargin:'160px'});obs.observe(b)});
window.videoExport={runs:['film'],async begin(run,options={}){if(run!=='film')throw Error('Unknown run');if(!exporting)saved={time:playing?playhead():time,cover,playing,notesOpen:$('notes').open};if($('notes').open)$('notes').close();playing=false;cancelAnimationFrame(raf);hush();exporting=true;fps=options.fps||60;document.body.classList.add('export');show(0);await document.fonts.ready;return {frames:Math.round(149*fps)}},async frame(i){if(!exporting)throw Error('Call begin first');show(i/fps);film.getBoundingClientRect()},audio:wav,end(){if(!exporting)return;exporting=false;document.body.classList.remove('export');cover=saved.cover;show(saved.time,cover);if(saved.playing)toggle();else transport();if(saved.notesOpen)$('notes').showModal()}};
let idleTimer;function wakeControls(){clearTimeout(idleTimer);$('controls').classList.remove('idle');if(playing)idleTimer=setTimeout(()=>{if(playing&&!$('controls').matches(':hover'))$('controls').classList.add('idle')},2200)}
$('player').addEventListener('pointermove',wakeControls);$('player').addEventListener('pointerleave',()=>{if(playing)$('controls').classList.add('idle')});$('player').addEventListener('focusin',wakeControls);$('player').addEventListener('click',wakeControls);
