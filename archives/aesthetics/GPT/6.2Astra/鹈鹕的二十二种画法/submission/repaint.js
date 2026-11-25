// Lengths are in seconds from the downbeat of the arriving scene.
const changeLength=[1.36,1.52,1.56,1.46,1.38,1.42,1.36,1.30,1.42,1.60,1.46,1.48,1.58,1.52,1.56,1.52,1.44,1.45,1.38,1.54,1.52,1.39,1.48];
const exitFraming={0:[829,453],3:[658,516],6:[686,560],9:[873,525],10:[789,377],11:[897,430],13:[259,449],16:[805,452],21:[748,516]};
const screenPath='M-4 -4H1204V679H-4Z',fullCut='all';
const interval=(u,a,b)=>clamp((u-a)/(b-a));
const smooth=(u,a,b)=>ease(interval(u,a,b));
const point=(x,y)=>({x,y});
const between=(a,b,u)=>point(mixN(a.x,b.x,u),mixN(a.y,b.y,u));
const ellipsePath=(x,y,rx,ry)=>'M'+num(x-rx)+' '+num(y)+'a'+num(rx)+' '+num(ry)+' 0 1 0 '+num(2*rx)+' 0a'+num(rx)+' '+num(ry)+' 0 1 0 '+num(-2*rx)+' 0Z';
const boxPath=(x,y,w,h)=>'M'+num(x)+' '+num(y)+'h'+num(w)+'v'+num(h)+'h'+num(-w)+'Z';
function colour(a,b,u){
 const n=parseInt(a.slice(1),16),m=parseInt(b.slice(1),16);
 const rgb=[16,8,0].map(k=>Math.round(mixN((n>>k)&255,(m>>k)&255,clamp(u))).toString(16).padStart(2,'0'));
 return '#'+rgb.join('');
}
function opacity(s,a){return a<=0||!s?'':a>=1?s:G(s,'opacity="'+num(a)+'"')}
function poseAt(i,t,distance){
 if(i===-1){const a=introPlacement(t);return {x:a.x+101.5,y:a.y+241,span:203,bearing:0,roll:0,pitch:0}}
 if(i===22){const a=finishPlacement(t),z=1.58-.58*ease((t-1.5)/3.4);return {
  x:600+(a.x+101.5*a.k-600)*z,y:358+(a.y+241*a.k-358)*z,span:203*a.k*z,bearing:0,pitch:0,roll:0}}
 if(i===18){const tt=stageNineteenPhase(t),x=Math.round((406+22.5*tt)/4)*4;
  return {x:x+102*.91,y:504,span:204*.91,bearing:0,pitch:0,roll:0}}
 const h=takeShot(i,t,{distance}),p=platePoint(i,t,h.anchor);
 return {x:p.x,y:p.y,span:p.k*h.q.base,bearing:h.bearing,pitch:h.pitch,roll:h.roll};
}
function handoffPose(i,t,u,oldDistance,newDistance){
 const before=i===-1||i===18?poseAt(i,(i<0?5:6)+t,oldDistance):poseAt(i,6);
 const after=poseAt(i+1,t,newDistance),pan=ease(u);
 let orbit=pan;
 if(i===-1)orbit=smooth(u,.75,1);
 if(i===18)orbit=smooth(u,.68,.90);
 if(i===17||i===21)orbit=smooth(u,0,i===17?.32:.40);
 const diff=((after.bearing-before.bearing+540)%360)-180;
 let x=mixN(before.x,after.x,pan);const y=mixN(before.y,after.y,pan);
 if(i===12)x-=89*Math.sin(pi*u)**2;
 const size=Math.exp(mixN(Math.log(before.span),Math.log(after.span),pan))*(1+.033*Math.sin(pi*u)**2);
 return {x,y,span:mixN(size,Math.min(size,(y-29)*.54),Math.sin(pi*u)**2),
  bearing:before.bearing+diff*orbit,pitch:mixN(before.pitch,after.pitch,orbit),roll:mixN(before.roll,after.roll,orbit)};
}
function flatRegister(s,from,to){
 const z=to.span/from.span;
 return G(s,'transform="translate('+num(to.x-z*from.x)+' '+num(to.y-z*from.y)+') scale('+z+')"');
}
function exposureParts(i,t,pose,distance,settings){
 if(i===-1||i===22){
  const source=i===-1?intro(t,t,true):ending(t,true),native=poseAt(i,t);
  source.road=flatRegister(source.road,native,pose);source.bird=flatRegister(source.bird,native,pose);
  return {...source,defs:'',contact:f=>point(pose.x+(f-.5)*pose.span,pose.y)};
 }
 const [x,y,w,ht,u,v,a,b]=plateView(i,t,settings.open||0),base=routeSpecs[i].base;
 const lens={...pose,x:u+(pose.x-x)*a/w,y:v+(pose.y-y)*b/ht,k:pose.span/base*b/ht,kx:pose.span/base*a/w,filmScale:pose.span/base,align:settings.align??0};
 const c=journeyParts(i,t,{distance,lens,housesApart:settings.housesApart||0,liftCastle:settings.gilding,crestExposure:settings.crestExposure});
 if(i===4&&settings.dialog!==undefined)c.hud=settings.dialog;
 if(i===2&&settings.gilding)c.hud=valleyRibbon(t);
 if(i===2&&settings.giltIn!==undefined)c.hud=opacity(c.hud,settings.giltIn);
 if(i===9&&settings.liftType)c.back=eveningEdition(t,true);
 if(i===18){
  const n=poseAt(i,t);c.road=flatRegister(c.road,n,pose);c.actors=flatRegister(c.actors,n,pose);c.bird=flatRegister(c.bird,n,pose);
 }
 const layers=assemblePlate(i,t,c,true,settings);
 const contact=f=>i===18?point(pose.x+(f-.5)*pose.span,pose.y):
  platePoint(i,t,c.h.at(c.h.s+base*f,0,c.h.air));
 return {...layers,h:c.h,blocks:c.blocks,contact};
}
function radialCut(x,y,u,aspect=1,rough=.04,seed=0){
 if(u<=0)return '';if(u>=1)return fullCut;
 const radius=(Math.hypot(Math.max(x,1200-x)/aspect,Math.max(y,675-y))+12)/(1-rough);
 const pts=Array.from({length:72},(_,j)=>{const a=j*turn/72,r=radius*u*(1+rough*(2*rand(seed+j)-1));
  return point(x+aspect*r*Math.cos(a),y+r*Math.sin(a))});
 return contour(pts);
}
function sideCut(u,slant=0,uneven=0,reverse=false){
 if(u<=0)return '';if(u>=1)return fullCut;
 const margin=Math.abs(slant)*.6+uneven+15,xx=-margin+(1200+2*margin)*u;
 const pts=Array.from({length:23},(_,j)=>{const y=-4+j*683/22,x=xx+slant*(y/675-.5)+uneven*(2*rand(j+49)-1);return point(reverse?1200-x:x,y)});
 return contour([point(reverse?1204:-4,-4),...pts,point(reverse?1204:-4,679)]);
}
function fallingCut(u,tilt=0,edge=0,fromBelow=false){
 if(u<=0)return '';if(u>=1)return fullCut;
 const margin=Math.abs(tilt)*.6+edge+16,yy=-margin+(675+2*margin)*u;
 const pts=Array.from({length:43},(_,j)=>{const x=-4+j*1208/42,y=yy+tilt*(x/1200-.5)+edge*(Math.sin(j*.71)*.58+Math.sin(j*1.51)*.42);
  return point(x,fromBelow?675-y:y)});
 return contour([point(-4,fromBelow?679:-4),...pts,point(1204,fromBelow?679:-4)]);
}
function tiledCut(u,cols,rows,delay,vertical=false){
 if(u<=0)return '';if(u>=1)return fullCut;
 const w=1200/cols,h=675/rows;
 return rep(cols*rows,j=>{const x=j%cols,y=Math.floor(j/cols),f=smooth(u,delay(x,y,j),delay(x,y,j)+.22);
  if(f<=0)return '';return boxPath(x*w,y*h,vertical?w:w*f,vertical?h*f:h)});
}
function horizonCut(u,y){
 if(u<=0)return '';if(u>=1)return fullCut;
 const top=Array.from({length:25},(_,j)=>point(j*51-8,y-780*u+8*Math.sin(j*.61)));
 const bottom=Array.from({length:25},(_,j)=>point(1216-j*51,y+500*u*u+8*Math.sin((24-j)*.61)));
 return contour(top.concat(bottom));
}
function clipArt(s,d,id,inverse=false,union=false){
 if(!s)return '';
 if(!d)return inverse?s:'';
 if(d===fullCut)return inverse?'':s;
 return '<defs><clipPath id="'+id+'"><path d="'+(inverse?screenPath:'')+d+'" clip-rule="'+(union?'nonzero':'evenodd')+'"/></clipPath></defs>'+G(s,'clip-path="url(#'+id+')"');
}
function exchange(oldArt,newArt,d,id){
 return clipArt(oldArt,d,id+'-before',true)+clipArt(newArt,d,id+'-after');
}
function wheelCut(m,u){
 return radialCut(m.heel.x,m.heel.y,u,2.5,.032,6);
}
function figureCut(m,u,kind='paint'){
 if(u<=0)return '';if(u>=1)return fullCut;
 const x=m.pose.x,y=m.pose.y,w=m.pose.span;
 if(kind==='blocks'){
  const cell=16,yy=y+45-u*(w*2+116);
  return rep(25,j=>{const a=(j-1)*51,start=Math.floor((yy+Math.sin(j*2.7)*18)/cell)*cell;return boxPath(a,start,51,1000-start)});
 }
 const h=w*2.22+75,yy=y+52-h*u;
 const pts=Array.from({length:61},(_,j)=>point(j*21-16,yy+(j*21-x)*.12+7*Math.sin(j*1.31)));
 return contour([point(-16,710),...pts,point(1244,710)]);
}
function roadTrace(layer,length,width,paint,opacityValue=1,offset=0){
 const h=layer.h;if(!h)return '';
 const pts=Array.from({length:29},(_,j)=>platePoint(h.i,h.t,h.at(h.s+h.q.base*.5+(j/14-1)*length,offset,2)));
 return opacity(P('M'+pts.map(xy).join('L'),'none',st(paint,width)),opacityValue);
}
function filterPlate(s,matrix,id){
 return '<defs><filter id="'+id+'" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="'+matrix.join(' ')+'"/></filter></defs>'+G(s,'filter="url(#'+id+')"');
}
function sepia(s,u,id='silver-emulsion'){
 const grey=[.28,.56,.12,0,.10,.25,.50,.11,0,.085,.21,.42,.09,0,.055,0,0,0,1,0];
 return filterPlate(s,grey.map((v,i)=>mixN(i===0||i===6||i===12||i===18?1:0,v,u)),id);
}

