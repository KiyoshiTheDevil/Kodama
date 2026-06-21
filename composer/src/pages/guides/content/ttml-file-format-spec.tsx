const TtmlFileFormatSpecContent: React.FC = () => (
  <>
    <p>
      This guide covers the TTML profile used by Apple Music, Spotify, and most modern synced-lyrics platforms. It is
      not the full W3C spec. It is the subset you actually need to ship.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Root element and namespaces</h2>
    <p>
      Every TTML file starts with a <code className="font-mono text-composer-accent-text">&lt;tt&gt;</code> element that
      declares the TTML and metadata namespaces:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:ttm="http://www.w3.org/ns/ttml#metadata"
    xmlns:ttp="http://www.w3.org/ns/ttml#parameter"
    ttp:timeBase="media"
    xml:lang="en">`}
    </pre>
    <p>
      The <code className="font-mono text-composer-accent-text">xmlns</code> attribute is required. The metadata and
      parameter namespaces are only needed if you use the features that live in them (agents, background vocals, timing
      configuration). <code className="font-mono text-composer-accent-text">xml:lang</code> tells the player what
      language the lyrics are in.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Head and metadata</h2>
    <p>
      The <code className="font-mono text-composer-accent-text">&lt;head&gt;</code> section carries song metadata and
      agent declarations:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<head>
  <metadata>
    <ttm:title>Example song</ttm:title>
    <ttm:agent xml:id="v1" type="person">
      <ttm:name>Lead vocalist</ttm:name>
    </ttm:agent>
    <ttm:agent xml:id="v2" type="person">
      <ttm:name>Featured artist</ttm:name>
    </ttm:agent>
  </metadata>
</head>`}
    </pre>
    <p>
      Every agent gets an <code className="font-mono text-composer-accent-text">xml:id</code> you reference later. The{" "}
      <code className="font-mono text-composer-accent-text">type</code> is usually
      <code className="font-mono text-composer-accent-text"> person</code>,{" "}
      <code className="font-mono text-composer-accent-text">group</code>,{" "}
      <code className="font-mono text-composer-accent-text">character</code>, or{" "}
      <code className="font-mono text-composer-accent-text">other</code>.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Body and paragraphs</h2>
    <p>
      The <code className="font-mono text-composer-accent-text">&lt;body&gt;</code> holds a single{" "}
      <code className="font-mono text-composer-accent-text">&lt;div&gt;</code> with one{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> per lyric line:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<body>
  <div>
    <p begin="00:00:12.000" end="00:00:15.200" ttm:agent="v1">
      First lyric line
    </p>
  </div>
</body>`}
    </pre>
    <p>
      The <code className="font-mono text-composer-accent-text">begin</code> and{" "}
      <code className="font-mono text-composer-accent-text">end</code> attributes are required. Time is in
      <code className="font-mono text-composer-accent-text"> HH:MM:SS.mmm</code> format. The{" "}
      <code className="font-mono text-composer-accent-text">ttm:agent</code> attribute points at an agent id declared in
      the head.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Word-level spans</h2>
    <p>
      Replace the plain text inside a paragraph with timed{" "}
      <code className="font-mono text-composer-accent-text">&lt;span&gt;</code> elements for per-word animation:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<p begin="00:00:12.000" end="00:00:15.200" ttm:agent="v1">
  <span begin="00:00:12.000" end="00:00:12.400">First</span>
  <span begin="00:00:12.400" end="00:00:13.000">lyric</span>
  <span begin="00:00:13.000" end="00:00:15.200">line</span>
</p>`}
    </pre>
    <p>
      Every word has its own begin and end. Whitespace between spans is preserved as the spacing you see in the output.
      If two words should not have a space between them, put them in the same span or skip the whitespace in the source.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Background vocals</h2>
    <p>
      Background vocals and ad libs use a wrapper span with{" "}
      <code className="font-mono text-composer-accent-text">ttm:role="x-bg"</code>:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<p begin="00:00:12.000" end="00:00:15.200" ttm:agent="v1">
  <span begin="00:00:12.000" end="00:00:13.500">Main lyric</span>
  <span ttm:role="x-bg">
    <span begin="00:00:13.000" end="00:00:14.000">oh yeah</span>
  </span>
</p>`}
    </pre>
    <p>
      The outer x-bg span carries no timing. Inner spans carry the timing. The platform renders the x-bg content as a
      smaller secondary lyric under the main line.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Time format</h2>
    <p>
      Use <code className="font-mono text-composer-accent-text">HH:MM:SS.mmm</code> for every timestamp. Zero padding is
      required. Examples: <code className="font-mono text-composer-accent-text">00:00:12.000</code> is twelve seconds.{" "}
      <code className="font-mono text-composer-accent-text">00:03:45.500</code> is three minutes, forty-five and a half
      seconds. Some parsers also accept <code className="font-mono text-composer-accent-text">MM:SS.mmm</code> but the
      three-part form is safer.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Character escaping</h2>
    <p>
      TTML is XML, so the standard XML escapes apply. Replace{" "}
      <code className="font-mono text-composer-accent-text">&amp;</code> with{" "}
      <code className="font-mono text-composer-accent-text">&amp;amp;</code> and{" "}
      <code className="font-mono text-composer-accent-text">&lt;</code> with{" "}
      <code className="font-mono text-composer-accent-text">&amp;lt;</code>. Composer handles this automatically on
      export.
    </p>
  </>
);

export default TtmlFileFormatSpecContent;
