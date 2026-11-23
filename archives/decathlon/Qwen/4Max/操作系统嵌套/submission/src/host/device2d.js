'use strict';
// 显示设备（二维部分）：把程序提交的显示列表绘制到画布。
// 显示列表是纯数据；设备不推进任何应用状态。

const FONT = '"Microsoft YaHei", "Segoe UI", sans-serif';
const MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';

function roundRect(ctx, x, y, w, h, r) {
  if (!r) { ctx.rect(x, y, w, h); return; }
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 自绘矢量图标（24x24 坐标空间）
function drawIcon(ctx, name, x, y, s, color, color2) {
  const k = s / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const c2 = color2 || color;
  const P = (pts, close) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (close) ctx.closePath(); };
  const stroke = () => ctx.stroke();
  const fill = () => ctx.fill();
  switch (name) {
    case 'folder':
      ctx.fillStyle = c2; ctx.globalAlpha = 0.35;
      P([[2, 6], [9, 6], [11, 8], [22, 8], [22, 19], [2, 19]], true); fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = color;
      P([[2, 6], [9, 6], [11, 8], [22, 8], [22, 19], [2, 19]], true); stroke();
      break;
    case 'file':
      P([[6, 2], [14, 2], [19, 7], [19, 22], [6, 22]], true); stroke();
      P([[14, 2], [14, 7], [19, 7]]); stroke();
      break;
    case 'file-text':
      P([[6, 2], [14, 2], [19, 7], [19, 22], [6, 22]], true); stroke();
      P([[14, 2], [14, 7], [19, 7]]); stroke();
      P([[9, 12], [16, 12]]); stroke(); P([[9, 16], [16, 16]]); stroke();
      break;
    case 'file-code':
      P([[6, 2], [14, 2], [19, 7], [19, 22], [6, 22]], true); stroke();
      P([[14, 2], [14, 7], [19, 7]]); stroke();
      P([[10, 12], [8, 15], [10, 18]]); stroke(); P([[14, 12], [16, 15], [14, 18]]); stroke();
      break;
    case 'file-sheet':
      P([[6, 2], [14, 2], [19, 7], [19, 22], [6, 22]], true); stroke();
      P([[14, 2], [14, 7], [19, 7]]); stroke();
      P([[8, 12], [17, 12]]); stroke(); P([[8, 16], [17, 16]]); stroke(); P([[12, 10], [12, 19]]); stroke();
      break;
    case 'file-scene':
      P([[6, 2], [14, 2], [19, 7], [19, 22], [6, 22]], true); stroke();
      P([[14, 2], [14, 7], [19, 7]]); stroke();
      ctx.beginPath(); ctx.arc(12, 15, 3.4, 0, 7); stroke();
      P([[12, 11.6], [12, 9.6]]); stroke();
      break;
    case 'trash':
      P([[4, 7], [20, 7]]); stroke();
      P([[9, 7], [9, 4], [15, 4], [15, 7]]); stroke();
      P([[6, 7], [7, 21], [17, 21], [18, 7]]); stroke();
      P([[10, 11], [10, 17]]); stroke(); P([[14, 11], [14, 17]]); stroke();
      break;
    case 'chart-bar':
      P([[3, 21], [21, 21]]); stroke();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.5;
      ctx.fillRect(5, 12, 3.6, 9); ctx.fillRect(10.2, 7, 3.6, 14); ctx.fillRect(15.4, 10, 3.6, 11);
      ctx.globalAlpha = 1;
      ctx.strokeRect(5, 12, 3.6, 9); ctx.strokeRect(10.2, 7, 3.6, 14); ctx.strokeRect(15.4, 10, 3.6, 11);
      break;
    case 'chart-line':
      P([[3, 21], [21, 21]]); stroke();
      P([[4, 16], [9, 10], [13, 13], [20, 5]]); ctx.strokeStyle = c2; stroke(); ctx.strokeStyle = color;
      [[4, 16], [9, 10], [13, 13], [20, 5]].forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 1.4, 0, 7); fill(); });
      break;
    case 'play':
      ctx.fillStyle = color; P([[7, 4], [20, 12], [7, 20]], true); fill();
      break;
    case 'pause':
      ctx.fillRect(6, 4, 4, 16); ctx.fillRect(14, 4, 4, 16);
      break;
    case 'stop':
      ctx.fillRect(5, 5, 14, 14);
      break;
    case 'step':
      ctx.fillRect(5, 5, 4, 14); P([[11, 5], [20, 12], [11, 19]], true); fill();
      break;
    case 'heli':
      ctx.strokeStyle = color;
      P([[3, 5], [21, 5]]); stroke();
      P([[12, 5], [12, 8]]); stroke();
      ctx.beginPath(); ctx.ellipse(11, 12, 6, 4, 0, 0, 7); ctx.fillStyle = c2; ctx.globalAlpha = 0.5; fill(); ctx.globalAlpha = 1; stroke();
      P([[17, 11], [22, 9], [22, 12]]); stroke();
      P([[6, 18], [16, 18]]); stroke(); P([[8, 16], [8, 18]]); stroke(); P([[14, 16], [14, 18]]); stroke();
      break;
    case 'gear':
      ctx.beginPath(); ctx.arc(12, 12, 3.2, 0, 7); stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        P([[12 + Math.cos(a) * 6.2, 12 + Math.sin(a) * 6.2], [12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9]]); stroke();
      }
      ctx.beginPath(); ctx.arc(12, 12, 6.2, 0, 7); stroke();
      break;
    case 'terminal':
      P([[3, 4], [21, 4], [21, 20], [3, 20]], true); stroke();
      P([[6, 9], [10, 12], [6, 15]]); stroke(); P([[12, 16], [17, 16]]); stroke();
      break;
    case 'cpu':
      ctx.strokeRect(6, 6, 12, 12); ctx.strokeRect(9.5, 9.5, 5, 5);
      for (let i = 0; i < 3; i++) {
        const t = 8 + i * 4;
        P([[t, 2], [t, 6]]); stroke(); P([[t, 18], [t, 22]]); stroke();
        P([[2, t], [6, t]]); stroke(); P([[18, t], [22, t]]); stroke();
      }
      break;
    case 'window':
      ctx.strokeRect(3, 4, 18, 16); P([[3, 8], [21, 8]]); stroke();
      ctx.beginPath(); ctx.arc(5.5, 6, 0.8, 0, 7); fill();
      break;
    case 'search':
      ctx.beginPath(); ctx.arc(10.5, 10.5, 6, 0, 7); stroke(); P([[15, 15], [21, 21]]); stroke();
      break;
    case 'plus': P([[12, 5], [12, 19]]); stroke(); P([[5, 12], [19, 12]]); stroke(); break;
    case 'x': P([[6, 6], [18, 18]]); stroke(); P([[18, 6], [6, 18]]); stroke(); break;
    case 'check': P([[4, 12], [10, 18], [20, 6]]); stroke(); break;
    case 'chevron-left': P([[15, 5], [8, 12], [15, 19]]); stroke(); break;
    case 'chevron-right': P([[9, 5], [16, 12], [9, 19]]); stroke(); break;
    case 'chevron-down': P([[5, 9], [12, 16], [19, 9]]); stroke(); break;
    case 'chevron-up': P([[5, 15], [12, 8], [19, 15]]); stroke(); break;
    case 'clock':
      ctx.beginPath(); ctx.arc(12, 12, 9, 0, 7); stroke();
      P([[12, 6], [12, 12], [16, 14]]); stroke();
      break;
    case 'calendar':
      ctx.strokeRect(3, 5, 18, 16); P([[3, 10], [21, 10]]); stroke();
      P([[8, 3], [8, 7]]); stroke(); P([[16, 3], [16, 7]]); stroke();
      ctx.fillRect(7, 13, 3, 3); ctx.fillRect(14, 13, 3, 3);
      break;
    case 'note':
      P([[4, 3], [20, 3], [20, 15], [14, 21], [4, 21]], true); stroke();
      P([[14, 21], [14, 15], [20, 15]]); stroke();
      break;
    case 'clipboard':
      ctx.strokeRect(5, 4, 14, 18);
      ctx.strokeRect(9, 2, 6, 4);
      P([[8, 10], [16, 10]]); stroke(); P([[8, 14], [16, 14]]); stroke();
      break;
    case 'bell':
      P([[12, 3], [12, 5]]); stroke();
      P([[6, 10], [6, 16], [4, 18], [20, 18], [18, 16], [18, 10], [15, 6], [9, 6]], true); stroke();
      ctx.beginPath(); ctx.arc(12, 20.5, 1.6, 0, 7); fill();
      break;
    case 'globe':
      ctx.beginPath(); ctx.arc(12, 12, 9, 0, 7); stroke();
      ctx.beginPath(); ctx.ellipse(12, 12, 4, 9, 0, 0, 7); stroke();
      P([[3, 12], [21, 12]]); stroke();
      break;
    case 'browser':
      ctx.strokeRect(3, 4, 18, 16); P([[3, 8], [21, 8]]); stroke();
      ctx.beginPath(); ctx.arc(12, 14, 3.6, 0, 7); stroke();
      break;
    case 'back': P([[11, 5], [4, 12], [11, 19]]); stroke(); P([[4, 12], [20, 12]]); stroke(); break;
    case 'forward': P([[13, 5], [20, 12], [13, 19]]); stroke(); P([[20, 12], [4, 12]]); stroke(); break;
    case 'reload':
      ctx.beginPath(); ctx.arc(12, 12, 8, -0.5, 4.6); stroke();
      P([[19, 4], [20, 9], [15, 8.5]], true); fill();
      break;
    case 'home': P([[3, 11], [12, 3], [21, 11]]); stroke(); P([[6, 10], [6, 21], [18, 21], [18, 10]]); stroke(); break;
    case 'upload': P([[12, 16], [12, 4]]); stroke(); P([[7, 9], [12, 4], [17, 9]]); stroke(); P([[4, 20], [20, 20]]); stroke(); break;
    case 'download': P([[12, 4], [12, 16]]); stroke(); P([[7, 11], [12, 16], [17, 11]]); stroke(); P([[4, 20], [20, 20]]); stroke(); break;
    case 'save':
      P([[4, 4], [17, 4], [20, 7], [20, 20], [4, 20]], true); stroke();
      ctx.strokeRect(8, 13, 8, 7); P([[8, 4], [8, 9], [15, 9], [15, 4]]); stroke();
      break;
    case 'copy':
      ctx.strokeRect(8, 8, 12, 13); P([[5, 16], [4, 16], [4, 3], [15, 3], [15, 5]]); stroke();
      break;
    case 'paste':
      ctx.strokeRect(5, 5, 14, 17); ctx.strokeRect(9, 2, 6, 4);
      P([[8, 11], [16, 11]]); stroke(); P([[8, 15], [16, 15]]); stroke();
      break;
    case 'edit':
      P([[4, 20], [5, 16], [16, 5], [19, 8], [8, 19]], true); stroke();
      P([[14, 7], [17, 10]]); stroke();
      break;
    case 'layers':
      P([[12, 3], [21, 8], [12, 13], [3, 8]], true); stroke();
      P([[3, 12], [12, 17], [21, 12]]); stroke();
      P([[3, 16], [12, 21], [21, 16]]); stroke();
      break;
    case 'camera':
      ctx.strokeRect(3, 7, 18, 13); P([[8, 7], [10, 4], [14, 4], [16, 7]]); stroke();
      ctx.beginPath(); ctx.arc(12, 13.5, 4, 0, 7); stroke();
      break;
    case 'wind':
      P([[3, 8], [14, 8], [17, 5]]); stroke();
      P([[3, 12], [19, 12], [21, 15]]); stroke();
      P([[3, 16], [11, 16]]); stroke();
      break;
    case 'target':
      ctx.beginPath(); ctx.arc(12, 12, 8, 0, 7); stroke();
      ctx.beginPath(); ctx.arc(12, 12, 3.5, 0, 7); stroke();
      P([[12, 1], [12, 6]]); stroke(); P([[12, 18], [12, 23]]); stroke();
      P([[1, 12], [6, 12]]); stroke(); P([[18, 12], [23, 12]]); stroke();
      break;
    case 'alert':
      P([[12, 3], [22, 20], [2, 20]], true); stroke();
      P([[12, 9], [12, 14]]); stroke();
      ctx.beginPath(); ctx.arc(12, 17, 0.9, 0, 7); fill();
      break;
    case 'info':
      ctx.beginPath(); ctx.arc(12, 12, 9, 0, 7); stroke();
      P([[12, 11], [12, 17]]); stroke();
      ctx.beginPath(); ctx.arc(12, 7.5, 0.9, 0, 7); fill();
      break;
    case 'minimize': P([[5, 12], [19, 12]]); stroke(); break;
    case 'maximize': ctx.strokeRect(5, 5, 14, 14); break;
    case 'restore': ctx.strokeRect(7, 9, 11, 11); P([[7, 9], [7, 5], [18, 5], [18, 15], [14, 15]]); stroke(); break;
    case 'power':
      ctx.beginPath(); ctx.arc(12, 13, 8, -0.6, 3.74); stroke();
      P([[12, 3], [12, 12]]); stroke();
      break;
    case 'snapshot':
      ctx.strokeRect(3, 6, 18, 14); ctx.beginPath(); ctx.arc(12, 13, 4, 0, 7); stroke();
      P([[8, 6], [10, 3], [14, 3], [16, 6]]); stroke();
      break;
    case 'fork':
      ctx.beginPath(); ctx.arc(6, 5, 2.2, 0, 7); stroke();
      ctx.beginPath(); ctx.arc(6, 19, 2.2, 0, 7); stroke();
      ctx.beginPath(); ctx.arc(18, 9, 2.2, 0, 7); stroke();
      P([[6, 7], [6, 17]]); stroke();
      P([[6, 12], [12, 12], [16, 9.8]]); stroke();
      break;
    case 'rocket':
      P([[12, 2], [16, 8], [16, 16], [8, 16], [8, 8]], true); stroke();
      ctx.beginPath(); ctx.arc(12, 10, 2, 0, 7); stroke();
      P([[8, 13], [4, 18], [8, 17]]); stroke(); P([[16, 13], [20, 18], [16, 17]]); stroke();
      P([[10, 19], [12, 22], [14, 19]]); stroke();
      break;
    case 'grid':
      ctx.strokeRect(4, 4, 7, 7); ctx.strokeRect(13, 4, 7, 7); ctx.strokeRect(4, 13, 7, 7); ctx.strokeRect(13, 13, 7, 7);
      break;
    case 'list':
      P([[8, 6], [21, 6]]); stroke(); P([[8, 12], [21, 12]]); stroke(); P([[8, 18], [21, 18]]); stroke();
      [[4, 6], [4, 12], [4, 18]].forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 1.2, 0, 7); fill(); });
      break;
    case 'project':
      ctx.strokeRect(3, 4, 12, 10);
      P([[15, 9], [21, 9], [21, 20], [9, 20], [9, 14]]); stroke();
      P([[12, 12], [17, 17]]); stroke(); P([[17, 13], [17, 17], [13, 17]]); stroke();
      break;
    case 'keyboard':
      ctx.strokeRect(2, 6, 20, 12);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) ctx.fillRect(4.5 + c * 3.4, 8.5 + r * 3.4, 2, 2);
      ctx.fillRect(7, 15, 10, 1.8);
      break;
    case 'book':
      P([[12, 5], [8, 3], [3, 3], [3, 19], [8, 19], [12, 21], [16, 19], [21, 19], [21, 3], [16, 3]], true); stroke();
      P([[12, 5], [12, 21]]); stroke();
      break;
    case 'settings-sliders':
      P([[4, 7], [20, 7]]); stroke(); P([[4, 12], [20, 12]]); stroke(); P([[4, 17], [20, 17]]); stroke();
      ctx.beginPath(); ctx.arc(9, 7, 2, 0, 7); fill();
      ctx.beginPath(); ctx.arc(15, 12, 2, 0, 7); fill();
      ctx.beginPath(); ctx.arc(7, 17, 2, 0, 7); fill();
      break;
    default:
      ctx.beginPath(); ctx.arc(12, 12, 8, 0, 7); stroke();
  }
  ctx.restore();
}

