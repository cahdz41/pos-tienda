'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStoreAuth } from '@/contexts/StoreAuthContext'
import { getStoreSupabase } from '@/lib/supabase-store'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'admin'
  content: string
  created_at: string
}

type BotStatus = 'idle' | 'loading' | 'disabled' | 'limit' | 'manual_wait'

const POLL_INTERVAL = 3000

const QUICK_ACTIONS = [
  { emoji: '🔍', label: 'Revisar existencia y Precio' },
  { emoji: '💪', label: 'Busco una Proteína' },
  { emoji: '⚡', label: 'Busco una Creatina' },
  { emoji: '🔥', label: 'Busco un Pre-entreno' },
  { emoji: '🌟', label: 'Recomiéndame un Suplemento' },
]

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 14px' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'rgba(255,255,255,0.4)',
            animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

function BotAvatar() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #cc2020, #ff6020)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff',
    }}>
      ⚡
    </div>
  )
}

export default function ChatWidget() {
  const { user } = useStoreAuth()
  const [open, setOpen]           = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [status, setStatus]       = useState<BotStatus>('idle')
  const [botMode, setBotMode]     = useState<'auto' | 'manual'>('auto')
  const [shown, setShown]                   = useState(false)
  const [quickActionsUsed, setQuickActionsUsed] = useState(false)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastMsgRef                = useRef<string>('')
  const shownIdsRef               = useRef<Set<string>>(new Set())

  // Aparece el botón flotante con animación suave tras 2s
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 2000)
    return () => clearTimeout(t)
  }, [])

  // Scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const getToken = useCallback(async () => {
    const { data: { session } } = await getStoreSupabase().auth.getSession()
    return session?.access_token ?? null
  }, [])

  // Polling para modo manual
  const startPolling = useCallback((sid: string) => {
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      const token = await getToken()
      if (!token) return

      const after = lastMsgRef.current
      const res = await fetch(
        `/api/chat/messages?session_id=${sid}${after ? `&after=${after}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return

      const { messages: newMsgs } = await res.json()
      if (newMsgs?.length) {
        const unseen = newMsgs.filter((m: Message) => !shownIdsRef.current.has(m.id))
        if (unseen.length) {
          unseen.forEach((m: Message) => shownIdsRef.current.add(m.id))
          lastMsgRef.current = unseen.at(-1).created_at
          setMessages((prev) => [...prev, ...unseen])
          setStatus('idle')
        }
      }
    }, POLL_INTERVAL)
  }, [getToken])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  async function openChat() {
    setOpen(true)
    if (sessionId) return
    if (!user) return

    setQuickActionsUsed(false)
    setStatus('loading')

    try {
      const token = await getToken()
      if (!token) { setStatus('idle'); return }

      // Consulta el modo del bot
      const configRes = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!configRes.ok) {
        const { error } = await configRes.json()
        if (error === 'bot_disabled') { setStatus('disabled'); return }
        if (error === 'daily_limit') { setStatus('limit'); return }
        setStatus('idle'); return
      }

      const { session_id } = await configRes.json()
      setSessionId(session_id)

      // Carga el modo actual
      const modeRes = await fetch('/api/chat/messages?session_id=' + session_id, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (modeRes.ok) {
        const { messages: existingMsgs } = await modeRes.json()
        if (existingMsgs?.length) {
          setMessages(existingMsgs)
          lastMsgRef.current = existingMsgs.at(-1).created_at
        }
      }

      // Mensaje de bienvenida
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: '¡Hola! 👋 Soy el asistente de Chocholand. Puedo ayudarte a encontrar productos, revisar precios y recomendarte suplementos para tu objetivo fitness. ¿En qué te ayudo?',
        created_at: new Date().toISOString(),
      }])

      setStatus('idle')
      startPolling(session_id)
    } catch {
      setStatus('idle')
    }
  }

  function closeChat() {
    setOpen(false)
    stopPolling()
  }

  async function send(text: string) {
    if (!text || !sessionId || status === 'loading') return

    const token = await getToken()
    if (!token) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    lastMsgRef.current = userMsg.created_at
    setStatus('loading')

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, content: text }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'limit_reached' || data.error === 'session_blocked') {
          setStatus('limit'); return
        }
        if (data.error === 'spam_detected') {
          setStatus('limit'); return
        }
        if (data.error === 'bot_disabled' || data.error === 'api_limit') {
          setStatus('disabled'); return
        }
        setStatus('idle'); return
      }

      if (data.manual_mode) {
        setStatus('manual_wait')
        setBotMode('manual')
        // El polling ya está activo y traerá la respuesta del admin
        return
      }

      if (data.reply) {
        shownIdsRef.current.add(data.reply.id)
        setMessages((prev) => [...prev, data.reply])
        lastMsgRef.current = data.reply.created_at
      }

      setStatus('idle')
    } catch {
      setStatus('idle')
    }
  }

  async function sendMessage() {
    const text = input.trim()
    setInput('')
    await send(text)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const inputDisabled = status === 'loading' || status === 'disabled' || status === 'limit'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes chatDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatBounceIn {
          0%   { opacity: 0; transform: scale(0.7) translateY(10px); }
          70%  { transform: scale(1.05) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* ── Botón flotante ─────────────────────────────────────────────────── */}
      {shown && !open && (
        <button
          onClick={openChat}
          aria-label="Abrir asistente"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 999, border: 'none',
            background: 'rgba(204, 32, 32, 0.12)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 0 1px rgba(255,96,32,0.35), 0 0 22px rgba(204,32,32,0.25)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 14, fontWeight: 600,
            animation: 'chatBounceIn 0.5s ease both',
            transition: 'box-shadow 0.2s, transform 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,96,32,0.6), 0 0 36px rgba(204,32,32,0.45)'
            e.currentTarget.style.transform = 'scale(1.04)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,96,32,0.35), 0 0 22px rgba(204,32,32,0.25)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <span style={{ fontSize: 16 }}>⚡</span>
          Asistente
        </button>
      )}

      {/* ── Panel de chat ──────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9001,
            width: 370, height: 520,
            display: 'flex', flexDirection: 'column',
            background: 'rgba(10, 10, 10, 0.96)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            boxShadow: '0 25px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,96,32,0.08)',
            animation: 'chatSlideUp 0.25s ease both',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px',
            background: 'linear-gradient(to right, rgba(30,5,5,0.9), rgba(10,10,10,0.9))',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BotAvatar />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-syne, sans-serif)' }}>
                  Asistente Chocholand
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: botMode === 'manual' ? '#f97316' : '#22c55e',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                    {botMode === 'manual' ? 'Atención personalizada' : 'IA activa'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={closeChat}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', fontSize: 18, lineHeight: 1,
                padding: 4, borderRadius: 6,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
            >
              ✕
            </button>
          </div>

          {/* Cuerpo — mensajes o estado especial */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {status === 'disabled' && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🔇</div>
                El asistente está temporalmente deshabilitado.
              </div>
            )}

            {!user && status !== 'disabled' && (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
                Inicia sesión para chatear con el asistente.
              </div>
            )}

            {user && messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                  gap: 8,
                }}
              >
                {msg.role !== 'user' && <BotAvatar />}
                <div
                  style={{
                    maxWidth: '78%',
                    padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: '#fff',
                    background: msg.role === 'user'
                      ? 'rgba(204,32,32,0.22)'
                      : 'rgba(255,255,255,0.06)',
                    border: msg.role === 'user'
                      ? '1px solid rgba(204,32,32,0.35)'
                      : '1px solid rgba(255,255,255,0.08)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Botones de acceso rápido — solo al inicio, antes del primer mensaje del usuario */}
            {user && !quickActionsUsed && status === 'idle' && messages.length === 1 && messages[0].id === 'welcome' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingLeft: 36 }}>
                {QUICK_ACTIONS.map(({ emoji, label }) => (
                  <button
                    key={label}
                    onClick={() => { setQuickActionsUsed(true); send(label) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.8)', fontSize: 12,
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(204,32,32,0.18)'
                      e.currentTarget.style.borderColor = 'rgba(204,32,32,0.45)'
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                      e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
                    }}
                  >
                    <span>{emoji}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}

            {status === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <BotAvatar />
                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px 14px 14px 4px',
                }}>
                  <TypingDots />
                </div>
              </div>
            )}

            {status === 'manual_wait' && (
              <div style={{
                background: 'rgba(249,115,22,0.1)',
                border: '1px solid rgba(249,115,22,0.25)',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12, color: 'rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 15 }}>👤</span>
                Un asesor te responderá en breve...
              </div>
            )}

            {status === 'limit' && (
              <div style={{
                background: 'rgba(204,32,32,0.12)',
                border: '1px solid rgba(204,32,32,0.3)',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12, color: 'rgba(255,255,255,0.7)',
                textAlign: 'center',
              }}>
                Has alcanzado el límite de respuestas del asistente para esta sesión.
                Si tienes más dudas, puedes contactarnos directamente.
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {user && status !== 'disabled' && (
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', gap: 8, alignItems: 'flex-end',
              flexShrink: 0,
            }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={inputDisabled}
                placeholder={
                  inputDisabled && status === 'limit'
                    ? 'Límite alcanzado'
                    : 'Escribe tu pregunta...'
                }
                rows={1}
                style={{
                  flex: 1, resize: 'none', overflow: 'hidden',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '9px 12px',
                  color: '#fff', fontSize: 13, fontFamily: 'inherit',
                  outline: 'none', transition: 'border-color 0.15s',
                  opacity: inputDisabled ? 0.5 : 1,
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(204,32,32,0.5)' }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 100) + 'px'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={inputDisabled || !input.trim()}
                style={{
                  width: 38, height: 38, borderRadius: 10, border: 'none',
                  background: inputDisabled || !input.trim()
                    ? 'rgba(255,255,255,0.08)'
                    : '#cc2020',
                  color: '#fff', cursor: inputDisabled || !input.trim() ? 'default' : 'pointer',
                  fontSize: 15, flexShrink: 0, transition: 'background 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ▶
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
