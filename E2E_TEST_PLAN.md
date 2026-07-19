# Kodama end-to-end test plan

## Purpose and definition of done

This is the implementation backlog for end-to-end (E2E) coverage of the **currently shipped Kodama desktop app**. A test is complete only when it drives the compiled Tauri application through its visible UI or its public Tauri boundary and verifies the user-visible result plus the relevant request, IPC command, or persisted state.

The suite must be deterministic. It must not require a YouTube/Google login, the public internet, Discord, OBS, a real phone, an installed FFmpeg binary, or a user-owned music library. Those dependencies are represented by a controllable fake Kodama sidecar and Tauri/OS mocks. A small, separate smoke suite may use a real sidecar against a dedicated test account, but it must never be the PR gate.

The active scope is `src/main.jsx`'s normal `App` and the overlay-editor window. The `bigpicture/` implementation is intentionally not mounted in releases, so it has no release E2E requirement until it is enabled.

## Test architecture

Use WebdriverIO with `@wdio/tauri-service` and the `embedded` provider. This is the supported approach on macOS as well as Windows and Linux. Use two projects:

| Project       | What it runs                                              | Purpose                                                                                                        |
| ------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `e2e:browser` | Vite frontend in Chrome                                   | Fast UI/state/error-path coverage with intercepted `invoke()` calls.                                           |
| `e2e:desktop` | Compiled Kodama binary with the embedded WebDriver server | Window lifecycle, Tauri commands, dialogs, shortcuts, IPC events, persistence, tray and other native behavior. |

The WDIO test plugins must be compiled only into an E2E build feature/configuration. Do not grant the WDIO execute permission or ship the embedded WebDriver server in a release artifact.

### Implementation status — 2026-07-19

Completed infrastructure:

- [x] Installed the WebdriverIO runner, Mocha framework, reporter and Tauri service, plus the WDIO frontend bridge.
- [x] Added separate `e2e:browser` and `e2e:desktop` WDIO configurations. Browser mode starts and stops Vite automatically; both projects write WDIO output to `.e2e-artifacts/`.
- [x] Added the E2E-only Rust `e2e` feature. It conditionally registers `tauri-plugin-wdio` and `tauri-plugin-wdio-webdriver`; the matching Tauri capability and global API are enabled only by `tauri.e2e.conf.json`.
- [x] Added `e2e:desktop:build`, which produces the debug, no-bundle E2E binary before the desktop suite runs. Production frontend builds resolve the WDIO bridge to a no-op and default Cargo builds omit both WDIO plugins.
- [x] Isolated desktop worker state: each suite run generates a worker ID and storage namespace, skips legacy-data migration, uses an E2E application identifier, and isolates login WebView state. The shared WDIO `beforeTest` hook clears local/session storage, IndexedDB and Cache Storage, then reloads the app.
- [x] Added a controllable local fake sidecar on `127.0.0.1:9847`. It starts before either runner, records requests (including payloads), supports per-test response/delay/disconnect/SSE overrides, and has stable onboarding/profile/music/library fixture data. E2E CSP and the frontend guard prevent external connections; a CSP violation fails its test.
- [x] Added reusable Tauri test adapters for mocked dialog/opener/updater and app window commands, invoke-call assertions, and incoming events. Desktop tests can additionally inspect and switch the real native windows through the WDIO bridge.
- [x] Added E2E runtime controls: a virtual clock/timer queue, silent media-command recorder, and incoming audio-event injection. Added stable selectors for onboarding, primary navigation, and the initial Home/Search/Library flows. Failed tests now save a screenshot, DOM snapshot, browser console attempt, and fake-sidecar request log alongside the WDIO frontend/Rust logs.
- [x] Implemented the first browser smoke test, `SMK-01`: a fresh WebView first launch displays language onboarding before profile login and has no unhandled fixture-sidecar request.
- [x] Verified production frontend build isolation plus default and `--features e2e` Cargo compilation.

Still required before the first smoke test:

### Required fixtures and controls

Implement these before writing the suites below:

