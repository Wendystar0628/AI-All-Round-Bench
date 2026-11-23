/* 战场场景：悬浮网格、地形细节、协议层、远景网络、天空 */
(function (G) {
'use strict';
var T = window.THREE, gfx = G.gfx, K = G.K;
var THEMES = {
  // 企业内网：墨玉 + 鎏金
  enterprise: { sky: ['#02080a', '#0e3028', '#07201b'], fog: '#06150f', base: '#0b1a16', road: '#21403a', lane: '#e3b560', plat: '#394c44', platTop: '#668673', accent: '#e3b560', obs: '#1c332d', led: ['#e3b560', '#6fe0b0', '#f2764a'], layer: '#c9a14e', cluster: '#e3b560', key: '#fff1d6', amb: '#8fb8a6', ground: '#10261f', rim: '#e3b560', stream: '#2fb89a' },
  // 跨网骨干：沉香紫 + 珊瑚，公网流为青碧
  backbone: { sky: ['#0b0610', '#33132e', '#190a1c'], fog: '#150818', base: '#190d1d', road: '#3f2c47', lane: '#ff8d78', plat: '#54405a', platTop: '#98799a', accent: '#ff8d78', obs: '#2d1c35', led: ['#ff8d78', '#f6c177', '#9fe3c8'], layer: '#c7799a', cluster: '#ff8d78', key: '#ffe8e0', amb: '#b79ab5', ground: '#1f1127', rim: '#ff8d78', stream: '#36c9b9' },
  // 气隙深层：钛灰 + 信号橙，气隙为冷紫
  airgap: { sky: ['#030406', '#1c2432', '#0c1118'], fog: '#0a0e13', base: '#12161b', road: '#3d434c', lane: '#ff9a3c', plat: '#4a535f', platTop: '#8993a0', accent: '#ff9a3c', obs: '#272d36', led: ['#ff9a3c', '#7fe0a0', '#ff5d4a'], layer: '#8aa0b8', cluster: '#ff9a3c', key: '#fff0e0', amb: '#98a8ba', ground: '#161b22', rim: '#ff9a3c', stream: '#2fb89a' }
};
G.THEMES = THEMES;
function hash(x, y, s) { var h = Math.sin(x * 127.1 + y * 311.7 + (s || 0) * 74.7) * 43758.5453; return h - Math.floor(h); }
G.hash = hash;
var DX = G.DX, DY = G.DY;

function Terrain(game, scene) {
  this.game = game; this.scene = scene; this.theme = THEMES[game.map.theme];
  this.root = new T.Group(); scene.add(this.root);
  this.anim = []; this.uniforms = []; this.nodeObjs = {}; this.entObjs = {}; this.exitObjs = {};
  this.W = game.W; this.H = game.H; this.cx = (game.W - 1) / 2; this.cz = (game.H - 1) / 2;
  this.buildLights(); this.buildEnvironment(); this.buildBoard(); this.buildSpecials();
}
G.Terrain = Terrain;
var TP = Terrain.prototype;

TP.buildLights = function () {
  var th = this.theme, sc = this.scene, g = this.game;
  sc.background = new T.Color(th.sky[2]);
  sc.fog = new T.FogExp2(new T.Color(th.fog), 0.0105);
  var hemi = new T.HemisphereLight(new T.Color(th.amb), new T.Color(th.ground), 0.8); this.root.add(hemi);
  var key = new T.DirectionalLight(new T.Color(th.key), 2.5);
  key.position.set(this.cx - 9, 17, this.cz + 9); key.target.position.set(this.cx, 0, this.cz);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  var sh = key.shadow.camera; sh.left = -15; sh.right = 15; sh.top = 13; sh.bottom = -13; sh.near = 2; sh.far = 50; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  this.root.add(key); this.root.add(key.target); this.key = key;
  var rim = new T.DirectionalLight(new T.Color(th.rim), 1.0); rim.position.set(this.cx + 10, 6, this.cz - 12); this.root.add(rim);
  // 环境反射：用主题色天空 + 若干灯板生成 PMREM，让金属与塑料材质有反射层次
  try {
    var es = new T.Scene(), c0 = new T.Color(th.sky[1]), c1 = new T.Color(th.sky[0]);
    var dome = new T.Mesh(new T.SphereGeometry(20, 24, 16), new T.ShaderMaterial({ side: T.BackSide, uniforms: { a: { value: c0.clone().multiplyScalar(0.9) }, b: { value: c1 }, g: { value: new T.Color(th.ground).multiplyScalar(0.6) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 a,b,g; void main(){ float h = vP.y; vec3 c = h>0. ? mix(a,b,smoothstep(0.,0.9,h)) : mix(a,g,smoothstep(0.,-0.6,h)); gl_FragColor = vec4(c,1.); }' }));
    es.add(dome);
    var panel = function (x, y, z, w, h, col, k) { var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel(0, 14, 2, 14, 6, th.key, 3.2); panel(-12, 6, -6, 4, 8, th.accent, 2.2); panel(12, 5, 6, 4, 8, th.rim, 1.8); panel(0, 4, -14, 12, 3, th.accent, 1.6); panel(0, 3, 14, 12, 2, '#ffffff', 1.2);
    var pm = new T.PMREMGenerator(gfx.renderer); var rt = pm.fromScene(es, 0.03); this.envRT = rt; sc.environment = rt.texture; pm.dispose();
  } catch (e) { console.warn('env map failed', e); }
  var low = new T.PointLight(new T.Color(th.accent), 18, 26, 1.6); low.position.set(this.cx, 3.2, this.cz); this.root.add(low); this.pl = low;
};

TP.buildEnvironment = function () {
  var th = this.theme, root = this.root, cx = this.cx, cz = this.cz, self = this;
  // 天空
  var skyMat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { c0: { value: new T.Color(th.sky[0]) }, c1: { value: new T.Color(th.sky[1]) }, c2: { value: new T.Color(th.sky[2]) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 c0,c1,c2; void main(){ float h = vP.y; vec3 c = mix(c1, c0, smoothstep(0.0, 0.85, h)); c = mix(c, c2, smoothstep(0.0, -0.5, h)); c += c1*0.25*pow(max(0.,1.-abs(h+0.05)*3.),2.); gl_FragColor = vec4(c,1.); }' });
  var sky = new T.Mesh(new T.SphereGeometry(300, 24, 16), skyMat); sky.position.set(cx, 0, cz); root.add(sky);
  // 协议层
  var names = ['L7 应用层 · HTTP/DNS/SMTP', 'L4 传输层 · TCP/UDP 443', 'L3 网络层 · IP/BGP/OSPF', 'L2 链路层 · ETH/MODBUS'];
  var ys = [-3.2, -6.4, -10, -14.5];
  this.layers = [];
  for (var li = 0; li < 4; li++) {
    (function (li) {
      var tex = gfx.canvasTex(1024, 1024, function (ctx, w, h) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = th.layer; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5;
        var step = 64; for (var i = 0; i <= w; i += step) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
        ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
        for (var k = 0; k < 40; k++) { // 电路走线
          var x = Math.floor(hash(k, li, 1) * 16) * step, y = Math.floor(hash(k, li, 2) * 16) * step; ctx.beginPath(); ctx.moveTo(x, y);
          for (var s = 0; s < 4; s++) { if (hash(k, s + li, 3) > 0.5) x += (hash(k, s, 4) > 0.5 ? 1 : -1) * step * (1 + Math.floor(hash(k, s, 5) * 3)); else y += (hash(k, s, 6) > 0.5 ? 1 : -1) * step * (1 + Math.floor(hash(k, s, 7) * 3)); ctx.lineTo(x, y); }
          ctx.stroke(); ctx.fillStyle = th.layer; ctx.fillRect(x - 4, y - 4, 8, 8);
        }
        ctx.globalAlpha = 0.85; ctx.fillStyle = th.layer; ctx.font = 'bold 30px ' + gfx.MONO;
        for (var t = 0; t < 14; t++) { ctx.fillText(['0x7F', 'ACK', 'SYN', ':443', 'TTL 64', 'SEQ', 'ARP', 'VLAN', 'BGP', 'OSPF', '10.0.', 'FIN', ':502', 'RST'][t], hash(t, li, 8) * (w - 140), 40 + hash(t, li, 9) * (h - 80)); }
      });
      tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(1, 1);
      var m = new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.2 - li * 0.03, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, color: new T.Color(0xffffff).multiplyScalar(1.4) });
      var pl = new T.Mesh(new T.PlaneGeometry(150, 150), m); pl.rotation.x = -Math.PI / 2; pl.position.set(cx, ys[li], cz); root.add(pl);
      self.layers.push({ tex: tex, speed: 0.0015 * (li % 2 ? -1 : 1) * (li + 1), mesh: pl });
      var lab = gfx.textSprite(names[li], { size: 44, color: th.layer, glow: th.layer, scale: 0.02, mono: false, opacity: 0.7 }); lab.position.set(cx - 22, ys[li] + 0.5, cz + 22); root.add(lab);
    })(li);
  }
  // 数据包流（着色器驱动）
  var cnt = 320, a0 = new Float32Array(cnt * 3), a1 = new Float32Array(cnt * 3), ph = new Float32Array(cnt * 2);
  for (var i = 0; i < cnt; i++) {
    var layer = Math.floor(hash(i, 1, 11) * 4), y = ys[layer] + 0.05, horiz = hash(i, 2, 12) > 0.5, lane = (Math.floor(hash(i, 3, 13) * 16) - 8) * 64 / 1024 * 150;
    var len = 150;
    if (horiz) { a0.set([cx - 75, y, cz + lane * 0.99], i * 3); a1.set([cx + 75, y, cz + lane * 0.99], i * 3); } else { a0.set([cx + lane * 0.99, y, cz - 75], i * 3); a1.set([cx + lane * 0.99, y, cz + 75], i * 3); }
    ph[i * 2] = hash(i, 4, 14); ph[i * 2 + 1] = 0.02 + hash(i, 5, 15) * 0.05;
  }
  var pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(a0, 3)); pg.setAttribute('aEnd', new T.BufferAttribute(a1, 3)); pg.setAttribute('aPh', new T.BufferAttribute(ph, 2));
  var pmat = this.packetMat(th.layer, 6);
  var pts = new T.Points(pg, pmat); pts.frustumCulled = false; root.add(pts);
  // 远景网络集群
  var nodePos = [], edges = [], clusters = 11;
  for (var c = 0; c < clusters; c++) {
    var ang = c / clusters * Math.PI * 2 + hash(c, 0, 21) * 0.4, rad = 52 + hash(c, 1, 22) * 38, cy = -6 + hash(c, 2, 23) * 26;
    var ccx = cx + Math.cos(ang) * rad, ccz = cz + Math.sin(ang) * rad * 0.9, base = nodePos.length, n = 7 + Math.floor(hash(c, 3, 24) * 6);
    for (var k = 0; k < n; k++) nodePos.push([ccx + (hash(c, k, 25) - 0.5) * 12, cy + (hash(c, k, 26) - 0.5) * 6, ccz + (hash(c, k, 27) - 0.5) * 12]);
    for (var k2 = 1; k2 < n; k2++) { edges.push([base + k2, base + Math.floor(hash(c, k2, 28) * k2)]); if (hash(c, k2, 29) > 0.6) edges.push([base + k2, base + Math.floor(hash(c, k2, 30) * n)]); }
    if (c > 0) edges.push([base, base - 7 - Math.floor(hash(c, 5, 31) * 5)]);
  }
  edges = edges.filter(function (e) { return e[0] !== e[1] && nodePos[e[1]]; });
  var lpos = []; edges.forEach(function (e) { var a = nodePos[e[0]], b = nodePos[e[1]]; lpos.push(a[0], a[1], a[2], b[0], b[1], b[2]); });
  var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lpos, 3));
  var lines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: new T.Color(th.cluster).multiplyScalar(0.55), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false })); root.add(lines);
  var inst = new T.InstancedMesh(new T.IcosahedronGeometry(0.55, 0), new T.MeshBasicMaterial({ color: new T.Color(th.cluster).multiplyScalar(2.2) }), nodePos.length), mm = new T.Matrix4();
  nodePos.forEach(function (p, i) { var s = 0.6 + hash(i, 0, 33) * 1.3; mm.compose(new T.Vector3(p[0], p[1], p[2]), new T.Quaternion(), new T.Vector3(s, s, s)); inst.setMatrixAt(i, mm); });
  root.add(inst); this.clusterInst = inst;
  var ecnt = edges.length * 3, e0 = new Float32Array(ecnt * 3), e1 = new Float32Array(ecnt * 3), eph = new Float32Array(ecnt * 2);
  for (var j = 0; j < ecnt; j++) { var ed = edges[j % edges.length], pa = nodePos[ed[0]], pb = nodePos[ed[1]]; e0.set(pa, j * 3); e1.set(pb, j * 3); eph[j * 2] = hash(j, 0, 41); eph[j * 2 + 1] = 0.08 + hash(j, 1, 42) * 0.18; }
  var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(e0, 3)); eg.setAttribute('aEnd', new T.BufferAttribute(e1, 3)); eg.setAttribute('aPh', new T.BufferAttribute(eph, 2));
  var ep = new T.Points(eg, this.packetMat(th.accent, 9)); ep.frustumCulled = false; root.add(ep);
  // 漂浮尘埃/数据光点
  var dn = 260, dp = new Float32Array(dn * 3);
  for (var d = 0; d < dn; d++) dp.set([cx + (hash(d, 0, 51) - 0.5) * 40, -2 + hash(d, 1, 52) * 12, cz + (hash(d, 2, 53) - 0.5) * 34], d * 3);
  var dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(dp, 3));
  var dm = new T.PointsMaterial({ color: new T.Color(th.accent).multiplyScalar(1.4), size: 0.07, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
  this.dust = new T.Points(dg, dm); root.add(this.dust);
};
TP.packetMat = function (color, size) {
  var m = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, col: { value: new T.Color(color).multiplyScalar(2.2) }, size: { value: size } },
    vertexShader: 'attribute vec3 aEnd; attribute vec2 aPh; uniform float uTime, size; varying float vA; void main(){ float t = fract(uTime*aPh.y + aPh.x); vec3 p = mix(position, aEnd, t); vA = smoothstep(0.,0.08,t)*smoothstep(1.,0.92,t); vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = size*(60./-mv.z); }',
    fragmentShader: 'uniform vec3 col; varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(col, a*vA); }' });
  this.uniforms.push(m.uniforms.uTime); return m;
};

