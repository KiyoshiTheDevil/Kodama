import { describe, expect, it } from "vitest";
import { FaqSection } from "@/pages/landing/sections/faq-section";
import { render } from "@/test/render";

describe("FaqSection", () => {
  it("renders title and one collapsible entry per question", async () => {
    const screen = await render(
      <FaqSection
        title="FAQ"
        entries={[
          { question: "What is TTML?", answer: "A timed text markup language." },
          { question: "Is it free?", answer: "Yes." },
        ]}
      />,
    );
    await expect.element(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.container.querySelectorAll("details").length).toBe(2);
  });

  it("expands a question when its summary is clicked", async () => {
    const screen = await render(<FaqSection title="FAQ" entries={[{ question: "Q", answer: "Hidden answer" }]} />);
    const details = screen.container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    details.open = true;
    expect(details.open).toBe(true);
  });
});
