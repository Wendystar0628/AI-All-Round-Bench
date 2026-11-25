"""笔画数据：按笔顺标注每一笔，从整字里切出每一笔，按条件查，批量改，骨架变换。

坐标是字体单位（1000 em，y 朝上，基线 0），和 Font.outline() 一样；排进版面时再换成版面坐标（Char.place）。

—— 标注 ——
一个字一张表，按笔顺：

    STROKES = {
        '永': [
            S('点', '丶', (466, 812), (532, 730), w=90),
            S('钩', '水', (310, 640), (560, 640), (560, 20), (470, 80), w=(40, 92, 60), name='横折钩'),
            …
        ],
    }

  S(类型, 部件, 中线上的点…, w=宽, name=全名, c=轮廓序号, pad=外扩, tags=标签)
    类型  横 竖 点 撇 捺 提 钩 折。复合笔画按收尾归类：横折、竖折、横撇归「折」，竖钩、横折钩、竖弯钩归「钩」；name 写全名
    部件  这一笔属于哪个部件，名字自己起，同一组字里叫法一致
    中线  从起笔到收笔、按书写方向的折线；折、钩在转折处加点
    w     宽：一个数，或每段一个（横折的横段细、竖段粗）
    c     这一笔正好是字形里一个（或几个）独立轮廓时写轮廓序号，取形最准；序号看坐标底图上的 c0 c1……
    pad   切取区域比笔画宽多出的量，默认取宽的三成、至少 24。区域只用来从整字里切出这一笔
    tags  自定的标签（一个字符串或几个），查的时候用
  整字里没被任何一笔的区域盖到的碎块，自动归给离它最近的那一笔；proof.stroke_map() 出标注图核对（红色是这种碎块）。

—— 查 ——
    W = Word(font, '永', STROKES)
    W.q(type='点')                                   所有的点
    W.q(type=('竖', '钩'), end='down', free=True)    收笔朝下、末端空着（不接别的笔画）的
    W.q(part='丶') / W.q(ch='永') / W.q(tag='主笔') / W.q(lambda s: s.length > 400)
    W.s('永3') 或 W.s('永', 3)                       某一笔（字 + 笔序，从 1 数；同一个字出现第二次时写 '永#2.3'）
    W.sel('永2', '永5')                              几笔
  收笔方向 end / 起笔方向 start：down up left right downleft downright upleft upright（也可以写 下 上 左 右 左下 右下 左上 右上）

—— 改 ——（Sel 是查出来的一组笔画，上面的方法对每一笔都做）
    .variant(fn)      换成 fn(s) 画出的新形（字体单位的 Path）：先把这一笔从字里拿掉，再补上新形
    .redraw(…)        由中线重画：variant(s.sweep(…))，参数见 Stroke.sweep
    .op(fn, **kw)     在这一笔所在的字上做一步手术 fn(path, s, **kw) -> path
    .add(fn) / .cut(fn)   补上、挖掉 fn(s) 画出的形
    .extend(…)        顺着收笔方向延伸成线（见 Stroke.extend）
    .exclude('永5')   去掉几笔；.q(…) 再筛
  整组字都做的一步用 W.op(fn)（fn(path, **kw) -> path）。改动按调用的顺序执行，在 path() 时算出结果。
"""
import math
import numpy as np
from . import geom
from .geom import union, diff, inter, slab, Path
from .fonts import Font

TYPES = ('横', '竖', '点', '撇', '捺', '提', '钩', '折')
DIRS = {'down': (0, -1), 'up': (0, 1), 'left': (-1, 0), 'right': (1, 0),
        'downleft': (-0.7071, -0.7071), 'downright': (0.7071, -0.7071), 'upleft': (-0.7071, 0.7071), 'upright': (0.7071, 0.7071)}
DIR_ZH = {'下': 'down', '上': 'up', '左': 'left', '右': 'right', '左下': 'downleft', '右下': 'downright', '左上': 'upleft', '右上': 'upright'}


