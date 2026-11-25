import sys, json, os
sys.argv = [sys.argv[0]] + sys.argv[1:]
out, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pitchplot.py'), encoding='utf-8').read())
from PIL import Image, ImageDraw
im = Image.open(out); dr = ImageDraw.Draw(im)
A = json.load(open(os.path.join(D, 'out', 'align.json'), encoding='utf-8'))
for line in A:
    for t, r in zip(line['mora'], line['rom']):
        if t0 <= t < t1:
            x = int((t - t0) * PX) + 20
            dr.line([(x, 30), (x, Hh)], fill=(255, 120, 0), width=1)
            dr.text((x + 2, 40 + (hash(r) % 3) * 12), r.replace('*', ''), fill=(200, 60, 0))
    e = line['e']
    if t0 <= e < t1:
        x = int((e - t0) * PX) + 20
        dr.line([(x, 0), (x, Hh)], fill=(0, 0, 0), width=2)
im.save(out)
