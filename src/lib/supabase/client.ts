import { createBrowserClient } from '@supabase/ssr'

// Singleton: una sola instancia en todo el browser.
// Múltiples instancias compiten por el Web Lock de auth-token
// causando "lock was stolen" y colgando todas las peticiones.
let _client: ReturnType<typeof createBrowserClient> | null = null

// Todas las peticiones de Supabase llevan timeout para que una red inestable
// no deje fetches colgados para siempre bloqueando el Web Lock de auth.
//
// Auth (/auth/v1/): 10 s — el Web Lock se retiene mientras dura la petición
//   de refresh; si se cuelga, bloquea TODAS las demás peticiones. 10 s es
//   más que suficiente para un refresh token en condiciones normales.
//
// Datos (/rest/v1/): 30 s — syncCatalog puede paginar miles de filas y
//   necesita más margen en conexiones lentas.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input as Request).url
  const timeoutMs = url.includes('/auth/v1/') ? 10_000 : 30_000

  const controller = new AbortController()
  const callerSignal = init?.signal
  if (callerSignal) {
    if (callerSignal.aborted) { controller.abort(callerSignal.reason) }
    else { callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason)) }
  }
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs
  )
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithTimeout } }
  )
  return _client
}
