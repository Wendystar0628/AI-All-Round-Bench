(() => {
'use strict';
const canvas = document.getElementById('view');
const gl = canvas.getContext('webgl2', {antialias:true, alpha:false, powerPreference:'high-performance'});
if (!gl) { document.getElementById('fallback').style.display='grid'; return; }
const hdrEnabled=!!gl.getExtension('EXT_color_buffer_float');
const TAU=Math.PI*2, DURATION=80;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const fract=x=>x-Math.floor(x);
const hash=(x,y=0,z=0)=>fract(Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453123);
const V=(x=0,y=0,z=0)=>[x,y,z];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return mul(a,1/l)};
const lerp3=(a,b,t)=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];
const M4=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mmul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}
function trans(x,y,z){const m=M4();m[12]=x;m[13]=y;m[14]=z;return m}
function scaleM(x,y,z){const m=M4();m[0]=x;m[5]=y;m[10]=z;return m}
function rotX(a){const c=Math.cos(a),s=Math.sin(a),m=M4();m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m}
function rotY(a){const c=Math.cos(a),s=Math.sin(a),m=M4();m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m}
function rotZ(a){const c=Math.cos(a),s=Math.sin(a),m=M4();m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m}
function modelAt(p,ry=0,rx=0,rz=0){return mmul(trans(...p),mmul(rotY(ry),mmul(rotX(rx),rotZ(rz))))}
function xform(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),m=new Float32Array(16);m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);return m}
function lookAt(eye,target,up=[0,1,0]){const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x),m=M4();m[0]=x[0];m[1]=y[0];m[2]=z[0];m[4]=x[1];m[5]=y[1];m[6]=z[1];m[8]=x[2];m[9]=y[2];m[10]=z[2];m[12]=-dot(x,eye);m[13]=-dot(y,eye);m[14]=-dot(z,eye);return m}
function keyframe(keys,t){if(t<=keys[0][0])return {p:keys[0][1].slice(),q:keys[0][2].slice(),fov:keys[0][3]};for(let i=0;i<keys.length-1;i++){const a=keys[i],b=keys[i+1];if(t<=b[0]){let u=smooth(a[0],b[0],t);return {p:lerp3(a[1],b[1],u),q:lerp3(a[2],b[2],u),fov:mix(a[3],b[3],u)}}}const k=keys[keys.length-1];return {p:k[1].slice(),q:k[2].slice(),fov:k[3]}}

function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)+'\n'+src);return s}
function program(vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));p.u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const info=gl.getActiveUniform(p,i);p.u[info.name.replace('[0]','')]=gl.getUniformLocation(p,info.name)}return p}
const voxelVS=`#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aOffset;layout(location=3) in vec3 aColor;layout(location=4) in vec2 aParam;
uniform mat4 uModel,uVP;uniform vec3 uEye;
out vec3 vWorld,vNormal,vColor;out vec2 vParam;
void main(){vec3 u=abs(aNormal.y)>.5?vec3(1,0,0):abs(aNormal.x)>.5?vec3(0,0,1):vec3(1,0,0);vec3 v=abs(aNormal.y)>.5?vec3(0,0,1):vec3(0,1,0);vec3 local=aOffset+aNormal*.47+(u*aQuad.x+v*aQuad.y)*.94;vec4 w=uModel*vec4(local,1.);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);vColor=aColor;vParam=aParam;gl_Position=uVP*w;}`;
const voxelFS=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal,vColor;in vec2 vParam;out vec4 outColor;
uniform vec3 uEye,uHotPos,uHotColor;uniform float uTime,uEmission,uInterior,uHotRadius;
void main(){
 vec3 N=normalize(vNormal),V=normalize(uEye-vWorld);vec3 L=normalize(vec3(-.58,.76,.32));
 float ndl=max(dot(N,L),0.);float hemi=N.y*.5+.5;
 vec3 ambient=mix(vec3(.025,.04,.085),vec3(.10,.16,.23),hemi);
 if(uInterior>.5)ambient=mix(vec3(.018,.028,.05),vec3(.065,.10,.15),hemi);
 vec3 base=vColor*(ambient+vec3(.70,.82,1.)*ndl*.68);
 vec3 H=normalize(L+V);float spec=pow(max(dot(N,H),0.),mix(22.,80.,vParam.y));
 base+=vec3(.55,.82,1.)*spec*(.08+.35*vParam.y);
 float rim=pow(1.-max(dot(N,V),0.),3.);base+=vColor*rim*.12;
 float hd=length(vWorld-uHotPos);float hot=exp(-hd/max(uHotRadius,1.))*1.35*(.18+vParam.y);
 base+=vColor*uHotColor*hot;
 float pulse=1.;if(vParam.x>1.5)pulse=.82+.18*sin(uTime*2.2+vWorld.y*.045+vWorld.z*.018);
 vec3 emission=vColor*vParam.x*uEmission*pulse*.48;
 float dist=length(uEye-vWorld);float fog=1.-exp(-dist*(uInterior>.5?.00045:.000105));
 vec3 fogColor=uInterior>.5?vec3(.008,.018,.028):vec3(.009,.019,.038);
 outColor=vec4(mix(base+emission,fogColor,clamp(fog,0.,.84)),1.);
}`;
const voxelPr=program(voxelVS,voxelFS);

const skyVS=`#version 300 es
precision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const skyFS=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform mat4 uInvVP;uniform vec3 uEye;uniform float uTime;
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+7.1;a*=.5;}return v;}
void main(){vec4 a=uInvVP*vec4(vUV*2.-1.,1.,1.);vec3 d=normalize(a.xyz/a.w-uEye);vec3 col=vec3(.0025,.005,.014);
 float n=fbm(d*3.4+vec3(1.2,4.,2.));float wis=fbm(d*8.+n*2.);float band=pow(max(0.,1.-abs(d.y*.9+d.x*.25+.06)*1.8),3.);
 col+=band*(vec3(.018,.06,.11)*n+vec3(.065,.018,.105)*pow(wis,2.))*1.6;float lane=smoothstep(.46,.72,fbm(d*12.+vec3(8,1,3)));col*=1.-band*lane*.38;
 vec3 cell=floor(d*780.);float h=hash31(cell);float star=smoothstep(.9987,1.,h);float tw=.78+.22*sin(uTime*.54902214+h*40.);col+=star*tw*mix(vec3(.35,.6,1.),vec3(1.,.78,.48),hash31(cell+4.))*2.1;
 vec3 cell2=floor(d*310.);float h2=hash31(cell2+9.);col+=smoothstep(.996,1.,h2)*vec3(.25,.38,.7)*.55;
 vec3 pd=normalize(vec3(-.72,.20,-.62));float pr=.255,pdot=dot(d,pd);if(pdot>sqrt(1.-pr*pr)){vec3 off=d-pd*pdot,q=off/max(length(off),.0001);float r=acos(clamp(pdot,-1.,1.))/pr,rr=min(r,1.);vec3 pn=normalize(pd*sqrt(max(0.,1.-rr*rr))+q*rr);float light=smoothstep(-.3,.72,dot(pn,normalize(vec3(-.8,.35,.2))));float tex=fbm(d*38.),cloud=smoothstep(.55,.77,fbm(d*72.));vec3 planet=mix(vec3(.003,.008,.024),vec3(.05,.16,.21),light)*(.55+.7*tex);planet+=cloud*light*vec3(.025,.05,.055);float mask=1.-smoothstep(.975,1.,r),rim=pow(clamp(r,0.,1.),20.)*mask;col=mix(col,planet,mask);col+=vec3(.07,.34,.46)*rim*(.18+.55*light);}
 outColor=vec4(col,1.);}`;
const skyPr=program(skyVS,skyFS);

const pointVS=`#version 300 es
precision highp float;layout(location=0)in vec3 aPos;layout(location=1)in float aSize;layout(location=2)in vec4 aColor;
uniform mat4 uVP;uniform vec3 uEye;uniform float uHeight;out vec4 vColor;
void main(){vec4 p=uVP*vec4(aPos,1.);gl_Position=p;gl_PointSize=clamp(aSize*uHeight/max(1.,length(uEye-aPos)),1.,240.);vColor=aColor;}`;
const pointFS=`#version 300 es
precision highp float;in vec4 vColor;out vec4 outColor;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;float a=exp(-r*4.)*(1.-r);outColor=vec4(vColor.rgb*vColor.a*a,vColor.a*a);}`;
const pointPr=program(pointVS,pointFS);
const ribbonVS=`#version 300 es
precision highp float;layout(location=0)in vec3 aPos;layout(location=1)in vec2 aUV;layout(location=2)in vec4 aColor;uniform mat4 uVP;out vec2 vUV;out vec4 vColor;void main(){vUV=aUV;vColor=aColor;gl_Position=uVP*vec4(aPos,1.);}`;
const ribbonFS=`#version 300 es
precision highp float;in vec2 vUV;in vec4 vColor;out vec4 outColor;void main(){float a=pow(max(0.,1.-abs(vUV.y)),1.7)*sin(clamp(vUV.x,0.,1.)*3.14159);outColor=vec4(vColor.rgb*vColor.a*a,vColor.a*a);}`;
const ribbonPr=program(ribbonVS,ribbonFS);

const shieldVS=`#version 300 es
precision highp float;layout(location=0)in vec3 aPos;uniform mat4 uVP;uniform vec3 uCenter,uScale;out vec3 vWorld,vLocal;void main(){vLocal=aPos;vWorld=uCenter+aPos*uScale;gl_Position=uVP*vec4(vWorld,1.);}`;
const shieldFS=`#version 300 es
precision highp float;in vec3 vWorld,vLocal;out vec4 outColor;uniform vec3 uEye;uniform float uTime,uAlpha,uSeed,uOpen;
void main(){vec3 N=normalize(vLocal),V=normalize(uEye-vWorld);float fres=pow(1.-abs(dot(N,V)),2.6);float flow=pow(max(0.,sin(vLocal.y*34.+vLocal.x*11.-uTime*2.51327412+uSeed)),18.);float lon=pow(max(0.,sin(atan(vLocal.z,vLocal.x)*18.+uTime*.31415926)),42.);float lat=pow(max(0.,sin(asin(clamp(vLocal.y,-1.,1.))*30.-uTime*.62831853)),48.);float wave=exp(-abs(vLocal.z-(uOpen*2.-1.))*24.)*sin(clamp(uOpen,0.,1.)*3.14159);float a=uAlpha*(.018+fres*.33+flow*.08+lon*lat*.2+wave*.3);vec3 c=mix(vec3(.08,.55,.85),vec3(.45,1.,1.),clamp(fres+flow*.3+wave*.5,0.,1.));outColor=vec4(c*a,a);}`;
const shieldPr=program(shieldVS,shieldFS);

const postVS=skyVS;
const brightFS=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform sampler2D uTex;void main(){vec3 c=texture(uTex,vUV).rgb;float l=max(c.r,max(c.g,c.b));outColor=vec4(c*max(0.,l-.85)/max(l,.001),1.);}`;
const blurFS=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform sampler2D uTex;uniform vec2 uDir;void main(){vec3 c=texture(uTex,vUV).rgb*.227027;c+=texture(uTex,vUV+uDir*1.384615).rgb*.316216;c+=texture(uTex,vUV-uDir*1.384615).rgb*.316216;c+=texture(uTex,vUV+uDir*3.230769).rgb*.070270;c+=texture(uTex,vUV-uDir*3.230769).rgb*.070270;outColor=vec4(c,1.);}`;
const finalFS=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform sampler2D uTex,uBloom;uniform vec2 uPixel;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 fxaa(vec2 uv){vec3 lum=vec3(.299,.587,.114);vec3 nw=texture(uTex,uv+vec2(-1.,-1.)*uPixel).rgb,ne=texture(uTex,uv+vec2(1.,-1.)*uPixel).rgb,sw=texture(uTex,uv+vec2(-1.,1.)*uPixel).rgb,se=texture(uTex,uv+vec2(1.,1.)*uPixel).rgb,m=texture(uTex,uv).rgb;float lnw=dot(nw,lum),lne=dot(ne,lum),lsw=dot(sw,lum),lse=dot(se,lum),lm=dot(m,lum),lo=min(lm,min(min(lnw,lne),min(lsw,lse))),hi=max(lm,max(max(lnw,lne),max(lsw,lse)));vec2 dir=vec2(-((lnw+lne)-(lsw+lse)),(lnw+lsw)-(lne+lse));float reduce=max((lnw+lne+lsw+lse)*.03125,.0078125),r=1./(min(abs(dir.x),abs(dir.y))+reduce);dir=clamp(dir*r,vec2(-6.),vec2(6.))*uPixel;vec3 a=.5*(texture(uTex,uv-dir/6.).rgb+texture(uTex,uv+dir/6.).rgb),b=a*.5+.25*(texture(uTex,uv-dir*.5).rgb+texture(uTex,uv+dir*.5).rgb);float lb=dot(b,lum);return lb<lo||lb>hi?a:b;}
void main(){vec3 c=fxaa(vUV),b=texture(uBloom,vUV).rgb;c+=b*.72;c=aces(c*1.12);c=pow(c,vec3(1./2.2));float vig=1.-.28*pow(length(vUV-.5)*1.25,2.);c*=vig;c+=vec3(.002,.004,.009);outColor=vec4(c,1.);}`;
const brightPr=program(postVS,brightFS),blurPr=program(postVS,blurFS),finalPr=program(postVS,finalFS);

