import numpy as np, os, sys
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__))
z = np.load(os.path.join(D, 'out', 'sal.npz'))
sal, midi, times = z['sal'], z['midi'], z['times']
BEAT = 60 / 204
lrc = [0.923, 3.361, 5.665, 18.860, 22.893, 24.535, 27.617, 29.878, 32.387, 34.558, 37.045, 41.872, 46.542,
       51.053, 55.450, 58.544, 62.157, 64.542, 69.054, 71.527, 74.948, 81.43]
# per-frame normalisation (relative salience) blended with global
g = sal / (np.percentile(sal, 99.7) + 1e-9)
rel = sal / (sal.max(1, keepdims=True) + 1e-9)
img_v = np.clip(g, 0, 1) ** 0.6 * np.clip(rel, 0, 1) ** 2
out = sys.argv[1]
t0 = float(sys.argv[2]); t1 = float(sys.argv[3])
PX = 300
m = (times >= t0) & (times < t1)
cols = img_v[m]
Hh = len(midi) * 3
W = int((t1 - t0) * PX)
im = Image.new('RGB', (W + 40, Hh + 30), 'white')
arr = np.zeros((Hh, W, 3), np.uint8) + 255
ts = times[m]
for i, t in enumerate(ts):
    x = int((t - t0) * PX)
    for xx in range(x, min(W, x + 4)):
        col = cols[i][::-1]
        v = np.repeat(col, 3)
        arr[:, xx, 0] = (255 * (1 - v)).astype(np.uint8)
        arr[:, xx, 1] = (255 * (1 - v)).astype(np.uint8)
        arr[:, xx, 2] = (255 * (1 - 0.3 * v)).astype(np.uint8)
im.paste(Image.fromarray(arr), (20, 0))
dr = ImageDraw.Draw(im)
b = 0
while True:
    tb = 0.045 + b * BEAT / 4
    if tb > t1: break
    if tb >= t0:
        x = int((tb - t0) * PX) + 20
        if b % 16 == 0: col = (255, 0, 0)
        elif b % 4 == 0: col = (120, 120, 255)
        elif b % 2 == 0: col = (200, 200, 200)
        else: col = None
        if col:
            dr.line([(x, 0), (x, Hh)], fill=col)
        if b % 16 == 0:
            dr.text((x + 2, Hh + 2), 'bar%d' % (b // 16 + 1), fill=(200, 0, 0))
        elif b % 4 == 0:
            dr.text((x + 2, Hh + 2), '%d' % (b % 16 // 4 + 1), fill=(80, 80, 200))
    b += 1
for i, tt in enumerate(lrc):
    if t0 <= tt < t1:
        x = int((tt - t0) * PX) + 20
        dr.line([(x, 0), (x, Hh)], fill=(0, 160, 0), width=2)
        dr.text((x + 3, 10), 'L%d' % (i + 1), fill=(0, 120, 0))
for s in np.arange(np.ceil(t0 * 2) / 2, t1, 0.5):
    x = int((s - t0) * PX) + 20
    dr.text((x, Hh + 15), '%.1f' % s, fill=(0, 0, 0))
# pitch labels every octave
for mm in range(55, 84, 12):
    y = Hh - int((mm - midi[0]) / 0.25 * 3)
    dr.text((0, y - 5), str(mm), fill=(0, 0, 0))
im.save(out)
