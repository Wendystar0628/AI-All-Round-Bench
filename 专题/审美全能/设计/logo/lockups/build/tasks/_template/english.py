"""英文（舞台坐标）：底线带必有，再选一两种用法；最多两类字体；和中文在至少两个维度上拉开，对齐中文的结构线。
样板 tasks/harbor_mecha/english.py（背景巨字、环字、底线带）。
"""
from lockupkit.latin import text_path
from lockupkit import paths


def caps(word, x, base, size=14, track=0.32):
    """底线带：小型大写拉开字距"""
    return text_path(paths.DIDONE, '  '.join(word.upper().split()), size, x, base, tracking=track, location={'wght': 500})
