/* 渲染基础：渲染器、泛光后处理、材质缓存、几何合并、文字贴图、模型图标渲染 */
(function (G) {
'use strict';
var T = window.THREE;
var gfx = G.gfx = {};

var renderer, scene, camera, W = 1, H = 1, pr = 1;
var sceneRT, bloomRT = [], tmpRT = [], fsMesh, fsScene, fsCam, matBright, matBlur, matComp, matCopy;
var useBloom = true;
function _unused() {}

gfx.init = function (canvas) {
  renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: false });
  pr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(38, 1, 0.1, 500);
  gfx.renderer = renderer; gfx.scene = scene; gfx.camera = camera;
  fsScene = new T.Scene(); fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  fsMesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial()); fsMesh.frustumCulled = false; fsScene.add(fsMesh);
  var vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }';
  matBright = new T.ShaderMaterial({ uniforms: { tex: { value: null }, thr: { value: 1.0 } }, vertexShader: vs, depthTest: false, depthWrite: false,
    fragmentShader: 'varying vec2 vUv; uniform sampler2D tex; uniform float thr; void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = max(c.r,max(c.g,c.b)); float k = smoothstep(thr, thr+1.1, l); gl_FragColor = vec4(c*k, 1.); }' });
  matBlur = new T.ShaderMaterial({ uniforms: { tex: { value: null }, dir: { value: new T.Vector2(1, 0) } }, vertexShader: vs, depthTest: false, depthWrite: false,
    fragmentShader: 'varying vec2 vUv; uniform sampler2D tex; uniform vec2 dir; void main(){ vec3 s = texture2D(tex, vUv).rgb*0.2270270270; s += texture2D(tex, vUv+dir*1.3846153846).rgb*0.3162162162; s += texture2D(tex, vUv-dir*1.3846153846).rgb*0.3162162162; s += texture2D(tex, vUv+dir*3.2307692308).rgb*0.0702702703; s += texture2D(tex, vUv-dir*3.2307692308).rgb*0.0702702703; gl_FragColor = vec4(s,1.); }' });
  matComp = new T.ShaderMaterial({ uniforms: { tex: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, str: { value: 0.5 }, time: { value: 0 }, res: { value: new T.Vector2(1, 1) }, flash: { value: 0 }, flashCol: { value: new T.Color(1, 0.2, 0.2) }, exposure: { value: 1.0 } },
    vertexShader: vs, depthTest: false, depthWrite: false,
    fragmentShader: [
      'varying vec2 vUv; uniform sampler2D tex,b1,b2,b3; uniform float str,time,flash,exposure; uniform vec2 res; uniform vec3 flashCol;',
      'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }',
      'void main(){',
      ' vec2 uv = vUv; vec2 c = uv-0.5; float r2 = dot(c,c);',
      ' vec2 off = c*r2*0.012; ',
      ' vec3 col; col.r = texture2D(tex, uv+off).r; col.g = texture2D(tex, uv).g; col.b = texture2D(tex, uv-off).b;',
      ' vec3 bl = texture2D(b1,uv).rgb*0.55 + texture2D(b2,uv).rgb*0.75 + texture2D(b3,uv).rgb*0.95;',
      ' col += bl*str; col *= exposure;',
      ' col = aces(col);',
      ' col = col*mix(vec3(0.97,1.02,1.0), vec3(1.05,1.0,0.92), smoothstep(0.1,0.8,dot(col,vec3(0.333)))) + vec3(0.0,0.010,0.007)*(1.-col);',
      ' col *= 1.0 - smoothstep(0.25, 0.95, r2*1.55)*0.55;',
      ' col = mix(col, flashCol, flash*(0.25+r2*1.6));',
      ' col = pow(col, vec3(1./2.2));',
      ' float n = fract(sin(dot(uv*res+time, vec2(12.9898,78.233)))*43758.5453); col += (n-0.5)*0.012;',
      ' col *= 0.985 + 0.015*sin(uv.y*res.y*1.3+time*2.);',
      ' gl_FragColor = vec4(col,1.);',
      '}'].join('\n') });
  matCopy = new T.ShaderMaterial({ uniforms: { tex: { value: null } }, vertexShader: vs, depthTest: false, depthWrite: false, fragmentShader: 'varying vec2 vUv; uniform sampler2D tex; void main(){ gl_FragColor = texture2D(tex, vUv); }' });
  gfx.matComp = matComp;
  gfx.resize();
};
gfx.setQuality = function (q) { gfx.quality = q; };
gfx.setPR = function (v) { pr = v; gfx.resize(); };
gfx.getPR = function () { return pr; };
gfx.disposeScene = function (sc) {
  if (!sc) return; sc.traverse(function (o) { if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose(); });
  (gfx.texList || []).forEach(function (t) { t.dispose(); }); gfx.texList = [];
};
gfx.newScene = function () { scene = new T.Scene(); gfx.scene = scene; return scene; };
gfx.resize = function () {
  var c = renderer.domElement, w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
  W = Math.max(2, Math.floor(w * pr)); H = Math.max(2, Math.floor(h * pr));
  renderer.setSize(W, H, false);
  camera.aspect = W / H; var shift = Math.round(44 * (G.uiz || 1) * pr); if (G.match && G.match.inMenu) shift = 0; if (shift) camera.setViewOffset(W, H, 0, shift, W, H); else camera.clearViewOffset(); camera.updateProjectionMatrix();
  if (sceneRT) sceneRT.dispose();
  try {
    sceneRT = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, samples: 4, depthBuffer: true });
  } catch (e) { sceneRT = new T.WebGLRenderTarget(W, H, { type: T.UnsignedByteType, depthBuffer: true }); }
  bloomRT.forEach(function (r) { r.dispose(); }); tmpRT.forEach(function (r) { r.dispose(); }); bloomRT = []; tmpRT = [];
  var bw = W, bh = H;
  for (var i = 0; i < 3; i++) {
    bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
    var opt = { type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter };
    bloomRT.push(new T.WebGLRenderTarget(bw, bh, opt)); tmpRT.push(new T.WebGLRenderTarget(bw, bh, opt));
  }
  matComp.uniforms.res.value.set(W, H);
};
function pass(mat, target) { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }
gfx.render = function (t) {
  if (!useBloom) { renderer.setRenderTarget(null); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.render(scene, camera); return; }
  renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
  var src = sceneRT.texture;
  for (var i = 0; i < 3; i++) {
    if (i === 0) { matBright.uniforms.tex.value = src; pass(matBright, bloomRT[0]); }
    else { matCopy.uniforms.tex.value = bloomRT[i - 1].texture; pass(matCopy, bloomRT[i]); }
    var bw = bloomRT[i].width, bh = bloomRT[i].height;
    matBlur.uniforms.tex.value = bloomRT[i].texture; matBlur.uniforms.dir.value.set(1.4 / bw, 0); pass(matBlur, tmpRT[i]);
    matBlur.uniforms.tex.value = tmpRT[i].texture; matBlur.uniforms.dir.value.set(0, 1.4 / bh); pass(matBlur, bloomRT[i]);
  }
  matComp.uniforms.tex.value = src; matComp.uniforms.b1.value = bloomRT[0].texture; matComp.uniforms.b2.value = bloomRT[1].texture; matComp.uniforms.b3.value = bloomRT[2].texture;
  matComp.uniforms.time.value = t % 100;
  pass(matComp, null);
};

