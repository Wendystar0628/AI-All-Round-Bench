"use strict";
function glassField(strength=1){
  rect(0,0,W,H,gradient(0,0,W,H,[[0,"#d1e7ed"],[.46,"#edf2eb"],[1,"#acd4e3"]]));
  pattern("diag",rgba(WHITE,.48),20,.8,0,0,W,H,time*6,0);
  for(let i=0;i<8;i++){
    const x=mod(rnd(i+122)*W+time*(i%2?8:-6),W+200)-90,y=rnd(i+142)*H+14*Math.sin(time*.34+i);
    glow(x,y,80+rnd(i)*108,WHITE,(.37+rnd(i)*.32)*strength)
  }
}
function glassCard(id,cx,cy,w,h,focus){
  const m=band[id],x=-w/2,y=-h/2;
  place(cx,cy,()=>{
    rect(x+5,y+7,w,h,rgba(INK,.08));rect(x,y,w,h,rgba(WHITE,.61),rgba(INK,.69),1);
    rect(x+5,y+5,w-10,h-10,null,rgba(m.ink,.51),.9);
    const top=y+42,hh=h-89;
    clipBox(x+7,top,w-14,hh,()=>{
      rect(x+7,top,w-14,hh,rgba(blend(m.color,PAPER,.36),.69));pattern("hatch-h",rgba(WHITE,.45),6,.75,x+7,top,w-14,hh);
      circ(0,top+hh*.42,Math.min(w*.52,hh*.62),rgba(PAPER,.48));
      if(id==="tomori"){
        const bodyHeight=hh/.68;
        opacity(focus,()=>{
          txt("V",x+27,top+hh*.73,118,rgba(DEEP,.31),{font:LATIN,style:"italic"});
          wave(-x-132,top+hh*.52,104,37,time-.6,1.4,DEEP,1.25,74);
          label("VOICE  /  05",-x-80,top+hh*.52+46,8,DEEP,"center")
        });
        person(id,(.5-m.focus)*bodyHeight*2/3,top+hh*.035,bodyHeight,"sticker")
      }else{
        portrait(id,x+7,top,w-14,hh,"sil",.68);
        clipPolygon([[x,top+hh*.76],[-x,top+hh*.46],[-x,top+hh*.69],[x,top+hh*.99]],
          ()=>portrait(id,x+7,top,w-14,hh,"print",.68))
      }
      path([[x+w*.25,top],[x+w*.33,top],[x+w*.07,top+hh],[x,top+hh]],rgba(WHITE,.20))
    });
    num("PL. "+m.number,x+14,y+26,11,INK);circ(-x-18,y+21,4.5,m.color,m.ink,1);
    label(m.name,0,-y-23,13,INK,"center",2.2);line(x+11,-y-40,-x-11,-y-40,m.ink,.7)
  });
}
scenes[12]=()=>{
  glassField();figureLabel(4,"TRANSPARENT PLATES",74,107);
  label("FIVE STUDIES IN LIGHT",1197,107,10,DEEP,"right",2.8);
  const scroll=ease((local-BAR)/.68),zoom=ease((local-2*BAR)/.58);
  // Both ends of the moving strip exist at once. Their edges enter and leave
  // through the margin mask rather than wrapping a visible card by one lap.
  const restX=[111,285,640,995,1169,1378];
  clipBox(49,49,1182,516,()=>{
    for(const slot of [0,1,3,4,5,2]){
      const i=slot%people.length,id=people[i],lead=id==="tomori";
      const x=mix(178+(slot-scroll)*231,restX[slot],zoom);
      const y=348-(1-back((local-i*BEAT/2+.075)/.46))*550+(i%2)*9;
      const width=mix(188,lead?566:145,zoom);
      if(x+width/2<43||x-width/2>1231)continue;
      opacity(lead?1:1-.52*zoom,()=>glassCard(id,x,y,width,351+(lead?43:0)*zoom,lead?zoom:0))
    }
  });
  line(93,568,1187,568,rgba(INK,.45));circ(94,568,3,INK);circ(1186,568,3,INK);
  lyric(3,640,622,32,{align:"center",spacing:36,hot:DEEP});
  ruler(76,654,1128,rgba(INK,.48),96,-1);
};
function panelRays(offset,ink,width){
  const drift=12*Math.sin((time-22.40)*.71);
  for(let i=0;i<3;i++){
    const x=140+i*370+drift+offset;
    line(x,603,x+282,107,ink,width*(1+i*.43))
  }
}
scenes[13]=()=>{
  glassField(1.4);
  panelRays(0,rgba(WHITE,.65),1.15);
  txt("Quartet",68,161,105,rgba(DEEP,.45),{font:LATIN,style:"italic",track:-4});
  label("HARMONY   /   4 VOICES",76,188,11);
  const members=["rana","anon","soyo","taki"],xs=[254,499,763,1012],ys=[384,313,397,309];
  const tilt=[-.073,.053,-.035,.071];
  const order=[[0,1,2,3],[1,0,3,2],[2,0,3,1],[2,1,0,3],[0,1,2,3]];
  const n=clamp(Math.floor((local-BAR)/BEAT)+1,0,4),p=ease(frac((local-BAR)/BEAT)*1.45);
  const splits=[[0,2],[2,4],[4,6],[6,8]];
  const voice=lyrics[4],letter=voice.chars.findLastIndex(ch=>ch.at<=time);
  const solo=time<voice.end?splits.findIndex(([a,b])=>letter>=a&&letter<b):-1;
  const layers=[0,1,2,3].filter(i=>i!==solo);
  if(solo!==-1)layers.push(solo);
  for(const i of layers){
    const id=members[i],jj=order[n][i],last=order[Math.max(0,n-1)][i];
    const lift=Math.sign(jj-last)*Math.sin(PI*p),x=mix(xs[last],xs[jj],p),y=mix(ys[last],ys[jj],p)-lift*45;
    const age=time-voice.start-i*BEAT/2,light=ease(age/.21),gleam=light*Math.exp(-4*Math.max(0,age));
    const m=band[id],w=295,h=324,angle=mix(tilt[last],tilt[jj],p)+.047*lift;
    place(x,y,()=>{
      rect(-w/2+4,-h/2+6,w,h,rgba(m.ink,.085));
      rect(-w/2,-h/2,w,h,rgba(WHITE,.54+.20*gleam),m.ink,1.15);
      line(-w/2+3,-h/2+2,w/2-3,-h/2+2,rgba(WHITE,.84),1.5+2*gleam);
      rect(-w/2+7,-h/2+7,w-14,h-14,null,rgba(m.ink,.33));
      clipBox(-w/2+9,-h/2+32,w-18,h-103,()=>{
        rect(-w/2,-h/2,w,h,rgba(blend(m.color,PAPER,.48-.20*light),.62));
        pattern("dot",rgba(WHITE,.32),7,.8,-w/2,-h/2,w,h);
        portrait(id,-w/2+10,-h/2+32,w-20,h-96,"light",.67);
        clipPolygon([[-w/2,-2],[w/2,-78],[w/2,-33],[-w/2,49]],()=>portrait(id,-w/2+10,-h/2+32,w-20,h-96,"print",.67));
        if(age>0&&age<.43){
          const sx=mix(-w*.8,w*.85,ease(age/.43));
          path([[sx,-h/2],[sx+14,-h/2],[sx-48,h/2],[sx-62,h/2]],rgba(WHITE,.58*gleam))
        }
      });
      clipBox(-w/2+9,-h/2+32,w-18,h-103,()=>{
        g.save();g.rotate(-angle);g.translate(-x,-y);
        panelRays(6+i*2+4*lift,rgba(WHITE,.76),1.4);
        panelRays(8+i*2+4*lift,rgba(m.ink,.19),.8);
        g.restore()
      });
      label("0"+(i+1)+"   /   "+m.name,-w/2+16,-h/2+21,9,m.ink);circ(w/2-18,-h/2+17,4,m.ink);
      rect(-w/2+9,h/2-64,w-18,53,rgba(WHITE,i===solo?.85:.44));
      lyric(4,0,h/2-25,29,{first:splits[i][0],last:splits[i][1],c:blend(m.ink,INK,.18),font:JP,align:"center",spacing:43});
      line(-w/2+14,h/2-66,w/2-14,h/2-66,m.ink,.75)
    },angle);
  }
  ruler(78,594,1118,rgba(INK,.48),64,1);
  if(time>24.39){
    rect(0,0,W,H,rgba(PAPER,.64*smooth(span(time,24.48,24.75))));
    const opacityIn=ease((time-24.39)/.12);
    opacity(opacityIn,()=>canopyInscription(smooth(span(time,24.39,24.75)),studyUmbrella(0)))
  }
};
function studyPose(t){
  return {x:646,y:348,r:353,yaw:.46+t*.44,elevation:-.52+.035*Math.sin(t*1.18),
    roll:-.205+.046*Math.sin(t*.92)};
}
function studyUmbrella(t){
  return parasol.make({...studyPose(t),tint:"#91c3d8",water:"rain",seconds:t,seed:3,
    releasePose:elapsed=>studyPose(t-elapsed)});
}
function canopyInscription(travel,model){
  const items=lyrics[5].chars,edge=parasol.skyline(model);shown.add(5);
  items.forEach((item,i)=>{
    const t=.068+.886*i/(items.length-1)+.019*(1-ease((time-item.at+.13)/.23));
    const [px,py]=edge(t),a=edge(t-.030),b=edge(t+.030);
    const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
    const x=mix(640+(i-(items.length-1)*.5)*39,px+Math.sin(angle)*12,travel);
    const y=mix(629,py-Math.cos(angle)*12,travel);
    place(x,y,()=>{
      if(travel<1)rect(-21,-34,42,43,rgba(PAPER,.91*(1-travel**7)));
      glyph(item,0,0,mix(27,39,travel),INK,{hot:DEEP})
    },clamp(angle,-.95,.95)*travel)
  })
}
function rainStrokes(x,y,w,h,t,color,count=65,slant=0){
  g.save();g.beginPath();
  for(let n=0;n<count;n++){
    const xx=x+rnd(n+12)*w,yy=y+mod(rnd(n+445)*(h+68)+t*(71+88*rnd(n+61)),h+68)-34;
    g.moveTo(xx,yy);g.lineTo(xx+slant,yy+7+17*rnd(n+19))
  }paint(null,color,1.55);g.restore()
}
scenes[14]=()=>{
  rect(0,0,W,H,PAPER);
  const off=(local<BAR?local:BAR-(local-BAR))*85;
  for(const [i,y,h] of [[0,153,8],[1,180,26],[2,456,11],[3,482,68],[4,586,3]]){
    rect(0,y,W,h,i%2?"#c0dce5":"#94c9df");
    const slide=mod((i%2?1:-1)*off+i*63,249);
    for(let x=slide-249;x<W;x+=249)
      path([[x,y],[x+49,y],[x+49-h*.45,y+h],[x-h*.45,y+h]],rgba(WHITE,.36));
  }
  pattern("diag",rgba(DEEP,.18),10,1,0,550,W,44,off);
  const eighth=beat*2,rainY=(Math.floor(eighth)+ease(frac(eighth)))*33;
  for(let col=0;col<24;col++){
    const xx=34+col*54;
    for(let row=0;row<8;row++){
      const yy=55+mod(row*84+rainY+33*(col%3),609);
      if((col+row)%4)line(xx,yy,xx,yy+6+11*rnd(col+29*row),rgba(DEEP,.40),1.35)
    }
  }
  const model=studyUmbrella(local);
  parasol.draw(model);
  canopyInscription(1,model);
  figureLabel(5,"CANOPY STUDY",76,127);num("180°",1113,523,29,INK);label("SECTOR  /  01",1098,548,8);
};
function skyWindow(x,y,r,clock){
  clipCircle(x,y,r,()=>{
    const width=2*r/7;
    for(let j=0;j<7;j++)clipBox(x-r+j*width,y-r,width+.5,r*2,()=>{
      const shift=(j-3)*3.2*Math.sin(clock*.75);
      rect(x-r,y-r,r*2,r*2,gradient(x,y-r,x,y+r,[[0,"#5daed9"],[.66,"#b5dfec"],[1,"#eef5ed"]]));
      circ(x+37+shift,y-39,31,"#f9ecc8");
      for(const [xx,yy,s] of [[-86,-8,1],[49,45,.74]])place(x+xx+shift,y+yy,()=>{
        roundBox(-40,0,97,17,9,PAPER);circ(-15,0,20,PAPER);circ(8,0,13,PAPER)
      },0,s)
      if(j%2===0)rect(x-r+j*width,y-r,width,r*2,rgba(WHITE,.10));
      line(x-r+j*width,y-r,x-r+j*width,y+r,rgba(WHITE,.28),1)
    })
  })
}
scenes[15]=()=>{
  rect(0,0,W,H,"#e3eff0");pattern("cross",rgba(DEEP,.43),32,1);
  const x=666,y=359,cols=["#d5e9ed","#a2cee0","#f0f4eb","#83c1dc"];
  circ(x,y,321,PAPER,DEEP,1.1);
  for(let i=3;i>=0;i--){
    const r=(141+i*45)*ease((local-i*BEAT+.11)/.44);
    if(r<2)continue;circ(x,y,r,cols[i],DEEP,.9);
    const a=(i%2?1:-1)*(time*.08);
    dial(x,y,r-5,DEEP,60+i*12,a);
    for(let j=0;j<4;j++)arc(x,y,r-11,a+j*PI/2,a+j*PI/2+.38,DEEP,i%2?1.8:3.4);
  }
  for(let j=0;j<12;j++){const a=j*TAU/12+.13;line(x+Math.cos(a)*148,y+Math.sin(a)*148,x+Math.cos(a)*268,y+Math.sin(a)*268,rgba(INK,.34),.9)}
  const lens=116+5*Math.sin(local*.9);circ(x,y,lens+7,WHITE,DEEP,1);skyWindow(x,y,lens,time);circ(x,y,lens,null,INK,1);
  const items=lyrics[6].chars,rot=-PI*.5+.105*local,step=TAU/items.length;
  shown.add(6);items.forEach((item,i)=>{
    const a=rot+i*step,xx=x+Math.cos(a)*288,yy=y+Math.sin(a)*288;
    glyph(item,xx,yy+12,34,INK,{hot:DEEP});
    const next=items[i+1]?.at??lyrics[6].end,active=time>=item.at&&time<next;
    const r=active?270:262;
    line(x+Math.cos(a)*254,y+Math.sin(a)*254,x+Math.cos(a)*r,y+Math.sin(a)*r,active?INK:DEEP,active?2.5:.85);
    if(active)circ(x+Math.cos(a)*252,y+Math.sin(a)*252,4.2,INK);
  });
  figureLabel(6,"SKY APERTURE",69,303);line(70,359,327,359,INK);target(321,359,4);
  label("LENTICULAR",1040,391,10);num("07 / 07",1040,421,18);
};
function cropDetail(id,x,y,w,h,box,look="original"){
  const im=sprites[id][look],sx=box[0]*im.width,sy=box[1]*im.height,sw=box[2]*im.width,sh=box[3]*im.height;
  const scale=Math.max(w/sw,h/sh),dw=sw*scale,dh=sh*scale;
  clipBox(x,y,w,h,()=>g.drawImage(im,sx,sy,sw,sh,x+(w-dw)/2,y+(h-dh)/2,dw,dh))
}
scenes[16]=()=>{
  rect(0,0,W,H,PAPER);
  const scale=Math.max(.004,1-smooth(span(local,2.07,2.32)));
  place(640,360,()=>{
    g.translate(-640,-360);
    pattern("check",INK,23,1,0,272,W,121,-time*18);
    for(let i=0;i<5;i++)line(0,490+i*19,W,490+i*19,rgba(INK,.62),1.2);
    const staffOffset=mod(time*69,205);
    for(let x=staffOffset;x<W;x+=205)line(x,490,x,566,rgba(INK,.21),1);
    const notes=lyrics[7].chars,eighth=(beat-100)*2;shown.add(7);
    for(let n=0;n<notes.length;n++){
      const nx=196+n*99,ny=508+n%4*9,age=eighth-n-1,fall=clamp(age+1),land=ease(age/.44);
      if(age>=-1){
        const yy=ny-96*(1-fall*fall),stem=32*land;
        ellipse(nx,yy,mix(3.8,6.4,land),mix(3.8,4.8,land),age<0?DEEP:INK,null,0,-.30*land);
        if(stem>0)line(nx+5,ny,nx+5,ny-stem,INK,1.3);
        if(age>=0&&age<.66)ellipse(nx,ny,7+age*15,4+age*8,null,rgba(DEEP,1-age/.66),1.3)
      }
      const item=notes[n];glyph(item,nx,ny+56-13*(1-ease((time-item.at+.08)/.20)),33,INK,{hot:DEEP})
    }
    const selected=mod(Math.floor((beat-1)/2),2);
    [0,1].forEach(i=>{
      const id=i?"anon":"rana",m=band[id],x=i?932:91,y=selected===i?215:229;
      rect(x+4,y+5,253,188,INK);rect(x,y,253,188,PAPER,m.ink,3);
      rect(x+6,y+6,241,140,blend(m.color,PAPER,.2));
      cropDetail(id,x+6,y+6,241,140,i?[.56,.18,.44,.20]:[.08,.28,.62,.19],selected===i?"original":"print");
      label(m.name+"   /   GUITAR",x+14,y+172,10);num("0"+(i+1),x+233,y+172,12,INK,"right");
    });
    const x=380,y=158,w=520,h=281;
    roundBox(x+5,y+6,w,h,13,INK);roundBox(x,y,w,h,13,WHITE,INK,1.3);
    smallCapsule("SIDE A",x+24,y+21,76);label("NOW PLAYING",x+w-22,y+38,10,INK,"right");
    circ(x+85,y+130,44,INK);for(let i=0;i<4;i++)circ(x+85,y+130,23+i*5,null,rgba(WHITE,.43),.7);
    circ(x+85,y+130,12,BLUE);circ(x+85,y+130,3,PAPER);
    txt("壱雫空",x+159,y+132,47,INK,{font:DISPLAY});txt("MyGO!!!!!",x+160,y+171,27,DEEP,{font:LATIN,style:"italic"});
    wave(x+292,y+162,190,22,time-.2,1.3,DEEP,1.15,81);
    line(x+30,y+210,x+w-30,y+210,"#cbd6d6",2);const fill=(w-60)*time/81.4;
    line(x+30,y+210,x+30+fill,y+210,INK,3);circ(x+30+fill,y+210,5,INK);
    path([[x+31,y+235],[x+31,y+248],[x+42,y+241]],INK);num(timecode(time),x+58,y+246,13);num("01:21.40",x+w-28,y+246,13,DEEP,"right");
    for(let i=0;i<32;i++)rect(349+i*18,628,13,8,mod(Math.floor(beat*2),32)>=i?BLUE:"#d5dfdd");
  },0,scale);
  if(scale<.2)circ(640,360,3.5,INK);
  if(time>31.59)opacity(ease((time-31.59)/.21),()=>lyric(7,640,417,22,{first:7,align:"center",spacing:31,c:DEEP,hot:INK}))
};
function stickImpact(t){
  const stick=sprites.taki.stick;if(!stick||t<32.054||t>32.54)return;
  const entry=ease((t-32.054)/.176),down=span(t,32.23,32.387)**2.15;
  const rebound=ease((t-32.387)/.153);
  const x=mix(mix(1270,927,entry),640,down)+rebound*208;
  const y=mix(mix(128,149,entry),363,down)-rebound*150;
  const scale=1.63+.37*down;
  opacity(1-rebound,()=>place(x,y,()=>{
    g.drawImage(stick.image,-stick.tipX,-stick.tipY)
  },-1.18-.74*down+.50*rebound,scale))
}
scenes[17]=()=>{
  const hit=time-32.387;
  if(hit<0){
    rect(0,0,W,H,PAPER);circ(640,360,5,DEEP);
    shown.add(7);
    opacity(1-smooth(span(time,32.17,32.31)),()=>lyric(7,640,417,22,{first:7,align:"center",spacing:31,c:DEEP,hot:INK}));
    stickImpact(time);
  }else{
    const ending=time>32.922;rect(0,0,W,H,ending?"#cfdde5":"#292b44");
    ["rana","anon","soyo","taki"].forEach((id,i)=>{
      const r=(100+i*48)*ease((hit+.04-i*.032)/.48);
      circ(640,363,r,null,band[id].color,i%2?3:7);
      for(let j=0;j<2;j++){const a=i*1.55+j*.34+hit*.18;
        line(640+r*Math.cos(a),363+r*Math.sin(a),640+(r+76)*Math.cos(a),363+(r+76)*Math.sin(a),band[id].color,.9);
        circ(640+(r+76)*Math.cos(a),363+(r+76)*Math.sin(a),4,band[id].color)
      }
    });
    circ(640,363,13,WHITE);stickImpact(time);
    const opening=ease(hit/.40),start=-PI/2+hit*.17;
    arcLyric(8,640,363,Math.max(2,267*opening),start,start+TAU*(1-1/lyrics[8].chars.length),
      Math.max(1,27*opening),ending?INK:WHITE,{font:JP,upright:true});
    figureLabel(7,"IMPACT SIGNAL",71,543,ending?INK:WHITE)
  }
};
scenes[18]=()=>{
  rect(0,0,W,H,PAPER);rect(0,0,623,H,gradient(0,0,623,0,[[0,"#7bbbdc"],[1,"#d4e7e9"]]));
  pattern("dot",rgba(WHITE,.60),10,2.2,0,0,623,H);
  const q=ease((local-BAR)/.68);
  [3,2,1,0].forEach(i=>{if(i===0||local>BAR+(i-1)*BEAT)opacity(i?.36-i*.066:1,()=>person("tomori",899+i*57*q,92+i*5,521,i?"light":"sil"))});
  line(623,0,623,H,INK,1.3);for(let i=0;i<33;i++)line(624,64+i*19,624+(i%5?4:13),64+i*19,INK,1);
  for(let j=0;j<6;j++)num("V. "+pad(j+1),1168,183+j*53,10,DEEP);
  lyrics[9].chars.forEach((ch,j)=>{
    const x=j<5?421:268,y=(j<5?153+j*91:228+(j-5)*94)-33,p=ease((time-ch.at-.07)/.41);
    if(p>0){
      glow(x-6,y+4,47+39*p,DEEP,.41*p);
      txt(ch.ch,x-3-5*p,y+34,86,rgba(DEEP,.18*p),{font:MINCHO,align:"center"})
    }
  });
  lyric(9,421,153,84,{last:5,vertical:true,spacing:91,c:INK,hot:DEEP});
  lyric(9,268,228,83,{first:5,vertical:true,spacing:94,c:INK,hot:DEEP});
  smallCapsule("VOICE   05",66,92,98);figureLabel(8,"BLUE IMPRESSION",74,585);
  if(time<34.45)lyricStrip(8,738,578,332,{size:23,c:band.taki.ink,accent:band.taki.color})
};
scenes[19]=()=>{
  rect(0,0,W,H,NIGHT);
  const hit=Math.exp(-Math.max(0,time-35.39)*24)*(time>=35.39?1:0);
  pattern("dot",rgba(WHITE,.16*ease((local+.12)/.52)+.49*hit),18,1.0);
  marquee(66,20,0,"#293b50",BLUE,"FIELD RECORDING    /    BREAK",0);
  marquee(629,20,0,"#293b50",BLUE,"FIELD RECORDING    /    BREAK",0);
  const r=188+local*3;circ(640,356,r,null,WHITE,1.5);circ(640,356,r+8,null,rgba(BLUE,.38),1);
  line(57,356,1223,356,BLUE,.85);target(640,356,5,BLUE);
  txt("Break",640,332,73,WHITE,{font:LATIN,align:"center",style:"italic"});
  label("BAR    31",640,394,12,BLUE,"center",3);label("LOW FREQUENCY   /   REST",85,382,9,BLUE);
  const open=span(local,.87,1.18)**2;
  if(open>0){
    const half=641*open;clipBox(640-half,0,2*half,H,()=>crossingField(0));
    line(640-half,0,640-half,H,BLUE,1.8);line(640+half,0,640+half,H,BLUE,1.8)
  }
  heldBreakLyric(open)
};
function heldBreakLyric(travel){
  const y=mix(559,628,travel);rect(454,y-31,372,45,rgba(NIGHT,travel*.94));
  lyric(9,640,y,26,{align:"center",spacing:35,c:WHITE,hot:BLUE})
}
function cloudOutline(x,y,w,h,c){
  g.beginPath();g.moveTo(x,y);g.lineTo(x+w*.75,y);g.bezierCurveTo(x+w*1.07,y,x+w*1.04,y-h*.65,x+w*.77,y-h*.62);
  g.bezierCurveTo(x+w*.75,y-h*1.12,x+w*.39,y-h*1.03,x+w*.35,y-h*.60);
  g.bezierCurveTo(x+w*.16,y-h*.75,x+w*.12,y-h*.38,x+w*.14,y-h*.34);
  g.bezierCurveTo(x-w*.07,y-h*.39,x-w*.06,y,x,y);g.closePath();paint(null,c,1.5)
}
function crossingVerse(plan,lift=0){
  const data=lyrics[10],breakAt=data.text.indexOf(" ")+1;
  const entries=lyricScore[10][2].filter(([word])=>word.trim()).map(([,offset])=>data.start+offset);
  const across=ease(lift/.68),alignY=smooth((lift-.42)/.58);
  shown.add(10);
  data.chars.forEach((item,j)=>{
    if(item.ch===" ")return;
    let push=0;
    for(const entry of entries)if(entry>item.wordAt)push+=10*ease((time-entry+.08)/.18);
    const first=j<breakAt,arrival=28*(1-ease((time-item.wordAt+.12)/.20));
    const x=104+(first?j:j-breakAt)*(first?65:62)+arrival-push;
    const y=(first?234:321)-plan*(first?117:132);
    const labelX=85+j*42+arrival-push;
    const size=first?62:57;
    place(mix(x,labelX,across),mix(y,138,alignY),()=>{
      glyph(item,0,0,size,WHITE,{font:DISPLAY,hot:BLUE,wordSlide:true})
    },0,mix(1,38/size,across))
  })
}
function streetUmbrellaPose(i,progress){
  const age=progress-i*BEAT, arrive=ease((age+.17)/.17), dest=142+i*246;
  const landing=age>0&&age<.21?Math.sin(PI*age/.21)*Math.exp(-10*age):0;
  const rise=smooth((progress-BAR+.055)/.48), plan=smooth((progress-2*BAR+.06)/.38);
  const clock=CUTS[19]+progress, shake=Math.exp(-9*Math.max(0,age))*smooth((age+.17)/.07);
  return {x:mix(W+112,dest,arrive)-landing*13+Math.sin(clock*.8+i)*7,
    y:mix(444+Math.sin(i*1.1)*26-rise*29,410+(i%2?37:-25)+(dest-640)*.095,plan),
    r:mix(98,85,plan),yaw:i*.73+progress*.37,elevation:mix(.25+rise*.14,PI/2,plan),
    roll:-.18+(i-2)*.076+plan*.30+.075*shake*Math.sin(age*31),tremble:shake,landingAge:age};
}
function crossingField(progress){
  rect(0,0,W,H,NIGHT);
  const rise=smooth((progress-BAR+.055)/.48),plan=smooth((progress-2*BAR+.06)/.38);
  opacity(1-.78*plan,()=>txt("RAIN     RAIN",44-mod(time*24,280),157-rise*32,229,null,
    {font:COND,stroke:"#507088",sw:1.25,track:10}));
  const horizon=mix(507,374,rise),phase=mod(time*45,121);
  for(let i=-5;i<=16;i++){
    const x=i*121+phase,bottom=640+(x-640)*1.55-28;
    const far=[[x,horizon],[x+32,horizon],[bottom+67,H+12],[bottom,H+12]];
    const head=259+(x-640)*.096;
    const flat=[[x+75,head],[x+128,head+5.1],[x-24,head+354],[x-77,head+349]];
    path(far.map((p,j)=>[mix(p[0],flat[j][0],plan),mix(p[1],flat[j][1],plan)]),PAPER)
  }
  opacity(1-plan,()=>{cloudOutline(847,135-rise*38,175,53,WHITE);cloudOutline(1063,221-rise*38,113,41,WHITE)});
  if(plan>.01)opacity(plan,()=>{
    line(-40,186,1320,316,BLUE,1.25);line(-40,545,1320,676,BLUE,1.25);
    for(let i=0;i<19;i++){const x=-32+i*76+phase*.24,y=192+(x+40)*.096;line(x,y,x-5,y+12,BLUE,1)}
  });
  rainStrokes(0,35,W,580,time,rgba(BLUE,.48),50+Math.floor(progress/BAR)*35,-14);
  for(let i=0;i<5;i++){
    if(progress-i*BEAT<=-.17)continue;
    const pose=streetUmbrellaPose(i,progress);
    parasol.draw(parasol.make({...pose,night:true,water:"rain",seconds:progress,seed:6+i,
      tint:band[people[i]].color,releasePose:elapsed=>streetUmbrellaPose(i,progress-elapsed)
    }));
  }
  crossingVerse(plan);
  label("CROSSING   /   RAIN FIELD",78,651,9,BLUE)
}
scenes[20]=()=>{
  crossingField(local);
  if(time<36.98)opacity(1-smooth(span(time,36.85,36.98)),()=>heldBreakLyric(1))
};
// A two-dimensional perspective drawing of the road surface. All ink on
// the pavement uses the same mapping, including the moving type baseline.
function roadScroll(age){return 153*ease(age/BAR)+51*smooth((age-BAR)/BAR)}
function roadPoint(x,y,scroll){
  const scale=1/(1-(y-360)/1740),u=(x-640-scroll)*scale,v=(y-360)*.84*scale;
  return [640+u+v*.13,360+v-u*.099]
}
function roadShape(points,scroll,fill,edge=null,width=1){
  path(points.map(([x,y])=>roadPoint(x,y,scroll)),fill,edge,width)
}
function roadStripe(x,y,w,h,scroll,color){
  roadShape([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],scroll,color)
}
function roadGlyphs(scroll,lift){
  const data=lyrics[11],items=data.chars,n=items.length;
  const lineColor=blend(WHITE,BLUE,lift);
  shown.add(11);
  items.forEach((item,j)=>{
    if(item.ch===" ")return;
    const x=763+(j-(n-1)/2)*41,y=534;
    const p=roadPoint(x,y,scroll),px=roadPoint(x+1,y,scroll),py=roadPoint(x,y+1,scroll);
    const target=640+(j-(n-1)/2)*32,size=mix(39,23,lift);
    g.save();
    g.transform(mix(px[0]-p[0],1,lift),mix(px[1]-p[1],0,lift),
      mix((py[0]-p[0])*.69,0,lift),mix((py[1]-p[1])*.69,1,lift),mix(p[0],target,lift),mix(p[1],567,lift));
    if(lift<1&&j%3===1){
      const notch=1.05*(1-lift);
      g.beginPath();g.rect(-size,-size*1.2,2*size,1.55*size);
      g.rect(size*.11,-size,notch,size*1.12);g.clip("evenodd")
    }
    const voice=band[posterOrder[Math.floor(4*j/n)]];
    glyph(item,0,0,size,lineColor,{font:JP,weight:600,hot:blend(voice.color,band.anon.color,lift)});
    g.restore()
  })
}
scenes[21]=()=>{
  rect(0,0,W,H,"#1a2c41");pattern("dot","#34495e",15,1);
  const scroll=roadScroll(local);
  roadStripe(-280,194,2000,4,scroll,PAPER);roadStripe(-280,205,2000,1.6,scroll,BLUE);
  // Staggered stop bars and the turning arrow are painted on the same sheet
  // as the chorus. Their spacing contracts with the receding lane.
  for(let j=-2;j<8;j++)roadStripe(j*240,-153,128,11,scroll,"#718a9b");
  roadShape([[996,160],[1068,160],[1068,95],[1135,95],[1106,68],[1120,55],
    [1180,105],[1117,155],[1105,142],[1137,114],[1090,114],[1090,181],[996,181]],scroll,PAPER);
  for(let n=0;n<4;n++)roadStripe(960-n*27,160,16,21,scroll,rgba(PAPER,.85-n*.13));
  roadStripe(-280,443,2000,5,scroll,PAPER);roadStripe(-280,584,2000,2,scroll,BLUE);
  for(let i=-2;i<10;i++){
    const x=72+i*221,y=309;
    roadStripe(x-104,y-5,64,10,scroll,PAPER);
    roadShape([[x-26,y-6],[x+20,y-6],[x+20,y-21],[x+52,y],[x+20,y+21],[x+20,y+6],[x-26,y+6]],scroll,PAPER);
    const p=roadPoint(x,561,scroll);
    place(...p,()=>num(pad(mod(i,8)+1),0,0,10,BLUE,"center"),-.099,1,.83)
  }
  const first=.045+35*BAR;
  for(let i=0;i<4;i++){
    const expand=ease((time-first-i*BEAT)/.49);if(expand<=0)continue;
    const x=[374,555,747,935][i],y=[325,288,327,291][i],r=(130+i*11)*expand,c=band[posterOrder[i]].color;
    const rim=Array.from({length:56},(_,j)=>[x+Math.cos(j*TAU/56)*r,y+Math.sin(j*TAU/56)*r*.78]);
    roadShape(rim,scroll,rgba(c,.89));
    roadShape(rim.map(([u,v])=>[x+(u-x)*1.065,y+(v-y)*1.065]),scroll,null,c,1)
  }
  label("ROAD MARKINGS",1190,78,10,BLUE,"right");num("35 — 36",1190,109,23,WHITE,"right");
  if(time<41.90)opacity(1-smooth(span(time,41.76,41.90)),()=>crossingVerse(1,smooth(local/.59)));
  roadGlyphs(scroll,0)
};
scenes[22]=(options={})=>{
  rect(0,0,W,H,NIGHT);pattern("cross","#2a4053",41,1);
  const cx=641,cy=340;
  const pulse=(time-(.045+36*BAR))/BEAT,latest=Math.floor(pulse);
  for(let birth=Math.max(0,latest-8);birth<=latest;birth++){
    const age=clamp((pulse-birth)/9);
    const r=86+423*(1-(1-age)**1.48);
    circ(cx,cy,r,null,rgba(BLUE,.78*(1-age)**1.16),birth%4===0?1.5:.95)
  }
  for(let i=0;i<3;i++){
    const r=173+i*56,a=[-2.52,-.62,2.36][i];
    arc(cx,cy,r,a-.097,a+.097,rgba(BLUE,.48),.9);
    const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;
    line(x,y,x+Math.cos(a)*10,y+Math.sin(a)*10,BLUE,.9);
    num(["37.1","37.3","38.1"][i],x+Math.cos(a)*28,y+Math.sin(a)*23,9,BLUE,"center")
  }
  clipCircle(cx,cy,83,()=>{rect(cx-83,cy-83,166,166,"#aecabc");portrait("rana",cx-83,cy-83,166,166,"dark",.72)});
  circ(cx,cy,86,null,PAPER,1);dial(cx,cy,113,BLUE,66,.12+local*.03);
  ringType("BREATH    /    BAR 37–38    /    BREATH    /    ",cx,cy,132,10,PAPER,-2.35+local*.075);
  cross(cx-254,cy,8,BLUE);cross(cx+254,cy,8,BLUE);
  figureLabel(9,"QUIET REGISTER",68,254,WHITE);num("− 37",1103,420,16,BLUE);
  if(options.cleanInhale)shown.add(11);
  else roadGlyphs(roadScroll(CUTS[21]-CUTS[20]),smooth(local/.61));
};

