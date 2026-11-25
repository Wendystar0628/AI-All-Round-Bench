'use strict';

// The last masonry courses, copperwork and planted borders of the acropolis.
seed=174541;
basilica.scale.set(1.145,1,1.025);
basilica.rotation.y=-.108;
for(const s of [-1,1]){
  const beacon=group(church,s*5.97,0,-5.91);
  cyl(beacon,0,3.02,0,.82,.67,6.04,'ashlar',8,PI/8);
  for(const y of [.37,2.31,5.87])cyl(beacon,0,y,0,.89,.89,.18,'trim',8,PI/8);
  cyl(beacon,0,7.61,0,.68,.59,3.40,'chalk',8,PI/8);
  for(let i=0;i<4;i++){
    const a=i*PI/2;const q=radial(beacon,.637,a,6.06);windowArch(q,0,.42,0,.37,1.84,true,true);
    column(q,.38,.18,.04,.087,2.84,'ivory');
  }
  cyl(beacon,0,9.51,0,.72,.76,.31,'trim',8,PI/8);
  for(let i=0;i<4;i++){
    const a=i*PI/2,b=radial(beacon,.475,a,9.67);
    archWall(b,0,0,0,1.06,1.88,.17,.64,.76,.70,'ivory',true);
    archBand(b,0,0,.10,.32,.76,.70,.071,.16,'trim',true);
  }
  cyl(beacon,0,11.64,0,.88,.88,.22,'bone',8,PI/8);
  steeple(beacon,0,11.75,0,.98,3.89,8,'seagreen');
  for(let i=0;i<4;i++){const a=i*PI/2+PI/4;pinnacle(beacon,.72*sin(a),11.71,.72*cos(a),1.40,.113);}
  // Gabled transepts interrupt the deep side elevations.
  const transept=group(church,s*5.67,0,-.59,s*PI/2);
  box(transept,0,3.44,0,3.17,6.89,1.94,'chalk');
  extrude(transept,[[-1.73,0],[0,2.14],[1.73,0]],2.12,'ashlar',0,6.86,0);
  for(const side of [-1,1]){
    rod(transept,[side*1.80,6.84,1.105],[0,9.13,1.105],.09,.08,'bone',8);
    column(transept,side*1.37,.11,1.08,.178,6.68,'ivory',true);
    pinnacle(transept,side*1.44,6.71,1.06,1.47,.17);
  }
  windowArch(transept,0,.53,1.006,1.70,4.20,true,true,'deep');
  rose(transept,0,6.16,1.063,.708);finial(transept,0,9.10,1.04,.75);
  // More than one skin of stone is visible around the long windows.
  for(let j=0;j<3;j++){
    const q=group(church,s*5.20,.42,-4.59+j*3.13,s*PI/2);
    box(q,0,1.70,-.043,1.85,3.40,.24,'sand');windowArch(q,0,.27,.102,1.01,2.73,true,true);
    for(const side of [-1,1])column(q,side*.78,.02,.13,.125,3.36,'chalk');
  }
}
for(let j=0;j<36;j++){
  const a=j*TAU/36,q=radial(crossing,4.40,a,11.85);
  box(q,0,.09,0,.255,.18,.24,'bone');box(q,0,-.023,0,.179,.089,.19,'trim');
}
for(let j=0;j<12;j++){
  const a=j*TAU/12,pt=radial(crossing,4.69,a,8.93);
  if(j%3===0)pinnacle(pt,0,0,0,1.53,.19);
}
for(const s of [-1,1]){
  const portico=group(city,s*8.07,upperY+.045,1.28,s*.49);
  box(portico,0,.10,0,2.49,.20,4.03,'paver');
  for(const dx of [-1,1])for(const dz of [-1,0,1])column(portico,dx*1.06,.21,dz*1.75,.144,1.96,'chalk',true);
  for(const dx of [-1,1]){const side=group(portico,dx*1.09,.2,0,dx*PI/2);for(let j=0;j<2;j++)archBand(side,(j-.5)*1.75,0,.02,.732,1.22,.685,.105,.27,'ivory');}
  box(portico,0,2.22,0,2.57,.19,4.07,'trim');roof(portico,0,2.32,0,2.77,4.25,.89,'copper2');
  finial(portico,0,3.21,0,.78);
  const x=s*7.11;
  for(const z of [4.28,5.69])tree(city,x,upperY+.045,z,2.59+(z-4)*.29,'cypress',z>5);
  for(let j=0;j<3;j++)shrub(city,s*(5.57+j*.66),upperY+.02,5.57-j*.15,.48);
}
for(const [x,z,ry,h] of [[-10.31,-9.37,-2.32,4.66],[10.50,-10.97,2.67,4.28],[-12.29,-3.92,-1.80,3.89]]){
  const annex=group(city,x,4.80,z,ry);
  box(annex,0,-.93,0,3.71,2.29,2.51,'ashlar');box(annex,0,.35,0,3.97,.31,2.76,'road');
  house(annex,0,.51,0,3.24,2.12,h,0,{roof:'seagreen',hip:false,chimney:false});
  for(const s of [-1,1]){pinnacle(annex,s*1.67,.52+h*.73,.98,1.29,.14);column(annex,s*1.49,.51,1.12,.144,h*.71,'chalk');}
  hangingBanner(annex,0,h*.72+.37,1.12,.65,1.32,'wine');
}
house(city,-4.83,groundY,18.24,1.91,2.18,3.37,-.31,{roof:'tile2',hip:false,workshop:true});
house(city,3.99,groundY,18.75,1.89,2.00,3.39,.14,{roof:'copper',chimney:false});
for(let j=0;j<17;j++){
  const a=(j+.45)*TAU/17,da=Math.abs(Math.atan2(sin(a),cos(a)));
  if(da<.25||Math.abs(a-.411)<.11||Math.abs(a-(TAU-.71))<.09)continue;
  const q=radial(city,23.11,a,2.73);
  if(j%3===0)hangingBanner(q,0,-.02,.10,.79,1.58,j%2?'indigo':'wine');
  else for(let i=0;i<4;i++)ivy(q,-.68+i*.39,rand(-.46,-.20),-.03,rand(.79,2.24),.29,0,j%4===1);
}
// Tesserae, border stones and small brass route stars mark the ceremonial way.
for(const x of [-1,1])for(let j=0;j<11;j++){
  const zz=3.26+j*.41;box(city,x*2.49,upperY+.029,zz,.22,.053,.31,j%2?'bronze':'bone');
}
for(const [z,y] of [[14.89,groundY+(upperY-groundY)/3],[10.90,groundY+(upperY-groundY)*2/3]]){
  box(city,0,y+.012,z,3.91,.028,.32,'bronze');
  for(let j=-4;j<=4;j++){const g=group(city,j*.41,y+.039,z);g.rotation.x=-PI/2;sunEmblem(g,0,0,0,.127,'bone',4);}
}
for(const side of [-1,1]){
  for(let j=0;j<4;j++){
    const q=group(shrine,side*(3.57-j*.20),-1.05-j*.40,.66-j*.46);
    box(q,0,0,0,1.13-j*.068,.56,2.82-j*.31,'aged');
  }
  const frieze=group(shrine,side*3.83,6.24,1.12);
  lineProfile(frieze,0,0,0,.54,1.00,[[1.1,0],[1.12,.11],[.9,.20],[.72,.47],[.79,.59],[.52,.67],[.21,1]],'aged',12);
}
for(let j=0;j<13;j++){
  const a=PI*(j+.5)/13,x=3.60*cos(a),y=5.29+4.18*sin(a);
  const chisel=box(shrine,x,y,1.48,.20,.31,.087,'brass');chisel.rotation.z=a-PI/2;
}
// Carved, branching roots bind the older shrine and both anchor sockets.
for(const sg of [-1,1])for(let j=0;j<4;j++){
  const path=[];
  for(let k=0;k<8;k++){
    const f=k/7,a=sg*(.37+f*.13+j*.025);
    const r=mix(23.33,19.2-j*.38,f);
    path.push([sin(a)*r+.29*sin(f*17+j),-.5-f*(10.3+j),cos(a)*r+.28*sin(f*10+j)]);
  }
  tube(city,path,.15-j*.022,'bark',23,7);
}
// Pale blossoms and fine blades break up the cut edges of the gardens.
M.meadow=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,envMapIntensity:.25,roughness:1});
function groundTuft(p,x,y,z,r,flower=false) {
  const variant=Math.floor(rand(0,6));
  const ge=geometry('tuft'+variant+flower,()=>{
    const ps=[],cs=[];
    for(let i=0;i<57;i++){
      const a=rand(0,TAU),rr=Math.sqrt(rand())*.90,xx=cos(a)*rr,zz=sin(a)*rr,h=rand(.17,.56),w=rand(.027,.088);
      const tone=new T.Color(pick([0x749251,0x6e8a45,0x919656,0x929b61]));
      const end=[xx+cos(a)*.20,h,zz+sin(a)*.19];
      ps.push(xx-w,0,zz,xx+w,.01,zz+.02,...end);
      for(let k=0;k<3;k++){const m=k===2?1.15:.72;cs.push(tone.r*m,tone.g*m,tone.b*m);}
      if(flower&&i%3===0){const tint=new T.Color(pick([0xefe0b3,0xd1b197,0xc78f84,0xe4cfab]));
        for(let j=0;j<5;j++){const aa=j*TAU/5;ps.push(...end,end[0]+.071*cos(aa),h+.038,end[2]+.071*sin(aa),end[0]+.059*cos(aa+.94),h+.052,end[2]+.059*sin(aa+.94));for(let k=0;k<3;k++)cs.push(tint.r,tint.g,tint.b);}
      }
    }
    return rawGeo(ps,null,cs);
  });
  const o=mesh(p,ge,'meadow',x,y,z);o.scale.setScalar(r);o.rotation.y=rand(0,TAU);
}
for(let j=0;j<105;j++){
  const a=rand(0,TAU),r=rand(22.97,23.53);
  if(Math.min(a,TAU-a)<.156||Math.abs(a-.406)<.073||Math.abs(a-(TAU-.718))<.063)continue;
  groundTuft(city,r*sin(a),.10,r*cos(a),rand(.44,1.03),j%3===0);
}
for(let j=0;j<35;j++){
  const a=(j+.5)*TAU/35;if(Math.min(a,TAU-a)<.28)continue;
  groundTuft(podium,12.63*sin(a),5.33,12.63*cos(a),rand(.43,.72),true);
}
for(const isl of islands){
  for(let j=0;j<45;j++){
    const a=rand(0,TAU),r=rand(.73,.91);
    groundTuft(isl.base,isl.rx*r*sin(a),.064,isl.rz*r*cos(a),rand(.43,.89),j%4===0);
  }
}
for(let j=0;j<10;j++)groundTuft(ruin,rand(-2.71,2.66),.787,rand(-1.74,1.63),rand(.27,.76));
// Wind acts on terminal leaves. The woody interior remains anchored.
for(const key of ['oliveLeaves','cypressLeaves']){
  const mat=M[key];mat.onBeforeCompile=s=>{
    s.uniforms.HOUR=timeUniform;s.vertexShader='uniform float HOUR;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      transformed.x += uv.y*uv.y*.009*(sin(HOUR*.97+position.y*7.)+.35*sin(HOUR*2.07+position.z*8.1));
    `);
  };
}
M.shard.transparent=true;M.shard.opacity=.93;
const leafFinish=M.leaf.onBeforeCompile;
M.leaf.onBeforeCompile=s=>{
  leafFinish(s);
  s.vertexShader='uniform float swayHour;\n'+s.vertexShader.replace('#include <begin_vertex>',`
    #include <begin_vertex>
    transformed.x+=.014*sin(position.y*1.7+position.z*.53+swayHour*1.02);
  `);
  s.uniforms.swayHour=timeUniform;
};
M.leaf.customProgramCacheKey=()=>'small-branches';
{
  const positions=[],falls=[],wind=[],phases=[];
  for(const s of spraySources){
    const count=s.drop>12?245:43;
    for(let i=0;i<count;i++){
      const dx=rand(-.62,.62)*s.w;
      positions.push(s.x+dx*cos(s.angle),s.y,s.z-dx*sin(s.angle));
      falls.push(s.drop,s.reach,s.angle);wind.push(rand(-.43,.47),rand(.07,.15),rand(.010,.029));phases.push(rand());
    }
  }
  const g=new T.BufferGeometry();for(const [name,arr,n] of [['position',positions,3],['fall',falls,3],['wind',wind,3],['phase',phases,1]])g.setAttribute(name,new T.Float32BufferAttribute(arr,n));
  const spray=new T.Points(g,new T.ShaderMaterial({
    uniforms:{clock:timeUniform,grain:{value:patina},raster:{value:new T.Vector2(innerWidth,innerHeight)}},
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`attribute vec3 fall,wind;attribute float phase;uniform float clock;uniform vec2 raster;varying float light;
    void main(){float time=fract(phase+clock*(.21+wind.y)/sqrt(max(.15,fall.x*.10)));
    vec3 p=position;float f=time*time;p.y-=fall.x*f;
    float offset=fall.y*(1.-exp(-f*7.4))+.26*sin(phase*41.+time*7.)*time;
    p.x+=sin(fall.z)*offset+wind.x*(.12+f*2.2);p.z+=cos(fall.z)*offset;
    vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(raster.y*1.8*wind.z/max(.1,-mv.z),.72,4.2);
    light=.52*sin(3.14159*time)*(.68+.32*sin(phase*54.+time*18.));}`,
    fragmentShader:`varying float light;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.74,.95,1.,(1.-smoothstep(.02,1.,r))*light);}`
  }));
  spray.frustumCulled=false;scene.add(spray);
  window.addEventListener('resize',()=>spray.material.uniforms.raster.value.set(innerWidth,innerHeight));
}

// A probe at the lantern records the actual four chapels, copper cupola and
// cloud horizon. The moving gold rings are intersected anew by the reflected
// and twice-refracted rays inside the sphere.
const probeMap=new T.WebGLCubeRenderTarget(256,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,generateMipmaps:false});
const glassUniforms={landscape:{value:probeMap.texture},centre:{value:V()},ringInverse:{value:armillaryRigs.map(()=>new T.Matrix4())},haze:{value:cloudNoise},hour:timeUniform};
const orreryGlass=new T.ShaderMaterial({
  uniforms:glassUniforms,glslVersion:T.GLSL3,
  vertexShader:`out vec3 pointW;void main(){pointW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(pointW,1.);}`,
  fragmentShader:`
    precision highp sampler3D;
    in vec3 pointW;out vec4 radiance;
    uniform vec3 centre;uniform samplerCube landscape;uniform sampler3D haze;
    uniform mat4 ringInverse[3];uniform float hour;
    vec3 surroundings(vec3 origin,vec3 dir){
      vec3 c=texture(landscape,dir).rgb;
      for(int j=0;j<3;j++){
        vec3 o=(ringInverse[j]*vec4(origin,1.)).xyz;
        vec3 d=(ringInverse[j]*vec4(dir,0.)).xyz;
        if(abs(d.z)<.0001)continue;
        float t=-o.z/d.z;if(t<0.)continue;
        vec2 hit=o.xy+d.xy*t;
        float r=1.20+float(j)*.225;
        float along=atan(hit.y,hit.x)*float(38+j*7);
        float width=.048+.024*cos(along);
        float band=1.-smoothstep(width,width+.036,abs(length(hit)-r));
        vec3 au=mix(vec3(.33,.18,.06),vec3(2.02,1.41,.52),.51+.49*sin(along+1.));
        c=mix(c,au,band*.94);
      }
      return c;
    }
    void main(){
      vec3 n=normalize(pointW-centre),incident=normalize(pointW-cameraPosition);
      vec3 inside=refract(incident,n,1./1.49);
      float path=-2.*dot(n,inside);
      vec3 exitN=normalize(n+path*inside),outgoing=refract(inside,-exitN,1.49);
      vec3 refracted=surroundings(centre+exitN*.90,outgoing);
      vec3 reflected=surroundings(pointW+.005*n,reflect(incident,n));
      vec3 nearest=n+inside*clamp(-dot(n,inside),0.,path);
      float radius=length(nearest);
      vec3 flow=nearest*vec3(.24,.31,.27)+vec3(.51,hour*.003,.23);
      float vap=texture(haze,flow).g*.59+texture(haze,flow*2.39+.14).g*.26+texture(haze,flow*5.3).r*.15;
      float silk=smoothstep(.45,.73,vap)*exp(-radius*radius*2.7);
      vec3 c=refracted*exp(-path*vec3(.83,.26,.19));
      c+=vec3(.055,.31,.37)*(.27+silk*.85);
      c+=vec3(.68,1.67,1.66)*exp(-radius*radius*26.)*(.94+.12*sin(hour*.86));
      float F=.068+.91*pow(1.-clamp(dot(-incident,n),0.,1.),4.0);
      c=mix(c,reflected,F);
      vec3 h=normalize(normalize(vec3(-.79,.71,.38))-incident);
      c+=vec3(3.0,2.65,1.91)*pow(max(0.,dot(n,h)),310.);
      radiance=vec4(c,1.);
    }`
});
holy.material=orreryGlass;glassBall.dispose();
M.gold.metalness=.78;M.gold.roughness=.235;
M.brass.metalness=.59;M.brass.roughness=.37;
ticking.push(()=>{
  armillaryRigs.forEach((g,i)=>{g.updateWorldMatrix(true,false);glassUniforms.ringInverse.value[i].copy(g.matrixWorld).invert();});
});
function photographOrrery(){
  crossing.updateWorldMatrix(true,false);
  const eye=glassUniforms.centre.value.copy(V(0,orbHeight,0)).applyMatrix4(crossing.matrixWorld);
  const excluded=[];
  scene.traverse(o=>{
    if(o.material===orreryGlass||(o.isSprite&&o.getWorldPosition(V()).distanceTo(eye)<3.9)){excluded.push(o);o.visible=false;}
  });
  for(const g of armillaryRigs){g.visible=false;excluded.push(g);}
  const probe=new T.PerspectiveCamera(90,1,.10,1500),dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const up=[[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]];
  const w=skyBuffer.width,h=skyBuffer.height;skyBuffer.setSize(256,256);
  backdrop.material.uniforms.grid.value.set(256,256);
  for(let i=0;i<6;i++){
    probe.position.copy(eye);probe.up.set(...up[i]);probe.lookAt(eye.clone().add(V(...dirs[i])));probe.updateMatrixWorld();
    setSkyCamera(probe);
    renderer.setRenderTarget(skyBuffer);renderer.render(skyPass,flatCam);
    renderer.setRenderTarget(probeMap,i);renderer.render(scene,probe);
  }
  renderer.setRenderTarget(null);skyBuffer.setSize(w,h);skyLast=-1000;
  for(const o of excluded)o.visible=true;
}
