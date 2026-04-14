'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Customer } from '@/types'

interface TimelineEntry {
  id: string
  type: 'sale' | 'payment'
  amount: number
  date: string
  label: string
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  customer: Customer
  onClose: () => void
}

export default function HistorialModal({ customer, onClose }: Props) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    setLoading(true)
    const supabase = createClient()

    // Compras a crédito
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sales } = await (supabase as any)
      .from('sales')
      .select('id, total, created_at, payment_method')
      .eq('customer_id', customer.id)
      .eq('payment_method', 'credit')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(30)

    // Abonos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: payments } = await (supabase as any)
      .from('credit_payments')
      .select('id, amount, payment_method, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(30)

    // Combinar y ordenar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const salesEntries: TimelineEntry[] = (sales ?? []).map((s: any) => ({
      id:     `s-${s.id}`,
      type:   'sale' as const,
      amount: s.total,
      date:   s.created_at,
      label:  'Compra a crédito',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentEntries: TimelineEntry[] = (payments ?? []).map((p: any) => ({
      id:     `p-${p.id}`,
      type:   'payment' as const,
      amount: p.amount,
      date:   p.created_at,
      label:  p.payment_method === 'cash' ? 'Abono — Efectivo' : 'Abono — Tarjeta',
    }))

    const all = [...salesEntries, ...paymentEntries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    setTimeline(all)
    setLoading(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const totalCompras = timeline.filter(e => e.type === 'sale').reduce((s, e) => s + e.amount, 0)
  const totalAbonos  = timeline.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--text)' }}>Estado de cuenta</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{customer.full_name}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        {/* Resumen */}
        <div className="px-5 py-3 shrink-0 grid grid-cols-3 gap-2"
          style={{ borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Total compras', value: fmt(totalCompras), color: '#FF6B6B' },
            { label: 'Total abonado', value: fmt(totalAbonos),  color: '#4CAF50' },
            { label: 'Saldo actual',  value: fmt(customer.credit_balance), color: 'var(--accent)' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <span style={{ fontSize: '28px' }}>📋</span>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin movimientos registrados</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {timeline.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  {/* Ícono */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                    style={{
                      background: entry.type === 'sale' ? '#2D1010' : '#0D2B0D',
                    }}>
                    {entry.type === 'sale' ? '🛒' : '✓'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{entry.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(entry.date)}</p>
                  </div>

                  {/* Monto */}
                  <span className="text-sm font-bold font-mono shrink-0"
                    style={{ color: entry.type === 'sale' ? '#FF6B6B' : '#4CAF50' }}>
                    {entry.type === 'sale' ? '+' : '−'}{fmt(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
