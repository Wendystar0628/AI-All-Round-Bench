import fs from 'fs';
import { PNG } from 'pngjs';
const chars = ' .:-=+*#%@';
for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const W = 90, H = Math.max(1, Math.round(png.height / png.width * W * 0.5));
  console.log('\n=== ' + file + ' ' + png.width + 'x' + png.height + ' ===');
  for (let y = 0; y < H; y++) {
    let line = '';
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / W * png.width), sy = Math.floor(y / H * png.height);
      const i = (sy * png.width + sx) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      let ch = chars[Math.min(chars.length - 1, Math.floor(lum * chars.length))];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn > 40 && mx > 80) {
        if (r > g && r > b) ch = 'R';
        else if (g > r && g > b) ch = 'G';
        else if (b > r && b > g) ch = 'B';
        else if (r > 150 && g > 120) ch = 'Y';
      }
      line += ch;
    }
    console.log(line);
  }
}