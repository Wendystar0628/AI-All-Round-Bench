import io, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return io.open(os.path.join(root, p), encoding='utf-8').read()
def wr(p, s): io.open(os.path.join(root, p), 'w', encoding='utf-8', newline='\n').write(s)

# 骨干流域第 2 波：首次从 C、B 两个入口同时来袭，放缓节奏
s = rd('js/maps.js')
old = "{ g: [['C', 'worm', 5, 1.4, 0], ['B', 'worm', 5, 1.4, 1]] },"
if old in s:
    s = s.replace(old, "{ g: [['C', 'worm', 4, 2.0, 0], ['B', 'worm', 4, 2.0, 1.2]] },")
    wr('js/maps.js', s)

# 首波引导提示
s = rd('js/ui.js')
if '_tipOn' not in s:
    old = "      this._banner(dt);\n"
    assert old in s
    new = ("      const tip = !A.demo && A.state === 'battle' && s.wave === 0 && s.phase === 'prep' && TD.Input.mode === 'idle' && !s.towers.length && !A.paused;\n"
           "      if (tip) { this._tipOn = true; this.hint('先看左侧“流量预报”：把<b>防火墙</b>拖到来袭入口通往中枢的链路上，再把<b>拦截器</b>、<b>沙箱</b>拖到旁边的设备平台', 'ok'); }\n"
           "      else if (this._tipOn) { this._tipOn = false; if (TD.Input.mode === 'idle') this.hint(null); }\n"
           "      this._banner(dt);\n")
    s = s.replace(old, new, 1)
    wr('js/ui.js', s)
print('r4 applied')
