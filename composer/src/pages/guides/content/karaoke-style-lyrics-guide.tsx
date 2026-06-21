const KaraokeStyleLyricsContent: React.FC = () => (
  <>
    <p>
      Karaoke-style lyrics highlight each word or syllable as the singer sings it. The bouncing-ball effect, the
      word-by-word color change, the syllable-level fill: they all come from fine-grained timing inside a TTML file.
      This guide covers the techniques that make karaoke lyrics feel right.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Word timing vs syllable timing</h2>
    <p>
      Word timing means one span per word. Syllable timing means one span per syllable. Platforms that render "bouncing"
      or "filling" lyrics usually support both, though each word-span still animates as a unit.
    </p>
    <p>
      Use word timing for most content. Reserve syllable timing for slow ballads, stretched vowels, or sections where
      the artist clearly pronounces each syllable beat by beat.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Splitting a word into syllables</h2>
    <p>
      In Composer, use the split action on any word to break it into smaller timed units. The split distributes the
      word's duration proportionally based on syllable length. Fine tune the boundary in the timeline.
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<!-- Before: one word span -->
<span begin="00:00:15.000" end="00:00:17.000">beautiful</span>

<!-- After: three syllable spans -->
<span begin="00:00:15.000" end="00:00:15.500">beau</span>
<span begin="00:00:15.500" end="00:00:16.200">ti</span>
<span begin="00:00:16.200" end="00:00:17.000">ful</span>`}
    </pre>
    <p>
      Keep the total span of the original word intact. Starting at 15.0 and ending at 17.0 is the same total; you are
      just subdividing.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Pacing and the vocal onset</h2>
    <p>
      Each word's begin time should match the vocal onset, not the beat. Singers often lag slightly behind the beat or
      push slightly ahead. Match the voice, not the drum.
    </p>
    <p>
      A good rule: if you close your eyes and listen, the word that is currently highlighted should be the word you hear
      being sung right now. If the highlight is slightly ahead, the begin time is too early.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Held notes and sustains</h2>
    <p>
      When a singer sustains a word, extend its end time rather than creating a gap. The word stays highlighted until
      the next word begins. Gaps between words feel wrong during slow sections.
    </p>
    <p>For a word that bleeds into the next line, end it at the next line's begin time. Never overlap timings.</p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Breaths and non-lyrical sounds</h2>
    <p>
      Do not create spans for breaths, "ooh", or "ah" unless they are in the lyric sheet. Keep the lyrics to what is
      actually written. The animation flows better with accurate lyric lines than with captured ad libs.
    </p>
    <p>
      If an ad lib is a meaningful part of the song, add it as a background vocal with an x-bg span so it renders as a
      secondary line.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Testing your karaoke timing</h2>
    <p>
      Use the preview view in Composer. Watch the animation as the audio plays. The highlighted word should match the
      word being sung at all times.
    </p>
    <p>Common issues to catch:</p>
    <ul className="list-disc pl-6 space-y-2">
      <li>Words that highlight late: begin time is too high</li>
      <li>Words that snap off before the singer finishes: end time is too early</li>
      <li>Long gaps between words during sustained notes: end the sustained word at the next word's begin</li>
      <li>Multiple words highlighted at once: overlapping spans; re-check boundaries</li>
    </ul>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Keyboard flow for fast syncing</h2>
    <p>
      Composer is built for keyboard-first syncing. Bind the "next word" shortcut to a comfortable key and leave the
      mouse alone while the track plays. You will sync an entire song in one playthrough once the keybinding feels
      natural.
    </p>
    <p>
      The{" "}
      <a
        href="/guides/how-to-make-apple-music-synced-lyrics"
        className="text-composer-accent-text hover:text-composer-accent"
      >
        Apple Music workflow guide
      </a>{" "}
      walks through the full sync process. The{" "}
      <a href="/guides/background-vocals-in-ttml" className="text-composer-accent-text hover:text-composer-accent">
        background vocals guide
      </a>{" "}
      covers the x-bg usage in detail.
    </p>
  </>
);

export default KaraokeStyleLyricsContent;
