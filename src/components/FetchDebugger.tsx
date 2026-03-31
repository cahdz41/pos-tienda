'use client'

import { useEffect } from 'react'

// Intercepta TODOS los fetch del browser — incluyendo los internos de supabase auth.
// Loggea cada request con URL, duración y status. Si tarda más de 20s sin signal
// propio, lo aborta para evitar hang infinito.
const TIMEOUT_MS = 20_000

export default function FetchDebugger() {
  useEffect(() => {
    const original = window.fetch

    window.fetch = async function debuggedFetch(input, init) {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url
      const short = url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80)
      const start = Date.now()

      // Solo agregamos timeout si la request no tiene ya un signal propio
      let controller: AbortController | null = null
      let timer: ReturnType<typeof setTimeout> | null = null
      let finalInit = init

      if (!init?.signal) {
        controller = new AbortController()
        timer = setTimeout(() => {
          console.error(`[fetch] ⏱ TIMEOUT ${TIMEOUT_MS / 1000}s → ${short}`)
          controller!.abort()
        }, TIMEOUT_MS)
        finalInit = { ...init, signal: controller.signal }
      }

      console.debug(`[fetch] → ${short}`)

      try {
        const res = await original(input, finalInit)
        const ms = Date.now() - start
        if (res.ok) {
          console.debug(`[fetch] ✓ ${res.status} ${short} (${ms}ms)`)
        } else {
          console.error(`[fetch] ❌ ${res.status} ${short} (${ms}ms)`)
        }
        return res
      } catch (err) {
        const ms = Date.now() - start
        console.error(`[fetch] 💥 FAILED ${short} (${ms}ms)`, err)
        throw err
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    return () => {
      window.fetch = original
    }
  }, [])

  return null
}
