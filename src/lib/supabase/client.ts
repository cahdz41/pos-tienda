import { createBrowserClient } from '@supabase/ssr'

// Singleton: una sola instancia en todo el browser.
// Múltiples instancias compiten por el Web Lock de auth-token
// causando "lock was stolen" y colgando todas las peticiones.
let _client: ReturnType<typeof createBrowserClient> | null = null

// Todas las peticiones de Supabase abortan a los 10 s si no responden.
// Sin esto, una red inestable puede dejar fetches colgados para siempre,
// bloqueando el Web Lock de auth y congelando la app entera.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  // Enlazar la señal del llamante si ya trae una
  const callerSignal = init?.signal
  if (callerSignal) {
    if (callerSignal.aborted) { controller.abort(callerSignal.reason); }
    else { callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason)) }
  }
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    10_000
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
