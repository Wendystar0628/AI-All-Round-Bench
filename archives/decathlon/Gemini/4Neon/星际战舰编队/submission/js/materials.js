// js/materials.js - Calibrated Filmic Fleet Material Palette
// Tuned so sunlit ceramic-titanium sits cleanly below HDR bloom threshold while emissives glow with rich color saturation!
window.App = window.App || {};

(function (App) {
  const MAT = {
    EMPTY: 0,
    HULL_MAIN: 1,
    HULL_LIGHT: 2,
    HULL_MID: 3,
    ARMOR_SLATE: 4,
    ARMOR_DARK_SLATE: 5,
    FRAME_DARK: 6,
    FRAME_DEEP: 7,
    METAL_GOLD: 8,
    METAL_STEEL: 9,
    EMIT_CYAN: 10,
    EMIT_CYAN_HOT: 11,
    EMIT_AMBER: 12,
    EMIT_AMBER_HOT: 13,
    EMIT_CHARGE: 14,
    EMIT_BLUE_SOFT: 15,
    GLASS_CYAN: 16,
    GLASS_AMBER: 17,
    GLASS_CORE: 18,
    ROCK_DARK: 19,
    ROCK_MID: 20,
    ROCK_LIGHT: 21,
    ROCK_RUST: 22,
    ROCK_FRACTURE: 23,
    WEAPON_DARK: 24,
    MISSILE_BODY: 25,
    MISSILE_WARHEAD: 26,
    SHUTTLE_ACCENT: 27,
    BRIDGE_DECK: 28,
    HOLO_CYAN: 29,
  };

  const DEF = new Array(32).fill(null).map(() => [0.5, 0.5, 0.5, 0.5, 0.0, 0.0, 1.0, 0]);
  const setM = (id, rgb, rough, metal, emit, alpha = 1.0, flags = 0) => {
    DEF[id] = [rgb[0], rgb[1], rgb[2], rough, metal, emit, alpha, flags];
  };

  // Primary Ceramic-Titanium Hulls (sculpted satin reflectance, never clips to chalky white!)
  setM(MAT.HULL_MAIN,        [0.52, 0.56, 0.62], 0.40, 0.20, 0.00, 1.0, 0);
  setM(MAT.HULL_LIGHT,       [0.64, 0.68, 0.74], 0.34, 0.24, 0.00, 1.0, 0);
  setM(MAT.HULL_MID,         [0.37, 0.42, 0.49], 0.46, 0.24, 0.00, 1.0, 0);

  // Secondary Cool Slate Armor
  setM(MAT.ARMOR_SLATE,      [0.21, 0.27, 0.35], 0.48, 0.36, 0.00, 1.0, 0);
  setM(MAT.ARMOR_DARK_SLATE, [0.13, 0.17, 0.23], 0.56, 0.38, 0.00, 1.0, 0);

  // Deep Structural Subframe & Recessed Channels (strong light absorption -> crisp dark crevices!)
  setM(MAT.FRAME_DARK,       [0.07, 0.09, 0.13], 0.78, 0.16, 0.00, 1.0, 0);
  setM(MAT.FRAME_DEEP,       [0.035, 0.048, 0.07], 0.90, 0.08, 0.00, 1.0, 0);

  // Sharp Metallic Accents (burnished champagne gold & titanium-chrome rails)
  setM(MAT.METAL_GOLD,       [0.94, 0.72, 0.32], 0.20, 0.88, 0.00, 1.0, 0);
  setM(MAT.METAL_STEEL,      [0.54, 0.60, 0.68], 0.18, 0.90, 0.00, 1.0, 0);

  // Calibrated Richly-Colored HDR Emissives (preserve hue saturation inside bloom!)
  setM(MAT.EMIT_CYAN,        [0.10, 0.80, 1.00], 0.25, 0.0,  1.65, 1.0, 0);
  setM(MAT.EMIT_CYAN_HOT,    [0.42, 0.94, 1.00], 0.15, 0.0,  2.80, 1.0, 8);
  setM(MAT.EMIT_AMBER,       [1.00, 0.52, 0.09], 0.25, 0.0,  1.55, 1.0, 0);
  setM(MAT.EMIT_AMBER_HOT,   [1.00, 0.68, 0.20], 0.15, 0.0,  2.45, 1.0, 0);
  setM(MAT.EMIT_CHARGE,      [0.12, 0.84, 1.00], 0.20, 0.0,  0.90, 1.0, 2);
  setM(MAT.EMIT_BLUE_SOFT,   [0.26, 0.58, 0.88], 0.35, 0.0,  0.88, 1.0, 0);

  // Crystal-Clear Translucent 1-Voxel Glass & Holograms
  setM(MAT.GLASS_CYAN,       [0.18, 0.48, 0.68], 0.08, 0.28, 0.05, 0.15, 1);
  setM(MAT.GLASS_AMBER,      [1.00, 0.56, 0.12], 0.12, 0.10, 0.78, 0.42, 1);
  setM(MAT.GLASS_CORE,       [0.08, 0.74, 0.98], 0.10, 0.15, 0.95, 0.28, 1 | 8);

  // Rugged Asteroid Strata (deep dramatic contrast against molten orange cleavage!)
  setM(MAT.ROCK_DARK,        [0.13, 0.12, 0.14], 0.92, 0.04, 0.00, 1.0, 0);
  setM(MAT.ROCK_MID,         [0.23, 0.21, 0.22], 0.88, 0.05, 0.00, 1.0, 0);
  setM(MAT.ROCK_LIGHT,       [0.35, 0.32, 0.30], 0.84, 0.05, 0.00, 1.0, 0);
  setM(MAT.ROCK_RUST,        [0.33, 0.22, 0.17], 0.86, 0.07, 0.00, 1.0, 0);
  setM(MAT.ROCK_FRACTURE,    [0.17, 0.15, 0.15], 0.84, 0.05, 0.00, 1.0, 4);

  // Weapons, Missiles, Shuttles & Interior Polished Deck
  setM(MAT.WEAPON_DARK,      [0.11, 0.14, 0.19], 0.40, 0.62, 0.00, 1.0, 0);
  setM(MAT.MISSILE_BODY,     [0.64, 0.68, 0.74], 0.35, 0.26, 0.00, 1.0, 0);
  setM(MAT.MISSILE_WARHEAD,  [0.92, 0.30, 0.10], 0.30, 0.30, 0.45, 1.0, 0);
  setM(MAT.SHUTTLE_ACCENT,   [0.92, 0.54, 0.12], 0.30, 0.36, 0.00, 1.0, 0);
  setM(MAT.BRIDGE_DECK,      [0.08, 0.11, 0.16], 0.24, 0.48, 0.00, 1.0, 0);
  setM(MAT.HOLO_CYAN,        [0.06, 0.72, 0.96], 0.10, 0.00, 0.80, 0.36, 1);

  const isTransparent = (id) => (DEF[id] ? (DEF[id][7] & 1) !== 0 : false);

  const colorAlphaArr = new Float32Array(32 * 4);
  const pbrArr = new Float32Array(32 * 4);
  for (let i = 0; i < 32; i++) {
    const d = DEF[i];
    colorAlphaArr[i * 4 + 0] = d[0];
    colorAlphaArr[i * 4 + 1] = d[1];
    colorAlphaArr[i * 4 + 2] = d[2];
    colorAlphaArr[i * 4 + 3] = d[6];
    pbrArr[i * 4 + 0] = d[3];
    pbrArr[i * 4 + 1] = d[4];
    pbrArr[i * 4 + 2] = d[5];
    pbrArr[i * 4 + 3] = d[7];
  }

  App.MAT = MAT;
  App.Materials = {
    DEF,
    isTransparent,
    colorAlphaArr,
    pbrArr,
  };
})(window.App);
