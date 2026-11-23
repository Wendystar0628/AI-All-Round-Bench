// 无头联调：在 Node 中启动一个子系统，检查内核、窗口管理器与应用是否真实运行
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
global.window = { require: createRequire(import.meta.url) };
for (const f of ['vm.js', 'nsl.js', 'util.js', 'nslruntime.js']) (0, eval)(fs.readFileSync(path.join(root, 'renderer/js', f), 'utf8'));
const NSL = window.NSL, NSLC = window.NSLC, RT = window.NSLRuntime;

const rt = new RT.Runtime();
const rootInst = rt.createRoot({});
const child = rt.createInstance(rootInst, 'inner-1');
child.screen = { w: 960, h: 620 };
const ksrc = rt.fixtureSource('Kernel.nsl');
const kc = NSLC.compile(ksrc, 'kernel');
if (kc.err) { console.error('内核编译失败', kc.err); process.exit(1); }
rt.startKernel(child, kc.prog);

const t0 = Date.now();
for (let i = 0; i < 900; i++) rt.tick(1 / 60);
const dt = Date.now() - t0;
console.log('tick 240 次耗时', dt, 'ms；状态', child.state, '错误', child.error);
console.log('进程数', Object.keys(child.procs).length, '内核指令', child.kernelWork, '内部工作', child.innerWork);
console.log('缓冲区', Object.keys(child.display.buffers));
const desk = child.display.buffers[Object.keys(child.display.buffers).find((k) => k.endsWith(':desktop'))];
if (desk) {
  console.log('桌面图元', desk.list.length, '前 12 个：');
  for (const op of desk.list.slice(0, 12)) console.log('   ', JSON.stringify(op).slice(0, 120));
} else console.log('没有桌面缓冲区');
// 各应用缓冲区
for (const k of Object.keys(child.display.buffers)) {
  if (k.endsWith(':main')) console.log('应用缓冲区', k, '图元', child.display.buffers[k].list.length);
}
console.log('进程表', JSON.stringify(rt.rawSyscall(child, 'proc_list', [])).slice(0, 600));
console.log('日志', JSON.stringify(rt.log.slice(0, 12)));
