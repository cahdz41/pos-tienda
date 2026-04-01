'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// autoRefreshToken está desactivado para evitar que timers acumulados en
// background-tab disparen refreshes concurrentes y deadloquen el cliente.
// Este componente asume esa responsabilidad de forma controlada:
//   • Al restaurar el tab: health check inmediato (8s max) → reload si falla
//   • Cada 50 min activo: refresh proactivo antes de que expire el JWT de 1h
const PROACTIVE_REFRESH_MS = 50 * 60 * 1000

export default function SessionRefresher() {
  useEffect(() => {
    const supabase = createClient()
    let hiddenAt = 0

    // Refresh proactivo cada 50 min cuando el tab está visible
    const interval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      await supabase.auth.refreshSession().catch(() => null)
    }, PROACTIVE_REFRESH_MS)

    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (!hiddenAt) return
      hiddenAt = 0

      // Health check: verificar que el cliente Supabase responde
      // Si está colgado (ej. _refreshingDeferred atascado), getSession() cuelga.
      // El timeout de 8s detecta esto y fuerza reload limpio.
      const healthy = await Promise.race([
        supabase.auth.getSession().then(({ data }) => {
          const session = data.session
          // Si el token venció, intentar refresh antes de devolver sano
          if (session && session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
            return supabase.auth.refreshSession()
              .then(({ error }) => !error)
              .catch(() => false)
          }
          return !!session
        }),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 8_000)),
      ]).catch(() => false)

      if (!healthy) {
        window.location.reload()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
