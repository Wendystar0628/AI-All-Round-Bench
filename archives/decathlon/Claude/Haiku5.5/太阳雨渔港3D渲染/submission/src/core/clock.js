// 统一时间轴：实时模式下随真实时间推进；导出模式下只由 frame(i) 推进（i / fps），与机器快慢无关。
// 可用 ?t=秒 指定实时模式的起始时刻，便于直接查看某个事件（如彩虹、灯塔亮灯）；默认从 0 开始。
const startAt = Number(new URLSearchParams(window.location.search).get('t') || 0);

export const clock = {
  t: 0,
  mode: 'live',
  base: performance.now() / 1000 - (Number.isFinite(startAt) ? startAt : 0),
};

export function liveNow() {
  return performance.now() / 1000 - clock.base;
}

export function tickLive() {
  if (clock.mode === 'live') clock.t = liveNow();
  return clock.t;
}
