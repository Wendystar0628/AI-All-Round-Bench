"""审美全能网站的作品下载包：每个型号每道题一个包。

网页作品打成双击就能看的单个 html（脚本、样式、图片、字体全部内联，模块脚本先用 esbuild 打成一个包），
打好后在无头 Chrome 里和原作品逐帧比对，比对不过的退回压缩包并附打开说明；其他作品打成压缩包。
包里只放模型自己交的东西：题面、平台发的材料和杂物都去掉。产物和 manifest.json 写到
website/.build-cache/aesthetics/packages/，来源没变就不重做。规则见 ../docs/downloads.md。

  python website/topics/aesthetics/tools/package.py [--model 厂商/型号] [--task 题key] [--force]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import mimetypes
import os
import posixpath
import re
import shutil
import subprocess
import sys
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import url2pathname

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
BENCH = HERE.parents[3]
sys.path.insert(0, str(BENCH / 'orchestrator'))

import layout  # noqa: E402
import models  # noqa: E402
from topic import topic as registered_topic  # noqa: E402

TOPIC = 'aesthetics'
CACHE = BENCH / 'website' / '.build-cache' / TOPIC
PACKAGES = CACHE / 'packages'
WORK = CACHE / 'package-work'
TOOLS = ('package.py', 'verify.mjs', 'bundle.mjs')          # 改了这些就全部重做

NO_DOWNLOAD = {'clay-render', 'motion-design'}               # 白模渲染和动效设计不提供下载（动效作答里有第三方的角色立绘）
MUST_SINGLE = {'creative-web'}                               # 创意网页设计必须是单个 html
MAX_BYTES = 100 * 1024 * 1024                                # GitHub Pages 单个文件的上限
ZIP_TIME = (1980, 1, 1, 0, 0, 0)

JUNK_DIRS = {'node_modules', '__pycache__', 'screenshots', 'screenshot', '截图', 'logs', 'tmp', 'temp'}
JUNK_NAME = re.compile(r'(?i)(\.(log|tmp|temp|bak|old|orig|swp|swo|pyc|blend\d+)$|~$|^(thumbs\.db|desktop\.ini)$'
                       r'|\.原版\.|^(screenshot|screen[-_ ]?shot|snapshot|截图|屏幕截图))')
DOC_NAME = re.compile(r'(?i)^(readme|copying|notice|sources|credits|third[-_ ]?party)|licen[cs]e')
DOC_SUFFIX = {'', '.md', '.markdown', '.txt'}

# 运行时可能被读取、能写成 data: 地址内联的素材
MIME = {'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
        '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
        '.mp4': 'video/mp4', '.webm': 'video/webm',
        '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
        '.json': 'application/json', '.csv': 'text/csv', '.glsl': 'text/plain', '.vert': 'text/plain',
        '.frag': 'text/plain', '.wgsl': 'text/plain', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
        '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'text/plain', '.mtl': 'text/plain',
        '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2'}
NOT_ASSETS = {'package.json', 'package-lock.json', 'tsconfig.json', 'jsconfig.json'}

NOTES = {
    'html': ('单个网页文件，下载后用 Chrome 打开即可观看。', 'A single HTML file: download it and open it in Chrome.'),
    'web-zip': ('压缩包：解压后按包里的打开说明，用本地网页服务器打开。',
                'ZIP archive: unzip it and open it through a local web server, as the included guide explains.'),
    'zip': ('压缩包：作品的全部文件。', "ZIP archive with all of the work's files."),
}
GUIDE_NAME = '打开说明-How-to-open.txt'
GUIDE = """打开说明

这件作品要通过本地网页服务器打开，直接双击 index.html 可能会缺内容。
1. 解压后，在 index.html 所在的文件夹里打开终端（PowerShell 或命令提示符）。
2. 运行：python -m http.server 8000
   （装了 Node.js 的话，也可以运行 npx serve，再打开它显示的地址。）
3. 用 Chrome 打开 http://localhost:8000/

How to open

Serve this work from a local web server; double-clicking index.html may leave parts missing.
1. Unzip it and open a terminal in the folder that contains index.html.
2. Run: python -m http.server 8000
   (With Node.js installed you can run npx serve instead and open the address it prints.)
