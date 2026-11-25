"""颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。C 是画板（lockupkit/canvas.py），图层样式在 lockupkit/fx.py。

颜色按角色分（报告 2.4）：字面色（读）· 主题色（底板、主体元素）· 阴影（主题色暗调，不用纯黑）· 高光 · 点缀色（只给高潮、主字、
首字母或一个英文词，一处为主，一两处呼应，和主体元素同色）· 共用金属。tok 是 tokens.json 里这一题的配色。样板 tasks/harbor_mecha/layers.py。
"""
from lockupkit import fx as F


def render_plate(C, G, tok):
    """底板：托在字后面的一团主题色暗渍，边被噪声吃进去"""
    m = F.blur(C.R(G['text']), C.px(26))
    n = F.fbm(C.H, C.W, 80, 1, octaves=5)
    a = F.smoothstep(0.12, 0.45, m * 1.8 + (n - 0.5) * 0.35) * F.smoothstep(0.02, 0.15, m)
    deep = tok['worldDeep'] if tok.get('ground') != 'light' else tok['worldPale']
    return F.solid(a * 0.9, F.mix(F.rgb(deep), F.rgb(tok['world']), 0.3))


def render_text(C, G, tok):
    """字：平的字面色，身下一圈短而实的暗"""
    A = C.R(G['text'], ss=3)
    seat = F.drop_shadow(A, 0, C.px(2), C.px(2.5))
    shadow = tok['worldDeep'] if tok.get('ground') != 'light' else tok['world']
    return F.stack([F.solid(seat * 0.6, shadow), F.solid(A, tok['ink'])])


def render_en(C, G, tok):
    return F.solid(C.R(G['caps'], ss=3) * 0.85, tok['light'])
