"""检查图（给眼睛看的，不打分）。每次出图都写到 调研/审美全能/模板设计/题名锁定/<编号>-<题名>/检查/：

  成品.png     合成在这一题的底色上（舞台 1 倍）
  检查图.png   六格：黑白（只剩两档，看形）· 去色 · 只剩字（拿掉底板、主体元素、英文和细线）·
               缩略图（缩到手机角标那么小，连同迷你形态）· 白底 · 黑底
  分层.png     每层单独铺在棋盘格上，标 z 序、id、role，最后一格是合成
  笔画.png     笔画标注图：每一笔切出来的形各一种颜色、中线和收笔方向、笔序和类型；红色是没被任何区域盖到的碎块
"""
import os
import colorsys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from . import fx as F
from . import paths
from .geom import raster

READ_ROLES = ('text', 'hero')


def _font(size):
    return ImageFont.truetype(paths.SONG_SEMI, size)


def ground_of(tok):
    g = tok.get('ground')
    return '#0E121B' if g == 'dark' else (tok['world'] if g == 'mid' else tok['worldPale'])


def composite(L, keys):
    out = None
    for k in keys:
        out = L[k].copy() if out is None else F.over(out, L[k])
    return out


def to_rgb(L, bg, size=None):
    """预乘图层铺在底色上 → 8 位 RGB（size=(w, h) 时缩放，先按预乘缩）"""
    if size is not None:
        L = cv2.resize(L, size, interpolation=cv2.INTER_AREA)
    b = F.rgb(bg)
    c = L[..., :3] + b * (1 - L[..., 3:4])
    return (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)


def _label(img, text, sub=''):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 34], fill=(12, 14, 18))
    d.text((12, 6), text, fill=(230, 222, 208), font=_font(18))
    if sub:
        d.text((12 + d.textlength(text, font=_font(18)) + 14, 9), sub, fill=(150, 150, 150), font=_font(14))
    return img


