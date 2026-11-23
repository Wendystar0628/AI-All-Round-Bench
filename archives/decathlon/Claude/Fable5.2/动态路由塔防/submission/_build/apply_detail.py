import io, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return io.open(os.path.join(root, p), encoding='utf-8').read()
def wr(p, s): io.open(os.path.join(root, p), 'w', encoding='utf-8', newline='\n').write(s)

# 1) 模型细节层
s = rd('js/gfx_units.js')
if 'function detailTower' not in s:
    det = rd('_build/detail_units.js')
    old = """  GX.makeTower = function (type, level, branch) {
    const C = matSet(); const m = TOWER[type](level, branch, C); m.mats = C.list; return m;
  };"""
    new = det + """  GX.makeTower = function (type, level, branch) {
    const C = matSet(); const m = TOWER[type](level, branch, C); detailTower(m, type, level, branch, C); m.mats = C.list; return m;
  };"""
    assert old in s; s = s.replace(old, new)
    old = "GX.makeEnemy = function (type) { const C = matSet(); const m = ENEMY[type](C); m.mats = C.list; return m; };"
    new = "GX.makeEnemy = function (type) { const C = matSet(); const m = ENEMY[type](C); detailEnemy(m, type, C); m.mats = C.list; return m; };"
    assert old in s; s = s.replace(old, new)
    wr('js/gfx_units.js', s)

# 2) 拦截器对空加成
s = rd('js/sim.js')
if 'R.antiAir' not in s:
    old = "this.damageEnemy(tg, s.dmg, this.tById.get(s.src) || null, {}); }"
    assert old in s; s = s.replace(old, "this.damageEnemy(tg, s.dmg * (tg.fly ? R.antiAir : 1), this.tById.get(s.src) || null, {}); }")
    old = "{ hits.push(e.id); this.damageEnemy(e, dmg, t, { aoe: true }); }"
    assert old in s; s = s.replace(old, "{ hits.push(e.id); this.damageEnemy(e, dmg * (e.fly ? R.antiAir : 1), t, { aoe: true }); }")
    wr('js/sim.js', s)

s = rd('js/data.js')
if 'antiAir' not in s:
    old = "    branchIntel: 4\n"
    assert old in s; s = s.replace(old, "    branchIntel: 4,\n    antiAir: 1.5            // 拦截器对飞行目标的伤害倍率\n")
    old = "'是唯一能对付飞行敌人（伪热点）的塔。'"
    assert old in s; s = s.replace(old, "'是唯一能对付飞行敌人（伪热点）的塔，对飞行目标伤害 +50%。'")
    old = "o.lines = ['沿无线层从入口直飞出口，不受地面道路、阻挡与改道影响。', '沙箱的范围攻击打不到它。']; o.counter = '只有拦截器能攻击。';"
    assert old in s; s = s.replace(old, "o.lines = ['沿无线层从入口直飞最近的出口，不受地面道路、阻挡与改道影响。', '沙箱的范围攻击打不到它。']; o.counter = '只有拦截器能攻击（对飞行目标伤害 +50%）；把拦截器架在入口到出口的直线上。';")
    wr('js/data.js', s)

# 3) 演示里加入飞行敌人，制造局部突破
s = rd('js/demo.js')
if "[0.8, 'hotspot', 'A']" not in s:
    old = "q.push([3, 'trojan', 'A'], [6.5, 'ransom', 'A'],"
    assert old in s; s = s.replace(old, "q.push([0.8, 'hotspot', 'A'], [2.2, 'hotspot', 'A'], [3, 'trojan', 'A'], [6.5, 'ransom', 'A'],")
    old = "q.push([2, 'flood', 'B'], [6.5, 'packer', 'B'], [8.5, 'ransom', 'B']);"
    assert old in s; s = s.replace(old, "q.push([2, 'flood', 'B'], [4.6, 'hotspot', 'B'], [5.6, 'hotspot', 'B'], [6.5, 'packer', 'B'], [8.5, 'ransom', 'B']);")
    wr('js/demo.js', s)
print('applied')
