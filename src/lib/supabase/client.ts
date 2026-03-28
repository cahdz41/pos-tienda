import { createBrowserClient } from '@supabase/ssr'

// Singleton: una sola instancia evita la competencia por el Web Lock de auth-token
// ("lock was stolen") que bloqueaba todas las peticiones.
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}

// Destruye el singleton. Llamar después de un fallo grave para que el próximo
// createClient() arranque con un cliente limpio, equivalente a un F5.
export function resetSupabaseClient() {
  _client = null
}
