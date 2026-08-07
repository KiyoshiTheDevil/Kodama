// The translate / romaji toggles that sit beside the lyrics. Shared, because they belong to
// BOTH the lyrics view and the video-sync view — the two render lyrics through completely
// different code paths, and having the controls in only one of them left the other with no way
// to reach the settings at all.
import { ChipRoot, ChipLabel } from "@heroui/react";
import { translate } from "../i18n.js";
import { Minus, Plus, Romanization, TranslateLyrics } from "../icons.jsx";
import { useLyricsPrefs } from "../preferences.jsx";
import { OFFSET_STEP } from "./offset.js";
import { Tooltip } from "../ui/tooltip.jsx";

// Chip geometry. The pill radius MUST stay exactly half the height: when the two radii on a
// side add up to more than the side is long, the browser scales all four corners by the same
// factor and the small notch collapses to nothing.
export const CHIP_H = 40;
export const CHIP_R = CHIP_H / 2;
export const CHIP_NOTCH = 8;

// Corner radii for a chip in a row: rounded on free ends, notched where a neighbour sits.
export function chipCorners(left, right) {
  const l = left ? CHIP_NOTCH : CHIP_R;
  const r = right ? CHIP_NOTCH : CHIP_R;
  return `${l}px ${r}px ${r}px ${l}px`;
}

/**
 * The timing correction: minus / value / plus in one pill. The value doubles as the reset
 * button, and its width is fixed so counting up and down never shifts the row.
 */
export function OffsetChips({ language, offset, adjustOffset, neighbourRight = false }) {
  const btn = "border-0 bg-transparent cursor-default rounded-full self-stretch flex items-center justify-center transition-[background-color,transform] duration-150 hover:bg-white/15 active:bg-white/25 active:scale-90";
  return (
    <div className="flex items-center" style={{
      height: CHIP_H,
      background: "rgba(255,255,255,0.1)",
      backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
      borderRadius: chipCorners(false, neighbourRight),
    }}>
      <Tooltip text={translate(language, "lyricsOffsetEarlier")}>
        <button onClick={() => adjustOffset(-OFFSET_STEP)} className={btn}
          style={{ color: "rgba(255,255,255,0.9)", width: CHIP_H }}>
          <Minus size={11} weight="bold" />
        </button>
      </Tooltip>
      <Tooltip text={translate(language, "lyricsOffsetReset")}>
        <button onClick={() => adjustOffset(null)}
          className="border-0 bg-transparent cursor-default self-stretch rounded-full tabular-nums text-center transition-[background-color,transform] duration-150 hover:bg-white/12 active:bg-white/22 active:scale-90"
          style={{ color: offset ? "var(--accent)" : "rgba(255,255,255,0.9)", fontSize: "var(--t12)", fontWeight: 600, width: 58 }}>
          {offset > 0 ? "+" : ""}{String(Number(offset.toFixed(2)))}s
        </button>
      </Tooltip>
      <Tooltip text={translate(language, "lyricsOffsetLater")}>
        <button onClick={() => adjustOffset(OFFSET_STEP)} className={btn}
          style={{ color: "rgba(255,255,255,0.9)", width: CHIP_H }}>
          <Plus size={11} weight="bold" />
        </button>
      </Tooltip>
    </div>
  );
}

export function ToolChip({ tooltip, active, onPress, children, corners }) {
  return (
    <Tooltip text={tooltip}>
      <button
        onClick={onPress}
        className="border-0 cursor-default flex items-center justify-center transition-[background-color,transform] duration-150 hover:brightness-125 active:scale-95"
        style={{
          height: CHIP_H, width: CHIP_H,
          background: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
          // Mask icons take their colour from currentColor and have no weights, so the active
          // state is carried by the accent alone.
          color: active ? "var(--accent)" : "rgba(255,255,255,0.9)",
          borderRadius: corners,
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Translate and (when the lyrics are Japanese) romaji.
 * `neighbourLeft` / `neighbourRight` describe what sits beside the pair, so the outer corners
 * stay fully round and only the facing ones are notched.
 */
export function LyricsToolChips({ language, romanizable, neighbourLeft = false, neighbourRight = false }) {
  const { showTranslation, setShowTranslation, showRomaji, setShowRomaji } = useLyricsPrefs();
  return (
    <>
      <ToolChip
        tooltip={translate(language, "translateLyrics")}
        active={showTranslation}
        onPress={() => setShowTranslation?.(v => !v)}
        corners={chipCorners(neighbourLeft, romanizable || neighbourRight)}
      >
        <TranslateLyrics size={17} />
      </ToolChip>
      {romanizable && (
        <ToolChip
          tooltip={translate(language, "showRomaji")}
          active={showRomaji}
          onPress={() => setShowRomaji?.(v => !v)}
          corners={chipCorners(true, neighbourRight)}
        >
          <Romanization size={17} />
        </ToolChip>
      )}
    </>
  );
}

/** The provider badge. Opens the lyrics browser; shows the submitter for community entries. */
export function SourceChip({ language, source, submitterName, onPress, neighbourLeft = false }) {
  if (!source) return null;
  return (
    <Tooltip text={translate(language, "browseLyrics")}>
      <button onClick={onPress} className="border-0 bg-transparent p-0 cursor-default">
        <ChipRoot size="sm" className="border-0! px-3.5! py-1.5! transition-all duration-200 hover:brightness-125"
          style={{
            height: CHIP_H,
            background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
            borderRadius: chipCorners(neighbourLeft, false),
          }}>
          <ChipLabel className="font-semibold tracking-wide flex items-center gap-1.5" style={{ fontSize: "var(--t12)" }}>
            {source}
            {submitterName && <span style={{ opacity: 0.55 }}> · {submitterName}</span>}
          </ChipLabel>
        </ChipRoot>
      </button>
    </Tooltip>
  );
}
