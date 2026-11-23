const CDP = require('chrome-remote-interface');
const fs = require('fs');
const os = require('os');
const path = require('path');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const target = (await CDP.List({ port: 19106 })).find((item) => item.type === 'page' && item.url.startsWith('file:'));
  const client = await CDP({ target, port: 19106 });
  const { Runtime, Page } = client;
  await Promise.all([Runtime.enable(), Page.enable()]);
  await Runtime.evaluate({ expression: `document.querySelector('[data-system-id="outer"] [data-testid="system-new"]').click()` });
  await delay(1800);
  const state = await Runtime.evaluate({ expression: `window.bench.inspect()`, awaitPromise: true, returnByValue: true });
  const details = await Runtime.evaluate({ expression: `({desktops:document.querySelectorAll('[data-testid="os-desktop"]').length, canvases:document.querySelectorAll('[data-testid="player-view"]').length, webgl:[...document.querySelectorAll('[data-testid="player-view"]')].map(c=>!!c.getContext('webgl2'))})`, returnByValue: true });
  const shot = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  const shotPath = path.join(os.tmpdir(), 'nested-os-player.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ state:state.result.value, details:details.result.value, screenshot:shotPath },null,2));
  await client.close();
})().catch((error)=>{console.error(error);process.exitCode=1;});
