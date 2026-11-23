import fs from 'fs';
let k = fs.readFileSync('js/kernel.js', 'utf8');
k = k.replace(`      } else if (p.state === 'waiting' && p.waitKind === 'service' && p.serviceValue !== undefined) {
        p.pendingPush = p.serviceValue;
        p.serviceValue = undefined;
        p.state = 'ready';
        p.waitKind = null;
      }`, `      }`);
k = k.replace(`        entry.proc.serviceValue = val;
        if (entry.proc.state === 'waiting' && entry.proc.waitKind === 'service') {
          entry.proc.pendingPush = val;
          entry.proc.state = 'ready';
          entry.proc.waitKind = null;
        }`, `        entry.proc.serviceValue = undefined;
        if (entry.proc.state === 'waiting' && entry.proc.waitKind === 'service') {
          entry.proc.pendingPush = val;
          entry.proc.state = 'ready';
          entry.proc.waitKind = null;
        }`);
fs.writeFileSync('js/kernel.js', k);
console.log('done');