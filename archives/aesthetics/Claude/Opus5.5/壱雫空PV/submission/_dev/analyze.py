# Audio analysis: vocal-ish activity / onset curves + plots (dev only)
import numpy as np, os, sys
from scipy.ndimage import median_filter
from PIL import Image, ImageDraw, ImageFont

D = os.path.dirname(os.path.abspath(__file__))
SR = 44100
raw = np.fromfile(os.path.join(D, 'out', 'pcm_44100.f32'), dtype=np.float32)
L = raw[0::2].astype(np.float64); R = raw[1::2].astype(np.float64)
N = len(L)
HOP = 441  # 10 ms
NFFT = 2048
win = np.hanning(NFFT)
nfr = 1 + (N - NFFT) // HOP


def stft(x):
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(nfr)[:, None]
    return np.fft.rfft(x[idx] * win[None, :], axis=1)

SL = stft(L); SRr = stft(R)
M = (SL + SRr) / 2; S = (SL - SRr) / 2
aM = np.abs(M); aS = np.abs(S)
freqs = np.fft.rfftfreq(NFFT, 1 / SR)
times = (np.arange(nfr) * HOP + NFFT / 2) / SR

center = np.clip(1 - aS / (aM + 1e-9), 0, 1) ** 2
# HPSS on mid magnitude
H = median_filter(aM, size=(19, 1))
P = median_filter(aM, size=(1, 19))
hmask = H ** 2 / (H ** 2 + P ** 2 + 1e-12)
band = (freqs > 280) & (freqs < 3800)
V = aM * center * hmask
venergy = (V[:, band] ** 2).sum(1)
vdb = 10 * np.log10(venergy + 1e-9)
# onset: flux on log-compressed vocal spec
LV = np.log1p(100 * V[:, band])
flux = np.maximum(0, LV[1:] - LV[:-1]).sum(1)
flux = np.concatenate([[0], flux])
# smooth a little
k = np.array([0.25, 0.5, 0.25])
flux_s = np.convolve(flux, k, mode='same')
# overall rms & bands
tot = (aM ** 2).sum(1)
low = (aM[:, freqs < 150] ** 2).sum(1)
high = (aM[:, freqs > 5000] ** 2).sum(1)
np.savez(os.path.join(D, 'out', 'feat.npz'), times=times, vdb=vdb, flux=flux_s, tot=tot, low=low, high=high)

# per-sample RMS at 100Hz frames (time-domain)
fr = 441
nf2 = N // fr
mono = (L + R) / 2
rms = np.sqrt((mono[:nf2 * fr].reshape(nf2, fr) ** 2).mean(1))
np.save(os.path.join(D, 'out', 'rms100.npy'), rms)

BEAT = 60 / 204
def bar(n, k=1):
    return 0.045 + (n - 1) * BEAT * 4 + (k - 1) * BEAT

lrc = [0.923, 3.361, 5.665, 18.860, 22.893, 24.535, 27.617, 29.878, 32.387, 34.558, 37.045, 41.872, 46.542,
       51.053, 55.450, 58.544, 62.157, 64.542, 69.054, 71.527, 74.948, 81.43]

# plots: 8 s per row
def norm(a, lo, hi):
    return np.clip((a - lo) / (hi - lo), 0, 1)

SEG = 8.0
rows = int(np.ceil(81.4 / SEG))
W, RH = 2400, 220
img = Image.new('RGB', (W, RH * rows), 'white')
dr = ImageDraw.Draw(img)
vd = norm(vdb, np.percentile(vdb, 20), np.percentile(vdb, 99.5))
fl = norm(flux_s, 0, np.percentile(flux_s, 99.5))
tl = norm(10 * np.log10(tot + 1e-9), np.percentile(10 * np.log10(tot + 1e-9), 5), np.percentile(10 * np.log10(tot + 1e-9), 99.8))
for r in range(rows):
    t0 = r * SEG; y0 = r * RH
    def X(t):
        return int((t - t0) / SEG * (W - 40)) + 20
    dr.line([(0, y0), (W, y0)], fill=(0, 0, 0))
    # beat grid
    b = 0
    while True:
        tb = 0.045 + b * BEAT / 2
        if tb > t0 + SEG: break
        if tb >= t0:
            col = (255, 160, 160) if b % 8 == 0 else ((200, 200, 230) if b % 2 == 0 else (235, 235, 235))
            dr.line([(X(tb), y0 + 2), (X(tb), y0 + RH - 2)], fill=col)
            if b % 8 == 0:
                dr.text((X(tb) + 2, y0 + 2), 'bar%d' % (b // 8 + 1), fill=(200, 0, 0))
        b += 1
    for i, tt in enumerate(lrc):
        if t0 <= tt < t0 + SEG:
            dr.line([(X(tt), y0 + 2), (X(tt), y0 + RH - 2)], fill=(0, 150, 0), width=3)
            dr.text((X(tt) + 3, y0 + 14), 'L%d' % (i + 1), fill=(0, 120, 0))
    m = (times >= t0) & (times < t0 + SEG)
    ts = times[m]
    pts_v = [(X(t), y0 + RH - 10 - int(v * 90)) for t, v in zip(ts, vd[m])]
    pts_f = [(X(t), y0 + RH - 10 - int(v * 90) - 100) for t, v in zip(ts, fl[m])]
    pts_t = [(X(t), y0 + RH - 10 - int(v * 90)) for t, v in zip(ts, tl[m])]
    dr.line(pts_t, fill=(190, 190, 190), width=1)
    dr.line(pts_v, fill=(30, 60, 200), width=2)
    dr.line(pts_f, fill=(220, 100, 0), width=1)
    for s in range(int(t0), int(t0 + SEG) + 1):
        dr.text((X(s), y0 + RH - 12), '%ds' % s, fill=(0, 0, 0))
img.save(os.path.join(D, 'out', 'plot_all.png'))
print('frames', nfr, 'rms frames', nf2)
