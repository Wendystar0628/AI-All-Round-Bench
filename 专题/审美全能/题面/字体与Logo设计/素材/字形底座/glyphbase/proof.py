"""核对图：给眼睛看的，标笔画、核对改动时用。

    coord_map(p, 'out/永.png', title='永')        坐标底图：字体单位网格（每 50 一根细线、每 100 一根粗线带数字），
                                                  灰色是字形，绿色 c0 c1……是轮廓序号（橙色是孔），红线是基线
    coord_maps(font, '永和', 'out/坐标底图')      每个字一张
    stroke_map(word, 'out/笔画.png')             笔画标注图：每一笔切出来的形一种颜色，黑线是中线、箭头是收笔方向，
                                                  起笔处写笔序和类型；红色是没被任何区域盖到的碎块（已自动归给最近的一笔）
    compare([('原字', p0), ('改后', p1)], 'out/对照.png')   几个字形并排对照（同一比例，带基线和字身框）
"""
import os
import colorsys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from .canvas import raster
from .geom import contours
from .fonts import FONT_DIR

_LABEL_FONTS = ('msyh.ttc', 'msyhbd.ttc', 'simhei.ttf', 'Deng.ttf', 'simsun.ttc', 'NotoSansSC-VF.ttf', 'SourceHanSansCN-Regular.otf')
_lf_cache = {}


def label_font(size):
    """标注用的中文字体（系统里找一款有中文的）"""
    if size not in _lf_cache:
        f = None
        for name in _LABEL_FONTS:
            p = os.path.join(FONT_DIR, name)
            if os.path.exists(p):
                try:
                    f = ImageFont.truetype(p, size)
                    break
                except OSError:
                    continue
        if f is None:
            f = ImageFont.load_default(size)
        _lf_cache[size] = f
    return _lf_cache[size]


def _save(img, path):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    img.save(path)
    return path


def _inside_point(c, M, W, H):
    """轮廓里离边最远的一点（像素坐标），放标签用"""
    m = raster(c, W, H, M, ss=1)
    b = (m > 0.5).astype(np.uint8)
    if b.sum() == 0:
        return None
    d = cv2.distanceTransform(b, cv2.DIST_L2, 3)
    y, x = np.unravel_index(int(np.argmax(d)), d.shape)
    return int(x), int(y)


