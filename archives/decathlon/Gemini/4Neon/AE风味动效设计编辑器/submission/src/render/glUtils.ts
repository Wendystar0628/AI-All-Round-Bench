// ============================================================================
// WebGL 2 Shader Compilation, FBO Pool & Procedural Studio/Foundry HDRI Cubemap
// ============================================================================

export function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('WebGL2 createShader failed');
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'Unknown shader error';
    gl.deleteShader(sh);
    throw new Error(`Shader compile error:\n${log}\n---SOURCE---\n${source}`);
  }
  return sh;
}

export function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || 'Unknown link error';
    gl.deleteProgram(prog);
    throw new Error(`Program link error:\n${log}`);
  }
  return prog;
}

export interface RenderTarget {
  fbo: WebGLFramebuffer;
  colorTex: WebGLTexture;
  depthTex?: WebGLTexture; // Linear view-space depth (COLOR_ATTACHMENT1) when hasMRT=true
  depthRb?: WebGLRenderbuffer;
  width: number;
  height: number;
  hdr: boolean;
  hasMRT: boolean;
}

export function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  opts: { hdr?: boolean; hasDepth?: boolean; hasMRT?: boolean; hasFloatExt?: boolean } = {}
): RenderTarget {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const useHdr = !!(opts.hdr && opts.hasFloatExt);
  const internalFmt = useHdr ? gl.RGBA16F : gl.RGBA8;
  const type = useHdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

  const colorTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, colorTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);

  let depthTex: WebGLTexture | undefined;
  if (opts.hasMRT) {
    depthTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    // Store linear view depth in R16F/RGBA16F (or RGBA8 encoded fallback)
    const dIntFmt = opts.hasFloatExt ? gl.RGBA16F : gl.RGBA8;
    const dType = opts.hasFloatExt ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, dIntFmt, w, h, 0, gl.RGBA, dType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, depthTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  } else {
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  }

  let depthRb: WebGLRenderbuffer | undefined;
  if (opts.hasDepth) {
    depthRb = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
  }

  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, colorTex, depthTex, depthRb, width: w, height: h, hdr: useHdr, hasMRT: !!opts.hasMRT };
}

export function destroyRenderTarget(gl: WebGL2RenderingContext, rt: RenderTarget): void {
  gl.deleteFramebuffer(rt.fbo);
  gl.deleteTexture(rt.colorTex);
  if (rt.depthTex) gl.deleteTexture(rt.depthTex);
  if (rt.depthRb) gl.deleteRenderbuffer(rt.depthRb);
}

export interface ShadowMapTarget {
  fbo: WebGLFramebuffer;
  depthTex: WebGLTexture;
  size: number;
}

export function createShadowMapTarget(gl: WebGL2RenderingContext, size = 2048): ShadowMapTarget {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

  const depthTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, depthTex, size };
}

