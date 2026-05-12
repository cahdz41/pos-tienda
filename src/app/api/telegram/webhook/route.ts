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
      return NextResponse.json({ ok: true })
    }

    const replyToId = message.reply_to_message.message_id
    const adminText = message.text.trim()

    const supabase = createAdminClient()

    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('telegram_notification_id', replyToId)
      .single()

    if (!session) {
      return NextResponse.json({ ok: true })
    }

    await supabase.from('chat_messages').insert({
      session_id: session.id,
      role: 'admin',
      content: adminText,
    })

    await supabase
      .from('chat_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', session.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
