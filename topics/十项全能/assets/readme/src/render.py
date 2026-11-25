"""Colour the category icons and render README figures to PNG with headless Chrome.

python render.py icons        only colours the icons (see below).
python render.py [name ...]   colours the icons, then renders figs/<name>.html (all figures when no name is given)
                              to ../<name>.png at 2x.
python render.py path\\to\\page.html   renders any other page (for example icons-preview.html) to a PNG beside it.
Each page declares its CSS size with <meta name="size" content="960x540">.

The single source of the category icons is topics/十项全能/设计/icons/categories/<key>.svg (currentColor).
README and figures need them in violet, so every run writes ../icon-<key>.svg from that source; never edit those copies.
"""
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # topics/十项全能/assets/readme/src
OUT = HERE.parent                               # topics/十项全能/assets/readme
ICONS = HERE.parents[2] / '设计' / 'icons' / 'categories'
VIOLET = '#9859FF'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'


def colour_icons():
    sources = sorted(ICONS.glob('*.svg'))
    if not sources:
        sys.exit(f'no category icons in {ICONS}')
    for src in sources:
        (OUT / f'icon-{src.stem}.svg').write_bytes(src.read_bytes().replace(b'currentColor', VIOLET.encode()))
    print(f'{len(sources)} icons coloured {VIOLET}: icon-<key>.svg')


args = sys.argv[1:]
colour_icons()
if args == ['icons']:
    sys.exit(0)
names = args or [p.stem for p in sorted((HERE / 'figs').glob('*.html'))]
for name in names:
    if name.endswith('.html'):
        src = Path(name).resolve()
        out = src.with_suffix('.png')
    else:
        src = HERE / 'figs' / f'{name}.html'
        out = OUT / f'{name}.png'
    m = re.search(r'<meta name="size" content="(\d+)x(\d+)">', src.read_text(encoding='utf-8'))
    if not m:
        sys.exit(f'{src} has no <meta name="size" content="WxH">')
    w, h = m.groups()
    # Headless Chrome's layout viewport can be wider than the screenshot, so pin the page to the declared size.
    pinned = src.with_name(f'.{src.stem}.render.html')
    pinned.write_text(src.read_text(encoding='utf-8').replace(
        '</head>', f'<style>html,body{{width:{w}px;height:{h}px;position:relative;overflow:hidden}}</style></head>', 1),
        encoding='utf-8')
    # --do-not-de-elevate: from an elevated shell Chrome would relaunch itself unelevated and never write the file.
    subprocess.run([CHROME, '--headless=new', '--do-not-de-elevate', '--hide-scrollbars', '--default-background-color=00000000',
                    '--force-device-scale-factor=2', f'--window-size={w},{h}', '--virtual-time-budget=3000',
                    f'--screenshot={out}', pinned.as_uri()], check=True, capture_output=True, timeout=60)
    pinned.unlink()
    print(f'{out.name}  ({w}x{h} css, {out.stat().st_size // 1024} KB)')
