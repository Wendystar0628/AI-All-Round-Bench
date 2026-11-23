import io, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return io.open(os.path.join(root, p), encoding='utf-8').read()
def wr(p, s): io.open(os.path.join(root, p), 'w', encoding='utf-8', newline='\n').write(s)

s = rd('js/gfx_fx.js')
# 改道 / 预览标签随镜头距离缩放，推近时不再巨大
old = "let t = 0; this.add((dt) => { t += dt; tag.position.y += dt * 0.12;"
assert old in s
s = s.replace(old, "let t = 0; const s0 = tag.scale.clone(); this.add((dt) => { t += dt; const kk = TD.clamp(this.stage.cam.dist / 34, 0.32, 1.2); tag.scale.set(s0.x * kk, s0.y * kk, 1); tag.position.y += dt * 0.12;")
old = "      for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i](dt) === false) this.live.splice(i, 1);"
assert old in s
s = s.replace(old, old + "\n      const kk = TD.clamp(this.stage.cam.dist / 34, 0.32, 1.2); for (const t of this.routeTags) { const b = t.userData.s0 || (t.userData.s0 = t.scale.clone()); t.scale.set(b.x * kk, b.y * kk, 1); }")
wr('js/gfx_fx.js', s)

s = rd('js/gfx_view.js')
# 贯穿光束收细，近看不再糊成一片
old = "fx.beam(x1, y, z1, x2, 0.35, z2, { color: K.white, width: 0.05, life: 0.3 }); fx.beam(x1, y, z1, x2, 0.35, z2, { color: K.cyan, width: 0.16, life: 0.4, alpha: 0.7 });"
assert old in s
s = s.replace(old, "fx.beam(x1, y, z1, x2, 0.35, z2, { color: K.white, width: 0.028, life: 0.3 }); fx.beam(x1, y, z1, x2, 0.35, z2, { color: K.cyan, width: 0.085, life: 0.4, alpha: 0.5 });")
old = "{ color: K.white, width: 0.07, life: 0.45 }); fx.beam(this.wx(b.x1), v.y, this.wz(b.y1), this.wx(b.x2), 0.35, this.wz(b.y2), { color: K.cyan, width: 0.24, life: 0.55, alpha: 0.6 });"
assert old in s
s = s.replace(old, "{ color: K.white, width: 0.04, life: 0.45 }); fx.beam(this.wx(b.x1), v.y, this.wz(b.y1), this.wx(b.x2), 0.35, this.wz(b.y2), { color: K.cyan, width: 0.13, life: 0.55, alpha: 0.5 });")
wr('js/gfx_view.js', s)
print('fx applied')
