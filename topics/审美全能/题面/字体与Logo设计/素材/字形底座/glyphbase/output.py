"""输出：分层 PNG、合成、黑白稿、检查图、分层展开图、SVG。

图层用一个 dict 装：{层名: 预乘 RGBA 数组}，按插入顺序从后往前叠（Python 的 dict 保留插入顺序）。
所有层都出自同一张 Canvas，尺寸相同、天然对齐。

    save_layers(layers, 'out/layers')            每层一张同尺寸的透明 PNG：01_层名.png、02_层名.png……
    full = composite(layers)                     合成（预乘）
    save_png('out/final.png', full)              透明 PNG；给 bg='#FFFFFF' 就铺在底色上
    save_png('out/mono.png', mono(layers, tones={'阴影': 0.55}))   黑白稿：每层平涂一档灰（0 黑 1 白，默认黑）
    check_sheet(layers, 'out/检查图.png', read=['字'])   检查图：去色 · 两档黑白 · 只留字 · 高 64 像素 · 白底 · 黑底
    exploded(layers, 'out/分层.png')             分层展开：每层铺在棋盘格上，标 z 序和层名，最后一格是合成
    save_svg('out/logo.svg', [('字', path, '#111111'), …], (w, h))   路径导出成 SVG（版面坐标）
"""
import os
import numpy as np
import cv2
from PIL import Image, ImageDraw
from . import fx as F
from .geom import to_svg_d
from .proof import label_font


def _mk(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


# ================================================================ PNG


def save_png(path, L, bg=None):
    """预乘图层 → PNG（直通透明度）；给 bg 时铺在底色上存成不透明 RGB"""
    _mk(path)
    u = F.to_u8(L, bg)
    Image.fromarray(u, 'RGB' if u.shape[-1] == 3 else 'RGBA').save(path, compress_level=6)
    return path


def load_png(path):
    """PNG → 预乘图层"""
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255.0
    return np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], -1)


def save_layers(layers, out_dir, numbered=True):
    """每层一张同尺寸的透明 PNG。numbered=True 时文件名带 z 序前缀（01_底板.png），从后往前数。返回文件列表。"""
    os.makedirs(out_dir, exist_ok=True)
    files = []
    for i, (name, L) in enumerate(layers.items()):
        f = os.path.join(out_dir, (f'{i + 1:02d}_{name}.png' if numbered else f'{name}.png'))
        save_png(f, L)
        files.append(f)
    return files


# ================================================================ 合成与黑白


def composite(layers, names=None):
    """按顺序叠出合成图（预乘）；names 给出时只叠这几层（顺序仍按 layers 里的）"""
    keys = [k for k in layers if names is None or k in names]
    return F.stack([layers[k] for k in keys])


def mono(layers, tones=None, default=0.0, names=None):
    """黑白稿：每层按自己的透明度平涂成一档灰，再按顺序叠。tones = {层名: 灰度 0–1（0 黑，1 白）}，没写的层用 default。
    names 给出时只用这几层。返回预乘图层（透明底）。"""
    tones = tones or {}
    out = []
    for k, L in layers.items():
        if names is not None and k not in names:
            continue
        g = float(tones.get(k, default))
        out.append(F.solid(L[..., 3], (g, g, g)))
    return F.stack(out)


def grayscale(L):
    """去色（按亮度，透明度不变；预乘图层直接按预乘的颜色算亮度）"""
    y = L[..., 0] * 0.299 + L[..., 1] * 0.587 + L[..., 2] * 0.114
    out = L.copy()
    out[..., 0] = out[..., 1] = out[..., 2] = y
    return out


def two_tone(L, bg='#808080', threshold=None):
    """两档黑白：铺在 bg 上算亮度，按阈值（默认 Otsu 自动取）分成黑白两档。返回 8 位灰度图"""
    rgb_ = F.to_u8(L, bg)
    lum = cv2.cvtColor(rgb_, cv2.COLOR_RGB2GRAY)
    if threshold is None:
        _, bw = cv2.threshold(lum, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        bw = np.where(lum >= threshold * 255, 255, 0).astype(np.uint8)
    return bw


def _resize(L, w, h):
    return cv2.resize(L, (max(1, int(w)), max(1, int(h))), interpolation=cv2.INTER_AREA)


def _rgb_on(L, bg, w=None, h=None):
    if w is not None:
        L = _resize(L, w, h)
    return F.to_u8(L, bg)


def _label(img, text, sub=''):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 34], fill=(16, 17, 20))
    d.text((12, 6), text, fill=(236, 236, 236), font=label_font(18))
    if sub:
        d.text((12 + d.textlength(text, font=label_font(18)) + 14, 9), sub, fill=(160, 160, 160), font=label_font(14))
    return img


# ================================================================ 检查图