// ---------- 棋盘 ----------
TP.buildBoard = function () {
  var g = this.game, th = this.theme, root = this.root, W = this.W, H = this.H, cx = this.cx, cz = this.cz;
  var B = new gfx.MergeBuilder(), E = new gfx.MergeBuilder(), GL = new gfx.MergeBuilder();
  var metal = new gfx.MergeBuilder();
  var base = new T.Color(th.base), road = new T.Color(th.road), plat = new T.Color(th.plat), platTop = new T.Color(th.platTop), lane = new T.Color(th.lane), acc = new T.Color(th.accent);
  var self = this;
  // 底座
  var sw = W + 1.0, sd = H + 1.0;
  B.box(cx, -0.32, cz, sw, 0.5, sd, base.clone().multiplyScalar(0.9));
  B.box(cx, -0.62, cz, sw - 0.5, 0.16, sd - 0.5, base.clone().multiplyScalar(0.55));
  B.box(cx, -0.78, cz, sw - 1.4, 0.2, sd - 1.4, base.clone().multiplyScalar(0.4));
  // 边缘发光带
  E.box(cx, -0.07, cz - sd / 2 + 0.02, sw, 0.04, 0.04, acc, 1.7); E.box(cx, -0.07, cz + sd / 2 - 0.02, sw, 0.04, 0.04, acc, 1.7);
  E.box(cx - sw / 2 + 0.02, -0.07, cz, 0.04, 0.04, sd, acc, 1.7); E.box(cx + sw / 2 - 0.02, -0.07, cz, 0.04, 0.04, sd, acc, 1.7);
  for (var s = 0; s < 8; s++) { var ex = cx - sw / 2 + (s + 0.5) * sw / 8; E.box(ex, -0.42, cz + sd / 2 + 0.01, 0.5, 0.05, 0.02, acc, 1.2); E.box(ex, -0.42, cz - sd / 2 - 0.01, 0.5, 0.05, 0.02, acc, 1.2); }
  // 悬挂支撑与线缆
  for (var q = 0; q < 6; q++) {
    var px = cx + (q % 3 - 1) * sw * 0.32, pz = cz + (q < 3 ? -1 : 1) * sd * 0.28;
    metal.cyl(px, -3.2, pz, 0.14, 0.2, 5.6, 8, base.clone().multiplyScalar(0.8)); E.box(px, -2.0, pz, 0.3, 0.04, 0.3, acc, 1.5); E.box(px, -4.2, pz, 0.3, 0.04, 0.3, acc, 1.5);
  }
  // 地面铺贴贴图
  var tex = gfx.canvasTex(W * 64, H * 64, function (ctx, w, h) {
    ctx.fillStyle = '#070b0a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(216,190,124,0.10)'; ctx.lineWidth = 1;
    for (var i = 0; i <= W; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke(); }
    for (var j = 0; j <= H; j++) { ctx.beginPath(); ctx.moveTo(0, j * 64); ctx.lineTo(w, j * 64); ctx.stroke(); }
    var sums = {};
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var z = g.zoneAt[y * W + x]; if (!z) continue;
      ctx.fillStyle = hexA(z.color, 0.10); ctx.fillRect(x * 64, y * 64, 64, 64);
      var s2 = sums[z.name] || (sums[z.name] = { x: 0, y: 0, n: 0, c: z.color }); s2.x += x; s2.y += y; s2.n++;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (var k = 0; k < 90; k++) { // 板上走线
      var tx = Math.floor(hash(k, 1, 61) * W) * 64 + 32, ty = Math.floor(hash(k, 2, 62) * H) * 64 + 32;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + (hash(k, 3, 63) > 0.5 ? 1 : -1) * 64 * Math.floor(1 + hash(k, 4, 64) * 3), ty); ctx.lineTo(tx, ty + (hash(k, 5, 65) > 0.5 ? 1 : -1) * 64); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 34px ' + gfx.FONT;
    for (var nm in sums) { var sm = sums[nm]; ctx.fillStyle = hexA(sm.c, 0.5); ctx.fillText(nm, (sm.x / sm.n + 0.5) * 64, (sm.y / sm.n + 0.5) * 64 + 0); }
  });
  var floor = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.1, color: 0xffffff })); floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.002, cz); floor.receiveShadow = true; root.add(floor);
  // 逐格
  var water = [], gap = [];
  for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
    var i2 = y2 * W + x2, k2 = g.kind[i2], ch = g.sub[i2], z2 = g.zoneAt[i2], zc = z2 ? new T.Color(z2.color) : null;
    var chk = (x2 + y2) % 2 ? 1.0 : 0.93;
    if (k2 === K.PLAT) {
      var pc = plat.clone().multiplyScalar(chk); if (zc) pc.lerp(zc, 0.14);
      B.box(x2, 0.18, y2, 0.94, 0.36, 0.94, pc);
      B.box(x2, 0.37, y2, 0.8, 0.03, 0.8, platTop.clone().multiplyScalar(chk));
      B.box(x2, 0.375, y2, 0.5, 0.03, 0.5, platTop.clone().multiplyScalar(0.7 * chk));
      E.box(x2 - 0.43, 0.372, y2, 0.02, 0.012, 0.74, acc, 1.5); E.box(x2 + 0.43, 0.372, y2, 0.02, 0.012, 0.74, acc, 1.5);
      for (var v = -1; v <= 1; v++) B.box(x2 + 0.18 * v, 0.392, y2 + 0.34, 0.1, 0.012, 0.03, base);
      metal.cyl(x2 - 0.4, 0.4, y2 - 0.4, 0.035, 0.035, 0.04, 6, new T.Color('#c7bca1')); metal.cyl(x2 + 0.4, 0.4, y2 - 0.4, 0.035, 0.035, 0.04, 6, new T.Color('#c7bca1'));
      metal.cyl(x2 - 0.4, 0.4, y2 + 0.4, 0.035, 0.035, 0.04, 6, new T.Color('#c7bca1')); metal.cyl(x2 + 0.4, 0.4, y2 + 0.4, 0.035, 0.035, 0.04, 6, new T.Color('#c7bca1'));
    } else if (g.isRoadKind(k2)) {
      var rc = road.clone().multiplyScalar(chk); if (zc) rc.lerp(zc, 0.2);
      var isOld = k2 === K.OLD;
      if (isOld) rc = new T.Color('#6b4a2c').multiplyScalar(chk);
      B.box(x2, 0.05, y2, 1.0, 0.1, 1.0, rc);
      var laneC = isOld ? new T.Color('#ff9a3d') : (k2 === K.TUN ? new T.Color('#9ccfdc') : lane);
      var arms = [];
      for (var d = 0; d < 4; d++) { var nx = x2 + DX[d], ny = y2 + DY[d]; arms[d] = g.inb(nx, ny) && g.isRoadKind(g.kind[ny * W + nx]); }
      // 路缘发光线
      var o = 0.31, hw = 0.012, yy = 0.103, kk = isOld ? 1.2 : 1.35;
      // N(-z) S(+z) W(-x) E(+x)
      var hasE = arms[0], hasS = arms[1], hasW = arms[2], hasN = arms[3];
      function seg(x0, z0, x1, z1) { E.box(x2 + (x0 + x1) / 2, yy, y2 + (z0 + z1) / 2, Math.abs(x1 - x0) + 0.025, 0.008, Math.abs(z1 - z0) + 0.025, laneC, kk); }
      if (!hasN) seg(hasW ? -0.5 : -o, -o, hasE ? 0.5 : o, -o); else { seg(-o, -0.5, -o, -o); seg(o, -0.5, o, -o); }
      if (!hasS) seg(hasW ? -0.5 : -o, o, hasE ? 0.5 : o, o); else { seg(-o, o, -o, 0.5); seg(o, o, o, 0.5); }
      if (!hasW) seg(-o, hasN ? -0.5 : -o, -o, hasS ? 0.5 : o); else { seg(-0.5, -o, -o, -o); seg(-0.5, o, -o, o); }
      if (!hasE) seg(o, hasN ? -0.5 : -o, o, hasS ? 0.5 : o); else { seg(o, -o, 0.5, -o); seg(o, o, 0.5, o); }
      // 中线虚线
      if (isOld) { // 旧链路：线缆束纹理
        for (var cb = -2; cb <= 2; cb++) { if (hasE || hasW) B.box(x2, 0.108, y2 + cb * 0.09, 0.9, 0.012, 0.045, new T.Color('#3b2814')); else B.box(x2 + cb * 0.09, 0.108, y2, 0.045, 0.012, 0.9, new T.Color('#3b2814')); }
      } else {
        var dash = new T.Color(th.lane).multiplyScalar(0.55);
        if (hasE || hasW) { for (var dd = -1; dd <= 1; dd += 2) E.box(x2 + dd * 0.25, 0.103, y2, 0.14, 0.006, 0.02, dash, 0.9); }
        if (hasN || hasS) { for (var dd2 = -1; dd2 <= 1; dd2 += 2) E.box(x2, 0.103, y2 + dd2 * 0.25, 0.02, 0.006, 0.14, dash, 0.9); }
      }
      if (k2 === K.TUN) {
        // 专线隧道：玻璃套管 + 肋环
        var horiz = hasE || hasW, geo = gfx.cyl(0.43, 0.43, 1.0, 20);
        var m4 = new T.Matrix4(), q4 = new T.Quaternion().setFromEuler(new T.Euler(horiz ? 0 : Math.PI / 2 * 0, 0, horiz ? Math.PI / 2 : 0));
        if (!horiz) q4.setFromEuler(new T.Euler(Math.PI / 2, 0, 0));
        m4.compose(new T.Vector3(x2, 0.38, y2), q4, new T.Vector3(1, 1, 1)); GL.add(geo, m4, new T.Color('#6aa8bc'), 1);
        for (var rb = -1; rb <= 1; rb++) {
          var rg = gfx.tor(0.44, 0.022, 6, 24), mq = new T.Quaternion().setFromEuler(new T.Euler(0, horiz ? Math.PI / 2 : 0, 0));
          m4.compose(new T.Vector3(x2 + (horiz ? rb * 0.4 : 0), 0.38, y2 + (horiz ? 0 : rb * 0.4)), mq, new T.Vector3(1, 1, 1)); E.add(rg, m4, new T.Color('#b5dae4'), 1.5);
        }
      }
    } else if (ch === '~') { water.push(i2); }
    else if (ch === '=') { gap.push(i2); }
    else if (ch === 'X') this.buildFacility(B, E, metal, x2, y2, hash(x2, y2, 71));
    else { // 空白基板
      B.box(x2, 0.025, y2, 0.96, 0.05, 0.96, base.clone().multiplyScalar(1.15));
      for (var cp = 0; cp < 3; cp++) if (hash(x2, y2, 80 + cp) > 0.45) B.box(x2 + (hash(x2, y2, 90 + cp) - 0.5) * 0.7, 0.08, y2 + (hash(x2, y2, 100 + cp) - 0.5) * 0.7, 0.1 + hash(x2, y2, 110 + cp) * 0.12, 0.06, 0.1 + hash(x2, y2, 120 + cp) * 0.1, new T.Color('#263531'));
      if (hash(x2, y2, 130) > 0.7) E.box(x2, 0.056, y2, 0.5, 0.006, 0.02, acc, 0.7);
    }
  }
  var matB = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.35 });
  var mb = new T.Mesh(B.build(), matB); mb.castShadow = true; mb.receiveShadow = true; root.add(mb);
  var mm = new T.Mesh(metal.build(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 })); mm.castShadow = true; mm.receiveShadow = true; root.add(mm);
  var emMat = new T.MeshBasicMaterial({ vertexColors: true }), emU = { value: 0 }; this.uniforms.push(emU);
  emMat.onBeforeCompile = function (sh) {
    sh.uniforms.uTime = emU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime;').replace('#include <color_fragment>', '#include <color_fragment>\nfloat fl = 0.8 + 0.2*sin(uTime*2.4 + (vWp.x+vWp.z)*1.4); vec2 cell = floor(vWp.xz*7.); float sp = step(0.975, fract(sin(dot(cell, vec2(12.9898,78.233)) + floor(uTime*2.0 + dot(cell,vec2(0.37,0.11))))*43758.5453)); diffuseColor.rgb *= fl*(1.0 + sp*1.2);');
  };
  root.add(new T.Mesh(E.build(), emMat));
  if (GL.n) root.add(new T.Mesh(GL.build(), new T.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.2, depthWrite: false, side: T.DoubleSide, emissive: new T.Color('#3f7a8a'), emissiveIntensity: 0.4 })));
  this.buildWater(water); this.buildGap(gap);
};
function hexA(hex, a) { var c = new T.Color(hex); return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + a + ')'; }

