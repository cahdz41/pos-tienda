'use client'

import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { normalizeVoiceQuery } from '@/lib/voiceNormalize'

interface Props {
  onResult: (text: string) => void
}

const MicIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
)

export default function VoiceSearchButton({ onResult }: Props) {
  const { status, supported, start, stop } = useSpeechRecognition()

  if (!supported) return null

  const listening = status === 'listening'
  const errored   = status === 'error'

  return (
    <>
      <style>{`
        @keyframes micPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.55; transform: scale(0.88); }
        }
      `}</style>
      <button
        type="button"
        onClick={() => listening ? stop() : start(text => onResult(normalizeVoiceQuery(text)))}
        title={
          errored   ? 'Micrófono no disponible' :
          listening ? 'Escuchando… (clic para cancelar)' :
                      'Buscar por voz'
        }
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, flexShrink: 0,
          borderRadius: 8,
          border: listening
            ? '1px solid rgba(204,32,32,0.55)'
            : errored
              ? '1px solid rgba(204,32,32,0.3)'
              : '1px solid var(--border)',
          background: listening
            ? 'rgba(204,32,32,0.12)'
            : 'var(--surface)',
          color: listening ? '#cc2020' : errored ? 'rgba(204,32,32,0.6)' : 'var(--text-muted, #888)',
          cursor: errored ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          animation: listening ? 'micPulse 1s ease-in-out infinite' : 'none',
        }}
      >
        <MicIcon />
      </button>
    </>
  )
}
