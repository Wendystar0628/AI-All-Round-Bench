'use strict';
const groundTex=canvasMat(512,512,(c,w,h)=>{
 c.fillStyle='#bbc2b8';c.fillRect(0,0,w,h);
 for(let i=0;i<190;i++){
   const x=rr(0,w),y=rr(0,h),r=rr(7,69),g=c.createRadialGradient(x,y,0,x,y,r);
   g.addColorStop(0,pick(['#f7ecce34','#647f7b46','#507d792c','#e8f3eb58']));g.addColorStop(1,'#889b9b00');
   c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
 }
 for(let i=0;i<7400;i++){c.fillStyle=i%2?'#48595b24':'#ffffff3b';c.fillRect(rr(0,w),rr(0,h),rr(.3,3),rr(.3,2))}
},true);
groundTex.roughness=.52;
groundTex.onBeforeCompile=shader=>{
 shader.uniforms.overcast=cloudPass;
 shader.uniforms.cloudBand=cloudBand;
 shader.vertexShader='varying vec3 dockPos;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n dockPos=(modelMatrix*vec4(position,1.)).xyz;');
 shader.fragmentShader='uniform float overcast; varying vec3 dockPos;\n'+sunlightField+'\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  vec2 p=dockPos.xz;
  float fleck=.5+.26*sin(p.x*3.1+p.y*2.5)+.24*sin(p.x*6.3-p.y*3.7);
  float wet=smoothstep(.34,.85,sin(p.x*.6+p.y*.92)*cos(p.x*.7-p.y*.31)+fleck*.44);
  float daylight=cloudTransmission(p,overcast);
  float lowAngle=pow(1.-clamp(normalize(cameraPosition-dockPos).y,0.,1.),2.);
  diffuseColor.rgb *= (1.-wet*.112)*mix(1.,daylight,.27);
  diffuseColor.rgb += vec3(.034,.053,.048)*wet*lowAngle*daylight;
 `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
  roughnessFactor=mix(roughnessFactor,.28,wet*.85);
 `);
};
const baseEdges=box(0,-3.83,0,28.14,.47,28.14,'#455f5d');
const baseBand=box(0,-3.54,0,28.06,.16,28.06,'#76978a');
box(0,-3.40,0,28,.14,28,'#a19777');
const seabed=canvasMat(512,512,(c,w,h)=>{
 c.fillStyle='#aabca0';c.fillRect(0,0,w,h);
 for(let i=0;i<3800;i++){
   c.fillStyle=pick(['#cad0ac','#839c82','#91ad93','#dee0b5','#7e9d8c','#c1c3a2'])+'88';
   c.beginPath();c.ellipse(rr(0,w),rr(0,h),rr(.6,8),rr(.5,4),rr(0,PI),0,TAU);c.fill()
 }
},true);
seabed.onBeforeCompile=shader=>{
 shader.uniforms.tideTime=renderTime;
 shader.uniforms.tideSun=cloudLight;
 shader.uniforms.tideCloud=cloudPass;
 shader.uniforms.cloudBand=cloudBand;
 shader.vertexShader='varying vec3 seaFloor;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n seaFloor=(modelMatrix*vec4(position,1.)).xyz;');
 shader.fragmentShader='varying vec3 seaFloor; uniform float tideTime,tideSun,tideCloud;\n'+sunlightField+'\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  vec2 p=seaFloor.xz;
  float belt=waterLightField(p+vec2(1.73,-.98),tideTime);
  float shore=smoothstep(-4.45,-2.8,p.x);
  float L=cloudTransmission(p,tideCloud)*tideSun;
  diffuseColor.rgb *= vec3(.88,.943,.908)+vec3(.19,.36,.27)*belt*L*shore;
 `);
};
box(0,-3.29,0,28,.18,28,seabed);
const quarry = ['#96a29b','#839593','#a6a99a','#758b88','#9aa39b','#c0bda8'];
function blockMat(color,layer){
 const m=mat(tint(color,layer).getHex(),.88);
 if(m.userData.blockTexture)return m;
 m.userData.blockTexture=true;
 m.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 rockUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n rockUV=uv;');
  shader.fragmentShader='varying vec2 rockUV;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 p=rockUV;
    vec2 grain=p*vec2(191.,101.);
    float noise=fract(sin(dot(floor(grain),vec2(71.93,33.41)))*43712.2);
    float n=(noise-.5)*(1.-smoothstep(.38,1.6,length(fwidth(grain))));
    float rain=sin(p.x*72.+sin(p.x*122.+p.y*6.)*.73)*sin(p.y*12.+p.x*19.);
    float bleach=smoothstep(.35,.85,rain)*exp(-p.y*2.13);
    float edgeShade=1.-smoothstep(.025,.115,min(p.y,1.-p.y));
    diffuseColor.rgb *= .95+.097*n+.15*bleach-.135*edgeShade;
  `);
 };
 return m;
}
function slab(x0,x1,z0,z1,height=SHORE,wall=true){
 const w=x1-x0,d=z1-z0,x=(x0+x1)/2,z=(z0+z1)/2;
 box(x,(height-3.52)/2,z,w-.015,height+3.12,d-.015,'#6a817c');
 const cap=box(x,height-.105,z,w+.06,.21,d+.056,groundTex);cap.castShadow=false;
 const n=Math.round(w/2.7), m=Math.round(d/2.7);
 for(let j=1;j<n;j++) box(x0+w*j/n,height+.004,z,.017,.009,d-.04,'#81928b',stage,false);
 for(let j=1;j<m;j++) box(x,height+.004,z0+d*j/m,w-.04,.009,.017,'#87958d',stage,false);
 if(wall) {
   wallFace(x0,z1,x1,z1,height);
   wallFace(x1,z1,x1,z0,height);
   wallFace(x0,z0,x0,z1,height);
   wallFace(x1,z0,x0,z0,height);
 }
}
function wallFace(ax,az,bx,bz,h){
 const len=Math.hypot(bx-ax,bz-az),n=Math.ceil(len/1.55),d=len/n;
 const wall=group(ax,0,az);wall.rotation.y=-Math.atan2(bz-az,bx-ax);
 for(let j=0;j<6;j++){
   const y=h-.5-.68*j;
   for(let i=-1;i<n;i++){
     const start=Math.max(0,(i+(j%2)*.5)*d),end=Math.min(len,(i+1+(j%2)*.5)*d);
     if(end-start<.035)continue;
     const c=blockMat(pick(quarry), j<2?1:pick([.59,.69,.76]));
     const rock=box((start+end)/2,y+rr(-.028,.028),rr(0,.035),end-start-.027,rr(.608,.652),rr(.077,.117),c,wall,false);
     rock.rotation.z=rr(-.014,.014);
     if(j<3)for(let k=0;k<3;k++){const p=box(rr(start+.035,end-.035),y+rr(-.22,.22),.095,rr(.03,.21),rr(.011,.041),.007,j===1?'#637e76':'#9daaa0',wall,false);p.rotation.z=rr(-.09,.09)}
     if(j===1&&rnd()<.85)for(let k=0;k<5;k++){
       const px=rr(start+.05,end-.05),py=y-rr(.1,.25);
       cyl(px,py,.105,rr(.025,.057),.072,.055,pick(['#d4c4a3','#b7ad91','#aeb69d']),wall,6,false).rotation.x=PI/2;
     }
   }
 }
 for(let j=0;j<3;j++)box(len/2,-.04-j*.12,.097,len,rr(.014,.042),.01,['#c0c6a1','#597a6f','#4d7268'][j],wall,false);
 box(len/2,h-.17,.005,len,.14,.20,'#abb5ae',wall,false);
}
slab(-14,-5,-14,14);
slab(-5,5,-14,-7.15);
slab(5,outerPier.end,outerPier.sea,outerPier.harbor,.85);
slab(-5,-.65,7.15,14);
slab(-5,-3.5,5.25,7.15,.58);
slab(-5,-4.06,4.62,5.25,.30);
function cautionTex(){
 return canvasMat(256,64,(c,w,h)=>{
   c.fillStyle='#d8ab42';c.fillRect(0,0,w,h);c.fillStyle='#3d4b45';
   for(let i=-1;i<7;i++){const x=i*64;c.beginPath();c.moveTo(x,0);c.lineTo(x+27,0);c.lineTo(x+69,h);c.lineTo(x+41,h);c.fill()}
   for(let i=0;i<440;i++){c.fillStyle=i%2?'#d3c6a655':'#625e4140';c.fillRect(rr(0,w),rr(0,h),rr(1,9),rr(.5,3))}
 },true)
}
const caution=cautionTex();
const skyLightTexture=canvasMat(256,128,(c,w,h)=>{
 const horizon=c.createLinearGradient(0,0,0,h);
 horizon.addColorStop(0,'#8eb5bb');horizon.addColorStop(.44,'#d8e4d6');horizon.addColorStop(.58,'#b3c6bb');horizon.addColorStop(1,'#688c84');
 c.fillStyle=horizon;c.fillRect(0,0,w,h);
 const sun=c.createRadialGradient(w*.36,h*.22,1,w*.36,h*.22,h*.47);
 sun.addColorStop(0,'#fffadd');sun.addColorStop(.29,'#fff1c8ab');sun.addColorStop(1,'#f8efd500');
 c.fillStyle=sun;c.fillRect(0,0,w,h);
}).map;
skyLightTexture.mapping=T.EquirectangularReflectionMapping;
const envBake=new T.PMREMGenerator(renderer);
const harborSky=envBake.fromEquirectangular(skyLightTexture);
groundTex.envMap=harborSky.texture;
groundTex.envMapIntensity=.38;
envBake.dispose();
skyLightTexture.dispose();
function warnRail(ax,az,bx,bz,h=SHORE){
 const d=Math.hypot(bx-ax,bz-az),n=Math.ceil(d/1.02),g=group(ax,h,az);g.rotation.y=-Math.atan2(bz-az,bx-ax);
 for(let j=0;j<n;j++){
   if(j%6===5)continue;
   const b=box((j+.5)*d/n,.095,0,d/n-.035,.17,.29,caution,g);
   b.material=[caution,caution,caution,mat('#8b8b76'),caution,caution];
 }
}
warnRail(-5.29,-6.9,-5.29,4.5);
warnRail(-.85,8,-.85,13.76);
warnRail(-4.7,-7.38,4.67,-7.38);
warnRail(5.20,-9.55,8.52,-9.55,.85);

