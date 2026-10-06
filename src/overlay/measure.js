// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — distances between two boxes (Alt + hover, as in Figma). PURE LOGIC.
//
//  `a` is the selection, `b` what the pointer is over (another layer, or the canvas). Boxes are
//  { x, y, w, h } in canvas pixels. The result is a list of segments to draw:
//  { x1, y1, x2, y2, value } for a measured distance, and { …, guide: true } for a dashed line
//  that shows where a distance is taken from when the two do not face each other.
// ─────────────────────────────────────────────────────────────────────────────

const edges = (r) => ({ l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h });
const round = (v) => Math.round(v * 10) / 10;

export function measure(a, b) {
  if (!a || !b) return [];
  const A = edges(a), B = edges(b);
  const out = [];
  const seg = (x1, y1, x2, y2) => {
    const value = round(Math.abs(x2 - x1) + Math.abs(y2 - y1));
    if (value > 0) out.push({ x1, y1, x2, y2, value });
  };
  const guide = (x1, y1, x2, y2) => {
    if (Math.abs(x2 - x1) + Math.abs(y2 - y1) > 0) out.push({ x1, y1, x2, y2, guide: true });
  };

  const gapX = A.r <= B.l || B.r <= A.l;   // side by side
  const gapY = A.b <= B.t || B.b <= A.t;   // one above the other

  if (!gapX && !gapY) {
    // Inside one another, or overlapping: the distances between matching edges, drawn through
    // the middle of the inner (or the selected) box.
    const inner = A.l >= B.l && A.r <= B.r && A.t >= B.t && A.b <= B.b ? A
      : B.l >= A.l && B.r <= A.r && B.t >= A.t && B.b <= A.b ? B : A;
    const outer = inner === A ? B : A;
    const cy = (inner.t + inner.b) / 2, cx = (inner.l + inner.r) / 2;
    seg(Math.min(inner.l, outer.l), cy, Math.max(inner.l, outer.l), cy);
    seg(Math.min(inner.r, outer.r), cy, Math.max(inner.r, outer.r), cy);
    seg(cx, Math.min(inner.t, outer.t), cx, Math.max(inner.t, outer.t));
    seg(cx, Math.min(inner.b, outer.b), cx, Math.max(inner.b, outer.b));
    return out;
  }

  if (gapX) {
    // Through the shared stretch if they have one, otherwise through the selection's middle,
    // with a dashed line up or down to the target's nearest corner.
    const top = Math.max(A.t, B.t), bottom = Math.min(A.b, B.b);
    const y = top < bottom ? (top + bottom) / 2 : (A.t + A.b) / 2;
    const [x1, x2, bx] = A.r <= B.l ? [A.r, B.l, B.l] : [B.r, A.l, B.r];
    seg(x1, y, x2, y);
    if (!(top < bottom)) guide(bx, y < B.t ? B.t : B.b, bx, y);
  }
  if (gapY) {
    const left = Math.max(A.l, B.l), right = Math.min(A.r, B.r);
    const x = left < right ? (left + right) / 2 : (A.l + A.r) / 2;
    const [y1, y2, by] = A.b <= B.t ? [A.b, B.t, B.t] : [B.b, A.t, B.b];
    seg(x, y1, x, y2);
    if (!(left < right)) guide(x < B.l ? B.l : B.r, by, x, by);
  }
  return out;
}