function campusWindows(h){
 let glass='';
 for(let j=0;j<6;j++){
  const s=(4.65+j*.43)*h.speed,at=(d,y)=>h.at(s+d,-h.q.width-43,y);
  const a=at(0,3),b=at(0,164),c=at(118,164),d=at(118,73);
  if(![a,b,c,d].every(p=>p.visible))continue;
  glass+=polygon([b,c,d,at(0,73)],'#c8edef','opacity=".24"')+
   P('M'+xy(a)+'L'+xy(b)+'L'+xy(c)+'M'+xy(at(0,73))+'L'+xy(d),'none',st('#92adb6',Math.max(1,5*a.k)))+
   P('M'+xy(at(3,161))+'L'+xy(at(118,161)),'none',st('#f7fbef',Math.max(1,3*a.k)));
 }
 return glass;
}
function stockExposure(figure=false){
 return fixedDrawing(figure?'railway-negative-figure':'railway-negative-street',()=>{
  const c=journeyParts(8,6);
  return figure?c.bird:c.back+c.road+c.actors+c.near;
 });
}
function dollyPhoto(u){
 const zoom=smooth(u,.14,.88);
 return {x:330*zoom,y:190*zoom,w:1200-586*zoom,h:675-331*zoom,
  sy:mixN(-12,68,zoom),sh:675-160*zoom};
}
function repaint(i,elapsed){
 const next=i+1,duration=changeLength[next],u=clamp(elapsed/duration);
 const oldTime=(i===-1?5:6)+elapsed;
 const oldQ=routeSpecs[i],newQ=routeSpecs[next],g1=oldQ?.gear??1,g2=newQ?.gear??1;
 // Both versions of the driven wheel accumulate the same angle. The ratio
 // settles to the new gearing while the crank keeps ticking at 120 BPM.
 const sampleRate=next===18?8:next===21?12:0,settle=duration*(sampleRate?.56:1);
 const rollAt=t=>t*(g2+(g1-g2)*(1-clamp(t/settle))**3);
 let turns=rollAt(elapsed);
 if(sampleRate){
  // Hold the strength of the effect for each exposure. A continuous clock
  // converges to held poses without travelling backwards between two ticks.
  const tick=Math.floor(elapsed*sampleRate+1e-8)/sampleRate;
  turns=mixN(turns,rollAt(tick),smooth(tick/duration,.25,.68));
 }
 if(i===18)turns=mixN(stageNineteenPhase(elapsed),elapsed*g2,smooth(u,.52,1));
 if(i===21)turns=mixN(g1*(ridingClock(21,oldTime)-6),turns,smooth(u,.17,.59));
 const dOld=oldQ?turn*oldQ.r*(6*g1+turns):0,dNew=newQ?turn*newQ.r*turns:0;
 const pose=handoffPose(i,elapsed,u,dOld,dNew);
 if(i===8){
  const paper=dollyPhoto(u),still=poseAt(8,6),track=poseAt(9,elapsed,dNew),leave=smooth(u,.42,1);
  pose.x=mixN(paper.x+still.x*paper.w/1200+elapsed*18,track.x,leave);
  pose.y=mixN(paper.y+(still.y-12-paper.sy)*paper.h/paper.sh,track.y,leave);
  pose.span=mixN(still.span*paper.h/paper.sh,track.span,leave)*(1+.022*Math.sin(pi*u));
 }
 const before={align:smooth(u,0,.31)},after={align:1-smooth(u,.76,1)};
 if(i===1)after.giltIn=smooth(u,.42,.92);
 if(i===2)before.gilding=true;
 if(i===3)after.dialog=G(conversationPanel(elapsed),tr(0,148*(1-smooth(u,.21,.85))));
 if(i===4)before.dialog='';
 if(i===5)before.housesApart=u;
 if(i===7){before.open=smooth(u,.1,.86);after.open=1-smooth(u,.24,.92)}
 if(i===9)before.liftType=true;
 if(i===12)after.crestExposure=smooth(u,.73,.91);
 if(i===21)before.repair=smooth(u,.12,.81);
 const old=exposureParts(i,oldTime,pose,dOld,before),fresh=exposureParts(next,elapsed,pose,dNew,after);
 const m={u,t:elapsed,pose,old,fresh,heel:old.contact(0),glaze:'',surface:'',marks:''};
 m.ground=wheelCut(m,smooth(u,.15,.81));m.skin=figureCut(m,smooth(u,.43,.80));
 changes[next](m);
 const id='change-'+next;
 const back=m.background??(old.back+clipArt(fresh.back,m.sky,id+'-sky',false,true));
 const road=exchange(old.road,fresh.road,m.ground,id+'-track');
 const hero=exchange(old.bird,fresh.bird,m.skin,id+'-plumage');
 let surface=exchange(old.top,fresh.top,m.coating??m.sky,id+'-surface'),coatingDef='';
 // Within the dissolve, decorative material stays behind the moving drawing.
 // The normal foreground occlusion is restored at the edges of the exposure.
 const lift=smooth(u,0,.12)*(1-smooth(u,.85,1));
 if(lift>0&&lift<1){coatingDef='<defs><g id="'+id+'-coatings">'+surface+'</g></defs>';surface='<use href="#'+id+'-coatings"/>'}
 return (old.defs||'')+(fresh.defs||'')+coatingDef+back+m.glaze+road+m.surface+
  opacity(surface,lift)+m.marks+G(hero,'data-cyclist="continuous"')+opacity(surface,1-lift)+
  (next<22&&u>.74?opacity(seal(next,elapsed),smooth(u,.74,1)):'');
}
function scatterFrom(origin,u,j,radius){
 const ang=j*2.39996+rand(j+18)*.4,reach=(.25+.76*rand(j+82))*radius;
 return point(origin.x+Math.cos(ang)*reach*u,origin.y+Math.sin(ang)*reach*u*.75);
}
function openingPrint(m){
 const {u,heel}=m;
 m.sky=radialCut(heel.x,heel.y,smooth(u,.075,.92),1.35,.24,71);
 m.ground=radialCut(heel.x,heel.y,smooth(u,0,.64),3.2,.10,41);
 m.coating=m.sky;
 const g=smooth(u,.01,.72),fade=1-smooth(u,.64,.95);
 // Hand-cut pennants unroll along the tangent of the first printed path.
 m.surface=opacity(rep(11,j=>{
  const a=j/11,b=(j+1)/11,run=(a-.46)*1720*g,Y=heel.y-run*.22,X=heel.x+run;
  const width=(b-a)*1580*g,deep=(j%3?21:34)*Math.sin(pi*g);
  return P('M'+num(X)+' '+num(Y)+'l'+num(width)+' '+num(-width*.22)+'l'+num(-width*.35)+' '+num(deep)+'Z',j%3?red:ink);
 }),fade);
 m.marks=opacity(P('M'+xy(heel)+'l-8 1l-7 4l21 -2Z',red),1-smooth(u,.02,.19))+
  opacity(rep(21,j=>{const x=heel.x+(j-8)*61*g,y=heel.y-(j-8)*12*g;
   return G(P('M0 0l12 -8l18 1l-14 10Z',j%3?red:ink),tr(x,y,1+.35*g,-9))}),Math.sin(pi*u)*fade);
}
function posterNight(m){
 const {u,pose,heel,old,fresh}=m,origin=point(pose.x,pose.y-pose.span*.72);
 m.sky=radialCut(origin.x,origin.y,smooth(u,0,.88),1.22,.24,19);
 const fly=1-(1-u)**2.1;
 m.glaze=opacity(rep(50,j=>{
  let p=scatterFrom(origin,fly,j,1270);
  const fold=Math.cos(u*pi*2.4+j*.7),size=(.76+rand(j+9)*2.2)*(1-.62*u)*(.11+.89*smooth(u,0,.16)),r=14+rand(j+1)*30;
  if(j%3===0){
   const k=j+46,starPos=point((rand(k+71)*1250-fresh.h.dr*(k%3+1)*.036+2500)%1250-20,rand(k+89)*454);
   p=between(origin,starPos,fly);p.y-=41*Math.sin(pi*fly);
   const morph=smooth(u,.22,.75),points=Array.from({length:8},(_,k)=>{const a=k*pi/4,rr=k%2?mixN(r*.81,2,morph):mixN(r,7+rand(j)*4,morph);return point(Math.cos(a)*rr,Math.sin(a)*rr)});
   return G(polygon(points,colour(red,'#f0d495',morph)),tr(p.x,p.y,size*(1-.69*smooth(u,.62,1)),j*31+74*u));
  }
  return G(P('M0 0l'+r+' -18l-9 24l-18 6Z',j%2?ink:'#283854')+P('M0 0l'+r+' -18l-13 12Z',fold>0?'#444747':'#938886'),
   'transform="translate('+xy(p)+') rotate('+(j*47+u*170)+') scale('+((.12+.88*Math.abs(fold))*size)+' '+size+')"');
 }),1-smooth(u,.66,1));
 const length=18+2100*smooth(u,.14,.82),light=Math.sin(pi*smooth(u,.09,.95));
 m.surface=roadTrace(fresh,length,6,'#f5d595',light*.58,-4)+roadTrace(fresh,length,1.8,'#fff0c2',light,4)+
  opacity(star(heel.x,heel.y,15*light,'#fff1bc'),light);
}
function railwayDawn(m){
 const {u,old,pose}=m,horizon=265-16*Math.sin(pi*u),blue=smooth(u,0,.85);
 m.sky=horizonCut(blue,horizon);
 const sun=smooth(u,.02,.52),gold='#d9b675',f=smooth(u,.1,.89);
 m.glaze=opacity(G(C(0,0,74+118*sun,'#f7dfaf','opacity=".10"')+C(0,0,49+72*sun,'#ffeac5','opacity=".18"')+C(0,0,25,'#fff0cb'),tr(801,horizon-27*sun)),Math.sin(pi*u));
 let etch='';
 for(let j=0;j<4;j++){
  const right=j%2,lower=j>1,corner=point(right?1183:17,lower?658:17),sign=right?-1:1,dy=lower?-1:1;
  const rail=old.contact(right?1:0);
  const a=between(rail,point(corner.x+sign*132,corner.y),f),b=between(point(rail.x+sign*160,rail.y-1),point(corner.x+sign*34,corner.y),f),
   c=between(point(rail.x+sign*230,rail.y),point(corner.x,corner.y+dy*21),f),d=between(point(rail.x+sign*370,rail.y),point(corner.x,corner.y+dy*112),f);
  etch+=P('M'+xy(a)+'C'+xy(b)+' '+xy(c)+' '+xy(d),'none',st(gold,3))+
   G(P('M0 0q39 0 30 21q-6 12 -17 3q-5 -10 7 -12','none',st('#f1cf8a',2))+star(7,7,5,'#e0bb70'),tr(c.x,c.y,f*(right?-.95:.95),lower?-38:38));
 }
 m.marks=opacity(etch,Math.min(1,u*12)*(1-smooth(u,.86,1)));
 m.ground=radialCut(pose.x,pose.y,smooth(u,.19,.91),3.2,.02);
}
function castleSchool(m){
 const {u,heel,old}=m,spread=smooth(u,.01,.85),fold=smooth(u,.11,.88);
 m.sky=radialCut(heel.x,heel.y,spread,1.4,.07);
 const x=14+20*fold,y=14+15*fold,w=mixN(1172,324,fold),h=mixN(647,70,fold),col=colour('#e0bd79','#c3e3e7',fold);
 m.marks=opacity(R(x,y,w,h,fold>.68?'#f4faf6':'none','fill-opacity="'+(.7*fold)+'" rx="'+num(18*fold)+'" '+st(col,2.8))+
  rep(4,j=>G(P('M0 48V0h68l-14 5h-27l-16 15v13Z',col)+star(10,10,5,'#f9dda1'),
  'transform="translate('+(j%2?x+w:x)+' '+(j>1?y+h:y)+') scale('+((j%2?-1:1)*(1-fold))+' '+((j>1?-1:1)*(1-fold))+')"')),1-smooth(u,.81,1));
 const cast=old.h.at(1600,-510),school=m.fresh.h.at(-132,179,0),pull=smooth(u,.10,.79);
 const at=between(cast,school,pull),size=mixN(cast.k*1.28,school.k*1.42,pull);
 const elevation=citadel(old.h.t,pull).replace('translate(824 288)','translate(0 0)');
 m.glaze=opacity(G(elevation,tr(at.x,at.y,size)),1-smooth(u,.67,.90));
 const ring=5+215*spread;m.surface=opacity('<ellipse cx="'+heel.x+'" cy="'+heel.y+'" rx="'+ring+'" ry="'+ring*.24+'" fill="none" stroke="#f8ebbb" stroke-width="4"/>',1-smooth(u,.08,.58));
}
function campusBlossom(m){
 const {u}=m,wind=smooth(u,0,.91);
 m.sky=fallingCut(wind,-235,34);
 m.glaze=opacity(rep(79,j=>{const x=rand(j+50)*1390-130+u*(97+j%7*15),y=-128+rand(j+101)*399+u*u*(194+rand(j+20)*284);
  return G(P('M0 0Q-12 -8 -9 -19Q-2 -15 0 -22Q16 -11 0 0Z',j%4?'#f8d5df':'#fff1ef')+P('M0 -2l-4 -11','none',st('#d49cad',.8)),
   tr(x,y,.3+rand(j+140)*.57,j*107+u*143))}),Math.sin(pi*u)**.65);
 m.ground=fallingCut(smooth(u,.18,.84),-119,19);
}
function dialogueBubble(m){
 const {u}=m,inflate=smooth(u,0,.32),pop=smooth(u,.31,.83);
 const origin=point(599,596-179*inflate-54*pop);
 m.sky=radialCut(origin.x,origin.y,smooth(u,.28,.91),1.5,.015);
 const w=mixN(1102,185,inflate),ht=mixN(103,176,inflate),x=origin.x-w*.5,y=origin.y-ht*.5;
 m.marks=opacity(R(x+3,y+7,w,ht,'#a98496','opacity=".22" rx="'+num(12+78*inflate)+'"')+
  R(x,y,w,ht,colour('#fff9f6','#f5b8cd',inflate),'fill-opacity=".94" rx="'+num(12+78*inflate)+'" '+st('#e4b3c4',2))+
  opacity(G(conversationPanel(6),'transform="translate('+num(x-49*w/1102)+' '+num(y-548*ht/103)+') scale('+w/1102+' '+ht/103+')"'),1-inflate)+
  opacity(P('M'+num(x+w*.21)+' '+num(y+ht*.35)+'q15 -29 46 -30','none',st('#fff1e6',8)),inflate),1-smooth(u,.30,.43));
 m.glaze=opacity(rep(32,j=>{const p=scatterFrom(origin,pop,j,1130),r=(6+rand(j)*25)*(1-.55*pop);
  return C(p.x,p.y,r,['#f5c1d2','#ffdfa3','#b5d9b1','#c5bae4'][j%4],st('#fff0db',2))+C(p.x-r*.28,p.y-r*.4,r*.19,'#fff3e1')}),smooth(u,.29,.38)*(1-smooth(u,.73,1)));
 m.ground=radialCut(origin.x,origin.y,smooth(u,.32,.8),1.8,.025);
}

