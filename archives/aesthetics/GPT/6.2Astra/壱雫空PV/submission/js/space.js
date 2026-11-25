"use strict";
// Flat-print 3D. Textured sheets are projected in camera coordinates and drawn
// through affine triangles, so an ordinary file:// canvas can use the portraits.
const V3={
  add:(a,b)=>a.map((n,i)=>n+b[i]), sub:(a,b)=>a.map((n,i)=>n-b[i]),
  mul:(a,k)=>a.map(n=>n*k),dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  unit:a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n)}
};
function camera(eye,look,focal=780,roll=0){
  const f=V3.unit(V3.sub(look,eye)),r=V3.unit(V3.cross(f,[0,1,0])),u=V3.cross(r,f);
  return {eye,focal,f,r:V3.add(V3.mul(r,Math.cos(roll)),V3.mul(u,Math.sin(roll))),
    u:V3.add(V3.mul(u,Math.cos(roll)),V3.mul(r,-Math.sin(roll)))}
}
function viewPos(cam,p){
  const v=V3.sub(p,cam.eye);return [V3.dot(v,cam.r),V3.dot(v,cam.u),V3.dot(v,cam.f)]
}
function toScreen(cam,v){return [640+cam.focal*v[0]/v[2],360-cam.focal*v[1]/v[2],v[2]]}
function project(cam,p){return toScreen(cam,viewPos(cam,p))}
function unproject(cam,x,y,z){
  return V3.add(cam.eye,V3.add(V3.mul(cam.f,z),V3.add(V3.mul(cam.r,(x-640)*z/cam.focal),V3.mul(cam.u,(360-y)*z/cam.focal))))
}
function spaceLine(cam,a,b,col,width=1){
  let p=viewPos(cam,a),q=viewPos(cam,b);const near=.40;
  if(p[2]<near&&q[2]<near)return;
  if(p[2]<near){const f=(near-p[2])/(q[2]-p[2]);p=p.map((x,i)=>mix(x,q[i],f))}
  if(q[2]<near){const f=(near-q[2])/(p[2]-q[2]);q=q.map((x,i)=>mix(x,p[i],f))}
  p=toScreen(cam,p);q=toScreen(cam,q);line(p[0],p[1],q[0],q[1],col,width)
}
function sheet(at,w,h,image,yaw=0,pitch=0,roll=0,opts={}){
  const right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)];
  const u=V3.mul(V3.add(V3.mul(right,Math.cos(roll)),V3.mul(up,Math.sin(roll))),w);
  const v=V3.mul(V3.add(V3.mul(up,Math.cos(roll)),V3.mul(right,-Math.sin(roll))),h);
  return {at,u,v,image,...opts};
}
function pointOnSheet(b,u,v){return V3.add(b.at,V3.add(V3.mul(b.u,u-.5),V3.mul(b.v,.5-v)))}
function texTriangle(im,a,b,c,A,B,C){
  const sx=b[0]-a[0],sy=b[1]-a[1],tx=c[0]-a[0],ty=c[1]-a[1],det=sx*ty-sy*tx;
  if(Math.abs(det)<.001)return;
  const dx=B[0]-A[0],dy=B[1]-A[1],ex=C[0]-A[0],ey=C[1]-A[1];
  const ma=(dx*ty-ex*sy)/det,mb=(dy*ty-ey*sy)/det,mc=(ex*sx-dx*tx)/det,md=(ey*sx-dy*tx)/det;
  g.save();g.beginPath();
  const center=[(A[0]+B[0]+C[0])/3,(A[1]+B[1]+C[1])/3];
  [A,B,C].forEach((p,i)=>{
    const vx=p[0]-center[0],vy=p[1]-center[1],n=Math.hypot(vx,vy)||1;
    const x=p[0]+.46*vx/n,y=p[1]+.46*vy/n;if(i===0)g.moveTo(x,y);else g.lineTo(x,y)
  });
  g.closePath();g.clip();g.transform(ma,mb,mc,md,A[0]-a[0]*ma-a[1]*mc,A[1]-a[0]*mb-a[1]*md);
  g.drawImage(im,0,0);g.restore()
}
function drawSheet(cam,b){
  const pts=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>project(cam,pointOnSheet(b,u,v)));
  const z=pts.map(p=>p[2]);if(Math.min(...z)<.45)return;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  if(Math.min(...xs)>W+5||Math.max(...xs)<-5||Math.min(...ys)>H+5||Math.max(...ys)<-5)return;
  if(b.backing)path(pts,b.backing);
  const im=b.image;
  if(im){
    const src=b.src||[0,0,im.width,im.height],ratio=(Math.max(...z)-Math.min(...z))/Math.max(...z);
    const width=Math.max(...xs)-Math.min(...xs);
    if(ratio<.014||width<30){
      const [a,c,,d]=pts;g.save();g.transform((c[0]-a[0])/src[2],(c[1]-a[1])/src[2],(d[0]-a[0])/src[3],(d[1]-a[1])/src[3],a[0],a[1]);
      g.drawImage(im,...src,0,0,src[2],src[3]);g.restore()
    }else{
      const n=width>270&&ratio>.12?3:width>120&&ratio>.07?2:1;
      const m=Math.abs(pts[0][2]-pts[3][2])>.10*pts[0][2]&&width>140?2:1;
      for(let j=0;j<m;j++)for(let i=0;i<n;i++){
        const uv=[[i/n,j/m],[(i+1)/n,j/m],[(i+1)/n,(j+1)/m],[i/n,(j+1)/m]];
        const pp=uv.map(([u,v])=>project(cam,pointOnSheet(b,u,v)));
        const ss=uv.map(([u,v])=>[src[0]+u*src[2],src[1]+v*src[3]]);
        texTriangle(im,ss[0],ss[1],ss[2],pp[0],pp[1],pp[2]);
        texTriangle(im,ss[0],ss[2],ss[3],pp[0],pp[2],pp[3])
      }
    }
  }
  if(b.edge)path(pts,null,b.edge,b.edgeWidth||1);
  if(b.sparkColor){
    const [px,py,z]=pts[1],unit=clamp(6/z,.65,1.85);
    star(px+9*unit,py-5*unit,(5+7*kick)*unit,b.sparkColor,.18);
    circ(px+22*unit,py+8*unit,(1.4+1.6*Math.exp(-5*frac(beat*2)))*unit,WHITE)
  }
}
function printWorld(cam,boards){
  const draws=boards.map(b=>({b,d:V3.dot(V3.sub(b.at,cam.eye),cam.f)})).filter(o=>o.d>.35).sort((a,b)=>b.d-a.d);
  for(const {b} of draws){
    if(b.walls)drawTypeSolid(cam,b);
    else drawSheet(cam,b)
  }
}
const plates={},wordSheets=[],typeSolids=[];
// Cap-height coordinates from the installed DIN Engschrift Std outlines.
// Counter contours have the opposite winding, including the aperture in O.
const capOutlines={
  H:[[-232,0,-88,0,-88,445,88,445,88,0,232,0,232,1000,88,1000,88,572,-88,572,-88,1000,-232,1000]],
  I:[[-72,0,72,0,72,1000,-72,1000]],
  T:[[-72,0,72,0,72,865,237,865,237,1000,-237,1000,-237,865,-72,865]],
  O:[[-236,241,-231,184,-215,135,-192,94,-161,60,-125,34,-85,15,-43,4,0,0,43,4,85,15,125,34,161,60,192,94,215,135,231,184,236,241,236,760,231,816,215,865,192,906,161,940,125,967,85,985,43,996,0,1000,-43,996,-85,985,-125,967,-161,940,-192,906,-215,865,-231,816,-236,760],[-95,760,-93,783,-87,804,-67,835,-37,854,0,860,37,854,67,835,87,804,93,783,95,760,95,241,93,217,87,196,67,165,37,147,0,141,-37,147,-67,165,-87,196,-93,217,-95,241]],
  S:[[242,778,237,819,225,859,204,896,177,930,143,959,103,981,57,995,7,1000,-50,995,-99,979,-141,954,-174,921,-200,881,-219,836,-231,785,-235,731,-233,687,-228,646,-218,610,-204,577,-183,547,-156,521,-122,498,-81,478,19,437,43,427,61,417,76,405,86,391,94,373,98,351,101,323,101,287,99,226,94,201,86,180,73,163,55,152,31,144,-1,141,-26,143,-47,150,-78,173,-95,205,-101,242,-101,286,-242,286,-242,234,-237,186,-223,141,-202,102,-173,67,-137,39,-97,18,-51,5,-1,0,62,6,114,22,156,48,189,82,213,125,229,174,239,229,242,289,240,340,236,385,228,425,214,460,195,490,170,516,136,539,94,558,-13,601,-38,612,-57,623,-71,635,-81,649,-92,684,-93,706,-94,732,-90,780,-75,820,-63,837,-46,849,-25,857,2,860,27,857,48,850,65,839,78,825,96,787,101,741,101,709,242,709]],
  Z:[[-213,0,213,0,213,135,-62,135,213,886,213,1000,-199,1000,-199,865,57,865,-213,126]],
  U:[[229,1000,88,1000,88,245,81,200,63,168,35,149,0,142,-35,149,-63,168,-81,200,-88,245,-88,1000,-229,1000,-229,231,-225,185,-212,141,-190,101,-162,67,-128,39,-89,18,-46,5,0,0,46,5,89,18,128,39,162,67,190,101,212,141,225,185,229,231]],
  K:[[-268,0,-124,0,-124,299,-47,444,116,0,268,0,36,600,231,1000,88,1000,-121,544,-124,544,-124,1000,-268,1000]]
};
function buildTypeSolid(ch,index){
  const pivot=index===6,height=pivot?5.65:5.05,depth=pivot ? .83 : .63;
  const px=-16.91+index*2.87,pz=pivot?1.10:-4.4+.53*Math.sin(index*.71);
  const yaw=pivot ? .48 : -.19,right=[Math.cos(yaw),0,-Math.sin(yaw)],normal=[Math.sin(yaw),0,Math.cos(yaw)];
  const foot=[px,-2.8,pz],back=V3.mul(normal,-depth);
  const front=capOutlines[ch].map(coords=>{
    const ring=[];
    for(let k=0;k<coords.length;k+=2){
      const side=V3.mul(right,coords[k]*height/1000);
      ring.push(V3.add(foot,V3.add(side,[0,coords[k+1]*height/1000,0])))
    }
    return ring
  });
  const rear=front.map(ring=>ring.map(p=>V3.add(p,back))),walls=[];
  front.forEach((ring,j)=>ring.forEach((a,k)=>{
    const next=(k+1)%ring.length,b=ring[next],edge=V3.sub(b,a);
    if(Math.hypot(...edge)<.0001)return;
    const outward=V3.unit(V3.cross(edge,normal)),at=V3.mul(V3.add(V3.add(a,b),back),.5);
    const light=clamp(.42+V3.dot(outward,[-.46,.65,.35])*.5);
    walls.push({at,outward,points:[a,b,rear[j][next],rear[j][k]],ink:blend("#3f607c","#bdd8dd",light)})
  }));
  const shadow=front.map(ring=>ring.map(p=>{const h=p[1]-foot[1];return [p[0]+h*.18,foot[1]+.005,p[2]-h*.46]}));
  return {at:V3.add(foot,[0,height*.5,0]),front,rear,walls,normal,shadow}
}
function projectedInk(cam,rings,color){
  g.beginPath();
  for(const ring of rings){
    const vertices=ring.map(p=>viewPos(cam,p));let opened=false,previous=vertices.at(-1);
    const point=v=>{
      const p=toScreen(cam,v);
      if(opened)g.lineTo(p[0],p[1]);else{g.moveTo(p[0],p[1]);opened=true}
    };
    for(const v of vertices){
      if((previous[2]>.42)!==(v[2]>.42)){
        const u=(.42-previous[2])/(v[2]-previous[2]);point(previous.map((n,i)=>mix(n,v[i],u)))
      }
      if(v[2]>.42)point(v);
      previous=v
    }
    if(opened)g.closePath()
  }
  g.fillStyle=color;g.fill("evenodd")
}
function drawTypeSolid(cam,solid){
  const frontVisible=V3.dot(solid.normal,V3.sub(cam.eye,solid.front[0][0]))>=0;
  projectedInk(cam,frontVisible?solid.rear:solid.front,"#7890a3");
  const walls=solid.walls.filter(w=>V3.dot(w.outward,V3.sub(cam.eye,w.at))>0);
  walls.sort((a,b)=>V3.dot(V3.sub(b.at,a.at),cam.f));
  for(const wall of walls)projectedInk(cam,[wall.points],wall.ink);
  projectedInk(cam,frontVisible?solid.front:solid.rear,frontVisible?WHITE:"#98b2bf")
}
function makePrint(w,h,fn,res=1.3){
  const out=surface(Math.round(w*res),Math.round(h*res)),old=g;g=out.getContext("2d");
  g.scale(out.width/w,out.height/h);g.lineJoin="round";fn();g=old;return out
}
function memberPlate(id,lit,fullBody=false){
  const m=band[id],col=lit?m.color:"#b9cbd0",ink=lit?m.ink:"#3c5569";
  return makePrint(238,337,()=>{
    rect(0,0,238,337,PAPER);rect(5,5,228,327,null,INK,1.5);
    rect(12,41,214,236,col);clipBox(12,41,214,236,()=>{
      pattern("diag",rgba(WHITE,.45),12,1,12,41,214,236);
      circ(119,155,81,null,WHITE,13);
      g.save();if(!lit)g.filter="grayscale(1)";
      if(fullBody){
        person(id,119,47,222,lit?"sticker":"print");
        ruler(26,265,186,rgba(ink,.46),28,-1)
      }else portrait(id,12,41,214,236,lit?"sticker":"print",.84);
      g.restore();
      if(!lit)rect(12,41,214,236,rgba("#8ba8bb",.12))
    });
    label("MYGO!!!!!",14,28,10,INK,"left",1.8);smallCapsule(m.number,184,11,39,INK);
    txt(m.name,15,305,26,INK,{font:COND,track:2});txt(m.jp,224,302,15,ink,{font:MINCHO,align:"right"});
    line(15,313,222,313,INK);label(m.part.toUpperCase()+"  /  COLOR SEPARATION",15,325,7,ink);
  },2)
}
function colorPlate(i,col){
  return makePrint(235,153,()=>{
    rect(0,0,235,153,col);rect(4,4,227,145,null,INK,1.7);
    clipBox(7,8,221,111,()=>{
      if(i===0){pattern("diag",INK,21,7,7,8,221,111);circ(117,65,42,PAPER,INK,1.3);star(117,65,30,INK)}
      if(i===1){pattern("dot",INK,10,2.2,7,8,221,111);txt("A",113,122,138,PAPER,{font:LATIN,align:"center",style:"italic"})}
      if(i===2){for(let j=0;j<9;j++)circ(91,99,16+j*16,null,INK,2.1);circ(143,82,36,PAPER,INK,1.4);arc(143,82,29,-2.8,-.15,INK,3);circ(147,79,7,col,INK,1)}
      if(i===3){
        for(let n=0;n<4;n++)line(7,39+n*15,228,39+n*15,INK,2+n);
        txt("B",126,115,129,PAPER,{font:LATIN,style:"italic",align:"center",stroke:INK,sw:1.4});
        pattern("check",INK,5,1,12,15,48,10)
      }
      if(i===4){for(let n=0;n<5;n++)circ(75,64,16+n*13,null,INK,2);txt("04",184,103,79,INK,{font:COND,align:"center"});line(10,60,226,60,PAPER,2)}
    });
    line(10,126,225,126,INK);label(["STRING PLATE","RHYTHM PRINT","SKY STUDY","BASS PROOF","DRUM SCORE"][i],12,141,8,INK);num(band[people[i]].number,224,142,10,INK,"right")
  },1.7)
}
const passageWords=lyricScore[12][2].filter(([word])=>word.trim()).map(([text,offset])=>{
  const start=lyrics[12].start+offset;
  return {text,start,chars:lyrics[12].chars.filter(ch=>ch.wordAt===start)}
});
function passagePlate(index){
  const word=passageWords[index],plate=wordSheets[index],last=word.chars.at(-1);
  if(time<word.start)return plate.waiting;
  if(time>=last.at+last.fillTime)return plate.finished;
  const progress=word.chars.reduce((sum,ch)=>sum+sung(ch),0);
  const width=plate.finished.width,height=plate.finished.height;
  const split=clamp((145+(progress-word.chars.length*.5)*39)/290)*width;
  const pen=plate.writing.getContext("2d");
  pen.drawImage(plate.outline,0,0);
  if(split>0)pen.drawImage(plate.finished,0,0,split,height,0,0,split,height);
  return plate.writing
}
function prepareSpace(){
  people.forEach((id,i)=>{plates[id]=memberPlate(id,true);plates[id+"Fog"]=memberPlate(id,false);
    plates["tile"+i]=colorPlate(i,band[id].color);plates["tileFog"+i]=colorPlate(i,"#b6c9d0")});
  plates.tomoriFull=memberPlate("tomori",false,true);
  [..."HITOSHIZUKU"].forEach((ch,i)=>typeSolids.push(buildTypeSolid(ch,i)));
  passageWords.forEach((word,i)=>{
    const plate={};wordSheets[i]=plate;
    for(const state of ["waiting","outline","finished"]){
      plate[state]=makePrint(290,86,()=>{
        const lit=state!=="waiting",bg=lit?PAPER:"#33495e",fg=lit?INK:"#beced5";
        rect(0,0,290,86,bg);rect(4,4,282,78,null,fg,1);
        label("LYRIC 13   /   "+pad(i+1),11,17,8,fg);
        word.chars.forEach((ch,j)=>{
          const x=145+(j-(word.chars.length-1)*.5)*39;
          txt(ch.ch,x,65,37,state==="finished"?fg:null,{font:MINCHO,align:"center",stroke:fg,sw:.8})
        })
      },1.6)
    }
    plate.writing=surface(plate.outline.width,plate.outline.height)
  });
}
function breathPrint(width,height){
  if(!plates.inhale||plates.inhale.width!==width||plates.inhale.height!==height){
    const c=surface(width,height);
    renderAt(c.getContext("2d"),CUTS[22]-.0001,width,height,{hud:false,grain:false,cleanInhale:true});
    plates.inhale=c
  }
  return plates.inhale
}
function litAt(id,t){
  return t>={rana:47.11,anon:49.46,soyo:51.81,taki:54.17,tomori:56.52}[id];
}
function spaceGround(cam,t,bright=0){
  rect(0,0,W,H,gradient(0,0,W*.2,H,[[0,blend("#101c2a","#24465c",bright)],[.59,blend("#20384d","#43657a",bright)],[1,"#172838"]]));
  pattern("dot",rgba(WHITE,.085),15,1.0);
  for(let i=-18;i<=18;i++)spaceLine(cam,[i*1.7,-2.8,-62],[i*1.7,-2.8,20],rgba(BLUE,i%4===0?.45:.20),i%4===0?1.1:.65);
  for(let i=-32;i<=13;i++)spaceLine(cam,[-38,-2.8,i*1.65],[38,-2.8,i*1.65],rgba(PAPER,i%4===0?.44:.21),i%4===0?1.1:.68);
  for(let i=0;i<25;i++){
    const v=[(rnd(i+53)-.5)*33,(rnd(i+22)-.25)*10,-23+rnd(i+75)*25];
    const p=project(cam,v);if(p[2]>1&&p[0]>0&&p[0]<W&&p[1]>60&&p[1]<640){
      if(i%5===0)cross(p[0],p[1],4,rgba(BLUE,.55));else circ(p[0],p[1],1+air*1.5,rgba(PAPER,.65))
    }
  }
}
function coordinateStrip(mark,idx){
  rect(55,59,204,23,rgba(NIGHT,.83));rect(55,59,3,23,BLUE);
  label(mark,66,75,9,WHITE,"left",1.5);
  const n=posterOrder.filter(id=>litAt(id,time)).length;
  label("INK",1074,72,9,WHITE);
  posterOrder.forEach((id,i)=>rect(1104+i*21,62,16,8,i<n?band[id].color:rgba(WHITE,.18)));
}
function liftChorusFromSheet(cam,board){
  const id=11,items=lyrics[id].chars,p=smooth(span(local,.32,.88));
  shown.add(id);
  const bg=rgba(NIGHT,.89*p);rect(209,593,862,49,bg);
  items.forEach((item,i)=>{
    const fromX=640+(i-(items.length-1)/2)*32,toX=640+(i-(items.length-1)/2)*33;
    // The print travels with the retreating plate, then peels into the margin.
    let x=toX,y=627,angle=0,size=23;
    if(p<1){
      const at=project(cam,pointOnSheet(board,fromX/W,567/H));
      const edge=project(cam,pointOnSheet(board,(fromX+23)/W,567/H));
      x=mix(at[0],toX,p);y=mix(at[1],627,p);
      angle=Math.atan2(edge[1]-at[1],edge[0]-at[0])*(1-p);size=mix(Math.hypot(edge[0]-at[0],edge[1]-at[1]),23,p)
    }
    place(x,y,()=>glyph(item,0,0,size,BLUE,{font:JP,weight:600,hot:band.anon.color}),angle)
  })
}
scenes[23]=()=>{
  const p=ease(local/BAR),f=ease((local-BAR)/BAR),cx=.78*p-1.66*f;
  const startDistance=6.5,focal=780;
  const cam=camera([cx,.68*p-.44*f,startDistance+7.3*p-12.4*f],[.10*p-.67*f,.12*p,-1.9*f],focal,-.048*p+.075*f);
  spaceGround(cam,time);
  const previousPrint=breathPrint(g.canvas.width,g.canvas.height);
  const boards=[sheet([-4.85*f,.15*p,-.3*p],W*startDistance/focal,H*startDistance/focal,
    previousPrint,-.28*p-.69*f,.035*p,.012*p,{edge:BLUE})];
  for(let i=0;i<21;i++){
    const side=i%2?1:-1,z=5.3-Math.floor(i/2)*2.75,k=i%5;
    const id=people[k],isMember=i%3===0;
    const x=side*(3.8+rnd(i+40)*3.0)+.3*Math.sin(.65*time+i),y=(rnd(i+141)-.46)*6;
    boards.push(sheet([x,y,z],isMember?2.36:2.7,isMember?3.35:1.76,
      isMember?plates[id+"Fog"]:plates["tileFog"+k],side*.45+Math.sin(time*.4+i)*.25,(rnd(i)-.5)*.38,(rnd(i+6)-.5)*.35,{edge:PAPER}))
  }
  for(let i=0;i<4;i++)boards.push(sheet([(i%2?2.9:-2.1),i%2?.95:-.8,-3.6-i*4.1],3.7,1.09,passagePlate(i),i%2?.29:-.33,0,-.05,{edge:INK}));
  printWorld(cam,boards);
  if(time<46.52)opacity(1-smooth(span(time,46.46,46.52)),()=>liftChorusFromSheet(cam,boards[0]));
  if(local>.56)coordinateStrip("PLANE  /  DEPTH STUDY",23)
};
scenes[24]=()=>{
  const approach=clamp(local/BAR),turn=span(local,BAR,2*BAR),leave=clamp((local-2*BAR)/BAR);
  const a=mix(-.84,.81,turn),radius=4.15;
  const x=.31+radius*Math.sin(a)-4.25*(1-approach)+2.94*leave;
  const z=1.1+radius*Math.cos(a)+2.81*(1-approach)-.79*leave;
  const cam=camera([x,-1.12+.18*Math.sin(PI*turn),z],[x+mix(.92,-1.13,turn),.07,-5.9],
    773,-.031+.066*smooth(turn));
  spaceGround(cam,time,.17+.13*local/(3*BAR));
  for(const solid of typeSolids)projectedInk(cam,solid.shadow,rgba(NIGHT,.48));
  const boards=typeSolids.slice();
  for(let i=0;i<5;i++){
    const id=["rana","soyo","anon","tomori","taki"][i],lit=litAt(id,time);
    const pos=[[-4.06,.29,-.65],[-.35,1.4,-4.1],[4.56,.10,-1.32],[8.7,-.7,-2.8],[-9.1,.67,-2.4]][i];
    const yaw=(i%2?-.4:.6)-(id==="rana"?.57*ease(local/.45):0)+Math.sin(time*.85+i)*.13;
    boards.push(sheet(pos,2.32,3.3,plates[id+(lit?"":"Fog")],yaw,-.02,.08*Math.sin(i+.4),{edge:lit?band[id].color:PAPER,edgeWidth:lit?2.4+kick:1,sparkColor:lit?band[id].color:null}));
  }
  for(let i=0;i<7;i++){const k=i%5,id=people[k];boards.push(sheet([-9.4+i*3.5,-1.44+(i%2)*4.2,-1.7-i%3],1.8,1.17,
    plates["tile"+(litAt(id,time)?"":"Fog")+k],(i%3-1)*.48,.2*Math.sin(i),.2*Math.cos(i+.5),{edge:PAPER}))}
  for(let i=0;i<4;i++)boards.push(sheet([-6.6+i*3.36,i%2?2.46:-1.89,-3.14],2.35,.70,
    passagePlate(i),-.24+i*.15,0,.055));
  printWorld(cam,boards);coordinateStrip("TYPE  /  PASSAGE  01",24);
  lyricStrip(12,281,574,718,{c:WHITE,bg:NIGHT,size:30,accent:band.rana.color,hot:BLUE});
};
let fragmentCanvas;
function liveLinePlate(register){
  if(!fragmentCanvas)fragmentCanvas=surface(1424,160);
  const old=g;g=fragmentCanvas.getContext("2d");g.setTransform(1.6,0,0,1.6,0,0);
  g.clearRect(0,0,890,100);
  if(register>0){
    rect(0,0,890,100,rgba(NIGHT,register*.95));line(0,3,890,3,rgba(BLUE,register),2)
  }
  g.save();g.shadowColor=rgba(NIGHT,.76*(1-register));g.shadowOffsetX=1.7;g.shadowOffsetY=2.5;
  lyric(13,445,76,49,{align:"center",spacing:57,c:WHITE,hot:BLUE});
  g.restore();g=old;return fragmentCanvas
}
scenes[25]=()=>{
  const lock=.045+45*BAR,before=span(time,50.64,lock),after=span(time,lock+BEAT,54.17);
  const a=-.82+.82*smooth(before)+.53*smooth(after);
  const cam=camera([Math.sin(a)*10.8,1.4+.21*Math.sin(a*2),Math.cos(a)*10.8],[0,.34,0],788,.036*Math.sin(2*a));
  const ref=camera([0,1.4,10.8],[0,.34,0],788);
  spaceGround(cam,time,.34);const boards=[sheet([0,.44,0],3.34,4.77,plates.tomoriFull,.09*Math.sin(a),0,-.035,{edge:PAPER})];
  for(let i=0;i<11;i++){
    const theta=i*TAU/11+time*.12,rad=4.35+(i%3)*.68,id=i===2?"soyo":people[i%5];
    boards.push(sheet([Math.cos(theta)*rad,Math.sin(theta*2.18)*1.50,Math.sin(theta)*rad-1.2],
      i===2?2.26:1.52,i===2?3.22:1.02,i===2?plates[litAt("soyo",time)?"soyo":"soyoFog"]:plates["tile"+(litAt(id,time)?"":"Fog")+(i%5)],
      -.45*Math.cos(theta),.20*Math.sin(theta),.15*Math.sin(theta*2),{edge:litAt(id,time)?band[id].color:PAPER}))
  }
  // An anamorphic text is slit into twelve plates in three layers of depth.
  // Only the reference camera sees a continuous print.
  const live=liveLinePlate(1-smooth(Math.abs(a)/.18)),left=195,top=477,ww=890,hh=100,fragments=[];
  for(let j=0;j<3;j++)for(let i=0;i<4;i++){
    const dep=6.2+rnd(i+j*5+7)*7,px=left+(i+.5)*ww/4,py=top+(j+.5)*hh/3;
    fragments.push({at:unproject(ref,px,py,dep),u:V3.mul(ref.r,ww/4*dep/ref.focal),
      v:V3.mul(ref.u,hh/3*dep/ref.focal),image:live,src:[i*live.width/4,j*live.height/3,live.width/4,live.height/3]})
  }
  if(time>=lock-.038&&time<lock+BEAT+.035){printWorld(cam,boards);printWorld(cam,fragments)}
  else printWorld(cam,boards.concat(fragments));
  coordinateStrip("REGISTER  /  ANAMORPHOSIS",25);
  if(time>=52.94&&time<53.31){[180,1100].forEach(xx=>target(xx,527,6,BLUE));label("IN REGISTER",640,601,10,BLUE,"center",3)}
};
let spiralCaption;
function spiralLettering(){
  if(!spiralCaption)spiralCaption=surface(1032,124);
  const old=g;g=spiralCaption.getContext("2d");g.setTransform(1.6,0,0,1.6,0,0);
  rect(0,0,645,78,NIGHT);rect(3,3,639,71,null,BLUE,1.3);
  lyric(14,322,56,42,{align:"center",spacing:50,c:WHITE,hot:SUN});g=old;
  return spiralCaption
}
function outerType(cam,tip,u,park){
  const p=project(cam,tip),x=clamp(640+(p[0]-640)*.28,401,888),y=clamp(551+(p[1]-360)*.09,487,601),depth=clamp(p[2],4,18);
  const at=unproject(cam,x,y,depth),angle=.09*Math.sin(u*1.6),dx=depth/cam.focal;
  const axis=V3.add(V3.add(V3.mul(cam.r,Math.cos(angle)),V3.mul(cam.u,Math.sin(angle))),V3.mul(cam.f,.10*Math.cos(u*1.52)));
  spaceLine(cam,tip,at,rgba(WHITE,.77),1);
  const board={at,u:V3.mul(axis,646*dx),v:V3.mul(cam.u,78*dx),edge:INK};
  if(park){plates.heldCaption={cam,board};shown.add(14)}
  else drawSheet(cam,{...board,image:spiralLettering()})
}
function spiralSpace(u,still=false,parkCaption=false){
  const angleCut=Math.min(3,Math.floor(u/(BEAT*2)));
  const far=ease((u-2*BAR)/.83),offset=frac(u/(BEAT*2));
  const views=[[-2.8,-2.18,7.1,.10],[2.0,4.9,7.7,-.14],[5.3,.25,6.1,.11],[-1.2,.85,5.7,-.09]];
  const v=views[angleCut],cam=camera([mix(v[0],.1,far)+.16*offset,mix(v[1],.12,far),mix(v[2],18.45,far)],
    [0,.1,-1.6],785,v[3]*(1-far)-far*.075);
  spaceGround(cam,time,.49);const boards=[],trace=[];
  for(let i=0;i<33;i++){
    const u2=i/32,theta=.8+u2*TAU*2.07+u*.22+far*.57+.86*span(u,2*BAR,3*BAR)**2,r=1.05+u2*6.85;
    const at=[Math.cos(theta)*r*(1+.39*far),Math.sin(theta)*r*(.79+.08*far),.8-u2*3+Math.sin(theta)*.55],k=i%5,id=people[k];
    trace.push(at);
    const member=i%5===1,sz=(member?1.88:1.40)*(1+.14*Math.sin(i));
    const memberId=["rana","soyo","anon","taki","tomori","taki","tomori"][Math.floor(i/5)%7];
    const owner=member?memberId:id,lit=litAt(owner,time);
    boards.push(sheet(at,sz,sz*(member?1.42:.65),
      member?plates[owner+(lit?"":"Fog")]:plates["tile"+(lit?"":"Fog")+k],
      .38*Math.sin(theta+u),.27*Math.cos(theta),.38*Math.sin(theta*1.4)+theta*.07,{edge:lit?band[owner].color:PAPER,edgeWidth:1.4}));
    if(i%4===0){const p=project(cam,V3.add(at,[.7,.7,0]));if(p[2]>1)star(p[0],p[1],6+air*11,PAPER)}
  }
  for(let i=1;i<trace.length;i++)spaceLine(cam,trace[i-1],trace[i],rgba(BLUE,.5),1);
  if(time>=55.34&&time<56.37){
    const fly=span(time,55.34,56.37);
    const at=unproject(cam,mix(1480,-247,smooth(fly)),230+70*Math.sin(fly*PI),3.9);
    boards.push(sheet(at,1.50,2.12,plates.taki,-.45+fly*.70,-.09,.13-fly*.19,{edge:band.taki.color,edgeWidth:2}));
  }
  printWorld(cam,boards);coordinateStrip("HELIX  /  FIVE SEPARATIONS",26);
  if(time>=55.25)outerType(cam,trace[trace.length-1],u,parkCaption);
  // From sparse grains to a solid ink change on each two-beat splice.
  if(!still&&u<2*BAR){
    const remaining=Math.ceil((BEAT*2-mod(u,BEAT*2))*60-1e-8);
    if(remaining>=1&&remaining<=7){
      const count=9*2**(7-remaining);
      for(let j=0;j<count;j++){
        // 181 and 576 are coprime; every cell occurs exactly once.
        const cell=(181*j+113*angleCut)%576,x=cell%32,y=Math.floor(cell/32);
        rect(x*40,y*40,40.35,40.35,(x+y)%5===0?band.taki.color:"#c0bdd6")
      }
    }
  }
}
scenes[26]=(options={})=>spiralSpace(local,false,options.parkCaption);
scenes[27]=()=>{
  rect(0,0,W,H,NIGHT);const collapse=clamp((local-.565)/.212),s=1-collapse**2.4;
  place(640,360,()=>{
    g.translate(-640,-360);
    if(plates.helixEnd){
      g.drawImage(plates.helixEnd,0,0,W,H);
      const {cam,board}=plates.heldCaption;drawSheet(cam,{...board,image:spiralLettering()})
    }else spiralSpace(3.51,true)
  },collapse*.14,Math.max(.001,s));
  if(collapse>.61)circ(640,360,3+6*(1-collapse),WHITE);
};

