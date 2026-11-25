"use strict";
const INK="#162d40", NIGHT="#132236", PAPER="#f6f5ed", WHITE="#fffef8";
const BLUE="#82c3e6", DEEP="#357ba3", SKY="#46b0df", SUN="#ffda55", MIST="#d8eaf0";
const dropOrigin={x:488,y:509};
const MINCHO='"Shippori Mincho B1 Medium","Source Han Serif","MS PMincho",serif';
const DISPLAY='"A-OTF A1 Mincho Std Bold","Source Han Serif Heavy","MS PMincho",serif';
const JP='"Yu Gothic","Noto Sans SC",sans-serif';
const SANS='"Bahnschrift","Arial",sans-serif', COND='"DIN Engschrift Std","Bahnschrift Condensed","Impact",sans-serif';
const LATIN='"EB Garamond","Georgia",serif', MONO='"Consolas","Courier New",monospace';
const PI=Math.PI, TAU=PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t, frac=x=>x-Math.floor(x), mod=(v,n)=>((v%n)+n)%n;
const ease=x=>1-(1-clamp(x))**3, smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const back=x=>{x=clamp(x)-1;return 1+2.38*x*x*x+1.38*x*x};
const span=(x,a,b)=>clamp((x-a)/(b-a));
const rnd=n=>frac(Math.sin(n*91.731+13.147)*43758.5453);
const pad=n=>String(n).padStart(2,"0");
const rgba=(c,a)=>{const h=parseInt(c.slice(1),16);return "rgba("+[h>>16,(h>>8)&255,h&255,clamp(a)].join(",")+")"};
function blend(a,b,p){
  const aa=parseInt(a.slice(1),16),bb=parseInt(b.slice(1),16);
  return "#"+[16,8,0].map(n=>Math.round(mix(aa>>n&255,bb>>n&255,clamp(p))).toString(16).padStart(2,"0")).join("");
}
function timecode(t){
  const cs=Math.floor(t*100+.0001);
  return pad(Math.floor(cs/6000))+":"+pad(Math.floor(cs/100)%60)+"."+pad(cs%100);
}
let g, time=0, local=0, cut=1, beat=0, kick=0, energy=0, air=0, shown=new Set();
const scenes={}, sprites={}, patterns=new Map(), proofFrames=[];
let grainTile;
function surface(width,height){const c=document.createElement("canvas");c.width=width;c.height=height;return c}
function rect(x,y,w,h,c,edge=null,sw=1){
  if(c){g.fillStyle=c;g.fillRect(x,y,w,h)}
  if(edge){g.strokeStyle=edge;g.lineWidth=sw;g.strokeRect(x,y,w,h)}
}
function roundBox(x,y,w,h,r,c,edge=null,sw=1){
  g.beginPath();g.roundRect(x,y,w,h,r);paint(c,edge,sw)
}
function paint(c,edge=null,sw=1){
  if(c){g.fillStyle=c;g.fill()}if(edge){g.strokeStyle=edge;g.lineWidth=sw;g.stroke()}
}
function circ(x,y,r,c,edge=null,sw=1){
  if(r<=0)return;g.beginPath();g.arc(x,y,r,0,TAU);paint(c,edge,sw)
}
function ellipse(x,y,rx,ry,c,edge=null,sw=1,angle=0){
  if(rx<=0||ry<=0)return;g.beginPath();g.ellipse(x,y,rx,ry,angle,0,TAU);paint(c,edge,sw)
}
function arc(x,y,r,a,b,c,w=1){if(r<=0)return;g.beginPath();g.arc(x,y,r,a,b);paint(null,c,w)}
function line(x1,y1,x2,y2,c,w=1){g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);paint(null,c,w)}
function path(points,c,edge=null,sw=1,closed=true){
  if(!points.length)return;g.beginPath();g.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);
  if(closed)g.closePath();paint(c,edge,sw)
}
function place(x,y,fn,angle=0,sx=1,sy=sx){
  g.save();g.translate(x,y);if(angle)g.rotate(angle);g.scale(sx,sy);fn();g.restore()
}
function opacity(a,fn){if(a<=0)return;g.save();g.globalAlpha*=clamp(a);fn();g.restore()}
function clipBox(x,y,w,h,fn){if(w<=0||h<=0)return;g.save();g.beginPath();g.rect(x,y,w,h);g.clip();fn();g.restore()}
function clipCircle(x,y,r,fn){if(r<=0)return;g.save();g.beginPath();g.arc(x,y,r,0,TAU);g.clip();fn();g.restore()}
function clipPolygon(pts,fn){g.save();path(pts,null);g.clip();fn();g.restore()}
function txt(s,x,y,size,c=INK,opt={}){
  g.font=(opt.style?opt.style+" ":"")+(opt.weight?opt.weight+" ":"")+size+"px "+(opt.font||SANS);
  g.textAlign=opt.align||"left";g.textBaseline="alphabetic";g.letterSpacing=(opt.track||0)+"px";
  if(opt.stroke){g.lineWidth=opt.sw||1;g.strokeStyle=opt.stroke;g.strokeText(s,x,y)}
  if(c){g.fillStyle=c;g.fillText(s,x,y)}g.letterSpacing="0px";
}
function label(s,x,y,size=10,c=INK,align="left",track=1.8){txt(s,x,y,size,c,{align,font:SANS,track,weight:600})}
function num(s,x,y,size,c=INK,align="left"){txt(s,x,y,size,c,{font:MONO,align})}
function ruleLabel(s,x,y,w,c=INK){line(x,y-4,x+w,y-4,c);label(s,x+w+10,y,10,c)}
function smallCapsule(s,x,y,w,ink=INK,bg=null){
  roundBox(x,y,w,22,11,bg,ink,.9);label(s,x+w/2,y+15,9,ink,"center",1.45)
}
function gradient(x0,y0,x1,y1,stops){const q=g.createLinearGradient(x0,y0,x1,y1);stops.forEach(([n,c])=>q.addColorStop(n,c));return q}
function glow(x,y,r,c,a){const q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,rgba(c,a));q.addColorStop(1,rgba(c,0));rect(x-r,y-r,r*2,r*2,q)}
function texture(type,c,p=16,detail=1){
  const key=[type,c,p,detail].join("|");if(patterns.has(key))return patterns.get(key);
  const dim=Math.max(2,Math.round(type==="check"?p*2:p)),tile=surface(dim,dim),k=tile.getContext("2d");
  k.fillStyle=k.strokeStyle=c;k.lineWidth=detail;
  if(type==="dot"){k.beginPath();k.arc(dim*.5,dim*.5,detail,0,TAU);k.fill()}
  if(type==="grid"||type==="hatch-h"){k.fillRect(0,0,dim,detail)}
  if(type==="grid"||type==="hatch-v"){k.fillRect(0,0,detail,dim)}
  if(type==="diag"){for(let i=-1;i<=1;i++){k.beginPath();k.moveTo(dim*i,dim);k.lineTo(dim*(i+1),0);k.stroke()}}
  if(type==="cross"){k.fillRect(dim/2-2,dim/2-.5,4,1);k.fillRect(dim/2-.5,dim/2-2,1,4)}
  if(type==="check"){k.fillRect(0,0,p,p);k.fillRect(p,p,p,p)}
  const pat=g.createPattern(tile,"repeat");
  if(patterns.size>=220)patterns.delete(patterns.keys().next().value);
  patterns.set(key,pat);return pat;
}
function pattern(type,col,p,d,x=0,y=0,w=W,h=H,dx=0,dy=0){
  const pat=texture(type,col,p,d);g.save();g.translate(dx,dy);rect(x-dx,y-dy,w,h,pat);g.restore();
}
function makeGrain(){
  const tile=surface(192,192),k=tile.getContext("2d"),px=k.createImageData(192,192);
  let s=72917;for(let i=0;i<px.data.length;i+=4){s=(s*1664525+1013904223)>>>0;const n=s>>>24;
    px.data[i]=px.data[i+1]=px.data[i+2]=n>124?250:23;px.data[i+3]=5+(n%12)}
  k.putImageData(px,0,0);return tile;
}
let grainPattern;
function dust(){if(!grainTile)grainTile=makeGrain();if(!grainPattern)grainPattern=g.createPattern(grainTile,"repeat");rect(0,0,W,H,grainPattern)}
function star(x,y,r,c,rot=0,shape=4){
  if(r<=0)return;const pts=[];
  for(let i=0;i<shape*2;i++){
    const a=rot-PI/2+i*PI/shape,rr=i%2?r*(shape===4?.22:.43):r;
    pts.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr]);
  }path(pts,c)
}
function cross(x,y,r=6,c=INK){line(x-r,y,x+r,y,c,.9);line(x,y-r,x,y+r,c,.9)}
function target(x,y,r,c=INK){circ(x,y,r,null,c,1);cross(x,y,r*1.65,c);circ(x,y,1.5,c)}
function barcode(x,y,w,h,c=INK){
  let xx=x,n=0;while(xx<x+w){let ww=1.15*(1+Math.floor(rnd(n+442)*3));rect(xx,y,Math.min(ww,x+w-xx),h,c);xx+=ww+1.15*(1+(n%4===0));n++}
}
function ruler(x,y,w,c=INK,n=64,dir=1){
  line(x,y,x+w,y,c,.8);
  for(let i=0;i<=n;i++){const h=i%8===0?10:i%4===0?6:3;line(x+i*w/n,y,x+i*w/n,y+h*dir,c,.85)}
}
function dial(x,y,r,c,count=90,angle=0){
  g.save();g.translate(x,y);g.rotate(angle);g.beginPath();
  for(let i=0;i<count;i++){const a=i*TAU/count,k=i%5===0?9:3;
    g.moveTo(Math.cos(a)*(r-k),Math.sin(a)*(r-k));g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}
  paint(null,c,1);g.restore()
}
function ringType(s,x,y,r,size,c,start=-PI/2,sweep=TAU,opts={}){
  if(r<1)return;
  const chars=Array.from(s), step=sweep/chars.length;
  g.save();g.translate(x,y);g.rotate(start);
  g.font=(opts.weight||500)+" "+size+"px "+(opts.font||SANS);g.textAlign="center";g.textBaseline="alphabetic";
  for(const ch of chars){g.save();g.translate(r,0);g.rotate(PI/2);g.fillStyle=c;g.fillText(ch,0,0);g.restore();g.rotate(step)}
  g.restore()
}
function marquee(y,h,t,bg,fg,copy="HITOS HIZUKU",speed=85){
  rect(0,y,W,h,bg);const word=copy+"     ◆     ";const size=h*.51;
  g.font="600 "+size+"px "+SANS;g.letterSpacing="2.3px";const ww=g.measureText(word).width;g.letterSpacing="0px";
  for(let x=-mod(t*speed,ww);x<W;x+=ww)txt(word,x,y+h*.70,size,fg,{track:2.3,font:SANS,weight:600});
}
function wave(x,y,w,h,from,duration,c,width=1.2,n=150){
  const pts=[];for(let i=0;i<=n;i++){const amp=signal(from+i/n*duration);pts.push([x+w*i/n,y+(i%2?1:-1)*amp*h])}
  path(pts,null,c,width,false)
}
function regCorner(x,y,dx,dy,c,len=13){
  line(x,y,x+dx*len,y,c,1.2);line(x,y,x,y+dy*len,c,1.2)
}
function labelTag(id,x,y,w=205,ink=INK,bg=PAPER){
  const m=band[id];rect(x,y,w,34,bg,ink,.9);rect(x,y,34,34,ink);
  num(m.number,x+17,y+22,14,bg,"center");txt(m.jp,x+45,y+23,16,ink,{font:MINCHO});
  txt(m.part,x+w-11,y+23,17,ink,{font:LATIN,style:"italic",align:"right"})
}
const imagesReady=Promise.all(Object.keys(band).map(async id=>{
  const load=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("Cannot open "+src));im.src=src});
  const [original,print]=await Promise.all([load("素材/角色立绘/"+id+".png"),load("art/"+id+"-print.webp")]);
  sprites[id]={original,print};
}));
function silhouette(im,c){
  const out=surface(im.width,im.height),k=out.getContext("2d");k.drawImage(im,0,0);
  k.globalCompositeOperation="source-in";k.fillStyle=c;k.fillRect(0,0,out.width,out.height);return out;
}
function fixedRaster(image){
  // Decode each plate at native size once. Drawing an Image at several scales
  // can otherwise make Chrome select a different decoder subsample on a seek.
  const c=surface(image.width,image.height);c.getContext("2d").drawImage(image,0,0);return c
}
function raisedStick(original){
  const left=.682,top=0,w=Math.ceil(original.width*.131),h=Math.ceil(original.height*.296);
  const stamp=surface(w,h),k=stamp.getContext("2d");
  // A polygon follows the raised wrist and cuff; the face and cymbal are on
  // different sides of the silhouette and must stay out of the insert.
  const contour=[[.685,0],[.715,0],[.753,.139],[.764,.142],[.781,.175],
    [.779,.196],[.799,.208],[.811,.267],[.783,.292],[.748,.272],
    [.733,.234],[.733,.209],[.719,.177],[.724,.150]];
  k.beginPath();contour.forEach(([x,y],i)=>{
    const xx=(x-left)*original.width,yy=(y-top)*original.height;
    if(i)k.lineTo(xx,yy);else k.moveTo(xx,yy)
  });
  k.closePath();k.clip();k.drawImage(original,-left*original.width,-top*original.height);
  return {image:stamp,tipX:(.700-left)*original.width,tipY:.004*original.height}
}
function prepareSprites(){
  Object.entries(sprites).forEach(([id,sp])=>{
    sp.original=fixedRaster(sp.original);sp.print=fixedRaster(sp.print);
    const im=sp.original,w=im.width,h=im.height,mask=silhouette(im,WHITE);
    sp.sil=silhouette(im,band[id].ink);sp.light=silhouette(im,band[id].color);
    sp.white=mask;sp.dark=silhouette(im,INK);
    const sticker=surface(w,h),k=sticker.getContext("2d"),r=Math.max(5,h*.0057);
    for(let i=0;i<12;i++)k.drawImage(sp.dark,Math.cos(i*TAU/12)*r+r*.60,Math.sin(i*TAU/12)*r+r*.83);
    for(let i=0;i<12;i++)k.drawImage(mask,Math.cos(i*TAU/12)*r,Math.sin(i*TAU/12)*r);
    k.drawImage(im,0,0);sp.sticker=sticker;
    if(id==="taki")sp.stick=raisedStick(im);
  })
}
function person(id,cx,top,height,look="original"){
  if(!sprites[id]||height<.01)return;const im=sprites[id][look]||sprites[id].original;
  const ww=height*im.width/im.height;g.drawImage(im,cx-ww*.5,top,ww,height)
}
// A print crop keeps the head and instrument together. The drummer's wide plate
// has a different crop from the four standing musicians.
function portrait(id,x,y,w,h,look="sticker",part=.65,shift=0){
  const im=sprites[id][look]||sprites[id].original;
  const cropH=id==="taki"?Math.min(.96,part*1.35):part;
  let hh=Math.max(h/cropH,w/(im.width/im.height)*.85),ww=hh*im.width/im.height;
  const center=band[id].focus+shift;
  clipBox(x,y,w,h,()=>g.drawImage(im,x+w*.5-center*ww,y+h*.035,ww,hh))
}
function portraitDisc(id,x,y,r,look="sticker",bg=band[id].color,part=.56){
  circ(x,y,r+3,PAPER,INK,1);
  clipCircle(x,y,r,()=>{rect(x-r,y-r,2*r,2*r,bg);pattern("diag",rgba(WHITE,.38),9,1,x-r,y-r,2*r,2*r);
    portrait(id,x-r,y-r,2*r,2*r,look,part)});
}
function tape(x,y,w,rotation=0,col="#eee0bd"){
  place(x,y,()=>{const pts=[[-w/2,-10],[w/2,-10],[w/2-2,-6],[w/2,-3],[w/2-2,0],[w/2,4],[w/2-2,8],[w/2,10],[-w/2,10],[-w/2+2,5],[-w/2,1],[-w/2+2,-4]];
    path(pts,rgba(col,.83));clipPolygon(pts,()=>pattern("hatch-v",rgba(WHITE,.55),5,.8,-w/2,-10,w,20))},rotation)
}
// These two sliding type layouts reuse native-resolution printing plates.
 // Fixed glyph origins keep Chrome's subpixel font cache out of the motion.
