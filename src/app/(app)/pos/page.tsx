'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import type { CartItem, ProductVariant } from '@/types'
import { createClient } from '@/lib/supabase/client'
import ProductPanel from './ProductPanel'
import CartPanel from './CartPanel'


interface HeldTicket {
  id: string
  cart: CartItem[]
  heldAt: string   // ISO timestamp
  label: string    // "Ticket #N"
}

const HOLDS_KEY = 'pos_holds'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m}m`
  return `hace ${Math.floor(m / 60)}h ${m % 60}m`
}

/* ─── Holds Panel ─── */
interface HoldsPanelProps {
  tickets: HeldTicket[]
  onRecall: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function HoldsPanel({ tickets, onRecall, onDelete, onClose }: HoldsPanelProps) {
  const fmt = (n: number) => `$${n.toFixed(2)}`

  return (
    <div className="holds-overlay" onClick={onClose}>
      <div className="holds-panel" onClick={e => e.stopPropagation()}>
        <div className="holds-header">
          <div>
            <h2 className="holds-title">Ventas en espera</h2>
            <p className="holds-sub">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''} pausado{tickets.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="holds-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {tickets.length === 0 ? (
          <div className="holds-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
            <p>No hay ventas en espera</p>
          </div>
        ) : (
          <div className="holds-list">
            {tickets.map((t) => {
              const itemCount = t.cart.reduce((a, i) => a + i.quantity, 0)
              const total = t.cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount * i.quantity, 0)
              return (
                <div key={t.id} className="hold-card">
                  <div className="hold-card-top">
                    <div>
                      <span className="hold-label">{t.label}</span>
                      <span className="hold-time">{timeAgo(t.heldAt)}</span>
                    </div>
                    <button className="hold-delete" onClick={() => onDelete(t.id)} title="Descartar">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>

                  <div className="hold-items-preview">
                    {t.cart.slice(0, 3).map((item, i) => (
                      <div key={i} className="hold-item-row">
                        <span className="hold-item-qty">{item.quantity}×</span>
                        <span className="hold-item-name">
                          {item.variant.product?.name ?? '—'}
                          {item.variant.flavor ? ` — ${item.variant.flavor}` : ''}
                        </span>
                        <span className="hold-item-price">{fmt(item.unit_price * item.quantity)}</span>
                      </div>
                    ))}
                    {t.cart.length > 3 && (
                      <div className="hold-more">+{t.cart.length - 3} producto{t.cart.length - 3 !== 1 ? 's' : ''} más</div>
                    )}
                  </div>

                  <div className="hold-card-footer">
                    <span className="hold-summary">{itemCount} artículo{itemCount !== 1 ? 's' : ''} · <strong>{fmt(total)}</strong></span>
                    <button className="hold-recall" onClick={() => onRecall(t.id)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-4"/>
                      </svg>
                      Recuperar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .holds-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .holds-panel {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          width: 420px;
          max-width: 95vw;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 48px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .holds-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 20px 16px;
          border-bottom: 1px solid var(--border);
        }
        .holds-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 2px;
        }
        .holds-sub { font-size: 12px; color: var(--text-muted); margin: 0; }
        .holds-close {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: 1px solid var(--border);
          border-radius: 7px; color: var(--text-muted); cursor: pointer;
          transition: all 0.15s;
        }
        .holds-close:hover { background: var(--danger-dim); color: var(--danger); border-color: rgba(239,68,68,0.4); }
        .holds-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 12px;
          padding: 48px 24px;
          color: var(--text-muted);
          font-size: 13px;
        }
        .holds-list {
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .hold-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color 0.15s;
        }
        .hold-card:hover { border-color: rgba(240,180,41,0.3); }
        .hold-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hold-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin-right: 8px;
        }
        .hold-time {
          font-size: 11px;
          color: var(--text-muted);
        }
        .hold-delete {
          width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: 1px solid transparent;
          border-radius: 6px; color: var(--text-muted); cursor: pointer;
          transition: all 0.15s;
        }
        .hold-delete:hover { background: var(--danger-dim); color: var(--danger); border-color: rgba(239,68,68,0.3); }
        .hold-items-preview {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 10px;
          background: var(--bg-hover);
          border-radius: 7px;
        }
        .hold-item-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }
        .hold-item-qty {
          color: var(--accent);
          font-family: var(--font-jetbrains, monospace);
          font-weight: 600;
          min-width: 22px;
        }
        .hold-item-name {
          flex: 1;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hold-item-price {
          font-family: var(--font-jetbrains, monospace);
          color: var(--text-muted);
          font-size: 11px;
        }
        .hold-more {
          font-size: 11px;
          color: var(--text-muted);
          padding-left: 28px;
        }
        .hold-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hold-summary {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .hold-summary strong {
          color: var(--text-primary);
          font-family: var(--font-jetbrains, monospace);
        }
        .hold-recall {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: var(--accent);
          color: #0D0D12;
          border: none;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }
        .hold-recall:hover { background: #F5C233; transform: translateY(-1px); }
      `}</style>
    </div>
  )
}

