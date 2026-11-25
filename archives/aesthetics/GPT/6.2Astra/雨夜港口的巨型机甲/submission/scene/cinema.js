"use strict";
const beauty = new T.WebGLRenderTarget(1, 1, {
  type: rtFormat,
  minFilter: T.LinearFilter,
  magFilter: T.LinearFilter,
  depthBuffer: true,
});
beauty.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType);
beauty.depthTexture.minFilter = beauty.depthTexture.magFilter = T.NearestFilter;
const focalDepth = { value: 96 },
  pixelStep = { value: new T.Vector2(1 / 1280, 1 / 720) };
const pyramid = Array.from(
  { length: 5 },
  () =>
    new T.WebGLRenderTarget(1, 1, {
      type: rtFormat,
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      depthBuffer: false,
    })
);
const reduceMat = new T.ShaderMaterial({
  uniforms: { passPixels, source: { value: null }, texel: { value: new T.Vector2() }, extract: { value: 0 } },
  depthTest: false,
  depthWrite: false,
  vertexShader: flatVert,
  fragmentShader:
    viewportGL +
    `uniform sampler2D source;uniform vec2 texel;uniform float extract;
 void main(){vec2 s=texel*1.11;vec3 c=texture2D(source,vUv).rgb*.25;
 c+=.1875*(texture2D(source,vUv+s).rgb+texture2D(source,vUv-s).rgb+texture2D(source,vUv+vec2(s.x,-s.y)).rgb+texture2D(source,vUv+vec2(-s.x,s.y)).rgb);
 if(any(notEqual(c,c)))c=vec3(0.);c=clamp(c,vec3(0.),vec3(64.));float l=max(c.r,max(c.g,c.b));c*=mix(1.,smoothstep(.76,2.3,l),extract);gl_FragColor=vec4(c,1.);}`,
});
const aoTarget = new T.WebGLRenderTarget(1, 1, {
  depthBuffer: false,
  minFilter: T.LinearFilter,
  magFilter: T.LinearFilter,
});
const shutterRadiance = new T.WebGLRenderTarget(1, 1, {
  type: rtFormat,
  minFilter: T.LinearFilter,
  magFilter: T.LinearFilter,
  depthBuffer: false,
});
const lensScale = { value: new T.Vector2() };
const contactShade = new T.ShaderMaterial({
  depthWrite: false,
  depthTest: false,
  uniforms: { passPixels, depthMap: { value: beauty.depthTexture }, lensScale },
  vertexShader: flatVert,
  fragmentShader:
    viewportGL +
    `uniform sampler2D depthMap;uniform vec2 lensScale;
 vec3 viewPoint(vec2 uv){float d=texture2D(depthMap,uv).r;float z=.17*2300./(2300.-d*(2300.-.17));return vec3((uv*2.-1.)*lensScale*z,-z);}
 void main(){vec3 p=viewPoint(vUv);vec3 n=cross(dFdx(p),dFdy(p));float nl=length(n);n/=max(.000001,nl);
 
 float occ=0.;for(int i=0;i<10;i++){float f=float(i);float a=f*2.39996+.37;
 float radius=mix(.41,1.72,(f+.5)*.1);vec2 off=vec2(cos(a),sin(a))*radius/(-2.*p.z*lensScale);
 vec3 diff=viewPoint(vUv+off)-p;float d=max(.001,length(diff));
 occ+=max(0.,dot(n,diff/d)-.09)*(1.-smoothstep(.09,2.89,d));}
 float ao=p.z< -340.||nl<.000001?1.:clamp(1.-occ*.194,.54,1.);gl_FragColor=vec4(vec3(ao),1.);}`,
});
const film = new T.ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  uniforms: {
    passPixels,
    occlusion: { value: aoTarget.texture },
    firstSample: { value: null },
    shutterWeight: { value: 0 },
    depthMap: { value: beauty.depthTexture },
    pixelStep,
    focalDepth,
    beauty: { value: beauty.texture },
    b1: { value: pyramid[1].texture },
    b2: { value: pyramid[2].texture },
    b3: { value: pyramid[3].texture },
    b4: { value: pyramid[4].texture },
    time: clockUniform,
  },
  vertexShader: flatVert,
  fragmentShader:
    viewportGL +
    `uniform highp sampler2D beauty,b1,b2,b3,b4,depthMap,occlusion,firstSample;
 uniform float time,focalDepth,shutterWeight;uniform vec2 pixelStep;
 vec3 srgb(vec3 x){return mix(x*12.92,1.055*pow(max(x,vec3(.00001)),vec3(1./2.4))-.055,step(vec3(.0031308),x));}
 void main(){float deviceZ=texture2D(depthMap,vUv).r;float axialDepth=.17*2300./(2300.-deviceZ*(2300.-.17));
 float coc=smoothstep(.16,1.21,(axialDepth-focalDepth)/(focalDepth+.1));
 float aperture=mix(3.3,.86,smoothstep(23.,85.,focalDepth));vec2 r=coc*aperture*pixelStep*clamp(1./(pixelStep.y*810.),.66,3.2);
 vec3 c=texture2D(beauty,vUv).rgb;
 if(coc>.05){vec3 blur=vec3(0.);for(int i=0;i<7;i++){float a=6.28318*float(i)/7.;blur+=texture2D(beauty,vUv+r*vec2(cos(a),sin(a))).rgb;}c=c*.16+blur*.12;}
 vec3 glow=texture2D(b1,vUv).rgb*.13+texture2D(b2,vUv).rgb*.16+texture2D(b3,vUv).rgb*.22+texture2D(b4,vUv).rgb*.32;
 c*=mix(1.,texture2D(occlusion,vUv).r,.85*(1.-smoothstep(.7,2.3,max(c.r,max(c.g,c.b)))));c+=glow*.46;
 if(shutterWeight<0.){gl_FragColor=vec4(c,1.);return;}
 if(shutterWeight>0.)c=mix(c,texture2D(firstSample,vUv).rgb,shutterWeight);
 c*=1.03;vec2 v=(vUv-.5)*2.;c*=1.-.13*smoothstep(.32,1.56,dot(v,v));
 vec3 graded=c*(2.51*c+.03)/(c*(2.43*c+.59)+.14);
 graded=mix(vec3(dot(graded,vec3(.2126,.7152,.0722))),graded,1.045);
 float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy+floor(time*19.),vec2(.06711056,.00583715))))-.5;
 vec3 displayCode=clamp(srgb(clamp(graded,0.,1.))+grain*.006,0.,1.);
 gl_FragColor=vec4(floor(displayCode*255.+.5)/255.,1.);}`,
});
let width = 0,
  height = 0,
  exportLayout = null;
