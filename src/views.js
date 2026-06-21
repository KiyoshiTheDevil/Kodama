import { api } from './api.js'
import { state, playTrack } from './player.js'

// ─── Helpers ───────────────────────────────────────────────────────────────

function thumb(item, size = 'medium') {
  const t = item?.thumbnails || item?.thumbnail
  if (!t) return ''
  const arr = Array.isArray(t) ? t : (t.thumbnails || [])
  if (!arr.length) return ''
  const found = arr.find(x => x.width >= 150) || arr[arr.length - 1]
  return found?.url || ''
}

function formatDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

function placeholderSvg(color = '#2a2a2a') {
  return `<div class="card-thumb-placeholder" style="background:${color}">
    <svg width="36" height="36" viewBox="0 0 16 16" fill="rgba(255,255,255,0.15)">
      <path d="M9 13c0 1.105-1.12 2-2.5 2S4 14.105 4 13s1.12-2 2.5-2 2.5.895 2.5 2z"/>
      <path fill-rule="evenodd" d="M9 3v10H8V3h1z"/>
      <path d="M8 2.82a1 1 0 0 1 .804-.98l3-.6A1 1 0 0 1 13 2.22V4L8 5V2.82z"/>
    </svg>
  </div>`
}

function cardHtml(title, subtitle, thumbUrl, videoId, gradient) {
  const img = thumbUrl
    ? `<img src="${thumbUrl}" alt="" loading="lazy">`
    : placeholderSvg(gradient)
  return `
    <div class="card" data-video-id="${videoId || ''}" data-title="${title}" data-sub="${subtitle}">
      <div class="card-thumb">
        ${img}
        <div class="card-play">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="white"><polygon points="3,1 12,6.5 3,12"/></svg>
        </div>
      </div>
      <div class="card-title">${title}</div>
      <div class="card-sub">${subtitle}</div>
    </div>`
}

function trackHtml(track, idx) {
  const url = thumb(track)
  const art = url
    ? `<img src="${url}" alt="" loading="lazy">`
    : `<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" fill="var(--bg-3)"/><polygon points="14,10 26,18 14,26" fill="rgba(255,255,255,0.2)"/></svg>`
  const dur = formatDuration(track.duration_seconds)
  const vid = track.videoId || ''
  const name = track.title || 'Unbekannt'
  const artist = (track.artists || []).map(a => a.name).join(', ') || track.artist || '–'
  return `
    <div class="track-item" data-video-id="${vid}" data-title="${name}" data-artist="${artist}" data-thumb="${url}">
      <div class="track-num">${idx + 1}</div>
      <div class="track-art">${art}</div>
      <div class="track-info">
        <div class="track-name">${name}</div>
        <div class="track-artist">${artist}</div>
      </div>
      <div class="track-duration">${dur}</div>
    </div>`
}

// ─── Views ─────────────────────────────────────────────────────────────────

export async function renderHome(container) {
  container.innerHTML = `
    <div class="genre-bar">
      ${['Alle','Podcasts','Workout','Relax','Energize','Party','Feel good','Sad','Focus','Sleep']
        .map((g, i) => `<div class="genre-pill${i === 0 ? ' active' : ''}">${g}</div>`).join('')}
    </div>
    <div class="content-scroll" id="home-scroll">
      <div class="spinner"></div>
    </div>`

  try {
    const sections = await api.home(8)
    const scroll = document.getElementById('home-scroll')
    if (!sections?.length) {
      scroll.innerHTML = `<p style="color:var(--text-muted);padding:20px">Keine Daten verfügbar.</p>`
      return
    }
    scroll.innerHTML = sections.map(section => {
      const items = section.contents || []
      if (!items.length) return ''
      const cards = items.map(item => {
        const title = item.title || item.name || 'Unbekannt'
        const sub = item.description || item.subtitle
          || (item.artists ? item.artists.map(a => a.name).join(', ') : '')
          || (item.subscribers ? item.subscribers + ' Abonnenten' : '')
          || ''
        const t = thumb(item)
        const vid = item.videoId || ''
        return cardHtml(title, sub, t, vid, '#1e1e2e')
      }).join('')
      return `
        <div class="section">
          <div class="section-header">
            <div>
              <div class="section-title">${section.title || ''}</div>
            </div>
          </div>
          <div class="cards-row">${cards}</div>
        </div>`
    }).join('')
    bindCardClicks(scroll)
  } catch (e) {
    document.getElementById('home-scroll').innerHTML =
      `<p style="color:var(--text-muted);padding:20px">Fehler beim Laden: ${e.message}</p>`
  }
}

