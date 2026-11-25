import sys, json, os
out, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pitchplot.py'), encoding='utf-8').read())
from PIL import Image, ImageDraw
im = Image.open(out); dr = ImageDraw.Draw(im)
notes = json.load(open(os.path.join(D, 'out', 'notes.json')))
for a, b, p, k in notes:
    if b < t0 or a > t1: continue
    x0 = int((a - t0) * PX) + 20; x1 = int((b - t0) * PX) + 20
    y = Hh - int((p - midi[0]) / 0.25 * 3)
    dr.rectangle([x0, y + 6, x1, y + 9], fill=(255, 80, 0) if k == 'v' else (0, 170, 80))
    dr.line([(x0, y - 12), (x0, y + 12)], fill=(255, 0, 0), width=2)
    dr.text((x0 + 2, y + 10), '%.2f' % a, fill=(150, 0, 0))
im.save(out)