function fit() {
  let w = window.innerWidth,
    h = window.innerHeight,
    dpr = Math.min(window.devicePixelRatio || 1, 1.6, 3840 / w, 2160 / h);
  if (w === width && h === height && renderer.getPixelRatio() === dpr && exportLayout === exporting) return;
  width = w;
  height = h;
  exportLayout = exporting;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  w = Math.max(1, Math.round(w * dpr));
  h = Math.max(1, Math.round(h * dpr));
  shutterRadiance.setSize(exporting ? w : 1, exporting ? h : 1);
  // A fixed spatial grid makes the fine spray reproducible across export runs.
  // The final pass resolves the grid to the exact size of the caller's canvas.
  const samples = !exporting && renderer.capabilities.isWebGL2 && w * h < 2800000 ? 4 : 0;
  if (samples !== beauty.samples) {
    beauty.samples = samples;
    beauty.dispose();
  }
  const spatialScale = exporting ? Math.min(2, 3840 / w, 2160 / h) : 1;
  w = Math.round(w * spatialScale);
  h = Math.round(h * spatialScale);
  pixels.value = h;
  pixelStep.value.set(1 / w, 1 / h);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  beauty.setSize(w, h);
  aoTarget.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  waterRT.setSize(Math.max(64, Math.ceil(w * 0.48)), Math.max(48, Math.ceil(h * 0.48)));
  for (let k = 0; k < pyramid.length; k++)
    pyramid[k].setSize(Math.max(1, w >> (k + 1)), Math.max(1, h >> (k + 1)));
}
const mirrorNormal = V(0, 1, 0),
  waterPlane = new T.Plane(),
  clip = new T.Vector4(),
  clipCorner = new T.Vector4();
const mirrorLook = V(),
  mirrorUp = V(),
  rotationBasis = new T.Matrix4();
