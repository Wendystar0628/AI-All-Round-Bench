import fs from 'fs';
import { PNG } from 'pngjs';
const file = process.argv[2];
const png = PNG.sync.read(fs.readFileSync(file));
const x0 = Math.floor(png.width * 0.2), x1 = Math.floor(png.width * 0.8);
const y0 = Math.floor(png.height * 0.15), y1 = Math.floor(png.height * 0.9);
const W = 100, H = 40;
const chars = ' .:-=+*#%@';
for (let y = 0; y < H; y++) {
  let line = '';
  for (let x = 0; x < W; x++) {
    const sx = Math.floor(x0 + x / W * (x1 - x0)), sy = Math.floor(y0 + y / H * (y1 - y0));
    const i = (sy * png.width + sx) * 4;
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    let ch = chars[Math.min(9, Math.floor(lum * 10))];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 35 && mx > 70) {
      if (r > g * 1.3 && r > b * 1.3) ch = 'R';
      else if (b > r * 1.2 && b > g * 1.05) ch = 'B';
      else if (g > r * 1.15 && g > b * 1.1) ch = 'G';
      else if (r > 140 && g > 110) ch = 'Y';
    }
    line += ch;
  }
  console.log(line);
}