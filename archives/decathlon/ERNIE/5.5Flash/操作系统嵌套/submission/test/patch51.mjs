import fs from 'fs';
let l = fs.readFileSync('js/lang.js', 'utf8');
l = l.replace(`      type: this.type, meta: this.meta, output: this.output.slice(-40), mem: this.mem,
      inbox: this.inbox`, `      type: this.type, meta: this.meta, output: this.output.slice(-40), mem: this.mem,
      inbox: this.inbox, usedStep: this.usedStep, prevState: this._prevState || null,
      hasPendingPush: this.pendingPush !== undefined, pendingPush: this.pendingPush,
      wakePushSet: this.wakePushSet, wakePush: this.wakePush,
      serviceValue: this.serviceValue`);
fs.writeFileSync('js/lang.js', l);
let k = fs.readFileSync('js/kernel.js', 'utf8');
k = k.replace(`      proc.mem = ps.mem || 0;
      sys.processes.push(proc);`, `      proc.mem = ps.mem || 0;
      proc.usedStep = ps.usedStep || 0;
      if (ps.prevState) proc._prevState = ps.prevState;
      if (ps.hasPendingPush) proc.pendingPush = ps.pendingPush;
      proc.wakePushSet = !!ps.wakePushSet;
      proc.wakePush = ps.wakePush ?? 0;
      if (ps.serviceValue !== undefined) proc.serviceValue = ps.serviceValue;
      sys.processes.push(proc);`);
fs.writeFileSync('js/kernel.js', k);
console.log('done');