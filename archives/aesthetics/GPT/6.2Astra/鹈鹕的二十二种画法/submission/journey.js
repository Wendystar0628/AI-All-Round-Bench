// A route is measured in drawing units along its centre line. One pedal revolution
// advances 2π × the driven tyre radius × the transmission ratio.
const rad=Math.PI/180,turn=Math.PI*2;
const V=(x=0,y=0,z=0)=>({x,y,z}),plus=(a,b)=>V(a.x+b.x,a.y+b.y,a.z+b.z),times=(a,k)=>V(a.x*k,a.y*k,a.z*k),minus=(a,b)=>plus(a,times(b,-1)),dot3=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const mixN=(a,b,u)=>a+(b-a)*u,num=v=>Math.round(v*100)/100;
const xy=p=>num(p.x)+' '+num(p.y);
const contour=pts=>'M'+pts.map(xy).join('L')+'Z';
const polygon=(pts,col,attr='')=>P(contour(pts),col,attr);
// yaw, elevation, magnification, fraction of travel followed, composition centre,
// road half width, bend amplitude, bend wavelength, grade, rear/front tyre, wheelbase, gearing
const shotData=[
 [-12,12,1.08,.60,717,499,100,4,590,.16,55,55,200,1.13],
 [0,5,.49,.95,542,467,75,2,760,0,57,57,227,1.36],
 [-44,54,.36,.73,565,447,88,36,330,.035,49,49,178,1.08],
 [82,20,.76,.30,602,454,268,7,850,0,52,52,178,.95],
 [-7,8,1.10,.94,319,521,161,3,640,.032,50,52,191,.96],
 [-36,42,.93,.87,570,447,130,42,255,.005,34,34,139,1.22],
 [86,12,.78,.23,587,455,177,4,720,0,53,53,194,1.06],
 [0,4,1.05,1,580,515,145,0,600,.045,51,51,214,1.42],
 [64,-3,.57,0,562,452,175,4,750,0,54,54,204,1.00],
 [0,9,.51,0,575,485,49,21,275,.026,44,66,150,.99],
 [-38,49,.75,.52,542,445,128,17,645,.015,49,49,187,1.04],
 [0,0,.48,0,555,415,56,0,620,0,54,54,203,1.04],
 [19,21,.28,.15,587,529,49,35,214,-.09,54,53,182,.92],
 [177,6,.48,.06,590,452,101,7,650,0,54,55,190,1.08],
 [-14,13,.84,.74,567,490,89,14,380,.03,52,52,188,.98],
 [-60,12,.81,.03,612,471,112,16,490,.025,55,55,193,.92],
 [3,5,.88,.53,576,478,89,8,400,.04,55,55,193,1.05],
 [0,7,.90,.93,657,522,110,0,650,0,58,45,216,1.18],
 [0,0,.91,1,480,504,100,0,650,0,56,56,204,1],
 [60,51,.48,.4,563,380,188,12,770,0,56,56,201,1.16],
 [-77,22,.74,.06,519,475,280,0,680,0,54,54,192,.98],
 [35,24,.89,.62,578,467,104,27,290,.015,54,54,197,1.04]
];
const routeSpecs=shotData.map(([yaw,pitch,scale,follow,cx,cy,width,bend,wave,grade,r,r2,base,gear],i)=>({i,yaw,pitch,scale,follow,cx,cy,width,bend,wave,grade,r,r2,base,gear}));
const rimEntry=[];
let nextRim=[0,0];
for(const q of routeSpecs){
 rimEntry.push(nextRim);
 nextRim=[q.r,q.r2].map((r,j)=>(nextRim[j]+6*turn*q.r*q.gear/r)%turn);
}
function ridingClock(i,t){
 if(i===18)return Math.floor(t*8+1e-8)/8;
 if(i===19)return cityPedalTime(t);
 if(i===20&&t>=2&&t<4)return 2+Math.min(.25,(t-2)%.5);
 if(i===21){if(t>=2.5&&t<3.2)return 2.5;return Math.floor((t-(t>=3.2?.7:0)+.7*ease((t-4.7)/1.3))*12+1e-8)/12}
 if(i===8)return t-clamp(t-3.86,0,.48)+.48*ease((t-4.34)/1.66);
 return t;
}
function routeBasis(q,s){
 let heading=q.bend*rad*Math.sin(s/q.wave+.6*q.i),grade=q.grade;
 if(q.i===0){const c=s/(turn*q.r*q.gear);heading+=24*rad*ease((c-1.58)/.53)*(1-ease((c-2.25)/.72))}
 if(q.i===9){const bend=.99*(ease((s-350)/140)-ease((s-584)/140))-.9*(ease((s-1335)/120)-ease((s-1585)/120));grade=Math.tan(bend)}
 if(q.i===12)grade+=.17*Math.sin(s/155);
 if(q.i===15)grade+=.22*Math.cos((s-800)/245);
 const h=Math.cos(heading),k=Math.sin(heading),g=Math.atan(grade);
 return {f:V(h*Math.cos(g),Math.sin(g),k*Math.cos(g)),n:V(-h*Math.sin(g),Math.cos(g),-k*Math.sin(g)),b:V(-k,0,h)};
}
const gridStep=8,gridMin=-5500;
// Tabulate arc length with two-point Gauss integration. Hermite interpolation
// preserves tangent continuity between samples, including a turn on the page.
const paths3=routeSpecs.map(q=>{
 const step=q.i===0||q.i===9?2:gridStep;let points=[V()],tangents=[];
 for(let u=gridMin;u<10800;u+=step){
  tangents.push(routeBasis(q,u).f);
  const mid=u+step/2,k=step/(2*Math.sqrt(3));
  const delta=times(plus(routeBasis(q,mid-k).f,routeBasis(q,mid+k).f),step/2);
  points.push(plus(points.at(-1),delta));
 }
 tangents.push(routeBasis(q,gridMin+(points.length-1)*step).f);return {points,tangents,step};
});
function ground(q,s,b=0,h=0){
 const track=paths3[q.i],step=track.step,n=(s-gridMin)/step,j=Math.min(track.points.length-2,Math.max(0,Math.floor(n))),u=n-j;
 const a=track.points[j],z=track.points[j+1],m=track.tangents[j],k=track.tangents[j+1];
 const e=u*u*(3-2*u),v=u*(1-u)*(1-u)*step,w=-u*u*(1-u)*step;
 let p=V(mixN(a.x,z.x,e)+m.x*v+k.x*w,mixN(a.y,z.y,e)+m.y*v+k.y*w,mixN(a.z,z.z,e)+m.z*v+k.z*w);
 if(b||h){const frame=routeBasis(q,s);p=plus(p,plus(times(frame.b,b),times(frame.n,h)))}
 return p;
}
function takeShot(i,t,overrides={}){
 const q=routeSpecs[i],clock=ridingClock(i,overrides.motionTime??t),speed=turn*q.r*q.gear,s=overrides.distance??clock*speed;
 let {yaw,pitch,scale,follow,cx,cy}=q,roll=0;
 if(i===0){roll=-11;follow=.76;cx=679;cy=516;scale*=1+.20*ease((t-1.45)/.4)*(1-ease((t-3.5)/.55))}
 if(i===2){const swing=ease((t-1.65)/1.35);pitch=mixN(59,13,swing);yaw=mixN(-17,-43,swing)-q.bend*Math.sin(s/q.wave+.6*i);scale=mixN(.32,.75,swing);cy=467+59*swing}
 if(i===5)yaw=34;
 if(i===3){pitch=15;follow=.43;cy=428}
 if(i===6){pitch=10;scale=.94;follow=.59;cy=470;yaw=78-q.bend*Math.sin(s/q.wave+.6*i)}
 if(i===15){yaw=-42-q.bend*Math.sin(ridingClock(i,t)*speed/q.wave+.6*i);scale=.73;follow=.32;cx=586;cy=445}
 if(i===20){scale=.65;follow=.36;cy=432;pitch=13;yaw=-78-q.bend*Math.sin(s/q.wave+.6*i)}
 if(i===12)cy=707-283*ease(t/4.25);
 if(i===19){const dive=ease((t-1.02)/1.55);pitch=mixN(67,6,dive);scale=mixN(.32,.88,dive);cy=mixN(345,408,dive);follow=.75;yaw=mixN(29,58,dive)-q.bend*Math.sin(s/q.wave+.6*i)}
 if(i===21)roll=5*Math.sin(clock*1.4);
 const sceneryScale=scale,sceneryYaw=yaw;
 const orthographic=[0,1,5,7,9,10,11,12,13,17,18].includes(i);
 const mid=overrides.mid??3;
 const cameraTravel=ridingClock(i,t)*speed;
 const focus=ground(q,cameraTravel*follow+mid*speed*(1-follow)+q.base/2);
 const rear=ground(q,s),front=ground(q,s+q.base),basis=routeBasis(q,s+q.base*.5);
 const air=i===2?155*Math.sin(pi*clamp((t-1.78)/4.22)):0;
 const contact=plus(times(plus(rear,front),.5),times(basis.n,air));
 const heading=Math.atan2(basis.f.z,basis.f.x)/rad,lens=overrides.lens;
 if(lens){yaw=lens.bearing-heading;pitch=lens.pitch;roll=lens.roll}
 const az=yaw*rad,el=pitch*rad,cr=Math.cos(roll*rad),sr=Math.sin(roll*rad);
 const right=V(Math.cos(az),0,-Math.sin(az)),up=V(-Math.sin(az)*Math.sin(el),Math.cos(el),-Math.cos(az)*Math.sin(el)),eye=V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
 const focal=i===3||i===6?1010:1280;
 let distance=focal/scale;
 if(lens){
  scale=lens.k;
  distance=focal/scale+dot3(minus(contact,focus),eye);
 }
 function photograph(p){
  const d=minus(p,focus),depth=dot3(d,eye),k=orthographic?scale:focal/Math.max(130,distance-depth);
  const a=dot3(d,right)*k,b=-dot3(d,up)*k;
  return {x:cx+a*cr-b*sr,y:cy+a*sr+b*cr,k,depth,visible:orthographic||depth<distance-100};
 }
 if(lens){
  const aim=photograph(contact);
  cx+=lens.x-aim.x;cy+=lens.y-aim.y;
 }else if(t>4.75&&exitFraming[i]){
  const aim=photograph(contact),target=exitFraming[i],u=ease((t-4.75)/1.25);
  cx+=u*(target[0]-aim.x);cy+=u*(target[1]-aim.y);
 }
 // In the middle of a repaint both cameras use coordinates attached to the
 // wheelbase. This also matches an off-axis perspective view to a printed
 // orthographic view without leaving a second axle or wheel rim on the page.
 let register;
 if(lens&&lens.align>0){
  const chord=minus(front,rear),length=Math.hypot(chord.x,chord.y,chord.z);
  const f=times(chord,1/length),horizontal=Math.hypot(f.x,f.z);
  const b=V(-f.z/horizontal,0,f.x/horizontal);
  const n=V(-b.z*f.y,horizontal,b.x*f.y),az=lens.bearing*rad,sa=Math.sin(az),ca=Math.cos(az),se=Math.sin(el),ce=Math.cos(el);
  register=p=>{
   const d=minus(p,contact),X=dot3(d,f)*q.base/length,Y=dot3(d,n),Z=dot3(d,b);
   const a=X*ca-Z*sa,k=X*sa*se-Y*ce+Z*ca*se,depth=X*sa*ce+Y*se+Z*ca*ce;
   const near=865-depth*lens.filmScale,perspective=865/Math.max(160,near);
   return {x:lens.x+(a*cr-k*sr)*lens.kx*perspective,y:lens.y+(a*sr+k*cr)*lens.k*perspective,
    k:lens.k*perspective,depth,visible:near>145};
  };
 }
 function project(p){
  if(!register)return photograph(p);
  const a=register(p),f=lens.align;if(f>=1)return a;
  const b=photograph(p);
  return {x:mixN(b.x,a.x,f),y:mixN(b.y,a.y,f),k:mixN(b.k,a.k,f),depth:mixN(b.depth,a.depth,f),visible:f<.5?b.visible:a.visible};
 }
 const at=(d,b=0,h=0)=>project(ground(q,d,b,h));
 function local(x,y,z=0){return project(plus(rear,plus(times(minus(front,rear),x/q.base),plus(times(basis.n,244-y+air),times(basis.b,z)))))}
 const A=local(0,0),B=local(q.base,0),D=local(0,244);
 const matrix='matrix('+[ (B.x-A.x)/q.base,(B.y-A.y)/q.base,(D.x-A.x)/244,(D.y-A.y)/244,A.x,A.y].map(n=>+n.toFixed(5)).join(' ')+')';
 return {i,t,q,s,speed,clock,at,local,project,basis,eye,air,matrix,scale,focus,yaw,pitch,roll,bearing:yaw+heading,
  dr:s*follow*sceneryScale*Math.cos(sceneryYaw*rad),anchor:local(q.base/2,244)};
}
const roadInks=[
 [ink,paper,red],['#213141','#c39d62','#fae1a0'],['#c7b78d','#e8d599','#94a26e'],['#d7e7e8','#fff7df','#80b5c3'],
 ['#d4c2c9','#efdfd4','#b49ba9'],['#f4d6ae','#fcead1','#dfa9a4'],['#51496e','#8ad9de','#ec98cb'],['#b4aa99','#e9ddbf','#8f938a'],
 ['#a8b8ba','#e8e4cb','#8a9d9d'],['#d1c5a3','#79725e','#afa58c'],['#5b625c','#e4bc42','#2d3735'],['#285889','#beddf4','#79a9cf'],
 ['#acaa96','#c7c8b7','#666f62'],['#d7c19c','#394d55','#a48e71'],['#cdb993','#f2dfb6','#b59974'],['#aeb49b','#c9c7a3','#7a928a'],
 ['#e8c851',ink,'#ef6c55'],['#5b5662','#95868a','#393543'],['#84a053','#c9ca79','#a37553'],['#202c45','#63879c','#d578aa'],
 ['#7f80ab','#8ce3dd','#e3a9d4'],['#263b45','#70b9bc','#d189a9']
];
function roadSections(h){
 const {i,q,s,at}=h,[main,edge,mark]=roadInks[i],w=q.width,step=i===11?94:116,lo=Math.floor((s-3500)/step),hi=Math.ceil((s+5000)/step);
 const strips=[];
 for(let j=lo;j<=hi;j++){
  let a=j*step,b=a+step;if(i===3&&b<90)continue;if(i===3)a=Math.max(a,90);
  if(i===2){const start=1.85*h.speed+q.base*.67,end=6*h.speed;
   if(a>=start&&b<=end)continue;if(a<start&&b>start)b=start;else if(a<end&&b>end)a=end}
  const p=(u,v,height=0)=>at(u,v,height),A=p(a,-w),B=p(b,-w),D=p(a,w),E=p(b,w);
  const corners=[A,B,E,D];if(corners.some(v=>!v.visible)||corners.every(v=>v.x< -30)||corners.every(v=>v.x>1230)||corners.every(v=>v.y< -35)||corners.every(v=>v.y>710))continue;
  const band=(u,v,c)=>polygon([p(a,u),p(b,u),p(b,v),p(a,v)],c);
  let slab='';
  if([0,1,2,6,10,14,15,21].includes(i))slab+=polygon([D,E,p(b,w,-(i===2?54:12)),p(a,w,-(i===2?54:12))],i===2?'#889080':mark);
  if(i===1){slab+=band(-w,-w+7,edge)+band(w-6,w,edge)+polygon([p(a,-w-10),p(a+11,-w-10),p(a+11,w+10),p(a,w+10)],'#796a58')+
     band(-8,-3,'#ebd28d')+band(3,8,'#c6af79')}
  else if(i===11){
   slab+=P('M'+xy(p(a,0))+'L'+xy(p(b,0)),'none',st(edge,2))+P('M'+xy(p(a,-21))+'L'+xy(p(a,21)),'none',st(edge,1.2))+
   mt(A.x,A.y-5,String(Math.round(a)),10,mark);
  }else{
   let base=main;if(i===10&&j%2)base='#68716a';if(i===21&&j%5===0)base='#573f58';
   slab+=polygon(corners,base,'stroke="'+base+'" stroke-width="1"');
   slab+=band(-w,-w+5,edge)+band(w-5,w,edge);
   if(i===0)slab+=polygon([p(a+7,-w+5),p(b-9,-w+8),p(a+36,w-8)],red);
   else if(i===6||i===20){for(let z=-w*.5;z<=w*.6;z+=w*.5)slab+=band(z,z+2,edge);
    slab+=polygon([p(a,-w),p(a+2,-w),p(a+2,w),p(a,w)],mark)}
   else if(i===10){slab+=polygon([p(a+5,w-22),p(a+32,w-22),p(a+51,w-5),p(a+25,w-5)],'#ebc34a')+P('M'+xy(A)+'L'+xy(D),'none',st(mark,2))}
   else if(i===3||i===7||i===8)slab+=polygon([p(a+13,-w*.46),p(a+69,-w*.46),p(a+69,-w*.46+4),p(a+13,-w*.46+4)],'#f8eed8');
   else if(i===9)slab+=P('M'+xy(p(a,-w+4))+'L'+xy(p(a+11,w-4)),'none','stroke="'+mark+'" stroke-width="1" stroke-dasharray="3 3"');
   else{
    const cnt=i===15?9:4;
    for(let k=0;k<cnt;k++){let f=rand(j*9+k),v=(rand(j*29+k+21)*1.84-.92)*w;
     slab+=P('M'+xy(p(a+f*(b-a)*.66,v))+'L'+xy(p(a+f*(b-a)*.66+14+k*2,v+3)),'none',st(k%2?mark:edge,i===15?3:1.35))}
   }
  }
  strips.push({depth:(A.depth+B.depth+D.depth+E.depth)/4,slab});
 }
 return strips.sort((a,b)=>a.depth-b.depth).map(v=>v.slab).join('');
}
function objectAt(h,s,b,svg,scale=1,floor=0){
 const v=h.at(s,b,floor);if(!v.visible||v.x< -500||v.x>1650||v.y< -300||v.y>1050)return '';
 return G(svg,tr(v.x,v.y,v.k*scale));
}
function repeatedProps(h,spacing,lat,draw,scale=1){
 let items=[];const start=Math.floor((h.s-3000)/spacing),end=Math.ceil((h.s+4200)/spacing);
 for(let j=start;j<=end;j++){
  const d=j*spacing,p=h.at(d,lat);if(!p.visible||p.x< -280||p.x>1480||p.y< -120||p.y>870)continue;
  items.push([p.depth,G(draw(j),tr(p.x,p.y,p.k*scale))])
 }
 return items.sort((a,b)=>a[0]-b[0]).map(v=>v[1]).join('');
}
const tube=(h,points,c,w,extra='')=>P('M'+points.map(p=>xy(h.local(...p))).join('L'),'none',st(c,Math.max(.65,w*h.anchor.k))+' '+extra);
function badgeAt(h,x,y,z,r,c){const p=h.local(x,y,z);return C(p.x,p.y,r*p.k,c)}
function wheelArt(h,front){
 const {q,i}=h,ax=front?q.base:0,r=front?q.r2:q.r,d=h.s+ax;
 const lift=i===11?drawingSpread(h.t)*(front?28:-28):0;
 const center=ground(q,d+lift,0,r+h.air),v=routeBasis(q,d+lift),phase=(h.s+lift)/r+rimEntry[i][Number(front)];
 function pt(a,rr,side=0){if(h.studio)return h.local(ax+Math.sin(a)*rr,244-r-Math.cos(a)*rr,side);return h.project(plus(center,plus(times(v.b,side),plus(times(v.f,Math.sin(a)*rr),times(v.n,Math.cos(a)*rr)))))}
 const tire=i===0?ink:i===12?'#475144':i===14?'#eee0bf':i===11?'#cde9fa':i===20?'#c9b3d1':i===1?'#ccac70':i===19?'#75f0ed':i===16?ink:palettes[i][1];
 const hub=palettes[i][2],rimWidth=[0,6,10,16,17,19,21].includes(i)?7:4;
 const count=i===18?20:36,ring=(rr,side=0)=>Array.from({length:count},(_,j)=>pt(turn*j/count,rr,side));
 let w='';
 // Both sidewalls have a cutout; retain the tyre's breadth in head-on views.
 const annulus=(side,c)=>P(contour(ring(r,side))+contour(ring(r-rimWidth,side)),c,'fill-rule="evenodd"');
 w=annulus(-3,tire)+annulus(3,tire);
 for(let j=0;j<count;j+=2)w+=polygon([pt(j*turn/count,r,-3),pt((j+2)*turn/count,r,-3),pt((j+2)*turn/count,r,3),pt(j*turn/count,r,3)],tire);
 if(i===0)w+=P(contour(ring(r+1,3)),'none',st(paper,1.6*h.anchor.k))+P(contour(ring(r-5,3)),'none',st(red,1.3*h.anchor.k));
 const spokes=i===14?6:i===10?8:i===12?9:i===19?5:i===0?24:i===11?20:14;
 for(let j=0;j<spokes;j++){
  const a=phase+j*turn/spokes;
  if([6,10,14,19,20,21].includes(i))w+=polygon([pt(a,5,3),pt(a+.07,r-rimWidth,3),pt(a+.19,r-rimWidth,3),pt(a+.42,9,3)],i===6?'#ebb5df':i===19?'#bb78ac':tire);
  else w+=P('M'+xy(pt(a,4,3))+'L'+xy(pt(a+.12,r-rimWidth,3)),'none',st(i===0?ink:tire,Math.max(.75,h.anchor.k*(i===12?1.7:1.2))));
 }
 const valve=pt(phase+.61,r-5,4),axis=h.studio?h.local(ax,244-r,0):h.project(center);
 w+=C(valve.x,valve.y,Math.max(1.25,h.anchor.k*3),i===11?'#fff':hub)+C(axis.x,axis.y,Math.max(1.5,4.5*h.anchor.k),hub);
 if(i===19||i===6)w+=P(contour(ring(r-10,4)),'none',st(i===19?'#f3a2d0':'#fff2ad',2*h.anchor.k));
 return w;
}
function cycleArt(h){
 const {i,q,clock}=h,b=q.base,rear=[0,244-q.r,0],front=[b,244-q.r2,0];
 const saddle=[b*.25,i===5?132:87,0],crank=[b*.44,i===5?183:162,0],fork=[b*.83,i===5?138:103,0],bars=[b*.86,i===5?112:72,0];
 const edge=i===0?ink:palettes[i][1],paint=i===14?'#fbedd1':i===12?'#404a40':palettes[i][4],stroke=i===11?2:i===10?11:i===16||i===17?8:5;
 let metal='';
 function tubes(line){metal+=tube(h,line,edge,stroke+2)+tube(h,line,paint,stroke)}
 tubes([rear,crank,fork,front]);tubes([rear,saddle,crank]);tubes([fork,bars]);
 if([3,4,5,8,15,17].includes(i))tubes([saddle,[b*.43,crank[1]-13,0],[b*.7,crank[1]-26,0],fork]);
 else if(i===0||i===10||i===21){
  metal+=polygon([h.local(...saddle),h.local(...fork),h.local(b*.48,135,0)],paint,st(edge,2*h.anchor.k));
  metal+=tube(h,[[b*.4,100,1],[b*.58,116,1],[b*.7,102,1]],edge,2);
 }else tubes([saddle,fork]);
 const barWidth=[3,5,6,10,19,20].includes(i)?39:25;
 metal+=tube(h,[[bars[0]+8,bars[1]-3,-barWidth],bars,[bars[0]+8,bars[1]-3,barWidth]],edge,i===10?7:4)+
 polygon([h.local(saddle[0]-17,saddle[1]-3,-11),h.local(saddle[0]+16,saddle[1]-2,-5),h.local(saddle[0]+18,saddle[1]+3,8),h.local(saddle[0]-20,saddle[1]+4,10)],edge);
 const a=turn*clock,foot=(side)=>[crank[0]+Math.cos(a+(side<0?pi:0))*18,crank[1]+Math.sin(a+(side<0?pi:0))*18,side*13];
 let drive='';for(let side of [-1,1])drive+=tube(h,[crank,foot(side)],edge,3)+tube(h,[foot(side),[foot(side)[0]+11,foot(side)[1],side*15]],paint,4);
 metal+=badgeAt(h,...crank,9,edge)+badgeAt(h,...crank,4,paint);
 if(i===1)metal+=tube(h,[[0,158,0],[b*.09,139,0],[b*.39,141,0],[b*.68,113,0]],'#dab875',2);
 if(i===3||i===4){const basket=[[b*.85,86,-21],[b+13,86,-21],[b+13,86,21],[b*.85,86,21]];metal+=polygon(basket.map(p=>h.local(...p)),'#b6d4cf',st(edge,h.anchor.k*2))+tube(h,[[b*.85,86,21],[b*.91,112,17],[b+6,112,17],[b+13,86,21]],edge,2)+rep(4,j=>tube(h,[[b*.85+j*10,86,21],[b*.91+j*7,110,17]],edge,1))}
 if(i===2){metal+=tube(h,[bars,[b*.91,102,9]],'#856d45',2)+polygon([[b*.91-7,104,9],[b*.91+7,104,9],[b*.91+9,122,9],[b*.91-8,122,9]].map(p=>h.local(...p)),'#ffda87',st('#876d42',1.5))}
 if(i===10){metal+=polygon([[b*.3,94,6],[b*.73,106,6],[b*.56,134,6],[b*.35,127,6]].map(p=>h.local(...p)),'#e1bb47');const p=h.local(b*.38,113,7);metal+=mt(p.x,p.y,'07',Math.max(7,12*p.k),'#343d38')}
 if(i===12||i===13)metal+=rep(5,j=>tube(h,[[b*.32+j*12,98+j*1.4,1],[b*.32+j*12-2,104+j*1.4,2]],i===12?'#b4b4a1':'#b79c79',2));
 if(i===17){tubes([[0,166,0],[5,124,0],[b*.25,116,0]]);metal+=tube(h,[[8,123,0],[b*.26,115,0]],'#d78bbe',8)}
 if(i===19)metal+=tube(h,[rear,crank,fork],'#ff8ec1',3);
 const bell=h.local(bars[0]+4,bars[1]-5,barWidth);metal+=C(bell.x,bell.y,5*bell.k,palettes[i][2],st(edge,1));
 if(i===16){
  metal+=G(P('M-12 0q0 -14 12 -14q13 0 14 14Z','#f3c64b',st(ink,2.2))+P('M-7 -4q1 -6 6 -7','none',st('#fffbe2',2.7))+R(-13,0,29,4,ink,'rx="2"')+
    P('M13 1l7 -9','none',st(ink,2.2))+C(20,-8,2.6,ink),tr(bell.x,bell.y,bell.k));
 }
 return {svg:metal,drive,foot,bars,barWidth};
}
function plane(h,svg){return G(svg,'transform="'+h.matrix+'"')}
function sideBird(h){
 const {i,t}=h,[body,edge,bill,shade]=palettes[i];
 const paperBird=i===14,inkBird=i===12,collage=i===0,print=i===13;
 const line=i===16||i===17?5:collage?2.5:inkBird?1:2;
 let torso,head,wing;
 if(collage){
 torso=P('M-48 47L8 25L52 21L79 9L84 -42L99 -65L129 -66L145 -52L129 0L122 39L91 69L44 78L-24 55L-52 56L-31 48Z',ink,st(paper,2));
 wing=P('M-51 54L7 28L43 27L72 38L51 54L-9 63L-35 61L-18 54Z',ink,st(paper,2))+rep(6,j=>P('M'+(-32+j*8)+' '+(53+j%2*3)+'l70 -20l-30 13Z',paper));
 }else if(inkBird){
 torso=P('M-35 48Q4 42 29 26Q62 19 78 22Q98 5 86 -22Q81 -53 103 -61Q126 -72 142 -49Q121 -31 122 -3Q137 36 95 62Q54 86 -1 60Z','#c9cbb7')+
 P('M86 -20Q76 -63 106 -67Q136 -73 144 -49L137 -45Q125 -66 106 -58Q86 -49 93 -20Q113 18 84 37L80 34Q100 13 86 -20Z','#3f493e');
 wing=P('M-44 54Q2 40 17 30Q46 17 76 36Q69 57 13 62L-34 61L-13 54Z','#495448')+
 rep(10,j=>P('M'+(-34+j*4)+' '+(54+j*.5)+'q36 -10 70 -21l-17 10Z',j%2?'#c8cbb7':'#788373'));
 }else if(paperBird||i===21){
 torso=P('M-35 47L2 39L27 23L65 24L84 11L88 -7L81 -30L89 -52L103 -65L128 -64L145 -51L133 -28L126 -5L127 24L112 47L88 64L62 75L28 70L-37 55Z',paperBird?'#fff4d9':body,st(edge,1.5));
 wing=P('M-43 54L17 30L49 24L76 41L56 57L10 63L-30 59L-15 52Z',shade)+P('M-28 55L57 32L16 50Z',body);
 }else if(print){
 torso=P('M-39 52Q23 17 64 28Q94 22 85 -19Q75 -59 104 -66Q128 -73 143 -51Q117 -23 127 9Q135 45 87 66Q47 78 -39 52Z','#e1d6b7',st(edge,2.6));
 wing=P('M-40 54Q4 32 28 30Q60 25 74 43Q49 69 -31 59Z','#38596b',st(edge,1.6))+
 rep(8,j=>P('M'+(-27+j*6)+' '+(54+j%3)+'q27 -3 55 -19','none',st('#cfbf9b',1.45)));
 }else{
 torso=P(i===9?'M-39 49Q13 30 34 19Q71 17 83 8Q88 -5 79 -25Q75 -54 103 -65Q132 -77 145 -50Q121 -22 124 9Q129 45 86 69Q34 86 -39 49Z':
 'M-37 46Q-2 41 16 29Q45 14 72 24Q92 14 85 -13Q75 -47 98 -61Q124 -77 143 -53L142 -40Q122 -22 127 4Q134 40 99 62Q55 90 -3 61L-39 56Z',body,st(edge,line));
 wing=P('M-41 52Q9 31 32 28Q60 24 75 40Q59 66 9 62L-35 59L-17 53Z',shade,st(edge,line*.73))+
 rep(i===1?9:4,j=>P('M'+(-23+j*7)+' '+(53+j%3)+'q28 -4 61 -21q-18 14 -41 18Z',body));
 }
 head=P('M132 -49Q169 -49 213 -40L258 -32Q244 -22 225 -18Q168 7 141 -17L128 -34Z',bill,st(edge,line))+
 P('M133 -47Q184 -44 255 -32L134 -30Z',collage?paper:body,st(edge,line*.6))+
 P('M144 -27q31 23 87 4q-56 26 -78 7Z',shade)+C(125,-52,4.2,edge)+C(126,-54,1.4,collage?red:'#fff6df');
 if(i===0)head+=P('M85 -52q3 -30 33 -25l17 14l17 4l-8 4l-29 -4Z',ink,st(paper,2))+P('M95 -62l6 -12h10l-9 13Z',red);
 if(i===4)head+=P('M115 -55q9 -8 17 -1l4 -4','none',st('#8f6d80',2))+C(117,-40,4,'#efb6bf');
 if(i===7)head+=G(P('M-14 -5q-10 -13 3 -17q7 -4 12 1q17 -6 19 7l-5 9v28h-29Z','#edc17c',st('#936246',3))+P('M-10 -5q-7 -10 2 -12q6 -3 10 1q12 -4 13 4l-5 8v20h-21Z','#fae6b0'),tr(240,-23,1,14+Math.sin(t*turn)*5));
 if(i===16)wing+=P('M-18 50q39 -9 74 -17q-15 19 -74 23Z','url(#dots)');
 if(i===15)wing+=rep(48,j=>L(-13+rand(j)*66,36+rand(j+85)*19,rand(j)*66,34+rand(j+85)*19,['#b3b693','#ddd1ac','#93aa9a'][j%3],2.7));
 if(i===17)head=G(head,'transform="translate(102 -32) scale('+(1-2*ease((t-3.16)/.28)*(1-ease((t-4.28)/.35)))+' 1) translate(-102 32)"');
 let whole=torso+head+wing;
 if(i===0||i===13)whole+=P('M82 -14l42 10l-5 8l-36 -9q-29 7 -49 -7l-21 -1l13 -6l-16 -6q39 0 72 13Z',i===0?red:'#b56850',st(edge,1.4));
 if(paperBird&&t>=2&&t<4){
  const u=t<2.5?ease((t-2)/.5):1-ease((t-3.16)/.84),flip=Math.cos(pi*u);
  if(flip<0)whole=P('M-39 52L20 24L72 24L87 10L82 -21L86 -49L106 -66L131 -61L144 -50L258 -32Q177 6 136 -14L123 32L99 58L58 75L2 61Z','#fff7de',st('#bcad8c',1.3));
  whole=G(whole,'transform="translate(68 0) scale('+flip+' 1) translate(-68 0)"');
 }
 if(i===4&&t>6){
  const tuck=ease((t-6.24)/.64);
  whole=G(whole,'transform="translate(60 77) scale('+(1-.10*tuck)+' '+(1-.24*tuck)+') translate(-60 -77)"');
 }
 const edgeOn=1-Math.abs(Math.cos((h.bearing||0)*rad));
 const thickness=edgeOn>.52?opacity(frontPlumage(h),ease((edgeOn-.52)/.33)):'';
 return thickness+plane(h,i===4?G(whole,tr(0,2*Math.sin(h.clock*turn))):whole);
}
function frontPlumage(h){
 const i=h.i,[body,line,bill,shadow]=palettes[i],pen=i===11?'#c7e4fa':line;
 function lobe(rings,col){
  const pts=rings.flatMap(([x,y,ry,rz])=>Array.from({length:14},(_,j)=>h.local(x,y+ry*Math.cos(j*turn/14),rz*Math.sin(j*turn/14))));
  return P(roundContour(hullPoints(pts)),col,st(pen,Math.max(.9,h.anchor.k*1.8)));
 }
 const chest=lobe([[-34,47,5,5],[13,50,23,24],[63,43,32,31],[96,34,18,18]],body);
 const wing=rep(2,j=>{const sign=j?1:-1;return polygon([h.local(76,28,sign*22),h.local(49,43,sign*32),h.local(0,61,sign*17),h.local(38,53,sign*24)],shadow)});
 const neck=lobe([[87,22,28,13],[103,-4,35,13],[114,-31,26,14]],body);
 const crown=lobe([[91,-48,11,11],[110,-49,20,20],[132,-48,15,15]],body);
 const pouch=lobe([[131,-37,10,14],[152,-29,16,16],[183,-24,14,13],[251,-32,1.4,1]],bill);
 const ridge=polygon([h.local(132,-48,-13),h.local(252,-32,0),h.local(132,-48,13)],i===13?'#e7c6a1':body,st(pen,1));
 const eyes=rep(2,j=>{const p=h.local(122,-53,j?17:-17);return C(p.x,p.y,Math.max(1,3*h.anchor.k),pen)});
 return Math.sin(h.bearing*rad)>0?chest+wing+neck+crown+pouch+ridge+eyes:pouch+ridge+crown+eyes+neck+chest+wing;
}
function solidBird(h){
 const {i}=h,t=h.clock,raw=h.local;
 const local=(x,y,z=0)=>{
  if(i===19&&y<34){
   const nod=-16*rad*Math.sin(pi*clamp((t-1.85)/1.92))*clamp((34-y)/52);
   const dx=x-91,dy=y-1,cs=Math.cos(nod),sn=Math.sin(nod);
   return raw(91+dx*cs-dy*sn,1+dx*sn+dy*cs,z);
  }
  if(i===5){const sway=Math.sin(t*turn)*(.03+.12*ease((t-1.4)/.5)*(1-ease((t-4.15)/.5)));
   return raw(x,126+(y-126)*Math.cos(sway)-z*Math.sin(sway),z*Math.cos(sway)+(y-126)*Math.sin(sway));}
  return raw(x,y,z);
 };
 const mini=i===5,wire=i===20,mid=i===15?'#d8d7b1':i===10?'#a7aaa1':i===19?'#283654':wire?'#d3b7d5':mini?'#ffedcf':'#f7e9c9',
 lit=i===19?'#69d8df':wire?'#f5dce3':mini?'#fff8e4':'#fff8dd',dark=i===19?'#62496c':wire?'#a998bd':mini?'#e8bfbd':'#bdc8bd',
 bill=i===19?'#eb8abd':i===10?'#d9bd5b':wire?'#dfc4d8':mini?'#ffbb72':'#ecb277';
 const polys=[];
 function face(points,c,edge='none',width=0){const pts=points.map(p=>local(...p));polys.push([pts.reduce((sum,p)=>sum+p.depth,0)/pts.length,polygon(pts,c,edge==='none'?'':st(edge,width*h.anchor.k))])}
 function loft(rings,colours,facets=10){
  const globe=rings.map(([x,y,ry,rz])=>Array.from({length:facets},(_,j)=>[x,y+ry*Math.cos(j*turn/facets),rz*Math.sin(j*turn/facets)]));
  if(!wire&&i!==10&&i!==19){
   const projected=globe.flat().map(p=>local(...p)),hull=hullPoints(projected),depth=projected.reduce((n,p)=>n+p.depth,0)/projected.length;
   const name='paint-'+i+'-'+colours.map(c=>c.slice(1)).join('');
   const paint='<defs>'+grad(name,colours)+'</defs>';
   polys.push([depth,paint+P(roundContour(hull),'url(#'+name+')',st(i===5?'#997e86':i===15?'#9da68d':'#52646b',Math.max(.8,h.anchor.k*(mini?2.4:1.65))))]);
   return;
  }
  for(let k=0;k<globe.length-1;k++)for(let j=0;j<facets;j++){
   const n=(j+1)%facets,litSide=Math.cos((j+.5)*turn/facets);
   const col=colours[litSide<-.43?0:litSide>.55?2:1];
   face([globe[k][j],globe[k+1][j],globe[k+1][n],globe[k][n]],col,wire?'#a58cac':col,wire?.72:.65);
  }
 }
 let headX=mini?77:111,headY=mini?9:-52,span=mini?50:23;
 loft(mini?[[-10,81,2,3],[8,73,20,19],[43,72,37,33],[79,74,32,29],[96,74,5,5]]:
 [[-37,50,2,3],[-11,46,12,13],[28,44,24,29],[63,45,32,37],[88,40,29,29],[107,34,14,17],[117,29,3,4]],[lit,mid,dark]);
 if(!mini)loft([[77,24,20,18],[88,13,34,19],[99,-7,43,18],[113,-18,39,17],[123,-30,25,14],[130,-33,8,5]],[lit,mid,dark]);
 loft([[headX-span,headY,3,3],[headX-span*.7,headY-1,span*.81,span*.83],[headX,headY,span*1.04,span],[headX+span*.72,headY+2,span*.78,span*.83],[headX+span,headY+4,span*.35,span*.5]],[lit,mid,dark],12);
 const x0=headX+span*.61,tip=mini?165:251;
 loft([[x0,headY+8,6,span*.62],[x0+12,headY+15,13,span*.85],[x0+33,headY+21,16,span*.91],[tip-27,headY+21,7,10],[tip,headY+16,1.1,1.4]],['#ffdf99',bill,i===19?'#a44f8f':wire?'#bba0be':'#cf946f'],8);
 face([[x0,headY+1,-span*.62],[tip,headY+15,0],[x0,headY+1,span*.62]],wire?'#f0d9e2':i===19?'#86eeec':'#ffe4a4',i===19?'#78ecef':'#c6a077',1);
 for(let side of [-1,1]){
  let eye=h.local(headX+span*.52,headY-span*.24,side*span*.91);
  polys.push([eye.depth,C(eye.x,eye.y,eye.k*(mini?5:3.3),'#374049')+C(eye.x+.9*eye.k,eye.y-1.2*eye.k,1.15*eye.k,'#fdf8dc')]);
  const wingCol=i===2?'#ac5145':i===6?'#e676b1':i===10?'#737e74':i===19?'#33496a':wire?'#bc9ebe':mini?'#f4cdc0':'#cae3e3';
  face([[-33,50,side*5],[32,27,side*20],[67,36,side*33],[51,52,side*37],[7,64,side*18]],wingCol,wire?'#987fab':dark,1.5);
  for(let j=0;j<3;j++)face([[1+j*8,53+j*2,side*(20+j*2)],[53,38+j*3,side*35],[25,51+j*2,side*30]],lit);
 }
 if(i===10&&t>=2||i===19){
  loft([[headX-span,headY-7,2,3],[headX-10,headY-13,13,18],[headX+7,headY-15,15,21],[headX+22,headY-8,7,19],[headX+34,headY-5,2,8]],i===10?['#f7d777','#d8ae3c','#857740']:['#9aefef','#314960','#674a68']);
 }
 if(i===19||i===10&&t>=2.75){face([[headX+15,headY-7,-21],[headX+26,headY-6,0],[headX+15,headY-7,21],[headX+13,headY+2,21],[headX+25,headY+3,0],[headX+13,headY+2,-21]],i===19?'#77f6ed':'#425562','#7a9497',1.1)}
 let out=polys.sort((a,b)=>a[0]-b[0]).map(v=>v[1]).join('');
 if(i===15){
  const visible=dot3(h.eye,h.basis.b)>0?1:-1,paints=['#b1ba9c','#d5cba9','#a4bba8','#e6d7ad'];
  out+=rep(65,j=>{const u=rand(j+14),v=rand(j+53),p=local(-6+u*82,37+v*20,visible*(12+17*Math.sin(pi*u))),Q=local(2+u*82,34+v*20,visible*(14+17*Math.sin(pi*u)));
   return P('M'+xy(p)+'L'+xy(Q),'none',st(paints[j%4],2.8*p.k))})+
   rep(19,j=>{const u=rand(j*3),p=local(96+u*12,-33+rand(j+67)*54,visible*13);return L(p.x,p.y,p.x+3*p.k,p.y-4*p.k,paints[j%4],2*p.k)});
 }
 if(i!==20&&i!==19&&i!==10){
  const visibleSide=dot3(h.eye,h.basis.b)>0?1:-1;
  for(const side of [-1,1]){
   if(side!==visibleSide&&dot3(h.eye,h.basis.f)<.85)continue;
   const e=local(headX+span*.53,headY-span*.20,side*span*.83);
   out+=C(e.x,e.y,e.k*(mini?6.3:3.3),'#3e4750')+C(e.x+e.k,e.y-e.k,e.k*(mini?2:1.15),'#fff8e3');
   if(mini){const cheek=local(headX+span*.5,headY+9,side*span*.88);out+=C(cheek.x,cheek.y,5.6*cheek.k,'#e9adae')}
  }
 }
 if(i===2){
  const cloak=[[83,-4,-17],[113,0,0],[87,-3,20],[49,29,42],[4,42,32],[-28,38,9],[-6,26,-23],[41,16,-37]];
  out+=polygon(cloak.map(p=>local(...p)),'#b65e45',st('#e5c17b',2*h.anchor.k))+
   P('M'+xy(local(-19,37,10))+'Q'+xy(local(43,42,39))+' '+xy(local(78,17,27)),'none',st('#e3ae64',1.7*h.anchor.k))+
   badgeAt(h,101,3,13,5,'#f2d483');
 }
 if(i===10){
  const vest=[[68,8,-19],[103,10,8],[86,22,27],[76,62,30],[47,62,18],[35,35,-19]];
  out+=polygon(vest.map(p=>local(...p)),'#758077',st('#34433e',1.5*h.anchor.k));
  if(t>=3.5)out+=polygon([[52,41,20],[83,28,26],[80,38,27],[57,52,22]].map(p=>local(...p)),'#f1cd53');
 }
 if(i===3){const ring=Array.from({length:40},(_,k)=>local(headX+28*Math.cos(k*turn/40),headY-span-16-4*Math.cos(k*turn/40),27*Math.sin(k*turn/40)));out+=P(contour(ring),'none',st('#87d9e8',3*h.anchor.k))}
 if(i===6){
  out+=polygon([[77,3,-20],[111,5,0],[83,4,21],[72,39,36],[21,48,27],[1,47,0],[28,38,-33]].map(p=>local(...p)),'#c94e90',st('#fbc4d6',2*h.anchor.k))+
   polygon([[91,4,-16],[111,12,0],[94,5,18],[107,27,3]].map(p=>local(...p)),'#8ce7e3')+
   badgeAt(h,102,12,12,5,'#ffda90');
  out+=tube(h,[[85,-8,-12],[96,1,0],[90,-8,18]],'#7df0e5',7);const jewel=local(88,0,18);out+=star(jewel.x,jewel.y,8*jewel.k,'#ffe19d')}
 if(mini&&t>1.6){const e=local(headX+18,headY-26+5*Math.sin(turn*t),27);out+=G(P('M0 -10q13 16 4 18q-13 1 -4 -18Z','#83c7d3',st('#fff3d6',1.5)),tr(e.x,e.y,e.k))}
 return out;
}
function paintedRider(h){
 const {i,q,clock}=h,b=q.base,rig=cycleArt(h),side=dot3(h.eye,h.basis.b)>0?1:-1;
 function leg(sign){
  const p=rig.foot(sign),mini=i===5;
  return tube(h,[[b*.32,mini?102:67,sign*(mini?16:13)],[b*.38,mini?138:107,sign*17],
   mini?[b*.41+9*Math.sin(turn*clock+sign),153,sign*16]:p],i===11?'#ceebfc':palettes[i][2],i===12?3:5)+
   (mini?'':tube(h,[p,[p[0]+13,p[1],p[2]]],palettes[i][2],4));
 }
 const volume=[2,3,5,6,8,10,15,19,20].includes(i);
 const body=()=>volume?solidBird(h):sideBird(h);
 let bird=h.studio?fixedDrawing('finish-plumage-'+i,()=>volume?solidBird({...h,t:5.1,clock:5.1}):sideBird({...h,t:5.1,clock:5.1})):body();
 if(i===11&&h.t>1.6)bird=G(bird,'transform="translate(0 '+(-40*drawingSpread(h.t)*h.anchor.k)+')"');
 let arm=tube(h,[[b*.36,i===5?84:34,side*21],[b*.61,i===5?108:54,side*27],[rig.bars[0]+6+(i===8?3*ease((h.t-3.7)/.3)*(1-ease((h.t-4.04)/.3)):0),rig.bars[1]-2,side*rig.barWidth]],palettes[i][1],4);
 if(i===14&&h.t>2.25&&h.t<3.55)arm='';
 const frontNear=h.local(b,190).depth>h.local(0,190).depth;
 function rim(front){
  if(!h.studio)return wheelArt(h,front);
  const x=front?q.base:0,r=front?q.r2:q.r,y=244-r;
  const form=fixedDrawing('finish-wheel-'+i+'-'+Number(front),()=>G(wheelArt({...h,s:0,t:6},front),tr(-x,-y)));
  return G(form,tr(x,y,1,(h.s/r)/rad));
 }
 const frame=h.studio?fixedDrawing('finish-frame-'+i,()=>rig.svg):rig.svg;
 let main=rim(!frontNear)+frame+rig.drive+leg(-side)+bird+leg(side)+arm+rim(frontNear);
 if(i===12||i===15)main=G(main,'filter="url(#bleed)"');
 return main;
}
function worldBox(h,s,b,len,w,height,front,side,top){
 const v=(d,z,y)=>h.at(s+d,b+z,y),corners=[[-len/2,-w/2],[len/2,-w/2],[len/2,w/2],[-len/2,w/2]];
 const surfaces=corners.map(([a,c],j)=>{const [u,e]=corners[(j+1)%4],pts=[v(a,c,0),v(u,e,0),v(u,e,height),v(a,c,height)];return [pts.reduce((n,p)=>n+p.depth,0)/4,polygon(pts,j%2?side:front)]});
 return surfaces.sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('')+polygon(corners.map(([d,z])=>v(d,z,height)),top);
}
function spectator(type,t,j=0){
 const skins=['#dcb49c','#c99e8a','#efc6a7'],dress={student:'#e9eff0',baker:'#fff4d6',porter:'#546a78',tech:'#bcac70',farmer:'#98a48c',fan:'#ae83b4',artist:'#8b9483',sailor:'#738c94',sprite:'#d3a985',punk:'#875e87'};
 const head=G(C(0,-41,9,skins[Math.abs(j)%3])+P('M-10 -40q-5 -15 10 -15q14 2 9 15l-4 -6l-6 4l-3 -4Z','#53535c')+C(5,-41,1.2,'#484446'),tr(0,1,1,Math.sin(t*2+j)*4));
 const arm=type==='student'?G(P('M0 0l12 9l7 -6','none',st(skins[0],4))+R(14,-3,8,12,'#415a68','rx="2"')+(t>=2&&t<2.3?star(18,-2,7,'#fffce0'):''),'transform="translate(6 -22) rotate('+(-81*ease((t-1.83)/.17))+')"'):
 G(P('M0 0l12 -5l4 -14','none',st(skins[1],4)),tr(7,-23,1,19*Math.sin(t*3+j)));
 return P('M-7 -5l-2 24m14 -24l4 24','none',st('#55616b',5))+P('M-11 -30q10 -9 21 -1l6 29h-30Z',dress[type]||'#94abab',st('#64716d',1))+head+arm+
 (type==='baker'?P('M-10 -48q-8 -4 -5 -11q2 -6 9 -5q6 -8 12 -2q10 -1 10 7l-6 10Z','#fff5dc'):type==='tech'?P('M-13 -44q0 -15 13 -15q11 1 12 13l5 3Z','#e6bc46'):type==='sailor'?P('M-12 -47q8 -9 21 -6l4 6Z','#e2d6b7'):'');
}
function graphicWindow(x,y,w,h,content,view='0 0 1200 675',extra=''){
 return '<svg x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" viewBox="'+view+'" overflow="hidden" preserveAspectRatio="none" '+extra+'>'+content+'</svg>';
}
function cityPan(h,col,light,seed,y,size){
 const move=h.dr*.16,period=26*55*size,offset=((move%period)+period)%period;
 return G(city(-offset,y,size,col,light,seed)+city(period-offset,y,size,col,light,seed)+city(2*period-offset,y,size,col,light,seed));
}
function slalomTrees(h,color,offset,scale){
 return repeatedProps(h,330,offset,j=>fixedDrawing('journey-pine-'+color,()=>pine(0,0,1,color)),scale);
}
function sceneContent(i,t,overrides={}){
 const h=takeShot(i,t,overrides),{q,s,clock,at,local}=h;let back='',near='',hud='',actors='',road=roadSections(h),bird=i===18?'':paintedRider(h);
 const roadMark=(travel,z,height,art,scale)=>objectAt(h,travel,z,art,scale,height);
 const farFlags=(style,where,off,size)=>objectAt(h,h.speed*where,off,spectator(style,t),size);
 const place=(shape,xt,yt,scale=1)=>G(shape,tr(xt,yt,scale));
 const anchor=h.anchor;
 switch(i){
 case 0:{
  back=R(0,0,1200,675,paper)+rep(20,j=>G(P('M0 0l1300 -56v123Z',j%4?red:ink),tr(772,420,1,j*18-5)))+
  P('M0 0h514L0 221Z',ink)+P('M0 387L820 85L0 472Z','url(#dots)')+cityPan(h,ink,paper,6,506,.86)+
  repeatedProps(h,530,-162,j=>G(P('M-5 0v-127h8V0Z',ink)+P('M-43 -133l105 -12l-10 53l-94 12Z',paper,st(ink,3))+star(8,-113,13,red,5)),.83);
  const torn=P('M-9 -16l359 -3l-8 12l11 3l-8 14l-355 12Z',ink)+mt(4,9,'01  /  RED–BLACK COLLAGE',17,paper,'letter-spacing="2"');
  hud=G(pressHeadline(t,torn),'transform="translate(5 15) scale(.8)"')+T(884,58,CN[0],23,ink,'font-weight="900"')+
  mt(39,645,'CUTTING 01     /     COLLAGE SERIES',14,paper,'letter-spacing="2"')+
  G(P('M0 0l170 -28l-11 -11l76 6l-62 32l4 -15l-177 34Z',red),tr(65,526));
  if(t>1.9&&t<2.22)near+=P('M0 0h1200L0 675Z',red,'opacity="'+(.36*(1-(t-1.9)/.32))+'"');
  // An oblique second cut carries a different camera distance, as on a pasted broadside.
  const panel=P('M7 413l321 -113l-37 93L0 497Z','white'),chest=h.local(80,21,0),crank=h.local(q.base*.44,162,0),view=t<1.85?crank:t<3.85?h.anchor:chest;
  const wide=t>=1.85&&t<3.85?2.25:.62;
  const cutout=graphicWindow(0,293,340,218,back+road+bird,[view.x-170*wide,view.y-108*wide,340*wide,218*wide].join(' '));
  near+='<defs><clipPath id="press-cut">'+panel+'</clipPath></defs>'+G(cutout,'clip-path="url(#press-cut)"')+
   P('M7 413l321 -113l-37 93L0 497Z','none',st(ink,3));
  actors+=objectAt(h,h.speed*3.75,-131,G(P('M-11 -4l-4 21h8l8 -21l6 21h7l-2 -26l-8 -22l-16 1Z',ink)+P('M-4 -28l16 -6l19 -18l4 5l-20 23l-17 5Z',ink)+C(-2,-42,9,ink)+P('M-13 -46l18 -4l11 4l-29 3Z',red)),.97);break}
 case 1:{
  back=R(0,0,1200,675,'url(#night)')+rep(165,j=>C((rand(j+71)*1250-h.dr*(j%3+1)*.036+2500)%1250-20,rand(j+89)*454,.6+rand(j+190)*1.4,j%3?'#c6d6db':'#efd298'))+
  rep(9,j=>G(P('M0 0l51 -26l39 8l29 -44','none',st('#7d90a1',.8))+C(0,0,2,'#dbccb2')+C(51,-26,2.8,'#ecddbd'),tr(j*164-82-h.dr*.08,151+rand(j)*91)))+
  G(C(0,0,60,'#bc9987')+P('M-60 1q57 14 119 -23q1 7 0 14q-76 39 -118 18Z','#d4b499')+'<ellipse rx="105" ry="16" fill="none" stroke="#cdbb9b" stroke-width="3"/>',tr(998-h.dr*.037,118,1,-16))+
  P('M-120 369Q482 23 1285 110','none','stroke="#bfa475" stroke-dasharray="4 10" stroke-width="1.4"')+
  G(voyagerTrain(t),tr(165,139,.66))+P('M-20 414Q604 398 1220 365','none',st('#b79d70',3));
  near=orbitTicket(t,165,139,.66)+rep(16,j=>{const p=at(s-j*15,0,8+rand(j)*17);return star(p.x,p.y,4*(1-j/17),'#f4daa0')});
  actors+=roadMark(h.speed*3,-212,0,P('M0 0v-105','none',st('#acab88',4))+R(-94,-133,181,34,'#22374a',st('#c2a771',2))+mt(-79,-111,'LYRA   /   天琴座',15,'#e9d6a4'),1);
  hud=mt(1108,625,'02 / 22',14,'#d3b780','text-anchor="end"')+L(69,618,1050,618,'#797760',1)+rep(7,j=>C(93+j*143,618,j===2?5:2,'#dabe89'));break}
 case 2:{
  back=R(0,0,1200,675,'url(#blueSky)')+cloud(149-h.dr*.025,83,.91,'#fff3d7')+mountains(250,'#acbdae',65,98)+mountains(325,'#87aca1',71,122)+hills(355,'#9fbb83',50)+
  P('M0 423Q196 351 416 391Q673 439 904 326Q1040 282 1220 310V675H0Z','#87bcb0')+rep(50,j=>L((rand(j)*1280-h.dr*.12+2560)%1280-35,373+rand(j+38)*277,(rand(j)*1280-h.dr*.12+2560)%1280-9,371+rand(j+38)*277,'#c5debb',2))+
  (overrides.liftCastle?'':objectAt(h,1600,-510,citadel(t).replace('translate(824 288)','translate(0 0)'),1.28))+chunkyCliffs(h);
  actors=farFlags('farmer',1.95,-124,1.05);
  const open=ease((t-1.7)/.5)*(1-ease((t-5.83)/.45));
  const wingTips=[[-108,-41,10],[64,-107,-4],[241,-79,37],[156,-28,69],[74,-38,81],[-31,-9,47]];
  const nodes=wingTips.map(([x,y,z])=>local(80+(x-80)*open,24+(y-24)*open,z*open));
  actors+=rep(4,j=>polygon([nodes[1],nodes[(j+2)%6],nodes[(j+3)%6]],['#f5db9e','#8db7a6','#e1b774','#f1d09b'][j],st('#826f50',1.6)))+
   P('M'+xy(nodes[0])+'L'+xy(local(48,78,0))+'L'+xy(nodes[1])+'L'+xy(local(162,72,0))+'L'+xy(nodes[2]),'none',st('#937c54',1.5));
  hud=R(14,14,1172,647,'none',st('#e0bd79',3))+embellish(2,t,0,0)[0]+valleyRibbon(t);break}
 case 3:{
  back=R(0,0,1200,675,'url(#blueSky)')+rep(5,j=>cloud(j*315-h.dr*.04,67+rand(j)*49,.76,'#f7fcf3'))+
  cityPan(h,'#aec8d0','#e7f1ee',23,303,.6)+P('M0 328q610 -51 1200 -14v370H0Z','#a8cabb');
  for(let k=0;k<2;k++){const side=k?1:-1;
   back+=worldBox(h,1300,side*526,780,207,190,'#edf1e5','#adc4c4','#f9f7e6');
   for(let j=0;j<12;j++)for(let m=0;m<3;m++){
    const ss=955+j*60,b=side*419;
    back+=polygon([at(ss,b,47+m*49),at(ss+38,b,47+m*49),at(ss+38,b,72+m*49),at(ss,b,72+m*49)],'#95b7c1');
   }
  }
  back+=campusGate(h);const footbridge=(z)=>at(310,z,144);
  back+=P('M'+xy(footbridge(-510))+'L'+xy(footbridge(510)),'none',st('#d9e6df',19))+
  P('M'+xy(at(310,-510,160))+'L'+xy(at(310,510,160)),'none',st('#aac5cf',5))+
  G(train(-270+t*32,208,.48,false,t),tr(140,18,.9))+
  repeatedProps(h,420,-360,j=>G(C(0,-71,34,'#98bd9d')+R(-3,-50,6,50,'#839784')),.9);
  back+=objectAt(h,160,-q.width,G(R(-8,-127,16,127,'#afbfc2')+R(-26,-122,156,26,'#e4ecdd',st('#93aab1',1.3))+T(49,-104,'晴 海 学 园',15,'#577381','text-anchor="middle"')),1.35);
  for(let j=0;j<9;j++)near+=objectAt(h,480+270*ease((t-1)/1.1)+j%3*121,(j%2?1:-1)*(217+36*ease((t-1.7)/.6)+j%3*12),spectator('student',t,j),1.24);
  if(t>=2)hud+=G(R(0,0,315,60,'#f8fffd','opacity=".92" rx="14"')+C(26,30,9,'#9dd9dc')+T(47,38,'鹈鹕骑车来上学了',21,'#50768d'),tr(846,105));
  if(t>4.4)near+=opacity(campusWindows(h),ease((t-4.4)/.75));
  break}
 case 4:{
  back=afterSchool(t);actors=farFlags('student',3.5,-162,1.07);
  near=petals(60,t,'#ffe2e9')+G(petals(8,t*.75,'#eab8cd'),'filter="url(#soft)"');
  hud=conversationPanel(t);break}
 case 5:{
  back=R(0,0,1200,675,'#b9d8be')+rep(25,j=>G(P('M-9 0q7 -12 21 -4l7 3q-15 7 -28 1Z','#a9cdad'),tr((rand(j)*1400-h.dr*.48+2800)%1400-100,rand(j+77)*670)))+
   townPlots(h,overrides.housesApart);
  actors+=farFlags('baker',2.9,-154,1.18);
  near=repeatedProps(h,487,324,j=>G(P('M0 0v-62','none',st('#c19b85',6))+C(0,-73,24,j%2?'#eaa8b8':'#b3bcda',st('#fff0d4',4))+P('M0 -73q6 -9 12 -1q6 15 -11 15q-16 -2 -15 -16','none',st('#fbe8cb',3))),1.1);
  hud=G(C(0,0,25,'#fff4da',st('#b19b92',2))+P('M-6 14L0 -17L8 10L0 5Z','#cc92a1')+mt(0,-31,'N',13,'#806c78','text-anchor="middle"'),tr(1128,94));
  break}
 case 6:{
  back=R(0,0,1200,675,'#25203e')+rep(8,j=>G(P('M0 0l-86 381h165Z',j%2?'#f5a3d8':'#75dacf','opacity=".18"')+C(0,0,10,'#fff2c1'),tr(80+j*152,48,1,Math.sin(t*2+j)*13)))+
  rep(5,j=>G(R(0,0,117,162,['#cc659f','#8275bb','#50a1b2'][j%3],'rx="5"')+star(56,74,35,'#fceac3',5),tr(255+j*139,91)))+
  rep(76,j=>L(rand(j)*1200,259+rand(j+62)*103,rand(j)*1200+5,242+rand(j+62)*103,j%2?'#96efed':'#e891c5',4));
  actors=repeatedProps(h,188,-226,j=>spectator('fan',t,j),1.08)+repeatedProps(h,208,237,j=>G(spectator('fan',t,j)+L(18,-34,23,-54,j%2?'#f1a6d2':'#89eee2',4)),1.02);
  for(let n=0;n<10;n++){
   const p=at(n*.5*h.speed+q.base*.43,0,4),age=t-n*.5;
   if(age<-.85||age>.3)continue;
   const k=Math.max(.25,p.k);near+=G(P('M-30 0l13 -7h39l12 7l-14 7h-38Z',n%2?'#ff99ca':'#80f6eb',st('#fff4e4',2)),tr(p.x,p.y,k));
   if(age>=0&&n<9)near+=G(star(0,0,17*(1-age/.32),'#fff0b4'),tr(p.x,p.y));
  }
  hud=stageJudgement(h);break}
 case 7:{
  back=celStreet(t,h.s);actors=farFlags('student',3.9,-217,1.1);
  if(t>1.6)near+=rep(27,j=>{let x=(rand(j)*1400-t*217+2800)%1400-100,y=117+rand(j+93)*423;return L(x,y,x+67+rand(j+54)*119,y-4,'#fff9df',1.4,'opacity=".75"')});
  break}
 case 8:{
  back=railwayCrossing(2.8);near=crossingSignal(t)+commuterCar(t);
  const bell=local(q.base*.86+5,66,28);
  if(t>=4&&t<4.65)near+=G(P('M0 -8q17 1 20 17m-8 -23q18 1 23 22','none',st('#fff8d3',2)),tr(bell.x+3,bell.y-6,1+(t-4))+' opacity="'+(1-(t-4)/.65)+'"');
  break}
 case 9:{
  back=eveningEdition(t);road=G(road,'opacity=".88"');
  actors=objectAt(h,910,-82,G(spectator('porter',t,2)+P('M10 -23h22v14H10Z','#4f493d')+C(24,-16,4,'#d2c4a4')),1.2);
  near=developmentWash(t);break}
 case 10:{
  back=R(0,0,1200,675,'#929b92')+rep(3,j=>worldBox(h,430+j*740,-305,402,180,110+j*24,'#71817a','#5c6966','#acb3a6'))+
  repeatedProps(h,238,-243,j=>G(R(-17,-95,34,95,'url(#metal)')+R(-22,-79,44,6,'#46554d')+R(-23,-9,46,9,'#45504a')),.95);
  back+=maintenanceBay(h);
  for(let j=0;j<3;j++){const install=2+j*.75,loc=at(install*h.speed+q.base*.56,-184,0),reach=ease((t-install+.62)/.62)*(1-ease((t-install)/.45));
   const dest=local(j===2?76:110,j===2?40:-57,12),tip={x:mixN(loc.x+8, dest.x,reach),y:mixN(loc.y-96*loc.k,dest.y-8,reach)},elbow={x:loc.x-31*loc.k,y:Math.min(loc.y,tip.y)-59*loc.k};
   actors+=P('M'+xy(loc)+'L'+xy(elbow)+'L'+xy(tip),'none',st('#35413f',15*loc.k))+P('M'+xy(loc)+'L'+xy(elbow)+'L'+xy(tip),'none',st('#b4b7a7',6*loc.k))+
   C(elbow.x,elbow.y,9*loc.k,'#d7b444',st('#38433c',2))+G(P('M-9 0l-3 9l5 5m14 -14l3 9l-6 5','none',st('#2b3635',3)),tr(tip.x,tip.y,loc.k));
  }
  for(let j=0;j<3;j++){
   const due=2+j*.75,loc=at(due*h.speed+q.base*.56,-184,0),reach=ease((t-due+.62)/.62);
   if(t>=due)continue;const dest=local(j===2?76:110,j===2?40:-57,12),p={x:mixN(loc.x+8,dest.x,reach),y:mixN(loc.y-96*loc.k,dest.y-8,reach)};
   actors+=G([P('M-14 2q1 -21 16 -21q15 2 17 18l4 3Z','#e5be42',st('#48534b',2)),R(-14,-3,29,9,'#669199',st('#475954',2)),P('M-11 -8l19 -4l5 10l-18 5Z','#dfc458')][j],tr(p.x,p.y+6,loc.k));
  }
  near+=farFlags('tech',3.9,202,1.15);
  const beacon=at(h.speed*3.5,-139,151);
  actors+=G(P('M-13 4v-12q12 -19 25 0v12Z',Math.floor(t*5)%2?'#f7cc50':'#b59148',st('#666249',2))+R(-17,4,34,6,'#455148'),tr(beacon.x,beacon.y,beacon.k));
  hud=R(25,22,1150,632,'none','stroke="#e3d998" stroke-width="1" stroke-dasharray="13 6"')+
  mt(888,62,'CAM 07   /   AUTO INSPECT',18,'#e9e1b7')+mt(64,633,'CONVEYOR   /   UNIT 071',17,'#f2df9e')+
  G(P('M-94 -95v-15h20m165 0h16v16m0 105v16h-17m-164 0h-20v-16','none',st('#ecdb81',2)),tr(h.local(q.base/2,110).x,h.local(q.base/2,110).y));
  hud+=rep(28,j=>R(964+j*5.4,602,1+j%3,18,'#484f44'))+mt(965,640,'UNIT 07    /    120 BPM',12,'#4d574a');
  break}
 case 11:{
  back=R(0,0,1200,675,'#255485')+R(0,0,1200,675,'url(#grid)','opacity=".46"')+R(19,19,1162,637,'none',st('#cbe4f6',1.5))+
  G(bike(11,0),tr(143,174,.42))+G(blueprintProjections(),tr(284,-209,.9))+mt(85,290,'A   /   SIDE',13,'#d8efff')+
  mt(697,137,'ASSEMBLY   /   REV. B',16,'#c3e2f7')+R(686,157,467,164,'#245282',st('#c3e2f7',1.4))+
  rep(Math.min(4,Math.floor(t*1.35)),j=>L(687,196+j*41,1151,196+j*41,'#a3c6e2')+T(700,187+j*41,['01   车架      钢','02   链条      钢','03   车铃      黄铜','04   鹈鹕，数量 1，材料：不详'][j],19,'#e2f3ff'))+
  rep(48,j=>L(29+j*24,625,29+j*24,j%5?618:611,'#bfdcf0',1.3))+mt(731,609,'DIMENSIONS IN mm     /     PLATE 012',15,'#bfdcf0');
  const A=at(s-28*drawingSpread(t),0,-38),B=at(s+q.base+28*drawingSpread(t),0,-38);
  near=P('M'+xy(A)+'L'+xy(B),'none',st('#e2effa',1.5))+mt((A.x+B.x)/2,A.y+18,(q.base+56*drawingSpread(t)).toFixed(1)+' mm',13,'#d3ebfd','text-anchor="middle"');
  actors+=objectAt(h,1880,-122,spectator('tech',t),.78);
  back+=G(mt(-75,-34,'E / HUB SECTION',13,'#c8dfec')+rep(4,j=>G(C(0,0,19-j*3,'none',st('#cce5f7',1.4))+C(0,0,5,'none',st('#cce5f7',.9)),tr(-64+j*36,0)))+P('M-97 0h159','none','stroke="#95c0dd" stroke-dasharray="4 5"'),tr(980,548));
  break}
 }
 return {h,back,road,actors,bird,near,hud};
}
function secondSet(i,t,first,options={}){
 let {h,road,bird}=first;const {q,s,at,clock}=h;let back='',near='',hud='',actors='',defs='',blocks;
 switch(i){
 case 12:{
  const dy=290*ease(t/4.35);
  back=R(0,0,1200,675,'#eeeada')+
  G(fixedDrawing('scroll-mountains',()=>inkPeaks(18,235,'#a8b2a2',1.55)+inkPeaks(63,385,'#899787',1.73)+inkPeaks(28,520,'#748574',1.3)),tr(-28-h.dr*.16,-dy*.81))+
  G(P('M0 564q210 -162 397 -49q194 90 409 -13q199 -64 423 -9v275H0Z','#d6d8c8')+
    P('M-26 899Q231 698 450 721Q669 738 852 566Q819 689 662 759Q511 850 470 904Z','#bbc5ba'),tr(0,-dy))+
  rep(5,j=>G(P('M0 0q72 -17 152 -6t174 0q-115 12 -182 9t-144 -3Z','#f0eedf'),tr(163+j*145-h.dr*.11,227+j%3*63-dy*.14,1.1)));
  const bs=2.95*h.speed;const a=at(bs-175,46,-5),b=at(bs+175,46,-5),m=at(bs,46,-4);
  back+=P('M'+xy(a)+'Q'+xy(m)+' '+xy(b)+'l0 15Q'+num(m.x)+' '+num(m.y-4)+' '+xy({x:a.x,y:a.y+15})+'Z','#758475');
  back+=objectAt(h,bs+264,-189,painter(t),2.01)+repeatedProps(h,720,-203,j=>G(pine(0,0,.82,'#778678')+pine(44,3,.54,'#879080')),.92);
  near=repeatedProps(h,697,200,j=>G(P('M0 3q5 -104 -15 -214','none',st('#526653',4))+rep(6,k=>G(P('M0 0q13 -30 36 -37q-12 23 -36 37Zm0 0q-19 -3 -32 -21q22 4 32 21Z','#61745f'),tr(-k*2,-k*30)))),.8);
  if(t>2.7&&t<4.8)near+=G(scrollReveal(t),tr(199,270,.54));
  hud=G(R(0,0,34,78,'#a35e48')+T(17,30,'山',21,'#efe5c9','text-anchor="middle"')+T(17,58,'行',21,'#efe5c9','text-anchor="middle"'),tr(777,431));
  break}
 case 13:{
  const sky=R(0,0,1200,675,'#e5d6b8')+C(899-h.dr*.024,136,45,'#be6e58')+
  P('M404 325q176 -42 310 -218q97 135 269 205Z','#708a94',st('#3d5865',2))+
  P('M670 166l44 -59l48 65l-27 -17l-8 9l-17 -20l-13 20l-11 -8Z','#eee5c8')+
  hills(328,'#91a197',25);
  const sea=R(0,335,1200,340,'#7398a4')+
  rep(58,j=>P('M'+((rand(j)*1300-h.dr*.23+2600)%1300-50)+' '+(345+rand(j+44)*170)+'q27 -5 63 -1','none',st(j%3?'#b5c3b7':'#526e7c',1.6)));
  const keyBlock=G(shorePrint(),tr(-h.dr*.035,7,.96));
  actors=objectAt(h,h.speed*2,-142,spectator('sailor',t),1.15);
  const crest=opacity(G(printWave(t),tr(-66,70,1.05)),options.crestExposure??1);
  blocks=[sky,sea+keyBlock,crest+coastalBank(h)];back=blocks.join('');
  near='<defs><clipPath id="crestcut">'+R(0,0,695,308,'white')+'</clipPath></defs>'+G(crest,'clip-path="url(#crestcut)"')+petals(23,t,'#ddafaa');
  hud=R(18,18,1164,637,'none',st('#9f8e71',2))+G(R(0,0,38,82,'#c0745e',st('#564e45',1.3))+T(19,31,'波',20,'#f4e7cd','text-anchor="middle"')+T(19,56,'下',20,'#f4e7cd','text-anchor="middle"')+mt(18,73,'十四',9,'#f8ece0','text-anchor="middle"'),tr(1114,462));break}
 case 14:{
  const [forest,cut]=paperWood(t);
  back=G(forest,'transform="translate('+(-63-h.dr*.04)+' -14) scale(1.16 1.04)"')+
  repeatedProps(h,680,-182,j=>cutTree(0,0,.9,j%2?'#739889':'#87a493',j),.93);
  actors=objectAt(h,h.speed*3.3,-101,G(P('M-22 0l1 -18l-5 -9l7 -15l10 2l-6 -29l6 -7l11 32l5 -34l7 2l-4 36l10 9l-1 15l-17 9l2 9Z','#ede4c5')+C(10,-30,1.6,'#687765')),.9);
  near=repeatedProps(h,607,216,j=>G(P('M0 0q-4 -13 -2 -31l7 1l5 30Z','#edd4aa')+P('M-24 -28Q-9 -77 15 -49l13 23l-20 4Z','#ae755c')+C(-6,-40,3,'#f0d6a9')),1.04)+
  G(cut,'transform="translate('+(-15-h.dr*.015)+' 0) scale(1.048 1)"');
  break}
 case 15:{
  back=R(0,0,1200,675,'#d3dbc2')+
  fixedDrawing('garden-oil-horizon',()=>rep(162,j=>{let x=rand(j)*1230,y=135+rand(j+821)*141;return P('M'+x+' '+y+'q-17 -30 4 -37q19 -17 31 5q7 20 -4 29Z',['#9bb299','#b2bea2','#91aa97','#abb699'][j%4])}))+R(0,279,1200,396,'#8db3ad')+
  fixedDrawing('oil-river',()=>rep(810,j=>{let x=rand(j)*1200,y=rand(j+872)*675;return L(x,y,x+7+rand(j+215)*25,y-2+rand(j+474)*4,(y<276?['#c7ceac','#ecdfa9','#9db6a0']:['#b4c1a4','#78a2a6','#d0c8a8'])[j%3],2+rand(j+664)*3.6)}))+
  rep(67,j=>G(P('M-17 1q8 -9 32 -3l-12 5l14 -1q-18 9 -34 -1Z','#718e7d')+(j%3?'':P('M-5 -1q-7 -10 0 -6q4 -10 6 -1q8 -5 4 4Z','#e3adbd')),tr(rand(j)*1200,388+rand(j+141)*281,.65+rand(j+60))))+
  G(P('M0 280Q211 268 409 283T810 274T1200 279L1200 289Q957 282 794 291T396 291T0 291Z','#a3b191')+
 rep(39,j=>P('M'+(j*33)+' '+(278+Math.sin(j*.34)*5)+'q7 -8 19 0Z','#8eaa89')),tr(-h.dr*.035,0));
  const bridge=h.speed*3.56;
  for(let k=0;k<10;k++){const d=bridge-270+k*64,a=at(d,-q.width,0),b=at(d,-q.width,49),c=at(d+64,-q.width,49);
   actors+=P('M'+xy(a)+'L'+xy(b)+'L'+xy(c),'none',st('#6f998c',5*b.k))}
  const lag=takeShot(15,t,{motionTime:t-.25}),water=h.anchor.y+25;
  back+=G(paintedRider(lag),'transform="translate(24 '+(water*1.43)+') scale(1 -.43)" opacity=".57" filter="url(#bleed)"');
  actors+=objectAt(h,bridge+248,-139,G(spectator('artist',t)+P('M-29 -44q22 -41 59 -12l-30 -1Z','#e6d1ae')+L(2,-59,7,-22,'#9c8d72',2)),1.24);
  near=willowCanopy(t)+pondGlints(t);break}
 case 16:{
  const panels=['#ffcb4b','#48a6c4','#ee8171','#edc58c'];
  back=R(0,0,1200,675,panels[0])+R(0,0,1200,675,'url(#dots)','opacity=".33"')+rep(16,j=>G(P('M0 0l1300 -12v29Z','#f7e4aa'),tr(816,318,1,j*22.5)));
  actors+=objectAt(h,h.speed*2.6,-99,spectator('fan',t),1.3);
  break}
 case 17:{
  back=R(0,0,1200,675,'#a47d79')+G(R(-120,0,1490,520,'url(#brick)'),tr(-((h.dr%80)+80)%80,0))+
  P('M0 493l1200 -20v202H0Z','#55515e');
  const wallTag=(d,bg,text1,colour)=>objectAt(h,d,-111,G(R(-35,-304,890,296,bg)+R(-35,-304,890,296,'url(#brick)')+
    T(-5,-116,text1,143,colour,'font-weight="1000" font-style="italic" stroke="#302b3a" stroke-width="7" paint-order="stroke" transform="rotate(-6)"')+
    rep(13,k=>R(4+rand(k)*520,-113,3+k%4,20+rand(k+81)*54,colour,'rx="2"'))),1);
  back+=wallTag(-500,'#a47a76','RIDE','#83cbb8')+wallTag(1810,'#917779','RE: DRAW','#d7a3bd');
  const pos=h.at(470,-111,0),scale=pos.k;
  back+=G(R(0,-330,1100,327,'#63616c',st('#403b48',8))+rep(27,j=>L(0,-318+j*11,1100,-318+j*11,'#454252',2)),tr(pos.x,pos.y,scale));
  const progress=clamp((clock-.85)/2.4);let travel=signatureLength*progress,tag='',pen=signatureSegments[0].path.getPointAtLength(0);
  for(const seg of signatureSegments){let p=clamp(travel/seg.length);if(travel>=0)pen=seg.path.getPointAtLength(p*seg.length);tag+=markerStroke(seg,p,'#382c40',9)+markerStroke(seg,p,'#f0b0cd',4.9);travel-=seg.length}
  const base=at(h.speed*.85+55,-114,258);
  back+=G(tag,'transform="translate('+base.x+' '+base.y+') scale('+scale*4.45+' '+scale*1.05+')"');
  const mark={x:base.x+pen.x*scale*4.45,y:base.y+pen.y*scale*1.05};
  let paintTip=mark;
  if(t>=3.4){
   const target=at(h.speed*4.34+62,-94,139),u=ease((t-3.4)/.94);
   const ctrl={x:mixN(mark.x,target.x,.48),y:mark.y-48},tip={x:mixN(mixN(mark.x,ctrl.x,u),mixN(ctrl.x,target.x,u),u),y:mixN(mixN(mark.y,ctrl.y,u),mixN(ctrl.y,target.y,u),u)};
   paintTip=tip;
   back+=P('M'+xy(mark)+'Q'+xy(ctrl)+' '+xy(target),'none',st('#e8ed9f',5)+' pathLength="1" stroke-dasharray="1" stroke-dashoffset="'+(1-u)+'"');
   if(u>.85)back+=P('M'+xy(target)+'l-23 -3m23 3l-8 -20','none',st('#e8ed9f',5));
  }
  actors+=objectAt(h,1670,-121,spectator('punk',t),1.45);
  const nozzle=h.local(118,37,25);
  near+=G(R(-5,0,12,27,'#98e5ca',st('#38343c',2))+R(-3,-4,6,5,'#ebcf8b'),tr(nozzle.x,nozzle.y,nozzle.k,-17));
  if(t>.85&&t<3.25||t>=3.4&&t<4.34)near+=rep(42,j=>{const d=rand(j),f=rand(j+Math.floor(t*12));return C(mixN(nozzle.x,paintTip.x,d)+(f-.5)*(3+d*8),mixN(nozzle.y,paintTip.y,d)+(rand(j+97)-.5)*(2+d*10),.65+rand(j+31),t<3.4?'#efb8d3':'#e8ed9f')});
  break}
 case 18:{let stage=stageNineteen(h.clock,options.lens?1152:0);back=stage.sky;road=stage.ground;const gx=stage.finish;
  const keeper=G(P('M0 -43h12v4h8v18h-5v5h-13v-5h-6v-16h4Z','#ffe6b1')+P('M-7 -15h24v22h-28v-17h4Z','#698e72')+R(1,-32,4,4,'#385155')+
   P('M12 -7h8v-10h6v23h-14Z','#e5c48c')+R(23,t>=3?-47:-27,4,51,'#655c4b')+P('M27 0h25l-9 6l8 6H27Z',t>=3?'#f6d271':'#bbaa83',tr(0,t>=3?-46:-25)));
  if(gx<1500)actors+=G(keeper,tr(gx-63,492,1.3));
  bird=G(pixelRider(h.clock),tr(stage.x,stage.y,stage.z));hud=stage.fg;break}
 case 19:{
  back=R(0,0,1200,675,'url(#night)')+cityPan(h,'#39364e','#9a8298',98,289,.91)+R(0,327,1200,348,'#243043');
  back+=cityTowers(h)+districtViaduct(h);
  back+=repeatedProps(h,388,-234,j=>G(R(-19,-153,40,104,'#2c2f47',st(j%2?'#e89ac3':'#82ddcf',2))+T(0,-115,j%2?'深':'夜',23,'#a5dfd8','text-anchor="middle"')+T(0,-79,j%2?'湾':'市',23,'#e0a2c7','text-anchor="middle"')),1);
  const id='holo-subject-'+Math.round(t*600),foot=h.anchor,face=h.local(124,-42,0);defs='<defs><g id="'+id+'">'+bird+'</g></defs>';
  const screen=t<2?G(T(170,84,'深湾夜航',35,'#cfbad6','text-anchor="middle"')+mt(170,121,'MIDNIGHT FERRY',17,'#89ded8','text-anchor="middle"')):
   graphicWindow(8,8,327,148,'<use href="#'+id+'"/>',[face.x-173*face.k,face.y-55*face.k,346*face.k,156*face.k].join(' '));
  const sign=R(0,0,344,188,'#263148',st('#ec9dc9',4))+screen+mt(17,176,t<2?'NIGHT   /   03':'● LIVE   /   CAMERA 20',14,'#e8b6d5');
  const bx=790-79*ease(t/2),by=68+38*(1-ease(t/2));
  back+=G(sign,'transform="translate('+bx+' '+by+') skewY(-5)"');
  road+=G('<use href="#'+id+'"/>','transform="translate(0 '+(foot.y*1.63+7)+') scale(1 -.63)" opacity=".37"')+
  G(sign,'transform="translate('+bx+' '+(foot.y*1.66+20)+') scale(1 -.43) skewY(-5)" opacity=".16"');
  actors+=objectAt(h,1260,-219,G(spectator('punk',t)+P('M-27 -52q23 -34 58 0q-23 -8 -58 0Z','#bf8cae')+L(1,-62,5,-16,'#a5d6d8',2)),1.24);
  bird='<use href="#'+id+'"/>';
  near+=rep(87,j=>{let yy=(rand(j+28)*698+t*239)%698-17;return L(rand(j)*1240-yy*.08,yy,rand(j)*1240-yy*.08-2,yy+13,'#b5c9db',1,'opacity=".45"')})+
   rep(28,j=>{let u=(rand(j)*2+t)%1;return '<ellipse cx="'+rand(j+82)*1200+'" cy="'+(456+rand(j+14)*208)+'" rx="'+(2+11*u)+'" ry="'+(1+1.4*u)+'" fill="none" stroke="#91aeb8" opacity="'+(.44*(1-u))+'"/>'});
  break}
 case 20:{
  back=R(0,0,1200,675,'url(#vsky)')+C(611,167,102,'#ffe6be')+rep(8,j=>R(509,173+j*11,205,2+j*.6,'#efb0c9'))+
  mountains(324,'#a498b6',23,111)+R(0,315,1200,360,'#9386b3')+repeatedProps(h,632,-314,j=>facetedPalm(0,0,1,j%2?3:-6),1.2);
  road=gridDeck(h);near=repeatedProps(h,721,409,j=>facetedPalm(0,0,.91,j%2?-4:8),1.07);
  break}
 case 21:{
  back=R(0,0,1200,675,'#192a31')+rep(87,j=>R((rand(j)*1250-clock*(16+j%3*17)+2500)%1250-25,rand(j+95)*573,13+rand(j+23)*145,3+rand(j+34)*17,['#354653','#665270','#638789'][j%3],'opacity=".71"'))+
  rep(25,j=>mt((j*117-clock*59+2400)%1200,153+rand(j+31)*203,['0xEF','//FRAME','EOF','00101'][j%4],14,'#a1b3bc'));
  const id='lost-bike-'+Math.round(clock*1000);
  defs='<defs><g id="'+id+'">'+bird+'</g></defs>';
  actors=rep(t>1.05&&t<4.68?4:0,j=>'<use href="#'+id+'" transform="translate('+(-32-j*30)+' '+(j%2*9)+')" opacity="'+(.1+j*.04)+'"/>');
  const bodyUse='<use href="#'+id+'"/>';
  const split=Math.max(1,4+2*Math.sin(clock*18));
  const channels='<use href="#'+id+'" transform="translate('+split+' 0)" filter="url(#red-channel)"/>'+
   '<use href="#'+id+'" transform="translate('+(-split)+' 0)" filter="url(#cyan-channel)"/>'+bodyUse;
  bird=channels;
  if(t>=2){
   const enter=ease((clock-2)/.38),escape=ease((clock-2.5)/1.18),locked=enter*(1-escape);
   const bx=395,by=143,w=563;actors+=G(R(5,7,w,203,'#bc7698')+R(0,0,w,203,'#c6d6cd',st('#786580',3))+
    R(4,4,w-8,27,'#63556e')+mt(16,23,'render.sys   /   0x0016',14,'#f2e3e9')+R(13,43,206,147,'#314048')+
    T(241,99,'鹈鹕无法渲染',29,'#46394a','font-weight="bold"')+mt(243,129,'BUFFER 22     /     '+(escape>.9?'RESTORED':'HALTED'),13,'#675c6e')+
    R(244,151,246,7,'#97aaa1')+R(244,151,246*escape,7,'#578a76'),tr(bx,by));
   const k=1-.64*locked,point=h.anchor,tx=(bx+108-point.x)*locked,ty=(by+174-point.y)*locked;
   bird=G(channels,'transform="translate('+(tx+point.x*(1-k))+' '+(ty+point.y*(1-k))+') scale('+k+')"');
  }
  near=R(0,0,1200,675,'url(#scan)','opacity=".23"');break}
 }
 return {h,back,road,actors,bird,near,hud,defs,blocks};
}
function stageNineteenPhase(t){return Math.floor(t*8+1e-8)/8}
function journeyParts(i,t,options={}){
 const first=sceneContent(i,t,options);
 return i<12?first:secondSet(i,t,first,options);
}
function journeyScene(i,t,pedalTime=t){
 if(i===20&&t>=2&&t<4)t=2+Math.min(.25,(t-2)%.5);
 if(i===21&&t>=2.5&&t<3.2)t=2.5;
 return assemblePlate(i,t,journeyParts(i,t,{motionTime:pedalTime}));
}
function candyShop(h,s,b,j){
 const p=(x,y,z)=>h.at(s+x,b+z,y),base=p(0,0,0);
 if(!base.visible||base.x< -280||base.x>1500||base.y< -120||base.y>730)return '';
 const sign=Math.sign(b),face=-sign*63,flavours=['#e5acb8','#b6b1d3','#a8cbc2','#e5bd93'],roof=flavours[Math.abs(j)%4];
 let shop=worldBox(h,s,b,237,207,8,'#a5bfa2','#93ac96','#d0ddba')+
 worldBox(h,s,b,168,126,106,'#f6e6c8','#e6cba9','#fff0cd');
 for(let k=-1;k<=1;k++){
  const za=face+k*3;
  shop+=polygon([p(k*49-19,22,za),p(k*49+16,22,za),p(k*49+16,65,za),p(k*49-19,65,za)],k?'#a9cbd1':roof,st('#b79b8e',1.6*base.k));
  if(k)shop+=P('M'+xy(p(k*49,23,za))+'L'+xy(p(k*49,64,za)),'none',st('#fbecd2',2*base.k));
 }
 const brim=(a)=>p(a,111,face*1.15),ridge=(a)=>p(a,154,0);
 shop+=polygon([brim(-97),brim(96),ridge(82),ridge(-80)],roof,st('#b89e96',1.4*base.k))+
 polygon([ridge(-80),ridge(82),p(96,111,-face*1.15),p(-95,111,-face*1.15)],'#e6cfcc');
 for(let n=0;n<8;n++){
  const a=-96+n*24;shop+=P('M'+xy(brim(a))+'Q'+xy(p(a+12,82,face*1.15))+' '+xy(brim(a+24))+'Z',n%2?'#fae6dc':roof);
 }
 shop+=objectAt(h,s+35,b, G(R(-6,-33,18,33,'#dca8a2')+R(-9,-35,24,8,'#f7d9bf','rx="3"')),1,143);
 if(j%3===0){const board=p(0,83,face*1.19);shop+=G(R(-46,-11,92,19,'#fff0d3','rx="8"')+mt(0,3,'PATISSERIE',10,'#997685','text-anchor="middle"'),tr(board.x,board.y,board.k))}
 return shop;
}
function townPlots(h,retract=0){
 let pieces=[];
 for(let j=-6;j<15;j++){
  const d=j*373,b=(j%2?1:-1)*(275+rand(j+50)*57),point=h.at(d,b);
  if(!point.visible||point.x< -230||point.x>1440||point.y< -110||point.y>790)continue;
  const lane=polygon([h.at(d-24,b),h.at(d+24,b),h.at(d+24,Math.sign(b)*h.q.width),h.at(d-24,Math.sign(b)*h.q.width)],'#e8d7ad');
  let art=lane+candyShop(h,d,b,j);
  const tree=h.at(d+102,b+Math.sign(b)*60);
  art+=G(R(-4,-55,8,55,'#b99e83')+C(0,-63,22,'#b8cca0',st('#9cb995',2))+C(-6,-70,10,'#dce2bc'),tr(tree.x,tree.y,tree.k));
  if(retract>0){
   const slide=ease((retract-rand(j+48)*.09)/.82),side=point.x<h.anchor.x?-1:1;
   const k=1-.40*slide;
   art=G(art,'transform="translate('+num(side*slide*1060+point.x*(1-k))+' '+num(point.y*(1-k)-Math.sin(pi*slide)*45)+') scale('+k+')"');
  }
  pieces.push([point.depth,art]);
 }
 return pieces.sort((a,b)=>a[0]-b[0]).map(a=>a[1]).join('');
}
function coastalBank(h){
 let s='';const w=h.q.width;
 for(let j=Math.floor((h.s-2350)/130);j<Math.ceil((h.s+2350)/130);j++){
  const a=j*130,b=a+130,coast=d=>w*1.24+12*Math.sin(d/155);
  const corners=[[a,coast(a)],[b,coast(b)],[b,-16000],[a,-16000]],visible=[];
  for(let k=0;k<4;k++){
   const [d,z]=corners[k],[e,v]=corners[(k+1)%4],A=h.at(d,z,-2),B=h.at(e,v,-2);
   if(A.visible)visible.push(A);
   if(A.visible===B.visible)continue;
   let lo=0,hi=1;
   for(let n=0;n<12;n++){const m=(lo+hi)/2;if(h.at(mixN(d,e,m),mixN(z,v,m),-2).visible===A.visible)lo=m;else hi=m}
   const m=A.visible?lo:hi;visible.push(h.at(mixN(d,e,m),mixN(z,v,m),-2));
  }
  if(visible.length<3)continue;
  s+=polygon(visible,'#d9c59e','stroke="#d9c59e" stroke-width="1"');
  for(let n=0;n<4;n++){const z=-w-64-145*n-91*rand(j+n),A=h.at(a+17,z),B=h.at(b-37,z-11);
   if(A.visible&&B.visible)s+=P('M'+xy(A)+'L'+xy(B),'none',st('#b8a381',1.1))}
 }
 return s;
}
function cityTowers(h){
 const buildings=[];
 for(let j=-6;j<17;j++){
  const d=j*274,b=(j%2?1:-1)*(340+rand(j+45)*61),height=198+rand(j+68)*376,sg=Math.sign(b),p=h.at(d,b);
  if(!p.visible||p.x< -480||p.x>1650)continue;
  let block=worldBox(h,d,b,213,135,height,'#29364c','#30384d','#596177');
  const wall=(x,y)=>h.at(d+x,b-sg*69,y),cl=['#ab86aa','#74acb8','#a0a0c1'][Math.abs(j)%3];
  for(let row=0;row<Math.floor(height/34);row++)for(let col=0;col<5;col++){
   const x=-92+col*38,y=16+row*32;
   if(rand(j*33+row*5+col)<.36)continue;
   block+=polygon([wall(x,y),wall(x+19,y),wall(x+19,y+9),wall(x,y+9)],cl);
  }
  block+=P('M'+xy(wall(-99,6))+'L'+xy(wall(-99,height-22))+'L'+xy(wall(-67,height-22)),'none',st('#64788a',Math.max(1,3*p.k)));
  if(j%2===0){const a=wall(28,40),z=Math.min(1.7,a.k);
   block+=G(R(0,-65,31,65,'#273748',st('#be87b3',2))+T(15,-39,'夜',14,'#e6a8bf','text-anchor="middle"')+T(15,-15,'行',14,'#93d8d1','text-anchor="middle"'),tr(a.x,a.y,z))}
  buildings.push([p.depth,block]);
 }
 return buildings.sort((a,b)=>a[0]-b[0]).map(k=>k[1]).join('');
}
function stageJudgement(h){
 const t=h.t,n=Math.min(9,Math.floor(2*t)),miss=n===9,s=h.s+h.q.base*.44;
 const a=h.at(s,-h.q.width,1),b=h.at(s,h.q.width,1),contact=h.at(s,0,4);
 const pulse=1-(t*2)%1,foot=h.local(h.q.base*.44+18*Math.cos(h.clock*turn),162+18*Math.sin(h.clock*turn),14);
 let line=P('M'+xy(a)+'L'+xy(b),'none',st('#e7fff6',4));
 if(t>=1.5&&t<4.5)line+=P('M'+xy(foot)+'Q'+xy({x:foot.x+24,y:contact.y})+' '+xy(contact),'none','stroke="#f6e7bd" stroke-width="2" stroke-dasharray="3 6"')+star(contact.x,contact.y,12*pulse+2,'#fcf5b3');
 if(t>=5.35&&t<6){
  const fall=clamp((t-5.35)/.65),last=h.at(h.s+h.q.base*.5+(1-fall)*390,0,118*(1-fall));
  line+=G(P('M-25 0l13 -7h28l10 6l-13 8h-26Z','#bcf6e8',st('#fff4d1',2.2))+star(0,0,6,'#fff4cb'),tr(last.x,last.y,Math.max(.25,last.k)));
 }
 return line+mt(951,156,'COMBO',19,'#c4f0dc','letter-spacing="5"')+mt(948,220,miss?'00':String(37+n),61,'#fff3d9','font-weight="bold"')+
 mt(951,247,'SCORE '+String(36000+n*480).padStart(6,'0'),14,'#f0cede')+
 (t>=1.5&&t<5.3?G(T(0,0,miss?'MISS':'PERFECT',47,miss?'#ff9eb9':'#ffefb5','font-weight="900" text-anchor="middle"'),tr(906,383,1+pulse*.07,-8)):'');
}
function hullPoints(points){
 const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 function half(a){const h=[];for(const p of a){while(h.length>=2&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p)}h.pop();return h}
 return half(sorted).concat(half(sorted.reverse()));
}
function roundContour(points){
 const middle=(a,b)=>({x:(a.x+b.x)*.5,y:(a.y+b.y)*.5});
 let d='M'+xy(middle(points.at(-1),points[0]));
 for(let j=0;j<points.length;j++)d+='Q'+xy(points[j])+' '+xy(middle(points[j],points[(j+1)%points.length]));
 return d+'Z';
}
function chunkyCliffs(h){
 const group=[],start=1.85*h.speed+h.q.base*.67,end=6*h.speed;
 for(let k=-12;k<39;k++){
  let a=k*130,b=a+130;if(a>=start&&b<=end)continue;
  if(a<start&&b>start)b=start;else if(a<end&&b>end)a=end;
  const span=d=>196+46*Math.sin(d/293),w1=span(a),w2=span(b);
  const A=h.at(a,-w1),B=h.at(b,-w2),C0=h.at(b,w2),D=h.at(a,w1);
  if(![A,B,C0,D].every(p=>p.visible))continue;
  let terrain=polygon([A,B,C0,D],k%2?'#9db77b':'#a0b87d','stroke="#a0b87d" stroke-width="1"')+
  polygon([D,C0,h.at(b,w2-14,-139-rand(k)*69),h.at(a,w1-14,-164)],'#899079')+
  polygon([D,h.at(b-43,w2-1,-6),h.at(a+29,w1-11,-123)],'#afb197');
  for(const cut of [a,b])if(Math.abs(cut-start)<.01||Math.abs(cut-end)<.01){let w=span(cut);terrain+=polygon([h.at(cut,-w),h.at(cut,w),h.at(cut,w-16,-158),h.at(cut,-w+14,-164)],'#8c927d')}
  group.push([D.depth,terrain]);
 }
 return group.sort((a,b)=>a[0]-b[0]).map(v=>v[1]).join('');
}
function campusGate(h){
 const s=85,w=h.q.width;
 let a=worldBox(h,s-217,0,225,2.6*w,155,'#dce8e5','#bbd0d0','#fbf8ed');
 for(let m=0;m<3;m++)for(let j=0;j<14;j++){
  const z=-w*1.21+j*w*.18,y=20+m*43;
  a+=polygon([h.at(s-99,z,y),h.at(s-99,z+29,y),h.at(s-99,z+29,y+25),h.at(s-99,z,y+25)],'#9bbbc8');
 }
 a+=worldBox(h,s,-w,22,22,167,'#c2d2d3','#9fb9bc','#e8ece4')+worldBox(h,s,w,22,22,167,'#c2d2d3','#9fb9bc','#e8ece4');
 const p1=h.at(s,-w,165),p2=h.at(s,w,165),p3=h.at(s,w,130),p4=h.at(s,-w,130);
 return a+polygon([p1,p2,p3,p4],'#6e98a4')+T((p1.x+p2.x)/2,(p3.y+p4.y)/2-3,'晴　海　学　园',Math.max(10,21*p1.k),'#faf7e8','text-anchor="middle" letter-spacing="3"');
}
function finishRider(i,clock){
 if(i===18)return pixelRider(clock);
 const q=routeSpecs[i],local=(x,y,z=0)=>({x,y,k:1,depth:z,visible:true});
 const h={i,q,t:6+clock,s:clock*turn*53,clock,studio:true,air:0,local,
  anchor:local(q.base/2,244),matrix:'matrix(1 0 0 1 0 0)',eye:V(0,0,1),basis:{b:V(0,0,1),f:V(1,0,0)},project:p=>local(p.x,p.y,p.z)};
 return paintedRider(h);
}
function districtViaduct(h){
 const spans=[],side=-h.q.width-138;
 for(let j=-4;j<17;j++){const s=j*244,a=h.at(s,side,192),b=h.at(s+244,side,192),c=h.at(s+244,side,210),d=h.at(s,side,210);
  if(!a.visible||!b.visible||Math.max(a.x,b.x)<-60||Math.min(a.x,b.x)>1260)continue;
  const ground=h.at(s,side+9,0);
  spans.push([a.depth,polygon([a,b,c,d],'#38495c',st('#718791',.9))+P('M'+xy(a)+'L'+xy(ground),'none',st('#354451',Math.min(23,14*a.k)))+
   rep(5,k=>P('M'+xy(h.at(s+k*49,side,208))+'L'+xy(h.at(s+k*49+24,side,193))+'L'+xy(h.at(s+k*49+48,side,208)),'none',st('#82909c',1.35*a.k)))]);
 }
 const start=2000-142*h.t;for(let j=0;j<2;j++){const s=start+j*217;
  const pts=[h.at(s,side,215),h.at(s+208,side,215),h.at(s+208,side,245),h.at(s,side,245)];
  if(pts.every(p=>p.visible))spans.push([pts[0].depth+2,polygon(pts,'#929aa9')+rep(8,k=>polygon([h.at(s+6+k*25,side+1,226),h.at(s+20+k*25,side+1,226),h.at(s+20+k*25,side+1,237),h.at(s+6+k*25,side+1,237)],'#f4d2ab'))]);
 }
 return spans.sort((a,b)=>a[0]-b[0]).map(k=>k[1]).join('');
}
function maintenanceBay(h){
 let s='';
 for(let j=-2;j<12;j++){
  const pos=j*347,off=-242,a=h.at(pos,off,78),b=h.at(pos+347,off,78);
  if(!a.visible||!b.visible||Math.max(a.x,b.x)<-290||Math.min(a.x,b.x)>1490)continue;
  s+=P('M'+xy(a)+'L'+xy(b),'none',st('#64736c',12*a.k))+P('M'+xy(h.at(pos,off,81))+'L'+xy(h.at(pos+347,off,81)),'none',st('#b0b3a3',2.7*a.k));
  for(let k=0;k<4;k++)s+=P('M'+xy(h.at(pos+k*86,off-9,78))+'L'+xy(h.at(pos+k*86,off+9,78)),'none',st('#464f49',4*a.k));
  if(j%2){const A=h.at(pos,-405,180),B=h.at(pos,-155,180);
   s+=P('M'+xy(h.at(pos,-405,0))+'L'+xy(A)+'L'+xy(B)+'L'+xy(h.at(pos,-155,0)),'none',st('#8a7661',7*a.k))+
    rep(6,k=>P('M'+xy(h.at(pos,-405+k*41,178))+'L'+xy(h.at(pos,-385+k*41,161))+'L'+xy(h.at(pos,-365+k*41,178)),'none',st('#8a7661',2.6*a.k)));
  }
 }
 return s;
}
function gridDeck(h){
 // Straight world lines project to straight image lines. Clip their near endpoints
 // before projection instead of tessellating thousands of invisible grid squares.
 const q=h.q,at=h.at;
 const away=V(-Math.sin(h.yaw*rad),0,-Math.cos(h.yaw*rad));
 const horizon=clamp(h.project(plus(ground(q,h.s),times(away,1000000))).y,-700,675);
 let deck=R(0,horizon,1200,Math.max(0,676-horizon),'#8782aa');
 function rail(s1,b1,s2,b2,col){
  let a=at(s1,b1),b=at(s2,b2);
  if(!a.visible&&!b.visible)return '';
  if(!a.visible||!b.visible){
   let lo=0,hi=1;const first=a.visible;
   for(let n=0;n<12;n++){const u=(lo+hi)/2,p=at(mixN(s1,s2,u),mixN(b1,b2,u));if(p.visible===first)lo=u;else hi=u}
   const u=first?lo:hi,p=at(mixN(s1,s2,u),mixN(b1,b2,u));if(first)b=p;else a=p;
  }
  return P('M'+xy(a)+'L'+xy(b),'none',st(col,1.5));
 }
 for(let j=-27;j<=27;j++)deck+=rail(h.s-1600,j*141,h.s+7500,j*141,'#95dcd4');
 for(let j=Math.floor((h.s-1700)/142);j<Math.ceil((h.s+7600)/142);j++)deck+=rail(j*142,-4800,j*142,4800,'#d9aece');
 return deck;
}
const shotsZh=['斜切海报 · 对角线冲刺','星图航线 · 大远景侧跟','金饰横幅 · 俯瞰转侧后滑翔','校园界面 · 正面驶近','樱花立绘 · 横移对话场景','小镇地图 · 等轴测弯道','音符轨道 · 正面纵深','4:3 胶片 · 侧跟坡道','宽银幕 · 低机位铁路道口','报纸头版 · 穿越分栏','设备监控 · 斜俯传送带','工程图纸 · 正交尺寸线','山水立轴 · 自上而下','横幅木版 · 向左过浪','纸雕盒 · 层间横移','画架油画 · 由近及远','分格漫画 · 跨格骑行','长墙壁画 · 横移喷绘','横版游戏 · 卷轴跳台','雨夜电影 · 高空俯冲','复古桌面 · 驶向消失点','故障播放器 · 碎片跳帧'];

