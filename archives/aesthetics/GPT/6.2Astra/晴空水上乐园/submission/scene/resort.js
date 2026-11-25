'use strict';
function deck(x,z,w,d,y,base=.52){
 slab(x,z,w,d,base,y,0xc29c77);for(let j=0;j<Math.round(d/.5);j++)box(x,y+.09,z-d/2+j*.5+.25,w,.18,.5,[0xdfc296,0xe6c9a1,0xddbe93,0xe8cba5,0xe2c49b][j%5]);
 for(let q=1;q<w/5;q++){for(let j=q%2;j<d;j+=3)box(x-w/2+q*5,y+.205,z-d/2+j,.125,.125,.48,0xc9ab82,'solid',.125)}
}
function rescueRing(x,y,z,r=1){faceHoop(x,y,z,r,r*.35,.36,C.coral);for(let a=0;a<4;a++){const th=PI/4+a*PI/2;box(x+Math.cos(th)*r*.82,y+Math.sin(th)*r*.82,z,.42*r,.41*r,.42,C.white,'solid',.125)}}
function cabana(x,z,c,base=.95){
 deck(x,z,6.7,6.1,base+.45,base-.35);
 for(let s of [-1,1])for(let q of [-1,1]){const xx=x+s*2.85,zz=z+q*2.6;column(xx,zz,base+.35,base+4.15,.32,C.wood);
 for(let j=0;j<7;j++){const k=Math.abs(j-2.5)/4;box(xx-s*k*.46,base+1.03+j*.47,zz,.43+k*.75,.5,.24+(j%2)*.13,j%2?C.snow:0xf4ecd7,'leaf',.125)}
 box(xx,base+1.95,zz,.71,.23,.45,c,'solid',.125)}
 for(let j=0;j<5;j++)box(x,base+4.1+j*.31,z,7.2-j*1.12,.43,6.5-j*.94,j===0?C.white:c);
 for(let s of [-1,1])lounger(x+s*1.5,z,c,base+.6,-1);
 box(x,base+1.16,z+.5,1.17,.25,1.17,C.white);column(x,z+.5,base+.5,base+1.16,.26,C.teak);
}
for(let side of [-1,1])for(let j=0;j<4;j++){const z=-20+j*10.5,x=side*(44.5+.55*z+5.5);cabana(x,z,[C.sky,C.mint,C.butter,C.pink][(j+(side>0?1:0))%4],.95)}
cabana(-61,32,C.mint);cabana(61,32,C.sky);
for(let row=0;row<2;row++)for(let k=0;k<11;k++){const x=(k-5)*9.3+(row?2.5:0);if(Math.abs(x)<7.2)continue;const z=29-.00365*x*x+4.0+row*6.0,c=[C.yellow,C.sky,C.pink,C.mint][(k+row)%4];
 if(z>38.9)continue;umbrella(x,z,2.45,c,.75);lounger(x-1.55,z-.95,c,.75,-1);lounger(x+1.55,z-.95,c,.75,-1);box(x,.99,z+.98,.75,.38,.75,C.white);
}
function lifeguard(x,z,s=1){
 let y=.75;for(let xx of [-1,1])for(let zz of [-1,1]){const X=x+xx*1.25,Z=z+zz*1.2;beam(X+xx*.5,y,Z+zz*.44,X,y+3.3,Z,.33,C.white);column(X,Z,y+3.25,y+6.3,.26,C.white)}
 box(x,y+3.15,z,3.65,.45,3.25,C.coral);box(x,y+3.63,z-.65,1.55,.4,1.0,C.white);box(x,y+4.23,z-1.09,1.45,1,.22,C.ice);
 for(let j=0;j<4;j++)box(x,y+6.28+j*.25,z,4.65-j*.85,.30,4.1-j*.75,j%2?C.coral:C.white);
 guard(x-1.5,z+1.39,x+.35,z+1.39,y+3.3,C.white,1);
 for(let xx of [x+.7,x+1.68])beam(xx,y,z+3,xx,y+3.27,z+1.45,.17,C.white);for(let j=0;j<8;j++)box(x+1.19,y+.25+j*.39,z+2.87-j*.19,1.1,.18,.29,C.wood,'solid',.125);
 rescueRing(x-1.08,y+2.7,z+1.68,.62);box(x,y+3.56,z+1.55,1.4,.62,.25,C.white);box(x,y+3.6,z+1.72,.68,.20,.125,C.coral,'solid',.125);box(x,y+3.6,z+1.72,.21,.54,.125,C.coral,'solid',.125);
}
lifeguard(-55,22);lifeguard(54,23);lifeguard(-124,60);
// Shared attachment points keep every float and every span on the same travelling wave.
const buoyRows=[];
template('float-cord',()=>box(0,0,0,1,.125,.125,C.cream,'solid',.125));
for(let row=0;row<2;row++){
 const z=-8+row*20,w=43+.53*z,count=128,nodes=Array.from({length:count+3},()=>vec());
 const shore=43.5+.55*z+.62;let cachedTime=-1;
 nodes[0].set(-shore,1.25,z);nodes[count+2].set(shore,1.25,z);
 for(const x of [-shore,shore]){
  box(x,1.03,z,.65,.50,.62,C.white);box(x,1.34,z,.42,.22,.38,C.deep,'solid',.125);
 }
 function update(t){
  if(cachedTime===t)return;cachedTime=t;
  for(let i=0;i<=count;i++){
   const u=i/count,x=mix(-w,w,u),envelope=Math.sin(PI*u);
   const zz=z+envelope*(.10*Math.sin(t*.93+i*.050)+.16*Math.sin(t*.39+row));
   const sag=.055*Math.sin(PI*(i%4)/4);
   nodes[i+1].set(x,waveY(x,zz,t)+.15-sag,zz);
  }
 }
 buoyRows.push({nodes,update});
 for(let j=0;j<=32;j++){
  const tint=j%4<2?C.coral:C.white,key=template('divider'+tint,()=>{
   box(0,0,0,.625,.375,.50,tint,'wet',.125);box(0,0,0,.375,.5,.5,tint,'wet',.125);
   for(let side of [-1,1])box(side*.34,0,0,.125,.25,.25,C.cream,'wet',.125);
  });
  actor(key,(t,o)=>{update(t);const i=j*4+1;o.position.copy(nodes[i]);
   const before=nodes[i-1],after=nodes[i+1];o.rotation.z=Math.atan2(after.y-before.y,after.x-before.x);
  });
 }
 const cordAxis=vec(1,0,0),direction=vec();
 for(let i=0;i<nodes.length-1;i++)actor('float-cord',(t,o)=>{
  update(t);const a=nodes[i],b=nodes[i+1];o.position.lerpVectors(a,b,.5);
  direction.subVectors(b,a);o.scale.x=direction.length()+.03;o.quaternion.setFromUnitVectors(cordAxis,direction.normalize());
 });
}
// Ocean-liner inspired wave house, with an enamel mural and a working clock.
{
 const x=0,z=-33.7;slab(x,z,49,7.3,.75,7.85,C.white);slab(x,z,51.0,8.8,7.85,8.45,C.deep);slab(x,z-.25,51.75,9.3,8.45,8.95,C.sky);
 for(let k=-24;k<=24;k+=2.25){box(k,1.77,-29.94,1.45,1.8,.26,C.ink);for(let j=0;j<3;j++)box(k,1.21+j*.46,-29.77,1.55,.20,.125,C.sky,'solid',.125)}
 plaque(-2.5,5.32,-29.98,37.7,4.7,(g,w,h)=>{g.fillStyle='#288eaf';g.fillRect(0,0,w,h);g.fillStyle='#38a8bb';g.beginPath();g.moveTo(0,h*.65);g.bezierCurveTo(w*.26,-h*.23,w*.42,h*.83,w*.75,h*.4);g.lineTo(w,h*.15);g.lineTo(w,h);g.lineTo(0,h);g.fill();
 emblem(g,w*.12,h*.48,h*.54);g.fillStyle='#fff8d9';g.font='900 '+h*.73+'px Arial, sans-serif';g.textAlign='center';g.fillText('SKY BAY',w*.55,h*.73,w*.64);g.fillStyle='#ffd760';for(let j=0;j<3;j++)g.fillRect(w*(.885+j*.026),h*.22,w*.012,h*.56)},0,1024);
 box(20.5,5.25,-29.75,6.9,4.65,.6,C.white);
 const tex=canvasTexture(384,240,()=>{}),panel=new T.MeshBasicMaterial({map:tex});
 const screen=new T.Mesh(new T.PlaneGeometry(6.35,4),panel);screen.position.set(20.5,5.23,-29.35);scene.add(screen);
 const lamps=[];
 for(let j=0;j<8;j++){
  const lamp=new T.Mesh(cube,new T.MeshBasicMaterial({color:0x79a5aa}));
  lamp.position.set(-18+j*4.8,7.875,-29.0);lamp.scale.set(.875,.375,.375);scene.add(lamp);lamps.push(lamp);
 }
 let previous='';
 perFrame.push(t=>{
  const state=waveMachine(t),key=state.active?'release'+state.number:'wait'+state.seconds;
  for(let j=0;j<lamps.length;j++){
   const lit=state.active?(!state.number||Math.floor(j/2)===state.number-1?C.butter:0xa7e0cd):0x73a0a8;
   lamps[j].material.color.setHex(lit);
  }
  if(key===previous)return;previous=key;
  const g=tex.image.getContext('2d');g.fillStyle='#17485e';g.fillRect(0,0,384,240);
  g.textAlign='center';g.fillStyle='#e0f2e8';g.font='800 27px "Microsoft YaHei",sans-serif';
  g.fillText(state.active?'造浪进行中':'距下轮造浪',192,41);
  g.fillStyle=state.active?'#ffdb74':'#fff2c1';g.font='900 96px Consolas,monospace';
  g.fillText(state.active&&state.number?String(state.number).padStart(2,'0')+' / 04':'00:'+String(state.seconds).padStart(2,'0'),192,145,350);
  for(let j=0;j<4;j++){g.fillStyle=state.active&&j<state.number?'#ffe193':'#487b86';g.fillRect(60+j*69,167,57,9)}
  g.fillStyle='#c4e4de';g.font='700 19px Arial';g.fillText(state.active?'W A V E   S E T':'N E X T   W A V E',192,216);tex.needsUpdate=true;
 });
 for(let xx of [-24,0,24])column(xx,z,8.7,13.0,.25,C.white);
 pennants(-24,12.8,z,0,12.8,z,12,1.5);pennants(0,12.8,z,24,12.8,z,12,1.5);
}
function gateLogo(x,y,z,r){
 faceHoop(x,y,z,r,.6,.85,C.yellow);for(let j=0;j<20;j++){const dx=(j-9.5)*r*.107;box(x+dx,y-.35+Math.sin(dx*1.2)*.32,z+.49,r*.115,.52,.4,C.blue,'wet',.125)}
}
function glassFront(x,z,w,h,base){
 box(x,base+h/2,z,w,h,.24,0x78c8d5,'wet');box(x,base+h*.74,z+.135,w-.25,h*.22,.125,0x96d9df,'wet',.125);
 for(let xx=-w/2;xx<=w/2+.12;xx+=2)box(x+xx,base+h/2,z+.25,.18,h+.12,.20,C.white,'solid',.125);
 box(x,base+.24,z+.25,w+.3,.36,.33,C.cream);box(x,base+h*.74,z+.27,w,.14,.15,C.white,'solid',.125)
}
function storey(x,z,w,d,y,h,c){
 slab(x,z,w,d,y,y+h,C.white);slab(x,z,w+.6,d+.65,y+h-.5,y+h-.16,c);slab(x,z,w+1,d+1,y+h-.16,y+h+.13,C.snow);
 glassFront(x,z+d/2+.13,w-1.3,h-1.25,y+.54);
 for(let s of [-1,1]){
 box(x+s*(w/2+.13),y+h*.51,z,.25,h-1.32,d-1.25,0x80c9d7,'wet');
 for(let j=-d/2+1.2;j<d/2;j+=1.9)box(x+s*(w/2+.25),y+h*.52,z+j,.32,h-1.0,.21,C.white,'solid',.125)}
}
function serviceBuilding(x,z,kind){let y=1.75,c=kind?C.sky:C.mint,w=20,d=11.5;
 storey(x,z,w,d,y,4,c);storey(x-1.15,z-.65,w-2.5,d-.7,y+4.12,3.6,c);
 for(let j=0;j<5;j++)box(x-1.12,y+7.78+j*.22,z-.65,w-1.1-j*.5,.3,d+.5-j*.45,j%2?C.ice:C.white);
 for(let j=0;j<7;j++)box(x-7.5+j*2.25,y+3.85,z+d/2+.64,1.25,.26,2.75,c);
 box(x,y+3.1,z+d/2+.41,w-.8,1.3,.4,C.white);lettering(x,y+3.13,z+d/2+.64,w-1.0,1.16,kind?'游客中心  ·  SERVICE':'更衣储物  ·  LOCKERS','',kind?'#3f98b1':'#60a999');
 if(kind){gateLogo(x+4.5,y+10.85,z-.35,2.8);for(let j=0;j<3;j++){const key=floatRing([C.yellow,C.mint,C.coral][j]);actor(key,(t,o)=>o.position.set(x+w/2+1.55,y+.36+j*.43,z+3))}}
 else{box(x-4,y+10.08,z,4.3,3.95,1.4,C.blue);for(let j=0;j<3;j++){box(x-5.5+j*1.5,y+10.2,z+.80,.95,3.2,.25,C.ice);box(x-5.52+j*1.5,y+10.5,z+1,.42,.18,.15,C.deep,'solid',.125)}}
 planter(x-6,z+d/2+2.2,6.5,1.9,.5,C.butter,y);bench(x+5,z+d/2+2.1,y,1,3.1);
}
serviceBuilding(-37.5,78.2,0);serviceBuilding(37.5,78.2,1);
{
 const y=1.75,z=103;
 for(let s of [-1,1]){
 const x=s*20.25;storey(x,z,7.85,8.45,y,5.75,C.sky);
 for(let j=0;j<3;j++)box(x,y+6.15+j*.43,z,9.1-j*.75,.35,9-j*.48,j===1?C.deep:C.sky);
 const px=s*16.55;column(px,z,y,y+10.5,2.5,C.white);for(let i=0;i<3;i++)box(px+s*1.2,y+3.25+i*1.56,z+1.75,2.25,.45,3.45,C.sky);
 box(x,y+4.43,z+4.57,6.35,1.18,.50,C.deep);lettering(x,y+4.45,z+4.84,6.14,1.02,'T I C K E T S','','#26839e');
 for(let j=0;j<3;j++)box(px, y+8.35+j*.55,z,4.65+j*.45,.35,7+j*.62,j===1?C.ice:C.blue);
 }
 for(let j=0;j<7;j++){const Y=y+7.15+j*.36;box(0,Y,z,30.7+j*.9,.5,3.9+j*.39,j<2?C.deep:C.sky)}
 box(0,y+9.65,z,36.75,3.9,5.25,C.white);box(0,y+11.76,z,38.0,.5,6.5,C.blue);box(0,y+12.1,z,36.75,.25,5.9,C.ice);
 box(.95,y+9.66,z+3.45,30.7,3.86,.66,C.cream);
 plaque(1.10,y+9.68,z+3.88,29.8,3.60,(g,w,h)=>{g.fillStyle='#fff6dd';g.fillRect(0,0,w,h);g.fillStyle='#187d9a';g.textAlign='center';g.font='900 '+h*.633+'px "Microsoft YaHei",sans-serif';g.fillText('晴 空 水 上 乐 园',w*.5,h*.63,w*.98);g.fillStyle='#528c98';g.font='700 '+h*.164+'px Arial';g.fillText('S K Y   B A Y     W A T E R   P A R K',w*.5,h*.91,w*.88)},0,1280);
 gateLogo(-15.6,y+10.7,z+3.84,2.85);
 for(let s of [-1,1]){for(let j=0;j<3;j++)box(s*(19.0+j*.52),y+9.1+j*.46,z,.45,3.2,3.65,[C.butter,C.sky,C.white][j]);}
 for(let j=-4;j<=4;j++){const x=j*2.8;box(x,y+.91,z,1.1,1.85,3.6,C.ice);box(x,y+1.97,z,1.22,.32,3.75,C.blue);box(x,y+2.21,z+.82,.69,.15,.71,C.ink,'solid',.125);box(x,y+2.32,z+1.03,.26,.16,.16,C.mint,'solid',.125);if(j<4)beam(x+.55,y+1.02,z+.42,x+1.76,y+1.02,z+.42,.16,C.metal)}
 for(let s of [-1,1]){for(let k=0;k<3;k++)box(s*(25.4+k*1.5),y+.7,z,1.0,1.4,1.0,k===1?C.sky:C.white);column(s*24.5,z,y+5.9,y+12.2,.25,C.white);pennants(s*24.5,y+12.1,z,s*16.5,y+13.1,z,4,.7)}
}
{
 const x=0,z=76,y=1.75;oval(x,y+.18,z,6.85,6.85,.4,C.ice);oval(x,y+.46,z,6.55,6.55,.3,C.white);
 oval(x,y+.45,z,5.92,5.92,.25,0x8fd3d1,'wet');
 ellipseRing(x,y+.84,z,6.45,6.45,.56,.5,C.snow);
 ellipseRing(x,y+.45,z,4.55,4.55,.25,.25,C.ice,'wet');
 oval(x,y+1.12,z,1.55,1.55,.8,C.cream);oval(x,y+1.46,z,2.18,2.18,.30,0x90d2d2,'wet');
 ellipseRing(x,y+1.78,z,2.3,2.3,.35,.52,C.white);
 for(const [radius,level] of [[5.94,y+.75],[1.98,y+1.79]]){
  const n=Math.ceil(2*radius/.25);for(let j=0;j<n;j++){
   const dz=(j+.5)*radius*2/n-radius,w=snap(Math.sqrt(Math.max(0,radius*radius-dz*dz)),.125);
   if(w>.01)addWaterCell(x-w,z+dz-radius/n,x+w,z+dz+radius/n,19,level,.18);
  }
 }
 for(let j=0;j<4;j++){const a=(j+.5)*PI/2,dx=Math.cos(a),dz=Math.sin(a);
  box(x+dx*2.25,y+1.72,z+dz*2.25,.55,.21,.55,C.ice,'wet',.125);
  jet(x+dx*2.40,y+1.72,z+dz*2.40,dx*.92,-.27,dz*.92,.40,24,.045,.125);
 }
 fountain(x,y+1.74,z,1.15);
 for(let s of [-1,1]){for(let zz of [60,77,95]){const xx=s*(zz===77?20.5:15);oval(xx,y+.13,zz,3.4,3.4,.38,C.white);oval(xx,y+.38,zz,3.0,3.0,.24,0x9cc378);palm(xx,zz,zz===77?13.75:11.5,.95,y+.5);rosette(xx+s*1.5,zz,.9,0x83b376,y+.52)}
 bench(s*9,67.4,y,1);bench(s*9,86,y,-1);planter(s*25.4,93,7.7,3.25,.65,s>0?C.coral:C.butter,y)}
 for(let j=0;j<5;j++)slab(0,54.55+j*.56,14.5,.65,.5,.76+j*.25,C.cream);
 // The level landing turns onto a long ramp at the east side of the plaza steps.
 const lowX=6.85,run=15,rz=54.15;
 slab(lowX+run+1.2,55.46,2.65,4.9,.74,1.75,C.cream);
 for(let j=0;j<60;j++){
  const u=(j+.5)/60,xx=lowX+run*u,Y=snap(mix(.78,1.75,u),.125);
  box(xx,(.62+Y)*.5,rz,.25,Y-.62,2.65,j%6===0?0xe9dfc4:C.cream,'solid',.125);
  for(const side of [-1,1]){
   const zz=rz+side*1.25;
   if(j%10===0)column(xx,zz,Y,Y+1.14,.20,C.white);
   box(xx,Y+1.14,zz,.25,.18,.18,C.deep,'solid',.125);
   box(xx,Y+.76,zz,.25,.125,.125,C.white,'solid',.125);
  }
 }
}
function parkMap(x,z){
 const y=1.75;for(let s of [-1,1])column(x+s*2.55,z,y,y+5.7,.55,C.wood);box(x,y+3.94,z,6.8,4.30,.7,C.deep);box(x,y+6.13,z,7.45,.41,1.55,C.sky);
 plaque(x,y+3.96,z+.375,6.42,3.88,(g,W,H)=>{
  const zones=[
   ['01','晴空塔',-2,-90,'#258caa'],['02','极限滑道区',-93,-88,'#c97367'],['03','家庭滑道区',84,-87,'#479c88'],
   ['17','超级造浪池',0,-1,'#238cbb'],['≈','环园漂流河',103,45,'#2ca8b6'],['11','飞浪冲浪场',95,2,'#407fa2'],
   ['12','泡泡戏水城',-97,77,'#c67d96'],['13','水上挑战',-94,9,'#72a45f'],['14','暖泉花园',-94,-24,'#9182b2'],['15','海滨餐饮街',105,81,'#c99349']
  ];
  g.fillStyle='#fff9e8';g.fillRect(0,0,W,H);g.fillStyle='#197b97';g.fillRect(0,0,W,H*.145);
  emblem(g,W*.045,H*.068,H*.08);g.fillStyle='#fff9e5';g.font='900 '+H*.069+'px "Microsoft YaHei",sans-serif';g.fillText('乐园导览',W*.093,H*.095);
  g.fillStyle='#c9eced';g.font='700 '+H*.026+'px Arial';g.fillText('S K Y   B A Y    /    P A R K   M A P',W*.32,H*.087);
  const left=W*.027,top=H*.181,mw=W*.674,mh=H*.754;
  g.save();g.beginPath();g.roundRect(left,top,mw,mh,H*.024);g.clip();
  g.fillStyle='#c2e9e6';g.fillRect(left,top,mw,mh);
  g.translate(left+mw*.50,top+mh*.514);g.scale(mw/352,mh/231);
  for(let zz=-119;zz<=115;zz+=2)for(let xx=-177;xx<=177;xx+=2){
   const coast=coastDist(xx,zz);if(coast>4.5)continue;const rd=riverDist(xx,zz),type=waterKind(xx,zz,rd),height=terrainY(xx,zz);
   g.fillStyle=coast> -4?'#ebdbae':height>13?'#9dbc8a':height>6?'#abc99a':'#c9dca9';
   if(Math.abs(rd)<8.5||zz>51&&zz<106&&Math.abs(xx)<148)g.fillStyle='#f4e7c3';
   if(waveDist(xx,zz)<7&&zz<38&&zz> -32)g.fillStyle='#f6e2ab';
   if(type)g.fillStyle=type===1?'#5ebbd2':type===2?'#61cad0':'#91d3ca';
   g.fillRect(xx,zz,2.08,2.08);
  }
  g.lineCap='round';g.lineJoin='round';
  for(const [id,route] of mountainRoutes){
   g.strokeStyle=id.startsWith('race')?['#e98585','#eda667','#edc455','#79b785','#5eb4cf','#a698c7'][+id.slice(-1)]:
    id.startsWith('duo')?'#b98ca8':id==='coaster'?'#dfa654':id==='sunTwist'?'#e8ba48':id==='night'?'#566c87':'#599ea1';
   g.lineWidth=id.startsWith('race')?1.55:2.15;g.beginPath();
   for(let i=0;i<=route.path.n;i+=8){const p=route.path.p[i];if(i)g.lineTo(p.x,p.z);else g.moveTo(p.x,p.z)}g.stroke();
  }
  g.fillStyle='#68acb8';g.fillRect(83,-13,23,28);g.fillStyle='#e0a57e';
  for(const [sx,sz] of [[71,64],[96,64],[121,64],[82,91],[106,91],[130,90]])g.fillRect(sx-5.6,sz-3.8,11.2,7.6);
  g.fillStyle='#fef8de';for(let side of [-1,1])g.fillRect(side*37.5-10,72.5,20,11.5);
  g.fillStyle='#5aa7bf';g.fillRect(-22,100,44,5.7);g.fillStyle='#79c7d5';g.beginPath();g.arc(0,76,6.8,0,TAU);g.fill();
  for(const b of hotSprings){g.beginPath();g.ellipse(b[0],b[1],b[2],b[3],0,0,TAU);g.fill()}
  for(const [code,,xx,zz,tint] of zones){g.fillStyle=tint;g.strokeStyle='#fffbe8';g.lineWidth=1.1;
   g.beginPath();g.roundRect(xx-6.5,zz-5.0,13,10,2.8);g.fill();g.stroke();g.fillStyle='white';
   g.textAlign='center';g.font='900 6.8px Arial';g.fillText(code,xx,zz+2.5)}
  g.fillStyle='#db685b';g.beginPath();g.arc(x,z,3.6,0,TAU);g.fill();g.lineWidth=1.3;g.strokeStyle='#fffdf1';g.stroke();
  g.fillStyle='#a64940';g.textAlign='right';g.font='900 6.5px "Microsoft YaHei"';g.fillText('您在此',x-5,z+2);
  g.restore();
  const lx=W*.727,rh=H*.073,first=H*.233;
  zones.forEach(([code,label,,,tint],i)=>{const yy=first+i*rh;
   g.fillStyle=tint;g.beginPath();g.roundRect(lx,yy-rh*.39,W*.042,rh*.64,rh*.11);g.fill();
   g.textAlign='center';g.fillStyle='white';g.font='900 '+rh*.41+'px Arial';g.fillText(code,lx+W*.021,yy+rh*.088);
   g.textAlign='left';g.fillStyle='#24586b';g.font='750 '+rh*.49+'px "Microsoft YaHei",sans-serif';g.fillText(label,lx+W*.052,yy+rh*.12,W*.20);
  });
  g.fillStyle='#287e91';g.beginPath();g.moveTo(left+mw*.948,top+H*.031);g.lineTo(left+mw*.937,top+H*.065);g.lineTo(left+mw*.96,top+H*.065);g.fill();
  g.font='900 '+H*.020+'px Arial';g.textAlign='center';g.fillText('N',left+mw*.948,top+H*.089);
 },0,1280);
}
parkMap(-25.1,87.6);
function hotPool(x,z,rx,rz,lv){
 deck(x,z,rx*2+2.5,rz*2+2.25,1.07);ellipseRing(x,(lv+1)/2,z,rx,rz,.72,lv-1,0xc6b699);oval(x,1.45,z,rx-.44,rz-.44,.25,0x91caba);ellipseRing(x,lv+.04,z,rx+.2,rz+.2,.72,.55,C.cream);ellipseRing(x,lv-.35,z,rx+.15,rz+.15,.45,.32,0xa6cebf);
 for(let zz=-rz+.5;zz<rz-.55;zz+=.5){const width=snap((rx-.55)*Math.sqrt(Math.max(0,1-(zz/(rz-.55))**2)));if(width>.1)addWaterCell(x-width,z+zz-.25,x+width,z+zz+.25,22,lv-.045,.22)}
 for(let j=0;j<4;j++){const a=rnd(0,TAU),px=x+Math.cos(a)*rx*.63,pz=z+Math.sin(a)*rz*.56;jet(px,lv+.15,pz,0,2.35,0,.47,10,.21,.20)}
}
for(const q of hotSprings)hotPool(...q);
// Tile-lined spillways carry water from the crown pool over the rims of the two lower pools.
function springSpout(x0,z0,x1,z1,top,lower){
 const dx=x1-x0,dz=z1-z0,L=Math.hypot(dx,dz),nx=-dz/L,nz=dx/L,steps=Math.ceil(L/.25);
 for(let i=0;i<steps;i++){const u=(i+.5)/steps,x=mix(x0,x1,u),z=mix(z0,z1,u),y=top-.24*u;
  for(let j=-2;j<=2;j++){const edge=Math.abs(j)===2;box(x+nx*j*.34,y+(edge?.19:0),z+nz*j*.34,.5,edge?.65:.28,.5,edge?C.cream:0x7ccac8,'wet')}
  box(x,y+.23,z,1.18,.18,1.10,0x85d5d2,'spray');
 }
 waterfall(x1,z1,lower,top+.02,1.15,.47,Math.atan2(dx,dz));
}
springSpout(-99.9,-22.4,-105.85,-20.9,3.71,2.66);
springSpout(-88.1,-22.7,-84.15,-20.1,3.71,2.17);
for(let j=0;j<9;j++){shrub(-119+j*5.25,-32,2.35,2.6,choice(shrubCols),.75,j%3===0?C.pink:0);if(j%3===1)palm(-119+j*5.25,-32.5,10,.85)}
for(let j=0;j<6;j++)lounger(-111+j*5.35,-9.95,j%2?C.mint:C.white,.8,-1);
attractionBoard(-76,.75,-10.6,'14','暖泉花园','SPRING GARDEN','#629d8b',6.2);
{
 const y=.8;
 for(let j=0;j<10;j++){const x=-110+j*4.0,z=8+Math.sin(j*.9)*2.0,key='lily'+j%3;template(key,()=>{oval(0,0,0,1.6,1.3,.36,[C.mint,C.lime,0x78bc7e][j%3],'wet',.25);box(.1,.23,0,1.9,.125,.18,0xb6df9e,'wet',.125);box(.40,.22,.4,.23,.125,.63,0xc2e3a7,'wet',.125)});
 actor(key,(t,o)=>{o.position.set(x,y+.07*Math.sin(t*1.2+j*.9),z);o.rotation.z=.055*Math.sin(t+j);o.rotation.y=j*.73})}
 for(let x of [-112,-71])for(let z of [3.4,12.6]){column(x,z,-.65,6.5,.55,C.wood);box(x,6.55,z,.85,.38,.85,C.butter)}
 for(let z of [3.4,12.6])beam(-112,6.35,z,-71,6.35,z,.32,C.wood);
 for(let k=0;k<5;k++){const z=4+k*2;for(let j=0;j<16;j++){let a=j/16,b=(j+1)/16;beam(mix(-111,-72,a),6.25-1.25*Math.sin(a*PI),z,mix(-111,-72,b),6.25-1.25*Math.sin(b*PI),z,.15,0xc8ab80,'solid',1)}}for(let x=-110;x<-71;x+=1.8){const q=(x+111)/39;beam(x,6.25-1.25*Math.sin(q*PI),3.4,x,6.25-1.25*Math.sin(q*PI),12.6,.125,0xd3b88b)}
 for(let j=0;j<21;j++){let v=j*.5;box(-104,1.05+v,-5.9+v*.18,9.4+Math.sin(j*.27)*1.0,.62,2.15,j%7<2?0xcfbb95:0xe5d4ad)}
 for(let j=0;j<35;j++){let h=rnd(1,10),x=-104+rnd(-4.2,4.2);box(x,1+h,-4.68+h*.18,.48,.55,.5,[C.coral,C.sky,C.mint,C.yellow,C.lilac][j%5],'wet',.125)}
 for(let x of [-102,-81]){column(x,25,.75,4.9,.32,C.white);box(x,4.75,24.75,2.75,1.8,.24,C.white);box(x,4.65,24.57,1.15,.86,.125,C.coral,'solid',.125);box(x,4.69,24.48,.91,.61,.125,C.white,'solid',.125);ellipseRing(x,4.02,23.85,.65,.65,.16,.18,C.coral,'wet',.125);for(let j=0;j<6;j++){let a=j*TAU/6;box(x+.5*Math.cos(a),3.75,23.85+.5*Math.sin(a),.125,.55,.125,C.cream,'solid',.125)}}
 attractionBoard(-116,.75,24.2,'13','水上挑战','LAGOON GAMES','#40a392',6.0);
}
{
 const cx=94,cz=0,w=21.5,d=26,front=15,back=-11.5;
 slab(cx,cz,w+3.8,d+5,.65,1.5,C.white);
 const surfY=z=>1.55+4.45*(front-z)/d+1.30*Math.exp(-((z+6.1)**2)/5.8);
 for(let z=back;z<front;z+=.5){const y=surfY(z);slab(cx,z,w,.5,.85,y,0x5cc9da);for(let s of [-1,1]){box(cx+s*(w*.5+.55),y+.48,z,1.4,1.25,.5,C.deep);box(cx+s*(w*.5+.55),y+1.25,z,1.5,.45,.5,C.ice)}
 addWaterCell(cx-w*.50,z-.25,cx+w*.5,z+.25,23,(xx,zz)=>surfY(zz)+.30,.32)}
 for(let j=0;j<145;j++){let x=cx+rnd(-10,10),ph=rnd();actor('froth',(t,o)=>{let p=frac(t*.24+ph),z=front-p*d;o.position.set(x+.1*Math.sin(p*6+j),surfY(z)+.395,z);let sc=Math.sin(p*PI);o.scale.set(.25*sc,.4,1.25*sc)})}
 for(let j=0;j<19;j++)jet(cx-9.3+j*1.05,surfY(-5.5),-5.5,0,2.35,-2.15,.59,9,.22,.29);
 box(cx,6.75,-12,23,2,.9,C.white);lettering(cx,6.86,-11.53,19.9,1.54,'S U R F     C L U B','','#238da9');
 for(let j=0;j<4;j++){slab(110+j*1.45,-1,1.65,21,.75,1.7+j*.95,C.cream);box(110+j*1.45,1.96+j*.95,-1,1.04,.38,20,C.wood)}
 for(let j=0;j<6;j++){const x=87+j*2.05,z=19.15,c=[C.yellow,C.pink,C.sky,C.mint,C.coral,C.lilac][j];for(let k=0;k<15;k++){let p=(k+.5)/15;box(x,.95+p*3.75,z+.20*p,(.25+Math.sin(p*PI)**.65)*.99,.25,.28,k===8||k===10?C.white:c,'wet',.125)}}
 box(92,2.26,19.49,13.25,.32,.37,C.wood);attractionBoard(109,.75,16.5,'11','飞浪冲浪场','SURF CLUB','#27859e',6.2);
}
function kidTurret(x,z,y,h,w,c,roof=true){
 for(let i of [-1,1])for(let j of [-1,1]){const xx=x+i*(w/2-.36),zz=z+j*(w*.5-.36);column(xx,zz,.25,y+h+.75,.55,(i+j===0)?C.sky:c);box(xx,1.15,zz,.85,.75,.85,C.white);if(roof)column(xx,zz,y+h,y+h+3.35,.4,C.white)}
 for(let k=0;k<2;k++){const Y=y+h*k;slab(x,z,w+.45,w+.45,Y-.48,Y,C.white);slab(x,z,w+.65,w+.65,Y-.64,Y-.39,c);for(let s of [-1,1]){guard(x-w/2,z+s*w/2,x+w/2,z+s*w/2,Y,c,1.42);guard(x+s*w/2,z-w/2,x+s*w/2,z+w/2,Y,C.sky,1.42)}}
 if(roof){for(let j=0;j<7;j++)box(x,y+h+3.37+j*.42,z,w+2.35-j*(w+1.1)/7,.5,w+2.35-j*(w+1.1)/7,j%3===0?C.butter:c);column(x,z,y+h+5.8,y+h+7.6,.23,C.white);for(let j=0;j<4;j++)box(x+.3+j*.32,y+h+7.22,z,.33,1.25-j*.25,.125,C.coral,'solid',.125)}
}
{
 kidTurret(-97.0,75,6.75,5.25,7.1,C.sky,false);kidTurret(-110,70,4.25,4.15,5.0,C.coral);kidTurret(-84.5,72,4.5,4.1,5.0,C.yellow);kidTurret(-104,84,3,3,4.25,C.mint);
 for(let i=0;i<26;i++){const u=i/25,x=mix(-108,-99,u),z=mix(70,74,u),y=8.4+3.6*u-.65*Math.sin(u*PI);box(x,y,z,.75,.32,2.3,C.wood);for(let s of [-1,1]){box(x,y+1.47,z+s*1.1,.7,.23,.25,C.cream);if(i%3===0)box(x,y+.75,z+s*1.1,.22,1.55,.25,C.coral)}}
 for(let j=0;j<22;j++){const u=j/21,x=mix(-94,-86.3,u),y=mix(11.9,8.62,u);box(x,y,73,.65,.29,2.05,C.wood);for(let s of [-1,1]){box(x,y+1.45,73+s,.65,.22,.25,C.white);if(j%2===0)column(x,73+s,y,y+1.5,.145,C.sky)}}
 const x=-97,z=75,y=18.7;for(let s of [-1,1]){column(x+s*3.85,z,12,y+1.25,.73,C.blue);box(x+s*3.85,y+1.36,z,1.04,.54,1.1,C.yellow)}beam(x-4.15,y,z,x+4.15,y,z,.68,C.metal);
 template('tipping-pail',()=>{for(let j=0;j<17;j++){const u=(j+.5)/17,r=2.55+.7*u;ellipseRing(0,-2.35+j*.28,0,r,r,.42,.30,j<2?C.coral:j===13||j===14?C.snow:j===16?C.coral:C.yellow,'wet',.25)}
 oval(0,-2.29,0,2.48,2.48,.35,C.coral,'wet',.25);
 for(let s of [-1,1]){box(s*2.72,-.12,0,.62,1.22,.87,C.deep);box(s*2.83,.10,0,.6,.64,.58,C.white)}
 for(let j=0;j<6;j++)box(0,-.83+j*.26,3.02,1.55-Math.abs(j-2)*.25,.27,.20,C.white,'solid',.125);
 });
 const bucketAngle=t=>{const f=t%40,tilt=1.45*smooth(19.95,20.8,f)*(1-smooth(22.3,23.3,f)),jig=.10*Math.sin((f-18.65)*12)*smooth(18.65,19.1,f)*(1-smooth(19.6,20.0,f)),res=f>23.3?.13*Math.sin((f-23.3)*7)*Math.exp(-(f-23.3)*1.9):0;return tilt+jig+res};
 actor('tipping-pail',(t,o)=>{o.position.set(x,y,z);o.rotation.x=bucketAngle(t)});
 template('bucket-surface',()=>oval(0,0,0,2.85,2.85,.25,0x71d9e5,'wet',.25));
 actor('bucket-surface',(t,o)=>{const u=frac((t+16.7)/40),a=bucketAngle(t),f=t%40,lev=f>=20.6&&f<23.3?1-smooth(20.6,21.7,f):Math.min(1,u*1.10),dy=-1.92+3.98*lev;
 o.position.set(x,y+dy*Math.cos(a),z+dy*Math.sin(a));o.rotation.x=a*.64;o.scale.set(.78+.22*lev,1,.78+.22*lev)});
 column(x-4.55,z-2,12,23.7,.75,C.mint);box(x-2.5,23.7,z-2,4.6,.75,.75,C.mint);jet(x-.5,23.55,z-2,0,-1,1,1.05,37,.13,.32);pulseCurtain(x,z+2.85,12.07,y+1.95,5.3,.81,19.84,21.82,40,t=>{
  const a=bucketAngle(t);return [y+1.95*Math.cos(a)-2.85*Math.sin(a),z+1.95*Math.sin(a)+2.85*Math.cos(a)]
 });
 pulseCurtain(x,z+3.64,6.85,12.03,6.45,.5,20.96,22.77);
 pulseCurtain(x,z+4.14,.68,6.84,7.15,1.28,21.98,23.85);
 // A narrow spill signals that the large bucket is full before it tips.
 pulseCurtain(x+1.4,z+2.65,12.1,y+2.1,.46,.6,18.65,20.2);
 flume('儿童柑橘滑梯',[[-108.1,9,71],[-111,9.0,75],[-115,6.6,79],[-117,3.15,82],[-115,1.6,86]],{rx:1.32,ry:.95,color:C.orange,lip:C.butter,floatColor:C.sky,type:'mat',scale:.58,gap:5});
 flume('泡泡糖滑梯',[[-93.8,12.7,76.2],[-90,11.8,79],[-88.8,8.6,83.5],[-92,4.6,87],[-95,1.5,89.8]],{rx:1.4,ry:1,color:C.pink,lip:C.white,floatColor:C.yellow,scale:.63,gap:6});
 flume('小旋风',[[-82,9.4,72],[-79,9.1,68],[-74.6,7.8,69],[-73,6.25,73],[-76.4,5.15,75],[-80,4.75,73.1],[-80.5,3.7,69],[-77,2.45,66],[-72,1.5,66]],{rx:1.13,ry:.86,color:C.mint,lip:C.white,floatColor:C.coral,scale:.65,gap:6});
 template('waterwheel',()=>{faceHoop(0,0,0,2.2,.48,.72,C.coral);for(let j=0;j<8;j++){const a=j*PI/4;beam(0,0,0,2.35*Math.cos(a),2.35*Math.sin(a),0,.26,C.yellow,'solid',.25);box(2.12*Math.cos(a),2.12*Math.sin(a),0,.85,.65,1.35,C.sky)}box(0,0,.4,.75,.75,.45,C.white)});
 column(-107.2,86.15,3.1,7.4,.35,C.mint);box(-106.6,7.4,86.15,1.48,.35,.35,C.mint);
 jet(-105.95,7.35,86.15,.85,-.65,.52,.82,24,.075,.16);
 actor('waterwheel',(t,o)=>{o.position.set(-104,3.55,86.75);o.rotation.z=t*.84});
 for(const [px,pz,c] of [[-120,70,C.coral],[-113,88,C.mint]]){column(px,pz,.15,4.6,.58,C.white);for(let j=0;j<5;j++)oval(px,4.45+j*.27,pz,2.45-j*.35,2.45-j*.35,.31,j===0?C.cream:c,'wet');
 for(let j=0;j<6;j++){const a=j*PI/3;jet(px+1.8*Math.cos(a),4.45,pz+1.8*Math.sin(a),Math.cos(a)*1.45,.25,Math.sin(a)*1.45,.85,15,.11,.21)}}
 // Six scalloped petals carry separate spray nozzles; the outer jets arch into the pool.
 column(-75,84,.2,4.3,.55,C.mint);orb(-75,4.36,84,.82,.72,.82,C.yellow,'wet',.25);
 for(let j=0;j<6;j++){const a=j*TAU/6,dx=Math.cos(a),dz=Math.sin(a);
  orb(-75+dx*1.18,4.12,84+dz*1.18,1.10,.47,1.10,j%2?0xffbad0:C.pink,'wet',.25);
  box(-75+dx*1.88,3.92,84+dz*1.88,.42,.35,.42,C.white,'wet');
  jet(-75+dx*1.88,3.94,84+dz*1.88,dx*2.25,2.1,dz*2.25,1.04,24,.085,.18,3,j*.67);
 }
 for(const [px,pz,top,co,period] of [[-110.2,72.45,9.6,C.coral,13.7],[-84.8,74.85,9.9,C.mint,16.35]]){
  for(let side of [-1,1])column(px+side*1.1,pz,top-1.63,top+.21,.25,C.sky);
  beam(px-1.3,top,pz,px+1.3,top,pz,.25,C.navy);
  const key=template('little-pail'+co,()=>{
   oval(0,-.69,0,.58,.58,.24,co,'wet',.25);
   for(let k=0;k<6;k++){const r=.60+k*.075;ellipseRing(0,-.55+k*.25,0,r,r,.25,.25,k===5?C.white:co,'wet',.25)}
  });
  const tip=t=>{const q=frac(t/period)*period;return 1.34*smooth(8.2,8.8,q)*(1-smooth(9.6,10.5,q))};
  actor(key,(t,o)=>{o.position.set(px,top,pz);o.rotation.x=tip(t)});
  pulseCurtain(px,pz+.88,top-1.5,top+.63,1.3,.66,8.26,9.53,period,t=>{const a=tip(t);return [top+.63*Math.cos(a)-.88*Math.sin(a),pz+.63*Math.sin(a)+.88*Math.cos(a)]});
  column(px-1.4,pz-1.4,top-1.6,top+2.2,.25,C.mint);box(px-.75,top+2.2,pz-1.4,1.5,.25,.25,C.mint);
  jet(px,top+2.14,pz-1.38,0,-.18,1.55,.72,16,.05,.125);
 }
 for(const [px,pz,h,dir] of [[-108.2,72.2,5.8,1],[-84.6,74.4,6.2,-1]]){
  column(px,pz,h-1.5,h,.42,C.white);box(px,h+.16,pz,.85,.65,.8,C.yellow);
  beam(px,h+.36,pz,px+dir*.92,h+.84,pz+1.32,.38,C.coral,'wet',.25);
  jet(px+dir*.92,h+.84,pz+1.32,dir*1.9,3.8,4.1,1.37,39,.08,.18,3,px*.3);
 }
 for(let k=0;k<2;k++){const px=-124+k*55,pz=80-k*10;orb(px,1.58,pz,1.49,1.01,1.9,k?C.sky:C.mint);orb(px,2.51,pz+1.18,.85,.76,.91,k?C.sky:C.mint);for(let s of [-1,1])box(px+s*.6,2.72,pz+1.68,.27,.3,.22,C.ink,'solid',.125);box(px,2.1,pz+2.05,1,.32,.57,C.butter);jet(px,2.43,pz+2.0,0,3.8,2.8,.98,24,.09,.21)}
 for(let j=0;j<5;j++){jet(-102+j*2.9,.65,90,0,4.1,0,.77,16,.13,.19,3,j*.48)}
 for(let j=0;j<3;j++){let px=-122+j*15.5;cabana(px,99.3,[C.sky,C.butter,C.pink][j],.8);bench(px+4.65,96.5,.75)}
 attractionBoard(-71.5,.75,92,'12','泡泡戏水城','SPLASH CASTLE','#db8d87',6.8);
}


