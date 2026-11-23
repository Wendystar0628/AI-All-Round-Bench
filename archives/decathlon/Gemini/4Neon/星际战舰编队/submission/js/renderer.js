// js/renderer.js - WebGL 2 Real-Time Renderer:
// 4x/8x MSAA HDR Float Pipeline -> 5-Level Dual-Kawase Bloom -> ACES Filmic Composite,
// Instanced Voxel Meshes, Volumetric Beams/Plumes/Trails/Dust, Lamellar Fleet Shields, Live Bridge/Hangar Space Integration.
window.App = window.App || {};

(function (App) {
  const M = App.Math;
  const Scene = App.Scene;
  const S = App.Shaders;

  // Helper: compile & link GLSL program with detailed error reporting
  function createProgram(gl, vsSrc, fsSrc, label) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        console.error(`[Shader ${label}] Compile error:`, log);
        throw new Error(`Shader ${label} failed: ${log}`);
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      console.error(`[Shader ${label}] Link error:`, log);
      throw new Error(`Program ${label} link failed: ${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Cache all active uniform locations cleanly
    const u = {};
    const numU = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numU; i++) {
      const info = gl.getActiveUniform(prog, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(prog, info.name);
    }
    return { prog, u };
  }

  // Upload a voxel mesh sub-buffer (opaque or transparent) into a VAO + VBO + EBO
  // Vertex stride: 6 floats (x, y, z, normalIdx, matId, ao)
  function uploadVoxelPart(gl, part, instBuf) {
    if (!part || !part.indices || part.indices.length === 0) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, part.vertices, gl.STATIC_DRAW);

    const stride = 24; // 6 * 4 bytes
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);

    // Bind shared dynamic instance matrix buffer on locations 4..7 (divisor 1)
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    for (let col = 0; col < 4; col++) {
      const loc = 4 + col;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, col * 16);
      gl.vertexAttribDivisor(loc, 1);
    }

    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return { vao, count: part.indices.length };
  }

  function uploadVoxelModel(gl, model, instBuf) {
    return {
      opaque: uploadVoxelPart(gl, model.opaque, instBuf),
      transparent: uploadVoxelPart(gl, model.transparent, instBuf),
    };
  }

  // Procedural Volumetric Primitives:
  // 1) Tapered open cone along +Z (z: 0 -> 1, radius r0 -> r1) for Thruster Plumes & Beams!
  function buildTubeMesh(gl, segs = 24, r0 = 1.0, r1 = 0.08) {
    const verts = [];
    const inds = [];
    for (let j = 0; j <= 1; j++) {
      const z = j;
      const r = j === 0 ? r0 : r1;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const a = u * Math.PI * 2;
        const cx = Math.cos(a), sy = Math.sin(a);
        verts.push(cx * r, sy * r, z, cx, sy, 0, u, z);
      }
    }
    const ring = segs + 1;
    for (let i = 0; i < segs; i++) {
      const a = i, b = i + 1, c = ring + i, d = ring + i + 1;
      inds.push(a, b, d, a, d, c);
    }
    return uploadPosNormUv(gl, new Float32Array(verts), new Uint16Array(inds));
  }

  // 2) Unit Quad in XY plane [-1..+1] for Billboards & Shock-Rings
  function buildQuadMesh(gl) {
    const verts = new Float32Array([
      -1, -1, 0,  0, 0, 1,  0, 0,
       1, -1, 0,  0, 0, 1,  1, 0,
       1,  1, 0,  0, 0, 1,  1, 1,
      -1,  1, 0,  0, 0, 1,  0, 1,
    ]);
    const inds = new Uint16Array([0, 1, 2, 0, 2, 3]);
    return uploadPosNormUv(gl, verts, inds);
  }

  // 3) Smooth Unit Sphere (for Contoured Lamellar Fleet Shields!)
  function buildSphereMesh(gl, rings = 24, sectors = 36) {
    const verts = [];
    const inds = [];
    for (let r = 0; r <= rings; r++) {
      const v = r / rings;
      const phi = v * Math.PI;
      const sinP = Math.sin(phi), cosP = Math.cos(phi);
      for (let s = 0; s <= sectors; s++) {
        const u = s / sectors;
        const theta = u * Math.PI * 2;
        const x = sinP * Math.cos(theta);
        const y = sinP * Math.sin(theta);
        const z = cosP;
        verts.push(x, y, z, x, y, z, u, v);
      }
    }
    const stride = sectors + 1;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < sectors; s++) {
        const a = r * stride + s;
        const b = a + 1;
        const c = (r + 1) * stride + s;
        const d = c + 1;
        inds.push(a, c, b, b, c, d);
      }
    }
    return uploadPosNormUv(gl, new Float32Array(verts), new Uint16Array(inds));
  }

  function uploadPosNormUv(gl, verts, inds) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, inds, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: inds.length };
  }

  // Invert 4x4 matrix (for skybox inverse view-projection)
  function invertMat4(m) {
    const inv = new Float32Array(16);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return inv;
    det = 1.0 / det;
    inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return inv;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false, // We use our own 4x/8x MSAA HDR float renderbuffer!
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true, // Bulletproof frame capture for export & screenshots!
        powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL 2 is required.');
      this.gl = gl;

      // Enable float color buffers for HDR + Bloom
      this.extFloat = gl.getExtension('EXT_color_buffer_float');
      this.extHalf = gl.getExtension('EXT_color_buffer_half_float');
      this.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 4;
      this.hdrFormat = this.extFloat ? gl.RGBA16F : gl.RGBA8;

      // Compile all shader programs
      this.progSky = createProgram(gl, S.SKY_VS, S.SKY_FS, 'Sky');
      this.progVoxel = createProgram(gl, S.VOXEL_VS, S.VOXEL_FS, 'Voxel');
      this.progFx = createProgram(gl, S.FX_VS, S.FX_FS, 'FX');
      this.progTrail = createProgram(gl, S.TRAIL_VS, S.TRAIL_FS, 'Trail');
      this.progShield = createProgram(gl, S.SHIELD_VS, S.SHIELD_FS, 'Shield');
      this.progBloomPre = createProgram(gl, S.QUAD_VS, S.BLOOM_PRE_FS, 'BloomPre');
      this.progBloomDown = createProgram(gl, S.QUAD_VS, S.BLOOM_DOWN_FS, 'BloomDown');
      this.progBloomUp = createProgram(gl, S.QUAD_VS, S.BLOOM_UP_FS, 'BloomUp');
      this.progComposite = createProgram(gl, S.QUAD_VS, S.COMPOSITE_FS, 'Composite');

      // Shared dynamic instance buffer (up to 512 mat4s = 32 KB)
      this.instBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, 512 * 64, gl.DYNAMIC_DRAW);
      this.instStaging = new Float32Array(512 * 16);

      // Dynamic missile trail ribbon VAO/VBO (up to 24 trails * 46 verts * 6 floats)
      this.trailVao = gl.createVertexArray();
      gl.bindVertexArray(this.trailVao);
      this.trailVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
      gl.bufferData(gl.ARRAY_BUFFER, 4096 * 24, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20);
      gl.bindVertexArray(null);
      this.trailVerts = new Float32Array(4096 * 6);

      // Empty VAO for procedural fullscreen triangles
      this.emptyVao = gl.createVertexArray();

      // Upload procedural volumetric meshes
      this.meshPlumeCone = buildTubeMesh(gl, 24, 1.0, 0.06);
      this.meshBeamCyl = buildTubeMesh(gl, 28, 1.0, 1.0);
      this.meshBoltCyl = buildTubeMesh(gl, 12, 0.55, 0.20);
      this.meshQuad = buildQuadMesh(gl);
      this.meshShield = buildSphereMesh(gl, 28, 42);

      // Pre-seed 360 sleek ambient drifting 3D space dust motes (exact integer speedScale -> 100% seamless loop wrap!)
      this.spaceDust = [];
      const rng = M.mulberry32(771122);
      for (let i = 0; i < 360; i++) {
        this.spaceDust.push({
          x: (rng() - 0.5) * 2600,
          y: (rng() - 0.5) * 1100,
          z0: rng() * 3400,
          size: 0.9 + rng() * 2.1,
          speedScale: (i % 3 === 0) ? 2.0 : 1.0,
          tint: rng(),
        });
      }

      // Build & upload ALL voxel geometry (Ships, Interiors, Fractured Asteroids!)
      const shipsRaw = App.ShipModels.buildAll();
      const interiorsRaw = App.InteriorModels.buildAll();
      const asteroidsRaw = App.AsteroidModels.buildAll();

      this.models = {
        flagship: uploadVoxelModel(gl, shipsRaw.flagship, this.instBuf),
        pulseTurret: uploadVoxelModel(gl, shipsRaw.pulseTurret, this.instBuf),
        hoverPylon: uploadVoxelModel(gl, shipsRaw.hoverPylon, this.instBuf),
        closeEscort: uploadVoxelModel(gl, shipsRaw.closeEscort, this.instBuf),
        ciwsTurret: uploadVoxelModel(gl, shipsRaw.ciwsTurret, this.instBuf),
        vanguardEscort: uploadVoxelModel(gl, shipsRaw.vanguardEscort, this.instBuf),
        shuttle: uploadVoxelModel(gl, shipsRaw.shuttle, this.instBuf),
        missile: uploadVoxelModel(gl, shipsRaw.missile, this.instBuf),

        bridge: uploadVoxelModel(gl, interiorsRaw.bridge, this.instBuf),
        bridgeHologram: uploadVoxelModel(gl, interiorsRaw.bridgeHologram, this.instBuf),
        coreAtrium: uploadVoxelModel(gl, interiorsRaw.coreAtrium, this.instBuf),
        coreRingA: uploadVoxelModel(gl, interiorsRaw.coreRingA, this.instBuf),
        coreRingB: uploadVoxelModel(gl, interiorsRaw.coreRingB, this.instBuf),
        coreRingC: uploadVoxelModel(gl, interiorsRaw.coreRingC, this.instBuf),
        hangar: uploadVoxelModel(gl, interiorsRaw.hangar, this.instBuf),
        hangarRig: uploadVoxelModel(gl, interiorsRaw.hangarRig, this.instBuf),
        corridor: uploadVoxelModel(gl, interiorsRaw.corridor, this.instBuf),
        energyBlock: uploadVoxelModel(gl, interiorsRaw.energyBlock, this.instBuf),
        conduitClamp: uploadVoxelModel(gl, interiorsRaw.conduitClamp, this.instBuf),
      };

      this.asteroidModels = {};
      for (const key of ['heroBeam', 'heroMissile', 'medA', 'medB', 'smallA', 'smallB']) {
        this.asteroidModels[key] = {
          radius: asteroidsRaw[key].radius,
          chunks: asteroidsRaw[key].chunks.map((c) => ({
            gpu: uploadVoxelModel(gl, c.mesh, this.instBuf),
            centroid: c.centroid,
            dir: c.dir,
          })),
        };
      }
      this.debrisGpu = asteroidsRaw.debrisMeshes.map((m) => uploadVoxelModel(gl, m, this.instBuf));

      // Upload static material palette uniforms once!
      gl.useProgram(this.progVoxel.prog);
      gl.uniform4fv(this.progVoxel.u.uMatColorAlpha, App.Materials.colorAlphaArr);
      gl.uniform4fv(this.progVoxel.u.uMatPBR, App.Materials.pbrArr);

      // Scratch matrices & dynamic light arrays
      this.projMat = M.m4Create();
      this.viewMat = M.m4Create();
      this.vpMat = M.m4Create();
      this.tmpMat = M.m4Create();
      this.tmpMat2 = M.m4Create();
      this.lightPosRad = new Float32Array(16 * 4);
      this.lightColor = new Float32Array(16 * 4);
      this.numLights = 0;

      // Key warm starlight direction (aligned with skybox crescent planet & corona!)
      this.sunDir = M.v3Norm([0.66, 0.36, 0.66]);

      this.fbWidth = 0;
      this.fbHeight = 0;
      this.fbo = null;
      this.resize(canvas.width || 1920, canvas.height || 1080);
    }

    // Create / recreate MSAA HDR Framebuffer + Resolve FBO + 5-Level Bloom Chain
    resize(w, h) {
      w = Math.max(16, Math.min(3840, w | 0));
      h = Math.max(16, Math.min(2160, h | 0));
      if (this.fbWidth === w && this.fbHeight === h && this.fbo) return;
      this.fbWidth = w;
      this.fbHeight = h;
      const gl = this.gl;

      // Clean up old FBOs
      if (this.fbo) {
        gl.deleteFramebuffer(this.fbo.msaaFbo);
        gl.deleteRenderbuffer(this.fbo.msaaColor);
        gl.deleteRenderbuffer(this.fbo.msaaDepth);
        gl.deleteFramebuffer(this.fbo.resolveFbo);
        gl.deleteTexture(this.fbo.sceneTex);
        for (const b of this.fbo.bloom) {
          gl.deleteFramebuffer(b.fbo);
          gl.deleteTexture(b.tex);
        }
      }

      const makeTex = (tw, th) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const intFmt = this.extFloat ? gl.RGBA16F : gl.RGBA8;
        const type = this.extFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, 0, intFmt, tw, th, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      };

      // Use 4x MSAA (super sharp edges & rock-solid at 4K 3840x2160!)
      const samples = Math.min(this.maxSamples, w > 2560 ? 4 : 8);

      const msaaFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFbo);
      const msaaColor = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, msaaColor);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, this.hdrFormat, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msaaColor);

      const msaaDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, msaaDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msaaDepth);

      const resolveFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFbo);
      const sceneTex = makeTex(w, h);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);

      // 5-level Dual-Kawase bloom chain (1/2, 1/4, 1/8, 1/16, 1/32)
      const bloom = [];
      let bw = w, bh = h;
      for (let i = 0; i < 5; i++) {
        bw = Math.max(2, bw >> 1);
        bh = Math.max(2, bh >> 1);
        const tex = makeTex(bw, bh);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        bloom.push({ fbo, tex, w: bw, h: bh });
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.fbo = { msaaFbo, msaaColor, msaaDepth, resolveFbo, sceneTex, bloom };
    }

    resetLights() {
      this.numLights = 0;
    }

    addLight(pos, radius, color) {
      if (this.numLights >= 16) return;
      const i = this.numLights * 4;
      this.lightPosRad[i] = pos[0];
      this.lightPosRad[i + 1] = pos[1];
      this.lightPosRad[i + 2] = pos[2];
      this.lightPosRad[i + 3] = radius;
      this.lightColor[i] = color[0];
      this.lightColor[i + 1] = color[1];
      this.lightColor[i + 2] = color[2];
      this.lightColor[i + 3] = 1.0;
      this.numLights++;
    }

    uploadLights() {
      const gl = this.gl;
      const u = this.progVoxel.u;
      gl.uniform1i(u.uNumLights, this.numLights);
      if (this.numLights > 0) {
        gl.uniform4fv(u.uLightPosRad, this.lightPosRad);
        gl.uniform4fv(u.uLightColor, this.lightColor);
      }
    }

    // Draw a single voxel mesh (opaque or transparent pass)
    drawVoxel(modelGpu, modelMat, pass, opts = {}) {
      const part = pass === 'opaque' ? modelGpu.opaque : modelGpu.transparent;
      if (!part) return;
      const gl = this.gl;
      const u = this.progVoxel.u;
      gl.uniform1f(u.uInstanced, 0.0);
      gl.uniformMatrix4fv(u.uModel, false, modelMat);
      gl.uniform1f(u.uChargeProgress, opts.charge || 0.0);
      gl.uniform1f(u.uHeat, opts.heat || 0.0);
      gl.uniform1f(u.uPulse, opts.pulse !== undefined ? opts.pulse : 1.0);
      gl.uniform1f(u.uShieldRim, opts.shieldRim || 0.0);
      gl.uniform1f(u.uClipZMin, opts.clipZMin !== undefined ? opts.clipZMin : -9999.0);
      gl.bindVertexArray(part.vao);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
    }

    // Draw instanced batch of identical voxel meshes!
    drawVoxelInstanced(modelGpu, matrices, count, pass, opts = {}) {
      if (count <= 0) return;
      const part = pass === 'opaque' ? modelGpu.opaque : modelGpu.transparent;
      if (!part) return;
      const gl = this.gl;
      const u = this.progVoxel.u;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, matrices.subarray(0, count * 16));
      gl.uniform1f(u.uInstanced, 1.0);
      gl.uniform1f(u.uChargeProgress, 0.0);
      gl.uniform1f(u.uHeat, opts.heat || 0.0);
      gl.uniform1f(u.uPulse, opts.pulse !== undefined ? opts.pulse : 1.0);
      gl.uniform1f(u.uShieldRim, opts.shieldRim || 0.0);
      gl.uniform1f(u.uClipZMin, -9999.0);
      gl.bindVertexArray(part.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0, count);
    }

    // Build camera-facing billboard matrix at `pos` with `scale`
    composeBillboard(out, pos, camRight, camUp, camFwd, scaleX, scaleY) {
      out[0] = camRight[0] * scaleX; out[1] = camRight[1] * scaleX; out[2] = camRight[2] * scaleX; out[3] = 0;
      out[4] = camUp[0] * scaleY;    out[5] = camUp[1] * scaleY;    out[6] = camUp[2] * scaleY;    out[7] = 0;
      out[8] = camFwd[0];            out[9] = camFwd[1];            out[10] = camFwd[2];           out[11] = 0;
      out[12] = pos[0];              out[13] = pos[1];              out[14] = pos[2];              out[15] = 1;
      return out;
    }

    // =========================================================================
    // MASTER FRAME RENDERER: render(globalTime)
    // =========================================================================
    render(globalTime) {
      const gl = this.gl;
      const w = this.fbWidth, h = this.fbHeight;
      const state = Scene.evaluate(globalTime);
      const cam = state.cam;
      const mode = cam.mode;

      // Build camera matrices (with subtle cinematic bank roll!)
      const aspect = w / h;
      const near = (mode === 'exterior') ? 4.0 : 1.5;
      const far = 14000.0;
      M.m4Perspective(this.projMat, (cam.fov * Math.PI) / 180, aspect, near, far);

      const fwd = M.v3Norm(M.v3Sub(cam.target, cam.pos));
      const worldUp = [Math.sin(cam.roll), Math.cos(cam.roll), 0];
      M.m4LookAt(this.viewMat, cam.pos, cam.target, worldUp);
      M.m4Mul(this.vpMat, this.projMat, this.viewMat);

      const camRight = [this.viewMat[0], this.viewMat[4], this.viewMat[8]];
      const camUp = [this.viewMat[1], this.viewMat[5], this.viewMat[9]];
      const camBack = [this.viewMat[2], this.viewMat[6], this.viewMat[10]];

      // Bind MSAA HDR Framebuffer!
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.msaaFbo);
      gl.viewport(0, 0, w, h);
      gl.depthMask(true);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0.008, 0.014, 0.028, 1.0);
      gl.clearDepth(1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // --- STEP 1: SKYBOX (Rendered in exterior, bridge & hangar where deep space is visible!) ---
      if (mode === 'exterior' || mode === 'bridge' || mode === 'hangar') {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.BLEND);
        gl.useProgram(this.progSky.prog);
        const invVP = invertMat4(this.vpMat);
        gl.uniformMatrix4fv(this.progSky.u.uInvViewProj, false, invVP);
        gl.uniform3fv(this.progSky.u.uCamPos, cam.pos);
        gl.uniform3fv(this.progSky.u.uSunDir, this.sunDir);
        gl.uniform1f(this.progSky.u.uTime, state.t);
        gl.bindVertexArray(this.emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // --- STEP 2: GATHER SCENE DYNAMIC LIGHTS & CONFIGURE VOXEL SHADER ---
      this.resetLights();
      const isInterior = (mode === 'core' || mode === 'corridor' || mode === 'hangar');
      let fogColor = [0.012, 0.024, 0.046];
      let fogDensity = 0.00007;
      let sunColor = [1.85, 1.56, 1.24];
      let ambSky = [0.13, 0.24, 0.40];
      let ambGnd = [0.045, 0.075, 0.14];

      if (mode === 'exterior') {
        // Aft Flagship thruster glow lights (intensifies markedly during overdrive acceleration!)
        const tBoost = 1.0 + state.thrusterBoost * 1.8;
        this.addLight([state.flagshipPos[0], state.flagshipPos[1] + 4, state.flagshipPos[2] - 585], 420, [0.22 * tBoost, 1.05 * tBoost, 1.85 * tBoost]);
        // Travelling bow-to-stern Shield Deployment Wave event lighting catching Flagship hull terraces!
        if (state.flagshipShield.alpha > 0.02) {
          const sa = state.flagshipShield.alpha;
          const dep = state.flagshipShield.deploy;
          const wavePulse = dep < 0.99 ? (1.0 + Math.sin(dep * Math.PI) * 1.15) : 0.55;
          const waveZ = M.lerp(560, -540, dep);
          this.addLight(
            [state.flagshipPos[0], state.flagshipPos[1] + 110, state.flagshipPos[2] + waveZ],
            560,
            [0.32 * sa * wavePulse, 1.05 * sa * wavePulse, 1.65 * sa * wavePulse]
          );
          if (dep < 0.96) {
            // Subtle warm-gold leading sheen along the expanding contour crest
            this.addLight(
              [state.flagshipPos[0] - 180, state.flagshipPos[1] + 45, state.flagshipPos[2] + waveZ + 60],
              420,
              [0.95 * sa * wavePulse, 0.72 * sa * wavePulse, 0.35 * sa * wavePulse]
            );
          }
        }
        if (state.beam.muzzleChargeGlow > 0.02) {
          const g = state.beam.muzzleChargeGlow;
          this.addLight(state.beam.origin, 320, [0.35 * g * 1.7, 1.35 * g * 1.7, 2.05 * g * 1.7]);
        }
        if (state.beam.active) {
          const s = state.beam.strength;
          const midBeam = M.v3Lerp(state.beam.origin, state.beam.target, 0.48);
          this.addLight(midBeam, 390, [0.25 * s * 1.4, 1.15 * s * 1.4, 1.95 * s * 1.4]);
          this.addLight(state.beam.target, 380, [1.55 * s * 1.4, 1.05 * s * 1.4, 0.72 * s * 1.4]);
        }
        const allFlashes = [...state.missileFlashes, ...state.pulseFlashes, ...state.ciwsFlashes];
        allFlashes.sort((a, b) => b.intensity - a.intensity);
        for (let i = 0; i < Math.min(allFlashes.length, 10); i++) {
          const fl = allFlashes[i];
          const isAmber = fl.kind.includes('missile') || fl.kind.includes('ciws') || fl.kind.includes('pulse');
          const lc = isAmber
            ? [1.85 * fl.intensity, 0.88 * fl.intensity, 0.22 * fl.intensity]
            : [0.25 * fl.intensity, 1.25 * fl.intensity, 1.95 * fl.intensity];
          this.addLight(fl.pos, 160 + fl.scale * 1.5, lc);
        }
      } else if (mode === 'bridge') {
        fogColor = [0.012, 0.025, 0.045];
        fogDensity = 0.00014;
        ambSky = [0.11, 0.20, 0.34];
        ambGnd = [0.04, 0.08, 0.14];
        // Sculpted theatrical Bridge lighting: crisp cyan holo pool, warm amber consoles, starlight through window!
        this.addLight([0, 22, 6], 95, [0.22, 1.05, 1.55]);
        this.addLight([-38, 16, -24], 72, [0.20, 0.72, 1.05]);
        this.addLight([ 38, 16, -24], 72, [0.20, 0.72, 1.05]);
        this.addLight([-36, 16,  24], 72, [1.05, 0.62, 0.18]);
        this.addLight([ 36, 16,  24], 72, [1.05, 0.62, 0.18]);
        this.addLight([  0, 40,  60], 110, [0.95, 0.82, 0.64]);
      } else if (mode === 'core') {
        fogColor = [0.008, 0.028, 0.052];
        fogDensity = 0.0014;
        ambSky = [0.045, 0.11, 0.19];
        ambGnd = [0.02, 0.05, 0.09];
        // Breathing saturated cyan core illumination (leaves rich dark undersides & deep atrium shadows!)
        const p = state.corePulse;
        this.addLight([0, -68, 0], 185, [0.16 * p * 1.15, 0.95 * p * 1.15, 1.48 * p * 1.15]);
        this.addLight([0, -18, 0], 205, [0.20 * p * 1.25, 1.08 * p * 1.25, 1.65 * p * 1.25]);
        this.addLight([0,  32, 0], 205, [0.20 * p * 1.25, 1.08 * p * 1.25, 1.65 * p * 1.25]);
        this.addLight([0,  78, 0], 185, [0.16 * p * 1.15, 0.95 * p * 1.15, 1.48 * p * 1.15]);
        const a1 = state.t * 0.45;
        this.addLight([Math.cos(a1) * 58, -16, Math.sin(a1) * 58], 105, [1.35, 0.68, 0.16]);
        this.addLight([Math.cos(-a1 * 0.8 + 1.5) * 64, 34, Math.sin(-a1 * 0.8 + 1.5) * 64], 105, [1.35, 0.68, 0.16]);
      } else if (mode === 'hangar') {
        fogColor = [0.010, 0.022, 0.042];
        fogDensity = 0.0012;
        ambSky = [0.09, 0.15, 0.24];
        ambGnd = [0.04, 0.06, 0.11];
        // Moody industrial hangar bay illumination with dramatic receding longitudinal pools!
        this.addLight([0, 12,  140], 135, [0.42, 0.72, 1.08]);
        this.addLight([0, 12,   40], 135, [0.85, 0.58, 0.28]);
        this.addLight([0, 12,  -50], 135, [0.38, 0.74, 1.12]);
        this.addLight([0,  0, -165], 175, [0.45, 1.15, 1.75]);
        this.addLight([-44, -8,  20], 78, [0.95, 0.52, 0.16]);
        this.addLight([ 44, -8, -40], 78, [0.95, 0.52, 0.16]);
      } else if (mode === 'corridor') {
        fogColor = [0.008, 0.026, 0.050];
        fogDensity = 0.0017;
        ambSky = [0.05, 0.11, 0.20];
        ambGnd = [0.025, 0.055, 0.10];
        // Deep dramatic weapon corridor lit by advancing cyan energy blocks & distant discharge core!
        this.addLight([0, 0, 178], 220, [0.42 * 1.9, 1.45 * 1.9, 2.15 * 1.9]);
        this.addLight([0, 0,  95], 150, [0.22 * 1.2, 0.92 * 1.2, 1.48 * 1.2]);
        for (let b = 0; b < 4; b++) {
          const bz = -165 + (((state.t * 92 + b * 88) % 340) + 340) % 340;
          this.addLight([0, 0, bz], 95, [0.18 * 1.1, 0.88 * 1.1, 1.45 * 1.1]);
        }
        this.addLight([0, -10, -80], 85, [1.15, 0.55, 0.14]);
        this.addLight([0,  10,  20], 85, [1.15, 0.55, 0.14]);
      }

      // Bind Master Voxel Program & global uniforms
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.useProgram(this.progVoxel.prog);
      const vu = this.progVoxel.u;
      gl.uniformMatrix4fv(vu.uViewProj, false, this.vpMat);
      gl.uniform3fv(vu.uCamPos, cam.pos);
      gl.uniform3fv(vu.uSunDir, this.sunDir);
      gl.uniform3fv(vu.uSunColor, sunColor);
      gl.uniform3fv(vu.uAmbientSky, ambSky);
      gl.uniform3fv(vu.uAmbientGround, ambGnd);
      gl.uniform3fv(vu.uFogColor, fogColor);
      gl.uniform1f(vu.uFogDensity, fogDensity);
      gl.uniform1f(vu.uInteriorMode, isInterior ? 1.0 : 0.0);
      gl.uniform1f(vu.uTime, state.t);
      gl.uniform1i(vu.uFlowMode, mode === 'core' ? 1 : (mode === 'corridor' ? 2 : 0));
      this.uploadLights();

      // --- STEP 3: OPAQUE VOXEL PASS ---
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      this.drawSceneVoxels(state, 'opaque');

      // --- STEP 4: TRANSLUCENT VOXEL PASS (1-voxel glass windows, holograms, core sheath, energy blocks!) ---
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      this.drawSceneVoxels(state, 'transparent');

      // --- STEP 5: VOLUMETRIC EFFECTS (Thruster Plumes, Beams, Bolts, CIWS, Missile Trails, Bursts, Dust, Shields!) ---
      this.drawVolumetricFX(state, camRight, camUp, camBack);

      // --- STEP 6: RESOLVE MSAA HDR -> FLOAT TEXTURE -> 5-LEVEL DUAL-KAWASE BLOOM -> ACES COMPOSITE ---
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);

      // Resolve MSAA FBO to sceneTex
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo.msaaFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.resolveFbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

      // Bloom Prefilter (sceneTex -> bloom[0])
      const b0 = this.fbo.bloom[0];
      gl.bindFramebuffer(gl.FRAMEBUFFER, b0.fbo);
      gl.viewport(0, 0, b0.w, b0.h);
      gl.useProgram(this.progBloomPre.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbo.sceneTex);
      gl.uniform1i(this.progBloomPre.u.uTex, 0);
      gl.uniform2f(this.progBloomPre.u.uTexelSize, 1.0 / w, 1.0 / h);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Bloom Downsample Chain (0 -> 1 -> 2 -> 3 -> 4)
      gl.useProgram(this.progBloomDown.prog);
      gl.uniform1i(this.progBloomDown.u.uTex, 0);
      for (let i = 1; i < this.fbo.bloom.length; i++) {
        const src = this.fbo.bloom[i - 1];
        const dst = this.fbo.bloom[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(this.progBloomDown.u.uTexelSize, 1.0 / src.w, 1.0 / src.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // Bloom Additive Upsample Chain (4 -> 3 -> 2 -> 1 -> 0)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.progBloomUp.prog);
      gl.uniform1i(this.progBloomUp.u.uTex, 0);
      for (let i = this.fbo.bloom.length - 1; i >= 1; i--) {
        const src = this.fbo.bloom[i];
        const dst = this.fbo.bloom[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(this.progBloomUp.u.uTexelSize, 1.0 / src.w, 1.0 / src.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // Final ACES Filmic Composite to Screen!
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.progComposite.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbo.sceneTex);
      gl.uniform1i(this.progComposite.u.uSceneTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fbo.bloom[0].tex);
      gl.uniform1i(this.progComposite.u.uBloomTex, 1);
      gl.uniform1f(this.progComposite.u.uExposure, mode === 'exterior' ? 1.02 : 1.06);
      gl.uniform1f(this.progComposite.u.uBloomStrength, 0.22);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // =========================================================================
    // DRAW ALL VOXEL GEOMETRY FOR CURRENT SHOT MODE (Opaque or Transparent Pass)
    // =========================================================================
    drawSceneVoxels(state, pass) {
      const mode = state.cam.mode;
      const t = state.t;

      if (mode === 'exterior' || mode === 'bridge') {
        // In 'bridge' mode, exterior world sits cleanly shifted [-68 Y, -35 Z] so Flagship's giant Split-Prow stretches right outside window!
        const extOff = (mode === 'bridge') ? [0, -68, -35] : [0, 0, 0];
        const clipFlagshipZ = (mode === 'bridge') ? 135.0 : -9999.0;

        // 1) FLAGSHIP EXTERIOR
        const fPos = M.v3Add(state.flagshipPos, extOff);
        M.m4ComposeTRS(this.tmpMat, fPos, state.flagshipRot);
        const fShieldRim = state.flagshipShield.alpha * (0.45 + 0.55 * state.flagshipShield.deploy);
        this.drawVoxel(this.models.flagship, this.tmpMat, pass, {
          charge: state.beam.chargeProgress,
          pulse: 1.0 + state.thrusterBoost * 0.9,
          shieldRim: fShieldRim,
          clipZMin: clipFlagshipZ,
        });

        // 2) FLAGSHIP PULSE TURRETS (10 hull-mounted + 4 hovering flank pods!)
        if (mode === 'exterior') {
          for (const tur of state.turretAngles) {
            M.m4ComposeTRS(this.tmpMat, M.v3Add(tur.pos, extOff), [0, tur.yaw, 0]);
            this.drawVoxel(tur.hover ? this.models.hoverPylon : this.models.pulseTurret, this.tmpMat, pass, {
              pulse: 1.0 + tur.flash * 2.2,
              shieldRim: fShieldRim,
            });
          }
        }

        // 3) 18 CLOSE-ESCORTS & 20 VANGUARD ESCORTS (Instanced in 2 ultra-fast draw calls!)
        let ceCount = 0, vgCount = 0, ciwsCount = 0;
        const ceMats = new Float32Array(24 * 16);
        const vgMats = new Float32Array(24 * 16);
        const ciwsMats = new Float32Array(80 * 16);

        let avgEscortShield = 0;
        for (const es of state.escortStates) {
          avgEscortShield += es.shield.alpha;
          const ep = M.v3Add(es.pos, extOff);
          M.m4ComposeTRS(this.tmpMat, ep, es.rot);
          if (es.def.type === 'close') {
            ceMats.set(this.tmpMat, ceCount * 16);
            ceCount++;
            // Populate 4 articulated CIWS turrets per Close-Escort!
            if (mode === 'exterior') {
              for (let m = 0; m < 4; m++) {
                const mp = es.def.ciwsMounts[m];
                const worldMp = M.m4TransformPoint(this.tmpMat, mp);
                const sweepYaw = Math.sin(t * 2.5 + ceCount + m) * 0.35;
                M.m4ComposeTRS(this.tmpMat2, worldMp, [0, es.rot[1] + sweepYaw, 0]);
                ciwsMats.set(this.tmpMat2, ciwsCount * 16);
                ciwsCount++;
              }
            }
          } else {
            vgMats.set(this.tmpMat, vgCount * 16);
            vgCount++;
          }
        }
        const escRim = (avgEscortShield / Math.max(1, state.escortStates.length)) * 0.85;
        this.drawVoxelInstanced(this.models.closeEscort, ceMats, ceCount, pass, {
          pulse: 1.0 + state.thrusterBoost * 0.9,
          shieldRim: escRim,
        });
        this.drawVoxelInstanced(this.models.vanguardEscort, vgMats, vgCount, pass, {
          pulse: 1.0 + state.thrusterBoost * 0.9,
          shieldRim: escRim,
        });
        if (mode === 'exterior' && ciwsCount > 0) {
          this.drawVoxelInstanced(this.models.ciwsTurret, ciwsMats, ciwsCount, pass, { shieldRim: escRim });
        }

        // 4) EXTERIOR SHUTTLES (8 continuous fleet shuttles)
        if (mode === 'exterior' && state.exteriorShuttles.length > 0) {
          for (let i = 0; i < state.exteriorShuttles.length; i++) {
            const sh = state.exteriorShuttles[i];
            M.m4FromPosDirScale(this.tmpMat, sh.pos, sh.dir);
            this.instStaging.set(this.tmpMat, i * 16);
          }
          this.drawVoxelInstanced(this.models.shuttle, this.instStaging, state.exteriorShuttles.length, pass);
        }

        // 5) REAL 18-VOXEL MISSILES IN FLIGHT!
        if (mode === 'exterior' && state.activeMissiles.length > 0) {
          for (let i = 0; i < state.activeMissiles.length; i++) {
            const ms = state.activeMissiles[i];
            M.m4FromPosDirScale(this.tmpMat, ms.pos, ms.dir);
            this.instStaging.set(this.tmpMat, i * 16);
          }
          this.drawVoxelInstanced(this.models.missile, this.instStaging, state.activeMissiles.length, pass, { pulse: 1.6 });
        }

        // 6) CRAGGY VOXEL ASTEROIDS & PRE-FRACTURED INTERLOCKING CHUNKS!
        for (const as of state.asteroidStates) {
          // Once shattered debris has rushed far behind the fleet past the rear boundary, skip cleanly for seamless loop wrap!
          if (as.pos[2] < -2650) continue;
          const aModel = this.asteroidModels[as.def.model];
          if (!aModel) continue;
          const basePos = M.v3Add(as.pos, extOff);
          M.m4ComposeTRS(this.tmpMat, basePos, as.rot);

          for (let ci = 0; ci < aModel.chunks.length; ci++) {
            const ch = aModel.chunks[ci];
            const split = as.splitTime;
            // Interlocking zero-gap centroid position before shatter; cleaves dramatically apart on hit!
            const sepDist = as.preCrack + (split > 0 ? (as.def.shatterPower * (1.0 - Math.exp(-split * 0.65)) * 2.1 + split * 22.0) : 0);
            const localCtr = [
              ch.centroid[0] + ch.dir[0] * sepDist,
              ch.centroid[1] + ch.dir[1] * sepDist,
              ch.centroid[2] + ch.dir[2] * sepDist,
            ];
            const worldP = M.m4TransformPoint(this.tmpMat, localCtr);
            const tumble = split > 0 ? split * (0.35 + (ci % 3) * 0.22) : 0;
            const cRot = [
              as.rot[0] + tumble * (ci % 2 === 0 ? 1 : -1),
              as.rot[1] + tumble * 0.85,
              as.rot[2] + tumble * (ci % 3 === 0 ? -0.7 : 0.6),
            ];
            M.m4ComposeTRS(this.tmpMat2, worldP, cRot);
            this.drawVoxel(ch.gpu, this.tmpMat2, pass, { heat: as.heat });
          }
        }

        // Next-cycle pristine approaching asteroids far ahead during loop wrap (70..78s)!
        if (mode === 'exterior' && state.nextAsteroids.length > 0) {
          for (const na of state.nextAsteroids) {
            const aModel = this.asteroidModels[na.def.model];
            M.m4ComposeTRS(this.tmpMat, na.pos, na.rot);
            for (const ch of aModel.chunks) {
              const worldP = M.m4TransformPoint(this.tmpMat, ch.centroid);
              M.m4ComposeTRS(this.tmpMat2, worldP, na.rot);
              this.drawVoxel(ch.gpu, this.tmpMat2, pass, { heat: 0 });
            }
          }
        }

        // 7) FLYING TRUE-VOXEL DEBRIS SHARDS SPAWNED ON SHATTER!
        if (mode === 'exterior' && t >= 47.5) {
          const buckets = [[], [], [], [], [], []];
          for (const dp of state.debrisParticles) {
            if (t < dp.tSpawn) continue;
            const age = t - dp.tSpawn;
            const ast = state.asteroidStates[dp.astIdx];
            if (ast.pos[2] < -2650) continue;
            const pos = [
              ast.pos[0] + dp.startOff[0] + dp.vel[0] * age,
              ast.pos[1] + dp.startOff[1] + dp.vel[1] * age,
              ast.pos[2] + dp.startOff[2] + dp.vel[2] * age,
            ];
            const rot = [
              dp.initRot[0] + dp.rotVel[0] * age,
              dp.initRot[1] + dp.rotVel[1] * age,
              dp.initRot[2] + dp.rotVel[2] * age,
            ];
            buckets[dp.variant].push({ pos, rot, heat: Math.exp(-age * 0.55) });
          }
          for (let v = 0; v < 6; v++) {
            const list = buckets[v];
            if (list.length === 0) continue;
            let avgHeat = 0;
            for (let k = 0; k < list.length; k++) {
              M.m4ComposeTRS(this.tmpMat, list[k].pos, list[k].rot);
              this.instStaging.set(this.tmpMat, k * 16);
              avgHeat += list[k].heat;
            }
            this.drawVoxelInstanced(this.debrisGpu[v], this.instStaging, list.length, pass, {
              heat: avgHeat / list.length,
            });
          }
        }
      }

      // --- INTERIOR 1: WIDE COMMAND BRIDGE + LIVE ROTATING 3D HOLOGRAPHIC FLEET ---
      if (mode === 'bridge') {
        // Switch lighting & enable subtle holographic display scanline shimmer for Bridge hall!
        const gl = this.gl;
        gl.uniform1f(this.progVoxel.u.uInteriorMode, 1.0);
        gl.uniform1i(this.progVoxel.u.uFlowMode, 3);
        M.m4Identity(this.tmpMat);
        this.drawVoxel(this.models.bridge, this.tmpMat, pass, { pulse: 1.0 });

        // Hovering live animated 3D Holographic Fleet Tactical Projection above Central Nexus!
        const holoY = 21.5 + Math.sin(t * 1.8) * 0.9;
        M.m4ComposeTRS(this.tmpMat, [0, holoY, 6], [0, t * 0.28, 0]);
        this.drawVoxel(this.models.bridgeHologram, this.tmpMat, pass, { pulse: 1.15 + 0.15 * Math.sin(t * 5.0) });
        gl.uniform1i(this.progVoxel.u.uFlowMode, 0);
      }

      // --- INTERIOR 2: MULTI-TIER POWER CORE ATRIUM + 5 COUNTER-ROTATING GIMBAL RINGS ---
      if (mode === 'core') {
        M.m4Identity(this.tmpMat);
        this.drawVoxel(this.models.coreAtrium, this.tmpMat, pass, { pulse: state.corePulse });

        // 5 Giant Segmented Counter-Rotating & Tilted Voxel Gimbal Rings around Core!
        const rings = [
          { m: this.models.coreRingA, y: -52, rx:  0.16, ry:  t * 0.34, rz:  0.08 },
          { m: this.models.coreRingB, y: -18, rx: -0.10, ry: -t * 0.26 + 1.1, rz:  0.14 },
          { m: this.models.coreRingC, y:   4, rx:  0.24, ry:  t * 0.52 + 2.2, rz: -0.18 },
          { m: this.models.coreRingB, y:  28, rx:  0.12, ry:  t * 0.24 + 0.6, rz: -0.12 },
          { m: this.models.coreRingA, y:  62, rx: -0.18, ry: -t * 0.36 + 2.7, rz:  0.09 },
        ];
        for (const r of rings) {
          M.m4ComposeTRS(this.tmpMat, [0, r.y, 0], [r.rx, r.ry, r.rz]);
          this.drawVoxel(r.m, this.tmpMat, pass, { pulse: state.corePulse });
        }
      }

      // --- INTERIOR 3: THROUGH-GOING SHUTTLE HANGAR + DOCKED/FLYING SHUTTLES + ABSTRACT CRANES ---
      if (mode === 'hangar') {
        M.m4Identity(this.tmpMat);
        this.drawVoxel(this.models.hangar, this.tmpMat, pass, { pulse: 1.0 });

        const ha = state.hangarActors;
        if (ha) {
          for (let i = 0; i < ha.shuttles.length; i++) {
            const sh = ha.shuttles[i];
            M.m4FromPosDirScale(this.tmpMat, sh.pos, sh.dir);
            this.instStaging.set(this.tmpMat, i * 16);
          }
          this.drawVoxelInstanced(this.models.shuttle, this.instStaging, ha.shuttles.length, pass);

          for (const rig of ha.rigs) {
            M.m4ComposeTRS(this.tmpMat, rig.pos, [0, rig.rotY, 0]);
            this.drawVoxel(this.models.hangarRig, this.tmpMat, pass);
          }
        }
      }

      // --- INTERIOR 4: ENERGY LOADING & CONDUIT CORRIDOR + ADVANCING ENERGY BLOCKS + ABSTRACT CLAMPS ---
      if (mode === 'corridor') {
        M.m4Identity(this.tmpMat);
        this.drawVoxel(this.models.corridor, this.tmpMat, pass, {
          pulse: 1.05 + 0.25 * Math.sin(t * 4.5),
        });

        // 16 Glowing Voxel Energy Blocks advancing continuously in staggered batches down 4 flanking rails!
        const rails = [[-29, -15], [29, -15], [-29, 15], [29, 15]];
        let ebCount = 0;
        for (let r = 0; r < 4; r++) {
          for (let k = 0; k < 4; k++) {
            const zPos = -168 + (((t * 92 + k * 84 + r * 21) % 336) + 336) % 336;
            M.m4ComposeTRS(this.tmpMat, [rails[r][0], rails[r][1], zPos], [0, 0, 0]);
            this.instStaging.set(this.tmpMat, ebCount * 16);
            ebCount++;
          }
        }
        this.drawVoxelInstanced(this.models.energyBlock, this.instStaging, ebCount, pass, {
          pulse: 1.25 + 0.35 * Math.sin(t * 7.5),
        });

        // 12 Pairs of Heavy Abstract Mechanical Clamping Jaws converging & retracting in harmonic waves!
        for (let i = 0; i < 6; i++) {
          const cz = -126 + i * 50;
          const wave = 0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.95);
          const clampX = M.lerp(28, 17, M.smoothstep(0.15, 0.85, wave));
          // Right side clamp
          M.m4ComposeTRS(this.tmpMat, [clampX, 0, cz], [0, 0, 0]);
          this.drawVoxel(this.models.conduitClamp, this.tmpMat, pass, { pulse: 0.8 + wave * 0.9 });
          // Left side mirrored clamp
          M.m4ComposeTRS(this.tmpMat, [-clampX, 0, cz], [0, Math.PI, 0]);
          this.drawVoxel(this.models.conduitClamp, this.tmpMat, pass, { pulse: 0.8 + wave * 0.9 });
        }
      }
    }

    // =========================================================================
    // DRAW VOLUMETRIC EFFECTS: THRUSTER PLUMES, MAIN BEAM, BOLTS, TRAILS, BURSTS, DUST & FLEET SHIELDS!
    // =========================================================================
    drawVolumetricFX(state, camRight, camUp, camBack) {
      const gl = this.gl;
      const mode = state.cam.mode;
      const t = state.t;

      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);

      // --- A. MISSILE CURVED SMOKE & EMBER RIBBON TRAILS (Alpha Blended!) ---
      if (mode === 'exterior' && state.missileTrails.length > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.progTrail.prog);
        gl.uniformMatrix4fv(this.progTrail.u.uViewProj, false, this.vpMat);
        gl.uniform1f(this.progTrail.u.uTime, t);
        gl.bindVertexArray(this.trailVao);

        for (const tr of state.missileTrails) {
          const pts = tr.pts;
          const n = pts.length;
          if (n < 2) continue;
          let vi = 0;
          for (let i = 0; i < n; i++) {
            const frac = i / (n - 1);
            const p = pts[i];
            const prev = pts[Math.max(0, i - 1)];
            const next = pts[Math.min(n - 1, i + 1)];
            const tan = M.v3Norm(M.v3Sub(next, prev));
            const toCam = M.v3Norm(M.v3Sub(state.cam.pos, p));
            const side = M.v3Norm(M.v3Cross(tan, toCam));
            const halfW = tr.width * (0.45 + frac * 1.15);
            const alpha = tr.alpha * (1.0 - frac * 0.72);

            // Left ribbon vertex
            this.trailVerts[vi++] = p[0] - side[0] * halfW;
            this.trailVerts[vi++] = p[1] - side[1] * halfW;
            this.trailVerts[vi++] = p[2] - side[2] * halfW;
            this.trailVerts[vi++] = 0.0;
            this.trailVerts[vi++] = frac;
            this.trailVerts[vi++] = alpha;

            // Right ribbon vertex
            this.trailVerts[vi++] = p[0] + side[0] * halfW;
            this.trailVerts[vi++] = p[1] + side[1] * halfW;
            this.trailVerts[vi++] = p[2] + side[2] * halfW;
            this.trailVerts[vi++] = 1.0;
            this.trailVerts[vi++] = frac;
            this.trailVerts[vi++] = alpha;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.trailVerts.subarray(0, vi));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, n * 2);
        }
      }

      // --- A2. BILLOWING ASTEROID IMPACT DUST CLOUDS (Alpha Blended!) ---
      if (mode === 'exterior' && state.dustPuffs && state.dustPuffs.length > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.progFx.prog);
        const fuD = this.progFx.u;
        gl.uniformMatrix4fv(fuD.uViewProj, false, this.vpMat);
        gl.uniform3fv(fuD.uCamPos, state.cam.pos);
        gl.uniform1f(fuD.uTime, t);
        gl.uniform1i(fuD.uMode, 6);
        gl.bindVertexArray(this.meshQuad.vao);
        for (const dp of state.dustPuffs) {
          gl.uniform3fv(fuD.uColorA, dp.colorA);
          gl.uniform3fv(fuD.uColorB, dp.colorB);
          gl.uniform1f(fuD.uIntensity, dp.alpha);
          this.composeBillboard(this.tmpMat, dp.pos, camRight, camUp, camBack, dp.scale, dp.scale);
          gl.uniformMatrix4fv(fuD.uModel, false, this.tmpMat);
          gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
        }
      }

      // --- B. ADDITIVE VOLUMETRIC PLASMA FX (Thruster Plumes, Main Beam, Bolts, CIWS, Shock-Rings, Bursts, Dust!) ---
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(this.progFx.prog);
      const fu = this.progFx.u;
      gl.uniformMatrix4fv(fu.uViewProj, false, this.vpMat);
      gl.uniform3fv(fu.uCamPos, state.cam.pos);
      gl.uniform1f(fu.uTime, t);

      const drawPlume = (pos, dir, radius, len, innerBoost, outerBoost, colCore, colOuter) => {
        gl.uniform1i(fu.uMode, 0);
        gl.uniform3fv(fu.uColorA, colCore);
        gl.uniform3fv(fu.uColorB, colOuter);
        gl.bindVertexArray(this.meshPlumeCone.vao);

        const breath = 0.94 + 0.06 * Math.sin(t * 7.5 + pos[0]);
        // Outer translucent plasma envelope (lags inner surge slightly for dramatic two-stage ignition!)
        const outerLen = len * (1.0 + outerBoost * 1.65) * breath;
        M.m4FromPosDirScale(this.tmpMat, pos, dir, [radius * (1.14 + outerBoost * 0.14), radius * (1.14 + outerBoost * 0.14), outerLen]);
        gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
        gl.uniform1f(fu.uIntensity, 1.02 + outerBoost * 1.32);
        gl.drawElements(gl.TRIANGLES, this.meshPlumeCone.count, gl.UNSIGNED_SHORT, 0);

        // Hot blazing inner core jet igniting & punching backward FIRST!
        const innerLen = len * (0.60 + innerBoost * 1.35) * breath;
        M.m4FromPosDirScale(this.tmpMat, pos, dir, [radius * (0.56 + innerBoost * 0.10), radius * (0.56 + innerBoost * 0.10), innerLen]);
        gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
        gl.uniform1f(fu.uIntensity, 1.95 + innerBoost * 2.45);
        gl.drawElements(gl.TRIANGLES, this.meshPlumeCone.count, gl.UNSIGNED_SHORT, 0);
      };

      const cyanCore = [0.82, 0.98, 1.0];
      const cyanOuter = [0.06, 0.58, 1.0];
      const amberCore = [1.0, 0.92, 0.65];
      const amberOuter = [1.0, 0.44, 0.08];

      if (mode === 'exterior' || mode === 'bridge') {
        const extOff = (mode === 'bridge') ? [0, -68, -35] : [0, 0, 0];

        // 1) FLAGSHIP 9 ENGINE PLUMES + OUTER-EDGE STREAMING EXHAUST SPARKS!
        if (mode === 'exterior') {
          M.m4ComposeTRS(this.tmpMat2, state.flagshipPos, state.flagshipRot);
          const aftDir = M.m4TransformDir(this.tmpMat2, [0, 0, -1]);
          for (const eng of Scene.FLAGSHIP_ENGINES) {
            const ep = M.m4TransformPoint(this.tmpMat2, eng.p);
            drawPlume(ep, aftDir, eng.r, eng.r * 9.5, state.thrusterInnerBoost, state.thrusterOuterBoost, cyanCore, cyanOuter);
          }

          // Fine exhaust plasma streams & glowing sparks shedding off outer plume lips (2.2)!
          gl.uniform1i(fu.uMode, 5);
          gl.bindVertexArray(this.meshQuad.vao);
          gl.uniform3fv(fu.uColorA, [0.82, 0.98, 1.0]);
          gl.uniform3fv(fu.uColorB, [0.08, 0.62, 1.0]);
          const sparkSpeed = 1.0 + state.thrusterOuterBoost * 2.2;
          for (let ei = 0; ei < 3; ei++) {
            const eng = Scene.FLAGSHIP_ENGINES[ei];
            const ep = M.m4TransformPoint(this.tmpMat2, eng.p);
            const count = ei === 0 ? 22 : 14;
            for (let k = 0; k < count; k++) {
              const phase = ((t * 1.45 * sparkSpeed + k / count + ei * 0.31) % 1.0);
              const dist = phase * eng.r * (12.0 + state.thrusterOuterBoost * 14.0);
              const ang = k * 2.3999 + phase * 1.6 + ei;
              const rad = eng.r * (0.78 + phase * 0.85);
              const spPos = [
                ep[0] + Math.cos(ang) * rad,
                ep[1] + Math.sin(ang) * rad,
                ep[2] - dist,
              ];
              const sz = (1.6 + (k % 3) * 0.9) * (1.0 - phase * 0.65);
              const stretch = 1.0 + state.thrusterOuterBoost * 3.0;
              this.composeBillboard(this.tmpMat, spPos, camRight, camUp, camBack, sz, sz * stretch);
              gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
              gl.uniform1f(fu.uIntensity, (1.0 - phase) * (1.1 + state.thrusterInnerBoost * 1.6));
              gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
            }
          }
        }

        // 2) ALL 38 ESCORT WARSHIP ENGINE PLUMES (114 plumes framing fleet depth!)
        for (const es of state.escortStates) {
          const baseP = M.v3Add(es.pos, extOff);
          M.m4ComposeTRS(this.tmpMat2, baseP, es.rot);
          const aftDir = M.m4TransformDir(this.tmpMat2, [0, 0, -1]);
          const lenMul = es.def.type === 'vanguard' ? 10.5 : 8.2;
          for (const eng of es.def.engines) {
            const ep = M.m4TransformPoint(this.tmpMat2, eng.p);
            drawPlume(ep, aftDir, eng.r, eng.r * lenMul, state.thrusterInnerBoost, state.thrusterOuterBoost, cyanCore, cyanOuter);
          }
        }

        // 3) ACTIVE SHUTTLE MICRO-THRUSTER PLUMES
        if (mode === 'exterior') {
          for (const sh of state.exteriorShuttles) {
            const backDir = M.v3Scale(sh.dir, -1);
            const tailP = M.v3Add(sh.pos, M.v3Scale(backDir, 14));
            drawPlume(tailP, backDir, 2.2, 22, 0.15, 0.15, cyanCore, cyanOuter);
          }
        }

        // 4) SPINAL BEAM MAIN CANNON (Muzzle Charge Orb + Sustained Beam + Clean Muzzle Disconnect + Forward Afterglow Sparks!)
        if (mode === 'exterior' && (state.beam.muzzleChargeGlow > 0.01 || state.beam.active || state.beam.sparks.length > 0)) {
          const bm = state.beam;
          if (bm.muzzleChargeGlow > 0.01) {
            gl.uniform1i(fu.uMode, 4);
            gl.uniform3fv(fu.uColorA, [0.95, 0.99, 1.0]);
            gl.uniform3fv(fu.uColorB, [0.10, 0.72, 1.0]);
            const orbSize = 18 + bm.muzzleChargeGlow * 48;
            this.composeBillboard(this.tmpMat, bm.origin, camRight, camUp, camBack, orbSize, orbSize);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, bm.muzzleChargeGlow * 2.8);
            gl.bindVertexArray(this.meshQuad.vao);
            gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
          }

          if (bm.active) {
            const beamVec = M.v3Sub(bm.target, bm.start);
            const beamLen = M.v3Len(beamVec);
            const beamDir = M.v3Scale(beamVec, 1 / Math.max(1, beamLen));

            gl.uniform1i(fu.uMode, 1);
            gl.bindVertexArray(this.meshBeamCyl.vao);

            gl.uniform3fv(fu.uColorA, [0.65, 0.96, 1.0]);
            gl.uniform3fv(fu.uColorB, [0.06, 0.52, 1.0]);
            const outerR = 20.0 * bm.radius;
            M.m4FromPosDirScale(this.tmpMat, bm.start, beamDir, [outerR, outerR, beamLen]);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, bm.strength * 1.45);
            gl.drawElements(gl.TRIANGLES, this.meshBeamCyl.count, gl.UNSIGNED_SHORT, 0);

            gl.uniform3fv(fu.uColorA, [1.0, 1.0, 1.0]);
            gl.uniform3fv(fu.uColorB, [0.42, 0.92, 1.0]);
            const innerR = 7.8 * bm.radius;
            M.m4FromPosDirScale(this.tmpMat, bm.start, beamDir, [innerR, innerR, beamLen]);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, bm.strength * 3.4);
            gl.drawElements(gl.TRIANGLES, this.meshBeamCyl.count, gl.UNSIGNED_SHORT, 0);

            gl.uniform1i(fu.uMode, 4);
            gl.uniform3fv(fu.uColorA, [1.0, 0.95, 0.85]);
            gl.uniform3fv(fu.uColorB, [0.18, 0.78, 1.0]);
            const hitScale = (70 + Math.sin(t * 36.0) * 14) * bm.strength;
            this.composeBillboard(this.tmpMat, bm.target, camRight, camUp, camBack, hitScale, hitScale);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, bm.strength * 2.5);
            gl.bindVertexArray(this.meshQuad.vao);
            gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
          }

          // Lingering cyan afterglow sparks drifting forward & scattering after beam cutoff!
          if (bm.sparks && bm.sparks.length > 0) {
            gl.uniform1i(fu.uMode, 5);
            gl.bindVertexArray(this.meshQuad.vao);
            gl.uniform3fv(fu.uColorA, [0.85, 0.98, 1.0]);
            gl.uniform3fv(fu.uColorB, [0.08, 0.68, 1.0]);
            for (const sp of bm.sparks) {
              this.composeBillboard(this.tmpMat, sp.pos, camRight, camUp, camBack, sp.size * 2.2, sp.size * 2.2);
              gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
              gl.uniform1f(fu.uIntensity, sp.intensity);
              gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
            }
          }
        }

        // 5) FLAGSHIP PULSE ENERGY BOLTS & CLOSE-ESCORT CIWS TRACERS!
        if (mode === 'exterior') {
          gl.uniform1i(fu.uMode, 2);
          gl.bindVertexArray(this.meshBoltCyl.vao);

          // Flagship Pulse Energy Bolts (grouped glowing amber-cyan darts with halos!)
          for (const b of state.activePulseBolts) {
            const tailP = M.v3Sub(b.pos, M.v3Scale(b.dir, b.len));
            // Outer colored energy halo
            gl.uniform3fv(fu.uColorA, [1.0, 0.86, 0.52]);
            gl.uniform3fv(fu.uColorB, [0.22, 0.82, 1.0]);
            M.m4FromPosDirScale(this.tmpMat, tailP, b.dir, [b.rad * 2.1, b.rad * 2.1, b.len]);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, 1.5);
            gl.drawElements(gl.TRIANGLES, this.meshBoltCyl.count, gl.UNSIGNED_SHORT, 0);
            // Bright hot core
            gl.uniform3fv(fu.uColorA, [1.0, 0.98, 0.88]);
            gl.uniform3fv(fu.uColorB, [1.0, 0.62, 0.16]);
            M.m4FromPosDirScale(this.tmpMat, tailP, b.dir, [b.rad * 0.85, b.rad * 0.85, b.len * 0.85]);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, 3.2);
            gl.drawElements(gl.TRIANGLES, this.meshBoltCyl.count, gl.UNSIGNED_SHORT, 0);
          }

          // Close-Escort Rapid-Fire CIWS Dense Dashed Tracer Streams!
          gl.uniform3fv(fu.uColorA, [1.0, 0.96, 0.78]);
          gl.uniform3fv(fu.uColorB, [1.0, 0.54, 0.12]);
          for (const tr of state.activeTracers) {
            const tailP = M.v3Sub(tr.pos, M.v3Scale(tr.dir, tr.len));
            M.m4FromPosDirScale(this.tmpMat, tailP, tr.dir, [tr.rad, tr.rad, tr.len]);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, 2.8);
            gl.drawElements(gl.TRIANGLES, this.meshBoltCyl.count, gl.UNSIGNED_SHORT, 0);
          }

          // Missile active engine booster flames!
          for (const ms of state.activeMissiles) {
            if (!ms.ignited) continue;
            const backDir = M.v3Scale(ms.dir, -1);
            const tailP = M.v3Add(ms.pos, M.v3Scale(backDir, 9));
            drawPlume(tailP, backDir, 2.8, 28, 0.4, 0.4, amberCore, amberOuter);
          }

          // 6) MUZZLE FLASHES, IMPACT BURSTS & EXPANDING ENERGY SHOCK-RINGS!
          gl.bindVertexArray(this.meshQuad.vao);
          gl.uniform1i(fu.uMode, 4);
          const allFlashes = [...state.pulseFlashes, ...state.ciwsFlashes, ...state.missileFlashes];
          for (const fl of allFlashes) {
            const isCyan = fl.kind === 'muzzle_pulse';
            gl.uniform3fv(fu.uColorA, isCyan ? [0.95, 0.99, 1.0] : [1.0, 0.95, 0.72]);
            gl.uniform3fv(fu.uColorB, isCyan ? [0.16, 0.78, 1.0] : [1.0, 0.42, 0.08]);
            this.composeBillboard(this.tmpMat, fl.pos, camRight, camUp, camBack, fl.scale, fl.scale);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, fl.intensity);
            gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
          }

          // Expanding shock-rings (beam launch rings & asteroid rupture shockwaves!)
          gl.uniform1i(fu.uMode, 3);
          for (const sr of state.shockRings) {
            gl.uniform3fv(fu.uColorA, sr.colorA);
            gl.uniform3fv(fu.uColorB, sr.colorB);
            if (sr.dir) {
              M.m4FromPosDirScale(this.tmpMat, sr.pos, sr.dir, [sr.scale, sr.scale, 1]);
            } else {
              this.composeBillboard(this.tmpMat, sr.pos, camRight, camUp, camBack, sr.scale, sr.scale);
            }
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, sr.intensity);
            gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
          }

          // 7) DRIFTING ILLUMINATED 3D SPACE DUST MOTES (Velocity-aligned streaks + event light catch + exact loop wrap!)
          // Total travel over TOTAL_DURATION is an exact multiple of 3400 (3*3400 + 1*3400 = 4*3400) so dust wraps 100% seamlessly!
          const dustAccel = t > 70.6 ? Math.pow((t - 70.6) / 7.4, 2.0) * 3400.0 : 0.0;
          const dustTravel = (t / Scene.TOTAL_DURATION) * 3400.0 * 3.0 + dustAccel;
          const topFlashes = allFlashes.slice(0, 6);
          gl.uniform1i(fu.uMode, 5);
          for (let i = 0; i < this.spaceDust.length; i++) {
            const d = this.spaceDust[i];
            const zWrap = (((d.z0 - dustTravel * d.speedScale) % 3400) + 3400) % 3400 - 1500;
            const pos = [d.x, d.y, zWrap];
            // Catch nearby thruster overdrive, beam & weapon explosion light, then fade back into space shadow!
            let lit = 0.22;
            let warmBoost = 0.0;
            if (zWrap < -300 && Math.abs(d.x) < 460) lit += 0.68 * (1.0 + state.thrusterBoost * 1.9);
            if (state.beam.active && zWrap > 420 && zWrap < 1350 && Math.abs(d.x) < 360) lit += 1.25;
            for (let fi = 0; fi < topFlashes.length; fi++) {
              const fl = topFlashes[fi];
              const dx = pos[0] - fl.pos[0], dy = pos[1] - fl.pos[1], dz = pos[2] - fl.pos[2];
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < 320 * 320) {
                const k = (1.0 - Math.sqrt(d2) / 320.0) * fl.intensity * 1.4;
                lit += k;
                warmBoost += k;
              }
            }
            const streakStretch = 1.0 + state.thrusterBoost * 5.2;
            if (streakStretch > 1.15) {
              // Orient streak billboard cleanly parallel to fleet flight axis (-Z) while facing camera!
              const toCam = M.v3Norm(M.v3Sub(state.cam.pos, pos));
              const streakAxis = [0, 0, -1];
              let side = M.v3Cross(toCam, streakAxis);
              const sLen = M.v3Len(side);
              side = sLen > 0.01 ? M.v3Scale(side, 1 / sLen) : camRight;
              const billN = M.v3Norm(M.v3Cross(streakAxis, side));
              this.composeBillboard(this.tmpMat, pos, side, streakAxis, billN, d.size, d.size * streakStretch);
            } else {
              this.composeBillboard(this.tmpMat, pos, camRight, camUp, camBack, d.size, d.size);
            }
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            const useWarm = warmBoost > 0.25 || d.tint <= 0.4;
            gl.uniform3fv(fu.uColorA, useWarm ? [1.0, 0.88, 0.64] : [0.75, 0.92, 1.0]);
            gl.uniform3fv(fu.uColorB, warmBoost > 0.25 ? [1.0, 0.48, 0.14] : [0.15, 0.45, 0.85]);
            gl.uniform1f(fu.uIntensity, lit);
            gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
          }
        }
      }

      // Active Shuttle thrusters inside Through-Going Hangar!
      if (mode === 'hangar' && state.hangarActors) {
        for (const sh of state.hangarActors.shuttles) {
          if (sh.docked) continue;
          const backDir = M.v3Scale(sh.dir, -1);
          const tailP = M.v3Add(sh.pos, M.v3Scale(backDir, 14));
          drawPlume(tailP, backDir, 2.0, 18, 0.25, 0.25, cyanCore, cyanOuter);
        }
      }

      // Command Bridge: Animated 3D Holographic Fleet Trajectory Ribbons & Moving Fleet Light Pips (2.6)!
      if (mode === 'bridge') {
        const holoY = 21.5 + Math.sin(t * 1.8) * 0.9;
        const rotY = t * 0.28;
        const cR = Math.cos(rotY), sR = Math.sin(rotY);
        const toHoloWorld = (lx, ly, lz) => [
          lx * cR + lz * sR,
          holoY + ly,
          6 - lx * sR + lz * cR,
        ];

        // Flowing luminous trajectory vectors stretching from fleet hologram toward asteroid markers
        gl.uniform1i(fu.uMode, 2);
        gl.bindVertexArray(this.meshBoltCyl.vao);
        const lanes = [
          { x: 0, y: 0.5, z0: -8, z1: 18, colA: [0.65, 0.96, 1.0], colB: [0.10, 0.72, 1.0] },
          { x: -10, y: 1.5, z0: -6, z1: 16, colA: [0.55, 0.92, 1.0], colB: [0.08, 0.64, 1.0] },
          { x:  10, y: 1.5, z0: -6, z1: 16, colA: [0.55, 0.92, 1.0], colB: [0.08, 0.64, 1.0] },
          { x: -13, y: -1.5, z0: -9, z1: 15, colA: [1.0, 0.82, 0.40], colB: [1.0, 0.45, 0.10] },
          { x:  13, y: -1.5, z0: -9, z1: 15, colA: [1.0, 0.82, 0.40], colB: [1.0, 0.45, 0.10] },
        ];
        for (let li = 0; li < lanes.length; li++) {
          const ln = lanes[li];
          gl.uniform3fv(fu.uColorA, ln.colA);
          gl.uniform3fv(fu.uColorB, ln.colB);
          // 2 moving glowing trajectory dashes sliding continuously along each lane!
          for (let d = 0; d < 2; d++) {
            const prog = ((t * 0.45 + d * 0.5 + li * 0.17) % 1.0);
            const za = M.lerp(ln.z0, ln.z1 - 5, prog);
            const zb = za + 5.5;
            const pa = toHoloWorld(ln.x, ln.y, za);
            const pb = toHoloWorld(ln.x, ln.y, zb);
            const dv = M.v3Sub(pb, pa);
            const len = M.v3Len(dv);
            M.m4FromPosDirScale(this.tmpMat, pa, M.v3Scale(dv, 1 / Math.max(0.01, len)), [0.42, 0.42, len]);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, 1.55);
            gl.drawElements(gl.TRIANGLES, this.meshBoltCyl.count, gl.UNSIGNED_SHORT, 0);
          }
        }
        // Continuously moving glowing ship pips orbiting/advancing in the tactical display!
        gl.uniform1i(fu.uMode, 5);
        gl.bindVertexArray(this.meshQuad.vao);
        for (let p = 0; p < 18; p++) {
          const prog = ((t * 0.26 + p * 0.19) % 1.0);
          const lx = Math.sin(p * 2.4) * 14;
          const ly = Math.cos(p * 1.7) * 3.5;
          const lz = M.lerp(-12, 18, prog);
          const wp = toHoloWorld(lx, ly, lz);
          const isTarget = p % 5 === 0;
          gl.uniform3fv(fu.uColorA, isTarget ? [1.0, 0.85, 0.42] : [0.75, 0.98, 1.0]);
          gl.uniform3fv(fu.uColorB, isTarget ? [1.0, 0.45, 0.08] : [0.10, 0.72, 1.0]);
          this.composeBillboard(this.tmpMat, wp, camRight, camUp, camBack, 1.15, 1.15);
          gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
          gl.uniform1f(fu.uIntensity, 1.85);
          gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
        }
      }

      // Conduit Corridor: Luminous energy discharge pulses bridging converging abstract clamp jaws!
      if (mode === 'corridor') {
        gl.uniform1i(fu.uMode, 1);
        gl.bindVertexArray(this.meshBeamCyl.vao);
        gl.uniform3fv(fu.uColorA, [0.85, 0.98, 1.0]);
        gl.uniform3fv(fu.uColorB, [0.12, 0.78, 1.0]);
        for (let i = 0; i < 6; i++) {
          const cz = -126 + i * 50;
          const wave = 0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.95);
          if (wave > 0.62) {
            const strength = M.smoothstep(0.62, 0.95, wave);
            const clampX = M.lerp(28, 17, M.smoothstep(0.15, 0.85, wave)) - 10;
            M.m4FromPosDirScale(this.tmpMat, [-clampX, 0, cz], [1, 0, 0], [1.6 * strength, 1.6 * strength, clampX * 2]);
            gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
            gl.uniform1f(fu.uIntensity, strength * 1.9);
            gl.drawElements(gl.TRIANGLES, this.meshBeamCyl.count, gl.UNSIGNED_SHORT, 0);
          }
        }
      }

      // Ambient glowing plasma motes rising gently in Power Core Atrium!
      if (mode === 'core') {
        gl.uniform1i(fu.uMode, 5);
        gl.bindVertexArray(this.meshQuad.vao);
        gl.uniform3fv(fu.uColorA, [0.85, 0.98, 1.0]);
        gl.uniform3fv(fu.uColorB, [0.10, 0.68, 1.0]);
        for (let i = 0; i < 42; i++) {
          const ang = i * 2.3999 + t * 0.22;
          const rad = 26 + (i % 7) * 8;
          const y = (((i * 23 + t * 28) % 210) + 210) % 210 - 105;
          this.composeBillboard(this.tmpMat, [Math.cos(ang) * rad, y, Math.sin(ang) * rad], camRight, camUp, camBack, 3.2, 3.2);
          gl.uniformMatrix4fv(fu.uModel, false, this.tmpMat);
          gl.uniform1f(fu.uIntensity, 1.15 * state.corePulse);
          gl.drawElements(gl.TRIANGLES, this.meshQuad.count, gl.UNSIGNED_SHORT, 0);
        }
      }

      // --- C. FLEET-WIDE SEQUENTIAL LAMELLAR ENERGY SHIELDS (Act IV & Seamless Opener Fade!) ---
      if (mode === 'exterior' && (state.flagshipShield.alpha > 0.004 || state.t > 64.4 || state.t < 3.8)) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        // Back-face cull shields so front+back shells never double-sum into chalky white blobs!
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.useProgram(this.progShield.prog);
        const su = this.progShield.u;
        gl.uniformMatrix4fv(su.uViewProj, false, this.vpMat);
        gl.uniform3fv(su.uCamPos, state.cam.pos);
        gl.uniform1f(su.uTime, t);
        gl.bindVertexArray(this.meshShield.vao);

        // 1) Colossal Flagship Contoured Shield Envelope!
        const fs = state.flagshipShield;
        if (fs.alpha > 0.004 && fs.deploy > 0.004) {
          M.m4ComposeTRS(this.tmpMat, [state.flagshipPos[0], state.flagshipPos[1] + 12, state.flagshipPos[2] + 8], state.flagshipRot, [242, 152, 628]);
          gl.uniformMatrix4fv(su.uModel, false, this.tmpMat);
          gl.uniform1f(su.uExpand, fs.expand);
          gl.uniform1f(su.uDeploy, fs.deploy);
          gl.uniform1f(su.uAlpha, fs.alpha);
          gl.uniform1f(su.uGridScale, 5.2);
          gl.drawElements(gl.TRIANGLES, this.meshShield.count, gl.UNSIGNED_SHORT, 0);
        }

        // 2) ALL 38 Escort Warship Energy Shields cascading wave-by-wave across every layer!
        for (const es of state.escortStates) {
          const sh = es.shield;
          if (sh.alpha <= 0.004 || sh.deploy <= 0.004) continue;
          M.m4ComposeTRS(this.tmpMat, es.pos, es.rot, es.def.shieldScale);
          gl.uniformMatrix4fv(su.uModel, false, this.tmpMat);
          gl.uniform1f(su.uExpand, sh.expand);
          gl.uniform1f(su.uDeploy, sh.deploy);
          gl.uniform1f(su.uAlpha, sh.alpha * 0.92);
          gl.uniform1f(su.uGridScale, 2.8);
          gl.drawElements(gl.TRIANGLES, this.meshShield.count, gl.UNSIGNED_SHORT, 0);
        }
      }
    }
  }

  App.Renderer = Renderer;
})(window.App);
