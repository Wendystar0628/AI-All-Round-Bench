"""画布与栅格化：一张画布定下像素尺寸和“版面坐标 → 像素”的变换，所有层都用它，保证对齐。

版面坐标：y 朝下，单位自己定（比如 1 单位 = 1 个设计像素）；字形用 Char.place() / geom.place() 从字体单位放进来。

    C = Canvas(1200, 480, scale=4)     版面 1200×480，出 4800×1920 的图
    m = C.R(path)                      版面坐标的轮廓 → 覆盖率（H×W，float32，0–1，抗锯齿）
    C.px(3)                            3 个版面单位是几个像素（模糊半径、描边宽都按它换算）
    C.XX, C.YY                         每个像素中心的版面坐标（做渐变、噪声场用）
    r, th = C.polar((cx, cy))          每个像素到某点的距离（版面单位）和角度
    C.empty() / C.zeros()              空图层（H×W×4）/ 空遮罩（H×W）
图层一律是预乘 RGBA（H×W×4，float32，0–1），图层样式见 fx。
"""
import numpy as np
import cv2
from .geom import flatten, simplify


def raster(p, W, H, M=(1, 0, 0, 1, 0, 0), ss=2):
    """把轮廓画成 H×W 的覆盖率（float32，0–1）。M 是 SVG 顺序的仿射（把轮廓坐标映到像素），ss 是超采样倍数。"""
    a, b, c, d, e, f = M
    q = simplify(p).transform(a * ss, b * ss, c * ss, d * ss, e * ss, f * ss)
    img = np.zeros((H * ss, W * ss), np.uint8)
    cs = flatten(q, tol=0.15)
    if cs:
        SH = 4
        arr = [np.round(cc * (1 << SH)).astype(np.int32).reshape(-1, 1, 2) for cc in cs]
        cv2.fillPoly(img, arr, 255, lineType=cv2.LINE_AA, shift=SH)
    if ss > 1:
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    return img.astype(np.float32) / 255.0


class Canvas:
    def __init__(self, w, h, scale=2.0, origin=(0.0, 0.0)):
        """版面 w×h（版面单位），origin 是画布左上角的版面坐标，scale 是每个版面单位几个像素"""
        self.w, self.h, self.scale = float(w), float(h), float(scale)
        self.ox, self.oy = map(float, origin)
        self.W, self.H = int(round(self.w * self.scale)), int(round(self.h * self.scale))
        self._xy = None

    def __repr__(self):
        return f'<Canvas 版面 {self.w:g}×{self.h:g} → {self.W}×{self.H} 像素>'

    @property
    def M(self):
        """版面坐标 → 像素的仿射（SVG 顺序）"""
        s = self.scale
        return (s, 0, 0, s, -self.ox * s, -self.oy * s)

    def R(self, path, ss=2):
        """版面坐标的轮廓 → 覆盖率"""
        return raster(path, self.W, self.H, self.M, ss=ss)

    def px(self, v):
        """版面长度 → 像素"""
        return v * self.scale

    def to_px(self, x, y):
        return ((x - self.ox) * self.scale, (y - self.oy) * self.scale)

    def to_layout(self, px, py):
        return (px / self.scale + self.ox, py / self.scale + self.oy)

    def _grid(self):
        if self._xy is None:
            yy, xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
            self._xy = ((xx + 0.5) / self.scale + self.ox, (yy + 0.5) / self.scale + self.oy)
        return self._xy

    @property
    def XX(self):
        return self._grid()[0]

    @property
    def YY(self):
        return self._grid()[1]

    def polar(self, c):
        dx, dy = self.XX - c[0], self.YY - c[1]
        return np.sqrt(dx * dx + dy * dy), np.arctan2(dy, dx)

    def empty(self):
        return np.zeros((self.H, self.W, 4), np.float32)

    def zeros(self):
        return np.zeros((self.H, self.W), np.float32)
