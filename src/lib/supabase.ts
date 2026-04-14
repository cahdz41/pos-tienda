// REGLA: Siempre createClient directo de @supabase/supabase-js.
// NUNCA @supabase/ssr — causa timers que bloquean queries tras inactividad.
import { createClient as _create } from '@supabase/supabase-js'

let _client: ReturnType<typeof _create> | null = null

export function createClient() {
  if (_client) return _client
  _client = _create(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,      // sesión sobrevive F5 y standby
        autoRefreshToken: true,    // funciona correctamente con @supabase/supabase-js directo
        detectSessionInUrl: false, // sin magic links
      },
    }
  )
  return _client
}
