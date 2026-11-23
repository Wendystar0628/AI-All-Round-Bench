(function(){
'use strict';
const {VoxelBuilder, MAT, mulberry32, addNozzle, addPulseTurret, addCIWS, addMissilePod} = window.VOX;
const VE = window.VE;

function meshFrom(vb){ return VE.createMesh(...Object.values(vb.build())); }

/* ================================================================== */
/* FLAGSHIP                                                            */
/* ================================================================== */
function buildFlagship(){
  const vb=new VoxelBuilder();
  const L=1040;
  const prof=[
    {z:0,   hw:110, bot:30, top:135},
    {z:60,  hw:135, bot:18, top:155},
    {z:140, hw:155, bot:8,  top:175},
    {z:260, hw:170, bot:0,  top:190},
    {z:520, hw:165, bot:2,  top:188},
    {z:660, hw:150, bot:8,  top:178},
    {z:780, hw:125, bot:15, top:165},
    {z:880, hw:90,  bot:25, top:150},
    {z:950, hw:60,  bot:32, top:135},
    {z:1000,hw:38,  bot:40, top:115},
    {z:1040,hw:26,  bot:46, top:105}
  ];
  function pAt(z){
    for(let i=prof.length-1;i>=0;i--) if(z>=prof[i].z) return prof[i];
    return prof[0];
  }
  const hangarZ = z => ((z>=270&&z<390)||(z>=550&&z<670));

  // main shell
  for(let z=0;z<L;z++){
    const p=pAt(z);
    const hw=p.hw, bot=p.bot, top=p.top;
    vb.box(-hw,hw,top-1,top,z,z+1,MAT.HULL);
    vb.box(-hw,hw,bot,bot+1,z,z+1,MAT.HULL);
    if(!hangarZ(z)){
      vb.box(-hw,-hw+1,bot,top,z,z+1,MAT.HULL);
      vb.box(hw-1,hw,bot,top,z,z+1,MAT.HULL);
    } else {
      vb.box(-hw+28,-hw+30,28,82,z,z+1,MAT.DARK);
      vb.box(hw-30,hw-28,28,82,z,z+1,MAT.DARK);
      vb.box(-hw+2,-hw+28,28,30,z,z+1,MAT.HULL2);
      vb.box(hw-28,hw-2,28,30,z,z+1,MAT.HULL2);
      vb.box(-hw+2,-hw+28,80,82,z,z+1,MAT.HULL2);
      vb.box(hw-28,hw-2,80,82,z,z+1,MAT.HULL2);
    }
  }

  // step collars at profile changes
  for(let i=1;i<prof.length;i++){
    const z=prof[i].z, a=prof[i-1], b=prof[i];
    const hw=Math.max(a.hw,b.hw), bot=Math.min(a.bot,b.bot), top=Math.max(a.top,b.top);
    vb.box(-hw,hw,top-2,top,z-1,z+1,MAT.HULL2);
    vb.box(-hw,hw,bot,bot+2,z-1,z+1,MAT.HULL2);
    vb.box(-hw,-hw+2,bot,top,z-1,z+1,MAT.HULL2);
    vb.box(hw-2,hw,bot,top,z-1,z+1,MAT.HULL2);
  }

  // hangar frames
  for(const [z0,z1] of [[270,390],[550,670]]){
    for(const s of [-1,1]){
      const xo=s<0? -1:1;
      const xa=s<0? -175:165;
      const xb=s<0? -165:175;
      vb.box(xa,xb,24,28,z0-2,z1+2,MAT.TRIM);
      vb.box(xa,xb,82,86,z0-2,z1+2,MAT.TRIM);
      vb.box(xa,xb,24,86,z0-2,z0,MAT.TRIM);
      vb.box(xa,xb,24,86,z1,z1+2,MAT.TRIM);
      vb.box(xa,xb,30,32,z0+4,z1-4,MAT.CYAN);
      vb.box(xa,xb,78,80,z0+4,z1-4,MAT.CYAN);
    }
  }

  // side armor blocks
  vb.hollowBox(-182,-166,38,92,300,500,MAT.HULL,2);
  vb.hollowBox(166,182,38,92,300,500,MAT.HULL,2);
  vb.hollowBox(-172,-158,50,104,690,850,MAT.HULL2,2);
  vb.hollowBox(158,172,50,104,690,850,MAT.HULL2,2);
  vb.hollowBox(-158,-146,30,76,150,260,MAT.HULL2,2);
  vb.hollowBox(146,158,30,76,150,260,MAT.HULL2,2);

  // dorsal armor / spine
  vb.hollowBox(-150,150,190,200,280,560,MAT.HULL,2);
  vb.hollowBox(-60,60,200,228,360,640,MAT.HULL2,3);
  vb.hollowBox(-42,42,228,250,470,590,MAT.HULL,2);
  vb.hollowBox(-26,26,250,272,500,560,MAT.TRIM,2);
  // spine steps
  vb.box(-30,30,272,276,510,550,MAT.DARK);
  vb.box(-6,6,276,286,520,540,MAT.CYAN);

  // side wings
  for(const s of [-1,1]){
    const x0=s<0? -235:165, x1=s<0? -165:235;
    vb.hollowBox(x0,x1,58,80,280,620,MAT.HULL,2);
    const x0b=s<0? -215:165, x1b=s<0? -165:215;
    vb.hollowBox(x0b,x1b,30,50,350,560,MAT.HULL2,2);
    const x0c=s<0? -250:225, x1c=s<0? -225:250;
    vb.hollowBox(x0c,x1c,44,70,410,530,MAT.HULL,2);
    // wing edge trim
    vb.box(s<0? -237:233, s<0? -233:237, 58,80, 290,610, MAT.TRIM);
    vb.box(s<0? -217:213, s<0? -213:217, 30,50, 360,550, MAT.TRIM);
    // wing root trench
    vb.box(s<0? -170:168, s<0? -168:170, 52,58, 300,600, MAT.DARK);
    // wing lights
    vb.box(s<0? -236:234, s<0? -234:236, 66,70, 300,340, MAT.CYAN);
  }

  // bow prongs
  for(const s of [-1,1]){
    const x0=s<0? -74:20, x1=s<0? -20:74;
    vb.hollowBox(x0,x1,50,112,950,1040,MAT.HULL,3);
    vb.box(s<0? -70:48, s<0? -48:70, 52,110, 1000,1040,MAT.HULL2);
    vb.box(s<0? -60:40, s<0? -40:60, 58,104, 1020,1040,MAT.HULL);
    vb.box(s<0? -76:72, s<0? -72:76, 54,108, 952,1000,MAT.TRIM);
    // prong gap trench
    vb.box(s<0? -22:-20, s<0? -20:22, 52,108, 960,1040,MAT.DARK);
  }
  // bow center blade
  vb.hollowBox(-16,16,112,146,960,1010,MAT.HULL2,2);
  vb.box(-8,8,146,150,970,1000,MAT.CYAN);
  // outer prong steps and forward blades
  for(const s of [-1,1]){
    const xa=s<0? -96:72, xb=s<0? -72:96;
    vb.hollowBox(xa,xb,52,100,960,1060,MAT.HULL2,2);
    vb.box(s<0? -90:78, s<0? -78:90, 60,92, 1000,1060,MAT.HULL);
    vb.box(s<0? -100:92, s<0? -92:100, 64,84, 1020,1060,MAT.TRIM);
    vb.box(s<0? -88:-84, s<0? -84:88, 70,88, 1040,1090,MAT.HULL);
    vb.box(s<0? -86:-82, s<0? -82:86, 74,84, 1080,1100,MAT.TRIM);
    vb.box(s<0? -94:90, s<0? -90:94, 74,78, 970,1050,MAT.CYAN);
    vb.box(s<0? -24:-18, s<0? -18:24, 44,116, 940,1060,MAT.DARK);
  }
  // central dorsal blade
  vb.hollowBox(-14,14,120,170,980,1060,MAT.HULL,2);
  vb.box(-8,8,170,174,990,1050,MAT.CYAN);
  vb.box(-18,18,116,120,980,1060,MAT.TRIM);

  // beam cannon
  vb.hollowBox(-52,52,4,78,700,880,MAT.HULL2,3);
  vb.hollowBox(-22,22,34,66,880,1120,MAT.DARK,3);
  for(let z=900;z<=1100;z+=40){
    vb.box(-27,27,29,71,z,z+5,MAT.TRIM);
  }
  // glowing grooves
  vb.box(-23,-21,47,53,884,1112,MAT.CYAN);
  vb.box(21,23,47,53,884,1112,MAT.CYAN);
  vb.box(-6,6,66,68,884,1112,MAT.CYAN);
  // muzzle
  vb.box(-32,32,24,76,1120,1128,MAT.DARK);
  vb.box(-20,20,36,64,1120,1126,MAT.WHITE);
  vb.box(-12,12,44,56,1126,1132,MAT.CYAN);

  // stern engine block
  vb.hollowBox(-122,122,30,142,0,54,MAT.HULL2,4);
  const nozzles=[[-82,70],[-42,112],[0,146],[42,112],[82,70]];
  for(const [cx,cy] of nozzles) addNozzle(vb,cx,cy,-4,26,12,MAT.HULL2,MAT.CYAN);
  // stern rim
  vb.box(-125,125,26,32,0,8,MAT.TRIM);
  vb.box(-125,125,144,150,0,8,MAT.TRIM);

  // pulse turrets
  const turrets=[[-150,158,320],[150,158,320],[-150,158,520],[150,158,520],
                 [-150,158,720],[150,158,720],[0,238,470],[0,238,670]];
  for(const [x,y,z] of turrets) addPulseTurret(vb,x,y,z,1);

  // panel lines and greebles
  const rnd=mulberry32(12345);
  for(let i=0;i<90;i++){
    const z=80+Math.floor(rnd()*900);
    const p=pAt(z);
    const side=rnd()<0.5?-1:1;
    const y=Math.floor(p.bot+8+rnd()*(p.top-p.bot-16));
    const x=side*(p.hw+1+Math.floor(rnd()*7));
    const w=1+Math.floor(rnd()*4), h=1+Math.floor(rnd()*4), d=2+Math.floor(rnd()*9);
    vb.box(x,x+w,y,y+h,z,z+d, rnd()<0.55?MAT.HULL2:(rnd()<0.6?MAT.TRIM:MAT.DARK));
  }
  // top trench lines
  for(let z=200;z<900;z+=90){
    const p=pAt(z);
    vb.box(-p.hw+20,p.hw-20,p.top,p.top+1,z,z+2,MAT.DARK);
  }
  // gold edge strips
  for(let z=300;z<800;z+=80){
    const p=pAt(z);
    vb.box(-p.hw,p.hw-6,p.top,p.top+1,z,z+2,MAT.GOLD);
  }

  return {
    mesh: meshFrom(vb),
    length: L,
    centerZ: 520,
    radius: 560,
    nozzles,
    beamOrigin: [0,50,1132],
    turrets,
    shield: [245,195,650],
    name: 'flagship'
  };
}

/* ================================================================== */
/* GUARD                                                               */
/* ================================================================== */
function buildGuard(variant){
  const vb=new VoxelBuilder();
  const M=MAT;
  if(variant===0){
    vb.hollowBox(-32,32,12,58,28,164,M.HULL,3);
    vb.hollowBox(-26,26,16,54,0,32,M.HULL2,3);
    vb.hollowBox(-22,-5,22,46,164,192,M.HULL,2);
    vb.hollowBox(5,22,22,46,164,192,M.HULL,2);
    vb.hollowBox(-12,12,58,74,60,150,M.HULL2,2);
    vb.hollowBox(-58,-32,18,40,64,132,M.HULL,2);
    vb.hollowBox(32,58,18,40,64,132,M.HULL,2);
    vb.hollowBox(-46,-32,42,56,78,120,M.HULL2,2);
    vb.hollowBox(32,46,42,56,78,120,M.HULL2,2);
    vb.box(-60,60,60,64,120,128,M.TRIM);
    vb.box(-26,26,58,62,150,160,M.TRIM);
  } else {
    vb.hollowBox(-30,30,10,56,26,158,M.HULL,3);
    vb.hollowBox(-24,24,14,52,0,30,M.HULL2,3);
    vb.hollowBox(-18,-4,20,44,158,184,M.HULL,2);
    vb.hollowBox(4,18,20,44,158,184,M.HULL,2);
    vb.hollowBox(-14,14,56,72,54,146,M.HULL2,2);
    vb.hollowBox(-62,-30,16,38,58,128,M.HULL,2);
    vb.hollowBox(30,62,16,38,58,128,M.HULL,2);
    vb.hollowBox(-50,-30,40,54,74,116,M.HULL2,2);
    vb.hollowBox(30,50,40,54,74,116,M.HULL2,2);
    vb.box(-64,64,52,56,112,120,M.TRIM);
    vb.box(-20,20,56,60,146,154,M.TRIM);
    vb.hollowBox(-18,18,8,28,150,174,M.HULL2,2);
  }
  // engines
  const nozzles=[[-16,32,0],[0,38,0],[16,32,0]];
  for(const [x,y,z] of nozzles) addNozzle(vb,x,y,z-2,10,8,M.HULL2,M.CYAN);
  // CIWS
  const ciws=[[-20,72,70],[20,72,70],[-20,50,120],[20,50,120],[-44,42,90],[44,42,90]];
  for(const [x,y,z] of ciws) addCIWS(vb,x,y,z,0.9);
  // side trenches and lights
  vb.box(-34,-32,26,30,40,150,M.DARK);
  vb.box(32,34,26,30,40,150,M.DARK);
  vb.box(-34,34,56,58,36,46,M.CYAN);
  vb.box(-30,30,58,60,150,156,M.AMBER);
  // bow tip
  vb.box(-6,6,24,42,184,192,M.TRIM);
  return {
    mesh: meshFrom(vb), length:192, centerZ:96, radius:110, nozzles,
    shield:[66,56,116], name:'guard'+variant
  };
}

/* ================================================================== */
/* VANGUARD                                                            */
/* ================================================================== */
function buildVanguard(variant){
  const vb=new VoxelBuilder();
  const M=MAT;
  if(variant===0){
    vb.hollowBox(-28,28,10,50,20,190,M.HULL,3);
    vb.hollowBox(-24,24,14,48,0,26,M.HULL2,3);
    vb.hollowBox(-20,-4,20,42,190,222,M.HULL,2);
    vb.hollowBox(4,20,20,42,190,222,M.HULL,2);
    vb.hollowBox(-12,12,50,66,44,170,M.HULL2,2);
    vb.hollowBox(-72,-34,12,40,40,150,M.HULL,2);
    vb.hollowBox(34,72,12,40,40,150,M.HULL,2);
    addMissilePod(vb,-70,-36,8,34,52,142);
    addMissilePod(vb,36,70,8,34,52,142);
    vb.box(-26,26,48,52,160,176,M.TRIM);
    vb.box(-6,6,52,58,180,196,M.DARK);
    vb.box(-4,4,58,62,186,194,M.CYAN);
  } else {
    vb.hollowBox(-26,26,12,52,24,184,M.HULL,3);
    vb.hollowBox(-22,22,16,50,0,28,M.HULL2,3);
    vb.hollowBox(-18,-4,22,44,184,216,M.HULL,2);
    vb.hollowBox(4,18,22,44,184,216,M.HULL,2);
    vb.hollowBox(-10,10,52,68,48,164,M.HULL2,2);
    vb.hollowBox(-80,-32,14,42,36,144,M.HULL,2);
    vb.hollowBox(32,80,14,42,36,144,M.HULL,2);
    addMissilePod(vb,-78,-38,10,38,48,136);
    addMissilePod(vb,38,78,10,38,48,136);
    vb.hollowBox(-18,18,52,80,100,150,M.HULL2,2);
    vb.box(-4,4,80,86,110,140,M.CYAN);
    vb.box(-24,24,50,54,154,170,M.TRIM);
  }
  const nozzles=[[-20,32,0],[0,38,0],[20,32,0]];
  for(const [x,y,z] of nozzles) addNozzle(vb,x,y,z-2,10,8,M.HULL2,M.CYAN);
  // bow lights
  vb.box(-4,4,24,30,222,228,M.CYAN);
  return {
    mesh: meshFrom(vb), length:228, centerZ:114, radius:130, nozzles,
    shield:[84,62,144], name:'vanguard'+variant
  };
}

/* ================================================================== */
/* SHUTTLE                                                             */
/* ================================================================== */
function buildShuttle(){
  const vb=new VoxelBuilder();
  const M=MAT;
  vb.hollowBox(-5,5,2,8,0,24,M.HULL,1);
  vb.box(-3,3,8,11,15,22,M.GLASS);
  vb.box(-2,2,11,12,18,22,M.CYAN);
  vb.box(-9,-5,3,5,8,16,M.HULL2);
  vb.box(5,9,3,5,8,16,M.HULL2);
  vb.box(-3,3,3,7,24,29,M.HULL2);
  vb.box(-2,2,4,6,29,31,M.HULL);
  vb.box(-4,-2,3,5,0,3,M.CYAN);
  vb.box(2,4,3,5,0,3,M.CYAN);
  vb.box(-7,-5,3,4,2,6,M.CYAN);
  vb.box(5,7,3,4,2,6,M.CYAN);
  return { mesh: meshFrom(vb), length:31, centerZ:15.5, radius:20, nozzles:[[-3,4,0],[3,4,0]], shield:null, name:'shuttle' };
}

/* ================================================================== */
/* MISSILE                                                             */
/* ================================================================== */
function buildMissile(){
  const vb=new VoxelBuilder();
  vb.box(-1,1,0,2,0,10,MAT.HULL);
  vb.box(-1,1,0,2,10,12,MAT.DARK);
  vb.box(-1,1,0,2,12,14,MAT.AMBER);
  vb.box(-2,2,0,1,4,9,MAT.HULL2);
  vb.box(-1,1,2,3,2,5,MAT.GLASS);
  return { mesh: meshFrom(vb), length:14, centerZ:7, radius:8, nozzles:[[0,1,0]], shield:null, name:'missile' };
}

/* ================================================================== */
/* BRIDGE                                                              */
/* ================================================================== */
function buildBridge(){
  const vb=new VoxelBuilder();
  const M=MAT;
  vb.box(-65,65,0,3,0,130,M.FLOOR);
  vb.box(-65,-35,3,8,8,126,M.FLOOR);
  vb.box(35,65,3,8,8,126,M.FLOOR);
  vb.box(-65,65,0,60,0,4,M.WALL);
  vb.box(-65,-61,0,60,0,130,M.WALL);
  vb.box(61,65,0,60,0,130,M.WALL);
  vb.box(-65,65,56,60,0,130,M.WALL);
  // ceiling ribs
  for(const z of [18,48,78,108]) vb.box(-65,65,52,56,z,z+4,M.HULL2);
  // window frame
  vb.box(-65,-55,0,60,126,130,M.HULL2);
  vb.box(55,65,0,60,126,130,M.HULL2);
  vb.box(-55,55,52,60,126,130,M.HULL2);
  vb.box(-55,55,0,6,126,130,M.HULL2);
  vb.box(-56,-54,6,50,127,128,M.CYAN);
  vb.box(54,56,6,50,127,128,M.CYAN);
  vb.box(-54,54,50,52,127,128,M.CYAN);
  // central dais
  vb.box(-24,24,3,8,34,76,M.FLOOR);
  vb.box(-18,18,8,12,40,70,M.HULL2);
  vb.box(-11,11,12,15,45,65,M.DARK);
  vb.box(-9,9,15,17,47,63,M.CYAN);
  vb.box(-3,3,17,19,50,60,M.WHITE);
  // dais steps
  vb.box(-28,28,0,3,30,80,M.HULL2);
  vb.box(-20,20,3,5,36,74,M.HULL2);
  // consoles along sides
  for(const side of [-1,1]){
    for(const z of [16,40,64,88,110]){
      const x0=side<0?-62:42, x1=side<0?-42:62;
      vb.box(x0,x1,8,13,z,z+15,M.DARK);
      vb.box(x0+2,x1-2,13,15,z+2,z+13,M.HULL2);
      vb.box(x0+4,x1-4,15,16,z+3,z+10, z%3===0?M.AMBER:M.CYAN);
      vb.box(x0+4,x1-4,8,9,z+2,z+3,M.CYAN);
    }
  }
  // overhead display panels
  for(const side of [-1,1]){
    const x0=side<0?-50:28, x1=side<0?-28:50;
    vb.box(x0,x1,42,52,52,94,M.DARK);
    vb.box(x0+1,x1-1,42,43,53,93,M.CYAN);
    vb.box(x0+3,x1-3,43,45,56,90,M.HULL2);
  }
  // side wall ribs
  for(const z of [12,32,52,72,92,112]){
    vb.box(-65,-61,4,56,z,z+3,M.HULL2);
    vb.box(61,65,4,56,z,z+3,M.HULL2);
  }
  // floor guide strips
  vb.box(-35,-33,3,4,8,126,M.CYAN);
  vb.box(33,35,3,4,8,126,M.CYAN);
  vb.box(-33,33,3,4,30,32,M.CYAN);
  vb.box(-33,33,3,4,78,80,M.CYAN);
  // rear door frame
  vb.box(-12,12,0,34,0,5,M.HULL2);
  vb.box(-10,10,0,32,5,6,M.DARK);
  // hanging cables / abstract arms
  for(const x of [-24,0,24]){
    vb.box(x-1,x+1,44,52,40,42,M.HULL2);
  }
  // side platform rails
  vb.box(-36,-34,8,12,10,124,M.HULL2);
  vb.box(34,36,8,12,10,124,M.HULL2);
  return { mesh: meshFrom(vb), offset:[-9000,0,0], name:'bridge' };
}

/* ================================================================== */
/* CORE                                                                */
/* ================================================================== */
function buildCore(){
  const vb=new VoxelBuilder();
  const M=MAT;
  const R=118, H=250;
  // outer ribs
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2;
    const x=Math.round(Math.cos(a)*R), z=Math.round(Math.sin(a)*R);
    vb.box(x-5,x+5,0,H,z-5,z+5,M.WALL);
    // ribs with inner light strips
    const x2=Math.round(Math.cos(a)*(R-7)), z2=Math.round(Math.sin(a)*(R-7));
    vb.box(x2-1,x2+1,10,H-10,z2-1,z2+1,M.CYAN);
  }
  // platforms: segmented annulus
  const levels=[20,70,120,170,220];
  for(let li=0;li<levels.length;li++){
    const y=levels[li];
    for(let s=0;s<8;s++){
      const a0=s/8*Math.PI*2+0.06, a1=(s+1)/8*Math.PI*2-0.06;
      for(let a=a0;a<a1;a+=0.035){
        for(let r=46;r<=106;r+=2.5){
          const x=Math.round(Math.cos(a)*r), z=Math.round(Math.sin(a)*r);
          vb.box(x-1,x+1,y,y+5,z-1,z+1, li%2?M.FLOOR:M.HULL2);
        }
      }
      // platform edge lights along the arc
      for(let a=a0;a<a1;a+=0.06){
        const x=Math.round(Math.cos(a)*104), z=Math.round(Math.sin(a)*104);
        vb.box(x-1,x+1,y+5,y+6,z-1,z+1,M.CYAN);
      }
    }
  }
  // central core shell
  for(let y=12;y<238;y++){
    for(let a=0;a<Math.PI*2;a+=0.09){
      for(let r=19;r<=25;r+=1.5){
        if((Math.floor(y/26)%2===0) && (a>0.55 && a<1.1)) continue;
        const x=Math.round(Math.cos(a)*r), z=Math.round(Math.sin(a)*r);
        vb.box(x-1,x+1,y,y+1,z-1,z+1, (r>23)?M.HULL2:M.CORE);
      }
    }
  }
  // vertical light veins on the core
  for(let i=0;i<10;i++){
    const a=i/10*Math.PI*2;
    for(let y=14;y<236;y+=2){
      const x=Math.round(Math.cos(a)*26), z=Math.round(Math.sin(a)*26);
      vb.box(x-1,x+1,y,y+2,z-1,z+1,M.CYAN);
    }
  }
  // core horizontal bands
  for(const y of [30,70,110,150,190,225]){
    for(let a=0;a<Math.PI*2;a+=0.09){
      const x=Math.round(Math.cos(a)*27), z=Math.round(Math.sin(a)*27);
      vb.box(x-2,x+2,y,y+4,z-2,z+2,M.TRIM);
      const x2=Math.round(Math.cos(a)*29), z2=Math.round(Math.sin(a)*29);
      vb.box(x2-1,x2+1,y+1,y+2,z2-1,z2+1,M.CYAN);
    }
  }
  // support struts
  for(const y of [60,120,180]){
    vb.box(-110,-30,y,y+9,-4,4,M.HULL2);
    vb.box(30,110,y,y+9,-4,4,M.HULL2);
    vb.box(-4,4,y,y+9,-110,-30,M.HULL2);
    vb.box(-4,4,y,y+9,30,110,M.HULL2);
    vb.box(-112,-110,y+2,y+6,-2,2,M.CYAN);
    vb.box(110,112,y+2,y+6,-2,2,M.CYAN);
  }
  // wall panels between ribs
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2+0.15;
    const x=Math.round(Math.cos(a)*R), z=Math.round(Math.sin(a)*R);
    vb.box(x-8,x+8,20,70,z-8,z+8,M.DARK);
    vb.box(x-8,x+8,90,160,z-8,z+8,M.DARK);
    vb.box(x-8,x+8,180,240,z-8,z+8,M.DARK);
    const x3=Math.round(Math.cos(a)*(R-9)), z3=Math.round(Math.sin(a)*(R-9));
    for(const y0 of [26,96,186]) vb.box(x3-1,x3+1,y0,y0+38,z3-1,z3+1,M.CYAN);
  }
  // floor ring
  for(let a=0;a<Math.PI*2;a+=0.03){
    for(let r=30;r<=118;r+=3){
      const x=Math.round(Math.cos(a)*r), z=Math.round(Math.sin(a)*r);
      vb.box(x-1,x+1,0,4,z-1,z+1,M.FLOOR);
    }
  }
  return { mesh: meshFrom(vb), offset:[9000,0,0], name:'core' };
}

