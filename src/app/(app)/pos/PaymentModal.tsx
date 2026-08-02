'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calculateCardSettlement } from '@/lib/financialAccounts'
import { useAuth } from '@/contexts/AuthContext'
import type { CartItem, Customer, Shift } from '@/types'
import { Receipt, printReceipt, type ReceiptData } from './Receipt'

type Method = 'cash' | 'card' | 'transfer' | 'credit'

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000]

const METHOD_CONFIG: Record<Method, { label: string; icon: string }> = {
  cash:     { label: 'Efectivo',      icon: '💵' },
  card:     { label: 'Tarjeta',       icon: '💳' },
  transfer: { label: 'Transferencia', icon: '🏦' },
  credit:   { label: 'Crédito',       icon: '📒' },
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  cart: CartItem[]
  total: number
  activeShift: Shift
  autoMode?: 'efectivo_exacto'
  onSuccess: () => void
  onClose: () => void
}

export default function PaymentModal({ cart, total, activeShift, autoMode, onSuccess, onClose }: Props) {
  const { user } = useAuth()

  // ── Métodos ───────────────────────────────────────────────────────────────
  const [mixedMode, setMixedMode]   = useState(false)
  const [methods, setMethods]       = useState<Set<Method>>(new Set(['cash']))
  const [cashAmount, setCashAmount] = useState('')
  const [cardAmount, setCardAmount] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState<ReceiptData | null>(null)
  const [autoPay, setAutoPay]       = useState(false)
  const [cardFeeRate, setCardFeeRate] = useState(0.0405)

  // ── Cliente + monedero ────────────────────────────────────────────────────
  const [customerQuery,    setCustomerQuery]    = useState('')
  const [customerResults,  setCustomerResults]  = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [walletAmount,     setWalletAmount]     = useState('')
  const [notes,            setNotes]            = useState('')

  async function searchCustomers(q: string) {
    setCustomerQuery(q)
    if (q.trim().length < 2) { setCustomerResults([]); return }
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('customers').select('*').ilike('full_name', `%${q.trim()}%`).limit(5)
    setCustomerResults((data ?? []) as Customer[])
  }

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c); setCustomerQuery(c.full_name)
    setCustomerResults([]); setWalletAmount('')
  }

  function clearCustomer() {
    setSelectedCustomer(null); setCustomerQuery('')
    setCustomerResults([]); setWalletAmount('')
  }

  // ── Toggles de método ─────────────────────────────────────────────────────
  function toggleMethod(m: Method) {
    if (walletOnly) return
    if (m === 'credit') {
      setMixedMode(false)
      setMethods(new Set(['credit']))
      setCashAmount(''); setCardAmount('')
      return
    }
    if (methods.has('credit')) {
      setMethods(new Set([m]))
      setCashAmount(''); setCardAmount('')
      return
    }
    if (!mixedMode) {
      setMethods(new Set([m]))
    } else {
      setMethods(prev => {
        if (prev.has(m) && prev.size === 1) return prev
        const next = new Set(prev)
        if (next.has(m)) next.delete(m)
        else next.add(m)
        return next
      })
    }
    setCashAmount(''); setCardAmount('')
  }

  function handleMixedToggle(enabled: boolean) {
    if (isCredit) return
    setMixedMode(enabled)
    if (!enabled) {
      const first = methods.values().next().value as Method
      setMethods(new Set([first]))
    }
    setCashAmount(''); setCardAmount('')
  }

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const isCredit       = methods.has('credit')
  const walletUse      = isCredit ? 0 : Math.min(parseFloat(walletAmount) || 0, selectedCustomer?.loyalty_balance ?? 0, total)
  const effectiveTotal = Math.max(0, total - walletUse)
  const walletOnly     = !isCredit && walletUse >= total

  const availableCredit = (selectedCustomer?.credit_limit ?? 0) - (selectedCustomer?.credit_balance ?? 0)

  const hasCash     = !isCredit && methods.has('cash')
  const hasCard     = !isCredit && methods.has('card')
  const hasTransfer = !isCredit && methods.has('transfer')
  const methodCount = methods.size
  const isMulti     = mixedMode && methodCount >= 2
  const isThreeWay  = mixedMode && methodCount === 3

  const cashInput = parseFloat(cashAmount) || 0
  const cardInput = parseFloat(cardAmount) || 0

  let cashFinal = 0, cardFinal = 0, transferFinal = 0

  if (!walletOnly && !isCredit && effectiveTotal > 0) {
    if (!isMulti) {
      if (hasCash)     cashFinal = cashInput
      if (hasCard)     cardFinal = effectiveTotal
      if (hasTransfer) transferFinal = effectiveTotal
    } else if (isThreeWay) {
      cashFinal     = cashInput
      cardFinal     = cardInput
      transferFinal = Math.max(0, effectiveTotal - cashFinal - cardFinal)
    } else if (hasCash && hasCard) {
      cashFinal = cashInput
      cardFinal = Math.max(0, effectiveTotal - cashFinal)
    } else if (hasCash && hasTransfer) {
      cashFinal     = cashInput
      transferFinal = Math.max(0, effectiveTotal - cashFinal)
    } else {
      cardFinal     = cashInput
      transferFinal = Math.max(0, effectiveTotal - cardFinal)
    }
  }

  const change = !isMulti && hasCash ? Math.max(0, cashFinal - effectiveTotal) : 0
  const cardSettlement = calculateCardSettlement(cardFinal, cardFeeRate)
  const mercadoPagoNet = Math.round((cardSettlement.net + transferFinal) * 100) / 100

  useEffect(() => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any)
      .from('financial_settings')
      .select('card_fee_rate')
      .eq('singleton', true)
      .maybeSingle()
      .then(({ data }: { data: { card_fee_rate?: number } | null }) => {
        if (data?.card_fee_rate != null) setCardFeeRate(Number(data.card_fee_rate))
      })
  }, [])

  const canPay = (() => {
    if (isCredit) return !!selectedCustomer && availableCredit >= total
    if (walletOnly || effectiveTotal <= 0) return true
    if (!isMulti) {
      if (hasCash) return cashFinal >= effectiveTotal
      return true
    }
    if (isThreeWay) return cashInput > 0 && cardInput > 0 && (cashInput + cardInput) < effectiveTotal
    return cashInput > 0 && cashInput < effectiveTotal
  })()

  const varInputLabel = hasCash ? 'Monto en efectivo' : 'Monto en tarjeta'
  const varInputPlaceholder = hasCash
    ? 'Ej: 200 (el resto va a ' + (hasCard ? 'tarjeta' : 'transferencia') + ')'
    : 'Ej: 300 (el resto va a transferencia)'

  // Auto mode: pre-fill efectivo exacto y ejecutar cobro
  useEffect(() => {
    if (autoMode !== 'efectivo_exacto' || total <= 0) return
    setMethods(new Set(['cash']))
    setMixedMode(false)
    setCashAmount(String(total))
    const t = setTimeout(() => setAutoPay(true), 500)
    return () => clearTimeout(t)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoPay || !canPay || processing) return
    setAutoPay(false)
    void handlePay()
  }, [autoPay, canPay, processing])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guardar venta ─────────────────────────────────────────────────────────
  async function handlePay() {
    if (!user || !canPay) return
    setProcessing(true); setError(null)

    const supabase = createClient()

    const dbMethod = isCredit    ? 'credit'
      : walletOnly ? 'cash'
      : isMulti    ? 'mixed'
      : hasCash    ? 'cash'
      : hasCard    ? 'card'
      : 'transfer'

    const amountPaid_db = isCredit   ? total
      : walletOnly ? total
      : isMulti    ? (cashFinal + cardFinal + transferFinal + walletUse)
      : hasCash    ? (cashFinal + walletUse)
      : total

    const changeGiven_db = !isCredit && !isMulti && hasCash ? Math.max(0, cashFinal - effectiveTotal) : 0

    const prevSpent     = selectedCustomer?.loyalty_spent ?? 0
    const milestones    = Math.floor((prevSpent + total) / 1000) - Math.floor(prevSpent / 1000)
    const loyaltyEarned = !isCredit && selectedCustomer && milestones > 0 ? milestones * 1000 * 0.03 : 0

    let saleId: string | null = null
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
          payment_method: dbMethod,
          amount_paid:    amountPaid_db,
          change_given:   changeGiven_db,
          status:         'completed',
          notes:          notes.trim() || null,
        })
        .select('id').single()

      if (saleErr) throw new Error(`Error al registrar venta: ${saleErr.message}`)
      saleId = sale.id

      // 2 — Insertar items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: itemsErr } = await (supabase as any)
        .from('sale_items')
        .insert(cart.map(item => ({
          sale_id:    saleId,
          variant_id: item.variant.id,
          quantity:   item.quantity,
          unit_price: item.unitPrice,
          subtotal:   item.quantity * item.unitPrice,
        })))

      if (itemsErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('sales').update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: 'Error al guardar los productos de la venta',
        }).eq('id', saleId)
        throw new Error(`Error al guardar productos: ${itemsErr.message}`)
      }

      // 3 — Registrar desglose de pagos. Es la fuente única de las cuentas.
      if (!isCredit) {
        const payRows: { sale_id: string; method: string; amount: number }[] = []
        if (walletUse > 0) payRows.push({ sale_id: saleId!, method: 'wallet', amount: walletUse })
        if (!walletOnly && effectiveTotal > 0) {
          if (isMulti) {
            if (cashFinal > 0)     payRows.push({ sale_id: saleId!, method: 'cash',     amount: cashFinal })
            if (cardFinal > 0)     payRows.push({ sale_id: saleId!, method: 'card',     amount: cardFinal })
            if (transferFinal > 0) payRows.push({ sale_id: saleId!, method: 'transfer', amount: transferFinal })
          } else {
            if (hasCash)     payRows.push({ sale_id: saleId!, method: 'cash',     amount: effectiveTotal })
            if (hasCard)     payRows.push({ sale_id: saleId!, method: 'card',     amount: effectiveTotal })
            if (hasTransfer) payRows.push({ sale_id: saleId!, method: 'transfer', amount: effectiveTotal })
          }
        }
        if (payRows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: paymentError } = await (supabase as any).from('sale_payments').insert(payRows)
          if (paymentError) {
            // Mantener auditoría y revertir cualquier asiento parcial vinculado.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from('sales').update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancel_reason: 'Error al registrar el desglose de pagos',
            }).eq('id', saleId)
            throw new Error(`Error al registrar el pago: ${paymentError.message}`)
          }
        }
      }

      // 4 — Decrementar stock (no-fatal)
      await Promise.allSettled(cart.map(item =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('product_variants')
          .update({ stock: Math.max(0, item.variant.stock - item.quantity) })
          .eq('id', item.variant.id)
      ))

      // 5 — Actualizar cliente
      if (selectedCustomer) {
        if (isCredit) {
          // Incrementar deuda de crédito (FATAL: debe actualizarse correctamente)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: creditErr } = await (supabase as any)
            .from('customers')
            .update({
              credit_balance: selectedCustomer.credit_balance + total,
              loyalty_spent:  selectedCustomer.loyalty_spent + total,
            })
            .eq('id', selectedCustomer.id)
          if (creditErr) throw new Error(`Error al actualizar línea de crédito: ${creditErr.message}`)
        } else {
          // Actualizar monedero (no-fatal)
          const newBalance = Math.max(0, selectedCustomer.loyalty_balance - walletUse + loyaltyEarned)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('customers')
            .update({ loyalty_balance: newBalance, loyalty_spent: selectedCustomer.loyalty_spent + total })
            .eq('id', selectedCustomer.id)
        }
      }

      const receiptData: ReceiptData = {
        cart, total,
        paymentMethod: dbMethod as ReceiptData['paymentMethod'],
        amountPaid:    amountPaid_db,
        change:        changeGiven_db,
        cashPaid:      cashFinal > 0 && isMulti ? cashFinal : undefined,
        cardPaid:      cardFinal > 0 && isMulti ? cardFinal : undefined,
        transferPaid:  transferFinal > 0 && isMulti ? transferFinal : undefined,
        walletPaid:    walletUse > 0 ? walletUse : undefined,
        loyaltyEarned: loyaltyEarned > 0 ? loyaltyEarned : undefined,
        notes:         notes.trim() || undefined,
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
              style={{ background: '#0D2B0D', border: '2px solid #4CAF50' }}>✓</div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                {success.paymentMethod === 'credit' ? 'Venta a crédito registrada' : 'Venta registrada'}
              </p>
              <p className="text-xl font-black font-mono" style={{ color: 'var(--accent)' }}>{fmt(total)}</p>
              {success.paymentMethod === 'credit' && selectedCustomer && (
                <p className="text-xs mt-0.5" style={{ color: '#FF6B6B' }}>
                  Nueva deuda: {fmt(selectedCustomer.credit_balance + total)} / {fmt(selectedCustomer.credit_limit)}
                </p>
              )}
              {success.loyaltyEarned && (
                <p className="text-xs mt-0.5" style={{ color: '#F0B429' }}>
                  +{fmt(success.loyaltyEarned)} ganados en monedero
                </p>
              )}
              {cardSettlement.gross > 0 && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Mercado Pago disponible: {fmt(mercadoPagoNet)} después de {fmt(cardSettlement.fee)} de comisión
                </p>
              )}
            </div>
          </div>

          <div className="p-4"><Receipt data={success} /></div>

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
            <p className="text-2xl font-black font-mono" style={{ color: 'var(--accent)' }}>{fmt(total)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* ── Cliente ──────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {isCredit ? 'Cliente (requerido)' : 'Cliente (opcional)'}
            </p>
            {selectedCustomer ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg)', border: `1px solid ${isCredit ? '#FF6B6B' : 'var(--accent)'}` }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{selectedCustomer.full_name}</p>
                  {isCredit ? (
                    <p className="text-xs mt-0.5" style={{ color: availableCredit >= total ? '#4CAF50' : '#FF6B6B' }}>
                      Crédito disponible: {fmt(availableCredit)} / {fmt(selectedCustomer.credit_limit)}
                    </p>
                  ) : selectedCustomer.loyalty_balance > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: '#F0B429' }}>
                      Monedero: {fmt(selectedCustomer.loyalty_balance)} disponible
                    </p>
                  )}
                </div>
                <button onClick={clearCustomer}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs"
                  style={{ color: 'var(--text-muted)', background: 'var(--surface)' }}>✕</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={customerQuery}
                  onChange={e => searchCustomers(e.target.value)}
                  placeholder="Buscar cliente por nombre…"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg)',
                    border: `1px solid ${isCredit ? '#FF6B6B55' : 'var(--border)'}`,
                    color: 'var(--text)',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = isCredit ? '#FF6B6B' : 'var(--accent)')}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = isCredit ? '#FF6B6B55' : 'var(--border)'
                    setTimeout(() => setCustomerResults([]), 150)
                  }}
                  autoFocus={isCredit}
                />
                {customerResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-10"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {customerResults.map(c => {
                      const avail = c.credit_limit - c.credit_balance
                      return (
                        <button key={c.id} onMouseDown={() => selectCustomer(c)}
                          className="w-full text-left px-3 py-2.5 text-sm"
                          style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                          <span className="font-semibold">{c.full_name}</span>
                          {isCredit ? (
                            <span className="text-xs ml-2" style={{ color: avail >= total ? '#4CAF50' : '#FF6B6B' }}>
                              {fmt(avail)} crédito disp.
                            </span>
                          ) : c.loyalty_balance > 0 && (
                            <span className="text-xs ml-2" style={{ color: '#F0B429' }}>
                              {fmt(c.loyalty_balance)} monedero
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Monedero (solo si no es crédito) ─────────────────── */}
          {!isCredit && selectedCustomer && selectedCustomer.loyalty_balance > 0 && (
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
                <input type="number" min="0" step="0.01"
                  value={walletAmount} onChange={e => setWalletAmount(e.target.value)}
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

          {/* ── Métodos de pago ──────────────────────────────────── */}
          {!walletOnly && (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Método de pago
                {isMulti && <span style={{ color: 'var(--accent)' }}> — Mixto ({methodCount})</span>}
              </p>

              {/* Botones de método — 2x2 */}
              <div className="grid grid-cols-2 gap-2">
                {(['cash', 'card', 'transfer', 'credit'] as Method[]).map(m => {
                  const active = methods.has(m)
                  const isCreditBtn = m === 'credit'
                  return (
                    <button key={m} onClick={() => toggleMethod(m)}
                      className="py-2.5 rounded-xl text-xs font-semibold transition-all flex flex-col items-center gap-1"
                      style={{
                        background: active
                          ? (isCreditBtn ? '#3D1010' : 'var(--accent)')
                          : 'var(--bg)',
                        color: active
                          ? (isCreditBtn ? '#FF6B6B' : '#000')
                          : 'var(--text-muted)',
                        border: `1px solid ${active
                          ? (isCreditBtn ? '#FF6B6B' : 'var(--accent)')
                          : 'var(--border)'}`,
                      }}>
                      <span className="text-base">{METHOD_CONFIG[m].icon}</span>
                      <span>{METHOD_CONFIG[m].label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Pago mixto — solo si no es crédito */}
              {!isCredit && (
                <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                  <div
                    onClick={() => handleMixedToggle(!mixedMode)}
                    className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: mixedMode ? 'var(--accent)' : 'var(--bg)',
                      border: `2px solid ${mixedMode ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {mixedMode && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-medium" style={{ color: mixedMode ? 'var(--text)' : 'var(--text-muted)' }}>
                    Pago mixto
                  </span>
                  {!mixedMode && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                      (2 o 3 métodos)
                    </span>
                  )}
                </label>
              )}
            </div>
          )}

          {/* ── Panel de crédito ─────────────────────────────────── */}
          {isCredit && selectedCustomer && (
            <div className="rounded-xl p-3 flex flex-col gap-1.5"
              style={{
                background: availableCredit >= total ? '#0D1A2B' : '#2D1010',
                border: `1px solid ${availableCredit >= total ? '#1A4A7A' : '#FF6B6B55'}`,
              }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Límite de crédito</span>
                <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{fmt(selectedCustomer.credit_limit)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Deuda actual</span>
                <span className="font-mono font-bold" style={{ color: '#FF6B6B' }}>{fmt(selectedCustomer.credit_balance)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Esta venta</span>
                <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>+{fmt(total)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1.5"
                style={{ borderTop: '1px solid var(--border)' }}>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>Disponible después</span>
                <span className="font-mono font-black"
                  style={{ color: availableCredit >= total ? '#4CAF50' : '#FF6B6B' }}>
                  {fmt(availableCredit - total)}
                </span>
              </div>
            </div>
          )}

          {isCredit && !selectedCustomer && (
            <div className="rounded-xl p-3 text-center"
              style={{ background: '#2D1010', border: '1px solid #FF6B6B55' }}>
              <p className="text-xs" style={{ color: '#FF6B6B' }}>
                Selecciona un cliente para continuar con crédito
              </p>
            </div>
          )}

          {/* ── Inputs de monto (solo si no es crédito) ──────────── */}
          {!isCredit && !walletOnly && effectiveTotal > 0 && (
            <>
              {(hasCash || (!hasCash && isMulti && !isThreeWay)) && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {isMulti ? varInputLabel : 'Monto recibido'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                      style={{ color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder={isMulti ? varInputPlaceholder : '0.00'}
                      autoFocus={!selectedCustomer}
                      className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>

                  {/* Quick amounts (solo en efectivo puro) */}
                  {!isMulti && hasCash && (
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
                </div>
              )}

              {/* Input tarjeta en 3 vías */}
              {isThreeWay && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Monto en tarjeta
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                      style={{ color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={cardAmount}
                      onChange={e => setCardAmount(e.target.value)}
                      placeholder="Ej: 200 (el resto va a transferencia)"
                      className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                </div>
              )}

              {/* Resumen mixto */}
              {isMulti && (cashInput > 0 || cardInput > 0) && (
                <div className="rounded-xl p-3 flex flex-col gap-1.5"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  {hasCash && cashFinal > 0 && (
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>💵 Efectivo</span>
                      <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{fmt(cashFinal)}</span>
                    </div>
                  )}
                  {hasCard && cardFinal > 0 && (
                    <>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>💳 Tarjeta</span>
                        <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{fmt(cardFinal)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>Comisión Mercado Pago ({(cardFeeRate * 100).toFixed(2)}%)</span>
                        <span className="font-mono" style={{ color: '#FFB74D' }}>−{fmt(cardSettlement.fee)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>Disponible en Mercado Pago</span>
                        <span className="font-mono font-bold" style={{ color: '#4CAF50' }}>{fmt(cardSettlement.net)}</span>
                      </div>
                    </>
                  )}
                  {hasTransfer && transferFinal > 0 && (
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>🏦 Transferencia</span>
                      <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{fmt(transferFinal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs pt-1.5"
                    style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>Total</span>
                    <span className="font-mono font-black"
                      style={{ color: (cashFinal + cardFinal + transferFinal) === effectiveTotal ? '#4CAF50' : 'var(--accent)' }}>
                      {fmt(cashFinal + cardFinal + transferFinal)}
                    </span>
                  </div>
                </div>
              )}

              {/* Cambio (solo efectivo puro) */}
              {!isMulti && hasCash && cashInput > 0 && (
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

              {/* Tarjeta o transferencia sola */}
              {!isMulti && !hasCash && (
                <div className="p-4 rounded-xl text-center"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {hasCard ? 'Cobrar con terminal' : 'Cobrar por transferencia'}
                  </p>
                  <p className="text-2xl font-black mt-1 font-mono" style={{ color: 'var(--accent)' }}>
                    {fmt(effectiveTotal)}
                  </p>
                  {hasCard && (
                    <div className="mt-3 pt-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border)' }}>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>Comisión {(cardFeeRate * 100).toFixed(2)}%</span>
                        <span className="font-mono" style={{ color: '#FFB74D' }}>−{fmt(cardSettlement.fee)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span style={{ color: 'var(--text-muted)' }}>Disponible en Mercado Pago</span>
                        <span className="font-mono" style={{ color: '#4CAF50' }}>{fmt(cardSettlement.net)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Monedero cubre todo ───────────────────────────────── */}
          {walletOnly && (
            <div className="p-4 rounded-xl text-center"
              style={{ background: '#1A1400', border: '1px solid #3D2E00' }}>
              <p className="text-xs" style={{ color: '#F0B429' }}>Cubierto con monedero</p>
              <p className="text-2xl font-black mt-1 font-mono" style={{ color: '#F0B429' }}>{fmt(total)}</p>
            </div>
          )}

          {/* Notas opcionales */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Notas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalles de la venta…"
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

          <button
            onClick={handlePay}
            disabled={processing || !canPay}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{
              background: isCredit ? '#3D1010' : 'var(--accent)',
              color: isCredit ? '#FF6B6B' : '#000',
              border: isCredit ? '1px solid #FF6B6B' : 'none',
            }}>
            {processing ? 'Procesando…' : isCredit ? `Registrar a crédito ${fmt(total)}` : `Cobrar ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
