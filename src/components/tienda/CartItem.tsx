'use client'

import { useStoreCart, type StoreCartItem } from '@/contexts/StoreCartContext'

interface Props {
  item: StoreCartItem
  isFirstInPackage?: boolean
}

export default function CartItem({ item, isFirstInPackage }: Props) {
  const { updateQuantity, removeItem } = useStoreCart()

  const btnStyle: React.CSSProperties = {
    width: '28px', height: '28px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1A1A1A', border: '1px solid #2A2A2A',
    borderRadius: '6px', color: '#FFFFFF', cursor: 'pointer',
    fontSize: '16px', lineHeight: 1, flexShrink: 0,
  }

  const showOriginalPrice = item.originalPrice && item.originalPrice !== item.price
  const isOffer = !!item.offerId
  const isPackage = !!item.packageId

  return (
    <div style={{
      display: 'flex', gap: '12px',
      padding: '12px',
      background: isFirstInPackage ? 'rgba(251,191,36,0.04)' : '#0D0D0D',
      border: '1px solid',
      borderColor: isFirstInPackage ? 'rgba(251,191,36,0.2)' : '#1A1A1A',
      borderRadius: '10px',
    }}>
      {/* Imagen */}
      <div style={{
        width: '60px', height: '60px', flexShrink: 0,
        background: '#1A1A1A', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontWeight: 800, fontSize: '22px', color: '#2A2A2A', fontFamily: 'var(--font-syne, system-ui)' }}>
            {item.productName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
          {isOffer && (
            <span style={{
              fontSize: '9px', fontWeight: 800,
              background: 'rgba(220,38,38,0.15)', color: '#ff5050',
              padding: '2px 8px', borderRadius: 10,
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Oferta
            </span>
          )}
          {isPackage && isFirstInPackage && item.packageName && (
            <span style={{
              fontSize: '9px', fontWeight: 800,
              background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
              padding: '2px 8px', borderRadius: 10,
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              {item.packageName}
            </span>
          )}
        </div>

        <p style={{ fontSize: '13px', fontWeight: 600, color: '#CCCCCC', margin: '0 0 2px', lineHeight: 1.3 }}>
          {item.productName}
        </p>
        {item.flavor && (
          <p style={{ fontSize: '11px', color: '#555555', margin: '0 0 8px' }}>{item.flavor}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Controles de cantidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isPackage && (
              <>
                <button style={btnStyle} onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>−</button>
                <span style={{ fontSize: '13px', color: '#FFFFFF', minWidth: '18px', textAlign: 'center' }}>
                  {item.quantity}
                </span>
                <button style={btnStyle} onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button>
              </>
            )}
            {isPackage && (
              <span style={{ fontSize: '12px', color: '#888888' }}>
                Cantidad fija
              </span>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            {showOriginalPrice && (
              <span style={{
                display: 'block',
                fontSize: '11px', color: 'rgba(255,255,255,0.3)',
                textDecoration: 'line-through',
              }}>
                ${(item.originalPrice! * item.quantity).toFixed(2)}
              </span>
            )}
            <span style={{
              fontFamily: 'var(--font-syne, system-ui)',
              fontWeight: 700, fontSize: '15px', color: '#F0B429',
            }}>
              ${(item.price * item.quantity).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Eliminar */}
      <button
        onClick={() => removeItem(item.variantId)}
        style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#333333', cursor: 'pointer', fontSize: '18px', padding: '0', lineHeight: 1 }}
        title={isPackage ? 'Eliminar todo el paquete' : 'Eliminar'}
      >
        ×
      </button>
    </div>
  )
}
