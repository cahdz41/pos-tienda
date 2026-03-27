'use client'

import { useEffect } from 'react'

const OFFLINE_ROUTES = ['/pos', '/inventario']

function precacheRoutes() {
  const controller = navigator.serviceWorker.controller
  if (controller && navigator.onLine) {
    controller.postMessage({ type: 'PRECACHE', urls: OFFLINE_ROUTES })
  }
}

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Pre-cache when controller changes (first install or SW update)
    navigator.serviceWorker.addEventListener('controllerchange', precacheRoutes)

    navigator.serviceWorker.register('/sw.js')
      .then(async () => {
        await navigator.serviceWorker.ready
        // If SW was already active (returning visit), pre-cache immediately
        precacheRoutes()
      })
      .catch(console.error)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', precacheRoutes)
    }
  }, [])

  return null
}
