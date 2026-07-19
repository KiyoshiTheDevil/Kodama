const assert = require("node:assert/strict");

const { startWithProfile } = require("./smoke-support.cjs");

describe("SMK-05 profile isolation", () => {
  beforeEach(() => startWithProfile("twoProfiles"));

  it("resets the view and keeps profile-scoped pins and history separate", async () => {
    await browser.execute(() => {
      localStorage.setItem("kiyoshi-history-Fixture Account", JSON.stringify([{ videoId: "track-normal" }]));
      localStorage.setItem(
        "kiyoshi-pinned-Fixture Account",
        JSON.stringify([{ playlistId: "playlist-fixture", title: "Fixture Playlist" }])
      );
    });

    await $("[data-testid='nav-library']").click();
    await $("[data-testid='view-library']").waitForDisplayed();
    await $("[data-testid='account-menu-trigger']").click();
    await $("[data-testid='menu-switch-profile']").click();
    await $("[data-testid='profile-Fixture Second']").click();

    await $("[data-testid='view-home']").waitForDisplayed();
    const isolated = await browser.execute(() => ({
      active: window.__activeProfile,
      pins: localStorage.getItem("kiyoshi-pinned-Fixture Second"),
      history: localStorage.getItem("kiyoshi-history-Fixture Second"),
    }));
    assert.deepEqual(isolated, { active: "Fixture Second", pins: null, history: null });
  });
});