const waterPositions={value:[vec(-2.9,3,0),vec(-2.95,-3.3,0),vec(2.8,-3.1,0),vec(7.7,-7.1,0)]};
const harborReflection={value:null}, harborProjection={value:new T.Matrix4()};
const swellField={value:Array.from({length:11},()=>new T.Vector4())};
const waterMat=new T.ShaderMaterial({
 uniforms:{uTime:renderTime,uLight:cloudLight,overcast:cloudPass,cloudBand,boats:waterPositions,harborReflection,harborProjection,swellField},
 transparent:true,depthWrite:false,side:T.DoubleSide,
 vertexShader:`
 varying vec3 wp; varying vec4 mirrorUV; uniform float uTime; uniform mat4 harborProjection;
 void main(){
  vec3 p=position;
  p.z+=.023*sin(p.x*2.-p.y*1.25+uTime*1.8)+.012*cos(p.y*2.1-uTime*1.3);
  vec4 w=modelMatrix*vec4(p,1.);
  wp=w.xyz;mirrorUV=harborProjection*vec4(w.x,.04,w.z,1.);gl_Position=projectionMatrix*viewMatrix*w;
 }`,
 fragmentShader:`
 varying vec3 wp; varying vec4 mirrorUV; uniform float uTime,uLight,overcast; uniform vec3 boats[4]; uniform sampler2D harborReflection; uniform vec4 swellField[11];
 float hash(vec2 p){return fract(sin(dot(p,vec2(125.1,317.7)))*43758.5453);}
 ${sunlightField}
 void main(){
  vec2 p=wp.xz;
  float t=uTime*.56;
  float skySweep=cloudTransmission(p,overcast);
  float w=sin(p.y*3.9+sin(p.x*.96+t)*1.4+t*2.)*.62+sin(p.y*7.3-p.x*1.9-t)*.22+sin(p.x*2.4+p.y*1.25+t)*.16;
  float coast=min(abs(p.x+5.),abs(p.y+7.15));
  float depth=smoothstep(0.,7.,coast);
  vec3 col=mix(vec3(.255,.68,.586),vec3(.115,.556,.595),depth);
  float bands=floor((.53+w*.38)*5.)*.20;
  col=mix(col,vec3(.39,.80,.727),bands*.48);
  vec2 a=vec2(p.x*.89+p.y*.34,p.y*1.73);
  a+=vec2(sin(p.y*2.52+t)*.25+sin(p.x*3.4-t)*.07,cos(p.x*2.+t)*.20);
  vec2 cell=floor(a);
  vec2 f=fract(a)-.5;
  float d1=8.,d2=8.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
   vec2 of=vec2(float(i),float(j));
   vec2 hp=vec2(hash(cell+of),hash(cell+of+22.));
   float d=length(f-of-(hp-.5)*.84);
   if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;
  }
  float c=1.-smoothstep(.012,.065,d2-d1);
  float light=smoothstep(.18,.85,sin(p.x*.64+p.y*1.6+t)+.38*sin(p.x*1.4-p.y*.94));
  float gathering=waterLightField(p,uTime);
  col=mix(col,vec3(.67,.97,.88),(c*(.067+light*.21)+gathering*.089)*uLight*skySweep);
  float strokes=sin(p.y*15.+sin(p.x*1.7+t)*2.5+sin(p.x*3.1-t*1.1)+t*3.);
  float islands=sin(p.x*4.1+p.y*.77+sin(p.y*5.6-t)*.97)+.38*sin(p.x*8.5-p.y*4.8+t*.79);
  float silk=smoothstep(.82,.99,strokes)*smoothstep(.23,.88,islands);
  col=mix(col,vec3(.77,.96,.88),silk*(.11+.45*light)*uLight);
  float washed=smoothstep(.78,.97,sin(p.y*4.3+p.x*.53+sin(p.x*1.42+t*.61)+t))*smoothstep(.30,.7,cos(p.x*1.82+p.y*.58));
  col=mix(col,vec3(.51,.84,.77),washed*.34);
  float ref=0.;float bright=0.;float rust=0.;
  for(int i=0;i<4;i++){
    vec2 b=p-boats[i].xy;
    vec2 dir=vec2(sin(boats[i].z),cos(boats[i].z));
    vec2 v=vec2(dot(b,vec2(dir.y,-dir.x)),dot(b,dir));
    float smear=v.x+sin(p.y*8.8+t*3.0)*.27+sin(p.y*18.-t*5.)*.095;
    float hull=1.-smoothstep(1.0,1.24,abs(smear-.34)+pow(abs(v.y)*.334,2.0)*.65);
    ref=max(ref,hull*.66);
    float chunk=step(.07,w+.27*sin(p.y*12.+t*3.));
    bright=max(bright,(1.-smoothstep(.48,.55,abs(smear-.82)+pow(abs(v.y)*.45,2.0)*.45))*chunk);
    rust=max(rust,(1.-smoothstep(.18,.24,abs(smear-1.18)+abs(v.y-.38)*.37))*step(.36,w));
  }
  float wall=(1.-smoothstep(.04,.75,p.x+5.+sin(p.y*7.+t)*.105))*step(p.y,5.2);
  wall=max(wall,(1.-smoothstep(.03,.65,p.y+7.15+sin(p.x*5.+t)*.13))*step(p.x,5.));
  col=mix(col,vec3(.077,.36,.381),max(ref*.63,wall*.59));
  col=mix(col,vec3(.82,.96,.855),bright*.47);
  col=mix(col,vec3(.71,.56,.40),rust*.23);

  vec2 ndc=mirrorUV.xy/max(mirrorUV.w,.012)*.5+.5;
  vec2 grain=vec2(sin(p.y*9.1+t*3.8+sin(p.x*4.2)*.77),cos(p.y*13.1-t*2.4+p.x*1.9));
  float perspective=1.-clamp(normalize(cameraPosition-wp).y,0.,1.);
  ndc+=vec2(grain.x*.0057+grain.y*.0022,grain.y*.002)*(.7+perspective*.73);
  vec4 painting=texture2D(harborReflection,ndc);
  float edge=smoothstep(0.,.028,min(ndc.x,ndc.y))*smoothstep(0.,.028,1.-max(ndc.x,ndc.y));
  float tone=sqrt(clamp(dot(painting.rgb,vec3(.2126,.7152,.0722))/max(painting.a,.07),0.,1.));
  vec3 pieces=mix(vec3(.047,.28,.35),vec3(.50,.79,.72),step(.43,tone));
  pieces=mix(pieces,vec3(.78,.94,.87),step(.74,tone));
  float upper=step(.86,tone)*step(.40,w+grain.y*.14+.17);
  pieces=mix(pieces,vec3(.96,.99,.91),upper*.74);
  float broken=smoothstep(-.58,.23,w+grain.y*.25);
  float picture=painting.a*edge*step(.055,cameraPosition.y)*step(.012,mirrorUV.w)*(.26+.50*perspective)*(.52+.48*broken);
  col=mix(col,pieces,picture);
  
  float gl=pow(max(0.,sin(p.y*18.+p.x*.9+sin(p.x*1.55+t)*1.42+t*3.)),22.)*
   pow(max(0.,sin(p.x*10.9+p.y*4.4+t*.8)*.68+.31*cos(p.x*4.7+p.y*2.8-t*1.9)),5.);
  float arrival=mod(uTime,60.)-25.-((14.-p.x)*.072+(p.y+10.)*.017);
  float front=smoothstep(0.,1.05,arrival)*(1.-smoothstep(2.8,6.1,arrival));
  float gust=pow(max(0.,sin(p.y*24.+p.x*5.-arrival*8.+sin(p.y)*.8)),9.)*front*.28;
  col=mix(col,vec3(.39,.73,.68),front*.095);
  float wakeCrest=0.,wakeShade=0.;
  for(int i=0;i<11;i++){
   vec4 sampleWave=swellField[i];
   if(sampleWave.w<=0.)continue;
   float margin=length(p-sampleWave.xy)-sampleWave.z*1.59;
   wakeCrest=max(wakeCrest,sampleWave.w*(1.-smoothstep(.016,.091,abs(margin))));
   wakeShade=max(wakeShade,sampleWave.w*(1.-smoothstep(.076,.25,abs(margin+.18))));
  }
  float spread=.71+.29*sin(p.x*9.2+p.y*4.9+uTime*1.2);
  col=mix(col,vec3(.09,.42,.44),wakeShade*.07);
  col=mix(col,vec3(.73,.94,.86),wakeCrest*.26*spread*uLight);
  float sweep=(p.x-4.8-.42*p.y)*.115;
  float sunPath=exp(-sweep*sweep);
  float sunFleck=pow(max(0.,strokes),28.)*smoothstep(.45,1.05,islands)*sunPath;
  col+=vec3(.42,.38,.25)*(gl+gust+sunFleck*.19)*uLight*skySweep*.83;
  gl_FragColor=vec4(col,.59+depth*.14+bright*.15+ref*.13+gl*.10+picture*.23);
 }`});
