// Generates default VFS files for Root OS ('outer') and Subsystem ('inner-*')
// Includes sample.sheet (exact A1:D4 fixture), helicopter-24.scene, NOS programs, and precompiled cache.

import { createHelicopter24Scene } from './helicopter_scene.js';
import { compileNOS } from '../vm/compiler_bootstrap.js';

export function createSampleSheetData() {
  return {
    format: 'nos-sheet-v1',
    name: 'sample.sheet',
    rows: 24,
    cols: 10,
    cells: {
      A1: { raw: '项目', bold: true },
      B1: { raw: '数量', bold: true, align: 'right' },
      C1: { raw: '单价', bold: true, align: 'right' },
      D1: { raw: '小计', bold: true, align: 'right' },
      A2: { raw: '项目 A' },
      B2: { raw: '24', align: 'right' },
      C2: { raw: '6', align: 'right' },
      D2: { raw: '=B2*C2', align: 'right' },
      A3: { raw: '项目 B' },
      B3: { raw: '12', align: 'right' },
      C3: { raw: '8', align: 'right' },
      D3: { raw: '=B3*C3', align: 'right' },
      A4: { raw: '项目 C' },
      B4: { raw: '18', align: 'right' },
      C4: { raw: '4', align: 'right' },
      D4: { raw: '=B4*C4', align: 'right' },
    },
  };
}

function hashStr32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

let cachedHeliJson = null;
export function getHelicopterSceneJson() {
  if (!cachedHeliJson) {
    cachedHeliJson = JSON.stringify(createHelicopter24Scene());
  }
  return cachedHeliJson;
}

export function buildPrecompiledMap(nosSources) {
  const precompiled = {};
  for (const [vfsPath, src] of Object.entries(nosSources)) {
    try {
      const bc = compileNOS(src);
      bc.compilerTag = 'NOS-SelfHost-1.0';
      precompiled[hashStr32(src)] = bc;
    } catch (e) {
      console.error('Failed to precompile', vfsPath, e);
    }
  }
  return precompiled;
}

export function createDefaultOuterVfs(nosSources) {
  const now = Date.now() / 1000;
  const vfs = {
    '/': { kind: 'dir', size: 0, mtime: now },
    '/Desktop': { kind: 'dir', size: 0, mtime: now },
    '/Documents': { kind: 'dir', size: 0, mtime: now },
    '/Demo': { kind: 'dir', size: 0, mtime: now },
    '/Downloads': { kind: 'dir', size: 0, mtime: now },
    '/Programs': { kind: 'dir', size: 0, mtime: now },
    '/Systems': { kind: 'dir', size: 0, mtime: now },
    '/sys': { kind: 'dir', size: 0, mtime: now },
    '/apps': { kind: 'dir', size: 0, mtime: now },
    '/Trash': { kind: 'dir', size: 0, mtime: now },
  };

  function putFile(path, content) {
    const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    vfs[path] = { kind: 'file', content: str, size: str.length, mtime: now };
  }

  putFile('/Demo/sample.sheet', createSampleSheetData());
  putFile('/Demo/helicopter-24.scene', getHelicopterSceneJson());

  putFile(
    '/Documents/欢迎使用.txt',
    '欢迎使用 Nested OS 递归嵌套图形操作系统！\n\n' +
    '快速上手：\n' +
    '1. 双击桌面“新建子系统”或通过任务管理器创建子系统（支持四层以上递归嵌套）。\n' +
    '2. 在子系统中打开“三维播放器”观赏 24 号紫黄直升机演出或进入闭环飞行排演。\n' +
    '3. 打开“示例工作簿”后，可在任意深度子系统的“图表工作台”建立实时数据连接并投送回根桌面。\n' +
    '4. 打开 /Systems/<id>/kernel.nos 修改内核调度、系统调用、消息或文件规则，重启子系统即生效。\n'
  );
  putFile(
    '/Documents/最小三维场景示例.scene',
    JSON.stringify({
      format: 'nos-scene-v1',
      name: '最小示例场景（单物体+单灯光+单相机）',
      duration: 5,
      fps: 30,
      environment: { skyTop: '#1b2a4a', skyMid: '#2f4868', skyHorizon: '#d9a066', fogColor: '#c9a882', fogNear: 40, fogFar: 180 },
      lights: [{ id: 'sun', type: 'directional', color: '#fff4e0', intensity: 2.2, pos: [10, 20, 10], castShadow: true }],
      cameras: { cinematic: { pos: [0, 4.5, 10], target: [0, 1.2, 0], fov: 45 } },
      parts: [
        {
          id: 'cube1',
          name: '示例立方体',
          pos: [0, 1.2, 0],
          pickRadius: 1.6,
          subShapes: [
            { geom: { type: 'box', size: [2.2, 2.2, 2.2] }, material: { color: '#38bdf8', roughness: 0.32, metalness: 0.25 } },
          ],
        },
      ],
    }, null, 2)
  );

  // Install all NOS system & demo programs into VFS
  for (const [vfsPath, src] of Object.entries(nosSources)) {
    putFile(vfsPath, src);
  }

  // Seed compiled /sys/compiler.bc from /sys/compiler.nos
  if (nosSources['/sys/compiler.nos']) {
    const bc = compileNOS(nosSources['/sys/compiler.nos']);
    bc.compilerTag = 'NOS-SelfHost-1.0';
    putFile('/sys/compiler.bc', JSON.stringify(bc));
  }

  return vfs;
}

export function createSeedInnerVfs(outerVfs) {
  const seed = {};
  for (const [k, v] of Object.entries(outerVfs)) {
    if (
      k === '/' || k === '/sys' || k === '/apps' || k === '/Programs' ||
      k === '/Demo' || k === '/Documents' || k === '/Downloads' ||
      k === '/Systems' || k === '/Trash' ||
      k.startsWith('/sys/') || k.startsWith('/apps/') || k.startsWith('/Programs/') ||
      k === '/Demo/helicopter-24.scene' || k === '/Documents/最小三维场景示例.scene'
    ) {
      seed[k] = JSON.parse(JSON.stringify(v));
    }
  }
  return seed;
}
