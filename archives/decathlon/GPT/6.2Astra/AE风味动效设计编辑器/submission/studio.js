const postRT = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    samples: 0,
  }),
  postScene = new THREE.Scene(),
  postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
let postMat = new THREE.ShaderMaterial({
  uniforms: {
    frameTex: { value: postRT.texture },
    depthTex: { value: postRT.depthTexture },
    pix: { value: new THREE.Vector2() },
    focusDist: { value: 8 },
    lens: { value: 0.03 },
    focal: { value: 1 },
    lightBloom: { value: 1 },
    hue: { value: 0 },
    sat: { value: 1 },
    bright: { value: 1 },
    blurAmt: { value: 0 },
    shad: { value: 0 },
  },
  depthTest: false,
  depthWrite: false,
  vertexShader: 'varying vec2 uvp;void main(){uvp=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `
uniform sampler2D frameTex,depthTex; uniform vec2 pix;uniform float focusDist,lens,focal,lightBloom,hue,sat,bright,blurAmt,shad;varying vec2 uvp;
float depthM(vec2 p){float z=texture2D(depthTex,p).r;return .05*150./(150.-z*(150.-.05));}
void main(){float dist=depthM(uvp);float coc=clamp((abs(dist-focusDist)/max(.1,dist))*lens*96.*focal,0.,12.)+blurAmt;vec3 color=texture2D(frameTex,uvp).rgb;float total=1.;vec3 glow=vec3(0.);
for(int i=0;i<32;i++){float a=float(i)*2.39996;float r=sqrt((float(i)+.5)/32.);vec2 v=vec2(cos(a),sin(a))*r;vec2 point=uvp+v*coc*pix;float dep=depthM(point);float w=dist<dep-1.&&coc<2.?0.:1.;color+=texture2D(frameTex,point).rgb*w;total+=w;vec3 hot=texture2D(frameTex,uvp+v*pix*17.*focal).rgb;glow+=max(vec3(0.),hot-vec3(.95))*.025;}
color=color/total+glow*.15*lightBloom;float vign=1.-.33*pow(length((uvp-.5)*1.4),1.7);color*=vign;vec3 axis=normalize(vec3(1.));color=color*cos(hue)+cross(axis,color)*sin(hue)+axis*dot(axis,color)*(1.-cos(hue));color=mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,sat)*bright;gl_FragColor=vec4(max(color,vec3(0.)),texture2D(frameTex,uvp).a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
function postFrame() {
  let w = canvas.width,
    h = canvas.height;
  if (postRT.width !== w || postRT.height !== h) postRT.setSize(w, h);
  let u = postMat.uniforms;
  u.pix.value.set(1 / w, 1 / h);
  u.focal.value = h / 500;
  u.focusDist.value = sceneCam ? val(sceneCam.l, 'focus', sceneCam.t) : 8;
  u.lens.value = sceneCam ? val(sceneCam.l, 'aperture', sceneCam.t) : 0.04;
  let adj = [];
  u.hue.value = adj.reduce((s, l) => s + (val(l, 'hue') * Math.PI) / 180, 0);
  u.sat.value = adj.reduce((s, l) => s * val(l, 'saturation'), 1);
  u.bright.value = adj.reduce((s, l) => s * val(l, 'brightness'), 1);
  u.blurAmt.value = adj.reduce((s, l) => s + val(l, 'blur'), 0);
  u.lightBloom.value = 1 + adj.reduce((s, l) => s + val(l, 'glow'), 0);
  renderDeckReflections();
  renderer.setRenderTarget(postRT);
  renderer.render(scene, camera);
  postMat.uniforms.frameTex.value = composeView(postRT);
  drawFinal();
}
function furnaceAtmosphere(group) {
  let rng = rand(620);
  const smoke = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#c26f43') }, salt: { value: 30 } },
    vertexShader:
      'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      noiseGL +
      `varying vec2 st;uniform vec3 tint;uniform float salt;void main(){vec2 p=st-.5;float n=fb(vec3(p*vec2(7.,6.),salt));float f=fb(vec3(p*vec2(6.,9.)+n*2.7,salt+4.));float a=smoothstep(.33,.67,f)*(1.-smoothstep(.22,.57,length(p*vec2(.9,1.1))));gl_FragColor=vec4(tint*(.3+f),a*.56);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 8; i++) {
    let m = smoke.clone();
    m.uniforms.salt.value = rng() * 75;
    m.uniforms.tint.value.set(i % 3 ? '#a1806e' : '#e47939').multiplyScalar(0.13);
    let plane = new THREE.Mesh(new THREE.PlaneGeometry(8 + rng() * 7, 3 + rng() * 6), m);
    plane.position.set(i * 0.99 - 3.8 + rng() * 2, 0.3 + rng() * 2.8, -3 - i * 0.72);
    plane.rotation.z = rng() * 0.6 - 0.3;
    group.add(plane);
  }
  let metal = new THREE.MeshStandardMaterial({ color: '#352c29', metalness: 0.7, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    let z = -7 - i * 3,
      x = -3 + i * 1.73;
    for (let j = 0; j < 3; j++) {
      let pipe = mesh(new THREE.CylinderGeometry(0.12, 0.12, 11, 12), metal);
      pipe.position.set(x + (j - 1) * 0.43, 2, z);
      pipe.rotation.z = 1.46;
      group.add(pipe);
    }
    let b = mesh(new THREE.BoxGeometry(0.3, 8, 0.28), metal);
    b.rotation.z = 0.68;
    b.position.set(x, 1, z);
    group.add(b);
  }
  let pts = [],
    colors = [];
  for (let i = 0; i < 420; i++) {
    let x = (rng() - 0.5) * 17,
      y = rng() * 7 - 1,
      z = -0.7 - rng() * 10;
    pts.push(x, y, z, x + 0.007 + rng() * 0.037, y + 0.012 + rng() * 0.069, z);
    let n = 0.18 + rng() ** 3 * 3;
    colors.push(n, n * 0.23, n * 0.028, n * 0.3, n * 0.058, 0.002);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  let embers = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  embers.name = '炉尘';
  group.add(embers);
}
function surfaceMods(l, m) {
  if (m.userData.effects) return;
  let u = (m.userData.effects = {
    mask: { value: 0 },
    blur: { value: 0 },
    tintHue: { value: 0 },
    tintSat: { value: 1 },
    tintBright: { value: 1 },
    outline: { value: 0 },
    reveal: { value: 1 },
    customMask: { value: null },
    useMask: { value: 0 },
    flatColor: { value: 0 },
  });
  let compile = m.onBeforeCompile;
  m.onBeforeCompile = (s) => {
    compile(s);
    Object.assign(s.uniforms, u);
    s.fragmentShader =
      'uniform float mask,blur,tintHue,tintSat,tintBright,outline,reveal,useMask,flatColor;uniform sampler2D customMask;\n' +
      s.fragmentShader
        .replace(
          '#include <alphatest_fragment>',
          `if(mask>.5){vec2 mp=(vForge.xy-vec2(0.,.58))/vec2(1.08,1.22);float sd=mask<1.5?max(abs(mp.x),abs(mp.y)):length(mp);if(mask<2.5&&sd>1.||mask>2.5&&sd<1.)discard;}if(useMask>.5){float mc=texture2D(customMask,clamp(vForge.xy/8.+.5,0.,1.)).a;diffuseColor.a*=mc;if(mc<.01)discard;}
#include <alphatest_fragment>`,
        )
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight=mix(outgoingLight,diffuse,flatColor);vec3 ua=normalize(vec3(1.));outgoingLight=outgoingLight*cos(tintHue)+cross(ua,outgoingLight)*sin(tintHue)+ua*dot(ua,outgoingLight)*(1.-cos(tintHue));outgoingLight=mix(vec3(dot(outgoingLight,vec3(.2126,.7152,.0722))),outgoingLight,tintSat)*tintBright;
#include <opaque_fragment>`,
        );
  };
}
function updateSurface(l, m, t) {
  surfaceMods(l, m);
  let link = entries.get(l.id)?.userData.nodeTint;
  if (link) m.color.set(link);
  let u = m.userData.effects;
  u.flatColor.value = ['shape', 'text'].includes(l.type) && val(l, 'depth', t) < 0.03 ? 1 : 0;
  u.mask.value = Math.max(0, ['无', '矩形', '椭圆', '反转椭圆'].indexOf(l.mask));
  u.tintHue.value = 0;
  u.tintSat.value = 1;
  u.tintBright.value = 1;
  if (l.masks?.length) {
    let key = JSON.stringify([
      l.masks,
      l.matte,
      version,
      l.matte || l.masks?.some((m) => m.keys?.length) ? t : 0,
    ]);
    if (u.maskkey !== key) {
      let cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      let ctx = cv.getContext('2d');
      ctx.fillStyle = 'white';
      if (!l.masks?.length || l.masks?.[0]?.invert) ctx.fillRect(0, 0, 256, 256);
      for (let raw of l.masks || []) {
        let mask = maskAt(raw, t);
        ctx.save();
        ctx.filter = 'blur(' + mask.feather + 'px)';
        ctx.globalCompositeOperation = mask.invert ? 'destination-out' : 'source-over';
        let x = 128 + mask.x * 32,
          y = 128 - mask.y * 32;
        ctx.beginPath();
        if (mask.points?.length) {
          mask.points.forEach(([px, py], i) =>
            ctx[i ? 'lineTo' : 'moveTo'](x + px * 32, y - py * 32),
          );
          ctx.closePath();
        } else if (mask.shape === '矩形')
          ctx.rect(x - mask.w * 16, y - mask.h * 16, mask.w * 32, mask.h * 32);
        else ctx.ellipse(x, y, Math.abs(mask.w) * 16, Math.abs(mask.h) * 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      u.customMask.value?.dispose();
      u.customMask.value = new THREE.CanvasTexture(cv);
      u.maskkey = key;
    }
    u.useMask.value = 1;
    m.transparent = true;
  } else u.useMask.value = 0;
}
function polygons(shapes) {
  return shapes.map((s) =>
    [s.getPoints(18), ...s.getPointsHoles(18)].map((pts) => pts.map((p) => [p.x, p.y])),
  );
}
function polygonsBack(multi) {
  return multi.map((poly) => {
    let out = new THREE.Shape();
    poly.forEach((ring, i) => {
      let pts = ring.map(([x, y]) => new THREE.Vector2(x, y));
      if (i) out.holes.push(new THREE.Path(pts));
      else out.setFromPoints(pts);
    });
    return out;
  });
}
function pathOps(shapes, l, t) {
  for (let op of l.ops || []) {
    if (op.type === '重复器') {
      let rings = polygons(shapes),
        all = [];
      for (let i = 0; i < Math.min(50, Math.max(1, val(l, 'repeat', t))); i++)
        all.push(
          ...rings.map((p) => p.map((r) => r.map(([x, y]) => [x + i * val(l, 'offset', t), y]))),
        );
      shapes = polygonsBack(all);
    } else if (op.type === '修剪路径') {
      shapes=trimContours(shapes,val(l,'trim',t),false);
    } else {
      let other = L().find((a) => a.id === op.target);
      if (!other) continue;
      let transform = layerMatrixAt(l, t).invert().multiply(layerMatrixAt(other, t));
      let rhs = polygons(shapesFor(other)).map((p) =>
        p.map((r) => r.map(([x, y]) => V(x, y, 0).applyMatrix4(transform).toArray().slice(0, 2))),
      );
      try {
        shapes = polygonsBack(
          polygonClipping[{ 并集: 'union', 差集: 'difference', 交集: 'intersection' }[op.type]](
            polygons(shapes),
            rhs,
          ),
        );
      } catch {}
    }
  }
  return shapes;
}

/* Spatial paths use an arc-length lookup independent of the temporal curve. */
const componentKeys = ['x', 'y', 'z'],
  vArr = (v) => new THREE.Vector3(...v);
function timedEase(q, b, u) {
  if(u<=0||u>=1)return u;
  if (q.mode === 'hold' || b.inMode === 'hold') return u === 1 ? 1 : 0;
  let a = q.mode === 'bezier',
    c = (b.inMode || q.mode) === 'bezier';
  if (!a && !c) return u;
  let p1 = a ? (q.outHandle ?? 0) : 1 / 3,
    p2 = c ? (b.inHandle ?? 1) : 2 / 3;
  if(q.outTime!=null||b.inTime!=null){
    const x1=a?q.outTime??1/3:1/3,x2=c?b.inTime??2/3:2/3;
    let lo=0,hi=1;
    for(let n=0;n<18;n++){let s=(lo+hi)/2,x=3*(1-s)**2*s*x1+3*(1-s)*s*s*x2+s**3;if(x<u)lo=s;else hi=s}
    u=(lo+hi)/2;
  }
  return 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u * u * p2 + u ** 3;
}
function spatialPos(l, t) {
  let times = [...new Set(componentKeys.flatMap((k) => (l.keys[k] || []).map((q) => q.t)))].sort(
    (a, b) => a - b,
  );
  if (times.length < 2) return null;
  let idx = times.findIndex((x) => x >= t);
  if (idx <= 0) return null;
  let a = times[idx - 1],
    b = times[idx],
    get = (tt) => V(...componentKeys.map((k) => basePlain(l, k, tt))),
    p = get(a),
    n = get(b),
    sa = l.space?.[a] || {},
    sb = l.space?.[b] || {};
  if (!sa.out && !sb.in) return null;
  let mid = n
      .clone()
      .sub(p)
      .multiplyScalar(1 / 3),
    c1 = p.clone().add(sa.out ? vArr(sa.out) : mid),
    c2 = n.clone().add(sb.in ? vArr(sb.in) : mid.multiplyScalar(-1)),
    curve = new THREE.CubicBezierCurve3(p, c1, c2, n),
    keyAt = (t) =>
      componentKeys.map((k) => l.keys[k]?.find((q) => q.t === t)).find(Boolean) || {
        mode: 'linear',
      },
    u = timedEase(keyAt(a), keyAt(b), (t - a) / (b - a));
  return curve.getPointAt(Math.min(1, Math.max(0, u)));
}
function geometryText(l, t) {
  let text = l.text || ' ',
    lines = text.split('\n').slice(0, 12),
    font = val(l, 'fontSize', t) || 1,
    spacing = val(l, 'spacing', t),
    leading = val(l, 'line', t),
    mode = l.textUnit || '逐字',
    units =
      mode === '逐行'
        ? lines
        : mode === '逐词'
          ? text.match(/\S+/g) || []
          : Array.from(text.replaceAll('\n', '')),
    idx = 0,
    out = [];
  for (let row = 0; row < lines.length; row++) {
    let parts =
      mode === '逐行'
        ? [lines[row]]
        : mode === '逐词'
          ? lines[row].split(/\s+/)
          : Array.from(lines[row]);
    let widths = parts.map(
        (c) =>
          Math.max(.4,fontAdvance(c))*font+
          spacing,
      ),
      total = widths.reduce((a, b) => a + b, 0),
      cur = l.align === '左对齐' ? 0 : l.align === '右对齐' ? -total : -total / 2;
    for (let j = 0; j < parts.length; j++, idx++) {
      let pct = ((idx + 0.5) / Math.max(1, units.length)) * 100 - off(l, 'animOffset', t),
        start = val(l, 'animStart', t),
        end = val(l, 'animEnd', t),
        soft = Math.max(0.001, val(l, 'animSoft', t)),
        influence = Math.max(0, Math.min(1, (pct - start) / soft, (end - pct) / soft));
      let offX = off(l, 'animX', t) * influence,
        offY = off(l, 'animY', t) * influence,
        ang = off(l, 'animRot', t) * 0.01745 * influence,
        scale = font * (1 + (off(l, 'animScale', t) * influence) / 100),
        origin = cur + widths[j] / 2;
      let transformed = polygons(fontShapes(parts[j])).map((p) =>
        p.map((r) =>
          r.map(([x, y]) => {
            y -= 1.55;
            return [
              origin + offX + (x * Math.cos(ang) - y * Math.sin(ang)) * scale,
              1.55 * font -
                row * leading * 3 * font +
                offY +
                (x * Math.sin(ang) + y * Math.cos(ang)) * scale,
            ];
          }),
        ),
      );
      let partShapes = polygonsBack(transformed);
      for (let s of partShapes) s.charAlpha = 1 + (val(l, 'animOpacity', t) / 100 - 1) * influence;
      out.push(...partShapes);
      cur += widths[j];
    }
  }
  return out;
}
function off(l, k, t) {
  return val(l, k, t) || 0;
}
function vectorShapes(l,t){return shapeAt(l,t)}
function nodeGeometry(l, t, raw, seenLayers=new Set([l.id])) {
  let ns = expandNodes(l.nodes),
    end = ns.find((n) => n.op === '几何输出');
  if (!end) return { shapes: raw, depth: undefined };
  let memo = new Map();
  function evalN(n, seen) {
    if (!n || seen.has(n.id)) return { shapes: [], depth: 0 };
    if (memo.has(n.id)) return memo.get(n.id);
    let next = new Set(seen).add(n.id),
      base = n.input
        ? evalN(
            ns.find((s) => s.id === n.input),
            next,
          )
        : { shapes: raw, depth: 0 },
      res = { ...base };
    if (n.op === '文字轮廓' || n.op === '路径输入') {
      let src = sourceOf(n.ref);
      res = { shapes: src && src.id !== l.id ? upstreamShapes(src,t,seenLayers) : raw, depth: 0 };
    }
    if (n.op === '挤出实体') res.depth = nodeInput(l, n, t, val(l, 'depth', t));
    if (n.op === '几何输出' && !n.input) res.shapes = [];
    if (n.op === '材质颜色') {
      let color = ns.find((a) => a.id === n.control);
      res.tint = color?.tint || n.tint || l.color;
    }
    if (n.op === '场驱动变形') {
      let node = ns.find((a) => a.id === n.control);
      res.field = node?.ref || n.ref;
    }
    if (n.op === '分布实例' || n.op === '变换几何') {
      let vNode = ns.find((a) => a.id === n.control && a.op === '向量');
      let arr = [],
        p = polygons(res.shapes),
        count =
          n.op === '分布实例' ? Math.min(32, Math.max(1, Math.round(nodeInput(l, n, t, 3)))) : 1;
      for (let i = 0; i < count; i++) {
        let off = n.op === '分布实例' ? i * (n.step ?? 1.4) : nodeInput(l, n, t, 0.5);
        arr.push(
          ...p.map((s) =>
            s.map((r) =>
              r.map(([x, y]) => [x + off, y + (vNode ? val(l, vNode.param + 'Y', t) : 0)]),
            ),
          ),
        );
      }
      res.shapes = polygonsBack(arr);
    }
    memo.set(n.id, res);
    return res;
  }
  return evalN(end, new Set());
}
function temporalGeometry(l, t) {
  return !!(
    l.pins?.length ||
    l.morph?.length ||
    (l.type === 'text' && Object.keys(l.keys).length) ||
    l.ops?.length ||
    l.source ||
    Object.values(l.expr).some(Boolean) ||
    expandNodes(l.nodes).some((n) => n.ref || n.control || (n.param && l.keys[n.param])) ||
    L().some((f) => f.type === 'field' && f.visible)
  );
}
let simCache = new Map(),
  snapCache = new Map(),
  simVersion = -1,
  proxyObjs = new Map();
function layerMatrixAt(l, t, seen = new Set()) {
  let v = (k) => val(l, k, t),
    pos = V(v('x'), v('y'), v('z')),
    sc = V(v('sx'), v('sy'), v('sz')).multiplyScalar(0.01 * v('size')),
    q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(v('rx') * 0.01745, v('ry') * 0.01745, v('rz') * 0.01745),
    );
  pos.sub(V(v('ax'), v('ay'), v('az')).multiply(sc).applyQuaternion(q));
  let m = new THREE.Matrix4().compose(pos, q, sc),
    c = P.comps.find((c) => c.layers.includes(l._origin || l)),
    parent = c?.layers.find((p) => p.id === l.parent);
  if (parent && !seen.has(parent.id))
    m.premultiply(layerMatrixAt(parent, t, new Set(seen).add(l.id)));
  return m;
}
function simSnapshots(l, t) {
  let frame = Math.floor(t * 24),
    key = (currentInstance?.path || '') + l.id + '/' + frame;
  t = frame / 24;
  if (snapCache.has(key)) return snapCache.get(key);
  let movable =
      ['shape', 'geo', 'text'].includes(l.type) &&
      !['stage', 'air', 'hammer', 'caption'].includes(l.model),
    o = entries.get(l.id) || instanceOf(l.id)?.map.get(l.id);
  if (!o) return [];
  let objs = [];
  if (movable) {
    let tmp = proxyObjs.get(l.id);
    if (!tmp) {
      tmp = createObj(l);
      proxyObjs.set(l.id, tmp);
    }
    repGeometry(l, tmp, frame / 24);
    for(const part of tmp.children.filter(c=>c.isMesh&&c.visible&&(c===tmp.children[0]||c.userData.replica))){
      const geometry=part.geometry;
      if(!geometry?.attributes.position?.count)continue;
      part.updateMatrix();const m=new THREE.Mesh(geometry,forged(l));
      m.matrixWorld.copy(layerMatrixAt(l,t)).multiply(part.matrix);objs.push(m);
    }
  } else {
    let local = o.matrixWorld.clone().invert(),
      mat = layerMatrixAt(l, t);
    o.traverse((child) => {
      if (child.isMesh && (!child.userData.layer || child === o)) {
        let m = new THREE.Mesh(child.geometry, child.material);
        m.matrixWorld.copy(mat).multiply(local).multiply(child.matrixWorld);
        objs.push(m);
      }
    });
  }
  for (let m of objs) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.userData.box = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
  }
  snapCache.set(key, objs);
  if (snapCache.size > 180) snapCache.delete(snapCache.keys().next().value);
  return objs;
}
const collisionRay = new THREE.Raycaster(),
  segmentBox = new THREE.Box3();
