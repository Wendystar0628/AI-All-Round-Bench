"""审美全能网站的图片：作品图从作品素材里挑，立绘直接转，都做成网页用的 WebP（大图加缩略图），
缓存在 website/.build-cache/aesthetics/media/，导出时再拷进数据目录。

每组图一个目录，里面的 shots.json 记着来源文件的大小和修改时间、图片清单（第一张是封面）。来源和参数
都没变就直接用缓存，变了才重做。素材目录只读。

作品素材在 H:/AI_OneShot_Video/aesthetics/<厂商>/<型号>/assets/<题key>/，按下面的顺序认：
  stills/ 有图（白模渲染）：只用这些静帧；
  有录完的视频（*.mkv，同名 JSON 没标未完成）：从视频里挑帧，peek/ 下的定点截图都用上；
  目录里直接放着图片（只交图片的题）：按文件名顺序全用，第一张当封面。

从视频挑帧：每秒取 8 帧做分析，去掉黑屏、平板、交叉淡化中间的帧；每帧按清晰度（拉普拉斯方差）除以
运动量打分，分数不到 MIN_Q 的（运镜或转场里拖糊的帧）不要。把"时间 + 画面变化量"各占一半的轴等分成
10 段，每段取分最高的一帧，再逐张挑和已挑的最不一样的，太像就不要（判重见 pick 里的 apart 和 Distance）。
定点截图和静帧先放进去（彼此重复的只留一张，优先留 full、head 这种有名字的视角），视频帧补在后面。
封面先定：静帧用第一张、定点截图用全景 full，都是题面规定的全景；其余取视频开场 COVER_SECONDS 秒里分最高
的一帧（镜头组从全景开场，整页滚动从首屏开场，游戏界面从标题画面开场），短片取收尾那几秒（片尾的定格画面）。
其余按在视频里的时间排。

  python website/topics/aesthetics/tools/shots.py [--model 厂商/型号] [--task 题key] [--force] [--sheet 目录]
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import io
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
BENCH = HERE.parents[3]
sys.path.insert(0, str(BENCH / 'orchestrator'))

import common  # noqa: E402
import layout  # noqa: E402

TOPIC = 'aesthetics'
CACHE = BENCH / 'website' / '.build-cache' / TOPIC
MEDIA = CACHE / 'media'
IMAGE_TYPES = ('.png', '.jpg', '.jpeg', '.webp')
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)

FULL, THUMB, QUALITY = 1920, 800, 85      # 大图、缩略图的长边上限，WebP 质量
RATE = 8                                  # 分析时每秒取几帧
BINS = 10                                 # 视频轴等分成几段，每段出一张候选
MOST, FEWEST = 12, 8                      # 一件作品最多、至少几张（素材够的话）
SAME, SHAPE = 0.10, 0.30                  # 色差、构图差低于它就算重复（见 Distance）
MIN_Q = 0.3                               # 视频帧的分数下限：中等清晰、中等运动的帧约 0.5
COVER_SECONDS = 5                         # 封面从视频开场（或收尾）这几秒里取
COVER_AT_END = ('film',)                  # 这些段（按视频文件名）的封面取收尾：鹈鹕短片停在冲线照片上
SETTINGS = {'full': FULL, 'thumb': THUMB, 'quality': QUALITY, 'rate': RATE, 'bins': BINS,
            'most': MOST, 'fewest': FEWEST, 'same': SAME, 'shape': SHAPE, 'min_q': MIN_Q,
            'cover_seconds': COVER_SECONDS, 'cover_at_end': list(COVER_AT_END)}

W, H = 320, 180                           # 分析画幅
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


# ---------- 缓存 ----------

@contextmanager
def lock():
    """同一时间只有一个进程写图片缓存（预览刷新和正式发布可能同时导出）。"""
    CACHE.mkdir(parents=True, exist_ok=True)
    with common.singleton(CACHE / 'media.lock', 3600):
        yield


def natural(name):
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r'(\d+)', name)]


def images_in(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted((p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_TYPES),
                  key=lambda p: natural(p.name))


def finished(video: Path) -> bool:
    """录完的视频：同名 JSON（有的话）没有标成未完成。"""
    receipt = video.with_suffix('.json')
    if not receipt.is_file():
        return True
    try:
        meta = json.loads(receipt.read_text(encoding='utf-8-sig'))
    except ValueError:
        return False
    return isinstance(meta, dict) and meta.get('state', '完成') == '完成' and meta.get('complete') is not False


def work_sources(folder: Path) -> dict | None:
    """一件作品的素材，按 stills → 视频（加 peek）→ 散放的图片的顺序认；都没有时 None。"""
    if not folder.is_dir():
        return None
    if stills := images_in(folder / 'stills'):
        return {'stills': stills}
    if videos := [v for v in sorted(folder.glob('*.mkv')) if finished(v)]:
        return {'videos': videos, 'peek': images_in(folder / 'peek')}
    if loose := images_in(folder):
        return {'images': loose}
    return None


def signature(root: Path, files) -> dict:
    return {f.relative_to(root).as_posix(): [f.stat().st_size, f.stat().st_mtime_ns] for f in files}


def last(dest: Path) -> dict | None:
    """上次做好的这组图（shots.json 的内容），没有时 None。"""
    try:
        return json.loads((dest / 'shots.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def cached(dest: Path, sources: dict) -> dict | None:
    old = last(dest)
    return old if old and old.get('sources') == sources and old.get('settings') == SETTINGS else None


def build(dest: Path, sources: dict, make, stem, force=False) -> dict | None:
    """来源签名没变就用缓存；否则用 make() 给的 [(PIL 图, 来历)] 重做整组，第 n 张存成 stem(n)。
    重做失败时打印原因，沿用旧图。"""
    if not force and (old := cached(dest, sources)):
        return old
    staging = dest.with_name(dest.name + '.new')
    try:
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        images = [save(image, staging, stem(n)) | {'from': origin} for n, (image, origin) in enumerate(make(), 1)]
        manifest = {'sources': sources, 'settings': SETTINGS, 'images': images}
        (staging / 'shots.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n',
                                            encoding='utf-8')
        shutil.rmtree(dest, ignore_errors=True)
        staging.rename(dest)
        return manifest
    except Exception as exc:  # 一件作品出错不拖累其他作品和整次导出
        shutil.rmtree(staging, ignore_errors=True)
        print(f'提示：{dest.relative_to(MEDIA).as_posix()} 的图片没做成（{type(exc).__name__}: {exc}），'
              f'{"沿用旧图" if (dest / "shots.json").is_file() else "暂时没有图"}', flush=True)
        return last(dest)


def save(image: Image.Image, folder: Path, stem: str) -> dict:
    """存大图 <stem>.webp 和缩略图 <stem>.thumb.webp，返回文件名和宽高，以及来源图的宽高（立绘的头部框按它
    换算成比例）。透明图保留透明。"""
    source_size = list(image.size)
    image = image.convert('RGBA' if image.mode in ('RGBA', 'LA', 'P', 'PA') else 'RGB')
    if image.mode == 'RGBA' and image.getchannel('A').getextrema()[0] == 255:
        image = image.convert('RGB')
    out = {}
    for prefix, limit, name in (('', FULL, f'{stem}.webp'), ('thumb_', THUMB, f'{stem}.thumb.webp')):
        copy = image.copy()
        copy.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        copy.save(folder / name, 'WEBP', quality=QUALITY, method=6)
        out |= {prefix + 'width': copy.width, prefix + 'height': copy.height}
    return {'file': f'{stem}.webp', 'width': out['width'], 'height': out['height'],
            'thumb': f'{stem}.thumb.webp', 'thumb_width': out['thumb_width'], 'thumb_height': out['thumb_height'],
            'source_size': source_size}


def work(model_key: str, model_id: str, task_key: str, force=False) -> dict | None:
    """一件作品的图（shots.json 的内容，images 第一张是封面），存成 01.webp、02.webp…
    素材不在了（比如清理掉了）就沿用上次做好的图，要撤下时删掉缓存里这个目录；没有素材也没做过时 None。"""
    folder = layout.assets_dir(TOPIC, model_key, task_key)
    dest = MEDIA / 'works' / model_id / task_key
    src = work_sources(folder)
    if src is None:
        return last(dest)
    files = [f for group in src.values() for f in group]
    return build(dest, signature(folder, files), lambda: pick(src, folder), lambda n: f'{n:02d}', force)


def portrait(kind: str, ident: str, source: Path, force=False) -> dict | None:
    """一张立绘（kind 是 models 或 judges），存成 portrait.webp；源文件不在也没做过时 None。"""
    dest = MEDIA / kind / ident
    if not source.is_file():
        return last(dest)
    return build(dest, signature(source.parent, [source]), lambda: [(Image.open(source), source.name)],
                 lambda n: 'portrait', force)


# ---------- 挑图 ----------

def measure(rgb: np.ndarray):
    """320×180 的画面 → (亮度均值、亮度标准差、清晰度)，以及 64×36 的缩略色块。"""
    img = rgb.astype(np.float32) / 255
    g = img @ LUMA
    lap = 4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]
    tiny = (img.reshape(36, 5, 64, 5, 3).mean((1, 3)) * 255).astype(np.uint8)
    return (g.mean(), g.std(), lap.var()), tiny


def analyse(video: Path):
    """视频每秒 RATE 帧的特征：stats (n×3)、tiny (n×36×64×3)。"""
    cmd = [str(layout.ffmpeg()), '-v', 'error', '-i', str(video), '-an', '-vf',
           f'fps={RATE},scale={W}:{H}:flags=area,format=rgb24', '-f', 'rawvideo', '-']
    stats, tiny = [], []
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=NO_WINDOW) as proc:
        size = W * H * 3
        while len(buf := proc.stdout.read(size)) == size:
            s, t = measure(np.frombuffer(buf, np.uint8).reshape(H, W, 3))
            stats.append(s)
            tiny.append(t)
        error = proc.stderr.read().decode('utf-8', 'replace').strip()
    if proc.returncode or not stats:
        raise RuntimeError(f'ffmpeg 读不出 {video.name}：{error or proc.returncode}')
    return np.array(stats, np.float32), np.stack(tiny)


def grab(video: Path, seconds: float) -> Image.Image:
    out = subprocess.run([str(layout.ffmpeg()), '-v', 'error', '-ss', f'{seconds:.3f}', '-i', str(video),
                          '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'bmp', '-'],
                         capture_output=True, check=True, creationflags=NO_WINDOW).stdout
    return Image.open(io.BytesIO(out)).convert('RGB')


def small(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert('RGB').resize((W, H), Image.Resampling.BOX))


class Item:
    """一张候选图：视频帧（video + seconds）或现成的图片（path）。"""
    def __init__(self, origin, stats, tiny, *, video=None, seconds=None, path=None, q=0.0, order=None):
        self.origin, self.stats, self.tiny = origin, stats, tiny
        self.video, self.seconds, self.path = video, seconds, path
        self.q, self.order = q, order

    def image(self):
        return grab(self.video, self.seconds) if self.video else Image.open(self.path).convert('RGB')


def video_items(videos: list[Path], root: Path):
    """各段视频首尾相接成一条时间轴，返回 (全部采样的 Item, 每段一张的候选, 每半段一张的备选)。"""
    samples, offset = [], 0.0
    for video in videos:
        stats, tiny = analyse(video)
        name = video.relative_to(root).as_posix()
        samples += [Item(f'{name} {i / RATE:.2f}s', s, t, video=video, seconds=i / RATE, order=offset + i / RATE)
                    for i, (s, t) in enumerate(zip(stats, tiny))]
        offset += len(stats) / RATE
    stats = np.array([x.stats for x in samples])
    mean, std, sharp = stats[:, 0], stats[:, 1], stats[:, 2]
    g = (np.stack([x.tiny for x in samples]).astype(np.float32) / 255) @ LUMA
    n = len(samples)
    step = np.abs(np.diff(g, axis=0)).mean((1, 2)) if n > 1 else np.zeros(0)
    motion = np.maximum(np.r_[step[:1], step], np.r_[step, step[-1:]]) if n > 1 else np.zeros(n)
    # 交叉淡化：这一帧几乎等于前后各 0.25 秒两帧的平均，而前后两帧差得多
    fade = np.zeros(n, np.float32)
    if n > 4:
        a, b, c = g[:-4], g[2:-2], g[4:]
        d = np.abs(c - a).mean((1, 2))
        r = np.abs(b - (a + c) / 2).mean((1, 2))
        fade[2:-2] = np.where(d > 0.02, np.clip(1 - 2 * r / np.maximum(d, 1e-6), 0, 1), 0)
    usable = (mean > 0.05) & (std > 0.03) & (fade < 0.5)
    if not usable.any():
        return samples, [], []
    rel = np.clip(sharp / np.median(sharp[usable]), 0, 2)
    q = np.where(usable, rel / (1 + motion / (np.median(motion[usable]) + 1e-4)), 0)
    for x, v in zip(samples, q):
        x.q = float(v)
    # 轴：时间和画面变化量各占一半，变化快的地方多分到几段
    coarse = np.stack([x.tiny for x in samples]).astype(np.float32).reshape(n, 9, 4, 16, 4, 3).mean((2, 4))
    change = np.r_[0, np.sqrt(((coarse[1:] - coarse[:-1]) ** 2).mean((1, 2, 3)))]
    axis = 0.5 * np.arange(n) / max(n - 1, 1) + 0.5 * np.cumsum(change) / max(change.sum(), 1e-6)

    def per_bin(bins):
        out = []
        for b in range(bins):
            idx = np.where((axis >= b / bins) & ((axis < (b + 1) / bins) | (b == bins - 1)) & usable)[0]
            if len(idx):
                out.append(samples[idx[np.argmax(q[idx])]])
        return out
    return samples, per_bin(BINS), per_bin(BINS * 2)


def still_items(paths: list[Path], root: Path):
    items = []
    for p in paths:
        s, t = measure(small(Image.open(p)))
        items.append(Item(p.relative_to(root).as_posix(), s, t, path=p))
    return items


class Distance:
    """两张图有多不一样，给两个数，都容许 ±2 列、±1 行的平移：
    色差：16×9 粗网格的色差和 6×6×6 颜色直方图差各占一半，色块先按这件作品自己的亮度范围拉开，暗的作品也比得出；
    构图差：16×9 亮度网格各自归一化后的差，只看明暗结构，同一画面只换了色调时很小。"""
    def __init__(self, items):
        lo, hi = np.percentile(np.stack([x.tiny for x in items]), [2, 98]) if items else (0, 255)
        self.scale = (lo, max(hi - lo, 1))
        self.cache = {}

    def prepare(self, x):
        if id(x) not in self.cache:
            norm = np.clip((x.tiny.astype(np.float32) - self.scale[0]) / self.scale[1], 0, 1)
            grid = norm.reshape(9, 4, 16, 4, 3).mean((1, 3))
            hist, _ = np.histogramdd(norm.reshape(-1, 3), bins=6, range=[(0, 1)] * 3)
            luma = ((x.tiny.astype(np.float32) / 255) @ LUMA).reshape(9, 4, 16, 4).mean((1, 3))
            self.cache[id(x)] = grid, hist.ravel() / hist.sum(), luma
        return self.cache[id(x)]

    def __call__(self, a, b):
        (ga, ha, la), (gb, hb, lb) = self.prepare(a), self.prepare(b)
        colour = shape = 9.0
        for dy in (-1, 0, 1):
            for dx in (-2, -1, 0, 1, 2):
                window = (slice(max(0, dy), 9 + min(0, dy)), slice(max(0, dx), 16 + min(0, dx)))
                other = (slice(max(0, -dy), 9 + min(0, -dy)), slice(max(0, -dx), 16 + min(0, -dx)))
                colour = min(colour, float(np.sqrt(((ga[window] - gb[other]) ** 2).mean())))
                A, B = la[window], lb[other]
                A, B = (A - A.mean()) / (A.std() + 1e-3), (B - B.mean()) / (B.std() + 1e-3)
                shape = min(shape, float(np.sqrt(((A - B) ** 2).mean())))
        return 0.5 * (colour + 0.5 * float(np.abs(ha - hb).sum())), shape


def usable_still(x: Item) -> bool:
    mean, std = x.stats[0], x.stats[1]
    return mean > 0.05 and std > 0.03


def pick(src: dict, root: Path):
    """按上面的规则挑一件作品的图，返回 [(PIL 图, 来历)]，第一张是封面。"""
    if 'images' in src:
        return [(Image.open(p), p.relative_to(root).as_posix()) for p in src['images']]
    seeds = still_items(src.get('stills') or src.get('peek') or [], root)
    samples, first, extra = video_items(src['videos'], root) if 'videos' in src else ([], [], [])
    base = samples or seeds
    good = [x for x in base if (x.q > 0 if samples else usable_still(x))]
    sharp = np.median([x.stats[2] for x in good]) if good else 1.0
    for x in seeds:
        x.q = float(np.clip(x.stats[2] / max(sharp, 1e-9), 0, 2)) if usable_still(x) else 0.0
    dist = Distance(seeds + samples[::4])

    def apart(a, b):
        """距离除以门槛，小于 1 算重复：色差低于 SAME，或者构图差低于 SHAPE（同一画面只换了色调）。
        视频时间轴上相隔 6 秒内的两张多半是同一段运镜里的同一处，色差门槛放宽到 3 倍；定点截图是运镜里
        停下来的地方，镜头常在附近徘徊、回到这里，和视频帧比时 12 秒内也放宽到 2 倍。"""
        colour, shape = dist(a, b)
        gap = abs(a.order - b.order) if a.order is not None and b.order is not None else 99
        still = a.video is None or b.video is None
        return min(colour / (SAME * (3 if gap < 6 else 2 if gap < 12 and still else 1)), shape / SHAPE)

    # 定点截图对上视频里最像的一帧，记下那一帧的时间：用来认出同一个镜头，也用来排顺序；对不上的（特写、全景）不记
    if samples:
        for x in seeds:
            nearest = min(samples[::2], key=lambda s: apart(x, s))
            x.order = nearest.order if apart(x, nearest) < 1.5 else None
    # 有名字的定点截图（全景 full、特写 head）是专门挑的视角，和按进度截的 00、20…重复时留它们
    named = sorted(seeds, key=lambda x: (x.path.stem.isdigit(), natural(x.path.name)))
    for x in named:
        if x.q == 0:
            print(f'提示：{x.origin} 像是黑屏或空白，没有用', flush=True)
    named = [x for x in named if x.q > 0]
    # 封面先定（见文件开头）
    full = [x for x in named if x.path.stem.lower() == 'full']
    if 'stills' in src or full:
        cover = (full or named)[0] if named else None
    else:
        window = []
        if samples:
            end = src['videos'][-1].stem in COVER_AT_END
            total = samples[-1].order
            window = [x for x in samples if x.q > 0
                      and (x.order >= total - COVER_SECONDS if end else x.order <= COVER_SECONDS)]
        cover = max(window or first or named, key=lambda x: x.q, default=None)
    if cover is None:
        return []
    kept = [cover]
    for x in named:
        if all(apart(x, k) >= 1 for k in kept):
            kept.append(x)

    def fill(pool):
        pool = [x for x in pool if x not in kept and x.q >= MIN_Q]
        while pool and len(kept) < MOST:
            score = [min(apart(x, k) for k in kept) for x in pool]
            i = int(np.argmax(score))
            if score[i] < 1:
                break
            kept.append(pool.pop(i))
    fill(first)
    if len(kept) < FEWEST:
        fill(extra)
    # 其余按时间排；没有时间的（静帧、对不上视频的定点截图）按文件名排在前面
    rest = sorted(kept[1:], key=lambda x: (x.order is not None, x.order or 0, natural(x.origin)))
    return [(x.image(), x.origin) for x in [cover, *rest]]


# ---------- 命令行 ----------

def sheet(manifest: dict, folder: Path, out: Path, title: str):
    """把一组缩略图拼成一张核对用的总览，封面标红框。"""
    cols, w, h = 4, 400, 225
    rows = (len(manifest['images']) + cols - 1) // cols
    board = Image.new('RGB', (cols * w, rows * (h + 18) + 24), 'white')
    draw = ImageDraw.Draw(board)
    draw.text((6, 6), title, fill='black')
    for n, item in enumerate(manifest['images']):
        im = Image.open(folder / item['thumb']).convert('RGB')
        im.thumbnail((w - 4, h - 4))
        x, y = (n % cols) * w, 24 + (n // cols) * (h + 18)
        board.paste(im, (x + 2, y + 2))
        if n == 0:
            draw.rectangle([x, y, x + w - 1, y + h - 1], outline='red', width=3)
        draw.text((x + 4, y + h + 2), f'{n + 1:02d}  {item["from"]}', fill='black')
    out.parent.mkdir(parents=True, exist_ok=True)
    board.save(out, quality=88)


def main(argv=None):
    from topic import topic as registered_topic
    import models
    ap = argparse.ArgumentParser(description='做审美全能网站的作品图和立绘（有缓存，来源没变不重做）')
    ap.add_argument('--model', action='append', default=[], help='厂商/型号 或网址标识，可重复；不给就全做')
    ap.add_argument('--task', action='append', default=[], help='题 key，可重复；不给就全做')
    ap.add_argument('--force', action='store_true', help='来源没变也重做')
    ap.add_argument('--sheet', type=Path, help='把每件作品挑出的图拼成总览图放到这个目录，供人核对')
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding='utf-8')
    scope = registered_topic(TOPIC)
    catalog = {m.key: m for m in models.identities(include_private=True)}
    people = [catalog[key] for key in scope.participants(include_private=True)
              if not args.model or catalog[key].key in args.model or catalog[key].id in args.model]
    if args.model and not people or set(args.task) - {t.key for t in scope.tasks.values()}:
        raise SystemExit('没有这个参测型号或题 key：' + '、'.join(args.model + args.task))
    with lock():
        for m in people:
            for task in scope.tasks.values():
                if args.task and task.key not in args.task:
                    continue
                manifest = work(m.key, m.id, task.key, args.force)
                count = len(manifest['images']) if manifest else 0
                print(f'{m.id:<20} {task.key:<24} {count:>2} 张', flush=True)
                if manifest and count and args.sheet:
                    sheet(manifest, MEDIA / 'works' / m.id / task.key, args.sheet / f'{m.id}__{task.key}.jpg',
                          f'{m.id} / {task.key}')


if __name__ == '__main__':
    main()
