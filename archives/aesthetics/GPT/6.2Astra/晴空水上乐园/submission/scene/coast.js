'use strict';
const sky=new T.Mesh(new T.SphereGeometry(3400,48,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms:{tm:clockTime},vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDir;uniform float tm;
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec3 k=vec3(23.1,51.7,1592.3);return mix(mix(fract(sin(dot(i,k.xy))*k.z),fract(sin(dot(i+vec2(1,0),k.xy))*k.z),f.x),mix(fract(sin(dot(i+vec2(0,1),k.xy))*k.z),fract(sin(dot(i+1.,k.xy))*k.z),f.x),f.y);}
void main(){vec3 d=normalize(vDir);float h=max(0.,d.y);
vec3 c=mix(vec3(.63,.846,.96),vec3(.050,.49,.85),1.-exp(-h*22.));c=mix(c,vec3(.045,.32,.72),smoothstep(.24,.9,h));
vec2 p=d.xz/max(.06,h)*vec2(1.2,4.5);p.x+=tm*.0014;float n=noise2(p*.65)*.6+noise2(p*1.3)*.28+noise2(p*3.)*.12;float w=smoothstep(.64,.91,n)*smoothstep(.08,.25,h);c=mix(c,vec3(.9,.97,1.),w*.3);gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}`}));
sky.renderOrder=-100;scene.add(sky);
const cloudTex=cloudImages.map(()=>new T.Texture());
const cloudsReady=Promise.all(cloudImages.map((src,i)=>new Promise(resolve=>{const img=new Image();img.onload=()=>{cloudTex[i].image=img;cloudTex[i].colorSpace=T.SRGBColorSpace;cloudTex[i].needsUpdate=true;resolve()};img.src=src})));
const cloudSprites=[];
const cloudBanks=[[-685,158,-835,590,236],[-271,104,-1000,344,126],[194,166,-987,547,237],[667,116,-710,490,167],[990,198,-40,589,238],[-1030,166,240,600,238],[160,187,1120,671,268],[-1033,112,-672,368,136],[527,73,-1085,293,96],[-38,62,-1365,225,74]];
for(let i=0;i<cloudBanks.length;i++){const [x,y,z,w,h]=cloudBanks[i],sp=new T.Sprite(new T.SpriteMaterial({map:cloudTex[i%4],transparent:true,depthWrite:false,fog:false,opacity:.98}));sp.scale.set(w,h,1);sp.position.set(x,y,z);sp.renderOrder=-70;scene.add(sp);cloudSprites.push(sp);perFrame.push(t=>sp.position.x=x+Math.sin(t*.008+i)*3+t*.025)}
const seaMesh=new T.Mesh(new T.PlaneGeometry(6200,6200),new T.ShaderMaterial({uniforms:{tm:clockTime},vertexShader:`varying vec3 P;void main(){P=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(P,1.);}`,fragmentShader:`varying vec3 P;uniform float tm;
float hsh(vec2 a){return fract(sin(dot(mod(a,751.),vec2(41.7,73.3)))*12541.3);}
float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hsh(i),hsh(i+vec2(1.,0.)),f.x),mix(hsh(i+vec2(0.,1.)),hsh(i+1.),f.x),f.y);}
void main(){vec2 p=P.xz;float d=length((p-vec2(0,5))*vec2(.78,1.15));float deep=smoothstep(128.,390.,d+13.*sin(p.y*.085));
vec2 q=abs(vec2(p.x+2.*sin(p.y*.055),p.y+3.))-vec2(145.,85.);
float shore=min(0.,max(q.x,q.y))+length(max(q,vec2(0.)))-29.+2.3*sin(p.x*.067+p.y*.042)+1.2*sin(p.y*.115-p.x*.031);
shore=min(shore,(length(vec2(p.x/90.,(p.y-107.)/84.))-1.)*72.);
float surfDist=shore-12.4;
vec3 c=mix(vec3(.043,.679,.696),vec3(.010,.347,.606),deep);
float shallows=1.-smoothstep(-1.,33.,surfDist);c=mix(c,vec3(.31,.865,.785),shallows*.75);
float wash=surfDist+1.25*sin(p.y*.34+tm*.6)+.92*cos(p.x*.48-tm*.4);
float breaking=pow(max(0.,cos(wash*1.38-tm*1.06)),10.)*(1.-smoothstep(1.,12.,surfDist));c=mix(c,vec3(.88,1.,.94),breaking*smoothstep(.22,.67,nz(p*.38))*.74);
float waterPatch=nz(p*.041+tm*.007)*.65+nz(p*.081)*.35;c=mix(c,vec3(.51,.95,.86),pow(waterPatch,3.)*.40*(1.-deep*.6));
float s=nz(p*vec2(.075,.71)+vec2(tm*.10,tm*.19))*.66+nz(p*vec2(.16,1.24)-tm*.13)*.34;
float glitter=smoothstep(.75,.86,s);float dist=length(cameraPosition-P);c+=vec3(.54,.57,.55)*glitter*(.38+.55*nz(p*.014))*clamp(540./dist,.09,1.);
float haze=1.-exp(-dist*.00066);c=mix(c,vec3(.65,.82,.89),haze);gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}`}));
seaMesh.rotation.x=-PI/2;seaMesh.position.y=-2.75;seaMesh.renderOrder=-90;scene.add(seaMesh);
function sdRect(x,z,rx,rz,r){const qx=Math.abs(x)-rx+r,qz=Math.abs(z)-rz+r;return Math.min(0,Math.max(qx,qz))+Math.hypot(Math.max(qx,0),Math.max(qz,0))-r}
function riverWarp(x){
 const bend=1.75*Math.sin(x*.039)+.95*Math.sin(x*.083-.6);
 const tunnelLine=1.75*Math.sin(-45*.039)+.95*Math.sin(-45*.083-.6);
 return mix(bend,tunnelLine,smooth(-69,-55,x)*(1-smooth(-35,-23,x)));
}
function riverDist(x,z){return sdRect(x,z-2-riverWarp(x),136,44,23)}
function waveDist(x,z){return Math.max(-30-z,z-29+x*x*.00365,Math.abs(x)-(43.5+.55*z),Math.abs(x)-57.5)}
function coastDist(x,z){const main=sdRect(x+2*Math.sin(z*.055),z+3,174,114,29)+2.3*Math.sin(x*.067+z*.042)+1.2*Math.sin(z*.115-x*.031);const pen=(Math.hypot(x/90,(z-107)/84)-1)*72;return Math.min(main,pen)}
function hillHeight(x,z){
 const v=smooth(-43,-88,z)*(1-smooth(-100,-119,z))*smooth(155,125,Math.abs(x));
 const h=v*(12+9.5*Math.exp(-x*x/3300)+3.3*Math.sin(x*.062+z*.046)+2.4*Math.sin(x*.14-z*.10)+1.7*Math.cos(x*.087+z*.177));
 if(h<1)return .75;const terrace=h<3?h*.65:h<7?3.5+(h-3)*.26:h<11?7+(h-7)*.30:h<15?10.5+(h-11)*.4:h<19?15+(h-15)*.36:19+(h-19)*.50;
 return .75+snap(terrace,.5);
}
const kidDist=(x,z)=>sdRect(x+96+(Math.cos(z*.16)*1.5),z-77,32,18.5,11);
const hotSprings=[[-111,-20,7,5.8,2.65],[-94,-25,7.6,6.25,3.65],[-79,-19,6.8,5.7,2.15]];
const landings=[[-122,-52,14,4.4],[-76,-51,13,3.75],[-22,-50.5,6,4.25],[9,-51.5,10,4.4],[48,-51,10.5,4.75],[90,-51,12,4.5],[122,19,11.5,4.5],[-10,-51.5,4.65,4.2],[61.95,-51.5,4.85,4.3],[107.4,-51.7,5.85,4.4],[-98.4,-51.4,5.9,4.4]];
const riverDocks=[
 {x:64,centre:46+riverWarp(64),width:7.25,code:'01',label:'晴湾码头'},
 {x:-109,centre:-42+riverWarp(-109),width:6.25,code:'02',label:'雨林码头'}
];
function waterKind(x,z,rd){
 if(Math.abs(rd)<5.05||(x>-54&&x<-34&&sdRect(x+44,z+36.25,10.0,5.2,3.3)<0))return 2;
 for(const dock of riverDocks){if(Math.abs(x-dock.x)<dock.width*.65 && sdRect(x-dock.x,z-dock.centre-5.2,dock.width*.65,2.62,1.65)<0)return 2}
 if(z>=-30.5&&z<=30&&Math.abs(x)<60&&waveDist(x,z)<0)return 1;
 if(x<-59&&z>53&&kidDist(x,z)<0)return 3;
 if(x<-61&&z>-12&&z<29&&sdRect(x+92,z-8,24,16.5,6)<0)return 4;
 for(let i=0;i<landings.length;i++){const b=landings[i];if(Math.abs(x-b[0])<b[2]&&Math.abs(z-b[1])<b[3]&&sdRect(x-b[0],z-b[1],b[2],b[3],2)<0)return 5+i}
 return 0;
}
function baseLevel(x,z){if(z<-42)return hillHeight(x,z);return z>56&&z<108&&Math.abs(x)<57?1.75:.75}
const riverPath=[];
{
 const rx=136,rz=44,r=23;function add(x,z){riverPath.push(vec(x,.54,z+2+riverWarp(x)))}
 function line(x,z,X,Z){let n=Math.ceil(Math.hypot(X-x,Z-z));for(let i=0;i<n;i++)add(mix(x,X,i/n),mix(z,Z,i/n))}
 function arc(x,z,a,b){let n=40;for(let i=0;i<n;i++){let f=mix(a,b,i/n);add(x+r*Math.cos(f),z+r*Math.sin(f))}}
 line(-rx+r,rz,rx-r,rz);arc(rx-r,rz-r,PI/2,0);line(rx,rz-r,rx,-rz+r);arc(rx-r,-rz+r,0,-PI/2);line(rx-r,-rz,-rx+r,-rz);arc(-rx+r,-rz+r,-PI/2,-PI);line(-rx,-rz+r,-rx,rz-r);arc(-rx+r,rz-r,PI,PI/2);
}
// Arc length gives boats, foam and ripples a common speed on straights and bends.
const riverRate=.00168,riverDistances=[0],riverSegments=new Map(),riverTangents=[];
for(let i=0;i<riverPath.length;i++){
 const p=riverPath[i],next=riverPath[(i+1)%riverPath.length],prev=riverPath[(i+riverPath.length-1)%riverPath.length];
 riverDistances.push(riverDistances[i]+p.distanceTo(next));riverTangents.push(next.clone().sub(prev).normalize());
 for(let j=Math.floor((p.x-12)/8);j<=Math.floor((p.x+12)/8);j++)for(let k=Math.floor((p.z-12)/8);k<=Math.floor((p.z+12)/8);k++){
  const key=j*2048+k;if(!riverSegments.has(key))riverSegments.set(key,[]);riverSegments.get(key).push(i);
 }
}
const riverLength=riverDistances.at(-1),riverSpeed=riverRate*riverLength;
function riverAt(f,off=0){
 const distance=frac(f)*riverLength;let i=0,end=riverPath.length;
 while(end-i>1){const m=(i+end)>>1;if(riverDistances[m]<=distance)i=m;else end=m}
 const j=(i+1)%riverPath.length,u=(distance-riverDistances[i])/(riverDistances[i+1]-riverDistances[i]);
 const p=riverPath[i],q=riverPath[j],dx=mix(riverTangents[i].x,riverTangents[j].x,u),dz=mix(riverTangents[i].z,riverTangents[j].z,u),len=Math.hypot(dx,dz);
 return [mix(p.x,q.x,u)-dz/len*off,mix(p.z,q.z,u)+dx/len*off,Math.atan2(dx,dz)];
}
function riverCoordinates(x,z){
 const cells=riverSegments.get(Math.floor(x/8)*2048+Math.floor(z/8))||[];
 let distance=Infinity,station=0,offset=0;
 for(const i of cells){const p=riverPath[i],q=riverPath[(i+1)%riverPath.length],dx=q.x-p.x,dz=q.z-p.z,L=riverDistances[i+1]-riverDistances[i];
  const u=clamp(((x-p.x)*dx+(z-p.z)*dz)/(L*L),0,1),a=x-p.x-dx*u,b=z-p.z-dz*u,ds=a*a+b*b;
  if(ds>=distance)continue;distance=ds;station=(riverDistances[i]+u*L)/riverLength;offset=(b*dx-a*dz)/L;
 }
 return [station,offset];
}
function riverSurface(f,off,x,z,t){
 const a=TAU*(f-t*riverRate);
 return .53+.038*Math.sin(a*43+off*.54)+.024*Math.sin(a*83-off*.89)+.021*Math.sin(x*.19+z*.48-t*.83);
}
function riverFlowAttribute(x,z,type){
 if(type!==2)return [1,0,0];const [f,off]=riverCoordinates(x,z);
 return [Math.cos(TAU*f),Math.sin(TAU*f),off];
}
const groundRef={left:-202,right:201,back:-135,front:205,step:.5};
const waterVerts=[],waterIndices=[],waterData=[],riverFlow=[];
function waterY(type){return type>=5?.62:.53}
function addWaterCell(x1,z1,x2,z2,type,level=waterY(type),dep=.6){
 const i=waterVerts.length/3;for(let [x,z] of [[x1,z1],[x1,z2],[x2,z2],[x2,z1]]){waterVerts.push(x,typeof level==='function'?level(x,z):level,z);riverFlow.push(...riverFlowAttribute(x,z,type));waterData.push(type,type===1?smooth(0,59,29-z-x*x*.00365):dep)}waterIndices.push(i,i+1,i+2,i,i+2,i+3)
}
const turf=[0x9dc880,0x9fca82,0x9bc67e,0x9ec881], paving=[0xf2e8c9,0xeee4c5,0xf0e5c7,0xf5eacd],beach=[0xf4dfae,0xf5dfb0,0xf5e0b1,0xf3dead],stone=[0xbaa990,0xc4b599,0xd4c4a5,0xcab89b], cliff=[0xb9ab93,0xc8baa0,0xd4c5a8,0xb5a997];
function terrainBuild(){
 const G=groundRef,s=G.step,n=Math.round((G.right-G.left)/s),m=Math.round((G.front-G.back)/s),tot=n*m;
 const bedrock=terrainClearances(G,n,m);
 const hs=new Int16Array(tot),cs=new Uint32Array(tot),wet=new Uint8Array(tot),used=new Uint8Array(tot);
 for(let j=0;j<m;j++){const z=G.back+(j+.5)*s;
 for(let i=0;i<n;i++){const x=G.left+(i+.5)*s,id=j*n+i,cd=coastDist(x,z);
 if(cd>16.5){hs[id]=-30;continue}
 const rd=riverDist(x,z),ty=waterKind(x,z,rd);wet[id]=ty;
 const patch=hash2(Math.floor(x/3.5),Math.floor(z/3.5)),p=Math.floor(patch*4)%4;
 let y=baseLevel(x,z),col=turf[p];
 if(z< -46&&bedrock[id]<y){y=Math.max(.25,bedrock[id]);col=stone[p]}
 if(cd>-5){y=snap(.75-Math.max(0,cd+4)*.211,.25);col=beach[p]}
 else if(cd>-10)col=beach[p];
 if(z< -42&&y>2){col=(hash2(Math.floor(x/3),Math.floor(z/2))<.15?stone:turf)[p]}
 const plaza=z>=55&&z<=109&&Math.abs(x)<58;
 if(Math.abs(rd)<10||plaza||(z>=57&&z<102&&x>52&&x<149)||(z>=55&&z<102&&x< -57&&x> -141)||(z> -37&&z<31&&x>69&&x<131)||(x<-64&&x>-126&&z>-33&&z<30)){col=paving[p]}
 if(z>=-34&&z<43&&waveDist(x,z)<12&&!ty){col=beach[p];if(z<19&&Math.abs(x)>32&&waveDist(x,z)>2.5&&waveDist(x,z)<8.5)col=[0xd9bb90,0xe0c296,0xddbf94,0xe2c698][Math.floor(z*2)&3]}
 if(z>106&&Math.abs(x)<14.5){col=Math.abs(x)<9.25?0xacbfbd:0xe9dfc2;y=.75}
 if(z>108&&Math.abs(x)<9.25&&(Math.abs(x)>8.75||Math.abs(x)<.34&&Math.floor(z/3)%2===0))col=C.cream;
 if(z< -46&&z>-57&&Math.abs(x)<148)col=paving[p];
 if(Math.abs(rd)<5.8){y=.90;col=C.white}
 if(ty){y=ty===1?.50-3.75*smooth(0,59,29-z-x*x*.00365):ty===2?-1.25:ty===3?-.25:-.75;col=ty===1?(y>.13?0xe7d9ac:y>-.55?0xb4dfc9:0x72cecd):0x9ce1d7}
 if(plaza&&!ty&&y>1){const rr=Math.hypot(x,z-77);if(Math.abs(rr-12.75)<.55||Math.abs(rr-14.25)<.25)col=0x92c9c4;if(z>89&&z<100&&Math.abs(x)<20&&Math.abs((z+1.35*Math.cos(x*.34))%4-2)<.3)col=0xb1d7cd}
 hs[id]=Math.round(y*4);cs[id]=col;
 }}
 const f=new Faces(),topTypes=[],pavers=new Set([...paving,C.cream,C.white,0x92c9c4,0xb1d7cd,0xe9dfc2]),sands=new Set([...beach,0xe7d9ac]),grass=new Set(turf);
 for(let j=0;j<m;j++){const z=G.back+j*s;for(let i=0;i<n;){const id=j*n+i,ty=wet[id];if(!ty){i++;continue}let w=1;while(i+w<n&&wet[id+w]===ty&&w<6)w++;addWaterCell(G.left+i*s,z,G.left+(i+w)*s,z+s,ty);i+=w}}
 for(let j=0;j<m;j++)for(let i=0;i<n;i++){const id=j*n+i,c=cs[id];if(!c||used[id])continue;const H=hs[id];let w=1,h=1;
 while(i+w<n&&cs[id+w]===c&&hs[id+w]===H&&!used[id+w])w++;
 rows:while(j+h<m){for(let k=0;k<w;k++){const a=id+h*n+k;if(cs[a]!==c||hs[a]!==H||used[a])break rows}h++}
 for(let l=0;l<h;l++)used.fill(1,id+l*n,id+l*n+w);
 const kind=sands.has(c)?2:grass.has(c)?3:wet[id]?4:pavers.has(c)?1:0;topTypes.push(kind,kind,kind,kind);
 const x=G.left+i*s,z=G.back+j*s,y=H*.25,X=x+w*s,Z=z+h*s;f.quad([x,y,z],[x,y,Z],[X,y,Z],[X,y,z],[0,1,0],c);
 }
 // Exposed cliff and retaining-wall faces; horizontal strata follow the terraces.
 for(let j=0;j<m;j++)for(let i=0;i<n;i++){const id=j*n+i;if(!cs[id])continue;const x=G.left+i*s,z=G.back+j*s,y=hs[id]*.25,sideCol= y>2?cliff[(Math.floor(x/2)+Math.floor(z/2)+4000)%4]:wet[id]?0x83c9c8:0xd4c6a6;
 for(let dir=0;dir<4;dir++){const nb=dir===0?id-1:dir===1?id+1:dir===2?id-n:id+n,Y=(nb<0||nb>=tot?-30:hs[nb])*.25;if(Y>=y)continue;
 if(dir===0)f.quad([x,Y,z],[x,Y,z+s],[x,y,z+s],[x,y,z],[-1,0,0],sideCol);
 if(dir===1)f.quad([x+s,Y,z+s],[x+s,Y,z],[x+s,y,z],[x+s,y,z+s],[1,0,0],sideCol);
 if(dir===2)f.quad([x+s,Y,z],[x,Y,z],[x,y,z],[x+s,y,z],[0,0,-1],sideCol);
 if(dir===3)f.quad([x,Y,z+s],[x+s,Y,z+s],[x+s,y,z+s],[x,y,z+s],[0,0,1],sideCol);
 }}
 const ground=f.mesh('solid'),oldHook=ground.material.onBeforeCompile;
 const types=new Uint8Array(ground.geometry.getAttribute('position').count);types.set(topTypes);
 ground.geometry.setAttribute('terrainType',new T.Uint8BufferAttribute(types,1));
 ground.material.onBeforeCompile=shader=>{oldHook(shader);
 shader.vertexShader='attribute float terrainType;varying float groundKind;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngroundKind=terrainType;');
 shader.fragmentShader='varying float groundKind;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
 vec2 gp=vParkPos.xz;float upward=abs(dFdx(vParkPos.y))+abs(dFdy(vParkPos.y))<.025?1.:0.;
 float turfMask=1.-step(.1,abs(groundKind-3.));float scaleTex=1.-smoothstep(.24,.92,length(fwidth(gp)));
 float leafNoise=fract(sin(dot(floor(gp*2.),vec2(16.19,43.71)))*2193.43);
 float lawn=sin(gp.x*.126+gp.y*.17)*.5+.5*sin(gp.y*.241-gp.x*.055);
 diffuseColor.rgb*=1.+turfMask*(lawn*.045+(leafNoise-.5)*scaleTex*.089);
 float pathMask=upward*(1.-step(.1,min(abs(groundKind-1.),abs(groundKind-4.))));
 float beachMask=1.-step(.1,abs(groundKind-2.));
 float speck=fract(sin(dot(mod(floor(gp*8.),512.),vec2(39.31,17.17)))*1531.85);
 float grainFilter=1.-smoothstep(.035,.23,length(fwidth(gp)));
 float dune=sin(gp.y*2.9+.67*sin(gp.x*.47)+.40*cos(gp.x*.86));
 diffuseColor.rgb*=1.+beachMask*((speck-.5)*.080*grainFilter+.013*dune*scaleTex);
 vec2 brick=gp/vec2(1.5,.85);brick.x+=.5*mod(floor(brick.y),2.);vec2 bd=abs(fract(brick)-.5);
 float joint=smoothstep(.463,.49,max(bd.x,bd.y))*scaleTex;
 diffuseColor.rgb*=1.-pathMask*joint*.12;`)};ground.material.customProgramCacheKey=()=>'quay-tiles';
 G.hs=hs;G.n=n;G.m=m;
}
terrainBuild();
function terrainY(x,z){const g=groundRef,i=Math.floor((x-g.left)/g.step),j=Math.floor((z-g.back)/g.step);return i>=0&&j>=0&&i<g.n&&j<g.m?g.hs[j*g.n+i]*.25:-3}
// The wave machine, crest particles, floats and shore wash share this travel-time model.
const wavePeriod=40;
const wavePacket=[{start:.82,height:.53},{start:3.38,height:.76},{start:6.01,height:1.02},{start:8.71,height:1.28}];
const waveShore=x=>29-.00365*x*x;
const waveBend=x=>.09*Math.sin(x*.115)+.00004*x*x;
const waveClock=t=>t-wavePeriod*Math.floor(t/wavePeriod);
function waveMachine(t){
 const q=waveClock(t),active=q<wavePacket.at(-1).start+1.16;
 let number=0;
 for(let i=0;i<wavePacket.length;i++)if(q>=wavePacket[i].start)number=i+1;
 return {phase:q,active,number,seconds:active?0:Math.ceil(wavePeriod-q)};
}
function waveTravel(d,length){const u=clamp(d/length,0,1);return d/7.5+1.35*u*u*u}
function waterPhase(x,z,t){return waveClock(t-waveTravel(z+30,waveShore(x)+30)-waveBend(x)+2)-2}
function pulse(age,front,back){const u=clamp(Math.abs(age)/(age<0?front:back),0,1);return .5+.5*Math.cos(PI*u)}
function waveY(x,z,t){
 const progress=clamp((z+30)/(waveShore(x)+30),0,1),shallow=smooth(.50,.91,progress),breaking=smooth(.89,1,progress);
 const phase=waterPhase(x,z,t);
 let h=.53+.10*pulse(phase+.39,.86,.85)*(1-breaking);
 for(const crest of wavePacket){
  const amplitude=mix(crest.height*(1+.19*shallow),.19+.055*crest.height,breaking);
  h+=amplitude*pulse(phase-crest.start,mix(.78,.34,shallow),mix(1.17,.93,shallow));
 }
 const d=z-waveShore(x);
 const ripple=Math.min(.055,.010+.33*smooth(0,59,-d));
 h+=ripple*Math.sin(z*.55-t*1.24+x*.16);
 if(d>-1.4)h=mix(h,.775,smooth(-1.4,-.08,d)*smooth(.08,.72,beachRunup(x,t)));
 return h;
}
function waveDrift(x,z,t){
 const phase=waterPhase(x,z,t);let drift=0;
 for(const crest of wavePacket)drift+=.36*crest.height*smooth(crest.start-.4,crest.start+1.05,phase);
 return drift*(1-smooth(13,29,phase));
}
function beachRunup(x,t){
 const phase=waterPhase(x,waveShore(x),t);let reach=.07;
 for(const crest of wavePacket){
  const a=phase-crest.start,travel=.65+1.70*crest.height;
  reach=Math.max(reach,travel*smooth(-.42,.57,a)*(1-smooth(.64,2.11,a)));
 }
 return reach;
}
function crestPosition(x,t,crest){
 const L=waveShore(x)+30,elapsed=waveClock(t)-waveBend(x)-crest.start;
 let d=elapsed*7.5;
 for(let j=0;j<3;j++){const u=clamp(d/L,0,1),slope=1/7.5+(d>0&&d<L?4.05*u*u/L:0);
  d-=(waveTravel(d,L)-elapsed)/slope;}
 return d-30;
}
const wavePhaseGL=`
 float shoreZ(float x){return 29.-.00365*x*x;}
 float bankDelay(float x){return .09*sin(x*.115)+.00004*x*x;}
 float elapsedWave(vec2 p,float t){float d=p.y+30.,u=clamp(d/(shoreZ(p.x)+30.),0.,1.);
  return mod(t-d/7.5-1.35*u*u*u-bankDelay(p.x)+2.,40.)-2.;}
 float bell(float a,float front,float back){return .5+.5*cos(3.14159265*clamp(abs(a)/(a<0.?front:back),0.,1.));}
 float crestHeight(float a,float h,float sh,float br){
  return mix(h*(1.+.19*sh),.19+.055*h,br)*bell(a,mix(.78,.34,sh),mix(1.17,.93,sh));}
 float swell(vec2 p,float t){
  float u=clamp((p.y+30.)/(shoreZ(p.x)+30.),0.,1.),sh=smoothstep(.50,.91,u),br=smoothstep(.89,1.,u),a=elapsedWave(p,t);
  float h=.10*bell(a+.39,.86,.85)*(1.-br);
 `+wavePacket.map(c=>'h+=crestHeight(a-'+c.start.toFixed(3)+','+c.height.toFixed(3)+',sh,br);').join('\n')+`
  return h;}
 vec2 swashPart(float a,float h,float d){
  float range=(.65+1.70*h)*smoothstep(-.42,.57,a);
  return vec2(range*(1.-smoothstep(.64,2.11,a)),(1.-smoothstep(range-.13,range+.06,d))*smoothstep(-.4,.60,a)*(1.-smoothstep(2.10,7.20,a)));}
 vec2 swash(float x,float d,float t){float a=elapsedWave(vec2(x,shoreZ(x)),t);vec2 wash=vec2(.07,0.);
 `+wavePacket.map(c=>'wash=max(wash,swashPart(a-'+c.start.toFixed(3)+','+c.height.toFixed(3)+',d));').join('\n')+`
  return wash;}
 `;
