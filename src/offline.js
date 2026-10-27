// Whether the app is offline right now. App.jsx keeps it on <html data-offline> (it notices the
// state, see its probe), so the player, the lists and the search can ask without it being passed
// through every component.
export const isOffline = () => typeof document !== "undefined" && document.documentElement.dataset.offline === "1";
