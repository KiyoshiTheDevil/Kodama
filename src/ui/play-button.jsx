// The play/pause button, with the glyph cut out of the pill rather than drawn on top of it.
//
// Two things rule out the obvious approaches. CSS has no `destination-out` blend mode — that
// value belongs to canvas and to mask compositing, and as a `mix-blend-mode` it is simply
// dropped, leaving an ordinary filled glyph. And the icon set is a WEBFONT, so there is no path
// to hand to `mask-image`; a data-URI SVG mask cannot reach the page's fonts either, since it
// renders as its own document.
//
// An inline SVG mask can. `<text class="fa-solid">` inside a `<mask>` resolves the font exactly
// the way every `<i class="fa-solid">` in the app does, so the hole is the real glyph at the
// real weight, and it follows the icon set if that ever changes.
//
// HeroUI's Button stays as the interactive shell — focus ring, aria, the pressed scale — and
// only the paint is ours. Its own background is turned off in index.css and the SVG fills the
// pill from the same `--button-bg*` tokens the variant sets, so hover and pressed stay in step
// with the rest of the design system for free.
import { useEffect, useId, useState } from "react";
import { Button } from "@heroui/react";
import { Pause, Play } from "../icons.jsx";

const W = 64;
const H = 40;
const GLYPH = 20;
// fa-play and fa-pause, straight from public/css/all.min.css (--fa: "04b" / "04c").
// Built from the code point rather than written as a literal: these are private-use characters
// that survive neither a casual glance nor every editor and script that touches this file.
const PLAY = String.fromCharCode(0xf04b);
const PAUSE = String.fromCharCode(0xf04c);
const FONT = `900 ${GLYPH}px "Font Awesome 6 Pro"`;

/**
 * True once the icon font can actually be drawn.
 *
 * An SVG mask painted before the webfont arrives shows the notdef box, and it does not reliably
 * repaint when the font finishes loading — which would leave a tofu-shaped hole in the button
 * until something else forced a redraw. Rare, but it is exactly the kind of thing that only
 * happens on a cold start on someone else's machine.
 */
function useIconFont() {
  const [ready, setReady] = useState(() => {
    try { return document.fonts ? document.fonts.check(FONT) : false; } catch { return false; }
  });
  useEffect(() => {
    if (ready || !document.fonts) return;
    let alive = true;
    document.fonts.load(FONT).then(() => { if (alive) setReady(true); }).catch(() => {});
    return () => { alive = false; };
  }, [ready]);
  return ready;
}

export function PlayPauseButton({ isPlaying, isDisabled, onPress, label }) {
  const fontReady = useIconFont();
  // useId's colons are legal in an id but not in the url(#…) of a mask reference.
  const maskId = `pp-${useId().replace(/[^\w-]/g, "")}-${isPlaying ? "pause" : "play"}`;

  return (
    <Button
      variant="primary"
      isDisabled={isDisabled}
      onPress={onPress}
      aria-label={label}
      className="play-pill w-16 h-10 rounded-full shrink-0"
      style={{ contain: "layout style" }}
    >
      {fontReady ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              {/* Luminance mask: white keeps the pill, black is the hole. */}
              <rect width={W} height={H} rx={H / 2} fill="#fff" />
              <text
                className="fa-solid"
                x={W / 2}
                y={H / 2}
                fill="#000"
                fontSize={GLYPH}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {isPlaying ? PAUSE : PLAY}
              </text>
            </mask>
          </defs>
          <rect className="play-pill__fill" width={W} height={H} rx={H / 2} mask={`url(#${maskId})`} />
        </svg>
      ) : (
        // Until the font is there, the button it always was. Nothing jumps: same pill, same
        // glyph, same size — only filled instead of cut out.
        isPlaying ? <Pause size={GLYPH} weight="fill" /> : <Play size={GLYPH} weight="fill" />
      )}
    </Button>
  );
}