function candyStage(m){
 const {u,pose}=m,open=smooth(u,.08,.85),gap=710*open;
 m.sky=open>=1?fullCut:open<=0?'':contour([point(600-gap,-5),point(600+gap,-5),point(600+gap*.87,247),point(600+gap+33*open,498),point(600+gap*.98,680),point(600-gap*.99,680),point(600-gap+39*open,405),point(600-gap*.86,260)]);
 m.glaze=opacity(rep(73,j=>{const start=point(j%2?1041:162,465),a=rand(j+79)*pi*.86+.07*pi,sign=j%2?-1:1;
  const x=start.x+sign*(137+rand(j+45)*823)*Math.cos(a*.78)*u,y=start.y-(291+rand(j+130)*490)*Math.sin(a)*u+375*u*u;
  const c=['#f6b4c9','#99e8de','#fdd79b','#ceabe7'][j%4];
  return G(j%3===0?P('M0 0q-10 -14 -2 -24t-1 -20','none',st(c,4)):R(-3,-9,6,j%3?20:7,c,'rx="2"'),tr(x,y,1,j*41+u*294))}),Math.sin(pi*u)**.75);
 m.surface=opacity(rep(43,j=>{const x=j*29-13,y=383+38*Math.sin(j*.84);return G(R(-3,-26,6,24,j%2?'#8ae4d4':'#eda0c6','rx="2"')+R(-2,-2,4,7,'#a1aaa3'),tr(x,y,.72+rand(j)*.4,17*Math.sin(j+u*6)))}),Math.sin(pi*smooth(u,.24,.90)));
 m.ground=radialCut(pose.x,pose.y,smooth(u,.16,.85),1.25,.02);
}
function relightStreet(m){
 const {u}=m,heel=m.old.contact(.5),off=smooth(u,0,.10),on=smooth(u,.16,.80),blackout=off*(1-on);
 const cones=rep(5,j=>{const x=j*243+108,reach=on*1100,width=on*(241+on*130);return contour([point(x-width*.56,-3),point(x+width*.56,-3),point(x+width,reach),point(x-width,reach)])});
 m.sky=on>=.92?fullCut:cones;
 // Individual spots go dark. Only the cyclist keeps its rim lighting during the cue.
 m.background=m.old.back+opacity(R(0,0,1200,675,'#172033'),blackout)+clipArt(m.fresh.back,m.sky,'relit-street',false,true);
 m.coating=fallingCut(smooth(u,.05,.77),22,0);
 m.glaze=opacity(rep(5,j=>{const x=80+j*260;return P('M'+x+' 0l-142 558h276Z','#fff4d2','opacity=".19"')+C(x,26,12,'#fff3d2')}),Math.sin(pi*on));
 const hit=1-smooth(u,.02,.31);
 m.marks=opacity(G(P('M-27 -2l15 -9h31l12 8l-15 8h-30Z','#b4ffea',st('#fff0c0',3))+star(0,0,21,'#fff8d9'),tr(heel.x,heel.y,1+u*2)),hit);
 m.surface=roadTrace(m.old,700,2.2,'#8df1df',blackout);
 m.ground=fallingCut(smooth(u,.18,.77),-72,5);m.skin=figureCut(m,smooth(u,.41,.77));
}
function celToCinema(m){
 const {u}=m,light=smooth(u,.02,.74);
 m.sky=fallingCut(light,92,22);
 const sun=point(809,120),pulse=Math.sin(pi*u);
 const cloudLight=fixedDrawing('volume-cloud-transfer',()=>'<defs>'+grad('cloud-turn',['#fffef0','#e0edf1','#a8c7d3'])+'</defs>'+
  rep(7,j=>C(j*35,54-39*Math.sin(pi*j/6),32+22*Math.sin(pi*j/6),'url(#cloud-turn)'))+
  P('M-27 60q52 9 79 -14q53 23 78 -4q37 21 102 8q-8 30 -67 31H3Z','#d5e3e4'));
 m.glaze=opacity(G(cloudLight,tr(574+u*16,78-u*18,1.36))+G(cloudLight,tr(87-18*u,134,.73)),.82*pulse)+
  opacity(rep(7,j=>G(P('M0 0L-21 687h54Z','#fff4cc','opacity=".14"'),tr(sun.x,sun.y,1,j*13+18)))+
   C(sun.x,sun.y,35,'#fffbe7','opacity=".86"')+rep(4,j=>C(808-89*j,121+59*j,10+j*5,'#fbead1','opacity=".21"')),pulse);
 m.ground=fallingCut(smooth(u,.17,.81),-114,8);
}
function streetPhotograph(m){
 const {u}=m,f=dollyPhoto(u),tone=smooth(u,0,.48);
 // The rail crossing is exposed at the shutter beat. Its photographic plate is
 // fixed in time, while the live rider rolls on across the developing paper.
 const shot=stockExposure(false);
 const photo=graphicWindow(f.x,f.y,f.w,f.h,sepia(shot,tone),'0 '+f.sy+' 1200 '+f.sh);
 const shrink=smooth(u,.14,.88),surround=R(f.x-4,f.y-4,f.w+8,f.h+8,'#e7dfc9',st('#5b5546',1.6));
 const blendOut=1-smooth(u,.84,.99);
 m.background=m.fresh.back+opacity(surround+photo,blendOut);
 // The original cinema mattes and the white paper margin travel with the print.
 const bars=80*(1-smooth(u,0,.50));
 m.glaze=bars>0?R(f.x,f.y,f.w,bars,'#131b1e')+R(f.x,f.y+f.h-bars,f.w,bars,'#131b1e'):'';
 m.glaze+=opacity(R(0,0,1200,675,'#fff4d8'),.24*(1-smooth(u,0,.12)))+
  opacity(R(f.x+1,f.y+1,f.w-2,f.h-2,'url(#dots)'),.15*shrink*blendOut);
 m.sky=sideCut(smooth(u,.12,.67),0,0);
 m.old.road='';m.old.top=opacity(m.old.top,1-smooth(u,0,.2));
 m.ground=wheelCut(m,smooth(u,.37,.82));
 m.old.bird=sepia(m.old.bird,tone,'silver-cyclist');
 m.skin=figureCut(m,smooth(u,.44,.81));m.coating=m.sky;
}
function pressTelemetry(m){
 const {u,pose}=m,f=smooth(u,0,.82);
 m.sky=tiledCut(f,9,3,(x,y)=>.03+Math.abs(x-4)*.11+.05*y,true);
 const label='骑行异闻：长喙来客现身街头',bars=[];
 let type='';
 for(let j=0;j<36;j++){
  const row=Math.floor(j/12),col=j%12,start=row===0?point(39+j*41,621):point(989+col*14,258+(row-1)*31);
  const end=point(962+j*4.5,610),g=smooth(u,.015+col*.009,.59+row*.065);
  const center=between(start,end,g);center.y-=Math.sin(pi*g)*(120+row*70);
  const w=mixN(7,1.6+j%3,g);
  const source=[label,'黄昏，街角传来铃声。','行客驻足，见一长喙鸟'][row];
  type+=opacity(G(T(0,0,g<.32?(source[col]||''):String((j*13)%10),mixN(row?16:39,13,g),colour('#514838','#38423f',g),'style="font-family:Georgia,SimSun,serif"'),tr(center.x,center.y,1,14*Math.sin(pi*g))),1-smooth(g,.61,.98));
  bars.push(opacity(R(center.x,center.y-15*g,w,Math.max(1,16*g),colour('#6e6550','#35413d',g)),smooth(g,.41,.91)));
 }
 m.marks=opacity(type+bars.join(''),1-smooth(u,.82,1));
 const scan=smooth(u,.23,.8),box=pose.span;
 m.surface=opacity(G(P('M-'+box+' -17v-14h21m'+(2*box-42)+' 0h21v14m0 43v12h-21m-'+(2*box-42)+' 0h-21v-12','none',st('#f9da6d',2.3)),tr(pose.x,pose.y-box*.75)),Math.sin(pi*scan))+
  opacity(rep(12,j=>G(P('M0 0h27l-36 39h-27Z',j%2?'#3e453e':'#e6c350'),tr(76+j*34,584,scan))),Math.sin(pi*scan));
 m.ground=sideCut(smooth(u,.19,.81),-211,0);
}
function mechanismDrawing(m){
 const {u}=m,scan=smooth(u,.02,.83);
 m.sky=sideCut(scan,-267,0);
 const c0=m.old.h.at(m.old.h.s+m.old.h.q.base*.49,-118,95);
 const pieces=rep(7,j=>{
  const delay=.04+j*.041,p=smooth(u,delay,delay+.50),at=between(point(c0.x+(j-3)*8,c0.y+(j%2)*9),point(883+j*30,546),p);
  at.y-=Math.sin(pi*p)*(64+j%3*27);
  const col=colour(j%2?'#a4afa5':'#d6b546','#ccedfe',p);
  const hub=P('M-18 -10l9 -9h17l10 9v18l-10 10H-9l-9 -10Z M-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z',p>.81?'none':col,'fill-rule="evenodd" '+st(col,1.7))+
   C(0,0,11,'none',st(col,1))+P('M-28 0h56m-28 -29v58','none','stroke="'+col+'" stroke-width=".8" stroke-dasharray="4 3"');
  return G(hub+opacity(mt(-13,-34,'B'+n2(j+1),11,'#d9efff'),p),'transform="translate('+xy(at)+') rotate('+num((1-p)*(-38+j*9))+') scale(1 '+num(.43+.57*p)+')"');
 });
 m.glaze=opacity(pieces,Math.sin(pi*u)**.58);
 m.marks=opacity(G(R(0,0,274,32,'#405352')+mt(13,22,'CAM 07   /   STRUCTURE',16,'#e8eac8')+R(252,9,10,12,'#e6c24d'),tr(873,40)),1-smooth(u,.29,.61));
 const lineX=-162+1524*scan;
 m.surface=opacity(P('M'+num(lineX+126)+' 0l-267 675','none',st('#c5ebef',4))+
  rep(12,j=>L(lineX+99-j*18,j*47,lineX+112-j*18,j*47,'#b7dee6',2)),Math.sin(pi*scan));
 m.ground=sideCut(smooth(u,.16,.80),-267,0);
 m.skin=figureCut(m,smooth(u,.40,.80));
}
function xuanFromGrid(m){
 const {u,heel}=m,p=smooth(u,0,.88);
 const r=p*(Math.max(heel.x/1.32,(1200-heel.x)/1.32)+509);
 const bleed=Array.from({length:122},(_,j)=>{
  const a=j*turn/122,n=1+.045*Math.sin(5*a+1)+.029*Math.sin(9*a+.8)+.021*Math.cos(16*a)+.014*rand(j+307);
  return point(heel.x+1.32*r*n*Math.cos(a),heel.y+r*n*Math.sin(a));
 });
 m.sky=p>=1?fullCut:p<=0?'':roundContour(bleed);
 const rise=smooth(u,.13,.79),fade=Math.sin(pi*u);
 const ridges=rep(8,j=>{
  const row=210+j*35,pts=Array.from({length:51},(_,k)=>{
   const x=k*24,peak=(.41+.31*Math.sin(x/(73+j*3)+j*.91)+.18*Math.sin(x/23+j*.42))*118;
   const origin=(1-Math.min(1,Math.abs(x-heel.x)/1000)*.25);
   return point(x,row-rise*peak*origin);
  });
  const ridge='M'+pts.map(xy).join('L');
  return P(ridge+'L1200 '+(row+15)+'H0Z',colour('#7599b7',['#a9b3a4','#9ca99b','#819182','#6d7e70'][j%4],rise),'opacity="'+num(rise*.5)+'"')+
   P(ridge,'none',st(colour('#c5e1e9','#515e50',rise),.8+rise*(j%3+1)*.63));
 });
 m.glaze=opacity(clipArt(ridges,m.sky,'mountain-fibres'),fade);
 const fibres=rep(61,j=>{const a=j*turn/61,b=bleed[j*2],k=.45+rand(j+41)*.64;
  return G(P('M-8 0q10 -2 22 0m-17 2l10 -1m-12 -4l8 1','none',st(j%3?'#b9b7a1':'#7d8776',1.4)),
   tr(b.x,b.y,k,j*360/61))+C(b.x+Math.cos(a)*8,b.y+Math.sin(a)*8,1.5*k,'#a7ab95')});
 m.marks=opacity((p>0&&p<1?P(roundContour(bleed),'none',st('#d7d6bd',6.5)):'')+fibres,.71*fade);
 m.ground=radialCut(heel.x,heel.y,smooth(u,.06,.77),2.0,.13,36);
}


