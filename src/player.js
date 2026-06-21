import { api } from './api.js'

export const state = {
  playing: false,
  shuffle: false,
  repeat: false,
  volume: 0.7,
  currentTrack: null,
}

const audio = () => document.getElementById('audio-player')

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = String(Math.floor(sec % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function setPlayerUI(track) {
  document.getElementById('player-title').textContent = track.title || 'Unbekannt'
  document.getElementById('player-artist').textContent = track.artist || '–'
  const artEl = document.getElementById('player-art')
  if (track.thumbUrl) {
    artEl.innerHTML = `<img src="${track.thumbUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`
  }
  document.getElementById('time-cur').textContent = '0:00'
  document.getElementById('time-total').textContent = '0:00'
  document.getElementById('progress-fill').style.width = '0%'
}

function setPlayIcon(playing) {
  const icon = document.getElementById('play-icon')
  if (!icon) return
  icon.innerHTML = playing
    ? '<rect x="3.5" y="2.5" width="3" height="11" rx="1.5" stroke="currentColor" stroke-width="0" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1.5" stroke="currentColor" stroke-width="0" fill="currentColor"/>'
    : '<polygon points="4,2 14,8 4,14" fill="currentColor"/>'
}

export async function playTrack(track) {
  state.currentTrack = track
  setPlayerUI(track)
  setPlayIcon(false)

  // ytmusicapi gives us song metadata but NOT a direct audio URL
  // We use yt-dlp (if available) or the embed page approach
  // For now: open the YT Music embed URL in the hidden audio element
  // Real streaming needs yt-dlp or piped.video as a proxy
  try {
    const songData = await api.song(track.videoId)
    // Try to get stream URL from streamingData
    const formats = songData?.streamingData?.adaptiveFormats || []
    const audioFormat = formats
      .filter(f => f.mimeType?.startsWith('audio/'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]

    if (audioFormat?.url) {
      const a = audio()
      a.src = audioFormat.url
      a.volume = state.volume
      a.play().then(() => {
        state.playing = true
        setPlayIcon(true)
      }).catch(e => {
        console.warn('Autoplay blocked or URL expired:', e)
        fallbackToYTMusic(track.videoId)
      })
    } else {
      fallbackToYTMusic(track.videoId)
    }
  } catch (e) {
    console.error('Song fetch error:', e)
    fallbackToYTMusic(track.videoId)
  }
}

function fallbackToYTMusic(videoId) {
  // Open in YouTube Music as fallback
  const url = `https://music.youtube.com/watch?v=${videoId}`
  if (window.__TAURI__) {
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url))
  } else {
    window.open(url, '_blank')
  }
}

export function initPlayer() {
  const a = audio()
  if (!a) return

  a.volume = state.volume

  // Progress tracking
  a.addEventListener('timeupdate', () => {
    const cur = a.currentTime
    const dur = a.duration || 0
    document.getElementById('time-cur').textContent = fmt(cur)
    document.getElementById('time-total').textContent = fmt(dur)
    const pct = dur > 0 ? (cur / dur) * 100 : 0
    document.getElementById('progress-fill').style.width = pct + '%'
  })

  a.addEventListener('ended', () => {
    state.playing = false
    setPlayIcon(false)
    if (state.repeat) a.play()
  })

  a.addEventListener('play', () => { state.playing = true; setPlayIcon(true) })
  a.addEventListener('pause', () => { state.playing = false; setPlayIcon(false) })

  // Play/Pause button
  document.getElementById('ctrl-play')?.addEventListener('click', () => {
    if (!a.src) return
    state.playing ? a.pause() : a.play()
  })

  // Seek
  document.getElementById('progress-track')?.addEventListener('click', e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    if (a.duration) a.currentTime = pct * a.duration
  })

  // Volume
  document.getElementById('vol-track')?.addEventListener('click', e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.volume = pct
    state.volume = pct
    document.getElementById('vol-fill').style.width = (pct * 100) + '%'
  })

  // Shuffle toggle
  document.getElementById('ctrl-shuffle')?.addEventListener('click', e => {
    state.shuffle = !state.shuffle
    e.currentTarget.classList.toggle('active', state.shuffle)
  })

  // Repeat toggle
  document.getElementById('ctrl-repeat')?.addEventListener('click', e => {
    state.repeat = !state.repeat
    a.loop = state.repeat
    e.currentTarget.classList.toggle('active', state.repeat)
  })
}
