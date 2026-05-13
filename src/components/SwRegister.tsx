'use client'

import { useEffect } from 'react'

export default function SwRegister() {
  useEffect(() => {
    // Service worker solo en producción — en dev sirve código cacheado stale
    if (process.env.NODE_ENV !== 'production') return
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(err => console.warn('SW registration failed:', err))
    }
  }, [])

  return null
}