function buildCoreRing(radius, tube, seg){
  const vb=new VoxelBuilder();
  for(let i=0;i<seg;i++){
    const a=i/seg*Math.PI*2;
    for(let j=0;j<10;j++){
      const b=j/10*Math.PI*2;
      const r=radius+tube*Math.cos(b);
      const x=Math.round(Math.cos(a)*r);
      const z=Math.round(Math.sin(a)*r);
      const y=Math.round(tube*Math.sin(b));
      vb.set(x,y,z, (j%3===0)?MAT.TRIM:MAT.CORE);
    }
  }
  return meshFrom(vb);
}

/* ================================================================== */
/* HANGAR                                                              */
/* ================================================================== */
function buildHangar(){
  const vb=new VoxelBuilder();
  const M=MAT;
  vb.box(-45,45,0,4,0,360,M.FLOOR);
  vb.box(-45,45,76,80,0,360,M.WALL);
  // side walls with bay openings
  const bays=[[30,90],[110,170],[190,250],[270,330]];
  for(let z=0;z<360;z++){
    let inBay=false;
    for(const [a,b] of bays) if(z>=a&&z<b) inBay=true;
    if(!inBay){
      vb.box(-45,-41,4,76,z,z+1,M.WALL);
      vb.box(41,45,4,76,z,z+1,M.WALL);
    } else {
      vb.box(-42,-34,6,44,z,z+1,M.DARK);
      vb.box(34,42,6,44,z,z+1,M.DARK);
      vb.box(-34,-33,6,8,z,z+1,M.CYAN);
      vb.box(33,34,6,8,z,z+1,M.CYAN);
    }
  }
  // bay frames
  for(const [a,b] of bays){
    for(const s of [-1,1]){
      const x0=s<0?-45:41, x1=s<0?-41:45;
      vb.box(x0,x1,4,8,a-2,b+2,M.TRIM);
      vb.box(x0,x1,44,48,a-2,b+2,M.TRIM);
      vb.box(x0,x1,4,48,a-2,a,M.TRIM);
      vb.box(x0,x1,4,48,b,b+2,M.TRIM);
    }
  }
  // deep bulkhead with a real opening
  vb.box(-45,45,62,80,356,360,M.WALL);
  vb.box(-45,45,0,8,356,360,M.WALL);
  vb.box(-45,-22,8,62,356,360,M.WALL);
  vb.box(22,45,8,62,356,360,M.WALL);
  vb.box(-20,20,10,60,360,362,M.PORTAL);
  vb.box(-24,24,6,10,354,360,M.TRIM);
  vb.box(-24,24,62,66,354,360,M.TRIM);
  vb.box(-24,-20,6,66,354,360,M.TRIM);
  vb.box(20,24,6,66,354,360,M.TRIM);
  // cross gantries
  for(const z of [60,140,220,300]){
    vb.box(-45,45,54,62,z,z+6,M.HULL2);
    vb.box(-3,3,42,54,z+2,z+4,M.DARK);
    vb.box(-3,3,38,42,z+2,z+4,M.CYAN);
    vb.box(-45,45,52,54,z,z+1,M.TRIM);
  }
  // overhead rails
  for(const x of [-30,30]){
    vb.box(x-2,x+2,70,74,0,360,M.HULL2);
    vb.box(x-1,x+1,74,76,0,360,M.CYAN);
  }
  // floor guide lights
  for(const x of [-30,30]){
    vb.box(x-1,x+1,4,5,0,360,M.CYAN);
  }
  // side ribs
  for(const z of [20,100,180,260,340]){
    vb.box(-45,-41,4,76,z,z+3,M.HULL2);
    vb.box(41,45,4,76,z,z+3,M.HULL2);
  }
  // parked shuttle cradles
  for(const [a,b] of bays){
    vb.box(-44,-34,4,6,a+4,b-4,M.HULL2);
    vb.box(34,44,4,6,a+4,b-4,M.HULL2);
  }
  // ceiling light strips
  for(const z of [40,120,200,280]){
    vb.box(-20,20,75,76,z,z+2,M.CYAN);
  }
  // bay interior glow
  for(const [a,b] of bays){
    vb.box(-40,-38, 10, 12, a+6, b-6, MAT.CYAN);
    vb.box(38,40, 10, 12, a+6, b-6, MAT.CYAN);
  }
  // ceiling strips
  for(let z=20; z<360; z+=40){
    vb.box(-12,12,75,76,z,z+14,MAT.CYAN);
  }
  return { mesh: meshFrom(vb), offset:[0,-9000,0], name:'hangar' };
}

