/* ============================================================
   core.js — 基础工具 / 材质 / 程序化贴图 / 几何辅助
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S = global.S || {};

  /* ---------------- 随机与数学 ---------------- */
  S.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  S.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  S.lerp = (a, b, t) => a + (b - a) * t;
  S.smooth = (a, b, x) => { const t = S.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  S.ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  S.easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
  S.TAU = Math.PI * 2;

  /* ---------------- 值噪声 ---------------- */
  const PERM = new Uint8Array(512);
  (function () {
    const r = S.mulberry32(20240607);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();
  const fade = t => t * t * (3 - 2 * t);
  S.vnoise = function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const u = fade(xf), v = fade(yf);
    const a = PERM[PERM[X] + Y] / 255, b = PERM[PERM[X + 1] + Y] / 255;
    const c = PERM[PERM[X] + Y + 1] / 255, d = PERM[PERM[X + 1] + Y + 1] / 255;
    return S.lerp(S.lerp(a, b, u), S.lerp(c, d, u), v);
  };
  S.fbm = function (x, y, oct, lac, gain) {
    oct = oct || 4; lac = lac || 2.0; gain = gain || 0.5;
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * S.vnoise(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  };
  S.ridged = function (x, y, oct) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < (oct || 4); i++) { s += a * (1 - Math.abs(S.vnoise(x * f, y * f) * 2 - 1)); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  };

  /* ---------------- 画布 / 贴图 ---------------- */
  S.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  S.tex = function (canvas, opt) {
    opt = opt || {};
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = opt.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (opt.repeat) t.repeat.set(opt.repeat[0], opt.repeat[1]);
    t.anisotropy = opt.aniso || 4;
    if (opt.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
    if (THREE.REVISION >= 152) t.colorSpace = 'srgb';
    else t.encoding = THREE.sRGBEncoding;
    return t;
  };
  // 将 canvas 变为可用于材质的贴图（保留原色，不做色彩管理）
  S.texRaw = function (canvas, opt) {
    const t = S.tex(canvas, opt);
    t.encoding = THREE.LinearEncoding;
    return t;
  };

  /* ---------------- 常用色板 ---------------- */
  S.C = {
    skyTop: 0xdff1f6, skyBot: 0xf7fbf9,
    concrete: 0xe4e6e0, concreteDark: 0xb9c2c2, concreteDeep: 0x9aa7a9,
    ink: 0x24404c, inkSoft: 0x3d5b66,
    waterShallow: 0x8fd8d2, waterMid: 0x55b3bb, waterDeep: 0x2a7688, waterInk: 0x1b4f63,
    teal: 0x3f9ba8,
    white: 0xfbfcfa,
    yellow: 0xf5c445, black: 0x2b3238,
    orange: 0xe8734a, orangeDeep: 0xc9552f,
    brass: 0xd9ac58, brassDark: 0xa87c34,
    rope: 0xd4713f, ropeWet: 0x8d4a2c,
    green: 0x6fa85e, greenDark: 0x3f7a4e, greenLight: 0x9cc47a,
    wood: 0xb98a5c, woodDark: 0x8a623d,
    rust: 0xa85f3a,
    tile: 0x546a7a,
    skin: 0xf6d9c4
  };

  /* ---------------- 卡通渐变（三渲二色阶） ---------------- */
  let _grad = null;
  S.gradMap = function (steps) {
    if (_grad) return _grad;
    const data = new Uint8Array(steps.length * 4);
    for (let i = 0; i < steps.length; i++) {
      const v = Math.round(steps[i] * 255);
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    _grad = t;
    return t;
  };

  /* ---------------- 卡通材质 + 湿润高光/边缘光 ---------------- */
  S._toonPatch = function (mat, o) {
    o = o || {};
    const u = {
      uSpec: { value: o.spec === undefined ? 0.0 : o.spec },
      uShin: { value: o.shin === undefined ? 24.0 : o.shin },
      uSpecCol: { value: new THREE.Color(o.specCol === undefined ? 0xffffff : o.specCol) },
      uRim: { value: o.rim === undefined ? 0.0 : o.rim },
      uRimCol: { value: new THREE.Color(o.rimCol === undefined ? 0xdff6ff : o.rimCol) },
      uRimPow: { value: o.rimPow === undefined ? 3.0 : o.rimPow }
    };
    mat.userData.u = u;
    mat.onBeforeCompile = function (shader) {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        uniform float uSpec; uniform float uShin; uniform vec3 uSpecCol;
        uniform float uRim; uniform vec3 uRimCol; uniform float uRimPow;`)
        .replace(
          'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
          `
          vec3 specAcc = vec3(0.0);
          #if NUM_DIR_LIGHTS > 0
          for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            vec3 Ld = directionalLights[ i ].direction;
            vec3 Hv = normalize( Ld + geometry.viewDir );
            float sp = pow( max( dot( geometry.normal, Hv ), 0.0 ), uShin );
            specAcc += directionalLights[ i ].color * sp;
          }
          #endif
          float rimF = pow( 1.0 - max( dot( geometry.normal, geometry.viewDir ), 0.0 ), uRimPow );
          vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse
             + totalEmissiveRadiance
             + specAcc * uSpec * uSpecCol
             + rimF * uRim * uRimCol;`
        );
    };
    mat.customProgramCacheKey = () => 'toonpatch';
    return mat;
  };

  S.toon = function (color, o) {
    o = o || {};
    const params = {
      color: color,
      gradientMap: S.gradMap(o.steps || [0.54, 0.78, 1.0]),
      side: o.side === undefined ? THREE.FrontSide : o.side,
      transparent: !!o.transparent,
      opacity: o.opacity === undefined ? 1 : o.opacity
    };
    if (o.map) params.map = o.map;
    if (o.emissive !== undefined) { params.emissive = new THREE.Color(o.emissive); params.emissiveIntensity = o.emissiveIntensity || 1; }
    if (o.depthWrite === false) params.depthWrite = false;
    const m = new THREE.MeshToonMaterial(params);
    S._toonPatch(m, o);
    return m;
  };

  /* ---------------- 轮廓线（背面外壳） ---------------- */
  const _outlineCache = {};
  S.outlineMat = function (width, color) {
    const key = (width || 1) + '_' + (color || 0);
    if (_outlineCache[key]) return _outlineCache[key];
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uW: { value: width || 1 },
        uC: { value: new THREE.Color(color === undefined ? 0x22414e : color) }
      },
      vertexShader: `
        uniform float uW;
        void main(){
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          vec3 n = normalize( normalMatrix * normal );
          float d = max( -mv.z, 0.001 );
          mv.xyz += n * uW * d * 0.0021;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uC;
        void main(){ gl_FragColor = vec4( uC, 1.0 ); }`,
      side: THREE.BackSide,
      fog: false
    });
    _outlineCache[key] = m;
    return m;
  };

  // 给网格加轮廓
  S.addOutline = function (mesh, width, color) {
    if (!mesh.geometry || !mesh.geometry.attributes.normal) return mesh;
    const ol = new THREE.Mesh(mesh.geometry, S.outlineMat(width, color));
    ol.name = '_ol';
    ol.castShadow = false; ol.receiveShadow = false;
    ol.layers.set(0);
    ol.renderOrder = -1;
    mesh.add(ol);
    return mesh;
  };

  // 给一组网格加轮廓（先收集再添加，避免遍历时修改children）
  S.addOutlines = function (root, width, color) {
    const list = [];
    root.traverse(o => { if (o.isMesh && o.name !== '_ol') list.push(o); });
    list.forEach(o => S.addOutline(o, width, color));
    return root;
  };

  /* ---------------- 几何辅助 ---------------- */
  S.box = function (w, h, d) { return new THREE.BoxGeometry(w, h, d); };

  // 圆角盒：把 BoxGeometry 的顶点吸附到圆角盒表面
  S.rbox = function (w, h, d, r, seg) {
    if (r === undefined || r === null || !isFinite(r)) r = Math.min(w, h, d) * 0.16;
    r = Math.min(r, w / 2, h / 2, d / 2);
    seg = seg || 3;
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    const pos = g.attributes.position;
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const cx = S.clamp(v.x, -hw, hw), cy = S.clamp(v.y, -hh, hh), cz = S.clamp(v.z, -hd, hd);
      const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      v.set(cx + dx / len * r, cy + dy / len * r, cz + dz / len * r);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  };

  S.cyl = function (rt, rb, h, seg, open) { return new THREE.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open); };

  // 简单的放样：sections = [{ pts:[[x,y],...] , z:.. }] ，生成侧面
  S.loft = function (rings, closed) {
    const pos = [], idx = [];
    const n = rings[0].length;
    for (let i = 0; i < rings.length; i++) {
      for (let j = 0; j < n; j++) {
        const p = rings[i][j];
        pos.push(p[0], p[1], p[2]);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < (closed ? n : n - 1); j++) {
        const j2 = (j + 1) % n;
        const a = i * n + j, b = i * n + j2, c = (i + 1) * n + j, d = (i + 1) * n + j2;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  // 沿路径生成管状几何（用于缆绳、水管）
  S.tube = function (points, radius, seg) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.TubeGeometry(curve, seg || 40, radius, 6, false);
  };

  // 合并多个几何体（保留 position / normal / uv），各几何体需已应用变换
  S.mergeGeos = function (list) {
    const geos = list.map(g => g.index ? g.toNonIndexed() : g);
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const hasUv = geos.every(g => g.attributes.uv);
    const uv = hasUv ? new Float32Array(total * 2) : null;
    let off = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      if (uv) uv.set(g.attributes.uv.array, off * 2);
      off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  };

  // 小鱼几何（朝 +z）：纺锤形身体 + 尾鳍 + 背鳍
  S.fishGeo = function () {
    if (S._fishGeo) return S._fishGeo;
    const body = new THREE.SphereGeometry(1, 7, 6);
    body.scale(0.055, 0.08, 0.20);
    const tail = new THREE.ConeGeometry(0.10, 0.13, 3);
    tail.rotateX(Math.PI / 2);
    tail.scale(0.14, 1, 1);
    tail.translate(0, 0, -0.25);
    const dorsal = new THREE.ConeGeometry(0.045, 0.075, 3);
    dorsal.scale(1, 1, 0.16);
    dorsal.rotateX(-0.5);
    dorsal.translate(0, 0.095, -0.02);
    const belly = new THREE.ConeGeometry(0.035, 0.05, 3);
    belly.scale(1, 1, 0.16);
    belly.rotateX(Math.PI + 0.4);
    belly.translate(0, -0.09, -0.03);
    S._fishGeo = S.mergeGeos([body, tail, dorsal, belly]);
    return S._fishGeo;
  };

  /* ---------------- 程序化贴图库 ---------------- */

  // 通用：逐像素填充
  S._pixelFill = function (ctx, w, h, fn) {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const out = [0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        fn(x, y, out);
        const i = (y * w + x) * 4;
        d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  // 混凝土：底色 + 骨料斑点 + 污渍 + 裂缝
  S.texConcrete = function (w, h, opt) {
    opt = opt || {};
    const base = opt.base || [228, 230, 224];
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    const rnd = S.mulberry32(opt.seed || 7);
    const sc = opt.scale || 1;
    S._pixelFill(ctx, w, h, (x, y, o) => {
      const nx = x / w * 8 * sc, ny = y / h * 8 * sc;
      let v = 1 + (S.fbm(nx, ny, 5, 2.1, 0.5) - 0.5) * 0.07;
      const blot = S.fbm(nx * 0.42 + 11, ny * 0.42 + 7, 3, 2.0, 0.5);
      v *= 0.955 + blot * 0.09;
      // 细骨料
      const g = S.vnoise(x * 0.9, y * 0.9);
      v *= 0.975 + g * 0.05;
      o[0] = base[0] * v; o[1] = base[1] * v; o[2] = base[2] * v;
    });
    // 污渍
    const stains = opt.stains === undefined ? 22 : opt.stains;
    for (let i = 0; i < stains; i++) {
      const x = rnd() * w, y = rnd() * h;
      const r = (0.02 + rnd() * 0.09) * w;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.6;
      const a = 0.02 + rnd() * 0.05;
      grd.addColorStop(0, dark ? `rgba(90,105,105,${a})` : `rgba(255,255,252,${a})`);
      grd.addColorStop(1, 'rgba(120,130,130,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    // 裂纹
    if (opt.cracks !== false) {
      ctx.strokeStyle = 'rgba(105,115,115,0.20)';
      const n = opt.crackCount || 4;
      for (let i = 0; i < n; i++) {
        let x = rnd() * w, y = rnd() * h;
        ctx.lineWidth = 0.6 + rnd() * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y);
        const steps = 6 + (rnd() * 10 | 0);
        for (let s = 0; s < steps; s++) {
          x += (rnd() - 0.5) * w * 0.05; y += (rnd() - 0.35) * h * 0.05;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    return c;
  };

  // 潮位线岸壁：砌块 + 潮痕 + 藤壶 + 海藻
  S.texQuayWall = function (w, h, opt) {
    opt = opt || {};
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    const rnd = S.mulberry32(opt.seed || 31);
    ctx.fillStyle = '#d8dcd6';
    ctx.fillRect(0, 0, w, h);
    const rows = opt.rows || 5, cols = opt.cols || 4;
    const bh = h / rows, bw = w / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw * 0.5;
      for (let k = -1; k < cols + 1; k++) {
        const x = k * bw + off, y = r * bh;
        const v = 0.92 + rnd() * 0.16;
        ctx.fillStyle = `rgb(${(214 * v) | 0},${(218 * v) | 0},${(212 * v) | 0})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        // 斑驳
        for (let s = 0; s < 26; s++) {
          const sx = x + 4 + rnd() * (bw - 8), sy = y + 4 + rnd() * (bh - 8);
          const a = rnd() * 0.10;
          ctx.fillStyle = rnd() < 0.5 ? `rgba(120,132,130,${a})` : `rgba(255,255,250,${a})`;
          ctx.fillRect(sx, sy, 1 + rnd() * 5, 1 + rnd() * 4);
        }
      }
      ctx.strokeStyle = 'rgba(140,150,148,0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, r * bh); ctx.lineTo(w, r * bh); ctx.stroke();
    }
    // 潮位线（wl = 水线位置，从顶部算起的比例）
    const wl = opt.wl === undefined ? 0.62 : opt.wl;
    const bands = [
      { y: wl - 0.055, h: 0.03, col: 'rgba(255,255,248,0.45)' },   // 盐线
      { y: wl - 0.02, h: 0.06, col: 'rgba(110,140,126,0.30)' },    // 湿痕
      { y: wl + 0.03, h: 0.30, col: 'rgba(74,106,90,0.34)' },      // 藻类
      { y: wl + 0.35, h: 0.45, col: 'rgba(44,70,62,0.45)' }        // 水下深处
    ];
    for (const b of bands) {
      const g = ctx.createLinearGradient(0, h * b.y, 0, h * (b.y + b.h));
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, b.col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h * b.y, w, h * b.h);
    }
    // 水线以下的整体压暗
    {
      const g = ctx.createLinearGradient(0, h * wl, 0, h);
      g.addColorStop(0, 'rgba(38,66,70,0.30)');
      g.addColorStop(0.5, 'rgba(30,58,66,0.44)');
      g.addColorStop(1, 'rgba(24,48,58,0.52)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h * wl, w, h * (1 - wl));
    }
    // 锈水
    for (let i = 0; i < 6; i++) {
      const x = rnd() * w;
      const g = ctx.createLinearGradient(0, 0, 0, h * (0.2 + rnd() * 0.5));
      g.addColorStop(0, `rgba(150,88,52,${0.10 + rnd() * 0.12})`);
      g.addColorStop(1, 'rgba(150,88,52,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 2 + rnd() * 5, h * (0.2 + rnd() * 0.5));
    }
    // 藤壶/牡蛎
    const barn = opt.barnacles === undefined ? 160 : opt.barnacles;
    for (let i = 0; i < barn; i++) {
      const x = rnd() * w;
      const yy = Math.pow(rnd(), 0.55);
      const y = h * (wl + 0.02 + yy * (1 - wl - 0.02));
      const r = (1.5 + rnd() * 5.0) * (w / 512);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
      const vv = 200 + rnd() * 50;
      ctx.fillStyle = `rgba(${vv},${vv - 4},${vv - 12},${0.5 + rnd() * 0.4})`;
      ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, 6.2832);
      ctx.fillStyle = 'rgba(70,82,80,0.55)';
      ctx.fill();
    }
    // 海藻垂挂
    for (let i = 0; i < 14; i++) {
      const x = rnd() * w, y = h * (wl + 0.06 + rnd() * (1 - wl - 0.1));
      ctx.strokeStyle = `rgba(${60 + rnd() * 30},${100 + rnd() * 40},${70 + rnd() * 20},0.5)`;
      ctx.lineWidth = 1.5 + rnd() * 2;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rnd() - 0.5) * 20, y + 20, x + (rnd() - 0.5) * 30, y + 30 + rnd() * 40);
      ctx.stroke();
    }
    return c;
  };

  // 底座剖面：混凝土面板 / 砂砾垫层 / 抛石 / 土层
  S.texCutSection = function (w, h, opt) {
    opt = opt || {};
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    const rnd = S.mulberry32(opt.seed || 77);
    const strata = opt.strata || [
      { y: 0.00, col: [206, 209, 203] },   // 混凝土面板
      { y: 0.07, col: [204, 194, 168] },   // 砂砾垫层
      { y: 0.11, col: [176, 168, 152] },   // 抛石层
      { y: 0.52, col: [156, 148, 136] },   // 土层
      { y: 0.80, col: [134, 130, 124] },
      { y: 1.00, col: [118, 116, 112] }
    ];
    const layerCol = (t) => {
      for (let i = 0; i < strata.length - 1; i++) {
        if (t >= strata[i].y && t <= strata[i + 1].y) {
          const k = (t - strata[i].y) / Math.max(1e-6, strata[i + 1].y - strata[i].y);
          return [
            S.lerp(strata[i].col[0], strata[i + 1].col[0], k),
            S.lerp(strata[i].col[1], strata[i + 1].col[1], k),
            S.lerp(strata[i].col[2], strata[i + 1].col[2], k)
          ];
        }
      }
      return strata[strata.length - 1].col;
    };
    S._pixelFill(ctx, w, h, (x, y, o) => {
      const t = y / h;
      const col = layerCol(t);
      const nx = x / w * 10, ny = t * 10;
      let v = 1 + (S.fbm(nx, ny, 4, 2.0, 0.5) - 0.5) * 0.10;
      // 土层的水平层理
      if (t > 0.5) v *= 1 + Math.sin(t * 70 + S.fbm(nx * 0.5, ny * 0.5, 2) * 6) * 0.04;
      // 面板细骨料
      if (t < 0.07) v *= 0.97 + S.vnoise(x * 0.9, y * 0.9) * 0.06;
      o[0] = col[0] * v; o[1] = col[1] * v; o[2] = col[2] * v;
    });
    // 抛石：大小不一的石块
    const stones = opt.stones === undefined ? 150 : opt.stones;
    for (let i = 0; i < stones; i++) {
      const t = 0.11 + Math.pow(rnd(), 0.8) * 0.42;
      const x = rnd() * w, y = t * h;
      const r = (3 + rnd() * 11) * (w / 512);
      const g = 118 + rnd() * 80;
      const warm = rnd() < 0.3 ? 12 : 0;
      ctx.fillStyle = `rgb(${(g + warm) | 0},${(g + warm * 0.5) | 0},${(g - 6) | 0})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.8 + rnd() * 0.6), r * (0.6 + rnd() * 0.4), rnd() * 3.14, 0, 6.2832);
      ctx.fill();
      // 石块下缘阴影 / 上缘高光
      ctx.strokeStyle = 'rgba(60,58,54,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y + 1.5, r * 0.9, r * 0.6, 0, 0.2, 2.9);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,245,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y - 1.5, r * 0.8, r * 0.5, 0, 3.4, 6.0);
      ctx.stroke();
    }
    // 土层里的小卵石与暗色空洞
    for (let i = 0; i < 70; i++) {
      const t = 0.5 + rnd() * 0.5;
      const x = rnd() * w, y = t * h;
      const r = (1.5 + rnd() * 4) * (w / 512);
      ctx.fillStyle = rnd() < 0.6 ? 'rgba(150,144,134,0.7)' : 'rgba(60,58,56,0.6)';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, 6.2832); ctx.fill();
    }
    // 垫层里的碎石点
    for (let i = 0; i < 220; i++) {
      const x = rnd() * w, y = (0.07 + rnd() * 0.04) * h;
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(150,140,118,0.8)' : 'rgba(240,232,210,0.8)';
      ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // 分层界线
    ctx.strokeStyle = 'rgba(70,70,66,0.55)';
    ctx.lineWidth = 2;
    for (const yy of [0.07, 0.11, 0.52]) {
      ctx.beginPath(); ctx.moveTo(0, yy * h); ctx.lineTo(w, yy * h); ctx.stroke();
    }
    // 面板顶边高光与竖向收缩缝
    ctx.fillStyle = 'rgba(255,255,250,0.35)'; ctx.fillRect(0, 0, w, 3);
    for (let i = 0; i < 4; i++) {
      const x = (i + 0.5) * w / 4 + (rnd() - 0.5) * 10;
      ctx.fillStyle = 'rgba(80,84,82,0.5)'; ctx.fillRect(x, 0, 2, 0.07 * h);
    }
    // 渗水痕
    for (let i = 0; i < 5; i++) {
      const x = rnd() * w;
      const g = ctx.createLinearGradient(0, 0.07 * h, 0, (0.3 + rnd() * 0.3) * h);
      g.addColorStop(0, `rgba(70,90,86,${0.12 + rnd() * 0.10})`);
      g.addColorStop(1, 'rgba(70,90,86,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0.07 * h, 3 + rnd() * 8, 0.5 * h);
    }
    return c;
  };

  // 木纹
  S.texWood = function (w, h, opt) {
    opt = opt || {};
    const base = opt.base || [186, 138, 92];
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    S._pixelFill(ctx, w, h, (x, y, o) => {
      const nx = x / w, ny = y / h;
      let v = 1 + Math.sin((ny * 26 + S.fbm(nx * 3, ny * 3, 3) * 6) * 3.14) * 0.07;
      v *= 0.94 + S.fbm(nx * 40, ny * 4, 3) * 0.12;
      o[0] = base[0] * v; o[1] = base[1] * v; o[2] = base[2] * v;
    });
    return c;
  };

  // 金属锈迹
  S.texRust = function (w, h, opt) {
    opt = opt || {};
    const base = opt.base || [150, 158, 160];
    const rust = opt.rust || [150, 88, 52];
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    S._pixelFill(ctx, w, h, (x, y, o) => {
      const nx = x / w * 6, ny = y / h * 6;
      const m = S.fbm(nx, ny, 5, 2.2, 0.55);
      const t = S.smooth(opt.lo || 0.52, opt.hi || 0.72, m);
      const v = 0.9 + S.vnoise(x * 0.5, y * 0.5) * 0.2;
      o[0] = S.lerp(base[0], rust[0], t) * v;
      o[1] = S.lerp(base[1], rust[1], t) * v;
      o[2] = S.lerp(base[2], rust[2], t) * v;
    });
    return c;
  };

  // 斜纹黄黑警示条
  S.texHazard = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#f2c23a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c3236';
    const sw = w / 8;
    for (let i = -8; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(i * sw, 0);
      ctx.lineTo(i * sw + sw * 0.5, 0);
      ctx.lineTo(i * sw + sw * 0.5 + h, h);
      ctx.lineTo(i * sw + h, h);
      ctx.closePath(); ctx.fill();
    }
    // 磨损
    const rnd = S.mulberry32(99);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${190 + rnd() * 50},${190 + rnd() * 50},${185 + rnd() * 50},${rnd() * 0.25})`;
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    return c;
  };

  // 文字牌
  S.texLabel = function (w, h, drawFn) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    drawFn(ctx, w, h);
    return c;
  };

  /* ---------------- 水光粼粼的材质 ---------------- */
  S.causticMats = [];
  S.makeCausticMat = function (tint, strength) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: new THREE.Color(tint === undefined ? 0xdfeeea : tint) },
        uStr: { value: strength === undefined ? 0.5 : strength }
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN;
        void main(){
          vUv = uv;
          vN = normalize( normalMatrix * normal );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uTint; uniform float uStr;
        varying vec2 vUv; varying vec3 vN;
        float caustic( vec2 p, float t ) {
          vec2 i = p;
          float c = 0.0;
          for ( int n = 0; n < 4; n ++ ) {
            float tt = t * ( 1.0 - ( 3.5 / float( n + 1 ) ) );
            i = p + vec2( cos( tt - i.x ) + sin( tt + i.y ), sin( tt - i.y ) + cos( tt + i.x ) );
            c += 1.0 / length( vec2( p.x / ( sin( i.x + tt ) + 1.3 ), p.y / ( cos( i.y + tt ) + 1.3 ) ) );
          }
          c /= 4.0;
          c = 1.17 - pow( c, 1.4 );
          return pow( abs( c ), 8.0 );
        }
        void main(){
          vec2 p = vUv * vec2( 9.0, 9.0 );
          float c = caustic( p, uTime * 0.45 );
          vec3 col = uTint + vec3( 0.30, 0.36, 0.34 ) * c * uStr;
          gl_FragColor = vec4( col, 1.0 );
        }`,
      fog: false
    });
    S.causticMats.push(m);
    return m;
  };

  /* ---------------- 场景构建辅助 ---------------- */
  S.mesh = function (geo, mat, opt) {
    opt = opt || {};
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opt.castShadow === undefined ? true : opt.castShadow;
    m.receiveShadow = opt.receiveShadow === undefined ? true : opt.receiveShadow;
    if (opt.pos) m.position.set(opt.pos[0], opt.pos[1], opt.pos[2]);
    if (opt.rot) m.rotation.set(opt.rot[0], opt.rot[1], opt.rot[2]);
    if (opt.scale) m.scale.set(opt.scale[0], opt.scale[1], opt.scale[2]);
    if (opt.name) m.name = opt.name;
    if (opt.outline !== false) S.addOutline(m, opt.outlineWidth || 1.0, opt.outlineColor);
    return m;
  };

  // 一组零件挂到 group
  S.group = function (children, opt) {
    const g = new THREE.Group();
    (children || []).forEach(c => { if (c) g.add(c); });
    if (opt && opt.pos) g.position.set(opt.pos[0], opt.pos[1], opt.pos[2]);
    if (opt && opt.rot) g.rotation.set(opt.rot[0], opt.rot[1], opt.rot[2]);
    return g;
  };

  /* ---------------- 时间与全局状态 ---------------- */
  S.time = 0;          // 场景内部时刻
  S.wind = 0;          // 阵风强度 0..1
  S.rain = 0.5;        // 雨势 0..1
  S.sun = 1;           // 日光强度 0..1（云影）
  S.exportMode = false;

  // 确定性的“阵风”函数：返回 0..1
  S.gustAt = function (t) {
    const p = (t % 26) / 26;
    let g = 0;
    g += Math.max(0, Math.sin(p * Math.PI * 2 - 1.2)) * 0.55;
    const p2 = ((t * 0.37) % 17) / 17;
    g += Math.max(0, Math.sin(p2 * Math.PI * 2 + 0.6)) * 0.35;
    return S.clamp(g, 0, 1);
  };
  // 雨势
  S.rainAt = function (t) {
    const a = 0.5 + 0.28 * Math.sin(t * 0.113) + 0.14 * Math.sin(t * 0.317 + 1.7) + 0.08 * Math.sin(t * 0.71 + 0.4);
    return S.clamp(a, 0.12, 1.0);
  };
  // 日光（云影）
  S.sunAt = function (t) {
    let s = 0.86 + 0.14 * Math.sin(t * 0.071 + 0.8) * Math.sin(t * 0.037 + 2.1);
    // 极偶尔变暗
    const p = (t % 71) / 71;
    const dark = Math.exp(-Math.pow((p - 0.62) * 9, 2));
    s *= 1 - dark * 0.42;
    return S.clamp(s, 0.25, 1.0);
  };

  /* ---------------- 简单轨道控制 ---------------- */
  S.Controls = function (camera, dom) {
    const self = this;
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, -0.5, 0);
    this.enabled = true;
    this.minDist = 6, this.maxDist = 70;
    this.minPolar = 0.12, this.maxPolar = 1.45;
    this.sph = new THREE.Spherical(34, 0.98, 0.72);
    this.sphTarget = this.sph.clone();
    this.pan = new THREE.Vector3();
    this.panTarget = new THREE.Vector3();
    this.damping = 0.12;
    this.zoomSpeed = 1.0;

    const state = { down: false, x: 0, y: 0, btn: 0, moved: 0 };
    function onDown(e) {
      if (!self.enabled) return;
      state.down = true; state.btn = e.button; state.moved = 0;
      state.x = e.clientX; state.y = e.clientY;
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId || 0);
      e.preventDefault();
    }
    function onMove(e) {
      if (!state.down || !self.enabled) return;
      const dx = e.clientX - state.x, dy = e.clientY - state.y;
      state.x = e.clientX; state.y = e.clientY;
      state.moved += Math.abs(dx) + Math.abs(dy);
      if (state.btn === 0) {
        self.sphTarget.theta -= dx * 0.0062;
        self.sphTarget.phi -= dy * 0.0055;
        self.sphTarget.phi = S.clamp(self.sphTarget.phi, self.minPolar, self.maxPolar);
      } else {
        const dist = self.sph.radius;
        const k = dist * 0.0016;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        self.panTarget.addScaledVector(right, -dx * k);
        self.panTarget.addScaledVector(up, dy * k);
      }
    }
    function onUp(e) {
      state.down = false;
      try { dom.releasePointerCapture && dom.releasePointerCapture(e.pointerId || 0); } catch (err) { }
    }
    function onWheel(e) {
      if (!self.enabled) return;
      e.preventDefault();
      const k = Math.pow(0.9995, -e.deltaY);
      self.sphTarget.radius = S.clamp(self.sphTarget.radius * k, self.minDist, self.maxDist);
    }
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());

    this.update = function (dt) {
      const k = 1 - Math.pow(1 - this.damping, dt * 60);
      this.sph.theta += (this.sphTarget.theta - this.sph.theta) * k;
      this.sph.phi += (this.sphTarget.phi - this.sph.phi) * k;
      this.sph.radius += (this.sphTarget.radius - this.sph.radius) * k;
      this.pan.lerp(this.panTarget, k);
      const off = new THREE.Vector3().setFromSpherical(this.sph);
      const t = this.target.clone().add(this.pan);
      camera.position.copy(t).add(off);
      camera.lookAt(t);
    };
    this.set = function (theta, phi, radius, target) {
      this.sphTarget.set(radius, phi, theta);
      this.sph.set(radius, phi, theta);
      if (target) { this.target.copy(target); }
      this.pan.set(0, 0, 0); this.panTarget.set(0, 0, 0);
      this.update(0.016);
    };
  };

})(window);
