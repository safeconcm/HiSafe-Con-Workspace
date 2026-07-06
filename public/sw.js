// public/sw.js
// HiSafe-CON WorkSpace — Service Worker
// Provides: offline fallback, cache-first for static assets, push notifications

const CACHE_NAME   = 'hisafe-con-v1'
const OFFLINE_URL  = '/offline.html'

const PRECACHE = [
  '/',
  '/dashboard',
  '/offline.html',
  '/manifest.json',
  '/logos/highcon.png',
  '/logos/safecon.png',
]

// ── Install ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch — Cache strategy ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip: non-GET, API calls, Supabase
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.hostname.includes('supabase.co')) return

  // Static assets → cache first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/logos/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(
      caches.match(request).then(cached => cached ?? fetch(request).then(res => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(request, clone))
        return res
      }))
    )
    return
  }

  // Pages → network first, fallback to cache, then offline page
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(request, clone))
        }
        return res
      })
      .catch(() =>
        caches.match(request).then(cached =>
          cached ?? caches.match(OFFLINE_URL)
        )
      )
  )
})

// ── Push Notifications ─────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'HiSafe-CON', {
      body:    data.body ?? '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/badge-72.png',
      tag:     data.tag ?? 'hisafe-notif',
      data:    { url: data.url ?? '/notifications' },
      actions: [
        { action: 'view', title: 'ดูรายละเอียด' },
        { action: 'dismiss', title: 'ปิด' },
      ],
    })
  )
})

// ── Notification click ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const url = event.notification.data?.url ?? '/notifications'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
