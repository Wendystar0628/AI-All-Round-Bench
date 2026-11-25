"""画板：一题的锁定画在一块舞台坐标的画板上（左上 = 画板原点，单位是视频舞台像素），出图按 scale 倍（2 倍）。

    C = Canvas(1100, 520)          画板 1100×520 舞台像素，出 2200×1040 的图
    m = C.R(path)                  舞台坐标的轮廓 → 覆盖率（H×W，float32，0–1）
    C.px(3)                        3 个舞台像素在图上是几个像素（模糊半径、斜面宽都按它换算）
    C.XX, C.YY                     每个像素的舞台坐标
    r, th = C.polar((cx, cy))      每个像素到某点的距离、角度（舞台像素）
图层一律是预乘 RGBA（H×W×4，float32），用 fx 里的图层样式叠。
"""
import numpy as np
from .geom import raster


class Canvas:
    def __init__(self, w, h, scale=2):
        self.w, self.h, self.scale = int(w), int(h), int(scale)
        self.W, self.H = self.w * self.scale, self.h * self.scale
        self.M = (self.scale, 0, 0, self.scale, 0, 0)
        self._xy = None

    def R(self, path, ss=2):
        return raster(path, self.W, self.H, self.M, ss=ss)

    def px(self, v):
        return v * self.scale

    @property
    def XX(self):
        return self._grid()[0]

    @property
    def YY(self):
        return self._grid()[1]

    def _grid(self):
        if self._xy is None:
            yy, xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
            self._xy = (xx / self.scale, yy / self.scale)
        return self._xy

    def polar(self, c):
        dx, dy = self.XX - c[0], self.YY - c[1]
        return np.sqrt(dx * dx + dy * dy), np.arctan2(dy, dx)

    def empty(self):
        return np.zeros((self.H, self.W, 4), np.float32)

    def zeros(self):
        return np.zeros((self.H, self.W), np.float32)