def check_sheet(layers, path, read=None, bg='#808080', thumb_h=64, cell_w=760):
    """检查图，3×2 六格：
      去色（铺在 bg 上）· 两档黑白（看形和明暗是否成立）· 只留字（只叠 read 列出的层，看拿掉其他层后字是否完整可读）·
      高 thumb_h 像素（整块缩到这么高，原大摆在浅底和深底上）· 白底 · 黑底
    read 不给时“只留字”一格用全部层。"""
    full = composite(layers)
    H, W = full.shape[:2]
    cw = cell_w
    ch = max(60, int(H * cw / W))
    cells = []
    cells.append(('去色', f'铺在 {bg} 上', np.repeat(cv2.cvtColor(_rgb_on(full, bg, cw, ch), cv2.COLOR_RGB2GRAY)[..., None], 3, -1)))
    bw = two_tone(_resize(full, cw, ch), bg)
    cells.append(('两档黑白', '只剩黑白两档', np.repeat(bw[..., None], 3, -1)))
    tx = composite(layers, read) if read else full
    cells.append(('只留字', '、'.join(read) if read else '（没指定字层，用全部层）', _rgb_on(tx, bg, cw, ch)))
    th = np.zeros((ch, cw, 3), np.uint8)
    th[:, : cw // 2] = 236
    th[:, cw // 2:] = 24
    tw = max(1, int(W * thumb_h / H))
    tw = min(tw, cw // 2 - 20)
    tH = max(1, int(H * tw / W))
    for i, b in enumerate(('#ECECEC', '#181818')):
        t = _rgb_on(full, b, tw, tH)
        x = 10 + i * (cw // 2)
        y = max(0, (ch - tH) // 2)
        th[y:y + tH, x:x + tw] = t[: ch - y]
    cells.append((f'高 {thumb_h} 像素', f'整块缩到 {tw}×{tH}，原大', th))
    cells.append(('白底', '', _rgb_on(full, '#FFFFFF', cw, ch)))
    cells.append(('黑底', '', _rgb_on(full, '#000000', cw, ch)))
    cols, pad = 3, 14
    out = Image.new('RGB', (cols * (cw + pad) + pad, 2 * (ch + 34 + pad) + pad), (10, 11, 13))
    for i, (name, sub, arr) in enumerate(cells):
        im = Image.new('RGB', (cw, ch + 34), (16, 17, 20))
        im.paste(Image.fromarray(arr), (0, 34))
        _label(im, name, sub)
        out.paste(im, (pad + (i % cols) * (cw + pad), pad + (i // cols) * (ch + 34 + pad)))
    _mk(path)
    out.save(path)
    return path


def exploded(layers, path, cell_w=460, cols=4):
    """分层展开图：每层单独铺在棋盘格上，标 z 序和层名；最后一格是合成"""
    H, W = next(iter(layers.values())).shape[:2]
    cw, pad, lab = cell_w, 16, 30
    chh = max(40, int(H * cw / W))
    keys = list(layers) + [None]
    rows = (len(keys) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (cw + pad) + pad, rows * (chh + pad + lab) + pad), (12, 13, 16))
    yy, xx = np.mgrid[0:chh, 0:cw]
    checker = np.where(((xx // 10) + (yy // 10)) % 2 == 0, 0.30, 0.38).astype(np.float32)
    checker = np.repeat(checker[..., None], 3, -1)
    d = ImageDraw.Draw(sheet)
    full = composite(layers)
    for i, k in enumerate(keys):
        L = full if k is None else layers[k]
        sm = _resize(L, cw, chh)
        img = sm[..., :3] + checker * (1 - sm[..., 3:4])
        x = pad + (i % cols) * (cw + pad)
        y = pad + (i // cols) * (chh + pad + lab)
        sheet.paste(Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)), (x, y + lab))
        d.text((x, y + 5), '合成' if k is None else f'z{i + 1}  {k}', fill=(214, 220, 228), font=label_font(17))
    _mk(path)
    sheet.save(path)
    return path


# ================================================================ SVG


def save_svg(path, items, size, viewbox=None, bg=None, prec=2):
    """把路径导出成 SVG（给网页用）。items = [(id, Path, 填充色), …]，路径是版面坐标（y 朝下）；
    size = (宽, 高)；viewbox 默认 (0, 0, 宽, 高)；bg 给颜色时铺一个底。id 写进每个 <path> 的 id，网页里可以按 id 取来做动画。"""
    w, h = size
    vb = viewbox or (0, 0, w, h)
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}" height="{h:g}" viewBox="{" ".join(f"{v:g}" for v in vb)}">']
    if bg:
        lines.append(f'  <rect x="{vb[0]:g}" y="{vb[1]:g}" width="{vb[2]:g}" height="{vb[3]:g}" fill="{bg}"/>')
    for it in items:
        pid, p, fill = it[0], it[1], (it[2] if len(it) > 2 else '#000000')
        if not list(p):
            continue
        lines.append(f'  <path id="{pid}" fill="{fill}" fill-rule="nonzero" d="{to_svg_d(p, prec)}"/>')
    lines.append('</svg>')
    _mk(path)
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    return path
