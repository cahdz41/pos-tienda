import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

interface TelegramMessage {
  message_id: number
  text?: string
  reply_to_message?: { message_id: number }
}

interface TelegramUpdate {
  message?: TelegramMessage
}

export async function POST(req: NextRequest) {
  try {
    const body: TelegramUpdate = await req.json()
    const message = body.message
    if (!message?.text || !message.reply_to_message) {
      // Solo procesamos respuestas a notificaciones (reply_to_message requerido)
      return NextResponse.json({ ok: true })
    }

    const replyToId = message.reply_to_message.message_id
    const adminText = message.text.trim()

    const supabase = createAdminClient()

    // Encuentra la sesión que corresponde a ese mensaje de Telegram
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('telegram_notification_id', replyToId)
      .single()

    if (!session) {
      // El admin respondió a un mensaje que no era una notificación de chat
      return NextResponse.json({ ok: true })
    }

    // Guarda la respuesta del admin
    await supabase.from('chat_messages').insert({
      session_id: session.id,
      role: 'admin',
      content: adminText,
    })

    // Actualiza last_activity_at
    await supabase
      .from('chat_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', session.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // Telegram espera siempre 200
  }
}
