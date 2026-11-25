"""在作答目录运行 python 数据\\time_left.py：显示本次作答的已用时间和剩余时间。"""
import json
import os
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
answer = Path(os.path.abspath(__file__)).parent.parent
file = next((p / '.oneshot' / 'mailbox' / answer.relative_to(p) / 'time_limit.json'
             for p in answer.parents if (p / '.oneshot' / 'mailbox').is_dir()), None)
if file is None or not file.is_file():
    print('暂时取不到本次作答的计时信息。')
    raise SystemExit
t = json.loads(file.read_text(encoding='utf-8'))
now = time.time()


def span(seconds):
    m, s = divmod(int(max(0, seconds)), 60)
    return f'{m} 分 {s:02d} 秒'


print(f"已用 {span(t.get('used_before', 0) + now - t['start'])}，剩余 {span(t['deadline'] - now)}")
