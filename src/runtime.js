import { api } from './api.js'
import { initPlayer } from './player.js'
import { renderHome, renderLiked, renderLibrary, loadSidebarPlaylists } from './views.js'

const SERVER_URL = 'http://localhost:9847'

// ─── Connection check ───────────────────────────────────────────────────────

async function checkServer() {
  try {
    await api.ping()
    return true
  } catch (_) {
    return false
  }
}

function showDisconnected() {
  document.getElementById('status-dot').className = 'status-dot err'
  document.getElementById('status-text').textContent = 'Server nicht erreichbar'

  document.getElementById('view-container').innerHTML = `
    <div class="connect-screen">
      <svg width="48" height="48" viewBox="0 0 16 16" fill="var(--accent)" opacity="0.6">
        <circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.1"/>
        <polygon points="6,4 12,8 6,12" fill="currentColor"/>
      </svg>
      <div class="connect-title">Server starten</div>
      <div class="connect-sub">
        Starte zuerst den lokalen Python-Bridge-Server, damit die App auf YouTube Music zugreifen kann.
        Beim allerersten Start: <strong style="color:var(--accent)">--setup-oauth</strong> ausführen.
      </div>
      <div class="connect-code">
# Einmalig – OAuth einrichten:<br>
python server.py --setup-oauth<br><br>
# Danach immer:<br>
python server.py
      </div>
      <button class="retry-btn" id="retry-btn">Erneut verbinden</button>
    </div>`

  document.getElementById('retry-btn')?.addEventListener('click', () => init())
}

function showConnected() {
  document.getElementById('status-dot').className = 'status-dot ok'
  document.getElementById('status-text').textContent = 'Verbunden'
}

// ─── Routing ────────────────────────────────────────────────────────────────

let currentView = 'home'

function navigate(view) {
  currentView = view
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view)
  })
  const container = document.getElementById('view-container')
  if (view === 'home')    renderHome(container)
  if (view === 'library') renderLibrary(container)
  if (view === 'liked')   renderLiked(container)
}

// ─── Init ───────────────────────────────────────────────────────────────────

async function init() {
  // Titlebar window controls (Tauri)
  if (window.__TAURI__) {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const appWindow = getCurrentWebviewWindow()
    document.getElementById('btn-close')?.addEventListener('click', () => appWindow.close())
    document.getElementById('btn-min')?.addEventListener('click', () => appWindow.minimize())
    document.getElementById('btn-max')?.addEventListener('click', () => appWindow.toggleMaximize())
  }

  // Nav clicks
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.view))
  })

  initPlayer()

  document.getElementById('loading-screen')?.remove()

  const ok = await checkServer()
  if (!ok) {
    showDisconnected()
    return
  }
  showConnected()
  loadSidebarPlaylists()
  navigate('home')
}

init()
