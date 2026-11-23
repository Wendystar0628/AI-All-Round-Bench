import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0,600)));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const out = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 600));
  // run service demo
  const r1 = child.spawn('svc', child.fs.read('/Demo/service.prog'), { type: 'program', quota: 1200 });
  // run sender/receiver
  const r2 = child.spawn('sender', child.fs.read('/Demo/sender.prog'), { type: 'program', quota: 1200 });
  await new Promise(r => setTimeout(r, 1500));
  const svc = child.processes.find(p => p.name === 'svc');
  const recv = child.processes.find(p => p.name === 'receiver');
  const sender = child.processes.find(p => p.name === 'sender');
  // loop process
  const loop = child.spawn('loop', child.fs.read('/Demo/loop.prog'), { type: 'program', quota: 1200 });
  const lpid = loop.proc.id;
  await new Promise(r => setTimeout(r, 600));
  const loopProc = child.processes.find(p => p.id === lpid);
  const used1 = loopProc.usedTotal;
  loopProc._prevState = loopProc.state; loopProc.state = 'suspended';
  const suspendedState = loopProc.state;
  await new Promise(r => setTimeout(r, 500));
  const usedS = loopProc.usedTotal;
  loopProc.state = loopProc._prevState || 'ready';
  await new Promise(r => setTimeout(r, 500));
  const used2 = loopProc.usedTotal;
  // kernel edit: quantum 80
  const kp = child.kernelSourcePath;
  let src = os.root.fs.read(kp);
  const changed = src.replace('let quantum = 420', 'let quantum = 80').replace('let msg_limit = 64', 'let msg_limit = 5');
  os.root.fs.write(kp, changed, Date.now());
  os.restartSystem(child);
  await new Promise(r => setTimeout(r, 1000));
  const qAfter = child.policy.quantum;
  const msgAfter = child.policy.msgLimit;
  // break kernel
  const bad = 'let x = = 1\n';
  os.root.fs.write(kp, bad, Date.now());
  os.restartSystem(child);
  await new Promise(r => setTimeout(r, 500));
  const errState = child.state;
  const errLog = child.errorLog.slice(-2);
  // fix
  os.root.fs.write(kp, changed, Date.now());
  os.restartSystem(child);
  await new Promise(r => setTimeout(r, 600));
  const fixedState = child.state;
  return {
    svc: { state: svc.state, out: svc.output.slice(-5) },
    receiver: recv ? { state: recv.state, out: recv.output.slice(-5) } : null,
    sender: sender ? { state: sender.state, out: sender.output.slice(-5) } : null,
    loop: { used1, suspendedState, usedS, used2, advancedAfterResume: used2 - usedS },
    kernel: { qAfter, msgAfter, errState, errLog, fixedState },
    policy: child.policy
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.disconnect();