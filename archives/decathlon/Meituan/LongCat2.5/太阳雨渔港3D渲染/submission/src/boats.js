import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PAL, WATER_Y, toon, flat, addOutline, canvasTex, box, cyl, sph,
  mulberry32, hash1, clamp, lerp, easeInOut, easeOut, shadowify,
} from './common.js';

function hullGeometry(L, B, D) {
  const N = 10, K = 7;
  const halfB = (u) => (B / 2) * (u < 0.55 ? lerp(0.70, 1, u / 0.55) : lerp(1, 0.16, (u - 0.55) / 0.45));
  const deckY = 0.40, keelY = -D;
  const ringSize = 2 * K - 1;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = lerp(-L / 2, L / 2, u);
    const hb = halfB(u);
    for (let k = 0; k <= K; k++) {
      const v = k / K;
      const y = keelY + Math.pow(v, 1.15) * (deckY - keelY);
      const b = hb * Math.pow(Math.sin(v * Math.PI / 2), 0.8);
      pos.push(x, y, b);
    }
    for (let k = K - 1; k >= 1; k--) {
      const v = k / K;
      const y = keelY + Math.pow(v, 1.15) * (deckY - keelY);
      const b = -hb * Math.pow(Math.sin(v * Math.PI / 2), 0.8);
      pos.push(x, y, b);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < ringSize - 1; j++) {
      const a = i * ringSize + j, b = a + ringSize;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const sternCenter = pos.length / 3;
  pos.push(-L / 2, (deckY + keelY) / 2, 0);
  for (let j = 0; j < ringSize - 1; j++) idx.push(sternCenter, j + 1, j);
  const bowStart = N * ringSize;
  const bowCenter = pos.length / 3;
  pos.push(L / 2, (deckY + keelY) / 2, 0);
  for (let j = 0; j < ringSize - 1; j++) idx.push(bowCenter, bowStart + j, bowStart + j + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function deckGeometry(L, B, D) {
  const N = 10;
  const halfB = (u) => (B / 2) * (u < 0.55 ? lerp(0.70, 1, u / 0.55) : lerp(1, 0.16, (u - 0.55) / 0.45));
  const deckY = 0.34;
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    pos.push(lerp(-L / 2, L / 2, u), deckY, -halfB(u) * 0.94);
    pos.push(lerp(-L / 2, L / 2, u), deckY, halfB(u) * 0.94);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function gunwaleCurve(L, B) {
  const halfB = (u) => (B / 2) * (u < 0.55 ? lerp(0.70, 1, u / 0.55) : lerp(1, 0.16, (u - 0.55) / 0.45));
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push(new THREE.Vector3(lerp(-L / 2, L / 2, u), 0.44, halfB(u)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function chartTexture() {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#e8e0c8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a8272'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#5a6a72'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(20, 30); g.bezierCurveTo(60, 50, 70, 90, 40, 120);
    g.bezierCurveTo(60, 140, 100, 150, 140, 130);
    g.stroke();
    g.fillStyle = '#3a6ea5';
    g.font = 'bold 12px sans-serif';
    g.fillText('20m', 60, 70); g.fillText('10m', 90, 110);
    g.fillStyle = '#8a4030';
    g.beginPath(); g.arc(180, 60, 4, 0, 7); g.fill();
    g.fillStyle = '#4a463c';
    g.font = '10px sans-serif';
    g.fillText('潮 表', 16, 145);
    g.fillText('満潮 12:40', 150, 145);
  });
}

function nameTexture(text) {
  return canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2e3a42';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  });
}

export function buildBoats(ctx) {
  const root = new THREE.Group();
  ctx.scene.add(root);
  const rng = mulberry32(808);

  const radarTex = (() => {
    return null;
  })();

  const radarMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 p = vUv - 0.5;
        float d = length(p)*2.0;
        if(d>1.0) discard;
        vec3 col = vec3(0.02,0.10,0.06);
        float rings = smoothstep(0.02,0.0,abs(d-0.33)-0.008)*0.4 + smoothstep(0.02,0.0,abs(d-0.66)-0.008)*0.4;
        col += vec3(0.05,0.3,0.15)*rings;
        float ang = atan(p.y,p.x);
        float sa = mod(uTime*1.1, 6.2831);
        float diff = mod(sa - ang, 6.2831);
        float sweep = exp(-diff*2.2);
        col += vec3(0.1,0.7,0.3)*sweep*0.9;
        for(int i=0;i<5;i++){
          vec2 bp = vec2(hash(vec2(float(i),1.0)), hash(vec2(float(i),2.0)))*0.8-0.4;
          float bd = length(p-bp);
          float bl = smoothstep(0.05,0.0,bd) * (0.3+0.7*exp(-mod(sa - atan(bp.y,bp.x),6.2831)*1.5));
          col += vec3(0.4,1.0,0.5)*bl;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const finderMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        float col_x = floor((vUv.x + uTime*0.03)*28.0);
        float h = hash(vec2(col_x, 7.0));
        float h2 = hash(vec2(col_x, 13.0));
        float bar = step(vUv.y, h*0.75) * (0.4+0.6*h2);
        vec3 col = mix(vec3(0.02,0.12,0.10), vec3(0.2,0.9,0.6), bar);
        col += vec3(0.9,0.9,0.6) * smoothstep(0.92,1.0,vUv.y) * (0.5+0.5*sin(uTime*8.0+vUv.x*40.0));
        float bot = smoothstep(0.06,0.0,vUv.y);
        col = mix(col, vec3(0.85,0.5,0.2), bot*0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const chartTex = chartTexture();
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0xcfe8ea, transparent: true, opacity: 0.28, shininess: 160,
    specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false,
  });

  function makeCabinInterior(scale = 1) {
    const g = new THREE.Group();
    const woodMat = toon(0x8f6f4e);
    const deskMat = toon(0x6b5a44);
    const console_ = box(0.9 * scale, 0.55 * scale, 0.4 * scale, deskMat, 0, 0.28 * scale, 0.1 * scale);
    g.add(console_);
    const wheelCol = cyl(0.03 * scale, 0.03 * scale, 0.4 * scale, toon(0x4a4038), 0, 0.72 * scale, 0.22 * scale, 6);
    wheelCol.rotation.x = Math.PI / 2;
    g.add(wheelCol);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17 * scale, 0.022 * scale, 6, 14), toon(0x5a4632));
    wheel.position.set(0, 0.88 * scale, 0.30 * scale);
    wheel.rotation.y = Math.PI / 2;
    g.add(wheel);
    for (let i = 0; i < 3; i++) {
      const spoke = cyl(0.012 * scale, 0.012 * scale, 0.32 * scale, toon(0x5a4632), 0, 0, 0, 4);
      spoke.rotation.x = i * Math.PI / 3;
      spoke.position.copy(wheel.position);
      spoke.rotation.y = Math.PI / 2;
      spoke.rotation.order = 'YXZ';
      spoke.rotation.x = i * Math.PI / 3;
      g.add(spoke);
    }
    function screenMesh(mat, w, h) {
      const holder = new THREE.Group();
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      holder.add(p);
      holder.rotation.y = Math.PI / 2 - 0.30;
      p.rotation.x = -0.18;
      return holder;
    }
    const radarScreen = screenMesh(radarMat, 0.34 * scale, 0.24 * scale);
    radarScreen.position.set(-0.22 * scale, 0.78 * scale, 0.02 * scale);
    g.add(radarScreen);
    const finderScreen = screenMesh(finderMat, 0.26 * scale, 0.20 * scale);
    finderScreen.position.set(0.22 * scale, 0.76 * scale, 0.02 * scale);
    g.add(finderScreen);
    const chartHolder = new THREE.Group();
    chartHolder.position.set(0.05 * scale, 0.88 * scale, -0.16 * scale);
    chartHolder.rotation.y = Math.PI / 2 - 0.25;
    const chartBoard = box(0.55 * scale, 0.4 * scale, 0.02, woodMat, 0, 0, -0.02);
    chartHolder.add(chartBoard);
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.42 * scale, 0.28 * scale),
      new THREE.MeshBasicMaterial({ map: chartTex }));
    chart.rotation.x = -0.3;
    chart.position.set(0, 0.01, 0.012);
    chartHolder.add(chart);
    g.add(chartHolder);
    const thermos = cyl(0.055 * scale, 0.05 * scale, 0.24 * scale, toon(0xb9bcbe), 0.38 * scale, 0.68 * scale, 0.05 * scale, 10);
    g.add(thermos);
    const cup = cyl(0.045 * scale, 0.035 * scale, 0.09 * scale, toon(0xf0ead8), 0.28 * scale, 0.63 * scale, 0.12 * scale, 8);
    g.add(cup);
    const cup2 = cyl(0.045 * scale, 0.035 * scale, 0.09 * scale, toon(0xd8d5cb), 0.44 * scale, 0.63 * scale, -0.02 * scale, 8);
    g.add(cup2);
    const coatMat = toon(0xe8c51f);
    const coat = new THREE.Group();
    const coatBody = box(0.26 * scale, 0.4 * scale, 0.1 * scale, coatMat, 0, -0.2 * scale, 0);
    const coatHood = sph(0.07 * scale, coatMat, 0, 0.03 * scale, 0, 8, 6);
    const coatArmL = box(0.07 * scale, 0.26 * scale, 0.08 * scale, coatMat, -0.16 * scale, -0.18 * scale, 0);
    const coatArmR = box(0.07 * scale, 0.26 * scale, 0.08 * scale, coatMat, 0.16 * scale, -0.18 * scale, 0);
    coat.add(coatBody, coatHood, coatArmL, coatArmR);
    coat.position.set(-0.35 * scale, 0.95 * scale, -0.14 * scale);
    coat.rotation.z = 0.08;
    g.add(coat);
    const charm = new THREE.Mesh(new THREE.PlaneGeometry(0.05 * scale, 0.11 * scale),
      new THREE.MeshBasicMaterial({ color: 0xf5ecd0, side: THREE.DoubleSide }));
    charm.position.set(0.42 * scale, 0.98 * scale, -0.15 * scale);
    charm.rotation.y = -Math.PI / 2;
    charm.rotation.z = 0.1;
    g.add(charm);
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.08 * scale, 0.1 * scale),
      new THREE.MeshBasicMaterial({ color: 0x7a9a6a, side: THREE.DoubleSide }));
    photo.position.set(0.5 * scale, 0.9 * scale, -0.15 * scale);
    photo.rotation.y = -Math.PI / 2;
    photo.rotation.z = -0.12;
    g.add(photo);
    const lampMat = new THREE.PointLight(0xffe2b0, 1.4, 4.5, 1.6);
    lampMat.position.set(0, 1.0 * scale, 0);
    g.add(lampMat);
    return g;
  }

  function makeBoat(opts) {
    const { L = 6, B = 2.3, D = 0.85, name = '', cabinScale = 1, withCabin = true } = opts;
    const g = new THREE.Group();
    const hullMat = new THREE.MeshToonMaterial({ color: PAL.hullWhite });
    const hull = new THREE.Mesh(hullGeometry(L, B, D), hullMat);
    addOutline(hull, 0.035, 0x2a343a);
    g.add(hull);
    const deck = new THREE.Mesh(deckGeometry(L, B, D), toon(PAL.deckWood));
    g.add(deck);
    const railMat = toon(PAL.cabinWhite);
    for (const side of [1, -1]) {
      const curve = gunwaleCurve(L, B);
      const pts = curve.points.map(p => new THREE.Vector3(p.x, p.y, p.z * side));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.045, 6), railMat);
      g.add(tube);
    }
    const waterlineMat = flat(0x2e5a66);
    for (const side of [1, -1]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.86, 0.12), waterlineMat);
      stripe.position.set(-L * 0.02, -0.12, side * (B / 2 * 0.98));
      stripe.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(stripe);
    }
    const rustMat = new THREE.MeshBasicMaterial({ color: 0x8a5a3c, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1 });
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.25 + rng() * 0.35, 0.1 + rng() * 0.18), rustMat);
      const side = rng() < 0.5 ? 1 : -1;
      p.position.set((rng() - 0.5) * L * 0.75, -0.05 - rng() * 0.35, side * (B / 2 * 0.97));
      p.rotation.y = side > 0 ? 0 : Math.PI;
      p.rotation.z = (rng() - 0.5) * 0.6;
      g.add(p);
    }
    const tireMat = toon(0x26282a);
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const ft = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.075, 6, 12), tireMat);
        const fx = -L * 0.3 + i * L * 0.3;
        ft.position.set(fx, 0.02, side * (B / 2 + 0.12));
        ft.rotation.y = Math.PI / 2;
        g.add(ft);
      }
    }
    if (withCabin) {
      const cab = new THREE.Group();
      const cabW = B * 0.78, cabL = L * 0.34, cabH = 1.05 * cabinScale;
      const cabBody = box(cabL, cabH, cabW, toon(PAL.cabinWhite), 0, cabH / 2 + 0.06, 0);
      addOutline(cabBody, 0.03, 0x2a343a);
      cab.add(cabBody);
      const roofSlab = box(cabL + 0.25, 0.09, cabW + 0.25, toon(PAL.hullShade), 0, cabH + 0.12, 0);
      cab.add(roofSlab);
      const winY = cabH * 0.62;
      const winH = cabH * 0.34;
      const frontWin = new THREE.Mesh(new THREE.PlaneGeometry(cabW * 0.8, winH), glassMat);
      frontWin.position.set(cabL / 2 + 0.005, winY + 0.12, 0);
      frontWin.rotation.y = Math.PI / 2;
      cab.add(frontWin);
      for (const sz of [1, -1]) {
        const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(cabL * 0.72, winH), glassMat);
        sideWin.position.set(0, winY + 0.12, sz * (cabW / 2 + 0.005));
        cab.add(sideWin);
      }
      const mullMat = toon(0x3a4044);
      for (const sx of [-1, 1]) {
        cab.add(box(0.05, cabH * 0.5, 0.06, mullMat, cabL / 2 - 0.03, winY + 0.12, sx * cabW * 0.28));
      }
      const doorFrame = box(0.06, cabH * 0.72, cabW * 0.4, toon(0x4a4640), -cabL * 0.18, cabH * 0.38, -cabW / 2 - 0.005);
      cab.add(doorFrame);
      const doorLeaf = box(0.04, cabH * 0.68, cabW * 0.34, toon(0xd8d5cb), -cabL * 0.18 - 0.3, cabH * 0.36, -cabW / 2 - 0.32);
      doorLeaf.rotation.y = 0.9;
      cab.add(doorLeaf);
      const interior = makeCabinInterior(cabinScale);
      interior.position.set(-cabL * 0.1, 0.1, 0);
      cab.add(interior);
      const awnMat = toon(0x6b6f72);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        cab.add(cyl(0.025, 0.025, 0.85, awnMat, sx * (cabL / 2 + 0.15), cabH + 0.5, sz * (cabW / 2 + 0.15), 5));
      }
      const awnTop = new THREE.Mesh(new THREE.PlaneGeometry(cabL + 0.5, cabW + 0.5),
        new THREE.MeshToonMaterial({ color: 0x8a8d8f, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      awnTop.rotation.x = -Math.PI / 2;
      awnTop.position.y = cabH + 0.93;
      cab.add(awnTop);
      const mast = cyl(0.035, 0.05, 2.1, awnMat, cabL * 0.18, cabH + 1.0, 0, 6);
      cab.add(mast);
      const yard = cyl(0.02, 0.02, 0.9, awnMat, cabL * 0.18, cabH + 1.7, 0, 5);
      yard.rotation.x = Math.PI / 2;
      cab.add(yard);
      const antenna = cyl(0.01, 0.015, 1.1, awnMat, cabL * 0.18 - 0.2, cabH + 2.2, 0, 4);
      cab.add(antenna);
      const dome = sph(0.16, toon(0xf0efe8), cabL * 0.18 + 0.3, cabH + 1.5, 0, 10, 8);
      dome.scale.y = 0.75;
      cab.add(dome);
      const navLight = sph(0.05, new THREE.MeshBasicMaterial({ color: 0xff6a4a }), cabL * 0.18, cabH + 2.1, 0, 6, 5);
      cab.add(navLight);
      const lifeRing = new THREE.Group();
      const ringMain = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 6, 14), toon(PAL.lifeOrange));
      lifeRing.add(ringMain);
      for (let i = 0; i < 4; i++) {
        const seg = box(0.09, 0.07, 0.1, toon(0xf0ead8), Math.cos(i * Math.PI / 2 + 0.78) * 0.19, Math.sin(i * Math.PI / 2 + 0.78) * 0.19, 0);
        seg.rotation.z = i * Math.PI / 2 + 0.78;
        lifeRing.add(seg);
      }
      lifeRing.position.set(cabL * 0.25, 0.62, -cabW / 2 - 0.06);
      lifeRing.rotation.y = Math.PI / 2;
      cab.add(lifeRing);
      cab.position.set(-L * 0.08, 0.36, 0);
      g.add(cab);
    } else {
      const crateMat = toon(0xf0efe8);
      g.add(box(0.7, 0.4, 0.6, crateMat, -L * 0.2, 0.55, 0));
      g.add(box(0.6, 0.35, 0.55, toon(0x3f6d9e), -L * 0.2, 0.93, 0));
      const coilM = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 14), toon(PAL.rope));
      coilM.rotation.x = Math.PI / 2;
      coilM.position.set(L * 0.22, 0.42, 0);
      g.add(coilM);
      const bucket = cyl(0.14, 0.11, 0.22, toon(0x4f7a8a), L * 0.3, 0.5, 0.4, 8);
      g.add(bucket);
    }
    const nameMat = new THREE.MeshBasicMaterial({ map: nameTexture(name), transparent: true, side: THREE.DoubleSide });
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), nameMat);
      plate.position.set(L * 0.28, 0.18, side * (B / 2 * 0.9));
      plate.rotation.y = side > 0 ? 0.1 : Math.PI - 0.1;
      g.add(plate);
    }
    const cleatMat = toon(0x6b6f72);
    for (const cx of [L * 0.32, -L * 0.32]) {
      g.add(box(0.18, 0.06, 0.08, cleatMat, cx, 0.45, B / 2 * 0.55));
      g.add(box(0.18, 0.06, 0.08, cleatMat, cx, 0.45, -B / 2 * 0.55));
    }
    shadowify(g);
    hull.castShadow = true;
    return g;
  }

  const boats = [];
  const defs = [
    { L: 5.4, B: 2.1, pos: [5.2, -16.4], ry: 0, name: 'はるかぜ', cabinScale: 0.92 },
    { L: 6.0, B: 2.3, pos: [11.2, -16.4], ry: 0, name: '第二まきし', cabinScale: 1.05 },
    { L: 5.6, B: 2.2, pos: [17.4, -16.4], ry: 0, name: 'たいよう', cabinScale: 1.0, departs: true },
    { L: 5.8, B: 2.2, pos: [1.5, -6], ry: Math.PI / 2, name: 'ことぶき', cabinScale: 0.95 },
  ];
  const routePts = [
    [17.4, -16.4], [20.6, -15.8], [23.8, -15.2], [26.4, -15.6],
    [27.9, -17.6], [28.2, -21.2], [27.4, -24.6], [26.2, -26.6],
    [26.8, -24.0], [27.2, -19.5], [27.2, -15.8], [24.0, -15.3],
    [20.0, -15.9], [17.4, -16.4],
  ];
  const departDuration = 22;
  const departPeriod = 92;
  const departStart = 10;

  for (const def of defs) {
    const b = makeBoat(def);
    b.position.set(def.pos[0], WATER_Y + 0.02, def.pos[1]);
    b.rotation.y = def.ry;
    root.add(b);
    const reflSrc = new THREE.Mesh(
      mergeGeometries([
        new THREE.BoxGeometry(def.L * 0.9, 0.9, def.B),
        new THREE.BoxGeometry(def.L * 0.36, 0.9, def.B * 0.7).translate(-def.L * 0.08, 0.9, 0),
        new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5).translate(def.L * 0.05, 1.9, 0),
      ]),
      new THREE.MeshBasicMaterial()
    );
    const refl = ctx.addReflection(reflSrc, 0xcfe2dc, 0.5);
    boats.push({
      g: b, def, refl,
      basePos: new THREE.Vector3(def.pos[0], WATER_Y + 0.02, def.pos[1]),
      baseRy: def.ry,
      phase: hash1(def.pos[0] * 3) * 6.28,
      depart: !!def.departs,
    });
  }

  ctx.boatAnchors = [
    new THREE.Vector3(7.6, WATER_Y + 0.28, -16.2),
    new THREE.Vector3(13.7, WATER_Y + 0.28, -16.2),
    new THREE.Vector3(19.9, WATER_Y + 0.28, -16.2),
    new THREE.Vector3(1.4, WATER_Y + 0.28, -8.8),
  ];

  function routePoint(u) {
    const pts = routePts;
    const n = pts.length - 1;
    const f = clamp(u, 0, 1) * n;
    const i = Math.min(Math.floor(f), n - 1);
    const k = easeInOut(f - i);
    const x = lerp(pts[i][0], pts[i + 1][0], k);
    const z = lerp(pts[i][1], pts[i + 1][1], k);
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
    const yaw = Math.atan2(-dz, dx);
    return { x, z, yaw };
  }

  const wake = { px: 0, pz: -60, str: 0 };

  ctx.updaters.push((t, dyn) => {
    radarMat.uniforms.uTime.value = t;
    finderMat.uniforms.uTime.value = t;
    let depPhase = -1;
    let depBoat = null;
    for (const b of boats) {
      const wk = ctx.dyn.wake || wake;
      const dw = Math.hypot(b.basePos.x - wk.px, b.basePos.z - wk.pz);
      const wakeK = wk.str * Math.exp(-dw * dw / 10);
      if (b.depart) {
        const cyc = ((t - departStart) % departPeriod + departPeriod) % departPeriod;
        if (cyc < departDuration) {
          depPhase = cyc / departDuration;
          depBoat = b;
          const u = depPhase;
          const rp = routePoint(u);
          b.g.position.set(rp.x, WATER_Y + 0.02 + dyn.swell * 0.04, rp.z);
          let dyaw = rp.yaw - b.baseRy;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          b.g.rotation.y = b.baseRy + dyaw * easeInOut(clamp(depPhase * 1.15, 0, 1));
          b.g.rotation.z = Math.sin(t * 1.1) * 0.015 - dyaw * 0.06 * Math.sin(depPhase * Math.PI);
          b.g.rotation.x = Math.cos(t * 0.9) * 0.012 - 0.02 * Math.sin(depPhase * Math.PI);
          const sp = Math.sin(clamp((depPhase - 0.06) / 0.9, 0, 1) * Math.PI);
          wake.str = sp * 0.85;
          wake.px = b.g.position.x - Math.cos(b.g.rotation.y) * 0; 
          wake.px = b.g.position.x;
          wake.pz = b.g.position.z;
          b.refl.visible = true;
        } else {
          b.g.position.copy(b.basePos);
          b.g.position.y += dyn.swell * 0.05 + wakeK * 0.3;
          b.g.rotation.set(Math.cos(t * 0.8 + b.phase) * 0.018 + wakeK * 0.35, b.baseRy, Math.sin(t * 0.7 + b.phase) * 0.022 + wakeK * 0.3);
          wake.str = Math.max(0, wake.str - 0.03);
        }
      } else {
        b.g.position.copy(b.basePos);
        b.g.position.y += dyn.swell * 0.05 + wakeK * 0.3;
        b.g.rotation.set(Math.cos(t * 0.8 + b.phase) * 0.018 + wakeK * 0.35, b.baseRy, Math.sin(t * 0.7 + b.phase) * 0.022 + wakeK * 0.3);
      }
      b.refl.position.copy(b.g.position);
      b.refl.quaternion.copy(b.g.quaternion);
    }
    ctx.dyn.wake = wake;
    ctx.dyn.departPhase = depPhase;
  });
}
