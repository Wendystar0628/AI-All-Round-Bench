import base64
import glob
import json
import os
import re
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
from fontTools.subset import Subsetter, Options

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# Essential vocabulary guaranteed to be included (forging, motion design, AE terms, poetic & test chars)
EXTRA_CHARS = (
    "锻铸锋炼铁钢焰火金字铭熔炽鼎锤剑盾炉固器明雷晶星光影"
    "动效设计编辑合成图层关键帧曲线节点粒子碰撞材质灯光摄像机"
    "时间空间变形风雷山海天地龙虎魂骨刃匠魄玄青铜墨韵书画印玺"
    "诗意春夏秋冬日月星辰暗冷暖刚柔虚实黑白红橙黄绿蓝紫灰银铂"
    "测试演示你好世界欢迎使用中国汉字书法篆刻雕塑艺术工坊力量"
    "爆发冲击回弹冷却定型重塑淬火熔岩火花余烬微尘烟雾波纹脉冲"
    "旋转缩放位移锚点父级子层蒙版遮罩发光投影模糊羽化混合模式"
    "速度值缓入缓出定格线性贝塞尔表达式循环抖动预合成重映射快门"
    "平行点光环境反射金属粗糙不透明景深焦距光圈阴影法线倒角挤出"
    "路径形状矩形椭圆描边填充修剪重复并集差集交集形变孔洞三角"
    "图钉弯曲扭转旋涡噪声衰减吸引排斥阻力寿命拖尾轨迹次级发射"
    "音色配乐音效节奏鼓点共鸣滤波混响音量波形同步撤销重做保存"
    "，。！？、：；“”‘’（）【】《》—…·「」『』￥℃°×÷±"
)

def collect_top_chars(target_cjk=1500):
    chars = set()
    # Printable ASCII
    for cp in range(0x20, 0x7F):
        chars.add(chr(cp))
    for ch in EXTRA_CHARS:
        chars.add(ch)

    # Pull highest-frequency Chinese characters from Noto Serif SC slices 119 down to 105
    serif_files = glob.glob('node_modules/@fontsource/noto-serif-sc/files/*-900-normal.woff')
    numbered = []
    for f in serif_files:
        m = re.search(r'-(\d+)-900-normal\.woff$', f)
        if m:
            numbered.append((int(m.group(1)), f))
    numbered.sort(key=lambda x: -x[0])

    cjk_count = sum(1 for c in chars if 0x4E00 <= ord(c) <= 0x9FFF)
    for num, path in numbered:
        if cjk_count >= target_cjk:
            break
        tt = TTFont(path)
        cmap = tt.getBestCmap() or {}
        for cp in sorted(cmap.keys()):
            if 0x4E00 <= cp <= 0x9FFF:
                ch = chr(cp)
                if ch not in chars:
                    chars.add(ch)
                    cjk_count += 1
                    if cjk_count >= target_cjk:
                        break
    return chars

def build_merged_ttf(woff_glob, target_chars, out_ttf_path, font_name):
    files = sorted(glob.glob(woff_glob))
    needed_cps = set(ord(c) for c in target_chars)
    selected_paths = []
    covered = set()

    # Keep only woff files that contain at least one desired codepoint
    tmp_dir = os.path.join(ROOT, '.tmp_font_build')
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_ttfs = []

    for idx, f in enumerate(files):
        tt = TTFont(f)
        cmap = tt.getBestCmap() or {}
        hit = needed_cps.intersection(cmap.keys()) - covered
        if not hit:
            tt.close()
            continue
        # Subset this chunk to only the uncollected hits (plus space if first)
        opts = Options()
        opts.layout_features = []
        opts.hinting = False
        opts.desubroutinize = True
        opts.notdef_glyph = True
        opts.notdef_outline = True
        opts.drop_tables = ['DSIG', 'GPOS', 'GSUB', 'BASE', 'GDEF', 'STAT', 'gasp', 'vhea', 'vmtx', 'VORG']
        subsetter = Subsetter(options=opts)
        subsetter.populate(unicodes=hit)
        subsetter.subset(tt)
        tt.flavor = None  # convert WOFF -> raw TTF/OTF
        tmp_path = os.path.join(tmp_dir, f'{font_name}_{idx}.ttf')
        tt.save(tmp_path)
        tt.close()
        tmp_ttfs.append(tmp_path)
        covered.update(hit)

    print(f'[{font_name}] Merging {len(tmp_ttfs)} chunks covering {len(covered)} chars...')
    merger = Merger()
    merged = merger.merge(tmp_ttfs)
    merged.flavor = None
    merged.save(out_ttf_path)
    merged.close()

    # Clean tmp files
    for p in tmp_ttfs:
        try:
            os.remove(p)
        except OSError:
            pass
    try:
        os.rmdir(tmp_dir)
    except OSError:
        pass

    size_kb = os.path.getsize(out_ttf_path) / 1024
    print(f'[{font_name}] Built {out_ttf_path} ({size_kb:.1f} KB, {len(covered)} glyphs)')
    return sorted(covered)

