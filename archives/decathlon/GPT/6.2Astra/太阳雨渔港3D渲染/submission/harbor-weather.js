'use strict';
let banner,catHead,catPaws=[],fenders=[],wakePackets=[],wakeAges=[],sprays=[];
function waveAt(x,z){
  let displacement=0;
  for(let j=0;j<wakePackets.length;j++){
    const q=wakePackets[j],age=wakeAges[j];
    if(age<0||age>8)continue;
    const distance=Math.hypot(x-q.x,z-q.y),phase=distance-age*1.65;
    displacement+=Math.cos(phase*8.8)*Math.exp(-phase*phase*2.8-distance*.19)*Math.min(1,age*2);
  }
  return displacement;
}
function gustAt(x,z,t){
  const passage=(t%90)-14.8+(x+z*.24)/3.1;
  return Math.exp(-passage*passage/2.9);
}
function prepareWeather(){
  banner=marketPennant();banner.userData.verts=banner.geometry.attributes.position.array.slice();
  // Head, legs and folded wings move about their actual joints.
  catHead=group(cat,0,.30,.158);
  for(const obj of cat.children.slice()){
    if(obj===catHead)continue;
    if(obj.position.y>.30&&obj.position.z>.23){catHead.attach(obj)}
    else if(obj.geometry?.type==='CylinderGeometry'&&obj.position.y>.33){catHead.attach(obj)}
    else if(obj.position.y<.12&&Math.abs(obj.position.x)>.09)catPaws.push(obj);
  }
  for(const bird of birds){
    let g=bird.g;
    for(const s of [-1,1]){
      oval(g,s*.061,.081,.162,.010,.011,.009,'#384f50');
      rod(g,[s*.035,-.053,-.025],[s*.042,-.108,.002],.009,'#bd976e');
      rod(g,[s*.042,-.103,0],[s*.044,-.112,.047],.009,'#cfac73');
      let wing=bird.wings[s<0?0:1];
      face(wing,[[s*.41,.129,-.05],[s*.67,.174,-.145],[s*.55,.107,-.133]],'#889d9e');
    }
  }
  fish.forEach(({g},i)=>{
    oval(g,.079,.016,.032,.014,.013,.008,'#354c50');oval(g,.08,.018,-.032,.013,.011,.007,'#384f50');
    face(g,[[-.048,.038,0],[-.003,.082,0],[.035,.043,0]],'#769599');
    face(g,[[.003,.002,.026],[-.054,-.023,.075],[-.047,.000,.023]],'#889f98');
    let belly=oval(g,.004,-.012,0,.091,.027,.041,'#b5c4ae');belly.scale.z*=.97;
  });
  for(let j=0;j<9;j++){wakePackets.push(new T.Vector3(0,0,-100));wakeAges.push(-100)}
  waterU.wakePacket={value:wakePackets};
  waterU.heading={value:boats.map(b=>new T.Vector2(Math.cos(b.angle),Math.sin(b.angle)))};
  for(let i=0;i<16;i++){const s=group(world,0,W,0);sprays.push(s);for(let j=0;j<3;j++){const a=2.4*j+i;oval(s,Math.sin(a)*.07,.01+j*.04,Math.cos(a)*.067,.023,.043,.019,'#cee5da',roundG)}}
}
function updateWaves(t){
  const cyc=t%90;
  // Earlier crests continue across the basin after their source has moved.
  for(let j=0;j<wakePackets.length;j++){
    const birth=44+j*1.35+Math.floor((cyc-44-j*1.35)/(1.35*9))*1.35*9;
    const age=cyc-birth,active=birth>=45&&birth<78.6;
    const p=passagePose(birth);
    wakeAges[j]=active?age:-100;wakePackets[j].set(p.x,p.z,active?age:-100);
  }
}
function animateHarbor(t,near){
  const cyc=t%90,cycle=Math.floor(t/90);
  for(let i=0;i<boats.length;i++){
    let b=boats[i],g=b.g,wave=waveAt(g.position.x,g.position.z);
    if(i<2){g.position.y+=.044*wave;g.rotation.z+=wave*.044;g.rotation.x+=wave*.025}
    waterU.heading.value[i].set(Math.cos(g.rotation.y),Math.sin(g.rotation.y));waterU.boats.value[i].copy(g.position);
  }
  for(const f of fenders){const sway=Math.sin(t*1.51+f.phase);f.o.rotation.x=sway*.067+.13*waveAt(f.b.x,f.b.z);f.o.position.x=f.x+f.s*.012*sway}
  floats.forEach((o,i)=>{let w=waveAt(o.position.x,o.position.z);o.position.y=W+.022*Math.sin(t*1.62+i)+w*.076;o.rotation.z=.047*Math.sin(t*1.91+i)+w*.19});
  const pos=new T.Vector3();
  for(let i=0;i<flags.length;i++){
    let o=flags[i];o.getWorldPosition(pos);let burst=gustAt(pos.x,pos.z,t);
    o.rotation.z=.042*Math.sin(t*2.42+i)+.13*burst;o.rotation.y=.10*Math.sin(t*1.7+i)+.47*burst;
  }
  nets.forEach(o=>{o.getWorldPosition(pos);let burst=gustAt(pos.x,pos.z,t);o.rotation.x=(.029+.14*burst)*Math.sin(t*2.08);o.rotation.z=.018*burst});
  trees.forEach((o,i)=>{o.getWorldPosition(pos);let burst=gustAt(pos.x,pos.z,t);o.rotation.z=(.009+.056*burst)*Math.sin(t*1.6+i*.42)});
  const points=banner.geometry.attributes.position,original=banner.userData.verts;
  for(let i=0;i<points.count;i++){let x=original[i*3],y=original[i*3+1],v=(.725-y)/1.45,m=.046+.088*gustAt(-4.3,.88,t);points.setXYZ(i,x+.023*v*Math.sin(t*2+v*4),y+.012*v*Math.cos(t*2+v*3),v*m*(Math.sin(t*2.5-v*6+x*6)+.37*Math.cos(x*12+v*5-t)))}
  points.needsUpdate=true;banner.geometry.computeVertexNormals();
  foam.forEach((o,i)=>{let w=waveAt(o.position.x,o.position.z),u=.5+.5*Math.sin(t*1.29+i*.71);o.position.y=W+.022+.028*u+.039*w;o.scale.y=.009+.013*u+.012*Math.abs(w)});
  sprays.forEach((s,i)=>{const x=i<8?4.76+i*.19:-2.60,z=i<8?-1.96+Math.sin(i)*.31:-3.4+(i-8)*1.43;
    const h=Math.max(0,waveAt(x,z)-.17);s.visible=h>.045;s.position.set(x,W+.06+h*.21,z);s.scale.setScalar(h*1.95)});
  // Perched birds settle onto the working quay, and one skims out over the opening.
  birds.forEach(({g,x,y,z,wings,id},i)=>{
    let flight=1,heading=0,flap=.16,phase=t*.21+i;
    if(id===2){
      let free=Math.max(near,smooth((cyc-53)/2)*smooth((67-cyc)/5));
      g.position.set(x+free*(.72+1.39*Math.sin(phase)),y+free*(1.53+.42*Math.cos(phase)),z+free*(.16+.91*Math.cos(phase)));
      flight=clamp(free*2);heading=mix(.62,phase+1,flight);flap=.4;
    }else if(id===0){
      let settle=smooth((cyc-5)/5)*smooth((18-cyc)/3);
      const perch=V(3.8,Y+.48,-4.70);g.position.set(mix(x+1.23*Math.sin(phase),perch.x,settle),mix(y+.19*Math.sin(phase*1.52),perch.y,settle),mix(z+.91*Math.cos(phase),perch.z,settle));
      flight=1-settle;heading=phase+1.3;flap=.22;
    }else{
      let dive=id===3?Math.exp(-Math.pow((cyc-39)/5,2)):0;
      g.position.set(x+(1.2+.32*i)*Math.sin(phase),mix(y+.31*Math.sin(phase*1.43),W+.24,dive),mix(z+1.13*Math.cos(phase),1.2+.95*Math.cos(phase),dive));heading=phase+1.5;
    }
    g.rotation.y=heading;g.rotation.z=Math.sin(phase)*.11*flight;
    wings.forEach((w,k)=>{let side=k?1:-1;w.rotation.z=side*(flight*flap*Math.sin(t*(3.2+i*.24)+i)-(1-flight)*.86);w.rotation.y=side*(1-flight)*1.15;w.scale.x=.46+.54*flight});
  });
  const start=20.7,stop=34,activity=smooth((cyc-start)/1.1)*smooth((stop-cyc)/.8);
  const routes=[
    [[-6.05,5.46],[-5.65,6.07],[-5.14,6.18],[-4.43,6.10],[-4.84,5.20],[-5.62,5.24],[-6.05,5.46]],
    [[-6.05,5.46],[-5.68,5.22],[-5.08,4.72],[-4.41,4.45],[-4.51,5.21],[-5.51,5.56],[-6.05,5.46]],
    [[-6.05,5.46],[-5.53,5.69],[-5.14,6.13],[-4.45,6.31],[-4.53,5.91],[-5.41,5.53],[-6.05,5.46]]
  ];
  let phase=clamp((cyc-start)/(stop-start)),u=phase<.37?.48*smooth(phase/.37):phase<.69?.48+.045*smooth((phase-.37)/.32):.525+.475*smooth((phase-.69)/.31);
  if(!cat.userData.routes)cat.userData.routes=routes.map(path=>new T.CatmullRomCurve3(path.map(v=>V(v[0],0,v[1]))));
  let path=cat.userData.routes[cycle%3],point=path.getPoint(u),dir=path.getTangent(u),stride=Math.sin(t*(phase>.70?10:6.5));
  let rampLift=slipHeight(point.x)-Y+.034;
  cat.position.set(point.x,Y+rampLift+.016*activity*Math.abs(stride),point.z);
  cat.rotation.set(0,mix(.82,Math.atan2(dir.x,dir.z),activity),0);cat.scale.set(1,.76+activity*.24,1);
  let look=exporting?Math.exp(-Math.pow((t-23.2)/1.3,2)):Math.exp(-Math.max(0,t-attention.cat)*.38);
  catHead.rotation.set(.16*(1-activity)-look*.32,look*clamp(Math.atan2(camera.position.x-point.x,camera.position.z-point.z)-cat.rotation.y,-.70,.70),.028*Math.sin(t*.7));catPaws.forEach((o,i)=>{let step=stride*(i%2?1:-1);o.rotation.x=.4*activity*step;if(o.userData.restZ===undefined)o.userData.restZ=o.position.z;o.position.z=o.userData.restZ+step*.038*activity});
  fish.forEach(({g,x,y,z},i)=>{
    const shoal=Math.floor(i/6),a=t*.35+shoal*.9;
    const spread=exporting?Math.exp(-Math.pow((t-46.4)/1.2,2)):Math.exp(-Math.max(0,t-attention.fish)*.43);
    let fx=(shoal===0?1.3:shoal===1?4.03:6.51)+.45*Math.sin(a)+(i%3-.9)*(.29+.54*spread);
    let fz=6.85+.30*Math.cos(a)+(Math.floor(i%6/3)-.5)*(.32+.52*spread)+.10*Math.sin(t+i);
    g.position.set(fx,y+.06*Math.sin(a+i),fz);g.rotation.y=Math.atan2(.3*Math.sin(a),.45*Math.cos(a))+.10*Math.sin(t*3.5+i);g.scale.setScalar(1.18+.16*(i%3))
  });
}

