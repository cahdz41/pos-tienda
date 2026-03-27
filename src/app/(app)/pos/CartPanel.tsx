'use client'

import { useState } from 'react'
import type { CartItem } from '@/types'
import PaymentModal from './PaymentModal'
import Receipt, { type SaleReceipt } from './Receipt'
import VoidSaleModal from './VoidSaleModal'
import { useOffline } from '@/contexts/OfflineContext'

interface Props {
  cart: CartItem[]
  onUpdateQuantity: (variantId: string, qty: number) => void
  onUpdatePrice: (variantId: string, price: number) => void
  onRemove: (variantId: string) => void
  onClear: () => void
  onHold: () => void
  heldCount: number
  onShowHolds: () => void
  onAddToCart: (item: CartItem) => void
}

const fmt = (n: number) => `$${n.toFixed(2)}`

export default function CartPanel({ cart, onUpdateQuantity, onUpdatePrice, onRemove, onClear, onHold, heldCount, onShowHolds, onAddToCart }: Props) {
  const [showPayment, setShowPayment] = useState(false)
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null)
  const [showVoid, setShowVoid] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customQty, setCustomQty] = useState('1')
  const { isOnline } = useOffline()

  function addCustomItem() {
    const price = parseFloat(customPrice)
    const qty = parseInt(customQty) || 1
    if (!customName.trim() || isNaN(price) || price <= 0) return
    const fakeId = `custom-${Date.now()}`
    const fakeVariant = {
      id: fakeId, product_id: '', barcode: fakeId, flavor: null,
      cost_price: 0, sale_price: price, wholesale_price: 0,
      stock: 9999, min_stock: 0, max_stock: 0, expiration_date: null,
      active: true, created_at: '', updated_at: '',
      product: { id: '', name: customName.trim(), brand: null, category: null, description: null, image_url: null, supplier_id: null, sale_type: 'unidad' as const, active: true, created_at: '', updated_at: '' },
    }
    onAddToCart({ variant: fakeVariant, quantity: qty, unit_price: price, discount: 0, isCustom: true, customName: customName.trim() })
    setCustomName(''); setCustomPrice(''); setCustomQty('1'); setShowCustom(false)
  }

  // Inline price editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [tempPrice, setTempPrice] = useState('')

  function startEditPrice(variantId: string, currentPrice: number) {
    setEditingPriceId(variantId)
    setTempPrice(currentPrice.toFixed(2))
    // focus handled by autoFocus
  }

  function commitPriceEdit(variantId: string) {
    const parsed = parseFloat(tempPrice)
    if (!isNaN(parsed) && parsed > 0) {
      onUpdatePrice(variantId, parsed)
    }
    setEditingPriceId(null)
  }

  const subtotal = cart.reduce((acc, i) => acc + i.unit_price * i.quantity, 0)
  const discount = cart.reduce((acc, i) => acc + i.discount * i.quantity, 0)
  const total = subtotal - discount

  const handleSuccess = (r: SaleReceipt) => {
    setShowPayment(false)
    onClear()
    setReceipt(r)
  }

  return (
    <div className="cart-panel">
      {showVoid && <VoidSaleModal onClose={() => setShowVoid(false)} />}

      {/* Modal artículo común */}
      {showCustom && (
        <div onClick={() => setShowCustom(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-surface, #1a1a24)',
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: 14, width: 380, maxWidth: '95vw',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px 14px',
              borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-syne, sans-serif)', fontWeight: 700, fontSize: 16, color: 'var(--text-primary, #fff)' }}>
                  Artículo común
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', marginTop: 2 }}>
                  Producto sin código — solo se agrega al carrito
                </div>
              </div>
              <button onClick={() => setShowCustom(false)} style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '1px solid var(--border, rgba(255,255,255,0.1))',
                borderRadius: 7, color: 'var(--text-muted, #9CA3AF)', cursor: 'pointer',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #9CA3AF)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Descripción *
                </label>
                <input
                  autoFocus
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Ej: Adelanto, servicio, producto sin código…"
                  onKeyDown={e => e.key === 'Enter' && addCustomItem()}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--bg-card, #0D0D12)', border: '1px solid var(--border, rgba(255,255,255,0.1))',
                    borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary, #fff)',
                    fontSize: 14, outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #9CA3AF)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Precio *
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    value={customPrice}
                    onChange={e => setCustomPrice(e.target.value)}
                    placeholder="0.00"
                    onKeyDown={e => e.key === 'Enter' && addCustomItem()}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'var(--bg-card, #0D0D12)', border: '1px solid var(--border, rgba(255,255,255,0.1))',
                      borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary, #fff)',
                      fontSize: 14, outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #9CA3AF)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cantidad
                  </label>
                  <input
                    type="number" min="1" step="1"
                    value={customQty}
                    onChange={e => setCustomQty(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomItem()}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'var(--bg-card, #0D0D12)', border: '1px solid var(--border, rgba(255,255,255,0.1))',
                      borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary, #fff)',
                      fontSize: 14, outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', gap: 10, padding: '0 20px 20px', justifyContent: 'flex-end',
            }}>
              <button onClick={() => setShowCustom(false)} style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border, rgba(255,255,255,0.1))',
                background: 'transparent', color: 'var(--text-secondary, #ccc)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                Cancelar
              </button>
              <button
                onClick={addCustomItem}
                disabled={!customName.trim() || !customPrice}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: !customName.trim() || !customPrice ? 'rgba(240,180,41,0.3)' : 'var(--accent, #F0B429)',
                  color: '#0D0D12', fontSize: 13, fontWeight: 700, cursor: !customName.trim() || !customPrice ? 'not-allowed' : 'pointer',
                }}
              >
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="cart-header">
        <h2 className="cart-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          Carrito
          {cart.length > 0 && <span className="cart-count">{cart.reduce((a, i) => a + i.quantity, 0)}</span>}
        </h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Artículo común */}
          <button className="custom-item-btn" onClick={() => setShowCustom(true)} title="Agregar artículo sin código">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Artículo
          </button>
          {/* Void sale */}
          {isOnline && (
            <button className="void-btn" onClick={() => setShowVoid(true)} title="Anular una venta reciente">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
              Anular
            </button>
          )}
          {/* Held tickets badge */}
          {heldCount > 0 && (
            <button className="holds-badge" onClick={onShowHolds} title="Ver ventas en espera">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {heldCount} en espera
            </button>
          )}
          {/* Hold current cart */}
          {cart.length > 0 && (
            <button className="hold-btn" onClick={onHold} title="Poner venta en espera">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
              </svg>
              Espera
            </button>
          )}
          {cart.length > 0 && (
            <button className="clear-btn" onClick={onClear} title="Vaciar carrito">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
              Vaciar
            </button>
          )}
        </div>
      </div>


      {/* Items */}
      <div className="cart-items">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <p>Agrega productos<br/>desde el catálogo</p>
          </div>
        ) : (
          cart.map(item => {
            const hasWholesale = (item.variant.wholesale_price ?? 0) > 0 && item.variant.wholesale_price !== item.variant.sale_price
            const isWholesale = hasWholesale && item.unit_price === item.variant.wholesale_price
            const isCustom = item.unit_price !== item.variant.sale_price && item.unit_price !== item.variant.wholesale_price
            const isEditing = editingPriceId === item.variant.id
            return (
            <div key={item.variant.id} className="cart-item">
              <div className="item-info">
                <span className="item-name">
                  {item.isCustom ? item.customName : (item.variant.product?.name ?? '—')}
                  {item.isCustom && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--accent)', opacity: 0.8 }}>común</span>}
                </span>
                {!item.isCustom && item.variant.flavor && <span className="item-flavor">{item.variant.flavor}</span>}
                <div className="item-price-row">
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      step="0.50"
                      value={tempPrice}
                      onChange={e => setTempPrice(e.target.value)}
                      onBlur={() => commitPriceEdit(item.variant.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.currentTarget.blur() }
                        if (e.key === 'Escape') setEditingPriceId(null)
                      }}
                      autoFocus
                      className="price-edit-input"
                    />
                  ) : (
                    <span
                      className={`item-price-unit${isCustom ? ' item-price-unit--custom' : ''}`}
                      onDoubleClick={() => startEditPrice(item.variant.id, item.unit_price)}
                      title="Doble clic para precio personalizado"
                    >
                      {fmt(item.unit_price)} c/u{isCustom ? ' ✎' : ''}
                    </span>
                  )}
                  {hasWholesale && !isEditing && (
                    <button
                      className={`price-toggle-btn${isWholesale ? ' price-toggle-btn--active' : ''}`}
                      onClick={() => onUpdatePrice(item.variant.id, isWholesale ? item.variant.sale_price : item.variant.wholesale_price)}
                      title={isWholesale ? `Público: ${fmt(item.variant.sale_price)}` : `Mayoreo: ${fmt(item.variant.wholesale_price)}`}
                    >
                      May
                    </button>
                  )}
                </div>
              </div>
              <div className="item-controls">
                <button
                  className="qty-btn"
                  onClick={() => onUpdateQuantity(item.variant.id, item.quantity - 1)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                <span className="qty-value">{item.quantity}</span>
                <button
                  className="qty-btn"
                  onClick={() => onUpdateQuantity(item.variant.id, item.quantity + 1)}
                  disabled={item.quantity >= item.variant.stock}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </div>
              <div className="item-subtotal">
                <span>{fmt((item.unit_price - item.discount) * item.quantity)}</span>
                <button className="remove-btn" onClick={() => onRemove(item.variant.id)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          )})
        )}
      </div>

      {/* Totals + Payment */}
      <div className="cart-footer">
        {cart.length > 0 && (
          <>
            <div className="totals">
              <div className="total-row">
                <span>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="total-row total-row--discount">
                  <span>Descuento</span>
                  <span>- {fmt(discount)}</span>
                </div>
              )}
              <div className="total-row total-row--main">
                <span>Total</span>
                <span className="total-value">{fmt(total)}</span>
              </div>
            </div>

            <div className="payment-buttons">
              <button className="pay-btn-main" onClick={() => setShowPayment(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Cobrar
              </button>
            </div>
          </>
        )}
      </div>

      {showPayment && (
        <PaymentModal
          cart={cart}
          total={total}
          onClose={() => setShowPayment(false)}
          onSuccess={handleSuccess}
        />
      )}

      {receipt && (
        <Receipt receipt={receipt} onClose={() => setReceipt(null)} />
      )}

      <style>{`
        .cart-panel {
          width: 360px;
          min-width: 360px;
          display: flex;
          flex-direction: column;
          background: var(--bg-surface);
          overflow: hidden;
        }

        /* Header */
        .cart-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px 12px;
          border-bottom: 1px solid var(--border);
          gap: 8px;
        }

        .hold-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 7px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .hold-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-glow);
        }

        .holds-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: var(--accent-glow);
          border: 1px solid rgba(240,180,41,0.35);
          border-radius: 7px;
          color: var(--accent);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .holds-badge:hover { background: rgba(240,180,41,0.25); }

        .cart-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-syne, sans-serif);
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .cart-count {
          min-width: 20px;
          height: 20px;
          border-radius: 10px;
          background: var(--accent);
          color: #0D0D12;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
        }

        .clear-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-muted);
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 5px 8px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .clear-btn:hover { color: var(--danger, #EF4444); border-color: rgba(239,68,68,0.4); background: var(--danger-dim, rgba(239,68,68,0.08)); }

        .custom-item-btn {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600;
          color: var(--accent);
          background: transparent;
          border: 1px solid rgba(240,180,41,0.35);
          border-radius: 6px; padding: 5px 8px;
          cursor: pointer; transition: all 0.15s;
        }
        .custom-item-btn:hover { background: var(--accent-glow); border-color: rgba(240,180,41,0.6); }

        .void-btn {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600;
          color: var(--danger, #EF4444);
          background: transparent;
          border: 1px solid rgba(239,68,68,0.35);
          border-radius: 6px; padding: 5px 8px;
          cursor: pointer; transition: all 0.15s;
        }
        .void-btn:hover { background: var(--danger-dim, rgba(239,68,68,0.08)); border-color: rgba(239,68,68,0.6); }

        /* Success */
        .success-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(34,197,94,0.1);
          border-bottom: 1px solid rgba(34,197,94,0.2);
          font-size: 13px;
          color: var(--success, #22C55E);
        }

        /* Items */
        .cart-items {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .empty-cart {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 200px;
          color: var(--text-muted);
          text-align: center;
        }

        .empty-cart p { font-size: 13px; line-height: 1.6; }

        .cart-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 8px;
          border-bottom: 1px solid var(--border);
        }

        .item-info { flex: 1; min-width: 0; }

        .item-name {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-flavor {
          display: block;
          font-size: 11px;
          color: var(--accent);
        }

        .item-price-row {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 1px;
        }

        .item-price-unit {
          font-size: 10px;
          color: var(--text-muted);
          font-family: var(--font-jetbrains, monospace);
          cursor: default;
          user-select: none;
        }
        .item-price-unit--custom {
          color: var(--accent);
        }

        .price-toggle-btn {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.1s;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          line-height: 1.5;
          flex-shrink: 0;
        }
        .price-toggle-btn:hover { border-color: var(--accent); color: var(--accent); }
        .price-toggle-btn--active {
          background: var(--accent-glow);
          border-color: rgba(240,180,41,0.4);
          color: var(--accent);
        }

        .price-edit-input {
          flex: 1;
          min-width: 0;
          font-size: 15px;
          font-weight: 700;
          font-family: var(--font-jetbrains, monospace);
          color: var(--text-primary);
          background: var(--bg-input);
          border: 1px solid var(--accent);
          border-radius: 6px;
          padding: 4px 8px;
          outline: none;
          box-shadow: 0 0 0 2px var(--accent-glow);
        }

        .item-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .qty-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-hover);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .qty-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .qty-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .qty-value {
          font-family: var(--font-jetbrains, monospace);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          min-width: 20px;
          text-align: center;
        }

        .item-subtotal {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          flex-shrink: 0;
        }

        .item-subtotal span {
          font-family: var(--font-jetbrains, monospace);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .remove-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .remove-btn:hover { color: var(--danger, #EF4444); }

        /* Footer */
        .cart-footer {
          border-top: 1px solid var(--border);
          padding: 14px 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .totals {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .total-row span:last-child {
          font-family: var(--font-jetbrains, monospace);
        }

        .total-row--discount { color: var(--success, #22C55E); }

        .total-row--main {
          padding-top: 8px;
          border-top: 1px solid var(--border);
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .total-value {
          font-family: var(--font-jetbrains, monospace) !important;
          font-size: 20px !important;
          color: var(--accent) !important;
        }

        /* Payment */
        .payment-buttons { display: flex; }

        .pay-btn-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          border-radius: 10px;
          border: none;
          background: var(--accent);
          color: #0D0D12;
          font-size: 15px;
          font-weight: 800;
          font-family: var(--font-syne, sans-serif);
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.04em;
        }

        .pay-btn-main:hover {
          background: #F5C233;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(240,180,41,0.3);
        }
      `}</style>
    </div>
  )
}
