// Unison community-lyrics API: identity-signed vote / report / nickname calls.
// Extracted from App.jsx.
import { API } from "../context.jsx";
import { buildSignedRequest } from "./identity.js";

function getUnisonIdentity() {
  try { const raw = localStorage.getItem("kodama-unison-identity"); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
async function unisonVote(lyricsId, vote) {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const method = vote === 0 ? "DELETE" : "POST";
  const body = await buildSignedRequest(id, vote === 0 ? {} : { vote });
  const r = await fetch(`${API}/unison/lyrics/${lyricsId}/vote`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("vote_failed");
  return true;
}
async function unisonReport(lyricsId, reason, details) {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const body = await buildSignedRequest(id, details ? { reason, details } : { reason });
  const r = await fetch(`${API}/unison/lyrics/${lyricsId}/report`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("report_failed");
  return true;
}

// Set / reset / look up the identity's Unison nickname (custom display name).
async function unisonSetNickname(nickname) {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const body = await buildSignedRequest(id, { nickname });
  const r = await fetch(`${API}/unison/auth/nickname`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "nickname_failed");
  return d;
}
async function unisonResetNickname() {
  const id = getUnisonIdentity();
  if (!id) throw new Error("no_identity");
  const body = await buildSignedRequest(id, {});
  const r = await fetch(`${API}/unison/auth/nickname`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("reset_failed");
  return true;
}
async function unisonFetchDisplayName(keyId) {
  try {
    const r = await fetch(`${API}/unison/displayname/${keyId}`);
    if (r.ok) return (await r.json()).displayName || null;
  } catch {}
  return null;
}

export { getUnisonIdentity, unisonVote, unisonReport, unisonSetNickname, unisonResetNickname, unisonFetchDisplayName };
