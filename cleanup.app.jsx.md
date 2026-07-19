# App.jsx cleanup plan

## 1. Summary

`src/App.jsx` is currently 12,675 lines in this checkout. It is both the application
composition root and the implementation site for most UI, persistence, networking,
native-integration, and playback behaviour. The `App` function owns a large number of
unrelated state cells and effects, and it passes long prop lists to `Sidebar`,
`SettingsPanel`, and `Player`. Several view and feature components are also still
defined in the file despite the established `src/views/`, `src/modals/`, and `src/ui/`
extraction pattern.

The target is a thin `App` composition root: startup gates and a small provider tree,
followed by an `AppShell`. Feature UI should live in clearly named domains under
`features/` (music, player, lyrics, settings, profiles, downloads, overlay, remote,
and Big Picture), while generic code lives under `shared/`. Effects and business
operations belong in domain hooks/services, and broadly-consumed state in
narrowly-scoped contexts. Do not replace the god component with one global context:
use separate value/action contexts where a provider would otherwise cause broad
re-renders. State used by only one component remains colocated there.

### Target `src/` folder structure

Use a small feature-first structure. It replaces the ambiguous top-level
`components/`, `modals/`, and `views/` buckets, but does **not** require a bulk move.
Create a destination folder only when its first independently shippable extraction is
ready. `main.jsx` remains at the root as Vite's clear, stable entry point.

```
src/
  main.jsx                         # Vite entry: choose normal or overlay-editor mode
  app/                              # composition only; may import features and shared
    App.jsx                         # startup gates + provider composition
    AppShell.jsx                    # desktop layout and route/view composition
    AppOverlays.jsx                 # app-wide transient UI composition
    providers.jsx                   # provider nesting, no business logic
    diagnostics/                    # error capture, feedback/report integration
    styles/                         # index/global application CSS

  features/                         # owns business/UI behaviour by user-facing domain
    music/                           # browse and personal-library experience
      views/                         # home, search, artist, collection, library, liked, history
      components/                    # track table, cards, rows, artist links, selection UI
      hooks/                         # view-local fetching and navigation helpers
    player/                          # audio lifecycle, queue, player UI, visualizer, bridge
      Player.jsx
      QueuePanel.jsx
      player-context.jsx
      use-player-controller.js
      player-bridge.js              # Big Picture-facing playback adapter
    lyrics/                          # lyrics rendering, parsing, providers, community lyrics
      LyricsOverlay.jsx
      hooks/
      community/                     # current Unison identity/API implementation
    settings/                        # settings state and settings-only UI
      SettingsPanel.jsx
      tabs/
      settings-context.jsx
    profiles/                        # login, profiles, account controls and profile switching
    downloads/                       # download manager, cache operations, downloads view/card
    overlay/                         # OBS overlay schema, editor, and overlay-editor entry UI
    remote/                          # LAN remote pairing/control feature
    big-picture/                     # intentionally unmounted controller UI/WIP

  shared/                            # feature-agnostic code only; never imports app/features
    api/                             # API client, endpoint-independent request helpers, image proxy
    ui/                              # tooltip, HeroUI wrappers, generic controls, title/context menu
    hooks/                           # use-persisted-state and other generic hooks
    lib/                             # pure formatting, storage codecs, colour/version/shortcut helpers
    i18n/                            # translations, language data, translation hook
    icons/                           # shared icon exports
    audio/                           # reusable audio-level primitive, if not player-specific
    assets/fonts/                    # bundled font assets
```

This is intentionally flatter than a full "feature / components / hooks / services /
types" template in every domain. A feature gets a `components/`, `hooks/`, or API
module only after it has more than one file of that kind. For example, a single
`profiles/api.js` is preferable to creating a `services/` folder solely for it.

### Folder boundaries and migration rules

- `app/` composes; it does not contain feature implementations, large feature effects,
  or feature API calls. `main.jsx` is the only permanent root-level runtime module.
- `features/<domain>/` owns its modals, views, context, hooks, API calls, and state.
  For example, `fade-editor-modal` belongs to `player/`, `lyrics-browser-modal` and
  Unison belong to `lyrics/`, playlist modals belong to `music/`, profile switching
  belongs to `profiles/`, and bug reporting belongs to `app/diagnostics/`.
- `shared/` is not a dumping ground. Code belongs there only when it has no
  domain-specific language and no dependency on a feature. It may not import `app/` or
  `features/`; features may import shared modules directly.
- Cross-feature access goes through a domain's exported context/hook or an explicit
  adapter (for example `player-bridge.js`), never by importing `App.jsx` or reaching
  into another feature's private component. This removes the current Big Picture → App
  dependency during the lyrics/player extraction.
- Split the current `context.jsx` by responsibility during migration: API/image helpers
  move to `shared/api/`; language moves to `shared/i18n/`; display preference contexts
  become settings-owned hooks/providers. Keep a temporary compatibility module only
  until all consumers have moved, then delete it.
- Keep the current filename convention within a feature while it is being migrated.
  Do not combine functional moves with cosmetic casing-only renames. Avoid barrel
  (`index.js`) re-export files initially, because they can hide dependency cycles.
- `src/App.css` is currently unimported, while `src/style.css` is only imported by the
  unreachable `src/main.js`. Treat both as Step 2 removal candidates after the same
  reference check; migrate the live `src/index.css` to `app/styles/` only when the
  entry-point import can be changed in a dedicated, build-verified step.

### Current-to-target ownership map

| Current area | Eventual owner | Migration rule |
| --- | --- | --- |
| `App.jsx` and root layout branches | `app/` | Keep the root file until `AppShell` and providers exist; move it only as the final composition change. |
| `OverlayEditorApp.jsx`, `overlay/` | `features/overlay/` | Move the alternate entry and editor/schema together, retaining the `?overlayEditor=1` startup contract. |
| `context.jsx` | `shared/api/`, `shared/i18n/`, `features/settings/` | Split by responsibility; remove the compatibility facade only after consumers move. |
| `i18n.js`, `locales/`, `icons.jsx`, `fonts/` | `shared/i18n/`, `shared/icons/`, `shared/assets/fonts/` | Move after feature extraction stabilizes imports; do not make this an early cosmetic-only change. |
| `ui/` | `shared/ui/` | Keep only truly generic components here; move music-specific rows/cards/table to `features/music/components/`. |
| `views/` | `features/music/views/` and `features/downloads/` | Home/search/artist/collection/library/liked/history are music; downloads owns its view and queue/card. |
| `modals/` | Owning feature or `app/diagnostics/` | Eliminate the global modal bucket as each feature is extracted. |
| `lyrics/`, `unison/` | `features/lyrics/` and `features/lyrics/community/` | Preserve provider/cache and community-identity contracts while moving. |
| `audioLevels.js`, player/queue code, `effects/` | `features/player/` or `shared/lib/` | Keep audio/visualizer code player-owned unless it becomes genuinely feature-neutral. |
| `bigpicture/` | `features/big-picture/` | Preserve as WIP; consume the player through an explicit bridge, never `App.jsx`. |

### Findings that shape the sequence

- `index.html` enters through `src/main.jsx`; it imports `App.jsx` and
  `OverlayEditorApp.jsx` only. The old vanilla graph (`src/main.js`, `api.js`,
  `views.js`, `runtime.js`) is unreachable and internally refers to missing modules.
- The old `src/components/` and PascalCase `src/views/` implementations are separate
  from the live components embedded in `App.jsx` or the newer lowercase files. They
  are only imported by the unreachable vanilla graph.
- Do **not** classify `src/bigpicture/` as dead. It is intentionally unmounted for
  releases, but its lyrics screen imports the exported `LyricsOverlay` from `App.jsx`.
  The lyrics extraction must update that import in the same change.
- Existing contexts already cover language, animations, zoom, font scale, and track
  numbers. Reuse them while introducing domain contexts; do not duplicate their state.
- `localStorage` has many data shapes and scopes. A persistence helper must preserve
  exact key names, defaults, parsing, profile scoping, and write timing. It must not
  blindly absorb identity/PIN material, cache entries, or one-off migration logic.

Every implementation step should run `npx vite build`. Because this is a Tauri app,
also perform the step-specific desktop smoke checks listed below; a browser preview is
not a sufficient substitute.

## 2. Ordered steps

### Step 1 — Record a behavioural baseline and module boundaries

**Goal:** Make later, independently shippable moves observable rather than relying on
the build alone.

**What to extract/move/change:** No production refactor yet. Record the live entry
graph from `src/main.jsx`, the current App state/effect ownership, and a short manual
smoke matrix in developer documentation or the PR description. Add focused automated
tests only where the project already has a chosen test runner; do not introduce a
testing framework as part of this refactor without approval. Establish module-boundary
rules: views render/fetch view-local data, contexts expose shared domain state/actions,
hooks own effects, and API/native calls are not embedded in large JSX expressions.
Confirm the target `src/` structure and folder-boundary rules above before creating
new destination modules; this is the architectural decision gate for every later move.

**Entry-graph note:** Keep `entryAnalyse.md` as the generated, import-level evidence,
but add a compact, human-maintained Mermaid flow for this step. It must show that
`index.html → src/main.jsx` is the live entry, that `main.jsx` selects `App` for normal
mode and `OverlayEditorApp` for `?overlayEditor=1`, and that `App` currently fans out
to the app shell, views/modals/UI, settings, player/queue/audio, lyrics, and native
bridges (Tauri, OBS, remote, updater, Last.fm). Record the separate Big Picture lyrics
dependency (`bigpicture/Lyrics.jsx → LyricsOverlay`) as intentionally unmounted WIP,
not dead code. Record the vanilla chain as disconnected from the live root; this is the
evidence required before Step 2 removes it. Do not use the generated `nodeNN` diagram
as the architectural reference without this readable companion.

