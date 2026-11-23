(function(){
  'use strict';
  const F=window.Forge;
  function keyed(layer,path,keys,spatial=false){const p=F.anim(0);p.value=F.util.clone(keys[0][1]);p.keyframes=keys.map(k=>{const key=F.key(k[0],k[1],k[2]||'bezier');if(spatial){key.spatial='bezier';key.outHandle=[35,8,0];key.inHandle=[-35,-8,0]}return key});layer.props[path]=p;return p}
  function layer(type,id,name){const l=F.createLayer(type,name);l.id=id;return l}
  F.buildDefaultProject=function(){
    const glyph=layer('text3d','glyph','锻 · 三维字形');
    glyph.text={font:'Forge Serif',fill:'#d8d5cd',stroke:'#ff9a5f',strokeWidth:1};
    glyph.props['text.content'].value='铸';
    keyed(glyph,'transform.position',[[0,[0,-8,0]],[3,[0,0,0]],[6.4,[0,0,0]],[6.52,[-3,-5,0]],[6.8,[0,0,0]],[8,[0,0,0]],[8.1,[4,-3,0]],[8.35,[0,0,0]],[9.4,[0,0,0]],[9.5,[-2,-4,0]],[10,[0,0,0]],[15,[0,0,0]]],true);
    keyed(glyph,'transform.rotation',[[0,[0,-16,-1]],[3,[0,-7,0]],[5.8,[0,1,0]],[6.42,[0,0,0]],[6.62,[0,-2,-1]],[7.2,[0,0,0]],[8.05,[0,0,0]],[8.25,[1,2,1]],[8.7,[0,0,0]],[9.4,[0,0,0]],[9.65,[-1,-2,-1]],[10.4,[0,0,0]],[15,[0,0,0]]]);
    keyed(glyph,'transform.scale',[[0,[94,94,20]],[2.8,[98,98,65]],[4.4,[100,100,100]],[6.42,[100,100,100]],[6.52,[102,97,105]],[6.8,[100,100,100]],[8.05,[100,100,100]],[8.15,[101,98,103]],[8.5,[100,100,100]],[9.4,[100,100,100]],[9.5,[102,97,105]],[10,[100,100,100]],[15,[100,100,100]]]);
    keyed(glyph,'extrude.depth',[[0,.025],[2.2,.07],[3.5,.38],[4.7,.68],[15,.68]]);
    keyed(glyph,'extrude.bevel',[[0,.004],[3.2,.015],[4.7,.035],[15,.035]]);
    keyed(glyph,'material.color',[[0,'#382a22'],[1.9,'#71331f'],[3.7,'#e17438'],[5.5,'#f0a064'],[6.6,'#ffc17b'],[8.1,'#e48a4e'],[9.5,'#f2a063'],[10.8,'#a8a6a0'],[12.2,'#98a2aa'],[15,'#98a2aa']]);
    keyed(glyph,'material.emissive',[[0,'#ff5b1f'],[5,'#ff7b2f'],[10,'#f76a24'],[12,'#18232b'],[15,'#10181e']]);
    keyed(glyph,'material.emissiveIntensity',[[0,.18],[1.5,.25],[3.2,.55],[4.7,.95],[6.4,1.3],[6.7,.85],[8.05,1.25],[8.35,.75],[9.4,1.3],[10,.65],[11.4,.08],[12.4,.01],[15,.01]]);
    keyed(glyph,'material.roughness',[[0,.75],[3.8,.48],[5.8,.26],[9.5,.3],[12,.24],[15,.24]]);
    keyed(glyph,'deform.twist',[[0,0],[5.8,0],[6.48,2.5],[7.1,-.8],[8.05,0],[8.18,-2],[8.7,0],[9.5,2.8],[10.4,0],[15,0]]);
    glyph.effects=[{id:'fx-glow',type:'glow',name:'锻造辉光',enabled:true,params:{threshold:.88,strength:.46,radius:.58}},{id:'fx-color',type:'color',name:'色相 / 饱和度 / 亮度',enabled:true,params:{hue:0,saturation:108,brightness:2}},{id:'fx-shadow',type:'shadow',name:'接触投影',enabled:true,params:{distance:18,softness:24,opacity:55}}];

    const hammer=layer('geometry','hammer','锤 · 锻造锤');hammer.shape.kind='hammer';hammer.out=11.4;
    keyed(hammer,'transform.position',[[0,[250,530,120]],[4.9,[250,530,120]],[5.65,[190,610,130]],[6.02,[145,475,110]],[6.42,[82,215,74]],[6.58,[95,265,85]],[7.08,[210,500,130]],[7.46,[180,585,120]],[7.8,[110,420,95]],[8.05,[-45,205,76]],[8.22,[-30,270,82]],[8.7,[220,530,130]],[9.02,[200,610,130]],[9.28,[135,415,105]],[9.5,[45,190,72]],[9.68,[70,280,90]],[10.3,[245,555,140]],[11.4,[380,680,180]],[15,[380,680,180]]]);
    keyed(hammer,'transform.rotation',[[0,[8,-18,-28]],[5.65,[5,-12,-42]],[6.02,[0,-6,-18]],[6.42,[0,0,18]],[6.62,[0,-8,5]],[7.08,[5,-12,-32]],[7.8,[0,0,15]],[8.05,[0,5,-17]],[8.25,[0,-5,4]],[8.7,[5,-12,-32]],[9.28,[0,0,12]],[9.5,[0,4,-14]],[9.72,[0,-5,8]],[10.3,[8,-18,-28]],[15,[8,-18,-28]]]);
    hammer.props['material.color'].value='#72777c';hammer.props['material.roughness'].value=.24;hammer.props['material.metalness'].value=1;

    const camera=layer('camera','camera','CAM · 景别与焦点');
    keyed(camera,'transform.position',[[0,[35,45,1060]],[2.7,[80,55,980]],[4.9,[140,75,885]],[5.8,[175,85,845]],[6.42,[155,75,875]],[6.58,[160,78,860]],[7.5,[140,75,830]],[8.05,[130,75,855]],[8.2,[135,78,840]],[9.5,[120,65,845]],[10.8,[75,50,920]],[12.5,[25,35,995]],[15,[25,35,995]]],true);
    keyed(camera,'camera.target',[[0,[0,0,0]],[4.8,[0,5,0]],[6.42,[8,-5,10]],[8.05,[-8,-3,10]],[9.5,[0,-5,10]],[12,[0,0,0]],[15,[0,0,0]]]);
    keyed(camera,'camera.fov',[[0,42],[4.8,43],[6.42,45],[10,44],[12,42],[15,42]]);
    keyed(camera,'camera.focus',[[0,10.5],[4.8,8.8],[6.4,8.6],[9.8,8.4],[12,9.9],[15,9.9]]);
    keyed(camera,'camera.aperture',[[0,.00008],[3,.00012],[5,.0002],[10,.00016],[12,.00007],[15,.00007]]);

    const keyLight=layer('light','key-light','KEY · 炉口主光');keyed(keyLight,'transform.position',[[0,[-360,420,420]],[5,[-260,330,380]],[10,[-220,350,420]],[15,[-300,420,450]]]);keyed(keyLight,'light.intensity',[[0,1.5],[3,2.4],[5,3.5],[6.45,4.4],[7.2,3.2],[8.1,4.1],[9.5,4.3],[11.5,2.2],[15,2.4]]);keyed(keyLight,'light.color',[[0,'#ff8b45'],[4,'#ffb16f'],[10,'#ffc28b'],[12,'#c7dcdf'],[15,'#c7dcdf']]);keyLight.props['light.kind'].value='point';
    const rimLight=layer('light','rim-light','RIM · 冷却轮廓光');rimLight.props['transform.position'].value=[350,150,-240];rimLight.props['light.color'].value='#75b5d2';keyed(rimLight,'light.intensity',[[0,.35],[4,.7],[9.5,1.1],[11.5,4.2],[15,3.2]]);
    const topLight=layer('light','top-light','AREA · 顶部长条光');topLight.props['transform.position'].value=[30,500,150];topLight.props['light.kind'].value='directional';topLight.props['light.color'].value='#e5e9e6';topLight.props['light.intensity'].value=2.2;

    const field=layer('field','impact-field','撞击场 · 距离与旋涡');keyed(field,'transform.position',[[0,[70,40,45]],[5.8,[70,40,45]],[6.42,[82,35,58]],[7.5,[70,40,45]],[8.05,[-45,10,58]],[9.5,[45,60,58]],[15,[45,60,58]]]);keyed(field,'field.strength',[[0,.12],[4.5,.2],[5.9,.1],[6.42,1.35],[6.85,.25],[7.8,.1],[8.05,1.2],[8.55,.18],[9.5,1.4],[10.3,.12],[15,.08]]);keyed(field,'field.radius',[[0,1.4],[6.42,2.2],[8.05,1.9],[9.5,2.3],[15,1.4]]);
    const pin=layer('null','pin','图钉 · 字形重心');pin.props['transform.position'].value=[0,-30,35];pin.parentId='glyph';

    const sparks=layer('particles','sparks','火星 · 变形表面发射');sparks.props['particle.rate'].value=125;sparks.props['particle.life'].value=1.65;sparks.props['particle.speed'].value=5.2;sparks.props['particle.trail'].value=.14;sparks.props['particle.size'].value=1.15;
    keyed(sparks,'transform.opacity',[[0,0],[5.95,0],[6.38,100],[10.3,100],[11.65,0],[15,0]]);
    const embers=layer('particles','embers','炉尘 · 环境漂浮');embers.props['particle.rate'].value=48;embers.props['particle.life'].value=7;embers.props['particle.speed'].value=.28;embers.props['particle.size'].value=.42;embers.props['particle.trail'].value=0;embers.props['particle.sourceLayerId'].value='none';embers.props['particle.colorStart'].value='#f3a05e';embers.props['particle.colorEnd'].value='#5a2415';embers.props['particle.gravity'].value=.025;
    const anvil=layer('geometry','anvil','砧座 · 碰撞与接收阴影');anvil.shape.kind='anvil';anvil.props['transform.position'].value=[0,-225,0];anvil.props['material.color'].value='#26292c';anvil.props['material.metalness'].value=.85;anvil.props['material.roughness'].value=.4;
    const floor=layer('geometry','floor','熔炉地面 · 平面');floor.shape.kind='ground';floor.props['transform.position'].value=[0,-255,0];floor.props['material.color'].value='#141619';floor.props['material.roughness'].value=.57;floor.props['material.metalness'].value=.45;floor.castShadow=false;
    const controller=layer('null','controller','控制器 · 全局节奏');controller.props['transform.rotation'].expression='time * 8';controller.props['transform.rotation'].expressionEnabled=true;
    const adjust=layer('adjustment','grade','调整 · 炉光与暗角');adjust.effects=[{id:'fx-adjust',type:'color',name:'电影调色',enabled:true,params:{hue:-2,saturation:104,brightness:-2}},{id:'fx-vignette',type:'vignette',name:'柔和暗角',enabled:true,params:{strength:28}}];
    const music=layer('audio','music','乐 · 炉床低鸣');music.props['audio.volume'].value=38;music.props['audio.kind'].value='ambience';
    const sfx=layer('audio','sfx','音效 · 三次锻打');sfx.props['audio.volume'].value=72;sfx.props['audio.kind'].value='strike';
    const nodes=[
      {id:'n-text',type:'textSource',name:'文字轮廓',x:25,y:28,inputs:[],outputs:[{id:'geometry',name:'字形几何',type:'geometry'}],params:{文字:'铸',字体:'Forge Serif'}},
      {id:'n-mesh',type:'mesh',name:'轮廓网格化',x:215,y:28,inputs:[{id:'geometry',name:'路径',type:'geometry'}],outputs:[{id:'geometry',name:'三角网格',type:'geometry'}],params:{精度:'.012',孔洞:'保留'}},
      {id:'n-extrude',type:'extrude',name:'挤出与倒角',x:410,y:28,inputs:[{id:'geometry',name:'网格',type:'geometry'}],outputs:[{id:'geometry',name:'实体',type:'geometry'}],params:{深度:'.68',倒角:'.035'}},
      {id:'n-field',type:'field',name:'冲击空间场',x:215,y:190,inputs:[],outputs:[{id:'field',name:'场',type:'field'}],params:{衰减:'2.0',旋涡:'.45'}},
      {id:'n-deform',type:'deform',name:'顶点变形',x:605,y:65,inputs:[{id:'geometry',name:'实体',type:'geometry'},{id:'field',name:'空间场',type:'field'}],outputs:[{id:'geometry',name:'变形几何',type:'geometry'}],params:{强度:'1.00',法线:'重算'}},
      {id:'n-output',type:'output',name:'场景显示',x:820,y:12,inputs:[{id:'geometry',name:'几何',type:'geometry'}],outputs:[],params:{材质:'炽热钢',阴影:'开启'}},
      {id:'n-emitter',type:'emitter',name:'表面粒子发射',x:820,y:117,inputs:[{id:'geometry',name:'发射表面',type:'geometry'}],outputs:[{id:'particles',name:'粒子',type:'particles'}],params:{速率:'125/s',种子:'240517'}},
      {id:'n-collider',type:'collision',name:'表面碰撞',x:820,y:225,inputs:[{id:'geometry',name:'碰撞表面',type:'geometry'}],outputs:[{id:'collider',name:'碰撞体',type:'collider'}],params:{反弹:'.52',摩擦:'.64'}}
    ];
    const connections=[{id:'c1',from:'n-text',fromPort:'geometry',to:'n-mesh',toPort:'geometry',type:'geometry'},{id:'c2',from:'n-mesh',fromPort:'geometry',to:'n-extrude',toPort:'geometry',type:'geometry'},{id:'c3',from:'n-extrude',fromPort:'geometry',to:'n-deform',toPort:'geometry',type:'geometry'},{id:'c4',from:'n-field',fromPort:'field',to:'n-deform',toPort:'field',type:'field'},{id:'c5',from:'n-deform',fromPort:'geometry',to:'n-output',toPort:'geometry',type:'geometry'},{id:'c6',from:'n-deform',fromPort:'geometry',to:'n-emitter',toPort:'geometry',type:'geometry'},{id:'c7',from:'n-deform',fromPort:'geometry',to:'n-collider',toPort:'geometry',type:'geometry'}];
    const comp={id:'main',name:'锻字_MAIN',width:1920,height:1080,fps:60,duration:15,workStart:0,workEnd:15,layers:[adjust,camera,keyLight,rimLight,topLight,hammer,glyph,pin,field,sparks,embers,anvil,floor,controller,music,sfx],background:'#090b0d',motionBlur:true,shutterAngle:180,shutterPhase:-90,nodes,connections};
    const strokeComp={id:'strokes',name:'笔画_WRITE',width:1920,height:1080,fps:60,duration:5,workStart:0,workEnd:5,layers:[F.util.clone(glyph)],background:'#0b0c0e',motionBlur:true,shutterAngle:180,shutterPhase:-90,nodes:[],connections:[]};strokeComp.layers[0].id='stroke-glyph';strokeComp.layers[0].name='铸 · 轮廓写成';
    const sparkComp={id:'sparks-comp',name:'火星_PARTICLES',width:1920,height:1080,fps:60,duration:15,workStart:0,workEnd:15,layers:[F.util.clone(sparks),F.util.clone(anvil)],background:'#0b0c0e',motionBlur:true,shutterAngle:180,shutterPhase:-90,nodes:[],connections:[]};sparkComp.layers[0].id='spark-copy';sparkComp.layers[1].id='anvil-copy';
    return{version:1,name:'锻字 · FORGE TYPE',activeCompId:'main',created:'2026-11-14',engine:'FORGE WebGL2',seed:240517,font:{name:'Forge Serif',range:'内置铸锻字等常用中文、拉丁字母与数字；其他字符由系统 CJK 字体生成轮廓'},comps:[comp,strokeComp,sparkComp],ui:{leftTab:'project',editorTab:'timeline',inspectorTab:'properties'}};
  };
})();
