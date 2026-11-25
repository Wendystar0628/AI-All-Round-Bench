'use strict';

// Linear-light color, depth and a half-resolution contact-shadow pass.
const worldBuffer=new T.WebGLRenderTarget(2,2,{
  type:T.HalfFloatType,format:T.RGBAFormat,depthBuffer:true,stencilBuffer:false,
  minFilter:T.LinearFilter,magFilter:T.LinearFilter
});
worldBuffer.depthTexture=new T.DepthTexture(2,2,T.UnsignedIntType);
const contactBuffer=new T.WebGLRenderTarget(2,2,{depthBuffer:false,stencilBuffer:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
const postScene=new T.Scene(),contactScene=new T.Scene();
const screenVert='varying vec2 screenUv;void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const postUniforms={
  beauty:{value:worldBuffer.texture},depths:{value:worldBuffer.depthTexture},contact:{value:contactBuffer.texture},
  vapour:{value:skyBuffer.texture},invP:{value:camera.projectionMatrixInverse},eyeMatrix:{value:camera.matrixWorld},
  px:{value:new T.Vector2(1,1)},sampleGrid:{value:new T.Vector2(1,1)},hour:timeUniform,
  lampOrigin:{value:V()},lampDirection:{value:V()}
};
const cameraRead=`
  varying vec2 screenUv; uniform sampler2D depths; uniform mat4 invP;uniform vec2 px;
  float zAt(vec2 uv){
    ivec2 size=textureSize(depths,0);
    ivec2 address=clamp(ivec2(floor(uv*vec2(size))),ivec2(0),size-ivec2(1));
    return texelFetch(depths,address,0).r;
  }
  vec3 getView(vec2 uv){float d=zAt(uv);vec4 h=invP*vec4(uv*2.-1.,d*2.-1.,1.);return h.xyz/h.w;}
`;
const contactPass=new T.ShaderMaterial({uniforms:postUniforms,vertexShader:screenVert,depthTest:false,depthWrite:false,
  fragmentShader:cameraRead+`
    uniform vec2 sampleGrid;
    int depthUnits(ivec2 cell,ivec2 size){
      float depth=texelFetch(depths,clamp(cell,ivec2(0),size-ivec2(1)),0).r;
      vec4 point=invP*vec4(0.,0.,2.*depth-1.,1.);
      return int(floor(-point.z/point.w*128.+.5));
    }
    void main(){
      ivec2 size=textureSize(depths,0),pixel=ivec2(gl_FragCoord.xy);
      ivec2 centre=ivec2((vec2(pixel)+.5)*vec2(size)/sampleGrid);
      int depth=depthUnits(centre,size);
      if(depth>56320){gl_FragColor=vec4(1.);return;}
      int reach=clamp(95+depth/116,90,316);
      int radius=clamp(int(float(size.y)*1.744*float(reach)/float(max(depth,1))+.5),2,136);
      ivec2 kernel[8]=ivec2[8](ivec2(8,2),ivec2(-4,15),ivec2(-21,6),ivec2(12,-26),
        ivec2(29,18),ivec2(-33,24),ivec2(-21,-38),ivec2(42,-20));
      int sum=0;
      // Opposed taps cancel the depth gradient of a flat sloping surface.
      for(int i=0;i<8;i++){
        ivec2 offset=kernel[i];
        if((pixel.x&1)==0)offset=offset.yx;
        if((pixel.y&1)==0)offset.x=-offset.x;
        offset=(offset*radius)/48;
        int a=depth-depthUnits(centre+offset,size),b=depth-depthUnits(centre-offset,size);
        if(abs(a)>2*reach)a=0;
        if(abs(b)>2*reach)b=0;
        int concavity=max(0,a+b-5);
        sum+=clamp(concavity*160/reach,0,100);
      }
      float shade=float(clamp(255-sum/7,144,255))/255.;
      gl_FragColor=vec4(vec3(shade),1.);
    }`});
contactScene.add(new T.Mesh(plane,contactPass));
const finishPass=new T.ShaderMaterial({uniforms:postUniforms,vertexShader:screenVert,depthTest:false,depthWrite:false,toneMapped:false,
  fragmentShader:cameraRead+`
  uniform sampler2D beauty,contact,vapour; uniform mat4 eyeMatrix;uniform float hour;
  uniform vec3 lampOrigin,lampDirection;
  float shaft(vec3 eye,vec3 ray,float depth,vec3 foot,float width){
    vec3 sunward=normalize(vec3(-.73,1.,.26));vec3 w=eye-foot;float a=dot(ray,sunward);
    float t=(a*dot(w,sunward)-dot(w,ray))/max(.0001,1.-a*a);
    float s=dot(w,sunward)+a*t;if(t<0.||s<0.||s>185.)return 0.;
    vec3 closest=w+ray*t-sunward*s;float r=width*(1.+s*.002);
    float mask=exp(-dot(closest,closest)/(r*r));
    return mask*smoothstep(-r,r,depth-t)*smoothstep(0.,17.,s)*(.80+.20*sin(s*.035+hour*.044));
  }
  void main(){
    vec2 pixel=floor(gl_FragCoord.xy)+.5,uv=pixel*px;
    vec3 P=getView(uv);float dist=length(P);
    vec3 c=texelFetch(beauty,ivec2(pixel),0).rgb;
    float ao=textureLod(contact,uv,0.).r;
    ao=.52*ao+.12*(textureLod(contact,uv+vec2(2.1*px.x,0.),0.).r+textureLod(contact,uv-vec2(2.1*px.x,0.),0.).r+textureLod(contact,uv+vec2(0.,2.1*px.y),0.).r+textureLod(contact,uv-vec2(0.,2.1*px.y),0.).r);
    if(P.z> -1000.)c*=vec3(ao,ao*.99+.01,ao*.91+.09);
    c=max(c*.89,vec3(0.));
    c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
    c=pow(clamp(c,0.,1.),vec3(.454545));
    vec4 air=textureLod(vapour,uv,0.);
    vec3 ray=normalize((eyeMatrix*vec4(P,0.)).xyz),eye=eyeMatrix[3].xyz;
    float aerialDepth=dist;
    if(P.z< -1000.){
      float d=min(min(zAt(uv+vec2(px.x,0.)),zAt(uv-vec2(px.x,0.))),min(zAt(uv+vec2(0.,px.y)),zAt(uv-vec2(0.,px.y))));
      vec4 adj=invP*vec4(uv*2.-1.,2.*d-1.,1.);aerialDepth=length(adj.xyz/adj.w);
    }
    if(aerialDepth<1200.){
      float haze=smoothstep(108.,414.,aerialDepth)*.866;
      c=mix(c,mix(air.rgb,vec3(.79,.845,.86),.29),haze);
      c=mix(c,air.rgb,smoothstep(-5.5,9.5,aerialDepth-air.a*1600.));
    }
    float scatter=shaft(eye,ray,dist,vec3(-28.5,-40.,-8.),2.3)*.139;
    scatter+=shaft(eye,ray,dist,vec3(-18.8,-38.5,-7.),4.8)*.086;
    scatter+=shaft(eye,ray,dist,vec3(18.8,-44.5,3.),5.1)*.136;
    scatter+=shaft(eye,ray,dist,vec3(31.4,-43.,-8.6),1.65)*.083;
    c=mix(c,vec3(1.,.921,.743),scatter);
    vec3 toSurface=eye+ray*min(dist,air.a*1600.)-lampOrigin;
    float axial=dot(toSurface,lampDirection);
    if(axial>0.&&axial<68.){
      vec3 radial=toSurface-axial*lampDirection;
      float width=.19+axial*.064;
      float spot=exp(-2.2*dot(radial,radial)/(width*width))*(1.-smoothstep(46.,68.,axial));
      c=mix(c,vec3(1.,.886,.627),spot*.31);
    }
    float edge=dot(uv-.5,uv-.5);
    c*=1.023-.119*edge;
    uvec2 cell=uvec2(pixel);
    uint hash=cell.x*1664525u+cell.y*1013904223u;
    hash=(hash^(hash>>16u))*2246822519u;
    float grain=float(hash&1023u)/1023.-.5;
    gl_FragColor=vec4(c+grain*.0037,1.);
  }`});
postScene.add(new T.Mesh(plane,finishPass));
// The atmosphere already has display-referred colors. Lift it back into the
// same linear-light space used by geometry before transparent mist is blended.
backdrop.material.uniforms.grid={value:new T.Vector2(1,1)};
backdrop.material.fragmentShader=`
  uniform vec2 grid;uniform sampler2D sky;
  void main(){
    vec3 y=pow(clamp(textureLod(sky,(floor(gl_FragCoord.xy)+.5)/grid,0.).rgb,0.,.992),vec3(2.2));
    vec3 a=2.51-2.43*y,b=.03-.59*y;
    vec3 c=(-b+sqrt(b*b+4.*a*.14*y))/(2.*a);
    gl_FragColor=vec4(c/.89,1.);
  }`;
scene.fog=null;
function resizeFilm(w,h) {
  const sz=renderer.getDrawingBufferSize(new T.Vector2());
  worldBuffer.samples=sz.x*sz.y>5900000?0:Math.min(4,renderer.capabilities.maxSamples);
  worldBuffer.setSize(sz.x,sz.y);contactBuffer.setSize(Math.round(sz.x*.52),Math.round(sz.y*.52));
  postUniforms.px.value.set(1/sz.x,1/sz.y);
  postUniforms.sampleGrid.value.set(contactBuffer.width,contactBuffer.height);
}
function composite(){
  backdrop.material.uniforms.grid.value.set(worldBuffer.width,worldBuffer.height);
  beam.getWorldPosition(postUniforms.lampOrigin.value);
  beam.getWorldDirection(postUniforms.lampDirection.value);
  renderer.setRenderTarget(worldBuffer);renderer.render(scene,camera);
  renderer.setRenderTarget(contactBuffer);renderer.render(contactScene,flatCam);
  renderer.setRenderTarget(null);renderer.render(postScene,flatCam);
}