/* ================================================================== */
/* CORRIDOR                                                            */
/* ================================================================== */
function buildCorridor(){
  const vb=new VoxelBuilder();
  const M=MAT;
  vb.box(-50,50,0,4,0,360,M.FLOOR);
  vb.box(-50,50,66,70,0,360,M.WALL);
  vb.box(-50,-46,4,66,0,360,M.WALL);
  vb.box(46,50,4,66,0,360,M.WALL);
  // central trench
  vb.box(-8,8,0,2,0,360,M.DARK);
  vb.box(-2,2,1,3,0,360,M.CYAN);
  // side columns
  for(let z=30;z<360;z+=40){
    for(const s of [-1,1]){
      const x0=s<0?-46:34, x1=s<0?-34:46;
      vb.box(x0,x1,4,66,z,z+8,M.HULL2);
      vb.box(x0+2,x1-2,8,60,z+2,z+6,M.DARK);
      const ccx=Math.round((x0+x1)/2);
      vb.box(ccx-2,ccx+2,14,54,z+3,z+5,M.CYAN);
    }
  }
  // cross frames
  for(let z=20;z<360;z+=80){
    vb.box(-50,50,56,66,z,z+6,M.HULL2);
    vb.box(-50,50,54,56,z,z+1,M.TRIM);
    vb.box(-24,24,50,56,z+1,z+5,M.DARK);
    vb.box(-10,10,50,52,z+2,z+4,M.CYAN);
  }
  // tall loading devices
  for(let z=16;z<360;z+=46){
    for(const s of [-1,1]){
      const x0=s<0?-44:18, x1=s<0?-18:44;
      vb.hollowBox(x0,x1,6,48,z,z+18,M.HULL2,2);
      vb.box(x0+3,x1-3,10,42,z+2,z+3,M.DARK);
      const dcx=Math.round((x0+x1)/2);
      vb.box(dcx-3,dcx+3,14,38,z+3,z+4,M.AMBER);
      vb.box(x0+1,x1-1,46,50,z-1,z+19,M.TRIM);
    }
  }
  // overhead conduits
  for(const x of [-38,0,38]){
    vb.box(x-2,x+2,58,62,0,360,M.HULL2);
    vb.box(x-1,x+1,62,63,0,360,M.CYAN);
  }
  // far end chamber with a real opening
  vb.box(-50,50,62,70,360,364,M.WALL);
  vb.box(-50,50,0,8,360,364,M.WALL);
  vb.box(-50,-32,8,62,360,364,M.WALL);
  vb.box(32,50,8,62,360,364,M.WALL);
  vb.box(-30,30,10,60,364,368,M.PORTAL);
  vb.box(-34,34,6,10,358,364,M.TRIM);
  vb.box(-34,34,62,66,358,364,M.TRIM);
  vb.box(-34,-30,6,66,358,364,M.TRIM);
  vb.box(30,34,6,66,358,364,M.TRIM);
  // floor side lights
  for(const x of [-42,42]){
    vb.box(x-1,x+1,4,5,0,360,M.CYAN);
  }
  return { mesh: meshFrom(vb), offset:[0,9000,0], name:'corridor' };
}

