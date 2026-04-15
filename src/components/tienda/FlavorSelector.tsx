'use client'

import { useState } from 'react'
import { useStoreCart } from '@/contexts/StoreCartContext'
import type { StoreVariant } from '@/types'

interface Props {
  variants: StoreVariant[]
  productId: string
  productName: string
}

export default function FlavorSelector({ variants, productId, productName }: Props) {
  const [selected, setSelected] = useState<StoreVariant>(variants[0])
  const [added, setAdded] = useState(false)
  const { addItem } = useStoreCart()
  const hasFlavors = variants.some(v => v.flavor !== null)

  function handleAddToCart() {
    addItem({
      variantId: selected.id,
      productId,
      productName,
      flavor: selected.flavor,
      price: selected.sale_price,
      imageUrl: selected.image_url,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div>
      {hasFlavors && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{
            fontSize: '11px', color: '#555555',
            textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px',
          }}>
            Sabor
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {variants.map(v => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid',
                  borderColor: selected.id === v.id ? '#F0B429' : '#2A2A2A',
                  background: selected.id === v.id ? 'rgba(240,180,41,0.08)' : 'transparent',
                  color: selected.id === v.id ? '#F0B429' : '#888888',
                  fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {v.flavor}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <span style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontWeight: 700, fontSize: '36px', color: '#F0B429',
        }}>
          ${selected.sale_price.toFixed(2)}
        </span>
        <span style={{ fontSize: '13px', color: '#444444', marginLeft: '8px' }}>MXN</span>
      </div>

      <div style={{ marginBottom: '32px' }}>
        {selected.stock > 10 ? (
          <span style={{ fontSize: '13px', color: '#4CAF50' }}>● En stock</span>
        ) : (
          <span style={{ fontSize: '13px', color: '#F0B429' }}>● Últimas {selected.stock} unidades</span>
        )}
      </div>

      <button
        onClick={handleAddToCart}
        style={{
          width: '100%', padding: '16px',
          background: added ? '#1A3A1A' : '#F0B429',
          border: added ? '1px solid #2D5A2D' : 'none',
          borderRadius: '10px',
          color: added ? '#4CAF50' : '#000000',
          fontSize: '15px', fontWeight: 700,
          fontFamily: 'var(--font-syne, system-ui)',
          cursor: 'pointer', transition: 'all 0.2s',
          letterSpacing: '0.03em',
        }}
      >
        {added ? '✓ Agregado al carrito' : 'Agregar al carrito'}
      </button>
    </div>
  )
}