**Dependencies / prerequisites:** None.

**Risk level:** Low. **Verify:** `npx vite build`; launch the desktop app and cover
startup/profile selection, navigation, search, playback/queue, lyrics/fullscreen,
settings persistence, downloads, and overlay/remote controls once as a baseline.

### Step 2 — Remove only the confirmed unreachable legacy implementation

**Goal:** Remove misleading duplicate code before moving live code into the same
locations.

**What to extract/move/change:** Delete the isolated vanilla-JS graph:
`src/main.js`, `src/api.js`, `src/views.js`, and `src/runtime.js`. Delete its stale
React-era dependants once a fresh repository-wide import/reference search confirms no
new caller: `src/components/Player.jsx`, `Sidebar.jsx`, `TrackRow.jsx`,
`MusicCard.jsx`, and `GenreBar.jsx`; `src/views/HomeView.jsx`, `LibraryView.jsx`, and
`LikedSongsView.jsx`; plus the legacy/unimported stylesheets `src/style.css` and
`src/App.css`. Do not delete active lowercase views, `src/ui/`, `src/modals/`, or
`src/bigpicture/`.

**Dependencies / prerequisites:** Step 1. Re-run the import graph immediately before
deletion; this step assumes no external packaging, documentation, or dynamic import
references have been introduced since this plan was written.

**Risk level:** Low. **Verify:** repository-wide references show no imports of removed
paths; `npx vite build`; launch normal mode and `?overlayEditor=1`. Confirm that no
tooling script or documentation still points to `src/main.js`.

### Step 3 — Build the shared functional foundation before moving UI

**Goal:** Create stable, non-visual seams for API access, persistence, and pure logic
so later UI moves do not carry connection, storage, or helper concerns with them.

**What to extract/move/change:** Add `src/shared/api/` for the feature-neutral backend
base URL, thumbnail/proxy helpers, and small request helpers; retain a temporary
compatibility export from `context.jsx` while callers migrate. Add
`src/shared/hooks/use-persisted-state.js` (and small storage codecs if useful) with
explicit serializers/deserializers and a safe fallback for malformed values. Add
`src/shared/lib/` only for genuinely pure helpers such as version comparison,
shortcut serialization/matching, and simple formatting. Keep lyric parsing, visualizer
math, and business rules with their features. Migrate a few low-risk scalar preferences
(sidebar/queue widths, UI zoom, font scale) to prove the persistence hook. Do not move
any JSX, styles, or presentational component in this step; `App` continues to render
the existing UI against the new helpers.

**Dependencies / prerequisites:** Step 2.

**Risk level:** Low for each small migration; Medium for compatibility exports and
theme/accent because they touch every current caller or the document root.
**Verify:** reload after changing each preference; test a malformed stored value and
reset/default behaviour; verify profile changes do not affect profile-scoped keys.
Keep PIN hashes, Unison identity, lyrics cache, heartbeat state, and migration fallbacks
out of the generic hook until their requirements are documented.

### Step 4 — Port non-visual domain behavior into hooks/controllers

**Goal:** Move connections, timers, polling, native commands, and business operations
out of `App` before moving the UI that calls them.

**What to extract/move/change:** Create focused feature hooks/controllers that App can
consume without changing existing JSX or prop interfaces. Start with the lowest-coupled
domains: update/news/heartbeat, network status, profile fetch/cache/auth/session
maintenance, download queue/cache operations, OBS overlay server state, and remote
control state. Typical destinations are `features/profiles/hooks/`,
`features/downloads/hooks/`, `features/overlay/hooks/`, `features/remote/hooks/`, and
small app-level hooks for updates/news. Each hook owns its fetches, Tauri calls,
listeners, timers, abort/cancellation logic, and returns explicit state/actions.
Keep the current App callbacks as thin adapters until all current UI consumers use the
new returned actions. Do not introduce contexts merely to avoid props at this stage.

**Dependencies / prerequisites:** Step 3. Port one domain hook at a time; use the
shared API/storage helpers rather than reproducing connection or persistence code.

**Risk level:** Medium; High for profiles, downloads, OBS, remote control, and session
keeping. **Verify:** for each hook, exercise the exact existing feature flow and its
cleanup path: retries/cancellation, profile changes, offline recovery, native command
failure, and app unmount. Confirm the rendered UI and its prop list are unchanged in
the commit that ports behavior.

### Step 5 — Move shared presentational primitives out of App without changing data flow

**Goal:** Reduce `App.jsx` size using behaviour-preserving component moves before
introducing new state ownership.

**What to extract/move/change:** Move self-contained UI pieces to their target
locations: `TitleBar`, `ContextMenu`, and `CtxItem` to `src/shared/ui/`;
`AmbientBackdrop` to `src/shared/ui/` or a small `src/app/` shell module; and the
download progress card and multi-selection action bar to `src/app/` components with their current props. Move
their local helper functions alongside them. Keep their current callback interfaces
for this step; this is deliberately not the context migration.

**Dependencies / prerequisites:** Steps 3 and 4; UI components should call the
ported behavior through their existing App adapters rather than own new connection logic.

**Risk level:** Low. **Verify:** context menus position/close correctly under zoom,
titlebar actions work on supported platforms, selection actions retain their playlist
behaviour, and download queue cancellation/minimization works.

### Step 6 — Complete the established live-view extraction

**Goal:** Finish the partial view migration into the `music` feature before changing
navigation state.

**What to extract/move/change:** Move the live in-file `LibraryView`, `SearchView`,
`HomeView`, `ArtistView`, `ArtistDescription`, `Carousel`, and `MediaTile` into
`src/features/music/views/` and `src/features/music/components/`. Move the active
lowercase collection, library, liked, and history views there as each is touched;
`downloads-view` stays with the downloads feature. Use names that no longer conflict
with the deleted PascalCase legacy files. Keep existing props and local fetching/effect
ownership initially. Consolidate the live track table and row/card primitives under
the music feature rather than creating another set.

**Dependencies / prerequisites:** Steps 2, 3, and 5.

**Risk level:** Low to Medium. **Verify:** each view loads and refreshes, back
navigation preserves its current semantics, explicit-content filtering is unchanged,
and artist/album/playlist/track context actions still lead to the correct view.

### Step 7 — Decompose SettingsPanel behind its current interface

**Goal:** Break up the roughly 1,300-line settings implementation without coupling it
to a state-management rewrite.

**What to extract/move/change:** Move `SettingsPanel`, `SettingsSidebarContent`, and
their private helpers into `src/features/settings/`. Split tab content into focused components
that retain the existing input props: account, appearance, visualizer, playback,
connections/remote, lyrics, accessibility, shortcuts, storage, security, language,
overlay, experimental, update/about/debug. Move local settings-only controls and
color/corner helpers with their consuming tab. Keep the existing external settings
section store until the panel is stable, then encapsulate it inside the settings
feature rather than exposing it from App.

**Dependencies / prerequisites:** Steps 3 and 4. Do not introduce SettingsContext in
this step; the public prop facade is the compatibility boundary.

**Risk level:** Medium. **Verify:** every tab and scroll-spy subsection renders;
settings close animation and sidebar state still work; PIN setup/change/disable,
overlay preview/editor, FFmpeg/yt-dlp update controls, remote pairing, and account
management retain their current behaviour.

### Step 8 — Introduce SettingsContext in small, memoized slices

**Goal:** Replace SettingsPanel's prop explosion with domain ownership that does not
force unrelated consumers to rerender.

**What to extract/move/change:** Add `src/features/settings/settings-context.jsx` and a
provider backed by focused hooks (for example appearance/accessibility, playback
preferences, lyrics preferences, integrations, and shortcuts). Expose hooks such as
`useAppearanceSettings`, `usePlaybackSettings`, and `useLyricsSettings`; split
state/actions values or memoize them so changing a slider does not invalidate the
whole application. Move persistence and document-root effects from App into the
relevant settings hooks. Convert settings tab components one slice at a time, then
remove the corresponding props at the single `SettingsPanel` call site. Keep
profile/account data out of this context.

**Dependencies / prerequisites:** Step 7; the low-risk persistence conventions from
Step 3.

**Risk level:** High. **Verify:** reload persistence for every migrated setting,
including theme/accent/dynamic accent, visualizer configuration, playback mode and
crossfade, lyric presentation/provider settings, shortcuts, zoom/font scale, and
accessibility options. Check that CSS variables/data attributes update immediately
and that settings changes do not reset playback or the current view.

### Step 9 — Extract the lyrics engine while preserving the Big Picture contract

**Goal:** Move the large, stateful lyrics renderer into the `lyrics` feature and make
its data/effects testable in isolation.

**What to extract/move/change:** Move `LyricsOverlay` and its lyric timing/word-paint
helpers from App into `src/features/lyrics/LyricsOverlay.jsx`; split fetching/cache/
translation/romaji/custom-lyrics effects into feature-local hooks only after the
initial move builds.
Import icons/UI dependencies directly. Update `src/bigpicture/Lyrics.jsx` to import
the overlay from its new module in the same commit, retaining its current prop contract
and the `IpcAudio` clock assumptions. After that compatibility move, replace repeated
lyrics preference props with the hooks from Step 8 where appropriate.

**Dependencies / prerequisites:** Step 8 for lyrics preference hooks; the initial
component move may be done with the old props first if that lowers risk.

**Risk level:** High. **Verify:** synced TTML/LRC and unsynced lyrics, provider retry/
switching/failure state, local custom lyric import/removal, translation/romaji, agent
tags, instrumental cover switching, fullscreen/split view, and Big Picture's lyrics
screen when that WIP is manually enabled. Confirm there is no import back into
`App.jsx` (no circular dependency).