/* ================================================================== */
/* ASTEROIDS                                                           */
/* ================================================================== */
function buildAsteroid(rx,ry,rz,seed,gridN,chunkMat){
  const rnd=mulberry32(seed);
  const occ=new window.VOX.VoxelMap(8192);
  const cid=new window.VOX.VoxelMap(8192);
  // crater list
  const craters=[];
  for(let i=0;i<4;i++){
    craters.push({x:(rnd()*2-1)*rx*0.7,y:(rnd()*2-1)*ry*0.7,z:(rnd()*2-1)*rz*0.7,r:6+rnd()*12});
  }
  const chunks=[];
  const g=gridN||2;
  for(let i=0;i<g*g*g;i++) chunks.push([]);
  let minx=1e9,miny=1e9,minz=1e9,maxx=-1e9,maxy=-1e9,maxz=-1e9;
  const step=1;
  for(let x=-rx;x<=rx;x+=step){
    for(let y=-ry;y<=ry;y+=step){
      for(let z=-rz;z<=rz;z+=step){
        const nx=x/rx, ny=y/ry, nz=z/rz;
        let d=Math.sqrt(nx*nx+ny*ny+nz*nz);
        const n=0.5+0.5*Math.sin(x*0.31+seed)*Math.sin(y*0.27+seed*1.7)*Math.sin(z*0.23+seed*2.3);
        d += (n-0.5)*0.28;
        if(d>1.0) continue;
        let skip=false;
        for(const c of craters){
          const dx=x-c.x, dy=y-c.y, dz=z-c.z;
          if(dx*dx+dy*dy+dz*dz < c.r*c.r){ skip=true; break; }
        }
        if(skip) continue;
        let mat = d>0.72 ? (d>0.9?MAT.AST_LIGHT:MAT.AST) : MAT.AST_DARK;
        if(d<0.35) mat = MAT.AST_DARK;
        // chunk index
        const ix=Math.min(g-1,Math.max(0,Math.floor((x+rx)/(2*rx)*g)));
        const iy=Math.min(g-1,Math.max(0,Math.floor((y+ry)/(2*ry)*g)));
        const iz=Math.min(g-1,Math.max(0,Math.floor((z+rz)/(2*rz)*g)));
        const ci=ix*g*g+iy*g+iz;
        occ.set(x,y,z,mat);
        cid.set(x,y,z,ci+1);
        chunks[ci].push([x,y,z,mat]);
        if(x<minx)minx=x; if(x>maxx)maxx=x;
        if(y<miny)miny=y; if(y>maxy)maxy=y;
        if(z<minz)minz=z; if(z>maxz)maxz=z;
      }
    }
  }
  // group chunks, mark boundary
  const out=[];
  const chunkList=[];
  for(let ci=0;ci<chunks.length;ci++){
    const list=chunks[ci];
    if(!list.length) continue;
    let cx=0,cy=0,cz=0;
    for(const v of list){ cx+=v[0]; cy+=v[1]; cz+=v[2]; }
    cx/=list.length; cy/=list.length; cz/=list.length;
    const vb=new VoxelBuilder();
    for(const v of list){
      const [x,y,z,mat]=v;
      let boundary=false;
      const nb=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      for(const n of nb){
        const q=cid.get(x+n[0],y+n[1],z+n[2]);
        if(q!==ci+1){ boundary=true; break; }
      }
      let mm=mat;
      if(boundary && ((Math.imul(x*73856093 ^ y*19349663 ^ z*83492791, 2654435761)>>>0)%100)<38) mm=MAT.CRACK;
      vb.set(Math.round(x-cx), Math.round(y-cy), Math.round(z-cz), mm);
    }
    const mesh=meshFrom(vb);
    chunkList.push({
      mesh,
      offset:[cx,cy,cz],
      radius: Math.max(maxx-minx,maxy-miny,maxz-minz)*0.5,
      vel: [(cx/(rx||1))*(8+rnd()*16)+(rnd()-0.5)*12,
            (cy/(ry||1))*(8+rnd()*16)+(rnd()-0.5)*12,
            (cz/(rz||1))*(8+rnd()*16)+(rnd()-0.5)*12],
      spin: [(rnd()-0.5)*0.7,(rnd()-0.5)*0.9,(rnd()-0.5)*0.7],
      phase: rnd()*6.28
    });
  }
  return { chunks:chunkList, radius:Math.max(rx,ry,rz), seed };
}

