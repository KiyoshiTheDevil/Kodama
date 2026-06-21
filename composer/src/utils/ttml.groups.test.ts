import type { Agent } from "@/domain/agent/model";
import type { LinkGroup } from "@/domain/group/template";
import type { ProjectMetadata } from "@/domain/project/metadata";
import { parseLyricsFile } from "@/utils/lyrics-parsers";
import { generateTTML } from "@/utils/ttml";
import { describe, expect, it } from "vitest";

const baseMetadata: ProjectMetadata = { title: "Test", artist: "", album: "", duration: 60 };
const baseAgents: Agent[] = [{ id: "v1", type: "person", name: "Lead" }];

describe("ttml export · groups registry", () => {
  it("emits composer:groups when project has groups", () => {
    const groups: LinkGroup[] = [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }];
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [],
      groups,
      granularity: "word",
    });

    expect(ttml).toContain("<composer:groups>");
    expect(ttml).toContain('id="g1"');
    expect(ttml).toContain('label="Chorus"');
    expect(ttml).toContain('color="#f472b6"');
    expect(ttml).toContain('templateVersion="1"');
    expect(ttml).toContain("</composer:groups>");
  });

  it("emits multiple groups in order", () => {
    const groups: LinkGroup[] = [
      { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 2 },
      { id: "g2", label: "Verse", color: "#60a5fa", templateVersion: 1 },
    ];
    const ttml = generateTTML({ metadata: baseMetadata, agents: baseAgents, lines: [], groups, granularity: "word" });

    const i1 = ttml.indexOf('id="g1"');
    const i2 = ttml.indexOf('id="g2"');
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(ttml).toContain('label="Verse"');
  });

  it("escapes label and color values", () => {
    const groups: LinkGroup[] = [{ id: "g1", label: "Pre & Post", color: "#aaaaaa", templateVersion: 1 }];
    const ttml = generateTTML({ metadata: baseMetadata, agents: baseAgents, lines: [], groups, granularity: "word" });

    expect(ttml).toContain('label="Pre &amp; Post"');
  });

  it("omits the registry block when groups is undefined", () => {
    const ttml = generateTTML({ metadata: baseMetadata, agents: baseAgents, lines: [], granularity: "word" });
    expect(ttml).not.toContain("<composer:groups>");
  });

  it("omits the registry block when groups is empty", () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [],
      groups: [],
      granularity: "word",
    });
    expect(ttml).not.toContain("<composer:groups>");
  });
});

describe("ttml export · per-line group attrs", () => {
  const groups: LinkGroup[] = [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }];

  function syncedLine(
    id: string,
    extras: Partial<{ groupId: string; instanceIdx: number; templateLineIdx: number; detached: boolean }>,
  ) {
    return {
      id,
      text: "hello",
      agentId: "v1",
      begin: 0,
      end: 1,
      ...extras,
    };
  }

  it("emits composer:groupId/instanceIdx/templateLineIdx on grouped lines", () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [syncedLine("a", { groupId: "g1", instanceIdx: 2, templateLineIdx: 0 })],
      groups,
      granularity: "line",
    });

    expect(ttml).toContain('composer:groupId="g1"');
    expect(ttml).toContain('composer:instanceIdx="2"');
    expect(ttml).toContain('composer:templateLineIdx="0"');
  });

  it("omits group attrs on standalone lines", () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [syncedLine("a", {})],
      groups: [],
      granularity: "line",
    });

    expect(ttml).not.toContain("composer:groupId");
    expect(ttml).not.toContain("composer:instanceIdx");
  });

  it("emits composer:detached only when true", () => {
    const t1 = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [syncedLine("a", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0, detached: true })],
      groups,
      granularity: "line",
    });
    expect(t1).toContain('composer:detached="true"');

    const t2 = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [syncedLine("b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0, detached: false })],
      groups,
      granularity: "line",
    });
    expect(t2).not.toContain("composer:detached");
  });
});

describe("ttml import · groups registry", () => {
  it("parses composer:groups registry from head metadata", () => {
    const groups: LinkGroup[] = [
      { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 3 },
      { id: "g2", label: "Verse", color: "#60a5fa", templateVersion: 1 },
    ];
    const ttml = generateTTML({ metadata: baseMetadata, agents: baseAgents, lines: [], groups, granularity: "word" });
    const result = parseLyricsFile("test.ttml", ttml);

    expect(result.groups).toHaveLength(2);
    expect(result.groups?.find((g) => g.id === "g1")?.label).toBe("Chorus");
    expect(result.groups?.find((g) => g.id === "g1")?.templateVersion).toBe(3);
    expect(result.groups?.find((g) => g.id === "g2")?.label).toBe("Verse");
  });

  it("returns no groups when none in TTML", () => {
    const ttml = generateTTML({ metadata: baseMetadata, agents: baseAgents, lines: [], granularity: "word" });
    const result = parseLyricsFile("test.ttml", ttml);
    expect(result.groups).toBeUndefined();
  });
});

