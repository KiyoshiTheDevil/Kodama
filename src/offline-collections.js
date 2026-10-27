// Which playlists were saved for the road: "Download all" on a playlist notes it here (its name,
// cover and songs), so the home view offline can offer it again as a playlist rather than as
// loose songs. Albums need no note, the downloaded songs carry their album.
//
// Only in this device's storage; at most 40, the newest first.
const KEY = "kodama-offline-playlists";

export function loadOfflinePlaylists() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function rememberOfflinePlaylist({ id, title, thumbnail, videoIds }) {
  if (!id || !videoIds?.length) return;
  try {
    const list = loadOfflinePlaylists();
    const old = list.find((p) => p.id === id);
    // Downloaded again later, perhaps grown: the songs of both times, the list's own order first.
    const ids = old ? [...new Set([...videoIds, ...old.videoIds])] : videoIds;
    const next = [{ id, title, thumbnail, videoIds: ids, at: Date.now() }, ...list.filter((p) => p.id !== id)].slice(0, 40);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage full or off: the playlist just does not show offline */ }
}
