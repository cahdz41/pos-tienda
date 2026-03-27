'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Sale, SaleItem } from '@/types'

interface SaleWithItems extends Sale {
  items: (SaleItem & {
    variant: { barcode: string; flavor: string | null; product: { name: string } | null }
  })[]
  cashier?: { name: string }
  customer?: { name: string } | null
}

interface Props {
  onClose: () => void
}

const fmt = (n: number) => `$${n.toFixed(2)}`

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m}m`
  if (m < 1440) return `hace ${Math.floor(m / 60)}h ${m % 60}m`
  return `hace ${Math.floor(m / 1440)}d`
}

const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', credit: 'Crédito' }

export default function VoidSaleModal({ onClose }: Props) {
  const supabase = createClient()
  const { user } = useAuth()

  const [sales, setSales] = useState<SaleWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SaleWithItems | null>(null)
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voiding, setVoiding] = useState(false)

  const loadSales = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        cashier:profiles!sales_cashier_id_fkey(name),
        customer:customers(name),
        items:sale_items(
          *,
          variant:product_variants(
            barcode, flavor,
            product:products(name)
          )
        )
      `)
      .eq('status', 'completed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) setSales(data as SaleWithItems[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadSales() }, [loadSales])

  const filtered = sales.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      s.id.toLowerCase().includes(q) ||
      fmt(s.total).includes(q) ||
      s.cashier?.name?.toLowerCase().includes(q) ||
      s.customer?.name?.toLowerCase().includes(q) ||
      s.items.some(i => i.variant?.product?.name?.toLowerCase().includes(q))
    )
  })

  async function handleVoid() {
    if (!selected || !user) return
    setVoiding(true)
    setError(null)
    try {
      // 1. Marcar la venta como cancelada
      const { error: saleErr } = await supabase
        .from('sales')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
          cancel_reason: reason.trim() || null,
        })
        .eq('id', selected.id)
      if (saleErr) throw saleErr

      // 2. Restaurar el stock de cada producto
      for (const item of selected.items) {
        const { error: stockErr } = await supabase.rpc('increment_stock', {
          p_variant_id: item.variant_id,
          p_amount: item.quantity,
        })
        // Si no existe la función RPC, usar update directo
        if (stockErr) {
          const { data: current } = await supabase
            .from('product_variants')
            .select('stock')
            .eq('id', item.variant_id)
            .single()
          if (current) {
            await supabase
              .from('product_variants')
              .update({ stock: current.stock + item.quantity })
              .eq('id', item.variant_id)
          }
        }
      }

      // Quitar de la lista local
      setSales(prev => prev.filter(s => s.id !== selected.id))
      setSelected(null)
      setConfirming(false)
      setReason('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al anular la venta')
    } finally {
      setVoiding(false)
    }
  }

  return (
    <div className="void-overlay" onClick={onClose}>
      <div className="void-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="void-header">
          <div>
            <h2 className="void-title">Anular venta</h2>
            <p className="void-sub">Últimas 48 horas · solo ventas completadas</p>
          </div>
          <button className="void-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Confirmation screen */}
        {confirming && selected ? (
          <div className="void-confirm">
            <div className="confirm-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </div>
            <p className="confirm-title">¿Anular esta venta?</p>
            <div className="confirm-detail">
              <span className="confirm-total">{fmt(selected.total)}</span>
              <span className="confirm-meta">
                {METHOD_LABEL[selected.payment_method]} · {timeAgo(selected.created_at)}
                {selected.cashier && ` · ${selected.cashier.name}`}
              </span>
            </div>

            <div className="confirm-items">
              {selected.items.map((item, i) => (
                <div key={i} className="confirm-item-row">
                  <span className="ci-qty">{item.quantity}×</span>
                  <span className="ci-name">
                    {item.variant?.product?.name ?? '—'}
                    {item.variant?.flavor ? ` — ${item.variant.flavor}` : ''}
                  </span>
                  <span className="ci-price">{fmt(item.unit_price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="confirm-reason-wrap">
              <label className="confirm-reason-label">
                Motivo <span className="optional">(opcional)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ej: error al cobrar, devolución del cliente…"
                className="confirm-reason-input"
                autoFocus
              />
            </div>

            {error && <div className="void-error">{error}</div>}

            <div className="confirm-actions">
              <button className="btn-back" onClick={() => { setConfirming(false); setError(null) }}>
                Volver
              </button>
              <button className="btn-void-confirm" onClick={handleVoid} disabled={voiding}>
                {voiding ? 'Anulando…' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="void-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por monto, cajero, producto…"
                className="void-search"
                autoFocus
              />
            </div>

            {/* Sale list */}
            <div className="void-list">
              {loading ? (
                <div className="void-loading">Cargando ventas…</div>
              ) : filtered.length === 0 ? (
                <div className="void-empty">
                  <p>No hay ventas completadas en las últimas 48 horas</p>
                </div>
              ) : (
                filtered.map(sale => (
                  <div key={sale.id} className="void-card">
                    <div className="vc-top">
                      <div className="vc-left">
                        <span className="vc-total">{fmt(sale.total)}</span>
                        <span className={`vc-method vc-method--${sale.payment_method}`}>
                          {METHOD_LABEL[sale.payment_method]}
                        </span>
                        {sale.customer && (
                          <span className="vc-customer">{sale.customer.name}</span>
                        )}
                      </div>
                      <div className="vc-right">
                        <span className="vc-time">{timeAgo(sale.created_at)}</span>
                        {sale.cashier && <span className="vc-cashier">{sale.cashier.name}</span>}
                      </div>
                    </div>

                    <div className="vc-items">
                      {sale.items.slice(0, 3).map((item, i) => (
                        <span key={i} className="vc-item-chip">
                          {item.quantity}× {item.variant?.product?.name ?? '—'}
                          {item.variant?.flavor ? ` (${item.variant.flavor})` : ''}
                        </span>
                      ))}
                      {sale.items.length > 3 && (
                        <span className="vc-item-chip vc-item-chip--more">
                          +{sale.items.length - 3} más
                        </span>
                      )}
                    </div>

                    <button
                      className="vc-void-btn"
                      onClick={() => { setSelected(sale); setConfirming(true); setError(null) }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                      </svg>
                      Anular
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        .void-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(4px);
          z-index: 200;
          display: flex; align-items: center; justify-content: center;
        }
        .void-panel {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          width: 480px; max-width: 95vw; max-height: 82vh;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 48px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .void-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 20px 20px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .void-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 16px; font-weight: 700;
          color: var(--text-primary); margin: 0 0 2px;
        }
        .void-sub { font-size: 12px; color: var(--text-muted); margin: 0; }
        .void-close {
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          background: transparent; border: 1px solid var(--border);
          border-radius: 7px; color: var(--text-muted); cursor: pointer; transition: all 0.15s;
        }
        .void-close:hover { background: var(--danger-dim); color: var(--danger); border-color: rgba(239,68,68,0.4); }

        /* Search */
        .void-search-wrap {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .void-search-wrap svg { color: var(--text-muted); flex-shrink: 0; }
        .void-search {
          flex: 1; background: transparent; border: none; outline: none;
          font-size: 13px; color: var(--text-primary);
          font-family: var(--font-jetbrains, monospace);
        }
        .void-search::placeholder { color: var(--text-muted); }

        /* List */
        .void-list {
          overflow-y: auto; padding: 12px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .void-loading, .void-empty {
          text-align: center; padding: 40px 24px;
          font-size: 13px; color: var(--text-muted);
        }

        /* Sale card */
        .void-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px; padding: 12px;
          display: flex; flex-direction: column; gap: 8px;
          transition: border-color 0.15s;
        }
        .void-card:hover { border-color: rgba(239,68,68,0.25); }
        .vc-top { display: flex; align-items: flex-start; justify-content: space-between; }
        .vc-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .vc-total {
          font-family: var(--font-jetbrains, monospace);
          font-size: 16px; font-weight: 700; color: var(--text-primary);
        }
        .vc-method {
          font-size: 10px; font-weight: 700; padding: 2px 7px;
          border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .vc-method--cash { background: rgba(34,197,94,0.12); color: var(--success); }
        .vc-method--card { background: rgba(59,130,246,0.12); color: #60A5FA; }
        .vc-method--credit { background: rgba(240,180,41,0.12); color: var(--accent); }
        .vc-customer { font-size: 11px; color: var(--accent); }
        .vc-right { text-align: right; }
        .vc-time { display: block; font-size: 11px; color: var(--text-muted); }
        .vc-cashier { display: block; font-size: 11px; color: var(--text-secondary); margin-top: 2px; }

        .vc-items { display: flex; flex-wrap: wrap; gap: 4px; }
        .vc-item-chip {
          font-size: 11px; color: var(--text-secondary);
          background: var(--bg-hover); border-radius: 4px;
          padding: 2px 7px;
        }
        .vc-item-chip--more { color: var(--text-muted); }

        .vc-void-btn {
          align-self: flex-end;
          display: flex; align-items: center; gap: 6px;
          padding: 5px 12px;
          background: transparent;
          border: 1px solid rgba(239,68,68,0.35);
          border-radius: 6px; color: var(--danger, #EF4444);
          font-size: 12px; font-weight: 600; cursor: pointer;
          transition: all 0.15s;
        }
        .vc-void-btn:hover { background: var(--danger-dim); border-color: rgba(239,68,68,0.6); }

        /* Confirm screen */
        .void-confirm {
          padding: 28px 24px;
          display: flex; flex-direction: column; align-items: center; gap: 16px;
        }
        .confirm-icon {
          width: 60px; height: 60px; border-radius: 50%;
          background: var(--danger-dim, rgba(239,68,68,0.1));
          border: 1px solid rgba(239,68,68,0.25);
          display: flex; align-items: center; justify-content: center;
          color: var(--danger, #EF4444);
        }
        .confirm-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 18px; font-weight: 700;
          color: var(--text-primary); margin: 0;
        }
        .confirm-detail { text-align: center; }
        .confirm-total {
          display: block;
          font-family: var(--font-jetbrains, monospace);
          font-size: 28px; font-weight: 700; color: var(--text-primary);
        }
        .confirm-meta { font-size: 12px; color: var(--text-muted); }

        .confirm-items {
          width: 100%;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .confirm-item-row {
          display: flex; align-items: center; gap: 8px; font-size: 12px;
        }
        .ci-qty { color: var(--accent); font-weight: 700; min-width: 24px; font-family: var(--font-jetbrains, monospace); }
        .ci-name { flex: 1; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ci-price { font-family: var(--font-jetbrains, monospace); color: var(--text-muted); font-size: 11px; }

        .confirm-reason-wrap { width: 100%; }
        .confirm-reason-label {
          display: block; font-size: 12px; font-weight: 600;
          color: var(--text-secondary); margin-bottom: 6px;
        }
        .optional { font-weight: 400; color: var(--text-muted); }
        .confirm-reason-input {
          width: 100%; background: var(--bg-input); border: 1px solid var(--border);
          border-radius: 7px; padding: 8px 12px;
          font-size: 13px; color: var(--text-primary); outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .confirm-reason-input:focus { border-color: var(--danger, #EF4444); }

        .void-error {
          width: 100%; padding: 8px 12px;
          background: var(--danger-dim); border: 1px solid rgba(239,68,68,0.3);
          border-radius: 7px; color: var(--danger); font-size: 12px;
        }

        .confirm-actions { display: flex; gap: 10px; width: 100%; }
        .btn-back {
          flex: 1; padding: 10px;
          background: transparent; border: 1px solid var(--border);
          border-radius: 8px; color: var(--text-secondary);
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.15s;
        }
        .btn-back:hover { background: var(--bg-hover); }
        .btn-void-confirm {
          flex: 2; padding: 10px;
          background: var(--danger, #EF4444); border: none;
          border-radius: 8px; color: #fff;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.15s;
        }
        .btn-void-confirm:hover:not(:disabled) { background: #DC2626; }
        .btn-void-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
