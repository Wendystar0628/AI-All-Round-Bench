'use strict';
function roof(g,w,d,y,rise,colorset,spacing=.22){
 const dz=d/2+.25, slope=Math.hypot(dz,rise), angle=Math.atan2(rise,dz), top=y+rise;
 for(const s of [-1,1]){
   const gable=new T.BufferGeometry();
   gable.setAttribute('position',new T.Float32BufferAttribute([s*w*.499,y,-d*.5, s*w*.499,y,d*.5, s*w*.499,top-.061,0],3));
   gable.setIndex(s>0?[0,2,1]:[0,1,2]);gable.computeVertexNormals();
   mesh(gable,'#c6c4a9',0,0,0,g); 
 }
 for(const dir of [-1,1]){
   const sl=group(0,y+rise/2,dir*dz*.5,g);sl.rotation.x=dir*angle;
   box(0,0,0,w+.50,.105,slope+.07,colorset[0],sl);
   for(let i=0;i<Math.ceil(w/spacing);i++){
     const x=-w*.5+(i+.5)*spacing;
     box(x,.062,0,spacing*.86,.025,slope-.025,pick(colorset),sl,false);
     cyl(x,.084,0,.031,.038,slope+.025,pick(colorset),sl,7,false).rotation.x=PI/2;
     for(let j=0;j<5;j++)box(x,.079,(j-2)*slope/5,spacing*.82,.006,.011,'#775d53',sl,false);
   }
   beam([-w*.53,y,dir*dz],[w*.53,y,dir*dz],.073,colorset[2],g);
   beam([-w*.53,y-.135,dir*(dz+.03)],[w*.53,y-.135,dir*(dz+.03)],.039,metal,g);
   for(const x of [-w*.52,w*.52])beam([x,top,0],[x,y,dir*dz],.085,colorset[2],g,6);
 }
 beam([-w*.535,top+.064,0],[w*.535,top+.064,0],.091,colorset[0],g,9);
}
function windowBox(g,x,y,z,w,h,trim='#4b6867',cross=true){
 box(x,y,z,w+.14,h+.14,.092,trim,g);
 box(x,y,z+.055,w,h,.028,'#6c9295',g,false);
 plane(x,y,z+.073,w,h,glazing,g);
 if(cross){box(x,y,z+.084,.043,h,.039,trim,g,false);box(x,y,z+.084,w,.043,.039,trim,g,false)}
 const mark=box(x+w*.15,y+h*.14,z+.084,w*.27,.018,.009,'#c2dddd',g,false);mark.rotation.z=.4;
 box(x,y-h/2-.075,z+.05,w+.22,.06,.17,trim,g);
}
function labelArt(w,h,draw){return canvasMat(w,h,draw)}
function wetPlastic(color){
 const m=mat(color,.48,.018);
 if(!m.envMap){m.envMap=harborSky.texture;m.envMapIntensity=.24;}
 return m;
}
const iceMaterials=new Map();
function cutIce(color){
 if(!iceMaterials.has(color)){
  const m=new T.MeshStandardMaterial({color,roughness:.22,metalness:.025,
   envMap:harborSky.texture,envMapIntensity:.94,flatShading:true});
  m.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 chip;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n chip=position;');
   shader.fragmentShader='varying vec3 chip;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     float fracture=sin(chip.x*33.+chip.y*29.+chip.z*40.);
     float sheen=pow(max(0.,fracture),10.)*.28;
     diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.84,.99,.94),sheen);
   `);
  };
  iceMaterials.set(color,m);
 }
 return iceMaterials.get(color);
}
function crate(g,x,y,z,w=.63,d=.47,h=.25,color='#e4eade',filled=false){
 const dark=tint(color,.68), enamel=wetPlastic(color);
 box(x,y+h*.09,z,w-.018,h*.17,d-.018,dark,g);
 for(const side of [-1,1]){
   box(x+side*(w/2-.023),y+h/2,z,.046,h,d,enamel,g);
   const face=z+side*(d*.5-.021);
   box(x,y+h*.315,face,w,h*.52,.042,enamel,g);
   box(x,y+h*.802,face,w,h*.20,.042,enamel,g);
   for(const sign of [-1,1])box(x+sign*w*.324,y+h*.6385,face,w*.35,h*.127,.042,enamel,g);
   box(x,y+h-.026,z+side*d/2,w+.025,.047,.047,enamel,g);
   box(x+side*w/2,y+h-.026,z,.047,.047,d,enamel,g);
   for(let j=0;j<5;j++){
    const rib=x+(j-2)*w*.170;
    box(rib,y+h*.303,face+side*.025,w*.027,h*.407,.023,enamel,g,false);
    box(rib,y+h*.12,face+side*.026,w*.084,h*.089,.033,dark,g,false);
   }
 }
 if(filled)for(let j=0;j<9;j++){
   const a=ico(x+rr(-w*.41,w*.40),y+h*.42,z+rr(-d*.40,d*.4),rr(.034,.107),rr(.044,.105),rr(.035,.075),cutIce(pick(['#c6dfdf','#e3efec','#9bbfc3'])),g,0,false);
   a.rotation.y=rr(0,6);
 }
}
function stack(g,x,y,z,count,color,w=.71,d=.53){
 for(let i=0;i<count;i++)crate(g,x+rr(-.019,.019),y+i*.25,z,w,d,.25, color, i===count-1&&rnd()<.43);
}
const warehouse=group(-9.7,SHORE,-2.74);warehouse.rotation.y=PI/2;
const wW=7.20,wD=4.38,wH=3.69;
const plaster='#ddd7ba', shutter='#859c9b', siding='#798d81';
box(0,.052,0,wW+.16,.106,wD+.19,'#a8aaa0',warehouse);
box(0,1.8,-wD/2,wW,3.6,.17,plaster,warehouse);
box(0,.434,-wD/2+.094,wW-.20,.78,.021,'#929e89',warehouse);
for(const s of [-1,1]){
 const x=s*wW/2;
 box(x,1.29,0,.17,2.58,wD,plaster,warehouse);
 box(x,3.43,0,.17,.34,wD,plaster,warehouse);
 box(x,2.92,-1.94,.17,.68,.51,plaster,warehouse);
 box(x,2.92,1.30,.17,.68,1.78,plaster,warehouse);
 box(x,.46,0,.225,.86,wD,siding,warehouse);
 for(let i=0;i<9;i++)box(s*(wW/2+.118),.25+i*.28,0,.018,.017,wD,i<3?'#657b71':'#b6b399',warehouse,false);
 const skylight=group(x,2.92,-.649,warehouse);skylight.rotation.y=s*PI/2;
 for(const y of [-.34,.34])box(0,y,0,2.24,.073,.25,'#678385',skylight);
 for(const a of [-1.09,-.38,.36,1.09])box(a,0,0,.053,.65,.24,'#6e8882',skylight);
 plane(0,0,0,2.14,.60,glazing,skylight).renderOrder=9;
 box(s*3.12,1.68,2.17,1.04,3.35,.18,plaster,warehouse);
 box(s*3.12,.49,2.265,1.06,.86,.064,siding,warehouse);
 box(s*2.607,1.55,2.234,.134,3.1,.16,'#697b72',warehouse);
 box(s*3.54,1.78,2.29,.13,3.59,.16,'#f3e6c4',warehouse);
 const down=beam([s*3.43,3.65,2.45],[s*3.43,.10,2.45],.039,'#748b84',warehouse);
 for(let i=0;i<3;i++)tor(s*3.43,.6+i*1.21,2.45,.045,.013,'#455e59',warehouse,false).rotation.x=PI/2;
}
box(0,3.27,2.16,5.18,.71,.18,plaster,warehouse);
box(0,2.495,2.17,5.18,.836,.069,shutter,warehouse);
for(let j=0;j<14;j++)box(0,2.087+j*.061,2.215,5.17,.012,.024,j===0?'#5b7776':'#adc0b5',warehouse,false);
for(const x of [-1.79,1.79])box(x,2.116,2.224,.164,.039,.083,'#627d75',warehouse);
box(0,2.80,2.29,5.34,.19,.25,'#5c7773',warehouse);
roof(warehouse,wW,wD,3.61,1.04,['#986356','#b77760','#775953','#a96754','#b5876d']);
for(const x of [-2.80,.14,2.31])beads.push({p:warehouse,x,y:3.515,z:2.47,phase:4.2+x*.81});
box(0,3.19,2.28,3.93,.68,.10,'#496966',warehouse);
sign('汐凪漁業協同組合','荷さばき所   ·   SHIONAGI CO-OP',0,3.19,2.337,3.82,.59,warehouse,['#dddcc1','#385b5d','#706a54']);
for(const x of [-2.08,2.11]){
 box(x,2.99,2.39,.19,.12,.18,'#56736b',warehouse);
 cyl(x,2.89,2.48,.084,.093,.032,'#fbdfa3',warehouse,14,false);
}
box(0,.118,.10,5.21,.022,4.03,groundTex,warehouse);
for(let i=0;i<22;i++){
 const x=rr(-2.44,2.44),z=rr(-1.5,2.0);
 if(i<7)irreg(x,.132,z,rr(.11,.42),rr(.09,.39),alpha('#c6e1d7',.30),warehouse);
 else ico(x,.15,z,rr(.026,.099),rr(.022,.065),rr(.029,.085),cutIce(pick(['#adcecb','#d7e6da','#b6d7d9'])),warehouse,0,false);
}
stack(warehouse,-2.06,.13,-1.32,6,'#d4e1d8');
stack(warehouse,-1.28,.13,-1.22,4,'#e2e8d8');
stack(warehouse,-2.29,.13,.10,4,'#a9c9c7');
stack(warehouse,-1.75,.13,.64,3,'#dbe8db');
stack(warehouse,-1.94,.13,1.38,2,'#8fb9c0');
stack(warehouse,1.57,.13,-1.47,5,'#729dac');
stack(warehouse,2.37,.13,-.82,3,'#d5e3d8');
box(.40,.56,-1.42,1.44,.83,.67,'#afc5bd',warehouse);
box(.4,1.012,-1.41,1.48,.11,.72,'#dae1d2',warehouse);
box(.39,.917,-1.062,.24,.035,.062,'#668885',warehouse);
for(const x of [-.055,.854]){
 box(x,.135,-1.60,.11,.034,.17,'#687c71',warehouse,false);
 box(x,.135,-1.20,.11,.034,.17,'#687c71',warehouse,false);
 box(x,1.004,-1.776,.175,.043,.057,'#9caa98',warehouse,false);
}
box(.79,.346,-1.078,.419,.181,.018,'#93b2a9',warehouse,false);
for(let i=0;i<5;i++)box(.79,.289+i*.027,-1.068,.36,.009,.015,'#728c83',warehouse,false);
const freezerTag=labelArt(224,84,(c,w,h)=>{
 c.fillStyle='#d8dfce';c.fillRect(0,0,w,h);
 c.fillStyle='#849f95';c.fillRect(0,0,w,21);
 linesText(c,'冷 凍 庫',w/2,50,33,'#486f68','center',true);
});
plane(-.10,.744,-1.084,.234,.088,freezerTag,warehouse);
box(-.33,.135,1.39,.69,.016,.247,'#6b8580',warehouse,false);
box(-.33,.145,1.39,.646,.009,.205,'#849d90',warehouse,false);
for(let i=0;i<13;i++)box(-.612+i*.047,.151,1.39,.018,.005,.181,'#56756f',warehouse,false);
box(1.33,.49,1.0,.86,.71,.60,'#657f75',warehouse);
box(1.33,.907,1.0,.68,.13,.49,'#abc2b7',warehouse);
cyl(1.33,.952,1.02,.305,.31,.074,mat('#879e96',.42,.17),warehouse);
tor(1.33,.992,1.02,.281,.012,'#aebbaf',warehouse,false).rotation.x=PI/2;
cyl(1.33,1.18,.83,.21,.21,.098,'#506965',warehouse).rotation.x=PI/2;
const dial=labelArt(128,128,(c,w,h)=>{
 c.fillStyle='#ecebce';c.beginPath();c.arc(64,64,60,0,TAU);c.fill();
 for(let i=0;i<28;i++){const a=i/28*TAU;c.strokeStyle='#496361';c.beginPath();c.moveTo(64+Math.cos(a)*49,64+Math.sin(a)*49);c.lineTo(64+Math.cos(a)*(i%7?53:58),64+Math.sin(a)*(i%7?53:58));c.stroke()}
 for(let j=0;j<4;j++){
  const angle=-2.48+j*1.63;
  linesText(c,String(j*5),64+34*Math.cos(angle),64+33*Math.sin(angle),10,'#57736b','center');
 }
 linesText(c,'kg',64,85,10,'#6b7c71','center');
 c.strokeStyle='#b75239';c.lineWidth=3;c.beginPath();c.moveTo(64,64);c.lineTo(91,41);c.stroke();
});
mesh(new T.CircleGeometry(.192,36),dial,1.33,1.18,.886,warehouse,false);
const boardMat=labelArt(384,224,(c,w,h)=>{
 c.fillStyle='#304e49';c.fillRect(0,0,w,h);c.strokeStyle='#84968a';c.lineWidth=2;c.strokeRect(9,9,w-18,h-18);
 linesText(c,'本日のセリ値',192,37,34,'#e7e5d1','center',true);
 ['アジ   420 円','サバ   360 円','イカ   820 円'].forEach((s,i)=>{linesText(c,s,54,86+42*i,24,'#d9dbbf');c.beginPath();c.moveTo(31,109+42*i);c.lineTo(350,109+42*i);c.stroke()})
});
box(.34,2.02,-2.07,1.92,1.14,.076,'#79694f',warehouse);
plane(.34,2.02,-2.027,1.84,1.07,boardMat,warehouse);
beam([1.50,2.49,-2.004],[3.2,2.49,-2.004],.027,'#6c8179',warehouse);
for(let k=0;k<4;k++){
 const x=1.79+k*.336,z=-1.944,c=k<2?'#445e57':'#83724d',sole=k<2?'#52635c':'#675b48';
 cyl(x,2.165,z,.091,.072,.312,c,warehouse,14);
 tor(x,2.324,z,.085,.013,sole,warehouse).rotation.x=PI/2;
 cyl(x,2.323,z,.073,.073,.011,'#41534d',warehouse,12,false);
 ball(x,2.011,z+.085,.080,.091,.157,c,warehouse);
 const tread=box(x,1.95,z+.085,.153,.038,.256,sole,warehouse);tread.rotation.y=(k%2?1:-1)*.10;
 for(let j=0;j<6;j++)box(x,1.937,z-.02+j*.039,.137,.014,.015,c,warehouse,false);
 path([[x,2.347,z],[x,2.389,z-.012],[x+.026,2.457,z-.025],[x+.043,2.48,z-.053]],.01,'#777a63',warehouse);
}
function causticPanel(x,y,z,w,h,p){
 const m=new T.ShaderMaterial({
 uniforms:{t:renderTime,light:cloudLight,overcast:cloudPass,cloudBand,projectionReach:{value:p===warehouse?1.90:.72}},transparent:true,side:T.DoubleSide,depthWrite:false,
 vertexShader:`
  varying vec2 u;varying vec3 wp;
  void main(){u=uv;vec4 p=modelMatrix*vec4(position,1.);wp=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}
 `,
 fragmentShader:`
  varying vec2 u;varying vec3 wp;uniform float t,light,overcast,projectionReach;
  ${sunlightField}
  void main(){
   vec2 waterOrigin=wp.xz+vec2(wp.y*projectionReach,-wp.y*.37);
   float k=waterLightField(waterOrigin,t)*cloudTransmission(waterOrigin,overcast);
   float fade=smoothstep(0.,.22,min(u.x,1.-u.x))*smoothstep(0.,.23,min(u.y,1.-u.y));
   float fill=.40+.60*smoothstep(.05,.74,u.y);
   gl_FragColor=vec4(.76,.99,.91,k*light*.60*fade*fill);
  }
 `});
 const o=plane(x,y,z,w,h,m,p);o.rotation.x=PI/2;return o;
}
box(0,3.598,0,6.99,.052,4.20,'#c2c8b0',warehouse);
causticPanel(0,3.561,0,6.8,3.9,warehouse);
for(const x of [-2.46,0,2.46])box(x,3.514,0,.094,.093,4.16,'#82958a',warehouse);
const shaftMotes=[];
const warmSpill=new T.ShaderMaterial({
 uniforms:{time:renderTime,light:cloudLight},transparent:true,depthWrite:false,
 vertexShader:`
  varying vec2 uvLight;varying vec3 wp;
  void main(){uvLight=uv;vec4 p=modelMatrix*vec4(position,1.);wp=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}
 `,
 fragmentShader:`
  varying vec2 uvLight;varying vec3 wp;uniform float time,light;
  ${sunlightField}
  void main(){
   vec2 uv=(uvLight-.5)*2.;
   float fringe=1.-smoothstep(.52,.98,length(uv)+.055*sin(uv.x*17.+uv.y*20.));
   float shimmer=.71+.29*waterLightField(wp.xz,time);
   gl_FragColor=vec4(.98,.89,.65,fringe*light*shimmer*.40);
  }
 `
});
function beamFootprint(point,axis,r,p,illumination){
 const surface=warmSpill.clone();surface.uniforms.time=renderTime;surface.uniforms.light=illumination;
 const o=flat(point.x,.141,point.z,r*3.6,r*1.7,surface,p);
 o.rotation.z=Math.atan2(-axis.z,axis.x);
 o.renderOrder=11;
}
function shaft(a,b,w0,w1,p,peak=.12){
 const g=new T.BufferGeometry();const l=vec(...a),r=vec(...b),axis=r.clone().sub(l);
 const x=axis.clone().cross(vec(.1,.3,1)).normalize(),z=axis.clone().cross(x).normalize();
 const ar=[],uv=[],is=[];
 for(let i=0;i<9;i++){
   const ang=i/8*TAU;
   for(let j=0;j<2;j++){
     const pt=(j?r:l).clone().addScaledVector(x,Math.cos(ang)*(j?w1:w0)).addScaledVector(z,Math.sin(ang)*(j?w1:w0));
     ar.push(...pt);uv.push(i/8,j);
   }
   if(i){const k=i*2;is.push(k-2,k-1,k,k-1,k+1,k)}
 }
 g.setAttribute('position',new T.Float32BufferAttribute(ar,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(is);
 const illumination={value:1};
 const m=new T.ShaderMaterial({uniforms:{light:illumination,peak:{value:peak}},side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
 vertexShader:'varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'varying vec2 u;uniform float light,peak;void main(){gl_FragColor=vec4(1.,.87,.51,peak*light*(1.-smoothstep(.38,1.,u.y))*(.55+.45*sin(u.x*31.4)*sin(u.x*31.4)));}'});
 const o=mesh(g,m,0,0,0,p,false);o.renderOrder=12;
 if(p===warehouse)beamFootprint(r,axis,w1,p,illumination);
 const points=new T.BufferGeometry();
 const dust=Array.from({length:14},()=>[rr(.03,.94),rr(0,TAU),rr(.16,.81),rr(.5,1.9)]);
 const pos=new T.BufferAttribute(new Float32Array(dust.length*3),3).setUsage(T.DynamicDrawUsage);
 points.setAttribute('position',pos);
 const speck=new T.ShaderMaterial({
  uniforms:{light:illumination},transparent:true,depthWrite:false,
  vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(7./-p.z,1.25,3.2);gl_Position=projectionMatrix*p;}',
  fragmentShader:'uniform float light;void main(){float s=1.-smoothstep(.23,.50,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.91,.68,s*light*.68);}'
 });
 const motes=new T.Points(points,speck);motes.frustumCulled=false;motes.renderOrder=13;p.add(motes);
 const flecks=new T.BufferGeometry();
 const spray=new T.BufferAttribute(new Float32Array(8*3),3).setUsage(T.DynamicDrawUsage);
 flecks.setAttribute('position',spray);
 const material=new T.LineBasicMaterial({color:'#ffe5ae',transparent:true,opacity:.28,depthWrite:false});
 const streaks=new T.LineSegments(flecks,material);streaks.frustumCulled=false;streaks.renderOrder=15;p.add(streaks);
 shaftMotes.push({p,l,axis,x,z,w0,w1,dust,pos,spray,material,illumination});
}
shaft([-3.47,2.97,-.82],[-.05,.19,.54],.265,.43,warehouse,.108);
shaft([-3.45,2.95,-.2],[.17,.19,1.19],.207,.38,warehouse,.095);
shaft([-3.47,2.94,-1.41],[-.40,.19,-.55],.169,.28,warehouse,.085);

const waiting=group(-9.53,SHORE,5.21);waiting.rotation.y=PI/2;
const W=5.14,D=3.31,H=2.77;
box(0,.082,0,W+.32,.165,D+.38,'#aaaba0',waiting);
box(0,H*.5,-D/2,W,H,.15,'#c4ceba',waiting);
for(const s of [-1,1]){
 box(s*W/2,H*.5,0,.154,H,D,'#d3d8c0',waiting);
 for(let j=0;j<10;j++)box(s*(W/2+.08),.24+j*.24,0,.014,.012,D,'#a2b3a6',waiting,false);
 const a=group(s*2.657,1.67,-.5,waiting);a.rotation.y=s*PI/2;
 windowBox(a,0,0,0,1.24,1.0,'#577b77');
}
const front=1.668;
const waitingGlass=glazing.clone();waitingGlass.opacity=.122;
waitingGlass.onBeforeCompile=shader=>{
 glazing.onBeforeCompile(shader);
 shader.vertexShader='varying vec3 paneWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npaneWorld=(modelMatrix*vec4(position,1.)).xyz;');
 shader.fragmentShader='varying vec3 paneWorld;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
   float angle=1.-abs(normalize(cameraPosition-paneWorld).x);
   float skyGlint=smoothstep(.43,1.37,rainPane.y+.16*sin(paneWorld.z*.72));
   float softFade=.45+.55*cos(paneWorld.z*.53+paneWorld.y*.23);
   float glassGlow=skyGlint*softFade*(.083+.138*pow(angle,2.));
   diffuseColor.a=clamp(diffuseColor.a+glassGlow,0.,.29);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.72,.91,.88),glassGlow*2.);
 `);
};
box(0,2.60,front,W,.32,.16,'#c2cebb',waiting);
box(0,.19,front,W,.16,.159,'#668f87',waiting);
for(let i=0;i<5;i++){
 const x=-2.05+i*1.025;
 for(const f of [-1,1])box(x+f*.49,1.33,front,.065,2.21,.089,'#4c7877',waiting);
 const glass=plane(x,1.32,front+.008,.94,2.03,waitingGlass,waiting);glass.renderOrder=9;
 box(x,2.345,front,.97,.063,.084,'#5d817b',waiting);
 box(x,.291,front,.97,.068,.084,'#5d817b',waiting);
 if(i!==2)box(x,.62,front,.95,.041,.054,'#5c8884',waiting);
}
box(.345,1.14,front+.08,.037,.24,.043,'#b9bd9e',waiting);
roof(waiting,W,D,2.74,.61,['#698484','#7f9992','#526e71','#738f8b','#87a09a'],.23);
for(const x of [-2.08,.72,2.44])beads.push({p:waiting,x,y:2.65,z:1.94,phase:3.6+x*.74});
box(0,2.63,1.79,2.94,.44,.074,'#48716e',waiting);
sign('汐凪のりば','待合所  /  FERRY WAITING ROOM',0,2.63,1.835,2.88,.391,waiting,['#547d77','#eff1d4','#e0d5ac']);
for(let i=0;i<11;i++)box(0,.17,-1.47+i*.277,W-.30,.018,.011,'#928f79',waiting,false);
const benchOak=canvasMat(512,96,(c,w,h)=>{
 c.fillStyle='#ad9373';c.fillRect(0,0,w,h);
 for(let i=0;i<148;i++){
  const x=rr(0,w),y=rr(0,h),l=rr(18,w*.67),g=rr(-4,4);
  c.strokeStyle=pick(['#d3b99164','#765f4150','#c4a97d91','#e4cd8e41']);
  c.lineWidth=rr(.4,2.8);
  c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+l*.30,y-g,x+l*.68,y+g,x+l,y+g*.35);c.stroke();
 }
 for(const [x,y,k] of [[82,29,1],[312,67,.67],[458,18,.5]]){
  for(let i=0;i<4;i++){
   c.strokeStyle=i%2?'#967b5e70':'#ccb38987';c.lineWidth=1.1;
   c.beginPath();c.ellipse(x,y,(6+i*8)*k,(1.7+i*1.84)*k,.047,0,TAU);c.stroke();
  }
 }
},true);
benchOak.roughness=.67;
function bench(g,x,z,L){
 for(let i=0;i<4;i++)box(x,.523,z+(i-1.5)*.109,L,.055,.094,benchOak,g);
 for(let i=0;i<3;i++)box(x,.70+i*.124,z-.216,L,.092,.039,benchOak,g);
 for(const side of [-1,1]){
   box(x+side*L*.42,.35,z,.093,.35,.334,'#5b7163',g);
   box(x+side*L*.42,.688,z-.225,.063,.64,.066,'#60776b',g);
   for(let j=0;j<3;j++)cyl(x+side*L*.42,.70+j*.124,z-.190,.016,.016,.011,'#a8a795',g,8,false).rotation.x=PI/2;
 }
}
bench(waiting,-.48,-.93,2.89);
bench(waiting,-.68,.77,2.19);
box(1.68,.53,-1.12,.81,.69,.44,'#958167',waiting);
box(1.68,.9,-1.12,.87,.09,.52,'#a38c66',waiting);
box(1.68,.221,-1.116,.73,.071,.44,'#7d7660',waiting,false);
for(const side of [-1,1]){
 box(1.68+side*.186,.541,-.891,.351,.566,.028,'#9b886d',waiting);
 box(1.68+side*.050,.614,-.868,.025,.076,.019,'#768378',waiting,false);
}
const schedule=labelArt(320,232,(c,w,h)=>{
 c.fillStyle='#e5dfbe';c.fillRect(0,0,w,h);c.fillStyle='#618889';c.fillRect(0,0,w,48);
 linesText(c,'連絡船  時刻表',w/2,24,26,'#f8eed5','center',true);
 ['07:10      08:45','11:30      13:05','15:30      17:20'].forEach((s,i)=>{linesText(c,s,29,81+44*i,23,'#516c68');c.fillStyle='#a6afa0';c.fillRect(18,102+44*i,280,2)});
 linesText(c,'汐凪港   →   小島',w/2,215,17,'#7e7863','center');
});
box(-.98,1.72,-1.556,1.16,.83,.06,'#9a8869',waiting);
plane(-.98,1.72,-1.522,1.09,.786,schedule,waiting);
const clockArt=labelArt(128,128,(c)=>{
 c.fillStyle='#e8e8ca';c.beginPath();c.arc(64,64,63,0,TAU);c.fill();
 for(let i=0;i<12;i++)linesText(c,''+(i||12),64+46*Math.sin(i/12*TAU),64-46*Math.cos(i/12*TAU),14,'#425959','center');
 c.strokeStyle='#3e5752';c.lineWidth=5;c.lineCap='round';c.beginPath();c.moveTo(42,40);c.lineTo(64,64);c.lineTo(89,60);c.stroke();
});
cyl(.48,2.16,-1.531,.246,.246,.069,'#59716b',waiting).rotation.x=PI/2;
const clockMesh=mesh(new T.CircleGeometry(.217,38),clockArt,.48,2.16,-1.493,waiting,false);clockMesh.rotation.z=-.13;
box(1.60,1.06,-1.09,.53,.24,.20,'#6b6756',waiting);
box(1.60,1.057,-.983,.46,.166,.015,'#b7a681',waiting);
box(1.687,1.103,-.971,.185,.043,.011,'#596e64',waiting);
for(let i=0;i<8;i++)box(1.613+i*.019,1.100,-.963,.003,.012,.006,'#d5c798',waiting,false);
box(1.679,1.104,-.96,.005,.021,.006,'#b97a51',waiting,false);
for(let i=0;i<7;i++)box(1.408+i*.022,1.06,-.971,.008,.101,.009,'#746d54',waiting,false);
cyl(1.78,1.05,-.96,.036,.036,.027,'#655e4e',waiting,12).rotation.x=PI/2;
beam([1.42,1.17,-1.11],[1.21,1.54,-1.16],.012,'#74928a',waiting);
cyl(2.03,1.10,-1.17,.09,.124,.30,'#dcddc5',waiting);
cyl(2.03,1.267,-1.17,.087,.088,.056,'#889990',waiting);
tor(2.13,1.13,-1.17,.070,.013,'#8a9d92',waiting);
cyl(2.03,1.302,-1.17,.026,.036,.025,'#788a7f',waiting,12,false);
path([[1.956,1.107,-1.16],[1.923,1.153,-1.163],[1.883,1.206,-1.162]],.024,'#c3cdb6',waiting);
cyl(2.05,.29,.37,.176,.129,.261,'#a87359',waiting,11);
cyl(2.05,.418,.37,.169,.169,.017,'#625e49',waiting,11,false);
const pothosGeo=new T.BufferGeometry();
pothosGeo.setAttribute('position',new T.Float32BufferAttribute([
  0,.023,-.050, -.05,.006,-.083, -.089,.004,-.053, -.082,.001,.007,
  -.043,-.007,.079, 0,-.025,.129, .042,-.007,.080,.082,.001,.007,
  .089,.004,-.053,.05,.006,-.083, 0,.040,.012
],3));
pothosGeo.setIndex([0,1,10,1,2,10,2,3,10,3,4,10,4,5,10,5,6,10,6,7,10,7,8,10,8,9,10,9,0,10]);pothosGeo.computeVertexNormals();
const pothosTints=['#799a5d','#607f51','#799d6c'].map(c=>{const m=mat(c).clone();m.side=T.DoubleSide;return m});
for(let i=0;i<15;i++){
 const a=rr(0,TAU), l=rr(.16,.35),x=2.05+Math.cos(a)*l,z=.37+Math.sin(a)*l,y=rr(.47,.88);
 beam([2.05,.405,.37],[x,y,z],.013,'#68945f',waiting,5,false);
 const leaf=mesh(pothosGeo,pick(pothosTints),x,y,z,waiting,false);
 leaf.scale.setScalar(rr(.82,1.27));
 leaf.rotation.set(rr(-.6,.6),a,rr(-.56,.56));
}

