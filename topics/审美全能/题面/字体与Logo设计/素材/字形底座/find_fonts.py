"""列出能覆盖给定一串字的字体。

    python 素材\\字形底座\\find_fonts.py 永字八法
    python 素材\\字形底座\\find_fonts.py 永字八法 --dir C:\\Windows\\Fonts

每行：文件路径、TTC 里的序号（#n）、字体名，可变字体再列出各轴的范围。要读几百个字体的字符表，会跑一会儿。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(errors='replace')   # 字体名里有控制台编码写不出的字时不中断

from glyphbase.fonts import find_fonts, FONT_DIR  # noqa: E402


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return
    text = argv[0]
    folder = argv[argv.index('--dir') + 1] if '--dir' in argv else FONT_DIR
    hits = find_fonts(text, folder)
    for h in hits:
        idx = f"#{h['index']}" if h['path'].lower().endswith(('.ttc', '.otc')) else ''
        axes = ('  可变：' + ', '.join(f'{t} {lo:g}–{hi:g}（默认 {df:g}）' for t, lo, df, hi in h['axes'])) if h['axes'] else ''
        print(f"{h['path']}{idx}  {h['name']}{axes}")
    print(f'共 {len(hits)} 款字体能覆盖「{text}」')


if __name__ == '__main__':
    main(sys.argv[1:])
