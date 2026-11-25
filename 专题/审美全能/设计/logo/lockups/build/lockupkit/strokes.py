"""笔画：标注格式、按条件查笔画、批量改、把一笔画成变体、把一笔延伸成线。

坐标是字体单位（1000 em，y 朝上，基线 0），和 geom.glyph() 一样；排进画板时再换成舞台像素（Glyph.place）。

—— 标注 ——
各题在自己模块的 strokes.py 里标，一个字一张表，按笔顺：

    from lockupkit.strokes import S
    STROKES = {
        '甲': [
            S('竖', '田', (170, 790), (170, 190), w=146),
            S('折', '田', (244, 737), (823, 737), (823, 200), w=(33, 150), name='横折'),
            S('横', '田', (244, 516), (748, 516), w=28),
            ...
        ],
    }

  S(类型, 部件, 中线上的点…, w=宽, name=全名, c=轮廓序号, pad=外扩, tags=标签)
    类型  横 竖 点 撇 捺 提 钩 折。复合笔画按收尾归类：横折、竖折、横撇归「折」，竖钩、横折钩、竖弯钩、横折弯钩归「钩」；name 写全名
    部件  这一笔属于哪个部件（氵、雨、亠、亻、田、木、口……）；同一题里叫法一致即可
    中线  从起笔到收笔、按书写方向的折线；折和钩在转折处加点
    w     宽：一个数，或每段一个（横折的横段细、竖段粗）
    c     这一笔正好是字形里一个独立轮廓时（多数分开写的点），写轮廓序号，取形最准；序号看 --strokes 出的标注图
    pad   切取区域比笔画宽多出的量，默认取宽的三成、至少 24。区域只用来从整字里切出这一笔，宽一点无妨
    tags  自定的标签，查询时用（例如 '长撇'、'主笔'）
  整字里没被任何一笔的区域盖到的碎块，自动归给离它最近的那一笔。`python lockup.py <题key> --strokes` 出标注图核对。

—— 查与改 ——
    T = Title(字体, '雨夜港口的巨型机甲', STROKES)
    T.q(type='点')                       所有的点
    T.q(type=('竖', '折'), end='down', free=True)   收笔朝下、末端不接别的笔画
    T.q(part='氵') / T.q(ch='港') / T.q(tag='长撇') / T.q(lambda s: s.length > 400)
    T.s('甲5') 或 T.s('甲', 5)            某一笔（字 + 笔序，从 1 数；同一个字出现两次时第二个写 '室#2.3'）
    T.sel('夜3', '型3')                   几笔
  Sel（查出来的一组笔画）上的批量改：
    .variant(fn)    把每一笔换成 fn(s) 画出的形（字体单位的 Path）：先把这一笔从字里拿掉，再补上新形
    .op(fn, **kw)   在每一笔所在的字上做一步手术 fn(path, s, **kw) -> path（surgery 里的斜切脚、鳍、分缝……）
    .add(fn) / .cut(fn)   补上、挖掉 fn(s) 画出的形
    .extend(...)    顺着收笔方向延伸成线（见 Stroke.extend）
    .exclude('型7') 去掉几笔；.q(...) 再筛
  手术按调用的顺序执行；整字的规则（加厚、刻面）用 T.op(fn) 加在每个字上。
"""
import math
import numpy as np
from . import geom
from .geom import union, diff, inter, slab, poly, Path

TYPES = ('横', '竖', '点', '撇', '捺', '提', '钩', '折')


def S(type, part, *pts, w, name=None, c=None, pad=None, tags=()):
    if type not in TYPES:
        raise ValueError(f'笔画类型只有 {"、".join(TYPES)}：{type}')
    if len(pts) < 2:
        raise ValueError(f'{part}{type}：中线至少两个点')
    return {'type': type, 'part': part, 'axis': [tuple(map(float, p)) for p in pts], 'w': w,
            'name': name or type, 'c': c, 'pad': pad, 'tags': tuple([tags] if isinstance(tags, str) else tags)}


