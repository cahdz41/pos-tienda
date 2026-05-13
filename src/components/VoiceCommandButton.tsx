'use client'

import { useVoiceCommand } from '@/contexts/VoiceCommandContext'

export default function VoiceCommandButton() {
  const { status, supported, toggle } = useVoiceCommand()

  if (!supported) return null

  const isListening  = status === 'listening'
  const isProcessing = status === 'processing'
  const isActive     = isListening || isProcessing

  return (
    <button
      onClick={toggle}
      title={isListening ? 'Cancelar' : 'Comando de voz'}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold shadow-lg transition-all"
      style={{
        background: isListening
          ? 'rgba(255, 107, 107, 0.2)'
          : 'var(--surface)',
        border: `1px solid ${isListening ? '#FF6B6B' : 'var(--border)'}`,
        color: isListening ? '#FF6B6B' : 'var(--text-muted)',
        boxShadow: isListening
          ? '0 0 0 4px rgba(255, 107, 107, 0.15), 0 4px 12px rgba(0,0,0,0.3)'
          : '0 4px 12px rgba(0,0,0,0.3)',
        cursor: isProcessing ? 'default' : 'pointer',
        opacity: isProcessing ? 0.7 : 1,
      }}
    >
      {/* Ícono de micrófono */}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{
          animation: isListening ? 'pulse 1s ease-in-out infinite' : 'none',
        }}
      >
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>

      <span>{isActive ? (isListening ? 'Escucha…' : '…') : 'Voz'}</span>
    </button>
  )
}
