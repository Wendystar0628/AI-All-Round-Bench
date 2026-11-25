"""Tiny patch helper: python patch.py <file> <patchfile>
patchfile format: blocks separated by lines '<<<<', '====', '>>>>' (old / new). Fails loudly if old text missing."""
import sys
path, pf = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()
txt = open(pf, encoding="utf-8").read()
blocks = txt.split("<<<<\n")[1:]
n = 0
for b in blocks:
    old, rest = b.split("====\n", 1)
    new = rest.split(">>>>", 1)[0]
    if old not in src:
        print("NOT FOUND:\n" + old[:300])
        sys.exit(1)
    src = src.replace(old, new, 1)
    n += 1
open(path, "w", encoding="utf-8").write(src)
print(f"patched {path}: {n} blocks")
