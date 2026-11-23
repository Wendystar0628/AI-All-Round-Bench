import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `      { icon: 'settings', label: '显示设置', act: () => this.os.openApp(this.system, 'settings') },`;
const b = `      { icon: 'widgets', label: '小组件', act: () => this.toggleWidgets(true) },
      { icon: 'bell', label: '通知中心', act: () => this.toggleNotifications(true) },
      { icon: 'settings', label: '显示设置', act: () => this.os.openApp(this.system, 'settings') },`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);