/* ─── POS Page ─── */
export default function PosPage() {
  const supabase = createClient()
  const [cart, setCart] = useState<CartItem[]>([])
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>([])
  const [activeShiftId, setActiveShiftId] = useState<string | null | undefined>(undefined) // undefined = cargando

  useEffect(() => {
    supabase.from('shifts').select('id').eq('status', 'open')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => setActiveShiftId(data?.id ?? null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar desde localStorage solo en el cliente, después del primer render
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HOLDS_KEY) ?? '[]')
      if (stored.length > 0) setHeldTickets(stored)
    } catch { /* ignore */ }
  }, [])
  const [showHolds, setShowHolds] = useState(false)

  // Persist holds to localStorage
  useEffect(() => {
    localStorage.setItem(HOLDS_KEY, JSON.stringify(heldTickets))
  }, [heldTickets])

  const addComboToCart = useCallback((combo: { id: string; name: string; sale_price: number; components: Array<{ variantId: string; quantity: number }> }) => {
    setCart(prev => {
      const existing = prev.find(i => i.comboId === combo.id)
      if (existing) {
        return prev.map(i => i.comboId === combo.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      // Variant virtual — usa el combo ID como clave para que updateQuantity/removeFromCart funcionen
      const virtualVariant: ProductVariant = {
        id: combo.id,
        product_id: '',
        barcode: `combo-${combo.id}`,
        flavor: null,
        cost_price: 0,
        sale_price: combo.sale_price,
        wholesale_price: 0,
        stock: 9999,
        min_stock: 0,
        max_stock: 0,
        expiration_date: null,
        active: true,
        created_at: '',
        updated_at: '',
        product: { id: '', name: combo.name, brand: null, category: null, description: null, image_url: null, supplier_id: null, sale_type: 'unidad', active: true, created_at: '', updated_at: '' },
      }
      return [...prev, {
        variant: virtualVariant,
        quantity: 1,
        unit_price: combo.sale_price,
        discount: 0,
        isCombo: true,
        comboId: combo.id,
        comboName: combo.name,
        comboComponents: combo.components,
      }]
    })
  }, [])

  const addToCart = useCallback((variant: ProductVariant) => {
    setCart(prev => {
      const existing = prev.find(i => i.variant.id === variant.id)
      if (existing) {
        return prev.map(i =>
          i.variant.id === variant.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { variant, quantity: 1, unit_price: variant.sale_price, discount: 0 }]
    })
  }, [])

  const updateQuantity = useCallback((variantId: string, qty: number) => {
    setCart(prev =>
      qty <= 0
        ? prev.filter(i => i.variant.id !== variantId)
        : prev.map(i => i.variant.id === variantId ? { ...i, quantity: qty } : i)
    )
  }, [])

  const updatePrice = useCallback((variantId: string, price: number) => {
    setCart(prev => prev.map(i =>
      i.variant.id === variantId ? { ...i, unit_price: price, discount: 0 } : i
    ))
  }, [])

  const removeFromCart = useCallback((variantId: string) => {
    setCart(prev => prev.filter(i => i.variant.id !== variantId))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const addCartItemDirect = useCallback((item: import('@/types').CartItem) => {
    setCart(prev => [...prev, item])
  }, [])

  // Hold current cart
  const holdCart = useCallback(() => {
    if (cart.length === 0) return
    setHeldTickets(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        cart: [...cart],
        heldAt: new Date().toISOString(),
        label: `Ticket #${prev.length + 1}`,
      },
    ])
    setCart([])
  }, [cart])

  // Recall a held ticket (if cart has items, hold them first)
  const recallTicket = useCallback((id: string) => {
    const ticket = heldTickets.find(t => t.id === id)
    if (!ticket) return

    setHeldTickets(prev => {
      const without = prev.filter(t => t.id !== id)
      if (cart.length > 0) {
        return [
          ...without,
          {
            id: Date.now().toString(),
            cart: [...cart],
            heldAt: new Date().toISOString(),
            label: `Ticket #${without.length + 1}`,
          },
        ]
      }
      return without
    })

    setCart(ticket.cart)
    setShowHolds(false)
  }, [heldTickets, cart])

  const deleteHeld = useCallback((id: string) => {
    setHeldTickets(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Candado: sin turno abierto */}
      {activeShiftId === null && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 300,
          background: 'rgba(13,13,18,0.92)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F0B429" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#F0B429', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Sin turno activo</div>
            <div style={{ color: '#9CA3AF', fontSize: 14 }}>Debes abrir un turno para realizar ventas</div>
          </div>
          <Link href="/turnos" style={{
            marginTop: 8, padding: '10px 24px',
            background: '#F0B429', color: '#0D0D12',
            borderRadius: 8, fontWeight: 700, fontSize: 14,
            textDecoration: 'none',
          }}>
            Ir a Turnos / Caja
          </Link>
        </div>
      )}
      {showHolds && (
        <HoldsPanel
          tickets={heldTickets}
          onRecall={recallTicket}
          onDelete={deleteHeld}
          onClose={() => setShowHolds(false)}
        />
      )}
      <ProductPanel onAddToCart={addToCart} onAddComboToCart={addComboToCart} cart={cart} />
      <CartPanel
        cart={cart}
        onUpdateQuantity={updateQuantity}
        onUpdatePrice={updatePrice}
        onRemove={removeFromCart}
        onClear={clearCart}
        onHold={holdCart}
        heldCount={heldTickets.length}
        onShowHolds={() => setShowHolds(true)}
        onAddToCart={addCartItemDirect}
      />
    </div>
  )
}
