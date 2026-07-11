// Tiny store for the "context menu target": the actionable item that currently holds focus.
// Focusable rows call setContextTarget(spec) in their onFocus; when the Menu button is pressed,
// BigPicture reads the current target and opens a menu of its actions. Cleared on screen change
// so a stale target from a previous screen can't leak into the menu.
let _target = null; // { title, actions: [{ label, run }] } | null

export function setContextTarget(t) { _target = t; }
export function getContextTarget() { return _target; }
export function clearContextTarget() { _target = null; }
