/* ============ 锻火 FORGE · demo.js : 15 秒示例工程「锻字」 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const G=APP.geom;
const P=APP.project;
const D=APP.demo={};

/* 关键帧助手 */
function K(prop,t,v,li,lo){
  const k=P.newKey(t,v,li,lo);
  if(li==='hold'){k.lo='hold';}
  prop.keys.push(k);
  prop.keys.sort((a,b)=>a.t-b.t);
  prop.anim=true;
  return k;
}
function V(prop,t,v,li,lo){K(prop,t,v,li,lo);}
function linear(prop,t,v){K(prop,t,v,'linear','linear');}
function hold(prop,t,v){K(prop,t,v,'hold','hold');}

D.build=function(){
  const FONT=APP.font;
  const comp=P.newComp('锻字 · 主合成',1280,720,30,15);
  comp.bg='#07070a';
  comp.mb={on:true,shutter:180,phase:0,samples:8};
  comp.workStart=0;comp.workEnd=15;
  comp.fields=[];

  /* ---------- 1. 背景: 炉心辉光 ---------- */
  const bg=P.newLayer('shape','背景 · 炉心');
  bg.blend='add';
  bg.t.pos.v=[0,40,0];
  {
    const g=bg.shape.groups[0];
    g.items.length=0;
    g.items.push({id:C.uid('L'),type:'path',name:'大椭圆',path:CT_path(520,420),anim:false,keys:[]});
    g.items.push({id:C.uid('L'),type:'fill',name:'填充',color:'#ff7a22',opacity:P.newProp(16),rule:'nonzero'});
    // 缓慢呼吸
    K(g.transform.opacity,0.0,0);K(g.transform.opacity,1.2,10);K(g.transform.opacity,15,10);
  }
  // 高斯模糊营造柔光
  bg.effects.push({id:C.uid('L'),type:'gaussian',name:'高斯模糊',enabled:true,props:{radius:P.newProp(70)}});
  comp.layers.push(bg);

  /* ---------- 2. 铁砧 ---------- */
  const anvil=P.newLayer('shape','铁砧');
  anvil.t.pos.v=[0,290,0];
  anvil.t.scale.v=[100,100,100];
  {
    const g=anvil.shape.groups[0];
    g.items.length=0;
    const path={contours:[{closed:true,pts:[
      {x:-300,y:-40},{x:300,y:-40},{x:250,y:20},{x:120,y:20},{x:100,y:110},
      {x:-100,y:110},{x:-120,y:20},{x:-250,y:20}]}]};
    g.items.push({id:C.uid('L'),type:'path',name:'砧体',path,anim:false,keys:[]});
    g.items.push({id:C.uid('L'),type:'fill',name:'填充',color:'#1b1d22',opacity:P.newProp(100),rule:'nonzero'});
    g.items.push({id:C.uid('L'),type:'stroke',name:'描边',color:'#3a3f49',width:P.newProp(3),opacity:P.newProp(70),cap:'round',join:'round',dash:[]});
  }
  anvil.effects.push({id:C.uid('L'),type:'shadow',name:'投影',enabled:true,
    props:{distance:P.newProp(30),angle:P.newProp(90),softness:P.newProp(40),color:P.newProp([0,0,0]),opacity:P.newProp(0.8)}});
  comp.layers.push(anvil);

  /* ---------- 3. 火星环境粒子 ---------- */
  const embers=P.newLayer('particle','环境火星');
  embers.t.pos.v=[0,320,0];
  embers.is3D=true;
  {
    const p=embers.particle;
    p.emitter.type='point';p.emitter.source='layer';p.emitter.radius=520;
    p.emitter.direction=[0,-1,0];p.emitter.arc=140;p.emitter.spread=40;
    p.birth.v=26;p.life.v=3.2;p.lifeVar.v=1.2;p.vel.v=70;p.velVar.v=40;
    p.size.v=3.2;p.sizeVar.v=1.6;p.drag.v=0.25;p.grav.v=-14;
    p.colorA.v=[1,0.75,0.35];p.colorB.v=[0.9,0.25,0.1];
    p.seed.v=21;p.inherit.v=0;p.collide.v=0;
    p.trail.len.v=0;
    p.onHit='none';
  }
  comp.layers.push(embers);

  /* ---------- 4. 主字块「金」 ---------- */
  const hero=P.newLayer('geo3d','金 · 字块');
  hero.t.pos.v=[0,0,0];
  hero.geo3d.source='text';
  hero.text.src='金';
  hero.text.size=280;
  hero.text.align='center';
  hero.geo3d.depth.v=0;
  hero.geo3d.bevel.v=10;
  // 材质: 炽热金属
  hero.geo3d.material.base.v=[0.92,0.68,0.36];
  hero.geo3d.material.metal.v=0.95;
  hero.geo3d.material.rough.v=0.32;
  hero.geo3d.material.emissive.v=[1,0.42,0.1];
  hero.geo3d.material.emissiveI.v=0;
  // 关键帧: 深度
  linear(hero.geo3d.depth,0,0);
  linear(hero.geo3d.depth,3.0,0);
  K(hero.geo3d.depth,3.4,96,'bezier','bezel');
  K(hero.geo3d.depth,5.6,104);
  K(hero.geo3d.depth,10.8,88);
  K(hero.geo3d.depth,13.6,96);
  K(hero.geo3d.depth,15,96);
  // 自发光: 起燃 -> 炽白 -> 冷却
  linear(hero.geo3d.material.emissiveI,0,0);
  linear(hero.geo3d.material.emissiveI,2.6,0.5);
  linear(hero.geo3d.material.emissiveI,3.4,1.5);
  linear(hero.geo3d.material.emissiveI,5.6,2.1);
  K(hero.geo3d.material.emissiveI,6.1,3.4);
  K(hero.geo3d.material.emissiveI,6.5,2.2);
  K(hero.geo3d.material.emissiveI,7.5,3.2);
  K(hero.geo3d.material.emissiveI,7.9,2.2);
  K(hero.geo3d.material.emissiveI,8.9,3.0);
  K(hero.geo3d.material.emissiveI,9.4,2.1);
  linear(hero.geo3d.material.emissiveI,10.8,1.2);
  linear(hero.geo3d.material.emissiveI,13.0,0.18);
  linear(hero.geo3d.material.emissiveI,15,0.12);
  // 自发光色: 橙 -> 冷灰
  K(hero.geo3d.material.emissive,0,[1,0.42,0.1]);
  K(hero.geo3d.material.emissive,10.8,[1,0.35,0.08]);
  K(hero.geo3d.material.emissive,14.5,[0.25,0.26,0.3]);
  K(hero.geo3d.material.emissive,15,[0.22,0.23,0.27]);
  // 尺寸: 写入 -> 成块 -> 锻打回落
  K(hero.t.scale,0,[0,0,100]);
  K(hero.t.scale,0.5,[0,0,100]);
  K(hero.t.scale,1.1,[104,104,100]);
  K(hero.t.scale,3.4,[100,100,100]);
  K(hero.t.scale,5.9,[101,101,100]);
  K(hero.t.scale,6.1,[95,95,100]);
  K(hero.t.scale,6.6,[101,101,100]);
  K(hero.t.scale,7.5,[95,95,100]);
  K(hero.t.scale,8.0,[101,101,100]);
  K(hero.t.scale,8.9,[95,95,100]);
  K(hero.t.scale,9.5,[101,101,100]);
  K(hero.t.scale,11.5,[100,100,100]);
  K(hero.t.scale,15,[100,100,100]);
  // 微旋转(活感)
  K(hero.t.rot,0,[0,0,0]);
  K(hero.t.rot,3.4,[0,0,0]);
  K(hero.t.rot,6.1,[1.5,0,-1.2]);
  K(hero.t.rot,7.5,[-1.2,0,1.5]);
  K(hero.t.rot,8.9,[1.8,0,-1.0]);
  K(hero.t.rot,10.5,[0,0,0]);
  K(hero.t.rot,15,[0,0,0]);
  // 图钉: 三处受击点
  const pins=hero.geo3d.deform.pins;
  const pinDefs=[
    {rest:[0,-70],hit:[0,-18]},     // 顶部
    {rest:[-72,40],hit:[-30,52]},   // 左下
    {rest:[72,40],hit:[30,52]}      // 右下
  ];
  for(const pd of pinDefs){
    pins.push({rest:pd.rest.slice(),pos:P.newProp(pd.rest.slice()),rot:P.newProp(0),
      scale:P.newProp([100,100]),radius:300});
  }
  // 锤击时序
  const strikes=[[6.1,0],[7.5,1],[8.9,2]];
  for(const [st,pi] of strikes){
    const pd=pinDefs[pi];
    const pin=pins[pi];
    // 蓄势 -> 内凹 -> 回弹
    K(pin.pos,st-0.28,pd.rest.slice());
    K(pin.pos,st,pd.hit.slice());
    K(pin.pos,st+0.35,[(pd.rest[0]+pd.hit[0])/2,(pd.rest[1]+pd.hit[1])/2]);
    K(pin.pos,st+0.9,pd.rest.slice());
    K(pin.pos,15,pd.rest.slice());
  }
  comp.layers.push(hero);

  /* ---------- 5. 火花(从字块表面发射) ---------- */
  const sparks=P.newLayer('particle','锻打火星');
  sparks.t.pos.v=[0,0,0];
  sparks.is3D=true;
  {
    const p=sparks.particle;
    p.emitter.type='surface';p.emitter.source='layer';p.emitter.layerId=hero.id;
    p.emitter.fromNormal=true;
    p.birth.v=0;p.life.v=0.85;p.lifeVar.v=0.5;
    p.vel.v=520;p.velVar.v=320;
    p.size.v=5;p.sizeVar.v=3;
    p.drag.v=0.9;p.grav.v=520;p.gravDir.v=[0,1,0];
    p.colorA.v=[1,0.95,0.7];p.colorB.v=[1,0.35,0.08];
    p.seed.v=97;p.inherit.v=0.1;
    p.collide.v=1;p.bounce.v=0.35;p.friction.v=0.3;
    p.trail.len.v=7;p.trail.width.v=1.1;p.trail.fade.v=1;
    p.onHit='spark';
    // 三次爆发
    for(const [st] of strikes){
      K(p.birth,st-0.02,0);
      K(p.birth,st,900);
      K(p.birth,st+0.06,120);
      K(p.birth,st+0.5,0);
    }
    K(p.birth,9.6,0);
  }
  comp.layers.push(sparks);

  /* ---------- 6. 锤子 ---------- */
  const hammer=P.newLayer('shape','锻锤');
  hammer.is3D=true;
  hammer.t.pos.v=[0,0,120];
  {
    const g=hammer.shape.groups[0];
    g.items.length=0;
    // 锤头
    g.items.push({id:C.uid('L'),type:'path',name:'锤头',path:CT_path2(150,110),anim:false,keys:[]});
    g.items.push({id:C.uid('L'),type:'fill',name:'填充',color:'#4a505c',opacity:P.newProp(100),rule:'nonzero'});
    g.items.push({id:C.uid('L'),type:'stroke',name:'描边',color:'#6d7686',width:P.newProp(3),opacity:P.newProp(80),cap:'round',join:'round',dash:[]});
    // 手柄(独立组)
    const g2={id:C.uid('L'),name:'手柄',enabled:true,items:[],
      transform:{anchor:P.newProp([0,0]),pos:P.newProp([0,-260]),scale:P.newProp([100,100]),rot:P.newProp(0),opacity:P.newProp(100)}};
    hammer.shape.groups.push(g2);
    g2.items.push({id:C.uid('L'),type:'path',name:'手柄',path:{contours:[{closed:true,pts:[
      {x:-16,y:0},{x:16,y:0},{x:16,y:300},{x:-16,y:300}]}]},anim:false,keys:[]});
    g2.items.push({id:C.uid('L'),type:'fill',name:'填充',color:'#6b4a2c',opacity:P.newProp(100),rule:'nonzero'});
  }
  hammer.effects.push({id:C.uid('L'),type:'shadow',name:'投影',enabled:true,
    props:{distance:P.newProp(20),angle:P.newProp(120),softness:P.newProp(26),color:P.newProp([0,0,0]),opacity:P.newProp(0.7)}});
  // 锤击动画: 预备 -> 加速 -> 收势
  const hammerK=(t,x,y,rot)=>{
    K(hammer.t.pos,t,[x,y,120]);
    K(hammer.t.rot,t,[0,0,rot]);
  };
  hammerK(0,-260,-520,14);
  hammerK(5.2,-240,-500,12);
  hammerK(5.8,-120,-420,8);
  hammerK(6.0,0,-300,3);
  hammerK(6.12,10,10,0);
  hammerK(6.45,0,-330,2);
  hammerK(7.1,-40,-430,6);
  hammerK(7.4,0,-300,3);
  hammerK(7.52,-8,10,0);
  hammerK(7.85,0,-330,2);
  hammerK(8.5,-40,-430,6);
  hammerK(8.8,0,-300,3);
  hammerK(8.92,12,10,0);
  hammerK(9.25,0,-330,2);
  hammerK(10.4,-300,-560,16);
  hammerK(15,-300,-560,16);
  comp.layers.push(hammer);

  /* ---------- 7. 冲击闪光 ---------- */
  const flash=P.newLayer('shape','冲击闪光');
  flash.blend='add';
  flash.is3D=true;
  flash.t.pos.v=[0,0,150];
  {
    const g=flash.shape.groups[0];
    g.items.length=0;
    g.items.push({id:C.uid('L'),type:'path',name:'闪光',path:CT_path(300,300),anim:false,keys:[]});
    g.items.push({id:C.uid('L'),type:'fill',name:'填充',color:'#ffd9a0',opacity:P.newProp(0),rule:'nonzero'});
    g.transform.opacity.v=0;
    for(const [st] of strikes){
      K(g.transform.opacity,st-0.01,0);
      K(g.transform.opacity,st,90);
      K(g.transform.opacity,st+0.08,20);
      K(g.transform.opacity,st+0.3,0);
    }
    // 位置跟随受击点
    for(const [st,pi] of strikes){
      K(flash.t.pos,st,[pinDefs[pi].hit[0],pinDefs[pi].hit[1]+40,150]);
    }
    K(flash.t.pos,0,[0,0,150]);
  }
  flash.effects.push({id:C.uid('L'),type:'gaussian',name:'高斯模糊',enabled:true,props:{radius:P.newProp(50)}});
  comp.layers.push(flash);

  /* ---------- 8. 灯光 ---------- */
  const keyLight=P.newLayer('light','主光 · 平行光');
  keyLight.t.pos.v=[420,-520,-900];
  keyLight.t.rot.v=[28,-38,0];
  keyLight.props.kind.v=1;
  keyLight.props.intensity.v=1.35;
  keyLight.props.color.v=[1,0.86,0.68];
  keyLight.props.shadow.v=1;
  K(keyLight.props.intensity,0,0.6);
  K(keyLight.props.intensity,3.4,1.3);
  K(keyLight.props.intensity,5.6,1.55);
  K(keyLight.props.intensity,10.8,1.35);
  K(keyLight.props.intensity,15,1.2);
  comp.layers.push(keyLight);

  const forge=P.newLayer('light','炉光 · 点光源');
  forge.t.pos.v=[0,40,240];
  forge.props.kind.v=0;
  forge.props.intensity.v=1.6;
  forge.props.color.v=[1,0.5,0.18];
  K(forge.props.intensity,0,0.2);
  K(forge.props.intensity,2.6,0.9);
  K(forge.props.intensity,3.4,2.0);
  K(forge.props.intensity,5.6,2.8);
  K(forge.props.intensity,6.1,4.2);
  K(forge.props.intensity,6.5,2.8);
  K(forge.props.intensity,7.5,4.0);
  K(forge.props.intensity,7.9,2.8);
  K(forge.props.intensity,8.9,3.8);
  K(forge.props.intensity,9.4,2.6);
  K(forge.props.intensity,10.8,1.4);
  K(forge.props.intensity,13.0,0.5);
  K(forge.props.intensity,15,0.35);
  comp.layers.push(forge);

  /* ---------- 9. 摄像机 ---------- */
  const cam=P.newLayer('camera','摄像机 · 锻打');
  cam.t.pos.v=[0,0,-1180];
  cam.props.fov.v=42;
  cam.props.focus.v=1180;
  cam.props.aperture.v=0;
  // 景别变化: 远 -> 推近 -> 锻打特写 -> 冷却拉远
  K(cam.t.pos,0,[0,30,-1000]);
  K(cam.t.pos,1.2,[0,10,-1120]);
  K(cam.t.pos,3.2,[0,0,-1180]);
  K(cam.t.pos,5.6,[0,-10,-1240]);
  K(cam.t.pos,6.1,[46,26,-1120]);
  K(cam.t.pos,6.5,[20,4,-1220]);
  K(cam.t.pos,7.5,[-42,22,-1120]);
  K(cam.t.pos,7.9,[10,0,-1230]);
  K(cam.t.pos,8.9,[40,20,-1120]);
  K(cam.t.pos,9.4,[0,0,-1240]);
  K(cam.t.pos,11.0,[0,-6,-1280]);
  K(cam.t.pos,13.6,[0,0,-1360]);
  K(cam.t.pos,15,[0,0,-1380]);
  K(cam.t.rot,0,[0,0,0]);
  K(cam.t.rot,3.2,[0,0,0]);
  K(cam.t.rot,6.1,[-2.5,4.5,0]);
  K(cam.t.rot,7.5,[2.5,-4.0,0]);
  K(cam.t.rot,8.9,[-2.0,3.5,0]);
  K(cam.t.rot,10.5,[0,0,0]);
  K(cam.t.rot,15,[0,0,0]);
  K(cam.props.aperture,0,0);
  K(cam.props.aperture,11.0,0.012);
  K(cam.props.aperture,15,0.05);
  comp.layers.push(cam);

  /* ---------- 10. 音色 ---------- */
  const music=P.newLayer('audio','配乐与音效');
  music.audio.inst='metal';
  music.audio.gain.v=0.5;
  music.audio.lpf.v=7000;
  const notes=[];
  // 炉膛低鸣
  notes.push({t:0.0,f:55,dur:6.0,vel:0.5});
  notes.push({t:5.6,f:49,dur:5.6,vel:0.5});
  // 点火气流
  notes.push({t:3.0,f:900,dur:1.4,vel:0.35});
  // 锤击重音(主要动作)
  notes.push({t:6.10,f:196,dur:1.5,vel:1.0});
  notes.push({t:6.16,f:294,dur:0.9,vel:0.5});
  notes.push({t:7.50,f:165,dur:1.7,vel:1.0});
  notes.push({t:7.56,f:247,dur:1.0,vel:0.5});
  notes.push({t:8.90,f:139,dur:2.0,vel:1.0});
  notes.push({t:8.96,f:208,dur:1.2,vel:0.5});
  // 落定
  notes.push({t:10.30,f:117,dur:2.4,vel:0.7});
  // 冷却气流
  notes.push({t:10.8,f:1400,dur:1.8,vel:0.3});
  // 冷却余音
  notes.push({t:11.6,f:392,dur:2.2,vel:0.3});
  notes.push({t:12.8,f:330,dur:2.6,vel:0.25});
  music.audio.pattern=notes;
  comp.layers.push(music);

  return comp;
};
function CT_path(rx,ry){
  const pts=[];
  for(let i=0;i<40;i++){const a=i/40*Math.PI*2;pts.push({x:Math.cos(a)*rx,y:Math.sin(a)*ry});}
  return {contours:[{closed:true,pts}]};
}
function CT_path2(w,h){
  const hw=w/2,hh=h/2;
  return {contours:[{closed:true,pts:[
    {x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}]}]};
}

/* 载入示例 */
D.load=function(){
  const comp=D.build();
  const pr={version:1,name:'锻字 · 示例工程',comps:[comp],activeComp:comp.id,font:'锻火体'};
  if(APP.app){
    APP.app.project=pr;
    APP.app.sel=[comp.layers.find(l=>l.geo3d&&l.geo3d.source==='text').id];
    APP.app.time=0;
    APP.app.renderCache.clear();
    APP.app.particleCache.clear();
  }
  return pr;
};
APP.demo=D;
})();
