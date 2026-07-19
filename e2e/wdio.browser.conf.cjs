const path = require("node:path");

const { startViteServer, stopViteServer, VITE_URL } = require("./support/vite-server.cjs");
const { startFakeSidecar, stopFakeSidecar } = require("./support/fake-sidecar.cjs");
const { assertE2eNetworkPolicy } = require("./support/network-policy.cjs");

const root = path.resolve(__dirname, "..");

exports.config = {
  runner: "local",
  specs: ["./browser/**/*.e2e.js"],
  maxInstances: 1,
  outputDir: path.join(root, ".e2e-artifacts", "browser"),
  logLevel: "info",

  services: [
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

  async onPrepare() {
    await startFakeSidecar();
    await startViteServer();
  },
  async onComplete() {
    stopViteServer();
    await stopFakeSidecar();
  },
  afterTest: assertE2eNetworkPolicy,
};
