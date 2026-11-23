"use strict";
const mat = (color,emit=0,metal=.36,pulse=0) => [...rgb(color),emit,metal,pulse];
const P={
  deckMetal:mat(0x405369,0,.69,-.49), deckInset:mat(0x2c4158,0,.61,-.36),
  pearl: mat(0xb9c9d0,0,.63), frost:mat(0xe1e1d5,0,.52), blue:mat(0x718da2,0,.55),
  slate:mat(0x465f78,0,.45), iron:mat(0x263b50,0,.67), black:mat(0x111e2f,0,.23),
  gold:mat(0xb6773b,0,.53), stripe:mat(0xd99845,0,.48), navy:mat(0x182b40,0,.32),
  lamp:mat(0x52dbe5,2.2,.19,.6), sun:mat(0xffb15d,1.25,.25,.35), white:mat(0xcaf5ff,2.7,.18,.2),
  dim:mat(0x50b4c7,.54,.21,.3), red:mat(0xff6452,2,.29,.6), glass:mat(0x24596f,.9,.74),
  vio:mat(0x8b7eff,1.85,.21,.7), deep:mat(0x27344c,0,.37)
};
const b=(o,x,y,z,w,h,d,m)=>o.box(x,y,z,w,h,d,m);
const hangarOrigin=[87,-41,-165];
const hangarExit=[124,177];
function frameXY(o,x,y,z,w,h,d,k,m) {
  for(const s of [-1,1]){
    b(o,x+s*(w-k)/2,y,z,k,h-2*k,d,m);
    b(o,x,y+s*(h-k)/2,z,w,k,d,m);
  }
}
function throat(o,x,y,z,w,h) {
  const k=Math.max(2,Math.round(w*.11));
  for(let i=0;i<3;i++){
    const wi=w-i*2*k,hi=h-i*k*1.35; 
    frameXY(o,x,y,z+i*k,wi,hi,k+2,k,i===0?'frost':i===1?'iron':'gold');
  }
  b(o,x,y,z+k*3,w-4*k,h-3*k,k,'black');
  b(o,x,y,z+k*2.8,w-5*k,Math.max(2,h-4*k),2,'white');
  for(const s of [-1,1]){
    b(o,x+s*(w-3*k)*.33,y,z+k*2.5,Math.max(1,k/2),Math.max(2,h-3*k),2,'lamp');
    b(o,x,y+s*(h-2*k)*.33,z+k*2.4,w-4*k,1,2,'dim');
  }
  if(w>45)for(const side of [-1,1])for(let tier=0;tier<3;tier++){
    const bezel=w*.5-(tier+1)*k-1;
    const railHeight=h*.30-tier*k*.66;
    b(o,x+side*bezel,y,z+(tier+.62)*k,2,railHeight,4,tier===0?'gold':'slate');
    b(o,x+side*(bezel-1),y+railHeight*.15,z+(tier+.48)*k,1,Math.max(2,railHeight*.36),2,tier===2?'lamp':'dim');
  }
}
function exhaustCavity(o,x,y,z,w,h){
  const inset=Math.max(2,Math.round(w*.11));
  for(let ring=0;ring<3;ring++){
    const insetX=Math.floor((w-(ring+1)*inset*2)/2);
    const insetY=Math.floor((h-(2+ring*1.35)*inset)/2);
    if(insetX<1||insetY<1)break;
    o.cut([x-insetX,y-insetY,z-3+ring*inset],[x+insetX,y+insetY,z+inset*(ring+1)+2]);
  }
}
function flaredPort(o,x,y,z,w){
  const h=14;
  for(let layer=0;layer<3;layer++){
    const lip=Math.round(w*.5)-layer*2, peak=h-layer*3;
    for(let row=-peak/2|0;row<=peak/2;row++){
      const outer=lip-Math.max(0,Math.abs(row)-2);
      const wall=Math.abs(row)>=peak*.5-1?outer*2:3;
      if(wall===outer*2) b(o,x,y+row,z+layer*3,wall,1,4,layer===0?'pearl':'slate');
      else for(const s of [-1,1]) b(o,x+s*(outer-wall*.5),y+row,z+layer*3,wall,1,4,layer===0?'pearl':layer===1?'gold':'iron');
    }
  }
  b(o,x,y,z+11,12,7,2,'black');
  b(o,x,y,z+9,9,3,2,'white');
  for(const s of [-1,1])b(o,x+s*4,y+s*3,z+8,2,2,2,'lamp');
}
function turret(o,x,y,z,size,paired=true,barrels=true) {
  b(o,x,y,z,size,size*.25,size,'black');
  b(o,x,y+size*.21,z,size*.78,size*.36,size*.77,'slate');
  if(!barrels)return;
  b(o,x,y+size*.38,z-size*.08,size*.72,size*.18,size*.62,'pearl');
  b(o,x,y+size*.44,z-size*.30,size*.52,2,size*.18,'gold');
  for(const s of paired?[-1,1]:[0]){
    const a=x+s*size*.17;
    b(o,a,y+size*.30,z+size*.43,size*.19,size*.19,size*.96,'iron');
    b(o,a,y+size*.30,z+size*.87,size*.24,size*.23,size*.24,'frost');
    b(o,a,y+size*.30,z+size*.993,size*.12,size*.12,2,'lamp');
  }
}
function profile(o,a,step,draw) {
  for(let k=1;k<a.length;k++){
    const [z0,...v0]=a[k-1],[z1,...v1]=a[k];
    const n=Math.ceil((z1-z0)/step);
    for(let i=0;i<n;i++){
      const z=mix(z0,z1,(i+.5)/n), d=(z1-z0)/n;
      draw(z,Math.max(1,Math.round(d)),v0.map((v,j)=>mix(v,v1[j],(i+.5)/n)),i,n,k);
    }
  }
}
const flagEngines=[],pulseMounts=[];
function flagship() {
  const o=new Blocks(),rnd=random(1680);
  profile(o,[[-545,75,37,0],[-490,125,51,0],[-415,146,65,-4],[-294,126,70,-6],[-105,108,68,2],[35,88,64,6],[181,78,58,9],[299,56,44,7],[398,33,30,4],[532,17,16,2]],9,(z,d,[w,h,y],i,n,k)=>{
    b(o,0,y-4,z,w*2,h*1.64,d,'iron');
    b(o,0,y-17,z,w*1.65,h*1.47,d,'slate');
    b(o,0,y-h*.76,z,w*1.26,h*.48,d,'pearl');
    b(o,0,y+h*.66,z,w*1.75,h*.38,d,'blue');
    b(o,0,y+h*.86,z,w*1.4,7,d,'frost');
    if(z < 325) b(o,0,y+h*.95,z,w*.58,12,d,'pearl');
    for(const s of [-1,1]){
      b(o,s*w*.82,y+h*.43,z,w*.38,13,d,'pearl');
      b(o,s*w*.80,y-h*.50,z,w*.44,12,d,'blue');
      b(o,s*w*.88,y+h*.53,z,w*.17,2,d,i===0?'gold':'slate');
      if(i%3!==0) b(o,s*w*.983,y+h*.34,z,3,3,d-2,'dim');
      if((i+1)%6===0) b(o,s*w*.73,y-h*.73,z,w*.4,5,d,'gold');
    }
  });
  // Two stepped structural rails sweep into the pronged bow.
  for(const s of [-1,1]){
    profile(o,[[-493,134,48,48],[-423,173,76,61],[-325,188,67,65],[-278,181,56,62],[-160,155,47,60],[-52,137,43,57],[68,134,38,51],[216,116,42,45],[329,82,34,41],[468,69,31,31],[552,57,26,22],[571,48,14,14]],7,
      (z,d,[x,w,h],i,n,k)=>{
        const bay=s>0&&z>-326&&z<-73;
        const y=18-(z+80)*.035;
        if(!bay) b(o,s*x,y-12,z,w,h,d,'iron');
        b(o,s*x,y+h*.18,z,w+8,16,d,'slate');
        b(o,s*x,y+h*.38,z,w+2,13,d,'pearl');
        b(o,s*(x-4),y+h*.53,z,w*.70,9,d,'frost');
        b(o,s*(x+w*.48),y+h*.15,z,7,13,d,'blue');
        b(o,s*(x+w*.47),y+h*.255,z,4,3,d,i===0?'stripe':'slate');
        if(z<385){
          b(o,s*(x-8),y-h*.58,z,w+(bay?9:-9),12,d,'iron');
          b(o,s*(x-5),y-h*.72,z,w-5,9,d,'blue');
          b(o,s*(x+w*.31),y-h*.48,z,5,3,d,i%4!==0?'dim':'iron');
        }
        if(i%5===2 && z<500) b(o,s*(x-w*.18),y+h*.65,z,w*.5,2,d-2,'slate');
    });
    profile(o,[[-460,139,56],[-380,184,73],[-279,207,53],[-169,157,38],[-90,125,21]],8,(z,d,[x,w])=>{
      b(o,s*x,-48,z,w,20,d,'iron');
      b(o,s*x,-63,z,w*.82,13,d,'blue');
      b(o,s*(x+4),-71,z,w*.55,6,d,'pearl');
    });
    for(let i=0;i<13;i++){
      const z=-424+i*34,x= mix(159,126,i/12);
      b(o,s*x,-36,z,38,15,9,'slate');
      b(o,s*(x+17),-41,z,9,16,10,'pearl');
      b(o,s*(x+22),-44,z,2,7,8,i%3===0?'sun':'dim');
    }
    // Spaced weapon islands and contrasting serial bands.
    for(const [i,z] of [-387,-274,-159,-43,77,187,282].entries()){
      const x=s*[166,145,129,113,114,99,73][i], y=[68,58,51,47,44,38,33][i];
      turret(o,x,y,z,23);
      if(s>0) pulseMounts.push([x,y+7,z+23]);
      b(o,x,y+2,z-30,26,5,24,'gold');
      b(o,x,y+5,z-35,26,2,4,'frost');
    }
    // A lower pair of bow rails gives the prongs a stepped throat in profile.
    profile(o,[[298,85,27,13],[344,79,31,24],[405,69,25,30],[474,61,20,25],[534,53,14,17],[561,48,8,6]],6,
      (z,d,[x,w,h],i)=>{
        b(o,s*x,-14-h*.33,z,w,h,d,'iron');
        b(o,s*(x+4),-20-h*.64,z,w*.72,h*.38,d,'blue');
        b(o,s*(x+6),-18-h*.71,z,w*.41,3,d,'pearl');
        if(i%5!==2)b(o,s*(x+w*.45),-13-h*.40,z,2,3,d-1,'dim');
      });
    for(const [i,z] of [364,432,477].entries()){
      const x=s*[80,72,65][i],y=[19,19,17][i],size=[19,18,16][i];
      turret(o,x,y,z,size);
      b(o,x,y-4,z-5,size+6,6,size+3,'iron');
      b(o,x,y-1,z-11,size+2,2,4,'gold');
      if(s>0)pulseMounts.push([x,y+size*.30,z+size*.993]);
    }
    // The recessed underside carries ribs and separate radiator banks.
    for(let i=0;i<9;i++){
      const z=-441+i*44,x=[114,130,145,147,137,125,104,91,87][i],y=-54+i*.85;
      b(o,s*x,y,z,30,17,26,'black');
      b(o,s*(x+7),y-8,z,17,5,23,'blue');
      for(let j=0;j<4;j++){
        b(o,s*(x+15),y,z-9+j*6,5,13,3,'pearl');
        b(o,s*(x+18),y-3,z-9+j*6,1,3,2,i%3===0?'sun':'dim');
      }
    }
    for(const [z,x,y,w] of [[-413,167,70,43],[-376,179,66,41],[-148,149,47,30],[84,124,34,31],[242,111,24,23],[413,76,14,22]]){
      b(o,s*x,y,z,w,8,39,'iron');
      b(o,s*x,y+5,z-3,w-6,6,28,'blue');
      b(o,s*x,y+8,z-11,w-9,2,14,'pearl');
      b(o,s*(x+w*.23),y+9,z+6,5,1,11,'stripe');
      for(let j=0;j<4;j++) b(o,s*(x-w*.19+j*w*.12),y+9,z-8,2,1,8,'slate');
    }
    for(let i=0;i<31;i++){
      const z=-449+i*24, x=s*(55+rnd()*24);
      b(o,x,57-i*.58,z,5+Math.floor(rnd()*7),4,6+Math.floor(rnd()*15),i%3?'iron':'blue');
    }
  }
  // The ventral hull has its own split profile and recessed structural ladder.
  for(const side of [-1,1]){
    profile(o,[[-496,66,35,9],[-412,82,53,18],[-309,81,48,26],[-163,70,34,20],[-68,58,31,14],[111,51,24,11],[246,40,15,6]],7,
      (z,d,[x,w,h],i)=>{
        const y=-60 + .000089*(z+201)*(z+201);
        b(o,side*x,y,z,w,h,d,'iron');
        b(o,side*(x-4),y-h*.42,z,w*.72,5,d,'blue');
        b(o,side*(x-9),y-h*.57,z,w*.36,4,d,'pearl');
        b(o,side*(x+w*.32),y-h*.38,z,3,2,d,i%5===0?'sun':'slate');
      });
    for(let i=0;i<11;i++){
      const z=-417+i*48,x=side*(i<5?74:67-(i-5)*4),y=-69 + .00008*(z+210)*(z+210);
      b(o,x,y,z,35,9,13,'slate');
      b(o,x+side*13,y-5,z,7,5,12,'pearl');
      b(o,x+side*15,y-8,z,4,2,8,i%4===0?'sun':'dim');
      b(o,x-side*15,y-3,z,4,6,12,'iron');
    }
  }
  for(let i=0;i<8;i++){
    const z=-349+i*53,y=-59+.000077*(z+210)*(z+210);
    b(o,0,y,z,88-i*3,9,13,'slate');
    b(o,0,y-6,z,42-i*2,4,7,'black');
    b(o,0,y-8,z,24-i,2,3,i%3===0?'white':'dim');
  }
  // The outer sill and armored lintel frame the starboard hangar entrance.
  b(o,179,-44,-282,49,10,116,'blue');
  b(o,185,-38,-282,43,4,103,'iron');
  b(o,185,22,-282,44,9,111,'iron');
  b(o,202,26,-282,13,6,109,'pearl');
  for(const z of [-335,-230]){
    b(o,182,-10,z,41,62,13,'slate');
    b(o,201,-11,z,10,56,9,'pearl');
    b(o,205,-9,z,3,42,4,'sun');
  }
  for(let i=0;i<12;i++){
    b(o,205,-35,-330+i*8,3,2,4,i%3===0?'white':'sun');
    b(o,193,17,-330+i*8,12,2,3,'dim');
  }
  // A built-up command mound, an inset band of windows and tall signal fins.
  profile(o,[[-436,52,24],[-381,67,54],[-293,63,98],[-245,64,123],[-157,57,123],[-101,45,93],[-57,31,67],[-34,22,57]],6,(z,d,[w,h],i,n,k)=>{
    b(o,0,(h+45)/2,z,w*2,h-45,d,'pearl');
    b(o,0,h-6,z,w*2-8,12,d,'slate');
    b(o,0,h+1,z,w*1.51,3,d,'frost');
    for(const s of [-1,1]){
      b(o,s*(w-1),h-10,z,3,5,d,'black');
      if(i%2===0) b(o,s*w,h-10,z,2,2,d-1,'lamp');
      b(o,s*w*.62,h-19,z,w*.79,4,d,'gold');
    }
  });
  for(const s of [-1,1]) {
    for(let i=0;i<9;i++) b(o,s*(24+i*3),122+i*3,-270-i*5,11,9,61-i*4,i%2?'blue':'pearl');
    b(o,s*39,151,-302,3,39,4,'iron');
    b(o,s*39,172,-302,4,6,4,'red');
  }
  b(o,0,130,-175,18,18,44,'iron');
  for(let i=0;i<4;i++){
    b(o,0,143+i*8,-188-i*6,14-i*3,10,14,'slate');
    b(o,0,145+i*8,-178-i*6,6,2,3,'lamp');
  }
  // Nested command structures read as separate decks under side lighting.
  for(const side of [-1,1]){
    for(const [z,x,y,w] of [[-276,53,89,18],[-248,63,94,20],[-220,63,99,19],[-190,61,101,17],[-157,53,89,16]]){
      b(o,side*x,y,z,w,18,24,'iron');
      b(o,side*(x+w*.29),y+3,z,w*.52,12,21,'slate');
      b(o,side*(x+w*.48),y+8,z,4,3,20,'blue');
      for(let i=0;i<4;i++)b(o,side*(x+w*.58),y+1,z-7+i*5,2,4,3,i%3===0?'white':'dim');
    }
    b(o,side*33,119,-136,11,9,42,'blue');
    b(o,side*31,125,-139,7,4,35,'pearl');
    b(o,side*31,126,-121,5,2,2,'sun');
  }
  // Axial light lance, with a recessed final emitter and stepped focusing rails.
  for(let i=0;i<29;i++){
    const z=146+i*12,w=46-i*.71;
    b(o,0,36,z,w*1.44,24,12,'black');
    for(const s of [-1,1]){
      b(o,s*w*.77,52-i*.26,z,w*.49,18,12,'blue');
      b(o,s*w*.79,64-i*.28,z,w*.36,7,12,i%6===0?'gold':'frost');
      b(o,s*w*.52,53-i*.27,z,4,4,10,'dim');
      b(o,s*w*.50,36,z,5,6,10,'gold');
    }
    if(i%4===0) b(o,0,48,z,32,3,4,'iron');
  }
  for(let i=0;i<5;i++)frameXY(o,0,37,504+i*5,62-i*4,44-i*3,5,5,i%2?'gold':'slate');
  b(o,0,37,506,33,21,5,'lamp');
  const drives=[[-85,3,-528,74,58],[85,3,-528,74,58],[-157,9,-488,57,41],[157,9,-488,57,41],
    [0,-32,-550,71,40],[-48,42,-512,37,26],[48,42,-512,37,26]];
  for(const [x,y,z,w,h] of drives){
    b(o,x,y,z+26,w+8,h+5,47,'slate');
    for(const side of [-1,1]){
      b(o,x+side*(w*.5+6),y,z+12,8,h*.88,33,'blue');
      b(o,x+side*(w*.5+8),y+h*.28,z+3,5,5,23,'pearl');
      b(o,x+side*(w*.5+9),y-h*.22,z+2,2,4,12,'dim');
      b(o,x+side*w*.24,y+h*.57,z+16,w*.28,7,25,'iron');
    }
  }
  for(const [x,y,z,w,h] of drives)exhaustCavity(o,x,y,z,w,h);
  for(const [x,y,z,w,h] of drives){
    throat(o,x,y,z,w,h);
    flagEngines.push([x,y,z-2,w]);
    if(w>50)for(const side of [-1,1]){
      b(o,x+side*w*.29,y-h*.48,z-1,6,3,3,'sun');
      b(o,x+side*w*.31,y+h*.48,z-4,4,2,3,'white');
    }
  }
  const glyphs=['111101101101111','111001010010010'];
  for(const [q,glyph] of glyphs.entries())for(let i=0;i<glyph.length;i++)if(glyph[i]==='1')
    b(o,-158+(i%3+q*4)*4,67,-410+Math.floor(i/3)*4,4,3,4,'gold');
  // Raised voxel stencil on the outer hull above the approach opening.
  b(o,196,27,-264,27,16,43,'deep');
  const signs=[
    ['111','101','101','101','111'],
    ['111','001','010','010','010']
  ];
  for(const [digit,rows] of signs.entries())for(let row=0;row<5;row++)for(let col=0;col<3;col++){
    if(rows[row][col]==='1') b(o,211,20+(4-row)*3,-253-(digit*4+col)*3,2,3,3,'frost');
  }
  o.cut([9,-42,-350],[160,28,19]);
  o.cut([156,-36,-328],[244,16,-236]);
  o.cut([124,-38,hangarOrigin[2]+hangarExit[0]],[231,17,hangarOrigin[2]+hangarExit[1]]);
  // Large cladding panels alternate with dark intercooler channels.
  for(const [z,d,x] of [[-212,29,166],[-178,28,166],[-141,35,167],[-102,34,165],[-64,32,168]]){
    b(o,x,-11,z,8,48,d,'iron');
    b(o,x+5,-12,z,4,42,d-4,'blue');
    b(o,x+8,6,z-3,3,6,d-7,'pearl');
    b(o,x+7,-22,z+1,3,11,d-7,'slate');
    for(let k=0;k<Math.floor(d/5)-1;k++){
      b(o,x+9,-22,z-d*.5+5+k*5,2,9,2,'iron');
      if(k%3===0)b(o,x+9,-5,z-d*.5+6+k*5,2,2,3,'sun');
    }
  }
  for(const side of [-1,1])for(let i=0;i<6;i++){
    const z=36+i*46, x=side*(68-i*3.65), y=51-i*4.7;
    b(o,x,y-4,z,26-i*2,9,34,'slate');
    b(o,x,y+1,z+1,22-i*2,4,28,'pearl');
    b(o,x,y+4,z-8,17-i,2,5,'stripe');
    b(o,x+side*5,y+4,z+7,2,2,11,'dim');
  }
  const foredeck=new Blocks();
  for(let i=0;i<o.data.length;i+=12){
    const block=o.data.slice(i,i+12);
    if(block[2]-block[5]*.5>102&&block[1]+block[4]*.5>15)foredeck.data.push(...block);
  }
  o.foredeck=foredeck.build();
  return o.build();
}
const escortPorts={guard:[[-20,-3,-83,22],[20,-3,-83,22],[0,7,-87,19]],vanguard:[[-25,0,-97,23],[25,0,-97,23],[0,-7,-89,13]]};
function vanguardCell(side,index){
  return [side*(56-Math.max(index-3,0)*1.8),13,-42+index*11];
}
function guardMount(side,index){
  return [side*(46-index*7),25+(index%2)*2,-40+index*27];
}
function escort(long) {
  const o=new Blocks(),type=long?'vanguard':'guard';
  const body=long?[[-90,26,17],[-54,29,22],[19,19,17],[79,10,11],[108,5,6]]:[[-84,32,21],[-64,51,27],[-17,56,32],[22,39,32],[54,28,18],[84,14,11]];
  profile(o,body,4,(z,d,[w,h],i,n,k)=>{
    b(o,0,0,z,w*2,h,d,'iron');
    b(o,0,-h*.49,z,w*1.54,h*.39,d,'blue');
    b(o,0,h*.29,z,w*1.8,h*.58,d,'pearl');
    b(o,0,h*.54,z,w*1.46,4,d,'frost');
    for(const s of [-1,1]){
      b(o,s*w*.8,h*.56,z,w*.20,4,d,i%6===0?'stripe':'slate');
      b(o,s*w*.91,0,z,4,3,d,i%3?'dim':'black');
    }
  });
  for(const s of [-1,1]){
    const rail=long?[[-73,33,15],[-55,56,20],[4,58,18],[52,44,18],[76,34,12],[98,21,4]]:[[-71,26,13],[-50,45,18],[-24,64,23],[-3,61,21],[35,39,13],[57,23,9]];
    profile(o,rail,4,(z,d,[x,w],i)=>{
      b(o,s*x,-4,z,w,11,d,'slate');
      b(o,s*x,2,z,w,5,d,'blue');
      b(o,s*x,5,z,w-4,3,d,'pearl');
      b(o,s*(x+w*.37),6,z,3,2,d,i%4===0?'sun':'gold');
    });
    if(long) for(let j=0;j<7;j++){
      const [x,,z]=vanguardCell(s,j);
      b(o,x,7,z,17,3,9,'black');
      b(o,x,9,z-4,11,3,2,'blue');
      for(const u of [-1,1]){
        b(o,x+u*6,12,z,3,3,10,'frost');
        b(o,x+u*7,11,z,2,2,4,j%3===0?'sun':'slate');
      }
    }
    else{
      for(let j=0;j<3;j++){
        const [x,y,z]=guardMount(s,j);
        b(o,x,y-8,z,15,12,17,'iron');
        b(o,x,y-5,z,15,5,12,'slate');
        b(o,x+s*6,y-4,z,3,3,9,'gold');
        turret(o,x,y-4,z,12,true,false);
      }
      for(let j=0;j<7;j++){
        const z=-51+j*8,x=s*(49+sin(j*.49)*12);
        b(o,x,-9,z,11,12,4,'iron');
        b(o,x,-13,z+2,8,5,3,'blue');
        b(o,x+s*5,-9,z,2,3,2,j%3===0?'sun':'dim');
      }
    }
  }
  if(long)for(const s of [-1,1]){
    for(let j=0;j<5;j++){
      const z=-51+j*8,x=s*(43+j*2.1);
      b(o,x,-12,z,18,4,7,'iron');
      b(o,x+s*3,-14,z+1,8,2,5,'blue');
    }
    b(o,s*14,13,63,5,4,23,'blue');
    b(o,s*15,16,65,4,2,14,'gold');
  }
  for(let i=0;i<7;i++){
    b(o,0,(long?14:20)+i*2,-35-i*3,(long?24:37)-i*3,6,33-i*3,i%2?'blue':'pearl');
    b(o,0,(long?15:21)+i*2,-17-i*1.4,(long?17:24)-i*2,2,3,'lamp');
  }
  for(const [x,y,z,w] of escortPorts[type]){
    if(long&&x!==0){
      b(o,x,y,z+11,w+4,15,19,'iron');
      b(o,x,y+7,z+12,w+5,6,15,'blue');
    }
    exhaustCavity(o,x,y,z,w,long&&x!==0?14:Math.round(w*.77));
  }
  for(const [x,y,z,w] of escortPorts[type]){
    if(long&&x!==0)flaredPort(o,x,y,z,w);
    else throat(o,x,y,z,w,Math.round(w*.77));
  }
  return o.build();
}
function cutter() {
  const o=new Blocks();
  profile(o,[[-16,5,5],[-9,10,7],[2,8,6],[10,5,4],[17,2,2]],1,(z,d,[w,h])=>{
    b(o,0,0,z,w*2,h,d,'iron');
    b(o,0,h*.43,z,w*1.8,3,d,'pearl');
    if(z<8)for(const s of [-1,1]){
      b(o,s*(w+1),-1,z,5,3,d,'blue');
      b(o,s*(w+1),1,z,3,1,d,'gold');
    }
  });
  for(const s of [-1,1])for(let i=0;i<6;i++){
    b(o,s*(6+i),-1,-9-i,4,3,2,'blue');
    b(o,s*(6+i),1,-9-i,3,1,2,i>2?'gold':'pearl');
    if(i===5)b(o,s*(6+i),0,-15,2,2,1,'dim');
  }
  b(o,0,5,1,5,3,11,'black');
  b(o,0,6,2,4,2,8,'glass');
  for(const s of [-1,1])throat(o,s*4,-1,-17,6,5);
  return o.build();
}
function missile() {
  const o=new Blocks();
  b(o,0,0,0,3,3,10,'pearl');b(o,0,0,6,2,2,3,'stripe');
  b(o,0,0,8,1,1,2,'frost');b(o,0,0,-5,5,2,3,'blue');b(o,0,0,-5,2,5,3,'blue');
  b(o,0,0,-6,2,2,1,'white');return o.build();
}
const flagModel=flagship(),guardModel=escort(false),vanguardModel=escort(true),cutterModel=cutter(),missileModel=missile();
const rackHalf=(()=>{
  const o=new Blocks();
  b(o,0,0,0,4,2,9,'blue');
  b(o,0,1,1,3,1,6,'red');
  b(o,0,1,-4,4,1,1,'gold');
  return o.build();
})();
const readyRacks=(()=>{
  const o=new Blocks();
  for(const side of [-1,1])for(let i=0;i<7;i++){
    const [x,y,z]=vanguardCell(side,i);
    for(const half of [-1,1]){
      b(o,x+half*2,y-1,z,4,2,9,'blue');
      b(o,x+half*2,y,z+1,3,1,6,'red');
      b(o,x+half*2,y,z-4,4,1,1,'gold');
    }


  }
  return o.build();
})();
const muzzleGate=(()=>{
  const o=new Blocks();
  b(o,0,0,0,12,17,4,'slate');
  b(o,0,0,2,10,14,2,'blue');
  b(o,0,0,3,4,12,1,'gold');
  return o.build();
})();
const trackingTurret=(()=>{
  const o=new Blocks();
  b(o,0,0,-2,12,5,10,'iron');
  b(o,0,2,-2,10,3,8,'pearl');
  b(o,0,4,-4,8,1,4,'gold');
  b(o,0,-1,3,8,3,5,'blue');
  for(const x of [-2,2]){
    b(o,x,0,6,2,2,11,'iron');
    b(o,x,1,4,3,1,6,'slate');
    b(o,x,0,10,3,3,3,'blue');
    b(o,x,0,12,1,1,1,'lamp');
  }
  return o.build();
})();
function octagon(o,y,r,k,h,m,z0=0) {
  const corner=Math.round(r*.60);
  for(const s of [-1,1]){
    b(o,0,y,z0+s*r,corner*2,h,k,m); b(o,s*r,y,z0,k,h,corner*2,m);
    for(let j=0;j<r-corner;j+=3) for(const t of [-1,1]){
      b(o,s*(corner+j+1.5),y,z0+t*(r-j),3,h,k+2,m);
    }
  }
}
function roomLetter(o,symbol,x,y,z,size) {
  const digits={
    '0':['111','101','101','101','111'],
    '1':['010','110','010','010','111'],
    '2':['111','001','111','100','111'],
    '7':['111','001','010','010','010'],
    'A':['010','101','111','101','101']
  };
  for(const [j,n] of digits[symbol].entries())for(let i=0;i<3;i++)if(n[i]==='1')
    b(o,x-(i-1)*size,y+(2-j)*size,z,size,size,1,'frost');
}
function deck(o,w,z,length) {
  b(o,0,-3,z,w,6,length,'iron');
  for(let i=-Math.floor(length/16);i<=Math.floor(length/16);i++){
    const p=z+i*8;
    b(o,0,.5,p,w*.155,1,7,'deckMetal');
    for(const s of [-1,1]) {
      b(o,s*w*.37,.2,p,w*.19,1,7,'slate');
      b(o,s*w*.18,.2,p,w*.15,1,7,'deckInset');
      b(o,s*w*.095,.3,p,1,1,6,'dim');
      if(i%4===0)b(o,s*w*.25,.3,p,6,1,1,'stripe');
    }
  }
}
function panel(o,x,y,z,w,h,seed) {
  const r=random(seed);
  b(o,x,y,z,w+2,h+2,2,'blue');b(o,x,y,z-2,w,h,1,'black');
  b(o,x,y+h*.43,z-3,w-1,1,1,'dim');
  b(o,x-w*.25,y+h*.20,z-3,w*.37,1,1,'white');
  b(o,x+w*.31,y+h*.20,z-3,w*.23,1,1,'sun');
  for(let j=0;j<Math.floor(w-4);j++){
    const k=1+Math.floor(r()*h*.48);
    b(o,x-w*.5+2+j,y-h*.3+k*.5,z-3,1,k,1,j%5===0?'lamp':'glass');
  }
  b(o,x-w*.17,y-h*.43,z-3,w*.57,1,1,'dim');
}
function bridge() {
  const o=new Blocks();
  deck(o,130,0,132);
  b(o,0,59,-7,130,5,119,'navy');
  b(o,0,25,-66,130,61,5,'iron');
  for(const s of [-1,1]){
    b(o,s*66,28,0,6,62,135,'iron');
    b(o,s*54,12,0,21,5,132,'blue');
    b(o,s*43,14,0,2,2,132,'dim');
    b(o,s*43,19,0,1,1,132,'blue');
    for(let j=0;j<7;j++){
      const z=-55+j*17;
      b(o,s*62,32,z,7,52,5,'slate');
      b(o,s*64,38,z+6,3,24,12,'deep');
      b(o,s*60,37,z+7,1,12,2,'dim');
      b(o,s*44,17,z,2,6,2,'slate');
      b(o,s*53,16,z,15,4,8,'black');
      b(o,s*53,18,z-1,15,2,7,'pearl');
      b(o,s*53,19,z-1,12,1,4,'glass');
      panel(o,s*53,23,z+3,12,5,140+j);
      b(o,s*26,3,z+4,8,6,4,'iron');
      b(o,s*26,6,z+3,13,2,7,'blue');
      b(o,s*26,7,z+3,10,1,5,'dim');
      panel(o,s*26,10,z+6,11,5,120+j);
    }
    for(const z of [-53,-21,15,48,65]){
      b(o,s*55,42,z,9,27,5,'blue');
      b(o,s*45,52,z,14,11,5,'blue');
      b(o,s*39,55,z,19,8,5,'pearl');
      b(o,s*44,47,z-3,19,1,1,'dim');
      b(o,s*53,36,z-3,1,15,1,'sun');
    }
  }
  for(const z of [-53,-21,15,48,65]){
    b(o,0,55,z,68,7,6,'slate');
    b(o,0,51,z,52,2,4,'pearl');
    b(o,0,49,z,32,1,2,'dim');
  }
  b(o,0,5,66,118,10,8,'slate');
  for(const x of [-57,-35,35,57]){
    b(o,x,32,65,3,52,4,'blue');
    b(o,x-1,29,62,1,34,1,'stripe');
  }
  octagon(o,1,19,3,3,'iron',16);octagon(o,4,15,2,3,'blue',16);
  b(o,0,3,16,26,6,27,'iron');b(o,0,7,16,22,3,22,'slate');
  octagon(o,8,10,2,2,'lamp',16);
  b(o,0,9,16,12,2,11,'glass');
  for(const s of [-1,1]){
    panel(o,s*35,37,54,28,12,81+s);
    b(o,s*35,46,55,2,8,2,'iron');
  }
  for(const side of [-1,1]){
    b(o,side*18,40,18,5,6,14,'iron');
    b(o,side*20,45,19,3,13,3,'slate');
    b(o,side*18,36,18,5,2,10,'pearl');
    b(o,side*17,34,17,2,2,7,'lamp');
    for(let j=0;j<11;j++){
      const z=-51+j*9;
      b(o,side*62,49,z,3,3,5,j%4===0?'sun':'dim');
    }
    b(o,side*61,8,47,7,10,13,'black');
    b(o,side*59,11,40,8,2,2,'gold');
  }
  b(o,0,42,18,31,5,13,'slate');
  b(o,0,39,18,24,2,10,'iron');
  b(o,0,38,18,14,1,4,'dim');
  return o.build();
}
function coreHall(){
  const o=new Blocks(),r=random(9451);
  b(o,0,-119,0,248,9,248,'iron');b(o,0,130,0,248,8,248,'iron');
  for(const s of [-1,1]){
    b(o,s*125,6,0,8,250,249,'navy');b(o,0,6,s*125,249,250,8,'navy');
    for(let i=-5;i<=5;i++){
      const z=i*22;
      b(o,s*120,3,z,7,241,6,'deep');b(o,z,3,s*120,6,241,7,'deep');
      b(o,s*116,12,z,1,185,2,i%2?'iron':'dim');
      b(o,z,12,s*116,2,185,1,i%2?'iron':'dim');
    }
  }
  for(let k=0;k<6;k++){
    const y=-98+k*39;
    for(const s of [-1,1]){
      b(o,s*110,y,0,22,8,241,'blue');b(o,0,y,s*110,241,8,22,'blue');
      b(o,s*98,y+2,0,2,4,230,'slate');b(o,0,y+2,s*98,230,4,2,'slate');
      b(o,s*97,y+4,0,1,1,227,'dim');b(o,0,y+4,s*97,227,1,1,'dim');
      b(o,s*97,y+12,0,1,1,227,'iron');b(o,0,y+12,s*97,227,1,1,'iron');
      for(let i=-5;i<=5;i++){
        b(o,s*97,y+9,i*18,2,9,2,'blue');b(o,i*18,y+9,s*97,2,9,2,'blue');
      }
      for(let i=-3;i<=3;i++){
        const q=i*29+((k%2)*2-1)*4;
        for(const axis of [0,2]){
          const rib=(out,v,along,reach,h,w,material)=>{
            if(axis===0)b(o,s*out,v,along,reach,h,w,material);
            else b(o,along,v,s*out,w,h,reach,material);
          };
          rib(109,y-5,q,20,3,11,'iron');
          rib(104,y-7,q,14,2,8,'slate');
          rib(101,y-8,q,7,1,5,'pearl');
          rib(103,y-9,q,5,1,1,i%3===0?'sun':'dim');
        }
      }
      b(o,s*100,y-4,0,3,2,220,'iron');b(o,0,y-4,s*100,220,2,3,'iron');
      b(o,s*100,y-5,0,1,1,220,'dim');b(o,0,y-5,s*100,220,1,1,'dim');
      if(k%2===0){
        b(o,s*81,y+5,0,44,13,19,'slate');b(o,s*80,y+12,0,43,3,12,'pearl');
        b(o,s*79,y+13,0,43,2,2,'dim');
        b(o,0,y+5,s*81,19,13,44,'slate');b(o,0,y+12,s*80,12,3,43,'pearl');
      }
    }
  }
  // Opposing stair-stepped housings leave the center of the chamber open.
  for(const end of [-1,1]){
    for(let j=0;j<10;j++){
      const y=end*(26+j*9), taper=20+j*2.7, w=5+j*.6;
      for(const x of [-1,1])for(const z of [-1,1]){
        b(o,x*taper,y,z*taper,w+4,10,w+4,j%3===0?'slate':'iron');
        b(o,x*(taper+w*.52),y,z*taper,4,9,w,'blue');
        b(o,x*(taper-4),y,z*(taper-3),2,8,4,j%3===0?'sun':'dim');
        b(o,x*taper,y,z*(taper-4),w,2,2,'pearl');
      }
      const inner=6+j*.8;
      b(o,0,y,0,inner*2,8,inner*2,j%4===0?'glass':'iron');
      for(let q=0;q<4;q++){
        const a=q*Math.PI/2+j*.37+(end>0?.60:0), d=8+j*.85+r()*3;
        b(o,cos(a)*d,y-1,sin(a)*d,5+j*.16,7,5+j*.17,j%4===0?'white':end>0&&q===2?'vio':'lamp');
        b(o,cos(a)*d*.69,y+2,sin(a)*d*.69,3,3,3,'white');
      }
      if(j===2||j===6)octagon(o,y,taper+12,8,8,'pearl');
    }
    for(let j=0;j<3;j++){
      octagon(o,end*(106+j*6),52+j*7,9,6,j===1?'blue':'iron');
      octagon(o,end*(104+j*6),49+j*7,2,2,j===1?'gold':'dim');
    }
    octagon(o,end*23,27,7,6,'slate');
    octagon(o,end*21,24,2,2,'lamp');
    for(let j=0;j<9;j++){
      const u=j/8, y=end*(105+12*u), x=47+u*36;
      for(const side of [-1,1]){
        b(o,side*x,y,0,7,12,18,'blue');
        b(o,side*x,y-end*7,0,6,2,8,j%3===0?'sun':'dim');
        b(o,0,y,side*x,18,12,7,'blue');
      }
    }
  }
  for(const x of [-86,86])for(const z of [-41,41]){
    b(o,x,3,z,11,224,9,'iron');
    b(o,x,3,z,7,220,7,'blue');
    for(let i=0;i<11;i++){
      const y=-98+i*20;
      b(o,x,y,z,13,5,11,'slate');
      b(o,x-Math.sign(x)*5,y+4,z,2,8,4,i%3===1?'sun':'dim');
      if(i%4===1){
        b(o,x+Math.sign(x)*10,y,z,20,7,13,'gold');
        b(o,x+Math.sign(x)*16,y+3,z,8,3,13,'pearl');
      }
    }
  }
  return o.build();
}
function rotatingFrame(r,type) {
  const o=new Blocks();
  octagon(o,-2,r,6,6,type?'slate':'blue');octagon(o,2,r+3,3,2,'pearl');octagon(o,3,r-4,2,2,'dim');
  for(const s of [-1,1]){
    b(o,0,3,s*r,30,8,12,'iron');b(o,s*r,3,0,12,8,30,'iron');
    b(o,0,7,s*r,18,3,8,'gold');b(o,s*r,7,0,8,3,18,'gold');
    b(o,0,9,s*r,12,1,3,'white');b(o,s*r,9,0,3,1,12,'lamp');
  }
  return o.build();
}
function hangar(){
  const o=new Blocks();
  deck(o,142,0,360);
  b(o,0,66,0,144,7,362,'navy');b(o,0,33,-180,143,70,7,'navy');
  for(const s of [-1,1]){
    b(o,s*74,32,0,9,68,360,'navy');
    b(o,s*63,32,0,17,6,360,'slate');
    b(o,s*55,36,0,2,2,360,'dim');b(o,s*56,41,0,1,1,360,'blue');
    for(let j=0;j<8;j++){
      const z=-151+j*41;
      b(o,s*71,16,z,9,30,34,'black');
      b(o,s*53,2,z,33,4,34,'blue');
      b(o,s*50,4,z,31,2,28,'iron');
      b(o,s*45,5,z-14,20,1,1,'sun');
      b(o,s*45,5,z+14,20,1,1,'dim');
      b(o,s*34,4,z,2,3,27,'pearl');
      b(o,s*70,23,z+15,11,9,6,'slate');
      b(o,s*62,20,z+15,13,6,4,'gold');
      b(o,s*56,17,z+15,4,10,4,'iron');
      b(o,s*56,13,z+15,6,2,6,'lamp');
      b(o,s*69,36,z+12,4,15,5,'blue');
      b(o,s*62,39,z,4,6,2,'slate');
      for(let l=0;l<4;l++)b(o,s*(50+l*4),1,z-11,2,1,2,'stripe');
    }
  }
  for(const z of [-160,-86,-13,61,128,177]){
    frameXY(o,0,31,z,140,67,9,8,'slate');
    frameXY(o,0,32,z-5,127,58,4,4,'blue');
    b(o,0,53,z,111,6,12,'iron');
    b(o,0,51,z-7,110,2,2,'blue');
    b(o,0,48,z-4,42,2,3,'dim');
    b(o,44,51,z-8,12,9,1,'iron');
    roomLetter(o,'A',46,51,z-9,1);
    roomLetter(o,z>0?'2':'1',41,51,z-9,1);
    for(const s of [-1,1]){
      b(o,s*60,48,z,13,15,11,'iron');
      b(o,s*53,32,z-8,2,32,2,z===177?'white':'sun');
      b(o,s*46,59,z-7,12,3,5,'pearl');
      b(o,s*4,.6,z-1,3,1,3,'lamp');
    }
  }
  for(const x of [-15,15]) for(let i=0;i<53;i++)
    b(o,x,1,-170+i*6.5,2,1,3,i%8===0?'white':'dim');
  for(const [from,to] of [[-76,-19],[72,116]])for(const side of [-1,1]){
    const d=to-from,z=(from+to)/2;
    b(o,side*29,57,z,5,5,d,'iron');
    b(o,side*29,54,z,2,1,d,'blue');
    for(const a of [from,to])b(o,side*29,61,a,6,9,5,'slate');
  }
  b(o,0,34,180,143,68,7,'iron');
  frameXY(o,0,31,173,107,53,8,5,'pearl');
  frameXY(o,0,31,168,92,46,5,4,'deep');
  b(o,0,31,174,82,38,4,'navy');
  for(const x of [-26,-12,12,26]){
    b(o,x,31,171,2,31,2,'dim');
    b(o,x,12,169,5,3,2,'sun');
  }
  b(o,0,54,168,42,3,2,'lamp');
  // Both lateral openings are shared with the exterior hull.
  o.cut([49,4,-163],[96,56,-71]);
  o.cut([39,3,hangarExit[0]],[97,57,hangarExit[1]]);
  for(const [a,c] of [[-163,-71],hangarExit]){
    for(const z of [a-3,c+3]){
      b(o,74,29,z,13,56,6,'slate');
      b(o,78,28,z,2,45,2,'sun');
    }
    b(o,73,55,(a+c)/2,13,4,c-a,'blue');
    b(o,74,52,(a+c)/2,4,2,c-a,'lamp');
  }
  return o.build();
}
function conduit(){
  const o=new Blocks();
  deck(o,106,0,362);
  b(o,0,72,-28,109,7,312,'iron');
  b(o,0,72,158,134,7,64,'iron');
  b(o,0,36,-181,109,74,6,'iron');
  b(o,0,35,194,137,75,7,'iron');
  b(o,0,-3,187,131,6,15,'iron');
  for(const s of [-1,1]){
    b(o,s*54,34,-28,6,74,309,'navy');
    b(o,s*58,34,138,7,74,28,'iron');
    b(o,s*65,35,170,9,74,40,'navy');
    b(o,s*58,-3,156,18,6,60,'iron');
    b(o,s*18,64,-29,11,9,305,'iron');
    b(o,s*18,59,-29,7,3,305,'blue');
    b(o,s*18,57.5,-28,2,1,305,'dim');
    b(o,s*18,3,-28,7,5,308,'iron');
    b(o,s*18,6,-28,2,1,308,'dim');
    for(let j=0;j<9;j++){
      const z=-160+j*35;
      b(o,s*39,30,z,23,54,20,'black');
      b(o,s*41,29,z,19,49,17,'iron');
      b(o,s*32,29,z,5,51,19,'slate');
      b(o,s*36,29,z-10,12,41,2,'glass');
      b(o,s*36,29,z-12,4,38,2,'sun');
      b(o,s*44,29,z-10,4,35,3,'blue');
      for(const y of [13,41]){
        b(o,s*34,y,z-1,18,7,23,'pearl');
        b(o,s*34,y+4,z-2,15,1,21,'gold');
      }
      b(o,s*42,58,z-4,21,8,9,'slate');
      b(o,s*30,57,z-4,5,6,5,'sun');
      if(j%3===1){
        b(o,s*49,28,z-4,6,39,9,'blue');
        b(o,s*46,35,z-6,2,17,5,'dim');
        for(const y of [18,25,40])b(o,s*45,y,z-6,3,3,8,'pearl');
      }
    }
    for(let j=0;j<11;j++){
      const u=j/10, x=s*mix(18,9,u), z=123+j*5;
      for(const y of [mix(6,24,u),mix(58,44,u)]){
        b(o,x,y,z,7,5,7,'iron');
        b(o,x,y+2,z,3,2,7,j%3===0?'white':'dim');
      }
    }
    for(const [z,w] of [[144,14],[160,22],[177,18]]){
      const x=s*(57-w*.15);
      b(o,x,20,z,w,34,13,'iron');
      b(o,x-s*3,28,z,w-6,28,8,'slate');
      b(o,x-s*5,22,z-5,3,22,3,'sun');
      b(o,x-s*7,36,z,w-4,3,9,'pearl');
    }
  }
  for(const z of [-176,-115,-54,7,68,128]){
    frameXY(o,0,34,z,104,67,9,7,'slate');
    frameXY(o,0,33,z-5,92,62,3,3,'blue');
    b(o,0,63,z-6,64,6,4,'pearl');
    b(o,0,62,z-9,16,9,1,'iron');
    roomLetter(o,'0',3,62,z-10,1);
    roomLetter(o,'7',-3,62,z-10,1);
    for(const s of [-1,1]){
      b(o,s*45,57,z-6,12,11,4,'gold');
      b(o,s*43,26,z-6,2,31,2,'dim');
    }
  }
  // Open frames border the wider terminal bay and a second, recessed emitter.
  for(const [z,w,h] of [[143,102,68],[150,91,65],[157,85,61],[178,84,63],[185,72,57]]){
    frameXY(o,0,34,z,w,h,5,4,z<177?'slate':'pearl');
    frameXY(o,0,34,z-2,w-9,h-6,3,3,z%2?'blue':'iron');
    for(const side of [-1,1]){
      b(o,side*(w*.5-2),49,z,7,10,8,'iron');
      b(o,side*(w*.5-5),45,z-3,2,9,2,'dim');
      b(o,side*(w*.5-5),24,z-3,2,8,2,'sun');
    }
  }
  b(o,0,35,191,65,52,3,'black');
  frameXY(o,0,35,189,55,49,2,3,'gold');
  for(let i=0;i<9;i++){
    const spread=10+Math.abs(i-4)*2, y=19+i*4;
    b(o,0,y,190,spread*2,2,2,i%3===0?'white':'sun');
    for(const side of [-1,1]){
      b(o,side*(spread+4),y,188,3,3,4,'blue');
      b(o,side*(spread+8),y,189,3,2,1,'dim');
    }
  }
  return o.build();
}

