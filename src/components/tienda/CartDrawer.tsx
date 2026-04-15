'use client'

import { useStoreCart } from '@/contexts/StoreCartContext'
import CartItem from './CartItem'

export default function CartDrawer() {
  const { items, total, itemCount, isOpen, closeCart } = useStoreCart()

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeCart}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 100,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: '400px',
        maxWidth: '92vw',
        background: '#111111',
        borderLeft: '1px solid #1A1A1A',
        zIndex: 101,
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid #1A1A1A',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-syne, system-ui)',
              fontWeight: 800, fontSize: '18px',
              color: '#FFFFFF', margin: 0, letterSpacing: '-0.5px',
            }}>
              Carrito
            </h2>
            {itemCount > 0 && (
              <p style={{ fontSize: '12px', color: '#555555', margin: '2px 0 0' }}>
                {itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}
              </p>
            )}
          </div>
          <button
            onClick={closeCart}
            style={{
              width: '36px', height: '36px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid #222222',
              borderRadius: '8px', color: '#666666', cursor: 'pointer', fontSize: '16px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {items.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '220px', gap: '12px',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A2A2A" strokeWidth="1.5">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61H19a2 2 0 001.98-1.61L23 6H6"/>
              </svg>
              <p style={{ color: '#333333', fontSize: '14px', margin: 0 }}>Tu carrito está vacío</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map(item => <CartItem key={item.variantId} item={item} />)}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{ padding: '20px 24px', borderTop: '1px solid #1A1A1A', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <span style={{ fontSize: '14px', color: '#555555' }}>Total</span>
              <span style={{
                fontFamily: 'var(--font-syne, system-ui)',
                fontWeight: 800, fontSize: '24px', color: '#F0B429',
              }}>
                ${total.toFixed(2)}
              </span>
            </div>
            <a
              href="/tienda/carrito"
              onClick={closeCart}
              style={{
                display: 'block', width: '100%', padding: '15px',
                background: '#F0B429', borderRadius: '10px',
                color: '#000000', fontSize: '14px', fontWeight: 700,
                fontFamily: 'var(--font-syne, system-ui)',
                textAlign: 'center', textDecoration: 'none', letterSpacing: '0.05em',
                boxSizing: 'border-box',
              }}
            >
              IR AL CHECKOUT →
            </a>
          </div>
        )}
      </div>
    </>
  )
}
