const { spawn } = require("node:child_process");
const path = require("node:path");

const VITE_URL = "http://127.0.0.1:1421";
const root = path.resolve(__dirname, "..", "..");
const viteCommand = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vite.cmd" : "vite"
);
let viteProcess;
let output = "";

function appendOutput(chunk) {
  output = `${output}${chunk}`.slice(-4_000);
}

async function startViteServer() {
  if (viteProcess) {
    return;
  }

  viteProcess = spawn(viteCommand, ["--host", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VITE_E2E_NETWORK_GUARD: "true" },
  });
  viteProcess.stdout.on("data", appendOutput);
  viteProcess.stderr.on("data", appendOutput);

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (viteProcess.exitCode !== null) {
      throw new Error(`Vite exited before it was ready (exit ${viteProcess.exitCode}).\n${output}`);
    }

    try {
      const response = await fetch(VITE_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for Vite at ${VITE_URL}.\n${output}`);
}

function stopViteServer() {
  if (!viteProcess || viteProcess.exitCode !== null) {
    return;
  }

  viteProcess.kill("SIGTERM");
  viteProcess = undefined;
}

module.exports = { startViteServer, stopViteServer, VITE_URL };
