'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Shift, CashMovement } from '@/types'

interface ShiftSales {
  cash: number
  card: number
  credit: number
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )
}

// ── Sin turno abierto ───────────────────────────────────────────────────────
function NoShiftView({ onOpen, saving, error }: {
  onOpen: (amount: number) => Promise<void>
  saving: boolean
  error: string | null
}) {
  const [input, setInput] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(input)
    if (isNaN(n) || n < 0) return
    await onOpen(n)
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Abrir turno</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Ingresa el fondo inicial de caja para comenzar
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Fondo inicial
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={input} onChange={e => setInput(e.target.value)}
                placeholder="0.00" autoFocus
                className="w-full rounded-lg pl-8 pr-4 py-3 text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          </div>
          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}
          <button type="submit" disabled={saving || input === ''}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}>
            {saving ? 'Abriendo…' : 'Abrir turno'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Cerrar turno ────────────────────────────────────────────────────────────
function CloseShiftView({ shift, sales, movements, onConfirm, onCancel, saving, error }: {
  shift: Shift
  sales: ShiftSales
  movements: CashMovement[]
  onConfirm: (physicalCount: number) => Promise<void>
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [input, setInput] = useState('')
  const movNet = movements.reduce((s, m) => s + (m.type === 'in' ? m.amount : -m.amount), 0)
  const estimatedCash = shift.opening_amount + sales.cash + movNet
  const physicalCount = parseFloat(input)
  const diff = !isNaN(physicalCount) ? physicalCount - estimatedCash : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isNaN(physicalCount) || physicalCount < 0) return
    await onConfirm(physicalCount)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Cerrar turno</h1>
          <button onClick={onCancel} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        </div>

        {/* Resumen ventas */}
        <div className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Resumen de ventas
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Efectivo', value: sales.cash },
              { label: 'Tarjeta', value: sales.card },
              { label: 'Crédito', value: sales.credit },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg p-3 text-center"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-sm font-bold mt-1 font-mono" style={{ color: 'var(--accent)' }}>{fmt(value)}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Total ventas</span>
            <span className="text-sm font-bold font-mono" style={{ color: 'var(--accent)' }}>
              {fmt(sales.cash + sales.card + sales.credit)}
            </span>
          </div>
        </div>

        {/* Efectivo estimado */}
        <div className="rounded-xl p-4 flex flex-col gap-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Efectivo estimado en caja
          </p>
          {[
            { label: 'Fondo inicial', value: shift.opening_amount, sign: '' },
            { label: 'Ventas en efectivo', value: sales.cash, sign: '+' },
            ...(movNet !== 0 ? [{ label: 'Movimientos netos', value: Math.abs(movNet), sign: movNet >= 0 ? '+' : '−' }] : []),
          ].map(({ label, value, sign }) => (
            <div key={label} className="flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
              <span>{label}</span>
              <span className="font-mono">{sign}{fmt(value)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold pt-2 border-t"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
            <span>Estimado</span>
            <span className="font-mono">{fmt(estimatedCash)}</span>
          </div>
        </div>

        {/* Conteo físico */}
        <form onSubmit={handleSubmit} className="rounded-xl p-4 flex flex-col gap-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Conteo físico de efectivo
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
              style={{ color: 'var(--text-muted)' }}>$</span>
            <input
              type="number" min="0" step="0.01"
              value={input} onChange={e => setInput(e.target.value)}
              placeholder="0.00" autoFocus
              className="w-full rounded-lg pl-8 pr-4 py-3 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
          {diff !== null && (
            <div className="flex justify-between text-sm font-bold p-3 rounded-lg" style={{
              background: diff === 0 ? '#0D2B0D' : diff > 0 ? '#0D1F2B' : '#2D1010',
              color: diff === 0 ? '#4CAF50' : diff > 0 ? 'var(--accent)' : '#FF6B6B',
            }}>
              <span>{diff === 0 ? 'Sin diferencia' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
              <span className="font-mono">{diff === 0 ? '—' : fmt(Math.abs(diff))}</span>
            </div>
          )}
          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}
          <button type="submit" disabled={saving || input === ''}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
            {saving ? 'Cerrando turno…' : 'Confirmar cierre de turno'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Turno activo ────────────────────────────────────────────────────────────
function ActiveShiftView({ shift, sales, movements, onAddMovement, onStartClose, saving, error }: {
  shift: Shift
  sales: ShiftSales
  movements: CashMovement[]
  onAddMovement: (type: 'in' | 'out', amount: number, reason: string) => Promise<void>
  onStartClose: () => void
  saving: boolean
  error: string | null
}) {
  const [showModal, setShowModal] = useState(false)
  const [movType, setMovType] = useState<'in' | 'out'>('in')
  const [movAmount, setMovAmount] = useState('')
  const [movReason, setMovReason] = useState('')

  const movNet = movements.reduce((s, m) => s + (m.type === 'in' ? m.amount : -m.amount), 0)
  const estimatedCash = shift.opening_amount + sales.cash + movNet

  async function handleMovSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(movAmount)
    if (isNaN(n) || n <= 0 || !movReason.trim()) return
    await onAddMovement(movType, n, movReason.trim())
    setMovAmount(''); setMovReason(''); setShowModal(false)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Turno activo</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>desde {formatTime(shift.opened_at)}</span>
        </div>
        <button onClick={onStartClose}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
          Cerrar turno
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        {[
          { label: 'Fondo inicial', value: shift.opening_amount },
          { label: 'Efectivo ventas', value: sales.cash },
          { label: 'Tarjeta', value: sales.card },
          { label: 'Crédito', value: sales.credit },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl p-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="text-base font-bold mt-1 font-mono" style={{ color: 'var(--accent)' }}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Total + estimado */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total ventas</p>
          <p className="text-lg font-bold mt-1 font-mono" style={{ color: 'var(--accent)' }}>
            {fmt(sales.cash + sales.card + sales.credit)}
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Efectivo estimado en caja</p>
          <p className="text-lg font-bold mt-1 font-mono" style={{ color: 'var(--text)' }}>{fmt(estimatedCash)}</p>
        </div>
      </div>

      {/* Movimientos */}
      <div className="flex flex-col rounded-xl overflow-hidden shrink-0"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Movimientos de efectivo
          </span>
          <button onClick={() => setShowModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--accent)', color: '#000' }}>
            + Agregar
          </button>
        </div>
        {movements.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin movimientos en este turno</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {movements.map(m => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>{m.reason}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatTime(m.created_at)}</p>
                </div>
                <span className="text-sm font-bold font-mono"
                  style={{ color: m.type === 'in' ? 'var(--accent)' : '#FF6B6B' }}>
                  {m.type === 'in' ? '+' : '−'}{fmt(m.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal movimiento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Movimiento de efectivo</h2>
            <form onSubmit={handleMovSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {(['in', 'out'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setMovType(t)}
                    className="py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: movType === t ? (t === 'in' ? 'var(--accent)' : '#2D1010') : 'var(--bg)',
                      color: movType === t ? (t === 'in' ? '#000' : '#FF6B6B') : 'var(--text-muted)',
                      border: `1px solid ${movType === t ? (t === 'in' ? 'var(--accent)' : '#4D1A1A') : 'var(--border)'}`,
                    }}>
                    {t === 'in' ? '↑ Entrada' : '↓ Salida'}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Monto</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                    style={{ color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0.01" step="0.01"
                    value={movAmount} onChange={e => setMovAmount(e.target.value)}
                    placeholder="0.00" autoFocus
                    className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Motivo</label>
                <input type="text" value={movReason} onChange={e => setMovReason(e.target.value)}
                  placeholder="Ej. Pago de proveedor, vuelto de banco…"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving || !movAmount || !movReason.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────
export default function TurnosPage() {
  const { user, loading: authLoading } = useAuth()
  const [loadingShift, setLoadingShift] = useState(true)
  const [shift, setShift] = useState<Shift | null>(null)
  const [sales, setSales] = useState<ShiftSales>({ cash: 0, card: 0, credit: 0 })
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [view, setView] = useState<'main' | 'closing'>('main')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadShift = useCallback(async () => {
    if (!user) { setLoadingShift(false); return }
    const supabase = createClient()
    try {
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*')
        .eq('status', 'open')
        .maybeSingle()

      setShift(shiftData as Shift | null)

      if (shiftData) {
        const [salesRes, movRes] = await Promise.all([
          supabase.from('sales').select('payment_method, total')
            .eq('shift_id', shiftData.id).eq('status', 'completed'),
          supabase.from('cash_movements').select('*')
            .eq('shift_id', shiftData.id).order('created_at', { ascending: false }),
        ])
        const stats: ShiftSales = { cash: 0, card: 0, credit: 0 }
        for (const s of salesRes.data ?? []) {
          const pm = s.payment_method as keyof ShiftSales
          if (pm in stats) stats[pm] += Number(s.total)
        }
        setSales(stats)
        setMovements((movRes.data ?? []) as CashMovement[])
      }
    } finally {
      setLoadingShift(false)
    }
  }, [user])

  useEffect(() => {
    if (!authLoading) loadShift()
  }, [authLoading, loadShift])

  async function openShift(amount: number) {
    if (!user) return
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('shifts')
        .insert({ cashier_id: user.id, opening_amount: amount, status: 'open' })
        .select().single()
      if (err) throw err
      setShift(data as Shift)
      setSales({ cash: 0, card: 0, credit: 0 })
      setMovements([])
    } catch {
      setError('Error al abrir turno. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function addMovement(type: 'in' | 'out', amount: number, reason: string) {
    if (!shift) return
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('cash_movements')
        .insert({ shift_id: shift.id, type, amount, reason })
        .select().single()
      if (err) throw err
      setMovements(prev => [data as CashMovement, ...prev])
    } catch {
      setError('Error al registrar movimiento.')
    } finally {
      setSaving(false)
    }
  }

  async function closeShift(physicalCount: number) {
    if (!shift) return
    setSaving(true); setError(null)
    try {
      const movNet = movements.reduce((s, m) => s + (m.type === 'in' ? m.amount : -m.amount), 0)
      const estimatedCash = shift.opening_amount + sales.cash + movNet
      const supabase = createClient()
      const { error: err } = await supabase
        .from('shifts').update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closing_amount: physicalCount,
          cash_difference: physicalCount - estimatedCash,
        }).eq('id', shift.id)
      if (err) throw err
      setShift(null); setSales({ cash: 0, card: 0, credit: 0 }); setMovements([]); setView('main')
    } catch {
      setError('Error al cerrar turno. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loadingShift) return <Spinner />

  if (!shift) return <NoShiftView onOpen={openShift} saving={saving} error={error} />

  if (view === 'closing') {
    return <CloseShiftView shift={shift} sales={sales} movements={movements}
      onConfirm={closeShift} onCancel={() => { setView('main'); setError(null) }}
      saving={saving} error={error} />
  }

  return <ActiveShiftView shift={shift} sales={sales} movements={movements}
    onAddMovement={addMovement} onStartClose={() => { setView('closing'); setError(null) }}
    saving={saving} error={error} />
}
