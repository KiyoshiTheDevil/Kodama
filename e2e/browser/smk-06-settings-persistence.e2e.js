const assert = require("node:assert/strict");

const { startWithProfile } = require("./smoke-support.cjs");

describe("SMK-06 settings persistence", () => {
  beforeEach(() => startWithProfile("local"));

  it("persists language and theme through a relaunch-style reload", async () => {
    await $("[data-testid='account-menu-trigger']").click();
    await $("[data-testid='menu-settings']").click();
    await $("[data-testid='settings-nav-language']").click();
    await $("[data-testid='settings-language-en']").click();
    await $("[data-testid='settings-nav-darstellung']").click();
    await $("[data-testid='theme-light']").click();

    await browser.waitUntil(async () =>
      browser.execute(() =>
        localStorage.getItem("kiyoshi-lang") === "en" && localStorage.getItem("kiyoshi-theme") === "light"
      )
    );
    await browser.refresh();
    await $("[data-testid='view-home']").waitForDisplayed();

    assert.equal(await $("html").getAttribute("data-theme"), "light");
    assert.equal(await browser.execute(() => localStorage.getItem("kiyoshi-lang")), "en");
    assert.equal(await $("[data-testid='nav-home']").getText(), "Home");
  });
});
