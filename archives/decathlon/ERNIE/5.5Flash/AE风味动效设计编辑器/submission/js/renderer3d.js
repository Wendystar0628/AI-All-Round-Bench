/* AE Forge Editor - WebGL2 3D renderer: extruded geometry, PBR-ish metal, shadows, DOF, motion blur, particles */
(function (global) {
  'use strict';
  const M4 = AEMath.M4;
  const A = global.AEAnim;
  const G = global.AEGeom;
  const { clamp } = AEMath;

  const R3 = {
    canvas: null, gl: null, W: 0, H: 0,
    programs: {}, fbos: {}, buffers: {},
    meshCache: new Map(), glMeshCache: new WeakMap(),
    vaoEmpty: null, quadVBO: null,
    ready: false,
    sampleScale: 1,
  };

  const VS_SCENE = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec4 uImpacts[4];
uniform vec3 uImpactDir;
uniform float uDent[4];
out vec3 vWorld;
out vec3 vNormal;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  for(int i=0;i<4;i++){
    float dn = uDent[i];
    if(abs(dn) > 0.0001){
      float d = distance(wp.xyz, uImpacts[i].xyz);
      float f = smoothstep(uImpacts[i].w, 0.0, d);
      wp.xyz += uImpactDir * (dn * f);
    }
  }
  vWorld = wp.xyz;
  vNormal = normalize(uNormalMat * aNrm);
  gl_Position = uProj * uView * wp;
}`;

  const FS_SCENE = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uCamPos;
uniform vec3 uColor;
uniform float uMetal;
uniform float uRough;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uFade;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uPointPos;
uniform vec3 uPointColor;
uniform float uPointIntensity;
uniform sampler2D uShadowMap;
uniform mat4 uLightVP;
uniform float uShadowEnabled;
uniform float uShadowTexel;
uniform float uGrid;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uEnvIntensity;
out vec4 outColor;

float shadowFactor(vec3 N){
  if(uShadowEnabled < 0.5) return 1.0;
  vec4 lp = uLightVP * vec4(vWorld + N*2.0, 1.0);
  vec3 pc = lp.xyz / lp.w * 0.5 + 0.5;
  if(pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0 || pc.z > 1.0) return 1.0;
  float bias = 0.0022;
  float s = 0.0;
  for(int x=-1;x<=1;x++){
    for(int y=-1;y<=1;y++){
      float d = texture(uShadowMap, pc.xy + vec2(float(x), float(y))*uShadowTexel).r;
      s += (pc.z - bias > d) ? 0.0 : 1.0;
    }
  }
  return s / 9.0;
}
vec3 envColor(vec3 R){
  float y = clamp(R.y*0.5+0.5, 0.0, 1.0);
  vec3 sky = mix(vec3(0.010,0.012,0.018), vec3(0.055,0.07,0.10), y);
  float band = exp(-pow((R.y-0.18)*2.6, 2.0));
  sky += vec3(1.0,0.58,0.28) * band * 0.30;
  float fl = smoothstep(0.0, -0.6, R.y);
  sky = mix(sky, vec3(0.012,0.012,0.015), fl*0.8);
  return sky;
}
void main(){
  vec3 N = normalize(vNormal);
  if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorld);
  float sh = shadowFactor(N);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.001);
  vec3 Hv = normalize(L + V);
  float ndh = max(dot(N, Hv), 0.0);
  float rough = clamp(uRough, 0.05, 1.0);
  float shin = mix(10.0, 220.0, pow(1.0 - rough, 2.0));
  float spec = pow(ndh, shin) * (0.4 + 0.6*(1.0-rough));
  float fres = 0.04 + 0.96*pow(1.0 - ndv, 5.0);
  vec3 F0 = mix(vec3(0.04), uColor, uMetal);
  vec3 diffuse = uColor * (1.0 - uMetal*0.85);
  vec3 col = diffuse * uLightColor * uLightIntensity * ndl * sh;
  col += F0 * uLightColor * uLightIntensity * spec * ndl * sh * 0.8;
  vec3 PL = uPointPos - vWorld;
  float pd = max(length(PL), 1.0);
  vec3 Ld = PL / pd;
  float pnl = max(dot(N, Ld), 0.0);
  float atten = 1.0 / (1.0 + pd*pd*0.000004);
  col += uColor*(1.0-uMetal*0.7) * uPointColor * uPointIntensity * pnl * atten;
  col += F0 * uPointColor * uPointIntensity * pow(max(dot(N, normalize(Ld+V)),0.0), shin) * atten * 0.6;
  vec3 env = envColor(reflect(-V, N));
  col += env * (0.25 + 0.55*uMetal) * uEnvIntensity;
  col += env * F0 * (0.4 + 0.6*fres) * uEnvIntensity;
  col += uEmissive;
  if(uGrid > 0.5){
    vec2 coord = vWorld.xz / 80.0;
    vec2 g = abs(fract(coord - 0.5) - 0.5) / max(fwidth(coord), vec2(0.0001));
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float fade = exp(-length(vWorld.xz)*0.0011);
    col += vec3(0.14,0.17,0.24) * line * fade;
  }
  float dist = length(uCamPos - vWorld);
  col = mix(col, uFogColor, clamp(dist*uFogDensity, 0.0, 0.55));
  col = col / (col + vec3(1.0));
  col = pow(max(col, vec3(0.0)), vec3(1.0/2.2));
  outColor = vec4(col * uFade, uOpacity * uFade);
}`;

  const VS_SHADOW = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;
  const FS_SHADOW = `#version 300 es
precision highp float;
void main(){}`;

  const VS_PART = `#version 300 es
layout(location=0) in vec3 aCenter;
layout(location=1) in vec2 aCorner;
layout(location=2) in vec3 aColor;
layout(location=3) in float aSize;
layout(location=4) in float aAlpha;
uniform mat4 uProj;
uniform mat4 uView;
out vec3 vColor;
out float vAlpha;
out vec2 vUv;
void main(){
  vec4 cp = uView * vec4(aCenter, 1.0);
  cp.xy += aCorner * aSize;
  gl_Position = uProj * cp;
  vColor = aColor; vAlpha = aAlpha; vUv = aCorner;
}`;
  const FS_PART = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
in vec2 vUv;
out vec4 outColor;
void main(){
  float d = length(vUv);
  if(d > 1.0) discard;
  float a = pow(1.0 - d, 2.2);
  outColor = vec4(vColor * vAlpha * a, vAlpha * a);
}`;

  const VS_LINE = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
uniform mat4 uProj;
uniform mat4 uView;
out vec4 vColor;
void main(){ vColor = aColor; gl_Position = uProj * uView * vec4(aPos,1.0); }`;
  const FS_LINE = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main(){ outColor = vColor; }`;

  const VS_QUAD = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS_COPY = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main(){ outColor = texture(uTex, vUv); }`;

  const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 outColor;
void main(){
  vec4 c = texture(uTex, vUv);
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(uThreshold, uThreshold + 0.5, l);
  outColor = vec4(c.rgb * k, c.a * k);
}`;

  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 outColor;
void main(){
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for(int i=-6;i<=6;i++){
    float w = exp(-float(i*i)/18.0);
    sum += texture(uTex, vUv + uDir*float(i)) * w;
    wsum += w;
  }
  outColor = sum / wsum;
}`;

  const FS_FINAL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uDof;
uniform sampler2D uBloom;
uniform sampler2D uDepth;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uExposure;
uniform float uCocScale;
uniform float uFocus;
uniform float uAperture;
uniform float uNear;
uniform float uFar;
out vec4 outColor;
float linDepth(float d){
  float z = d*2.0 - 1.0;
  return (2.0*uNear*uFar)/(uFar + uNear - z*(uFar-uNear));
}
void main(){
  vec4 scene = texture(uScene, vUv);
  vec3 sharp = scene.rgb;
  vec3 blur = texture(uDof, vUv).rgb;
  float z = linDepth(texture(uDepth, vUv).r);
  float coc = clamp(abs(z - uFocus)/max(uFocus, 1.0) * uAperture * uCocScale, 0.0, 1.0);
  vec3 col = mix(sharp, blur, coc);
  vec4 bloom = texture(uBloom, vUv);
  col += bloom.rgb * uBloomStrength;
  col *= uExposure;
  float vig = smoothstep(1.15, 0.35, length(vUv - 0.5)*1.5);
  col *= mix(1.0, vig, uVignette);
  float g = fract(sin(dot(vUv*uRes + uTime*37.0, vec2(12.9898,78.233)))*43758.5453);
  col += (g - 0.5)*0.014;
  float a = clamp(max(scene.a, bloom.a*0.85), 0.0, 1.0);
  outColor = vec4(col, a);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s), src);
      throw new Error('shader compile failed');
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      throw new Error('program link failed');
    }
    return p;
  }
  function uniforms(gl, p) {
    const map = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      map[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return map;
  }

  R3.init = function () {
    if (this.ready) return true;
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      preserveDrawingBuffer: true, depth: true, stencil: false,
    });
    if (!gl) return false;
    this.canvas = cv; this.gl = gl;
    this.hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    this.hasLinearFloat = !!gl.getExtension('OES_texture_float_linear');
    this.programs.scene = program(gl, VS_SCENE, FS_SCENE);
    this.programs.shadow = program(gl, VS_SHADOW, FS_SHADOW);
    this.programs.part = program(gl, VS_PART, FS_PART);
    this.programs.line = program(gl, VS_LINE, FS_LINE);
    this.programs.quad = program(gl, VS_QUAD, FS_COPY);
    this.programs.bright = program(gl, VS_QUAD, FS_BRIGHT);
    this.programs.blur = program(gl, VS_QUAD, FS_BLUR);
    this.programs.final = program(gl, VS_QUAD, FS_FINAL);
    this.u = {};
    for (const k in this.programs) this.u[k] = uniforms(gl, this.programs[k]);
    // fullscreen quad
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quadVBO = quad;
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.ready = true;
    return true;
  };

  function makeTex(w, h, internal, format, type, filter) {
    const gl = R3.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  R3.resize = function (w, h) {
    if (!this.ready) this.init();
    if (!this.ready) return;
    if (this.W === w && this.H === h && this.fbos.scene) return;
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl;
    const colorType = this.hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const colorInternal = this.hasFloat ? gl.RGBA16F : gl.RGBA8;
    const hw = Math.max(2, Math.floor(w / 2)), hh = Math.max(2, Math.floor(h / 2));
    const destroy = (fb) => { if (!fb) return; gl.deleteFramebuffer(fb.fbo); gl.deleteTexture(fb.tex); if (fb.depth) gl.deleteTexture(fb.depth); };
    for (const k in this.fbos) destroy(this.fbos[k]);
    this.fbos = {};
    const mk = (w2, h2, withDepth) => {
      const tex = makeTex(w2, h2, colorInternal, gl.RGBA, colorType);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      let depth = null;
      if (withDepth) {
        depth = makeTex(w2, h2, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
      }
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo, tex, depth, w: w2, h: h2, ok };
    };
    this.fbos.scene = mk(w, h, true);
    this.fbos.accum = mk(w, h, false);
    this.fbos.dofA = mk(hw, hh, false);
    this.fbos.dofB = mk(hw, hh, false);
    this.fbos.bloomA = mk(hw, hh, false);
    this.fbos.bloomB = mk(hw, hh, false);
    // shadow map
    const sw = 2048, sh = 2048;
    const stex = makeTex(sw, sh, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    const sfbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, sfbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, stex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbos.shadow = { fbo: sfbo, tex: stex, w: sw, h: sh, depth: null, shadow: true };
  };

  function mat4() { return M4.create(); }

  // ---------- geometry ----------
  function buildLayerGeometry(comp, layer, time) {
    const key = layer.id + '|' + (global.AEProject.geometryRevision || 0) + '|' +
      ((layer.animator && layer.animator.enabled) ? time.toFixed(2) : '0') + '|' + (layer.geometryDepth || 0) + '|' +
      (layer.is3D ? '3' : '2');
    if (R3.meshCache.has(key)) return R3.meshCache.get(key);
    let mesh = null;
    try {
      if (layer.type === 'text') {
        const contours = global.AEText.textContours(layer, time);
        const norm = G.normalizeContours(contours);
        mesh = G.extrudeContours(norm, layer.geometryDepth || 40, {});
      } else if (layer.type === 'shape') {
        const contours = global.AE2D.buildShapeContours(layer);
        const norm = G.normalizeContours(contours);
        mesh = G.extrudeContours(norm, layer.geometryDepth || 40, {});
      } else if (layer.type === 'geo3d') {
        const g = layer.geo || {};
        if (g.kind === 'box') mesh = G.boxMesh(g.w || 200, g.h || 200, g.d || 80);
        else if (g.kind === 'cylinder') mesh = G.cylinderMesh(g.r || 60, g.h || 200, g.seg || 24, true);
        else if (g.kind === 'plane') mesh = G.planeMesh(g.w || 2000, g.h || 2000);
        else if (g.kind === 'custom') {
          if (g.contours) {
            const norm = G.normalizeContours(g.contours);
            mesh = G.extrudeContours(norm, g.depth || 40, {});
          } else if (g.parts && g.parts.length) {
            const meshes = [];
            for (const pt of g.parts) {
              let m = null;
              if (pt.kind === 'box') m = G.boxMesh(pt.w || 100, pt.h || 100, pt.d || 100);
              else if (pt.kind === 'cylinder') m = G.cylinderMesh(pt.r || 40, pt.h || 100, pt.seg || 24, true);
              else if (pt.kind === 'plane') m = G.planeMesh(pt.w || 100, pt.h || 100);
              else if (pt.kind === 'sphere') m = G.sphereMesh(pt.r || 40, pt.seg || 20);
              if (m) {
                const mat = M4.compose([pt.x || 0, pt.y || 0, pt.z || 0], [pt.rx || 0, pt.ry || 0, pt.rz || 0], [1, 1, 1]);
                meshes.push(G.transformMesh(m, mat));
              }
            }
            mesh = G.mergeMeshes(meshes);
          }
        }
      }
    } catch (e) { console.warn('geometry failed', layer.name, e); }
    if (mesh && mesh.count) {
      R3.meshCache.set(key, mesh);
      if (R3.meshCache.size > 120) {
        const first = R3.meshCache.keys().next().value;
        R3.meshCache.delete(first);
      }
    }
    return mesh;
  }

  R3.getLayerMesh = function (comp, layer, time, world) {
    const mesh = buildLayerGeometry(comp, layer, time);
    if (!mesh) return null;
    if (!world) return mesh;
    const wm = global.AEProject.worldMatrix(comp, layer, time);
    return G.transformMesh(mesh, wm);
  };

  function uploadMesh(mesh) {
    const gl = R3.gl;
    let gm = R3.glMeshCache.get(mesh);
    if (gm) return gm;
    gm = { vao: gl.createVertexArray(), pos: gl.createBuffer(), nrm: gl.createBuffer(), count: mesh.count };
    gl.bindVertexArray(gm.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gm.pos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gm.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    R3.glMeshCache.set(mesh, gm);
    return gm;
  }

  // ---------- scene assembly ----------
  function matVal(m, key, time, comp, layer) {
    const v = m ? m[key] : undefined;
    if (v && typeof v === 'object' && 'value' in v) {
      return A.evalProp(v, time, global.AEProject.makeCtx(comp, layer, time));
    }
    return v;
  }

  function collectObjects(comp, layers, time) {
    const objs = [];
    for (const layer of layers) {
      if (!layer.enabled) continue;
      const ctx = global.AEProject.makeCtx(comp, layer, time);
      const mesh = buildLayerGeometry(comp, layer, time);
      if (!mesh || !mesh.count) continue;
      const wm = global.AEProject.worldMatrix(comp, layer, time);
      const m = layer.material || {};
      const opacity = (matVal(m, 'opacity', time, comp, layer) || 100) / 100 * global.AEProject.layerOpacity(layer, time);
      const emissiveI = matVal(m, 'emissiveIntensity', time, comp, layer) || 0;
      const em = m.emissive || '#ff6a1e';
      const er = AEMath.hexToRgb(em);
      objs.push({
        layer, mesh, wm,
        color: AEMath.hexToRgb(m.color || '#9aa0a8'),
        metal: matVal(m, 'metalness', time, comp, layer) || 0,
        rough: matVal(m, 'roughness', time, comp, layer) || 0.4,
        emissive: [er[0] * emissiveI, er[1] * emissiveI, er[2] * emissiveI],
        opacity: clamp(opacity, 0, 1),
        grid: m.grid ? 1 : 0,
        env: m.env === undefined ? 1 : m.env,
        castShadow: m.castShadow !== false,
        receiveShadow: m.receiveShadow !== false,
        layerId: layer.id,
        dents: layer.dents || null,
        depth: mesh.depth || 0,
      });
    }
    return objs;
  }

  function findCamera(comp, layers, time) {
    let camLayer = null;
    for (const l of layers) if (l.type === 'camera' && l.enabled) { camLayer = l; break; }
    let eye, target, fov = 40, focus = 1200, aperture = 0;
    if (camLayer) {
      const ctx = global.AEProject.makeCtx(comp, camLayer, time);
      const wm = global.AEProject.worldMatrix(comp, camLayer, time);
      eye = [wm[12], wm[13], wm[14]];
      const tg = A.evalProp(camLayer.camera.target, time, ctx);
      target = [tg[0] || 0, tg[1] || 0, tg[2] || 0];
      fov = A.evalProp(camLayer.camera.fov, time, ctx) || 45;
      focus = A.evalProp(camLayer.camera.focus, time, ctx) || 1200;
      aperture = A.evalProp(camLayer.camera.aperture, time, ctx) || 0;
    } else {
      eye = [0, 0, comp.height * 1.02];
      target = [0, 0, 0];
      focus = comp.height * 1.02;
    }
    return { eye, target, fov, focus, aperture, layer: camLayer };
  }

  function findLights(comp, layers, time) {
    const lights = [];
    for (const l of layers) {
      if (l.type !== 'light' || !l.enabled) continue;
      const ctx = global.AEProject.makeCtx(comp, l, time);
      const wm = global.AEProject.worldMatrix(comp, l, time);
      const pos = [wm[12], wm[13], wm[14]];
      const col = AEMath.hexToRgb(l.light.color || '#ffffff');
      const inten = matVal(l.light, 'intensity', time, comp, l) || 1;
      if (l.light.kind === 'point') {
        lights.push({ type: 'point', pos, color: col, intensity: inten, layer: l });
      } else {
        const target = l.light.target ? A.evalProp(l.light.target, time, ctx) : [0, 0, 0];
        let dx = (target[0] || 0) - pos[0], dy = (target[1] || 0) - pos[1], dz = (target[2] || 0) - pos[2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl; dy /= dl; dz /= dl;
        lights.push({ type: 'parallel', dir: [dx, dy, dz], color: col, intensity: inten, layer: l, shadow: l.light.shadow !== false });
      }
    }
    return lights;
  }

  // ---------- render ----------
  R3.readScene = function (x, y) {
    const gl = this.gl;
    if (!this.fbos.scene) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.scene.fbo);
    const px = new Float32Array(4);
    gl.readPixels(Math.max(0, Math.min(this.W - 1, x | 0)), Math.max(0, Math.min(this.H - 1, (this.H - y) | 0)), 1, 1, gl.RGBA, gl.FLOAT, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Array.from(px).map(v => +v.toFixed(3));
  };

  R3.renderGroup = function (comp, layers, time, W, H, opts) {
    opts = opts || {};
    if (!this.ready && !this.init()) return null;
    const gl = this.gl;
    if (this.W !== W || this.H !== H) this.resize(W, H);
    const cam = findCamera(comp, comp.layers, time);
    const lights = findLights(comp, comp.layers, time);
    const dirLight = lights.find(l => l.type === 'parallel' && l.shadow) || lights.find(l => l.type === 'parallel');
    const pointLight = lights.find(l => l.type === 'point');
    const objs = collectObjects(comp, layers, time);
    const particles = [];
    for (const l of layers) {
      if (l.type === 'particle' && l.enabled) {
        const data = global.AEParticles.buildRenderData(comp, l, time, opts);
        if (data && (data.quads.length || data.lines.length)) particles.push({ layer: l, data });
      }
    }
    if (!objs.length && !particles.length) return null;

    const aspect = W / H;
    const proj = M4.perspective(mat4(), cam.fov * Math.PI / 180, aspect, 5, 20000);
    const view = M4.lookAt(mat4(), cam.eye, cam.target, [0, 1, 0]);

    // shadow matrix
    let lightVP = mat4(), lightDir = [0.4, 0.8, 0.5], lightColor = [1, 1, 1], lightIntensity = 0;
    if (dirLight) {
      lightDir = [-dirLight.dir[0], -dirLight.dir[1], -dirLight.dir[2]];
      lightColor = dirLight.color; lightIntensity = dirLight.intensity;
      const center = [0, 0, 0];
      const eye = [center[0] + lightDir[0] * 2600, center[1] + lightDir[1] * 2600, center[2] + lightDir[2] * 2600];
      const lv = M4.lookAt(mat4(), eye, center, [0, 1, 0]);
      const lo = M4.ortho(mat4(), -1500, 1500, -1500, 1500, 1, 6000);
      lightVP = M4.multiply(mat4(), lo, lv);
    }
    const pointPos = pointLight ? pointLight.pos : [0, 0, 1000];
    const pointColor = pointLight ? pointLight.color : [0, 0, 0];
    const pointIntensity = pointLight ? pointLight.intensity : 0;

    const motion = comp.motionBlur || {};
    const shutter = motion.enabled ? (motion.shutter || 180) / 360 : 0;
    const samples = shutter > 0 ? clamp(opts.motionSamples || 4, 1, 8) : 1;

    // bind scene fbo
    const scene = this.fbos.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    const chk = (stage) => { const e = gl.getError(); if (e) { console.warn('GLERR', stage, e); R3.lastErr = [stage, e]; } };
    // shadow pass
    const shadow = this.fbos.shadow;
    if (dirLight) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.fbo);
      gl.viewport(0, 0, shadow.w, shadow.h);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.programs.shadow);
      const us = this.u.shadow;
      gl.uniformMatrix4fv(us.uLightVP, false, lightVP);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 4);
      for (const o of objs) {
        if (!o.castShadow) continue;
        gl.uniformMatrix4fv(us.uModel, false, o.wm);
        const gm = uploadMesh(o.mesh);
        gl.bindVertexArray(gm.vao);
        gl.drawArrays(gl.TRIANGLES, 0, gm.count);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
      gl.viewport(0, 0, W, H);
    }

    chk('shadow');
    // main scene
    gl.useProgram(this.programs.scene);
    const us = this.u.scene;
    gl.uniformMatrix4fv(us.uProj, false, proj);
    gl.uniformMatrix4fv(us.uView, false, view);
    gl.uniformMatrix4fv(us.uLightVP, false, lightVP);
    gl.uniform3fv(us.uCamPos, cam.eye);
    gl.uniform3fv(us.uLightDir, lightDir);
    gl.uniform3fv(us.uLightColor, lightColor);
    gl.uniform1f(us.uLightIntensity, lightIntensity);
    gl.uniform3fv(us.uPointPos, pointPos);
    gl.uniform3fv(us.uPointColor, pointColor);
    gl.uniform1f(us.uPointIntensity, pointIntensity);
    gl.uniform1f(us.uShadowEnabled, dirLight ? 1 : 0);
    gl.uniform1f(us.uShadowTexel, 1 / shadow.w);
    gl.uniform1f(us.uEnvIntensity, 1.0);
    gl.uniform3f(us.uFogColor, 0.02, 0.02, 0.03);
    gl.uniform1f(us.uFogDensity, 0.00016);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadow.tex);
    gl.uniform1i(us.uShadowMap, 0);

    for (let s = 0; s < samples; s++) {
      const off = samples === 1 ? 0 : (s / (samples - 1) - 0.5) * shutter / comp.fps;
      const t = Math.max(0, time + off);
      // update time-dependent uniforms (lights, camera)
      const cam2 = findCamera(comp, comp.layers, t);
      const lights2 = findLights(comp, comp.layers, t);
      const dl2 = lights2.find(l => l.type === 'parallel' && l.shadow) || lights2.find(l => l.type === 'parallel');
      let ld2 = lightDir, lc2 = lightColor, li2 = lightIntensity, lvp2 = lightVP;
      if (dl2) {
        ld2 = [-dl2.dir[0], -dl2.dir[1], -dl2.dir[2]];
        lc2 = dl2.color; li2 = dl2.intensity;
        const eye = [ld2[0] * 2600, ld2[1] * 2600, ld2[2] * 2600];
        const lv = M4.lookAt(mat4(), eye, [0, 0, 0], [0, 1, 0]);
        lvp2 = M4.multiply(mat4(), M4.ortho(mat4(), -1500, 1500, -1500, 1500, 1, 6000), lv);
      }
      const proj2 = M4.perspective(mat4(), cam2.fov * Math.PI / 180, aspect, 5, 20000);
      const view2 = M4.lookAt(mat4(), cam2.eye, cam2.target, [0, 1, 0]);
      gl.uniformMatrix4fv(us.uProj, false, proj2);
      gl.uniformMatrix4fv(us.uView, false, view2);
      gl.uniform3fv(us.uCamPos, cam2.eye);
      gl.uniform3fv(us.uLightDir, ld2);
      gl.uniform3fv(us.uLightColor, lc2);
      gl.uniform1f(us.uLightIntensity, li2);
      gl.uniformMatrix4fv(us.uLightVP, false, lvp2);

      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      if (samples > 1) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
      }
      const expo = 1 / samples;
      const transparent = [];
      for (const o of objs) {
        const local = M4.create();
        M4.copy(local, o.wm);
        if (o.layer.dents && o.layer.dents.length) {
          const dents = o.layer.dents;
          for (let i = 0; i < 4; i++) {
            const d = dents[i];
            if (!d) { gl.uniform1f(us['uDent[' + i + ']'], 0); continue; }
            const dp = d.p || [0, 0, 0];
            const age = t - d.t;
            const amp = age < 0 ? 0 : d.amp * Math.exp(-age * 4.0);
            gl.uniform4f(us['uImpacts[' + i + ']'], dp[0], dp[1], dp[2], d.r || 120);
            gl.uniform3f(us.uImpactDir, 0, 0, -1);
            gl.uniform1f(us['uDent[' + i + ']'], -amp);
          }
        } else {
          for (let i = 0; i < 4; i++) gl.uniform1f(us['uDent[' + i + ']'], 0);
        }
        gl.uniformMatrix4fv(us.uModel, false, local);
        const nm = M4.transpose(mat4(), M4.invert(mat4(), local));
        gl.uniformMatrix3fv(us.uNormalMat, false, new Float32Array([nm[0], nm[1], nm[2], nm[4], nm[5], nm[6], nm[8], nm[9], nm[10]]));
        gl.uniform3fv(us.uColor, o.color);
        gl.uniform1f(us.uMetal, o.metal);
        gl.uniform1f(us.uRough, o.rough);
        gl.uniform3fv(us.uEmissive, o.emissive);
        gl.uniform1f(us.uOpacity, o.opacity); gl.uniform1f(us.uFade, expo);
        gl.uniform1f(us.uGrid, o.grid);
        gl.uniform1f(us.uEnvIntensity, (o.env === undefined ? 1 : o.env) * 0.85);
        if (o.opacity < 0.999) transparent.push(o);
        else {
          const gm = uploadMesh(o.mesh);
          gl.bindVertexArray(gm.vao);
          gl.drawArrays(gl.TRIANGLES, 0, gm.count);
        }
      }
      // transparent sorted back to front
      transparent.sort((a, b) => {
        const za = M4.transformPoint(view2, [a.wm[12], a.wm[13], a.wm[14]])[2];
        const zb = M4.transformPoint(view2, [b.wm[12], b.wm[13], b.wm[14]])[2];
        return za - zb;
      });
      if (transparent.length) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const o of transparent) {
          gl.uniformMatrix4fv(us.uModel, false, o.wm);
          const nm = M4.transpose(mat4(), M4.invert(mat4(), o.wm));
          gl.uniformMatrix3fv(us.uNormalMat, false, new Float32Array([nm[0], nm[1], nm[2], nm[4], nm[5], nm[6], nm[8], nm[9], nm[10]]));
          gl.uniform3fv(us.uColor, o.color);
          gl.uniform1f(us.uMetal, o.metal);
          gl.uniform1f(us.uRough, o.rough);
          gl.uniform3fv(us.uEmissive, o.emissive);
          gl.uniform1f(us.uOpacity, o.opacity); gl.uniform1f(us.uFade, expo);
          gl.uniform1f(us.uGrid, o.grid);
          gl.uniform1f(us.uEnvIntensity, (o.env === undefined ? 1 : o.env) * 0.85);
          const gm = uploadMesh(o.mesh);
          gl.bindVertexArray(gm.vao);
          gl.drawArrays(gl.TRIANGLES, 0, gm.count);
        }
        gl.depthMask(true);
      }
      // particles (sprites + trail dots as camera-facing quads)
      if (particles.length) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(false);
        const pu = this.u.part;
        gl.useProgram(this.programs.part);
        gl.uniformMatrix4fv(pu.uProj, false, proj2);
        gl.uniformMatrix4fv(pu.uView, false, view2);
        const quadData = [];
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
        for (const p of particles) {
          const pcol = AEMath.hexToRgb(p.layer.particles.color || '#ffb15a');
          const ecol = AEMath.hexToRgb(p.layer.particles.colorEnd || '#ff4a1e');
          for (const q of p.data.quads) {
            const c = [
              pcol[0] + (ecol[0] - pcol[0]) * (1 - q.k),
              pcol[1] + (ecol[1] - pcol[1]) * (1 - q.k),
              pcol[2] + (ecol[2] - pcol[2]) * (1 - q.k),
            ];
            for (const cn of corners) quadData.push(q.p[0], q.p[1], q.p[2], cn[0], cn[1], c[0], c[1], c[2], q.size, q.alpha * expo);
          }
          if ((p.layer.particles.trail || 0) > 0) {
            for (const ln of p.data.lines) {
              const n = ln.pts.length;
              for (let j = 0; j < n; j++) {
                const pt = ln.pts[j];
                const t = n <= 1 ? 0 : j / (n - 1);
                const c = [pcol[0] * 0.85 + ecol[0] * 0.15, pcol[1] * 0.85 + ecol[1] * 0.15, pcol[2] * 0.85 + ecol[2] * 0.15];
                const sz = (1 - t) * 2.6 + 0.6;
                const al = ln.alpha * (1 - t) * expo;
                for (const cn of corners) quadData.push(pt[0], pt[1], pt[2], cn[0], cn[1], c[0], c[1], c[2], sz, al);
              }
            }
          }
        }
        if (quadData.length) {
          if (!this.partVBO) { this.partVBO = gl.createBuffer(); this.partVAO = gl.createVertexArray(); }
          gl.bindVertexArray(this.partVAO);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.partVBO);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadData), gl.DYNAMIC_DRAW);
          const st = 10 * 4;
          gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
          gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
          gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 20);
          gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
          gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, st, 36);
          gl.drawArrays(gl.TRIANGLES, 0, quadData.length / 10);
        }
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    chk('scene');
    // ---- post ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    if (R3.debug && R3.debug.direct) {
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.programs.quad);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.tex);
      gl.uniform1i(this.u.quad.uTex, 0);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      return this.canvas;
    }
    const hw = this.fbos.dofA.w, hh = this.fbos.dofA.h;
    chk('poststart');
    // bright pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.bloomA.fbo);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(this.programs.bright);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(this.u.bright.uTex, 0);
    gl.uniform1f(this.u.bright.uThreshold, 0.78);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // blur bloom
    gl.useProgram(this.programs.blur);
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.bloomB.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.bloomA.tex);
      gl.uniform1i(this.u.blur.uTex, 0);
      gl.uniform2f(this.u.blur.uDir, 2.2 / hw, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.bloomA.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.bloomB.tex);
      gl.uniform2f(this.u.blur.uDir, 0, 2.2 / hh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    chk('bloom');
    // dof blur (half res)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.dofA.fbo);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(this.programs.quad);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(this.u.quad.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(this.programs.blur);
    gl.uniform1i(this.u.blur.uTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.dofB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.dofA.tex);
    gl.uniform2f(this.u.blur.uDir, 3.0 / hw, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.dofA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.dofB.tex);
    gl.uniform2f(this.u.blur.uDir, 0, 3.0 / hh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    chk('dof');
    // final
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.programs.final);
    const fu = this.u.final;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex); gl.uniform1i(fu.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fbos.dofA.tex); gl.uniform1i(fu.uDof, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.fbos.bloomA.tex); gl.uniform1i(fu.uBloom, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, scene.depth); gl.uniform1i(fu.uDepth, 3);
    gl.uniform2f(fu.uRes, W, H);
    gl.uniform1f(fu.uTime, time);
    gl.uniform1f(fu.uBloomStrength, (R3.debug && R3.debug.noBloom) ? 0.0 : 0.9);
    gl.uniform1f(fu.uVignette, 0.55);
    gl.uniform1f(fu.uExposure, 1.0);
    gl.uniform1f(fu.uCocScale, 5.0);
    gl.uniform1f(fu.uFocus, cam.focus);
    gl.uniform1f(fu.uAperture, (R3.debug && R3.debug.noDof) ? 0.0 : (cam.aperture || 0.05));
    gl.uniform1f(fu.uNear, 5);
    gl.uniform1f(fu.uFar, 20000);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    chk('final');
    return this.canvas;
  };

  global.AE3D = R3;
})(window);
