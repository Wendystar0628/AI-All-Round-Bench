import io, re, sys

p = r'H:\AI_OneShot_Model\GLM\5.5\果冻冲击与造浪水槽\js\fluid.js'
s = open(p, encoding='utf-8').read()

start = s.index("const FLUID_COMMON = /* wgsl */`")
end = s.index("const K_CLEAR = /* wgsl */`")
new_common = r'''const FLUID_COMMON = /* wgsl */`
struct FP {
  gridSize : vec4u,   // nx, ny, nz, numParticles
  dom      : vec4f,   // minX, minY, minZ, h
  grav     : vec4f,   // gx, gy, gz, dt
  water    : vec4f,   // restLevel, foamRate, numBalls, time
  paddle   : vec4f,   // x, velX, amplitude, freq
  misc     : vec4f,   // flipBlend, pressIters, maxSpeed, foamScale
};
// group 0 : params + particles + grid velocity
@group(0) @binding(0) var<uniform> P : FP;
@group(0) @binding(1) var<storage, read_write> pPos     : array<vec4f>;
@group(0) @binding(2) var<storage, read_write> pVel     : array<vec4f>;
@group(0) @binding(3) var<storage, read_write> cellVel  : array<vec4f>;
@group(0) @binding(4) var<storage, read_write> cellOld  : array<vec4f>;
// group 1 : cell state + pressure + accumulators
@group(1) @binding(0) var<storage, read_write> cellType : array<u32>;
@group(1) @binding(1) var<storage, read_write> press    : array<f32>;
@group(1) @binding(2) var<storage, read_write> pressTmp : array<f32>;
@group(1) @binding(3) var<storage, read_write> acc      : array<atomic<i32>>;
@group(1) @binding(4) var<storage, read_write> diverge  : array<f32>;
// group 2 : balls
@group(2) @binding(0) var<storage, read_write> ballPos  : array<vec4f>;   // xyz, r
@group(2) @binding(1) var<storage, read_write> ballVel  : array<vec4f>;   // v, invMass
@group(2) @binding(2) var<storage, read_write> ballAng  : array<vec4f>;   // w, invInertia
@group(2) @binding(3) var<storage, read_write> ballQuat : array<vec4f>;
// group 3 : forces / meta / foam position
@group(3) @binding(0) var<storage, read_write> ballForce: array<vec4f>;
@group(3) @binding(1) var<storage, read_write> ballTorq : array<vec4f>;
@group(3) @binding(2) var<storage, read_write> ballMeta : array<vec4f>;   // density, group, rest, fric
@group(3) @binding(3) var<storage, read_write> foamPos  : array<vec4f>;   // xyz, life
// group 4 : foam velocity
@group(4) @binding(0) var<storage, read_write> foamVel  : array<vec4f>;

const SCALE : f32 = 262144.0;

fn ci(c : vec3u) -> u32 { return c.x + P.gridSize.x * (c.y + P.gridSize.y * c.z); }
fn inGrid(c : vec3i) -> bool {
  return c.x >= 0 && c.y >= 0 && c.z >= 0 &&
         c.x < i32(P.gridSize.x) && c.y < i32(P.gridSize.y) && c.z < i32(P.gridSize.z);
}
fn cellOf(c : vec3i) -> u32 { return u32(c.x) + P.gridSize.x * (u32(c.y) + P.gridSize.y * u32(c.z)); }
fn accIdx(i : u32, c : u32) -> u32 { return i * 4u + c; }

fn terrainH(x : f32, z : f32) -> f32 {
  var h = 0.34 * smoothstep(1.35, 1.90, x);
  let ridge = exp(-pow(x - 0.95, 2.0) / (2.0 * 0.10 * 0.10));
  h += 0.075 * ridge * smoothstep(0.02, 0.14, z) * (1.0 - smoothstep(0.56, 0.72, z));
  return h;
}

fn gather(pos : vec3f) -> vec3f {
  let c = (pos - P.dom.xyz) / P.dom.w - vec3f(0.5);
  let base = vec3i(floor(c));
  let f = c - vec3f(base);
  var out = vec3f(0.0);
  var wsum = 0.0;
  for (var dk = 0; dk < 2; dk++) {
    for (var dj = 0; dj < 2; dj++) {
      for (var di = 0; di < 2; di++) {
        let cc = base + vec3i(di, dj, dk);
        if (!inGrid(cc)) { continue; }
        let w = (select(1.0 - f.x, f.x, di == 1)) *
                (select(1.0 - f.y, f.y, dj == 1)) *
                (select(1.0 - f.z, f.z, dk == 1));
        out += cellVel[cellOf(cc)].xyz * w;
        wsum += w;
      }
    }
  }
  if (wsum > 1e-5) { return out / wsum; }
  return vec3f(0.0);
}
`;

'''
s = s[:start] + new_common + s[end:]

