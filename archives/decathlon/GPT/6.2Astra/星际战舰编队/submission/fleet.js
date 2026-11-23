const pearl='#d6d7cc',ivory='#ebe9d9',steel='#839498',gray='#afb9b7',slate='#405563',deep='#20323e',coal='#142530',bronze='#bd622e',gold='#ed9c45',orange='#ec7330',aqua='#49d9e7',ice='#b7ffff',amber='#ffac48';
const glyphs={
A:['01110','10001','10001','11111','10001','10001','10001'],U:['10001','10001','10001','10001','10001','10001','01110'],R:['11110','10001','10001','11110','10100','10010','10001'],E:['11111','10000','10000','11110','10000','10000','11111'],L:['10000','10000','10000','10000','10000','10000','11111'],I:['111','010','010','010','010','010','111'],S:['01111','10000','10000','01110','00001','00001','11110'],K:['10001','10010','10100','11000','10100','10010','10001'],N:['10001','11001','11001','10101','10011','10011','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],H:['10001','10001','10001','11111','10001','10001','10001'],D:['11110','10001','10001','10001','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],O:['01110','10001','10001','10001','10001','10001','01110'],T:['11111','00100','00100','00100','00100','00100','00100'],V:['10001','10001','10001','10001','10001','01010','00100'],G:['01111','10000','10000','10111','10001','10001','01110'],'0':['01110','10011','10011','10101','11001','11001','01110'],'1':['010','110','010','010','010','010','111'],'2':['01110','10001','00001','00110','01000','10000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['10010','10010','10010','11111','00010','00010','00010'],'7':['11111','00001','00010','00100','01000','01000','01000'],'-':['000','000','000','111','000','000','000']};
function label(m,txt,x,y,z,s,c,top=false,e=0){for(let ch of txt){let g=glyphs[ch];if(!g){x+=3*s;continue}g.forEach((row,j)=>{for(let i=0;i<row.length;){if(row[i]==='0'){i++;continue}let end=i+1;while(row[end]==='1')end++;m.box(x+(end+i)*s/2,top?y:y-j*s,z+(top?j*s:0),(end-i)*s,top?1:s,top?s:1,c,e);i=end}});x+=(g[0].length+1)*s}}
function profile(kn,x){for(let i=1;i<kn.length;i++)if(x<=kn[i][0])return mix(kn[i-1][1],kn[i][1],clamp((x-kn[i-1][0])/(kn[i][0]-kn[i-1][0])));return kn.at(-1)[1]}
// A loft is scanned into integer-grid courses. Each envelope has its own voids and rake.
function plate(m,x0,x1,y,h,kn,c,z=0,step=6,offset=null){let last=null;for(let x=x0;x<x1;x+=step){let d=Math.min(step,x1-x),xx=x+d/2,w=Math.max(1,Math.round(profile(kn,xx))),zz=offset?Math.round(offset(xx)):z;if(last&&last.w===w&&last.z===zz){last.d+=d}else{if(last)m.box(last.x+last.d/2,y,last.z,last.d,h,last.w*2,c);last={x,d,w,z:zz}}}if(last)m.box(last.x+last.d/2,y,last.z,last.d,h,last.w*2,c)}
function shell(m,a,b,y,h,w,c,z=0,skew=0,step=5){let len=b-a;plate(m,a,b,y,h,[[a,w*.68],[a+len*.13,w],[a+len*.67,w],[a+len*.90,w*.63],[b,w*.26]],c,z,step,skew?x=>z+skew*(x-a)/len:null)}
function battery(m,x,y,z,s=1){const b=(dx,dy,dz,l,h,w,c,e=0)=>m.box(x+dx*s,y+dy*s,z+dz*s,l*s,h*s,w*s,c,e);b(0,0,0,31,6,25,slate);b(-1,5,0,23,7,20,gray);b(0,10,0,19,5,17,ivory);for(let k of [-1,1]){b(17,7,k*6,29,5,5,deep);b(29,7,k*6,8,6,6,steel);b(34,7,k*6,1,3,3,aqua,.7)}}
const dockOrigin=[-49,-27,0],outlets=[];
// Subtract the docking volume from each merged voxel cuboid before upload.
function carveDock(model){
 const bounds=[[-118,20],[-35,32],[-260,260]],old=model.a;model.a=[];
 for(let i=0;i<old.length;i+=10){
  let lo=[],hi=[],color=old.slice(i+6,i+10);
  for(let j=0;j<3;j++){lo[j]=old[i+j]-old[i+3+j]/2;hi[j]=lo[j]+old[i+3+j]}
  if(lo.some((x,j)=>x>=bounds[j][1]||hi[j]<=bounds[j][0])){model.a.push(...old.slice(i,i+10));continue}
  function append(l,h){model.a.push(...l.map((v,j)=>(v+h[j])/2),...h.map((v,j)=>v-l[j]),...color)}
  for(let j=0;j<3;j++){
   if(lo[j]<bounds[j][0]){let end=hi.slice();end[j]=bounds[j][0];append(lo,end);lo[j]=end[j]}
   if(hi[j]>bounds[j][1]){let start=lo.slice();start[j]=bounds[j][1];append(start,hi);hi[j]=start[j]}
  }
 }
}
function drive(m,x,y,z,w,h,flag=false){
 const b=m.box.bind(m),depth=flag?21:8,rim=flag?4:2;
 b(x+depth/2,y,z,depth,h+rim*2,w+rim*3,slate);
 b(x-1,y,z,3,h,w,coal);b(x-3,y,z,2,h*.73,w*.79,'#246678',.4);
 for(let i=-2;i<=2;i++)b(x-5,y,z+i*w*.14,2,h*(.35+.12*(2-Math.abs(i))),Math.max(1,w*.095),i%2?aqua:ice,1);
 for(let k of [-1,1]){
  b(x-depth*.48,y+k*(h/2+rim/2),z,depth+4,rim,w+rim*2,steel);
  b(x-depth*.46,y,z+k*(w/2+rim/2),depth+4,h,rim,gray);
  b(x-depth,y+k*(h/2+rim/2),z,3,rim,w+rim*2,pearl);
  for(let j=-1;j<=1;j++)b(x+1,y+k*(h/2+rim+1),z+j*w*.30,depth*.9,2,w*.12,deep);
 }
 if(flag)outlets.push([x-6,y,z,w]);
}
function makeFlag(){let m=new Model(),b=m.box.bind(m);
let core=[[-485,82],[-400,114],[-237,131],[-70,116],[110,103],[274,78],[370,41],[455,19]];
plate(m,-485,455,-3,44,core,deep);plate(m,-458,385,-31,18,core,slate);shell(m,-430,370,-46,14,78,gray);shell(m,-361,254,-57,11,57,slate);shell(m,-315,150,-66,10,34,pearl);
for(let k of [-1,1]){
// Split bow rails surrounding the recessed accelerator.
for(let [a,bx,y,h,w,col,z,end] of [[140,573,5,31,34,slate,77,-22],[161,570,21,13,30,pearl,78,-21],[194,548,31,8,24,ivory,78,-21],[172,556,-16,12,26,gray,78,-20]])shell(m,a,bx,y,h,w,col,k*z,k*end,4);
for(let j=0;j<8;j++){let xx=220+j*39,zz=(77-j*2.6)*k;b(xx,35-(j>6?1:0),zz,16,2,21,j===2||j===3?orange:gray)}
// Long side nacelles, divided by a visibly recessed docking gallery.
shell(m,-502,-154,-9,38,35,deep,k*143,k*-10);shell(m,4,195,-9,38,35,deep,k*128,k*-9);b(-76,-8,k*102,161,34,9,coal);shell(m,-495,196,16,13,41,gray,k*143,k*-24);shell(m,-474,180,25,9,35,pearl,k*144,k*-24);shell(m,-476,181,-34,11,38,steel,k*143,k*-24);shell(m,-456,160,-42,7,32,pearl,k*143,k*-24);
for(let j=0;j<4;j++){let x=-464+j*136,z=k*(146-j*4.4);shell(m,x,x+128,32,6,31,j===1?bronze:ivory,z,0,4);b(x+51,36,z,46,2,39,j===1?orange:gray);for(let a=0;a<5;a++)b(x+12+a*7,37,z+k*12,3,2,13,slate)}
for(let j=0;j<16;j++){let x=-460+j*35,z=k*(163-j*1.05);b(x,-4,z,9,28,26,slate);b(x+3,-4,z+k*9,4,23,15,steel);b(x+13,-12,z+k*9,9,2,4,j%3?amber:aqua,1)}
for(let j=0;j<5;j++){b(-380+j*99,-16,k*166,37,3,7,deep);b(-380+j*99,-15,k*170,28,2,2,aqua,1)}
for(let j=0;j<6;j++)b(-375+j*91,38,k*(133-j*3),27,5,22,deep);
drive(m,-500,-5,k*143,48,31,true);drive(m,-476,-3,k*76,42,35,true);
}
shell(m,125,496,7,27,31,steel);shell(m,190,511,21,8,19,coal);for(let j=0;j<12;j++){b(202+j*25,27,0,15,3,13,j%3?bronze:amber,.35);b(201+j*25,-6,0,8,4,36,deep)}b(513,6,0,5,13,20,amber,1);b(516,6,0,2,5,11,ivory,1);
for(let [a,bx,w,y] of [[-479,-292,104,34],[-287,-108,111,39],[-102,87,99,36],[93,260,77,29],[263,393,55,23]]){shell(m,a,bx,y-9,21,w,steel);shell(m,a+3,bx-1,y+4,10,w-3,pearl);shell(m,a+13,bx-14,y+11,5,w-13,ivory);for(let k of [-1,1]){for(let j=0;j<7;j++)b(a+22+j*8,y+15,k*(w-27),4,3,12,deep);b(a+73,y+14,k*(w-37),44,2,4,bronze);b(a+84,y+16,k*(w-37),14,2,2,gold)}}
for(let j=0;j<5;j++){let x=-436+j*102;b(x,-27,0,13,9,230-j*9,steel);for(let k of [-1,1])b(x+8,-36,k*(76-j*4),21,12,39,deep)}
// Raised command island and a glazed observation slot.
shell(m,-400,148,54,17,67,slate);shell(m,-385,98,65,10,61,pearl);shell(m,-346,-2,74,11,53,gray);shell(m,-305,-48,85,12,39,ivory);shell(m,-272,-100,96,11,32,deep);shell(m,-268,-108,104,6,33,pearl);
for(let j=0;j<24;j++)for(let k of [-1,1])b(-251+j*5,97,k*32,3,3,2,aqua,.95);
shell(m,-240,-130,110,6,25,gray);b(-214,118,0,33,13,20,slate);for(let j=0;j<5;j++){b(-231+j*13,122+j%3*4,j%2*10-5,2,20+j%3*6,2,steel);b(-231+j*13,133+j%3*7,j%2*10-5,2,2,2,amber,1)}
drive(m,-487,7,0,57,43,true);
for(let j=0;j<7;j++){b(-446+j*20,69,0,12,5,70,slate);b(-445+j*20,73,0,5,3,67,gray)}
// Large readable identifiers and enamel stripes, all quantized physical inlays.
label(m,'07',-124,81,-22,6,deep,true);label(m,'AURELIA',163,48,-16,2,slate,true);
for(let j=0;j<3;j++)b(42+j*14,73,0,7,2,52,j===2?gold:orange);
b(-291,4,178,136,23,4,deep);label(m,'AURELIA',-348,10,181,2,ivory);b(-291,-8,182,129,2,2,aqua,.7);
for(let k of [-1,1]){for(let j=0;j<9;j++){let x=-240+j*18;b(x,53,k*78,12,3,16,gray);b(x,55,k*78,8,2,8,slate)}for(let j=0;j<4;j++)battery(m,-109+j*83,50,k*62,.86)}
// Cantilevered aft shoulders enclose two open drive channels.
for(let k of [-1,1]){
 for(let x of [-401,-316,-212]){b(x,-3,k*184,27,14,91,slate);b(x,7,k*187,18,8,86,gray);b(x,12,k*191,13,3,60,bronze)}
 shell(m,-490,-83,1,33,22,deep,k*225,-k*39,4);shell(m,-485,-78,21,12,23,ivory,k*225,-k*39,4);shell(m,-477,-90,-19,9,20,steel,k*225,-k*39,4);
 shell(m,-476,-330,31,9,19,bronze,k*225,-k*14,4);shell(m,-467,-344,37,4,15,orange,k*225,-k*13,4);
 for(let j=0;j<5;j++){let x=-380+j*52,zz=k*(222-j*5);b(x,29,zz,24,3,25,gray);for(let i=0;i<4;i++)b(x-9+i*5,32,zz,2,3,18,slate);b(x,0,zz+k*22,27,5,2,deep);b(x+2,0,zz+k*24,16,2,2,aqua,.8)}
 drive(m,-490,1,k*225,29,23,true);
 // The carrier gallery has an inset rear wall, lit berths and overhead ribs.
 b(-73,-25,k*139,150,4,64,gray);b(-74,9,k*136,154,4,64,steel);b(-72,-23,k*170,137,2,2,aqua,1);b(-75,8,k*170,139,2,3,amber,.8);
 for(let i=0;i<6;i++){let x=-142+i*26;b(x,-6,k*122,5,30,36,slate);b(x,5,k*149,5,5,45,pearl);b(x+11,-15,k*111,15,7,4,gray);b(x+11,-12,k*116,10,2,2,aqua,.9)}
 for(let j=0;j<4;j++){let x=266+j*69,z=k*(74-j*4);b(x,34,z,24,5,29,j===1?bronze:gray);for(let l=0;l<4;l++)b(x-8+l*5,37,z,2,3,18,deep);b(x+15,21,z+k*22,22,4,3,slate)}
 for(let j=0;j<6;j++){b(-285+j*40,53,k*93,28,3,12,steel);b(-281+j*40,55,k*93,15,2,7,gray)}
}
shell(m,-341,-212,85,19,31,slate,-13);shell(m,-330,-219,97,7,30,pearl,-13);
b(-285,112,-13,43,24,17,slate);b(-284,123,-13,57,6,18,gray);b(-285,128,-13,39,4,16,ivory);b(-286,133,-13,5,27,5,steel);b(-286,145,-13,27,3,4,bronze);
b(-269,119,0,8,39,4,gray);b(-269,142,0,3,15,2,deep);b(-269,149,0,3,2,3,amber,1);
for(let j=0;j<4;j++){b(-106+j*10,52,75,6,4,19,orange);b(-106+j*10,53,-75,6,4,19,orange)}
// Identification cartouche and ordinal are set into the forward armour.
b(343,36,0,78,3,55,pearl);label(m,'07',311,39,-22,5,deep,true);b(311,39,-28,14,2,3,orange);
for(let k of [-1,1]){b(266,11,k*102,108,22,3,slate);b(226,11,k*105,16,23,2,orange);label(m,'07',251,17,k*105,2,ivory);for(let i=0;i<5;i++)b(283+i*4,5,k*105,2,4+i%3,1,gray)}
// Stepped radiator stacks, service covers and repeating service lights.
for(let k of [-1,1]){for(let j=0;j<5;j++){let x=-444+j*89;for(let i=0;i<3;i++){b(x+i*9,45,k*99,5,6,15,slate);b(x+i*9,49,k*99,5,2,13,gray)}}
for(let j=0;j<26;j++){let x=-430+j*30,zz=k*(168-j*.85);b(x,-30,zz,8,2,2,j%4?gray:amber,j%4?0:.7)}}

// Twin swept dorsal vanes rise from the armoured shoulder. Each layer shifts aft and outboard.
for(let k of [-1,1]){
 for(let i=0;i<10;i++){let a=-426-i*2,bx=-216-i*18,z=k*(74+i*2);
 shell(m,a,bx,51+i*5,6,12-i*.65,i<2?slate:i===7?bronze:i===8?orange:i%4===0?gray:pearl,z,0,3);
 if(i<6)b(a+29,51+i*5,z+k*(12-i*.65),21,2,2,i===4?aqua:steel,i===4?.7:0)}
 for(let j=0;j<8;j++){let x=179+j*43,z=k*(92-j*2.8);b(x,5,z,21,6,7,steel);b(x+2,5,z+k*4,14,2,3,j%3?gray:amber,j%3?0:.5)}
}
// Belly keel, exposed transfer trunks, and interleaved armour at the engine shoulders.
for(let k of [-1,1]){
 for(let j=0;j<9;j++){
  let x=-421+76*j,z=k*(91-3*j);
  shell(m,x,x+56,-43,12,13,gray,z,0,2);
  b(x+26,-52,z,29,5,16,slate);b(x+20,-56,z,12,3,9,bronze);
  for(let a=0;a<3;a++)b(x+11+a*7,-51,z+k*7,3,6,4,deep);
 }
 for(let i=0;i<7;i++){let x=-456+i*12;
  b(x,-6,k*224,7,19,47,slate);b(x,6,k*228,5,3,38,gray);
 }
}
// Hollow octagonal accelerator mouth. A succession of open collars reveals the recessed emitter.
for(let i=0;i<4;i++){
 let x=499+i*11,ry=15-i,rz=24-i*2;
 for(let j=0;j<40;j++){
  let a=j*TAU/40;
  b(x,7+Math.sin(a)*ry,Math.cos(a)*rz,8,4,5,i===3?steel:i%2===0?slate:bronze);
  if(i===3&&j%3===0)b(x+5,7+Math.sin(a)*(ry-1),Math.cos(a)*(rz-1),2,2,3,amber,.9);
 }
}
for(let k of [-1,1]){
 for(let i=0;i<7;i++){let x=398+i*14;b(x,8,k*19,10,18,5,slate);b(x,17,k*19,7,3,4,i%2?bronze:gray);}
 for(let j=0;j<5;j++){
  let x=-442+j*64,z=k*(244-j*6);b(x,1,z,32,16,4,slate);b(x+5,0,z+k*3,19,9,2,gray);
  b(x+12,1,z+k*5,2,8,2,orange);for(let i=0;i<3;i++)b(x-10+i*4,-4,z+k*4,2,3,2,deep);
 }
}
// Sectional cheek plates follow the changing beam of each bow rail. The dark spine
// remains visible beneath the ivory cap instead of ending in a single vertical wall.
for(let side of [-1,1]){
 const outer=x=>77-22*(x-140)/433+profile([[140,23],[196,34],[430,34],[530,21],[573,9]],x);
 for(let j=0;j<6;j++){
  let x0=186+60*j,x1=x0+55;
  for(let x=x0;x<x1;x+=5){
   let u=(x-x0)/55,edge=outer(x),h=Math.round(7+10*Math.sin(Math.PI*u)),rise=Math.floor(3*u);
   b(x+2,6+rise,side*(edge+1),5,h,5,j===1?steel:gray);
   b(x+2,13+rise,side*(edge-1),5,5,8,pearl);
   b(x+2,-9,side*(edge-1),5,4,5,slate);
  }
  let z=side*(outer(x0+20)+4);
  b(x0+19,5,z,14,4,2,j%3===1?orange:slate);
  b(x0+18,5,z+side,7,1,2,j%3===1?gold:gray);
 }
 // A stepped landing stencil and a row of dark inspection ports run beneath the outer vane.
 let z=side*245;b(-421,2,z,55,13,4,slate);
 if(side===1)label(m,'07',-442,6,z+3,1,ivory);
 for(let j=0;j<5;j++)b(-412+j*4,0,z+side*3,2,5,2,orange);
}
// Forked observation crown, with a continuous inset bank of bridge windows.
for(let j=0;j<6;j++){
 shell(m,-267+j*3,-199+j*2,111+j*4,5,15-j*.9,j<2?slate:j===4?steel:gray,0,0,2);
}
shell(m,-267,-171,137,7,20,deep,0,0,2);
shell(m,-264,-174,142,4,21,ivory,0,0,2);
for(let side of [-1,1]){
 for(let i=0;i<13;i++)b(-253+i*5,137,side*20,3,2,2,i%4===0?amber:aqua,.8);
 shell(m,-257,-206,146,4,5,pearl,side*12,0,2);
 b(-241,150,side*12,18,3,6,orange);
}
carveDock(m);
return m.bake(5)}
const flagship=makeFlag();
function escort(type){
 const m=new Model(),b=m.box.bind(m);
 if(type===0){
  // A low, broad-keel armoured monitor with stepped cheeks and a raised gun island.
  shell(m,-82,90,-3,20,29,deep,0,0,2);shell(m,-73,77,-15,7,23,gray,0,0,2);
  shell(m,-65,63,10,8,26,pearl,0,0,2);shell(m,-60,9,18,8,18,slate);
  shell(m,-56,-1,24,5,15,ivory);b(-35,29,0,22,5,12,deep);b(-33,32,0,18,2,11,gray);
  for(let k of [-1,1]){
   shell(m,-76,31,1,18,17,slate,k*28,-k*4,2);
   shell(m,-72,33,13,7,16,pearl,k*28,-k*5,2);
   shell(m,-72,-38,19,4,13,orange,k*28,0,2);
   shell(m,31,96,3,11,10,gray,k*13,-k*3,2);shell(m,37,95,10,4,8,ivory,k*13,-k*3,2);
   b(-12,16,k*28,18,5,16,deep);battery(m,14,13,k*23,.52);
   for(let j=0;j<5;j++){b(-65+j*13,-3,k*43,6,10,3,steel);b(-59+j*13,1,k*43,4,2,2,j%2?amber:aqua,.65)}
   drive(m,-76,2,k*28,19,14);
  }
  for(let k of [-1,1]){
   b(-50,22,k*28,26,2,14,orange);b(-51,24,k*28,16,2,10,bronze);
   for(let i=0;i<4;i++){b(-55+i*4,26,k*28,2,2,8,deep);b(-51+i*5,-4,k*45,3,9,2,gray)}
   for(let j=0;j<3;j++){let x=42+j*15;b(x,13,k*14,8,3,8,steel);b(x,15,k*14,5,1,6,gray)}
   b(13,17,k*16,22,2,8,slate);b(16,19,k*16,14,2,4,gray);
  }
  label(m,'12',-52,28,-6,1,deep,true);
  for(let j=0;j<4;j++)b(-59+j*6,30,0,3,2,18,steel);
  b(46,13,0,11,2,20,orange);drive(m,-85,-2,0,20,15);
 }else{
  // A narrow lance suspended between two swept launch racks, with open space under each boom.
  shell(m,-78,111,0,11,13,deep,0,0,2);shell(m,-73,113,8,6,12,ivory,0,0,2);
  shell(m,-59,34,15,6,9,steel);shell(m,-41,14,20,4,7,pearl);
  b(-23,24,0,12,3,6,deep);b(-24,26,0,8,1,5,aqua,.65);
  for(let k of [-1,1]){
   for(let j=0;j<8;j++){let x=-54+j*5,z=k*(49-j*4);
    b(x,-1,z,20,5,12,j%3?steel:slate);b(x,3,z,14,3,10,j===2?orange:gray)}
   for(let j=0;j<6;j++)b(22+j*5,0,k*(32-j*4),9,3,8,slate);
   shell(m,-83,65,3,11,9,deep,k*57,-k*25,2);
   shell(m,-80,67,10,5,9,pearl,k*57,-k*25,2);
   shell(m,-78,-50,14,3,8,bronze,k*56,-k*3,2);
   for(let j=0;j<6;j++){let x=-42+j*14,z=k*(50-j*2.5);
    b(x,14,z,12,3,11,slate);b(x,16,z,9,2,7,coal);
    b(x,18,z+k*4,10,3,2,gray);b(x,18,z-k*4,10,3,2,gray);
    b(x-4,16,z,2,2,5,amber,.6);
   }
   shell(m,56,99,-1,7,4,gray,k*16,-k*6,2);
   drive(m,-83,3,k*57,12,10);
  }
  drive(m,-80,-1,0,16,11);b(42,12,0,19,2,15,orange);
 }
 return m.bake(2)
}
const guard=escort(0),lancer=escort(1);
function craft(){let m=new Model();shell(m,-12,18,0,3,4,slate,0,0,1);shell(m,-10,17,2,2,4,ivory,0,0,1);shell(m,-5,10,4,2,3,deep,0,0,1);shell(m,-3,7,5,1,2,'#628c99',0,0,1);
for(let k of [-1,1]){shell(m,-14,5,0,2,4,gray,k*9,-k*6,1);shell(m,-14,0,1,2,3,ivory,k*10,-k*3,1);m.box(-10,2,k*10,5,2,4,orange);m.box(-9,3,k*5,9,3,3,slate);m.box(-10,5,k*5,6,2,2,pearl);m.box(-14,1,k*7,2,3,5,deep);m.box(-15,1,k*7,1,1,3,aqua,1);m.box(-5,-2,k*4,3,2,2,steel)}
m.box(11,3,0,4,1,3,orange);return m.bake()}const skiff=craft();
const ships=[{p:[0,0,0],type:2}],shuttles=[];
for(let i=0;i<6;i++)for(let k of [-1,1])for(let j=0;j<3;j++){let outer=j>0;ships.push({p:[-1400+i*570+j*263+rnd()*140,(j===2?180:-30)+rnd()*140-82,k*(325+j*451+rnd()*120)],type:(i>=4||j===2)?1:0})}
ships[17].p=[354,282,744];
for(let j=0;j<8;j++)shuttles.push([-470+j*129,32+(j%3)*9,189+(j%2)*21]);
