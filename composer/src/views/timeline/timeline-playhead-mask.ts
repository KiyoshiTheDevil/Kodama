// -- Constants -----------------------------------------------------------------

const MASK_DIM_ALPHA = 0.5;
const WORD_CORNER_RADIUS_PX = 12;

// -- Helpers -------------------------------------------------------------------

function cornerYInset(distFromEdge: number, radius: number): number {
  if (distFromEdge >= radius || distFromEdge < 0) return 0;
  const d = radius - distFromEdge;
  return radius - Math.sqrt(radius * radius - d * d);
}

function buildPlayheadMask(playheadCenterXViewport: number, containerTopViewport: number): string {
  const wordBlocks = document.querySelectorAll("[data-word-block]");
  const ranges: { top: number; bottom: number }[] = [];
  for (const wb of wordBlocks) {
    const el = wb as HTMLElement;
    const r = el.getBoundingClientRect();
    if (playheadCenterXViewport < r.left || playheadCenterXViewport > r.right) continue;
    const sylPos = el.dataset.syllablePosition ?? "none";
    const leftR = sylPos === "middle" || sylPos === "last" ? 0 : WORD_CORNER_RADIUS_PX;
    const rightR = sylPos === "middle" || sylPos === "first" ? 0 : WORD_CORNER_RADIUS_PX;
    const yInset = Math.max(
      cornerYInset(playheadCenterXViewport - r.left, leftR),
      cornerYInset(r.right - playheadCenterXViewport, rightR),
    );
    ranges.push({ top: r.top - containerTopViewport + yInset, bottom: r.bottom - containerTopViewport - yInset });
  }

  if (ranges.length === 0) return "";
  ranges.sort((a, b) => a.top - b.top);
  const merged: { top: number; bottom: number }[] = [{ ...ranges[0] }];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i].top <= last.bottom) {
      last.bottom = Math.max(last.bottom, ranges[i].bottom);
    } else {
      merged.push({ ...ranges[i] });
    }
  }
  const dim = `rgba(0,0,0,${MASK_DIM_ALPHA})`;
  const stops: string[] = ["black 0"];
  for (const r of merged) {
    stops.push(`black ${r.top}px`, `${dim} ${r.top}px`, `${dim} ${r.bottom}px`, `black ${r.bottom}px`);
  }
  stops.push("black 100%");
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

// -- Exports -------------------------------------------------------------------

export { buildPlayheadMask };