function riverToWoodblock(m){
 const {u}=m,p=smooth(u,.015,.88),level=445-660*p;
 const upper=Array.from({length:54},(_,j)=>{const x=j*23-10,d=(x-570)/730;return point(x,level+155*d*d*(1-p)+17*Math.sin(j*.32-4*p))});
 m.sky=p>=1?fullCut:contour([point(-10,680),...upper,point(1210,680)]);
 if(p<.18)m.sky=clipWaveInScroll(upper,p);
 const curl=smooth(u,0,.76),coloring=smooth(u,.09,.72);
 // The brush contour is the actual key block of the arriving print. Its
 // white claws and cut ridges grow out of the wash at the back of the river.
 let wave=printWave(m.t);
 for(const [wood,wash] of [['#315d76','#6d7b6e'],['#253f50','#576858'],['#779ca9','#a7b1a1'],['#57849b','#889888'],['#8ba6ac','#b6bfae'],['#fbf2d9','#e8e7d7']]){
  wave=wave.replaceAll(wood,colour(wash,wood,coloring));
 }
 const crest=G(wave,'transform="translate('+num(22-66*1156/1200)+' '+num(24+70*627/675)+') scale('+1.05*1156/1200+' '+1.05*627/675+')"');
 const focus=between(point(559,426),point(390,228),curl),size=.065+.935*curl;
 m.glaze=opacity(G(crest,'transform="translate('+xy(focus)+') scale('+size+') translate(-390 -228)"'),smooth(u,0,.13)*(1-smooth(u,.73,.91)));
 m.ground=fallingCut(smooth(u,.01,.63),33,18,true);
 m.skin=figureCut(m,smooth(u,.37,.80));
}
function clipWaveInScroll(upper,p){
 if(p<=0)return '';
 const f=smooth(p,0,.18),w=3+708*f,x=573-w,xx=573+w;
 const foot=439+241*f,top=upper.filter(a=>a.x>=x&&a.x<=xx).map(a=>point(a.x,mixN(439,a.y,f)));
 return top.length?contour([point(x,foot),...top,point(xx,foot)]):'';
}
function woodblockRelief(m){
 const {u}=m,p=smooth(u,.04,.88);
 m.sky=fallingCut(smooth(u,.01,.82),-65,14);
 const c=m.old,printW=1156/1200,printH=627/675;
 if(c.blocks){
  let sheets='';
  for(let j=0;j<c.blocks.length;j++){
   const fold=smooth(u,.025+j*.066,.70+j*.065),v=Math.sin(pi*fold),shrink=1-.24*v;
   const x=22+(j-1)*65*v,y=24-(25+25*j)*v;
   const matrix='matrix('+num(printW*shrink)+' '+num((j-1)*.039*v)+' '+num(-.17*v)+' '+num(printH*(1-.44*v))+' '+num(x+115*(1-shrink))+' '+num(y+174*v)+')';
   const printing=graphicWindow(0,0,1200,675,c.blocks[j]);
   sheets+=opacity(G(v>.03?paperRelief(printing,v):printing,'transform="'+matrix+'"'),1-smooth(fold,.53,1));
  }
  const wall=opacity(R(0,0,1200,675,'#d9c7a2'),1-smooth(u,0,.48));
  m.background=m.fresh.back+wall+sheets;
 }
 // The negative spaces between the wave ridges become gaps between paper firs.
 m.glaze=opacity(rep(3,j=>{
  const pts=[];for(let k=0;k<=56;k++){
   const x=-24+k*23,theta=k*(.28+j*.019),wave=314+j*49+Math.sin(theta)*28,needle=((k+j)%4===0?-(48+rand(k+j)*54):7);
   pts.push(point(x+(j-1)*21*Math.sin(pi*p),mixN(wave,333+j*47+needle,p)));
  }
  return P('M'+pts.map(xy).join('L')+'L1264 540H-26Z',colour(['#89a9ae','#658a9c','#426778'][j],['#a6bba1','#87a797','#648e7f'][j],p),
   'stroke="#cfccb1" stroke-width="2"');
 }),Math.sin(pi*u)*.88);
 m.ground=fallingCut(smooth(u,.18,.86),-94,17,true);
}
function moonToBrush(m){
 const {u,old}=m,q=smooth(u,.03,.82),h=old.h;
 const moon=platePoint(14,h.t,{x:839*1.16-63-h.dr*.04,y:129*1.04-14,k:1});
 const pores=rep(104,j=>{
  const x=(j%13)*106-24+(rand(j+104)-.5)*42,y=Math.floor(j/13)*107-21+rand(j)*28;
  const depth=Math.min(1,Math.hypot((moon.x-x)*.74,moon.y-y)/1030),grow=smooth(q,depth*.43+.12*rand(j+22),.60+depth*.37);
  return grow>0?ellipsePath(x,y,(89+rand(j)*48)*grow,(79+rand(j+77)*37)*grow):'';
 });
 m.sky=q>=.99?fullCut:pores;m.coating=fallingCut(smooth(u,.03,.89),-270,46);
 const field=rep(83,j=>{
  const y=165+rand(j+49)*527,x=moon.x+(rand(j)-.70)*(y-65)*3.25,beam=smooth(u,rand(j+37)*.18,.65+rand(j+75)*.2);
  const size=4+rand(j+94)*16,rx=size*(1+.73*beam),ry=size*(1-.77*beam);
  return G(P(ellipsePath(0,0,rx,ry),colour('#ffe4a5',['#e5d9a1','#c3c89d','#eadfb3','#a2b69a'][j%4],beam))+
   P('M'+num(-rx*.66)+' '+num(ry*.25)+'q'+num(rx*.72)+' '+num(-ry*.86)+' '+num(rx*1.28)+' '+num(-ry*.33),'none',st('#f1e8c2',1.2)),tr(x,y,.27+.73*beam,-17));
 });
 m.glaze=opacity(rep(7,j=>P('M'+xy(moon)+'L'+(j*197-420)+' 680h'+(42+j*3)+'Z','#ffe7ab','opacity=".18"'))+
   C(moon.x,moon.y,59+q*37,'#ffedc3','opacity=".31"')+field,Math.sin(pi*u)**.66);
 m.ground=radialCut(moon.x,moon.y,smooth(u,.15,.90),1.2,.09,23);
}
function brushToDots(m){
 const {u}=m,p=smooth(u,0,.96),edge=-90+1380*p;
 m.sky=sideCut(p,45,5);m.ground=sideCut(smooth(u,.065,.97),45,5);m.skin=sideCut(p,45,5);
 let screen='';
 for(let j=0;j<22;j++){
  const row=j*32,start=Math.floor((edge-152)/29);
  for(let n=0;n<9;n++){const i=start+n,x=i*29+(j%2)*14.5,g=clamp((edge-x+72)/175),id=j*53+i;
   const paint=['#a8b99b','#c5c79f','#c5af8e'][Math.abs(id)%3],printer=[ink,'#db483c','#3b899f','#e9bb3b'][Math.abs(id)%4];
   const px=x+(1-g)*(rand(id)-.5)*22,py=row+(1-g)*(rand(id+43)-.5)*19;
   const d='M'+num(px-10*(1-g))+' '+num(py+3*(1-g))+'l'+num(20*(1-g)+.01)+' '+num(-6*(1-g));
   screen+=P(d,'none',st(colour(paint,printer,g),mixN(3.5,8.8,g))+' opacity="'+num(.4+.55*Math.sin(n*pi/9))+'"');
  }
 }
 m.glaze=opacity(screen,Math.sin(pi*u)**.38);
}
function comicSpray(m){
 const {u}=m,colours=['#7ad1b8','#db9fbc','#f1ce71','#8585b7','#76b6c1','#d994ad'];
 function strokeRow(j,road=false){
  const step=smooth(u,(road?.10:0)+j*.055,.57+j*.065);
  return {x:(j%2?1-step:step)*1500+(j%2?-151:-149),y:23+j*116+9*Math.sin(j*1.1+step*7),step};
 }
 let stencil='',tags='<defs><radialGradient id="aerosol-mist"><stop stop-color="#dcaac4" stop-opacity=".38"/><stop offset="1" stop-color="#dcaac4" stop-opacity="0"/></radialGradient></defs>';
 for(let j=0;j<6;j++){
  const {x,y,step}=strokeRow(j);
  if(step<=0)continue;
  const reverse=j%2,source=reverse?1210:-10,dir=reverse?-1:1,yy=j*113;
  if((x-source)*dir>0){
   const cap=Array.from({length:23},(_,k)=>{const v=k/22;
    return point(x+dir*(33*Math.sin(pi*v)+13*(rand(k+j*23)-.5)),yy-7+127*v)});
   const strip=[point(source,yy-7),...cap,point(source,yy+120)];
   stencil+=contour(reverse?strip.reverse():strip);
  }
  if(step<.99)tags+=C(x,y+39,45,'url(#aerosol-mist)');
  tags+=G(P('M0 0q-32 -11 -83 -7l-55 -5q75 -3 138 3Z',colours[j])+rep(26,k=>{
   const a=rand(k+41*j)*turn,d=rand(k+j*71)*36;
   return C(d*Math.cos(a),d*Math.sin(a),.6+rand(k+11)*2.3,colours[j])}),
   'transform="translate('+num(x)+' '+num(y+38)+') scale('+(j%2?-1:1)+' 1)"');
 }
 m.sky=u>.96?fullCut:stencil;m.coating=sideCut(smooth(u,.10,.84),102,24);m.ground=sideCut(smooth(u,.19,.87),42,20);
 const paint=smooth(u,0,.62),edge=rep(3,j=>{
  const d=['M12 243H1188','M379 14V239','M648 257L551 651'][j];
  return P(d,'none',st(colours[j],12+j*2)+' pathLength="1" stroke-dasharray="1" stroke-dashoffset="'+(1-smooth(paint,j*.17,.62+j*.16))+'"');
 });
 m.marks=opacity(tags+edge,1-smooth(u,.71,.98));
 m.glaze=opacity(rep(14,j=>{const a=rand(j)*1190,b=190+rand(j+41)*369;
  const sticker=j%3===0?P('M-29 1l11 -15l20 -4l29 11l-21 2l-10 16l-24 6Z','#eee5c5',st('#3e3a49',2.5))+P('M-9 -7l10 -3l22 4l-19 2l-11 7l-9 1Z','#564758')+C(1,-6,1.9,'#f4c86e'):
   P('M-18 -13l32 -5l6 29l-32 4Z',colours[j%6],st('#4d4650',1.6))+star(1,0,8,'#f0e9bf',5);
  return G(sticker,tr(a,b,smooth(u,j*.024,.68),-10+j%5*7))}),Math.sin(pi*u));
}
function aerosolPixels(m){
 const {u}=m,p=smooth(u,0,.90);
 m.sky=tiledCut(p,24,15,(x,y,j)=>.036*x*.62+.11*Math.sin(y*.49)**2+.105*rand(j));
 m.ground=tiledCut(smooth(u,.12,.88),25,9,(x,y,j)=>.021*x+.042*rand(j)+y*.012);
 m.skin=figureCut(m,smooth(u,.33,.79),'blocks');
 const edge=-160+1530*p;
 const record=m.old.h.at(1810,-111),letters=T(-5,-116,'RE: DRAW',143,'white','font-weight="1000" font-style="italic" transform="rotate(-6)"');
 const sprayGrid='<defs><mask id="spray-lettering" maskUnits="userSpaceOnUse" x="-120" y="-380" width="1580" height="1240">'+G(letters,tr(record.x,record.y,record.k))+'</mask>'+
  pat('spray-to-tiles',13,13,R(1,1,10,10,colour('#e2a8bf','#f9d78a',p))+R(1,1,7,2,'#f0caca'))+'</defs>'+
  G(R(0,0,1200,675,'url(#spray-to-tiles)'),'mask="url(#spray-lettering)"');
 m.glaze=opacity(sprayGrid,Math.sin(pi*smooth(u,0,.76)))+opacity(rep(155,j=>{
  const col=Math.floor((edge-120)/16)+j%15,row=Math.floor(j/15),gridX=col*16,gridY=47+row*46+(col%3)*7;
  const f=clamp((edge-gridX+115)/238),size=3+13*f,xx=mixN(gridX+(rand(j+col)-.5)*24,gridX,f),yy=mixN(gridY+(rand(j+44)-.5)*20,Math.round(gridY/8)*8,f);
  const color=colour(['#d290b0','#8ad3b8','#b8a47a'][j%3],['#90b7a4','#e1c477','#68978a'][j%3],f);
  return R(xx,yy,size,size,color,'rx="'+num(4*(1-f))+'"');
 }),Math.sin(pi*u)**.57);
}
function pixelsInRain(m){
 const {u,pose,old}=m,p=smooth(u,.16,.94),nightfall=smooth(u,0,.57);
 m.sky=fallingCut(p,22,4);m.coating=fallingCut(smooth(u,.21,.86),-87,7);
 let dusk=old.back,floor=old.road;
 for(const [a,b] of [['#80c4c3','#233149'],['#e9e9bc','#7e829b'],['#cbd8b2','#636e82'],['#76a8a0','#39465a'],['#a5cbb0','#6a7489'],['#548c82','#384353'],['#5b9584','#354256'],['#5e918c','#3d4c5e'],['#476977','#394156'],['#719a58','#65998f'],['#986c53','#384559'],['#b68a60','#576978'],['#815b50','#283249'],['#cbd176','#92e8de'],['#5b8053','#4c7a81']]){
  dusk=dusk.replaceAll(a,colour(a,b,nightfall));floor=floor.replaceAll(a,colour(a,b,nightfall));
 }
 old.road=floor;
 old.top=opacity(old.top,1-smooth(u,.05,.41));
 const edge=-250+1220*p;
 const soft='<defs><linearGradient id="rain-clear" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="'+num(edge-141)+'" y2="'+num(edge+142)+'"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>'+
  '<mask id="rain-exposure" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="675">'+R(0,0,1200,675,'url(#rain-clear)')+'</mask></defs>';
 m.background=dusk+soft+G(m.fresh.back,'mask="url(#rain-exposure)"');
 // Light comes from the same platform tiles that have just scrolled into view.
 const stage=stageNineteen(6+m.t),night=smooth(u,.01,.42),n=poseAt(18,6+m.t);
 const lamps=rep(31,j=>{
  const k=j+Math.floor(-stage.pit/48),x=stage.pit+k*48;
  if(k>=0&&k<3)return '';
  return R(x,504,43,4,j%3?'#83f8df':'#ff9cda')+R(x+7,520+(k%4)*5,19,4,j%2?'#ed95cf':'#79e4d8');
 });
 m.surface=opacity(flatRegister(lamps,n,pose),night*(1-smooth(u,.54,.91)));
 const cityLights=rep(74,j=>{const x=Math.round(rand(j+23)*1200/8)*8,y=Math.round((151+rand(j+91)*279)/8)*8;
  const shine=smooth(u,.01+rand(j+32)*.19,.40);
  return R(x,y,8,8,j%3?'#85eadb':'#eba2d1','opacity="'+shine+'"')+
   R(x-3,y-3,14,14,j%3?'#85eadb':'#eba2d1','opacity="'+(.12*shine)+'"');
 });
 const rise=smooth(u,.15,.68),towers=rep(10,j=>{
  const x=j*142-105-Math.round(stageNineteenPhase(6+m.t)*17/4)*4,y=196+rand(j)*32;
  const ridge=[[0,192],[0,152],[20,152],[20,120],[44,120],[44,76],[64,76],[64,48],[84,48],[84,20],[100,20],[100,0],[124,0],[124,20],[144,20],[144,44],[160,44],[160,76],[180,76],[180,116],[208,116],[208,148],[232,148],[232,192]];
  const roof=7+rand(j+41)*74;
  const pts=ridge.map(([xx,yy],k)=>point(xx,mixN(yy,k===0||k===ridge.length-1?192:k<4||k>19?131:k<10||k>14?roof:roof-45,rise)));
  const side=G(polygon(pts,colour('#76a8a0','#364158',nightfall))+opacity(rep(20,k=>R(61+(k%5)*18,roof+13+Math.floor(k/5)*21,8,4,k%3?'#85dfd7':'#d59cbd')),rise),tr(x,y));
  return side;
 });
 m.glaze=opacity(towers,smooth(u,.04,.22)*(1-smooth(u,.56,.81)))+opacity(cityLights,Math.sin(pi*u)*.86);
 m.marks=opacity(rep(72,j=>{const y=(rand(j)*730+u*284)%708-18,x=rand(j+51)*1280-y*.09;
  return L(x,y,x-2,y+13+u*6,'#bdcfe1',1.15)}),Math.sin(pi*smooth(u,.12,.98))*.64);
 m.ground=fallingCut(smooth(u,.20,.83),-41,7,true);m.skin=figureCut(m,smooth(u,.33,.66),'blocks');
}
function puddlesToGrid(m){
 const {u}=m,f=smooth(u,.04,.82),vanish=point(mixN(716,601,f),mixN(389,301,f));
 m.sky=fallingCut(smooth(u,0,.84),-130,11);
 const gridColour=colour('#8ac9ca','#baf6de',f);
 let grid='';
 for(let j=0;j<12;j++){
  const y=vanish.y+(680-vanish.y)*((j+1)/12)**1.8,startX=128+rand(j+28)*961,reach=15+825*f;
  grid+=P('M'+num(startX-reach)+' '+num(y)+'q'+num(reach)+' '+num(-13*(1-f))+' '+num(2*reach)+' 0q-'+num(reach)+' '+num(9*(1-f))+' -'+num(2*reach)+' 0Z','none',st(j%2?'#e7afd4':gridColour,1.6));
 }
 for(let j=-9;j<=9;j++){
  const end=point(600+j*161,683),start=between(end,vanish,f);
  grid+=P('M'+xy(end)+'Q'+num(mixN(end.x,start.x,.55)+22*(1-f))+' '+num(mixN(end.y,start.y,.55))+' '+xy(start),'none',st(gridColour,1.8));
 }
 const tint='<defs>'+grad('neon-fade',['#8877aa','#dc9cbd','#f5ccaa'])+'</defs>'+R(0,0,1200,675,'url(#neon-fade)','opacity=".38"');
 m.glaze=opacity(tint,Math.sin(pi*u));m.surface=opacity(grid,Math.sin(pi*u)**.59);
 m.ground=horizonCut(smooth(u,.18,.85),vanish.y);m.skin=figureCut(m,smooth(u,.41,.80));
}
function windowBreak(m){
 const {u}=m,jitter=Math.floor(m.t*13),split=Math.sin(pi*u),open=smooth(u,.07,.9);
 m.sky=tiledCut(open,5,15,(x,y,j)=>.62*rand(7+y)+.07*rand(j));
 let strips='';
 const capture=fixedDrawing('frozen-desktop',()=>{
  const c=journeyParts(20,6);c.bird='';c.road='';return assemblePlate(20,6,c);
 });
 const redOnly=[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0];
 const blueGreen=[0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];
 const film='<defs><g id="stuck-window">'+capture+'</g></defs>',buffer='<use href="#stuck-window"/>';
 const colors=filterPlate(buffer,redOnly,'buffer-red')+G(filterPlate(buffer,blueGreen,'buffer-cyan'),'transform="translate('+num(split*(10+3*Math.sin(jitter)))+' 0)" style="mix-blend-mode:screen"');
 const memory='<defs><g id="chroma-memory">'+colors+'</g></defs>';
 for(let j=0;j<16;j++){
  const y=j*43,dx=(rand(j*13+jitter)-.5)*113*split,dy=(j%3-1)*3*split;
  strips+=graphicWindow(dx,y+dy,1200,43,'<use href="#chroma-memory"/>','0 '+y+' 1200 43');
 }
 m.background=m.fresh.back+clipArt(film+memory+strips,m.sky,'dropped-rows',true);
 m.old.top='';m.ground=tiledCut(smooth(u,.17,.82),6,15,(x,y,j)=>.57*rand(y)+x*.025);
 m.skin=figureCut(m,smooth(u,.41,.82),'blocks');
 m.marks=opacity(rep(10,j=>R(rand(j+jitter)*1060,75+rand(j+29)*462,38+rand(j+15)*125,3,j%2?'#f09dbc':'#7df1db')),split*.81);
}
function registerCanvas(m){
 const {u,pose}=m,p=smooth(u,.015,.88);
 m.sky=tiledCut(p,8,8,(x,y,j)=>.075*Math.abs(x-3.5)+.088*Math.abs(y-3)+.093*rand(j));
 const id='return-sheet',tiles=[];
 for(let j=0;j<48;j++){
  const col=j%8,row=Math.floor(j/8),x=col*150,y=row*112.5,delay=.025*Math.abs(col-3)+.045*Math.abs(row-2);
  const fit=smooth(u,delay,delay+.64);
  if(fit===0)continue;
  const dx=(rand(j+21)-.5)*208*(1-fit),dy=(rand(j+58)-.5)*130*(1-fit);
  const tile=graphicWindow(x,y,150.06,112.56,'<use href="#'+id+'"/>',[x,y,150.06,112.56].join(' '));
  tiles.push(opacity(G(tile+' '+opacity(R(x,y,150,112.5,'none',st(j%2?'#91cec3':'#bf92a9',1.4)),1-fit),
   'transform="translate('+num(dx)+' '+num(dy)+') rotate('+num((rand(j+73)-.5)*25*(1-fit))+' '+(x+75)+' '+(y+56)+')"'),fit));
 }
 m.background=m.old.back+'<defs><g id="'+id+'">'+m.fresh.back+'</g></defs>'+tiles.join('');
 m.ground=tiledCut(smooth(u,.15,.81),8,8,(x,y,j)=>.057*Math.abs(x-4)+.06*(7-y)+.08*rand(j));
 m.skin=figureCut(m,smooth(u,.44,.82),'blocks');
 m.surface=opacity(rep(19,j=>{const a=(j/18-.5)*1190,p=between(point(pose.x+a*.62,pose.y-142+Math.sin(j*5)*143),point(40+j*62,529),smooth(u,.06,.7));
  const length=10+35*smooth(u,.05,.76);return L(p.x,p.y,p.x+length,p.y+(1-u)*((j%3)-1)*8,colour(j%2?'#76d4c5':'#c193b2','#8d9688',u),2)}),Math.sin(pi*u)*.77);
}
const changes=[openingPrint,posterNight,railwayDawn,castleSchool,campusBlossom,dialogueBubble,candyStage,relightStreet,celToCinema,streetPhotograph,pressTelemetry,mechanismDrawing,xuanFromGrid,riverToWoodblock,woodblockRelief,moonToBrush,brushToDots,comicSpray,aerosolPixels,pixelsInRain,puddlesToGrid,windowBreak,registerCanvas];

