const assert = require("node:assert/strict");

const { media } = require("../support/runtime-controls.cjs");
const { assertNoFrontendErrors, startWithProfile } = require("./smoke-support.cjs");

describe("SMK-03 search to playback", () => {
  beforeEach(() => startWithProfile("local"));

  it("plays the fixture search track and records its audio IPC request", async () => {
    const search = await $("[data-testid='sidebar-search']");
    await search.setValue("Fixture Sunrise");
    await browser.keys("Enter");
    await $("[data-testid='view-search']").waitForDisplayed();

    const track = await $("[data-track-id='track-normal']");
    await track.waitForDisplayed();
    await track.click();

    const player = await $("[data-testid='player']");
    await player.waitUntil(async () => (await player.getAttribute("data-track-id")) === "track-normal");
    assert.ok((await player.getText()).includes("Fixture Sunrise"));

    await browser.waitUntil(async () => {
      const commands = await media.commands();
      return commands.some((command) => command.command === "audio_play");
    });
    const commands = await media.commands();
    const play = commands.find((command) => command.command === "audio_play");
    assert.equal(play.args.url, "http://localhost:9847/audio-stream/track-normal");
    await assertNoFrontendErrors();
  });
});
