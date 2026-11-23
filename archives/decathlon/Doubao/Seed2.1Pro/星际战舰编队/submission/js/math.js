/* math & noise utilities */
var V3 = (function(){
  function c(x,y,z){return new Float32Array([x||0,y||0,z||0]);}
  var add=(a,b)=>c(a[0]+b[0],a[1]+b[1],a[2]+b[2]);
  var sub=(a,b)=>c(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  var scl=(a,s)=>c(a[0]*s,a[1]*s,a[2]*s);
  var dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  var cross=(a,b)=>c(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);
  var len=a=>Math.hypot(a[0],a[1],a[2]);
  function norm(a){var l=len(a)||1;return c(a[0]/l,a[1]/l,a[2]/l);}
  function lerp(a,b,t){return c(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t);}
  function dist(a,b){return len(sub(a,b));}
  function copy(a){return c(a[0],a[1],a[2]);}
  function rotY(a,ang){var s=Math.sin(ang),co=Math.cos(ang);return c(a[0]*co+a[2]*s,a[1],-a[0]*s+a[2]*co);}
  return {c,add,sub,scl,dot,cross,len,norm,lerp,dist,copy,rotY};
})();

function clamp(x,a,b){return x<a?a:(x>b?b:x);}
function clamp01(x){return x<0?0:(x>1?1:x);}
function smoothstep(a,b,x){var t=clamp01((x-a)/(b-a));return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function mix(a,b,t){return a+(b-a)*t;}
function wrap01(x){x=x%1;if(x<0)x+=1;return x;}
function fmod(a,n){return a-Math.floor(a/n)*n;}
function modi(a,n){return ((a%n)+n)%n;}
function easeInOut(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}
function easeOutCubic(t){return 1-Math.pow(1-t,3);}
function easeInCubic(t){return t*t*t;}

/* deterministic RNG (mulberry32) */
function RNG(seed){
  var s=seed>>>0;
  return function(){
    s=(s+0x6D2B79F5)>>>0;
    var t=s;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

/* value noise 3d */
var Noise=(function(){
  function make(seed){
    var rng=RNG(seed||1);
    var p=new Uint8Array(512);
    var q=new Uint8Array(256);
    for(var i=0;i<256;i++)q[i]=i;
    for(var i=255;i>0;i--){var j=(rng()*(i+1))|0;var t=q[i];q[i]=q[j];q[j]=t;}
    for(var i=0;i<512;i++)p[i]=q[i&255];
    function fade(t){return t*t*t*(t*(t*6-15)+10);}
    function grad(h,x,y,z){
      switch(h&15){
        case 0:return x+y;case 1:return -x+y;case 2:return x-y;case 3:return -x-y;
        case 4:return x+z;case 5:return -x+z;case 6:return x-z;case 7:return -x-z;
        case 8:return y+z;case 9:return -y+z;case 10:return y-z;case 11:return -y-z;
        case 12:return x*0.7+y;case 13:return -x*0.7+y;case 14:return y-z;default:return -y-z;
      }
    }
    function noise3(x,y,z){
      var X=Math.floor(x)&255,Y=Math.floor(y)&255,Z=Math.floor(z)&255;
      x-=Math.floor(x);y-=Math.floor(y);z-=Math.floor(z);
      var u=fade(x),v=fade(y),w=fade(z);
      var A=p[X]+Y,AA=p[A]+Z,AB=p[A+1]+Z,B=p[X+1]+Y,BA=p[B]+Z,BB=p[B+1]+Z;
      return lerp(
        lerp(
          lerp(grad(p[AA],x,y,z),grad(p[BA],x-1,y,z),u),
          lerp(grad(p[AB],x,y-1,z),grad(p[BB],x-1,y-1,z),u),v),
        lerp(
          lerp(grad(p[AA+1],x,y,z-1),grad(p[BA+1],x-1,y,z-1),u),
          lerp(grad(p[AB+1],x,y-1,z-1),grad(p[BB+1],x-1,y-1,z-1),u),v),w);
    }
    function fbm(x,y,z,oct,lac,gain){
      var a=0.5,f=1,s=0,n=0;
      oct=oct||4;lac=lac||2;gain=gain||0.5;
      for(var i=0;i<oct;i++){s+=a*noise3(x*f,y*f,z*f);n+=a;a*=gain;f*=lac;}
      return s/n;
    }
    return {noise3,fbm};
  }
  return make;
})();

/* column-major 4x4 matrix */
var Mat4=(function(){
  function identity(){var m=new Float32Array(16);m[0]=m[5]=m[10]=m[15]=1;return m;}
  function perspective(fovy,aspect,near,far){
    var f=1/Math.tan(fovy/2),m=new Float32Array(16);
    m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;
    m[14]=(2*far*near)/(near-far);return m;
  }
  function multiply(a,b){
    var o=new Float32Array(16);
    for(var i=0;i<4;i++)for(var j=0;j<4;j++){
      var s=0;for(var k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];
      o[i*4+j]=s;
    }
    return o;
  }
  function trs(pos,rot,scale){
    // rot: [rx,ry,rz] euler XYZ
    var x=rot?rot[0]:0,y=rot?rot[1]:0,z=rot?rot[2]:0;
    var sx=scale?(scale[0]!==undefined?scale[0]:scale):1;
    var sy=scale?(scale[1]!==undefined?scale[1]:scale):sx;
    var sz=scale?(scale[2]!==undefined?scale[2]:scale):sx;
    var cx=Math.cos(x),cy=Math.cos(y),cz=Math.cos(z);
    var sxr=Math.sin(x),syr=Math.sin(y),szr=Math.sin(z);
    var m=new Float32Array(16);
    m[0]=cy*cz*sx; m[1]=cy*szr*sx; m[2]=-syr*sx; m[3]=0;
    m[4]=(sxr*syr*cz-cx*szr)*sy; m[5]=(sxr*syr*szr+cx*cz)*sy; m[6]=sxr*cy*sy; m[7]=0;
    m[8]=(cx*syr*cz+sxr*szr)*sz; m[9]=(cx*syr*szr-sxr*cz)*sz; m[10]=cx*cy*sz; m[11]=0;
    m[12]=pos?pos[0]:0;m[13]=pos?pos[1]:0;m[14]=pos?pos[2]:0;m[15]=1;
    return m;
  }
  function lookAt(eye,center,up){
    var z=V3.norm(V3.sub(eye,center));
    var x=V3.norm(V3.cross(up,z));
    var y=V3.cross(z,x);
    var m=new Float32Array(16);
    m[0]=x[0];m[1]=y[0];m[2]=z[0];m[3]=0;
    m[4]=x[1];m[5]=y[1];m[6]=z[1];m[7]=0;
    m[8]=x[2];m[9]=y[2];m[10]=z[2];m[11]=0;
    m[12]=-V3.dot(x,eye);m[13]=-V3.dot(y,eye);m[14]=-V3.dot(z,eye);m[15]=1;
    return m;
  }
  function transformPoint(m,p){
    var x=p[0],y=p[1],z=p[2];
    return V3.c(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);
  }
  return {identity,perspective,multiply,trs,lookAt,transformPoint};
})();

/* catmull-rom spline through points */
function catmull(points,t){
  var n=points.length;
  var f=t*(n-1);
  var i=Math.floor(f);
  var u=f-i;
  var p0=points[Math.max(0,i-1)];
  var p1=points[i];
  var p2=points[Math.min(n-1,i+1)];
  var p3=points[Math.min(n-1,i+2)];
  var u2=u*u,u3=u2*u;
  return V3.c(
    0.5*((2*p1[0])+(-p0[0]+p2[0])*u+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*u2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*u3),
    0.5*((2*p1[1])+(-p0[1]+p2[1])*u+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*u2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*u3),
    0.5*((2*p1[2])+(-p0[2]+p2[2])*u+(2*p0[2]-5*p1[2]+4*p2[2]-p3[2])*u2+(-p0[2]+3*p1[2]-3*p2[2]+p3[2])*u3));
}

function hexrgb(h){
  h=h.replace('#','');
  return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];
}
