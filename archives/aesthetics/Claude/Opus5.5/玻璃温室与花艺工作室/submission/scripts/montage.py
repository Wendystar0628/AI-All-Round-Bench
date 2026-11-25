"""Contact sheet: blender -b --python montage.py -- <out.png> <cols> <thumb_w> <img1> <img2> ..."""
import bpy
import sys
import numpy as np
argv = sys.argv[sys.argv.index("--") + 1:]
out, cols, tw = argv[0], int(argv[1]), int(argv[2])
files = argv[3:]
th = int(tw * 9 / 16)
rows = (len(files) + cols - 1) // cols
canvas = np.zeros((rows * th, cols * tw, 4), dtype=np.float32)
canvas[..., 3] = 1.0
for i, f in enumerate(files):
    img = bpy.data.images.load(f)
    img.scale(tw, th)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(th, tw, 4)
    r, c = divmod(i, cols)
    y0 = (rows - 1 - r) * th
    canvas[y0:y0 + th, c * tw:(c + 1) * tw, :] = px
    bpy.data.images.remove(img)
res = bpy.data.images.new("montage", cols * tw, rows * th, alpha=False)
res.pixels[:] = canvas.ravel()
res.filepath_raw = out
res.file_format = 'PNG'
res.save()
print("MONTAGE", out)