const hillPalette=['#698d65','#74986c','#8fa575','#6c9a73','#a0ab76','#628779'];
const hillSurface=[];
const hillGround=hillPalette.map(color=>{
 const m=mat(color,.91).clone();
 m.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 hillside;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   hillside=(modelMatrix*vec4(position,1.)).xyz;
  `);
  shader.fragmentShader='varying vec3 hillside;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 a=hillside.xz;
   float growth=sin(a.x*6.4+sin(a.y*4.1)*1.32)*cos(a.y*6.9-a.x*1.3);
   float gravel=sin(a.x*73.+a.y*19.)*cos(a.y*86.-a.x*8.);
   float groundShade=mix(.90,1.03,smoothstep(1.03,1.83,hillside.y));
   diffuseColor.rgb*=groundShade+growth*.039+gravel*.017;
  `);
 };
 return m;
});
for(let i=0;i<30;i++){
 const x=rr(-13.55,-4.2),z=rr(-13.50,-9.3);
 const f=(1-Math.abs(x+9.45)/8);
 hillSurface.push(ico(x,.92+f*.18,z,rr(.92,2.4),rr(1.1,2.6)*f,rr(.8,1.6),pick(hillGround),stage,1));
}
stage.updateMatrixWorld(true);
const terrainProbe=new T.Raycaster(vec(0,8,0),vec(0,-1,0));
function hillY(x,z){
 terrainProbe.ray.origin.set(x,8,z);
 return Math.max(SHORE,terrainProbe.intersectObjects(hillSurface,false)[0]?.point.y||SHORE);
}
function tree(x,y,z,h){
 const g=group(x,y,z);
 const rng=rr(.27,.46)*h;
 beam([0,0,0],[.08,h*.89,.07],h*.058,'#736e53',g,7);
 for(let i=0;i<3;i++)beam([0,h*(.46+i*.14),0],[Math.sin(i*2.4)*rng,h*(.67+i*.11),Math.cos(i*2.4)*rng],h*.038,'#857b5f',g,6);
 const leaves=group(0,h*.55,0,g);
 ico(.02,h*.31,0,h*.40,h*.44,h*.38,pick(hillPalette),leaves,1);
 const sunLeaves=['#a5ae77','#95aa77','#a0ad7e'];
 for(let j=0;j<5;j++){
  const a=j*2.37+.21;
  ico(Math.cos(a)*h*.30,h*(.48+.11*Math.sin(a*.81)),Math.sin(a)*h*.24,h*.128,h*.132,h*.147,sunLeaves[j%3],leaves,1,false);
 }
 for(let i=0;i<7;i++){const a=i/7*TAU;ico(Math.cos(a)*rng*.68,rr(.05,.4)*h,Math.sin(a)*rng*.68,rr(.21,.32)*h,rr(.22,.35)*h,rr(.22,.33)*h,pick(hillPalette),leaves,1)}
 foliage.push({g:leaves,under:false,x,z,phase:rr(0,TAU),a:rr(.025,.067)});
}
for(const [x,y,z,h] of [[-13.13,1.8,-12.7,2.86],[-12.44,2.6,-13.16,2.56],[-10.86,2.9,-13.1,3.0],[-9.52,3.12,-12.94,3.46],[-8.32,2.89,-13.03,2.86],[-7.12,2.64,-13.32,2.71],[-5.92,2.15,-12.91,2.71],[-4.7,1.56,-12.84,2.35],[-13.36,1.99,-10.65,2.79],[-12.0,2.36,-10.88,2.04],[-11.34,2.71,-11.6,1.86],[-9.69,2.76,-10.63,1.65],[-7.47,2.25,-9.93,1.50],[-5.50,2.18,-11.60,2.14],[-4.25,1.47,-11.44,1.85],[-5.16,1.53,-9.28,1.70]])tree(x,y,z,h);
function house(x,y,z,w,d,col,roofColors,rot){
 const g=group(x,y,z);g.rotation.y=rot;
 box(0,-.125,0,w+.05,.352,d+.05,'#999a82',g);
 box(0,.62,0,w,1.29,d,col,g);
 box(0,.09,0,w+.09,.13,d+.09,'#a4a690',g);
 for(let i=0;i<8;i++)box(0,.16+i*.135,d/2+.006,w,.011,.013,tint(col,.85),g,false);
 roof(g,w,d,1.27,.49,roofColors,.16);
 for(const side of [-1,1]){
  const tip=ico(side*(w*.535+.01),1.818,0,.072,.071,.096,roofColors[2],g,1);
  tip.rotation.z=.19*side;
 }
 const gutterZ=d*.5+.192;
 beam([-w*.52,1.255,gutterZ],[w*.52,1.255,gutterZ],.024,'#81918a',g,7,false);
 path([[w*.49,1.24,gutterZ],[w*.49,1.18,d*.5+.061],[w*.49,.15,d*.5+.058],[w*.45,.081,d*.5+.122]],.020,'#8c9584',g);
 windowBox(g,-w*.245,.74,d/2+.035,w*.228,.43,'#67807a');
 windowBox(g,w*.245,.77,d/2+.035,w*.230,.37,'#67807a');
 for(const x of [-w*.412,w*.410]){
  box(x,.742,d*.5+.074,w*.077,.414,.023,'#a39575',g);
  for(let i=0;i<5;i++)box(x,.58+i*.081,d*.5+.087,w*.073,.020,.013,'#877d63',g,false);
 }
 box(.09,.32,d/2+.047,.27,.58,.034,'#7a8e80',g);
 box(.09,.646,d/2+.073,.37,.049,.143,roofColors[2],g).rotation.x=.14;
 ball(.174,.32,d/2+.076,.018,.017,.012,'#aa986c',g,false);
 box(.15,.07,d/2+.096,.37,.087,.18,'#aaa993',g);
 cyl(w*.29,1.68,-d*.24,.079,.095,.57,'#ad8872',g,7);
}
house(-12.4,2.43,-11.45,1.64,1.39,'#e7dcbb',['#7b7777','#8f8980','#646d6b'],.38);
house(-10.42,3.02,-11.40,1.94,1.48,'#e8e1c4',['#8c6860','#9f7868','#745c53'],.21);
house(-8.64,2.67,-10.55,1.58,1.27,'#d9d9bd',['#74858a','#859da0','#5b7375'],.41);
house(-6.72,hillY(-6.72,-10.89)-.09,-10.89,1.54,1.23,'#e9d7ad',['#a26e5d','#b3816a','#805d53'],.12);
for(let i=0;i<19;i++){
 const x=-12.82+i*.445,z=-9.07+.25*Math.cos(i*.35),y=1.27+.09*Math.sin(i*.35);
 box(x,y,z,.067,.53,.068,'#a49069');
 if(i)beam([x-.445,y+.16,z],[x,y+.16,z],.025,'#ac9a76',stage,6,false)
}

