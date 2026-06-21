// -- Functions -----------------------------------------------------------------

function ensureHttpScheme(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidHttpUrl(value: string): boolean {
  const candidate = ensureHttpScheme(value);
  if (!URL.canParse(candidate)) return false;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.hostname.length > 0;
}

function displayHostFromUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// -- Exports -------------------------------------------------------------------

export { ensureHttpScheme, isValidHttpUrl, displayHostFromUrl };
