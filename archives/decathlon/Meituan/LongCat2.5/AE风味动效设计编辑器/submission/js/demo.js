/* demo.js — 15 秒「锻字」示例工程 */
(function(){
'use strict';
const D = {};
window.Demo = D;

/* 笔画定义：在 1280×720 合成坐标中（y 向下），字高 600，中心 (640,360) */
const STROKES=[
  // 钅
  {p:[[520,102],[430,240]], w:34.8, name:'撇'},
  {p:[[412,258],[538,258]], w:31.2, name:'横'},
  {p:[[472,258],[472,432]], w:31.2, name:'竖'},
  {p:[[406,342],[538,342]], w:31.2, name:'横'},
  {p:[[406,450],[538,414]], w:31.2, name:'提'},
  // 垂
  {p:[[760,96],[667,195]], w:33.6, name:'撇'},
  {p:[[504,219],[804,219]], w:31.2, name:'横'},
  {p:[[754,144],[754,480]], w:31.2, name:'竖'},
  {p:[[504,300],[804,300]], w:31.2, name:'横'},
  {p:[[579,300],[579,480]], w:31.2, name:'竖'},
  {p:[[829,300],[829,480]], w:31.2, name:'竖'},
  {p:[[504,384],[804,384]], w:31.2, name:'横'},
  {p:[[504,480],[804,480]], w:31.2, name:'横'},
];
const HITS=[ {t:6.4,x:560,y:230}, {t:7.6,x:760,y:300}, {t:8.9,x:640,y:430}, {t:10.1,x:820,y:210} ];

function K(t,v,ease){ return {t, v, interp:ease===false?'linear':'bezier', easeIn:ease===false?undefined:[0.42,0], easeOut:ease===false?undefined:[0.58,1]}; }
function capsule(p0,p1,w){
  const out=U.strokeOutline([p0,p1],w,{cap:'round',join:'round',closed:false});
  return U.pathDataFromPoly(out[0].pts,true);
}
function openStroke(p0,p1){
  return {closed:false, pts:[{p:p0.slice(),i:null,o:null},{p:p1.slice(),i:null,o:null}]};
}
function pathOp(pd,op){ pd.op=op||'add'; return pd; }

D.load=function(){
  const P=Model.createProject('锻字 · 动效示例');
  const comp=Model.createComp({name:'锻字',width:1280,height:720,fps:30,duration:15,workStart:0,workEnd:15,bgColor:[0.035,0.04,0.055]});
  comp.motionBlur={enabled:true,shutterAngle:220,phase:0,samples:5};
  if(!comp.fields) comp.fields=[];
  Model.select(comp.id,[]);

  /* ---------- 背景 ---------- */
  const bg=Model.createLayer(comp,'shape',{name:'背景'});
  bg.values['shape'].fill={enabled:true,color:[0.05,0.06,0.09],opacity:100};
  bg.values['shape'].stroke.enabled=false;
  bg.values['shape'].paths=[pathOp(U.pathDataFromPoly(U.rectContour(-200,-200,1800,1200).pts,true))];
  bg.values['transform'].position=[0,0,0];
  bg.values['transform'].anchor=[0,0,0];
  bg.inPoint=0; bg.outPoint=15;

  /* ---------- 字形（供挤出，隐藏） ---------- */
  const glyph=Model.createLayer(comp,'shape',{name:'字形'});
  glyph.visible=false;
  glyph.values['shape'].fill={enabled:true,color:[1,1,1],opacity:100};
  glyph.values['shape'].stroke.enabled=false;
  glyph.values['shape'].paths=STROKES.map(s=>pathOp(capsule(s.p[0],s.p[1],s.w),'add'));
  glyph.values['transform'].position=[0,0,0];
  glyph.values['transform'].anchor=[0,0,0];
  glyph.inPoint=0; glyph.outPoint=15;

  /* ---------- 13 个笔画层（写成） ---------- */
  const strokeLayers=[];
  const strokeStart=0.25, strokeGap=0.205, strokeDur=0.26;
  for(let i=0;i<STROKES.length;i++){
    const s=STROKES[i];
    const l=Model.createLayer(comp,'shape',{name:'笔画 '+(i+1)+' · '+s.name});
    l.values['shape'].fill={enabled:false,color:[1,1,1],opacity:100};
    l.values['shape'].stroke={enabled:true,color:[1,0.94,0.82],width:s.w,opacity:100,cap:'round',join:'round'};
    l.values['shape'].paths=[openStroke(s.p[0],s.p[1])];
    l.values['shape'].trim={enabled:true,start:0,end:0,offset:0};
    l.values['transform'].position=[0,0,0];
    l.values['transform'].anchor=[0,0,0];
    l.inPoint=0; l.outPoint=3.6;
    const t0=strokeStart+i*strokeGap;
    l.kf['shape.trim.end']={keys:[K(t0,0),K(t0+strokeDur,100)]};
    // 淡出
    l.kf['transform.opacity']={keys:[K(2.9,100),K(3.35,100),K(3.9,0)]};
    strokeLayers.push(l);
  }

  /* ---------- 字块（成块 / 锻打 / 冷却） ---------- */
  const block=Model.createLayer(comp,'geometry3d',{name:'字块'});
  block.values['geo'].sourceType='shape';
  block.values['geo'].sourceLayerId=glyph.id;
  block.values['geo'].depth=0;
  block.values['geo'].bevelEnabled=true;
  block.values['geo'].bevelSize=0;
  block.values['geo'].bevelSegments=3;
  block.values['geo'].curveSegments=12;
  block.values['mat']={color:[0.35,0.33,0.32],metalness:0.95,roughness:0.32,emissive:[1,0.42,0.1],emissiveIntensity:0,opacity:0,envIntensity:1.1,castShadow:true,receiveShadow:true};
  block.values['transform'].position=[0,0,0];
  block.values['transform'].anchor=[0,0,0];
  block.inPoint=2.9; block.outPoint=15;
  block.kf['geo.depth']={keys:[K(2.9,0),K(3.4,60),K(4.2,150)]};
  block.kf['geo.bevelSize']={keys:[K(2.9,0),K(4.2,9)]};
  block.kf['mat.opacity']={keys:[K(2.9,0),K(3.5,100)]};
  block.kf['mat.emissiveIntensity']={keys:[K(2.9,0),K(3.6,0.4),K(4.6,2.6),K(5.6,2.2)]};
  block.kf['mat.roughness']={keys:[K(2.9,0.6),K(4.6,0.28)]};
  block.kf['mat.color']={keys:[K(2.9,[0.2,0.19,0.19]),K(4.2,[1,0.5,0.16]),K(5.6,[1,0.45,0.12])]};
  // 锻打时的热脉冲
  const heatKeys=[K(2.9,0),K(3.6,0.4),K(4.6,2.6),K(5.6,2.2)];
  for(const h of HITS){
    heatKeys.push(K(h.t-0.12,2.6),K(h.t,4.6),K(h.t+0.5,1.8));
  }
  heatKeys.push(K(11.0,1.2),K(12.2,0.25),K(13.2,0.12),K(15,0.1));
  block.kf['mat.emissiveIntensity']={keys:heatKeys.sort((a,b)=>a.t-b.t)};
  // 颜色冷却
  const colKeys=[K(2.9,[0.2,0.19,0.19]),K(4.2,[1,0.5,0.16]),K(6.0,[1,0.45,0.12]),K(10.5,[1,0.4,0.1])];
  for(const h of HITS) colKeys.push(K(h.t,[1,0.55,0.2]));
  colKeys.push(K(11.4,[0.75,0.5,0.32]),K(12.6,[0.62,0.63,0.66]),K(13.6,[0.58,0.6,0.64]),K(15,[0.6,0.62,0.66]));
  block.kf['mat.color']={keys:colKeys.sort((a,b)=>a.t-b.t)};
  block.kf['mat.metalness']={keys:[K(2.9,0.2),K(5,0.95),K(12,0.95)]};

  /* ---------- 地面 ---------- */
  const floor=Model.createLayer(comp,'geometry3d',{name:'地面'});
  floor.values['geo'].sourceType='primitive';
  floor.values['geo'].primitive='box';
  floor.values['geo'].depth=2000;
  floor.values['mat']={color:[0.09,0.09,0.11],metalness:0.2,roughness:0.75,emissive:[0,0,0],emissiveIntensity:0,opacity:100,envIntensity:0.5,castShadow:false,receiveShadow:true};
  floor.values['transform'].position=[640,640,0];
  floor.values['transform'].anchor=[0,0,0];
  floor.values['transform'].scale=[110,2,90];
  floor.inPoint=0; floor.outPoint=15;

  /* ---------- 锤头 / 锤柄 ---------- */
  const hammer=Model.createLayer(comp,'geometry3d',{name:'锤头'});
  hammer.values['geo'].sourceType='primitive';
  hammer.values['geo'].primitive='box';
  hammer.values['geo'].depth=170;
  hammer.values['mat']={color:[0.28,0.29,0.32],metalness:1,roughness:0.28,emissive:[0,0,0],emissiveIntensity:0,opacity:100,envIntensity:1.2,castShadow:true,receiveShadow:true};
  hammer.values['transform'].anchor=[0,0,0];
  hammer.inPoint=5.7; hammer.outPoint=11.2;
  const handle=Model.createLayer(comp,'geometry3d',{name:'锤柄'});
  handle.values['geo'].sourceType='primitive';
  handle.values['geo'].primitive='cylinder';
  handle.values['geo'].depth=26;
  handle.values['mat']={color:[0.32,0.2,0.12],metalness:0.1,roughness:0.7,emissive:[0,0,0],emissiveIntensity:0,opacity:100,envIntensity:0.6,castShadow:true,receiveShadow:true};
  handle.values['transform'].anchor=[0,0,0];
  handle.values['transform'].scale=[1,1,6];
  handle.parent=hammer.id;
  handle.inPoint=5.7; handle.outPoint=11.2;
  // 锤头动画
  const hk=[];
  hk.push(K(5.7,[1180,40,420]),K(6.0,[1180,40,420]));
  for(const h of HITS){
    const tx=h.x, ty=h.y;
    hk.push(K(h.t-0.5,[tx+340,ty-400,300],false));
    hk.push(K(h.t-0.16,[tx+50,ty-250,180]));
    hk.push(K(h.t+0.03,[tx,ty-55,90]));
    hk.push(K(h.t+0.28,[tx+90,ty-280,200]));
    hk.push(K(h.t+0.8,[tx+340,ty-400,300],false));
  }
  hk.push(K(11.2,[1180,40,420]));
  hammer.kf['transform.position']={keys:hk.sort((a,b)=>a.t-b.t)};
  const hr=[];
  hr.push(K(5.7,0));
  for(const h of HITS){
    hr.push(K(h.t-0.5,18,false),K(h.t-0.16,-6),K(h.t+0.03,0),K(h.t+0.28,10),K(h.t+0.8,18,false));
  }
  hammer.kf['transform.rotation']={keys:hr.sort((a,b)=>a.t-b.t)};
  hammer.kf['transform.opacity']={keys:[K(5.7,0),K(5.85,100),K(11.0,100),K(11.2,0)]};

  /* ---------- 火花粒子 ---------- */
  const sparks=Model.createLayer(comp,'particle',{name:'火星'});
  sparks.threeD=true;
  const sp=sparks.values['particle'];
  sp.rate=0; sp.life=1.1; sp.speed=520; sp.speedRandom=0.55; sp.size=7; sp.sizeRandom=0.6;
  sp.gravity=620; sp.resistance=0.35; sp.seed=7;
  sp.colorStart=[1,0.9,0.55]; sp.colorEnd=[1,0.25,0.03];
  sp.opacityStart=100; sp.opacityEnd=0;
  sp.trailLength=7; sp.trailWidth=2.2; sp.collide=true; sp.bounce=0.35; sp.friction=0.25; sp.subEmit=true;
  sp.force=[0,0,0];
  sp.planes=[{pos:[640,628,0],normal:[0,-1,0]}];
  sp.collisionLayers=[block.id];
  sp.emitters=HITS.map((h,i)=>({
    id:'em'+i, type:'point', position:[h.x,h.y,40], direction:[0.2,-1,0.5], spread:50,
    surface:false, sourceLayerId:null, velocity:true, rate:0,
  }));
  // 表面发射（少量）
  sp.emitters.push({id:'ems',type:'point',position:[640,360,80],direction:[0,-1,0.6],spread:80,surface:true,sourceLayerId:block.id,velocity:false,rate:0});
  sparks.inPoint=0; sparks.outPoint=15;
  sparks.values['transform'].position=[0,0,0];
  sparks.values['transform'].anchor=[0,0,0];
  for(let i=0;i<HITS.length;i++){
    const h=HITS[i];
    sparks.kf['particle.emitters.'+i+'.rate']={keys:[
      K(h.t-0.05,0,false),K(h.t,260),K(h.t+0.1,180),K(h.t+0.3,0,false)
    ]};
    sparks.kf['particle.emitters.'+i+'.direction']={keys:[
      K(h.t-0.6,[0.2,-1,0.5],false),K(h.t,[0.6,-1,0.9])
    ]};
  }
  sparks.kf['particle.emitters.'+HITS.length+'.rate']={keys:[K(6,0,false),K(6.4,18),K(10.6,14),K(11.4,0,false)]};

  /* ---------- 灯光 ---------- */
  const key=Model.createLayer(comp,'light',{name:'主光'});
  key.values['light']={type:'parallel',color:[1,0.93,0.82],intensity:2.2,position:[400,-300,900],direction:[0.25,0.7,-0.66],cornerAngle:45,cornerFeather:50,castShadow:true,shadowIntensity:90,radius:0};
  key.inPoint=0; key.outPoint=15;
  const fill=Model.createLayer(comp,'light',{name:'补光'});
  fill.values['light']={type:'point',color:[0.45,0.62,1],intensity:1.1,position:[1000,120,600],direction:[0,1,0],cornerAngle:60,cornerFeather:80,castShadow:false,shadowIntensity:0,radius:0};
  fill.inPoint=0; fill.outPoint=15;
  const rim=Model.createLayer(comp,'light',{name:'轮廓光'});
  rim.values['light']={type:'point',color:[1,0.55,0.3],intensity:1.6,position:[640,700,-500],direction:[0,-1,0],cornerAngle:60,cornerFeather:80,castShadow:false,shadowIntensity:0,radius:0};
  rim.inPoint=0; rim.outPoint=15;

  /* ---------- 摄像机 ---------- */
  const cam=Model.createLayer(comp,'camera',{name:'摄像机'});
  cam.values['camera']={position:[640,360,-1000],pointOfInterest:[640,360,0],zoom:50,fov:33,focusDistance:1000,aperture:0,enableDOF:false,blurLevel:1};
  cam.inPoint=0; cam.outPoint=15;
  cam.kf['camera.position']={keys:[
    K(0,[640,360,-1000]),K(2.8,[640,352,-1040]),
    K(4.6,[760,320,-1080]),K(6.0,[900,300,-980]),
    K(7.6,[820,270,-940]),K(9.2,[520,300,-980]),
    K(11.2,[640,340,-1060]),K(13.0,[640,360,-1150]),K(15,[640,360,-1150])
  ]};
  cam.kf['camera.pointOfInterest']={keys:[
    K(0,[640,360,0]),K(6.0,[660,350,0]),K(9.2,[620,360,0]),K(13,[640,360,0])
  ]};
  cam.kf['camera.fov']={keys:[K(0,33),K(6,36),K(13,32)]};
  // 冲击时抖动
  cam.expr['camera.position']='[value[0]+wiggle(7,7), value[1]+wiggle(7,5), value[2]]';

  /* ---------- 冲击场（锻打变形） ---------- */
  HITS.forEach((h,i)=>{
    const f=Geo.makeField({type:'impact',position:[h.x,h.y,20],radius:150,strength:0,falloff:1.6});
    comp.fields.push(f);
    block.values['deform'].pins=block.values['deform'].pins||[];
    block.kf['deform.fieldStrength']={keys:[K(0,1)]};
    // 场强度通过合成字段对象的引用来动画：直接改字段对象的 strength 关键帧
    f.kfStrength=[K(h.t-0.14,0,false),K(h.t,1.6),K(h.t+0.55,0,false)];
  });
  // 让渲染读取场强度关键帧
  comp.fieldEval=function(t){
    for(const f of comp.fields){
      if(f.kfStrength){
        f.strength=U.evalKeys(f.kfStrength,t);
      }
    }
  };

  /* ---------- 音频 ---------- */
  const drone=Model.createLayer(comp,'audio',{name:'氛围低鸣'});
  drone.values['audio']={preset:'drone',note:55,duration:15,volume:0.3,detune:0,attack:0.4,decay:14,tempo:1,pattern:'1'};
  drone.inPoint=0; drone.outPoint=15;
  HITS.forEach((h,i)=>{
    const a=Model.createLayer(comp,'audio',{name:'锤击 '+(i+1)});
    a.values['audio']={preset:'anvil',note:110+i*8,duration:0.9,volume:0.85,detune:0,attack:0.003,decay:0.85,tempo:60,pattern:'1'};
    a.inPoint=h.t; a.outPoint=h.t+1.0;
  });
  const whoosh=Model.createLayer(comp,'audio',{name:'破空'});
  whoosh.values['audio']={preset:'whoosh',note:220,duration:0.4,volume:0.35,detune:0,attack:0.02,decay:0.35,tempo:60,pattern:'1'};
  whoosh.inPoint=5.9; whoosh.outPoint=6.4;
  const chime=Model.createLayer(comp,'audio',{name:'冷却'});
  chime.values['audio']={preset:'chime',note:330,duration:2.5,volume:0.4,detune:0,attack:0.01,decay:2.4,tempo:60,pattern:'1'};
  chime.inPoint=12.4; chime.outPoint=15;

  /* ---------- 节点图示例（字块几何来源） ---------- */
  comp.nodeGraph={nodes:[
    {id:'n_path',type:'input_path',x:60,y:60,params:{layerId:glyph.id},name:'路径输入'},
    {id:'n_dist',type:'distribute',x:260,y:60,params:{count:1,offset:[0,0,0],rotate:0,scale:0},name:'分布'},
    {id:'n_ext',type:'extrude',x:460,y:60,params:{depth:150,bevel:9,bevelSegments:3},name:'挤出成体'},
    {id:'n_out',type:'output',x:660,y:60,params:{},name:'输出'},
  ],links:[
    {id:'l1',from:{node:'n_path',port:0},to:{node:'n_dist',port:0}},
    {id:'l2',from:{node:'n_dist',port:0},to:{node:'n_ext',port:0}},
    {id:'l3',from:{node:'n_ext',port:0},to:{node:'n_out',port:0}},
  ]};

  Model.initHistory();
  Model.emit('structure');
  Model.emit('time');
  return comp;
};

/* 每帧更新场强度关键帧 */
const _origRender = Composite.renderComp;
Composite.renderComp = function(comp,t,target,opts){
  if(comp.fieldEval) comp.fieldEval(t);
  _origRender(comp,t,target,opts);
};

})();