def sheet(L, layers, tok, forms_rgba, path):
    """六格检查图"""
    order = [ly.id for ly in layers]
    full = composite(L, order)
    H, W = full.shape[:2]
    cw = 760
    ch = int(H * cw / W)
    size = (cw, ch)
    g = ground_of(tok)
    cells = []
    # 黑白：合成在底色上，按 Otsu 阈值分成黑白两档
    rgb = to_rgb(full, g, size)
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    _, bw = cv2.threshold(lum, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    cells.append(('黑白', '只剩两档，看形和主次', np.repeat(bw[..., None], 3, -1)))
    cells.append(('去色', '颜色不承担设计', np.repeat(lum[..., None], 3, -1)))
    text_keys = [ly.id for ly in layers if ly.role in READ_ROLES]
    tx = composite(L, text_keys) if text_keys else np.zeros_like(full)
    cells.append(('只剩字', '拿掉底板、主体元素、英文、细线：中文仍完整可读', to_rgb(tx, g, size)))
    # 缩略图：宽 180 和 96 的整块，旁边是迷你形态在 28 高时的样子
    th = np.zeros((ch, cw, 3), np.uint8) + np.array(F.rgb('#1A1D22') * 255, np.uint8)
    y = 50
    for tw in (240, 150, 96):
        t = to_rgb(full, g, (tw, max(1, int(H * tw / W))))
        th[y:y + t.shape[0], 20:20 + tw] = t
        y += t.shape[0] + 14
    x = 290
    yy = 60
    for name, bgc in (('mini', '#0E121B'), ('mini-ink', '#E9E1D2'), ('stamp', '#2A2F36'), ('stamp-ink', '#C9B99A'), ('stamp-blind', '#8E7E66')):
        f = forms_rgba.get(name)
        if f is None:
            continue
        hgt = 28 if name.startswith('mini') else 36
        wdt = max(1, int(f.shape[1] * hgt / f.shape[0]))
        if x + wdt > cw - 10:
            wdt = cw - 10 - x
            hgt = int(f.shape[0] * wdt / f.shape[1])
        t = to_rgb(f, bgc, (wdt, hgt))
        pad = np.zeros((hgt + 16, wdt + 24, 3), np.uint8) + np.array(F.rgb(bgc) * 255, np.uint8)
        pad[8:8 + hgt, 12:12 + wdt] = t
        if yy + pad.shape[0] < ch:
            th[yy:yy + pad.shape[0], x:x + pad.shape[1]] = pad
        yy += pad.shape[0] + 10
    cells.append(('缩略图', '宽 240 / 150 / 96；迷你与书脊', th))
    cells.append(('白底', '', to_rgb(full, '#FFFFFF', size)))
    cells.append(('黑底', '', to_rgb(full, '#000000', size)))
    cols, pad = 3, 14
    out = Image.new('RGB', (cols * (cw + pad) + pad, 2 * (ch + 34 + pad) + pad), (8, 10, 13))
    for i, (name, sub, arr) in enumerate(cells):
        im = Image.new('RGB', (cw, ch + 34), (12, 14, 18))
        im.paste(Image.fromarray(arr), (0, 34))
        _label(im, name, sub)
        out.paste(im, (pad + (i % cols) * (cw + pad), pad + (i // cols) * (ch + 34 + pad)))
    out.save(path)


def exploded(L, layers, path):
    """分层展开图"""
    cw, pad, lab, cols = 460, 16, 30, 4
    H, W = next(iter(L.values())).shape[:2]
    chh = int(H * cw / W)
    keys = [ly.id for ly in layers] + ['__all__']
    rows = (len(keys) + cols - 1) // cols
    sheet_ = Image.new('RGB', (cols * (cw + pad) + pad, rows * (chh + pad + lab) + pad), (8, 11, 15))
    yy, xx = np.mgrid[0:chh, 0:cw]
    checker = np.where(((xx // 10) + (yy // 10)) % 2 == 0, 0.13, 0.17).astype(np.float32)
    checker = np.repeat(checker[..., None], 3, -1) * np.array([0.9, 0.95, 1.1], np.float32)
    d = ImageDraw.Draw(sheet_)
    full = composite(L, keys[:-1])
    for i, k in enumerate(keys):
        Lk = full if k == '__all__' else L[k]
        sm = cv2.resize(Lk, (cw, chh), interpolation=cv2.INTER_AREA)
        img = sm[..., :3] + checker * (1 - sm[..., 3:4])
        x = pad + (i % cols) * (cw + pad)
        y = pad + (i // cols) * (chh + pad + lab)
        sheet_.paste(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)), (x, y + lab))
        if k == '__all__':
            t = '合成'
        else:
            ly = layers[i]
            t = f'z{i}  {k}  · {ly.role}'
        d.text((x, y + 4), t, fill=(200, 212, 224), font=_font(17))
    sheet_.save(path)


def stroke_map(title, path, cell=330):
    """笔画标注图：每一笔切出来的形一种颜色，中线（细黑线，箭头是收笔方向），笔序 + 类型；红色是没盖到的碎块"""
    n = len(title.glyphs)
    cols = min(n, 5)
    rows = (n + cols - 1) // cols
    k = cell / 1250.0
    head = 64
    W, H = cols * cell, rows * (cell + head)
    img = Image.new('RGB', (W, H), (250, 248, 244))
    f_lab = _font(13)
    f_head = _font(16)
    for gi, g in enumerate(title.glyphs):
        ox, oy = (gi % cols) * cell, (gi // cols) * (cell + head)
        M = (k, 0, 0, -k, 125 * k, 1000 * k)     # 字体单位 x -125..1125、y 1000..-250 → 格子

        def P(q):
            return (ox + 125 * k + q[0] * k, oy + 1000 * k - q[1] * k)
        base = np.full((cell, cell, 3), 250, np.float32)
        m = raster(g.src, cell, cell, M, ss=2)
        base = base * (1 - m[..., None] * 0.18)
        for si, s in enumerate(g.strokes):
            hue = (si * 0.137 + 0.05) % 1.0
            col = np.array(colorsys.hsv_to_rgb(hue, 0.55, 0.92)) * 255
            pm = raster(s.piece, cell, cell, M, ss=2)
            base = base * (1 - pm[..., None] * 0.55) + col * pm[..., None] * 0.55
        rm = raster(g.residue, cell, cell, M, ss=2)
        base = base * (1 - rm[..., None]) + np.array([230, 40, 40]) * rm[..., None]
        tile = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
        img.paste(tile, (ox, oy))
        d = ImageDraw.Draw(img)
        for s in g.strokes:
            pts = [P(q) for q in s.axis]
            d.line(pts, fill=(30, 30, 30), width=1)
            e, b = np.array(pts[-1]), np.array(pts[-2])
            v = (e - b) / (np.linalg.norm(e - b) + 1e-9)
            nrm = np.array([-v[1], v[0]])
            d.polygon([tuple(e), tuple(e - v * 8 + nrm * 4), tuple(e - v * 8 - nrm * 4)], fill=(30, 30, 30))
            a = pts[0]
            d.ellipse([a[0] - 2.5, a[1] - 2.5, a[0] + 2.5, a[1] + 2.5], fill=(30, 30, 30))
            d.text((a[0] + 4, a[1] - 15), f'{s.n}{s.type}', fill=(20, 20, 20), font=f_lab)
        cov = g.coverage()
        lines = '  '.join(f'{s.n}{s.name}·{s.part}' for s in g.strokes)
        d.text((ox + 8, oy + cell + 4), f'{g.label}  {len(g.strokes)} 笔' + (f'  红色 {cov:.1%}：区域没盖到，已归给最近的一笔' if cov > 0.0005 else ''),
               fill=(160, 30, 30) if cov > 0.05 else (20, 20, 20), font=f_head)
        # 笔画清单折行
        y = oy + cell + 26
        line = ''
        for tok in lines.split('  '):
            if d.textlength(line + tok, font=f_lab) > cell - 16:
                d.text((ox + 8, y), line, fill=(70, 70, 70), font=f_lab)
                y += 16
                line = ''
            line += tok + '  '
        d.text((ox + 8, y), line, fill=(70, 70, 70), font=f_lab)
    img.save(path)


def write(key, L, layers, tok, title, forms_rgba, standalone_k=1.0):
    out = paths.check_dir(key)
    order = [ly.id for ly in layers]
    full = composite(L, order)
    H, W = full.shape[:2]
    Image.fromarray(to_rgb(full, ground_of(tok), (int(W / 2 * standalone_k), int(H / 2 * standalone_k)))).save(os.path.join(out, '成品.png'))
    sheet(L, layers, tok, forms_rgba, os.path.join(out, '检查图.png'))
    exploded(L, layers, os.path.join(out, '分层.png'))
    if title is not None:
        stroke_map(title, os.path.join(out, '笔画.png'))
    return out
