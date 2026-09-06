// Artwork that fails to load falls back to the placeholder, not to the browser's broken-image
// icon.
//
// Where a track simply has no artwork, the views already draw a --placeholder-gradient tile
// (rows.jsx, queue-panel.jsx, home-view.jsx and a handful of others). A thumbnail that exists
// but does not arrive - a dead ytimg URL, a flaky connection, the image proxy having a bad
// moment - fell through that: the <img> stayed, and the browser drew its own torn-page glyph,
// which looks like a bug in the app rather than a missing picture.
//
// Done here, once, rather than as an onError on each of the ~50 <img> tags across 27 files.
// Resource errors do not bubble, hence the capture phase; that is also what makes this reach
// images React has not rendered yet, and every window, since they all boot through main.jsx.

// A 1x1 transparent GIF. Pointing src at it is what actually removes the broken-image glyph:
// the element keeps its CSS size but has nothing of its own left to draw, so the background
// below shows through cleanly.
const BLANK =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function installImageFallback(target = document) {
  target.addEventListener(
    "error",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;
      // Swapping src fires no second error for a data URI, but a re-render that puts the old
      // URL back would come through here again; the flag keeps that from looping.
      if (el.dataset.imgFailed) return;
      el.dataset.imgFailed = "1";
      // Alt text would be drawn in place of the picture, which is the same problem again.
      el.alt = "";
      el.src = BLANK;
      el.classList.add("img-failed");
    },
    true
  );
}
