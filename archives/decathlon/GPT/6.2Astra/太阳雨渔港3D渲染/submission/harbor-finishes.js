'use strict';
function instrumentCases(){
  for(let i=0;i<2;i++){
    const g=group(world,-3.62-i*.56,Y+.038,2.48+i*.11);
    g.rotation.y=-.085-i*.075;
    const shape=new T.Shape(),sections=i?[[-.53,.13],[-.42,.177],[-.15,.177],[.27,.17],[.48,.14],[.54,.087]]:[[-.60,.085],[-.54,.193],[-.37,.228],[-.18,.192],[-.08,.144],[.05,.161],[.21,.117],[.42,.08],[.57,.075],[.62,.029]];
    const outline=[...sections.map(([l,w])=>[w,l]),...sections.slice().reverse().map(([l,w])=>[-w,l])];
    shape.moveTo(...outline[0]);for(const pt of outline.slice(1))shape.lineTo(...pt);shape.closePath();
    for(let [h,y,c] of [[.15,0,'#899696'],[.024,.158,'#536969'],[.063,.186,'#bec8c2']]){
      const shell=mesh(g,new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSegments:3,bevelSize:.018,bevelThickness:.015,curveSegments:8}),c);
      shell.rotation.x=-PI/2;shell.position.y=y;
    }
    for(let end of [-1,1]){box(g,.177,.17,end*.28,.029,.072,.079,'#a89b75',true);oval(g,.195,.172,end*.28,.013,.009,.014,iron)}
    cord(g,[[.168,.175,-.10],[.243,.185,-.10],[.248,.185,.086],[.16,.175,.09]],.017,'#526966');
    let tag=printed(g,.014,.268,-.32,.154,.089,'school-tag',(c,w,h)=>{c.fillStyle='#e5d8b3';c.fillRect(0,0,w,h);c.fillStyle='#546c69';c.textAlign='center';c.font='bold '+h*.45+'px serif';c.fillText('吹 奏 楽 部',w/2,h*.6);c.fillRect(w*.12,h*.73,w*.76,3)});tag.rotation.x=-PI/2;
  }
}
function tiledStationRoof(){
  const w=4.63,d=3.2,rise=.62;
  roof(wait,0,2.33,0,w,d,rise,'#687e85',false);
  const palette=['#73858b','#71848a','#7c8b8c','#697f88','#80908e'];
  for(const side of [-1,1]){
    const panel=group(wait,0,2.33+rise*.5,side*d*.25);panel.rotation.x=side*Math.atan2(rise,d*.5);
    const length=Math.hypot(d*.5,rise);
    for(let col=0;col<28;col++){
      const x=(col-13.5)*w/28;
      for(let row=0;row<5;row++){
        const z=(row-2)*length/5;
        let tile=box(panel,x,.067,z,w/28-.008,.053,length/5-.006,pick(palette));tile.rotation.x=-side*.035;
        let roll=cyl(panel,x-w/56,.10,z,.032,.039,length/5+.012,'#6b8084',9);roll.rotation.x=PI/2;
      }
    }
  }
  for(let i=0;i<27;i++){let crown=cyl(wait,(i-13)*.174,3.034,0,.072,.078,.177,'#667b80',10);crown.rotation.z=PI/2}
}
function dial(p,x,y,z,r){
  const circle=tex(256,256,(c,w,h)=>{
    c.fillStyle='#cccebf';c.fillRect(0,0,w,h);c.fillStyle='#eae7d0';c.beginPath();c.arc(128,128,120,0,TAU);c.fill();
    c.translate(128,128);
    for(let i=0;i<=44;i++){let a=(i/44*1.42+.8)*PI;c.strokeStyle='#4f6865';c.lineWidth=i%4?2:4;c.beginPath();c.moveTo(Math.cos(a)*104,Math.sin(a)*104);c.lineTo(Math.cos(a)*(i%4?95:84),Math.sin(a)*(i%4?95:84));c.stroke()}
    c.fillStyle='#4f6560';c.textAlign='center';c.font='bold 19px Georgia';c.fillText('SHIOMI',0,42);c.font='13px sans-serif';c.fillText('60 kg',0,65);
    c.rotate(-.68);c.fillStyle='#b3604a';c.fillRect(-3,-79,6,87);c.beginPath();c.arc(0,0,8,0,TAU);c.fill()
  });let m=new T.MeshStandardMaterial({map:circle});mesh(p,new T.CircleGeometry(r,40),m,x,y,z);
}
function watercolorPoster(c,w,h){
  c.fillStyle='#eadfbd';c.fillRect(0,0,w,h);
  let x=.07*w,y=.07*h,a=.86*w,b=.69*h;c.save();c.beginPath();c.rect(x,y,a,b);c.clip();
  c.fillStyle='#b4d3c9';c.fillRect(x,y,a,b);c.fillStyle='#e4bd77';c.beginPath();c.arc(w*.7,h*.21,w*.096,0,TAU);c.fill();
  for(let j=0;j<3;j++){c.fillStyle=['#9db5a2','#829989','#68958a'][j];c.beginPath();c.moveTo(x,y+b);for(let i=0;i<=35;i++)c.lineTo(x+a*i/35,h*(.52-j*.007)+Math.sin(i*.21+j*2)*h*.093+Math.sin(i*.49+j)*h*.033);c.lineTo(w,y+b);c.fill()}
  c.fillStyle='#6aa4a3';c.fillRect(x,h*.55,a,h*.25);for(let i=0;i<34;i++){c.fillStyle=i%2?'#91b7a9':'#c0d2bc';c.fillRect(rnd(x,x+a),rnd(h*.56,h*.75),rnd(8,45),2)}
  c.fillStyle='#ede6cc';c.fillRect(w*.62,h*.36,w*.045,h*.19);c.fillStyle='#b86c52';c.fillRect(w*.62,h*.406,w*.045,h*.053);c.fillRect(w*.612,h*.35,w*.063,h*.017);c.restore();
  c.fillStyle='#385f62';c.textAlign='center';c.font='bold '+h*.083+'px serif';c.fillText('凪島航路',w*.5,h*.875);c.font='600 '+h*.028+'px sans-serif';c.fillText('N A G I S H I M A    L I N E',w*.5,h*.95);
}
function finishBuildings(){
  const poster=printed(wait,-.24,1.48,-1.205,.68,.88,'ferry-poster',watercolorPoster);poster.rotation.z=-.035;
  for(let i=0;i<7;i++)box(wait,0,.21+i*.119,-1.204,4.03,.10,.024,i%3?'#c1ad83':'#c6b48c');
  for(let s of [-1,1]){
    for(let j=0;j<3;j++)box(wait,s*2.115,.28+j*.25,0,.027,.021,2.5,'#b0b29c');
    box(wait,s*2.10,1.07,0,.07,.062,2.61,'#63847d')
  }
  // Weathered red enamel scale with an indexed face.
  dial(wh,-.53,.71,.693,.147);
  for(let j=0;j<9;j++)box(wh,.75,.385+j*.041,-.377,.28,.015,.016,'#849b93');
  box(wh,.52,.65,-.377,.14,.065,.018,'#5e766f',true);
  for(let s of [-1,1]){box(wh,.33+s*.32,.868,-.75,.48,.018,.67,'#d9dfd0',true);box(wh,.33+s*.32,.881,-.47,.17,.017,.029,iron)}
  for(let i=0;i<2;i++){let x=.65+i*.26;tor(wh,x,1.40,-1.2,.096,.015,'#907e55',true);cord(wh,[[x,1.41,-1.2],[x,1.52,-1.24],[x,1.55,-1.32]],.010,iron)}
  let kettle=group(wait,1.61,.15,-.76);
  box(kettle,0,.055,0,.37,.10,.31,'#798d83',true);cyl(kettle,0,.44,0,.11,.145,.24,'#d4c9a9');cyl(kettle,0,.578,0,.105,.12,.045,'#819184');oval(kettle,0,.61,0,.039,.025,.039,'#56685e');
  cord(kettle,[[.10,.48,0],[.20,.49,0],[.22,.36,0],[.13,.30,0]],.021,'#798377');
  rod(kettle,[-.10,.39,0],[-.22,.48,0],.037,'#b5b8a1');
  for(let i=0;i<2;i++){let q=cyl(wait,1.168-i*.092,.775,-.692,.033,.033,.027,'#c8b891');q.rotation.x=PI/2}
  printed(wait,1.13,.866,-.690,.19,.058,'radio-dial',(c,w,h)=>{c.fillStyle='#bed4b9';c.fillRect(0,0,w,h);for(let j=0;j<33;j++){c.fillStyle='#6c7d6b';c.fillRect(j*w/33,0,3,h*(j%4?.25:.46))}c.fillStyle='#c47550';c.fillRect(w*.44,0,5,h);c.fillStyle='#547267';c.font='bold '+h*.34+'px monospace';c.fillText('FM  81.3',w*.09,h*.92)});
  rod(wait,[.81,.945,-.80],[.81,1.019,-.80],.013,iron);rod(wait,[.81,1.019,-.80],[1.18,1.019,-.80],.014,iron);rod(wait,[1.18,1.019,-.80],[1.18,.94,-.80],.013,iron);
  // Transparent reservoir and water drops catch the light at the eaves.
  for(let i=0;i<17;i++)oval(umb,Math.cos(i*2.4)*(.19+i%3*.10),.32-i%3*.07,Math.sin(i*2.4)*(.19+i%3*.10),.013,.016,.013,'#deebdd');
  for(let [x,z] of [[-5.28,-1.71],[-5.62,-.78]]){let p=oval(world,x,Y+.106,z,.48,.007,.16,mat('#88a9a4',.65));puddles.push(p)}
}
function marketPennant(){
  const pole=group(world,-4.31,Y,.88);
  box(pole,0,.06,0,.28,.12,.32,cement,true);rod(pole,[0,.10,0],[0,2.66,0],.024,'#a79c7d');
  rod(pole,[-.05,2.59,0],[.63,2.59,0],.020,'#aa9b77');
  const cloth=group(pole,.06,2.54,0);const texFlag=tex(218,528,(c,w,h)=>{
    c.fillStyle='#ad5c47';c.fillRect(0,0,w,h);c.fillStyle='#f1dfb5';c.fillRect(12,10,2,h-20);c.fillRect(w-14,10,2,h-20);
    fishIcon(c,w*.53,h*.16,w*.30,'#f2dfba');c.textAlign='center';c.font='bold 125px serif';c.fillText('鮮',w/2,h*.48);c.fillText('魚',w/2,h*.77);c.font='bold 22px sans-serif';c.fillText('汐 見 漁 協',w/2,h*.92);
  });
  let geo=new T.PlaneGeometry(.52,1.45,12,16);
  let fabric=mesh(cloth,geo,new T.MeshStandardMaterial({map:texFlag,side:T.DoubleSide,roughness:1}),.26,-.725,0);
  for(let j=0;j<3;j++)cord(pole,[[.06+j*.24,2.48,0],[.06+j*.24,2.59,.015],[.08+j*.24,2.48,.005]],.01,cream);
  return fabric;
}
function finishBoats(){
  for(let i=0;i<boats.length;i++){
    let g=boats[i].g;
    for(let side of [-1,1]){
      rod(g,[side*.49,.52,-1.66],[side*.49,.70,-1.66],.014,iron);rod(g,[side*.49,.70,-1.67],[side*.49,.70,-1.21],.015,'#acb9b0');
      cord(g,[[side*.45,1.51,.54],[side*.44,1.59,.55],[side*.32,1.59,.55]],.012,'#91a9a1');
      const streak=decal(g,side*.692,.334,-.62,.39,.116,(c,w,h)=>{for(let j=0;j<55;j++){c.fillStyle=pick(['#ab80604d','#ba927440','#908e762b']);c.fillRect(rnd(w*.10,w*.91),0,rnd(1,8),rnd(h*.10,h*.68))}},side*PI/2);
      {const wiper=group(g,side*.224,1.02,.60);rod(wiper,[0,0,0],[side*.13,.28,-.02],.009,'#506a6c');rod(wiper,[side*.07,.17,0],[side*.19,.35,-.027],.012,'#445b5d');}
    }
    // A helm spindle and two engine levers stand proud of the console.
    rod(g,[.29,1.034,.195],[.29,.98,.291],.021,iron);
    for(let j=0;j<2;j++){let x=.40-j*.05;rod(g,[x,.983,.334],[x,1.085,.277],.010,iron);oval(g,x,1.086,.275,.017,.014,.019,j?'#b06952':'#485b59')}
    cyl(g,-.42,.845,-.30,.106,.083,.12,'#97a89a');
    const lucky=group(g,.404,1.20,.514);lucky.rotation.y=PI;
    printed(lucky,0,0,0,.106,.15,'charm',(c,w,h)=>{c.fillStyle='#a8604c';c.fillRect(0,0,w,h);c.strokeStyle='#e3c991';c.lineWidth=8;c.strokeRect(15,16,w-30,h-32);c.fillStyle='#f4db9f';c.font='bold '+h*.26+'px serif';c.textAlign='center';c.fillText('海上',w*.5,h*.44);c.fillText('安全',w*.5,h*.77)});
    cord(lucky,[[-.034,.076,0],[0,.13,0],[.035,.076,0]],.005,'#b49467');
    if(i===0){
      // Short fishing outriggers, float leaders and a stern net reel.
      for(let side of [-1,1]){rod(g,[side*.42,.55,-1.59],[side*.68,1.75,-1.94],.017,'#8f8c75');cord(g,[[side*.68,1.75,-1.94],[side*.72,1.01,-1.86],[side*.64,.66,-1.73]],.005,'#898d78')}
      const reel=group(g,0,.75,-1.64);for(let s of [-1,1]){let end=cyl(reel,s*.196,0,0,.16,.16,.029,'#768c83');end.rotation.z=PI/2}
      for(let j=0;j<18;j++)tor(reel,-.169+j*.020,0,0,.135,.016,'#9da38a').rotation.y=PI/2;
    }else if(i===1){
      // Amber wheelhouse carries a pair of squid-light bars above the working deck.
      for(let s of [-1,1]){rod(g,[s*.49,1.56,.2],[s*.72,1.92,.2],.021,iron);rod(g,[s*.72,1.92,.29],[s*.72,1.92,-1.13],.022,'#9eaba3');for(let j=0;j<5;j++){let z=.14-j*.27;cyl(g,s*.72,1.85,z,.034,.044,.10,'#8e9a91');oval(g,s*.72,1.755,z,.055,.077,.055,'#eee1b5')}}
    }else{
      rod(g,[0,1.58,-.52],[0,2.02,-.52],.028,'#aab5aa');let radarBar=box(g,0,2.05,-.52,.74,.085,.091,white,true);
      printed(g,0,2.047,-.469,.42,.057,'radome',(c,w,h)=>{c.fillStyle='#ecede1';c.fillRect(0,0,w,h);c.fillStyle='#4b7777';c.textAlign='center';c.font='bold '+h*.66+'px sans-serif';c.fillText('SHIOMI',w/2,h*.77)});
    }
  }
}
function finishShores(){
  // Oyster valves and clustered volcano-shaped barnacles have distinct silhouettes.
  for(let k=0;k<35;k++){
    let z=rnd(-3.9,7.72),y=rnd(-.45,.05);
    for(let j=0;j<5;j++){let g=group(world,-2.641,y+rnd(-.061,.06),z+rnd(-.115,.115));g.rotation.z=-PI/2;
      if(j%2){let shell=oval(g,0,.018,0,.032,.047,.061,'#d4ceb2',roundG);shell.rotation.y=rnd(-1,1);oval(g,.009,.047,.012,.015,.011,.024,'#a7ad96',icoG)}
      else{cyl(g,0,.018,0,.021,.041,.044,'#bcbfa5',7);cyl(g,0,.043,0,.010,.011,.006,'#747f71',6)}
    }
  }
  for(let i=0;i<25;i++){
    let z=rnd(-4.1,7.7),y=rnd(-.62,-.18);let kelp=group(world,-2.63,y,z);moving.push(kelp);
    let dx=rnd(.048,.19),dz=rnd(-.13,.13),l=rnd(.20,.48);
    face(kelp,[[0,0,0],[.038,0,.02],[dx,-l*.7,dz],[dx*.49,-l*.5,dz-.035]],pick(['#4f7c65','#637e64','#749077']));
    face(kelp,[[dx*.49,-l*.5,dz-.035],[dx,-l*.7,dz],[dx+.07,-l,dz+.045]],'#668469')
  }
  // Rope fibres and a wet tail from the last working bollard.
  for(let [x,z,id] of [[-2.95,6.82,0],[-2.95,3.48,1],[3.8,-4.7,2]]){
    let pts=id===2?[[x,1.20,z],[x+.21,1.06,z+.14],[x+.35,.78,z+.37],[x+.36,.19,z+.45],[x+.30,-.24,z+.51]]:[[x,1.20,z],[x+.19,1.06,z-.09],[x+.31,.96,z-.05],[x+.39,.23,z+.04],[x+.38,-.23,z+.1]];
    cord(world,pts.slice(0,4),.030,'#b2885d');cord(world,pts.slice(3),.032,'#695f49');
    for(let j=0;j<7;j++)oval(world,pts[4][0]+rnd(-.024,.024),pts[4][1]-.039,pts[4][2]+rnd(-.024,.024),.009,.049,.009,'#6c6953')
  }
}

