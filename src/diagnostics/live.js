// A tiny live-measurements board.
//
// It exists because of a fault that has never reproduced on the developer's machine: a growing
// blank area under long track lists, reported by a tester across several releases. Guessing at
// it from a description cost two releases already. A bug report helps only after the fact and
// only if it is sent; a panel the tester can switch on shows the numbers WHILE the list is in
// the broken state, which is the only moment they mean anything.
//
// Deliberately not React state: views publish from scroll handlers, and routing that through a
// context would re-render the very list being measured. Subscribers are only the panel itself.

const sections = new Map();   // name -> { at, values }
const listeners = new Set();

/**
 * Publish (and replace) one section's values. Cheap enough for a scroll handler: it stores an
 * object and notifies at most the open panel.
 */
export function publishDiag(section, values) {
  sections.set(section, { at: Date.now(), values });
  for (const fn of listeners) {
    try { fn(); } catch { /* a broken listener must not break the view */ }
  }
}

/** Remove a section when its view unmounts, so the panel never shows a stale screen's numbers. */
export function clearDiag(section) {
  if (sections.delete(section)) {
    for (const fn of listeners) {
      try { fn(); } catch { /* ignore */ }
    }
  }
}

export function subscribeDiag(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function readDiag() {
  return [...sections.entries()].map(([name, s]) => ({ name, ...s }));
}

/** Everything as plain text, for pasting into a message. */
export function diagText() {
  const env = [
    `window ${window.innerWidth}x${window.innerHeight}`,
    `dpr ${window.devicePixelRatio}`,
    `ua ${navigator.userAgent.slice(0, 90)}`,
  ].join("\n  ");
  const body = readDiag()
    .map(({ name, values }) =>
      `${name}\n` + Object.entries(values).map(([k, v]) => `  ${k}: ${v}`).join("\n"))
    .join("\n\n");
  return `Kodama diagnostics ${new Date().toISOString()}\n\nenvironment\n  ${env}\n\n${body}\n`;
}
