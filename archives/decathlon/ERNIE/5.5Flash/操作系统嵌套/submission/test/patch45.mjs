import fs from 'fs';
let s = fs.readFileSync('js/apps/sysmgr.js', 'utf8');
const a = `    } else {
      mk('snapshot-save', '为选中子系统创建快照', () => { const s = this.selected(); if (s.isRoot) this.os.toast(this.sys, '快照', '请选择子系统', 'warn'); else this.snapshot(s); });
      mk('system-new', '新建子系统', () => this.createChild(), 'btn primary');
    }`;
const b = `    } else {
      mk('system-pause', '暂停根系统', () => this.os.pauseSystem(sys), sys.state === 'running' ? 'btn' : 'btn');
      mk('system-resume', '继续根系统', () => this.os.resumeSystem(sys), 'btn');
      mk('snapshot-save', '为选中子系统创建快照', () => { const s = this.selected(); if (s.isRoot) this.os.toast(this.sys, '快照', '请选择子系统', 'warn'); else this.snapshot(s); });
      mk('system-new', '新建子系统', () => this.createChild(), 'btn primary');
    }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/apps/sysmgr.js', s);