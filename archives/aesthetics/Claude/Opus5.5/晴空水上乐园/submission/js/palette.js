'use strict';
/* ==========================================================================
   Palette — clean, bright summer-anime colours (sRGB hex, converted to linear)
   ========================================================================== */
(function () {
  const P = window.P;
  const m = P.mat;
  // whites & structure
  m('white', '#fffdf8', { grid: 0.04, vary: 0.03, spec: 0.15, shin: 0.4 });
  m('white2', '#f2efe8', { grid: 0.05, vary: 0.035, spec: 0.1, shin: 0.4 });
  m('whiteTrim', '#ffffff', { grid: 0.03, vary: 0.02, spec: 0.2, shin: 0.5 });
  m('cream', '#fbf1dc', { vary: 0.035 });
  m('concrete', '#e9e5dd', { grid: 0.1, vary: 0.04 });
  // blues
  m('sky', '#36c2f5', { spec: 0.25, shin: 0.55, vary: 0.035 });
  m('sky2', '#1597e5', { spec: 0.25, shin: 0.55, vary: 0.035 });
  m('skyPale', '#a6e1f8', { vary: 0.035 });
  m('skyDeep', '#1677cf', { spec: 0.2, vary: 0.03 });
  m('navy', '#24407a', { vary: 0.03 });
  // accents
  m('lemon', '#ffe04d', { spec: 0.2, vary: 0.035 });
  m('lemon2', '#ffc72e', { spec: 0.2, vary: 0.035 });
  m('mint', '#6fe3b8', { spec: 0.2, vary: 0.035 });
  m('mint2', '#34c99a', { spec: 0.2, vary: 0.035 });
  m('pink', '#ffadc6', { spec: 0.2, vary: 0.035 });
  m('pink2', '#ff7ea8', { spec: 0.2, vary: 0.035 });
  m('lav', '#c3a6f5', { spec: 0.2, vary: 0.035 });
  m('lav2', '#9e7fea', { spec: 0.2, vary: 0.035 });
  m('coral', '#ff9e5e', { spec: 0.2, vary: 0.035 });
  m('red', '#ff6363', { spec: 0.2, vary: 0.035 });
  m('brown', '#b97a4a', { vary: 0.04 });
  m('choco', '#8a5636', { vary: 0.04 });
  // ground
  m('grass', '#8bd748', { vary: 0.06, grid: 0.0, sss: 0.15 });
  m('grass2', '#74cd45', { vary: 0.06, grid: 0.0, sss: 0.15 });
  m('grass3', '#a5e25a', { vary: 0.06, grid: 0.0, sss: 0.15 });
  m('grassDk', '#55bf52', { vary: 0.06, grid: 0.0, sss: 0.15 });
  m('dirt', '#d9b98a', { vary: 0.05 });
  m('sand', '#f8e9ca', { vary: 0.03, grid: 0.0, grain: 0.07 });
  m('sand2', '#f1ddb8', { vary: 0.03, grid: 0.0, grain: 0.07 });
  m('sandWet', '#e4cca0', { vary: 0.03, grid: 0.0, grain: 0.06, spec: 0.15, wet: 0.4, caustic: 1 });
  m('rock', '#c4b6a5', { vary: 0.07, grid: 0.0 });
  m('rock2', '#ad9f8f', { vary: 0.07, grid: 0.0 });
  m('rock3', '#d5c9ba', { vary: 0.07, grid: 0.0 });
  m('rockDk', '#968a7d', { vary: 0.07, grid: 0.0 });
  m('rockWet', '#8f8478', { vary: 0.06, spec: 0.3, shin: 0.6, wet: 0.6 });
  // tiles / pools
  m('tile', '#f3f7f8', { grid: 0.9, vary: 0.025, spec: 0.25, shin: 0.75 });
  m('tile2', '#e4eff2', { grid: 0.9, vary: 0.025, spec: 0.25, shin: 0.75 });
  m('tileWet', '#dfeaee', { grid: 0.9, vary: 0.025, spec: 0.5, shin: 0.8, wet: 0.6 });
  m('tileBlue', '#a9ddf2', { grid: 0.9, vary: 0.03, spec: 0.25, shin: 0.75 });
  m('mosaic', '#38a6e6', { grid: 0.9, vary: 0.06, spec: 0.3, shin: 0.75 });
  m('mosaic2', '#2a8fd6', { grid: 0.9, vary: 0.06, spec: 0.3, shin: 0.75 });
  m('coping', '#fdfdfb', { grid: 0.5, vary: 0.02, spec: 0.25, shin: 0.7 });
  m('poolFloor', '#c2ebf6', { grid: 0.7, vary: 0.03, caustic: 1 });
  m('poolFloor2', '#a5e0f4', { grid: 0.7, vary: 0.03, caustic: 1 });
  m('poolLine', '#3d9ad8', { grid: 0.6, vary: 0.03, caustic: 1 });
  m('riverBed', '#b4e6ef', { grid: 0.4, vary: 0.05, caustic: 1 });
  // paving
  m('pave', '#efe8db', { grid: 0.55, vary: 0.035 });
  m('pave2', '#e4dac9', { grid: 0.55, vary: 0.035 });
  m('paveEdge', '#d3c5af', { grid: 0.5, vary: 0.035 });
  m('plaza', '#f6f2e9', { grid: 0.7, vary: 0.025, spec: 0.12 });
  m('plazaBlue', '#c6e8f7', { grid: 0.7, vary: 0.025, spec: 0.12 });
  m('plazaSky', '#7fd0f4', { grid: 0.7, vary: 0.025, spec: 0.12 });
  m('plazaLemon', '#ffefb3', { grid: 0.7, vary: 0.025, spec: 0.12 });
  m('plazaMint', '#cdf3e2', { grid: 0.7, vary: 0.025, spec: 0.12 });
  m('plazaPink', '#ffe1ea', { grid: 0.7, vary: 0.025, spec: 0.12 });
  m('soft1', '#9fe8cf', { grid: 0.3, vary: 0.03 });
  m('soft2', '#ffe58a', { grid: 0.3, vary: 0.03 });
  m('soft3', '#ffc3d6', { grid: 0.3, vary: 0.03 });
  m('soft4', '#a9dcfa', { grid: 0.3, vary: 0.03 });
  m('road', '#cdd6dd', { grid: 0.0, vary: 0.02, grain: 0.05 });
  m('roadLine', '#ffffff', { grid: 0.0, vary: 0.01 });
  // wood
  m('wood', '#e8bb86', { grid: 0.25, vary: 0.06 });
  m('wood2', '#d8a671', { grid: 0.25, vary: 0.06 });
  m('woodDk', '#bf8b58', { grid: 0.2, vary: 0.06 });
  // metal / glass windows
  m('steel', '#dae2e8', { spec: 0.45, shin: 0.8, vary: 0.02 });
  m('steel2', '#b8c6d1', { spec: 0.45, shin: 0.8, vary: 0.02 });
  m('rail', '#f3f7fa', { spec: 0.6, shin: 0.9, vary: 0.015 });
  m('win', '#93d6f5', { spec: 0.9, shin: 0.95, vary: 0.02, grid: 0.2 });
  m('win2', '#6cc0ee', { spec: 0.9, shin: 0.95, vary: 0.02, grid: 0.2 });
  m('dark', '#3c4a66', { vary: 0.03 });
  m('rubber', '#5b6478', { vary: 0.03 });
  // foliage
  m('leaf', '#58c840', { vary: 0.08, sss: 1, sway: 0.0 });
  m('leaf2', '#3cb352', { vary: 0.08, sss: 1 });
  m('leaf3', '#8fdc4a', { vary: 0.08, sss: 1 });
  m('leafDk', '#2f9f5a', { vary: 0.08, sss: 1 });
  m('leafTeal', '#35b88a', { vary: 0.08, sss: 1 });
  m('fernA', '#6ad24a', { vary: 0.08, sss: 1, sway: 0.25 });
  m('frond', '#5acb45', { vary: 0.07, sss: 1, sway: 0.35 });
  m('frond2', '#45b94e', { vary: 0.07, sss: 1, sway: 0.6 });
  m('frond3', '#9bdf55', { vary: 0.07, sss: 1, sway: 1.0 });
  m('frondS', '#5acb45', { vary: 0.07, sss: 1, sway: 0.15 });
  m('trunk', '#c99f70', { vary: 0.06, grid: 0.1 });
  m('trunk2', '#ae855a', { vary: 0.06, grid: 0.1 });
  m('coconut', '#8e6b3b', { vary: 0.06, sway: 0.2 });
  m('coconutG', '#a5c24a', { vary: 0.06, sway: 0.2 });
  m('flowerP', '#ff7eb0', { vary: 0.06, sss: 0.4 });
  m('flowerY', '#ffe14a', { vary: 0.06, sss: 0.4 });
  m('flowerR', '#ff6a6a', { vary: 0.06, sss: 0.4 });
  m('flowerW', '#ffffff', { vary: 0.04, sss: 0.4 });
  m('flowerL', '#c49bf5', { vary: 0.06, sss: 0.4 });
  m('flowerO', '#ffa34d', { vary: 0.06, sss: 0.4 });
  // slides (glossy fibreglass) — smooth normals, no merge
  const sl = { spec: 0.85, shin: 0.85, vary: 0.02, noMerge: 1, wet: 0.2 };
  m('slBlue', '#2fb4f5', sl); m('slYellow', '#ffd632', sl); m('slMint', '#3fd6a8', sl); m('slPink', '#ff86b0', sl);
  m('slLav', '#ad8cf0', sl); m('slOrange', '#ff9445', sl); m('slRed', '#ff5866', sl); m('slGreen', '#62d65c', sl);
  m('slWhite', '#fbfdff', sl); m('slNavy', '#3b3f95', sl); m('slTeal', '#22cbd0', sl); m('slSky', '#7fd3fa', sl);
  m('slStar', '#fff6c2', Object.assign({}, sl, { emis: 0.9 }));
  m('slRing', '#ff8ad8', Object.assign({}, sl, { emis: 0.7 }));
  m('slRing2', '#7ff0ff', Object.assign({}, sl, { emis: 0.7 }));
  // rainbow racer lanes
  m('rbRed', '#ff5a6e', sl); m('rbOrange', '#ff9f43', sl); m('rbYellow', '#ffd83b', sl);
  m('rbGreen', '#5ad86b', sl); m('rbBlue', '#3ba5f5', sl); m('rbPurple', '#a57cf0', sl);
  // glass (transparent)
  const gl = { cls: 'glass', noMerge: 1 };
  m('glClear', '#e8fbff', Object.assign({ alpha: 0.13 }, gl));
  m('glBlue', '#8fdcff', Object.assign({ alpha: 0.17 }, gl));
  m('glYellow', '#ffeb8a', Object.assign({ alpha: 0.2 }, gl));
  m('glPink', '#ffc3d8', Object.assign({ alpha: 0.18 }, gl));
  m('glMint', '#a8f3d8', Object.assign({ alpha: 0.18 }, gl));
  m('glLav', '#d9c7ff', Object.assign({ alpha: 0.18 }, gl));
  m('glWin', '#cfefff', Object.assign({ alpha: 0.22 }, { cls: 'glass' }));
  // water voxels (slides / channels)
  m('waterV', '#86e6f4', { cls: 'water', noMerge: 1 });
  // emissive
  m('lampY', '#fff3a6', { emis: 1.2, vary: 0.0 });
  m('lampW', '#ffffff', { emis: 1.0, vary: 0.0 });
  m('lampOff', '#d9e4ea', { vary: 0.0, spec: 0.5 });
  m('ledPink', '#ff8fc8', { emis: 1.1, vary: 0.0 });
  m('ledCyan', '#7ff2ff', { emis: 1.1, vary: 0.0 });
  m('ledLemon', '#ffe55c', { emis: 1.1, vary: 0.0 });
  m('ledLav', '#c9a2ff', { emis: 1.1, vary: 0.0 });
  m('crystalC', '#8ff8ff', { emis: 0.9, vary: 0.05, spec: 0.8 });
  m('crystalP', '#d6a8ff', { emis: 0.9, vary: 0.05, spec: 0.8 });
  m('crystalB', '#7fb8ff', { emis: 0.9, vary: 0.05, spec: 0.8 });
  m('screen', '#163c6e', { vary: 0.0, spec: 0.6, shin: 0.9 });
  m('caveRock', '#8f8aa3', { vary: 0.08 });
  m('caveRock2', '#7d7894', { vary: 0.08 });
  // signage
  m('signW', '#ffffff', { vary: 0.0, grid: 0.0 });
  m('signB', '#1e9be8', { vary: 0.0, grid: 0.0 });
  m('signY', '#ffd23a', { vary: 0.0, grid: 0.0 });
  m('signN', '#23407e', { vary: 0.0, grid: 0.0 });
  m('signP', '#ff7aa8', { vary: 0.0, grid: 0.0 });
  m('signM', '#3fd1a1', { vary: 0.0, grid: 0.0 });
  m('signL', '#a787f0', { vary: 0.0, grid: 0.0 });
  m('signO', '#ff9a45', { vary: 0.0, grid: 0.0 });
  // fabrics
  m('fabW', '#ffffff', { vary: 0.02, sss: 0.3 });
  m('fabB', '#45c3f5', { vary: 0.02, sss: 0.3 });
  m('fabY', '#ffe04d', { vary: 0.02, sss: 0.3 });
  m('fabP', '#ffa3c2', { vary: 0.02, sss: 0.3 });
  m('fabM', '#6fe0b5', { vary: 0.02, sss: 0.3 });
  m('fabL', '#c2a3f5', { vary: 0.02, sss: 0.3 });
  m('fabO', '#ffa257', { vary: 0.02, sss: 0.3 });
  m('fabR', '#ff6f7d', { vary: 0.02, sss: 0.3 });
  // misc
  m('cityW', '#f7fbff', { vary: 0.02, grid: 0.0 });
  m('cityB', '#bfe3f8', { vary: 0.02, grid: 0.0 });
  m('cityG', '#9fd4f2', { vary: 0.02, grid: 0.0, spec: 0.6 });
  m('hull', '#ffffff', { vary: 0.01, spec: 0.3 });
  m('hullB', '#2b74c9', { vary: 0.01 });
  m('sail', '#fffdf6', { vary: 0.01, sss: 0.3 });
  m('ringR', '#ff6b6b', { vary: 0.02, spec: 0.4 });
  m('tube1', '#33bff7', { vary: 0.02, spec: 0.6, shin: 0.8 });
  m('tube2', '#ffd83a', { vary: 0.02, spec: 0.6, shin: 0.8 });
  m('tube3', '#ff8fb8', { vary: 0.02, spec: 0.6, shin: 0.8 });
  m('tube4', '#5fe0b0', { vary: 0.02, spec: 0.6, shin: 0.8 });
  m('tube5', '#b493f5', { vary: 0.02, spec: 0.6, shin: 0.8 });
  m('tube6', '#ff9a4a', { vary: 0.02, spec: 0.6, shin: 0.8 });
  m('tubeW', '#ffffff', { vary: 0.02, spec: 0.6, shin: 0.8 });
  m('handle', '#2a3550', { vary: 0.02 });
})();
