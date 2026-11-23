// A small WebGL 2 renderer for extruded, closed 2D contours.
const meshSurface=document.createElement('canvas');meshSurface.width=W;meshSurface.height=H;
const meshGL=meshSurface.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true});
let meshProgram=null,meshBuffer=null;
if(meshGL){
  const vertex=`#version 300 es
  in vec3 position; in vec3 normal; uniform vec2 rotation; out vec3 n; out vec3 p;
  void main(){float cx=cos(rotation.x),sx=sin(rotation.x),cy=cos(rotation.y),sy=sin(rotation.y);
    mat3 rx=mat3(1,0,0,0,cx,sx,0,-sx,cx), ry=mat3(cy,0,-sy,0,1,0,sy,0,cy);
    p=ry*rx*position;n=normalize(ry*rx*normal);gl_Position=vec4(p.x/480.0,-p.y/270.0,-p.z/1000.0,1.0);}`;
  const fragment=`#version 300 es
  precision highp float;in vec3 n;in vec3 p;uniform vec3 color;uniform float metal;uniform float rough;uniform float emission;out vec4 outColor;
  void main(){vec3 N=normalize(n);vec3 L=normalize(vec3(-0.4,-0.55,0.8));vec3 V=vec3(0,0,1);float d=max(dot(N,L),0.0);
    float shine=pow(max(dot(N,normalize(L+V)),0.0),mix(120.0,5.0,rough));
    vec3 ambient=color*(0.20+0.18*max(N.y,0.0));vec3 diffuse=color*d*(0.72-0.25*metal);
    vec3 spec=mix(vec3(0.32),color,metal)*shine*(1.1-0.6*rough);float band=pow(max(0.0,sin(p.x*.012+p.y*.008)),6.0)*metal*(1.0-rough)*.28;
    outColor=vec4(ambient+diffuse+spec+color*(band+emission),1);}`;
  const compile=(type,source)=>{const shader=meshGL.createShader(type);meshGL.shaderSource(shader,source);meshGL.compileShader(shader);if(!meshGL.getShaderParameter(shader,meshGL.COMPILE_STATUS))throw Error(meshGL.getShaderInfoLog(shader));return shader};
  try{meshProgram=meshGL.createProgram();meshGL.attachShader(meshProgram,compile(meshGL.VERTEX_SHADER,vertex));meshGL.attachShader(meshProgram,compile(meshGL.FRAGMENT_SHADER,fragment));meshGL.linkProgram(meshProgram);if(!meshGL.getProgramParameter(meshProgram,meshGL.LINK_STATUS))throw Error(meshGL.getProgramInfoLog(meshProgram));meshBuffer=meshGL.createBuffer()}catch(error){console.error('网格渲染器初始化失败',error);meshProgram=null}
}
function triangulateContour(points){
  if(points.length<3)return [];
  let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1]}
  const order=Array.from({length:points.length},(_,i)=>i);if(area<0)order.reverse();
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const triangles=[];let attempts=0;
  while(order.length>3 && attempts++<points.length*points.length){let found=false;
    for(let i=0;i<order.length;i++){const ia=order[(i+order.length-1)%order.length],ib=order[i],ic=order[(i+1)%order.length],a=points[ia],b=points[ib],c=points[ic];if(cross(a,b,c)<=1e-6)continue;
      if(order.some(k=>k!==ia&&k!==ib&&k!==ic&&cross(a,b,points[k])>1e-6&&cross(b,c,points[k])>1e-6&&cross(c,a,points[k])>1e-6))continue;
      triangles.push([ia,ib,ic]);order.splice(i,1);found=true;break}
    if(!found)break;
  }
  if(order.length===3)triangles.push([...order]);return triangles;
}
function contourForShape(shape,layer){
  const source=shape.source||layer,w=source.width||200,h=source.height||120;let points=[];
  if(shape.kind==='rect'){
    const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
    if(typeof activeFields==='function' && layer.fieldsEnabled!==false && activeFields().length){for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];for(let j=0;j<16;j++)points.push([a[0]+(b[0]-a[0])*j/16,a[1]+(b[1]-a[1])*j/16])}}
    else points=corners;
  }
  else if(shape.kind==='ellipse')for(let i=0;i<64;i++){let a=i*Math.PI*2/64;points.push([Math.cos(a)*w/2,Math.sin(a)*h/2])}
  else if(shape.kind==='path' && source.pathClosed!==false){points=sampleBezierPath(source);if(points.length>1)points.pop()}
  else return [];
  const angle=(shape.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),scale=shape.scale??1;
  const transformed=points.map(([x,y])=>[(x*c-y*s)*scale+(shape.x||0),(x*s+y*c)*scale+(shape.y||0)]).filter((point,i,all)=>!i||Math.hypot(point[0]-all[i-1][0],point[1]-all[i-1][1])>.05);
  return typeof deformContour==='function'?deformContour(transformed,layer):transformed;
}
function drawExtruded(context,layer,shapes){
  if(!meshProgram || shapes.some(s=>!['rect','ellipse','path'].includes(s.kind)||s.trimStart!==undefined))return false;
  const vertices=[],depth=Math.max(1,val(layer,'extrusion',40));
  const vertex=(point,z,n)=>vertices.push(point[0],point[1],z,n[0],n[1],n[2]);
  for(const shape of shapes){const contour=contourForShape(shape,layer),triangles=triangulateContour(contour);if(!triangles.length)continue;
    for(const [a,b,c] of triangles){vertex(contour[a],depth/2,[0,0,1]);vertex(contour[b],depth/2,[0,0,1]);vertex(contour[c],depth/2,[0,0,1]);vertex(contour[c],-depth/2,[0,0,-1]);vertex(contour[b],-depth/2,[0,0,-1]);vertex(contour[a],-depth/2,[0,0,-1])}
    let area=0;for(let i=0;i<contour.length;i++){const a=contour[i],b=contour[(i+1)%contour.length];area+=a[0]*b[1]-b[0]*a[1]}const sign=area>=0?1:-1;
    for(let i=0;i<contour.length;i++){const a=contour[i],b=contour[(i+1)%contour.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1,n=[sign*dy/length,-sign*dx/length,0];vertex(a,depth/2,n);vertex(a,-depth/2,n);vertex(b,depth/2,n);vertex(b,depth/2,n);vertex(a,-depth/2,n);vertex(b,-depth/2,n)}
  }
  return renderMeshVertices(context,layer,vertices);
}
function renderMeshVertices(context,layer,vertices){
  if(!vertices.length || !meshProgram)return false;
  const gl=meshGL;gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(meshProgram);gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
  for(const [name,offset] of [['position',0],['normal',12]]){const location=gl.getAttribLocation(meshProgram,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,24,offset)}
  gl.uniform2f(gl.getUniformLocation(meshProgram,'rotation'),val(layer,'rotateX',-18)*Math.PI/180,val(layer,'rotateY',-25)*Math.PI/180);
  const hex=(layer.fill||'#e8a16e').replace('#','');gl.uniform3f(gl.getUniformLocation(meshProgram,'color'),parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);
  gl.uniform1f(gl.getUniformLocation(meshProgram,'metal'),clamp(val(layer,'metal',70)/100));gl.uniform1f(gl.getUniformLocation(meshProgram,'rough'),clamp(val(layer,'roughness',35)/100));gl.uniform1f(gl.getUniformLocation(meshProgram,'emission'),Math.max(0,val(layer,'emission',0)/100));gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  context.drawImage(meshSurface,0,0);return true;
}
let textMaskCache=null;
function drawExtrudedText(context,layer){
  if(!meshProgram)return false;
  const signature=JSON.stringify([layer.content,layer.fontSize,layer.lineHeight,layer.letterSpacing,layer.textAlign]);
  if(textMaskCache?.signature!==signature){
    const surface=document.createElement('canvas');surface.width=W/2;surface.height=H/2;
    const g=surface.getContext('2d',{willReadFrequently:true});g.scale(.5,.5);g.fillStyle='#fff';g.textBaseline='middle';g.font=`bold ${layer.fontSize||100}px Microsoft YaHei, sans-serif`;drawTextLayer(g,layer);
    const data=g.getImageData(0,0,surface.width,surface.height).data,occupancy=new Uint8Array(surface.width*surface.height);
    for(let i=0;i<occupancy.length;i++)occupancy[i]=data[i*4+3]>=128?1:0;
    textMaskCache={signature,occupancy,width:surface.width,height:surface.height};
  }
  const {occupancy,width,height}=textMaskCache,depth=Math.max(1,val(layer,'extrusion',40)),vertices=[];
  const deform=typeof createDeformer==='function'?createDeformer(layer):point=>point,pointCache=new Map();
  const occupied=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&occupancy[y*width+x];
  const point=(x,y)=>{const key=y*(width+1)+x;if(!pointCache.has(key))pointCache.set(key,deform([x*2-480,y*2-270]));return pointCache.get(key)};
  const vertex=(p,z,n)=>vertices.push(p[0],p[1],z,n[0],n[1],n[2]);
  const quad=(a,b,c,d,z,n)=>{vertex(a,z,n);vertex(b,z,n);vertex(c,z,n);vertex(a,z,n);vertex(c,z,n);vertex(d,z,n)};
  for(let y=0;y<height;y++){
    for(let x=0;x<width;){if(!occupied(x,y)){x++;continue}let end=x+1;while(end<width&&occupied(end,y))end++;
      const a=point(x,y),b=point(end,y),c=point(end,y+1),d=point(x,y+1);quad(a,b,c,d,depth/2,[0,0,1]);quad(d,c,b,a,-depth/2,[0,0,-1]);x=end;
    }
    for(let x=0;x<width;x++){if(!occupied(x,y))continue;
      const a=point(x,y),b=point(x+1,y),c=point(x+1,y+1),d=point(x,y+1);
      const side=(p,q,n)=>{let dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy)||1,nx=dy/length,ny=-dx/length;if(nx*n[0]+ny*n[1]<0){nx=-nx;ny=-ny}const normal=[nx,ny,0];vertex(p,depth/2,normal);vertex(p,-depth/2,normal);vertex(q,depth/2,normal);vertex(q,depth/2,normal);vertex(p,-depth/2,normal);vertex(q,-depth/2,normal)};
      if(!occupied(x,y-1))side(a,b,[0,-1,0]);if(!occupied(x+1,y))side(b,c,[1,0,0]);if(!occupied(x,y+1))side(c,d,[0,1,0]);if(!occupied(x-1,y))side(d,a,[-1,0,0]);
    }
  }
  return renderMeshVertices(context,layer,vertices);
}
