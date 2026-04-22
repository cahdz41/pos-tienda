'use client'

import { useState } from 'react'
import type { CartItem, ProductVariant } from '@/types'

interface Props {
  cart: CartItem[]
  onAdd: (variant: ProductVariant) => void
  onRemoveOne: (variantId: string) => void
  onRemoveAll: (variantId: string) => void
  onClear: () => void
  onPay: () => void
  onToggleWholesale: (variantId: string) => void
  onPriceChange: (variantId: string, price: number) => void
  onHold: () => void
  onShowHolds: () => void
  heldCount: number
  onVoid: () => void
}

export default function CartPanel({
  cart,
  onAdd,
  onRemoveOne,
  onRemoveAll,
  onClear,
  onPay,
  onToggleWholesale,
  onPriceChange,
  onHold,
  onShowHolds,
  heldCount,
  onVoid,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  function confirmEdit(variantId: string) {
    const n = parseFloat(editValue)
    if (!isNaN(n) && n >= 0) onPriceChange(variantId, n)
    setEditingId(null)
  }

  return (
    <div
      className="w-[420px] shrink-0 flex flex-col h-full"
      style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Carrito</h2>
            {itemCount > 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Anular venta anterior */}
            <button
              onClick={onVoid}
              className="px-2 py-1 rounded text-xs font-semibold"
              style={{ background: '#2D1010', color: '#FF6B6B' }}
              title="Anular venta"
            >
              Anular
            </button>
            {/* Vaciar carrito actual */}
            {cart.length > 0 && (
              <button
                onClick={onClear}
                className="px-2 py-1 rounded text-xs font-semibold"
                style={{ color: '#FF6B6B', background: '#2D1010' }}
              >
                Vaciar
              </button>
            )}
          </div>
        </div>

        {/* Barra de tickets en espera */}
        {heldCount > 0 && (
          <button
            onClick={onShowHolds}
            className="mt-2 w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
          >
            <span>⏸ {heldCount} ticket{heldCount > 1 ? 's' : ''} en espera</span>
            <span style={{ opacity: 0.7 }}>Ver →</span>
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span style={{ fontSize: '32px' }}>🛒</span>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Agrega productos al carrito
            </p>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1">
            {cart.map(item => {
              const hasWholesale = item.variant.wholesale_price !== item.variant.sale_price
              return (
                <div
                  key={item.variant.id}
                  className="rounded-lg p-2.5"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                >
                  {/* Nombre */}
                  <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                    {item.variant.product?.name}
                    {item.variant.flavor ? ` — ${item.variant.flavor}` : ''}
                  </p>

                  {/* Precio unitario + toggle mayoreo */}
                  <div className="flex items-center gap-1.5 mt-1">
                    {editingId === item.variant.id ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          type="number"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            e.stopPropagation()
                            if (e.key === 'Enter')  confirmEdit(item.variant.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-28 rounded px-2 py-1 outline-none"
                          style={{ background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '15px', fontWeight: 700 }}
                        />
                        <button
                          onMouseDown={e => { e.preventDefault(); confirmEdit(item.variant.id) }}
                          className="font-bold rounded px-2 py-1 leading-none"
                          style={{ background: 'var(--accent)', color: '#000', fontSize: '14px' }}
                          title="Confirmar precio"
                        >✓</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                          ${item.unitPrice.toLocaleString('es-MX')} c/u
                        </p>
                        <button
                          onClick={e => { e.stopPropagation(); setEditingId(item.variant.id); setEditValue(String(item.unitPrice)) }}
                          style={{
                            width: '26px', height: '26px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '6px', fontSize: '14px',
                            color: 'var(--accent)',
                            background: 'rgba(240,180,41,0.12)',
                            border: '1px solid rgba(240,180,41,0.3)',
                            cursor: 'pointer',
                          }}
                          title="Editar precio"
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                    {hasWholesale && (
                      <button
                        onClick={() => onToggleWholesale(item.variant.id)}
                        className="px-1.5 py-0.5 rounded text-xs font-bold leading-none"
                        style={{
                          background: item.useWholesale ? 'var(--accent)' : 'var(--bg)',
                          color: item.useWholesale ? '#000' : 'var(--text-muted)',
                          border: `1px solid ${item.useWholesale ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                        title={item.useWholesale ? 'Precio mayoreo activo' : 'Cambiar a precio mayoreo'}
                      >
                        May
                      </button>
                    )}
                  </div>

                  {/* Controles cantidad + subtotal */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onRemoveOne(item.variant.id)}
                        className="w-8 h-8 rounded flex items-center justify-center font-bold"
                        style={{ background: 'var(--border)', color: 'var(--text)', fontSize: '18px' }}
                      >
                        −
                      </button>
                      <span
                        className="w-8 text-center font-bold"
                        style={{ color: 'var(--text)', fontSize: '16px' }}
                      >
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onAdd(item.variant)}
                        className="w-8 h-8 rounded flex items-center justify-center font-bold"
                        style={{ background: 'var(--border)', color: 'var(--text)', fontSize: '18px' }}
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-bold" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
                        ${(item.unitPrice * item.quantity).toLocaleString('es-MX')}
                      </span>
                      <button
                        onClick={() => onRemoveAll(item.variant.id)}
                        className="w-5 h-5 rounded flex items-center justify-center text-xs"
                        style={{ color: '#FF6B6B', background: '#2D1010' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Total + botones acción */}
      <div
        className="p-3 shrink-0 flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Total</span>
          <span className="text-xl font-black" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
            ${total.toLocaleString('es-MX')}
          </span>
        </div>

        <button
          onClick={onPay}
          disabled={cart.length === 0}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          Cobrar ${total.toLocaleString('es-MX')}
        </button>

        {/* Poner en espera */}
        {cart.length > 0 && (
          <button
            onClick={onHold}
            className="w-full py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ⏸ Poner en espera
          </button>
        )}
      </div>
    </div>
  )
}