function waterFinish(){
 const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(waterVerts,3));geom.setAttribute('waterInfo',new T.Float32BufferAttribute(waterData,2));geom.setAttribute('riverFlow',new T.Float32BufferAttribute(riverFlow,3));geom.setIndex(waterIndices);geom.computeVertexNormals();geom.computeBoundingSphere();
 const wm=new T.MeshPhongMaterial({color:0xffffff,transparent:true,opacity:.85,depthWrite:false,shininess:90,specular:0x91d3dc,side:T.DoubleSide});
 wm.onBeforeCompile=sh=>{sh.uniforms.parkTime=clockTime;sh.uniforms.riverAngular={value:TAU*riverRate};
 sh.uniforms.cloudA={value:cloudTex[0]};sh.uniforms.cloudB={value:cloudTex[2]};sh.uniforms.bankA={value:cloudSprites[0].position};sh.uniforms.bankB={value:cloudSprites[2].position};
 sh.vertexShader='uniform float riverAngular;attribute vec3 riverFlow;varying vec3 flow;attribute vec2 waterInfo;varying vec3 wP;varying vec2 wI;uniform float parkTime;\n'+wavePhaseGL+'\n'+sh.vertexShader;
 sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 wI=waterInfo;wP=position;flow=riverFlow;float wig=.055*sin(position.z*.55-parkTime*1.24+position.x*.16);
 if(waterInfo.x>1.5&&waterInfo.x<2.5){float phase=atan(flow.y,flow.x)-parkTime*riverAngular;
  wig=.038*sin(43.*phase+flow.z*.54)+.024*sin(83.*phase-flow.z*.89)+.021*sin(position.x*.19+position.z*.48-parkTime*.83);}
 if(waterInfo.x<1.5){
  float shoreDistance=position.z-shoreZ(position.x);
  float ripple=min(.055,.010+.33*smoothstep(0.,59.,-shoreDistance));
  wig*=ripple/.055;wig+=swell(position.xz,parkTime);
  if(shoreDistance>-1.4){float reach=swash(position.x,shoreDistance,parkTime).x;
   wig=mix(wig,.775-position.y,smoothstep(-1.4,-.08,shoreDistance)*smoothstep(.08,.72,reach));}
 }
 if(abs(waterInfo.x-19.)<.1)wig=.009*sin(length(position.xz-vec2(0.,76.))*4.-parkTime*3.);
 if(waterInfo.x>23.5)wig*=.065;
 transformed.y+=wig;wP.y=transformed.y;`);
 sh.fragmentShader=`uniform float riverAngular;varying vec3 flow;varying vec3 wP;varying vec2 wI;uniform float parkTime;
 uniform sampler2D cloudA,cloudB;uniform vec3 bankA,bankB;
 vec4 reflectedBank(vec3 eyeRay,vec3 centre,vec2 size,sampler2D cloud){
  vec3 axis=normalize(vec3(centre.x-wP.x,0.,centre.z-wP.z));
  float denom=dot(eyeRay,axis);if(denom<.005)return vec4(0.);
  vec3 hit=wP+eyeRay*(dot(centre-wP,axis)/denom)-centre;
  vec2 uv=.5+vec2(dot(hit,vec3(-axis.z,0.,axis.x)),hit.y)/size;
  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)return vec4(0.);
  return texture2D(cloud,uv);
 }
 float causticWeb(vec2 p,float t){
  vec2 id=floor(p),cell=fract(p);float nearDist=9.,second=9.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
   vec2 offset=vec2(float(x),float(y)),k=mod(id+offset,331.);
   vec2 h=fract(sin(vec2(dot(k,vec2(83.1,31.7)),dot(k,vec2(39.3,91.1))))*4517.35);
   vec2 d=offset+.5+.32*sin(6.2831*h+t*vec2(.67,.50))-cell;
   float e=dot(d,d);if(e<nearDist){second=nearDist;nearDist=e;}else second=min(second,e);
  }
  float edge=sqrt(second)-sqrt(nearDist);return exp(-edge*23.);
 }\n`+wavePhaseGL+'\n'+sh.fragmentShader;
 sh.fragmentShader=sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 p=wP.xz;float t=parkTime;float depth=wI.x<1.5?wI.y:((wI.x>2.5&&wI.x<3.5)?.10:.41+.12*sin(p.x*.052));
 vec3 shallow=vec3(.155,.844,.755),deep=vec3(.006,.276,.643);vec3 waterCol=mix(shallow,deep,smoothstep(-.1,1.,depth));if(wI.x>20.)waterCol=mix(vec3(.10,.72,.65),waterCol,.25);
 if(abs(wI.x-19.)<.1)waterCol=mix(vec3(.10,.75,.74),vec3(.08,.58,.75),.5+.5*sin(length(p-vec2(0.,76.))*.65));
 vec2 a=p*1.24;a+=.37*vec2(sin(a.y*1.12+t*.7)+sin(a.x*.6-t*.6),cos(a.x*1.3-t*.74));
 float filterC=1.-smoothstep(.18,1.45,length(fwidth(a)));
 vec2 lens=p*vec2(.73,.83)+.23*vec2(sin(p.y*.9+t*.54),sin(p.x*1.1+t*.71));
 float fil=causticWeb(lens,t);
 waterCol+=vec3(.30,.25,.15)*fil*filterC*(1.-depth*.60);
  vec2 tl=abs(fract((p+.12*sin(a*.6+t))*.8)-.5);float tile=smoothstep(.472,.5,max(tl.x,tl.y));waterCol*=1.-.075*tile*filterC;
 float rip=sin(p.y*3.6+.8*sin(p.x*1.36+t*.9)-t*2.8)+sin(p.y*.82+p.x*1.7+t*.7);if(wI.x>1.5&&wI.x<2.5){
  float phase=atan(flow.y,flow.x)-parkTime*riverAngular;
  rip=sin(249.*phase+.8*sin(37.*phase)+flow.z*.85)+sin(113.*phase-flow.z*1.21);
 }
 float glint=smoothstep(1.83,1.985,rip)*filterC;
 vec3 V=normalize(cameraPosition-wP),surfaceN=normalize(cross(dFdx(wP),dFdy(wP)));
 if(surfaceN.y<0.)surfaceN=-surfaceN;
 surfaceN=normalize(surfaceN+vec3(.035*sin(p.y*1.86+t)+.018*cos(p.x*.91),0.,.035*cos(p.x*1.44-t*.75)));
 vec3 reflected=reflect(-V,surfaceN);
 vec3 skyCol=mix(vec3(.64,.86,.96),vec3(.085,.52,.86),1.-exp(-max(reflected.y,0.)*12.));
 vec4 cloud1=reflectedBank(reflected,bankA,vec2(590.,236.),cloudA),cloud2=reflectedBank(reflected,bankB,vec2(547.,237.),cloudB);
 skyCol=mix(mix(skyCol,cloud1.rgb,cloud1.a),cloud2.rgb,cloud2.a);
 float refl=.045+.78*pow(1.-clamp(dot(V,surfaceN),0.,1.),3.);
 waterCol=mix(waterCol,skyCol,refl)+vec3(.64,.70,.63)*glint;
 diffuseColor.a=clamp(.64+depth*.22+refl*.19,.60,.94);
 if(wI.x>23.5){
 float d=p.y-shoreZ(p.x);vec2 wash=swash(p.x,d,t);
 if(d>wash.x){if(wash.y<.008)discard;waterCol=mix(vec3(.29,.36,.32),skyCol,.24*refl);diffuseColor.a=.25*wash.y;}
 else{float edge=smoothstep(wash.x-.30,wash.x,d);waterCol=mix(vec3(.085,.72,.68),vec3(.92,1.,.97),edge*(.60+.37*fil));
 diffuseColor.a=.26+.23*smoothstep(.10,.8,wash.x)+.33*edge;}
 }
 diffuseColor.rgb=waterCol*.83;`);
 sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 normal=normalize(mat3(viewMatrix)*surfaceN);`);
 };
 const mesh=new T.Mesh(geom,wm);mesh.receiveShadow=true;mesh.renderOrder=3;scene.add(mesh);
 waterVerts.length=waterIndices.length=waterData.length=riverFlow.length=0;
}
function offshoreIsland(cx,cz,rx,rz,height,shade){
 const st=2,n=Math.ceil(rx*2/st)+2,m=Math.ceil(rz*2/st)+2,grid=new Float32Array(n*m),f=new Faces();
 function relief(x,z){
 const q=1-((x+.9*Math.sin(z*.16))/rx)**2-((z+1.45*Math.sin(x*.096))/rz)**2;if(q<=0)return -3.5;
 return snap(-2.7+q**.64*height*(.62+.22*Math.sin(x*.049+z*.031)+.09*Math.cos(z*.115-x*.086)+.045*Math.sin(x*.135+z*.095)),.50)
 }
 for(let j=0;j<m;j++)for(let i=0;i<n;i++)grid[j*n+i]=relief(i*st-rx,j*st-rz);
 for(let j=1;j<m-1;j++)for(let i=1;i<n-1;i++){
 const id=j*n+i,y=grid[id];if(y< -2.75)continue;const x=cx+i*st-rx,z=cz+j*st-rz,X=x+st,Z=z+st;
 const nx=(grid[id-1]-grid[id+1])/(st*2),nz=(grid[id-n]-grid[id+n])/(st*2),l=Math.hypot(nx,1,nz),nor=[nx/l,1/l,nz/l];
 const v=.985+.025*Math.sin(x*.12+z*.091)+.017*Math.cos(x*.196-z*.145);
 const c=tinted(y<.35?0xe0d7b8:y<height*.11?0x98baa4:shade,v);
 f.quad([x,y,z],[x,y,Z],[X,y,Z],[X,y,z],nor,c);
 for(let d=0;d<4;d++){let Y=grid[id+[-1,1,-n,n][d]];if(Y>=y)continue;const co=y<.4?0xd5cfb5:tinted(c,.981);
 if(d===0)f.quad([x,Y,z],[x,Y,Z],[x,y,Z],[x,y,z],nor,co);
 if(d===1)f.quad([X,Y,Z],[X,Y,z],[X,y,z],[X,y,Z],nor,co);
 if(d===2)f.quad([X,Y,z],[x,Y,z],[x,y,z],[X,y,z],nor,co);
 if(d===3)f.quad([x,Y,Z],[X,Y,Z],[X,y,Z],[x,y,Z],nor,co)}
 }
 f.mesh('far');
 // Broken canopy along the ridgelines, with wind-shaped clumps above the coves.
 const count=Math.round(rx*rz*.13);
 for(let k=0;k<count;k++){const x=rnd(-rx,rx),z=rnd(-rz,rz),y=relief(x,z);if(y<1.7)continue;
 const r=rnd(1.05,2.85),c=tinted(shade,rnd(.86,.99)),X=cx+x,Z=cz+z;box(X,y+.40,Z,r*1.85,r*1.15,r*1.7,c,'far');box(X+.25,y+r*.71,Z,r*1.23,r*.5,r*1.2,tinted(c,1.045),'far');
 if(k%5===0)box(X-r*.75,y+.65,Z+r*.4,r*1.13,r*.91,r*.92,tinted(c,1.02),'far');
 }

}
offshoreIsland(-325,-228,124,49,25,0x74af9d);offshoreIsland(-479,-178,129,43,41,0x81adb0);offshoreIsland(-250,-385,160,42,43,0x9dc4c5);offshoreIsland(-5,-676,178,43,23,0xa6c7c3);offshoreIsland(302,-398,173,44,14,0x97bcac);offshoreIsland(224,-182,25,10,6,0x9dcda3);offshoreIsland(-200,5,22,12,10,0x99c197);
for(let i=0;i<44;i++){
 const x=118+i*6.8+rnd(-3,3),z=rnd(-407,-381),h=rnd(10,34)*(i>17&&i<30?1.51:1),w=rnd(4,9),d=rnd(5,12),base=2.25;
 slab(x,z,w,d,base,base+h,choice([0xc4dbe3,0xd2e3e5,0xbdd6e4,0xe0e7e4]),'far');slab(x,z,w*.68,d*.70,base+h,base+h+2.6,0xc9dce1,'far');
 if(i%3===0)column(x,z,h+base,h+base+5,.5,0xc3d9dc,'far');
 for(let yy=base+2;yy<h+base-1;yy+=2.75)box(x,yy,z+d/2+.13,w*.83,.7,.25,0x98c1d1,'far');
 if(i%4===0)box(x-w*.28,base+h*.51,z+d/2+.25,.75,h*.9,.5,0xe3edec,'far');
}
// The city stands on a terraced waterfront, with lower buildings along the promenade.
slab(267,-380,320,16,-3,2.0,0xc6d4ce,'far');slab(267,-372.8,321,1.75,1.4,2.7,0xd9e2d9,'far');
for(let i=0;i<38;i++){const x=114+i*8.25+rnd(-1.3,1.3),z=-377+rnd(-1.2,1.2),w=rnd(4.3,7.8),d=rnd(3.5,5.6),h=rnd(3.5,11.3);
 slab(x,z,w,d,2,2+h,choice([0xc8dde0,0xc1d4df,0xdae2df]),'far');box(x,h+2.15,z,w+.4,.44,d+.5,0xadc9d0,'far');
 for(let j=0;j<3;j++)box(x-w*.28+j*w*.27,h*.51+2,z+d/2+.125,.62,h*.74,.25,0x98bdcd,'far');}
function boat(name,large=false){
 template(name,()=>{
 const l=large?45:8,w=large?10.5:3.25;
 for(let j=0;j<l*2;j++){const x=-l/2+(j+.5)*.5,b=w*(.25+.75*Math.pow(Math.max(0,Math.sin((j+.5)/(l*2)*PI)),.4));box(x,.2,0,.5,large?2.6:.75,b,large?C.ink:C.teak);box(x,large?1.8:.7,0,.5,large?1.4:.38,b*1.04,C.white)}
 if(large){for(let j=0;j<4;j++){let L=l-6-j*4,D=w-1-j*.65,Y=3+j*1.6;box(-1.5,Y,0,L,1.75,D,C.white);for(let s of [-1,1]){box(-1.5,Y+.2,s*(D/2+.125),L-2,.65,.25,0x43869f);for(let j=-L/2+.5;j<L/2-2;j+=2)box(j,Y,s*D/2,.25,1,.5,C.white)}box(-1.5,Y+.9,0,L+1,.3,D+.45,C.cream)}
 for(let x of [-7,-2]){box(x,10,0,2,3,2.5,C.coral);box(x,11.5,0,2.25,.75,2.75,C.navy)}for(let x=-12;x<13;x+=3)for(let s of [-1,1])box(x,3.3,s*4.8,1.9,.7,1,C.orange);
 }else{column(0,0,.6,10.75,.25,C.cream);for(let j=0;j<20;j++){let len=4.25*(1-j/21);box(-len*.5-.25,1.95+j*.425,0,len,.5,.125,j===5||j===6?C.sky:C.snow,'solid',.125);if(j<16){const l2=(16-j)*.17;box(l2*.6+.35,1.6+j*.43,0,l2,.5,.125,j===3||j===4?C.butter:C.cream,'solid',.125)}}}
 });
}
boat('sailer');boat('cruise',true);
for(const [i,x,z,s] of [[0,-223,-89,1.28],[1,179,-76,.95],[2,212,19,1.15],[3,-129,-182,1.13],[4,73,-164,1.45],[5,268,-247,1.35],[6,-34,-259,1.3]])actor('sailer',(t,o)=>{o.position.set(x+Math.sin(i+t*.009)*4,-2+Math.sin(t*.83+i)*.15,z+t*.016);o.scale.setScalar(s);o.rotation.set(.018*Math.sin(t+i),-.23+i*.55,.018*Math.cos(t*.73+i))});
actor('cruise',(t,o)=>{o.position.set(212+t*.071,-2.2,-170);o.rotation.y=-.22;o.scale.setScalar(1.05)});
