import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getChatResponse, type ChatMessage } from '@/lib/gemini'
import { sendNewMessageNotification, sendBotAlert } from '@/lib/telegram'

const MAX_MESSAGES_PER_SESSION = 10
const SPAM_WINDOW_SECONDS = 60
const SPAM_MAX_IN_WINDOW = 5
const DAILY_API_LIMIT = 500

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { session_id, content } = await req.json()
    if (!session_id || !content?.trim()) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const userMessage = content.trim().slice(0, 1000)

    // ── Verificaciones del bot ────────────────────────────────────────────────

    const [{ data: botEnabled }, { data: botMode }, { data: apiCalls }] =
      await Promise.all([
        supabase.from('chat_settings').select('value').eq('key', 'bot_enabled').single(),
        supabase.from('chat_settings').select('value').eq('key', 'bot_mode').single(),
        supabase.from('chat_settings').select('value').eq('key', 'daily_api_calls').single(),
      ])

    if (botEnabled?.value === 'false') {
      return NextResponse.json({ error: 'bot_disabled' }, { status: 503 })
    }

    // ── Verifica la sesión ────────────────────────────────────────────────────

    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id, user_id, message_count, is_blocked, block_reason')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    if (session.is_blocked) {
      return NextResponse.json({
        error: 'session_blocked',
        reason: session.block_reason,
      }, { status: 429 })
    }

    if (session.message_count >= MAX_MESSAGES_PER_SESSION) {
      await supabase
        .from('chat_sessions')
        .update({ is_blocked: true, block_reason: 'limit_reached' })
        .eq('id', session_id)

      return NextResponse.json({ error: 'limit_reached' }, { status: 429 })
    }

    // ── Detección de spam ─────────────────────────────────────────────────────

    const windowStart = new Date(Date.now() - SPAM_WINDOW_SECONDS * 1000).toISOString()
    const { count: recentCount } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session_id)
      .eq('role', 'user')
      .gte('created_at', windowStart)

    if ((recentCount ?? 0) >= SPAM_MAX_IN_WINDOW) {
      await supabase
        .from('chat_sessions')
        .update({ is_blocked: true, block_reason: 'spam_detected' })
        .eq('id', session_id)

      await sendBotAlert(`🚨 Spam detectado — sesión ${session_id} bloqueada`)

      return NextResponse.json({ error: 'spam_detected' }, { status: 429 })
    }

    // ── Guard global de API calls ─────────────────────────────────────────────

    const { data: apiDate } = await supabase
      .from('chat_settings')
      .select('value')
      .eq('key', 'daily_api_calls_date')
      .single()

    const todayStr = new Date().toISOString().slice(0, 10)
    let currentCalls = parseInt(apiCalls?.value ?? '0', 10)

    // Resetea contador si es un nuevo día
    if (apiDate?.value !== todayStr) {
      currentCalls = 0
      await supabase
        .from('chat_settings')
        .update({ value: todayStr })
        .eq('key', 'daily_api_calls_date')
      await supabase
        .from('chat_settings')
        .update({ value: '0' })
        .eq('key', 'daily_api_calls')
    }

    if (currentCalls >= DAILY_API_LIMIT && botMode?.value === 'auto') {
      await sendBotAlert(`⚠️ Límite diario de API alcanzado (${DAILY_API_LIMIT} llamadas). Bot pausado.`)
      return NextResponse.json({ error: 'api_limit' }, { status: 503 })
    }

    // ── Guarda el mensaje del usuario ─────────────────────────────────────────

    await supabase.from('chat_messages').insert({
      session_id,
      role: 'user',
      content: userMessage,
    })

    await supabase
      .from('chat_sessions')
      .update({
        message_count: session.message_count + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', session_id)

    // ── Modo manual: notifica al admin y responde con aviso ───────────────────

    if (botMode?.value === 'manual') {
      const { data: customer } = await supabase
        .from('store_customers')
        .select('full_name')
        .eq('id', user.id)
        .single()

      const telegramMsgId = await sendNewMessageNotification(
        session_id,
        customer?.full_name ?? 'Cliente',
        userMessage
      )

      if (telegramMsgId) {
        await supabase
          .from('chat_sessions')
          .update({ telegram_notification_id: telegramMsgId })
          .eq('id', session_id)
      }

      return NextResponse.json({
        reply: null,
        manual_mode: true,
      })
    }

    // ── Modo automático: llama a Gemini ───────────────────────────────────────

    const { data: rawMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true })
      .limit(20)

    const history: ChatMessage[] = (rawMessages ?? []).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }))

    const aiReply = await getChatResponse(history)

    // Guarda la respuesta del bot
    const { data: savedReply } = await supabase
      .from('chat_messages')
      .insert({ session_id, role: 'assistant', content: aiReply })
      .select('id, role, content, created_at')
      .single()

    // Incrementa contador global de API calls
    await supabase
      .from('chat_settings')
      .update({ value: String(currentCalls + 1) })
      .eq('key', 'daily_api_calls')

    return NextResponse.json({ reply: savedReply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[chat/message] ERROR:', msg)
    return NextResponse.json({ error: 'Error interno', detail: msg }, { status: 500 })
  }
}
