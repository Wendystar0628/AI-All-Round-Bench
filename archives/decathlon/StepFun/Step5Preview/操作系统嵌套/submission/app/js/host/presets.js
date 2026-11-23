// 预置资源：加载项目内的程序文件与场景资源，构建种子数据
const PROG_DIR = 'programs/';
const FIX_DIR = 'fixtures/';

const PROGRAM_FILES = [
  'Kernel.osprog', 'Window.osprog', 'Files.osprog', 'Editor.osprog', 'Process.osprog',
  'Player.osprog', 'Scene.osprog', 'Fx.osprog', 'Chart.osprog', 'ChartData.osprog',
  'FlightControl.osprog', 'Compiler.osprog', 'Console.osprog', 'Help.osprog',
  'Accumulate.osprog', 'SendMsg.osprog', 'RecvMsg.osprog', 'Compute.osprog'
];

export async function loadPresets() {
  const presets = { kernelSource: '', innerFiles: [], rootFiles: [], texts: {} };
  const texts = {};
  await Promise.all(PROGRAM_FILES.map(async f => {
    const r = await fetch(PROG_DIR + f);
    texts[f] = r.ok ? await r.text() : '';
  }));
  let scene = '';
  try { const r = await fetch(FIX_DIR + 'helicopter-24.scene'); scene = r.ok ? await r.text() : ''; } catch (e) { }
  if (!scene) scene = JSON.stringify({ format: 'heli-scene-1', name: '空场景', duration: 15, env: {}, terrain: { size: 200, segments: 40, amp: 4, waves: [[0.03, 0.5, 0.2, 0.03, 0.4]], flats: [] }, pads: [], props: [], camera: { fov: 55 }, heli: { parts: [], initial: { pos: [0, 3, 0] } }, show: { camera: [{ t: 0, mode: 'orbit', r: 14, h: 5, yaw: 0.6 }], controls: [[0, 0, 0, 0, 0], [15, 0.5, 0, 0, 0]], fault: { t: 6, rotor: 0.4 } } });
  presets.texts = texts;
  presets.kernelSource = texts['Kernel.osprog'];
  presets.scene = scene;

  const inner = [];
  inner.push(['/System/Kernels/Kernel.osprog', texts['Kernel.osprog']]);
  for (const f of PROGRAM_FILES) if (f !== 'Kernel.osprog') inner.push(['/System/Programs/' + f, texts[f]]);
  inner.push(['/Demo/helicopter-24.scene', scene]);
  inner.push(['/System/config.json', JSON.stringify({ budget: 12000, memQuota: 4000000, storageQuota: 2000000, procQuota: 4000, childGrant: 5000, quantum: 900 })]);
  presets.innerFiles = inner;

  // 根系统预置
  const root = [];
  root.push(['/System/Kernels/Kernel.osprog', texts['Kernel.osprog']]);
  for (const f of PROGRAM_FILES) if (f !== 'Kernel.osprog') root.push(['/System/Programs/' + f, texts[f]]);
  root.push(['/Demo/helicopter-24.scene', scene]);
  root.push(['/Demo/sample.sheet', JSON.stringify(sheetFixture())]);
  for (const f of ['Accumulate.osprog', 'SendMsg.osprog', 'RecvMsg.osprog', 'Compute.osprog', 'FlightControl.osprog']) {
    root.push(['/Demo/' + f, texts[f]]);
  }
  root.push(['/Documents/示例程序.osprog', texts['Accumulate.osprog']]);
  root.push(['/Documents/飞控程序.osprog', texts['FlightControl.osprog']]);
  root.push(['/Documents/内核源文件-Kernel.osprog', texts['Kernel.osprog']]);
  root.push(['/Desktop/场景源文件-helicopter-24.scene', scene]);
  root.push(['/System/config.json', JSON.stringify({ budget: 40000, memQuota: 16000000, storageQuota: 8000000, procQuota: 8000, childGrant: 14000, quantum: 1400 })]);
  presets.rootFiles = root;
  return presets;
}

function sheetFixture() {
  return {
    name: '示例工作簿',
    cells: {
      A1: { v: '项目' }, B1: { v: '数量' }, C1: { v: '单价' }, D1: { v: '小计' },
      A2: { v: '项目 A' }, B2: { v: 24 }, C2: { v: 6 }, D2: { f: '=B2*C2' },
      A3: { v: '项目 B' }, B3: { v: 12 }, C3: { v: 8 }, D3: { f: '=B3*C3' },
      A4: { v: '项目 C' }, B4: { v: 18 }, C4: { v: 4 }, D4: { f: '=B4*C4' }
    },
    values: {},
    formats: { D1: { bold: true, color: '#ffd23f' }, A1: { bold: true }, B1: { bold: true }, C1: { bold: true } }
  };
}
