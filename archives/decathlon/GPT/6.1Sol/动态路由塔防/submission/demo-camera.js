'use strict';

// Demo-only shots: time, world focus X/Z, distance, local battle-follow strength.
// The first second retains the normal overview before moving into the action.
const DemoCamera={
 tracks:[
  [[0,0,.7,27.2,0],[1,0,.7,27.2,0],[2.9,-5.9,-1.3,16.8,.15],
   [5.7,-5.9,-1.3,16.8,.15],[9.5,-3.9,-1.5,16.2,.5],
   [10.8,-4.4,.2,16.2,.3],[13,-4.7,.4,16.2,.3],
   [16,-6.1,-.5,16,.55],[18,-6.1,-.5,16,.55]],
  [[0,0,.7,27.2,0],[.9,0,.7,27.2,0],[2.8,4.7,-1,15.8,.25],
   [4.9,4.7,-.6,15.8,.25],[7.1,-6.9,.1,17,.15],
   [10,-6.9,.6,17,.25],[12.6,4.8,.5,18,.3],
   [14.6,5.4,1.5,16.6,.5],[17,-3.8,3,19,.45],[19,0,2.5,22,.35],[20,0,2.5,22,.35]],
  [[0,0,.7,27.2,0],[.9,0,.7,27.2,0],[2.8,5,-1.8,16,.5],
   [5.2,5,-.7,15.8,.25],[7,5.2,.1,16.5,.1],
   [9.5,5.7,.7,16.5,.1],[12.6,6,-.5,16.5,.65],
   [17,6.6,1,17.5,.65],[19.5,5.8,.5,17.5,.55],[21,5.8,.5,17.5,.55]]
 ],
 begin(id){
  this.normal={target:View.target.clone(),yaw:View.yaw,pitch:View.pitch,distance:View.distance};
  this.track=this.tracks[id];this.offset={x:0,z:0};this.update(0);
 },
 update(dt){
  if(!Demo.active||!this.track)return;
  const t=Demo.time,track=this.track;
  let i=0;while(i<track.length-2&&t>track[i+1][0])i++;
  const a=track[i],b=track[i+1],p=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  const ease=p*p*p*(p*(p*6-15)+10),mix=n=>a[n]+(b[n]-a[n])*ease;
  const x=mix(1),z=mix(2),follow=mix(4);

  // Follow nearby combatants without letting remote waves pull a shot away
  // from its node, skill or terrain event. Smooth on simulation time only.
  let sx=0,sz=0,weight=0;
  for(const e of Game.state.enemies){
   if(e.hp<=0)continue;
   const r=Math.hypot(e.x-x,e.z-z);if(r>5)continue;
   const w=(1-r/5)*(e.type.startsWith('boss')?5:e.blocked?3:1);
   sx+=(e.x-x)*w;sz+=(e.z-z)*w;weight+=w;
  }
  const dx=weight?sx/weight*follow:0,dz=weight?sz/weight*follow:0;
  const length=Math.hypot(dx,dz),limit=length>1.5?1.5/length:1;
  const blend=1-Math.exp(-Math.max(0,dt)*2.8);
  this.offset.x+=(dx*limit-this.offset.x)*blend;
  this.offset.z+=(dz*limit-this.offset.z)*blend;
  const close=Math.max(0,Math.min(1,(27.2-mix(3))/10));
  View.target.set(x+this.offset.x,-.2+close*.5,z+this.offset.z);
  View.distance=mix(3);View.yaw=.45-close*.09;View.pitch=.96-close*.09;
  View.updateCamera();
 },
 end(){
  if(this.normal){View.target.copy(this.normal.target);View.yaw=this.normal.yaw;View.pitch=this.normal.pitch;View.distance=this.normal.distance;View.updateCamera();}
  this.track=null;this.normal=null;
 }
};
