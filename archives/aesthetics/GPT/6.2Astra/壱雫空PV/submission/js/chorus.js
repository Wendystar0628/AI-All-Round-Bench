"use strict";
function sunRays(x,y,reach,count,angle,c,width=.44){
  g.beginPath();
  for(let i=0;i<count;i++){const a=i*TAU/count+angle,b=a+TAU/count*width;
    g.moveTo(x,y);g.lineTo(x+Math.cos(a)*reach,y+Math.sin(a)*reach);g.lineTo(x+Math.cos(b)*reach,y+Math.sin(b)*reach);g.closePath()}
  paint(c)
}
function streamers(t,amount=36){
  const colors=[WHITE,SUN,"#ff96aa","#8ce0af","#9ca2d0",DEEP];
  for(let i=0;i<amount;i++){
    const x=mod(rnd(i+1512)*(W+80)+Math.sin(t*.89+i*2.18)*28+t*(i%2?5:-7),W+36)-18;
    const y=mod(rnd(i+310)*(H+50)+t*(24+37*rnd(i+621)),H+30)-15,s=3+rnd(i+712)*4;
    place(x,y,()=>{if(i%7===0)circ(0,0,s*.53,colors[i%6]);
      else rect(-s,-s*.28,s*2,s*.56,colors[i%6])},t*(i%4-1.3)*.75+i*2.7)
  }
}
function rainbowRibbon(points,xdir=1){
  clipPolygon(points,()=>{
    rect(0,0,W,H,gradient(0,0,W,100*xdir,[[0,"#97dbb0"],[.22,"#f3d782"],[.43,"#f59caf"],[.65,"#b7acd6"],[.84,"#9dd6e8"],[1,"#fbde86"]]));
    pattern("diag",rgba(WHITE,.62),10,1.7,0,0,W,H,time*10)
  });path(points,null,rgba(PAPER,.87),2)
}
function chorusField(t){
  rect(0,0,W,H,gradient(0,0,W,H,[[0,"#319bd3"],[.62,"#61bfe6"],[1,"#8ad0e7"]]));
  sunRays(1043,119,1440,20,t*.037,rgba(WHITE,.23),.37);
  pattern("dot",rgba(WHITE,.27),11,1.05)
}
scenes[28]=()=>{
  const struck=time>=59.78,rise=span(time,58.544,59.78),tail=span(time,59.78,60.05);
  const flash=struck?Math.exp(-(time-59.78)*23):0;
  const bg=struck?blend("#b5cbd3","#f2f5ed",clamp(flash*.94+tail**2*.90))
    :blend("#28384c","#526b7d",rise**2.7);
  const fg=struck?INK:WHITE;
  rect(0,0,W,H,bg);pattern("dot",rgba(WHITE,struck?.76:.47),13,1.05,0,0,W,H,640-6.5,360-6.5);
  line(69,360,192,360,rgba(fg,.75));line(1088,360,1211,360,rgba(fg,.75));
  lyric(15,640,383,70,{align:"center",spacing:77,c:fg,edge:fg,sw:1.15});
  label("VOICE     /     51",640,449,10,fg,"center",3.2)
};
scenes[29]=()=>{
  chorusField(time);
  const bassTime=Math.max(0,time-60.35),release=ease(bassTime/.13);
  const rebound=release*Math.exp(-bassTime*6);
  const pulse=.985+.023*kick+rebound*.063+release*.014*signal(time,1);
  circ(641,339,261*pulse,SUN,INK,1.4);circ(641,339,274*pulse,null,WHITE,2);
  if(bassTime>0&&bassTime<.46){
    const sweep=ease(bassTime/.46);
    circ(641,339,276+78*sweep,null,rgba(SUN,1-sweep),4.4-3*sweep)
  }
  dial(641,339,287,WHITE,120,time*.04);
  txt("SKY",61,195,132,null,{font:COND,stroke:rgba(WHITE,.86),sw:1.65,track:-1});
  num("05",1191,147,63,WHITE,"right");label("IN ENSEMBLE",1190,172,10,WHITE,"right");
  const ribbonHeight=23+50*back(bassTime/.33);
  rainbowRibbon([[-25,486],[W+25,256],[W+25,256+ribbonHeight],[-25,486+ribbonHeight]]);
  const arr=[["rana",154,209,365],["anon",388,194,383],["tomori",620,104,471],["soyo",831,161,412],["taki",1079,294,280]];
  arr.forEach(([id,x,y,h],i)=>{
    const age=local-i*BEAT/2,flight=span(age,-BEAT/2,0);
    if(flight<=0)return;
    const bounce=age>0&&age<.19?Math.sin(PI*age/.19)*Math.exp(-9*age):0;
    const drop=-104*(1-flight*flight)-18*bounce;
    const compress=age>=0 ? .048*Math.exp(-17*age)*Math.cos(age*28) : 0;
    opacity(ease(3*flight),()=>place(x,y+h+drop,()=>{
      person(id,0,-h,h,"sticker");
      rect(-49,4,98,19,PAPER,INK,.8);rect(-48,5,8,17,band[id].color);
      label(band[id].name,4,17,9,INK,"center",1.4)
    },(1-flight)*(i%2?.11:-.11),1+compress,1-compress))
  });
  for(const [x,y,r] of [[126,190,23],[1133,216,28],[473,112,14],[996,536,16]])star(x,y,r*(.7+.3*kick),WHITE);
  lyric(15,642,643,30,{align:"center",spacing:36,c:INK,hot:WHITE})
};
function mirrorTop(mode,reflected){
  const fg=reflected?"#508dae":INK;
  rect(0,0,W,361,reflected?"#b2dce7":"#90cfe8");
  if(mode===0){
    pattern("hatch-h",rgba(WHITE,.46),17,.8,0,0,W,360,0,time*5);
    circ(890,251,199,SUN,INK,1.1);dial(890,251,216,WHITE,90,time*.04);
    clipBox(624,32,537,328,()=>person("tomori",887,47,656,reflected?"print":"sticker"));
    smallCapsule("SIDE  B",77,74,84,fg);
  }else{
    for(let j=0;j<2;j++)for(let i=-1;i<4;i++)txt("MyGO!!!!!",i*508-mod(time*29*(j?1:-1),508),152+j*168,147,null,
      {font:LATIN,style:"italic",weight:700,stroke:rgba(WHITE,.95),sw:1.3,track:-6});
    if(mode===1)clipBox(680,24,484,337,()=>person("tomori",905,41,663,reflected?"print":"sticker"));
    else [0,1,2].forEach(i=>{
      const x=651+i*179;rect(x,83,158,247,PAPER,INK,1);
      portrait("tomori",x+5,89,148,211,["sticker","print","sil"][i],[.67,.86,.54][i]);
      label("PL.  0"+(i+1),x+9,320,9,fg)
    });
  }
  if(mode>0){
    const ground=reflected?"#b2dce7":"#90cfe8";
    rect(0,78,630,265,gradient(0,0,630,0,[[0,rgba(ground,.80)],[.83,rgba(ground,.63)],[1,rgba(ground,0)]]))
  }
  const id=time<62.099?15:16,first=id===15?4:3;
  const ink={c:fg,hot:DEEP,onlyOutline:reflected,slide:-28,wordSlide:true};
  lyric(id,111,208,91,{...ink,last:first,spacing:92});
  lyric(id,79,310,88,{...ink,first,spacing:83});
  if(reflected)rect(0,0,W,360,rgba("#d7edf0",.23));
}
scenes[30]=()=>{
  const mode=local<BAR?0:local<BAR+2*BEAT?1:2;
  const shut=smooth(span(time,CUTS[29]+2*BAR,64.455)),v=Math.max(.003,1-shut);
  rect(0,0,W,H,"#b0d9e9");
  place(640,360,()=>{g.translate(-640,-360);
    clipBox(0,0,W,360,()=>mirrorTop(mode,false));
    place(0,720,()=>clipBox(0,0,W,360,()=>mirrorTop(mode,true)),0,1,-1);
    if(local>=BAR&&local<BAR+.51){
      const a=(local-BAR)/.51;for(let i=0;i<7;i++){const xx=-310+i*48+a*1720;rect(xx,32,[6,18,6,43,11,72,4][i],656,i%2?WHITE:INK)}
    }
    line(0,360,W,360,INK,1.6);rect(46,349,105,22,INK);label("REFLECTION",98,364,8,WHITE,"center");
    num("A   /   A′",1232,352,10,INK,"right");
  },0,1,v);
  if(time>=64.455){
    const open=smooth(span(time,64.455,64.76)),half=361*open;
    clipBox(0,360-half,W,2*half,()=>canopyGroup(0));
    if(open>.002&&open<.995){
      line(0,360-half,W,360-half,PAPER,1.4);
      line(0,360+half,W,360+half,PAPER,1.4)
    }
    // The pickup leaves the seam on the live vocal clock. Its final position
    // and tracking are the initial position and tracking in the next cut.
    lyric(17,640,mix(407,596,open),mix(24,40,open),{
      align:"center",spacing:mix(32,49,open),c:INK,hot:DEEP,sw:1.05
    });
  }
};
function flowerFrame(i,progress){
  const a=-PI/2+i*TAU/5, age=progress-i*BEAT;
  const close=smooth(span(age,.010,.281)), reveal=ease(span(age,.196,.389));
  const move=smooth(span(age,.245,.585)), row=smooth((progress-BAR)/.72);
  const x=mix(640+Math.cos(a)*137,mix(300+i*170,168+i*236,row),move);
  const y=mix(343+Math.sin(a)*137,343,move)+Math.sin(beat*PI+i*.83)*5*row;
  return {x,y,r:mix(86,101,row),close,reveal,angle:a+PI/2,age};
}
function canopyGroup(progress){
  rect(0,0,W,H,"#71c2e4");pattern("dot",rgba(WHITE,.55),82,15,0,0,W,H,time*9,time*4);
  const hub=1-smooth(progress/(4.5*BEAT));
  if(hub>.002){
    circ(640,343,72*hub,SUN,INK,1.05);dial(640,343,64*hub,INK,50,-.06);
    star(640,343,16*hub,INK)
  }
  const remain=Math.max(0,5-Math.floor(progress/BEAT));
  label("FIVE CANOPIES",74,101,12,INK);
  printGlyph(pad(remain),1144,132,60,INK,{font:MONO,align:"center"},0,true);
  label("COUNT",1173,156,9,INK,"right");
  const pos=people.map((_,i)=>flowerFrame(i,progress));
  people.forEach((id,i)=>{
    const p=pos[i];
    if(p.age<.36){
      const model=parasol.make({x:p.x,y:p.y,r:96,opening:1-p.close,
        elevation:mix(PI/2,.37,p.close),yaw:.23+i*.68+Math.max(0,progress)*.20,
        roll:p.angle+p.close*.32,tint:band[id].color,water:"sun",seconds:progress,seed:16+i});
      parasol.draw(model);
    }
  });
  people.forEach((id,i)=>{
    const p=pos[i];
    if(p.reveal>.001){
      clipCircle(p.x,p.y,(p.r+8)*p.reveal,()=>portraitDisc(id,p.x,p.y,p.r,"sticker",band[id].color,id==="taki"?.76:.63));
      if(p.reveal>.87){
        rect(p.x-56,p.y+p.r+10,112,25,PAPER,INK,1);
        rect(p.x-55,p.y+p.r+11,8,23,band[id].color);label(band[id].name,p.x+4,p.y+p.r+27,10,INK,"center",1.5);
      }
    }
  });
  return pos
}
function foldInscription(x,y,angle){
  place(x,y,()=>{
    rect(-238,-29,476,42,PAPER,INK,1.1);rect(-238,-29,5,42,INK);
    lyric(18,1,1,25,{align:"center",spacing:33,hot:DEEP})
  },angle)
}
scenes[31]=(options={})=>{
  const pos=canopyGroup(local);
  if(options.cleanFan){shown.add(17);shown.add(18);return}
  const crossFrame=smooth((local-BAR*3)/.47),y=mix(596,392,crossFrame);
  const opts={align:"center",spacing:59,c:INK,hot:DEEP,sw:1.05};
  const lift=smooth(span(time,68.99,69.17));
  if(crossFrame>.01){
    opacity(1-lift,()=>{
      rect(124,y-48,1032,62,rgba(PAPER,.84));lyric(17,640,y,47,{...opts,onlyOutline:true});
      g.save();g.beginPath();pos.forEach(p=>{g.moveTo(p.x+p.r,p.y);g.arc(p.x,p.y,p.r,0,TAU)});g.clip();
      lyric(17,640,y,47,opts);g.restore()
    })
  }else lyric(17,640,y,40,{...opts,spacing:49});
  ruler(143,637,994,rgba(INK,.58),80,-1);
  if(time>68.92){
    const p=ease((time-68.92)/.25);
    opacity(p,()=>foldInscription(641+(1-p)*96,600+(1-p)*14,-.072+(1-p)*.08))
  }
};
function foldedGroup(){
  const base=plates.fanStart;if(!base)return;
  const first=span(local,0,BAR),second=span(local,BAR,2*BAR);
  const fold=local<BAR?(.81*ease(first*2.7)-.25*smooth((first-.42)/.30)+.15*smooth((first-.72)/.28)):.71+.29*smooth(second);
  const spin=second**2.6*PI*1.35,scale=1-.94*second**3.3;
  rect(0,0,W,H,"#59b3dc");pattern("diag",rgba(WHITE,.36),26,1.2,0,0,W,H,time*13);
  circ(640,350,252,SUN);circ(640,350,269,null,WHITE,1.5);dial(640,350,280,WHITE,100,time*.065);
  place(640,359,()=>{
    g.translate(-640,-359);
    const n=10,R=529,px=640,py=587;
    for(let i=0;i<n;i++){
      const l=i/n,r=(i+1)/n,al=mix(PI*1.04,PI*1.96,l),ar=mix(PI*1.04,PI*1.96,r);
      const rr1=R-(i%2)*24,rr2=R-((i+1)%2)*24;
      const corners=[[mix(W*l,px+Math.cos(al)*rr1,fold),mix(0,py+Math.sin(al)*rr1,fold)],
        [mix(W*r,px+Math.cos(ar)*rr2,fold),mix(0,py+Math.sin(ar)*rr2,fold)],
        [mix(W*r,px+Math.cos(ar)*34,fold),mix(H,py+Math.sin(ar)*34,fold)],
        [mix(W*l,px+Math.cos(al)*34,fold),mix(H,py+Math.sin(al)*34,fold)]];
      const sl=l*base.width,sr=r*base.width,hh=base.height;
      texTriangle(base,[sl,0],[sr,0],[sr,hh],corners[0],corners[1],corners[2]);
      texTriangle(base,[sl,0],[sr,hh],[sl,hh],corners[0],corners[2],corners[3]);
      path(corners,rgba(band[people[Math.floor(i/2)]].color,.24*fold));
      path(corners,i%2?rgba(INK,.14*fold):rgba(WHITE,.16*fold));
      line(...corners[0],...corners[3],rgba(WHITE,.93),2.2);
      if(i%3===0)star(corners[0][0],corners[0][1],7+kick*7,WHITE);
    }
    circ(px,py,12,INK,PAPER,2);
    foldInscription(mix(641,825,fold),mix(600,432,fold),-.072-fold*.69);
  },spin,scale);
  if(second>.64&&proofFrames.length){
    const progress=span(second,.64,1),size=back(progress);
    proofCard(0,mix(640,270,smooth(progress)),354-30*Math.sin(progress*PI),mix(.30,-.035,ease(progress)),size)
  }
  if(time>71.40){
    const enter=ease((time-71.40)/.37);
    opacity(enter,()=>proofWords(0,68*(1-enter)))
  }
}
function proofCard(index,x,y,angle,scale=1){
  const proof=proofFrames[mod(index,proofFrames.length)];
  if(!proof||scale<.001)return;
  place(x,y,()=>{
    rect(-179,-116,368,245,INK);rect(-184,-122,368,245,PAPER,INK,1.5);
    g.drawImage(proof.im,-175,-113,350,197);line(-174,94,175,94,INK,.9);
    num("FR. "+pad(proof.cut),-174,111,10);label(proof.name,173,111,9,INK,"right",1.7);
    if(index%2===0)tape(-117,-117,73,-.12)
  },angle,scale)
}
function proofWords(offset,spread=0){
  lyric(19,525+offset,167-spread,208,{align:"center",last:5,c:WHITE,edge:INK,sw:1.9,spacing:216});
  lyric(19,765+offset,687+spread,179,{align:"center",first:5,c:WHITE,edge:INK,sw:1.7,spacing:188})
}
scenes[32]=foldedGroup;
scenes[33]=()=>{
  rect(0,0,W,H,"#57b6df");pattern("cross",rgba(PAPER,.51),30,1);
  line(0,352,W,352,WHITE,2);for(let i=0;i<40;i++)rect(i*36-mod(time*53,36),340,16,4,WHITE);
  const shift=Math.floor(local/BEAT)+ease(frac(local/BEAT)),width=370;
  if(proofFrames.length){
    for(let j=-1;j<13;j++){
      const x=270+(j-shift)*width;if(x<-260||x>1540)continue;
      proofCard(j,x,354+Math.sin(j*2.36)*34,Math.sin(j*4.1)*.095-.035);
    }
  }
  proofWords(local<BAR?0:-44);
  label("CONTACT SHEET",72,573,9,INK,"left",2)
};
function medalPrint(){
  return makePrint(560,560,()=>{
    const x=280,y=280;
    circ(x,y,272,PAPER,INK,3);circ(x,y,264,BLUE,INK,1);
    clipCircle(x,y,241,()=>{
      rect(38,38,484,484,"#fce08b");sunRays(255,301,620,21,-.1,WHITE,.46);
      pattern("dot",rgba(DEEP,.19),8,1.1,35,35,490,490);
      // Two staggered rows preserve every face inside the round print.
      person("taki",336,67,224,"sticker");person("soyo",188,86,346,"sticker");
      person("rana",125,187,360,"sticker");person("anon",415,183,373,"sticker");
      person("tomori",271,137,419,"sticker");
      path([[49,436],[504,426],[495,489],[69,508]],INK);
      txt("MyGO!!!!!",280,473,54,PAPER,{font:LATIN,style:"italic",weight:700,align:"center",track:-1});
    });
    circ(x,y,242,null,INK,1.5);dial(x,y,260,INK,144,.05);
    ringType("H I T O S H I Z U K U      •      M y G O ! ! ! ! !      •      S U N L I G H T   E D I T I O N       /       ",x,y,247,8,INK,-2.65);
    for(let i=0;i<5;i++)arc(x,y,267,i*TAU/5-.91,(i+1)*TAU/5-.93,band[people[i]].color,5);
  },2)
}
function medalView(u){
  const pull=ease((u+.1)/1.10),angle=(u<BAR?.14:.14+.64*Math.sin(span(u,BAR,BAR*2.83)*PI))*(1-smooth(span(u,2.35,3.48)));
  const z=mix(12.8,9.3,pull)-.68*ease((u-BAR*2)/BAR);
  const cam=camera([Math.sin(angle)*z,.43*Math.cos(u*.9)+.6,Math.cos(angle)*z],[0,-.48,0],795,-.045*Math.sin(angle*3));
  const accent=ease((u+CUTS[33]-77.848)/.62);
  const at=[0,.08+.065*accent,0],diameter=5.4*(.40+.60*pull)*(1+.035*accent);
  const center=project(cam,at);
  const rim=diameter*.5*cam.focal/center[2]*.99+6;
  return {cam,at,diameter,center,rim}
}
function solarFinal(){
  const u=local,{cam,at,diameter,center,rim}=medalView(u);
  chorusField(time);
  sunRays(642,312,1020,23,time*.058,rgba(WHITE,.23),.31);
  const finalWord=ease((time-77.68)/.39);
  opacity(1-finalWord,()=>{
    txt("HITOS",31,293,180,null,{font:COND,stroke:rgba(WHITE,.64),sw:1.55});
    txt("ZUKU",1251,516,183,null,{font:COND,stroke:rgba(WHITE,.64),sw:1.55,align:"right"});
  });
  if(finalWord>0)opacity(finalWord,()=>{
    ["一","滴"].forEach((ch,i)=>{
      const x=(i?1043:235)+(i?1:-1)*41*(1-finalWord),y=394,sz=160+11*finalWord;
      const p=ease((time-77.85-i*.16)/.35);
      txt(ch,x,y,sz,null,{font:DISPLAY,align:"center",stroke:INK,sw:1.6});
      clipBox(x-sz*.57,y-sz*1.1,sz*1.14*p,sz*1.27,()=>txt(ch,x,y,sz,SUN,{font:DISPLAY,align:"center",stroke:INK,sw:1.6}));
      line(x-59,428,x+59,428,INK,.9);label(i?"D R O P":"O N E",x,452,11,INK,"center",3);
    })
  });
  const boards=[];
  for(let i=0;i<24;i++){
    const k=i%5,id=people[k],finish=.70+(i%8)*.12;
    const p=ease((u-i*.013+.085)/finish),a=i*2.40+p*1.29,r=(1-p)*(5.8+rnd(i+7)*4.3)+.13;
    if(p>.988)continue;
    const sz=(1-p*.83)*(1.13+rnd(i+87)*1.17);
    const image=i%4===0?plates[id]:i%4===2?plates.titleTiles[(i>>2)%3]:plates["tile"+k];
    boards.push(sheet([Math.cos(a)*r,Math.sin(a)*r*.73+.13,(1-p)*(rnd(i+45)*6-2)],
      sz,sz*(i%4===0?1.42:.65),image,
      Math.sin(a*2)*.74,(1-p)*Math.cos(a),a*.32+p*.35,{edge:PAPER}));
  }
  boards.push(sheet([at[0],at[1],-.10],diameter,diameter,plates.medal,0,0,0));
  boards.push(sheet(at,diameter,diameter,plates.medal,0,0,0));printWorld(cam,boards);
  if(u>=3*BAR){
    const p=ease((u-3*BAR)/.74);
    for(let i=0;i<5;i++){
      const a=i*TAU/5-1.32,offset=(1-p)*42;
      arc(center[0]+Math.cos(a)*offset,center[1]+Math.sin(a)*offset,rim,a,a+p*(TAU/5-.04),band[people[i]].color,7)
    }
    dial(center[0],center[1],rim+10,WHITE,125,time*.025)
  }
  for(const [x,y,r] of [[187,224,29],[1048,327,34],[267,425,15],[1121,160,15],[359,140,14]])star(x,y,r*(.80+.2*kick),WHITE);
  label("ENSEMBLE  /  05",75,116,10);label("SUNLIGHT PRESSING",1197,116,10,INK,"right");
  if(time<lyrics[19].end){lyricStrip(19,370,584,540,{size:30})}
  else{
    const y=568;rect(120,y,1040,68,INK,PAPER,1.5);
    const start=lyrics[20].text.indexOf("ひ");
    lyric(20,156,y+47,30,{last:start,c:WHITE,spacing:39,hot:BLUE});
    lyric(20,1103,y+50,46,{first:start,align:"right",c:SUN,edge:PAPER,spacing:54});
    label("LAST REFRAIN",125,657,8,INK);num("67 / A",1159,657,10,INK,"right");
  }
}
scenes[34]=solarFinal;
scenes[35]=()=>{
  const hold=CUTS[34]-.0001;
  if(!plates.freeze||plates.freeze.width!==g.canvas.width||plates.freeze.height!==g.canvas.height){
    const c=surface(g.canvas.width,g.canvas.height);renderAt(c.getContext("2d"),hold,c.width,c.height,{hud:false,grain:false});plates.freeze=c
  }
  g.drawImage(plates.freeze,0,0,W,H);
  shown.add(20);
  const {center,rim}=medalView(hold-CUTS[33]);
  const light=.22+.74*Math.sin(PI*span(local,0,CUTS[35]-CUTS[34]))**2;
  arc(center[0],center[1],rim,-1.32,-.94,rgba(WHITE,light),1.1);
};
scenes[36]=()=>{
  const u=local,cx=dropOrigin.x,cy=dropOrigin.y;rect(0,0,W,H,PAPER);pattern("grid","#e1e5df",42,.68);
  const decay=u<.40?1:clamp(signal(time)/Math.max(.04,signal(79.98))*.44+.56*(1-smooth((u-.4)/1.35)));
  const fade=Math.min(decay,1-smooth(span(u,1.01,1.75)));
  opacity(fade,()=>{
    for(let i=0;i<8;i++){
      const r=(i+1)*84*ease((u+.075-i*.024)/.89)+u*16;
      circ(cx,cy,r,null,[BLUE,"#86cfdf",SUN,PAPER][i%4],i%3===0?22:5);
      circ(cx,cy,r+4,null,DEEP,.8)
    }
  });
  line(0,cy,W,cy,DEEP,1);ruler(60,cy,1160,rgba(DEEP,.5),80,1);
  if(u<.38&&plates.medal){
    if(u<.14){
      const {center,rim}=medalView(CUTS[34]-CUTS[33]-.0001);
      for(let i=3;i>0;i--){
        const p=i/4,s=mix(63,rim,p*p),xx=mix(cx,center[0],p),yy=mix(cy-63,center[1],p);
        opacity((1-u/.14)*(.29-i*.052),()=>g.drawImage(plates.medal,xx-s,yy-s,2*s,2*s))
      }
    }
    const sz=53*(1-ease(u/.38))+13,squash=1-.27*(1-ease(u/.095));
    const w=2*sz/squash,h=2*sz*squash;g.drawImage(plates.medal,cx-w/2,cy-h,w,h)
  }else circ(cx,cy,4,BLUE);
  opacity(ease((u-.20)/.61),()=>{
    txt("壱雫空",640,397,70,INK,{font:DISPLAY,align:"center",track:5});
    txt("MyGO!!!!!",640,443,32,DEEP,{font:LATIN,style:"italic",weight:700,align:"center"});
    label("S I D E   A    /    E N D",640,311,10,INK,"center",2);
    people.forEach((id,i)=>circ(612+i*14,556,3.9,band[id].color));
  });
  marquee(610,30,time,BLUE,INK,"HITOSHIZUKU    /    MyGO!!!!!    ·    SUNLIGHT EDITION",61)
};
// Each exposure is attached to the incoming composition. Its interval has
// exactly one sample on the 60 fps export grid, including fractional cut times.
const chorusChanges=[
  [CUTS[29],"#90cfe8"],[CUTS[29]+BAR,PAPER],[CUTS[29]+1.5*BAR,"#90cfe8"],[CUTS[29]+2*BAR,BLUE],
  [CUTS[30],"#71c2e4"],[CUTS[30]+BAR,BLUE],[CUTS[30]+3*BAR,PAPER],
  [CUTS[31],"#59b3dc"],[CUTS[31]+BAR,SUN],
  [CUTS[32],"#57b6df"],[CUTS[32]+BAR,WHITE],
  [CUTS[33],SKY],[CUTS[33]+BAR,BLUE],[CUTS[33]+2*BAR,SKY],[CUTS[33]+3*BAR,SUN]
];
function chorusExposure(t){
  for(const [start,color] of chorusChanges){
    if(t>=start-1/60&&t<start)return color
  }
  return null
}
function transitionLayer(t,id){
  if((id===6||id===12)&&local<BEAT*.70){
    const bed=id===6?plates.endGroove:plates.endWave;
    if(bed){
      const q=ease(local/(BEAT*.70)),r=3+741*q;
      g.save();g.beginPath();g.rect(0,0,W,H);g.moveTo(640+r,356);g.arc(640,356,r,0,TAU);
      g.clip("evenodd");g.drawImage(bed,0,0,W,H);g.restore();
      circ(640,356,r,null,rgba(DEEP,1-q),1.45)
    }
  }
  for(let n=6;n<=10;n++){
    const boundary=CUTS[n],d=t-boundary,half=BEAT/2;
    if(d<=-half||d>=half)continue;const col=band[posterOrder[n-6]].color;
    if(d<0){
      const x=mix(-336,W,ease((d+half)/half));
      path([[-3,-2],[x+332,-2],[x,H+2],[-3,H+2]],col);
      line(x+324,0,x-8,H,PAPER,3)
    }else{
      const x=mix(-333,W+3,(d/half)**1.8);path([[x+332,-2],[W+334,-2],[W+334,H+2],[x,H+2]],col);
      line(x+340,0,x+8,H,PAPER,3)
    }
  }
  if(id>=29&&id<=34){
    streamers(t,id===33?22:37);
    const color=chorusExposure(t);if(color)rect(0,0,W,H,rgba(color,.6))
  }

  if(id===29&&t<60.05+1/60)rect(0,0,W,H,WHITE);
  else if(id===29&&t<60.19)rect(0,0,W,H,rgba(WHITE,(1-span(t,60.05+1/60,60.19))**2*.67));
}
function prepareProofs(){
  prepareOpeningColumns();
  plates.medal=medalPrint();
  plates.titleTiles=["壱","雫","空"].map((letter,i)=>makePrint(230,150,()=>{
    const ground=[PAPER,SUN,BLUE][i];rect(0,0,230,150,ground,INK,2);
    pattern("hatch-h",rgba(INK,.15),7,.8,8,8,214,134);
    txt(letter,110,123,115,INK,{font:DISPLAY,align:"center"});
    label("TITLE   /   "+pad(i+1),13,24,8,INK);target(204,122,6,INK)
  },1.7));
  const snapshot=(t,w,h,opt={})=>{const c=surface(w,h);renderAt(c.getContext("2d"),t,w,h,{hud:false,grain:false,...opt});return c};
  for(const [t,name] of [[4.71,"VOCAL PRINT"],[13.87,"LEAD GUITAR"],[15.09,"RHYTHM GUITAR"],[16.17,"BASS PRINT"],[17.42,"DRUM SCORE"],[21.67,"GLASS STUDY"],[25.89,"CANOPY"],[38.07,"CROSSING"],[48.22,"TYPE PASSAGE"],[61.10,"ENSEMBLE"]]){
    proofFrames.push({im:snapshot(t,640,360),cut:cutAt(t),name})
  }
  plates.helixEnd=snapshot(CUTS[26]-.0001,1920,1080,{parkCaption:true});
  plates.fanStart=snapshot(CUTS[31]-.0001,1600,900,{cleanFan:true});
  plates.endGroove=snapshot(CUTS[5]-.0001,1280,720);
  plates.endWave=snapshot(CUTS[11]-.0001,1280,720);
}