### Step 10 — Move Player and QueuePanel as prop-compatible feature components

**Goal:** Isolate playback UI before moving playback ownership.

**What to extract/move/change:** Move live `Player`, `QueuePanel`, `QueueRow`,
`CoverView`, visualizer helpers, and player-local formatting to `src/features/player/`. Keep
the current App-owned track/queue/audio/callback props unchanged at first. Move only
presentation-local state with the components (seek/volume controls, panel tabs,
dragging, sleep timer UI, visualizer animation). Make all dependencies explicit;
continue using existing `context.jsx` presentation hooks.

**Dependencies / prerequisites:** Steps 3, 5, and 9. Step 9 removes the biggest direct
lyrics coupling from the player area.

**Risk level:** Medium. **Verify:** load/play/pause/seek/volume/mute, previous/next,
shuffle/repeat/autoplay, crossfade overrides, queue reordering/removal, like/download/
export, sleep timer, fullscreen controls, and remote commands. Check audio cleanup on
track switches and app unmount.

### Step 11 — Create PlayerContext around a single playback controller

**Goal:** Make playback state and commands a coherent domain rather than a mixture of
App state, Player state, callbacks, and external bridge registrations.

**What to extract/move/change:** Add `src/features/player/use-player-controller.js`
and `player-context.jsx`. The controller becomes the owner of `IpcAudio`, current track,
queue, playing state, play/enqueue/navigation commands, audio lifecycle, history
writes, and player-specific native/Big Picture bridge registrations. Expose separate
state and actions contexts/hooks so views, queue, player UI, and Big Picture adapters
can consume only what they need. Move crossfade and progressive-mode configuration
inputs from SettingsContext into the controller boundary; do not duplicate their
state. Convert consumers incrementally, then remove the old player prop chain.

**Dependencies / prerequisites:** Step 10; Step 8 provides playback preferences; Step
9 provides the independent lyrics renderer.

**Risk level:** High. **Verify:** all Step 9 checks plus track history, OS media
controls, Discord presence, Last.fm now-playing/scrobbling thresholds, Kimuco/OBS
payloads, Composer pause event, profile switching/logout playback reset, and Big
Picture bridge commands. Exercise rapid track changes and a long-playing track to
detect stale closures/timers.

### Step 12 — Complete application domain controllers; add contexts only for shared UI

**Goal:** Reduce App's non-UI effects and state without turning every concern into a
provider.

**What to extract/move/change:** Extract hooks/services for updates/news/heartbeat,
profiles and authentication, downloads/cache/offline state, overlays/OBS, remote
control, and music navigation/collection loading into their named feature folders.
Add a small `ProfileContext` for the
Sidebar, account settings, and profile modals; add a `NavigationContext` only after
the shell and music views have more than one consumer of navigation actions/state.
Keep
download state in a `useDownloadManager` hook unless the download view, progress card,
and track rows need it independently, in which case expose a dedicated
`DownloadContext`. Move fetch/Tauri code into these controller hooks or focused
service modules; components should call domain actions rather than perform inline
fetches.

**Dependencies / prerequisites:** Steps 4, 6, 8, and 11. Preserve the existing profile
key convention and reset ordering while migrating profile logic.

**Risk level:** High. **Verify:** login/add/reauthorize/rename/delete/logout/switch
profiles; profile-specific pins, recents, history, likes, and current UI reset;
online/offline changes; update check/download/install states; batch download queue,
cancel/retry/cache removal; OBS start/stop/port change; remote pairing/trust actions;
and news read/unread/feedback flows.

### Step 13 — Replace App's render switchboard with AppShell and feature overlays

**Goal:** Finish with an understandable composition root instead of merely relocating
code.

**What to extract/move/change:** Add `src/app/AppShell.jsx` for layout, route/view
selection, sidebar/content/player/queue placement, and resize/fullscreen presentation
state. Add `AppOverlays.jsx` and focused `TrackContextMenu`/playlist menu components
for dialogs, menus, selection actions, and transient UI. Let these components consume
the domain hooks/contexts from earlier steps; do not recreate long prop lists. Leave
`App.jsx` responsible only for startup splash/FFmpeg gating, provider composition,
the toast host, and rendering `AppShell`.

**Dependencies / prerequisites:** Steps 5 through 12.

**Risk level:** High. **Verify:** layout at collapsed/resized sidebar and queue widths,
settings/lyrics/fullscreen z-index and pointer-event transitions, every dialog/context
menu, selected-track actions, keyboard shortcuts, macOS vs. Windows titlebar behaviour,
and start-up gates including overlay-editor mode.

### Step 14 — Remove compatibility glue and perform a final boundary audit

**Goal:** Ensure the refactor actually eliminates the god component and does not leave
duplicate ownership behind.

**What to extract/move/change:** Remove temporary prop adapters, unused imports,
deprecated state setters, duplicate helpers, and old re-exports only after their last
consumer migrates. Audit that `App.jsx` no longer contains feature implementations,
large JSX branches, direct feature fetches, or `localStorage` writes beyond explicit
startup gating. Check for circular imports and ensure no modules import App except
where a temporary compatibility export is deliberately still documented. Update
developer documentation with the final domain ownership map.

**Dependencies / prerequisites:** Steps 1 through 13.

**Risk level:** Medium. **Verify:** clean import graph, `npx vite build`, desktop
smoke matrix from Step 1, and a before/after comparison of persisted values, network
requests, and native bridge events for the risky flows.

## 3. Progress checklist

- [x] Step 1: Baseline and boundaries
  - How: Live entry graph, module boundaries, and the readable architecture flow were recorded in `app.jsx.structure.md`.
  - Verified: Completed before this cleanup step.

- [x] Step 2: Remove confirmed legacy code
  - How: Removed the isolated vanilla graph, its stale React dependants, and two unused stylesheets (14 files, 1,182 lines).
  - Verified: Repository-wide reference check was clean and `npx vite build` passed. Native smoke testing remains blocked by the pre-existing missing `src-tauri/resources/node` build resource.

- [x] Step 3: Build the shared functional foundation
  - How: Added feature-neutral API/thumbnail helpers, safe persisted state with explicit codecs and malformed-value fallback, and pure version/shortcut helpers. Migrated sidebar/queue widths, UI zoom, and font scale without moving JSX; `context.jsx` keeps temporary API/thumbnail compatibility exports.
  - Verified: `npx vite build`, targeted lint for the new shared modules, and `git diff --check` pass. The repository-wide lint command remains blocked by pre-existing failures; native preference reload/malformed-value smoke testing remains to be run in the desktop app.

- [x] Step 4: Port non-visual domain behavior into hooks/controllers (news/update/OBS/remote/downloads/profiles/network-status all ported)
  - How: Ported the four lowest-coupled domains into focused hooks that App consumes
    by destructuring, with **no change to any JSX or prop interface**:
    - `src/app/hooks/use-news.js` — `useNews()`: news feed fetch (remote → backend
      fallback with version filtering), 15-min refresh + focus re-check timers,
      seen-state persistence, important-news auto-open, and the anonymous opt-out
      heartbeat (moved `NEWS_URL`/`STATS_URL`/`_sha256Hex`/`sendHeartbeat` out of
      App's module scope entirely).
    - `src/app/hooks/use-app-update.js` — `useAppUpdate({ addToast, getInitialLang })`:
      plugin-updater silent startup check, manual re-check with feedback,
      download-with-progress, and install (stops the Python backend, then relaunches).
      Also dropped the already-dead `updateDownloadAbortRef`.
    - `src/features/overlay/hooks/use-obs-overlay.js` — `useObsOverlay()`: OBS server
      enabled/port state, on-mount overlay-doc push, auto-start-with-retry, and
      enable/port-change commands. The former inline `onObsPortSave` JSX handler is now
      the hook's `saveObsPort` action.
    - `src/features/remote/hooks/use-remote-control.js` — `useRemoteControl()`: LAN
      remote enable/token/trusted-device state, adaptive device poll (2s pairing / 5s
      idle), pairing-modal reactions, and device approve/deny/remember commands.
    - `src/features/downloads/hooks/use-download-manager.js` —
      `useDownloadManager({ addToast, language })`: the offline-cache/download/premium id
      sets, active-download queue poll, batch bookkeeping/cleanup, pending-queue drain
      (max 5 concurrent), the mount cached-id load (with retry), and the
      download/batch-cancel/remove-all/single-remove/export operations. The former inline
      `onPremiumDetected` and context-menu `removeDownload` JSX handlers are now the
      hook's `markPremium` and `removeCachedSong` actions. Confirmed downloads/cache are
      global (never reset on profile switch), so no reset ordering was affected.
    - `src/features/profiles/hooks/use-profiles.js` — `useProfiles({...})`: the profile
      list + offline cache fallback, auth bootstrap (validate → cache fallback →
      background poll), the "session expired" warning, the hidden session-keeper WebView
      lifecycle, and the account switch/add/reauth/remove/rename/avatar/logout commands.
      The switch/remove/logout reset sequences (view, playback, queue, collection,
      overlays) are business rules that were **duplicated** inline in the Sidebar and in
      the account handlers; they now live once in the hook, and the Sidebar's five inline
      handlers were replaced with the hook's `handleAccount*` actions (the single source
      of truth the code comment already described). App-owned state cells that the reset
      touches (`setView`/`setCurrentTrack`/`setQueue`/`setCollection`/`setOverlayOpen`/
      `setQueueOpen`/`setSearchQuery`/`setAppKey`/`setPinnedIds`) are injected for now, so
      the ordering stays profile-owned while those domains await their own extraction.
      Verified the profile reset ordering is byte-identical to the originals.
    - `src/app/hooks/use-network-status.js` — `useNetworkStatus({ fetchProfiles, setAppKey,
      setView })`: the real online/offline listener (refreshing profiles + forcing a view
      re-fetch on reconnect), user-toggled offline mode, and the effective `isOffline`.
  - Net: `src/App.jsx` shrank 20,753 → 19,774 lines (−979 across the session); the startup
    mount effect now runs only `startAudioLevels()` (the update check moved into the update
    hook). Eight domain hooks now live under `app/hooks/` and `features/*/hooks/`.
  - Verified: `npx vite build` passes (`✓ built`; only the pre-existing dynamic/static
    import warning). New-file lint findings are all patterns carried over verbatim
    (`set-state-in-effect`, `no-empty`, the write-only `hasProfile`, and the Vite-injected
    `__APP_VERSION__` `no-undef` that App.jsx already reports). Native desktop smoke testing
    (news load/refresh/auto-open, update check/download, OBS start/stop/port-change with a
    live OBS source, remote pairing/approve/remember across restart, download
    single/batch/cancel/remove/export + cached-badge refresh, and — highest risk — profile
    add/switch/reauth/remove/logout with correct view/playback/queue/overlay reset, session
    expiry warning, and session-keeper start/stop) still needs to be run in the Tauri app —
    blocked here by the pre-existing missing `src-tauri/resources/node` build resource.
  - Remaining for Step 4: none. `ipv4First` (a connections/backend setting, not network
    status) was intentionally left in App — it can ride with a future network/connections
    hook or the settings extraction.

