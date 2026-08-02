'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { AccountMovement, FinancialSettings, MoneyAccountBalance } from '@/types'

function fmt(value: number) {
  return '$' + Number(value).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ENTRY_LABELS: Record<AccountMovement['entry_type'], string> = {
  sale: 'Venta',
  card_fee: 'Comisión Mercado Pago',
  cash_movement: 'Movimiento manual',
  credit_payment: 'Abono de cliente',
  transfer: 'Transferencia interna',
  adjustment: 'Ajuste',
}

export default function CuentasPage() {
  const { profile, loading: authLoading } = useAuth()
  const [accounts, setAccounts] = useState<MoneyAccountBalance[]>([])
  const [settings, setSettings] = useState<FinancialSettings | null>(null)
  const [movements, setMovements] = useState<AccountMovement[]>([])
  const [cashOpening, setCashOpening] = useState('')
  const [mpOpening, setMpOpening] = useState('')
  const [feePercentage, setFeePercentage] = useState('4.05')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (profile?.role !== 'owner') { setLoading(false); return }
    setLoading(true); setError(null)
    const supabase = createClient()
    // El proyecto aún no tiene tipos generados del esquema de Supabase.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    try {
      const [accountResult, settingResult, movementResult] = await Promise.all([
        db.from('money_account_balances').select('*').eq('is_active', true).order('display_order'),
        db.from('financial_settings').select('*').eq('singleton', true).single(),
        db.from('account_movements').select('*').order('occurred_at', { ascending: false }).limit(50),
      ])
      if (accountResult.error || settingResult.error || movementResult.error) {
        throw new Error('Falta aplicar la migración sql/control_cuentas_1b.sql en Supabase.')
      }

      const loadedSettings = settingResult.data as FinancialSettings
      setAccounts((accountResult.data ?? []) as MoneyAccountBalance[])
      setSettings(loadedSettings)
      setMovements((movementResult.data ?? []) as AccountMovement[])
      setFeePercentage((Number(loadedSettings.card_fee_rate) * 100).toFixed(2))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron consultar las cuentas.')
    } finally {
      setLoading(false)
    }
  }, [profile?.role])

  useEffect(() => {
    if (!authLoading) void loadData()
  }, [authLoading, loadData])

  async function initializeAccounts(e: React.FormEvent) {
    e.preventDefault()
    const cash = Number(cashOpening)
    const mercadoPago = Number(mpOpening)
    if (!Number.isFinite(cash) || cash < 0 || !Number.isFinite(mercadoPago) || mercadoPago < 0) return

    setSaving(true); setError(null); setNotice(null)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: initializeError } = await (supabase as any).rpc('initialize_money_accounts', {
      p_cash_balance: cash,
      p_mercado_pago_balance: mercadoPago,
    })
    if (initializeError) {
      setError(initializeError.message ?? 'No se pudieron inicializar las cuentas.')
      setSaving(false)
      return
    }
    setNotice('Cuentas inicializadas. Desde este momento los movimientos se registran automáticamente.')
    await loadData()
    setSaving(false)
  }

  async function saveFee(e: React.FormEvent) {
    e.preventDefault()
    const percentage = Number(feePercentage)
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 20) return
    setSaving(true); setError(null); setNotice(null)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: feeError } = await (supabase as any).rpc('set_card_fee_percentage', {
      p_percentage: percentage,
    })
    if (feeError) {
      setError(feeError.message ?? 'No se pudo guardar la comisión.')
    } else {
      setNotice(`Comisión de tarjeta actualizada a ${percentage.toFixed(2)}%.`)
      await loadData()
    }
    setSaving(false)
  }

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (profile?.role !== 'owner') {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Solo el propietario puede consultar las cuentas.</p>
      </div>
    )
  }

  if (error && !settings) {
    return (
      <div className="flex-1 p-6">
        <div className="max-w-xl rounded-xl p-4" style={{ background: '#2D1010', border: '1px solid #4D1A1A' }}>
          <p className="text-sm font-semibold" style={{ color: '#FF6B6B' }}>{error}</p>
        </div>
      </div>
    )
  }

  const initialized = Boolean(settings?.ledger_started_at)
  const cashAccount = accounts.find(account => account.code === 'cash')
  const mpAccount = accounts.find(account => account.code === 'mercado_pago')
  const totalAvailable = accounts.reduce((sum, account) => sum + Number(account.balance), 0)

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Cuentas de dinero</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Caja de tienda y Mercado Pago
            </p>
          </div>
          {initialized && (
            <button onClick={() => void loadData()} className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Actualizar saldos
            </button>
          )}
        </div>

        {notice && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: '#0D2B0D', color: '#4CAF50', border: '1px solid #275827' }}>
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
            {error}
          </div>
        )}

        {!initialized ? (
          <form onSubmit={initializeAccounts} className="rounded-2xl p-5 flex flex-col gap-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Establecer saldos iniciales</h2>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Captura lo que existe realmente en este momento. Esta operación se realiza una sola vez;
                no se reconstruirán ventas o movimientos anteriores.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Efectivo real en Caja
                </label>
                <input required type="number" min="0" step="0.01" value={cashOpening}
                  onChange={event => setCashOpening(event.target.value)} placeholder="0.00"
                  className="w-full rounded-lg px-3 py-3 text-sm font-mono outline-none"
                  style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Saldo disponible en Mercado Pago
                </label>
                <input required type="number" min="0" step="0.01" value={mpOpening}
                  onChange={event => setMpOpening(event.target.value)} placeholder="0.00"
                  className="w-full rounded-lg px-3 py-3 text-sm font-mono outline-none"
                  style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>
            </div>
            <div className="rounded-xl px-4 py-3 text-xs leading-relaxed"
              style={{ background: '#2B2410', color: '#FFD166', border: '1px solid #5A4814' }}>
              Antes de continuar, verifica ambos importes directamente. Las ventas nuevas comenzarán a mover estos saldos.
            </div>
            <button type="submit" disabled={saving || cashOpening === '' || mpOpening === ''}
              className="w-full sm:w-auto sm:self-end px-5 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#000' }}>
              {saving ? 'Inicializando…' : 'Confirmar saldos e iniciar control'}
            </button>
          </form>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: 'Caja de tienda', value: cashAccount?.balance ?? 0, icon: '💵', color: '#4CAF50' },
                { label: 'Mercado Pago', value: mpAccount?.balance ?? 0, icon: '💳', color: 'var(--accent)' },
                { label: 'Dinero total', value: totalAvailable, icon: '💰', color: '#FFFFFF' },
              ].map(card => (
                <div key={card.label} className="rounded-2xl p-4"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span>{card.icon}</span>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.label}</p>
                  </div>
                  <p className="text-2xl font-black font-mono mt-2" style={{ color: card.color }}>
                    {fmt(card.value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
              <form onSubmit={saveFee} className="rounded-2xl p-4 h-fit"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Comisión de tarjeta</h2>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Solo se descuenta de cobros con tarjeta. Las transferencias entran completas.
                </p>
                <div className="relative mt-4">
                  <input type="number" min="0" max="20" step="0.01" value={feePercentage}
                    onChange={event => setFeePercentage(event.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 pr-9 text-sm font-mono outline-none"
                    style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>%</span>
                </div>
                <button type="submit" disabled={saving || feePercentage === ''}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  Guardar comisión
                </button>
              </form>

              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Movimientos recientes</h2>
                </div>
                {movements.length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>
                    Todavía no hay movimientos posteriores a la inicialización.
                  </p>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {movements.map(movement => {
                      const account = accounts.find(item => item.id === movement.account_id)
                      return (
                        <div key={movement.id} className="px-4 py-3 flex items-start justify-between gap-4"
                          style={{ opacity: movement.status === 'cancelled' ? 0.5 : 1 }}>
                          <div className="min-w-0">
                            <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{movement.description}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {ENTRY_LABELS[movement.entry_type]} · {account?.name ?? 'Cuenta'} · {formatTime(movement.occurred_at)}
                            </p>
                          </div>
                          <span className="text-sm font-bold font-mono shrink-0"
                            style={{ color: movement.direction === 'in' ? '#4CAF50' : '#FF6B6B' }}>
                            {movement.direction === 'in' ? '+' : '−'}{fmt(movement.amount)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
