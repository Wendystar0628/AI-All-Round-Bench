'use strict';
// Headings are keyed separately from position so that the skipper can back out
// of the narrow outer channel without spinning the hull through the breakwater.
const passageKeys=[
  [45,3.34,1.24,-.46],[47.5,2.79,2.61,-.21],[50,3.03,4.34,.49],
  [52,4.26,5.01,1.53],[54.2,5.84,4.22,2.49],[56.3,6.66,2.23,2.91],
  [58.5,7.06,-.04,3.10],[61,7.10,-2.62,Math.PI],[64,7.10,-5.30,Math.PI],
  [65.4,7.10,-5.30,Math.PI],[67.8,7.13,-2.40,Math.PI],[70.2,7.07,.53,3.22],
  [72,6.65,2.12,3.64],[74,5.59,2.75,4.48],[76,4.27,2.18,5.29],[78.6,3.34,1.24,2*Math.PI-.46]
];
function passagePose(t) {
  if(t<=45||t>=78.6)return {x:3.34,z:1.24,angle:-.46};
  let k=0;while(k<passageKeys.length-2&&passageKeys[k+1][0]<t)k++;
  const a=passageKeys[k],b=passageKeys[k+1],prev=passageKeys[Math.max(0,k-1)],next=passageKeys[Math.min(passageKeys.length-1,k+2)],dt=b[0]-a[0],u=(t-a[0])/dt;
  function interpolate(j){
    let m0=(b[j]-prev[j])/(b[0]-prev[0])*dt,m1=(next[j]-a[j])/(next[0]-a[0])*dt;
    if(k===0||a[j]===prev[j]||a[j]===b[j])m0=0;
    if(k===passageKeys.length-2||b[j]===next[j]||a[j]===b[j])m1=0;
    return (2*u*u*u-3*u*u+1)*a[j]+(u*u*u-2*u*u+u)*m0+(-2*u*u*u+3*u*u)*b[j]+(u*u*u-u*u)*m1;
  }
  return {x:interpolate(1),z:interpolate(2),angle:interpolate(3)};
}
function vesselMotion(t){
  const cyc=t%90,active=cyc>45&&cyc<78.6,pose=passagePose(cyc);
  boats.forEach((b,i)=>{
    const g=b.g;g.position.set(i===2?pose.x:b.x+(i===0?.021*Math.sin(t*.96):0),W+.023*Math.sin(t*1.44+i*1.8),i===2?pose.z:b.z);
    g.rotation.set(.012*Math.sin(t*1.42+i),i===2?pose.angle:b.angle,.016*Math.sin(t*1.12+i*.9));g.scale.setScalar(b.scale);
  });
  wakes.forEach((o,i)=>{
    const side=i<19?-1:1,lag=(i%19)/18*2.45,birth=cyc-lag,p=passagePose(birth),q=passagePose(birth-.07);
    const speed=Math.hypot(p.x-q.x,p.z-q.z)/.07;
    o.visible=birth>45&&birth<78.6&&speed>.085;
    if(!o.visible)return;
    const dx=(p.x-q.x)/(.07*speed),dz=(p.z-q.z)/(.07*speed),backing=dx*Math.sin(p.angle)+dz*Math.cos(p.angle)<0;
    const offset=backing?1.77:1.84,spread=(.15+lag*.24)*side;
    o.position.set(p.x-dx*offset+dz*spread,W+.030+.009*Math.sin(i*3+t*2),p.z-dz*offset-dx*spread);
    o.rotation.y=Math.atan2(dx,dz)-side*.26;
    o.scale.set(.047+lag*.015,.013,.13*Math.min(1,speed)+.034);
  });
  for(let i=0;i<lines.length;i++){
    const {l,x,z,id}=lines[i],b=boats[id].g;
    l.visible=!(id===2&&active);
    if(!l.visible)continue;
    const v=b.localToWorld(V(-.45,.50,i===0?1.50:-1.56)),sag=.58+.038*Math.sin(t*1.42+i);
    const curve=new T.CatmullRomCurve3([V(x,1.33,z),V(mix(x,v.x,.5),sag,mix(z,v.z,.5)),v]);
    deformRope(l,curve);
  }
}

