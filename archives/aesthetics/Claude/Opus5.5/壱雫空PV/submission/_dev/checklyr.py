# Overlay the final per-character onsets (from js/lyrics.js, exported by the page) on the vocal
# pitch-salience view, one panel per lyric line, three lines per image. (dev only)
import numpy as np, os, sys, json
from PIL import Image, ImageDraw

D = os.path.dirname(os.path.abspath(__file__))
OUTDIR = sys.argv[1]
z = np.load(os.path.join(D, 'out', 'sal.npz'))
sal, midi, times = z['sal'], z['midi'], z['times']
LY = json.load(open(os.path.join(D, 'out', 'lyrics_final.json'), encoding='utf-8'))
BEAT = 60 / 204
g = sal / (np.percentile(sal, 99.7) + 1e-9)
rel = sal / (sal.max(1, keepdims=True) + 1e-9)
V = np.clip(g, 0, 1) ** 0.6 * np.clip(rel, 0, 1) ** 2
lo = np.searchsorted(midi, 55); hi = np.searchsorted(midi, 80)
PX = 260
PH = (hi - lo) * 3

def panel(L):
    t0 = L['t'] - 0.45
    t1 = L['end'] + 0.25
    W = int((t1 - t0) * PX) + 60
    im = Image.new('RGB', (W, PH + 46), 'white')
    arr = np.full((PH, W - 40, 3), 255, np.uint8)
    m = (times >= t0) & (times < t1)
    for t, col in zip(times[m], V[m]):
        x = int((t - t0) * PX)
        v = np.repeat(col[lo:hi][::-1], 3)
        for xx in range(x, min(W - 40, x + 3)):
            arr[:, xx, 0] = (255 * (1 - v)).astype(np.uint8)
            arr[:, xx, 1] = (255 * (1 - v)).astype(np.uint8)
            arr[:, xx, 2] = (255 * (1 - 0.3 * v)).astype(np.uint8)
    im.paste(Image.fromarray(arr), (20, 0))
    dr = ImageDraw.Draw(im)
    # beat grid (8ths)
    b = int(np.floor((t0 - 0.045) / (BEAT / 2)))
    while True:
        tb = 0.045 + b * BEAT / 2
        if tb > t1: break
        if tb >= t0:
            x = int((tb - t0) * PX) + 20
            col = (255, 120, 120) if b % 8 == 0 else ((170, 170, 235) if b % 2 == 0 else (225, 225, 225))
            dr.line([(x, 0), (x, PH)], fill=col)
            if b % 8 == 0: dr.text((x + 2, PH + 2), 'bar%d' % (b // 8 + 1), fill=(200, 0, 0))
        b += 1
    # char ticks
    k = 0
    for ch, t in L['chars']:
        if t is None: continue
        k += 1
        x = int((t - t0) * PX) + 20
        dr.line([(x, 0), (x, PH)], fill=(255, 110, 0), width=2)
        dr.text((x + 3, 4 + (k % 2) * 12), str(k), fill=(210, 60, 0))
    xe = int((L['end'] - t0) * PX) + 20
    dr.line([(xe, 0), (xe, PH)], fill=(0, 0, 0), width=2)
    for s in np.arange(np.ceil(t0 * 2) / 2, t1, 0.5):
        x = int((s - t0) * PX) + 20
        dr.text((x, PH + 16), '%.1f' % s, fill=(0, 0, 0))
    dr.text((W - 70, PH + 30), 'L%d' % L['id'], fill=(0, 0, 160))
    return im

panels = [panel(L) for L in LY]
for gi in range(0, len(panels), 3):
    grp = panels[gi:gi + 3]
    Wm = max(p.size[0] for p in grp); Hs = sum(p.size[1] for p in grp) + 8 * len(grp)
    sheet = Image.new('RGB', (Wm, Hs), (40, 40, 40))
    y = 0
    for p in grp:
        sheet.paste(p, (0, y)); y += p.size[1] + 8
    sheet.save(os.path.join(OUTDIR, 'lyr_%02d.png' % (gi // 3)))
print('ok', len(panels))