function particlePath(l, t0, seed, layers) {
  let ck = (currentInstance?.path || '') + l.id + '/' + seed + '/' + t0;
  if (simCache.has(ck)) return simCache.get(ck);
  let r = rand(seed),
    src = sourceOf(l.source),
    meshes = src ? simSnapshots(src, t0) : [],
    origin = V(),
    normal = V(0, 1, 0),
    v = (k) => val(l, k, t0),
    spawnMode = l.emitMode || '几何表面';
  const contour=spawnMode==='轮廓曲线',target=sourceOf(l.impactTarget);
  let sample=spawnMode!=='点'&&meshes.length?sampleSurface(meshes,r,contour):null;
  if(sample&&target&&t0>=target.in&&t0<=target.out){
    const contact=V(0,-.34,0).applyMatrix4(layerMatrixAt(target,t0));
    const chosenScore=s=>{const p=s.mesh.geometry.attributes.position;const center=V();for(const ix of s.indices)center.add(V().fromBufferAttribute(p,ix));return center.divideScalar(3).applyMatrix4(s.mesh.matrixWorld).distanceToSquared(contact)};
    let best=chosenScore(sample);
    for(let i=0;i<17;i++){let q=sampleSurface(meshes,r,contour);if(q){let score=chosenScore(q);if(score<best){sample=q;best=score}}}
  }
  if (sample) {
    const {
        mesh,
        indices: [ia, ib, ic],
      } = sample,
      geom = mesh.geometry,
      pos = geom.attributes.position,
      norm = geom.attributes.normal;
    let a = V().fromBufferAttribute(pos, ia),
      b = V().fromBufferAttribute(pos, ib),
      c = V().fromBufferAttribute(pos, ic);
    let u = r(),
      s = spawnMode === '轮廓曲线' ? 0 : r();
    if (u + s > 1) {
      u = 1 - u;
      s = 1 - s;
    }
    origin
      .copy(a)
      .addScaledVector(b.sub(a), u)
      .addScaledVector(c.sub(a), s)
      .applyMatrix4(mesh.matrixWorld);
    normal.fromBufferAttribute(norm, ia).transformDirection(mesh.matrixWorld);
    origin.addScaledVector(normal, 0.009);
  }
  let emitterMatrix = layerMatrixAt(l, t0);
  origin.applyMatrix4(emitterMatrix);
  normal.transformDirection(emitterMatrix);
  let speed = v('speed'),
    dir = V((r() - 0.5) * 1.9, 0.08 + r() * 1.33, (r() - 0.5) * 1.45)
      .addScaledVector(normal, 0.54)
      .multiplyScalar(speed * (0.45 + r() * 0.78)),
    ttl = Math.max(0.03, v('life') * (0.45 + r() * 1.2)),
    drag = Math.max(0, v('drag')),
    gravity = v('gravity'),
    steps = Math.min(750, Math.ceil(ttl * 24)),
    traj = [origin.clone()],
    impacts = [],
    fields = layers.filter((f) => f.type === 'field' && f.visible),
    collide = layers.filter(
      (a) =>
        a.visible &&
        (a !== src || a.collider) &&
        (['stage', 'hammer'].includes(a.model) || a.collider),
    ),
    p = origin.clone(),
    dt = 1 / 24;
  for (let j = 1; j <= steps; j++) {
    let now = t0 + j * dt;
    dir.multiplyScalar(Math.exp(-Math.max(0,val(l,'drag',now))*dt));
    dir.y -= val(l,'gravity',now)*dt;
    dir.x += val(l,'windX',now)*dt;
    dir.z += val(l,'windZ',now)*dt;
    for (let f of fields) dir.addScaledVector(fieldForce(f, p, now), dt);
    let q = p.clone().addScaledVector(dir, dt),
      length = q.distanceTo(p);
    segmentBox.setFromPoints([p, q]).expandByScalar(0.002);
    collisionRay.set(p, dir.clone().normalize());
    collisionRay.far = length + 0.001;
    let hit = null,
      ob = null;
    for (let a of collide) {
      if (now < a.in || now > a.out) continue;
      if (a.model === 'stage' && Math.min(p.y, q.y) > 0.05 + val(a, 'y', now)) continue;
      if (a.model === 'hammer' && Math.max(p.y, q.y) < val(a, 'y', now) - 0.7) continue;
      for (let m of simSnapshots(a, now)) {
        if (!segmentBox.intersectsBox(m.userData.box)) continue;
        let h = collisionRay.intersectObject(m, false)[0];
        if (h && (!hit || h.distance < hit.distance)) {
          hit = h;
          ob = a;
        }
      }
    }
    if (hit) {
      let nn = hit.face.normal
          .clone()
          .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)),
        vel = surfaceVelocity(ob, hit, now, dt),
        rel = dir.sub(vel);
      if (rel.dot(nn) > 0) nn.negate();
      let normalSpeed = rel.dot(nn),
        tangent = rel.clone().addScaledVector(nn, -normalSpeed);
      dir
        .copy(tangent.multiplyScalar(1 - Math.min(0.99, Math.max(0, l.friction ?? 0.23))))
        .addScaledVector(nn, -normalSpeed * (l.bounce ?? 0.53))
        .add(vel);
      q = hit.point.clone().addScaledVector(nn, 0.004);
      impacts.push(j * dt);
    }
    p = q;
    traj.push(p.clone());
  }
  let result = { traj, ttl, impacts, shine: 0.55 + r() * 1.7 };
  simCache.set(ck, result);
  if (simCache.size > 6800) simCache.delete(simCache.keys().next().value);
  return result;
}
function evaluateParticles(l, o, t) {
  if (simVersion !== version) {
    simCache.clear();
    snapCache.clear();
    proxyObjs.clear();
    simVersion = version;
  }
  let pos = o.children[0].geometry.attributes.position,
    cl = o.children[0].geometry.attributes.color,
    life = l.expr.life?Math.max(0,t-l.in):Math.max(.03,l.p.life,...(l.keys.life||[]).map(q=>q.v))*1.7,
    col = new THREE.Color(sampledColor(l, t)),
    size = val(l, 'trail', t),
    ribbon = spriteRibbon(o),
    thickness = val(l, 'trailWidth', t) || 0.006,
    rc = 0,
    count = 0,
    layers = P.comps.find((c) => c.layers.includes(l._origin || l))?.layers || L(),
    source = sourceOf(l.source);
  for (let drawable of [o.children[0], ribbon]) {
    drawable.material.opacity=Math.max(0,Math.min(1,val(l,'opacity',t)/100));
    drawable.matrixAutoUpdate = false;
    drawable.matrix.copy(o.matrixWorld).invert().multiply(currentInstance.container.matrixWorld);
    drawable.matrixWorldNeedsUpdate = true;
  }
  function at(p, u) {
    let i = Math.max(0, Math.min(p.traj.length - 1.00001, u * 24)),
      j = Math.floor(i);
    return p.traj[j].clone().lerp(p.traj[Math.min(j + 1, p.traj.length - 1)], i - j);
  }
  for (let tick = Math.max(0, Math.floor((t - life) * 24)); tick <= Math.floor(t * 24); tick++) {
    let seed = (val(l,'seed',tick/24)*23467+tick*9377)>>>0,
      r = rand(seed),
      birth = tick / 24,
      rate = val(l, 'rate', birth),
      scaled = Math.min(650, Math.max(0, rate)) / 24,
      n = Math.floor(scaled) + (r() < scaled % 1 ? 1 : 0);
    for (let j = 0; j < n && count < pos.count - 8; j++) {
      let t0 = birth + r() / 24,
        age = t - t0;
      if (
        t0 < l.in ||
        t0 > l.out ||
        age < 0 ||
        (source && (t0 < source.in || t0 > source.out))
      )
        continue;
      let path = particlePath(l, t0, seed + j * 723 + 510, layers);
      if (age > path.ttl) continue;
      let lifeFrac = age / path.ttl,
        glow = path.shine * (1 - lifeFrac) * 2.2,
        hit = path.impacts.some((k) => k < age),
        last = at(path, age),
        prev = at(path, Math.max(0, age - size * (0.4 + path.shine * 0.27)));
      let pathAge = Math.min(age, size * (0.4 + path.shine * 0.27)),
        before = prev,
        clr = col.clone();
      clr.g*=1-lifeFrac*.6;clr.b*=1-lifeFrac*.85;if (hit) clr.g *= 0.52;
      for (let step = 1; step <= 3; step++) {
        let pt = step === 3 ? last : at(path, age - pathAge * (1 - step / 3));
        rc = writeRibbonSegment(
          ribbon,
          rc,
          before,
          pt,
          camera.position,
          thickness * (1 - lifeFrac * 0.75) * (0.3 + step * 0.24),
          clr,
          glow * (0.26 + step * 0.33),
        );
        before = pt;
      }
      pos.setXYZ(count, prev.x, prev.y, prev.z);
      cl.setXYZ(count++, col.r * glow * 0.4, col.g * glow * 0.25, col.b * glow * 0.3);
      pos.setXYZ(count, last.x, last.y, last.z);
      cl.setXYZ(
        count++,
        col.r * glow * 2,
        col.g * glow * (hit ? 0.7 : 1.8) + 0.015,
        col.b * glow + 0.005,
      );
      if (hit && l.secondary) {
        let impact = path.impacts.find((a) => a < age),
          u = age - impact;
        if (u < 0.23) {
          let cp = at(path, impact);
          for (let sign of [-1, 1]) {
            pos.setXYZ(count, cp.x + sign * u, cp.y + u * 0.7, cp.z);
            cl.setXYZ(count++, glow, 0.1, 0);
            pos.setXYZ(count, cp.x + sign * u * 1.17, cp.y + u * 0.85, cp.z);
            cl.setXYZ(count++, glow * 2, 0.4, 0.03);
          }
        }
      }
    }
  }
  o.children[0].geometry.setDrawRange(0, count);
  ribbon.geometry.setDrawRange(0, rc);
  ribbon.geometry.attributes.position.needsUpdate =
    ribbon.geometry.attributes.color.needsUpdate = true;
  pos.needsUpdate = cl.needsUpdate = true;
}
let fxRT = [],
  fxCam = postCam,
  fxScene = new THREE.Scene(),
  fxQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