def S(type, part, *pts, w, name=None, c=None, pad=None, tags=()):
    """一笔的标注（见模块说明）"""
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
    """点到折线的距离"""
    q = np.asarray(q, float)
    best = 1e18
    for a, b in zip(pts[:-1], pts[1:]):
        ab = b - a
        L2 = float(ab @ ab)
        t = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, float((q - a) @ ab) / L2))
        best = min(best, float(np.linalg.norm(q - (a + ab * t))))
    return best


def _area(p):
    return geom.area(p)


class Stroke:
    """一笔。axis 是中线（字体单位，N×2），ws 是每段的宽，piece 是从整字里切出来的这一笔。"""

    def __init__(self, char, n, spec):
        self.g = char
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
            raise ValueError(f'{char.label}{n}：w 要一个数，或每段一个（{len(self.axis) - 1} 段）')
        self.pad = spec['pad']
        self.piece = None

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
        """中线的长度"""
        return sum(self.seglens)

    def _locate(self, t):
        L = self.length * max(0.0, min(1.0, t))
        acc = 0.0
        sl = self.seglens
        for k, s in enumerate(sl):
            if acc + s >= L or k == len(sl) - 1:
                return k, (L - acc) / s if s > 1e-9 else 0.0
            acc += s
        return len(sl) - 1, 1.0

    def point(self, t):
        """中线上按长度比例 t（0 起笔，1 收笔）的点"""
        k, u = self._locate(t)
        a, b = self.axis[k], self.axis[k + 1]
        return a + (b - a) * u

    def dir(self, t):
        """t 处的走向（单位向量）"""
        k, _ = self._locate(t)
        return _unit(self.axis[k + 1] - self.axis[k])

    def normal(self, t):
        """t 处的左法向"""
        d = self.dir(t)
        return np.array([-d[1], d[0]])

    def w_at(self, t):
        """t 处的宽"""
        return self.ws[self._locate(t)[0]]

    def _at(self, v, ax):
        acc = 0.0
        sl = self.seglens
        for k, (a, b) in enumerate(zip(self.axis[:-1], self.axis[1:])):
            if (a[ax] - v) * (b[ax] - v) <= 0 and abs(b[ax] - a[ax]) > 1e-9:
                return (acc + sl[k] * (v - a[ax]) / (b[ax] - a[ax])) / self.length
            acc += sl[k]
        raise ValueError(f'{self.id} 的中线不经过 {"xy"[ax]}={v}')

    def at_y(self, y):
        """中线第一次经过高度 y 的 t"""
        return self._at(y, 1)

    def at_x(self, x):
        """中线第一次经过 x 的 t"""
        return self._at(x, 0)

    start = property(lambda s: s.axis[0].copy(), doc='起笔点')
    end = property(lambda s: s.axis[-1].copy(), doc='收笔点')
    mid = property(lambda s: s.point(0.5))
    start_dir = property(lambda s: _unit(s.axis[1] - s.axis[0]))
    end_dir = property(lambda s: _unit(s.axis[-1] - s.axis[-2]))
    w = property(lambda s: max(s.ws))
    w_start = property(lambda s: s.ws[0])
    w_end = property(lambda s: s.ws[-1])

    def heading(self, which='end'):
        """收笔（which='end'）或起笔（'start'，指向笔画外面）的方向，取最接近的一个：down、up、left、right、downleft……"""
        d = self.end_dir if which == 'end' else -self.start_dir
        return max(DIRS, key=lambda k: d @ np.array(DIRS[k]))

    @property
    def bounds(self):
        return tuple(self.piece.bounds)

    # ---------------------------------------------------------------- 切取区域
    def region(self):
        """沿中线、比笔画宽 2×pad 的区域（只用来从整字里切出这一笔）"""
        parts = []
        for k, (a, b) in enumerate(zip(self.axis[:-1], self.axis[1:])):
            wk = self.ws[k]
            pad = self.pad if self.pad is not None else max(24.0, 0.3 * wk)
            e = wk / 2 + pad
            parts.append(slab(tuple(a), tuple(b), wk + 2 * pad, e, e))
        return union(parts)

    @property
    def end_free(self):
        """收笔的末端是不是空着（不接别的笔画）：末端外面一小块里别的笔画占得很少"""
        d, e, w = self.end_dir, self.end, self.w_end
        probe = slab(tuple(e - d * w * 0.25), tuple(e + d * w * 0.5), w * 0.9)
        others = union([s.piece for s in self.g.strokes if s is not self])
        return _area(inter(probe, others)) < 0.12 * _area(probe)

    # ---------------------------------------------------------------- 由中线重画
    def sweep(self, w=None, cap0=None, cap1=None, join='miter', smooth=0, corner=None, axis=None):
        """沿这一笔的中线扫出新的轮廓（字体单位的 Path），不改字。
        w 默认用标注的宽；axis 可以换一条中线（N×2）；其余参数见 geom.sweep。"""
        ax = self.axis if axis is None else np.asarray(axis, float)
        if w is None:
            w = self.ws if axis is None else self.w
        return geom.sweep(ax, w, cap0=cap0, cap1=cap1, join=join, smooth=smooth, corner=corner)

    # ---------------------------------------------------------------- 改
    def variant(self, shape):
        """换成另一个形（Path，或 fn(self) -> Path）：拿掉原来这一笔，补上新形"""
        if callable(shape):
            shape = shape(self)
        self.g._remove(self)
        if shape is not None:
            self.g.ops.append(lambda p, sh=shape: union(p, sh))
        return self

    def redraw(self, **kw):
        """由中线重画这一笔：variant(self.sweep(**kw))"""
        return self.variant(self.sweep(**kw))

    def op(self, fn, **kw):
        """在这一笔所在的字上做一步手术：fn(path, self, **kw) -> path"""
        self.g.ops.append(lambda p: fn(p, self, **kw))
        return self

    def add(self, shape):
        """补上一个形（Path 或 fn(self) -> Path）"""
        sh = shape(self) if callable(shape) else shape
        self.g.ops.append(lambda p: union(p, sh))
        return self

    def cut(self, shape):
        """挖掉一个形（Path 或 fn(self) -> Path）"""
        sh = shape(self) if callable(shape) else shape
        self.g.ops.append(lambda p: diff(p, sh))
        return self

    def extend(self, length=None, to=None, w0=None, w1=None, back=0.0, name=None, add=True):
        """顺着收笔方向延伸成线：从中线 1-back 处起、经过收笔、再往外 length（或一直到字体单位的点 to），
        宽从 w0（默认收笔的宽）收到 w1（默认 w0 的一成）。add=True 时补进字形。
        返回 (轮廓, 末端点)；末端点也记在字的 anchors[name 或 '<笔画id>.tip']，排版后用 char.to_layout() 换成版面坐标。"""
        a = self.point(1 - back) if back > 0 else self.end
        d = self.end_dir
        tip = np.array(to, float) if to is not None else self.end + d * (length or self.w_end * 2)
        w0 = self.w_end if w0 is None else w0
        w1 = w0 * 0.1 if w1 is None else w1
        if back > 0:
            shape = geom.sweep([a, self.end, tip], [w0, (w0 + w1) / 2, w1], join='round')
        else:
            shape = geom.taper(tuple(a), tuple(tip), w0, w1)
        if add:
            self.g.ops.append(lambda p, sh=shape: union(p, sh))
        self.g.anchors[name or f'{self.id}.tip'] = (float(tip[0]), float(tip[1]))
        return shape, tip