const cubeVerts=[],cubeNormals=[];
const faces=[[[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],[[-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]],[[0,1,0],[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]],[[0,0,1],[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]],[[0,0,-1],[[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]]];
const quadVBO=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quadVBO);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,.5,.5,-.5,-.5,.5,.5,-.5,.5]),gl.STATIC_DRAW);

const C={hull:[.28,.42,.50],light:[.50,.65,.69],dark:[.035,.065,.10],deep:[.012,.024,.043],edge:[.15,.27,.34],cyan:[.06,.85,1.],white:[.65,1.,1.],amber:[1.,.42,.09],rock:[.10,.11,.14],rockLight:[.25,.26,.28]};
class Vox{
 constructor(){this.data=[]}
 v(x,y,z,c=C.hull,e=0,m=.35){this.data.push(x,y,z,c[0],c[1],c[2],e,m)}
 box(x,y,z,sx,sy,sz,c=C.hull,e=0,m=.35,solid=false){for(let a=0;a<sx;a++)for(let b=0;b<sy;b++)for(let d=0;d<sz;d++)if(solid||a===0||b===0||d===0||a===sx-1||b===sy-1||d===sz-1){let col=c;const h=hash(x+a,y+b,z+d);if(e===0&&h>.82)col=c.map(v=>v*.84);this.v(x+a-(sx-1)/2,y+b-(sy-1)/2,z+d-(sz-1)/2,col,e,m)}}
 line(a,b,c=C.edge,e=0,thick=1){const d=sub(b,a),steps=Math.ceil(Math.max(...d.map(Math.abs)));for(let i=0;i<=steps;i++){const p=lerp3(a,b,i/Math.max(1,steps));for(let x=0;x<thick;x++)for(let y=0;y<thick;y++)this.v(Math.round(p[0])+x,Math.round(p[1])+y,Math.round(p[2]),c,e,.55)}}
 ringZ(cx,cy,z,r,thick,depth,c=C.edge,e=0){for(let zz=0;zz<depth;zz++)for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++){const ax=Math.abs(x),ay=Math.abs(y),q=Math.max(ax,ay)+(Math.min(ax,ay)*.42);if(q<=r&&q>=r-thick)this.v(cx+x,cy+y,z+zz,c,e,.55)}}
 ringY(cx,cy,cz,r,thick,height,c=C.edge,e=0){for(let yy=0;yy<height;yy++)for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++){const ax=Math.abs(x),az=Math.abs(z),q=Math.max(ax,az)+(Math.min(ax,az)*.42);if(q<=r&&q>=r-thick)this.v(cx+x,cy+yy,cz+z,c,e,.55)}}
 upload(){const mesh=buildVoxelMesh(this.data),p={count:mesh.length/11,vao:gl.createVertexArray(),ibo:gl.createBuffer()};gl.bindVertexArray(p.vao);gl.bindBuffer(gl.ARRAY_BUFFER,quadVBO);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,p.ibo);gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.STATIC_DRAW);for(let i=0;i<4;i++){const loc=i===0?2:i===1?1:i===2?3:4,size=i===3?2:3;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,44,i*12);gl.vertexAttribDivisor(loc,1)}gl.bindVertexArray(null);return p}
}
function voxelKey(x,y,z){return((Math.round(x*2)+4096)*8192+Math.round(y*2)+4096)*8192+Math.round(z*2)+4096}
function buildVoxelMesh(data){const cells=new Map();for(let i=0;i<data.length;i+=8)cells.set(voxelKey(data[i],data[i+1],data[i+2]),i);const out=[];for(const i of cells.values()){const x=data[i],y=data[i+1],z=data[i+2];for(let f=0;f<6;f++){const n=faces[f][0];if(cells.has(voxelKey(x+n[0],y+n[1],z+n[2])))continue;out.push(x,y,z,...n,data[i+3],data[i+4],data[i+5],data[i+6],data[i+7])}}return new Float32Array(out)}
function makeVox(fn){const v=new Vox();fn(v);return v.upload()}

