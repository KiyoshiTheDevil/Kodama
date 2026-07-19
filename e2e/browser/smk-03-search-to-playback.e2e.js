const assert = require("node:assert/strict");

const { fixtures } = require("../fixtures/data.cjs");
const { requests, route } = require("../fixtures/client.cjs");
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
    await player.waitUntil(
      async () => (await player.getAttribute("data-track-id")) === "track-normal"
    );
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

  it("keeps the active song playing when starting its radio", async () => {
    await route("GET", "/radio/_", {
      body: { tracks: [fixtures.tracks.normalTrack, fixtures.tracks.explicitTrack] },
    });

    const track = await $("[data-track-id='track-normal']");
    await track.waitForDisplayed();
    await track.click();
    await browser.waitUntil(async () => {
      const commands = await media.commands();
      return commands.filter((command) => command.command === "audio_play").length === 1;
    });

    await track.click({ button: "right" });
    const startRadio = await $("*=Start radio");
    await startRadio.waitForDisplayed();
    await startRadio.click();
    await browser.waitUntil(async () => {
      const log = await requests();
      return log.some(
        (request) => request.pathname === "/radio/_" && request.query.videoId === "track-normal"
      );
    });

    const commands = await media.commands();
    assert.equal(
      commands.filter((command) => command.command === "audio_play").length,
      1,
      "starting radio for the active song must not issue another audio_play command"
    );
    await assertNoFrontendErrors();
  });
});
