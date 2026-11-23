(function (N) {
  const V = {
    add: (a, b) => a.map((v, i) => v + b[i]), sub: (a, b) => a.map((v, i) => v - b[i]), scale: (a, s) => a.map(v => v * s),
    dot: (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    length: a => Math.hypot(...a), normalize: a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }, lerp: (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
  };
  const M = {
    identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    multiply: (a, b) => {
      const out = new Array(16).fill(0);
      for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
      return out;
    },
    translation: v => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1],
    scaling: v => [v[0], 0, 0, 0, 0, v[1], 0, 0, 0, 0, v[2], 0, 0, 0, 0, 1],
    rotationX: a => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1],
    rotationY: a => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1],
    rotationZ: a => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    compose: (position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => {
      let matrix = M.translation(position);
      matrix = M.multiply(matrix, M.rotationY(rotation[1])); matrix = M.multiply(matrix, M.rotationX(rotation[0])); matrix = M.multiply(matrix, M.rotationZ(rotation[2]));
      return M.multiply(matrix, M.scaling(scale));
    },
    transform: (m, p, w = 1) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w, m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w, m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w, m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * w],
    perspective: (fov, aspect, near, far) => { const f = 1 / Math.tan(fov / 2); return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]; },
    lookAt: (eye, target, up = [0, 1, 0]) => {
      const z = V.normalize(V.sub(eye, target)); const x = V.normalize(V.cross(up, z)); const y = V.cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -V.dot(x, eye), -V.dot(y, eye), -V.dot(z, eye), 1];
    }
  };

  function heightAt(resource, x, z) {
    const terrain = resource.environment?.terrain || {};
    const a = terrain.amplitude ?? 1.6;
    return (terrain.base || 0) + Math.sin(x * .115 + .7) * Math.cos(z * .092) * a + Math.sin(z * .21 - x * .055) * a * .34 + Math.cos((x + z) * .043) * a * .45;
  }
  function timelineAt(resource, time) {
    const frames = resource.timeline || [{ t: 0, position: [0, 3, 0], rotation: [0, 0, 0], rotor: 0 }];
    if (time <= frames[0].t) return N.clone(frames[0]);
    if (time >= frames[frames.length - 1].t) return N.clone(frames[frames.length - 1]);
    let index = 0; while (index < frames.length - 2 && frames[index + 1].t < time) index++;
    const a = frames[index], b = frames[index + 1]; const linear = (time - a.t) / (b.t - a.t); const t = linear * linear * (3 - 2 * linear);
    const mix = (x, y) => x + (y - x) * t;
    const result = { t: time };
    ['x', 'y', 'z'].forEach((key, i) => { if (a.position) result[key] = 0; });
    result.position = V.lerp(a.position || [0, 0, 0], b.position || [0, 0, 0], t);
    result.rotation = V.lerp(a.rotation || [0, 0, 0], b.rotation || [0, 0, 0], t);
    ['rotor', 'damage', 'shake', 'collective'].forEach(key => result[key] = mix(a[key] || 0, b[key] || 0));
    result.phase = linear < .5 ? a.phase : b.phase; return result;
  }
  function randomSeeded(seed) { let value = seed | 0; return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; }; }

  function stateFromRoot(resource, time, root, options = {}) {
    const parts = (resource.parts || []).map((part, index) => {
      const result = N.clone(part);
      result.basePosition = N.clone(part.position || [0, 0, 0]); result.baseRotation = N.clone(part.rotation || [0, 0, 0]);
      result.position = result.basePosition; result.rotation = result.baseRotation; result.visible = true; result.damage = 0;
      if (part.motion === 'main-rotor') result.rotation[1] += (options.rotorAngle ?? time * (root.rotor || 0) * 32);
      if (part.motion === 'tail-rotor') result.rotation[0] += (options.rotorAngle ?? time * (root.rotor || 0) * 48);
      if (part.detach && options.crash) {
        const elapsed = Math.max(0, time - options.crash.time);
        const origin = options.crash.position;
        const angle = index * 2.399 + .3;
        const speed = 2.5 + (index % 4) * 1.15;
        let x = origin[0] + Math.cos(angle) * speed * elapsed;
        let z = origin[2] + Math.sin(angle) * speed * elapsed;
        let y = origin[1] + (3 + index % 3) * elapsed - 4.9 * elapsed * elapsed;
        const floor = heightAt(resource, x, z) + .15;
        let settled = false;
        if (y <= floor) { y = floor; settled = true; const travel = Math.max(0, 1 - elapsed * .13); x = origin[0] + Math.cos(angle) * speed * elapsed * travel; z = origin[2] + Math.sin(angle) * speed * elapsed * travel; }
        result.detached = true; result.worldPosition = [x, y, z]; result.worldRotation = [elapsed * (index + 1), angle + elapsed * 1.7, elapsed * 2.1]; result.damage = 1; result.settled = settled;
      }
      if (options.damage && part.vital) result.damage = options.damage;
      return result;
    });
    return { time, root: N.clone(root), parts, particles: options.particles || [], crash: options.crash || null, phase: root.phase || '', weather: resource.environment?.weather || '黄昏 / 微风' };
  }
  function effectsFor(resource, time, root, state) {
    const particles = []; const rand = randomSeeded(24024 + Math.floor(time * 30));
    const failure = resource.failureTime ?? 7.2; const impact = resource.impactTime ?? 11.6;
    if (root.rotor > .25 && root.position[1] - heightAt(resource, root.position[0], root.position[2]) < 5 && time < impact) {
      const count = Math.floor(7 + root.rotor * 14);
      for (let i = 0; i < count; i++) {
        const age = rand(); const angle = rand() * Math.PI * 2; const radius = .8 + age * 5.5;
        particles.push({ kind: 'dust', position: [root.position[0] + Math.cos(angle) * radius, heightAt(resource, root.position[0], root.position[2]) + .15 + age * .9, root.position[2] + Math.sin(angle) * radius], scale: [.45 + age * .85, .25 + age * .35, .45 + age * .85], color: [.55, .43, .31], alpha: (1 - age) * .28 });
      }
    }
    if (time > failure && time < impact + .3) {
      for (let i = 0; i < 22; i++) {
        const age = (time * .3 + i / 22) % 1; const drift = age * 3;
        particles.push({ kind: 'smoke', position: [root.position[0] - drift * .5 + (rand() - .5) * .6, root.position[1] + .5 + drift, root.position[2] + drift * .7], scale: [.35 + age, .45 + age * 1.1, .35 + age], color: [.19, .18, .22], alpha: .5 * (1 - age) });
      }
    }
    if (time >= impact) {
      const crash = state?.crash || { position: root.position, time: impact };
      const elapsed = time - impact;
      const count = Math.min(38, 12 + Math.floor(elapsed * 6));
      for (let i = 0; i < count; i++) {
        const age = (elapsed * .12 + i / count) % 1; const angle = rand() * Math.PI * 2; const radius = .3 + age * 2.8;
        particles.push({ kind: 'smoke', position: [crash.position[0] + Math.cos(angle) * radius - age * 2, crash.position[1] + .3 + age * 6.5, crash.position[2] + Math.sin(angle) * radius], scale: [.55 + age * 1.7, .7 + age * 1.5, .55 + age * 1.7], color: i % 4 === 0 ? [.28, .22, .25] : [.14, .15, .19], alpha: .62 * (1 - age) });
      }
      if (elapsed < 3.4) for (let i = 0; i < 13; i++) {
        const age = (elapsed * .8 + i / 13) % 1;
        particles.push({ kind: 'fire', position: [crash.position[0] + (rand() - .5) * 2.1, crash.position[1] + .2 + age * 1.8, crash.position[2] + (rand() - .5) * 1.7], scale: [.22 + (1 - age) * .35, .4 + age * .5, .22 + (1 - age) * .35], color: age < .5 ? [1, .64, .12] : [1, .24, .06], alpha: .85 * (1 - age), emissive: 1 });
      }
    }
    return particles;
  }

  const Scene = {
    heightAt,
    sample(resource, time) {
      const root = timelineAt(resource, time); const impact = resource.impactTime ?? 11.6;
      const crash = time >= impact ? { time: impact, position: N.clone(resource.crashPosition || root.position) } : null;
      if (crash) root.position = N.clone(crash.position);
      const state = stateFromRoot(resource, time, root, { crash, damage: root.damage });
      state.particles = effectsFor(resource, time, root, state); return state;
    },
    stateFromRoot,
    effectsFor
  };
  N.Scene = Scene;

  class Mesh {
    constructor(device, data) {
      const gl = device.gl; this.count = data.indices.length;
      this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
      const buffer = (target, values) => { const result = gl.createBuffer(); gl.bindBuffer(target, result); gl.bufferData(target, values, gl.STATIC_DRAW); return result; };
      buffer(gl.ARRAY_BUFFER, new Float32Array(data.positions)); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      buffer(gl.ARRAY_BUFFER, new Float32Array(data.normals)); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      buffer(gl.ARRAY_BUFFER, new Float32Array(data.uvs)); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices)); gl.bindVertexArray(null);
    }
  }
  function geometry(type, resource) {
    if (type === 'terrain') {
      const positions = [], normals = [], uvs = [], indices = []; const resolution = resource.environment?.terrain?.resolution || 48; const size = resource.environment?.terrain?.size || 80;
      for (let z = 0; z <= resolution; z++) for (let x = 0; x <= resolution; x++) {
        const px = (x / resolution - .5) * size, pz = (z / resolution - .5) * size; positions.push(px, heightAt(resource, px, pz), pz); normals.push(0, 1, 0); uvs.push(x / resolution, z / resolution);
      }
      for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) { const a = z * (resolution + 1) + x, b = a + 1, c = a + resolution + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], z = positions[i + 2], e = .15; const dx = heightAt(resource, x + e, z) - heightAt(resource, x - e, z); const dz = heightAt(resource, x, z + e) - heightAt(resource, x, z - e); const n = V.normalize([-dx / (2 * e), 1, -dz / (2 * e)]); normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
      }
      return { positions, normals, uvs, indices };
    }
    if (type === 'sphere' || type === 'ellipsoid') {
      const positions = [], normals = [], uvs = [], indices = []; const segments = 20, rings = 12;
      for (let y = 0; y <= rings; y++) for (let x = 0; x <= segments; x++) {
        const u = x / segments, v = y / rings, theta = u * Math.PI * 2, phi = v * Math.PI;
        const px = Math.sin(phi) * Math.cos(theta), py = Math.cos(phi), pz = Math.sin(phi) * Math.sin(theta); positions.push(px, py, pz); normals.push(px, py, pz); uvs.push(u, v);
      }
      for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) { const a = y * (segments + 1) + x, b = a + segments + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
      return { positions, normals, uvs, indices };
    }
    if (type === 'cylinder' || type === 'cone') {
      const positions = [], normals = [], uvs = [], indices = []; const segments = 20; const topRadius = type === 'cone' ? 0 : 1;
      for (let y = 0; y <= 1; y++) for (let i = 0; i <= segments; i++) {
        const a = i / segments * Math.PI * 2, r = y ? topRadius : 1; positions.push(Math.cos(a) * r, y - .5, Math.sin(a) * r); normals.push(Math.cos(a), type === 'cone' ? .5 : 0, Math.sin(a)); uvs.push(i / segments, y);
      }
      for (let i = 0; i < segments; i++) { const a = i, b = i + segments + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
      const addCap = (y, top) => { const center = positions.length / 3; positions.push(0, y, 0); normals.push(0, top ? 1 : -1, 0); uvs.push(.5, .5); for (let i = 0; i <= segments; i++) { const a = i / segments * Math.PI * 2, r = top ? topRadius : 1; positions.push(Math.cos(a) * r, y, Math.sin(a) * r); normals.push(0, top ? 1 : -1, 0); uvs.push(Math.cos(a) * .5 + .5, Math.sin(a) * .5 + .5); } for (let i = 0; i < segments; i++) { if (top && topRadius > 0) indices.push(center, center + i + 1, center + i + 2); else if (!top) indices.push(center, center + i + 2, center + i + 1); } };
      addCap(-.5, false); addCap(.5, true); return { positions, normals, uvs, indices };
    }
    if (type === 'plane') return { positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 1, 2, 0, 2, 3] };
    const positions = [-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1], normals = [], uvs = [], indices = [];
    const faces = [[0,3,2,1,[0,0,-1]],[4,5,6,7,[0,0,1]],[0,4,7,3,[-1,0,0]],[1,2,6,5,[1,0,0]],[3,7,6,2,[0,1,0]],[0,1,5,4,[0,-1,0]]];
    const p = [], n = [], u = [], idx = [];
    faces.forEach((face, fi) => { const normal = face[4]; for (let j = 0; j < 4; j++) { const vi = face[j] * 3; p.push(positions[vi], positions[vi + 1], positions[vi + 2]); n.push(...normal); u.push(j === 1 || j === 2 ? 1 : 0, j >= 2 ? 1 : 0); } const o = fi * 4; idx.push(o,o+1,o+2,o,o+2,o+3); });
    return { positions: p, normals: n, uvs: u, indices: idx };
  }

  class GraphicsDevice {
    constructor() {
      this.canvas = document.createElement('canvas'); this.canvas.width = 1280; this.canvas.height = 720;
      this.gl = this.canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (!this.gl) return;
      this.meshes = new Map(); this.textures = new Map(); this.ready = false; this.lastResource = null;
      this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.ready = false; });
      this.canvas.addEventListener('webglcontextrestored', () => { this.meshes.clear(); this.textures.clear(); this.initialize(); N.os?.systems.forEach(system => Object.values(system.apps).forEach(app => { if (app.appId === 'player') app.renderDirty = true; })); });
      this.initialize();
    }
    shader(type, source) { const gl = this.gl; const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; }
    program(vs, fs) { const gl = this.gl; const program = gl.createProgram(); gl.attachShader(program, this.shader(gl.VERTEX_SHADER, vs)); gl.attachShader(program, this.shader(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(program, 0, 'aPosition'); gl.bindAttribLocation(program, 1, 'aNormal'); gl.bindAttribLocation(program, 2, 'aUV'); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)); return program; }
    initialize() {
      const gl = this.gl; if (!gl) return;
      const vs = `#version 300 es
      layout(location=0) in vec3 aPosition; layout(location=1) in vec3 aNormal; layout(location=2) in vec2 aUV;
      uniform mat4 uModel,uVP,uLightVP; out vec3 vWorld,vNormal; out vec2 vUV; out vec4 vShadow;
      void main(){vec4 world=uModel*vec4(aPosition,1.0);vWorld=world.xyz;vNormal=normalize(transpose(inverse(mat3(uModel)))*aNormal);vUV=aUV;vShadow=uLightVP*world;gl_Position=uVP*world;}`;
      const fs = `#version 300 es
      precision highp float; in vec3 vWorld,vNormal; in vec2 vUV; in vec4 vShadow;
      uniform vec4 uColor; uniform vec3 uEye,uSun; uniform float uEmissive,uGround,uTextured,uRoughness; uniform sampler2D uTexture,uShadowMap; out vec4 outColor;
      float shadow(vec4 sc){vec3 p=sc.xyz/sc.w*.5+.5;if(p.z>1.0||p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0)return 1.0;float bias=max(.0015*(1.0-dot(normalize(vNormal),uSun)),.0005);float sum=0.0;vec2 texel=1.0/vec2(textureSize(uShadowMap,0));for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float d=texture(uShadowMap,p.xy+vec2(x,y)*texel).r;sum+=p.z-bias>d?0.28:1.0;}return sum/9.0;}
      void main(){vec3 n=normalize(vNormal);vec3 l=normalize(uSun);float diff=max(dot(n,l),0.0);float sh=shadow(vShadow);vec3 base=uColor.rgb;float alpha=uColor.a;if(uTextured>.5){vec4 decal=texture(uTexture,vUV);if(decal.a<.08)discard;base=decal.rgb;alpha*=decal.a;}if(uGround>.5){float grain=sin(vWorld.x*2.3+sin(vWorld.z*1.7))*.035;base+=grain;base=mix(base,vec3(.26,.28,.18),smoothstep(.2,1.5,vWorld.y)*.18);}vec3 view=normalize(uEye-vWorld);vec3 halfV=normalize(l+view);float spec=pow(max(dot(n,halfV),0.0),mix(70.0,8.0,uRoughness))*(1.0-uRoughness)*.55;vec3 lit=base*(.25+diff*.83*sh)+vec3(1.0,.83,.62)*spec*sh;lit=mix(lit,base*1.45,uEmissive);float dist=length(uEye-vWorld);float fog=smoothstep(42.0,88.0,dist);vec3 fogColor=vec3(.40,.36,.48);outColor=vec4(mix(lit,fogColor,fog),alpha);}`;
      this.mainProgram = this.program(vs, fs);
      const depthVS = `#version 300 es
      layout(location=0) in vec3 aPosition;uniform mat4 uModel,uLightVP;void main(){gl_Position=uLightVP*uModel*vec4(aPosition,1.0);}`;
      const depthFS = `#version 300 es
      precision highp float;void main(){}`;
      this.depthProgram = this.program(depthVS, depthFS);
      this.shadowTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture); gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,1536,1536,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      this.shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTexture,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); this.ready = true;
    }
    mesh(type, resource) { const key = type === 'terrain' ? `${type}:${resource.id || resource.title}` : type; if (!this.meshes.has(key)) this.meshes.set(key, new Mesh(this, geometry(type, resource))); return this.meshes.get(key); }
    textTexture(text) {
      if (this.textures.has(text)) return this.textures.get(text); const gl = this.gl; const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128; const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,256,128); ctx.fillStyle = '#f5c945'; ctx.font = 'italic 900 100px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,128,68); const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); this.textures.set(text,texture); return texture;
    }
    camera(app, aspect) {
      const state = app.sceneState; const p = state?.root?.position || [0, 2, 0]; const mode = app.camera || 'cinematic'; let eye, target = [...p];
      if (mode === 'follow') { const yaw = state?.root?.rotation?.[1] || 0; eye = [p[0] + Math.sin(yaw) * 11 + 4, p[1] + 5.2, p[2] + Math.cos(yaw) * 11 + 7]; target[1] += .5; }
      else if (mode === 'free') { const o = app.orbit || { yaw: .7, pitch: .42, distance: 21 }; eye = [p[0] + Math.sin(o.yaw) * Math.cos(o.pitch) * o.distance, p[1] + Math.sin(o.pitch) * o.distance, p[2] + Math.cos(o.yaw) * Math.cos(o.pitch) * o.distance]; }
      else {
        const t = state?.time || 0; const impact = app.resource?.impactTime ?? 11.6;
        if (t < 2.8) eye = [p[0] + 10, p[1] + 4.2, p[2] + 12];
        else if (t < 7.5) eye = [p[0] + 9 + Math.sin(t * .25) * 2, p[1] + 3.6, p[2] + 11];
        else if (t < impact) eye = [p[0] - 11, p[1] + 6.5, p[2] + 11];
        else eye = [p[0] - 10, p[1] + 11.5, p[2] + 11];
        target[1] += .35;
      }
      return { eye, target, view: M.lookAt(eye, target), projection: M.perspective(47 * Math.PI / 180, aspect, .1, 140) };
    }
    objects(app) {
      const resource = app.resource; const state = app.sceneState; if (!resource || !state) return [];
      const objects = [{ mesh: 'terrain', model: M.identity(), color: [.25,.31,.20,1], ground: 1, roughness: .95, name: '起伏地形' }];
      (resource.environment?.objects || []).forEach(part => objects.push({ part, model: M.compose(part.position, part.rotation, part.scale || [1,1,1]), color: [...(part.color || [.5,.5,.5]), part.alpha ?? 1], mesh: part.mesh || 'box', roughness: part.roughness ?? .7, name: part.name || part.id, emissive: part.emissive || 0 }));
      const scatter = resource.environment?.scatter || [];
      scatter.forEach(group => { const rand = randomSeeded(group.seed || 24); for (let i = 0; i < (group.count || 0); i++) {
        const x = (rand() - .5) * (group.area || 65), z = (rand() - .5) * (group.area || 65); if (Math.hypot(x, z) < 10 || Object.values(resource.environment?.pads||{}).some(pad=>Math.hypot(x-pad[0],z-pad[2])<6.2)) continue;
        const y = heightAt(resource,x,z); const scale = (group.scale || 1) * (.7 + rand() * .6);
        if (group.kind === 'tree') {
          objects.push({ mesh:'cylinder',model:M.compose([x,y+1.1*scale,z],[0,0,0],[.18*scale,2.2*scale,.18*scale]),color:[.24,.16,.12,1],roughness:1,name:'树干' });
          objects.push({ mesh:'cone',model:M.compose([x,y+3.0*scale,z],[0,rand()*3,0],[1.25*scale,3.5*scale,1.25*scale]),color:[.16,.27,.20,1],roughness:.95,name:'松树' });
        } else objects.push({ mesh:'cone',model:M.compose([x,y+.25*scale,z],[0,rand()*6,0],[.08*scale,.55*scale,.08*scale]),color:[.37,.40,.19,1],roughness:1,name:'草叶' });
      } });
      const root = state.root; const rootMatrix = M.compose(root.position, root.rotation, [1,1,1]);
      state.parts.filter(part => part.visible !== false).forEach(part => {
        const local = M.compose(part.position || [0,0,0], part.rotation || [0,0,0], part.scale || [1,1,1]);
        const model = part.detached ? M.compose(part.worldPosition, part.worldRotation, part.scale || [1,1,1]) : M.multiply(rootMatrix, local);
        objects.push({ part, model, mesh: part.mesh || 'box', color: [...(part.color || [.5,.2,.7]), part.alpha ?? 1], roughness: part.roughness ?? .4, metalness: part.metalness, text: part.text, emissive: part.emissive || 0, name: part.name || part.id, damage: part.damage });
      });
      (state.particles || []).forEach(particle => objects.push({ particle: true, model: M.compose(particle.position,[0,0,0],particle.scale), mesh:'ellipsoid',color:[...particle.color,particle.alpha],roughness:1,emissive:particle.emissive || 0,name:particle.kind === 'fire'?'火焰':'烟尘' }));
      return objects;
    }
    drawObject(program, object, vp, lightVP, camera, shadowPass) {
      const gl = this.gl; const mesh = this.mesh(object.mesh, object.part ? N.clone({ environment: { terrain: {} } }) : this.currentResource);
      if (object.mesh === 'terrain') this.currentResource && (this.meshCacheResource = this.currentResource);
      gl.bindVertexArray(mesh.vao); const modelLoc = gl.getUniformLocation(program,'uModel'); gl.uniformMatrix4fv(modelLoc,false,new Float32Array(object.model));
      if (!shadowPass) {
        gl.uniformMatrix4fv(gl.getUniformLocation(program,'uVP'),false,new Float32Array(vp)); gl.uniformMatrix4fv(gl.getUniformLocation(program,'uLightVP'),false,new Float32Array(lightVP));
        gl.uniform4fv(gl.getUniformLocation(program,'uColor'),new Float32Array(object.color));gl.uniform3fv(gl.getUniformLocation(program,'uEye'),new Float32Array(camera.eye));gl.uniform3fv(gl.getUniformLocation(program,'uSun'),new Float32Array(V.normalize([-.6,1,.45])));gl.uniform1f(gl.getUniformLocation(program,'uEmissive'),object.emissive || 0);gl.uniform1f(gl.getUniformLocation(program,'uGround'),object.ground || 0);gl.uniform1f(gl.getUniformLocation(program,'uRoughness'),object.roughness ?? .6);
        gl.uniform1i(gl.getUniformLocation(program,'uShadowMap'),1);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);
        gl.uniform1f(gl.getUniformLocation(program,'uTextured'),object.text ? 1 : 0); if (object.text) { gl.uniform1i(gl.getUniformLocation(program,'uTexture'),0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textTexture(object.text)); }
        if (object.color[3] < 1) { gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.disable(gl.CULL_FACE); } else { gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.CULL_FACE); }
      }
      gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);
    }
    render(app, canvas) {
      if (!this.ready || !app.sceneState) return;
      const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 1.5); const width = Math.max(320, Math.min(1920, Math.floor(rect.width * dpr))); const height = Math.max(200, Math.min(1200, Math.floor(rect.height * dpr)));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      const gl = this.gl; this.currentResource = app.resource; const camera = this.camera(app,width/height); const vp = M.multiply(camera.projection,camera.view); const lightVP = M.multiply(M.perspective(70*Math.PI/180,1,.1,120),M.lookAt([-28,42,24],[0,0,0])); const objects = this.objects(app);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFbo);gl.viewport(0,0,1536,1536);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(this.depthProgram);gl.uniformMatrix4fv(gl.getUniformLocation(this.depthProgram,'uLightVP'),false,new Float32Array(lightVP));gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.enable(gl.CULL_FACE);
      objects.filter(object => !object.particle && object.mesh !== 'plane').forEach(object => this.drawObject(this.depthProgram,object,vp,lightVP,camera,true));
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);const sky = app.resource.environment?.sky || [.29,.24,.38];gl.clearColor(sky[0],sky[1],sky[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.mainProgram);
      objects.filter(object => !object.particle).forEach(object => this.drawObject(this.mainProgram,object,vp,lightVP,camera,false));
      objects.filter(object => object.particle).sort((a,b) => { const pa=[a.model[12],a.model[13],a.model[14]],pb=[b.model[12],b.model[13],b.model[14]];return V.length(V.sub(pb,camera.eye))-V.length(V.sub(pa,camera.eye)); }).forEach(object => this.drawObject(this.mainProgram,object,vp,lightVP,camera,false));
      gl.depthMask(true);gl.disable(gl.BLEND);gl.enable(gl.CULL_FACE);
      const ctx = canvas.getContext('2d');ctx.drawImage(this.canvas,0,0,width,height);
      const picks = [];
      objects.filter(object => object.part && app.sceneState.parts.includes(object.part)).forEach(object => {
        const point = M.transform(vp,[object.model[12],object.model[13],object.model[14]]); if (point[3] <= 0) return; const x=(point[0]/point[3]*.5+.5)*width,y=(-point[1]/point[3]*.5+.5)*height; const scale=Math.max(object.part.scale || [1,1,1]); picks.push({id:object.part.id,name:object.name,damage:object.damage || 0,x,y,r:Math.max(12,scale*height/45)});
      }); canvas._scenePicks=picks;canvas._sceneCamera=camera;canvas._sceneProjection=camera.projection;canvas._sceneVP=vp;
      app.renderDirty=false;app.deviceRevision=app.lastRevision;
    }
    pick(app,canvas,clientX,clientY) {
      const rect=canvas.getBoundingClientRect();const x=(clientX-rect.left)/rect.width*canvas.width,y=(clientY-rect.top)/rect.height*canvas.height;
      const hits=(canvas._scenePicks||[]).filter(p=>Math.hypot(p.x-x,p.y-y)<p.r).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
      return hits[0] ? {id:hits[0].id,name:hits[0].name,damage:hits[0].damage} : null;
    }
    ground(app,canvas,clientX,clientY) {
      const rect=canvas.getBoundingClientRect();const nx=((clientX-rect.left)/rect.width)*2-1,ny=1-((clientY-rect.top)/rect.height)*2;const camera=canvas._sceneCamera;if(!camera)return null;
      const tan=Math.tan(47*Math.PI/180/2),aspect=canvas.width/canvas.height;const forward=V.normalize(V.sub(camera.target,camera.eye)),right=V.normalize(V.cross(forward,[0,1,0])),up=V.cross(right,forward);const ray=V.normalize(V.add(forward,V.add(V.scale(right,nx*tan*aspect),V.scale(up,ny*tan))));let previous=camera.eye;
      for(let t=1;t<120;t+=.5){const point=V.add(camera.eye,V.scale(ray,t));if(point[1]<=heightAt(app.resource,point[0],point[2])){return point;}previous=point;}return null;
    }
  }
  N.GraphicsDevice = GraphicsDevice;

  const Flight = {
    initial(app, fromState) {
      const initial = app.resource.flight?.initial || { position: [-8, 1, 4], yaw: 0 }; const root = fromState?.root; const position = root?.position || initial.position;
      const moving=root&&(root.rotor||0)>.2;return { time: app.position || 0, x:position[0], y:position[1], z:position[2], vx:moving?1:0, vy:0, vz:moving?-1:0, pitch:root?.rotation?.[0]||0, roll:root?.rotation?.[2]||0, yaw:root?.rotation?.[1]||initial.yaw||0, vp:0, vr:0, rotor:root?.rotor||1, collective:.43, control:{collective:.43,pitch:0,roll:0,yaw:0,writtenAt:0}, heading:app.heading||0, wind:app.wind||0, fault:false, crashed:false, landed:false, damage:0, debris:[], record:[], inputHistory:[], controlHistory:[], targetPad:app.targetPad||'A', randomState:24024 };
    },
    target(app, flight) {
      const pads=app.resource.environment?.pads || {A:[-8,1,4],B:[12,1,-10]};const pad=pads[flight.targetPad||app.targetPad||'B'] || pads.B || pads.A;
      const heading=(flight.heading||0)*Math.PI/180;const x=pad[0]+Math.sin(heading)*3,z=pad[2]+Math.cos(heading)*3;const near=Math.hypot(flight.x-x,flight.z-z)<1.5&&Math.hypot(flight.vx,flight.vz)<1.4;return {x,y:pad[1]+(near?0.85:4.5),z};
    },
    setTarget(flight,pad){flight.targetPad=pad;flight.inputHistory.push({time:flight.time,type:'target',pad});},
    startRehearsal(app) {
      const current=app.sceneState;app.mode='rehearsal';app.flight=Flight.initial(app,current);app.flight.time=app.position;app.playing=true;app.state='rehearsal';app.duration=Math.max(30,app.position+30);app.dirty=true;
      app.flight.inputHistory.push({time:app.position,type:'start',wind:app.wind,heading:app.heading});
    },
    step(app,dt,system) {
      const f=app.flight;if(!f||f.crashed&&f.debris.every(d=>d.settled))return;
      dt=N.clamp(dt,0,.6);const steps=Math.max(1,Math.ceil(dt/.025));const h=dt/steps;
      for(let step=0;step<steps;step++){
        f.time+=h;const stale=Math.max(0,f.time-(f.control?.writtenAt||0));const control=f.control||{collective:.4,pitch:0,roll:0,yaw:0};
        if(f.fault){f.rotor=Math.max(.12,f.rotor-h*.16);f.damage=Math.min(1,f.damage+h*.2);}
        else f.rotor=Math.min(1,f.rotor+h*.4);
        const instability=N.clamp((stale-.13)*1.8,0,2.8);const noise=Math.sin(f.time*11.7)+Math.sin(f.time*6.13)*.6;
        f.vp+=(control.pitch*2.4-f.pitch*2.5-f.vp*1.65+noise*instability*.65)*h;
        f.vr+=(control.roll*2.4-f.roll*2.5-f.vr*1.65+Math.cos(f.time*9.3)*instability*.7)*h;
        f.pitch+=f.vp*h;f.roll+=f.vr*h;f.yaw+=control.yaw*h*1.7;
        const tilt=Math.cos(f.pitch)*Math.cos(f.roll);const thrust=f.crashed?0:24*control.collective*f.rotor;
        f.vy+=(thrust*Math.max(.1,tilt)-9.8-f.vy*.16)*h;
        f.vx+=((f.crashed?0:f.roll*5.2)+(app.wind||0)*.65-f.vx*(f.crashed?2.8:.3))*h;f.vz+=((f.crashed?0:f.pitch*5.2)-f.vz*(f.crashed?2.8:.3))*h;
        if(f.crashed){f.vp*=Math.max(0,1-3*h);f.vr*=Math.max(0,1-3*h);}
        f.x+=f.vx*h;f.y+=f.vy*h;f.z+=f.vz*h;
        const floor=heightAt(app.resource,f.x,f.z)+.8;
        if(f.y<=floor){
          const severe=f.vy<-2.1||Math.abs(f.pitch)>.72||Math.abs(f.roll)>.72||f.fault;
          f.y=floor;
          if(severe&&!f.crashed){f.crashed=true;f.damage=1;f.crashTime=f.time;f.crashPosition=[f.x,f.y,f.z];f.vy=Math.abs(f.vy)*.13;f.debris=(app.resource.parts||[]).filter(part=>part.detach).map((part,i)=>({partId:part.id,position:[f.x,f.y,f.z],velocity:[Math.cos(i*2.4)*(2+i%3),2.5+i%2,Math.sin(i*2.4)*(2+i%3)],rotation:[0,0,0],angular:[1+i*.3,2+i*.2,1.4],settled:false}));}
          else if(f.crashed){f.vy=0;f.vx*=.72;f.vz*=.72;f.pitch*=Math.max(0,1-2*h);f.roll*=Math.max(0,1-2*h);}
          else{f.vy=0;f.vx*=.75;f.vz*=.75;f.pitch*=.6;f.roll*=.6;f.landed=true;}
        }
        if(!f.crashed){(app.resource.environment?.objects||[]).filter(o=>o.obstacle).forEach(o=>{const sx=(o.scale?.[0]||1),sy=(o.scale?.[1]||1),sz=(o.scale?.[2]||1);if(Math.abs(f.x-o.position[0])<sx&&Math.abs(f.z-o.position[2])<sz&&f.y<o.position[1]+sy&&f.y>o.position[1]-sy){f.crashed=true;f.fault=true;f.damage=1;f.crashTime=f.time;f.crashPosition=[f.x,f.y,f.z];f.vx*=-.2;f.vz*=-.2;f.vy=-2;}});}
        f.debris.forEach(d=>{if(d.settled)return;d.velocity[1]-=9.8*h;d.position=V.add(d.position,V.scale(d.velocity,h));d.rotation=V.add(d.rotation,V.scale(d.angular,h));const ground=heightAt(app.resource,d.position[0],d.position[2])+.12;if(d.position[1]<=ground){d.position[1]=ground;d.velocity[1]=Math.abs(d.velocity[1])*.18;d.velocity[0]*=.5;d.velocity[2]*=.5;d.angular=V.scale(d.angular,.5);if(V.length(d.velocity)<.35){d.settled=true;d.velocity=[0,0,0];d.angular=[0,0,0];}}});
        f.record.push(Flight.snapshotFlight(f));if(f.record.length>7200)f.record.shift();
      }
      app.record=f.record;app.duration=Math.max(30,f.time);app.renderDirty=true;
    },
    snapshotFlight(f){const data=N.clone(f);data.record=[];data.controlHistory=[];data.inputHistory=[];return data;},
    sample(app,f) {
      const root={position:[f.x,f.y,f.z],rotation:[f.pitch,f.yaw,f.roll],rotor:f.rotor,damage:f.damage,phase:f.crashed?'撞击与余波':'飞行排演'};
      const crash=f.crashed?{time:f.crashTime,position:f.crashPosition}:null;const state=stateFromRoot(app.resource,f.time,root,{crash,damage:f.damage,rotorAngle:f.time*f.rotor*32});
      if(f.crashed){state.parts.forEach(part=>{const d=f.debris.find(item=>item.partId===part.id);if(d){part.detached=true;part.worldPosition=N.clone(d.position);part.worldRotation=N.clone(d.rotation);part.damage=1;part.settled=d.settled;}});}
      state.particles=effectsFor(app.resource,f.time,root,state);if(f.fault&&!f.crashed){const rand=randomSeeded(Math.floor(f.time*30)+24);for(let i=0;i<20;i++){const age=(f.time*.35+i/20)%1;state.particles.push({kind:'smoke',position:[f.x-age*1.5,f.y+.4+age*3,f.z+age],scale:[.3+age,.4+age,.3+age],color:[.18,.17,.2],alpha:.5*(1-age)});}}
      return state;
    },
    sampleRecord(app,time) {
      const record=app.record||[];if(!record.length)return Scene.sample(app.resource,time);let index=0;while(index<record.length-1&&record[index+1].time<time)index++;const a=record[index],b=record[Math.min(index+1,record.length-1)];const t=b.time===a.time?0:N.clamp((time-a.time)/(b.time-a.time),0,1);const f=N.clone(a);
      ['x','y','z','vx','vy','vz','pitch','roll','yaw','vp','vr','rotor','damage'].forEach(key=>f[key]=a[key]+((b[key]??a[key])-a[key])*t);f.time=time;
      if(time>=b.time&&b.crashed){f.debris=N.clone(b.debris);f.crashed=true;f.crashPosition=b.crashPosition;f.crashTime=b.crashTime;}
      return Flight.sample(app,f);
    },
    seekRecord(app,time){if(app.record?.length){app.sceneState=Flight.sampleRecord(app,time);app.frameTime=time;app.renderDirty=true;}},
    saveRecord(system,app,path) {
      if(!app.flight)throw new Error('当前没有排演记录');path=path||`/Demo/flight-${Math.floor(app.flight.time)}.flight`;
      const data={format:'nexus-flight-1',title:'24 号机飞行排演记录',resource:N.clone(app.resource),initial:N.clone(app.initialFlight||Flight.initial(app)),frames:N.clone(app.record||app.flight.record),inputs:N.clone(app.flight.inputHistory),controls:N.clone(app.flight.controlHistory),duration:app.flight.time};
      system.assertStorage(JSON.stringify(data).length);system.fs.write(path,JSON.stringify(data));app.recordPath=path;N.os.notify(system.id,'排演记录已保存',path,'success');return path;
    }
  };
  N.Flight=Flight;
})(window.Nexus);
