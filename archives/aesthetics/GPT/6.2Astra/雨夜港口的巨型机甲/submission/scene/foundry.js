"use strict";
const T = THREE;
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, f) => a + (b - a) * f;
let seed = 73195617;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const between = (a, b) => mix(a, b, rand());
const clockUniform = { value: 0 };
const canvas = document.getElementById("ocean-view");
const renderer = new T.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new T.Scene();
scene.fog = new T.FogExp2(0x435764, 0.0038);
const camera = new T.PerspectiveCamera(38, 1, 0.17, 2300);
function group(p, x = 0, y = 0, z = 0) {
  let g = new T.Group();
  g.position.set(x, y, z);
  if (p) p.add(g);
  return g;
}
function vec(a) {
  return a.isVector3 ? a : V(...a);
}
const texCanvas = (w, h = w) => {
  let c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
function fromCanvas(c, repeat = false, srgb = false) {
  let t = new T.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
// A seamless field of oxidation, tool marks and water beads. The channels remain independent.
const textureSize = 512;
function noiseTile(n) {
  const d = new Float32Array(n * n);
  for (let i = 0; i < d.length; i++) d[i] = rand();
  return (u, v) => {
    let x = u * n,
      y = v * n,
      ix = Math.floor(x),
      iy = Math.floor(y);
    let fx = x - ix,
      fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    let a = (((iy % n) + n) % n) * n,
      b = ((((iy + 1) % n) + n) % n) * n,
      i = ((ix % n) + n) % n,
      j = (((ix + 1) % n) + n) % n;
    return mix(mix(d[a + i], d[a + j], fx), mix(d[b + i], d[b + j], fx), fy);
  };
}
const n4 = noiseTile(4),
  n8 = noiseTile(8),
  n21 = noiseTile(21),
  n63 = noiseTile(63);
function anvilTexture() {
  const c = texCanvas(textureSize),
    ctx = c.getContext("2d"),
    im = ctx.createImageData(c.width, c.height);
  let scratch = texCanvas(textureSize),
    sc = scratch.getContext("2d");
  sc.fillStyle = "#000";
  sc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    let x = rand() * 512,
      y = rand() * 512,
      len = Math.pow(rand(), 3) * 39 + 1,
      ang = -0.7 + between(-0.22, 0.22) + (i % 4 === 0 ? 1.52 : 0);
    sc.strokeStyle = "rgba(255,255,255," + between(0.12, 0.9) + ")";
    sc.lineWidth = between(0.3, 1.2);
    sc.beginPath();
    sc.moveTo(x, y);
    sc.lineTo(x + len * Math.cos(ang), y + len * Math.sin(ang));
    sc.stroke();
  }
  for (let i = 0; i < 1450; i++) {
    sc.fillStyle = "rgba(230,230,230," + between(0.12, 0.68) + ")";
    sc.fillRect(rand() * 512, rand() * 512, between(0.4, 2.4), between(0.4, 1.8));
  }
  const lines = sc.getImageData(0, 0, 512, 512).data;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      let i = (y * 512 + x) * 4,
        u = x / 512,
        v = y / 512,
        grain = rand();
      let val =
        n4(u, v) * 0.26 +
        n8(u, v) * 0.24 +
        n21(u, v) * 0.19 +
        n63(u, v) * 0.085 +
        grain * 0.016 +
        n21(u * 4, v) * 0.11 +
        n8(u * 3, v) * 0.1;
      im.data[i] = val * 255;
      im.data[i + 1] = lines[i];
      im.data[i + 2] =
        clamp(n63(u * 2, v) * 0.194 + grain * 0.026 + n8(u * 4, v) * 0.57 + n21(u, v) * 0.21, 0, 1) * 255;
      im.data[i + 3] = 255;
    }
  ctx.putImageData(im, 0, 0);
  return fromCanvas(c, true);
}
const patina = anvilTexture();
// Store slopes on the material itself, so the same drop has the same normal
// when it is seen from the sea, the reflection camera, or a close lens.
function surfaceSlopes(image, height, frequency) {
  const size = image.width;
  const source = image.getContext("2d").getImageData(0, 0, size, size);
  const out = texCanvas(size),
    ctx = out.getContext("2d");
  const field = ctx.createImageData(size, size);
  function pixel(x, y) {
    return (((y + size) % size) * size + ((x + size) % size)) * 4;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = pixel(x, y);
      const dx = height(source.data, pixel(x + 1, y)) - height(source.data, pixel(x - 1, y));
      // Canvas Y runs downwards. Texture V runs up the armour.
      const dy = height(source.data, pixel(x, y - 1)) - height(source.data, pixel(x, y + 1));
      const gain = size * frequency * 0.5;
      field.data[i] = source.data[i];
      field.data[i + 1] = 128 + 127 * clamp(dx * gain, -1, 1);
      field.data[i + 2] = 128 + 127 * clamp(dy * gain, -1, 1);
      field.data[i + 3] = 255;
    }
  }
  ctx.putImageData(field, 0, 0);
  return fromCanvas(out, true);
}
const enamelSlopes = surfaceSlopes(
  patina.image,
  (pixels, i) => (0.0024 * pixels[i] + 0.00073 * pixels[i + 2]) / 255,
  0.193
);
function makeBeads() {
  const c = texCanvas(512),
    ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 690; i++) {
    let x = rand() * 512,
      y = rand() * 512,
      r = 0.8 + Math.pow(rand(), 2.1) * 4.1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 1.05 + rand() * 0.45);
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, "#dfdfdf");
    g.addColorStop(0.59, "#aaa");
    g.addColorStop(0.83, "#555");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return surfaceSlopes(c, (pixels, i) => (0.0037 * pixels[i]) / 255, 0.24);
}
const beads = makeBeads();
const metalMats = [];
function coat(color, metal = 0.65, rough = 0.34, weather = 1) {
  let m = new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
  m.onBeforeCompile = (s) => {
    s.uniforms.foundrySurface = { value: patina };
    s.uniforms.beadTexture = { value: beads };
    s.uniforms.enamelSlopes = { value: enamelSlopes };
    s.uniforms.foundryTime = clockUniform;
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float wear;
varying vec3 vShopP;varying vec3 vShopN;varying float vWear;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vShopP=(modelMatrix*vec4(position,1.)).xyz;vShopN=normalize(mat3(modelMatrix)*normal);vWear=wear;`
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D foundrySurface,beadTexture,enamelSlopes;uniform float foundryTime;
varying vec3 vShopP;varying vec3 vShopN;varying float vWear;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 w=pow(abs(normalize(vShopN)),vec3(5.)); w/=max(.001,w.x+w.y+w.z);
vec3 p=vShopP*.193;
vec3 grind=texture2D(foundrySurface,p.zy).rgb*w.x+texture2D(foundrySurface,p.xz).rgb*w.y+texture2D(foundrySurface,p.xy).rgb*w.z;
vec3 dropletsX=texture2D(beadTexture,vShopP.zy*.24).rgb;
vec3 dropletsY=texture2D(beadTexture,vShopP.xz*.24).rgb;
vec3 dropletsZ=texture2D(beadTexture,vShopP.xy*.24).rgb;
float waterBead=dot(vec3(dropletsX.r,dropletsY.r,dropletsZ.r),w);
float chipped=clamp(smoothstep(.31,.63,grind.r)*vWear*1.22+grind.g*.48,0.,1.);
float rainRib=texture2D(foundrySurface,vec2((p.x+p.z*.7)*2.1,p.y*.19+foundryTime*.037)).b;
diffuseColor.rgb*=.66+.63*grind.r+.09*rainRib;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.176,.196,.209),chipped*` +
          weather.toFixed(2) +
          `);
float oxide=smoothstep(.59,.74,grind.r)*smoothstep(.57,.72,rainRib);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.19,.089,.043),oxide*.43*` +
          weather.toFixed(2) +
          `);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor=clamp(roughnessFactor+(grind.r-.5)*.31+(grind.b-.5)*.17-.04*rainRib-.04*chipped-waterBead*.105,.13,.83);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
vec2 slopeX=((texture2D(enamelSlopes,p.zy).gb+dropletsX.gb)*255.-256.)/127.;
vec2 slopeY=((texture2D(enamelSlopes,p.xz).gb+dropletsY.gb)*255.-256.)/127.;
vec2 slopeZ=((texture2D(enamelSlopes,p.xy).gb+dropletsZ.gb)*255.-256.)/127.;
vec3 gradient=vec3(0.,slopeX.y,slopeX.x)*w.x
             +vec3(slopeY.x,0.,slopeY.y)*w.y
             +vec3(slopeZ.x,slopeZ.y,0.)*w.z;
vec3 Nworld=normalize(vShopN);
gradient-=Nworld*dot(Nworld,gradient);
normal=normalize(normal-mat3(viewMatrix)*gradient);`
      );
  };
  m.customProgramCacheKey = () => "salt-metal-" + weather.toFixed(2);
  metalMats.push(m);
  return m;
}
function standard(color, metalness = 0.4, roughness = 0.45) {
  return new T.MeshStandardMaterial({ color, metalness, roughness });
}
function emit(color, intensity = 2) {
  return new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), toneMapped: false });
}
const M = {
  navy: coat(0x233c4e, 0.59, 0.35),
  blue: coat(0x3f5c70, 0.56, 0.335),
  light: coat(0x5a7181, 0.59, 0.327),
  mid: coat(0x324b60, 0.59, 0.347),
  pale: coat(0x798a94, 0.75, 0.29),
  dark: coat(0x20292e, 0.77, 0.36, 0.6),
  iron: coat(0x3a4246, 0.82, 0.37, 0.72),
  rubber: coat(0x151c20, 0.18, 0.63, 0.08),
  chrome: coat(0xacc1cb, 0.94, 0.17, 0.24),
  edge: coat(0x647580, 0.91, 0.29, 0.48),
  red: coat(0xb94930, 0.55, 0.34),
  rust: coat(0x884a30, 0.7, 0.44),
  yellow: coat(0xcaa251, 0.67, 0.36),
  bone: coat(0xacb5ae, 0.61, 0.35),
  bronze: coat(0x91704b, 0.81, 0.32),
  hot: emit(0xff9a36, 3.8),
  lamp: emit(0xd1f3ff, 7.4),
  pilot: emit(0xff4b28, 7),
  gold: emit(0xffbc69, 6),
  amber: emit(0xda6323, 1.7),
  dim: emit(0xae461a, 0.95),
  black: standard(0x0d151a, 0.55, 0.43),
};
const GEO = {};
function mesh(p, geo, mat, x = 0, y = 0, z = 0) {
  let o = new T.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  p.add(o);
  return o;
}
function box(p, x, y, z, w, h, d, mat) {
  let o = mesh(p, GEO.box || (GEO.box = new T.BoxGeometry(1, 1, 1)), mat, x, y, z);
  o.scale.set(w, h, d);
  return o;
}
function ell(p, x, y, z, w, h, d, mat, seg = 20) {
  let o = mesh(
    p,
    GEO["s" + seg] || (GEO["s" + seg] = new T.SphereGeometry(1, seg, Math.max(8, seg / 2))),
    mat,
    x,
    y,
    z
  );
  o.scale.set(w, h, d);
  return o;
}
function cyl(p, x, y, z, r1, r2, h, mat, axis = "y", seg = 24) {
  let ratio = r2 / Math.max(0.0001, r1),
    key = "c" + seg + "_" + ratio.toFixed(4);
  let o = mesh(p, GEO[key] || (GEO[key] = new T.CylinderGeometry(1, ratio, 1, seg)), mat, x, y, z);
  o.scale.set(r1, h, r1);
  if (axis === "x") o.rotation.z = -Math.PI / 2;
  if (axis === "z") o.rotation.x = Math.PI / 2;
  return o;
}
function ring(p, x, y, z, r, t, mat, axis = "z", segments = 48) {
  let k = "r" + (t / r).toFixed(4) + "/" + segments;
  const o = mesh(p, GEO[k] || (GEO[k] = new T.TorusGeometry(1, t / r, 8, segments)), mat, x, y, z);
  o.scale.setScalar(r);
  if (axis === "y") o.rotation.x = Math.PI / 2;
  else if (axis === "x") o.rotation.y = Math.PI / 2;
  return o;
}
const Yaxis = V(0, 1, 0);
function rod(p, a, b, r, mat, seg = 12, r2 = r) {
  a = vec(a);
  b = vec(b);
  let dir = b.clone().sub(a),
    o = cyl(p, 0, 0, 0, r2, r, dir.length(), mat, "y", seg);
  o.position.copy(a).lerp(b, 0.5);
  o.quaternion.setFromUnitVectors(Yaxis, dir.normalize());
  return o;
}
function beam(p, a, b, w, d, mat) {
  a = vec(a);
  b = vec(b);
  let dir = b.clone().sub(a),
    o = box(p, 0, 0, 0, w, dir.length(), d, mat);
  o.position.copy(a).lerp(b, 0.5);
  o.quaternion.setFromUnitVectors(Yaxis, dir.normalize());
  return o;
}
function hose(p, points, r, mat = M.rubber) {
  let curve = new T.CatmullRomCurve3(points.map(vec));
  if (r > 0.14 && mat === M.rubber) {
    let len = curve.getLength(),
      count = Math.max(2, Math.round(len / 2.1));
    for (let i = 0; i <= count; i++) {
      let t = 0.06 + (0.88 * i) / count,
        v = curve.getPointAt(t),
        d = curve.getTangentAt(t);
      rod(
        p,
        v.clone().addScaledVector(d, -r * 0.43),
        v.clone().addScaledVector(d, r * 0.43),
        r * 1.18,
        i % 3 === 0 ? M.bronze : M.edge,
        12
      );
    }
  }
  return mesh(p, new T.TubeGeometry(curve, Math.max(10, points.length * 5), r, 8, false), mat);
}
function piston(p, start, end, r, band = M.edge) {
  let a = vec(start),
    b = vec(end);
  const at = (t) => a.clone().lerp(b, t);
  rod(p, a, b, r * 0.64, M.chrome, 20);
  rod(p, a, at(0.59), r, M.iron, 20);
  for (let f of [0.06, 0.46, 0.55]) rod(p, at(f), at(f + 0.044), r * 1.09, band, 20);
  rod(p, at(0.94), b, r * 0.82, M.dark, 16);
}
function axle(p, x, y, z, r, length, axis = "x", accent = M.edge) {
  cyl(p, x, y, z, r * 0.88, r * 0.88, length, M.dark, axis, 32);
  for (let side of [-1, 1]) {
    let along = (pos, rr, hh, mat, seg = 32) =>
      cyl(
        p,
        x + (axis === "x" ? pos * side : 0),
        y,
        z + (axis === "z" ? pos * side : 0),
        rr,
        rr,
        hh,
        mat,
        axis,
        seg
      );
    let l = length * 0.5;
    along(l, r, 0.2, M.rubber);
    along(l + 0.13, r * 0.95, 0.14, accent);
    along(l + 0.21, r * 0.78, 0.12, M.iron);
    along(l + 0.32, r * 0.61, 0.23, M.edge, 12);
    along(l + 0.46, r * 0.31, 0.09, M.dark, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      let yy = y + Math.sin(a) * r * 0.78,
        v = Math.cos(a) * r * 0.78;
      cyl(
        p,
        x + (axis === "x" ? (l + 0.24) * side : v),
        yy,
        z + (axis === "z" ? (l + 0.24) * side : v),
        r * 0.063,
        r * 0.063,
        0.07,
        M.chrome,
        axis,
        6
      );
    }
  }
}
function bolt(p, x, y, z, r = 0.105, axis = "z") {
  cyl(p, x, y, z, r * 1.37, r * 1.37, 0.037, M.dark, axis, 12);
  const off = 0.035;
  cyl(
    p,
    x + (axis === "x" ? off : 0),
    y + (axis === "y" ? off : 0),
    z + (axis === "z" ? off : 0),
    r,
    r,
    0.068,
    M.edge,
    axis,
    6
  );
  if (axis === "z" && r >= 0.105 && rand() > 0.54) {
    let h = r * between(4.8, 9.0);
    decal(p, x + r * 0.08, y - h * 0.44, z + 0.022, r * 2.75, h, rustTrace);
  }
  if (r > 0.105)
    cyl(
      p,
      x + (axis === "x" ? 0.074 : 0),
      y + (axis === "y" ? 0.074 : 0),
      z + (axis === "z" ? 0.074 : 0),
      r * 0.42,
      r * 0.42,
      0.018,
      M.black,
      axis,
      6
    );
}
// Subdivide the flat blank before pressing it so its silhouette and reflections
// follow the same die, including the returns around a punched opening.
function subdivideBlank(blank, divisions) {
  const attrs = blank.attributes;
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  const fields = [
    [attrs.position, positions],
    [attrs.normal, normals],
    [attrs.uv, uvs],
  ];
  for (let tri = 0; tri < attrs.position.count; tri += 3) {
    const rows = [];
    for (let i = 0; i <= divisions; i++) {
      const row = [];
      for (let j = 0; j <= divisions - i; j++) {
        row.push(positions.length / 3);
        const b = i / divisions,
          c = j / divisions,
          a = 1 - b - c;
        for (const [attr, out] of fields) {
          for (let k = 0; k < attr.itemSize; k++) {
            const n = tri * attr.itemSize + k;
            out.push(
              a * attr.array[n] + b * attr.array[n + attr.itemSize] + c * attr.array[n + 2 * attr.itemSize]
            );
          }
        }
      }
      rows.push(row);
    }
    for (let i = 0; i < divisions; i++) {
      for (let j = 0; j < divisions - i; j++) {
        indices.push(rows[i][j], rows[i + 1][j], rows[i][j + 1]);
        if (j < divisions - i - 1) indices.push(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
      }
    }
  }
  const formed = new T.BufferGeometry();
  formed.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  formed.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  formed.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  formed.setIndex(indices);
  return formed;
}
// Pressed metal plates, with a rolled edge and an optionally cambered or canted face.
function plate(p, points, z, depth, mat, bevel = 0.1, bend = null, divisions = 1, openings = []) {
  const shape = new T.Shape(),
    pts = points.map((a) => new T.Vector2(...a));
  const fillet = Math.max(0.018, bevel * 0.92);
  for (let i = 0; i < pts.length; i++) {
    let q = pts[i],
      prev = pts[(i + pts.length - 1) % pts.length],
      next = pts[(i + 1) % pts.length];
    let a = q.clone().lerp(prev, Math.min(0.2, fillet / q.distanceTo(prev))),
      b = q.clone().lerp(next, Math.min(0.2, fillet / q.distanceTo(next)));
    if (i === 0) shape.moveTo(a.x, a.y);
    else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(q.x, q.y, b.x, b.y);
  }
  shape.closePath();
  for (const outline of openings) {
    const hole = new T.Path();
    outline.forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    hole.closePath();
    shape.holes.push(hole);
  }
  let g = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel * 0.76,
    bevelSegments: 2,
    curveSegments: 2,
    steps: 1,
  });
  if (divisions > 1) g = subdivideBlank(g, divisions);
  let pos = g.attributes.position,
    ed = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i),
      y = pos.getY(i),
      zz = pos.getZ(i);
    ed[i] =
      zz > depth + 0.001 && zz < depth + bevel * 0.72 ? 0.84 : zz < -0.001 && zz > -bevel * 0.72 ? 0.65 : 0;
    pos.setZ(i, zz - depth + (bend ? bend(x, y) : 0));
    if (divisions > 1 && bend) {
      const normals = g.attributes.normal;
      const n = V().fromBufferAttribute(normals, i);
      const dx = (bend(x + 0.005, y) - bend(x - 0.005, y)) / 0.01;
      const dy = (bend(x, y + 0.005) - bend(x, y - 0.005)) / 0.01;
      n.set(n.x - n.z * dx, n.y - n.z * dy, n.z).normalize();
      normals.setXYZ(i, n.x, n.y, n.z);
    }
  }
  g.setAttribute("wear", new T.BufferAttribute(ed, 1));
  if (bend && divisions === 1) g.computeVertexNormals();
  return mesh(p, g, mat, 0, 0, z);
}
function mirrored(points, side) {
  return points.map((q) => [q[0] * side, q[1]]);
}
function cutbox(p, x, y, z, w, h, d, mat, c = 0.18, b = 0.075) {
  c = Math.min(c, w * 0.27, h * 0.27);
  let pts = [
    [-w / 2 + c, -h / 2],
    [w / 2 - c, -h / 2],
    [w / 2, -h / 2 + c],
    [w / 2, h / 2 - c],
    [w / 2 - c, h / 2],
    [-w / 2 + c, h / 2],
    [-w / 2, h / 2 - c],
    [-w / 2, -h / 2 + c],
  ];
  let o = plate(p, pts, z + d * 0.5, d, mat, b);
  o.position.x = x;
  o.position.y = y;
  return o;
}
function surfaceGeo(vertices, idx, uvs, wear, smooth = true) {
  let g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(idx);
  if (uvs) g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  if (wear) g.setAttribute("wear", new T.Float32BufferAttribute(wear, 1));
  if (!smooth) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
// Closed sectional tooling. Draft angles and intermediate stations define each stamping.
const section = [
  [-0.68, 1],
  [0.68, 1],
  [0.9, 0.84],
  [1, 0.48],
  [1, -0.48],
  [0.9, -0.84],
  [0.65, -1],
  [-0.65, -1],
  [-0.9, -0.84],
  [-1, -0.48],
  [-1, 0.48],
  [-0.9, 0.84],
];
function loft(p, levels, mat, profile = section) {
  let v = [],
    uv = [],
    idx = [],
    ew = [],
    n = profile.length;
  levels.forEach(([y, w, d, x = 0, z = 0], j) =>
    profile.forEach(([sx, sz], i) => {
      v.push(x + sx * w, y, z + sz * d);
      uv.push(i / n, y * 0.14);
      ew.push(j === 0 || j === levels.length - 1 ? 0.42 : 0);
      if (j) {
        let a = (j - 1) * n + i,
          b = (j - 1) * n + ((i + 1) % n);
        idx.push(a, b, b + n, a, b + n, a + n);
      }
    })
  );
  for (let i = 1; i < n - 1; i++)
    idx.push(
      0,
      i + 1,
      i,
      (levels.length - 1) * n,
      (levels.length - 1) * n + i,
      (levels.length - 1) * n + i + 1
    );
  return mesh(p, surfaceGeo(v, idx, uv, ew), mat);
}
function limb(p, a, b) {
  a = vec(a);
  b = vec(b);
  let g = group(p);
  g.position.copy(a);
  g.quaternion.setFromUnitVectors(V(0, -1, 0), b.clone().sub(a).normalize());
  return g;
}
function louvers(p, x, y, z, w, h, n, angle = 0, back = M.black, blade = M.edge) {
  let g = group(p, x, y, z);
  g.rotation.z = angle;
  cutbox(g, 0, 0, 0, w + 0.23, h + 0.24, 0.17, M.iron, 0.19, 0.045);
  cutbox(g, 0, 0, 0.1, w, h, 0.13, back, 0.13, 0.018);
  for (let i = 0; i < n; i++) {
    let o = box(g, 0, ((i - (n - 1) / 2) * h) / (n + 0.5), 0.23, w * 0.91, (h / (n + 1)) * 0.38, 0.19, blade);
    o.rotation.x = -0.28;
  }
  return g;
}
const decalCache = new Map();
function printMaterial(id, w, h, draw) {
  if (decalCache.has(id)) return decalCache.get(id);
  const c = texCanvas(w, h),
    ctx = c.getContext("2d");
  draw(ctx, w, h);
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < (w * h) / 67; i++) {
    ctx.fillStyle = "rgba(0,0,0," + between(0.22, 0.93) + ")";
    ctx.fillRect(rand() * w, rand() * h, between(0.65, 3.8), between(0.5, 1.7));
  }
  let m = new T.MeshStandardMaterial({
    map: fromCanvas(c, false, true),
    roughness: 0.53,
    metalness: 0.17,
    transparent: true,
    alphaTest: 0.19,
    depthWrite: false,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  decalCache.set(id, m);
  return m;
}
function writing(lines, ink = "#d2d8cd", style = "left") {
  const id = lines.join("|") + ink + style;
  return printMaterial(id, 640, 208, (c, w, h) => {
    c.fillStyle = ink;
    c.textAlign = style;
    c.textBaseline = "middle";
    const xx = style === "center" ? w / 2 : 8;
    if (lines.length === 1) {
      c.font = "900 178px Bahnschrift, Arial";
      c.fillText(lines[0], xx, 110, w - 16);
    } else {
      c.font = "bold 116px Bahnschrift, Arial";
      c.fillText(lines[0], xx, 65, w - 16);
      c.fillRect(8, 134, w - 16, 4);
      c.font = "bold 43px Consolas, monospace";
      c.fillText(lines[1], xx, 174, w - 16);
    }
  });
}
function decal(p, x, y, z, w, h, material, tilt = 0, yaw = 0) {
  let o = mesh(p, new T.PlaneGeometry(w, h), material, x, y, z);
  o.rotation.set(tilt, yaw, 0, "YXZ");
  o.castShadow = false;
  return o;
}
function quad(p, a, b, c, d, mat) {
  let geo = surfaceGeo([...a, ...b, ...c, ...d], [0, 1, 2, 0, 2, 3], [0, 0, 1, 0, 1, 1, 0, 1]);
  return mesh(p, geo, mat);
}
function hazardMat() {
  return printMaterial("caution", 512, 128, (c, w, h) => {
    c.fillStyle = "#c49c4e";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#252b2c";
    for (let x = -100; x < w + 120; x += 108) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 49, 0);
      c.lineTo(x - 21, h);
      c.lineTo(x - 70, h);
      c.fill();
    }
  });
}
const caution = hazardMat();
const glowCanvas = texCanvas(128),
  glowCtx = glowCanvas.getContext("2d");
