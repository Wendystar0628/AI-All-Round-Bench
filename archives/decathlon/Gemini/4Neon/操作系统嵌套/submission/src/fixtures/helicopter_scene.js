// Generates the pure-JSON resource /Demo/helicopter-24.scene
// Zero host code inside the scene resource; all geometry, textures, materials,
// terrain heightfield, obstacles, helipads, lights, cameras, and default 15s flight record are pure data.

export function createHelicopter24Scene() {
  return {
    format: 'nos-scene-v1',
    name: '24号紫黄直升机 · 高原起降场',
    sourceScenePath: '/Demo/helicopter-24.scene',
    duration: 15.0,
    fps: 30,
    environment: {
      skyTop: '#162447',
      skyMid: '#3a506b',
      skyHorizon: '#e89d65',
      fogColor: '#cfa17c',
      fogNear: 52,
      fogFar: 215,
      ambientColor: '#7b8db5',
      ambientIntensity: 0.72,
      hemiSky: '#9bc4e8',
      hemiGround: '#594835',
      hemiIntensity: 0.65,
    },
    lights: [
      {
        id: 'sun',
        type: 'directional',
        color: '#ffe3b3',
        intensity: 2.55,
        pos: [52, 42, 34],
        castShadow: true,
        shadowExtent: 75,
      },
      {
        id: 'rim',
        type: 'directional',
        color: '#88b4ff',
        intensity: 0.62,
        pos: [-40, 22, -36],
        castShadow: false,
      },
    ],
    cameras: {
      cinematic: { pos: [9.5, 4.2, 8.2], target: [0, 1.5, 0], fov: 45 },
    },
    terrain: {
      size: 240,
      segments: 96,
      lowColor: '#4a6139',
      midColor: '#667547',
      highColor: '#7a7060',
      waves: [
        { amp: 1.5, fx: 0.042, fz: 0.032, phase: 0.4 },
        { amp: 0.85, fx: 0.082, fz: -0.058, phase: 1.1 },
        { amp: 2.8, fx: 0.021, fz: 0.017, phase: 2.0 },
      ],
      flatPads: [
        { x: 0, z: 0, radius: 10.5, blend: 9.0, y: 0.0 },
        { x: 38, z: -26, radius: 9.5, blend: 9.0, y: 2.2 },
        { x: -20, z: -14, radius: 11.0, blend: 8.0, y: 0.4 },
        { x: 10, z: -26, radius: 6.5, blend: 6.0, y: 0.4 },
      ],
    },
    helipads: [
      {
        id: 'helipad_1',
        name: '1 号主停机坪 (Alpha)',
        pos: [0, 0.05, 0],
        radius: 6.2,
        label: 'H',
        ringColor: '#FDB927',
        padColor: '#3f454f',
      },
      {
        id: 'helipad_2',
        name: '2 号高台停机坪 (Bravo)',
        pos: [38, 2.25, -26],
        radius: 5.8,
        label: 'H2',
        ringColor: '#38bdf8',
        padColor: '#3c434d',
      },
    ],
    obstacles: [
      {
        id: 'hangar_1',
        name: '航空机库 #24',
        kind: 'hangar',
        pos: [-20, 0.4, -14],
        rotY: 0.35,
        size: [12.5, 6.2, 10.0],
        wallColor: '#4c5564',
        roofColor: '#2c3442',
        accentColor: '#FDB927',
        collider: { pos: [-20, 3.5, -14], size: [12.5, 6.2, 10.0] },
      },
      {
        id: 'atc_tower',
        name: '空管指挥塔台',
        kind: 'tower',
        pos: [10, 0.4, -26],
        rotY: -0.4,
        size: [4.6, 13.5, 4.6],
        wallColor: '#cfd6e0',
        glassColor: '#1f4b6e',
        accentColor: '#552583',
        collider: { pos: [10, 7.1, -26], size: [4.8, 13.5, 4.8] },
      },
      {
        id: 'ridge_tower',
        name: '山脊导航铁塔',
        kind: 'mast',
        pos: [28, 1.8, 18],
        rotY: 0.0,
        size: [2.6, 15.0, 2.6],
        wallColor: '#b93829',
        accentColor: '#f1f5f9',
        collider: { pos: [28, 9.3, 18], size: [2.8, 15.0, 2.8] },
      },
      {
        id: 'fuel_depot',
        name: '航油储罐区',
        kind: 'depot',
        pos: [-16, 0.2, 15],
        rotY: 0.2,
        size: [7.5, 3.8, 4.2],
        wallColor: '#d4dce6',
        accentColor: '#FDB927',
        collider: { pos: [-16, 2.1, 15], size: [7.5, 3.8, 4.2] },
      },
    ],
    vegetation: {
      treeCount: 68,
      treeSeed: 2401,
      treeMinRadius: 23,
      treeMaxRadius: 88,
      grassCount: 280,
      grassSeed: 2402,
      mountainsCount: 26,
      mountainsRadius: 112,
    },
    // 24 号紫黄配色直升机：全部部件与材质均为纯数据描述（附带曲面 #24 编号贴图参数）
    parts: [
      {
        id: 'fuselage',
        name: '24号主机身',
        role: 'body',
        pickRadius: 1.65,
        pos: [0, 1.45, 0.15],
        subShapes: [
          // 主流线紫金机身舱体
          {
            geom: { type: 'capsule', radius: 1.02, length: 2.55 },
            rot: [1.5708, 0, 0],
            scale: [0.96, 1.0, 0.92],
            material: { color: '#552583', roughness: 0.26, metalness: 0.38 },
          },
          // 机腹金色流线导流裙边
          {
            geom: { type: 'box', size: [1.58, 0.34, 3.3] },
            pos: [0, -0.62, 0.05],
            material: { color: '#FDB927', roughness: 0.32, metalness: 0.42 },
          },
          // 机身两侧金色贯穿饰条（左右）
          {
            geom: { type: 'box', size: [1.98, 0.16, 3.15] },
            pos: [0, -0.26, 0.05],
            material: { color: '#FDB927', roughness: 0.28, metalness: 0.45 },
          },
          // 机身左侧曲面涂装标牌 — 数字 24（随曲面法线受光）
          {
            geom: { type: 'curved_panel', radius: 1.048, arc: 0.96, height: 1.68 },
            pos: [0, 0.04, 0.16],
            rot: [0, 0, 1.5708],
            side: 'left',
            material: {
              color: '#ffffff',
              roughness: 0.24,
              metalness: 0.32,
              texture: { type: 'decal_number', text: '24', bg: '#552583', stripe: '#FDB927', textColor: '#FDB927', outline: '#1e0d33' },
            },
          },
          // 机身右侧曲面涂装标牌 — 数字 24（随曲面法线受光）
          {
            geom: { type: 'curved_panel', radius: 1.048, arc: 0.96, height: 1.68 },
            pos: [0, 0.04, 0.16],
            rot: [0, 0, -1.5708],
            side: 'right',
            material: {
              color: '#ffffff',
              roughness: 0.24,
              metalness: 0.32,
              texture: { type: 'decal_number', text: '24', bg: '#552583', stripe: '#FDB927', textColor: '#FDB927', outline: '#1e0d33' },
            },
          },
          // 机鼻紫色流线锥罩 + 金色前缘饰环
          {
            geom: { type: 'sphere', radius: 0.96 },
            pos: [0, -0.14, -1.78],
            scale: [0.95, 0.76, 1.28],
            material: { color: '#552583', roughness: 0.24, metalness: 0.4 },
          },
          {
            geom: { type: 'torus', radius: 0.64, tube: 0.075 },
            pos: [0, -0.18, -2.35],
            scale: [1.0, 0.74, 1.0],
            material: { color: '#FDB927', roughness: 0.28, metalness: 0.5 },
          },
        ],
      },
      {
        id: 'cockpit',
        name: '全景座舱玻璃',
        role: 'body',
        pickRadius: 1.15,
        pos: [0, 1.68, -1.25],
        subShapes: [
          {
            geom: { type: 'sphere', radius: 0.98 },
            pos: [0, 0.0, 0.0],
            scale: [0.92, 0.78, 1.24],
            material: { color: '#10243d', roughness: 0.07, metalness: 0.72, opacity: 0.82, transparent: true },
          },
          // 座舱中框支柱
          {
            geom: { type: 'box', size: [0.09, 0.85, 0.14] },
            pos: [0, 0.24, -0.82],
            rot: [0.58, 0, 0],
            material: { color: '#2a1842', roughness: 0.4, metalness: 0.5 },
          },
          // 仪表台微光
          {
            geom: { type: 'box', size: [0.95, 0.18, 0.35] },
            pos: [0, -0.18, -0.45],
            material: { color: '#1e293b', emissive: '#f59e0b', emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.2 },
          },
        ],
      },
      {
        id: 'engine_cowling',
        name: '双发涡轴引擎舱',
        role: 'body',
        pickRadius: 1.05,
        pos: [0, 2.42, 0.42],
        subShapes: [
          {
            geom: { type: 'box', size: [1.28, 0.56, 2.35] },
            material: { color: '#461d6e', roughness: 0.32, metalness: 0.44 },
          },
          {
            geom: { type: 'box', size: [1.34, 0.14, 2.2] },
            pos: [0, 0.16, 0],
            material: { color: '#FDB927', roughness: 0.28, metalness: 0.48 },
          },
          // 左右钛金属排气管
          {
            geom: { type: 'cylinder', radiusTop: 0.16, radiusBottom: 0.19, height: 0.65 },
            pos: [-0.42, 0.04, 1.25],
            rot: [1.45, 0, -0.22],
            material: { color: '#6b7280', roughness: 0.36, metalness: 0.82 },
          },
          {
            geom: { type: 'cylinder', radiusTop: 0.16, radiusBottom: 0.19, height: 0.65 },
            pos: [0.42, 0.04, 1.25],
            rot: [1.45, 0, 0.22],
            material: { color: '#6b7280', roughness: 0.36, metalness: 0.82 },
          },
        ],
      },
      {
        id: 'main_rotor_hub',
        name: '主旋翼桨毂与主轴',
        role: 'main_rotor',
        pickRadius: 0.85,
        pos: [0, 3.05, 0.0],
        subShapes: [
          {
            geom: { type: 'cylinder', radiusTop: 0.14, radiusBottom: 0.18, height: 0.72 },
            pos: [0, -0.18, 0],
            material: { color: '#374151', roughness: 0.35, metalness: 0.8 },
          },
          {
            geom: { type: 'cylinder', radiusTop: 0.44, radiusBottom: 0.48, height: 0.24 },
            pos: [0, 0.18, 0],
            material: { color: '#FDB927', roughness: 0.26, metalness: 0.55 },
          },
          {
            geom: { type: 'sphere', radius: 0.34 },
            pos: [0, 0.31, 0],
            scale: [1.0, 0.5, 1.0],
            material: { color: '#552583', roughness: 0.25, metalness: 0.45 },
          },
        ],
      },
      {
        id: 'main_rotor_blades',
        name: '四叶主旋翼桨叶',
        role: 'main_rotor',
        pickRadius: 2.2,
        pos: [0, 3.24, 0.0],
        rotorBlurRadius: 5.4,
        subShapes: [
          // 4 片主桨叶（+X, -X, +Z, -Z）带明黄叶尖警示条
          { geom: { type: 'box', size: [5.35, 0.06, 0.34] }, pos: [2.75, 0, 0], material: { color: '#242230', roughness: 0.38, metalness: 0.45 } },
          { geom: { type: 'box', size: [0.68, 0.065, 0.35] }, pos: [5.12, 0, 0], material: { color: '#FDB927', roughness: 0.3, metalness: 0.3 } },
          { geom: { type: 'box', size: [5.35, 0.06, 0.34] }, pos: [-2.75, 0, 0], material: { color: '#242230', roughness: 0.38, metalness: 0.45 } },
          { geom: { type: 'box', size: [0.68, 0.065, 0.35] }, pos: [-5.12, 0, 0], material: { color: '#FDB927', roughness: 0.3, metalness: 0.3 } },
          { geom: { type: 'box', size: [0.34, 0.06, 5.35] }, pos: [0, 0, 2.75], material: { color: '#242230', roughness: 0.38, metalness: 0.45 } },
          { geom: { type: 'box', size: [0.35, 0.065, 0.68] }, pos: [0, 0, 5.12], material: { color: '#FDB927', roughness: 0.3, metalness: 0.3 } },
          { geom: { type: 'box', size: [0.34, 0.06, 5.35] }, pos: [0, 0, -2.75], material: { color: '#242230', roughness: 0.38, metalness: 0.45 } },
          { geom: { type: 'box', size: [0.35, 0.065, 0.68] }, pos: [0, 0, -5.12], material: { color: '#FDB927', roughness: 0.3, metalness: 0.3 } },
        ],
      },
      {
        id: 'tail_boom',
        name: '紫色锥形尾梁',
        role: 'body',
        pickRadius: 1.1,
        pos: [0, 1.84, 3.65],
        subShapes: [
          {
            geom: { type: 'cylinder', radiusTop: 0.24, radiusBottom: 0.56, height: 4.5 },
            rot: [1.54, 0, 0],
            material: { color: '#552583', roughness: 0.28, metalness: 0.38 },
          },
          // 尾梁双金色识别环
          {
            geom: { type: 'cylinder', radiusTop: 0.36, radiusBottom: 0.39, height: 0.34 },
            pos: [0, 0.03, 0.45],
            rot: [1.54, 0, 0],
            material: { color: '#FDB927', roughness: 0.28, metalness: 0.48 },
          },
          {
            geom: { type: 'cylinder', radiusTop: 0.30, radiusBottom: 0.33, height: 0.24 },
            pos: [0, 0.05, 1.1],
            rot: [1.54, 0, 0],
            material: { color: '#FDB927', roughness: 0.28, metalness: 0.48 },
          },
          // 水平安定面
          {
            geom: { type: 'box', size: [2.25, 0.09, 0.62] },
            pos: [0, 0.08, 1.3],
            material: { color: '#461d6e', roughness: 0.3, metalness: 0.38 },
          },
          {
            geom: { type: 'box', size: [0.1, 0.42, 0.52] },
            pos: [-1.12, 0.08, 1.3],
            material: { color: '#FDB927', roughness: 0.28, metalness: 0.42 },
          },
          {
            geom: { type: 'box', size: [0.1, 0.42, 0.52] },
            pos: [1.12, 0.08, 1.3],
            material: { color: '#FDB927', roughness: 0.28, metalness: 0.42 },
          },
        ],
      },
      {
        id: 'tail_fin',
        name: '垂直尾翼与航行灯',
        role: 'body',
        pickRadius: 0.95,
        pos: [0, 2.48, 5.85],
        subShapes: [
          {
            geom: { type: 'box', size: [0.22, 1.95, 1.15] },
            rot: [0.28, 0, 0],
            material: { color: '#552583', roughness: 0.26, metalness: 0.38 },
          },
          {
            geom: { type: 'box', size: [0.25, 0.34, 1.05] },
            pos: [0, 0.58, 0.14],
            rot: [0.28, 0, 0],
            material: { color: '#FDB927', roughness: 0.26, metalness: 0.46 },
          },
          // 尾翼顶部红色频闪航行灯
          {
            geom: { type: 'sphere', radius: 0.12 },
            pos: [0, 1.02, 0.28],
            material: { color: '#ff3b30', emissive: '#ff2d20', emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.1 },
          },
        ],
      },
      {
        id: 'tail_rotor',
        name: '四叶防扭尾桨',
        role: 'tail_rotor',
        pickRadius: 0.85,
        pos: [0.28, 2.25, 5.95],
        subShapes: [
          {
            geom: { type: 'cylinder', radiusTop: 0.13, radiusBottom: 0.13, height: 0.26 },
            rot: [0, 0, 1.5708],
            material: { color: '#FDB927', roughness: 0.3, metalness: 0.6 },
          },
          {
            geom: { type: 'box', size: [0.05, 1.56, 0.16] },
            pos: [0.08, 0, 0],
            material: { color: '#242230', roughness: 0.36, metalness: 0.45 },
          },
          {
            geom: { type: 'box', size: [0.05, 0.16, 1.56] },
            pos: [0.08, 0, 0],
            material: { color: '#FDB927', roughness: 0.32, metalness: 0.4 },
          },
        ],
      },
      {
        id: 'skids_left',
        name: '左起落架滑橇',
        role: 'body',
        pickRadius: 0.85,
        pos: [-1.18, 0.36, -0.05],
        subShapes: [
          { geom: { type: 'cylinder', radiusTop: 0.085, radiusBottom: 0.085, height: 4.15 }, pos: [0, -0.25, 0], rot: [1.5708, 0, 0], material: { color: '#374151', roughness: 0.4, metalness: 0.78 } },
          { geom: { type: 'cylinder', radiusTop: 0.065, radiusBottom: 0.065, height: 0.95 }, pos: [0.34, 0.16, -0.95], rot: [0, 0, -0.58], material: { color: '#4b5563', roughness: 0.4, metalness: 0.75 } },
          { geom: { type: 'cylinder', radiusTop: 0.065, radiusBottom: 0.065, height: 0.95 }, pos: [0.34, 0.16, 0.95], rot: [0, 0, -0.58], material: { color: '#4b5563', roughness: 0.4, metalness: 0.75 } },
        ],
      },
      {
        id: 'skids_right',
        name: '右起落架滑橇',
        role: 'body',
        pickRadius: 0.85,
        pos: [1.18, 0.36, -0.05],
        subShapes: [
          { geom: { type: 'cylinder', radiusTop: 0.085, radiusBottom: 0.085, height: 4.15 }, pos: [0, -0.25, 0], rot: [1.5708, 0, 0], material: { color: '#374151', roughness: 0.4, metalness: 0.78 } },
          { geom: { type: 'cylinder', radiusTop: 0.065, radiusBottom: 0.065, height: 0.95 }, pos: [-0.34, 0.16, -0.95], rot: [0, 0, 0.58], material: { color: '#4b5563', roughness: 0.4, metalness: 0.75 } },
          { geom: { type: 'cylinder', radiusTop: 0.065, radiusBottom: 0.065, height: 0.95 }, pos: [-0.34, 0.16, 0.95], rot: [0, 0, 0.58], material: { color: '#4b5563', roughness: 0.4, metalness: 0.75 } },
        ],
      },
      {
        id: 'nose_sensor',
        name: '机头光电球与探照灯',
        role: 'body',
        pickRadius: 0.65,
        pos: [0, 0.92, -2.25],
        subShapes: [
          { geom: { type: 'sphere', radius: 0.24 }, material: { color: '#1f2937', roughness: 0.25, metalness: 0.7 } },
          { geom: { type: 'sphere', radius: 0.11 }, pos: [0, -0.02, -0.19], material: { color: '#fef3c7', emissive: '#fde68a', emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.1 } },
        ],
      },
    ],
    // 飞行物理参数（由 /apps/player_scene.nos 读取，排演与默认演出共用）
    flightModel: {
      gravity: 9.81,
      maxThrust: 18.8,
      instability: 1.45,
      drag: 0.34,
      initialState: {
        pos: [0, 0.0, 0],
        rot: [0, -0.65, 0],
        vel: [0, 0, 0],
        rotorRpm: 0.32,
        tailRpm: 0.32,
      },
    },
    // 默认 15 秒演出记录：由与排演完全相同的六自由度闭环动力学预先录制的真实控制时序，
    // 依次经历：旋翼启动与离地(0~2.5s) -> 谷地前飞与盘旋转向(2.5~7.5s) -> 尾桨故障征兆(7.5~9.15s)
    // -> 失控自旋俯冲(9.15~11.4s) -> 撞击高潮(11.4s) -> 残骸与碎片落定停稳(11.5~15.0s)
    defaultRecord: generateDefaultPerformanceRecord(),
  };
}

