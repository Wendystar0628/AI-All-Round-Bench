"""跑一题：几何 → 各层 → 出图（只写 lockups/<题key>/）→ 小形态 → 清单（排队写 lockups.js）→ 检查图。

模块（build/tasks/<题>/__init__.py）要交出：
  KEY        题 key（tokens.json directions[].key）
  CONCEPT    概念单（dict，字段见 tasks/_template/__init__.py；只给人看，也写进检查图目录的 概念单.json）
  ARTBOARD   (w, h) 画板，舞台像素。画板左上 = 锁定的原点；字块左边落在 x≈100、英文小档的基线落在 y≈422 时，
             介绍页按 1 倍摆（见 ae.js / title.js 的 lockupPlace）
  geometry(tok) -> G   全部矢量几何（舞台坐标）。必须有：
        'title'     排好版的 strokes.Title（检查图要画它的笔画）
        'text'      全部中文的轮廓（Path）：字块外框 box 由它算
        'baseline'  收底的那条基线（英文小档 / 底线带，舞台 y）；介绍页把它对到 y 422，点题短语排在下面
      可选：
        'tag'       编号小标的位置 {x, y}（默认字块左上角往上 52）
        'anchors'   {名字: [x, y]}：写进清单，代表画面、片头对齐用
        'geo'       运行时画的矢量几何线（ae.js AE.lockupStrokes：strokes 若干条、out 伸进画面的那一根）
        'star'      矢量星芒 {x, y, s, long, tall, a}（星芒画进图层时不要给）
        'enter'     几何线、星芒、编号小标的入场 {geo: {at, dur}, star: {…}, tag: {…}}（0–1，见 Layer）
  LAYERS     图层表，从后往前：[Layer(id, role, render, enter=…, pivot=…), …]
  small(tok) -> 小形态的字（见 small.py）
"""
import os
import json
import time
import numpy as np
from . import paths, output, small as SM, checks
from .canvas import Canvas

ROLES = {
    'plate': '底板：主题色暗调的撕边暗渍',
    'ghost': '背景巨字：压在中文后面的大号英文',
    'emblem': '主体元素：一件线稿或剪影的物件（可以拆成几层分别入场）',
    'line': '细线：几何线、轨、刻度（画进图层的；要伸进画面的那根走矢量 geo）',
    'text': '中文：艺术字连同它的图层样式',
    'hero': '签名字：单独换料的那个字（和主体元素同料）',
    'en': '英文：底线带、小档短语、环字',
    'glint': '星芒与高光：最后亮',
}
KINDS = ('fade', 'focus', 'slide', 'land', 'wipe', 'grow', 'turn', 'ignite', 'flash', 'trace')


class Layer:
    """一层。
    role   见 ROLES（网站和视频按 role 找“要读的字”算摆放、在 text 前插字后的几何线）
    render fn(C, G, tok) -> 预乘 RGBA（C 是画板，canvas.Canvas）
    enter  入场（必写）：{'at': 起点, 'dur': 时长（都是 0–1，占这件锁定整段入场的比例；片头一格 0.8 秒、介绍页 2.4 秒）,
                  'kind': 入场方式, 其余参数随 kind 定}
             kind 是 ae.js 登记的入场方式：内置 fade 淡入 · focus 从虚到实 · slide 横移淡入 · land 落定 · wipe 擦出 · grow 化开 ·
             turn 绕一点转进来 · ignite 由暗到亮 · flash 一闪 · trace 绕一点转一圈画出来；
             各题自己的名字带题前缀（'mecha-power'），在 ae.js「各题的入场方式」一段用 AE.lockupKind 登记
           任何 kind 都能带 'sweep': {'at', 'dur'} 形状里扫过一道光、'steps': N 进度按 N 格跳
    pivot  [x, y]（舞台坐标）：转、缩绕的点（kind 没给 from 时用它）
    """

    def __init__(self, id, role, render, enter=None, pivot=None, note=''):
        if role not in ROLES:
            raise ValueError(f'{id}：role 只能是 {"、".join(ROLES)}')
        k = enter.get('kind') if enter else None
        if k not in KINDS and not (isinstance(k, str) and '-' in k.strip('-')):
            raise ValueError(f'{id}：入场 kind 是内置的 {"、".join(KINDS)}，或 ae.js「各题的入场方式」里登记的带题前缀的名字（如 mecha-clamp）')
        self.id, self.role, self.render, self.enter, self.pivot, self.note = id, role, render, enter, pivot, note


def _r(v, n=1):
    if isinstance(v, (list, tuple)):
        return [_r(x, n) for x in v]
    if isinstance(v, dict):
        return {k: _r(x, n) for k, x in v.items()}
    if isinstance(v, (float, np.floating)):
        return round(float(v), n)
    if isinstance(v, np.integer):
        return int(v)
    return v


