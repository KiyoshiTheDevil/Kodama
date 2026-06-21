const AppleMusicSyncedLyricsContent: React.FC = () => (
  <>
    <p>
      This is an end-to-end workflow for authoring Apple Music synced lyrics. It covers file setup, timing capture,
      agents, background vocals, and the last-mile checks before delivery.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">What Apple Music expects</h2>
    <p>
      Apple Music ingests TTML files. The baseline file has line-level timing. The animated sing-along experience
      requires word-level timing. Apple also renders secondary lyric lines when you mark them as background vocals with
      ttm:role x-bg.
    </p>
    <p>
      Duets and featured artists need separate agents. Each line points at one agent using the{" "}
      <code className="font-mono text-composer-accent-text">ttm:agent</code> attribute.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Step 1: prepare your source material</h2>
    <p>
      Gather the final mastered audio file and a clean plain-text version of the lyrics. The lyrics should match the
      audio exactly, including repeats, ad libs, and featured verses.
    </p>
    <p>
      If the song has multiple vocalists, note which vocalist sings which lines. A two-column text file with the
      vocalist name and the line works well as a reference.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Step 2: set up the project in Composer</h2>
    <p>
      Open{" "}
      <a href="/" className="text-composer-accent-text hover:text-composer-accent">
        Composer
      </a>
      , import the audio file, and paste the lyrics. Define one agent per vocalist on the song. Give each agent a
      meaningful name so downstream QA teams know who is singing what.
    </p>
    <p>
      Assign every lyric line to its vocalist. Use the edit view to tag agents before you start syncing. Getting agents
      right before syncing saves time: you will not have to retag hundreds of lines later.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Step 3: capture line-level timing</h2>
    <p>
      Start with line-level sync. In the sync view, play the track and tap the key bound to "next line" as each line
      begins. Composer records the begin time for every line. The end time of one line becomes the begin time of the
      next.
    </p>
    <p>
      Line-level timing gets you a shippable file. Many Apple Music catalog tracks are line-synced only, and that is a
      valid output. Use this pass as a foundation.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">
      Step 4: upgrade key sections to word timing
    </h2>
    <p>
      Switch to word-sync for choruses, hooks, and any section the artist would want animated. In Composer, the sync
      view lets you tap per word. Play the track and tap as each word begins.
    </p>
    <p>
      Review the word boundaries in the timeline. Zoom in and drag any word that feels off. The timeline shows the audio
      waveform below the words, which makes it easy to snap a word boundary to the actual consonant or vowel onset.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Step 5: add background vocals</h2>
    <p>
      For ad libs and backing parts, use the background vocals field on the owning line. Composer wraps them in an x-bg
      span on export. Each background word can have its own timing if you need it.
    </p>
    <p>
      Only use background vocals for lines that are genuinely secondary. Leads stay on the main line. Backing harmonies
      that echo the lead should be x-bg. Ad libs and spoken interjections are almost always x-bg.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Step 6: check your work</h2>
    <p>
      Use the preview view to watch the animated playback alongside the audio. Every word should land on the beat. Lines
      should appear slightly before the vocalist starts singing, not after.
    </p>
    <p>
      Common issues: words that stretch past the next line, agent tags missed on a feature verse, x-bg spans nested on
      the wrong line. Catch these in preview rather than after delivery.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Step 7: export and deliver</h2>
    <p>
      Export the TTML from the export view. Inspect the file: the{" "}
      <code className="font-mono text-composer-accent-text">composer:timing</code> attribute should say "Word" for
      word-synced tracks and "Line" for line-synced tracks. Agents should be listed in the head. Background vocals
      should be wrapped in <code className="font-mono text-composer-accent-text">&lt;span ttm:role="x-bg"&gt;</code>.
    </p>
    <p>
      Hand the file to your distributor. Apple's Content Collector takes TTML directly if you have access. Otherwise
      your distributor or aggregator will handle delivery.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Related reading</h2>
    <p>
      Read the{" "}
      <a href="/guides/ttml-file-format-spec" className="text-composer-accent-text hover:text-composer-accent">
        TTML file format reference
      </a>{" "}
      if you want to understand the XML in detail. The{" "}
      <a href="/guides/multi-agent-lyrics-duets" className="text-composer-accent-text hover:text-composer-accent">
        multi-agent duets guide
      </a>{" "}
      covers advanced agent patterns.
    </p>
  </>
);

export default AppleMusicSyncedLyricsContent;