function generateDefaultPerformanceRecord() {
  // 使用与 /apps/player_scene.nos 一致的物理参数生成 450 帧 (30Hz × 15s) 真实控制时序
  const dt = 1.0 / 30.0;
  const gravity = 9.81;
  const maxThrust = 18.8;
  const instab = 1.45;
  const drag = 0.34;

  const waves = [
    { amp: 1.5, fx: 0.042, fz: 0.032, phase: 0.4 },
    { amp: 0.85, fx: 0.082, fz: -0.058, phase: 1.1 },
    { amp: 2.8, fx: 0.021, fz: 0.017, phase: 2.0 },
  ];
  const flatPads = [
    { x: 0, z: 0, radius: 10.5, blend: 9.0, y: 0.0 },
    { x: 38, z: -26, radius: 9.5, blend: 9.0, y: 2.2 },
    { x: -20, z: -14, radius: 11.0, blend: 8.0, y: 0.4 },
    { x: 10, z: -26, radius: 6.5, blend: 6.0, y: 0.4 },
  ];

  function terrainY(x, z) {
    let h = 0;
    for (const w of waves) h += w.amp * Math.sin(x * w.fx + w.phase) * Math.cos(z * w.fz - w.phase * 0.5);
    for (const pad of flatPads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d <= pad.radius) h = pad.y;
      else if (d < pad.radius + pad.blend) {
        const u = (d - pad.radius) / pad.blend;
        const sm = u * u * (3 - 2 * u);
        h = pad.y * (1 - sm) + h * sm;
      }
    }
    return h;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function wrapAng(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // 仿真初始态与 flightModel.initialState 完全一致
  let pos = [0, 0, 0];
  let vel = [0, 0, 0];
  let rot = [0, -0.65, 0];
  let angVel = [0, 0, 0];
  let rotorRpm = 0.32;
  let tailRpm = 0.32;
  let altInt = 0;
  let crashed = false;
  const controlTrack = [];
  const faultStartT = 7.5;

  for (let step = 0; step < 450; step++) {
    const t = step * dt;
    // 演出航路点：优雅起飞悬停 -> 前飞越谷盘旋展示 24 号双侧涂装 -> 故障失控坠向谷地开阔斜坡
    let tx = 0, ty = 0, tz = 0, desYaw = -0.65, rTarget = 1.0;
    if (t < 1.1) {
      tx = 0; ty = 0.0; tz = 0; desYaw = -0.65; rTarget = 0.32 + (t / 1.1) * 0.68;
    } else if (t < 2.8) {
      const u = (t - 1.1) / 1.7;
      tx = u * 3.5; ty = 0.5 + u * 6.5; tz = -u * 3.0; desYaw = -0.65 + u * 0.35;
    } else if (t < 5.4) {
      const u = (t - 2.8) / 2.6;
      tx = 3.5 + u * 17.5; ty = 7.0 + Math.sin(u * Math.PI) * 3.2; tz = -3.0 - u * 12.0; desYaw = -0.3 + u * 1.15;
    } else if (t < 7.5) {
      const u = (t - 5.4) / 2.1;
      tx = 21.0 - u * 7.0; ty = 8.4 + u * 1.4; tz = -15.0 + u * 14.0; desYaw = 0.85 + u * 1.1;
    } else if (t < 9.15) {
      // 故障征兆期：机员尝试稳住航线
      const u = (t - 7.5) / 1.65;
      tx = 14.0 - u * 3.5; ty = 9.4 - u * 1.2; tz = -1.0 + u * 5.0; desYaw = 1.95;
    } else {
      tx = 10.0; ty = 0.0; tz = 4.0; desYaw = 1.95;
    }

    let collective = 0.15, pitchCmd = 0, rollCmd = 0, yawCmd = 0.35;

    if (t < 1.1) {
      // 地面加速阶段（保持在停机坪上，下洗气流逐步增强）
      collective = 0.20 + (t / 1.1) * 0.28;
      pitchCmd = -rot[0] * 3.0 - angVel[0] * 1.2;
      rollCmd = -rot[2] * 3.0 - angVel[2] * 1.2;
      yawCmd = 0.35;
    } else if (t < 9.15) {
      const altErr = ty - pos[1];
      altInt = clamp(altInt + altErr * dt, -3.0, 3.0);
      const vyDes = clamp(altErr * 1.45 + altInt * 0.25, -4.0, 5.5);
      collective = clamp(0.525 + (vyDes - vel[1]) * 0.24, 0.12, 1.35);

      const dx = tx - pos[0];
      const dz = tz - pos[2];
      const dist = Math.hypot(dx, dz);
      const maxSpd = dist > 6 ? 8.2 : clamp(dist * 1.1, 0, 6.5);
      const vxDes = dist > 0.2 ? (dx / dist) * maxSpd : 0;
      const vzDes = dist > 0.2 ? (dz / dist) * maxSpd : 0;

      const cy = Math.cos(rot[1]);
      const sy = Math.sin(rot[1]);
      const vErrX = vxDes - vel[0];
      const vErrZ = vzDes - vel[2];
      const fwdErr = -sy * vErrX - cy * vErrZ;
      const rightErr = cy * vErrX - sy * vErrZ;

      const pitchDes = clamp(-fwdErr * 0.052, -0.28, 0.28);
      const rollDes = clamp(-rightErr * 0.052, -0.28, 0.28);

      pitchCmd = clamp((pitchDes - rot[0]) * 4.2 - angVel[0] * 1.55, -1, 1);
      rollCmd = clamp((rollDes - rot[2]) * 4.2 - angVel[2] * 1.55, -1, 1);
      const yawErr = wrapAng(desYaw - rot[1]);
      yawCmd = clamp(0.35 + yawErr * 2.4 - angVel[1] * 1.25, -1, 1);
    } else if (!crashed) {
      // 9.15s 后彻底失控：尾桨失效，旋翼扭矩驱动螺旋下坠，确保约 11.4s 撞击地面
      const u = clamp((t - 9.15) / 2.2, 0, 1);
      collective = 0.42 - u * 0.24;
      pitchCmd = -0.18;
      rollCmd = 0.16;
      yawCmd = 0.0;
      rTarget = 0.72;
    } else {
      collective = 0; pitchCmd = 0; rollCmd = 0; yawCmd = 0; rTarget = 0;
    }

    controlTrack.push({
      t: t,
      collective: collective,
      pitch: pitchCmd,
      roll: rollCmd,
      yaw: yawCmd,
      rotorTarget: rTarget,
    });

    // 同步推进内部物理，确保下一步控制器读到精确状态
    if (!crashed) {
      let tailAuth = 1.0, engineScale = 1.0, faultShudder = 0.0, faultSevere = false;
      const tNext = t + dt;
      if (tNext >= faultStartT) {
        const fAge = tNext - faultStartT;
        if (fAge < 1.65) {
          tailAuth = 1.0 - 0.35 * (fAge / 1.65);
          faultShudder = Math.sin(tNext * 28.0) * 0.45 * (fAge / 1.65);
        } else {
          faultSevere = true;
          tailAuth = 0.0;
          rTarget = 0.72;
          engineScale = 0.62;
        }
      }
      rotorRpm += (rTarget - rotorRpm) * clamp(dt * 2.2, 0, 1);
      const tailTgt = faultSevere ? 0.0 : rotorRpm;
      tailRpm += (tailTgt - tailRpm) * clamp(dt * 4.5, 0, 1);

      const mainTorque = -2.45 * rotorRpm * (0.45 + 0.55 * collective);
      const tailTorque = 6.95 * tailAuth * yawCmd * tailRpm;
      const yawAcc = mainTorque + tailTorque - angVel[1] * 0.85 + faultShudder * 2.4;
      let pitchAcc = pitchCmd * 5.2 * rotorRpm + instab * rot[0] - angVel[0] * 1.05 + faultShudder * 0.9;
      let rollAcc = rollCmd * 5.2 * rotorRpm + instab * rot[2] - angVel[2] * 1.05;
      if (faultSevere) {
        pitchAcc += -1.35;
        rollAcc += 0.95 * Math.sin(tNext * 3.1);
      }

      const gy0 = terrainY(pos[0], pos[2]);
      const onGround = pos[1] <= gy0 + 0.06;
      if (onGround && collective * maxThrust * rotorRpm * engineScale <= gravity * 0.95) {
        angVel[0] *= 0.6; angVel[1] *= 0.7; angVel[2] *= 0.6;
        rot[0] *= 0.85; rot[2] *= 0.85;
      } else {
        angVel[0] += pitchAcc * dt; angVel[1] += yawAcc * dt; angVel[2] += rollAcc * dt;
        rot[0] = clamp(rot[0] + angVel[0] * dt, -1.45, 1.45);
        rot[1] = rot[1] + angVel[1] * dt;
        rot[2] = clamp(rot[2] + angVel[2] * dt, -1.45, 1.45);
      }

      const thrust = collective * maxThrust * rotorRpm * rotorRpm * engineScale;
      const cp = Math.cos(rot[0]), sp = Math.sin(rot[0]);
      const cr = Math.cos(rot[2]), sr = Math.sin(rot[2]);
      const cy = Math.cos(rot[1]), sy = Math.sin(rot[1]);
      const lx = -sr, ly = cp * cr, lz = sp * cr;
      const wx = lx * cy + lz * sy, wy = ly, wz = -lx * sy + lz * cy;

      vel[0] += (thrust * wx - vel[0] * drag) * dt;
      vel[1] += (thrust * wy - gravity - vel[1] * drag * 0.6) * dt;
      vel[2] += (thrust * wz - vel[2] * drag) * dt;
      pos[0] = clamp(pos[0] + vel[0] * dt, -105, 105);
      pos[1] += vel[1] * dt;
      pos[2] = clamp(pos[2] + vel[2] * dt, -105, 105);

      const gy = terrainY(pos[0], pos[2]);
      if (pos[1] <= gy) {
        const vImpact = -vel[1];
        const hSpd = Math.hypot(vel[0], vel[2]);
        const tilt = Math.hypot(rot[0], rot[2]);
        pos[1] = gy;
        if (vImpact > 4.2 || tilt > 0.58 || (hSpd > 7.5 && vImpact > 2.0) || faultSevere) {
          crashed = true;
        } else {
          vel[1] = 0; vel[0] *= Math.max(0, 1 - 5 * dt); vel[2] *= Math.max(0, 1 - 5 * dt);
        }
      }
    }
  }

  return {
    events: [
      { t: faultStartT, type: 'fault', fault: 'tail_rotor' },
    ],
    controlTrack,
  };
}
