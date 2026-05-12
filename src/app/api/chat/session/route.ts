import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = createAdminClient()

    // Verifica el token del cliente de la tienda
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    // Verifica que el bot esté habilitado
    const { data: botSetting } = await supabase
      .from('chat_settings')
      .select('value')
      .eq('key', 'bot_enabled')
      .single()

    if (botSetting?.value === 'false') {
      return NextResponse.json({ error: 'bot_disabled' }, { status: 503 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Reusar sesión activa del día si existe
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_blocked', false)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({ session_id: existing.id })
    }

    // Límite: máximo 3 sesiones por día por usuario
    const { count } = await supabase
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())

    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: 'daily_limit' }, { status: 429 })
    }

    // Crea nueva sesión
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id })
      .select('id')
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Error al crear sesión' }, { status: 500 })
    }

    return NextResponse.json({ session_id: session.id })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
