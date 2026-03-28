'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOffline } from '@/contexts/OfflineContext'
import { syncEngine } from '@/lib/sync'
import type { QueueEntry } from '@/lib/db'
import type { CartItem, Customer, SalePaymentMethod } from '@/types'
import type { SaleReceipt } from './Receipt'

interface Props {
  cart: CartItem[]
  total: number
  onClose: () => void
  onSuccess: (receipt: SaleReceipt) => void
}

const fmt = (n: number) => `$${n.toFixed(2)}`

const METHOD_CONFIG: Array<{ id: SalePaymentMethod; label: string; color: string }> = [
  { id: 'cash',     label: 'Efectivo',      color: 'var(--success, #22C55E)' },
  { id: 'card',     label: 'Tarjeta',        color: '#3B82F6' },
  { id: 'transfer', label: 'Transferencia',  color: '#8B5CF6' },
  { id: 'wallet',   label: 'Monedero',       color: 'var(--accent)' },
  { id: 'credit',   label: 'Crédito',        color: '#818CF8' },
]

// Use a plain object instead of Set for React-friendly state updates
type ActiveMethods = Partial<Record<SalePaymentMethod, boolean>>
type Amounts = Record<SalePaymentMethod, string>

export default function PaymentModal({ cart, total, onClose, onSuccess }: Props) {
  const { user, profile } = useAuth()
  const { isOnline, refreshQueue } = useOffline()
  const supabase = createClient()

  // Customer search
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Payment methods — plain object, no Set (avoids React stale-reference issues)
  const [active, setActive] = useState<ActiveMethods>({ cash: true })
  const [amounts, setAmounts] = useState<Amounts>({ cash: '', card: '', transfer: '', wallet: '', credit: '' })

  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null)

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !processing) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, processing])

  // Load active shift
  useEffect(() => {
    supabase.from('shifts').select('id').eq('status', 'open')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => { if (data) setActiveShiftId(data.id) })
  }, [supabase])

  // Search customers by WhatsApp or name
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    const q = customerQuery.trim()
    if (!q) { setCustomerResults([]); return }
    searchRef.current = setTimeout(async () => {
      let result = await supabase.from('customers').select('*')
        .eq('active', true)
        .or(`whatsapp.ilike.%${q}%,name.ilike.%${q}%`)
        .order('name').limit(8)
      if (result.error) {
        result = await supabase.from('customers').select('*')
          .eq('active', true).ilike('name', `%${q}%`).order('name').limit(8)
      }
      const results = (result.data as Customer[]) ?? []
      setCustomerResults(results)
      if (results.length === 1) {
        setCustomer(results[0])
        setCustomerQuery('')
        setCustomerResults([])
      }
    }, 300)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [customerQuery, supabase])

  // When customer changes: auto-activate wallet if they have balance, remove if not
  useEffect(() => {
    const bal = customer?.loyalty_balance ?? 0
    if (bal > 0) {
      // Auto-activate wallet and pre-fill with min(balance, total)
      setActive(prev => {
        const next = { ...prev }
        delete next.credit // credit is exclusive, clear it
        next.wallet = true
        return next
      })
      setAmounts(prev => ({ ...prev, wallet: Math.min(bal, total).toFixed(2), credit: '' }))
    } else {
      // Remove wallet if customer has no balance
      setActive(prev => { const next = { ...prev }; delete next.wallet; return next })
      setAmounts(prev => ({ ...prev, wallet: '' }))
    }
  }, [customer, total])

  // Derived list of active method IDs (stable for the render)
  const activeMethods = (Object.keys(active) as SalePaymentMethod[]).filter(k => !!active[k])

  function toggleMethod(m: SalePaymentMethod) {
    // Credit is exclusive: toggling it on clears everything else; toggling off resets to cash
    if (m === 'credit') {
      if (active.credit) {
        setActive({ cash: true })
        setAmounts(prev => ({ ...prev, credit: '' }))
      } else {
        setActive({ credit: true })
        setAmounts(prev => ({ ...prev, credit: total.toFixed(2) }))
      }
      return
    }

    const isCurrentlyActive = !!active[m]
    // Can't deactivate the only active method
    if (isCurrentlyActive && activeMethods.length <= 1) return

    setActive(prev => {
      const next = { ...prev }
      // If credit was active, clear it
      delete next.credit
      if (isCurrentlyActive) {
        delete next[m]
      } else {
        next[m] = true
      }
      return next
    })

    if (active.credit) setAmounts(prev => ({ ...prev, credit: '' }))
    if (isCurrentlyActive) {
      setAmounts(prev => ({ ...prev, [m]: '' }))
    } else if (m === 'wallet') {
      const bal = customer?.loyalty_balance ?? 0
      if (bal > 0) setAmounts(prev => ({ ...prev, wallet: Math.min(bal, total).toFixed(2) }))
    }
  }

  function setAmount(m: SalePaymentMethod, val: string) {
    setAmounts(prev => ({ ...prev, [m]: val }))
  }

  // Derived totals
  const totalAssigned = activeMethods.reduce((sum, m) => sum + (parseFloat(amounts[m] || '0')), 0)
  const cashAmt = parseFloat(amounts.cash || '0')
  const change = !!active.cash && totalAssigned > total
    ? Math.max(0, cashAmt - (total - (totalAssigned - cashAmt)))
    : 0
  const remaining = Math.max(0, total - totalAssigned + change)
  const canConfirm = !processing && (
    (!!active.credit && !!customer) ||
    (!active.credit && Math.abs(totalAssigned - change - total) < 0.01)
  )

  function getSalePaymentMethod(): 'cash' | 'card' | 'credit' | 'transfer' | 'mixed' {
    if (active.credit) return 'credit'
    if (activeMethods.length === 1) return activeMethods[0] as 'cash' | 'card' | 'transfer'
    return 'mixed'
  }

  const handleConfirm = async () => {
    setProcessing(true)
    setError(null)
    try {
      const expandedItems: Array<{ variant_id: string; quantity: number; unit_price: number; discount: number; subtotal: number }> = []
      const customItemsNote: string[] = []
      for (const i of cart) {
        if (i.isCustom) {
          // Artículo común: no se inserta en sale_items (no existe en DB), se guarda en notes
          customItemsNote.push(`${i.quantity}x ${i.customName ?? 'Artículo'} $${i.unit_price.toFixed(2)}`)
          continue
        }
        if (i.isCombo && i.comboComponents && i.comboComponents.length > 0) {
          i.comboComponents.forEach((comp, idx) => {
            const unitPrice = idx === 0 ? i.unit_price : 0
            expandedItems.push({ variant_id: comp.variantId, quantity: i.quantity * comp.quantity, unit_price: unitPrice, discount: 0, subtotal: unitPrice * i.quantity })
          })
        } else {
          expandedItems.push({ variant_id: i.variant.id, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, subtotal: (i.unit_price - i.discount) * i.quantity })
        }
      }

      const cashPaid = active.cash ? cashAmt : 0
      const payload: QueueEntry['payload'] = {
        sale: {
          total,
          payment_method: getSalePaymentMethod(),
          cashier_id: user?.id ?? null,
          shift_id: activeShiftId,
          customer_id: customer?.id ?? null,
          amount_paid: cashPaid || total,
          change_given: change,
          discount: cart.reduce((acc, i) => acc + i.discount * i.quantity, 0),
          notes: customItemsNote.length > 0 ? `Artículos comunes: ${customItemsNote.join(', ')}` : null,
        },
        items: expandedItems,
      }

      const result = await syncEngine.processSale(payload, isOnline)
      await refreshQueue()

      const saleId = result.saleId
      const isOffline = saleId.startsWith('offline-')

      let loyaltyEarned = 0
      let newLoyaltyBalance = customer?.loyalty_balance ?? 0
      let newLoyaltySpent = customer?.loyalty_spent ?? 0

      if (isOnline && !isOffline) {
        const paymentRows = activeMethods.map(m => ({
          sale_id: saleId,
          method: m,
          amount: parseFloat(amounts[m] || '0') - (m === 'cash' ? change : 0),
        })).filter(r => r.amount > 0)
        if (paymentRows.length > 0) {
          await supabase.from('sale_payments').insert(paymentRows)
        }

        if (customer && !active.credit) {
          const walletUsed = active.wallet ? parseFloat(amounts.wallet || '0') : 0
          const nonWalletPaid = total - walletUsed

          const prevSpent = customer.loyalty_spent ?? 0
          const newSpent = prevSpent + nonWalletPaid
          const prevThresholds = Math.floor(prevSpent / 1000)
          const newThresholds = Math.floor(newSpent / 1000)
          loyaltyEarned = (newThresholds - prevThresholds) * 50

          let newBalance = (customer.loyalty_balance ?? 0) - walletUsed + loyaltyEarned
          if (newBalance < 0) newBalance = 0

          await supabase.from('customers').update({
            loyalty_spent: newSpent,
            loyalty_balance: newBalance,
          }).eq('id', customer.id)

          const txns = []
          if (walletUsed > 0) txns.push({ customer_id: customer.id, sale_id: saleId, type: 'redeemed', amount: walletUsed })
          if (loyaltyEarned > 0) txns.push({ customer_id: customer.id, sale_id: saleId, type: 'earned', amount: loyaltyEarned })
          if (txns.length > 0) await supabase.from('loyalty_transactions').insert(txns)

          newLoyaltyBalance = newBalance
          newLoyaltySpent = newSpent
        }
      }

      const loyaltyNextIn = newLoyaltySpent > 0 ? 1000 - (newLoyaltySpent % 1000) : 1000

      onSuccess({
        saleId,
        date: new Date(),
        cashierName: profile?.name ?? 'Cajero',
        cart,
        subtotal: cart.reduce((a, i) => a + i.unit_price * i.quantity, 0),
        discount: cart.reduce((a, i) => a + i.discount * i.quantity, 0),
        total,
        payments: activeMethods.map(m => ({ method: m, amount: parseFloat(amounts[m] || '0') })),
        change,
        customerName: customer?.name,
        loyaltyEarned: loyaltyEarned > 0 ? loyaltyEarned : undefined,
        loyaltyBalance: customer ? newLoyaltyBalance : undefined,
        loyaltyNextIn: customer && !active.credit ? loyaltyNextIn : undefined,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar el pago')
      setProcessing(false)
    }
  }

  return (
    <div className="pm-overlay">
      <div className="pm-modal">
        {/* Header */}
        <div className="pm-header">
          <div className="pm-header-left">
            <h2 className="pm-title">Cobrar</h2>
            <span className="pm-total-badge">{fmt(total)}</span>
          </div>
          <button className="pm-close" onClick={onClose} disabled={processing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="pm-body">
          {/* Customer search (optional) */}
          <div className="pm-section">
            <span className="pm-section-label">Cliente (opcional)</span>
            {customer ? (
              <div className="pm-customer-selected">
                <div className="pm-customer-info">
                  <span className="pm-customer-name">{customer.name}</span>
                  <span className="pm-customer-wa">{customer.whatsapp ?? customer.phone ?? '—'}</span>
                </div>
                <div className="pm-customer-badges">
                  {(customer.loyalty_balance ?? 0) > 0 && (
                    <span className="pm-badge pm-badge--wallet">Monedero: {fmt(customer.loyalty_balance)}</span>
                  )}
                  {customer.credit_limit > 0 && (
                    <span className="pm-badge pm-badge--credit">Crédito disponible</span>
                  )}
                </div>
                <button className="pm-customer-clear" onClick={() => { setCustomer(null); setCustomerQuery('') }} title="Quitar cliente">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div className="pm-customer-search">
                <input
                  type="text"
                  value={customerQuery}
                  onChange={e => setCustomerQuery(e.target.value)}
                  placeholder="Buscar por WhatsApp o nombre…"
                  className="pm-input"
                />
                {customerResults.length > 0 && (
                  <div className="pm-dropdown">
                    <div className="pm-dropdown-hint">Toca para seleccionar</div>
                    {customerResults.map(c => (
                      <button key={c.id} className="pm-dropdown-item" onClick={() => { setCustomer(c); setCustomerQuery(''); setCustomerResults([]) }}>
                        <div className="pm-dropdown-avatar">{c.name.charAt(0).toUpperCase()}</div>
                        <div className="pm-dropdown-info">
                          <span className="pm-dropdown-name">{c.name}</span>
                          <span className="pm-dropdown-wa">{c.whatsapp ?? c.phone ?? '—'}</span>
                        </div>
                        {(c.loyalty_balance ?? 0) > 0 && <span className="pm-badge pm-badge--wallet">{fmt(c.loyalty_balance)}</span>}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Method toggles */}
          <div className="pm-section">
            <span className="pm-section-label">
              Métodos de pago <span className="pm-hint">— activa varios para pago mixto</span>
            </span>
            <div className="pm-method-grid">
              {METHOD_CONFIG.filter(m => {
                if (m.id === 'wallet') return !!customer && (customer.loyalty_balance ?? 0) > 0
                if (m.id === 'credit') return !!customer && customer.credit_limit > 0 && isOnline
                return true
              }).map(m => (
                <button
                  key={m.id}
                  className={`pm-method-btn ${!!active[m.id] ? 'pm-method-btn--active' : ''}`}
                  style={!!active[m.id] ? { borderColor: m.color, color: m.color, background: `${m.color}14` } : {}}
                  onClick={() => toggleMethod(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount inputs per active method */}
          <div className="pm-section pm-section--amounts">
            {activeMethods.map(m => {
              const cfg = METHOD_CONFIG.find(c => c.id === m)!
              const isWallet = m === 'wallet'
              const isCredit = m === 'credit'
              return (
                <div key={m} className="pm-amount-row">
                  <span className="pm-amount-label" style={{ color: cfg.color }}>{cfg.label}</span>
                  <div className="pm-amount-input-wrap" style={isWallet || isCredit ? { opacity: 0.7 } : {}}>
                    <span className="pm-prefix">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.50"
                      value={amounts[m]}
                      onChange={e => !isWallet && !isCredit && setAmount(m, e.target.value)}
                      readOnly={isWallet || isCredit}
                      placeholder="0.00"
                      className="pm-amount-input"
                    />
                  </div>
                  {m === 'cash' && (
                    <div className="pm-quick">
                      {[50, 100, 200, 500].map(n => (
                        <button key={n} className="pm-quick-btn" onClick={() => setAmount('cash', String(n))}>${n}</button>
                      ))}
                      <button className="pm-quick-btn" onClick={() => setAmount('cash', String(Math.ceil(remaining / 10) * 10))}>Exacto ↑</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Total tracker */}
          {!active.credit && (
            <div className={`pm-tracker ${Math.abs(totalAssigned - change - total) < 0.01 ? 'pm-tracker--ok' : ''}`}>
              <span>Asignado:</span>
              <span className="pm-tracker-val">{fmt(totalAssigned - change)} / {fmt(total)}</span>
              {change > 0 && <span className="pm-change">Cambio: {fmt(change)}</span>}
            </div>
          )}

          {active.credit && customer && (
            <div className="pm-credit-info">
              <div className="pm-credit-row">
                <span>Límite de crédito</span><span>{fmt(customer.credit_limit)}</span>
              </div>
              <div className="pm-credit-row">
                <span>Saldo actual</span><span className={customer.credit_balance > 0 ? 'pm-debt' : ''}>{fmt(customer.credit_balance)}</span>
              </div>
              <div className="pm-credit-row">
                <span>Disponible</span><span>{fmt(Math.max(0, customer.credit_limit - customer.credit_balance))}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="pm-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pm-actions">
          <button className="pm-btn-cancel" onClick={onClose} disabled={processing}>Cancelar</button>
          <button className="pm-btn-confirm" onClick={handleConfirm} disabled={!canConfirm}>
            {processing ? (
              <><span className="pm-spinner" />Procesando…</>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Confirmar cobro
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .pm-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 20px;
        }
        .pm-modal {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          width: 100%; max-width: 460px;
          max-height: 90vh;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
          overflow: hidden;
        }
        .pm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .pm-header-left { display: flex; align-items: center; gap: 12px; }
        .pm-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 18px; font-weight: 700;
          color: var(--text-primary); margin: 0;
        }
        .pm-total-badge {
          font-family: var(--font-jetbrains, monospace);
          font-size: 20px; font-weight: 700;
          color: var(--accent);
          background: var(--accent-glow);
          padding: 4px 12px; border-radius: 8px;
        }
        .pm-close {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: 1px solid var(--border);
          border-radius: 6px; color: var(--text-muted); cursor: pointer;
          transition: all 0.15s;
        }
        .pm-close:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
        .pm-close:disabled { opacity: 0.4; cursor: not-allowed; }

        .pm-body {
          flex: 1; overflow-y: auto;
          padding: 16px 20px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .pm-section { display: flex; flex-direction: column; gap: 8px; }
        .pm-section-label {
          font-size: 10px; font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.08em;
        }

        /* Customer */
        .pm-customer-search { position: relative; }
        .pm-input {
          width: 100%;
          background: var(--bg-input); border: 1px solid var(--border);
          border-radius: 8px; padding: 10px 12px;
          font-size: 13px; color: var(--text-primary); outline: none;
          transition: border-color 0.15s;
        }
        .pm-input:focus { border-color: var(--accent); }
        .pm-input::placeholder { color: var(--text-muted); }

        .pm-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 8px; overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 10;
        }
        .pm-dropdown-hint {
          padding: 5px 12px;
          font-size: 10px; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .pm-dropdown-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 12px;
          background: transparent; border: none;
          cursor: pointer; text-align: left;
          transition: background 0.1s;
        }
        .pm-dropdown-item:hover { background: var(--bg-hover); }
        .pm-dropdown-avatar {
          width: 28px; height: 28px; border-radius: 7px;
          background: var(--accent-glow); border: 1px solid rgba(240,180,41,0.2);
          color: var(--accent); font-family: var(--font-syne, sans-serif);
          font-weight: 700; font-size: 11px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .pm-dropdown-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .pm-dropdown-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .pm-dropdown-wa { font-size: 11px; color: var(--text-muted); }

        .pm-customer-selected {
          display: flex; align-items: center; gap: 10px;
          background: var(--accent-glow);
          border: 1px solid rgba(240,180,41,0.25);
          border-radius: 8px; padding: 10px 12px;
        }
        .pm-customer-info { flex: 1; min-width: 0; }
        .pm-customer-name { display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .pm-customer-wa { display: block; font-size: 11px; color: var(--text-muted); }
        .pm-customer-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .pm-customer-clear {
          width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: 1px solid transparent;
          border-radius: 6px; color: var(--text-muted); cursor: pointer;
          transition: all 0.15s; flex-shrink: 0;
        }
        .pm-customer-clear:hover { background: var(--danger-dim); color: var(--danger); border-color: rgba(239,68,68,0.3); }

        .pm-badge {
          font-size: 10px; font-weight: 600;
          padding: 2px 7px; border-radius: 4px;
          letter-spacing: 0.03em;
        }
        .pm-badge--wallet { background: rgba(240,180,41,0.15); color: var(--accent); border: 1px solid rgba(240,180,41,0.3); }
        .pm-badge--credit { background: rgba(129,140,248,0.1); color: #818CF8; border: 1px solid rgba(129,140,248,0.3); }

        .pm-hint { font-size: 10px; font-weight: 400; color: var(--text-muted); text-transform: none; letter-spacing: 0; }

        /* Methods */
        .pm-method-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .pm-method-btn {
          padding: 7px 14px;
          background: var(--bg-hover); border: 1px solid var(--border);
          border-radius: 7px; font-size: 12px; font-weight: 600;
          color: var(--text-secondary); cursor: pointer;
          transition: all 0.15s;
        }
        .pm-method-btn:hover { border-color: var(--text-muted); color: var(--text-primary); }
        .pm-method-btn--active { font-weight: 700; }

        /* Amount inputs */
        .pm-section--amounts { gap: 10px; }
        .pm-amount-row { display: flex; flex-direction: column; gap: 6px; }
        .pm-amount-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
        .pm-amount-input-wrap {
          display: flex; align-items: center;
          background: var(--bg-input); border: 1px solid var(--border);
          border-radius: 8px; overflow: hidden;
          transition: border-color 0.15s;
        }
        .pm-amount-input-wrap:focus-within { border-color: var(--accent); }
        .pm-prefix {
          padding: 0 12px;
          font-family: var(--font-jetbrains, monospace); font-size: 15px;
          color: var(--text-muted); border-right: 1px solid var(--border);
        }
        .pm-amount-input {
          flex: 1; background: transparent; border: none; outline: none;
          padding: 10px 12px;
          font-family: var(--font-jetbrains, monospace);
          font-size: 20px; font-weight: 600; color: var(--text-primary);
        }
        .pm-quick { display: flex; gap: 5px; flex-wrap: wrap; }
        .pm-quick-btn {
          padding: 5px 10px;
          background: var(--bg-hover); border: 1px solid var(--border);
          border-radius: 6px; font-size: 11px;
          font-family: var(--font-jetbrains, monospace);
          color: var(--text-secondary); cursor: pointer;
          transition: all 0.15s;
        }
        .pm-quick-btn:hover { border-color: var(--accent); color: var(--accent); }

        /* Tracker */
        .pm-tracker {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: 8px;
          font-size: 13px; color: var(--text-secondary);
          transition: all 0.2s;
        }
        .pm-tracker--ok {
          background: rgba(34,197,94,0.08);
          border-color: rgba(34,197,94,0.25);
        }
        .pm-tracker-val {
          flex: 1;
          font-family: var(--font-jetbrains, monospace);
          font-weight: 700; color: var(--text-primary);
        }
        .pm-change {
          font-family: var(--font-jetbrains, monospace);
          font-size: 12px; color: var(--success, #22C55E); font-weight: 600;
        }

        /* Credit info */
        .pm-credit-info {
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 8px; padding: 12px 14px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .pm-credit-row {
          display: flex; justify-content: space-between;
          font-size: 12px; color: var(--text-secondary);
        }
        .pm-credit-row span:last-child {
          font-family: var(--font-jetbrains, monospace);
          font-weight: 600; color: var(--text-primary);
        }
        .pm-debt { color: var(--danger, #EF4444) !important; }

        /* Error */
        .pm-error {
          display: flex; align-items: center; gap: 8px;
          background: var(--danger-dim, rgba(239,68,68,0.1));
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px; padding: 10px 12px;
          font-size: 13px; color: var(--danger, #EF4444);
        }

        /* Actions */
        .pm-actions {
          display: flex; gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        .pm-btn-cancel {
          flex: 1; padding: 12px;
          background: transparent; border: 1px solid var(--border);
          border-radius: 8px; font-size: 13px; font-weight: 600;
          color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
        }
        .pm-btn-cancel:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
        .pm-btn-cancel:disabled { opacity: 0.4; cursor: not-allowed; }
        .pm-btn-confirm {
          flex: 2; padding: 12px;
          background: var(--accent); border: none;
          border-radius: 8px;
          font-family: var(--font-syne, sans-serif);
          font-size: 14px; font-weight: 700; color: #0D0D12;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.15s;
        }
        .pm-btn-confirm:hover:not(:disabled) { background: #F5C233; transform: translateY(-1px); }
        .pm-btn-confirm:disabled { background: var(--text-muted); cursor: not-allowed; opacity: 0.5; transform: none; }
        .pm-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(13,13,18,0.3);
          border-top-color: #0D0D12;
          border-radius: 50%;
          animation: pm-spin 0.7s linear infinite;
        }
        @keyframes pm-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
