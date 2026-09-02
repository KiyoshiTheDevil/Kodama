import { useState, useEffect } from "react";
import { Button, CardRoot, ModalRoot, ModalBackdrop, ModalContainer, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalFooter, ModalCloseTrigger, Skeleton } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { API, thumb, hiResThumb, useLang } from "../context.jsx";
import { ArrowLeft, ArrowSquareOut, Info, Microphone, MusicNote, Play, PushPin, Radio, Shuffle, UserCheck, UserPlus } from "../icons.jsx";
import { TrackRow } from "../ui/rows.jsx";
import { Tooltip } from "../ui/tooltip.jsx";
import { useAccentColor } from "../ui/use-accent-color.js";
import { ModalDialog } from "../ui/zoomed-heroui.jsx";

function MediaTile({ thumbnail, title, subtitle, fallbackIcon, shape = "square", size = 148, onOpen, onPlay, onContextMenu }) {
  const isVideo = shape === "video";
  const isCircle = shape === "circle";
  const w = isVideo ? 200 : size;
  const h = isVideo ? 113 : size;
  const Fallback = fallbackIcon || (isCircle ? Microphone : MusicNote);
  return (
    <CardRoot
      variant="transparent"
      className="home-card p-0! gap-0! rounded-none! shadow-none!"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      style={{ flexShrink: 0, width: w, cursor: "default" }}
    >
      <div style={{ position: "relative", marginBottom: 8, borderRadius: isCircle ? "50%" : 10, overflow: "hidden", boxShadow: "var(--elevation-2)" }}>
        <div style={{ width: w, height: h, background: "var(--bg-elevated)" }}>
          {thumbnail
            ? <img className="home-card-img" src={thumb(thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.25s" }} />
            : <div style={{ width: "100%", height: "100%", background: "var(--placeholder-gradient)", display: "flex", alignItems: "center", justifyContent: "center" }}><Fallback size={Math.round(w * 0.3)} style={{ opacity: 0.3 }} /></div>}
        </div>
        {onPlay && !isCircle && (
          <div className="home-card-play" style={{ position: "absolute", bottom: 8, right: 8, opacity: 0, transform: "translateY(8px)", transition: "opacity 0.2s, transform 0.2s", pointerEvents: "none" }}>
            <div className="home-card-play-btn" onClick={(e) => { e.stopPropagation(); onPlay(e); }} style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto", cursor: "default", boxShadow: "var(--elevation-2)" }}>
              <Play size={17} weight="fill" style={{ color: "white", marginLeft: 2 }} />
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: "var(--t12)", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: isCircle ? "center" : "left" }}>{title}</div>
      {subtitle && <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: isCircle ? "center" : "left" }}>{subtitle}</div>}
    </CardRoot>
  );
}
function ArtistDescription({ text, name, url }) {
  const [popupOpen, setPopupOpen] = useState(false);
  const t = useLang();
  // Split off the trailing "From Wikipedia (...)" footer (YTMusic truncates the URL,
  // so the text just ends with "From Wikipedia ("). Strip it from the body and offer
  // a button that resolves the real article via Wikipedia search on click.
  const wikiIdx = text.search(/from wikipedia/i);
  const body = (wikiIdx !== -1 ? text.slice(0, wikiIdx) : text).trimEnd();
  const wikiCited = !!url || (wikiIdx !== -1 && !!name);
  // Role keyword from the description disambiguates names like "Ado" → "Ado (singer)"
  // (only used for the search fallback when the backend didn't supply a direct URL).
  const roleMatch = body.match(/\b(singer-songwriter|rapper|singer|musician|songwriter|girl group|boy band|band|duo|group|record producer|producer|composer|vocalist|DJ|artist)\b/i);
  const role = roleMatch ? roleMatch[0] : "";

  const openWikipedia = async () => {
    if (url) { openUrl(url).catch(console.error); return; }
    const q = (role ? `${name} ${role}` : name).trim();
    let target = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`);
      const d = await r.json();
      const title = d?.query?.search?.[0]?.title;
      if (title) target = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    } catch { /* keep the search-results fallback */ }
    openUrl(target).catch(console.error);
  };
  const PREVIEW = 300;
  const isLong = body.length > PREVIEW;
  const preview = isLong ? body.slice(0, PREVIEW).trimEnd() + "…" : body;

  return (
    <>
      {/* Compact snippet — glassy card, upper-right of the hero */}
      <div style={{
        position: "absolute", top: 96, right: 24,
        width: "clamp(220px, 42%, 460px)", zIndex: 4,
        background: "rgba(0,0,0,0.42)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "var(--r-xl)", padding: "12px 14px 10px",
      }}>
        <div style={{ fontSize: "var(--t12)", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{t("about")}</div>
        <p style={{
          margin: 0, fontSize: "var(--t11)", lineHeight: 1.6,
          color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap",
          display: "-webkit-box", WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{preview}</p>
        {isLong && (
          <Button size="sm" variant="ghost" color="accent" className="mt-1 h-6 px-0 min-w-0 font-semibold"
            onPress={() => setPopupOpen(true)}>{t("showMore")}</Button>
        )}
      </div>

      {/* Full-text popup — HeroUI Modal */}
      <ModalRoot isOpen={popupOpen} onOpenChange={(open) => { if (!open) setPopupOpen(false); }}>
        <ModalBackdrop className="z-[300]!">
          <ModalContainer placement="center" size="md" className="w-[480px] max-w-[92vw]">
            <ModalDialog>
              <ModalHeader>
                <ModalIcon><Info size={18} /></ModalIcon>
                <ModalCloseTrigger />
                <ModalHeading>{t("about")}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <p className="scrollable text-[length:var(--t12)] text-secondary leading-relaxed whitespace-pre-wrap max-h-[55vh] overflow-y-auto pr-1">{body}</p>
              </ModalBody>
              {wikiCited && (
                <ModalFooter>
                  <Button variant="secondary" size="sm" className="gap-1.5" onPress={openWikipedia}>
                    <ArrowSquareOut size={14} /> {t("viewOnWikipedia")}
                  </Button>
                </ModalFooter>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>
    </>
  );
}

export function ArtistView({ browseId, onPlay, currentTrack, isPlaying, onOpenAlbum, onOpenPlaylist, onOpenArtist, onBack, onContextMenu, onTogglePin, isPinned, hideExplicit, onStartRadio }) {
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allAlbums, setAllAlbums] = useState(null);       // null = not yet loaded
  const [allAlbumsLoading, setAllAlbumsLoading] = useState(false);
  const [allSingles, setAllSingles] = useState(null);
  const [allSinglesLoading, setAllSinglesLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(null);     // null = unknown (not loaded yet)
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const t = useLang();
  const artistAccent = useAccentColor(artist?.thumbnail);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/artist/${browseId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setArtist(d);
        setSubscribed(d.subscribed ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [browseId]);

  if (loading) return (
    <div style={{ padding: 28 }}>
      <Skeleton className="h-[200px] w-full rounded-xl mb-6" />
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-[52px] w-full rounded-lg mb-2" />)}
    </div>
  );

  if (error) return <div style={{ padding: 28, color: "var(--status-danger)" }}>{error}</div>;
  if (!artist) return null;

  const topTracks = (artist.tracks || []).filter(tr => !hideExplicit || !tr.isExplicit);

  const doSubscribe = () => {
    const next = !subscribed;
    setSubLoading(true);
    setSubError(null);
    fetch(`${API}/artist/${browseId}/${next ? "subscribe" : "unsubscribe"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: artist.channelId || browseId }),
    })
      .then(r => r.json())
      .then(d => { if (d.error) setSubError(d.error); else setSubscribed(next); })
      .catch(e => setSubError(e.message))
      .finally(() => setSubLoading(false));
  };
  const doRadio = () => {
    setRadioLoading(true);
    fetch(`${API}/radio/${artist.radioId}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); if (d.tracks?.length) onPlay(d.tracks[0], d.tracks); })
      .catch(e => console.error("Radio error:", e))
      .finally(() => setRadioLoading(false));
  };
  const playAlbumDirect = (browseId) => {
    fetch(`${API}/album/${browseId}`).then(r => r.json())
      .then(d => { if (d.tracks?.length) onPlay(d.tracks[0], d.tracks); }).catch(() => {});
  };

  return (
    <div style={{ paddingBottom: 32 }}>

      {/* ── Hero banner ── */}
      <div style={{ position: "relative", minHeight: 320, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {artist.thumbnail
          ? <img src={thumb(hiResThumb(artist.thumbnail, 800))} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(${artistAccent},0.6), rgba(${artistAccent},0.2))` }} />}
        {/* Darkening + fade-to-base overlays */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.55) 75%, var(--bg-base) 100%)" }} />

        {/* Back button */}
        <Button isIconOnly variant="secondary" className="absolute top-11 left-4 z-10 size-9 rounded-full backdrop-blur-md"
          style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }} onPress={onBack}>
          <ArrowLeft size={18} />
        </Button>

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2, padding: "0 24px 22px" }}>
          <div style={{ fontSize: "var(--t12)", fontWeight: 600, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{t("artist")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <h1 style={{ fontSize: 46, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.05, textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}>{artist.name}</h1>
            {onTogglePin && (
              <Tooltip text={t(isPinned ? "removeFromSidebar" : "pinToSidebar")}>
                <Button isIconOnly size="sm" className="size-8 rounded-full shrink-0 backdrop-blur-md"
                  style={{ background: isPinned ? "var(--accent)" : "rgba(255,255,255,0.18)", color: "#fff" }}
                  onPress={() => onTogglePin({ browseId, title: artist.name, thumbnail: artist.thumbnail, type: "artist" })}>
                  <PushPin size={15} weight={isPinned ? "fill" : "regular"} />
                </Button>
              </Tooltip>
            )}
          </div>
          {(artist.subscribers || artist.monthlyListeners) && (
            <div style={{ fontSize: "var(--t12)", color: "rgba(255,255,255,0.62)", fontWeight: 500, marginBottom: 16 }}>
              {[artist.subscribers && `${artist.subscribers} ${t("subscribers")}`, artist.monthlyListeners && `${artist.monthlyListeners} ${t("monthlyListeners")}`].filter(Boolean).join("  ·  ")}
            </div>
          )}
          {/* Action row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {topTracks.length > 0 && (
              <>
                <Button color="accent" variant="solid" className="rounded-full gap-1.5 px-5 font-semibold" onPress={() => onPlay(topTracks[0], topTracks)}>
                  <Play size={15} weight="fill" /> {t("playAll")}
                </Button>
                <Button variant="secondary" className="rounded-full gap-1.5 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
                  onPress={() => { const sh = [...topTracks].sort(() => Math.random() - 0.5); onPlay(sh[0], sh); }}>
                  <Shuffle size={15} /> {t("shuffle")}
                </Button>
              </>
            )}
            {subscribed !== null && (
              <Tooltip text={subscribed ? t("unsubscribe") : t("subscribe")}>
                <Button variant={subscribed ? "secondary" : "solid"} color={subscribed ? "default" : "accent"} isDisabled={subLoading}
                  className="rounded-full gap-1.5 font-semibold" onPress={doSubscribe}>
                  {subscribed ? <><UserCheck size={13} /> {t("subscribed")}</> : <><UserPlus size={13} /> {t("subscribe")}</>}
                </Button>
              </Tooltip>
            )}
            {artist.radioId && (
              <Button variant="ghost" color="accent" isDisabled={radioLoading} className="rounded-full gap-1.5 font-semibold" onPress={doRadio}>
                <Radio size={13} /> {radioLoading ? "…" : "Radio"}
              </Button>
            )}
          </div>
          {subError && <div style={{ marginTop: 8, fontSize: "var(--t11)", color: "var(--status-danger)", maxWidth: 280, lineHeight: 1.35 }}>{subError}</div>}
        </div>
        {/* Artist description — bottom right of hero */}
        {artist.description && <ArtistDescription text={artist.description} name={artist.name} url={artist.descriptionUrl} />}
      </div>

      <div style={{ padding: "0 24px" }}>

        {/* Top Songs */}
        {artist.tracks?.length > 0 && (() => {
          const visibleTracks = artist.tracks.filter(tr => !hideExplicit || !tr.isExplicit);
          if (!visibleTracks.length) return null;
          return (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginTop: 8 }}>
              <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("topSongs")}</div>
              {artist.songsBrowseId && (
                <Button size="sm" variant="ghost" className="text-secondary font-medium h-7 px-3 min-w-0"
                  onPress={() => onOpenPlaylist({ playlistId: artist.songsBrowseId, title: `${artist.name} – ${t("topSongs")}`, forcedTitle: `${artist.name} – ${t("topSongs")}`, thumbnail: artist.thumbnail })}>
                  {t("showAll")}
                </Button>
              )}
            </div>
            <div style={{ margin: "0 -16px" }}>
              {visibleTracks.map((t, i) => (
                <TrackRow key={t.videoId || i} track={t}
                  isPlaying={isPlaying && currentTrack?.videoId === t.videoId}
                  onPlay={() => onPlay(t, visibleTracks)}
                />
              ))}
            </div>
          </div>
          );
        })()}

        {/* Albums */}
        {artist.albums?.length > 0 && (() => {
          const displayAlbums = allAlbums ?? artist.albums;
          const canShowAll = !allAlbums && artist.albumsBrowseId && artist.albumsParams;
          return (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("albums")}</div>
                {canShowAll && (
                  <Button size="sm" variant="ghost" className="text-secondary font-medium h-7 px-3 min-w-0" isDisabled={allAlbumsLoading}
                    onPress={() => {
                      setAllAlbumsLoading(true);
                      fetch(`${API}/artist_albums?channelId=${encodeURIComponent(artist.albumsBrowseId)}&params=${encodeURIComponent(artist.albumsParams)}`)
                        .then(r => r.json())
                        .then(d => { if (!d.error) setAllAlbums(d.albums); })
                        .catch(() => {})
                        .finally(() => setAllAlbumsLoading(false));
                    }}>
                    {allAlbumsLoading ? "…" : t("showAll")}
                  </Button>
                )}
              </div>
              {allAlbums ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {displayAlbums.map((a, i) => (
                    <MediaTile key={i} thumbnail={a.thumbnail} title={a.title}
                      subtitle={a.year ? `${a.year}${a.type ? ` · ${a.type}` : ""}` : null}
                      onOpen={() => onOpenAlbum({ browseId: a.browseId, title: a.title, thumbnail: a.thumbnail })}
                      onPlay={() => playAlbumDirect(a.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: a.browseId, title: a.title, thumbnail: a.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              ) : (
                <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
                  {displayAlbums.map((a, i) => (
                    <MediaTile key={i} thumbnail={a.thumbnail} title={a.title} subtitle={a.year || null}
                      onOpen={() => onOpenAlbum({ browseId: a.browseId, title: a.title, thumbnail: a.thumbnail })}
                      onPlay={() => playAlbumDirect(a.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: a.browseId, title: a.title, thumbnail: a.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Singles & EPs */}
        {artist.singles?.length > 0 && (() => {
          const displaySingles = allSingles ?? artist.singles;
          const canShowAll = !allSingles && artist.singlesBrowseId && artist.singlesParams;
          return (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{t("singles")}</div>
                {canShowAll && (
                  <Button size="sm" variant="ghost" className="text-secondary font-medium h-7 px-3 min-w-0" isDisabled={allSinglesLoading}
                    onPress={() => {
                      setAllSinglesLoading(true);
                      fetch(`${API}/artist_albums?channelId=${encodeURIComponent(artist.singlesBrowseId)}&params=${encodeURIComponent(artist.singlesParams)}`)
                        .then(r => r.json())
                        .then(d => { if (!d.error) setAllSingles(d.albums); })
                        .catch(() => {})
                        .finally(() => setAllSinglesLoading(false));
                    }}>
                    {allSinglesLoading ? "…" : t("showAll")}
                  </Button>
                )}
              </div>
              {allSingles ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {displaySingles.map((s, i) => (
                    <MediaTile key={i} thumbnail={s.thumbnail} title={s.title}
                      subtitle={s.year ? `${s.year}${s.type ? ` · ${s.type}` : ""}` : null}
                      onOpen={() => onOpenAlbum({ browseId: s.browseId, title: s.title, thumbnail: s.thumbnail })}
                      onPlay={() => playAlbumDirect(s.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: s.browseId, title: s.title, thumbnail: s.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              ) : (
                <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
                  {displaySingles.map((s, i) => (
                    <MediaTile key={i} thumbnail={s.thumbnail} title={s.title}
                      subtitle={s.year ? `${s.year} · ${t("single")}` : null}
                      onOpen={() => onOpenAlbum({ browseId: s.browseId, title: s.title, thumbnail: s.thumbnail })}
                      onPlay={() => playAlbumDirect(s.browseId)}
                      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: s.browseId, title: s.title, thumbnail: s.thumbnail, type: "album" }); }} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Videos */}
        {artist.videos?.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 12 }}>{t("videos")}</div>
            <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
              {artist.videos.map((v, i) => {
                const playVideo = () => onPlay(
                  { videoId: v.videoId, title: v.title, artists: v.artists, thumbnail: v.thumbnail, duration: "" },
                  artist.videos.map(x => ({ videoId: x.videoId, title: x.title, artists: x.artists, thumbnail: x.thumbnail, duration: "" }))
                );
                return (
                  <MediaTile key={i} shape="video" thumbnail={v.thumbnail} title={v.title} subtitle={v.views || null}
                    onOpen={playVideo} onPlay={playVideo} />
                );
              })}
            </div>
          </div>
        )}

        {/* Related Artists */}
        {artist.related?.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "var(--t16)", fontWeight: 600, marginBottom: 12 }}>{t("relatedArtists")}</div>
            <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
              {artist.related.map((r, i) => (
                <MediaTile key={i} shape="circle" size={120} thumbnail={r.thumbnail} title={r.title} subtitle={r.subscribers || null}
                  onOpen={() => onOpenArtist?.({ browseId: r.browseId, artist: r.title })} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Profile Manager ────────────────────────────────────────────────────────

// Extracted outside LoginScreen to avoid remount on every parent render