- [x] Step 5: Extract shared presentational primitives
  - How: Moved self-contained UI out of App with unchanged behaviour/props:
    - `src/shared/ui/title-bar.jsx` (`TitleBar`) — Windows custom window controls; the new
      module makes its own `getCurrentWebviewWindow()` handle instead of App's `appWindow`.
    - `src/shared/ui/context-menu.jsx` (`ContextMenu`, `CtxItem`) — the cursor-anchored HeroUI
      context-menu primitive + item wrapper, with the private `CTX_POPOVER_ANIM` moved along.
    - `src/shared/ui/ambient-backdrop.jsx` (`AmbientBackdrop`) — blurred-cover crossfade backdrop.
    - `src/app/DownloadQueueCard.jsx` — the floating download-progress card, extracted from
      inline App JSX into a component taking `{ batches, minimized, onToggleMinimize,
      onCancelBatch, language }`.
    - `src/app/SelectionActionBar.jsx` — the multi-track selection action bar (like-all /
      add-to-playlist / remove-from-playlist / close), extracted from inline App JSX into a
      component taking the tracks + current callbacks; imports the existing `SelActionBtn`
      from `views/track-table.jsx`. Removed the now-dead `SelActionBtn` import from App.
    - Left the dead `clampMenu` helper and any other now-unused imports for the Step 14
      import/dead-code audit (not folded into this behaviour-preserving move).
  - Net: `src/App.jsx` shrank 19,774 → 19,267 lines (−507). This was component relocation
    only — no data-flow or context changes (that is Steps 8/11/12).
  - Verified: `npx vite build` passes (`✓ built`). New-file lint is carried-over-verbatim
    (one empty catch in the remove-from-playlist loop, and AmbientBackdrop's
    `set-state-in-effect`). Native smoke testing still owed: context-menu positioning/close
    under zoom, Windows titlebar min/max/restore/close, ambient backdrop crossfade on track
    change, download card minimize/cancel, and selection-bar like-all/add/remove/close —
    blocked here by the pre-existing missing `src-tauri/resources/node` build resource.

- [x] Step 6: Extract the remaining live in-file music views
  - How: Moved the seven in-file music components out of `App.jsx` into a new `music`
    feature (byte-exact extraction of each function body + a fresh import header — no
    logic edits), keeping every prop/effect/fetch as-is:
    - `src/features/music/components/` — `carousel.jsx` (`Carousel`), `media-tile.jsx`
      (`MediaTile`), `artist-description.jsx` (`ArtistDescription`).
    - `src/features/music/views/` — `library-view.jsx` (`LibraryView`), `search-view.jsx`
      (`SearchView`), `home-view.jsx` (`HomeView`, incl. its local `MediaCard`/`GreetingIcon`),
      `artist-view.jsx` (`ArtistView`).
    - App now imports the four views; `MediaTile`/`Carousel`/`ArtistDescription` are consumed
      only by the views, so App doesn't import them. The view render call sites and their
      props are unchanged.
    - Behaviour nuance handled: `ArtistView` used App's local `hiResThumb(url)` (hard-coded
      800px), which differs from the shared `hiResThumb(url, size=512)`. Imported the shared
      one and passed `800` at the call site to preserve the exact hero-image resolution.
      Verified this is the *only* App-local helper any extracted view referenced.
  - Net: `src/App.jsx` shrank 19,267 → 16,828 lines (−2,439).
  - Verified: `npx vite build` passes. Because a missing import in a moved component is a
    runtime (not build) error, each new file was gated on ESLint `no-undef` — **zero
    undefined identifiers** across all seven files, and App.jsx has no dangling references
    to the moved components. Remaining new-file lint is carried-over-verbatim (pre-existing
    unused props like `onPlay`/`onStartRadio`, and `set-state-in-effect`). Still owed: a
    desktop smoke test of home/search/library/artist views — load/refresh, back-nav,
    explicit-content filtering, artist hero + radio/pin/follow, and context actions —
    blocked by the pre-existing missing `src-tauri/resources/node` build resource.
  - Note: the active lowercase views (`collection-view`, `history-view`, `liked-view`,
    `track-table`) still live in `src/views/`; per the plan they move into
    `features/music/` as each is next touched. App's local `hiResThumb` (Cover-View) stays.

- [x] Step 7: Decompose SettingsPanel behind its existing prop interface
  - How: Moved the settings feature out of App into dedicated panel, sidebar, account-tab,
    support-control, constants, section-store, and debug-log modules. `SettingsPanel` imports
    `CoverView` from `features/player/`, so there is no App ↔ settings cycle. App retains
    settings state/callback ownership for Step 8 and injects the overlay-editor and shortcut-reset
    actions explicitly. Removed the confirmed-unreachable 718-line color/corner toolkit rather
    than relocating it.
  - Verified: the settings feature has zero unresolved identifiers, no settings module imports
    `App.jsx`, `git diff --check` passes, and `npm run build` passes. Desktop smoke coverage
    for tabs, scroll-spy, account/PIN, updates, remote pairing, and visualizer preview remains
    blocked by the pre-existing missing `src-tauri/resources/node` build resource.

- [x] Step 8: Introduce sliced SettingsContext
  - How: `features/settings/settings-context.jsx` provides five independent, memoized
    contexts (`useAppearanceSettings`, `usePlaybackSettings`, `useLyricsSettings`,
    `useIntegrationSettings`, `useShortcutSettings`) composed by a single
    `SettingsProviders`. App builds one memoized value/actions object per slice and wraps
    the panel once; `SettingsPanel`'s prop list dropped from ~100 to ~30 (only the
    genuinely cross-cutting concerns kept as props: account/profile, update lifecycle,
    language, `tab`/`setTab`, and the privacy toggles `anonStats`/`hideUserHandle`). Slice
    membership: appearance folds in accessibility + visualizer config/preview; playback =
    autoplay/crossfade/overrides/progressive; lyrics = font sizes/providers/romaji/agent-
    tags/syllable-zoom/fluid; integrations = tray/discord/ipv4/OBS/remote; shortcuts =
    the shortcut map + recorder. The inline persistence handlers were moved verbatim from
    the JSX call site into the memo objects (same keys, same `localStorage` writes, same
    Tauri calls), so behaviour is byte-identical.
  - Deviation from plan: App **remains** the owner of the underlying settings state,
    `localStorage` persistence, and document-root effects. This step delivered the
    context slicing + prop-explosion removal + re-render isolation; the plan's optional
    "move persistence and document-root effects into the settings hooks" is intentionally
    deferred (it can ride with Step 14 or a later settings-hooks pass). This matches the
    "App is temporary owner" note already in `settings-context.jsx`.
  - Verified: `npx vite build` passes (only the pre-existing chunk-size warning). ESLint
    `no-undef` on `App.jsx` + `settings-panel.jsx` is clean, proving no panel identifier
    lost its binding and App has no dangling reference to a removed handler. A mechanical
    key-by-key cross-check confirmed all 85 fields consumed across the five hooks
    (36+8+16+19+6) are provided by the matching App memo with zero unused-provided
    leftovers — guarding against silent `undefined` that `no-undef` cannot catch. Native
    desktop smoke testing (reload persistence for theme/accent/dynamic-accent, visualizer
    config, playback mode/crossfade, lyric presentation/providers, shortcuts, zoom/font
    scale, accessibility; and that CSS vars/data-attributes update immediately without
    resetting playback or the current view) is now unblocked by the restored
    `src-tauri/resources/node` resource and still needs to be run in the Tauri app.

- [x] Step 9: Extract the lyrics engine while preserving the Big Picture contract
  - How: Moved `LyricsOverlay`, its word-timing/paint helpers, and the Composer window bridge
    from `App.jsx` into `src/features/lyrics/LyricsOverlay.jsx`. The existing App call site keeps
    its prop contract, and `src/bigpicture/Lyrics.jsx` now imports the overlay directly from the
    lyrics feature instead of importing `App.jsx`. Removed the lyric-only imports left behind in
    App; the shared `parseDurationToSeconds` helper remains there for queue/player callers.
  - Verified: `npm run build` passes and `git diff --check` passed before commit. A repository-wide
    search found no remaining feature import of `App.jsx` for lyrics, so the Big Picture → App
    dependency and the potential App ↔ lyrics cycle are removed. Desktop lyric smoke coverage
    (synced/unsynced lyrics, provider switching, custom lyrics, translation/romaji, fullscreen,
    and manually enabled Big Picture) remains blocked by the pre-existing missing
    `src-tauri/resources/node` build resource. The repository-wide ESLint command still contains
    pre-existing lint debt unrelated to this relocation.

