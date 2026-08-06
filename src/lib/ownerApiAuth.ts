import 'server-only'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

type OwnerAuthResult =
  | { ok: true; userId: string; name: string }
  | { ok: false; response: NextResponse }

export async function requireOwner(request: NextRequest): Promise<OwnerAuthResult> {
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''

  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  // El proyecto no tiene tipos generados de Supabase; el cliente admin es dinámico.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Sesión inválida' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'owner') {
    return { ok: false, response: NextResponse.json({ error: 'Solo el propietario puede realizar esta acción' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, name: String(profile.name ?? '') }
}
