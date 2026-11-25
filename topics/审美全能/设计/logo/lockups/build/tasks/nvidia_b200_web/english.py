"""04 · 英文（舞台坐标）。只用一类字体：Didone（Libre Bodoni）。

  主字       B200 本身就是英文（b200.py 画的「走线 Didone」）
  帽线小型大写 NVIDIA：小号大写拉开字距，坐在 B200 帽线上那一小段走线上（像电路板上一个元件的丝印名）
  底线带     WEB ART · ETCHED IN LIGHT：小号大写拉开字距，挂在基线走线底下（WEB ART 是「网页艺术」的英文，ETCHED IN LIGHT 是概念：光刻出来的）
  丝印位号   U1（第二个 0 里那颗晶粒）、D1（信号灯）：电路板上元件旁边的小号，最小一档，几乎是纹理
  晶圆刻字   沿晶圆外缘里面一圈小字（晶圆上激光刻的批号），像 1999《湖的启示》龙纹圆章外圈的字
"""
from lockupkit.latin import text_path, advance, text_on_circle
from lockupkit import paths

DIDONE = paths.DIDONE


def nvidia(x, base, size=17.0, track=0.46):
    p, w = text_path(DIDONE, 'NVIDIA', size, x, base, tracking=track, location={'wght': 560})
    return p, w


def band(x, base, size=12.5, track=0.36):
    p, w = text_path(DIDONE, 'WEB  ART  ·  ETCHED  IN  LIGHT', size, x, base, tracking=track, location={'wght': 520})
    return p, w


def refdes(text, x, base, size=8.6, track=0.12):
    p, w = text_path(DIDONE, text, size, x, base, tracking=track, location={'wght': 600})
    return p, w


def width(text, size, track, wght=520):
    return advance(DIDONE, text, size, track, {'wght': wght})


def wafer_ring(c, r, size=7.6):
    """晶圆外缘里面一圈激光刻的小字：上弧，字头朝外，顺时针读，停在缺口前面"""
    return text_on_circle(DIDONE, 'LOT 04  ·  B200  ·  ETCHED IN LIGHT  ·  ONE DIE, EVERY IMAGE', size, c[0], c[1], r, -172, -62,
                          loc={'wght': 560})
