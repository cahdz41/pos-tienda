import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase exclusivo para la tienda online.
 * Usa storageKey: 'store_sb' para que la sesión del cliente de la tienda
 * NO colisione con la sesión del POS (que usa la clave por defecto 'sb-*').
 *
 * IMPORTANTE: Nunca usar @supabase/ssr aquí — causa deadlock en inactividad.
 */
let _client: ReturnType<typeof createClient> | null = null

export function getStoreSupabase() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storageKey: 'store_sb',
          autoRefreshToken: true,
          persistSession: true,
        },
      }
    )
  }
  return _client
}
