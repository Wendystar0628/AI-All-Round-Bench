/* effects: sky, camera-facing particles/streaks, beams, shields */
var FX = (function(){
  var gl;
  var skyProg, quadVAO;
  var partProg, partBuf, partVao, MAXP=140000, partData;
  var beamProg;
  var shieldProg;
  var sphereVAO, sphereIndexCount;
  var cubeVB=null;

  function init(cubeVertexBuffer){
    gl=R.gl; cubeVB=cubeVertexBuffer;
    skyProg=mkprog(SKY_VS,SKY_FS);
    partProg=mkprog(PART_VS,PART_FS);
    beamProg=mkprog(BEAM_VS,BEAM_FS);
    shieldProg=mkprog(SHIELD_VS,SHIELD_FS);
    quadVAO=gl.createVertexArray();gl.bindVertexArray(quadVAO);
    var qb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qb);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);

    // quad corners: x,y in [-1,1]
    var corners=new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]);
    // instance: pos3 size1 type1 color3 alpha1 stretch3 =12 floats
    partData=new Float32Array(MAXP*12);
    partVao=gl.createVertexArray();gl.bindVertexArray(partVao);
    var cb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,cb);
    gl.bufferData(gl.ARRAY_BUFFER,corners,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    partBuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,partBuf);
    gl.bufferData(gl.ARRAY_BUFFER,partData.byteLength,gl.DYNAMIC_DRAW);
    setup(1,3,0);setup(2,1,12);setup(3,1,16);setup(4,3,20);setup(5,1,32);setup(6,3,36);
    gl.bindVertexArray(null);

    cylBuf=gl.createBuffer();
    cylIBuf=gl.createBuffer();
    initCyl();
    makeSphere();
  }
  function setup(loc,size,off){
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,size,gl.FLOAT,false,48,off);
    gl.vertexAttribDivisor(loc,1);
  }

  function mkprog(vs,fs){
    function c(t,s){var sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))R.showError(gl.getShaderInfoLog(sh)+'\n'+s.split('\n').slice(0,6).join('\n'));return sh;}
    var p=gl.createProgram();
    gl.attachShader(p,c(gl.VERTEX_SHADER,vs));gl.attachShader(p,c(gl.FRAGMENT_SHADER,fs));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))R.showError(gl.getProgramInfoLog(p));
    return p;
  }
  function U(p,n){return gl.getUniformLocation(p,n);}

  /* ---------- sky ---------- */
  var SKY_VS=`#version 300 es
  layout(location=0) in vec2 a;
  out vec2 vNdc;
  void main(){vNdc=a;gl_Position=vec4(a,0.99999,1.0);}`;
  var SKY_FS=`#version 300 es
  precision highp float;
  in vec2 vNdc;
  out vec4 frag;
  uniform mat4 uInvViewProj;
  uniform vec3 uCam;
  uniform float uTime;
  uniform vec2 uRes;
  float hash(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float noise(vec3 x){
    vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
    float n000=hash(i);
    float n100=hash(i+vec3(1.0,0.0,0.0));
    float n010=hash(i+vec3(0.0,1.0,0.0));
    float n110=hash(i+vec3(1.0,1.0,0.0));
    float n001=hash(i+vec3(0.0,0.0,1.0));
    float n101=hash(i+vec3(1.0,0.0,1.0));
    float n011=hash(i+vec3(0.0,1.0,1.0));
    float n111=hash(i+vec3(1.0,1.0,1.0));
    return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
  }
  float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.13;a*=0.55;}return v;}
  void main(){
    vec4 far=uInvViewProj*vec4(vNdc,1.0,1.0);
    vec3 dir=normalize(far.xyz/far.w-uCam);
    float gy=dir.y*0.5+0.5;
    vec3 col=mix(vec3(0.007,0.010,0.021),vec3(0.020,0.027,0.050),gy);
    vec3 np=dir*2.3+vec3(3.1,1.7,0.0);
    float n1=fbm(np);
    float n2=fbm(np*1.7+vec3(10.0,2.0,5.0));
    col+=vec3(0.10,0.05,0.22)*smoothstep(0.45,0.92,n1)*0.9;
    col+=vec3(0.02,0.11,0.17)*smoothstep(0.5,0.95,n2)*0.75;
    col+=vec3(0.19,0.08,0.05)*smoothstep(0.62,1.0,fbm(np*0.7+vec3(40.0,6.0,2.0)))*0.55;
    vec3 pc=normalize(vec3(-0.72,0.20,-0.58));
    float pd=dot(dir,pc);
    float pr=0.33;
    if(pd>cos(pr)){
      vec3 q=normalize(dir-pc*pd);
      float lat=acos(clamp(pd,0.0,1.0))/pr;
      float bands=fbm(q*4.0+vec3(0.0,lat*3.0,0.7));
      vec3 surf=mix(vec3(0.30,0.17,0.11),vec3(0.56,0.41,0.29),bands);
      vec3 ldir=normalize(vec3(-0.45,0.62,0.35));
      surf*=0.40+0.75*max(dot(ldir,dir),0.05);
      float limb=smoothstep(cos(pr),cos(pr*0.965),pd);
      col=mix(col,surf,limb);
    }
    float rim=smoothstep(cos(pr*1.05),cos(pr),pd)-smoothstep(cos(pr),cos(pr*0.95),pd);
    col+=vec3(0.20,0.34,0.62)*rim*0.8;
    for(int L=0;L<3;L++){
      float sc=float(L)*110.0+80.0;
      vec3 sp=dir*sc;
      vec3 ip=floor(sp);
      float h=hash(ip);
      vec3 cid=vec3(hash(ip+vec3(1.3,0.0,0.0)),hash(ip+vec3(0.0,2.7,0.0)),hash(ip+vec3(0.0,0.0,4.1)));
      vec3 spd=sp-ip-cid;
      float d=length(spd);
      float th=0.055+0.04*float(L);
      float st=smoothstep(th,0.0,d)*step(0.966-float(L)*0.012,h);
      float tw=0.75+0.25*sin(uTime*2.0+h*40.0);
      vec3 scol=mix(vec3(0.72,0.82,1.0),vec3(1.0,0.9,0.75),h);
      col+=scol*st*tw*(0.55+0.45*float(L));
    }
    frag=vec4(col,1.0);
  }`;

  function drawSky(view,proj,time){
    var m=Mat4.multiply(proj,view);
    var inv=genericInverse(m);
    gl.useProgram(skyProg);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindVertexArray(quadVAO);
    gl.uniformMatrix4fv(U(skyProg,'uInvViewProj'),false,inv);
    gl.uniform3fv(U(skyProg,'uCam'),R.cameraPos);
    gl.uniform1f(U(skyProg,'uTime'),time);
    gl.uniform2f(U(skyProg,'uRes'),R.canvas.width,R.canvas.height);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
  }

  function genericInverse(m){
    var tmp=new Float32Array(32);
    for(var i=0;i<4;i++){
      for(var j=0;j<4;j++)tmp[i*8+j]=m[j*4+i];
      tmp[i*8+4+i]=1;
    }
    for(var col=0;col<4;col++){
      var piv=col;
      for(var r=col+1;r<4;r++)if(Math.abs(tmp[r*8+col])>Math.abs(tmp[piv*8+col]))piv=r;
      if(piv!==col)for(var k=0;k<8;k++){var t=tmp[col*8+k];tmp[col*8+k]=tmp[piv*8+k];tmp[piv*8+k]=t;}
      var pv=tmp[col*8+col];
      for(var k=0;k<8;k++)tmp[col*8+k]/=pv;
      for(var r=0;r<4;r++)if(r!==col){var f=tmp[r*8+col];for(var k=0;k<8;k++)tmp[r*8+k]-=f*tmp[col*8+k];}
    }
    var inv=new Float32Array(16);
    for(var i=0;i<4;i++)for(var j=0;j<4;j++)inv[j*4+i]=tmp[i*8+4+j];
    return inv;
  }

  /* ---------- particles (instanced camera-facing quads) ----------
     types: 0 glow,1 spark(stretch),2 flame,3 hard dot,4 smoke,5 tracer(stretch dir),6 ring */
  var PART_VS=`#version 300 es
  layout(location=0) in vec2 aCorner;
  layout(location=1) in vec3 iPos;
  layout(location=2) in float iSize;
  layout(location=3) in float iType;
  layout(location=4) in vec3 iColor;
  layout(location=5) in float iAlpha;
  layout(location=6) in vec3 iStretch;
  uniform mat4 uView,uProj;
  uniform vec3 uCamRight,uCamUp,uCamPos;
  out vec3 vCol;out float vAlpha;out float vType;out vec2 vUv;
  void main(){
    vUv=aCorner;
    vCol=iColor;vAlpha=iAlpha;vType=iType;
    vec3 right=uCamRight,up=uCamUp;
    float t=iType;
    vec3 center=iPos;
    float s=iSize;
    vec2 off=aCorner*s;
    if(t>0.5&&t<2.5){
      // stretch along iStretch in world space, projected
      vec3 sd=normalize(iStretch+vec3(0.0001,0.0,0.0));
      float L=s*2.2;
      center=iPos+sd*aCorner.y*L*0.5;
      off=aCorner*vec2(s*0.45,0.0);
    } else if(t>4.5&&t<5.5){
      vec3 sd=normalize(iStretch+vec3(0.0001,0.0,0.0));
      center=iPos+sd*aCorner.y*s*0.5;
      off=aCorner*vec2(s*0.12,0.0);
    } else if(t>5.5&&t<6.5){
      off=aCorner*s;
    }
    vec3 wp=center+right*off.x+up*off.y;
    gl_Position=uProj*uView*vec4(wp,1.0);
  }`;
  var PART_FS=`#version 300 es
  precision highp float;
  in vec3 vCol;in float vAlpha;in float vType;in vec2 vUv;
  out vec4 frag;
  void main(){
    vec2 uv=vUv;
    float r=length(uv);
    float a=0.0;
    if(vType<0.5){a=exp(-r*r*3.2);}
    else if(vType<1.5){a=pow(smoothstep(1.0,0.0,r),1.8);}
    else if(vType<2.5){
      float along=smoothstep(1.0,-1.0,uv.y)*smoothstep(-1.0,0.2,uv.y);
      a=exp(-abs(uv.x)*4.0)*along*0.9;
    }
    else if(vType<3.5){a=smoothstep(0.7,0.2,r);}
    else if(vType<4.5){a=smoothstep(1.0,0.15,r)*0.45;}
    else if(vType<5.5){
      a=smoothstep(0.6,0.0,abs(uv.x))*smoothstep(1.0,0.5,abs(uv.y));
    } else {
      a=smoothstep(1.0,0.7,r)*(1.0-smoothstep(0.0,0.9,r));
      a=smoothstep(1.0,0.85,r)*0.9;
    }
    frag=vec4(vCol,a*vAlpha);
  }`;

  var particles=[];
  function spawn(p){
    if(particles.length>=MAXP)particles.shift();
    particles.push({
      pos:p.pos?V3.copy(p.pos):V3.c(),
      vel:p.vel?V3.copy(p.vel):V3.c(),
      size:p.size||2,
      type:p.type||0,
      color:p.color||[1,1,1],
      alpha:p.alpha!==undefined?p.alpha:1,
      life:p.life||1,
      age:0,
      drag:p.drag!==undefined?p.drag:0.2,
      grow:p.grow||0,
      shrink:p.shrink||0,
      fade:p.fade!==undefined?p.fade:true,
      stretch:p.stretch?V3.copy(p.stretch):(p.vel?V3.copy(p.vel):V3.c(0,0,1))
    });
  }
  function updateParticles(dt){
    for(var i=particles.length-1;i>=0;i--){
      var p=particles[i];
      p.age+=dt;
      if(p.age>=p.life){particles.splice(i,1);continue;}
      var d=Math.exp(-p.drag*dt);
      p.vel=V3.scl(p.vel,d);
      p.pos=V3.add(p.pos,V3.scl(p.vel,dt));
      p.size+=(p.grow-p.shrink)*dt;
      if(p.size<0.05){particles.splice(i,1);continue;}
      p.stretch=p.vel;
    }
  }
  function drawParticles(view,proj,camRight,camUp){
    var n=particles.length;
    if(n===0)return;
    var cnt=Math.min(n,MAXP);
    for(var i=0;i<cnt;i++){
      var p=particles[i];
      var o=i*12;
      var a=p.alpha;
      if(p.fade)a*=Math.pow(1-p.age/p.life,0.6);
      partData[o]=p.pos[0];partData[o+1]=p.pos[1];partData[o+2]=p.pos[2];
      partData[o+3]=p.size;partData[o+4]=p.type;
      partData[o+5]=p.color[0];partData[o+6]=p.color[1];partData[o+7]=p.color[2];
      partData[o+8]=a;
      var sl=V3.len(p.stretch);
      var sd=sl>1e-6?V3.scl(p.stretch,1/sl):V3.c(0,0,1);
      partData[o+9]=sd[0];partData[o+10]=sd[1];partData[o+11]=sd[2];
    }
    gl.useProgram(partProg);
    gl.uniformMatrix4fv(U(partProg,'uView'),false,view);
    gl.uniformMatrix4fv(U(partProg,'uProj'),false,proj);
    gl.uniform3fv(U(partProg,'uCamRight'),camRight);
    gl.uniform3fv(U(partProg,'uCamUp'),camUp);
    gl.bindVertexArray(partVao);
    gl.bindBuffer(gl.ARRAY_BUFFER,partBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,partData.subarray(0,cnt*12));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    gl.depthMask(false);
    gl.drawArraysInstanced(gl.TRIANGLES,0,6,cnt);
    gl.depthMask(true);gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /* ---------- beams (cylinders) ---------- */
  var BEAM_VS=`#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aN;
  uniform mat4 uView,uProj;
  out vec3 vN;out vec3 vW;
  void main(){vN=aN;vW=aPos;gl_Position=uProj*uView*vec4(aPos,1.0);}`;
  var BEAM_FS=`#version 300 es
  precision highp float;
  in vec3 vN;in vec3 vW;
  uniform vec3 uColor;uniform float uIntensity;uniform float uTime;uniform vec3 uCamPos;
  uniform vec3 uAxis;
  out vec4 frag;
  void main(){
    vec3 N=normalize(vN);vec3 V=normalize(uCamPos-vW);
    float fres=pow(1.0-abs(dot(N,V)),1.3);
    float flow=0.65+0.35*sin(dot(vW,uAxis)*0.35-uTime*20.0);
    float core=fres*flow;
    vec3 col=uColor*(core*1.6+0.3)*uIntensity;
    frag=vec4(col,core*0.6*uIntensity+0.04);
  }`;
  var cylBuf,cylIBuf,cylGeom,cylVAO,cylVerts;
  function initCyl(){
    var seg=10;
    var pos=[],idx=[];
    for(var i=0;i<=seg;i++){
      var a=i/seg*Math.PI*2;
      pos.push(Math.cos(a),0,Math.sin(a), Math.cos(a),1,Math.sin(a));
    }
    for(var i=0;i<seg;i++){var b=i*2;idx.push(b,b+1,b+2,b+1,b+3,b+2);}
    cylGeom={pos:new Float32Array(pos),idx:new Uint16Array(idx),n:pos.length/3};
    cylVerts=new Float32Array(cylGeom.n*6);
    gl.bindBuffer(gl.ARRAY_BUFFER,cylBuf);
    gl.bufferData(gl.ARRAY_BUFFER,cylVerts.byteLength,gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,cylIBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,cylGeom.idx,gl.STATIC_DRAW);
    cylVAO=gl.createVertexArray();gl.bindVertexArray(cylVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,cylBuf);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,cylIBuf);
    gl.bindVertexArray(null);
  }
  function drawCylinder(p0,p1,r0,r1,color,intensity,time){
    var d=V3.sub(p1,p0);var len=V3.len(d);var axis=V3.scl(d,1/len);
    var up=Math.abs(axis[1])>0.9?V3.c(1,0,0):V3.c(0,1,0);
    var bx=V3.norm(V3.cross(up,axis)),by=V3.cross(axis,bx);
    for(var i=0;i<cylGeom.n;i++){
      var cx=cylGeom.pos[i*6],cz=cylGeom.pos[i*6+2],t=cylGeom.pos[i*6+1];
      var r=lerp(r0,r1,t);
      var ox=bx[0]*cx+by[0]*cx*0, ox2=by[0]*cz;
      cylVerts[i*6]=p0[0]+axis[0]*len*t+(bx[0]*cx+by[0]*cz)*r;
      cylVerts[i*6+1]=p0[1]+axis[1]*len*t+(bx[1]*cx+by[1]*cz)*r;
      cylVerts[i*6+2]=p0[2]+axis[2]*len*t+(bx[2]*cx+by[2]*cz)*r;
      cylVerts[i*6+3]=bx[0]*cx+by[0]*cz;
      cylVerts[i*6+4]=bx[1]*cx+by[1]*cz;
      cylVerts[i*6+5]=bx[2]*cx+by[2]*cz;
    }
    gl.bindVertexArray(cylVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,cylBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,cylVerts);
    gl.useProgram(beamProg);
    gl.uniformMatrix4fv(U(beamProg,'uView'),false,curView);
    gl.uniformMatrix4fv(U(beamProg,'uProj'),false,curProj);
    gl.uniform3fv(U(beamProg,'uColor'),color);
    gl.uniform1f(U(beamProg,'uIntensity'),intensity);
    gl.uniform1f(U(beamProg,'uTime'),time);
    gl.uniform3fv(U(beamProg,'uCamPos'),R.cameraPos);
    gl.uniform3fv(U(beamProg,'uAxis'),axis);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES,cylGeom.idx.length,gl.UNSIGNED_SHORT,0);
    gl.depthMask(true);gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /* ---------- shields ---------- */
  var SHIELD_VS=`#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aN;
  uniform mat4 uView,uProj,uModel;
  out vec3 vL;out vec3 vN;
  void main(){vL=aPos;vN=mat3(uModel)*aN;gl_Position=uProj*uView*uModel*vec4(aPos,1.0);}`;
  var SHIELD_FS=`#version 300 es
  precision highp float;
  in vec3 vL;in vec3 vN;
  uniform vec3 uColor;uniform float uAlpha;uniform float uTime;uniform vec3 uCamPos;
  uniform float uExpand;
  out vec4 frag;
  void main(){
    vec3 N=normalize(vN);vec3 V=normalize(uCamPos-(vL+vec3(0.0)));
    vec3 wp=vL;
    V=normalize(uCamPos-wp);
    float fres=pow(1.0-abs(dot(N,V)),1.8);
    float l1=smoothstep(0.05,0.0,abs(fract(vL.x*0.018+vL.z*0.01+uTime*0.12)-0.5)-0.46);
    float l2=smoothstep(0.05,0.0,abs(fract(vL.y*0.022-vL.z*0.009-uTime*0.09)-0.5)-0.46);
    float rip=0.5+0.5*sin(length(vL.xz)*0.05-uTime*3.2);
    float front=exp(-pow((uExpand-0.5)*4.0,2.0));
    float a=fres*0.65+l1*0.12+l2*0.12+rip*0.05+front*0.5*(0.4+fres);
    vec3 col=uColor*(0.9+0.3*rip);
    frag=vec4(col,clamp(a,0.0,1.0)*uAlpha);
  }`;
  function makeSphere(){
    var seg=24,rings=14,pos=[],idx=[];
    for(var y=0;y<=rings;y++){
      var v=y/rings,phi=v*Math.PI;
      for(var x=0;x<=seg;x++){
        var u=x/seg,th=u*Math.PI*2;
        var nx=Math.sin(phi)*Math.cos(th),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(th);
        pos.push(nx,ny,nz);
      }
    }
    for(var y=0;y<rings;y++)for(var x=0;x<seg;x++){
      var a=y*(seg+1)+x,b=a+seg+1;
      idx.push(a,b,a+1,b,b+1,a+1);
    }
    sphereIndexCount=idx.length;
    var data=new Float32Array(pos.length*2);
    for(var i=0;i<pos.length/3;i++){
      data[i*6]=pos[i*3];data[i*6+1]=pos[i*3+1];data[i*6+2]=pos[i*3+2];
      data[i*6+3]=pos[i*3];data[i*6+4]=pos[i*3+1];data[i*6+5]=pos[i*3+2];
    }
    sphereVAO=gl.createVertexArray();gl.bindVertexArray(sphereVAO);
    var sb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,sb);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    var ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  function drawShield(matrix,color,alpha,time,expand){
    if(alpha<=0.002)return;
    gl.useProgram(shieldProg);
    gl.uniformMatrix4fv(U(shieldProg,'uView'),false,curView);
    gl.uniformMatrix4fv(U(shieldProg,'uProj'),false,curProj);
    gl.uniformMatrix4fv(U(shieldProg,'uModel'),false,matrix);
    gl.uniform3fv(U(shieldProg,'uColor'),color);
    gl.uniform1f(U(shieldProg,'uAlpha'),alpha);
    gl.uniform1f(U(shieldProg,'uTime'),time);
    gl.uniform1f(U(shieldProg,'uExpand'),expand===undefined?1:expand);
    gl.uniform3fv(U(shieldProg,'uCamPos'),R.cameraPos);
    gl.bindVertexArray(sphereVAO);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES,sphereIndexCount,gl.UNSIGNED_SHORT,0);
    gl.depthMask(true);gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  function flash(pos,color,size,life){
    spawn({pos:pos,vel:[0,0,0],size:size,type:0,color:color,alpha:1.4,life:life,grow:size*4,drag:0,fade:true});
  }

  var curView=null,curProj=null;
  function beginFrame(view,proj){curView=view;curProj=proj;}

  return {init,drawSky,spawn,flash,updateParticles,drawParticles,drawCylinder,drawShield,
    beginFrame,
    get particles(){return particles;},
    clearParticles:function(){particles.length=0;}
  };
})();