TP.buildFacility = function (B, E, metal, x, y, r) {
  var th = this.theme, obs = new T.Color(th.obs), led = th.led, kind = this.game.map.theme;
  var v = Math.floor(r * 4), shade = 0.85 + hash(x, y, 140) * 0.4;
  B.box(x, 0.04, y, 0.96, 0.08, 0.96, obs.clone().multiplyScalar(0.7));
  if (kind === 'airgap') {
    if (v === 0) { // 储罐
      metal.cyl(x, 0.55, y, 0.34, 0.34, 1.0, 14, obs.clone().multiplyScalar(1.4 * shade)); metal.cyl(x, 1.08, y, 0.2, 0.34, 0.12, 14, obs.clone().multiplyScalar(1.1));
      E.box(x, 0.8, y + 0.341, 0.5, 0.05, 0.01, new T.Color(led[0]), 1.4); metal.cyl(x + 0.28, 0.5, y - 0.2, 0.05, 0.05, 0.9, 6, new T.Color('#8a7a52'));
    } else if (v === 1) { // 冷却塔
      metal.cyl(x, 0.5, y, 0.3, 0.42, 0.9, 12, obs.clone().multiplyScalar(1.2 * shade)); E.box(x, 0.96, y, 0.5, 0.025, 0.5, new T.Color(led[2]), 1.2); metal.cyl(x, 1.05, y, 0.22, 0.3, 0.2, 12, obs.clone().multiplyScalar(0.8));
    } else if (v === 2) { // 烟囱与管线
      metal.cyl(x - 0.2, 0.8, y - 0.1, 0.1, 0.14, 1.5, 8, obs.clone().multiplyScalar(1.3)); E.box(x - 0.2, 1.57, y - 0.1, 0.22, 0.05, 0.22, new T.Color(led[2]), 1.8);
      B.box(x + 0.2, 0.28, y + 0.12, 0.4, 0.4, 0.5, obs.clone().multiplyScalar(1.1 * shade)); E.box(x + 0.2, 0.3, y + 0.38, 0.3, 0.04, 0.01, new T.Color(led[0]), 1.5);
      metal.cyl(x, 0.25, y + 0.3, 0.05, 0.05, 0.9, 6, new T.Color('#a58a4a'));
    } else { // 控制柜群
      for (var i = 0; i < 3; i++) { var hh = 0.5 + hash(x + i, y, 150) * 0.55; B.box(x - 0.28 + i * 0.28, hh / 2 + 0.08, y, 0.24, hh, 0.6, obs.clone().multiplyScalar(1.1 + i * 0.1)); E.box(x - 0.28 + i * 0.28, hh * 0.7, y + 0.302, 0.14, 0.02, 0.01, new T.Color(led[i % 3]), 1.6); E.box(x - 0.28 + i * 0.28, hh * 0.45, y + 0.302, 0.14, 0.02, 0.01, new T.Color(led[(i + 1) % 3]), 1.2); }
    }
  } else if (kind === 'backbone') {
    if (v === 0) { // 数据中心球顶
      metal.geo(gfx.sph(0.4, 16, 10), x, 0.2, y, 1, 0.9, 1, 0, obs.clone().multiplyScalar(1.5)); E.box(x, 0.22, y, 0.8, 0.02, 0.8, new T.Color(led[0]), 1.2);
      B.box(x, 0.45, y, 0.18, 0.06, 0.18, obs.clone().multiplyScalar(0.7)); metal.cyl(x, 0.75, y, 0.01, 0.01, 0.5, 4, new T.Color('#cfe')); E.box(x, 1.02, y, 0.07, 0.07, 0.07, new T.Color(led[2]), 2.2);
    } else if (v === 1) { // 光纤机架
      for (var j = 0; j < 4; j++) { B.box(x - 0.3 + (j % 2) * 0.6, 0.3 + (j > 1 ? 0.25 : 0), y - 0.25 + (j > 1 ? 0.5 : 0), 0.26, 0.5 + (j > 1 ? 0.5 : 0), 0.26, obs.clone().multiplyScalar(1.2 * shade)); E.box(x - 0.3 + (j % 2) * 0.6, 0.55, y - 0.25 + (j > 1 ? 0.5 : 0) + 0.131, 0.18, 0.02, 0.01, new T.Color(led[j % 3]), 1.7); }
    } else if (v === 2) { // 天线塔
      metal.cyl(x, 0.9, y, 0.015, 0.05, 1.7, 5, new T.Color('#9db')); B.box(x, 0.3, y, 0.5, 0.45, 0.5, obs.clone().multiplyScalar(1.1)); E.box(x, 1.77, y, 0.08, 0.08, 0.08, new T.Color(led[1]), 2.4);
      for (var s = 0; s < 3; s++) E.box(x, 0.8 + s * 0.35, y, 0.28 - s * 0.07, 0.012, 0.012, new T.Color(led[0]), 1.4);
    } else { // 盘状天线
      B.box(x, 0.25, y, 0.7, 0.4, 0.7, obs.clone().multiplyScalar(1.05)); metal.geo(gfx.sph(0.3, 12, 6), x, 0.62, y, 1, 0.4, 1, 0, new T.Color('#ded4bb')); E.box(x, 0.7, y, 0.05, 0.12, 0.05, new T.Color(led[2]), 2);
    }
  } else { // enterprise
    if (v === 0 || v === 3) { // 服务器机柜
      for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) {
        var h2 = 0.55 + hash(x + a, y + b, 160) * 0.65; B.box(x - 0.23 + a * 0.46, h2 / 2 + 0.08, y - 0.23 + b * 0.46, 0.4, h2, 0.4, obs.clone().multiplyScalar(1.15 * shade));
        for (var rr = 0; rr < Math.floor(h2 / 0.18); rr++) E.box(x - 0.23 + a * 0.46, 0.18 + rr * 0.16, y - 0.23 + b * 0.46 + 0.202, 0.26, 0.018, 0.01, new T.Color(led[(rr + a + b) % 3]), hash(rr, a + b, 170) > 0.3 ? 1.6 : 0.4);
      }
    } else if (v === 1) { // 冷却塔 / UPS
      metal.cyl(x, 0.4, y, 0.32, 0.32, 0.65, 14, obs.clone().multiplyScalar(1.3)); E.box(x, 0.72, y, 0.5, 0.02, 0.5, new T.Color(led[0]), 1.3); metal.cyl(x, 0.78, y, 0.2, 0.2, 0.06, 12, new T.Color('#605a4e'));
      B.box(x + 0.3, 0.2, y - 0.3, 0.25, 0.24, 0.25, obs.clone().multiplyScalar(0.9));
    } else { // 存储阵列
      B.box(x, 0.3, y, 0.8, 0.45, 0.62, obs.clone().multiplyScalar(1.1 * shade)); for (var l = 0; l < 4; l++) E.box(x - 0.27 + l * 0.18, 0.3, y + 0.312, 0.12, 0.3, 0.01, new T.Color(led[l % 3]), hash(l, x, 180) > 0.4 ? 1.4 : 0.35);
    }
  }
};

