"""路径与配色。

  BUILD      专题/审美全能/设计/logo/lockups/build/
  LOCKUPS    专题/审美全能/设计/logo/lockups/        各题图层目录 <题key>/ 和清单 lockups.js
  FONTS      专题/审美全能/设计/fonts/
  CHECKS     调研/审美全能/模板设计/题名锁定/        每题一个 <编号>-<题名>/，检查图放在里面的 检查/
"""
import os
import json

BUILD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCKUPS = os.path.dirname(BUILD)
DESIGN = os.path.normpath(os.path.join(LOCKUPS, '..', '..'))
ROOT = os.path.normpath(os.path.join(DESIGN, '..', '..', '..'))
FONTS = os.path.join(DESIGN, 'fonts')
TOKENS = os.path.join(DESIGN, 'tokens.json')
CHECKS = os.path.join(ROOT, '调研', '审美全能', '模板设计', '题名锁定')
SHOW = os.path.join(ROOT, '专题', '审美全能', '展示文案.json')

# 常用字体
SONG_HEAVY = os.path.join(FONTS, 'SourceHanSerifCN-Heavy.otf')
SONG_BOLD = os.path.join(FONTS, 'SourceHanSerifCN-Bold.otf')
SONG_SEMI = os.path.join(FONTS, 'SourceHanSerifCN-SemiBold.otf')
DIDONE = os.path.join(FONTS, 'LibreBodoni-Variable.ttf')
DIDONE_I = os.path.join(FONTS, 'LibreBodoni-Italic-Variable.ttf')
SCRIPT = os.path.join(FONTS, 'Tangerine-Bold.ttf')
STENCIL = os.path.join(FONTS, 'Anton-Regular.ttf')


def tokens():
    with open(TOKENS, encoding='utf-8-sig') as f:
        return json.load(f)


def direction(key):
    """tokens.json 的 directions[] 里这一题：no、cat、ground、world、worldDeep、worldPale、lit、ink、light、material……"""
    for d in tokens()['directions']:
        if d['key'] == key:
            return d
    raise KeyError(f'tokens.json 的 directions 里没有 {key}')


def order():
    """十题的展示顺序（清单 lockups.js 的 order）"""
    return [d['key'] for d in tokens()['directions']]


def title_of(key):
    """题名：展示文案.json 里这一题的中文名"""
    with open(SHOW, encoding='utf-8-sig') as f:
        data = json.load(f)
    for d in data['directions']:
        if d['task']['key'] == key:
            return d['task']['name']['zh']
    raise KeyError(f'展示文案.json 里没有 {key}')


def check_dir(key):
    """这一题的检查图目录：调研/审美全能/模板设计/题名锁定/<编号>-<题名>/检查/"""
    name = f"{direction(key)['no']}-{title_of(key)}"
    out = os.path.join(CHECKS, name, '检查')
    os.makedirs(out, exist_ok=True)
    return out
