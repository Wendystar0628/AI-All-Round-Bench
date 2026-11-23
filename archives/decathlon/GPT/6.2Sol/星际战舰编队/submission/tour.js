"use strict";
const duration=76;
const hangarTransform=matrix(hangarOrigin);
const fleet=[{kind:'flag', p:[0,0,0]}];
const fleetRand=random(77531);
for(const s of [-1,1]){
  const near=[[305,-71,-366],[408,-127,-21],[345,20,198],[509,224,-151],[523,-131,-453],[270,151,-630],[390,-187,-743],[616,3,123]];
  const far=[[294,85,605],[471,-78,751],[641,111,486],[683,-153,799],[348,195,1001],[791,36,1022],[836,-143,214],[538,-134,1128]];
  for(const [kind,rows] of [['guard',near],['vanguard',far]])for(const [x,y,z] of rows)
    fleet.push({kind,p:[s*(x+fleetRand()*47),y+(fleetRand()-.5)*52,z+(fleetRand()-.5)*87]});
}
const debrisRand=random(7313);
const farRocks=Array.from({length:24},(_,i)=>({
  p:[(debrisRand()-.39)*1600,(debrisRand()-.5)*640,1150+debrisRand()*1550],
  m:i<3?2:i<9?3:i<18?4:5,a:debrisRand()*TAU
}));
const primaryRocks=[
  {p:[24,42,1146],m:0,event:58.9,a:.1,warm:-1.20,tint:ice,release:[0,.105,.27,.13,.19],drift:[20,17,18,29,35],kick:[11,9,12,24,26]},
  {p:[223,49,1084],m:1,event:61.12,a:1.7,warm:-.36,tint:[1.22,.33,.10],release:[.68,.86,0,.10,.27],drift:[10,11,31,39,33],kick:[7,7,15,20,17]},
  {p:[355,80,1278],m:1,event:64.4,a:2.7,warm:-.30,tint:gold,release:[.48,.71,.03,.17,.04],drift:[23,18,30,40,28],kick:[19,14,21,27,29]},
  {p:[228,-110,1138],m:2,event:62.8,a:2.6,warm:-.12,tint:[.86,.73,.46],release:[.63,.84,.08,0,.17],drift:[7,6,24,33,27],kick:[6,5,11,19,16]},
  {p:[-233,101,1308],m:2,event:63.9,a:1.3,warm:-.06,tint:gold,release:[.36,.57,.02,.11,0],drift:[20,18,29,34,25],kick:[14,13,18,25,23]}
];
const scatterRand=random(95821);
const scatter=primaryRocks.map((r,k)=>Array.from({length:k<3?74:39},(_,i)=>{
  const a=scatterRand()*TAU,y=scatterRand()*2-1,w=Math.sqrt(1-y*y);
  return {a,dir:[cos(a)*w,y,sin(a)*w],s:18+scatterRand()*89,
    r:15+scatterRand()*(k===0?65:32),d:scatterRand()*.48,shape:i%3,heat:scatterRand()};
}));
const speckRand=random(51518);
const specks=Array.from({length:880},()=>[
  (speckRand()-.5)*2400,(speckRand()-.5)*1060,speckRand()*3500,
  speckRand(),speckRand()
]);
const shots={
  exterior:[
    [0,[1010,331,-794],[0,7,-72],44,-.026],
    [2.85,[601,185,-777],[25,4,-338],48,-.025],
    [5.45,[650,139,-549],[19,12,-181],48,-.031],
    [8,[548,128,-135],[12,12,-19],43,-.035],
    [10,[414,-36,-83],[89,-33,-168],51,.032],
    [12.4,[333,-102,-126],[109,-46,-206],57,.041],
    [15,[306,-22,-174],[167,-12,-255],54,.01],
    [17,[244,-15,-306],[152,-16,-276],58,-.015],
    [18,[196,-15,-305],[117,-18,-256],62,-.022],
    [19.5,[136,-16,-282],[78,-16,-78],65,.002],
    [22,[106,-17,-227],[86,-16,-17],62,.018],
    [24,[93,-14,-161],[127,-13,-12],58,.004],
    [25.32,[99,-12,-112],[156,-12,-14],57,-.008],
    [26,[104,-11,-79],[170,-12,-15],56,-.014]
  ],
  bridge:[
    [26,[-40,19,-57],[-4,22,39],69,-.019],
    [28,[-34,19,-34],[0,22,28],65,-.005],
    [31,[-18,23,-5],[5,24,38],66,.02],
    [34,[17,22,14],[1,27,63],68,.018]
  ],
  core:[
    [34,[95,-75,-109],[-3,2,6],81,.026],
    [35.75,[94,-66,-91],[-4,2,2],78,.022],
    [38.4,[90,-9,-81],[2,8,0],75,.002],
    [40.55,[87,35,-77],[-3,12,6],72,-.011],
    [43,[87,76,-93],[-5,13,6],76,-.022]
  ],
  conduit:[
    [43,[17,21,-164],[7,31,65],67,-.020],
    [45.42,[11,23,-112],[1,32,119],64,-.021],
    [47.52,[-4,26,-48],[-1,32,146],61,.007],
    [49.54,[-7,28,41],[1,35,171],58,.016],
    [50.36,[0,31,80],[0,35,181],60,.016],
    [51,[5,34,113],[0,36,187],63,.011]
  ],
  attack:[
    [51,[680,323,-255],[81,36,421],54,-.01],
    [54,[434,176,129],[61,46,650],56,-.03],
    [56,[318,135,291],[39,40,697],54,-.018],
    [59,[286,152,431],[38,42,858],53,.016],
    [60.62,[366,294,541],[106,89,1008],53,.012],
    [61.42,[372,314,597],[111,102,1030],54,.008],
    [62.55,[358,230,666],[123,53,1069],54,.026],
    [65,[516,220,723],[102,47,1056],59,.024],
    [67,[681,248,587],[63,28,414],61,-.034],
    [69.0,[1043,498,336],[26,11,171],53,-.041],
    [70.65,[1420,805,152],[0,7,189],50,-.044],
    [71.8,[1313,650,-133],[1,2,145],47,-.035],
    [73,[1034,311,-360],[5,5,84],44,-.03],
    [76,[1010,331,-794],[0,7,-72],44,-.026]
  ]
};
function spline(keys,t,cycle=false) {
  let i=0;
  while(i<keys.length-2 && t>keys[i+1][0])i++;
  const a=keys[i],b=keys[i+1],dt=b[0]-a[0],u=clamp((t-a[0])/dt);
  let pre=keys[i-1]||a,post=keys[i+2]||b;
  if(cycle && i===0&&keys===shots.exterior) pre=[shots.attack.at(-2)[0]-duration,...shots.attack.at(-2).slice(1)];
  if(cycle && i===keys.length-2&&keys===shots.attack) post=[duration+shots.exterior[1][0],...shots.exterior[1].slice(1)];
  const f=(v,w,h,j)=>{
    const m=(w-h)*dt/(b[0]-pre[0]), n=(j-v)*dt/(post[0]-a[0]);
    return (2*u*u*u-3*u*u+1)*v+(u*u*u-2*u*u+u)*m+(-2*u*u*u+3*u*u)*w+(u*u*u-u*u)*n;
  };
  const vect=index=>a[index].map((v,k)=>f(v,b[index][k],pre[index][k],post[index][k]));
  camera(vect(1),vect(2),f(a[3],b[3],pre[3],post[3]),f(a[4],b[4],pre[4],post[4]));
}
function openingSpeed(t){
  return t<18?1-.72*smooth(0,11,t):.28+.72*smooth(68,75,t);
}
function vesselSpeed(t,i){
  if(t<18||i===0)return openingSpeed(t);
  const [x,,z]=fleet[i].p;
  const delay=.25+.86*clamp(Math.abs(z)/1200)+.52*clamp(Math.abs(x)/850)+(i%3)*.06;
  return .28+.72*smooth(67.78+delay,74.1+delay,t);
}
function battleSpread(t){return smooth(51,56,t)*(1-smooth(64,72,t));}
function shipPose(i,t) {
  const v=fleet[i], [x,y,z]=v.p, w=t/duration*TAU;
  if(i===0) return matrix([0,sin(w*2)*2,0],0,0,sin(w)*.009);
  const spread=battleSpread(t), speed=vesselSpeed(t,i);
  const stage=smooth(52,59.8,t)*(1-smooth(64.2,72,t));
  const shift=i===19?[(-216-113*smooth(59.05,61.49,t))*stage,(182+30*smooth(59.2,61.3,t))*stage+56*sin(Math.PI*stage),675*stage]:i===25?scale([-10+56*smooth(57,60,t)*(1-smooth(61,61.92,t)),43,256],stage):[0,0,0];
  return matrix([
    x+shift[0]+Math.sign(x)*spread*(20+(i%7)*7)+sin(w*3+i*.93)*11,
    y+shift[1]+sin(w*4+i*.71)*10+Math.sign(y)*spread*14,
    z+shift[2]+cos(w*2+i)*17+(i%6-2.5)*speed*12],
    sin(w*3+i*.9)*.044+Math.sign(x)*spread*.08,sin(w*2+i)*.017,sin(w*3+i)*.061);
}
function engines(m,ports,t,strength,small=false,emission=1) {
  for(const [i,[x,y,z,w]] of ports.entries()) {
    const pulse=1+.10*sin(t/duration*TAU*97+i*.96)+.04*cos(t/duration*TAU*206+i*2.4), length=w*(1.9+strength*2.55)*pulse;
    const p=point(m,[x,y,z]);
    line(p,point(m,[x,y,z-length]),w*.39,emission*pulse*(1.36+strength*.8),cyan,1,.25+strength*.07);
    line(p,point(m,[x,y,z-length*.71]),w*.20,1.68*emission,ice,1,.14);
    const nearPort=small?1:1-.42*smooth(1.0,2.4,t)*(1-smooth(4.8,6.5,t));
    halo(p,w*.74,(.34+strength*.18)*emission*nearPort,cyan);
    if(!small){
      line(point(m,[x-w*.21,y,z-1]),point(m,[x-w*.11,y+w*.05,z-length*.81]),w*.115,.62+strength*.62,cyan,1,.11);
      line(point(m,[x+w*.21,y,z-1]),point(m,[x+w*.12,y-w*.07,z-length*.87]),w*.106,.57+strength*.60,ice,1,.14);
    }
    for(let j=0;j<(small?2:5);j++){
      const a= mod(t*Math.round((.40+j*.027)*duration)/duration+i*.104+j*.21,1), a2=Math.min(1,a+.035+.027*strength);
      const u=(j%3-1)*w*.12, v=(j%2-.5)*w*.18;
      line(point(m,[x+u,y+v,z-length*a]),point(m,[x+u,y+v,z-length*a2]),
        Math.max(.36,w*.022)*(1-a*.55),.78*(1-a)*emission,pale);
    }
  }
}
const cutterPorts=[[-4,-1,-18,5],[4,-1,-18,5]];
function shipDirection(p,v,roll=0){
  return matrix(p,Math.atan2(v[0],v[2]),-Math.atan2(v[1],Math.hypot(v[0],v[2])),roll);
}
function aroundFlag(t,i) {
  if(i===0){
    const a=TAU*t/duration;
    const p=[234+37*sin(2*a),-36+21*cos(3*a-.8),-520-90*cos(a-.35)+48*sin(a)];
    const travel=[74*cos(2*a),-63*sin(3*a-.8),90*sin(a-.35)+48*cos(a)];
    return shipDirection(p,travel,-.12*cos(2*a));
  }
  const f=mod(t/19+i*.196,1),a=TAU*f;
  const p=[277+64*sin(a)+i*14,-19+52*sin(a+.47)+i*5,-190+294*cos(a)+i*22];
  const v=[64*cos(a),52*cos(a+.47),-294*sin(a)];
  return shipDirection(p,v,sin(a)*.24);
}
function guardAim(p,target,barrel){
  const [x,y,z]=sub(target,p);
  const radius=Math.hypot(x,z);
  const yaw=Math.atan2(x,z)-Math.asin(clamp(barrel/Math.max(1,radius),-1,1));
  const h=Math.sqrt(Math.max(1,radius*radius-barrel*barrel)),length=Math.hypot(y,h);
  return [sin(yaw)*h/length,y/length,cos(yaw)*h/length];
}
function guardGun(m,side,j,t,idx) {
  const p=point(m,guardMount(side,j)),target=add(rockLocation(3,t),[sin(j*8)*28,cos(j*4)*25,0]);
  const w=smooth(58.9,60.55,t)*(1-smooth(63.9,66.9,t));
  let dir=lerp3([m[8],m[9],m[10]],unit(sub(target,p)),w*.92);
  let recoil=0;
  if(t>59.7&&t<63){
    const burst=guardBursts.get(idx*8+(side>0?4:0)+j);
    if(burst){
      const start=burst[0].fire,end=burst.at(-1).fire;
      const active=smooth(start-.44,start,t)*(1-smooth(end+.05,end+.37,t));
      const next=burst.findIndex(e=>e.fire>t);
      const a=next<0?burst.at(-1):burst[Math.max(0,next-1)], b=next<0?a:burst[next];
      const aim=guardAim(p,a.to,a.barrel);
      const track=a===b?aim:lerp3(aim,guardAim(p,b.to,b.barrel),smooth(a.fire,b.fire,t));
      dir=lerp3(dir,track,active);
      if(t>=a.fire)recoil=1-smooth(.015,.12,t-a.fire);
    }
  }
  return shipDirection(add(p,scale(unit(dir),-.96*recoil)),dir);
}
function shieldTime(i){
  if(i===0)return 65.9;
  const [x,,z]=fleet[i].p;
  return 66.19+1.88*smooth(0,1080,Math.abs(z))+.49*clamp(Math.abs(x)/900)+(i%3)*.12;
}
const shieldAxes={flag:[277,204,730],guard:[81,44,139],vanguard:[84,37,145]};
function transferPower(t){
  return smooth(49.35,51.25,t)*(1-smooth(52.65,53.7,t));
}
function paintFleet(t,mats,drawList) {
  const power=openingSpeed(t);
  for(const [i,s] of fleet.entries()){
    const m=mats[i],axes=shieldAxes[s.kind],age=t-shieldTime(i);
    const phase=t<8?1:clamp(age/(i===0?2.6:1.15));
    const life=t<8?(1-smooth(0,7,t))*.30:smooth(0,.48,age)*mix(1.16,.30,smooth(71,76,t));
    const sweep=phase>0&&phase<1?[1-2.13*phase,life*(1-smooth(.90,1,phase)),1/axes[2]]:null;
    const model=i===0?flagModel:s.kind==='guard'?guardModel:vanguardModel;
    drawList.push([model,m,undefined,undefined,undefined,sweep]);
    if(s.kind==='vanguard')paintRacks(t,i,m,drawList);
    if(s.kind==='guard')for(const side of [-1,1])for(let j=0;j<3;j++)
      drawList.push([trackingTurret,guardGun(m,side,j,t,i)]);
    const ports=i===0?flagEngines:escortPorts[s.kind];
    engines(m,ports,t,i===0?power:vesselSpeed(t,i)*(.80+.20*sin(i*.57)),i>0);
    sphereShield(m,axes,phase,life,i===0?t-71.05:i===25?t-70.75:-1);
  }
  const open=smooth(54.08,55.72,t)*(1-smooth(59.58,61.0,t));
  for(const side of [-1,1]){
    const p=[side*(8+27*open),37,523-16*open];
    drawList.push([muzzleGate,multiply(mats[0],matrix(p,side*open*.18))]);
  }
  for(let i=0;i<5;i++){
    const m=aroundFlag(t,i);
    drawList.push([cutterModel,m]);engines(m,cutterPorts,t,.36,true);
  }
  pointLight([0,18,-539],101,cyan,.68+power*.46);
  pointLight([135,3,-501],72,cyan,.59+power*.40);
  pointLight([-135,3,-501],72,cyan,.59+power*.40);
  pointLight([169,-17,-203],56,cyan,.30);
  if(t<7){
    const glide=smooth(0,1.4,t)*(1-smooth(4.45,7,t));
    pointLight([79,10,-556],108,pale,glide*.59);
    pointLight([160,-18,-524],80,cyan,glide*.68);
  }
  if(t>6&&t<15.7){
    const envelope=smooth(6,10,t)*(1-smooth(13.7,15.7,t));
    pointLight([141,-112,-158],128,[.60,.28,.09],.66*envelope);
    pointLight([89,-97,35],113,cyan,.48*envelope);
  }
  if(t>=51&&t<53.7){
    const energy=transferPower(t);
    const front=(t-51)*151+196;
    for(const side of [-1,1]){
      for(let j=0;j<19;j++){
        const z=170+j*16,section=(z-146)/12,w=46-section*.71;
        const strength=energy*smooth(-24,11,front-z)*(1-smooth(28,123,front-z));
        if(strength<.005)continue;
        const p=point(mats[0],[side*w*.79,68-section*.28,z]);
        line(p,add(p,[0,0,8]),2.55,1.30*strength,gold,2);
        halo(p,12,.44*strength,gold);
      }
      const z=clamp(front-18,178,494),section=(z-146)/12;
      const p=point(mats[0],[side*(46-section*.71)*.79,68-section*.28,z]);
      pointLight(p,57,[1.09,.46,.123],energy*.88);
    }
  }
  if(t>=65.9&&t<71.8){
    const u=clamp((t-65.9)/2.6), z=mix(552,-522,u);
    const power=smooth(65.9,66.46,t)*(1-smooth(68.4,71.8,t));
    pointLight([65,94,z],153,cyan,power*1.80);
    pointLight([-69,38,z-36],126,ice,power*1.22);
  }
}
function rockLocation(i,t) {
  const r=primaryRocks[i];
  const steer=smooth(66.5,73.2,t);
  const [x,y]=[[-520,144],[351,104],[422,305],[309,-271],[-234,193]][i];
  return add(r.p,[steer*x,steer*y,-(t-55)*3-4240*Math.pow(clamp((t-67)/9),3.25)]);
}
const fractureMotion=[[1,.39,.16],[-.72,-.24,-.12],[.32,1,.08],[-.44,-.36,-1.1],[.65,-.3,.71]];
const fractureVectors=primaryRocks.map(r=>{
  const orientation=matrix([0,0,0],(r.a+r.event*.038)*.9);
  return fractureMotion.map(d=>point(orientation,d));
});
function rockPose(i,j,t){
  const r=primaryRocks[i],spin=r.a+t*.038;
  const age=Math.max(0,t-r.event-r.release[j]);
  const travel=age*r.drift[j]+r.kick[j]*(1-Math.exp(-age*2.12));
  const p=add(rockLocation(i,t),scale(fractureVectors[i][j],travel));
  const turn=age*(j<2?.61+j*.08:1.12+(j-2)*.27);
  return matrix(p,spin*.9+turn*(j-2)*.16,sin(spin)*.2+turn*(j%2-.55)*.34,cos(spin)*.13+turn*(j%3-.98)*.151);
}
function rockImpact(i,t,origin,offset){
  const model=rockModels[primaryRocks[i].m], aim=add(rockLocation(i,t),offset);
  const chunks=model.map((_,j)=>{
    const m=rockPose(i,j,t), originFromCenter=sub(origin,point(m,[0,0,0]));
    const local=v=>[0,4,8].map(k=>v[0]*m[k]+v[1]*m[k+1]+v[2]*m[k+2]);
    return {delta:local(originFromCenter), toward:scale(originFromCenter,-1), local,
      anchor:model.anchors[j]&&point(m,model.anchors[j])};
  });
  const trace=dest=>{
    const axis=unit(sub(dest,origin)), radius=model.radius*1.42;
    let closest=Infinity;
    for(const [group,chunk] of chunks.entries()){
      if(!chunk.anchor)continue;
      const around=dot(chunk.toward,axis), v=chunk.local(axis);
      let at=Math.max(0,around-radius);
      const limit=Math.min(closest,around+radius);
      for(;at<=limit;at+=model.step){
        if(!model.sample(add(chunk.delta,scale(v,at)),group))continue;
        let outside=Math.max(0,at-model.step),inside=at;
        for(let k=0;k<5;k++){
          const mid=(outside+inside)*.5;
          if(model.sample(add(chunk.delta,scale(v,mid)),group))inside=mid;else outside=mid;
        }
        closest=Math.min(closest,inside);break;
      }
    }
    return Number.isFinite(closest)?add(origin,scale(axis,Math.max(0,closest-1.25))):null;
  };
  const contact=trace(aim);
  if(contact)return contact;
  const anchors=chunks.map(o=>o.anchor).filter(Boolean).sort((a,b)=>Math.hypot(...sub(a,aim))-Math.hypot(...sub(b,aim)));
  for(const surviving of anchors){
    const retry=trace(surviving);
    if(retry)return retry;
  }
  return aim;
}
function addAsteroids(t,list) {
  const routeTime=t<26?t:t-76;
  {
    for(let i=0;i<13;i++){
      const rock=farRocks[(i*7+4)%farRocks.length];
      const raw=add(rock.p,[-470+(i%3)*70,100+(i%4)*24,-180-routeTime*29]);
      const p=[Math.min(-272,raw[0]),raw[1]+Math.max(0,170-Math.abs(raw[1]))*.7,raw[2]];
      const m=matrix(p,rock.a+.04*routeTime,.13*i,.05*routeTime);
      for(const mesh of rockModels[i===0?2:i<4?3:i<9?4:5])list.push([mesh,m]);
    }
  }
  if(t>50)for(let i=0;i<farRocks.length;i++){
    const r=farRocks[i],clear=smooth(68,73,t);
    const p=add(r.p,[Math.sign(r.p[0])*clear*250,Math.sign(r.p[1])*clear*121,-(t-50)*3-4450*Math.pow(clamp((t-67)/9),3)]);
    const m=matrix(p,r.a+.04*t,.13*i,.07*t);
    for(const mesh of rockModels[r.m])list.push([mesh,m]);
  }
  for(let i=0;t>50&&i<primaryRocks.length;i++){
    const r=primaryRocks[i],age=t-r.event,p=rockLocation(i,t);
    const meshes=rockModels[r.m];
    for(let j=0;j<meshes.length;j++){
      const m=rockPose(i,j,t);
      list.push([meshes[j],m]);
      const heat=smooth(r.warm,.23,age)*(1-smooth(.51,5.0,age));
      const source=impactFoci[i];
      const reach=i===0?mix(19,287,smooth(-1.2,1.68,age)):mix(20,225,smooth(-.13,1.97,age));
      if(heat>.005)list.push([meshes.faults[j],m,0,scale(r.tint,1.22*heat),[...source,reach]]);
    }
    if(age>0 && age<16) {
      for(const f of scatter[i]){
        const a=Math.max(0,age-f.d),c=add(p,scale(f.dir,f.r+f.s*a*.56));
        const veryHot=(1-smooth(.1,2.2,a))*f.heat;
        list.push([fragments[f.shape],matrix(c,f.a+a*(.9+f.heat),a*.68,a*.55)]);
        if(veryHot>.03){
          halo(c,2.2+f.shape*1.5,veryHot*1.25,gold);
          line(c,add(c,scale(f.dir,-5-f.s*.12)),1.3,veryHot*.75,gold);
        }
      }
    }
  }
  const speed=openingSpeed(t);
  const progress=t<26?1520+9*t+135*(1-Math.exp(-t*.16)):1520+3500+31*(t-76)-940*(1-smooth(68,76,t));
  for(const [x,y,z,r,s] of specks){
    const p=[x,y,mod(z-progress,3500)-1150];
    const lit=1-smooth(17,67,Math.abs(Math.abs(p[0])-91)+Math.abs(p[1]-8)*.6);
    const jet=lit*smooth(-863,-696,p[2])*(1-smooth(-576,-503,p[2]));
    if(jet>.14&&r>.46){
      halo(p,.70+s*.95,jet*(.21+speed*.46),ice);
      if(r>.80)line(p,[x,y,p[2]+6+speed*16],.85,jet*.45,cyan);
    }
    if(r>.934) {
      line(p,[x,y,p[2]+4+speed*(r-.926)*510],.7+s*.9,.09+s*.38,s>.56?pale:gold);
    } else if(r>.52) halo(p,.42+s*.84,.12+s*.21,pale);
  }
}
function impact(p,t,when,power,col,origin){
  const age=t-when,micro=power<.43,heavy=power>1;
  if(age<0||age>(micro?.45:2.55))return;
  const axis=origin?unit(sub(p,origin)):[0,0,1];
  const across=unit(cross(axis,Math.abs(axis[1])>.90?[1,0,0]:[0,1,0])),up=cross(axis,across);
  if(micro){
    const e=power*Math.exp(-age*8.7);
    halo(p,6.4+age*10,e*3.6,col);
    for(let j=0;j<5;j++){
      const w=j*2.39996+p[0]*.16;
      const d=add(scale(across,cos(w)),add(scale(up,sin(w)),scale(axis,-.4)));
      const q=add(p,scale(d,1.5+age*(11+j*4.5)));
      line(q,add(q,scale(d,-2.8)),.85,e*2.48,col);
    }
    return;
  }
  const e=power*Math.exp(-age*(heavy?2.9:4.2));
  halo(p,(heavy?20:12)+age*(heavy?32:23),e*1.65,col);
  halo(p,(heavy?46:24)+age*64,e*.42,col);
  const r=(heavy?8:4)+age*(heavy?113:72);
  const sides=heavy?36:24;
  for(let j=0;j<sides;j++){
    const d=j/sides*TAU,k=(j+1)/sides*TAU;
    const wave=a=>add(p,scale(add(scale(across,cos(a)),scale(up,sin(a))),r*(.965+.034*sin(a*5.))));
    line(wave(d),wave(k),1.7+age*1.55,e*(.59+.15*sin(d*3.1)),col);
  }
  for(let j=0;j<(heavy?21:13);j++){
    const a=j*2.39996,q=sin(j*6)*.56-.24;
    const d=add(scale(across,cos(a)),add(scale(up,sin(a)*.78),scale(axis,q)));
    const c=add(p,scale(d,2+age*(28+mod(j*17,heavy?117:86))));
    line(c,add(c,scale(d,-3.9-age*12)),heavy?1.18:1.0,e*.91,col);
  }
}
function chipSpray(list,t,from,to,arrival,amount,tint,seed){
  const age=t-arrival;
  if(age<0||age>1.55)return;
  const back=unit(sub(from,to)), side=unit(cross(back,[0,1,0])), up=cross(side,back);
  for(let i=0;i<amount;i++){
    const a=i*2.39996+seed*.51;
    const v=add(scale(back,23+(i%4)*11),add(scale(side,cos(a)*(26+i%5*11)),scale(up,sin(a)*(24+i%3*12))));
    const p=add(to,scale(v,.07+age));
    const heat=(1-smooth(.12,1.55,age))*(.48+(i%3)*.19);
    list.push([fragments[(seed+i)%2],matrix(p,a+age*2.9,age*.93,a*.38)]);
    line(p,add(p,scale(v,-.115)),1.05,heat*1.34,tint);
  }
}
const mainHotspot=rockImpact(0,58.9,[0,37,529],[0,3,0]);
const mainSurface=sub(mainHotspot,rockLocation(0,58.9));
const pulseColor=[1.35,.28,.095];
const pulseEvents=Array.from({length:26},(_,j)=>{
  const fire=57.87+Math.floor(j/4)*.45+(j%4)*.132;
  const arrive=fire+.68+(j%5)*.059;
  const rank=j%4===0?4+j%3:pulseMounts.length-1-(j+Math.floor(j/4))%3;
  const [x,y,z]=pulseMounts[rank];
  const from=point(shipPose(0,fire),[x+(j%2===0?-4:4),y,z]);
  const aim=[(j%5-2)*12,sin(j*9)*24,cos(j*6)*9];
  return {fire,arrive,from,to:rockImpact(1,arrive,from,aim)};
});
const guardEvents=Array.from({length:93},(_,j)=>{
  const fire=60.28+Math.floor(j/5)*.112+(j%5)*.020, arrive=fire+.39+(j%5)*.049;
  const idx=[19,19,3,19,19][j%5], side=idx===19&&j%3!==1?1:j%2===0?1:-1;
  const mount=Math.floor(j/5)%3;
  const barrel=j%2===0?2:-2;
  const pivot=point(shipPose(idx,fire),guardMount(side,mount));
  const ri=j%6===0?1:3;
  const to=rockImpact(ri,arrive,pivot,[cos(j*4)*19,sin(j*8)*21,sin(j*3)*12]);
  const from=point(shipDirection(pivot,guardAim(pivot,to,barrel)),[barrel,0,11.04]);
  return {fire,arrive,from,idx,side,mount,barrel,target:ri,to};
});
const guardBursts=new Map();
for(const e of guardEvents){
  const key=e.idx*8+(e.side>0?4:0)+e.mount;
  if(!guardBursts.has(key))guardBursts.set(key,[]);
  guardBursts.get(key).push(e);
}
const missileEvents=Array.from({length:12},(_,j)=>{
  const fire=61.55+j*.19,arrive=63.87+j*.152, i=[25,25,26,25,10,25][j%6];
  const side=j%2===0?1:-1;
  const cell = j%7;
  const [x,y,z]=vanguardCell(side,cell),release=[x+side*.72,y+8,z+.42];
  const from=point(shipPose(i,fire),release);
  const target=j%5===0?4:2;
  const to=rockImpact(target,arrive,from,[cos(j*7)*21,sin(j*6)*23,sin(j*95)*10]);
  const trajectory=s=>{
    const v=clamp(s), hump=sin(Math.PI*v);
    return add(lerp3(from,to,v*v*.64+v*.36),[hump*(side*-75),hump*(55+(j%6)*17),sin(v*TAU)*(22+j%3*17)]);
  };
  return {fire,arrive,from,to,trajectory,release,i,side,cell,target};
});
const impactFoci=primaryRocks.map((r,i)=>{
  if(i===0)return mainHotspot;
  const candidates=i===1?pulseEvents:i===3?guardEvents:missileEvents;
  let closest=Infinity,p=rockLocation(i,r.event);
  for(const event of candidates){
    if(i!==1&&event.target!==i)continue;
    const d=Math.abs(event.arrive-r.event);
    if(d<closest){closest=d;p=event.to;}
  }
  return p;
});
const firingRacks=new Map();
for(const e of missileEvents){
  if(!firingRacks.has(e.i))firingRacks.set(e.i,new Map());
  firingRacks.get(e.i).set(e.side*10+e.cell,e);
}
function paintRacks(t,i,m,list){
  const cycles=t>60.6&&t<66.6?firingRacks.get(i):null;
  if(!cycles){list.push([readyRacks,m]);return;}
  for(const side of [-1,1])for(let k=0;k<7;k++){
    const [x,y,z]=vanguardCell(side,k),e=cycles.get(side*10+k);
    const age=e?t-e.fire:-1;
    const opened=smooth(-.60,-.08,age)*(1-smooth(.45,1.38,age));
    for(const half of [-1,1]){
      const pose=matrix([x+half*(2+3.5*opened),y-1+opened*1.45,z],0,0,half*opened*.70);
      list.push([rackHalf,multiply(m,pose)]);
    }
    if(e&&age<0&&opened>.45){
      const lift=smooth(-.17,0,age);
      const p=point(m,lerp3([x,y+.32,z],e.release,lift));
      const vector=sub(e.trajectory(.001),e.from);
      const direction=lerp3([m[8],m[9],m[10]],unit(vector),smooth(-.10,0,age));
      list.push([missileModel,shipDirection(p,direction)]);
      halo(p,5.6,.38*opened*(1-lift),pulseColor);
    }
  }
}
function weapons(t,mats,list) {
  if(t<53.7||t>67.5)return;
  const lance=point(mats[0],[0,37,529]), target=add(rockLocation(0,t),mainSurface);
  const charge=smooth(53.7,55.95,t)*(1-smooth(56.16,56.63,t));
  if(charge>0){
    halo(lance,32*charge+3,charge*2.10,ice);
    pointLight(lance,84,ice,charge*2);
    for(let j=0;j<21;j++){
      const u=mod((t-53.7)*.90+j*.12,1), a=j*2.39996+t;
      const p=add(lance,[cos(a)*(1-u)*53,sin(a)*(1-u)*53,-112*(1-u)]);
      line(p,lerp3(p,lance,.28),1.6,charge*(.3+u),cyan);
    }
    for(let j=0;j<14;j++)if(smooth(53.55+j*.11,53.91+j*.11,t)>.5){
      for(const s of [-1,1])list.push([lanceCharge,matrix([s*(23-j*.5),49-j*.4,186+j*21])]);
    }
  }
  const beam=smooth(55.98,56.28,t)*(1-smooth(59.03,59.65,t));
  if(beam>0){
    const tail=lerp3(lance,target,smooth(59.18,59.73,t));
    const head=lerp3(lance,target,smooth(55.98,56.33,t));
    const f=beam*(.91+.09*sin(t*32));
    lightVolume(tail,head,18+12*f,24+12*f,[.045,.39,.77],.16*f);
    line(tail,head,24*f+.8,2.6*f,cyan,2,mod(t*3,1));
    line(tail,head,9*f+.6,4.1*f,[.74,1.22,1.59],2,mod(t*5,1));
    halo(lance,32,2*f,ice);halo(head,46,2*f,cyan);
    if(lights.length<10)pointLight(head,115,ice,2.6*f);
    if(lights.length<10)pointLight(lance,135,ice,2.8*f);
    const z=unit(sub(head,lance)),x=unit(cross(z,[0,1,0])),y=cross(x,z);
    for(let ring=0;ring<4;ring++){
      const k=mod(t*2.11+ring*.25,1),radius=(15+k*34)*f;
      const center=lerp3(lance,head,k*.63);
      for(let j=0;j<22;j++){
        const a=j/22*TAU,b=(j+1)/22*TAU;
        const pp=add(center,scale(add(scale(x,cos(a)),scale(y,sin(a))),radius));
        const q=add(center,scale(add(scale(x,cos(b)),scale(y,sin(b))),radius));
        line(pp,q,1.65,f*(.95-k*.65),cyan);
      }
    }
  }
  if(t>=59.02&&t<=60.8)for(let j=0;j<23;j++){
    const age=t-59.02, u=clamp(j/28+age*(.35+j*.010));
    const p=add(lerp3(lance,target,u),[sin(j*9.1)*age*17,cos(j*17.2)*age*15,0]);
    line(add(p,[0,0,-4-j%5*3]),p,.75,.71*(1-smooth(.14,1.78,age))*(1-smooth(.93,1,u)),cyan,2);
  }
  impact(mainHotspot,t,58.9,2.7,ice,[0,37,529]);
  for(const [j,{fire,arrive,from,to}] of pulseEvents.entries()){
    const u=(t-fire)/(arrive-fire);
    if(u>-.16&&u<0){
      const pre=smooth(-.16,0,u);
      halo(from,7+pre*4,pre*1.35,pulseColor);
    }
    if(u>=0&&u<1){
      const p=lerp3(from,to,u);
      line(p,lerp3(from,to,Math.max(0,u-.046)),6.1,2.26,pulseColor,1,.58);
      halo(p,10,1.53,pulseColor);halo(p,4,2.53,[1.24,.61,.38]);
      if(u<.13){
        halo(from,15,2.3*(1-u/.13),pulseColor);
        if(lights.length<10)pointLight(from,53,gold,.95*(1-u/.13));
      }
    }
    if(j%2===0)impact(to,t,arrive,.72,pulseColor,from);
    if(j%5===1)chipSpray(list,t,from,to,arrive,7,pulseColor,j);
  }
  for(const [j,{fire,arrive,from,to,idx}] of guardEvents.entries()){
    const u=(t-fire)/(arrive-fire);
    if(u>=0&&u<1){
      const rear=lerp3(from,to,Math.max(0,u-.06)), tip=lerp3(from,to,u);
      line(rear,tip,idx===19?1.82:1.40,idx===19?3.0:2.25,pale);
      halo(tip,1.4,.55,ice);
      if(u<.12){
        const flash=1-u/.12;
        halo(from,idx===19?11:8,2.16*flash,pale);
        if(idx===19)line(from,lerp3(from,to,.080),1.55,1.7*flash,[.88,1.09,1.30],3);
        if((idx===19||j%8===0)&&lights.length<11)pointLight(from,33,ice,1.35*(1-u/.12));
      }
    }
    if(j%3===0)impact(to,t,arrive,.27,[.88,.74,.52],from);
    if(j%13===1)chipSpray(list,t,from,to,arrive,4,pale,j);
  }
  for(const [j,{fire,arrive,from,to,trajectory}] of missileEvents.entries()){
    const u=(t-fire)/(arrive-fire);
    const ignition=.037;
    if(u>=0&&u<1){
      const p=trajectory(u);
      const m=shipDirection(p,sub(trajectory(u+.001),trajectory(u-.001)));
      list.push([missileModel,m]);
      const exhaust=point(m,[0,0,-6.5]);
      const power=smooth(ignition,.097,u);
      halo(exhaust,8,2.65*power,gold);halo(exhaust,3.2,2.8*power,pale);
      line(exhaust,point(m,[0,0,-24]),5.0,2.1*power,ice,1,.34);
      if(u<.050)halo(from,10,(1-u/.050)*.61,cyan);
    }
    if(u>ignition&&u<1.38){
      const last=clamp(u),first=clamp(u-.38,ignition,1);
      for(let h=0;h<16;h++){
        const a=mix(first,last,h/16),b=mix(first,last,(h+1)/16),p=trajectory(a);
        const f=clamp(1-(u-a)/.38),warm=smooth(ignition,.085,a);
        line(p,trajectory(b),1.6+f*2.0,(.58+1.68*f)*smooth(0,.12,f)*warm,gold,2,mod(t*2,1));
        if(h%2===0)halo(p,4.0+4.2*(1-f),.22*f*warm,lilac);
      }
    }
    impact(to,t,arrive,j%3===0?1.74:1.11,gold,trajectory(.84));
    if(j%4===0)chipSpray(list,t,from,to,arrive,11,gold,j);
  }
  for(const [i,r] of primaryRocks.entries()) {
    const a=t-r.event;
    if(a<-.65||a>5)continue;
    const e=smooth(-.65,.07,a)*(1-smooth(.16,4.4,a));
    if(lights.length<10)pointLight(impactFoci[i],i===3?60:102,r.tint,(i===3?1.22:2.42)*e);
    const spread=48+Math.max(0,a)*16;
    const origin=impactFoci[i];
    lightVolume(add(origin,[-spread,3,15]),add(origin,[spread,18,42]),spread*.62,spread*.93,i===0?[.062,.32,.58]:[.62,.225,.068],e*.21);
    if(i!==0)impact(origin,t,r.event,i===3?.28:.72,r.tint);
    for(let j=0;j<9;j++){
      const d=[sin(j*24.1)*.92,cos(j*15.24)*.72,sin(j*4.07)*.94];
      const cloud=add(origin,scale(d,25+Math.max(0,a)*(25+j*4)));
      halo(cloud,18+14*Math.max(0,a)+j*3,.30*e*(1-j*.06),i===0?cyan:gold);
    }
  }
}
function loopXZ(p,r,color,e,size=0.45) {
  for(let j=0;j<60;j++){
    const a=j/60*TAU,b=(j+1)/60*TAU;
    line(add(p,[cos(a)*r,0,sin(a)*r]),add(p,[cos(b)*r,0,sin(b)*r]),size,e,color,2);
  }
}
function bridgeScene(t,list){
  spotLight([30,37,76],[6,8,0],105,94,[.58,.49,.34]);
  lightVolume([35,47,61],[5,15,-14],14,28,[.17,.57,.86],.19);
  lightVolume([0,36,18],[0,8,16],8,16,[.05,.52,.78],.28);
  glassPane(bridgeGlass);
  list.push([bridgeModel,identity]);
  pointLight([0,18,15],25,cyan,2.2);
  pointLight([0,29,60],78,ice,.78);
  pointLight([-34,22,-30],27,gold,.60);
  pointLight([40,15,-12],32,cyan,.72);
  const orbit=matrix([0,21,16],-.23+sin((t-26)*.40)*.22,.11,.025);
  const plotted=[0,1,2,3,5,8,9,10,12,13,17,18,19,21,24,25,26,28,29];
  const bridgeFrame=matrix([0,-73,222]);
  const projectedFleet=fleet.map((_,i)=>shipPose(i,t));
  const markers=plotted.map(i=>{
    const [x,y,z]=point(projectedFleet[i],[0,0,0]);
    return i===0?[0,0,0]:[x*.022,y*.032,z*.015];
  });
  for(const [i,v] of markers.entries()){
    const isFlag=i===0,u=t*.32;
    const local=isFlag?v:add(v,[sin(u+i*1.3)*.54,cos(u+i)*.44,sin(u+i*.8)*1.25]);
    const p=point(orbit,local),wide=isFlag?2.9:1.14,length=isFlag?7.4:2.25,c=isFlag?pale:i%6>3?cyan:[.13,.64,.65];
    const offset=q=>point(orbit,add(local,q));
    const nose=offset([0,0,length]),a=offset([-wide,.3,-length*.5]),b=offset([wide,.3,-length*.5]);
    for(const [x,y] of [[a,b],[nose,a],[nose,b],[p,offset([0,-.65,-length])]])line(x,y,.32,isFlag?1.36:1.06,c,2);
    if(isFlag||i%2===0)halo(p,isFlag?3.1:1.5,isFlag?.42:.57,c);
    for(let j=0;j<3;j++){
      const z=-length-1-j*1.28-mod(u+i*.3,1)*1.25;
      line(offset([0,0,z]),offset([0,0,z-.55]),.24,(.63-j*.16),c,2);
    }
    if(i%3===0)line([p[0],8,p[2]-.5],p,.36,.15,c,2);
  }
  for(let j=0;j<4;j++){
    const f=mod(t*.32+j*.25,1);
    loopXZ([0,9+f*19,16],9+f*8,cyan,(1-f)*.42);
  }
  for(const side of [-1,1]){
    for(let k=0;k<5;k++){
      const z=5+k*4.2,y=14+mod(t*.41+k*.113,1)*11;
      const p=[side*(13+sin(t*.9+k)*1.4),y,z];
      line(p,add(p,[0,.2,1.6+sin(k+t)*.9]),.31,.54,cyan,2);
      if(k%2===0)line(add(p,[0,-3,0]),p,.31,.39,ice,2);
    }
  }
  for(const side of [-1,1]){
    const x=side*35, z=50.25;
    const wave=k=>37.4+1.5*sin(k*.81+(t-26)*1.5+side*.7)+.54*cos(k*2.23);
    for(let k=0;k<11;k++){
      const a=[x-10+k*1.85,wave(k),z], b=[x-10+(k+1)*1.85,wave(k+1),z];
      line(a,b,.30,.72,side<0?ice:[.65,.50,1.0],2);
    }
    const cursor=mod((t-26)*.61+side*.13,1);
    const p=[x-10+cursor*19.8,38,z-.04];
    line(add(p,[0,-4.9,0]),add(p,[0,5.3,0]),.25,.49,cyan,2);
  }
  for(const x of [-4,4]){
    line([x,9,15],[0,23,15],1.8,.16,cyan,2);
  }
  list.push([flagModel.foredeck,bridgeFrame,0]);
  for(const [i,ship] of fleet.entries()){
    if(i===0||ship.p[2]<145)continue;
    const pose=multiply(bridgeFrame,projectedFleet[i]);
    const vanguard=ship.kind==='vanguard', model=vanguard?vanguardModel:guardModel;
    list.push([model,pose,0]);
    if(vanguard)list.push([readyRacks,pose,0]);
    engines(pose,escortPorts[ship.kind],t,.32,true);
  }
}
function coreScene(t,list){
  const age=t-34,pulse=.76+.24*sin(age*2.05),gather=.52+.48*cos(age*1.46);
  list.push([coreModel,identity]);
  spotLight([36,29,-32],[100,0,-84],101,134,scale([.25,.69,1.04],pulse));
  lightVolume([0,-114,0],[0,19,0],20,24,[.063,.59,.90],.20*pulse);
  lightVolume([0,113,0],[0,-21,0],22,24,[.16,.43,.93],.19*pulse);
  lightVolume([0,-19,0],[0,20,0],9,17,[.10,.61,.96],.22*gather);
  lightVolume([0,1,9],[-88,25,36],10,25,[.15,.39,.66],.12*pulse);
  pointLight([0,-61,0],62,cyan,2.47*pulse);
  pointLight([0,0,0],53,ice,1.34+gather*1.9);
  pointLight([0,74,0],66,cyan,2.15*pulse);
  pointLight([49,-85,-53],52,gold,.67);
  pointLight([-69,59,46],67,lilac,.80*pulse);
  pointLight([77,91,-29],44,gold,.43+.19*gather);
  for(let i=0;i<3;i++){
    const a=age*(i%2?-.29:.22)+i*1.6;
    const base=[-50,3,59][i];
    list.push([coreRings[i],matrix([0,base,0],a,sin(age*.61+i)*.18,cos(age*.37+i)*.16)]);
  }
  // Filaments vary in radius as they cross the otherwise open gap.
  for(let f=0;f<4;f++){
    const curl=f*Math.PI*.5+age*.88;
    const path=u=>{
      const r=mix(13.5,4.2,Math.pow(sin(Math.PI*u),2))*(.77+.28*gather);
      const a=curl+u*3.41+.21*sin(u*TAU+age*2.2);
      return [cos(a)*r,mix(-21,21,u),sin(a)*r];
    };
    for(let i=0;i<26;i++){
      const u=i/26,v=(i+1)/26, q=.54+.46*sin(u*14.-age*6.+f);
      line(path(u),path(v),1.18+gather*.75,(.57+.48*gather)*q,f===2?lilac:ice,2);
    }
    const u=mod(age*.47+f*.31,1);
    halo(path(u),4.4+.9*gather,.42+.44*gather,f===2?lilac:cyan);
  }
  for(const end of [-1,1])for(let j=0;j<9;j++){
    const u=mod(age*.28+j/9+end*.14,1),a=j*2.39996+u*4.8+age*.22;
    const y=end*mix(102,28,u),r=mix(34,10,u);
    const p=[cos(a)*r,y,sin(a)*r];
    const alpha=smooth(0,.11,u)*(1-smooth(.86,1,u));
    if(alpha>.025){
      const c=end>0&&j%3===0?lilac:cyan;
      if(j%2===0)list.push([reactorPacket,matrix(p,a+.42,.12*sin(a),.19*cos(a))]);
      halo(p,4.8,.48*alpha,c);
      line(p,add(p,[sin(a)*1.6,end*8,-cos(a)*1.6]),1.4,alpha*.76,c,3);
    }
  }
  for(const s of [-1,1])for(const q of [-1,1])for(let j=0;j<4;j++){
    const f=mod(age*.27+j*.24+s*.08+q*.11,1), y=-106+f*215;
    const a=[s*80,y,q*41],b=[s*80,y+11,q*41];
    line(a,b,1.3,pulse*.81,ice,2);
    halo(b,5.6,.22*pulse,cyan);
  }
  for(const side of [-1,1])for(let j=0;j<8;j++){
    const step=mod(age*1.23+j*.12,1),x=side*mix(50,98,step);
    const a=[x,-14,0],b=[x+side*4,-14,0];
    line(a,b,1.15,(1-step)*pulse*.60,cyan,2);
  }
  for(let k=0;k<3;k++){
    const u=mod(age*.48+k*.333,1);
    const radial=6+Math.pow(u,1.60)*35;
    loopXZ([0,Math.sin(u*TAU)*2.7,0],radial,ice,(1-u)*gather*.41,.75);
  }
  halo([0,0,0],26,.15+gather*.52,cyan);
}
const trafficPaths=[
  [[0,[256,29,-300],2.02],[12,[256,29,-300],2.02],[15,[188,25,-198],-1.25],
   [16.2,[110,24,-119],-1.38],[17.8,[54,21,-108],-1.43],[19.6,[6,16,-77],-.84],
   [20.45,[-13,20,-96],-.74],[21.25,[-23,20,-110],0],[22.2,[-44,18,-110],0],
   [23,[-44,9,-110],0],[59,[-44,9,-110],0],[60,[-44,18,-110],0],
   [61.2,[-26,21,-110],1.44],[64,[52,25,-110],1.57],[67,[127,25,-110],1.58],
   [69,[172,28,-111],1.68],[72,[224,30,-172],2.09],[76,[256,29,-300],2.02]],
  [[0,[-42,9,-28],0],[17.85,[-42,9,-28],0],[18.8,[-42,20,-28],0],
   [19.75,[-27,22,-28],0],[20.6,[-18,25,-14],.67],[21.7,[-15,25,17],.29],[23.2,[-14,25,72],.38],
   [24.8,[21,25,140],.86],[26,[109,27,151],1.38],[39,[298,67,287],.26],
   [51,[298,67,287],.26],[62,[125,25,155],-1.45],[65.84,[58,24,151],-1.56],[68,[26,25,124],-2.14],
   [71.5,[-15,25,25],-3.06],[72.8,[-19,23,-23],-2.18],[73.65,[-24,21,-28],0],
   [74.8,[-42,20,-28],0],[76,[-42,9,-28],0]]
];
function trafficPose(path,t){
  const i=path.findIndex(key=>key[0]>t);
  const a=path[i-1],b=path[i],prev=path[i-2]??a,next=path[i+1]??b;
  const dt=b[0]-a[0],u=clamp((t-a[0])/dt);
  const tangent=(v,w)=>v*w>0?2*v*w/(v+w):0;
  const velocity=[];
  const position=a[1].map((from,k)=>{
    const to=b[1][k],now=(to-from)/dt;
    const m=tangent((from-prev[1][k])/Math.max(.001,a[0]-prev[0]),now)*dt;
    const n=tangent(now,(next[1][k]-to)/Math.max(.001,next[0]-b[0]))*dt;
    const c=3*(to-from)-2*m-n,d=2*(from-to)+m+n;
    velocity.push((m+2*c*u+3*d*u*u)/dt);
    return from+u*(m+u*(c+u*d));
  });
  const yawDelta=mod(b[2]-a[2]+Math.PI,TAU)-Math.PI;
  const moving=smooth(1,36,Math.hypot(...velocity));
  const roll=sin(u*Math.PI)*clamp(yawDelta*.29,-.18,.18);
  const travel=Math.hypot(velocity[0],velocity[2]);
  const tilt=-Math.atan2(velocity[1],18+travel)*.54*smooth(2,20,travel);
  return {
    local:position,
    matrix:matrix(add(position,hangarOrigin),a[2]+yawDelta*smooth(0,1,u),tilt,roll),
    moving
  };
}
function hangarExitOpen(t){
  const launch=smooth(23.45,25.04,t)*(1-smooth(26.25,28.65,t));
  const recovery=smooth(59.5,61.76,t)*(1-smooth(67.45,70.35,t));
  return Math.max(launch,recovery);
}
function hangarScene(t,list){
  list.push([hangarModel,hangarTransform,1]);
  const local=p=>add(p,hangarOrigin);
  const exit=hangarExitOpen(t);
  for(const side of [-1,1]){
    const shift=side*(13.6+exit*26.5);
    const shutter=local([75-exit*1.7,30,(hangarExit[0]+hangarExit[1])*.5+shift]);
    list.push([bayShutter,matrix(shutter,.046*side*exit),1]);
  }
  if(t>13.6&&t<26){
    if(exit>.02)pointLight(local([61,26,153]),32,ice,.78*exit);
    const exposure=smooth(13.6,15.7,t);
    spotLight(local([77,49,-122]),local([-20,0,-95]),99,98,scale([.34,.59,.83],exposure),true);
    lightVolume(local([107,43,-119]),local([-37,12,-111]),18,38,[.16,.54,.81],.24);
    lightVolume(local([88,41,150]),local([-23,6,131]),14,30,[.19,.43,.83],.025+.19*exit);
    lightVolume(local([-40,38,-86]),local([-1,2,-72]),7,24,[.55,.26,.069],.12);
  }
  for(const [p,r,c,e] of [
    [[72,28,-115],42,cyan,1.35],[[-35,17,-105],35,gold,1.05],
    [[27,27,-15],49,ice,1.10],[[-34,14,74],36,gold,1.14],[[68,31,155],43,ice,.35+exit*1.41]
  ])pointLight(local(p),r,c,e);
  for(const [i,z] of [-49,92].entries()){
    const f=.5+.5*sin(TAU*t/duration*(i+3)+i*.81);
    const p=local([0,50,z+(f-.5)*22]);
    list.push([liftGantry,matrix(p),1]);
    for(const side of [-1,1]){
      const lamp=add(p,[side*7,-10,0]);
      if(t>14&&t<26)halo(lamp,10,.20,gold);
    }
  }
  for(const s of [-1,1])for(let j=0;j<8;j++)if((s<0&&j!==1&&j!==3)||(s>0&&j>2&&j!==5&&j!==7)) {
    const p=[s*48,9,-151+j*41];
    list.push([cutterModel,matrix(local(p),s*.16),1]);
    if(j%2===0)halo(local(add(p,[s*2,2,-6])),5,.29,cyan);
  }
  for(const route of trafficPaths){
    const {local:position,matrix:pose,moving}=trafficPose(route,t);
    list.push([cutterModel,pose,position[0]<68?1:0]);
    if(moving>.008){
      engines(pose,cutterPorts,t,.22+moving*.20,true,moving);
      if(t>17&&t<26&&position[0]<70){
        const vent=point(pose,[0,-4,-12]);
        const strength=moving*(1-smooth(51,70,position[0]))*(1-.51*smooth(18,30,position[1]));
        pointLight(vent,24,cyan,strength*.74);
        lightVolume(vent,[vent[0],hangarOrigin[1]+5,vent[2]-3],2,8,[.10,.60,1.0],strength*.18);
      }
    }
  }
  if(exit>.01)for(let i=0;i<7;i++){
    const u=mod(t*.83+i*.151,1),x=mix(20,74,u);
    for(const z of [139,163]){
      const p=local([x,2,z]);
      line(p,add(p,[3.1,0,0]),1.1,exit*.72,ice,2);
    }
  }
  for(let i=0;i<13;i++){
    const z=mod(t*31+i*27,349)-174;
    for(const s of [-1,1])line(local([s*15,1.3,z]),local([s*15,1.3,z+6]),1.0,.73,ice,2);
  }
}
function conduitScene(t,list){
  const age=t-43,cycle=.62+.38*cos(age*1.62-.83),transfer=transferPower(t);
  spotLight([0,41,181],[0,7,65],102,69,[.89,.54,.21]);
  lightVolume([0,33,187],[0,27,62],12,34,[.83,.34,.081],.179+.055*cycle);
  lightVolume([18,58,-105],[16,26,23],5,12,[.08,.37,.65],.17);
  lightVolume([-35,45,-68],[-8,14,-43],6,20,[.66,.28,.073],.13);
  lightVolume([0,43,169],[0,22,132],13,23,[.079,.48,.76],.11*cycle);
  list.push([conduitModel,identity]);
  list.push([conduitCollimators[0],matrix([0,35,166+cycle*1.1],0,0,age*.34)]);
  list.push([conduitCollimators[1],matrix([0,35,175-cycle*1.6],0,0,-age*.49+.32)]);
  pointLight([0,34,185],64,gold,1.36+cycle*.49+transfer*.52);
  pointLight([0,33,159],54,ice,1.16+cycle*.40);
  pointLight([0,26,-121],38,cyan,1.26);
  pointLight([-20,38,-72],37,gold,1.62);
  pointLight([18,42,-12],32,gold,1.28);
  pointLight([0,60,44],44,cyan,1.47);
  pointLight([10,14,80],36,cyan,1.25);
  for(const s of [-1,1]){
    for(let j=0;j<9;j++){
      const z=-160+j*35, grip=.5+.5*sin(age*2.35+j*.77+s*.37);
      const p=[s*(25+grip*5),43-grip*5,z-3];
      const open=3.5+5.5*grip;
      list.push([loaderModel,matrix(p)]);
      for(const flank of [-1,1]){
        list.push([loaderJaw,matrix([p[0]+flank*open,p[1]-7,p[2]+4],0,flank*.03,-flank*(.19+.25*grip))]);
      }
      if(grip>.77)halo(add(p,[0,-6.2,0]),12,.33*grip,gold);
    }
    for(let i=0;i<11;i++){
      const u=mod(age*.192+i*.092+s*.022,1),z=-171+u*343;
      const fold=smooth(121,170,z), high=i%3!==0;
      const p=[s*mix(18,9,fold),high?mix(55,44,fold):mix(8,26,fold),z];
      const energy=smooth(0,.034,u)*(1-smooth(.962,1,u));
      list.push([chargeModel,matrix(p,-s*.068*fold,high?.20*fold:-.24*fold,0)]);
      halo(p,8.9,.55*energy,cyan);
      line(p,add(p,[s*fold*1.4,0,-13]),2.15,.68*energy,cyan,1,.20);
    }
    for(let i=0;i<8;i++){
      const u=mod(age*.64+i*.24+(s+1)*.13,1),z=123+u*50,x=s*mix(18,8,u);
      const p=[x,mix(58,46,u),z];
      line(add(p,[s,0,-4]),p,1.38,.63*(1-u),pale,2);
    }
  }
  for(let i=0;i<15;i++){
    const u=mod(age*.58+i*.076,1),a=i*2.39996+age*.43;
    const r=mix(21,5,u),z=mix(153,188,u),p=[cos(a)*r,35+sin(a)*r,z];
    const strength=(1-u)*cycle*smooth(0,.09,u);
    halo(p,2.6,.86*strength,i%3===0?ice:gold);
    line(add(p,[sin(a)*.7,-cos(a)*.7,-4]),p,1.3,strength*.62,i%3===0?ice:gold,3);
  }
  halo([0,35,183],30,.21+.15*cycle+.32*transfer,gold);
}
function render(t){
  resize();
  t=mod(t,duration);
  const name=t<26?'exterior':t<34?'bridge':t<43?'core':t<51?'conduit':'attack';
  const outside=name==='exterior'||name==='attack';
  spline(shots[name],t,outside);
  const room=outside?(name==='exterior'?smooth(17.4,20,t):0):1;
  const deck=name==='exterior'&&t>17.15?hangarOrigin[1]+1:(name==='bridge'||name==='conduit'?1:-9999);
  startScene(t,room,deck,outside?smooth(17.15,19.35,t):1);
  const list=[];
  if(outside) {
    const mats=fleet.map((_,i)=>shipPose(i,t));
    paintFleet(t,mats,list);
    hangarScene(t,list);
    addAsteroids(t,list);weapons(t,mats,list);
  } else {
    ({bridge:bridgeScene,core:coreScene,conduit:conduitScene})[name](t,list);
  }
  castSunShadows(list,outside&&room<.95);
  castSpotShadows(list);
  solids();
  gl.uniform3f(solid.u.faultGlow,0,0,0);
  let lighting=-1,heated=false,shieldLit=false;
  for(const [obj,m,local,heat,fracture,sweep] of list)if(obj.n){
    const grade=local??(outside?0:1);
    if(lighting!==grade){gl.uniform1f(solid.u.inside,grade);lighting=grade;}
    if(heat){
      gl.uniform3fv(solid.u.faultGlow,heat);
      gl.uniform4fv(solid.u.faultTrace,fracture);
    } else if(heated)gl.uniform3f(solid.u.faultGlow,0,0,0);
    if(sweep)gl.uniform3fv(solid.u.shieldSweep,sweep);
    else if(shieldLit)gl.uniform3f(solid.u.shieldSweep,0,0,0);
    shieldLit=!!sweep;
    heated=!!heat;obj.draw(m);
  }
  drawDeckReflection(list,outside);
  finishScene();
}
let exportState=null, epoch=performance.now();
window.videoExport={
  runs:['tour'],
  async begin(runId,{fps}){
    if(runId!=='tour'||!Number.isFinite(fps)||fps<=0)throw new RangeError('Invalid export parameters');
    exportState={fps,frames:Math.round(duration*fps),t:0};
    render(0);gl.finish();
    return {frames:exportState.frames};
  },
  async frame(i){
    if(!exportState||!Number.isInteger(i)||i<0||i>=exportState.frames)throw new RangeError('Invalid export frame');
    exportState.t=i/exportState.fps;
    render(exportState.t);gl.finish();
  },
  end(){
    if(!exportState)return;
    epoch=performance.now()-exportState.t*1000;exportState=null;
  }
};
function autoplay(now){
  if(!exportState)render((now-epoch)/1000);
  requestAnimationFrame(autoplay);
}
render(0);
epoch=performance.now();
requestAnimationFrame(autoplay);









































