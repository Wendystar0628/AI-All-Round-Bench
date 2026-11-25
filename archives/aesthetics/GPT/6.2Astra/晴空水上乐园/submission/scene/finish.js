'use strict';
// Screen-space contact shading in view-space metres. No temporal sampling or frame history.
const filmTarget=new T.WebGLRenderTarget(8,8,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false});
// A fixed spatial resolve also avoids driver-dependent half-float MSAA rounding.
filmTarget.samples=0;filmTarget.depthTexture=new T.DepthTexture(8,8,T.UnsignedIntType);
const filmScene=new T.Scene(),filmCamera=new T.Camera();
const filmMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{
 picture:{value:filmTarget.texture},depths:{value:filmTarget.depthTexture},invProjection:{value:camera.projectionMatrixInverse},pixel:{value:new T.Vector2(1/1920,1/1080)},lens:{value:1}
},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`
varying vec2 vUv;uniform sampler2D picture,depths;uniform mat4 invProjection;uniform vec2 pixel;uniform float lens;
vec3 eye(vec2 u){float z=texture2D(depths,u).r;vec4 v=invProjection*vec4(u*2.-1.,z*2.-1.,1.);return v.xyz/v.w;}
void main(){
 vec2 aa=pixel*.39;vec3 c=(texture2D(picture,vUv+aa).rgb+texture2D(picture,vUv-aa).rgb+texture2D(picture,vUv+vec2(aa.x,-aa.y)).rgb+texture2D(picture,vUv+vec2(-aa.x,aa.y)).rgb)*.25,p=eye(vUv);float depth=-p.z;
 if(depth<1150.){
 vec3 normal=normalize(cross(dFdx(p),dFdy(p)));float radius=clamp(depth*.021,.95,4.4);
 float pxrad=clamp(lens*radius/max(depth,1.),3.5,36.);float ao=0.;
 for(int i=0;i<18;i++){float f=(float(i)+.58)/18.;float a=float(i)*2.399963;vec2 o=vec2(cos(a),sin(a))*sqrt(f)*pxrad*pixel;
 vec3 q=eye(vUv+o)-p;float d=length(q);
 ao+=max(dot(q,normal)-.055*radius,0.)/(d+.0001)*(1.-smoothstep(.3*radius,1.4*radius,d));
 }
 float occ=clamp(ao*.145,0.,.47);c*=vec3(1.)-vec3(1.0,.86,.66)*occ;
 }
 // A gentle highlight shoulder keeps enamel, wet tile and clouds clean.
 c=max(c,vec3(0.));float lum=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(lum),c,1.085);
 c=max(c,vec3(0.));c*=mix(.95,1.04,smoothstep(.12,.87,lum));
 c=mix(c,vec3(1.)-exp(-c*1.6),smoothstep(1.,2.,lum)*.25);
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`});
// One full-screen primitive presents the spatially resolved frame without an internal edge.
const fullScreen=new T.BufferGeometry();
fullScreen.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
fullScreen.setAttribute('uv',new T.Float32BufferAttribute([0,0,2,0,0,2],2));
const screenTriangle=new T.Mesh(fullScreen,filmMaterial);screenTriangle.frustumCulled=false;filmScene.add(screenTriangle);
function resizeFilm(){const sz=renderer.getDrawingBufferSize(new T.Vector2());const factor=sz.x>=3000?1.25:1.5;sz.multiplyScalar(factor).floor();filmTarget.setSize(sz.x,sz.y);filmMaterial.uniforms.pixel.value.set(1/sz.x,1/sz.y);filmMaterial.uniforms.lens.value=.5*sz.y*camera.projectionMatrix.elements[5]}
function paintScene(){renderer.setRenderTarget(filmTarget);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(filmScene,filmCamera)}

