"""共用：引入字形底座，路径常量。"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, '素材', '字形底座'))
try:
    sys.stdout.reconfigure(errors='replace')
except Exception:
    pass

import glyphbase as gbase  # noqa: E402,F401
from glyphbase import Font, Word, Char, S, Canvas  # noqa: E402,F401
from glyphbase import geom as G, skeleton as sk, proof, fx, output, latin  # noqa: E402,F401

def _outline_decomposed(self, ch):
    """同 Font.outline，但把复合字形（标点、带重音的字母常见）拆开再画"""
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    from glyphbase.geom import Path, simplify
    if ch not in self._outlines:
        g = self.gs[self.gname(ch)]
        rec = DecomposingRecordingPen(self.gs)
        g.draw(rec)
        p = Path()
        rec.replay(p.getPen())
        if self.k != 1.0:
            p = p.transform(self.k, 0, 0, self.k, 0, 0)
        self._outlines[ch] = simplify(p)
    return Path(self._outlines[ch])


Font.outline = _outline_decomposed

FONTS = r'C:\Windows\Fonts'
WORK = os.path.join(ROOT, 'work')
LOGOS = os.path.join(ROOT, 'logos')
WEB = os.path.join(ROOT, 'web')


def fp(name):
    return os.path.join(FONTS, name)