const slidingType=new Map();
function printGlyph(ch,x,y,size,ink,style,stroke,cached){
  if(!cached){
    if(stroke)txt(ch,x,y,size,null,{...style,stroke:ink,sw:stroke});
    else txt(ch,x,y,size,ink,style);
    return
  }
  const key=[ch,size,style.font,style.weight||"",ink,stroke].join("|");
  let plate=slidingType.get(key);
  if(!plate){
    const resolution=3,bitmap=surface(Math.ceil(size*1.28*resolution),Math.ceil(size*1.5*resolution));
    const k=bitmap.getContext("2d",{willReadFrequently:true});
    const origin=bitmap.width/(2*resolution),baseline=Math.ceil(size*1.12*resolution)/resolution;
    k.scale(resolution,resolution);
    k.font=(style.weight?style.weight+" ":"")+size+"px "+style.font;
    k.textAlign="center";k.textBaseline="alphabetic";k.lineJoin="round";
    if(stroke){k.strokeStyle=ink;k.lineWidth=stroke;k.strokeText(ch,origin,baseline)}
    else{k.fillStyle=ink;k.fillText(ch,origin,baseline)}
    plate={bitmap,origin,baseline,resolution};slidingType.set(key,plate)
  }
  const {bitmap,origin,baseline,resolution}=plate;
  g.drawImage(bitmap,x-origin,y-baseline,bitmap.width/resolution,bitmap.height/resolution)
}
function sung(i){return clamp((time-i.at)/i.fillTime)}
function glyph(i,x,y,size,fg,opts={}){
  if(i.ch===" ")return;const f={font:opts.font||MINCHO,weight:opts.weight,align:"center"};
  const on=opts.ink===undefined?sung(i):opts.ink;
  if(on<1||opts.onlyOutline)printGlyph(i.ch,x,y,size,opts.edge||fg,f,opts.sw||Math.max(.8,size*.012),opts.wordSlide);
  if(!opts.onlyOutline&&on>0){
    const ink=opts.hot&&time>=i.at&&time<i.release?opts.hot:fg;
    if(on>.985)printGlyph(i.ch,x,y,size,ink,f,0,opts.wordSlide);
    else clipBox(x-size*.6,y-size*1.10,size*1.2*on,size*1.43,()=>printGlyph(i.ch,x,y,size,ink,f,0,opts.wordSlide));
  }
}
function lyric(id,x,y,size,opts={}){
  const data=lyrics[id],items=data.chars.slice(opts.first||0,opts.last??data.chars.length);
  if(!items.length)return;shown.add(id);
  const isVert=opts.vertical,spacing=opts.spacing??size*(isVert?.99:1.01);
  let xx=x,yy=y;
  if(!isVert){if(opts.align==="center")xx-=spacing*(items.length-1)/2;else if(opts.align==="right")xx-=spacing*(items.length-1)}
  const col=opts.c||INK;
  items.forEach((item,k)=>{
    const flight=opts.wordSlide?item.wordAt:item.at;
    const drift=opts.slide?(1-ease((time-flight+.075)/.20))*opts.slide:0;
    const dx=xx+(isVert?0:k*spacing)+drift,dy=yy+(isVert?k*spacing:0)+(opts.dy?opts.dy(k):0);
    glyph(item,dx,dy,size,col,{...opts,font:opts.font||(data.harmony?JP:MINCHO)});
  })
}
function arcLyric(id,x,y,r,start,end,size,col=INK,opts={}){
  shown.add(id);const items=lyrics[id].chars.slice(opts.first||0,opts.last??lyrics[id].chars.length);
  items.forEach((i,k)=>{const a=mix(start,end,k/Math.max(1,items.length-1))+(opts.slideArc||0)*(1-ease((time-i.at+.13)/.23));
    place(x+Math.cos(a)*r,y+Math.sin(a)*r,()=>glyph(i,0,0,size,col,{font:lyrics[id].harmony?JP:MINCHO,...opts}),opts.upright ? .12*Math.sin(a+PI/2) : a+PI/2)})
}
function lyricStrip(id,x,y,w,opt={}){
  const d=lyrics[id],c=opt.c||INK,bg=opt.bg||PAPER,sz=opt.size||Math.min(29,(w-36)/(d.chars.length+.5)),h=sz*1.75;
  rect(x,y,w,h,bg,opt.border||null);rect(x,y,4,h,opt.accent||BLUE);
  lyric(id,x+w/2,y+h*.69,sz,{align:"center",c,hot:opt.hot,spacing:sz*(d.harmony?1.16:1.02),font:d.harmony?JP:MINCHO});
}
function currentLine(t){
  for(let n=lyrics.length-1;n>=0;n--)if(t>=lyrics[n].start&&t<lyrics[n].end)return n;return -1
}
function hud(t,id,dark=false){
  const c=dark?WHITE:INK,sec=sectionAt(t),tc=id===28?58.544:id===35?78.87:t>=81.33?81.43:t;
  const a=id===1?mix(.35,1,ease(t/.55)):1,len=12*a;
  if(id>=23&&id<=27){
    const field=rgba(NIGHT,.87);
    rect(36,17,190,20,field);rect(1117,17,128,20,field);
    rect(36,678,184,21,field);rect(1148,678,97,21,field)
  }
  [[20,18,1,1],[1260,18,-1,1],[20,702,1,-1],[1260,702,-1,-1]].forEach(p=>regCorner(...p,c,len));
  if(id===1&&t<.62){label("HITOSHIZUKU   /   MyGO!!!!!".slice(0,Math.floor(26*(.2+.8*ease(t/.62)))),43,30,9,c)}
  else label("HITOSHIZUKU   /   MyGO!!!!!",43,30,9,c,"left",1.65);
  label("CUT",1150,30,8,c,"right");num(pad(id)+" / 36",1237,31,12,c,"right");
  const times=id===28?0:id===35?78.87:t,idx=mod(Math.floor((times-.045)/(BEAT/2)),8);
  for(let i=0;i<8;i++)rect(43+i*8,684,5,9,i<=idx?(id>=7&&id<=11?band[posterOrder[id-7]].ink:c):rgba(c,.20));
  label(sections[sec][1].toUpperCase(),121,693,9,c);
  num(timecode(tc),1237,693,12,c,"right");
}
function isNight(id,t){
  return [10,19,20,21,22,23,24,25,26,27].includes(id)||(id===17 && t>=32.387&&t<32.92)||(id===28&&t<59.78)
}
const primedSurfaces=new WeakMap();
function renderAt(context,t,w,h,options={}){
  // Chrome can promote a fresh 2D surface when it first receives a canvas
  // sprite. Prime it before the paper pass so fine lines rasterize identically
  // on a direct seek, a fresh export, and a frame revisited in reverse order.
  const dimension=context.canvas.width+"x"+context.canvas.height;
  if(primedSurfaces.get(context)!==dimension&&sprites.tomori?.sticker){
    context.save();context.setTransform(1,0,0,1,0,0);context.drawImage(sprites.tomori.sticker,0,0,1,1);context.restore();
    primedSurfaces.set(context,dimension)
  }
  const previous=[g,time,local,cut,beat,kick,energy,air,shown];
  g=context;time=t;cut=options.cut||cutAt(t);local=t-CUTS[cut-1];beat=(t-.045)/BEAT;
  kick=Math.exp(-6*frac(beat));energy=signal(t);air=signal(t,2);shown=new Set();
  g.save();g.setTransform(w/W,0,0,h/H,0,0);g.globalAlpha=1;g.globalCompositeOperation="source-over";
  g.lineJoin="round";g.lineCap="butt";g.imageSmoothingEnabled=true;g.imageSmoothingQuality="medium";
  rect(0,0,W,H,PAPER);scenes[cut](options);
  const active=currentLine(t);
  if(active!==-1&&!shown.has(active)&&cut!==27){
    const d=lyrics[active],ww=Math.min(930,d.chars.length*(d.harmony?30:32)+74),dark=isNight(cut,t);
    lyricStrip(active,(W-ww)/2,609,ww,{bg:dark?"#23374c":PAPER,c:dark?WHITE:INK,size:d.harmony?22:27,accent:d.harmony?band.anon.color:BLUE});
  }
  if(!options.cleanFan&&typeof transitionLayer==="function")transitionLayer(t,cut);
  if(cut===29&&t>=60.05&&t<60.05+1/60)rect(0,0,W,H,"#ffffff");
  else{
    if(options.grain!==false)dust();
    if(options.hud!==false)hud(t,cut,isNight(cut,t))
  }
  g.restore();[g,time,local,cut,beat,kick,energy,air,shown]=previous;
}