// ============================================================================
// Procedural Foundry/Studio HDRI Environment Cubemap (2.11)
// Generates crisp studio softboxes + warm forge furnace + cool steel skylight
// Mipmapped so PBR roughness maps directly to reflection sharpness!
// ============================================================================
export function createProceduralEnvCubemap(gl: WebGL2RenderingContext, size = 128): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);

  const faces: Array<{ target: number; dir: (u: number, v: number) => [number, number, number] }> = [
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, dir: (u, v) => [1, -v, -u] },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, dir: (u, v) => [-1, -v, u] },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, dir: (u, v) => [u, 1, v] },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, dir: (u, v) => [u, -1, -v] },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, dir: (u, v) => [u, -v, 1] },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, dir: (u, v) => [-u, -v, -1] },
  ];

  // Sample procedural HDR studio/foundry lighting (packed into smooth high-dynamic 8-bit or float)
  const sampleEnv = (dx: number, dy: number, dz: number): [number, number, number] => {
    const l = Math.hypot(dx, dy, dz) || 1;
    const x = dx / l, y = dy / l, z = dz / l;

    // Base dark industrial foundry sky-to-floor gradient
    const upT = Math.max(0, y);
    const downT = Math.max(0, -y);
    let r = 0.06 + upT * 0.14 + downT * 0.04;
    let g = 0.075 + upT * 0.17 + downT * 0.035;
    let b = 0.105 + upT * 0.24 + downT * 0.045;

    // Horizon industrial metallic band (creates crisp reflection sweep across curved bevels!)
    const horiz = Math.exp(-Math.pow((y - 0.08) * 6.0, 2));
    r += horiz * 0.24;
    g += horiz * 0.26;
    b += horiz * 0.30;

    // Key Overhead Cool-White Studio Strip Softbox (upper right-front)
    const d1 = x * 0.42 + y * 0.78 + z * 0.46;
    if (d1 > 0.72) {
      const s = Math.pow((d1 - 0.72) / 0.28, 2.2);
      r += s * 2.1; g += s * 2.15; b += s * 2.25;
    }

    // Cool Steel Rim Strip (upper left-back)
    const d2 = -x * 0.72 + y * 0.46 - z * 0.52;
    if (d2 > 0.66) {
      const s = Math.pow((d2 - 0.66) / 0.34, 2.4);
      r += s * 0.75; g += s * 1.25; b += s * 1.95;
    }

    // Warm Molten Forge Furnace Reflection (lower front-left / hearth)
    const d3 = -x * 0.58 - y * 0.22 + z * 0.78;
    if (d3 > 0.52) {
      const s = Math.pow((d3 - 0.52) / 0.48, 2.2);
      r += s * 2.2; g += s * 0.92; b += s * 0.22;
    }

    // Crisp Secondary Studio Specular Accent (right-front)
    const d4 = x * 0.82 + y * 0.20 + z * 0.54;
    if (d4 > 0.80) {
      const s = Math.pow((d4 - 0.80) / 0.20, 2.0);
      r += s * 1.7; g += s * 1.55; b += s * 1.35;
    }

    // Subtle dark reflection ribs to make polished chrome/steel unmistakably metallic!
    const rib = 0.84 + 0.16 * Math.sin(Math.atan2(z, x) * 6.0 + y * 5.0);
    return [r * rib, g * rib, b * rib];
  };

  // Encode HDR values cleanly into RGBA8 with tone-preserving headroom (or float if supported)
  const useFloat = !!gl.getExtension('EXT_color_buffer_float');
  const useLinearFloat = !!gl.getExtension('OES_texture_float_linear');
  const floatSupported = useFloat && useLinearFloat;

  for (const f of faces) {
    if (floatSupported) {
      const data = new Float32Array(size * size * 4);
      for (let py = 0; py < size; py++) {
        const v = ((py + 0.5) / size) * 2 - 1;
        for (let px = 0; px < size; px++) {
          const u = ((px + 0.5) / size) * 2 - 1;
          const [dx, dy, dz] = f.dir(u, v);
          const [r, g, b] = sampleEnv(dx, dy, dz);
          const idx = (py * size + px) * 4;
          data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 1;
        }
      }
      gl.texImage2D(f.target, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.FLOAT, data);
    } else {
      // Scale by 0.4 so values up to 2.5 fit in 0..1; shader multiplies back by 2.5 if needed
      const data = new Uint8Array(size * size * 4);
      for (let py = 0; py < size; py++) {
        const v = ((py + 0.5) / size) * 2 - 1;
        for (let px = 0; px < size; px++) {
          const u = ((px + 0.5) / size) * 2 - 1;
          const [dx, dy, dz] = f.dir(u, v);
          const [r, g, b] = sampleEnv(dx, dy, dz);
          const idx = (py * size + px) * 4;
          data[idx] = Math.min(255, Math.round((r / 2.5) * 255));
          data[idx + 1] = Math.min(255, Math.round((g / 2.5) * 255));
          data[idx + 2] = Math.min(255, Math.round((b / 2.5) * 255));
          data[idx + 3] = 255;
        }
      }
      gl.texImage2D(f.target, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
  }

  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  (tex as any).__envScale = floatSupported ? 1.0 : 2.5;
  return tex;
}
