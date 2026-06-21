const WhatIsTtmlContent: React.FC = () => (
  <>
    <p>
      TTML stands for Timed Text Markup Language. It is a W3C standard for describing text that appears and disappears
      in sync with media playback. Apple Music, Spotify, Amazon Music, and most major streaming platforms use TTML to
      power their synchronized lyrics features.
    </p>
    <p>
      If you have seen a lyric line animate word by word while a song plays, you have seen TTML at work. The data behind
      that animation is a TTML file that ships alongside the audio.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">The shape of a TTML file</h2>
    <p>
      A TTML file is XML with a small set of tags. The outer wrapper is{" "}
      <code className="font-mono text-composer-accent-text">&lt;tt&gt;</code>. Inside are a{" "}
      <code className="font-mono text-composer-accent-text">&lt;head&gt;</code> with metadata and a{" "}
      <code className="font-mono text-composer-accent-text">&lt;body&gt;</code> with lyric lines. Each line is a{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> element with a begin and end attribute.
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <head>
    <metadata>
      <ttm:title>Example song</ttm:title>
    </metadata>
  </head>
  <body>
    <div>
      <p begin="00:00:12.000" end="00:00:15.200">
        This is the first lyric line
      </p>
    </div>
  </body>
</tt>`}
    </pre>
    <p>
      That is a line-synced TTML file. The whole line appears at 12 seconds and disappears at 15.2 seconds. The platform
      renders it as one block.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Word-level timing</h2>
    <p>
      The animated sing-along effect comes from nesting{" "}
      <code className="font-mono text-composer-accent-text">&lt;span&gt;</code> elements inside a line. Each span holds
      one word with its own begin and end attributes.
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<p begin="00:00:12.000" end="00:00:15.200">
  <span begin="00:00:12.000" end="00:00:12.400">This</span>
  <span begin="00:00:12.400" end="00:00:12.800">is</span>
  <span begin="00:00:12.800" end="00:00:13.200">the</span>
  <span begin="00:00:13.200" end="00:00:14.000">first</span>
  <span begin="00:00:14.000" end="00:00:15.200">line</span>
</p>`}
    </pre>
    <p>
      The rendering platform reads the timing and animates each word as its begin time passes the playhead. That is how
      the bouncing-word effect on Apple Music is produced.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Why TTML instead of LRC</h2>
    <p>
      LRC is simpler: one timestamp per line, plain text, easy to author in a notepad. It is enough for line-synced
      playback and remains popular for desktop players.
    </p>
    <p>
      TTML wins when you need word-level timing, multiple singers on the same track, background vocals, or precise
      metadata. It is also the format streaming platforms ingest. If you want synced lyrics on Apple Music, you need
      TTML.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Who authors TTML files</h2>
    <p>
      Record labels, music distributors, and independent artists all ship TTML. Labels deliver TTML through partners
      like Musixmatch or direct via Apple's Content Collector. Independent artists usually author TTML themselves and
      hand it to their distributor.
    </p>
    <p>
      Writing TTML by hand is possible but slow. A single song can have hundreds of word spans, each with
      millisecond-accurate begin and end times. Tools like Composer exist to capture timing from audio taps and
      serialize the XML for you.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Next steps</h2>
    <p>
      If you want to understand the details of the format, the{" "}
      <a href="/guides/ttml-file-format-spec" className="text-composer-accent-text hover:text-composer-accent">
        TTML file format reference
      </a>{" "}
      covers every tag Apple Music uses. If you want to ship a file today, open{" "}
      <a href="/" className="text-composer-accent-text hover:text-composer-accent">
        Composer
      </a>{" "}
      and import your audio.
    </p>
  </>
);

export default WhatIsTtmlContent;
