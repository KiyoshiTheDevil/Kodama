import { render } from "@/test/render";
import { SuggestionsBanner } from "@/views/timeline/suggestions-banner";
import { IconBulb } from "@tabler/icons-react";
import { describe, expect, it, vi } from "vitest";

interface FakeSuggestion {
  fingerprint: string;
  label: string;
}

function makeBanner(overrides: {
  suggestions: FakeSuggestion[];
  dismissed?: string[];
  onAccept?: (s: FakeSuggestion) => void;
  onDismiss?: (s: FakeSuggestion) => void;
  onAcceptAll?: (visible: FakeSuggestion[]) => void;
  onDismissAll?: (visible: FakeSuggestion[]) => void;
}) {
  return (
    <SuggestionsBanner<FakeSuggestion>
      suggestions={overrides.suggestions}
      dismissed={overrides.dismissed ?? []}
      icon={IconBulb}
      iconClass="text-composer-accent"
      accentClass="bg-composer-accent/8"
      modalTitle="Fake suggestions"
      multiText={(count) => `Found ${count} fake suggestions`}
      modalCountText={(count) => `${count} fake thing${count === 1 ? "" : "s"} detected`}
      accept={{ label: "Apply", rowLabel: "Row apply", icon: IconBulb }}
      acceptAll={{ label: "Apply all", icon: IconBulb }}
      rowKey={(s) => s.fingerprint}
      renderInline={(s) => <span>{s.label}</span>}
      renderRow={(s) => <span>{s.label}</span>}
      onAccept={overrides.onAccept ?? (() => {})}
      onDismiss={overrides.onDismiss ?? (() => {})}
      onAcceptAll={overrides.onAcceptAll ?? (() => {})}
      onDismissAll={overrides.onDismissAll ?? (() => {})}
    />
  );
}

describe("SuggestionsBanner", () => {
  it("renders nothing when there are no visible suggestions", async () => {
    const screen = await render(makeBanner({ suggestions: [] }));
    expect(screen.container.textContent ?? "").toBe("");
  });

  it("hides suggestions whose fingerprint is dismissed", async () => {
    const screen = await render(
      makeBanner({
        suggestions: [{ fingerprint: "f1", label: "only one" }],
        dismissed: ["f1"],
      }),
    );
    expect(screen.container.textContent ?? "").toBe("");
  });

  it("renders the single-suggestion inline content and accepts it", async () => {
    const onAccept = vi.fn();
    const screen = await render(makeBanner({ suggestions: [{ fingerprint: "f1", label: "lonely line" }], onAccept }));
    expect(screen.container.textContent ?? "").toContain("lonely line");

    await screen.getByRole("button", { name: /apply/i }).click();
    expect(onAccept).toHaveBeenCalledWith({ fingerprint: "f1", label: "lonely line" });
  });

  it("dismisses the single suggestion when the dismiss button is clicked", async () => {
    const onDismiss = vi.fn();
    const screen = await render(makeBanner({ suggestions: [{ fingerprint: "f1", label: "lonely line" }], onDismiss }));

    await screen.getByRole("button", { name: "Dismiss suggestion" }).click();
    expect(onDismiss).toHaveBeenCalledWith({ fingerprint: "f1", label: "lonely line" });
  });

  it("shows the multi-suggestion summary and opens the review modal", async () => {
    const screen = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
        ],
      }),
    );
    expect(screen.container.textContent ?? "").toContain("Found 2 fake suggestions");

    await screen.getByRole("button", { name: /review 2/i }).click();
    await expect.element(screen.getByRole("heading", { name: "Fake suggestions" })).toBeInTheDocument();
    await expect.element(screen.getByText("2 fake things detected")).toBeInTheDocument();
  });

  it("dismisses all suggestions from the multi-suggestion banner", async () => {
    const onDismissAll = vi.fn();
    const screen = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
        ],
        onDismissAll,
      }),
    );

    await screen.getByRole("button", { name: "Dismiss all suggestions" }).click();
    expect(onDismissAll).toHaveBeenCalledTimes(1);
    expect(onDismissAll).toHaveBeenCalledWith([
      { fingerprint: "f1", label: "first" },
      { fingerprint: "f2", label: "second" },
    ]);
  });

  it("passes only the non-dismissed suggestions to onDismissAll", async () => {
    const onDismissAll = vi.fn();
    const screen = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
          { fingerprint: "f3", label: "third" },
        ],
        dismissed: ["f2"],
        onDismissAll,
      }),
    );

    await screen.getByRole("button", { name: "Dismiss all suggestions" }).click();
    expect(onDismissAll).toHaveBeenCalledWith([
      { fingerprint: "f1", label: "first" },
      { fingerprint: "f3", label: "third" },
    ]);
  });

  it("accepts every suggestion from the modal 'apply all' button", async () => {
    const onAcceptAll = vi.fn();
    const screen = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
        ],
        onAcceptAll,
      }),
    );

    await screen.getByRole("button", { name: /review 2/i }).click();
    await screen.getByRole("button", { name: /apply all/i }).click();
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
    expect(onAcceptAll).toHaveBeenCalledWith([
      { fingerprint: "f1", label: "first" },
      { fingerprint: "f2", label: "second" },
    ]);
  });

  it("passes only the non-dismissed suggestions to onAcceptAll", async () => {
    const onAcceptAll = vi.fn();
    const screen = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
          { fingerprint: "f3", label: "third" },
        ],
        dismissed: ["f1"],
        onAcceptAll,
      }),
    );

    await screen.getByRole("button", { name: /review 2/i }).click();
    await screen.getByRole("button", { name: /apply all/i }).click();
    expect(onAcceptAll).toHaveBeenCalledWith([
      { fingerprint: "f2", label: "second" },
      { fingerprint: "f3", label: "third" },
    ]);
  });

  it("accepts a single row from inside the modal", async () => {
    const onAccept = vi.fn();
    const screen = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
        ],
        onAccept,
      }),
    );

    await screen.getByRole("button", { name: /review 2/i }).click();
    await expect.element(screen.getByRole("heading", { name: "Fake suggestions" })).toBeInTheDocument();
    await screen.getByRole("button", { name: "Row apply", exact: true }).nth(0).click();
    expect(onAccept).toHaveBeenCalledWith({ fingerprint: "f1", label: "first" });
  });

  it("renders the modal per-row accept button with its own row label, distinct from the inline label", async () => {
    const screen = await render(makeBanner({ suggestions: [{ fingerprint: "f1", label: "lonely line" }] }));

    await expect.element(screen.getByRole("button", { name: "Apply", exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Row apply", exact: true }).elements().length).toBe(0);

    const screenMulti = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
        ],
      }),
    );

    await screenMulti.getByRole("button", { name: /review 2/i }).click();
    await expect.element(screenMulti.getByRole("heading", { name: "Fake suggestions" })).toBeInTheDocument();

    await expect
      .element(screenMulti.getByRole("button", { name: "Row apply", exact: true }).first())
      .toBeInTheDocument();
    expect(screenMulti.getByRole("button", { name: "Apply", exact: true }).elements().length).toBe(0);
  });

  it("closes the modal with the Escape key", async () => {
    const screen = await render(
      makeBanner({
        suggestions: [
          { fingerprint: "f1", label: "first" },
          { fingerprint: "f2", label: "second" },
        ],
      }),
    );

    await screen.getByRole("button", { name: /review 2/i }).click();
    await expect.element(screen.getByRole("heading", { name: "Fake suggestions" })).toBeInTheDocument();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect
      .poll(() => screen.container.ownerDocument.body.textContent ?? "")
      .not.toContain("fake things detected");
  });
});
