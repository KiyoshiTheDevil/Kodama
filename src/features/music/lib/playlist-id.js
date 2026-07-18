// Unified playlist/album identifier: playlists use playlistId, albums use browseId.
export const itemId = (item) => item?.playlistId || item?.browseId || null;

// Per-profile localStorage key suffix, so pins/recents/etc. don't leak across profiles.
export const profileKey = (base) => `${base}-${window.__activeProfile || "default"}`;