const bridgeModel=bridge(), coreModel=coreHall(), hangarModel=hangar(), conduitModel=conduit();
const bayShutter=(()=>{
  const o=new Blocks();
  b(o,0,0,0,5,49,26,'iron');
  b(o,-3,1,0,3,43,23,'slate');
  b(o,-5,0,0,2,39,18,'blue');
  b(o,-6,20,0,2,4,19,'pearl');
  for(const z of [-8,8]){
    b(o,-6,-2,z,1,30,2,'black');
    b(o,-7,6,z,1,15,1,'sun');
    b(o,-7,-12,z,1,3,1,'dim');
  }
  for(const y of [-16,-1,15])b(o,-7,y,0,2,3,16,y===-1?'gold':'slate');
  return o.build();
})();
function collimator(radius,inner){
  const o=new Blocks(), edge=(r,y)=>r-Math.max(0,Math.abs(y)-Math.floor(r*.62));
  for(let y=-radius;y<=radius;y++){
    const outer=edge(radius,y);
    const aperture=Math.abs(y)>radius-4?0:edge(radius-4,y);
    if(aperture<1)b(o,0,y,0,outer*2,1,4,inner?'blue':'slate');
    else for(const side of [-1,1]){
      b(o,side*(outer+aperture)*.5,y,0,outer-aperture,1,4,inner?'blue':'pearl');
      if(y%4!==0)b(o,side*(aperture+.75),y,-2,1,1,1,inner?'lamp':'sun');
    }
  }
  for(const side of [-1,1]){
    b(o,0,side*(radius-2),-2,13,3,3,inner?'iron':'gold');
    b(o,0,side*(radius-2),-4,7,1,1,inner?'dim':'white');
  }
  return o.build();
}
const conduitCollimators=[collimator(23,false),collimator(17,true)];
const liftGantry=(()=>{
  const o=new Blocks();
  for(const side of [-1,1]){
    b(o,side*28,2,0,11,7,12,'slate');
    b(o,side*29,6,0,7,2,10,'iron');
    b(o,side*18,0,0,17,4,7,'pearl');
    b(o,side*15,-3,0,11,2,7,'gold');
    b(o,side*10,-6,0,5,8,7,'iron');
    b(o,side*8,-9,0,6,3,7,'slate');
    b(o,side*7,-10,0,4,1,5,'sun');
  }
  b(o,0,1,0,31,5,11,'iron');
  b(o,0,-2,0,20,2,9,'blue');
  b(o,0,-4,-3,11,2,2,'dim');
  return o.build();
})();
const bridgeGlass=(()=>{
  const o=new Blocks();
  for(const [x,w] of [[-46,18],[0,66],[46,18]])b(o,x,29,65,w,42,1,mat(0x73adc5));
  return o.build();
})();
const coreRings=[rotatingFrame(53,0),rotatingFrame(63,1),rotatingFrame(69,0)];
const loaderJaw=(()=>{
  const o=new Blocks();
  b(o,0,0,0,9,5,7,'iron');
  b(o,0,-2,0,7,3,5,'blue');
  b(o,0,-4,0,3,3,5,'pearl');
  b(o,0,-5,-1,2,2,2,'sun');
  return o.build();
})();
const chargeModel=(()=>{
  const o=new Blocks();
  b(o,0,0,0,6,6,12,'glass');b(o,0,0,0,4,4,14,'white');
  for(const s of [-1,1])b(o,s*3,0,-3,2,7,3,'gold');
  return o.build();
})();
const loaderModel=(()=>{
  const o=new Blocks();
  b(o,0,0,0,9,9,14,'blue');b(o,0,-5,0,7,2,12,'gold');
  b(o,0,-6,0,2,2,8,'sun');b(o,0,6,0,4,5,6,'iron');return o.build();
})();
const reactorPacket=(()=>{
  const o=new Blocks();
  b(o,0,0,0,3,7,4,'glass');
  b(o,0,0,0,2,8,2,'white');
  b(o,-2,1,0,2,3,2,'vio');
  b(o,2,-1,0,2,3,2,'lamp');
  return o.build();
})();
const lanceCharge=(()=>{
  const o=new Blocks();b(o,0,0,0,4,4,10,'white');return o.build();
})();
function rock(seed,r,shape=0) {
  const rnd=random(seed), cell=Math.max(3,Math.round(r/13));
  const phase= rnd()*5, sx=.79+rnd()*.37, sy=.62+rnd()*.33, sz=.78+rnd()*.32;
  const palette=[mat(0x51495a,0,.14),mat(0x635366,0,.18),mat(0x74636d,0,.18),mat(0x8d7772,0,.18),mat(0x5f5564,0,.23),mat(0x4b424f,0,.13),mat(0x706171,0,.18),mat(0xb08365,0,.18)];
  const groups=Array.from({length:5},()=>new Blocks()), cells=new Map(), steps=Math.ceil(r/cell*1.3);
  const centers=groups.map(()=>[0,0,0,0]), positions=groups.map(()=>[]);
  const id=(i,j,k)=>[i,j,k].join();
  const crack=(i,j,k)=>(i+.51*j-.25*k+sin(k*.38+phase)*2.4);
  const bore=unit([.712,.221,.667]);
  for(let i=-steps;i<=steps;i++)for(let j=-steps;j<=steps;j++)for(let k=-steps;k<=steps;k++){
    const x=i*cell,y=j*cell,z=k*cell;
    const radius=Math.hypot(x/sx,y/sy,z/sz)/r;
    const warp=.14*sin(i*.29+k*.38+phase)+.12*cos(j*.39-i*.27)+.075*sin(k*.78+j*.55)+.037*cos(i*1.4+j*1.2+k*.9);
    const tunnel=Math.hypot(i+4.8+sin(k*.63)*1.65,j-3.9+cos(k*.42)*1.28)<2.0;
    const p=[x+r*.115,y-r*.295,z-r*.022], along=dot(p,bore);
    const arch=shape===1&&Math.hypot(p[0]-bore[0]*along,p[1]-bore[1]*along,p[2]-bore[2]*along)<r*(.272+.037*cos(along*.045));
    const cleft=shape===2&&y>r*.19&&Math.abs(x+.48*z+r*.15)<r*.11+(y-r*.18)*.45;
    if(radius>1.+warp||tunnel||arch||cleft||Math.abs(crack(i,j,k))<.58&&radius>.69&&j>0) continue;
    let g=crack(i,j,k)>0?0:1;
    if(j>4+sin(i*.4)*1.6&&k>-6)g=2;
    if(k<-5+sin(j*.45)*2&&j<2)g=3;
    if(i>5&&k>3+sin(j*.6))g=4;
    cells.set(id(i,j,k),g);
    positions[g].push([x,y,z]);
    centers[g][0]+=x;centers[g][1]+=y;centers[g][2]+=z;centers[g][3]++;
  }
  const adj=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(let i=-steps;i<=steps;i++)for(let j=-steps;j<=steps;j++)for(let k=-steps;k<=steps;k++){
    const g=cells.get(id(i,j,k));
    if(g===undefined || !adj.some(([a,b,c])=>cells.get(id(i+a,j+b,k+c))!==g))continue;
    const v=rnd(), seam=Math.abs(crack(i,j,k))<1.5;
    const band=.5+.5*sin(j*.91+k*.24-i*.27+.43*sin(i*.73+k*.37));
    const tone=seam&&v>.52?7:Math.floor((.13+.25*v+.56*band)*6.2);
    b(groups[g],i*cell,j*cell,k*cell,cell,cell,cell,palette[clamp(tone,0,7)]);
    if(cell>=4&&v>.79){
      const dir=adj.find(([a,b,c])=>!cells.has(id(i+a,j+b,k+c)));
      if(dir){
        const depth=cell>=8&&v>.94?2:1;
        const size=Math.max(2,Math.floor(cell*.36));
        const center=[i*cell,j*cell,k*cell].map((p,h)=>p+dir[h]*(cell*.5+depth*.5)+(1-Math.abs(dir[h]))*Math.round(sin(i*9+j*13+h*2)*cell*.16));
        groups[g].box(...center,...dir.map(q=>q?depth:size),palette[clamp(tone+(v>.93?1:-1),0,7)]);
      }
    }
  }
  const faults=Array.from({length:5},()=>new Blocks());
  for(let i=-steps;i<=steps;i++)for(let j=-steps;j<=steps;j++)for(let k=-steps;k<=steps;k++){
    const group=cells.get(id(i,j,k));
    if(group===undefined)continue;
    for(const step of adj){
      const [a,b,c]=step, neighbor=cells.get(id(i+a,j+b,k+c));
      const cutFace=neighbor!==undefined&&neighbor!==group;
      const outerCrack=neighbor===undefined&&Math.abs(crack(i,j,k))<1.2;
      if((!cutFace&&!outerCrack)||rnd()<(outerCrack?.52:.66))continue;
      const width=clamp(Math.floor(cell*(.32+rnd()*.37)),1,cell-1);
      const center=[i*cell,j*cell,k*cell].map((v,n)=>v+step[n]*(cell*.5+.5));
      faults[group].box(...center,...step.map(v=>v?1:width),mat(0x63505a,0,.16,2));
    }
  }
  const result=groups.map(o=>o.build());
  result.faults=faults.map(o=>o.build());
  result.anchors=centers.map(([x,y,z,n],i)=>{
    if(!n)return null;
    const center=[x/n,y/n,z/n];
    let best=Infinity,anchor=positions[i][0];
    for(const p of positions[i]){
      const d=(p[0]-center[0])**2+(p[1]-center[1])**2+(p[2]-center[2])**2;
      if(d<best){best=d;anchor=p;}
    }
    return anchor;
  });
  result.sample=(p,group)=>cells.get(id(...p.map(v=>Math.round(v/cell))))===group;
  result.step=Math.max(1,cell*.52);
  result.radius=r;
  return result;

}
const rockModels=[rock(5520,126,1),rock(9317,88,2),rock(737,57),rock(620,41),rock(122,24),rock(77,15)];
const fragments=Array.from({length:3},(_,i)=>{
  const o=new Blocks(), r=2+i*2;
  b(o,0,0,0,r,r+1,r+1,'slate');b(o,0,1,1,r-1,r,r,'blue');return o.build();
});





























