import { createClient as _createClient } from '@supabase/supabase-js'

// ROOT-CAUSE FIX:
// createBrowserClient de @supabase/ssr sobreescribe autoRefreshToken: true
// sin importar lo que pases. Esto activaba el timer de 30s y causaba que al
// regresar de inactividad, múltiples ticks acumulados formaran una cola en
// el lock interno de Supabase, bloqueando TODAS las queries de DB por 30-60s.
//
// Usando createClient directamente, autoRefreshToken: false funciona de verdad:
// no hay timer, no hay pile-up, SessionRefresher maneja el refresh manualmente.
//
// Nota: sesión almacenada en localStorage (no cookies). Requiere re-login una sola vez.

// Timeout de red: si un request a Supabase tarda más de 15s, abortarlo.
// Cubre casos de red lenta o servidor lento que podrían colgar la app.
if (typeof window !== 'undefined') {
  const _orig = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    if (supabaseUrl && url.startsWith(supabaseUrl)) {
      if (init?.signal) return _orig(input, init)
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 15_000)
      return _orig(input, { ...init, signal: ctrl.signal }).finally(() =>
        clearTimeout(tid)
      )
    }
    return _orig(input, init)
  }
}

let _client: ReturnType<typeof _createClient> | null = null

export function createClient() {
  if (_client) return _client
  _client = _createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Con createClient directo, este flag SÍ se respeta.
        // Sin timer de 30s, no hay acumulación de ticks en background.
        autoRefreshToken: false,
        persistSession: true,
        // Bypass Web Lock — evita deadlocks en browsers sin soporte
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock: async (_name: string, _timeout: number, fn: () => Promise<any>) => fn(),
      },
    }
  )
  return _client
}
