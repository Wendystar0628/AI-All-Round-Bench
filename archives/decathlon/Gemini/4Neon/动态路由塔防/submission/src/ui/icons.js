// Unified Cyber-Ops Daemon OS SVG Icon Set (100% vector, razor-sharp up to 4K!)

export const ICONS = {
  // === RESOURCES & HUD ===
  compute: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" fill="currentColor" opacity="0.35"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>`,
  intel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg>`,
  integrity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2.5L4 6v5.5c0 5 3.4 9.3 8 10.5 4.6-1.2 8-5.5 8-10.5V6l-8-3.5z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>`,
  wave: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12h3l2.5-6 4 12 3-8 2 2h5.5"/></svg>`,

  // === TOWERS ===
  firewall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3L4 6.5v5c0 4.8 3.2 8.8 8 9.8 4.8-1 8-5 8-9.8v-5L12 3z" fill="currentColor" opacity="0.18"/><path d="M12 3L4 6.5v5c0 4.8 3.2 8.8 8 9.8 4.8-1 8-5 8-9.8v-5L12 3z"/><path d="M8 9.5h8M8 13.5h8M12 6.5v11"/></svg>`,
  honeypot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12,2.5 19.5,7 19.5,17 12,21.5 4.5,17 4.5,7" fill="currentColor" opacity="0.16"/><polygon points="12,2.5 19.5,7 19.5,17 12,21.5 4.5,17 4.5,7"/><circle cx="12" cy="12" r="3"/><path d="M12 6v2.5M12 15.5V18M6.5 9l2.2 1.2M15.3 13.8l2.2 1.2"/></svg>`,
  airgap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="6.5" height="14" rx="1" fill="currentColor" opacity="0.22"/><rect x="14.5" y="5" width="6.5" height="14" rx="1" fill="currentColor" opacity="0.22"/><path d="M3 5h6.5v14H3zM14.5 5H21v14h-6.5zM12 3v18" stroke-dasharray="2.5 2"/><path d="M9.5 12h5"/></svg>`,
  interceptor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7.5" stroke-dasharray="4 2"/><circle cx="12" cy="12" r="2.6" fill="currentColor" opacity="0.3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><polygon points="12,5 14.5,9.5 9.5,9.5" fill="currentColor"/></svg>`,
  sandbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="5" fill="currentColor" opacity="0.16"/><circle cx="12" cy="12" r="5"/><path d="M12 7v5l3.5 2"/></svg>`,
  repair: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.14"/><circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M7.5 12h9" stroke-width="2.6"/></svg>`,

  // === ITEMS ===
  isolator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke-width="2.2"/></svg>`,
  downgrade: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 19h16" stroke-dasharray="3 2"/><path d="M6 7h3M15 7h3"/></svg>`,
  restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 1 1 2.4 5.7"/><path d="M4 7v5h5"/><path d="M12 8.5v7M8.5 12h7"/></svg>`,

  // === ENEMIES & BOSSES ===
  worm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 16c2-5 5-5 7 0s5 5 9-3"/><circle cx="19.5" cy="11.5" r="2.2" fill="currentColor"/><path d="M21 9.5l1.8-1M21 13.5l1.8 1"/></svg>`,
  flood: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="3,6 15,6 21,12 15,18 3,18" fill="currentColor" opacity="0.22"/><polygon points="3,6 15,6 21,12 15,18 3,18"/><path d="M7 9l4 3-4 3M12 9l4 3-4 3"/></svg>`,
  trojan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16" opacity="0.5"/><circle cx="15" cy="15" r="2.5" fill="currentColor"/></svg>`,
  ransom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" opacity="0.2"/><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>`,
  hotspot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 13a6.5 6.5 0 0 1 9 0"/><circle cx="12" cy="17.5" r="2.2" fill="currentColor"/></svg>`,
  packager: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12,2.5 20.5,7.2 20.5,16.8 12,21.5 3.5,16.8 3.5,7.2"/><polygon points="12,7 16.5,9.6 16.5,14.4 12,17 7.5,14.4 7.5,9.6" fill="currentColor" opacity="0.3"/></svg>`,
  boss_wankui: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12,2 21,7 19,17 12,22 5,17 3,7" fill="currentColor" opacity="0.22"/><polygon points="12,2 21,7 19,17 12,22 5,17 3,7"/><circle cx="9" cy="11" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/><path d="M8 16h8"/></svg>`,
  boss_shenlou: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12,2 22,12 12,22 2,12" fill="currentColor" opacity="0.2"/><polygon points="12,2 22,12 12,22 2,12"/><circle cx="12" cy="12" r="4"/><path d="M2 12h6M16 12h6"/></svg>`,
  boss_zheying: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L3 9l4 12 5-3 5 3 4-12-9-7z" fill="currentColor" opacity="0.24"/><path d="M12 2L3 9l4 12 5-3 5 3 4-12-9-7z"/><circle cx="12" cy="11" r="2.2" fill="currentColor"/></svg>`,

  // === CONTROLS ===
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.5" height="16" rx="1"/><rect x="13.5" y="4" width="4.5" height="16" rx="1"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><circle cx="12" cy="12" r="3"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="4,9 9,9 14,5 14,19 9,15 4,15" fill="currentColor" opacity="0.25"/><polygon points="4,9 9,9 14,5 14,19 9,15 4,15"/><path d="M17.5 8.5a5 5 0 0 1 0 7M20 6a8.5 8.5 0 0 1 0 12"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="4,9 9,9 14,5 14,19 9,15 4,15"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`,
  codex: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h6.5a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4V4z"/><path d="M20 4h-6.5a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20V4z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  radar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" opacity="0.55"/><path d="M12 12l6-4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13,2 4,14 11,14 10,22 20,10 13,10"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,3 22,20 2,20"/><path d="M12 9v5M12 17.5v.5"/></svg>`,
  core: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="currentColor" opacity="0.22"/><polygon points="12,2 21,7 21,17 12,22 3,17 3,7"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
};

export function iconHtml(key, cls = 'ico') {
  return `<span class="${cls}">${ICONS[key] || ICONS.compute}</span>`;
}