function reflectionPass() {
  camera.updateMatrixWorld();
  camera.getWorldDirection(mirrorLook);
  mirrorLook.reflect(mirrorNormal);
  waterMirror.position.copy(camera.position);
  waterMirror.position.y = 2 * WATER - camera.position.y;
  rotationBasis.extractRotation(camera.matrixWorld);
  mirrorUp.set(0, 1, 0).applyMatrix4(rotationBasis).reflect(mirrorNormal);
  waterMirror.up.copy(mirrorUp);
  waterMirror.lookAt(mirrorLook.add(waterMirror.position));
  waterMirror.near = camera.near;
  waterMirror.far = camera.far;
  waterMirror.updateMatrixWorld();
  waterMirror.projectionMatrix.copy(camera.projectionMatrix);
  mirrorProjection.multiplyMatrices(waterMirror.projectionMatrix, waterMirror.matrixWorldInverse);
  waterPlane
    .setFromNormalAndCoplanarPoint(mirrorNormal, V(0, WATER - 0.74, 0))
    .applyMatrix4(waterMirror.matrixWorldInverse);
  clip.set(waterPlane.normal.x, waterPlane.normal.y, waterPlane.normal.z, waterPlane.constant);
  let m = waterMirror.projectionMatrix.elements;
  clipCorner.set(
    (Math.sign(clip.x) + m[8]) / m[0],
    (Math.sign(clip.y) + m[9]) / m[5],
    -1,
    (1 + m[10]) / m[14]
  );
  clip.multiplyScalar(2 / clip.dot(clipCorner));
  m[2] = clip.x;
  m[6] = clip.y;
  m[10] = clip.z + 1 - 0.002;
  m[14] = clip.w;
  sea.visible = false;
  airFX.visible = false;
  renderer.setRenderTarget(waterRT);
  renderer.render(scene, waterMirror);
  sea.visible = true;
  airFX.visible = true;
}
function flightCentreAt(a, t, out) {
  const q = t + a.phase;
  return out.set(
    a.pos.x + 0.67 * Math.sin(q * 0.28),
    a.pos.y + 0.53 * Math.sin(q * 0.69),
    a.pos.z + 0.57 * Math.cos(q * 0.34)
  );
}
function updateWorld(t) {
  clockUniform.value = t;
  atmosphere(t);
  turbine.rotation.z = -0.81 * t;
  coreLamp.intensity = 112 + 10 * Math.sin(t * 2.2) + 4 * Math.sin(t * 5.1);
  coreDisc.color.set(0xffdb86).multiplyScalar(6.8 + 0.66 * Math.sin(t * 2.2));
  ship.position.y = 0.21 * Math.sin(t * 0.65 + 0.18);
  ship.rotation.x = 0.0039 * Math.sin(t * 0.87 + 0.12);
  ship.rotation.z = 0.0012 * Math.sin(t * 0.59);
  for (let a of aircraft) {
    let q = t + a.phase;
    flightCentreAt(a, t, a.g.position);
    a.g.rotation.set(
      0.024 * Math.sin(q * 0.63),
      a.heading + 0.045 * Math.sin(q * 0.25),
      0.027 * Math.cos(q * 0.75),
      "YXZ"
    );
    a.rotor.rotation.y = q * 35.8;
    a.tr.rotation.x = -q * 48;
    a.g.updateMatrixWorld(true);
    a.cone.start.value.copy(a.g.localToWorld(V(0, -1.64, 2.56)));
    a.cone.end.value
      .copy(a.target)
      .add(V(1.65 * Math.sin(0.34 * q), 1.08 * Math.cos(0.49 * q), 0.59 * Math.sin(q * 0.36)));
    a.searchLight.position.copy(a.cone.start.value);
    a.searchLight.target.position.copy(a.cone.end.value);
  }
}
function draw(t, target = null, shutterWeight = 0) {
  fit();
  focalDepth.value = camera.position.distanceTo(focus);
  updateWorld(t);
  reflectionPass();
  renderer.setRenderTarget(beauty);
  renderer.render(scene, camera);
  lensScale.value.set(
    Math.tan((camera.fov * Math.PI) / 360) * camera.aspect,
    Math.tan((camera.fov * Math.PI) / 360)
  );
  blit(contactShade, aoTarget);
  let src = beauty;
  for (let i = 0; i < pyramid.length; i++) {
    reduceMat.uniforms.source.value = src.texture;
    reduceMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
    reduceMat.uniforms.extract.value = i === 0 ? 1 : 0;
    blit(reduceMat, pyramid[i]);
    src = pyramid[i];
  }
  film.uniforms.shutterWeight.value = shutterWeight;
  film.uniforms.firstSample.value = shutterWeight > 0 ? shutterRadiance.texture : null;
  blit(film, target);
}
const views = [
  ["海面全景", [38.8, 19.6, 88.5], [1.5, 38.2, 0], 40.4, 53, 209],
  ["头部与护领", [5.35, 68.67, 16.96], [0, 66.98, 1.13], 34, 5.4, 45],
  ["核动力炉", [-5.71, 58.95, 23.98], [0.22, 56.47, 5.41], 34, 6.2, 52],
  ["右臂与机械手", [-38.6, 47.4, 30.5], [-15.6, 45.2, 0.72], 47.5, 10, 71],
  ["左臂与链锯剑", [42.7, 36.7, 51.7], [26.2, 31.15, 5.5], 47.5, 12.5, 105],
  ["肩甲与翼板", [25.74, 72.66, 21.0], [9.04, 64.32, -0.39], 37, 9.2, 63],
  ["背部总成", [-15.9, 64.5, -34.89], [0, 56.8, -1.7], 41.8, 10, 74],
  ["腰腹与骨盆", [11.5, 48.1, 27.8], [0.3, 46.4, 1], 37.7, 8.2, 58],
  ["腿部与海浪", [-23.4, 17.46, 49.12], [-1.65, 22.62, 0.15], 39, 13.2, 95],
  ["港口作业区", [-109.5, 46.12, 41.67], [-54.51, 34.45, -71.79], 46, 39, 236],
  ["直升机俯瞰", [54.34, 104.36, 75.26], [-3.41, 35.44, -23.34], 48, 53, 222],
].map(([name, e, f, fov, min, max]) => ({ name, eye: V(...e), focus: V(...f), fov, min, max }));
let selected = 0,
  yaw = 0,
  pitch = 0.12,
  radius = 90,
  focus = views[0].focus.clone(),
  transition = null,
  drag = null,
  exporting = false;
