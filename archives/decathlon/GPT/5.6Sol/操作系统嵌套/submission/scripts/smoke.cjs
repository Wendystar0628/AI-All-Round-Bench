const CDP = require('chrome-remote-interface');
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const targets = await CDP.List({ port: 19106 });
  const target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'));
  if (!target) throw new Error('Nested OS page target not found');
  const client = await CDP({ target, port: 19106 });
  const { Runtime, Page, Console } = client;
  await Promise.all([Runtime.enable(), Page.enable(), Console.enable()]);
  const errors = [];
  Runtime.exceptionThrown(({ exceptionDetails }) => errors.push(exceptionDetails.text || exceptionDetails.exception?.description));
  Console.messageAdded(({ message }) => { if (message.level === 'error') errors.push(message.text); });
  await Runtime.evaluate({ expression: 'window.bench.ready()', awaitPromise: true, returnByValue: true });
  const inspected = await Runtime.evaluate({ expression: 'window.bench.inspect()', awaitPromise: true, returnByValue: true });
  const dom = await Runtime.evaluate({
    expression: `({bench:window.bench.version, desktops:document.querySelectorAll('[data-testid="os-desktop"]').length, icons:document.querySelectorAll('[data-testid="desktop-icon"]').length, title:document.title})`,
    returnByValue: true
  });
  const shot = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  const shotPath = path.join(os.tmpdir(), 'nested-os-stage1.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ dom: dom.result.value, inspect: inspected.result.value, errors, screenshot: shotPath }, null, 2));
  await client.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
