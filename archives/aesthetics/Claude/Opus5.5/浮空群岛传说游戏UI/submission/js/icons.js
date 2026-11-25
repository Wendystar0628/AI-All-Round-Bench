/* =====================================================================
   icons.js — 成套 SVG 图标：属性 / 武器 / 任务类型 / 技能 / 道具 / 界面
   全部图标画在 48×48 网格上，统一以 <symbol> 注入，按 <use> 引用
   ===================================================================== */
(function () {
  'use strict';
  const S = (d, extra = '') => `<path d="${d}" ${extra}/>`;
  const EO = 'fill-rule="evenodd"';
  const ST = (d, w = 4) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const star4 = (cx, cy, r) => `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
  const f2 = (n) => +n.toFixed(2);

  function sunRays() {
    let d = '';
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 - Math.PI / 2;
      const L = k % 2 ? 18 : 22.5, w = k % 2 ? 0.2 : 0.24, r0 = 11.8;
      d += `M${f2(24 + r0 * Math.cos(a - w))} ${f2(24 + r0 * Math.sin(a - w))}L${f2(24 + L * Math.cos(a))} ${f2(24 + L * Math.sin(a))}L${f2(24 + r0 * Math.cos(a + w))} ${f2(24 + r0 * Math.sin(a + w))}Z`;
    }
    return d;
  }
  function burst(cx, cy, n, r1, r2, rot = 0) {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n + rot - Math.PI / 2;
      const r = i % 2 ? r1 : r2;
      d += (i ? 'L' : 'M') + f2(cx + r * Math.cos(a)) + ' ' + f2(cy + r * Math.sin(a));
    }
    return d + 'Z';
  }
  function gear(cx, cy, r1, r2, n, hole) {
    const step = (Math.PI * 2) / n;
    let d = '';
    for (let i = 0; i < n; i++) {
      const b = i * step;
      const pts = [
        [r1, b - step * 0.5], [r1, b - step * 0.24], [r2, b - step * 0.15], [r2, b + step * 0.15], [r1, b + step * 0.24],
      ];
      pts.forEach((p, j) => { d += (i === 0 && j === 0 ? 'M' : 'L') + f2(cx + p[0] * Math.cos(p[1])) + ' ' + f2(cy + p[0] * Math.sin(p[1])); });
    }
    d += 'Z';
    if (hole) d += `M${cx} ${cy - hole}A${hole} ${hole} 0 1 0 ${cx} ${cy + hole}A${hole} ${hole} 0 1 0 ${cx} ${cy - hole}Z`;
    return d;
  }
  const ring = (cx, cy, r) => `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`;

  const ICONS = {
    /* ---------- 六属性 ---------- */
    'i-fire': S('M24 3.5c1.7 7.4 10.2 11.5 10.2 22.6C34.2 35.6 29.6 42.5 24 42.5S13.8 35.9 13.8 27.6c0-5.8 2.8-9.6 5.8-12.4-.2 4.4 1.2 7.3 3.7 8.8C21.9 17.6 22 9.8 24 3.5zM24 24.8c3.1 3.4 5.2 5.8 5.2 9.1 0 3.1-2.3 5.2-5.2 5.2s-5.2-2.1-5.2-5c0-3 2.2-5.6 5.2-9.3z', EO),
    'i-water': S('M24 3.8S38.2 19.4 38.2 29.2A14.2 14.2 0 0 1 9.8 29.2C9.8 19.4 24 3.8 24 3.8zM16.6 28.6c0 5 3.1 8.6 7.4 9.6-2.6-2.5-3.9-5.7-3.7-9.6z', EO),
    'i-earth': S('M2.5 41.5L18.5 11.5 25.6 24.6 31.2 16.4 45.5 41.5zM8.6 35l5.6-9.2 4.6 4.7 5.3-5.2 4.6 4.4 3.9-4.9 6.7 10.2h-3.3l-3.7-5-3.6 4.6-4.7-4.5-5.1 5-4.4-4.4-2.6 4.3z', EO),
    'i-wind': ST('M6 15.5h21.5a6 6 0 1 0-6-6') + ST('M3.5 24h32a6.4 6.4 0 1 1-6.4 6.4') + ST('M9 32.5h13', 4),
    'i-light': `<circle cx="24" cy="24" r="8.6"/>` + S(sunRays()),
    'i-dark': S('M29 5.2A18.6 18.6 0 1 0 42.8 32.2 15.2 15.2 0 1 1 29 5.2z') + S(star4(36, 14, 5.5)),

    /* ---------- 武器 ---------- */
    'w-sword': `<g transform="rotate(45 24 24)">${S('M24 2.2l3.6 5.2V30h-7.2V7.4zM23.25 9.5h1.5v18h-1.5z', EO)}${S('M13.2 30h21.6l-1.6 3.8H14.8z')}<rect x="22.1" y="33.8" width="3.8" height="7.6"/><circle cx="24" cy="43.6" r="2.7"/></g>`,
    'w-spear': `<g transform="rotate(45 24 24)">${S('M24 1.2c3.8 5.2 4.6 10.4 0 18.6-4.6-8.2-3.8-13.4 0-18.6zM23.3 6.5h1.4v9.5h-1.4z', EO)}${S('M19.2 19.6h9.6l-1.6 3.1h-6.4z')}<rect x="22.6" y="22.7" width="2.8" height="24.2"/>${S('M25.4 23c5.6 1.4 6.8 5.4 5.4 8.6-1-2.7-2.9-4.6-5.4-5.2z')}</g>`,
    'w-staff': `<g transform="rotate(35 24 24)"><circle cx="24" cy="10" r="4.4"/>${S('M24 1.2c7.8 2 9.8 9.6 6.2 15.4 1-5.1-1.6-9.6-6.2-10.6-4.6 1-7.2 5.5-6.2 10.6-3.6-5.8-1.6-13.4 6.2-15.4z')}<rect x="20.4" y="16.6" width="7.2" height="2.6" rx="1"/>${S('M22.5 19.2h3l-.6 27h-1.8z')}</g>`,
    'w-axe': `<g transform="rotate(38 24 24)"><rect x="22.3" y="3.5" width="3.4" height="43" rx="1.3"/>${S('M25.7 7.4c7.6-2.2 15.8 1.6 17.8 9.8 1.2 5.2-.5 9.8-3.6 12.8-1-5.6-6.6-9.8-14.2-9.2z')}${S('M22.3 9.6c-5.6-.4-10.2 1.6-12.2 5.8 3.1-.5 7.2 1 12.2 3.6z')}${S('M24 0l2.3 3.5h-4.6z')}</g>`,
    'w-blades': (() => {
      const one = S('M6.8 41.6C13.2 30.6 25 17.4 40.6 5.6c-1.2 3.4-9.8 16-29.6 37.6z') + S('M8.4 34.6l6.4 6.2-1.6 1.6-6.4-6.2z') + S('M7.6 41.3l-3.4 3.5-1.7-1.6 3.4-3.5z');
      return `<g>${one}</g><g transform="matrix(-1 0 0 1 48 0)">${one}</g>`;
    })(),
    'w-guns': (() => {
      const one = S('M2 3h28.5v6.2H2z') + S('M26.6 1h2.8v2.2h-2.8z') + S('M0 1.4h4v2.4H0z') + S('M5 9.2h15v3H5z') + S('M5 12.2h7.8l-2.6 10.3H2z') + `<path d="M12.8 12.2c0 4.6 5 5.1 6.4 0" fill="none" stroke="currentColor" stroke-width="1.9"/>`;
      return `<g transform="translate(3 4) rotate(-27 16 11)">${one}</g><g transform="translate(15 21) rotate(-27 16 11)">${one}</g>`;
    })(),

    /* ---------- 任务类型 ---------- */
    'q-boss': S('M24 12.5c9 0 14 6 14 13.8 0 5-2.4 8.5-6 10.5V42H16v-5.2c-3.6-2-6-5.5-6-10.5C10 18.5 15 12.5 24 12.5zM17.6 25.2a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 1 0 0-7.2zM30.4 25.2a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 1 0 0-7.2zM20.8 37.6h2.2V42h-2.2zM25 37.6h2.2V42H25z', EO) + S('M13.4 16.4C8 13.4 4.8 8.2 5.4 2.6c3.6 4.4 7.8 6.6 12 10z') + S('M34.6 16.4c5.4-3 8.6-8.2 8-13.8-3.6 4.4-7.8 6.6-12 10z'),
    'q-hunt': [0, 7.5, 15].map((dx, i) => S(`M${8 + dx} ${42 - i} C${16 + dx} ${31 - i} ${22 + dx} ${19 - i} ${28.5 + dx} ${4 - i * 0.5} C${27.5 + dx} ${17 - i} ${22.5 + dx} ${30 - i} ${11.5 + dx} ${44 - i}Z`)).join(''),
    'q-gather': S('M24 3l6.2 9V34l-6.2 6.4-6.2-6.4V12zM23.3 8h1.4v28h-1.4z', EO) + `<g transform="rotate(-16 12 30)">${S('M12 15.6l4.4 6V37l-4.4 4.4L7.6 37V21.6z')}</g><g transform="rotate(16 36 30)">${S('M36 15.6l4.4 6V37L36 41.4 31.6 37V21.6z')}</g>` + S('M4 42.5h40V45H4z'),
    'q-escort': S('M24 5.6c9.6 0 17.4 4.2 17.4 9.8S33.6 25.2 24 25.2 6.6 21 6.6 15.4 14.4 5.6 24 5.6zM9.6 14.2h28.8v2.4H9.6z', EO) + S('M41 10.4l5-3.8v17.6l-5-3.8z') + S('M14.6 31h18.8l-3.2 6.4H17.8z') + ST('M16.5 23.5l2.2 7.5M31.5 23.5l-2.2 7.5M24 25.2V31', 1.8) + ST('M4.5 13v5', 2.2),
    'q-explore': S('M20 4.6a15.4 15.4 0 1 1 0 30.8 15.4 15.4 0 1 1 0-30.8zM20 9.2a10.8 10.8 0 1 0 0 21.6 10.8 10.8 0 1 0 0-21.6z', EO) + S('M30.4 31.2l3.8-3.8 11 11-3.8 3.8z') + S(star4(20, 20, 6.4)),
    'q-defend': S('M24 3.5l17.2 6.2V22c0 11.2-8 18.8-17.2 22.4C14.8 40.8 6.8 33.2 6.8 22V9.7zM24 9.4v29.2c6.6-3 11.8-8.6 11.8-16.6v-8.4z', EO),

    /* ---------- 技能 ---------- */
    'sk-slash': S('M6.5 40.5C11 22.5 23.5 9.4 42.5 5.4 30.2 12.8 18.8 24.6 13.2 42.4z') + S(star4(36, 32, 6)) + S(star4(29, 41, 3.4)),
    'sk-multi': S('M4.5 34C9 20 19 10.5 33 7.5 23.6 13.4 15.6 21.8 10.4 35.6z') + S('M12 41C16.5 27 26.5 17.5 40.5 14.5 31.1 20.4 23.1 28.8 17.9 42.6z') + S('M22 45C25.6 35 33 28 43.5 25.6 36.6 30.4 31 36.4 27 46.6z'),
    'sk-thrust': ST('M7 41L31 17', 4.6) + S('M44.5 3.5L40.6 20.4 27.6 7.4z') + S('M26.6 15.2l6.2 6.2-2.4 2.4-6.2-6.2z') + ST('M3.5 27.5l9-9M20.5 44.5l9-9M11 32l4-4', 2.6),
    'sk-whirl': ST('M39 26A15 15 0 1 1 30.4 11.2', 4.4) + S('M27 4.5l11.5 5.8-9.2 8.4z') + S(star4(24, 26, 6)),
    'sk-dash': S('M44 8C30 9.5 18 16.5 11.2 28.6L22 25.4 16.4 36.4C26.6 31.6 38.2 21 44 8z') + ST('M4 30h9M2.5 37h14M8 44h10', 2.8),
    'sk-burst': S(burst(24, 24, 8, 9, 21, 0.2)) + `<circle cx="24" cy="24" r="5" fill="#fff" fill-opacity=".0"/>`,
    'sk-buff': S('M24 4l15 16.5h-8.6V30H17.6v-9.5H9z') + S('M17.6 33.4h12.8v3.8H17.6zM17.6 40.2h12.8V44H17.6z') + S(star4(40, 36, 5)),
    'sk-heal': S('M18.6 6.5h10.8v12.1h12.1v10.8H29.4v12.1H18.6V29.4H6.5V18.6h12.1z') + S(star4(40, 8, 5)),
    'sk-barrier': ST('M24 4.5l16.9 9.75v19.5L24 43.5 7.1 33.75v-19.5z', 3.6) + S('M24 13l9.5 5.5v11L24 35l-9.5-5.5v-11z'),
    'sk-counter': S('M22 4l14.4 5.2V19.6c0 9.4-6.6 15.8-14.4 18.8C14.2 35.4 7.6 29 7.6 19.6V9.2z') + S('M30 30l8-8 3 3 2-13-13 2 3 3-8 8z'),
    'sk-quake': S('M3 30h42v3.5H3z') + S('M24 33.5l-3 4.5 3.5 2.5-2 5.5 6-7-3.5-2.5 2-3z') + S('M12 33.5l-2.5 3.5 2.6 2-1.8 4 4.6-5.2-2.6-2 1.4-2.3zM36 33.5l2.5 3.5-2.6 2 1.8 4-4.6-5.2 2.6-2-1.4-2.3z') + S('M14 26l6-14 4 6 4-12 6 20z'),
    'sk-shot': S('M28 10.5l10 1.6 1.6 10L17.8 43.9a4.8 4.8 0 0 1-6.8 0l-6.9-6.9a4.8 4.8 0 0 1 0-6.8z') + ST('M30 4.5l13.5 13.5', 2.6) + S(star4(42, 6, 4.6)),
    'sk-rain': [8, 18, 28, 38].map((x, i) => S(`M${x} ${4 + (i % 2) * 6}l3 0 0 ${22 - (i % 2) * 4} 3.2 0-4.7 8.4-4.7-8.4 3.2 0z`)).join(''),
    'sk-shadow': S('M8 40C12 22 26 9 44 6 35 10 22 20 15 34 22 28 30 25 38 25 28 29 18 36 12 46z'),
    'sk-roar': S('M8 18h8l10-9v30l-10-9H8z') + ST('M32 16c3 2.4 4.4 5 4.4 8s-1.4 5.6-4.4 8M37.4 10.4c4.6 3.6 7 8.2 7 13.6s-2.4 10-7 13.6', 3.2),
    'sk-wave': S('M3 30c6-8 12-8 18 0s12 8 18 0c2-2.6 4-4 6-4.4v7.6c-2 .5-4 2-6 4.8-6 8-12 8-18 0s-12-8-18 0z') + S('M8 18c4-5.4 8-5.4 12 0s8 5.4 12 0 8-5.4 12 0v5c-4-5.4-8-5.4-12 0s-8 5.4-12 0-8-5.4-12 0z'),
    'sk-pierce': S('M2 21.5h32l-3-6 15 8.5-15 8.5 3-6H2z') + S(star4(10, 12, 5)) + S(star4(18, 38, 4)),
    'sk-ward': S('M24 3.5l17.2 6.2V22c0 11.2-8 18.8-17.2 22.4C14.8 40.8 6.8 33.2 6.8 22V9.7z') + `<path d="${star4(24, 22, 10)}" fill="#000" fill-opacity=".35"/>`,
    'sk-star': S(star4(24, 24, 21)) + S(star4(24, 24, 9)),

    /* ---------- 道具 ---------- */
    'it-coin': S(ring(24, 24, 19.5) + ring(24, 24, 15.2), EO) + S(star4(24, 24, 9.5)),
    'it-crystal': S('M24 4.5L39 14.4 25.3 21.2zM24 4.5L9 14.4 22.7 21.2zM8.2 16.6l14.2 7v19.8l-10.6-6.4zM39.8 16.6l-14.2 7v19.8l10.6-6.4z'),
    'it-scale': S('M24 3.6c10.4 4 16.6 12.2 16.6 22.4 0 10.2-7.2 17.2-16.6 19.4C14.6 43.2 7.4 36.2 7.4 26 7.4 15.8 13.6 7.6 24 3.6zM24 11.6c-5.6 3-8.8 8.2-8.8 14.4 0 5.6 3.3 9.8 8.8 11.8 5.5-2 8.8-6.2 8.8-11.8 0-6.2-3.2-11.4-8.8-14.4z', EO) + S('M23.2 15h1.6v20h-1.6z'),
    'it-horn': S('M9 44c1.6-12.6 9.6-22.6 22.6-28.8 4-1.9 7.6-5.6 9-10.6 3.6 8.6.6 16.6-5.8 20.6C26.6 30.2 19.4 36 15.4 45.4z') + `<path d="M19 30.5l5 4M25 25.4l4.4 4.2M31 21l3.8 3.6" stroke="#000" stroke-opacity=".3" stroke-width="2"/>`,
    'it-feather': S('M40.5 3.5C28 5.5 15 15.8 11.6 32.4L7.4 44.4 10 45l3.7-11.4C28.2 31.6 39 20.6 40.5 3.5z') + `<path d="M36 9.5L12.5 39" stroke="#000" stroke-opacity=".32" stroke-width="1.6"/>`,
    'it-ore': S('M5 41l5-14.6 9.4-4 7.4 6.2-2 12.4zM24.2 41l3.4-12 8.4-3.8 7.4 6.4-.8 9.4zM14.4 21.2l5-10.4 9.6-2 4.4 8.2-5 9.4-7.4-5z'),
    'it-book': S('M7 8.5c6.4-2 12-1.4 16 2.2V42c-4-3.2-9.6-4-16-2.2zM41 8.5c-6.4-2-12-1.4-16 2.2V42c4-3.2 9.6-4 16-2.2z') + `<path d="${star4(33, 22, 5)}" fill="#000" fill-opacity=".3"/>`,
    'it-sigil': S('M24 3l18 10.4v21.2L24 45 6 34.6V13.4zM24 8.4L10.8 16v15.6L24 39.2l13.2-7.6V16z', EO) + S(star4(24, 24, 10)),
    'it-potion': S('M19 4.5h10V9h-1.6v6.6c7.2 2.6 11.8 8.6 11.8 15.4 0 7.8-6.8 13.5-15.2 13.5S8.8 38.8 8.8 31c0-6.8 4.6-12.8 11.8-15.4V9H19z') + `<path d="M13.4 27.5c3.4-2 6.8-2 10.6 0s7.2 2 10.6 0" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="2"/>`,
    'it-gear': S(gear(24, 24, 15, 21, 10, 6.4), EO),
    'it-core': `<circle cx="24" cy="24" r="9.5"/>` + `<ellipse cx="24" cy="24" rx="21" ry="7.4" fill="none" stroke="currentColor" stroke-width="2.6" transform="rotate(-28 24 24)"/>` + S(star4(38, 9, 4.5)),
    'it-map': S('M6 10.5l11-4.4 14 4.4 11-4.4v31.4l-11 4.4-14-4.4-11 4.4zM16 9.6v28.6l2 .6V10.3zM30 13.8v28.6l2-.8V13.1z', EO),
    'it-shard': S('M8 40l6-22 8 8-4 16zM20 44l6-30 10 12-6 18zM30 16l6-12 6 10-5 6z'),
    'it-chest': S('M6 20.5c0-7.6 7.2-12 18-12s18 4.4 18 12zM6 23h36v18H6zM21 20h6v9.5h-6z', EO),
    'it-fang': S('M12 6h24c0 12-4 26-12 36C16 32 12 18 12 6zM18.5 10c.5 7.5 2.5 15 5.5 21 3-6 5-13.5 5.5-21z', EO),

    /* ---------- 界面 ---------- */
    'ui-gear': S(gear(24, 24, 14.5, 20.5, 8, 6.6), EO),
    'ui-play': S('M13 7.5l26 16.5-26 16.5z'),
    'ui-ff': S('M5 9l17.5 15L5 39zM24.5 9L42 24 24.5 39z'),
    'ui-auto': ST('M38 18A15 15 0 0 0 10 21M10 30a15 15 0 0 0 28 -3', 3.6) + S('M36 6l6 13-13.5-2z') + S('M12 42L6 29l13.5 2z'),
    'ui-log': ST('M10 12h28M10 20h28M10 28h20M10 36h14', 3.6),
    'ui-check': ST('M9 25l10 10 20-22', 5),
    'ui-close': ST('M12 12l24 24M36 12L12 36', 4.4),
    'ui-lock': ST('M15 21v-5a9 9 0 0 1 18 0v5', 4) + S('M10 21h28v21H10zM22.4 28h3.2v8h-3.2z', EO),
    'ui-crown': S('M4.5 15.5l9.5 8.6 10-15.6 10 15.6 9.5-8.6-4 22.5H8.5z') + S('M8.5 40.5h31V45h-31z') + `<circle cx="24" cy="30" r="3" fill="#000" fill-opacity=".3"/>`,
    'ui-clock': S(ring(24, 24, 19.5) + ring(24, 24, 15.6), EO) + ST('M24 13v11.5l7.5 4.5', 3.4),
    'ui-pin': S('M24 3.5c-8.2 0-14.4 6.2-14.4 14.4C9.6 29.6 24 44.5 24 44.5s14.4-14.9 14.4-26.6C38.4 9.7 32.2 3.5 24 3.5zM24 11.6a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 1 0 0-12.4z', EO),
    'ui-power': S('M8 5l15 15-3.4 3.4L5 8.6zM40 5L25 20l3.4 3.4L43 8.6z') + S('M11.4 26.6l3.4-3.4 17 17-3.4 3.4zM36.6 26.6l-3.4-3.4-17 17 3.4 3.4z') + S('M4 40l4-4 4 4-4 4zM44 40l-4-4-4 4 4 4z'),
    'ui-swap': ST('M8 16h30l-7-7M40 32H10l7 7', 4),
    'ui-plus': ST('M24 9v30M9 24h30', 4.6),
    'ui-info': S(ring(24, 24, 20) + ring(24, 24, 16.4), EO) + S('M21.8 20h4.4v15h-4.4zM24 11.5a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 1 1 0-5.6z'),
    'ui-warn': S('M24 4L45 42H3zM21.8 17h4.4l-.6 13h-3.2zM24 33a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 1 1 0-5.2z', EO),
    'ui-book': S('M7 8.5c6.4-2 12-1.4 16 2.2V42c-4-3.2-9.6-4-16-2.2zM41 8.5c-6.4-2-12-1.4-16 2.2V42c4-3.2 9.6-4 16-2.2z'),
    'ui-pad': S('M14 13h20c6 0 10 5 11 12l1.4 8.6c.6 4-3.4 6.6-6.4 4l-6-5.6H14L8 37.6c-3 2.6-7-0-6.4-4L3 25c1-7 5-12 11-12zM12.2 19.5h3.6v3h3v3.6h-3v3h-3.6v-3h-3v-3.6h3zM34 19a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8zM29.4 23.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8z', EO),
    'ui-chip': S('M13 10h22l3 3v22l-3 3H13l-3-3V13zM17 16v16h14V16z', EO) + ST('M17 4v5M24 4v5M31 4v5M17 39v5M24 39v5M31 39v5M4 17h5M4 24h5M4 31h5M39 17h5M39 24h5M39 31h5', 2.4),
    'ui-time': S('M12 4.5h24v4.2c0 7.6-6 11.6-9.2 15.3 3.2 3.7 9.2 7.7 9.2 15.3v4.2H12v-4.2c0-7.6 6-11.6 9.2-15.3C18 20.3 12 16.3 12 8.7zM18 37.5h12c-.6-3.4-3.4-5.6-6-7.6-2.6 2-5.4 4.2-6 7.6z', EO),
    'ui-target': S(ring(24, 24, 17) + ring(24, 24, 13.4), EO) + S('M22.2 2h3.6v11h-3.6zM22.2 35h3.6v11h-3.6zM2 22.2h11v3.6H2zM35 22.2h11v3.6H35z') + `<circle cx="24" cy="24" r="3.4"/>`,
    'ui-heart': S('M24 42.5S5.5 30.6 5.5 18C5.5 11.4 10.6 6.8 16.4 6.8c3.6 0 6 2 7.6 4.6 1.6-2.6 4-4.6 7.6-4.6 5.8 0 10.9 4.6 10.9 11.2 0 12.6-18.5 24.5-18.5 24.5z'),
    'ui-shield': S('M24 3.5l17.2 6.2V22c0 11.2-8 18.8-17.2 22.4C14.8 40.8 6.8 33.2 6.8 22V9.7z'),
    'ui-crit': S(burst(24, 24, 7, 8.6, 21, 0)),
    'ui-critdmg': S(burst(24, 24, 7, 8.6, 21, 0) + ring(24, 24, 5.2), EO),
    'ui-ult': S(star4(24, 24, 21)) + `<path d="${star4(24, 24, 8)}" fill="#000" fill-opacity=".28"/>`,
    'ui-link': ST('M20.5 27.5a8 8 0 0 1 0-11.3l5.7-5.7a8 8 0 0 1 11.3 11.3l-3 3M27.5 20.5a8 8 0 0 1 0 11.3l-5.7 5.7a8 8 0 0 1-11.3-11.3l3-3', 4),
    'ui-skill': S('M6.5 40.5C11 22.5 23.5 9.4 42.5 5.4 30.2 12.8 18.8 24.6 13.2 42.4z'),
    'ui-arrowL': ST('M30 8L14 24l16 16', 5),
    'ui-arrowR': ST('M18 8l16 16-16 16', 5),
    'ui-star': S(star4(24, 24, 21)),
    'ui-retry': ST('M38 24a14 14 0 1 1-4.2-10', 4) + S('M40 5v14H26z'),
    'ui-home': S('M24 6l19 16h-5v20H29V30h-10v12H10V22H5z'),
    'ui-flag': S('M9 4h3.6v40H9z') + S('M12.6 6h26l-6 8.5 6 8.5h-26z'),
    'ui-chain': S('M17 13h14l7 11-7 11H17L10 24z' + 'M19.5 17.5L15.4 24l4.1 6.5h9l4.1-6.5-4.1-6.5z', EO),
    'ui-slow': S(ring(24, 26, 18) + ring(24, 26, 14.6), EO) + S('M20 3h8v4h-8z') + ST('M24 18v8.5l-6 4', 3.4),
    'ui-atkup': S('M24 4l15 16.5h-8.6V30H17.6v-9.5H9z') + S('M17.6 33.4h12.8v3.8H17.6zM17.6 40.2h12.8V44H17.6z'),
    'ui-pause': S('M13 9h8v30h-8zM27 9h8v30h-8z'),
    'ui-person': S('M24 5a9 9 0 1 1 0 18 9 9 0 1 1 0-18zM8 43c0-9.4 7-15.6 16-15.6S40 33.6 40 43z'),
  };

  // 渐变
  const ELG = {
    fire: ['#ffd27a', '#ff7a3d', '#d9261c'],
    water: ['#a6ecff', '#3aa8ff', '#1d4fd8'],
    earth: ['#f5d08a', '#c98a3c', '#7a4a1c'],
    wind: ['#c3ffd9', '#3fd68f', '#0f8a5a'],
    light: ['#fffbe0', '#ffd84a', '#e39b0f'],
    dark: ['#e6c9ff', '#9a63ff', '#4a1fa8'],
  };
  const RAR = {
    bronze: ['#f3c29a', '#c47a45', '#7a3f1c'],
    silver: ['#ffffff', '#c6d3e3', '#7189a8'],
    gold: ['#fff5c4', '#ffcf4a', '#c97c0e'],
  };

  let defs = '';
  for (const k in ICONS) defs += `<symbol id="${k}" viewBox="0 0 48 48">${ICONS[k]}</symbol>`;
  for (const k in ELG) {
    const c = ELG[k];
    defs += `<linearGradient id="g-el-${k}" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".5" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`;
    defs += `<radialGradient id="rg-el-${k}" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="${c[0]}"/><stop offset=".42" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`;
  }
  for (const k in RAR) {
    const c = RAR[k];
    defs += `<linearGradient id="g-r-${k}" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`;
  }
  defs += `<linearGradient id="g-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset=".45" stop-color="#ffd36b"/><stop offset="1" stop-color="#c9781e"/></linearGradient>`;
  defs += `<linearGradient id="g-boss" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#ffcf6b"/><stop offset=".45" stop-color="#e8401f"/><stop offset="1" stop-color="#4a0a08"/></linearGradient>`;
  defs += `<radialGradient id="rg-boss" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#ffb35a"/><stop offset=".45" stop-color="#c8261a"/><stop offset="1" stop-color="#3a0606"/></radialGradient>`;
  // 星盘刻度（徽章内圈）
  let ticks = '';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = i % 4 === 0 ? 39 : 41.5, r1 = 44;
    ticks += `M${f2(50 + r0 * Math.cos(a))} ${f2(50 + r0 * Math.sin(a))}L${f2(50 + r1 * Math.cos(a))} ${f2(50 + r1 * Math.sin(a))}`;
  }
  defs += `<symbol id="crest-ticks" viewBox="0 0 100 100"><path d="${ticks}" fill="none" stroke="currentColor" stroke-width="1"/></symbol>`;

  document.getElementById('svgdefs').innerHTML = `<defs>${defs}</defs>`;

  /* ---------- 组件构建 ---------- */
  const HEX = 'M24 2L43 13V35L24 46L5 35V13Z';
  const HEX_IN = 'M24 5.6L39.9 14.8V33.2L24 42.4L8.1 33.2V14.8Z';
  G.ICON_NAMES = Object.keys(ICONS);
  G.icon = (id, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 48 48" aria-hidden="true"><use href="#${id}"/></svg>`;
  // 属性徽章：六边形 + 属性色 + 白色图形
  G.elBadge = (el, cls = '') =>
    `<svg class="elb el-${el} ${cls}" viewBox="0 0 48 48" aria-hidden="true"><path d="${HEX}" fill="url(#g-el-${el})"/><path d="${HEX_IN}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.3"/><use href="#i-${el}" x="11.5" y="11.5" width="25" height="25" fill="#fff"/></svg>`;
  // 稀有度菱形徽记
  G.rarityPips = (r) => {
    const n = r === 'gold' ? 3 : r === 'silver' ? 2 : 1;
    let s = '';
    for (let i = 0; i < n; i++) s += `<i></i>`;
    return `<span class="pips r-${r}">${s}</span>`;
  };
  // 角色徽记（角色在界面中的图标）
  G.crest = (c, cls = '') => {
    const ch = typeof c === 'string' ? G.DATA.chars[c] : c;
    return `<svg class="crest el-${ch.el} ${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="url(#rg-el-${ch.el})"/>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#f3d48a" stroke-width="2.2"/>
      <use href="#crest-ticks" x="0" y="0" width="100" height="100" color="rgba(255,255,255,.55)"/>
      <circle cx="50" cy="50" r="36" fill="rgba(6,14,34,.28)" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
      <use href="#w-${ch.weapon}" x="22" y="22" width="56" height="56" fill="#fff" class="cw"/>
    </svg>`;
  };
  G.bossCrest = (cls = '') => `<svg class="crest boss ${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="url(#rg-boss)"/>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#ffcf6b" stroke-width="2.2"/>
      <use href="#crest-ticks" width="100" height="100" color="rgba(255,220,180,.55)"/>
      <circle cx="50" cy="50" r="36" fill="rgba(30,4,4,.35)" stroke="rgba(255,200,150,.35)" stroke-width="1"/>
      <use href="#q-boss" x="23" y="21" width="54" height="54" fill="#fff2dc"/>
    </svg>`;
  G.star4 = star4;
})();
