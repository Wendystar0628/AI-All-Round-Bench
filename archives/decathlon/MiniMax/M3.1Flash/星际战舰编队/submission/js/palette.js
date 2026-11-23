/* 星际战舰编队 — palette
 * One colour logic for hulls, weapons, shields and every interior:
 *   large quiet surfaces  -> hullMain / hullMid   (blue steel)
 *   recessed deep members -> hullDark / deep       (absorbs light)
 *   raised metal edges    -> trim / steel          (sharp highlight)
 *   propulsion & conduits -> glow (cyan)
 *   ordnance & hazard    -> warm / red (amber)
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const M = F.Vox.Mat;
  const v = F.Vox.variant;

  const P = {
    hullMain: M('#4a5c76', 0, 0.30),
    hullMid: M('#36445e', 0, 0.34),
    hullDark: M('#252e3e', 0, 0.22),
    deep: M('#171b25', 0, 0.10),
    inner: M('#1e2431', 0, 0.14),
    trim: M('#8593ab', 0, 0.55),
    steel: M('#aab7c8', 0, 0.75),
    plate: M('#3c4a60', 0, 0.40),

    glow: M('#63e9ff', 2.10, 0.2),
    glowSoft: M('#38b7e0', 0.85, 0.2),
    glowDeep: M('#17566f', 0.30, 0.2),
    warm: M('#ffb257', 2.30, 0.2),
    warmSoft: M('#c9762a', 0.70, 0.2),
    red: M('#ff5340', 1.70, 0.2),

    rockA: M('#5b5048', 0, 0.16),
    rockB: M('#443a34', 0, 0.13),
    rockC: M('#6b5c4e', 0, 0.18),
    rockHot: M('#ff7a3c', 1.4, 0.2),

    cabin: M('#2c3646', 0, 0.18),
    console: M('#3f5163', 0, 0.45),
    screen: M('#7ce8ff', 1.5, 0.2),
    screenWarm: M('#ffd28a', 1.2, 0.2),
  };

  // a handful of pre-shaded variants used by the builders
  P.hullMainHi = v(P.hullMain, 1.22);
  P.hullMainLo = v(P.hullMain, 0.74);
  P.hullMidHi = v(P.hullMid, 1.2);
  P.hullMidLo = v(P.hullMid, 0.72);
  P.hullDarkHi = v(P.hullDark, 1.3);
  P.deepHi = v(P.deep, 1.7);
  P.trimHi = v(P.trim, 1.18);
  P.rockAlt = v(P.rockA, 1.18);
  P.rockAlt2 = v(P.rockA, 0.78);

  F.Palette = P;
})(window);
