(() => {
  'use strict';

  const DURATION = 15;
  const FPS = 30;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const phaseAt = t => t < 3.6 ? ['01 · 写成', '笔锋聚形'] : t < 6.8 ? ['02 · 成块', '炉火成钢'] : t < 10.3 ? ['03 · 锻打', '一击定势'] : ['04 · 冷却', '淬火定型'];
  const formatTime = t => {
    const totalFrames = Math.round(t * FPS);
    const seconds = Math.floor(totalFrames / FPS);
    const frames = totalFrames % FPS;
    return `00:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  const project = {
    name: '锻字工程', activeComp: 'main', glyph: '铸', duration: DURATION, fps: FPS,
    comps: [{id:'main',name:'主合成',width:1920,height:1080,fps:30,duration:15},{id:'glyph',name:'字形_预合成',width:1920,height:1080,fps:30,duration:15},{id:'spark',name:'火星_粒子系统',width:1920,height:1080,fps:30,duration:3}],
    workArea: [0, 15], currentTime: 0, playing: false, loop: true, exportMode: false,
    grid: true, guides: true, motionBlur: true, snap: true, selectedLayer: 'glyph3d',
    camera: { fov: 38, focus: 920, aperture: 1.8 },
    render: { depth: 72, bevel: 8, deform: .64, glow: 1.18, metal: .92, roughness: .28, emission: 1.36, baseColor: '#5a3026' },
    particles: { rate: 34, speed: 1, life: 1, drag: .18, seed: 24, emitter: '铸字_变形表面' },
    field: { strength: .32, falloff: 320, noise: .18, vortex: .42 },
    composite: { blend: '正常', matte: '无', maskEnabled: false, maskFeather: 18, maskType: '椭圆', maskInvert: false },
    effects: { glow:true, glowRadius:32, blur:true, blurAmount:2, grade:true, hue:0, saturation:1.12, brightness:.92 },
    textAnimator: { start: 0, end: 1, offset: 0, softness: .18, opacity: 1, unit: '按字' },
    textStyle: { fontSize: 720, lineHeight: 1.08, tracking: 0, align: 'center' },
    light: { intensity: 1.28, color: '#ff9b54', shadowSoftness: .26 },
    audioSettings: { volume: .48, baseTone: 55, waveform: 'triangle' },
    transform: { position: [960, 540, 0], scale: [100, 100, 100], rotation: [-6, -12, 0], opacity: 100 },
    propertyTracks: { glyph3d: {} },
    expression: 'value + wiggle(0.8, 0.6)', expressionEnabled: true,
    layers: [
      { id:'grade', name:'余烬调色', type:'adjustment', icon:'◐', color:'#7f78d8', in:0, out:15, visible:true, locked:false, keys:[0,10.4,15], blend:'叠加' },
      { id:'camera', name:'活动摄像机', type:'camera', icon:'▰', color:'#7cb9d5', in:0, out:15, visible:true, locked:false, keys:[0,3.6,7.2,8.55,10.3,14.2] },
      { id:'controller', name:'控制器', type:'null', icon:'◇', color:'#9a84d8', in:0, out:15, visible:true, locked:false, keys:[0,6.8,8.55,10.3,15], transform:{position:[960,540,0],scale:[100,100,100],rotation:[0,0,0],opacity:100}, tracks:{rotationY:[{time:0,value:0,interp:'bezier'},{time:6.8,value:-8,interp:'bezier'},{time:8.55,value:18,interp:'bezier'},{time:10.3,value:0,interp:'bezier'},{time:15,value:0,interp:'hold'}]} },
      { id:'keylight', name:'炉火_点光源', type:'light', icon:'☀', color:'#f5c25f', in:0, out:15, visible:true, locked:false, keys:[0,3.6,8.55,11.4] },
      { id:'hammer', name:'锻锤_实体', type:'geometry', icon:'⬡', color:'#e98054', in:6.15, out:10.15, visible:true, locked:false, keys:[6.2,7.25,8.1,8.58,9.0,10.0] },
      { id:'sparks', name:'冲击火星_粒子', type:'particle', icon:'✦', color:'#ff9c36', in:8.42, out:12.1, visible:true, locked:false, keys:[8.5,8.64,9.2,11.8] },
      { id:'glyph3d', name:'铸字_挤出体', type:'geometry', icon:'⬡', color:'#ff6332', in:2.72, out:15, visible:true, locked:false, keys:[2.7,3.6,5.2,6.7,8.56,9.1,10.4,14.2] },
      { id:'strokes', name:'铸_笔画生长', type:'text', icon:'T', color:'#d6ad8c', in:0, out:4.2, visible:true, locked:false, keys:[0,.5,1.4,2.4,3.5,4.15] },
      { id:'field', name:'冲击旋涡场', type:'field', icon:'◎', color:'#62b8bd', in:6.7, out:12.5, visible:true, locked:false, keys:[6.8,8.55,9.5,12.2] },
      { id:'anvil', name:'锻造台_碰撞体', type:'geometry', icon:'⬢', color:'#6c7680', in:0, out:15, visible:true, locked:true, keys:[] },
      { id:'sound', name:'炉心节拍_音色', type:'audio', icon:'♫', color:'#6fc787', in:0, out:15, visible:true, locked:false, keys:[0,3.6,6.8,8.55,10.4,14.2] },
      { id:'embers', name:'环境余烬_粒子', type:'particle', icon:'✦', color:'#a86742', in:0, out:15, visible:true, locked:false, keys:[0,15] },
      { id:'bg', name:'炉膛环境', type:'shape', icon:'▱', color:'#4e5660', in:0, out:15, visible:true, locked:true, keys:[] }
    ],
    nodes: [
      {id:'text',title:'文字轮廓',x:40,y:64,color:'#c8815d',ports:[['输出轮廓','geometry','out']],footer:'字符：铸 · 12 条轮廓'},
      {id:'tri',title:'三角剖分',x:230,y:40,color:'#a16be0',ports:[['轮廓','geometry','in'],['网格','geometry','out']],footer:'凹部 / 孔洞：有效'},
      {id:'pin',title:'图钉变形',x:420,y:36,color:'#61b7bd',ports:[['网格','geometry','in'],['旋涡场','field','in'],['变形网格','geometry','out']],footer:'3 图钉 · 连续蒙皮'},
      {id:'extrude',title:'挤出与倒角',x:610,y:62,color:'#ef7545',ports:[['轮廓','geometry','in'],['深度','scalar','in'],['实体','geometry','out']],footer:'72 px · 倒角 8 px'},
      {id:'material',title:'炽铁材质',x:805,y:29,color:'#ff9d37',ports:[['实体','geometry','in'],['基础色','color','in'],['着色实体','geometry','out']],footer:'金属 0.92 · 粗糙 0.28'},
      {id:'emitter',title:'表面发射器',x:617,y:150,color:'#f0b740',ports:[['变形网格','geometry','in'],['速率','scalar','in'],['粒子流','geometry','out']],footer:'碰撞触发次级发射'},
      {id:'output',title:'合成输出',x:990,y:84,color:'#6bc98d',ports:[['实体','geometry','in'],['粒子','geometry','in'],['画面','geometry','out']],footer:'WebGL 2 · PBR 预览'}
    ],
    connections: [
      ['text','tri','geometry'],['tri','pin','geometry'],['pin','extrude','geometry'],['extrude','material','geometry'],['pin','emitter','geometry'],['material','output','geometry'],['emitter','output','particle']
    ]
  };

  const ui = { activeTool:'select', activeLower:'timeline', activeInspector:'properties', zoom:1, selectedKeys:new Set(), keyClipboard:[], selectedNode:'pin', pendingPort:null, drag:null };
  const history = { undo:[], redo:[] };

  function normalizeProject() {
    project.composite = Object.assign({ blend:'正常', matte:'无', maskEnabled:false, maskFeather:18, maskType:'椭圆', maskInvert:false }, project.composite || {});
    project.effects = Object.assign({ glow:true, glowRadius:32, blur:true, blurAmount:2, grade:true, hue:0, saturation:1.12, brightness:.92 }, project.effects || {});
  }

  function snapshot(label) {
    history.undo.push({ label, state: JSON.stringify({glyph:project.glyph,comps:project.comps,render:project.render,particles:project.particles,field:project.field,composite:project.composite,effects:project.effects,textAnimator:project.textAnimator,textStyle:project.textStyle,camera:project.camera,light:project.light,audioSettings:project.audioSettings,transform:project.transform,propertyTracks:project.propertyTracks,expression:project.expression,layers:project.layers,nodes:project.nodes,connections:project.connections}) });
    if (history.undo.length > 35) history.undo.shift();
    history.redo.length = 0;
    markDirty();
  }
  function restoreSnapshot(entry, target) {
    if (!entry) return;
    target.push({ label:entry.label, state:JSON.stringify({glyph:project.glyph,comps:project.comps,render:project.render,particles:project.particles,field:project.field,composite:project.composite,effects:project.effects,textAnimator:project.textAnimator,textStyle:project.textStyle,camera:project.camera,light:project.light,audioSettings:project.audioSettings,transform:project.transform,propertyTracks:project.propertyTracks,expression:project.expression,layers:project.layers,nodes:project.nodes,connections:project.connections}) });
    Object.assign(project, JSON.parse(entry.state));normalizeProject();project.comps?.forEach(addCompAsset);
    renderer.updateGlyph(project.glyph); renderLayerRows(); renderTimeline(); updateInspector(); renderNodes(); renderAll();
    toast(entry.label, target === history.redo ? '已撤销操作' : '已重做操作');
  }
  function undo() { restoreSnapshot(history.undo.pop(), history.redo); }
  function redo() { restoreSnapshot(history.redo.pop(), history.undo); }
  function markDirty() { $('#dirtyMark').textContent = '未保存'; }

  function toast(title, message='') {
    const el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = `<b>${escapeHtml(title)}</b>${message ? `<span>${escapeHtml(message)}</span>` : ''}`;
    $('#toastStack').appendChild(el); setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(-5px)'; el.style.transition='.2s'; setTimeout(()=>el.remove(),220); }, 2400);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function sampleTrack(track,baseValue,time){if(!track?.length)return baseValue;const keys=[...track].sort((a,b)=>a.time-b.time);if(time<=keys[0].time)return keys[0].value;if(time>=keys.at(-1).time)return keys.at(-1).value;const i=keys.findIndex(k=>k.time>time),a=keys[i-1],b=keys[i],u=clamp((time-a.time)/(b.time-a.time),0,1);if(a.interp==='hold')return a.value;return lerp(a.value,b.value,a.interp==='linear'?u:ease(u))}
  function transformBase(layer){if(!layer||layer.id==='glyph3d'||layer.id==='strokes')return project.transform;return layer.transform||={position:[960,540,0],scale:[100,100,100],rotation:[0,0,0],opacity:100}}
  function fieldBase(transform,field){const map={positionX:transform.position[0],positionY:transform.position[1],positionZ:transform.position[2],scaleX:transform.scale[0],scaleY:transform.scale[1],scaleZ:transform.scale[2],rotationX:transform.rotation[0],rotationY:transform.rotation[1],rotationZ:transform.rotation[2],opacity:transform.opacity};return map[field]??0}
  function propertyTrack(layer,field){return layer?.tracks?.[field]||project.propertyTracks?.[layer?.id]?.[field]||[]}
  function animatedProperty(layer,field,time){const base=fieldBase(transformBase(layer),field);return sampleTrack(propertyTrack(layer,field),base,time)}
  function setTrackKey(layer,field,time,value){const bucket=layer.tracks||(project.propertyTracks[layer.id]||={}),track=bucket[field]||=[];let key=track.find(k=>Math.abs(k.time-time)<.5/FPS);if(key)key.value=value;else track.push({time,value,interp:'bezier'});track.sort((a,b)=>a.time-b.time);if(!layer.keys.some(t=>Math.abs(t-time)<.5/FPS))layer.keys.push(time);layer.keys.sort((a,b)=>a-b)}
  function expressionField(prop){const digit=prop.match(/\[([012])\]/)?.[1],letter=prop.match(/\.([xyz])$/i)?.[1]?.toLowerCase(),index=digit!==undefined?+digit:letter?{x:0,y:1,z:2}[letter]:null;if(prop.startsWith('rotation'))return`rotation${['X','Y','Z'][index??1]}`;if(prop.startsWith('position'))return`position${['X','Y','Z'][index??0]}`;if(prop.startsWith('scale'))return`scale${['X','Y','Z'][index??0]}`;return prop}
  function resolveLayerProperty(name,prop,time,stack=[]){const layer=project.layers.find(l=>l.name===name);if(!layer)throw Error(`找不到图层“${name}”`);const field=expressionField(prop),key=`${layer.id}:${field}`;if(stack.includes(key))throw Error(`表达式循环：${[...stack,key].join(' → ')}`);const base=animatedProperty(layer,field,time),expr=layer.expressions?.[field];return expr&&layer.expressionEnabled!==false?evaluateExpression(expr,base,time,{layer,field,track:propertyTrack(layer,field),stack:[...stack,key],valueAtTime:t=>animatedProperty(layer,field,t)}):base}
  function evaluateExpression(expression,baseValue,time,context={}){
    try{
      const expr=String(expression||'value').trim(),ref=/thisComp\.layer\(["'](.+?)["']\)\.transform\.(rotation(?:\[[0-2]\]|\.[xyz])?|position(?:\[[0-2]\]|\.[xyz])?|scale(?:\[[0-2]\]|\.[xyz])?)(?:\.valueAtTime\(\s*([\d.]+)\s*\))?/i.exec(expr);
      if(ref){const refTime=ref[3]===undefined?time:+ref[3],refValue=resolveLayerProperty(ref[1],ref[2],refTime,context.stack||[]),arithmetic=expr.replace(ref[0],String(refValue)).replace(/\bvalue\b/g,String(baseValue)).replace(/\btime\b/g,String(time));if(/^[\d\s.+\-*/()]+$/.test(arithmetic))return Function(`"use strict";return (${arithmetic})`)();return refValue}
      const wiggle=expr.match(/wiggle\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);if(wiggle){const f=+wiggle[1],a=+wiggle[2],seed=project.particles.seed||24,n=(Math.sin(time*f*Math.PI*2+seed*.37)+Math.sin(time*f*3.17+seed)*.38)/1.38*a;return expr.includes('value')?baseValue+n:n}
      const linearMatch=expr.match(/linear\s*\(\s*(?:time|([\d.]+))\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*(?:value|([\d.-]+))\s*,\s*(?:value\s*\+\s*)?([\d.-]+)\s*\)/i);if(linearMatch){const tt=linearMatch[1]?+linearMatch[1]:time,a=+linearMatch[2],b=+linearMatch[3],c=linearMatch[4]?+linearMatch[4]:baseValue,d=expr.includes('value +')?baseValue+(+linearMatch[5]):+linearMatch[5];return lerp(c,d,clamp((tt-a)/(b-a),0,1))}
      const easeMatch=expr.match(/ease\s*\(\s*(?:time|([\d.]+))\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*(?:value|([\d.-]+))\s*,\s*(?:value\s*\+\s*)?([\d.-]+)\s*\)/i);if(easeMatch){const tt=easeMatch[1]?+easeMatch[1]:time,a=+easeMatch[2],b=+easeMatch[3],c=easeMatch[4]?+easeMatch[4]:baseValue,d=expr.includes('value +')?baseValue+(+easeMatch[5]):+easeMatch[5];return lerp(c,d,ease(clamp((tt-a)/(b-a),0,1)))}
      const loop=expr.match(/loopOut\s*\(\s*["'](cycle|pingpong)["']\s*\)/);if(loop&&context.track?.length>1){const keys=[...context.track].sort((a,b)=>a.time-b.time),start=keys[0].time,end=keys.at(-1).time,span=end-start;if(span>0){let local=(time-start)%span;if(local<0)local+=span;if(loop[1]==='pingpong'&&Math.floor(Math.max(0,time-start)/span)%2)local=span-local;return sampleTrack(keys,baseValue,start+local)}}
      const at=expr.match(/valueAtTime\s*\(\s*([\d.]+)\s*\)/);if(at)return context.valueAtTime?context.valueAtTime(+at[1]):baseValue;
      if(expr==='time')return time;if(expr==='value')return baseValue;const arithmetic=expr.replace(/\bvalue\b/g,String(baseValue)).replace(/\btime\b/g,String(time));if(/^[\d\s.+\-*/()]+$/.test(arithmetic))return Function(`"use strict";return (${arithmetic})`)();
    }catch(error){project.expressionError=error.message}
    return baseValue;
  }
  function layerTransformAt(layer,time){return{position:[animatedProperty(layer,'positionX',time),animatedProperty(layer,'positionY',time),animatedProperty(layer,'positionZ',time)],scale:[animatedProperty(layer,'scaleX',time),animatedProperty(layer,'scaleY',time),animatedProperty(layer,'scaleZ',time)],rotation:[animatedProperty(layer,'rotationX',time),animatedProperty(layer,'rotationY',time),animatedProperty(layer,'rotationZ',time)],opacity:animatedProperty(layer,'opacity',time)}}
  function worldTransformAt(layer,time,stack=[]){const local=layerTransformAt(layer,time);if(!layer?.parent||layer.parent==='无'||stack.includes(layer.id))return local;const parent=project.layers.find(l=>l.name===layer.parent);if(!parent)return local;const p=worldTransformAt(parent,time,[...stack,layer.id]),sx=p.scale[0]/100,sy=p.scale[1]/100,a=p.rotation[2]*Math.PI/180,dx=(local.position[0]-960)*sx,dy=(local.position[1]-540)*sy;return{position:[p.position[0]+dx*Math.cos(a)-dy*Math.sin(a),p.position[1]+dx*Math.sin(a)+dy*Math.cos(a),p.position[2]+local.position[2]],scale:local.scale.map((v,i)=>v*p.scale[i]/100),rotation:local.rotation.map((v,i)=>v+p.rotation[i]),opacity:local.opacity}}
  function glyphTransformAt(time){return worldTransformAt(project.layers.find(l=>l.id==='glyph3d'),time)}
  function remapLayerTime(layer,time){if(!layer?.timeRemap)return time;const tm=layer.timeRemap,duration=Math.max(.001,layer.out-layer.in);if(tm.freeze)return clamp(tm.start,0,duration);let local=(time-layer.in)*(tm.speed??1)+(tm.start||0);if(tm.reverse)local=duration-local;return clamp(local,0,duration)}
  function hexRgb(hex){const clean=String(hex).replace('#','').padEnd(6,'0'),n=parseInt(clean,16)||0;return[((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255]}

  function evaluateNodeGraph(){
    const byId=new Map(project.nodes.map(n=>[n.id,n])),incoming=new Map(),cache=new Map(),visiting=new Set(),errors=[];
    project.connections.forEach(c=>{if(!incoming.has(c[1]))incoming.set(c[1],[]);incoming.get(c[1]).push(c)});
    const inputResults=id=>(incoming.get(id)||[]).map(c=>({connection:c,value:visit(c[0])}));
    function visit(id){
      if(cache.has(id))return cache.get(id);if(visiting.has(id)){errors.push(`循环依赖：${id}`);return null}const node=byId.get(id);if(!node){errors.push(`缺失节点：${id}`);return null}visiting.add(id);let value=null;
      const inputs=inputResults(id).filter(x=>x.value);
      if(node.id==='text')value={kind:'path',glyph:project.glyph,contours:Math.max(1,[...project.glyph].filter(c=>!(/\s/.test(c))).length*12)};
      else if(node.id==='tri'){const src=inputs.find(x=>['path','mesh'].includes(x.value.kind))?.value;if(src)value={...src,kind:'mesh',triangles:src.contours*18,holes:true}}
      else if(node.id==='pin'){const src=inputs.find(x=>['path','mesh','solid'].includes(x.value.kind))?.value;if(src)value={...src,kind:src.kind==='path'?'mesh':src.kind,deform:project.field.strength,pins:3}}
      else if(node.id==='extrude'){const src=inputs.find(x=>['path','mesh','solid'].includes(x.value.kind))?.value;if(src)value={...src,kind:'solid',depth:project.render.depth,bevel:project.render.bevel,normals:true}}
      else if(node.id==='material'){const src=inputs.find(x=>x.value.kind==='solid')?.value;if(src)value={...src,material:{metal:project.render.metal,roughness:project.render.roughness,emission:project.render.emission,baseColor:project.render.baseColor}}}
      else if(node.id==='emitter'){const src=inputs.find(x=>['path','mesh','solid'].includes(x.value.kind))?.value;if(src)value={kind:'particle',source:src,rate:project.particles.rate,speed:project.particles.speed,life:project.particles.life,drag:project.particles.drag}}
      else if(node.id==='output'){const geom=inputs.find(x=>x.connection[2]!=='particle'&&x.value.kind==='solid')?.value,particles=inputs.find(x=>x.connection[2]==='particle'||x.value.kind==='particle')?.value;value={kind:'output',geometry:geom||null,particles:particles?.kind==='particle'?particles:null}}
      else if(node.title.includes('噪声场'))value={kind:'field',strength:project.field.noise};
      else value=inputs[0]?.value||null;
      visiting.delete(id);cache.set(id,value);return value;
    }
    const result=visit('output')||{kind:'output',geometry:null,particles:null};project.graphStatus={ok:errors.length===0,errors,evaluated:cache.size,result};return result;
  }

  class ForgeRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl2', {alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
      if (!this.gl) { $('#renderWarning').hidden=false; return; }
      this.glyphCanvas = document.createElement('canvas'); this.glyphCanvas.width=1024; this.glyphCanvas.height=1024;
      this.init(); this.updateGlyph(project.glyph);
    }
    compile(type, source) {
      const gl=this.gl, s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;
    }
    init() {
      const gl=this.gl;
      const vs=`#version 300 es
      in vec2 a_pos; out vec2 v_uv;
      void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}`;
      const fs=`#version 300 es
      precision highp float;
      in vec2 v_uv; out vec4 frag;
      uniform vec2 u_res; uniform float u_time; uniform float u_glyphTime; uniform sampler2D u_glyph;
      uniform vec4 u_render; uniform vec4 u_transform; uniform vec4 u_particles; uniform vec4 u_composite; uniform vec4 u_mask; uniform vec4 u_effects; uniform vec4 u_effectExtra; uniform vec4 u_material; uniform vec4 u_field; uniform vec4 u_textAnim; uniform vec4 u_scene; uniform vec3 u_baseColor; uniform vec3 u_lightColor; uniform int u_flags; uniform int u_shapeCount; uniform vec4 u_shapes[8]; uniform vec4 u_shapeMeta[8]; uniform vec4 u_shapeColors[8];
      #define PI 3.14159265359
      float hash(float n){return fract(sin(n*127.1)*43758.5453123);}
      float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1)),f.x),f.y);}
      float sdBox(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
      mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
      float glyph(vec2 uv){return texture(u_glyph,uv).r;}
      float glyphAA(vec2 uv){vec2 b=vec2(u_effects.x/1024.);float g=glyph(uv)*4.+glyph(uv+vec2(b.x,0.))+glyph(uv-vec2(b.x,0.))+glyph(uv+vec2(0.,b.y))+glyph(uv-vec2(0.,b.y));return smoothstep(.13,.62,g/8.);}
      vec3 hueRotate(vec3 c,float a){vec3 axis=normalize(vec3(1.));return c*cos(a)+cross(axis,c)*sin(a)+axis*dot(axis,c)*(1.-cos(a));}
      vec3 firePalette(float x){return mix(vec3(.55,.035,.008),mix(vec3(1.,.16,.02),vec3(1.,.82,.32),smoothstep(.28,1.,x)),smoothstep(0.,.7,x));}
      void main(){
        vec2 uv=v_uv; float aspect=u_res.x/u_res.y; vec2 p=(uv-.5)*vec2(aspect,1.);
        float t=u_time,gt=u_glyphTime; float glyphOn=(u_flags&1)!=0?1.:0.;float hammerOn=(u_flags&2)!=0?1.:0.;float sparkOn=(u_flags&4)!=0?1.:0.;float anvilOn=(u_flags&8)!=0?1.:0.;float bgOn=(u_flags&16)!=0?1.:0.;float blurOn=(u_flags&32)!=0?1.:0.;
        float impact=smoothstep(8.38,8.58,t)*(1.-smoothstep(8.72,9.5,t));
        float hitPulse=exp(-abs(t-8.57)*8.0); float cool=smoothstep(9.8,14.2,gt);
        vec3 col=vec3(.017,.019,.020)*bgOn;
        float ambientTime=min(t,14.0);float radial=max(0.,1.-length(p*vec2(.8,1.4))); col+=u_lightColor*.055*radial*(.7+.3*sin(ambientTime*.5))*u_scene.w;
        float wall=noise(p*3.+vec2(0,ambientTime*.015));col+=vec3(.014,.012,.011)*wall;
        float floorY=-.31; float floorMask=smoothstep(.015,-.015,p.y-floorY);
        float grid=0.; vec2 gp=vec2(p.x/(p.y+1.03),1./(p.y+1.03));
        grid=max(smoothstep(.025,0.,abs(fract(gp.x*5.)-.5)-.475),smoothstep(.025,0.,abs(fract(gp.y*2.+ambientTime*.002)-.5)-.48));
        col=mix(col,vec3(.038,.04,.039)+vec3(.07,.025,.012)*radial,floorMask*.55); col+=grid*floorMask*vec3(.035,.025,.02);
        float anvil=sdBox(p-vec2(0.,-.27),vec2(.37,.055)); anvil=min(anvil,sdBox(p-vec2(0.,-.36),vec2(.23,.06)));
        float anvilM=smoothstep(.012,-.008,anvil)*anvilOn; float edge=smoothstep(.035,0.,abs(anvil));
        col=mix(col,vec3(.045,.052,.055)+edge*vec3(.12,.10,.085),anvilM);
        float shapeMask=0.;vec3 shapeColor=vec3(0.);float hasShape=0.;
        for(int si=0;si<8;si++){if(si>=u_shapeCount)break;vec4 sh=u_shapes[si],meta=u_shapeMeta[si],scol=u_shapeColors[si];float encoded=meta.x,mode=floor(encoded/10.),kind=mod(encoded,10.),local=0.;
          for(int ri=0;ri<12;ri++){if(float(ri)>=meta.z)break;vec2 center=sh.xy+vec2(float(ri)*13./1280.*aspect,-float(ri)*8./720.);vec2 q=p-center;float d=kind>.5&&kind<1.5?(length(q/max(sh.zw,vec2(.001)))-1.)*min(sh.z,sh.w):sdBox(q,sh.zw);float fill=smoothstep(.009,-.009,d);if(meta.w<.999){float border=smoothstep(.012,.0,abs(d));float progress=kind>.5&&kind<1.5?fract(atan(q.y,q.x)/(2.*PI)+1.):clamp(q.x/max(.001,sh.z)*.5+.5,0.,1.);fill=border*(1.-step(meta.w,progress));}local=max(local,fill);}
          if(hasShape<.5){shapeMask=local;shapeColor=scol.rgb;hasShape=1.;}else if(mode>1.5&&mode<2.5)shapeMask*=1.-local;else if(mode>2.5)shapeMask=min(shapeMask,local);else{shapeColor=mix(shapeColor,scol.rgb,local);shapeMask=max(shapeMask,local);}shapeColor=mix(shapeColor,scol.rgb,local*scol.a);}
        col=mix(col,shapeColor,shapeMask*(u_shapeCount>0?u_shapeColors[0].a:0.));
        vec2 charUV=(uv-vec2(.5+u_transform.x,.49+u_transform.y));
        float angle=u_transform.w*.0174533; charUV=rot(-angle)*charUV;
        float camZoom=(mix(.92,1.04,smoothstep(2.8,5.6,t))-smoothstep(6.6,7.9,t)*.08+exp(-abs(t-8.57)*7.)*.045)*clamp(38./u_scene.x,.55,1.8);
        charUV=charUV/(.72*u_transform.z*camZoom)+.5;
        float shock=impact*exp(-length(charUV-vec2(.59,.63))*9.)*(.35+u_render.y)*(.7+u_field.x);
        charUV.y+=shock*.055; charUV.x+=(noise(charUV*10.)-.5)*shock*.025;
        float write=smoothstep(-.12,.0,gt+u_textAnim.z*1.4-(charUV.y*.9+charUV.x*.72)*2.05);
        write*=smoothstep(-.08,.02,gt-((1.-charUV.y)*.33+charUV.x*.95)*1.15);
        float soft=max(.01,u_textAnim.w);float rangeMask=smoothstep(u_textAnim.x-soft,u_textAnim.x,charUV.x)*(1.-smoothstep(u_textAnim.y,u_textAnim.y+soft,charUV.x));float textPhase=1.-smoothstep(4.05,4.35,gt);write*=mix(1.,rangeMask,textPhase);write=clamp(write,0.,1.);
        vec2 mp=(charUV-.5)*vec2(2.05,2.25);float md=u_mask.z<.5?length(mp):u_mask.z<1.5?max(abs(mp.x),abs(mp.y)):max(abs(mp.x)+sin(mp.y*5.)*.13,abs(mp.y)+sin(mp.x*4.)*.09);float mask=u_mask.x>.5?1.-smoothstep(1.-max(.015,u_mask.y),1.,md):1.;if(u_mask.w>.5)mask=1.-mask;float matte=1.;if(u_composite.w>.5){float source=u_shapeCount>0?shapeMask:1.;if(u_composite.w>2.5)source*=dot(shapeColor,vec3(.299,.587,.114));if(mod(u_composite.w,2.)<.5)source=1.-source;matte=source;}mask*=matte;
        float front=glyphAA(charUV)*write*glyphOn*mask*u_material.w*mix(1.,u_scene.z,textPhase);
        float form=smoothstep(2.65,4.1,gt);
        float extrude=form*(u_render.x/110.);
        vec2 exdir=vec2(-.055,.075)*extrude;
        float side=0.; float sideBand=0.;
        for(int i=1;i<18;i++){float f=float(i)/17.;float g=glyphAA(charUV-exdir*f)*write;side=max(side,g);sideBand=max(sideBand,g*(1.-front)*f);}
        side*=glyphOn*mask*u_material.w; float silhouette=max(front,side);
        float heat=(1.-cool)*smoothstep(2.8,5.4,gt); heat=max(heat,hitPulse*.95);
        float textureN=noise(charUV*23.+vec2(ambientTime*.02,0));
        float light=clamp(.25+charUV.y*.75+textureN*.22,0.,1.);
        vec3 metal=mix(vec3(.08,.075,.07),vec3(.52,.47,.38),pow(light,2.));
        metal+=pow(max(0.,sin((charUV.x-charUV.y)*14.)*.5+.5),mix(38.,5.,u_material.x))*.22;metal=mix(metal,metal*u_baseColor*3.,.28);
        vec3 hot=firePalette(clamp(light*.55+textureN*.5+hitPulse,0.,1.));
        vec3 frontCol=mix(hot,metal,cool);frontCol=mix(frontCol,metal,u_render.w*.18); frontCol=mix(frontCol,hot,heat*.74*u_material.y);
        vec3 sideCol=mix(vec3(.16,.035,.015),vec3(.19,.17,.145),cool)*(.55+sideBand*.45);
        col=mix(col,sideCol,side*(1.-front)); col=mix(col,frontCol,front);
        float bevelScale=1.+u_effectExtra.y*2.;float rim=max(0.,glyphAA(charUV+vec2(.003,-.004)*bevelScale)-glyphAA(charUV-vec2(.005,.006)*bevelScale));
        col+=rim*mix(vec3(1.,.32,.05),vec3(.8,.75,.65),cool)*(.6+heat*u_material.y);
        float glow=0.; for(int j=0;j<8;j++){float a=float(j)*PI*.25;glow+=glyphAA(charUV+vec2(cos(a),sin(a))*(.004+.018*u_effectExtra.x)*(1.+heat*2.));}
        glow=clamp(glow/8.-front*.65,0.,1.); col+=glow*vec3(1.,.12,.012)*heat*u_render.z;
        float crack=0.; if(t>8.5){vec2 cp=(charUV-vec2(.58,.62))*vec2(1.,1.3);float a=atan(cp.y,cp.x);float ray=abs(sin(a*5.5+noise(vec2(length(cp)*20.,a))*2.));crack=smoothstep(.12,.0,ray)*smoothstep(.32,.04,length(cp))*front;}
        col+=crack*mix(vec3(1.,.18,.01),vec3(.16,.2,.22),cool)*hitPulse;
        if(t>8.38&&t<12.8){
          float age=t-8.52;
          for(int i=0;i<56;i++){float fi=float(i);if(fi>=u_particles.x)continue;float h=hash(fi+24.);float a=mix(.15,2.98,hash(fi*2.7))*mix(1.,-1.,step(.78,hash(fi*7.)));float sp=mix(.17,.72,hash(fi*4.3))*u_particles.y;float pa=max(0.,age-h*.22);vec2 origin=vec2(.06+u_transform.x*aspect,-.02+u_transform.y);vec2 vel=vec2(cos(a),abs(sin(a)))*sp;float drag=max(.2,1.-u_particles.w*pa);vec2 pos=origin+vel*pa*drag+vec2(0.,-.52)*pa*pa;float collided=step(pos.y,floorY);pos.y=mix(pos.y,floorY+(floorY-pos.y)*.42,collided);float d=length(p-pos);float life=smoothstep(2.5*u_particles.z,.0,pa);float spark=smoothstep(.015,.0,d)*life;float trail=smoothstep(.009,0.,abs(dot(p-pos,normalize(vel+vec2(.001)))))*smoothstep(.07,0.,length((p-pos)-normalize(vel)*clamp(dot(p-pos,normalize(vel)),-.08,0.)))*life;col+=mix(firePalette(h),vec3(1.,.62,.16),collided)*max(spark,trail*.5)*(1.4+hitPulse)*sparkOn;}
        }
        float showHammer=smoothstep(6.05,6.5,t)*(1.-smoothstep(9.35,10.15,t));
        float prep=smoothstep(6.2,7.45,t); float drop=smoothstep(8.0,8.56,t); float rebound=smoothstep(8.58,9.22,t);
        float hy=mix(.61,.78,prep)-drop*.59+rebound*.26+u_transform.y; float hx=.20+u_transform.x*aspect; float ha=mix(-.55,-.18,prep)+drop*.31-rebound*.14;
        vec2 hp=rot(-ha)*(p-vec2(hx,hy));
        float head=sdBox(hp,vec2(.22,.09));float neck=sdBox(hp-vec2(.0,.16),vec2(.045,.13));float handle=sdBox(hp-vec2(.0,.39),vec2(.025,.25));float ham=min(head,min(neck,handle));float hm=smoothstep(.012,-.005,ham)*showHammer*hammerOn;float smear=smoothstep(.045,-.01,sdBox(hp+vec2(0.,.07),vec2(.22,.11)))*hitPulse*.28*blurOn*hammerOn;hm=max(hm,smear);
        float hEdge=smoothstep(.022,0.,abs(ham));vec3 hc=mix(vec3(.10,.11,.11),vec3(.48,.44,.37),hEdge);hc+=vec3(.45,.13,.03)*hitPulse*hEdge;col=mix(col,hc,hm);
        float smoke=0.;for(int k=0;k<5;k++){float fk=float(k);vec2 sp=vec2(sin(t*.22+fk)*.12,-.02+mod(t*.045+fk*.18,.8));float sn=noise((p-sp)*vec2(3.,6.)+fk);smoke+=smoothstep(.65,.2,length((p-sp)*vec2(.7,1.4)))*smoothstep(.42,.7,sn);}
        col=mix(col,col+vec3(.025,.018,.014),smoke*.13*(1.-cool));
        if(u_composite.z>.5&&u_composite.z<1.5)col*=1.18;else if(u_composite.z<2.5&&u_composite.z>1.5)col=1.-(1.-col)*(1.-col*.55);else if(u_composite.z>2.5&&u_composite.z<3.5)col*=col*.9+.12;else if(u_composite.z>3.5)col=mix(2.*col*col,1.-2.*(1.-col)*(1.-col),step(.5,col));
        col=hueRotate(col,u_effects.y);float lum=dot(col,vec3(.299,.587,.114));col=mix(vec3(lum),col,u_effects.z)*u_effects.w;
        float vign=smoothstep(1.05,.28,length(p*vec2(.72,1.05))); col*=mix(.38,1.,vign);
        col*=1.+hitPulse*.14; col=col/(col+vec3(1.)); col=pow(col,vec3(.88));
        frag=vec4(col,1.);
      }`;
      this.program=gl.createProgram(); gl.attachShader(this.program,this.compile(gl.VERTEX_SHADER,vs)); gl.attachShader(this.program,this.compile(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      const vao=gl.createVertexArray(); gl.bindVertexArray(vao); const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const loc=gl.getAttribLocation(this.program,'a_pos');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      this.uniforms={res:gl.getUniformLocation(this.program,'u_res'),time:gl.getUniformLocation(this.program,'u_time'),glyphTime:gl.getUniformLocation(this.program,'u_glyphTime'),render:gl.getUniformLocation(this.program,'u_render'),transform:gl.getUniformLocation(this.program,'u_transform'),particles:gl.getUniformLocation(this.program,'u_particles'),composite:gl.getUniformLocation(this.program,'u_composite'),mask:gl.getUniformLocation(this.program,'u_mask'),effects:gl.getUniformLocation(this.program,'u_effects'),effectExtra:gl.getUniformLocation(this.program,'u_effectExtra'),material:gl.getUniformLocation(this.program,'u_material'),field:gl.getUniformLocation(this.program,'u_field'),textAnim:gl.getUniformLocation(this.program,'u_textAnim'),scene:gl.getUniformLocation(this.program,'u_scene'),baseColor:gl.getUniformLocation(this.program,'u_baseColor'),lightColor:gl.getUniformLocation(this.program,'u_lightColor'),shapeCount:gl.getUniformLocation(this.program,'u_shapeCount'),shapes:gl.getUniformLocation(this.program,'u_shapes[0]'),shapeMeta:gl.getUniformLocation(this.program,'u_shapeMeta[0]'),shapeColors:gl.getUniformLocation(this.program,'u_shapeColors[0]'),flags:gl.getUniformLocation(this.program,'u_flags')};
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    }
    updateGlyph(char) {
      if(!this.gl)return;const c=this.glyphCanvas,ctx=c.getContext('2d'),style=project.textStyle||{fontSize:720,lineHeight:1.08,tracking:0,align:'center'},lines=String(char||'铸').split(/\r?\n/).slice(0,4),maxChars=Math.max(...lines.map(x=>[...x].length),1),size=Math.min(style.fontSize,820/Math.max(1,maxChars*.86),800/Math.max(1,lines.length*style.lineHeight));ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`900 ${size}px "Microsoft YaHei","SimHei",sans-serif`;const lineStep=size*style.lineHeight,startY=512-(lines.length-1)*lineStep/2;lines.forEach((line,li)=>{const chars=[...line],width=chars.reduce((sum,ch)=>sum+ctx.measureText(ch).width,0)+Math.max(0,chars.length-1)*style.tracking;let x=style.align==='left'?92:style.align==='right'?932-width:512-width/2;chars.forEach(ch=>{ctx.fillText(ch,x,startY+li*lineStep);x+=ctx.measureText(ch).width+style.tracking})});
      const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    }
    resize() {
      if(!this.gl)return;const rect=this.canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);const w=Math.min(3840,Math.max(2,Math.round(rect.width*dpr))),h=Math.min(2160,Math.max(2,Math.round(rect.height*dpr)));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;$('#overlayCanvas').width=w;$('#overlayCanvas').height=h;}$('#resolutionStat').textContent=`${w} × ${h}`;
    }
    render(t) {
      if(!this.gl)return;this.resize();const gl=this.gl,graph=evaluateNodeGraph(),solid=graph.geometry,particleStream=graph.particles,glyphLayer=project.layers.find(l=>l.id==='glyph3d'),glyphTime=remapLayerTime(glyphLayer,t),sampledTransform=glyphTransformAt(t),gradeLayer=project.layers.find(l=>l.id==='grade'),gradeActive=project.effects.grade&&gradeLayer?.visible&&t>=gradeLayer.in&&t<=gradeLayer.out;project.expressionError=null;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.res,this.canvas.width,this.canvas.height);gl.uniform1f(this.uniforms.time,t);gl.uniform1f(this.uniforms.glyphTime,glyphTime);
      gl.uniform4f(this.uniforms.render,solid?.depth||0,solid?.deform||0,project.effects.glow?project.render.glow:0,solid?.material?.metal??project.render.metal);
      gl.uniform4f(this.uniforms.particles,particleStream?.rate||0,particleStream?.speed||0,particleStream?.life||0,particleStream?.drag||0);
      const blendIndex=['正常','相加','滤色','正片叠底','叠加'].indexOf(project.composite.blend),matteIndex=['无','Alpha','Alpha 反转','亮度','亮度反转'].indexOf(project.composite.matte),maskType=project.composite.maskType==='矩形'?1:project.composite.maskType==='自由路径'?2:0;
      gl.uniform4f(this.uniforms.composite,0,0,Math.max(0,blendIndex),Math.max(0,matteIndex));
      gl.uniform4f(this.uniforms.mask,project.composite.maskEnabled?1:0,project.composite.maskFeather/200,maskType,project.composite.maskInvert?1:0);
      gl.uniform4f(this.uniforms.effects,project.effects.blur?project.effects.blurAmount:0,gradeActive?project.effects.hue*Math.PI/180:0,gradeActive?project.effects.saturation:1,gradeActive?project.effects.brightness:1);
      gl.uniform4f(this.uniforms.effectExtra,project.effects.glowRadius/80,project.render.bevel/24,0,0);
      gl.uniform4f(this.uniforms.material,project.render.roughness,project.render.emission,project.render.bevel/24,sampledTransform.opacity/100);
      gl.uniform4f(this.uniforms.field,solid?.deform||0,project.field.falloff,project.field.noise,project.field.vortex);
      gl.uniform4f(this.uniforms.textAnim,project.textAnimator.start,project.textAnimator.end,project.textAnimator.offset,project.textAnimator.softness);
      gl.uniform4f(this.uniforms.scene,project.camera.fov,project.camera.focus,project.textAnimator.opacity,project.light.intensity);
      const rgb=hexRgb(project.render.baseColor||'#5a3026');gl.uniform3f(this.uniforms.baseColor,rgb[0],rgb[1],rgb[2]);
      const lightRgb=hexRgb(project.light.color||'#ff9b54');gl.uniform3f(this.uniforms.lightColor,lightRgb[0],lightRgb[1],lightRgb[2]);
      const shapeLayers=project.layers.filter(l=>l.visible&&l.shape&&t>=l.in&&t<=l.out).slice().reverse().slice(0,8),shapeData=new Float32Array(32),shapeMeta=new Float32Array(32),shapeColors=new Float32Array(32),aspect=this.canvas.width/this.canvas.height;
      shapeLayers.forEach((l,i)=>{const s=l.shape,base=i*4,cx=(s.x+s.w/2)/1280-.5,cy=.5-(s.y+s.h/2)/720,kind=s.morph==='椭圆轮廓'||s.kind==='ellipse'?1:s.kind==='bezier'?2:0,mode={'无':0,'并集':1,'差集':2,'交集':3}[s.boolean]||0,color=hexRgb(l.color||'#ef7b50');shapeData.set([cx*aspect,cy,Math.abs(s.w/2)/1280*aspect,Math.abs(s.h/2)/720],base);shapeMeta.set([mode*10+kind,0,clamp(s.repeat||1,1,12),clamp(s.trim??1,0,1)],base);shapeColors.set([color[0],color[1],color[2],s.opacity??.78],base)});
      gl.uniform1i(this.uniforms.shapeCount,shapeLayers.length);gl.uniform4fv(this.uniforms.shapes,shapeData);gl.uniform4fv(this.uniforms.shapeMeta,shapeMeta);gl.uniform4fv(this.uniforms.shapeColors,shapeColors);
      const pos=sampledTransform.position,sc=sampledTransform.scale,rotY=sampledTransform.rotation[1],rotationTrack=propertyTrack(glyphLayer,'rotationY');
      let exprRot=project.expressionEnabled?evaluateExpression(project.expression,rotY,t,{layer:glyphLayer,field:'rotationY',track:rotationTrack,stack:['glyph3d:rotationY'],valueAtTime:at=>animatedProperty(glyphLayer,'rotationY',at)}):rotY;if(t>13.5)exprRot=lerp(exprRot,rotY,smooth(13.5,14.15,t));
      gl.uniform4f(this.uniforms.transform,(pos[0]-960)/1920,(540-pos[1])/1080,sc[0]/100,exprRot);
      const visible=id=>{const l=project.layers.find(x=>x.id===id);return !!l&&l.visible!==false&&t>=l.in&&t<=l.out};
      const flags=(solid&&(visible('glyph3d')||visible('strokes'))?1:0)|(visible('hammer')?2:0)|(particleStream&&visible('sparks')?4:0)|(visible('anvil')?8:0)|(visible('bg')?16:0)|(project.motionBlur?32:0);
      gl.uniform1i(this.uniforms.flags,flags);gl.drawArrays(gl.TRIANGLES,0,6);
    }
  }

  const renderer = new ForgeRenderer($('#glCanvas'));
  const overlay = $('#overlayCanvas').getContext('2d');

  function vectorPath(ctx,s,dx=0,dy=0){const kind=s.morph==='椭圆轮廓'?'ellipse':s.kind;ctx.beginPath();if(kind==='ellipse')ctx.ellipse(s.x+s.w/2+dx,s.y+s.h/2+dy,Math.abs(s.w/2),Math.abs(s.h/2),0,0,Math.PI*2);else if(kind==='bezier'){ctx.moveTo(s.x+dx,s.y+s.h+dy);ctx.bezierCurveTo(s.x+s.w*.2+dx,s.y-s.h*.25+dy,s.x+s.w*.75+dx,s.y+s.h*1.2+dy,s.x+s.w+dx,s.y+dy)}else ctx.rect(s.x+dx,s.y+dy,s.w,s.h)}
  function drawVectorLayer(l){const s=l.shape,repeat=clamp(s.repeat||1,1,12),trim=clamp(s.trim??1,0,1);overlay.save();overlay.globalAlpha=s.opacity??.9;overlay.fillStyle=s.fill||'rgba(255,91,36,.35)';overlay.strokeStyle=s.stroke||'#ff8d65';overlay.lineWidth=s.strokeWidth||2;if(s.boolean==='差集')overlay.globalCompositeOperation='destination-out';for(let i=repeat-1;i>=0;i--){vectorPath(overlay,s,i*13,i*8);if(trim>=.999)overlay.fill();else{const perimeter=Math.max(40,2*(Math.abs(s.w)+Math.abs(s.h)));overlay.setLineDash([perimeter*trim,perimeter]);overlay.lineDashOffset=-perimeter*(s.trimOffset||0)}overlay.stroke()}overlay.restore()}

  function drawOverlay() {
    const c=$('#overlayCanvas'),w=c.width,h=c.height;overlay.clearRect(0,0,w,h);const sx=w/1280,sy=h/720;overlay.save();overlay.scale(sx,sy);
    if(project.grid){overlay.strokeStyle='rgba(130,145,150,.11)';overlay.lineWidth=.6;for(let x=80;x<1280;x+=80){overlay.beginPath();overlay.moveTo(x,0);overlay.lineTo(x,720);overlay.stroke()}for(let y=45;y<720;y+=45){overlay.beginPath();overlay.moveTo(0,y);overlay.lineTo(1280,y);overlay.stroke()}}
    if(project.guides){
      overlay.setLineDash([5,5]);overlay.strokeStyle='rgba(98,190,196,.3)';overlay.strokeRect(120,68,1040,584);overlay.setLineDash([]);
      const sel=project.layers.find(l=>l.id===project.selectedLayer);if(sel?.shape){const s=sel.shape;overlay.strokeStyle='rgba(255,123,75,.9)';overlay.strokeRect(s.x-5,s.y-5,s.w+10,s.h+10);[[s.x-5,s.y-5],[s.x+s.w+5,s.y-5],[s.x-5,s.y+s.h+5],[s.x+s.w+5,s.y+s.h+5]].forEach(([x,y])=>{overlay.fillStyle='#111';overlay.fillRect(x-4,y-4,8,8);overlay.strokeStyle='#ff7445';overlay.strokeRect(x-4,y-4,8,8)})}else if(sel&&['geometry','text','particle'].includes(sel.type)){
        const sampled=glyphTransformAt(project.currentTime),cx=640+(sampled.position[0]-960)*.5,cy=354+(sampled.position[1]-540)*.5;
        overlay.strokeStyle='rgba(255,123,75,.8)';overlay.lineWidth=1;overlay.strokeRect(cx-205,cy-215,410,415);
        [[cx-205,cy-215],[cx+205,cy-215],[cx-205,cy+200],[cx+205,cy+200]].forEach(([x,y])=>{overlay.fillStyle='#111';overlay.fillRect(x-4,y-4,8,8);overlay.strokeStyle='#ff7445';overlay.strokeRect(x-4,y-4,8,8)});
        overlay.strokeStyle='rgba(255,121,65,.42)';overlay.beginPath();overlay.moveTo(cx-90,cy+120);overlay.bezierCurveTo(cx-170,cy-20,cx+140,cy-150,cx+110,cy-230);overlay.stroke();
        [[cx-90,cy+120],[cx+20,cy-55],[cx+110,cy-230]].forEach(([x,y],i)=>{overlay.fillStyle=i===1?'#ff7445':'#111';overlay.beginPath();overlay.arc(x,y,4,0,Math.PI*2);overlay.fill();overlay.strokeStyle='#ff7445';overlay.stroke()});
      }
      const t=project.currentTime;if(t>6.6&&t<12.6){overlay.strokeStyle='rgba(77,200,207,.34)';overlay.setLineDash([3,5]);overlay.beginPath();overlay.arc(690,398,55+Math.sin(t)*4,0,Math.PI*2);overlay.stroke();overlay.setLineDash([]);overlay.fillStyle='rgba(77,200,207,.8)';overlay.fillText('旋涡场 320 px',752,408)}
      if(project.composite.maskEnabled){overlay.save();overlay.strokeStyle='rgba(144,214,161,.72)';overlay.setLineDash([4,4]);overlay.beginPath();overlay.ellipse(640,355,360,300,0,0,Math.PI*2);overlay.stroke();overlay.restore()}
      overlay.fillStyle='rgba(244,188,85,.85)';overlay.beginPath();overlay.arc(345,126,5,0,Math.PI*2);overlay.fill();overlay.strokeStyle='rgba(244,188,85,.38)';overlay.beginPath();overlay.moveTo(345,126);overlay.lineTo(515,270);overlay.stroke();
    }
    overlay.restore();
  }

  function renderAll() {
    renderer.render(project.currentTime); drawOverlay(); updateTimeUI(); if(ui.activeLower==='curve') drawCurve();
  }
  function updateTimeUI() {
    const pct=clamp(project.currentTime/DURATION*100,0,100);$('#playhead').style.left=`${pct}%`;$('#timeDisplay').textContent=formatTime(project.currentTime);$('#frameDisplay').textContent=`${String(Math.round(project.currentTime*FPS)).padStart(4,'0')}f`;
    const phase=phaseAt(project.currentTime),glyphLayer=project.layers.find(l=>l.id==='glyph3d'),exprLayer=expressionLayer()||glyphLayer,base=animatedProperty(exprLayer,'rotationY',project.currentTime),expr=layerExpression(exprLayer),enabled=exprLayer.id==='glyph3d'?project.expressionEnabled:exprLayer.expressionEnabled!==false,value=enabled?evaluateExpression(expr,base,project.currentTime,{layer:exprLayer,field:'rotationY',track:propertyTrack(exprLayer,'rotationY'),stack:[`${exprLayer.id}:rotationY`],valueAtTime:t=>animatedProperty(exprLayer,'rotationY',t)}):base;$('#phaseLabel').textContent=phase[0];$('#stageLabel').textContent=`主合成 · ${phase[1]}`;$('#playBtn').textContent=project.playing?'Ⅱ':'▶';const exprOut=$('#expressionStatus b');if(exprOut)exprOut.textContent=value.toFixed(1)+'°';const status=$('#expressionStatus span');if(status&&project.expressionError){status.textContent=project.expressionError+' · 已退回关键帧值';$('#expressionStatus i').style.background='#f05d4f'}const selected=selectedLayer();if(selected&&!document.activeElement?.matches?.('[data-field]'))syncTransformInputs(layerTransformAt(selected.id==='strokes'?glyphLayer:selected,project.currentTime));
  }

  function renderRuler() {
    const r=$('#ruler');r.innerHTML='';for(let i=0;i<=15;i++){const s=document.createElement('span');s.className='tick-label';s.style.left=`${i/15*100}%`;s.textContent=i%2===0?`${String(i).padStart(2,'0')}s`:'';r.appendChild(s)}
  }
  function renderLayerRows() {
    const list=$('#layerList');list.innerHTML='';project.layers.forEach((l,i)=>{const row=document.createElement('div');row.className='layer-row'+(l.id===project.selectedLayer?' selected':'');row.dataset.id=l.id;row.style.setProperty('--layer-color',l.color);row.innerHTML=`<i class="layer-color"></i><button class="visibility" title="显示/隐藏">${l.visible?'●':'○'}</button><button class="solo" title="独奏">◌</button><button class="layer-name" title="${escapeHtml(l.name)}"><span>${l.icon}</span>${escapeHtml(l.name)}</button><button class="shy" title="运动模糊">${['geometry','particle','text'].includes(l.type)?'◒':''}</button><button class="lock" title="锁定">${l.locked?'▣':'▢'}</button><button class="more">⋮</button>`;list.appendChild(row)});
    bindLayerEvents();
  }
  function renderTimeline() {
    const tracks=$('#tracks');tracks.innerHTML='';project.layers.forEach(l=>{const tr=document.createElement('div');tr.className='track-row';tr.dataset.id=l.id;tr.style.setProperty('--layer-color',l.color);tr.innerHTML=`<div class="layer-bar" style="left:${l.in/DURATION*100}%;right:${(DURATION-l.out)/DURATION*100}%"></div>`;l.keys.forEach((k,ki)=>{const key=document.createElement('button');key.className='keyframe'+(ui.selectedKeys.has(`${l.id}:${ki}`)?' selected':'');key.style.left=`${k/DURATION*100}%`;key.dataset.time=k;key.dataset.key=`${l.id}:${ki}`;key.title=`${l.name} · ${k.toFixed(2)}s`;tr.appendChild(key)});tracks.appendChild(tr)});
    [['写成',0],['成块',3.6],['锻打',6.8],['冲击',8.55],['冷却',10.3]].forEach(([name,t])=>{const m=document.createElement('div');m.className='marker';m.style.left=`${t/DURATION*100}%`;m.innerHTML=`<span>${name}</span>`;tracks.appendChild(m)});
    $$('.keyframe',tracks).forEach(k=>{k.addEventListener('click',e=>{e.stopPropagation();if(k.dataset.dragged==='1'){k.dataset.dragged='0';return}if(!e.shiftKey)ui.selectedKeys.clear();ui.selectedKeys.add(k.dataset.key);setTime(+k.dataset.time);renderTimeline()});k.addEventListener('pointerdown',e=>{e.stopPropagation();const [id,indexText]=k.dataset.key.split(':'),layer=project.layers.find(l=>l.id===id),index=+indexText,startX=e.clientX,startTime=layer.keys[index],width=tracks.getBoundingClientRect().width,tracksForLayer=layer.tracks||project.propertyTracks[layer.id]||{},linked=Object.values(tracksForLayer).flat().filter(key=>Math.abs(key.time-startTime)<.5/FPS);snapshot('移动关键帧');const move=ev=>{if(Math.abs(ev.clientX-startX)>2)k.dataset.dragged='1';let t=startTime+(ev.clientX-startX)/width*DURATION;if(project.snap)t=Math.round(t*FPS)/FPS;t=clamp(t,layer.in,layer.out);layer.keys[index]=t;linked.forEach(key=>key.time=t);k.style.left=`${t/DURATION*100}%`;setTime(t,true)};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);layer.keys.sort((a,b)=>a-b);Object.values(tracksForLayer).forEach(track=>track.sort((a,b)=>a.time-b.time));renderTimeline()};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)})});
    $$('.keyframe',tracks).forEach(k=>k.addEventListener('contextmenu',e=>{e.preventDefault();showKeyMenu(e.clientX,e.clientY,k.dataset.key)}));
  }
  function bindLayerEvents() {
    $$('.layer-row').forEach(row=>{
      row.addEventListener('click',e=>{if(e.target.closest('.visibility,.lock,.more'))return;project.selectedLayer=row.dataset.id;renderLayerRows();updateInspector();drawOverlay()});
      $('.visibility',row).addEventListener('click',()=>{const l=project.layers.find(x=>x.id===row.dataset.id);snapshot('切换图层可见性');l.visible=!l.visible;renderLayerRows();renderAll()});
      $('.lock',row).addEventListener('click',()=>{const l=project.layers.find(x=>x.id===row.dataset.id);l.locked=!l.locked;renderLayerRows()});
      $('.more',row).addEventListener('click',e=>showLayerMenu(e.clientX,e.clientY,row.dataset.id));
    });
  }

  function selectedLayer(){return project.layers.find(l=>l.id===project.selectedLayer)}
  function expressionLayer(){const l=selectedLayer();return l?.id==='strokes'?project.layers.find(x=>x.id==='glyph3d'):l}
  function layerExpression(layer){return layer?.id==='glyph3d'?project.expression:(layer?.expressions?.rotationY||'value')}
  function updateInspector(){const l=selectedLayer();if(!l)return;$('#selectedLayerName').textContent=l.name;$('#selectedTypeIcon').textContent=l.icon;$('#selectionCount').textContent='1 个图层';$('#particleSection').style.display=l.type==='particle'?'block':'none';$('#textAnimatorSection').style.display=l.type==='text'?'block':'none';$('#shapeOpsSection').style.display=l.shape?'block':'none';$('#sceneSection').style.display=['camera','light'].includes(l.type)?'block':'none';$('#precompSection').style.display=l.type==='precomp'?'block':'none';$('#audioSection').style.display=l.type==='audio'?'block':'none';$('#parentSelect').value=l.parent||'无';$('#blendMode').value=l.blend||project.composite.blend;$('#trackMatte').value=l.matte||'无';$('#editTextBtn').textContent=`编辑「${project.glyph}」并重建轮廓`;if(l.shape){$('#trimRange').value=(l.shape.trim??1)*100;$('#trimOutput').textContent=Math.round((l.shape.trim??1)*100)+'%';$('#repeatRange').value=l.shape.repeat||1;$('#repeatOutput').textContent=l.shape.repeat||1;$('#booleanMode').value=l.shape.boolean||'无';$('#morphTarget').value=l.shape.morph||'无'}if(l.type==='precomp'){const tm=l.timeRemap||={speed:1,start:0,reverse:false,freeze:false,blur:true};$('#timeSpeed').value=tm.speed*100;$('#timeSpeedOutput').textContent=Math.round(tm.speed*100)+'%';$('#precompStart').value=tm.start.toFixed(2);$('#reverseTime').checked=tm.reverse;$('#freezeTime').checked=tm.freeze;$('#precompBlur').checked=tm.blur}const exprLayer=expressionLayer();$('#expressionInput').value=layerExpression(exprLayer);const enabled=exprLayer?.id==='glyph3d'?project.expressionEnabled:exprLayer?.expressionEnabled!==false;$('#expressionEnable').classList.toggle('active',enabled);$('#expressionEnable').textContent=enabled?'已启用':'已禁用';syncTransformInputs(layerTransformAt(l.id==='strokes'?project.layers.find(x=>x.id==='glyph3d'):l,project.currentTime))}

  function setTime(t, silent=false){project.currentTime=clamp(t,0,DURATION);renderAll();if(!silent&&project.playing) audio.check(project.currentTime);}
  let lastFrame=0;
  function tick(now){if(project.playing&&!project.exportMode){if(!lastFrame)lastFrame=now;const dt=Math.min(.06,(now-lastFrame)/1000);lastFrame=now;let next=project.currentTime+dt;if(next>=project.workArea[1]){if(project.loop){next=project.workArea[0];audio.reset()}else{next=project.workArea[1];pause()}}setTime(next)}else lastFrame=now;requestAnimationFrame(tick)}
  function play(){if(project.exportMode)return;project.playing=true;audio.start();updateTimeUI()}
  function pause(){project.playing=false;audio.stop();updateTimeUI()}
  function togglePlay(){project.playing?pause():play()}

  class AudioEngine{
    constructor(){this.ctx=null;this.last=-1;this.master=null}
    ensure(){if(!this.ctx){this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=project.audioSettings.volume*.23;this.master.connect(this.ctx.destination)}if(this.ctx.state==='suspended')this.ctx.resume()}
    tone(freq,dur=.12,type='sine',gain=.18,when=0){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.ctx.currentTime+when);g.gain.setValueAtTime(gain,this.ctx.currentTime+when);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+when+dur);o.connect(g).connect(this.master);o.start(this.ctx.currentTime+when);o.stop(this.ctx.currentTime+when+dur+.02)}
    noise(dur=.35,gain=.4){if(!this.ctx)return;const n=Math.floor(this.ctx.sampleRate*dur),b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=b;f.type='bandpass';f.frequency.value=1250;f.Q.value=.8;g.gain.value=gain;s.connect(f).connect(g).connect(this.master);s.start()}
    start(){this.ensure();this.last=project.currentTime-.05;this.tone(project.audioSettings.baseTone,.4,project.audioSettings.waveform,.13)}stop(){this.last=-1}reset(){this.last=-1}
    check(t){if(this.last<0){this.last=t;return}const events=[[.45,110],[1.4,146],[2.4,164],[3.6,82],[5.1,98],[6.8,62],[8.55,44],[10.4,73],[12.2,82],[14.2,55]],ratio=project.audioSettings.baseTone/55;events.forEach(([at,f])=>{if(this.last<at&&t>=at){this.ensure();this.tone(f*ratio,at===8.55?.8:.28,at===8.55?'sawtooth':project.audioSettings.waveform,at===8.55?.5:.18);if(at===8.55)this.noise(.6,.7)}});this.last=t}
  }
  const audio=new AudioEngine();

  function drawCurve(){const c=$('#curveCanvas'),rect=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);c.width=Math.max(2,rect.width*dpr);c.height=Math.max(2,rect.height*dpr);const x=c.getContext('2d');x.scale(dpr,dpr);const w=rect.width,h=rect.height;x.fillStyle='#0d1012';x.fillRect(0,0,w,h);x.strokeStyle='#22292d';x.lineWidth=1;for(let i=0;i<=15;i++){let px=i/15*w;x.beginPath();x.moveTo(px,0);x.lineTo(px,h);x.stroke();if(i%2===0){x.fillStyle='#566168';x.font='9px Consolas';x.fillText(i+'s',px+3,11)}}for(let j=1;j<6;j++){let py=j/6*h;x.beginPath();x.moveTo(0,py);x.lineTo(w,py);x.stroke()}
    const mode=$('.curve-prop.active')?.dataset.curve||'speed',glyphLayer=project.layers.find(l=>l.id==='glyph3d'),hasPositionTrack=['positionX','positionY'].some(k=>propertyTrack(glyphLayer,k).length>1);const value=t=>{if(mode==='speed'){if(hasPositionTrack){const a=glyphTransformAt(clamp(t-.01,0,DURATION)).position,b=glyphTransformAt(clamp(t+.01,0,DURATION)).position;return clamp(Math.hypot(b[0]-a[0],b[1]-a[1])/20,0,1)}return Math.exp(-Math.pow((t-8.35)*2.4,2))*.85+Math.exp(-Math.pow((t-3.3)*.8,2))*.18+Math.sin(t*2)*.015}if(mode==='glow')return .3+smooth(3,6,t)*.55-smooth(9.5,14,t)*.65+Math.exp(-Math.pow((t-8.55)*6,2))*.55;const base=animatedProperty(glyphLayer,'rotationY',t),final=$('#expressionCurve').checked?evaluateExpression(project.expression,base,t,{layer:glyphLayer,field:'rotationY',track:propertyTrack(glyphLayer,'rotationY'),stack:['glyph3d:rotationY'],valueAtTime:at=>animatedProperty(glyphLayer,'rotationY',at)}):base;return clamp((final+90)/180,0,1)};
    x.strokeStyle=mode==='speed'?'#ff743f':mode==='glow'?'#ffb23e':'#69c6cf';x.lineWidth=2;x.beginPath();for(let px=0;px<w;px++){const t=px/w*15,py=h-22-clamp(value(t),0,1)*(h-42);px?x.lineTo(px,py):x.moveTo(px,py)}x.stroke();
    [0,3.6,6.8,8.55,10.3,14.2].forEach(t=>{const px=t/15*w,py=h-22-clamp(value(t),0,1)*(h-42);x.save();x.translate(px,py);x.rotate(Math.PI/4);x.fillStyle=t===8.55?'#ff9a52':'#d3b4a6';x.fillRect(-4,-4,8,8);x.restore();if(t===8.55){x.strokeStyle='rgba(255,116,63,.4)';x.beginPath();x.moveTo(px,0);x.lineTo(px,h);x.stroke()}});const phx=project.currentTime/15*w;x.strokeStyle='#ff5b24';x.beginPath();x.moveTo(phx,0);x.lineTo(phx,h);x.stroke();
  }
  function smooth(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)}

  function renderNodes(){const board=$('#nodeBoard'),svg=$('#nodeWires'),graph=evaluateNodeGraph();$$('.node-card',board).forEach(n=>n.remove());project.nodes.forEach(n=>{const el=document.createElement('div');el.className='node-card'+(n.id===ui.selectedNode?' selected':'')+(n.grouped?' grouped':'');el.dataset.id=n.id;el.style.left=n.x+'px';el.style.top=n.y+'px';el.style.setProperty('--node-color',n.color);el.innerHTML=`<header><i></i><b>${escapeHtml(n.title)}</b><span>⋮</span></header><div class="node-body">${n.ports.map((p,pi)=>`<div class="node-port ${p[2]==='out'?'output':''} ${ui.pendingPort?.node===n.id&&ui.pendingPort?.index===pi?'pending':''}" data-kind="${p[1]}" data-dir="${p[2]}" data-index="${pi}">${p[2]==='out'?escapeHtml(p[0]):`<span class="port-dot" style="--port-color:${portColor(p[1])}"></span>${escapeHtml(p[0])}`}${p[2]==='out'?`<span class="port-dot" style="--port-color:${portColor(p[1])}"></span>`:''}</div>`).join('')}</div><footer>${escapeHtml(n.footer)}</footer>`;board.appendChild(el);bindNodeDrag(el,n);$$('.node-port',el).forEach(port=>port.addEventListener('click',e=>handlePortClick(e,n,port)))});const status=$('#nodeStatus');if(status){status.textContent=project.graphStatus.ok?`几何流 · ${project.graphStatus.evaluated} 个节点已求值 · ${graph.geometry?'实体有效':'实体断开'} · ${graph.particles?'粒子有效':'粒子断开'}`:project.graphStatus.errors[0];status.classList.toggle('error',!project.graphStatus.ok)}requestAnimationFrame(drawWires)}
  function portColor(k){return {geometry:'#b56ce2',field:'#55c3ca',scalar:'#e6ae49',color:'#e36c56',particle:'#f29a37'}[k]||'#89949a'}
  function drawWires(){const svg=$('#nodeWires'),board=$('#nodeBoard').getBoundingClientRect();svg.innerHTML='';project.connections.forEach(([a,b,k])=>{const aa=$(`.node-card[data-id="${a}"]`),bb=$(`.node-card[data-id="${b}"]`);if(!aa||!bb)return;const ar=aa.getBoundingClientRect(),br=bb.getBoundingClientRect();const x1=ar.right-board.left-5,y1=ar.top-board.top+ar.height*.58,x2=br.left-board.left+5,y2=br.top-board.top+br.height*.45;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M${x1},${y1} C${x1+55},${y1} ${x2-55},${y2} ${x2},${y2}`);path.setAttribute('class','node-wire');path.setAttribute('stroke',portColor(k));svg.appendChild(path)})}
  function bindNodeDrag(el,node){let start=null;el.querySelector('header').addEventListener('pointerdown',e=>{ui.selectedNode=node.id;snapshot('移动程序节点');start={x:e.clientX,y:e.clientY,nx:node.x,ny:node.y};el.setPointerCapture(e.pointerId);$$('.node-card').forEach(x=>x.classList.toggle('selected',x===el))});el.addEventListener('pointermove',e=>{if(!start)return;node.x=start.nx+e.clientX-start.x;node.y=start.ny+e.clientY-start.y;el.style.left=node.x+'px';el.style.top=node.y+'px';drawWires()});el.addEventListener('pointerup',()=>start=null)}
  function handlePortClick(e,node,port){e.stopPropagation();const dir=port.dataset.dir,kind=port.dataset.kind,index=+port.dataset.index;if(e.altKey){snapshot('断开程序节点');project.connections=project.connections.filter(c=>dir==='out'?c[0]!==node.id:c[1]!==node.id);ui.pendingPort=null;renderNodes();renderAll();toast('已断开节点端口','下游实体、发射与碰撞已同步失效');return}if(dir==='out'){ui.pendingPort={node:node.id,kind,index};renderNodes();$('#nodeStatus').textContent=`正在连接 ${node.title} · ${kind} 输出`;return}if(!ui.pendingPort){toast('连接提示','请先点击一个输出端口');return}if(ui.pendingPort.kind!==kind&&!(ui.pendingPort.kind==='particle'&&kind==='geometry')){toast('端口类型不兼容',`${ui.pendingPort.kind} 不能连接到 ${kind}`);return}snapshot('连接程序节点');const wire=[ui.pendingPort.node,node.id,ui.pendingPort.kind];if(!project.connections.some(c=>c[0]===wire[0]&&c[1]===wire[1]))project.connections.push(wire);ui.pendingPort=null;renderNodes();renderAll();toast('节点已连接','实体、粒子发射与碰撞依赖已重新求值')}
  function duplicateSelectedNode(){const n=project.nodes.find(x=>x.id===ui.selectedNode);if(!n)return;snapshot('复制程序节点');const copy=JSON.parse(JSON.stringify(n));copy.id=n.id+'_'+Date.now();copy.title=n.title+' 复制';copy.x+=28;copy.y+=28;project.nodes.push(copy);ui.selectedNode=copy.id;renderNodes();toast('已复制节点',copy.title)}
  function groupSelectedNode(){const n=project.nodes.find(x=>x.id===ui.selectedNode);if(!n)return;snapshot('封装节点组');n.grouped=!n.grouped;n.title=n.grouped&&!n.title.includes('节点组')?n.title+' 节点组':n.title.replace(' 节点组','');renderNodes();toast(n.grouped?'已封装节点组':'已解除节点组',n.title)}

  function showLayerMenu(x,y,id){const menu=$('#contextMenu');menu.hidden=false;menu.style.left=x+'px';menu.style.top=y+'px';menu.innerHTML='<button data-action="rename">重命名　Enter</button><button data-action="duplicate">复制图层　Ctrl+D</button><button data-action="precomp">原位预合成　Ctrl+Shift+C</button><button data-action="delete">删除　Del</button>';menu.onclick=e=>{const a=e.target.dataset.action;if(a==='rename')renameLayer(id);if(a==='duplicate')duplicateLayer(id);if(a==='precomp')precompose();if(a==='delete')deleteLayer(id);menu.hidden=true};setTimeout(()=>document.addEventListener('pointerdown',()=>menu.hidden=true,{once:true}),0)}
  function showKeyMenu(x,y,keyId){const [id,indexText]=keyId.split(':'),layer=project.layers.find(l=>l.id===id),time=layer?.keys[+indexText],menu=$('#contextMenu');if(time===undefined)return;menu.hidden=false;menu.style.left=x+'px';menu.style.top=y+'px';menu.innerHTML='<button data-interp="linear">线性插值</button><button data-interp="bezier">贝塞尔 / 缓入缓出</button><button data-interp="hold">定格关键帧</button>';menu.onclick=e=>{const interp=e.target.dataset.interp,bucket=layer.tracks||project.propertyTracks[layer.id]||{};if(!interp)return;snapshot('更改关键帧插值');Object.values(bucket).flat().filter(k=>Math.abs(k.time-time)<.5/FPS).forEach(k=>k.interp=interp);menu.hidden=true;renderAll();toast('时间插值已更新',interp==='hold'?'保持前一帧值':interp==='linear'?'线性匀速':'贝塞尔缓动')};setTimeout(()=>document.addEventListener('pointerdown',()=>menu.hidden=true,{once:true}),0)}
  function renameLayer(id=project.selectedLayer){const l=project.layers.find(x=>x.id===id);if(!l)return;openModal('重命名图层',`<div class="modal-field"><label>图层名称</label><input id="renameInput" value="${escapeHtml(l.name)}"></div>`,()=>{snapshot('重命名图层');l.name=$('#renameInput').value.trim()||l.name;renderLayerRows();updateInspector()})}
  function duplicateLayer(id=project.selectedLayer){const l=project.layers.find(x=>x.id===id);if(!l)return;snapshot('复制图层');const copy=JSON.parse(JSON.stringify(l));copy.id=l.id+'_'+Date.now();copy.name=l.name+' 复制';copy.locked=false;project.layers.splice(project.layers.indexOf(l),0,copy);project.selectedLayer=copy.id;renderLayerRows();renderTimeline();toast('已复制图层',copy.name)}
  function deleteLayer(id=project.selectedLayer){const i=project.layers.findIndex(x=>x.id===id);if(i<0||project.layers[i].locked){toast('无法删除','请先解锁图层');return}snapshot('删除图层');const name=project.layers[i].name;project.layers.splice(i,1);project.selectedLayer=project.layers[Math.min(i,project.layers.length-1)]?.id;renderLayerRows();renderTimeline();updateInspector();toast('已删除图层',name)}
  function precompose(){const l=selectedLayer();if(!l)return;snapshot('原位预合成');const old=l.name,comp={id:'comp_'+Date.now(),name:old+'_预合成',width:1920,height:1080,fps:30,duration:l.out-l.in};project.comps.push(comp);l.type='precomp';l.icon='▰';l.name=comp.name;l.sourceComp=comp.id;l.timeRemap={speed:1,start:0,reverse:false,freeze:false,blur:true};l.color='#9a7ae6';addCompAsset(comp);renderLayerRows();updateInspector();toast('已原位预合成','父级动画、柔边与半透明保持当前画面')}

  function addCompAsset(comp){if($(`.tree-item[data-comp="${comp.id}"]`))return;const b=document.createElement('button');b.className='tree-item';b.dataset.comp=comp.id;b.innerHTML=`<span class="comp-icon violet">▰</span><span>${escapeHtml(comp.name)}</span><em>${comp.duration.toFixed(1)}s</em>`;const groups=$$('.tree-group',$('#projectTree'));$('#projectTree').insertBefore(b,groups[1]||null);bindCompItem(b)}
  function bindCompItem(b){b.onclick=()=>{$$('.tree-item').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');project.activeComp=b.dataset.comp;const comp=project.comps.find(c=>c.id===project.activeComp);$('#projectName').textContent=`${project.name} / ${comp?.name||b.querySelector('span:nth-child(2)').textContent}`;$('#stageLabel').textContent=comp?.name||'合成';toast('已打开合成',`${comp?.width||1920} × ${comp?.height||1080} · ${comp?.fps||30} fps`)}}

  function openModal(title,body,onConfirm){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modalBackdrop').hidden=false;const close=()=>$('#modalBackdrop').hidden=true;$('#modalClose').onclick=close;$('#modalCancel').onclick=close;$('#modalConfirm').onclick=()=>{onConfirm?.();close()};setTimeout(()=>$('#modalBody input, #modalBody textarea')?.focus(),20)}

  function initControls(){
    renderRuler();renderLayerRows();renderTimeline();renderNodes();updateInspector();
    $('#playBtn').onclick=togglePlay;$('#previewBtn').onclick=togglePlay;$('#goStartBtn').onclick=()=>setTime(0);$('#goEndBtn').onclick=()=>setTime(DURATION);$('#loopBtn').onclick=()=>{project.loop=!project.loop;$('#loopBtn').classList.toggle('active',project.loop)};
    $('#prevKeyBtn').onclick=()=>jumpKey(-1);$('#nextKeyBtn').onclick=()=>jumpKey(1);
    $('#rulerWrap').addEventListener('pointerdown',scrub);$('#tracks').addEventListener('pointerdown',e=>{if(!e.target.closest('.keyframe'))scrub(e)});
    $$('#tools .tool').forEach(b=>b.onclick=()=>{$$('#tools .tool').forEach(x=>x.classList.remove('active'));b.classList.add('active');ui.activeTool=b.dataset.tool;toast(`${b.title.split(' ')[0]}已启用`,'在合成画布中拖动操作')});
    $$('.transform-mode button').forEach(b=>b.onclick=()=>{$$('.transform-mode button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
    $('#gridToggle').onclick=()=>{project.grid=!project.grid;$('#gridToggle').classList.toggle('active',project.grid);drawOverlay()};$('#guideToggle').onclick=()=>{project.guides=!project.guides;$('#guideToggle').classList.toggle('active',project.guides);drawOverlay()};
    $$('#lowerTabs button').forEach(b=>b.onclick=()=>switchLower(b.dataset.view));$$('#inspectorTabs button').forEach(b=>b.onclick=()=>switchInspector(b.dataset.inspector));
    $$('.curve-prop').forEach(b=>b.onclick=()=>{$$('.curve-prop').forEach(x=>x.classList.remove('active'));b.classList.add('active');drawCurve()});
    $('#expressionCurve').onchange=drawCurve;
    $('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;$('#saveBtn').onclick=saveProject;$('#importBtn').onclick=()=>$('#fileInput').click();$('#fileInput').onchange=loadProject;
    $('#renameBtn').onclick=()=>renameLayer();$('#newCompBtn').onclick=newComposition;$('#addFolderBtn').onclick=()=>toast('已创建素材文件夹','程序资源 / 新建文件夹');$('#trashBtn').onclick=()=>deleteLayer();
    $('#motionBlurBtn').onclick=()=>{project.motionBlur=!project.motionBlur;$('#motionBlurBtn').classList.toggle('active',project.motionBlur);toast(project.motionBlur?'合成运动模糊已开启':'合成运动模糊已关闭',project.motionBlur?'快门角度 180° · 相位 -90°':'静止内容保持清晰')};$('#snapBtn').onclick=()=>{project.snap=!project.snap;$('#snapBtn').classList.toggle('active',project.snap)};
    $('#zoomRange').oninput=e=>{ui.zoom=e.target.value/100;$('#tracks').style.backgroundSize=`${ui.zoom*100}% 100%`};
    $('#snapshotBtn').onclick=snapshotFrame;$('#addNodeBtn').onclick=addNode;$('#duplicateNodeBtn').onclick=duplicateSelectedNode;$('#groupNodeBtn').onclick=groupSelectedNode;$('#frameNodesBtn').onclick=()=>{project.nodes.forEach((n,i)=>{n.x=40+(i%5)*190;n.y=30+Math.floor(i/5)*120});renderNodes()};
    $$('.stopwatch').forEach(b=>b.onclick=()=>{b.classList.toggle('animated');toast(b.classList.contains('animated')?'已开启动画':'已关闭动画',b.dataset.prop+' · 当前时间 '+formatTime(project.currentTime))});
    $$('[data-field]').forEach(inp=>{inp.addEventListener('focus',()=>inp.select());inp.addEventListener('change',()=>updateTransformField(inp))});
    bindRange('depthRange','depthOutput','depth',v=>`${v} px`);bindRange('bevelRange','bevelOutput','bevel',v=>`${v} px`);bindRange('deformRange','deformOutput','deform',v=>`${v}%`,.01);bindRange('glowRange','glowOutput','glow',v=>`${v}%`,.01);bindRange('metalRange','metalOutput','metal',v=>(v/100).toFixed(2),.01);bindRange('roughRange','roughOutput','roughness',v=>(v/100).toFixed(2),.01);bindRange('emissionRange','emissionOutput','emission',v=>(v/100).toFixed(2),.01);
    bindEffectRange('glowRadius','glowRadiusOutput','glowRadius',v=>`${v} px`);bindEffectRange('blurRange','blurOutput','blurAmount',v=>`${v} px`);bindEffectRange('hueRange','hueOutput','hue',v=>`${v}°`);bindEffectRange('saturationRange','saturationOutput','saturation',v=>`${v}%`,.01);bindEffectRange('brightnessRange','brightnessOutput','brightness',v=>`${v}%`,.01);
    $$('.fx-switch[data-effect]').forEach(button=>button.onclick=()=>{const key=button.dataset.effect;snapshot('切换效果');project.effects[key]=!project.effects[key];button.classList.toggle('on',project.effects[key]);button.closest('.effect-card')?.classList.toggle('active',project.effects[key]);renderAll();toast(project.effects[key]?'效果已启用':'效果已旁路',button.parentElement.querySelector('b')?.textContent||key)});
    bindParticleRange('rateRange','rateOutput','rate',v=>`${v} /s`);bindParticleRange('speedRange','speedOutput','speed',v=>(v/100).toFixed(2)+'×',.01);bindParticleRange('lifeRange','lifeOutput','life',v=>(v/100).toFixed(2)+' s',.01);bindParticleRange('dragRange','dragOutput','drag',v=>(v/100).toFixed(2),.01);
    $('#fieldRange').addEventListener('pointerdown',()=>snapshot('调整空间场'));$('#fieldRange').oninput=e=>{project.field.strength=+e.target.value/100;$('#fieldOutput').textContent=e.target.value+'%';renderAll()};
    $('#baseColor').oninput=e=>{project.render.baseColor=e.target.value;e.target.nextElementSibling.textContent=e.target.value.toUpperCase();renderAll()};
    $('#editTextBtn').onclick=editGlyph;$('#textUnit').onchange=e=>project.textAnimator.unit=e.target.value;$('#textAlign').onchange=e=>{project.textStyle.align={'居中':'center','左对齐':'left','右对齐':'right'}[e.target.value];renderer.updateGlyph(project.glyph);renderAll()};bindTextStyleRange('fontSizeRange','fontSizeOutput','fontSize',v=>`${v} px`);bindTextStyleRange('lineHeightRange','lineHeightOutput','lineHeight',v=>`${v}%`,.01);bindTextStyleRange('trackingRange','trackingOutput','tracking',v=>`${v} px`);bindTextRange('textStart','textRangeOutput','start',.01);bindTextRange('textEnd','textRangeOutput','end',.01);bindTextRange('textOffset','textOffsetOutput','offset',.01,v=>`${v}%`);bindTextRange('textSoftness','textSoftnessOutput','softness',.01,v=>`${v}%`);bindTextRange('textOpacity','textOpacityOutput','opacity',.01,v=>`${v}%`);
    ['trimRange','repeatRange'].forEach(id=>$('#'+id).addEventListener('pointerdown',()=>snapshot('调整形状操作')));$('#trimRange').oninput=e=>{const l=selectedLayer();if(!l?.shape)return;l.shape.trim=+e.target.value/100;$('#trimOutput').textContent=e.target.value+'%';renderAll()};$('#repeatRange').oninput=e=>{const l=selectedLayer();if(!l?.shape)return;l.shape.repeat=+e.target.value;$('#repeatOutput').textContent=e.target.value;renderAll()};$('#booleanMode').onchange=e=>{const l=selectedLayer();if(!l?.shape)return;snapshot('形状布尔运算');l.shape.boolean=e.target.value;renderAll();toast('布尔运算：'+e.target.value,'操作顺序已写入 WebGL 形状栈')};$('#morphTarget').onchange=e=>{const l=selectedLayer();if(!l?.shape)return;snapshot('路径形变');l.shape.morph=e.target.value;renderAll();toast('路径形变已更新','轮廓与孔洞保持对应')};$('#swapBoolean').onclick=()=>{const l=selectedLayer();if(!l?.shape)return;l.shape.booleanSwapped=!l.shape.booleanSwapped;renderAll();toast('已交换布尔操作数顺序',l.shape.booleanSwapped?'B − A':'A − B')};
    bindSceneRange('fovRange','fovOutput',project.camera,'fov',v=>`${v}°`);bindSceneRange('focusRange','focusOutput',project.camera,'focus',v=>v);bindSceneRange('apertureRange','apertureOutput',project.camera,'aperture',v=>`f/${(v/10).toFixed(1)}`,.1);bindSceneRange('lightRange','lightOutput',project.light,'intensity',v=>`${v}%`,.01);$('#lightColor').oninput=e=>{project.light.color=e.target.value;e.target.nextElementSibling.textContent=e.target.value.toUpperCase();renderAll()};
    $('#timeSpeed').addEventListener('pointerdown',()=>snapshot('调整时间重映射'));$('#timeSpeed').oninput=e=>{const l=selectedLayer();if(l?.timeRemap){l.timeRemap.speed=+e.target.value/100;$('#timeSpeedOutput').textContent=e.target.value+'%';renderAll()}};$('#precompStart').onchange=e=>{const l=selectedLayer();if(l?.timeRemap){snapshot('调整预合成起点');l.timeRemap.start=+e.target.value||0;renderAll()}};$('#reverseTime').onchange=e=>{const l=selectedLayer();if(l?.timeRemap){snapshot('反转预合成时间');l.timeRemap.reverse=e.target.checked;renderAll()}};$('#freezeTime').onchange=e=>{const l=selectedLayer();if(l?.timeRemap){snapshot('冻结预合成时间');l.timeRemap.freeze=e.target.checked;renderAll()}};$('#precompBlur').onchange=e=>{const l=selectedLayer();if(l?.timeRemap){l.timeRemap.blur=e.target.checked;renderAll()}};
    $('#volumeRange').oninput=e=>{project.audioSettings.volume=+e.target.value/100;$('#volumeOutput').textContent=e.target.value+'%';if(audio.master)audio.master.gain.value=project.audioSettings.volume*.23};$('#toneRange').oninput=e=>{project.audioSettings.baseTone=+e.target.value;$('#toneOutput').textContent=e.target.value+' Hz'};$('#waveform').onchange=e=>project.audioSettings.waveform={'三角波':'triangle','正弦波':'sine','锯齿波':'sawtooth'}[e.target.value];$('#auditionTone').onclick=()=>{audio.ensure();audio.tone(project.audioSettings.baseTone,.45,project.audioSettings.waveform,.35)};
    $('#parentSelect').onchange=e=>{const selected=selectedLayer();if(!selected)return;const l=selected.id==='strokes'?project.layers.find(x=>x.id==='glyph3d'):selected,before=worldTransformAt(l,project.currentTime);snapshot('更改父级');l.parent=e.target.value;const parent=project.layers.find(x=>x.name===l.parent),p=parent?worldTransformAt(parent,project.currentTime):{position:[960,540,0],scale:[100,100,100],rotation:[0,0,0]},a=-p.rotation[2]*Math.PI/180,dx=before.position[0]-p.position[0],dy=before.position[1]-p.position[1],local={position:[960+(dx*Math.cos(a)-dy*Math.sin(a))/(p.scale[0]/100||1),540+(dx*Math.sin(a)+dy*Math.cos(a))/(p.scale[1]/100||1),before.position[2]-p.position[2]],scale:before.scale.map((v,i)=>v/(p.scale[i]/100||1)),rotation:before.rotation.map((v,i)=>v-p.rotation[i])},bucket=l.tracks||project.propertyTracks[l.id]||{},hasTracks=Object.values(bucket).some(track=>track.length),transform=transformBase(l);if(hasTracks){['X','Y','Z'].forEach((axis,i)=>{setTrackKey(l,'position'+axis,project.currentTime,local.position[i]);setTrackKey(l,'scale'+axis,project.currentTime,local.scale[i]);setTrackKey(l,'rotation'+axis,project.currentTime,local.rotation[i])})}else{transform.position=local.position;transform.scale=local.scale;transform.rotation=local.rotation}renderAll();syncTransformInputs(layerTransformAt(l,project.currentTime));toast('父级关系已更新','多层嵌套生效并保留当前画面')};$('#emitterSource').onchange=e=>{snapshot('更换粒子发射源');project.particles.emitter=e.target.value;toast('发射几何已更新','粒子缓存已确定性重算')};
    $('#blendMode').onchange=e=>{const l=selectedLayer();snapshot('更改混合模式');project.composite.blend=e.target.value;if(l)l.blend=e.target.value;renderAll();toast('混合模式：'+e.target.value,'半透明 Alpha 已重新合成')};$('#trackMatte').onchange=e=>{const l=selectedLayer();snapshot('更改轨道遮罩');project.composite.matte=e.target.value;if(l)l.matte=e.target.value;renderAll();toast('轨道遮罩：'+e.target.value,'遮罩来源使用上方图层')};
    $('#maskToggle').onclick=()=>{snapshot(project.composite.maskEnabled?'移除蒙版':'添加蒙版');project.composite.maskEnabled=!project.composite.maskEnabled;$('#maskToggle').classList.toggle('active',project.composite.maskEnabled);$('#maskToggle').innerHTML=project.composite.maskEnabled?'<span>−</span> 移除蒙版':'<span>＋</span> 添加蒙版';renderAll();toast(project.composite.maskEnabled?`${project.composite.maskType}蒙版已添加`:'蒙版已移除','羽化、形状与反转已参与 WebGL 合成')};$('#maskFeather').onchange=e=>{project.composite.maskFeather=clamp(+e.target.value||0,0,200);renderAll()};$('#maskType').onchange=e=>{snapshot('更改蒙版形状');project.composite.maskType=e.target.value;renderAll()};$('#maskInvert').onchange=e=>{snapshot('反转蒙版');project.composite.maskInvert=e.target.checked;renderAll()};
    $('#expressionInput').addEventListener('change',e=>{const l=expressionLayer();if(!l)return;snapshot('修改表达式');if(l.id==='glyph3d')project.expression=e.target.value;else(l.expressions||={}).rotationY=e.target.value;validateExpression()});$('#expressionEnable').onclick=()=>{const l=expressionLayer();if(!l)return;const enabled=l.id==='glyph3d'?(project.expressionEnabled=!project.expressionEnabled):(l.expressionEnabled=!(l.expressionEnabled!==false));$('#expressionEnable').classList.toggle('active',enabled);$('#expressionEnable').textContent=enabled?'已启用':'已禁用';renderAll()};
    $$('.expression-chips button').forEach(b=>b.onclick=()=>{const presets={wiggle:'value + wiggle(0.8, 0.6)',loop:'loopOut("pingpong")',ease:'ease(time, 6.8, 8.55, value, value + 12)',reference:'thisComp.layer("控制器").transform.rotation.valueAtTime(8.55)'};$('#expressionInput').value=presets[b.dataset.expression];$('#expressionInput').dispatchEvent(new Event('change'))});
    $('#glCanvas').addEventListener('pointerdown',canvasPointerDown);$('#canvasShell').addEventListener('dblclick',()=>{if(ui.activeTool==='text')editGlyph()});
    $('#addEffectBtn').onclick=()=>toast('效果浏览器','可用：发光、投影、高斯模糊、色相/饱和度/亮度');
    $$('.tree-item[data-comp]').forEach(bindCompItem);
    document.addEventListener('keydown',handleKey);window.addEventListener('resize',renderAll);document.addEventListener('pointerdown',()=>audio.ensure(),{once:true});
  }
  function bindRange(id,out,key,fmt,mult=1){const el=$('#'+id);if(!el)return;el.addEventListener('pointerdown',()=>snapshot('调整 '+key));el.addEventListener('input',()=>{project.render[key]=+el.value*mult;$('#'+out).textContent=fmt(+el.value);renderAll()})}
  function bindEffectRange(id,out,key,fmt,mult=1){const el=$('#'+id);if(!el)return;el.addEventListener('pointerdown',()=>snapshot('调整效果 '+key));el.addEventListener('input',()=>{project.effects[key]=+el.value*mult;$('#'+out).textContent=fmt(+el.value);renderAll()})}
  function bindParticleRange(id,out,key,fmt,mult=1){const el=$('#'+id);if(!el)return;el.addEventListener('pointerdown',()=>snapshot('调整粒子 '+key));el.addEventListener('input',()=>{project.particles[key]=+el.value*mult;$('#'+out).textContent=fmt(+el.value);renderAll()})}
  function bindTextRange(id,out,key,mult,fmt){const el=$('#'+id);el.addEventListener('pointerdown',()=>snapshot('调整文字动画器'));el.addEventListener('input',()=>{project.textAnimator[key]=+el.value*mult;if(out==='textRangeOutput')$('#'+out).textContent=`${Math.round(project.textAnimator.start*100)}—${Math.round(project.textAnimator.end*100)}%`;else $('#'+out).textContent=(fmt||((v)=>v))(+el.value);renderAll()})}
  function bindTextStyleRange(id,out,key,fmt,mult=1){const el=$('#'+id);el.addEventListener('pointerdown',()=>snapshot('调整文字排版'));el.addEventListener('input',()=>{project.textStyle[key]=+el.value*mult;$('#'+out).textContent=fmt(+el.value);renderer.updateGlyph(project.glyph);renderAll()})}
  function bindSceneRange(id,out,obj,key,fmt,mult=1){const el=$('#'+id);el.addEventListener('pointerdown',()=>snapshot('调整三维场景'));el.addEventListener('input',()=>{obj[key]=+el.value*mult;$('#'+out).textContent=fmt(+el.value);renderAll()})}
  function validateExpression(){const layer=expressionLayer();if(!layer)return;const val=layerExpression(layer),syntaxOk=val.length<300&&!/[;{}]|=>|\b(?:while|for|fetch|window|document|Function|eval)\b/i.test(val);project.expressionError=null;if(syntaxOk)evaluateExpression(val,animatedProperty(layer,'rotationY',project.currentTime),project.currentTime,{layer,field:'rotationY',track:propertyTrack(layer,'rotationY'),stack:[`${layer.id}:rotationY`],valueAtTime:t=>animatedProperty(layer,'rotationY',t)});const ok=syntaxOk&&!project.expressionError,status=$('#expressionStatus');status.classList.toggle('error',!ok);status.querySelector('i').style.background=ok?'var(--green)':'#f05d4f';status.querySelector('span').textContent=ok?'求值正常 · 依赖图无循环 · 随机种子 24':(project.expressionError||'表达式语法错误')+' · 已退回关键帧值';if(layer.id==='glyph3d')project.expressionEnabled=ok;else layer.expressionEnabled=ok;renderAll()}
  function updateTransformField(inp){const selected=selectedLayer();if(!selected)return;const layer=selected.id==='strokes'?project.layers.find(l=>l.id==='glyph3d'):selected,field=inp.dataset.field,group=field.replace(/[XYZ]$/,''),map={positionX:['position',0],positionY:['position',1],positionZ:['position',2],scaleX:['scale',0],scaleY:['scale',1],scaleZ:['scale',2],rotationX:['rotation',0],rotationY:['rotation',1],rotationZ:['rotation',2],opacity:['opacity',null]},entry=map[field];if(!entry)return;snapshot('修改变换属性');const v=parseFloat(inp.value)||0,animated=$(`.stopwatch[data-prop="${group}"]`)?.classList.contains('animated');if(animated)setTrackKey(layer,field,project.currentTime,v);else{const transform=transformBase(layer),[key,index]=entry;if(index===null)transform[key]=v;else transform[key][index]=v}renderTimeline();renderAll()}
  function switchLower(view){ui.activeLower=view;$$('#lowerTabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.lower-view').forEach(v=>v.classList.toggle('active',v.id===view+'View'));if(view==='curve')drawCurve();if(view==='nodes')drawWires()}
  function switchInspector(name){ui.activeInspector=name;$$('#inspectorTabs button').forEach(b=>b.classList.toggle('active',b.dataset.inspector===name));$$('.inspector-content').forEach(v=>v.classList.toggle('active',v.id===name+'Inspector'))}
  function scrub(e){const rect=$('#rulerWrap').getBoundingClientRect();const move=ev=>setTime((ev.clientX-rect.left)/rect.width*DURATION);move(e);const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)}
  function jumpKey(dir){const times=[...new Set(project.layers.flatMap(l=>l.keys))].sort((a,b)=>a-b);const next=dir>0?times.find(t=>t>project.currentTime+.01):[...times].reverse().find(t=>t<project.currentTime-.01);setTime(next??(dir>0?DURATION:0))}
  function canvasPointerDown(e){if(ui.activeTool==='text'){editGlyph();return}if(ui.activeTool==='shape'||ui.activeTool==='pen'){createShapePointer(e);return}const rect=e.currentTarget.getBoundingClientRect(),selected=selectedLayer();if(!selected||selected.locked){toast('图层已锁定','请先解锁后再直接编辑');return}const layer=selected.id==='strokes'?project.layers.find(l=>l.id==='glyph3d'):selected,sampled=layerTransformAt(layer,project.currentTime),start={x:e.clientX,y:e.clientY,pos:[...sampled.position],rot:[...sampled.rotation],scale:[...sampled.scale],shape:selected.shape?{...selected.shape}:null};snapshot('画布直接编辑');const mode=$('.transform-mode button.active').dataset.transform,write=(field,value)=>{const group=field.replace(/[XYZ]$/,''),animated=$(`.stopwatch[data-prop="${group}"]`)?.classList.contains('animated');if(animated)setTrackKey(layer,field,project.currentTime,value);else{const transform=transformBase(layer),axis={X:0,Y:1,Z:2}[field.at(-1)],key=field.replace(/[XYZ]$/,'');if(axis===undefined)transform[key]=value;else transform[key][axis]=value}};const move=ev=>{const dx=(ev.clientX-start.x)/rect.width*1920,dy=(ev.clientY-start.y)/rect.height*1080;if(start.shape&&mode==='move'){selected.shape.x=start.shape.x+dx/1.5;selected.shape.y=start.shape.y+dy/1.5}else{if(mode==='move'){write('positionX',start.pos[0]+dx);write('positionY',start.pos[1]+dy)}if(mode==='rotate')write('rotationY',start.rot[1]+dx*.1);if(mode==='scale'){const s=clamp(start.scale[0]+dx*.08,10,300);write('scaleX',s);write('scaleY',s);write('scaleZ',s)}syncTransformInputs(layerTransformAt(layer,project.currentTime))}renderAll()};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);renderTimeline()};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)}
  function createShapePointer(e){const rect=$('#glCanvas').getBoundingClientRect(),toStage=ev=>({x:(ev.clientX-rect.left)/rect.width*1280,y:(ev.clientY-rect.top)/rect.height*720}),p=toStage(e),kind=ui.activeTool==='pen'?'bezier':(e.shiftKey?'ellipse':'rect');snapshot('创建矢量图形');const id='shape_'+Date.now(),layer={id,name:kind==='ellipse'?'椭圆形状':kind==='bezier'?'贝塞尔路径':'矩形形状',type:'shape',icon:kind==='ellipse'?'○':'▱',color:'#ef7b50',in:project.currentTime,out:DURATION,visible:true,locked:false,keys:[project.currentTime],shape:{kind,x:p.x,y:p.y,w:2,h:2,fill:'rgba(232,91,43,.26)',stroke:'#ff8c61',strokeWidth:2,opacity:.9}};project.layers.splice(5,0,layer);project.selectedLayer=id;const move=ev=>{const q=toStage(ev);layer.shape.w=q.x-p.x;layer.shape.h=q.y-p.y;drawOverlay()};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);if(layer.shape.w<0){layer.shape.x+=layer.shape.w;layer.shape.w=Math.abs(layer.shape.w)}if(layer.shape.h<0){layer.shape.y+=layer.shape.h;layer.shape.h=Math.abs(layer.shape.h)}layer.shape.w=Math.max(12,layer.shape.w);layer.shape.h=Math.max(12,layer.shape.h);renderLayerRows();renderTimeline();updateInspector();renderAll();toast('矢量图形已创建',kind==='bezier'?'开放贝塞尔路径 · 可编辑切线':'填充与描边已加入合成')};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)}
  function syncTransformInputs(t=project.transform){const set=(k,v)=>{const e=$(`[data-field="${k}"]`);if(e)e.value=Math.round(v*10)/10};set('positionX',t.position[0]);set('positionY',t.position[1]);set('positionZ',t.position[2]);set('scaleX',t.scale[0]);set('scaleY',t.scale[1]);set('scaleZ',t.scale[2]);set('rotationX',t.rotation[0]);set('rotationY',t.rotation[1]);set('rotationZ',t.rotation[2]);set('opacity',t.opacity)}
  function editGlyph(){openModal('编辑文字与字形源',`<div class="modal-field"><label>文字内容</label><textarea id="glyphInput" rows="3" spellcheck="false">${escapeHtml(project.glyph)}</textarea></div><div class="modal-note">支持系统内置「微软雅黑 / 黑体」简体中文、多行与常用标点。默认锻字镜头以单个汉字构图；多行内容同样会生成轮廓、挤出实体、变形表面与粒子碰撞数据。</div>`,()=>{const value=$('#glyphInput').value.trim()||'铸';snapshot('更换源文字');project.glyph=value;renderer.updateGlyph(value);const label=value.replace(/\s+/g,'').slice(0,6),glyphLayer=project.layers.find(l=>l.id==='glyph3d');glyphLayer.name=label+'_挤出体';project.layers.find(l=>l.id==='strokes').name=label+'_笔画生长';$('.tile-glyph').textContent=value[0];renderLayerRows();updateInspector();renderAll();toast('程序几何已重新生成',`${[...value].length} 个字符 · 轮廓、实体与粒子依赖已更新`)})}
  function newComposition(){openModal('新建合成',`<div class="modal-field"><label>名称</label><input id="compName" value="未命名合成"></div><div class="modal-field"><label>尺寸</label><select id="compSize"><option>1920 × 1080</option><option>3840 × 2160</option><option>1080 × 1080</option></select></div><div class="modal-field"><label>帧率</label><input id="compFps" value="30"></div><div class="modal-field"><label>时长</label><input id="compDuration" value="15.0"></div>`,()=>{const size=$('#compSize').value.split(' × ').map(Number),comp={id:'comp_'+Date.now(),name:$('#compName').value||'未命名合成',width:size[0],height:size[1],fps:clamp(+$(`#compFps`).value||30,1,120),duration:clamp(+$(`#compDuration`).value||15,.1,3600)};snapshot('新建合成');project.comps.push(comp);addCompAsset(comp);toast('合成已创建',comp.name+' · 已加入项目面板')})}
  function addNode(){snapshot('添加程序节点');const id='node'+Date.now();project.nodes.push({id,title:'噪声场',x:120+project.nodes.length*18,y:110,color:'#5fc2c8',ports:[['强度','scalar','in'],['场','field','out']],footer:'种子 24 · 可动画'});renderNodes();toast('已添加节点','噪声场 · 输出类型：场')}
  function snapshotFrame(){try{const a=document.createElement('a');a.download=`砺场_${project.glyph}_${project.currentTime.toFixed(2)}s.png`;a.href=$('#glCanvas').toDataURL('image/png');a.click();toast('快照已保存',formatTime(project.currentTime))}catch(e){toast('快照失败',e.message)}}
  function saveProject(){const data={format:'ForgeMotion Project',version:1,savedAt:new Date().toISOString(),project:{...project,playing:false,exportMode:false}};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.download=`${project.name}.forge.json`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('#dirtyMark').textContent='已保存';toast('工程文件已保存','包含关键帧、节点、材质与确定性模拟设置')}
  function loadProject(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(data.format!=='ForgeMotion Project')throw Error('不是有效的砺场工程文件');pause();Object.assign(project,data.project);normalizeProject();project.exportMode=false;project.playing=false;project.comps?.forEach(addCompAsset);renderer.updateGlyph(project.glyph);renderLayerRows();renderTimeline();renderNodes();updateInspector();syncTransformInputs();setTime(project.currentTime||0);toast('工程已打开',file.name)}catch(err){toast('无法打开工程',err.message)}};reader.readAsText(file);e.target.value=''}
  function handleKey(e){
    const tag=e.target.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(e.code==='Space'){e.preventDefault();togglePlay();return}if(key==='v'&&!mod)$('[data-tool="select"]').click();if(key==='h'&&!mod)$('[data-tool="hand"]').click();if(key==='t'&&!mod)$('[data-tool="text"]').click();if(key==='q'&&!mod)$('[data-tool="shape"]').click();if(key==='g'&&!mod)$('[data-tool="pen"]').click();
    if(e.key==='Delete'){if(ui.selectedKeys.size){snapshot('删除关键帧');const grouped={};ui.selectedKeys.forEach(k=>{const [id,i]=k.split(':');(grouped[id]??=[]).push(+i)});Object.entries(grouped).forEach(([id,idx])=>{const l=project.layers.find(x=>x.id===id);if(!l)return;const times=idx.map(i=>l.keys[i]),bucket=l.tracks||project.propertyTracks[l.id]||{};Object.keys(bucket).forEach(prop=>bucket[prop]=bucket[prop].filter(key=>!times.some(t=>Math.abs(key.time-t)<.5/FPS)));idx.sort((a,b)=>b-a).forEach(i=>l.keys.splice(i,1))});ui.selectedKeys.clear();renderTimeline();renderAll();toast('已删除关键帧','属性轨道已重新取样')}else deleteLayer();return}
    if(e.key==='F9'){e.preventDefault();snapshot('关键帧缓入缓出');ui.selectedKeys.forEach(k=>{const[id,i]=k.split(':'),l=project.layers.find(x=>x.id===id),time=l?.keys[+i],bucket=l&&(l.tracks||project.propertyTracks[l.id]||{});if(time!==undefined)Object.values(bucket).flat().filter(key=>Math.abs(key.time-time)<.5/FPS).forEach(key=>key.interp='bezier')});renderAll();toast('关键帧已设为缓入缓出','属性轨道使用贝塞尔时间插值');return}
    if(mod&&e.shiftKey&&key==='c'){e.preventDefault();precompose();return}if(mod&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();return}if(mod&&key==='y'){e.preventDefault();redo();return}if(mod&&key==='s'){e.preventDefault();saveProject();return}if(mod&&key==='d'){e.preventDefault();duplicateLayer();return}
    if(mod&&key==='c'&&ui.selectedKeys.size){e.preventDefault();ui.keyClipboard=[...ui.selectedKeys].map(k=>{const[id,i]=k.split(':');const l=project.layers.find(x=>x.id===id);return{offset:l.keys[+i]}});const min=Math.min(...ui.keyClipboard.map(x=>x.offset));ui.keyClipboard.forEach(x=>x.offset-=min);toast('关键帧已复制',`${ui.keyClipboard.length} 个关键帧`);return}
    if(mod&&key==='v'&&ui.keyClipboard.length){e.preventDefault();const l=selectedLayer();snapshot('粘贴关键帧');ui.keyClipboard.forEach(x=>l.keys.push(clamp(project.currentTime+x.offset,l.in,l.out)));l.keys=[...new Set(l.keys)].sort((a,b)=>a-b);renderTimeline();toast('关键帧已粘贴',`起点 ${formatTime(project.currentTime)}`);return}
    if(e.key==='ArrowRight')setTime(project.currentTime+1/FPS);if(e.key==='ArrowLeft')setTime(project.currentTime-1/FPS);
  }

  window.videoExport={
    runs:['demo'],
    async begin(runId,{fps=30}={}){if(runId!=='demo')throw new Error(`未知导出段：${runId}`);pause();project.exportMode=true;this.fps=clamp(Math.round(fps)||30,3,60);setTime(0,true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{frames:15*this.fps}},
    async frame(i){if(!project.exportMode)throw new Error('请先调用 videoExport.begin()');const max=15*this.fps-1;setTime(clamp(i,0,max)/this.fps,true);await new Promise(r=>requestAnimationFrame(r));},
    end(){project.exportMode=false;project.playing=false;setTime(0,true);$('#renderStat').textContent='实时';}
  };

  initControls();setTime(0,true);requestAnimationFrame(tick);
  console.info('%c砺场 ForgeMotion','color:#ff6b38;font-size:16px;font-weight:bold','WebGL 2 编辑器已就绪 · videoExport.runs =',window.videoExport.runs);
})();
