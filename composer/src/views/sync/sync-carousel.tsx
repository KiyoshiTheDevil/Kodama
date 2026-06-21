import type { WordTiming } from "@/domain/word/timing";
import { syncCarouselTransition } from "@/utils/animationVariants";
import { stripSplitCharacter } from "@/utils/split-character";
import { splitIntoWords } from "@/utils/sync-helpers";
import { AnimatePresence, m } from "motion/react";

// -- Constants ----------------------------------------------------------------

const LINE_HEIGHT = 100;

// -- Interfaces ---------------------------------------------------------------

interface RippleTarget {
  lineId: string;
  wordIndex: number;
  nonce: number;
}

interface SyncCarouselProps {
  lines: Array<{
    id: string;
    text: string;
    words?: WordTiming[];
    begin?: number;
  }>;
  lineIndex: number;
  wordIndex: number;
  granularity: "line" | "word";
  isHolding?: boolean;
  rippleTarget?: RippleTarget | null;
  onRippleComplete?: () => void;
}

// -- Components ---------------------------------------------------------------

const RippleRing: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <m.span
    className="absolute inset-0 rounded-[50%] border border-composer-accent/20 bg-composer-accent/20 pointer-events-none blur-sm"
    initial={{ scale: 0.8, opacity: 0.5 }}
    animate={{ scale: 2.2, opacity: 0 }}
    transition={{ duration: 0.33, ease: "easeOut" }}
    onAnimationComplete={onComplete}
  />
);

interface WordGranularityLineProps {
  line: SyncCarouselProps["lines"][number];
  idx: number;
  lineIndex: number;
  wordIndex: number;
  isHolding: boolean;
  isCurrent: boolean;
  rippleTarget: RippleTarget | null;
  onRippleComplete: () => void;
}

const WordGranularityLine: React.FC<WordGranularityLineProps> = ({
  line,
  idx,
  lineIndex,
  wordIndex,
  isHolding,
  isCurrent,
  rippleTarget,
  onRippleComplete,
}) => {
  const lineWords = splitIntoWords(line.text);
  return lineWords.map((word, widx) => {
    const isPrevLine = idx === lineIndex - 1;
    const holdActive = isHolding;
    const isCurrentHeld = holdActive && isCurrent && widx === wordIndex;
    const isLastSyncedOnCurrent = !holdActive && isCurrent && wordIndex > 0 && widx === wordIndex - 1;
    const isLastWordOfPrevLine = !holdActive && isPrevLine && wordIndex === 0 && widx === lineWords.length - 1;
    const isLastSynced = isLastSyncedOnCurrent || isLastWordOfPrevLine;

    const color = isCurrentHeld
      ? "rgb(129, 140, 248)"
      : isLastSynced
        ? "rgb(129, 140, 248)"
        : isCurrent
          ? "rgba(255, 255, 255, 0.7)"
          : "rgba(255, 255, 255, 0.4)";

    const hasRipple = rippleTarget !== null && rippleTarget.lineId === line.id && rippleTarget.wordIndex === widx;

    return (
      <m.span
        key={`${line.id}-${widx}`}
        animate={{ color, scale: isCurrentHeld ? 0.95 : 1 }}
        transition={syncCarouselTransition}
        className="relative inline-flex items-center justify-center origin-center"
      >
        {word}
        <AnimatePresence>
          {hasRipple && rippleTarget && <RippleRing key={rippleTarget.nonce} onComplete={onRippleComplete} />}
        </AnimatePresence>
      </m.span>
    );
  });
};

const SyncCarousel: React.FC<SyncCarouselProps> = ({
  lines,
  lineIndex,
  wordIndex,
  granularity,
  isHolding = false,
  rippleTarget = null,
  onRippleComplete,
}) => {
  const containerHeight = LINE_HEIGHT * 3;
  const translateY = LINE_HEIGHT - lineIndex * LINE_HEIGHT;

  const handleRippleComplete = onRippleComplete ?? noop;

  return (
    <div className="relative overflow-hidden" style={{ height: containerHeight }}>
      <m.div
        initial={{ y: translateY }}
        animate={{ y: translateY }}
        transition={syncCarouselTransition}
        className="flex flex-col items-center"
      >
        {lines.map((line, idx) => {
          const isCurrent = idx === lineIndex;
          const distance = Math.abs(idx - lineIndex);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.4 : 0;
          const scale = distance === 0 ? 1 : 0.65;

          return (
            <m.div
              key={line.id}
              initial={{ opacity, scale }}
              animate={{ opacity, scale }}
              transition={syncCarouselTransition}
              style={{ height: LINE_HEIGHT }}
              className="flex items-center justify-center w-full shrink-0"
            >
              <div className="flex flex-wrap items-center justify-center text-4xl font-medium gap-x-4 gap-y-3">
                {granularity === "line" ? (
                  <m.span
                    animate={{
                      color:
                        idx === lineIndex - 1
                          ? "rgb(129, 140, 248)"
                          : isCurrent
                            ? "rgba(255, 255, 255, 0.7)"
                            : "rgba(255, 255, 255, 0.4)",
                    }}
                    transition={syncCarouselTransition}
                  >
                    {stripSplitCharacter(line.text)}
                  </m.span>
                ) : (
                  <WordGranularityLine
                    line={line}
                    idx={idx}
                    lineIndex={lineIndex}
                    wordIndex={wordIndex}
                    isHolding={isHolding}
                    isCurrent={isCurrent}
                    rippleTarget={rippleTarget}
                    onRippleComplete={handleRippleComplete}
                  />
                )}
              </div>
            </m.div>
          );
        })}
      </m.div>
    </div>
  );
};

const noop = () => {};

// -- Exports ------------------------------------------------------------------

export { SyncCarousel };
export type { RippleTarget };