fxScene.add(fxQuad);
function targetAt(i, w, h, depth = false) {
  if (!fxRT[i])
    fxRT[i] = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthBuffer: depth,
      depthTexture: depth ? new THREE.DepthTexture(w, h, THREE.UnsignedIntType) : null,
    });
  if (fxRT[i].width !== w || fxRT[i].height !== h) fxRT[i].setSize(w, h);
  return fxRT[i];
}
function fullMat(code, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, { value: v }])),
    vertexShader: postMat.vertexShader,
    fragmentShader: code,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
const compositingMat = fullMat(
  `varying vec2 uvp;uniform sampler2D under,layerTex,depthFull,depthLayer,matteMap;uniform float matteMode;uniform vec2 pix;uniform float blur,glow,shadow,alpha,mode,adjust,feather,maskType,hue,sat,bri;uniform vec4 region;
vec4 src(vec2 uv){return texture2D(layerTex,clamp(uv,0.,1.));}
void main(){vec4 bg=texture2D(under,uvp),source=src(uvp);float d=texture2D(depthLayer,uvp).r,back=texture2D(depthFull,uvp).r;vec4 blurred=vec4(0.);vec3 bloom=vec3(0.);float shade=0.;for(int i=0;i<33;i++){float a=float(i)*2.39996;vec2 v=vec2(cos(a),sin(a))*sqrt((float(i)+.5)/33.);blurred+=src(uvp+pix*v*blur);vec4 g=src(uvp+pix*v*max(2.,glow*5.));bloom+=max(vec3(0.),g.rgb-.16)*g.a;shade+=src(uvp-pix*vec2(4.,-6.)*min(2.,shadow)+v*pix*max(2.,shadow*3.)).a;}source=blurred/33.;vec3 ax=normalize(vec3(1.)),c=source.rgb;c=c*cos(hue)+cross(ax,c)*sin(hue)+ax*dot(ax,c)*(1.-cos(hue));source.rgb=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,sat)*bri;vec2 pt=(uvp-region.xy)/max(vec2(.0001),region.zw);float dist=maskType==1.?max(abs(pt.x),abs(pt.y)):length(pt);float mask=maskType<.5?1.:1.-smoothstep(1.-max(.001,feather),1.,dist);if(maskType>2.5)mask=1.-mask;float amount=alpha*mask;vec4 matteSample=texture2D(matteMap,uvp);if(matteMode>.5){float mm=matteMode>2.5?dot(matteSample.rgb,vec3(.2126,.7152,.0722)):matteSample.a;amount*=matteMode==2.||matteMode==4.?1.-clamp(mm,0.,1.):clamp(mm,0.,1.);}vec3 inRGB=source.rgb/max(.00001,source.a);vec3 backRGB=bg.rgb/max(.00001,bg.a);vec3 blend=mode<.5?inRGB:mode<1.5?backRGB+inRGB:mode<2.5?1.-(1.-backRGB)*(1.-inRGB):mode<3.5?backRGB*inRGB:mix(2.*backRGB*inRGB,1.-2.*(1.-backRGB)*(1.-inRGB),step(vec3(.5),backRGB));if(adjust>.5){gl_FragColor=mix(bg,vec4(blend,source.a),amount)+vec4(bloom/33.*glow*.22*amount,0.);return;}vec4 result=bg;float coverage=clamp(source.a*amount,0.,1.);if(d<=back+.000005||back>.99999||d>.99999&&source.a>.0001){result.rgb*=1.-clamp(shade/33.*shadow*.33,0.,.85)*amount;result.rgb=(result.rgb*(1.-coverage)+coverage*((1.-bg.a)*inRGB+bg.a*blend))+bloom/33.*glow*.23*amount;result.a=coverage+bg.a*(1.-coverage);}gl_FragColor=result;}`,
  {
    under: null,
    layerTex: null,
    matteMode: 0,
    matteMap: null,
    depthFull: null,
    depthLayer: null,
    pix: new THREE.Vector2(),
    blur: 0,
    glow: 0,
    shadow: 0,
    alpha: 1,
    mode: 0,
    adjust: 0,
    feather: 0.04,
    maskType: 0,
    hue: 0,
    sat: 1,
    bri: 1,
    region: new THREE.Vector4(0.5, 0.5, 0.3, 0.32),
  },
);
function drawPass(mat, target) {
  fxQuad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(fxScene, fxCam);
}
let accumulating = false,
  accumSample = 0,
  accumTotal = 0,
  temporalCenter = null;
