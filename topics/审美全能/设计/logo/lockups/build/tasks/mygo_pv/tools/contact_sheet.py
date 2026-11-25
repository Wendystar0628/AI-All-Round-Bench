"""片头一格的入场接触表：把 shot.mjs 截的几帧（<前缀>-<秒>.png，小数点换成下划线）排成 4 列，标出时刻和本格内的偏移。
用法：python contact_sheet.py <前缀> <本格起点秒> <输出.png> 4.8,4.86,4.92,...
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont
pre, t0, out, ts = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4].split(',')
FONTS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), *['..'] * 6, 'fonts'))   # 设计/fonts/
font = ImageFont.truetype(os.path.join(FONTS, 'SourceHanSerifCN-SemiBold.otf'), 22)
cw, ch, lab, cols = 640, 360, 56, 4
rows = (len(ts) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * (ch + lab) + lab), (10, 12, 16))
d = ImageDraw.Draw(sheet)
for i, t in enumerate(ts):
    im = Image.open(f"{pre}-{t.replace('.', '_')}.png").convert('RGB').resize((cw, ch), Image.LANCZOS)
    x, y = (i % cols) * cw, (i // cols) * (ch + lab) + lab
    sheet.paste(im, (x, y))
    d.text((x + 8, y - 42), f'{t} 秒（本格 +{float(t) - t0:.2f}）', fill=(230, 222, 208), font=font)
sheet.save(out)
