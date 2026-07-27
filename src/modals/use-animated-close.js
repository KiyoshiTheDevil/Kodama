import { useState, useCallback } from "react";

// Keeps a conditionally-mounted modal alive for one exit animation.
//
// The usual fix is to mount the modal permanently and drive it from a parent `isOpen`
// (see CreatePlaylistModal), which lets react-aria play both transitions. That does not
// work for modals which do their loading on mount — the bug reporter fetches /diag, the
// lyrics browser fetches every provider — since mounting them for the whole session would
// run that work at startup, and reusing one instance across opens would need their state
// reset and refetched per track.
//
// So instead they stay conditionally mounted, but closing happens in two steps: flip
// isOpen to false so react-aria runs the exit animation, then let the parent unmount us
// once it has finished. Without this the component disappears in the same frame and the
// exit animation never gets to run.
//
// Keep EXIT_MS in sync with .modal__container[data-exiting] in index.css.
const EXIT_MS = 200;

export function useAnimatedClose(onClose) {
  const [isOpen, setIsOpen] = useState(true);
  const close = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);
  return [isOpen, close];
}