def _unit(v):
    n = math.hypot(v[0], v[1])
    return np.array([v[0] / n, v[1] / n]) if n > 1e-9 else np.array([0.0, 0.0])


def dist_to_polyline(q, pts):
    q = np.asarray(q, float)
    best = 1e18
    for a, b in zip(pts[:-1], pts[1:]):
        ab = b - a
        L2 = float(ab @ ab)
        t = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, float((q - a) @ ab) / L2))
        best = min(best, float(np.linalg.norm(q - (a + ab * t))))
    return best


def _vertices(p):
    """轮廓上的落笔点（不含曲线控制点）"""
    out = []
    for verb, pts in p:
        if pts:
            out.append(pts[-1])
    return np.array(out, float) if out else np.zeros((0, 2))


DIRS = {'down': (0, -1), 'up': (0, 1), 'left': (-1, 0), 'right': (1, 0),
        'downleft': (-0.7071, -0.7071), 'downright': (0.7071, -0.7071), 'upleft': (-0.7071, 0.7071), 'upright': (0.7071, 0.7071)}


class Stroke:
    """一笔。axis 是中线（字体单位），ws 是每段的宽。几何量都在字体单位里；舞台坐标用 self.g.to_stage(点)。"""

    def __init__(self, glyph, n, spec):
        self.g = glyph
        self.n = n
        self.type = spec['type']
        self.name = spec['name']
        self.part = spec['part']
        self.tags = set(spec['tags'])
        self.c = spec['c']
        self.axis = np.array(spec['axis'], float)
        w = spec['w']
        self.ws = [float(v) for v in w] if isinstance(w, (list, tuple)) else [float(w)] * (len(self.axis) - 1)
        if len(self.ws) != len(self.axis) - 1:
            raise ValueError(f'{glyph.ch}{n}：w 要一个数，或每段一个（{len(self.axis) - 1} 段）')
        self.pad = spec['pad']
        self.piece = None   # 从整字里切出来的这一笔（Glyph 算）

    # ---------------------------------------------------------------- 名字
    @property
    def id(self):
        return f'{self.g.label}{self.n}'

    def __repr__(self):
        return f'<{self.id} {self.name} {self.part}>'

    # ---------------------------------------------------------------- 中线上的几何
    @property
    def seglens(self):
        return [float(np.linalg.norm(b - a)) for a, b in zip(self.axis[:-1], self.axis[1:])]

    @property
    def length(self):
        return sum(self.seglens)

    def _locate(self, t):
        L = self.length * max(0.0, min(1.0, t))
        acc = 0.0
        for k, sl in enumerate(self.seglens):
            if acc + sl >= L or k == len(self.seglens) - 1:
                return k, (L - acc) / sl if sl > 1e-9 else 0.0
            acc += sl
        return len(self.seglens) - 1, 1.0

    def point(self, t):
        """中线上按长度比例 t（0 起笔，1 收笔）的点"""
        k, u = self._locate(t)
        a, b = self.axis[k], self.axis[k + 1]
        return a + (b - a) * u

    def dir(self, t):
        k, _ = self._locate(t)
        return _unit(self.axis[k + 1] - self.axis[k])

    def normal(self, t):
        d = self.dir(t)
        return np.array([-d[1], d[0]])

    def w_at(self, t):
        return self.ws[self._locate(t)[0]]

    def at_y(self, y):
        """中线第一次经过高度 y 的地方的 t（竖向的笔画按高度定位置用）"""
        acc = 0.0
        for k, (a, b) in enumerate(zip(self.axis[:-1], self.axis[1:])):
            sl = self.seglens[k]
            if (a[1] - y) * (b[1] - y) <= 0 and abs(b[1] - a[1]) > 1e-9:
                return (acc + sl * (y - a[1]) / (b[1] - a[1])) / self.length
            acc += sl
        raise ValueError(f'{self.id} 的中线不经过 y={y}')

    start = property(lambda s: s.axis[0].copy())
    end = property(lambda s: s.axis[-1].copy())
    mid = property(lambda s: s.point(0.5))
    start_dir = property(lambda s: _unit(s.axis[1] - s.axis[0]))
    end_dir = property(lambda s: _unit(s.axis[-1] - s.axis[-2]))
    w = property(lambda s: max(s.ws))
    w_end = property(lambda s: s.ws[-1])
    w_start = property(lambda s: s.ws[0])

    def heading(self, which='end'):
        """收笔（或起笔）的方向，取最接近的一个：down、up、left、right、downleft……"""
        d = self.end_dir if which == 'end' else -self.start_dir
        return max(DIRS, key=lambda k: d @ np.array(DIRS[k]))

    @property
    def bounds(self):
        return self.piece.bounds

    # ---------------------------------------------------------------- 切取区域
    def region(self):
        pad_k = []
        parts = []
        for k, (a, b) in enumerate(zip(self.axis[:-1], self.axis[1:])):
            wk = self.ws[k]
            pad = self.pad if self.pad is not None else max(24.0, 0.3 * wk)
            e = wk / 2 + pad
            parts.append(slab(tuple(a), tuple(b), wk + 2 * pad, e, e))
            pad_k.append(pad)
        return union(parts)

    # ---------------------------------------------------------------- 末端接不接别的笔画
    @property
    def end_free(self):
        """收笔的末端是不是“空”的（不接别的笔画）：末端外面一小块里别的笔画占得很少"""
        d = self.end_dir
        e = self.end
        w = self.w_end
        probe = slab(tuple(e - d * w * 0.25), tuple(e + d * w * 0.5), w * 0.9)
        others = union([s.piece for s in self.g.strokes if s is not self])
        a = _area(inter(probe, others))
        return a < 0.12 * _area(probe)

    # ---------------------------------------------------------------- 改
    def variant(self, shape):
        """把这一笔换成另一个形（字体单位的 Path，或 fn(self) -> Path）：拿掉原来这一笔，补上新形"""
        if callable(shape):
            shape = shape(self)
        self.g._remove(self)
        if shape is not None:
            self.g.ops.append(lambda p, sh=shape: union(p, sh))
        return self

    def op(self, fn, **kw):
        """在这一笔所在的字上做一步手术：fn(path, self, **kw) -> path"""
        self.g.ops.append(lambda p: fn(p, self, **kw))
        return self

    def add(self, shape):
        sh = shape(self) if callable(shape) else shape
        self.g.ops.append(lambda p: union(p, sh))
        return self

    def cut(self, shape):
        sh = shape(self) if callable(shape) else shape
        self.g.ops.append(lambda p: diff(p, sh))
        return self

    def extend(self, length=None, to=None, w0=None, w1=None, back=0.0, name=None, add=True):
        """顺着收笔方向延伸：从中线 1 - back 处起、经过收笔、再往外 length（或一直到字体单位的点 to），
        宽从 w0（默认这一笔收笔的宽）收到 w1（默认 w0 的一成，接近发丝）。add=True 时补进字形。
        返回 (轮廓, 末端点)；末端点也记在字的 anchors[name or 'id.tip']，排版后用 g.to_stage() 换成舞台坐标。"""
        a = self.point(1 - back) if back > 0 else self.end
        d = self.end_dir
        if to is not None:
            tip = np.array(to, float)
        else:
            tip = self.end + d * (length or self.w_end * 2)
        w0 = self.w_end if w0 is None else w0
        w1 = w0 * 0.1 if w1 is None else w1
        pts = [tuple(a), tuple(self.end), tuple(tip)] if back > 0 else [tuple(a), tuple(tip)]
        if back > 0:
            ws = [w0, w0 * 0.5 + w1 * 0.5, w1]
            shape = _tapered(pts, ws)
        else:
            shape = geom.taper(pts[0], pts[1], w0, w1)
        if add:
            self.g.ops.append(lambda p, sh=shape: union(p, sh))
        self.g.anchors[name or f'{self.id}.tip'] = (float(tip[0]), float(tip[1]))
        return shape, tip


