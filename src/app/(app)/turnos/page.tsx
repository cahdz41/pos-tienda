'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { summarizeCashMovements } from '@/lib/cashMovementSummary'
import { summarizeShiftPayments } from '@/lib/financialAccounts'
import { useAuth } from '@/contexts/AuthContext'
import type { Shift, CashMovement, CashMovementCategory, MoneyAccount } from '@/types'
import TurnSummaryModal from '@/components/TurnSummaryModal'

interface ShiftSales {
  total: number
  cash: number
  card: number
  transfer: number
  credit: number
}

interface NewCashMovement {
  type: 'in' | 'out'
  amount: number
  reason: string
  scope: 'business' | 'family'
  categoryId: string
  accountId: string
  beneficiary: string
  notes: string
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
function CloseShiftView({ shift, sales, movements, cashAccountId, onConfirm, onCancel, saving, error }: {
  shift: Shift
  sales: ShiftSales
  movements: CashMovement[]
  cashAccountId: string | null
  onConfirm: (physicalCount: number) => Promise<void>
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [input, setInput] = useState('')
  const movementSummary = summarizeCashMovements(movements, cashAccountId)
  const estimatedCash = shift.opening_amount + sales.cash + movementSummary.cashNet
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

        {/* Separación de salidas */}
        <div className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Control de salidas
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Gastos del negocio</p>
              <p className="text-sm font-bold font-mono mt-1" style={{ color: '#FFB74D' }}>
                {fmt(movementSummary.businessExpenses)}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Retiros familiares</p>
              <p className="text-sm font-bold font-mono mt-1" style={{ color: '#CE93D8' }}>
                {fmt(movementSummary.familyExpenses)}
              </p>
            </div>
          </div>
          {movementSummary.unclassifiedExpenses > 0 && (
            <div className="flex justify-between text-xs rounded-lg px-3 py-2"
              style={{ background: '#2B2410', color: '#FFD166', border: '1px solid #5A4814' }}>
              <span>Histórico sin clasificar</span>
              <span className="font-mono font-bold">{fmt(movementSummary.unclassifiedExpenses)}</span>
            </div>
          )}
        </div>

        {/* Resumen ventas */}
        <div className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Resumen de ventas
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Efectivo', value: sales.cash },
              { label: 'Tarjeta', value: sales.card },
              { label: 'Transferencia', value: sales.transfer },
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
              {fmt(sales.total)}
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
            ...(movementSummary.cashNet !== 0 ? [{
              label: 'Movimientos netos',
              value: Math.abs(movementSummary.cashNet),
              sign: movementSummary.cashNet >= 0 ? '+' : '−',
            }] : []),
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
function ActiveShiftView({
  shift,
  sales,
  movements,
  categories,
  accounts,
  cashAccountId,
  responsibleName,
  responsibleNames,
  canCancel,
  onAddMovement,
  onCancelMovement,
  onStartClose,
  saving,
  error,
}: {
  shift: Shift
  sales: ShiftSales
  movements: CashMovement[]
  categories: CashMovementCategory[]
  accounts: MoneyAccount[]
  cashAccountId: string | null
  responsibleName: string
  responsibleNames: Record<string, string>
  canCancel: boolean
  onAddMovement: (movement: NewCashMovement) => Promise<boolean>
  onCancelMovement: (movementId: string, reason: string) => Promise<boolean>
  onStartClose: () => void
  saving: boolean
  error: string | null
}) {
  const [showModal, setShowModal] = useState(false)
  const [movType, setMovType] = useState<'in' | 'out'>('in')
  const [movScope, setMovScope] = useState<'business' | 'family'>('business')
  const [movCategoryId, setMovCategoryId] = useState('')
  const [movAccountId, setMovAccountId] = useState(cashAccountId ?? '')
  const [movAmount, setMovAmount] = useState('')
  const [movReason, setMovReason] = useState('')
  const [movBeneficiary, setMovBeneficiary] = useState('')
  const [movNotes, setMovNotes] = useState('')
  const [movementToCancel, setMovementToCancel] = useState<CashMovement | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const movementSummary = summarizeCashMovements(movements, cashAccountId)
  const estimatedCash = shift.opening_amount + sales.cash + movementSummary.cashNet
  const availableCategories = categories.filter(category =>
    category.is_active
    && category.scope === movScope
    && (category.movement_type === 'both' || category.movement_type === movType)
  )

  function changeMovementType(type: 'in' | 'out') {
    setMovType(type)
    setMovCategoryId('')
  }

  function changeMovementScope(scope: 'business' | 'family') {
    setMovScope(scope)
    setMovCategoryId('')
  }

  function resetMovementForm() {
    setMovType('in')
    setMovScope('business')
    setMovCategoryId('')
    setMovAccountId(cashAccountId ?? '')
    setMovAmount('')
    setMovReason('')
    setMovBeneficiary('')
    setMovNotes('')
  }

  async function handleMovSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(movAmount)
    if (
      isNaN(n) || n <= 0 || !movReason.trim() || !movCategoryId || !movAccountId
      || !movBeneficiary.trim()
    ) return

    const saved = await onAddMovement({
      type: movType,
      amount: n,
      reason: movReason.trim(),
      scope: movScope,
      categoryId: movCategoryId,
      accountId: movAccountId,
      beneficiary: movBeneficiary.trim(),
      notes: movNotes.trim(),
    })
    if (!saved) return
    resetMovementForm()
    setShowModal(false)
  }

  async function handleCancelSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!movementToCancel || !cancelReason.trim()) return
    const cancelled = await onCancelMovement(movementToCancel.id, cancelReason.trim())
    if (!cancelled) return
    setMovementToCancel(null)
    setCancelReason('')
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
        {[
          { label: 'Fondo inicial', value: shift.opening_amount },
          { label: 'Efectivo ventas', value: sales.cash },
          { label: 'Tarjeta', value: sales.card },
          { label: 'Transferencia', value: sales.transfer },
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
            {fmt(sales.total)}
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Efectivo estimado en caja</p>
          <p className="text-lg font-bold mt-1 font-mono" style={{ color: 'var(--text)' }}>{fmt(estimatedCash)}</p>
        </div>
      </div>

      {/* Negocio vs familia */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
        <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Salidas del negocio</p>
          <p className="text-base font-bold mt-1 font-mono" style={{ color: '#FFB74D' }}>
            {fmt(movementSummary.businessExpenses)}
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Retiros familiares</p>
          <p className="text-base font-bold mt-1 font-mono" style={{ color: '#CE93D8' }}>
            {fmt(movementSummary.familyExpenses)}
          </p>
        </div>
        {movementSummary.unclassifiedExpenses > 0 && (
          <div className="rounded-xl p-3 col-span-2 sm:col-span-1"
            style={{ background: '#2B2410', border: '1px solid #5A4814' }}>
            <p className="text-xs" style={{ color: '#FFD166' }}>Histórico sin clasificar</p>
            <p className="text-base font-bold mt-1 font-mono" style={{ color: '#FFD166' }}>
              {fmt(movementSummary.unclassifiedExpenses)}
            </p>
          </div>
        )}
      </div>

      {/* Movimientos */}
      <div className="flex flex-col rounded-xl overflow-hidden shrink-0"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Movimientos de dinero
          </span>
          <button onClick={() => { setMovAccountId(cashAccountId ?? accounts[0]?.id ?? ''); setShowModal(true) }}
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
              <div key={m.id} className="flex items-start justify-between gap-4 px-4 py-3"
                style={{ opacity: m.status === 'cancelled' ? 0.55 : 1 }}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm" style={{
                      color: 'var(--text)',
                      textDecoration: m.status === 'cancelled' ? 'line-through' : 'none',
                    }}>
                      {m.reason}
                    </p>
                    {m.scope && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{
                        background: m.scope === 'business' ? '#33280E' : '#2B1730',
                        color: m.scope === 'business' ? '#FFB74D' : '#CE93D8',
                      }}>
                        {m.scope === 'business' ? 'Negocio' : 'Familia'}
                      </span>
                    )}
                    {!m.scope && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: '#2B2410', color: '#FFD166' }}>
                        Histórico sin clasificar
                      </span>
                    )}
                    {m.status === 'cancelled' && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: '#2D1010', color: '#FF6B6B' }}>
                        Cancelado
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {categories.find(category => category.id === m.category_id)?.name ?? 'Categoría histórica'}
                    {m.beneficiary ? ` · ${m.beneficiary}` : ''}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Cuenta: {accounts.find(account => account.id === m.account_id)?.name ?? 'Movimiento anterior a Cuentas 1B'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatTime(m.created_at)} · Responsable: {m.created_by
                      ? responsibleNames[m.created_by] ?? 'Usuario registrado'
                      : 'Registro histórico'}
                  </p>
                  {m.notes && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{m.notes}</p>}
                  {m.status === 'cancelled' && m.cancellation_reason && (
                    <div className="mt-1">
                      <p className="text-xs" style={{ color: '#FF6B6B' }}>
                        Motivo de cancelación: {m.cancellation_reason}
                      </p>
                      {m.cancelled_at && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          Cancelado {formatTime(m.cancelled_at)} por {
                            m.cancelled_by
                              ? responsibleNames[m.cancelled_by] ?? 'el propietario'
                              : 'el propietario'
                          }
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-sm font-bold font-mono"
                    style={{ color: m.type === 'in' ? 'var(--accent)' : '#FF6B6B' }}>
                    {m.type === 'in' ? '+' : '−'}{fmt(m.amount)}
                  </span>
                  {canCancel && m.status !== 'cancelled' && (
                    <button type="button" onClick={() => { setMovementToCancel(m); setCancelReason('') }}
                      className="text-[11px] px-2 py-1 rounded"
                      style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
                      Cancelar
                    </button>
                  )}
                </div>
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
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Movimiento de dinero</h2>
            <form onSubmit={handleMovSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {(['in', 'out'] as const).map(t => (
                  <button key={t} type="button" onClick={() => changeMovementType(t)}
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
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Cuenta de dinero
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {accounts.filter(account => account.is_active).map(account => (
                    <button key={account.id} type="button" onClick={() => setMovAccountId(account.id)}
                      className="py-2 rounded-lg text-sm font-semibold"
                      style={{
                        background: movAccountId === account.id ? 'var(--accent)' : 'var(--bg)',
                        color: movAccountId === account.id ? '#000' : 'var(--text-muted)',
                        border: `1px solid ${movAccountId === account.id ? 'var(--accent)' : 'var(--border)'}`,
                      }}>
                      {account.code === 'cash' ? '💵 Caja' : '💳 Mercado Pago'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Alcance
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['business', 'family'] as const).map(scope => (
                    <button key={scope} type="button" onClick={() => changeMovementScope(scope)}
                      className="py-2 rounded-lg text-sm font-semibold"
                      style={{
                        background: movScope === scope ? (scope === 'business' ? '#33280E' : '#2B1730') : 'var(--bg)',
                        color: movScope === scope ? (scope === 'business' ? '#FFB74D' : '#CE93D8') : 'var(--text-muted)',
                        border: `1px solid ${movScope === scope ? (scope === 'business' ? '#6B5112' : '#593060') : 'var(--border)'}`,
                      }}>
                      {scope === 'business' ? 'Negocio' : 'Familia'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Categoría
                </label>
                <select required value={movCategoryId} onChange={e => setMovCategoryId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="">Selecciona una categoría</option>
                  {availableCategories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                {availableCategories.length === 0 && (
                  <p className="text-xs mt-1.5" style={{ color: '#FFD166' }}>
                    No hay categorías disponibles para esta combinación.
                  </p>
                )}
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
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  {movType === 'out' ? 'Beneficiario o proveedor' : 'Origen del dinero'}
                </label>
                <input type="text" required value={movBeneficiary} onChange={e => setMovBeneficiary(e.target.value)}
                  placeholder={movType === 'out' ? 'Ej. Planet, arrendador, propietario…' : 'Ej. Propietario, cliente…'}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Concepto o motivo</label>
                <input type="text" value={movReason} onChange={e => setMovReason(e.target.value)}
                  placeholder="Ej. Anticipo del pedido del lunes…"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Notas <span className="font-normal">(opcional)</span>
                </label>
                <textarea value={movNotes} onChange={e => setMovNotes(e.target.value)} rows={2}
                  placeholder="Referencia, pedido relacionado u otra aclaración"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div className="rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Responsable: <span style={{ color: 'var(--text)' }}>{responsibleName}</span>
              </div>
              {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={
                  saving || !movAmount || !movReason.trim() || !movCategoryId
                  || !movAccountId || !movBeneficiary.trim()
                }
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancelación con historial */}
      {movementToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget && !saving) setMovementToCancel(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Cancelar movimiento</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                El movimiento seguirá visible y no se incluirá en los cálculos de caja.
              </p>
            </div>
            <div className="rounded-lg p-3 flex justify-between gap-3"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text)' }}>{movementToCancel.reason}</span>
              <span className="text-sm font-bold font-mono" style={{ color: '#FF6B6B' }}>
                {fmt(movementToCancel.amount)}
              </span>
            </div>
            <form onSubmit={handleCancelSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Motivo de cancelación
                </label>
                <textarea required value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3}
                  placeholder="Explica por qué se cancela"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={() => setMovementToCancel(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Volver
                </button>
                <button type="submit" disabled={saving || !cancelReason.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                  style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
                  {saving ? 'Cancelando…' : 'Confirmar cancelación'}
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
  const { user, profile, loading: authLoading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loadingShift, setLoadingShift] = useState(true)
  const [shift, setShift] = useState<Shift | null>(null)
  const [sales, setSales] = useState<ShiftSales>({ total: 0, cash: 0, card: 0, transfer: 0, credit: 0 })
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [categories, setCategories] = useState<CashMovementCategory[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [responsibleNames, setResponsibleNames] = useState<Record<string, string>>({})
  const [view, setView] = useState<'main' | 'summary' | 'closing'>('main')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadShift = useCallback(async () => {
    if (!user) { setLoadingShift(false); return }
    const supabase = createClient()
    // El proyecto aún no tiene tipos generados del esquema de Supabase.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    try {
      const [shiftResult, categoryResult, accountResult] = await Promise.all([
        db
          .from('shifts')
          .select('*')
          .eq('cashier_id', user.id)
          .eq('status', 'open')
          .order('opened_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        db
          .from('cash_movement_categories')
          .select('*')
          .order('scope')
          .order('name'),
        db
          .from('money_accounts')
          .select('*')
          .eq('is_active', true)
          .order('display_order'),
      ])

      const { data: shiftData, error: shiftError } = shiftResult

      if (shiftError) throw shiftError
      if (categoryResult.error) {
        throw new Error('Falta aplicar la migración sql/control_salidas_1a.sql en Supabase.')
      }
      if (accountResult.error) {
        throw new Error('Falta aplicar la migración sql/control_cuentas_1b.sql en Supabase.')
      }

      setShift(shiftData as Shift | null)
      setCategories((categoryResult.data ?? []) as CashMovementCategory[])
      setAccounts((accountResult.data ?? []) as MoneyAccount[])

      if (shiftData) {
        const [salesRes, movRes] = await Promise.all([
          db.from('sales').select('id, payment_method, total')
            .eq('shift_id', shiftData.id).eq('status', 'completed'),
          db.from('cash_movements').select('*')
            .eq('shift_id', shiftData.id).order('created_at', { ascending: false }),
        ])
        const saleRows = (salesRes.data ?? []) as { id: string; total: number; payment_method: string }[]
        const saleIds = saleRows.map(sale => sale.id)
        const paymentRows = saleIds.length > 0
          ? ((await db.from('sale_payments').select('sale_id, method, amount').in('sale_id', saleIds)).data ?? [])
          : []
        const stats = summarizeShiftPayments(saleRows, paymentRows) as ShiftSales
        setSales(stats)
        const loadedMovements = (movRes.data ?? []) as CashMovement[]
        setMovements(loadedMovements)

        const responsibleIds = Array.from(new Set(
          loadedMovements.flatMap(movement =>
            [movement.created_by, movement.cancelled_by].filter((id): id is string => Boolean(id))
          )
        ))
        if (responsibleIds.length > 0) {
          const { data: profileRows } = await db
            .from('profiles')
            .select('id, name')
            .in('id', responsibleIds)
          setResponsibleNames(Object.fromEntries(
            (profileRows ?? []).map((row: { id: string; name: string }) => [row.id, row.name])
          ))
        } else {
          setResponsibleNames({})
        }
      }
    } catch (loadError) {
      console.error('[Turnos] Error consultando turno:', loadError)
      setError(
        loadError instanceof Error && loadError.message.includes('.sql')
          ? loadError.message
          : 'No se pudo consultar el turno. Revisa la conexión e intenta nuevamente.'
      )
    } finally {
      setLoadingShift(false)
    }
  }, [user])

  useEffect(() => {
    if (!authLoading) loadShift()
  }, [authLoading, loadShift])

  // Arrancar cierre de turno vía URL param (comando de voz)
  useEffect(() => {
    if (!loadingShift && shift && searchParams?.get('accion') === 'cerrar') {
      setView('summary')
      router.replace('/turnos', { scroll: false })
    }
  }, [loadingShift, shift, searchParams, router])

  async function openShift(amount: number) {
    if (!user) return
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // Volver a comprobar antes de insertar evita turnos duplicados por
      // recargas, navegación rápida o un doble envío del formulario.
      const { data: existingShift, error: lookupError } = await db
        .from('shifts')
        .select('id')
        .eq('cashier_id', user.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (lookupError) throw lookupError
      if (existingShift) {
        await loadShift()
        return
      }

      const { data, error: err } = await db
        .from('shifts')
        .insert({ cashier_id: user.id, opening_amount: amount, status: 'open' })
        .select().single()
      if (err) throw err
      setShift(data as Shift)
      setSales({ total: 0, cash: 0, card: 0, transfer: 0, credit: 0 })
      setMovements([])
      setResponsibleNames(profile?.name ? { [user.id]: profile.name } : {})
    } catch {
      setError('Error al abrir turno. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function addMovement(movement: NewCashMovement): Promise<boolean> {
    if (!shift || !user) return false
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data, error: err } = await db
        .from('cash_movements')
        .insert({
          shift_id: shift.id,
          type: movement.type,
          amount: movement.amount,
          reason: movement.reason,
          scope: movement.scope,
          category_id: movement.categoryId,
          account_id: movement.accountId,
          beneficiary: movement.beneficiary,
          notes: movement.notes || null,
          created_by: user.id,
        })
        .select().single()
      if (err) throw err
      setMovements(prev => [data as CashMovement, ...prev])
      if (profile?.name) {
        setResponsibleNames(previous => ({ ...previous, [user.id]: profile.name }))
      }
      return true
    } catch (movementError) {
      console.error('[Turnos] Error registrando movimiento:', movementError)
      setError('No se pudo registrar el movimiento. Verifica los datos e intenta nuevamente.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function cancelMovement(movementId: string, reason: string): Promise<boolean> {
    if (!shift || profile?.role !== 'owner') return false
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data, error: cancelError } = await db
        .rpc('cancel_cash_movement', {
          p_movement_id: movementId,
          p_reason: reason,
        })
        .single()
      if (cancelError) throw cancelError
      setMovements(previous => previous.map(movement =>
        movement.id === movementId ? data as CashMovement : movement
      ))
      if (profile?.name && data?.cancelled_by) {
        setResponsibleNames(previous => ({ ...previous, [data.cancelled_by]: profile.name }))
      }
      return true
    } catch (cancelError) {
      console.error('[Turnos] Error cancelando movimiento:', cancelError)
      setError('No se pudo cancelar el movimiento. Solo el propietario puede realizar esta acción.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function closeShift(physicalCount: number) {
    if (!shift) return
    setSaving(true); setError(null)
    try {
      const cashAccountId = accounts.find(account => account.code === 'cash')?.id ?? null
      const estimatedCash = shift.opening_amount
        + sales.cash
        + summarizeCashMovements(movements, cashAccountId).cashNet
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { error: err } = await db
        .from('shifts').update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closing_amount: physicalCount,
          cash_difference: physicalCount - estimatedCash,
        }).eq('id', shift.id)
      if (err) throw err
      setShift(null); setSales({ total: 0, cash: 0, card: 0, transfer: 0, credit: 0 }); setMovements([])
      setResponsibleNames({}); setView('main')
    } catch {
      setError('Error al cerrar turno. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loadingShift) return <Spinner />

  if (!shift) return <NoShiftView onOpen={openShift} saving={saving} error={error} />

  if (view === 'summary') {
    return <TurnSummaryModal
      shiftId={shift.id}
      onContinue={() => setView('closing')}
      onCancel={() => { setView('main'); setError(null) }}
    />
  }

  if (view === 'closing') {
    return <CloseShiftView shift={shift} sales={sales} movements={movements}
      cashAccountId={accounts.find(account => account.code === 'cash')?.id ?? null}
      onConfirm={closeShift} onCancel={() => { setView('main'); setError(null) }}
      saving={saving} error={error} />
  }

  return <ActiveShiftView shift={shift} sales={sales} movements={movements}
    categories={categories}
    accounts={accounts}
    cashAccountId={accounts.find(account => account.code === 'cash')?.id ?? null}
    responsibleName={profile?.name || 'Usuario actual'}
    responsibleNames={responsibleNames}
    canCancel={profile?.role === 'owner'}
    onAddMovement={addMovement}
    onCancelMovement={cancelMovement}
    onStartClose={() => { setView('summary'); setError(null) }}
    saving={saving} error={error} />
}
