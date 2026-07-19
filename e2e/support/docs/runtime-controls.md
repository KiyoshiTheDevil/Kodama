# E2E runtime controls

E2E builds start with a virtual clock at `2026-01-01T12:00:00.000Z`. The WDIO test hook enables virtual page timers after app startup, and they run only when a test advances the clock. Use the controls after the app is ready:

```js
const {clock, media} = require("./runtime-controls.cjs");

await clock.advance(1_000); // runs due timeouts/intervals and advances Date.now()
await media.emit("audio-progress", {position: 42, duration: 200, paused: false});
const commands = await media.commands(); // audio_play, audio_pause, etc.
```

`IpcAudio` records audio commands in E2E mode and never opens an HTML audio fallback or the Rust audio backend. This keeps tests silent and lets them drive playback state with `audio-loaded`, `audio-progress`, `audio-ended`, and `audio-error` events.
