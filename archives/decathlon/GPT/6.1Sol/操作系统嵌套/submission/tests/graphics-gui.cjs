const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:19106"),
    p = b
      .contexts()[0]
      .pages()
      .find((p) => p.url().includes("index.html"));
  await p.reload();
  await p.waitForFunction(() => window.bench);
  await p.evaluate(() => window.bench.reset());
  await p.evaluate(() => {
    let e = window.engine,
      s = e.create(e.get("outer"));
    for (let i = 0; i < 18; i++)
      e.open(s, "player", { path: "/Demo/minimal.scene" });
  });
  await p.waitForFunction(
    () =>
      window.nestGraphics.stats().views === 18 &&
      window.nestGraphics.stats().scenes === 18,
  );
  assert.equal(await p.evaluate(() => window.nestGraphics.stats().contexts), 1);
  const before = await p.evaluate(() =>
    window.engine.inspect().players.map((p) => p.position),
  );
  await p.evaluate(() => window.nestGraphics.lose());
  await p.waitForTimeout(700);
  await p.evaluate(() => window.nestGraphics.restore());
  await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => window.nestGraphics.stats().scenes), 18);
  assert.deepEqual(
    await p.evaluate(() =>
      window.engine.inspect().players.map((p) => p.position),
    ),
    before,
  );
  await p.evaluate(() => {
    let e = window.engine,
      s = e.get("inner-1");
    for (const w of [...s.windows]) e.close(s, w);
  });
  await p.waitForFunction(() => window.nestGraphics.stats().views === 0);
  assert.equal(await p.evaluate(() => window.nestGraphics.stats().scenes), 0);
  console.log(
    "PASS 18 simultaneous views, shared WebGL context, context recovery and resource release",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