def _tapered(pts, ws):
    pts = [np.array(q, float) for q in pts]
    left, right = [], []
    for i, q in enumerate(pts):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        d = d / (np.linalg.norm(d) + 1e-9)
        n = np.array([-d[1], d[0]])
        left.append(q + n * ws[i] / 2)
        right.append(q - n * ws[i] / 2)
    return poly([tuple(q) for q in left + right[::-1]])


def _area(p):
    """近似面积（展平后按多边形算，带绕向）"""
    tot = 0.0
    for c in geom.flatten(p, tol=1.0):
        x, y = c[:, 0], c[:, 1]
        tot += 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
    return abs(tot)


class Glyph:
    """一个字：原字形 + 笔画 + 一串手术。path() 给出改完的轮廓（字体单位）；place() 之后 stage_path() 给出舞台坐标。"""

    def __init__(self, font, ch, specs, label=None):
        self.font = font
        self.ch = ch
        self.label = label or ch
        self.src, self.adv = geom.glyph(font, ch)
        self.strokes = [Stroke(self, i + 1, sp) for i, sp in enumerate(specs or [])]
        self.removed = []
        self.ops = []
        self.anchors = {}     # 名字 -> 字体单位的点（星、杆尖、锚点……）
        self.seams = []       # 分缝的中线 {'pts', 'w'}（字体单位），渲染时往缝里灌光
        self.k = None         # 排版：字号/1000、原点、基线
        self._cut()

    def __repr__(self):
        return f'<字 {self.label} {len(self.strokes)} 笔>'

    # ---------------------------------------------------------------- 切笔画
    def _cut(self):
        if not self.strokes:
            self.residue = self.src
            return
        cs = list(self.src.contours)
        regions = []
        for s in self.strokes:
            if s.c is not None:
                idx = s.c if isinstance(s.c, (list, tuple)) else [s.c]
                s.piece = union([cs[i] for i in idx])
                regions.append(s.piece)
            else:
                r = s.region()
                s.piece = inter(self.src, r)
                regions.append(r)
        # 没被任何区域盖到的碎块：归给离它最近的那一笔
        residue = diff(self.src, union(regions))
        self.residue = residue
        for c in residue.contours:
            if _area(c) < 4:
                continue
            b = c.bounds
            q = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            s = min(self.strokes, key=lambda s: dist_to_polyline(q, s.axis))
            s.piece = union(s.piece, c)

    def coverage(self):
        """没被区域盖到的面积占整字的比例（标注核对用）"""
        return _area(self.residue) / max(1.0, _area(self.src))

    def _remove(self, s):
        if s not in self.removed:
            self.removed.append(s)

    # ---------------------------------------------------------------- 查
    def q(self, *preds, **conds):
        return Sel(self.strokes).q(*preds, **conds)

    def __getitem__(self, n):
        return self.strokes[n - 1]

    def op(self, fn, **kw):
        """整字的一步：fn(path, **kw) -> path"""
        self.ops.append(lambda p: fn(p, **kw))
        return self

    # ---------------------------------------------------------------- 结果
    def path(self):
        p = self.src
        if self.removed:
            gone = union([s.piece for s in self.removed])
            keep = union([s.piece for s in self.strokes if s not in self.removed])
            p = diff(p, diff(gone, keep))
        for fn in self.ops:
            p = fn(p)
        return p

    # ---------------------------------------------------------------- 排版：字体单位 → 舞台像素
    def place(self, x0, base, size):
        """字的原点在舞台 (x0, base)，字号 size（舞台像素）"""
        self.x0, self.base, self.size = float(x0), float(base), float(size)
        self.k = size / 1000.0
        return self

    def to_stage(self, q):
        if self.k is None:
            raise RuntimeError(f'{self.label} 还没排版（place）')
        return (self.x0 + float(q[0]) * self.k, self.base - float(q[1]) * self.k)

    def stage(self, p):
        """字体单位的 Path → 舞台像素"""
        return p.transform(self.k, 0, 0, -self.k, self.x0, self.base)

    def stage_path(self):
        return self.stage(self.path())


