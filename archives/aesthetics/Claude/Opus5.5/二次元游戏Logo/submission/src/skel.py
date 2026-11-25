"""读坐标的辅助图：字形 + 细化出的骨架线 + 每 50 一格的网格（每 100 标数）。
标笔画时对着骨架线读中线坐标。"""
import os
import sys
import numpy as np
import cv2
from PIL import Image, ImageDraw
from gb import Font, WORK, fp, proof
from glyphbase.canvas import raster


def thin(img):
    """Zhang-Suen 细化：img 为 0/1 的 uint8"""
    I = img.copy().astype(np.uint8)
    changed = True
    while changed:
        changed = False
        for step in range(2):
            P = np.pad(I, 1)
            p2 = P[:-2, 1:-1]; p3 = P[:-2, 2:]; p4 = P[1:-1, 2:]; p5 = P[2:, 2:]
            p6 = P[2:, 1:-1]; p7 = P[2:, :-2]; p8 = P[1:-1, :-2]; p9 = P[:-2, :-2]
            B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c1 = p2 * p4 * p6 == 0
                c2 = p4 * p6 * p8 == 0
            else:
                c1 = p2 * p4 * p8 == 0
                c2 = p2 * p6 * p8 == 0
            m = (I == 1) & (B >= 2) & (B <= 6) & (A == 1) & c1 & c2
            if m.any():
                I[m] = 0
                changed = True
    return I


def skel_map(p, path, title='', s=1.0):
    x0, x1, y0, y1 = -100, 1100, -200, 1000
    ml, mt = 50, 50
    W, H = int((x1 - x0) * s) + ml + 30, int((y1 - y0) * s) + mt + 20
    M = (s, 0, 0, -s, ml - x0 * s, mt + y1 * s)

    def P(x, y):
        return (ml + (x - x0) * s, mt + (y1 - y) * s)
    m = raster(p, W, H, M, ss=2)
    sk_ = thin((m > 0.5).astype(np.uint8))
    img = np.full((H, W, 3), 255, np.float32)
    img = img * (1 - m[..., None] * 0.35) + np.array([120, 120, 120]) * m[..., None] * 0.35
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    fnum = proof.label_font(12)
    for gx in range(x0, x1 + 1, 50):
        X = P(gx, 0)[0]
        major = gx % 100 == 0
        d.line([(X, mt), (X, H - 20)], fill=(110, 130, 230) if major else (215, 222, 250), width=1)
        if major:
            d.text((X + 2, mt - 16), str(gx), fill=(40, 60, 200), font=fnum)
    for gy in range(y0, y1 + 1, 50):
        Y = P(0, gy)[1]
        major = gy % 100 == 0
        d.line([(ml, Y), (W - 30, Y)], fill=(230, 130, 130) if major else (250, 222, 222), width=1)
        if major:
            d.text((4, Y - 8), str(gy), fill=(200, 40, 40), font=fnum)
    # 在格子里每 100 标一次小数字，读数不用数格
    for gx in range(0, 1001, 100):
        for gy in range(-100, 901, 100):
            X, Y = P(gx, gy)
            d.text((X + 2, Y + 1), f'{gx},{gy}', fill=(170, 170, 190), font=proof.label_font(9))
    arr = np.asarray(im).copy()
    ys, xs = np.nonzero(sk_)
    arr[ys, xs] = (0, 40, 200)
    # 骨架加粗一点
    k = np.zeros_like(sk_)
    k[ys, xs] = 1
    k = cv2.dilate(k, np.ones((2, 2), np.uint8))
    arr[k > 0] = (0, 40, 200)
    im = Image.fromarray(arr)
    d = ImageDraw.Draw(im)
    d.line([P(x0, 0), P(x1, 0)], fill=(220, 0, 0), width=1)
    if title:
        d.text((ml, 8), title, fill=(20, 20, 20), font=proof.label_font(20))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    return path


if __name__ == '__main__':
    SETS = {
        'ef': ('SourceHanSansCN-Heavy.otf', '终末地明日方舟'),
        'sr': ('SourceHanSerifCN-Heavy.otf', '星穹铁道崩坏'),
        'ww': ('SourceHanSansCN-Medium.otf', '鸣潮'),
    }
    which = sys.argv[1:] or list(SETS)
    for k in which:
        fn, text = SETS[k]
        F = Font(fp(fn))
        for ch in text:
            out = skel_map(F.outline(ch), os.path.join(WORK, 'skel', k, f'{ch}.png'), f'{ch}  {F.name}')
            print(out)