- **Fresh app data:** launch every worker with a unique application-data directory and clear the WebView local storage before each test. Never point a test at the developer's `dev.kodama.music` data directory.
- **Fake sidecar on port 9847:** start a local fixture server before the app. It must record every request and allow each test to set responses, delays, disconnects, and SSE/event payloads. It covers `/profiles`, music browsing/search/collection endpoints, downloads, remote control, Last.fm, updates, diagnostics, and OBS endpoints used by the UI.
- **Fixture data:** provide stable local, logged-in, logged-out and multiple-profile responses; a library with normal, explicit, cached, premium-only and unavailable tracks; albums, artists, playlists, lyrics, news, releases, downloads, devices, and errors.
- **Tauri/OS adapters:** provide an E2E-only way to mock and assert `invoke` commands, file save/open dialogs, opener URLs, updater results, native window state, and incoming Tauri events. The desktop project must also exercise a thin set of real commands.
- **Time and media controls:** fake timers or expose a test clock for sleep timers, playback progress, scrobble thresholds, polling, debouncing, toasts and progress dismissal. Audio must use a test fixture URL or mocked audio IPC; it must not use speakers or a network stream.
- **Network policy:** fail a test if a request leaves the fixture server. Test the offline and timeout paths explicitly.
- **Selector policy:** add `data-testid` to every interactive surface named below when a stable role/name selector is not available. Do not use translated text or styling classes as the primary selector. Keep existing `aria-label`, `data-track-id`, `data-card-id`, `data-layer-id` and accessible roles as first choices.
- **Artifacts:** save screenshot, DOM snapshot, frontend console logs, Rust logs and fake-sidecar request log for every failure. Run desktop tests serially (`maxInstances: 1`) until profile/data and window isolation support parallel workers.

### Common assertions

Every state-changing test should assert all that apply:

1. The UI reflects the successful state (or a visible, actionable failure state).
2. Exactly the expected sidecar request or Tauri command was issued with correct arguments.
3. The change survives an app reload where it is intended to persist.
4. It is scoped to the active profile where the product promises profile isolation.
5. Keyboard focus remains in a usable location and Escape/backdrop/close behavior is correct for overlays and modals.

## Critical PR-gate smoke tests

These tests run on every pull request on macOS, Windows and Linux once the platform runners are available. They are intentionally short and cover the app's highest-risk seams.

- [x] **SMK-01 — first launch:** fresh storage shows language/profile onboarding and does not issue unmocked requests.
- [x] **SMK-02 — startup with profile:** a local fixture profile reaches Home, renders fixture recommendations, and has no uncaught frontend/Rust error.
- [x] **SMK-03 — search to playback:** search for a fixture track, open/play it, assert the player displays its metadata and the expected audio IPC request.
- [x] **SMK-04 — navigation:** Home, Library, Liked, History, Downloads and a fixture playlist can each be opened and the active navigation state follows.
- [x] **SMK-05 — profile isolation:** switch between two profiles; the view resets and per-profile pins/history/settings do not leak.
- [x] **SMK-06 — settings persistence:** change language/theme and close/relaunch; the setting and translated UI persist.

## Full implementation backlog

### 1. Startup, onboarding, profiles and authentication

- [ ] **AUTH-01** Fresh install opens the language picker; selecting every supported language updates the immediate UI and persists after relaunch.
- [ ] **AUTH-02** Completing or dismissing the language picker takes the user to the correct next onboarding state and cannot trap keyboard focus.
- [ ] **AUTH-03** Empty `/profiles` response opens the login/account-add flow; cached profile data is not mistaken for a valid login.
- [ ] **AUTH-04** Offline startup restores the cached profile list when available and renders an offline/degraded state; invalid cached JSON is safely ignored.
- [ ] **AUTH-05** Local profile starts without attempting a session-keeper WebView or Google authentication.
- [ ] **AUTH-06** Adding an account calls `/auth/begin-add`, opens the `login` native window with the requested profile name, and exposes cancel/close behavior.
- [ ] **AUTH-07** `login-complete` refreshes profiles, selects the logged-in account and closes login UI; `login-cancelled` returns to a usable state.
- [ ] **AUTH-08** A logged-out/expired active account shows one re-authentication prompt per expiry, opens the re-auth login flow, and stops prompting after a valid refresh.
- [ ] **AUTH-09** Quick profile switcher lists accounts, switches account, clears current track/queue/collection/search/overlays and returns to Home.
- [ ] **AUTH-10** Account settings can switch, add, re-authenticate, rename and change avatar; each correct `/profiles/*` request is sent and the sidebar/account card updates.
- [ ] **AUTH-11** Removing an inactive profile leaves the active profile and playback untouched; removing the active profile selects the expected replacement and resets app state.
- [ ] **AUTH-12** Removing the final profile returns to the login state without stale playlist/history/account UI.
- [ ] **AUTH-13** Logging out clears playback and active authenticated state and handles sidecar failure without leaving conflicting UI.
- [ ] **AUTH-14** The session keeper's ensure/rotate/stop IPC lifecycle follows active-profile changes and app teardown; an absent auth data directory fails safely.

