import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurado en .env.local')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// GET — listar cajeros
export async function GET() {
  try {
    const supabase = adminClient()

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('role', 'cashier')
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Obtener emails de auth.users
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashiers = (profiles ?? []).map((p: any) => {
      const authUser = users.find(u => u.id === p.id)
      return { ...p, email: authUser?.email ?? '' }
    })

    return NextResponse.json(cashiers)
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}

// POST — crear cajero
export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json()

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'Nombre, correo y contraseña son requeridos' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
    }

    const supabase = adminClient()

    // Crear usuario en Auth
    const { data, error: authErr } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

    // Crear perfil
    const { error: profileErr } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, name: name.trim(), role: 'cashier' })

    if (profileErr) {
      // Rollback: eliminar el usuario de Auth
      await supabase.auth.admin.deleteUser(data.user.id)
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    return NextResponse.json({ id: data.user.id, name: name.trim(), email: email.trim(), role: 'cashier' })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}

// DELETE — eliminar cajero
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const supabase = adminClient()

    // Eliminar perfil primero, luego el usuario de Auth
    await supabase.from('profiles').delete().eq('id', id)
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
