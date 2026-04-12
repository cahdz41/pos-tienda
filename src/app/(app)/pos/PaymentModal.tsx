'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CartItem, Shift } from '@/types'

type Method = 'cash' | 'card'

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000]

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  cart: CartItem[]
  total: number
  activeShift: Shift
  onSuccess: () => void
  onClose: () => void
}

export default function PaymentModal({ cart, total, activeShift, onSuccess, onClose }: Props) {
  const { user } = useAuth()
  const [method, setMethod] = useState<Method>('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ change: number; method: Method } | null>(null)

  const paid = parseFloat(amountPaid) || 0
  const change = method === 'cash' ? paid - total : 0
  const canPay = method === 'card' || (method === 'cash' && paid >= total)

  async function handlePay() {
    if (!user || !canPay) return
    setProcessing(true)
    setError(null)

    const supabase = createClient()
    let saleId: string | null = null

    try {
      // 1 — Insertar venta
      const { data: sale, error: saleErr } = await supabase
        .from('sales')
        .insert({
          shift_id: activeShift.id,
          cashier_id: user.id,
          customer_id: null,
          total,
          payment_method: method,
          amount_paid: method === 'cash' ? paid : total,
          change_given: method === 'cash' ? Math.max(0, change) : 0,
          status: 'completed',
        })
        .select('id')
        .single()

      if (saleErr) throw new Error(`Error al registrar venta: ${saleErr.message}`)
      saleId = sale.id

      // 2 — Insertar items
      const { error: itemsErr } = await supabase
        .from('sale_items')
        .insert(
          cart.map(item => ({
            sale_id: saleId,
            variant_id: item.variant.id,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
          }))
        )

      if (itemsErr) {
        // Rollback: borrar la venta
        await supabase.from('sales').delete().eq('id', saleId)
        throw new Error(`Error al guardar productos: ${itemsErr.message}`)
      }

      // 3 — Decrementar stock (no-fatal: si falla, la venta ya quedó registrada)
      await Promise.allSettled(
        cart.map(item =>
          supabase
            .from('product_variants')
            .update({ stock: Math.max(0, item.variant.stock - item.quantity) })
            .eq('id', item.variant.id)
        )
      )

      setSuccess({ change: Math.max(0, change), method })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar el pago.')
    } finally {
      setProcessing(false)
    }
  }

  // ── Pantalla de éxito ───────────────────────────────────────────────────
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.85)' }}>
        <div className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{ background: '#0D2B0D', border: '2px solid #4CAF50' }}>
            ✓
          </div>

          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>Venta registrada</p>
            <p className="text-2xl font-black mt-1 font-mono" style={{ color: 'var(--accent)' }}>
              {fmt(total)}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {success.method === 'cash' ? 'Efectivo' : 'Tarjeta'}
            </p>
          </div>

          {success.method === 'cash' && success.change > 0 && (
            <div className="w-full rounded-xl p-4 text-center"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cambio a entregar</p>
              <p className="text-3xl font-black mt-1 font-mono" style={{ color: '#4CAF50' }}>
                {fmt(success.change)}
              </p>
            </div>
          )}

          <button
            onClick={() => { onSuccess(); onClose() }}
            className="w-full py-3 rounded-xl text-sm font-bold"
            style={{ background: 'var(--accent)', color: '#000' }}
            autoFocus
          >
            Nueva venta
          </button>
        </div>
      </div>
    )
  }

  // ── Modal de pago ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total a cobrar</p>
            <p className="text-2xl font-black font-mono" style={{ color: 'var(--accent)' }}>
              {fmt(total)}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Método de pago */}
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'card'] as Method[]).map(m => (
              <button key={m} onClick={() => { setMethod(m); setAmountPaid('') }}
                className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: method === m ? 'var(--accent)' : 'var(--bg)',
                  color: method === m ? '#000' : 'var(--text-muted)',
                  border: `1px solid ${method === m ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                {m === 'cash' ? '💵 Efectivo' : '💳 Tarjeta'}
              </button>
            ))}
          </div>

          {/* Efectivo */}
          {method === 'cash' && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  Monto recibido
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                    style={{ color: 'var(--text-muted)' }}>$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              </div>

              {/* Atajos */}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setAmountPaid(String(total))}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--bg)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                  Exacto
                </button>
                {QUICK_AMOUNTS.filter(a => a >= total).slice(0, 4).map(a => (
                  <button key={a} onClick={() => setAmountPaid(String(a))}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {fmt(a)}
                  </button>
                ))}
              </div>

              {/* Cambio */}
              {paid > 0 && (
                <div className="flex justify-between items-center p-3 rounded-xl"
                  style={{
                    background: change >= 0 ? '#0D2B0D' : '#2D1010',
                    border: `1px solid ${change >= 0 ? '#2D4A2D' : '#4D1A1A'}`,
                  }}>
                  <span className="text-sm font-semibold" style={{ color: change >= 0 ? '#4CAF50' : '#FF6B6B' }}>
                    {change >= 0 ? 'Cambio' : 'Faltan'}
                  </span>
                  <span className="text-lg font-black font-mono" style={{ color: change >= 0 ? '#4CAF50' : '#FF6B6B' }}>
                    {fmt(Math.abs(change))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tarjeta */}
          {method === 'card' && (
            <div className="p-4 rounded-xl text-center"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cobrar con terminal</p>
              <p className="text-2xl font-black mt-1 font-mono" style={{ color: 'var(--accent)' }}>
                {fmt(total)}
              </p>
            </div>
          )}

          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

          {/* Botón cobrar */}
          <button
            onClick={handlePay}
            disabled={processing || !canPay}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {processing ? 'Procesando…' : `Cobrar ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
