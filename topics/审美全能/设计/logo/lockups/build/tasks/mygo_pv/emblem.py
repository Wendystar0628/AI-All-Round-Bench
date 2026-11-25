"""01《壱雫空》PV · 主体元素：一轮被雨丝划过的太阳（舞台坐标，y 朝下）。“太阳雨”的两件事画在一个物件上。

由里往外：暖金的日核（水彩）· 一道发丝环 · 上弧环字 SUNSHOWER、下弧一串小珠 · 外发丝环 · 一圈针形光芒（长短相间，
四个正方位和四个斜方位最长，像 1999「抱子维和论」那一簇放射线和「回到融雪处」的冰晶）· 三道斜落的雨丝从日面前面划过
（雨向和雨字头的四滴一样），划过日面的那几段被照成金。
放法：插在「雫」和「空」之间的上方（「雫」的右上），「空」宀顶上那滴雨正从太阳下缘落下来；下缘的光芒压在「空」后面，
上缘的光芒顶出整块剪影。线宽按本题字的最细笔画。
"""
import math
import numpy as np
from lockupkit.geom import union, poly, circle, ring
from .letters import RAIN_DEG

_S = math.sin(math.radians(RAIN_DEG))
_C = math.cos(math.radians(RAIN_DEG))
RAIN_DIR = (_S, _C)            # 舞台坐标里往下落的方向（y 朝下）


def needle(cx, cy, ang, r0, r1, w):
    """一根针形光芒：从 r0（宽 w）收到 r1 的尖"""
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy, ux
    b0 = (cx + ux * r0 + nx * w / 2, cy + uy * r0 + ny * w / 2)
    b1 = (cx + ux * r0 - nx * w / 2, cy + uy * r0 - ny * w / 2)
    tip = (cx + ux * r1, cy + uy * r1)
    return poly([b0, tip, b1])


def spindle(head, length, w, r_head=0.0):
    """一道斜落的雨丝：上端是尖，往下渐粗到 w，下端一个小圆头（r_head>0 时）"""
    hx, hy = head
    tx, ty = hx - RAIN_DIR[0] * length, hy - RAIN_DIR[1] * length
    nx, ny = -RAIN_DIR[1], RAIN_DIR[0]
    pts = [(tx, ty), (hx + nx * w / 2, hy + ny * w / 2), (hx - nx * w / 2, hy - ny * w / 2)]
    p = poly(pts)
    if r_head > 0:
        p = union(p, circle(hx + RAIN_DIR[0] * r_head * 0.2, hy + RAIN_DIR[1] * r_head * 0.2, r_head))
    return p


def sun(c, hair, drop=None):
    """太阳的各部分（舞台坐标）。hair 是本题最细笔画的线宽。
    上半圈是光芒，下半圈是一排顺着雨向落下的雨丝（太阳雨：晴的一半、雨的一半在同一个物件上）；
    drop = (尖, 腹心, 半径)：「空」顶上那滴雨——正对它的那一道雨丝一直落到它的尖上，挡着它的几道让开。"""
    cx, cy = c
    e = {'c': c, 'R_core': 21.5, 'R_out': 92}
    e['core'] = circle(cx, cy, e['R_core'])
    e['ring1'] = ring(cx, cy, 27.5, 27.5 + hair * 0.8)
    e['ring2'] = ring(cx, cy, 45, 45 + hair)
    e['ring3'] = ring(cx, cy, 50.5, 50.5 + hair * 0.6)
    # 下弧一串小珠（和上弧的环字对称）
    beads = []
    for a in np.linspace(28, 152, 15):
        rr = 1.25 if abs(a - 90) > 8 else 2.0
        beads.append(circle(cx + 37 * math.cos(math.radians(a)), cy + 37 * math.sin(math.radians(a)), rr))
    e['beads'] = union(beads)
    # 上半圈的光芒：三档长短，正上、正左右最长，斜上次之
    rays = []
    for j in range(-12, 13):
        ang = -90 + j * 7.5
        if j % 12 == 0:
            r1, w = 92, hair * 2.4
        elif j % 6 == 0:
            r1, w = 80, hair * 2.0
        elif j % 2 == 0:
            r1, w = 70, hair * 1.5
        else:
            r1, w = 62, hair * 1.0
        rays.append(needle(cx, cy, ang, 55.5, r1, w))
    e['rays'] = union(rays)
    # 中长的光芒尖外一粒小珠（1999「抱子维和论」那簇放射线的珠点）
    e['ray_beads'] = union([circle(cx + 75.5 * math.cos(math.radians(-90 + j * 7.5)), cy + 75.5 * math.sin(math.radians(-90 + j * 7.5)), hair * 0.85)
                            for j in range(-12, 13) if j % 2 == 0 and j % 6 != 0])
    # 下半圈的雨：从外环下沿顺着雨向落下，中间长两边短，每道下端一颗小水滴
    rain, heads = [], []
    rng = np.random.default_rng(7)
    for a in np.arange(18, 163, 7.25):
        ar = math.radians(a)
        x0, y0 = cx + 53.5 * math.cos(ar), cy + 53.5 * math.sin(ar)
        L = 14 + 40 * math.sin(ar) ** 3 + rng.uniform(-5, 5)
        hit = False
        if drop is not None:
            (tx, ty), (dcx, dcy), dr = drop
            # 正对那滴雨的一道：长度正好落到它的尖
            t = (ty - y0) / RAIN_DIR[1]
            xe = x0 + RAIN_DIR[0] * t
            if abs(xe - tx) < 3.7 and t > 0:
                L, hit = t, True
            else:
                # 和那滴雨挨得太近的几道让开
                for k in np.linspace(0, 1, 12):
                    px_, py_ = x0 + RAIN_DIR[0] * L * k, y0 + RAIN_DIR[1] * L * k
                    if math.hypot(px_ - dcx, py_ - dcy) < dr + 7 or math.hypot(px_ - tx, py_ - ty) < 9:
                        L = None
                        break
        if L is None:
            continue
        hx, hy = x0 + RAIN_DIR[0] * L, y0 + RAIN_DIR[1] * L
        line = spindle((hx, hy), L, hair * 1.05)
        rain.append(line)
        if not hit:
            heads.append(circle(hx + RAIN_DIR[0] * 0.6, hy + RAIN_DIR[1] * 0.6, hair * (1.05 + 0.35 * math.sin(ar) ** 2)))
    e['rain'] = union(rain)
    e['heads'] = union(heads)
    # 两道细雨丝从日面前斜划过（被照成金白）
    e['streaks'] = []
    for off, L, top in ((-14, 150, -86), (16, 118, -64)):
        nx, ny = RAIN_DIR[1], -RAIN_DIR[0]
        x0, y0 = cx + nx * off, cy + ny * off
        tx, ty = x0 + RAIN_DIR[0] * top, y0 + RAIN_DIR[1] * top
        head = (tx + RAIN_DIR[0] * L, ty + RAIN_DIR[1] * L)
        e['streaks'].append(spindle(head, L, hair * 0.95))
    e['streaks'] = union(e['streaks'])
    return e