class Sel(list):
    """一组笔画。q() 筛，variant/op/add/cut/extend 批量改。"""

    def q(self, *preds, type=None, part=None, name=None, ch=None, tag=None, end=None, start=None, free=None,
          minlen=None, maxlen=None, ids=None):
        def as_set(v):
            return None if v is None else (set(v) if isinstance(v, (list, tuple, set)) else {v})
        T, P, N, C, G = as_set(type), as_set(part), as_set(name), as_set(ch), as_set(tag)
        E, B, I = as_set(end), as_set(start), as_set(ids)
        out = Sel()
        for s in self:
            if T and s.type not in T: continue
            if P and s.part not in P: continue
            if N and s.name not in N: continue
            if C and s.g.ch not in C and s.g.label not in C: continue
            if G and not (G & s.tags): continue
            if E and s.heading('end') not in E: continue
            if B and s.heading('start') not in B: continue
            if I and s.id not in I: continue
            if minlen is not None and s.length < minlen: continue
            if maxlen is not None and s.length > maxlen: continue
            if free is not None and s.end_free != free: continue
            if any(not f(s) for f in preds): continue
            out.append(s)
        return out

    def exclude(self, *ids):
        drop = set(ids)
        return Sel(s for s in self if s.id not in drop)

    @property
    def ids(self):
        return [s.id for s in self]

    def each(self, fn):
        for s in self:
            fn(s)
        return self

    def variant(self, fn, **kw):
        for s in self:
            s.variant(lambda st: fn(st, **kw))
        return self

    def op(self, fn, **kw):
        for s in self:
            s.op(fn, **kw)
        return self

    def add(self, fn):
        for s in self:
            s.add(fn)
        return self

    def cut(self, fn):
        for s in self:
            s.cut(fn)
        return self

    def extend(self, **kw):
        return [s.extend(**kw) for s in self]


