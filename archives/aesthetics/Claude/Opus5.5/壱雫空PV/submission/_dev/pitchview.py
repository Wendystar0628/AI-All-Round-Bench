# Render log-frequency "melody view" of the center/harmonic spectrum with beat grid (dev only)
import numpy as np, os, sys
from scipy.ndimage import median_filter
from PIL import Image, ImageDraw

D = os.path.dirname(os.path.abspath(__file__))
SR = 44100
raw = np.fromfile(os.path.join(D, 'out', 'pcm_44100.f32'), dtype=np.float32)
L = raw[0::2].astype(np.float64); R = raw[1::2].astype(np.float64)
N = len(L)
HOP = 441
NFFT = 4096
win = np.hanning(NFFT)
nfr = 1 + (N - NFFT) // HOP
idx0 = np.arange(NFFT)

def stft(x):
    out = np.empty((nfr, NFFT // 2 + 1), dtype=np.complex128)
    for s in range(0, nfr, 2000):
        e = min(nfr, s + 2000)
        idx = idx0[None, :] + HOP * np.arange(s, e)[:, None]
        out[s:e] = np.fft.rfft(x[idx] * win[None, :], axis=1)
    return out

SL = stft(L); SRr = stft(R)
M = (SL + SRr) / 2; S = (SL - SRr) / 2
aM = np.abs(M); aS = np.abs(S)
del SL, SRr, M, S
freqs = np.fft.rfftfreq(NFFT, 1 / SR)
times = (np.arange(nfr) * HOP + NFFT / 2) / SR
center = np.clip(1 - aS / (aM + 1e-9), 0, 1) ** 2
H = median_filter(aM, size=(15, 1))
P = median_filter(aM, size=(1, 15))
hmask = H ** 2 / (H ** 2 + P ** 2 + 1e-12)
V = aM * center * hmask
# harmonic salience over F0 candidates (semitone/4 steps) 180..1000 Hz
midi = np.arange(54, 84, 0.25)  # F#3 .. B5
f0s = 440 * 2 ** ((midi - 69) / 12)
sal = np.zeros((nfr, len(midi)))
binw = SR / NFFT
for j, f0 in enumerate(f0s):
    acc = 0
    for h in range(1, 6):
        b = f0 * h / binw
        b0 = int(np.floor(b)); fr = b - b0
        if b0 + 1 >= V.shape[1]: break
        acc = acc + (V[:, b0] * (1 - fr) + V[:, b0 + 1] * fr) * (0.8 ** (h - 1))
    sal[:, j] = acc
np.savez(os.path.join(D, 'out', 'sal.npz'), sal=sal, midi=midi, times=times)
print('done', sal.shape)