function awning(x,y,z,w,d,c,dir=1){
 const n=Math.max(5,Math.round(w/1.05));for(let j=0;j<n;j++){const xx=x-w/2+(j+.5)*w/n,col=j%2?C.snow:c;
 for(let k=0;k<5;k++)box(xx,y-k*.16,z+dir*(k+.5)*d/5,w/n,.30,d/5+.12,col);
 box(xx,y-.96,z+dir*d,w/n,.62,.28,col);box(xx,y-1.29,z+dir*d,w/n-.27,.20,.29,col,'solid',.125)}
}
function shopIcon(type,x,y,z){
 if(type===0){for(let j=0;j<10;j++){const r=.47+j*.143;oval(x,y+.18+j*.31,z,r,r,.37,j%3===0?0xd39b68:0xe6bc80)}
 for(let j=0;j<6;j++){let r=2.25-j*.31;orb(x+.22*Math.sin(j),y+3.15+j*.61,z+.18*Math.cos(j),r,r*.56,r,j%2?0xffd6ce:0xffb2b6,'wet',.5)}box(x+.35,y+6.66,z,.65,.65,.65,C.coral,'wet');
 }else if(type===1){for(let j=0;j<10;j++){let r=1.29+j*.077;oval(x,y+j*.4+.22,z,r,r,.45,j===2||j===7?C.snow:0xffac54)}oval(x,y+4.28,z,2.25,2.25,.47,C.white);beam(x+.3,y+4.5,z,x+1.21,y+7.48,z,.48,C.pink,'solid',.25);faceHoop(x-1.29,y+4.8,z+.32,1.39,.28,.48,C.yellow);orb(x-1.29,y+4.8,z+.32,1.05,1.03,.31,C.butter);
 }else if(type===2){oval(x,y+.65,z,2.46,2.46,1.05,0xf0ba74);oval(x,y+1.38,z,2.6,2.55,.62,0x97715e);box(x,y+1.8,z,4.6,.38,4.5,C.yellow);oval(x,y+2.16,z,2.65,2.65,.5,C.coral);for(let j=0;j<10;j++){const a=j*TAU/10;box(x+Math.cos(a)*1.75,y+2.58,z+Math.sin(a)*1.75,1.5,.45,1.5,0x94c875)}for(let j=0;j<6;j++){let r=2.52*Math.sqrt(Math.max(.01,1-(j/6)**2));oval(x,y+2.85+j*.29,z,r,r,.34,0xeaba77)}for(let j=0;j<7;j++)box(x+rnd(-1.4,1.4),y+4.21,z+rnd(-1.3,1.3),.28,.19,.53,C.cream,'solid',.125);
 }else if(type===3){oval(x,y+.65,z,2.35,2.35,1,0x91cbd9);oval(x,y+1.35,z,2.6,2.6,.52,C.ice);orb(x,y+2.25,z,2.24,1.63,2.2,0xffb9cc);orb(x-.52,y+3.9,z,.52,.56,.5,C.coral);beam(x+1.85,y+2.25,z-.55,x+2.9,y+5.65,z-.65,.36,C.yellow);
 }else if(type===4){for(let j=0;j<2;j++){const px=x-1.25+2.5*j;beam(px-.4,y,z,px+.75,y+5.65,z,.32,C.wood);for(let k=0;k<3;k++)box(px-.1+k*.25,y+1.2+k*1.18,z,1.55,.89,1.3,[C.coral,C.yellow,0xc78661][(j+k)%3],'wet')}}
 else{faceHoop(x,y+2.85,z,2.65,.95,1.26,C.coral);for(let j=0;j<4;j++){const a=.785+j*PI*.5;box(x+Math.cos(a)*2.25,y+2.85+Math.sin(a)*2.25,z,1.03,1,1.4,C.white)}}
}
function foodShop(x,z,kind,dir){const cols=[C.pink,C.orange,C.butter,C.sky,C.coral,C.mint],co=cols[kind],y=.9,w=11.75,d=7.75;
 slab(x,z,w+1.25,d+1.15,.72,y+.43,C.cream);slab(x,z,w,d,y+.44,y+5.57,C.white);slab(x,z,w+.75,d+.64,y+5.45,y+5.97,co);slab(x,z,w+1.15,d+1,y+5.97,y+6.28,C.snow);
 const fz=z+dir*d/2,ren=['GELATO','CITRUS BAR','SUN BUNS','ICE POP','BAY GRILL','SEASIDE'];
 for(let s of [-1,1]){const zz=z+s*d/2;box(x,y+2.65,zz+s*.13,w-1,.85,.26,co);box(x,y+3.08,zz+s*.31,w-.9,.28,.7,C.cream);box(x,y+4.05,zz+s*.15,w-1.35,1.77,.30,0x81c7d0,'wet');
 for(let k=0;k<4;k++)box(x-4.8+k*3.25,y+4.0,zz+s*.34,.25,1.89,.27,C.white);
 for(let k=0;k<4;k++)box(x-4.1+k*1.62,y+3.44,zz+s*.55,.66,.59,.45,[C.cream,C.sky,C.pink,C.yellow][(k+kind)%4],'solid',.125)}
 awning(x,y+5.08,fz,w+.42,2.6,co,dir);
 box(x,y+6.73,z+d*.35,w-.52,1.80,.65,C.white);lettering(x,y+6.75,z+d*.35+.34,w-.81,1.5,ren[kind],'',['#c97f95','#d49349','#ad8655','#5499b7','#c47762','#4c9d89'][kind]);
 shopIcon(kind,x,y+6.4,z-.5);
 for(let s of [-1,1]){box(x+s*w/2,y+2.7,z,.25,3.35,d-1.1,co);box(x+s*(w/2+.16),y+3.14,z,.19,2.18,d-1.8,0x97cbd2,'wet',.125);for(let j=0;j<3;j++)box(x+s*(w/2+.27),y+3.57+j*.42,z,.37,.20,d-1.45,C.white,'solid',.125)}
 box(x+w/2+.85,y+1.35,fz+dir*2.5,1.55,2.3,.5,C.wood);box(x+w/2+.85,y+1.35,fz+dir*2.5+.28,1.22,1.94,.125,C.navy,'solid',.125);for(let j=0;j<4;j++)box(x+w/2+.85,y+.92+j*.3,fz+dir*2.5+.36,.8-j*.08,.125,.125,C.cream,'solid',.125);
}
foodShop(71.5,63.8,0,1);foodShop(96,64,1,1);foodShop(120.5,63.9,2,1);foodShop(81.8,90.5,3,-1);foodShop(105.5,90.5,4,-1);foodShop(130.5,89.5,5,-1);
function cafeSet(x,z,c,base=.8){
 column(x,z,base,base+1.14,.32,C.teak);oval(x,base+1.24,z,1.31,1.31,.25,C.white,'solid',.25);umbrella(x,z,2.25,c,base);
 for(let a=0;a<4;a++){const dx=Math.cos(a*PI/2),dz=Math.sin(a*PI/2),xx=x+dx*1.8,zz=z+dz*1.8;
 box(xx,base+.71,zz,.98,.25,.98,c);for(let sx of [-1,1])for(let sz of [-1,1])box(xx+sx*.35,base+.31,zz+sz*.35,.125,.63,.125,C.teak,'solid',.125);box(xx+dx*.47,base+1.18,zz+dz*.47,dx?.21:.96,.87,dz?.21:.96,c,'solid',.125)}
}
deck(143.25,65,14,24,1.4);for(let j=0;j<3;j++)cafeSet(143,57.5+j*7.5,[C.sky,C.yellow,C.pink][j],1.6);
for(let j=0;j<3;j++){cafeSet(77+j*23.5,78.8,[C.pink,C.mint,C.yellow][j]);planter(68+j*24,82.4,4,2.05,.64,C.pink,.75)}
for(let x of [63,89,113.25,136.5])palm(x,72.8,rnd(8.4,11.25),.81);
for(let x of [69.5,93.25,118,142]){palm(x,96.75,rnd(8.5,11.6),.9);planter(x,99.1,6.5,2.25,.47,C.pink,.75)}
for(let j=0;j<3;j++){let x=65+j*26;column(x,76.7,.75,7.6,.31,C.wood);if(j<2)pennants(x,7.4,76.7,x+26,7.4,76.7,11,.97)}
{
 const x=57.6,z=88.5,y=.84;
 for(let dx of [-3.66,3.6])for(let dz of [-1.8,1.8]){faceHoop(x+dx,y+1.01,z+dz,.99,.54,.65,C.ink);orb(x+dx,y+1.01,z+dz,.51,.51,.40,C.white,'wet',.25)}
 box(x,y+1.9,z,10.75,1.6,4,C.mint);box(x-1.5,y+3.9,z,7.7,2.9,4.15,C.cream);box(x-1.5,y+5.42,z,8,.45,4.45,C.mint);box(x+3.9,y+2.9,z,2.75,1.65,3.8,C.mint);box(x+3.75,y+4.07,z,2.2,1.35,3.8,C.glass,'wet');box(x+3.55,y+4.85,z,2.85,.35,4.25,C.white);box(x-1.3,y+3.9,z+2.16,5.75,1.75,.25,C.navy);awning(x-1.35,y+5.1,z+2.1,6.7,1.35,C.pink);box(x-1.3,y+2.95,z+2.36,6.4,.27,1.17,C.white);
 for(let s of [-1,1])box(x+5.15,y+2,z+s*1.45,.45,.55,.65,C.butter);
 lettering(x-1.5,y+1.9,z+2.095,6.9,1.0,'I C E   C R E A M','','#67b9a5');
 for(let j=0;j<5;j++){let r=.32+j*.13;oval(x-2,y+5.9+j*.34,z,r,r,.37,0xd7a271)}orb(x-2,y+7.55,z,1.23,1.07,1.23,C.pink,'wet',.25);
}
function aidPoint(x,z){
 storey(x,z,6.2,4.25,.75,3.35,C.mint);box(x,4.9,z,2.75,1.04,.85,C.coral);box(x,4.9,z,1,2.8,.85,C.coral);lettering(x,3.58,z+2.43,5.75,.80,'F I R S T   A I D','','#52a799');
 for(let s of [-1,1]){box(x+s*4,.75+1.02,z,1.2,2.04,1,C.ice);box(x+s*4,2.85,z,1.4,.26,1.2,C.white);box(x+s*4,2.98,z+.2,.36,.48,.41,C.metal)}
}
aidPoint(-56,66);aidPoint(69,-13);
for(let s of [-1,1]){for(let j=0;j<4;j++)palm(s*(66.6+j*.6),6+j*9.55,8.45+j*.4,.82);for(let j=0;j<3;j++){let xx=s*(27+j*10);rosette(xx,36.4,1.3,0x77b481,.75)}}
for(let i=0;i<16;i++){const x=-143+i*18.1,z=-107+rnd(-2,2);palm(x,z,rnd(8.5,13.5),rnd(.88,1.04))}
function waypost(x,z,a,b){
 const y=terrainY(x,z);column(x,z,y,y+3.9,.40,C.wood);box(x-.45,y+3.55,z,3.65,.83,.38,C.blue);box(x+.65,y+2.65,z,4.0,.83,.38,C.butter);
 lettering(x-.45,y+3.55,z+.211,3.55,.72,a,'','#2992a9');lettering(x+.65,y+2.65,z+.211,3.91,.72,b,'','#f3cc66','#3a7180');
}
waypost(12.4,58,'←  戏水城','餐饮街  →');waypost(-60.6,35,'←  暖泉花园','造浪池  →');waypost(66.5,28.6,'←  沙滩','冲浪场  →');waypost(117,-32.5,'←  晴空塔','飞潮滑道  →');
for(let x=-55;x<55;x+=.5){
 const z=waveShore(x);if(Math.abs(x)>.55*z+43.35)continue;
 addWaterCell(x,z-.60,x+.5,z+3.60,24,.775,.05);
}
waterFinish();
