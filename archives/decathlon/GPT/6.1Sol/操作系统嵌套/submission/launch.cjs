const { spawn } = require("node:child_process");
const electron = require("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [__dirname, ...process.argv.slice(2)], {
  cwd: __dirname,
  env,
  stdio: "inherit",
});
child.on("error", (e) => {
  console.error("无法启动栖境：", e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code || 0));
process.on("SIGINT", () => child.kill("SIGINT"));
