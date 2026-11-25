"""字体：打开字体文件，取一个字的轮廓和度量，排一行字，找能覆盖某几个字的字体。

统一的字体单位：不管字体自己的 unitsPerEm 是多少，这里一律换算到 1000 em，y 朝上，基线 0。

    F = Font(r'C:\\Windows\\Fonts\\NotoSerifSC-VF.ttf', wght=700)      可变字体按轴取实例
    F = Font(r'C:\\Windows\\Fonts\\msyh.ttc', index=1)                 TTC 带索引
    p = F.outline('永')            轮廓（Path，已化简：重叠的轮廓并起来，序号和坐标底图一致）
    F.advance('永')                步进宽
    F.metrics('永')                {advance, lsb, bounds, glyph}
    F.vmetrics                     {ascender, descender, line_gap, cap_height, x_height}
    F.em_box('永')                 这个字的字身框 (x0, y0, x1, y1)
    F.kern('A', 'V')               一对字的字偶距（GPOS 的 kern 特性或旧的 kern 表；没有就 0）
    p, w = F.line('Sample', tracking=0.05, kern=True)   一行字（字体单位），返回轮廓和总宽
    find_fonts('永字') -> [{path, index, name, axes}, …]   C:\\Windows\\Fonts 里能覆盖这几个字的字体
"""
import os
import struct
from fontTools.ttLib import TTFont
from .geom import Path, simplify, move

FONT_DIR = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts')


