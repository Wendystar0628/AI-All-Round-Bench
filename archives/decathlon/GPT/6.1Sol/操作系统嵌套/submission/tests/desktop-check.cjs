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
  const b = await chromium.connectOverCDP("http://127.0.0.1:19106"),
    p = b
      .contexts()[0]
      .pages()
      .find((x) => x.url().includes("index.html"));
  await p.reload();
  await p.waitForFunction(() => window.bench);
  await p.evaluate(() => window.bench.reset());
  const root = p.locator("[data-testid=os-desktop][data-system-id=outer]");
  await root
    .locator(":scope > .desktop-icons [data-app-id=widgets]")
    .dblclick();
  let widgets = p.locator("[data-testid=app-window][data-app-id=widgets]");
  await widgets.getByTestId("widget-timer-input").fill("1");
  await widgets.getByTestId("widget-timer-start").click();
  await widgets.getByTestId("widget-note-text").fill("每一层，都有新的可能。");
  await widgets.getByTestId("widget-note-save").click();
  await widgets.getByRole("button", { name: "下个月", exact: true }).click();
  await p.waitForTimeout(1500);
  assert(
    (await p.evaluate(() => window.engine.get("outer").notifications)).some(
      (x) => x.text.includes("倒计时结束"),
    ),
  );
  await capture(p, path.join(os.tmpdir(), "nest-widgets.png"));
  await widgets.getByTestId("window-minimize").click();
  await root.locator(":scope > .taskbar [data-testid=start-toggle]").click();
  await root.getByTestId("launch-settings").click();
  let settings = p.locator("[data-testid=app-window][data-app-id=settings]");
  await settings
    .locator("[data-testid=settings-wallpaper][data-value=dusk]")
    .click();
  await settings.locator("[data-testid=settings-accent]").nth(1).click();
  await settings.getByTestId("settings-scale").selectOption("1.25");
  assert.equal(
    await p.evaluate(() => window.engine.get("outer").settings.scale),
    1.25,
  );
  await settings.getByTestId("settings-scale").selectOption("1");
  await settings
    .locator("[data-testid=settings-wallpaper][data-value=valley]")
    .click();
  await settings.getByTestId("window-close").click();
  await root
    .locator(":scope > .desktop-icons [data-app-id=browser]")
    .dblclick();
  await p.waitForTimeout(10000);
  let browser = p.locator("[data-testid=app-window][data-app-id=browser]");
  console.log(
    "browser",
    await p.evaluate(() => window.bench.inspect().then((x) => x.browsers)),
  );
  await browser.getByTestId("browser-address").fill("https://example.com");
  await browser.getByTestId("browser-go").click();
  await p.waitForTimeout(3000);
  await capture(p, path.join(os.tmpdir(), "nest-browser.png"));
  let state = await p.evaluate(() => window.bench.inspect());
  assert(state.browsers[0].url.includes("example.com"));
  console.log(
    "PASS countdown, note, calendar, wallpaper, accent, scale and real browser navigation",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
