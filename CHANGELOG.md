# Changelog

All notable changes to Kodama (formerly Kiyoshi Music) are documented here.

---

## [Unreleased]

> Changes landing after the latest release accumulate here.

## [1.0.0-alpha.30] — 2026-07-14

### Added
- **YouTube brand account login** — switch to a brand/channel account during sign-in instead of always landing on the default Google account.

### Changed
- **Overlay editor overhaul** — Figma-style inspector (prefix fields, per-corner radius), a built-in color picker, refined canvas interaction (hover outlines, multi-select, resizable panels, proper dropdown menus).
- **Account switching** now shows a loading overlay instead of a blank flash.
- Settings sub-navigation unfolds with a subtle animation instead of a hard cut.

### Fixed
- **Home feed** no longer gets stuck on "No suggestions available." after a slow app start — it retries automatically, and now offers a direct refresh button.
- Overlay editor's live preview now always reflects the currently playing track.

## [1.0.0-alpha.29] — 2026-07-11

### Added
- **More reliable playback** — a proof-of-origin token path lets the app fetch many tracks that previously failed with *"not available"*, a Premium wall, or a *"confirm you're not a bot"* check.
- **Search overhaul** — a mixed *All* results view, a **Playlists** tab, live autocomplete, and paste a playlist link (including unlisted "link only" ones) to open it directly.
- **Share playlists** — copy a YouTube Music / YouTube link for a whole playlist from its menu.
- **Visualizer presets** — save, import and export visualizer setups (plus a reset-to-default).
- **Anonymous usage stats** — an opt-out active-user counter (rotating token, no personal data).
- **Quick actions** — track numbering, start a playlist shuffled, and add-to-queue / play-next / start-radio in the track menu.

### Changed
- **Loading spinner** in the player bar while a track resolves.
- **Higher-resolution cover art** in the player.

### Fixed
- **Google sign-in on macOS** no longer blocked with *"browser may not be secure"* (thanks @SchmidtiTv).
- **Audio crackle** at the very start of playback.
- **Search "0 songs"** on some playlists and a playlist-cache glitch.

## [1.0.0-alpha.28] — 2026-07-07

### Fixed
- **Last.fm now works in installed builds** — scrobbling and loving tracks were unavailable in the packaged app (Last.fm showed *"Not configured"*), even though it worked in development. The credentials are now bundled correctly.

## [1.0.0-alpha.27] — 2026-07-06

### Added
- **Delete effect** — Removing a song from the queue, a song from a playlist, a history entry or an entire playlist now dissolves it into a little burst of particles tinted from its cover art (respects the animations setting).
- **Remote control — device names & remembered devices** — A paired phone now shows a real device label (the Android model where the OS still exposes it, otherwise a name you can set on the phone), and you can mark a device as *remembered* so it stays paired across app restarts. Pairing was redesigned into a dialog with the QR code plus a cleaner approve / deny prompt.

### Changed
- **Composer redesign** — The bundled lyrics Composer was reworked on HeroUI with a unified header/tab bar and a custom title bar (borderless windows), and its ~90 icons migrated to Font Awesome to match the Kodama style.
- **Internal** — The frontend's monolithic `App.jsx` was split into ~20 focused modules (no behavior change), and the in-app version is now read from the build config so it can never drift from the shipped version again.

