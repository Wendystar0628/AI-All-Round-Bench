const CDP = require('chrome-remote-interface');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const target = (await CDP.List({ port:19106 })).find(x => x.type === 'page' && x.url.startsWith('file:'));
  const client = await CDP({ target, port:19106 });
  const { Runtime } = client;
  await Runtime.enable();
  await Runtime.evaluate({ expression:'window.bench.reset()', awaitPromise:true });
  await Runtime.evaluate({ expression:`window.nestedRuntime.createSystem('outer')` });
  await delay(500);
  const result = await Runtime.evaluate({
    expression:`(async()=>{
      const runtime=window.nestedRuntime,sys=runtime.systems.get('inner-1');
      const player=[...runtime.windows.values()].find(w=>w.systemId==='inner-1'&&w.appId==='player');
      sys.virtualTime=12.5;
      player.playerState.position=6.25;
      player.playerState.frameTime=6.25;
      player.playerView.update(6.25);
      const snap=runtime.makeSnapshot('inner-1');
      sys.virtualTime=99;
      player.playerState.position=1;
      player.playerState.frameTime=1;
      sys.files['/Documents/after.txt']={type:'text',content:'after'};
      const restored=runtime.restoreSnapshot('outer',snap);
      const restoredPlayer={position:player.playerState.position,frameTime:player.playerState.frameTime};
      const parent=runtime.systems.get('outer');
      parent.files['/Systems/inner-1/kernel.nos'].content='KERNEL NEST/1\\nSCHEDULER priority\\nMESSAGE lifo\\nFILES readonly\\nSYSCALL answer RETURN 42\\nBOOT desktop';
      runtime.restartSystem('inner-1');
      const process=runtime.compileAndRun('inner-1','/Programs/test.nos','PROGRAM 内核调用\\nCALL answer result\\nPRINT result\\nWRITE /Documents/blocked.txt hello\\nHALT');
      await new Promise(resolve=>setTimeout(resolve,350));
      runtime.forkSystem('inner-1');
      await new Promise(resolve=>setTimeout(resolve,450));
      return {
        snap,restored,restoredPlayer,time:sys.virtualTime,
        kernel:{scheduler:sys.scheduler,message:sys.messageRule,files:sys.fileRule,calls:sys.customSyscalls},
        program:{state:process.state,output:process.output},
        blockedFile:!!sys.files['/Documents/blocked.txt'],
        systems:(await window.bench.inspect()).systems
      };
    })()`,
    awaitPromise:true,
    returnByValue:true
  });
  console.log(JSON.stringify(result.result.value, null, 2));
  await client.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
