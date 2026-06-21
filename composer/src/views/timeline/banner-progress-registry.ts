// Module-level registry of banner DOM nodes that need their progress-fill
// CSS variable updated each animation frame. Banners self-register on mount
// and unregister on unmount via the helpers below; the playhead RAF iterates
// the Set directly instead of running document.querySelectorAll every frame.

const bannerNodes = new Set<HTMLElement>();

function registerBanner(el: HTMLElement): () => void {
  bannerNodes.add(el);
  return () => {
    bannerNodes.delete(el);
  };
}

function getBannerNodes(): ReadonlySet<HTMLElement> {
  return bannerNodes;
}

// -- Exports ------------------------------------------------------------------

export { getBannerNodes, registerBanner };