const imgCache = new Map();
function getImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const img = new Image();
  img.src = src;
  imgCache.set(src, img);
  return img;
}

function renderList(ctx, list, opts) {
  opts = opts || {};
  if (!list || !list.length) return;
  ctx.save();
  for (const it of list) {
    if (!it || !it.op) continue;
    switch (it.op) {
      case 'rect': {
        ctx.save();
        if (it.opacity !== undefined) ctx.globalAlpha = it.opacity;
        ctx.beginPath();
        roundRect(ctx, it.x, it.y, it.w, it.h, it.r || 0);
        if (it.shadow) { ctx.shadowColor = it.shadow.color || 'rgba(0,0,0,0.4)'; ctx.shadowBlur = it.shadow.blur || 8; ctx.shadowOffsetY = it.shadow.oy || 2; }
        if (it.grad) {
          const g = it.grad.dir === 'h' ? ctx.createLinearGradient(it.x, it.y, it.x + it.w, it.y) : ctx.createLinearGradient(it.x, it.y, it.x, it.y + it.h);
          g.addColorStop(0, it.grad.from); g.addColorStop(1, it.grad.to);
          ctx.fillStyle = g;
        } else if (it.fill) ctx.fillStyle = it.fill;
        if (it.fill || it.grad) ctx.fill();
        ctx.shadowColor = 'transparent';
        if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = it.lw || 1; ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'text': {
        ctx.save();
        if (it.opacity !== undefined) ctx.globalAlpha = it.opacity;
        ctx.fillStyle = it.color || '#e8eaf2';
        ctx.font = (it.weight || '400') + ' ' + (it.size || 13) + 'px ' + (it.font === 'mono' ? MONO : FONT);
        ctx.textAlign = it.align || 'left';
        ctx.textBaseline = it.base || 'middle';
        let t = String(it.text === undefined || it.text === null ? '' : it.text);
        if (it.maxW) {
          while (t.length > 1 && ctx.measureText(t).width > it.maxW) t = t.slice(0, -1);
          if (ctx.measureText(t + '…').width > it.maxW) t = t.slice(0, -1) + '…';
        }
        ctx.fillText(t, it.x, it.y);
        ctx.restore();
        break;
      }
      case 'line': {
        ctx.save();
        ctx.strokeStyle = it.color || '#e8eaf2';
        ctx.lineWidth = it.lw || 1;
        if (it.dash) ctx.setLineDash(it.dash);
        if (it.opacity !== undefined) ctx.globalAlpha = it.opacity;
        ctx.beginPath(); ctx.moveTo(it.x1, it.y1); ctx.lineTo(it.x2, it.y2); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'circle': {
        ctx.save();
        if (it.opacity !== undefined) ctx.globalAlpha = it.opacity;
        ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, 7);
        if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(); }
        if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = it.lw || 1; ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'poly': {
        ctx.save();
        if (it.opacity !== undefined) ctx.globalAlpha = it.opacity;
        ctx.beginPath();
        it.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        if (it.close !== false) ctx.closePath();
        if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(); }
        if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = it.lw || 1; ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'icon':
        drawIcon(ctx, it.name, it.x, it.y, it.size || 20, it.color || '#e8eaf2', it.color2);
        break;
      case 'image': {
        const img = getImage(it.src);
        if (img.complete && img.naturalWidth) {
          ctx.save();
          if (it.r) { ctx.beginPath(); roundRect(ctx, it.x, it.y, it.w, it.h, it.r); ctx.clip(); }
          ctx.drawImage(img, it.x, it.y, it.w, it.h);
          ctx.restore();
        }
        break;
      }
      case 'clip':
        ctx.save();
        ctx.beginPath(); ctx.rect(it.x, it.y, it.w, it.h); ctx.clip();
        break;
      case 'unclip':
        ctx.restore();
        break;
      case 'caret': {
        if (opts.blinkOn !== false) {
          ctx.save();
          ctx.fillStyle = it.color || '#e8eaf2';
          ctx.fillRect(it.x, it.y, 1.5, it.h);
          ctx.restore();
        }
        break;
      }
      case '3d': {
        if (opts.render3d) opts.render3d(it, ctx);
        else { ctx.save(); ctx.fillStyle = '#10131f'; ctx.fillRect(it.x, it.y, it.w, it.h); ctx.restore(); }
        break;
      }
    }
  }
  ctx.restore();
}

// 文本宽度估算（供程序端布局使用，宿主侧同一套规则）
function measureText(text, size, mono) {
  let w = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    w += code > 0x2e80 ? size : size * (mono ? 0.6 : 0.55);
  }
  return w;
}

module.exports = { renderList, drawIcon, measureText, roundRect, FONT, MONO };