class Title:
    """一整行题名的字。T[0]、T['甲'] 取字；T.q() 在全部笔画里查；T.s('甲5') 取一笔。"""

    def __init__(self, font, text, strokes, skip=' '):
        self.font = font
        self.text = text
        self.glyphs = []
        seen = {}
        for ch in text:
            if ch in skip:
                continue
            seen[ch] = seen.get(ch, 0) + 1
            label = ch if seen[ch] == 1 else f'{ch}#{seen[ch]}.'
            if ch not in strokes:
                print(f'提醒：「{ch}」没有笔画标注，只能整字处理')
            self.glyphs.append(Glyph(font, ch, strokes.get(ch, []), label))

    def __getitem__(self, k):
        if isinstance(k, int):
            return self.glyphs[k]
        for g in self.glyphs:
            if g.label == k or g.ch == k:
                return g
        raise KeyError(k)

    def __iter__(self):
        return iter(self.glyphs)

    def __len__(self):
        return len(self.glyphs)

    @property
    def strokes(self):
        return Sel(s for g in self.glyphs for s in g.strokes)

    def q(self, *preds, **conds):
        return self.strokes.q(*preds, **conds)

    def s(self, sid, n=None):
        if n is not None:
            return self[sid][n]
        for s in self.strokes:
            if s.id == sid:
                return s
        raise KeyError(f'没有这一笔：{sid}')

    def sel(self, *ids):
        return Sel(self.s(i) for i in ids)

    def op(self, fn, **kw):
        """每个字都做的一步（全组规则：加厚、刻面……）"""
        for g in self.glyphs:
            g.op(fn, **kw)
        return self

    def stage_path(self):
        return union([g.stage_path() for g in self.glyphs])