class Char:
    """一个字：原字形 + 笔画 + 一串改动。path() 给出改完的轮廓（字体单位）；place() 之后 layout_path() 给出版面坐标。

    Char(font, '永', specs)           font 是 Font 或字体文件路径
    Char(font, '永', specs, src=p)    用自己给的轮廓 p 代替字体里的（从零画的字、别处改过的字）
    """

    def __init__(self, font, ch, specs=None, label=None, src=None):
        self.font = Font(font) if isinstance(font, str) else font
        self.ch = ch
        self.label = label or ch
        self.src = Path(src) if src is not None else self.font.outline(ch)
        self.adv = self.font.advance(ch) if self.font is not None and self.font.has(ch) else 1000.0
        self.box = self.font.em_box(ch) if self.font is not None and self.font.has(ch) else (0.0, -120.0, self.adv, 880.0)
        self.strokes = [Stroke(self, i + 1, sp) for i, sp in enumerate(specs or [])]
        self.removed = []
        self.ops = []
        self.anchors = {}   # 名字 -> 字体单位的点
        self.k = None
        self._cut()

    def __repr__(self):
        return f'<字 {self.label} {len(self.strokes)} 笔>'

    # ---------------------------------------------------------------- 切笔画
    def _cut(self):
        if not self.strokes:
            self.residue = Path()
            return
        cs = list(self.src.contours)
        regions = []
        # 用 c= 认领的轮廓只归那一笔，别的笔画的区域不再切它
        claimed = [s for s in self.strokes if s.c is not None]
        for s in claimed:
            idx = s.c if isinstance(s.c, (list, tuple)) else [s.c]
            s.piece = union([cs[i] for i in idx])
        rest = diff(self.src, [s.piece for s in claimed]) if claimed else self.src
        for s in self.strokes:
            if s.c is not None:
                regions.append(s.piece)
            else:
                r = s.region()
                s.piece = inter(rest, r)
                regions.append(r)
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
        """没被区域盖到的面积占整字的比例（标注核对用；大于几个百分点说明中线或宽标偏了）"""
        return _area(self.residue) / max(1.0, _area(self.src))

    def _remove(self, s):
        if s not in self.removed:
            self.removed.append(s)

    # ---------------------------------------------------------------- 查
    def q(self, *preds, **conds):
        return Sel(self.strokes).q(*preds, **conds)

    def __getitem__(self, n):
        return self.strokes[n - 1]

    # ---------------------------------------------------------------- 整字的改动
    def op(self, fn, **kw):
        """整字的一步：fn(path, **kw) -> path"""
        self.ops.append(lambda p: fn(p, **kw))
        return self

    def add(self, shape):
        self.ops.append(lambda p, sh=shape: union(p, sh))
        return self

    def cut(self, shape):
        self.ops.append(lambda p, sh=shape: diff(p, sh))
        return self

    def warp(self, fn, tol=None):
        """骨架变换（skeleton 里的函数，或任何 fn(N×2, box) -> N×2）：立刻作用在原字形、各笔切出来的形、中线和锚点上。
        tol 给数时轮廓先按 tol 拍平再变（变换剧烈时更准）。要在查和改笔画之前做。"""
        if self.ops or self.removed:
            print(f'提醒：{self.label} 已经有改动，骨架变换只作用在原字形和中线上，已排队的改动不跟着变')
        box = self.box
        f = (lambda P: fn(P, box))
        self.src = geom.warp(self.src, f, tol)
        self.residue = geom.warp(self.residue, f, tol) if list(self.residue) else self.residue
        for s in self.strokes:
            s.axis = np.asarray(f(s.axis), float)
            s.piece = geom.warp(s.piece, f, tol)
        for k, v in list(self.anchors.items()):
            self.anchors[k] = tuple(np.asarray(f(np.array([v], float)), float)[0])
        return self

    # ---------------------------------------------------------------- 结果
    def path(self):
        """改完的轮廓（字体单位）"""
        p = self.src
        if self.removed:
            gone = union([s.piece for s in self.removed])
            keep = union([s.piece for s in self.strokes if s not in self.removed])
            p = diff(p, diff(gone, keep))
        for fn in self.ops:
            p = fn(p)
        return p

    # ---------------------------------------------------------------- 排版：字体单位 → 版面坐标
    def place(self, x, baseline, size):
        """字的原点（左边、基线）放在版面 (x, baseline)，1 em = size"""
        self.x0, self.base, self.size = float(x), float(baseline), float(size)
        self.k = size / 1000.0
        return self

    def to_layout(self, q):
        """字体单位的点 → 版面坐标"""
        if self.k is None:
            raise RuntimeError(f'{self.label} 还没排版（place）')
        return (self.x0 + float(q[0]) * self.k, self.base - float(q[1]) * self.k)

    def layout(self, p):
        """字体单位的 Path → 版面坐标"""
        if self.k is None:
            raise RuntimeError(f'{self.label} 还没排版（place）')
        return p.transform(self.k, 0, 0, -self.k, self.x0, self.base)

    def layout_path(self):
        return self.layout(self.path())