let gradient = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
[
  [0, 1],
  [0.045, 0.87],
  [0.13, 0.41],
  [0.3, 0.14],
  [0.56, 0.041],
  [1, 0],
].forEach(([s, a]) => gradient.addColorStop(s, "rgba(255,255,255," + a + ")"));
glowCtx.fillStyle = gradient;
glowCtx.fillRect(0, 0, 128, 128);
const glowMap = fromCanvas(glowCanvas),
  glowMats = {};
function halo(p, x, y, z, size, color = 0xb7dfef, opacity = 0.45, stretch = 1) {
  let k = color + "_" + opacity,
    m =
      glowMats[k] ||
      (glowMats[k] = new T.SpriteMaterial({
        map: glowMap,
        color,
        opacity,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
  let s = new T.Sprite(m);
  s.position.set(x, y, z);
  s.scale.set(size * stretch, size, 1);
  p.add(s);
  return s;
}
const reflectorMetal = standard(0xc3cbd0, 0.93, 0.16);
reflectorMetal.side = T.DoubleSide;
const opticalGlass = new T.MeshPhysicalMaterial({
  color: 0xd1dfdf,
  metalness: 0.16,
  roughness: 0.085,
  clearcoat: 1,
  clearcoatRoughness: 0.07,
  transparent: true,
  opacity: 0.19,
  depthWrite: false,
});
function lamp(p, x, y, z, r = 0.22, color = M.lamp, axis = "z") {
  if (r >= 0.2) {
    const fitting = group(p, x, y, z);
    if (axis === "x") fitting.rotation.y = Math.PI / 2;
    if (axis === "y") fitting.rotation.x = -Math.PI / 2;
    cyl(fitting, 0, 0, -0.15, r * 1.24, r * 0.9, 0.26, M.dark, "z");
    const profile = [
      [0.23, -0.025],
      [0.45, 0.005],
      [0.7, 0.063],
      [0.91, 0.131],
      [1.01, 0.159],
    ];
    const bowl = new T.LatheGeometry(
      profile.map(([radius, depth]) => new T.Vector2(r * radius, depth)),
      32
    );
    mesh(fitting, bowl, reflectorMetal).rotation.x = Math.PI / 2;
    cyl(fitting, 0, 0, -0.015, r * 0.43, r * 0.3, 0.1, color, "z", 24);
    ring(fitting, 0, 0, 0.157, r * 1.08, r * 0.115, M.iron, "z", 32);
    ring(fitting, 0, 0, 0.174, r * 0.99, r * 0.038, M.chrome, "z", 32);
    ell(fitting, 0, 0, 0.167, r * 0.98, r * 0.98, r * 0.15, opticalGlass, 28).castShadow = false;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (0.25 + i / 2);
      cyl(
        fitting,
        Math.cos(a) * r * 1.09,
        Math.sin(a) * r * 1.09,
        0.18,
        r * 0.058,
        r * 0.058,
        0.045,
        M.edge,
        "z",
        6
      );
    }
    return;
  }
  cyl(p, x, y, z, r * 1.32, r * 1.4, 0.28, M.dark, axis);
  let dz = axis === "z" ? 0.16 : 0,
    dy = axis === "y" ? 0.16 : 0,
    dx = axis === "x" ? 0.16 : 0;
  cyl(p, x + dx, y + dy, z + dz, r, r * 0.97, 0.06, color, axis, 20);
  ring(p, x + dx, y + dy, z + dz, r * 1.05, r * 0.101, M.chrome, axis, 20);
}
// Batch rigid assemblies in their own reference frame, retaining independent moving parts.
const collisionSolids = [];
function retainSolid(o) {
  const g = o.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const scale = V().setFromMatrixScale(o.matrixWorld),
    size = g.boundingBox.getSize(V()).multiply(scale);
  if (
    Math.min(size.x, size.y, size.z) < 0.27 ||
    Math.max(size.x, size.y, size.z) < 2.35 ||
    size.x * size.y * size.z < 1.12
  )
    return;
  const inverse = o.matrixWorld.clone().invert(),
    local = g.boundingBox.clone();
  local.expandByVector(V(0.38 / scale.x, 0.38 / scale.y, 0.38 / scale.z));
  collisionSolids.push({
    local,
    inverse,
    linear: new T.Matrix3().setFromMatrix4(inverse),
    bounds: local.clone().applyMatrix4(o.matrixWorld),
  });
}
function bake(root) {
  root.updateWorldMatrix(true, true);
  let inv = root.matrixWorld.clone().invert(),
    buckets = new Map(),
    remove = [];
  function walk(node) {
    if (node !== root && node.userData.moving) return;
    if (node.isMesh && !node.isSprite && node.geometry && !Array.isArray(node.material)) {
      if (root.userData.collision && node.material.depthWrite) retainSolid(node);
      const key = node.material.uuid + "_" + (node.castShadow ? 1 : 0);
      if (!buckets.has(key))
        buckets.set(key, { mat: node.material, parts: [], verts: 0, indices: 0, cast: node.castShadow });
      let b = buckets.get(key),
        g = node.geometry;
      b.parts.push([g, new T.Matrix4().multiplyMatrices(inv, node.matrixWorld)]);
      b.verts += g.attributes.position.count;
      b.indices += g.index ? g.index.count : g.attributes.position.count;
      remove.push(node);
    } else for (let ch of node.children) walk(ch);
  }
  walk(root);
  const P = V(),
    N = V(),
    nm = new T.Matrix3();
  for (const b of buckets.values()) {
    let ps = new Float32Array(b.verts * 3),
      ns = new Float32Array(b.verts * 3),
      us = new Float32Array(b.verts * 2),
      es = new Float32Array(b.verts),
      ix = new (b.verts > 65535 ? Uint32Array : Uint16Array)(b.indices),
      base = 0,
      ii = 0;
    for (const [g, m] of b.parts) {
      let { position, normal, uv, wear } = g.attributes;
      nm.getNormalMatrix(m);
      for (let i = 0; i < position.count; i++) {
        P.fromBufferAttribute(position, i)
          .applyMatrix4(m)
          .toArray(ps, (base + i) * 3);
        if (normal)
          N.fromBufferAttribute(normal, i)
            .applyMatrix3(nm)
            .normalize()
            .toArray(ns, (base + i) * 3);
        if (uv) {
          us[(base + i) * 2] = uv.getX(i);
          us[(base + i) * 2 + 1] = uv.getY(i);
        }
        if (wear) es[base + i] = wear.getX(i);
      }
      const count = g.index ? g.index.count : position.count;
      for (let i = 0; i < count; i++) ix[ii++] = base + (g.index ? g.index.getX(i) : i);
      base += position.count;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(ps, 3));
    g.setAttribute("normal", new T.BufferAttribute(ns, 3));
    g.setAttribute("uv", new T.BufferAttribute(us, 2));
    g.setAttribute("wear", new T.BufferAttribute(es, 1));
    g.setIndex(new T.BufferAttribute(ix, 1));
    g.computeBoundingSphere();
    const o = new T.Mesh(g, b.mat);
    o.castShadow = b.cast;
    o.receiveShadow = true;
    root.add(o);
  }
  for (const o of remove) o.removeFromParent();
  function prune(n) {
    for (const o of n.children.slice())
      if (o.isGroup && !o.userData.moving) {
        prune(o);
        if (!o.children.length) o.removeFromParent();
      }
  }
  prune(root);
}

// Fine runoff below exposed fasteners is a local stain, separate from tiled paint grain.
const stainCanvas = texCanvas(96, 256),
  stainCtx = stainCanvas.getContext("2d"),
  stainImage = stainCtx.createImageData(96, 256);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 96; x++) {
    let v = y / 255,
      u = (x - 48) / 48,
      w = 0.43 * (1 - v) + 0.035,
      t = u + 0.09 * Math.sin(v * 8.7) + 0.045 * n8(u, v);
    let a =
      Math.exp((-t * t) / (w * w)) * (1 - Math.pow(v, 0.68)) * 0.61 +
      Math.exp(-((u + 0.39 + v * 0.18) ** 2) / 0.006) * Math.max(0, 1 - v * 1.71) * 0.33;
    a *= n21(u, v) * 0.58 + 0.42;
    let i = (y * 96 + x) * 4;
    stainImage.data[i] = 96 + 23 * a;
    stainImage.data[i + 1] = 60 + 10 * a;
    stainImage.data[i + 2] = 38;
    stainImage.data[i + 3] = a * 206;
  }
stainCtx.putImageData(stainImage, 0, 0);
const rustTrace = new T.MeshStandardMaterial({
  map: fromCanvas(stainCanvas, false, true),
  transparent: true,
  opacity: 0.58,
  depthWrite: false,
  roughness: 0.47,
  metalness: 0.19,
  polygonOffset: true,
  polygonOffsetFactor: -1,
});
