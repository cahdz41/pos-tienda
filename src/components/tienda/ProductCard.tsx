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
      <article
        style={{
          background: '#0D0D0D',
          border: '1px solid #161616',
          borderRadius: '16px',
          overflow: 'hidden',
          transition: 'border-color 0.25s, transform 0.25s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = '#2A2000'
          el.style.transform = 'translateY(-4px)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = '#161616'
          el.style.transform = 'translateY(0)'
        }}
      >
        {/* Imagen */}
        <div style={{
          aspectRatio: '4/5',
          background: '#111111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
            />
          ) : (
            <>
              {/* Placeholder premium */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at center, #1A1200 0%, #0A0A0A 100%)',
              }} />
              <span style={{
                position: 'relative',
                fontFamily: 'var(--font-syne, system-ui)',
                fontWeight: 800,
                fontSize: '80px',
                color: '#1E1800',
                userSelect: 'none',
                letterSpacing: '-4px',
              }}>
                {product.name.charAt(0).toUpperCase()}
              </span>
            </>
          )}

          {/* Badge categoría */}
          {product.category && (
            <span style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              background: 'rgba(0,0,0,0.8)',
              border: '1px solid #1E1E1E',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '10px',
              color: '#555555',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              backdropFilter: 'blur(8px)',
            }}>
              {product.category}
            </span>
          )}

          {/* Badge sabores */}
          {hasFlavors && (
            <span style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              background: 'rgba(240,180,41,0.12)',
              border: '1px solid rgba(240,180,41,0.2)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '10px',
              color: '#F0B429',
              fontWeight: 600,
            }}>
              {product.product_variants.length} sabores
            </span>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '16px 18px 20px' }}>
          <p style={{
            margin: '0 0 12px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#CCCCCC',
            lineHeight: 1.3,
            fontFamily: 'var(--font-dm-sans, system-ui)',
          }}>
            {product.name}
          </p>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            {hasFlavors && (
              <span style={{ fontSize: '11px', color: '#3A3A3A', fontWeight: 500 }}>desde</span>
            )}
            <span style={{
              fontSize: '20px',
              fontWeight: 800,
              color: '#F0B429',
              fontFamily: 'var(--font-syne, system-ui)',
              letterSpacing: '-0.5px',
            }}>
              ${minPrice.toFixed(2)}
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}