function slipHeight(x){return 1.05-(x+7.24)*.236}
function constructSlipway(){
  const x0=-7.24,x1=-2.12,z0=4.50,z1=6.44,h0=slipHeight(x0),h1=slipHeight(x1);
  const deck=face(world,[[x0,h0,z0],[x0,h0,z1],[x1,h1,z1],[x1,h1,z0]],cement);
  deck.geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,0,1,1,1,1,0],2));
  for(let z of [z0,z1])face(world,[[x0,h0,z],[x1,h1,z],[x1,-1.47,z],[x0,-1.47,z]],'#8f9c90');
  face(world,[[x1,h1,z0],[x1,h1,z1],[x1,-1.47,z1],[x1,-1.47,z0]],'#758f81');
  for(let x=x0+.12;x<x1-.03;x+=.32){
    let sill=box(world,x,slipHeight(x)+.013,5.47,.054,.027,1.83,x<-3.9?'#a3ada1':'#838f79');sill.rotation.z=-Math.atan(.236);
    for(let z of [4.90,6.04])oval(world,x,slipHeight(x)+.034,z,.019,.009,.020,'#727e73')
  }
  for(let z of [4.90,6.04])rod(world,[x0,slipHeight(x0)+.039,z],[x1,slipHeight(x1)+.040,z],.026,'#878376');
  for(let side of [-1,1]){
    let z=side<0?z0-.068:z1+.068;
    box(world,-5.0,Y+.042,z,4.49,.083,.115,'#b3bbab',true);
    for(let k=0;k<6;k++){let x=-7.16+k*.81;box(world,x,Y+.089,z,.24,.012,.111,k%2?'#cead66':'#ebe3c5')}
  }
  let capstan=group(world,-7.35,Y,5.46);cyl(capstan,0,.068,0,.22,.25,.136,'#778b82');cyl(capstan,0,.22,0,.137,.15,.22,'#a08a68');cyl(capstan,0,.347,0,.184,.164,.042,iron);
  for(let j=0;j<4;j++)tor(capstan,0,.15+j*.042,0,.146,.018,'#b79b70',true);
  cord(world,[[-7.33,1.30,5.60],[-7.04,1.15,5.67],[-6.63,1.06,5.51]],.018,'#9d8564');
  let o=decal(world,-6.0,1.061,6.65,.87,.26,(c,w,h)=>{c.fillStyle='#f0e4c1';c.font='bold '+h*.77+'px sans-serif';c.textAlign='center';c.fillText('船 揚 場',w*.5,h*.80)});o.rotation.x=-Math.PI/2;
}
function skiffGrain(){
  const woods=['#a77e5a','#b18a63','#ac805d','#957355','#b78c66'];
  const paints=woods.map(base=>new T.MeshStandardMaterial({side:T.DoubleSide,roughness:.76,map:tex(640,128,(c,w,h)=>{
    c.fillStyle=base;c.fillRect(0,0,w,h);
    for(let j=0;j<120;j++){let y=rnd(0,h);c.strokeStyle=pick(['#594e3b37','#e9cba02b','#735f442d']);c.lineWidth=rnd(.45,1.6);c.beginPath();for(let x=0;x<=w;x+=10)c.lineTo(x,y+3*Math.sin(x*.019+y*.18)+1.9*Math.cos(x*.035));c.stroke()}
    for(let j=0;j<4;j++){c.strokeStyle='#6a594646';c.lineWidth=1.3;c.beginPath();c.ellipse(rnd(40,w-30),rnd(15,h-15),rnd(7,16),rnd(2,4),-.03,0,TAU);c.stroke()}
  })}));
  let i=0;skiff.traverse(o=>{if(!o.isMesh||o.geometry.attributes.uv)return;const pos=o.geometry.attributes.position,uv=[];for(let j=0;j<pos.count;j++)uv.push(.5+pos.getZ(j)/3.6,.5+pos.getY(j)*1.62);o.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));o.material=paints[i++%5]});
  for(let s of [-1,1])for(let z of [-1.28,-.5,.46,1.2]){let w=ss.find(a=>a[0]===z)[1];for(let k=1;k<5;k++){let a=k/5;oval(skiff,s*(w*(.14+.86*a)+.006),-.31+a*.54+Math.max(0,z-1.05)**2*.16,z,.013,.016,.014,'#7e6a53')}}
}
function marinePaintwork(){
  const creamInk='#ede5c7';
  // The co-op identifier is painted on the seaward roof slope, below the skylight.
  const roofStamp=group(wh,-1.38,3.51-.76*1.0/1.815+.082,1.0);roofStamp.rotation.x=Math.atan2(.76,1.815);
  const mark=decal(roofStamp,0,.006,.012,1.72,.71,(c,w,h)=>{
    c.fillStyle=creamInk;c.strokeStyle=creamInk;c.globalAlpha=.72;c.lineWidth=6;
    c.beginPath();c.arc(h*.49,h*.49,h*.38,0,TAU);c.stroke();fishIcon(c,h*.50,h*.43,h*.24,creamInk);
    for(let k=0;k<2;k++){c.beginPath();for(let x=0;x<83;x++)c.lineTo(h*.30+x,h*(.62+k*.062)+Math.sin(x*.09)*4);c.stroke()}
    c.font='bold '+h*.57+'px Georgia';c.fillText('07',h*.98,h*.66);c.font='600 '+h*.114+'px sans-serif';c.fillText('SHIOMI  GYOKYO',h,h*.84,w-h);
    c.globalCompositeOperation='destination-out';for(let i=0;i<820;i++)c.fillRect(rnd(0,w),rnd(0,h),rnd(1,7),rnd(1,3))
  });mark.rotation.x=-PI/2;
  // Redundant raised signs would snag nets; registration lettering is flush to the hull.
  for(let i=0;i<boats.length;i++){
    let g=boats[i].g,accent=['#46868e','#a87954','#547c85'][i];
    let sec=[[-1.84,.51],[-1.66,.63],[-.95,.69],[.25,.68],[1.06,.57],[1.61,.33],[1.99,.035]];
    for(let side of [-1,1]){
      let pts=sec.map(([z,w])=>[side*w*.976,.525+.085*smoothHull(z),z]);
      cord(g,pts,.019,accent);
      for(let k of [1,2,3]){const z=.93+.14*k,w=.57-(z-1.06)*.43;let ring=tor(g,side*(w+.008),.331,z,.037,.008,'#829294');ring.rotation.y=side*1.15;oval(g,side*(w+.005),.331,z,.010,.031,.033,'#47656a')}
    }
    const stern=group(g,0,.65,-1.94);oval(stern,0,.01,0,.186,.192,.131,'#647472');box(stern,0,.073,-.113,.265,.089,.042,'#83928b',true);
    for(let j=0;j<4;j++)box(stern,0,.026-j*.023,-.141,.196,.007,.010,'#506460');
    box(stern,0,-.32,-.03,.10,.36,.16,'#596d6c');oval(stern,0,-.48,-.016,.15,.032,.076,'#6e807c');
    let namePlate=printed(g,.38,.319,-1.883,.23,.071,'stern-'+i,(c,w,h)=>{c.fillStyle='#dfe0cf';c.fillRect(0,0,w,h);c.fillStyle='#486366';c.textAlign='center';c.font='bold '+h*.52+'px monospace';c.fillText('SM '+[617,280,315][i],w/2,h*.68)},PI);
    for(let j=0;j<8;j++){let z=.65+j*.124;box(g,0,.481+Math.max(z-1.05,0)**2*.16,z,(1.58-z)*.64+.33,.015,.006,'#809b95')}
  }
  // Repairs and chips run along the working edge of the kerbs.
  for(let b of world.children.filter(o=>o.isGroup&&o.children[0]?.material===mat('#e0ab3f'))){
    let length=b.children[0].scale.x;
    for(let j=0;j<14;j++){let x=rnd(-length*.48,length*.48),y=rnd(.012,.17);
      face(b,[[x,y,.103],[x+rnd(.018,.052),y+.004,.103],[x+.008,y+rnd(.015,.034),.103]],pick(['#afb4a2','#c8c7ae','#d1bc83']))}
  }
  let front=decal(world,-6.57,.275,8.033,1.30,.55,(c,w,h)=>{c.fillStyle='#dbe0c9';c.globalAlpha=.75;c.font='bold '+h*.85+'px Georgia';c.fillText('01',22,h*.85);c.fillRect(w*.64,h*.25,w*.26,5);c.font='bold '+h*.14+'px sans-serif';c.fillText('BERTH',w*.64,h*.58)});
  for(let x of [-1,1])for(let j of [-1,1])oval(label,1.75*x,.162*j,.027,.023,.026,.014,'#d9b578');
}
function smoothHull(z){return Math.max(0,z-1.05)**2*1.88}
function foliageFinish(){
  const groupMats=new Set();
  for(const tree of trees)tree.traverse(o=>{if(o.isMesh)groupMats.add(o.material)});
  for(let m of groupMats){
    const prior=m.onBeforeCompile;m.onBeforeCompile=function(shader,r){prior.call(this,shader,r);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat leafA=sin(skyPos.x*13.+sin(skyPos.z*12.4)+skyPos.y*8.)+cos(skyPos.y*17.-skyPos.z*14.2);float leafB=sin(skyPos.x*26.+skyPos.z*21.+cos(skyPos.y*13.));float dap=smoothstep(.2,.53,leafA+.48*leafB);diffuseColor.rgb*=mix(vec3(.80,.89,.90),vec3(1.09,1.052,.96),dap);');
    };m.customProgramCacheKey=()=>'painted-canopy';m.needsUpdate=true;
  }
}
let shafts=[];
function sunlight(p,top,bottom,width,spread){
  let direction=bottom.clone().sub(top),across=V(direction.z,0,-direction.x).normalize();
  for(let n=0;n<2;n++){
    let axis=across.clone().applyAxisAngle(direction.clone().normalize(),n*PI/2);
    const corners=[top.clone().addScaledVector(axis,-width),top.clone().addScaledVector(axis,width),bottom.clone().addScaledVector(axis,spread),bottom.clone().addScaledVector(axis,-spread)];
    const geo=geom(corners.map(q=>q.toArray()),[0,1,2,0,2,3]);geo.setAttribute('uv',new T.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));
    const material=new T.ShaderMaterial({uniforms:{power:{value:1}},vertexShader:`varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 st;uniform float power;void main(){float sides=pow(max(0.,sin(3.14159*st.x)),1.4);float fall=smoothstep(0.,.18,st.y)*smoothstep(0.,.05,1.-st.y);float rays=.73+.27*sin(st.x*28.);gl_FragColor=vec4(.99,.80,.48,.115*sides*fall*rays*power);}`,transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
    let beam=mesh(p,geo,material);shafts.push(beam);beam.renderOrder=3;
  }
}
function interiorLight(){
  for(let x of [-1.75,-.42,.81]){
    sunlight(wh,V(x,2.34,-1.26),V(x+.37,.115,1.16),.16,.37);
    let patch=oval(wh,x+.31,.111,1.11,.29,.003,.20,mat('#f6db98',.29));patch.renderOrder=3;
  }
  for(let j=0;j<17;j++)box(wh,-2.29+j*.287,2.68,0,.281,.038,2.79,j%4?'#b6b8a4':'#c3c4ad');
  for(let i=0;i<boats.length;i++){
    const g=boats[i].g;
    sunlight(g,V(.42,1.34,.37),V(-.20,.62,-.17),.058,.105);
    for(let k=0;k<4;k++)box(g,-.39+k*.25,1.412,-.045,.019,.033,1.17,'#a7b4a5');
  }
}
function hangingNet(x,z,lean){
  let g=group(world,x,Y,z);g.rotation.z=lean;
  rod(g,[0,0,0],[0,1.49,0],.019,'#a68962');for(let i=0;i<4;i++)tor(g,0,1.43+i*.016,0,.021,.009,'#746e5a',true);
  let hoop=group(g,0,1.66,0);hoop.rotation.y=1.16;
  tor(hoop,0,0,0,.177,.012,'#80918b');
  function at(a,v){return [.177*Math.cos(a)*Math.cos(v*PI/2),.177*Math.sin(a)*Math.cos(v*PI/2)-.055*v,-.21*Math.sin(v*PI/2)]}
  for(let j=0;j<12;j++){let a=j*TAU/12;cord(hoop,Array.from({length:6},(_,k)=>at(a+k*.065,k/5)),.0038,'#768d86')}
  for(let j=1;j<5;j++){let pts=Array.from({length:17},(_,k)=>at(k*TAU/16,j/5));cord(hoop,pts,.0035,'#799189')}
}
function chalkAuction(){
  let board=group(wh,-.37,1.46,-1.291);
  box(board,0,0,-.019,1.82,.86,.059,'#988974',true);
  printed(board,0,0,.017,1.76,.80,'market-chalk',(c,w,h)=>{
    c.fillStyle='#345851';c.fillRect(0,0,w,h);for(let j=0;j<15000;j++){c.fillStyle=pick(['#bdbda916','#223c3a25']);c.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),1)}
    c.fillStyle='#e6e3bc';c.font='bold '+h*.16+'px serif';c.fillText('本日の競り',w*.065,h*.235);
    c.font=h*.058+'px monospace';c.fillText('SHIOMI  /  MORNING MARKET',w*.52,h*.221);c.fillRect(w*.055,h*.29,w*.89,1);
    const words=['真 鯛','真 鯵','鰯'];for(let i=0;i<3;i++){
      let y=h*(.46+.19*i);fishIcon(c,w*.14,y-h*.026,h*.15,['#c9a78b','#a7c1b1','#adc0ad'][i]);c.fillStyle='#dedec6';c.font=h*.116+'px serif';c.fillText(words[i],w*.28,y);c.textAlign='right';c.font='bold '+h*.12+'px Georgia';c.fillText(['960','380','240'][i]+' 円',w*.82,y);c.textAlign='left';c.strokeStyle='#c2c7ac63';c.setLineDash([2,5]);c.beginPath();c.moveTo(w*.24,y+6);c.lineTo(w*.89,y+6);c.stroke()
    }
  });
  box(board,0,-.45,.005,1.80,.045,.08,wood);rod(board,[.44,-.41,.022],[.62,-.41,.022],.012,cream);
}
function beaconDetail(g){
  for(let i=0;i<2;i++){let x=-.12+i*.22;rod(g,[x,.32,-.52],[x,2.64,-.35],.018,'#778e88')}
  for(let i=0;i<12;i++){let y=.39+i*.193,z=-.52+i*.015;rod(g,[-.12,y,z],[.10,y,z],.013,'#869b91')}
  tor(g,0,2.80,0,.505,.014,'#657e78',true);for(let j=0;j<7;j++)tor(g,0,2.88+j*.038,0,.151,.010,'#f4d998',true);
  box(g,.103,.72,.521,.043,.020,.032,brass);box(g,.02,1.012,.434,.214,.077,.031,cream);
  let panel=printed(g,.02,1.016,.456,.19,.061,'tower-tag',(c,w,h)=>{c.fillStyle='#e3e1c9';c.fillRect(0,0,w,h);c.fillStyle='#486766';c.textAlign='center';c.font='bold '+h*.69+'px serif';c.fillText('汐見港灯台',w*.5,h*.75)});
  for(let j=0;j<22;j++){
    let a=rnd(0,TAU),r=rnd(.22,.41),x=5.57+Math.cos(a)*(r+.47),z=-2.8+Math.sin(a)*(r+.43);
    if(x>4.90&&x<6.22&&z>-4.3&&z<-1.96)oval(world,x,Y+.011,z,.024,.010,.023,'#a69b83',icoG);
  }
  for(let i=0;i<27;i++){
    const a=rnd(0,TAU),r=Math.sqrt(rnd()),x=5.48+1.18*r*Math.cos(a),z=-1.93+.89*r*Math.sin(a);
    const k=rnd(.31,.54);
    oval(world,x,-1.08+(1-r)*.56,z,k*1.26,k,k*1.19,pick(['#879c8d','#989f8c','#a0ad97','#889a8c']),roundG);
  }
  oval(world,5.54,-1.15,-2.05,1.23,1.02,1.15,'#91a190',roundG);
}
function vendorGraphics(g){
  let ad=printed(g,-.458,.93,.015,.51,1.27,'ramune-side',(c,w,h)=>{
    c.fillStyle='#bd5e4e';c.fillRect(0,0,w,h);c.fillStyle='#ded9ba';c.fillRect(w*.08,h*.048,w*.84,h*.90);
    c.fillStyle='#719d96';c.fillRect(w*.12,h*.07,w*.76,h*.63);c.fillStyle='#f1d6a4';c.beginPath();c.arc(w*.62,h*.23,w*.18,0,TAU);c.fill();
    c.fillStyle='#d7e6cf';c.beginPath();for(let [x,y] of [[.29,.62],[.29,.38],[.35,.30],[.34,.22],[.41,.22],[.40,.30],[.48,.38],[.48,.62]])c.lineTo(x*w,y*h);c.fill();c.fillStyle='#ba7358';c.fillRect(w*.29,h*.445,w*.19,h*.069);
    c.fillStyle='#466e68';c.textAlign='center';c.font='bold '+w*.21+'px serif';c.fillText('ラムネ',w/2,h*.80);c.font='bold '+w*.075+'px sans-serif';c.fillText('し お み 飲 料',w/2,h*.885)
  },-Math.PI/2);
  for(let j=0;j<15;j++){let x=-.29+(j%5)*.145,y=1.44-Math.floor(j/5)*.23;
    cyl(g,x,y-.013,.385,.046,.046,.046,['#d7e1c5','#e6d3af','#9cb8a6'][j%3]);
    box(g,x,y-.087,.403,.028,.012,.004,'#c9d39f')
  }
  box(g,.303,.676,.385,.105,.019,.008,'#263e40');
  printed(g,.293,.756,.367,.13,.066,'credit',(c,w,h)=>{c.fillStyle='#284644';c.fillRect(0,0,w,h);c.fillStyle='#dfbe72';c.textAlign='center';c.font='bold '+h*.78+'px monospace';c.fillText('100',w/2,h*.80)});
  for(let j=0;j<9;j++)box(g,-.30+j*.075,.155,.335,.045,.009,.014,'#835e52');
}
function reverseFacades(){
  function courses(axis,edge,start,end){
    for(let row=0;row<4;row++){
      for(let a=start;a<end-.008;){let w=Math.min(end-a,rnd(.96,1.58)),y=-1.16+row*.60;
        let col=pick(row<2?['#5a8277','#61897d','#648378']:['#939e90','#a9ac9b','#929c91','#a0a596']);
        const m=masonry.get(mat(col))||mat(col);
        if(axis==='x')box(world,edge,y,a+w*.5,.041,.585,Math.max(.005,w-.012),m,true);
        else box(world,a+w*.5,y,edge,Math.max(.005,w-.012),.585,.041,m,true);a+=w
      }
    }
  }
  courses('x',-8.011,-8,8);courses('z',-8.011,-8,3.20);courses('z',6.435,-7.24,-2.70);
  for(let i=0;i<27;i++){let x=-2.48+i*.189;
    box(wh,x,1.02,-1.506,.022,1.93,.025,'#b2b8a9');
  }
  box(wh,-.12,1.39,-1.53,1.22,.67,.079,'#9baba1',true);
  for(let i=0;i<8;i++)box(wh,-.12,1.14+i*.073,-1.591,1.10,.040,.049,'#7f9691');
  for(let s of [-1,1]){box(wh,s*2.45,1.13,-1.52,.067,2.24,.067,'#7d978b');box(wh,s*1.45,.069,-1.70,1.14,.138,.34,'#aab3a2',true)}
  for(let i=0;i<12;i++){let y=.20+i*.15;box(wait,0,y,-1.358,4.09,.024,.021,'#d2c7a5')}
  for(let x of [-1.20,.60]){
    box(wait,x,1.42,-1.38,.88,.63,.072,'#8d9782',true);
    box(wait,x,1.43,-1.424,.78,.52,.025,'#b4cec5');box(wait,x,1.43,-1.452,.032,.54,.024,cream);
    box(wait,x,1.43,-1.45,.78,.027,.025,cream);box(wait,x,1.08,-1.43,.95,.06,.16,'#849b8d');
  }
}
function cottageBack(g){
  for(let s of [-1,1]){
    box(g,s*.49,.77,-.661,.43,.48,.049,'#7e8779',true);box(g,s*.49,.78,-.695,.34,.38,.019,'#a5bfb1');
    box(g,s*.49,.79,-.709,.029,.41,.015,'#827b66');box(g,s*.49,.78,-.715,.37,.027,.017,'#827b66');
    box(g,.83,.79,s*.38,.041,.44,.44,'#839184',true);
    for(let j=0;j<5;j++)box(g,.857,.61+j*.085,s*.38,.029,.038,.40,'#949b88');
  }
  box(g,0,.17,-.65,1.66,.21,.048,'#aaa993');
}
function villageTerrain(){
  const xa=-7.985,xb=-2.44,za=-7.985,zb=-4.02,nx=22,nz=16;
  const height=(x,z)=>{
    const dx=x+5.55,dz=z+6.72;
    const mound=1.17*Math.exp(-dx*dx/5.8-dz*dz/3.2)+.52*Math.exp(-((x+7.1)**2)/3-((z+7.42)**2)/1.9);
    return Y+.032+mound+
      (.056*Math.sin(x*3.43+z*1.21)+.042*Math.sin(z*4.1-x*1.1))*Math.min(1,mound);
  };
  const pos=[],colors=[],ids=[],earth=new T.Color();
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const x=mixTerrain(xa,xb,i/nx),z=mixTerrain(za,zb,j/nz),y=height(x,z);
    pos.push(x,y,z);
    earth.set(pick(['#9ba77c','#a9b18a','#a0ad7f','#949f77','#a4af85']));colors.push(earth.r,earth.g,earth.b);
    if(i<nx&&j<nz){let a=j*(nx+1)+i;ids.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2)}
  }
  const top=new T.BufferGeometry();top.setAttribute('position',new T.Float32BufferAttribute(pos,3));top.setAttribute('color',new T.Float32BufferAttribute(colors,3));top.setIndex(ids);top.computeVertexNormals();
  mesh(world,top,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));
  for(const side of [0,1,2,3]){
    const count=side<2?nx:nz;
    for(let j=0;j<count;j++){
      const a=j/count,b=(j+1)/count;
      const x1=side<2?mixTerrain(xa,xb,a):side===2?xa:xb,x2=side<2?mixTerrain(xa,xb,b):x1;
      const z1=side>=2?mixTerrain(za,zb,a):side===0?za:zb,z2=side>=2?mixTerrain(za,zb,b):z1;
      const y1=height(x1,z1),y2=height(x2,z2);
      for(let k=0;k<3;k++){
        let f=[0,.49,.88,1],c=['#ab9d7b','#b8ad86','#97a57c'][k];
        face(world,[[x1,mixTerrain(Y,y1,f[k]),z1],[x2,mixTerrain(Y,y2,f[k]),z2],[x2,mixTerrain(Y,y2,f[k+1]),z2],[x1,mixTerrain(Y,y1,f[k+1]),z1]],c)
      }
    }
  }
  for(const o of trees){
    const p=o.parent,x=p.position.x,z=p.position.z;
    const y=height(x,z);if(y<p.position.y)rod(world,[x,y-.018,z],[x,p.position.y+.045,z],.103*p.scale.x,'#7c7157');
  }
  let path=new T.CatmullRomCurve3([V(-3.06,0,-4.48),V(-3.35,0,-5.35),V(-4.10,0,-5.74),V(-4.63,0,-6.21),V(-5.22,0,-6.55)]);
  for(let i=0;i<14;i++){
    let p=path.getPoint(i/13),tangent=path.getTangent(i/13);let stone=oval(world,p.x,height(p.x,p.z)+.019,p.z,.196,.026,.100,pick(['#c0bc9d','#b6b69d','#b9baa2']),roundG);stone.rotation.y=Math.atan2(tangent.x,tangent.z);
  }
}
function mixTerrain(a,b,u){return a+(b-a)*u}
