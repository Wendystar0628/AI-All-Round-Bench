const CDP = require('chrome-remote-interface');

(async () => {
  const target = (await CDP.List({ port:19106 })).find(x => x.type === 'page' && x.url.startsWith('file:'));
  const client = await CDP({ target, port:19106 });
  const { Runtime } = client;
  await Runtime.enable();
  await Runtime.evaluate({ expression:'window.bench.reset()', awaitPromise:true });
  await Runtime.evaluate({ expression:`window.nestedRuntime.createSystem('outer')` });
  await new Promise(resolve => setTimeout(resolve, 450));
  const result = await Runtime.evaluate({
    expression:`(()=>{
      const runtime=window.nestedRuntime,sys=runtime.systems.get('inner-1');
      const player=[...runtime.windows.values()].find(w=>w.systemId==='inner-1'&&w.appId==='player');
      player.playerState.position=4.75;player.playerState.frameTime=4.75;player.playerView.update(4.75);
      player.x=44;player.y=33;player.width=700;player.height=430;
      player.el.style.left='44px';player.el.style.top='33px';player.el.style.width='700px';player.el.style.height='430px';
      player.minimize();
      const id=player.id,path=runtime.makeSnapshot('inner-1');
      runtime.closeWindow(player,true);
      sys.files['/Documents/later.txt']={type:'text',content:'later'};
      const restored=runtime.restoreSnapshot('outer',path),reopened=runtime.windows.get(id);
      return {restored,id,reopened:!!reopened,position:reopened?.playerState.position,frameTime:reopened?.playerState.frameTime,minimized:reopened?.minimized,rect:{x:reopened?.x,y:reopened?.y,width:reopened?.width,height:reopened?.height},laterFile:!!sys.files['/Documents/later.txt']};
    })()`,
    returnByValue:true
  });
  console.log(JSON.stringify(result.result.value, null, 2));
  await client.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