const water=mesh(new T.PlaneGeometry(28,28,92,92),waterMat,0,WAT,0,stage,false);
water.rotation.x=-PI/2;water.renderOrder=5;
const glassCut=new T.ShaderMaterial({
 uniforms:{uTime:renderTime},transparent:true,depthWrite:false,side:T.DoubleSide,
 vertexShader:`
 varying vec2 st;varying vec3 wp; void main(){st=uv;wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
 fragmentShader:`
 varying vec2 st;varying vec3 wp;uniform float uTime;
 void main(){
  float a=wp.x+wp.z;
  float surface=.04+.023*sin(wp.x*2.+wp.z*1.25+uTime*1.8)+.012*cos(-wp.z*2.1-uTime*1.3);
  float under=surface-wp.y;
  if(under<-.004)discard;
  float depth=clamp(under/3.3,0.,1.);
  float lip=1.-smoothstep(.011,.070,under);
  float shallow=1.-smoothstep(.042,.47,under);
  float terraces=floor(depth*22.)/22.;
  vec3 c=mix(vec3(.28,.73,.66),vec3(.065,.32,.36),pow(terraces,.72));
  float flow=sin(a*2.23+wp.y*11.3+uTime*.73)+.45*sin(a*4.37-wp.y*6.1-uTime*.49);
  float grain=smoothstep(.56,1.12,flow)*(.20+.5*shallow);
  c+=vec3(.085,.16,.13)*grain;
  c=mix(c,vec3(.67,.96,.88),lip*.70);
  float glaze=.23+.16*depth+shallow*.055+lip*.20;
  gl_FragColor=vec4(c,glaze);
 }`});
for(const [x,z,rot] of [[0,14,0],[14,0,PI/2],[0,-14,PI],[-14,0,-PI/2]]){
 const side=plane(x,-1.60,z,28,3.43,glassCut);side.rotation.y=rot;side.renderOrder=7;
}
const leafPalette=new Map();
function livingBlade(color){
 if(leafPalette.has(color))return leafPalette.get(color);
 const m=mat(color,.79).clone();m.side=T.DoubleSide;
 m.onBeforeCompile=shader=>{
  shader.uniforms.streamTime=renderTime;
  shader.uniforms.streamWind=windPower;
  shader.vertexShader='varying vec2 frond;uniform float streamTime,streamWind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    frond=uv;
    vec2 bank=modelMatrix[3].xz;
    float flow=streamTime*.99+bank.x*.64+bank.y*.83;
    float drift=uv.y*uv.y*(.115+streamWind*.083);
    transformed.x+=drift*sin(flow-uv.y*1.55);
    transformed.z+=drift*.61*cos(flow*.91-uv.y*2.4);
  `);
  shader.fragmentShader='varying vec2 frond;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float spine=(1.-smoothstep(.015,.075,abs(frond.x-.48)))*smoothstep(.02,.19,frond.y);
   float bladeEdge=smoothstep(.36,.50,abs(frond.x-.5));
   diffuseColor.rgb *= .75+.25*frond.y+spine*.24-bladeEdge*.12;
   diffuseColor.rgb += vec3(.017,.035,.018)*smoothstep(.58,.95,frond.y);
  `);
 };
 leafPalette.set(color,m);
 return m;
}
function kelp(x,y,z,scale,salt=false){
 const g=group(x,y,z);g.scale.setScalar(scale);
 for(let j=0;j<5;j++){
   const h=rr(.32,1.03),b=rr(-.32,.35),f=rr(-.20,.2),w=rr(.022,.074);
   const geo=new T.BufferGeometry();
   const p=[],ids=[],uv=[];
   for(let i=0;i<=8;i++){
     const t=i/8,k=Math.sin(t*PI*.99)**.6;
     const bend=.032*k*Math.sin(i*1.16+j*.92);
     p.push(b*t*t-w*k+bend,h*t,f*t*t, b*t*t+w*k+bend,h*t,f*t*t-.035*k);
     uv.push(0,t,1,t);
     if(i){const a=i*2;ids.push(a-2,a-1,a,a-1,a+1,a)}
   }
   geo.setAttribute('position',new T.Float32BufferAttribute(p,3));
   geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ids);geo.computeVertexNormals();
   const m=livingBlade(pick(salt?['#446b5b','#3e7868','#58917c']:['#497959','#57855c','#366e55']));
   mesh(geo,m,0,0,0,g,false).rotation.y=rr(0,TAU);
 }
 foliage.push({g,under:true,x,z,phase:rr(0,6),a:.14});
 return g;
}
for(let i=0;i<210;i++){
 const x=rr(-4.95,13.9),z=rr(-7,13.95);
 if(x<-.7&&z>7.1)continue;
 const a=rr(.06,.27)*(rnd()<.09?2:1);
 const m=ico(x,-3.17,z,a,a*rr(.28,.7),a*rr(.64,1.65),pick(['#a3b193','#818f7f','#879e91','#bfc1a2','#aab5a1']),stage,0,false);
 m.rotation.y=rr(0,6);
 if(i%8===0)kelp(x,-3.14,z,rr(.48,1.1));
}
for(let i=0;i<42;i++){
 const x=rr(-4.86,-4.80),z=rr(-7.08,7.01);
 kelp(x,rr(-1.54,-.94),z,rr(.26,.51),true);
}
for(const [x,z,a] of [[6.4,12.6,.62],[9.9,12.9,.42],[12.9,7.6,.34]]){
 const t=tor(x,-2.94,z,a,.15,'#364a48');t.rotation.set(1.13,0,.4);
 const r=tor(x,-2.92,z,a*.92,.018,'#6f7a68');r.rotation.copy(t.rotation);
 for(let i=0;i<24;i++){
  const p=i/24*TAU,radius=a+.137;
  const wear=box(Math.cos(p)*radius,Math.sin(p)*radius,(i%2?1:-1)*.038,.024,.102,.082,i%3?'#435956':'#55635b',t,false);
  wear.rotation.z=p;
 }
 tor(0,0,.106,a-.025,.016,'#52645c',t,false);
}
for(let i=0;i<30;i++){
 const t=tor(3.6+i*.236,-3.11,12.1+Math.sin(i*.21)*.49,.145,.037,'#716951',stage,false);
 t.rotation.set(i%2?1.37:.3,0,.6);
}
const anchor=group(3.8,-3.12,12.15);anchor.rotation.y=.75;
const anchorIron=oxidizedIron('#6b7564');
beam([0,.02,-.64],[0,.02,.65],.08,anchorIron,anchor);
beam([-.28,.025,-.43],[.28,.025,-.43],.038,anchorIron,anchor,7);
for(const s of [-1,1]){
 const fluke=cyl(s*.51,.062,.49,.01,.163,.253,anchorIron,anchor,3);
 fluke.rotation.set(PI/2,.28,s*.45);
}
path([[-.55,0,.48],[-.4,0,.79],[0,0,.88],[.4,0,.79],[.55,0,.48]],.071,'#686b56',anchor);
tor(0,.04,-.71,.14,.04,'#686b56',anchor).rotation.x=PI/2;

const survey=canvasMat(512,96,(c,w,h)=>{
 c.fillStyle='#597e72';c.fillRect(0,0,w,h);
 for(let i=0;i<63;i++){c.fillStyle='#dddcc2';c.fillRect(4+i*8,13,1.5,i%5===0?23:12)}
 linesText(c,'潮間帯　｜　SHIONAGI · 35° 04′ N',w/2,65,20,'#e3e2ca','center')
});
plane(14.033,-3.44,7.5,6.9,.247,survey).rotation.y=PI/2;

function tetrapod(x,y,z,s,r){
 const g=group(x,y,z);g.rotation.set(rr(-.35,.35),r,rr(-.35,.35));
 const c=pick(['#a9b4ac','#bec5b7','#a2b0a6','#c3c7b5']);
 ico(0,0,0,s*.38,s*.39,s*.37,c,g,1);
 for(const [a,b,d] of [[0,1,0],[.93,-.37,0],[-.46,-.37,.80],[-.46,-.37,-.80]]){
   const m=cyl(a*s*.46,b*s*.46,d*s*.46,s*.19,s*.32,s*.75,c,g,7);
   m.quaternion.setFromUnitVectors(vec(0,1,0),vec(a,b,d).normalize());
 }
 return g;
}
for(let i=0;i<37;i++){
 let x,z;
 if(i<22){x=rr(5.08,8.05);z=rr(-9.39,-8.56)}
 else{x=rr(-.49,1.15);z=rr(12,13.57)}
 tetrapod(x,rr(.06,.76),z,rr(.47,.84),rr(0,TAU));
 if(i%2===0)shoreFoam.push({x,z,r:rr(.25,.67),phase:rr(0,TAU)});
}
for(let i=0;i<13;i++){
 const x=rr(5.22,7.99);tetrapod(x,rr(.12,.37),rr(-11.33,-11.05),rr(.39,.58),rr(0,TAU))
}
const outerWall=group(0,0,0);
const farWallRun=[vec(4.36,0,-13.36),vec(6.46,0,-13.30),vec(8.37,0,-13.29),vec(9.93,0,-13.44),vec(11.37,0,-13.31)];
for(let j=0;j<farWallRun.length-1;j++){
 const a=farWallRun[j],b=farWallRun[j+1],ctr=a.clone().lerp(b,.5),w=a.distanceTo(b);
 const span=group(ctr.x,0,ctr.z,outerWall);span.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
 box(0,-.29,0,w+.054,.60,.37,'#87aaa5',span);
 const blocks=Math.floor(w/.19);
 for(let i=0;i<blocks;i++){
  const x=(i+.5)*w/blocks-w*.5;
  box(x,.08,0,w/blocks-.019,.24,.28,i%3?'#a4bfba':'#98b3af',span);
  if(i%3!==0){
   const armor=ico(x,-.058,.182,.134,.128+(i%3)*.014,.152,i%2?'#a3bcb2':'#9ab6ad',span,0,false);
   armor.rotation.y=.24+i*1.21;
  }
 }
 box(0,.213,0,w+.044,.077,.316,'#c1d2c8',span);
 box(0,.169,.166,w+.027,.031,.014,'#89a9a3',span,false);
}
for(const [x,z] of [[6.37,-13.32],[8.33,-13.29],[9.93,-13.44],[11.06,-13.34]]){
 cyl(x,.244,z,.078,.093,.085,'#9fb7ad',outerWall,10);
}
const remoteLight=group(11.34,.285,-13.31,outerWall);
cyl(0,.122,0,.039,.079,.245,'#91afa8',remoteLight,10);
cyl(0,.289,0,.059,.06,.09,'#c2cdb8',remoteLight,12);
const harborMark=new T.MeshStandardMaterial({color:'#7b9a82',emissive:'#9fc4a0',emissiveIntensity:.19,roughness:.43});
cyl(0,.337,0,.077,.057,.036,harborMark,remoteLight,12);
cyl(0,.369,0,.025,.067,.038,'#6e928c',remoteLight,10);
function puddle(x,z,a,b,reflection=true){
 const m=irreg(x,SHORE+.012,z,a,b,alpha('#669393',.36));
 m.renderOrder=3;
 const m2=irreg(x-.027,SHORE+.013,z+.01,a*.89,b*.82,alpha('#cfe3da',.28));m2.renderOrder=3;
 for(let i=0;i<9;i++){
   const rx=rr(-.64,.64),rz=rr(-.53,.53);
   if(rx*rx+rz*rz>.55)continue;
   const mark=irreg(x+rx*a,SHORE+.016,z+rz*b,rr(.06,.47)*a,rr(.018,.087)*b,alpha(pick(['#e6f5e8','#e2efe8','#789ba3']),rr(.17,.45)));
   mark.renderOrder=4;
 }
 puddles.push({x,z,a,b,reflection,footprint:m.geometry});
}
for(const p of [[-6.38,8.7,1.03,.67],[-3.12,9.26,1.19,.79],[-2.18,11.92,.93,.68],[-9.92,4.58,1.5,.68],[-6.6,2.5,1.015,.59],[-6.55,-4.69,.70,1.1],[-2.2,-8.88,1.25,.71],[2.3,-10.7,.86,.55],[-12.45,6.41,1.1,.57]])puddle(...p);
for(let i=0;i<31;i++){
 const x=rr(-13.6,-5.4),z=rr(-8.2,13.72);
 const pts=[[x,1.044,z]];
 for(let k=1;k<4;k++)pts.push([x+k*.094,1.044,z+k*.105+rr(-.12,.14)]);
 path(pts,.007,'#81938b');
}

function oysterBed(ax,az,heading,count){
 const bed=group(ax,-.51,az);
 bed.rotation.y=heading;
 for(let i=0;i<count;i++){
  const x=rr(-.84,.8),y=rr(-.29,.62);
  const size=rr(.027,.092),c=pick(['#c9c4a5','#a3a48b','#aba58b','#d6ccac']);
  const shell=ico(x,y,.035,size*.80,size,size*.36,c,bed,1,false);
  shell.rotation.z=rr(-1.2,1.4);
  const lip=ico(x+.014,y-.017,.055,size*.5,size*.71,size*.28,'#847f68',bed,0,false);
  lip.rotation.z=shell.rotation.z;
  if(i%3===0){
   const ring=tor(x+.026,y+size*.18,.064,size*.33,size*.13,'#d9ccb0',bed,false);
   ring.scale.set(.83,1,1);
  }
 }
}
for(const z of [-5.62,-1.38,2.07,4.19])oysterBed(-4.895,z,PI/2,21);
oysterBed(-3.9,7.19,0,20);
oysterBed(-3.99,-7.04,0,16);


const reserveTextureSeed=seed;
for(const [x,z,s] of [[3.91,11.74,1.11],[4.39,11.52,.86],[6.12,11.82,.94],[6.45,11.61,.72],[8.94,10.01,1.10],[9.18,9.89,.87],[10.08,12.45,1.08]]){
 kelp(x,-3.174,z,s);
}
seed=reserveTextureSeed;

