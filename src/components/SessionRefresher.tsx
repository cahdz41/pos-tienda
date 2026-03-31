'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Cuando el usuario vuelve al tab después de estar inactivo, el JWT puede
// estar expirado o el cliente de Supabase en estado inválido. Forzamos un
// refresh de sesión para que todas las requests siguientes funcionen.
export default function SessionRefresher() {
  useEffect(() => {
    const supabase = createClient()

    async function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      console.debug('[session] tab visible — verificando sesión...')
      const { error } = await supabase.auth.refreshSession()
      if (error) {
        console.warn('[session] refresh falló, recargando página...', error.message)
        window.location.reload()
      } else {
        console.debug('[session] sesión refrescada OK')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  return null
}
