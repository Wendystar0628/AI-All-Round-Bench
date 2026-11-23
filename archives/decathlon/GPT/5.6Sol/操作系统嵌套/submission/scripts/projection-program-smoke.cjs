const CDP = require('chrome-remote-interface');

(async () => {
  const target = (await CDP.List({ port:19106 })).find(x => x.type === 'page' && x.url.startsWith('file:'));
  const client = await CDP({ target, port:19106 });
  const { Runtime, Log } = client;
  await Runtime.enable();await Log.enable();
  const errors=[];Runtime.exceptionThrown(e=>errors.push(e.exceptionDetails.text));Log.entryAdded(e=>{if(e.entry.level==='error')errors.push(e.entry.text);});
  await Runtime.evaluate({ expression:'window.bench.reset()', awaitPromise:true });
  await Runtime.evaluate({ expression:`window.nestedRuntime.createSystem('outer')` });
  await new Promise(resolve=>setTimeout(resolve,450));
  const result=await Runtime.evaluate({
    expression:`(async()=>{
      const runtime=window.nestedRuntime,sys=runtime.systems.get('inner-1');
      const source=[...runtime.windows.values()].find(w=>w.systemId==='inner-1'&&w.appId==='player');
      source.content.querySelector('[data-testid="window-project"]').click();
      await new Promise(resolve=>setTimeout(resolve,120));
      const projection=[...runtime.windows.values()].find(w=>w.appId==='projection'&&w.sourceWindowId===source.id);
      const independent=projection.projectionDisplay!==source.playerState;
      runtime.sendAppMessage(source,'play');
      await new Promise(resolve=>setTimeout(resolve,650));
      const copied={source:source.playerState.position,projection:projection.projectionDisplay.position};
      sys.files['/System/projection-service.nos'].content='PROGRAM 禁用投送\\nSERVICE projection-service\\nDISPLAY blocked\\nINPUT blocked\\nHALT';
      runtime.restartSystem('inner-1');
      const before=projection.projectionDisplay.position;
      source.playerState.position=9;source.playerState.frameTime=9;
      const submitCost=runtime.submitDisplay(source),after=projection.projectionDisplay.position;
      const queuedBefore=source.appMessages.length;
      projection.content.querySelector('[data-testid="player-play"]').click();
      const queuedAfter=source.appMessages.length;
      sys.files['/System/desktop-shell.nos'].content='PROGRAM 极简桌面\\nSERVICE desktop-shell\\nAPPS help files\\nHALT';
      runtime.restartSystem('inner-1');
      const desktopApps=[...runtime.desktops.get('inner-1').icons.querySelectorAll('[data-app-id]')].map(node=>node.dataset.appId);
      return{independent,copied,blocked:{before,after,submitCost,queuedBefore,queuedAfter},desktopApps,rootApps:runtime.systems.get('outer').desktopApps};
    })()`,
    awaitPromise:true,
    returnByValue:true
  });
  console.log(JSON.stringify({result:result.result.value,errors},null,2));
  await client.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
