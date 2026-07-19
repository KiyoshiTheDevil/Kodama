const assert = require("node:assert/strict");

const { route } = require("../fixtures/client.cjs");
const { assertNoFrontendErrors, startWithProfile } = require("./smoke-support.cjs");

describe("SMK-09 failure safety", () => {
  beforeEach(async () => {
    await startWithProfile("local");
    await route("GET", "/home", { status: 500, body: { error: "Fixture sidecar failure" } });
  });

  it("shows a recoverable Home error instead of a blank screen", async () => {
    await browser.refresh();
    const home = await $("[data-testid='view-home']");
    await home.waitForDisplayed();
    await browser.waitUntil(async () => (await home.getText()).includes("Fixture sidecar failure"));

    assert.equal(await home.isDisplayed(), true);
    await assertNoFrontendErrors();
  });
});
