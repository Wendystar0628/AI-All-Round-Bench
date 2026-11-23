/* 构建根 VFS 预置内容与子系统模板 */
'use strict';
window.NOS = window.NOS || {};

const PROGRAM_FILES = ['kernel', 'wm', 'compiler', 'files', 'editor', 'tasks', 'sysmgr', 'player', 'charts', 'flight',
  'demo-sum', 'demo-sender', 'demo-receiver', 'demo-busy'];

NOS.loadPrograms = async function () {
  const out = {};
  for (const name of PROGRAM_FILES) {
    out[name + '.osl'] = await NOS.loadText('../../programs/' + name + '.osl');
  }
  return out;
};

NOS.loadText = async function (rel) {
  const url = rel.startsWith('..') ? rel : ('../../' + rel);
  const r = await fetch(url);
  if (!r.ok) throw new Error('读取失败: ' + rel);
  return await r.text();
};

NOS.seedRootFS = async function (vfs) {
  const F = NOS.fixtures;

  // 目录
  for (const d of ['/System', '/Apps', '/Programs', '/Demo', '/Documents', '/Downloads', '/Snapshots', '/Pictures', '/Help']) vfs.mkdir(d);

  // 壁纸与贴图
  vfs.writeBlob('/System/wallpaper-dusk.png', F.wallpapers.dusk.split(',')[1]);
  vfs.writeBlob('/System/wallpaper-dawn.png', F.wallpapers.dawn.split(',')[1]);
  vfs.writeBlob('/System/wallpaper-night.png', F.wallpapers.night.split(',')[1]);

  // 程序文件（OSL）
  const programTexts = await NOS.loadPrograms();
  vfs.write(KERNEL_PATH_R(), programTexts['kernel.osl']);
  vfs.write('/System/wm.osl', programTexts['wm.osl']);
  vfs.write('/System/compiler.osl', programTexts['compiler.osl']);
  vfs.write('/Apps/files.osl', programTexts['files.osl']);
  vfs.write('/Apps/editor.osl', programTexts['editor.osl']);
  vfs.write('/Apps/tasks.osl', programTexts['tasks.osl']);
  vfs.write('/Apps/sysmgr.osl', programTexts['sysmgr.osl']);
  vfs.write('/Apps/player.osl', programTexts['player.osl']);
  vfs.write('/Apps/charts.osl', programTexts['charts.osl']);
  vfs.write('/Programs/flight.osl', programTexts['flight.osl']);
  vfs.write('/Programs/demo-sum.osl', programTexts['demo-sum.osl']);
  vfs.write('/Programs/demo-sender.osl', programTexts['demo-sender.osl']);
  vfs.write('/Programs/demo-receiver.osl', programTexts['demo-receiver.osl']);
  vfs.write('/Programs/demo-busy.osl', programTexts['demo-busy.osl']);

  // 场景资源
  const scene = await NOS.loadText('../../resources/helicopter-24.scene.json');
  vfs.write('/Demo/helicopter-24.scene', scene);
  vfs.write('/Demo/最小场景.scene', MINIMAL_SCENE);

  // 示例工作簿
  const sheet = NOS.SheetModel.sampleWorkbook();
  vfs.write('/Demo/sample.sheet', JSON.stringify(sheet));

  // 说明文档
  vfs.write('/Help/操作说明.txt', await NOS.loadText('../../resources/操作说明.txt'));
  vfs.write('/Help/程序与接口说明.txt', await NOS.loadText('../../resources/程序与接口说明.txt'));

  // 子系统模板（内核源文件在父系统；子盘内容是应用/程序/场景副本）
  const tpl = {};
  tpl['/Apps/files.osl'] = programTexts['files.osl'];
  tpl['/Apps/editor.osl'] = programTexts['editor.osl'];
  tpl['/Apps/tasks.osl'] = programTexts['tasks.osl'];
  tpl['/Apps/sysmgr.osl'] = programTexts['sysmgr.osl'];
  tpl['/Apps/player.osl'] = programTexts['player.osl'];
  tpl['/Apps/charts.osl'] = programTexts['charts.osl'];
  tpl['/System/wm.osl'] = programTexts['wm.osl'];
  tpl['/System/compiler.osl'] = programTexts['compiler.osl'];
  tpl['/Programs/flight.osl'] = programTexts['flight.osl'];
  tpl['/Programs/demo-sum.osl'] = programTexts['demo-sum.osl'];
  tpl['/Programs/demo-sender.osl'] = programTexts['demo-sender.osl'];
  tpl['/Programs/demo-receiver.osl'] = programTexts['demo-receiver.osl'];
  tpl['/Programs/demo-busy.osl'] = programTexts['demo-busy.osl'];
  tpl['/Demo/helicopter-24.scene'] = scene;
  tpl['/Demo/最小场景.scene'] = MINIMAL_SCENE;
  tpl['/Documents/欢迎.txt'] = '欢迎使用嵌套图形操作系统。\n打开“子系统管理”可继续创建下一层系统。\n';
  vfs.mkdir('/Snapshots');
  vfs.write('/System/child-template.json', JSON.stringify(tpl));

  return vfs;
};

function KERNEL_PATH_R() { return '/System/kernel.osl'; }

const MINIMAL_SCENE = JSON.stringify({
  kind: 'nestedos-scene', version: 1, name: '最小场景', frameRate: 30, duration: 6,
  sky: { top: '#222244', bottom: '#554466', sun: { azimuth: 0.7, elevation: 0.5, color: '#fff', intensity: 1 }, ambient: { color: '#666', intensity: 0.8 } },
  terrain: { size: 120, segments: 8, heightNoise: [], flatZones: [{ x: 0, z: 0, r: 60 }], material: { color: '#3a5a30', roughness: 1 }, collidable: true },
  objects: [],
  actor: {
    id: 'cube-actor', name: '方块', texture: null,
    root: { pos: [0, 1.5, 0], rot: [0, 0, 0] },
    physics: { gravity: 9.8, groundY: 0.6, hoverCollective: 50, liftFactor: 0.06, instability: 0 },
    parts: [
      { id: 'fuselage', type: 'compound-fuselage', size: [1.2, 1.2, 1.2], offset: [0, 0, 0], hp: 100, material: { color: '#88aaff', roughness: 0.5 } },
      { id: 'main-rotor', type: 'rotor', rotor: 'main', blades: 2, radius: 2, bladeWidth: 0.2, axis: [0, 1, 0], offset: [0, 0.9, 0], hp: 30, material: { color: '#444' } }
    ]
  },
  cameras: { cine: [{ t: 0, pos: [8, 5, 8], look: [0, 1, 0] }, { t: 6, pos: [8, 5, 8], look: [0, 1, 0] }], follow: { distance: 12, height: 4 }, free: { pos: [10, 8, 10] } },
  performance: { keys: [
    { t: 0, pos: [0, 0.6, 0], vel: [0, 0, 0], rot: [0, 0, 0], rotorMain: 0, rotorTail: 0, damage: {}, controls: {}, fault: null, wind: [0, 0, 0] },
    { t: 3, pos: [0, 2.5, 0], vel: [0, 0.5, 0], rot: [0, 0.5, 0], rotorMain: 30, rotorTail: 0, damage: {}, controls: {}, fault: null, wind: [0, 0, 0] },
    { t: 6, pos: [0, 0.6, 0], vel: [0, 0, 0], rot: [0, 1, 0], rotorMain: 5, rotorTail: 0, damage: {}, controls: {}, fault: null, wind: [0, 0, 0] }
  ] },
  effects: {}
}, null, 2);