function spherical(from, at) {
  let q = from.clone().sub(at),
    r = q.length();
  return { r, yaw: Math.atan2(q.x, q.z), pitch: Math.asin(clamp(q.y / r, -1, 1)) };
}
function syncOrbit() {
  let s = spherical(camera.position, focus);
  yaw = s.yaw;
  pitch = s.pitch;
  radius = s.r;
}
function preset(i) {
  let v = views[i];
  camera.position.copy(v.eye);
  focus.copy(v.focus);
  camera.fov = v.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(focus);
  syncOrbit();
}
function orbitToCamera() {
  camera.position.set(
    focus.x + radius * Math.sin(yaw) * Math.cos(pitch),
    focus.y + radius * Math.sin(pitch),
    focus.z + radius * Math.cos(yaw) * Math.cos(pitch)
  );
  clearCamera();
  camera.lookAt(focus);
}
// Envelope tests are limited to the mechanical volumes and occupied quay structures.
const envelopes = [
  [0, 59, 0, 10.3, 7.4, 6.5],
  [0, 67, 0.25, 3.5, 3.3, 3.9],
  [0, 48.6, 0, 5.7, 4.8, 4.39],
  [0, 43.5, 0, 8.6, 4.9, 4.5],
  ...[-1, 1].flatMap((s) => [
    [s * 12.6, 61.8, 0, 5.2, 5.1, 5.26],
    [s * 14.25, 54.56, 0, 3.1, 6.8, 2.91],
    [s * (s > 0 ? 18.1 : 15.8), 43.9, 1, 3.65, 7.1, 3.4],
    [s * 7.9, 35, 0.4, 4.4, 10, 4.3],
    [s * 11.9, 19.2, 1, 4.21, 6.6, 4.21],
  ]),
];
function clearCamera() {
  let e = camera.position,
    d = e.clone().sub(focus);
  if (d.lengthSq() < 0.01) return;
  d.normalize();
  let desired = e.distanceTo(focus);
  for (let [x, y, z, a, b, c] of envelopes) {
    let q = V((e.x - x) / a, (e.y - y) / b, (e.z - z) / c);
    if (q.lengthSq() >= 1) continue;
    let n = V(d.x / a, d.y / b, d.z / c),
      dot = q.dot(n),
      k =
        (-dot + Math.sqrt(Math.max(0, dot * dot + n.lengthSq() * (1 - q.lengthSq())))) / n.lengthSq() + 0.27;
    e.addScaledVector(d, k);
  }
  e.y = Math.max(e.y, 15.06);
  if (e.z < -62 && e.z > -194 && Math.abs(e.x) < 254) e.y = Math.max(e.y, 17.18);
  const localEye = V(),
    localDirection = V();
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let solid of collisionSolids) {
      if (!solid.bounds.containsPoint(e)) continue;
      localEye.copy(e).applyMatrix4(solid.inverse);
      if (!solid.local.containsPoint(localEye)) continue;
      localDirection.copy(d).applyMatrix3(solid.linear);
      let exit = Infinity;
      for (let axis of ["x", "y", "z"]) {
        let dir = localDirection[axis];
        if (Math.abs(dir) > 1e-7)
          exit = Math.min(exit, ((dir > 0 ? solid.local.max : solid.local.min)[axis] - localEye[axis]) / dir);
      }
      if (Number.isFinite(exit)) {
        e.addScaledVector(d, exit + 0.012);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const wakeDistance = Math.min(Math.hypot(e.x - 13.44, e.z - 0.7), Math.hypot(e.x + 13.44, e.z + 0.6));
  e.y = Math.max(15.06 + 2.1 * Math.exp(-wakeDistance * 0.075), e.y);
  // A downward orbit ray may leave a hull through its keel. Resolve the
  // waterline and stacked decks together after enforcing the sea clearance.
  for (let pass = 0; pass < 12; pass++) {
    const oldHeight = e.y;
    for (const solid of collisionSolids) {
      if (
        solid.bounds.containsPoint(e) &&
        solid.local.containsPoint(localEye.copy(e).applyMatrix4(solid.inverse))
      ) {
        e.y = solid.bounds.max.y + 0.035;
      }
    }
    if (e.y === oldHeight) break;
  }
  if (transition === null && Math.abs(desired - e.distanceTo(focus)) > 0.04) syncOrbit();
}
const chooser = document.getElementById("choose"),
  list = document.getElementById("view-list"),
  nav = document.getElementById("viewfinder");
function menu(on) {
  list.hidden = !on;
  chooser.setAttribute("aria-expanded", String(on));
}
function updateLabels() {
  document.getElementById("view-name").textContent = views[selected].name;
  document.getElementById("counter").textContent = String(selected + 1).padStart(2, "0") + " / 11";
  for (let i = 0; i < list.children.length; i++)
    list.children[i].setAttribute("aria-current", String(i === selected));
}
function selectView(i) {
  if (exporting) return;
  selected = (i + views.length) % views.length;
  menu(false);
  let v = views[selected],
    a = spherical(camera.position, focus),
    b = spherical(v.eye, v.focus);
  let dy = b.yaw - a.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  transition = {
    a,
    b,
    dy,
    start: performance.now() / 1000,
    seconds: 1.35 + Math.min(0.67, focus.distanceTo(v.focus) * 0.011),
    f: focus.clone(),
    dest: v.focus.clone(),
    fromFov: camera.fov,
    toFov: v.fov,
  };
  updateLabels();
}
function travel(now) {
  if (!transition) return;
  let f = transition,
    u = clamp((now - f.start) / f.seconds, 0, 1),
    v = u * u * (3 - 2 * u);
  focus.lerpVectors(f.f, f.dest, v);
  yaw = f.a.yaw + f.dy * v;
  pitch = mix(f.a.pitch, f.b.pitch, v);
  radius = mix(f.a.r, f.b.r, v) + Math.sin(Math.PI * v) * Math.min(14, f.f.distanceTo(f.dest) * 0.19);
  camera.fov = mix(f.fromFov, f.toFov, v);
  camera.updateProjectionMatrix();
  orbitToCamera();
  if (u === 1) {
    transition = null;
    syncOrbit();
  }
}
for (let i = 0; i < views.length; i++) {
  let b = document.createElement("button");
  let idx = document.createElement("span");
  idx.className = "idx";
  idx.textContent = String(i + 1).padStart(2, "0");
  b.append(idx, document.createTextNode(views[i].name));
  b.onclick = () => selectView(i);
  list.append(b);
}
chooser.onclick = () => menu(list.hidden);
document.getElementById("prev").onclick = () => selectView(selected - 1);
document.getElementById("next").onclick = () => selectView(selected + 1);
window.addEventListener("pointerdown", (e) => {
  if (!nav.contains(e.target)) menu(false);
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  if (exporting || e.button > 2) return;
  transition = null;
  syncOrbit();
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add("drag");
  canvas.focus({ preventScroll: true });
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId || exporting) return;
  yaw -= (e.clientX - drag.x) * 0.0044;
  pitch = clamp(pitch + (e.clientY - drag.y) * 0.0036, -1.32, 1.42);
  drag.x = e.clientX;
  drag.y = e.clientY;
  orbitToCamera();
});
function release() {
  drag = null;
  canvas.classList.remove("drag");
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("lostpointercapture", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (exporting) return;
    transition = null;
    syncOrbit();
    let v = views[selected];
    radius = clamp(radius * Math.exp(clamp(e.deltaY, -340, 340) * 0.00113), v.min, v.max);
    orbitToCamera();
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if (exporting || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "Escape") {
    menu(false);
    chooser.focus();
    return;
  }
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    selectView(selected + (e.key === "ArrowRight" ? 1 : -1));
  } else if (/^[0-9]$/.test(e.key)) selectView(e.key === "0" ? 9 : Number(e.key) - 1);
  else if (e.key === "Home") selectView(0);
  else if (e.key === "End") selectView(10);
});
// The duration and distance of each move set its pace. Only the container
// reveal and the final landing have an internal speed change.
function rail(sec, from, to, lookFrom, lookTo, fov, cut = "match", beats = null) {
  const a=V(...from), b=V(...to), f=V(...lookFrom), g=V(...lookTo);
  return {sec, fov, beats, cut, pose(u) {
    return {eye:V().lerpVectors(a,b,u), aim:V().lerpVectors(f,g,u)};
  }};
}
function orbit(sec, centre, radius, lift, firstAngle, lastAngle, fov, cut = "match", beats = null) {
  const pivot=V(...centre);
  return {sec, fov, beats, cut, pose(u) {
    const angle=mix(firstAngle,lastAngle,u)*Math.PI/180;
    return {eye:V(pivot.x+radius*Math.sin(angle),pivot.y+lift,pivot.z+radius*Math.cos(angle)),
            aim:pivot.clone()};
  }};
}
const sequence = [
  // Approach across the swell; lift the viewer from the knee bearing to the collar.
  rail(9,[12,16,153],[18,18.9,86],[0,32,0],[.7,41.2,0],41),
  rail(4.5,[-15.8,19.6,42],[-13.3,43.9,42],[-5.1,31.8,0],[-2.1,57.7,.6],41),
  // The visor opens from three-quarter profile. Continue around the shoulder lip.
  orbit(5,[0,67.0,1.1],16.5,1.35,-41,32,33, "reveal"),
  orbit(4,[9.0,64.2,-.35],19.8,6.2,8,67,38),
  // Read both breastplates before the moving vanes fill the lens.
  rail(9,[-6.4,60.1,34.8],[1.9,56.9,15.4],[-.5,58,3],[.25,56.35,6.15],36, "detail"),
  // Transfer the furnace glow to the exhaust bells, then descend to the palm.
  rail(6,[-31.4,51.9,-20.3],[-28.0,32.6,-18.3],[-14.8,49.4,-1.2],[-16.7,33.55,1.0],36, "detail"),
  rail(5.5,[34.7,50.1,26.7],[43.5,17.0,25.2],[19.4,43.1,3.1],[31.8,14.7,9.7],37),
  // A rear orbit separates the paired exhausts from the spine. A short truck
  // across the piston banks continues the same screen-right travel.
  orbit(7,[0,56.7,-2.3],34.0,5.6,137,213,41, "reveal"),
  rail(4.5,[-13.7,47.5,23.6],[12.5,46.9,23.7],[-4.0,46.9,1.4],[4.1,46.5,1.4],37),
  // Main reveal: begin inside the foreground spray and pull out to the whole
  // machine. The longer, moving wide coincides with the large breaker at 62.7 s.
  rail(10.5,[-13.6,16.2,30.8],[2.8,19.5,100.4],[-9.4,23.9,.8],[.6,39.1,0],42),
  orbit(6.5,[-6,34,-20],108,65,-25,22,48, "impact"),
  // At ground level a close container edge sweeps past, uncovering the sentinel.
  rail(3.5,[-15.2,21.5,-95.3],[-29.6,21.8,-93.3],[3.6,45.6,0],[-1,47.8,0],46, "match", [[0,1.4],[.38,1.4],[.62,.82],[1,.82]]),
  // 75-84.5 s: an uninterrupted waterline arc. Cranes pass between the arms
  // in parallax; the silhouette is still turning through the lightning strike.
  orbit(9.5,[.8,38.4,0],96,-18.9,-51,22,40.5, "reveal"),
  rail(5.5,[12.6,20.8,43.9],[38.8,19.6,88.5],[.4,54.1,2.2],[1.5,38.2,0],40.4, "match", [[0,1],[.67,1],[1,0]])
];
const duration=sequence.reduce((total,shot)=>total+shot.sec,0);

