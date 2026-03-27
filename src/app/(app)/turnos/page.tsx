'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Shift, CashMovement, ShiftSummary } from '@/types'

const fmt = (n: number) => `$${Number(n).toFixed(2)}`

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `hace ${h}h ${m}m`
  return `hace ${m}m`
}

/* ─── Cash Movement Modal ─── */
interface MovementModalProps {
  shiftId: string
  userId: string
  defaultType: 'in' | 'out'
  onClose: () => void
  onDone: (movement: CashMovement) => void
}

function MovementModal({ shiftId, userId, defaultType, onClose, onDone }: MovementModalProps) {
  const supabase = createClient()
  const [type, setType] = useState<'in' | 'out'>(defaultType)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { setErr('Ingresa un monto válido'); return }
    if (!reason.trim()) { setErr('El motivo es obligatorio'); return }
    setSaving(true); setErr(null)
    const { data, error } = await supabase
      .from('cash_movements')
      .insert({ shift_id: shiftId, cashier_id: userId, type, amount: n, reason: reason.trim() })
      .select('*')
      .single()
    if (error) { setErr(error.message); setSaving(false); return }
    onDone(data as CashMovement)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <span className="modal-ttl">{type === 'in' ? 'Entrada de efectivo' : 'Salida de efectivo'}</span>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="seg-ctrl">
            <button className={`seg-btn ${type === 'in' ? 'seg-btn--in' : ''}`} onClick={() => setType('in')}>+ Entrada</button>
            <button className={`seg-btn ${type === 'out' ? 'seg-btn--out' : ''}`} onClick={() => setType('out')}>− Salida</button>
          </div>
          <div className="fld">
            <label className="lbl">Monto</label>
            <div className="amt-wrap">
              <span className="amt-pre">$</span>
              <input autoFocus type="number" min="0" step="0.01" value={amount}
                onChange={e => { setAmount(e.target.value); setErr(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="amt-inp" placeholder="0.00" />
            </div>
          </div>
          <div className="fld">
            <label className="lbl">Motivo <span className="req">*</span></label>
            <input type="text" value={reason}
              onChange={e => { setReason(e.target.value); setErr(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="txt-inp" placeholder="Ej: Pago a proveedor, depósito inicial…" />
          </div>
          {err && <div className="err-box">{err}</div>}
        </div>
        <div className="modal-ftr">
          <button className="btn-sec" onClick={onClose}>Cancelar</button>
          <button className={`btn-pri btn-pri--${type}`} onClick={handleSave} disabled={saving || !amount || !reason.trim()}>
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Close Shift Modal ─── */
interface CloseShiftModalProps {
  shift: ShiftSummary
  onClose: () => void
  onDone: () => void
}

function CloseShiftModal({ shift, onClose, onDone }: CloseShiftModalProps) {
  const supabase = createClient()
  const [closing, setClosing] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const expectedCash = Number(shift.opening_amount) + Number(shift.cash_sales) +
    Number(shift.cash_in) - Number(shift.cash_out)
  const closingNum = parseFloat(closing) || 0
  const diff = closingNum - expectedCash

  async function handleClose() {
    setSaving(true); setErr(null)
    const { error } = await supabase
      .from('shifts')
      .update({
        status: 'closed',
        closing_amount: closingNum,
        expected_cash: expectedCash,
        cash_difference: diff,
        notes: notes.trim() || null,
        closed_at: new Date().toISOString(),
      })
      .eq('id', shift.shift_id)
      .select('id')
    if (error) { setErr(error.message); setSaving(false); return }
    onDone()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box modal-box--wide" onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <span className="modal-ttl">Cerrar turno</span>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Resumen del turno */}
          <div className="close-summary">
            <div className="close-row">
              <span className="close-lbl">Ventas totales</span>
              <span className="close-val accent">{fmt(shift.total_sales)}</span>
            </div>
            <div className="close-row">
              <span className="close-lbl">Efectivo en ventas</span>
              <span className="close-val">{fmt(shift.cash_sales)}</span>
            </div>
            <div className="close-row">
              <span className="close-lbl">Tarjeta</span>
              <span className="close-val">{fmt(shift.card_sales)}</span>
            </div>
            {Number(shift.credit_sales) > 0 && (
              <div className="close-row">
                <span className="close-lbl">Crédito</span>
                <span className="close-val">{fmt(shift.credit_sales)}</span>
              </div>
            )}
            {Number(shift.cash_in) > 0 && (
              <div className="close-row">
                <span className="close-lbl">Entradas manuales</span>
                <span className="close-val ok">+{fmt(shift.cash_in)}</span>
              </div>
            )}
            {Number(shift.cash_out) > 0 && (
              <div className="close-row">
                <span className="close-lbl">Salidas manuales</span>
                <span className="close-val danger">−{fmt(shift.cash_out)}</span>
              </div>
            )}
            <div className="close-divider" />
            <div className="close-row close-row--bold">
              <span className="close-lbl">Efectivo esperado en caja</span>
              <span className="close-val accent">{fmt(expectedCash)}</span>
            </div>
          </div>

          {/* Conteo físico */}
          <div className="fld">
            <label className="lbl">Efectivo contado físicamente</label>
            <div className="amt-wrap">
              <span className="amt-pre">$</span>
              <input autoFocus type="number" min="0" step="0.01" value={closing}
                onChange={e => setClosing(e.target.value)}
                className="amt-inp" placeholder="0.00" />
            </div>
          </div>

          {/* Diferencia */}
          {closing.trim() !== '' && (
            <div className={`diff-box ${Math.abs(diff) < 0.01 ? 'diff-box--ok' : diff > 0 ? 'diff-box--over' : 'diff-box--short'}`}>
              <span>{Math.abs(diff) < 0.01 ? 'Sin diferencia ✓' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
              <strong>{Math.abs(diff) < 0.01 ? '' : fmt(Math.abs(diff))}</strong>
            </div>
          )}

          <div className="fld">
            <label className="lbl">Notas <span className="opt">(opcional)</span></label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="txt-inp" placeholder="Observaciones del turno…" />
          </div>

          {err && <div className="err-box">{err}</div>}
        </div>
        <div className="modal-ftr">
          <button className="btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn-pri btn-pri--danger" onClick={handleClose} disabled={saving || !closing.trim()}>
            {saving ? 'Cerrando…' : 'Confirmar cierre de turno'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main page ─── */
export default function TurnosPage() {
  const supabase = createClient()
  const { user, profile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [openShift, setOpenShift] = useState<ShiftSummary | null>(null)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [closedShifts, setClosedShifts] = useState<(Shift & { cashier_name?: string })[]>([])

  // Open shift form
  const [openingAmount, setOpeningAmount] = useState('')
  const [openingShift, setOpeningShift] = useState(false)
  const [openErr, setOpenErr] = useState<string | null>(null)

  // Modals
  const [showMovement, setShowMovement] = useState<'in' | 'out' | null>(null)
  const [showClose, setShowClose] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    // Buscar turno abierto
    const { data: summary } = await supabase
      .from('shift_summary')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (summary) {
      setOpenShift(summary as ShiftSummary)
      // Cargar movimientos del turno
      const { data: movs } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('shift_id', summary.shift_id)
        .order('created_at', { ascending: false })
      setMovements((movs as CashMovement[]) ?? [])
    } else {
      setOpenShift(null)
      setMovements([])
    }

    // Cargar últimos turnos cerrados
    const { data: closed } = await supabase
      .from('shifts')
      .select('*, cashier:profiles(name)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(10)
    setClosedShifts((closed ?? []).map((s: Record<string, unknown>) => ({
      ...(s as unknown as Shift),
      cashier_name: (s.cashier as { name?: string } | null)?.name,
    })))

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  async function handleOpenShift() {
    const n = parseFloat(openingAmount) || 0
    setOpeningShift(true); setOpenErr(null)
    const { error } = await supabase.from('shifts').insert({
      cashier_id: user?.id,
      opening_amount: n,
      status: 'open',
    })
    if (error) { setOpenErr(error.message); setOpeningShift(false); return }
    setOpeningAmount('')
    loadData()
    setOpeningShift(false)
  }

  function handleMovementDone(mov: CashMovement) {
    setMovements(prev => [mov, ...prev])
    setShowMovement(null)
    loadData() // reload summary
  }

  function handleShiftClosed() {
    setShowClose(false)
    loadData()
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span>Cargando turno…</span>
      </div>
    )
  }

  return (
    <div className="turnos-page">
      {/* Modals */}
      {showMovement && openShift && user && (
        <MovementModal
          shiftId={openShift.shift_id}
          userId={user.id}
          defaultType={showMovement}
          onClose={() => setShowMovement(null)}
          onDone={handleMovementDone}
        />
      )}
      {showClose && openShift && (
        <CloseShiftModal
          shift={openShift}
          onClose={() => setShowClose(false)}
          onDone={handleShiftClosed}
        />
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Turnos / Caja</h1>
          <p className="page-sub">Control de apertura, movimientos y corte de caja</p>
        </div>
      </div>

      <div className="page-body">
        {!openShift ? (
          /* ── SIN TURNO ABIERTO ── */
          <div className="no-shift-wrap">
            <div className="no-shift-card">
              <div className="no-shift-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
              </div>
              <h2 className="no-shift-title">No hay turno abierto</h2>
              <p className="no-shift-sub">Abre un turno para empezar a registrar ventas y movimientos de caja.</p>

              <div className="open-form">
                <div className="fld">
                  <label className="lbl">Fondo inicial de caja</label>
                  <div className="amt-wrap">
                    <span className="amt-pre">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={openingAmount}
                      onChange={e => { setOpeningAmount(e.target.value); setOpenErr(null) }}
                      onKeyDown={e => e.key === 'Enter' && handleOpenShift()}
                      className="amt-inp" placeholder="0.00" autoFocus
                    />
                  </div>
                </div>
                {openErr && <div className="err-box">{openErr}</div>}
                <button className="btn-open" onClick={handleOpenShift} disabled={openingShift}>
                  {openingShift ? 'Abriendo…' : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                      </svg>
                      Abrir turno
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Últimos turnos */}
            {closedShifts.length > 0 && (
              <div className="history-section">
                <h3 className="history-title">Últimos turnos</h3>
                <div className="history-list">
                  {closedShifts.map(s => (
                    <div key={s.id} className="history-item">
                      <div className="history-left">
                        <span className="history-date">
                          {new Date(s.opened_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </span>
                        <span className="history-cashier">{s.cashier_name ?? '—'}</span>
                      </div>
                      <div className="history-right">
                        <span className="history-time">
                          {new Date(s.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {' → '}
                          {s.closed_at ? new Date(s.closed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                        {s.cash_difference !== null && (
                          <span className={`history-diff ${Number(s.cash_difference) > 0.01 ? 'ok' : Number(s.cash_difference) < -0.01 ? 'danger' : 'muted'}`}>
                            {Number(s.cash_difference) >= 0 ? '+' : ''}{fmt(s.cash_difference ?? 0)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── TURNO ABIERTO ── */
          <div className="shift-wrap">
            {/* Shift header */}
            <div className="shift-banner">
              <div className="shift-status-dot" />
              <div className="shift-info">
                <span className="shift-info-label">Turno abierto</span>
                <span className="shift-info-sub">
                  {openShift.cashier_name} · {new Date(openShift.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {timeAgo(openShift.opened_at)}
                </span>
              </div>
              <button className="btn-close-shift" onClick={() => setShowClose(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                Cerrar turno
              </button>
            </div>

            {/* Stats */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-lbl">Fondo inicial</span>
                <span className="stat-val">{fmt(openShift.opening_amount)}</span>
              </div>
              <div className="stat-card stat-card--accent">
                <span className="stat-lbl">Total ventas</span>
                <span className="stat-val">{fmt(openShift.total_sales)}</span>
                <span className="stat-sub">{openShift.num_transactions} transacciones</span>
              </div>
              <div className="stat-card">
                <span className="stat-lbl">Efectivo</span>
                <span className="stat-val ok">{fmt(openShift.cash_sales)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-lbl">Tarjeta</span>
                <span className="stat-val" style={{ color: '#3B82F6' }}>{fmt(openShift.card_sales)}</span>
              </div>
              {Number(openShift.credit_sales) > 0 && (
                <div className="stat-card">
                  <span className="stat-lbl">Crédito</span>
                  <span className="stat-val accent">{fmt(openShift.credit_sales)}</span>
                </div>
              )}
              <div className="stat-card">
                <span className="stat-lbl">Efectivo en caja</span>
                <span className="stat-val ok">
                  {fmt(Number(openShift.opening_amount) + Number(openShift.cash_sales) + Number(openShift.cash_in) - Number(openShift.cash_out))}
                </span>
                <span className="stat-sub">estimado</span>
              </div>
            </div>

            {/* Movimientos */}
            <div className="movements-section">
              <div className="movements-header">
                <h2 className="movements-title">Movimientos de efectivo</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-mov btn-mov--out" onClick={() => setShowMovement('out')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Salida
                  </button>
                  <button className="btn-mov btn-mov--in" onClick={() => setShowMovement('in')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Entrada
                  </button>
                </div>
              </div>

              {movements.length === 0 ? (
                <div className="movements-empty">Sin movimientos registrados en este turno</div>
              ) : (
                <div className="movements-list">
                  {movements.map(m => (
                    <div key={m.id} className="movement-item">
                      <div className={`mov-type-badge ${m.type === 'in' ? 'mov-type-badge--in' : 'mov-type-badge--out'}`}>
                        {m.type === 'in' ? '+' : '−'}
                      </div>
                      <div className="mov-info">
                        <span className="mov-reason">{m.reason}</span>
                        <span className="mov-time">
                          {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className={`mov-amount ${m.type === 'in' ? 'ok' : 'danger'}`}>
                        {m.type === 'in' ? '+' : '−'}{fmt(m.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .turnos-page {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .page-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 100%;
          color: var(--text-muted);
          font-size: 14px;
        }

        .page-header {
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .page-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 4px;
        }

        .page-sub { font-size: 12px; color: var(--text-muted); margin: 0; }

        .page-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        /* ── No shift ── */
        .no-shift-wrap {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 520px;
          margin: 0 auto;
        }

        .no-shift-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
        }

        .no-shift-icon {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-glow);
          border: 1px solid rgba(240,180,41,0.2);
          border-radius: 16px;
          color: var(--accent);
          margin-bottom: 4px;
        }

        .no-shift-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 18px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0;
        }

        .no-shift-sub {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.5;
        }

        .open-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }

        .btn-open {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 24px;
          background: var(--accent);
          border: none;
          border-radius: 10px;
          font-family: var(--font-syne, sans-serif);
          font-size: 14px;
          font-weight: 700;
          color: #0D0D12;
          cursor: pointer;
          transition: all 0.15s;
          width: 100%;
        }
        .btn-open:hover:not(:disabled) { background: #F5C233; transform: translateY(-1px); }
        .btn-open:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── History ── */
        .history-section { }
        .history-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-secondary);
          margin: 0 0 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .history-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 14px;
        }

        .history-left { display: flex; flex-direction: column; gap: 2px; }
        .history-date { font-size: 13px; color: var(--text-primary); font-weight: 500; }
        .history-cashier { font-size: 11px; color: var(--text-muted); }

        .history-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .history-time { font-size: 11px; color: var(--text-muted); }
        .history-diff { font-family: var(--font-jetbrains, monospace); font-size: 12px; font-weight: 600; }

        /* ── Open shift ── */
        .shift-wrap {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 720px;
        }

        .shift-banner {
          display: flex;
          align-items: center;
          gap: 14px;
          background: var(--bg-card);
          border: 1px solid rgba(34,197,94,0.25);
          border-radius: 12px;
          padding: 16px 20px;
        }

        .shift-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--success, #22C55E);
          box-shadow: 0 0 8px rgba(34,197,94,0.5);
          flex-shrink: 0;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .shift-info { flex: 1; }
        .shift-info-label { display: block; font-size: 13px; font-weight: 600; color: var(--success, #22C55E); }
        .shift-info-sub { font-size: 12px; color: var(--text-muted); }

        .btn-close-shift {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          background: transparent;
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--danger, #EF4444);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn-close-shift:hover { background: rgba(239,68,68,0.1); border-color: var(--danger, #EF4444); }

        /* Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }

        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-card--accent { border-color: rgba(240,180,41,0.25); background: rgba(240,180,41,0.04); }

        .stat-lbl { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .stat-val { font-family: var(--font-jetbrains, monospace); font-size: 20px; font-weight: 700; color: var(--text-primary); }
        .stat-sub { font-size: 10px; color: var(--text-muted); }

        /* Movements */
        .movements-section {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }

        .movements-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
        }

        .movements-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .btn-mov {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          border: 1px solid;
        }

        .btn-mov--in { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); color: var(--success, #22C55E); }
        .btn-mov--in:hover { background: rgba(34,197,94,0.2); }
        .btn-mov--out { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: var(--danger, #EF4444); }
        .btn-mov--out:hover { background: rgba(239,68,68,0.2); }

        .movements-empty {
          padding: 24px;
          text-align: center;
          font-size: 13px;
          color: var(--text-muted);
        }

        .movements-list { padding: 8px 0; }

        .movement-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.1s;
        }
        .movement-item:last-child { border-bottom: none; }
        .movement-item:hover { background: var(--bg-hover); }

        .mov-type-badge {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .mov-type-badge--in { background: rgba(34,197,94,0.12); color: var(--success, #22C55E); }
        .mov-type-badge--out { background: rgba(239,68,68,0.12); color: var(--danger, #EF4444); }

        .mov-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .mov-reason { font-size: 13px; color: var(--text-primary); }
        .mov-time { font-size: 11px; color: var(--text-muted); }

        .mov-amount { font-family: var(--font-jetbrains, monospace); font-size: 14px; font-weight: 700; }

        /* ── Shared utilities ── */
        .accent { color: var(--accent); }
        .ok { color: var(--success, #22C55E); }
        .danger { color: var(--danger, #EF4444); }
        .muted { color: var(--text-muted); }

        /* ── Modals ── */
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 300;
          padding: 20px;
        }

        .modal-box {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
          overflow: hidden;
        }

        .modal-box--wide { max-width: 480px; }

        .modal-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px;
          border-bottom: 1px solid var(--border);
        }

        .modal-ttl {
          font-family: var(--font-syne, sans-serif);
          font-size: 15px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .x-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 16px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.15s;
        }
        .x-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

        .modal-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .modal-ftr {
          display: flex;
          gap: 10px;
          padding: 0 20px 20px;
        }

        /* Form elements */
        .fld { display: flex; flex-direction: column; gap: 6px; }

        .lbl {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .req { color: var(--danger, #EF4444); }
        .opt { font-weight: 400; color: var(--text-muted); text-transform: none; }

        .amt-wrap {
          display: flex;
          align-items: center;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          transition: border-color 0.15s;
        }
        .amt-wrap:focus-within { border-color: var(--accent); }

        .amt-pre {
          padding: 0 12px;
          font-family: var(--font-jetbrains, monospace);
          font-size: 16px;
          color: var(--text-muted);
          border-right: 1px solid var(--border);
        }

        .amt-inp {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 12px;
          font-family: var(--font-jetbrains, monospace);
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .txt-inp {
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
        }
        .txt-inp:focus { border-color: var(--accent); }
        .txt-inp::placeholder { color: var(--text-muted); }

        /* Segment control */
        .seg-ctrl {
          display: flex;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 3px;
          gap: 3px;
        }

        .seg-btn {
          flex: 1;
          padding: 8px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .seg-btn--in { background: rgba(34,197,94,0.15); color: var(--success, #22C55E); }
        .seg-btn--out { background: rgba(239,68,68,0.15); color: var(--danger, #EF4444); }

        /* Buttons */
        .btn-sec {
          flex: 1;
          padding: 10px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-sec:hover { background: var(--bg-hover); }

        .btn-pri {
          flex: 2;
          padding: 10px;
          border: none;
          border-radius: 8px;
          font-family: var(--font-syne, sans-serif);
          font-size: 13px;
          font-weight: 700;
          color: #0D0D12;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-pri--in { background: var(--success, #22C55E); }
        .btn-pri--out { background: var(--danger, #EF4444); color: #fff; }
        .btn-pri--danger { background: var(--danger, #EF4444); color: #fff; }
        .btn-pri:hover:not(:disabled) { opacity: 0.9; }
        .btn-pri:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Close shift */
        .close-summary {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .close-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
        }

        .close-row--bold .close-lbl,
        .close-row--bold .close-val { font-weight: 700; }

        .close-lbl { color: var(--text-secondary); }
        .close-val { font-family: var(--font-jetbrains, monospace); color: var(--text-primary); }

        .close-divider { border-top: 1px dashed var(--border); margin: 2px 0; }

        .diff-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
        }
        .diff-box strong { font-family: var(--font-jetbrains, monospace); font-size: 15px; font-weight: 700; }
        .diff-box--ok { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2); color: var(--success, #22C55E); }
        .diff-box--over { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.15); color: var(--success, #22C55E); }
        .diff-box--short { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: var(--danger, #EF4444); }

        /* Error */
        .err-box {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--danger, #EF4444);
        }

        /* Spinner */
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