function turret(v,x,y,z,s=1){v.box(x,y,z,14*s,6*s,18*s,C.dark);v.box(x,y+5*s,z-2*s,10*s,6*s,12*s,C.hull);v.box(x,y+6*s,z-10*s,4*s,4*s,20*s,C.edge);v.box(x,y+6*s,z-21*s,5*s,5*s,3*s,C.cyan,1.8);v.v(x+5*s,y+3*s,z+3*s,C.amber,1.2)}
function nozzle(v,x,y,z,r){v.ringZ(x,y,z,r,3,7,C.dark);v.ringZ(x,y,z+6,r-2,2,3,C.light);v.ringZ(x,y,z+7,r-5,2,2,C.cyan,2.2);v.box(x,y,z+5,(r-6)*2,(r-6)*2,2,C.deep);}
const flagship=makeVox(v=>{
 // A continuous armored keel and a deep, illuminated axial cleft.
 v.box(0,-8,20,52,34,770,C.dark);
 v.box(0,9,10,44,18,735,C.hull);
 for(let z=-340;z<=350;z+=70){v.box(0,20,z,28,8,54,C.light);v.box(0,24,z,8,3,38,C.cyan,1.35)}
 // Twin stepped bow blades, 1080 voxels from fork tip to engine wall.
 for(const s of [-1,1]){
  for(let i=0;i<9;i++){const z=-510+i*31,w=12+i*2,x=s*(18+i*4);v.box(x,0,z,w,20+i,42,C.hull);v.box(x+s*(w/2-2),5,z,3,9,34,C.light);v.box(x,11+i/2,z,Math.max(5,w-5),2,25,C.dark)}
  v.box(s*48,1,-280,28,30,180,C.hull);v.box(s*57,-6,-280,9,12,174,C.dark);
  v.box(s*42,18,-315,9,5,145,C.light);v.box(s*42,21,-342,4,2,72,C.cyan,1.4);
 }
 // Layered side shells: broad quiet plates separated by open ribbed trenches.
 for(const s of [-1,1])for(let i=0;i<8;i++){
  const z=-230+i*78,outer=112+Math.sin((i/7)*Math.PI)*36,w=58+(i%3)*7;
  v.box(s*outer,0,z,w,24,67,C.hull);v.box(s*(outer+5),16,z-3,w-9,8,59,C.light);
  v.box(s*(outer-3),-17,z+4,w-15,8,54,C.dark);
  v.box(s*(outer+24),3,z-19,5,16,28,C.edge);
  v.box(s*(outer+26),9,z-26,2,3,18,i%3===0?C.amber:C.cyan,1.4);
  for(let r=-1;r<=1;r++)v.box(s*(outer-20),-3,z+r*21,w+13,5,4,C.deep);
 }
 // Layered dorsal citadel and flank ribs.
 for(let i=0;i<6;i++){const z=-100+i*53,w=74-i*5,h=22+i*5;v.box(0,28+i*4,z,w,h,42,C.hull);v.box(0,42+i*6,z-4,w-12,5,30,C.light);v.box(0,45+i*6,z-7,6,3,20,C.cyan,1.1)}
 for(const s of [-1,1])for(let z=-180;z<390;z+=44){v.line([s*34,-18,z],[s*103,-34,z+12],C.edge,0,3);v.box(s*116,-22,z,12,28,8,C.dark);v.box(s*123,-17,z,2,9,4,C.cyan,.75)}
 // Vented aft shoulder blocks and six recessed drive mouths.
 for(const s of [-1,1]){v.box(s*75,9,366,78,65,106,C.hull);v.box(s*79,46,370,62,10,91,C.light);v.box(s*105,-24,382,32,13,94,C.dark)}
 const engines=[[-82,17,448,19],[-40,8,465,17],[0,18,472,23],[40,8,465,17],[82,17,448,19],[0,-23,448,15]];
 for(const e of engines)nozzle(v,...e);
 for(let z=300;z<450;z+=18)for(const s of [-1,1])v.box(s*38,34,z,12,4,8,C.deep);
 // The principal beam cannon grows out of the axial bow structure.
 v.box(0,24,-330,72,28,126,C.dark);v.box(0,42,-348,62,14,98,C.hull);
 for(const s of [-1,1]){v.box(s*24,47,-410,15,17,152,C.edge);v.box(s*24,49,-485,12,13,34,C.light);v.box(s*17,47,-420,4,5,118,C.cyan,1.7)}
 v.ringZ(0,44,-508,25,5,9,C.hull);v.ringZ(0,44,-511,17,3,5,C.cyan,2.4);v.ringZ(0,44,-514,10,3,3,C.white,3.4);
 for(let z=-450;z<-335;z+=18)v.box(0,54,z,18,4,5,C.cyan,1.5);
 // Staggered pulse batteries.
 for(const s of [-1,1])for(let i=0;i<6;i++)turret(v,s*(72+(i%2)*18),33,-180+i*99,1);
 // Twin recessed flank hangars echo the forked frames of the interior.
 for(const side of [-1,1]){v.box(side*143,1,228,8,60,145,C.deep);for(const yy of [-31,33])v.box(side*149,yy,228,7,5,155,C.light);for(const zz of [153,303])v.box(side*149,1,zz,7,64,6,C.edge);for(let z=165;z<295;z+=22)v.box(side*153,-24,z,3,3,10,C.cyan,2);for(let z=180;z<290;z+=48){v.box(side*136,20,z,13,4,28,C.hull);v.box(side*139,-7,z,4,3,14,C.white,.8)}}
 // Swept lamellae extend the fork motif down the flanks and below the armor line.
 for(const s of [-1,1])for(let i=0;i<7;i++)for(let k=0;k<5;k++){const z=-255+i*94+k*8,x=s*(94+k*16+Math.sin(i*.7)*12),y=-27-k*3;v.box(x,y,z,19,4,48-k*5,k===4?C.edge:C.hull);if(k===4)v.box(x,y-3,z-4,12,2,28,C.cyan,.55)}
 for(const s of [-1,1])for(let i=0;i<8;i++){const outer=112+Math.sin((i/7)*Math.PI)*36,z=-230+i*78;for(let k=0;k<3;k++){v.box(s*(outer-7+k*13),21,z-19+k*18,10,2,12,C.dark);v.box(s*(outer-7+k*13),23,z-21+k*18,6,1,2,C.edge)}}
 for(const s of [-1,1])for(let k=0;k<7;k++){v.box(s*(30+k*4),58+k*5,205+k*15,10,16,38,C.dark);v.box(s*(30+k*4),67+k*5,203+k*15,8,3,30,C.light)}
 for(const s of [-1,1])for(let z=-240;z<390;z+=31){v.box(s*143,19,z,9,5,8,C.dark);if((z+240)%62===0)v.v(s*149,23,z,C.amber,2.1)}
});
const guardian=makeVox(v=>{
 v.box(0,0,0,42,32,116,C.dark);v.box(0,12,-5,38,14,102,C.hull);
 for(const s of [-1,1]){
  for(let i=0;i<4;i++){v.box(s*(13+i*4),2,-70+i*10,12,20,24,C.hull);v.box(s*(17+i*3),13,-66+i*10,8,4,18,C.light)}
  v.box(s*41,-1,8,43,28,72,C.hull);v.box(s*45,17,4,36,8,58,C.light);v.box(s*58,-12,12,12,8,63,C.dark);
  for(let z=-17;z<45;z+=20){turret(v,s*44,25,z,.55);v.box(s*44+2,28,z-12,2,2,14,C.edge);v.v(s*44+2,28,z-20,C.amber,.7)}
  for(let i=0;i<4;i++)v.box(s*(31+i*8),-18-i*2,-47+i*14,15,4,25,C.hull);
  for(let z=-30;z<45;z+=15)v.box(s*64,2,z,3,4,7,C.cyan,1.3);
 }
 v.box(0,30,20,30,20,43,C.hull);v.box(0,43,15,20,6,28,C.light);v.box(0,47,9,5,3,18,C.cyan,1.2);
 for(const x of [-24,0,24])nozzle(v,x,0,65,11);
 for(const s of [-1,1])for(let z=-45;z<50;z+=22)v.box(s*23,-19,z,5,8,7,C.edge);
});
const vanguard=makeVox(v=>{
 v.box(0,0,-3,32,26,156,C.dark);v.box(0,12,-11,28,10,140,C.hull);
 for(const s of [-1,1]){
  for(let i=0;i<5;i++)v.box(s*(9+i*3),2,-90+i*10,9,15,24,C.hull);
  v.box(s*42,3,-2,43,13,127,C.hull);v.box(s*49,13,4,43,7,108,C.light);
  v.box(s*78,4,8,4,24,128,C.dark);v.box(s*67,-7,8,23,4,128,C.dark);v.box(s*67,15,8,23,4,128,C.dark);v.box(s*67,18,8,26,5,130,C.hull);
  // Open missile cells: four rails, a recessed back and an exposed voxel missile.
  for(let z=-48;z<=55;z+=17){for(const yy of [3,15])v.box(s*67,yy,z,19,3,14,C.edge);for(const xx of [-9,9])v.box(s*67+xx,9,z,3,10,14,C.edge);v.box(s*67,9,z+6,16,10,2,C.deep);v.box(s*67,9,z-4,7,7,10,C.rockLight);v.box(s*67,9,z-10,3,3,3,C.light);v.v(s*67,9,z-12,C.amber,.65)}
  v.box(s*78,-7,12,5,13,118,C.edge);v.box(s*80,1,-26,2,3,43,C.cyan,1.25);
  v.line([s*20,-11,-55],[s*69,-17,-27],C.edge,0,2);
 }
 v.box(0,27,22,19,22,57,C.hull);v.box(0,41,12,12,7,35,C.light);v.box(0,45,4,4,3,23,C.cyan,1.4);
 for(const x of [-27,0,27])nozzle(v,x,0,91,10);
});
const shuttle=makeVox(v=>{
 v.box(0,0,0,7,5,17,C.hull);v.box(0,3,1,5,3,10,C.light);v.box(0,4,-3,3,2,6,C.cyan,.8);
 for(const s of [-1,1]){v.box(s*5,-1,2,5,3,10,C.dark);v.box(s*4,0,-9,3,3,7,C.hull);v.box(s*5,0,8,3,3,3,C.cyan,2)}
});
const missile=makeVox(v=>{v.box(0,0,0,3,3,8,C.rockLight);v.box(0,0,-5,1,1,3,C.light);v.box(0,0,5,3,3,2,C.amber,1.8);for(const s of [-1,1])v.v(s*2,0,3,C.dark)});
console.log('voxel prototypes',flagship.count,guardian.count,vanguard.count);

