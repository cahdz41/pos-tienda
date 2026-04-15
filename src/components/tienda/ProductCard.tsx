'use client'

import Link from 'next/link'
import type { StoreProduct } from '@/types'

interface Props {
  product: StoreProduct
}

export default function ProductCard({ product }: Props) {
  const minPrice = Math.min(...product.product_variants.map(v => v.sale_price))
  const hasFlavors = product.product_variants.some(v => v.flavor !== null)
  const imageUrl = product.image_url ?? product.product_variants[0]?.image_url

  return (
    <Link href={`/tienda/productos/${product.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          background: '#111111',
          border: '1px solid #1A1A1A',
          borderRadius: '12px',
          overflow: 'hidden',
          transition: 'border-color 0.2s, transform 0.2s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = '#F0B429'
          el.style.transform = 'translateY(-3px)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = '#1A1A1A'
          el.style.transform = 'translateY(0)'
        }}
      >
        {/* Imagen o placeholder */}
        <div style={{
          aspectRatio: '1',
          background: '#0D0D0D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {imageUrl ? (
            <img src={imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{
              fontFamily: 'var(--font-syne, system-ui)',
              fontWeight: 800,
              fontSize: '64px',
              color: '#1E1E1E',
              userSelect: 'none',
            }}>
              {product.name.charAt(0).toUpperCase()}
            </span>
          )}
          {product.category && (
            <span style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              background: 'rgba(0,0,0,0.75)',
              border: '1px solid #2A2A2A',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '10px',
              color: '#666666',
              fontWeight: 500,
              backdropFilter: 'blur(4px)',
            }}>
              {product.category}
            </span>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '14px 16px 16px' }}>
          <p style={{
            margin: '0 0 10px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#DDDDDD',
            lineHeight: 1.35,
          }}>
            {product.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: '17px',
              fontWeight: 700,
              color: '#F0B429',
              fontFamily: 'var(--font-syne, system-ui)',
            }}>
              {hasFlavors ? 'desde ' : ''}${minPrice.toFixed(2)}
            </span>
            {hasFlavors && (
              <span style={{ fontSize: '11px', color: '#3A3A3A' }}>
                {product.product_variants.length} sabores
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
