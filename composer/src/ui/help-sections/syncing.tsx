import { getEffectiveKeysArray } from "@/stores/shortcut-bindings";
import { HEADING, PROSE } from "@/ui/help-sections/shared";
import { InlineKeyBadge } from "@/ui/inline-key-badge";
import { MOD_KEY } from "@/utils/platform";

// -- Syncing ------------------------------------------------------------------

const SyncSection: React.FC = () => (
  <div className="space-y-5">
    <p className={PROSE}>
      The Sync tab shows your lyrics as a scrolling carousel. One line is active at a time, with each word waiting to be
      synced. You have two keys available, and you can use them freely in combination.
    </p>

    <div>
      <h4 className={HEADING}>Tap (Space)</h4>
      <p className={PROSE}>
        Press <InlineKeyBadge keys={getEffectiveKeysArray("sync.tap")} /> to start playback and begin syncing. As the
        music plays, tap <InlineKeyBadge keys={getEffectiveKeysArray("sync.tap")} /> on each word right when the singer
        says it. Each tap marks the word's start time, and the previous word's end time is set to the same moment,
        creating gapless transitions.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Hold (F)</h4>
      <p className={PROSE}>
        Press and hold <InlineKeyBadge keys={getEffectiveKeysArray("sync.holdSync")} /> for the duration of each word.
        The key-down marks the word's start, and key-up marks the end. This gives you explicit control over word
        duration and allows natural gaps between words. The current word highlights while you hold.
      </p>
      <p className={`${PROSE} mt-2`}>For words with natural gaps between them, just hold and release for each word:</p>
      <ul className={`${PROSE} list-disc pl-4 mt-1.5 space-y-1`}>
        <li>Hold F: "hello" starts</li>
        <li>Release F: "hello" ends</li>
        <li>(wait for gap)</li>
        <li>Hold F: "world" starts</li>
        <li>Release F: "world" ends</li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Gapless syllables (Hold F + Tap Space)</h4>
      <p className={PROSE}>
        For syllables that flow together without pauses, tap <InlineKeyBadge keys={getEffectiveKeysArray("sync.tap")} />{" "}
        while holding <InlineKeyBadge keys={getEffectiveKeysArray("sync.holdSync")} /> to create gapless boundaries.
        Each tap ends the current syllable and immediately starts the next. Release{" "}
        <InlineKeyBadge keys={getEffectiveKeysArray("sync.holdSync")} /> to end the last one:
      </p>
      <ul className={`${PROSE} list-disc pl-4 mt-1.5 space-y-1`}>
        <li>Hold F: "beau" starts</li>
        <li>Tap Space (still holding F): "beau" ends, "ti" starts at the same moment</li>
        <li>Tap Space (still holding F): "ti" ends, "ful" starts at the same moment</li>
        <li>Release F: "ful" ends</li>
      </ul>
      <p className={`${PROSE} mt-2`}>
        You can mix all styles naturally within the same line. Use hold-release for standalone words, tap for quick
        gapless words, and hold+tap for connected syllables:
      </p>
      <ul className={`${PROSE} list-disc pl-4 mt-1.5 space-y-1`}>
        <li>Hold F, release F: "oh" gets its own timing</li>
        <li>(gap)</li>
        <li>Hold F: "beau" starts</li>
        <li>Tap Space, tap Space: gapless boundaries for "ti" and "ful"</li>
        <li>Release F: "ful" ends</li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Made a mistake?</h4>
      <p className={PROSE}>
        Press <InlineKeyBadge keys={getEffectiveKeysArray("sync.nudgeLeft")} /> to nudge the last synced word 50ms
        earlier. <InlineKeyBadge keys={getEffectiveKeysArray("sync.nudgeRight")} /> nudges it 50ms later. You can also
        press {MOD_KEY} + Z to undo. Each hold produces two undo steps (start and end) so you can step back precisely.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Line-level vs word-level</h4>
      <p className={PROSE}>
        By default, you're syncing word by word. The granularity toggle at the top lets you switch to line-level if you
        only need rough timing.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Re-syncing a line</h4>
      <p className={PROSE}>
        If a whole line went wrong, just navigate back to it and sync again. New taps overwrite old timing.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Splitting syllables</h4>
      <p className={PROSE}>
        Each word on the active line has a small scissors button. Click it to split that word into syllables right here,
        without switching to the Timeline. A popover opens where you click between letters to mark the split points,
        then confirm. The Timeline splitter offers the same syllable split plus a word-mode split.
      </p>
    </div>

    <p className={PROSE}>
      After syncing, your words have timing data. The Sync tab works at the line or word level, but for precise per-word
      timing adjustments, Timeline is where you drag, resize, and snap individual word blocks. Head there for
      fine-tuning, or go straight to Preview to see how it looks.
    </p>
  </div>
);

// -- Exports ------------------------------------------------------------------

export { SyncSection };
