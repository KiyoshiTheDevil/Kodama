const LrcToTtmlConversionContent: React.FC = () => (
  <>
    <p>
      Converting LRC to TTML is common. This guide covers what the conversion actually does, how plain LRC and enhanced
      LRC differ in practice, and what happens to metadata along the way.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">The shortcut</h2>
    <p>
      If you just want the tool, use the{" "}
      <a href="/lrc-to-ttml" className="text-composer-accent-text hover:text-composer-accent">
        LRC to TTML converter
      </a>
      . Paste your input, download the TTML. Keep reading if you want to understand what is happening underneath.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Plain LRC to TTML</h2>
    <p>
      Plain LRC has one timestamp per line. Each line becomes a single{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> in TTML with a begin attribute equal to the
      LRC timestamp. The end attribute is the next line's begin time.
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`[00:12.34]First line
[00:15.67]Second line

<!-- becomes -->

<p begin="00:00:12.340" end="00:00:15.670">First line</p>
<p begin="00:00:15.670" end="...">Second line</p>`}
    </pre>
    <p>
      The last line's end time does not exist in LRC. Composer uses the audio duration if you have loaded audio, or
      leaves the end undefined.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Enhanced LRC (eLRC) to TTML</h2>
    <p>eLRC has inline word timestamps in angle brackets. Each inline timestamp becomes a word boundary in TTML:</p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`[00:12.34]<00:12.34>Hello <00:12.80>world<00:13.20>

<!-- becomes -->

<p begin="00:00:12.340" end="00:00:13.200">
  <span begin="00:00:12.340" end="00:00:12.800">Hello</span>
  <span begin="00:00:12.800" end="00:00:13.200">world</span>
</p>`}
    </pre>
    <p>
      The trailing inline timestamp (the last angle-bracket before the end of the line) serves as the end time of the
      last word. If there is no trailing timestamp, the last word's end falls through to the next line's begin.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Metadata handling</h2>
    <p>
      LRC metadata tags like <code className="font-mono text-composer-accent-text">[ti:Song Title]</code>,{" "}
      <code className="font-mono text-composer-accent-text">[ar:Artist]</code>, and{" "}
      <code className="font-mono text-composer-accent-text">[al:Album]</code> map to the TTML metadata block. Title goes
      to <code className="font-mono text-composer-accent-text">&lt;ttm:title&gt;</code>. Artist and album survive the
      conversion but are not always emitted by every TTML generator, since they are not part of the streaming platform
      ingestion schema.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">What does not convert</h2>
    <p>LRC has no concept of:</p>
    <ul className="list-disc pl-6 space-y-2">
      <li>Multiple agents or singers (duets)</li>
      <li>Background vocals</li>
      <li>Line-level metadata beyond the global tags</li>
    </ul>
    <p>
      If your song needs any of these, the LRC to TTML conversion is a starting point, not the end product. Open the
      converted file in Composer and add agents, background vocals, and any other TTML- only structure.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Time format translation</h2>
    <p>
      LRC uses <code className="font-mono text-composer-accent-text">[mm:ss.xx]</code>. TTML uses{" "}
      <code className="font-mono text-composer-accent-text">HH:MM:SS.mmm</code>. The converter normalizes the format:{" "}
      <code className="font-mono text-composer-accent-text">[01:23.45]</code> becomes{" "}
      <code className="font-mono text-composer-accent-text">00:01:23.450</code>. Both are the same moment in time, just
      different text representations.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Multi-timestamp LRC lines</h2>
    <p>Some LRC files use multiple timestamps per line for repeated choruses:</p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {"[00:30.00][01:30.00][02:30.00]Chorus line"}
    </pre>
    <p>
      The converter expands these into three separate{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> elements in TTML, one per timestamp. If the
      line has inline word timing, the inline times are used for the first occurrence and stripped from the repeats
      (because the inline times are absolute, not relative, and repeats need different absolute times).
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Sanity checking the output</h2>
    <p>
      After conversion, open the TTML in Composer with the matching audio. Play through and check that the timing feels
      right. LRC timing is often approximate; TTML is more demanding. You will likely want to tighten a few word
      boundaries before delivery.
    </p>
  </>
);

export default LrcToTtmlConversionContent;
