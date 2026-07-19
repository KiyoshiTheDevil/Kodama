const path = require("node:path");
const { SevereServiceError } = require("webdriverio");

const { startViteServer, stopViteServer, VITE_URL } = require("./support/vite-server.cjs");
const { startFakeSidecar, stopFakeSidecar } = require("./support/fake-sidecar.cjs");
const { createAfterTestHook } = require("./support/failure-artifacts.cjs");
const { resetRuntimeControls } = require("./support/runtime-controls.cjs");

const root = path.resolve(__dirname, "..");
const e2eServersService = {
  async onPrepare() {
    try {
      await startFakeSidecar();
      await startViteServer();
    } catch (error) {
      stopViteServer();
      await stopFakeSidecar();
      throw new SevereServiceError(error.message);
    }
  },
  async onComplete() {
    stopViteServer();
    await stopFakeSidecar();
  },
};

exports.config = {
  runner: "local",
  specs: ["./browser/**/*.e2e.js"],
  maxInstances: 1,
  outputDir: path.join(root, ".e2e-artifacts", "browser"),
  logLevel: "info",

  services: [
    [e2eServersService],
    [
      "@wdio/tauri-service",
      {
        mode: "browser",
        devServerUrl: VITE_URL,
        clearMocks: true,
        captureFrontendLogs: true,
      },
    ],
  ],
  capabilities: [{ browserName: "tauri" }],

  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },
  waitforTimeout: 10_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 2,

  beforeTest: resetRuntimeControls,
  afterTest: createAfterTestHook(path.join(root, ".e2e-artifacts", "browser", "failures")),
};