s = s.replace("""  atomicStore(&accX[i], 0i);
  atomicStore(&accY[i], 0i);
  atomicStore(&accZ[i], 0i);
  atomicStore(&accW[i], 0i);""",
"""  atomicStore(&acc[accIdx(i, 0u)], 0i);
  atomicStore(&acc[accIdx(i, 1u)], 0i);
  atomicStore(&acc[accIdx(i, 2u)], 0i);
  atomicStore(&acc[accIdx(i, 3u)], 0i);""")

s = s.replace("""        atomicAdd(&accX[i], i32(vel.x * w * SCALE));
        atomicAdd(&accY[i], i32(vel.y * w * SCALE));
        atomicAdd(&accZ[i], i32(vel.z * w * SCALE));
        atomicAdd(&accW[i], i32(w * SCALE));""",
"""        atomicAdd(&acc[accIdx(i, 0u)], i32(vel.x * w * SCALE));
        atomicAdd(&acc[accIdx(i, 1u)], i32(vel.y * w * SCALE));
        atomicAdd(&acc[accIdx(i, 2u)], i32(vel.z * w * SCALE));
        atomicAdd(&acc[accIdx(i, 3u)], i32(w * SCALE));""")

s = s.replace("""  let w = f32(atomicLoad(&accW[i])) / SCALE;
  if (w > 1e-5) {
    cellType[i] = 1u;
    cellVel[i] = vec4f(f32(atomicLoad(&accX[i])) / SCALE / w,
                       f32(atomicLoad(&accY[i])) / SCALE / w,
                       f32(atomicLoad(&accZ[i])) / SCALE / w, 1.0);""",
"""  let w = f32(atomicLoad(&acc[accIdx(i, 3u)])) / SCALE;
  if (w > 1e-5) {
    cellType[i] = 1u;
    cellVel[i] = vec4f(f32(atomicLoad(&acc[accIdx(i, 0u)])) / SCALE / w,
                       f32(atomicLoad(&acc[accIdx(i, 1u)])) / SCALE / w,
                       f32(atomicLoad(&acc[accIdx(i, 2u)])) / SCALE / w, 1.0);""")

