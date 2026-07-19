const { spawn } = require("node:child_process");
const path = require("node:path");

const { assertPortAvailable } = require("./port-guard.cjs");

const root = path.resolve(__dirname, "..", "..");
const sidecarScript = path.join(root, "e2e", "fixtures", "fake-sidecar.cjs");
const healthUrl = "http://127.0.0.1:9847/__e2e__/health";
const SIDECAR_HOST = "127.0.0.1";
const SIDECAR_PORT = 9847;
let sidecarProcess;

async function startFakeSidecar() {
  if (sidecarProcess) return;

  await assertPortAvailable(
    SIDECAR_HOST,
    SIDECAR_PORT,
    "stop the running Kodama backend before starting browser e2e tests."
  );

  sidecarProcess = spawn(process.execPath, [sidecarScript], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  sidecarProcess.stdout.on("data", (chunk) => output.push(String(chunk)));
  sidecarProcess.stderr.on("data", (chunk) => output.push(String(chunk)));

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (sidecarProcess.exitCode !== null) {
      throw new Error(`Fake sidecar exited before it was ready.\n${output.join("")}`);
    }
    try {
      if ((await fetch(healthUrl)).ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for the fake sidecar.\n${output.join("")}`);
}

async function stopFakeSidecar() {
  if (!sidecarProcess || sidecarProcess.exitCode !== null) return;
  const processToStop = sidecarProcess;
  sidecarProcess = undefined;
  processToStop.kill("SIGTERM");
  await new Promise((resolve) => processToStop.once("exit", resolve));
}

module.exports = { startFakeSidecar, stopFakeSidecar };
