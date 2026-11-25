// 封装的体验式交互：在画面上拖动——上下拆开 / 装回，左右旋转；键盘方向键同样可用。
// 开场、第 1 章与结尾共用：拆到一半的封装，回到结尾时仍是你离开时的样子。
import { S } from './state.js';
import { clamp } from './util.js';

export function pkgTool(ctx, label = '封装：拖动上下拆开或装回，左右旋转') {
  let d = null;
  const u = () => ctx.ui;
  return {
    label,
    down(e) { d = { x: e.clientX, y: e.clientY, yaw: u().yaw.target, ex: u().explode.target }; },
    move(e) {
      if (!d) return;
      const dx = (e.clientX - d.x) / S.W, dy = (e.clientY - d.y) / S.H;
      u().yaw.set(d.yaw - dx * 3.2);
      if (Math.abs(dy) > 0.01) {
        if (!u().explodeTouched) { u().explodeTouched = true; }
        u().explode.set(clamp(d.ex - dy * 2.2, 0, 1));
      }
    },
    up() { d = null; },
    key(e) {
      const U = u();
      if (e.key === 'ArrowLeft') { U.yaw.set(U.yaw.target + 0.35); return true; }
      if (e.key === 'ArrowRight') { U.yaw.set(U.yaw.target - 0.35); return true; }
      if (e.key === 'ArrowUp') { U.explodeTouched = true; U.explode.set(clamp(U.explode.target + 0.2, 0, 1)); return true; }
      if (e.key === 'ArrowDown') { U.explodeTouched = true; U.explode.set(clamp(U.explode.target - 0.2, 0, 1)); return true; }
      return false;
    },
  };
}
/** 当前应显示的拆开程度：用户动过就用用户的，否则用叙事值 */
export const userExplode = (ui, narr) => (ui.explodeTouched ? ui.explode.v : narr);
