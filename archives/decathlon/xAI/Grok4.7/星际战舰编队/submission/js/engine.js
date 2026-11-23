/* WebGL2 renderer. File-local, no external assets. */
(function () {
  var FW = window.FW = window.FW || {};
  FW.M = {
    HULL: 1, DARK: 2, TRIM: 3, ENG: 4, CAN: 5, SEAM: 6,
    ENERGY: 7, GLASS: 8, ROCK: 9, HOT: 10, SCREEN: 11
  };

  function mul(o, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    var b0, b1, b2, b3;
    for (var i = 0; i < 4; i++) {
      b0 = b[i * 4]; b1 = b[i * 4 + 1]; b2 = b[i * 4 + 2]; b3 = b[i * 4 + 3];
      o[i * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      o[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      o[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      o[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return o;
  }
  function ident(o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  }
  function persp(o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy * 0.5);
    var nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  }
  function look(o, eye, target, up) {
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy;
    var xy = up[2] * zx - up[0] * zz;
    var xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    o[15] = 1;
    return o;
  }
  function invert(o, m) {
    var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    var a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    var a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    var a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    var b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    var b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    var b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    var b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    var b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return ident(o);
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }
  function trans(o, x, y, z) {
    ident(o);
    o[12] = x; o[13] = y; o[14] = z;
    return o;
  }
  function rotY(o, a) {
    var c = Math.cos(a), s = Math.sin(a);
    ident(o);
    o[0] = c; o[2] = -s; o[8] = s; o[10] = c;
    return o;
  }
  function rotX(o, a) {
    var c = Math.cos(a), s = Math.sin(a);
    ident(o);
    o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
    return o;
  }
  function rotZ(o, a) {
    var c = Math.cos(a), s = Math.sin(a);
    ident(o);
    o[0] = c; o[1] = s; o[4] = -s; o[5] = c;
    return o;
  }
  function scl(o, x, y, z) {
    ident(o);
    o[0] = x; o[5] = y; o[10] = z;
    return o;
  }
  var _a = new Float32Array(16), _b = new Float32Array(16), _c = new Float32Array(16);
  function trs(out, x, y, z, yaw, pitch, roll, sx, sy, sz) {
    rotY(_a, yaw || 0);
    rotX(_b, pitch || 0);
    mul(_c, _a, _b);
    rotZ(_a, roll || 0);
    mul(_b, _c, _a);
    scl(_a, sx || 1, sy || 1, sz || 1);
    mul(_c, _b, _a);
    trans(_a, x, y, z);
    return mul(out, _a, _c);
  }
  function basisZ(out, ax, ay, az, bx, by, bz, radius) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var len = Math.hypot(dx, dy, dz) || 1e-4;
    dx /= len; dy /= len; dz /= len;
    var ux = 0, uy = 1, uz = 0;
    if (Math.abs(dy) > 0.92) { ux = 1; uy = 0; uz = 0; }
    var sx = uy * dz - uz * dy, sy = uz * dx - ux * dz, sz = ux * dy - uy * dx;
    var sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    var tx = dy * sz - dz * sy, ty = dz * sx - dx * sz, tz = dx * sy - dy * sx;
    var r = radius || 1;
    out[0] = sx * r; out[1] = sy * r; out[2] = sz * r; out[3] = 0;
    out[4] = tx * r; out[5] = ty * r; out[6] = tz * r; out[7] = 0;
    out[8] = dx * len; out[9] = dy * len; out[10] = dz * len; out[11] = 0;
    out[12] = ax; out[13] = ay; out[14] = az; out[15] = 1;
    return out;
  }

  FW.mat = { trs: trs, basisZ: basisZ, ident: ident, mul: mul, trans: trans, rotY: rotY, rotX: rotX };

  var VS_VOX = "#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 aPos;\nlayout(location=1) in vec3 aNrm;\nlayout(location=2) in float aMat;\nuniform mat4 uVP,uModel;\nout vec3 vW,vN,vO;\nout float vM;\nvoid main(){\n  vec4 w=uModel*vec4(aPos,1.0);\n  vW=w.xyz; vO=aPos; vN=mat3(uModel)*aNrm; vM=aMat;\n  gl_Position=uVP*w;\n}";

  var FS_VOX = "#version 300 es\nprecision highp float;\n" +
    "in vec3 vW,vN,vO; in float vM;\nuniform vec3 uCam,uKey,uKeyCol;\n" +
    "uniform vec4 uL0[10]; uniform vec4 uL1[10];\n" +
    "uniform float uTime,uEng,uCharge,uHot,uTint;\n" +
    "out vec4 o;\n" +
    "vec3 lin(vec3 c){return pow(c,vec3(2.2));}\n" +
    "vec3 tonemap(vec3 c){c=c/(c+vec3(0.72)); return pow(max(c,0.0),vec3(0.9));}\n" +
    "float edge(vec3 p,vec3 n){\n" +
    "  vec3 f=fract(p); vec3 w=fwidth(p)*1.15;\n" +
    "  vec3 a=smoothstep(vec3(0.0),w,f)*smoothstep(vec3(0.0),w,1.0-f);\n" +
    "  float e=1.0; vec3 m=1.0-abs(normalize(n));\n" +
    "  if(m.x>0.5) e=min(e,a.x); if(m.y>0.5) e=min(e,a.y); if(m.z>0.5) e=min(e,a.z);\n" +
    "  return e;\n}\n" +
    "void main(){\n" +
    "  int id=int(vM+0.5);\n" +
    "  vec3 alb=lin(vec3(0.36,0.55,0.54));\n" +
    "  float specP=16.0, specI=0.18, rough=1.0;\n" +
    "  vec3 em=vec3(0.0);\n" +
    "  if(id==1){ alb=lin(vec3(0.42,0.62,0.61))*uTint; }\n" +
    "  else if(id==2){ alb=lin(vec3(0.07,0.08,0.09)); specI=0.02; specP=8.0; }\n" +
    "  else if(id==3){ alb=lin(vec3(0.78,0.72,0.60)); specI=0.62; specP=72.0; }\n" +
    "  else if(id==4){ alb=lin(vec3(0.18,0.07,0.03)); em=lin(vec3(1.0,0.42,0.10))*(1.4+uEng*3.4); }\n" +
    "  else if(id==5){ alb=lin(vec3(0.25,0.12,0.06)); float along=clamp((-450.0-vO.z)/120.0,0.0,1.0); float lit=smoothstep(along-0.05, along+0.03, uCharge); em=lin(vec3(1.0,0.62,0.22))*lit*(2.2+uCharge*6.0); }\n" +
    "  else if(id==6){ alb=lin(vec3(0.20,0.10,0.05)); em=lin(vec3(1.0,0.55,0.18))*0.85; }\n" +
    "  else if(id==7){ alb=lin(vec3(0.15,0.35,0.42)); float f=0.55+0.45*sin(vO.z*0.18-uTime*1.7+vO.y*0.05); em=lin(vec3(0.35,0.85,1.0))*(0.8+1.6*f); }\n" +
    "  else if(id==8){ alb=lin(vec3(0.55,0.82,0.86)); em=lin(vec3(0.45,0.8,0.9))*0.35; }\n" +
    "  else if(id==9){ alb=lin(vec3(0.45,0.41,0.36)); specI=0.04; float g=0.85+0.15*fract(sin(dot(floor(vO),vec3(12.9,78.2,37.1)))*437.0); alb*=g; }\n" +
    "  else if(id==10){ alb=lin(vec3(0.35,0.16,0.10)); em=lin(vec3(1.0,0.32,0.08))*uHot*5.5; }\n" +
    "  else if(id==11){ alb=lin(vec3(0.1,0.2,0.24)); float s=step(0.55, fract(vO.x*0.17+uTime*0.15))*step(0.4, fract(vO.y*0.23-uTime*0.07)); em=lin(vec3(0.55,0.95,1.0))*(0.35+1.3*s); }\n" +
    "  vec3 N=normalize(vN);\n" +
    "  float ed=edge(vO,N); alb*=mix(0.34,1.0,ed);\n" +
    "  vec3 V=normalize(uCam-vW);\n" +
    "  vec3 keyL=normalize(uKey);\n" +
    "  float ndl=max(dot(N,keyL),0.0);\n" +
    "  float wrap=clamp(dot(N,keyL)*0.45+0.55,0.0,1.0);\n" +
    "  float ny=N.y*0.5+0.5;\n" +
    "  vec3 hemi=mix(lin(vec3(0.11,0.13,0.16)),lin(vec3(0.34,0.40,0.42)),ny);\n" +
    "  vec3 fillD=normalize(vec3(-0.62,0.18,-0.55));\n" +
    "  float fill=max(dot(N,fillD),0.0);\n" +
    "  vec3 col=alb*(hemi*0.85+uKeyCol*ndl*1.55+uKeyCol*wrap*0.16+lin(vec3(0.22,0.40,0.46))*fill*0.62);\n" +
    "  vec3 H=normalize(keyL+V);\n" +
    "  col+=uKeyCol*pow(max(dot(N,H),0.0),specP)*specI;\n" +
    "  float rim=pow(1.0-max(dot(N,V),0.0),2.6);\n" +
    "  col+=uKeyCol*rim*ndl*0.28+lin(vec3(0.30,0.62,0.68))*rim*0.07;\n" +
    "  for(int i=0;i<10;i++){\n" +
    "    vec3 lp=uL0[i].xyz; float li=uL0[i].w; if(li<0.001) continue;\n" +
    "    vec3 L=lp-vW; float d=length(L); L/=max(d,1e-3);\n" +
    "    float rad=uL1[i].w; float att=li*clamp(1.0-d/rad,0.0,1.0); att*=att;\n" +
    "    col+=alb*uL1[i].rgb*max(dot(N,L),0.0)*att;\n" +
    "    col+=uL1[i].rgb*pow(max(dot(N,normalize(L+V)),0.0),24.0)*att*0.35;\n" +
    "  }\n" +
    "  col+=em;\n" +
    "  float fog=smoothstep(900.0,5200.0,length(vW-uCam));\n" +
    "  col=mix(col,lin(vec3(0.05,0.07,0.09)),fog*0.55);\n" +
    "  float a=id==8?0.42:1.0;\n" +
    "  o=vec4(tonemap(col),a);\n}";

  var VS_SKY = "#version 300 es\nprecision highp float;\nin vec2 aClip;\nout vec2 vC;\nvoid main(){vC=aClip; gl_Position=vec4(aClip,0.999,1.0);}";
  var FS_SKY = "#version 300 es\nprecision highp float;\nin vec2 vC;\nuniform mat4 uInvVP;\nuniform vec3 uKey,uCam;\nuniform float uTime;\nout vec4 o;\n" +
    "float hash(vec3 p){p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z);}\n" +
    "float n3(vec3 p){vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); float n=mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); return n;}\n" +
    "float fbm(vec3 p){float a=0.0,w=0.5; for(int i=0;i<5;i++){a+=w*n3(p); p=p*2.02+vec3(1.7,9.2,3.1); w*=0.5;} return a;}\n" +
    "void main(){\n" +
    "  vec4 r=uInvVP*vec4(vC,1.0,1.0); vec3 rd=normalize(r.xyz/r.w-uCam);\n" +
    "  float b=fbm(rd*1.6);\n" +
    "  vec3 col=vec3(0.012,0.016,0.024);\n" +
    "  col=mix(col,vec3(0.11,0.045,0.032), smoothstep(0.42,0.72,b)*0.85);\n" +
    "  col=mix(col,vec3(0.03,0.10,0.12), smoothstep(0.55,0.82,fbm(rd*2.4+4.0))*0.7);\n" +
    "  col*=0.55+0.45*smoothstep(-0.2,0.8,rd.y);\n" +
    "  vec3 cell=floor(rd*520.0);\n" +
    "  float h=hash(cell);\n" +
    "  float star=smoothstep(0.986,0.998,h);\n" +
    "  float br=0.35+0.65*hash(cell+3.0);\n" +
    "  col+=vec3(0.85,0.9,1.0)*star*br;\n" +
    "  float ang=dot(rd,normalize(uKey));\n" +
    "  float disk=smoothstep(0.972,0.986,ang);\n" +
    "  float limb=smoothstep(0.955,0.984,ang)*(1.0-disk);\n" +
    "  vec3 sun=mix(vec3(0.55,0.32,0.16), vec3(1.0,0.86,0.62), disk);\n" +
    "  col+=sun*disk*1.15 + vec3(1.0,0.72,0.42)*limb*0.9;\n" +
    "  col+=vec3(0.25,0.12,0.05)*pow(max(ang,0.0),8.0)*0.35;\n" +
    "  o=vec4(pow(col/(col+vec3(1.05)),vec3(0.92)),1.0);\n}";

  var VS_ADD = "#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 aPos;\nlayout(location=1) in vec4 aCol;\nuniform mat4 uVP;\nout vec4 vC;\nvoid main(){vC=aCol; gl_Position=uVP*vec4(aPos,1.0);}";
  var FS_ADD = "#version 300 es\nprecision highp float;\nin vec4 vC;\nout vec4 o;\nvoid main(){o=vC;}";

  var VS_SH = "#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 aPos;\nlayout(location=1) in vec3 aNrm;\nuniform mat4 uVP,uModel;\nout vec3 vN,vW,vO;\nvoid main(){vec4 w=uModel*vec4(aPos,1.0); vW=w.xyz; vO=aPos; vN=mat3(uModel)*aNrm; gl_Position=uVP*w;}";
  var FS_SH = "#version 300 es\nprecision highp float;\nin vec3 vN,vW,vO;\nuniform vec3 uCam,uCol;\nuniform float uTime,uAlpha,uDeploy;\nout vec4 o;\n" +
    "void main(){\n" +
    "  vec3 N=normalize(vN); vec3 V=normalize(uCam-vW);\n" +
    "  float fres=pow(1.0-abs(dot(N,V)),1.45);\n" +
    "  float stripe=0.5+0.5*sin(vO.z*18.0+vO.y*6.0-uTime*1.4);\n" +
    "  float flow=0.5+0.5*sin(vO.x*10.0-vO.z*8.0+uTime*0.8);\n" +
    "  float band=exp(-pow((vO.z-(uDeploy*2.0-1.0))*3.2,2.0));\n" +
    "  float a=(0.008+fres*0.62+stripe*fres*0.16)*uAlpha;\n" +
    "  a+=band*uAlpha*0.28;\n" +
    "  vec3 col=uCol*(0.15+fres*0.85)+vec3(1.0,0.72,0.35)*band*0.9+vec3(0.6,0.95,1.0)*stripe*fres*0.35;\n" +
    "  o=vec4(col,clamp(a,0.0,1.0));\n}";

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function sphereMesh(stacks, slices) {
    var p = [], n = [];
    for (var i = 0; i < stacks; i++) {
      var v0 = i / stacks, v1 = (i + 1) / stacks;
      var p0 = Math.PI * (v0 - 0.5), p1 = Math.PI * (v1 - 0.5);
      for (var j = 0; j < slices; j++) {
        var u0 = j / slices, u1 = (j + 1) / slices;
        var t0 = u0 * Math.PI * 2, t1 = u1 * Math.PI * 2;
        function vert(th, ph) {
          var c = Math.cos(ph);
          var x = Math.cos(th) * c, y = Math.sin(ph), z = Math.sin(th) * c;
          p.push(x, y, z); n.push(x, y, z);
        }
        vert(t0, p0); vert(t1, p0); vert(t1, p1);
        vert(t0, p0); vert(t1, p1); vert(t0, p1);
      }
    }
    return { positions: new Float32Array(p), normals: new Float32Array(n), count: p.length / 3 };
  }

  FW.uploadMesh = function (gl, mesh) {
    if (!mesh || !mesh.count) return { vao: null, count: 0 };
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function buf(loc, data, size) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    buf(0, mesh.positions, 3);
    buf(1, mesh.normals, 3);
    if (mesh.mats) buf(2, mesh.mats, 1);
    gl.bindVertexArray(null);
    return { vao: vao, count: mesh.count };
  };

  FW.createRenderer = function (canvas) {
    var gl = canvas.getContext("webgl2", {
      alpha: false, antialias: true, depth: true, stencil: false,
      powerPreference: "high-performance", preserveDrawingBuffer: true
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    var pVox = program(gl, VS_VOX, FS_VOX);
    var pSky = program(gl, VS_SKY, FS_SKY);
    var pAdd = program(gl, VS_ADD, FS_ADD);
    var pSh = program(gl, VS_SH, FS_SH);

    var skyVao = gl.createVertexArray();
    gl.bindVertexArray(skyVao);
    var skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var sh = sphereMesh(28, 40);
    var shVao = gl.createVertexArray();
    gl.bindVertexArray(shVao);
    var shP = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shP);
    gl.bufferData(gl.ARRAY_BUFFER, sh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    var shN = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shN);
    gl.bufferData(gl.ARRAY_BUFFER, sh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    var addCap = 200000;
    var addArr = new Float32Array(addCap * 7);
    var addN = 0;
    var addVao = gl.createVertexArray();
    var addBuf = gl.createBuffer();
    gl.bindVertexArray(addVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, addBuf);
    gl.bufferData(gl.ARRAY_BUFFER, addArr.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);

    var vp = new Float32Array(16), view = new Float32Array(16), proj = new Float32Array(16), inv = new Float32Array(16);
    var model = new Float32Array(16);
    var camPos = [0, 0, 0], camRight = [1, 0, 0], camUp = [0, 1, 0], camFwd = [0, 0, -1];
    var key = [-0.42, 0.74, -0.38];
    var kl = Math.hypot(key[0], key[1], key[2]);
    key = [key[0] / kl, key[1] / kl, key[2] / kl];

    function resize() {
      var w = canvas.clientWidth || window.innerWidth;
      var h = canvas.clientHeight || window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var W = Math.max(2, Math.round(w * dpr));
      var H = Math.max(2, Math.round(h * dpr));
      if (W > 3840) { H = Math.round(H * 3840 / W); W = 3840; }
      if (H > 2160) { W = Math.round(W * 2160 / H); H = 2160; }
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
      }
      return { w: W, h: H, aspect: W / Math.max(1, H) };
    }

    var uV = {
      vp: gl.getUniformLocation(pVox, "uVP"),
      model: gl.getUniformLocation(pVox, "uModel"),
      cam: gl.getUniformLocation(pVox, "uCam"),
      key: gl.getUniformLocation(pVox, "uKey"),
      keyCol: gl.getUniformLocation(pVox, "uKeyCol"),
      l0: gl.getUniformLocation(pVox, "uL0"),
      l1: gl.getUniformLocation(pVox, "uL1"),
      time: gl.getUniformLocation(pVox, "uTime"),
      eng: gl.getUniformLocation(pVox, "uEng"),
      charge: gl.getUniformLocation(pVox, "uCharge"),
      hot: gl.getUniformLocation(pVox, "uHot"),
      tint: gl.getUniformLocation(pVox, "uTint")
    };
    var light0 = new Float32Array(40);
    var light1 = new Float32Array(40);

    function begin(cam, time, lights, eng, charge) {
      var sz = resize();
      gl.viewport(0, 0, sz.w, sz.h);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.disable(gl.BLEND);
      gl.clearColor(0.01, 0.012, 0.016, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var near = 0.35, far = 14000;
      persp(proj, (cam.fov || 50) * Math.PI / 180, sz.aspect, near, far);
      var eye = [cam.px, cam.py, cam.pz];
      var tgt = [cam.lx, cam.ly, cam.lz];
      var fx = tgt[0] - eye[0], fy = tgt[1] - eye[1], fz = tgt[2] - eye[2];
      var fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      var upw = [0, 1, 0];
      var rx = upw[1] * fz - upw[2] * fy, ry = upw[2] * fx - upw[0] * fz, rz = upw[0] * fy - upw[1] * fx;
      var rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; ry /= rl; rz /= rl;
      var ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
      var roll = cam.roll || 0;
      var cr = Math.cos(roll), sr = Math.sin(roll);
      var up = [rx * sr + ux * cr, ry * sr + uy * cr, rz * sr + uz * cr];
      camRight[0] = rx * cr - ux * sr; camRight[1] = ry * cr - uy * sr; camRight[2] = rz * cr - uz * sr;
      camUp[0] = up[0]; camUp[1] = up[1]; camUp[2] = up[2];
      camFwd[0] = fx; camFwd[1] = fy; camFwd[2] = fz;
      camPos[0] = eye[0]; camPos[1] = eye[1]; camPos[2] = eye[2];
      look(view, eye, tgt, up);
      mul(vp, proj, view);
      invert(inv, vp);
      gl.useProgram(pSky);
      gl.uniformMatrix4fv(gl.getUniformLocation(pSky, "uInvVP"), false, inv);
      gl.uniform3fv(gl.getUniformLocation(pSky, "uKey"), key);
      gl.uniform3fv(gl.getUniformLocation(pSky, "uCam"), camPos);
      gl.uniform1f(gl.getUniformLocation(pSky, "uTime"), time);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(skyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      for (var i = 0; i < 10; i++) {
        var L = lights && lights[i];
        if (!L) {
          light0[i * 4 + 3] = 0;
          continue;
        }
        light0[i * 4] = L.x; light0[i * 4 + 1] = L.y; light0[i * 4 + 2] = L.z; light0[i * 4 + 3] = L.i;
        light1[i * 4] = L.r; light1[i * 4 + 1] = L.g; light1[i * 4 + 2] = L.b; light1[i * 4 + 3] = L.radius;
      }
      gl.useProgram(pVox);
      gl.uniformMatrix4fv(uV.vp, false, vp);
      gl.uniform3fv(uV.cam, camPos);
      gl.uniform3fv(uV.key, key);
      gl.uniform3f(uV.keyCol, 1.0, 0.93, 0.82);
      gl.uniform4fv(uV.l0, light0);
      gl.uniform4fv(uV.l1, light1);
      gl.uniform1f(uV.time, time);
      gl.uniform1f(uV.eng, eng || 0);
      gl.uniform1f(uV.charge, charge || 0);
      gl.uniform1f(uV.hot, 0);
      gl.uniform1f(uV.tint, 1);
      addN = 0;
    }

    function drawVoxel(gpu, matrix, hot, tint) {
      if (!gpu || !gpu.count) return;
      gl.uniformMatrix4fv(uV.model, false, matrix);
      gl.uniform1f(uV.hot, hot || 0);
      gl.uniform1f(uV.tint, tint == null ? 1 : tint);
      gl.bindVertexArray(gpu.vao);
      gl.drawArrays(gl.TRIANGLES, 0, gpu.count);
    }

    function beginGlass() {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    function endGlass() {
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    function drawShield(matrix, deploy, time, alpha) {
      gl.useProgram(pSh);
      gl.uniformMatrix4fv(gl.getUniformLocation(pSh, "uVP"), false, vp);
      gl.uniformMatrix4fv(gl.getUniformLocation(pSh, "uModel"), false, matrix);
      gl.uniform3fv(gl.getUniformLocation(pSh, "uCam"), camPos);
      gl.uniform3f(gl.getUniformLocation(pSh, "uCol"), 0.55, 0.9, 1.0);
      gl.uniform1f(gl.getUniformLocation(pSh, "uTime"), time);
      gl.uniform1f(gl.getUniformLocation(pSh, "uDeploy"), deploy);
      gl.uniform1f(gl.getUniformLocation(pSh, "uAlpha"), alpha);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(shVao);
      gl.drawArrays(gl.TRIANGLES, 0, sh.count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(pVox);
    }
    function vert(x, y, z, r, g, b, a) {
      if (addN >= addCap) return;
      var o = addN * 7;
      addArr[o] = x; addArr[o + 1] = y; addArr[o + 2] = z;
      addArr[o + 3] = r; addArr[o + 4] = g; addArr[o + 5] = b; addArr[o + 6] = a;
      addN++;
    }
    function tri(ax, ay, az, bx, by, bz, cx, cy, cz, r, g, b, a) {
      vert(ax, ay, az, r, g, b, a);
      vert(bx, by, bz, r, g, b, a);
      vert(cx, cy, cz, r, g, b, a);
    }
    function flushAdd() {
      if (!addN) return;
      gl.useProgram(pAdd);
      gl.uniformMatrix4fv(gl.getUniformLocation(pAdd, "uVP"), false, vp);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(addVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, addBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, addArr.subarray(0, addN * 7));
      gl.drawArrays(gl.TRIANGLES, 0, addN);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(pVox);
    }

    return {
      gl: gl,
      begin: begin,
      drawVoxel: drawVoxel,
      beginGlass: beginGlass,
      endGlass: endGlass,
      drawShield: drawShield,
      vert: vert,
      tri: tri,
      flushAdd: flushAdd,
      camRight: camRight,
      camUp: camUp,
      camFwd: camFwd,
      camPos: camPos,
      trs: trs,
      basisZ: basisZ,
      tmp: new Float32Array(16),
      tmp2: new Float32Array(16)
    };
  };
})();
