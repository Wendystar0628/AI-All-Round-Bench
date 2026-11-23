// ---------- toon materials ----------
const GRAD = { tex: null };

function initMaterials() {
  GRAD.tex = TEX.gradient;
}

function toon(color, opts) {
  opts = opts || {};
  const m = new THREE.MeshToonMaterial({
    color: color,
    gradientMap: GRAD.tex,
    map: opts.map || null,
    emissive: opts.emissive === undefined ? 0x000000 : opts.emissive,
    emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
    transparent: !!opts.transparent,
    opacity: opts.opacity === undefined ? 1 : opts.opacity,
    side: opts.side || THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
    depthWrite: opts.depthWrite === undefined ? true : opts.depthWrite
  });
  const rim = opts.rim === undefined ? 0.16 : opts.rim;
  const spec = opts.spec === undefined ? 0.10 : opts.spec;
  const shine = opts.shine === undefined ? 26 : opts.shine;
  const rimColor = new THREE.Color(opts.rimColor === undefined ? 0xdff4ff : opts.rimColor);
  const lightDir = new THREE.Vector3(-0.38, 0.66, 0.50).normalize();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: rim };
    shader.uniforms.uSpecStrength = { value: spec };
    shader.uniforms.uShine = { value: shine };
    shader.uniforms.uLightDir = { value: lightDir };
    shader.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uSpecStrength;\nuniform float uShine;\nuniform vec3 uLightDir;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      `vec3 Vv = normalize( vViewPosition );
       vec3 Nn = normalize( normal );
       float fres = pow( 1.0 - clamp( dot( Nn, Vv ), 0.0, 1.0 ), 3.0 );
       outgoingLight += uRimColor * fres * uRimStrength;
       vec3 Lv = normalize( ( viewMatrix * vec4( uLightDir, 0.0 ) ).xyz );
       vec3 Hv = normalize( Lv + Vv );
       float sp = pow( max( dot( Nn, Hv ), 0.0 ), uShine ) * uSpecStrength;
       outgoingLight += vec3( 1.0, 0.985, 0.93 ) * sp;
       gl_FragColor = vec4( outgoingLight, diffuseColor.a );`
    );
    m.userData.shader = shader;
  };
  m.customProgramCacheKey = () => 'toon' + rim.toFixed(2) + spec.toFixed(2) + shine;
  return m;
}

function toonMap(color, map, opts) {
  opts = opts || {};
  const m = toon(color, Object.assign({}, opts, { map: map }));
  return m;
}

function glassMat(tint, opacity) {
  return new THREE.MeshPhongMaterial({
    color: tint === undefined ? 0xcdeef2 : tint,
    transparent: true,
    opacity: opacity === undefined ? 0.22 : opacity,
    shininess: 110,
    specular: 0xffffff,
    side: THREE.DoubleSide,
    depthWrite: false,
    reflectivity: 0.6
  });
}

function glowMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color: color, transparent: true, opacity: opacity === undefined ? 1 : opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
}

function additiveSprite(tex, color, size, opacity) {
  const m = new THREE.SpriteMaterial({
    map: tex, color: color, transparent: true, opacity: opacity === undefined ? 1 : opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

const MAT = {};
function initSharedMaterials() {
  MAT.concrete = toon(0xcfd6d6, { map: TEX.concrete, spec: 0.05, rim: 0.10 });
  MAT.concreteDark = toon(0xb3bdbd, { map: TEX.concrete, spec: 0.04, rim: 0.08 });
  MAT.ground = toon(0xcdd5d3, { map: TEX.wetGround, spec: 0.32, shine: 44, rim: 0.10 });
  MAT.wall = toon(0xcbd3d2, { map: TEX.wall, spec: 0.06, rim: 0.08 });
  MAT.wood = toon(0xc39b6c, { map: TEX.wood, spec: 0.05, rim: 0.06 });
  MAT.woodDark = toon(0x8a6b4a, { map: TEX.wood, spec: 0.04, rim: 0.05 });
  MAT.roof = toon(0x93a5b2, { map: TEX.roof, spec: 0.12, shine: 30, rim: 0.10 });
  MAT.metal = toon(0x6c7c80, { spec: 0.35, shine: 60, rim: 0.14 });
  MAT.darkMetal = toon(0x3b474c, { spec: 0.28, shine: 50, rim: 0.10 });
  MAT.rust = toon(0x9a6547, { spec: 0.05, rim: 0.06 });
  MAT.black = toon(0x2b3438, { spec: 0.18, shine: 30, rim: 0.08 });
  MAT.white = toon(0xf2f3ec, { spec: 0.20, shine: 40, rim: 0.14 });
  MAT.whiteDirty = toon(0xe4e4d9, { spec: 0.12, shine: 30, rim: 0.10 });
  MAT.rope = toon(0xbfa377, { spec: 0.02, rim: 0.05 });
  MAT.ropeDark = toon(0x8d7a58, { spec: 0.02, rim: 0.04 });
  MAT.orange = toon(0xe8843f, { spec: 0.18, shine: 30, rim: 0.10 });
  MAT.red = toon(0xc9584c, { spec: 0.16, shine: 30, rim: 0.10 });
  MAT.yellow = toon(0xe8c257, { spec: 0.14, shine: 30, rim: 0.10 });
  MAT.blue = toon(0x5d8fa6, { spec: 0.12, shine: 30, rim: 0.10 });
  MAT.green = toon(0x6f9f78, { spec: 0.06, rim: 0.10 });
  MAT.darkGreen = toon(0x4f7a68, { spec: 0.06, rim: 0.08 });
  MAT.glass = glassMat(0xcdeef2, 0.20);
  MAT.glassDark = glassMat(0x9fc4c8, 0.30);
  MAT.tide = new THREE.MeshBasicMaterial({
    map: TEX.tide, transparent: true, depthWrite: false, opacity: 0.95, side: THREE.DoubleSide
  });
  MAT.trunk = toon(0x7d6248, { spec: 0.03, rim: 0.05 });
  MAT.leaf = toon(0x6fa77a, { spec: 0.05, rim: 0.12, flat: true });
  MAT.leafDark = toon(0x548a68, { spec: 0.04, rim: 0.10, flat: true });
  MAT.sand = toon(0xc8c2a6, { map: TEX.sand, spec: 0.02, rim: 0.05 });
  MAT.underwater = toon(0x7fa89c, { spec: 0.05, rim: 0.06, emissive: 0x16302e, emissiveIntensity: 0.35 });
  MAT.foam = new THREE.MeshBasicMaterial({
    map: TEX.foam, transparent: true, opacity: 0.75, depthWrite: false, color: 0xffffff, fog: true
  });
  MAT.net = toon(0x6b7d72, { spec: 0.02, rim: 0.06 });
  MAT.fishBox = toon(0xe8ece6, { spec: 0.15, shine: 40, rim: 0.10 });
  MAT.fishBoxBlue = toon(0x5f8fa8, { spec: 0.15, shine: 40, rim: 0.10 });
}

// text label plane
function labelPlane(tex, w, h, opts) {
  opts = opts || {};
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: opts.transparent !== false, opacity: opts.opacity === undefined ? 1 : opts.opacity,
    side: THREE.DoubleSide, depthWrite: opts.depthWrite !== false, fog: true,
    color: opts.color === undefined ? 0xffffff : opts.color
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