start = s.index("    this.paramBuf = g.uniform(96, new Float32Array(24));")
end = s.index("    this.resetBalls();\n    this.ready = true;")
new_bind = r'''    this.paramBuf = g.uniform(96, new Float32Array(24));

    const nCells = this.nCells;
    // ---- bind group layouts (<= 8 storage buffers per pipeline layout) ----
    const mkL = (types) => dev.createBindGroupLayout({
      entries: types.map((t, i) => ({
        binding: i, visibility: GPUShaderStage.COMPUTE,
        buffer: t === 'u' ? { type: 'uniform' } : { type: 'storage' },
      })),
    });
    this.L0 = mkL(['u', 's', 's', 's', 's']);
    this.L1 = mkL(['s', 's', 's', 's', 's']);
    this.L2 = mkL(['s', 's', 's', 's']);
    this.L3 = mkL(['s', 's', 's', 's']);
    this.L4 = mkL(['s']);
    this.emptyLayout = dev.createBindGroupLayout({ entries: [] });
    this.emptyBG = dev.createBindGroup({ layout: this.emptyLayout, entries: [] });

    this.acc = g.storage(nCells * 4 * 4, new Int32Array(nCells * 4));
    this.bgs = [
      dev.createBindGroup({ layout: this.L0, entries: [
        { binding: 0, resource: { buffer: this.paramBuf } },
        { binding: 1, resource: { buffer: this.pPos } },
        { binding: 2, resource: { buffer: this.pVel } },
        { binding: 3, resource: { buffer: this.cellVel } },
        { binding: 4, resource: { buffer: this.cellOld } },
      ] }),
      dev.createBindGroup({ layout: this.L1, entries: [
        { binding: 0, resource: { buffer: this.cellType } },
        { binding: 1, resource: { buffer: this.press } },
        { binding: 2, resource: { buffer: this.pressTmp } },
        { binding: 3, resource: { buffer: this.acc } },
        { binding: 4, resource: { buffer: this.diverge } },
      ] }),
      dev.createBindGroup({ layout: this.L2, entries: [
        { binding: 0, resource: { buffer: this.ballPos } },
        { binding: 1, resource: { buffer: this.ballVel } },
        { binding: 2, resource: { buffer: this.ballAng } },
        { binding: 3, resource: { buffer: this.ballQuat } },
      ] }),
      dev.createBindGroup({ layout: this.L3, entries: [
        { binding: 0, resource: { buffer: this.ballForce } },
        { binding: 1, resource: { buffer: this.ballTorq } },
        { binding: 2, resource: { buffer: this.ballMeta } },
        { binding: 3, resource: { buffer: this.foamPos } },
      ] }),
      dev.createBindGroup({ layout: this.L4, entries: [
        { binding: 0, resource: { buffer: this.foamVel } },
      ] }),
    ];
    this.bgsSwap = this.bgs.map((bg, i) => {
      if (i !== 1) return bg;
      return dev.createBindGroup({ layout: this.L1, entries: [
        { binding: 0, resource: { buffer: this.cellType } },
        { binding: 1, resource: { buffer: this.pressTmp } },
        { binding: 2, resource: { buffer: this.press } },
        { binding: 3, resource: { buffer: this.acc } },
        { binding: 4, resource: { buffer: this.diverge } },
      ] });
    });

    const layouts = [this.L0, this.L1, this.L2, this.L3, this.L4];
    this.useMap = new Map();
    const mk = async (code, label, use) => {
      const mod = await makeShaderModule(dev, FLUID_COMMON + code, 'fluid-' + label);
      const pl = dev.createPipelineLayout({
        bindGroupLayouts: layouts.map((l, i) => (use[i] ? l : this.emptyLayout)),
      });
      const pipe = await dev.createComputePipelineAsync({ layout: pl, compute: { module: mod, entryPoint: 'main' } });
      this.useMap.set(pipe, use);
      return pipe;
    };
    this.pClear = await mk(K_CLEAR, 'clear', [1, 1, 0, 0, 0]);
    this.pSolid = await mk(K_SOLID, 'solid', [1, 1, 1, 0, 0]);
    this.pP2G = await mk(K_P2G, 'p2g', [1, 1, 0, 0, 0]);
    this.pNorm = await mk(K_NORMALIZE, 'norm', [1, 1, 0, 0, 0]);
    this.pDiv = await mk(K_DIVERGE, 'div', [1, 1, 0, 0, 0]);
    this.pPress = await mk(K_PRESSURE, 'press', [1, 1, 0, 0, 0]);
    this.pGrad = await mk(K_GRADIENT, 'grad', [1, 1, 0, 0, 0]);
    this.pAdvect = await mk(K_ADVECT, 'advect', [1, 0, 0, 0, 0]);
    this.pG2P = await mk(K_G2P, 'g2p', [1, 0, 0, 0, 0]);
    this.pCollide = await mk(K_COLLIDE, 'collide', [1, 0, 1, 0, 0]);
    this.pBallForce = await mk(K_BALLFORCE, 'ballforce', [1, 1, 1, 1, 0]);
    this.pBallInt = await mk(K_BALLINTEGRATE, 'ballint', [0, 0, 1, 1, 0]);
    this.pBallPair = await mk(K_BALLPAIR, 'ballpair', [0, 0, 1, 0, 0]);
    this.pFoam = await mk(K_FOAM, 'foam', [1, 0, 0, 1, 1]);
    this.pSettle = await mk(K_SETTLE, 'settle', [1, 0, 0, 1, 0]);
    this.pClearF = await mk(K_CLEAR_FORCE, 'clearf', [0, 0, 0, 1, 0]);

'''
s = s[:start] + new_bind + s[end:]

