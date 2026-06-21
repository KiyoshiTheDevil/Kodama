const MultiAgentDuetsContent: React.FC = () => (
  <>
    <p>
      Most songs have one vocalist. Some have two, three, or more. Duets, group vocals, features, and call-and-response
      parts all need a way to mark who is singing which line. TTML handles this with agents.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">What an agent is</h2>
    <p>
      An agent is a named participant in the song. Each agent has an{" "}
      <code className="font-mono text-composer-accent-text">xml:id</code>, a{" "}
      <code className="font-mono text-composer-accent-text">type</code>, and an optional{" "}
      <code className="font-mono text-composer-accent-text">ttm:name</code>. Every lyric line can reference one agent
      using the <code className="font-mono text-composer-accent-text">ttm:agent</code> attribute.
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<ttm:agent xml:id="v1" type="person">
  <ttm:name>Lead vocalist</ttm:name>
</ttm:agent>
<ttm:agent xml:id="v2" type="person">
  <ttm:name>Featured artist</ttm:name>
</ttm:agent>`}
    </pre>
    <p>
      Declare agents in the <code className="font-mono text-composer-accent-text">&lt;metadata&gt;</code> block inside{" "}
      <code className="font-mono text-composer-accent-text">&lt;head&gt;</code>. Reference them from lines in the{" "}
      <code className="font-mono text-composer-accent-text">&lt;body&gt;</code>.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Agent types</h2>
    <p>
      The <code className="font-mono text-composer-accent-text">type</code> attribute describes what kind of entity is
      singing:
    </p>
    <ul className="list-disc pl-6 space-y-2">
      <li>
        <code className="font-mono text-composer-accent-text">person</code>: a named individual (most common)
      </li>
      <li>
        <code className="font-mono text-composer-accent-text">group</code>: a band or choir singing together
      </li>
      <li>
        <code className="font-mono text-composer-accent-text">character</code>: a fictional character in a narrative
        song
      </li>
      <li>
        <code className="font-mono text-composer-accent-text">organization</code>: an institutional voice
      </li>
      <li>
        <code className="font-mono text-composer-accent-text">other</code>: fallback for anything else
      </li>
    </ul>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Assigning lines</h2>
    <p>
      Each line gets one agent. The attribute lives on the{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> element:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<p begin="00:00:12.000" end="00:00:15.000" ttm:agent="v1">
  Lead singer takes this line
</p>
<p begin="00:00:15.000" end="00:00:18.000" ttm:agent="v2">
  Featured artist responds
</p>`}
    </pre>
    <p>
      You can alternate agents line by line. Apple Music uses the agent to position the line visually, typically with
      different singers' lines rendering on different sides of the screen.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Duets with overlapping lines</h2>
    <p>
      If two singers sing at the same time on different lines, keep them in separate{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> elements with overlapping timing:
    </p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<p begin="00:00:12.000" end="00:00:15.000" ttm:agent="v1">
  First vocalist's part
</p>
<p begin="00:00:12.500" end="00:00:15.200" ttm:agent="v2">
  Second vocalist at the same time
</p>`}
    </pre>
    <p>If they sing the same line together, assign the line to a group agent instead of splitting.</p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Group vocals</h2>
    <p>For choruses where everyone sings together, declare a group agent and use it for the group parts:</p>
    <pre className="bg-composer-bg-dark border border-composer-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-composer-text">
      {`<ttm:agent xml:id="v1" type="person">
  <ttm:name>Lead</ttm:name>
</ttm:agent>
<ttm:agent xml:id="v2" type="person">
  <ttm:name>Feature</ttm:name>
</ttm:agent>
<ttm:agent xml:id="group" type="group">
  <ttm:name>Both</ttm:name>
</ttm:agent>`}
    </pre>
    <p>
      Then tag chorus lines with <code className="font-mono text-composer-accent-text">ttm:agent="group"</code>. Verses
      stay tagged with the individual agents.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Agents and background vocals</h2>
    <p>
      Background vocals use <code className="font-mono text-composer-accent-text">ttm:role="x-bg"</code>, not a separate
      agent. The background span inherits the paragraph's agent. If the background part is sung by a different person
      than the main line, you have a design choice: put it on a separate{" "}
      <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> with the correct agent, or accept the
      inheritance.
    </p>
    <p>
      In practice, most platforms render background vocals as secondary content regardless of agent, so agent
      attribution for x-bg content is rarely visible.
    </p>

    <h2 className="text-2xl font-semibold text-composer-text mt-10 mb-4">Authoring agents in Composer</h2>
    <p>
      The settings modal has an agent editor. Add one agent per vocalist on the song, give each a clear name, and pick
      the right type. In the edit view, every line has an agent dropdown.
    </p>
    <p>
      Tag agents before you sync. Retagging a hundred lines after the fact is slow; tagging them during the initial text
      pass costs nothing.
    </p>
  </>
);

export default MultiAgentDuetsContent;