// Match motion in the viewer's coordinates. Use perspective scale so a close
// and a wide can cut together without sharing the same speed in metres/second.
function motionBasis(pose,fov) {
  const back=pose.eye.clone().sub(pose.aim), range=back.length();
  const halfHeight=range*Math.tan(fov*Math.PI/360);
  back.normalize();
  const right=V().crossVectors(Yaxis,back).normalize();
  const up=V().crossVectors(back,right).normalize();
  return [right.multiplyScalar(halfHeight),up.multiplyScalar(halfHeight),back.multiplyScalar(range)];
}
function motionStep(a,b,basis) {
  const step=[];
  for(const field of ["eye","aim"]) {
    const v=b[field].clone().sub(a[field]);
    for(const axis of basis)step.push(v.dot(axis)/axis.lengthSq());
  }
  return step;
}
const tracks=sequence.map(shot=>{
  function edge(u,sign){
    const pose=shot.pose(u),basis=motionBasis(pose,shot.fov);
    const v=motionStep(pose,shot.pose(u+sign*.0001),basis).map(x=>x/(sign*.0001*shot.sec));
    return {basis,v,handle:null};
  }
  return {start:edge(0,1),end:edge(1,-1),arc:[0]};
});
for(let i=1;i<sequence.length;i++){
  if(sequence[i].cut!=="match")continue;
  const left=tracks[i-1].end,right=tracks[i].start;
  const a=Math.hypot(...left.v),b=Math.hypot(...right.v);
  const bisector=left.v.map((x,k)=>x/a+right.v[k]/b),mag=Math.hypot(...bisector);
  for(const [edge,speed] of [[left,a],[right,b]]){
    edge.handle=bisector.map((x,k)=>speed*x/Math.max(.0001,mag)-edge.v[k]);
  }
}
function pathAt(i,u){
  const shot=sequence[i],track=tracks[i],pose=shot.pose(u);
  for(const [edge,elapsed,sign] of [[track.start,u*shot.sec,1],[track.end,(1-u)*shot.sec,-1]]){
    const window=.95;
    if(!edge.handle||elapsed>=window)continue;
    const weight=sign*elapsed*(1-elapsed/window)**3;
    for(let axis=0;axis<3;axis++){
      pose.eye.addScaledVector(edge.basis[axis],weight*edge.handle[axis]);
      pose.aim.addScaledVector(edge.basis[axis],weight*edge.handle[axis+3]);
    }
  }
  return pose;
}
const arcSteps=128;
for(const [i,shot] of sequence.entries()){
  const track=tracks[i];
  let last=pathAt(i,0);
  for(let k=1;k<=arcSteps;k++){
    const pose=pathAt(i,k/arcSteps);
    track.arc.push(track.arc[k-1]+Math.hypot(...motionStep(last,pose,motionBasis(last,shot.fov))));
    last=pose;
  }
  if (shot.beats) {
    const area = shot.beats.slice(1).reduce((sum, [t, speed], k) => {
      const [previous, from] = shot.beats[k];
      return sum + (t - previous) * (from + speed) * .5;
    }, 0);
    const unitSpeed = track.arc[arcSteps] / (area * shot.sec);
    track.rates = shot.beats.map(([t, speed]) => [t * shot.sec, speed * unitSpeed]);
  }
}

