import { createBrowserClient } from '@supabase/ssr'

// Singleton: una sola instancia evita la competencia por el Web Lock de auth-token
// ("lock was stolen") que bloqueaba todas las peticiones.
let _client: ReturnType<typeof createBrowserClient> | null = null

// Cancela la conexión TCP real (no solo la promise) después de 15 s.
// Esto cubre el refresh de JWT y cualquier query que se cuelgue por red muerta.
const REQUEST_TIMEOUT_MS = 15_000
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(id))
}

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      auth: {
        // Desactiva el Web Lock — en un POS de sesión única no hay riesgo
        // de refresh concurrente y el lock era la causa de todos los bloqueos
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock: async (_name: string, _timeout: number, fn: () => Promise<any>) => fn(),
      },
    }
  )
  return _client
}
