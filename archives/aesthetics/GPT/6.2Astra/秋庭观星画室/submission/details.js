// Fine surface work. Grain follows the longest axis of each piece of timber.
const timberPaint=paint.clone(),stonePaint=paint.clone();
function surfaceShader(material,wooden){material.onBeforeCompile=sh=>{
sh.vertexShader='varying vec3 inkP; varying vec3 inkN; varying vec3 timberScale;\n'+sh.vertexShader;
sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n inkP=position; inkN=normal; timberScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));');
sh.fragmentShader='varying vec3 inkP; varying vec3 inkN; varying vec3 timberScale;float grainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}float grainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(grainHash(i),grainHash(i+vec2(1,0)),f.x),mix(grainHash(i+vec2(0,1)),grainHash(i+1.),f.x),f.y);}\n'+sh.fragmentShader;
sh.fragmentShader=sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+(wooden?`
vec3 pos=inkP*timberScale;vec2 uv;
if(timberScale.y>timberScale.x&&timberScale.y>timberScale.z)uv=vec2(pos.y,pos.x+pos.z*.93);else if(timberScale.z>timberScale.x)uv=vec2(pos.z,pos.y+pos.x*.91);else uv=vec2(pos.x,pos.y+pos.z*.82);
float warp=grainNoise(uv*vec2(1.9,4.))*3.3;float wav=uv.y*125.+warp+sin(uv.x*5.)*.42;float grain=grainNoise(vec2(uv.x*3.,uv.y*89.+warp));float strok=smoothstep(.62,.98,sin(wav))*.074+smoothstep(.68,.8,grain)*.13;diffuseColor.rgb*=1.08-strok+(.5-grainNoise(uv*vec2(2.,20.)))*.16;
`:`vec3 p=inkP*timberScale;vec2 q=vec2(p.x+p.z*.62,p.y+p.z);float n=grainNoise(q*10.)*.12+grainNoise(q*90.)*.065;diffuseColor.rgb*=.93+n;`));};material.customProgramCacheKey=()=>wooden?'annualGrain':'mineralGrain'}
surfaceShader(timberPaint,true);surfaceShader(stonePaint,false);
const baseObj=obj;obj=function(g,x,y,z,sx,sy,sz,c,rx=0,ry=0,rz=0,mat=paint){if(mat===paint&&g===boxG&&typeof c==='string'){let n=parseInt(c.slice(1),16),r=n>>16,gc=n>>8&255,b=n&255;if(r>gc*1.15&&gc>b*1.13)mat=timberPaint;else mat=stonePaint}return baseObj(g,x,y,z,sx,sy,sz,c,rx,ry,rz,mat)};
// Rebatch the timber already cut in the preceding construction passes.
for(let [key,b] of [...batches])if(b.g===boxG&&b.mat===paint){batches.delete(key);for(let i=0;i<b.m.length;i++){let c=new T.Color(b.c[i]);let m=c.r>c.g*1.27&&c.g>c.b*1.21?timberPaint:stonePaint,k=boxG.uuid+m.uuid;if(!batches.has(k))batches.set(k,{g:boxG,mat:m,m:[],c:[]});batches.get(k).m.push(b.m[i]);batches.get(k).c.push(b.c[i])}}
world=sites.studio;
const starGlobe=canvasTex(1024,512,(p,w,h)=>{let gr=p.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#b0ffff');gr.addColorStop(.22,'#6dcfe1');gr.addColorStop(.55,'#4c9db8');gr.addColorStop(.79,'#4d89a8');gr.addColorStop(1,'#a7dedc');p.fillStyle=gr;p.fillRect(0,0,w,h);for(let j=0;j<34;j++){let y=R(0,h),a=R(0,TAU);p.beginPath();p.strokeStyle=j%3?'#c4efed32':'#95e5ed55';p.lineWidth=R(2,11);for(let x=0;x<=w;x+=3){let v=y+12*Math.sin(x/w*TAU*2+a)+8*Math.sin(x/w*TAU*3+a*.5);x?p.lineTo(x,v):p.moveTo(x,v)}p.stroke()}for(let i=0;i<670;i++){let x=R(0,w),y=R(0,h),r=R(.5,2);p.fillStyle='#dcffff';p.beginPath();p.arc(x,y,r,0,TAU);p.fill()}for(let i=0;i<18;i++){let x=R(0,w),y=R(h*.15,h*.84);p.strokeStyle='#d6ffff';p.lineWidth=1;p.beginPath();p.moveTo(x,y);for(let j=0;j<5;j++){x+=R(9,29);y+=R(-28,29);p.lineTo(x,y);p.fillRect(x-2,y-2,4,4)}p.stroke()}});anim.push(t=>{core.rotation.y=t*.09});
for(let a of [-1,1]){pipe([[ox+a*.16,1.39,oz],[ox+a*.44,1.51,oz],[ox+a*.57,1.69,oz],[ox+a*.59,2.14,oz]],.036,gold);ball(ox+a*.59,2.14,oz,.063,.063,.063,'#e4c77c')}for(let i=0;i<16;i++){let a=i/16*TAU;obj(st,ox+Math.sin(a)*.45,1.418,oz+Math.cos(a)*.45,.024,.024,.024,'#e1bf7b',-1.57)}
world=gardenRoot;
// Leaves with veins, springing fern fronds, small berry thickets and susuki.
let blade=polygon([[0,-.5],[-.21,-.11],[-.22,.13],[0,.58],[.22,.15],[.19,-.11]]);
function shrub(x,y,z,r,h,colors,berries=false){for(let j=0;j<16;j++){let a=j*2.4,d=R(.28,1)*r,hh=h*R(.57,1.15),X=x+Math.cos(a)*d,Z=z+Math.sin(a)*d;rod(x,y,z,X,y+hh,Z,.015,'#796d49',.4,5);for(let i=0;i<9;i++){let u=.35+i*.076,k=i%2?1:-1,A=a+k*.87,xx=x+(X-x)*u,zz=z+(Z-z)*u;obj(blade,xx+Math.cos(A)*r*.12,y+hh*u+.024,zz+Math.sin(A)*r*.12,r*.28,r*.44,r*.31,pick(colors),-.89,A,k*.64)}if(berries&&j%2===0)for(let q=0;q<7;q++)ball(X+R(-.065,.065),y+hh+R(-.04,.06),Z+R(-.07,.07),.036,.04,.035,pick(['#b4482d','#ce5734','#e57843']))}}
let greens=['#729160','#6a8457','#869861','#5c7953','#a2ab6b'];for(let [x,z,r,h] of [[-5.72,4.82,.29,.44],[-4.20,5.42,.27,.41],[-3.56,5.37,.28,.36],[-2.48,4.93,.34,.38],[-2.18,3.89,.28,.32],[2.71,4.45,.22,.34],[5.95,1.50,.27,.43],[5.81,1.02,.21,.30],[1.67,.05,.26,.37],[-5.73,.41,.28,.35],[.45,-2.45,.26,.41],[.67,-2.53,.18,.27]])shrub(x,.12,z,r,h,greens,true);
world=sites.upper;
for(let j=0;j<18;j++){let x=R(1.7,6.89),y=R(.26,2.46),z=-2.25;shrub(x,y,z,R(.12,.24),R(.12,.28),['#687a4d','#839159','#9ba064']);rock(x,y-.012,z,.13,.046,.069,'#71804e')}
world=gardenRoot;
function fern(x,y,z,s){for(let j=0;j<7;j++){let a=R(0,TAU),r=s*R(.61,1),hh=s*R(.56,1);for(let k=1;k<=9;k++){let u=k/10,X=x+Math.cos(a)*u*r,Z=z+Math.sin(a)*u*r,Y=y+hh*(1-(1-u)**2);for(let q of [-1,1]){let b=a+.91*q;obj(blade,X+Math.cos(b)*s*.08,Y,Z+Math.sin(b)*s*.08,s*(.17-u*.09),s*(.4-u*.23),s*.13,'#708850',-1.13,b,q*.73)}}}}for(let j=0;j<26;j++){let v=pick(stream),x=v[0]+R(-.6,.6),z=v[1]+R(-.37,.37);fern(x,Math.abs(x-v[0])<.43?streamSurface(z)-.04:.14,z,R(.21,.48))}
for(let j=0;j<40;j++){let [cx,cz]=pick([[-5.76,4.72],[-3.59,5.36],[2.58,4.12],[5.89,1.37]]),x=cx+R(-.32,.32),z=cz+R(-.36,.36);rock(x,.105,z,.10,.037,.09,pick(greens));grass(x,.13,z,R(.13,.29),j%3===0)}
// A transparent-looking section, sediment, bubbles, sunlight fractures and drifting pond reflections.
let topWater=canvasTex(512,512,(p,w,h)=>{let g=p.createLinearGradient(0,0,w,h);g.addColorStop(0,'#82c9b9');g.addColorStop(.45,'#77c8cd');g.addColorStop(.78,'#78bfc2');g.addColorStop(1,'#a7d8c1');p.fillStyle=g;p.fillRect(0,0,w,h);for(let j=0;j<510;j++){let x=R(0,w),y=R(0,h);p.strokeStyle=pick(['#d9f1ce99','#f2f2c977','#4daba673','#4ca5aa57']);p.lineWidth=R(.6,2.7);p.beginPath();p.moveTo(x,y);p.bezierCurveTo(x+7,y-3,x+13,y+1,x+R(17,37),y-2);p.stroke()}});topWater.wrapS=topWater.wrapT=T.RepeatWrapping;topWater.repeat.set(.24,.24);for(let o of world.children)if(o.geometry?.type==='ShapeGeometry'&&o.position.y===waterY){o.material.map=topWater;o.material.color.set('#effff6');o.material.needsUpdate=true}anim.push(t=>{topWater.offset.x=.007*Math.sin(t*.33);topWater.offset.y=.005*Math.cos(t*.25)});
for(let j=0;j<7;j++){let x=px+R(-1.4,1.25),z=pz+R(-.92,1.1);let o=mesh(new T.TorusGeometry(1,.018,4,50,5),'#b8e0ca',x,.508,z);o.rotation.x=-1.57;anim.push(t=>{let u=(t*.14+j*.24)%1;o.scale.set(.13+u*.29,.08+u*.13,.02);o.visible=u>.17&&u<.84})}
const dg=new T.Group();world.add(dg);for(let k=0;k<5;k++){let o=new T.Mesh(sphereG,new T.MeshToonMaterial({color:k?'#c0dfd6':'#b94627',gradientMap:grad}));dg.add(o);o.scale.set(k?.09:.018,.013,k?.025:.126);if(k){o.position.set(k%2?.064:-.064,.006,k<3?.027:-.025);o.rotation.y=k%2?.41:-.41}}anim.push(t=>{
  const u=t%28, route=u<13?u/13:u<19?1:1-(u-19)/9;
  const flutter=Math.sin(route*Math.PI),circle=TAU*route;
  dg.position.set(-.66+1.31*Math.sin(circle*.83)*flutter,.629+flutter*(.36+.13*Math.sin(circle*2)),5.09+.81*Math.cos(circle*1.44)*flutter);
  dg.rotation.y=.5+circle;
  dg.children.slice(1).forEach((wing,i)=>wing.rotation.z=(i%2?1:-1)*(.09+.33*flutter*Math.sin(t*29)));
});

// Screen-space ink uses relative depth and local colour changes. It stays fine at every zoom.
const inkScene=new T.Scene(),inkCamera=new T.Camera(),inkTarget=new T.WebGLRenderTarget(1,1,{samples:0,depthBuffer:true});inkTarget.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);inkTarget.texture.colorSpace=T.LinearSRGBColorSpace;
// Encode the last colour step with a fixed transfer table. The intermediate
// supersampled scene remains linear, including its transparent edges.
const transferBytes=new Uint8Array(4096*4);
for(let i=0;i<4096;i++){
  const value=i/4095,srgb=value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055;
  const v=Math.round(255*srgb);transferBytes.set([v,v,v,255],i*4);
}
const colourTransfer=new T.DataTexture(transferBytes,256,16);
colourTransfer.minFilter=colourTransfer.magFilter=T.NearestFilter;
colourTransfer.generateMipmaps=false;colourTransfer.needsUpdate=true;
const inkUniforms={transfer:{value:colourTransfer},colorMap:{value:inkTarget.texture},zMap:{value:inkTarget.depthTexture},pixel:{value:new T.Vector2()},unproject:{value:new T.Matrix4()},viewRadius:{value:new T.Vector2()},relief:{value:.64}};
let inkMaterial=new T.ShaderMaterial({uniforms:inkUniforms,depthTest:false,depthWrite:false,vertexShader:'varying vec2 screenUV;void main(){screenUV=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
uniform sampler2D transfer;uniform sampler2D colorMap;uniform sampler2D zMap;
float displayChannel(float v){
  float k=floor(clamp(v,0.,1.)*4095.+.5);
  return texture2D(transfer,(vec2(mod(k,256.),floor(k/256.))+.5)/vec2(256.,16.)).r;
}
uniform vec2 pixel;varying vec2 screenUV;
uniform mat4 unproject;uniform vec2 viewRadius;uniform float relief;
vec3 eyePoint(vec2 uv,float depth){
  vec4 v=unproject*vec4(uv*2.-1.,depth*2.-1.,1.);
  return v.xyz/v.w;
}
void main(){vec4 base=texture2D(colorMap,screenUV);if(base.a<.003){gl_FragColor=vec4(0.);return;}
float depth=texture2D(zMap,screenUV).x;float edge=0.,colEdge=0.;
vec3 here=eyePoint(screenUV,depth);
vec2 dx=vec2(pixel.x,0.),dy=vec2(0.,pixel.y);
vec3 right=eyePoint(screenUV+dx,texture2D(zMap,screenUV+dx).r)-here;
vec3 left=here-eyePoint(screenUV-dx,texture2D(zMap,screenUV-dx).r);
vec3 above=eyePoint(screenUV+dy,texture2D(zMap,screenUV+dy).r)-here;
vec3 below=here-eyePoint(screenUV-dy,texture2D(zMap,screenUV-dy).r);
vec3 surfaceN=cross(abs(right.z)<abs(left.z)?right:left,abs(above.z)<abs(below.z)?above:below);
vec3 normalEye=surfaceN/max(length(surfaceN),.00000001);
float contact=0.;
if(depth<.99995&&base.a>.97&&relief>0.){
  for(int j=0;j<12;j++){
    float index=float(j)+.5,angle=index*2.39996323;
    vec2 dir=vec2(cos(angle),sin(angle))*sqrt(index/12.);
    vec2 at=clamp(screenUV+viewRadius*dir,vec2(0.),vec2(1.));
    vec3 neighbor=eyePoint(at,texture2D(zMap,at).x)-here;
    float r=length(neighbor);
    contact+=max(0.,dot(neighbor,normalEye)-.004)/(r+.009)*(1.-smoothstep(.09,.34,r));
  }
  contact=clamp(contact/9.,0.,.66);
}

for(int i=0;i<4;i++){vec2 delta=i==0?vec2(pixel.x,0.):i==1?vec2(-pixel.x,0.):i==2?vec2(0.,pixel.y):vec2(0.,-pixel.y);
vec4 around=texture2D(colorMap,screenUV+delta);float dz=texture2D(zMap,screenUV+delta).x-depth;
edge=max(edge,smoothstep(.00032,.00195,dz));colEdge=max(colEdge,smoothstep(.07,.32,dot(around.rgb-base.rgb,vec3(.24,.62,.14))));}
vec3 c=base.rgb/max(base.a,.001);c*=vec3(1.)-contact*relief*vec3(1.,.89,.71);c=mix(c,c*vec3(.47,.43,.42)+vec3(.012,.010,.012),min(.82,edge*.64+colEdge*.34));
float v=dot(c,vec3(.21,.71,.08));c=mix(c, c*vec3(.94,.99,1.04)+vec3(.004,.006,.012),.64*(1.-smoothstep(.06,.46,v)));vec3 screenColor=vec3(displayChannel(c.r),displayChannel(c.g),displayChannel(c.b));
 gl_FragColor=floor(vec4(screenColor*base.a,base.a)*255.+.5)/255.;
}`});inkScene.add(new T.Mesh(new T.PlaneGeometry(2,2),inkMaterial));function renderInk(){inkUniforms.unproject.value.copy(camera.projectionMatrixInverse);
const height=visibleHeight(),worldRadius=Math.min(.25,.049*height);
inkUniforms.viewRadius.value.set(worldRadius/(camera.aspect*height),worldRadius/height);
renderer.setRenderTarget(inkTarget);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(inkScene,inkCamera)}
// Inlaid fascia, stone-wall ivy and pine needles.
for(let side=0;side<2;side++){for(let j=0;j<72;j++){let u=R(-6.96,6.96);if(!side&&u> -1.12&&u<2.14)continue;let x=side?6.975:u,z=side?u:6.976;if(side&&u< -1.8)continue;rock(x,-.095-.047*Math.sin(u*1.8),z,R(.038,.104),R(.024,.055),R(.032,.085),pick(['#897860','#9b896c','#827665']));if(j%4===0)for(let k=0;k<5;k++)obj(blade,x+(side?.041:k*.017),.029-k*.046,z+(side?k*.015:.046),.067,.108,.1,pick(greens),-.27,side?1.57:0,k*.426)}}
world=sites.upper;
for(let j=0;j<19;j++){let z=R(-6.45,-2.48),x=6.995,y=terraceY-.011,len=R(.3,1.16);for(let k=0;k<12;k++){let Z=z+Math.sin(k*.37)*.073;obj(blade,x+.048,y-len*k/12,Z,.073,.13,.09,pick(greens),-.32,1.57,(k%2?1:-1)*.65);if(k<11)rod(x+.02,y-len*k/12,Z,x+.02,y-len*(k+1)/12,z+Math.sin((k+1)*.37)*.073,.009,wood)}}
world=gardenRoot;
for(let k=0;k<3;k++){let X=4.22+k*.62,Y=-.52-k*.123;ring(X,Y,7.028,.068,.014,'#9e9069');box(X,Y,7.044,.035,.033,.008,'#645b49',0,0,.3)}for(let i=0;i<6;i++)obj(st,5.85+R(-.31,.31),R(-1.11,-.8),7.024,.047,.066,.045,'#a57f63',0,.04,R(-1,1));

function letterBoard(x,y,z,w,h,txt,bg,fg){art(x,y,z,w,h,(p,W,H)=>{p.fillStyle=bg;p.fillRect(0,0,W,H);p.fillStyle=fg;p.textBaseline='middle';p.textAlign='center';let fs=Math.min(H/(txt.length+.52),W*.72);p.font='600 '+fs+'px SimSun,serif';Array.from(txt).forEach((c,i)=>p.fillText(c,W/2,H/2+(i-(txt.length-1)/2)*fs*1.04))})}
atSite('gate',()=>{letterBoard(6.28,.87,3.949,.32,1.22,'銀杏星宮','#a49f8d','#544f41');letterBoard(4.75,3.12,3.675,.31,.51,'星宮','#3d4a43','#e9cb85');});atSite('studio',()=>letterBoard(-5.73,2.81,-4.462,.5,1.12,'秋夜観星','#dfcfad','#594e3e'));
atSite('hall',()=>{for(let a of [-1,1])for(let z of [-5.86,-3.95]){let x=4.4+a*1.25;for(let k=0;k<3;k++){box(x,4.26+k*.119,z,.35+k*.091,.092,.27,'#9c442f');box(x,4.31+k*.119,z,.24+k*.09,.035,.3,'#d5a46b')}}for(let a of [-1,1]){let x=4.4+a*.88;for(let j=0;j<4;j++)ball(x,3.2+j*.26,-3.948,.021,.021,.015,gold);for(let i=0;i<2;i++){box(4.4+a*.99,3.16+i*.74,-3.97,.31,.079,.04,'#4b4f46');ball(4.4+a*1.08,3.16+i*.74,-3.944,.025,.023,.016,gold)}}});
atSite('stair',()=>{let noz=[];for(let i=0;i<19;i++){let u=i/18;noz.push([3.38+u*2.76,3.77-.38*Math.sin(u*Math.PI),.49]);}pipe(noz,.014,wood);for(let i=0;i<=6;i++){let u=(i+.5)/7,x=3.38+u*2.76,y=3.77-.38*Math.sin(u*Math.PI);rod(x,y,.49,x,y-.099,.49,.009,ink);paperlamp(x,y-.24,.49,.62)}for(let a of [-1,1])rod(4.76+a*1.38,stairLevel(8)+.08,.49,4.76+a*1.38,3.81,.49,.043,'#8a8054');});
atSite('fortunes',()=>{
for(let X of [5.61,6.69]){box(X,2.71,-4.12,.054,1.49,.057,wood);ball(X,3.481,-4.12,.043,.034,.042,gold)}
const fortunePaper=polygon([[-.51,.08],[-.40,.27],[-.14,.13],[.05,.20],[.14,.07],[.51,.24],[.41,-.15],[.13,-.13],[-.06,-.19],[-.22,-.06],[-.46,-.17]]);
for(let j=0;j<2;j++){
  const height=3.41-j*.326,line=[];
  for(let i=0;i<=20;i++){const u=i/20;line.push([5.61+u*1.08,height-.071*Math.sin(u*Math.PI),-4.118])}
  pipe(line,.007,'#9c8b71');
  for(let k=0;k<7;k++){
    const u=.061+k*.144,X=5.61+u*1.08,Y=height-.071*Math.sin(u*Math.PI),Z=-4.102;
    suspended(X,Y,Z,.28,()=>{
      const tilt=.17*Math.sin(k*2.39+j);
      obj(fortunePaper,X,Y-.023,Z,.14,.112,.07,'#efe9d6',0,.12*Math.sin(k),tilt);
      box(X,Y-.024,Z+.003,.024,.048,.017,'#d3cdb7',0,0,-.28+tilt);
      box(X+.025,Y-.079,Z-.004,.041,.11,.009,'#ede4ce',0,.21,-.31+tilt);
      box(X-.019,Y-.069,Z-.008,.037,.094,.008,'#dbd7c4',.13,-.14,.36+tilt);
      for(let m=0;m<3;m++)box(X+.021+m*.004,Y-.054-m*.018,Z+.001,.014,.003,.002,'#a59e88',0,.21,-.31+tilt);
    });
  }
}

});
atSite('inari',()=>{
for(let i=0;i<6;i++){
  const x=[2.023,2.181,2.277,2.736,2.863,2.989][i],z=i%2?-1.152:-1.092;
  beast(x,i%2?.414:.402,z,.115+.016*(i%3),true);
  if(i===1||i===4)cup(x,.404,z+.081,.25);
}

});
// The smaller shrine's white fox has a quiet, intermittent visit.
function animalPart(g,x,y,z,sx,sy,sz,c,type=sphereG,rz=0){let o=new T.Mesh(type,new T.MeshToonMaterial({color:c,gradientMap:grad}));o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.z=rz;g.add(o);return o}
const fox=new T.Group(),foxHead=new T.Group(),brushTail=new T.Group();sites.inari.add(fox);fox.add(foxHead,brushTail);foxHead.position.set(0,.316,.038);
function furForm(parent,control,radii,baseColor,tipColor,flatten=1){
  const spline=new T.CatmullRomCurve3(control.map(p=>V(...p))),vertices=[],indices=[],colors=[],rows=control.length*5,sides=14;
  const first=new T.Color(baseColor),last=new T.Color(tipColor),tone=new T.Color();
  for(let j=0;j<=rows;j++){
    const u=j/rows,at=u*(radii.length-1),k=Math.min(radii.length-2,Math.floor(at)),r=radii[k]+(radii[k+1]-radii[k])*(at-k);
    const center=spline.getPoint(u),along=spline.getTangent(u),across=new T.Vector3().crossVectors(along,Math.abs(along.y)>.9?V(0,0,1):V(0,1,0)).normalize(),up=new T.Vector3().crossVectors(across,along).normalize();
    for(let n=0;n<sides;n++){
      const a=n*TAU/sides,pos=center.clone().addScaledVector(across,r*Math.cos(a)).addScaledVector(up,r*flatten*Math.sin(a));
      vertices.push(...pos.toArray());tone.copy(first).lerp(last,T.MathUtils.smoothstep(u,.61,.94)).multiplyScalar(.975+.025*Math.cos(a));colors.push(tone.r,tone.g,tone.b);
      if(j){const h=j*sides+n,next=j*sides+(n+1)%sides;indices.push(h,next,next-sides,h,next-sides,h-sides)}
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const o=new T.Mesh(g,new T.MeshToonMaterial({vertexColors:true,gradientMap:grad,side:T.DoubleSide}));o.castShadow=true;parent.add(o);return o;
}
animalPart(fox,0,.168,-.013,.092,.158,.106,'#e9e0c9');
for(let side of [-1,1]){
  animalPart(fox,side*.077,.106,-.041,.062,.089,.087,'#ded4bc');
  furForm(fox,[[side*.057,.23,.049],[side*.061,.169,.068],[side*.057,.083,.084],[side*.059,.039,.094]],[.024,.02,.014,.015],'#e8dfc9','#b8b2a0');
  animalPart(fox,side*.06,.029,.106,.028,.022,.039,'#b7b1a0');
}
furForm(brushTail,[[.054,.131,-.089],[.132,.112,-.108],[.182,.09,-.037],[.176,.074,.076],[.129,.061,.143],[.071,.067,.173],[.031,.092,.174]],[.023,.046,.062,.063,.051,.029,.002],'#daceb3','#f5eee0',.85);
animalPart(foxHead,0,.023,0,.111,.094,.10,'#eee7d6');
furForm(foxHead,[[0,.004,.043],[0,-.008,.082],[0,-.022,.124],[0,-.028,.151]],[.085,.064,.038,.014],'#eee6d1','#f3ead4',.63);
animalPart(foxHead,0,-.023,.154,.019,.014,.012,'#4d4b45');
for(let side of [-1,1]){
  const outline=polygon([[-.041,-.029],[.038,-.021],[.015,.108]]);
  const ear=new T.Mesh(outline,new T.MeshToonMaterial({color:'#eee5cf',gradientMap:grad,side:T.DoubleSide}));ear.position.set(side*.069,.094,-.008);ear.rotation.z=-side*.14;foxHead.add(ear);
  const inner=new T.Mesh(outline,new T.MeshToonMaterial({color:'#b39c87',gradientMap:grad,side:T.DoubleSide}));inner.position.set(side*.069,.099,-.003);inner.scale.set(.64,.67,1);inner.rotation.z=-side*.14;foxHead.add(inner);
  animalPart(foxHead,side*.059,.036,.083,.027,.012,.014,'#625b48',sphereG,side*.14);
  animalPart(foxHead,side*.056,.039,.095,.006,.006,.004,'#e8d8a1');
}
anim.push(t=>{
  const phase=(t+23)%46,entering=1-T.MathUtils.smoothstep(phase,0,4.2),leaving=T.MathUtils.smoothstep(phase,27,34);
  const watching=viewerAttention(sitePoint('inari',[2.46,.47,-.12]),2.65,t-.73),retreat=Math.max(entering,leaving,.95*watching);
  fox.visible=phase<34.1;fox.position.set(2.46+.52*retreat,.123+.112*retreat+.011*Math.sin(Math.PI*retreat)*Math.sin(t*7),-.12-.64*retreat);
  fox.rotation.y=.10+retreat*1.6;foxHead.rotation.set(.035*Math.sin(t*.81)-.08*watching,.14*Math.sin(t*.49+.7)-.26*watching,0);
  brushTail.rotation.y=.038*Math.sin(t*.62+.83)+.11*Math.sin(Math.PI*retreat);
});
for(let k=0;k<3;k++){let bird=new T.Group();world.add(bird);animalPart(bird,0,0,0,.08,.062,.127,'#9d8059');animalPart(bird,0,.069,.067,.067,.063,.061,'#796449');animalPart(bird,0,.041,.117,.033,.025,.045,'#b6a175');for(let a of [-1,1]){animalPart(bird,a*.042,.076,.103,.011,.011,.008,ink);animalPart(bird,a*.066,0,-.014,.028,.046,.078,'#786754')}animalPart(bird,0,-.016,-.133,.04,.018,.091,'#6e604d');const perches=[sitePoint('gate',[4.04,3.88,3.45]),sitePoint('purification',[2.98,.835,1.49]),sitePoint('upper',[axisX-1.25,stairLevel(8)+1.20,stairFront-8*stairRun])];
  const leftWing=bird.children[4],rightWing=bird.children[6];
  anim.push(t=>{
    const visit=Math.floor((t+k*.95)/19),from=perches[(visit+k)%3],to=perches[(visit+k+1)%3];
    const moment=(t+k*.95)%19;
    let u=clamp((moment-15.4)/3.6,0,1);
    const near=viewerAttention(from,3.25,t);
    const breeze=windStrength(t,from.x,from.z);
    const hop=Math.max(near,Math.max(0,(breeze-.63)/.37))*.29;
    u+=hop*(1-u);
    const arc=Math.sin(u*Math.PI);
    bird.position.copy(from).lerp(to,u);bird.position.y+=1.04*arc;
    bird.rotation.y=Math.atan2(to.x-from.x,to.z-from.z)+.13*Math.sin(t*.67+k);
    bird.rotation.x=(from===perches[1]&&u<.05)?.37*(.5+.5*Math.sin(t*2.7+k)):.06*Math.sin(t*.9);
    for(const [wing,side] of [[leftWing,-1],[rightWing,1]]){
      wing.position.x=side*(.066+.043*arc);
      wing.scale.x=.028+.095*arc;
      wing.rotation.z=side*arc*(.3+.97*Math.sin(t*22+k));
    }
  });
}
let dripper=new T.Group();sites.dipper.add(dripper);dripper.position.set(1.53,.827,2.29);let tube=animalPart(dripper,0,0,0,.066,.64,.066,'#acaa6a',cylG(1,14));tube.rotation.z=Math.PI/2;atSite('dipper',()=>{for(let side of [-1,1]){let r=animalPart(dripper,side*.22,0,0,.07,.021,.07,'#72794d',cylG());r.rotation.z=Math.PI/2;rod(1.53,.16,2.29+side*.095,1.53,.89,2.29+side*.095,.035,'#8f8e55')}anim.push(t=>{let u=t%7;dripper.rotation.z=u<5?.14-.08*u:u<5.5?-.26+(u-5)*1.4:.44-(u-5.5)*.2});basin(1.06,.43,2.39,.6);});
for(let i=0;i<7;i++){let x=.73+i*.151,z=2.98+Math.max(0,i-3)*.09;plank(x,streamSurface(z)+.092,z,.152,.071,.43,'#92744e')}
atSite('purification',()=>{rod(2.77,.76,1.04,2.77,1.2,1.04,.063,'#9c9c60');rod(2.77,1.19,1.04,2.77,1.1,1.34,.055,'#ada76a');rod(2.77,1.093,1.34,2.77,.75,1.34,.014,'#c5ead7');for(let j=0;j<12;j++){let a=R(0,TAU),r=R(.12,.41);obj(mapleGeo,2.81+r*Math.cos(a),.769,1.35+r*Math.sin(a),.059,.059,.059,pick([...mapCols,paper]),-1.57,0,a)}});
// A branch of ripe persimmons stands just above the umbrella.
function kaki(x,z){let p0=[x,.12,z],p1=[x-.06,1.13,z+.05],p2=[x+.08,2.01,z-.11];rod(...p0,...p1,.087,wood,.76);rod(...p1,...p2,.063,wood,.58);for(let j=0;j<10;j++){let a=j*2.38,X=x+Math.cos(a)*R(.31,.7),Z=z+Math.sin(a)*R(.31,.67),Y=R(1.84,2.77);let m=[(x+X)*.5,Y-.29,(z+Z)*.5];rod(...(j%2?p1:p2),...m,.035,wood,.68);rod(...m,X,Y,Z,.023,wood,.2);for(let k=0;k<3;k++){let f=k*.3,xx=X+f*(m[0]-X),zz=Z+f*(m[2]-Z),yy=Y+f*(m[1]-Y);rod(xx,yy,zz,xx+.022,yy-.109,zz,.009,wood);ball(xx+.022,yy-.156,zz,.075,.067,.072,pick(['#e48a36','#ce6f2f','#e99844']));ball(xx+.022,yy-.102,zz,.043,.013,.042,'#6c7547')}}}kaki(-1.64,-5.06);
world=sites.sweep;
for(let k=0;k<90;k++){let a=R(0,TAU),r=Math.sqrt(rand())*.54;leaf(.64+r*Math.cos(a),.15+.22*(1-r/.54)+R(0,.022),-.03+r*Math.sin(a)*.6,R(.095,.16),rand()<.67,null,true)}steam(.64,.31,-.03);rod(.98,.13,-.35,.84,1.33,-.54,.025,lightwood);for(let i=0;i<12;i++)rod(.98+R(-.13,.13),.15,-.35+R(-.039,.039),.933,.53,-.4,.018,'#b0905d');
world=gardenRoot;
world=sites.studio;
for(let j=0;j<8;j++){let x=R(-6.2,-5.65),z=R(.78,1.17);if(j%2===0)pot(x,.11,z,.17,'#a17051');else{cyl(x,.23,z,.041,.27,'#b6a175');rock(x,.37,z,.069,.06,.089,'#72827a')}}
for(let j=0;j<7;j++){let x=-.29+R(-.28,.28),z=-1.9+R(-.4,.4);grass(x,1.09,z,.33,true)}
// Carpenters' braces, iron corner fittings, apron, rolled blind and bell.
for(let x of [left,right])for(let d of [-1,1]){let xx=x+(x===left?1:-1)*.36;rod(x,3.34+d*.04,front,xx,3.68,front,.052,wood,1,4);for(let y of [1.25,3.54]){box(x,y,front+.091,.157,.085,.035,'#51514a');ball(x,y,front+.111,.017,.017,.009,'#a9a189')}}
for(let i=0;i<29;i++)rod(-6.51,3.62-i*.016,.191,-5.46,3.62-i*.016,.191,.01,i%3?'#ad9464':'#c6ae78');rod(-6.52,3.12,.19,-5.45,3.12,.19,.074,'#b39e73');for(let x of [-6.31,-5.63])ring(x,3.12,.19,.08,.009,'#635b4b',0,Math.PI/2);
suspended(-1.81,3.62,.1,.42,()=>{rod(-1.81,3.62,.1,-1.81,3.36,.1,.007,ink);ball(-1.81,3.31,.1,.071,.071,.071,'#a4ccc4');box(-1.81,3.13,.1,.058,.203,.014,'#d0d7b6',0,0,.13)},3.41);
for(let j=0;j<3;j++){let x=-6.27+j*.24;suspended(x,3.61,.31,.27,()=>{rod(x,3.61,.31,x,3.27,.31,.008,wood);for(let k=0;k<6;k++){let a=k*TAU/6;rod(x,3.31,.31,x+Math.cos(a)*.051,3.1,.31+Math.sin(a)*.04,.008,sage);ball(x+Math.cos(a)*.052,3.068,.31+Math.sin(a)*.043,.027,.047,.025,pick(['#bd8d5d','#9c7c77','#b1a177']))}})}
function basket(x,y,z,r){cyl(x,y+.1,z,r*.71,.2,'#b09968',1.3);for(let i=0;i<5;i++)ring(x,y+.032+i*.038,z,r*(.74+i*.045),.009,'#d1b683',1.57);ring(x,y+.18,z,r*.8,.017,lightwood,0,0,0,.87);for(let j=0;j<10;j++){let a=j*2.4;ball(x+r*.64*Math.cos(a),y+.2+R(-.012,.027),z+r*.61*Math.sin(a),r*.22,r*.2,r*.24,pick(['#916a43','#74503c','#a67c54']))}}basket(-1.36,1.09,.56,.177);
for(let k=0;k<5;k++){let z=-1.69+k*.143;rod(-6.23,1.18,z,-6.43,1.92+R(-.16,.18),z-.17,.048,'#d8c9a4',1,12)}
box(-5.95,2.59,-4.44,.066,.11,.05,wood);for(let i=0;i<2;i++)box(-6.17+i*.09,2.01,-4.42,.093,.65+i*.13,.035,'#8c7869',0,0,.06-i*.12);
pot(-4.68,1.12,-.25,.095,'#8c9e9c');cyl(-4.68,1.213,-.25,.077,.009,'#9d9580');
art(-5.44,1.295,1.003,.689,.286,(p,w,h)=>{
  p.fillStyle='#8c704e';p.fillRect(0,0,w,h);
  for(let j=0;j<99;j++){p.strokeStyle=j%3?'#9f805b77':'#654d3544';p.lineWidth=.6;p.beginPath();let y=R(0,h);p.moveTo(0,y);p.bezierCurveTo(123,y+3,288,y-3,w,y+1);p.stroke()}
  p.strokeStyle='#d6c298';p.lineWidth=2;p.strokeRect(11,10,w-22,h-20);
  p.fillStyle='#fae8ba';p.textAlign='center';p.font='500 64px SimSun';p.fillText('\u79cb \u306e \u82b1',w/2,h*.55);p.font='18px Georgia';p.fillText('H A N A    /    A K I',w/2,h*.81);
},-.12);
for(let j=0;j<56;j++){let x=R(-6.35,-4.53),z=R(.32,.92);obj(blade,x,1.073,z,.021,.038,.026,pick(flowerPalette),-1.57,0,R(0,TAU))}

// A retained strip of eave shows the roof section clearly at the cut edge.
function roofLip(x1,x2){let pp=[],idx=[];for(let i=0;i<=9;i++){let u=i/9,z=-2.65+2.94*u,y=4.13+.83*(1-u)**1.4;pp.push([x1,y,z],[x2,y,z]);if(i){let n=i*2;idx.push(n,n-2,n-1,n,n-1,n+1)}}face(pp,idx,'#536065');for(let k=0;k<=5;k++){let x=x1+(x2-x1)*k/5,pt=[];for(let j=0;j<=8;j++){let u=j/8;pt.push([x,4.15+.83*(1-u)**1.4,-2.65+2.94*u])}pipe(pt,.043,'#718083');ball(x,4.139,.29,.066,.066,.053,'#6c7b7e');ring(x,4.139,.339,.043,.009,'#97a29c')}for(let j=0;j<9;j++){let u=(j+.5)/9;rod(x1,4.162+.83*(1-u)**1.4,-2.65+2.94*u,x2,4.162+.83*(1-u)**1.4,-2.65+2.94*u,.018,'#465257')}for(let j=0;j<21;j++){let u=R(.02,.99);leaf(R(x1,x2),4.207+.83*(1-u)**1.4,-2.65+2.94*u,R(.059,.108),j%4===0,null,true)}}roofLip(-6.77,-5.99); 
world=gardenRoot;
world=sites.hall;
for(let j=0;j<81;j++){let x=R(2.71,6.11),u=R(.04,.98),side=rand()>.5?1:-1;leaf(x,1.98+2.27*1.13+.91*1.13*(1-u)**1.5+.074,-4.86+u*1.683*side,R(.047,.121),j%2===0,null,true)}
world=gardenRoot;
world=sites.studio;
// Sway, a clockwork pendulum and field observations left on the desk.
let clockX=-4.57;box(clockX,2.91,-4.405,.35,.74,.16,wood);box(clockX,2.65,-4.309,.253,.285,.017,'#484b40');let clockFace=canvasTex(256,256,p=>{p.fillStyle='#8f6a42';p.fillRect(0,0,256,256);p.fillStyle='#eeddb2';p.beginPath();p.arc(128,128,118,0,TAU);p.fill();p.textAlign='center';p.textBaseline='middle';p.fillStyle=ink;p.font='25px Georgia';for(let i=1;i<=12;i++){let a=i*TAU/12;p.fillText(i,128+94*Math.sin(a),128-94*Math.cos(a))}p.strokeStyle=ink;p.lineWidth=8;p.beginPath();p.moveTo(116,67);p.lineTo(128,128);p.lineTo(180,126);p.stroke()});let faceClock=mesh(new T.CircleGeometry(.158,32),0,clockX,3.091,-4.306,new T.MeshBasicMaterial({map:clockFace}));ring(clockX,3.091,-4.304,.163,.012,gold);let pend=new T.Group();pend.position.set(clockX,2.875,-4.282);world.add(pend);animalPart(pend,0,-.12,0,.012,.22,.012,gold,cylG());animalPart(pend,0,-.245,0,.054,.06,.018,gold);anim.push(t=>pend.rotation.z=.19*Math.sin(t*2.46));
let sewing=art(-2.14,2.897,-4.47,.54,.21,(p,w,h)=>{p.fillStyle='#3c5262';p.fillRect(0,0,w,h);for(let j=0;j<7;j++){let x=(j+.5)*w/7,r=w*.047;p.fillStyle='#e6d3a2';p.beginPath();p.arc(x,h*.49,r,0,TAU);p.fill();if(j!==3){p.fillStyle='#3c5262';p.beginPath();p.arc(x+(3-j)*r*.28,h*.48,r*.97,0,TAU);p.fill()}}});
let stat=[[-3.99,1.16,-1.88],[-3.96,1.36,-1.89]];for(let a of [-1,1]){cyl(-3.98,1.274+a*.107,-1.85,.084,.022,gold);obj(cylG(.1,14),-3.98,1.274-a*.049,-1.85,.061,.097,.061,'#d0d6bb',a>0?0:Math.PI);rod(-3.98+a*.066,1.17,-1.85,-3.98+a*.066,1.38,-1.85,.009,gold)}ring(-4.1,1.136,-1.57,.114,.013,gold,1.57);for(let i=0;i<3;i++)rod(-4.1,1.14,-1.57,-4.1+.101*Math.sin(i*2.1),1.14,-1.57+.101*Math.cos(i*2.1),.007,gold);
atSite('rest',()=>{for(let a of [-1,1])cup(.32+a*.46,.626,-.56,.7);cyl(.3,.632,-.64,.114,.024,'#d5caad');for(let j=0;j<3;j++)ball(.245+j*.054,.675,-.64,.038,.037,.036,['#b4b98b','#e7d3b3','#d5ada2'][j]);});
let lightGlow=new T.PointLight('#8fe9ff',1.8,3.1);lightGlow.position.set(ox,oy,oz);sites.studio.add(lightGlow);lightGlow.distance*=sites.studio.scale.x;
function paperLight(x,y,z){box(x,y+.32,z,.295,.64,.295,wood);for(let a of [-1,1]){box(x,y+.32,z+a*.15,.247,.53,.01,'#f6dc9b');box(x+a*.15,y+.32,z,.01,.53,.247,'#e6ca8d')}for(let i=0;i<3;i++)box(x,y+.17+i*.15,z+.163,.255,.017,.015,wood)}paperLight(-6.2,1.12,-3.28);
for(let j=0;j<3;j++){let r=R(.09,.16);pot(-.82-j*.29,1.12,-2.1,r,pick(['#8b7a62','#8b9a86','#9b7d61']));shrub(-.82-j*.29,1.12+r,-2.1,.135,.22,greens)}
// Moving cat, alternate garden routes and a camera-aware head turn.
let cat=new T.Group(),catHead=new T.Group();cat.add(catHead);world.add(cat);animalPart(cat,0,.105,0,.21,.124,.135,'#c6a57c');for(let i=0;i<3;i++)animalPart(cat,-.06+i*.059,.201,-.008,.022,.029,.098,'#977352',sphereG,-.17);catHead.position.set(.146,.17,.042);animalPart(catHead,0,.015,0,.108,.103,.102,'#dbc4a0');for(let a of [-1,1]){animalPart(catHead,a*.062,.113,-.02,.044,.098,.043,'#a37e5c',cylG(0,3),-a*.13);animalPart(catHead,a*.045,.025,.096,.021,.005,.007,ink);animalPart(catHead,a*.034,-.015,.093,.041,.023,.02,'#e9d9b6')}animalPart(catHead,0,0,.115,.017,.01,.009,'#986957');for(let k=0;k<5;k++)animalPart(cat,-.16+k*.011,.083,-.061+k*.04,.063,.06,.053,k%2?'#a58668':'#c1a27e');for(let a of [-1,1])animalPart(cat,.12,.028,a*.08,.068,.039,.045,'#d7bd95');
// The cushion and veranda are studio-local. Both routes end on the actual pond bank.
function catPath(inside,bank){
  return new T.CatmullRomCurve3([...inside.map(p=>V(...p)),...bank.map(p=>sites.studio.worldToLocal(V(...p)))]);
}
const catPaths=[
  catPath([[-3.01,1.24,-.86],[-3.75,1.12,-.48],[-3.15,1.09,.52],[-2.62,.98,.84],[-2.59,.56,1.39],[-2.61,.22,1.91]],
    [[-2.08,.15,1.43],[-1.40,.15,2.72],[-1.39,.16,4.12]]),
  catPath([[-3.01,1.24,-.86],[-3.48,1.12,-.23],[-3.05,1.09,.63],[-2.56,.95,.89],[-2.39,.52,1.42],[-2.36,.21,1.93]],
    [[-1.88,.16,1.26],[-.93,.16,2.37],[-.46,.16,3.21]])
];anim.push(t=>{let u=t%88,route=catPaths[Math.floor(t/88)%2],f=u<43?0:u<54?(u-43)/11:u<66?1:u<79?1-(u-66)/13:0;cat.position.copy(route.getPointAt(clamp(f,0,1)));let dir=route.getTangentAt(clamp(f,0,1));cat.rotation.y=f===0?.17:Math.atan2(-dir.z,dir.x)+(u>=66?Math.PI:0);let walk=f>0&&f<1;cat.position.y+=walk?.023*Math.abs(Math.sin(t*5)):0;cat.scale.y=(walk?1.12:.9)+.018*Math.sin(t*1.3);catHead.rotation.x=.08*Math.sin(t*.93)-.21*viewerAttention(sitePoint('studio',cat.position.toArray()),3.31,t);catHead.rotation.y=.19*Math.sin(t*.63)});
world=gardenRoot;
function fieldFlowers(x,y,z,r,c){for(let j=0;j<10;j++){let a=R(0,TAU),rr=Math.sqrt(rand())*r;let xx=x+rr*Math.cos(a),zz=z+rr*Math.sin(a),h=R(.22,.42);rod(xx,y,zz,xx+.014,y+h,zz,.008,'#738354');for(let n=0;n<6;n++){let b=n*TAU/6;let s=.075;pipe([[xx,y+h,zz],[xx+Math.cos(b)*s,y+h+.02,zz+Math.sin(b)*s],[xx+Math.cos(b)*s*1.18,y+h+.07,zz+Math.sin(b)*s*1.18]],.009,c);ball(xx+Math.cos(b)*s*1.18,y+h+.073,zz+Math.sin(b)*s*1.18,.013,.009,.013,'#dca052')}}}
for(const [x,z,y] of [[3.37,2.06,.24],[5.98,.64,stairLevel(5)+.10],[3.37,-1.16,stairLevel(11)+.10]])atSite('upper',()=>fieldFlowers(x,y,z,.18,'#c94130'));
for(const [x,z,y] of [[1.62,.80,.22],[-2.18,4.26,.12]])fieldFlowers(x,y,z,.14,'#c94130');
world=sites.studio;
for(let i=0;i<9;i++){let x=-1.85+R(-.37,.37),z=2.16+R(-.21,.21);rod(x,.11,z,x,.18,z,.013,paper);ball(x,.195,z,.055,.029,.054,'#ac6846')}
world=gardenRoot;
world=sites.treeGround;
let rays=[];
const sunPatches=[[1.18,.22,.98],[1.09,.53,3.47],[.69,.52,4.64]];
for(let j=0;j<3;j++){
  const x=.15+j*.42,z=-3.25+j*.17,y=8.1+j*.14;
  const [ex,ey,ez]=sunPatches[j],near=sites.treeGround.worldToLocal(V(ex-.22,ey,ez-.19)),far=sites.treeGround.worldToLocal(V(ex+.25,ey,ez+.26));
  let g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([[x,y,z],[x+.06,y,z+.07],far.toArray(),near.toArray()].flat(),3));
  g.setAttribute('uv',new T.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));g.setIndex([0,1,2,0,2,3]);let tex=canvasTex(64,128,(p,w,h)=>{for(let k=0;k<h;k++){let a=Math.sin(k/h*Math.PI)*.25;let gr=p.createLinearGradient(0,0,w,0);gr.addColorStop(0,'rgba(255,230,159,0)');gr.addColorStop(.51,'rgba(255,236,175,'+a+')');gr.addColorStop(1,'rgba(255,230,159,0)');p.fillStyle=gr;p.fillRect(0,k,w,1)}});let o=mesh(g,0,0,0,0,new T.MeshBasicMaterial({side:T.DoubleSide,map:tex,transparent:true,depthWrite:false,opacity:.52,blending:T.AdditiveBlending}));o.castShadow=false;rays.push(o)}anim.push(t=>{rays.forEach((o,i)=>{o.material.opacity=.33+.19*Math.sin(t*.19+i*.31);o.position.x=.12*Math.sin(t*.17+i*.23)});lightGlow.intensity=(1.54+.46*Math.sin(t*.36))*sites.studio.scale.x**2});
world=gardenRoot;
const petalG=(()=>{let a=[],ind=[];for(let i=0;i<=5;i++){let u=i/5,width=.32*Math.sin(Math.PI*Math.pow(u,.86))+.025;for(let j=0;j<3;j++){let v=j-1;a.push(v*width,u*.78+.12*Math.sin(u*Math.PI)+v*v*.13,u*.58+Math.sin(Math.PI*u)*.21);if(i&&j){let k=i*3+j;ind.push(k,k-1,k-4,k,k-4,k-3)}}}let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(a,3));g.setIndex(ind);g.computeVertexNormals();return g})();
function flowersOfSeason(x,y,z,h,kind,col){let r=kind===6?.044:R(.047,.068);let a=R(0,TAU),lean=R(.034,.106),X=x+lean*Math.cos(a),Z=z+lean*Math.sin(a);rod(x,y,z,X,y+h,Z,.0065,'#567c53',.66,6);for(let k=0;k<5;k++){let u=k*.15+.18,ang=a+k*2.39;obj(blade,x+u*(X-x)+.034*Math.cos(ang),y+h*u,z+u*(Z-z)+.034*Math.sin(ang),.067,.091,.076,pick(greens),-.74,ang,.48)}
if(kind===6){for(let k=0;k<8;k++)for(let j=0;j<3;j++){let a=j*2.09+k;ball(X+Math.cos(a)*.019,y+h+k*.018,Z+Math.sin(a)*.019,.016,.021,.015,k%2?'#afa2d3':'#8783ad')}return}
let layers=[3,4,1,3,1,3][kind],n=[7,8,7,12,8,16][kind];for(let l=0;l<layers;l++)for(let j=0;j<n;j++){let a=j/n*TAU+l*1.52,scale=r*(1.32-l*.20);obj(petalG,X+Math.sin(a)*r*.15,y+h+l*r*.13,Z+Math.cos(a)*r*.15,scale*(kind===5?.55:1.12),scale,scale,col,.71-l*.22,a,0)}ball(X,y+h+r*.38,Z,r*.32,r*.21,r*.32,kind===2?'#444442':'#e6b754');for(let j=0;j<7;j++)ball(X+Math.cos(j)*r*.25,y+h+r*.49,Z+Math.sin(j)*r*.25,.006,.006,.006,'#f2d69a')}

world=sites.studio;
// Florist's snips, coil of cord and fold of wrapping paper.
for(let i=0;i<2;i++)ring(-4.39+i*.044,1.094,.36,.03,.006,'#68726b',1.57);rod(-4.36,1.094,.39,-4.31,1.094,.49,.009,'#c4c5ae');rod(-4.36,1.095,.39,-4.395,1.095,.487,.009,'#c4c5ae');for(let i=0;i<3;i++)ring(-4.53,1.097+i*.012,.36,.065,.009,'#b9a37c',1.57);box(-4.28,1.083,.53,.29,.01,.23,'#ba9d76',0,-.22);
for(let a of [-1,1])rod(-4.31,1.07,.69,-4.31+a*.08,1.49,.66,.025,wood);pot(-4.36,1.081,.77,.097,'#9fa79f');rod(-4.36,1.14,.77,-4.19,1.25,.77,.027,'#95a199',.55);ring(-4.43,1.21,.77,.068,.011,'#adb5aa');
for(let j=0;j<21;j++){let x=-6.19+j%7*.16,y=1.25+Math.floor(j/7)*.19;obj(blade,x,y,.092,.036,.072,.05,pick(['#aa9c93','#b2a79b','#9eaba3']),-.22,0,R(-1,1))}
for(let k=0;k<4;k++){let x=-6.09+k*.176;rod(x,2.14,-4.43,x,1.61,-4.4,.02,wood);obj(blade,x,1.80,-4.39,.16,.48,.23,pick(['#797b70','#778880','#9f8c6d']),-.08,0,.05)}
world=gardenRoot;
// Worn lacquering and small ceramic maker's marks.
atSite('gate',()=>{for(let a of [-1,1]){for(let j=0;j<38;j++){let y=R(.76,3.37),ang=R(-1.2,1.2),r=.164,x=4.75+a*1.27*(1.02-.11*(y-.12)/3.36);box(x+r*Math.sin(ang),y,3.45+r*Math.cos(ang),.008,.037,.003,pick(['#bb6747','#ac4e34','#cb5c3a']),0,ang,R(-.23,.23))}}});
world=sites.upper;
for(let i=0;i<6;i++){let x=R(3.78,5.69),z=2.19-R(.04,.11);leaf(x,.211,z,.081,i%2,null,true)}
world=gardenRoot;
for(let j=0;j<4;j++){let u=j/3,x=R(.02,1.4),y=R(-.7,.22);let o=mesh(st,'#e8c769',x,y,6.48+.403*Math.cos(j*1.62));o.scale.setScalar(.094);o.rotation.set(-.35,.24*Math.sin(j),R(0,2))}
lime(-.38,.08,6.51,.139,true);
let wtime={value:0};
const leafMotion=`
  vec3 origin=instanceMatrix[3].xyz;
  float phase=mod(windT-(5.-origin.x)*.39-(3.-origin.z)*.12+84.,42.)-4.;
  float breeze=exp(-phase*phase/8.);
  transformed.x+=(.071+.41*breeze)*(position.y+.4)*sin(windT*1.3+origin.x*1.4+origin.y*.9);
  float canopy=smoothstep(2.3,5.,origin.y)*(.016+.052*breeze);
  vec3 offset=canopy*vec3(sin(windT*.83+origin.y*.41+origin.x*.23),.19*sin(windT*1.07+origin.z*.35),.46*sin(windT*.71+origin.x*.42));
  vec3 xx=instanceMatrix[0].xyz,yy=instanceMatrix[1].xyz,zz=instanceMatrix[2].xyz;
  transformed+=vec3(dot(offset,xx)/max(dot(xx,xx),.000001),dot(offset,yy)/max(dot(yy,yy),.000001),dot(offset,zz)/max(dot(zz,zz),.000001));
`;
function windVertices(shader){
  shader.uniforms.windT=wtime;
  shader.vertexShader='uniform float windT;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+leafMotion);
}
const foliagePaint=paint.clone();
foliagePaint.onBeforeCompile=shader=>{
  windVertices(shader);
  shader.vertexShader='varying float brush;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','brush=position.y;\n#include <project_vertex>');
  shader.fragmentShader='varying float brush;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=.94+.13*brush;');
};
foliagePaint.customProgramCacheKey=()=>'botanicalPainting';
const windDepth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});
windDepth.onBeforeCompile=windVertices;windDepth.customProgramCacheKey=()=>'leafShadowMotion';
foliagePaint.userData.windDepth=windDepth;
for(const batch of batches.values())if([mapleGeo,fanGeo,blade,petalG].includes(batch.g))batch.mat=foliagePaint;
anim.push(t=>wtime.value=t);
let travelingLeaves=[];for(let i=0;i<12;i++){let o=mesh(i%2?fanGeo:mapleGeo,pick(i%2?ginCols:mapCols));o.scale.setScalar(.08);o.rotation.x=-1.56;travelingLeaves.push(o)}
let streamLine=new T.CatmullRomCurve3(stream.map(([x,z])=>V(x,streamSurface(z)+.013,z)));anim.push(t=>{for(let j=0;j<travelingLeaves.length;j++){let o=travelingLeaves[j],u=(t*.048+j*.082)%1;o.position.copy(streamLine.getPointAt(u));o.position.x+=.068*Math.sin(j+t*.43);o.rotation.z=t*.32+j}});
const orbitPeriod=33.8,alignmentTime=7;
function orbitPhase(t){return (t+orbitPeriod-alignmentTime)%orbitPeriod}
function crossingLight(t){let u=orbitPhase(t),d=Math.min(u,orbitPeriod-u);return Math.exp(-d*d/2.12)}
const ringDirection=V(0,0,1),alignedPose=new T.Quaternion().setFromEuler(new T.Euler(.86,.4,0));
const matchPoses=orbs.map((_,i)=>alignedPose.clone().multiply(new T.Quaternion().setFromAxisAngle(ringDirection,i*.54)));
world=sites.studio;
const waveDots=[];for(let j=0;j<36;j++){let o=mesh(sphereG,'#f2f4cf');o.scale.setScalar(.012);waveDots.push(o)}
anim.push(t=>{
  const elapsed=orbitPhase(t),align=crossingLight(t),pulse=clamp(elapsed/2.67,0,1);
  orbs.forEach((axis,i)=>axis.quaternion.slerp(matchPoses[i],align));
  waveDots.forEach((o,j)=>{
    const theta=j*TAU/waveDots.length,rad=.38+pulse*.71;
    o.visible=elapsed<2.67;o.position.set(ox+Math.cos(theta)*rad,oy+.07*Math.sin(theta*3+pulse)+pulse*.045,oz+Math.sin(theta)*rad);
    o.scale.setScalar(.015*(1-pulse));
  });
  halo.material.opacity=.69+.28*align;
});
world=gardenRoot;
// Fluted pastry sides and cream at the tart's cut faces.
for(let j=0;j<31;j++){let a=R(0,TAU),r=R(2.42,2.54),x=px+r*Math.cos(a),z=pz+r*Math.sin(a);if(z<6.96)rock(x,.129,z,R(.018,.052),R(.012,.034),R(.015,.045),pick(['#d29e60','#e2b673','#c59958']))}
for(let j=0;j<5;j++){let x=pick([-.98,.21,1.55]),z=R(4.22,5.95);for(let k=0;k<3;k++){let a=k*TAU/3+j;obj(blade,x+.07*Math.sin(a),.541,z+.07*Math.cos(a),.153,.19,.15,pick(['#79a66a','#8cb875','#6b9c65']),-1.53,0,a)}}for(let y of [.19,.32,.45])for(let a of [.11,.66]){let x=px+.57,z=pz+.31;rod(x+Math.cos(a)*.08,y,z+Math.sin(a)*.08,x+Math.cos(a)*2.16,y,z+Math.sin(a)*2.16,.008,'#b7ddd0')}
for(let j=0;j<3;j++){let a=.37+j*.07,x=px+.57+1.48*Math.cos(a),z=pz+.31+1.48*Math.sin(a);ball(x,.57,z,.083,.069,.082,'#49597b');ring(x,.635,z,.024,.008,'#344468',1.57)}
// Soft patches of caustic light grow and subside beneath the eaves.
world=sites.studio;
const bounceTex=canvasTex(128,128,(p,w,h)=>{p.clearRect(0,0,w,h);p.strokeStyle='rgba(205,234,196,.57)';p.lineWidth=2.4;for(let i=0;i<18;i++){let x=R(4,120),y=R(9,110);p.beginPath();p.moveTo(x,y);p.bezierCurveTo(x+7,y-4,x+10,y+3,x+15,y-1);p.stroke()}});for(let i=0;i<3;i++){let o=mesh(new T.PlaneGeometry(.72,.29),0,-3.41+i*.69,.91,.815,new T.MeshBasicMaterial({map:bounceTex,transparent:true,depthWrite:false,opacity:.46}));o.castShadow=false;anim.push(t=>{o.material.opacity=.27+.18*Math.sin(t*.73+i);o.scale.x=1+.04*Math.sin(t+i)})}
world=gardenRoot;
world=sites.treeGround;
let skyMotes=[];for(let j=0;j<46;j++){let x=R(.1,2.05),z=R(-2.85,3.64),y=R(.7,6.4),o=mesh(sphereG,'#e6d6a4');o.castShadow=false;o.scale.setScalar(R(.006,.014));skyMotes.push([o,x,y,z,j])}anim.push(t=>{for(let [o,x,y,z,j] of skyMotes)o.position.set(x+.18*Math.sin(t*.21+j),y+.16*Math.sin(t*.33+j*1.4),z+.078*Math.cos(t*.23+j))});
world=gardenRoot;
// Waterline visitors and the potter's little goldfish jar.
let tortoise=new T.Group();world.add(tortoise);animalPart(tortoise,0,.054,0,.156,.087,.111,'#71805a');for(let j=0;j<7;j++){let a=j*.897;animalPart(tortoise,.083*Math.sin(a),.113,.063*Math.cos(a),.04,.018,.033,'#91945b')}animalPart(tortoise,.158,.057,0,.064,.051,.053,'#96a068');for(let s of [-1,1]){animalPart(tortoise,.182,.074,s*.041,.009,.01,.009,ink);for(let a of [-1,1])animalPart(tortoise,a*.111,.021,s*.093,.043,.023,.031,'#8a9161')}anim.push(t=>{let u=t%67,m=u<36?0:u<44?(u-36)/8:u<56?1:u<64?1-(u-56)/8:0;tortoise.position.set(-1.14+.48*m,.574-.129*Math.sin(Math.PI*m),5.43-.34*m);tortoise.rotation.y=.56+.13*Math.sin(t*.41);tortoise.rotation.z=-.15*Math.sin(m*TAU)});
world=sites.studio;
pot(-3.68,.11,1.35,.24,'#786c55');ball(-3.68,.305,1.35,.247,.184,.24,'#8b7b62');ring(-3.68,.422,1.35,.207,.032,'#9b8b70',1.57);cyl(-3.68,.424,1.35,.183,.016,'#87b6a7');for(let j=0;j<3;j++){let o=mesh(sphereG,'#d47c39');o.scale.set(.038,.018,.018);anim.push(t=>{let a=t*.45+j*2.1;o.position.set(-3.68+.107*Math.cos(a),.437,1.35+.08*Math.sin(a));o.rotation.y=-a-1.57})}
world=gardenRoot;
const bannerPaper=canvasTex(128,320,(p,w,h)=>{
  p.fillStyle='#bd4b36';p.fillRect(0,0,w,h);p.strokeStyle='#e1b183';p.lineWidth=2;p.strokeRect(8,12,w-16,h-24);
  p.fillStyle='#f1dfbb';p.textAlign='center';p.font='47px SimSun';p.fillText('\u5949',w/2,155);p.fillText('\u7d0d',w/2,220);
  p.beginPath();p.moveTo(40,41);p.lineTo(59,53);p.lineTo(68,53);p.lineTo(89,40);p.lineTo(85,67);p.lineTo(64,89);p.lineTo(43,68);p.closePath();p.fill();
  p.strokeStyle='#b3533b';p.lineWidth=3;p.beginPath();p.moveTo(49,62);p.lineTo(57,66);p.moveTo(78,62);p.lineTo(70,66);p.stroke();p.fillRect(61,251,6,6);
});
const bannerMat=new T.MeshToonMaterial({map:bannerPaper,color:'#fff2df',gradientMap:grad,side:T.DoubleSide});
atSite('inari',()=>{
for(let j=0;j<5;j++){
  const X=3.054,Z=.134-j*.337,Y=1.112+j*.018;
  rod(X,.123,Z,X,Y+.04,Z,.014,'#92865d');rod(X-.009,Y,Z,X+.161,Y,Z,.011,'#ab9463');
  const flag=mesh(new T.PlaneGeometry(.136,.343,5,7),0,X+.084,Y-.187,Z,bannerMat),attr=flag.geometry.attributes.position,base=attr.array.slice();
  anim.push(t=>{
    const gust=windStrength(t,X,Z);
    for(let k=0;k<attr.count;k++){
      const x=base[k*3],y=base[k*3+1],free=clamp((.171-y)/.343,0,1)*clamp((x+.076)/.14,0,1);
      attr.setXYZ(k,x-.011*gust*free,y+.013*gust*free,free*(.011+.051*gust)*Math.sin(t*2.3+x*13-y*8+j*.76));
    }
    attr.needsUpdate=true;
  });
}


});
world=sites.studio;
const pageInk=canvasTex(192,256,(p,w,h)=>{
  p.fillStyle='#e8dcba';p.fillRect(0,0,w,h);p.strokeStyle='#8c8871';p.lineWidth=1.25;
  for(let j=0;j<7;j++){p.beginPath();p.moveTo(20,39+j*24);for(let k=0;k<19;k++)p.lineTo(21+k*7.4,39+j*24+R(-2.5,2.5));p.stroke()}
});
for(let leaf=0;leaf<3;leaf++){
  const page=mesh(new T.PlaneGeometry(.118,.217,10,4),0,-1.72,1.777+leaf*.0011,-3.4,new T.MeshToonMaterial({color:'#fffbec',map:pageInk,side:T.DoubleSide,gradientMap:grad}));
  page.geometry.translate(.059,0,0);page.rotation.x=-Math.PI/2;
  const vertices=page.geometry.attributes.position,flat=vertices.array.slice();
  anim.push(t=>{
    let u=clamp((t%42-11.33-leaf*.38)/1.02,0,1);
    u=u*u*(3-2*u);if(Math.floor(t/42)%2)u=1-u;
    for(let i=0;i<vertices.count;i++){
      const x=flat[i*3],y=flat[i*3+1],curve=Math.PI*u+.32*Math.sin(Math.PI*u)*(x/.118-.44+y*.75);
      vertices.setXYZ(i,x*Math.cos(curve),y,x*Math.sin(curve));
    }
    vertices.needsUpdate=true;page.geometry.computeVertexNormals();
  });
}

const earthen=art(-5.21,1.95,-3.974,.441,.221,(p,w,h)=>{p.fillStyle='#af8b5f';p.fillRect(0,0,w,h);p.fillStyle='#5b6157';p.fillRect(205,21,278,h*.29);p.fillStyle='#d8c49a';for(let j=0;j<35;j++)p.fillRect(214+j*7,28,2,j%4===0?18:9);p.fillStyle='#d2bc92';p.fillRect(44,40,118,135);p.fillStyle='#5b5749';for(let y=47;y<174;y+=8)for(let x=48;x<161;x+=8)p.fillRect(x+(y%3),y,4,4);p.strokeStyle='#856b4d';p.lineWidth=4;p.strokeRect(6,6,w-12,h-12);for(let x of [232,429]){p.fillStyle='#5c5b4c';p.beginPath();p.arc(x,h*.66,20,0,TAU);p.fill();p.strokeStyle='#cfb98f';p.beginPath();p.moveTo(x,h*.66);p.lineTo(x+8,h*.66-11);p.stroke()}});
world=gardenRoot;
let crow=new T.Group();world.add(crow);animalPart(crow,0,0,0,.13,.065,.174,'#42494b');for(let a of [-1,1])animalPart(crow,a*.18,.033,0,.267,.022,.103,'#484d4e',sphereG,a*.22);animalPart(crow,0,.061,.147,.061,.062,.077,'#42494b');anim.push(t=>{let u=(t+50)%74;crow.visible=u<6;crow.position.set(6.3-1.94*u,6.85+.23*Math.sin(u*.83),-5.1+u*.37);crow.rotation.y=-1.14;crow.rotation.z=.063*Math.sin(u*2.2)});
world=sites.studio;
// Ink wash in the artist's study. A branch, a gate, and an unfinished foreground.
let landscapePainting=canvasTex(400,460,(p,w,h)=>{p.fillStyle='#e7d9b5';p.fillRect(0,0,w,h);p.save();p.beginPath();p.rect(23,21,w-46,h-55);p.clip();let g=p.createLinearGradient(0,22,0,420);g.addColorStop(0,'#a9c6bd');g.addColorStop(.47,'#d6d4ad');g.addColorStop(.59,'#a8ad79');g.addColorStop(1,'#d6c494');p.fillStyle=g;p.fillRect(0,0,w,h);for(let k=0;k<3;k++){p.beginPath();p.moveTo(0,280);for(let x=0;x<=w;x+=4)p.lineTo(x,156+Math.sin(x*.023+k)*14+Math.sin(x*.009+2*k)*33+k*23);p.lineTo(w,280);p.fillStyle=['#9cae97','#98a186','#969a73'][k];p.fill()}
function branch(x,y,l,a,d){let X=x+Math.cos(a)*l,Y=y+Math.sin(a)*l;p.lineWidth=d*1.6;p.strokeStyle='#776448';p.beginPath();p.moveTo(x,y);p.quadraticCurveTo((x+X)*.5+3,(y+Y)*.5,X,Y);p.stroke();if(d<3){for(let i=0;i<65;i++){let ax=X+R(-22,22),ay=Y+R(-17,18);p.fillStyle=pick(['#a95637','#ba6940','#cf8245','#cf9353','#af6235','#d5a064']);p.beginPath();p.ellipse(ax,ay,R(1.4,3.7),R(.8,2.2),R(-2,1),0,TAU);p.fill()}}if(d>0){branch(X,Y,l*.71,a-R(.18,.58),d-1);branch(X,Y,l*.74,a+R(.24,.61),d-1)}}branch(59,299,53,-1.34,5);branch(348,283,41,-1.62,4);p.fillStyle='#84aba1';p.beginPath();p.ellipse(88,350,126,34,-.16,0,TAU);p.fill();for(let j=0;j<35;j++){p.fillStyle='#bdc9a9';p.fillRect(R(27,173),R(338,361),R(3,16),1.3)}p.strokeStyle='#a74f33';p.lineWidth=9;for(let x of [242,309]){p.beginPath();p.moveTo(x,197);p.lineTo(x-2,296);p.stroke()}p.beginPath();p.moveTo(222,195);p.quadraticCurveTo(278,207,330,194);p.stroke();p.beginPath();p.moveTo(231,222);p.lineTo(320,222);p.stroke();p.lineWidth=4;p.strokeStyle='#4f5b53';p.beginPath();p.moveTo(216,188);p.quadraticCurveTo(277,201,334,187);p.stroke();for(let j=0;j<160;j++){let x=R(0,w),y=R(300,420);p.strokeStyle=pick(['#9d997299','#e1c59188','#b3a37b99']);p.lineWidth=R(.5,2.5);p.beginPath();p.moveTo(x,y);p.lineTo(x+R(3,11),y-R(1,4));p.stroke()}p.fillStyle='#e6d9b5';p.beginPath();p.moveTo(374,304);
for(let v=0;v<=22;v++){let u=v/22;p.lineTo(374-197*u,306+104*u+6*Math.sin(v*1.7)+3*Math.sin(v*.72))}
p.lineTo(170,427);p.lineTo(377,427);p.closePath();p.fill();
p.strokeStyle='#8d867377';p.lineWidth=1.2;
for(let k=0;k<6;k++){let y=343+k*13;p.beginPath();p.moveTo(328-k*16,y);p.lineTo(367,y+7-k*.28);p.stroke()}
p.beginPath();p.moveTo(373,308);p.quadraticCurveTo(348,341,312,360);p.quadraticCurveTo(273,387,215,415);p.stroke();
p.restore();p.font='italic 12px Georgia';p.fillStyle='#817555';p.fillText('Aki   /   étude au jardin',25,445);p.fillStyle='#ad6551';p.fillRect(343,427,17,17)});
for(let o of world.children)if(o.geometry?.type==='PlaneGeometry'&&Math.abs(o.position.x-ex)<.001&&Math.abs(o.position.y-2.052)<.001){o.material.map=landscapePainting;o.material.needsUpdate=true}
world=gardenRoot;
