'use strict';

// A shallow, sunlit cumulus layer sampled in world space. The sky is rendered
// separately so the stonework keeps full pixel resolution at every distance.
const cloudNoise=(()=>{
  const n=64,a=new Uint8Array(n*n*n*4);
  const cells=Array.from({length:512},()=>[rand(.14,.86),rand(.14,.86),rand(.14,.86)]);
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=((z*n+y)*n+x)*4;a[i]=Math.floor(rand(0,256));
    const X=x/8,Y=y/8,Z=z/8,bx=Math.floor(X),by=Math.floor(Y),bz=Math.floor(Z);
    let d=3;
    for(let k=-1;k<=1;k++)for(let j=-1;j<=1;j++)for(let h=-1;h<=1;h++){
      const q=cells[((bx+h+8)%8)+((by+j+8)%8)*8+((bz+k+8)%8)*64];
      const xx=bx+h+q[0]-X,yy=by+j+q[1]-Y,zz=bz+k+q[2]-Z;
      d=Math.min(d,xx*xx+yy*yy+zz*zz);
    }
    a[i+1]=255*clamp(1.-Math.sqrt(d)*.92,0,1);a[i+2]=a[i];a[i+3]=255;
  }
  const tex=new T.Data3DTexture(a,n,n,n);
  tex.format=T.RGBAFormat;tex.minFilter=tex.magFilter=T.LinearFilter;
  tex.wrapS=tex.wrapT=tex.wrapR=T.RepeatWrapping;tex.unpackAlignment=1;tex.needsUpdate=true;return tex;
})();
const bankField=(()=>{
  const nx=144,ny=60,nz=144,bytes=new Uint8Array(nx*ny*nz),keep=seed;seed=897132;
  const zones=[[-69,-20,-48,30,13,18],[62,-18,-53,30,14,19],[-12,-22,-84,30,10,20],[-105,-10,-115,40,15,22],[96,-8,-129,35,15,22],[-70,-29,11,24,12,19],[52,-31,8,28,11,15],
    [-36,-37,48,25,10,15],[35,-35,45,24,9,15],[-3,-43,21,30,10,15],[-18,-30,-6,17,7,11]];
  for(const [x,y,z,w,h,d] of zones){
    for(let j=0;j<21;j++){
      const a=rand(0,TAU),v=Math.sqrt(rand()),sz=rand(.32,.68);
      const cx=x+w*v*cos(a)*.90,cz=z+d*v*sin(a),cy=y+h*(1-v)*.45+rand(-.29,.32)*h;
      const rx=w*sz,rz=d*sz*rand(.89,1.41),ry=h*rand(.54,1.0);
      const x0=clamp(Math.floor((cx-rx+170)/340*nx),0,nx-1),x1=clamp(Math.ceil((cx+rx+170)/340*nx),0,nx-1);
      const z0=clamp(Math.floor((cz-rz+174)/294*nz),0,nz-1),z1=clamp(Math.ceil((cz+rz+174)/294*nz),0,nz-1);
      const y0=clamp(Math.floor((cy-ry+72)/95*ny),0,ny-1),y1=clamp(Math.ceil((cy+ry+72)/95*ny),0,ny-1);
      for(let zz=z0;zz<=z1;zz++)for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
        const qx=((xx+.5)*340/nx-170-cx)/rx,qy=((yy+.5)*95/ny-72-cy)/ry,qz=((zz+.5)*294/nz-174-cz)/rz;
        const idx=xx+nx*(yy+ny*zz);
        bytes[idx]=Math.max(bytes[idx],Math.max(0,1-Math.sqrt(qx*qx+qy*qy+qz*qz))*255);
      }
    }
  }
  seed=keep;const t=new T.Data3DTexture(bytes,nx,ny,nz);t.format=T.RedFormat;t.unpackAlignment=1;
  t.magFilter=t.minFilter=T.LinearFilter;t.needsUpdate=true;return t;
})();
const skyPass=new T.Scene(),flatCam=new T.Camera();
const skyBuffer=new T.WebGLRenderTarget(640,360,{type:T.HalfFloatType,depthBuffer:false,stencilBuffer:false,magFilter:T.LinearFilter,minFilter:T.LinearFilter});
const skyMat=new T.ShaderMaterial({
  glslVersion:T.GLSL3,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{rays:{value:null},basisX:{value:V()},basisY:{value:V()},basisZ:{value:V()},eye:{value:V()},uClock:timeUniform,
    volume:{value:cloudNoise},banks:{value:bankField},paper:{value:patina},heavens:{value:plates.heavens}},
  vertexShader:`out vec2 uvSky;void main(){uvSky=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`
  precision highp sampler3D;
  in vec2 uvSky;out vec4 outColor;
  uniform highp isampler2D rays;
  uniform ivec3 basisX,basisY,basisZ;uniform vec3 eye;uniform float uClock;
  uniform sampler3D volume,banks;uniform sampler2D paper,heavens;
  uint pixelHash(uvec2 p){
    uint h=p.x*1664525u+p.y*1013904223u;
    h=(h^(h>>16u))*2246822519u;
    return h^(h>>13u);
  }
  // Use fixed subtexel positions for the density integral at every frame rate.
  vec4 sampleField(sampler3D field, vec3 uv){
    vec3 grid=vec3(textureSize(field,0))*128.;
    return textureLod(field,floor(uv*grid+.5)/grid,0.);
  }
  vec4 samplePlate(sampler2D plate, vec2 uv){
    vec2 grid=vec2(textureSize(plate,0))*128.;
    return textureLod(plate,floor(uv*grid+.5)/grid,0.);
  }
  float n3(vec3 p){return sampleField(volume,p/64.).r;}
  float cumulus(vec3 p){
    p.x+=uClock*.073;p.z-=uClock*.035;
    float curve=dot(p.xz,p.xz)*.000073;
    vec3 q=p*vec3(.038,.046,.040);
    float broad=n3(vec3(q.x*.39,3.83,q.z*.39));
    float m=n3(q*.96+3.1);
    float globes=sampleField(volume,q*.139).g*15.5+sampleField(volume,q*.319+.41).g*6.8;
    float wisps=sampleField(volume,q*.677+.17).g*3.2+sampleField(volume,q*1.45+.63).g*1.35;
    float shelf=-65.5+(broad-.45)*43.+m*24.+globes+wisps;
    vec3 bend=vec3(n3(q*1.69+7.3),n3(q*1.37+18.1),n3(q*1.51+41.9))-.5;
    vec3 address=(p+bend*5.8+vec3(170.,72.,174.))/vec3(340.,95.,294.);
    float bank=sampleField(banks,clamp(address,0.,1.)).r;
    float billows=max(0.,bank-.142+(globes+wisps-14.)*.025+(m-.5)*.081)*3.55;
    float density=clamp(max((shelf-p.y-curve)*.215,billows*smoothstep(.003,.085,bank)),0.,1.);
    return floor(density*4096.+.5)/4096.;
  }
  vec3 atmosphere(vec3 d){
    float alt=max(d.y,0.);
    float left=clamp(.48-.51*d.x-.13*d.z,0.,1.);
    vec3 zen=mix(vec3(.30,.57,.70),vec3(.46,.68,.75),left);
    vec3 hor=mix(vec3(.83,.865,.862),vec3(1.,.859,.70),pow(left,2.));
    vec3 c=mix(hor,zen,1.-exp(-alt*3.8));
    c=mix(c,vec3(.75,.83,.86),clamp(-d.y,0.,1.)*.45);
    vec2 u=d.xz/(.087+max(d.y,0.));
    vec3 a=samplePlate(paper,u*.068+vec2(uClock*.000035,.19)).rgb;
    float high=samplePlate(paper,u*vec2(.023,.081)+a.r*.08).r;
    float cirrus=smoothstep(.44,.71,high*.63+a.r*.37)*smoothstep(-.06,.09,d.y);
    c=mix(c,vec3(1.,.946,.842),.62*cirrus);
    // Billowing banks on the far horizon have a separate, much larger scale.
    float az=atan(d.z,d.x);
    vec2 bankUv=vec2(az*.73,d.y*1.3);
    float clouds=samplePlate(paper,bankUv*.54+vec2(.12,.37)).r;
    float detail=samplePlate(paper,bankUv*2.9).r;
    float bank=clouds*.25+detail*.066-.115;
    float body=(bank-d.y)*11.;
    float layer=clamp(body+.02,0.,1.)*smoothstep(-.085,.008,d.y);
    vec3 bankCol=mix(vec3(.72,.76,.81),vec3(1.,.946,.84),clamp(1.-body*.81+detail*.29,0.,1.));
    c=mix(c,bankCol,layer*.80);
    float shaftWave=.5+.5*sin(az*43.+d.y*17.+.24*sin(az*86.));
    float shafts=pow(shaftWave,7.)*.047*left;
    c+=vec3(1.,.88,.63)*shafts*(1.-smoothstep(.06,.48,d.y));
    float lng=atan(d.x,-d.z)/6.2831853+.794;
    float lat=asin(clamp(d.y+.205,-.98,.998));
    vec3 photo=samplePlate(heavens,vec2(lng+.000014*uClock,clamp(lat*.94,.010,.999))).rgb;
    float lum=dot(photo,vec3(.25,.55,.20));
    photo=mix(vec3(lum),photo,.92)*vec3(.98,1.056,1.072);
    photo=mix(photo,vec3(1.,.87,.69),.047+.11*left);
    float haze=1.-smoothstep(-.065,.12,lat);
    c=mix(photo,c,.065+.57*haze);
    float angularOffset=(lng-.711)*7.2+lat*.33;
    float sunVeil=exp(-angularOffset*angularOffset);
    c+=sunVeil*vec3(.088,.061,.029);
    c+=pow(.5+.5*sin((lng+lat*.039)*237.),11.)*sunVeil*vec3(.035,.028,.015);
    return c;
  }
  void main(){
    ivec2 pixel=ivec2(gl_FragCoord.xy);
    ivec3 v=texelFetch(rays,pixel,0).xyz;
    ivec3 rayDirection=(basisX*v.x+basisY*v.y+basisZ*v.z)/16384;
    vec3 rd=vec3(rayDirection)/16384.;
    vec3 sky=atmosphere(rd);
    float cloudDepth=1600.;
    if(rd.y<.014 || eye.y < 19.){
      // Distance is represented in 1/128 world units. A coarse step and its
      // refinement return to exactly the same cell regardless of earlier frames.
      ivec3 origin=ivec3(floor(eye*128.+.5));
      int march=origin.y>2432 ? max(0,((2432-origin.y)*16384)/min(rayDirection.y,-1)):0;
      int jitter=int(pixelHash(uvec2(pixel))&255u);
      march+=jitter*269/256;
      int refineEnd=-1,previous=128,transmission=65535;
      vec3 sum=vec3(0.);float depthMoment=0.;
      vec3 L=normalize(vec3(-.88,.50,.29));
      for(int i=0;i<112;i++){
        if(transmission<786||march>125440)break;
        vec3 p=vec3(origin+rayDirection*march/16384)/128.;
        float dist=float(march)/128.;
        float den=cumulus(p);
        if(den>.003 && previous>403 && march>refineEnd){
          refineEnd=march+2*previous;march-=previous*19/20;previous=128;continue;
        }
        int stride=den>.001||march<refineEnd ? clamp(63+march*31/10000,100,358) : clamp(282+march*21/1000,294,1664);
        stride=stride*(212+jitter*85/255)/256;
        if(den>.002){
          float shade1=cumulus(p+L*2.7),shade2=cumulus(p+L*8.9),shade3=cumulus(p+L*19.1);
          float lit=.11+.89*exp(-1.11*shade1-1.39*shade2-1.13*shade3);
          vec3 col=mix(vec3(.47,.565,.677),vec3(1.,.957,.862),lit);
          col+=vec3(.047,.036,.017)*(1.-shade2);
          float aerial=smoothstep(85.,630.,dist);
          col=mix(col,mix(sky,vec3(.85,.875,.89),.62),aerial*.86);
          int opacity=int(floor((1.-exp(-den*float(stride)*(.38/128.)))*4096.+.5));
          int absorbed=transmission*opacity/4096;
          float weight=float(absorbed)/65535.;
          depthMoment+=weight*dist;sum+=weight*col;
          transmission-=absorbed;
        }
        previous=stride;march+=stride;
      }
      float visibility=float(transmission)/65535.;
      sky=sum+visibility*sky;
      if(visibility<.94)cloudDepth=depthMoment/(1.-visibility);
    }
    float dust=float((pixelHash(uvec2(pixel))>>8u)&1023u)/1023.;
    outColor=vec4(sky+(dust-.5)*.0045,min(cloudDepth/1600.,1.));
  }`
});
const plane=new T.PlaneGeometry(2,2);
skyPass.add(new T.Mesh(plane,skyMat));
const backdrop=new T.Mesh(plane,new T.ShaderMaterial({
  uniforms:{sky:{value:skyBuffer.texture}},depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,1.,1.);}',
  fragmentShader:'varying vec2 v;uniform sampler2D sky;void main(){gl_FragColor=texture2D(sky,v);}'
}));
backdrop.frustumCulled=false;backdrop.renderOrder=-9999;scene.add(backdrop);
let skyLast=-1000,skyStamp=new T.Matrix4();
let rayGridKey='';
function setSkyCamera(cam){
  const w=skyBuffer.width,h=skyBuffer.height,key=[w,h,cam.aspect,cam.fov].join('/');
  if(key!==rayGridKey){
    const data=new Int16Array(w*h*4),tan=Math.tan(cam.fov*PI/360);
    const sx=new Float64Array(w);
    for(let x=0;x<w;x++)sx[x]=((x+.5)*2/w-1)*tan*cam.aspect;
    for(let y=0;y<h;y++){
      const sy=((y+.5)*2/h-1)*tan;
      for(let x=0;x<w;x++){
        const factor=16384/Math.sqrt(sx[x]*sx[x]+sy*sy+1),i=4*(y*w+x);
        data[i]=Math.round(sx[x]*factor);data[i+1]=Math.round(sy*factor);data[i+2]=Math.round(-factor);
      }
    }
    const grid=new T.DataTexture(data,w,h,T.RGBAIntegerFormat,T.ShortType);
    grid.internalFormat='RGBA16I';grid.minFilter=grid.magFilter=T.NearestFilter;
    grid.generateMipmaps=false;grid.needsUpdate=true;
    skyMat.uniforms.rays.value?.dispose();skyMat.uniforms.rays.value=grid;rayGridKey=key;
  }
  const m=cam.matrixWorld.elements,u=skyMat.uniforms;
  u.eye.value.copy(cam.position);
  [u.basisX,u.basisY,u.basisZ].forEach((axis,i)=>axis.value.set(
    Math.round(m[4*i]*16384),Math.round(m[4*i+1]*16384),Math.round(m[4*i+2]*16384)));
}
function drawSky(t,force=false) {
  camera.updateMatrixWorld();
  if(!force && Math.abs(t-skyLast)<.15 && skyStamp.equals(camera.matrixWorld))return;
  skyLast=t;skyStamp.copy(camera.matrixWorld);
  setSkyCamera(camera);
  renderer.setRenderTarget(skyBuffer);renderer.render(skyPass,flatCam);renderer.setRenderTarget(null);
}
function makeEnvironment(){
  const c=document.createElement('canvas');c.width=512;c.height=256;const cx=c.getContext('2d');
  const g=cx.createLinearGradient(0,0,0,256);
  for(const [p,s] of [[0,'#759dac'],[.38,'#bdd3da'],[.48,'#fff2d8'],[.57,'#bac7c5'],[.70,'#738486'],[1,'#665e55']])g.addColorStop(p,s);
  cx.fillStyle=g;cx.fillRect(0,0,512,256);
  const hl=cx.createRadialGradient(148,60,1,148,60,42);hl.addColorStop(0,'#fff7d2');hl.addColorStop(1,'#fff7d200');cx.fillStyle=hl;cx.fillRect(102,14,93,94);
  const m=new T.CanvasTexture(c);m.mapping=T.EquirectangularReflectionMapping;m.colorSpace=T.SRGBColorSpace;
  const pm=new T.PMREMGenerator(renderer);const environment=pm.fromEquirectangular(m);scene.environment=environment.texture;
  m.dispose();pm.dispose();
}
makeEnvironment();
const glows=[];
function softMap(star=false) {
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,.97)');
  g.addColorStop(.09,'rgba(255,255,255,.86)');g.addColorStop(.23,'rgba(255,255,255,.43)');g.addColorStop(.6,'rgba(255,255,255,.087)');g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  if(star){ctx.translate(64,64);ctx.fillStyle='rgba(255,255,255,.72)';for(let j=0;j<4;j++){ctx.rotate(PI/2);ctx.beginPath();ctx.moveTo(0,-60);ctx.lineTo(2,0);ctx.lineTo(-2,0);ctx.fill();}}
  return new T.CanvasTexture(c);
}
const glowMap=softMap(),starMap=softMap(true);
function aura(p,x,y,z,size,color,opacity=.5,star=false) {
  const s=new T.Sprite(new T.SpriteMaterial({map:star?starMap:glowMap,color,transparent:true,depthWrite:false,opacity,blending:T.AdditiveBlending}));
  p.add(s);s.position.set(x,y,z);s.scale.setScalar(size);glows.push(s);return s;
}
function fogPuff(p,x,y,z,w,h,opacity=.22,col=0xf0e8d5){
  const s=new T.Sprite(new T.SpriteMaterial({map:glowMap,color:col,transparent:true,depthWrite:false,opacity,fog:true}));
  p.add(s);s.position.set(x,y,z);s.scale.set(w,h,1);return s;
}
const waterUniforms={clock:timeUniform,grain:{value:patina}};
const fallMat=new T.ShaderMaterial({uniforms:waterUniforms,side:T.DoubleSide,transparent:true,depthWrite:false,
  vertexShader:`varying vec2 tex;varying vec3 at;uniform float clock;
  void main(){tex=uv;vec3 P=position;
    P.x+=uv.y*uv.y*.15*sin(7.*uv.y-clock*.63)+.033*sin(uv.x*17.+uv.y*32.-clock*1.78)*uv.y;
    P.z+=.07*uv.y*sin(uv.x*8.+uv.y*26.-clock*1.2);
    at=(modelMatrix*vec4(P,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(at,1.);}`,
  fragmentShader:`varying vec2 tex;varying vec3 at;uniform float clock;uniform sampler2D grain;
  void main(){vec2 uv=tex; float chord=texture2D(grain,vec2(uv.x*2.7+at.x*.017,uv.y*1.15-clock*.19)).r;
  float lace=texture2D(grain,vec2(uv.x*7.1+.13*sin(uv.y*26.-clock*.57),uv.y*1.9-clock*.56)).g;
  float edges=sin(uv.x*3.14159);float op=smoothstep(.02,.38,edges+(chord-.56)*1.7);
  op*=1.-smoothstep(.57,1.0,uv.y)*(1.-.22*chord);
  float froth=smoothstep(.36,.66,chord*.60+.40*lace);
  vec3 c=mix(vec3(.30,.68,.70),vec3(.94,.976,.933),froth);c=mix(c,vec3(1.,.97,.84),pow(1.-uv.y,14.)*.72);
  c+=vec3(.16,.19,.16)*smoothstep(.60,.72,lace)*froth;
  gl_FragColor=vec4(c,op*(.31+.65*froth));}`});
surface('water',0x40aaa6,'plain',.24,.28,{emissive:0x236567,emissiveIntensity:.20});
M.water.onBeforeCompile=s=>{
  s.uniforms.clock=timeUniform;s.uniforms.paper={value:patina};
  s.vertexShader='varying vec3 wpos;\n'+s.vertexShader.replace('#include <project_vertex>',`
    vec4 wp=vec4(transformed,1.);
    #ifdef USE_INSTANCING
    wp=instanceMatrix*wp;
    #endif
    wpos=(modelMatrix*wp).xyz;
    #include <project_vertex>`);
  s.fragmentShader='uniform float clock;uniform sampler2D paper;varying vec3 wpos;\n'+s.fragmentShader.replace('#include <color_fragment>',`
    #include <color_fragment>
    float ripple=texture2D(paper,wpos.xz*vec2(.6,.23)+vec2(.0,clock*.065)).g;
    float rings=sin(wpos.z*9.+ripple*13.-clock*2.3);
    diffuseColor.rgb*=.76+.45*ripple;
    diffuseColor.rgb+=vec3(.15,.23,.17)*smoothstep(.91,1.,rings)*smoothstep(.4,.65,ripple);`);
};
M.water.customProgramCacheKey=()=>'canal';
const waterFx=new T.Group();scene.add(waterFx);
const spraySources=[];
function cascade(x,y,z,w,drop,angle=0,reach=1.5,misty=false) {
  spraySources.push({x,y,z,w,drop,angle,reach});
  const p=group(waterFx,x,y,z,angle),ps=[],uv=[],ind=[];const nx=12,ny=30;
  const seedV=rand(0,8);
  for(let j=0;j<=ny;j++){const v=j/ny;
    for(let i=0;i<=nx;i++){
      const u=i/nx;
      const width=w*(1.-.09*sin(PI*v)+.20*v*v);
      ps.push((u-.5)*width+sin(v*11.+seedV)*w*.025*v,-drop*v,reach*(1.-Math.exp(-v*7.4))+.080*sin(u*23+seedV+v*4)+.10*v*sin(v*9+u*4));
      uv.push(u,v);const id=j*(nx+1)+i;if(i<nx&&j<ny)ind.push(id,id+nx+1,id+1,id+1,id+nx+1,id+nx+2);
    }
  }
  const o=mesh(p,rawGeo(ps,ind,null,uv),fallMat);o.castShadow=o.receiveShadow=false;
  if(misty)for(let i=0;i<9;i++) {
    const xx=rand(-w,w),dz=rand(-2,2),off=rand(0,12),sz=rand(3.2,7.6),yy=-drop+rand(-1.2,1.6);
    const sp=fogPuff(p,xx,yy,reach+dz,sz,sz*.59,rand(.13,.29));
    ticking.push(t=>{sp.position.x=xx+sin(t*.32+off)*1.1;sp.position.y=yy+sin(t*.53+off)*.56;});
  }
}
