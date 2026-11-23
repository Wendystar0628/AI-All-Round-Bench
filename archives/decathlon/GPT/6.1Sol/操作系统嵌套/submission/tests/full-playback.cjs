const { chromium } = require("playwright-core"),
  fs = require("fs");
(async () => {
  let b = await chromium.connectOverCDP("http://127.0.0.1:19106");
  let p = b.contexts()[0].pages()[0],
    w = p.locator("[data-app-id=projection][data-source-app-id=player]");
  await w.getByTestId("player-time").fill("11.5");
  await w.getByTestId("player-time").press("Tab");
  await p.waitForTimeout(400);
  let c = await p.context().newCDPSession(p);
  let r = await c.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  fs.writeFileSync(
    process.env.TEMP + "/nest-crash.png",
    Buffer.from(r.data, "base64"),
  );
  await w.getByTestId("player-stop").click();
  await p.waitForTimeout(200);
  await w.getByTestId("player-play").click();
  await p.waitForTimeout(16000);
  const state = await p.evaluate(() => window.bench.inspect());
  let player = state.players.find((x) => x.systemId === "inner-3");
  if (
    player.position !== 15 ||
    player.frameTime !== 15 ||
    player.state !== "paused"
  )
    throw Error("完整演出未停在末帧");
  console.log(
    "PASS 15 second full playback, final position and sample time",
    player,
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
