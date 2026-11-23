// 演示时间线：演示时间 T（秒）与模拟时间之间的映射。慢放段内模拟时间走得慢。
const Timeline = {
  // windows: [{ a, b, f }]，在 [a,b) 内模拟速率为 f（0<f<=1）
  build(duration, windows) {
    const step = 0.001;
    const N = Math.ceil(duration / step);
    const S = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) * step;
      let f = 1;
      for (const w of windows || []) {
        if (t >= w.a && t < w.b) f = Math.min(f, w.f);
      }
      S[i + 1] = S[i] + f * step;
    }
    return {
      duration,
      simTotal: S[N],
      toSim(T) {
        const x = clamp(T, 0, duration) / step;
        const i = Math.min(N - 1, Math.floor(x));
        const fr = x - i;
        return S[i] + (S[i + 1] - S[i]) * fr;
      },
    };
  },
};
