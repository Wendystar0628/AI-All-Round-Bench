/* 铸帧 ForgeFrame · WebGL2 基础设施 */
"use strict";
(function(){
const FF=window.FF;
let gl=null, canvas=null;
const targets=[];
function init(cv){
  canvas=cv;
  gl=cv.getContext('webgl2',{antialias:true, alpha:false, premultipliedAlpha:false, preserveDrawingBuffer:true, powerPreference:'high-performance'});
  if(!gl){ alert('需要 WebGL2 支持'); return null; }
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0,0,0,1);
  return gl;
}
function compile(vsSrc,fsSrc,name){
  const mk=(type,src)=>{
    const s=gl.createShader(type);
    gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
      console.error('着色器编译失败 '+(name||''), gl.getShaderInfoLog(s), src);
      throw new Error('shader compile: '+gl.getShaderInfoLog(s));
    }
    return s;
  };
  const p=gl.createProgram();
  gl.attachShader(p,mk(gl.VERTEX_SHADER,vsSrc));
  gl.attachShader(p,mk(gl.FRAGMENT_SHADER,fsSrc));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
    console.error('程序链接失败 '+(name||''), gl.getProgramInfoLog(p));
    throw new Error('link: '+gl.getProgramInfoLog(p));
  }
  const uni={}, att={};
  const nu=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<nu;i++){ const inf=gl.getActiveUniform(p,i); uni[inf.name.replace('[0]','')]=gl.getUniformLocation(p,inf.name); }
  const na=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES);
  for(let i=0;i<na;i++){ const inf=gl.getActiveAttrib(p,i); att[inf.name]=gl.getAttribLocation(p,inf.name); }
  return {p,uni,att,name};
}
function target(w,h,opt){
  opt=opt||{};
  const t={w,h};
  t.fb=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,t.fb);
  t.tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t.tex);
  gl.texImage2D(gl.TEXTURE_2D,0,opt.float?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,opt.float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.tex,0);
  if(opt.depth){
    t.depth=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t.depth);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,t.depth,0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  t.resize=(nw,nh)=>{
    if(t.w===nw&&t.h===nh) return;
    t.w=nw; t.h=nh;
    gl.bindTexture(gl.TEXTURE_2D,t.tex);
    gl.texImage2D(gl.TEXTURE_2D,0,opt.float?gl.RGBA16F:gl.RGBA8,nw,nh,0,gl.RGBA,opt.float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
    if(t.depth){
      gl.bindTexture(gl.TEXTURE_2D,t.depth);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,nw,nh,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    }
  };
  targets.push(t);
  return t;
}
function bindTarget(t){
  gl.bindFramebuffer(gl.FRAMEBUFFER,t?t.fb:null);
  if(t) gl.viewport(0,0,t.w,t.h);
  else gl.viewport(0,0,canvas.width,canvas.height);
}
function clearTarget(t,r,g,b,a){
  bindTarget(t);
  gl.clearColor(r||0,g||0,b||0,a===undefined?0:a);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
}
let quadVAO=null, quadBuf=null;
function quad(){
  if(quadVAO) return quadVAO;
  quadVAO=gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  quadBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, 1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);
  gl.bindVertexArray(null);
  return quadVAO;
}
function drawQuad(prog){
  gl.bindVertexArray(quad());
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  gl.bindVertexArray(null);
}
function tex(unit,texObj){
  gl.activeTexture(gl.TEXTURE0+unit);
  gl.bindTexture(gl.TEXTURE_2D,texObj);
}
/* 动态 2D 顶点缓冲 */
function makeBuf2D(){
  const vao=gl.createVertexArray(), buf=gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);
  gl.bindVertexArray(null);
  return {vao,buf,count:0,
    set(arr){ gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.DYNAMIC_DRAW); this.count=arr.length/2; },
    draw(){ if(!this.count) return; gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES,0,this.count); gl.bindVertexArray(null); }};
}
/* 3D 网格缓冲 */
function makeMeshBuf(){
  const vao=gl.createVertexArray(), buf=gl.createBuffer(), ibuf=gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibuf);
  gl.bindVertexArray(null);
  return {vao,buf,ibuf,count:0,
    set(mesh){
      const n=mesh.pos.length/3;
      const data=new Float32Array(n*6);
      for(let i=0;i<n;i++){
        data[i*6]=mesh.pos[i*3]; data[i*6+1]=mesh.pos[i*3+1]; data[i*6+2]=mesh.pos[i*3+2];
        data[i*6+3]=mesh.nrm[i*3]||0; data[i*6+4]=mesh.nrm[i*3+1]||0; data[i*6+5]=mesh.nrm[i*3+2]||1;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,buf);
      gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(mesh.idx),gl.DYNAMIC_DRAW);
      this.count=mesh.idx.length;
    },
    draw(){ if(!this.count) return; gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_INT,0); gl.bindVertexArray(null); }};
}
FF.GL={init,compile,target,bindTarget,clearTarget,drawQuad,tex,makeBuf2D,makeMeshBuf,
  get gl(){return gl;}, get canvas(){return canvas;}};
})();
