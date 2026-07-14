'use client'

import Link from 'next/link'
import type { StoreProduct, Offer } from '@/types'
import { cldUrl } from '@/lib/cloudinary'

interface Props {
  product: StoreProduct
  offersByVariant?: Map<string, Offer>
}

function fmtMXN(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ProductCard({ product, offersByVariant }: Props) {
  const hasFlavors = product.product_variants.some(v => v.flavor !== null)
  const imageUrl = product.image_url ?? product.product_variants[0]?.image_url

  // Precio efectivo por variante considerando ofertas activas (item #3 auditoría).
  let bestEff = Infinity
  let bestList = Infinity
  let onOffer = false
  for (const v of product.product_variants) {
    const offer = offersByVariant?.get(v.id)
    const eff = offer ? offer.precio_oferta : v.sale_price
    if (eff < bestEff) {
      bestEff = eff
      bestList = offer ? offer.precio_lista : v.sale_price
      onOffer = !!offer && offer.precio_oferta < offer.precio_lista
    }
  }
  const pct = onOffer && bestList > bestEff
    ? Math.round(((bestList - bestEff) / bestList) * 100)
    : 0

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
              src={cldUrl(imageUrl, { width: 400 })}
              alt={product.name}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px', transition: 'transform 0.4s' }}
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

          {/* Badge descuento (item #3) */}
          {pct > 0 && (
            <span style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: '#dc2626',
              color: '#fff',
              borderRadius: '6px',
              padding: '4px 9px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.02em',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}>
              -{pct}%
            </span>
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
              {product.product_variants.length} {product.product_variants.length === 1 ? 'sabor' : 'sabores'}
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

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
            {hasFlavors && (
              <span style={{ fontSize: '11px', color: '#3A3A3A', fontWeight: 500 }}>desde</span>
            )}
            {pct > 0 && (
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>
                {fmtMXN(bestList)}
              </span>
            )}
            <span style={{
              fontSize: '20px',
              fontWeight: 800,
              color: pct > 0 ? '#ff4040' : '#F0B429',
              fontFamily: 'var(--font-syne, system-ui)',
              letterSpacing: '-0.5px',
            }}>
              {fmtMXN(bestEff)}
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}
