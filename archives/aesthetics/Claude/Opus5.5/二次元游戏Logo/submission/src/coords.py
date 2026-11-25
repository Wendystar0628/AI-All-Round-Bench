"""出坐标底图：每个字一张，标笔画时对着读坐标。"""
import os
import sys
from gb import Font, proof, WORK, fp

SETS = {
    'ef': ('SourceHanSansCN-Heavy.otf', '终末地明日方舟'),
    'sr': ('SourceHanSerifCN-Heavy.otf', '星穹铁道崩坏'),
    'ww': ('SourceHanSansCN-Medium.otf', '鸣潮'),
}
which = sys.argv[1:] or list(SETS)
for k in which:
    fn, text = SETS[k]
    F = Font(fp(fn))
    out = proof.coord_maps(F, text, os.path.join(WORK, 'coord', k))
    print(k, F.name, out)
