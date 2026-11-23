import fs from 'fs';
let l = fs.readFileSync('js/lang.js', 'utf8');
l = l.replace(`      serviceValue: this.serviceValue`, `      serviceValue: this.serviceValue, serviceReq: this.serviceReq`);
fs.writeFileSync('js/lang.js', l);
let k = fs.readFileSync('js/kernel.js', 'utf8');
k = k.replace(`      errorLog: this.errorLog.slice(-20), msgSeq: this.msgSeq, kernelError: this.kernelError || null,`, `      errorLog: this.errorLog.slice(-20), msgSeq: this.msgSeq, kernelError: this.kernelError || null,
      serviceReq: this.serviceReq,
      pendingServices: [...this.pendingServices.values()].map(e => ({ procId: e.proc.id, req: e.req })),`);
k = k.replace(`    sys.kernelError = data.kernelError || null;`, `    sys.kernelError = data.kernelError || null;
    sys.serviceReq = data.serviceReq || 1;`);
k = k.replace(`      proc.serviceValue = ps.serviceValue;`, `      proc.serviceValue = ps.serviceValue;
      proc.serviceReq = ps.serviceReq ?? 0;`);
k = k.replace(`    if (sys.nextPid == null) sys.nextPid = Math.max(1, ...sys.processes.map(p => p.id + 1));`, `    for (const ps of data.pendingServices || []) {
      const p = sys.processes.find(x => x.id === ps.procId);
      if (p) sys.pendingServices.set(p.id, { proc: p, req: ps.req });
    }
    if (sys.nextPid == null) sys.nextPid = Math.max(1, ...sys.processes.map(p => p.id + 1));`);
fs.writeFileSync('js/kernel.js', k);
console.log('done');