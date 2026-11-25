// 16-bit PCM WAV encoder (interleaved), deterministic.
export function encodeWAV(channels, sampleRate) {
  const nCh = channels.length, n = channels[0].length;
  const dataBytes = n * nCh * 2;
  const ab = new ArrayBuffer(44 + dataBytes), v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nCh * 2, true); v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      let s = channels[c][i];
      s = s > 1 ? 1 : s < -1 ? -1 : s;
      v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
      o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
