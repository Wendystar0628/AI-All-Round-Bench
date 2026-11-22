"""Render the platform README figures: figs/<name>.html -> ../<name>.png (Chinese) and ../<name>-en.png (English).

python render.py [name ...]   all figures when no name is given.

Each page holds both languages and shows one by <html lang>: elements with class "zh" or "en", or scripts reading
document.documentElement.lang. <meta name="size"> is the Chinese canvas; an optional <meta name="size-en"> replaces it
for English. Styles, fonts, decor and the screenshot itself come from the decathlon figure kit
(专题/十项全能/assets/readme/src: tokens.css, render.py); rules for the look are in its README.md.
"""
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent                     # 平台/自述配图/src
OUT = HERE.parent                                          # 平台/自述配图
KIT = HERE.parents[2] / '专题' / '十项全能' / 'assets' / 'readme' / 'src'

names = sys.argv[1:] or [p.stem for p in sorted((HERE / 'figs').glob('*.html')) if not p.stem.startswith(('.', '_'))]
for name in names:
    src = HERE / 'figs' / f'{name}.html'
    text = src.read_text(encoding='utf-8')
    for suffix, lang in (('', 'zh-CN'), ('-en', 'en')):
        page = re.sub(r'<html lang="[^"]*">', f'<html lang="{lang}">', text, count=1)
        if lang == 'en' and (m := re.search(r'<meta name="size-en" content="(\d+x\d+)">', page)):
            page = re.sub(r'<meta name="size" content="\d+x\d+">', f'<meta name="size" content="{m[1]}">', page, count=1)
        tmp = src.with_name(f'_{name}{suffix}.html')
        tmp.write_text(page, encoding='utf-8')
        try:
            subprocess.run([sys.executable, str(KIT / 'render.py'), str(tmp)], check=True, capture_output=True)
            tmp.with_suffix('.png').replace(OUT / f'{name}{suffix}.png')
            print(f'{name}{suffix}.png')
        finally:
            tmp.unlink(missing_ok=True)