const bridge=makeVox(v=>{
 v.box(0,-19,0,130,4,130,C.dark);v.box(0,-16,3,112,2,112,C.hull);v.box(0,50,3,128,4,126,C.deep);v.box(0,47,4,34,3,120,C.hull);
 for(let z=-48;z<=48;z+=24){v.box(0,45,z,64,2,3,C.cyan,.38);for(const s of [-1,1])v.box(s*55,44,z,12,3,5,C.light)}
 for(const s of [-1,1]){v.box(s*64,10,4,4,60,122,C.dark);v.box(s*57,-4,4,14,8,116,C.hull);v.box(s*53,13,7,22,5,108,C.hull);v.box(s*58,16,7,7,3,106,C.cyan,.8);
  for(let z=-45;z<53;z+=24){v.box(s*50,1,z,13,10,13,C.dark);v.box(s*48,7,z-3,13,3,11,C.edge);v.box(s*48,9,z-4,10,2,8,C.cyan,1.25);v.box(s*43,25,z,3,14,16,C.hull);v.box(s*41,27,z-1,2,9,12,z%3?C.cyan:C.amber,1.15)}
  for(let z=-55;z<58;z+=28){v.line([s*61,36,z],[s*45,48,z+6],C.edge,0,3);v.box(s*57,35,z,12,4,6,C.light)}
 }
 // Monumental observation aperture and overhead span.
 for(const s of [-1,1]){v.box(s*61,11,-64,8,60,7,C.hull);v.box(s*48,42,-61,28,7,10,C.edge)}
 v.box(0,45,-62,76,7,10,C.hull);v.box(0,40,-60,66,2,4,C.cyan,.65);
 for(const z of [-42,3,48]){v.box(0,42,z,122,5,5,C.edge);for(const s of [-1,1])v.box(s*47,38,z,18,3,8,C.light)}
 // Command nexus: nested octagonal plinths and suspended voxel display cages.
 v.ringY(0,-13,-8,20,6,5,C.edge);v.ringY(0,-8,-8,15,5,5,C.hull);v.box(0,-4,-8,15,7,15,C.dark);v.ringY(0,1,-8,12,3,3,C.cyan,1.5);
 for(const s of [-1,1]){v.box(s*16,20,-8,3,30,3,C.edge);v.box(s*16,34,-8,5,3,24,C.hull)}
 v.box(0,35,-8,28,3,24,C.dark);v.box(0,32,-8,23,2,19,C.cyan,.9);
 for(let z=-45;z<50;z+=19)for(const x of [-28,28]){v.box(x,-11,z,18,8,9,C.dark);v.box(x,-6,z-2,16,2,7,C.hull);v.box(x,-4,z-3,13,1,5,C.cyan,1.4)}
 for(let z=-52;z<58;z+=13)for(const x of [-8,8])v.box(x,-14,z,2,1,7,C.cyan,1.8);
});
const reactorRoom=makeVox(v=>{
 // Five open galleries around a 250-voxel vertical atrium.
 for(const y of [-105,-55,-5,45,95]){v.ringY(0,y,0,116,25,5,C.hull);v.ringY(0,y+5,0,92,3,3,C.cyan,.7);for(const s of [-1,1]){v.box(s*111,y+10,0,7,16,218,C.dark);v.box(0,y+10,s*111,218,16,7,C.dark)}}
 for(const x of [-120,120])for(let z=-110;z<=110;z+=28){v.box(x,0,z,7,250,9,C.dark);v.box(x-Math.sign(x)*5,0,z,3,238,4,C.edge)}
 v.box(0,0,123,238,250,5,C.dark);v.box(0,0,-123,238,250,5,C.dark);for(const s of [-1,1])v.box(s*124,0,0,3,250,238,C.deep);v.ringY(0,121,0,122,35,4,C.dark);v.ringY(0,-124,0,122,35,4,C.dark);for(let x=-105;x<=105;x+=30){v.box(x,0,118,6,244,6,C.hull);v.box(x,0,-118,6,244,6,C.hull)}
 for(const y of [-80,-25,30,80])for(const s of [-1,1]){v.line([s*116,y,-50],[s*37,y+8,-18],C.hull,0,6);v.line([s*116,y,50],[s*37,y+8,18],C.hull,0,6);v.box(s*108,y,-50,15,19,19,C.light)}
 // Luminous core contained by discontinuous armored vertebrae.
 v.box(0,0,0,18,218,18,C.cyan,2.6);for(let y=-105;y<=105;y+=30){v.ringY(0,y,0,24,7,7,C.dark);v.ringY(0,y+3,0,19,2,4,C.white,2.2);for(const s of [-1,1]){v.box(s*23,y+7,0,8,16,16,C.hull);v.box(0,y+7,s*23,16,16,8,C.hull);v.box(s*28,y+7,0,2,8,8,C.cyan,.8);v.box(0,y+7,s*28,8,8,2,C.cyan,.8)}}
 for(const s of [-1,1])v.line([0,-115,s*8],[0,115,s*8],C.white,2.4,2);
});
const reactorRingA=makeVox(v=>{v.ringY(0,0,0,40,5,5,C.hull);v.ringY(0,1,0,36,2,3,C.cyan,1.5);for(const s of [-1,1])v.box(s*40,2,0,9,9,15,C.light)});
const reactorRingB=makeVox(v=>{v.ringY(0,0,0,55,4,4,C.edge);for(let a=0;a<8;a++){const x=Math.round(Math.cos(a*TAU/8)*53),z=Math.round(Math.sin(a*TAU/8)*53);v.box(x,2,z,8,8,8,C.dark);v.v(x,7,z,C.cyan,2)}});
const hangar=makeVox(v=>{
 // A 360-voxel through-hangar, with repeated bays and a second pressure gate.
 v.box(0,-29,0,138,6,360,C.dark);v.box(0,-25,0,112,2,348,C.hull);v.box(0,45,0,134,4,356,C.deep);for(const x of [-42,42])v.box(x,42,0,4,2,342,C.hull);
 for(const s of [-1,1]){v.box(s*68,5,0,5,70,360,C.dark);v.box(s*62,-15,0,12,8,350,C.hull);v.box(s*57,-9,0,3,3,346,C.cyan,.65);
  for(let z=-145;z<=145;z+=48){v.box(s*54,-13,z,22,7,35,C.deep);v.box(s*63,1,z,7,29,39,C.hull);v.box(s*48,-9,z-17,27,3,4,C.light);v.box(s*48,-9,z+17,27,3,4,C.light);v.box(s*53,9,z,13,3,26,C.edge);v.box(s*53,11,z-5,7,2,14,C.cyan,.9);
   // Articulated maintenance shapes are deliberately non-anthropomorphic.
   v.line([s*62,19,z+12],[s*43,14,z+4],C.edge,0,3);v.box(s*40,12,z+2,8,8,9,C.hull);v.v(s*36,11,z,C.amber,1.4);
  }
 }
 for(const z of [-176,-90,10,108,176]){for(const s of [-1,1])v.box(s*60,7,z,11,72,7,C.hull);v.box(0,39,z,116,8,8,C.edge);v.box(0,34,z,102,2,3,C.cyan,.9)}
 for(const z of [-115,-25,70]){v.box(0,24,z,116,5,12,C.hull);for(const s of [-1,1])v.box(s*52,12,z,5,24,8,C.edge);v.box(0,20,z,105,2,4,C.dark)}
 for(let z=-164;z<170;z+=16)for(const x of [-18,18])v.box(x,-23,z,3,1,8,C.cyan,2.1);
 for(let z=-155;z<160;z+=32)v.box(0,38,z,4,3,12,C.white,1.2);
 // Distant illuminated throat.
 v.box(0,4,183,118,64,5,C.deep);v.ringZ(0,4,178,44,5,4,C.cyan,1.5);
});
const corridor=makeVox(v=>{
 v.box(0,-34,0,102,5,366,C.dark);v.box(0,-30,0,72,2,354,C.hull);v.box(0,43,0,100,4,360,C.deep);for(const x of [-27,27])v.box(x,39,0,5,3,348,C.hull);
 for(const s of [-1,1]){v.box(s*51,1,0,5,74,366,C.dark);v.box(s*43,-22,0,12,13,354,C.hull);v.box(s*37,-14,0,3,3,350,C.cyan,1.1);
  for(let z=-155;z<=150;z+=44){
   v.box(s*34,0,z,22,51,19,C.dark);v.box(s*34,2,z-2,15,39,15,C.hull);v.box(s*34,3,z-11,9,28,4,C.cyan,1.8);
   for(const y of [-22,27])v.box(s*34,y,z,29,6,25,C.light);
   v.box(s*20,7,z,7,42,9,C.edge);v.box(s*20,7,z-6,3,29,3,C.cyan,.85);
  }
 }
 for(let z=-176;z<=176;z+=44){for(const s of [-1,1])v.box(s*46,2,z,8,72,7,C.hull);v.box(0,36,z,88,7,8,C.edge);v.box(0,30,z,67,3,5,C.dark);v.box(0,28,z,56,2,3,C.cyan,.8)}
 for(let z=-165;z<170;z+=18)for(const x of [-12,12])v.box(x,-28,z,2,1,9,C.cyan,2.1);
 v.ringZ(0,0,181,41,6,6,C.hull);v.ringZ(0,0,184,31,4,4,C.cyan,2.6);v.ringZ(0,0,188,20,3,3,C.white,3.2);v.box(0,0,193,35,35,3,C.cyan,1.15);v.box(0,0,190,11,11,2,C.white,1.8);
});
const energyCarrier=makeVox(v=>{v.box(0,0,0,9,12,14,C.dark);v.box(0,0,0,5,8,12,C.cyan,2.2);for(const s of [-1,1])v.box(s*6,0,0,3,15,16,C.light)});
const jaw=makeVox(v=>{v.box(0,0,0,11,28,13,C.hull);v.box(0,0,-7,8,20,3,C.edge);v.box(0,0,-9,4,14,2,C.cyan,1.1)});
const parkedShuttles=[];for(const s of [-1,1])for(let z=-140;z<=140;z+=48)parkedShuttles.push([s*49,-7,z,s>0?-Math.PI/2:Math.PI/2]);

