"""笔画处理（字体单位）：方言（全组规则）→ 一处同构高潮 → 同类笔画呼应。手术按写的顺序执行。

常用写法（全部见 lockupkit/strokes.py、lockupkit/surgery.py；样板 tasks/harbor_mecha/letters.py）：
    T.q(type='点').variant(lambda s: 新形)                      所有的点换成一个新形（呼应）
    T.q(end='down', free=True).op(foot, slant=-1)               收笔朝下、末端空着的竖：字脚一刀斜切（方言）
    T.q(lambda s: serif_apex(s) is not None).op(fin)            横末三角拔高（方言）
    T.s('甲5').op(某个手术) / T.s('甲5').variant(新形)            某一笔（高潮）
    T.s('甲5').extend(length=200, w1=6)                         某一笔顺着收笔方向延伸成线；末端记在 anchors
    T.op(thicken_h, d=6); T.op(facet, tol=7)                    每个字都做（加厚横画、曲线刻面）
detail='small' 是给小形态的：小了看不清的细节（分缝、长刀……）跳过。
"""
from lockupkit.strokes import Title
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_HEAVY
TEXT = '题名'


def letters(detail='full'):
    T = Title(FONT, TEXT, STROKES)
    return T
