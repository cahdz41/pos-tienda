'use client'

import type { CartItem, ProductVariant } from '@/types'

interface Props {
  cart: CartItem[]
  onAdd: (variant: ProductVariant) => void
  onRemoveOne: (variantId: number) => void
  onRemoveAll: (variantId: number) => void
  onClear: () => void
  onPay: () => void
}

export default function CartPanel({
  cart,
  onAdd,
  onRemoveOne,
  onRemoveAll,
  onClear,
  onPay,
}: Props) {
  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div
      className="w-72 shrink-0 flex flex-col h-full"
      style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Carrito
          </h2>
          {itemCount > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
            </p>
          )}
        </div>
        {cart.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs px-2 py-1 rounded"
            style={{ color: '#FF6B6B', background: '#2D1010' }}
          >
            Vaciar
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
            {cart.map(item => (
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

                {/* Precio unitario */}
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  ${item.unitPrice.toLocaleString('es-MX')} c/u
                </p>

                {/* Controles cantidad + subtotal */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onRemoveOne(item.variant.id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
                      style={{ background: 'var(--border)', color: 'var(--text)' }}
                    >
                      −
                    </button>
                    <span
                      className="w-7 text-center text-sm font-bold"
                      style={{ color: 'var(--text)' }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onAdd(item.variant)}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
                      style={{ background: 'var(--border)', color: 'var(--text)' }}
                    >
                      +
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
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
            ))}
          </div>
        )}
      </div>

      {/* Total + botón pagar */}
      <div
        className="p-3 shrink-0 flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            Total
          </span>
          <span
            className="text-xl font-black"
            style={{ color: 'var(--accent)', fontFamily: 'monospace' }}
          >
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
      </div>
    </div>
  )
}