function asteroidChunks(seed,r=50,count=5){
 const cells=new Map(),groups=Array.from({length:count},()=>new Vox());
 for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++)for(let z=-r;z<=r;z++){
  const d=(x*x/(r*r)+y*y/(r*r*.78)+z*z/(r*r*.91));const n=hash(x+seed*17,y-seed*9,z+seed*3);
  const contour=.84+.17*Math.sin(x*.11+seed)*Math.cos(z*.09-seed)+.09*Math.sin(y*.21+z*.07);if(d<contour+(n-.5)*.13){const cavity=(x-r*.18)**2+(y+r*.08)**2+(z-r*.25)**2<(r*.28)**2;const cleft=Math.abs(x+y*.32-r*.05)<3&&z>r*.02&&z<r*.78;const notch=x<-r*.3&&y>r*.28&&z<r*.15;if(cavity||cleft||notch)continue;let g=Math.floor(clamp((Math.atan2(y,x)+Math.PI)/TAU*count,0,count-.001));if(z>r*.3)g=(g+1)%count;cells.set(`${x},${y},${z}`,{x,y,z,g,n});}
 }
 for(const c of cells.values()){let surface=false;for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const n=cells.get(`${c.x+d[0]},${c.y+d[1]},${c.z+d[2]}`);if(!n||n.g!==c.g){surface=true;break}}if(!surface)continue;const light=.68+c.n*.5;const col=(c.y>r*.15?C.rockLight:C.rock).map(x=>x*light);groups[c.g].v(c.x,c.y,c.z,col,0,.08);if(c.n>.996)groups[c.g].v(c.x,c.y,c.z,C.amber,.16,.1)}
 return groups.map(g=>g.upload());
}
const asteroidA=asteroidChunks(4,56,6),asteroidB=asteroidChunks(9,43,5),asteroidC=asteroidChunks(14,30,4),asteroidD=asteroidChunks(23,24,3);
const rockShard=makeVox(v=>{v.box(0,0,0,5,4,7,C.rock);v.box(2,1,-2,4,3,4,C.rockLight);v.box(-2,-1,2,3,3,4,C.rock)}),rockSplinter=makeVox(v=>{v.box(0,0,0,3,5,9,C.rock);v.box(1,2,-3,3,3,4,C.rockLight)});

const emptyVAO=gl.createVertexArray();
function makeTarget(w,h,depth=false){const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,hdrEnabled?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,hdrEnabled?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);let rb=null;if(depth){rb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rb)}return{fbo,tex,rb,w,h}}
let sceneRT,bloomA,bloomB,W=0,H=0;
function resize(){const dpr=Math.min(devicePixelRatio||1,1.35),w=Math.min(3840,Math.round(innerWidth*dpr)),h=Math.min(2160,Math.round(innerHeight*dpr));if(w===W&&h===H)return;W=w;H=h;canvas.width=w;canvas.height=h;for(const rt of [sceneRT,bloomA,bloomB])if(rt){gl.deleteFramebuffer(rt.fbo);gl.deleteTexture(rt.tex);if(rt.rb)gl.deleteRenderbuffer(rt.rb)}sceneRT=makeTarget(w,h,true);bloomA=makeTarget(w>>1||1,h>>1||1);bloomB=makeTarget(w>>1||1,h>>1||1)}
addEventListener('resize',resize);resize();

const pointVBO=gl.createBuffer(),pointVAO=gl.createVertexArray();gl.bindVertexArray(pointVAO);gl.bindBuffer(gl.ARRAY_BUFFER,pointVBO);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,1,gl.FLOAT,false,32,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,32,16);gl.bindVertexArray(null);
const ribbonVBO=gl.createBuffer(),ribbonVAO=gl.createVertexArray();gl.bindVertexArray(ribbonVAO);gl.bindBuffer(gl.ARRAY_BUFFER,ribbonVBO);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,36,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,36,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,36,20);gl.bindVertexArray(null);
let points=[],ribbons=[];
function point(p,size,c,a=1){points.push(p[0],p[1],p[2],size,c[0],c[1],c[2],a)}
function beam(a,b,width,c,alpha=1,eye=camera.p){const d=sub(b,a);if(Math.hypot(...d)<.01)return;const side=mul(norm(cross(d,sub(eye,a))),width);const p0=sub(a,side),p1=add(a,side),p2=add(b,side),p3=sub(b,side);for(const [p,u,v] of [[p0,0,-1],[p1,0,1],[p2,1,1],[p0,0,-1],[p2,1,1],[p3,1,-1]])ribbons.push(...p,u,v,c[0],c[1],c[2],alpha)}
const spherePos=[];const SU=40,SV=22;for(let y=0;y<SV;y++)for(let x=0;x<SU;x++){const a=x/SU*TAU,b=(x+1)/SU*TAU,c=y/SV*Math.PI-Math.PI/2,d=(y+1)/SV*Math.PI-Math.PI/2;const p=(u,v)=>[Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)];const q=[p(a,c),p(b,c),p(b,d),p(a,d)];for(const i of [0,1,2,0,2,3])spherePos.push(...q[i])}
const sphereVAO=gl.createVertexArray(),sphereVBO=gl.createBuffer();gl.bindVertexArray(sphereVAO);gl.bindBuffer(gl.ARRAY_BUFFER,sphereVBO);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(spherePos),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);gl.bindVertexArray(null);
const dynBuilder=new Vox(),dynProto=dynBuilder.upload();
let camera={p:[0,0,0],q:[0,0,0],fov:50},VP=M4(),currentInterior=0,hotPos=[0,0,0],hotColor=[0,0,0],hotRadius=100;
function drawVox(p,m,em=1){gl.useProgram(voxelPr);gl.uniformMatrix4fv(voxelPr.u.uModel,false,m);gl.uniform1f(voxelPr.u.uEmission,em);gl.bindVertexArray(p.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,p.count)}
function drawDynamic(){if(!dynBuilder.data.length)return;const mesh=buildVoxelMesh(dynBuilder.data);gl.bindBuffer(gl.ARRAY_BUFFER,dynProto.ibo);gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.DYNAMIC_DRAW);dynProto.count=mesh.length/11;drawVox(dynProto,M4())}
function shield(center,sx,sy,sz,alpha,seed=0,open=1){if(alpha<.003)return;gl.useProgram(shieldPr);gl.uniformMatrix4fv(shieldPr.u.uVP,false,VP);gl.uniform3fv(shieldPr.u.uCenter,center);gl.uniform3f(shieldPr.u.uScale,sx,sy,sz);gl.uniform3fv(shieldPr.u.uEye,camera.p);gl.uniform1f(shieldPr.u.uTime,timeNow);gl.uniform1f(shieldPr.u.uAlpha,alpha);gl.uniform1f(shieldPr.u.uSeed,seed);gl.uniform1f(shieldPr.u.uOpen,open);gl.bindVertexArray(sphereVAO);gl.drawArrays(gl.TRIANGLES,0,spherePos.length/3)}
function flushEffects(){
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);
 if(ribbons.length){gl.useProgram(ribbonPr);gl.uniformMatrix4fv(ribbonPr.u.uVP,false,VP);gl.bindVertexArray(ribbonVAO);gl.bindBuffer(gl.ARRAY_BUFFER,ribbonVBO);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ribbons),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,ribbons.length/9)}
 if(points.length){gl.useProgram(pointPr);gl.uniformMatrix4fv(pointPr.u.uVP,false,VP);gl.uniform3fv(pointPr.u.uEye,camera.p);gl.uniform1f(pointPr.u.uHeight,H);gl.bindVertexArray(pointVAO);gl.bindBuffer(gl.ARRAY_BUFFER,pointVBO);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);gl.drawArrays(gl.POINTS,0,points.length/8)}
 gl.depthMask(true);gl.disable(gl.BLEND);
}
const fleet=[];
const guardPos=[[280,65,280],[-290,-35,210],[250,-100,-80],[-280,125,-150],[360,160,510],[-390,80,610],[180,190,720],[-180,-170,760],[450,-100,50],[-480,190,220],[220,250,-430],[-260,-230,-350]];
guardPos.forEach((p,i)=>fleet.push({type:'guardian',p,phase:i*.73+1,index:i}));
const vanPos=[[-170,40,-650],[190,-45,-720],[-390,130,-790],[420,-140,-860],[-650,20,-520],[680,110,-680],[-800,-120,-940],[810,210,-1030],[-510,270,-1160],[520,-280,-1210],[-250,-180,-1120],[260,170,-1280],[-920,130,-1320],[960,-80,-1460],[-420,40,-1490],[420,-40,-1590],[-700,300,-1740],[720,-260,-1810]];
vanPos.forEach((p,i)=>fleet.push({type:'vanguard',p,phase:i*.51+3,index:i}));
const flagEngines=[[-82,17,455],[-40,8,473],[0,18,481],[40,8,473],[82,17,455],[0,-23,456]];
function engineBoost(t){return t<8?1-smooth(0,8,t):smooth(67.5,78,t)}
function shieldGlow(t){if(t<7)return .28*(1-smooth(0,7,t));if(t<65)return 0;if(t<70)return mix(.05,.85,smooth(65,70,t));return mix(.85,.28,smooth(75,80,t))}
function shipState(s,t){const spread=smooth(44,52,t)*(1-smooth(64,73,t));const fac=s.type==='guardian'?.17:.27;const p=[s.p[0]*(1+fac*spread),s.p[1]*(1+.08*spread)+Math.sin(t*TAU/80+s.phase)*5,s.p[2]+Math.cos(t*TAU/80+s.phase)*8];return{p,ry:Math.sin(t*TAU/80+s.phase)*.012}}
function engineTrail(pos,length,boost,seed){const pulse=1+.055*Math.sin(timeNow*TAU/80*12+seed*3),len=length*(1+boost*2.3)*pulse,a=pos,b=add(pos,[0,0,len]);beam(a,b,2.8+boost*1.4,[.02,.35,1.],(.48+boost*.15)*pulse);beam(a,add(pos,[0,0,len*.72]),1.2+boost*.5,[.25,.95,1.],.8);beam(a,add(pos,[0,0,len*.28]),.65,[.75,1.,1.],1.15+boost*.3);for(let j=0;j<4;j++){const f=fract(timeNow*.55+seed+j*.23);point(add(pos,[Math.sin(seed*9+j)*f*3,Math.cos(seed*4+j)*f*2,len*f]),2.2*(1-f)+.3,j<2?C.cyan:[.02,.18,.8],.6*(1-f))}}
function inView(p,r){const d=sub(p,camera.p),f=norm(sub(camera.q,camera.p)),z=dot(d,f);if(z<-r||z>6000+r)return false;if(z<r)return true;const right=norm(cross(f,[0,1,0])),up=cross(right,f),tan=Math.tan(camera.fov*Math.PI/360);return Math.abs(dot(d,up))<z*tan+r&&Math.abs(dot(d,right))<z*tan*W/H+r}
function shipEngineBoost(s,t){if(t<8)return engineBoost(t);const delay=s.index*.075+(s.type==='vanguard'?.35:0);return smooth(67.5+delay,78,t)}
function drawFleet(t){
 const boost=engineBoost(t);drawVox(flagship,modelAt([0,Math.sin(t*TAU/80)*3,0],Math.sin(t*TAU/80)*.006));
 flagEngines.forEach((p,i)=>engineTrail(p,112+Math.abs(p[0])*.16,boost,i*.3));
 for(const s of fleet){const st=shipState(s,t);if(!inView(st.p,155))continue;const m=modelAt(st.p,st.ry),boost=shipEngineBoost(s,t);drawVox(s.type==='guardian'?guardian:vanguard,m);const es=s.type==='guardian'?[-24,0,24]:[-27,0,27],ez=s.type==='guardian'?74:100;for(let i=0;i<3;i++){const local=[es[i],0,ez];engineTrail(xform(m,local),s.type==='guardian'?43:57,boost,s.phase+i)}}
 // Escort-sized shuttles trace independent paths along the armor, never through it.
 for(let i=0;i<7;i++){const a=t*TAU/80+i*1.7,z=Math.sin(a*3+i)*330,x=(i%2?1:-1)*(170+35*Math.sin(a*2+i)),y=45+55*Math.cos(a*2+i*2);const m=modelAt([x,y,z],i%2?.06:-.06,0,Math.sin(a*3)*.08);drawVox(shuttle,m);engineTrail(xform(m,[0,0,11]),18,boost*.25,i+8)}
 if(t>10.5&&t<18.5){const f=smooth(10.5,17.5,t),p=[-157-f*88,2+Math.sin(f*Math.PI)*6,238-f*40];drawVox(shuttle,modelAt(p,Math.PI/2,0,-.06));const e=add(p,[11,0,0]);beam(e,add(e,[24,0,0]),1.4,C.cyan,.7);beam(e,add(e,[12,0,0]),.55,C.white,1.1);point(e,4,C.cyan,.8)}
}
function drawShields(t){const g=shieldGlow(t);if(g<=0)return;const mainOpen=t<65?1:smooth(65,66.8,t);shield([0,0,0],190*(.82+.18*mainOpen),110*(.82+.18*mainOpen),557*(.82+.18*mainOpen),g,0,mainOpen);const ordered=fleet.slice().sort((a,b)=>Math.hypot(...sub(shipState(b,t).p,camera.p))-Math.hypot(...sub(shipState(a,t).p,camera.p)));for(const s of ordered){const delay=s.index*.065+(s.type==='vanguard'?.55:0);const on=smooth(65+delay,67.3+delay,t);let a=t<65?g:g*on;if(t>=75)a=g;const open=t<65?1:.82+.18*on,st=shipState(s,t),len=(s.type==='guardian'?96:119)*open;if(!inView(st.p,len))continue;shield(st.p,(s.type==='guardian'?83:96)*open,54*open,len,a,s.phase,t<65?1:on)}}

