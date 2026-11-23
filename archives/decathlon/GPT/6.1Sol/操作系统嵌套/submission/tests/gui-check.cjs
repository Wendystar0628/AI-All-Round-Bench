async function capture(page, path) {
  const c = await page.context().newCDPSession(page);
  const r = await c.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  fs.writeFileSync(path, Buffer.from(r.data, "base64"));
  await c.detach();
}
const fs = require("fs");
const { chromium } = require("playwright-core");
const assert = require("assert/strict");
const path = require("path"),
  os = require("os");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:19106");
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("index.html"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await page.waitForFunction(() => window.bench);
  await page.evaluate(() => window.bench.reset());
  const desk = (id) =>
    page.locator(`[data-testid="os-desktop"][data-system-id="${id}"]`);
  const own = (id, test) =>
    desk(id).locator(`:scope > .desktop-heading [data-testid="${test}"]`);
  await desk("outer")
    .locator(':scope > .desktop-icons [data-app-id="files"]')
    .dblclick();
  let files = page
    .locator('[data-app-id="files"][data-testid="app-window"]')
    .first();
  await files.locator('[data-file-path="/Demo/sample.sheet"]').dblclick();
  let sheet = page.locator(
    '[data-app-id="spreadsheet"][data-testid="app-window"]',
  );
  await sheet.locator('[data-cell-address="E2"]').fill("=SUM(D2:D4)");
  await sheet.locator('[data-cell-address="E2"]').press("Enter");
  await page.waitForTimeout(250);
  assert.equal(
    await sheet.locator('[data-cell-address="E2"]').inputValue(),
    "312",
  );
  await sheet.getByTestId("window-minimize").click();
  await files.getByTestId("window-minimize").click();
  await own("outer", "system-new").click();
  await page.waitForTimeout(300);
  await own("inner-1", "system-new").click();
  await page.waitForTimeout(300);
  await desk("inner-2")
    .locator(':scope > .desktop-icons [data-app-id="charts"]')
    .dblclick();
  let chart = page.locator(
    '[data-app-id="charts"][data-system-id="inner-2"][data-testid="app-window"]',
  );
  await chart.getByTestId("chart-connect").click();
  await page.waitForTimeout(500);
  assert.equal(await chart.locator("svg.data-chart").count(), 1);
  await chart.getByTestId("window-project").click();
  await chart
    .locator('[data-testid="project-target"][data-target-system-id="outer"]')
    .click();
  await page.waitForTimeout(300);
  let proj = page.locator(
    '[data-app-id="projection"][data-source-app-id="charts"]',
  );
  await proj.getByTestId("chart-type").selectOption("line");
  await page.waitForTimeout(300);
  assert.equal(await proj.getByTestId("chart-type").inputValue(), "line");
  await capture(page, path.join(os.tmpdir(), "nest-chart.png"));
  await proj.getByTestId("window-minimize").click();
  await own("inner-2", "system-new").click();
  await page.waitForTimeout(300);
  await desk("inner-3")
    .locator(':scope > .desktop-icons [data-app-id="files"]')
    .dblclick();
  let inspect = await page.evaluate(() => window.bench.inspect());
  assert.equal(inspect.systems.length, 4);
  await capture(page, path.join(os.tmpdir(), "nest-four-layers.png"));
  // Expose a source player by minimizing its file window, then use ordinary projection controls.
  let deepFiles = page.locator(
    '[data-app-id="files"][data-system-id="inner-3"][data-testid="app-window"]',
  );
  await deepFiles.getByTestId("window-minimize").click();
  let player = page.locator(
    '[data-app-id="player"][data-system-id="inner-3"][data-testid="app-window"]',
  );
  await player.getByTestId("window-project").click();
  await player
    .locator('[data-testid="project-target"][data-target-system-id="outer"]')
    .click();
  let view = page.locator(
    '[data-app-id="projection"][data-source-app-id="player"]',
  );
  await view.getByTestId("window-maximize").click();
  await view.getByTestId("player-play").click();
  await page.waitForTimeout(5200);
  await capture(page, path.join(os.tmpdir(), "nest-flight.png"));
  await view.getByTestId("player-pause").click();
  await page.waitForTimeout(300);
  inspect = await page.evaluate(() => window.bench.inspect());
  assert(inspect.players.find((p) => p.systemId === "inner-3").position > 1);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS desktop, formula, nested chart messages, projection, four layers and WebGL playback",
  );
  console.log(JSON.stringify(inspect, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
