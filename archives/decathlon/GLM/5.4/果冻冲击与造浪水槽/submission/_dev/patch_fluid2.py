import re
p = r'H:\AI_OneShot_Model\GLM\5.5\果冻冲击与造浪水槽\js\fluid.js'
s = open(p, encoding='utf-8').read()

start = s.index("    this.paramBuf = g.uniform(96, new Float32Array(24));")
end = s.index("    this.resetBalls();\n    this.ready = true;")
new_bind = r'''    this.paramBuf = g.uniform(96, new Float32Array(24));

    const mkL = (types) => dev.createBindGroupLayout({
      entries: types.map((t, i) => ({
        binding: i, visibility: GPUShaderStage.COMPUTE,
        buffer: t === 'u' ? { type: 'uniform' } : { type: 'storage' },
      })),
    });
    this.L0 = mkL(['u', 's', 's', 's', 's', 's', 's', 's', 's']);
    this.L1 = mkL(['s', 's', 's', 's']);
    this.L2 = mkL(['s', 's', 's', 's', 's']);
    this.emptyLayout = dev.createBindGroupLayout({ entries: [] });
    this.emptyBG = dev.createBindGroup({ layout: this.emptyLayout, entries: [] });

    this.acc = g.storage(this.nCells * 4 * 4, new Int32Array(this.nCells * 4));
    this.bgs = [
      dev.createBindGroup({ layout: this.L0, entries: [
        { binding: 0, resource: { buffer: this.paramBuf } },
        { binding: 1, resource: { buffer: this.pPos } },
        { binding: 2, resource: { buffer: this.pVel } },
        { binding: 3, resource: { buffer: this.cellVel } },
        { binding: 4, resource: { buffer: this.cellOld } },
        { binding: 5, resource: { buffer: this.cellType } },
        { binding: 6, resource: { buffer: this.press } },
        { binding: 7, resource: { buffer: this.pressTmp } },
        { binding: 8, resource: { buffer: this.acc } },
      ] }),
      dev.createBindGroup({ layout: this.L1, entries: [
        { binding: 0, resource: { buffer: this.ballPos } },
        { binding: 1, resource: { buffer: this.ballVel } },
        { binding: 2, resource: { buffer: this.ballAng } },
        { binding: 3, resource: { buffer: this.ballQuat } },
      ] }),
      dev.createBindGroup({ layout: this.L2, entries: [
        { binding: 0, resource: { buffer: this.ballForce } },
        { binding: 1, resource: { buffer: this.ballTorq } },
        { binding: 2, resource: { buffer: this.ballMeta } },
        { binding: 3, resource: { buffer: this.foamPos } },
        { binding: 4, resource: { buffer: this.foamVel } },
      ] }),
    ];
    this.bgsSwap = this.bgs.map((bg, i) => {
      if (i !== 0) return bg;
      return dev.createBindGroup({ layout: this.L0, entries: [
        { binding: 0, resource: { buffer: this.paramBuf } },
        { binding: 1, resource: { buffer: this.pPos } },
        { binding: 2, resource: { buffer: this.pVel } },
        { binding: 3, resource: { buffer: this.cellVel } },
        { binding: 4, resource: { buffer: this.cellOld } },
        { binding: 5, resource: { buffer: this.cellType } },
        { binding: 6, resource: { buffer: this.pressTmp } },
        { binding: 7, resource: { buffer: this.press } },
        { binding: 8, resource: { buffer: this.acc } },
      ] });
    });

    const layouts = [this.L0, this.L1, this.L2];
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
    this.pClear = await mk(K_CLEAR, 'clear', [1, 0, 0]);
    this.pSolid = await mk(K_SOLID, 'solid', [1, 1, 0]);
    this.pP2G = await mk(K_P2G, 'p2g', [1, 0, 0]);
    this.pNorm = await mk(K_NORMALIZE, 'norm', [1, 0, 0]);
    this.pPress = await mk(K_PRESSURE, 'press', [1, 0, 0]);
    this.pGrad = await mk(K_GRADIENT, 'grad', [1, 0, 0]);
    this.pAdvect = await mk(K_ADVECT, 'advect', [1, 0, 0]);
    this.pG2P = await mk(K_G2P, 'g2p', [1, 0, 0]);
    this.pCollide = await mk(K_COLLIDE, 'collide', [1, 1, 0]);
    this.pBallForce = await mk(K_BALLFORCE, 'ballforce', [1, 1, 1]);
    this.pBallInt = await mk(K_BALLINTEGRATE, 'ballint', [0, 1, 1]);
    this.pBallPair = await mk(K_BALLPAIR, 'ballpair', [0, 1, 0]);
    this.pFoam = await mk(K_FOAM, 'foam', [1, 0, 1]);
    this.pSettle = await mk(K_SETTLE, 'settle', [1, 0, 1]);
    this.pClearF = await mk(K_CLEAR_FORCE, 'clearf', [0, 0, 1]);

'''
s = s[:start] + new_bind + s[end:]

# update setGroups / loops from 4 -> 3 groups
s = s.replace("for (let i = 0; i < 4; i++) {\n        const bgs = (swap && i === 1) ? this.bgsSwap : this.bgs;",
              "for (let i = 0; i < 3; i++) {\n        const bgs = (swap && i === 0) ? this.bgsSwap : this.bgs;")
s = s.replace("for (let i = 0; i < 4; i++) p.setBindGroup(i, use[i] ? this.bgs[i] : this.emptyBG);",
              "for (let i = 0; i < 3; i++) p.setBindGroup(i, use[i] ? this.bgs[i] : this.emptyBG);")
open(p, 'w', encoding='utf-8').write(s)
print('done')
