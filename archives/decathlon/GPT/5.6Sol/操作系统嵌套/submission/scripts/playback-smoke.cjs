const CDP=require('chrome-remote-interface');
const fs=require('fs');const os=require('os');const path=require('path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const target=(await CDP.List({port:19106})).find(x=>x.type==='page'&&x.url.startsWith('file:'));const client=await CDP({target,port:19106});const {Runtime,Page}=client;await Promise.all([Runtime.enable(),Page.enable()]);
await Runtime.evaluate({expression:`document.querySelector('[data-window-id="win-2"] [data-testid="window-project"]').click()`});await delay(600);
await Runtime.evaluate({expression:`document.querySelector('[data-app-id="projection"] [data-testid="window-maximize"]').click();document.querySelector('[data-app-id="projection"] [data-testid="player-play"]').click()`});await delay(12800);
const state=await Runtime.evaluate({expression:'window.bench.inspect()',awaitPromise:true,returnByValue:true});const shot=await Page.captureScreenshot({format:'png',captureBeyondViewport:false});const file=path.join(os.tmpdir(),'nested-os-impact.png');fs.writeFileSync(file,Buffer.from(shot.data,'base64'));console.log(JSON.stringify({state:state.result.value,screenshot:file},null,2));await client.close();})().catch(e=>{console.error(e);process.exitCode=1});
