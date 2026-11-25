"""字形底座：做艺术字时都要用到的管道——取字形、几何、笔画数据、核对图、画布与栅格化、图层样式、输出。
不带任何风格；怎么设计由使用者决定。说明见上一级目录的 README.md。

模块：
  fonts      打开字体（TTF、OTF、TTC 带索引、可变字体按轴取实例），取轮廓和度量，排一行字，找能覆盖某几个字的字体
  geom       Path 的布尔、变换、外扩内缩、拆轮廓、拍平、点编辑、SVG 导入导出、基本形、沿中线扫笔画
  strokes    笔画标注 S()、字 Char、一组字 Word、查出来的一组笔画 Sel：切笔画、查、批量改、由中线重画
  skeleton   骨架变换：宽窄、高矮、重心、中宫、倾斜、缩放
  proof      核对图：坐标底图、笔画标注图、字形对照
  canvas     画布：像素尺寸和坐标变换（所有层共用），栅格化成覆盖率
  fx         图层样式：预乘图层、叠加和混合模式、渐变、模糊、距离场、斜面、受光边、内外阴影和发光、描边、投影、噪声、扩散
  output     分层 PNG、合成、黑白稿、检查图、分层展开图、SVG
  latin      西文：沿基线排字、沿圆弧排字
"""
from . import fonts, geom, strokes, skeleton, proof, canvas, fx, output, latin  # noqa: F401
from .fonts import Font, find_fonts  # noqa: F401
from .geom import Path  # noqa: F401
from .strokes import S, Char, Word, Sel, Stroke  # noqa: F401
from .canvas import Canvas, raster  # noqa: F401
