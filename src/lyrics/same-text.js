// Whether a translation or romanisation only repeats the line it belongs to.
//
// Shown anyway, it is the same words twice. The backend translates a line together with its
// background vocals, so a line already in the target language comes back as "main bg" and has to
// count as a repeat too. Spacing and case are ignored: the services disagree on both.
const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

export const lineMainText = (line) =>
  line?.wordSync ? (line.words || []).map(w => w.text).join("") : (line?.text || "");

export function repeatsLine(line, s) {
  if (!line || !s) return false;
  const n = norm(s), text = lineMainText(line);
  if (n === norm(text)) return true;
  const bg = (line.bgWords || []).map(w => w.text).join("") || line.bgText || "";
  return !!bg && n === norm(`${text} ${bg}`);
}
