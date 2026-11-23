import * as acorn from 'acorn';
import {programs} from './fixtures.js';
import {compile,invoke} from './vm.js';
import {contact,clamp,takeFlight,flightRow} from './flight.js';

globalThis.acorn=acorn;
const step=1/60;
const smooth=x=>{const k=clamp(x,0,1);return k*k*(3-2*k);};
const rounded=n=>Number(n.toFixed(5));

function scriptedControl(f,t){
  const altitude=1.02+smooth((t-1.1)/4.7)*9.8;
  const lateral=smooth((t-4)/7)*5.8;
  const forward=4.4*smooth((t-2)/2.3);
  const rollTarget=clamp((lateral-f.x)*.05-f.vx*.12,-.24,.24);
  const pitchTarget=clamp((f.vz-forward)*.19,-.31,.3);
  const yaw=.26+smooth((t-4)/6.4)*.85;
  const trim=1+(altitude-f.y)*.4-f.vy*.53;
  const failed=smooth((t-9.65)/1.8),weaken=smooth((t-9.8)/1.05);
  if(t<.95)return {lift:.81,roll:0,pitch:0,yaw};
  const power=f.fault==null?1:.45;
  return {
    lift:clamp(trim/power*(1-.84*weaken),0,2.48),
    roll:(rollTarget-f.roll)*5.3-f.vroll*2.25+failed*5.5,
    pitch:(pitchTarget-f.pitch)*5.3-f.vpitch*2.25+failed*2,
    yaw:yaw-failed*.2
  };
}

export function bakeFlight(scene){
  const model=compile(programs['/System/airframe.str']);
  const f=takeFlight({x:0,y:1.02,z:0,yaw:.26,pitch:0,roll:0,spin:0},0);
  const fault=9.15;
  const record={initial:structuredClone(f),frames:[flightRow(f)],inputs:[],controls:[],fault,impact:null};
  for(let i=1;i<=Math.round(scene.duration/step);i++){
    const t=i*step;
    f.t=t;
    if(f.impact==null){
      if(f.fault==null&&t>=fault){
        f.fault=fault;record.inputs.push({t:fault,name:'fault',value:true});
      }
      if(i%2===1||!f.control||t===fault){
        f.wind=.35*Math.sin(t*.83);
        f.control=scriptedControl(f,t);
        record.inputs.push({t:rounded(t),name:'wind',value:rounded(f.wind)});
        record.controls.push({t:rounded(t),...Object.fromEntries(Object.entries(f.control).map(([key,value])=>[key,rounded(value)]))});
      }
      const previous=f.spin;
      invoke(model,'integrate',[f,step],()=>null);
      if(t<1.8)f.spin=previous+(f.spin-previous)*smooth(t/1.8);
      invoke(model,'settle',[f,contact(scene,f.x,f.z)+1.02],()=>null);
    }else{
      f.spin+=Math.max(0,1-(t-f.impact)*2)*step*16;
    }
    if(i%2===0||t===f.impact||t===scene.duration)record.frames.push(flightRow(f).map(rounded));
  }
  if(f.impact==null||f.impact<11||f.impact>13.25)throw Error('演出撞击时刻超出编排范围');
  record.impact=rounded(f.impact);
  return record;
}