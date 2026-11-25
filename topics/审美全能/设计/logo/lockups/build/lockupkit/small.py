"""小形态：迷你和书脊烫印，和全量锁定出自同一份笔画数据（模块的 small()）。

  mini         暗底（网站星座的悬停纸签、型号页节目单、作品展签暗底）：题名奶白，签名字用本题材质的小字号一档
  mini-ink     纸面（作品展签、节目单）：题名用墨
  stamp        深色的布（汇总页书脊）：题名奶白、压进布里一点；签名字烫本题材质
  stamp-ink    浅色的布：题名用墨
  stamp-blind  素压：只有压痕（没有作品的卷）

模块交出 small(tok) -> {
    'chars': [字体单位的 Path …]  一行的字，按顺序（字小，呼应的细节、伸出去的长笔画可以不要，只留方言最认得出的那一面）,
    'hero':  签名字的序号（没有签名字写 None）,
    'face':  fn(C, mask, tone) -> 预乘图层   签名字的面（材质）；不给时用点亮色平涂,
    'advance': 每个字的步进（em，默认 1）,
    'ink':   墨色的两种（mini-ink、stamp-ink）里题名用的墨（可选）。缺省：暗底题用铅印墨 LEAD_INK，亮底题用这一题的墨 tok['ink']；
             这一题的墨和它自己的布同色系（书脊上读不出）时交 LEAD_INK,
}
字号：普通字 56、签名字 ×1.42（舞台像素），一行排开；透明底，裁到不透明的范围，2 倍图。
"""
import numpy as np
from .canvas import Canvas
from . import fx as F

LEAD_INK = '#2B2723'   # 铅印的墨：中性的暖黑
PAPER = '#F1EADF'      # 铅印的纸白（亮底题的奶白字）
S = 56
HS = round(S * 1.42)
TONES = {'mini': 'white', 'mini-ink': 'ink', 'stamp': 'stamp', 'stamp-ink': 'stamp-ink', 'stamp-blind': 'blind'}


def layout(spec):
    """一行排开：返回 (画板宽, 高, [(Path 舞台坐标, 是不是签名字)])"""
    hero = spec.get('hero')
    adv = spec.get('advance') or [1.0] * len(spec['chars'])
    x = 12.0
    out = []
    for i, p in enumerate(spec['chars']):
        big = i == hero
        size = HS if big else S
        base = 8 + 0.88 * HS + (2.4 if big else 0)
        k = size / 1000.0
        out.append((p.transform(k, 0, 0, -k, x, base), big))
        x += size * adv[i] + (6 if big or (hero is not None and i + 1 == hero) else 0)
    return int(np.ceil(x + 12)), int(np.ceil(HS + 34)), out


def render(spec, form, tok):
    tone = TONES[form]
    W, H, items = layout(spec)
    C = Canvas(W, H)
    from .geom import union
    hero = C.R(union([p for p, big in items if big]), ss=3) if any(b for _, b in items) else C.zeros()
    rest = C.R(union([p for p, big in items if not big]), ss=3)
    allm = np.clip(hero + rest, 0, 1)
    dark_task = tok.get('ground') != 'light'
    paper = tok['ink'] if dark_task else PAPER
    ink = spec.get('ink') or (LEAD_INK if dark_task else tok['ink'])
    layers = []
    if tone == 'blind':
        layers.append(F.solid(allm * 0.16, '#000000'))
        layers.append(F.solid(F.blur(F.shift(allm, -C.px(1.2), -C.px(1.2)), C.px(0.8)) * 0.42, '#000000'))
        layers.append(F.solid(F.shift(allm, C.px(1.1), C.px(1.1)) * 0.22, '#FFF4E0'))
        out = F.stack(layers)
        out = out * (1 - 0.85 * allm)[..., None]
        return F.over(out, F.solid(allm * 0.18, '#000000')), C
    stamp = tone in ('stamp', 'stamp-ink')
    use_ink = tone in ('ink', 'stamp-ink')
    if stamp:
        layers.append(F.solid(F.blur(F.shift(allm, -C.px(1), -C.px(1)), C.px(0.8)) * 0.45, '#000000'))
    elif not use_ink:
        layers.append(F.solid(F.blur(F.shift(rest, 0, C.px(2)), C.px(3)) * 0.4, '#05070C'))
    col = ink if use_ink else paper
    # 题名：平的，往下退一点点（离光远处）
    t = np.clip((C.YY - 10) / (H - 20), 0, 1)[..., None]
    c0, c1 = F.rgb(col), F.mix(F.rgb(col), F.rgb('#000000' if not use_ink else '#FFFFFF'), 0.06)
    layers.append(F.solid(rest, c0 * (1 - t) + c1 * t))
    face = spec.get('face')
    if hero.max() > 0:
        layers.append(face(C, hero, tone) if face else F.solid(hero, tok['lit']))
    return F.stack(layers), C


def forms(spec, tok, save):
    """出五种小形态；save(名字, 图层, scale) 存图并返回 {file, w, h}"""
    out = {}
    for form in TONES:
        L, C = render(spec, form, tok)
        out[form] = save(form, L, C.scale)
    return out
