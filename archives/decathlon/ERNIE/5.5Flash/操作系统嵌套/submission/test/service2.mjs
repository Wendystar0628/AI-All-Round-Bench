import { System, createKernelProcess } from '../js/kernel.js';
import { KERNEL_TEMPLATE, SERVICE_PROGRAM } from '../js/data.js';
const os = {};
const sys = new System(os, { id: 's', name: 's' });
sys.debugService = true;
sys.fs.write('/System/kernel.sys', KERNEL_TEMPLATE);
sys.fs.write('/Demo/service.prog', SERVICE_PROGRAM);
const origSyscall = sys.syscall.bind(sys);
sys.syscall = (name, args, proc) => {
  if (name === 'service' || name === 'service_reply') console.log('CALL', name, JSON.stringify(args), 'proc', proc.id, 'req', proc.serviceReq);
  const r = origSyscall(name, args, proc);
  if (name === 'service' || name === 'service_reply') console.log('  RET', JSON.stringify(r), 'wait', proc.waitKind, 'pending', JSON.stringify([...sys.pendingServices.entries()].map(([k,v]) => [k, v.req])));
  return r;
};
createKernelProcess(sys, KERNEL_TEMPLATE, 900);
sys.spawn('svc', SERVICE_PROGRAM, { type: 'program', quota: 1200 });
for (let i = 0; i < 80; i++) {
  sys.step(60000);
  const svc = sys.processes.find(p => p.name === 'svc');
  if (i % 10 === 0) console.log('step', i, 'svc', svc.state, 'pc', svc.pc, 'pending', JSON.stringify([...sys.pendingServices.entries()].map(([k,v]) => [k, v.req])));
}
const svc = sys.processes.find(p => p.name === 'svc');
console.log(svc.output);