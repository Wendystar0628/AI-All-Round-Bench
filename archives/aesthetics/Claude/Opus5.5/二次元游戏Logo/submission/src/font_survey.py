"""底字候选：几款字体并排排出三组字，挑横竖对比、字重和字怀最接近方言的底字。"""
import os
import numpy as np
from PIL import Image, ImageDraw
from gb import Font, G, WORK, fp, proof
from glyphbase.canvas import raster

CANDS = [
    ('SourceHanSansCN-Heavy.otf', 0, {}),
    ('SourceHanSansCN-Bold.otf', 0, {}),
    ('SourceHanSansCN-Medium.otf', 0, {}),
    ('SourceHanSerifCN-Heavy.otf', 0, {}),
    ('SourceHanSerifCN-SemiBold.otf', 0, {}),
    ('NotoSerifSC-VF.ttf', 0, {'wght': 600}),
    ('HarmonyOS_Sans_SC_Black.ttf', 0, {}),
    ('AlimamaShuHeiTi-Bold.ttf', 0, {}),
    ('汇文明朝体.otf', 0, {}),
    ('STKAITI.TTF', 0, {}),
]
TEXTS = ['终末地明日方舟', '星穹铁道崩坏', '鸣潮']

rows = []
lab = proof.label_font(22)
for fn, idx, ax in CANDS:
    F = Font(fp(fn), idx, **ax)
    for t in TEXTS:
        pass
    row_imgs = []
    for t in TEXTS:
        p, w = F.line(t)
        H = 150
        k = H / 1000.0
        W = int(w * k) + 20
        M = (k, 0, 0, -k, 10, 880 * k + 10)
        m = raster(p, W, H + 20, M, ss=2)
        row_imgs.append((255 - m * 255).astype(np.uint8))
    Wt = sum(r.shape[1] for r in row_imgs) + 60 + 360
    img = Image.new('L', (Wt, 175), 255)
    d = ImageDraw.Draw(img)
    d.text((10, 70), F.name[:28], fill=0, font=lab)
    x = 360
    for r in row_imgs:
        img.paste(Image.fromarray(r), (x, 0))
        x += r.shape[1] + 30
    rows.append(img)

Wm = max(r.width for r in rows)
sheet = Image.new('L', (Wm, sum(r.height for r in rows)), 255)
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height
os.makedirs(WORK, exist_ok=True)
sheet.save(os.path.join(WORK, 'font_survey.png'))
print('ok', sheet.size)
