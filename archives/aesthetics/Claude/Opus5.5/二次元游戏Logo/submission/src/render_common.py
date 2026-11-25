"""三枚 Logo 共用的出图流程：分层 PNG、成品、黑白稿、检查图、分层展开、网页素材、矢量数据。"""
import os
import json
import numpy as np
from gb import G, fx, output, Canvas, WORK, LOGOS, WEB
from util import save_web_png, svg_d


def fit_canvas(paths, margin, scale, min_w=None):
    """按全部内容的外框加边距定画布（版面坐标的 origin 跟着挪）"""
    bs = [G.bounds(p) for p in paths if p is not None and list(p)]
    x0 = min(b[0] for b in bs) - margin
    y0 = min(b[1] for b in bs) - margin
    x1 = max(b[2] for b in bs) + margin
    y1 = max(b[3] for b in bs) + margin
    w, h = x1 - x0, y1 - y0
    if min_w and w * scale < min_w:
        scale = min_w / w
    return Canvas(w, h, scale, origin=(x0, y0))


def edge_chip(C, m, seed, amp_px, cell_px, chip=0.0):
    """撕边/掉漆的边：域扭曲 + 边上随机缺口"""
    H, W = m.shape
    n1 = fx.fbm(H, W, cell_px, seed, octaves=5)
    n2 = fx.fbm(H, W, cell_px, seed + 1, octaves=5)
    e = fx.warp(m, n1, n2, amp_px)
    if chip > 0:
        d = fx.dist_in((e > 0.5).astype(np.float32), reach=int(chip * 3) + 4)
        nz = fx.fbm(H, W, cell_px * 0.45, seed + 5, octaves=4)
        near = np.clip(1 - d / chip, 0, 1)
        e = e * (1 - fx.smoothstep(0.66, 0.74, nz * (0.75 + 0.5 * near)) * (near > 0))
    return np.clip(e, 0, 1)


def write_outputs(key, name_cn, layers, C, mono_tones, read_layers, web_w=3000, extra=None):
    """layers：{层名: 预乘图层}。写：logos/<名>/final.png、mono.png、layers/；work 里的检查图、分层展开；web 里的缩小版。"""
    ldir = os.path.join(LOGOS, name_cn)
    os.makedirs(ldir, exist_ok=True)
    files = output.save_layers(layers, os.path.join(ldir, 'layers'))
    full = output.composite(layers)
    output.save_png(os.path.join(ldir, 'final.png'), full)
    mono = output.mono(layers, tones=mono_tones)
    output.save_png(os.path.join(ldir, 'mono.png'), mono, bg='#FFFFFF')
    output.check_sheet(layers, os.path.join(WORK, f'{key}_检查图.png'), read=read_layers)
    output.exploded(layers, os.path.join(WORK, f'{key}_分层.png'))
    # 网页素材
    wdir = os.path.join(WEB, key)
    os.makedirs(wdir, exist_ok=True)
    web_layers = []
    for i, (nm, L) in enumerate(layers.items()):
        fn = f'L{i + 1:02d}.png'
        save_web_png(os.path.join(wdir, fn), L, web_w)
        web_layers.append({'file': f'web/{key}/{fn}', 'name': nm})
    save_web_png(os.path.join(wdir, 'final.png'), full, web_w)
    save_web_png(os.path.join(wdir, 'final_small.png'), full, 900)
    # 黑白稿：网页里用白底版本
    mono_rgb = fx.to_u8(mono, '#FFFFFF')
    from PIL import Image
    im = Image.fromarray(mono_rgb)
    h = int(round(im.height * web_w / im.width))
    im.resize((web_w, h), Image.LANCZOS).save(os.path.join(wdir, 'mono.png'), optimize=True)
    # 只留字（检查格：遮住母题和主体元素）
    tx = output.composite(layers, read_layers)
    save_web_png(os.path.join(wdir, 'text_only.png'), tx, web_w)
    print(f'[{key}] 输出 {len(files)} 层，画布 {C.W}×{C.H}')
    return web_layers, full


def path_payload(C, p, prec=1):
    """版面坐标的 Path → 画布左上为原点的 SVG d"""
    if p is None or not list(p):
        return ''
    q = G.move(p, -C.ox, -C.oy)
    return svg_d(q, prec)


def _flip(p):
    """字体单位（y 朝上）→ 示意图坐标（y 朝下，字身框顶 = 0）"""
    return p.transform(1, 0, 0, -1, 0, 880)


def _pts_flip(ax):
    return [[round(float(p[0]), 1), round(880 - float(p[1]), 1)] for p in ax]


def chars_payload(C, groups):
    """groups：[(角色, [排好的字 dict])]。每个字给出：底字轮廓、每笔的底字切片和方言形（字体单位，翻成 y 朝下）、
    两条中线，以及每笔在画布上的路径（入场动画逐笔画出来用）"""
    chars = []
    for role, group in groups:
        for g in group:
            ch = g['char']
            st = []
            for k, it in enumerate(g['items']):
                s = it['s']
                fs = g['font_shapes'][k]
                st.append({'id': s.id, 'type': s.type, 'name': s.name,
                           'd': path_payload(C, g['strokes'][k]) if g['strokes'][k] is not None and list(g['strokes'][k]) else '',
                           'base': svg_d(_flip(s.piece)) if s.piece is not None and list(s.piece) else '',
                           'new': svg_d(_flip(fs)) if fs is not None and list(fs) else '',
                           'axb': _pts_flip(s.axis), 'axn': _pts_flip(it.get('ax_slant', it['ax'])),
                           'tag': ('climax' if it.get('climax') else 'echo' if it.get('echo') else '')})
            chars.append({'ch': g['ch'], 'role': role, 'src': svg_d(_flip(ch.src)), 'strokes': st})
    return chars


def write_data_js(key, data):
    from util import save_json
    save_json(os.path.join(WORK, f'data_{key}.json'), data)
    with open(os.path.join(WEB, f'data_{key}.js'), 'w', encoding='utf-8') as f:
        f.write(f'window.LOGO_DATA = window.LOGO_DATA || {{}};\nwindow.LOGO_DATA.{key} = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')


def frac_fn(C):
    def frac(x, y):
        return [round((x - C.ox) / C.w, 4), round((y - C.oy) / C.h, 4)]
    return frac


def box_of(C, p):
    b = G.bounds(p)
    fr = frac_fn(C)
    return fr(b[0], b[1]) + fr(b[2], b[3])
