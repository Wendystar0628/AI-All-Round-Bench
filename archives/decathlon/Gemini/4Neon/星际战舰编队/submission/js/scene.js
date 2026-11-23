// js/scene.js - 78-Second Pure Deterministic Fleet, Interiors, 4-Weapon Barrage, Fracture, Shields & Camera Director
window.App = window.App || {};

(function (App) {
  const M = App.Math;
  const TOTAL_DURATION = 78.0;

  // Deterministic export run segments (all integer-second boundaries -> exact frame counts at 3fps & 60fps!)
  const RUNS = [
    { id: 'act1_fleet',     start: 0,  duration: 21 }, // 0..21s  Exterior scale reveal + shuttle chase into hangar mouth
    { id: 'act2_interiors', start: 21, duration: 23 }, // 21..44s Hangar -> Bridge -> Power Core -> Conduit Corridor
    { id: 'act3_barrage',   start: 44, duration: 20 }, // 44..64s Main Beam, Pulse Turrets, CIWS, Missiles & Voxel Shatter
    { id: 'act4_shields',   start: 64, duration: 14 }, // 64..78s Fleet Shields, Thruster Overdrive, Acceleration & Loop Wrap
  ];

  // =========================================================================
  // 1. FLEET FORMATION ROSTER (1 Flagship + 18 Close-Escorts + 20 Vanguards = 39 Warships!)
  // =========================================================================
  function buildFleetRoster() {
    const rng = M.mulberry32(202611);
    const escorts = [];

    // --- 18 CLOSE-ESCORTS (近卫舰, Length 184) flanking, dorsal/ventral guard & rear echelons ---
    const closePositions = [
      // Hero foreground port-flank Close-Escort (stars in Shot 1 scale comparison & Shot 8a CIWS barrage!)
      { p: [-295, -24,  285], spread: [-105, -14, 175], hero: 'ciws' },
      // Starboard near flank escort (elevated clear of BOTH Shot 1 sweep & Shot 2 hangar approach!)
      { p: [ 330, 155,  295], spread: [105,  22,  35] },
      // Mid-flank staggered elevations
      { p: [-340,  95, -155], spread: [-110, 40, -10] },
      { p: [ 355, -72, -195], spread: [115, -30, -15] },
      { p: [-225, -162,  65], spread: [-80, -55,  20] },
      { p: [ 245, 148,  -55], spread: [ 85,  60,  10] },
      // Forward close guard screen
      { p: [-245,  76,  485], spread: [-95,  34,  55] },
      { p: [ 265, -52,  415], spread: [120, -28,  25] },
      // Aft & trailing escort columns (creating rich depth behind flagship!)
      { p: [-265,  18, -560], spread: [-75,  15, -25] },
      { p: [ 275, -22, -590], spread: [ 80, -15, -25] },
      { p: [-480, -65, -430], spread: [-120,-20, -20] },
      { p: [ 495,  88, -460], spread: [120,  30, -20] },
      { p: [-175, 165, -740], spread: [-65,  45, -35] },
      { p: [ 195,-155, -780], spread: [ 70, -45, -35] },
      { p: [-420,  52, -960], spread: [-90,  20, -40] },
      { p: [ 440, -48,-1020], spread: [ 95, -20, -40] },
      { p: [-640, 140, -760], spread: [-110, 35, -30] },
      { p: [ 660,-130, -820], spread: [110, -35, -30] },
    ];

    closePositions.forEach((c, idx) => {
      escorts.push({
        id: `ce_${idx}`,
        type: 'close',
        basePos: c.p,
        spreadOffset: c.spread,
        hero: c.hero || null,
        phase: rng() * Math.PI * 2,
        freq: 1 + (idx % 3), // Integer harmonics over TOTAL_DURATION for exact seamless loop!
        shieldDelay: 0.65 + (Math.hypot(c.p[0], c.p[1], c.p[2]) / 1600) * 2.1,
        shieldScale: [76, 48, 114],
        engines: [
          { p: [0, 0, -90], r: 9.5 },
          { p: [-24, 0, -86], r: 6.5 },
          { p: [ 24, 0, -86], r: 6.5 },
        ],
        ciwsMounts: [
          [-24, 26, 28], [24, 26, 28],
          [-30, 26, -34], [30, 26, -34],
        ],
      });
    });

    // --- 20 VANGUARD ESCORTS (前卫舰, Length 216) sweeping forward spearhead & outer perimeter ---
    const vanguardPositions = [
      // VG #0: Hero foreground port Vanguard (sweeps past lower-left edge at t=0..4s & 75..78s, clears lane for CE#0 during combat!)
      { p: [-415,  28,  685], spread: [-195,  95,  65], hero: 'opener' },
      // VG #1 & VG #2: Hero starboard missile-launch Vanguards (star in Shot 8b missile ripple!)
      { p: [ 340,  54,  655], spread: [110,  24,  25], hero: 'missile1' },
      { p: [ 415, -48,  805], spread: [120, -25,  20], hero: 'missile2' },
      // Forward multi-tier spearhead wedge
      { p: [-445, -52,  825], spread: [-130,-25,  15], hero: 'missile3' },
      { p: [ 195, 165,  770], spread: [ 90,  65,  15] },
      { p: [-205,-158,  790], spread: [-95, -60,  15] },
      { p: [ 580, 118,  320], spread: [155,  42, -20] },
      { p: [-595,-118,  455], spread: [-155,-45,  10] },
      // Wide outer perimeter flank wings (creating huge spatial width & occlusion parallax!)
      { p: [ 680, -30,  120], spread: [160, -15,   0] },
      { p: [-695,  48,   95], spread: [-160, 20,   0] },
      { p: [ 785, 185, -240], spread: [140,  50, -15] },
      { p: [-790,-175, -270], spread: [-140,-50, -15] },
      // Far advance pickets & deep upper/lower echelons
      { p: [-560, 210, 1020], spread: [-140, 60, -40] },
      { p: [ 575,-205, 1040], spread: [145, -60, -40] },
      { p: [-310, 275,  510], spread: [-100, 75,  10] },
      { p: [ 320,-265,  495], spread: [100, -75,  10] },
      { p: [-840,  75,  760], spread: [-145, 25, -10] },
      { p: [ 860, -82,  740], spread: [150, -25, -10] },
      { p: [-620,-240, -680], spread: [-110,-55, -30] },
      { p: [ 640, 250, -710], spread: [115,  55, -30] },
    ];

    vanguardPositions.forEach((v, idx) => {
      escorts.push({
        id: `vg_${idx}`,
        type: 'vanguard',
        basePos: v.p,
        spreadOffset: v.spread,
        hero: v.hero || null,
        phase: rng() * Math.PI * 2,
        freq: 1 + ((idx + 1) % 3),
        shieldDelay: 0.95 + (Math.hypot(v.p[0], v.p[1], v.p[2]) / 1600) * 2.2,
        shieldScale: [86, 38, 130],
        engines: [
          { p: [0, 0, -106], r: 7.5 },
          { p: [-21, 0, -100], r: 5.5 },
          { p: [ 21, 0, -100], r: 5.5 },
        ],
      });
    });

    return escorts;
  }

  const ESCORTS = buildFleetRoster();

  // Flagship weapon mounts & engines
  const FLAGSHIP_ENGINES = [
    { p: [0, 4, -554],    r: 25.0 }, // Colossal central bell
    { p: [-66, -2, -522], r: 18.5 }, // Flank primary bells
    { p: [ 66, -2, -522], r: 18.5 },
    { p: [-46, 46, -474], r: 10.5 }, // Dorsal trim bells
    { p: [ 46, 46, -474], r: 10.5 },
    { p: [-38,-42, -488], r:  9.5 }, // Ventral trim bells
    { p: [ 38,-42, -488], r:  9.5 },
    { p: [-148, 4, -286], r: 11.5 }, // Outrigger wing verniers
    { p: [ 148, 4, -286], r: 11.5 },
  ];

  // 10 Hull-mounted Pulse Turrets + 4 Hovering Tactical Pulse Pylons!
  const PULSE_TURRETS = [
    { p: [-56, 61,  165], hover: false, side: -1, phase: 0 },
    { p: [ 56, 61,  165], hover: false, side:  1, phase: 1 },
    { p: [-62, 65,   45], hover: false, side: -1, phase: 2 },
    { p: [ 62, 65,   45], hover: false, side:  1, phase: 3 },
    { p: [-66, 65,  -75], hover: false, side: -1, phase: 4 },
    { p: [ 66, 65,  -75], hover: false, side:  1, phase: 5 },
    { p: [-154, 43,  25], hover: false, side: -1, phase: 6 },
    { p: [ 154, 43,  25], hover: false, side:  1, phase: 7 },
    { p: [-156, 37,-115], hover: false, side: -1, phase: 8 },
    { p: [ 156, 37,-115], hover: false, side:  1, phase: 9 },
    // 4 Floating Tactical Hover Pylons flanking the flagship (elevated cleanly above shuttle flight lane!)
    { p: [-228, 52, 130], hover: true,  side: -1, phase: 10 },
    { p: [ 228, 52, 130], hover: true,  side:  1, phase: 11 },
    { p: [-232, 34, -65], hover: true,  side: -1, phase: 12 },
    { p: [ 232, 34, -65], hover: true,  side:  1, phase: 13 },
  ];

  // =========================================================================
  // 2. ASTEROID CLUSTER ROSTER & COMBAT TARGET ASSIGNMENTS
  // =========================================================================
  // Positions are defined at COMBAT TIME (t = 46..60s); fleet forward travel shifts them smoothly!
  const ASTEROIDS = [
    // Hero A1: Flagship Spinal Beam Main Cannon Target!
    {
      id: 'A1_beam', model: 'heroBeam',
      combatPos: [32, 16, 1240], rotSpeed: [0.04, 0.07, 0.03], initRot: [0.3, 0.5, 0.2],
      hitStart: 45.8, shatterTime: 47.6, shatterPower: 46,
    },
    // Hero A2: Vanguard Missile Salvo Target (delayed massive core rupture!)
    {
      id: 'A2_missile', model: 'heroMissile',
      combatPos: [205, -24, 1445], rotSpeed: [-0.05, 0.06, -0.04], initRot: [0.8, 1.4, -0.3],
      hitStart: 57.5, shatterTime: 59.8, shatterPower: 58,
    },
    // Medium B1 & B2: Flagship Pulse Turret Targets!
    {
      id: 'B1_pulse', model: 'medA',
      combatPos: [-225, 62, 1110], rotSpeed: [0.08, -0.09, 0.05], initRot: [0.2, 2.1, 0.4],
      hitStart: 48.2, shatterTime: 49.8, shatterPower: 38,
    },
    {
      id: 'B2_pulse', model: 'medB',
      combatPos: [260, 82, 1165], rotSpeed: [-0.07, 0.11, 0.06], initRot: [1.1, 0.7, -0.5],
      hitStart: 49.0, shatterTime: 51.0, shatterPower: 38,
    },
    // Small C1..C4: Close-Escort Rapid-Fire CIWS Targets!
    {
      id: 'C1_ciws', model: 'smallA',
      combatPos: [-355, -28, 915], rotSpeed: [0.16, 0.22, -0.14], initRot: [0.4, 0.8, 1.2],
      hitStart: 51.8, shatterTime: 53.0, shatterPower: 42,
    },
    {
      id: 'C2_ciws', model: 'smallB',
      combatPos: [-240, -76, 855], rotSpeed: [-0.18, 0.15, 0.19], initRot: [1.5, -0.4, 0.6],
      hitStart: 52.4, shatterTime: 53.8, shatterPower: 42,
    },
    {
      id: 'C3_ciws', model: 'smallA',
      combatPos: [-425, 46, 975], rotSpeed: [0.14, -0.19, 0.12], initRot: [2.2, 0.3, -0.9],
      hitStart: 53.2, shatterTime: 54.6, shatterPower: 42,
    },
    {
      id: 'C4_ciws', model: 'smallB',
      combatPos: [315, -58, 955], rotSpeed: [-0.15, -0.17, 0.14], initRot: [0.9, 1.9, 0.1],
      hitStart: 52.8, shatterTime: 54.4, shatterPower: 40,
    },
    // Unhit Ambient Framing & Depth Parallax Rocks
    { id: 'D1', model: 'medA',   combatPos: [-560, 145, 1480], rotSpeed: [0.05, 0.06, -0.04], initRot: [0.1, 1.1, 0.7], hitStart: 999, shatterTime: 999, shatterPower: 0 },
    { id: 'D2', model: 'medB',   combatPos: [ 545, 175, 1620], rotSpeed: [-0.06, 0.04, 0.05], initRot: [1.4, 0.2, 1.1], hitStart: 999, shatterTime: 999, shatterPower: 0 },
    { id: 'D3', model: 'smallA', combatPos: [-110, 155, 1020], rotSpeed: [0.11, -0.08, 0.09], initRot: [0.7, 2.3, 0.2], hitStart: 999, shatterTime: 999, shatterPower: 0 },
    { id: 'D4', model: 'smallB', combatPos: [ 455,-140, 1280], rotSpeed: [-0.09, 0.12, -0.08], initRot: [2.0, 0.5, 1.7], hitStart: 999, shatterTime: 999, shatterPower: 0 },
    { id: 'D5', model: 'smallA', combatPos: [-480,-150, 1210], rotSpeed: [0.10, 0.09, 0.07], initRot: [0.5, 1.6, 2.4], hitStart: 999, shatterTime: 999, shatterPower: 0 },
  ];

  // Smooth cumulative fleet forward travel offset for the asteroid cluster!
  // Keeps cluster far ahead (+3600) at t=0, approaching cleanly through Bridge view (+1950 at t=31s),
  // hovering in prime combat zone during t=44..63s, then rushing swiftly aft behind fleet during acceleration (t=65..78s)!
  function getClusterZShift(t) {
    if (t < 44.0) {
      // Smooth approach from +2350 extra distance down to 0 by t=44s
      const u = t / 44.0;
      const ease = 1 - Math.pow(1 - u, 1.55);
      return M.lerp(2350, 0, ease);
    } else if (t < 64.0) {
      // Slow relative tactical drift during the 20s battle
      return -(t - 44.0) * 6.5;
    } else {
      // Dramatic fleet acceleration surge! Shattered debris rushes swiftly aft & cleanly clears camera well before t=77.5s!
      const u = (t - 64.0) / 13.0;
      const accel = Math.pow(Math.min(1.12, u), 2.15);
      return -130.0 - accel * 5200.0;
    }
  }

  // Next-cycle pristine cluster drifting into far deep space during acceleration (t=70..78s)
  // so at t=78.0s it sits at the EXACT +2350 shift where Cluster A begins at t=0.0s!
  function getNextClusterZShift(t) {
    if (t < 68.0) return 99999;
    const u = (t - 68.0) / 10.0;
    return M.lerp(5600, 2350, M.easeInOutCubic(u));
  }

  // =========================================================================
  // 3. DETERMINISTIC COMBAT EVENT SCHEDULES (4 WEAPON SYSTEMS!)
  // =========================================================================
  function buildCombatEvents() {
    const rng = M.mulberry32(998877);

    // A. Flagship Pulse Turret Salvos (t = 47.2 .. 53.4s, staggered double-shot grouped bursts!)
    const pulseShots = [];
    for (let wave = 0; wave < 6; wave++) {
      for (let ti = 0; ti < PULSE_TURRETS.length; ti++) {
        const tur = PULSE_TURRETS[ti];
        const baseFire = 47.2 + wave * 0.88 + (ti % 4) * 0.14 + (tur.hover ? 0.07 : 0);
        const targetIdx = (ti % 3 === 2) ? 0 : (tur.side < 0 ? 2 : 3);
        // Twin-barrel grouped double pulse!
        for (let dbl = 0; dbl < 2; dbl++) {
          const tFire = baseFire + dbl * 0.13;
          const aimOff = [(rng() - 0.5) * 52, (rng() - 0.5) * 38, (rng() - 0.5) * 34];
          const flightTime = 0.56 + rng() * 0.10;
          pulseShots.push({
            turretIdx: ti,
            tFire,
            tHit: tFire + flightTime,
            targetIdx,
            aimOff,
          });
        }
      }
    }

    // B. Close-Escort Rapid-Fire CIWS Point-Defense Bursts (t = 51.0 .. 56.8s!)
    const ciwsShots = [];
    const activeCE = [0, 1, 4, 6, 7];
    const ciwsTargets = [4, 5, 6, 7];
    for (const ceIdx of activeCE) {
      const isHero = ceIdx === 0;
      const bursts = isHero ? 7 : 4;
      for (let b = 0; b < bursts; b++) {
        const tBurst = 51.0 + b * 0.72 + (ceIdx * 0.09) % 0.35;
        const targetIdx = isHero ? ciwsTargets[b % 3] : ciwsTargets[(ceIdx + b) % ciwsTargets.length];
        const rounds = isHero ? 11 : 6;
        for (let r = 0; r < rounds; r++) {
          const tFire = tBurst + r * 0.052; // Crisp rapid-fire staccato cadence!
          const mountIdx = (r + b) % 4;
          const aimOff = [(rng() - 0.5) * 36, (rng() - 0.5) * 28, (rng() - 0.5) * 26];
          const flightTime = 0.36 + rng() * 0.07;
          ciwsShots.push({
            escortIdx: ceIdx,
            mountIdx,
            tFire,
            tHit: tFire + flightTime,
            targetIdx,
            aimOff,
          });
        }
      }
    }

    // C. Vanguard Escort Curved-Arc Missile Salvos (24 real voxel missiles, t = 54.0 .. 60.4s!)
    // Hero VG #1 (escort idx 19), VG #2 (idx 20), VG #0 (idx 18), plus VG #3..#5!
    const missiles = [];
    const launchVGs = [19, 20, 18, 21, 22, 23]; // Indices in ESCORTS array (18..37 are Vanguards)
    for (let m = 0; m < 24; m++) {
      const vgIdx = launchVGs[m % launchVGs.length];
      const isHeroVG = (vgIdx === 19 || vgIdx === 20);
      const cellSlot = Math.floor(m / launchVGs.length) % 6;
      const side = (m % 2 === 0) ? 1 : -1;
      // Local pod launch cell coordinates on Vanguard Escort
      const localLaunch = [side * 54, 14, -30 + cellSlot * 15];
      const tLaunch = 54.05 + m * 0.105; // Crisp cascading ripple launch!
      const tIgnite = tLaunch + 0.36;    // Separate clear of bay before rocket ignition!
      const flightDur = 2.65 + (m % 5) * 0.24 + rng() * 0.25;
      const tHit = tIgnite + flightDur;  // Impacts cascade across 57.1 .. 60.4s!
      // Primary salvo dives into Hero Asteroid A2 (idx 1); a few arc into B2 (idx 3)
      const targetIdx = (m % 6 === 5) ? 3 : 1;
      const aimOff = [(rng() - 0.5) * 86, (rng() - 0.5) * 72, (rng() - 0.5) * 58];
      // Dramatic 3D outward-sweeping arc control offset!
      const arcOutX = side * (120 + rng() * 140) + (isHeroVG ? 55 : 0);
      const arcOutY = 75 + (rng() - 0.35) * 145;
      const arcMidZ = 220 + rng() * 140;

      missiles.push({
        id: m,
        escortIdx: vgIdx,
        localLaunch,
        tLaunch,
        tIgnite,
        tHit,
        targetIdx,
        aimOff,
        arcOut: [arcOutX, arcOutY, arcMidZ],
      });
    }

    // D. Pre-seeded deterministic flying voxel debris shards spawned upon each asteroid shatter!
    const debrisParticles = [];
    ASTEROIDS.forEach((ast, aIdx) => {
      if (ast.shatterTime > 100) return;
      const count = (aIdx <= 1) ? 42 : (aIdx <= 3 ? 22 : 14);
      for (let i = 0; i < count; i++) {
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(2 * rng() - 1);
        const dir = [
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta),
        ];
        const speed = 32 + rng() * (aIdx <= 1 ? 110 : 75);
        debrisParticles.push({
          astIdx: aIdx,
          variant: i % 6,
          startOff: M.v3Scale(dir, rng() * (aIdx <= 1 ? 38 : 18)),
          vel: M.v3Scale(dir, speed),
          rotVel: [(rng() - 0.5) * 3.8, (rng() - 0.5) * 3.8, (rng() - 0.5) * 3.8],
          initRot: [rng() * 6.28, rng() * 6.28, rng() * 6.28],
          tSpawn: ast.shatterTime + rng() * 0.25,
        });
      }
    });

    return { pulseShots, ciwsShots, missiles, debrisParticles };
  }

  const COMBAT = buildCombatEvents();

  // =========================================================================
  // 4. EXTERIOR & INTERIOR SHUTTLE CHOREOGRAPHY (16 Shuttles!)
  // =========================================================================
  // Evaluate exterior shuttles flying around the Flagship armor canyons, turrets, engines & hangar mouth
  function evalExteriorShuttles(t) {
    const list = [];
    const tau = (t / TOTAL_DURATION) * Math.PI * 2;

    // Hero Shuttle S0: Leads cleanly ahead of Shot 2 camera through open Wing Approach Arch into Starboard Hangar Mouth!
    const heroPath = [
      { t: 0.0,  p: [155, -24,  410] },
      { t: 5.0,  p: [188,  48,  150] },
      { t: 10.0, p: [195,  62, -240] },
      { t: 14.2, p: [244,  16,  195] },
      { t: 16.5, p: [212,   6,   76] },
      { t: 18.6, p: [154,   1,   12] }, // Leading cleanly through open Wing Approach Arch (z=-56..+68)!
      { t: 20.0, p: [104,  -1,   -6] }, // Gliding straight into illuminated Starboard Hangar Mouth well ahead of lens!
      { t: 21.3, p: [ 62,  -2,  -16] }, // Deep inside hangar bay!
      { t: 28.0, p: [120,  12, -160] },
      { t: 38.0, p: [215, -45, -360] },
      { t: 52.0, p: [255,  72, -120] },
      { t: 66.0, p: [210,  44,  280] },
      { t: 78.0, p: [155, -24,  410] },
    ];
    const pS0 = M.evalSplineVec3(heroPath, 'p', t);
    const pS0Next = M.evalSplineVec3(heroPath, 'p', (t + 0.15) % TOTAL_DURATION);
    list.push({ pos: pS0, dir: M.v3Norm(M.v3Sub(pS0Next, pS0)), isHero: true });

    // Wingman Shuttle S1 flying tight echelon beside Hero S0 during Shot 2!
    const pS1 = [pS0[0] + 24, pS0[1] - 10, pS0[2] - 32];
    const pS1Next = [pS0Next[0] + 24, pS0Next[1] - 10, pS0Next[2] - 32];
    list.push({ pos: pS1, dir: M.v3Norm(M.v3Sub(pS1Next, pS1)), isHero: false });

    // 6 Continuous Patrol / Launch / Return Shuttles gliding along flagship prow, ventral keel, engines & flanks!
    const loops = [
      // Looping through starboard negative-space canyon & around bow!
      { rx: 140, ry: 48, rz: 440, cx: 45,  cy: 25, cz: 80,  speed: 2, phase: 0.4 },
      { rx: 145, ry: 42, rz: 420, cx: -50, cy:-38, cz: 60,  speed: 2, phase: 2.6 },
      // Skimming past ventral keel & aft engine bells!
      { rx: 120, ry: 34, rz: 310, cx: 15,  cy:-72, cz:-280, speed: 3, phase: 1.2 },
      { rx: 175, ry: 55, rz: 380, cx: 0,   cy: 92, cz:-120, speed: 2, phase: 4.1 },
      // Exiting & returning to port hangar bay
      { rx: 130, ry: 22, rz: 240, cx: -150,cy:  4, cz:  40, speed: 3, phase: 0.9 },
      { rx: 125, ry: 26, rz: 260, cx: 165, cy:-12, cz: -40, speed: 3, phase: 3.7 },
    ];
    for (const lp of loops) {
      const a = tau * lp.speed + lp.phase;
      const a2 = a + 0.04;
      const p1 = [lp.cx + Math.cos(a) * lp.rx, lp.cy + Math.sin(a * 2) * lp.ry * 0.5, lp.cz + Math.sin(a) * lp.rz];
      const p2 = [lp.cx + Math.cos(a2) * lp.rx, lp.cy + Math.sin(a2 * 2) * lp.ry * 0.5, lp.cz + Math.sin(a2) * lp.rz];
      list.push({ pos: p1, dir: M.v3Norm(M.v3Sub(p2, p1)), isHero: false });
    }
    return list;
  }

  // Evaluate interior shuttles & animated maintenance cranes inside the 384-voxel Hangar (t = 21..27s)
  function evalHangarActors(t) {
    const lt = t - 21.0; // Local hangar time 0..6s
    const shuttles = [];

    // 8 Parked Shuttles neatly docked inside recessed side alcoves (facing inward or forward!)
    const alcoveZs = [-156, -96, -36, 24, 84, 144];
    for (let i = 0; i < alcoveZs.length; i++) {
      const az = alcoveZs[i];
      if (i !== 2) { // Left side alcoves (leave 1 open for outbound lifter)
        shuttles.push({ pos: [-46, -26, az], dir: [0.35, 0, 0.94], docked: true });
      }
      if (i !== 4) { // Right side alcoves
        shuttles.push({ pos: [46, -26, az], dir: [-0.35, 0, 0.94], docked: true });
      }
    }

    // Hero Incoming Shuttle entering straight down the glowing central runway from +Z -> -Z!
    const inZ = M.lerp(112, -135, M.clamp(lt / 6.0, 0, 1));
    const inX = Math.sin(lt * 0.65) * 6 - 4;
    const inY = M.lerp(-4, -18, M.smoothstep(0, 5.2, lt));
    shuttles.push({ pos: [inX, inY, inZ], dir: M.v3Norm([Math.cos(lt * 0.65) * 3, -2.5, -42]), docked: false });

    // Wingman Incoming Shuttle leading ahead on starboard lane (never clips camera!)
    shuttles.push({
      pos: [inX + 18, inY - 2, inZ - 38],
      dir: M.v3Norm([Math.cos(lt * 0.65) * 2, -2, -42]),
      docked: false,
    });

    // Outbound Shuttle lifting off from deep left alcove -> accelerating straight out the open +Z launch mouth!
    const outZ = M.lerp(-135, 225, M.clamp(lt / 5.6, 0, 1));
    const outX = M.lerp(-38, 12, M.smoothstep(0, 2.2, lt));
    const outY = M.lerp(-22, 6, M.smoothstep(0, 2.4, lt));
    shuttles.push({ pos: [outX, outY, outZ], dir: M.v3Norm([8, 6, 65]), docked: false });

    // 4 Animated Overhead Abstract Maintenance Rigs gently gliding & scanning over parked shuttles
    const rigs = [
      { pos: [-44, 17, -96 + Math.sin(t * 0.7) * 14],  rotY: 0 },
      { pos: [ 44, 17,  24 + Math.cos(t * 0.65) * 16], rotY: 0 },
      { pos: [-44, 17,  84 + Math.sin(t * 0.8 + 1) * 12], rotY: 0 },
      { pos: [ 44, 17, -36 + Math.cos(t * 0.75 + 2) * 14], rotY: 0 },
    ];

    return { shuttles, rigs };
  }

  // =========================================================================
  // 5. CAMERA DIRECTOR — 78s CONTINUOUS CINEMATOGRAPHY WITH EXACT C1 LOOP!
  // =========================================================================
  function evaluateCamera(t) {
    // --- ACT I: EXTERIOR SCALE REVEAL & SHUTTLE HANGAR ENTRY (0.0 .. 21.0s) ---
    if (t < 21.0) {
      if (t < 14.8) {
        // Shot 1: Unbroken 14.8s Scale-Revealing Exterior Sweep!
        // Start at t=0.0s matches t=78.0s EXACTLY (pos, target, fov, roll!)
        const keys = [
          { t: 0.0,  pos: [-645, 132, 1145], tgt: [ 15,   8,   95], fov: 46, roll: -0.02 }, // Iconic hero armada vista!
          { t: 3.0,  pos: [-585,  82,  745], tgt: [ 15,   8,  130], fov: 47, roll: -0.04 }, // Foreground VG #0 glides cleanly past lower-right with crisp clearance!
          { t: 5.8,  pos: [-455,  34,  415], tgt: [ 22,   4,  105], fov: 48, roll: -0.04 }, // Close-Escort CE #0 gliding in lower-left foreground vs towering flagship flank!
          { t: 8.4,  pos: [-305, -96, -135], tgt: [ 20, -28, -115], fov: 50, roll:  0.04 }, // Swoop beneath ribbed ventral keel!
          { t: 10.8, pos: [-175, -36, -735], tgt: [ 10,   4, -460], fov: 50, roll:  0.06 }, // Colossal recessed aft engine bells & ringed planet!
          { t: 13.0, pos: [ 320, 138, -580], tgt: [ 25,  14,  -60], fov: 48, roll: -0.05 }, // Soar up starboard aft showing 39-ship armada!
          { t: 14.8, pos: [ 455, 118,  215], tgt: [ 95,  16,   55], fov: 47, roll: -0.03 }, // Sweep forward along starboard wing canyon!
        ];
        return {
          mode: 'exterior',
          pos: M.evalSplineVec3(keys, 'pos', t),
          target: M.evalSplineVec3(keys, 'tgt', t),
          fov: M.evalSplineScalar(keys, 'fov', t, 48),
          roll: M.evalSplineScalar(keys, 'roll', t, 0),
        };
      } else {
        // Shot 2 (14.8 .. 21.0s): 100% open-air chase behind Hero Shuttles THROUGH the carved Wing Approach Arch into Hangar Mouth!
        const keys = [
          { t: 14.8, pos: [ 310,  22,  245], tgt: [195,   8,   75], fov: 48, roll: -0.03 },
          { t: 17.0, pos: [ 262,  10,  112], tgt: [165,   2,   18], fov: 49, roll: -0.03 }, // Framing monumental Wing Approach Arch & twin shuttles!
          { t: 19.0, pos: [ 202,   4,   34], tgt: [112,   0,   -4], fov: 51, roll: -0.02 }, // Flying cleanly through open arch portal!
          { t: 20.3, pos: [ 148,   3,    8], tgt: [ 82,  -2,  -12], fov: 53, roll:  0.00 }, // Wide clear view of Hero Shuttle entering glowing Hangar Mouth!
          { t: 21.0, pos: [ 112,   2,   -8], tgt: [ 62,  -2,  -20], fov: 55, roll:  0.00 }, // Clean occlusion wipe across dark portal jamb into matching Interior Hangar!
        ];
        return {
          mode: 'exterior',
          pos: M.evalSplineVec3(keys, 'pos', t),
          target: M.evalSplineVec3(keys, 'tgt', t),
          fov: M.evalSplineScalar(keys, 'fov', t, 50),
          roll: M.evalSplineScalar(keys, 'roll', t, 0),
        };
      }
    }

    // --- ACT II: FOUR MONUMENTAL INTERIOR SPACES (21.0 .. 44.0s) ---
    // Shot 3: Through-Going Shuttle Hangar (21.0 .. 26.8s)
    if (t < 26.8) {
      const keys = [
        { t: 21.0, pos: [  16,  12,  176], tgt: [ -4,  -8, -110], fov: 56, roll:  0.00 },
        { t: 22.8, pos: [  14,  10,  108], tgt: [ -6,  -8, -135], fov: 55, roll: -0.02 },
        { t: 24.8, pos: [ -12,   4,   24], tgt: [  4,  -6, -160], fov: 55, roll:  0.02 },
        { t: 26.3, pos: [  16,   0,  -66], tgt: [ 22,  -2, -168], fov: 52, roll:  0.02 },
        { t: 26.8, pos: [  28,   0,  -86], tgt: [ 36,   0, -120], fov: 50, roll:  0.00 },
      ];
      return {
        mode: 'hangar',
        pos: M.evalSplineVec3(keys, 'pos', t),
        target: M.evalSplineVec3(keys, 'tgt', t),
        fov: M.evalSplineScalar(keys, 'fov', t, 55),
        roll: M.evalSplineScalar(keys, 'roll', t, 0),
      };
    }

    // Shot 4: Wide Command Bridge (26.8 .. 32.8s) — Strictly inside spacious central promenade (ZERO console/glass clip!)
    if (t < 32.8) {
      const keys = [
        { t: 26.8, pos: [ -24,  21,  -54], tgt: [  6,  18,   36], fov: 54, roll: -0.02 }, // Clear aisle beside port console tiers -> full hall depth!
        { t: 28.6, pos: [ -18,  25,  -38], tgt: [  2,  19,   46], fov: 52, roll: -0.02 }, // Central octagonal Nexus & 3D Holo Fleet crisp in midground!
        { t: 30.4, pos: [   4,  30,  -28], tgt: [  4,  21,   76], fov: 50, roll:  0.00 }, // Majestic elevated vista over Holo + Flagship Prow outside!
        { t: 32.1, pos: [  20,  31,    6], tgt: [  8,  19,  190], fov: 48, roll:  0.02 }, // Live spreading escorts & oncoming asteroids through glass!
        { t: 32.8, pos: [  24,  26,   36], tgt: [ 24,  18,   66], fov: 48, roll:  0.01 }, // Clean dark window mullion occlusion wipe into Power Core!
      ];
      return {
        mode: 'bridge',
        pos: M.evalSplineVec3(keys, 'pos', t),
        target: M.evalSplineVec3(keys, 'tgt', t),
        fov: M.evalSplineScalar(keys, 'fov', t, 50),
        roll: M.evalSplineScalar(keys, 'roll', t, 0),
      };
    }

    // Shot 5: Multi-Tier Power Core Atrium (32.8 .. 38.6s) — Grand cathedral orbit inside wide 184-voxel void (r = 74..78, rings max r = 51, galleries min r = 90!)
    if (t < 38.6) {
      const keys = [
        { t: 32.8, pos: [ -62, -68,   42], tgt: [  0, -10,    0], fov: 60, roll: -0.04 },
        { t: 34.6, pos: [ -54, -22,   56], tgt: [  0,   4,    0], fov: 60, roll: -0.03 },
        { t: 36.4, pos: [  18,  24,   74], tgt: [  0,   0,    0], fov: 62, roll:  0.03 }, // Full cathedral panorama: core column, all 5 sleek rings, pylons & 6 gallery tiers!
        { t: 38.0, pos: [  62,  66,   38], tgt: [  0,   6,   -8], fov: 60, roll:  0.03 }, // Elevated gallery-free cathedral vista gazing down into core!
        { t: 38.6, pos: [  70,  76,   16], tgt: [ 26,  48,  -28], fov: 56, roll:  0.00 },
      ];
      return {
        mode: 'core',
        pos: M.evalSplineVec3(keys, 'pos', t),
        target: M.evalSplineVec3(keys, 'tgt', t),
        fov: M.evalSplineScalar(keys, 'fov', t, 58),
        roll: M.evalSplineScalar(keys, 'roll', t, 0),
      };
    }

    // Shot 6: Energy Loading & Conduit Corridor (38.6 .. 44.0s) — Clean central channel weave (x in [-6,+6], zero arch graze!)
    if (t < 44.0) {
      const keys = [
        { t: 38.6, pos: [  -8,  -6, -158], tgt: [  0,   0,  185], fov: 56, roll: -0.03 },
        { t: 40.4, pos: [   6,   3,  -68], tgt: [  0,   1,  190], fov: 56, roll:  0.03 },
        { t: 42.2, pos: [  -4,   4,   24], tgt: [  0,   0,  195], fov: 58, roll: -0.02 },
        { t: 43.4, pos: [   0,   2,   96], tgt: [  0,   0,  205], fov: 59, roll:  0.00 },
        { t: 44.0, pos: [   0,   1,  126], tgt: [  0,   0,  210], fov: 60, roll:  0.00 },
      ];
      return {
        mode: 'corridor',
        pos: M.evalSplineVec3(keys, 'pos', t),
        target: M.evalSplineVec3(keys, 'tgt', t),
        fov: M.evalSplineScalar(keys, 'fov', t, 56),
        roll: M.evalSplineScalar(keys, 'roll', t, 0),
      };
    }

    // --- ACT III: 4-WEAPON FLEET BARRAGE & VOXEL SHATTERING (44.0 .. 64.0s) ---
    // Shot 7: Flagship Spinal Main Beam & Pulse Turret Opening Salvo (44.0 .. 51.2s)
    if (t < 51.2) {
      const keys = [
        { t: 44.0, pos: [-158, 122,  165], tgt: [ 14,  18,  910], fov: 50, roll: -0.03 }, // Full Split-Prow & ALL 10 sequentially charging cannon coils + focusing rings!
        { t: 46.2, pos: [-220, 122,  365], tgt: [ 22,  18,  990], fov: 49, roll: -0.02 }, // Sustained Beam erupts from muzzle -> Hero Asteroid A1!
        { t: 48.2, pos: [-285, 196,  275], tgt: [-20,  36, 1020], fov: 50, roll:  0.02 }, // Elevated vista over Flagship Pulse Turrets firing into A1 & B1!
        { t: 49.8, pos: [-335, 188,  370], tgt: [-85,  42, 1070], fov: 49, roll:  0.03 }, // Grouped amber-cyan Pulse bolts streaking into B1 & B2!
        { t: 51.2, pos: [-515,  62,  350], tgt: [-375, -18, 840], fov: 48, roll:  0.01 },
      ];
      return {
        mode: 'exterior',
        pos: M.evalSplineVec3(keys, 'pos', t),
        target: M.evalSplineVec3(keys, 'tgt', t),
        fov: M.evalSplineScalar(keys, 'fov', t, 49),
        roll: M.evalSplineScalar(keys, 'roll', t, 0),
      };
    }

    // Shot 8: Close-Escort CIWS Rapid-Fire & Vanguard Missile Salvo (51.2 .. 58.2s)
    if (t < 58.2) {
      if (t < 54.6) {
        // 51.2 .. 54.6s: Hero Close-Escort CE #0 (at [-400,-38,465]) framed full-silhouette firing quad CIWS streams at C1/C2!
        const keys = [
          { t: 51.2, pos: [-575,  48,  325], tgt: [-375, -24,  760], fov: 48, roll: -0.03 },
          { t: 52.8, pos: [-555,  34,  415], tgt: [-355, -28,  875], fov: 47, roll: -0.02 },
          { t: 54.6, pos: [-470,  42,  540], tgt: [-325, -26,  910], fov: 48, roll:  0.02 },
        ];
        return {
          mode: 'exterior',
          pos: M.evalSplineVec3(keys, 'pos', t),
          target: M.evalSplineVec3(keys, 'tgt', t),
          fov: M.evalSplineScalar(keys, 'fov', t, 48),
          roll: M.evalSplineScalar(keys, 'roll', t, 0),
        };
      } else {
        // 54.6 .. 58.2s: Wide heroic framing of BOTH Vanguard Escorts VG #1 & VG #2 launching 24 curving voxel missiles toward A2!
        const keys = [
          { t: 54.6, pos: [ 645, 172,  485], tgt: [ 415,  32,  760], fov: 49, roll:  0.03 }, // Full silhouette of VG #1 & VG #2 pods rippling missiles!
          { t: 56.2, pos: [ 685, 126,  730], tgt: [ 335,   4, 1140], fov: 50, roll:  0.04 }, // Sweeping alongside curving missile arcs toward A2!
          { t: 58.2, pos: [ 585,  -8, 1065], tgt: [ 205, -22, 1365], fov: 48, roll:  0.02 }, // Completely clear of B2 fragments; dramatic low-angle missile dive into A2!
        ];
        return {
          mode: 'exterior',
          pos: M.evalSplineVec3(keys, 'pos', t),
          target: M.evalSplineVec3(keys, 'tgt', t),
          fov: M.evalSplineScalar(keys, 'fov', t, 48),
          roll: M.evalSplineScalar(keys, 'roll', t, 0),
        };
      }
    }

    // Shot 9: Missile Impact Climax on Hero Asteroid A2 & Fleet Panorama Pullback (58.2 .. 64.0s)
    if (t < 64.0) {
      const keys = [
        { t: 58.2, pos: [ 585,  -8, 1065], tgt: [ 205, -22, 1365], fov: 48, roll:  0.02 },
        { t: 59.8, pos: [ 495,  48, 1145], tgt: [ 205, -24, 1405], fov: 48, roll: -0.02 }, // Crisp non-whiteout delayed core rupture of A2!
        { t: 61.8, pos: [ 315, 165, 1220], tgt: [  75,   8,  680], fov: 48, roll: -0.04 }, // Pull wide across tumbling slabs & unraveling trails!
        { t: 64.0, pos: [-260, 235, 1225], tgt: [   0,  10,   90], fov: 48, roll: -0.02 }, // Grand authoritative overview of entire 39-ship armada!
      ];
      return {
        mode: 'exterior',
        pos: M.evalSplineVec3(keys, 'pos', t),
        target: M.evalSplineVec3(keys, 'tgt', t),
        fov: M.evalSplineScalar(keys, 'fov', t, 48),
        roll: M.evalSplineScalar(keys, 'roll', t, 0),
      };
    }

    // --- ACT IV: SEQUENTIAL FLEET SHIELDS, THRUSTER OVERDRIVE & SEAMLESS LOOP RETURN (64.0 .. 78.0s) ---
    // Ends at EXACT t=0.0s state: pos=[-645, 132, 1145], tgt=[15, 8, 95], fov=46, roll=-0.02!
    const keys = [
      { t: 64.0, pos: [-260, 235, 1225], tgt: [  0,  10,   90], fov: 48, roll: -0.02 },
      { t: 67.4, pos: [ 520, 280, 1060], tgt: [  0,  10,   60], fov: 49, roll:  0.03 }, // Wide high panorama of all 39 shields cascading!
      { t: 70.6, pos: [ 685, 210,  580], tgt: [  0,  10,   40], fov: 50, roll:  0.04 },
      { t: 73.6, pos: [ 265, 195, 1265], tgt: [  0,  12,   75], fov: 50, roll:  0.01 }, // Thruster ignition flare & fleet-wide acceleration!
      { t: 76.0, pos: [-365, 158, 1280], tgt: [ 10,  10,   88], fov: 48, roll: -0.01 },
      { t: 78.0, pos: [-645, 132, 1145], tgt: [ 15,   8,   95], fov: 46, roll: -0.02 }, // EXACT match to t = 0.0s!
    ];
    return {
      mode: 'exterior',
      pos: M.evalSplineVec3(keys, 'pos', t),
      target: M.evalSplineVec3(keys, 'tgt', t),
      fov: M.evalSplineScalar(keys, 'fov', t, 48),
      roll: M.evalSplineScalar(keys, 'roll', t, 0),
    };
  }

  // =========================================================================
  // 6. MASTER DETERMINISTIC STATE EVALUATOR: evaluate(globalTime)
  // =========================================================================
  function evaluate(rawTime) {
    // Wrap cleanly into [0, TOTAL_DURATION)
    const t = ((rawTime % TOTAL_DURATION) + TOTAL_DURATION) % TOTAL_DURATION;
    const tau = (t / TOTAL_DURATION) * Math.PI * 2;
    const cam = evaluateCamera(t);

    // --- GLOBAL ENVELOPES (100% Seamless across 78.0s <-> 0.0s!) ---
    // Pre-fire fleet formation spread: 0 -> 1 (38..45s), holds during combat, reforms 1 -> 0 (62..71s)
    const spread = M.smoothstep(38.0, 45.0, t) * (1.0 - M.smoothstep(61.5, 70.5, t));

    // Thruster overdrive surge: inner core ignites & elongates FIRST (t=70.4s), outer plasma sheath follows 0.65s later!
    // Seamlessly carries 0.45 -> 0.0 from 78.0s -> 0.0..4.5s!
    let thrusterInnerBoost = 0.0;
    let thrusterOuterBoost = 0.0;
    if (t >= 70.4) {
      const upIn = M.smoothstep(70.4, 73.6, t);
      const upOut = M.smoothstep(71.05, 74.6, t);
      const settle = 1.0 - M.smoothstep(75.5, 78.0, t) * 0.55;
      thrusterInnerBoost = upIn * settle;
      thrusterOuterBoost = upOut * settle;
    } else if (t < 4.5) {
      const carry = 0.45 * (1.0 - M.smoothstep(0.0, 4.5, t));
      thrusterInnerBoost = carry;
      thrusterOuterBoost = carry;
    }
    const thrusterBoost = thrusterOuterBoost;

    // Fleet acceleration forward speed factor (drives streaking space dust & exhaust sparks!)
    const cruiseSpeed = 1.0 + thrusterBoost * 3.8;

    // Flagship Shield activation & loop-wrap residual fade:
    // Deploys starting t=64.5s, peaks through 78.0s (alpha 0.68 at 78.0s),
    // and smoothly thins out 0.68 -> 0.0 during t=0.0..4.2s!
    const evalShield = (delay) => {
      const tStart = 64.5 + delay;
      if (t >= tStart) {
        const dep = M.clamp((t - tStart) / 2.2, 0, 1);
        const alpha = M.smoothstep(tStart, tStart + 0.45, t) * M.lerp(0.95, 0.44, M.smoothstep(74.2, 78.0, t));
        return { deploy: dep, alpha, expand: M.lerp(0.78, 1.0, M.easeOutCubic(dep)) };
      } else if (t < 3.6) {
        // Seamless carry-over from previous cycle's acceleration!
        const alpha = 0.44 * (1.0 - M.smoothstep(0.0, 3.6, t));
        return { deploy: 1.0, alpha, expand: 1.0 };
      }
      return { deploy: 0, alpha: 0, expand: 1.0 };
    };

    const flagshipShield = evalShield(0.0);

    // Flagship subtle solemn pitch/heave (strictly periodic over TOTAL_DURATION!)
    const flagshipPos = [
      Math.sin(tau) * 3.5,
      Math.sin(tau * 2) * 2.5,
      0,
    ];
    const flagshipRot = [
      Math.sin(tau * 2) * 0.004,
      Math.sin(tau) * 0.005,
      Math.cos(tau) * 0.006,
    ];

    // Evaluate all 38 Escort Warships
    const escortStates = ESCORTS.map((e) => {
      const driftX = Math.sin(tau * e.freq + e.phase) * 14.0;
      const driftY = Math.cos(tau * e.freq + e.phase * 1.3) * 10.0;
      const driftZ = Math.sin(tau * e.freq + e.phase * 0.7) * 12.0;
      // Subtle forward surge stagger during acceleration (near/fast vanguards surge slightly forward!)
      const surgeZ = thrusterBoost * (e.type === 'vanguard' ? 42 : 24) * Math.sin(M.clamp((t - 70.6) / 7.4, 0, 1) * Math.PI);
      const pos = [
        e.basePos[0] + e.spreadOffset[0] * spread + driftX,
        e.basePos[1] + e.spreadOffset[1] * spread + driftY,
        e.basePos[2] + e.spreadOffset[2] * spread + driftZ + surgeZ,
      ];
      const yaw = Math.cos(tau * e.freq + e.phase) * 0.025 + (e.spreadOffset[0] > 0 ? 1 : -1) * Math.sin(spread * Math.PI) * 0.045;
      const roll = -yaw * 1.6 + Math.sin(tau * e.freq + e.phase) * 0.03;
      const pitch = Math.sin(tau * e.freq + e.phase) * 0.018;
      return {
        def: e,
        pos,
        rot: [pitch, yaw, roll],
        shield: evalShield(e.shieldDelay),
      };
    });

    // --- ASTEROID WORLD POSITIONS & FRACTURE STATE ---
    const zShift = getClusterZShift(t);
    const nextZShift = getNextClusterZShift(t);
    const asteroidWorldPos = (idx) => {
      const a = ASTEROIDS[idx];
      // During Act IV acceleration (t > 62.5s), sweep ambient rocks & fragments cleanly OUTSIDE the full 39-ship armada shields!
      let clearX = 0, clearY = 0;
      if (t > 62.5) {
        const u = M.smoothstep(62.5, 67.2, t);
        const sideX = a.combatPos[0] >= 0 ? 1 : -1;
        const sideY = a.combatPos[1] >= 0 ? 1 : -1;
        clearX = sideX * 680 * u;
        clearY = sideY * 320 * u;
      }
      return [a.combatPos[0] + clearX, a.combatPos[1] + clearY, a.combatPos[2] + zShift];
    };

    const asteroidStates = ASTEROIDS.map((a, idx) => {
      const pos = asteroidWorldPos(idx);
      // Base gentle asteroid tumble
      const rot = [
        a.initRot[0] + t * a.rotSpeed[0],
        a.initRot[1] + t * a.rotSpeed[1],
        a.initRot[2] + t * a.rotSpeed[2],
      ];
      // Molten fracture seam heat: heats up between hitStart -> shatterTime, peaks at shatter, cools smoothly to embers!
      let heat = 0;
      if (t >= a.hitStart) {
        if (t < a.shatterTime) {
          heat = M.smoothstep(a.hitStart, a.shatterTime, t) * 0.92;
        } else {
          const post = t - a.shatterTime;
          heat = 1.15 * Math.exp(-post * 0.22);
        }
      }
      // Separation progress after shatter
      const splitTime = Math.max(0, t - a.shatterTime);
      // Slight pre-shatter tremor/cracking expansion just before full cleavage!
      const preCrack = (t >= a.hitStart && t < a.shatterTime)
        ? Math.pow(M.smoothstep(a.hitStart, a.shatterTime, t), 2.5) * 4.5
        : 0;

      return {
        def: a,
        idx,
        pos,
        rot,
        heat,
        splitTime,
        preCrack,
      };
    });

    // Next-cycle pristine approaching asteroids (for seamless loop wrap at t=70..78s!)
    const nextAsteroids = [];
    if (nextZShift < 50000) {
      for (let i = 0; i < 6; i++) {
        const a = ASTEROIDS[i];
        nextAsteroids.push({
          def: a,
          pos: [a.combatPos[0], a.combatPos[1], a.combatPos[2] + nextZShift],
          rot: [a.initRot[0], a.initRot[1], a.initRot[2]],
        });
      }
    }

    // --- FLAGSHIP SPINAL BEAM MAIN CANNON STATE (t = 44.0 .. 50.8s) ---
    let chargeProgress = 0.0;
    let muzzleChargeGlow = 0.0;
    let beamActive = false;
    let beamStrength = 0.0;
    let beamRadius = 1.0;
    const beamOrigin = [flagshipPos[0], flagshipPos[1] + 6, flagshipPos[2] + 493];
    const beamTarget = asteroidWorldPos(0);
    let beamStart = beamOrigin;
    const beamSparks = [];

    if (t >= 43.8 && t < 51.2) {
      if (t < 45.6) {
        chargeProgress = M.smoothstep(44.0, 45.55, t);
        muzzleChargeGlow = Math.pow(M.smoothstep(44.5, 45.6, t), 1.5);
      } else if (t < 49.35) {
        chargeProgress = 1.0;
        muzzleChargeGlow = 1.0 + 0.15 * Math.sin(t * 28.0);
        beamActive = true;
        beamStrength = M.smoothstep(45.6, 45.82, t);
        beamRadius = 1.0 + 0.14 * Math.sin(t * 32.0) + 0.08 * Math.sin(t * 53.0);
      } else if (t < 50.25) {
        // Taper thin AND sever cleanly away from cannon muzzle as tail zips forward into target!
        const cutU = M.smoothstep(49.35, 50.20, t);
        const fade = 1.0 - cutU;
        chargeProgress = Math.max(0, 1.0 - cutU * 1.6) * 0.55;
        muzzleChargeGlow = Math.max(0, 1.0 - cutU * 2.2) * 0.65;
        beamActive = fade > 0.03;
        beamStrength = fade;
        beamRadius = Math.max(0.14, Math.pow(fade, 0.85));
        beamStart = M.v3Lerp(beamOrigin, beamTarget, Math.pow(cutU, 1.2) * 0.90);
      }
      // Lingering cyan beam afterglow sparks drifting forward & scattering outward after cutoff (t=49.3..51.2s)!
      if (t >= 49.3 && t < 51.2) {
        const age = t - 49.3;
        const bDir = M.v3Norm(M.v3Sub(beamTarget, beamOrigin));
        for (let k = 0; k < 28; k++) {
          const baseFrac = (k + 0.5) / 28;
          const forwardFrac = Math.min(1.18, baseFrac + age * 0.28);
          const pt = M.v3Lerp(beamOrigin, beamTarget, forwardFrac);
          const spreadR = (10 + (k % 5) * 8) * (0.4 + age * 1.4);
          const ang = k * 2.3999 + age * 1.2;
          beamSparks.push({
            pos: [pt[0] + Math.cos(ang) * spreadR, pt[1] + Math.sin(ang) * spreadR, pt[2]],
            size: (2.2 + (k % 3) * 1.3) * Math.max(0.2, 1.0 - age / 1.9),
            intensity: Math.max(0, 1.0 - age / 1.9) * 2.1,
          });
        }
      }
    }

    // --- ACTIVE PULSE BOLTS, TURRET AIM & MUZZLE FLASHES ---
    const activePulseBolts = [];
    const pulseFlashes = [];
    const turretAngles = PULSE_TURRETS.map((tur, ti) => {
      // Aim toward assigned medium asteroid during combat!
      const tgt = asteroidWorldPos(tur.side < 0 ? 2 : 3);
      const hoverBob = tur.hover ? Math.sin(tau * 3 + ti) * 4.5 : 0;
      const worldP = [flagshipPos[0] + tur.p[0], flagshipPos[1] + tur.p[1] + hoverBob, flagshipPos[2] + tur.p[2]];
      const d = M.v3Sub(tgt, worldP);
      const yaw = Math.atan2(d[0], d[2]) * M.smoothstep(43.5, 46.5, t) * (1 - M.smoothstep(56.0, 62.0, t));
      return { pos: worldP, yaw, hover: tur.hover, flash: 0 };
    });

    for (const s of COMBAT.pulseShots) {
      if (t >= s.tFire - 0.14 && t <= s.tHit + 0.65) {
        const turPos = turretAngles[s.turretIdx].pos;
        const startPos = [turPos[0] + Math.sin(turretAngles[s.turretIdx].yaw) * 34, turPos[1] + 7, turPos[2] + Math.cos(turretAngles[s.turretIdx].yaw) * 34];
        const endPos = M.v3Add(asteroidWorldPos(s.targetIdx), s.aimOff);

        // Brief pre-fire muzzle charge gather (0.14s before firing) + crisp firing flash!
        if (t < s.tFire) {
          const c = M.clamp((t - (s.tFire - 0.14)) / 0.14, 0, 1);
          turretAngles[s.turretIdx].flash = Math.max(turretAngles[s.turretIdx].flash, c * 0.7);
          pulseFlashes.push({ pos: startPos, scale: 8 + c * 14, intensity: c * 1.8, kind: 'muzzle_pulse' });
          continue;
        }
        if (t - s.tFire < 0.24) {
          const f = 1.0 - (t - s.tFire) / 0.24;
          turretAngles[s.turretIdx].flash = Math.max(turretAngles[s.turretIdx].flash, f);
          pulseFlashes.push({ pos: startPos, scale: 14 + f * 22, intensity: f * 2.8, kind: 'muzzle_pulse' });
        }

        // Bolt in flight!
        if (t <= s.tHit) {
          const u = (t - s.tFire) / Math.max(0.01, s.tHit - s.tFire);
          const pos = M.v3Lerp(startPos, endPos, u);
          const dir = M.v3Norm(M.v3Sub(endPos, startPos));
          activePulseBolts.push({ pos, dir, len: 94, rad: 5.8 });
        } else {
          // Impact spark burst on rock face!
          const age = t - s.tHit;
          const fade = Math.max(0, 1.0 - age / 0.65);
          pulseFlashes.push({ pos: endPos, scale: 26 + age * 85, intensity: fade * 3.4, kind: 'impact_pulse' });
        }
      }
    }

    // --- ACTIVE CLOSE-ESCORT CIWS TRACER STREAMS ---
    const activeTracers = [];
    const ciwsFlashes = [];
    for (const s of COMBAT.ciwsShots) {
      if (t >= s.tFire && t <= s.tHit + 0.42) {
        const es = escortStates[s.escortIdx];
        const mount = es.def.ciwsMounts[s.mountIdx];
        const startPos = [es.pos[0] + mount[0], es.pos[1] + mount[1], es.pos[2] + mount[2] + 18];
        const endPos = M.v3Add(asteroidWorldPos(s.targetIdx), s.aimOff);

        if (t - s.tFire < 0.11) {
          const f = 1.0 - (t - s.tFire) / 0.11;
          ciwsFlashes.push({ pos: startPos, scale: 9 + f * 12, intensity: f * 2.8, kind: 'muzzle_ciws' });
        }
        if (t <= s.tHit) {
          const u = (t - s.tFire) / Math.max(0.01, s.tHit - s.tFire);
          const pos = M.v3Lerp(startPos, endPos, u);
          const dir = M.v3Norm(M.v3Sub(endPos, startPos));
          activeTracers.push({ pos, dir, len: 52, rad: 2.25 });
        } else {
          const age = t - s.tHit;
          const fade = Math.max(0, 1.0 - age / 0.42);
          ciwsFlashes.push({ pos: endPos, scale: 16 + age * 46, intensity: fade * 2.6, kind: 'impact_ciws' });
        }
      }
    }

    // --- ACTIVE VANGUARD CURVED VOXEL MISSILES & LINGERING TRAILS ---
    const activeMissiles = [];
    const missileTrails = [];
    const missileFlashes = [];

    // Helper: deterministic point along missile path at arbitrary time `tm`!
    const evalMissilePoint = (ms, tm) => {
      const es = escortStates[ms.escortIdx];
      const launchPos = M.v3Add(es.pos, ms.localLaunch);
      const ejectEnd = [launchPos[0] + (ms.localLaunch[0] > 0 ? 18 : -18), launchPos[1] + 24, launchPos[2] + 22];
      if (tm <= ms.tIgnite) {
        const u = M.clamp((tm - ms.tLaunch) / Math.max(0.01, ms.tIgnite - ms.tLaunch), 0, 1);
        return M.v3Lerp(launchPos, ejectEnd, M.easeOutCubic(u));
      }
      const targetPos = M.v3Add(asteroidWorldPos(ms.targetIdx), ms.aimOff);
      const p0 = ejectEnd;
      const p1 = [p0[0] + ms.arcOut[0], p0[1] + ms.arcOut[1], p0[2] + ms.arcOut[2]];
      const p2 = [
        M.lerp(p1[0], targetPos[0], 0.55) + ms.arcOut[0] * 0.25,
        M.lerp(p1[1], targetPos[1], 0.55) + ms.arcOut[1] * 0.22,
        M.lerp(p1[2], targetPos[2], 0.65),
      ];
      const p3 = targetPos;
      // Accelerating time curve (starts brisk after ignition, surges fast toward target!)
      const rawU = M.clamp((tm - ms.tIgnite) / Math.max(0.01, ms.tHit - ms.tIgnite), 0, 1);
      const u = Math.pow(rawU, 1.32);
      const iu = 1 - u;
      return [
        iu * iu * iu * p0[0] + 3 * iu * iu * u * p1[0] + 3 * iu * u * u * p2[0] + u * u * u * p3[0],
        iu * iu * iu * p0[1] + 3 * iu * iu * u * p1[1] + 3 * iu * u * u * p2[1] + u * u * u * p3[1],
        iu * iu * iu * p0[2] + 3 * iu * iu * u * p1[2] + 3 * iu * u * u * p2[2] + u * u * u * p3[2],
      ];
    };

    for (const ms of COMBAT.missiles) {
      if (t >= ms.tLaunch && t <= ms.tHit + 3.2) {
        // Ignition flare right when booster fires!
        if (t >= ms.tIgnite && t < ms.tIgnite + 0.35) {
          const f = 1.0 - (t - ms.tIgnite) / 0.35;
          missileFlashes.push({ pos: evalMissilePoint(ms, ms.tIgnite), scale: 16 + f * 20, intensity: f * 3.0, kind: 'ignite_missile' });
        }

        // Solid 18-voxel missile entity while in flight!
        if (t < ms.tHit) {
          const pNow = evalMissilePoint(ms, t);
          const pNext = evalMissilePoint(ms, Math.min(ms.tHit, t + 0.04));
          const dir = M.v3Norm(M.v3Sub(pNext, pNow));
          activeMissiles.push({
            pos: pNow,
            dir,
            ignited: t >= ms.tIgnite,
          });
        } else {
          // Fiery localized missile impact burst (keeps voxel chunks crystal-clear, zero whiteout!)
          const age = t - ms.tHit;
          if (age < 1.15) {
            const fade = Math.pow(1.0 - age / 1.15, 1.65);
            missileFlashes.push({
              pos: evalMissilePoint(ms, ms.tHit),
              scale: 18 + age * 52,
              intensity: fade * 1.45,
              kind: 'impact_missile',
            });
          }
        }

        // Curved lingering volumetric smoke & ember ribbon (persists 3.2s after impact then unravels!)
        if (t > ms.tIgnite + 0.04) {
          const headT = Math.min(t, ms.tHit);
          const tailAge = 2.6;
          const tailT = Math.max(ms.tIgnite, t - tailAge);
          if (headT > tailT + 0.02) {
            const segs = 22;
            const pts = [];
            for (let k = 0; k <= segs; k++) {
              const frac = k / segs; // 0 = head, 1 = tail
              const tk = M.lerp(headT, tailT, frac);
              const pt = evalMissilePoint(ms, tk);
              // Gentle post-impact smoke drift & dispersion
              const agePt = Math.max(0, t - tk);
              const drift = agePt * 6.5;
              pts.push([
                pt[0] + Math.sin(ms.id * 3.1 + frac * 9.0) * drift,
                pt[1] + Math.cos(ms.id * 2.3 + frac * 7.0) * drift,
                pt[2] - agePt * 14.0,
              ]);
            }
            const postFade = t > ms.tHit ? Math.max(0, 1.0 - (t - ms.tHit) / 3.2) : 1.0;
            missileTrails.push({ pts, alpha: postFade * 0.88, width: 6.2 + (1 - postFade) * 9.0 });
          }
        }
      }
    }

    // Delayed Core Rupture Shockwave bursts when Hero Asteroids A1 (47.6s) & A2 (59.8s) split apart!
    const shockRings = [];
    for (const aIdx of [0, 1, 2, 3]) {
      const a = ASTEROIDS[aIdx];
      const dtS = t - a.shatterTime;
      if (dtS >= 0 && dtS < 1.35) {
        const u = dtS / 1.35;
        const pos = asteroidWorldPos(aIdx);
        shockRings.push({
          pos,
          scale: (aIdx <= 1 ? 36 : 20) + M.easeOutCubic(u) * (aIdx <= 1 ? 165 : 95),
          intensity: Math.pow(1.0 - u, 1.4) * (aIdx <= 1 ? 1.85 : 1.35),
          colorA: aIdx === 0 ? [0.55, 0.94, 1.0] : [1.0, 0.72, 0.30],
          colorB: aIdx === 0 ? [0.06, 0.56, 1.0] : [1.0, 0.24, 0.04],
        });
      }
    }

    // Beam launch focusing shock-rings pulsing forward along barrel muzzle during beam fire!
    if (beamActive) {
      for (let r = 0; r < 4; r++) {
        const phase = ((t * 2.4 + r * 0.25) % 1.0);
        const dir = M.v3Norm(M.v3Sub(beamTarget, beamOrigin));
        const pos = M.v3Add(beamOrigin, M.v3Scale(dir, phase * 180));
        shockRings.push({
          pos,
          dir,
          scale: 24 + phase * 42,
          intensity: (1.0 - phase) * beamStrength * 2.4,
          colorA: [0.80, 0.98, 1.0],
          colorB: [0.10, 0.72, 1.0],
        });
      }
    }

    // Billowing Asteroid Impact Dust Clouds (expand & cool gracefully from bright amber/cyan glow into cosmic dark!)
    const dustPuffs = [];
    for (let aIdx = 0; aIdx < 8; aIdx++) {
      const a = ASTEROIDS[aIdx];
      const dtS = t - a.shatterTime;
      if (dtS >= -0.1 && dtS < 6.5) {
        const age = Math.max(0, dtS + 0.1);
        const pos = asteroidWorldPos(aIdx);
        const numPuffs = aIdx <= 1 ? 6 : 3;
        const baseRad = aIdx <= 1 ? 75 : (aIdx <= 3 ? 42 : 24);
        const fade = M.smoothstep(0, 0.35, age) * Math.pow(Math.max(0, 1.0 - age / 6.5), 1.35);
        const glow = Math.exp(-age * 0.9);
        for (let k = 0; k < numPuffs; k++) {
          const ang = k * 2.1 + aIdx * 1.7;
          const elev = ((k % 3) - 1) * 0.5;
          const drift = age * (14 + (k % 3) * 8);
          dustPuffs.push({
            pos: [
              pos[0] + Math.cos(ang) * drift,
              pos[1] + elev * drift,
              pos[2] + Math.sin(ang) * drift,
            ],
            scale: baseRad + age * (aIdx <= 1 ? 26 : 14),
            alpha: fade * (aIdx <= 1 ? 0.44 : 0.34),
            colorA: aIdx === 0
              ? [M.lerp(0.28, 0.65, glow), M.lerp(0.36, 0.88, glow), M.lerp(0.46, 1.0, glow)]
              : [M.lerp(0.34, 1.15, glow), M.lerp(0.30, 0.62, glow), M.lerp(0.28, 0.24, glow)],
            colorB: [0.14, 0.16, 0.22],
          });
        }
      }
    }

    return {
      t,
      tau,
      cam,
      spread,
      thrusterBoost,
      thrusterInnerBoost,
      thrusterOuterBoost,
      cruiseSpeed,
      flagshipPos,
      flagshipRot,
      flagshipShield,
      escortStates,
      turretAngles,
      asteroidStates,
      nextAsteroids,
      debrisParticles: COMBAT.debrisParticles,
      beam: {
        active: beamActive,
        origin: beamOrigin,
        start: beamStart,
        target: beamTarget,
        chargeProgress,
        muzzleChargeGlow,
        strength: beamStrength,
        radius: beamRadius,
        sparks: beamSparks,
      },
      activePulseBolts,
      pulseFlashes,
      activeTracers,
      ciwsFlashes,
      activeMissiles,
      missileTrails,
      missileFlashes,
      shockRings,
      dustPuffs,
      exteriorShuttles: cam.mode === 'exterior' ? evalExteriorShuttles(t) : [],
      hangarActors: cam.mode === 'hangar' ? evalHangarActors(t) : null,
      // Power Core breathing pulse (rhythmic luminous wave!)
      corePulse: 0.72 + 0.38 * Math.sin(t * 2.4) + 0.14 * Math.sin(t * 5.2),
    };
  }

  App.Scene = {
    TOTAL_DURATION,
    RUNS,
    ESCORTS,
    FLAGSHIP_ENGINES,
    PULSE_TURRETS,
    ASTEROIDS,
    evaluate,
  };
})(window.App);
