const assert = require("node:assert/strict");

const { requests } = require("../fixtures/client.cjs");
const { assertNoFrontendErrors, startWithProfile } = require("./smoke-support.cjs");

describe("SMK-02 startup with profile", () => {
  beforeEach(() => startWithProfile("local"));

  it("reaches Home, renders fixture recommendations, and has no frontend error", async () => {
    await $("[data-testid='view-home']").waitForDisplayed();
    await $("//*[contains(., 'Fixture Sunrise')]").waitForDisplayed();

    const log = await requests();
    assert.ok(log.some((request) => request.pathname === "/profiles"));
    assert.ok(log.some((request) => request.pathname === "/home"));
    await assertNoFrontendErrors();
  });
});
