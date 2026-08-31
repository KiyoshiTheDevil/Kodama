/**
 * Font Awesome Pro 6.7.2 icon wrappers — drop-in replacement for @phosphor-icons/react.
 *
 * weight prop mapping:
 *   "fill" | "bold" | "duotone"  → fa-solid
 *   "regular" | "light" | "thin" | undefined → fa-regular
 */

import React from "react";

// Dummy context so existing <IconContext.Provider> calls don't crash
export const IconContext = React.createContext({});

function fa(name, alwaysSolid = false) {
  return function FaIcon({ size, weight, className = "", style, ...rest }) {
    const solid = alwaysSolid || weight === "fill" || weight === "bold" || weight === "duotone";
    const cls = `${solid ? "fa-solid" : "fa-regular"} fa-${name}${className ? " " + className : ""}`;
    return (
      <i
        className={cls}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, ...(size ? { fontSize: size } : {}), ...style }}
        aria-hidden="true"
        {...rest}
      />
    );
  };
}

/**
 * Project-drawn icons that live in public/ as SVG files. Rendered through a CSS mask rather
 * than an <img> so they inherit the current text colour like the Font Awesome glyphs do —
 * an <img> would keep whatever fill the file was exported with. Only the shape (alpha) is
 * used, so the fill colour inside the SVG is irrelevant.
 */
function maskIcon(url) {
  return function MaskIcon({ size = 16, weight, className = "", style, ...rest }) {
    return (
      <span
        className={className}
        style={{
          display: "inline-block", width: size, height: size, background: "currentColor",
          WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")`,
          WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          WebkitMaskPosition: "center", maskPosition: "center",
          WebkitMaskSize: "contain", maskSize: "contain",
          ...style,
        }}
        aria-hidden="true"
        {...rest}
      />
    );
  };
}

function fab(name) {
  return function FaBrandIcon({ size, className = "", style, ...rest }) {
    return (
      <i
        className={`fa-brands fa-${name}${className ? " " + className : ""}`}
        style={{ ...(size ? { fontSize: size } : {}), ...style }}
        aria-hidden="true"
        {...rest}
      />
    );
  };
}

// ── Window controls ──────────────────────────────────────────────────────────
export const Minus              = fa("minus");
export const X                  = fa("xmark");

// ── Playback ─────────────────────────────────────────────────────────────────
export const Play               = fa("play");
export const Pause              = fa("pause");
export const SkipBack           = fa("backward-step");
export const SkipForward        = fa("forward-step");
export const Shuffle            = fa("shuffle");
export const Repeat             = fa("repeat");
export const RepeatOnce         = fa("repeat-1");
export const PlayCircle         = fa("circle-play");

// ── Volume ───────────────────────────────────────────────────────────────────
export const SpeakerX           = fa("volume-xmark");
export const SpeakerLow         = fa("volume-low");
export const SpeakerHigh        = fa("volume-high");

// ── Navigation ───────────────────────────────────────────────────────────────
export const House              = fa("house");
export const Books              = fa("books");
export const MagnifyingGlass    = fa("magnifying-glass");
export const ArrowLeft          = fa("arrow-left");
export const CaretLeft          = fa("caret-left");
export const CaretRight         = fa("caret-right");
export const CaretLineLeft      = fa("angles-left");
export const CaretLineRight     = fa("angles-right");
export const CaretUp            = fa("caret-up");
export const CaretDown          = fa("caret-down");
export const CaretLineUp        = fa("angles-up");

// ── Player UI ────────────────────────────────────────────────────────────────
export const Queue              = fa("list");
export const ChatText           = fa("message-lines");
export const ArrowsIn           = fa("compress");
export const ArrowsOut          = fa("expand");

// ── Settings & tools ─────────────────────────────────────────────────────────
export const Gear               = fa("gear");
export const Palette            = fa("palette");
export const Key                = fa("key");
export const Keyboard           = fa("keyboard");
export const PaintBrushBroad    = fa("paintbrush-fine");
export const HardDrives         = fa("hard-drive");
export const Translate          = fa("language");
export const Robot              = fa("robot");
export const Eyedropper         = fa("eye-dropper");
export const Droplet            = fa("droplet");

// ── Content ──────────────────────────────────────────────────────────────────
export const VinylRecord        = fa("record-vinyl");
export const MusicNote          = fa("music");
export const Playlist           = fa("list-music");
export const ImageSquare        = fa("image");
export const Microphone         = fa("microphone");
export const MicrophoneStand    = fa("microphone-stand");
export const Headphones         = fa("headphones");
export const HeadphonesSimple   = fa("headphones-simple");
export const PodcastIcon        = fa("podcast");
export const Gamepad            = fa("gamepad");
export const ClapperboardPlay   = fa("clapperboard-play");
export const Columns            = fa("table-columns");
export const Heart              = fa("heart");
export const Crown              = fa("crown");
export const UserPlus           = fa("user-plus");
export const UserCheck          = fa("user-check");
export const UserCircle         = fa("circle-user");
export const Users              = fa("users");
export const SignOut            = fa("right-from-bracket");
export const Power              = fa("power-off");

