'use client'

import { useState, useRef, useEffect } from 'react'

type Period = 'today' | '7days' | 'month' | '30days'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  '¿Cuál fue mi producto más vendido?',
  '¿Qué días vendo más?',
  '¿Cuánto margen generé?',
  '¿Tengo productos con stock bajo?',
  '¿Cuánto vendí a crédito?',
]

export default function AnalyticsChat({ period }: { period: Period }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Reset chat when period changes
  useEffect(() => {
    setMessages([])
  }, [period])

  async function sendMessage(text: string) {
    const q = text.trim()
    if (!q || loading) return

    setMessages(prev => [...prev, { role: 'user', content: q }])
    setInput('')
    setLoading(true)

    try {
      const res  = await fetch('/api/analytics/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, period }),
      })
      const data = await res.json() as { answer?: string; error?: string }
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.answer ?? data.error ?? 'Error al obtener respuesta.' },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div
      className="flex flex-col shrink-0 border-l"
      style={{ width: '300px', background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0 border-b flex items-center gap-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <span style={{ fontSize: 18 }}>🤖</span>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Análisis IA</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pregunta sobre tus datos</p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">
        {messages.length === 0 && !loading && (
          <>
            <p className="text-xs text-center py-1" style={{ color: 'var(--text-muted)' }}>
              Pregúntame sobre el período seleccionado
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-3 py-2 rounded-xl text-xs transition-colors"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="px-3 py-2 rounded-xl text-xs max-w-[95%]"
              style={
                m.role === 'user'
                  ? { background: 'var(--accent)', color: '#000' }
                  : {
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.5',
                    }
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2.5 rounded-xl flex items-center gap-1"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              {[0, 150, 300].map(delay => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--text-muted)', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="px-3 py-3 shrink-0 border-t flex gap-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(input) }}
          placeholder="Escribe tu pregunta..."
          disabled={loading}
          className="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            opacity: loading ? 0.6 : 1,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="px-3 py-2 rounded-lg text-xs font-bold shrink-0 transition-colors"
          style={{
            background: input.trim() && !loading ? 'var(--accent)' : 'var(--border)',
            color: '#000',
            cursor: input.trim() && !loading ? 'pointer' : 'default',
          }}
        >
          ▶
        </button>
      </div>
    </div>
  )
}