const averageMat = fullMat(
    'varying vec2 uvp;uniform sampler2D previous,current;uniform float weight;void main(){gl_FragColor=mix(texture2D(previous,uvp),texture2D(current,uvp),weight);}',
    { previous: null, current: null, weight: 1 },
  ),
  copyMat = fullMat(
    'varying vec2 uvp;uniform sampler2D tex;void main(){gl_FragColor=texture2D(tex,uvp);}',
    { tex: null },
  );
function drawFinal() {
  if (!accumulating) {
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    return;
  }
  let w = canvas.width,
    h = canvas.height,
    one = targetAt(4, w, h),
    prior = targetAt(5 + (accumSample % 2), w, h),
    next = targetAt(5 + ((1 + accumSample) % 2), w, h);
  renderer.setRenderTarget(one);
  renderer.render(postScene, postCam);
  averageMat.uniforms.previous.value = prior.texture;
  averageMat.uniforms.current.value = one.texture;
  averageMat.uniforms.weight.value = 1 / (accumSample + 1);
  drawPass(averageMat, next);
  if (accumSample === accumTotal - 1) {
    copyMat.uniforms.tex.value = next.texture;
    copyMat.fragmentShader =
      'varying vec2 uvp;uniform sampler2D tex;void main(){gl_FragColor=texture2D(tex,uvp);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
    copyMat.toneMapped = true;
    drawPass(copyMat, null);
  }
}
function motionFrame(render) {
  let c = C(),
    t = T;
  function activeShutter(comp,seen=new Set()){
    if(seen.has(comp.id))return null;
    if(comp.mb&&comp.layers.some(l=>l.mb&&l.visible))return comp;
    for(const p of comp.layers.filter(l=>l.type==='pre'&&l.visible)){let nested=P.comps.find(k=>k.id===p.ref);if(nested){let result=activeShutter(nested,new Set(seen).add(comp.id));if(result)return result}}
    return null;
  }
  const settings=activeShutter(c);
  if(!settings||settings.shutter<=0){render();return}
  c=settings;
  accumTotal = 6;
  temporalCenter = t;
  accumulating = true;
  try {
    for (accumSample = 0; accumSample < accumTotal; accumSample++) {
      T = Math.min(
        c.duration,
        Math.max(
          0,
          t +
            (((accumSample + 0.5) / accumTotal - 0.5 + (c.phase || 0) / 360) * c.shutter) /
              360 /
              c.fps,
        ),
      );
      render();
    }
  } finally {
    T = t;
    accumulating = false;
    temporalCenter = null;
  }
  render();drawPass(copyMat,null);
}
function decorateEdges(l, o, g, shapes, v, t) {
  let solid = o.children[0];
  while (solid.children.length) {
    let ch = solid.children.pop();
    ch.geometry?.dispose();
    ch.material?.dispose();
  }
  let width = v('strokeWidth'),
    warm = l.model === 'glyph' && t < 3 && v('trim') < 100;
  if (warm) {
    let under = new THREE.Mesh(
      extrude(shapesFor(l), 0.012, 0.006),
      new THREE.MeshStandardMaterial({
        color: '#694837',
        metalness: 0.68,
        roughness: 0.54,
        transparent: true,
        opacity: 0.47,
      }),
    );
    under.position.z = -0.038;
    solid.add(under);
  }
  if (width > 0.0001 || warm) {
    let paths = warm ? shapesFor(l) : shapes,
      col = warm ? '#d5945c' : l.strokeColor || '#f4c37d';
    for (let shape of paths) {
      for (let cont of [shape, ...shape.holes]) {
        let pts = cont.getSpacedPoints(100);
        if (pts.length < 2) continue;
        let path3 = new THREE.CurvePath();
        for (let i = 1; i < pts.length; i++)
          path3.add(
            new THREE.LineCurve3(
              V(pts[i - 1].x, pts[i - 1].y, v('depth') + 0.003),
              V(pts[i].x, pts[i].y, v('depth') + 0.003),
            ),
          );
        let tube = new THREE.TubeGeometry(
            path3,
            Math.min(180, pts.length * 2),
            warm ? 0.018 : Math.max(0.001, width * 0.5),
            4,
            false,
          ),
          mat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: warm,
            opacity: warm ? 0.68 : 1,
          });
        solid.add(new THREE.Mesh(tube, mat));
      }
    }
  }
  if (l.model === 'glyph') {
    let lamp = new THREE.PointLight('#fa5a11', v('heat') ** 2 * 6.5, 5, 1.7);
    lamp.position.set(-0.05, 0.5, 0.9);
    solid.add(lamp);
  }
}
function nodeKind(n) {
  return { 数值: '标量', 向量: '向量', 颜色: '颜色', 空间场: '场' }[n?.op] || '几何';
}
function expandNodes(ns) {
  return (ns || []).flatMap((n) => {
    if (!n.children) return [n];
    let inner = expandNodes(n.children),
      end = inner.find((x) => x.id === n.exit) || inner.find((x) => x.op === '几何输出');
    return [
      ...inner.map((v) => (v.op === '几何输出' ? { ...v, op: '组输出' } : v)),
      { ...n, op: '组输出', input: end?.id, children: null },
    ];
  });
}
function nodeInput(l, n, t, def) {
  let ns = expandNodes(l.nodes),
    ctrl = ns.find((q) => q.id === n.control);
  if (ctrl) return ctrl.param ? val(l, ctrl.param, t) : (ctrl.scalar ?? 1);
  return n.param ? val(l, n.param, t) : def;
}