### 2. Shell, navigation, responsive behavior and accessibility

- [ ] **SHELL-01** Main window starts at configured dimensions, has the borderless title bar and exposes working minimize, maximize/restore and close buttons.
- [ ] **SHELL-02** Navigation opens Home, Search, Library, Liked Songs, History and Downloads; only the selected destination is visually active.
- [ ] **SHELL-03** Search shortcut focuses the search field and Escape/clear returns predictable focus and result state.
- [ ] **SHELL-04** Back/forward navigation restores the prior Home/search/collection/artist context without stale selection or failed request replay.
- [ ] **SHELL-05** Sidebar collapses/expands and small-window layout remains operable at the configured minimum window size.
- [ ] **SHELL-06** All primary navigation, account menu, player controls, menus and dialogs are operable by keyboard; focus order, visible focus and Escape behavior are verified.
- [ ] **SHELL-07** Every modal traps focus, restores focus to its trigger on close and has an accessible name; no important interactive control is unnamed.
- [ ] **SHELL-08** High contrast, light, OLED and dark theme variants meet intended DOM attributes/classes and leave controls readable.
- [ ] **SHELL-09** UI zoom and app font scale survive relaunch and do not make title bar, navigation, dialogs or player controls unreachable.
- [ ] **SHELL-10** Frontend error capture records a forced recoverable exception and the bug-report entry point remains available.

### 3. Music discovery, search, library and collections

- [ ] **MUSIC-01** Home loads all fixture sections, skeleton/loading state and empty/error/retry state; no section crashes when optional fields are absent.
- [ ] **MUSIC-02** Home mood tabs/chips load their respective results, reset correctly when the tab changes and handle a missing/empty mood response.
- [ ] **MUSIC-03** Search debounces requests, encodes query input, displays tracks/albums/artists/playlists, clears stale results when the query changes and handles no results/errors.
- [ ] **MUSIC-04** Open a search track, album, artist and playlist; each resolves the correct detail/collection view and preserves the requested entity after refresh.
- [ ] **MUSIC-05** Library sections load independently, switching tabs does not duplicate requests, and empty/failed sections are isolated from the rest of Library.
- [ ] **MUSIC-06** Liked Songs loads, supports play/shuffle/remove behavior and has correct empty/error states.
- [ ] **MUSIC-07** History is created by playing fixture tracks, is scoped per profile, supports removing individual entries and clearing all entries, and persists after relaunch.
- [ ] **MUSIC-08** Collection view renders playlist/album metadata and tracks; track row selection, scrolling/virtualization, explicit badges and optional track numbers work with a long fixture list.
- [ ] **MUSIC-09** Artist view renders description, top tracks, releases and related entities; links from each branch navigate to the intended view.
- [ ] **MUSIC-10** Pin/unpin playlists; pinned and recent playlists update immediately, persist per profile and gracefully handle deleted/missing playlist IDs.
- [ ] **MUSIC-11** Create a playlist with title/description, validate required/trimmed title behavior, and show the new playlist in navigation and collection view.
- [ ] **MUSIC-12** Rename and delete playlist confirmations have cancel/confirm branches; deleting the currently-open playlist returns to Library and removes pins/recents.
- [ ] **MUSIC-13** Add one and multiple tracks to a playlist, filter the target playlists, create a new target from the modal, and show partial/error feedback.
- [ ] **MUSIC-14** Row/card context actions—play next, queue, open artist/album, share, add to playlist, like/unlike and download—call the right action with the right fixture track.
- [ ] **MUSIC-15** Selection action bar appears for multi-select, operates on selected tracks only, clears selection after success/cancel, and remains usable with virtualized rows.
- [ ] **MUSIC-16** Hide-explicit setting filters explicit content consistently on Home, Search, Library and collection views; toggling it restores content without refetching unrelated profile state.

