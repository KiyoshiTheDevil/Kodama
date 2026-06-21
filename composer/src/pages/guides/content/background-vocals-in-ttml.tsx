const BackgroundVocalsContent: React.FC = () => (
  <>
    <p>
      Background vocals, ad libs, and harmonies are what TTML calls "x-bg" spans. They appear as a secondary lyric line
      on Apple Music, smaller and slightly offset from the main line. This guide covers how to structure them and when
      to use them.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">What x-bg means</h2>
    <p>
      The <code className="font-mono text-composer-accent-text">ttm:role="x-bg"</code> attribute marks a span as
      background content. Apple Music and other players that support the feature render x-bg content visually distinct
      from the main line, usually at a smaller size.
    </p>
    <p>
      The "x" prefix is XML convention for an experimental or platform-specific extension. "x-bg" became the de facto
      standard and most platforms render it.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">The structure</h2>
    <p>
      A background vocal lives inside the paragraph of the line it accompanies. The outer x-bg span carries no timing.
      Inner spans carry the timing.
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<p begin="00:00:12.000" end="00:00:16.000" ttm:agent="v1">
  <span begin="00:00:12.000" end="00:00:13.500">Main lyric word one</span>
  <span begin="00:00:13.500" end="00:00:16.000">two</span>
  <span ttm:role="x-bg">
    <span begin="00:00:13.000" end="00:00:14.500">oh yeah</span>
    <span begin="00:00:14.500" end="00:00:16.000">ooh</span>
  </span>
</p>`}
    </pre>
    <p>
      The outer <code className="font-mono text-composer-accent-text">&lt;span ttm:role="x-bg"&gt;</code> has no{" "}
      <code className="font-mono text-composer-accent-text">begin</code> or{" "}
      <code className="font-mono text-composer-accent-text">end</code> attribute. The inner spans do. The inner timing
      can overlap the main-line timing; both render together.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">When to use x-bg</h2>
    <p>Use x-bg for:</p>
    <ul className="list-disc pl-6 space-y-2">
      <li>Ad libs, interjections, and non-lead vocal phrases</li>
      <li>Harmony lines that echo the main lyric</li>
      <li>Background "oh"s, "ah"s, or spoken lines that are part of the song</li>
      <li>Featured vocalist phrases that overlap the lead line</li>
    </ul>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">When not to use x-bg</h2>
    <p>Do not use x-bg for:</p>
    <ul className="list-disc pl-6 space-y-2">
      <li>
        The main lead vocal line (that is the primary{" "}
        <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> content)
      </li>
      <li>
        A featured verse by a different artist (use{" "}
        <code className="font-mono text-composer-accent-text">ttm:agent</code> on a new paragraph instead)
      </li>
      <li>
        Any lyric line that stands on its own (put it in a new{" "}
        <code className="font-mono text-composer-accent-text">&lt;p&gt;</code>)
      </li>
    </ul>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Line-level background vocals</h2>
    <p>If the background part has no word-level timing, you can use a single timed span inside the x-bg wrapper:</p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<span ttm:role="x-bg">
  <span begin="00:00:13.000" end="00:00:14.500">background phrase</span>
</span>`}
    </pre>
    <p>This still follows the rule that the outer x-bg span has no timing and inner spans do.</p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Authoring x-bg in Composer</h2>
    <p>
      Open the edit view. Every line has a background text field. Type the background lyric there and the export will
      wrap it in an x-bg span automatically. For word-level background timing, switch to the sync view and sync the
      background words the same way you sync the main line.
    </p>
    <p>
      Composer preserves the exact space handling in background vocals. Trailing spaces in the source are preserved in
      the export, and the outer x-bg wrapper never gets stray timing attributes.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Related reading</h2>
    <p>
      The{" "}
      <a href="/guides/ttml-file-format-spec" className="text-composer-accent-text hover:text-composer-accent">
        TTML file format reference
      </a>{" "}
      covers the x-bg element alongside the rest of the format. The{" "}
      <a href="/guides/multi-agent-lyrics-duets" className="text-composer-accent-text hover:text-composer-accent">
        multi-agent duets guide
      </a>{" "}
      covers how x-bg and agent attribution interact on the same line.
    </p>
  </>
);

export default BackgroundVocalsContent;
