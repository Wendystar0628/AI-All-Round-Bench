// The pieces under 存为图片 (charts/poster.js draws what is saved; faq/sheet.js uses them too):
//   fontCSS()                    @font-face for Saira as a data URL (an SVG drawn as an image loads nothing from outside)
//   inlineStyles(live, clone)    copy the computed look of every element of a live SVG onto its clone
//   svgToPNG(svg, w, h, { scale })  a self-contained SVG to a PNG blob
//   saveBlob(blob, name)         download a blob under a file name
import { BASE } from '../core/route.js';
import { h } from '../core/dom.js';

export const STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'font-stretch', 'font-variant-numeric', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'paint-order',
  'visibility', 'display', 'text-transform', 'shape-rendering', 'vector-effect',
];

let fontData = null;
/** @font-face for Saira as a data URL. */
export function fontCSS() {
  if (!fontData) {
    fontData = fetch(`${BASE}fonts/Saira.ttf`)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return `@font-face{font-family:'Saira';src:url(data:font/ttf;base64,${btoa(bin)}) format('truetype');font-weight:100 900;font-stretch:50% 125%;}`;
      })
      .catch(() => '');
  }
  return fontData;
}

/** Copy the computed look of every element of a live SVG onto its clone. */
export function inlineStyles(src, dst) {
  const a = [src, ...src.querySelectorAll('*')];
  const b = [dst, ...dst.querySelectorAll('*')];
  a.forEach((el, i) => {
    const out = b[i];
    if (!out) return;
    const cs = getComputedStyle(el);
    out.setAttribute('style', STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    out.removeAttribute('class');
  });
}

/** Rasterise a self-contained SVG (styles inline, fonts embedded) of W×H to a PNG blob at `scale`. */
export async function svgToPNG(svgEl, W, H, { scale = 1 } = {}) {
  const text = new XMLSerializer().serializeToString(svgEl);
  const src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    await new Promise((r) => setTimeout(r, 60)); // let the embedded font settle
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    g.drawImage(img, 0, 0, W, H);
    return await new Promise((r, x) => canvas.toBlob((b) => (b ? r(b) : x(new Error('canvas.toBlob gave nothing'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Download a blob under a file name. */
export function saveBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
