// materials.js — shared palette for every voxel object in the piece
(function () {
  'use strict';
  const SF = window.SF;
  // anim: 0 none, 1 breathe, 2 engine(thrust), 3 cannon charge, 4 flow along z, 5 flow along y, 6 console flicker,
  //       7 window specks, 8 turret/muzzle flash, 9 guide chase, 10 core inner, 11 missile motor, 12 energy block
  // bake: [channel(0=A accent,1=B warm,2=C dynamic), power]
  const defs = [
    // name,        albedo,               rough, spec, emissive,            anim, bake,      amb,  alpha
    ['EMPTY',       [0, 0, 0],            1,    0,    [0, 0, 0],            0,   null,       1,    1],
    ['HULL_A',      [0.74, 0.705, 0.64],   0.42, 0.55, [0, 0, 0],            0,   null,       1,    1],   // ivory ceramic armour
    ['HULL_B',      [0.60, 0.585, 0.555],   0.46, 0.50, [0, 0, 0],            0,   null,       1,    1],   // cooler / worn plate
    ['HULL_C',      [0.40, 0.455, 0.50],   0.40, 0.55, [0, 0, 0],            0,   null,       1,    1],   // blue-grey secondary plate
    ['DARK_A',      [0.085, 0.10, 0.135], 0.70, 0.20, [0, 0, 0],            0,   null,       1,    1],   // deep slate substructure
    ['DARK_B',      [0.040, 0.047, 0.066], 0.85, 0.10, [0, 0, 0],           0,   null,       1,    1],   // recess / near black
    ['METAL',       [0.26, 0.29, 0.34],   0.30, 0.90, [0, 0, 0],            0,   null,       1,    1],   // gunmetal machinery
    ['TRIM',        [0.74, 0.70, 0.58],   0.22, 1.00, [0, 0, 0],            0,   null,       1,    1],   // pale brass edge metal
    ['GLOW',        [0.05, 0.25, 0.30],   0.5,  0.2,  [0.25, 1.9, 2.6],     0,   [0, 0.7],   1,    1],   // cyan slot light
    ['GLOW_P',      [0.05, 0.25, 0.30],   0.5,  0.2,  [0.25, 1.9, 2.6],     1,   [0, 0.7],   1,    1],   // breathing cyan
    ['AMBER',       [0.30, 0.15, 0.03],   0.5,  0.2,  [3.2, 1.25, 0.22],    0,   [1, 0.45],   1,    1],   // warm marker
    ['ENGINE',      [0.05, 0.20, 0.30],   0.5,  0.2,  [0.9, 3.4, 5.0],      2,   [2, 1.6],   1,    1],   // nozzle inner
    ['CANNON',      [0.04, 0.16, 0.20],   0.5,  0.3,  [0.5, 3.6, 4.6],      3,   [2, 1.4],   1,    1],   // cannon charge slots
    ['WINDOW',      [0.10, 0.10, 0.10],   0.4,  0.3,  [2.2, 1.7, 1.0],      7,   null,       1,    1],   // tiny lit ports
    ['GLASS',       [0.10, 0.22, 0.28],   0.08, 1.0,  [0.0, 0.02, 0.03],    0,   null,       1,    0.16],
    ['HOLO',        [0.008, 0.035, 0.045], 0.3, 0.3,  [0.036, 0.30, 0.39],  6,   [0, 0.06],  1,    0.07],
    ['SCREEN',      [0.03, 0.10, 0.12],   0.3,  0.4,  [0.10, 0.80, 1.0],     6,   [0, 0.18],   1,    1],
    ['FLOW_Z',      [0.04, 0.16, 0.20],   0.5,  0.2,  [0.25, 2.2, 2.9],     4,   [0, 0.8],   1,    1],
    ['FLOW_Y',      [0.04, 0.16, 0.20],   0.5,  0.2,  [0.25, 2.2, 2.9],     5,   [0, 0.8],   1,    1],
    ['ROCK_A',      [0.185, 0.165, 0.152], 0.9, 0.08, [0, 0, 0],            0,   null,       1,    1],
    ['ROCK_B',      [0.275, 0.238, 0.205], 0.9,  0.08, [0, 0, 0],            0,   null,       1,    1],
    ['ROCK_C',      [0.102, 0.10, 0.115], 0.85, 0.12, [0, 0, 0],            0,   null,       1,    1],
    ['ROCK_ORE',    [0.42, 0.34, 0.20],   0.45, 0.8,  [0, 0, 0],            0,   null,       1,    1],
    ['CORE_IN',     [0.3, 0.5, 0.55],     0.5,  0.2,  [1.6, 5.2, 6.0],      10,  [2, 2.2],   1,    1],
    ['CORE_SHELL',  [0.06, 0.30, 0.36],   0.15, 0.8,  [0.06, 0.55, 0.70],   10,  null,       1,    0.30],
    ['INT_A',       [0.62, 0.60, 0.555],   0.5,  0.45, [0, 0, 0],            0,   null,       0.16, 1],   // interior plating (ivory, dimmer ambient)
    ['INT_B',       [0.30, 0.325, 0.36],   0.55, 0.40, [0, 0, 0],            0,   null,       0.16, 1],   // interior blue-grey
    ['INT_D',       [0.105, 0.118, 0.145], 0.75, 0.2, [0, 0, 0],            0,   null,       0.16, 1],   // interior dark
    ['INT_F',       [0.15, 0.16, 0.185], 0.35, 0.6,  [0, 0, 0],            0,   null,       0.16, 1],   // polished deck
    ['GUIDE',       [0.05, 0.20, 0.25],   0.5,  0.2,  [0.3, 2.4, 3.0],      9,   [0, 0.9],   1,    1],   // chase guide lights
    ['LAMP',        [0.5, 0.5, 0.5],      0.5,  0.2,  [3.0, 2.65, 2.15],    0,   [1, 1.5],   1,    1],   // cool white work light (uses accent channel)
    ['MISSILE',     [0.82, 0.80, 0.76],   0.35, 0.7,  [0, 0, 0],            0,   null,       1,    1],
    ['MOTOR',       [0.3, 0.2, 0.1],      0.5,  0.2,  [5.0, 2.4, 0.6],      11,  null,       1,    1],
    ['TGLOW',       [0.04, 0.16, 0.20],   0.5,  0.3,  [0.4, 2.6, 3.4],      8,   [2, 0.9],   1,    1],   // turret emitter
    ['EBLOCK',      [0.2, 0.5, 0.55],     0.4,  0.3,  [0.9, 4.2, 5.2],      12,  null,       1,    1],
    ['MARK',        [0.62, 0.20, 0.10],   0.5,  0.4,  [0, 0, 0],            0,   null,       1,    1],   // painted marker (rust red)
    ['INT_M',       [0.20, 0.22, 0.26],   0.30, 0.9,  [0, 0, 0],            0,   null,       0.16, 1],   // interior machinery metal
    ['AMBER_I',     [0.30, 0.15, 0.03],   0.5,  0.2,  [2.6, 1.0, 0.18],     1,   [1, 0.25],   1,    1],   // interior amber breathing
    ['HULL_D',      [0.33, 0.375, 0.42],  0.44, 0.50, [0, 0, 0],            0,   null,       1,    1],   // darker slate-blue lower plate
    ['FLOW_R',      [0.04, 0.16, 0.20],   0.5,  0.2,  [0.25, 2.2, 2.9],     13,  [0, 0.8],   1,    1],   // radial flow (atrium supports)
    ['GLOW_I',      [0.05, 0.25, 0.30],   0.5,  0.2,  [0.11, 0.85, 1.15],   0,   [0, 0.42],  1,    1],   // dimmer interior strip light
    ['ROCK_HOT',    [0.10, 0.085, 0.08],  0.9,  0.08, [0, 0, 0],            0,   null,       1,    1],   // fresh fracture interior (heat added in shader)
  ];
  const M = {}, names = [];
  defs.forEach((d, i) => { M[d[0]] = i; names.push(d[0]); });
  // plating tags (temporary ids used during construction)
  M.T_BIG = 240; M.T_MED = 241; M.T_SMALL = 242; M.T_INT = 243; M.T_FINE = 244;

  const N = 64;
  const pal = new Float32Array(N * 4 * 4);
  const trans = new Uint8Array(256), bakeCh = new Int8Array(256).fill(-1), bakePw = new Float32Array(256);
  defs.forEach((d, i) => {
    pal.set([d[1][0], d[1][1], d[1][2], d[2]], i * 4);
    pal.set([d[4][0], d[4][1], d[4][2], d[5]], (N + i) * 4);
    pal.set([d[3], d[7], d[8], 0], (2 * N + i) * 4);
    if (d[8] < 1) trans[i] = 1;
    if (d[6]) { bakeCh[i] = d[6][0]; bakePw[i] = d[6][1]; }
  });
  SF.M = M; SF.matNames = names; SF.palData = pal; SF.palN = N; SF.matTrans = trans; SF.bakeCh = bakeCh; SF.bakePw = bakePw; SF.matDefs = defs;
})();
