'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Customer, CreditPayment } from '@/types'

type Method = 'cash' | 'card'

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  customer: Customer
  onClose: () => void
  onPaid: (customerId: string, newBalance: number) => void
}

export default function AbonoModal({ customer, onClose, onPaid }: Props) {
  const { user } = useAuth()
  const [amount,     setAmount]     = useState('')
  const [method,     setMethod]     = useState<Method>('cash')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [payments,   setPayments]   = useState<CreditPayment[]>([])

  const balance   = customer.credit_balance
  const limit     = customer.credit_limit
  const available = Math.max(0, limit - balance)
  const pct       = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0
  const barColor  = pct >= 80 ? '#FF6B6B' : pct >= 50 ? '#F0B429' : '#4CAF50'

  const amountNum = parseFloat(amount) || 0
  const canPay    = amountNum > 0 && amountNum <= balance

  useEffect(() => { loadPayments() }, [])

  async function loadPayments() {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('credit_payments')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(8)
    setPayments((data ?? []) as CreditPayment[])
  }

  async function handlePay() {
    if (!canPay || !user) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    try {
      // 1 — Registrar abono
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: payErr } = await (supabase as any)
        .from('credit_payments')
        .insert({
          customer_id:    customer.id,
          amount:         amountNum,
          payment_method: method,
          cashier_id:     user.id,
        })
      if (payErr) throw new Error(payErr.message)

      // 2 — Actualizar balance del cliente
      const newBalance = Math.max(0, balance - amountNum)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (supabase as any)
        .from('customers')
        .update({ credit_balance: newBalance })
        .eq('id', customer.id)
      if (updErr) throw new Error(updErr.message)

      onPaid(String(customer.id), newBalance)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al registrar abono')
      setSaving(false)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-base font-bold" style={{ color: 'var(--text)' }}>Abonar a crédito</p>
            <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>×</button>
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{customer.full_name}</p>

          {/* Estado de cuenta */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Deuda', value: fmt(balance), color: '#FF6B6B' },
              { label: 'Límite', value: fmt(limit), color: 'var(--text-muted)' },
              { label: 'Disponible', value: fmt(available), color: '#4CAF50' },
            ].map(s => (
              <div key={s.label} className="rounded-lg py-2 px-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Barra de progreso */}
          {limit > 0 && (
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: barColor }} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* Atajos */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Monto a abonar</p>
            <div className="flex gap-2 mb-2">
              {[
                { label: '25%', val: balance * 0.25 },
                { label: '50%', val: balance * 0.5 },
                { label: 'Todo', val: balance },
              ].map(s => (
                <button key={s.label}
                  onClick={() => setAmount(s.val.toFixed(2))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          </div>

          {/* Método */}
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'card'] as Method[]).map(m => (
              <button key={m} onClick={() => setMethod(m)}
                className="py-2 rounded-xl text-sm font-semibold"
                style={{
                  background: method === m ? 'var(--accent)' : 'var(--bg)',
                  color: method === m ? '#000' : 'var(--text-muted)',
                  border: `1px solid ${method === m ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                {m === 'cash' ? '💵 Efectivo' : '💳 Tarjeta'}
              </button>
            ))}
          </div>

          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

          <button onClick={handlePay} disabled={saving || !canPay}
            className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}>
            {saving ? 'Registrando…' : canPay ? `Registrar abono ${fmt(amountNum)}` : 'Registrar abono'}
          </button>

          {/* Historial reciente */}
          {payments.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Últimos abonos
              </p>
              <div className="flex flex-col gap-1.5">
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between items-center px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div>
                      <span className="text-xs font-semibold" style={{ color: '#4CAF50' }}>
                        {fmt(p.amount)}
                      </span>
                      <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                        {p.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(p.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
