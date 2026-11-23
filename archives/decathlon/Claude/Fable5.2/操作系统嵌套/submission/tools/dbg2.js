window.rectOf = function (sel) { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(r.width), Math.round(r.height)]; };
window.T = function (sys, id, extra) { return rectOf('[data-system-id="' + sys + '"][data-testid="' + id + '"]' + (extra || '')); };
