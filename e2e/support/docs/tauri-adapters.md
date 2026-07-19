# Tauri E2E adapters

Create an adapter in each test's `beforeEach`, then clear it in `afterEach`:

```js
const {createTauriAdapters} = require("./tauri-adapters.cjs");

beforeEach(async () => {
    native = createTauriAdapters();
    await native.dialog.open("/tmp/fixture-file.json");
    await native.opener.url();
    await native.updater.none();
});

afterEach(async () => native.clear());
```

Use `await native.calls(native.command.dialog.open)` to assert arguments. `native.events.emit(name, payload)` delivers incoming Tauri events in both browser and desktop projects. `native.windows.list()`, `states()`, and `switch(label)` are intentionally desktop-only: they inspect or operate on the real compiled application's native windows.
