import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    // Verifica que sea staff del POS
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
    }

    const { session_id, content } = await req.json()

    if (!session_id || !content?.trim()) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    // Verifica que la sesión existe
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', session_id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    // Guarda el mensaje del admin
    const { data: message, error: msgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id,
        role: 'admin',
        content: content.trim(),
      })
      .select('id, role, content, created_at')
      .single()

    if (msgError || !message) {
      return NextResponse.json({ error: 'Error al guardar respuesta' }, { status: 500 })
    }

    // Actualiza last_activity_at de la sesión
    await supabase
      .from('chat_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', session_id)

    return NextResponse.json({ message })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