const rocks=[{p:[45,5,-1390],chunks:asteroidA,break:56.2,r:56},{p:[-185,65,-1510],chunks:asteroidB,break:63.2,r:43},{p:[190,-45,-1300],chunks:asteroidC,break:59.4,r:30},{p:[-90,-105,-1190],chunks:asteroidD,break:60.5,r:24}];
function rockPos(r,t){return[r.p[0],r.p[1],r.p[2]+Math.max(0,t-49)*15+smooth(67,75,t)*520]}
function drawAsteroids(t){
 if(t>48.9&&t<76){for(let ri=0;ri<rocks.length;ri++){const r=rocks[ri],p=rockPos(r,t),age=Math.max(0,t-r.break);for(let j=0;j<r.chunks.length;j++){const a=j/r.chunks.length*TAU+ri,dir=[Math.cos(a),Math.sin(a)*.75,(hash(j,ri)-.5)*.7];const spread=age>0?(1-Math.exp(-age*.62))*r.r*1.55:0;const pp=add(p,mul(dir,spread));const m=mmul(trans(...pp),mmul(rotY(age*dir[0]*.38),mmul(rotX(age*dir[1]*.34),rotZ(age*.13*(j%2?1:-1)))));drawVox(r.chunks[j],m)}
  if(age>0&&age<12)for(let k=0;k<32;k++){const h=hash(k,ri,4),a=hash(k,ri,7)*TAU,speed=8+h*24;const pp=[p[0]+Math.cos(a)*age*speed,p[1]+(hash(k,2,ri)-.5)*age*speed*1.3,p[2]+Math.sin(a)*age*speed];const sz=h>.7?3:2;dynBuilder.box(pp[0],pp[1],pp[2],sz,sz,sz,h>.86?C.rockLight:C.rock,0,.08,true)}
  if(age>.12&&age<14)for(let k=0;k<8;k++){const a=hash(k,ri,11)*TAU,aa=age-.12,speed=6+hash(k,ri,12)*13,pp=[p[0]+Math.cos(a)*aa*speed,p[1]+(hash(k,ri,13)-.5)*aa*speed,p[2]+Math.sin(a)*aa*speed],m=mmul(trans(...pp),mmul(rotY(aa*(.4+hash(k,ri))),rotX(aa*(.3+hash(k,ri,15)))));drawVox(k%2?rockShard:rockSplinter,m)}
  const charge=smooth(r.break-1.8,r.break-.15,t)*(1-smooth(r.break,r.break+1.2,t));if(charge>0){for(let k=0;k<9;k++){const a=k/9*TAU+ri,rr=r.r*(.3+.5*hash(k,ri));point(add(p,[Math.cos(a)*rr,Math.sin(a)*rr*.7,Math.sin(a*2)*r.r*.5]),3+charge*5,k%3?C.amber:C.white,charge*1.5)}for(let k=0;k<7;k++){const a=k/7*TAU+ri,rr=r.r*(.18+.075*k),rr2=rr+r.r*.2,z1=Math.sqrt(Math.max(0,r.r*r.r-rr*rr))*.74,z2=Math.sqrt(Math.max(0,r.r*r.r-Math.min(r.r*.95,rr2)**2))*.74,q1=add(p,[Math.cos(a)*rr,Math.sin(a)*rr*.78,z1]),q2=add(p,[Math.cos(a+.3)*rr2,Math.sin(a+.3)*rr2*.78,z2]);beam(q1,q2,1.25,ri===1||ri===3?C.amber:C.cyan,charge*.85)}}
 }}
 // A separate, persistent distant field gives the environment depth at loop boundaries.
 for(const [i,p] of [[0,[780,230,-2260]],[1,[-850,-140,-2440]],[2,[1100,-280,-1760]]])drawVox(asteroidD[i%asteroidD.length],modelAt(p,i*.7,.2*i,.1));
}
function mainBeam(t){
 if(t<51||t>59.8)return;const start=[0,44,-518],end=rockPos(rocks[0],t),charge=smooth(51,52.7,t)*(1-smooth(58.2,59,t)),stop=smooth(58,58.5,t),active=smooth(52.7,53.05,t)*(1-stop),bstart=lerp3(start,end,stop*.16);
 point(start,16+charge*28,C.cyan,charge*1.8);point(start,7+charge*11,C.white,charge*2.3);for(let i=0;i<8;i++)if(charge>i/9)point([0,56,-350-i*19],3+i*.25,i%3?C.cyan:C.white,charge*.7);
 const ringStrength=Math.max(charge*.35,active*.8);if(ringStrength>.01){const d=norm(sub(end,start)),u=norm(cross(d,[0,1,0])),v=cross(d,u),center=add(start,mul(d,5)),r=25+charge*8+Math.sin(t*8)*1.5;for(let i=0;i<32;i++){const a=i/32*TAU,b=(i+1)/32*TAU,p1=add(center,add(mul(u,Math.cos(a)*r),mul(v,Math.sin(a)*r))),p2=add(center,add(mul(u,Math.cos(b)*r),mul(v,Math.sin(b)*r)));beam(p1,p2,.8,C.cyan,ringStrength*.65)}}
 hotPos=start;hotColor=[.1,.8,1.];hotRadius=130;
 if(active>0){beam(bstart,end,19*(1-stop*.75),[.02,.32,1.],.42*active);beam(bstart,end,8*(1-stop*.75),[.05,.85,1.],.85*active);beam(bstart,end,2.5,[.8,1.,1.],1.8*active);for(let i=0;i<22;i++){const f=fract(i/22+t*1.7);point(lerp3(bstart,end,f),3.5+Math.sin(i+t*8)*1.2,i%4?C.cyan:C.white,active*.8)}point(end,55,C.cyan,active*.85);point(end,23,C.white,active*1.4);hotPos=end;hotColor=[.1,.7,1.];hotRadius=240}
 if(t>58.3){const fade=1-smooth(58.3,59.8,t);for(let i=0;i<18;i++){const f=fract(i/18+(t-58.3)*.4);point(lerp3(start,end,f),2.5+i%3,C.cyan,fade*.55)}}
}
function pulseFire(t){if(t<53.8||t>61.55)return;for(let j=0;j<12;j++){const side=j<6?-1:1,k=j%6,start=[side*(72+(k%2)*18),40,-201+k*99];for(let n=0;n<3;n++){const phase=(t-53.8-j*.065+n*.52)/.72,u=fract(phase);if(phase<0||(t>61&&u<.65))continue;const target=rockPos(rocks[j%2?2:1],t);const p=lerp3(start,target,u);point(p,7,C.cyan,1.4);point(p,3,C.white,1.8);beam(add(p,[0,0,15]),p,2.3,C.cyan,.8);if(u>.9)point(target,8+(u-.9)*55,C.cyan,(u-.9)*5)}if(t<=61&&fract((t-53.8-j*.065)/.72)<.12)point(start,16,C.cyan,.8)}}
function ciwsFire(t){if(t<55.8||t>63.65)return;for(let j=0;j<8;j++){const s=fleet[j],st=shipState(s,t);for(let n=0;n<4;n++){const phase=(t-55.8-j*.04+n*.13)/.19,u=fract(phase);if(t>63&&u<.65)continue;const start=add(st.p,[(j%2?1:-1)*44,30,-18+(n%3)*20]),target=add(rockPos(rocks[3],t),[(hash(j,n)-.5)*34,(hash(n,j)-.5)*30,(hash(j,n,2)-.5)*25]);const p=lerp3(start,target,u);beam(lerp3(start,target,Math.max(0,u-.085)),p,1.05,n%3?C.amber:C.white,1.35);if(t<=63&&u<.14)point(start,6,C.amber,.9);if(u>.9)point(target,5+(u-.9)*25,C.amber,1.1)}}}
function bezier(a,b,c,u){const v=1-u;return add(add(mul(a,v*v),mul(b,2*v*u)),mul(c,u*u))}
function missileFire(t){if(t<57.8||t>66)return;for(let i=0;i<14;i++){const launch=57.9+i*.31,age=t-launch;if(age<0)continue;const s=fleet[12+(i%8)],st=shipState(s,launch),start=add(st.p,[(i%2?1:-1)*67,10,-38+(i%4)*17]),end=add(rockPos(rocks[1],t),[(hash(i,1)-.5)*55,(hash(i,2)-.5)*45,(hash(i,3)-.5)*40]),control=lerp3(start,end,.48);control[1]+=160+(i%3)*50;control[0]+=(i%2?1:-1)*110;const u=clamp(age/2.25);if(u<1){const p=bezier(start,control,end,u),p2=bezier(start,control,end,Math.min(1,u+.015)),d=sub(p2,p);drawVox(missile,modelAt(p,Math.atan2(-d[0],-d[2]),Math.atan2(d[1],Math.hypot(d[0],d[2]))));for(let k=0;k<13;k++){const uu=Math.max(0,u-k*.018),q=bezier(start,control,end,uu);point(q,4+k*.7,k<4?C.amber:[.25,.38,.5],(1-k/13)*.85)}for(let k=0;k<9;k++){const u0=Math.max(0,u-(k+1)*.02),u1=Math.max(0,u-k*.02);beam(bezier(start,control,end,u0),bezier(start,control,end,u1),3.2+k*.32,k<3?C.amber:[.28,.32,.4],.42*(1-k/10))}}else if(age<3.2){const fade=1-(age-2.25)/.95;point(end,24*fade,C.amber,.5);for(let k=0;k<13;k++)point(bezier(start,control,end,1-k*.018),4+k*.7,k<4?C.amber:[.25,.38,.5],fade*(1-k/13)*.32)}}}
function impactEffects(t){for(let i=0;i<rocks.length;i++){const r=rocks[i],age=t-r.break;if(age>-.2&&age<3.5){const p=rockPos(r,t),a=Math.exp(-Math.max(0,age)*1.1)*smooth(-.2,.08,age);point(p,r.r*(.7+Math.max(0,age)*.6),i===1?C.amber:C.cyan,a*.8);for(let k=0;k<13;k++){const d=norm([hash(k,i)-.5,hash(k,i,2)-.5,hash(k,i,3)-.5]);beam(add(p,mul(d,r.r*.2)),add(p,mul(d,r.r*(.7+age*.6))),1.1,i===1?C.amber:C.white,a*.5)}if(age>0){hotPos=p;hotColor=i===1?[1.,.25,.04]:[.08,.7,1.];hotRadius=210}}}}
function exteriorEffects(t){const boost=engineBoost(t);for(let i=0;i<230;i++){const x=(hash(i,1)-.5)*1800,y=(hash(i,2)-.5)*1100,z=(fract(hash(i,3)+t*(.008+boost*.04))-.5)*2100;const p=[camera.p[0]+x,camera.p[1]+y,camera.p[2]+z];const sz=.45+hash(i,4)*1.5;if(boost>.45&&i%4===0)beam(p,add(p,[0,0,18+boost*45]),.24,C.cyan,.22);else point(p,sz,i%5?C.light:C.cyan,.18+hash(i,5)*.35)}mainBeam(t);pulseFire(t);ciwsFire(t);missileFire(t);impactEffects(t)}
function drawBridge(t){
 drawVox(bridge,M4(),1+.08*Math.sin(t*2));hotPos=[0,12,-8];hotColor=[.02,.5,.7];hotRadius=95;
 for(let i=0;i<7;i++){const p=[(i-3)*150,Math.sin(i*2)*42,-560-Math.abs(i-3)*90];drawVox(i%2?vanguard:guardian,modelAt(p,0));for(const x of [-20,0,20])engineTrail(add(p,[x,0,i%2?100:74]),55,.2,i)}
 // A suspended, animated three-dimensional fleet plot.
 for(let i=0;i<19;i++){const x=(i%5-2)*6,z=-8+(Math.floor(i/5)-1.5)*7,y=17+Math.sin(t*1.4+i)*1.2;point([x,y,z],i===9?3.8:1.7,i===9?C.white:C.cyan,.9);beam([x,y,z],[x,y,z+8+Math.sin(t+i)*2],.22,C.cyan,.35)}
 for(let i=0;i<5;i++){const x=(i-2)*7,y=24+Math.sin(t*.8+i)*1.4,z=-13+(i%2)*8,c=i===2?C.white:C.cyan,bow=[x,y,z-4],left=[x-3,y,z+2],right=[x+3,y,z+2],stern=[x,y,z+3],top=[x,y+2,z];for(const seg of [[bow,left],[bow,right],[left,stern],[right,stern],[stern,top],[bow,top]])beam(seg[0],seg[1],.2,c,.48)}
 for(const r of [13,20])for(let i=0;i<32;i++){const a=i/32*TAU,b=(i+1)/32*TAU;beam([Math.cos(a)*r,9,-8+Math.sin(a)*r],[Math.cos(b)*r,9,-8+Math.sin(b)*r],.22,C.cyan,.34)}
}
function drawReactor(t){drawVox(reactorRoom,M4(),1+.22*Math.sin(t*1.3));for(let i=0;i<5;i++)drawVox(i%2?reactorRingA:reactorRingB,mmul(trans(0,-82+i*42,0),rotY(t*(i%2?-.19:.13)+i)),1.1);hotPos=[0,Math.sin(t)*30,0];hotColor=[.03,.75,1.];hotRadius=210;for(let i=0;i<40;i++){const y=(fract(i/40+t*.11)-.5)*215,a=i*2.4+t*.3,r=10+20*(.5+.5*Math.sin(t*1.1+i*.37));point([Math.cos(a)*r,y,Math.sin(a)*r],3.2,i%4?C.cyan:C.white,.75)}for(let i=0;i<4;i++){const a=t*.13+i*TAU/4;beam([Math.cos(a)*42,-100,Math.sin(a)*42],[Math.cos(a)*42,100,Math.sin(a)*42],.7,C.cyan,.16)}for(let level=0;level<5;level++)for(let i=0;i<4;i++){const a=i*TAU/4+level*.22,p=fract(t*.32+i*.19+level*.13),r=34+p*58,y=-93+level*50;beam([Math.cos(a)*r,y,Math.sin(a)*r],[Math.cos(a)*(r+11),y,Math.sin(a)*(r+11)],1.1,C.cyan,.32)}}
function drawHangar(t){drawVox(hangar,M4());hotPos=[0,-3,-150];hotColor=[.03,.35,.5];hotRadius=110;for(const p of parkedShuttles){drawVox(shuttle,modelAt(p.slice(0,3),p[3]));}const f=clamp((t-34)/9),hero=[Math.sin(f*Math.PI)*12,-3+Math.sin(f*TAU)*2,145-f*350];drawVox(shuttle,modelAt(hero,0,0,Math.sin(f*TAU)*.05));engineTrail(add(hero,[0,0,11]),20,.25,2);const ret=[-22,-8,-175+f*250];drawVox(shuttle,modelAt(ret,Math.PI));const re=add(ret,[0,0,-11]);beam(re,add(re,[0,0,-22]),1.2,C.cyan,.6);point(re,3,C.white,.65);for(let i=0;i<14;i++){const z=-160+i*25;point([0,-22,z],2.4,i%3?C.cyan:C.white,.5+.3*Math.sin(t*3-i))}}
function drawCorridor(t){drawVox(corridor,M4());hotPos=[0,0,175];hotColor=[.04,.65,.9];hotRadius=170;for(let i=0;i<12;i++){const z=-170+fract(i/12+t*.075)*340,x=i%2?-24:24;drawVox(energyCarrier,modelAt([x,-10,z]),1+.25*Math.sin(t*3+i))}for(let j=0;j<8;j++){const z=-155+j*44,open=.5+.5*Math.sin(t*.85+j*.8);for(const s of [-1,1])drawVox(jaw,modelAt([s*(24+open*7),4,z],s>0?0:Math.PI))}for(let i=0;i<24;i++){const z=-175+fract(i/24+t*.12)*350;point([0,29,z],2.5,C.cyan,.6)}}