def coord_map(p, path, title='', box=None, adv=None, s=0.9, points=False):
    """坐标底图（p 是字体单位的轮廓）。box 给字身框 (x0, y0, x1, y1) 时画虚线框；adv 给步进时画步进线；
    points=True 时标出轮廓上的点（实心是落笔点，空心是曲线控制点）。"""
    b = p.bounds if list(p) else (0, 0, 1000, 800)
    x0 = min(-100, int(np.floor((b[0] - 50) / 100) * 100))
    x1 = max(1100, int(np.ceil((b[2] + 50) / 100) * 100))
    y0 = min(-200, int(np.floor((b[1] - 50) / 100) * 100))
    y1 = max(1000, int(np.ceil((b[3] + 50) / 100) * 100))
    m_l, m_t = 46, 40 + (30 if title else 0)
    W, H = int((x1 - x0) * s) + m_l + 44, int((y1 - y0) * s) + m_t + 20
    M = (s, 0, 0, -s, m_l - x0 * s, m_t + y1 * s)

    def P(x, y):
        return (m_l + (x - x0) * s, m_t + (y1 - y) * s)
    img = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    f_num, f_lab, f_title = label_font(13), label_font(17), label_font(20)
    for gx in range(x0, x1 + 1, 50):
        X = P(gx, 0)[0]
        major = gx % 100 == 0
        d.line([(X, m_t), (X, H - 20)], fill=(120, 140, 235) if major else (214, 222, 250), width=1)
        if major:
            d.text((X + 2, m_t - 16), str(gx), fill=(40, 60, 200), font=f_num)
    for gy in range(y0, y1 + 1, 50):
        Y = P(0, gy)[1]
        major = gy % 100 == 0
        d.line([(m_l, Y), (W - 44, Y)], fill=(235, 140, 140) if major else (250, 220, 220), width=1)
        if major:
            d.text((4, Y - 8), str(gy), fill=(200, 40, 40), font=f_num)
    m = raster(p, W, H, M, ss=2)
    arr = np.asarray(img).astype(np.float32)
    arr = arr * (1 - m[..., None] * 0.62) + np.array([40, 40, 40], np.float32) * m[..., None] * 0.62
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.line([P(x0, 0), P(x1, 0)], fill=(220, 0, 0), width=2)
    if box is not None:
        bx0, by0, bx1, by1 = box
        pts = [P(bx0, by0), P(bx1, by0), P(bx1, by1), P(bx0, by1), P(bx0, by0)]
        for a, c in zip(pts[:-1], pts[1:]):
            n = int(max(abs(c[0] - a[0]), abs(c[1] - a[1])) / 8)
            for k in range(0, n, 2):
                t0, t1 = k / n, min(1, (k + 1) / n)
                d.line([(a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0), (a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1)],
                       fill=(150, 80, 200), width=1)
    if adv is not None:
        d.line([P(adv, y0), P(adv, y1)], fill=(150, 80, 200), width=1)
    if points:
        from .geom import points as pts_of
        for _, _, x, y, on in pts_of(p):
            X, Y = P(x, y)
            if on:
                d.ellipse([X - 2.5, Y - 2.5, X + 2.5, Y + 2.5], fill=(0, 90, 230))
            else:
                d.ellipse([X - 2.5, Y - 2.5, X + 2.5, Y + 2.5], outline=(0, 90, 230))
    for c in contours(p):
        q = _inside_point(c['path'], M, W, H)
        if q is None:
            continue
        t = f"c{c['i']}" + ('孔' if c['hole'] else '')
        col = (230, 120, 0) if c['hole'] else (0, 150, 40)
        tw = d.textlength(t, font=f_lab)
        d.text((q[0] - tw / 2, q[1] - 10), t, fill=col, font=f_lab, stroke_width=3, stroke_fill=(255, 255, 255))
    if title:
        n = len(contours(p))
        d.text((m_l, 8), f'{title}    轮廓 {n} 个' + (f'    步进 {adv:g}' if adv is not None else '') +
               f'    墨迹外框 ({b[0]:.0f}, {b[1]:.0f}) – ({b[2]:.0f}, {b[3]:.0f})', fill=(20, 20, 20), font=f_title)
    return _save(img, path)


def coord_maps(font, text, out_dir, points=False):
    """每个字一张坐标底图：<out_dir>/<字>.png。返回文件列表。"""
    out = []
    for ch in dict.fromkeys(text):
        if ch.isspace():
            continue
        f = os.path.join(out_dir, f'{ch}.png')
        coord_map(font.outline(ch), f, title=f'{ch}  {font.name}', box=font.em_box(ch), adv=font.advance(ch), points=points)
        out.append(f)
    return out


