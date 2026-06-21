import { useSettingsStore } from "@/stores/settings";
import { HEADING, PROSE } from "@/ui/help-sections/shared";

// -- Editing Lyrics -----------------------------------------------------------

const EditSection: React.FC = () => {
  const splitCharacter = useSettingsStore((s) => s.splitCharacter);

  return (
    <div className="space-y-5">
      <p className={PROSE}>
        Each row is one line of lyrics. Type normally, press Enter for a new line. To reorder lines, drag them using the
        handle on the left side.
      </p>

      <div>
        <h4 className={HEADING}>Agents (singers)</h4>
        <p className={PROSE}>
          Click a line's agent dot to assign it to a different singer. Each agent gets a unique color. Add new agents
          with the "+" button in the agent manager at the top.
        </p>
      </div>

      <div>
        <h4 className={HEADING}>Background vocals</h4>
        <p className={PROSE}>
          If a line has backing vocals, add them in the "Background" field that appears below the main text. These show
          up as a separate track in the Timeline and get the x-bg role in TTML output.
        </p>
      </div>

      <div>
        <h4 className={HEADING}>Syllable pre-splitting</h4>
        <p className={PROSE}>
          Use the <span className="font-mono text-composer-text">{splitCharacter}</span> character to mark where you
          want words split. For example, typing beau{splitCharacter}ti{splitCharacter}ful creates three separate timed
          blocks instead of one. This is useful when a word stretches across several beats. You can change this
          character in Settings.
        </p>
      </div>

      <div>
        <h4 className={HEADING}>Selecting multiple lines</h4>
        <p className={PROSE}>
          Click a line to select it. Shift + Click another line to select the whole range between them. You can also
          click and drag on the line numbers in the gutter to select a range that way. Selected lines can be deleted or
          have agents reassigned in bulk.
        </p>
      </div>

      <div>
        <h4 className={HEADING}>Editing grouped lines</h4>
        <p className={PROSE}>
          Lines that belong to a linked group show a thin colored stripe on their left edge, matching the group color.
          Hover one to see which group it belongs to and how many other instances are linked.
        </p>
        <p className={`${PROSE} mt-2`}>
          Edits you make to a grouped line's text, agent, or background vocals fan out to every other instance of the
          same template line. Word-level timings survive when the new text has the same word count: existing word slots
          keep their begin/end and just swap text. If the word count changes, sibling timings clear so you can re-sync
          them in the Sync view.
        </p>
        <p className={`${PROSE} mt-2`}>
          Adding or removing rows inside a grouped instance pops a confirmation: that one instance detaches from the
          group so the structural change can land, while every sibling instance stays linked. Decline to revert. Edits
          to non-grouped lines never prompt.
        </p>
      </div>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { EditSection };