// The printed margins and apertures belong to the work. The same registration
// maps its scenery, wheel contacts and figure into the final film coordinates.
function plateView(i,t,open=0){
 switch(i){
 case 7:{const x=150*(1-open);return [x,0,1200-2*x,675,x,0,1200-2*x,675]}
 case 8:{const y=80*(1-open);return [0,y,1200,675-2*y,0,y-12,1200,675-2*y]}
 case 12:return [353,0,494,675,353,0,494,675];
 case 13:return [22,24,1156,627,0,0,1200,675];
 case 14:return [63,92,1077,503,14,39,1169,570];
 case 15:{const z=.76+.26*ease(t/1.45);return [600*(1-z),337.5*(1-z),1200*z,675*z,0,0,1200,675]}
 case 16:return [16,255,1168,403,0,148,1200,415];
 case 20:{const u=ease((t-.26)/.95);return [134*u,147*u,1200-401*u,675-237*u,0,0,1200,675]}
 default:return [0,0,1200,675,0,0,1200,675];
 }
}
function platePoint(i,t,p){
 const [x,y,w,h,u,v,a,b]=plateView(i,t);
 return {x:x+(p.x-u)*w/a,y:y+(p.y-v)*h/b,k:p.k*h/b};
}
function comicPanels(c){
 const {h}=c,p=h.local(h.q.base*.86+4,66,25),plate=c.back+c.road+c.actors+c.bird;
 function panel(x,y,w,z,vb){return R(x-4,y-4,w+8,z+8,ink)+graphicWindow(x,y,w,z,plate,vb)}
 return R(0,0,1200,675,paper)+panel(16,16,350,222,[p.x-68,p.y-55,160,102].join(' '))+
  panel(384,16,800,222,'0 117 1200 333')+R(12,251,1176,411,ink);
}
function fourPrints(c){
 const {h}=c,plate=c.back+c.road+c.actors+c.bird;
 const colors=[['#ffd85b','#38a5bd'],['#70bfcb','#e66979'],['#e8879e','#eab85f'],['#f1c08d','#8195c8']];
 let page=R(0,0,1200,675,paper);
 for(let j=0;j<4;j++){
  let art=plate.replaceAll('#ffcb4b',colors[j][0]).replaceAll('#e8c851',colors[j][1]).replaceAll(palettes[16][0],['#fff1c4','#f2cccc','#d2f1de','#ffe1ad'][j]);
  if(j===3)art=G(art,'transform="translate(1200 0) scale(-1 1)"');
  const x=12+(j%2)*594,y=13+Math.floor(j/2)*330,focusX=j===3?1200-h.anchor.x:h.anchor.x;
  page+=R(x-4,y-4,590,325,ink)+graphicWindow(x,y,582,317,art,[focusX-320,h.anchor.y-308,640,348].join(' '));
 }
 return page;
}
function desktopWindows(t,h){
 let panels='';
 if(t>.8)panels+=G(R(6,7,213,167,'#8b7e98')+R(0,0,213,167,'#ddcfdd',st('#847691',2))+R(3,3,207,23,'#897f9e')+mt(10,20,'TAPE DECK',13,'#fff1ee')+
  R(12,36,189,93,'#655f7d')+rep(2,j=>G(C(0,0,28,'#c4b2cb')+rep(3,k=>G(C(0,-14,6,'#716984'),tr(0,0,1,k*120+h.clock*148))),tr(63+j*86,83)))+mt(14,151,'33⅓ RPM     STEREO',13,'#6f637d'),tr(951,395));
 if(t>1.45)panels+=G(R(6,6,234,299,'#8c7f93')+R(0,0,234,299,'#d9cbd9',st('#89778c',2))+R(3,3,228,22,'#8c7e9e')+
  mt(13,19,'MUSEUM.EXE    ×',13,'#fff5f3')+R(9,33,216,252,'#b8acc6')+G(marbleBust(t),tr(0,-5,.9)),tr(915,65));
 return panels;
}
function assemblePlate(i,t,c,separate=false,settings={}){
 const {h}=c,view=plateView(i,t,settings.open||0),[x,y,w,z]=view;
 let mount='',edge='',header=titleCard(i,t,['#292e32','#233549','#415b50','#47788e','#967186','#a0788a','#534261','#526a75','#47697e','#675946','#414d48','#285989','#566257','#445c68','#436b5d','#748c7c',ink,'#4b4253','#38545a','#242e43','#6f668c','#43394d'][i]);
 let background=c.back,road=c.road+c.actors,near=c.near,print=c.hud,defs=c.defs||'';
 const glint=star(i===12?726:1093,366,4+4*Math.cos(h.clock*turn)**8,palettes[i][2]);
 function crop(markup,role){
  if(!markup)return '';
  if(i===21){
   const id='raster-'+role+'-'+Math.round(h.clock*1000);
   defs+='<defs><g id="'+id+'">'+markup+'</g></defs>';
   return rep(11,j=>{const yy=j*62,off=(Math.floor(rand(j+Math.floor(h.clock*9))*7)-3)*(j%4===0?12:2.1)*(1-(settings.repair||0));
    return graphicWindow(off,yy,1200,62,'<use href="#'+id+'"/>','0 '+yy+' 1200 62')});
  }
  return [7,8,12,13,14,15,16,20].includes(i)?graphicWindow(x,y,w,z,markup,view.slice(4).join(' ')):markup;
 }
 if(i===0){header='';edge=R(0,0,1200,675,'url(#grain)','opacity=".17"')}
 else if(i===7||i===8){mount=R(0,0,1200,675,'#131a1d');header=G(header,tr(i===7?x:0,i===8?y-6:0))}
 else if(i===12){
  const dy=290*ease(t/4.35);
  mount=R(0,0,1200,675,'#777e6e')+R(327,-35,558,747,'#626d5f','opacity=".63"')+R(318,0,548,675,'#b2ac8d')+R(324,0,536,675,'url(#chalk)','opacity=".28"');
  edge=G(R(0,0,569,18,'#685c49','rx="7"')+R(14,0,540,5,'#a29978'),tr(307,17-dy))+G(R(0,0,567,20,'#6b604c','rx="6"')+R(10,2,546,4,'#ab9c7e'),tr(309,922-dy));
  near+=print;print='';header=G(header,tr(345,0,.75));
 }else if(i===13){mount=R(0,0,1200,675,'#d9c7a2');near+=print+header;print=header='';edge=R(0,0,1200,675,'url(#grain)','opacity=".14"')}
 else if(i===14){mount=R(0,0,1200,675,'#b3a38b')+P('M68 84l66 -65h942l53 65Z','#d8c8a7',st('#a5957c',2))+R(45,78,1114,536,'#ede0c0',st('#9e9079',3));
  edge=P('M45 614h1114l-59 39H105Z','#c5b69a',st('#a6967f',2));header=G(header,tr(55,77,.86));
 }else if(i===15){mount=R(0,0,1200,675,'#babca9')+P('M0 492l1200 -28v211H0Z','#989582')+P('M537 595L506 675h24l48 -80Zm114 -7l36 87h24l-24 -87Z','#74634c')+
  R(x-11,y-10,w+22,z+21,'#b89763',st('#7c684b',3));near+=header;header='';edge=R(0,0,1200,675,'url(#grain)','opacity=".1"');
 }else if(i===16){
  header=G(header,tr(0,0,.78));
  if(t>=3.25&&t<5.23)return fourPrints(c)+header;
  mount=comicPanels(c);road=c.road+P('M649 120h20l-96 468h-20Z',paper,st(ink,3))+c.actors;
  if(t>=1.9&&t<3.25)edge=G(P('M-147 -8l59 -26l-34 -40l78 15l-5 -54l39 40l42 -63l8 60l82 -39l-25 61l73 -6l-52 39l66 20l-68 11l14 43l-59 -19l-13 47l-36 -27l-45 37l3 -49l-78 18l28 -44Z',paper,st(ink,5))+T(-62,22,'叮！',83,red,'stroke="#162019" stroke-width="2" font-weight="900"'),tr(908,429,1.57,-9));
 }else if(i===20){
  mount=R(0,0,1200,675,'url(#vsky)')+rep(3,j=>G(R(3,3,58,44,'#8b779e')+R(0,0,58,44,'#c4d2d6',st('#837296',2))+R(4,4,50,7,'#9b8cae')+mt(28,62,['DISK','AUDIO','MUSEUM'][j],12,'#655a7a','text-anchor="middle"'),tr(40,69+103*j)))+
   R(x-1,y-32,w+18,z+50,'#817590')+R(x-9,y-39,w+18,z+50,'#ddd0dc',st('#80708e',2))+R(x-5,y-35,w+10,28,'#9485a9')+mt(x+6,y-15,'DRIVE.EXE    /    SOUTHBOUND',15,'#fff0ee');
  edge=desktopWindows(t,h);
 }else if(i===21){mount=R(0,0,1200,675,'#142028');edge=G(R(0,0,1152,26,'#152126')+mt(12,18,'▶   SIGNAL 22     /     '+Math.floor(h.clock*24)+' F',14,'#b4c8c2')+R(260,12,870,3,'#4c6265')+R(260,12,870*clamp(t/6),3,'#b67f9c'),tr(23,630))}
 else if(i!==18)edge=R(0,0,1200,675,'url(#grain)','opacity=".065"');
 if(!separate){
  const inner=crop(background+road+c.bird+near+glint,'scene');
  return defs+mount+inner+print+header+edge;
 }
 const back=mount+crop(background,'back'),track=crop(road,'road'),bird=crop(c.bird,'bird'),top=crop(near+glint,'surface')+print+header+edge;
 return {defs,back,road:track,bird,top};
}
