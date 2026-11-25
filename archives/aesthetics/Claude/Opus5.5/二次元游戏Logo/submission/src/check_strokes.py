"""出笔画标注图核对：每组字一张，看没盖到的碎块（红色）。"""
import os
import sys
from gb import Font, Word, proof, WORK, fp
from strokes_data import EF_STROKES, SR_STROKES, WW_STROKES, FONTS

SETS = {
    'ef': (EF_STROKES, '终末地明日方舟'),
    'sr': (SR_STROKES, '星穹铁道崩坏'),
    'ww': (WW_STROKES, '鸣潮'),
}
which = sys.argv[1:] or list(SETS)
for k in which:
    data, text = SETS[k]
    F = Font(fp(FONTS[k]))
    W = Word(F, text, data)
    out = proof.stroke_map(W, os.path.join(WORK, f'stroke_map_{k}.png'))
    for g in W:
        print(k, g.label, f'{g.coverage():.2%}')
    print(out)
