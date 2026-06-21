import { getEffectiveKeysArray } from "@/stores/shortcut-bindings";
import { HEADING, INLINE_CODE, PROSE } from "@/ui/help-sections/shared";
import { InlineKeyBadge } from "@/ui/inline-key-badge";
import { ALT_KEY, MOD_KEY } from "@/utils/platform";

// -- Timeline -----------------------------------------------------------------

const TimelineSection: React.FC = () => (
  <div className="space-y-5">
    <p className={PROSE}>
      The Timeline is where you do the detailed work. While the Sync tab is great for tapping out rough timing, Timeline
      gives you full control over every word. You can drag words to reposition them, resize their boundaries, split
      words and syllables, merge blocks, mark explicit words, copy and paste across lines, and more. If you've used a
      DAW or video editor before, this will feel familiar.
    </p>

    <div>
      <h4 className={HEADING}>Layout</h4>
      <p className={PROSE}>
        The waveform sits at the top. Below it, each lyrics line is a horizontal track. Word blocks sit on the tracks,
        positioned by their start and end times. The playhead (vertical line) follows the audio. The gutter on the left
        shows line numbers and agent colors. Click it to assign agents.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Navigation</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          A plain scroll wheel scrolls vertically through the lines. To move through time, scroll horizontally with a
          trackpad gesture.
        </li>
        <li>
          Turn on "Scroll wheel scrolls timeline" in Settings, under Timeline, to swap the axes: a plain wheel then
          scrolls the timeline horizontally and Shift + wheel scrolls vertically.
        </li>
        <li>
          Scroll the wheel while the cursor is over the waveform strip to scrub the playhead through time, and the view
          follows it. This works whichever way the "Scroll wheel scrolls timeline" setting is set.
        </li>
        <li>{MOD_KEY} + scroll wheel to zoom in and out.</li>
        <li>Middle-click and drag to pan freely. Hold Shift while middle-dragging to lock panning to one axis.</li>
        <li>
          Drag the playhead near the left or right edge of the viewport and the view auto-scrolls in that direction, so
          you can scrub the playhead past what is currently visible.
        </li>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleFollow")} /> to toggle "follow playhead" so
          the view scrolls automatically during playback.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Audio scrub preview</h4>
      <p className={PROSE}>
        When you scrub the playhead (drag it, or scroll the wheel over the waveform), Composer plays a short bit of
        audio at the playhead position, at normal pitch. It helps you find a specific word by ear without having to
        press play. Faster scrubs play more snippets, slower scrubs play fewer. The preview matches your main volume and
        stays silent when the audio is muted. If it gets in the way, turn it off in Settings, under Playback.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Selecting words</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>Click a word block to select it. {MOD_KEY} + Click to add or remove from selection.</li>
        <li>Shift + Click a syllable to select every syllable in that word's group at once.</li>
        <li>Click and drag on empty space to marquee-select multiple words.</li>
        <li>Hold Shift while dragging to add to existing selection.</li>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.selectWordAtPlayhead")} /> to select the word at
          the current playhead time. Press it again to cycle through any overlapping words, such as a background-track
          word or stacked instances.
        </li>
        <li>
          Press <strong>Escape</strong> to deselect everything.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Editing words</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>Double-click a word block to edit its text inline. Press Enter to confirm, Escape to cancel.</li>
        <li>Double-click on empty track space to create a new word at that position.</li>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.editWord")} /> with a word selected to start
          editing.
        </li>
        <li>
          Use <InlineKeyBadge keys={getEffectiveKeysArray("timeline.setWordBegin")} /> and{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.setWordEnd")} /> to snap a word's start or end to the
          current playhead position.
        </li>
        <li>
          With one or more words selected, press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.nudgeLeft")} /> /{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.nudgeRight")} /> to nudge them as a group. Each word
          keeps its duration, and the nudge stops at the neighboring word so nothing overlaps.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Copy, cut, paste</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          {MOD_KEY} + C / X / V work as expected. When you paste, a ghost preview appears. Click to place the pasted
          words.
        </li>
        <li>{ALT_KEY} + drag selected words to duplicate them.</li>
        <li>Press Delete or Backspace to remove selected words.</li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Boundary dragging</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          Two syllables that sit flush share one boundary: drag either edge and both move together, staying flush. Once
          a gap opens between them, each edge drags on its own so you can resize a syllable without closing the gap.
        </li>
        <li>
          Hold <strong>{ALT_KEY}</strong> while dragging to flip the current mode: flush syllables open a gap, gapped
          syllables snap back together, and separate words move as one.
        </li>
        <li>You can toggle {ALT_KEY} mid-drag to switch modes on the fly.</li>
        <li>
          Turn on <strong>Rolling</strong> in the toolbar (or press{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleRollingEdit")} />) for rolling edits. When it's
          on, dragging a flush boundary between two words moves both words together: the shared boundary shifts, the
          outer edges stay put, and the combined duration is preserved. {ALT_KEY} still inverts conjoin for that one
          drag.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Snap (magnet)</h4>
      <p className={PROSE}>
        Drag or resize a word and its edges lock onto nearby anchors: the begin and end of any other word (main or
        background track), line edges for line-synced lines, and the playhead. A yellow halo appears on the moving block
        while snapped, and a thin dashed line marks the anchor on the timeline.
      </p>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleSnap")} /> or click the magnet button in the
          toolbar to toggle snap. The setting persists across sessions.
        </li>
        <li>
          Hold <strong>{MOD_KEY}</strong> mid-drag to bypass snap. The toolbar magnet dims while bypass is active.
          Release the key and snap re-engages.
        </li>
        <li>Adjust the snap distance in Settings, under Timeline. Range is 4 to 24 pixels, default 12.</li>
        <li>
          Snap won't push a block into a neighbor. If the closest anchor would cause overlap, it falls through to the
          next-best anchor or doesn't snap at all.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Splitting and merging</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.splitSyllable")} /> with a word selected to open
          the splitter in syllable mode. Click between letters to mark where the word should break. The result is a
          linked syllable group: the pieces stay tied together as one word. If the playhead is on the word when you
          confirm a single split, the timing boundary snaps to the playhead position exactly.
        </li>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.splitWord")} /> (or right-click and pick{" "}
          <strong>Split word</strong>) to open the splitter in word mode. This breaks one word into separate independent
          words, joined by a space, rather than a linked syllable group.
        </li>
        <li>
          To undo a syllable split, right-click any syllable of the word and pick <strong>Merge syllables</strong>, or
          press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.mergeSyllablesIntoWord")} />. The syllable group
          collapses back into one plain word that spans from the first syllable's start to the last syllable's end.
        </li>
        <li>
          Select two or more adjacent words on the same line and press{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.mergeWords")} /> to merge them into one block. This
          works even when the selected words have a space between them; the joining space is dropped.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Syllable timing</h4>
      <p className={PROSE}>
        Syllables of a word can be timed flush against each other or with gaps between them. Gaps are useful for
        staccato or rap delivery, and for per-character timing in Japanese, Chinese, or Korean lyrics. To close those
        gaps, right-click a syllable and pick <strong>Snap syllables flush</strong>. It pulls every syllable group on
        the line tight, so each syllable starts where the previous one ends. The item only shows up when a group has a
        gap, and there is no keyboard shortcut for it.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Explicit words</h4>
      <p className={PROSE}>
        Mark a word as explicit so it carries the right flag through to export. Select one or more words and press{" "}
        <InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleExplicit")} />, or right-click and pick{" "}
        <strong>Mark as explicit</strong> (the same item reads <strong>Unmark explicit</strong> when the words are
        already flagged).
      </p>
      <p className={`${PROSE} mt-2`}>
        Composer also scans your lyrics for likely explicit words and shows a suggestions banner above the timeline.
        From there you can mark a suggested word, mark them all, or dismiss ones that are false positives. Explicit
        words export as the <span className={INLINE_CODE}>composer:explicit="true"</span> attribute on the word's TTML
        span.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Right-click menus</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          Right-click a word: Edit text, Split syllables, Split word. Merge words appears when multiple words are
          selected. On a word already split into syllables you also get Merge syllables and Snap syllables flush. Mark
          as explicit (or Unmark explicit) toggles the explicit flag. Group this line and Split into words show up when
          they apply, and Delete word is always there.
        </li>
        <li>Right-click empty track space: Add word here.</li>
        <li>Right-click the gutter: Add line above/below, Assign agent, Delete line.</li>
        <li>
          Right-click a group banner: Add instance, Shift to playhead, Rename, Recolor, Detach instance, Delete group.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Linked groups</h4>
      <p className={PROSE}>
        Mark repeating sections (chorus, verse, bridge) as a group so structural edits fan out to every instance. See
        the <strong>Linked groups</strong> section in this help modal for the full walkthrough.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Header toolbar</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          <strong>Follow</strong> (<InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleFollow")} />
          ): auto-scrolls the view to keep the playhead visible during playback.
        </li>
        <li>
          <strong>Rolling</strong> (<InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleRollingEdit")} />
          ): the rolling edit tool. When on, dragging a flush boundary moves both adjacent words together while keeping
          their combined duration.
        </li>
        <li>
          <strong>Preview</strong> (<InlineKeyBadge keys={getEffectiveKeysArray("timeline.togglePreview")} />
          ): opens a live lyrics preview sidebar on the right.
        </li>
        <li>
          <strong>Snap</strong> (<InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleSnap")} />
          ): a magnet for word edges and the playhead. Hold {MOD_KEY} mid-drag to bypass.
        </li>
        <li>
          <strong>Import</strong> (<InlineKeyBadge keys={getEffectiveKeysArray("timeline.importLyrics")} />
          ): imports lyrics directly into the Timeline without switching tabs.
        </li>
        <li>
          <strong>Zoom</strong>: use the +/- buttons or {MOD_KEY} + scroll wheel to zoom in and out.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Other features</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.insertLineBelow")} /> with a word selected to
          insert a new empty line below it.
        </li>
        <li>The info panel at the bottom shows details for the selected word, including background text editing.</li>
      </ul>
    </div>
  </div>
);

// -- Exports ------------------------------------------------------------------

export { TimelineSection };
