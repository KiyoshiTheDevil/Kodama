const path = require("node:path");

const { clearWebviewStorage, createWorkerState } = require("./support/desktop-state.cjs");
const { startFakeSidecar, stopFakeSidecar } = require("./support/fake-sidecar.cjs");
const { assertE2eNetworkPolicy } = require("./support/network-policy.cjs");

const root = path.resolve(__dirname, "..");
const binaryName = process.platform === "win32" ? "kodama.exe" : "kodama";

// The E2E build step will enable the WDIO-only Rust plugins. Set this variable
// when the binary is built elsewhere (for example, by CI).
const appBinaryPath =
  process.env.KODAMA_E2E_APP_BINARY || path.join(root, "src-tauri", "target", "debug", binaryName);
const artifactsDirectory = path.join(root, ".e2e-artifacts", "desktop");
const workerState = createWorkerState(artifactsDirectory);

exports.config = {
  runner: "local",
  specs: ["./desktop/**/*.e2e.js"],
  maxInstances: 1,
  outputDir: artifactsDirectory,
  logLevel: "info",

  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        captureFrontendLogs: true,
        captureBackendLogs: true,
        startTimeout: 60_000,
        commandTimeout: 60_000,
        env: { KODAMA_E2E_WORKER_ID: workerState.workerId },
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application: appBinaryPath },
    },
  ],

  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },
  waitforTimeout: 10_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 2,

  beforeTest: clearWebviewStorage,
  onPrepare: startFakeSidecar,
  onComplete: stopFakeSidecar,
  afterTest: assertE2eNetworkPolicy,
};
