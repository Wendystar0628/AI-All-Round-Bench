import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    window.addEventListener('resize', () => {
      for (const d of this.desktops.values()) d.layout();
    });`;
const b = `    window.addEventListener('resize', () => {
      for (const d of this.desktops.values()) d.layout();
    });
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (!t.closest('.ctx-menu')) for (const d of this.desktops.values()) d.closeContextMenu();
      if (!t.closest('.start-menu') && !t.closest('[data-testid="start-toggle"]')) for (const d of this.desktops.values()) if (d.startOpen) d.toggleStart(false);
      if (!t.closest('.flyout') && !t.closest('[data-testid="widgets-toggle"]') && !t.closest('.tray-clock')) for (const d of this.desktops.values()) if (d.widgetsOpen) d.toggleWidgets(false);
      if (!t.closest('.flyout') && !t.closest('[data-testid="notifications-toggle"]')) for (const d of this.desktops.values()) if (d.notifFlyoutOpen) d.toggleNotifications(false);
    }, true);`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);