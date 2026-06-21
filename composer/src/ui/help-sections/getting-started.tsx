import { getEffectiveKeysArray } from "@/stores/shortcut-bindings";
import { HEADING, PROSE } from "@/ui/help-sections/shared";
import { InlineKeyBadge } from "@/ui/inline-key-badge";
import { MOD_KEY } from "@/utils/platform";

// -- Getting Started ----------------------------------------------------------

const GettingStartedSection: React.FC = () => (
  <div className="space-y-5">
    <p className={PROSE}>
      Composer is the lyrics editor for{" "}
      <a
        href="https://betterlyrics.org"
        target="_blank"
        rel="noopener noreferrer"
        className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
      >
        Better Lyrics
      </a>
      . It guides you through four steps to create synced lyrics. Follow the tabs left-to-right for a guided experience,
      or jump straight to the Timeline for a DAW-like workflow.
      <br /> As of now, Composer is still in early access, so expect some rough edges. If you run into any issues or
      have feedback, please reach out on{" "}
      <a
        href="https://discord.gg/UsHE3d5fWF"
        target="_blank"
        rel="noopener noreferrer"
        className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
      >
        Discord
      </a>{" "}
      or submit an issue on{" "}
      <a
        href="https://github.com/better-lyrics/composer/issues/new/choose"
        target="_blank"
        rel="noopener noreferrer"
        className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
      >
        GitHub
      </a>
      .
    </p>

    <div className="space-y-4">
      <div>
        <h4 className={HEADING}>1. Import your audio</h4>
        <p className={PROSE}>
          Drop an audio file (MP3, WAV, M4A, OGG, FLAC) into the Import tab, or paste a YouTube URL to pull the audio
          from a video. Local files can also be dropped straight onto the Timeline. The waveform appears once the audio
          loads.
        </p>
      </div>
      <div>
        <h4 className={HEADING}>2. Add your lyrics</h4>
        <p className={PROSE}>
          Go to the Edit tab and type or paste your lyrics, one line per row. If you have a lyrics file (.lrc, .srt,
          .ttml, .txt), drop it there instead. You can also use{" "}
          <InlineKeyBadge keys={getEffectiveKeysArray("timeline.importLyrics")} /> in Timeline to import lyrics without
          leaving that view.
        </p>
      </div>
      <div>
        <h4 className={HEADING}>3. Sync the timing</h4>
        <p className={PROSE}>
          The Sync tab lets you sync words to the music using two keys: tap Space to mark gapless word boundaries, or
          hold F to capture a word's full duration. You can also tap Space while holding F to create gapless syllable
          boundaries. If you miss one, use the arrow keys to nudge the timing. For finer control, switch to Timeline and
          drag word blocks directly on the waveform.
        </p>
      </div>
      <div>
        <h4 className={HEADING}>4. Preview and export</h4>
        <p className={PROSE}>
          The Preview tab shows a live karaoke-style playback of your work. When you're happy with it, go to Export and
          download your TTML file. You can also copy the raw XML or export a project file to share with someone else.
        </p>
      </div>
    </div>

    <p className={PROSE}>
      The tabs are meant to be followed left-to-right, but you can jump between them anytime using {MOD_KEY} + 1 through
      6.
    </p>

    <div className="aspect-video w-full rounded-lg overflow-hidden border border-composer-border">
      <iframe
        src="https://www.youtube.com/embed/IEA0W4qpRIs?rel=0"
        title="Composer tutorial"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  </div>
);

// -- Exports ------------------------------------------------------------------

export { GettingStartedSection };
