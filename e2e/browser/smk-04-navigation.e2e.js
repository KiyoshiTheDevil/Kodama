const assert = require("node:assert/strict");

const { startWithProfile } = require("./smoke-support.cjs");

describe("SMK-04 navigation", () => {
  beforeEach(() => startWithProfile("local"));

  it("opens every primary view and follows the active navigation state", async () => {
    const views = [
      ["home", "view-home"],
      ["library", "view-library"],
      ["liked", "view-liked"],
      ["history", "view-history"],
      ["downloads", "view-downloads"],
    ];

    for (const [nav, view] of views) {
      const navItem = await $(`[data-testid='nav-${nav}']`);
      await navItem.click();
      await $(`[data-testid='${view}']`).waitForDisplayed();
      assert.match(await navItem.getAttribute("class"), /bg-accent-dim/);
    }

    await $("[data-testid='nav-library']").click();
    const playlist = await $("[data-card-id='playlist-fixture']");
    await playlist.waitForDisplayed();
    await playlist.click();
    await $("//*[contains(., 'Fixture Playlist')]").waitForDisplayed();
  });
});
