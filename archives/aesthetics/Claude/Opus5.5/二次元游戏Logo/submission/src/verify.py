"""核对交付物：成品宽度、分层尺寸一致、黑白稿存在、网页素材齐全。"""
import os
import re
from PIL import Image
from gb import ROOT

ok = True
for name in ('终末地', '星穹铁道', '鸣潮'):
    d = os.path.join(ROOT, 'logos', name)
    fin = Image.open(os.path.join(d, 'final.png'))
    mono = Image.open(os.path.join(d, 'mono.png'))
    layers = sorted(os.listdir(os.path.join(d, 'layers')))
    sizes = {Image.open(os.path.join(d, 'layers', f)).size for f in layers}
    good = fin.size[0] >= 4000 and fin.mode == 'RGBA' and sizes == {fin.size}
    ok &= good
    print(f'{name}: final {fin.size} {fin.mode}  mono {mono.size}  layers {len(layers)} 尺寸一致={sizes == {fin.size}}  {"OK" if good else "!!"}')
    for f in layers:
        print('    ', f)
web = os.path.join(ROOT, 'web')
for k in ('ef', 'sr', 'ww'):
    js = open(os.path.join(web, f'data_{k}.js'), encoding='utf-8').read()
    files = re.findall(r'"file":"([^"]+)"', js)
    miss = [f for f in files if not os.path.exists(os.path.join(ROOT, f))]
    print(k, 'layers', len(files), 'missing', miss)
    ok &= not miss
print('ALL OK' if ok else 'PROBLEMS')
