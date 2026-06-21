const TtmlVsLrcContent: React.FC = () => (
  <>
    <p>
      TTML and LRC are both formats for synchronized lyrics. They look very different and solve slightly different
      problems. This guide covers how they compare, when to use each, and how to convert between them.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Quick comparison</h2>
    <div className="overflow-x-auto my-6">
      <table className="w-full text-sm border border-composer-border rounded-lg">
        <thead className="bg-composer-bg-elevated">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-composer-text border-b border-composer-border">
              Feature
            </th>
            <th className="text-left px-4 py-3 font-semibold text-composer-text border-b border-composer-border">
              LRC
            </th>
            <th className="text-left px-4 py-3 font-semibold text-composer-text border-b border-composer-border">
              TTML
            </th>
          </tr>
        </thead>
        <tbody className="text-composer-text-secondary">
          <tr>
            <td className="px-4 py-3 border-b border-composer-border">File format</td>
            <td className="px-4 py-3 border-b border-composer-border">Plain text</td>
            <td className="px-4 py-3 border-b border-composer-border">XML</td>
          </tr>
          <tr>
            <td className="px-4 py-3 border-b border-composer-border">Line timing</td>
            <td className="px-4 py-3 border-b border-composer-border">Yes</td>
            <td className="px-4 py-3 border-b border-composer-border">Yes</td>
          </tr>
          <tr>
            <td className="px-4 py-3 border-b border-composer-border">Word timing</td>
            <td className="px-4 py-3 border-b border-composer-border">Only in enhanced LRC</td>
            <td className="px-4 py-3 border-b border-composer-border">Yes, native</td>
          </tr>
          <tr>
            <td className="px-4 py-3 border-b border-composer-border">Multiple singers</td>
            <td className="px-4 py-3 border-b border-composer-border">No</td>
            <td className="px-4 py-3 border-b border-composer-border">Yes, via ttm:agent</td>
          </tr>
          <tr>
            <td className="px-4 py-3 border-b border-composer-border">Background vocals</td>
            <td className="px-4 py-3 border-b border-composer-border">No</td>
            <td className="px-4 py-3 border-b border-composer-border">Yes, via ttm:role x-bg</td>
          </tr>
          <tr>
            <td className="px-4 py-3">Used by</td>
            <td className="px-4 py-3">Desktop players, legacy apps</td>
            <td className="px-4 py-3">Apple Music, Spotify, Amazon Music</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">What LRC looks like</h2>
    <p>LRC puts a timestamp in square brackets at the start of each line. That is almost all there is to it.</p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`[ti:Song title]
[ar:Artist]
[00:12.34]First lyric line
[00:15.67]Second lyric line`}
    </pre>
    <p>
      Enhanced LRC (eLRC) adds inline per-word timestamps in angle brackets. The line-level timestamp stays, and each
      word gets a start time:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {"[00:12.34]<00:12.34>First <00:12.80>lyric <00:13.20>line<00:13.80>"}
    </pre>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">What TTML looks like</h2>
    <p>TTML is XML. The same two lines above become:</p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<p begin="00:00:12.340" end="00:00:15.670">
  <span begin="00:00:12.340" end="00:00:12.800">First</span>
  <span begin="00:00:12.800" end="00:00:13.200">lyric</span>
  <span begin="00:00:13.200" end="00:00:13.800">line</span>
</p>`}
    </pre>
    <p>
      The structure is richer. TTML wraps each line in a{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> element that can carry an agent, nest
      background vocals, and hold per-word spans with their own timing.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">When to use LRC</h2>
    <p>
      Stick with LRC when the target is a desktop player, a legacy app, or an internal tool that only needs line-level
      sync. LRC is easy to hand-edit, easy to diff in git, and easy for non-technical people to scan.
    </p>
    <p>
      LRC also works well as an intermediate format while you capture timing. Many authors prefer to rough out timing in
      LRC, then convert to TTML for delivery.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">When to use TTML</h2>
    <p>
      Pick TTML when the target is Apple Music, Spotify, Amazon Music, or any service that animates lyrics word by word.
      TTML is also the right choice when the song has multiple singers, background vocals, or call-and-response parts.
    </p>
    <p>
      If you need to ship a file that travels through a music distributor to a streaming platform, it is almost always
      going to be TTML.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Converting between them</h2>
    <p>
      Going from LRC or eLRC to TTML is common and lossless: line-level timing becomes{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> elements, inline word timestamps become
      nested <code className="font-mono text-composer-accent-text">&lt;span&gt;</code> elements. Use the{" "}
      <a href="/lrc-to-ttml" className="text-composer-accent-text hover:text-composer-accent">
        LRC to TTML converter
      </a>{" "}
      for a one-step conversion.
    </p>
    <p>
      Going from TTML back to LRC loses information: agents, background vocals, and nested structure do not fit into
      LRC. If you need LRC for legacy compatibility, the conversion is possible but you have to accept the loss.
    </p>
  </>
);

export default TtmlVsLrcContent;