class Sel(list):
    """一组笔画：q() 再筛，variant / redraw / op / add / cut / extend 批量改。"""

    def q(self, *preds, type=None, part=None, name=None, ch=None, tag=None, end=None, start=None, free=None,
          minlen=None, maxlen=None, ids=None):
        def as_set(v, dirs=False):
            if v is None:
                return None
            v = set(v) if isinstance(v, (list, tuple, set)) else {v}
            return {DIR_ZH.get(x, x) for x in v} if dirs else v
        T, P, N, C, G = as_set(type), as_set(part), as_set(name), as_set(ch), as_set(tag)
        E, B, I = as_set(end, True), as_set(start, True), as_set(ids)
        out = Sel()
        for s in self:
            if T and s.type not in T:
                continue
            if P and s.part not in P:
                continue
            if N and s.name not in N:
                continue
            if C and s.g.ch not in C and s.g.label not in C:
                continue
            if G and not (G & s.tags):
                continue
            if E and s.heading('end') not in E:
                continue
            if B and s.heading('start') not in B:
                continue
            if I and s.id not in I:
                continue
            if minlen is not None and s.length < minlen:
                continue
            if maxlen is not None and s.length > maxlen:
                continue
            if free is not None and s.end_free != free:
                continue
            if any(not f(s) for f in preds):
                continue
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

    def redraw(self, **kw):
        for s in self:
            s.redraw(**kw)
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