// 公网流 / 气隙：着色器面片
TP.buildWater = function (list) {
  if (!list.length) return;
  var W = this.W, B = new gfx.MergeBuilder(), th = this.theme, g = this.game;
  list.forEach(function (i) { var x = i % W, y = (i / W) | 0; B.geo(gfx.plane(1, 1), x, 0.0, y, 1, 1, 1, 0, new T.Color('#fff')); });
  var geo = B.build();
  // 平面朝上
  var pos = geo.attributes.position, nor = geo.attributes.normal;
  for (var i = 0; i < pos.count; i++) { var py = pos.getY(i), pz = pos.getZ(i); /* PlaneGeometry 在 XY 平面，需转到 XZ */ }
  var m = new T.Mesh(this.flatGeo(list, 0.03), new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, col: { value: new T.Color(th.stream) } },
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'varying vec2 vW; uniform float uTime; uniform vec3 col;\nfloat h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }\nfloat n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }\nvoid main(){ vec2 p = vW; float t = uTime; float w = n(p*vec2(2.2,3.)+vec2(-t*0.9,0.)) * 0.6 + n(p*vec2(5.,6.)+vec2(-t*1.7, t*0.2))*0.4; float streak = smoothstep(0.78,1.0, n(vec2(p.x*0.7 - t*2.4, p.y*9.)) ) ; vec3 c = col*(0.35+0.9*w) + col*streak*2.2; float a = 0.78 + 0.2*w; gl_FragColor = vec4(c*0.9, a); }' }));
  this.uniforms.push(m.material.uniforms.uTime); this.root.add(m);
  // 堤岸发光边
  var E = new gfx.MergeBuilder(), set = {}; list.forEach(function (i) { set[i] = 1; });
  list.forEach(function (i) {
    var x = i % W, y = (i / W) | 0;
    for (var d = 0; d < 4; d++) { var nx = x + DX[d], ny = y + DY[d]; if (!g.inb(nx, ny) || set[ny * W + nx]) continue; if (DX[d]) E.box(x + DX[d] * 0.5, 0.03, y, 0.03, 0.03, 1, new T.Color(th.stream), 1.8); else E.box(x, 0.03, y + DY[d] * 0.5, 1, 0.03, 0.03, new T.Color(th.stream), 1.8); }
  });
  this.root.add(new T.Mesh(E.build(), new T.MeshBasicMaterial({ vertexColors: true })));
};
TP.flatGeo = function (list, y) {
  var W = this.W, pos = [], idx = [], n = 0;
  list.forEach(function (i) {
    var x = i % W, z = (i / W) | 0;
    pos.push(x - 0.5, y, z - 0.5, x + 0.5, y, z - 0.5, x + 0.5, y, z + 0.5, x - 0.5, y, z + 0.5); idx.push(n, n + 2, n + 1, n, n + 3, n + 2); n += 4;
  });
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
};
TP.buildGap = function (list) {
  if (!list.length) return;
  var th = this.theme;
  var m = new T.Mesh(this.flatGeo(list, -0.02), new T.ShaderMaterial({ transparent: false, uniforms: { uTime: { value: 0 }, col: { value: new T.Color('#b9a2f0') } },
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'varying vec2 vW; uniform float uTime; uniform vec3 col;\nfloat h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }\nfloat n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }\nvoid main(){ vec2 p = vW*3.; float t=uTime; float a = n(p+vec2(t*0.3,0.)) + n(p*2.3-vec2(0.,t*0.5))*0.5; float arc = smoothstep(0.03,0.0,abs(a-1.05+0.25*sin(t*3.+p.x)))+smoothstep(0.02,0.0,abs(a-0.62+0.2*sin(t*2.3+p.y))); float vig = 0.5+0.5*n(vW*0.8+t*0.1); vec3 c = vec3(0.02,0.015,0.05)*(0.6+vig) + col*arc*2.2*(0.4+0.6*step(0.55, n(vec2(t*4.,floor(p.x*2.))))); gl_FragColor = vec4(c,1.); }' }));
  this.uniforms.push(m.material.uniforms.uTime); this.root.add(m);
  // 气隙边缘警示线
  var g = this.game, W = this.W, E = new gfx.MergeBuilder(), set = {}; list.forEach(function (i) { set[i] = 1; });
  list.forEach(function (i) {
    var x = i % W, y = (i / W) | 0;
    for (var d = 0; d < 4; d++) { var nx = x + DX[d], ny = y + DY[d]; if (!g.inb(nx, ny) || set[ny * W + nx]) continue; if (DX[d]) E.box(x + DX[d] * 0.49, 0.04, y, 0.03, 0.04, 1, new T.Color('#c9b6f5'), 2); else E.box(x, 0.04, y + DY[d] * 0.49, 1, 0.04, 0.03, new T.Color('#c9b6f5'), 2); }
  });
  this.root.add(new T.Mesh(E.build(), new T.MeshBasicMaterial({ vertexColors: true })));
  // 漂浮碎片
  var inst = new T.InstancedMesh(new T.OctahedronGeometry(0.12, 0), new T.MeshBasicMaterial({ color: new T.Color('#c9b6f5').multiplyScalar(1.8) }), list.length * 2), mt = new T.Matrix4();
  this.shards = [];
  for (var s = 0; s < list.length * 2; s++) { var tile = list[s % list.length], sx = tile % W + (hash(s, 1, 190) - 0.5) * 0.8, sz = ((tile / W) | 0) + (hash(s, 2, 191) - 0.5) * 0.8; this.shards.push({ x: sx, z: sz, y: 0.2 + hash(s, 3, 192) * 0.9, ph: hash(s, 4, 193) * 6.28, sc: 0.5 + hash(s, 5, 194) }); }
  this.shardInst = inst; this.root.add(inst);
};