let sceneInstance = null,
  currentInstance = null;
function buildInstances() {
  if (root) {
    scene.remove(root);
    const keep=new Set(matcache.values()),disposed=new Set();
    root.traverse(a=>{a.geometry?.dispose();for(const m of Array.isArray(a.material)?a.material:[a.material]){
      if(m&&!keep.has(m)&&!disposed.has(m)){m.userData.reflection?.target.dispose();m.dispose();disposed.add(m)}
    }if(a.isLight)a.shadow?.dispose?.()});

  }
  root = new THREE.Group();
  scene.add(root);
  function sub(c, container, path, chain) {
    let inst = { c, container, path, map: new Map(), data: new Map(), subs: new Map() };
    if (chain.includes(c.id)) return inst;
    for (let src of c.layers) {
      let l = path === 'main' ? src : { ...src, _origin: src, _instance: path };
      let o = createObj(l);
      inst.map.set(l.id, o);
      inst.data.set(l.id, l);
      container.add(o);
      if (l.type === 'pre') {
        let cc = P.comps.find((a) => a.id === l.ref);
        if (cc) inst.subs.set(l.id, sub(cc, o, path + '/' + l.id, [...chain, c.id]));
      }
    }
    for (let l of inst.data.values()) {
      let parent = inst.map.get(l.parent);
      if (parent) parent.add(inst.map.get(l.id));
    }
    return inst;
  }
  sceneInstance = sub(C(), root, 'main', []);
  entries = sceneInstance.map;
  built = version;
}
function renderInstances() {
  if (built !== version || !sceneInstance) buildInstances();
  let cc = C(),
    alpha = (cc.bgAlpha ?? 100) / 100;
  scene.background = alpha >= 1 ? new THREE.Color(cc.bg || '#191819') : null;
  renderer.setClearColor(cc.bg || '#191819', alpha);
  sceneCam = null;
  const sparks=[],objects=[];
  function mappedTime(l,t){
    return l.keys.remap?.length||l.expr.remap||l.remapOn?val(l,'remap',t):t-l.in+(l.startOffset||0);
  }
  function ev(inst,sample,center,forceBlur=false){
    currentInstance=inst;entries=inst.map;inst.sampleTimes=new Map();
    inst.centerTime=center;
    for(const [id,l] of inst.data){
      const o=inst.map.get(id);
      const enabled=accumulating&&(forceBlur||inst.c.mb&&(l.mb||l.type==='camera'));
      const tt=enabled?sample:center;
      o.matrixAutoUpdate=true;inst.sampleTimes.set(id,tt);evalObj(l,o,tt);
      objects.push({o,l,inst,tt,enabled});
      if(l.type==='particle'&&o.visible)sparks.push({inst,l,o,t:tt});
      if(l.type==='pre'&&inst.subs.has(id)&&o.visible){
        ev(inst.subs.get(id),mappedTime(l,sample),mappedTime(l,center),forceBlur||enabled);
        currentInstance=inst;entries=inst.map;
      }
    }
    if(accumulating)for(const [id,l] of inst.data){
      const o=inst.map.get(id),tt=inst.sampleTimes.get(id);
      if(l.parent&&inst.map.has(l.parent)){
        const pl=inst.data.get(l.parent),mat=layerMatrixAt(pl,inst.sampleTimes.get(l.parent)).invert().multiply(layerMatrixAt(l,tt));
        o.matrixAutoUpdate=false;o.matrix.copy(mat);o.matrixWorldNeedsUpdate=true;
      }
    }
  }
  ev(sceneInstance,T,temporalCenter??T);
  scene.updateMatrixWorld(true);
  let target = V(0, 1.4, 0);
  if (sceneCam) {
    let { l, o, t } = sceneCam;
    camera.position.copy(o.getWorldPosition(V()));
    target.set(val(l,'tx',t),val(l,'ty',t),val(l,'tz',t)).applyMatrix4(o.parent.matrixWorld);
    camera.fov = val(l, 'fov', t);
  } else {
    target.set(0,0,0);camera.position.set(0,0,8);
    camera.fov = 34;
  }
  if (angleMode === 1) camera.position.set(0, 1.45, 8);
  if (angleMode === 2) camera.position.set(4, 8, 4);
  camera.position.add(camPan);
  camera.lookAt(target.add(camPan));
  camera.zoom = viewScale;
  let w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  let dpr =
    Math.min(devicePixelRatio, 1.65) *
    (canvas.getBoundingClientRect().width / canvas.clientWidth || 1);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
  }
  camera.updateMatrixWorld(true);
  if(accumulating&&sceneCam&&angleMode===0){
    const {l,instance}=sceneCam,tt=instance.centerTime;
    const centerCam=camera.clone();
    const parent=instance.data.get(l.parent),container=instance.container.matrixWorld;
    centerCam.position.setFromMatrixPosition(container.clone().multiply(layerMatrixAt(l,tt))).add(camPan);
    const aim=V(val(l,'tx',tt),val(l,'ty',tt),val(l,'tz',tt));
    if(parent)aim.applyMatrix4(layerMatrixAt(parent,tt));
    centerCam.lookAt(aim.applyMatrix4(container).add(camPan));centerCam.updateMatrixWorld(true);
    const factor=Math.tan(camera.fov*Math.PI/360)/Math.tan(val(l,'fov',tt)*Math.PI/360);
    const compensation=camera.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(factor,factor,1)).multiply(centerCam.matrixWorldInverse);
    const desired=new Map();
    for(const {o,enabled,l} of objects)desired.set(o,!enabled&&l.type!=='light'?compensation.clone().multiply(o.matrixWorld):o.matrixWorld.clone());
    for(const {o} of objects){
      const pw=desired.get(o.parent)||o.parent.matrixWorld;
      o.matrix.copy(pw).invert().multiply(desired.get(o));o.matrixAutoUpdate=false;o.matrixWorldNeedsUpdate=true;
    }
    scene.updateMatrixWorld(true);
  }
  for (let p of sparks) {
    currentInstance = p.inst;
    entries = p.inst.map;
    evaluateParticles(p.l, p.o, p.t);
  }
  currentInstance = sceneInstance;
  entries = sceneInstance.map;
  postFrame();
}
function precomposeLayers(name) {
  for (let c of P.comps)
    for (let l of c.layers)
      for (let ex of Object.values(l.expr))
        for (let m of ex.matchAll(/thisComp\.layer\(\s*['"]([^'"]+)['"]\s*\)/g)) {
          let dep = c.layers.find((a) => a.name === m[1]);
          if (dep) {
            l.bindings ||= {};
            l.bindings[m[1]] = dep.id;
          }
        }
  let c = C(),
    selected = c.layers.filter((l) => S.has(l.id)),
    ids = new Set(selected.map((l) => l.id)),
    sub = { ...comp(name, []), w: c.w, h: c.h, fps: c.fps, duration: c.duration, end: c.end },
    parentCache = new Map(),
    outerCache = new Map(),
    all = c.layers.slice(),
    pos = all.indexOf(selected[0]);
  function proxy(id, inner) {
    let cache = inner ? parentCache : outerCache;
    if (!id || inner === ids.has(id)) return id;
    if (cache.has(id)) return cache.get(id).id;
    let s = all.find((l) => l.id === id);
    if (!s) return '';
    let n = layer('null', s.name + ' · 父级链接', { proxy: id, p: { ...s.p }, out: c.duration });
    cache.set(id, n);
    n.parent = proxy(s.parent, inner);
    return n.id;
  }
  let prevParents = new Map(selected.map((l) => [l.id, l.parent]));
  for (let l of all.filter((x) => !ids.has(x.id))) l.parent = proxy(l.parent, false);
  for (let l of selected) l.parent = proxy(prevParents.get(l.id), true);
  sub.layers = [...selected, ...parentCache.values()];
  let ref = layer('pre', name, { ref: sub.id, out: c.duration });
  c.layers = all.filter((l) => !ids.has(l.id));
  c.layers.splice(pos, 0, ref);
  c.layers.push(...outerCache.values());
  P.comps.push(sub);
  S = new Set([ref.id]);
}
function fieldForce(f, p, t) {
  let center = V().setFromMatrixPosition(layerMatrixAt(f, t)),
    d = center.sub(p),
    r = Math.max(0.01, val(f, 'range', t)),
    strength = val(f, 'strength', t) * Math.exp(-d.lengthSq() / (r * r));
  if (f.fieldKind === '旋涡') d.set(-d.y, d.x, 0.2 * d.z);
  if (f.fieldKind === '噪声')
    d.set(Math.sin(p.y * 3 + t), Math.cos(p.x * 3 - t), Math.sin(p.z * 3 + p.y));
  return d.normalize().multiplyScalar(strength);
}
function pathShape(l) {
  let sh = new THREE.Shape(),
    p = l.points || [],
    handles = l.handles || {};
  if (!p.length) return sh;
  sh.moveTo(...p[0]);
  let count = p.length + (l.open ? 0 : 1);
  for (let i = 1; i < count; i++) {
    let j = i % p.length,
      prev = (i - 1) % p.length,
      a = p[prev],
      b = p[j],
      ta = handles[prev]?.out,
      tb = handles[j]?.in;
    if (ta || tb || l.smooth) {
      ta ||= [(b[0] - a[0]) / 3, (b[1] - a[1]) / 3];
      tb ||= [(a[0] - b[0]) / 3, (a[1] - b[1]) / 3];
      sh.bezierCurveTo(a[0] + ta[0], a[1] + ta[1], b[0] + tb[0], b[1] + tb[1], ...b);
    } else sh.lineTo(...b);
  }
  if (!l.open) sh.closePath();
  return sh;
}
function editPin(l, pin, index, t) {
  let pre = 'pin' + index,
    dx = pin.dx + val(l, pre + 'X', t),
    dy = pin.dy + val(l, pre + 'Y', t),
    rot = (val(l, pre + 'R', t) * Math.PI) / 180,
    scale = 1 + val(l, pre + 'S', t) / 100;
  return { dx, dy, rot, scale };
}
function showHelpers() {
  let l = sel(),
    o = l && entries.get(l.id);
  if (!o) return;
  let h = $('#handles'),
    proj = (pt) => {
      let p = pt.project(camera);
      return [(p.x * 0.5 + 0.5) * canvas.clientWidth, (0.5 - p.y * 0.5) * canvas.clientHeight];
    },
    svg = '',
    line = (a, b, col) =>
      '<path d="M' +
      a.join(' ') +
      'L' +
      b.join(' ') +
      '" stroke="' +
      col +
      '" fill="none" stroke-width="1"/>',
    dot = (p, d, col, r) =>
      '<circle cx="' +
      p[0] +
      '" cy="' +
      p[1] +
      '" r="' +
      r +
      '" stroke="#2b3026" fill="' +
      col +
      '" ' +
      d +
      '/>';
  if (pointEdit && l.points)
    for (let i = 0; i < l.points.length; i++) {
      let p = l.points[i],
        a = proj(o.localToWorld(V(...p, 0.05)));
      for (let side of ['in', 'out']) {
        let t = l.handles?.[i]?.[side];
        if (!t) continue;
        let b = proj(o.localToWorld(V(p[0] + t[0], p[1] + t[1], 0.05)));
        svg +=
          line(a, b, '#d19e65') +
          dot(b, 'data-vhandle="' + i + '" data-direction="' + side + '"', '#ecb578', 3.5);
      }
    }
  if (l.pins?.length && (selectedHandles||activeTool==='pin'))
    for (let [i, pin] of l.pins.entries()) {
      let { dx, dy } = editPin(l, pin, i, T),
        p = proj(o.localToWorld(V(pin.x + dx, pin.y + dy, val(l, 'depth') + 0.02)));
      svg += dot(p, 'data-pin="' + i + '"', '#f1c363', 5);
    }
  if ((selectedHandles || activeTool === 'axis') && !['stage', 'air'].includes(l.model)) {
    let p = V(val(l, 'ax'), val(l, 'ay'), val(l, 'az')),
      a = proj(o.localToWorld(p.clone()));
    for (let [j, k] of ['x', 'y', 'z'].entries()) {
      let b = p.clone();
      b[k] += 0.48;
      let end = proj(o.localToWorld(b)),
        c = ['#db7970', '#aad682', '#79abd9'][j];
      svg += line(a, end, c) + dot(end, 'data-axis="' + k + '"', c, 3);
    }
    svg += dot(a, '', '#ddd8c5', 2);
  }
  if (l.type === 'light') {
    let p = proj(o.getWorldPosition(V()));
    for (let i = 0; i < 8; i++) {
      let d = (i * Math.PI) / 4;
      svg += line(
        [p[0] + Math.cos(d) * 6, p[1] + Math.sin(d) * 6],
        [p[0] + Math.cos(d) * 13, p[1] + Math.sin(d) * 13],
        '#ffd292',
      );
    }
    svg += dot(p, '', '#ffd292', 4);
  }
  if (l.type === 'camera' && angleMode) {
    let a = proj(o.getWorldPosition(V())),
      b = proj(V(val(l, 'tx'), val(l, 'ty'), val(l, 'tz')));
    svg += line(a, b, '#8fc3de') + dot(a, '', '#8fc3de', 6) + dot(b, '', '#9db3c8', 3);
  }
  if (svg) h.insertAdjacentHTML('beforeend', '<svg class="editpoints">' + svg + '</svg>');
}
const individualFx = fullMat(
  `varying vec2 uvp;uniform sampler2D image;uniform vec2 pix;uniform float op,amt,hue,sat,bri;
void main(){vec4 base=texture2D(image,uvp);if(op<.5){vec4 sum=vec4(0.);float wsum=0.;for(int i=0;i<49;i++){float r=sqrt((float(i)+.5)/49.),a=float(i)*2.399963,w=exp(-2.*r*r);sum+=texture2D(image,uvp+vec2(cos(a),sin(a))*r*pix*amt*2.)*w;wsum+=w;}gl_FragColor=sum/wsum;}else if(op<2.5){vec4 sum=vec4(0.);for(int i=0;i<40;i++){float r=sqrt((float(i)+.5)/40.),a=float(i)*2.399963;vec2 uv=uvp+vec2(cos(a),sin(a))*r*pix*(3.+amt*5.);if(op>1.5)uv-=pix*vec2(4.,-6.)*clamp(amt,.5,3.);vec4 v=texture2D(image,uv);sum+=v*exp(-r*r*1.6);}sum/=20.;float alpha=op<1.5?clamp(max(sum.r,max(sum.g,sum.b))*amt*.64,0.,1.):clamp(sum.a*amt*.6,0.,.85);float aa=base.a+alpha*(1.-base.a);vec3 light=op<1.5?sum.rgb*amt:vec3(0.);gl_FragColor=vec4((base.rgb*base.a+light*alpha*(1.-base.a))/max(.0001,aa)+(op<1.5?light*.3*base.a:vec3(0.)),aa);}else{vec3 c=base.rgb,ax=normalize(vec3(1.));c=c*cos(hue)+cross(ax,c)*sin(hue)+ax*dot(ax,c)*(1.-cos(hue));gl_FragColor=vec4(mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,sat)*bri,base.a);}}`,
  { image: null, pix: new THREE.Vector2(), op: 0, amt: 0, hue: 0, sat: 1, bri: 1 },
);
const defaultFx = ['blur', 'glow', 'shadow', 'color'];
function fxStack(l, tex, w, h, t = T) {
  let idx = 0;
  for (let op of l.fxOrder || defaultFx) {
    if (l.disabledFx?.includes(op)) continue;
    let strength =
      op === 'color'
        ? Math.abs(val(l, 'hue', t)) +
          Math.abs(val(l, 'saturation', t) - 1) +
          Math.abs(val(l, 'brightness', t) - 1)
        : val(l, op, t);
    if (!strength) continue;
    let u = individualFx.uniforms;
    u.image.value = tex;
    u.pix.value.set(1 / w, 1 / h);
    u.op.value = defaultFx.indexOf(op);
    u.amt.value = strength;
    u.hue.value = (val(l, 'hue', t) * Math.PI) / 180;
    u.sat.value = val(l, 'saturation', t);
    u.bri.value = val(l, 'brightness', t);
    let rt = targetAt(8 + idx, w, h);
    drawPass(individualFx, rt);
    tex = rt.texture;
    idx = 1 - idx;
  }
  return tex;
}
function maskAt(m, t) {
  if (!m.keys?.length) return m;
  let keys = m.keys,
    lo = keys.filter((q) => q.t <= t).at(-1) || keys[0],
    hi = keys.find((q) => q.t > t) || lo,
    u = hi === lo ? 0 : Math.max(0, (t - lo.t) / (hi.t - lo.t)),
    r = { ...m };
  for (let k of ['x', 'y', 'w', 'h', 'feather']) r[k] = lo[k] + (hi[k] - lo[k]) * u;
  if (lo.points && hi.points) {
    let p0 = new THREE.Path(lo.points.map((p) => new THREE.Vector2(...p))),
      p1 = new THREE.Path(hi.points.map((p) => new THREE.Vector2(...p)));
    r.points = p0.getSpacedPoints(64).map((a, i) => a.lerp(p1.getPointAt(i / 64), u).toArray());
  }
  return r;
}
function sourceOf(id) {
  return (
    (currentInstance?.c?.layers || L()).find((l) => l.id === id) ||
    P.comps.flatMap((c) => c.layers).find((l) => l.id === id)
  );
}
function instanceOf(id, inst = sceneInstance) {
  if (!inst) return null;
  if (inst.map.has(id)) return inst;
  for (let ch of inst.subs.values()) {
    let i = instanceOf(id, ch);
    if (i) return i;
  }
  return null;
}
function upstreamShapes(l, t, seen = new Set()) {
  if (!l || seen.has(l.id)) return [];
  let next = new Set(seen).add(l.id),
    src = l.source && sourceOf(l.source),
    raw = src ? upstreamShapes(src, t, next) : vectorShapes(l, t),
    result = nodeGeometry(l,t,raw,next);
  let shapes=pathOps(result.shapes,l,t);
  if(!l.ops?.some(q=>q.type==='修剪路径'))shapes=trimContours(shapes,val(l,'trim',t),l.writeMode==='笔画生长');
  const deform=geometryWarp(l,t,result.field),rings=polygons(shapes),polys=[];
  const repeats=l.ops?.some(q=>q.type==='重复器')?1:Math.min(32,Math.max(1,Math.round(val(l,'repeat',t))));
  for(let i=0;i<repeats;i++)polys.push(...rings.map(poly=>poly.map(ring=>ring.map(([x,y])=>{const p=deform(x,y,result.depth??val(l,'depth',t));return [p.x+i*val(l,'offset',t),p.y]}))));
  return polygonsBack(polys);
}
function spriteRibbon(o) {
  let ribbon = o.children.find((c) => c.name === '粒子拖尾');
  if (ribbon) return ribbon;
  let g = new THREE.BufferGeometry();
  for (let k of ['position', 'color'])
    g.setAttribute(
      k,
      new THREE.BufferAttribute(new Float32Array(72000 * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
  ribbon = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  ribbon.frustumCulled = false;
  ribbon.name = '粒子拖尾';
  o.add(ribbon);
  return ribbon;
}
function writeRibbonSegment(rt, idx, a, b, cam, width, clr, fade) {
  let across = b
      .clone()
      .sub(a)
      .cross(cam.clone().sub(a))
      .normalize()
      .multiplyScalar(width * 0.5),
    pos = rt.geometry.attributes.position,
    col = rt.geometry.attributes.color;
  if (idx + 6 >= pos.count) return idx;
  for (let [p, sign, alpha] of [
    [a, -1, 0.55],
    [a, 1, 0.55],
    [b, 1, 1],
    [a, -1, 0.55],
    [b, 1, 1],
    [b, -1, 1],
  ]) {
    pos.setXYZ(idx, p.x + sign * across.x, p.y + sign * across.y, p.z + sign * across.z);
    col.setXYZ(idx++, clr.r * fade * alpha, clr.g * fade * alpha, clr.b * fade * alpha);
  }
  return idx;
}
const captionScene = new THREE.Scene(),
  captionCache = new Map();
function compMarkers(c) {
  return c.markers || [];
}
function addCaptionTexture(l, comp, t) {
  let markers = compMarkers(comp),
    phaseIdx = Math.max(0, markers.filter((m) => m.t <= t).length - 1),
    stage = markers[phaseIdx]?.name || '',
    w = Math.min(2560, Math.max(1280, canvas.width)),
    h = Math.round(w / (C().w / C().h)),
    cacheKey = JSON.stringify([l.text, l.color, l.labelTop, l.labelSub, l.labelCode, stage, w, h]);
  let ct = captionCache.get(l.id);
  if (ct?.key !== cacheKey) {
    let cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    let ctx = cv.getContext('2d'),
      u = w / 940;
    ctx.scale(u, u);
    let H = h / u,
      W = 940,
      left = 47,
      right = 893;
    ctx.fillStyle = '#dd8c4b';
    ctx.fillRect(left, H * 0.068, 22, 2);
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.letterSpacing = '1.6px';
    ctx.fillStyle = '#d5c7b4';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.labelTop || 'FORGE STUDY', left + 31, H * 0.07);
    ctx.textAlign = 'right';
    ctx.fillText(l.labelCode || 'FF — 001', right, H * 0.07);
    ctx.textAlign = 'left';
    ctx.fillStyle = l.color;
    ctx.font = '800 32px "Microsoft YaHei",sans-serif';
    ctx.letterSpacing = '5px';
    ctx.textBaseline = 'bottom';
    ctx.fillText(l.text, left, H * 0.902);
    ctx.fillStyle = '#cb9366';
    ctx.fillRect(left, H * 0.902 - 44, 26, 2);
    ctx.fillStyle = '#ded0ba';
    ctx.font = 'bold 10px Consolas,monospace';
    ctx.letterSpacing = '1.6px';
    ctx.fillText(l.labelSub || 'FORGED IN FIRE', left, H * 0.933);
    ctx.textAlign = 'right';
    let desc = stage ? 'PHASE ' + String(phaseIdx + 1).padStart(2, '0') + ' / ' + stage : '';
    ctx.fillText(desc, right, H * 0.933);
    for (let i = 0, x = right - 58; x < right; i++) {
      let bw = [1, 2, 1, 3, 1, 1, 2][i % 7];
      ctx.fillRect(x, H * 0.933 - 29, bw, 10);
      x += bw + 1 + (i % 3);
    }
    let tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    ct?.mat.dispose();
    ct?.mat.map.dispose();
    ct?.mesh.geometry.dispose();
    let mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    ct = { mesh, mat, key: cacheKey };
    captionCache.set(l.id, ct);
  }
  return ct;
}
function captionPass() {
  captionScene.clear();
  function walk(inst, t, alpha) {
    for (let [id, l] of inst.data) {
      if (!l.visible || t < l.in || t > l.out) continue;
      if (l.type === 'pre' && inst.subs.has(id))
        walk(
          inst.subs.get(id),
          l.keys.remap?.length || l.expr.remap || l.remapOn ? val(l, 'remap', t) : t - l.in,
          (alpha * val(l, 'opacity', t)) / 100,
        );
      if (l.model !== 'caption') continue;
      let ct = addCaptionTexture(l, inst.c, t),
        o = inst.map.get(id),
        sc = o.getWorldScale(V()),
        pos = o.getWorldPosition(V());
      let mesh = ct.mesh.clone();
      mesh.position.set(pos.x * 0.24, pos.y * 0.32, 0);
      mesh.scale.set(sc.x, sc.y, 1);
      mesh.rotation.z = val(l, 'rz', t) * 0.0174533;
      ct.mat.opacity = (val(l, 'opacity', t) / 100) * alpha;
      captionScene.add(mesh);
    }
  }
  walk(sceneInstance, T, 1);
  if (captionScene.children.length) {
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.render(captionScene, postCam);
    renderer.autoClear = true;
  }
}
function flattenView(inst, t, out = [], opacity = 1) {
  for (let [id, l] of inst.data) {
    let o = inst.map.get(id),
      localT = inst.sampleTimes?.get(id)??t;
    if (!o.visible) continue;
    if (l.type === 'pre' && inst.subs.has(id)) {
      let remap =
        l.keys.remap?.length || l.expr.remap || l.remapOn
          ? val(l, 'remap', localT)
          : localT - l.in + (l.startOffset || 0);
      const nested = inst.subs.get(id);
      const needsGroup =
        l.blend !== '正常' ||
        val(l, 'opacity', localT) < 100 ||
        l.mask !== '无' ||
        l.masks?.length ||
        l.matte ||
        ['blur', 'glow', 'shadow', 'hue'].some((k) => val(l, k, localT) !== 0) ||
        val(l, 'saturation', localT) !== 1 ||
        val(l, 'brightness', localT) !== 1;
      if (needsGroup) {
        const parts = flattenView(nested, remap, [], 1),
          payload = parts.flatMap((p) => p.payload);
        out.push({
          l,
          o,
          t: localT,
          opacity,
          payload,
          visibility: payload.map((p) => p.visible),
          parts,
          inst,
        });
      } else flattenView(nested, remap, out, opacity);
    } else if (
      !['camera', 'light', 'audio', 'null', 'field'].includes(l.type) &&
      l.model !== 'caption'
    ) {
      let payload = o.children.filter((ch) => !ch.userData.layer);
      out.push({
        l,
        o,
        inst,
        t: localT,
        opacity,
        payload,
        visibility: payload.map((ch) => ch.visible),
      });
    }
  }
  return out;
}
function composeView(rt, draw = flattenView(sceneInstance, T), depth = 0) {
  let affected = (rec) => {
      let { l, t } = rec;
      return (
        rec.parts ||
        l.matte ||
        l.type === 'adj' ||
        ['blur', 'glow', 'shadow', 'hue'].some((k) => val(l, k, t) !== 0) ||
        val(l, 'saturation', t) !== 1 ||
        val(l, 'brightness', t) !== 1 ||
        l.blend !== '正常'
      );
    },
    special = draw.filter(affected);
  if (!special.length) return rt.texture;
  let w = rt.width,
    h = rt.height,
    layerRT = targetAt(depth * 4 + 16, w, h, true),
    buffers = [targetAt(depth * 4 + 17, w, h, true), targetAt(depth * 4 + 18, w, h, true)],
    bg = scene.background,
    adj = draw.findIndex((r) => r.l.type === 'adj'),
    ordered = [...new Set([...special, ...(adj < 0 ? [] : draw.slice(0, adj))])].sort(
      (a, b) => draw.indexOf(b) - draw.indexOf(a),
    ),
    filtered = new Set(ordered),
    idx = 0;
  function visibility(fn) {
    for (let r of draw) r.payload.forEach((p, i) => (p.visible = r.visibility[i] && fn(r)));
  }
  renderer.shadowMap.autoUpdate = false;
  try {
    visibility((r) => !filtered.has(r));
    renderer.setRenderTarget(buffers[0]);
    renderer.render(scene, camera);
    for (let rec of ordered) {
      let { l, t } = rec,
        adj = l.type === 'adj';
      if (!adj) {
        visibility((r) => r === rec);
        scene.background = null;
        renderer.setClearColor(0x000000, 0);
        renderer.setRenderTarget(layerRT);
        renderer.render(scene, camera);
      }
      let sourceTex = adj
        ? buffers[idx].texture
        : rec.parts
          ? composeView(layerRT, rec.parts, depth + 1)
          : layerRT.texture;
      let tex = fxStack(l, sourceTex, w, h, t),
        u = compositingMat.uniforms,
        v = (k) => val(l, k, t);
      u.under.value = buffers[idx].texture;
      u.layerTex.value = tex;
      u.depthFull.value = rt.depthTexture;
      u.depthLayer.value = adj ? rt.depthTexture : layerRT.depthTexture;
      u.pix.value.set(1 / w, 1 / h);
      u.blur.value = u.glow.value = u.shadow.value = u.hue.value = 0;
      u.sat.value = u.bri.value = 1;
      u.mode.value = ['正常', '相加', '滤色', '正片叠底', '叠加'].indexOf(l.blend);
      u.adjust.value = adj ? 1 : 0;
      u.alpha.value = adj || rec.parts ? (rec.opacity * v('opacity')) / 100 : 1;
      u.matteMode.value = 0;
      u.matteMap.value = layerRT.texture;
      if (l.matte) {
        const source = rec.inst?.map.get(l.matte) || instanceOf(l.matte)?.map.get(l.matte);
        if (source) {
          visibility((r) => r.o === source);
          let vis = source.visible;
          source.visible = true;
          let enabled = source.children.map((ch) => ch.visible);
          source.children.forEach((ch) => (ch.visible = true));
          let mrt = targetAt(depth * 4 + 19, w, h, true);
          scene.background = null;
          renderer.setClearColor(0, 0);
          renderer.setRenderTarget(mrt);
          renderer.render(scene, camera);
          source.visible = vis;
          source.children.forEach((ch, i) => (ch.visible = enabled[i]));
          u.matteMap.value = mrt.texture;
          u.matteMode.value =
            1 + Math.max(0, ['Alpha', '反转 Alpha', '亮度', '反转亮度'].indexOf(l.matteMode));
        }
      }
      let m = l.masks?.length ? maskAt(l.masks[0], t) : null;
      u.maskType.value =
        adj || rec.parts
          ? m
            ? m.shape === '矩形'
              ? 1
              : m.invert
                ? 3
                : 2
            : Math.max(0, ['无', '矩形', '椭圆', '反转椭圆'].indexOf(l.mask))
          : 0;
      u.region.value.set(
        0.5 + (v('x') + (m?.x || 0)) * 0.12,
        0.5 + (v('y') + (m?.y || 0)) * 0.2,
        (m?.w || 3) * 0.1,
        (m?.h || 2) * 0.17,
      );
      u.feather.value = (m?.feather ?? 2) / 100;
      idx = 1 - idx;
      drawPass(compositingMat, buffers[idx]);
    }
    return buffers[idx].texture;
  } finally {
    visibility(() => true);
    scene.background = bg;
    renderer.shadowMap.autoUpdate = true;
  }
}
function audioEvents(start, end) {
  let result = [],
    prev = new Map(),
    step = 1 / 40;
  function walk(c, t, global, path, seen) {
    if (seen.has(c.id)) return;
    for (let l of c.layers) {
      if (!l.visible || t < l.in || t > l.out) continue;
      let id = path + '/' + l.id;
      if (l.type === 'pre') {
        let cc = P.comps.find((c) => c.id === l.ref);
        if (cc)
          walk(
            cc,
            l.keys.remap?.length || l.expr.remap || l.remapOn
              ? val(l, 'remap', t)
              : t - l.in + (l.startOffset || 0),
            global,
            id,
            new Set(seen).add(c.id),
          );
      }
      if (l.type !== 'audio') continue;
      let old = prev.get(id),
        notes = l.notes || Array.from({ length: Math.ceil(c.duration) }, (_, i) => [i, 110, 0.48]);
      for (let [n, f, len] of notes) {
        if (
          old === undefined
            ? t >= n && t < n + len
            : old <= t
              ? n > old && n <= t
              : n < t + Math.abs(old - t) && n >= t
        ) {
          let at = old === undefined ? global : global - step + ((n - old) / (t - old || 1)) * step;
          result.push({
            l,
            t: n,
            start: Math.max(start, at),
            f,
            len: old === undefined ? len - (t - n) : len,
          });
        }
      }
      prev.set(id, t);
    }
  }
  for (let i = 0; i <= Math.ceil((end - start) / step); i++) {
    let global = Math.min(end, start + i * step);
    walk(C(), global, global, '', new Set());
  }
  return result;
}
const rgbKeys = ['red', 'green', 'blue'];
function sampledColor(l, t) {
  if (!rgbKeys.some((k) => l.keys[k]?.length || l.expr[k] || l.p[k] !== undefined)) return l.color;
  return (
    '#' +
    rgbKeys
      .map((k) =>
        Math.round(Math.max(0, Math.min(255, val(l, k, t))))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function surfaceVelocity(layer, hit, t, dt) {
  let meshes = simSnapshots(layer, t),
    i = meshes.indexOf(hit.object),
    prev = simSnapshots(layer, t - dt)[i],
    g = hit.object.geometry,
    old = prev?.geometry;
  if (!old?.attributes.position || old.attributes.position.count !== g.attributes.position.count)
    return V(...['x', 'y', 'z'].map((k) => (val(layer, k, t) - val(layer, k, t - dt)) / dt));
  let indices = [hit.face.a, hit.face.b, hit.face.c],
    pts = indices.map((i) =>
      V().fromBufferAttribute(g.attributes.position, i).applyMatrix4(hit.object.matrixWorld),
    ),
    weights = THREE.Triangle.getBarycoord(hit.point, ...pts, V());
  if (!weights) return V();
  let oldP = V();
  indices.forEach((n, j) =>
    oldP.addScaledVector(
      V().fromBufferAttribute(old.attributes.position, n).applyMatrix4(prev.matrixWorld),
      weights.getComponent(j),
    ),
  );
  return hit.point.clone().sub(oldP).divideScalar(dt);
}
function emitterWeights(geometry, outline) {
  const key = outline ? 'emissionOutline' : 'emissionSurface';
  if (geometry.userData[key]) return geometry.userData[key];
  const p = geometry.attributes.position,
    ix = geometry.index,
    n = ix ? ix.count : p.count;
  const values = [],
    edges = new Map(),
    a = V(),
    b = V(),
    c = V(),
    normal = V();
  let sum = 0;
  function addEdge(i, j, vi, vj) {
    const id = (v) =>
        v
          .toArray()
          .map((k) => Math.round(k * 10000))
          .join('/'),
      k = [id(vi), id(vj)].sort().join(':');
    if (edges.has(k)) edges.delete(k);
    else edges.set(k, [i, j, vi.distanceTo(vj)]);
  }
  for (let i = 0; i < n; i += 3) {
    let ia = ix ? ix.getX(i) : i,
      ib = ix ? ix.getX(i + 1) : i + 1,
      ic = ix ? ix.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, ia);
    b.fromBufferAttribute(p, ib);
    c.fromBufferAttribute(p, ic);
    if (outline) {
      THREE.Triangle.getNormal(a, b, c, normal);
      if (normal.z < 0.96) continue;
      addEdge(ia, ib, a, b);
      addEdge(ib, ic, b, c);
      addEdge(ic, ia, c, a);
    } else {
      let area = THREE.Triangle.getArea
        ? THREE.Triangle.getArea(a, b, c)
        : V().subVectors(b, a).cross(V().subVectors(c, a)).length() * 0.5;
      if (area > 0.00000001) {
        sum += area;
        values.push([sum, ia, ib, ic]);
      }
    }
  }
  if (outline)
    for (let [a, b, len] of edges.values()) {
      sum += len;
      values.push([sum, a, b, b]);
    }
  return (geometry.userData[key] = { sum, values });
}
function sampleSurface(meshes, r, outline) {
  const tables = meshes.map((m) => emitterWeights(m.geometry, outline));
  let q = r() * tables.reduce((s, t) => s + t.sum, 0),
    i = 0;
  while (i < tables.length - 1 && q > tables[i].sum) q -= tables[i++].sum;
  const table = tables[i];
  if (!table?.values.length) return null;
  let lo = 0,
    hi = table.values.length - 1;
  while (lo < hi) {
    let mid = (lo + hi) >> 1;
    if (table.values[mid][0] < q) lo = mid + 1;
    else hi = mid;
  }
  return { mesh: meshes[i], indices: table.values[lo].slice(1) };
}
function forgeTimbre(ctx, l, start, pitch, length, volume, noteTime) {
  const hit = length < 1;
  const ratios = hit ? [2.77, 4.13, 6.91, 11.57] : [0.5, 1.5, 2.002];
  ratios.forEach((ratio, i) => {
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    const dur = length * (hit ? 0.78 / (1 + i * 0.32) : 0.94);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(12, pitch * ratio * (hit ? 2 : 1)), start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, (volume * (hit ? 0.4 : 0.26)) / (i + 1)),
      start + (hit ? 0.002 : 0.035),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.05, dur));
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + Math.max(0.05, dur) + 0.01);
    sources.push(osc);
  });
  if (hit) {
    const len = Math.ceil(ctx.sampleRate * 0.068),
      buffer = ctx.createBuffer(1, len, ctx.sampleRate),
      data = buffer.getChannelData(0),
      random = rand(Math.round(noteTime * 48e3));
    for (let i = 0; i < len; i++)
      data[i] = (random() * 2 - 1) * Math.exp((-7 * i) / len) * volume * 0.8;
    const impulse = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2300;
    filter.Q.value = 0.7;
    impulse.buffer = buffer;
    impulse.connect(filter).connect(ctx.destination);
    impulse.start(start);
    sources.push(impulse);
  }
}
function refineSurface(geometry) {
  const pos = geometry.attributes.position,
    norm = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  const out = [],
    normals = [],
    coords = [],
    newGroups = [];
  function vertex(i) {
    return [
      pos.getX(i),
      pos.getY(i),
      pos.getZ(i),
      norm.getX(i),
      norm.getY(i),
      norm.getZ(i),
      uv.getX(i),
      uv.getY(i),
    ];
  }
  function dist(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  }
  function triangle(a, b, c, level) {
    const ab = dist(a, b),
      bc = dist(b, c),
      ca = dist(c, a);
    if (level < 5 && Math.max(ab, bc, ca) > 0.13) {
      if (bc > ab && bc >= ca) [a, b, c] = [b, c, a];
      else if (ca > ab && ca > bc) [a, b, c] = [c, a, b];
      let mid = a.map((v, i) => (v + b[i]) * 0.5);
      triangle(a, mid, c, level + 1);
      triangle(mid, b, c, level + 1);
      return;
    }
    for (let p of [a, b, c]) {
      out.push(p[0], p[1], p[2]);
      normals.push(p[3], p[4], p[5]);
      coords.push(p[6], p[7]);
    }
  }
  for (let group of geometry.groups) {
    const start = out.length / 3;
    for (let i = group.start; i < group.start + group.count; i += 3)
      triangle(vertex(i), vertex(i + 1), vertex(i + 2), 0);
    newGroups.push({ start, count: out.length / 3 - start, materialIndex: group.materialIndex });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(coords, 2));
  g.groups = newGroups;
  geometry.dispose();
  return g;
}
function validateProject(p) {
  if (!p || !Array.isArray(p.comps) || !p.comps.length) throw Error('合成列表无效');
  const compIds = new Set(),
    layerIds = new Set();
  for (const c of p.comps) {
    if (
      !c.id ||
      compIds.has(c.id) ||
      !Array.isArray(c.layers) ||
      !(c.fps > 0 && c.duration > 0 && c.w > 0 && c.h > 0)
    )
      throw Error('合成参数无效');
    compIds.add(c.id);
    for (const l of c.layers) {
      if (!l.id || layerIds.has(l.id) || !types[l.type]) throw Error('图层数据无效');
      layerIds.add(l.id);
      l.p = { ...def, ...l.p };
      l.nodes ||= [];
      l.keys ||= {};
      l.expr ||= {};
      for (let a of Object.values(l.keys)) {
        if (!Array.isArray(a) || a.some((q) => !Number.isFinite(q.t) || !Number.isFinite(q.v)))
          throw Error('关键帧无效');
        a.sort((u, v) => u.t - v.t);
      }
    }
    for (const l of c.layers) {
      let seen = new Set([l.id]),
        cur = l;
      while (cur.parent) {
        if (seen.has(cur.parent)) throw Error('父级循环引用');
        seen.add(cur.parent);
        cur = c.layers.find((a) => a.id === cur.parent);
        if (!cur) break;
      }
    }
  }
  function visit(c, seen) {
    if (seen.has(c.id)) throw Error('预合成循环引用');
    for (let l of c.layers)
      if (l.type === 'pre' && l.ref) {
        let cc = p.comps.find((a) => a.id === l.ref);
        if (cc) visit(cc, new Set(seen).add(c.id));
      }
  }
  p.comps.forEach((c) => visit(c, new Set()));
  p.palette ||= ['#e9e0ce', '#ffc164', '#ef7230', '#85422b', '#343537', '#181a1c'];
  if (!compIds.has(p.active)) p.active = p.comps[0].id;
  return p;
}
