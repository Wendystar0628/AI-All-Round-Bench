const { chromium } = require("playwright-core");
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("assert/strict");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:19106"),
    page = browser
      .contexts()[0]
      .pages()
      .find((p) => p.url().includes("index.html"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await page.waitForFunction(() => window.bench);
  await page.evaluate(() => window.bench.reset());
  await page
    .locator(
      "[data-system-id=outer] > .desktop-heading [data-testid=system-new]",
    )
    .click();
  const desk = page.locator("[data-testid=os-desktop][data-system-id=inner-1]");
  await desk.waitFor();
  await desk.locator(":scope > .desktop-icons [data-app-id=editor]").dblclick();
  const editor = page.locator(
    "[data-testid=app-window][data-system-id=inner-1][data-app-id=editor]",
  );
  const code = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../fixtures/counter.nest.json"),
      "utf8",
    ),
  );
  code.code.find((x) => x[0] === "add")[2] = 7;
  await editor.getByTestId("editor-filename").fill("/Programs/自定义界面.nest");
  await editor.getByTestId("editor-text").fill(JSON.stringify(code, null, 2));
  await editor.getByRole("button", { name: "运行程序", exact: true }).click();
  const custom = page.locator(
    "[data-testid=app-window][data-system-id=inner-1][data-app-id=program]",
  );
  await custom.getByTestId("program-control-increment").click();
  await custom.getByText("计数：7", { exact: true }).waitFor();
  const session = await page.context().newCDPSession(page);
  const capture = async (file) => {
    const r = await session.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    });
    fs.writeFileSync(
      path.join(os.tmpdir(), file),
      Buffer.from(r.data, "base64"),
    );
  };
  await capture("nest-authored-program.png");
  await custom.getByTestId("window-close").click();
  await editor.getByTestId("window-close").click();
  await custom.waitFor({ state: "detached" });
  const player = page.locator(
    "[data-testid=app-window][data-system-id=inner-1][data-app-id=player]",
  );
  await player.locator("summary").click();
  await player.getByTestId("rehearsal-start").click();
  await page.waitForFunction(
    () =>
      window.engine.get("inner-1").windows.find((w) => w.appId === "player")
        ?.player.flight.y > 1,
  );
  await player.getByTestId("rehearsal-target").selectOption("16");
  await page.waitForTimeout(1000);
  await capture("nest-live-physics.png");
  await player.getByTestId("player-pause").click();
  await page.waitForTimeout(800);
  const state = await page.evaluate(
    () =>
      window.engine.get("inner-1").windows.find((w) => w.appId === "player")
        .player,
  );
  assert.equal(state.state, "paused");
  assert(state.frames.length > 10);
  assert(state.controlHistory.length > 5);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS authoring a new interactive program and VM-driven live rehearsal",
    {
      height: state.flight.y,
      frames: state.frames.length,
      controls: state.controlHistory.length,
    },
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