### Fixed
- **"What's New" now loads in packaged builds** — the news feed was blocked by the app's Content Security Policy, whose allow-list had drifted out of sync between the two places it is defined.
- **"Add to playlist → New playlist" no longer creates an empty playlist** — the selected song(s) are now actually added to the freshly created playlist (from the track menu, the player's ⋮ menu and multi-selection alike).
- **Removed an occasional ~15 s playback stutter** — the OS media controls were re-uploading the cover art on every refresh; now only the playback position updates between track changes.
- **Remote control no longer causes a periodic stutter** while it is enabled.
- **History entries can be removed again**, and removing a song from a playlist updates the list smoothly instead of briefly flashing a loading placeholder.

## [1.0.0-alpha.26] — 2026-06-28

### Added
- **Song sharing** — Share any song via link from the track menu or the player's ⋮ menu: a universal link (opens the song in Kodama if installed, otherwise YouTube Music), a direct Kodama deep link (`kodama://`), or plain YouTube Music / YouTube links. The universal link opens a small landing page showing the cover, title and artist.
- **Custom app icons** — Personalize the app icon (taskbar, window, tray, macOS Dock) from a set of Default and Pride variants in Settings → Appearance.
- **OS media controls** — Play / pause / next / previous now work from the Windows media overlay (SMTC), macOS Now Playing and Linux MPRIS, including keyboard media keys.
- **Per-transition crossfade** — Set a custom crossfade length for a specific song-to-song transition (right-click a song in the queue), on top of the global default.
- **Progressive playback** — Songs start playing while still loading for a faster start; can be switched back to classic full-download in Settings for weaker devices.

### Changed
- **Crossfade rebuilt** — Crossfade now runs in the audio core (two simultaneous sinks) instead of a separate hidden player, so it is captured by OBS and the visualizer and blends correctly.
- **UI polish** — Hover effects across buttons, lists and menus are now translucent overlays; the search bar and Speed Dial use a frosted-glass style.

### Fixed
- Faster song loading — a single growing buffer instead of repeated reconnects, plus prewarming of upcoming queue tracks.

## [1.0.0-beta.1] — 2026-06-21

> First public **Kodama** beta (Closed Beta). The app was rebranded from Kiyoshi Music and
> rebuilt on Tailwind CSS v4 + HeroUI 3 — this consolidates the full 1.0 rework to date.

### Added
- **FFmpeg auto-update** — On startup the app now quietly checks gyan.dev for a newer FFmpeg
  release than the one installed; if there is one, a small non-blocking banner offers to update
  it in place (with a progress bar). The check is cached and a dismissed version won't nag again.
  Previously FFmpeg was only ever fetched once at first run and never refreshed.
- **Ambient Background (experimental)** — A new opt-in toggle (Settings → Appearance) that
  uses the playing track's heavily-blurred cover as the backdrop for the whole app — behind
  the sidebar, content and player — for a cohesive, immersive look. The lyrics/cover view and
  the seek/volume bars turn translucent so the cover shows through seamlessly. Off by default.
- **Fluid Lyrics (experimental)** — A new opt-in toggle (Settings → Lyrics) for the synced
  lyrics view: a soft spring-based scroll, a gentle pop on the active line, an elastic
  "rubber-band" drift of the surrounding lines, a top/bottom edge-fade, a glow that trails
  the sung part of the current word, dimmer upcoming lines, and a strongly blurred album
  cover as the backdrop. Off by default.
- **What's-new feed** — A news modal (profile menu → "Neuigkeiten") shows announcements pulled
  from a remote `news.json` hosted next to the updater feed, so news can be published just by
  editing that file. Unread entries are tracked locally and surfaced with a dot on the profile
  avatar and a count in the menu.
- **Bug-report tool** — A "Fehler melden" dialog (profile menu) lets testers send a title,
  category and description; the app version, OS and (optionally) the most recent backend log
  lines are attached automatically. The local backend forwards the report to a Discord webhook,
  so reports from the closed beta land in one channel. No account data is sent.
- **Audio visualizer** — The cover view now has a real, audio-reactive spectrum visualizer.
  Audio is decoded natively in Rust, so there's no Web-Audio analyser available — instead the
  Rust side runs an FFT on the played samples and streams the spectrum to the UI, which draws
  it on a canvas in sync with the music. A dedicated **Visualizer** settings tab (with a live
  preview at the top) exposes the full configuration: three shapes (**Frame** hugging the
  cover, **Ring**, **Linear** placed over the seek bar or behind the cover), mirror, bar
  count / length / thickness / gap, responsiveness, floor / ceiling, tilt, band smoothing,
  bars-vs-curve rendering, peak-hold, colour (accent / from cover / custom), gradient, and an
  adjustable **cover-pulse** that scales the artwork with the beat.
- **Dynamic app accent** — Besides a fixed accent colour you can now pick **Dynamic**
  (Settings → Appearance), which derives the app accent live from the current track's cover
  art and cross-fades smoothly on every song change. Two sliders (**Vibrancy** and
  **Brightness**) tune how the colour is normalised so it stays legible on every theme.
- **Instrumental cover** — In the lyrics view, longer instrumental passages (intro, breaks,
  outro) now automatically cross-fade to the cover + visualizer and back shortly before the
  vocals return, reusing the existing lyrics/cover transition. Toggleable in the Visualizer
  settings; a manual view switch always takes precedence.
- **Combined split view (fullscreen)** — In fullscreen the view button now cycles
  **Lyrics → Cover → Split**, where Split shows the cover/visualizer on the left and the
  lyrics on the right. In the narrower split pane a linear visualizer automatically keeps its
  natural bar spacing instead of cramming the bars together.
- **Lyrics browser** — The source badge in the lyrics view is now clickable and opens a
  browser of every available lyrics version for the song — across all providers and,
  for [Unison](https://github.com/better-lyrics/unison), every community submission.
  Each entry shows its source, submitter, an accurate sync-type badge (syllable / word /
  line, detected from the actual lyrics) and a preview; picking one applies it and is
  remembered per song.
- **Unison community: identity, voting & reporting** — You can create or import a Unison
  identity (an ECDSA P-256 key, fully interchangeable with the Better Lyrics extension —
  export/import the same key file), shown under Settings → Lyrics. With an identity you
  can up/downvote Unison lyrics versions and report wrong or badly-synced ones, directly
  from the lyrics browser. All write requests are signed locally; the private key never
  leaves the app. You can also set a **custom nickname** (3–20 letters, numbers or
  underscores) as your public display name, or reset it back to the key-derived pet name.
- **Contribute lyrics via the embedded Composer** — "Open Composer" (in the lyrics
  browser, and when a song has no lyrics) opens Boidu's Composer in its own Kodama
  window, pre-filled with the current track. Kodama acts as the Composer's local audio
  bridge, so the song's audio loads automatically through Kodama's own extractor — no
  separate bridge install and no manual setup. The Composer is now a **locally vendored,
  built-in copy** (AGPL-3.0, compatible with Kodama's GPL-3.0) served from Kodama's own
  backend instead of the public website — same origin as the bridge (no CORS), works
  without depending on the live site, and can be customised at the source over time.
- **Composer now feels like part of Kodama** — Building on the vendored copy, the Composer
  window's chrome was reworked to match Kodama: its header, tab bar and title bar are
  merged into a single row, the section tabs are real HeroUI controls (segmented, with
  separators) themed to your accent, and the window has its own custom title bar (drag,
  minimise / maximise / close) instead of the OS one. Both the Composer and the main
  window are now borderless without the stray Windows accent edge. Opening the Composer
  also pauses Kodama's own playback so you don't hear both at once. Every dialog in the
  Composer (settings, help, confirmations, lyrics import, …) now uses HeroUI too, matching
  Kodama's dialogs — and the window controls stay clickable over an open dialog. The
  Composer's player bar was redesigned in Kodama's style — cover art plus the track title
  and artist on the left, with a Kodama-style seek bar — and the shown title is now the
  real song title instead of the YouTube video ID. The Import screen also gained a
  **Remove-track** button (with a confirmation dialog and an opt-in to also clear the
  lyrics), so a wrongly-loaded track can be unloaded and replaced.
- **"Add to playlist" dialog** — Adding songs to a playlist now opens a dedicated dialog
  with a search field and richer rows (cover art, title and track count per playlist)
  instead of a small nested menu. It's shared by the track context menu and the
  multi-selection bar, has a "New Playlist" shortcut, and confirms with a toast.
- **Lyrics provider: Unison by Better Lyrics** — Community-contributed lyrics from
  [Unison](https://github.com/better-lyrics/unison) are now available as a provider
  (enabled by default, positioned after Better Lyrics). Lookup prefers the YouTube video
  ID for an exact match and falls back to fuzzy search by title + artist, so songs with
  multi-artist credits (e.g. "Wuthering Waves, jixwang. & VISION SOUND") are found even
  when the Unison entry only lists the primary artist. Supports TTML (syllable-sync), LRC
  (line-sync), and plain text. The source badge in the lyrics view shows the submitter's
  Unison display name alongside the provider name (e.g. `Unison · StudioLegatoFunk`).
- **Overlay Editor — standalone window** — The Overlay Editor is now opened in its own
  dedicated window (Settings → Overlay → "Overlay Editor öffnen"). If the window is
  already open, clicking the button focuses it instead of opening a second one. The editor
  runs in a lightweight app instance with no audio-player or backend-connection side
  effects, which prevents the flicker between "no track" and the live track data that
  occurred when the editor shared the main app's initialization.
- **Overlay Editor — local system fonts** — A "Lokal installiert" category in the font
  picker lists all fonts installed on the system (read from the Windows Registry). Local
  fonts are lazy-loaded the first time the picker is opened and are deduped against the
  built-in font list.
- **Overlay Editor — menu bar** — A transparent menu bar above the canvas provides
  File / Edit / View menus (new design, undo/redo, duplicate, delete, lock/unlock,
  show/hide, zoom controls, layers panel toggle) and a quick "New Design" button.
- **Last.fm integration** — Connect your Last.fm account (Settings → Playback → Connection)
  to scrobble what you listen to (Now Playing on start, scrobble past 50% / 4 min) and to
  sync your likes with Last.fm "Loved Tracks". Auth uses the desktop flow; the session key is
  stored per profile.
- **Account settings — overview & tools** — The Account tab now shows a statistics card
  (total app usage time, total song playtime, liked songs, playlists, history count),
  quick links to YouTube Music and the Google account (for signed-in accounts), a "Clear
  playback history" action, an option to hide the @username in the sidebar, and the ability
  to set a custom profile picture for local accounts.
- **Lyrics: syllable zoom** — Each word/syllable now does a smooth, gentle zoom as it
  becomes active (growing slightly toward the right), adding a subtle karaoke feel to
  word-synced lyrics. The zoom duration follows each syllable's length, and the effect
  can be toggled under Settings → Lyrics (off by default).
- **Download queue — cancel & minimize** — Each download batch now has a cancel button,
  and the whole queue panel can be collapsed to a compact header (with an overall
  progress count) via a minimize toggle.
- **Home — Speed Dial** — A paginated 3×3 grid of quick-pick recommendations sits at the
  top-right of the home page, next to the "Listen again" row. Album art fills each tile with
  the title and artist overlaid in the bottom-left corner; arrow buttons (and dots) page
  through the picks, and the grid keeps a constant height even on a partially-filled last page.
- **Home — podcasts are playable** — Podcast shows and episodes from the home feed
  ("Shows for you") are now recognised and playable. Clicking a show loads its episodes and
  starts playback from the first one. A new backend endpoint fetches podcast metadata and
  episodes.
- **Home — Moods & Genres** — The full Moods & Genres browser now lives at the bottom of the
  home page with three groups (For you / Moods & moments / Genres) selectable via a segmented
  control. Selecting a category loads its playlists, albums and artists inline.

### Changed
- **Overlay Editor — Figma-style rework** — The OBS overlay editor was rebuilt into a proper
  three-pane editor: a full-width top bar (logo menu, title, save/refresh/undo/redo/widget
  browser), a docked left layers panel and a docked right inspector, replacing the old floating
  glass panels. The standalone editor window is now borderless with a custom title bar matching
  the rest of the app. The inspector was reorganised Figma-style — Position (align icons, X/Y,
  rotation, flip H/V), Layout (W/H + lock aspect), Appearance (opacity, blend mode, per-corner
  radius), and add/remove **lists** for Fills, Strokes and Effects. New capabilities on the
  render engine: multiple fills per layer, multiple strokes (with shared weight + inside/
  center/outside position), per-fill/stroke opacity, blend modes, horizontal/vertical flip, and
  effects as a stackable list (drop shadow / glow / blur). Existing designs migrate automatically.
  Elements are now added from a Figma-style floating toolbar at the bottom of the canvas (with a
  shape-variant dropdown) using real drawing tools — pick a tool and drag on the canvas to draw
  the element at any size/position, then it reverts to the select cursor (Esc cancels).
- **Queue panel reworked** — The queue/now-playing panel was rebuilt on Tailwind + HeroUI:
  HeroUI segmented tabs, buttons, an *About song* card and an *Up next* count chip; a
  smooth HeroUI scroll-shadow fade at the list edges; and a redesigned, frosted **Scroll to
  top** pill. The panel is now **drag-resizable** (like the sidebar; 320–620 px, remembered),
  with the cover/lyrics view tracking its width. Drag-and-drop was fixed (off-by-one on
  downward drops) and improved — the whole row is draggable, already-played tracks can be
  reordered too, and a drag no longer triggers playback. New: a per-section *clear played*
  action. The slide-in/out is now compositor-driven (transform instead of layout), and in
  Ambient mode the panel turns to frosted glass once it settles.
- **Renamed to Kodama** — The app is now called **Kodama** (こだま) — the Japanese word for
  *echo* and the name of the gentle tree spirits of folklore, fitting the ghost mascot whose
  eyes double as a pause symbol. The display name, window/tray titles, logo wordmark and all
  references were updated, and the version was bumped to **1.0.0**. The internal data folder
  moved from `dev.kiyoshi.music` to `dev.kodama.music`; a startup migration carries existing
  profiles, downloads and caches over automatically. *Note:* on upgrade, pinned/recent sidebar
  playlists and a few local UI preferences (stored in the webview) may need to be set once more.
- **Languages — machine translations removed** — The machine-translated UI languages were
  removed; only human/community-translated languages remain (English, German, toki pona for
  now). The language picker now shows a translation-progress bar for each language that isn't
  fully translated, so community-contributed languages appear with their real completion as
  they come in via Crowdin. Each language can also credit its translators.
- **Design foundation** — The interface is being rebuilt on Tailwind CSS v4 + HeroUI 3,
  replacing thousands of inline styles and runtime-injected CSS. This permanently fixes
  the class of production-only styling/animation issues and brings consistent theming.
- **Sidebar, player bar, and menus** rebuilt on the new HeroUI component set (navigation
  list, search field, playback controls, seek/volume sliders, the "More" (⋮) and sleep
  menus) for consistent sizing, focus states, and theming.
- **Settings — Playback & Accessibility tidied up** — the Playback tab is now grouped into
  "General" and "Connection" sections (and its duplicate heading was removed), and "Close to
  Tray" moved to Accessibility under a new "Behaviour" section.
- **Settings — Appearance tab** rebuilt on HeroUI: toggles use the new Switch, sliders use
  the new Slider, every setting row and the theme preview cards are now HeroUI cards, and the
  accent-colour picker was rebuilt from HeroUI colour components (swatches, saturation/brightness
  area, and a hue slider).
- **Settings shell** rebuilt on HeroUI — the settings navigation rail (tab list, back
  button) and the panel's close button now use the new components, and the settings
  sidebar background is transparent to match the main sidebar. While settings are open,
  the main sidebar and the player bar are hidden so the settings view stands on its own,
  and the panel extends to the bottom edge.
- **Notifications (toasts)** rebuilt on the new design system and repositioned to sit
  cleanly above the player bar instead of overlapping it.
- **Download queue** redesigned to match the new notification style, with a loading
  spinner and a progress bar showing an exact track count (e.g. "38 / 100").
- **Cover view — artwork quality** — Album art in the full-screen cover view now loads
  at a higher resolution; smaller artwork sizes are kept everywhere else.
- **Cover view — long titles** — Track titles and artist names are now shown in full and
  wrap onto multiple lines instead of being cut off with an ellipsis.
- **Home page** rebuilt on HeroUI — a centred hero greeting with a time-of-day icon that
  slides in on load, all carousels rebuilt on HeroUI ScrollShadow with soft edge fades that
  smoothly animate in/out, tiles wrapped in HeroUI cards, loading states using HeroUI
  skeletons, and the Moods & Genres group selector and category filters using HeroUI
  toggle buttons. Carousel scrollbars only appear on hover and line up with the content.
- **Home — night greeting reworded** — The late-night greeting is now "Hello night owl"
  ("Hallo Nachteule") instead of the placeholder "Good Night".
- **Lyrics — performer tags & source badge on HeroUI** — Both are now HeroUI chips with a
  frosted-glass look. The active performer is highlighted in a translucent accent colour, and
  the source badge shows the provider plus the submitter name. To make the frosted blur work
  over the lyrics, the ambient colour blobs are now rendered in an isolated layer (their
  blend mode previously flattened the backdrop and disabled the blur).
- **Lyrics — auto-hiding chrome** — The scrollbar and the source badge now fade away when the
  cursor is idle or leaves the view, and reappear on movement (the source badge slides in/out).
  The source badge also reveals itself briefly when lyrics finish loading. Both linger shortly
  before hiding instead of snapping away. The scrollbar no longer flashes during automatic
  line-by-line scrolling.
- **Lyrics / Cover view — open & close animation** — Expanding and collapsing the view now uses
  a smooth slide without the previous bouncy overshoot.
- **Fullscreen — player bar slides** — In fullscreen the player bar now slides down/up instead
  of fading, and the lyrics chips (source badge, performer tags) lift above the bar while it's
  visible instead of hiding behind it.
- **Artist page** rebuilt on HeroUI — a larger, more immersive hero banner with a prominent
  action row (Play, Shuffle, Subscribe, Radio) as HeroUI buttons, the back/pin controls as
  icon buttons, and the section "Show all" buttons, loading skeletons and carousel scrollbars
  all on the new design system. The artist's short description sits in a glassy card in the
  upper-right with a HeroUI modal for the full text, and a "View on Wikipedia" button that
  opens the real source article.
- **Artist & Home — shared media tiles** — Album/single/video/artist tiles now use one shared
  tile component, so the artist page behaves exactly like the home page: cover zoom on hover and
  a play button that slides up from the bottom-right and lifts/brightens when hovered directly.
- **First-launch experience on HeroUI** — The language picker, login screen and one-time
  FFmpeg setup screen were rebuilt on HeroUI: cards, buttons, the profile-name field, the
  progress bar and the waiting spinner now use the new components. The FFmpeg setup screen,
  which was previously hard-coded in German, is now fully localised (English, German, toki
  pona) while keeping its branded dark boot look.
- **Context menus on HeroUI** — The right-click menus for playlists/albums (sidebar, tiles)
  and for tracks were rebuilt on the HeroUI dropdown components — proper keyboard navigation,
  focus handling, grouped sections and consistent theming, anchored at the cursor. Their
  size now scales with the app zoom level.
- **Dialogs on HeroUI** — The "Create playlist", "Rename playlist" and "Delete playlist"
  dialogs were rebuilt on the HeroUI modal components, matching the other dialogs. A stale
  duplicate of the profile switcher (with its own inline confirmation) was removed.

### Fixed
- **Lyrics didn't reset to the top on song change** — The synced-lyrics view kept the previous
  song's scroll position (and, for a cached track that rendered instantly, could jump to a
  mid-song line) instead of starting at the top. Switching songs now snaps back to the top and
  resets the scroll/spring and time-sync state cleanly.
- **Dialogs hidden behind the settings panel** — Confirmation dialogs opened from inside
  Settings (e.g. removing an account, clearing playback history) rendered behind the
  settings panel and were invisible. Modal dialogs now layer above it correctly.
- **Login session expiring after a few hours** — A YouTube server-side change (around
  Aug 2025) started rejecting stale anti-bot cookies, which logged users out every few
  hours and forced a re-login. The backend now periodically fetches fresh
  `__Secure-1PSIDTS`/`__Secure-3PSIDTS` tokens and feeds them back into the live session,
  keeping the login valid. (OAuth was evaluated as an alternative but is fundamentally
  incompatible with YouTube Music's internal API — it authenticates but cannot fetch data —
  so browser-cookie auth remains the only working method.) ytmusicapi was pinned to 1.12.1.
- **PIN keypad invisible in the light theme** — The lock-screen PIN dots, keypad and password
  field used hard-coded white styling, making them nearly invisible on the light theme. They are
  now theme-aware and render correctly in all themes.
- **Discord Rich Presence not showing for video audio** — Tracks with sparse metadata (empty
  artist, or a title longer than Discord's 128-character limit) were silently rejected by
  Discord. Fields are now clamped to 128 characters and empty ones are omitted, so plain
  video audio shows up too.
- **Lyrics: handed-over line snapping to white** — With word/syllable-synced lyrics, when
  a new line begins before the previous one has finished, the previous line now completes
  its remaining syllable highlight animation smoothly instead of jumping straight to fully
  highlighted.
- **Home — genre categories returned nothing** — Selecting a Genre (e.g. "German hip-hop")
  loaded no results because the underlying library threw on genre category pages. The backend
  now parses those pages directly, so genres return their playlists, albums and artists.
- **Custom lyrics caused the app to reload (dev only)** — Importing or removing manually
  imported lyrics wrote files into the project directory, which the dev server's file watcher
  picked up and triggered a full page reload. The watcher now ignores the backend directory.
- **Lyrics — main line filled instantly when background vocals started** — Main and background
  vocals shared a single karaoke progress index, so the main line jumped to fully sung the
  moment the background line began. They are now tracked as independent sequences, and the
  main line finishes its syllables normally.
- **Lyrics — right-aligned active line shifted left** — A trailing space in the word data made
  word-synced (active) lines sit slightly off the right edge while the inactive plain-text
  version stayed flush. Trailing spaces are now trimmed so right-aligned lines stay flush in
  both states.
- **Artist page — Wikipedia source link recovered** — The artist description ended with a
  dangling "From Wikipedia (" because the library kept only the first text run and dropped the
  link run holding the URL. The backend now reads the real source URL from the raw description
  runs, so the "View on Wikipedia" button opens the correct article (with a name-based Wikipedia
  search as a fallback).

### Removed
- **Settings: "Quit App" button** — Removed from the settings sidebar footer (quitting is
  still available from the profile menu in the main sidebar).
- **Lyrics: instrumental gap overlay** — The blurred backdrop and floating music note shown
  during instrumental pauses between lyric lines has been removed (for now).

---

## [0.9.40-beta] — 2026-06-02

> **Note — last stable release for now.** This is the final planned release on the
> current codebase for the time being. A larger UI rework is in progress: the
> interface is being rebuilt on a proper design foundation (Tailwind CSS, later
> HeroUI) to permanently resolve the class of production-only styling and animation
> issues addressed below. Expect a quieter period on the release feed while that
> work happens — this version is intended to be a solid, stable base to sit on in
> the meantime.

### Bug Fixes
- **Songs not loading in the production build** — yt-dlp stream extraction mixed
  mobile-client request headers with web session cookies, which triggered YouTube's
  bot detection and produced "Requested format not available". Authenticated requests
  now use web clients only, while anonymous fallbacks use mobile clients only, and
  never combine the two. New `mweb` client and a `youtube.com` fallback path improve
  resilience.
- **Icons rendered as blank squares** — Font Awesome fonts are now embedded as
  base64 data URIs in the bundled CSS. WebView2 blocks font loading from the
  `tauri://` protocol regardless of Content-Security-Policy, which left icons
  unrendered in the installed build.
- **Player-bar buttons squished together** — The `.icon-btn` sizing rule (the 32×32
  button box) lived in a runtime-injected `<style>` block that did not apply on first
  paint in the release build, collapsing the bottom-right controls (volume, queue,
  lyrics, fullscreen) to bare icon size. The full button definition now lives in
  bundled CSS so it is guaranteed to be present at first render.
- **Native button styling leaking through** — The browser button reset (transparent
  background, no border) was likewise moved into bundled CSS, fixing grey/white
  native button chrome appearing over icon buttons in the installed build.
- **Page-transition slide-in animations not playing** — The `fadeSlideIn` /
  `fadeSlideOut` keyframes were moved out of the runtime-injected style block into
  bundled CSS, so page-change slide-in transitions now play reliably in production.
- **Cryptic error on "Liked Songs" when signed out** — When a YouTube session
  expires, YouTube Music returns a signed-out response that the underlying library
  could not parse, surfacing a raw `twoColumnBrowseResultsRenderer` stacktrace. The
  app now detects this case and shows a clear "Session expired — please sign in
  again" message instead.

---

## [0.9.35-beta] — 2026-05-15

### Bug Fixes
- **Bot-detection fix (yt-dlp)** — Stream extraction now tries installed browser cookies first (Chrome, Edge, Firefox, Brave, etc.) before falling back to app session cookies. Browser cookies include a fresh `__Secure-1PSIDTS` anti-bot token which prevents "Sign in to confirm you're not a bot" errors for newly released songs.
- **YouTube cookie refresh** — The app session now periodically pings `www.youtube.com` to keep the `__Secure-1PSIDTS` token valid for yt-dlp stream extraction (previously only `music.youtube.com` was pinged, which uses a different token scope).
- **Release updater signature** — The release workflow now correctly falls back from `.nsis.zip.sig` to `.exe.sig` when building with `--bundles nsis`, ensuring `latest.json` always contains a valid Tauri updater signature.

---

## [0.9.34-beta] — 2026-05-15

### Bug Fixes
- **Page transition animations** — Added `fill-mode: both` to the `fadeSlideIn` animation so the element starts fully transparent from the very first rendered frame; removes any single-frame flash and makes the animation reliably visible.
- **Release workflow** — Pre-create the GitHub draft release (using `gh release create`) before the tauri-action build step; tauri-action then uploads assets to the existing release via `releaseId`. This eliminates the race condition where GitHub's API had not yet associated the pushed tag, causing releases to appear as `untagged-<hash>` entries.

---

## [0.9.33-beta] — 2026-05-15

### Bug Fixes
- **Icons missing after update** — Font Awesome fonts were loaded via relative URLs (`../webfonts/`) from `public/css/all.min.css`, which Vite does not process. In WebView2's embedded filesystem this resolution failed silently. The three critical font files (Solid, Regular, Brands) are now loaded through Vite's asset pipeline — identical to how MiSans and OpenDyslexic are handled.
- **Font Awesome CSS now loads synchronously** — Removed the `media="print"` / `onload` non-blocking trick. In desktop apps assets are embedded so there is no latency penalty; the trick could however fail silently in certain WebView2 contexts.
- **Release workflow fixed** — `github-script`'s `createRelease()` had a timing race between tag push and GitHub API availability, producing releases with `untagged-<hash>` tag names instead of the real git tag. Switched to `tauri-apps/tauri-action`'s built-in release creation which handles tag resolution correctly.
- **`Update latest.json` workflow** — Tag input is now required (no more auto-resolve via `gh release list --limit 1`) and the tag is validated against semver format before processing. Prevents `vuntagged-...` versions that crash the in-app updater.

---

## [0.9.30-beta] — 2026-05-14

### UI / Design
- Design Overhaul-Update:
  - Sidebar nav items: radial cursor-follow glow effect via `--rx`/`--ry` CSS variables
  - New `.sidebar-glow` CSS class for buttons with dropdowns (no `overflow: hidden`) — applied to Profile, Settings and OBS Overlay buttons
  - New Playlist button in sidebar now matches nav item style with hover glow
  - Queue panel: sliding pill tab bar with animated active indicator, Trash icon button for clearing the queue (opacity-hidden on About tab to preserve pill width)
  - Queue rows: Fluent surface tokens, accent-dim active state, consistent thumbnail radius
  - Play/Pause button icon color changed to `--bg-surface` for legibility on accent background
  - Home page Quick Picks: three-dots menu button now has a proper 26×26 button box with surface hover state
  - Cache settings: modernised layout with toggle and Clear button positions swapped; label updated to "Total Cache Usage"
  - Debug menu: full Fluent Design modernisation with surface tokens and consistent spacing
  - Debug floating window: fixed initial height so it doesn't overflow the app window

### Removed
- Separator line below Queue panel pill tab bar

---

## [0.9.24-beta] — 2026-04-28

### Removed
- **Linux support has been dropped from the main branch.** After 9 unsuccessful attempts to fix the AppImage white-window issue on Steam Deck (KDE Wayland, AMD Mesa 25.3 vs our bundled libwebkit2gtk's expectations), official Linux support is no longer provided.
  - Linux build job removed from CI (no more AppImage / .deb produced)
  - Linux-specific environment variables removed from `main.rs`
  - Linux bundle config removed from `tauri.conf.json`
  - Diagnostic Linux library checks removed
  - Linux-specific server-binary search paths removed from `server.rs`

  Users who want Linux support can fork the repository and re-add the build pipeline (the historical Linux work-in-progress is preserved in the git history through v0.9.23-beta).

---

## [0.9.23-beta] — 2026-04-28

### Bug Fixes (hopefully)
- **Linux AppImage white window — root cause identified** — Steam Deck runs Mesa 25.3.0 (bleeding edge). The previous build runner was Ubuntu 22.04 with Mesa 22.x. Our bundled `libwebkit2gtk-4.1` was compiled against the old Mesa and called EGL with parameters that newer libEGL versions reject (causing `EGL_BAD_PARAMETER`). **Build runner upgraded to `ubuntu-24.04` which has Mesa 24.x — much closer to Steam Deck and modern Linux distros.**
- **Cleaned up the env-var soup** — removed verbose debug flags that produced no useful output. Kept only the essential rendering flags.

### CI
- **Releases now stay as drafts** — manual review + publish in GitHub UI required. New `update-latest-json.yml` workflow can be triggered manually after publishing to refresh the auto-updater.

---

## [0.9.22-beta] — 2026-04-28

### Diagnostics
- **Verbose EGL/WebKit/Mesa logging** — v0.9.21 confirmed Steam Deck has libEGL/libGL but no system webkit2gtk (we use the bundled one). Same EGL_BAD_PARAMETER regardless of whether libEGL is bundled. This is now a WebKit platform identifier issue. New env vars: `WEBKIT_DEBUG=Compositor,Layers`, `LIBGL_DEBUG=verbose`, `EGL_LOG_LEVEL=debug` to capture the negotiation. Plus `/dev/dri/` listing to verify DRM device access.
- **Forced GDK_BACKEND=wayland** (no x11 fallback) — mixed `wayland,x11` may have caused WebKit to pick x11 and fail.

---

## [0.9.21-beta] — 2026-04-27

### Diagnostics
- **Library inspection on Linux startup** — eight env-var iterations haven't fixed the EGL crash on Steam Deck. The error comes from WebKit's hardcoded `GLDisplay::create()` which calls `CRASH()` if `eglGetDisplay()` fails. New build prints the actual libraries available on the host (via `ldconfig -p`) and what graphics libs are bundled in the AppImage's `usr/lib/`. This will reveal whether: (a) the host is missing required libraries, (b) `LINUXDEPLOY_EXCLUDE_LIST` actually worked or libraries are still bundled, (c) there's an ABI mismatch between bundled and host libs.
- **Cleaned up env-var soup** — removed conflicting/non-functional flags (e.g. `EGL_PLATFORM=surfaceless` which only affects `eglGetPlatformDisplay`, not the legacy `eglGetDisplay` that WebKit uses). Kept only the seven flags that have any chance of being respected.

---

## [0.9.20-beta] — 2026-04-27

### Bug Fixes
- **Linux AppImage white window (8th attempt)** — v0.9.19 confirmed the server now starts correctly and the binary mismatch is fixed, but EGL still aborts. New hypothesis: the "Aborting..." comes from GTK/GDK itself trying to use GL during init, before WebKit even starts. New env vars target GDK directly:
  - `GDK_GL=disable` — disable GDK's GL usage entirely
  - `GDK_DEBUG=gl-disable` — same hint via debug flag
  - `GDK_RENDERING=image` — force CPU-only Cairo image surface rendering
  - `GSK_RENDERER=cairo` — for GTK 4 (in case)
  - `GST_GL_DISABLED=1` — disable GStreamer GL plugins
- **Disabled `bundleMediaFramework`** — was bundling GStreamer GL plugins which try to init EGL on startup. Audio playback uses Rust's rodio, not GStreamer, so this should have no functional impact.

---

## [0.9.19-beta] — 2026-04-27

### Bug Fixes
- **Sidecar binary not found** — The v0.9.18-beta debug listing revealed the binary IS bundled, but Tauri strips the target-triple suffix on Linux: it's bundled as `kiyoshi-server` (not `kiyoshi-server-x86_64-unknown-linux-gnu`). The Rust code was looking for the suffixed name and never finding it. `start_server` now searches for both names — with and without the target-triple suffix.

---

## [0.9.18-beta] — 2026-04-27

### Bug Fixes
- **Linux AppImage white window (7th attempt)** — env-var workarounds didn't fix EGL_BAD_PARAMETER on Steam Deck because the bundled libEGL/libGL/libgbm in the AppImage were incompatible with the host's Mesa drivers. New fix: tell `linuxdeploy` to **exclude** all GL/EGL/DRM/Wayland/X11 graphics libraries from the AppImage via `LINUXDEPLOY_EXCLUDE_LIST`. The AppImage now uses the host system's Mesa drivers — guaranteed compatible with the host's GPU and kernel.
- **Server binary diagnostics** — Recursive walk depth increased from 4 to 8. Added a build-time AppImage content listing step that runs after the AppImage is produced, so we can see exactly what's bundled (helps diagnose where the sidecar ends up, if anywhere).

---

## [0.9.17-beta] — 2026-04-27

### Bug Fixes
- **Linux AppImage white window (6th attempt)** — `LIBGL_ALWAYS_SOFTWARE=1` from v0.9.16-beta wasn't enough — Mesa's EGL platform detection was still failing before the GL driver was selected. New env vars:
  - `EGL_PLATFORM=surfaceless` — bypasses display platform negotiation entirely; EGL never needs to bind to X11/Wayland
  - `MESA_LOADER_DRIVER_OVERRIDE=llvmpipe` — explicit software driver at the EGL/loader level (not just GL)
  - `WEBKIT_DISABLE_HARDWARE_ACCELERATION=1` — belt-and-suspenders WebKit hint
- **Server binary search now walks the AppImage tree** — known paths failed on v0.9.16, so `start_server` now recursively searches `$APPDIR` and the directories above the executable (depth 4) for the sidecar by name, with full diagnostic logging of every path attempted.

---

## [0.9.16-beta] — 2026-04-27

### Bug Fixes
- **Linux AppImage white window (5th attempt)** — Diagnostics from v0.9.15-beta on Steam Deck (KDE Wayland, AMD GPU) revealed `Could not create default EGL display: EGL_BAD_PARAMETER` — WebKit's GPU process was crashing during EGL init. Fixes:
  - Force Mesa software rasterizer via `LIBGL_ALWAYS_SOFTWARE=1` and `GALLIUM_DRIVER=llvmpipe` (slower, but guaranteed to render). Earlier concern about software rendering hurting AMD performance was wrong — when hardware EGL is broken, software is the only option.
  - When GDK_BACKEND was forced to x11 on a Wayland system, prefer `wayland,x11` so EGL gets the native platform first.
- **Sidecar binary search** — The Python server binary (`kiyoshi-server`) was not found at the expected `/usr/bin/` path inside the AppImage. `start_server` now tries multiple locations (`/usr/bin/`, `/usr/lib/`, `/usr/libexec/`, `/usr/lib/kiyoshi-music/`) and logs all attempted paths if it can't find the binary.

---

## [0.9.15-beta] — 2026-04-27

### New Features
- **Library search** — Search field in the Library view (right side of the sort row) filters playlists, albums or artists in real-time; resets on tab change
- **Select All checkbox** — Master checkbox in the playlist/album column header selects or deselects all visible tracks at once (respecting the search filter)
- **Buy Me a Coffee button** — Added to the About page in Settings

### Improvements
- **History view redesign** — Now uses the same hero header layout as Liked Songs (cover art, title, song count, play button, back button); "Clear History" button moved to the action row, right side
- **Liked Songs back button** — Always active and routes to the previous view (or Home if accessed directly via sidebar)
- **Animation toggle** — Now disables ALL transitions and animations globally via a single CSS rule with `!important`; previously many hardcoded transitions were ignoring the toggle

### Bug Fixes
- **Linux AppImage white window (4th attempt)** — Made external CSS/font loads non-blocking (Google Fonts and FontAwesome no longer delay first paint); added HTML-level boot splash that's visible immediately on parse; added `WEBKIT_DISABLE_ACCELERATED_2D_CANVAS=1`, `__GL_THREADED_OPTIMIZATIONS=0` and `WEBKIT_FORCE_COMPLEX_TEXT=0` env vars; added `[kiyoshi]` and `[boot]` diagnostic logging visible from terminal

### Internal
- Suppressed three Rust dead-code warnings (`capacity`, `wait_for_server`, `start_server`) with `#[allow(dead_code)]`

---

## [0.9.14-beta] — 2026-04-21

### New Features
- **About Song tab** — Queue panel now has a toggle between "Queue" and "About Song"; the About Song view shows the full YouTube description (lyrics credits, label, release date, composers, producers) fetched directly from YouTube via the InnerTube API
- **Artist Radio** — New Radio button on artist pages starts an instant radio session based on the artist; styled as a chip next to the Subscribe button
- **Library sorting** — Sort pill buttons below the library tabs: A→Z, Z→A, by artist; album tab additionally offers year (newest/oldest first)

### Improvements
- **Monthly listeners** — Artist page now correctly shows `monthlyListeners` (e.g. 42.9M) instead of total YouTube view count
- **Artist description panel** — Responsive width (`clamp`), no border, positioned independently of the radio/subscribe row to avoid layout conflicts

### Bug Fixes
- **Radio tracks missing album art** — `/radio/` backend endpoint now correctly handles both `thumbnails` (list) and `thumbnail` (string) formats returned by `get_watch_playlist()`

---

## [0.9.13-beta] — 2026-04-18

### New Features
- **Clickable multi-artist links** — Tracks with multiple artists now show each artist as a separate clickable link in the player bar, queue, expanded player and OBS overlay; clicking navigates directly to that artist's page
- **Scroll Speed preview** — Animated preview box in the OBS Overlay settings (between "Scroll Long Titles" and the speed slider) shows exactly how fast the title will scroll at the current setting

### Improvements
- **Contributor profile images** — KiyoshiTheDevil, Grains Of Art and LMary52 now display their real profile pictures in the About tab
- **New Teto artwork** — Updated illustration (Teto_Drinking_Boba) with correct aspect ratio, positioned so she appears to stand on the player bar
- **Additional social links** — Grains Of Art: Linktree; LMary52: TikTok

### Bug Fixes
- **Context menu submenu direction** — "Add to Playlist" submenu now opens to the left when there is not enough space on the right, preventing it from going off-screen
- **OBS overlay stays open on artist click** — Clicking an artist name in the compact player bar no longer closes the OBS overlay
- **Discord Rich Presence** — Rich Presence activity now updates reliably again; fixed regression introduced in v0.9.10-beta

---

## [0.9.12-beta] — 2026-04-18

### Bug Fixes
- **Linux AppImage white window (3rd attempt)** — Added `'unsafe-inline'` to `script-src` in Tauri CSP (WebKitGTK enforces CSP strictly; missing `'unsafe-inline'` can block Tauri's init scripts); unified CSP between `tauri.conf.json` and `index.html` meta tag; added dark `#0d0d0d` body background as HTML-level fallback so the window is never white even if React hasn't mounted yet
- **Reverted `visible: false`** — Made things worse because `appWindow.show()` was never called when JS failed to run

---

## [0.9.11-beta] — 2026-04-18

### New Features
- **Single Instance** — Launching the app a second time now focuses the existing window instead of creating a new process and tray icon

### Bug Fixes
- **Language picker button cut off** — On small viewports or high-DPI displays the language list is now scrollable and the Confirm button always stays visible at the bottom

---

## [0.9.10-beta] — 2026-04-18

### Bug Fixes
- **Linux AppImage white window (2nd attempt)** — Added `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` (correct env var for WebKit2GTK sandbox) and `LIBGL_ALWAYS_SOFTWARE=1` (software OpenGL fallback); window now starts hidden (`visible: false`) and is shown once React has mounted, so the splash screen appears instead of a blank white frame
- **Discord button localisation** — "Listen on YouTube Music" button text is now passed from the frontend and follows the app language setting

---

## [0.9.9-beta] — 2026-04-18

### New Features
- **Contributors in About tab** — Four contributors listed with social link buttons (Twitch, YouTube, Bluesky, Webpage) per card; brand icons via Font Awesome

### Improvements
- **OBS Overlay font picker** — Refresh button next to the local fonts search field; icon spins while reloading
- **Backend stability** — Overlay server thread now catches unexpected exceptions instead of dying silently; completed download/export status entries cleaned up from memory after 5 minutes

### Bug Fixes
- **Linux AppImage white window** — Server startup moved off the main thread; the Tauri event loop is no longer blocked during server startup, fixing the blank window on launch
- **Linux WebKit compatibility** — Added `WEBKIT_FORCE_SANDBOX=0` (required in AppImage) and automatic `GDK_BACKEND=x11` on Wayland for better WebKitGTK rendering

---

## [0.9.8-beta] — 2026-04-17

### New Features
- **Like hearts in playlist rows** — Heart button next to the three-dots in all playlist views (Liked Songs, Collections/Albums, Downloads); shows per-track liked state, toggling syncs to YouTube Music instantly
- **"Like Song" in player more-menu** — Three-dot menu in the player now includes a Like/Unlike toggle for the currently playing track
- **"Like / Unlike" in track context menu** — Right-click context menu on any track now shows Like/Unlike with correct per-track state
- **"Add to Playlist" in player more-menu** — Three-dot menu in the player now supports adding the current track to any playlist

### Improvements
- **App-level liked state** — `likedIds` Set loaded from `/liked/ids` on startup; all views share a single source of truth and update optimistically with automatic rollback on error
- **OBS overlay border rendering** — Rewrote border layer as a sibling `div` with `path(evenodd)` donut clip; transparent widget backgrounds now render correctly without bleed-through
- **OBS overlay bevel border thickness** — Corrected perpendicular distance calculation for 45° cuts (`bw × (2 − √2)`) so bevel borders match straight-edge thickness exactly

### Bug Fixes
- Fixed `isLiked`/`toggleLike` out-of-scope reference in track context menu (was referencing Player-internal state from App scope)
- Fixed stray `onToggleLike` reference in HomeView Quick Picks rows causing a ReferenceError on startup

---

## [0.9.7-beta] — 2026-04-16

### New Features
- **Per-corner mixed corner style** — Widget frame and album art corners can now each be set to *rounded* or *beveled* independently per corner, allowing combinations like round top + beveled bottom
- **Corner preset buttons** — "All Round" and "All Bevel" quick-preset buttons in both the Appearance and Layout tabs for faster setup
- **OBS Overlay custom profiles** — Save the current overlay configuration as a named profile, load or delete saved profiles, export profiles as `.json` files (with native save dialog), import profiles from file, and restore factory defaults
- **OBS Overlay Content sub-tab** — Dedicated tab for visibility toggles: Album Art, Artist, Album, Progress Bar, Auto-Hide, Title Scroll and Scroll Speed

### Improvements
- **Icon refresh (Appearance tab)** — Background, Drop Shadow and Border rows now use matching custom icons; profile action buttons (Save, Import, Export) use Font Awesome icons
- **Icon refresh (Layout tab)** — Width, Height, Vertical Padding, Horizontal Padding, Spacing and Progress Bar Height rows now each use a dedicated icon instead of a generic slider icon
- **Inactive sub-tab labels** — Raised from `--text-muted` to `--text-secondary` for better readability
- **Slider values** — Raised from `--text-muted` to `--text-secondary`; hover still transitions to full `--text-primary`

### Internal
- Added `buildCornerPath(W, H, corners)` — generalised clip-path generator supporting both rounded (Q-Bézier) and beveled (straight-line) cuts on any rectangle size
- Added `FaIcon`, `PubIcon` and `CornerMaskIcon` helper components for consistent icon rendering across the settings panel
- OBS overlay profiles persisted in `localStorage` under `kiyoshi-obs-profiles`
- 9 new SVG icons added to the `public/` folder

---

## [0.9.6-beta] — 2026-04-09

### New Features
- **Built-in OBS Overlay server** — Live Now-Playing widget served directly from the app; no external tools required
- Overlay widget fully configurable via a dedicated settings panel (Appearance, Layout, Typography sub-tabs)
- Supports background blur/opacity, border, drop shadow, album art, scrolling title, progress bar and font customisation

### Bug Fixes
- Fixed `obsEnabled is not defined` runtime error caused by missing props in `SettingsPanel`

---

## [0.9.5-alpha.1] and earlier

Initial alpha releases — core YouTube Music playback, lyrics, Discord Rich Presence, system tray integration, auto-updater, theme engine and language support (German / English).