def stroke_map(word, path, cell=520, cols=4):
    """笔画标注图（word 是 strokes.Word，或 Char 的列表）。图下面写：字、笔数、没盖到的比例、每一笔的 笔序 名称·部件 [标签]。"""
    glyphs = list(word.glyphs if hasattr(word, 'glyphs') else word)
    n = len(glyphs)
    cols = max(1, min(n, cols))
    rows = (n + cols - 1) // cols
    k = cell / 1300.0
    head = 96
    W, H = cols * cell, rows * (cell + head)
    img = Image.new('RGB', (W, H), (250, 248, 244))
    f_lab, f_head, f_list = label_font(14), label_font(17), label_font(13)
    for gi, g in enumerate(glyphs):
        ox, oy = (gi % cols) * cell, (gi // cols) * (cell + head)
        M = (k, 0, 0, -k, 150 * k, 1000 * k)    # 字体单位 x -150..1150、y 1000..-300 → 格子

        def P(q):
            return (ox + 150 * k + q[0] * k, oy + 1000 * k - q[1] * k)
        base = np.full((cell, cell, 3), 250, np.float32)
        m = raster(g.src, cell, cell, M, ss=2)
        base = base * (1 - m[..., None] * 0.18)
        for si, s in enumerate(g.strokes):
            hue = (si * 0.137 + 0.05) % 1.0
            col = np.array(colorsys.hsv_to_rgb(hue, 0.55, 0.92)) * 255
            pm = raster(s.piece, cell, cell, M, ss=2)
            base = base * (1 - pm[..., None] * 0.55) + col * pm[..., None] * 0.55
        rm = raster(g.residue, cell, cell, M, ss=2) if list(g.residue) else np.zeros((cell, cell), np.float32)
        base = base * (1 - rm[..., None]) + np.array([230, 40, 40]) * rm[..., None]
        img.paste(Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)), (ox, oy))
        d = ImageDraw.Draw(img)
        d.line([P((-150, 0)), P((1150, 0))], fill=(200, 200, 200), width=1)
        for s in g.strokes:
            pts = [P(q) for q in s.axis]
            d.line(pts, fill=(25, 25, 25), width=2)
            e, b = np.array(pts[-1]), np.array(pts[-2])
            v = (e - b) / (np.linalg.norm(e - b) + 1e-9)
            nrm = np.array([-v[1], v[0]])
            d.polygon([tuple(e + v * 4), tuple(e - v * 10 + nrm * 5), tuple(e - v * 10 - nrm * 5)], fill=(25, 25, 25))
            a = pts[0]
            d.ellipse([a[0] - 3.5, a[1] - 3.5, a[0] + 3.5, a[1] + 3.5], fill=(25, 25, 25))
            d.text((a[0] + 5, a[1] - 19), f'{s.n}{s.type}', fill=(10, 10, 10), font=f_lab, stroke_width=2, stroke_fill=(255, 255, 255))
        cov = g.coverage() if g.strokes else 0.0
        warn = f'  红色 {cov:.1%}：没盖到，已归给最近的一笔' if cov > 0.0005 else ''
        d.text((ox + 8, oy + cell + 4), f'{g.label}  {len(g.strokes)} 笔{warn}',
               fill=(170, 30, 30) if cov > 0.05 else (20, 20, 20), font=f_head)
        items = [f'{s.n}{s.name}·{s.part}' + (f'[{",".join(sorted(s.tags))}]' if s.tags else '') for s in g.strokes]
        y = oy + cell + 28
        line = ''
        for t in items:
            if line and d.textlength(line + t, font=f_list) > cell - 16:
                d.text((ox + 8, y), line, fill=(70, 70, 70), font=f_list)
                y += 17
                line = ''
            line += t + '  '
        d.text((ox + 8, y), line, fill=(70, 70, 70), font=f_list)
    return _save(img, path)


def compare(items, path, cell=420):
    """几个字形（字体单位的 Path）并排：items = [(标题, Path), …]。同一比例，灰线是基线和 1000 em 的字身框（-120 到 880）。"""
    n = len(items)
    k = cell / 1300.0
    head = 34
    img = Image.new('RGB', (n * cell, cell + head), (250, 248, 244))
    d = ImageDraw.Draw(img)
    f = label_font(17)
    for i, (t, p) in enumerate(items):
        ox = i * cell
        M = (k, 0, 0, -k, 150 * k, 1000 * k)
        m = raster(p, cell, cell, M, ss=2)
        tile = np.full((cell, cell, 3), 250, np.float32) * (1 - m[..., None]) + np.array([24, 24, 24]) * m[..., None]
        img.paste(Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8)), (ox, head))
        d = ImageDraw.Draw(img)

        def P(x, y):
            return (ox + 150 * k + x * k, head + 1000 * k - y * k)
        d.line([P(-150, 0), P(1150, 0)], fill=(205, 120, 120), width=1)
        d.rectangle([P(0, 880), P(1000, -120)], outline=(190, 190, 205), width=1)
        d.text((ox + 10, 7), t, fill=(20, 20, 20), font=f)
        if i:
            d.line([(ox, 0), (ox, cell + head)], fill=(210, 205, 198), width=1)
    return _save(img, path)
