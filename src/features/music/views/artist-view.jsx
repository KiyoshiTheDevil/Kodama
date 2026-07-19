import { useEffect, useState } from "react";
import { Button, Skeleton } from "@heroui/react";

import { TrackRow } from "@/features/music/components/rows.jsx";
import { Tooltip } from "@/shared/ui/tooltip.jsx";
import { useAccentColor } from "@/features/music/hooks/use-accent-color.js";
import {
  ArrowLeft,
  Play,
  PushPin,
  Radio,
  Shuffle,
  UserCheck,
  UserPlus,
} from "@/shared/icons/icons.jsx";
import { API } from "@/shared/api/client.js";
import { thumb, hiResThumb } from "@/shared/api/thumbnails.js";
import { useLang } from "@/shared/i18n/context.jsx";
import { ArtistDescription } from "../components/artist-description.jsx";
import { MediaTile } from "../components/media-tile.jsx";
import { usePlaybackStatus, usePlayerActions } from "../../player/player-context.jsx";

export function ArtistView({
  browseId,
  onOpenAlbum,
  onOpenPlaylist,
  onOpenArtist,
  onBack,
  onContextMenu,
  onTogglePin,
  isPinned,
  hideExplicit,
}) {
  const { track: currentTrack, isPlaying } = usePlaybackStatus();
  const { handlePlay } = usePlayerActions();
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allAlbums, setAllAlbums] = useState(null); // null = not yet loaded
  const [allAlbumsLoading, setAllAlbumsLoading] = useState(false);
  const [allSingles, setAllSingles] = useState(null);
  const [allSinglesLoading, setAllSinglesLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(null); // null = unknown (not loaded yet)
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const t = useLang();
  const artistAccent = useAccentColor(artist?.thumbnail);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/artist/${browseId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setArtist(d);
        setSubscribed(d.subscribed ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [browseId]);

  if (loading)
    return (
      <div style={{ padding: 28 }}>
        <Skeleton className="h-[200px] w-full rounded-xl mb-6" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-lg mb-2" />
        ))}
      </div>
    );

  if (error) return <div style={{ padding: 28, color: "#f44336" }}>{error}</div>;
  if (!artist) return null;

  const topTracks = (artist.tracks || []).filter((tr) => !hideExplicit || !tr.isExplicit);

  const doSubscribe = () => {
    const next = !subscribed;
    setSubLoading(true);
    setSubError(null);
    fetch(`${API}/artist/${browseId}/${next ? "subscribe" : "unsubscribe"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: artist.channelId || browseId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setSubError(d.error);
        else setSubscribed(next);
      })
      .catch((e) => setSubError(e.message))
      .finally(() => setSubLoading(false));
  };
  const doRadio = () => {
    setRadioLoading(true);
    fetch(`${API}/radio/${artist.radioId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (d.tracks?.length) handlePlay(d.tracks[0], d.tracks);
      })
      .catch((e) => console.error("Radio error:", e))
      .finally(() => setRadioLoading(false));
  };
  const playAlbumDirect = (browseId) => {
    fetch(`${API}/album/${browseId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.tracks?.length) handlePlay(d.tracks[0], d.tracks);
      })
      .catch(() => {});
  };

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* ── Hero banner ── */}
      <div
        style={{
          position: "relative",
          minHeight: 320,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {artist.thumbnail ? (
          <img
            src={thumb(hiResThumb(artist.thumbnail, 800))}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, rgba(${artistAccent},0.6), rgba(${artistAccent},0.2))`,
            }}
          />
        )}
        {/* Darkening + fade-to-base overlays */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.55) 75%, var(--bg-base) 100%)",
          }}
        />

        {/* Back button */}
        <Button
          isIconOnly
          variant="secondary"
          className="absolute top-11 left-4 z-10 size-9 rounded-full backdrop-blur-md"
          style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
          onPress={onBack}
        >
          <ArrowLeft size={18} />
        </Button>

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2, padding: "0 24px 22px" }}>
          <div
            style={{
              fontSize: "var(--t11)",
              fontWeight: 600,
              color: "rgba(255,255,255,0.7)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}
          >
            {t("artist")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <h1
              style={{
                fontSize: 46,
                fontWeight: 800,
                color: "#fff",
                margin: 0,
                lineHeight: 1.05,
                textShadow: "0 2px 18px rgba(0,0,0,0.55)",
              }}
            >
              {artist.name}
            </h1>
            {onTogglePin && (
              <Tooltip text={t(isPinned ? "removeFromSidebar" : "pinToSidebar")}>
                <Button
                  isIconOnly
                  size="sm"
                  className="size-8 rounded-full shrink-0 backdrop-blur-md"
                  style={{
                    background: isPinned ? "var(--accent)" : "rgba(255,255,255,0.18)",
                    color: "#fff",
                  }}
                  onPress={() =>
                    onTogglePin({
                      browseId,
                      title: artist.name,
                      thumbnail: artist.thumbnail,
                      type: "artist",
                    })
                  }
                >
                  <PushPin size={15} weight={isPinned ? "fill" : "regular"} />
                </Button>
              </Tooltip>
            )}
          </div>
          {(artist.subscribers || artist.monthlyListeners) && (
            <div
              style={{
                fontSize: "var(--t12)",
                color: "rgba(255,255,255,0.62)",
                fontWeight: 500,
                marginBottom: 16,
              }}
            >
              {[
                artist.subscribers && `${artist.subscribers} ${t("subscribers")}`,
                artist.monthlyListeners && `${artist.monthlyListeners} ${t("monthlyListeners")}`,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </div>
          )}
          {/* Action row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {topTracks.length > 0 && (
              <>
                <Button
                  color="accent"
                  variant="solid"
                  className="rounded-full gap-1.5 px-5 font-semibold"
                  onPress={() => handlePlay(topTracks[0], topTracks)}
                >
                  <Play size={15} weight="fill" /> {t("playAll")}
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-full gap-1.5 backdrop-blur-md"
                  style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
                  onPress={() => {
                    const sh = [...topTracks].sort(() => Math.random() - 0.5);
                    handlePlay(sh[0], sh);
                  }}
                >
                  <Shuffle size={15} /> {t("shuffle")}
                </Button>
              </>
            )}
            {subscribed !== null && (
              <Tooltip text={subscribed ? t("unsubscribe") : t("subscribe")}>
                <Button
                  variant={subscribed ? "secondary" : "solid"}
                  color={subscribed ? "default" : "accent"}
                  isDisabled={subLoading}
                  className="rounded-full gap-1.5 font-semibold"
                  onPress={doSubscribe}
                >
                  {subscribed ? (
                    <>
                      <UserCheck size={13} /> {t("subscribed")}
                    </>
                  ) : (
                    <>
                      <UserPlus size={13} /> {t("subscribe")}
                    </>
                  )}
                </Button>
              </Tooltip>
            )}
            {artist.radioId && (
              <Button
                variant="ghost"
                color="accent"
                isDisabled={radioLoading}
                className="rounded-full gap-1.5 font-semibold"
                onPress={doRadio}
              >
                <Radio size={13} /> {radioLoading ? "…" : "Radio"}
              </Button>
            )}
          </div>
          {subError && (
            <div
              style={{
                marginTop: 8,
                fontSize: "var(--t11)",
                color: "#ff7070",
                maxWidth: 280,
                lineHeight: 1.35,
              }}
            >
              {subError}
            </div>
          )}
        </div>
        {/* Artist description — bottom right of hero */}
        {artist.description && (
          <ArtistDescription
            text={artist.description}
            name={artist.name}
            url={artist.descriptionUrl}
          />
        )}
      </div>

      <div style={{ padding: "0 24px" }}>
        {/* Top Songs */}
        {artist.tracks?.length > 0 &&
          (() => {
            const visibleTracks = artist.tracks.filter((tr) => !hideExplicit || !tr.isExplicit);
            if (!visibleTracks.length) return null;
            return (
              <div style={{ marginBottom: 32 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                    marginTop: 8,
                  }}
                >
                  <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("topSongs")}</div>
                  {artist.songsBrowseId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-secondary font-medium h-7 px-3 min-w-0"
                      onPress={() =>
                        onOpenPlaylist({
                          playlistId: artist.songsBrowseId,
                          title: `${artist.name} – ${t("topSongs")}`,
                          forcedTitle: `${artist.name} – ${t("topSongs")}`,
                          thumbnail: artist.thumbnail,
                        })
                      }
                    >
                      {t("showAll")}
                    </Button>
                  )}
                </div>
                <div style={{ margin: "0 -16px" }}>
                  {visibleTracks.map((t, i) => (
                    <TrackRow
                      key={t.videoId || i}
                      track={t}
                      isPlaying={isPlaying && currentTrack?.videoId === t.videoId}
                      onPlay={() => handlePlay(t, visibleTracks)}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

        {/* Albums */}
        {artist.albums?.length > 0 &&
          (() => {
            const displayAlbums = allAlbums ?? artist.albums;
            const canShowAll = !allAlbums && artist.albumsBrowseId && artist.albumsParams;
            return (
              <div style={{ marginBottom: 32 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("albums")}</div>
                  {canShowAll && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-secondary font-medium h-7 px-3 min-w-0"
                      isDisabled={allAlbumsLoading}
                      onPress={() => {
                        setAllAlbumsLoading(true);
                        fetch(
                          `${API}/artist_albums?channelId=${encodeURIComponent(artist.albumsBrowseId)}&params=${encodeURIComponent(artist.albumsParams)}`
                        )
                          .then((r) => r.json())
                          .then((d) => {
                            if (!d.error) setAllAlbums(d.albums);
                          })
                          .catch(() => {})
                          .finally(() => setAllAlbumsLoading(false));
                      }}
                    >
                      {allAlbumsLoading ? "…" : t("showAll")}
                    </Button>
                  )}
                </div>
                {allAlbums ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                    {displayAlbums.map((a, i) => (
                      <MediaTile
                        key={i}
                        thumbnail={a.thumbnail}
                        title={a.title}
                        subtitle={a.year ? `${a.year}${a.type ? ` · ${a.type}` : ""}` : null}
                        onOpen={() =>
                          onOpenAlbum({
                            browseId: a.browseId,
                            title: a.title,
                            thumbnail: a.thumbnail,
                          })
                        }
                        onPlay={() => playAlbumDirect(a.browseId)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onContextMenu?.(e, {
                            browseId: a.browseId,
                            title: a.title,
                            thumbnail: a.thumbnail,
                            type: "album",
                          });
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className="carousel"
                    style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}
                  >
                    {displayAlbums.map((a, i) => (
                      <MediaTile
                        key={i}
                        thumbnail={a.thumbnail}
                        title={a.title}
                        subtitle={a.year || null}
                        onOpen={() =>
                          onOpenAlbum({
                            browseId: a.browseId,
                            title: a.title,
                            thumbnail: a.thumbnail,
                          })
                        }
                        onPlay={() => playAlbumDirect(a.browseId)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onContextMenu?.(e, {
                            browseId: a.browseId,
                            title: a.title,
                            thumbnail: a.thumbnail,
                            type: "album",
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

        {/* Singles & EPs */}
        {artist.singles?.length > 0 &&
          (() => {
            const displaySingles = allSingles ?? artist.singles;
            const canShowAll = !allSingles && artist.singlesBrowseId && artist.singlesParams;
            return (
              <div style={{ marginBottom: 32 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("singles")}</div>
                  {canShowAll && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-secondary font-medium h-7 px-3 min-w-0"
                      isDisabled={allSinglesLoading}
                      onPress={() => {
                        setAllSinglesLoading(true);
                        fetch(
                          `${API}/artist_albums?channelId=${encodeURIComponent(artist.singlesBrowseId)}&params=${encodeURIComponent(artist.singlesParams)}`
                        )
                          .then((r) => r.json())
                          .then((d) => {
                            if (!d.error) setAllSingles(d.albums);
                          })
                          .catch(() => {})
                          .finally(() => setAllSinglesLoading(false));
                      }}
                    >
                      {allSinglesLoading ? "…" : t("showAll")}
                    </Button>
                  )}
                </div>
                {allSingles ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                    {displaySingles.map((s, i) => (
                      <MediaTile
                        key={i}
                        thumbnail={s.thumbnail}
                        title={s.title}
                        subtitle={s.year ? `${s.year}${s.type ? ` · ${s.type}` : ""}` : null}
                        onOpen={() =>
                          onOpenAlbum({
                            browseId: s.browseId,
                            title: s.title,
                            thumbnail: s.thumbnail,
                          })
                        }
                        onPlay={() => playAlbumDirect(s.browseId)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onContextMenu?.(e, {
                            browseId: s.browseId,
                            title: s.title,
                            thumbnail: s.thumbnail,
                            type: "album",
                          });
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className="carousel"
                    style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}
                  >
                    {displaySingles.map((s, i) => (
                      <MediaTile
                        key={i}
                        thumbnail={s.thumbnail}
                        title={s.title}
                        subtitle={s.year ? `${s.year} · ${t("single")}` : null}
                        onOpen={() =>
                          onOpenAlbum({
                            browseId: s.browseId,
                            title: s.title,
                            thumbnail: s.thumbnail,
                          })
                        }
                        onPlay={() => playAlbumDirect(s.browseId)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onContextMenu?.(e, {
                            browseId: s.browseId,
                            title: s.title,
                            thumbnail: s.thumbnail,
                            type: "album",
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

        {/* Videos */}
        {artist.videos?.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 12 }}>
              {t("videos")}
            </div>
            <div
              className="carousel"
              style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}
            >
              {artist.videos.map((v, i) => {
                const playVideo = () =>
                  handlePlay(
                    {
                      videoId: v.videoId,
                      title: v.title,
                      artists: v.artists,
                      thumbnail: v.thumbnail,
                      duration: "",
                    },
                    artist.videos.map((x) => ({
                      videoId: x.videoId,
                      title: x.title,
                      artists: x.artists,
                      thumbnail: x.thumbnail,
                      duration: "",
                    }))
                  );
                return (
                  <MediaTile
                    key={i}
                    shape="video"
                    thumbnail={v.thumbnail}
                    title={v.title}
                    subtitle={v.views || null}
                    onOpen={playVideo}
                    onPlay={playVideo}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Related Artists */}
        {artist.related?.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 12 }}>
              {t("relatedArtists")}
            </div>
            <div
              className="carousel"
              style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}
            >
              {artist.related.map((r, i) => (
                <MediaTile
                  key={i}
                  shape="circle"
                  size={120}
                  thumbnail={r.thumbnail}
                  title={r.title}
                  subtitle={r.subscribers || null}
                  onOpen={() => onOpenArtist?.({ browseId: r.browseId, artist: r.title })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