function tourPoseAt(t){
  let i=0,local=t;
  while(i<sequence.length-1 && local>=sequence[i].sec)local-=sequence[i++].sec;
  const {arc,rates}=tracks[i];
  let distance = arc[arcSteps] * clamp(local / sequence[i].sec, 0, 1);
  if (rates) {
    distance = 0;
    for (let k=1;k<rates.length;k++) {
      const [start,v0]=rates[k-1], [end,v1]=rates[k], dt=end-start;
      const u=clamp((local-start)/dt,0,1);
      distance+=dt*(u*v0+(v1-v0)*u*u*u*(1-.5*u));
      if(local<=end)break;
    }
  }
  let lo=0,hi=arcSteps;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(arc[mid]<=distance)lo=mid;else hi=mid;}
  const u=(lo+clamp((distance-arc[lo])/(arc[hi]-arc[lo]),0,1))/arcSteps;
  const pose=pathAt(i,u);
  pose.fov=sequence[i].fov;
  return pose;
}
function shotAt(t){
  const pose=tourPoseAt(t);
  camera.position.copy(pose.eye);
  focus.copy(pose.aim);
  camera.fov=pose.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(focus);
}
let fps = 60,
  frames = duration * fps,
  normalTime = 0,
  last = performance.now() / 1000,
  saved = null;
