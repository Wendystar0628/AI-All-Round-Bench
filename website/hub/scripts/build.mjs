// npm run build -> website/hub/dist (served at the site root /):
//   index.html  en/index.html  hub.css  hub.js  favicon.svg
//   fonts/Saira.ttf (+ licence, the hub's own fonts/)   logos/<name>.svg (platform/厂商图标/mark)
//   data/*.json from ONESHOT_SITE_DATA_DIR (publish.py sets it), else data/; data-local/ never goes into a build
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUB, LOGO_DIR, FONT_DIR, PAGES, loadConfig, renderPage, dataDir, read } from './render.mjs';

const out = join(HUB, 'dist');
const src = join(HUB, 'src');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const hash = (f) => createHash('sha1').update(read(f)).digest('hex').slice(0, 8);
for (const f of ['hub.css', 'hub.js', 'favicon.svg']) copyFileSync(join(src, f), join(out, f));
const v = { css: hash(join(src, 'hub.css')), js: hash(join(src, 'hub.js')), icon: hash(join(src, 'favicon.svg')) };

const cfg = await loadConfig();
for (const [lang, p] of Object.entries(PAGES)) {
  mkdirSync(join(out, p.path), { recursive: true });
  writeFileSync(join(out, p.path, 'index.html'), renderPage(lang, cfg, v));
}

mkdirSync(join(out, 'fonts'), { recursive: true });
for (const f of ['Saira.ttf', 'Saira-OFL.txt']) copyFileSync(join(FONT_DIR, f), join(out, 'fonts', f));

mkdirSync(join(out, 'logos'), { recursive: true });
for (const f of readdirSync(LOGO_DIR)) if (f.endsWith('.svg')) copyFileSync(join(LOGO_DIR, f), join(out, 'logos', f));

const data = dataDir({ dev: false });
let files = 0;
if (existsSync(data)) {
  mkdirSync(join(out, 'data'), { recursive: true });
  for (const f of readdirSync(data)) {
    if (!f.endsWith('.json')) continue;
    copyFileSync(join(data, f), join(out, 'data', f));
    files++;
  }
}
if (!existsSync(join(out, 'data', 'topics.json'))) console.warn(`[hub] no topics.json in ${data}: the page shows an empty list`);
console.log(`[hub] built ${out} (data: ${data}, ${files} file${files === 1 ? '' : 's'})`);
