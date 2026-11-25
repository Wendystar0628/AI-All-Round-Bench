'use strict';
function boulder(x,z,rx,rz,h,y=terrainY(x,z),moss=true){
 const riverZ=-42+riverWarp(-45);
 if(x+rx>-57&&x-rx< -33&&y<7.4&&Math.abs(z-riverZ)<5+rz*1.32){
  z=riverZ+(z<riverZ?-1:1)*(5+rz*1.32);
 }
 if(rideFootprint(x,z,0)||!clearOfTracks(x,z,y,y+h,Math.max(rx,rz)))return;
 const c=choice([0xc9c2af,0xc2bdac,0xcac4b4,0xb7b8aa,0xd8cdb7]),sx=rnd(-.35,.35),sz=rnd(-.32,.32),N=Math.max(3,Math.ceil(h/.68)),size=.75;
 for(let j=0;j<N;j++){const q=(j+.5)/N,t=Math.min(1,Math.pow(Math.max(.03,1-((q-.39)/.64)**2),.38)),zz=z+sz*rz*q,xx=x+sx*rx*q;
 const n=Math.ceil(2*rz*t/size);for(let a=0;a<n;a++){const u=(a+.5)/n*2-1,r=rx*t*Math.pow(Math.max(0,1-Math.abs(u)**2.8),1/2.8),v=zz+u*rz*t,w=.25*Math.sin(a*.83+j*.47);
 const shade=tinted(c,.95+.067*q+Math.floor(q*3)*.009+w*.040);
 box(xx+w,y+(j+.5)*h/N,v,r*2,h/N,rz*t*2/n,shade);
 if(j===N-1&&moss)box(xx+w,y+h+.095,v,r*1.92,.25,rz*t*2/n,0x96b979)}}
 if(moss&&rx>2.4)rosette(x+sx*rx,z+sz*rz,rx*.38,0x7baa68,y+h+.2);
}
// Limestone buttresses and fern pockets between the mountain's launch terraces.
for(const [x,z,w,d,h] of [[-57,-50,4.2,3.5,5.2],[-54,-53,4,3,6.5],[-59,-57,3.5,3.5,4.4],[-38,-47,4.5,3,5.5],[-32,-51,3.7,2.75,3.5],[-57,-68,4.3,3.7,6.7],[-40,-69,3.4,3.6,4.7],[64,-65,4,3.7,6.5],[73,-64,4,2.8,5],[59,-58,3,2.5,3.75],[-141,-71,4.1,4.75,6],[-115,-96,4.5,4,4.7],[-4,-100,4,3.4,5.5],[32,-94,4.1,3.75,6.25]])boulder(x,z,w,d,h);
for(let side of [-1,1]){for(let j=0;j<4;j++){const x=-44+side*(5.8+j*.55),z=-34.7-j*1.85;boulder(x,z,2.35+j*.33,2.1,3.6+j*.75,.65);shrub(x+side*1.5,z-1.25,2.3,2.0,choice(shrubCols),4.5+j*.7,j%3===0?C.pink:0)}}
for(let j=0;j<20;j++){
 const f=j/19,x=mix(-48,-44.6,f),z=mix(-60,-34.8,f),h=mix(11.25,9.85,f);
 box(x,h,z,6.7,.35,1.6,j%4===0?0x94e0d8:0x6acbd0,'wet');
 for(let side of [-1,1]){const xx=x+side*(3.65+.35*Math.sin(j));box(xx,h-.4,z,.75,1.3,1.55,choice(cliff));if(j%3===0)rosette(xx+side*.35,z,.8,0x7db977,h+.13)}
}
for(let j=0;j<82;j++){const x=rnd(-143,145),z=rnd(-101,-57),y=terrainY(x,z);if(y<1.5||Math.abs(x+46)<7||Math.abs(x)<10&&z<-79)continue;const r=rnd(.9,2.3);boulder(x,z,r,r*rnd(.65,.93),r*rnd(.5,1.4),y-.25,j%4!==0);if(j%2===0)shrub(x+r,z+.6,1.75,1.8,choice(shrubCols),y,j%6===0?0xe797a0:0)}
// Planting beds curve around the welcome lawn; pale edging is stepped on the voxel grid.
function gardenIsland(x,z,rx,rz,flowers){
 oval(x,.96,z,rx,rz,.45,C.white);oval(x,1.22,z,rx-.45,rz-.45,.25,0x9fc77d);
 const n=Math.ceil(rx*1.6);for(let i=0;i<n;i++){const q=i/n*TAU,rr=rnd(.65,.85),xx=x+rx*rr*Math.cos(q),zz=z+rz*rr*Math.sin(q);shrub(xx,zz,rnd(.65,1.24),rnd(.6,1.08),choice(shrubCols),1.25,i%4?flowers:0)}
}
gardenIsland(-50.6,124.8,18.5,5.3,0xf6949b);gardenIsland(39.2,115.4,10.75,6.3,0xffc966);
palm(39.8,114.5,13.2,.95,1.35);palm(42.6,116.4,9.55,.76,1.35);
boulder(35.4,113.75,2.7,2.1,2.7,1.35,false);rosette(36.6,117.6,1.95,0x69a878,1.35);
for(let j=0;j<8;j++)rosette(-65+j*4.0,122.1,1.20,choice([0x73ae70,0x86b981,0x9ab974]),1.34);
function lawnLetters(){
 const pix=document.createElement('canvas');pix.width=160;pix.height=31;const g=pix.getContext('2d');g.fillStyle='#fff';g.font='900 32px "Arial Black",Arial,sans-serif';g.textBaseline='middle';g.fillText('SKY BAY',1,16,156);const A=g.getImageData(0,0,160,31).data,step=.25,sx=-68.25,sy=2.05,sz=126.25;
 for(let j=0;j<31;j++)for(let i=0;i<160;){if(A[(j*160+i)*4+3]<115){i++;continue}let n=1;while(i+n<160&&A[(j*160+i+n)*4+3]>=115)n++;
 box(sx+(i+n/2)*step,sy+(30-j)*step,sz,n*step,step,1.0,C.deep);box(sx+(i+n/2)*step,sy+(30-j)*step,sz+.57,n*step,step,.25,C.white);i+=n}
}
lawnLetters();
function lamp(x,z,h=6.2,sign=1,base=terrainY(x,z)){
 box(x,base+.24,z,.95,.48,.95,C.cream);column(x,z,base+.4,base+h,.32,C.deep);
 beam(x,base+h-.3,z,x+1.25*sign,base+h+.4,z,.22,C.deep,'solid',.25);box(x+sign*1.4,base+h+.42,z,1.3,.26,.92,C.blue);box(x+sign*1.4,base+h+.19,z,.96,.23,.68,0xffefc1,'solid',.125);
}
for(let x of [-1,1]){for(let j=0;j<4;j++)lamp(x*12.3,112+j*17,6.8,-x,.75);lamp(x*25,86,5.8,-x,1.75);lamp(x*20,54,5.6,-x,.75)}
for(let i=0;i<9;i++)box(-8+i*2,.82,111.0,1.05,.125,3.65,0xf1ebcf,'solid',.125);
for(let z=121;z<181;z+=6)box(0,.83,z,.30,.125,3.1,0xeecc73,'solid',.125);
for(let j=0;j<56;j++){const side=j%2?1:-1,x=side*rnd(23,75),z=rnd(113,166);if(coastDist(x,z)>-5||Math.abs(x+50.6)<20&&Math.abs(z-124.8)<8||Math.abs(x-39)<12&&Math.abs(z-115)<9)continue;
 let r=rnd(1.2,2.4);shrub(x,z,r,r*rnd(.8,1.2),choice(shrubCols),terrainY(x,z),j%3===0?0xf49098:0);if(j%4===0)boulder(x+1.45,z+.5,1.9,1.45,1.3,terrainY(x,z)-.3,false);rosette(x-.9,z-.4,r*.73,0x8cbc75)}
