const normalTrack = {
  type: "song",
  videoId: "track-normal",
  title: "Fixture Sunrise",
  artists: "Kodama Test Artist",
  artist: "Kodama Test Artist",
  artistBrowseId: "artist-fixture",
  album: "Fixture Album",
  albumBrowseId: "album-fixture",
  duration: "3:21",
  thumbnail:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Crect width='160' height='160' fill='%237c3aed'/%3E%3C/svg%3E",
  isExplicit: false,
};

const explicitTrack = {
  ...normalTrack,
  videoId: "track-explicit",
  title: "Fixture Explicit",
  isExplicit: true,
};
const cachedTrack = {
  ...normalTrack,
  videoId: "track-cached",
  title: "Fixture Cached",
  cached: true,
};
const premiumTrack = {
  ...normalTrack,
  videoId: "track-premium",
  title: "Fixture Premium",
  premiumOnly: true,
};
const unavailableTrack = {
  ...normalTrack,
  videoId: "track-unavailable",
  title: "Fixture Unavailable",
  unavailable: true,
};

const localProfile = {
  name: "Fixture Local",
  displayName: "Fixture Local",
  type: "local",
  active: true,
  avatar: "",
  loggedOut: false,
};

const authenticatedProfile = {
  name: "Fixture Account",
  displayName: "Fixture Account",
  type: "google",
  active: true,
  avatar: "",
  loggedOut: false,
};

const fixtures = {
  tracks: { normalTrack, explicitTrack, cachedTrack, premiumTrack, unavailableTrack },
  profiles: {
    firstRun: { profiles: [], current: null },
    local: { profiles: [localProfile], current: localProfile.name },
    authenticated: { profiles: [authenticatedProfile], current: authenticatedProfile.name },
    twoProfiles: {
      profiles: [
        authenticatedProfile,
        { ...localProfile, name: "Fixture Second", displayName: "Fixture Second", active: false },
      ],
      current: authenticatedProfile.name,
    },
  },
  home: {
    sections: [
      { title: "Quick picks", items: [normalTrack, explicitTrack, cachedTrack] },
      {
        title: "Discover",
        items: [
          {
            type: "album",
            browseId: "album-fixture",
            title: "Fixture Album",
            artists: "Kodama Test Artist",
            thumbnail: normalTrack.thumbnail,
          },
          {
            type: "playlist",
            playlistId: "playlist-fixture",
            title: "Fixture Playlist",
            thumbnail: normalTrack.thumbnail,
          },
        ],
      },
    ],
  },
  search: {
    results: [
      normalTrack,
      {
        type: "artist",
        browseId: "artist-fixture",
        title: "Kodama Test Artist",
        thumbnail: normalTrack.thumbnail,
      },
      {
        type: "album",
        browseId: "album-fixture",
        title: "Fixture Album",
        artists: "Kodama Test Artist",
        thumbnail: normalTrack.thumbnail,
      },
      {
        type: "playlist",
        playlistId: "playlist-fixture",
        title: "Fixture Playlist",
        thumbnail: normalTrack.thumbnail,
      },
    ],
  },
  library: {
    playlists: [
      {
        playlistId: "playlist-fixture",
        title: "Fixture Playlist",
        thumbnail: normalTrack.thumbnail,
      },
    ],
    albums: [
      {
        browseId: "album-fixture",
        title: "Fixture Album",
        artists: "Kodama Test Artist",
        year: "2026",
        thumbnail: normalTrack.thumbnail,
      },
    ],
    artists: [
      {
        browseId: "artist-fixture",
        artist: "Kodama Test Artist",
        thumbnail: normalTrack.thumbnail,
      },
    ],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { clone, fixtures };
