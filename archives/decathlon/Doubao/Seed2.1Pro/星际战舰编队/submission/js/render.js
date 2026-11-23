/* WebGL2 voxel renderer */
var R = (function(){
  var gl, canvas;
  var voxelProgram, glassProgram;
  var cubeVAO;
  var meshes=[];
  var nextMeshId=1;
  var viewMatrix, projMatrix, cameraPos;
  var frustumPlanes=[];
  var cubeVb=null;
  var MAX_LIGHTS=24;
  var stride=60; // 15 floats: off3 data4 col3 glow3 ao1 scaleMatEmi? see below

  // instance layout (15 floats, 60 bytes):
  // 0-2 offset, 3 scale, 4 mat, 5 emis, 6 padAO, 7-9 color, 10-12 glow, 13 ao, 14 pad
  var PAL = {
    hull:[0.315,0.40,0.52],
    hull2:[0.225,0.29,0.40],
    dark:[0.055,0.075,0.115],
    trim:[0.47,0.52,0.60],
    accent:[0.25,0.95,1.0],
    accentDim:[0.08,0.30,0.40],
    accent2:[1.0,0.55,0.18],
    glowr:[1.0,0.28,0.34],
    armorLight:[0.39,0.47,0.58],
    innerDark:[0.03,0.05,0.09],
    rock:[0.32,0.275,0.255],
    rockDark:[0.165,0.14,0.13],
    rockLight:[0.47,0.42,0.38],
    rockCrack:[0.95,0.55,0.28],
    interiorFloor:[0.20,0.245,0.31],
    interiorDark:[0.045,0.06,0.09],
    glass:[0.18,0.7,0.85],
    white:[0.9,0.96,1.0]
  };

  function showError(msg){
    var e=document.getElementById('err');
    if(e){e.style.display='block';e.textContent+=msg+'\n';}
    console.error(msg);
  }

  function init(cv){
    canvas=cv;
    gl=cv.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
    if(!gl){showError('WebGL2 not available');return null;}
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    var s=0.5;
    cubeVb=gl.createBuffer();
    var verts=new Float32Array([
      -s,-s, s, 0,0,1,  s,-s, s, 0,0,1,  s, s, s, 0,0,1,
      -s,-s, s, 0,0,1,  s, s, s, 0,0,1, -s, s, s, 0,0,1,
      s,-s,-s, 0,0,-1, -s,-s,-s, 0,0,-1, -s, s,-s, 0,0,-1,
      s,-s,-s, 0,0,-1, -s, s,-s, 0,0,-1,  s, s,-s, 0,0,-1,
      s,-s, s, 1,0,0,  s,-s,-s, 1,0,0,  s, s,-s, 1,0,0,
      s,-s, s, 1,0,0,  s, s,-s, 1,0,0,  s, s, s, 1,0,0,
      -s,-s,-s, -1,0,0, -s,-s, s, -1,0,0, -s, s, s, -1,0,0,
      -s,-s,-s, -1,0,0, -s, s, s, -1,0,0, -s, s,-s, -1,0,0,
      -s, s, s, 0,1,0,  s, s, s, 0,1,0,  s, s,-s, 0,1,0,
      -s, s, s, 0,1,0,  s, s,-s, 0,1,0, -s, s,-s, 0,1,0,
      -s,-s,-s, 0,-1,0, s,-s,-s, 0,-1,0, s,-s, s, 0,-1,0,
      -s,-s,-s, 0,-1,0, s,-s, s, 0,-1,0, -s, s, s, 0,-1,0
    ]);
    cubeVAO=gl.createVertexArray();
    gl.bindVertexArray(cubeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,cubeVb);
    gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.bindVertexArray(null);

    voxelProgram=createProgram(VOXEL_VS,VOXEL_FS);
    glassProgram=createProgram(VOXEL_VS,GLASS_FS);
    instVAO=gl.createVertexArray();
    return gl;
  }
  var instVAO;

  var VOXEL_VS=`#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec3 iOffset;
  layout(location=3) in vec4 iData;
  layout(location=4) in vec3 iColor;
  layout(location=5) in vec4 iGlowAo;
  uniform mat4 uView,uProj,uModel;
  out vec3 vNormal;
  out vec3 vWorld;
  out vec3 vColor;
  out vec3 vGlow;
  out float vMat;
  out float vEmis;
  out float vAo;
  void main(){
    vec3 wp=(uModel*vec4(iOffset+aPos*iData.x,1.0)).xyz;
    vWorld=wp;
    vNormal=mat3(uModel)*aNormal;
    vColor=iColor;
    vGlow=iGlowAo.rgb;
    vMat=iData.y;
    vEmis=iData.z;
    vAo=iGlowAo.a;
    gl_Position=uProj*uView*vec4(wp,1.0);
  }`;
  var VOXEL_FS=`#version 300 es
  precision highp float;
  in vec3 vNormal;in vec3 vWorld;in vec3 vColor;in vec3 vGlow;in float vMat;in float vEmis;in float vAo;
  uniform vec3 uCamPos;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec4 uPointPos[${MAX_LIGHTS}];
  uniform vec4 uPointColor[${MAX_LIGHTS}];
  uniform int uPointCount;
  out vec4 frag;
  void main(){
    vec3 N=normalize(vNormal);
    vec3 L=normalize(uLightDir);
    vec3 V=normalize(uCamPos-vWorld);
    float ndl=max(dot(N,L),0.0);
    float wrap=clamp(dot(N,L)*0.5+0.5,0.0,1.0);
    vec3 base=vColor;
    float metal=step(1.5,vMat);
    float darkm=step(2.5,vMat)*(1.0-step(3.5,vMat));
    vec3 col=base*(uAmbient*(0.5+0.5*wrap)*(1.0-0.55*darkm)
                  +uLightColor*(0.32*wrap+0.85*ndl)*(1.0-0.7*darkm));
    col+=base*pow(1.0-max(dot(N,V),0.0),3.0)*(0.07+0.10*metal);
    vec3 H=normalize(L+V);
    col+=uLightColor*pow(max(dot(N,H),0.0),22.0)*(0.12+0.4*metal);
    // per-face AO hint baked
    col*=vAo;
    // emissive
    col+=vGlow*vEmis;
    for(int i=0;i<${MAX_LIGHTS};i++){
      if(i>=uPointCount)break;
      vec3 d=uPointPos[i].xyz-vWorld;
      float dist=length(d);
      float att=uPointPos[i].w/(1.0+0.10*dist+0.009*dist*dist);
      att*=smoothstep(uPointColor[i].w,0.0,dist);
      col+=(base*0.9+vGlow*0.5)*uPointColor[i].rgb*att;
    }
    float distv=length(uCamPos-vWorld);
    float fog=1.0-exp(-uFogDensity*uFogDensity*distv*distv);
    col=mix(col,uFogColor,clamp(fog,0.0,1.0));
    frag=vec4(col,1.0);
  }`;
  var GLASS_FS=`#version 300 es
  precision highp float;
  in vec3 vNormal;in vec3 vWorld;in vec3 vColor;in vec3 vGlow;in float vMat;in float vEmis;in float vAo;
  uniform vec3 uCamPos,uLightDir,uLightColor,uAmbient,uFogColor;uniform float uFogDensity;
  out vec4 frag;
  void main(){
    vec3 N=normalize(vNormal);vec3 V=normalize(uCamPos-vWorld);
    float fres=pow(1.0-max(dot(N,V),0.0),2.2);
    vec3 col=vColor*0.22+vGlow*0.55+uAmbient*0.35;
    col+=uLightColor*pow(max(dot(N,normalize(uLightDir)),0.0),2.0)*0.25;
    float distv=length(uCamPos-vWorld);
    float fog=1.0-exp(-uFogDensity*uFogDensity*distv*distv);
    col=mix(col,uFogColor,clamp(fog,0.0,1.0));
    frag=vec4(col,0.09+fres*0.33);
  }`;

  function compile(type,src){
    var sh=gl.createShader(type);
    gl.shaderSource(sh,src);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))showError(gl.getShaderInfoLog(sh));
    return sh;
  }
  function createProgram(vs,fs){
    var p=gl.createProgram();
    gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));
    gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))showError(gl.getProgramInfoLog(p));
    return p;
  }
  function uloc(prog,name){return gl.getUniformLocation(prog,name);}

  function Collector(){this.arr=[];this._n=0;}
  // o: {scale, mat: 0 hull,1 trim,2 dark,3 glass,4 rock, emis, glow:[rgb], ao}
  Collector.prototype.add=function(x,y,z,color,o){
    o=o||{};
    var glow=o.glow?o.glow:color;
    var a=this.arr;
    a.push(x,y,z, o.scale!==undefined?o.scale:0.94, o.mat||0, o.emis||0,0,
      color[0],color[1],color[2],
      glow[0],glow[1],glow[2], o.ao!==undefined?o.ao:1,0);
    this._n++;
  };
  Collector.prototype.addGlow=function(x,y,z,color,intensity,o){
    o=o||{};o.glow=color;o.emis=intensity!==undefined?intensity:1.5;
    if(o.mat===undefined)o.mat=1;
    this.add(x,y,z,color,o);
  };
  Collector.prototype.count=function(){return this._n;};

  function Mesh(collector,transparent){
    this.count=collector&&collector.count?collector.count():(collector&&collector._n?collector._n:0);
    this.visible=true;
    this.transparent=!!transparent;
    this.matrix=Mat4.identity();
    this.bounds={min:[0,0,0],max:[0,0,0],center:[0,0,0],rad:0};
    if(this.count>0&&collector.arr&&collector.arr.length){
      var buf=new Float32Array(collector.arr);
      var minx=1e30,miny=1e30,minz=1e30,maxx=-1e30,maxy=-1e30,maxz=-1e30;
      for(var i=0;i<this.count;i++){
        var x=buf[i*15],y=buf[i*15+1],z=buf[i*15+2];
        if(x<minx)minx=x;if(y<miny)miny=y;if(z<minz)minz=z;
        if(x>maxx)maxx=x;if(y>maxy)maxy=y;if(z>maxz)maxz=z;
      }
      this.bounds={min:[minx,miny,minz],max:[maxx,maxy,maxz],
        center:[(minx+maxx)/2,(miny+maxy)/2,(minz+maxz)/2],
        rad:Math.hypot(maxx-minx,maxy-miny,maxz-minz)/2+2};
      this.vbo=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER,buf,gl.STATIC_DRAW);
    }
    meshes.push(this);
  }
  Mesh.prototype.setTRS=function(pos,rot,scale){this.matrix=Mat4.trs(pos||[0,0,0],rot||[0,0,0],scale||1);};
  Mesh.prototype.setMatrix=function(m){this.matrix=m;};
  Mesh.prototype.dispose=function(){if(this.vbo)gl.deleteBuffer(this.vbo);var i=meshes.indexOf(this);if(i>=0)meshes.splice(i,1);};

  function makeMesh(collector,transparent){return new Mesh(collector,transparent);}
  function destroyMesh(m){m.dispose();}
  function meshFromVbo(src){
    var m=new Mesh({arr:[],_n:0},src.transparent);
    m.count=src.count;m.vbo=src.vbo;m.bounds=src.bounds;
    return m;
  }
  function clearAll(){
    for(var i=0;i<meshes.length;i++){
      // vbos are recreated on rebuild; deleting here is safe (shared protos go too)
      if(meshes[i].vbo)gl.deleteBuffer(meshes[i].vbo);
    }
    meshes.length=0;
  }

  function setCamera(view,proj,pos){viewMatrix=view;projMatrix=proj;cameraPos=pos;extractFrustum();}
  function extractFrustum(){
    var vp=Mat4.multiply(projMatrix,viewMatrix);
    function pl(a,b,c,d){var n=Math.hypot(a,b,c)||1;return [a/n,b/n,c/n,d/n];}
    frustumPlanes=[
      pl(vp[3]+vp[0],vp[7]+vp[4],vp[11]+vp[8],vp[15]+vp[12]),
      pl(vp[3]-vp[0],vp[7]-vp[4],vp[11]-vp[8],vp[15]-vp[12]),
      pl(vp[3]+vp[1],vp[7]+vp[5],vp[11]+vp[9],vp[15]+vp[13]),
      pl(vp[3]-vp[1],vp[7]-vp[5],vp[11]-vp[9],vp[15]-vp[13]),
      pl(vp[3]+vp[2],vp[7]+vp[6],vp[11]+vp[10],vp[15]+vp[14]),
      pl(vp[3]-vp[2],vp[7]-vp[6],vp[11]-vp[10],vp[15]-vp[14])
    ];
  }
  function sphereVisible(center,rad){
    for(var i=0;i<6;i++){var p=frustumPlanes[i];
      if(p[0]*center[0]+p[1]*center[1]+p[2]*center[2]+p[3]<-rad)return false;}
    return true;
  }

  var sceneLights=[];
  function setLights(lights){sceneLights=lights||[];}

  function drawMesh(mesh){
    if(!mesh.visible||mesh.count===0)return;
    var c=Mat4.transformPoint(mesh.matrix,mesh.bounds.center);
    var sc=Math.max(Math.hypot(mesh.matrix[0],mesh.matrix[1],mesh.matrix[2]),
                    Math.hypot(mesh.matrix[4],mesh.matrix[5],mesh.matrix[6]),
                    Math.hypot(mesh.matrix[8],mesh.matrix[9],mesh.matrix[10]));
    if(!sphereVisible(c,mesh.bounds.rad*sc))return;
    var pr=mesh.transparent?glassProgram:voxelProgram;
    gl.useProgram(pr);
    gl.uniformMatrix4fv(uloc(pr,'uView'),false,viewMatrix);
    gl.uniformMatrix4fv(uloc(pr,'uProj'),false,projMatrix);
    gl.uniformMatrix4fv(uloc(pr,'uModel'),false,mesh.matrix);
    gl.uniform3fv(uloc(pr,'uCamPos'),cameraPos);
    gl.uniform3f(uloc(pr,'uLightDir'),state.lightDir[0],state.lightDir[1],state.lightDir[2]);
    gl.uniform3fv(uloc(pr,'uLightColor'),state.lightColor);
    gl.uniform3fv(uloc(pr,'uAmbient'),state.ambient);
    gl.uniform3fv(uloc(pr,'uFogColor'),state.fogColor);
    gl.uniform1f(uloc(pr,'uFogDensity'),state.fogDensity);
    var upl=uloc(pr,'uPointCount');
    if(upl){
      var n=Math.min(sceneLights.length,MAX_LIGHTS);
      var pp=new Float32Array(MAX_LIGHTS*4),pc=new Float32Array(MAX_LIGHTS*4);
      for(var i=0;i<n;i++){var L=sceneLights[i];
        pp[i*4]=L.pos[0];pp[i*4+1]=L.pos[1];pp[i*4+2]=L.pos[2];pp[i*4+3]=L.intensity;
        pc[i*4]=L.color[0];pc[i*4+1]=L.color[1];pc[i*4+2]=L.color[2];pc[i*4+3]=L.range;}
      gl.uniform1i(upl,n);
      gl.uniform4fv(uloc(pr,'uPointPos'),pp);
      gl.uniform4fv(uloc(pr,'uPointColor'),pc);
    }
    gl.bindVertexArray(instVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,cubeVb);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.vertexAttribDivisor(0,0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.vertexAttribDivisor(1,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vbo);
    setupIA(2,3,stride,0);setupIA(3,4,stride,12);setupIA(4,3,stride,28);setupIA(5,4,stride,40);
    gl.drawArraysInstanced(gl.TRIANGLES,0,36,mesh.count);
    gl.bindVertexArray(null);
  }
  var vbGlobal=null;
  function setupIA(loc,size,strideBytes,off){
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,size,gl.FLOAT,false,strideBytes,off);
    gl.vertexAttribDivisor(loc,1);
  }

  function renderAll(){
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for(var i=0;i<meshes.length;i++)if(!meshes[i].transparent)drawMesh(meshes[i]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for(var i=0;i<meshes.length;i++)if(meshes[i].transparent)drawMesh(meshes[i]);
    gl.depthMask(true);
  }

  var state={
    lightDir:V3.norm(V3.c(-0.45,0.62,0.30)),
    lightColor:new Float32Array([1.08,1.0,0.92]),
    ambient:new Float32Array([0.13,0.16,0.24]),
    fogColor:new Float32Array([0.012,0.016,0.030]),
    fogDensity:0.00042,
    maxDPR:1.5
  };

  function resize(){
    var dpr=Math.min(window.devicePixelRatio||1,state.maxDPR);
    var w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,canvas.width,canvas.height);
  }

  function bindCubeVB(vb){vbGlobal=vb;}

  return {
    init,resize,makeMesh,destroyMesh,meshFromVbo,clearAll,setCamera,renderAll,setLights,
    Collector,state,PAL,showError,
    get gl(){return gl;},get canvas(){return canvas;},
    frustumCheck:sphereVisible,get cameraPos(){return cameraPos;},
    setCubeVB:bindCubeVB,
    getAspect:function(){return canvas.width/canvas.height;}
  };
})();
