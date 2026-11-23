/* Font coordinates are quadratic TrueType contours, measured in font units. */
const decodedGlyphs = new Map();
function decodedGlyph(ch) {
  if (decodedGlyphs.has(ch)) return decodedGlyphs.get(ch);
  const packed = serifOutlines[ch];
  if (!packed) return null;
  const bytes = Uint8Array.from(atob(packed), c => c.charCodeAt(0));
  const data = new DataView(bytes.buffer);
  const glyph = {advance:data.getUint16(0,true),rings:[]};
  let at=4;
  for(let i=0;i<data.getUint16(2,true);i++){
    const count=data.getUint16(at,true), ring=[]; at+=2;
    for(let j=0;j<count;j++){
      ring.push([data.getInt16(at,true),data.getInt16(at+2,true),data.getUint8(at+4)]);
      at+=5;
    }
    glyph.rings.push(ring);
  }
  decodedGlyphs.set(ch,glyph);
  return glyph;
}
const midpoint = (a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2,1];
function drawQuadraticRing(path,ring,x,y,scale){
  if(!ring.length)return;
  const first=ring[0],last=ring.at(-1);
  let start=first[2]?first:last[2]?last:midpoint(last,first);
  path.moveTo(x+scale*start[0],y+scale*start[1]);
  const sequence=first[2]?ring.slice(1):ring.slice();
  sequence.push(start);
  for(let i=0;i<sequence.length;i++){
    const p=sequence[i];
    if(p[2])path.lineTo(x+scale*p[0],y+scale*p[1]);
    else {
      const next=sequence[i+1]||start;
      const end=next[2]?next:midpoint(p,next);
      path.quadraticCurveTo(x+scale*p[0],y+scale*p[1],x+scale*end[0],y+scale*end[1]);
      if(next[2])i++;
    }
  }
  path.currentPath.closePath();
}
function fontAdvance(s){
  if(s==='火')return 3.12;
  return Array.from(s).reduce((sum,ch)=>sum+(decodedGlyph(ch)?.advance??1000)*.00323,0);
}
function nativeGlyphShapes(str){
  if(!Array.from(str).every(ch=>ch==='\n'||!!serifOutlines[ch]))return null;
  const lines=str.split('\n'), result=[];
  for(let row=0;row<lines.length;row++){
    const line=lines[row],scale=.00323;
    let x=-fontAdvance(line)*.5;
    for(const ch of line){
      const g=decodedGlyph(ch),path=new THREE.ShapePath();
      for(const ring of g.rings)drawQuadraticRing(path,ring,x,.37-row*3.9,scale);
      let shapes=path.toShapes(false);
      if(shapes.length>1){const solid=polygonClipping.union(...polygons(shapes));shapes=polygonsBack(solid)}
      result.push(...shapes);
      x+=g.advance*scale;
    }
  }
  return result;
}
function editableContour(path) {
  const points=[],handles={};
  const append=(p)=>{points.push([p.x,p.y]);return points.length-1};
  function segment(start,c1,c2,end){
    if(!points.length)append(start);
    const i=points.length-1,j=append(end);
    if(c1){(handles[i]||={}).out=[c1.x-start.x,c1.y-start.y];(handles[j]||={}).in=[c2.x-end.x,c2.y-end.y]}
  }
  for(const curve of path.curves){
    if(curve.isLineCurve)segment(curve.v1,null,null,curve.v2);
    else if(curve.isCubicBezierCurve)segment(curve.v0,curve.v1,curve.v2,curve.v3);
    else if(curve.isQuadraticBezierCurve){
      segment(curve.v0,curve.v0.clone().lerp(curve.v1,2/3),curve.v2.clone().lerp(curve.v1,2/3),curve.v2)
    }else{
      const count=8;
      for(let i=0;i<count;i++){
        const a=curve.getPoint(i/count),b=curve.getPoint((i+1)/count);
        const len=a.distanceTo(b)/3;
        segment(a,a.clone().addScaledVector(curve.getTangent(i/count),len),b.clone().addScaledVector(curve.getTangent((i+1)/count),-len),b);
      }
    }
  }
  if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-5){
    if(handles[points.length-1]?.in)(handles[0]||={}).in=handles[points.length-1].in;
    delete handles[points.length-1];points.pop();
  }
  return {points,handles};
}
function captureContours(shapes){
  const all=[];
  for(const sh of shapes){
    const owner=all.length;
    all.push({...editableContour(sh),owner:-1});
    for(const hole of sh.holes)all.push({...editableContour(hole),owner});
  }
  return all;
}
function selectRing(l,index){
  if(l.activeRing!=null&&l.paths[l.activeRing]){
    l.paths[l.activeRing].points=l.points;
    l.paths[l.activeRing].handles=l.handles||{};
  }
  const ring=l.paths[index];
  l.activeRing=index;l.points=ring.points;l.handles=ring.handles;
}
function compoundShapes(l){
  const result=[],all=new Map();
  (l.paths||[]).forEach((r,i)=>{
    const sh=pathShape(i===l.activeRing?l:r);
    if(r.owner<0){all.set(i,sh);result.push(sh)}
    else all.get(r.owner)?.holes.push(sh);
  });
  return result;
}
function rawShapeState(l,t){
  let shapes=l.paths?.length?compoundShapes(l):l.type==='text'&&l.model!=='caption'?geometryText(l,t):shapesFor(l);
  if(l.contours?.length&&shapes.length){
    const polys=polygons(shapes);
    polys[0].push(...l.contours.map(r=>r.map(p=>[...p])));
    shapes=polygonsBack(polys);
  }
  return shapes;
}
function storeShapeKey(l,t){
  l.morph||=[];
  const polys=polygons(rawShapeState(l,t));
  const k=l.morph.find(f=>Math.abs(f.t-t)<1e-5);
  if(k)k.polys=polys;
  else l.morph.push({t,polys});
  l.morph.sort((a,b)=>a.t-b.t);
}
function simplifiedRing(ring){
  const points=[];
  for(const p of ring){
    const q=points.at(-1);
    if(!q||Math.hypot(q[0]-p[0],q[1]-p[1])>1e-7)points.push(p);
  }
  if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-7)points.pop();
  return points;
}
function sampleClosedRing(r,n){
  const pts=simplifiedRing(r);
  if(!pts.length)return Array.from({length:n},()=>[0,0]);
  const lengths=[0];let total=0;
  pts.forEach((p,i)=>{let q=pts[(i+1)%pts.length];total+=Math.hypot(q[0]-p[0],q[1]-p[1]);lengths.push(total)});
  let j=0;
  return Array.from({length:n},(_,i)=>{
    const dist=total*i/n;
    while(j<pts.length-1&&lengths[j+1]<dist)j++;
    const a=pts[j],b=pts[(j+1)%pts.length],u=(dist-lengths[j])/(lengths[j+1]-lengths[j]||1);
    return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
  });
}
function shapeAt(l,t){
  const keys=l.morph;if(!keys?.length)return rawShapeState(l,t);
  const a=keys.filter(k=>k.t<=t).at(-1)||keys[0],b=keys.find(k=>k.t>t)||a;
  if(t<=a.t||a===b)return polygonsBack(a.polys);
  const u=(t-a.t)/(b.t-a.t),polys=[];
  for(let i=0;i<Math.max(a.polys.length,b.polys.length);i++){
    const from=a.polys[i],to=b.polys[i],poly=[];
    for(let j=0;j<Math.max(from?.length||0,to?.length||0);j++){
      const ar=from?.[j],br=to?.[j],ref=ar||br;
      const center=ref.reduce((v,p)=>[v[0]+p[0]/ref.length,v[1]+p[1]/ref.length],[0,0]);
      const n=Math.min(256,Math.max(12,ar?.length||0,br?.length||0));
      let left=sampleClosedRing(ar||[center],n),right=sampleClosedRing(br||[center],n);
      poly.push(left.map((p,k)=>[p[0]+(right[k][0]-p[0])*u,p[1]+(right[k][1]-p[1])*u]));
    }
    polys.push(poly);
  }
  return polygonsBack(polys);
}

