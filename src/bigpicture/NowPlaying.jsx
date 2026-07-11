// Big Picture — Now Playing screen. Big cover + transport, driven by the real player via the
// in-process bridge. Controller/keyboard focusable; the seek bar seeks ±10s on left/right.
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { thumbHi } from "../context.jsx";
import { useNowPlaying, sendPlayerCommand, sendSeek } from "./playerBridge.js";
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, RepeatOnce, Microphone } from "../icons.jsx";

const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

function CtrlBtn({ icon, onPress, size = 64, primary, active }) {
  const { ref, focused } = useFocusable({ onEnterPress: onPress });
  return (
    <div ref={ref} onClick={onPress} style={{
      width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      background: primary ? "var(--accent)" : (focused ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"),
      color: primary ? "#fff" : (active ? "var(--accent)" : "#fff"),
      outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
      boxShadow: focused ? "0 0 0 6px color-mix(in srgb, var(--accent) 30%, transparent)" : "none",
      transform: focused ? "scale(1.1)" : "scale(1)",
      transition: "transform .14s, box-shadow .14s, background .14s, outline-color .14s, color .14s",
      cursor: "default",
    }}>{icon}</div>
  );
}

function SeekBar({ position, duration }) {
  const { ref, focused } = useFocusable({
    onArrowPress: (dir) => {
      if (dir === "left") { sendSeek(Math.max(0, position - 10)); return false; }
      if (dir === "right") { sendSeek(position + 10); return false; }
      return true; // up/down navigate away normally
    },
  });
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div ref={ref} style={{ outline: focused ? "3px solid var(--accent)" : "3px solid transparent", outlineOffset: 8, borderRadius: 10, padding: "6px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
        <span>{fmt(position)}</span>
        <span style={{ opacity: focused ? 1 : 0, color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>◀ 10s ▶</span>
        <span>{fmt(duration)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: "var(--accent)", borderRadius: 4 }} />
      </div>
    </div>
  );
}

function LyricsBtn({ onPress }) {
  const { ref, focused } = useFocusable({ onEnterPress: onPress });
  return (
    <div ref={ref} onClick={onPress} style={{
      display: "inline-flex", alignItems: "center", gap: 10, marginTop: 30, padding: "12px 22px", borderRadius: 999, cursor: "default",
      color: focused ? "#0a0a0f" : "#fff", fontSize: 17, fontWeight: 700,
      background: focused ? "var(--accent)" : "rgba(255,255,255,0.08)",
      outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
      boxShadow: focused ? "0 0 0 5px color-mix(in srgb, var(--accent) 28%, transparent)" : "none",
      transform: focused ? "scale(1.05)" : "scale(1)", transition: "transform .12s, background .12s, box-shadow .12s, color .12s, outline-color .12s",
    }}>
      <Microphone size={20} weight="fill" /> Lyrics
    </div>
  );
}

export function NowPlaying({ onOpenLyrics }) {
  const np = useNowPlaying();
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", padding: "7vh 8vw", background: "radial-gradient(120% 90% at 50% 0%, #241033, #08080c 55%)" }}>
      <div style={{ display: "flex", gap: 56, alignItems: "center", flex: 1, minHeight: 0 }}>
        <div style={{ width: "40vh", height: "40vh", maxWidth: 440, maxHeight: 440, borderRadius: 24, overflow: "hidden", flexShrink: 0, boxShadow: "0 30px 80px rgba(0,0,0,.6)", background: "linear-gradient(135deg,#2a1535,#17091f)" }}>
          {np.thumbnail ? <img src={thumbHi(np.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 46, fontWeight: 800, lineHeight: 1.12, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{np.title || "Nichts spielt gerade"}</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 24, marginBottom: 44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{np.artists}</div>
          <SeekBar position={np.position} duration={np.duration} />
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 44 }}>
            <CtrlBtn size={56} icon={<Shuffle size={24} />} active={np.shuffle} onPress={() => sendPlayerCommand("shuffle")} />
            <CtrlBtn size={64} icon={<SkipBack size={28} weight="fill" />} onPress={() => sendPlayerCommand("prev")} />
            <CtrlBtn size={86} primary icon={np.isPlaying ? <Pause size={38} weight="fill" /> : <Play size={38} weight="fill" />} onPress={() => sendPlayerCommand("playpause")} />
            <CtrlBtn size={64} icon={<SkipForward size={28} weight="fill" />} onPress={() => sendPlayerCommand("next")} />
            <CtrlBtn size={56} icon={np.repeat === "one" ? <RepeatOnce size={24} /> : <Repeat size={24} />} active={!!np.repeat && np.repeat !== "none"} onPress={() => sendPlayerCommand("repeat")} />
          </div>
          {onOpenLyrics ? <LyricsBtn onPress={onOpenLyrics} /> : null}
        </div>
      </div>
    </div>
  );
}
