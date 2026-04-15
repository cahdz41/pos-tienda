import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(request: Request) {
  const body = await request.json()
  const { email, password, full_name, phone } = body as {
    email: string
    password: string
    full_name: string
    phone?: string
  }

  if (!email?.trim() || !password?.trim() || !full_name?.trim()) {
    return NextResponse.json({ error: 'Nombre, email y contraseña son requeridos' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const supabase = adminClient()

  // Crear usuario en auth.users
  const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true, // sin verificación de email
  })

  if (authError) {
    const msg = authError.message.includes('already registered')
      ? 'Ya existe una cuenta con ese email'
      : authError.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  if (!user) return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })

  // Crear perfil en store_customers
  const { error: profileError } = await supabase
    .from('store_customers')
    .insert({
      id: user.id,
      full_name: full_name.trim(),
      phone: phone?.trim() || null,
      email: email.trim().toLowerCase(),
    })

  if (profileError) {
    // Rollback: eliminar usuario auth para no dejar huérfanos
    await supabase.auth.admin.deleteUser(user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ user_id: user.id })
}
