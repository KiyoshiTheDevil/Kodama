// The corners of a control that sits in a group, in a form a theme can flatten.
//
// Four places build the same shape: the free ends of the group keep a pill radius, the ends
// that touch a neighbour get a small notch, written out as a four-value border-radius. Window
// header buttons, equalizer header buttons, the queue's tabs, the lyrics chips and the
// segmented pickers all do it, each from its own control height - so the numbers are computed
// and cannot themselves be tokens.
//
// They can be capped by one, though. While --r-full is a pill radius the min() leaves every
// value exactly as it was; the moment a theme squares that token, the whole group squares with
// it. That is what lets a theme reach shapes that are worked out at runtime.
//
// Measured in Chromium 148 before relying on it: a four-value border-radius accepts min() per
// corner, computes to "15px 6px 6px 15px" normally and to 0px once --r-full is 0. Worth
// checking rather than assuming - an invalid shorthand is dropped whole, which would have left
// every one of these controls square in every theme.
export function groupCorners(left, right) {
  const cap = (px) => `min(${px}px, var(--r-full))`;
  return `${cap(left)} ${cap(right)} ${cap(right)} ${cap(left)}`;
}
