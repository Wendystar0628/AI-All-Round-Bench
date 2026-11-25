"""骨架变换：作用在字的中线（连同轮廓上的点）上的整体变形——宽窄、高矮、重心、中宫、倾斜、缩放、平移。

每个变换是一个函数 f(pts, box) -> pts：pts 是 N×2 数组（字体单位，y 朝上），box 是这个字的字身框 (x0, y0, x1, y1)。
用在字上：Char.warp(f) 或 Word.warp(f)（每个字在自己的字身框里做）；几个变换串起来用 chain(f1, f2, …)。

    W.warp(chain(width(0.92), gravity(+30), center(0.15), slant(8)))

笔画的宽（标注里的 w）不跟着变：由中线重画（sweep）时粗细保持不变，只有位置和走向变；
直接用字体轮廓时，轮廓的点跟着变，所以宽窄、中宫这类变换会让笔画本身也跟着变粗变细。
骨架变换要在查和改笔画之前做（它立刻改掉字的轮廓、各笔切出来的形和中线）。
"""
import math
import numpy as np

__all__ = ['width', 'height', 'scale', 'move', 'slant', 'gravity', 'center', 'chain']


def _cx(box):
    return (box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0


def width(k, cx=None):
    """宽窄：横向按 k 缩放（k<1 变窄），绕 cx（默认字身框的竖中线）"""
    def f(P, box):
        c = _cx(box)[0] if cx is None else cx
        Q = np.array(P, float)
        Q[:, 0] = c + (Q[:, 0] - c) * k
        return Q
    return f


def height(k, cy=None):
    """高矮：竖向按 k 缩放，绕 cy（默认字身框的横中线）"""
    def f(P, box):
        c = _cx(box)[1] if cy is None else cy
        Q = np.array(P, float)
        Q[:, 1] = c + (Q[:, 1] - c) * k
        return Q
    return f


def scale(sx, sy=None, c=None):
    """整体缩放（字面率）：绕 c（默认字身框中心）"""
    sy = sx if sy is None else sy

    def f(P, box):
        cc = _cx(box) if c is None else c
        Q = np.array(P, float)
        Q[:, 0] = cc[0] + (Q[:, 0] - cc[0]) * sx
        Q[:, 1] = cc[1] + (Q[:, 1] - cc[1]) * sy
        return Q
    return f


def move(dx, dy):
    """整体平移"""
    def f(P, box):
        return np.array(P, float) + np.array([dx, dy], float)
    return f


def slant(deg, y0=0.0):
    """倾斜：x += tan(deg)·(y - y0)。deg>0 往右倾。y0 是不动的那条水平线（默认基线）。"""
    t = math.tan(math.radians(deg))

    def f(P, box):
        Q = np.array(P, float)
        Q[:, 0] = Q[:, 0] + t * (Q[:, 1] - y0)
        return Q
    return f


def _bump(t, c):
    """[0,1] 上的平滑重映射 t + c·t(1-t)（|c|<1 时单调），两端以外按端点斜率直线延伸"""
    out = t + c * t * (1 - t)
    lo, hi = t < 0, t > 1
    out = np.where(lo, t * (1 + c), out)
    out = np.where(hi, 1 + (t - 1) * (1 - c), out)
    return out


def gravity(dy, at=None):
    """重心：把高度 at（默认字身框的横中线）上下挪 dy（正数往上），字身框的上下沿不动，中间平滑过渡。"""
    def f(P, box):
        y0, y1 = box[1], box[3]
        H = y1 - y0
        a = (_cx(box)[1] if at is None else at)
        ta = (a - y0) / H
        tt = (a + dy - y0) / H
        c = (tt - ta) / max(1e-6, ta * (1 - ta))
        if abs(c) > 0.95:
            c = math.copysign(0.95, c)
            print(f'提醒：重心挪 {dy} 太多，已按最大可挪的量做')
        Q = np.array(P, float)
        Q[:, 1] = y0 + _bump((Q[:, 1] - y0) / H, c) * H
        return Q
    return f


def center(k, c=None):
    """中宫：k>0 收紧（字里的点往字心靠拢），k<0 放开（往四边推）。|k| 不超过 0.9。
    字身框的四边不动；c 是字心（默认字身框中心）。"""
    k = max(-0.9, min(0.9, k))

    def f(P, box):
        cc = _cx(box) if c is None else c
        Q = np.array(P, float)
        for ax, (lo, hi) in enumerate(((box[0], box[2]), (box[1], box[3]))):
            m = cc[ax]
            d = Q[:, ax] - m
            R = np.where(d >= 0, hi - m, m - lo)
            t = np.abs(d) / np.maximum(R, 1e-6)
            # t' = t - k·t(1-t)：k>0 往里收
            Q[:, ax] = m + np.sign(d) * _bump(t, -k) * R
        return Q
    return f


def chain(*fs):
    """几个变换按顺序做"""
    def f(P, box):
        for g in fs:
            P = g(P, box)
        return P
    return f
