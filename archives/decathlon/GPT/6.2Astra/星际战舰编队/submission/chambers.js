const panel='#596b73',lined='#344852',floorC='#667a80',lamp='#aafff9';
function tileFloor(m,W,D){for(let x=-W/2;x<W/2;x+=16)for(let z=-D/2;z<D/2;z+=24)m.box(x+7.5,-2,z+11.5,15,4,23,[floorC,'#708186','#74848a','#63777e'][Math.floor(rnd()*4)]);m.box(0,-5,0,W,4,D,deep)}
function arch(m,z,W,H,accent=true){for(let k of [-1,1]){m.box(k*(W/2-2),H*.5,z,5,H,8,slate);m.box(k*(W/2-4),H*.32,z+1,4,H*.55,5,gray);for(let i=0;i<5;i++)m.box(k*(W/2-4-i*3),H-14+i*3,z,8,10,9,i%2?steel:gray);m.box(k*(W/2-14),H-4,z+5,13,3,1,accent?amber:lamp,.7)}m.box(0,H,z,W,7,9,slate);m.box(0,H-2,z+1,W*.61,3,4,pearl);m.box(0,H-4,z+1,W*.48,1,2,lamp,1.2)}
function consolePod(m,x,y,z,w){m.box(x,y+2,z,w-3,5,5,slate);m.box(x,y+6,z,w,3,9,gray);m.box(x,y+8,z-1,w-2,2,5,deep);m.box(x,y+10,z-3,w-1,4,2,coal);for(let i=0;i<w-3;i+=3){m.box(x-w/2+2+i,y+10,z-1,2,1+i%3,1,i%2?aqua:gold,.85);m.box(x-w/2+2+i,y+8,z+2,1,1,1,lamp,1.1)}}
function bridge(){let m=new Model();tileFloor(m,144,150);m.box(0,61,0,145,4,150,deep);
for(let k of [-1,1]){m.box(k*71,30,0,4,60,151,lined);m.box(k*57,5,0,27,10,148,panel);m.box(k*45,10,0,2,1,147,aqua,.7);m.box(k*61,15,0,21,8,147,slate);m.box(k*59,20,0,22,2,145,gray);for(let j=0;j<5;j++){let z=52-j*24;consolePod(m,k*49,10,z,12);consolePod(m,k*60,20,z-4,15);m.box(k*54,39,z-7,16,10,2,coal);m.box(k*54,40,z-5,13,6,1,'#2e8e9b',.35);for(let i=0;i<8;i++){let h=1+(i*3+j*2)%4;m.box(k*54-5+i,38+h/2,z-4,1,h,1,i%5===0?amber:aqua,.4)}
m.box(k*54,43,z-4,12,1,1,gray);m.box(k*54,51,z-7,1,15,2,steel)}}for(let z of [-65,-24,24,65])arch(m,z,143,59,false);
m.box(0,8,-72,144,16,6,slate);m.box(0,54,-72,143,9,6,gray);m.box(0,17,-72,137,2,4,lamp,.7);for(let x of [-47,47])m.box(x,36,-73,2,38,4,gray);
for(let i=0;i<4;i++)m.box(0,i*2+1,-8,42-i*4,2,48-i*4,i===3?pearl:panel);m.box(0,11,-8,28,5,34,coal);m.box(0,14,-8,26,1,32,'#3b9ba5',.5);for(let k of [-1,1]){
 shell(m,-21,18,53,6,5,slate,-8+k*14,0,1);shell(m,-18,15,49,3,4,gray,-8+k*14,0,1);
 m.box(0,47,-8+k*14,19,1,2,lamp,.8);m.box(k*18,53,-8,5,4,27,deep);
 for(let i=0;i<5;i++)m.box(k*17,50,-19+i*5,3,3,2,steel);
}label(m,'01',-67,49,-67,2,pearl);
// Bridge observation sill, transverse audience galleries and projected tactical plot.
m.box(0,55,-67,78,6,3,deep);label(m,'AURELIA',-22,57,-65,1,gray);
m.box(-11,14,9,6,1,3,orange);m.box(0,15,-8,21,1,24,'#254f60');
for(let k of [-1,1]){m.box(k*14,13,-7,2,3,32,gray);for(let i=0;i<7;i++){m.box(k*15,14,-18+i*4,2,1,2,i%3?aqua:amber,.5)}
for(let j=0;j<4;j++){let z=45-j*25;for(let n=0;n<5;n++){m.box(k*(39+n),10+n,z,2,2,11,gray)}m.box(k*41,19,z+8,2,9,2,slate);m.box(k*41,23,z,2,1,17,steel);m.box(k*65,47,z,8,3,13,panel)}}
for(let j=0;j<6;j++){m.box(-21+j*8,59,0,4,3,116,lined);m.box(-21+j*8,57,37,2,1,11,lamp,.7)}
// Slender suspended lateral instruments flank the central navigational volume.
for(let k of [-1,1]){
 const x=k*28,z=-28;
 m.box(x,46,z,2,20,2,steel);m.box(x,34,z,21,13,3,slate);
 m.box(x,34,z+2,19,11,1,coal);m.box(x-4,37,z+3,8,1,1,aqua,.65);
 for(let i=0;i<6;i++){m.box(x-7+i,31+i%3,z+3,1,2,1,aqua,.65);m.box(x+2+i,37-i%2,z+3,1,1,1,gold,.5)}
 m.box(x+4,32,z+3,5,1,1,steel);m.box(x+2,30,z+3,8,1,1,aqua,.4);
 for(let j=0;j<3;j++){let xx=k*(30+j*4);m.box(xx,16,-62,3,4,19,gray);m.box(xx,19,-60,2,1,10,lamp,.6)}
}
return m.bake(2)}const command=bridge();
const hologram=new Model();
// Miniature twin-rail flagship and escorts, suspended in a common chart volume.
shell(hologram,-13,12,0,2,3,'#3892a0',0,0,1);
shell(hologram,-11,4,2,2,2,'#79c7cf',0,0,1);
for(let k of [-1,1]){
 shell(hologram,-13,3,0,2,2,'#66b8c2',k*5,-k,1);
 shell(hologram,3,16,0,2,1,'#81cfd1',k*3,-k,1);
 hologram.box(-10,2,k*5,3,1,3,'#a0f2ed');
 for(let j=0;j<4;j++){let z=k*(9+j%2*4),x=-12+j*8;hologram.box(x,k+j%2,z,4,1,1,'#8ed8d7');hologram.box(x-1,k+j%2,z,2,1,3,'#468d9c')}
}
hologram.bake();
function coreHall(){let m=new Model();m.box(0,-5,0,256,8,256,deep);m.box(0,255,0,256,8,256,deep);
for(let k of [-1,1]){m.box(k*127,124,0,4,252,253,lined);m.box(0,124,k*128,254,252,4,lined)}
for(let j=0;j<6;j++){let y=6+j*45;for(let k of [-1,1]){m.box(k*110,y,0,36,8,250,steel);m.box(0,y,k*109,188,8,34,gray);m.box(0,y-5,k*91,186,3,3,bronze);m.box(0,y-6,k*89,177,1,2,amber,.8);m.box(k*90,y-3,0,2,2,183,aqua,.7);for(let i=-4;i<=4;i++){m.box(i*20,y+8,k*94,2,9,2,steel);m.box(k*94,y+8,i*20,2,9,2,steel);m.box(k*123,y+20,i*27,6,31,11,panel);m.box(i*27,y+20,k*123,11,31,6,panel);m.box(i*27,y+21,k*119,2,15,1,i%3?steel:amber,.5)}m.box(0,y+12,k*94,186,2,2,gray);m.box(k*94,y+12,0,2,2,183,gray)}
if(j===1||j===4)for(let k of [-1,1])for(let i=0;i<8;i++){m.box(k*(92-i*9),y+i*2,-29,12,11,14,i%3===0?bronze:gray);m.box(k*(92-i*9),y+i*2+6,-29,10,1,3,amber,.7)}
}label(m,'CORE',-60,172,-118,4,gray);label(m,'02',47,173,-118,4,bronze);
return m.bake(3)}const atrium=coreHall();
// A suspended lenticular reaction mass sits in the middle of two helical feed paths.
const spindle=new Model();
for(let j=0;j<61;j++){
 let y=j*4,dist=Math.abs(y-121),waist=3+Math.max(0,1-dist/34)*15;
 let lobes=Math.max(0,1-Math.abs(dist-89)/20)*6,r=Math.round(waist+lobes),h=4;
 for(let x=-r;x<=r;x+=2){
  let w=Math.max(1,Math.round(2*r*Math.sqrt(Math.max(0,1-(x/(r+.4))**2))));
  spindle.box(x,y,0,2,h,w,j%8===0?'#ffd58a':j%4===0?'#ffbd5f':'#f79934',.60);
 }
 for(let k=0;k<3;k++){
  let a=j*.117+k*TAU/3,orbit=15+Math.cos(j*.12)*3,xx=Math.cos(a)*orbit,zz=Math.sin(a)*orbit;
  spindle.box(xx,y,zz,5,4,5,j%6===0?bronze:slate);spindle.box(xx*1.06,y+1,zz*1.06,3,2,3,j%3?aqua:amber,.55);
 }
}
spindle.bake();
function rotor(big){
 let m=new Model(),r=big?38:28;
 // Three separated armour segments enclose a thinner inner bearing.
 for(let i=0;i<84;i++){
  let a=i*TAU/84,x=Math.cos(a),z=Math.sin(a);
  m.box(x*(r-5),-3,z*(r-5),4,3,4,steel);
  if(i%28<22){let rise=Math.floor((i%28)/7);
   m.box(x*r,rise,z*r,5,big?6:4,5,deep);
   m.box(x*(r+2),rise+3,z*(r+2),4,2,4,i%28<5?orange:pearl);
   if(i%2===0)m.box(x*(r-1),rise-2,z*(r-1),3,1,3,amber,.8);
  }
  if(i%28===4||i%28===20){m.box(x*(r+3),0,z*(r+3),5,12,5,steel);m.box(x*(r+3),7,z*(r+3),4,2,4,aqua,.6)}
 }
 return m.bake()
}
const collar=rotor(false),greatCollar=rotor(true);
function hangar(){let m=new Model();tileFloor(m,132,360);m.box(0,54,0,134,5,360,coal);
for(let k of [-1,1]){m.box(k*66,26,0,4,53,360,lined);m.box(k*20,1,0,1,1,356,ivory);m.box(k*18,1,0,1,1,356,gold);for(let j=0;j<8;j++){let z=152-j*44;m.box(k*45,1,z,34,2,32,slate);m.box(k*45,2,z,28,1,26,panel);for(let a of [-1,1]){m.box(k*45,3,z+a*12,25,1,1,pearl);m.box(k*57,4,z+a*9,3,2,3,amber,.8)}m.box(k*63,15,z,4,24,33,deep);m.box(k*63,31,z,6,6,36,pearl);m.box(k*61,27,z,2,2,28,lamp,1);m.box(k*55,37,z+13,20,4,4,bronze);m.box(k*47,33,z+13,4,10,4,steel);m.box(k*45,28,z+11,8,3,5,gray);m.box(k*19,1,z,2,1,12,aqua,.8);m.box(k*32,1,z+17,12,1,2,ivory)}}
for(let j=0;j<7;j++){let z=148-j*50;arch(m,z,132,51);if(j%2===0){m.box(0,39,z,125,5,7,gray);m.box(0,42,z,124,3,5,deep);for(let i=-7;i<=7;i++)m.box(i*8,44,z,1,5,2,steel);m.box(0,46,z,122,1,2,pearl);m.box(-30,36,z+5,36,7,1,bronze);label(m,'B-'+(j/2+1),-39,39,z+6,1,ivory)}}
m.box(-53,24,-178,25,48,8,gray);m.box(52,24,-178,26,48,8,gray);m.box(0,47,-178,130,9,9,gray);label(m,'03',-63,34,-173,2,deep);// Recessed panel doors, berth stencils, structural trusses and docking cradles.
for(let j=0;j<8;j++){let z=152-j*44;for(let k of [-1,1]){m.box(k*64,16,z,2,19,25,steel);for(let d of [-1,1]){m.box(k*62,16,z+d*7,2,16,10,gray);m.box(k*60,17,z+d*7,2,2,5,bronze)}
for(let i=0;i<4;i++){m.box(k*(24+i),1,z-3+i,2,1,2,pearl);m.box(k*32,1,z-8+i*4,2,1,2,orange)}
m.box(k*37,4,z,4,4,12,lined);m.box(k*52,4,z,4,4,12,lined);m.box(k*46,28,z+13,6,3,8,bronze);m.box(k*46,25,z+11,2,5,3,gray);
for(let i=0;i<4;i++)m.box(k*(33+i*5),38+i,z+12,7,3,4,panel)}
label(m,'0'+(j%4+1),-28,1,z+8,1,pearl,true)}
for(let j=0;j<7;j++){let z=148-j*50;for(let k of [-1,1]){m.box(k*15,52,z-21,6,4,42,slate);for(let n=0;n<5;n++)m.box(k*(25+n*3),47-n,z,5,3,5,gray);m.box(k*18,50,z-14,2,1,7,lamp,.8)}}
// The forward sill and lintel are visible from space as well as from the landing deck.
for(let side of [-1,1]){
 let z=182*side;
 m.box(0,-2,z,143,6,15,slate);m.box(0,1,z,133,2,12,steel);
 m.box(0,51,z,143,8,17,slate);m.box(0,56,z,141,4,13,pearl);
 for(let i=0;i<15;i++){
  m.box(-61+i*9,49,z+side*9,6,3,2,i%4===0?orange:gray);
  m.box(-61+i*9,2,z,4,1,6,i%2===0?gold:deep);
 }
 for(let k of [-1,1]){
  for(let i=0;i<4;i++){let x=k*(63-i*3);m.box(x,44+i*2,z,9,6,16,gray);m.box(x,5-i,z,6,6,15,steel)}
  m.box(k*65,26,z,8,50,17,pearl);m.box(k*62,25,z+side*9,5,39,2,deep);
  for(let a=0;a<5;a++)m.box(k*62,10+a*7,z+side*11,2,4,2,a<2?amber:lamp,.8)
 }
}
m.box(-29,54,191,70,11,3,deep);label(m,'DOCK 03',-49,57,194,1,ivory);
m.box(44,55,192,22,12,3,orange);label(m,'03',36,59,195,1,deep);
return m.bake(2)}const dock=hangar();
function conduitHall(){let m=new Model();tileFloor(m,104,352);m.box(0,68,0,105,4,353,deep);
for(let k of [-1,1]){m.box(k*52,33,0,4,66,354,lined);for(let y of [3,56]){m.box(k*25,y,0,11,4,350,slate);m.box(k*25,y+3,0,4,1,350,bronze)}for(let j=0;j<12;j++){let z=152-j*28;m.box(k*35,9,z,19,15,20,slate);m.box(k*35,35,z,13,44,13,coal);m.box(k*35,32,z,j%3===1?17:14,j%3===1?32:20,9,j%3===1?amber:bronze,j%3===1?.72:.31);for(let i=0;i<4;i++){m.box(k*35,18+i*8,z,20,3,18,i%2?pearl:gray);m.box(k*39,19+i*8,z+9,5,2,2,aqua,.8)}m.box(k*35,56,z,22,13,22,gray);m.box(k*29,60,z,15,7,14,deep);m.box(k*47,34,z,5,47,22,slate);m.box(k*14,1,z,2,1,15,gold)}}
for(let z=156;z>=-158;z-=48)arch(m,z,105,65);// A broad octagonal breech stays visible through the centre of the loader train.
m.box(0,32,-188,104,68,7,deep);
for(let i=0;i<5;i++){
 let rx=42-i*6,ry=27-i*4,z=-161-i*5;
 for(let j=0;j<64;j++){
  let a=j*TAU/64,x=Math.cos(a),y=Math.sin(a);
  m.box(x*rx,31+y*ry,z,5,4,i===0?9:5,i===0?steel:i===2?bronze:i===4?amber:gray,i===4?.6:0);
 }
}
for(let j=0;j<7;j++)m.box(-9+j*3,31,-182,2,15-Math.abs(j-3)*3,3,amber,.95);
label(m,'04',-11,63,-154,2,slate);for(let k of [-1,1]){for(let j=0;j<12;j++){let z=152-j*28;
m.box(k*29,31,z+7,6,34,4,slate);m.box(k*27,33,z+9,3,23,2,steel);m.box(k*26,38,z+10,3,5,1,orange);
for(let n=0;n<4;n++)m.box(k*29,24+n*5,z+10,4,1,1,amber,.7);
m.box(k*12,64,z,5,7,19,slate);m.box(k*12,59,z,3,2,14,gray);m.box(k*12,58,z,1,1,8,aqua,.6);
m.box(k*9,1,z,4,1,14,deep);for(let n=0;n<4;n++)m.box(k*9,2,z-5+n*3,4,1,1,steel);
}m.box(k*4,65,0,3,4,329,bronze)}for(let z=-134;z<165;z+=84)for(let k of [-1,1]){
 for(let j=0;j<7;j++){m.box(k*(37-j*3),54+j,z,8,6,10,j<2?bronze:slate);m.box(k*(37-j*3),51+j,z,6,2,8,gray)}
 m.box(k*17,57,z,3,3,8,amber,.65);
}
return m.bake(2)}const conduit=conduitHall();
let charge=new Model();charge.box(0,0,0,5,4,10,orange,.7);charge.box(0,0,0,3,5,7,amber,1.4);charge=charge.bake();
let clampJaw=new Model();clampJaw.box(0,0,0,11,5,11,steel);clampJaw.box(0,-4,0,7,3,9,pearl);clampJaw.box(0,-6,0,4,2,7,amber,1);clampJaw=clampJaw.bake();

const transferCradle=new Model();
for(let k of [-1,1]){
 transferCradle.box(k*4,1,0,2,5,13,steel);
 transferCradle.box(k*4,3,0,3,2,9,pearl);
 transferCradle.box(0,0,k*7,9,4,3,deep);
}
transferCradle.box(0,4,0,5,4,9,amber,.85);
transferCradle.box(0,7,0,3,2,7,'#ffe1a0',.7);transferCradle.bake();