### 4. Player, queue, audio and media integration

- [ ] **PLY-01** Selecting a track populates artwork, title, artist, album, duration and window title; missing artwork/metadata has a safe fallback.
- [ ] **PLY-02** Play, pause, resume and stop issue the expected `audio_*` command and update icon, progress and playback state from emitted Tauri events.
- [ ] **PLY-03** Seek by click/keyboard, seek back/forward and progress updates clamp to valid duration and remain synchronized after `audio-loaded`, `audio-progress`, `audio-ended` and `audio-error` events.
- [ ] **PLY-04** Volume slider, mute/unmute and volume hotkeys update the audio command and persist their expected state.
- [ ] **PLY-05** Previous/next, autoplay/radio and end-of-queue behavior select the correct track; unavailable/premium-only tracks show the correct feedback and do not loop indefinitely.
- [ ] **PLY-06** Queue opens/closes, adds/removes/reorders tracks, plays a selected queued track, clears correctly on profile switch, and handles an empty queue.
- [ ] **PLY-07** Shuffle/repeat/playback-mode controls and their persisted settings produce the correct sequence for deterministic fixture queues.
- [ ] **PLY-08** Crossfade applies configured duration, honors per-track overrides, opens/edits/removes an override in the fade editor and falls back safely on failed native audio command.
- [ ] **PLY-09** Sleep timer presets/custom timer count down with the test clock, cancel/reset correctly and stop playback exactly once at expiry.
- [ ] **PLY-10** Cover/full-player view opens, closes and keeps player interactions available at different window sizes.
- [ ] **PLY-11** Audio visualizer/ambient background/instrumental visualization respond to fixture audio-level events, honor toggles/configuration and tolerate no audio events.
- [ ] **PLY-12** OS media-control event payloads invoke the matching player action; `media_update` receives current metadata when enabled and `media_clear` when playback clears.
- [ ] **PLY-13** Discord enabled sends update/clear IPC calls at correct boundaries; disabled sends no updates and native failures do not affect playback.
- [ ] **PLY-14** Last.fm connected state sends now-playing once per track and scrobbles only after the duration threshold; disconnected/error states send nothing and liking has the correct request behavior.

### 5. Lyrics, translations, composer and Unison

- [ ] **LYR-01** Open/close lyrics from the player and shortcut, with correct empty/loading/error states and track-change reset.
- [ ] **LYR-02** Provider fallback order works: malformed/unavailable provider data advances to the next provider, all failures show a recoverable state, and provider choices persist.
- [ ] **LYR-03** Timed lyrics follow fixture progress; active line, seek synchronization, auto-scroll and manual-scroll pause/resume work.
- [ ] **LYR-04** Translation, translation language, romaji, agent tags, syllable zoom and fluid lyrics toggles affect the correct rendering and persist after relaunch.
- [ ] **LYR-05** Font-size controls for original, translation and romaji clamp to valid values and retain readable layout at extremes.
- [ ] **LYR-06** Lyrics browser lists/filters results, selects a variant, reports bad data, closes cleanly and handles no providers/no matches/network failure.
- [ ] **LYR-07** Lyrics cache uses the current video ID, is invalidated/refreshed when requested and never displays one track's lyrics for another.
- [ ] **LYR-08** Open composer creates/focuses one composer native window, seeds current video/overrides, receives close/update events and does not duplicate on repeated triggers.
- [ ] **LYR-09** Unison identity creation/edit/regeneration/removal validates fields, persists identity and handles endpoint failures without exposing stale private data.

### 6. Downloads, local cache, exporting and storage

