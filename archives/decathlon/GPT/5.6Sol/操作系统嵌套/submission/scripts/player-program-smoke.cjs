const CDP = require('chrome-remote-interface');

(async () => {
  const target = (await CDP.List({ port:19106 })).find(x => x.type === 'page' && x.url.startsWith('file:'));
  const client = await CDP({ target, port:19106 });
  const { Runtime, Log } = client;
  await Runtime.enable();
  await Log.enable();
  const errors = [];
  Runtime.exceptionThrown(e => errors.push(e.exceptionDetails.text));
  Log.entryAdded(e => { if (e.entry.level === 'error') errors.push(e.entry.text); });
  await Runtime.evaluate({ expression:'window.bench.reset()', awaitPromise:true });
  await Runtime.evaluate({ expression:`window.nestedRuntime.createSystem('outer')` });
  await new Promise(r => setTimeout(r, 450));
  const result = await Runtime.evaluate({
    expression:`(async()=>{
      const runtime=window.nestedRuntime,sys=runtime.systems.get('inner-1');
      const player=[...runtime.windows.values()].find(w=>w.systemId==='inner-1'&&w.appId==='player');
      runtime.sendAppMessage(player,'play');
      await new Promise(r=>setTimeout(r,1000));
      const normal={position:player.playerState.position,rules:{...sys.playerRules}};
      runtime.sendAppMessage(player,'stop');
      await new Promise(r=>setTimeout(r,80));
      sys.files['/System/scene-player.nos'].content='PROGRAM 慢速播放器\\nSERVICE scene-player\\nSPEED scale=0.25\\nTIMELINE cost=5\\nSCENE cost=7\\nAPPLICATION cost=3\\nREHEARSAL cost=90\\nFRAMESTEP 0.1\\nHALT';
      runtime.restartSystem('inner-1');
      runtime.sendAppMessage(player,'step');
      await new Promise(r=>setTimeout(r,80));
      const stepped=player.playerState.position;
      runtime.sendAppMessage(player,'play');
      await new Promise(r=>setTimeout(r,1000));
      return {
        normal,
        modified:{position:player.playerState.position,stepped,rules:{...sys.playerRules}},
        processes:['p-player','p-timeline','p-scene'].map(id=>{const p=sys.processes.find(x=>x.id===id);return{id:p.id,used:p.used,state:p.state};})
      };
    })()`,
    awaitPromise:true,
    returnByValue:true
  });
  console.log(JSON.stringify({ result:result.result.value, errors }, null, 2));
  await client.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
