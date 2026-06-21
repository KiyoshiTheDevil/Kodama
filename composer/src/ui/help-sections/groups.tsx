import { getEffectiveKeysArray } from "@/stores/shortcut-bindings";
import { HEADING, INLINE_CODE, PROSE } from "@/ui/help-sections/shared";
import { InlineKeyBadge } from "@/ui/inline-key-badge";
import { MOD_KEY } from "@/utils/platform";

// -- Linked Groups ------------------------------------------------------------

const GroupsSection: React.FC = () => (
  <div className="space-y-5">
    <p className={PROSE}>
      A group is a set of contiguous lines that repeat in the song (chorus, verse, bridge). Group them once and edits to
      text, splits, agents, or background vocals propagate to every instance. Each instance still owns its own absolute
      timing, so you can shift one chorus by 5 seconds without moving the others.
    </p>

    <div>
      <h4 className={HEADING}>Why bother</h4>
      <p className={PROSE}>
        If your song repeats the chorus four times, you'd otherwise edit four copies of every lyric tweak. Group them
        and a fix in one place lands in all four. Same for splitting a syllable, switching a word to background vocals,
        or reassigning an agent.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Creating a group</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>Select the lines you want to group (click, then Shift-click the last line, or drag down the gutter).</li>
        <li>
          Press <InlineKeyBadge keys={getEffectiveKeysArray("timeline.createGroup")} />, or right-click any selected
          line and pick "Group N lines".
        </li>
        <li>
          If your selection skips a line by accident, Composer fills the gap and tells you so in the toast. If a line in
          the gap already belongs to another group, it refuses and asks you to fix the selection.
        </li>
        <li>The new group gets a color from the palette and shows up as a banner above the first line.</li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Adding more instances</h4>
      <p className={PROSE}>
        Click the banner of the instance you want to copy, then press{" "}
        <InlineKeyBadge keys={getEffectiveKeysArray("timeline.duplicateAsLinked")} /> (or right-click the banner and
        pick "Add instance at playhead"). Composer picks one of three landings, in this order:
      </p>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          <strong>Fills empty placeholder rows in place</strong> if a matching run of empty rows sits right after the
          last timed line ending at or before the playhead. Nothing shifts down, the placeholders just light up.
        </li>
        <li>
          <strong>Inserts new rows at the playhead</strong> if there's no fillable run but the playhead falls in a clean
          time gap big enough for the instance.
        </li>
        <li>
          <strong>Copies the instance to the clipboard and opens the paste-preview ghost</strong> if the playhead is
          inside a playing line, the gap is too small, or you've already passed the last lyric. Toast says where to go
          next: "No room at the playhead. {MOD_KEY} + V to paste somewhere clear." Move the cursor to a row you like and
          click to drop it.
        </li>
      </ul>
      <p className={`${PROSE} mt-2`}>
        You can also use the regular clipboard: select every word of an instance ({MOD_KEY} + C with the banner
        selected), then paste ({MOD_KEY} + V) somewhere else. Same fill/insert behavior at the destination.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>The banner</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          <strong>Click anywhere on it</strong>: selects every word in the instance. Use this before arrow-key nudge,
          {MOD_KEY} + C, or any of the keyboard shortcuts below.
        </li>
        <li>
          <strong>Drag horizontally</strong>: shifts the entire instance in time. Sibling instances stay put. The lines
          move along with the banner so you can line things up by eye.
        </li>
        <li>
          <strong>Click the chevron</strong>: collapses the instance into a single strip. A faint progress bar fills the
          strip during playback so you can still tell where you are in the section.
        </li>
        <li>
          <strong>Right-click</strong>: opens the group menu (rename, recolor, add instance, shift to playhead, detach
          instance, delete group).
        </li>
        <li>
          <strong>Double-click anywhere on the header row</strong>: drops the gutter label into an inline input so you
          can rename the group. Enter saves, Escape cancels. The Rename item in the right-click menu does the same
          thing.
        </li>
        <li>
          <strong>Hover the "1 of N" badge</strong>: every sibling instance pings briefly with the group's color so you
          can spot them on the timeline. Or press{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.pingSiblings")} /> for the same effect from the
          keyboard.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Keyboard shortcuts</h4>
      <p className={PROSE}>
        Most of these act on the instance containing your current selection. Click a banner first to "focus" an
        instance.
      </p>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.createGroup")} />: group selected lines.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.duplicateAsLinked")} />: add a linked instance at the
          playhead.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleCollapseInstance")} /> /{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.toggleAllCollapsed")} />: collapse the current instance,
          or every instance.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.jumpPrevInstance")} /> /{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.jumpNextInstance")} />: jump to the previous or next
          instance of the same group. Wraps around.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.nudgeLeft")} /> /{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.nudgeRight")} />: nudge the current instance earlier or
          later by the nudge amount in Settings.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.pingSiblings")} />: ping every sibling instance.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.detachInstance")} />: detach the current instance from
          the group.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.deleteGroup")} />: delete the current group (asks for
          confirmation first).
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.shiftInstanceToPlayhead")} />: shift the current
          instance so its first word lands on the playhead.
        </li>
        <li>
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.jumpToInstanceStart")} />: scroll the timeline to the
          start of the current instance without changing the selection.
        </li>
      </ul>
      <p className={`${PROSE} mt-2`}>All of these are remappable in Settings → Shortcuts.</p>
    </div>

    <div>
      <h4 className={HEADING}>Suggestions banner</h4>
      <p className={PROSE}>
        When the timeline detects two or more contiguous runs of identical lines that aren't grouped yet, a small bulb
        banner appears under the toolbar. One suggestion shows inline with a Group them button. Multiple suggestions
        collapse into a Review N button that opens a modal with each block previewed and a per-row Group / dismiss
        action, plus a Group all button.
      </p>
      <p className={`${PROSE} mt-2`}>
        Dismissals are per-project and content-based, so adding or removing unrelated lines elsewhere will not bring a
        suggestion back. Editing the actual text inside a dismissed block does, since the structure has changed.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Pasting between instances</h4>
      <p className={PROSE}>Two paste flows can land in an instance, and both behave the same way at the destination:</p>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          Copy every word of an existing instance and paste somewhere. Composer treats the clipboard as a known instance
          and links the destination automatically.
        </li>
        <li>
          Copy every word of standalone lines whose text and word splits already match an existing template. Composer
          asks "Link as another [Chorus]?". Yes links, No falls back to a regular word paste.
        </li>
      </ul>
      <p className={`${PROSE} mt-2`}>
        In both cases the destination is filled in place if there are enough empty rows starting at the cursor. If there
        aren't, Composer asks before inserting new rows, since that would shift everything below down by N. Add rows in
        the Edit view first if you want predictable layout.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>What propagates and what doesn't</h4>
      <p className={PROSE}>Linked across all instances:</p>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>Word text and line text edits.</li>
        <li>Agent assignments.</li>
        <li>Background vocal text.</li>
        <li>
          Word splits and merges. Siblings get the new word structure, and Composer keeps the timing of every word that
          didn't actually change. Only the split or merged word's slot is divided up. Sibling rhythms you carefully
          synced earlier survive.
        </li>
        <li>Moving a word between main and background tracks.</li>
      </ul>
      <p className={`${PROSE} mt-2`}>Stays local to one instance:</p>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>Absolute begin and end times for each word.</li>
        <li>Banner shifts and arrow-key nudge.</li>
        <li>Anything you do on a line that's been detached.</li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>The split-or-merge prompt</h4>
      <p className={PROSE}>
        When a split or merge on a linked line would actually shift sibling word timings (sibling rhythms differ from
        the source), Composer pops a three-button modal: <strong>Apply to all</strong> (propagate with timing
        preservation), <strong>Detach</strong> (keep the change on this line only, unlink it from the group), or{" "}
        <strong>Cancel</strong>. The modal stays out of the way when sibling rhythms already match the source, since
        propagation is a no-op for the unchanged words anyway.
      </p>
      <p className={`${PROSE} mt-2`}>
        Tick "Don't ask again" in the modal to default to your choice next time. Reset the preference from{" "}
        <strong>Settings → Confirmations</strong>.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Detaching</h4>
      <p className={PROSE}>
        Real songs aren't perfectly repetitive. The last chorus might add an extra "yeah" or land on a different agent.
        Two ways to break the link:
      </p>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          Right-click a line in the gutter and pick <strong>Detach this line</strong>. That single line stops syncing
          with siblings; everything else stays linked.
        </li>
        <li>
          Right-click the banner and pick <strong>Detach instance</strong>. The whole instance becomes plain standalone
          lines. Other instances keep their group.
        </li>
      </ul>
      <p className={`${PROSE} mt-2`}>
        Both are undoable: the toast that appears has an Undo button, or press {MOD_KEY} + Z.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Emptying an instance</h4>
      <p className={PROSE}>
        Click the banner to select every word in an instance, then press <strong>Delete</strong>. Composer clears the
        timed content and notices the instance is now empty across all its lines, so it strips the group attrs from
        those rows automatically. You're left with empty placeholders that the fill flow above can repopulate later. The
        other instances of the group are untouched.
      </p>
      <p className={`${PROSE} mt-2`}>
        Partial deletes don't trigger this: if one line of a multi-line instance still has timed words, the instance
        stays linked.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Deleting a group</h4>
      <p className={PROSE}>
        Right-click any banner and pick <strong>Delete group</strong>. A confirmation modal warns you that all instances
        will become standalone (text and timing survive, they just stop syncing). Tick "Don't ask again" to skip the
        modal next time, or restore the prompt from <strong>Settings → Confirmations</strong>.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>How groups look outside the Timeline</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          <strong>Edit view</strong>: a colored divider with the group name and instance count appears before each
          instance, plus a thin closing line at the end. Each grouped line also gets a left-edge stripe in the group
          color and a hover tooltip showing the link count.
        </li>
        <li>
          <strong>Sync view</strong>: the gutter cell shows a chain icon and an instance counter so you know which
          chorus you're syncing.
        </li>
        <li>
          <strong>TTML export</strong>: groups round-trip via a custom{" "}
          <span className={INLINE_CODE}>composer:groups</span> registry plus per-line attributes. Other TTML players
          ignore them; Composer reads them back exactly as saved.
        </li>
      </ul>
    </div>
  </div>
);

// -- Exports ------------------------------------------------------------------

export { GroupsSection };