class Word:
    """一组字（一行游戏名、一个词）。W[0]、W['永'] 取字；W.q() 在全部笔画里查；W.s('永5') 取一笔。

    Word(font, '永', STROKES)                 全部用同一款字体
    Word.of([Char(…), Char(…)])               各字自己建（不同字体、自己画的轮廓）
    """

    def __init__(self, font=None, text='', strokes=None, skip=' '):
        self.glyphs = []
        strokes = strokes or {}
        seen = {}
        for ch in text:
            if ch in skip:
                continue
            seen[ch] = seen.get(ch, 0) + 1
            label = ch if seen[ch] == 1 else f'{ch}#{seen[ch]}.'
            specs = strokes.get(label, strokes.get(ch, []))
            if not specs:
                print(f'提醒：「{label}」没有笔画标注，只能整字处理')
            self.glyphs.append(Char(font, ch, specs, label))

    @classmethod
    def of(cls, chars):
        w = cls()
        w.glyphs = list(chars)
        return w

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
    def text(self):
        return ''.join(g.ch for g in self.glyphs)

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
        """每个字都做的一步（全组规则）：fn(path, **kw) -> path"""
        for g in self.glyphs:
            g.op(fn, **kw)
        return self

    def warp(self, fn, tol=None):
        """每个字都做的骨架变换（各自在自己的字身框里）"""
        for g in self.glyphs:
            g.warp(fn, tol)
        return self

    def row(self, x, baseline, size, tracking=0.0, gaps=None):
        """排成一行：从 x 起，按各字的步进依次往右；tracking 是字距（em），gaps 可以给每个字后面单独加的距离（版面单位）"""
        k = size / 1000.0
        for i, g in enumerate(self.glyphs):
            g.place(x, baseline, size)
            x += g.adv * k + tracking * size + (gaps[i] if gaps and i < len(gaps) else 0.0)
        return self

    def layout_path(self):
        """全部字排好后的轮廓（版面坐标）"""
        return union([g.layout_path() for g in self.glyphs])
