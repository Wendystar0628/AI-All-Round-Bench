// 给网站预渲进光立绘（质感贯穿方案 1.4、4.1）：网页没法逐像素进光，就用视频模板的进光部件 VX.ae.relight 在各盏灯下预先渲好，网站只放成品图。
//   选手（观测者页、型号页）站在那轮日前：灯 sun，文件 players/<型号 id>.webp；评委（评委页）各在自己的灯下：文件 judges/<评委标识>.webp。
//   每张按原图大小渲，下半身化进雾里（透明），不带场景的暗角。portraits.json 记每张的来源、灯和尺寸，网站的同步脚本照它取。
// 运行：node topics/审美全能/设计/portraits/build.mjs（参测的型号、评委登记、进光参数变了就重跑）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../../../../videos/engine/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../../..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, ''));
const PORTRAITS = path.join(ROOT, 'videos/model_character/transparent');
const models = read('platform/型号.json'), entries = Object.keys(read('topics/审美全能/参测.json'));
const judges = read('videos/topics/aesthetics/judges/judges.json').judges;

const jobs = [
  ...entries.map(key => {
    const m = models.find(x => x.key === key);
    if (!m || !m.portrait) throw Error('型号登记里没有立绘：' + key);
    return { kind: 'players', id: m.id, key, portrait: m.portrait, light: 'sun' };
  }),
  ...judges.map(j => ({ kind: 'judges', id: j.id, key: j.model, portrait: j.portrait, light: j.id })),
];

const b = await launch({ entry: path.join(HERE, 'render.html'), width: 1920, height: 1080, ready: 'window.renderPortrait' });
const manifest = { note: '进光立绘（build.mjs 生成，不手改）', players: {}, judges: {} };
try {
  for (const k of ['players', 'judges']) fs.mkdirSync(path.join(HERE, k), { recursive: true });
  for (const j of jobs) {
    const src = pathToFileURL(path.join(PORTRAITS, j.portrait)).href;
    const r = await b.page.evaluate(`window.renderPortrait(${JSON.stringify(src)}, ${JSON.stringify(j.light)}, ${JSON.stringify(j.portrait)})`);
    const file = `${j.kind}/${j.id}.webp`;
    fs.writeFileSync(path.join(HERE, file), Buffer.from(r.data.split(',')[1], 'base64'));
    manifest[j.kind][j.kind === 'players' ? j.key : j.id] = { file, portrait: j.portrait, light: j.light, w: r.w, h: r.h };
    console.log(`${file}  ${r.w}×${r.h}  灯 ${j.light}`);
  }
  fs.writeFileSync(path.join(HERE, 'portraits.json'), JSON.stringify(manifest, null, 1) + '\n');
} finally {
  await b.close();
}
