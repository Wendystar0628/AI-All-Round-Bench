// 自检工具：像素读回 + 字符画预览
window.__probe = async function (cols = 78, rows = 30) {
  try {
    const img = await requestCapture();
    window.__lastImg = img;
    if (!img) return 'no image';
    return asciiPreview(img, cols, rows);
  } catch (e) { return 'ERR ' + e; }
};
window.__stats = async function () {
  try {
    const img = window.__lastImg || await requestCapture();
    if (!img) return 'no image';
    const { w, h, data } = img;
    let r = 0, g = 0, b = 0, n = 0, maxL = 0, nonblack = 0;
    const hist = new Array(8).fill(0);
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      const l = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      if (l > maxL) maxL = l;
      if (l > 12) { nonblack++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      hist[Math.min(7, Math.floor(l / 32))]++;
    }
    return {
      w, h,
      avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
      maxL: Math.round(maxL),
      coverage: +(nonblack / n).toFixed(3),
      bbox: nonblack ? [minX, minY, maxX, maxY] : null,
      hist,
    };
  } catch (e) { return 'ERR ' + e; }
};
// 取样某点的颜色
window.__px = async function (pts) {
  const img = window.__lastImg || await requestCapture();
  if (!img) return 'no image';
  const { w, h, data } = img;
  return pts.map(([fx, fy]) => {
    const x = Math.round(fx * (w - 1)), y = Math.round(fy * (h - 1));
    const i = (y * w + x) * 4;
    return [x, y, data[i], data[i + 1], data[i + 2]];
  });
};

// 彩色字符画：色调字母 + 亮度
window.__probeColor = async function (cols = 60, rows = 24) {
  const img = await requestCapture();
  if (!img) return 'no image';
  const { w, h, data } = img;
  const hueChar = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (l < 10) return '.';
    if (s < 0.18) return 'W';
    let hh;
    if (mx === r) hh = ((g - b) / (mx - mn + 1e-6) + 6) % 6;
    else if (mx === g) hh = (b - r) / (mx - mn + 1e-6) + 2;
    else hh = (r - g) / (mx - mn + 1e-6) + 4;
    hh *= 60;
    if (hh < 20 || hh >= 340) return 'R';
    if (hh < 45) return 'O';
    if (hh < 70) return 'Y';
    if (hh < 160) return 'G';
    if (hh < 200) return 'C';
    if (hh < 260) return 'B';
    return 'M';
  };
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * w / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * w / cols));
      const y0 = Math.floor(r * h / rows), y1 = Math.max(y0 + 1, Math.floor((r + 1) * h / rows));
      let R = 0, G = 0, B = 0, n = 0;
      for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
        const i = (y * w + x) * 4; R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
      }
      R /= n; G /= n; B /= n;
      const l = (R * 0.3 + G * 0.6 + B * 0.1) / 255;
      s += hueChar(R, G, B) + (l > 0.66 ? '#' : l > 0.4 ? '+' : l > 0.2 ? '-' : '.');
    }
    s += '\n';
  }
  return s;
};