for(let j=0;j<140;j++){let x=rnd(-153,153),z=rnd(-33,102);if(terrainY(x,z)<.4||Math.abs(riverDist(x,z))<11||waterKind(x,z,riverDist(x,z)))continue;
 if((Math.abs(x)>148)||(x>57&&x<66&&z>49&&z<100)||(x< -127&&x> -142&&z>52&&z<99)||(x>-67&&x<-54&&z>54&&z<95)){
 const r=rnd(.85,1.74);shrub(x,z,r,r*1.2,choice(shrubCols),terrainY(x,z),j%5===0?C.butter:0);rosette(x+.85,z+.53,r*.78)}}
// Small support facilities are incorporated into the walkways.
for(let k=0;k<6;k++){const x=[-64,65,-128,119,60,-79][k],z=[17,15,31,40,95,-32][k],y=terrainY(x,z);lamp(x,z,5.8,k%2?-1:1,y);bench(x+1.6,z+2.5,y);box(x+4.0,y+.79,z+2,1,1.57,1,C.deep);box(x+4,y+1.64,z+2,1.12,.19,1.12,C.white,'solid',.125);box(x+4,y+1.75,z+2,.64,.125,.6,C.ink,'solid',.125)}


function hillWalk(points){
 const route=tablePath(spline(points.map(p=>[p[0],0,p[1]])),.55),height=route.p.map(p=>Math.max(1.15,terrainY(p.x,p.z)+.39));
 for(let j=1;j<=route.n;j++)height[j]=Math.max(height[j],height[j-1]-.29);
 for(let j=route.n-1;j>=0;j--)height[j]=Math.max(height[j],height[j+1]-.29);
 for(let j=0;j<=route.n;j++){const p=route.p[j],r=route.r[j],y=snap(height[j]);for(let k=-2;k<=2;k++)box(p.x+r.x*k*.54,y,p.z+r.z*k*.54,.79,.3,.81,j%3===1?C.wood:0xe5c69b);
 for(let sign of [-1,1]){const xx=p.x+sign*1.42*r.x,zz=p.z+sign*1.42*r.z;if(j%4===0)column(xx,zz,y-.2,y+1.35,.20,C.white);box(xx,y+1.35,zz,.25+Math.abs(route.t[j].x)*.5,.25,.25+Math.abs(route.t[j].z)*.5,C.white,'solid',.125)}
 if(j%6===0)column(p.x,p.z,terrainY(p.x,p.z)-.25,y,.55,C.teak)}
}
hillWalk([[-38,-50],[-35,-63],[-30,-71],[-26,-82],[-17,-91],[-10,-92]]);
hillWalk([[-144,-55],[-144,-66],[-140,-84],[-125,-94],[-112,-95],[-100,-89]]);
hillWalk([[120,-52],[117,-64],[113,-74],[101,-82],[99,-90],[90,-89]]);
mat.glow=new T.MeshBasicMaterial({color:0xf5ffff});
{
 const centre=-42+riverWarp(-45);
 for(let j=0;j<2;j++){
  const light=new T.PointLight(j?0xba9af5:0x54d6f2,12,13,2);
  light.position.set(-51.5+j*12,3.85,centre+(j?2.9:-3.3));scene.add(light);
 }
 for(let j=0;j<10;j++)for(let side of [-1,1]){
  const x=-54+j*1.95,z=centre+side*4.90,co=[0x56d8f0,0x80dde5,0xb099e2][(j+(side>0?1:0))%3];
  box(x,3.86,z,1.65,.22,.24,co,'glow',.125);
  if(j%3===0){for(let k=0;k<9;k++){const u=(k+.5)/9,r=.16+.84*Math.sin(Math.PI*u)**.6;
   box(x+.31*u,1.14+u*2.25,z-side*.34,r,.31,r*.76,k<5?co:0xc5f3f6,'glow',.125)}}
 }
}
for(let j=0;j<6;j++){const x=-52+j*3.1,z=-42+riverWarp(-45),s=j%2?1:-1,zz=z+s*4.85,h=2.15+(j%3)*.42,c=[0x7debf4,0xcfadee,0x85e3d0][j%3];for(let k=0;k<7;k++){const w=1.2*Math.sin((k+.6)/7.1*PI)+.25;box(x+k*.09,1.1+k*h/7,zz,w,h/7+.1,w*.83,c,'glow')}box(x+.25,1.24,zz-s*.5,.55,.86,.66,0xcdf4ef,'glow')}
for(let j=0;j<175;j++){
 const baseX=-52.7+105.4*(j+rnd(.12,.87))/175,scale=rnd(.40,1.25),ph=rnd(0,TAU),trail=j%4===0?rnd(.41,.77):rnd(.88,1.02);
 actor('froth',(t,o)=>{
  const x=baseX+.12*Math.sin(t*.87+ph),reach=beachRunup(x,t),active=smooth(.08,.64,reach);
  const z=waveShore(x)+reach*trail-.07;
  o.position.set(x,.795+.006*Math.cos(t+ph),z);o.scale.set(scale*(.71+.29*active),.25,.20+.16*active);
  o.userData.opacity=active*(.66+.27*Math.sin(t*.81+ph));
 });
}
// Brief crests of airborne spray form only while the swell is breaking in shallow water.
for(let k=0;k<wavePacket.length;k++){const crest=wavePacket[k];
 for(let j=0;j<40;j++){const x=-51+102*(j+rnd(.1,.9))/40,z=waveShore(x)-rnd(.65,1.58);
  const born=crest.start+waveTravel(z+30,waveShore(x)+30)+waveBend(x)-rnd(.03,.18);
  const y=waveY(x,z,born)+.04,vy=rnd(1.55,2.25)*Math.sqrt(crest.height);
  const life=(vy+Math.sqrt(Math.max(.02,vy*vy+22.8*(y-.78))))/11.4;
  jet(x,y,z,rnd(-.45,.45),vy,rnd(1.20,2.15),Math.max(.22,life),5,.13,.15,5,born,wavePeriod);
 }
}
// The Flowrider has a fixed standing wave, with water travelling over its crest.
for(let j=0;j<91;j++){const x=83.6+j*.225,fracX=j/91,z=-5.85+.62*Math.cos(fracX*TAU),Y=1.55+4.45*(15-z)/26+1.3*Math.exp(-((z+6.1)**2)/5.8);
 for(let k=0;k<4;k++)box(x,Y+.13+k*.13,z-.4+k*.22,.32,.28,.56,k>1?C.ice:0x62cddc,'wet',.125);
 const ph=rnd();actor('froth',(t,o)=>{const u=frac(t*1.35+ph);o.position.set(x,Y+.59+.12*Math.sin(u*PI),z+.19-.68*u);o.scale.set(.41*(1-u*u),1.45*(1-u),.52*(1-u*u))})}
