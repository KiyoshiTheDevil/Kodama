// Android's Back gesture. MainActivity.askPageToGoBack calls window.__kodamaBack() and sends
// the app to the background when it returns false; true means the page used the gesture.
//
// The topmost layer is asked first, the way a keyboard asks it: an Escape keydown on the
// focused element. HeroUI's menus and dialogs (react-aria) and the ActionSheet close on it
// and mark it handled. What does not listen for Escape is the app's own business, a ladder
// App.jsx hands over with setAppBack (open panels first, then the previous view).

let appBack = null;

export function setAppBack(fn) {
  appBack = fn;
}

function escapeTopLayer() {
  const target = document.activeElement || document.body;
  const ev = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  // App.jsx's own Escape shortcut closes the player and the queue at once; Back goes one step.
  ev.kodamaBack = true;
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
}

// Set everywhere: only Android calls it, and its bridge may not be on window yet while modules load.
if (typeof window !== "undefined") {
  window.__kodamaBack = () => {
    try {
      if (escapeTopLayer()) return true;
      return appBack ? !!appBack() : false;
    } catch {
      return false;
    }
  };
}