class Font:
    """一个字体（一个文件里的一款；可变字体是其中一个实例）。"""

    def __init__(self, path, index=0, location=None, **axes):
        self.path = str(path)
        self.index = int(index)
        self.tt = TTFont(self.path, fontNumber=self.index, lazy=True) if self.path.lower().endswith(('.ttc', '.otc')) \
            else TTFont(self.path, lazy=True)
        self.location = dict(location or {}, **axes) or None
        if self.location and 'fvar' not in self.tt:
            raise ValueError(f'{os.path.basename(self.path)} 不是可变字体，不能按轴取实例：{self.location}')
        if self.location:
            tags = {a.axisTag for a in self.tt['fvar'].axes}
            bad = set(self.location) - tags
            if bad:
                raise ValueError(f'{os.path.basename(self.path)} 没有这些轴：{bad}（有 {sorted(tags)}）')
        self.upm = self.tt['head'].unitsPerEm
        self.k = 1000.0 / self.upm
        self.cmap = self.tt.getBestCmap() or {}
        self.gs = self.tt.getGlyphSet(location=self.location) if self.location else self.tt.getGlyphSet()
        self._outlines = {}
        self._kern = None

    def __repr__(self):
        return f'<Font {self.name}>'

    # ---------------------------------------------------------------- 名字与轴
    def _nm(self, *ids):
        nt = self.tt['name']
        for i in ids:
            s = nt.getDebugName(i)
            if s:
                return s
        return ''

    @property
    def family(self):
        return self._nm(16, 1)

    @property
    def style(self):
        return self._nm(17, 2)

    @property
    def name(self):
        if self.location:   # 可变字体的实例：字体名里的字重是默认实例的，不写，写轴的取值
            return f'{self.family} ' + ','.join(f'{k}={v:g}' for k, v in self.location.items())
        return f'{self.family} {self.style}'.strip()

    @property
    def axes(self):
        """可变字体的轴：[(标签, 最小, 默认, 最大)]；不是可变字体给 []"""
        if 'fvar' not in self.tt:
            return []
        return [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in self.tt['fvar'].axes]

    @property
    def instances(self):
        """可变字体的命名实例：[(名字, {轴: 值})]"""
        if 'fvar' not in self.tt:
            return []
        nt = self.tt['name']
        return [(nt.getDebugName(i.subfamilyNameID) or '', dict(i.coordinates)) for i in self.tt['fvar'].instances]

    # ---------------------------------------------------------------- 字
    def has(self, ch):
        return ord(ch) in self.cmap

    def missing(self, text):
        """text 里这款字体没有的字"""
        return [c for c in dict.fromkeys(text) if not c.isspace() and ord(c) not in self.cmap]

    def gname(self, ch):
        """字 → 字形名；也可以直接给字形名（多于一个字符时按字形名处理）"""
        if len(ch) == 1:
            if ord(ch) not in self.cmap:
                raise KeyError(f'{self.name} 里没有「{ch}」')
            return self.cmap[ord(ch)]
        if ch not in self.gs:
            raise KeyError(f'{self.name} 里没有字形 {ch}')
        return ch

    def outline(self, ch):
        """一个字的轮廓：1000 em，y 朝上，基线 0。重叠的轮廓已经并起来（可变字体常有重叠），
        轮廓序号和坐标底图上的 c0 c1……一致。返回新的 Path（改它不影响缓存）。"""
        if ch not in self._outlines:
            g = self.gs[self.gname(ch)]
            p = Path()
            g.draw(p.getPen())
            if self.k != 1.0:
                p = p.transform(self.k, 0, 0, self.k, 0, 0)
            self._outlines[ch] = simplify(p)
        return Path(self._outlines[ch])

    def advance(self, ch):
        """步进宽（1000 em）"""
        return self.gs[self.gname(ch)].width * self.k

    def metrics(self, ch):
        """{advance 步进, lsb 左边距, bounds 墨迹外框 (x0, y0, x1, y1) 或 None, glyph 字形名}"""
        p = self.outline(ch)
        b = tuple(p.bounds) if list(p) else None
        return {'advance': self.advance(ch), 'lsb': b[0] if b else 0.0, 'bounds': b, 'glyph': self.gname(ch)}

    @property
    def vmetrics(self):
        """竖向度量（1000 em）：ascender、descender（负数）、line_gap、cap_height、x_height（字体没写的给 None）"""
        os2 = self.tt['OS/2'] if 'OS/2' in self.tt else None
        hh = self.tt['hhea']
        asc = os2.sTypoAscender if os2 else hh.ascent
        desc = os2.sTypoDescender if os2 else hh.descent
        gap = os2.sTypoLineGap if os2 else hh.lineGap
        cap = getattr(os2, 'sCapHeight', None) if os2 and os2.version >= 2 else None
        xh = getattr(os2, 'sxHeight', None) if os2 and os2.version >= 2 else None
        f = self.k
        return {'ascender': asc * f, 'descender': desc * f, 'line_gap': gap * f,
                'cap_height': cap * f if cap else None, 'x_height': xh * f if xh else None}

    def em_box(self, ch=None):
        """字身框 (0, 下沿, 步进, 下沿 + 1000)：下沿取字体的 descender（中文字体一般是 -120）。"""
        d = self.vmetrics['descender']
        adv = self.advance(ch) if ch else 1000.0
        return (0.0, d, adv, d + 1000.0)

    # ---------------------------------------------------------------- 字偶距
    def _load_kern(self):
        lookups = []
        if 'GPOS' in self.tt:
            g = self.tt['GPOS'].table
            if g.FeatureList and g.LookupList:
                feats = g.FeatureList.FeatureRecord
                idx = set()
                if g.ScriptList:
                    recs = {r.ScriptTag: r for r in g.ScriptList.ScriptRecord}
                    for tag in ('latn', 'DFLT'):
                        r = recs.get(tag)
                        if r and r.Script.DefaultLangSys:
                            idx = {i for i in r.Script.DefaultLangSys.FeatureIndex if feats[i].FeatureTag == 'kern'}
                            if idx:
                                break
                if not idx:
                    idx = {i for i, f in enumerate(feats) if f.FeatureTag == 'kern'}
                li = sorted({j for i in idx for j in feats[i].Feature.LookupListIndex})
                for j in li:
                    lk = g.LookupList.Lookup[j]
                    subs = []
                    for st in lk.SubTable:
                        if lk.LookupType == 9:
                            if st.ExtensionLookupType != 2:
                                continue
                            st = st.ExtSubTable
                        elif lk.LookupType != 2:
                            continue
                        subs.append(_pairpos(st))
                    if subs:
                        lookups.append(subs)
        if not lookups and 'kern' in self.tt:
            table = {}
            for kt in self.tt['kern'].kernTables:
                if hasattr(kt, 'kernTable'):
                    for pair, v in kt.kernTable.items():
                        table.setdefault(pair, v)
            lookups.append([lambda a, b, t=table: t.get((a, b))])
        self._kern = lookups

    def kern(self, a, b):
        """a 后面跟 b 时的字偶距（1000 em，负数是收紧）。可变字体取默认实例的值。"""
        if self._kern is None:
            self._load_kern()
        try:
            ga, gb = self.gname(a), self.gname(b)
        except KeyError:
            return 0.0
        tot = 0.0
        for subs in self._kern:
            for st in subs:
                v = st(ga, gb)
                if v is not None:
                    tot += v
                    break
        return tot * self.k

    # ---------------------------------------------------------------- 排一行
    def layout(self, text, tracking=0.0, kern=True):
        """一行字的位置：[(字, x)]（1000 em）和总宽。tracking 是字距，以 em 计（0.1 = 每个字后面加 100）。
        字体里没有的字跳过（打一行提醒）。"""
        out = []
        x = 0.0
        miss = self.missing(text)
        if miss:
            print(f'提醒：{self.name} 里没有 {"".join(miss)}，跳过')
        chars = [c for c in text if c.isspace() or ord(c) in self.cmap]
        for i, c in enumerate(chars):
            out.append((c, x))
            if c.isspace() and ord(c) not in self.cmap:
                x += 250.0
            else:
                x += self.advance(c)
            if i < len(chars) - 1:
                x += tracking * 1000.0
                if kern:
                    x += self.kern(c, chars[i + 1])
        return out, x

    def line(self, text, tracking=0.0, kern=True):
        """一行字的轮廓（1000 em，y 朝上，基线 0，从 x=0 起）和总宽"""
        pos, w = self.layout(text, tracking, kern)
        p = Path()
        for c, x in pos:
            if c.isspace():
                continue
            p.addPath(move(self.outline(c), x, 0))
        return simplify(p), w