function pathSpeedAt(l,t){
  const sample=tt=>V(val(l,'ax',tt),val(l,'ay',tt),val(l,'az',tt)).applyMatrix4(layerMatrixAt(l,tt));
  const dt=1/Math.max(1000,C().fps*80),a=Math.max(0,t-dt),b=Math.min(C().duration,t+dt);
  return b>a?sample(a).distanceTo(sample(b))/(b-a):0;
}
function connectedWarps(l,t){
  const nodes=expandNodes(l.nodes),end=nodes.find(n=>n.op==='几何输出'),ops=[],seen=new Set();
  for(let n=end;n&&!seen.has(n.id);n=nodes.find(q=>q.id===n.input)){
    seen.add(n.id);
    if(n.op==='扭转变形')ops.unshift({twist:nodeInput(l,n,t,35)});
    if(n.op==='弯曲变形')ops.unshift({bend:nodeInput(l,n,t,.23)});
  }
  return ops;
}
function geometryWarp(l,t,fieldRef){
  const v=k=>val(l,k,t),warps=connectedWarps(l,t);
  warps.push({twist:v('twist'),bend:v('bend')});
  const world=layerMatrixAt(l,t),basis=new THREE.Matrix3().setFromMatrix4(world).invert();
  const fields=(P.comps.find(c=>c.layers.includes(l._origin||l))?.layers||L()).filter(f=>f.type==='field'&&f.visible&&t>=f.in&&t<=f.out&&(!fieldRef||f.id===fieldRef));
  const pins=(l.pins||[]).map((p,i)=>({...p,...editPin(l,p,i,t)}));
  return (x,y,z)=>{
    for(const w of warps){
      if(w.twist){const a=w.twist*Math.PI/180*y,xx=x*Math.cos(a)+z*Math.sin(a);z=z*Math.cos(a)-x*Math.sin(a);x=xx}
      if(w.bend){x+=w.bend*y*y*.15;y*=1-w.bend*.15}
    }
    const result=V(x,y,z);
    for(const f of fields)result.add(fieldForce(f,V(x,y,z).applyMatrix4(world),t).applyMatrix3(basis));
    for(const p of pins){
      const px=x-p.x,py=y-p.y,weight=Math.exp(-(px*px+py*py));
      result.x+=weight*(p.dx+(px*Math.cos(p.rot)-py*Math.sin(p.rot))*p.scale-px);
      result.y+=weight*(p.dy+(px*Math.sin(p.rot)+py*Math.cos(p.rot))*p.scale-py);
    }
    return result;
  };
}
function contourSlice(sh,fraction){
  if(fraction>=1)return [sh];if(fraction<=0)return [];
  const poly=polygons([sh])[0],pts=poly[0],n=pts.length;
  const mx=pts.reduce((s,p)=>s+p[0],0)/n,my=pts.reduce((s,p)=>s+p[1],0)/n;
  let xx=0,yy=0,xy=0;
  for(const [x,y] of pts){xx+=(x-mx)**2;yy+=(y-my)**2;xy+=(x-mx)*(y-my)}
  const angle=.5*Math.atan2(2*xy,xx-yy);
  let dx=Math.cos(angle),dy=Math.sin(angle);
  if(Math.abs(dy)>.2?dy>0:dx<0){dx=-dx;dy=-dy}
  const dots=pts.map(([x,y])=>dx*x+dy*y),across=pts.map(([x,y])=>-dy*x+dx*y);
  const min=Math.min(...dots),max=Math.max(...dots),low=Math.min(...across)-1,high=Math.max(...across)+1,cut=min+(max-min)*fraction;
  const point=(u,v)=>[dx*u-dy*v,dy*u+dx*v];
  const rect=[[point(min-1,low),point(cut,low),point(cut,high),point(min-1,high)]];
  return polygonsBack(polygonClipping.intersection([poly],rect));
}
function trimContours(shapes,percent,write=false){
  if(percent>=100)return shapes;
  if(percent<=0)return [];
  const lengths=shapes.map(s=>s.getLength()),total=lengths.reduce((a,b)=>a+b,0);
  let remaining=total*percent/100;const result=[];
  for(let i=0;i<shapes.length&&remaining>0;i++){
    const shape=shapes[i],len=lengths[i];
    if(remaining>=len)result.push(shape);
    else if(write)result.push(...contourSlice(shape,remaining/len));
    else {
      const f=remaining/len,count=Math.max(3,Math.ceil(130*f)),points=[];
      for(let j=0;j<=count;j++)points.push(shape.getPointAt(f*j/count));
      const clipped=new THREE.Shape(points);
      if(shape.holes.length){const cuts=shape.holes.map(h=>[h.getPoints(16).map(p=>p.toArray())]);result.push(...polygonsBack(polygonClipping.difference(polygons([clipped]),...cuts)))}
      else result.push(clipped);
    }
    remaining-=len;
  }
  return result;
}
function addHammer(o,l,material){
  const body=mesh(extrude(plate(1.27,.66,0,.11),.78,.046),material);
  body.position.z=-.39;o.add(body);
  const faceMat=new THREE.MeshStandardMaterial({color:'#9e9691',metalness:.9,roughness:.36});
  const face=mesh(extrude(plate(1.20,.11,0,.035),.81,.022),faceMat);
  face.position.set(0,-.34,-.405);o.add(face);
  const start=V(.05,.20,0),end=V(2.47,1.33,-.40),axis=end.clone().sub(start),length=axis.length();
  const direction=axis.normalize(),rot=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),direction);
  const handleMat=new THREE.MeshStandardMaterial({color:'#64402e',metalness:.13,roughness:.73});
  let grip=mesh(new THREE.CylinderGeometry(.117,.16,length,14),handleMat);
  grip.position.copy(start).lerp(end,.5);grip.quaternion.copy(rot);o.add(grip);
  for(const [distance,height,radius] of [[.24,.27,.195],[.45,.05,.165],[1.83,.06,.14],[2.1,.06,.14],[2.38,.17,.15]]){
    const ring=mesh(new THREE.CylinderGeometry(radius,radius,height,16),faceMat);
    ring.position.copy(start).addScaledVector(direction,distance);ring.quaternion.copy(rot);o.add(ring);
  }
  for(const side of [-1,1]){
    const pin=mesh(new THREE.CylinderGeometry(.067,.067,.03,12),faceMat);pin.rotation.x=Math.PI/2;pin.position.set(.18,.06,side*.44);o.add(pin);
  }
}
function visibleHit(hit,l){
  const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;
  if(!m||!m.visible||m.opacity<=.002||val(l,'opacity')<=.2)return false;
  const p=hit.object.worldToLocal(hit.point.clone());
  const x=(p.x)/1.08,y=(p.y-.58)/1.22;
  if(l.mask==='矩形'&&Math.max(Math.abs(x),Math.abs(y))>1)return false;
  if(l.mask==='椭圆'&&Math.hypot(x,y)>1||l.mask==='反转椭圆'&&Math.hypot(x,y)<1)return false;
  const tex=m.userData.effects?.customMask?.value;
  if(m.userData.effects?.useMask?.value&&tex?.image){
    const cv=tex.image,a=Math.max(0,Math.min(cv.width-1,Math.floor((p.x/8+.5)*cv.width))),b=Math.max(0,Math.min(cv.height-1,Math.floor((.5-p.y/8)*cv.height)));
    if(cv.getContext('2d').getImageData(a,b,1,1).data[3]<2)return false;
  }
  const color=hit.object.geometry?.attributes.color;
  if(color?.itemSize===4&&hit.face&&Math.max(...[hit.face.a,hit.face.b,hit.face.c].map(i=>color.getW(i)))<=.002)return false;
  return true;
}
function pickLayer(e){
  const ray=rayAt(e);
  for(const h of ray.intersectObjects(root.children,true)){
    if(!h.object.isMesh)continue;
    let o=h.object,owner=null,selectable=null,visible=true;
    while(o){visible=visible&&o.visible;owner||=o.userData.layer;if(entries.get(o.userData.layer?.id)===o)selectable||=o.userData.layer;o=o.parent}
    if(!visible||!owner||!selectable||selectable.locked||['air','caption'].includes(owner.model)||!visibleHit(h,owner))continue;
    if(owner.matte){const matte=instanceOf(owner.matte)?.map.get(owner.matte);
      if(matte){let coverage=0;for(const m of ray.intersectObject(matte,true)){if(m.object.isMesh&&visibleHit(m,matte.userData.layer)){coverage=val(matte.userData.layer,'opacity')/100;if(owner.matteMode?.includes('亮度')){const c=new THREE.Color(sampledColor(matte.userData.layer,T));coverage*=.2126*c.r+.7152*c.g+.0722*c.b}break}}
        if((owner.matteMode?.includes('反转')?1-coverage:coverage)<=.002)continue}}
    return {l:selectable,h};
  }
}
function selectionBounds(l){
  const o=entries.get(l.id);if(!o)return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  function visit(node){if(!node.visible||node!==o&&node.userData.layer&&l.type!=='pre')return;
    const pos=node.isMesh&&node.geometry.attributes.position;
    if(pos&&node.material.visible&&node.material.opacity>.001){const m=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(node.matrixWorld),p=V();
      for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).applyMatrix4(m);const x=.5+p.x*.5,y=.5-p.y*.5;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}}
    for(const child of node.children)visit(child)
  }
  visit(o);return Number.isFinite(minX)?{minX,minY,maxX,maxY}:null
}
function hasSelectedParent(l){let p=l;while(p.parent){if(S.has(p.parent))return true;p=L().find(a=>a.id===p.parent);if(!p)break}return false}
function forgeDeckMaterial(l,baseMaterial){
  const mat=new THREE.MeshStandardMaterial({color:baseMaterial.color,metalness:.8,roughness:.36});
  const rt=new THREE.WebGLRenderTarget(512,288,{type:THREE.HalfFloatType});
  const reflect={target:rt,projection:{value:new THREE.Matrix4()},power:{value:.25},pixel:{value:new THREE.Vector2()}};
  mat.userData.reflection=reflect;
  mat.onBeforeCompile=shader=>{
    shader.uniforms.reflectionImage={value:rt.texture};shader.uniforms.reflectionProjection=reflect.projection;
    shader.uniforms.reflectionPower=reflect.power;shader.uniforms.reflectionPixel=reflect.pixel;
    shader.vertexShader='uniform mat4 reflectionProjection;varying vec4 reflectionUV;varying vec3 deckPos;varying float deckFace;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n deckPos=position;deckFace=normal.z;reflectionUV=reflectionProjection*modelMatrix*vec4(position,1.);');
    shader.fragmentShader='uniform sampler2D reflectionImage;uniform vec2 reflectionPixel;uniform float reflectionPower;varying vec4 reflectionUV;varying vec3 deckPos;varying float deckFace;\n'+noiseGL+'\n'+shader.fragmentShader
      .replace('#include <color_fragment>','#include <color_fragment>\n float toolMarks=fb(deckPos*vec3(4.,155.,7.));float scaleNoise=fb(deckPos*8.);diffuseColor.rgb*=.22+toolMarks*.62+scaleNoise*.32;')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=clamp(roughnessFactor+(toolMarks-.5)*.32,.12,.96);')
      .replace('#include <opaque_fragment>',`if(deckFace>.8&&reflectionUV.w>0.){
        vec2 ruv=reflectionUV.xy/reflectionUV.w*.5+.5;
        ruv+=reflectionPixel*vec2((toolMarks-.5)*3.,(scaleNoise-.5)*8.);
        vec3 reflected=vec3(0.);float weight=0.;
        for(int j=0;j<18;j++){float f=(float(j)+.5)/18.;float a=float(j)*2.399963;
          vec2 off=vec2(cos(a),sin(a))*sqrt(f)*reflectionPixel*(1.+roughnessFactor*19.);
          float w=exp(-f*2.);reflected+=texture2D(reflectionImage,clamp(ruv+off,0.,1.)).rgb*w;weight+=w;}
        float viewAngle=1.-max(0.,dot(normal,normalize(vViewPosition)));
        outgoingLight+=reflected/weight*reflectionPower*(.32+.68*viewAngle)*(.55+toolMarks*.6)*metalnessFactor;
      }
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey=()=>'workplate-mirror';
  return mat;
}
function renderDeckReflections(){
  const stages=[];
  function visit(inst){for(const [id,l] of inst.data){const o=inst.map.get(id);if(!o.visible)continue;if(l.model==='stage')stages.push([l,o,inst.sampleTimes.get(id)]);const sub=inst.subs.get(id);if(sub)visit(sub)}}
  visit(sceneInstance);
  for(const [l,o,t] of stages){
    const top=o.children[0]?.children[3],mat=top?.material,data=mat?.userData.reflection;if(!data)continue;
    mat.color.set(sampledColor(l,t));mat.metalness=val(l,'metal',t);mat.roughness=val(l,'rough',t);
    mat.opacity=val(l,'opacity',t)/100;mat.transparent=mat.opacity<1;
    data.power.value=val(l,'reflection',t);if(data.power.value<=.001)continue;
    const normal=V(0,0,1).transformDirection(top.matrixWorld),origin=V(0,0,.53).applyMatrix4(top.matrixWorld);
    const reflectPoint=p=>p.clone().addScaledVector(normal,-2*normal.dot(p.clone().sub(origin)));
    const mirrored=camera.clone();mirrored.position.copy(reflectPoint(camera.position));
    const target=reflectPoint(camera.position.clone().add(camera.getWorldDirection(V())));
    mirrored.up.copy(V(0,1,0).applyQuaternion(camera.quaternion).reflect(normal));
    mirrored.lookAt(target);mirrored.updateMatrixWorld(true);
    data.projection.value.multiplyMatrices(mirrored.projectionMatrix,mirrored.matrixWorldInverse);
    const w=Math.min(900,Math.max(160,Math.floor(canvas.width*.6))),h=Math.max(90,Math.round(w/camera.aspect));
    if(data.target.width!==w||data.target.height!==h)data.target.setSize(w,h);data.pixel.value.set(1/w,1/h);
    const shadowUpdate=renderer.shadowMap.autoUpdate;
    o.visible=false;renderer.shadowMap.autoUpdate=false;
    try{renderer.setRenderTarget(data.target);renderer.render(scene,mirrored)}
    finally{o.visible=true;renderer.shadowMap.autoUpdate=shadowUpdate;renderer.setRenderTarget(null)}
  }
}
