'use client'

import { createContext, useContext, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'

export type CommandStatus = 'idle' | 'listening' | 'processing' | 'done' | 'error'

interface VoiceCommandContextValue {
  status: CommandStatus
  transcript: string | null
  message: string | null
  supported: boolean
  toggle: () => void
}

const VoiceCommandContext = createContext<VoiceCommandContextValue>({
  status: 'idle',
  transcript: null,
  message: null,
  supported: false,
  toggle: () => {},
})

export function VoiceCommandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { start, stop, supported } = useSpeechRecognition()
  const [status,     setStatus]     = useState<CommandStatus>('idle')
  const [transcript, setTranscript] = useState<string | null>(null)
  const [message,    setMessage]    = useState<string | null>(null)

  function reset(delay = 0) {
    setTimeout(() => { setStatus('idle'); setTranscript(null); setMessage(null) }, delay)
  }

  const toggle = useCallback(() => {
    // Si está escuchando → cancelar
    if (status === 'listening') {
      stop()
      reset()
      return
    }
    // Si está procesando → ignorar clic
    if (status === 'processing') return

    // Iniciar escucha
    setStatus('listening')
    setTranscript(null)
    setMessage(null)

    start(async (text) => {
      setStatus('processing')
      setTranscript(text)

      try {
        const res  = await fetch('/api/voice/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: text }),
        })
        const data = await res.json() as {
          action: string
          path?: string
          label?: string
          message?: string
        }

        if (data.action === 'navigate' && data.path) {
          setStatus('done')
          setMessage(data.label ?? 'Navegando…')
          router.push(data.path)
          reset(2000)
        } else {
          setStatus('error')
          setMessage(data.message ?? 'Comando no reconocido')
          reset(3000)
        }
      } catch {
        setStatus('error')
        setMessage('Error de conexión')
        reset(3000)
      }
    })
  }, [status, start, stop, router])

  return (
    <VoiceCommandContext.Provider value={{ status, transcript, message, supported, toggle }}>
      {children}

      {/* Banner de estado — visible mientras hay actividad */}
      {status !== 'idle' && (
        <div
          className="fixed top-4 left-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold"
          style={{
            transform: 'translateX(-50%)',
            background: status === 'done'  ? '#0A2E1A'
                       : status === 'error' ? '#2D1010'
                       : 'var(--surface)',
            color: status === 'done'  ? '#4ADE80'
                 : status === 'error' ? '#FF6B6B'
                 : 'var(--text)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}
        >
          {status === 'listening' && (
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#FF6B6B' }} />
          )}
          {status === 'processing' && (
            <span
              className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin shrink-0"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
          )}
          {status === 'done'  && <span>✓</span>}
          {status === 'error' && <span>✗</span>}

          <span>
            {status === 'listening'  && 'Escuchando…'}
            {status === 'processing' && (transcript ? `"${transcript}"` : 'Procesando…')}
            {status === 'done'       && message}
            {status === 'error'      && message}
          </span>
        </div>
      )}
    </VoiceCommandContext.Provider>
  )
}

export function useVoiceCommand() {
  return useContext(VoiceCommandContext)
}
