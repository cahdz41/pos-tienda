'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// autoRefreshToken está desactivado (ver client.ts para el por qué).
// Este componente asume esa responsabilidad de forma controlada:
//   • Al restaurar el tab: health check con 8s de timeout → reload si falla
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

      // getSession() con autoRefreshToken: false real: retorna la sesión del
      // storage sin intentar refresh automático. Si el token venció, devuelve
      // sesión expirada (o null si fue removida). Lo chequeamos manualmente.
      let healthy = false
      const checkDone = Promise.race<boolean>([
        (async () => {
          const { data, error } = await supabase.auth.getSession()
          if (error || !data.session) return false

          const now = Math.floor(Date.now() / 1000)
          const expiresAt = data.session.expires_at ?? 0
          if (expiresAt < now) {
            // Token vencido → refrescar
            const { error: refreshError } = await supabase.auth.refreshSession()
            return !refreshError
          }
          return true
        })(),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 8_000)),
      ])
      healthy = await checkDone.catch(() => false)

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
