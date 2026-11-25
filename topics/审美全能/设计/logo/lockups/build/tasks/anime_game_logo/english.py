"""10 二次元游戏Logo · 英文（舞台坐标）。两类字体：Didone（主字 Abril Fatface、底线带 Libre Bodoni），加校对员的手写（Caveat）。

  主字      Logo（latin.py）
  底线带    ANIME GAME LOGO · PROOF No. 10：英文题名加一句校样编号，大写拉开字距，挂在花饰托底的那一段发丝下面
            （介绍页下面一行点题短语已经是 a game's first impression，底线带不再重复它）
  斜穿手写  校对员的红笔批注 turn：从圈住 g 的红圈引出来，写在 Logo 右下的页边
"""
import os
from lockupkit.latin import text_path
from lockupkit import paths

CAVEAT = os.path.join(paths.FONTS, 'Caveat-Variable.ttf')
CAPS_TEXT = 'ANIME GAME LOGO · PROOF No. 10'


def caps(x, base, size=12.5, track=0.34):
    return text_path(paths.DIDONE, CAPS_TEXT.replace(' ', '  '), size, x, base, tracking=track, location={'wght': 500})


def hand(text, x, base, size=30, wght=600):
    return text_path(CAVEAT, text, size, x, base, tracking=0.0, location={'wght': wght})