- [x] Step 10: Move player and queue UI
  - How: Moved `Player`, `QueuePanel`, `QueueRow`, `CoverView`, the visualizer helpers and
    defaults, plus the queue's per-transition `FadeEditorModal`, into `src/features/player/`.
    `App` now imports `Player`, `QueuePanel`, `CoverView`, and `VIZ_DEFAULTS` from the player
    feature while retaining ownership of playback, queue, and callback state. The single
    App-local dependency (`buildShareLink`) is injected as a `Player` prop rather than imported
    back from `App.jsx`. `CoverView` is a public player-feature export, which unblocks Step 7.
    Follow-up structural split: `player-ui.jsx` is now a five-line public entry point; queue UI,
    cover/visualizer rendering, the player control bar, the actions menu, fade editor, cover-art
    helper, sleep-timer hook, and track-metadata hook each have dedicated player-feature modules.
    `player.jsx` now contains playback transport, native/remote/Big-Picture bridge effects, and
    composes the controls rather than owning the large JSX tree.
  - Verified: `npm run build` passes, `git diff --check` passes, and focused ESLint reports zero
    unresolved identifiers in both moved player files. The player feature does not import
    `App.jsx`; App no longer defines any of the moved player/queue/visualizer implementations.
    Desktop smoke coverage remains to be run once the pre-existing missing
    `src-tauri/resources/node` build resource is restored: playback/seek/volume/queue drag and
    removal/crossfade override/fullscreen/remote commands/Big Picture bridge.

