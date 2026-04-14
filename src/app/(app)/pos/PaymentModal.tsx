'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CartItem, Customer, Shift } from '@/types'
import { Receipt, printReceipt, type ReceiptData } from './Receipt'

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

  // ── Métodos ───────────────────────────────────────────────────────────────
  const [methods,    setMethods]    = useState<Set<Method>>(new Set(['cash']))
  const [cashAmount, setCashAmount] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState<ReceiptData | null>(null)

  // ── Cliente + monedero ────────────────────────────────────────────────────
  const [customerQuery,    setCustomerQuery]    = useState('')
  const [customerResults,  setCustomerResults]  = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [walletAmount,     setWalletAmount]     = useState('')

  // ── Búsqueda de clientes ──────────────────────────────────────────────────
  async function searchCustomers(q: string) {
    setCustomerQuery(q)
    if (q.trim().length < 2) { setCustomerResults([]); return }
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('customers')
      .select('*')
      .ilike('full_name', `%${q.trim()}%`)
      .limit(5)
    setCustomerResults((data ?? []) as Customer[])
  }

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustomerQuery(c.full_name)
    setCustomerResults([])
    setWalletAmount('')
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setCustomerQuery('')
    setCustomerResults([])
    setWalletAmount('')
  }

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const walletUse      = Math.min(parseFloat(walletAmount) || 0, selectedCustomer?.loyalty_balance ?? 0, total)
  const effectiveTotal = Math.max(0, total - walletUse)
  const walletOnly     = walletUse >= total

  const isMixed  = !walletOnly && methods.has('cash') && methods.has('card')
  const cashOnly = !walletOnly && methods.has('cash') && !methods.has('card')
  const cardOnly = !walletOnly && methods.has('card') && !methods.has('cash')

  const cashPaid = parseFloat(cashAmount) || 0
  const cardPaid = isMixed ? Math.max(0, effectiveTotal - cashPaid) : cardOnly ? effectiveTotal : 0
  const change   = cashOnly ? Math.max(0, cashPaid - effectiveTotal) : 0

  const canPay = (() => {
    if (walletOnly)          return true
    if (effectiveTotal <= 0) return true
    if (isMixed)  return cashPaid > 0 && cashPaid < effectiveTotal
    if (cashOnly) return cashPaid >= effectiveTotal
    if (cardOnly) return true
    return false
  })()

  function toggleMethod(m: Method) {
    if (walletOnly) return
    setMethods(prev => {
      if (prev.has(m) && prev.size === 1) return prev
      const next = new Set(prev)
      next.has(m) ? next.delete(m) : next.add(m)
      return next
    })
    setCashAmount('')
  }

  // ── Pagar ─────────────────────────────────────────────────────────────────
  async function handlePay() {
    if (!user || !canPay) return
    setProcessing(true)
    setError(null)

    const supabase = createClient()
    let saleId: string | null = null

    const paymentMethod  = walletOnly ? 'cash' : isMixed ? 'mixed' : cashOnly ? 'cash' : 'card'
    const amountPaid_db  = walletOnly ? total
      : isMixed   ? cashPaid + cardPaid + walletUse
      : cashOnly  ? cashPaid + walletUse
      : total   // cardOnly
    const changeGiven_db = cashOnly ? Math.max(0, cashPaid - effectiveTotal) : 0
    // 3% por cada $1,000 acumulado en compras (rastreo con loyalty_spent)
    const prevSpent      = selectedCustomer?.loyalty_spent ?? 0
    const milestones     = Math.floor((prevSpent + total) / 1000) - Math.floor(prevSpent / 1000)
    const loyaltyEarned  = selectedCustomer && milestones > 0 ? milestones * 1000 * 0.03 : 0

    try {
      // 1 — Insertar venta
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sale, error: saleErr } = await (supabase as any)
        .from('sales')
        .insert({
          shift_id:       activeShift.id,
          cashier_id:     user.id,
          customer_id:    selectedCustomer?.id ?? null,
          total,
          payment_method: paymentMethod,
          amount_paid:    amountPaid_db,
          change_given:   changeGiven_db,
          status:         'completed',
        })
        .select('id')
        .single()

      if (saleErr) throw new Error(`Error al registrar venta: ${saleErr.message}`)
      saleId = sale.id

      // 2 — Insertar items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: itemsErr } = await (supabase as any)
        .from('sale_items')
        .insert(
          cart.map(item => ({
            sale_id:    saleId,
            variant_id: item.variant.id,
            quantity:   item.quantity,
            unit_price: item.unitPrice,
            subtotal:   item.quantity * item.unitPrice,
          }))
        )

      if (itemsErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('sales').delete().eq('id', saleId)
        throw new Error(`Error al guardar productos: ${itemsErr.message}`)
      }

      // 3 — Decrementar stock (no-fatal)
      await Promise.allSettled(
        cart.map(item =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from('product_variants')
            .update({ stock: Math.max(0, item.variant.stock - item.quantity) })
            .eq('id', item.variant.id)
        )
      )

      // 4 — Actualizar monedero del cliente (no-fatal)
      if (selectedCustomer) {
        const newBalance = Math.max(0, selectedCustomer.loyalty_balance - walletUse + loyaltyEarned)
        const newSpent   = selectedCustomer.loyalty_spent + total
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('customers')
          .update({ loyalty_balance: newBalance, loyalty_spent: newSpent })
          .eq('id', selectedCustomer.id)
      }

      const receiptData: ReceiptData = {
        cart,
        total,
        paymentMethod,
        amountPaid:    amountPaid_db,
        change:        changeGiven_db,
        cashPaid:      methods.has('cash') && !walletOnly ? cashPaid : undefined,
        cardPaid:      methods.has('card') && !walletOnly ? cardPaid : undefined,
        walletPaid:    walletUse > 0 ? walletUse : undefined,
        loyaltyEarned: loyaltyEarned > 0 ? loyaltyEarned : undefined,
        date:          new Date(),
      }
      setSuccess(receiptData)

      if (typeof window !== 'undefined' && localStorage.getItem('pos_autoprint') === 'true') {
        printReceipt(receiptData)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar el pago.')
    } finally {
      setProcessing(false)
    }
  }

  // ── Pantalla de éxito ─────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.85)', overflowY: 'auto' }}>
        <div className="w-full rounded-2xl flex flex-col"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: '460px', margin: 'auto' }}>

          <div className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ background: '#0D2B0D', border: '2px solid #4CAF50' }}>
              ✓
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Venta registrada</p>
              <p className="text-xl font-black font-mono" style={{ color: 'var(--accent)' }}>
                {fmt(total)}
              </p>
              {success.loyaltyEarned && (
                <p className="text-xs mt-0.5" style={{ color: '#F0B429' }}>
                  +{fmt(success.loyaltyEarned)} ganados en monedero
                </p>
              )}
            </div>
          </div>

          <div className="p-4">
            <Receipt data={success} />
          </div>

          <div className="px-4 pb-4 flex gap-2">
            <button onClick={() => printReceipt(success)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              Imprimir
            </button>
            <button onClick={() => { onSuccess(); onClose() }}
              className="flex-1 py-3 rounded-xl text-sm font-bold"
              style={{ background: 'var(--accent)', color: '#000' }}
              autoFocus>
              Nueva venta
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Modal de pago ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
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

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* ── Cliente (opcional) ──────────────────────────────── */}
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Cliente (opcional)
            </p>
            {selectedCustomer ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {selectedCustomer.full_name}
                  </p>
                  {selectedCustomer.loyalty_balance > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: '#F0B429' }}>
                      Monedero: {fmt(selectedCustomer.loyalty_balance)} disponible
                    </p>
                  )}
                </div>
                <button onClick={clearCustomer}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs"
                  style={{ color: 'var(--text-muted)', background: 'var(--surface)' }}>
                  ✕
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={customerQuery}
                  onChange={e => searchCustomers(e.target.value)}
                  placeholder="Buscar cliente por nombre…"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    setTimeout(() => setCustomerResults([]), 150)
                  }}
                />
                {customerResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-10"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {customerResults.map(c => (
                      <button key={c.id}
                        onMouseDown={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2.5 text-sm"
                        style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                        <span className="font-semibold">{c.full_name}</span>
                        {c.loyalty_balance > 0 && (
                          <span className="text-xs ml-2" style={{ color: '#F0B429' }}>
                            {fmt(c.loyalty_balance)} monedero
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Monedero ────────────────────────────────────────── */}
          {selectedCustomer && selectedCustomer.loyalty_balance > 0 && (
            <div className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: '#1A1400', border: '1px solid #3D2E00' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color: '#F0B429' }}>Monedero electrónico</p>
                <span className="text-xs font-mono font-bold" style={{ color: '#F0B429' }}>
                  {fmt(selectedCustomer.loyalty_balance)} disp.
                </span>
              </div>
              <div className="flex gap-1.5">
                {[
                  { label: '25%', val: selectedCustomer.loyalty_balance * 0.25 },
                  { label: '50%', val: selectedCustomer.loyalty_balance * 0.5 },
                  { label: 'Todo', val: selectedCustomer.loyalty_balance },
                ].map(s => (
                  <button key={s.label}
                    onClick={() => setWalletAmount(Math.min(s.val, total).toFixed(2))}
                    className="flex-1 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: 'var(--bg)', color: '#F0B429', border: '1px solid #3D2E00' }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                  style={{ color: '#F0B429' }}>$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={walletAmount}
                  onChange={e => setWalletAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg pl-7 pr-3 py-2 text-sm outline-none font-mono"
                  style={{ background: 'var(--bg)', border: '1px solid #3D2E00', color: '#F0B429' }}
                />
              </div>
              {walletUse > 0 && (
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  Resta:{' '}
                  <strong style={{ color: effectiveTotal > 0 ? 'var(--text)' : '#4CAF50' }}>
                    {effectiveTotal > 0 ? fmt(effectiveTotal) : 'Cubierto ✓'}
                  </strong>
                </p>
              )}
            </div>
          )}

          {/* ── Métodos (solo si monedero no cubre todo) ─────────── */}
          {!walletOnly && effectiveTotal > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Método de pago {isMixed && <span style={{ color: 'var(--accent)' }}>— Mixto</span>}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['cash', 'card'] as Method[]).map(m => (
                  <button key={m} onClick={() => toggleMethod(m)}
                    className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: methods.has(m) ? 'var(--accent)' : 'var(--bg)',
                      color: methods.has(m) ? '#000' : 'var(--text-muted)',
                      border: `1px solid ${methods.has(m) ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    {m === 'cash' ? '💵 Efectivo' : '💳 Tarjeta'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Efectivo ─────────────────────────────────────────── */}
          {!walletOnly && methods.has('cash') && effectiveTotal > 0 && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                  {isMixed ? 'Monto en efectivo' : 'Monto recibido'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                    style={{ color: 'var(--text-muted)' }}>$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={cashAmount}
                    onChange={e => setCashAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus={!selectedCustomer}
                    className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              </div>

              {cashOnly && (
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setCashAmount(effectiveTotal.toFixed(2))}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: 'var(--bg)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                    Exacto
                  </button>
                  {QUICK_AMOUNTS.filter(a => a >= effectiveTotal).slice(0, 4).map(a => (
                    <button key={a} onClick={() => setCashAmount(String(a))}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {fmt(a)}
                    </button>
                  ))}
                </div>
              )}

              {isMixed && cashPaid > 0 && (
                <div className="flex justify-between items-center p-3 rounded-xl"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Resto en tarjeta
                  </span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--accent)' }}>
                    {fmt(cardPaid)}
                  </span>
                </div>
              )}

              {cashOnly && cashPaid > 0 && (
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

          {/* ── Solo tarjeta ─────────────────────────────────────── */}
          {!walletOnly && cardOnly && (
            <div className="p-4 rounded-xl text-center"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cobrar con terminal</p>
              <p className="text-2xl font-black mt-1 font-mono" style={{ color: 'var(--accent)' }}>
                {fmt(effectiveTotal)}
              </p>
            </div>
          )}

          {/* ── Monedero cubre todo ───────────────────────────────── */}
          {walletOnly && (
            <div className="p-4 rounded-xl text-center"
              style={{ background: '#1A1400', border: '1px solid #3D2E00' }}>
              <p className="text-xs" style={{ color: '#F0B429' }}>Cubierto con monedero</p>
              <p className="text-2xl font-black mt-1 font-mono" style={{ color: '#F0B429' }}>
                {fmt(total)}
              </p>
            </div>
          )}

          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

          <button
            onClick={handlePay}
            disabled={processing || !canPay}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}>
            {processing ? 'Procesando…' : `Cobrar ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
