"use strict";

function cover(context,w,h){
  const saved=g;g=context;g.save();g.setTransform(w/W,0,0,h/H,0,0);
  rect(0,0,W,H,PAPER);pattern("grid","#d9e0dc",39,.72);
  rect(0,0,650,H,gradient(0,0,650,0,[[0,rgba(PAPER,.88)],[.8,rgba(PAPER,.55)],[1,rgba(PAPER,0)]]));
  // The blue side of the jacket is an engraved record, with a screened wedge
  // and an offset second impression under the original colour die-cut.
  const cx=922,cy=352,rad=302;
  circleProof(cx,cy,rad);
  path([[617,565],[1194,93],[1300,140],[1300,172],[641,604]],rgba(WHITE,.24));
  line(611,566,1213,75,rgba(INK,.45),.9);
  ringType("H I T O S H I Z U K U     •     M y G O ! ! ! ! !     •     3 6   C U T S     /     S I D E   A     •     ",cx,cy,rad+16,9,INK,-2.3,TAU*.97);
  dial(cx,cy,rad+34,rgba(INK,.42),144,.03);
  if(sprites.tomori){
    person("tomori",cx+14,49,761,"light");
    person("tomori",cx+1,43,761,"sticker");
  }
  // A narrow exposed film edge is part of the sleeve, not the playback UI.
  rect(1253,0,27,H,"#d0e4ec");line(1253,0,1253,H,INK,.8);
  for(let n=0;n<30;n++)rect(1262,n*27+4,10,6,PAPER);
  place(1242,494,()=>label("VOCAL PRINT   /   T. TAKAMATSU",0,0,9,INK,"left",2.1),-PI/2);
  [ [628,126,22],[1144,151,16],[663,537,13],[1172,528,29] ].forEach(([x,y,r])=>{star(x+1.7,y+1.4,r,INK);star(x,y,r,PAPER)});
  for(const [x,y] of [[591,456],[712,74],[1202,351]])target(x,y,4.2,DEEP);
  smallCapsule("SIDE  A",76,55,80);
  label("MOTION SINGLE",176,70,10,INK,"left",2.3);
  line(311,66,384,66,INK,.7);num("№ 001",399,71,12);
  label("ひ   と   し   ず   く",82,175,16,DEEP,"left",2.5);
  txt("壱雫空",65,337,180,INK,{font:DISPLAY,track:-8});
  txt("Hitoshizuku",80,399,63,DEEP,{font:LATIN,style:"italic",track:-1.7});
  line(383,379,535,379,INK,.9);path([[535,379],[526,375],[528,379],[526,383]],INK);
  label("PERFORMED BY",80,464,9,INK,"left",2);
  txt("MyGO!!!!!",212,474,33,INK,{font:LATIN,style:"italic",weight:700,track:-1.3});
  // Lower edge: envelope sampled directly from the 81.4 s master.
  line(76,620,544,620,INK,1);wave(77,653,154,16,0,81.4,DEEP,1.05,135);
  line(254,637,254,667,rgba(INK,.4));
  num("01:21.4",275,651,16);label("RUN TIME",275,669,8,DEEP);
num("204",405,651,16);label("BPM  /  4⁄4",405,669,8,DEEP);
  place(1059,604,()=>{
    rect(-3,4,156,45,INK);rect(0,0,156,45,PAPER,INK,1);
    rect(0,0,35,45,BLUE,INK,1);num("05",17,28,15,INK,"center");
    label("VOCAL",45,15,8,DEEP);txt("高松 燈",44,35,19,INK,{font:MINCHO});
    star(139,22,6,INK)
  },-.075);
  for(const [x,y,dx,dy] of [[22,22,1,1],[1229,22,-1,1],[22,698,1,-1],[1229,698,-1,-1]])regCorner(x,y,dx,dy,INK,13);
  dust();g.restore();g=saved;
}
function circleProof(cx,cy,r){
  circ(cx,cy,r+8,PAPER,INK,.85);circ(cx,cy,r,BLUE,INK,1.5);
  clipCircle(cx,cy,r,()=>{
    rect(cx-r,cy-r,r*2,r*2,BLUE);
    path([[cx-r,cy+r],[cx+r,cy-r*.72],[cx+r,cy+r]],"#65a9d0");
    clipPolygon([[cx-r,cy+r],[cx+r,cy-r*.72],[cx+r,cy+r]],()=>pattern("dot",rgba(INK,.32),5,1.15,cx-r,cy-r,r*2,r*2));
    for(let n=0;n<28;n++)circ(cx,cy,r-(n+1)*3.9,null,n%5?rgba(WHITE,.65):rgba(INK,.65),n%5?.8:1.1);
    circ(cx,cy,r*.61,"#a7d3e8",PAPER,3);
    for(let n=0;n<8;n++)arc(cx,cy,r*.64+n*3.4,2.46,4.63,INK,n%3?.7:1.6);
    circ(cx,cy,r*.27,PAPER,INK,1);circ(cx,cy,r*.09,INK);circ(cx,cy,r*.028,PAPER);
    line(cx-r,cy,cx+r,cy,rgba(INK,.5));line(cx,cy-r,cx,cy+r,rgba(INK,.5));
  });
}
function figureLabel(n,title,x,y,color=INK){
  txt("Fig. "+pad(n),x,y,23,color,{font:LATIN,style:"italic"});
  line(x,y+10,x+129,y+10,color,.9);label(title,x,y+28,9,color,"left",1.7);
}
function fallingPlate(u){
  rect(0,0,W,H,PAPER);pattern("grid","#dde4df",42,.65);
  const cx=dropOrigin.x,cy=dropOrigin.y;
  txt("01",70,468,232,"#e1e9e7",{font:LATIN,style:"italic",track:-12});
  figureLabel(1,"PRECIPITATION",84,549);
  const fx=ease(u/1.15),drop=clamp(u/1.22)**2.6;
  line(cx,0,cx,cy*fx,DEEP,1.5);
  for(let j=0;j<3;j++)ellipse(cx,cy+3,j*35+22,j*7+4,null,rgba(DEEP,.22),1);
  line(304,cy+3,780,cy+3,rgba(DEEP,.48));target(cx,cy+3,4,DEEP);
  circ(cx,20+(cy-20)*drop,11,BLUE,INK,1.1);circ(cx-3,15+(cy-20)*drop,2.4,WHITE);
  label("Y  /  "+pad(Math.floor(drop*99)),cx+22,Math.max(110,cy*drop+10),9,DEEP);
  verticalOpening(0);
}
function verticalOpening(u){
  const cx=1012;
  line(cx+89,100,cx+89,550,rgba(INK,.4),.9);
  label("VOICE   01",cx-32,113,10,DEEP);
  lyric(0,cx,183,52,{first:0,last:6,vertical:true,spacing:58,c:INK,hot:DEEP});
  lyric(0,cx-82,246,50,{first:6,vertical:true,spacing:58,c:INK,hot:DEEP});
  place(cx+112,548,()=>label("OPENING VERSE",0,0,9,INK,"left",2.6),-PI/2);
}
scenes[1]=()=>fallingPlate(local);
scenes[2]=()=>{
  rect(0,0,W,H,PAPER);const fall=ease(local/.82),cx=dropOrigin.x,cy=dropOrigin.y;
  const downbeat=.045+2*BAR,age=time-downbeat;
  const pulse=1-.034*(age<0?smooth(span(age,-.09,0)):Math.exp(-13*age)*Math.cos(age*PI/.115));
  for(let i=0;i<9;i++){
    const r=(1060-i*118)*ease((local+.022-i*.025)/.87)*pulse;
    circ(cx,cy,r,i%2===0?BLUE:PAPER);
    if(r>8)circ(cx,cy,r-6,null,rgba(INK,.45),.8)
  }
  clipPolygon([[0,0],[246+fall*119,0],[95,H],[0,H]],()=>pattern("diag",rgba(DEEP,.41),9,1.25,0,0,500,H,local*16,0));
  circ(cx,cy,16,INK);circ(cx,cy,5,WHITE);
  dial(cx,cy,146,INK,84,local*.1);ringType("DROP   No. 01     /     FIRST IMPRESSION     /     ",cx,cy,158,10,INK,-2.4+local*.095,PI*1.6);
  rect(853,65,302,529,rgba(PAPER,.93));verticalOpening(local);
  figureLabel(1,"IMPACT STUDY",77,125);
  marquee(611,32,time,INK,PAPER,"HITOSHIZUKU    /    MyGO!!!!!    ·    RAIN STUDY  01",86);
};
function prepareOpeningColumns(){
  plates.takiName=makePrint(496,264,()=>txt("TAKI",9,244,244,WHITE,{font:COND,track:-4}),3);
  plates.takiSheen=silhouette(plates.takiName,"#c2c5f3");
  plates.anonScreen=makePrint(W,H,()=>{
    g.beginPath();
    for(let row=0;row<57;row++)for(let col=0;col<101;col++){
      const x=col*13+(row%2)*6.5,y=row*13;
      const density=clamp(1.08-.75*x/W-.81*y/H);
      const radius=4.65*density**.92;if(radius<.29)continue;
      g.moveTo(x+radius,y);g.arc(x,y,radius,0,TAU)
    }
    paint(rgba(WHITE,.83))
  },1.5);
  plates.voiceCard=makePrint(370,550,()=>{
    g.translate(185,275);
    rect(-148,-243,306,500,INK);rect(-153,-250,306,500,"#9acde5",INK,1.25);
    clipBox(-151,-247,302,493,()=>{
      pattern("hatch-h",rgba(WHITE,.48),7,1,-151,-247,302,493);
      circ(-6,-32,174,null,WHITE,31);txt("05",-130,100,217,rgba(PAPER,.5),{font:COND});
      person("tomori",0,-235,449,"sticker");
    });
    rect(-153,204,306,46,PAPER,INK,1);label("V O C A L",-135,233,11);
    txt("高松 燈",135,235,23,INK,{font:MINCHO,align:"right"});
    tape(-128,-239,90,-.36);tape(125,192,68,-.43)
  },3);
  plates.verseFurniture=makePrint(500,435,()=>{
    g.translate(4,-124);
    smallCapsule("VOICE   02",0,149,106);ruleLabel("LYRIC IMPRESSION",125,164,37);
    line(0,480,485,480,INK);label("H I T O S H I Z U K U",0,503,10);
    txt("ii.",466,543,56,DEEP,{font:LATIN,style:"italic",align:"right"})
  },3);
  plates.verseIndex=makePrint(123,530,()=>{
    g.translate(2,-85);
    line(0,90,0,610,rgba(INK,.35));smallCapsule("A — 02",18,150,84);
    rect(18,188,84,26,BLUE);label("204 BPM",60,206,10,INK,"center");
    place(66,451,()=>barcode(0,0,107,23,INK),-PI/2);num("MG / 001",18,485,11)
  },3)
}
scenes[3]=()=>{
  rect(0,0,W,H,PAPER);pattern("grid","#d5deda",34,.8);
  const rise=delay=>122*(1-ease((local-delay+.13)/.51));
  place(264,367+rise(0),()=>g.drawImage(plates.voiceCard,-185,-275,370,550),-.035+.12*(1-back(local/.50)));
  place(490,rise(BEAT/2),()=>{
    g.drawImage(plates.verseFurniture,-4,124,500,435);
    lyric(1,39,315,83,{last:4,slide:-28,wordSlide:true,hot:DEEP,spacing:88});
    lyric(1,73,432,77,{first:4,slide:-28,wordSlide:true,hot:DEEP,spacing:82})
  });
  g.drawImage(plates.verseIndex,1073,85+rise(BEAT),123,530);
  for(const [x,y,r] of [[102,328,13],[444,166,22],[1003,572,18]]){
    const size=r*(.68+.32*kick);star(x+1.3,y+1.5,size+1,INK);star(x,y,size,WHITE)
  }
};
const splitBeat=.045+6*BAR,stampBeat=.045+7*BAR;
function openingTypeWall(blue){
  rect(0,0,W,H,blue?BLUE:PAPER);
  for(let i=0;i<4;i++)for(let j=-1;j<3;j++)
    txt("HITOSHIZUKU",j*878-mod(time*(i%2?30:-23),878),132+i*180,170,null,{
      font:COND,stroke:blue?rgba(WHITE,.52):"#c9e2e9",sw:1.3
    });
}
function splitPortraits(progress){
  const settle=back(progress),preparation=smooth(span(time,splitBeat-.10,splitBeat));
  const seed=234+5*preparation;
  for(const i of [2,1,0]){
    if(i&&progress===0)continue;
    const x=mix(387,260+i*371,settle),y=mix(360,339,settle),r=mix(seed,152,settle);
    if(i===0){
      portraitDisc("tomori",x,y,r,"sticker",blend("#afd7e7",PAPER,progress),mix(.66,.55,progress));
      opacity(1-ease(progress),()=>{
        dial(x,y,r+15,INK,106,local*.04);
        ringType("TOMORI TAKAMATSU    /    MYGO!!!!!    /    VOCAL IN BLUE    /    ",x,y,r+30,12,INK,-1.9+local*.14)
      })
    }else{
      circ(x,y,r+3,PAPER,INK,1);
      clipCircle(x,y,r,()=>{
        rect(x-r,y-r,r*2,r*2,i===1?"#d4eaf1":"#b3d8eb");
        if(i===1)portrait("tomori",x-r,y-r,2*r,2*r,"print",.85);
        else person("tomori",x,y-r*.97,r*1.88,"dark")
      })
    }
    opacity(ease((progress-.42)/.58),()=>{
      circ(x,y,r+7,null,INK,.8);
      label(["VOICE  /  05","PRINT  /  II","FORM  /  III"][i],x,530,10,INK,"center")
    })
  }
}
function openingVerseType(fold,stamp=0,stop=lyrics[2].chars.length){
  const items=lyrics[2].chars,space=items.findIndex(c=>c.ch===" "),today=lyrics[2].text.indexOf("今日");
  shown.add(2);
  items.forEach((item,j)=>{
    if(item.ch===" "||j>=stop)return;
    const col=j<space?0:j<today?1:2;
    const first=[0,space+1,today][col],cx=[1000,908,834][col];
    const cy=[143,137,284][col]+(j-first)*[51,46,48][col];
    const rowX=640+(j-(items.length-1)*.5)*mix(39,37,stamp);
    const fromSize=[45,43,42][col],toSize=mix(33,32,stamp),rowY=mix(604,611,stamp);
    // Transfer the ink through a moving edge. Opposite reading directions
    // keep separate baselines while the three portrait windows fan apart.
    const transfer=clamp(fold*1.47-.47*j/(items.length-1));
    if(transfer<1){
      const left=cx-fromSize*.62,width=fromSize*1.24;
      clipBox(left+width*transfer,cy-fromSize*1.16,width*(1-transfer),fromSize*1.52,
        ()=>glyph(item,cx,cy,fromSize,INK,{hot:DEEP}))
    }
    if(transfer>0){
      const width=toSize*1.24;
      clipBox(rowX-width/2,rowY-toSize*1.16,width*transfer,toSize*1.52,
        ()=>glyph(item,rowX,rowY,toSize,INK,{hot:DEEP}))
    }
  })
}
function dropTitlePlate(age){
  const plate=back(span(age,0,.30)),w=4+622*plate,h=3+413*plate,x=639-w/2,y=347-h/2;
  for(let n=0;n<7;n++)rect((n%2?-1:1)*(1-ease((age-n*.025)/.42))*W,148+n*61,W,[4,21,6,58,13,36,5][n],n%2?PAPER:INK);
  rect(x,y,w,h,PAPER,INK,1.3);
  clipBox(x+2,y+2,w-4,h-4,()=>{
    const scale=.62+.38*back(age/.34);
    place(639,353,()=>txt("一滴",-9,131,311,BLUE,{font:DISPLAY,align:"center",track:-12,stroke:INK,sw:1.4}),0,scale);
    label("ONE DROP   /   HITOSHIZUKU",640,178,11,INK,"center",3)
  })
}
scenes[4]=()=>{
  const split=span(time,splitBeat,splitBeat+.33),age=time-stampBeat;
  openingTypeWall(time>=splitBeat);
  if(age<0)splitPortraits(split);
  else{
    if(age<.26)opacity(1-smooth(age/.26),()=>splitPortraits(1));
    dropTitlePlate(age)
  }
  openingVerseType(smooth(split),ease(age/.30))
};
scenes[5]=()=>{
  rect(0,0,W,H,PAPER);const collapse=smooth(span(local,2.02,2.32)),r=222*ease((local+.015)/.7)*(1-collapse);
  pattern("grid",rgba(DEEP,.12*(1-ease(local/1.2))),42,.8);
  marquee(59,24,Math.min(time,11.53),BLUE,INK,"SIDE A     /     FIELD RECORDING     01",62);
  marquee(625,24,-Math.min(time,11.53),INK,WHITE,"MYGO!!!!!     /     WAVE IMPRESSION",64);
  line(50,353,1230,353,rgba(INK,.62));ruler(54,353,1172,rgba(INK,.54),96);
  if(r>3){arc(640,353,r,-PI/2,-PI/2+TAU*ease(local/.80),DEEP,2.6);
    dial(640,353,r+12,rgba(DEEP,.56),100);
    // An actual polar inscription of the music replaces a generic waveform.
    const pts=[];for(let i=0;i<=220;i++){
      const a=i/220*TAU-PI/2,rr=r-8-signal(time-1.7+i/220*2.35)*24;
      pts.push([640+Math.cos(a)*rr,353+Math.sin(a)*rr])}
    opacity((1-collapse)*.85,()=>path(pts,null,DEEP,1.3));
    figureLabel(2,"GROOVE TRACE",84,268);num("204 / 4",1110,397,12);
    label("AUDIO ETCHING",640,319,10,DEEP,"center",2.4);
  }
  const items=lyrics[2].chars,first=lyrics[2].text.indexOf("顔"),travel=smooth(local/.32);
  circ(640,353,4.5,INK);
  if(local<.24){
    const offset=-W*span(local,0,.24)**2.15;
    clipBox(0,0,W+offset,H,()=>place(offset,0,()=>{
      openingTypeWall(true);dropTitlePlate(1);openingVerseType(1,1,first)
    }))
  }
  shown.add(2);
  opacity(1-smooth(span(local,1.95,2.12)),()=>{
    for(let j=first;j<items.length;j++){
      const from=640+(j-(items.length-1)*.5)*37;
      const to=640+(j-first-(items.length-first-1)*.5)*47;
      glyph(items[j],mix(from,to,travel),mix(611,431,travel),mix(32,42,travel),INK,{hot:DEEP})
    }
  });
};
function record(x,y,r,a){
  circ(x,y,r,INK,WHITE,2);
  for(let i=1;i<25;i++){const rr=r*(1-.025*i);circ(x,y,rr,null,i%4?rgba(BLUE,.34):rgba(WHITE,.70),i%4?.8:1.15)}
  for(let i=0;i<14;i++)arc(x,y,r*(.39+i*.042),a-.25,a+.29,rgba(WHITE,.55),1.5);
  circ(x,y,r*.35,BLUE,WHITE,1);circ(x,y,r*.28,null,INK,.85);
  arc(x,y,r*.245,a,a+PI*.89,PAPER,r*.041);
  arc(x,y,r*.245,a+PI,a+PI*1.72,INK,r*.016);circ(x,y,r*.035,PAPER,INK,1);
}
function sleeve(x,y,s,u){
  place(x,y,()=>{
    rect(6,7,s,s,INK);rect(0,0,s,s,PAPER,INK,1.7);
    rect(12,12,s-24,s-24,null,INK,.8);pattern("grid",rgba(DEEP,.13),20,.9,14,14,s-28,s-28);
    smallCapsule("SIDE A",25,25,63);num("MG—001",s-23,42,11,INK,"right");
    parasol.draw(parasol.make({x:s*.31,y:s*.281,r:s*.194,yaw:.64+u*.31,
      elevation:.24,roll:.46,tint:"#a3cddd"}));
    const chars=["壱","雫","空"];
    chars.forEach((ch,i)=>{
      const impact=(i+1)*BEAT,size=s*(i===1?.47:.25),xx=s*[.19,.50,.82][i];
      const progress=span(u,impact-.18,impact),q=back(progress);
      if(progress<1)txt(ch,xx,s*.72,size,null,{font:DISPLAY,align:"center",stroke:rgba(DEEP,.33),sw:.85});
      if(progress>0)txt(ch,xx+(i-1)*(1-q)*66,s*.72+(1-q)*(i===1?-56:41),size,
        progress===1||i===1?INK:null,{font:DISPLAY,align:"center",stroke:INK,sw:1});
    });
    line(28,s*.78,s-28,s*.78,INK);txt("MyGO",s*.44,s*.91,s*.12,INK,{font:LATIN,style:"italic",weight:700,align:"right"});
    people.forEach((id,i)=>{
      const fall=(u-.88-i*.037)/.14;if(fall<=0)return;
      txt("!",s*.455+i*s*.049,s*.91-29*(1-back(fall)),s*.12,band[id].color,{font:LATIN,weight:700,style:"italic",stroke:INK,sw:.65})
    });
    tape(s-38,s*.14,79,.48,"#c3dce7");
  },-.038)
}
scenes[6]=()=>{
  rect(0,0,W,H,BLUE);pattern("diag",rgba(PAPER,.64),27,7,0,0,W,H,time*24);
  const dy=260*(1-back(local/.44));
  ringType("      HITOSHIZUKU   ·   MYGO!!!!!   ·   MOTION SINGLE   ·   ",630,357,284,12,INK,-2+local*.34);
  record(692+100*ease((local-.26)/.56),345+dy,210,local*1.5);sleeve(358,128+dy,433,local);
  figureLabel(3,"SINGLE PRESS",72,214);barcode(1020,523,128,31);num("0001  204  05",1020,572,11);
  [[287,534,29],[1008,170,23],[1068,312,12],[236,295,9]].forEach(([x,y,r])=>star(x,y,r*(.8+.2*kick),INK));
};
function checkSticker(x,y,s,ang){
  place(x,y,()=>{rect(-s/2+3,-s/2+4,s,s,INK);rect(-s/2,-s/2,s,s,PAPER,INK,1);pattern("check",INK,s/6,1,-s/2+3,-s/2+3,s-6,s-6)},ang);
}
function ranaString(i,inBar){
  let offset=0;
  for(const onset of [0,BEAT*2,BEAT*3]){
    const age=inBar-onset-i*.027;
    if(age>=0)offset+=Math.sin(age*90)*Math.exp(-age*17)
  }
  return offset
}
scenes[7]=()=>{
  const inBar=time-(.045+11*BAR);
  const green=band.rana.color;rect(0,0,W,H,PAPER);
  [20,55,16,8,66,15,28,7,42].forEach((width,i)=>{
    const x=55+i*143;rect(x,0,width,H,i%2?rgba(green,.38):green);
    for(let n=-1;n<4;n++){
      const y=n*242+mod(inBar*57+i*69,242);
      rect(x,y,width,14+i%3*7,rgba(WHITE,.62));
      line(x,y+23,x+width,y+23,rgba(INK,.26),.8)
    }
  });
  const shake=ranaString(0,inBar);
  const entry=back((inBar-(BEAT-.19))/.19);
  place(425+3*shake,782-129*(1-entry)+4*shake,()=>{
    txt("RANA",0,0,282,null,{font:COND,stroke:"#38935a",sw:2.1,track:6})
  },-PI/2,1.46,1);
  txt("Rana",87,570,143,INK,{font:LATIN,style:"italic",track:-6});
  line(88,589,371,589,INK,1.4);label("LEAD GUITAR   /   6 STRINGS",88,614,11,INK);
  const px=943+6*shake;
  for(let i=0;i<6;i++){
    const x=516+i*128,amp=ranaString(i,inBar)*26;
    g.beginPath();g.moveTo(x,0);g.bezierCurveTo(x+amp,219,x+amp,501,x,H);
    paint(null,INK,1.85-i*.19);
    const reveal=ease((inBar-i*.027)/.159);
    clipBox(x,0,128.3*reveal,H,()=>person("rana",px,50,1228,"sticker"));
    if(reveal>0&&reveal<.99)line(x+128*reveal,0,x+128*reveal,H,WHITE,2)
  }
  checkSticker(1128,135,61,.17);checkSticker(536,511,55,-.15);
  labelTag("rana",77,89,197);
};
scenes[8]=()=>{
  const inBar=time-(.045+12*BAR);
  rect(0,0,W,H,"#f28a9b");g.drawImage(plates.anonScreen,0,0,W,H);
  const drift=inBar*20;
  place(drift,-drift*.38,()=>{
    path([[-60,567],[W+40,54],[W+40,196],[-60,715]],WHITE);
    place(69,486,()=>{g.transform(1,0,-.22,1,0,0);txt("ANON",0,0,246,WHITE,{font:COND,stroke:INK,sw:2,track:-4})},-.31);
    const shot=frac(inBar/BEAT),travel=ease(shot),reach=186*Math.sin(PI*shot);
    for(let j=0;j<5;j++){
      const x=1036+132*travel+j*14,y=231-49*travel-j*13;
      line(x,y,x+reach,y-reach*.38,WHITE,j%3+1)
    }
    for(let i=0;i<3;i++){
      const age=inBar-i*BEAT/2;if(age<0)continue;
      const p=back(age/.20);
      person("anon",625+i*72-65*(1-p),192-i*32+37*(1-p),508+17*i,["white","light","sil"][i])
    }
    if(inBar>=2*BEAT){
      const bounce=Math.sin(PI*span(inBar,2*BEAT,2*BEAT+.17))*Math.exp(-10*(inBar-2*BEAT));
      person("anon",866+4*bounce,79-11*bounce,576,"sticker")
    }
    for(const [x,y,r,i] of [[248,157,45,0],[1127,466,37,1],[503,545,23,2],[1144,134,17,1]])
      star(x,y,r*back((inBar-i*BEAT/2)/.24),WHITE,-.1,5)
  });
  labelTag("anon",78,574,214);label("RHYTHM GUITAR",80,631,10,INK);
};
scenes[9]=()=>{
  const inBar=time-(.045+13*BAR);
  const warm="#ebcf91";rect(0,0,W,H,PAPER);rect(0,360,W,360,warm);
  pattern("hatch-h","#d9d6c5",12,1,0,59,W,301);
  clipBox(0,360,W,360,()=>{for(let i=0;i<16;i++)ellipse(640,371,70+i*42,25+i*15,null,rgba(INK,.25),.8)});
  const phase=mod(inBar,BEAT)/BEAT,dip=21*Math.sin(phase*TAU)*Math.exp(-5*phase);
  for(let i=0;i<4;i++){
    const y=257+i*49;g.beginPath();g.moveTo(0,y);
    g.quadraticCurveTo(640,y+dip,W,y);paint(null,INK,i+1)
  }
  txt("S",71,437,266,rgba(PAPER,.8),{font:LATIN,style:"italic"});
  txt("S",1209,437,266,rgba(PAPER,.8),{font:LATIN,style:"italic",align:"right"});
  const q=ease((inBar+.025)/.38);
  clipBox(456,360-297*q,368,594*q,()=>{
    rect(476,64,328,592,PAPER,INK,1.5);rect(487,74,306,572,warm,INK,.8);
    clipBox(488,75,304,570,()=>{
      rect(488,75,304,285,PAPER);circ(640,234,111,null,"#c3ab7e",1.2);
      const foot=360,bodyH=280,top=foot-bodyH*1519/1536;
      clipBox(488,75,304,285,()=>person("soyo",640,top,bodyH,"original"));
      const reflection=ease((inBar-BEAT/2)/.28);
      opacity(.52*reflection,()=>place(640,2*foot-top,()=>person("soyo",0,0,bodyH,"print"),0,1,-1));
      rect(487,foot,306,286,gradient(0,foot,0,645,[[0,rgba(warm,.05)],[1,rgba(warm,.91)]]));
      line(488,foot,792,foot,rgba(INK,.49),.9)
    });
  });
  [423,857].forEach((xx,n)=>{for(let i=0;i<21;i++){const y=155+i*19;line(xx,y,xx+(n?1:-1)*(i%4===0?14:5),y,INK);if(i%7===0)circ(xx+(n?1:-1)*30,y,3,INK)}});
  place(377,454,()=>txt("SOYO",0,0,64,null,{font:LATIN,stroke:INK,sw:1.1,track:7}),-PI/2);
  labelTag("soyo",925,533,230);label("ELECTRIC BASS   /   4 STRINGS",925,596,10);
};
scenes[10]=()=>{
  const inBar=time-(.045+14*BAR);
  const bg="#272944";rect(0,0,W,H,bg);pattern("grid","#41425c",35,1);
  for(let i=0;i<7;i++)circ(904,403,59+i*52,null,"#646786",1);
  const split=3.6+4.4*Math.exp(-7*frac(beat)),slope=.51,leftY=365,rightY=leftY-585*slope;
  clipPolygon([[0,0],[585,0],[585,rightY-split],[0,leftY-split]],()=>{
    g.drawImage(plates.takiName,69-split,75-1.4,496,264)
  });
  clipPolygon([[0,leftY+split],[585,rightY+split],[585,370],[0,370]],()=>{
    g.drawImage(plates.takiName,69+split,75+1.4,496,264)
  });
  clipPolygon([[0,leftY+split],[585,rightY+split],[585,rightY+split+10],[0,leftY+split+10]],()=>{
    g.drawImage(plates.takiSheen,69+split,75+1.4,496,264)
  });
  label("PERCUSSION   /   EIGHTH NOTES",85,352,12,WHITE);
  const x=818,top=91,hh=625;
  const width=hh*sprites.taki.original.width/sprites.taki.original.height,left=x-width/2;
  const drumX=left+.484*width,drumY=top+.738*hh;
  person("taki",x+2,top-2,hh,"white");person("taki",x,top,hh,"dark");
  opacity(.15,()=>person("taki",x,top,hh,"print"));
  const shimmer=.44+.53*Math.exp(-5*frac(beat*2));
  for(const [xc,yc,rx,ry,a] of [[.266,.310,.146,.040,.25],[.836,.311,.138,.034,-.24],[.892,.432,.101,.014,-.035],[.232,.444,.124,.013,.11]])
    ellipse(left+xc*width,top+yc*hh,rx*width,ry*hh,null,rgba(WHITE,shimmer),1.2,a);
  circ(drumX,drumY,126,null,WHITE,1.5);
  const expand=ease((inBar-2*BEAT)/.36),rr=111*ease(inBar/.22)+expand*1000;
  clipCircle(drumX,drumY,rr,()=>{
    person("taki",x,top,hh,"original");
    opacity(1-ease((inBar-2*BEAT)/.13),()=>{
      rect(drumX-112,drumY-112,224,224,"#adafcf");
      pattern("diag",rgba(WHITE,.49),13,1,drumX-112,drumY-112,224,224);
      const split=drumX+6;
      clipPolygon([[drumX-113,drumY-113],[split+24,drumY-113],[split-23,drumY+113],[drumX-113,drumY+113]],
        ()=>cropDetail("taki",drumX-113,drumY-110,149,220,[.465,.311,.163,.136]));
      clipPolygon([[split+24,drumY-113],[drumX+113,drumY-113],[drumX+113,drumY+113],[split-23,drumY+113]],
        ()=>cropDetail("taki",split-23,drumY-112,135,224,[.684,0,.122,.275]));
      line(split+24,drumY-113,split-23,drumY+113,WHITE,1.35)
    });
  });
  for(let strike=0;strike<4;strike++){
    const age=inBar-strike*BEAT;
    if(age>=0&&age<.86){
      const spread=ease(age/.86);
      circ(drumX,drumY,113+407*spread,null,rgba(WHITE,.74*(1-age/.86)),1.3)
    }
  }
  const eighth=frac(inBar/(BEAT/2)),flash=Math.exp(-eighth*7);
  for(const [xc,yc,rx,ry,a] of [[.266,.310,.146,.040,.25],[.836,.311,.138,.034,-.24]]){
    place(left+xc*width,top+yc*hh,()=>{
      g.beginPath();g.ellipse(0,0,rx*width,ry*hh,0,PI*1.05,PI*1.82);
      paint(null,rgba(WHITE,.84*flash),2.2)
    },a)
  }
  for(let i=0;i<8;i++)rect(861+i*37,59,28,10,i<=mod(Math.floor(beat*2),8)?WHITE:"#565775");
  for(const [xx,yy] of [[546,311],[945,318],[1045,302]])star(xx,yy,7+signal(time,2)*16,WHITE);
  labelTag("taki",76,551,218,WHITE,bg)
};
// Outer contour of the supplied Tomori alpha mask on a 256×384 grid. The
// trace begins and ends at the microphone base, where the waveform is flat.
const vocalContour=[[128,380],[94,380],[80,378],[73,375],[73,369],[75,369],[76,367],[90,363],[105,361],[104,353],[112,333],[112,287],[111,277],[106,267],[105,257],[108,243],[110,241],[112,233],[110,234],[109,240],[105,246],[105,249],[100,260],[96,263],[92,271],[92,274],[89,278],[89,281],[85,289],[81,293],[79,299],[77,300],[72,310],[74,312],[74,316],[67,337],[68,362],[64,365],[63,372],[58,375],[44,375],[32,371],[35,356],[38,354],[39,350],[43,345],[44,340],[48,336],[47,324],[50,323],[51,316],[54,312],[54,308],[58,305],[64,275],[72,260],[75,258],[75,256],[81,249],[85,230],[84,216],[82,216],[80,226],[76,226],[71,213],[67,219],[64,219],[67,205],[65,201],[63,201],[63,197],[60,195],[61,190],[56,190],[56,188],[54,187],[54,184],[59,179],[64,177],[63,173],[61,172],[61,169],[63,167],[75,164],[74,159],[76,157],[84,155],[83,150],[79,148],[79,143],[83,138],[80,136],[76,127],[73,124],[73,120],[77,115],[74,118],[71,118],[71,113],[76,108],[77,99],[85,90],[88,89],[88,86],[90,84],[93,84],[95,77],[100,72],[106,72],[104,70],[99,71],[98,69],[97,71],[90,70],[89,58],[86,62],[87,69],[83,68],[81,49],[78,49],[77,41],[83,29],[92,20],[92,18],[95,15],[97,15],[100,11],[108,8],[111,3],[120,3],[126,6],[133,7],[141,11],[142,13],[146,14],[158,25],[160,30],[160,36],[158,37],[160,41],[160,49],[155,50],[155,54],[151,55],[149,59],[145,58],[145,62],[138,62],[141,63],[142,66],[144,66],[145,68],[149,69],[154,69],[157,67],[163,67],[167,69],[169,71],[170,78],[174,80],[174,85],[179,87],[179,95],[183,103],[185,104],[185,109],[179,115],[180,122],[177,128],[171,129],[170,127],[168,127],[169,131],[178,140],[177,145],[173,149],[176,155],[178,156],[178,160],[176,161],[173,167],[176,171],[178,171],[180,174],[182,174],[185,178],[187,178],[190,181],[190,185],[192,187],[201,192],[201,195],[195,197],[195,200],[201,206],[201,209],[197,213],[198,218],[196,220],[189,221],[189,223],[187,223],[186,225],[181,224],[180,226],[175,227],[174,229],[172,229],[172,234],[178,252],[188,265],[193,275],[199,308],[203,310],[204,316],[206,317],[208,324],[212,326],[212,329],[210,329],[210,338],[213,340],[214,347],[217,350],[219,356],[221,357],[221,360],[223,361],[224,365],[224,373],[221,375],[198,377],[193,374],[193,366],[191,365],[192,343],[190,333],[187,329],[184,320],[185,313],[179,301],[172,292],[162,267],[156,261],[152,249],[147,241],[147,237],[144,236],[140,240],[136,240],[136,230],[129,227],[128,225],[122,225],[119,226],[118,229],[118,282],[120,284],[124,296],[124,312],[118,328],[118,353],[121,353],[121,361],[149,363],[160,366],[164,369],[164,374],[162,374],[161,376],[128,380]];
const vocalScale=209/384,vocalTop=52-vocalContour[0][1]*vocalScale;
let vocalDistance=0;
const vocalTrace=vocalContour.map(([x,y],i)=>{
  if(i)vocalDistance+=Math.hypot(x-vocalContour[i-1][0],y-vocalContour[i-1][1])*vocalScale;
  return {x:(x-128)*vocalScale,y:vocalTop+y*vocalScale,d:vocalDistance}
});
function outlineVoice(progress){
  const distance=vocalDistance*progress;
  g.beginPath();g.moveTo(vocalTrace[0].x,vocalTrace[0].y);
  let tip=vocalTrace[0];
  for(let i=1;i<vocalTrace.length;i++){
    const point=vocalTrace[i],last=vocalTrace[i-1];
    if(point.d>distance){
      const fraction=(distance-last.d)/(point.d-last.d);
      tip={x:mix(last.x,point.x,fraction),y:mix(last.y,point.y,fraction)};
      g.lineTo(tip.x,tip.y);break
    }
    tip=point;g.lineTo(point.x,point.y)
  }
  paint(null,DEEP,1.25);
  if(progress<1)circ(tip.x,tip.y,2.1,BLUE)
}
scenes[11]=()=>{
  const inBar=time-(.045+15*BAR);
  rect(0,0,W,H,WHITE);const shrink=1-smooth(span(inBar,3*BEAT,BAR-.023));
  place(640,359,()=>{
    const left=ease(inBar/.20),trace=span(inBar,.20,.55),color=ease((inBar-.55)/.16);
    clipBox(-640,-120,640*left,310,()=>{
      wave(-640,52,540,63,time-.7,2.2,BLUE,1.4,147);line(-100,52,0,52,BLUE,1.4)
    });
    if(inBar>=.20)opacity(1-color*.84,()=>outlineVoice(trace));
    clipBox(-87,52-212*color,174,214*color,()=>person("tomori",0,vocalTop,209,"original"));
    const right=ease((inBar-.55)/.28);
    clipBox(0,-120,640*right,310,()=>{
      line(0,52,97,52,BLUE,1.4);wave(97,52,543,63,time+.8,2.2,BLUE,1.4,147)
    });
    opacity(ease((inBar-.39)/.18),()=>{
      star(0,-184,10*(.8+kick*.2),BLUE);label("T O M O R I",0,98,12,INK,"center",3)
    });
    labelTag("tomori",-564,209,198,INK,WHITE);
  },0,Math.max(shrink,.002));
  if(shrink<.12)circ(640,359,3.1,BLUE);
  if(shrink<.02)shown.add(3)
};

