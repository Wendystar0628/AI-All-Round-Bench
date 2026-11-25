"""题名锁定生成器（一题一个模块）。在项目根目录或任何地方运行都行：

  python topics/审美全能/设计/logo/lockups/build/lockup.py <题key>             出这一题：图层、小形态、清单这一项、检查图
  python …/lockup.py <题key> --preview                                      只出检查图看样子，不写 lockups/ 和清单
  python …/lockup.py <题key> --no-forms                                     不重出小形态（清单里沿用上次的），快一点
  python …/lockup.py <题key> --no-checks                                    不出检查图
  python …/lockup.py <题key> --strokes                                      只出笔画标注图（标笔画时用，几秒）
  python …/lockup.py --glyphs 字字字 [--font Heavy]                          出这几个字的坐标底图（字体单位网格 + 轮廓序号），标笔画时对着看
  python …/lockup.py --new <题key>                                          从模板建这一题的模块 tasks/<题key>/（连字符换成下划线）
  python …/lockup.py --list                                                 列出模块和清单里各题

只写 lockups/<题key>/ 和 lockups.js 里自己那一项（排队写），九题可以同时跑。说明见同目录 README.md。
依赖：Python 3、numpy、opencv-python、fonttools、skia-pathops、Pillow。
"""
import os
import sys
import shutil
import importlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lockupkit import paths  # noqa: E402


def module_name(key):
    return key.replace('-', '_')


def load(key):
    name = module_name(key)
    if not os.path.isdir(os.path.join(HERE, 'tasks', name)):
        sys.exit(f'没有这一题的模块：tasks/{name}/（先 python lockup.py --new {key}）')
    return importlib.import_module(f'tasks.{name}')


def glyph_sheet(chars, font, out):
    """坐标底图：每个字一张，字体单位网格（每 50 一根细线、100 一根粗线），标出每个轮廓的序号"""
    import numpy as np
    import cv2
    from lockupkit.geom import glyph, raster
    os.makedirs(out, exist_ok=True)
    S = 0.8
    for ch in chars:
        p, adv = glyph(font, ch)
        W = H = int(1150 * S)
        M = (S, 0, 0, -S, 75 * S, 975 * S)
        m = raster(p, W, H, M, ss=2)
        img = np.full((H, W, 3), 255, np.uint8)
        for gx in range(-50, 1051, 50):
            X = int((gx + 75) * S)
            cv2.line(img, (X, 0), (X, H), (0, 0, 230) if gx % 100 == 0 else (210, 210, 255), 1)
            if gx % 100 == 0:
                cv2.putText(img, str(gx), (X + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 200), 1)
        for gy in range(-150, 951, 50):
            Y = int((975 - gy) * S)
            cv2.line(img, (0, Y), (W, Y), (230, 0, 0) if gy % 100 == 0 else (255, 215, 215), 1)
            if gy % 100 == 0:
                cv2.putText(img, str(gy), (2, Y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 0, 0), 1)
        over = img.copy()
        over[m > 0.5] = (45, 45, 45)
        img = cv2.addWeighted(img, 0.35, over, 0.65, 0)
        for i, c in enumerate(p.contours):
            b = c.bounds
            cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            cv2.putText(img, f'c{i}', (int((cx + 75) * S), int((975 - cy) * S)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 170, 0), 1)
        f = os.path.join(out, f'{ch}.png')
        cv2.imencode('.png', img)[1].tofile(f)
        print(f'{ch}：{f}（轮廓 {len(list(p.contours))} 个，步进 {adv}）')


def new_module(key):
    paths.direction(key)   # 确认 tokens.json 里有这一题
    dst = os.path.join(HERE, 'tasks', module_name(key))
    if os.path.exists(dst):
        sys.exit(f'已经有了：{dst}')
    shutil.copytree(os.path.join(HERE, 'tasks', '_template'), dst, ignore=shutil.ignore_patterns('__pycache__'))
    d = paths.direction(key)
    for f, pairs in (('__init__.py', [("KEY = 'template'", f"KEY = '{key}'"), ('<编号> <题名>', f"{d['no']} {paths.title_of(key)}")]),
                     ('letters.py', [("TEXT = '题名'", f"TEXT = '{paths.title_of(key)}'")])):
        p = os.path.join(dst, f)
        s = open(p, encoding='utf-8').read()
        for a, b in pairs:
            s = s.replace(a, b)
        open(p, 'w', encoding='utf-8').write(s)
    print(f'建好了：{dst}\n下一步：python lockup.py --glyphs {paths.title_of(key)}  出坐标底图，在 strokes.py 里标笔画')


def list_all():
    from lockupkit import output
    m = output.read_manifest()
    mods = {d for d in os.listdir(os.path.join(HERE, 'tasks')) if not d.startswith(('_', '.'))}
    for k in paths.order():
        it = m['items'].get(k)
        src = '' if module_name(k) in mods else '（没有模块）'
        layers = ','.join(l['id'] for l in it['layers']) if it else '（清单里没有）'
        print(f'{k:<24} {layers} {src}')


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return
    if argv[0] == '--list':
        return list_all()
    if argv[0] == '--new':
        return new_module(argv[1])
    if argv[0] == '--glyphs':
        font = paths.SONG_HEAVY
        if '--font' in argv:
            font = os.path.join(paths.FONTS, f'SourceHanSerifCN-{argv[argv.index("--font") + 1]}.otf')
        return glyph_sheet(argv[1], font, os.path.join(paths.CHECKS, '_坐标底图'))
    key = argv[0]
    mod = load(key)
    if '--strokes' in argv:
        from lockupkit.strokes import Title
        from lockupkit import checks
        T = Title(getattr(mod, 'FONT', paths.SONG_HEAVY), mod.TEXT, mod.STROKES)
        out = os.path.join(paths.check_dir(key), '笔画.png')
        checks.stroke_map(T, out)
        for g in T:
            cov = g.coverage()
            if cov > 0.0005:
                print(f'  {g.label}：{cov:.1%} 没盖到（标注图里的红色），会自动归给最近的一笔')
        print(f'笔画标注图：{out}')
        return
    from lockupkit.run import run
    run(mod, forms='--no-forms' not in argv, check='--no-checks' not in argv, preview='--preview' in argv)


if __name__ == '__main__':
    main(sys.argv[1:])
