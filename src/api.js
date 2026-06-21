const BASE = 'http://localhost:9847'

async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  ping:      ()            => get('/ping'),
  home:      (limit = 6)   => get(`/home?limit=${limit}`),
  liked:     (limit = 100) => get(`/liked?limit=${limit}`),
  playlists: (limit = 25)  => get(`/library/playlists?limit=${limit}`),
  playlist:  (id, limit)   => get(`/playlist?id=${encodeURIComponent(id)}&limit=${limit || 100}`),
  search:    (q, filter)   => get(`/search?q=${encodeURIComponent(q)}${filter ? '&filter='+filter : ''}`),
  song:      (id)          => get(`/stream?id=${encodeURIComponent(id)}`),
}