function invert(a){const o=new Float32Array(16),a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15],b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(!det)return M4();det=1/det;o[0]=(a11*b11-a12*b10+a13*b09)*det;o[1]=(a02*b10-a01*b11-a03*b09)*det;o[2]=(a31*b05-a32*b04+a33*b03)*det;o[3]=(a22*b04-a21*b05-a23*b03)*det;o[4]=(a12*b08-a10*b11-a13*b07)*det;o[5]=(a00*b11-a02*b08+a03*b07)*det;o[6]=(a32*b02-a30*b05-a33*b01)*det;o[7]=(a20*b05-a22*b02+a23*b01)*det;o[8]=(a10*b10-a11*b08+a13*b06)*det;o[9]=(a01*b08-a00*b10-a03*b06)*det;o[10]=(a30*b04-a31*b02+a33*b00)*det;o[11]=(a21*b02-a20*b04-a23*b00)*det;o[12]=(a11*b07-a10*b09-a12*b06)*det;o[13]=(a00*b09-a01*b07+a02*b06)*det;o[14]=(a31*b01-a30*b03-a32*b00)*det;o[15]=(a20*b03-a21*b01+a22*b00)*det;return o}
function cameraFor(t){
 if(t<9)return{scene:'exterior',...keyframe([[0,[350,82,442],[250,40,115],54],[4,[390,120,510],[160,25,30],52],[9,[760,350,1050],[0,0,-170],48]],t)};
 if(t<18)return{scene:'exterior',...keyframe([[9,[-185,82,-535],[-5,28,-390],56],[12,[-230,72,-160],[-20,20,-80],53],[15,[-340,-95,330],[0,-10,-80],58],[18,[-255,5,480],[0,5,340],53]],t)};
 if(t<25)return{scene:'bridge',...keyframe([[18,[34,20,55],[0,10,-13],58],[21,[30,20,35],[0,13,-24],55],[25,[-18,25,8],[0,16,-54],53]],t)};
 if(t<34)return{scene:'reactor',...keyframe([[25,[64,-72,55],[0,-28,0],62],[29,[69,-5,29],[0,3,0],60],[34,[69,76,30],[0,24,0],62]],t)};
 if(t<43)return{scene:'hangar',...keyframe([[34,[32,4,163],[-8,-3,95],57],[38,[-8,1,55],[8,-4,-20],54],[43,[5,-1,-104],[0,-2,-195],58]],t)}
 if(t<49)return{scene:'corridor',...keyframe([[43,[-4,-4,-170],[0,1,-100],58],[46,[5,2,-25],[0,3,55],54],[49,[-6,4,137],[0,4,190],57]],t)};
 if(t<65)return{scene:'exterior',...keyframe([[49,[360,155,-190],[0,20,-1050],58],[52,[300,130,-130],[15,15,-1160],56],[53.4,[280,115,-180],[20,10,-1180],54],[56,[255,100,-900],[40,5,-1300],50],[59,[-250,25,-865],[-85,-85,-1125],50],[62,[-390,180,-930],[-100,30,-1400],52],[65,[-460,230,-1000],[-70,25,-1330],54]],t)};
 if(t<73)return{scene:'exterior',...keyframe([[65,[350,175,-580],[0,10,-690],52],[68,[640,285,-30],[0,0,-160],50],[71,[870,370,670],[0,0,-110],48],[73,[900,380,980],[0,0,-150],47]],t)};
 return{scene:'exterior',...keyframe([[73,[900,380,980],[0,0,-150],47],[76,[940,320,870],[50,10,-30],49],[78,[670,205,680],[170,30,90],52],[80,[350,82,442],[250,40,115],54]],t)};
}
let timeNow=0,exportMode=false,autoEpoch=performance.now(),autoOffset=0;
function prepareHot(t,scene){hotPos=[0,15,420];hotColor=[.02,.18,.28];hotRadius=180;if(scene==='bridge'){hotPos=[0,12,-8];hotColor=[.02,.4,.6]}else if(scene==='reactor'){hotPos=[0,0,0];hotColor=[.03,.65,.9];hotRadius=230}else if(scene==='hangar'){hotPos=[0,0,-150];hotColor=[.03,.3,.4]}else if(scene==='corridor'){hotPos=[0,0,170];hotColor=[.03,.55,.8]}else if(t>=51&&t<53){hotPos=[0,44,-518];hotColor=[.05,.7,1.]}else if(t>=53&&t<59){hotPos=rockPos(rocks[0],t);hotColor=[.04,.65,1.];hotRadius=250}else if(t>=62.8&&t<65){hotPos=rockPos(rocks[1],t);hotColor=[1.,.22,.03];hotRadius=250}else if(t>=65&&t<73){hotPos=[0,0,0];hotColor=[.04,.35,.48];hotRadius=520}}
function setTexture(unit,tex,loc){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(loc,unit)}
function render(input){
 timeNow=((input%DURATION)+DURATION)%DURATION;const c=cameraFor(timeNow);camera={p:c.p,q:c.q,fov:c.fov};const scene=c.scene;currentInterior=scene==='exterior'?0:1;prepareHot(timeNow,scene);points=[];ribbons=[];dynBuilder.data=[];
 const proj=perspective(c.fov*Math.PI/180,W/H,.35,9000),view=lookAt(c.p,c.q);VP=mmul(proj,view);
 gl.bindFramebuffer(gl.FRAMEBUFFER,sceneRT.fbo);gl.viewport(0,0,W,H);gl.clearColor(.002,.004,.01,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.CULL_FACE);
 gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.useProgram(skyPr);gl.uniformMatrix4fv(skyPr.u.uInvVP,false,invert(VP));gl.uniform3fv(skyPr.u.uEye,camera.p);gl.uniform1f(skyPr.u.uTime,timeNow);gl.bindVertexArray(emptyVAO);gl.drawArrays(gl.TRIANGLES,0,3);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
 gl.useProgram(voxelPr);gl.uniformMatrix4fv(voxelPr.u.uVP,false,VP);gl.uniform3fv(voxelPr.u.uEye,camera.p);gl.uniform1f(voxelPr.u.uTime,timeNow);gl.uniform1f(voxelPr.u.uInterior,currentInterior);gl.uniform3fv(voxelPr.u.uHotPos,hotPos);gl.uniform3fv(voxelPr.u.uHotColor,hotColor);gl.uniform1f(voxelPr.u.uHotRadius,hotRadius);
 if(scene==='exterior'){drawFleet(timeNow);drawAsteroids(timeNow);exteriorEffects(timeNow)}else if(scene==='bridge')drawBridge(timeNow);else if(scene==='reactor')drawReactor(timeNow);else if(scene==='hangar')drawHangar(timeNow);else drawCorridor(timeNow);
 drawDynamic();
 if(scene==='exterior'){gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);drawShields(timeNow);gl.depthMask(true);gl.disable(gl.BLEND)}
 flushEffects();gl.bindVertexArray(null);gl.disable(gl.DEPTH_TEST);
 gl.bindFramebuffer(gl.FRAMEBUFFER,bloomA.fbo);gl.viewport(0,0,bloomA.w,bloomA.h);gl.useProgram(brightPr);setTexture(0,sceneRT.tex,brightPr.u.uTex);gl.bindVertexArray(emptyVAO);gl.drawArrays(gl.TRIANGLES,0,3);
 gl.useProgram(blurPr);for(let i=0;i<2;i++){gl.bindFramebuffer(gl.FRAMEBUFFER,bloomB.fbo);setTexture(0,bloomA.tex,blurPr.u.uTex);gl.uniform2f(blurPr.u.uDir,1.25/bloomA.w,0);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,bloomA.fbo);setTexture(0,bloomB.tex,blurPr.u.uTex);gl.uniform2f(blurPr.u.uDir,0,1.25/bloomA.h);gl.drawArrays(gl.TRIANGLES,0,3)}
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,W,H);gl.useProgram(finalPr);setTexture(0,sceneRT.tex,finalPr.u.uTex);setTexture(1,bloomA.tex,finalPr.u.uBloom);gl.uniform2f(finalPr.u.uPixel,1/W,1/H);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);
}
function animate(now){if(!exportMode){timeNow=(autoOffset+(now-autoEpoch)/1000)%DURATION;render(timeNow)}requestAnimationFrame(animate)}
window.videoExport={
 runs:['tour'],
 async begin(runId,{fps}={}){exportMode=true;exportMode=true;this.fps=Math.max(1,Number(fps)||60);this.start=0;render(0);return{frames:Math.round(DURATION*this.fps)}},
 async frame(i){if(!exportMode)throw Error('begin() must be called first');render(this.start+Number(i)/this.fps);gl.finish()},
 end(){exportMode=false;autoOffset=timeNow;autoEpoch=performance.now()}
};
window.fleetFilm={duration:DURATION,seek(t){exportMode=true;render(t)},resume(){window.videoExport.end()}};
requestAnimationFrame(animate);
})();
