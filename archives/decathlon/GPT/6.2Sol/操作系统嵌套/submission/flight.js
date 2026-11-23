export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const mix=(a,b,x)=>a+(b-a)*x;
export function validateScene(resource,record=resource?.record){
  if(!resource||!Array.isArray(resource.parts)||resource.parts.length>1000)throw Error('场景缺少部件列表，或超过 1000 个部件');
  const vector=(v,n=3)=>Array.isArray(v)&&v.length>=n&&v.slice(0,n).every(Number.isFinite);
  const validPart=p=>!!p&&vector(p.p)&&vector(p.s)&&p.s.slice(0,3).every(n=>n>0)&&(!p.r||vector(p.r));
  if(!resource.parts.every(validPart)||['obstacles','decor'].some(key=>resource[key]&&(!Array.isArray(resource[key])||resource[key].length>1000||!resource[key].every(validPart))))throw Error('部件位置、尺寸或旋转无效');
  if(resource.terrainProps?.mountains>100||resource.terrainProps?.pines>1500)throw Error('场景节点超出设备上限');
  for(const [key,value] of Object.entries(resource.camera??{}))
    if((key==='position'||key==='target')&&!vector(value))throw Error('镜头坐标无效');
  if(record?.frames){
    const rows=record.frames;
    if(!Array.isArray(rows)||!rows.length||!rows.every((row,i)=>vector(row,7)&&row[0]>=0&&(!i||rows[i-1][0]<row[0])&&(row[7]===undefined||Number.isFinite(row[7]))))
      throw Error('记录中的关键帧必须包含完整位姿并按时间递增');
  }
}
export const phase=(t,fault=9.15,impact=12.62)=>t<1.2?'旋翼启动':t<4?'离地爬升':t<fault?'高地巡航':t<impact?'故障 / 失控':t<impact+.78?'接地 / 撞击':'余波';
export function ground(scene,x,z){
  let h=(Math.sin(x*.078+1.2)*Math.cos(z*.091+.4)*.53+Math.sin(x*.145+z*.059)*.32)*(scene.terrain?.amplitude??0);
  for(const p of scene.pads??[]) {
    const a=clamp((Math.hypot(p.x-x,p.z-z)-p.r)/4,0,1);
    h*=a*a*(3-2*a);
  }
  return h;
}
const forests=new WeakMap();
export function pineLayout(scene){
  if(forests.has(scene))return forests.get(scene);
  const random=n=>{const m=Math.sin(n*91.17+15.7)*43758.5453;return m-Math.floor(m);};
  const result=[];
  for(let i=0;i<(scene.terrainProps?.pines??0);i++){
    const x=(random(i*3+5)-.5)*133,z=(random(i*3+6)-.5)*122;
    if((scene.pads??[]).some(p=>Math.hypot(p.x-x,p.z-z)<p.r+5)||Math.abs(x)<9)continue;
    result.push({x,z,y:ground(scene,x,z),h:2.5+random(i*16)*4.2,i});
  }
  forests.set(scene,result);return result;
}
export function contact(scene,x,z){
  let h=ground(scene,x,z);
  for(const p of scene.obstacles??[]){
    const dx=x-p.p[0],dz=z-p.p[2],turn=p.r?.[1]??0;
    const lx=dx*Math.cos(turn)-dz*Math.sin(turn),lz=dz*Math.cos(turn)+dx*Math.sin(turn);
    if(Math.abs(lx)<p.s[0]*.5+.14&&Math.abs(lz)<p.s[2]*.5+.14)
      h=Math.max(h,p.p[1]+p.s[1]*.5+ground(scene,p.p[0],p.p[2]));
  }
  for(const p of pineLayout(scene)){
    const radius=Math.hypot(p.x-x,p.z-z)/p.h;
    if(radius<.25)h=Math.max(h,p.y+p.h*(1.075-radius*1.44));
  }
  return h;
}
export function sample(scene,t,record=scene.record){
  const rows=record?.frames??[];
  let i=0,j=rows.length-1;
  while(i<j){const m=(i+j+1)>>1;if(rows[m][0]<=t)i=m;else j=m-1;}
  const a=rows[i]??[0,0,1.02,0,0,0,0],b=rows[Math.min(rows.length-1,i+1)]??a;
  const alpha=clamp((t-a[0])/Math.max(.001,b[0]-a[0]),0,1);
  const values=a.slice(1,7).map((v,n)=>mix(v,b[n+1],alpha));
  const [x,y,z,yaw,pitch,roll]=values;
  const impact=record?.impact??null, fault=record?.fault??null;
  const velocity={};
  for(const [i,key] of ['vx','vy','vz','vpitch','vroll'].entries()){
    const index=8+i;
    if(Number.isFinite(a[index]))velocity[key]=mix(a[index],b[index]??a[index],alpha);
  }
  return {t,x,y,z,yaw,pitch,roll,impact,fault,damaged:impact!=null&&t>=impact,...velocity,
    spin:a[7]!=null?mix(a[7],b[7]??a[7],alpha):t*t*3.5/(1+t*.08),power:fault!=null&&t>=fault?.45:1};
}
export function takeFlight(f, t){
  return {...f,t:0,x:f.x,y:f.y,z:f.z,yaw:f.yaw,pitch:f.pitch,roll:f.roll,
    vx:f.vx??0,vy:f.vy??0,vz:f.vz??0,vpitch:f.vpitch??0,vroll:f.vroll??0,
    target:Math.max(4,f.y),goalX:0,goalZ:26,heading:f.yaw,
    wind:0,control:null,fault:null,impact:null,damaged:false,spin:f.spin??0,clock:t};
}
export function evolve(scene,f,d){
  f.t+=d;
  const floor=contact(scene,f.x,f.z)+1.02;
  if(f.impact!=null){f.spin+=Math.max(0,1-(f.t-f.impact)*2)*d*16;return f;}
  const u=f.control??{lift:.78,pitch:0,roll:0,yaw:f.yaw};
  const fault=f.fault!=null ? .45 : 1;
  f.power=fault;
  const gust=Math.sin(f.t*2.9)*.18+Math.cos(f.t*.57)*.12+f.wind*.31;
  f.vroll+=(f.roll*2.2+gust+u.roll-(1-fault)*(1.35+Math.sin(f.t*5)*.55))*d;
  f.vpitch+=(f.pitch*2.2+gust*.33+u.pitch)*d;
  f.roll=clamp(f.roll+f.vroll*d,-1.57,1.57);
  f.pitch=clamp(f.pitch+f.vpitch*d,-1.57,1.57);
  f.yaw+=(Math.atan2(Math.sin(u.yaw-f.yaw),Math.cos(u.yaw-f.yaw))*.85+(1-fault)*2.9)*d;
  const drift=Math.sin(f.yaw)*Math.min(1,Math.abs(f.vz)*.12);
  f.vx+=(Math.sin(f.roll)*7+f.wind*.34+drift*.82-f.vx*.18)*d;
  f.vz+=(-Math.sin(f.pitch)*7-f.vz*.18)*d;
  f.vy+=(9.81*(u.lift*Math.cos(f.roll)*Math.cos(f.pitch)*fault-1)-f.vy*.29)*d;
  f.x+=f.vx*d;f.y+=f.vy*d;f.z+=f.vz*d;f.spin+=d*42*fault;
  if(f.y<=floor){
    if(Math.abs(f.vy)>3.6||Math.abs(f.roll)>.66||Math.abs(f.pitch)>.72||Math.hypot(f.vx,f.vz)>7){
      f.impact=f.t;f.damaged=true;f.y=floor-.36;f.roll=Math.sign(f.roll||1)*1.27;
    }else{f.y=floor;f.vy=0;f.vx*=.72;f.vz*=.72;f.roll*=.65;f.pitch*=.65;f.vroll*=.84;f.vpitch*=.84;}
  }
  return f;
}
export function cameraOrbit(resource,frame,camera={},isDefault=false){
  const {t,yaw,damaged}=frame,mode=camera.mode??'cinema';
  if(mode==='orbit')return {angle:camera.angle??.82,tilt:camera.tilt??.29,distance:camera.distance??13};
  if(mode==='follow'&&camera.offset!==undefined)return {angle:camera.offset-yaw,tilt:camera.tilt,distance:camera.distance};
  const time=Math.min(t,14),opening=resource.camera?.angle??.58,fault=resource.record?.fault??9.15;
  let cinema=opening-yaw+Math.sin(time*.52)*.23;
  if(time>=fault){
    const atFault=sample(resource,fault).yaw;
    cinema=opening-atFault+Math.sin(fault*.52)*.23+(time-fault)*.37;
  }
  const distance=resource.camera?.distance??11.7;
  if(!isDefault&&mode==='follow')return {angle:.47-yaw,tilt:.29,distance};
  const rough=damaged?clamp((t-(frame.impact??t))/.45,0,1):0;
  const settle=rough*rough*(3-2*rough);
  return {angle:mode==='follow'?.47-yaw:cinema,tilt:mix(clamp(.22-t*.006,.13,.23),.22,settle),
    distance:mix(distance+Math.sin(t*.42)*2.15,distance+2.5,settle)};
}
export const flightRow=f=>[f.t,f.x,f.y,f.z,f.yaw,f.pitch,f.roll,f.spin,f.vx,f.vy,f.vz,f.vpitch,f.vroll];
