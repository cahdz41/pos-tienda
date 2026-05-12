const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID!
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`

export async function sendNewMessageNotification(
  sessionId: string,
  customerName: string,
  message: string
): Promise<number | null> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return null

  const text =
    `💬 *Nuevo mensaje en el chat*\n` +
    `👤 *Cliente:* ${customerName}\n` +
    `📝 *Mensaje:* ${message}\n\n` +
    `_Session: ${sessionId}_\n` +
    `_Responde a este mensaje para contestar al cliente_`

  try {
    const res = await fetch(`${BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    })
    const data = await res.json()
    return data.ok ? (data.result.message_id as number) : null
  } catch {
    return null
  }
}

export async function sendBotAlert(message: string) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return

  try {
    await fetch(`${BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: `⚠️ *Alerta del sistema*\n${message}`,
        parse_mode: 'Markdown',
      }),
    })
  } catch {
    // silencioso — alertas no deben interrumpir el flujo principal
  }
}
