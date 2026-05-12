import { createClient } from '@supabase/supabase-js'

let _admin: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  if (_admin) return _admin
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  return _admin
}