// ── Actions ──────────────────────────────────────────────────────────────────
export const Check              = fa("check");
export const CheckCircle        = fa("circle-check");
export const Plus               = fa("plus");
export const DownloadSimple     = fa("download");
export const UploadSimple       = fa("upload");
// File-shaped variants: used where the action moves a document in or out, rather than being a
// generic up/download. Reads more precisely in the overlay editor's header.
export const FileImport         = fa("file-import");
export const FileExport         = fa("file-export");
export const Trash              = fa("trash");
export const PencilSimple       = fa("pencil");
export const ArrowCircleUp      = fa("circle-arrow-up");
export const Copy               = fa("copy");
export const Scissors           = fa("scissors");
export const Clipboard          = fa("clipboard");
export const ArrowSquareOut     = fa("arrow-up-right-from-square");
export const ArrowClockwise     = fa("arrow-rotate-right");
export const ArrowsClockwise    = fa("arrows-rotate");
export const ArrowsLeftRight    = fa("right-left");
export const Link               = fa("link");
export const PushPin            = fa("thumbtack");
export const ClockCounterClockwise = fa("clock-rotate-left");
export const Clock              = fa("clock");

// ── Lists & layout ───────────────────────────────────────────────────────────
export const DotsSixVertical    = fa("grip-vertical");
export const CursorArrow        = fa("arrow-pointer");
export const GripLines          = fa("grip-lines");
export const DotsThreeVertical  = fa("ellipsis-vertical");

// ── Time & weather (greeting) ────────────────────────────────────────────────
export const SunHorizon         = fa("mug-hot", true);
export const Sun                = fa("sun", true);
export const CloudSun           = fa("cloud-sun", true);
export const Moon               = fa("moon", true);
export const MoonStars          = fa("moon-stars", true);

// ── Status ───────────────────────────────────────────────────────────────────
export const WifiHigh           = fa("wifi");
export const WifiX              = fa("wifi-slash");
export const DeviceMobile       = fa("mobile-screen-button");
export const Bug                = fa("bug");
export const PersonArmsSpread   = fa("universal-access");
export const Bell               = fa("bell");
export const Megaphone          = fa("bullhorn");
export const PaperPlaneTilt     = fa("paper-plane");

// ── Overlay / Design ─────────────────────────────────────────────────────────
export const FloppyDisk         = fa("floppy-disk");
export const Swatches           = fa("grid-2");

// ── Settings icons ────────────────────────────────────────────────────────────
export const TextSize           = fa("text-size");
export const Sliders            = fa("sliders");
export const Eye                = fa("eye");
export const EyeSlash           = fa("eye-slash");
export const Tag                = fa("tag");
export const CircleHalf         = fa("circle-half-stroke");
export const WaveformLines      = fa("waveform-lines");
export const Radio              = fa("radio");
export const Sparkles           = fa("wand-magic-sparkles");
export const Flask               = fa("flask");
export const ShareNodes         = fa("share-nodes");
export const Globe              = fa("globe");
export const Lock               = fa("lock");
export const LockOpen           = fa("lock-open");
export const ScreencastSimple   = fa("tv");
export const CircleFill         = fa("circle", true);
export const Info               = fa("circle-info");
export const WarningCircle      = fa("circle-exclamation");
export const Flag               = fa("flag");
export const Star               = fa("star", true);
// Sort glyphs only exist as solids in Font Awesome — the regular set has no outline variant.
export const Sort               = fa("sort", true);
export const SortUp             = fa("sort-up", true);
export const SortDown           = fa("sort-down", true);

// ── Project-drawn icons (public/*.svg) ────────────────────────────────────────
// Lyrics actions. Deliberately separate from `Translate` (fa-language), which stands for the
// interface language in the settings and the sidebar — same word, different meaning.
export const TranslateLyrics    = maskIcon("/translate.svg");
export const Romanization       = maskIcon("/romanization.svg");
export const MiniPlayerEnter    = maskIcon("/mini-player-enable.svg");  // collapse into the mini player
export const MiniPlayerExit     = maskIcon("/mini-player-disable.svg"); // back to the main window

// ── Overlay editor ───────────────────────────────────────────────────────────
// Drawn for the editor's inspector. Masked like the others, so they take the current text
// colour instead of the fill they were exported with.
export const OvlOpacity         = maskIcon("/overlay-editor/opacity-icon.svg");
export const OvlCornerRadius    = maskIcon("/overlay-editor/corner-radius-icon.svg");        // all four corners
export const OvlCornerSingle    = maskIcon("/overlay-editor/corner-radius-single-icon.svg"); // one corner, rotated for the rest
export const OvlStrokeWeight    = maskIcon("/overlay-editor/stroke-weight-icon.svg");
export const OvlDropShadow      = maskIcon("/overlay-editor/drop-shadow-icon.svg");
export const OvlInnerShadow     = maskIcon("/overlay-editor/inner-shadow-icon.svg");
export const OvlGlow            = maskIcon("/overlay-editor/glow-icon.svg");
export const OvlLayerBlur       = maskIcon("/overlay-editor/layer-blur-icon.svg");
export const OvlBackgroundBlur  = maskIcon("/overlay-editor/background-blur-icon.svg");

// ── Brand icons ───────────────────────────────────────────────────────────────
export const BrandTwitch        = fab("twitch");
export const BrandYoutube       = fab("youtube");
export const BrandBluesky       = fab("bluesky");
export const BrandTiktok        = fab("tiktok");
export const BrandLastfm        = fab("lastfm");
export const BrandGithub        = fab("github");
export const BrandDiscord       = fab("discord");
export const MugHot             = fa("mug-hot");
