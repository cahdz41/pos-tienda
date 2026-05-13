'use client'

import { useEffect, useState } from 'react'

interface Props {
  shiftId: string
  onContinue: () => void
  onCancel: () => void
}

export default function TurnSummaryModal({ shiftId, onContinue, onCancel }: Props) {
  const [summary, setSummary]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchSummary() {
      try {
        const res  = await fetch('/api/turnos/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shiftId }),
        })
        const data = await res.json() as { summary?: string; error?: string }
        if (!cancelled) {
          if (data.summary) setSummary(data.summary)
          else setError(data.error ?? 'No se pudo generar el resumen.')
        }
      } catch {
        if (!cancelled) setError('Error de conexión al generar el resumen.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchSummary()
    return () => { cancelled = true }
  }, [shiftId])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Resumen del turno</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Generado por IA antes del cierre
            </p>
          </div>
          <button onClick={onCancel} className="text-sm" style={{ color: 'var(--text-muted)' }}>
            ← Volver
          </button>
        </div>

        {/* Contenido */}
        <div
          className="rounded-xl p-5 min-h-48 flex flex-col"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {loading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Generando resumen del turno…
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col gap-3">
              <div
                className="rounded-lg px-4 py-3 text-xs"
                style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}
              >
                {error}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Puedes continuar con el cierre de turno de todas formas.
              </p>
            </div>
          )}

          {!loading && summary && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}
            >
              {summary}
            </p>
          )}
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-medium"
            style={{
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            Volver
          </button>
          <button
            onClick={onContinue}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}
          >
            Continuar con el cierre
          </button>
        </div>

      </div>
    </div>
  )
}
