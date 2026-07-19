import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  CardRoot,
  Skeleton,
  Spinner,
  ToggleButton,
  ToggleButtonGroupRoot,
} from "@heroui/react";

import { ExplicitBadge } from "@/features/music/components/rows.jsx";
import {
  CaretLeft,
  CaretRight,
  ArrowsClockwise,
  CloudSun,
  Headphones,
  Moon,
  MoonStars,
  MusicNote,
  Play,
  PodcastIcon,
  Sun,
  SunHorizon,
} from "@/shared/icons/icons.jsx";
import { API } from "@/shared/api/client.js";
import { thumb } from "@/shared/api/thumbnails.js";
import { useLang } from "@/shared/i18n/context.jsx";
import { Carousel } from "../components/carousel.jsx";
import { usePlayerActions } from "../../player/player-context.jsx";

export function HomeView({
  displayName,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist,
  onContextMenu,
  onTrackContextMenu,
  hideExplicit,
}) {
  const { handlePlay } = usePlayerActions();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moodGroups, setMoodGroups] = useState({}); // { "For you": [...], "Moods & moments": [...], "Genres": [...] }
  const [activeMoodTab, setActiveMoodTab] = useState(null);
  const [activeMoodChip, setActiveMoodChip] = useState(null);
  const [moodPlaylists, setMoodPlaylists] = useState([]);
  const [moodLoading, setMoodLoading] = useState(false);
  const [podcastLoading, setPodcastLoading] = useState(null); // playlistId being fetched
  const [speedDialPage, setSpeedDialPage] = useState(0);
  const t = useLang();
  const homeCancelledRef = useRef(false);

  const loadHome = useCallback(async (attempt = 0) => {
    setLoading(true);
    setError(null);
    for (let retry = attempt; retry <= 6; retry += 1) {
      try {
        const response = await fetch(`${API}/home`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
        if (homeCancelledRef.current) return;
        const nextSections = data.sections || [];
        if (nextSections.length > 0 || retry === 6) {
          setSections(nextSections);
          setLoading(false);
          return;
        }
      } catch (cause) {
        if (homeCancelledRef.current) return;
        if (retry === 6) {
          setSections([]);
          setError(cause.message || "Unable to load Home");
          setLoading(false);
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }, []);

  useEffect(() => {
    homeCancelledRef.current = false;
    loadHome();
    fetch(`${API}/mood/categories`)
      .then((r) => r.json())
      .then((d) => {
        const groups = d && !Array.isArray(d) && typeof d === "object" ? d : {};
        setMoodGroups(groups);
        const firstKey = Object.keys(groups)[0];
        if (firstKey) setActiveMoodTab(firstKey);
      })
      .catch(() => {});
    return () => {
      homeCancelledRef.current = true;
    };
  }, [loadHome]);

  const handleMoodChipClick = (chip) => {
    if (activeMoodChip?.params === chip.params) {
      setActiveMoodChip(null);
      setMoodPlaylists([]);
      return;
    }
    setActiveMoodChip(chip);
    setMoodLoading(true);
    setMoodPlaylists([]);
    fetch(`${API}/mood/playlists?params=${encodeURIComponent(chip.params)}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setMoodPlaylists(d);
        setMoodLoading(false);
      })
      .catch(() => setMoodLoading(false));
  };

  const handlePodcastClick = async (item) => {
    if (podcastLoading) return;
    const pid = item.playlistId || item.browseId;
    if (!pid) return;
    setPodcastLoading(pid);
    try {
      const r = await fetch(`${API}/podcast/${pid}`);
      if (!r.ok) throw new Error("fetch failed");
      const d = await r.json();
      const episodes = (d.episodes || [])
        .filter((ep) => ep.videoId)
        .map((ep) => ({
          type: "song",
          videoId: ep.videoId,
          title: ep.title,
          artists: d.author?.name || "",
          artistBrowseId: d.author?.id || "",
          artistLinks: [],
          album: d.title || "",
          albumBrowseId: "",
          duration: ep.duration || "",
          thumbnail: ep.thumbnail || item.thumbnail,
          isExplicit: false,
        }));
      if (episodes.length) {
        handlePlay(episodes[0], episodes);
      } else {
        onOpenPlaylist({ playlistId: pid, title: item.title, thumbnail: item.thumbnail });
      }
    } catch {
      onOpenPlaylist({ playlistId: pid, title: item.title, thumbnail: item.thumbnail });
    } finally {
      setPodcastLoading(null);
    }
  };

  // ── Section classification ────────────────────────────────────────────────
  const tl = (s) => (s.title || "").toLowerCase();
  const isDiscover = (s) => tl(s).includes("discover");
  const isListenAgain = (s) =>
    tl(s).includes("listen again") || tl(s).includes("erneut anhören") || tl(s).includes("nochmal");
  const isQuickPicks = (s) =>
    tl(s).includes("quick pick") ||
    tl(s).includes("speed dial") ||
    tl(s).includes("schnellzugriff");
  const isAllSongsSection = (s) => s.items.length > 0 && s.items.every((x) => x.type === "song");

  const allSections = sections
    .map((s) => ({
      ...s,
      items: (s.items || []).filter((x) => !hideExplicit || !x.isExplicit),
    }))
    .filter((s) => s.items.length > 0);

  const discoverSection = allSections.find(isDiscover);
  const listenAgainSection = allSections.find(isListenAgain);
  // Speed Dial source = "Quick picks" (YTMusic's recommendations grid). Fall back to
  // the first all-songs section that isn't Discover/Listen again.
  const speedDialSection =
    allSections.find(isQuickPicks) ||
    allSections.find((s) => isAllSongsSection(s) && !isDiscover(s) && !isListenAgain(s));
  const speedDialItems = speedDialSection?.items || [];

  // Left column: up to 2 carousel sections. Prefer Listen again + Daily Discover,
  // then fill from remaining (non-song-grid) sections so the column reliably
  // matches the Speed Dial height even when the feed rotates one of them out.
  const preferredLeft = [listenAgainSection, discoverSection].filter(Boolean);
  const usedTitles = new Set(
    [speedDialSection, ...preferredLeft].filter(Boolean).map((s) => s.title)
  );
  const leftSections = [...preferredLeft];
  for (const s of allSections) {
    if (leftSections.length >= 2) break;
    if (usedTitles.has(s.title) || isAllSongsSection(s)) continue;
    leftSections.push(s);
    usedTitles.add(s.title);
  }
  const leftTitles = new Set(leftSections.map((s) => s.title));
  const regularSections = allSections.filter(
    (s) => s.title !== speedDialSection?.title && !leftTitles.has(s.title)
  );

  // ── Shared: play-direct for carousels ────────────────────────────────────
  const handleCardPlayDirect = (e, item, section) => {
    e.stopPropagation();
    if (item.type === "podcast" || item.type === "podcast_episode") {
      handlePodcastClick(item);
      return;
    }
    if (item.type === "song") {
      handlePlay(
        item,
        (section?.items || []).filter((x) => x.type === "song")
      );
      return;
    }
    if (item.type === "album") {
      fetch(`${API}/album/${item.browseId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.tracks?.length) handlePlay(d.tracks[0], d.tracks);
        })
        .catch(() => {});
      return;
    }
    if (item.type === "playlist") {
      const es = new EventSource(`${API}/playlist/${item.playlistId}/stream`);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "tracks" && msg.tracks?.length) {
            handlePlay(msg.tracks[0], msg.tracks);
            es.close();
          } else if (msg.type === "done" || msg.type === "error") es.close();
        } catch {
          es.close();
        }
      };
      es.onerror = () => es.close();
    }
  };

  const handleCardClick = (item, section) => {
    if (item.type === "song") {
      handlePlay(
        item,
        (section?.items || []).filter((x) => x.type === "song")
      );
      return;
    }
    if (item.type === "podcast" || item.type === "podcast_episode") {
      handlePodcastClick(item);
      return;
    }
    if (item.type === "playlist") {
      onOpenPlaylist({ playlistId: item.playlistId, title: item.title, thumbnail: item.thumbnail });
      return;
    }
    if (item.type === "album") {
      onOpenAlbum({ browseId: item.browseId, title: item.title, thumbnail: item.thumbnail });
      return;
    }
    if (item.type === "artist") {
      onOpenArtist({ browseId: item.browseId, artist: item.title });
    }
  };

  const getContextItem = (item) => {
    if (item.type === "playlist" || item.type === "podcast")
      return { playlistId: item.playlistId, title: item.title, thumbnail: item.thumbnail };
    if (item.type === "album")
      return {
        browseId: item.browseId,
        title: item.title,
        thumbnail: item.thumbnail,
        type: "album",
      };
    if (item.type === "artist")
      return {
        browseId: item.browseId,
        title: item.title,
        thumbnail: item.thumbnail,
        type: "artist",
      };
    return null;
  };

  // ── MediaCard ─────────────────────────────────────────────────────────────
  const MediaCard = ({ item, section, size = 160 }) => {
    const isArtist = item.type === "artist";
    const isPodcast = item.type === "podcast" || item.type === "podcast_episode";
    const isLoading =
      podcastLoading && (podcastLoading === item.playlistId || podcastLoading === item.browseId);
    const ctx = getContextItem(item);
    return (
      <CardRoot
        variant="transparent"
        className="home-card p-0! gap-0! rounded-none! shadow-none!"
        onClick={() => handleCardClick(item, section)}
        onContextMenu={
          item.type === "song"
            ? (e) => {
                e.preventDefault();
                onTrackContextMenu?.(e, item);
              }
            : ctx
              ? (e) => {
                  e.preventDefault();
                  onContextMenu?.(e, ctx);
                }
              : undefined
        }
        style={{ flexShrink: 0, width: size, cursor: "default" }}
      >
        <div
          style={{
            position: "relative",
            marginBottom: 8,
            borderRadius: isArtist ? "50%" : 10,
            overflow: "hidden",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ width: size, height: size, background: "var(--bg-elevated)" }}>
            {item.thumbnail ? (
              <img
                className="home-card-img"
                src={thumb(item.thumbnail)}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transition: "transform 0.25s",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg,#2a1535,#1a0a25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isPodcast ? (
                  <PodcastIcon size={size * 0.3} style={{ opacity: 0.4 }} />
                ) : (
                  <MusicNote size={size * 0.3} style={{ opacity: 0.25 }} />
                )}
              </div>
            )}
          </div>
          {!isArtist && (
            <div
              className="home-card-play"
              style={{
                position: "absolute",
                bottom: 8,
                right: 8,
                opacity: 0,
                transform: "translateY(8px)",
                transition: "opacity 0.2s, transform 0.2s",
                pointerEvents: "none",
              }}
            >
              <div
                className="home-card-play-btn"
                onClick={(e) => handleCardPlayDirect(e, item, section)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "auto",
                  cursor: "default",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
                }}
              >
                {isLoading ? (
                  <Spinner
                    size="sm"
                    classNames={{ circle1: "border-white", circle2: "border-white" }}
                  />
                ) : isPodcast ? (
                  <Headphones size={17} style={{ color: "white" }} />
                ) : (
                  <Play size={17} weight="fill" style={{ color: "white", marginLeft: 2 }} />
                )}
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: "var(--t13)",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "flex",
            alignItems: "center",
            gap: 5,
            textAlign: isArtist ? "center" : "left",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</span>
          {item.isExplicit && <ExplicitBadge />}
        </div>
        {(item.subtitle || (item.type === "song" && item.artists) || item.type === "artist") && (
          <div
            style={{
              fontSize: "var(--t11)",
              color: "var(--text-muted)",
              marginTop: 3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textAlign: isArtist ? "center" : "left",
            }}
          >
            {item.subtitle || item.artists || "Artist"}
          </div>
        )}
      </CardRoot>
    );
  };

  // ── Loading skeleton (HeroUI Skeleton) ────────────────────────────────────
  if (loading)
    return (
      <div style={{ padding: 28 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ marginBottom: 36 }}>
            <Skeleton className="h-3.5 w-40 rounded mb-4" />
            <div style={{ display: "flex", gap: 16 }}>
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} style={{ flexShrink: 0, width: 160 }}>
                  <Skeleton className="w-40 h-40 rounded-[10px] mb-2.5" />
                  <Skeleton className="h-3 w-[80%] rounded mb-1.5" />
                  <Skeleton className="h-2.5 w-[55%] rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  if (error)
    return (
      <div data-testid="view-home" style={{ padding: 28, color: "var(--text-secondary)" }}>
        <div data-testid="home-load-error" style={{ color: "#f44336", marginBottom: 12 }}>
          {error}
        </div>
        <Button size="sm" variant="secondary" onPress={loadHome}>
          {t("retry") || "Retry"}
        </Button>
      </div>
    );

  if (!allSections.length)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 14,
          height: "100%",
          minHeight: 360,
          padding: 28,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-elevated)",
          }}
        >
          <MusicNote size={24} className="text-muted" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 360 }}>
          <div style={{ fontSize: "var(--t14)", fontWeight: 600, color: "var(--text-primary)" }}>
            {t("noSuggestions")}
          </div>
          <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)" }}>
            {t("noSuggestionsHint")}
          </div>
        </div>
        <Button variant="secondary" size="sm" onPress={() => loadHome(0)} className="gap-1.5 mt-1">
          <ArrowsClockwise size={14} />
          {t("refresh")}
        </Button>
      </div>
    );

  const { greeting, GreetingIcon } = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return { greeting: t("goodMorning"), GreetingIcon: SunHorizon };
    if (h >= 11 && h < 13) return { greeting: t("goodDay"), GreetingIcon: Sun };
    if (h >= 13 && h < 18) return { greeting: t("goodAfternoon"), GreetingIcon: CloudSun };
    if (h >= 18 && h < 23) return { greeting: t("goodEvening"), GreetingIcon: Moon };
    return { greeting: t("goodNight"), GreetingIcon: MoonStars };
  })();

  return (
    <div data-testid="view-home" style={{ padding: "0 0 40px 0" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.9}}
        @keyframes homeHeaderIcon{from{opacity:0;transform:translateY(-22px) scale(0.8)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes homeHeaderText{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .carousel::-webkit-scrollbar{height:8px}
        .carousel::-webkit-scrollbar-track{background:transparent}
        .carousel::-webkit-scrollbar-thumb{background-color:transparent;border-radius:4px;border:2.5px solid transparent;background-clip:content-box;transition:background-color 0.2s}
        .carousel:hover::-webkit-scrollbar-thumb{background-color:var(--bg-elevated)}
        /* Smoothly-animated ScrollShadow edge fade. @property makes the fade widths
           interpolatable, so the mask gently fades in/out instead of hard-cutting. */
        @property --fade-l{syntax:"<length>";inherits:false;initial-value:0px}
        @property --fade-r{syntax:"<length>";inherits:false;initial-value:0px}
        .carousel{--fade-l:0px;--fade-r:0px;
          -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 var(--fade-l),#000 calc(100% - var(--fade-r)),transparent 100%)!important;
          mask-image:linear-gradient(90deg,transparent 0,#000 var(--fade-l),#000 calc(100% - var(--fade-r)),transparent 100%)!important;
          transition:--fade-l 0.3s ease,--fade-r 0.3s ease}
        .carousel[data-left-scroll="true"],.carousel[data-left-right-scroll="true"]{--fade-l:28px}
        .carousel[data-right-scroll="true"],.carousel[data-left-right-scroll="true"]{--fade-r:28px}
        .home-card:hover .home-card-play{opacity:1!important;transform:translateY(0)!important}
        .home-card:hover .home-card-img{transform:scale(1.04)}
      `}</style>

      {/* ── Gradient header (centered hero) ── */}
      <div
        style={{
          position: "relative",
          padding: "120px 28px 72px",
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 100% at 50% 0%, var(--accent), transparent 70%)",
            opacity: 0.18,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 18,
          }}
        >
          <GreetingIcon
            size={64}
            weight="duotone"
            style={{
              color: "var(--accent)",
              flexShrink: 0,
              animation: "homeHeaderIcon 0.6s cubic-bezier(0.22,1,0.36,1) both",
            }}
          />
          <h1
            style={{
              fontSize: "var(--t26, 28px)",
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.25,
              animation: "homeHeaderText 0.55s cubic-bezier(0.22,1,0.36,1) 0.12s both",
            }}
          >
            {greeting}
            {displayName && (
              <>
                {", "}
                <span style={{ color: "var(--accent)" }}>{displayName}</span>
              </>
            )}
          </h1>
        </div>
      </div>

      {/* ── Top row: left stack (carousels) + Speed Dial (right) ── */}
      {(leftSections.length > 0 || speedDialItems.length > 0) &&
        (() => {
          const PER_PAGE = 9;
          const pages = [];
          for (let i = 0; i < speedDialItems.length; i += PER_PAGE)
            pages.push(speedDialItems.slice(i, i + PER_PAGE));
          const curPage = Math.min(speedDialPage, Math.max(0, pages.length - 1));
          const hasSpeedDial = speedDialItems.length > 0;
          const hasLeft = leftSections.length > 0;
          const goPage = (dir) =>
            setSpeedDialPage((p) => {
              const cur = Math.min(p, pages.length - 1);
              return Math.max(0, Math.min(pages.length - 1, cur + dir));
            });

          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  hasLeft && hasSpeedDial
                    ? "1fr minmax(0, 460px)"
                    : hasSpeedDial
                      ? "minmax(0, 460px)"
                      : "1fr",
                gap: 16,
                paddingLeft: 28,
                paddingRight: 28,
                marginBottom: 32,
                alignItems: "start",
              }}
            >
              {/* Left column — up to 2 plain carousels stacked (Listen again, Daily Discover, …) */}
              {hasLeft && (
                <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
                  {leftSections.map((section, li) => {
                    return (
                      <div key={li} style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 12,
                          }}
                        >
                          <span style={{ fontSize: "var(--t16)", fontWeight: 700 }}>
                            {section.title}
                          </span>
                        </div>
                        <Carousel style={{ gap: 16, paddingBottom: 8 }}>
                          {section.items.map((item, i) => (
                            <MediaCard key={i} item={item} section={section} size={148} />
                          ))}
                        </Carousel>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Speed Dial — Quick picks recommendations as a paginated 3×3 grid */}
              {hasSpeedDial && (
                <CardRoot
                  variant="transparent"
                  className="overflow-hidden gap-0! p-0!"
                  style={{
                    background: "color-mix(in srgb, var(--bg-surface) 55%, transparent)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "none",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 16px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: "var(--t12)",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {t("speedDial")}
                      </span>
                    </div>
                    {pages.length > 1 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="secondary"
                          className="size-7 min-w-0 rounded-full"
                          isDisabled={curPage === 0}
                          onPress={() => goPage(-1)}
                        >
                          <CaretLeft size={13} weight="bold" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="secondary"
                          className="size-7 min-w-0 rounded-full"
                          isDisabled={curPage >= pages.length - 1}
                          onPress={() => goPage(1)}
                        >
                          <CaretRight size={13} weight="bold" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 10,
                      padding: "0 16px 12px",
                    }}
                  >
                    {Array.from({
                      length: pages.length > 1 ? PER_PAGE : pages[0]?.length || 0,
                    }).map((_, i) => {
                      const item = (pages[curPage] || [])[i];
                      // Empty placeholder keeps the grid at a constant 3-row height on the last page
                      if (!item)
                        return (
                          <div key={i} aria-hidden style={{ minWidth: 0, aspectRatio: "1 / 1" }} />
                        );
                      return (
                        <CardRoot
                          key={i}
                          variant="transparent"
                          className="home-card p-0! gap-0! rounded-none! shadow-none!"
                          onClick={() => handlePlay(item, speedDialItems)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            onTrackContextMenu?.(e, item);
                          }}
                          style={{ cursor: "default", minWidth: 0 }}
                        >
                          <div
                            style={{
                              position: "relative",
                              width: "100%",
                              aspectRatio: "1 / 1",
                              borderRadius: 8,
                              overflow: "hidden",
                              background: "var(--bg-elevated)",
                            }}
                          >
                            {item.thumbnail ? (
                              <img
                                className="home-card-img"
                                src={thumb(item.thumbnail)}
                                alt=""
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  transition: "transform 0.25s",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  background: "linear-gradient(135deg,#2a1535,#1a0a25)",
                                }}
                              />
                            )}
                            {/* Gradient + title/artist overlay (bottom-left) */}
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                background:
                                  "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 32%, transparent 60%)",
                                pointerEvents: "none",
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                left: 8,
                                right: 8,
                                bottom: 7,
                                pointerEvents: "none",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "var(--t11)",
                                  fontWeight: 700,
                                  color: "#fff",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                                }}
                              >
                                {item.title}
                              </div>
                              <div
                                style={{
                                  fontSize: "var(--t10)",
                                  color: "rgba(255,255,255,0.78)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  marginTop: 1,
                                  textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                                }}
                              >
                                {item.artists}
                              </div>
                            </div>
                            <div
                              className="home-card-play"
                              style={{
                                position: "absolute",
                                inset: 0,
                                opacity: 0,
                                transition: "opacity 0.2s",
                                background: "rgba(0,0,0,0.4)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                pointerEvents: "none",
                              }}
                            >
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  background: "var(--accent)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Play
                                  size={13}
                                  weight="fill"
                                  style={{ color: "white", marginLeft: 2 }}
                                />
                              </div>
                            </div>
                          </div>
                        </CardRoot>
                      );
                    })}
                  </div>
                  {/* Pagination dots */}
                  {pages.length > 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 6,
                        paddingBottom: 14,
                      }}
                    >
                      {pages.map((_, pi) => (
                        <button
                          key={pi}
                          onClick={() => setSpeedDialPage(pi)}
                          style={{
                            width: pi === curPage ? 18 : 7,
                            height: 7,
                            borderRadius: 4,
                            border: "none",
                            padding: 0,
                            background:
                              pi === curPage
                                ? "var(--accent)"
                                : "color-mix(in srgb, var(--text-muted) 55%, transparent)",
                            cursor: "default",
                            transition: "width 0.2s, background 0.2s",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </CardRoot>
              )}
            </div>
          );
        })()}

      {/* ── Regular sections (carousels) ── */}
      {regularSections.map((section, si) => (
        <div key={si} style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 12,
              paddingLeft: 28,
              paddingRight: 28,
            }}
          >
            <span style={{ fontSize: "var(--t16)", fontWeight: 700 }}>{section.title}</span>
          </div>
          <Carousel insetX={28} style={{ gap: 16, paddingBottom: 8 }}>
            {section.items.map((item, ii) => (
              <MediaCard key={ii} item={item} section={section} />
            ))}
          </Carousel>
        </div>
      ))}

      {/* ── Moods & Genres (full grid, tabbed) ── */}
      {Object.keys(moodGroups).length > 0 && (
        <div style={{ paddingLeft: 28, paddingRight: 28, marginTop: 8 }}>
          <CardRoot variant="secondary" className="overflow-hidden gap-0! p-0!">
            {/* Header + group selector (HeroUI segmented ToggleButtonGroup) */}
            <div
              style={{
                padding: "16px 20px 14px",
                borderBottom: "1.5px solid var(--border-subtle, var(--bg-elevated))",
              }}
            >
              <div style={{ fontSize: "var(--t16)", fontWeight: 700, marginBottom: 12 }}>
                {t("moodsGenres")}
              </div>
              <ToggleButtonGroupRoot
                selectionMode="single"
                disallowEmptySelection
                size="sm"
                selectedKeys={[activeMoodTab]}
                onSelectionChange={(keys) => {
                  const k = [...keys][0];
                  if (k != null) {
                    setActiveMoodTab(String(k));
                    setActiveMoodChip(null);
                    setMoodPlaylists([]);
                  }
                }}
              >
                {Object.keys(moodGroups).map((tabKey) => (
                  <ToggleButton key={tabKey} id={tabKey}>
                    {tabKey}
                  </ToggleButton>
                ))}
              </ToggleButtonGroupRoot>
            </div>

            {/* Genre/mood toggle buttons */}
            <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(moodGroups[activeMoodTab] || []).map((chip, i) => {
                const active = activeMoodChip?.params === chip.params;
                return (
                  <ToggleButton
                    key={i}
                    size="md"
                    variant="default"
                    isSelected={active}
                    onChange={() => handleMoodChipClick(chip)}
                  >
                    {chip.title}
                  </ToggleButton>
                );
              })}
            </div>

            {/* Mood / genre results */}
            {activeMoodChip && (
              <div
                style={{
                  borderTop: "1.5px solid var(--border-subtle, var(--bg-elevated))",
                  padding: "14px 20px 18px",
                }}
              >
                <div style={{ fontSize: "var(--t14)", fontWeight: 700, marginBottom: 14 }}>
                  {activeMoodChip.title}
                </div>
                {moodLoading ? (
                  <div style={{ display: "flex", gap: 14 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} style={{ flexShrink: 0, width: 148 }}>
                        <Skeleton className="w-[148px] h-[148px] rounded-[10px]" />
                        <Skeleton className="h-[11px] w-[72%] rounded mt-2.5" />
                      </div>
                    ))}
                  </div>
                ) : moodPlaylists.length === 0 ? (
                  <div style={{ fontSize: "var(--t13)", color: "var(--text-muted)" }}>
                    {t("noSuggestions")}
                  </div>
                ) : (
                  <Carousel style={{ gap: 14, paddingBottom: 4 }}>
                    {moodPlaylists.map((item, i) => (
                      <MediaCard
                        key={i}
                        item={item}
                        section={{ items: moodPlaylists }}
                        size={148}
                      />
                    ))}
                  </Carousel>
                )}
              </div>
            )}
          </CardRoot>
        </div>
      )}
    </div>
  );
}
