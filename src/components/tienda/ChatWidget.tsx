'use client'

import { useState, useEffect, useRef } from 'react'
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
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'rgba(255,255,255,0.4)',
          animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
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
    }}>⚡</div>
  )
}

// Module-level guard: survives React StrictMode's simulated unmount/remount.
// forUserId  — which user was last initialized
// mountId    — which component instance ran init (UUID per mount, reused across StrictMode double-run)
const chatInitState: { forUserId: string | null; mountId: string | null } = {
  forUserId: null,
  mountId: null,
}

export default function ChatWidget() {
  const { user, loading: authLoading } = useStoreAuth()
  const [minimized, setMinimized]         = useState(false)
  const [sessionId, setSessionId]         = useState<string | null>(null)
  const [messages, setMessages]           = useState<Message[]>([])
  const [input, setInput]                 = useState('')
  const [status, setStatus]               = useState<BotStatus>('idle')
  const [botMode, setBotMode]             = useState<'auto' | 'manual'>('auto')
  const [quickActionsUsed, setQuickActionsUsed] = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastMsgRef   = useRef<string>('')
  const shownIdsRef  = useRef<Set<string>>(new Set())

  // Unique ID for this component instance. Generated once on first render.
  // Shared across StrictMode's double-invocation (same instance), but new on actual remount.
  const mountIdRef = useRef<string | null>(null)
  if (!mountIdRef.current) mountIdRef.current = crypto.randomUUID()

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status, minimized])

  // ── Session init ──────────────────────────────────────────────────────────
  // Guard fires when: same user + same component instance → already initialized.
  // The IIFE has NO isMounted check on purpose: we let it complete even if
  // StrictMode runs the cleanup between launch and resolution. React 18 silently
  // drops state updates on unmounted components, then applies them on remount.
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      // Logout: full reset so next login re-initializes
      chatInitState.forUserId = null
      chatInitState.mountId   = null
      setSessionId(null)
      setMessages([])
      setStatus('idle')
      setQuickActionsUsed(false)
      shownIdsRef.current = new Set()
      return
    }

    const myMountId = mountIdRef.current!
    if (chatInitState.forUserId === user.id && chatInitState.mountId === myMountId) return

    // Claim this init slot — all future runs for this user+mount return early.
    chatInitState.forUserId = user.id
    chatInitState.mountId   = myMountId

    ;(async () => {
      setStatus('loading')
      try {
        const { data: { session } } = await getStoreSupabase().auth.getSession()
        const token = session?.access_token
        if (!token) { setStatus('idle'); return }

        const configRes = await fetch('/api/chat/session', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!configRes.ok) {
          const { error } = await configRes.json()
          if (error === 'bot_disabled') { setStatus('disabled'); return }
          if (error === 'daily_limit')  { setStatus('limit');    return }
          setStatus('idle'); return
        }

        const { session_id } = await configRes.json()

        // Anchor polling to NOW — all messages before this moment are ignored.
        lastMsgRef.current  = new Date().toISOString()
        shownIdsRef.current = new Set()

        setQuickActionsUsed(false)
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: '¡Hola! 👋 Soy el asistente de Chocholand. Puedo ayudarte a encontrar productos, revisar precios y recomendarte suplementos para tu objetivo fitness. ¿En qué te ayudo?',
          created_at: new Date().toISOString(),
        }])
        setSessionId(session_id)   // triggers polling effect below
        setStatus('idle')
      } catch {
        setStatus('idle')
      }
    })()
    // No cleanup: let the IIFE complete regardless of StrictMode lifecycle.
  }, [user, authLoading])

  // ── Polling — driven by sessionId ─────────────────────────────────────────
  // Starts/stops automatically whenever sessionId changes.
  // StrictMode cleanup clears the interval; the re-run restarts it with the
  // same sessionId (and the same lastMsgRef anchor set by the init IIFE).
  useEffect(() => {
    if (!sessionId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }

    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      const { data: { session } } = await getStoreSupabase().auth.getSession()
      const token = session?.access_token
      if (!token) return

      const after = lastMsgRef.current
      const res = await fetch(
        `/api/chat/messages?session_id=${sessionId}${after ? `&after=${encodeURIComponent(after)}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return

      const { messages: newMsgs } = await res.json()
      if (!newMsgs?.length) return

      // Filter: ignore user messages (shown optimistically) and already-seen IDs.
      const unseen = (newMsgs as Message[]).filter(
        (m) => !shownIdsRef.current.has(m.id) && m.role !== 'user'
      )
      if (!unseen.length) return

      unseen.forEach((m) => shownIdsRef.current.add(m.id))
      lastMsgRef.current = unseen.at(-1)!.created_at
      setMessages((prev) => [...prev, ...unseen])
      setStatus('idle')
    }, POLL_INTERVAL)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [sessionId])

  // ── Send message ──────────────────────────────────────────────────────────
  async function send(text: string) {
    if (!text || !sessionId || status === 'loading') return

    const { data: { session } } = await getStoreSupabase().auth.getSession()
    const token = session?.access_token
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, content: text }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (['limit_reached', 'session_blocked', 'spam_detected'].includes(data.error)) {
          setStatus('limit'); return
        }
        if (['bot_disabled', 'api_limit'].includes(data.error)) {
          setStatus('disabled'); return
        }
        setStatus('idle'); return
      }

      if (data.manual_mode) {
        setStatus('manual_wait')
        setBotMode('manual')
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
        @keyframes chatTabIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chat-header-minimize {
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .chat-header-minimize:active {
          opacity: 0.7;
        }
      `}</style>

      {/* ── Tab minimizado ─────────────────────────────────────────────────── */}
      {minimized && (
        <button
          onClick={() => setMinimized(false)}
          aria-label="Abrir asistente"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 20px', borderRadius: 999, border: 'none',
            background: 'rgba(10,10,10,0.92)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 0 0 1px rgba(255,96,32,0.35), 0 0 22px rgba(204,32,32,0.25)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 14, fontWeight: 600,
            animation: 'chatTabIn 0.2s ease both',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <BotAvatar />
          <span>Asistente</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>↑</span>
        </button>
      )}

      {/* ── Panel de chat ──────────────────────────────────────────────────── */}
      {!minimized && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9001,
            width: 'min(370px, calc(100vw - 32px))',
            height: 'min(520px, calc(100dvh - 100px))',
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
          {/* Drag handle — área táctil para minimizar en móvil */}
          <div
            className="chat-header-minimize"
            onClick={() => setMinimized(true)}
            style={{
              display: 'flex', justifyContent: 'center',
              padding: '8px 0 4px',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 36, height: 4, borderRadius: 999,
              background: 'rgba(255,255,255,0.2)',
            }} />
          </div>

          {/* Header — también minimiza al tocar en móvil */}
          <div
            className="chat-header-minimize"
            onClick={() => setMinimized(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 16px 12px',
              background: 'linear-gradient(to right, rgba(30,5,5,0.9), rgba(10,10,10,0.9))',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}
          >
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
            <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', lineHeight: 1, fontWeight: 300 }}>
              —
            </span>
          </div>

          {/* Cuerpo */}
          <div
            style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
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
                <div style={{
                  maxWidth: '78%',
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  fontSize: 13, lineHeight: 1.5, color: '#fff',
                  background: msg.role === 'user' ? 'rgba(204,32,32,0.22)' : 'rgba(255,255,255,0.06)',
                  border: msg.role === 'user' ? '1px solid rgba(204,32,32,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Botones de acceso rápido */}
            {user && !quickActionsUsed && status === 'idle' && messages.length === 1 && messages[0]?.id === 'welcome' && (
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
                      WebkitTapHighlightColor: 'transparent',
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
                placeholder={inputDisabled && status === 'limit' ? 'Límite alcanzado' : 'Escribe tu pregunta...'}
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
                  background: inputDisabled || !input.trim() ? 'rgba(255,255,255,0.08)' : '#cc2020',
                  color: '#fff', cursor: inputDisabled || !input.trim() ? 'default' : 'pointer',
                  fontSize: 15, flexShrink: 0, transition: 'background 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >▶</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
