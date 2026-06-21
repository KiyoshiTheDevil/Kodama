function stripQueryParams(names: readonly string[]): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const name of names) url.searchParams.delete(name);
  const search = url.searchParams.toString();
  const next = url.pathname + (search ? `?${search}` : "") + url.hash;
  window.history.replaceState(null, "", next);
}

// -- Exports -------------------------------------------------------------------

export { stripQueryParams };
