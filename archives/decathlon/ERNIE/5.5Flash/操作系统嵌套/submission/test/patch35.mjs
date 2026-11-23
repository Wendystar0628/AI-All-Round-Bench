import fs from 'fs';
let s = fs.readFileSync('js/apps/tasks.js', 'utf8');
const a = `    } else {
      item('本系统预算（父系统拨付）', h('div', { class: 'mono' }, \`\${fmtInt(sys.lastGrant || 0)} / 步\`), \`拨付比例 \${(sys.grantRatio * 100).toFixed(0)}%\`);
    }`;
const b = `    } else {
      const b = h('input', { class: 'input', type: 'number', value: String(Math.round(sys.lastGrant || sys.budget)), style: { width: '100%' }, 'data-testid': 'tasks-budget', 'data-system-id': sys.id });
      b.addEventListener('change', () => {
        const val = Math.max(100, Number(b.value) || 1000);
        const ratio = clamp(val / Math.max(1, sys.parent.budget), 0.05, 0.85);
        this.os.setGrant(sys, ratio);
        this.os.toast(sys, '预算请求已更新', \`\${sys.id} 拨付比例 \${(ratio * 100).toFixed(0)}%\`, 'ok');
      });
      item('本系统预算（父系统拨付）', b, \`拨付比例 \${(sys.grantRatio * 100).toFixed(0)}%\`);
    }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/apps/tasks.js', s);