// ---------- 入口 / 出口 / 节点 ----------
TP.buildSpecials = function () {
  var g = this.game, th = this.theme, root = this.root, self = this;
  g.entrances.forEach(function (en) {
    var grp = new T.Group(); grp.position.set(en.x, 0, en.y); root.add(grp);
    var col = new T.Color(en.color), nx = g.nextStep(en.idx, g.field), dir = nx >= 0 ? Math.atan2(g.ty(nx) - en.y, g.tx(nx) - en.x) : Math.PI / 2;
    grp.rotation.y = -dir + Math.PI / 2;
    var pm = gfx.mat('#222d2a', { m: 0.7, r: 0.35 });
    gfx.mesh(gfx.box(0.12, 1.1, 0.14), pm, -0.46, 0.55, 0, grp); gfx.mesh(gfx.box(0.12, 1.1, 0.14), pm, 0.46, 0.55, 0, grp);
    gfx.mesh(gfx.box(1.04, 0.14, 0.16), pm, 0, 1.13, 0, grp);
    var glow = gfx.glow(en.color, 2.0);
    gfx.mesh(gfx.box(0.03, 0.9, 0.03), glow, -0.46, 0.55, 0.09, grp); gfx.mesh(gfx.box(0.03, 0.9, 0.03), glow, 0.46, 0.55, 0.09, grp); gfx.mesh(gfx.box(0.9, 0.03, 0.03), glow, 0, 1.13, 0.09, grp);
    var ring = gfx.mesh(gfx.tor(0.36, 0.035, 8, 32), gfx.glow(en.color, 2.4), 0, 0.55, 0, grp);
    var ring2 = gfx.mesh(gfx.tor(0.24, 0.025, 8, 28), gfx.glow(en.color, 1.8), 0, 0.55, 0, grp);
    var disc = gfx.mesh(gfx.plane(0.72, 0.72), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.7), transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, 0.55, 0, grp);
    var pad = gfx.mesh(gfx.ring(0.38, 0.5, 32), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, opacity: 0.8, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.115, 0, grp); pad.rotation.x = -Math.PI / 2;
    gfx.shadowize(grp, true, false);
    var lab = gfx.textSprite(en.id + ' · ' + en.name, { size: 46, color: '#fff', bg: 'rgba(13,24,22,0.78)', stroke: en.color, scale: 0.0075, depthTest: false }); lab.position.set(en.x, 1.85, en.y); lab.renderOrder = 10; root.add(lab);
    self.entObjs[en.id] = { grp: grp, ring: ring, ring2: ring2, pad: pad, label: lab };
    self.anim.push(function (t) { ring.rotation.z = t * 1.6; ring2.rotation.z = -t * 2.2; ring.rotation.x = Math.sin(t * 0.8) * 0.25; pad.material.opacity = 0.5 + 0.3 * Math.sin(t * 3 + en.x); disc.material.opacity = 0.15 + 0.1 * Math.sin(t * 4); });
  });
  Object.keys(g.exits).forEach(function (id) {
    var ex = g.exits[id], grp = new T.Group(); grp.position.set(ex.x, 0, ex.y); root.add(grp);
    var variant = g.map.theme === 'enterprise' ? 'db' : (g.map.theme === 'backbone' ? 'dome' : 'reactor');
    var colr = g.map.theme === 'backbone' ? (id === '1' ? '#6fb8d8' : '#f080a0') : (g.map.theme === 'airgap' ? (id === '1' ? '#ffb04a' : '#ff6a8a') : '#e8604f');
    var spin = [];
    var dark = gfx.mat('#1f2a28', { m: 0.8, r: 0.3 }), gl = gfx.glow(colr, 2.2);
    gfx.mesh(gfx.cyl(0.5, 0.56, 0.12, 8), dark, 0, 0.16, 0, grp);
    if (variant === 'db') {
      for (var i = 0; i < 3; i++) { gfx.mesh(gfx.cyl(0.36, 0.36, 0.2, 20), gfx.mat('#334642', { m: 0.7, r: 0.3 }), 0, 0.4 + i * 0.3, 0, grp); var rg = gfx.mesh(gfx.tor(0.37, 0.02, 6, 24), gl, 0, 0.5 + i * 0.3, 0, grp); rg.rotation.x = Math.PI / 2; }
      var core = gfx.mesh(gfx.oct(0.16), gfx.glow(colr, 2.8), 0, 1.5, 0, grp); spin.push(core);
    } else if (variant === 'dome') {
      var dm = gfx.mesh(gfx.sph(0.44, 20, 12), new T.MeshStandardMaterial({ color: new T.Color(colr), transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.3, emissive: new T.Color(colr), emissiveIntensity: 0.5, depthWrite: false }), 0, 0.3, 0, grp); dm.scale.y = 0.95;
      for (var k = 0; k < 4; k++) { var rk = gfx.mesh(gfx.box(0.16, 0.22 + k * 0.05, 0.16), gfx.mat('#2b3c38', { m: 0.7, r: 0.3 }), Math.cos(k * 1.57) * 0.2, 0.3, Math.sin(k * 1.57) * 0.2, grp); gfx.mesh(gfx.box(0.12, 0.02, 0.02), gl, rk.position.x, 0.4 + k * 0.03, rk.position.z + 0.085, grp); }
      var orb = gfx.mesh(gfx.ico(0.14, 1), gfx.glow(colr, 2.6), 0, 0.85, 0, grp); spin.push(orb);
      var halo = gfx.mesh(gfx.tor(0.55, 0.025, 6, 40), gl, 0, 0.75, 0, grp); halo.rotation.x = Math.PI / 2; spin.push(halo);
    } else {
      for (var s = 0; s < 6; s++) { var an = s / 6 * Math.PI * 2; gfx.mesh(gfx.box(0.14, 0.9 + (s % 2) * 0.2, 0.14), gfx.mat('#2d3c38', { m: 0.7, r: 0.3 }), Math.cos(an) * 0.4, 0.55, Math.sin(an) * 0.4, grp); gfx.mesh(gfx.box(0.04, 0.8, 0.04), gl, Math.cos(an) * 0.4, 0.55, Math.sin(an) * 0.4 + 0.0, grp); }
      var rc = gfx.mesh(gfx.ico(0.22, 1), gfx.glow(colr, 2.8), 0, 0.7, 0, grp); spin.push(rc);
      var r1 = gfx.mesh(gfx.tor(0.34, 0.025, 6, 32), gl, 0, 0.7, 0, grp); spin.push(r1);
    }
    gfx.shadowize(grp, true, false);
    var pad = gfx.mesh(gfx.ring(0.52, 0.7, 40), new T.MeshBasicMaterial({ color: new T.Color(colr).multiplyScalar(1.7), transparent: true, opacity: 0.7, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.125, 0, grp); pad.rotation.x = -Math.PI / 2;
    var lab = gfx.textSprite((g.map.theme === 'enterprise' ? '出口 · ' : id === '1' ? 'X · ' : 'Y · ') + ex.name, { size: 46, color: '#fff', bg: 'rgba(29,9,12,0.8)', stroke: colr, scale: 0.0075, depthTest: false }); lab.position.set(ex.x, 2.0, ex.y); lab.renderOrder = 10; root.add(lab);
    self.exitObjs[id] = { grp: grp, pad: pad, spin: spin, label: lab, flash: 0, color: colr };
    self.anim.push(function (t) { spin.forEach(function (s, i) { s.rotation.y = t * (0.8 + i * 0.4); if (s.geometry && s.geometry.type === 'TorusGeometry') s.rotation.x = Math.PI / 2 + Math.sin(t) * 0.2; }); pad.material.opacity = 0.45 + 0.3 * Math.sin(t * 2.4); });
  });
  g.nodes.forEach(function (i) { self.buildNode(i); });
};
TP.buildNode = function (i) {
  var g = this.game, x = g.tx(i), y = g.ty(i), th = this.theme, grp = new T.Group(); grp.position.set(x, 0.1, y); this.root.add(grp);
  var dark = gfx.mat('#1e2926', { m: 0.8, r: 0.3 });
  gfx.mesh(gfx.cyl(0.42, 0.46, 0.1, 8), dark, 0, 0.05, 0, grp);
  gfx.mesh(gfx.cyl(0.36, 0.36, 0.03, 8), gfx.mat('#364844', { m: 0.7, r: 0.3 }), 0, 0.115, 0, grp);
  var leds = [];
  for (var s = 0; s < 8; s++) { var a = s / 8 * Math.PI * 2 + Math.PI / 8; var l = gfx.mesh(gfx.box(0.06, 0.03, 0.06), new T.MeshBasicMaterial({ color: new T.Color('#6dffb0').multiplyScalar(2) }), Math.cos(a) * 0.4, 0.12, Math.sin(a) * 0.4, grp); leds.push(l); }
  var ringMat = new T.MeshBasicMaterial({ color: new T.Color('#6dffb0').multiplyScalar(2.2) });
  var ring = gfx.mesh(gfx.tor(0.27, 0.03, 8, 28), ringMat, 0, 0.2, 0, grp); ring.rotation.x = Math.PI / 2;
  var core = gfx.mesh(gfx.oct(0.1), ringMat, 0, 0.2, 0, grp);
  // 隔离屏障（隐藏）
  var domeMat = new T.MeshBasicMaterial({ color: new T.Color('#ff3d4f').multiplyScalar(1.5), transparent: true, opacity: 0.0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
  var dome = gfx.mesh(gfx.cyl(0.48, 0.48, 0.9, 8, 1), domeMat, 0, 0.45, 0); grp.add(dome);
  var barMat = new T.MeshBasicMaterial({ color: new T.Color('#ff3d4f').multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false });
  var bars = []; for (var b = 0; b < 8; b++) { var a2 = b / 8 * Math.PI * 2 + Math.PI / 8; bars.push(gfx.mesh(gfx.box(0.025, 0.9, 0.025), barMat, Math.cos(a2) * 0.47, 0.45, Math.sin(a2) * 0.47, grp)); }
  var cdRing = gfx.mesh(gfx.ring(0.5, 0.58, 40, 1), new T.MeshBasicMaterial({ color: new T.Color('#ffb02e').multiplyScalar(2), transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }), 0, 0.14, 0, grp); cdRing.rotation.x = -Math.PI / 2;
  var hi = gfx.mesh(gfx.ring(0.55, 0.66, 40), new T.MeshBasicMaterial({ color: new T.Color('#ffe3a0').multiplyScalar(2), transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.13, 0, grp); hi.rotation.x = -Math.PI / 2;
  gfx.shadowize(grp, true, true);
  var lab = gfx.textSprite('⬡', { size: 40, color: '#fff', scale: 0.006 }); lab.visible = false;
  var obj = { grp: grp, ring: ring, core: core, ringMat: ringMat, leds: leds, dome: dome, domeMat: domeMat, barMat: barMat, bars: bars, cdRing: cdRing, hi: hi, state: 'open', idx: i, st: 0 };
  this.nodeObjs[i] = obj;
};
TP.setNodeState = function (i, state, cdFrac) {
  var o = this.nodeObjs[i]; if (!o) return; o.state = state; o.cdFrac = cdFrac || 0;
};
TP.update = function (t, dt) {
  for (var i = 0; i < this.uniforms.length; i++) this.uniforms[i].value = t;
  for (var a = 0; a < this.anim.length; a++) this.anim[a](t);
  this.layers.forEach(function (l) { l.tex.offset.x += l.speed * dt * 60 * 0.05; l.tex.offset.y += l.speed * dt * 60 * 0.03; });
  var g = this.game, cd = G.NODE_CD;
  for (var id in this.nodeObjs) {
    var o = this.nodeObjs[id], iso = (g.blocked[id] & 1) > 0, cdv = g.nodeCd[id];
    var tgt = iso ? 1 : 0; o.st += (tgt - o.st) * Math.min(1, dt * 7);
    var col = iso ? 1 : (cdv > 0 ? 2 : 0);
    o.ring.rotation.z += dt * (iso ? 0.4 : 2.4); o.core.rotation.y += dt * 2; o.core.rotation.x += dt;
    var c = col === 1 ? '#ff3d4f' : (col === 2 ? '#ffb02e' : '#6dffb0');
    if (o.curCol !== c) { o.curCol = c; o.ringMat.color.set(c).multiplyScalar(2.2); o.leds.forEach(function (l) { l.material = new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(2) }); }); }
    o.domeMat.opacity = o.st * (0.07 + 0.04 * Math.sin(t * 5 + +id));
    o.barMat.opacity = o.st * 0.75;
    o.dome.scale.y = 0.3 + 0.7 * o.st; o.dome.position.y = 0.45 * (0.3 + 0.7 * o.st);
    o.ring.scale.setScalar(iso ? 0.75 : 1);
    o.cdRing.material.opacity = cdv > 0 ? 0.9 : 0;
    if (cdv > 0) { o.cdRing.rotation.z = t * 2; var frac = cdv / cd; o.cdRing.scale.setScalar(1 + frac * 0.25); }
    o.hi.material.opacity = (o.hl || 0) * (0.5 + 0.4 * Math.sin(t * 8));
  }
  var self = this;
  if (this.shardInst) {
    var m = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3(), e = new T.Euler();
    this.shards.forEach(function (sh, i) { e.set(t * 0.5 + sh.ph, t * 0.8, 0); q.setFromEuler(e); p.set(sh.x, sh.y + Math.sin(t * 1.2 + sh.ph) * 0.12, sh.z); s.setScalar(sh.sc); m.compose(p, q, s); self.shardInst.setMatrixAt(i, m); });
    this.shardInst.instanceMatrix.needsUpdate = true;
  }
  if (this.dust) this.dust.rotation.y = t * 0.01;
  this.pl.intensity = 15 + Math.sin(t * 1.3) * 3;
};
})(window.G = window.G || {});