const harbourSound = createHarbourSound({
  tourSeconds: duration,
  tourPose: tourPoseAt,
  currentPose: () => ({eye: camera.position, aim: focus}),
  currentTime: () => normalTime + Math.max(0, performance.now()/1000 - last),
});
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
async function exportFrame(i) {
  if (!exporting) throw new Error("Call begin('tour', {fps}) before frame().");
  if (!Number.isInteger(i) || i < 0 || i >= frames) throw new RangeError("Frame index outside tour");
  const t = i / fps;
  // Integrate linear radiance over a fixed shutter interval. Independent shots
  // start with a fresh exposure, including when a frame falls exactly on a cut.
  let shotStart = 0;
  for (let k = 0; k < sequence.length - 1; k++) {
    const next = shotStart + sequence[k].sec;
    if (t < next) break;
    shotStart = next;
  }
  const opening = Math.max(shotStart, t - 1 / 144);
  shotAt(opening);
  draw(opening, shutterRadiance, -1);
  shotAt(t);
  draw(t, null, 0.375);
  renderer.getContext().finish();
  await nextPaint();
}
window.videoExport = {
  runs: ["tour"],
  async begin(id, options = {}) {
    if (id !== "tour") throw new RangeError("Unknown camera run");
    let rate = Number(options.fps ?? 60);
    if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("Positive fps required");
    if (!exporting)
      saved = { p: camera.position.clone(), f: focus.clone(), fov: camera.fov, selected, time: normalTime };
    harbourSound.pause();
    exporting = true;
    fps = rate;
    frames = Math.max(1, Math.round(duration * rate));
    transition = null;
    release();
    menu(false);
    nav.hidden = true;
    canvas.style.cursor = "none";
    renderer.shadowMap.needsUpdate = true;
    await exportFrame(0);
    return { frames };
  },
  frame: exportFrame,
  audio: harbourSound.audio,
  end() {
    if (!exporting) return;
    exporting = false;
    nav.hidden = false;
    canvas.style.cursor = "";
    selected = saved.selected;
    focus.copy(saved.f);
    camera.position.copy(saved.p);
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(focus);
    syncOrbit();
    updateLabels();
    normalTime = saved.time;
    last = performance.now() / 1000;
    draw(normalTime);
    harbourSound.resume();
  },
};
preset(0);
updateLabels();
fit();
draw(0);
last = performance.now() / 1000;
function animate(ms) {
  let now = ms / 1000;
  if (!exporting) {
    normalTime += Math.max(0, now - last);
    travel(now);
    draw(normalTime);
  }
  last = now;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