// ---------- 材质与几何缓存 ----------
var matCache = {}, geoCache = {};
gfx.mat = function (color, o) {
  o = o || {};
  var key = color + '|' + (o.e || 0) + '|' + (o.ec || '') + '|' + (o.r == null ? 0.5 : o.r) + '|' + (o.m == null ? 0.3 : o.m) + '|' + (o.a == null ? 1 : o.a) + '|' + (o.basic ? 1 : 0) + '|' + (o.side || 0) + '|' + (o.add ? 1 : 0) + '|' + (o.dw ? 1 : 0);
  if (matCache[key]) return matCache[key];
  var m;
  if (o.basic) m = new T.MeshBasicMaterial({ color: new T.Color(color) });
  else m = new T.MeshStandardMaterial({ color: new T.Color(color), roughness: o.r == null ? 0.5 : o.r, metalness: o.m == null ? 0.3 : o.m, emissive: new T.Color(o.ec || color), emissiveIntensity: o.e || 0 });
  if (o.a != null && o.a < 1) { m.transparent = true; m.opacity = o.a; m.depthWrite = !!o.dw; }
  if (o.add) { m.blending = T.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
  if (o.side === 2) m.side = T.DoubleSide;
  matCache[key] = m; return m;
};
// 发光材质（基础材质，颜色乘以强度以触发泛光）
gfx.glow = function (color, k, a, add) {
  var key = 'glow|' + color + '|' + k + '|' + (a == null ? 1 : a) + '|' + (add ? 1 : 0);
  if (matCache[key]) return matCache[key];
  var c = new T.Color(color).multiplyScalar(k || 1.5);
  var m = new T.MeshBasicMaterial({ color: c, transparent: a != null && a < 1 || !!add, opacity: a == null ? 1 : a });
  if (add) { m.blending = T.AdditiveBlending; m.depthWrite = false; }
  else if (a != null && a < 1) m.depthWrite = false;
  matCache[key] = m; return m;
};
gfx.geo = function (name, make) { if (!geoCache[name]) { geoCache[name] = make(); geoCache[name].userData.cached = true; } return geoCache[name]; };
gfx.box = function (w, h, d) { return gfx.geo('b' + w + '_' + h + '_' + d, function () { return new T.BoxGeometry(w, h, d); }); };
gfx.cyl = function (rt, rb, h, seg) { return gfx.geo('c' + rt + '_' + rb + '_' + h + '_' + (seg || 12), function () { return new T.CylinderGeometry(rt, rb, h, seg || 12); }); };
gfx.sph = function (r, ws, hs) { return gfx.geo('s' + r + '_' + (ws || 14) + '_' + (hs || 10), function () { return new T.SphereGeometry(r, ws || 14, hs || 10); }); };
gfx.tor = function (r, t, rs, ts) { return gfx.geo('t' + r + '_' + t + '_' + (rs || 8) + '_' + (ts || 24), function () { return new T.TorusGeometry(r, t, rs || 8, ts || 24); }); };
gfx.cone = function (r, h, seg) { return gfx.geo('n' + r + '_' + h + '_' + (seg || 8), function () { return new T.ConeGeometry(r, h, seg || 8); }); };
gfx.oct = function (r) { return gfx.geo('o' + r, function () { return new T.OctahedronGeometry(r); }); };
gfx.ico = function (r, d) { return gfx.geo('i' + r + '_' + (d || 0), function () { return new T.IcosahedronGeometry(r, d || 0); }); };
gfx.plane = function (w, h) { return gfx.geo('p' + w + '_' + h, function () { return new T.PlaneGeometry(w, h); }); };
gfx.ring = function (a, b, seg) { return gfx.geo('r' + a + '_' + b + '_' + (seg || 32), function () { return new T.RingGeometry(a, b, seg || 32); }); };

gfx.mesh = function (geo, mat, x, y, z, parent) {
  var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
  if (parent) parent.add(m); return m;
};
gfx.shadowize = function (obj, cast, recv) { obj.traverse(function (o) { if (o.isMesh) { o.castShadow = cast !== false; o.receiveShadow = recv !== false; } }); return obj; };

// ---------- 几何合并 ----------
function MergeBuilder() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; this.n = 0; }
MergeBuilder.prototype.add = function (geo, matrix, color, k) {
  var p = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv, ix = geo.index;
  var c = color instanceof T.Color ? color : new T.Color(color); k = k == null ? 1 : k;
  var v = new T.Vector3(), nm = new T.Matrix3().getNormalMatrix(matrix), nv = new T.Vector3();
  for (var i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix); this.pos.push(v.x, v.y, v.z);
    nv.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); this.nor.push(nv.x, nv.y, nv.z);
    this.col.push(c.r * k, c.g * k, c.b * k);
    if (uv) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(0, 0);
  }
  if (ix) for (var j = 0; j < ix.count; j++) this.idx.push(ix.getX(j) + this.n);
  else for (var j2 = 0; j2 < p.count; j2++) this.idx.push(j2 + this.n);
  this.n += p.count;
};
var _m = new T.Matrix4(), _q = new T.Quaternion(), _s = new T.Vector3(), _p = new T.Vector3(), _e = new T.Euler();
MergeBuilder.prototype.box = function (x, y, z, w, h, d, color, k, ry) {
  _q.setFromEuler(_e.set(0, ry || 0, 0)); _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
  this.add(gfx.box(w, h, d), _m, color, k);
};
MergeBuilder.prototype.cyl = function (x, y, z, rt, rb, h, seg, color, k) {
  _q.identity(); _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)); this.add(gfx.cyl(rt, rb, h, seg), _m, color, k);
};
MergeBuilder.prototype.geo = function (geo, x, y, z, sx, sy, sz, ry, color, k) {
  _q.setFromEuler(_e.set(0, ry || 0, 0)); _m.compose(_p.set(x, y, z), _q, _s.set(sx || 1, sy || 1, sz || 1)); this.add(geo, _m, color, k);
};
MergeBuilder.prototype.build = function () {
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
  g.setIndex(this.idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
};
gfx.MergeBuilder = MergeBuilder;

// ---------- 文字 / 画布贴图 ----------
gfx.canvasTex = function (w, h, draw) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var ctx = c.getContext('2d'); draw(ctx, w, h);
  var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true; (gfx.texList = gfx.texList || []).push(tex);
  return tex;
};
gfx.FONT = '"Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif';
gfx.MONO = '"Cascadia Mono","Consolas","Microsoft YaHei UI",monospace';
gfx.textSprite = function (text, o) {
  o = o || {};
  var size = o.size || 64, pad = 14, font = (o.bold === false ? '' : 'bold ') + size + 'px ' + (o.mono ? gfx.MONO : gfx.FONT);
  var m = document.createElement('canvas').getContext('2d'); m.font = font;
  var tw = Math.ceil(m.measureText(text).width) + pad * 2, th = size + pad * 2;
  var tex = gfx.canvasTex(tw, th, function (ctx) {
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (o.bg) { ctx.fillStyle = o.bg; roundRect(ctx, 2, 2, tw - 4, th - 4, 14); ctx.fill(); if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 3; ctx.stroke(); } }
    ctx.shadowColor = o.glow || o.color || '#fff'; ctx.shadowBlur = o.glow ? 12 : 0;
    ctx.fillStyle = o.color || '#fff'; ctx.fillText(text, tw / 2, th / 2 + 2);
  });
  var mat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, opacity: o.opacity == null ? 1 : o.opacity });
  var sp = new T.Sprite(mat); var s = (o.scale || 0.012) * 1; sp.scale.set(tw * s, th * s, 1);
  sp.userData.aspect = tw / th; return sp;
};
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
gfx.roundRect = roundRect;

