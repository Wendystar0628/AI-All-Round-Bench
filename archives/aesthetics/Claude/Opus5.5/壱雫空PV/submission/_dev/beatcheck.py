# Verify the beat grid (204 BPM, first beat 0.045 s) against onsets detected in the track. (dev only)
import numpy as np, os
from scipy.signal import find_peaks

D = os.path.dirname(os.path.abspath(__file__))
SR = 44100
raw = np.fromfile(os.path.join(D, 'out', 'pcm_44100.f32'), dtype=np.float32)
x = ((raw[0::2] + raw[1::2]) * 0.5).astype(np.float64)
HOP, NFFT = 220, 1024  # 5 ms hop
win = np.hanning(NFFT)
n = 1 + (len(x) - NFFT) // HOP
idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
mag = np.abs(np.fft.rfft(x[idx] * win[None, :], axis=1))
freqs = np.fft.rfftfreq(NFFT, 1 / SR)
L = np.log1p(1000 * mag)
flux = np.maximum(0, L[1:] - L[:-1])
full = np.concatenate([[0], flux.sum(1)])
low = np.concatenate([[0], flux[:, (freqs > 30) & (freqs < 160)].sum(1)])
times = (np.arange(n) * HOP + NFFT / 2) / SR

def norm(a):
    a = a - np.median(a)
    return a / (np.percentile(a, 99) + 1e-9)

env = norm(full) + 0.6 * norm(low)
peaks, props = find_peaks(env, height=0.25, distance=int(0.06 / (HOP / SR)))
pt, ph = times[peaks], env[peaks]

BEAT = 60 / 204
beats = 0.045 + np.arange(0, int((81.4 - 0.045) / BEAT) + 1) * BEAT
offs = []
for b in beats:
    m = np.abs(pt - b) < 0.07
    if m.any():
        j = np.argmax(np.where(m, ph, -1))
        offs.append((b, pt[j] - b, ph[j]))
    else:
        offs.append((b, np.nan, 0))
offs = np.array(offs)
print('beats in grid:', len(beats), ' with an onset within 70 ms:', int(np.sum(~np.isnan(offs[:, 1]))))
print('overall median offset (ms): %.1f   MAD: %.1f' % (np.nanmedian(offs[:, 1]) * 1000, np.nanmedian(np.abs(offs[:, 1] - np.nanmedian(offs[:, 1]))) * 1000))
for s in range(0, 72, 8):
    bars = (offs[:, 0] >= 0.045 + s * 4 * BEAT) & (offs[:, 0] < 0.045 + (s + 8) * 4 * BEAT)
    o = offs[bars, 1]
    if np.sum(~np.isnan(o)):
        print('bars %2d-%2d: median %+5.1f ms   hits %2d/%2d' % (s + 1, s + 8, np.nanmedian(o) * 1000, np.sum(~np.isnan(o)), len(o)))
print('accents named in the brief (strongest onset within 80 ms):')
for a in [1.22, 35.39, 59.78, 60.05, 60.35, 79.60, 79.75]:
    m = np.abs(pt - a) < 0.08
    if m.any():
        j = np.argmax(np.where(m, ph, -1))
        print('  %.2f s -> onset at %.3f s (%+.0f ms), strength %.2f' % (a, pt[j], (pt[j] - a) * 1000, ph[j]))
    else:
        print('  %.2f s -> no onset' % a)
