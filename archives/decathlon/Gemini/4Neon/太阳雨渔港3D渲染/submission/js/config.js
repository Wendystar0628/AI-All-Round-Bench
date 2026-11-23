// Shared configuration, palette, deterministic PRNG, spatial layout & weather evaluators
(function () {
  const BASE_SIZE = 34;
  const HALF = BASE_SIZE / 2; // 17
  const DECK_Y = 1.35;
  const WATER_Y = 0.0;
  const PLINTH_BOTTOM_Y = -4.2;
  const PLINTH_TOP_Y = -3.92;

  // Deterministic PRNG (Mulberry32)
  function createRNG(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6d2b79f5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Smoothstep & clamp utilities
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Anime Sunlit-Rain Color Palette (High-Key Sea-Glass & Pale Concrete + Deep Teal Shadows + Warm Gold Accents)
  const PALETTE = {
    skyZenith: 0xbce6ee,
    skyMid: 0xdff5f7,
    skyHorizon: 0xf4faf8,
    sunGlow: 0xfff5d4,
    sunLight: 0xfff3d1,
    hemiSky: 0xd8f3f8,
    hemiGround: 0x699aa8,
    deepTealShadow: 0x2a5c70,
    concreteTop: 0xdce4e5,
    concreteWet: 0xc2d1d5,
    concreteWall: 0xc8d2d3,
    concreteDark: 0x7e9499,
    plinthDark: 0x324754,
    waterShallow: 0x7cd8d3,
    waterMid: 0x4eb3bc,
    waterDeep: 0x266f85,
    waterCutawayTop: 0x8de6e2,
    waterCutawayBot: 0x2a7b8c,
    boatWhite: 0xf4f8f9,
    boatTrimBlue: 0x3b86a8,
    boatTrimTeal: 0x2e7d82,
    boatRust: 0xa85f42,
    hazardYellow: 0xf4c73b,
    hazardBlack: 0x252d33,
    bollardBlack: 0x283138,
    ropeOrange: 0xd8693c,
    ropeWet: 0x7f3a24,
    lifeRingOrange: 0xef6a37,
    lighthouseRed: 0xd9483b,
    lighthouseWhite: 0xf6f9f9,
    warehouseWall: 0xd4dde0,
    warehouseRoof: 0x7b98a6,
    waitingWood: 0x9bbec4,
    waitingRoof: 0x5c7f91,
    foliageLight: 0x7ec278,
    foliageMid: 0x539d66,
    foliageDark: 0x2e6f57,
    woodWarm: 0xb88c62,
    woodDark: 0x6d503a,
    crateBlue: 0x4891c2,
    crateWhite: 0xeef3f4,
    rainGold: 0xfff3c8,
    inkOutline: 0x224656
  };

  // Primary sun direction (front-right high key light: illuminates +X/+Z facades, casts crisp deep-teal shadows toward -X/-Z, shines through warehouse & boat windows, places faint rainbow opposite in -X/-Z background)
  const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize();

  // Seabed elevation function across the water region
  function getSeabedY(x, z) {
    // Shallower near quay walls (-5.5, +7.5, breakwater), deeper toward +X/+Z outer corner
    const distFromQuayX = Math.max(0, x + 5.5);
    const distFromSouth = z > 7.5 ? Math.max(0, x - 2.0) : distFromQuayX;
    const radial = clamp((distFromSouth * 0.055) + (Math.max(0, -z - 8.2) * 0.03), 0, 1);
    const baseDepth = lerp(-2.05, -3.35, smoothstep(0, 1, radial));
    const ripple =
      Math.sin(x * 0.55 + z * 0.35) * 0.14 +
      Math.cos(x * 0.28 - z * 0.62) * 0.12 +
      Math.sin((x + z) * 0.9) * 0.05;
    return clamp(baseDepth + ripple, -3.65, -1.65);
  }

  // Test whether (x, z) lies inside solid concrete land / breakwater / hillside
  function isLandPoint(x, z, margin) {
    const m = margin || 0;
    // West main wharf & hillside
    if (x <= -5.5 + m) return true;
    // Foreground broad concrete quay arm
    if (x <= 2.0 + m && z >= 7.5 - m) return true;
    // Boarding platform
    if (x <= 3.4 + m && z >= 9.2 - m && z <= 13.2 + m) return true;
    // Short breakwater
    if (x <= 5.4 + m && z >= -8.2 - m && z <= -5.6 + m) return true;
    return false;
  }

  // Hillside terrain elevation for x in [-17, -5.8], z in [-17, -6.4]
  function getHillsideY(x, z) {
    const nx = clamp((-5.8 - x) / 11.2, 0, 1);
    const nz = clamp((-6.4 - z) / 10.6, 0, 1);
    const base = 2.65 + 4.8 * Math.pow(nx * 0.55 + nz * 0.62, 1.18);
    const dome = 1.65 * Math.sin(nx * Math.PI * 0.85) * Math.sin(nz * Math.PI * 0.85);
    const detail = Math.sin(x * 0.45) * Math.cos(z * 0.42) * 0.28;
    return clamp(base + dome + detail, 2.5, 8.6);
  }

  // =========================================================================
  // Deterministic Event Schedule & Environmental Evaluators
  // Ensures at most ONE salient event occurs at a time, smooth & restrained!
  // Also aligned naturally with the 60s tour choreography:
  //   0..11s : Bright sunlit rain + gentle faint rainbow at start (rain slightly lighter)
  //  12..25s : Calm steady sunshower (good for seagull flush, still life, cat closeup)
  //  26..31s : Distinct sea gust wave sweeping inward across bay -> flags -> net -> trees
  //  32..46s : Steady sunlit rain, bright god rays into warehouse & cabins
  //  47..52.5s: Broad thin cloud shadow sweeps across base, triggers rare daytime lighthouse blink!
  //  53..60s : Sun breaks back out brightly, Boat 4 departs around breakwater leaving crisp wake!
  // Outside 0..60s (interactive play): cycles smoothly with staggered natural intervals!
  // =========================================================================

  // Sea gust direction: from outer sea (+X, +Z) inward toward quay & hillside (-X, -Z)
  const GUST_DIR = new THREE.Vector2(-0.78, -0.625).normalize();

  function evaluateGust(t) {
    // Periodic cycle of 36s, first peak centered at t = 28.2s (perfect for tour shot 6!)
    // Also occurs at t = 64.2s, 100.2s...
    const period = 36.0;
    const phase = ((t - 25.0) % period + period) % period;
    // Active window: phase in [0, 7.2]
    let strength = 0;
    let frontPos = -40; // projection along GUST_DIR (range -24 to +24)
    if (phase >= 0 && phase <= 7.2) {
      const u = phase / 7.2;
      strength = Math.sin(u * Math.PI);
      strength = Math.pow(strength, 0.75);
      // Sweeps from outer sea (-22 along GUST_DIR, i.e., +X/+Z corner) to hillside (+24 along GUST_DIR)
      frontPos = lerp(-20.0, 24.0, u);
    }
    return { strength, frontPos, dir: GUST_DIR };
  }

  // Local gust intensity at world (x, z) — propagates causally along GUST_DIR!
  function getLocalGust(x, z, t) {
    const g = evaluateGust(t);
    if (g.strength <= 0.001) return 0;
    const proj = x * g.dir.x + z * g.dir.y;
    const dist = proj - g.frontPos;
    // Asymmetric bell wave: crisp leading edge, soft trailing tail
    const wave = dist > 0
      ? Math.exp(-(dist * dist) / 14.0)
      : Math.exp(-(dist * dist) / 48.0);
    return g.strength * wave;
  }

  // Cloud shadow sweeping across diorama + rare daytime lighthouse illumination
  function evaluateCloud(t) {
    // Periodic cycle of 62s so at most ONE salient weather event occurs at a time:
    //   t =  0..10s : clear sunlit sky (faint rainbow alone in establishing shot!)
    //   t = 25..32s : clear sunlit sky (sea gust alone in shot 6!)
    //   t = 47..54s : prominent dark cloud shadow sweeps across base -> triggers rare daytime lighthouse blink!
    const period = 62.0;
    const phase = ((t - 47.0) % period + period) % period;
    let cloudX = 50.0;
    let cloudZ = 50.0;
    let cloudRadius = 15.0;
    let darkness = 0.0;
    let lighthouseBlink = 0.0;

    if (phase >= 0 && phase <= 7.2) {
      const u = phase / 7.2;
      // Sweeps diagonally across the diorama base from (+22, -16) to (-22, +16)
      cloudX = lerp(24.0, -24.0, u);
      cloudZ = lerp(-14.0, 14.0, u);
      cloudRadius = 16.5;
      darkness = Math.sin(u * Math.PI) * 0.78;
      // Lighthouse turns on warmly once when sky dims most deeply!
      lighthouseBlink = smoothstep(0.22, 0.42, u) * (1.0 - smoothstep(0.62, 0.85, u));
    } else if (phase >= 22.0 && phase <= 27.5) {
      // Gentle thin secondary cloud veil (soft brightness ripple, no lighthouse blink)
      const u = (phase - 22.0) / 5.5;
      cloudX = lerp(24.0, -24.0, u);
      cloudZ = lerp(-10.0, 12.0, u);
      cloudRadius = 14.0;
      darkness = Math.sin(u * Math.PI) * 0.28;
    }

    return { cloudX, cloudZ, cloudRadius, darkness, lighthouseBlink };
  }

  // Sun factor at world (x, z) (1 = full sunlit, ~0.35 = under cloud shadow)
  function getLocalSunFactor(x, z, t) {
    const c = evaluateCloud(t);
    if (c.darkness <= 0.001) return 1.0;
    const dx = x - c.cloudX;
    const dz = z - c.cloudZ;
    const d2 = (dx * dx + dz * dz) / (c.cloudRadius * c.cloudRadius);
    const shadow = Math.exp(-d2 * 1.35) * c.darkness;
    return clamp(1.0 - shadow, 0.32, 1.0);
  }

  // Rain intensity ebb & flow + faint cel rainbow when rain briefly eases!
  function evaluateRain(t) {
    // Gentle slow oscillation between 0.36 (light sunlit drizzle) and 0.96 (lively sunshower)
    // At t = 0..7s: light rain (rainbow faintly visible in establishing shot!)
    // At t = 18..25s: slightly denser rain (cat shelters cleanly under skiff!)
    // At t = 35..43s: eases again -> cat can wander in interactive mode; rainbow subtly returns later!
    const wave1 = Math.sin(t * 0.145 - 1.35); // low near t=0..6, high near t=18..25
    const wave2 = Math.cos(t * 0.072 + 0.4) * 0.25;
    const raw = clamp(0.64 + wave1 * 0.28 + wave2 * 0.18, 0.32, 1.0);
    // Faint rainbow appears when rain briefly lightens (raw < 0.50) AND sky isn't darkened by cloud
    const cloud = evaluateCloud(t);
    const rainbowBase = smoothstep(0.52, 0.36, raw) * (1.0 - cloud.darkness * 0.90);
    return {
      intensity: raw,
      rainbowAlpha: clamp(rainbowBase * 0.30, 0, 0.30)
    };
  }

  // Departing Boat 4 schedule (46s cycle; starts unmooring cleanly at t = 52.0s so tour finale 53..60s captures it departing around the breakwater with crisp wake!)
  function evaluateBoat4Trip(t) {
    // Active voyage lasts 26 seconds every 58 seconds
    // Offset so first voyage starts at t = 51.8s (and repeats at t = 109.8s, etc.)
    const cycle = 58.0;
    const startOffset = 51.8;
    const localT = t - startOffset;
    if (localT < 0) {
      return { active: false, progress: 0, speed: 0, ropeTight: 1.0 };
    }
    const phase = localT % cycle;
    const tripDuration = 28.0;
    if (phase < 0 || phase > tripDuration) {
      return { active: false, progress: 0, speed: 0, ropeTight: 1.0 };
    }
    // 0..1.4s: unmooring ropes; 1.4..26.6s: cruising loop; 26.6..28.0s: re-mooring
    let ropeTight = 0.0;
    let progress = 0.0;
    let speed = 0.0;
    if (phase < 1.4) {
      ropeTight = 1.0 - smoothstep(0.0, 1.2, phase);
      progress = 0.0;
      speed = 0.0;
    } else if (phase <= 26.6) {
      const u = (phase - 1.4) / 25.2;
      // Smooth accelerate out of berth and decelerate into berth
      const eased = u < 0.08
        ? (u * u) / (2 * 0.08) + 0.0
        : u > 0.92
          ? 1.0 - ((1.0 - u) * (1.0 - u)) / (2 * 0.08)
          : u;
      // Normalize smooth S-curve
      progress = smoothstep(0.0, 1.0, u) * 0.35 + u * 0.65;
      speed = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.90, 1.0, u));
    } else {
      ropeTight = smoothstep(26.6, 27.8, phase);
      progress = 1.0;
      speed = 0.0;
    }
    return { active: phase >= 1.4 && phase <= 26.6, progress, speed, ropeTight };
  }

  window.HARBOR = {
    BASE_SIZE,
    HALF,
    DECK_Y,
    WATER_Y,
    PLINTH_BOTTOM_Y,
    PLINTH_TOP_Y,
    PALETTE,
    SUN_DIR,
    createRNG,
    clamp,
    smoothstep,
    lerp,
    getSeabedY,
    isLandPoint,
    getHillsideY,
    evaluateGust,
    getLocalGust,
    evaluateCloud,
    getLocalSunFactor,
    evaluateRain,
    evaluateBoat4Trip
  };
})();