const tower=group(outerPier.towerX,.85,outerPier.towerZ);
cyl(0,.115,0,.975,1.04,.23,'#a3aaa0',tower,12);
cyl(0,.32,0,.63,.69,.23,'#d7d7bf',tower,18);
const rings=[[.45,.57,.63,'#e7dfca'],[.99,.539,.57,'#c75143'],[1.53,.507,.539,'#f2e7d0'],[2.07,.477,.507,'#c55647'],[2.61,.447,.477,'#ebe4cd'],[3.15,.417,.447,'#cc5c4d']];
function lightTowerPaint(color){
 const m=mat(color,.72).clone();
 m.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 beaconUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbeaconUV=uv;');
  shader.fragmentShader='varying vec2 beaconUV;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 a=beaconUV;
   vec2 grit=a*vec2(193.,109.);
   float pixel=fract(sin(dot(floor(grit),vec2(41.3,105.8)))*7162.85);
   float fleck=(pixel-.5)*(1.-smoothstep(.32,1.25,length(fwidth(grit))));
   float salt=smoothstep(.66,.97,sin(a.x*63.8+sin(a.y*13.8)*1.7)*sin(a.x*124.9+a.y*24.1));
   float lip=(1.-smoothstep(0.,.080,min(a.y,1.-a.y)));
   diffuseColor.rgb=mix(diffuseColor.rgb*(1.+fleck*.084-lip*.062),vec3(.58,.57,.43),salt*.056);
  `);
 };
 return m;
}
for(const [y,a,b,c] of rings)cyl(0,y+.177,0,a,b,.54,lightTowerPaint(c),tower,32);
cyl(0,3.65,0,.654,.476,.159,'#ece3c8',tower,30);
cyl(0,3.76,0,.677,.677,.068,'#947563',tower,30);
const beaconMat=new T.MeshStandardMaterial({color:'#e5bf6a',emissive:'#ffbd51',emissiveIntensity:.23,roughness:.3});
cyl(0,4.06,0,.248,.285,.48,beaconMat,tower,24);
cyl(0,4.07,0,.387,.42,.55,glazing,tower,20,false);
for(let i=0;i<8;i++){
 const a=i*TAU/8,x=Math.cos(a),z=Math.sin(a);
 beam([.406*x,3.78,.406*z],[.38*x,4.37,.38*z],.027,'#506962',tower);
 beam([.643*x,3.77,.643*z],[.643*x,4.14,.643*z],.016,'#646b5c',tower,6);
}
for(const y of [4.14,3.96])tor(0,y,0,.644,.019,'#5f7567',tower).rotation.x=PI/2;
edge(cyl(0,4.40,0,.54,.51,.112,'#c55445',tower,24),'#884f43',.28,37);
cyl(0,4.555,0,.09,.55,.233,'#bd5248',tower,24);
cyl(0,4.76,0,.045,.061,.272,'#746356',tower,12);
ball(0,4.91,0,.063,.062,.063,'#b49b64',tower);
box(.01,1.01,.553,.26,.56,.065,'#526f69',tower);
box(0,1.71,.523,.16,.133,.055,'#65858a',tower);
sign('汐 凪','灯 台',0,.54,.612,.28,.15,tower);

const galleryPegs=[[-.129,1.19,.583],[-.129,.843,.583]];
for(const [x,y,z] of galleryPegs){
 box(x,y,z,.044,.071,.027,'#798a76',tower);
}
ball(.079,1.017,.597,.023,.021,.018,'#c0a373',tower);
box(0,.710,.567,.304,.038,.093,'#949482',tower);
for(const y of [1.662,1.755])box(0,y,.552,.182,.025,.036,'#b3b6a1',tower);
for(const x of [-.083,.083])box(x,1.713,.55,.021,.091,.036,'#a8b09c',tower);
for(let i=0;i<8;i++){
 const a=i*TAU/8+.18;
 const x=Math.sin(a),z=Math.cos(a);
 beam([x*.39,3.584,z*.39],[x*.59,3.692,z*.59],.022,'#ad9c79',tower,5);
}
for(let i=0;i<5;i++){
 tor(0,3.90+i*.081,0,.257-.001*i,.014,'#cbac65',tower).rotation.x=PI/2;
}
const beaconTurn=group(0,4.08,0,tower);
const beaconLens=cyl(.243,0,0,.104,.104,.076,'#e4cb83',beaconTurn,18,false);beaconLens.rotation.z=PI/2;
const beaconGlowArt=canvasMat(128,128,(c,w,h)=>{
 const q=c.createRadialGradient(64,64,0,64,64,63);
 q.addColorStop(0,'#fff7bdbe');q.addColorStop(.18,'#ffec97a1');q.addColorStop(.45,'#ffe1912e');q.addColorStop(1,'#ffe8a700');
 c.fillStyle=q;c.fillRect(0,0,w,h);
},false,true);
const beaconAura=plane(outerPier.towerX,4.93,outerPier.towerZ,2.7,2.7,beaconGlowArt);
beaconAura.material.opacity=0;
beaconAura.material.alphaTest=0;
beaconAura.material.blending=T.AdditiveBlending;
beaconAura.material.depthTest=false;
beaconAura.renderOrder=19;


const crateSeal=canvasMat(256,72,(c,w,h)=>{
 c.fillStyle='#d9dfc9';c.fillRect(0,0,w,h);
 c.strokeStyle='#91a89b';c.lineWidth=4;c.strokeRect(5,5,w-10,h-10);
 linesText(c,'汐凪  鮮魚',w/2,h/2,40,'#508180','center',true);
});
for(const [x,y,z] of [[-2.06,1.47,-1.051],[-1.75,.702,.91],[1.57,1.17,-1.19],[2.37,.697,-.55]]){
 box(x,y,z+.026,.371,.106,.025,'#b0b9a5',warehouse,false);
 plane(x,y,z+.041,.36,.097,crateSeal,warehouse);
}
const dockLedger=canvasMat(256,176,(c,w,h)=>{
 c.fillStyle='#ded5ab';c.fillRect(0,0,w,h);c.fillStyle='#7f978a';c.fillRect(0,0,w,39);
 linesText(c,'水揚げ 記録',128,19,25,'#f7efd3','center',true);
 c.strokeStyle='#8a9a86';c.lineWidth=2;
 for(let i=0;i<6;i++){c.beginPath();c.moveTo(17,55+i*20);c.lineTo(242,55+i*20);c.stroke()}
 for(let i=0;i<4;i++){c.beginPath();c.moveTo(29+i*61,43);c.lineTo(29+i*61,166);c.stroke()}
});
plane(-1.08,1.815,-2.068,.59,.405,dockLedger,warehouse).rotation.z=.052;
for(let i=0;i<3;i++)box(-1.78+i*.075,1.453,-2.045,.044,.147,.096,pick(['#756d54','#ae925e','#718e86']),warehouse,false);
box(-1.65,1.368,-1.977,.66,.039,.253,'#9c9074',warehouse);
const fishTray=group(.42,1.071,-1.31,warehouse);
box(0,0,0,.56,.038,.314,'#8baaa6',fishTray);
for(const s of [-1,1]){
 box(s*.276,.029,0,.022,.057,.327,'#a4b8ae',fishTray);
 box(0,.030,s*.160,.59,.057,.024,'#a4b8ae',fishTray);
}
for(let i=0;i<5;i++){
 const f=group(-.16+i*.08,.071,rr(-.027,.028),fishTray);f.rotation.y=rr(-.48,.36);
 ball(0,0,0,.036,.025,.102,'#74969b',f,false);
 ball(-.005,.006,-.017,.031,.015,.071,'#c7d3c4',f,false);
 ico(0,.006,.091,.053,.012,.033,'#6d8e90',f,0,false);
 ball(.016,.020,-.070,.007,.007,.007,'#3e6766',f,false);
}
for(const [x,z,k] of [[-4.89,-9.10,0],[-5.84,-8.88,1],[-6.70,-8.87,2]]){
 for(let i=0;i<5;i++){
  const a=rr(0,TAU),r=rr(.08,.37),px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;
  const h=rr(.065,.179);
  beam([px,1.05,pz],[px+.035,1.05+h,pz+.04],.008,'#698e6f',stage,5,false);
  ball(px+.035,1.05+h,pz+.04,.028,.022,.028,k%2?'#caad79':'#dbd6aa',stage,false);
 }
}
for(let i=0;i<6;i++){
 const x=-3.9-i*.225,y=1.07+i*.082,z=-9.91-i*.100;
 const stair=box(x,y-.09,z,.26,.18+i*.04,.79-i*.032,pick(['#a1a390','#bebca7','#b7b39f']));
 stair.rotation.y=-.24;
 if(i%2===0)ico(x,1.06,z+.487,.19,.13,.15,'#a2a892',stage,0,false);
}


const villageWay=[[-3.88,-9.68],[-4.24,-9.89],[-4.79,-10.12],[-5.17,-10.32],[-5.58,-10.41],[-5.98,-10.51],[-6.45,-10.32],[-6.90,-10.10],[-7.32,-10.14],[-7.71,-10.43],[-8.09,-10.83]];
const street=new T.CatmullRomCurve3(villageWay.map(([x,z])=>vec(x,0,z)));
function laneEdge(t,side,extra=0){
 const p=street.getPointAt(t),n=street.getTangentAt(t);
 const w=side*(.19+.049*Math.sin(t*8.3)+extra);
 p.x+=w*n.z;p.z-=w*n.x;p.y=hillY(p.x,p.z);
 return p;
}
const paving=['#bdb49d','#c1b89c','#b5ac91','#cbbda0'].map(c=>{
 const m=mat(c).clone();m.side=T.DoubleSide;return m;
});
for(let j=0;j<33;j++){
 const a=(j+.014)/33,b=(j+.984)/33;
 const corners=[laneEdge(a,-1),laneEdge(a,1),laneEdge(b,1),laneEdge(b,-1)];
 const face=new T.BufferGeometry();
 face.setAttribute('position',new T.Float32BufferAttribute(corners.flatMap(p=>[p.x,p.y+.036,p.z]),3));
 face.setIndex([0,2,1,0,3,2]);face.computeVertexNormals();
 mesh(face,paving[j%paving.length],0,0,0,stage,false);
}
for(let i=0;i<14;i++){
 const t=.11+i*.058;
 const p=laneEdge(t,-1,.078),n=street.getTangentAt(t);
 const down=laneEdge(t,-1,.177);
 const h=clamp(p.y-down.y+.13,.071,.32);
 const b=box(p.x,p.y-h*.46+.035,p.z,.245,h,.17,paving[i%4],stage,false);
 b.rotation.y=-Math.atan2(n.z,n.x);
}
function summerFlowers(x,y,z,s,phase){
 const bush=group(x,y,z);bush.scale.setScalar(s);
 const greens=['#6c8c69','#628769','#879a72'];
 const flowers=['#8ba5b8','#9cabc1','#7e9eb6','#adadbf','#a8b6c7'];
 for(let i=0;i<9;i++){
  const a=i*2.39+phase,p=vec(Math.cos(a)*(.16+.11*Math.sin(i*8)),.21+(i%3)*.052,Math.sin(a)*.22);
  beam([0,0,0],p,.010,greens[i%3],bush,5,false);
  const leaf=ball(p.x*.81,p.y*.68,p.z*.89,.102,.026,.058,greens[i%3],bush,false);
  leaf.rotation.set(.32*Math.sin(a),a,.16);
  if(i%2===0)for(let k=0;k<7;k++){
   const b=k*2.38,g=k?.052:0;
   ico(p.x+Math.cos(b)*g,p.y+.041+(k%2)*.012,p.z+Math.sin(b)*g,.041,.035,.041,flowers[(i+k)%flowers.length],bush,0,false);
  }
 }
 foliage.push({g:bush,under:false,x,z,phase,a:.035});
}
for(const [t,side,s,phi] of [[.17,-1,.79,1.9],[.37,1,.92,3.2],[.53,-1,.87,.7],[.68,1,1.04,2.4],[.89,-1,.72,4.1]]){
 const p=laneEdge(t,side,.207);summerFlowers(p.x,p.y+.018,p.z,s,phi);
}
for(let i=0;i<27;i++){
 const t=(i+.5)/29, side=i%3===0?1:-1;
 const p=laneEdge(t,side,.14+(i%4)*.049);
 const height=.10+(i%5)*.018;
 const c=['#6f8968','#8d9a6d','#9c9e74'][i%3];
 for(let j=0;j<3;j++){
  const dx=(j-1)*.047,dz=.034*Math.cos(i*2+j);
  beam([p.x,p.y,p.z],[p.x+dx,p.y+height*(1-.22*Math.abs(j-1)),p.z+dz],.009,c,stage,4,false);
 }
 if(i%5===1)ico(p.x+.062,p.y+.023,p.z+.025,.065,.034,.049,'#a4a38a',stage,0,false);
}
const hillPost=group(-3.91,SHORE,-9.61);
beam([0,0,0],[0,.62,0],.024,'#7c8976',hillPost,6);
const hillBoard=sign('山手','集 落',0,.51,.029,.42,.20,hillPost,['#829a89','#ece2bb','#9fa991']);
hillPost.rotation.y=.41;