describe("ttml import · per-line group attrs", () => {
  const groups: LinkGroup[] = [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }];

  it("round-trips group attrs through export → import", () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [
        {
          id: "a",
          text: "I love you",
          agentId: "v1",
          begin: 30,
          end: 32,
          groupId: "g1",
          instanceIdx: 2,
          templateLineIdx: 0,
        },
      ],
      groups,
      granularity: "line",
    });
    const result = parseLyricsFile("test.ttml", ttml);

    expect(result.lines[0].groupId).toBe("g1");
    expect(result.lines[0].instanceIdx).toBe(2);
    expect(result.lines[0].templateLineIdx).toBe(0);
    expect(result.lines[0].detached).toBeUndefined();
  });

  it("round-trips composer:detached flag", () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [
        {
          id: "a",
          text: "yeah",
          agentId: "v1",
          begin: 30,
          end: 32,
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 1,
          detached: true,
        },
      ],
      groups,
      granularity: "line",
    });
    const result = parseLyricsFile("test.ttml", ttml);
    expect(result.lines[0].detached).toBe(true);
  });

  it("ignores groupId that doesn't reference a known group (warns and treats as standalone)", () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [
        {
          id: "a",
          text: "hi",
          agentId: "v1",
          begin: 0,
          end: 1,
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
        },
      ],
      groups: [],
      granularity: "line",
    });
    const result = parseLyricsFile("test.ttml", ttml);
    expect(result.lines[0].groupId).toBeUndefined();
  });

  it("backward compat: TTML without composer attrs imports cleanly", () => {
    const flatTtml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
      <head><metadata><ttm:agent xml:id="v1" type="person"><ttm:name>Lead</ttm:name></ttm:agent></metadata></head>
      <body><div>
        <p begin="00:00:00.000" end="00:00:01.000" ttm:agent="v1">Hello</p>
      </div></body>
    </tt>`;
    const result = parseLyricsFile("flat.ttml", flatTtml);
    expect(result.lines[0].text).toBe("Hello");
    expect(result.lines[0].groupId).toBeUndefined();
    expect(result.groups).toBeUndefined();
  });
});

describe("ttml export · explicit word attribute", () => {
  it('emits composer:explicit="true" only on flagged words', () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [
        {
          id: "a",
          text: "clean dirty",
          agentId: "v1",
          words: [
            { text: "clean ", begin: 1, end: 1.5 },
            { text: "dirty", begin: 1.5, end: 2, explicit: true },
          ],
        },
      ],
      granularity: "word",
    });
    expect(ttml).toContain(">clean</span>");
    expect(ttml).toMatch(/<span begin="[^"]*" end="[^"]*" composer:explicit="true">dirty<\/span>/);
    expect(ttml).not.toContain('composer:explicit="true">clean');
  });

  it("emits composer:explicit on a background word's inner span, not the x-bg container", () => {
    const ttml = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: [
        {
          id: "a",
          text: "main",
          agentId: "v1",
          words: [{ text: "main", begin: 1, end: 2 }],
          backgroundText: "oh shit",
          backgroundWords: [
            { text: "oh ", begin: 2, end: 2.25 },
            { text: "shit", begin: 2.25, end: 2.5, explicit: true },
          ],
        },
      ],
      granularity: "word",
    });
    expect(ttml).toContain(`<span ttm:role="x-bg">`);
    expect(ttml).not.toMatch(/<span [^>]*ttm:role="x-bg"[^>]*composer:explicit/);
    expect(ttml).not.toMatch(/<span [^>]*composer:explicit[^>]*ttm:role="x-bg"/);
    expect(ttml).toMatch(/<span begin="[^"]*" end="[^"]*" composer:explicit="true">shit<\/span>/);
  });

  it("round-trip: AMLL amll:obscene import → export normalizes to composer:explicit", () => {
    const amll = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1"><span begin="00:01.000" end="00:01.500">clean</span> <span begin="00:01.500" end="00:02.000" amll:obscene="true">dirty</span></p></div></body></tt>`;
    const imported = parseLyricsFile("amll.ttml", amll);
    expect(imported.lines[0].words![1].explicit).toBe(true);

    const exported = generateTTML({
      metadata: baseMetadata,
      agents: baseAgents,
      lines: imported.lines,
      granularity: "word",
    });
    expect(exported).toMatch(/composer:explicit="true">dirty/);
    expect(exported).not.toContain("amll:obscene");

    const reimported = parseLyricsFile("re.ttml", exported);
    expect(reimported.lines[0].words![1].explicit).toBe(true);
  });
});
