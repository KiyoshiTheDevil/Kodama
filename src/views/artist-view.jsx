import { useState, useEffect, useRef } from "react";
import { Button, CardRoot, ModalBackdrop, ModalContainer, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalFooter, ModalCloseTrigger, Skeleton } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { API, thumb, hiResThumb, useLang, useCompact } from "../context.jsx";
import { ArrowLeft, ArrowSquareOut, Info, Microphone, MusicNote, Play, PushPin, Radio, Shuffle, UserCheck, UserPlus } from "../icons.jsx";
import { TrackRow } from "../ui/rows.jsx";
import { Tooltip } from "../ui/tooltip.jsx";
import { useAccentColor } from "../ui/use-accent-color.js";
import { ModalDialog, ModalRoot } from "../ui/zoomed-heroui.jsx";
import { shuffled } from "../shuffle.js";

function MediaTile({ thumbnail, title, subtitle, fallbackIcon, shape = "square", size = 148, fluid = false, onOpen, onPlay, onContextMenu }) {
  const isVideo = shape === "video";
  const isCircle = shape === "circle";
  // fluid: as wide as its grid column (DiscographyView), the shape kept by aspect-ratio.
  const w = fluid ? "100%" : isVideo ? 200 : size;
  const h = fluid ? "auto" : isVideo ? 113 : size;
  const Fallback = fallbackIcon || (isCircle ? Microphone : MusicNote);
  return (
    <CardRoot
      variant="transparent"
      className="home-card p-0! gap-0! rounded-none! shadow-none!"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      style={{ flexShrink: 0, width: w, cursor: "default" }}
    >
      <div style={{ position: "relative", marginBottom: 8, borderRadius: isCircle ? "var(--r-full)" : "var(--r-lg)", overflow: "hidden", boxShadow: "var(--elevation-2)" }}>
        <div style={{ width: w, height: h, aspectRatio: fluid ? (isVideo ? "16 / 9" : "1 / 1") : undefined, background: "var(--bg-elevated)" }}>
          {thumbnail
            ? <img className="home-card-img" src={thumb(thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.25s" }} />
            : <div style={{ width: "100%", height: "100%", background: "var(--placeholder-gradient)", display: "flex", alignItems: "center", justifyContent: "center" }}><Fallback size={fluid ? 40 : Math.round(w * 0.3)} style={{ opacity: 0.3 }} /></div>}
        </div>
        {onPlay && !isCircle && (
          <div className="home-card-play" style={{ position: "absolute", bottom: 8, right: 8, opacity: 0, transform: "translateY(8px)", transition: "opacity 0.2s, transform 0.2s", pointerEvents: "none" }}>
            <div className="home-card-play-btn" onClick={(e) => { e.stopPropagation(); onPlay(e); }} style={{ width: 40, height: 40, borderRadius: "var(--r-full)", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto", cursor: "default", boxShadow: "var(--elevation-2)" }}>
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
function ArtistDescription({ text, name, url, inline = false }) {
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
      {/* Compact layout: three lines under the header, "More" opens the whole text. Beside the
          name and the buttons there is no room on a phone; as a card in the hero it lay on top
          of them. */}
      {inline ? (
        <div style={{ padding: "0 16px", marginTop: 4 }}>
          <p style={{
            margin: 0, fontSize: "var(--t13)", lineHeight: 1.5, color: "var(--text-secondary)",
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{body}</p>
          <button type="button" onClick={() => setPopupOpen(true)}
            className="mt-1 p-0 border-0 bg-transparent cursor-default text-[length:var(--t13)] font-semibold text-primary">
            {t("showMore")}
          </button>
        </div>
      ) : (
      /* Desktop snippet — glassy card, upper-right of the hero */
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
      )}

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

export function ArtistView({ browseId, onPlay, currentTrack, isPlaying, onOpenAlbum, onOpenPlaylist, onOpenArtist, onBack, onContextMenu, onTogglePin, isPinned, hideExplicit, onStartRadio, onOpenDiscography }) {
  const compact = useCompact();
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      <div style={{ position: "relative", minHeight: compact ? 280 : 320, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {artist.thumbnail
          ? <img src={thumb(hiResThumb(artist.thumbnail, 800))} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(${artistAccent},0.6), rgba(${artistAccent},0.2))` }} />}
        {/* Darkening + fade-to-base overlays */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.55) 75%, var(--bg-base) 100%)" }} />

        {/* Back button: only where there is no title bar with Back in it (macOS) */}
        {onBack && (
          <Button isIconOnly variant="secondary" className="absolute top-11 left-4 z-10 size-9 rounded-[var(--r-full)] backdrop-blur-md"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }} onPress={onBack}>
            <ArrowLeft size={18} />
          </Button>
        )}

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2, padding: compact ? "0 16px 14px" : "0 24px 22px" }}>
          <div style={{ fontSize: "var(--t12)", fontWeight: 600, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{t("artist")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <h1 style={{ fontSize: compact ? 34 : 46, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.05, textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}>{artist.name}</h1>
            {onTogglePin && (
              <Tooltip text={t(isPinned ? "removeFromSidebar" : "pinToSidebar")}>
                <Button isIconOnly size="sm" className="size-8 rounded-[var(--r-full)] shrink-0 backdrop-blur-md"
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
          {/* Action row. Compact: one row, shuffle and radio as round icon buttons and the
              subscription at the end; with their labels the radio went to a line of its own. */}
          {compact ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {topTracks.length > 0 && (
              <>
                {/* "primary" is HeroUI 3's filled button; "solid"/"accent" are no longer variants and drew it as plain text. */}
                <Button variant="primary" className="rounded-[var(--r-full)] gap-1.5 px-4 font-semibold" onPress={() => onPlay(topTracks[0], topTracks)}>
                  <Play size={15} weight="fill" /> {t("playAll")}
                </Button>
                <Button isIconOnly variant="secondary" aria-label={t("shuffle")} className="size-10 rounded-[var(--r-full)] backdrop-blur-md" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
                  onPress={() => { const sh = shuffled(topTracks); onPlay(sh[0], sh); }}>
                  <Shuffle size={16} />
                </Button>
              </>
            )}
            {artist.radioId && (
              <Button isIconOnly variant="secondary" aria-label="Radio" isDisabled={radioLoading} className="size-10 rounded-[var(--r-full)] backdrop-blur-md" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
                onPress={doRadio}>
                <Radio size={16} />
              </Button>
            )}
            <div style={{ flex: 1 }} />
            {subscribed !== null && (
              <Button variant={subscribed ? "secondary" : "primary"} isDisabled={subLoading}
                className="rounded-[var(--r-full)] gap-1.5 font-semibold" onPress={doSubscribe}>
                {subscribed ? <><UserCheck size={13} /> {t("subscribed")}</> : <><UserPlus size={13} /> {t("subscribe")}</>}
              </Button>
            )}
          </div>
          ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {topTracks.length > 0 && (
              <>
                <Button color="accent" variant="solid" className="rounded-[var(--r-full)] gap-1.5 px-5 font-semibold" onPress={() => onPlay(topTracks[0], topTracks)}>
                  <Play size={15} weight="fill" /> {t("playAll")}
                </Button>
                <Button variant="secondary" className="rounded-[var(--r-full)] gap-1.5 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
                  onPress={() => { const sh = shuffled(topTracks); onPlay(sh[0], sh); }}>
                  <Shuffle size={15} /> {t("shuffle")}
                </Button>
              </>
            )}
            {subscribed !== null && (
              <Tooltip text={subscribed ? t("unsubscribe") : t("subscribe")}>
                <Button variant={subscribed ? "secondary" : "solid"} color={subscribed ? "default" : "accent"} isDisabled={subLoading}
                  className="rounded-[var(--r-full)] gap-1.5 font-semibold" onPress={doSubscribe}>
                  {subscribed ? <><UserCheck size={13} /> {t("subscribed")}</> : <><UserPlus size={13} /> {t("subscribe")}</>}
                </Button>
              </Tooltip>
            )}
            {artist.radioId && (
              <Button variant="ghost" color="accent" isDisabled={radioLoading} className="rounded-[var(--r-full)] gap-1.5 font-semibold" onPress={doRadio}>
                <Radio size={13} /> {radioLoading ? "…" : "Radio"}
              </Button>
            )}
          </div>
          )}
          {subError && <div style={{ marginTop: 8, fontSize: "var(--t11)", color: "var(--status-danger)", maxWidth: 280, lineHeight: 1.35 }}>{subError}</div>}
        </div>
        {/* Artist description — upper right of the hero; compact: below it (further down) */}
        {artist.description && !compact && <ArtistDescription text={artist.description} name={artist.name} url={artist.descriptionUrl} />}
      </div>
      {artist.description && compact && <ArtistDescription inline text={artist.description} name={artist.name} url={artist.descriptionUrl} />}

      {/* The gap under the header belongs here, once, rather than on whichever section
          happens to come first. Top songs used to carry it as its own marginTop, so a page
          without them - a channel, see #28 - had its first heading sitting right against the
          banner. */}
      <div style={{ padding: "24px 24px 0" }}>

        {/* Top Songs */}
        {artist.tracks?.length > 0 && (() => {
          const visibleTracks = artist.tracks.filter(tr => !hideExplicit || !tr.isExplicit);
          if (!visibleTracks.length) return null;
          return (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
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

        {/* Albums, singles, videos, playlists: a carousel each. "Show all" opens the artist's
            discography (DiscographyView), a page of its own with all of them, where it used to
            unfold the shelf in place and push the rest of the page far down. A video or
            playlist shelf that YouTube Music gives as a playlist opens that playlist instead. */}
        {(() => {
          const shelves = discographyShelves(artist);
          const openAll = (kind) => onOpenDiscography?.({ browseId, name: artist.name, kind, shelves });
          const heading = (label, kind, playlistFallback) => (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: "var(--t16)", fontWeight: 600 }}>{label}</div>
              {(shelves[kind] || playlistFallback) && (
                <Button size="sm" variant="ghost" className="text-secondary font-medium h-7 px-3 min-w-0"
                  onPress={() => (shelves[kind] ? openAll(kind) : playlistFallback())}>
                  {t("showAll")}
                </Button>
              )}
            </div>
          );
          const carousel = (tiles) => <div className="carousel" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>{tiles}</div>;
          const asTrack = (x) => ({ videoId: x.videoId, title: x.title, artists: x.artists, thumbnail: x.thumbnail, duration: "" });
          return (<>
            {artist.albums?.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                {heading(t("albums"), "albums")}
                {carousel(artist.albums.map((a, i) => (
                  <MediaTile key={i} thumbnail={a.thumbnail} title={a.title} subtitle={a.year || null}
                    onOpen={() => onOpenAlbum({ browseId: a.browseId, title: a.title, thumbnail: a.thumbnail })}
                    onPlay={() => playAlbumDirect(a.browseId)}
                    onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: a.browseId, title: a.title, thumbnail: a.thumbnail, type: "album" }); }} />
                )))}
              </div>
            )}
            {artist.singles?.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                {heading(t("singles"), "singles")}
                {carousel(artist.singles.map((s, i) => (
                  <MediaTile key={i} thumbnail={s.thumbnail} title={s.title}
                    subtitle={s.year ? `${s.year}${s.type ? ` · ${s.type}` : ""}` : null}
                    onOpen={() => onOpenAlbum({ browseId: s.browseId, title: s.title, thumbnail: s.thumbnail })}
                    onPlay={() => playAlbumDirect(s.browseId)}
                    onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: s.browseId, title: s.title, thumbnail: s.thumbnail, type: "album" }); }} />
                )))}
              </div>
            )}
            {artist.videos?.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                {heading(t("videos"), "videos", artist.videosPlaylistId && (() => onOpenPlaylist({ playlistId: artist.videosPlaylistId, title: `${artist.name} – ${t("videos")}`, forcedTitle: `${artist.name} – ${t("videos")}`, thumbnail: artist.thumbnail })))}
                {carousel(artist.videos.map((v, i) => (
                  <MediaTile key={i} shape="video" thumbnail={v.thumbnail} title={v.title} subtitle={v.views || null}
                    onOpen={() => onPlay(asTrack(v), artist.videos.map(asTrack))} onPlay={() => onPlay(asTrack(v), artist.videos.map(asTrack))} />
                )))}
              </div>
            )}
            {artist.playlists?.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                {heading(t("playlists"), "playlists", artist.playlistsPlaylistId && (() => onOpenPlaylist({ playlistId: artist.playlistsPlaylistId, title: `${artist.name} – ${t("playlists")}`, forcedTitle: `${artist.name} – ${t("playlists")}`, thumbnail: artist.thumbnail })))}
                {carousel(artist.playlists.map((p, i) => (
                  <MediaTile key={i} thumbnail={p.thumbnail} title={p.title} subtitle={p.count ? `${p.count} ${t("songs")}` : null}
                    onOpen={() => onOpenPlaylist({ playlistId: p.playlistId, title: p.title, thumbnail: p.thumbnail })}
                    onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { playlistId: p.playlistId, title: p.title, thumbnail: p.thumbnail, type: "playlist" }); }} />
                )))}
              </div>
            )}
          </>);
        })()}

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


// What "Show all" can open for an artist: each shelf that unfolds (a channel id and params for
// /artist_albums, _videos, _playlists), with the items already on the page to show at once.
function discographyShelves(artist) {
  const shelf = (id, params, preview) => (id && params ? { channelId: id, params, preview: preview || [] } : null);
  return {
    albums: shelf(artist.albumsBrowseId, artist.albumsParams, artist.albums),
    singles: shelf(artist.singlesBrowseId, artist.singlesParams, artist.singles),
    videos: shelf(artist.videosBrowseId, artist.videosParams, artist.videos),
    playlists: shelf(artist.playlistsBrowseId, artist.playlistsParams, artist.playlists),
  };
}

const DISCO_SOURCES = {
  albums: { path: "artist_albums", key: "albums", label: "albums" },
  singles: { path: "artist_albums", key: "albums", label: "singles" },
  videos: { path: "artist_videos", key: "videos", label: "videos" },
  playlists: { path: "artist_playlists", key: "playlists", label: "playlists" },
};

/**
 * An artist's albums, singles, videos or playlists, all of them, as a grid: "Show all" on the
 * artist page opens it. Chips switch between the kinds the artist has; albums and singles can
 * be turned oldest first. A view of its own (App.jsx, "discography"), so Back returns to the
 * artist.
 */
export function DiscographyView({ name, shelves, initialKind, onKindChange, onPlay, onOpenAlbum, onOpenPlaylist, onContextMenu }) {
  const t = useLang();
  const kinds = Object.keys(DISCO_SOURCES).filter((k) => shelves?.[k]);
  const [kind, setKind] = useState(kinds.includes(initialKind) ? initialKind : kinds[0]);
  const [loaded, setLoaded] = useState({});   // kind -> full list
  const [oldestFirst, setOldestFirst] = useState(false);
  const shelf = shelves?.[kind];
  const src = DISCO_SOURCES[kind];
  // From the top, on opening and on each chip: the page scroll is shared, and the artist page
  // left it far down, past this page's title and chips.
  const rootRef = useRef(null);
  useEffect(() => { rootRef.current?.closest(".scrollable")?.scrollTo({ top: 0 }); }, [kind]);

  useEffect(() => {
    if (!shelf || loaded[kind]) return;
    let alive = true;
    fetch(`${API}/${src.path}?channelId=${encodeURIComponent(shelf.channelId)}&params=${encodeURIComponent(shelf.params)}`)
      .then((r) => r.json())
      .then((d) => { if (alive && !d.error && Array.isArray(d[src.key])) setLoaded((l) => ({ ...l, [kind]: d[src.key] })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = loaded[kind] || shelf?.preview || [];
  const byYear = kind === "albums" || kind === "singles";
  // YouTube Music lists them newest first; oldest first is that order turned, by year where
  // there is one (stable for the same year).
  const items = byYear && oldestFirst
    ? raw.map((x, i) => [x, i]).sort((a, b) => ((+a[0].year || 0) - (+b[0].year || 0)) || (b[1] - a[1])).map(([x]) => x)
    : raw;
  const playAlbumDirect = (browseId) => {
    fetch(`${API}/album/${browseId}`).then((r) => r.json())
      .then((d) => { if (d.tracks?.length) onPlay(d.tracks[0], d.tracks); }).catch(() => {});
  };
  const asTrack = (x) => ({ videoId: x.videoId, title: x.title, artists: x.artists, thumbnail: x.thumbnail, duration: "" });
  const chip = (on) => `shrink-0 h-8 px-3.5 rounded-[var(--r-full)] text-[length:var(--t13)] font-medium whitespace-nowrap border-0 cursor-default ${on ? "bg-[var(--text-primary)] text-[var(--bg-base)]" : "bg-[var(--fill-subtle)] text-primary"}`;

  return (
    <div ref={rootRef} style={{ padding: "8px 16px 32px" }}>
      <h1 style={{ fontSize: "var(--t20)", fontWeight: 700, margin: "4px 0 12px" }}>{name} · {t("discography")}</h1>
      <div className="sd-track" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        {kinds.map((k) => (
          <button key={k} type="button" className={chip(k === kind)} onClick={() => { setKind(k); onKindChange?.(k); }}>{t(DISCO_SOURCES[k].label)}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 0 12px", fontSize: "var(--t12)", color: "var(--text-muted)" }}>
        <span>{loaded[kind] ? t("discographyCount", { c: items.length }) : "…"}</span>
        {byYear && (
          <button type="button" onClick={() => setOldestFirst((v) => !v)}
            className="p-0 border-0 bg-transparent cursor-default text-[length:var(--t12)] text-secondary font-medium">
            {oldestFirst ? t("sortOldestFirst") : t("sortNewestFirst")} ⇅
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${kind === "videos" ? 220 : 150}px, 1fr))`, gap: 16 }}>
        {items.map((x, i) => kind === "videos" ? (
          <MediaTile key={i} fluid shape="video" thumbnail={x.thumbnail} title={x.title} subtitle={x.views || null}
            onOpen={() => onPlay(asTrack(x), items.map(asTrack))} onPlay={() => onPlay(asTrack(x), items.map(asTrack))} />
        ) : kind === "playlists" ? (
          <MediaTile key={i} fluid thumbnail={x.thumbnail} title={x.title} subtitle={x.count ? `${x.count} ${t("songs")}` : null}
            onOpen={() => onOpenPlaylist({ playlistId: x.playlistId, title: x.title, thumbnail: x.thumbnail })}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { playlistId: x.playlistId, title: x.title, thumbnail: x.thumbnail, type: "playlist" }); }} />
        ) : (
          <MediaTile key={i} fluid thumbnail={x.thumbnail} title={x.title}
            subtitle={x.year ? `${x.year}${x.type ? ` · ${x.type}` : ""}` : null}
            onOpen={() => onOpenAlbum({ browseId: x.browseId, title: x.title, thumbnail: x.thumbnail })}
            onPlay={() => playAlbumDirect(x.browseId)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, { browseId: x.browseId, title: x.title, thumbnail: x.thumbnail, type: "album" }); }} />
        ))}
      </div>
    </div>
  );
}