- [ ] **DL-01** A single track download creates the expected sidecar request, shows queued/progress/done states and marks it cached only after a done result.
- [ ] **DL-02** Batch download enforces the five-concurrent-download limit, drains queued items as slots finish, renders aggregate progress, and clears its completion card after its intended delay.
- [ ] **DL-03** Cancel batch removes waiting items and UI state but documents/retains the expected handling of in-flight server work; no cancelled item is started later.
- [ ] **DL-04** Download error and premium-only error show distinct UI, remove active progress, and permit/reject retry according to product behavior.
- [ ] **DL-05** Downloads view filters songs/albums/artists, handles empty state, opens/plays cached tracks and removes a single cached item.
- [ ] **DL-06** Remove-all downloads sends only cached fixture IDs and updates storage/downloads UI after success; failure leaves local state intact.
- [ ] **DL-07** Export OPUS and MP3 use the native save dialog, preserve the selected directory, send exact metadata/output path, poll completion and report success/error/cancel.
- [ ] **DL-08** MP3 export without FFmpeg shows a useful error and does not open/save/export; FFmpeg download/update/dismiss/relaunch paths render correct progress and persistence.
- [ ] **DL-09** Storage settings select/clear download folder, set cache limits, calculate/display fixture usage and handle unavailable filesystem/dialog APIs.
- [ ] **DL-10** Global downloaded/cache state intentionally survives profile switching while profile-scoped music state does not.

### 7. Settings and preferences

- [ ] **SET-01** Settings opens from account menu, every sidebar tab/section is reachable, close returns focus to the trigger and settings state survives reopen.
- [ ] **SET-02** Account overview/statistics are rendered from fixtures and clear-history/statistics actions confirm and update only the active profile's data.
- [ ] **SET-03** Theme, accent preset/custom color, dynamic accent saturation/lightness, app icon and other appearance controls update CSS/native app-icon IPC and persist.
- [ ] **SET-04** App icon selection validates a known bundled asset; native icon errors do not incorrectly persist a changed selection.
- [ ] **SET-05** Accessibility toggles (high contrast, animations, font, font scale, zoom, track numbers, hide explicit, hide user handle) work independently and persist.
- [ ] **SET-06** Playback settings (autoplay, crossfade, progressive/classic mode and overrides) update player behavior and persist.
- [ ] **SET-07** Visualizer controls apply defaults/reset and each configuration control changes preview without requiring audio hardware.
- [ ] **SET-08** Connections: Last.fm connect/disconnect/status, remote control enable/disable and external-link/open URL actions use appropriate request/opener paths and failures are visible.
- [ ] **SET-09** Remote pairing shows the generated QR/addresses/token, opens automatically for a pending device, approve/deny/remove/remember actions are correct, and remembered devices persist across relaunch.
- [ ] **SET-10** Overlay settings toggle enabled/port, validate ports, publish the current overlay document to the fixture OBS server and handle connection refusal.
- [ ] **SET-11** Shortcut editor captures an allowed key combination, rejects duplicate/invalid binding, resets defaults and verifies each configurable shortcut triggers the matching action.
- [ ] **SET-12** Security PIN creates, verifies, rejects invalid confirmation, locks/unlocks protected sections, changes/removes PIN and never persists plaintext PIN data.
- [ ] **SET-13** Experimental settings are isolated behind their controls and unsupported features remain disabled/clearly labelled.
- [ ] **SET-14** Language selector translates all navigation/settings labels for German, English, Toki Pona and every listed language; missing translation keys use the deliberate fallback rather than raw key text.
- [ ] **SET-15** Update check renders no-update, update-available, download-progress, cancel, downloaded and install/relaunch branches; updater endpoints/errors are fixture-driven.
- [ ] **SET-16** About section displays app/version/runtime information, opens social/project links via mocked opener and exposes the debug unlock sequence.
- [ ] **SET-17** Debug tab remains hidden until five version taps within the intended window; its logs/info controls, clear/reset actions and floating panel persist/restore safely.

### 8. Overlay editor and OBS document

