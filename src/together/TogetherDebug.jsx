// ListenTogether prototype controls, in the debug tab. Plain on purpose: this is for trying the
// synchronisation out, the real interface comes once that feels right.
import { useState } from "react";
import { Button } from "@heroui/react";
import { useTogether, createRoom, join, leave, inviteLink, togetherUrl, setTune, TUNE_DEFAULTS } from "./together.js";

export function TogetherDebug() {
  const t = useTogether();
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => { try { return localStorage.getItem("kodama-together-name") || "Kodama"; } catch { return "Kodama"; } });
  const [server, setServer] = useState(togetherUrl());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const remember = () => {
    try { localStorage.setItem("kodama-together-name", name); localStorage.setItem("kodama-together-url", server); } catch { /* fine */ }
  };
  const create = async () => {
    remember(); setBusy(true); setErr(null);
    try { join(await createRoom(), name); } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  };
  const row = "flex items-center gap-2";
  const field = "h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] text-primary outline-none text-[length:var(--t12)]";
  return (
    <div className="setting-row p-4 flex flex-col gap-3">
      <div className="text-[length:var(--t13)] font-semibold">ListenTogether (prototype)</div>
      {t.status === "idle" || t.status === "closed" ? (
        <>
          <div className={row}>
            <input className={field + " flex-1"} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" />
            <input className={field + " flex-1 font-mono"} value={server} onChange={(e) => setServer(e.target.value)} aria-label="Room server" />
          </div>
          <div className={row}>
            <Button size="sm" variant="primary" isDisabled={busy} onPress={create}>Create room</Button>
            <input className={field + " flex-1 font-mono"} value={code} onChange={(e) => setCode(e.target.value.trim().toLowerCase())} placeholder="room code" aria-label="Room code" />
            <Button size="sm" variant="secondary" isDisabled={!code} onPress={() => { remember(); join(code, name); }}>Join</Button>
          </div>
          {(err || t.error) && <div className="text-[length:var(--t11)] text-[var(--status-danger)]">{err || t.error}</div>}
        </>
      ) : (
        <>
          <div className={row + " flex-wrap text-[length:var(--t12)]"}>
            <span className="font-mono">{t.room}</span>
            <span className="text-muted">· {t.status} · {t.isHost ? "host" : "listener"}</span>
            <Button size="sm" variant="ghost" onPress={() => navigator.clipboard.writeText(inviteLink(t.room)).catch(() => {})}>Copy invite</Button>
            <Button size="sm" variant="ghost" className="ml-auto" onPress={leave}>Leave</Button>
          </div>
          <div className="text-[length:var(--t11)] text-muted font-mono">
            rtt {t.rtt ?? "–"} ms · offset {Math.round(t.offset)} ms{t.drift != null ? ` · ${t.isHost ? "off" : "drift"} ${t.drift} ms` : ""}{t.sync.late != null ? ` · start late ${t.sync.late} ms` : ""}
          </div>
          {!t.isHost && (
            <div className="text-[length:var(--t11)] text-muted font-mono">
              {t.sync.phase} · ahead {t.sync.ahead} s · speed {((t.sync.rate - 1) * 1000).toFixed(1)} ‰ (base {(t.sync.base * 1000).toFixed(1)} ‰)
            </div>
          )}
          {!t.isHost && t.sync.log?.length > 0 && (
            <div className="text-[length:var(--t11)] text-muted font-mono leading-snug select-text">
              {t.sync.log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          <div className={row + " flex-wrap text-[length:var(--t11)] text-muted"}>
            {[["seekAbove", "Re-sync above", "ms"], ["maxRate", "Max speed", "‰"], ["hostReport", "Host report", "ms"], ["latency", "Audio delay", "ms"]].map(([k, label, unit]) => (
              <label key={k} className="flex items-center gap-1.5">
                {label}
                <input type="number" step="10" className={field + " w-[76px] font-mono"} value={t.tune?.[k] ?? TUNE_DEFAULTS[k]}
                  onChange={(e) => setTune({ [k]: Number(e.target.value) || 0 })} aria-label={`${label} (${unit})`} />
                {unit}
              </label>
            ))}
          </div>
          <div className="text-[length:var(--t11)] text-muted">
            {t.state?.track ? `${t.state.playing ? "▶" : "❚❚"} ${t.state.track.title} @ ${t.state.pos.toFixed(1)}s` : "nothing playing"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {t.members.map((m) => (
              <span key={m.id} className="px-2 py-0.5 rounded-[var(--r-full)] bg-[var(--surface-2)] text-[length:var(--t11)]">
                {m.name}{m.host ? " ★" : ""}{t.you?.id === m.id ? " (you)" : ""}
              </span>
            ))}
          </div>
          {t.error && <div className="text-[length:var(--t11)] text-[var(--status-danger)]">{t.error}</div>}
        </>
      )}
    </div>
  );
}