export async function renderLiked(container) {
  container.innerHTML = `
    <div class="content-scroll">
      <div class="liked-header">
        <div class="liked-icon">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="rgba(255,255,255,0.9)">
            <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/>
          </svg>
        </div>
        <div>
          <div class="liked-info-title">Liked Songs</div>
          <div class="liked-info-sub" id="liked-count">Wird geladen...</div>
        </div>
      </div>
      <div class="track-list" id="liked-tracks">
        <div class="spinner"></div>
      </div>
    </div>`

  try {
    const data = await api.liked(100)
    const tracks = data?.tracks || []
    document.getElementById('liked-count').textContent = `${tracks.length} Songs`
    const list = document.getElementById('liked-tracks')
    list.innerHTML = tracks.map((t, i) => trackHtml(t, i)).join('')
    bindTrackClicks(list, tracks)
  } catch (e) {
    document.getElementById('liked-tracks').innerHTML =
      `<p style="color:var(--text-muted);padding:20px">Fehler: ${e.message}</p>`
  }
}

export async function renderLibrary(container) {
  container.innerHTML = `
    <div class="genre-bar">
      <div class="genre-pill active">Playlists</div>
    </div>
    <div class="content-scroll">
      <div class="section">
        <div class="section-title" style="margin-bottom:16px">Deine Playlists</div>
        <div class="cards-row" id="lib-cards">
          <div class="spinner"></div>
        </div>
      </div>
    </div>`

  try {
    const playlists = await api.playlists(30)
    const cards = document.getElementById('lib-cards')
    if (!playlists?.length) {
      cards.innerHTML = `<p style="color:var(--text-muted)">Keine Playlists gefunden.</p>`
      return
    }
    cards.innerHTML = playlists.map(pl => {
      const title = pl.title || 'Playlist'
      const count = pl.count ? `${pl.count} Songs` : ''
      const t = thumb(pl)
      return cardHtml(title, count, t, null, '#1e2a1e')
    }).join('')
    // Playlist card click → load playlist tracks
    cards.querySelectorAll('.card').forEach((card, i) => {
      card.addEventListener('click', () => {
        const pl = playlists[i]
        if (pl?.playlistId) loadPlaylist(container, pl.playlistId, pl.title)
      })
    })
  } catch (e) {
    document.getElementById('lib-cards').innerHTML =
      `<p style="color:var(--text-muted)">Fehler: ${e.message}</p>`
  }
}

async function loadPlaylist(container, id, title) {
  container.innerHTML = `
    <div class="content-scroll">
      <div class="section-header" style="margin-bottom:20px">
        <button id="back-btn" style="background:none;border:none;cursor:default;color:var(--text-secondary);margin-right:4px">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
            <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
          </svg>
        </button>
        <div class="section-title">${title}</div>
      </div>
      <div class="track-list" id="playlist-tracks"><div class="spinner"></div></div>
    </div>`

  document.getElementById('back-btn').addEventListener('click', () => renderLibrary(container))

  try {
    const data = await api.playlist(id)
    const tracks = data?.tracks || []
    const list = document.getElementById('playlist-tracks')
    list.innerHTML = tracks.map((t, i) => trackHtml(t, i)).join('')
    bindTrackClicks(list, tracks)
  } catch (e) {
    document.getElementById('playlist-tracks').innerHTML =
      `<p style="color:var(--text-muted)">Fehler: ${e.message}</p>`
  }
}

// ─── Event binding ──────────────────────────────────────────────────────────

function bindCardClicks(root) {
  root.querySelectorAll('.card[data-video-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.videoId
      if (!id) return
      const t = thumb({ thumbnails: [] })
      playTrack({
        videoId: id,
        title: card.dataset.title,
        artist: card.dataset.sub,
        thumbUrl: card.querySelector('img')?.src || '',
      })
    })
  })
}

function bindTrackClicks(root, tracks) {
  root.querySelectorAll('.track-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const track = tracks[i]
      if (!track?.videoId) return
      playTrack({
        videoId: track.videoId,
        title: track.title || 'Unbekannt',
        artist: (track.artists || []).map(a => a.name).join(', ') || '–',
        thumbUrl: el.querySelector('img')?.src || '',
      })
      root.querySelectorAll('.track-item').forEach(t => t.classList.remove('playing'))
      el.classList.add('playing')
    })
  })
}

// Sidebar playlists
export async function loadSidebarPlaylists() {
  const el = document.getElementById('sidebar-playlists')
  try {
    const pls = await api.playlists(20)
    if (!pls?.length) { el.innerHTML = ''; return }
    el.innerHTML = pls.slice(0, 12).map(pl => `
      <div class="nav-item" data-playlist-id="${pl.playlistId || ''}" style="font-size:12px">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" opacity="0.5">
          <path d="M9 13c0 1.105-1.12 2-2.5 2S4 14.105 4 13s1.12-2 2.5-2 2.5.895 2.5 2z"/>
          <path fill-rule="evenodd" d="M9 3v10H8V3h1z"/>
          <path d="M8 2.82a1 1 0 0 1 .804-.98l3-.6A1 1 0 0 1 13 2.22V4L8 5V2.82z"/>
        </svg>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pl.title || 'Playlist'}</span>
      </div>`).join('')
  } catch (_) { el.innerHTML = '' }
}
