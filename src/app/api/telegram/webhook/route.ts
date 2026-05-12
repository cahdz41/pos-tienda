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
    console.log('[telegram/webhook] update recibido:', JSON.stringify(body))

    const message = body.message
    if (!message?.text || !message.reply_to_message) {
      console.log('[telegram/webhook] ignorado — no es reply o no tiene texto')
      return NextResponse.json({ ok: true })
    }

    const replyToId = message.reply_to_message.message_id
    const adminText = message.text.trim()
    console.log('[telegram/webhook] reply_to_message_id:', replyToId, '| texto:', adminText)

    const supabase = createAdminClient()

    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('telegram_notification_id', replyToId)
      .single()

    console.log('[telegram/webhook] sesión encontrada:', session?.id ?? 'NINGUNA', '| error:', sessionError?.message ?? 'none')

    if (!session) {
      return NextResponse.json({ ok: true })
    }

    const { error: insertError } = await supabase.from('chat_messages').insert({
      session_id: session.id,
      role: 'admin',
      content: adminText,
    })
    console.log('[telegram/webhook] mensaje guardado, error:', insertError?.message ?? 'none')

    await supabase
      .from('chat_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', session.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telegram/webhook] ERROR:', err)
    return NextResponse.json({ ok: true })
  }
}
