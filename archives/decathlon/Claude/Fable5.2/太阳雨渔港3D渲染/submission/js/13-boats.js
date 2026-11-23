/* boats: hulls, wheelhouses with full interiors, deck gear, mooring buoys, dynamic mooring lines */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, A = H.Atlas, U = H.U;
  var QY = L.QUAY_Y;
  var rnd = H.mulberry(9001);

  // ------------------------------------------------------------------ instrument screens (unlit, softly glowing)
  var screenMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: 'attribute vec3 color; varying vec2 vUv; varying float vT; void main(){ vUv = uv; vT = color.r; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec2 vUv; varying float vT; uniform float uTime;',
      'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
      'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
      'void main(){',
      '  vec2 uv = vUv; vec3 col; float t = uTime;',
      '  float pulse = 0.92 + 0.08 * sin(t * 2.3 + vT * 3.0);',
      '  if (vT < 0.25) {',                          // radar
      '    vec2 p = uv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);',
      '    col = vec3(0.02, 0.13, 0.10);',
      '    float ring = step(abs(fract(r * 3.0) - 0.5), 0.035) * step(r, 0.96);',
      '    col += vec3(0.05, 0.36, 0.22) * ring;',
      '    col += vec3(0.05, 0.3, 0.2) * (step(abs(p.x), 0.012) + step(abs(p.y), 0.012)) * step(r, 0.96) * 0.6;',
      '    float sw = mod(-t * 1.25, 6.2832); float da = mod(a - sw + 6.2832, 6.2832);',
      '    float trail = pow(1.0 - da / 6.2832, 5.0) * step(r, 0.96);',
      '    col += vec3(0.10, 0.75, 0.42) * trail * 0.8;',
      '    vec2 cell = floor(p * 7.0); float blip = step(0.80, h21(cell + 3.0)) * step(length(fract(p * 7.0) - 0.5), 0.26) * step(r, 0.9);',
      '    float land = step(0.62, vn(p * 2.3 + 4.0)) * step(0.35, r) * step(r, 0.94);',
      '    col += vec3(0.35, 1.0, 0.55) * (blip * 0.9 + land * 0.5) * (0.25 + trail * 1.6);',
      '    col = mix(vec3(0.03, 0.07, 0.07), col, step(r, 0.985));',
      '  } else if (vT < 0.75) {',                   // fish finder
      '    float x = uv.x * 3.0 - t * 0.22;',
      '    float bottom = 0.26 + 0.10 * vn(vec2(x * 1.3, 2.0)) + 0.03 * vn(vec2(x * 6.0, 7.0));',
      '    col = mix(vec3(0.03, 0.10, 0.36), vec3(0.04, 0.20, 0.52), uv.y);',
      '    float d = bottom - uv.y;',
      '    if (d > 0.0) col = d < 0.035 ? vec3(0.98, 0.30, 0.16) : (d < 0.085 ? vec3(0.98, 0.72, 0.18) : (d < 0.15 ? vec3(0.45, 0.85, 0.3) : vec3(0.10, 0.36, 0.5)));',
      '    float fish = step(0.83, vn(vec2(x * 5.0, uv.y * 13.0))) * step(bottom + 0.06, uv.y) * step(uv.y, 0.82);',
      '    col = mix(col, vec3(0.35, 0.95, 0.85), fish * 0.9);',
      '    float sch = step(0.74, vn(vec2(x * 2.2 + 9.0, uv.y * 5.0))) * step(0.45, uv.y) * step(uv.y, 0.72);',
      '    col = mix(col, vec3(0.98, 0.82, 0.25), sch * 0.55);',
      '    col = mix(col, vec3(0.75, 0.9, 1.0), step(0.93, uv.y) * 0.5 + step(abs(fract(uv.y * 5.0) - 0.5), 0.02) * step(uv.x, 0.06));',
      '    col = mix(col, vec3(1.0), step(0.975, uv.x) * step(abs(uv.y - (0.5 + 0.3 * sin(t * 0.7))), 0.03));',
      '  } else {',                                  // gps plotter
      '    col = vec3(0.72, 0.88, 0.92);',
      '    float land = step(0.56, vn(uv * 3.2 + 2.0)); col = mix(col, vec3(0.93, 0.88, 0.66), land);',
      '    float grid = step(abs(fract(uv.x * 5.0) - 0.5), 0.02) + step(abs(fract(uv.y * 5.0) - 0.5), 0.02); col = mix(col, vec3(0.5, 0.7, 0.78), grid * 0.4);',
      '    float tr = step(abs(uv.y - (0.35 + 0.2 * sin(uv.x * 5.0))), 0.012) * step(uv.x, 0.62); col = mix(col, vec3(0.9, 0.25, 0.2), tr);',
      '    col = mix(col, vec3(0.9, 0.2, 0.2), step(length(uv - vec2(0.62, 0.35 + 0.2 * sin(3.1))), 0.03 + 0.012 * sin(t * 4.0)));',
      '  }',
      '  float vg = smoothstep(0.0, 0.07, uv.x) * smoothstep(0.0, 0.07, uv.y) * smoothstep(0.0, 0.07, 1.0 - uv.x) * smoothstep(0.0, 0.07, 1.0 - uv.y);',
      '  gl_FragColor = vec4(col * pulse * (0.75 + 0.25 * vg), 1.0);',
      '}'
    ].join('\n')
  });
  H.M.screen = { mat: screenMat, layer: 0, cast: false, receive: false, order: 0 };
  function screenQuad(w, h, type) {
    var g = new THREE.PlaneGeometry(w, h);
    var c = new Float32Array(12); for (var i = 0; i < 4; i++) c[i * 3] = type;
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g._keepUV = true;
    return g;
  }

  // ------------------------------------------------------------------ prints
  function prints() {
    var txt = H.txt, fade = H.fadeCanvas;
    A.add('chart', 420, 320, function (c, w, h) {
      c.fillStyle = '#d6ecf2'; c.fillRect(0, 0, w, h);
      var r = H.mulberry(101), i;
      c.fillStyle = '#f0e6c0'; c.strokeStyle = '#9a8a62'; c.lineWidth = 2;        // land masses
      c.beginPath(); c.moveTo(0, 0); c.lineTo(190, 0);
      for (i = 0; i <= 10; i++) c.lineTo(190 - i * 19 + Math.sin(i * 1.7) * 14, 20 + i * 12 + Math.cos(i * 2.3) * 8);
      c.lineTo(0, 150); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(w, h); c.lineTo(w, 210); for (i = 0; i <= 8; i++) c.lineTo(w - 20 - i * 16 + Math.sin(i * 2.1) * 9, 215 + i * 13); c.lineTo(250, h); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(80,140,170,0.6)'; c.lineWidth = 1.3;                 // depth contours
      for (var k = 0; k < 4; k++) { c.beginPath(); for (i = 0; i <= 20; i++) { var x = i * 21, y = 110 + k * 34 + Math.sin(i * 0.6 + k) * 16 + i * 2; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
      for (i = 0; i < 26; i++) txt(c, '' + (4 + Math.floor(r() * 38)), 30 + r() * 360, 90 + r() * 210, 13, '#44788f', H.FONT_EN, 'center', 'normal');
      c.strokeStyle = '#b05a48'; c.lineWidth = 1.5; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(120, 100); c.lineTo(230, 190); c.lineTo(330, 170); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#6a5a8a'; c.lineWidth = 1.5; c.beginPath(); c.arc(330, 80, 38, 0, 7); c.stroke();    // compass rose
      for (i = 0; i < 16; i++) { var a = i / 16 * 6.283; c.beginPath(); c.moveTo(330 + Math.cos(a) * (i % 4 ? 30 : 12), 80 + Math.sin(a) * (i % 4 ? 30 : 12)); c.lineTo(330 + Math.cos(a) * 38, 80 + Math.sin(a) * 38); c.stroke(); }
      txt(c, 'N', 330, 34, 15, '#6a5a8a', H.FONT_EN);
      txt(c, '汐見港', 78, 74, 20, '#6a5a3c'); txt(c, '沖ノ島', 350, 286, 17, '#6a5a3c');
      c.strokeStyle = '#7f95a0'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
      fade(c, w, h, 0.8, 7, '#ffffff');
    });
    A.add('tide', 300, 400, function (c, w, h) {
      c.fillStyle = '#fbf9ee'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#4f93b0'; c.fillRect(0, 0, w, 56);
      txt(c, '潮汐表 7月', w / 2, 30, 32, '#ffffff');
      c.strokeStyle = '#a9bcc4'; c.lineWidth = 1.5;
      var i;
      for (i = 0; i < 8; i++) { c.beginPath(); c.moveTo(14, 96 + i * 24); c.lineTo(w - 14, 96 + i * 24); c.stroke(); }
      [60, 130, 215].forEach(function (x) { c.beginPath(); c.moveTo(x, 70); c.lineTo(x, 264); c.stroke(); });
      txt(c, '日', 36, 82, 15, '#55656d'); txt(c, '満潮', 95, 82, 15, '#55656d'); txt(c, '干潮', 172, 82, 15, '#55656d'); txt(c, '潮', 252, 82, 15, '#55656d');
      var r = H.mulberry(55), names = ['大潮', '中潮', '小潮', '長潮', '若潮', '中潮', '大潮'];
      for (i = 0; i < 7; i++) {
        var y = 108 + i * 24;
        txt(c, '' + (12 + i), 36, y, 15, i === 2 ? '#c9483a' : '#44525a', H.FONT_EN, 'center', 'normal');
        txt(c, (4 + Math.floor(r() * 3)) + ':' + (10 + Math.floor(r() * 49)), 95, y, 14, '#44525a', H.FONT_EN, 'center', 'normal');
        txt(c, (10 + Math.floor(r() * 3)) + ':' + (10 + Math.floor(r() * 49)), 172, y, 14, '#44525a', H.FONT_EN, 'center', 'normal');
        txt(c, names[i], 252, y, 14, '#4f7f95', H.FONT_JP, 'center', 'normal');
      }
      c.strokeStyle = '#4f93b0'; c.lineWidth = 3; c.beginPath();
      for (i = 0; i <= 60; i++) { var x = 16 + i * 4.5, yy = 330 + Math.sin(i * 0.33) * 34 * (0.7 + 0.3 * Math.sin(i * 0.05)); if (i === 0) c.moveTo(x, yy); else c.lineTo(x, yy); }
      c.stroke();
      c.strokeStyle = '#c9483a'; c.lineWidth = 2; c.beginPath(); c.arc(16 + 22 * 4.5, 330 + Math.sin(22 * 0.33) * 30, 9, 0, 7); c.stroke();
      c.strokeStyle = '#a9bcc4'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(14, 330); c.lineTo(w - 14, 330); c.stroke();
    });
    function photo(name, seed, bg1, bg2, fishCol, label) {
      A.add(name, 220, 170, function (c, w, h) {
        c.fillStyle = '#fbfaf4'; c.fillRect(0, 0, w, h);
        var g = c.createLinearGradient(0, 10, 0, 130); g.addColorStop(0, bg1); g.addColorStop(1, bg2);
        c.fillStyle = g; c.fillRect(10, 10, w - 20, 122);
        // the catch laid on a measuring board
        c.fillStyle = '#f2ead2'; c.fillRect(22, 92, w - 44, 26);
        c.strokeStyle = '#8a7a5c'; c.lineWidth = 1; for (var i = 0; i < 16; i++) { c.beginPath(); c.moveTo(26 + i * 11, 110); c.lineTo(26 + i * 11, i % 5 ? 116 : 120); c.stroke(); }
        c.fillStyle = fishCol; c.beginPath(); c.ellipse(104, 70, 58, 24, -0.05, 0, 7); c.fill();
        c.beginPath(); c.moveTo(156, 68); c.lineTo(192, 46); c.lineTo(184, 70); c.lineTo(194, 92); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(86, 48); c.lineTo(120, 34); c.lineTo(128, 50); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(100, 78, 44, 10, -0.05, 0, 7); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(62, 64, 6, 0, 7); c.fill(); c.fillStyle = '#22303a'; c.beginPath(); c.arc(62, 64, 3, 0, 7); c.fill();
        txt(c, label, w / 2, 151, 17, '#5a6066', H.FONT_HAND, 'center', 'normal');
        fade(c, w, h, 0.5, seed, '#ffffff');
      });
    }
    photo('photo1', 3, '#9fd3e2', '#6fb4c8', '#e8806a', '真鯛 62cm ！');
    photo('photo2', 4, '#c9e2e6', '#9fc4cc', '#7f9fb8', '鰤 81cm 7/2');
    photo('photo3', 5, '#b9dcc8', '#8fc0a8', '#c9c070', '平目 55cm');
    A.add('omamori', 96, 150, function (c, w, h) {
      c.fillStyle = '#c93f3a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f2d27a'; c.lineWidth = 5; c.strokeRect(7, 7, w - 14, h - 14);
      txt(c, '海', w / 2, 34, 28, '#f6dc8c', H.FONT_MIN); txt(c, '上', w / 2, 62, 28, '#f6dc8c', H.FONT_MIN);
      txt(c, '安', w / 2, 92, 28, '#f6dc8c', H.FONT_MIN); txt(c, '全', w / 2, 122, 28, '#f6dc8c', H.FONT_MIN);
    });
    A.add('omamori2', 96, 150, function (c, w, h) {
      c.fillStyle = '#3f6fa8'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f2d27a'; c.lineWidth = 5; c.strokeRect(7, 7, w - 14, h - 14);
      txt(c, '大', w / 2, 46, 40, '#f6dc8c', H.FONT_MIN); txt(c, '漁', w / 2, 104, 40, '#f6dc8c', H.FONT_MIN);
    });
    function nameplate(name, text, col, sub) {
      A.add(name, 512, 110, function (c, w, h) {
        c.fillStyle = '#f7f8f3'; c.fillRect(0, 0, w, h);
        txt(c, text, w / 2, h * 0.5, 78, col, H.FONT_JPB);
        fade(c, w, h, 0.9, text.length * 7, '#f7f8f3');
      });
      A.add(name + '_reg', 360, 80, function (c, w, h) {
        c.fillStyle = '#f7f8f3'; c.fillRect(0, 0, w, h);
        txt(c, sub, w / 2, h * 0.52, 50, '#3a454c', H.FONT_EN);
        fade(c, w, h, 0.9, text.length * 3, '#f7f8f3');
      });
    }
    nameplate('name_B', '第三汐丸', '#2b5873', 'KN3-41258');
    nameplate('name_A', '海音丸', '#b5503f', 'KN2-30716');
    nameplate('name_D', 'しおかぜ', '#2b5873', 'KN3-52904');
    nameplate('name_C', 'みなと', '#3a6f5f', 'KN3-18842');
    nameplate('name_F', '幸栄丸', '#2b5873', 'KN3-20455');
    ['3', '7', '12'].forEach(function (n) {
      A.add('buoy_' + n, 256, 128, function (c, w, h) {
        c.fillStyle = '#f08a2c'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#f6efe0'; c.fillRect(0, 0, w, 20); c.fillRect(0, h - 20, w, 20);
        txt(c, n, w / 2, h * 0.52, 84, '#fbf7ea', H.FONT_EN);
        fade(c, w, h, 3.0, 60 + n.length * 9 + n.charCodeAt(0), '#f4b070');
        var r = H.mulberry(n.charCodeAt(0)); c.fillStyle = '#b06a3c';
        for (var i = 0; i < 26; i++) { c.globalAlpha = 0.2 + r() * 0.25; c.fillRect(r() * w, r() * h, 3 + r() * 8, 6 + r() * 30); }
        c.globalAlpha = 1;
      });
    });
  }

  // ------------------------------------------------------------------ hull
  // local frame: +z bow, +x port, y = 0 at the waterline
  function hullShape(P) {
    var Lh = P.L, hbm = P.B / 2, fb = P.fb, dr = P.draft, N = 16;
    var S = {};
    S.shape = function (s) {
      var f = s <= 0.48 ? 1 : Math.pow(1 - Math.pow((s - 0.48) / 0.52, P.bowPow || 2.3), 0.72);
      var st = s < 0.22 ? (P.sternTaper || 0.88) + (1 - (P.sternTaper || 0.88)) * (s / 0.22) : 1;
      return f * st;
    };
    S.bowT = function (s) { return Math.pow(Math.max(0, (s - 0.5) / 0.5), 1.6); };
    S.sheerY = function (s) { return fb + (P.sheer || 0.7) * Math.pow(Math.max(0, (s - 0.3) / 0.7), 2.0); };
    S.pt = function (s, row) {    // row: 0 keel, 1 chine, 2 boot, 3 stripe, 4 sheer
      var bt = S.bowT(s), hb = hbm * S.shape(s), ys = S.sheerY(s);
      var z = (s - 0.5) * Lh;
      var yc = -0.10 + bt * (ys * 0.5 + 0.1), hc = hb * (0.84 - 0.2 * bt);
      var yk = -dr * (1 - bt * bt), rake = (P.rake || 0.55);
      var sheer = [hb, ys, z + rake * bt], chine = [hc, yc, z + rake * bt * 0.45];
      if (row === 0) return [0, yk, z];
      if (row === 1) return chine;
      if (row === 4) return sheer;
      var t = row === 2 ? H.clamp((0.13 - yc) / (ys - yc), 0.06, 0.6) : 1 - 0.17 / Math.max(0.3, ys - yc);
      return [chine[0] + (sheer[0] - chine[0]) * t, chine[1] + (sheer[1] - chine[1]) * t, chine[2] + (sheer[2] - chine[2]) * t];
    };
    S.N = N;
    return S;
  }
  function buildHull(b, P) {
    var S = hullShape(P), N = S.N, r, sgn;
    var bands = [[0, 1, P.bottom || C.bottom, 0, 0.1, 'solid'], [1, 2, P.bottom || C.bottom, 0, 0.1, 'solid'], [2, 3, P.paint || C.white, 2, 0.35, 'solidDS'], [3, 4, P.stripe || C.stripeBlue, 0, 0.35, 'solidDS']];
    [1, -1].forEach(function (sg) {
      bands.forEach(function (bd) {
        var g = G.surf(N, 1, function (u, v) {
          var s = sg > 0 ? u : 1 - u;
          var a = S.pt(s, bd[0]), c = S.pt(s, bd[1]);
          return [sg * (a[0] + (c[0] - a[0]) * v), a[1] + (c[1] - a[1]) * v, a[2] + (c[2] - a[2]) * v];
        }, bd[2]);
        b.add(G.fx(g, bd[3], bd[4]), bd[5]);
      });
    });
    // transom
    for (r = 1; r < 4; r++) {
      var a = S.pt(0, r), c = S.pt(0, r + 1);
      b.add(G.fx(G.quad([a[0], a[1], a[2]], [-a[0], a[1], a[2]], [-c[0], c[1], c[2]], [c[0], c[1], c[2]], r < 2 ? (P.bottom || C.bottom) : (r === 3 ? (P.stripe || C.stripeBlue) : (P.paint || C.white))), r === 2 ? 2 : 0, 0.3));
    }
    var k0 = S.pt(0, 0), c0 = S.pt(0, 1);
    b.add(G.tri([c0[0], c0[1], c0[2]], k0, [-c0[0], c0[1], c0[2]], P.bottom || C.bottom));
    // deck
    var dk = P.deckDrop || 0.3;
    S.deckY = function (s) { return S.sheerY(s) - dk; };
    S.deckHalf = function (s) { var a = S.pt(s, 3), c = S.pt(s, 4); var t = 1 - dk / Math.max(0.17, c[1] - a[1]) * 0; return Math.max(0.02, c[0] - 0.07); };
    var deck = G.surf(N, 2, function (u, v) {
      var s = Math.min(u, 0.985), hd = S.deckHalf(s), z = S.pt(s, 4)[2];
      return [hd * (1 - 2 * v), S.deckY(s), z - 0.02];
    }, P.deck || 0xcfe0dc);
    b.add(G.fx(deck, 0, 0.3));
    // gunwale cap + rubbing strake + stem band
    [1, -1].forEach(function (sg) {
      var gp = [], rp = [];
      for (var i = 0; i <= N; i++) { var s = i / N, p = S.pt(s, 4), q = S.pt(s, 3); gp.push([sg * p[0], p[1] + 0.02, p[2]]); rp.push([sg * (q[0] + 0.02), q[1], q[2]]); }
      b.add(G.fx(G.tube(gp, 0.045, P.cap || 0xe9ece6, 5, N * 2), 0, 0.4));
      b.add(G.tube(rp, 0.035, C.rubber, 4, N * 2));
    });
    var st0 = S.pt(1, 0), st1 = S.pt(1, 4);
    b.add(G.pipes([[0, st0[1] - 0.02, st0[2] + 0.0], [0, S.pt(1, 1)[1], S.pt(1, 1)[2] + 0.03], [0, st1[1] + 0.06, st1[2] + 0.04]], 0.05, P.cap || 0xe9ece6, 5));
    // keel + skeg
    b.add(G.boxMM(-0.05, -P.draft - 0.12, -P.L * 0.44, 0.05, -P.draft + 0.05, P.L * 0.1, P.bottom || C.bottom));
    // scuppers with rust tears on the topsides
    [1, -1].forEach(function (sg) {
      [0.2, 0.42, 0.62].forEach(function (s) {
        var p = S.pt(s, 3);
        var m = G.box(0.02, 0.05, 0.16, 0x4a565c).translate(sg * (p[0] + 0.012), p[1] - 0.1, p[2]);
        b.add(m, 'solidNC');

      });
    });
    return S;
  }

  // lifebuoy: orange / white quadrants
  function lifebuoy(R) {
    var ring = G.torus(R, R * 0.27, C.orange, 8, 24);
    G.paintFn(ring, function (x, y) { var a = Math.atan2(y, x) + Math.PI / 8; return (Math.floor((a + Math.PI * 2) / (Math.PI / 4)) % 2) ? C.orange : 0xf9faf5; });
    return G.fx(ring, 0, 0.5);
  }
  // tyre fender hanging on a rope (built around origin at the rope top)
  function fenderGeoms(b, drop, s) {
    b.add(G.rope([[0, 0, 0], [0, -drop * 0.5, 0.01], [0, -drop + 0.26 * s, 0]], 0.022, 0xdccba0, 8, 14));
    var t = G.torus(0.27 * s, 0.11 * s, C.tyre, 7, 16).rotateY(Math.PI / 2).translate(0, -drop, 0);
    G.paintFn(t, function (x) { return Math.abs(x) > 0.07 * s ? 0x2c3034 : 0x3d4349; });
    b.add(t);
  }

  // ------------------------------------------------------------------ wheelhouse with interior
  // built in cabin-local coords: centre at (0, floor, 0), +z = fore. o: {w,l,h, doorX, variant, seed}
  function cabin(b, o, boat) {
    var w = o.w, l = o.l, t = 0.05, sill = o.sill || 0.84, winH = o.winH || 0.78, top = sill + winH, h = top + 0.14;
    var wallC = o.wall || C.white, trimC = o.trim || 0xe2e8e4, hw = w / 2, hl = l / 2, i;
    var dw = 0.62, dx = o.doorX === undefined ? w * 0.2 : o.doorX;     // door on the aft wall, towards port
    var IN = 'solidNC';
    // floor
    b.add(G.boxB(w - 0.04, 0.03, l - 0.04, 0xb9cbc8), IN);
    b.add(G.box(w * 0.5, 0.012, l * 0.5, 0x6f8f8a).translate(0, 0.036, -0.1), IN);          // rubber mat
    // lower walls
    b.add(G.fx(G.boxMM(-hw, 0, hl - t, hw, sill, hl, wallC), 2, 0.3));
    b.add(G.fx(G.boxMM(-hw, 0, -hl, -hw + t, sill, hl, wallC), 2, 0.3));
    b.add(G.fx(G.boxMM(hw - t, 0, -hl, hw, sill, hl, wallC), 2, 0.3));
    b.add(G.fx(G.boxMM(-hw, 0, -hl, dx - dw / 2, top, -hl + t, wallC), 2, 0.3));              // aft wall, starboard part is solid to the top
    b.add(G.fx(G.boxMM(dx + dw / 2, 0, -hl, hw, sill, -hl + t, wallC), 2, 0.3));
    // window sill trim line
    var sc = o.stripe || C.stripeBlue;
    b.add(G.boxMM(-hw - 0.012, sill - 0.05, hl, hw + 0.012, sill, hl + 0.012, sc), IN);
    b.add(G.boxMM(-hw - 0.012, sill - 0.05, -hl, -hw, sill, hl, sc), IN);
    b.add(G.boxMM(hw, sill - 0.05, -hl, hw + 0.012, sill, hl, sc), IN);
    b.add(G.boxMM(-hw - 0.012, sill - 0.05, -hl - 0.012, dx - dw / 2 - 0.05, sill, -hl, sc), IN);
    // posts (corner + mullions)
    var ps = 0.065;
    [[-hw, -hl], [hw - ps, -hl], [-hw, hl - ps], [hw - ps, hl - ps]].forEach(function (p) { b.add(G.boxMM(p[0], sill, p[1], p[0] + ps, top, p[1] + ps, trimC)); });
    var fm = o.frontMullions || [0];
    fm.forEach(function (x) { b.add(G.boxMM(x - 0.025, sill, hl - t, x + 0.025, top, hl, trimC)); });
    [-1, 1].forEach(function (s) { b.add(G.boxMM(s * hw - (s > 0 ? t : 0), sill, -0.03, s * hw + (s > 0 ? 0 : t), top, 0.03, trimC)); });
    b.add(G.boxMM(dx + dw / 2, sill, -hl, dx + dw / 2 + 0.05, top, -hl + t, trimC));
    b.add(G.boxMM(dx - dw / 2 - 0.05, 0, -hl - 0.01, dx - dw / 2, top, -hl + t, trimC));
    // head band + roof with a little visor
    b.add(G.fx(G.boxMM(-hw, top, -hl, hw, h, hl, wallC), 2, 0.3));
    b.add(G.boxMM(-hw + t, top - 0.01, -hl + t, hw - t, top + 0.02, hl - t, 0xf3f5ee), IN);           // ceiling
    b.add(G.fx(G.boxMM(-hw - 0.12, h, -hl - 0.14, hw + 0.12, h + 0.06, hl + 0.3, o.roof || 0xf2f4ee), 0, 0.4));
    b.add(G.boxMM(-hw - 0.13, h + 0.06, -hl - 0.15, hw + 0.13, h + 0.085, hl + 0.31, o.stripe || C.stripeBlue));
    // glass
    var gt = 0xd8f2f2, xs = [-hw + ps].concat(fm).concat([hw - ps]);
    for (i = 0; i < xs.length - 1; i++) b.add(G.plane(xs[i + 1] - xs[i] - 0.03, winH, gt).translate((xs[i] + xs[i + 1]) / 2, sill + winH / 2, hl - t / 2), 'glass');
    [-1, 1].forEach(function (s) {
      [[-hl + ps, -0.03], [0.03, hl - ps]].forEach(function (zz) {
        b.add(G.plane(zz[1] - zz[0], winH, gt).rotateY(Math.PI / 2).translate(s * (hw - t / 2), sill + winH / 2, (zz[0] + zz[1]) / 2), 'glass');
      });
    });
    b.add(G.plane(hw - (dx + dw / 2) - 0.1, winH, gt).translate((hw + dx + dw / 2) / 2, sill + winH / 2, -hl + t / 2), 'glass');
    // open door leaf swung outwards, with its own window
    b.group(dx - dw / 2, 0, -hl, 0, 1.95, 0, 1, function (d) {
      d.add(G.fx(G.boxMM(0, 0.03, -0.02, dw, sill, 0.02, wallC), 2, 0.3));
      d.add(G.boxMM(0, sill, -0.02, 0.05, top - 0.02, 0.02, trimC)); d.add(G.boxMM(dw - 0.05, sill, -0.02, dw, top - 0.02, 0.02, trimC));
      d.add(G.boxMM(0, top - 0.06, -0.02, dw, top - 0.02, 0.02, trimC));
      d.add(G.plane(dw - 0.1, winH - 0.08, gt).translate(dw / 2, sill + winH / 2 - 0.02, 0), 'glass');
      d.add(G.fx(G.box(0.03, 0.03, 0.12, C.chrome).translate(dw - 0.08, sill - 0.12, 0), 0, 0.8));
    });
    // wipers + nav lights + grab rails on the roof edge
    [-0.3, 0.3].forEach(function (x) {
      b.add(G.box(0.012, 0.3, 0.012, 0x2f3338).rotateZ(0.5).translate(x * w, sill + 0.17, hl + 0.012), IN);
    });
    b.add(G.box(0.07, 0.09, 0.1, 0xd9503f).translate(hw + 0.035, top - 0.06, hl * 0.4));
    b.add(G.box(0.07, 0.09, 0.1, 0x4fa283).translate(-hw - 0.035, top - 0.06, hl * 0.4));
    [-1, 1].forEach(function (s) {
      b.add(G.fx(G.tube([[s * (hw + 0.04), h + 0.07, -hl * 0.7], [s * (hw + 0.04), h + 0.17, -hl * 0.6], [s * (hw + 0.04), h + 0.17, hl * 0.6], [s * (hw + 0.04), h + 0.07, hl * 0.7]], 0.016, C.chrome, 4, 14, false, 0.1), 0, 0.8));
    });

    // ---------------- interior
    var dz = hl - t - 0.21;                              // console centre line
    b.add(G.fx(G.boxMM(-hw + t, sill - 0.3, hl - t - 0.44, hw - t, sill - 0.04, hl - t, 0xe6ebe6), 0, 0.2), IN);
    b.add(G.boxMM(-hw + t, 0.03, hl - t - 0.3, hw - t, sill - 0.3, hl - t, 0xb7cbd0), IN);
    // instrument panel on the helm side of the console: gauges, switches, locker
    (function () {
      var pz = hl - t - 0.445, py = sill - 0.17, wx = w * 0.24;
      b.add(G.box(w - 0.16, 0.2, 0.012, 0x44525a).translate(0, py, pz), IN);
      for (var k = 0; k < 4; k++) {
        var gx = wx - 0.58 - k * 0.15;
        b.add(G.cyl(0.05, 0.05, 0.014, 12, 0xf3f1e6).rotateX(Math.PI / 2).translate(gx, py + 0.02, pz - 0.008), IN);
        b.add(G.torus(0.05, 0.008, C.chrome, 4, 12).translate(gx, py + 0.02, pz - 0.014), IN);
        b.add(G.box(0.006, 0.04, 0.004, 0xd9503f).translate(0, 0.016, 0).rotateZ(0.9 - k * 0.6).translate(gx, py + 0.02, pz - 0.018), IN);
      }
      for (k = 0; k < 6; k++) {
        b.add(G.box(0.022, 0.035, 0.018, k % 3 === 0 ? 0xd9503f : 0xdfe6e8).translate(-0.02 + k * 0.045, py - 0.03, pz - 0.012), IN);
        b.add(G.box(0.014, 0.014, 0.01, k % 2 ? 0x7fe08a : 0xffd27a).translate(-0.02 + k * 0.045, py + 0.05, pz - 0.01), 'glowFlat');
      }
      // locker doors below, with louvres
      [-0.5, 0.0].forEach(function (ox) {
        var lx = ox * w * 0.55 - 0.02;
        b.add(G.box(w * 0.26, 0.36, 0.012, 0xcbd9dc).translate(lx, 0.33, hl - t - 0.306), IN);
        for (var q = 0; q < 4; q++) b.add(G.box(w * 0.2, 0.014, 0.014, 0x8fa5ab).translate(lx, 0.24 + q * 0.055, hl - t - 0.314), IN);
        b.add(G.sph(0.015, C.brass, 6, 4).translate(lx + w * 0.1, 0.46, hl - t - 0.318), IN);
      });
      b.add(G.fx(G.box(w - 0.14, 0.03, 0.03, 0x9a6f48).translate(0, sill - 0.045, pz - 0.005), 8, 0.3), IN);
    })();
    b.add(G.boxMM(-hw + t, sill - 0.04, hl - t - 0.44, hw - t, sill - 0.02, hl - t, 0x6f8189), IN);   // dark dash top
    var dashY = sill - 0.02;
    // steering wheel (port of centre)
    var wx = w * 0.24;
    b.group(wx, sill - 0.02 + 0.06, hl - t - 0.5, -0.35, 0, 0, 1, function (d) {
      d.add(G.fx(G.torus(0.19, 0.022, 0x9a6f48, 6, 22), 8, 0.4), IN);
      for (var k = 0; k < 6; k++) { var a = k / 6 * 6.283; d.add(G.fx(G.pipe([0, 0, 0], [Math.cos(a) * 0.235, Math.sin(a) * 0.235, 0], 0.012, 0x9a6f48, 4), 8, 0), IN); }
      d.add(G.fx(G.cyl(0.04, 0.04, 0.05, 8, C.brass).rotateX(Math.PI / 2), 0, 0.9), IN);
      d.add(G.pipe([0, 0, 0], [0, 0, 0.2], 0.02, 0x8f9da1, 5), IN);
    });
    // throttle + compass
    b.add(G.box(0.1, 0.04, 0.14, 0x55626a).translate(wx - 0.36, dashY + 0.02, dz - 0.06), IN);
    b.add(G.pipe([wx - 0.36, dashY + 0.03, dz - 0.06], [wx - 0.36, dashY + 0.2, dz - 0.0], 0.012, C.chrome, 4), IN);
    b.add(G.sph(0.028, C.red, 6, 5).translate(wx - 0.36, dashY + 0.21, dz), IN);
    b.add(G.fx(G.sph(0.075, 0x2f3a40, 10, 6).scale(1, 0.8, 1).translate(wx, dashY + 0.045, dz + 0.1), 0, 0.8), IN);
    b.add(G.cylB(0.085, 0.09, 0.03, 10, C.brass).translate(wx, dashY, dz + 0.1), IN);
    // radar + fish finder monitors (softly glowing)
    function monitor(x, type, sz, tilt) {
      b.group(x, dashY + sz * 0.5 + 0.03, dz + 0.04, tilt, Math.PI, 0, 1, function (d) {
        d.add(G.fx(G.box(sz * 1.22, sz * 1.05, 0.14, 0x3a454c).translate(0, 0, -0.05), 0, 0.3), IN);
        d.add(screenQuad(sz, sz * 0.82, type).translate(0, 0.005, 0.022), 'screen');
        d.add(G.box(sz * 1.22, 0.035, 0.16, 0x2f3a40).translate(0, -sz * 0.53, -0.05), IN);
        for (var k = 0; k < 4; k++) d.add(G.cyl(0.012, 0.012, 0.012, 6, k === 0 ? 0xff6a5a : 0xcfd6d9).rotateX(Math.PI / 2).translate(-sz * 0.4 + k * 0.05, -sz * 0.47, 0.022), IN);
        d.add(G.pipe([0, -sz * 0.5, -0.06], [0, -sz * 0.62, -0.06], 0.02, 0x55626a, 5), IN);
      });
    }
    monitor(-w * 0.26, 0, 0.27, 0.18);       // radar
    monitor(-w * 0.26 + 0.36, 0.5, 0.25, 0.18);   // fish finder
    if (w > 1.6) monitor(-w * 0.26 + 0.36 + 0.3, 1, 0.17, 0.3);
    // faint glow cast by the screens on the dash
    b.add(G.box(0.62, 0.006, 0.16, 0x9fe6c0).translate(-w * 0.26 + 0.18, dashY + 0.004, dz - 0.12), 'glowFlat');
    // VHF radio with coiled mic lead, under the head band
    b.add(G.box(0.22, 0.08, 0.14, 0x2f3a40).translate(-hw + 0.2, top - 0.07, hl - 0.2), IN);
    b.add(G.box(0.05, 0.08, 0.035, 0x2f3a40).translate(-hw + 0.36, top - 0.2, hl - 0.25), IN);
    var cord = []; for (i = 0; i <= 14; i++) cord.push([-hw + 0.3 + i * 0.004 + Math.sin(i * 1.9) * 0.012, top - 0.1 - i * 0.008 - Math.sin(i / 14 * 3.14) * 0.05, hl - 0.25 + Math.cos(i * 1.9) * 0.012]);
    b.add(G.tube(cord, 0.005, 0x2f3338, 3, 28), IN);
    // chart on a clipboard, propped on the dash at the starboard end
    b.group(-hw + 0.32, dashY + 0.15, dz - 0.1, -0.42, Math.PI - 0.5, 0, 1, function (d) {
      d.add(G.fx(G.box(0.4, 0.31, 0.012, 0xb08a62), 8, 0), IN);
      d.add(A.quad('chart', 0.37, 0.28).translate(0, -0.005, 0.008), 'atlas');
      d.add(G.fx(G.box(0.12, 0.035, 0.025, C.chrome).translate(0, 0.145, 0.012), 0, 0.9), IN);
    });
    // tide table on a second clipboard, hung on the aft wall
    var ax = -hw + (hw + dx - dw / 2) * 0.42;
    b.group(ax, sill + 0.42, -hl + t + 0.012, 0, 0, 0.04, 1, function (d) {
      d.add(G.fx(G.box(0.3, 0.4, 0.012, 0xb08a62), 8, 0), IN);
      d.add(A.quad('tide', 0.27, 0.36).translate(0, -0.012, 0.008), 'atlas');
      d.add(G.fx(G.box(0.1, 0.03, 0.025, C.chrome).translate(0, 0.19, 0.012), 0, 0.9), IN);
      d.add(G.pipe([0, 0.21, 0.005], [0, 0.26, 0.0], 0.006, 0x55626a, 3), IN);
    });
    // yellow raincoat on a hook, beside the tide table
    (function () {
      var rx = -hw + 0.24, ry = sill + 0.62, rz = -hl + t + 0.09, ph = (o.seed || 1) * 1.7;
      b.add(G.pipe([rx, ry + 0.06, -hl + t], [rx, ry + 0.05, rz - 0.01], 0.012, C.chrome, 4), IN);
      var coat = G.surf(6, 8, function (u, v) {
        var a = (u - 0.5) * 2.0, wd = 0.2 + v * 0.07 + (v < 0.12 ? -0.07 * (1 - v / 0.12) : 0);
        return [rx + Math.sin(a) * wd, ry - v * 0.95, rz + 0.02 + Math.cos(a) * 0.09 - 0.03 + Math.sin(u * 9 + v * 4) * 0.012];
      }, C.yellow);
      G.paintFn(coat, function (x, y) { return (ry - y) > 0.86 ? 0xd9a82c : (Math.sin(x * 40) > 0.93 ? 0xe2b83a : C.yellow); });
      G.fx(coat, 7, 0.45); G.sway(coat, function (x, y) { return H.clamp((ry - y) * 1.2, 0, 1); }, ph);
      b.add(coat, 'solidDS');
      // hood + sleeve
      var hood = G.sph(0.11, C.yellow, 8, 6).scale(1, 1.15, 0.7).translate(rx, ry + 0.02, rz + 0.03);
      G.fx(hood, 7, 0.45); G.sway(hood, 0.05, ph); b.add(hood, IN);
      var sl = G.cyl(0.05, 0.065, 0.6, 7, 0xeec338).rotateZ(0.12).translate(rx + 0.22, ry - 0.42, rz + 0.04);
      G.fx(sl, 7, 0.45); G.sway(sl, function (x, y) { return H.clamp((ry - y) * 1.2, 0, 1); }, ph); b.add(sl, IN);
    })();
    // thermos + enamel mug on the dash, port corner
    b.group(hw - 0.2, dashY, dz - 0.03, 0, 0, 0, 1, function (d) {
      d.add(G.fx(G.lathe([[0, 0], [0.05, 0], [0.052, 0.19], [0.045, 0.21], [0.045, 0.25], [0.03, 0.27], [0, 0.27]], 12, 0x3f8f9a), 0, 0.85), IN);
      d.add(G.fx(G.cylB(0.047, 0.05, 0.055, 12, 0xe9ece6).translate(0, 0.2, 0), 0, 0.7), IN);
      d.add(G.box(0.012, 0.11, 0.03, 0x2f3a40).translate(0.058, 0.11, 0), IN);
      // enamel mug: white with a blue rim
      d.add(G.fx(G.lathe([[0, 0], [0.036, 0], [0.04, 0.075], [0.034, 0.075], [0.03, 0.008], [0, 0.008]], 12, 0xf9faf5).translate(-0.13, 0, 0.06), 0, 0.8), 'solidDS');
      d.add(G.torus(0.039, 0.005, 0x3f6fa8, 4, 14).rotateX(Math.PI / 2).translate(-0.13, 0.076, 0.06), IN);
      d.add(G.torus(0.022, 0.006, 0xf9faf5, 4, 10, Math.PI).rotateZ(-Math.PI / 2).translate(-0.17, 0.04, 0.06), IN);
      d.add(G.cylB(0.032, 0.032, 0.004, 10, 0x8a5f3c).translate(-0.13, 0.058, 0.06), IN);     // tea
    });
    // charm hanging by the port window + catch photos taped beside it
    b.group(hw - t - 0.012, top - 0.03, hl * 0.52, 0, 0, 0, 1, function (d) {
      d.add(G.pipe([0, 0, 0], [0, -0.13, 0], 0.004, 0xf2e6c8, 3), IN);
      var body = A.quad(o.variant % 2 ? 'omamori2' : 'omamori', 0.075, 0.115).rotateY(-Math.PI / 2).translate(-0.004, -0.2, 0);
      G.sway(body, 0.6, o.seed || 0); b._swayAtlas = true;
      d.add(body, 'atlasSway');
      d.add(G.sph(0.012, 0xf2d27a, 5, 4).translate(0, -0.135, 0), IN);
    });
    b.add(A.quad('photo' + (1 + o.variant % 3), 0.2, 0.155).rotateY(-Math.PI / 2).rotateX(0.07).translate(hw - t - 0.006, sill + 0.14, hl * 0.2), 'atlas');
    b.add(A.quad('photo' + (1 + (o.variant + 1) % 3), 0.18, 0.14).rotateY(-Math.PI / 2).rotateX(-0.1).translate(hw - t - 0.006, sill + 0.34, hl * 0.14), 'atlas');
    b.add(A.quad('photo' + (1 + (o.variant + 2) % 3), 0.17, 0.13).rotateZ(0.08).translate(hw - 0.34, sill + winH - 0.1, hl - t - 0.006).rotateY(0), 'atlas');
    [[sill + 0.21, hl * 0.2], [sill + 0.4, hl * 0.14]].forEach(function (p) { b.add(G.box(0.004, 0.02, 0.05, 0xf2e6a8).translate(hw - t - 0.008, p[0], p[1]), IN); });
    // helm stool, small fan, towel
    b.add(G.cylB(0.16, 0.16, 0.05, 12, 0x3f6f8f).translate(wx, 0.56, hl - 0.95), IN);
    b.add(G.cylB(0.03, 0.03, 0.54, 6, C.chrome).translate(wx, 0.03, hl - 0.95), IN);
    b.add(G.cylB(0.14, 0.16, 0.03, 10, 0x8f9da1).translate(wx, 0.03, hl - 0.95), IN);
    b.add(G.cyl(0.07, 0.07, 0.03, 10, 0xdfe6e8).rotateX(Math.PI / 2).translate(-hw + 0.5, top - 0.1, hl - 0.16), IN);
    b.add(G.fx(G.sway(G.box(0.16, 0.26, 0.012, 0xf2b6a0).translate(hw - t - 0.02, sill - 0.2, -hl * 0.4), 0.3, 4), 7, 0), IN);
    b.add(G.cylB(0.05, 0.05, 0.3, 8, C.red).translate(-hw + 0.14, 0.03, -hl + 0.2), IN);     // extinguisher
    // ceiling lamp
    b.add(G.cylB(0.07, 0.05, 0.03, 10, 0xfff6d6).translate(0, top - 0.04, -0.1), 'glowFlat');
    return { w: w, l: l, h: h, sill: sill, top: top };
  }

  // ------------------------------------------------------------------ deck gear helpers
  function radome(b, x, y, z) {
    b.add(G.pipe([x, y, z], [x, y + 0.34, z], 0.03, 0xdfe6e8, 6));
    b.add(G.box(0.34, 0.03, 0.34, 0xdfe6e8).translate(x, y + 0.34, z));
    b.add(G.fx(G.lathe([[0, 0], [0.3, 0], [0.31, 0.05], [0.28, 0.13], [0.16, 0.17], [0, 0.18]], 16, 0xf9faf5).translate(x, y + 0.355, z), 0, 0.6));
    b.add(G.cylB(0.305, 0.305, 0.02, 16, 0x9fb6c0).translate(x, y + 0.395, z));
  }
  function antenna(b, x, y, z, hgt, lean) {
    b.add(G.cylB(0.02, 0.025, 0.12, 6, 0x55626a).translate(x, y, z));
    b.add(G.pipe([x, y + 0.1, z], [x + (lean || 0), y + hgt, z - 0.05], 0.008, 0xf2f4ee, 4, 0.004));
  }
  function mast(b, x, y, z, hgt, o) {
    o = o || {};
    b.add(G.cylB(0.03, 0.045, hgt, 7, 0xe9ece6).translate(x, y, z));
    b.add(G.box(0.9, 0.035, 0.035, 0xe9ece6).translate(x, y + hgt * 0.72, z));
    b.add(G.sph(0.045, 0xfff4cf, 8, 6).translate(x, y + hgt + 0.03, z), 'glowFlat');
    b.add(G.cylB(0.05, 0.05, 0.03, 8, 0x55626a).translate(x, y + hgt - 0.02, z));
    [-0.42, 0.42].forEach(function (ox) { b.add(G.pipe([x + ox, y + hgt * 0.72, z], [x, y + hgt * 0.3, z], 0.008, 0x8f9da1, 3)); });
    // stays
    if (o.stayZ) { b.add(G.pipe([x, y + hgt * 0.95, z], [x, o.stayY || 0.9, z + o.stayZ], 0.006, 0x8f9da1, 3)); }
    // little pennant that streams in the wind
    if (o.flag) {
      var f = new THREE.PlaneGeometry(0.42, 0.24, 6, 2);
      f.translate(0.21, 0, 0);
      G.paintFn(f, function (px, py) { return py > 0.04 ? o.flag : (py < -0.04 ? 0xf9faf5 : o.flag2 || 0xf9faf5); });
      G.fx(f, 6, 0); G.sway(f, function (px) { return px / 0.42; }, o.ph || 0);
      f.rotateY(o.flagRy || 0);
      b.add(f.translate(x, y + hgt * 0.86, z), 'solidDS');
      b.add(G.pipe([x, y + hgt * 0.72, z], [x, y + hgt * 0.98, z], 0.004, 0x8f9da1, 3));
    }
  }
  function cleat(b, x, y, z, ry) {
    b.group(x, y, z, 0, ry || 0, 0, 1, function (d) {
      d.add(G.cylB(0.03, 0.035, 0.07, 6, C.chrome).translate(0, 0, -0.06)); d.add(G.cylB(0.03, 0.035, 0.07, 6, C.chrome).translate(0, 0, 0.06));
      d.add(G.fx(G.cyl(0.022, 0.022, 0.3, 6, C.chrome).rotateX(Math.PI / 2).translate(0, 0.08, 0), 0, 0.8));
    });
  }
  function outboard(b, x, y, z, s, hex) {
    b.group(x, y, z, 0, 0, 0, s, function (d) {
      d.add(G.fx(G.rbox(0.3, 0.36, 0.5, 0.08, hex || 0x34454f, 0.03).translate(0, 0.38, -0.12), 0, 0.6));
      d.add(G.box(0.31, 0.04, 0.5, 0xdfe6e8).translate(0, 0.27, -0.12));
      d.add(G.boxB(0.13, 0.75, 0.2, 0x55626a).translate(0, -0.55, -0.14));
      d.add(G.box(0.05, 0.3, 0.34, 0x55626a).translate(0, -0.6, -0.2));
      d.add(G.cyl(0.05, 0.03, 0.2, 8, 0x55626a).rotateX(Math.PI / 2).translate(0, -0.58, -0.36));
      for (var k = 0; k < 3; k++) d.add(G.box(0.02, 0.2, 0.08, C.brass).rotateZ(k * 2.094).translate(0, -0.58, -0.42), 'solidDS');
      d.add(G.box(0.2, 0.3, 0.1, 0x8f9da1).translate(0, 0.05, 0.06));
      d.add(G.pipe([0, 0.3, 0.08], [0, 0.34, 0.6], 0.02, 0x2f3338, 5));
    });
  }
  function hatch(b, x, y, z, w, l, hex) {
    b.add(G.fx(G.boxB(w, 0.1, l, hex || 0xe9ece6).translate(x, y, z), 0, 0.3));
    b.add(G.boxB(w + 0.05, 0.03, l + 0.05, 0xb9cbc8).translate(x, y, z));
    b.add(G.torus(0.04, 0.008, C.chrome, 4, 8).rotateX(Math.PI / 2).translate(x, y + 0.105, z + l * 0.3));
  }
  function bowRail(b, S, s0, s1, hgt, n) {
    var pp = [], sg;
    [1, -1].forEach(function (sg) {
      var top = [];
      for (var i = 0; i <= n; i++) {
        var s = s0 + (s1 - s0) * i / n, p = S.pt(s, 4);
        top.push([sg * (p[0] - 0.06), p[1] + hgt, p[2] - 0.03]);
        b.add(G.pipe([sg * (p[0] - 0.05), p[1], p[2] - 0.03], [sg * (p[0] - 0.06), p[1] + hgt, p[2] - 0.03], 0.012, C.chrome, 4));
      }
      b.add(G.fx(G.tube(top, 0.016, C.chrome, 5, n * 3), 0, 0.9));
    });
    var a = S.pt(s1, 4);
    b.add(G.fx(G.tube([[a[0] - 0.06, a[1] + hgt, a[2] - 0.03], [0, a[1] + hgt + 0.02, a[2] + 0.22], [-a[0] + 0.06, a[1] + hgt, a[2] - 0.03]], 0.016, C.chrome, 5, 10), 0, 0.9));
  }
  function shadeFrame(b, x0, x1, z0, z1, y0, hgt, canvasHex) {
    var c = 0xcfd6d9;
    [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) { b.add(G.fx(G.pipe([p[0], y0, p[1]], [p[0], y0 + hgt, p[1]], 0.022, c, 5), 3, 0)); });
    b.add(G.fx(G.pipes([[x0, y0 + hgt, z0], [x1, y0 + hgt, z0], [x1, y0 + hgt, z1], [x0, y0 + hgt, z1], [x0, y0 + hgt, z0]], 0.022, c, 5), 3, 0));
    b.add(G.fx(G.pipe([x0, y0 + hgt, (z0 + z1) / 2], [x1, y0 + hgt, (z0 + z1) / 2], 0.018, c, 4), 3, 0));
    b.add(G.fx(G.pipe([(x0 + x1) / 2, y0 + hgt, z0], [(x0 + x1) / 2, y0 + hgt, z1], 0.018, c, 4), 3, 0));
    if (canvasHex) {
      var cv = G.surf(6, 6, function (u, v) {
        return [x0 + 0.02 + u * (x1 - x0 - 0.04), y0 + hgt + 0.03 - Math.sin(u * 3.14) * Math.sin(v * 3.14) * 0.06, z0 - 0.05 + v * (z1 - z0 + 0.1)];
      }, canvasHex);
      b.add(G.fx(cv, 0, 0.2), 'solidDS');
    }
  }

  // ------------------------------------------------------------------ boat definitions
  var DEFS = {
    // B : white fishing boat with wheelhouse (the one that puts to sea)
    F: function (b, o) {
      var P = { L: 8.8, B: 2.55, fb: 0.72, draft: 0.55, sheer: 0.8, bottom: 0x2f7f8f, stripe: o.stripe || C.stripeBlue };
      var S = buildHull(b, P), dY = S.deckY(0.3);
      var cz = -2.15, cab;
      b.group(0, dY, cz, 0, 0, 0, 1, function (d) { cab = cabin(d, { w: 1.72, l: 2.0, variant: o.variant || 0, seed: 1, frontMullions: [0], stripe: P.stripe }, o); });
      var rY = dY + cab.h + 0.085;
      radome(b, 0.35, rY, cz + 0.25); antenna(b, -0.6, rY, cz - 0.6, 2.3, -0.1); antenna(b, 0.65, rY, cz - 0.7, 1.7, 0.08);
      mast(b, -0.25, rY, cz - 0.2, 1.7, { flag: 0xd9503f, flag2: 0xf9faf5, ph: 1, flagRy: -0.927 - o.ry });
      b.add(G.fx(G.cylB(0.09, 0.07, 0.12, 10, C.chrome).rotateX(-0.2).translate(0.5, rY + 0.02, cz + 0.85), 0, 0.9));       // searchlight
      b.add(G.cyl(0.085, 0.085, 0.02, 10, 0xfff4cf).rotateX(Math.PI / 2 - 0.2).translate(0.5, rY + 0.1, cz + 0.93), 'glowFlat');
      b.add(G.fx(G.cone(0.05, 0.16, 8, C.red).rotateX(Math.PI / 2).translate(-0.5, rY + 0.06, cz + 0.8), 0, 0.5));          // horn
      // sunshade iron frame over the working deck forward of the wheelhouse
      shadeFrame(b, -0.98, 0.98, -0.95, 1.5, dY, 1.75, 0xdbeef0);
      // lifebuoy on the wheelhouse side, name on the bows, number on the cabin
      b.add(lifebuoy(0.24).rotateY(Math.PI / 2).translate(-0.9, dY + 0.52, cz - 0.2));
      b.add(lifebuoy(0.24).rotateY(Math.PI / 2).translate(0.9, dY + 0.52, cz - 0.55));
      [1, -1].forEach(function (sg) {
        var p = S.pt(0.8, 3), q = S.pt(0.86, 3);
        var ang = Math.atan2(q[0] - p[0], q[2] - p[2]);
        b.add(A.quad(o.name || 'name_B', 1.25, 0.27).rotateY(sg > 0 ? Math.PI / 2 + ang : -Math.PI / 2 - ang).translate(sg * (S.pt(0.8, 3)[0] + 0.035 - 0.12), S.pt(0.8, 3)[1] - 0.32, S.pt(0.8, 3)[2]), 'atlas');
        b.add(A.quad((o.name || 'name_B') + '_reg', 0.8, 0.18).rotateY(sg * Math.PI / 2).translate(sg * 0.868, dY + 0.34, cz + 0.25), 'atlas');
      });
      // fish hold hatches, line hauler, crates, buckets, coiled rope
      hatch(b, 0, dY, 0.2, 1.1, 0.9); hatch(b, 0, dY, 1.35, 1.0, 0.8, 0xdfe7e4); hatch(b, 0, S.deckY(0.72), 2.6, 0.7, 0.6);
      b.group(0.95, S.sheerY(0.56) + 0.03, 0.6, 0, 0, 0, 1, function (d) {      // roller davit on the gunwale
        d.add(G.fx(G.pipe([0, 0, 0], [0.1, 0.5, 0], 0.03, 0x8f9da1, 5), 3, 0));
        d.add(G.fx(G.cyl(0.11, 0.11, 0.1, 12, 0x3f6f8f).rotateX(Math.PI / 2).translate(0.16, 0.52, 0), 0, 0.5));
        d.add(G.cyl(0.05, 0.05, 0.14, 8, 0x8f9da1).rotateX(Math.PI / 2).translate(0.16, 0.52, 0));
      });
      b.group(-0.55, dY, 0.9, 0, 0.3, 0, 1, function (d) { H.kit.crateStack(d, 2); });
      b.group(0.5, dY, 2.0, 0, -0.2, 0, 1, function (d) { H.kit.fishBox(d, { open: true }); });
      b.group(0.6, dY, 2.5, 0, 0.4, 0, 1, function (d) { H.kit.fishBox(d, {}); });
      b.group(-0.6, dY, -0.5, 0, 0, 0, 1, function (d) { H.kit.bucket(d, 0x3f9ad6); });
      for (var q = 0; q < 3; q++) b.add(G.torus(0.24 - q * 0.015, 0.035, C.rope, 5, 16).rotateX(Math.PI / 2).translate(-0.3, S.deckY(0.8) + 0.04 + q * 0.07, 3.1));
      // anchor on the bow roller + samson post
      b.add(G.fx(G.cylB(0.06, 0.07, 0.42, 8, 0xe9ece6).translate(0, S.deckY(0.9), 3.55), 0, 0.4));
      b.add(G.fx(G.cyl(0.03, 0.03, 0.34, 6, C.chrome).rotateZ(Math.PI / 2).translate(0, S.deckY(0.9) + 0.3, 3.55), 0, 0.8));
      b.add(G.fx(G.box(0.07, 0.07, 0.55, 0x6f6a62).rotateX(0.35).translate(0.22, S.sheerY(0.95) + 0.02, 3.85), 3, 0));
      b.add(G.fx(G.tube([[-0.02, S.sheerY(0.95) + 0.1, 4.05], [0.22, S.sheerY(0.95) + 0.17, 4.12], [0.46, S.sheerY(0.95) + 0.1, 4.05]], 0.03, 0x6f6a62, 4, 8), 3, 0));
      bowRail(b, S, 0.74, 0.97, 0.42, 4);
      cleat(b, 0.85, S.sheerY(0.12) + 0.03, S.pt(0.12, 4)[2], 0); cleat(b, -0.85, S.sheerY(0.12) + 0.03, S.pt(0.12, 4)[2], 0);
      cleat(b, 0.55, S.sheerY(0.86) + 0.03, S.pt(0.86, 4)[2], 0.4); cleat(b, -0.55, S.sheerY(0.86) + 0.03, S.pt(0.86, 4)[2], -0.4);
      // stern: rudder post, small net roller, engine vents
      b.add(G.fx(G.cyl(0.07, 0.07, 1.5, 10, 0xb9c6ca).rotateZ(Math.PI / 2).translate(0, S.sheerY(0.02) + 0.22, -4.2), 3, 0));
      [-0.7, 0.7].forEach(function (x) { b.add(G.fx(G.pipe([x, S.deckY(0.03), -4.2], [x, S.sheerY(0.02) + 0.22, -4.2], 0.03, 0x8f9da1, 5), 3, 0)); });
      b.add(G.box(0.4, 0.3, 0.3, 0xe9ece6).translate(-0.5, dY + 0.15, -3.5));
      for (q = 0; q < 4; q++) b.add(G.box(0.3, 0.02, 0.02, 0x8f9da1).translate(-0.5, dY + 0.07 + q * 0.06, -3.34), 'solidNC');
      return { S: S, P: P, deckY: dY, cabin: { z: cz, y: dY, w: 1.72, l: 2.0, h: cab.h }, roofY: rY,
        cleats: { bow: [0.55, S.sheerY(0.86) + 0.1, S.pt(0.86, 4)[2]], stern: [0.85, S.sheerY(0.12) + 0.1, S.pt(0.12, 4)[2]], bowS: [-0.55, S.sheerY(0.86) + 0.1, S.pt(0.86, 4)[2]], sternS: [-0.85, S.sheerY(0.12) + 0.1, S.pt(0.12, 4)[2]] },
        perches: [[0.0, rY + 0.35, cz - 0.95], [-0.86, rY + 0.19, cz + 0.3], [0.3, dY + 1.78, 1.5], [0.02, S.sheerY(0.97) + 0.46, S.pt(0.97, 4)[2] + 0.2]],
        fenders: [0.25, 0.48, 0.68], drips: [[0.98, dY + 1.74, 1.5], [-1.0, rY - 0.02, cz + 1.25], [0.9, rY - 0.02, cz - 1.1]] };
    },
    // A : game-fishing boat (cabin forward, open cockpit with outboards and a canvas shade frame)
    G: function (b, o) {
      var P = { L: 8.3, B: 2.7, fb: 0.78, draft: 0.5, sheer: 0.62, bottom: 0x34587a, stripe: 0xd9503f, paint: 0xf9faf5, bowPow: 2.0, sternTaper: 0.95 };
      var S = buildHull(b, P), dY = S.deckY(0.3);
      // raised foredeck / cuddy
      var cz = 0.75, cab;
      b.add(G.fx(G.boxMM(-1.0, dY, cz + 1.2, 1.0, dY + 0.5, cz + 2.3, 0xf9faf5), 2, 0.3));
      b.add(G.fx(G.boxMM(-0.75, dY + 0.5, cz + 1.2, 0.75, dY + 0.56, cz + 2.2, 0xe9ece6), 0, 0.3));
      hatch(b, 0, dY + 0.56, cz + 1.75, 0.6, 0.5, 0xbfe0e6);
      b.group(0, dY, cz, 0, 0, 0, 1, function (d) { cab = cabin(d, { w: 1.9, l: 2.3, variant: o.variant || 1, seed: 2, frontMullions: [-0.32, 0.32], stripe: P.stripe, winH: 0.82 }, o); });
      var rY = dY + cab.h + 0.085;
      radome(b, 0, rY, cz + 0.45); antenna(b, -0.7, rY, cz - 0.7, 2.6, -0.12); antenna(b, 0.7, rY, cz - 0.7, 2.6, 0.12);
      // rod rack ("rocket launchers") along the aft roof edge
      for (var q = 0; q < 6; q++) {
        var rx = -0.75 + q * 0.3;
        b.add(G.fx(G.cylB(0.028, 0.028, 0.26, 6, C.chrome).rotateX(-0.25).translate(rx, rY, cz - 1.05), 0, 0.9));
        if (q === 1 || q === 4) b.add(G.pipe([rx, rY + 0.1, cz - 1.08], [rx + (q === 1 ? -0.15 : 0.12), rY + 2.3, cz - 1.9], 0.008, 0x2f3338, 4, 0.003));
      }
      b.add(G.fx(G.box(1.7, 0.03, 0.05, C.chrome).translate(0, rY + 0.12, cz - 1.07), 0, 0.9));
      mast(b, 0, rY, cz - 0.3, 1.25, { flag: 0x3f8fb6, flag2: 0xf4cb3c, ph: 3, flagRy: -0.927 - o.ry });
      // canvas shade on an iron frame over the cockpit
      shadeFrame(b, -1.05, 1.05, -3.2, cz - 1.2, dY, 1.9, 0xf2f6f2);
      // cockpit: bench with cushions, bait tank, rod holders, cool boxes
      b.add(G.fx(G.boxMM(-1.0, dY, -3.6, 1.0, dY + 0.4, -3.2, 0xf9faf5), 0, 0.3));
      b.add(G.fx(G.boxMM(-0.95, dY + 0.4, -3.58, 0.95, dY + 0.47, -3.22, 0x3f8fb6), 0, 0.3));
      b.add(G.fx(G.cylB(0.28, 0.28, 0.5, 14, 0xbfe0e6).translate(0.55, dY, -2.3), 0, 0.5));
      b.add(G.cylB(0.3, 0.3, 0.03, 14, 0xf9faf5).translate(0.55, dY + 0.5, -2.3));
      b.group(-0.6, dY, -2.2, 0, 0.2, 0, 1, function (d) {
        d.add(G.fx(G.boxB(0.62, 0.36, 0.38, 0xf9faf5), 0, 0.4)); d.add(G.fx(G.boxB(0.64, 0.07, 0.4, 0x3f8fb6).translate(0, 0.36, 0), 0, 0.4));
        d.add(G.tube([[-0.2, 0.43, 0], [-0.15, 0.52, 0], [0.15, 0.52, 0], [0.2, 0.43, 0]], 0.012, 0xf9faf5, 4, 8));
      });
      [-1, 1].forEach(function (sg) {
        [-2.9, -1.9].forEach(function (z) {
          var p = S.pt(0.5 + z / P.L, 4);
          b.add(G.fx(G.cylB(0.03, 0.03, 0.24, 6, C.chrome).rotateZ(sg * -0.3).translate(sg * (p[0] - 0.08), p[1], z), 0, 0.9));
        });
        b.add(G.pipe([sg * 1.02, S.sheerY(0.15), -2.9], [sg * 1.6, S.sheerY(0.15) + 2.2, -3.6], 0.008, 0x2f3338, 4, 0.003));
      });
      outboard(b, -0.42, S.sheerY(0) - 0.05, -P.L / 2 - 0.05, 1.05, 0x34454f); outboard(b, 0.42, S.sheerY(0) - 0.05, -P.L / 2 - 0.05, 1.05, 0x34454f);
      b.add(lifebuoy(0.24).rotateY(Math.PI / 2).translate(-0.99, dY + 0.5, cz - 0.3));
      b.add(lifebuoy(0.24).rotateY(Math.PI / 2).translate(0.99, dY + 0.5, cz - 0.6));
      [1, -1].forEach(function (sg) {
        var p = S.pt(0.78, 3);
        b.add(A.quad(o.name || 'name_A', 1.05, 0.23).rotateY(sg > 0 ? Math.PI / 2 + 0.3 : -Math.PI / 2 - 0.3).translate(sg * (p[0] - 0.09), p[1] - 0.3, p[2]), 'atlas');
        b.add(A.quad((o.name || 'name_A') + '_reg', 0.8, 0.18).rotateY(sg * Math.PI / 2).translate(sg * 0.958, dY + 0.34, cz + 0.1), 'atlas');
      });
      bowRail(b, S, 0.68, 0.97, 0.5, 5);
      cleat(b, 0.9, S.sheerY(0.1) + 0.03, S.pt(0.1, 4)[2]); cleat(b, -0.9, S.sheerY(0.1) + 0.03, S.pt(0.1, 4)[2]);
      cleat(b, 0.5, S.sheerY(0.88) + 0.03, S.pt(0.88, 4)[2], 0.4); cleat(b, -0.5, S.sheerY(0.88) + 0.03, S.pt(0.88, 4)[2], -0.4);
      b.add(G.fx(G.box(0.07, 0.07, 0.5, 0xb9c6ca).rotateX(0.3).translate(0, S.sheerY(0.96) + 0.04, 3.75), 0, 0.8));
      return { S: S, P: P, deckY: dY, cabin: { z: cz, y: dY, w: 1.9, l: 2.3, h: cab.h }, roofY: rY,
        cleats: { bow: [0.5, S.sheerY(0.88) + 0.1, S.pt(0.88, 4)[2]], stern: [0.9, S.sheerY(0.1) + 0.1, S.pt(0.1, 4)[2]], bowS: [-0.5, S.sheerY(0.88) + 0.1, S.pt(0.88, 4)[2]], sternS: [-0.9, S.sheerY(0.1) + 0.1, S.pt(0.1, 4)[2]] },
        perches: [[0.5, rY + 0.02, cz + 0.9], [-0.9, dY + 1.93, -2.2], [0.0, S.sheerY(0.97) + 0.54, S.pt(0.97, 4)[2] + 0.2]],
        fenders: [0.22, 0.5, 0.7], drips: [[1.06, dY + 1.88, -2.2], [-1.06, dY + 1.88, -3.0], [1.05, rY - 0.02, cz + 1.3]] };
    },
    // D : small white fishing boat with a little wheelhouse aft
    S: function (b, o) {
      var P = { L: 6.9, B: 2.1, fb: 0.6, draft: 0.45, sheer: 0.72, bottom: o.bottom || 0xb85a48, stripe: o.stripe || 0x4fa283, rake: 0.5 };
      var S = buildHull(b, P), dY = S.deckY(0.3);
      var cz = -1.7, cab;
      b.group(0, dY, cz, 0, 0, 0, 1, function (d) { cab = cabin(d, { w: 1.34, l: 1.5, variant: o.variant === undefined ? 2 : o.variant, seed: 3, frontMullions: [0], stripe: P.stripe, sill: 0.8, winH: 0.74 }, o); });
      var rY = dY + cab.h + 0.085;
      antenna(b, 0.5, rY, cz - 0.5, 1.9, 0.06);
      mast(b, 0, rY, cz + 0.1, 1.2, { flag: 0xf4cb3c, flag2: 0xd9503f, ph: 5, flagRy: -0.927 - (o.ry || 0) });
      radome(b, -0.3, rY, cz - 0.3);
      // light iron frame with a tarp forward (drying / shade)
      shadeFrame(b, -0.8, 0.8, -0.75, 0.9, dY, 1.5, o.tarp === false ? null : 0xe9f1ea);
      hatch(b, 0, dY, 0.1, 0.9, 0.8); hatch(b, 0, S.deckY(0.72), 1.6, 0.6, 0.55, 0xdfe7e4);
      b.group(0.5, dY, 1.0, 0, 0.3, 0, 1, function (d) { H.kit.crate(d); });
      b.group(-0.45, dY, 1.15, 0, -0.2, 0, 1, function (d) { H.kit.fishBox(d, { open: true }); });
      // heap of net with floats in the bow
      b.add(G.sph(0.4, 0x4fa08f, 8, 6).scale(1.2, 0.5, 1.3).translate(0, S.deckY(0.85) + 0.1, 2.3));
      for (var q = 0; q < 6; q++) b.add(G.fx(G.sph(0.075, q % 2 ? 0xf08a2c : 0xf4cb3c, 7, 5).translate(Math.cos(q * 1.2) * 0.32, S.deckY(0.85) + 0.24 + (q % 2) * 0.06, 2.3 + Math.sin(q * 1.2) * 0.4), 0, 0.5));
      b.add(lifebuoy(0.21).rotateY(Math.PI / 2).translate(-0.71, dY + 0.48, cz));
      b.add(lifebuoy(0.21).rotateY(Math.PI / 2).translate(0.71, dY + 0.48, cz - 0.3));
      [1, -1].forEach(function (sg) {
        var p = S.pt(0.78, 3);
        b.add(A.quad(o.name || 'name_D', 1.0, 0.215).rotateY(sg > 0 ? Math.PI / 2 + 0.3 : -Math.PI / 2 - 0.3).translate(sg * (p[0] - 0.08), p[1] - 0.26, p[2]), 'atlas');
        b.add(A.quad((o.name || 'name_D') + '_reg', 0.66, 0.15).rotateY(sg * Math.PI / 2).translate(sg * 0.678, dY + 0.34, cz + 0.2), 'atlas');
      });
      outboard(b, 0, S.sheerY(0) - 0.05, -P.L / 2 - 0.05, 0.95, 0xe9ece6);
      cleat(b, 0.7, S.sheerY(0.12) + 0.03, S.pt(0.12, 4)[2]); cleat(b, -0.7, S.sheerY(0.12) + 0.03, S.pt(0.12, 4)[2]);
      cleat(b, 0.42, S.sheerY(0.86) + 0.03, S.pt(0.86, 4)[2], 0.4); cleat(b, -0.42, S.sheerY(0.86) + 0.03, S.pt(0.86, 4)[2], -0.4);
      b.add(G.fx(G.cylB(0.05, 0.06, 0.36, 8, 0xe9ece6).translate(0, S.deckY(0.92), 2.95), 0, 0.4));
      return { S: S, P: P, deckY: dY, cabin: { z: cz, y: dY, w: 1.34, l: 1.5, h: cab.h }, roofY: rY,
        cleats: { bow: [0.42, S.sheerY(0.86) + 0.1, S.pt(0.86, 4)[2]], stern: [0.7, S.sheerY(0.12) + 0.1, S.pt(0.12, 4)[2]], bowS: [-0.42, S.sheerY(0.86) + 0.1, S.pt(0.86, 4)[2]], sternS: [-0.7, S.sheerY(0.12) + 0.1, S.pt(0.12, 4)[2]] },
        perches: [[0.3, rY + 0.02, cz + 0.4], [0.0, dY + 1.53, 0.9]],
        fenders: [0.3, 0.6], drips: [[0.8, dY + 1.48, 0.9], [-0.78, rY - 0.02, cz + 0.9]] };
    },
    // C : open white skiff with an outboard
    O: function (b, o) {
      var P = { L: 5.0, B: 1.62, fb: 0.46, draft: 0.3, sheer: 0.5, bottom: 0x2f7f8f, stripe: 0x3a6f5f, deckDrop: 0.3, rake: 0.4 };
      var S = buildHull(b, P), dY = S.deckY(0.3);
      // thwarts
      [-1.2, 0.1, 1.2].forEach(function (z, k) {
        var p = S.pt(0.5 + z / P.L, 4);
        b.add(G.fx(G.box(p[0] * 2 - 0.12, 0.05, 0.3, k === 1 ? 0xc9ae84 : 0xe9ece6).translate(0, S.sheerY(0.5 + z / P.L) - 0.1, z), 8, 0.2));
      });
      outboard(b, 0, S.sheerY(0) - 0.02, -P.L / 2 - 0.03, 0.85, 0x3f6f8f);
      b.add(G.fx(G.cylB(0.13, 0.13, 0.3, 10, C.red).translate(0.3, dY, -1.75), 0, 0.5));       // fuel tank
      b.add(G.cylB(0.04, 0.04, 0.04, 6, 0x2f3338).translate(0.3, dY + 0.3, -1.75));
      b.group(-0.3, dY, 0.7, 0, 0.5, 0, 1, function (d) { H.kit.bucket(d, 0xf4cb3c); });
      b.group(0.25, dY, 0.65, 0, 0.1, 0, 1, function (d) { H.kit.fishBox(d, { lid: false }); });
      // oars laid along the thwarts
      [-0.38, 0.4].forEach(function (x) {
        b.add(G.fx(G.pipe([x, S.sheerY(0.3) - 0.05, -1.6], [x * 0.8, S.sheerY(0.7) - 0.03, 1.5], 0.022, 0xc9ae84, 5), 8, 0));
        b.add(G.fx(G.box(0.12, 0.02, 0.5, 0xc9ae84).translate(x * 0.78, S.sheerY(0.74) - 0.02, 1.75), 8, 0));
      });
      // small anchor + rope coil in the bow, a net bag
      for (var q = 0; q < 3; q++) b.add(G.torus(0.17 - q * 0.012, 0.025, 0xdccba0, 5, 14).rotateX(Math.PI / 2).translate(0, S.deckY(0.85) + 0.03 + q * 0.05, 1.75));
      b.add(G.sph(0.22, 0x4f93b0, 8, 6).scale(1.2, 0.5, 1).translate(-0.15, dY + 0.08, -0.6));
      [1, -1].forEach(function (sg) {
        var p = S.pt(0.74, 3);
        b.add(A.quad(o.name || 'name_C', 0.72, 0.155).rotateY(sg > 0 ? Math.PI / 2 + 0.32 : -Math.PI / 2 - 0.32).translate(sg * (p[0] - 0.05), p[1] - 0.17, p[2]), 'atlas');
      });
      cleat(b, 0, S.sheerY(0.95) + 0.0, S.pt(0.93, 4)[2], Math.PI / 2);
      return { S: S, P: P, deckY: dY, cabin: null, roofY: 0,
        cleats: { bow: [0.2, S.sheerY(0.9) + 0.06, S.pt(0.9, 4)[2]], stern: [0.6, S.sheerY(0.1) + 0.06, S.pt(0.1, 4)[2]], bowS: [-0.2, S.sheerY(0.9) + 0.06, S.pt(0.9, 4)[2]], sternS: [-0.6, S.sheerY(0.1) + 0.06, S.pt(0.1, 4)[2]] },
        perches: [[0.0, S.sheerY(0.98) + 0.1, S.pt(0.98, 4)[2]], [0.0, S.sheerY(0.5) - 0.06, 0.1]],
        fenders: [0.35, 0.65], drips: [] };
    }
  };

  // ------------------------------------------------------------------ dynamic rope
  function DynRope(parent, color, wetColor, radius) {
    this.n = 14; this.rad = 6; this.r = radius || 0.038;
    var nv = (this.n + 1) * this.rad;
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3); this.col = new Float32Array(nv * 3);
    var idx = [], i, j;
    for (i = 0; i < this.n; i++) for (j = 0; j < this.rad; j++) {
      var a = i * this.rad + j, b = i * this.rad + (j + 1) % this.rad, c = a + this.rad, d = b + this.rad;
      idx.push(a, c, b, b, c, d);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, H.M.solid.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.c0 = new THREE.Color(color); this.c1 = new THREE.Color(wetColor);
    parent.add(this.mesh);
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.len = 1; this.sagNow = 0;
  }
  var _t = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3(), _p = new THREE.Vector3(), _pp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  // a: cleat on the boat, b: bollard, e (optional): the point where the line bears on the quay edge.
  // The span boat -> edge hangs in a catenary whose sag follows the slack; edge -> bollard lies on the quay.
  function ropePoint(a, b, e, sag, n, n1, i, out) {
    var t;
    if (i <= n1) { t = i / n1; out.lerpVectors(a, e || b, t); out.y -= sag * 4 * t * (1 - t); }
    else { t = (i - n1) / (n - n1); out.lerpVectors(e, b, t); out.y += Math.sin(t * Math.PI) * 0.015; }
    return out;
  }
  DynRope.prototype.update = function (a, b, restLen, e) {
    var endA = e || b;
    var d = a.distanceTo(endA), slack = Math.max(0.0, restLen - d);
    var sag = Math.sqrt(0.375 * d * slack);
    this.sagNow = sag; this.tension = slack < 0.02 ? 1 : 0;
    var n = this.n, n1 = e ? 10 : n, rad = this.rad, i, j, P = this.pos, N = this.nor, Cc = this.col;
    for (i = 0; i <= n; i++) {
      var t = i / n;
      ropePoint(a, b, e, sag, n, n1, i, _p);
      ropePoint(a, b, e, sag, n, n1, Math.min(n, i + 1), _t);
      ropePoint(a, b, e, sag, n, n1, Math.max(0, i - 1), _pp);
      _t.sub(_pp).normalize();
      _n.crossVectors(_t, _up); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0); _n.normalize();
      _bn.crossVectors(_n, _t).normalize();
      var wet = _p.y < 0.12 ? 1 : 0;
      for (j = 0; j < rad; j++) {
        var ang = j / rad * Math.PI * 2 + t * 22.0, rr = this.r * (j % 2 ? 0.78 : 1.0);
        var cx = Math.cos(ang), sy = Math.sin(ang), k = (i * rad + j) * 3;
        var nx = cx * _n.x + sy * _bn.x, ny = cx * _n.y + sy * _bn.y, nz = cx * _n.z + sy * _bn.z;
        P[k] = _p.x + nx * rr; P[k + 1] = _p.y + ny * rr; P[k + 2] = _p.z + nz * rr;
        N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
        var cc = wet ? this.c1 : this.c0, sh = j % 2 ? 0.86 : 1.0;
        Cc[k] = cc.r * sh; Cc[k + 1] = cc.g * sh; Cc[k + 2] = cc.b * sh;
      }
    }
    var g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.attributes.color.needsUpdate = true;
  };
  H.DynRope = DynRope;

  // ------------------------------------------------------------------ build all boats
  function makeBoat(scene, type, o) {
    var grp = new THREE.Group(); grp.name = 'boat_' + o.id;
    var inner = new THREE.Group(); grp.add(inner);        // inner takes roll / pitch / heave
    var b = new H.Builder();
    var info = DEFS[type](b, o);
    // tyre fenders on the quay side
    var side = o.quaySide;   // +1 port (+x), -1 starboard
    var fb = new H.Builder();
    info.fenders.forEach(function (s, k) {
      var p = info.S.pt(s, 4);
      fb.group(side * (p[0] + 0.13), p[1] + 0.02, p[2], 0, 0, 0, 1, function (d) { fenderGeoms(d, 0.52 + (k % 2) * 0.06, 1.0); });
    });
    var meshes = b.build(inner, { name: 'boat' + o.id });
    var fg = new THREE.Group(); inner.add(fg); fb.build(fg, { name: 'fender' + o.id });
    scene.add(grp);
    var boat = { id: o.id, type: type, group: grp, inner: inner, info: info, fenders: fg, side: side, meshes: meshes,
      berth: { x: o.x, z: o.z, ry: o.ry }, x: o.x, z: o.z, ry: o.ry, roll: 0, pitch: 0, heave: 0, wakeKick: 0, wakeVel: 0,
      ph: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], w: [0.55 + rnd() * 0.3, 0.83 + rnd() * 0.3, 0.4 + rnd() * 0.2, 0.21 + rnd() * 0.1],
      amp: o.amp || 1, drift: 0, moored: true, lines: [] };
    grp.position.set(o.x, 0, o.z); grp.rotation.y = o.ry;
    return boat;
  }

  H.buildBoats = function (scene) {
    prints();
    // sway-able atlas bucket (charms)
    H.M.atlasSway = { mat: H.makeToon({ map: A.tex, alphaTest: 0.35, side: THREE.DoubleSide }, { defines: { SWAY_FX: '7.0' }, key: 'atlasSway' }), layer: 0, cast: false, receive: true, order: 0 };

    var boats = H.BOATS = [];
    // B: departing white fishing boat, outermost berth on the front quay (bow west, port side to the quay)
    boats.push(makeBoat(scene, 'F', { id: 'B', x: -2.9, z: 10.3, ry: -Math.PI / 2, quaySide: 1, name: 'name_B', variant: 0 }));
    // D: small fishing boat next to it
    boats.push(makeBoat(scene, 'S', { id: 'D', x: 6.45, z: 10.52, ry: -Math.PI / 2, quaySide: 1, name: 'name_D', variant: 2 }));
    // A: game-fishing boat along the arm quay (bow north, starboard side to the quay)
    boats.push(makeBoat(scene, 'G', { id: 'A', x: 12.22, z: 3.3, ry: Math.PI, quaySide: -1, name: 'name_A', variant: 1 }));
    // C: open skiff further along the arm
    boats.push(makeBoat(scene, 'O', { id: 'C', x: 12.78, z: -5.5, ry: Math.PI, quaySide: -1, name: 'name_C', amp: 1.5 }));
    H.boatById = {}; boats.forEach(function (b) { H.boatById[b.id] = b; });

    // mooring lines: [boat, cleat key, bollard index, slack]
    var bl = H.BOLLARDS;
    var lines = [['B', 'bow', 2, 0.35], ['B', 'stern', 3, 0.3], ['D', 'bow', 3, 0.3], ['D', 'stern', 4, 0.28],
      ['A', 'sternS', 5, 0.3], ['A', 'bowS', 7, 0.34], ['C', 'sternS', 8, 0.25], ['C', 'bowS', 9, 0.3]];
    var ropeCols = [C.rope, 0xdccba0, C.rope, C.rope, 0x4f9ac0, C.rope, 0xdccba0, C.rope];
    var SB = new H.Builder();
    lines.forEach(function (ln, k) {
      var boat = H.boatById[ln[0]], bo = bl[ln[2]];
      var rope = new DynRope(scene, ropeCols[k], G.mix(ropeCols[k], 0x5a2a1a, 0.5), 0.042);
      var local = new THREE.Vector3().fromArray(boat.info.cleats[ln[1]]);
      // rest length from the berth pose
      boat.group.updateMatrixWorld(true);
      var wp = local.clone().applyMatrix4(boat.group.matrixWorld);
      var bp = new THREE.Vector3(bo.x, bo.y0 + 0.3, bo.z);
      // where the line crosses the wheel stop on the quay edge
      var edge = new THREE.Vector3(), te;
      if (Math.abs(bp.z - wp.z) > Math.abs(bp.x - wp.x)) { te = (L.FRONT_Z + 0.19 - wp.z) / (bp.z - wp.z); edge.set(wp.x + (bp.x - wp.x) * te, QY + 0.30, L.FRONT_Z + 0.19); }
      else { te = (L.ARM_X + 0.19 - wp.x) / (bp.x - wp.x); edge.set(L.ARM_X + 0.19, QY + 0.30, wp.z + (bp.z - wp.z) * te); }
      boat.lines.push({ rope: rope, local: local, bollard: bp, edge: edge, rest: wp.distanceTo(edge) + ln[3], cast: 0 });
      H.ropeCoil(SB, bo.x, bo.z, 2, ropeCols[k], 0.045, bo.y0);
    });
    var coilGroup = new THREE.Group(); scene.add(coilGroup); SB.build(coilGroup, { name: 'coils' });

    // ---------------- mooring buoys with faded numbers, on chains
    var buoys = H.BUOYS = [];
    [[-8.2, -3.8, '3'], [-27.0, -11.6, '7'], [3.4, -4.6, '12']].forEach(function (p, k) {
      var g = new THREE.Group(), b = new H.Builder();
      var body = G.lathe([[0, -0.32], [0.3, -0.32], [0.44, -0.2], [0.46, 0.2], [0.36, 0.34], [0.14, 0.4], [0, 0.4]], 18, 0xf08a2c);
      G.paintFn(body, function (x, y) { return y < -0.12 ? 0x4f7f6a : (y < -0.05 ? 0x6f9a7a : 0xf08a2c); });
      b.add(G.fx(body, 0, 0.35));
      // number band wrapped round the float (four prints)
      for (var q = 0; q < 4; q++) {
        var arc = new THREE.CylinderGeometry(0.466, 0.466, 0.3, 8, 1, true, q * Math.PI / 2 - 0.6, 1.2);
        A.remap(arc, 'buoy_' + p[2]); G.paint(arc, 0xffffff);
        b.add(arc.translate(0, 0.05, 0), 'atlas');
      }
      b.add(G.cylB(0.06, 0.08, 0.3, 8, 0x55626a).translate(0, 0.4, 0));
      b.add(G.fx(G.torus(0.1, 0.028, 0x6f6a62, 5, 12).translate(0, 0.76, 0), 3, 0));
      b.add(G.fx(G.cylB(0.2, 0.2, 0.03, 12, 0xf6efe0).translate(0, 0.38, 0), 0, 0.3));
      // pick-up line with a little float
      b.add(G.rope([[0.4, 0.0, 0], [0.7, -0.03, 0.2], [1.0, -0.02, 0.1], [1.25, 0.0, 0.3]], 0.02, 0xdccba0, 14, 12));
      b.add(G.fx(G.sph(0.11, 0xf4cb3c, 8, 6).translate(1.28, 0.03, 0.32), 0, 0.5));
      b.build(g, { name: 'buoy' });
      g.position.set(p[0], 0.02, p[1]); g.rotation.y = k * 2.1;
      scene.add(g);
      buoys.push({ group: g, x: p[0], z: p[1], ph: k * 2.2 + 0.4, kick: 0, vel: 0, tiltX: 0, tiltZ: 0 });
    });
    // chains and sinkers (static)
    var CB = new H.Builder();
    buoys.forEach(function (bu) {
      var by = H.seabedY(bu.x, bu.z);
      H.chain(CB, [[bu.x, -0.3, bu.z], [bu.x + 0.15, -1.6, bu.z + 0.1], [bu.x + 0.5, -3.2, bu.z + 0.25], [bu.x + 1.0, by + 0.35, bu.z + 0.4]], 0x6f6a62, 0.09);
      CB.add(G.fx(G.boxB(0.7, 0.4, 0.7, 0x9aa7a3).translate(bu.x + 1.0, by - 0.05, bu.z + 0.4), 1, 0));
      CB.add(G.fx(G.torus(0.12, 0.03, 0x6f6a62, 5, 10).translate(bu.x + 1.0, by + 0.42, bu.z + 0.4), 3, 0));
    });
    var cg = new THREE.Group(); scene.add(cg); CB.build(cg, { name: 'chains' });

    // ---------------- far fishing boat that passes outside the long breakwater
    (function () {
      var grp = new THREE.Group(), inner = new THREE.Group(); grp.add(inner);
      var b = new H.Builder();
      DEFS.S(b, { name: 'name_F', variant: 1, stripe: 0x3f8fb6, bottom: 0x2f7f8f });
      var ms = b.build(inner, { name: 'farboat' });
      for (var k in ms) { ms[k].layers.set(1); ms[k].castShadow = false; }
      grp.visible = false; scene.add(grp);
      H.FARBOAT = { group: grp, inner: inner, meshes: ms };
    })();
  };
})();