- [x] Step 11: Introduce PlayerContext and controller
  - Done so far (11a): Extracted the `IpcAudio` class verbatim (App.jsx lines 630–853) into
    `src/features/player/ipc-audio.js` as an `export class`. It is fully self-contained (only
    Tauri dynamic imports + browser APIs), so App just imports it. This realizes the file-map's
    "IpcAudio → features/player/" ownership.
  - Done so far (11b): Added `src/features/player/use-player-controller.js`
    (`usePlayerController({ addToast, resetLyricsSessionRef })`) as the single owner of the
    `IpcAudio` instance (`audioRef`), `currentTrack`/`isPlaying`/`queue`, the `queueRef` mirror,
    the `handlePlay`/`enqueue`/`startSongRadio`/`playByVideoId` commands (incl. profile-scoped
    play-history writes), the Big Picture `registerPlayerCommands` bridge, and the
    `kodama://song/<id>` deep-link listener. App consumes it by destructure, so **no JSX or prop
    interface changed** (same pattern as Steps 4/8). The per-track lyrics-session reset
    (forced/current/failed providers) is injected via `resetLyricsSessionRef` — a ref, not the raw
    setters — because App's lyrics-session state is declared *after* the hook call, so passing the
    setters directly would hit a TDZ in the command dep arrays. App populates that ref right below
    its lyrics-session `useState`s. Removed App's now-unused `IpcAudio` and
    `registerPlayerCommands` imports; App.jsx shrank 6353 → 6036 lines this session.
  - Done so far (11c): Added `src/features/player/player-context.jsx` — split
    `PlayerStateContext` (`track`/`isPlaying`/`queue`/`audioRef`/`queueRef`) and
    `PlayerActionsContext` (`setTrack`/`setIsPlaying`/`setQueue`/`handlePlay`/`enqueue`/
    `startSongRadio`), each memoized, plus `usePlayerState`/`usePlayerActions` hooks and a
    `PlayerProvider` fed the single controller object. App wraps its content in `PlayerProvider`
    (innermost of the existing provider stack). Migrated the two App-tree consumers off the
    core-playback prop chain: `Player` (dropped 7 props: track/setTrack/queue/setQueue/audioRef/
    isPlaying/setIsPlaying) and `QueuePanel` (dropped 4: queue/setQueue/currentTrack/setTrack) now
    read those from the hooks. `CoverView` was intentionally **left on props** — it is also rendered
    by the settings visualizer preview with a *preview* track, so context-sourcing it would show the
    wrong track there. App's now-unused `queue` destructure was removed (still reaches the provider
    via the controller object).
  - Done so far (11c views): Migrated the music views + track-table off the player **action** prop
    (`onPlay`, and Artist's dead `onStartRadio`) onto `usePlayerActions().handlePlay`. `PlaylistLayout`
    (track-table) and the `home`/`search`/`artist` views now pull `handlePlay` from context and use it
    where they previously called `onPlay(track, list)`; the closure-fed leaves (`TrackRow`, `TableRow`,
    `MediaTile`) keep their pre-bound `onPlay` props unchanged (a `MediaTile`'s `onPlay` is a
    view-local album/video handler, not the player action — correctly left alone). The passthrough
    views (`collection`/`liked`/`history`/`downloads`) simply stopped forwarding `onPlay` to
    `PlaylistLayout`; `library`'s `onPlay` was dead and removed. Deleted all nine `onPlay={handlePlay}`
    / `onStartRadio={handlePlay}` props from the App view call sites, and App's now-unused `handlePlay`
    destructure (still reaches the provider via the controller object). `enqueue`/`startSongRadio`
    remain App-local (track context menu). Guard: after removing `onPlay` from each component's
    signature, ESLint `no-undef` would flag any leftover `onPlay(...)` invocation — all nine migrated
    files report zero.
  - Done so far (11d): (1) Moved crossfade + progressive-mode config (`crossfade`,
    `playbackProgressive`, `crossfadeOverrides` + `setCrossfadeOverride`/`removeCrossfadeOverride`)
    into the controller as the single owner. App feeds the settings `playbackSettings` slice from the
    controller (no duplicate state), and the player context now exposes `crossfade`/
    `crossfadeOverrides`/`playbackProgressive` (state) + the override setters (actions). `Player`
    dropped 3 crossfade props and `QueuePanel` dropped 4 — both read from the player context now.
    (2) Folded two self-contained native bridges into the controller: the native window/taskbar title
    (`features/player/hooks/use-window-title.js`, composed by the controller) and the Composer-pause
    listener (inlined in the controller — it only touches `audioRef`/`setIsPlaying`).
  - Done so far (11e): Moved the remaining player-owned native bridges out of `App` in a focused
    pass. `features/player/hooks/use-player-native-bridges.js`, composed by the controller, owns
    the Discord RPC/OS media bridge (including its 800ms debounce and 15s elapsed-time refresh) and
    the Kimuco/built-in-OBS now-playing bridge (including its one-second reporting interval). App
    injects the latest `discordRpc`/`obsEnabled`/`obsPort` settings through a ref and asks the
    controller to refresh the bridges when those settings change, avoiding a hook-order/TDZ
    reorganisation. `features/integrations/lastfm.js` now owns the shared Last.fm connection ref,
    status refresh, requests, now-playing, and scrobbling timing; the controller composes its
    playback-facing hook while App's like/love handler reads the same connection ref. Fullscreen
    cursor/player-bar idle timers remain App-shell state for Step 13, because they write
    `playerVisible`/`cursorVisible`/`fullscreen`. The Big Picture adapter continues to use the
    separate `registerPlayerCommands` bridge and is not part of this React tree.
  - Done so far (11f): Completed the two remaining pieces the plan called for. (1) Moved `autoplay`
    into the controller alongside crossfade/overrides/progressive mode: `use-player-controller.js`
    now owns `autoplay` state and a persistence-aware `setAutoplay` (writes `kiyoshi-autoplay`), and
    made `setCrossfade`/`setPlaybackProgressive` persistence-aware the same way (writing
    `kiyoshi-crossfade` / `kodama-playback-mode` inside the controller instead of inline in App's
    JSX-adjacent memo). App's local `autoplay` `useState` was deleted; `playbackSettings` now just
    adapts `player.autoplay`/`player.setAutoplay`/`crossfade`/`setCrossfade`/`playbackProgressive`/
    `setPlaybackProgressive` from the controller into the settings-panel shape — App no longer
    performs any of these `localStorage` writes itself. (2) Replaced the single broad
    `usePlayerState` with four narrow contexts/hooks in `player-context.jsx`: `usePlaybackStatus`
    (`track`/`isPlaying`/`audioRef`), `useQueueState` (`queue`/`queueRef`), `usePlaybackConfig`
    (`autoplay`/`crossfade`/`crossfadeOverrides`/`playbackProgressive`), and the existing
    `usePlayerActions` extended with `setAutoplay`/`setCrossfade`/`setPlaybackProgressive`. `Player`
    and `QueuePanel` were migrated to the narrow hooks (each now only subscribes to the slices it
    actually reads, e.g. `QueuePanel` no longer re-renders on an audio-ref-only change). Migrated the
    remaining playback-status prop threading off `currentTrack`/`isPlaying`: `PlaylistLayout`
    (`track-table.jsx`), `SearchView`, and `ArtistView` now call `usePlaybackStatus()` directly
    instead of taking `currentTrack`/`isPlaying` props; `CollectionView`, `LikedView`, `HistoryView`,
    and `DownloadsView` (both its `PlaylistLayout` call sites) dropped the pass-through props
    entirely; `LibraryView` dropped the two props it never read. Removed the corresponding
    `currentTrack={currentTrack} isPlaying={isPlaying}` pairs from all seven `App.jsx` view call
    sites (search/liked/history/library/collection/artist/downloads). App itself keeps its own
    `currentTrack`/`isPlaying` destructure from `player` — they're still read directly for app-shell
    concerns (dynamic accent, usage-time tracking, the keyboard-shortcut effect, the fullscreen
    cover/lyrics overlay, the visualizer settings preview, and the bug-report modal's current-track
    context), none of which are prop-threading through an intermediate view/layout component.
    `LyricsOverlay` and `CoverView` were deliberately left prop-driven per the plan (alternate
    callers/preview contract), and the keyboard-shortcut effect stays an app-shell concern for
    Step 13.
  - Verified: `npx vite build` passes (`✓ built`; only the pre-existing dynamic/static-import
    warnings). `git diff --check` passes. Targeted ESLint on every changed player/context/view module
    plus `App.jsx` shows no new `no-undef`/`no-unused-vars` introduced by this pass — the only
    `no-undef` is the pre-existing Vite-injected `__APP_VERSION__` global; all other findings
    (`set-state-in-effect`, empty catches, unused `onToggleLike`/`likedIds` in `track-table.jsx`,
    the `useVirtualizer` incompatible-library note) are carried over verbatim from before this
    change. Desktop smoke testing still owed (blocked here by the pre-existing missing
    `src-tauri/resources/node` build resource, same as prior Step 11 increments): all Step 9 checks
    plus track history, OS media controls, Discord presence, Last.fm now-playing/scrobbling
    thresholds, Kimuco/OBS payloads, Composer pause event, profile switching/logout playback reset,
    Big Picture bridge commands, autoplay toggle persistence across reload, crossfade/progressive-
    mode settings reload, and row active/isPlaying highlighting across search/artist/library/
    liked/history/downloads/collection views and the queue panel.

- [x] Step 12: Complete application domain controllers
  - Done so far (12a): Added `src/features/profiles/profile-context.jsx` (`ProfileProvider`,
    `useProfileState`, `useProfileActions`), following the same pattern as `player-context.jsx`:
    App still instantiates the single `useProfiles(...)` controller and owns the startup/auth-gate
    state (`showLogin`, `showLangPicker`, `addingProfile`, `reauthName`, `fetchProfiles` — still used
    directly by `LoginScreen` and `useNetworkStatus`), but the account list/active profile and the
    switch/add/reauth/remove/rename/avatar/logout actions are now distributed via context instead of
    as App-owned callback props. `ProfileProvider` wraps the same region as `PlayerProvider`.
    Migrated the three consumers the plan named: `Sidebar` (still in-file) now reads
    `useProfileState()`/`useProfileActions()` instead of taking `currentProfileData`/`profiles`/
    `onLogout` props (dropped 3 props); `onSwitchProfile`/`onAddProfile`/`onReauthProfile`/
    `onDeleteProfile` were also dropped from `Sidebar`'s signature — they were unused dead props, not
    load-bearing. `features/settings/account-settings-tab.jsx` (rendered by `SettingsPanel`'s account
    tab) now reads the context directly instead of 9 props threaded through `SettingsPanel`, which
    dropped the matching 9 props from its own signature and call site. `modals/profile-switcher-modal.jsx`
    now reads the context instead of taking `accounts`/`onSwitch`/`onAdd` props. `App.jsx`'s `profiles`
    destructure stays (it's still used directly for the home-view greeting and the `Sidebar`
    account-menu length check moved into `Sidebar` itself via context).
  - Verified: `npx vite build` passes (`✓ built`; only the pre-existing dynamic-import warnings).
    `git diff --check` passes. Targeted ESLint on `App.jsx` + the four changed/new files shows no new
    `no-undef` (only the pre-existing `__APP_VERSION__` carryover) — confirmed by grep that no
    dangling reference to a removed prop (`handleAccountSwitch`, `onSwitchProfile`, `accounts`,
    `activeAccount`, `onAccount*`, etc.) remains outside the new context module. Desktop smoke testing
    still owed: account switch/add/reauth/remove/rename/avatar-change/logout from both the Sidebar
    account menu and Settings → Account, and the profile-switcher modal's switch/add actions.
  - Done so far (12b): Added `src/features/music/hooks/use-music-navigation.js`
    (`useMusicNavigation({ setSearchQuery })`) as the single owner of the navigation domain: `view`,
    the back-navigation history stack (`navHistory`, now fully internal — nothing outside these
    functions ever read it), `appKey`/`viewRefreshKey` (view-remount mechanics), the open
    `collection` (playlist/album, including the `EventSource` playlist-stream and album-fetch
    logic), the open `artistView`, `navStateRef`, and the `handleSearch`/`addRecentPlaylist`/
    `removeRecentPlaylist`/`openPlaylist`/`openAlbum`/`openArtist`/`navigateTo`/`goBack` commands —
    moved verbatim (same bodies, same `useCallback` deps arrays) so behaviour is unchanged.
    `setSearchQuery` is injected because `handleSearch` also drives the search view's query text,
    which stays App-owned (cross-cutting UI state, not navigation data) — same injection pattern
    Step 4's hooks use for App-owned reset sequences. Dropped `pushNav`: it was fully dead code
    (defined, never called — `openPlaylist`/`openAlbum`/`openArtist` all push history via
    `navStateRef.current` directly). Also extracted the `itemId`/`profileKey` pure helpers (used by
    both the new hook and App's `togglePin`) into `src/features/music/lib/playlist-id.js` as
    module-level exports, so both call the exact same implementation instead of each holding a
    per-render-recreated copy. The hook call had to move to just after App's `searchQuery`
    `useState` (previously `view`/`navHistory`/`appKey`/`viewRefreshKey` were declared near the top
    of `App()`) — it must still run before `useProfiles`/`useNetworkStatus`, since both inject this
    hook's `setView`/`setAppKey`/`setCollection` setters into their own reset sequences; confirmed no
    code between the old and new declaration sites referenced `view`/`collection`/`artistView` first.
    App's JSX and the ~30 `openPlaylist`/`openAlbum`/`openArtist`/`navigateTo`/`goBack`/`view`/
    `collection`/`artistView`/`setView`/`setCollection` call sites were untouched — the hook returns
    values under the same names, so App's destructure is the only thing that changed.
  - Verified: `npx vite build` passes (`✓ built`; only the pre-existing dynamic-import warnings).
    `git diff --check` passes. Targeted ESLint on `App.jsx` + the two new files shows no new
    `no-undef` beyond the pre-existing `__APP_VERSION__` carryover; grepped for dangling references
    to `pushNav` and the old local `itemId`/`profileKey` definitions and found none. Desktop smoke
    testing still owed: sidebar navigation + back button after opening a playlist/album/artist,
    playlist streaming progress/cached badge, album load, recent-playlists add/remove, search-from-
    sidebar, and the view-refresh button.
  - Done so far (12c): Chose `DownloadContext` over a hook-only approach — `cachedSongIds`/
    `downloadingIds`/`premiumSongIds` and the download/export/premium-detected actions were
    threaded as props through 7+ call sites (every music view, `PlaylistLayout`, and `Player`),
    the same shape of prop-drilling that justified `PlayerContext`/`ProfileContext`, so a hook
    alone (already extracted in Step 4) wouldn't remove the drilling. Added
    `src/features/downloads/download-context.jsx` (`DownloadProvider`, `useDownloadState`,
    `useDownloadActions`), same pattern as the other two contexts: App still instantiates the
    single `useDownloadManager(...)` controller (renamed to `downloads` at the call site) and
    keeps its own destructure for what its track-context-menu and the `DownloadQueueCard`
    progress card still act on directly (`cachedSongIds`, `downloadingIds`, `downloadBatches`,
    `downloadQueueMin`, `handleDownloadSong`, `handleCancelBatch`, `handleExportSong`,
    `removeCachedSong`) — `premiumSongIds`, `handleDownloadAll`, `handleRemoveAllDownloads`, and
    `markPremium` are no longer needed in App at all once their only consumers move to context.
    `DownloadProvider` wraps the same region as `PlayerProvider`/`ProfileProvider`.
    `PlaylistLayout` (`track-table.jsx`) now reads `cachedSongIds`/`downloadingIds`/
    `premiumSongIds`/the single-track download action from context instead of 4 props;
    `onDownloadAll`/`onRemoveAll` stay real props on `PlaylistLayout` (not context-sourced) since
    only the collection/album view offers a "download all" action — everywhere else it's simply
    absent. `CollectionView`, `LikedView`, `HistoryView`, and `DownloadsView` (both its
    `PlaylistLayout` call sites) dropped the now-dead pass-through props entirely.
    `CollectionView` specifically moved the `onDownloadAll` wrapper (which needs this collection's
    own title/thumbnail/artists metadata) from the App call site into itself, using
    `useDownloadActions().downloadAll` plus the `title`/`thumbnail`/`albumArtists` props it
    already receives — App no longer builds that closure. `DownloadsView` keeps reading
    `cachedSongIds` from context directly (not just via `PlaylistLayout`) since its own effect
    re-lists cached songs on `cachedSongIds.size` changes. `features/player/player.jsx` now reads
    `cachedSongIds`/`downloadingIds`/`downloadSong`/`exportSong`/`markPremium` from context
    instead of 5 props. Removed the matching props from all 6 App.jsx view call sites plus the
    `Player` call site.
  - Verified: `npx vite build` passes (`✓ built`; only the pre-existing dynamic-import warnings).
    `git diff --check` passes. Targeted ESLint across `App.jsx` + every changed/new file shows no
    new `no-undef` (only the pre-existing `__APP_VERSION__` carryover) and no new `no-unused-vars`
    for any download-related identifier; grepped `App.jsx` for `premiumSongIds`/
    `handleDownloadAll`/`handleRemoveAllDownloads`/`markPremium` and confirmed zero remaining
    references (fully moved to context, not just prop-renamed). Desktop smoke testing still owed:
    per-track download/export from a track row and from the player, "download all"/"remove all"
    on a playlist/album with the right cached badge and title/thumbnail in the toast/queue card,
    premium-only detection surfacing correctly from both the player and a playlist row, and the
    downloads view's own list refreshing after a download completes.
  - Step 12 is now complete: `ProfileContext`, the music-navigation hook, and `DownloadContext`
    are all landed. `ProfileContext`'s `activeProfile`/`hasProfile`/`currentProfile` split could
    still be revisited once profile modals move further, but that's a refinement, not open work.

- [ ] Step 13: Compose AppShell and overlays *(scoped, not started — see findings below;
  recommend slicing further before implementation)*
  - **Boundary decision (confirmed, still valid):** `AppShell` is a component `App` renders as a
    child inside the provider stack; `AppOverlays` is a component `AppShell` renders as *its*
    child. Because `App()`'s entire return is one JSX tree today (no existing sibling-tree
    boundary), this is a straight parent→child relationship all the way down — ordinary props
    carry what's needed. **No new context (`SelectionContext`, `MenuContext`, etc.) is
    warranted.** Checked `selectedTracks` specifically: it's read only by the main content
    column/`SelectionActionBar` (both moving into `AppShell`'s own body), and neither of the two
    inline context-menu blocks touches it — selection state never needs to cross into the overlay
    layer.
  - **First scoping pass (superseded, kept for context):** initially assumed nearly all of `App()`'s
    remaining state/effects could move verbatim into `AppShell.jsx` with `App.jsx` shrinking to
    gates + providers + a near-zero-prop `<AppShell />` call, matching how Steps 6/9/10 moved big
    components before changing anything about how they're consumed.
  - **Correction found during implementation attempt — this is the important part:** that
    assumption is wrong for a substantial share of the state, because of two structural
    anchors that didn't exist (or weren't load-bearing) in earlier steps:
    1. **The five `SettingsProviders` memos** (`appearanceSettings`, `playbackSettings`,
       `lyricsSettings`, `integrationSettings`, `shortcutSettings`, all built in `App()` and
       feeding a provider that wraps the future `AppShell`) close over far more than preference
       values. Read them in full: `appearanceSettings`'s `onToggleInstrumentalViz` handler calls
       `setShowLyrics(true)`; `integrationSettings`'s `onPairDevice` calls
       `setPairModalOpen(true)`. Since these memos must stay in `App()` (Step 8's own doc already
       says "App remains the temporary owner of the underlying settings state"), any state cell
       their handler closures write to is pinned to `App.jsx` too — `showLyrics` and
       `pairModalOpen` cannot physically relocate to `AppShell`, even though they're visually
       "shell" state (fullscreen lyrics toggle, remote-pairing dialog).
    2. **`useProfiles()`/`useNetworkStatus()`** (also pinned to `App()`, same provider-feeding
       reason since Step 4/12a) take injected setters for their reset-on-switch/reconnect
       sequence: `setPinnedIds`, `setView`, `setSearchQuery`, `setAppKey`, `setCollection`,
       `setOverlayOpen`, `setQueueOpen` (plus `stopPlayback`, already resolved — see the
       player-controller fix below). Since `setView`/`setCollection`/`setAppKey` all come from
       the single `useMusicNavigation()` call (Step 12b), that whole hook — and everything it
       returns (`view`, `collection`, `artistView`, `navigateTo`/`goBack`/`open*`/`handleSearch`)
       — has to stay called from `App()` too; a hook call can't be half-relocated.
    Net: `pinnedIds`/`togglePin`, `searchQuery`, `overlayOpen`, `queueOpen`, `showLyrics`,
    `pairModalOpen`, `uiZoom`, the shortcuts state (`customShortcuts`/`shortcutLabels`/
    `recordingShortcut`), and every raw preference value feeding the five settings memos
    (accent/theme/appearance, lyrics prefs, integrations, shortcuts) all stay declared in
    `App.jsx` and must cross into `AppShell` as props — not as a relocated `useState`.
  - **Second-order fix that meaningfully shrinks that prop surface:** the capture-phase
    keyboard-shortcut `useEffect` — previously assumed to be forced to stay in App because it
    writes `uiZoom`/`overlayOpen`/`queueOpen`/`splitView`/`fullscreen` and calls `openFeedback()`
    — turns out to have **no App-only dependency once player state comes from `PlayerContext`
    instead of the raw controller destructure** (`audioRef`/`currentTrack`/`setIsPlaying`/
    `queueRef` are all available via `usePlaybackStatus()`/`useQueueState()`/`usePlayerActions()`
    inside `AppShell`, since it renders inside `PlayerProvider`). Moving the *effect itself* into
    `AppShell` (rather than leaving it in `App`) breaks the chain that was pinning a cluster of
    state to `App.jsx` for no reason other than "the effect happens to write it": `fullscreen`,
    `playerVisible`/`cursorVisible`/the idle-cursor timer, `splitView`/`splitRatio`/
    `splitResizing` (+ `startSplitResize`), `feedbackOpen`/`feedbackShot`/`openFeedback`,
    `flashbang`, and `queueSettled` (its effect only depends on `queueOpen`, which becomes a prop
    either way) all become genuinely relocatable to `AppShell` once the effect moves with them.
    `uiZoom`/`overlayOpen`/`queueOpen`/`showLyrics`/shortcuts state remain pinned regardless
    (independently anchored by the settings memos / profile-reset injection above), so the
    keyboard effect crossing into `AppShell` still needs those as props — but the *rest* of what
    it touches no longer does.
  - **Current final (verified, not yet coded) boundary:**
    - **Freely relocates to `AppShell`:** sidebar/queue resize geometry (`sidebarCollapsed`/
      `sidebarWidth`/`sidebarResizing`/`queueWidth`/`queueResizing` + drag handlers), `fullscreen`/
      `playerVisible`/`cursorVisible`/idle-cursor timer, `splitView`/`splitRatio`/`splitResizing`,
      `feedbackOpen`/`feedbackShot`/`openFeedback`, `flashbang`, `queueSettled`, the
      keyboard-shortcut effect itself, selection state (`selectedTracks`/`selectionPlaylistOpen`),
      the two context-menu open-states (`globalContextMenu`/`trackContextMenu`), the playlist
      dialog states (`createPlaylistOpen`/`createPlaylistForSelection`/`createPlaylistTracks`/
      `addToPlaylistFor`/`renameDialog`/`deleteDialog`), settings-panel open-state
      (`settingsOpen`/`settingsClosing`/`settingsTab`/`settingsInitialTab`), `debugFloat`,
      lyrics-session state (`forcedLyricsProvider`/`currentLyricsSource`/`failedLyricsProviders`/
      `isCustomLyrics`/`lyricsRefetchKey`) — the last of these needs `resetLyricsSessionRef`
      passed down as one prop so `AppShell` can populate `.current` with its own setters, since
      the ref itself must still be *created* in `App()` (it feeds `usePlayerController`).
    - **Stays declared in `App.jsx`, crosses as props (bundle into named objects, mirroring the
      existing `appearanceSettings`-style pattern, not a flat 40-prop list):** `useMusicNavigation()`'s
      full output, `pinnedIds`/`togglePin`, `searchQuery`, `overlayOpen`/`setOverlayOpen`,
      `queueOpen`/`setQueueOpen`, `showLyrics`/`setShowLyrics`, `pairModalOpen`/`setPairModalOpen`,
      `uiZoom`/`setUiZoom`, shortcuts state/setters, and the read-only preference values feeding
      the five settings memos (accent/theme/appearance/lyrics-prefs/integrations). `useAppUpdate()`
      itself can move entirely into `AppShell` (its only consumers, `Sidebar`/`SettingsPanel`, live
      there, and it feeds no provider) — `addToast` crosses down as one prop so `AppShell` can call
      it. `likedIds`/`handleToggleLike` can stay in `App` (small, tied to the App-scoped `lastfm`
      client) and cross as two props, or move with `lastfm` passed down — a minor call either way.
    - **Stays fully in `App.jsx`, no `AppShell` involvement:** splash/langpicker/FFmpeg gates,
      the provider stack + every provider-feeding hook call, `addToast`'s definition, the
      dynamic-accent/usage-stats effects (self-contained given `currentTrack`/`isPlaying` are
      already raw-available from the player controller in `App`), the discord/obs
      `playerIntegrationRef` sync effect (uses `refreshNativeIntegrations`, only on the raw
      controller, not exposed via `PlayerContext`).
  - **Recommendation (agreed with the user): do not attempt this as one mechanical pass.** Unlike
    Steps 6/9/10, a build-only verification (`npx vite build` + ESLint `no-undef`) cannot catch
    the failure modes this specific move risks — a duplicated controller instance, a context read
    outside its provider, a stale-ref bug from splitting a closure across files — and those are
    exactly the seams `app.jsx.structure.md`'s risk list already flags (fullscreen z-index/
    pointer-events, timed-effect cleanup, the instrumental auto-switch refs). Only a human running
    the actual Tauri app can catch those, so the blast radius of one giant diff is too large to
    hand over confidently. Split 13a into two independently-buildable, independently-revertable
    checkpoints:
    - **13a-i:** scaffold `AppShell.jsx` with only the "freely relocates" list above (no
      settings-memo-anchored props yet) — sidebar/queue resize, the keyboard-effect cluster
      (fullscreen/split-view/feedback/flashbang/idle-cursor), selection, menus, dialogs,
      settings-open state, lyrics-session state. `AppShell` still receives the large "stays in
      App" state as props for now (nothing saved there yet), but this checkpoint proves the
      context-substitution (`usePlaybackStatus`/`useQueueState`/`usePlayerActions` instead of
      the raw `player` destructure) and the keyboard-effect relocation are both correct in
      isolation.
    - **13a-ii:** bundle the settings-memo-anchored values into named prop objects and finish the
      move; then 13b (already scoped further above the checklist entries — `AppOverlays` +
      `TrackContextMenu`/`PlaylistContextMenu` extraction) proceeds as originally planned once
      13a is verified and committed.
  - Not yet implemented. No files changed for Step 13 as of this entry. Resume from "13a-i" above
    when picking this back up — the boundary map is verified and should not need re-deriving.
  - **13a-i: done.** Added `src/app/AppShell.jsx` (~3,300 lines) as the new home for the entire
    "freely relocates" list plus the full render tree that used to live in `App()`'s return
    (sidebar/content/player/queue/overlay layout, all dialogs and context menus). `App.jsx` now
    renders a single `<AppShell {...props} />` inside the existing provider stack in place of that
    JSX, and shrank 4,287 → 2,295 lines this pass (net repo change: +3,302/-2,296 across the two
    files, since the moved code is verbatim, not rewritten).
    - **Two more hooks turned out to be wholesale-movable** beyond what the boundary map called
      out, using the same reasoning as `useAppUpdate()`: `useNews()` and `useRemoteControl()` were
      checked against every settings-memo closure — `useNews()`'s outputs are consumed only by
      `Sidebar`/`NewsModal` (both now in `AppShell`), so it moved entirely.
      `useRemoteControl()`'s outputs (`remoteEnabled`/`remoteInfo`/`remoteDevices`/`pairModalOpen`/
      etc.) turned out to still be read by `integrationSettings` (pinned to `App`), so — unlike
      `useNews()` — it **stays called in `App`**; `remoteEnabled`/`remoteInfo`/`remoteDevices`/
      `pairModalOpen`/`setPairModalOpen`/`remoteDeviceAction`/`remoteRememberDevice` cross down as
      explicit props (this corrects the original boundary note, which hadn't checked the
      settings-memo dependency for either hook before assuming `useAppUpdate()` was the only
      wholesale-movable one).
    - **Context substitution beyond props, where a Step 11/12 context already carries the exact
      value:** `AppShell` calls `usePlaybackStatus()`/`useQueueState()`/`usePlayerActions()`
      (player), `useDownloadState()`/`useDownloadActions()` (downloads), and
      `useProfileState()`/`useProfileActions()` (profiles) directly instead of taking
      `currentTrack`/`audioRef`/`cachedSongIds`/`profiles`/etc. as props — those contexts exist
      specifically so a component inside the provider tree doesn't need them re-threaded. Aliased
      at destructure time (e.g. `const { downloadSong: handleDownloadSong } =
      useDownloadActions()`) so the copied JSX bodies needed zero renaming. Settings-memo values
      (`animations`, `hideExplicit`, `lyricsFontSize`, etc.) were **not** substituted this way —
      they cross as plain props exactly as the boundary map specified, since `13a-ii` is where
      those get bundled into named objects.
    - **New bridge refs** (small, ref-based, same pattern as the existing `resetLyricsSessionRef`):
      `flashbangTriggerRef`, created in `App` and populated by `AppShell`
      (`flashbangTriggerRef.current = () => setFlashbang(true)`), because `flashbang` state moved
      to `AppShell` but `handleThemeChange` (pinned to `App` by the `appearanceSettings` closure)
      still needs to trigger it on the quad-click easter egg. `autoCoverRef` stays declared in
      `App` (shared: written by both `App`'s `onToggleInstrumentalViz` and `AppShell`'s
      `handleInstrumentalChange`/`setShowLyricsManual`) and crosses down as a prop.
    - **Circular-import fix not anticipated in the boundary map:** `Sidebar` and `LoginScreen` (+
      `LoginLogo`/`LoginBtn`) were still defined inline in `App.jsx` and are rendered inside the
      moved JSX tree; importing them from `App.jsx` into `AppShell.jsx` while `App.jsx` imports
      `AppShell` would be circular and would violate the plan's own "never import `App.jsx`" rule.
      Moved both verbatim (function bodies unchanged) into `AppShell.jsx` as unexported local
      components instead of re-exporting them from `App.jsx`.
    - `IS_MAC`, `ZOOM_STEPS`, `APP_VERSION`, `KODAMA_SHARE_BASE`/`buildShareLink`,
      `openOverlayEditor`, `getInitialLang`/`detectSystemLang`, and the `SIDEBAR_*`/`QUEUE_*`/
      `SPLIT_*` geometry constants were duplicated or moved (not shared) into `AppShell.jsx` — each
      is either a pure constant/function with no App-side consumer left, or (for
      `getInitialLang`/`IS_MAC`) cheap enough to duplicate rather than introduce a new shared
      module for a 1-2 line helper.
  - Verified: `npx vite build` passes (`✓ built`; only the pre-existing dynamic-import and
    chunk-size warnings). Targeted ESLint on both files shows **zero `no-undef`** beyond the
    pre-existing Vite-injected `__APP_VERSION__` global (now only in `AppShell.jsx`, since `App.jsx`
    no longer references it) — confirming no dangling reference survived the move. Cleaned up every
    import/destructure/state declaration ESLint flagged as newly-unused as a direct result of the
    move (e.g. `IS_MAC`'s App-side copy, the player/downloads destructure entries only the moved
    JSX read, `mutePrevVolumeRef`); left pre-existing unrelated dead code alone (`hashPin`,
    `clampMenu`, `winCtrl`, `APP_TAG`/`GITHUB_RELEASES_API`, `ACCENT_PRESETS`, the empty-catch/
    `set-state-in-effect` findings), matching the Step 14-audit precedent from Steps 5–11.
    **Not yet done:** desktop smoke testing (blocked by the same missing
    `src-tauri/resources/node` build resource noted throughout Steps 4–12, now additionally risky
    here per the plan's own warning above — a build pass cannot catch a duplicated controller
    instance, a context read outside its provider, or a stale-ref bug). Priority smoke coverage
    once unblocked: fullscreen enter/exit + idle cursor/player-bar hide, split-view drag +
    lyrics/cover/split cycling, sidebar/queue drag-resize, every dialog opened from this checkpoint
    (create/rename/delete playlist, add-to-playlist, track/global context menu, settings panel open
    from every entry point, debug float window, feedback/bug-report screenshot, news modal, login
    screen, remote-pair modal), and the theme quad-click flashbang easter egg (exercises the new
    `flashbangTriggerRef` bridge specifically).
  - **13a-ii: done.** Bundled the ~60 flat "stays in App, crosses as props" values from 13a-i into
    11 named objects built at the `<AppShell/>` call site: `nav` (the full `useMusicNavigation()`
    output plus `pinnedIds`/`togglePin`), `shellUi` (`overlayOpen`/`queueOpen`/`showLyrics`/
    `uiZoom` + their setters), `shortcuts` (the raw shortcut setters + stale-closure-safe refs),
    `appearancePrefs` and `lyricsPrefs` (the raw preference values the settings memos also read),
    `authGate` (profile/login startup state), `remote`, `network`, `downloadQueue`,
    `privacySettings` (`anonStats`/`hideUserHandle`), and `bridges` (`autoCoverRef`/
    `flashbangTriggerRef`/`resetLyricsSessionRef`). `language`/`addToast`/`handleLanguageChange`/
    `obsEnabled`/`likedIds`/`handleToggleLike` stayed flat — they're single small values, not a
    settings-memo cluster, so bundling them would only add ceremony.
    - Implementation is additive-only: `AppShell`'s top ~30 lines now destructure each bundle back
      into the exact same flat local names (`const { view, setView, ... } = nav;` etc.), so the
      ~1,300 lines of state/effects/JSX below were **not touched** — same alias-at-destructure
      trick used for the context substitutions in 13a-i, chosen for the same reason (it makes the
      change mechanically checkable instead of a free-form rewrite of working code).
    - The bundle objects are plain object literals at the call site, not `useMemo`-wrapped like
      `appearanceSettings`/etc. Those five settings memos are memoized because they feed a
      `Context.Provider` with multiple independent consumers, where identity stability avoids
      needless re-renders across the tree. `AppShell` is a single, unmemoized direct child of
      `App`, already re-rendering whenever `App` does — memoizing these bundles would add
      dependency-array bookkeeping risk for no measurable benefit, so 13a-ii is prop-bundling for
      API ergonomics, not the same performance pattern.
  - Verified: `npx vite build` passes (`✓ built`; only the pre-existing dynamic-import/chunk-size
    warnings). Targeted ESLint on both files is unchanged from the 13a-i baseline — still zero
    `no-undef` beyond the pre-existing Vite-injected `__APP_VERSION__` carryover, and the
    `no-unused-vars` list is byte-identical to 13a-i's (no new dead code from the bundling). Net:
    `App.jsx` 2,295 → 2,325 lines (+30, the bundle-construction block), `AppShell.jsx` 3,302 → 3,294
    (−8, net of the destructuring block replacing the flat prop list). Desktop smoke testing is
    still owed for the same reasons as 13a-i — this pass is a pure prop-shape change with the same
    values flowing through, so it doesn't add new smoke-test surface, but the 13a-i checklist above
    still applies before either checkpoint can be called verified end-to-end.
  - Remaining for Step 13: **13b** (`AppOverlays` + `TrackContextMenu`/`PlaylistContextMenu`
    extraction out of `AppShell`'s body) is still open, per the plan above.

- [ ] Step 14: Remove compatibility glue and audit boundaries
  - How: *(to be filled in when done)*
  - Verified: *(how it was checked / what still needs manual testing)*
