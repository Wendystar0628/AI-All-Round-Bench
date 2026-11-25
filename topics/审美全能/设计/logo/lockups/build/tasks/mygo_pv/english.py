"""01《壱雫空》PV · 书名号和英文（舞台坐标，y 朝下）。英文只用 Didone 一家（Libre Bodoni 正体和斜体）。

  书名号    《》：两道折起来的雨线。每一臂都是一根收尖的雨丝，角度就是雨向（偏离竖直 RAIN_DEG）；
            顺着雨落方向（\）的那一臂略重，另一臂是发丝
  PV        大档：Didone 细斜体放大，放在第二段右边，比中文浅一档（天青的水彩字，背景档）
  底线带    A SINGLE DROP OF SKY：小型大写拉开字距，坐在水线上；水线末端一颗小水滴，再伸进画面（geo.out）
  环字      SUNSHOWER：太阳外圈上弧一行小字（像 1999 龙纹圆章外圈的字）
"""
import math
from lockupkit.geom import union, diff, inter, poly, move, text_path
from lockupkit.latin import text_on_circle, advance
from lockupkit import paths
from .letters import RAIN_DEG

DIDONE = paths.DIDONE
DIDONE_I = paths.DIDONE_I
_T = math.tan(math.radians(RAIN_DEG))


def needle_arm(a, b, w0, w1=0.25):
    """一臂雨丝：从 a（宽 w0）收到 b（宽 w1，几乎是尖）"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    pts = [(a[0] + nx * w0 / 2, a[1] + ny * w0 / 2), (b[0] + nx * w1 / 2, b[1] + ny * w1 / 2),
           (b[0] - nx * w1 / 2, b[1] - ny * w1 / 2), (a[0] - nx * w0 / 2, a[1] - ny * w0 / 2)]
    return poly(pts)


def chevron(xv, ym, h, side, heavy=3.3, light=1.8):
    """一道折角：顶点 (xv, ym)，两臂各沿雨向伸出 h/2。side=-1 是《（顶点在左），+1 是》（顶点在右）"""
    dx = -side * h / 2 * _T
    top, bot = (xv + dx, ym - h / 2), (xv + dx, ym + h / 2)
    v = (xv, ym)
    # 《：下臂从顶点往右下（\，雨落的方向）是重的；》：上臂从左上落到顶点（\）是重的
    if side < 0:
        return union(needle_arm(v, top, light), needle_arm(v, bot, heavy))
    return union(needle_arm(v, top, heavy), needle_arm(v, bot, light))


def bracket(xv, ym, h, side, gap=11):
    """书名号的一边：两道折角，里面那道短一截"""
    return union(chevron(xv, ym, h, side), chevron(xv - side * gap, ym, h * 0.82, side, heavy=2.4, light=1.4))


def pv(x, base, size, wght=400):
    """PV：细斜体，P 和 V 收紧一点"""
    p, w = text_path(DIDONE_I, 'P', size, x, base, location={'wght': wght})
    v, w2 = text_path(DIDONE_I, 'V', size, x + w - 0.07 * size, base, location={'wght': wght})
    return union(p, v), w + w2 - 0.07 * size


def slash(path, p0, gap=2.2, shift=(0.9, 3.2), up=150, down=120):
    """一处截断：一道雨丝顺着雨向斜穿过去，把字切开，右边那半被“水”折射着挪开一点（往下、往右）。
    返回 (切好的字, 雨丝)。p0 是雨丝经过的一点。"""
    dx, dy = _T, 1.0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = uy, -ux                       # 雨丝的右手边（往右上）
    a = (p0[0] - ux * 600, p0[1] - uy * 600)
    b = (p0[0] + ux * 600, p0[1] + uy * 600)
    right = poly([a, b, (b[0] - nx * 900, b[1] - ny * 900), (a[0] - nx * 900, a[1] - ny * 900)])
    band = poly([(a[0] + nx * gap / 2, a[1] + ny * gap / 2), (b[0] + nx * gap / 2, b[1] + ny * gap / 2),
                 (b[0] - nx * gap / 2, b[1] - ny * gap / 2), (a[0] - nx * gap / 2, a[1] - ny * gap / 2)])
    rp = move(inter(path, right), *shift)
    lp = diff(path, right)
    cut = diff(union(lp, rp), band)
    t0 = (p0[0] - ux * up, p0[1] - uy * up)
    t1 = (p0[0] + ux * down, p0[1] + uy * down)
    m = (p0[0] + ux * (down - up) * 0.2, p0[1] + uy * (down - up) * 0.2)
    line = union(needle_arm(m, t0, 1.5, 0.1), needle_arm(m, t1, 1.5, 0.1))
    return cut, line


def caps(x, base, size=13.5, track=0.34, text='A  SINGLE  DROP  OF  SKY'):
    return text_path(DIDONE, text, size, x, base, tracking=track, location={'wght': 500})


def caps_width(size=13.5, track=0.34, text='A  SINGLE  DROP  OF  SKY'):
    return advance(DIDONE, text, size, track, location={'wght': 500})


def ring_text(c, r, size=8.6, a0=-158, a1=-22):
    """太阳外圈上弧的小字（字头朝外，顺时针读）"""
    return text_on_circle(DIDONE, 'S U N S H O W E R', size, c[0], c[1], r, a0, a1, loc={'wght': 600})
