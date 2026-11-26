"""Record the voting service's deploy AccessKey (RAM user octathlon-deploy) for the two deploy tools:
the Aliyun CLI profile and the Serverless Devs alias, both named `octathlon`.

The key comes from the CSV that RAM's 「保存结果」 downloads, or from hidden prompts. It is never printed.
Run it yourself in a terminal from the repo root:  python website/services/votes/tools/set_credentials.py
"""
import csv
import getpass
import json
import shutil
import subprocess
import sys

PROFILE = 'octathlon'
REGION = 'cn-hangzhou'


def from_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = [row for row in csv.reader(f) if row]
    head = [h.strip().lower().replace(' ', '').replace('_', '') for h in rows[0]]
    key_id = next(i for i, h in enumerate(head) if 'accesskeyid' in h)
    secret = next(i for i, h in enumerate(head) if 'accesskeysecret' in h)
    return rows[1][key_id].strip(), rows[1][secret].strip()


def run(cmd, secrets):
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        text = (result.stdout + result.stderr)
        for s in secrets:
            text = text.replace(s, '******')
        sys.exit(f'{cmd[0]} 失败：\n{text.strip()}')
    return result.stdout


def main():
    path = input('把下载的 AccessKey CSV 文件拖进这个窗口后回车（没有文件就直接回车，再手动粘贴）：').strip().strip('"')
    if path:
        key_id, secret = from_csv(path)
    else:
        key_id = getpass.getpass('粘贴 AccessKey ID 后回车（不显示）：').strip()
        secret = getpass.getpass('粘贴 AccessKey Secret 后回车（不显示）：').strip()
    if not key_id or not secret:
        sys.exit('没有读到 AccessKey。')
    secrets = [key_id, secret]

    aliyun = shutil.which('aliyun') or sys.exit('找不到 aliyun 命令行工具。')
    s = shutil.which('s') or sys.exit('找不到 Serverless Devs（s）。')
    run([aliyun, 'configure', 'set', '--profile', PROFILE, '--mode', 'AK', '--region', REGION,
         '--access-key-id', key_id, '--access-key-secret', secret], secrets)
    who = json.loads(run([aliyun, 'sts', 'GetCallerIdentity', '--profile', PROFILE], secrets))
    run([s, 'config', 'add', '-a', PROFILE, '--AccountID', who['AccountId'],
         '--AccessKeyID', key_id, '--AccessKeySecret', secret, '-f', '--silent'], secrets)
    print(f'已录入，两个工具都能用了。当前身份：{who.get("Arn")}')


if __name__ == '__main__':
    main()
