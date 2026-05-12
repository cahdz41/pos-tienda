import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

// Solo accesible para usuarios del POS (owner/cashier)
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    // Verifica que sea staff del POS (tiene perfil en la tabla profiles)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
    }

    // Trae sesiones activas con último mensaje
    const { data: sessions } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        created_at,
        last_activity_at,
        message_count,
        is_blocked,
        user_id,
        chat_messages (
          id, role, content, created_at, is_read
        )
      `)
      .order('last_activity_at', { ascending: false })
      .limit(50)

    if (!sessions) return NextResponse.json({ conversations: [] })

    // Para cada sesión, trae el nombre del cliente
    const userIds = sessions.map((s) => s.user_id)
    const { data: customers } = await supabase
      .from('store_customers')
      .select('id, full_name, phone')
      .in('id', userIds)

    const customerMap = Object.fromEntries(
      (customers ?? []).map((c) => [c.id, c])
    )

    const conversations = sessions.map((s) => {
      const msgs = (s.chat_messages as { id: string; role: string; content: string; created_at: string; is_read: boolean }[]) ?? []
      const lastMsg = msgs.at(-1)
      const unread = msgs.filter((m) => m.role === 'user' && !m.is_read).length

      return {
        session_id: s.id,
        created_at: s.created_at,
        last_activity_at: s.last_activity_at,
        message_count: s.message_count,
        is_blocked: s.is_blocked,
        customer: customerMap[s.user_id] ?? null,
        last_message: lastMsg ?? null,
        unread_count: unread,
      }
    })

    return NextResponse.json({ conversations })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