def _pairpos(st):
    """GPOS 成对定位的一个子表 → 函数 (左字形名, 右字形名) -> 值 / None（这个子表不管这一对）"""
    cov = {g: i for i, g in enumerate(st.Coverage.glyphs)}
    if st.Format == 1:
        table = {}
        for g, i in cov.items():
            for rec in st.PairSet[i].PairValueRecord:
                v = getattr(rec.Value1, 'XAdvance', None) if rec.Value1 is not None else None
                table[(g, rec.SecondGlyph)] = v or 0
        return lambda a, b: table.get((a, b))
    if st.Format == 2:
        cd1 = st.ClassDef1.classDefs if st.ClassDef1 else {}
        cd2 = st.ClassDef2.classDefs if st.ClassDef2 else {}
        rows = st.Class1Record

        def f(a, b):
            if a not in cov:
                return None
            r = rows[cd1.get(a, 0)].Class2Record[cd2.get(b, 0)]
            v = getattr(r.Value1, 'XAdvance', None) if r.Value1 is not None else None
            return v or 0
        return f
    return lambda a, b: None


def _faces(path):
    """一个文件里有几款字体（TTC/OTC 读文件头）"""
    if path.lower().endswith(('.ttc', '.otc')):
        with open(path, 'rb') as f:
            head = f.read(12)
        if head[:4] == b'ttcf':
            return struct.unpack('>I', head[8:12])[0]
    return 1


def find_fonts(text, folder=FONT_DIR, verbose=False):
    """folder 里能覆盖 text 全部字（空白不算）的字体：[{path, index, name, family, style, axes}]。
    要读几百个文件的字符表，第一次会跑一会儿。"""
    need = {ord(c) for c in text if not c.isspace()}
    out = []
    files = sorted(os.listdir(folder))
    for fn in files:
        if not fn.lower().endswith(('.ttf', '.otf', '.ttc', '.otc')):
            continue
        path = os.path.join(folder, fn)
        try:
            n = _faces(path)
        except OSError:
            continue
        for i in range(n):
            try:
                tt = TTFont(path, fontNumber=i, lazy=True) if n > 1 or fn.lower().endswith(('.ttc', '.otc')) else TTFont(path, lazy=True)
                cmap = tt.getBestCmap() or {}
                if need <= set(cmap):
                    nt = tt['name']
                    fam = nt.getDebugName(16) or nt.getDebugName(1) or ''
                    sty = nt.getDebugName(17) or nt.getDebugName(2) or ''
                    axes = [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in tt['fvar'].axes] if 'fvar' in tt else []
                    out.append({'path': path, 'index': i, 'name': f'{fam} {sty}'.strip(), 'family': fam, 'style': sty, 'axes': axes})
                tt.close()
            except Exception as e:  # 坏文件、不认的格式：跳过
                if verbose:
                    print(f'跳过 {fn}#{i}：{e}')
    return out