// ---------- 把三维对象渲染成小图标（dataURL） ----------
var iconScene, iconCam, iconRT, iconSize = 0;
gfx.renderIcon = function (obj, size, opt) {
  opt = opt || {};
  if (!iconScene) {
    iconScene = new T.Scene(); iconCam = new T.PerspectiveCamera(30, 1, 0.1, 50);
    var hl = new T.HemisphereLight(0xcfe8ff, 0x203040, 1.6); iconScene.add(hl);
    var dl = new T.DirectionalLight(0xffffff, 2.6); dl.position.set(3, 5, 4); iconScene.add(dl);
    var dl2 = new T.DirectionalLight(0x66ccff, 1.3); dl2.position.set(-4, 2, -3); iconScene.add(dl2);
  }
  if (iconSize !== size) { if (iconRT) iconRT.dispose(); iconRT = new T.WebGLRenderTarget(size, size, { type: T.UnsignedByteType, depthBuffer: true }); iconSize = size; }
  iconScene.add(obj);
  var cache = opt.cache || {}, ctr, d, sz;
  if (cache.d) { ctr = cache.ctr; d = cache.d; }
  else {
    var box = new T.Box3(), tmp = new T.Box3(); ctr = new T.Vector3(); sz = new T.Vector3();
    obj.updateMatrixWorld(true);
    obj.traverse(function (o) { if (o.isMesh && !o.userData.noBox) { tmp.setFromObject(o); if (!tmp.isEmpty()) box.union(tmp); } });
    box.getCenter(ctr); box.getSize(sz);
    var rad = Math.max(sz.x, sz.y, sz.z) * (opt.zoom || 1.0); d = rad * 1.9 + 0.5; cache.d = d; cache.ctr = ctr; cache.sy = sz.y;
  }
  var ang = opt.az != null ? opt.az : 0.7, el = opt.el != null ? opt.el : 0.5;
  iconCam.position.set(ctr.x + Math.sin(ang) * Math.cos(el) * d, ctr.y + Math.sin(el) * d, ctr.z + Math.cos(ang) * Math.cos(el) * d);
  iconCam.lookAt(ctr.x, ctr.y - (cache.sy || 0) * 0.05, ctr.z);
  var oldCol = renderer.getClearColor(new T.Color()), oldA = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(iconRT); renderer.clear(); renderer.render(iconScene, iconCam); renderer.setRenderTarget(null);
  renderer.setClearColor(oldCol, oldA);
  iconScene.remove(obj);
  var buf = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(iconRT, 0, 0, size, size, buf);
  var cv = opt.canvas || document.createElement('canvas'); cv.width = size; cv.height = size;
  var ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), p = img.data;
  for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
    var s = ((size - 1 - y) * size + x) * 4, dd = (y * size + x) * 4, a = buf[s + 3] / 255;
    for (var c = 0; c < 3; c++) {
      var v = a > 0 ? buf[s + c] / 255 / a : 0; v = Math.min(1, v); v = Math.pow(v, 1 / 2.2) * 1.0; p[dd + c] = Math.min(255, v * 255);
    }
    p[dd + 3] = buf[s + 3];
  }
  ctx.putImageData(img, 0, 0);
  return opt.canvas ? cv : cv.toDataURL('image/png');
};
})(window.G = window.G || {});