for(let i=0;i<28;i++){const x=rnd(-53,53),z=30-.0035*x*x+rnd(1.4,6.0);if(Math.abs(x)<7)continue;const co=choice([0xe9cfa1,0xf0d6a5,0xf6e9c9]);box(x,.807,z,rnd(.21,.58),.125,rnd(.14,.33),co,'solid',.125)}


function ridePlate(x,y,z,w,num,title,sub,icon,colorName){
 const h=w*.40;for(let s of [-1,1])column(x+s*w*.36,z,y-.65,y+h*.52,.23,C.white);
 box(x,y+h*.51,z,w+.28,h+.23,.32,C.white);
 plaque(x,y+h*.51,z+.21,w,h,(g,W,H)=>{
 g.fillStyle='#fff8e7';g.fillRect(0,0,W,H);g.fillStyle=colorName;g.beginPath();g.roundRect(H*.06,H*.07,H*.86,H*.86,H*.14);g.fill();g.save();g.translate(H*.49,H*.48);g.scale(H*.38,H*.38);g.lineWidth=.17;g.strokeStyle='#fffbed';g.fillStyle='#fffbed';g.lineCap='round';g.lineJoin='round';g.beginPath();
 if(icon===0){g.moveTo(-.44,-.76);g.lineTo(-.20,-.76);g.quadraticCurveTo(.08,-.67,.10,.2);g.quadraticCurveTo(.14,.65,.69,.65);g.stroke()}
 else if(icon===1){g.moveTo(-.82,.63);g.bezierCurveTo(.99,.63,.81,-.65,.15,-.65);g.bezierCurveTo(-.62,-.65,-.69,.62,.78,.62);g.stroke()}
 else if(icon===2){for(let k=0;k<3;k++){g.moveTo(-.8,.56-k*.42);g.bezierCurveTo(-.15,.77,.05,-.06-k*.4,.78,-.04-k*.4)}g.stroke()}
 else if(icon===3){g.moveTo(-.75,-.58);g.lineTo(.71,-.58);g.lineTo(.19,.29);g.lineTo(.19,.73);g.lineTo(-.19,.73);g.lineTo(-.19,.29);g.closePath();g.stroke()}
 else if(icon===4){g.arc(0,0,.62,0,TAU);g.stroke();g.beginPath();g.arc(0,0,.23,0,TAU);g.fill()}
 else{g.moveTo(-.84,.45);g.bezierCurveTo(-.45,.5,-.52,-.68,-.11,-.66);g.bezierCurveTo(.31,-.65,.22,.35,.82,.31);g.stroke()}
 g.restore();g.fillStyle='#427e8c';g.textAlign='left';g.font='800 '+H*.17+'px Arial';g.fillText(num+'  /  '+sub,H*1.04,H*.31,W-H*1.12);
 g.fillStyle='#215b69';g.font='900 '+H*.34+'px "Microsoft YaHei",sans-serif';g.fillText(title,H*1.025,H*.76,W-H*1.12);
 },0,384);
}
ridePlate(-5.55,61.05,-83.9,3.95,'04','疾速坠落','DROP',0,'#e69c64');
ridePlate(-8.3,60.5,-90.0,3.85,'05','日晕回环','HALO',1,'#d48faa');
ridePlate(3.95,46.8,-90.7,4.05,'07','双螺旋','TWINS',2,'#3da8bf');
ridePlate(14.1,46.65,-87.4,5.3,'06','彩虹竞速','SPRINT',2,'#dab04e');
ridePlate(-97.8,43.8,-85.5,4.0,'08A','日光漏斗','FUNNEL',3,'#e3a744');
ridePlate(-88.4,43.6,-85.7,3.85,'08B','珊瑚巨碗','BOWL',4,'#db929e');
ridePlate(-96.1,29.5,-83.4,3.7,'08C','月牙滑板','HALFPIPE',1,'#a293c8');
ridePlate(-99.3,43.5,-89.7,3.65,'08D','星际暗河','NOVA',4,'#737fa6');
ridePlate(79.4,35.3,-83.1,4.5,'09A','翡翠筏道','RAFT',4,'#66ae92');
ridePlate(87.8,34.9,-90.0,3.8,'09B','亲子滑道','DUO',1,'#b293bb');
ridePlate(63.35,20.1,-79.85,3.75,'09C','短波浪','RIPPLE',2,'#d4b853');
ridePlate(85.0,35.0,-94.75,4.1,'10','飞潮飞车','COASTER',5,'#e4a25c');
// Fluted corner piers, glazed fascias and sunbreaks unify the three towers.
for(let [towerInfo,co] of [[skyTower,C.blue],[westTower,C.coral],[eastTower,C.mint]]){
 const {x,z,width,top,base}=towerInfo,d=width*.86;
 for(let j=0;j<3;j++)box(x,top+4.65+j*.37,z+d/2+1.45,width+2.6-j*.3,.22,.85,j===1?C.white:co);
 for(let s of [-1,1]){const px=x+s*(width/2-.72),pz=z+d/2-.72;for(let j=0;j<2;j++)box(px+(j-.5)*.5,(top+base)/2,pz+.53,.20,top-base,.25,j?C.white:0x90cbd8,'solid',.125);
 box(px,top-2.05,pz+.43,1.45,3.5,.75,C.white);box(px,top-1.4,pz+.8,1.5,.6,.5,co)}
}
for(const level of [33.75,46,60.5]){box(-2,level-.33,-83.55,16.8,.80,1.45,C.white);box(-2,level-.58,-82.77,16.6,.30,.24,C.blue);for(let j=0;j<4;j++)box(-8.3+j*4.15,level-.35,-82.7,.98,.25,.28,C.yellow)}
box(-2,66.35,-90.5,7.2,2.45,5.5,C.white);box(-2,66.35,-87.65,6.55,1.0,.36,C.deep);for(let j=0;j<4;j++)box(-4.6+j*1.7,66.35,-87.4,.24,1.22,.24,C.white);
for(let k=0;k<3;k++)box(-2,67.55+k*.30,-91,9.4-.65*k,.30,7.3-k*.55,k===1?C.blue:C.ice);