function buildAsteroidField(){
  const list=[];
  const defs=[
    {p:[280,80,1650], r:[56,45,50], seed:11, grid:2, hit:64.0, name:'A'},
    {p:[-380,0,1500], r:[40,34,36], seed:22, grid:2, hit:67.5, name:'B'},
    {p:[160,130,1400], r:[22,20,20], seed:33, grid:2, hit:70.5, name:'C'},
    {p:[-120,120,1850], r:[52,44,48], seed:44, grid:2, hit:75.2, name:'D'}
  ];
  for(const d of defs){
    const ast=buildAsteroid(d.r[0],d.r[1],d.r[2],d.seed,d.grid);
    ast.pos=d.p; ast.hit=d.hit; ast.name=d.name; ast.baseRot=d.seed*0.37;
    list.push(ast);
  }
  // background rocks (not targeted)
  const bg=[
    {p:[620,-210,2250], r:[30,24,26], seed:101},
    {p:[-760,240,2400], r:[36,28,30], seed:102},
    {p:[60,-320,2650], r:[26,22,24], seed:103},
    {p:[900,120,1900], r:[22,18,20], seed:104},
    {p:[-520,-260,2100], r:[18,16,15], seed:105}
  ];
  for(const b of bg){
    const ast=buildAsteroid(b.r[0],b.r[1],b.r[2],b.seed,1);
    ast.pos=b.p; ast.hit=-1; ast.name='bg'; ast.baseRot=b.seed*0.11;
    list.push(ast);
  }
  return list;
}

/* ================================================================== */
/* export                                                              */
/* ================================================================== */
window.MODELS = {
  buildFlagship, buildGuard, buildVanguard, buildShuttle, buildMissile,
  buildBridge, buildCore, buildCoreRing, buildHangar, buildCorridor,
  buildAsteroidField
};
})();