def build_stroke_data(target_chars):
    strokes_map = {}
    for ch in sorted(target_chars):
        cp = ord(ch)
        if not (0x4E00 <= cp <= 0x9FFF):
            continue
        p = os.path.join('node_modules', 'hanzi-writer-data', f'{ch}.json')
        if not os.path.exists(p):
            continue
        with open(p, 'r', encoding='utf-8') as fh:
            d = json.load(fh)
        # Compact medians: keep each stroke median as flat int array [x0,y0,x1,y1,...]
        # and stroke SVG paths rounded/trimmed
        medians = []
        for m in d.get('medians', []):
            flat = []
            for pt in m:
                flat.append(int(round(pt[0])))
                flat.append(int(round(pt[1])))
            medians.append(flat)
        strokes = [re.sub(r'\s+', ' ', s).strip() for s in d.get('strokes', [])]
        strokes_map[ch] = {'s': strokes, 'm': medians}
    return strokes_map

def main():
    os.makedirs('assets', exist_ok=True)
    target_chars = collect_top_chars(target_cjk=1500)
    print(f'Total target chars: {len(target_chars)} (CJK: {sum(1 for c in target_chars if 0x4E00 <= ord(c) <= 0x9FFF)})')

    fonts_spec = [
        ('noto-serif-sc', '思源宋体·特粗', 'node_modules/@fontsource/noto-serif-sc/files/*-900-normal.woff'),
        ('noto-sans-sc', '思源黑体·粗体', 'node_modules/@fontsource/noto-sans-sc/files/*-700-normal.woff'),
        ('ma-shan-zheng', '马善政楷书', 'node_modules/@fontsource/ma-shan-zheng/files/*-400-normal.woff'),
    ]

    font_bundle = {}
    for fid, label, pattern in fonts_spec:
        ttf_path = os.path.join('assets', f'{fid}.ttf')
        covered = build_merged_ttf(pattern, target_chars, ttf_path, fid)
        with open(ttf_path, 'rb') as fh:
            b64 = base64.b64encode(fh.read()).decode('ascii')
        os.remove(ttf_path)  # keep only JS asset for clean file:// loading
        cjk_chars = ''.join(chr(c) for c in covered if 0x4E00 <= c <= 0x9FFF)
        font_bundle[fid] = {
            'id': fid,
            'label': label,
            'glyphCount': len(covered),
            'cjkCount': len(cjk_chars),
            'sampleChars': cjk_chars[:80],
            'ttfBase64': b64,
        }

    with open('assets/fonts-data.js', 'w', encoding='utf-8') as out:
        out.write('window.__FORGE_FONTS__ = ')
        json.dump(font_bundle, out, ensure_ascii=False, separators=(',', ':'))
        out.write(';\n')
    print(f'Wrote assets/fonts-data.js ({os.path.getsize("assets/fonts-data.js")/1024/1024:.2f} MB)')

    strokes_map = build_stroke_data(target_chars)
    with open('assets/strokes-data.js', 'w', encoding='utf-8') as out:
        out.write('window.__FORGE_STROKES__ = ')
        json.dump(strokes_map, out, ensure_ascii=False, separators=(',', ':'))
        out.write(';\n')
    print(f'Wrote assets/strokes-data.js ({os.path.getsize("assets/strokes-data.js")/1024/1024:.2f} MB, {len(strokes_map)} chars)')

if __name__ == '__main__':
    main()
