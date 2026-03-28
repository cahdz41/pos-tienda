const CACHE = 'pos-app-v1'
// Key where we store the app shell (root HTML with fresh chunk URLs)
const SHELL_KEY = '/__app-shell'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Pre-cache routes on command from the app
self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'PRECACHE') return
  const cache = await caches.open(CACHE)
  // Always refresh the app shell with the current build's HTML
  try {
    const res = await fetch('/', { cache: 'reload' })
    if (res.ok) await cache.put(SHELL_KEY, res.clone())
  } catch { /* offline at pre-cache time */ }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Cache-first for immutable static assets (content-hashed filenames)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Full-page navigations: network-first, fall back to app shell when offline.
  // The app shell is always the root HTML with the LATEST chunk URLs (refreshed
  // on every pre-cache call), so it works in dev and prod.
  // RSC fetches (?_rsc= / headers RSC:1) are intentionally NOT intercepted —
  // Next.js handles failed RSC gracefully (stays on current page).
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    // Timeout de 5s: si el servidor tarda, cae al cache inmediatamente
    // sin bloquear otras peticiones de red (Supabase, etc.)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(request, { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      cache.put(request, res.clone())
      cache.put(SHELL_KEY, res.clone())
    }
    return res
  } catch {
    // Timeout o fallo de red: servir desde cache
    const exact = await cache.match(request)
    if (exact) return exact
    const shell = await cache.match(SHELL_KEY)
    return shell ?? Response.error()
  }
}
