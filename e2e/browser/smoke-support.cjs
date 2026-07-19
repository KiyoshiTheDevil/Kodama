const assert = require("node:assert/strict");

const { clearWebviewStorage } = require("../support/desktop-state.cjs");
const { resetRuntimeControls } = require("../support/runtime-controls.cjs");
const { reset } = require("../fixtures/client.cjs");

async function startWithProfile(preset = "local") {
  await reset(preset);
  await clearWebviewStorage();
  await browser.execute(() => localStorage.setItem("kiyoshi-lang", "en"));
  await browser.refresh();
  await browser.waitUntil(() => browser.execute(() => document.readyState === "complete"));
  await $("[data-testid='view-home']").waitForDisplayed();
  await resetRuntimeControls();
}

async function startFresh(preset = "firstRun") {
  await reset(preset);
  await clearWebviewStorage();
  await resetRuntimeControls();
}

async function assertNoFrontendErrors() {
  const errors = await browser.execute(() => window.__kodamaE2e?.errors?.() || []);
  assert.deepEqual(errors, [], `unexpected frontend errors:\n${errors.join("\n")}`);
}

module.exports = { assertNoFrontendErrors, startFresh, startWithProfile };