- [ ] **OVL-01** Opening from Settings/menu creates the overlay-editor window with `overlayEditor=1`, applies the window-border command and reuses/focuses it if already open.
- [ ] **OVL-02** Editor loads current v2 document, migrates v1 config, and falls back to a valid default when storage is absent/corrupted.
- [ ] **OVL-03** Add/select/reorder/rename/duplicate/delete every supported layer type (text, shape, album art, progress and image); selection/locked/visible states work.
- [ ] **OVL-04** Change text, shape, fill, stroke, effect, image, typography, alignment, size, position, opacity and transform controls; preview and serialized document match.
- [ ] **OVL-05** Undo/redo has correct history boundaries, keyboard shortcuts and no-op behavior after save/load.
- [ ] **OVL-06** Zoom in/out/fit/pan/selection marquee and keyboard nudging operate without losing layer selection at extreme canvas sizes.
- [ ] **OVL-07** Save, rename, switch, duplicate, export and delete overlay profiles; confirm destructive delete and preserve the active/default document correctly.
- [ ] **OVL-08** Import validates schema and reports invalid/corrupt file; export uses native file dialog with expected JSON and does not mutate the active document.
- [ ] **OVL-09** Changes persist to local storage and POST to the OBS fixture; delayed/failed publish never loses the local edit and shows connection status.
- [ ] **OVL-10** Main app overlay setting and editor agree on port/enabled/document; closing editor leaves no duplicate WebView or leaked listener.

### 9. News, diagnostics and external actions

- [ ] **MISC-01** News fetch renders unread/read state, marks items seen, refreshes, safely renders supported body content and handles malformed/empty/error responses.
- [ ] **MISC-02** Bug report opens with current track/version/diagnostics, validates required title/description, includes optional steps/contact/screenshot as configured, submits correct payload and handles failure/retry.
- [ ] **MISC-03** Windows screenshot command success attaches an image; non-Windows/command failure proceeds without an image and explains the result appropriately.
- [ ] **MISC-04** Share menus construct correct URLs/text for track/album/playlist and use mocked opener/clipboard without opening a real browser.
- [ ] **MISC-05** Anonymous telemetry heartbeat honors opt-in/out, sends at most once per day, creates a stable install ID only when opted in and retries only according to defined policy.
- [ ] **MISC-06** Network status transitions online/offline update UI and retry behavior without losing loaded content or creating request storms.

### 10. Native desktop, platform and resilience tests

- [ ] **NATIVE-01** `set_fullscreen` enters/exits fullscreen, restores prior maximized state and always-on-top state, and remains correct after keyboard/menu toggle.
- [ ] **NATIVE-02** Main window close obeys close-to-tray state; tray Show focuses/unminimizes it and tray Quit exits, stops sidecar and clears native integrations.
- [ ] **NATIVE-03** `quit_app` exits reliably even when the window is hidden; `relaunch_app` preserves only intended persisted state.
- [ ] **NATIVE-04** Single-instance behavior focuses the existing window when a second process is launched and does not start another sidecar/window set.
- [ ] **NATIVE-05** Deep link registration/dispatch navigates a running app to the target song and a cold-start link reaches the same state; malformed/unsupported links are harmless.
- [ ] **NATIVE-06** Login, session-keeper, composer and overlay-editor windows have expected labels, visibility/taskbar behavior, lifecycle and cross-window event handling.
- [ ] **NATIVE-07** Native file/open/save dialogs can be cancelled at every entry point without changing settings/download/export/import state.
- [ ] **NATIVE-08** CSP allows required application/fixture resources and blocks an intentionally disallowed remote origin; no feature requires relaxing CSP for tests.
- [ ] **NATIVE-09** App starts when the sidecar cannot bind/launch and shows a recoverable connection error; clean exit stops a running fixture/server process.
- [ ] **NATIVE-10** Platform-specific paths: Windows border removal/screenshot/media tagging; macOS login cookie retrieval and app icon; Linux headless/Xvfb launch. Each is gated by platform and has a skip rationale where automation is impossible.

## Test data matrix

Every data-driven suite should include at least the following rows, rather than only a happy-path object:

| Fixture                                                     | Required uses                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| No profile / first run                                      | onboarding, login entry, offline empty state               |
| Local profile                                               | normal browsing without auth/session keeper                |
| Authenticated profile                                       | profile switching, real-account-only UI, session lifecycle |
| Expired profile                                             | re-auth prompt and recovery                                |
| Two profiles                                                | profile isolation/pins/history/settings reset              |
| Small/large library                                         | normal rendering and virtualization/selection              |
| Explicit, cached, premium-only, unavailable tracks          | filters, cache/download, playback errors                   |
| Empty, slow, malformed, 401, 429, 500 and offline responses | all relevant loading/error/retry paths                     |
| Non-Latin/long strings                                      | translations, truncation, input and overlay layout         |
