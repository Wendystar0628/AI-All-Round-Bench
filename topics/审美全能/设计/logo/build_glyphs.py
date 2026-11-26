# -*- coding: utf-8 -*-
"""
AI审美全能 · 标题字形生成器

字形表 glyphs.js（window.AE_GLYPHS）：
- titles：汇总页「十卷星图」和十道题的题名，整行排好的字形路径。页面用 AE.title() 画成平的纸白（或墨）。
- chars：上面这些字里每个汉字的逐个轮廓（字身 1000、y 向上、基线 0），题名锁定的旧生成器挖部件、换符号时用。
打印每个标题的宽度，核对用。

字标「AI审美全能」不在这里：它是画出来的艺术字，生成器是 wordmark/build/wordmark.py（产物 wordmark/wordmark.js 等）。

字体：中文 思源宋体 Heavy（900）；题名里的拉丁字母 Libre Bodoni（可变字重，在这里切成 wght 600 的静态实例）。全部是 ../fonts 里的 OFL 字体。

用法（项目根目录）：python topics/审美全能/设计/logo/build_glyphs.py
题名改了（如 Logo 题题面定稿后），改下面 TITLES 再跑一遍；题名锁定另用 lockups/build/ 重新生成。
"""
import json
import os
import re

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'fonts')

HEAVY = TTFont(os.path.join(FONTS, 'SourceHanSerifCN-Heavy.otf'))


def didone(wght):
    return instancer.instantiateVariableFont(TTFont(os.path.join(FONTS, 'LibreBodoni-Variable.ttf')), {'wght': wght})


DIDONE = didone(600)           # 题名里的拉丁字母
D_UPM = DIDONE['head'].unitsPerEm

LATIN_GAP = 80      # 拉丁字母与汉字之间约 0.08em
WORD_SPACE = 260    # 拉丁词之间的空格

TITLES = [
    {'key': 'ten-volumes', 'text': '十卷星图'},
    {'key': 'autumn-observatory', 'text': '秋庭观星画室'},
    {'key': 'agent-pv', 'text': '现代Agent概念PV'},
    {'key': 'greenhouse-render', 'text': '玻璃温室与花艺工作室'},
    {'key': 'nvidia-b200-web', 'text': 'NVIDIA B200 网页艺术'},
    {'key': 'sky-citadel', 'text': '天穹圣城'},
    {'key': 'pelican-22-styles', 'text': '鹈鹕的二十二种画法'},
    {'key': 'water-park', 'text': '晴空水上乐园'},
    {'key': 'harbor-mecha', 'text': '雨夜港口的巨型机甲'},
    {'key': 'floating-isles-game-ui', 'text': '浮空群岛传说游戏UI'},
    {'key': 'anime-game-logo', 'text': '二次元游戏Logo'},
]

def is_latin(ch):
    return ch.isascii() and ch != ' '


def contours_of(font, ch, scale=1.0):
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    rec = DecomposingRecordingPen(gs)
    gs[name].draw(rec)
    if scale != 1.0:
        out = DecomposingRecordingPen(gs)
        rec.replay(TransformPen(out, (scale, 0, 0, scale, 0, 0)))
        rec = out
    cs, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ('closePath', 'endPath'):
            cs.append(cur)
            cur = []
    if cur:
        cs.append(cur)
    return cs, gs[name].width * scale


def to_d(contours):
    pen = SVGPathPen(None)
    for c in contours:
        for op, args in c:
            getattr(pen, op)(*args)
    return re.sub(r'(\d+\.\d)\d+', r'\1', pen.getCommands())


def bbox(c):
    pts = [p for _, args in c for p in args]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))]


def font_of(ch):
    if not is_latin(ch):
        return HEAVY, 1.0, 'cn'
    return DIDONE, 1000 / D_UPM, 'didone'


def build(spec):
    text, key = spec['text'], spec['key']
    glyphs, x, prev = [], 0, None
    for ch in text:
        if ch == ' ':
            x += WORD_SPACE
            prev = 'space'
            continue
        font, scale, kind = font_of(ch)
        latin = kind == 'didone'
        if prev is not None and prev != 'space' and prev != latin:
            x += LATIN_GAP
        cs, adv = contours_of(font, ch, scale)
        glyphs.append({'ch': ch, 'x': round(x, 1), 'font': kind, 'd': to_d(cs)})
        x += adv
        prev = latin
    return {'text': text, 'w': round(x, 1), 'glyphs': glyphs}


def char_table():
    """所有标题里汉字的逐个轮廓：{ 字: { adv, c: [{ d, b }] } }，b 是该轮廓的包围盒 [x0, y0, x1, y1]。"""
    chars = {}
    for spec in TITLES:
        for ch in spec['text']:
            if is_latin(ch) or ch == ' ' or ch in chars:
                continue
            cs, adv = contours_of(HEAVY, ch)
            chars[ch] = {'adv': adv, 'c': [{'d': to_d([c]), 'b': bbox(c)} for c in cs]}
    return chars


def main():
    data = {'upm': 1000, 'ascent': 880, 'titles': {}, 'chars': char_table()}
    for spec in TITLES:
        data['titles'][spec['key']] = build(spec)
    js = ('/* 由 build_glyphs.py 生成，不要手改。字形坐标：1000 单位、y 向上、基线为 0。\n'
          '   中文：思源宋体 Heavy；拉丁字母：Libre Bodoni wght 600。均为 SIL OFL 1.1。字标「AI审美全能」不在这里，见 wordmark/wordmark.js。\n'
          '   titles：整行排好的标题；chars：每个汉字的逐个轮廓，b 是轮廓的包围盒。 */\n'
          'window.AE_GLYPHS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(os.path.join(HERE, 'glyphs.js'), 'w', encoding='utf-8', newline='\n').write(js)
    for k, v in data['titles'].items():
        print(k, v['w'])
    print('chars', len(data['chars']))


if __name__ == '__main__':
    main()
