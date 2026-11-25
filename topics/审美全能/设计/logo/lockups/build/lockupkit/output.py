"""出图与清单。

每题只写自己的目录 lockups/<题key>/（图层和小形态的 PNG + 同名 WebP，先写临时文件再换名，目录里多出来的旧文件删掉），
再把这一题那一项写进汇总清单 lockups.js。九题同时跑时，改 lockups.js 这一步排队：
先拿锁 build/.lockups.lock（建不出来就等，超过两分钟没人动的锁当作残留删掉），重新读一遍 lockups.js，只换自己那一项，
写临时文件再换名，最后放锁。别题的那一项原样留着。
"""
import os
import json
import time
import contextlib
import numpy as np
from PIL import Image
from . import paths
from . import fx as F

MANIFEST = os.path.join(paths.LOCKUPS, 'lockups.js')
LOCK = os.path.join(paths.BUILD, '.lockups.lock')
HEADER = ('/* 由生成器写，不要手改：build/lockup.py（一题一个模块）写自己那一题。\n'
          '   十个题名锁定的清单：坐标单位是视频 1920×1080 舞台上的像素，图层是 2 倍图。用法见 设计系统.md「题名锁定」；'
          '页面用 AE.lockup()（ae.js）把它摆出来。webp：每张图层旁边都有同名的 .webp（网页用，AE.lockupWebp(file)）。 */\n')


# ---------------------------------------------------------------- 锁


@contextlib.contextmanager
def manifest_lock(timeout=300, stale=120):
    t0 = time.time()
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f'{os.getpid()} {time.time():.0f}'.encode())
            os.close(fd)
            break
        except FileExistsError:
            try:
                if time.time() - os.path.getmtime(LOCK) > stale:
                    os.remove(LOCK)
                    continue
            except OSError:
                continue
            if time.time() - t0 > timeout:
                raise TimeoutError(f'等清单的锁超过 {timeout} 秒：{LOCK}（确认没有别的生成器在写以后，删掉它再跑）')
            time.sleep(0.2)
    try:
        yield
    finally:
        try:
            os.remove(LOCK)
        except OSError:
            pass


def read_manifest():
    if not os.path.exists(MANIFEST):
        return {'scale': 2, 'webp': True, 'order': [], 'items': {}}
    s = open(MANIFEST, encoding='utf-8').read()
    return json.loads(s[s.index('=') + 1:s.rindex(';')])


def write_atomic(path, data):
    tmp = f'{path}.{os.getpid()}.tmp'
    with open(tmp, 'wb') as f:
        f.write(data)
    for i in range(50):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:   # Windows：别的进程正开着它读
            time.sleep(0.1)
    os.replace(tmp, path)


def update_manifest(key, item):
    """把这一题那一项写进 lockups.js（排队、只换自己那一项）"""
    with manifest_lock():
        m = read_manifest()
        items = dict(m.get('items', {}))
        items[key] = item
        order = [k for k in paths.order() if k in items]
        m = {'scale': 2, 'webp': True, 'order': order, 'items': {k: items[k] for k in order}}
        body = HEADER + 'window.AE_LOCKUPS = ' + json.dumps(m, ensure_ascii=False, separators=(',', ':')) + ';\n'
        write_atomic(MANIFEST, body.encode('utf-8'))


# ---------------------------------------------------------------- 图


def bbox(L, thr=1.0 / 255):
    ys, xs = np.where(L[..., 3] > thr)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop(L, scale, pad=0):
    """裁到不透明的范围，对齐到 scale 的整数倍（舞台坐标是整数）。返回 (图, x, y, w, h)，x y w h 是舞台像素。"""
    b = bbox(L)
    if b is None:
        return None
    x0, y0, x1, y1 = b
    x0, y0 = max(0, x0 - pad * scale), max(0, y0 - pad * scale)
    x1, y1 = min(L.shape[1], x1 + pad * scale), min(L.shape[0], y1 + pad * scale)
    x0, y0 = x0 - x0 % scale, y0 - y0 % scale
    x1, y1 = x1 + (-x1) % scale, y1 + (-y1) % scale
    return L[y0:y1, x0:x1], x0 // scale, y0 // scale, (x1 - x0) // scale, (y1 - y0) // scale


def save_layer(L, path_png):
    """预乘图层 → PNG（直通透明度）+ 同名 WebP（颜色有损、透明度无损）"""
    im = Image.fromarray(F.to_u8(L), 'RGBA')
    for path, kw in ((path_png, dict(format='PNG', compress_level=6)),
                     (path_png[:-4] + '.webp', dict(format='WEBP', quality=86, alpha_quality=100, method=4))):
        tmp = f'{path}.{os.getpid()}.tmp'
        im.save(tmp, **kw)
        for i in range(50):
            try:
                os.replace(tmp, path)
                break
            except PermissionError:
                time.sleep(0.1)


def task_dir(key):
    d = os.path.join(paths.LOCKUPS, key)
    os.makedirs(d, exist_ok=True)
    return d


def prune(key, keep):
    """目录里不在这次输出里的旧文件删掉（只动这一题自己的目录）"""
    d = task_dir(key)
    for f in os.listdir(d):
        p = os.path.join(d, f)
        if os.path.isfile(p) and f not in keep:
            os.remove(p)