start = s.index("  makeLayouts(dev) {")
end = s.index("  terrainH(x, z) {")
s = s[:start] + s[end:]

old_run = """    const run = (pipe, w) => {
      c.setPipeline(pipe);
      c.setBindGroup(0, this.bg0);
      c.setBindGroup(1, this.bg1);
      c.setBindGroup(2, this.bg2);
      c.dispatchWorkgroups(w[0], w[1] || 1, w[2] || 1);
    };"""
new_run = """    const setGroups = (pipe, swap) => {
      const use = this.useMap.get(pipe);
      for (let i = 0; i < 5; i++) {
        const bgs = (swap && i === 1) ? this.bgsSwap : this.bgs;
        c.setBindGroup(i, use[i] ? bgs[i] : this.emptyBG);
      }
    };
    const run = (pipe, w) => {
      c.setPipeline(pipe);
      setGroups(pipe, false);
      c.dispatchWorkgroups(w[0], w[1] || 1, w[2] || 1);
    };"""
assert old_run in s
s = s.replace(old_run, new_run)

old_press = """    for (let i = 0; i < iters; i++) {
      c.setPipeline(this.pPress);
      c.setBindGroup(0, (i % 2 === 0) ? this.bg0 : this.bg0s);
      c.setBindGroup(1, this.bg1);
      c.setBindGroup(2, this.bg2);
      c.dispatchWorkgroups(gw[0], gw[1], gw[2]);
    }"""
new_press = """    for (let i = 0; i < iters; i++) {
      c.setPipeline(this.pPress);
      setGroups(this.pPress, i % 2 === 1);
      c.dispatchWorkgroups(gw[0], gw[1], gw[2]);
    }"""
assert old_press in s
s = s.replace(old_press, new_press)

old_settle = "p.setPipeline(this.pSettle); p.setBindGroup(0, this.bg0); p.setBindGroup(1, this.bg1); p.setBindGroup(2, this.bg2); p.dispatchWorkgroups(Math.ceil(this.numParticles / 64));"
new_settle = """p.setPipeline(this.pSettle);
    {
      const use = this.useMap.get(this.pSettle);
      for (let i = 0; i < 5; i++) p.setBindGroup(i, use[i] ? this.bgs[i] : this.emptyBG);
    }
    p.dispatchWorkgroups(Math.ceil(this.numParticles / 64));"""
assert old_settle in s
s = s.replace(old_settle, new_settle)

old_reset = """    g.device.queue.writeBuffer(this.accX, 0, new Int32Array(this.nCells));
    g.device.queue.writeBuffer(this.accY, 0, new Int32Array(this.nCells));
    g.device.queue.writeBuffer(this.accZ, 0, new Int32Array(this.nCells));
    g.device.queue.writeBuffer(this.accW, 0, new Int32Array(this.nCells));"""
new_reset = """    g.device.queue.writeBuffer(this.acc, 0, new Int32Array(this.nCells * 4));"""
assert old_reset in s
s = s.replace(old_reset, new_reset)

old_accbuf = """    const i32a = new Int32Array(nCells);
    this.accX = g.storage(nCells * 4, i32a);
    this.accY = g.storage(nCells * 4, i32a);
    this.accZ = g.storage(nCells * 4, i32a);
    this.accW = g.storage(nCells * 4, i32a);
"""
assert old_accbuf in s
s = s.replace(old_accbuf, "")

open(p, 'w', encoding='utf-8').write(s)
print('done')