def run(mod, forms=True, check=True, quiet=False, preview=False):
    """preview=True：只出检查图（成品、检查图、分层、笔画），不写 lockups/ 和 lockups.js"""
    t0 = time.time()
    key = mod.KEY
    tok = paths.direction(key)
    W, H = mod.ARTBOARD
    C = Canvas(W, H)
    G = mod.geometry(tok)
    for need in ('title', 'text', 'baseline'):
        if need not in G:
            raise KeyError(f'geometry() 要交出 {need}（见 lockupkit/run.py 的说明）')
    if G.get('star') is not None and not (isinstance(G['star'], dict) and {'x', 'y', 's'} <= set(G['star'])):
        raise ValueError("G['star'] 是矢量星芒 {x, y, s, long, tall, a}；星芒画进图层时不要给，别的锚点放 anchors")
    L = {}
    for ly in mod.LAYERS:
        t1 = time.time()
        L[ly.id] = ly.render(C, G, tok)
        if not quiet:
            print(f'  {ly.id:<10} {time.time() - t1:5.1f} 秒')
    if preview:
        spec = mod.small(tok) if forms else None
        fr = {}
        if spec:
            for name in SM.TONES:
                Lf, Cf = SM.render(spec, name, tok)
                c = output.crop(Lf, Cf.scale)
                fr[name] = c[0]
        out = checks.write(key, L, mod.LAYERS, tok, G.get('title'), fr)
        print(f'预览（没写 lockups/ 和清单）：{out}，{time.time() - t0:.1f} 秒')
        return None, L, G
    # ---- 图层：只写这一题自己的目录
    d = output.task_dir(key)
    keep = set()
    items = []
    for z, ly in enumerate(mod.LAYERS):
        c = output.crop(L[ly.id], C.scale)
        if c is None:
            continue
        img, x, y, w, h = c
        output.save_layer(img, os.path.join(d, ly.id + '.png'))
        keep |= {ly.id + '.png', ly.id + '.webp'}
        it = {'id': ly.id, 'role': ly.role, 'file': f'{key}/{ly.id}.png', 'x': x, 'y': y, 'w': w, 'h': h}
        if ly.enter:
            it['enter'] = _r(ly.enter, 3)
        if ly.pivot is not None:
            it['pivot'] = _r(list(ly.pivot), 2)
        items.append(it)
    # ---- 小形态
    prev = output.read_manifest()['items'].get(key, {})
    forms_rgba = {}
    if forms:
        spec = mod.small(tok)

        def save(name, Lf, scale):
            c = output.crop(Lf, scale)
            img, x, y, w, h = c
            output.save_layer(img, os.path.join(d, name + '.png'))
            keep.update({name + '.png', name + '.webp'})
            forms_rgba[name] = img
            return {'file': f'{key}/{name}.png', 'w': w, 'h': h}
        fm = SM.forms(spec, tok, save)
    else:
        fm = prev.get('forms', {})
        keep |= {os.path.basename(v['file']) for v in fm.values()} | {os.path.basename(v['file'])[:-4] + '.webp' for v in fm.values()}
    output.prune(key, keep)
    # ---- 清单这一项
    tb = G['text'].bounds
    box = [round(tb[0], 1), round(tb[1], 1), round(tb[2], 1), round(tb[3], 1)]
    tag = G.get('tag') or {'x': round(tb[0] + 2), 'y': round(tb[1] - 52)}
    if tok.get('ground') == 'light' and 'tone' not in tag:
        tag = dict(tag, tone='ink')
    item = {'w': W, 'h': H, 'ground': tok.get('ground', 'dark'), 'box': box, 'baseline': _r(G['baseline'], 1), 'tag': _r(tag, 1)}
    for k in ('star', 'geo', 'anchors', 'enter'):
        if G.get(k):
            item[k] = _r(G[k], 2)
    item['layers'] = items
    item['forms'] = fm
    output.update_manifest(key, item)
    if not quiet:
        print(f'{key}：{len(items)} 层，写进 lockups/{key}/ 和 lockups.js，{time.time() - t0:.1f} 秒')
    # ---- 检查图
    if check:
        if not forms_rgba:
            from PIL import Image
            for name, v in fm.items():
                p = os.path.join(paths.LOCKUPS, v['file'])
                if os.path.exists(p):
                    a = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255
                    forms_rgba[name] = np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], -1)
        out = checks.write(key, L, mod.LAYERS, tok, G.get('title'), forms_rgba)
        with open(os.path.join(out, '概念单.json'), 'w', encoding='utf-8') as f:
            json.dump(getattr(mod, 'CONCEPT', {}), f, ensure_ascii=False, indent=1)
        if not quiet:
            print(f'检查图：{out}')
    return item, L, G