const dropTracks=[];
const attention={cat:-100,gull:-100,fish:-100};
function approachScene(e){
  if(span>=12)return;
  const pointer=new T.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);
  for(const [kind,obj] of [['cat',cat],['gull',birds[2].g],['fish',fish[8].g]]){
    const q=obj.getWorldPosition(new T.Vector3()).project(camera);
    const dx=(q.x-pointer.x)*camera.right/camera.top,dy=q.y-pointer.y;
    if(q.z>=-1&&q.z<=1&&Math.hypot(dx,dy)<1.35&&simT-attention[kind]>7.5)attention[kind]=simT;
  }
}
function prepareDrops(){
  const sites=[
    {p:world,o:V(-2.69,Y+2.83,3.30),floor:Y+.023,span:3.9},
    {p:world,o:V(4.30,Y+2.72,-5.09),floor:Y+.023,span:4.6},
    {p:umb,o:V(.57,0,0),floor:W+.028,span:3.02},
    {p:boats[0].g,o:V(.698,.46,-.63),floor:W+.026,span:4.16},
    {p:boats[2].g,o:V(.66,.48,.43),floor:W+.026,span:3.62}
  ];
  for(let i=0;i<sites.length;i++){
    const def=sites[i],g=group(world);
    for(let k=0;k<2;k++){const o=tor(g,0,.003,0,.18+k*.075,.005,'#d7e9dc',true);o.castShadow=false;o.renderOrder=5}
    let droplet=oval(world,0,0,0,.013,.023,.013,'#e6e7c9');dropTracks.push({...def,g,droplet});
  }
}
function fallingDrops(t){
  dropTracks.forEach(({p,o,floor,span,g,droplet},i)=>{
    const from=p.localToWorld(o.clone());
    let landing=floor;
    if(p===umb){landing=from.x<-2.72?Y+.016:from.z>=1.23&&from.z<=2.86?.99-.64*clamp((from.x+2.62)/1.07):W+.028}
    const height=Math.max(.065,from.y-landing),duration=Math.sqrt(2*height/8.8),u=(t+i*.73)%span;
    const grow=.43,elapsed=u-grow,after=elapsed-duration;
    droplet.visible=u<grow+duration;droplet.position.copy(from);droplet.position.y-=Math.min(height,4.4*Math.max(elapsed,0)**2);
    const size=.24+.76*smooth(u/grow);droplet.scale.set(.015*size,.025*size*(elapsed>0?1.45:1),.015*size);
    g.visible=after>=0&&after<.77;g.position.set(from.x,landing+.006,from.z);g.scale.setScalar(.18+clamp(after/.77)*.86);
  });
}
function texturedRopes(){
  const braid=tex(256,96,(c,w,h)=>{c.fillStyle='#a48962';c.fillRect(0,0,w,h);for(let k=-16;k<40;k++){c.strokeStyle='#776747';c.lineWidth=8;c.beginPath();c.moveTo(k*14,0);c.lineTo(k*14+39,h);c.stroke();c.strokeStyle='#c9ad80';c.lineWidth=3;c.beginPath();c.moveTo(k*14+5,0);c.lineTo(k*14+44,h);c.stroke()}});
  braid.wrapS=braid.wrapT=T.RepeatWrapping;braid.repeat.set(3,1);
  const material=new T.MeshStandardMaterial({map:braid,roughness:.86,side:T.DoubleSide});
  for(let line of lines){line.l.material=material;line.l.frustumCulled=false}
}
function deformRope(mesh,curve){
  const segments=18,sides=6;
  if(mesh.geometry.attributes.position.count!==(segments+1)*(sides+1)){
    mesh.geometry.dispose();mesh.geometry=new T.TubeGeometry(curve,segments,.024,sides,false);
  }
  const pos=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal;
  const reference=V(0,0,1),across=new T.Vector3(),up=new T.Vector3(),point=new T.Vector3(),tangent=new T.Vector3();
  for(let i=0;i<=segments;i++){
    const t=i/segments;curve.getPoint(t,point);curve.getTangent(t,tangent);
    across.crossVectors(tangent,reference);if(across.lengthSq()<.0001)across.crossVectors(tangent,V(1,0,0));across.normalize();up.crossVectors(tangent,across).normalize();
    for(let j=0;j<=sides;j++){const angle=j*TAU/sides,c=Math.cos(angle),s=Math.sin(angle),n=i*(sides+1)+j;const dx=across.x*c+up.x*s,dy=across.y*c+up.y*s,dz=across.z*c+up.z*s;pos.setXYZ(n,point.x+.024*dx,point.y+.024*dy,point.z+.024*dz);normal.setXYZ(n,dx,dy,dz)}
  }
  pos.needsUpdate=normal.needsUpdate=true;
}