3. Open http://localhost:8000/ in Chrome.
"""
HEADER = ('AI审美全能 · 作品下载：作品目录已打包成这一个网页文件，脚本、样式和素材都内联在里面。\n'
          'AI Aesthetics download: the work folder packed into this one HTML file, with scripts, styles and assets inlined.')
# 作品打包 three.js 时去掉了它的许可证注释（esbuild 的 legalComments: 'none'），转发时按 MIT 许可证补上
THREE_LICENSE = '''本文件内含 three.js（https://threejs.org），按以下 MIT 许可证发布。
This file includes three.js (https://threejs.org), released under the MIT License below.

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.'''

# 比对单个 html 和原作品同一帧的截图：逐像素平均差（0–255）和明显不同（任一通道差超过 24）的像素占比
MAX_MEAN, MAX_FRAC = 1.0, 0.005
VERIFY = {'width': 1920, 'height': 1080, 'fps': 3, 'samples': [0.02, 0.2, 0.4, 0.6, 0.8, 0.98],
          'readyMs': 120000, 'settleMs': 1500}


# ---------- 交了什么 ----------

def platform_files(task):
    """平台发给模型的东西：题面文件和题目材料（材料放到子目录的整个去掉，放在根部的按原文件名去掉）。"""
    files, dirs = {task.statement.name}, set()
    m = task.materials
    if m:
        dest = m.destination.strip('/')
        if dest in ('', '.'):
            files |= {p.relative_to(m.source).as_posix() for p in m.source.rglob('*') if p.is_file()}
        else:
            dirs.add(dest)
    return files, dirs


def submitted(task, answer: Path) -> list[str]:
    skip_files, skip_dirs = platform_files(task)
    out = []
    for folder, dirnames, filenames in os.walk(answer):
        base = Path(folder).relative_to(answer).as_posix()
        base = '' if base == '.' else base
        dirnames[:] = sorted(d for d in dirnames if not (d.startswith('.') or d.lower() in JUNK_DIRS
                                                         or posixpath.join(base, d) in skip_dirs))
        for name in sorted(filenames):
            rel = posixpath.join(base, name)
            if not (name.startswith('.') or JUNK_NAME.search(name) or rel in skip_files):
                out.append(rel)
    return out


def tool_digest():
    h = hashlib.sha256()
    for name in TOOLS:
        h.update((HERE / name).read_bytes())
    return h.hexdigest()


def fingerprint(answer: Path, files, tools):
    h = hashlib.sha256(tools.encode())
    for rel in files:
        st = (answer / rel).stat()
        h.update(f'{rel}\0{st.st_size}\0{st.st_mtime_ns}\n'.encode())
    return h.hexdigest()


# ---------- 单个 html ----------

ELEMENT = re.compile(r'<!--.*?-->|<(script|style)\b([^>]*)>(.*?)</\1\s*>|<link\b([^>]*)>', re.S | re.I)
ATTR = re.compile(r'''([^\s=/>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?''')
CSS_URL = re.compile(r'''url\(\s*(['"]?)([^'"()]*)\1\s*\)''', re.I)
CSS_IMPORT = re.compile(r'''@import\s+(?:url\(\s*(['"]?)([^'"()]+)\1\s*\)|(['"])([^'"]+)\3)\s*([^;]*);''', re.I)
CLASSIC = {'', 'text/javascript', 'application/javascript'}
IMPORTS = re.compile(r'(?:^|[^\w$.])import\s*(?:[\w*{]|["\'(])', re.M)
DOCTYPE = re.compile(r'^\s*<!doctype[^>]*>[ \t]*\r?\n?', re.I)
PLACEHOLDER = re.compile(r'\x00(\d+)\x00')


def parse_attrs(text):
    out = []
    for m in ATTR.finditer(text):
        value = m.group(2)
        if value is not None:
            value = html.unescape(value[1:-1] if value[0] in '"\'' else value)
        out.append((m.group(1), value))
    return out


def get(attrs, name):
    return next((v for n, v in attrs if n.lower() == name), None)


def tag(name, attrs):
    return '<' + ' '.join([name] + [n if v is None else f'{n}="{html.escape(v)}"' for n, v in attrs]) + '>'


def script_text(code):
    return re.sub(r'(?i)<(/script|!--)', r'\\x3C\1', code)


def style_text(css):
    return re.sub(r'(?i)</style', r'\\3C/style', css)


class SinglePage:
    """把 index.html 和它引用的本地文件合成一个 html；root 是去掉平台材料和杂物后的作品副本。"""

    def __init__(self, root: Path, answer: Path, files):
        self.root, self.answer, self.files, self.present = root, answer, files, set(files)
        self.uris = {}
        assets = [f for f in files if posixpath.splitext(f)[1].lower() in MIME and posixpath.basename(f) not in NOT_ASSETS]
        self.asset_re = assets and re.compile(r'''(['"`])(?:\./)?(%s)\1''' % '|'.join(
            re.escape(a) for a in sorted(assets, key=len, reverse=True)))

    def resolve(self, base, ref):
        ref = (ref or '').strip()
        if not ref or ref.startswith(('#', '//')) or re.match(r'[a-zA-Z][a-zA-Z0-9+.-]*:', ref):
            return None
        ref = unquote(ref.split('#', 1)[0].split('?', 1)[0])
        rel = posixpath.normpath(ref.lstrip('/') if ref.startswith('/') else posixpath.join(base, ref))
        return rel if rel in self.present else None

    def text(self, rel):
        return (self.root / rel).read_bytes().decode('utf-8-sig')

    def uri(self, rel):
        if rel not in self.uris:
            mime = MIME.get(posixpath.splitext(rel)[1].lower()) or mimetypes.guess_type(rel)[0] or 'application/octet-stream'
            self.uris[rel] = f'data:{mime};base64,' + base64.b64encode((self.root / rel).read_bytes()).decode()
        return self.uris[rel]

    def css(self, text, base, seen=()):
        def imported(m):
            rel = self.resolve(base, m.group(2) or m.group(4))
            if rel is None or rel in seen:
                return m.group(0)
            body, media = self.css(self.text(rel), posixpath.dirname(rel), (*seen, rel)), m.group(5).strip()
            return f'@media {media} {{\n{body}\n}}' if media else body
        return self.urls(CSS_IMPORT.sub(imported, text), base)

    def urls(self, text, base):
        def url(m):
            rel = self.resolve(base, m.group(2))
            return m.group(0) if rel is None else f'url("{self.uri(rel)}")'
        return CSS_URL.sub(url, text)

    def refs(self, text):
        """文档里（含脚本字符串）按文档位置写的素材路径：url(…) 和整段引号里的路径换成 data: 地址。"""
        text = self.urls(text, '')
        if self.asset_re:
            text = self.asset_re.sub(lambda m: m.group(1) + self.uri(m.group(2)) + m.group(1), text)
        return text

    def element(self, m, modules):
        whole, name = m.group(0), (m.group(1) or '').lower()
        if whole.startswith('<!--'):
            return whole
        if name == 'style':
            return f'<style{m.group(2)}>' + style_text(self.css(m.group(3), '')) + '</style>'
        if name == 'script':
            attrs = parse_attrs(m.group(2))
            kind, src = (get(attrs, 'type') or '').strip().lower(), get(attrs, 'src')
            if kind in ('module', 'importmap'):
                modules.append({'kind': kind, 'src': src, 'code': m.group(3), 'open': f'<script{m.group(2)}>'})
                return f'\x00{len(modules) - 1}\x00'
            rel = self.resolve('', src)
            if kind not in CLASSIC or src is None or rel is None:
                return f'<script{m.group(2)}>' + self.refs(m.group(3)) + '</script>' if src is None else whole
            code = self.refs(self.text(rel))
            rest = [(n, v) for n, v in attrs if n.lower() not in ('src', 'defer', 'async', 'charset', 'integrity', 'crossorigin')]
            if any(n.lower() == 'defer' for n, _ in attrs):   # 内联脚本不能延后执行，用 data: 地址保留 defer
                return tag('script', rest + [('defer', None), ('src', 'data:text/javascript;base64,'
                                                              + base64.b64encode(code.encode()).decode())]) + '</script>'
            return tag('script', rest) + script_text(code) + '</script>'
        attrs = parse_attrs(m.group(4))
        rel, kinds = self.resolve('', get(attrs, 'href')), (get(attrs, 'rel') or '').lower().split()
        if rel is None:
            return whole
        if 'stylesheet' in kinds:
            media = get(attrs, 'media')
            return tag('style', [('media', media)] if media else []) + style_text(
                self.css(self.text(rel), posixpath.dirname(rel))) + '</style>'
        if any('icon' in k for k in kinds):
            return tag('link', [(n, self.uri(rel) if n.lower() == 'href' else v) for n, v in attrs])
        return ''   # preload、modulepreload、manifest 之类的提示：内容已经内联在别处

    def bundle(self, modules):
        imports, scripts = {}, []
        for x in modules:
            if x['kind'] == 'importmap':
                imports.update(json.loads(x['code'] or '{}').get('imports', {}))
            elif x['src'] is None:
                scripts.append({'code': x['code']})
            elif (rel := self.resolve('', x['src'])) is not None:
                scripts.append({'file': rel})
        job = {'root': str(self.root), 'fallbackRoot': str(self.answer), 'importmap': {'imports': imports},
               'nodePaths': [str(self.answer / 'node_modules')], 'scripts': scripts}
        done = subprocess.run(['node', str(HERE / 'bundle.mjs')], input=json.dumps(job), capture_output=True,
                              text=True, encoding='utf-8')
        if done.returncode:
            raise RuntimeError('esbuild 打包模块脚本失败：' + done.stderr.strip()[-500:])
        return done.stdout

    def notes(self, page):
        """开头的注释：打包说明，作品目录里的 README、许可证和来源说明原文；内联了 three.js 却没带它的版权声明时补上。"""
        docs = [f for f in self.files if DOC_NAME.search(posixpath.basename(f))
                and posixpath.splitext(f)[1].lower() in DOC_SUFFIX]
        parts = [HEADER] + [f'======== {f} ========\n{self.text(f).strip()}' for f in docs]
        if '__THREE__' in page and 'three.js authors' not in page.lower():
            parts.append(f'======== three.js ========\n{THREE_LICENSE}')
        body = '\n\n'.join(parts).replace('<!--', '&lt;!--').replace('--!>', '--!&gt;').replace('-->', '--&gt;')
        return f'<!--\n{body}\n-->\n'

    def build(self, entry='index.html') -> bytes:
        page, modules, out, pos = self.text(entry), [], [], 0
        for m in ELEMENT.finditer(page):
            out += [self.refs(page[pos:m.start()]), self.element(m, modules)]
            pos = m.end()
        text = ''.join(out) + self.refs(page[pos:])
        if any(x['kind'] == 'importmap' or x['src'] is not None or IMPORTS.search(x['code']) for x in modules):
            code, first = script_text(self.refs(self.bundle(modules))), PLACEHOLDER.search(text).group(1)
            text = PLACEHOLDER.sub(lambda m: f'<script type="module">{code}</script>' if m.group(1) == first else '', text)
        else:
            text = PLACEHOLDER.sub(lambda m: modules[int(m.group(1))]['open']
                                   + self.refs(modules[int(m.group(1))]['code']) + '</script>', text)
        head = DOCTYPE.match(text)
        cut = head.end() if head else 0
        return ('\ufeff' + text[:cut] + self.notes(text) + text[cut:]).encode('utf-8')


# ---------- 比对 ----------

def normalize(message):
    first = message.strip().splitlines()[0] if message.strip() else ''
    first = re.sub(r'\(?(https?|file):/{2,3}[^\s)]*\)?', '', first)
    return re.sub(r'(:\d+)+', '', first).strip()


def diff(a: Path, b: Path):
    x = np.asarray(Image.open(a).convert('RGB'), dtype=np.int16)
    y = np.asarray(Image.open(b).convert('RGB'), dtype=np.int16)
    if x.shape != y.shape:
        return 255.0, 1.0
    d = np.abs(x - y)
    return float(d.mean()), float((d.max(axis=2) > 24).mean())


def verify(answer: Path, single: Path, out: Path):
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True, exist_ok=True)
    job = {'chrome': str(layout.runtime('chrome')), 'original': str(answer), 'single': str(single), 'out': str(out),
           **VERIFY}
    (out / 'job.json').write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
    subprocess.run(['node', str(HERE / 'verify.mjs'), str(out / 'job.json')], check=True, timeout=3600)
    result = json.loads((out / 'result.json').read_text(encoding='utf-8'))
    o, s = result['original'], result['single']
    reasons, compared, worst = [], 0, [0.0, 0.0]
    if s['failure'] and s['failure'] != o['failure']:
        reasons.append(f'单个 html 出错：{s["failure"]}')
    new = Counter(map(normalize, s['errors'])) - Counter(map(normalize, o['errors']))
    if new:
        reasons.append('控制台新增报错：' + '；'.join(list(new)[:3]))
    def in_work(url):   # 作品里的相对路径；原作品里也没有的文件打包前就读不到，不算打包的问题
        path = Path(url2pathname(urlsplit(url).path))
        try:
            rel = path.relative_to(single.parent)
        except ValueError:
            return str(path)
        return rel.as_posix() if (answer / rel).exists() else None
    missing = sorted({p for u in s['local'] if (p := in_work(u))})
    if missing:
        reasons.append('仍要读取本地文件：' + '、'.join(missing[:3]))
    frames_o = {r['run']: r for r in o['runs']}
    for run in s['runs']:
        ref = frames_o.get(run['run'])
        if ref is None or ref['frames'] != run['frames']:
            reasons.append(f'{run["run"]} 段帧数和原作品不同')
            continue
        shots = {x['frame']: x['file'] for x in ref['shots']}
        for x in run['shots']:
            if x['frame'] not in shots:
                continue
            mean, frac = diff(out / shots[x['frame']], out / x['file'])
            compared += 1
            worst = [max(worst[0], mean), max(worst[1], frac)]
            if mean > MAX_MEAN or frac > MAX_FRAC:
                reasons.append(f'{run["run"]} 第 {x["frame"]} 帧画面不同（平均差 {mean:.2f}，{frac:.2%} 像素明显不同）')
    if o['runs'] and len(s['runs']) < len(o['runs']):
        reasons.append('单个 html 没有走完逐帧接口')
    check = {'passed': not reasons, 'reasons': reasons, 'frames_compared': compared,
             'max_mean_diff': round(worst[0], 3), 'max_diff_share': round(worst[1], 5),
             'original_errors': len(o['errors']), 'single_errors': len(s['errors'])}
    if not o['runs']:
        check['note'] = f'原作品没有逐帧接口，只比对了报错（{o["failure"] or "无"}）'
    return check


# ---------- 压缩包 ----------

def write_zip(target: Path, top: str, members):
    """内容相同就得到完全相同的文件：条目按路径排序，时间戳、权限和压缩级别固定。"""
    tmp = target.with_suffix('.zip.tmp')
    with zipfile.ZipFile(tmp, 'w') as z:
        for arc, data in sorted(members):
            info = zipfile.ZipInfo(f'{top}/{arc}', date_time=ZIP_TIME)
            info.create_system, info.external_attr = 3, 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data, compresslevel=9)
    os.replace(tmp, target)


# ---------- 每个包 ----------

def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else None


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def package(ident, task, answer: Path, tools, force):
    stem = f'{ident.id}_{task.key}'
    work = WORK / stem
    files = submitted(task, answer)
    if not files:   # 作答目录里只有平台发的东西：没交作品，不出包
        shutil.rmtree(work, ignore_errors=True)
        return None, False
    fp = fingerprint(answer, files, tools)
    state = read_json(work / 'state.json')
    if not force and state and state['fingerprint'] == fp and (PACKAGES / state['file']).is_file():
        return state, False
    shutil.rmtree(work, ignore_errors=True)
    copy = work / 'files'
    for rel in files:
        (copy / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(answer / rel, copy / rel)
    # 旧包留到新包做好再原子替换（main 最后删掉清单外的文件），重打期间导出照样拿得到旧包
    PACKAGES.mkdir(parents=True, exist_ok=True)
    check = None
    if 'index.html' in files:
        stage = work / 'single'
        stage.mkdir(parents=True)
        candidate = stage / f'{stem}.html'
        try:
            candidate.write_bytes(SinglePage(copy, answer, files).build())
            check = verify(answer, candidate, work / 'verify')
        except (OSError, UnicodeDecodeError, RuntimeError, subprocess.SubprocessError, ValueError) as exc:
            check = {'passed': False, 'reasons': [f'打包或比对出错：{exc}']}
        if check['passed']:
            os.replace(candidate, PACKAGES / f'{stem}.html')
            shutil.rmtree(stage)
            shutil.rmtree(work / 'verify', ignore_errors=True)
    if check and check['passed']:
        kind, note, file = 'html', NOTES['html'], f'{stem}.html'
    else:
        members = [(rel, (copy / rel).read_bytes()) for rel in files]
        if check:
            members.append((GUIDE_NAME, GUIDE.encode('utf-8')))
        file = f'{stem}.zip'
        write_zip(PACKAGES / file, stem, members)
        kind = 'zip'
        note = NOTES['web-zip' if check else 'zip']
    shutil.rmtree(copy)
    state = {'fingerprint': fp, 'model': ident.key, 'task': task.key, 'file': file,
             'bytes': (PACKAGES / file).stat().st_size, 'kind': kind, 'note': {'zh': note[0], 'en': note[1]},
             'files': len(files), 'check': check}
    write_json(work / 'state.json', state)
    return state, True


def main():
    ap = argparse.ArgumentParser(description='打审美全能网站的作品下载包，写 manifest.json。')
    ap.add_argument('--model', action='append', default=[], help='厂商/型号 或网址标识，可重复；不给就全做')
    ap.add_argument('--task', action='append', default=[], help='题 key 或题名，可重复；不给就全做')
    ap.add_argument('--force', action='store_true', help='来源没变也重做')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')

    topic = registered_topic(TOPIC)
    identities = {m.key: m for m in models.identities(include_private=True)}
    people = [identities[key] for key in topic.participants(include_private=True)]
    tasks = [t for t in topic.tasks.values() if t.category not in NO_DOWNLOAD]
    for value in args.model:
        if not any(value in (m.key, m.id) for m in people):
            raise SystemExit(f'没有参测型号 {value}')
    for value in args.task:
        if not any(value in (t.key, t.name) for t in tasks):
            raise SystemExit(f'没有可下载的题 {value}')

    tools, entries, stems, problems = tool_digest(), [], set(), []
    for ident in people:
        for task in tasks:
            stem, answer = f'{ident.id}_{task.key}', layout.answer_dir(task.ref(ident.key))
            stems.add(stem)
            chosen = ((not args.model or any(v in (ident.key, ident.id) for v in args.model))
                      and (not args.task or any(v in (task.key, task.name) for v in args.task)))
            # 作答目录清理掉以后沿用上次的包（同作品图）；要撤下一个包，删掉 package-work/<包名> 再运行
            if chosen and answer.is_dir():
                state, built = package(ident, task, answer, tools, args.force)
                if state is None:
                    print(f'跳过  {stem}：作答目录里没有模型交的文件', flush=True)
                    continue
                check = state['check']
                result = '—' if check is None else ('比对通过' if check['passed'] else '比对没过：' + '；'.join(check['reasons']))
                print(f'{"重做" if built else "沿用"}  {state["file"]:<48} {state["bytes"] / 1048576:7.2f} MB  {result}', flush=True)
                if task.category in MUST_SINGLE and state['kind'] != 'html':
                    problems.append(f'{state["file"]}：创意网页设计必须是单个 html，比对没过，先用了压缩包')
                if state['bytes'] > MAX_BYTES:
                    problems.append(f'{state["file"]}：超过 100 MB，GitHub Pages 放不下')
            else:
                state = read_json(WORK / stem / 'state.json')
                if not state or not (PACKAGES / state['file']).is_file():
                    continue
            entries.append({k: state[k] for k in ('model', 'task', 'file', 'bytes', 'kind', 'note')})

    PACKAGES.mkdir(parents=True, exist_ok=True)
    write_json(PACKAGES / 'manifest.json', {'packages': entries})
    keep = {e['file'] for e in entries} | {'manifest.json'}
    for path in PACKAGES.iterdir():
        if path.name not in keep:
            path.unlink()
    if WORK.is_dir():
        for path in WORK.iterdir():
            if path.name not in stems:
                shutil.rmtree(path)
    print(f'{len(entries)} 个包，清单 {PACKAGES / "manifest.json"}')
    for line in problems:
        print('要处理：' + line)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
